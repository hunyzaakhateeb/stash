require('dotenv').config();
const mongoose = require('mongoose');

async function clearDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB Atlas!');

    const db = mongoose.connection.db;

    // 1. Clear Mongoose collections
    console.log('🧹 Purging metadata collections...');
    await db.collection('files').deleteMany({});
    await db.collection('folders').deleteMany({});
    await db.collection('users').deleteMany({});
    await db.collection('otps').deleteMany({});

    // 2. Drop GridFS buckets if they exist
    console.log('📦 Purging GridFS buckets (uploads.files and uploads.chunks)...');
    try {
      await db.collection('uploads.files').drop();
    } catch (e) {
      // Ignored if collection does not exist
    }
    try {
      await db.collection('uploads.chunks').drop();
    } catch (e) {
      // Ignored if collection does not exist
    }

    console.log('\n✨ DATABASE PURGE COMPLETE! All files, chunks, folders, users, and OTPs have been cleared.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database purge failed:', error);
    process.exit(1);
  }
}

clearDatabase();
