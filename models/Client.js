const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  tradeName: { type: String, default: '' },
  documentType: { type: String, default: 'NIT' },
  documentNumber: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  city: { type: String, default: 'Colombia' },
  address: { type: String, default: '' },
  creditLimitPesos: { type: Number, default: 50000000 },
  currentDebtPesos: { type: Number, default: 0 },
  currentDebtGrams: { type: Number, default: 0 },
  creditDays: { type: Number, default: 15 },
  riskLevel: { type: String, default: 'A - Excelente' }, // 'A - Excelente', 'B - Normal', 'C - Observación'
  lastPaymentDate: { type: String, default: null },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Client', ClientSchema);
