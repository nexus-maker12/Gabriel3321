const mongoose = require('mongoose');

const PuroPurchaseSchema = new mongoose.Schema({
  id: { type: String, default: '' },
  date: { type: String, default: () => new Date().toISOString() },
  supplierId: { type: String, default: '' },
  supplierName: { type: String, default: '' },
  grams: { type: Number, default: 0 },
  costPerGram: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  invoiceRef: { type: String, default: 'S/N' },
  notes: { type: String, default: '' }
}, { _id: false });

const PuroDeliverySchema = new mongoose.Schema({
  id: { type: String, default: '' },
  type: { type: String, default: 'entrega_puro' }, // 'entrega_puro', 'recepcion_prenda'
  date: { type: String, default: () => new Date().toISOString() },
  supplierId: { type: String, default: '' },
  supplierName: { type: String, default: '' },
  grams24k: { type: Number, default: 0 },
  grams24kUsed: { type: Number, default: 0 },
  grams18kReceived: { type: Number, default: 0 },
  manoDeObraPaid: { type: Number, default: 0 },
  costAtDelivery: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, { _id: false });

const Puro24kSchema = new mongoose.Schema({
  stockGrams: { type: Number, default: 0 },
  purchases: [PuroPurchaseSchema],
  deliveries: [PuroDeliverySchema]
}, { timestamps: true });

module.exports = mongoose.model('Puro24k', Puro24kSchema);
