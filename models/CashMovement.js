const mongoose = require('mongoose');

const CashMovementSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  date: { type: String, default: () => new Date().toISOString() },
  type: { type: String, required: true }, // 'ingreso', 'egreso'
  category: { type: String, required: true },
  concept: { type: String, required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, default: 'Efectivo en Caja Principal' },
  reference: { type: String, default: '' },
  thirdParty: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('CashMovement', CashMovementSchema);
