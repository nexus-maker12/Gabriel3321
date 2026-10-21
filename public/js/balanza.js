// Interactive Digital Scale Module with Live Weighted Cost Averages
class DigitalScale {
  constructor() {
    this.currentGrams = 0.00;
    this.tareGrams = 0.00;
    this.selectedCategory = 'nacional'; // 'nacional' | 'italiano' | 'puro24k' | 'retal'
    this.customSaleRate = null; // Defined on the fly!
    this.averages = {
      promedioPuro24k: 404810,
      promedioItaliano: 283811,
      promedioNacional: 259514
    };
    this.rates = {
      retal_oro18k_compra: 255000,
      oro24k_fino_benchmark: 405000
    };
  }

  setAverages(newAverages) {
    this.averages = { ...this.averages, ...newAverages };
    this.render();
  }

  setRates(newRates) {
    this.rates = { ...this.rates, ...newRates };
    this.render();
  }

  setWeight(grams) {
    this.currentGrams = Math.max(0, Number(Number(grams).toFixed(2)));
    if (window.soundEngine) window.soundEngine.playScaleBeep();
    this.render();
  }

  addWeight(grams) {
    this.setWeight(this.currentGrams + grams);
  }

  tare() {
    this.tareGrams = this.currentGrams;
    this.setWeight(0);
  }

  reset() {
    this.tareGrams = 0.00;
    this.setWeight(0);
  }

  setCategory(cat) {
    this.selectedCategory = cat;
    this.customSaleRate = null; // reset custom negotiated rate
    if (window.soundEngine) window.soundEngine.playChime();
    this.render();
  }

  setCustomSaleRate(rate) {
    this.customSaleRate = parseFloat(rate) || null;
    this.render();
  }

  getDetailsForCategory() {
    let costPerGram = 0;
    let label = '';
    let suggestedSaleRate = 0;

    switch (this.selectedCategory) {
      case 'nacional':
        costPerGram = this.averages.promedioNacional || 259514;
        label = 'Oro 18K Nacional';
        suggestedSaleRate = Math.round(costPerGram * 1.15); // +15% sugerido
        break;
      case 'italiano':
        costPerGram = this.averages.promedioItaliano || 283811;
        label = 'Oro 18K Italiano (750)';
        suggestedSaleRate = Math.round(costPerGram * 1.15);
        break;
      case 'puro24k':
        costPerGram = this.averages.promedioPuro24k || 404810;
        label = 'Oro Puro 24K (Granalla / Fino)';
        suggestedSaleRate = costPerGram;
        break;
      case 'retal':
        costPerGram = this.rates.retal_oro18k_compra || 255000;
        label = 'Retal / Oro Chatarra 18K';
        suggestedSaleRate = costPerGram;
        break;
      default:
        costPerGram = 260000;
        label = 'Oro 18K';
        suggestedSaleRate = 300000;
    }

    const effectiveSaleRate = this.customSaleRate !== null ? this.customSaleRate : suggestedSaleRate;

    return {
      label,
      costPerGram,
      saleRate: effectiveSaleRate,
      suggestedSaleRate
    };
  }

  render() {
    const lcdElem = document.getElementById('scale-lcd-digits');
    if (lcdElem) {
      lcdElem.innerText = this.currentGrams.toFixed(2);
    }

    const { label, costPerGram, saleRate } = this.getDetailsForCategory();
    const totalCost = Math.round(this.currentGrams * costPerGram);
    const totalWholesale = Math.round(this.currentGrams * saleRate);
    const margin = totalWholesale - totalCost;

    const lblElem = document.getElementById('scale-cat-label');
    if (lblElem) lblElem.innerText = label;

    const costRateElem = document.getElementById('scale-cost-rate-display');
    if (costRateElem) costRateElem.innerText = `$${costPerGram.toLocaleString('es-CO')} /g`;

    const saleRateInput = document.getElementById('scale-sale-rate-input');
    if (saleRateInput && document.activeElement !== saleRateInput) {
      saleRateInput.value = saleRate;
    }

    const costElem = document.getElementById('scale-cost-display');
    if (costElem) costElem.innerText = `$${totalCost.toLocaleString('es-CO')}`;

    const totalElem = document.getElementById('scale-total-display');
    if (totalElem) totalElem.innerText = `$${totalWholesale.toLocaleString('es-CO')}`;

    const marginElem = document.getElementById('scale-margin-display');
    if (marginElem) {
      const marginPct = totalCost > 0 ? ((margin / totalCost) * 100).toFixed(1) : '0.0';
      marginElem.innerText = `+$${margin.toLocaleString('es-CO')} (${marginPct}%)`;
      marginElem.style.color = margin >= 0 ? '#34d399' : '#f87171';
    }
  }
}

window.digitalScale = new DigitalScale();
