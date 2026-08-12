require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const { Readable } = require('stream');
const File = require('./models/File');
const Folder = require('./models/Folder');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: '*' }));
app.use(express.json());

// 1. Multer setup with memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB max file size
});

// 2. Connect to MongoDB Atlas and initialize GridFS Bucket
let gridfsBucket;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('🔥 MongoDB Engine Online!');
    gridfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'uploads'
    });
    console.log('📦 GridFS Storage Vault Initialized!');
  })
  .catch(err => console.error('CRITICAL: MongoDB connection failed:', err));

// Helper to determine file category
function determineFileType(mimetype, filename) {
  if (!mimetype && filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'mkv', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg'].includes(ext)) return 'audio';
    if (['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx'].includes(ext)) return 'document';
  }
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.includes('pdf') || mimetype.includes('word') || mimetype.includes('text') || mimetype.includes('sheet')) return 'document';
  return 'other';
}

// Helper to format byte size
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// --- ROUTES ---

// Health Check
app.get('/', (req, res) => {
  res.send('Stash Vault Manager (GridFS Edition) is officially awake! ☁️');
});

// 1. UPLOAD FILE(S) TO MONGODB GRIDFS
app.post('/upload', upload.any(), async (req, res) => {
  try {
    const filesToUpload = req.files || (req.file ? [req.file] : []);
    if (filesToUpload.length === 0) return res.status(400).json({ error: 'No file provided.' });
    if (!gridfsBucket) return res.status(500).json({ error: 'GridFS storage bucket not ready.' });

    const targetFolderId = req.body.folderId || null;
    const host = req.get('host');
    const protocol = req.protocol;
    const uploadedDocs = [];

    for (const file of filesToUpload) {
      const originalname = file.originalname;
      const mimeType = file.mimetype || 'application/octet-stream';
      const storageName = Date.now() + '-' + originalname;

      const uploadStream = gridfsBucket.openUploadStream(storageName, {
        contentType: mimeType
      });

      const readableStream = Readable.from(file.buffer);
      readableStream.pipe(uploadStream);

      await new Promise((resolve, reject) => {
        uploadStream.on('error', (err) => {
          console.error('GridFS Upload Error:', err);
          reject(err);
        });

        uploadStream.on('finish', async () => {
          try {
            const newFile = new File({
              gridFsFileId: uploadStream.id,
              name: storageName,
              displayName: originalname,
              size: formatBytes(file.size),
              type: determineFileType(mimeType, originalname),
              mimeType: mimeType,
              isFavorite: false,
              isTrashed: false,
              folderId: targetFolderId ? new mongoose.Types.ObjectId(targetFolderId) : null
            });

            await newFile.save();

            const fileUrl = `${protocol}://${host}/files/raw/${newFile._id}`;
            const downloadUrl = `${protocol}://${host}/files/download/${newFile._id}`;

            uploadedDocs.push({
              ...newFile.toObject(),
              url: fileUrl,
              downloadUrl: downloadUrl
            });
            resolve();
          } catch (saveErr) {
            reject(saveErr);
          }
        });
      });
    }

    res.status(201).json({
      message: `${uploadedDocs.length} file(s) stashed securely in MongoDB GridFS!`,
      files: uploadedDocs,
      file: uploadedDocs[0]
    });
  } catch (error) {
    console.error('Upload handler error:', error);
    res.status(500).json({ error: 'GridFS upload failed' });
  }
});

// 2. FETCH ALL FILES FROM MONGODB
app.get('/files', async (req, res) => {
  try {
    const files = await File.find().sort({ createdAt: -1 });
    const host = req.get('host');
    const protocol = req.protocol;

    const filesWithUrls = files.map(file => {
      const fileObj = file.toObject();
      return {
        ...fileObj,
        url: `${protocol}://${host}/files/raw/${file._id}`,
        downloadUrl: `${protocol}://${host}/files/download/${file._id}`
      };
    });

    res.json(filesWithUrls);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Unable to scan database vault' });
  }
});

