require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const { Readable } = require('stream');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const { OAuth2Client } = require('google-auth-library');
const File = require('./models/File');
const Folder = require('./models/Folder');
const User = require('./models/User');
const Otp = require('./models/Otp');

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'stash_secret_key_jwt_2026';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Resend client (for production/Railway — works over HTTPS, not blocked)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Nodemailer fallback (for local development with Gmail SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Unified email sender — uses Resend in production, nodemailer locally
async function sendEmail({ to, subject, html }) {
  if (resend) {
    // Resend API (works on Railway free tier)
    const { error } = await resend.emails.send({
      from: 'Stash Security <onboarding@resend.dev>',
      to,
      subject,
      html
    });
    if (error) throw new Error(error.message);
  } else if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    // Nodemailer (local dev with Gmail)
    await transporter.sendMail({
      from: `"Stash Security" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });
  } else {
    // Terminal fallback
    return null; // signal to print to console
  }
}

// Sanitize duplicate leading slashes in incoming request URLs (e.g., //auth/login -> /auth/login)
app.use((req, res, next) => {
  if (req.url.startsWith('//')) {
    req.url = req.url.replace(/^\/+/, '/');
  }
  next();
});

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin or any vercel.app / localhost origin
    if (!origin || origin.includes('vercel.app') || origin.includes('localhost')) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true
}));
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

// --- AUTH ROUTES ---

// 1. Generate & Send OTP Email (Signup Step 1)
app.post(['/auth/send-otp', '/signup', '/auth/signup'], async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // Generate 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete existing OTPs for this email if any
    await Otp.deleteMany({ email: cleanEmail });

    // Save OTP to collection with 10-minute TTL
    await Otp.create({
      email: cleanEmail,
      otp: generatedOtp
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #0d1117; color: #ffffff; border-radius: 10px;">
        <h2 style="color: #19a7ff;">Stash Email Verification</h2>
        <p>Your 6-digit OTP security code is:</p>
        <h1 style="font-size: 32px; letter-spacing: 6px; color: #19a7ff; background: #161b22; padding: 10px 20px; display: inline-block; border-radius: 8px;">${generatedOtp}</h1>
        <p style="color: #8b949e; font-size: 12px; margin-top: 20px;">This code will expire automatically in 10 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `;

    try {
      const result = await sendEmail({
        to: cleanEmail,
        subject: 'Your Stash Verification Code',
        html: emailHtml
      });
      // null means no email provider configured — log to terminal
      if (result === null) {
        console.log(`\n========================================`);
        console.log(`OTP SECURITY CODE FOR ${cleanEmail}: ${generatedOtp}`);
        console.log(`========================================\n`);
      }
    } catch (mailErr) {
      console.warn('Email send warning:', mailErr.message);
    }

    res.json({ message: 'OTP verification code sent to your email.', email: cleanEmail });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to generate and send OTP code.' });
  }
});

// 2. Verify OTP & Create User Account (Signup Step 2)
app.post(['/auth/verify-otp', '/verify-otp'], async (req, res) => {
  try {
    const { email, otp, username, password } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Please provide email and 6-digit OTP code.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const otpRecord = await Otp.findOne({ email: cleanEmail, otp: otp.trim() });

    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP verification code.' });
    }

    let user = await User.findOne({ email: cleanEmail });
    if (!user) {
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required to complete registration.' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      user = await User.create({
        username: username.trim(),
        email: cleanEmail,
        password: hashedPassword
      });
    }

    // Delete verified OTP record
    await Otp.deleteMany({ email: cleanEmail });

    // Issue JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Email verified and account created successfully!',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP and create account.' });
  }
});

// 3. User Registration Direct Endpoint (Fallback)
app.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Please provide all required fields' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      username: username.trim(),
      email: cleanEmail,
      password: hashedPassword
    });

    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email, username: newUser.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to create user account' });
  }
});

