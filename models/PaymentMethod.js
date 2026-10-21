const mongoose = require('mongoose');

const PaymentMethodSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, required: true }, // 'Transferencia', 'Efectivo', 'Credito', 'Retal Oro'
  bank: { type: String, default: '' },
  accountType: { type: String, default: 'Corriente' },
  accountNumber: { type: String, default: '' },
  accountHolder: { type: String, default: '' },
  documentId: { type: String, default: '' },
  creditDays: { type: Number, default: 0 },
  surchargePercent: { type: Number, default: 0 },
  cashLocation: { type: String, default: '' },
  currency: { type: String, default: 'COP' },
  instructions: { type: String, default: '' },
  status: { type: String, default: 'activo' }, // 'activo', 'inactivo'
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('PaymentMethod', PaymentMethodSchema);
