const mongoose = require('mongoose');

const RatesSchema = new mongoose.Schema({
  oro24k_fino_benchmark: { type: Number, default: 0 },
  oro18k_nacional_base: { type: Number, default: 0 },
  oro18k_italiano_base: { type: Number, default: 0 },
  retal_oro18k_compra: { type: Number, default: 0 },
  plata925_venta: { type: Number, default: 0 },
  override_promedioPuro24k: { type: Number, default: null },
  override_promedioNacional: { type: Number, default: null },
  override_promedioItaliano: { type: Number, default: null },
  last_updated: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Rates', RatesSchema);
