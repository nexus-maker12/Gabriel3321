const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: { type: String, required: true }, // 'abono_cxc', 'pago_cxp'
  entityId: { type: String, required: true },
  entityName: { type: String, default: '' },
  date: { type: String, default: () => new Date().toISOString() },
  amountPesos: { type: Number, default: 0 },
  scrapGoldGrams: { type: Number, default: 0 },
  scrapGoldRate: { type: Number, default: 0 },
  scrapGoldEquivalent: { type: Number, default: 0 },
  totalCredited: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'Efectivo' },
  reference: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