// 2. User Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter email and password' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// 3. Verify Active Session
app.get('/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: { id: user._id, username: user.username, email: user.email, avatar: user.avatar } });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// 4. Google / Gmail OAuth Login
app.post('/auth/google', async (req, res) => {
  try {
    const { credential, email: bodyEmail, name: bodyName, googleId: bodyGoogleId, picture: bodyPicture } = req.body;

    let email = bodyEmail;
    let name = bodyName;
    let googleId = bodyGoogleId;
    let avatar = bodyPicture;

    // If Google credential ID token was sent, verify via Google OAuth or decode
    if (credential) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        email = payload.email;
        name = payload.name || payload.given_name || email.split('@')[0];
        googleId = payload.sub;
        avatar = payload.picture;
      } catch (tokenErr) {
        // Fallback payload decode if backend client ID environment variable is unconfigured
        const decoded = jwt.decode(credential);
        if (decoded && decoded.email) {
          email = decoded.email;
          name = decoded.name || decoded.given_name || email.split('@')[0];
          googleId = decoded.sub;
          avatar = decoded.picture;
        }
      }
    }

    if (!email) {
      return res.status(400).json({ error: 'Failed to verify Google account credentials.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: cleanEmail });

    if (!user) {
      user = await User.create({
        username: name || cleanEmail.split('@')[0],
        email: cleanEmail,
        googleId: googleId || null,
        avatar: avatar || null
      });
    } else if (!user.googleId && googleId) {
      user.googleId = googleId;
      if (avatar) user.avatar = avatar;
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// Optional Auth Middleware for extracting user identity from Bearer token
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      req.userId = decoded.userId;
    } catch (e) {
      // Ignored if invalid token
    }
  }
  next();
});

// --- FILE & VAULT ROUTES ---

// Health Check
app.get('/', (req, res) => {
  res.send('Stash Vault Manager (GridFS Edition) is officially awake! ☁️');
});

// 1. UPLOAD FILE(S) TO MONGODB GRIDFS
app.post('/upload', upload.any(), async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized: Please sign in to access your private vault.' });
    }

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
              folderId: targetFolderId ? new mongoose.Types.ObjectId(targetFolderId) : null,
              userId: new mongoose.Types.ObjectId(req.userId)
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

// 2. FETCH ALL FILES FROM USER WORKSPACE
app.get('/files', async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized: Please sign in to access your vault.' });
    }

    const files = await File.find({ userId: new mongoose.Types.ObjectId(req.userId) }).sort({ createdAt: -1 });
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
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const fileDoc = await File.findOne({ _id: req.params.id, userId: req.userId });
    if (!fileDoc) return res.status(404).json({ error: 'File not found in your workspace' });

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
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const { isTrashed } = req.body;
    const fileDoc = await File.findOne({ _id: req.params.id, userId: req.userId });
    if (!fileDoc) return res.status(404).json({ error: 'File not found in your workspace' });

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
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const { folderId } = req.body;
    const fileDoc = await File.findOne({ _id: req.params.id, userId: req.userId });
    if (!fileDoc) return res.status(404).json({ error: 'File not found in your workspace' });

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
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const fileDoc = await File.findOne({ _id: req.params.id, userId: req.userId });

    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found in your workspace' });
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

// 9. CREATE A NEW FOLDER IN WORKSPACE
app.post('/folders', async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized: Please sign in to create folders.' });
    }

    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required.' });
    }

    const folder = new Folder({
      name: name.trim(),
      color: color || '#00f2fe',
      userId: new mongoose.Types.ObjectId(req.userId)
    });

    await folder.save();
    res.status(201).json({ message: 'Folder created successfully', folder });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// 10. GET ALL WORKSPACE FOLDERS WITH FILE STATS
app.get('/folders', async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized: Please sign in to view folders.' });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.userId);
    const folders = await Folder.find({ userId: userObjectId }).sort({ createdAt: -1 });
    const allFiles = await File.find({ isTrashed: false, userId: userObjectId });

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

// 11. DELETE A FOLDER IN WORKSPACE
app.delete('/folders/:id', async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

    const folderId = req.params.id;
    const folder = await Folder.findOneAndDelete({ _id: folderId, userId: req.userId });

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found in your workspace' });
    }

    // Unassign files inside this folder back to root vault
    await File.updateMany({ folderId: new mongoose.Types.ObjectId(folderId), userId: req.userId }, { folderId: null });

    res.json({ message: 'Folder deleted and contained files unassigned to root vault' });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

app.listen(PORT, () => {
  console.log(`Vault Manager is listening securely on http://localhost:${PORT}`);
});