const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 } // TTL index: automatically expires after 10 minutes (600s)
});

module.exports = mongoose.model('Otp', otpSchema);