// 3. STREAM FILE CONTENT INLINE
app.get('/files/raw/:id', async (req, res) => {
  try {
    if (!gridfsBucket) return res.status(500).json({ error: 'GridFS bucket not ready' });

    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) return res.status(404).json({ error: 'File metadata not found' });

    res.set('Content-Type', fileDoc.mimeType || 'application/octet-stream');
    res.set('Accept-Ranges', 'bytes');

    const downloadStream = gridfsBucket.openDownloadStream(new mongoose.Types.ObjectId(fileDoc.gridFsFileId));

    downloadStream.on('error', (err) => {
      console.error('GridFS stream error:', err);
      if (!res.headersSent) {
        res.status(404).json({ error: 'File binary not found in GridFS' });
      }
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error('Stream file error:', error);
    res.status(500).json({ error: 'Failed to stream file' });
  }
});

// 4. DOWNLOAD FILE (ATTACHMENT HEADER)
app.get('/files/download/:id', async (req, res) => {
  try {
    if (!gridfsBucket) return res.status(500).json({ error: 'GridFS bucket not ready' });

    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) return res.status(404).json({ error: 'File metadata not found' });

    res.set('Content-Type', fileDoc.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileDoc.displayName)}"`);

    const downloadStream = gridfsBucket.openDownloadStream(new mongoose.Types.ObjectId(fileDoc.gridFsFileId));

    downloadStream.on('error', (err) => {
      console.error('GridFS download stream error:', err);
      if (!res.headersSent) {
        res.status(404).json({ error: 'File binary not found in GridFS' });
      }
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// 5. TOGGLE FAVORITE STATUS
app.patch('/files/:id/favorite', async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) return res.status(404).json({ error: 'File not found' });

    fileDoc.isFavorite = !fileDoc.isFavorite;
    await fileDoc.save();

    res.json({ message: 'Favorite status updated', isFavorite: fileDoc.isFavorite });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).json({ error: 'Failed to toggle favorite status' });
  }
});

// 6. MOVE TO TRASH / RESTORE FROM TRASH
app.patch('/files/:id/trash', async (req, res) => {
  try {
    const { isTrashed } = req.body;
    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) return res.status(404).json({ error: 'File not found' });

    fileDoc.isTrashed = typeof isTrashed === 'boolean' ? isTrashed : !fileDoc.isTrashed;
    await fileDoc.save();

    res.json({ message: 'Trash status updated', isTrashed: fileDoc.isTrashed });
  } catch (error) {
    console.error('Error updating trash status:', error);
    res.status(500).json({ error: 'Failed to update trash status' });
  }
});

// 7. SHIFT / MOVE FILE TO A FOLDER (OR ROOT)
app.patch('/files/:id/move', async (req, res) => {
  try {
    const { folderId } = req.body;
    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) return res.status(404).json({ error: 'File not found' });

    fileDoc.folderId = folderId ? new mongoose.Types.ObjectId(folderId) : null;
    await fileDoc.save();

    res.json({ message: 'File moved successfully', file: fileDoc });
  } catch (error) {
    console.error('Error moving file:', error);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// 8. PERMANENTLY DELETE FILE
app.delete('/files/:id', async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.id);
    
    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found in database' });
    }

    if (gridfsBucket && fileDoc.gridFsFileId) {
      try {
        await gridfsBucket.delete(new mongoose.Types.ObjectId(fileDoc.gridFsFileId));
      } catch (gridFsErr) {
        console.warn('GridFS deletion warning:', gridFsErr.message);
      }
    }

    await File.findByIdAndDelete(req.params.id);

    res.json({ message: 'File shredded successfully from MongoDB GridFS vault' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// --- FOLDER ROUTES ---

// 9. CREATE A NEW FOLDER
app.post('/folders', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required.' });
    }

    const folder = new Folder({
      name: name.trim(),
      color: color || '#00f2fe'
    });

    await folder.save();
    res.status(201).json({ message: 'Folder created successfully', folder });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// 10. GET ALL FOLDERS WITH FILE STATS
app.get('/folders', async (req, res) => {
  try {
    const folders = await Folder.find().sort({ createdAt: -1 });
    const allFiles = await File.find({ isTrashed: false });

    const foldersWithStats = folders.map(folder => {
      const folderFiles = allFiles.filter(file => file.folderId && file.folderId.toString() === folder._id.toString());
      return {
        ...folder.toObject(),
        fileCount: folderFiles.length,
      };
    });

    res.json(foldersWithStats);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// 11. DELETE A FOLDER (UNASSIGN FILES TO ROOT)
app.delete('/folders/:id', async (req, res) => {
  try {
    const folderId = req.params.id;
    const folder = await Folder.findByIdAndDelete(folderId);

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Unassign files inside this folder back to root vault
    await File.updateMany({ folderId: new mongoose.Types.ObjectId(folderId) }, { folderId: null });

    res.json({ message: 'Folder deleted and contained files unassigned to root vault' });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

app.listen(PORT, () => {
  console.log(`Vault Manager is listening securely on http://localhost:${PORT}`);
});