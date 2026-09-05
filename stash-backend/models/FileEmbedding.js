const mongoose = require('mongoose');

const fileEmbeddingSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  embedding: { type: [Number], required: true }, // Array of 512 floats (CLIP) or text vector floats
  embeddingType: { type: String, enum: ['image', 'text'], required: true },
  extractedText: { type: String, default: '' },
  model: { type: String, default: 'Xenova/clip-vit-base-patch32' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FileEmbedding', fileEmbeddingSchema);
