const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  gridFsFileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Reference to GridFS bucket entry
  name: { type: String, required: true },           // Backend storage identifier / filename
  displayName: { type: String, required: true },    // Clean name for the UI
  size: { type: String, required: true },           // Formatted size e.g. "2.4 MB"
  type: { type: String, required: true },           // Category: 'image', 'video', 'audio', 'document', 'other'
  mimeType: { type: String, required: true },       // MIME type e.g. 'image/png', 'application/pdf'
  isFavorite: { type: Boolean, default: false },    // Favorite status flag
  isTrashed: { type: Boolean, default: false },     // Trash status flag
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null }, // Optional folder reference
  createdAt: { type: Date, default: Date.now }      // Upload timestamp
});

module.exports = mongoose.model('File', fileSchema);