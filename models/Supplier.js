const mongoose = require('mongoose');

const SupplierSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, default: 'Taller Nacional / Vaciado' },
  contact: { type: String, default: '' },
  phone: { type: String, default: '' },
  city: { type: String, default: 'Colombia' },
  manoDeObraPerGram: { type: Number, default: 22000 },
  puroInHandsGrams: { type: Number, default: 0 },
  balanceManoDeObra: { type: Number, default: 0 },
  balanceDuePesos: { type: Number, default: 0 },
  balanceDueGrams: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Supplier', SupplierSchema);
