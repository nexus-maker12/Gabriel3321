const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  badgeText: { type: String, default: '' },
  badgeColor: { type: String, default: '#d4af37' },
  description: { type: String, default: '' },
  purity: { type: String, default: '18K (750)' },
  isSystem: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Category', CategorySchema);
