const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, default: '' },
  role: { type: String, required: true, default: 'comercial' },
  passwordHash: { type: String, required: true },
  salt: { type: String, required: true },
  status: { type: String, default: 'activo' }, // 'activo', 'inactivo'
  phone: { type: String, default: '' },
  lastLogin: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
