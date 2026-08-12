require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const { Readable } = require('stream');
const File = require('./models/File');

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

// 3. STREAM FILE CONTENT INLINE (for images, videos, pdfs, audio)
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

// 4. DOWNLOAD FILE (WITH ATTACHMENT HEADER)
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

// 7. PERMANENTLY DELETE FILE (FROM GRIDFS & METADATA)
app.delete('/files/:id', async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.id);
    
    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found in database' });
    }

    // Delete chunk data from GridFS bucket
    if (gridfsBucket && fileDoc.gridFsFileId) {
      try {
        await gridfsBucket.delete(new mongoose.Types.ObjectId(fileDoc.gridFsFileId));
      } catch (gridFsErr) {
        console.warn('GridFS deletion warning:', gridFsErr.message);
      }
    }

    // Delete metadata document from MongoDB
    await File.findByIdAndDelete(req.params.id);

    res.json({ message: 'File shredded successfully from MongoDB GridFS vault' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.listen(PORT, () => {
  console.log(`Vault Manager is listening securely on http://localhost:${PORT}`);
});