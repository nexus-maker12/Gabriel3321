const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  badge: { type: String, default: '' },
  color: { type: String, default: '#d4af37' },
  description: { type: String, default: '' },
  isProtected: { type: Boolean, default: false },
  permissions: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('Role', RoleSchema);
