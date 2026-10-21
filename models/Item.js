const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  code: { type: String, required: true },
  name: { type: String, required: true },
  category: { type: String, required: true, default: 'nacional' }, // 'italiano', 'nacional', etc.
  subcategory: { type: String, default: 'Cadenas' },
  purity: { type: String, default: '18K (750)' },
  origin: { type: String, default: 'Nacional' },
  weightGrams: { type: Number, required: true, default: 0 },
  costPerGram: { type: Number, required: true, default: 0 },
  description: { type: String, default: '' },
  status: { type: String, default: 'activo' }, // 'activo', 'agotado', 'archivado'
  dateAdded: { type: String, default: () => new Date().toISOString().split('T')[0] }
}, { timestamps: true });

module.exports = mongoose.model('Item', ItemSchema);
