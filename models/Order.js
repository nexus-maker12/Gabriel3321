const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  itemId: { type: String, default: '' },
  code: { type: String, default: '' },
  name: { type: String, default: '' },
  category: { type: String, default: 'nacional' },
  weightGrams: { type: Number, default: 0 },
  costPerGram: { type: Number, default: 0 },
  pricePerGram: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  marginPerGram: { type: Number, default: 0 }
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  remisionNumber: { type: String, required: true, unique: true },
  date: { type: String, default: () => new Date().toISOString() },
  clientId: { type: String, required: true },
  clientName: { type: String, default: '' },
  items: [OrderItemSchema],
  totalGrams: { type: Number, default: 0 },
  totalCostAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  grossMargin: { type: Number, default: 0 },
  paymentType: { type: String, default: 'Contado' },
  paymentDetail: {
    cash: { type: Number, default: 0 },
    transfer: { type: Number, default: 0 },
    scrapGoldGrams: { type: Number, default: 0 },
    scrapGoldRate: { type: Number, default: 0 },
    scrapGoldAmount: { type: Number, default: 0 },
    creditAmount: { type: Number, default: 0 }
  },
  status: { type: String, default: 'Pagado' },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);
