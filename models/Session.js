const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  expiresAt: { type: Number, required: true }
});
module.exports = mongoose.model('Session', schema);
