// Nexus por Mayor - Main Application Controller (Averaging & Dynamic Pricing Engine)
const App = {
  currentView: 'dashboard',
  rates: {},
  averages: {},
  puroData: { stockGrams: 0, purchases: [], deliveries: [] },
  items: [],
  clients: [],
  suppliers: [],
  orders: [],
  payments: [],
  categories: [],
  stats: {},
  activeCategoryFilter: 'all',
  activeSearchQuery: '',
  dispatchCart: [], // Items weighed for wholesale dispatch
  carteraViewMode: 'cards', // 'cards' | 'table'
  selectedCarteraClientId: null,
  selectedClientDetailTab: 'ledger',
  currentTheme: 'dark', // 'dark' | 'light'
  gastosPeriod: 'mes',
  gastosStartDate: '',
  gastosEndDate: '',
  gastosCategoryFilter: 'all',
  gastosMethodFilter: 'all',
  gastosSearchQuery: '',
  gastosData: null,
  gastosSearchTimer: null,

  // Authentication & Role-Based Access Control (RBAC)
  currentUser: null,
  authToken: null,
  currentPermissions: {},
  rolesCatalog: {},
  modulesCatalog: [],
  usersList: [],
  selectedMatrixRole: 'admin',
  matrixDirtyPermissions: {},
  usersFilterRole: 'all',
  usersFilterStatus: 'all',
  usersSearchQuery: '',
  usersActiveTab: 'directorio',

  initTheme() {
    const saved = localStorage.getItem('nexus_theme');
    const theme = (saved === 'light' || saved === 'dark') ? saved : 'dark';
    this.applyTheme(theme);
  },

  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add('theme-' + theme);
    try { localStorage.setItem('nexus_theme', theme); } catch (e) {}

    const iconEl = document.getElementById('theme-icon');
    const textEl = document.getElementById('theme-text');
    const sideIconEl = document.getElementById('sidebar-theme-icon');
    const sideLabelEl = document.getElementById('sidebar-theme-label');

    const isLight = theme === 'light';
    const nextLabel = isLight ? 'Modo Oscuro' : 'Modo Claro';
    const nextIcon = isLight ? '🌙' : '☀️';

    if (iconEl) iconEl.innerText = nextIcon;
    if (textEl) textEl.innerText = nextLabel;
    if (sideIconEl) sideIconEl.innerText = nextIcon;
    if (sideLabelEl) sideLabelEl.innerText = isLight ? 'Oscuro' : 'Claro';
  },

  toggleTheme() {
    const next = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
    if (window.soundEngine) window.soundEngine.playChime();
  },

  toggleSound() {
    if (!window.soundEngine) return;
    const isMuted = window.soundEngine.toggleMute();
    const soundLabel = document.getElementById('sidebar-sound-label');
    const soundIcon = document.getElementById('sidebar-sound-icon');
    if (soundLabel) soundLabel.innerText = isMuted ? 'Muted' : 'Audio';
    if (soundIcon) soundIcon.innerText = isMuted ? '🔇' : '🔊';
  },

  async init() {
    console.log('💎 Iniciando Nexus por Mayor (Modo Gramaje & Promedios Ponderados)...');
    this.initTheme();
    this.setupNavigation();
    this.setupEventListeners();
    await this.initAuthSession();
    await this.refreshAllData();
    this.render();
  },

  async refreshAllData() {
    try {
      const [statsRes, ratesRes, itemsRes, clientsRes, suppliersRes, ordersRes, paymentsRes, puroRes, payMethodsRes, catRes] = await Promise.all([
        fetch('/api/stats').then(r => r.json()),
        fetch('/api/rates').then(r => r.json()),
        fetch('/api/items').then(r => r.json()),
        fetch('/api/clients').then(r => r.json()),
        fetch('/api/suppliers').then(r => r.json()),
        fetch('/api/orders').then(r => r.json()),
        fetch('/api/payments').then(r => r.json()),
        fetch('/api/puro').then(r => r.json()),
        fetch('/api/payment-methods').then(r => r.json()),
        fetch('/api/categories').then(r => r.json()).catch(() => ({ success: false }))
      ]);

      if (statsRes.success) {
        this.stats = statsRes.stats;
        this.averages = statsRes.stats.averages || {};
        if (window.digitalScale) window.digitalScale.setAverages(this.averages);
      }
      if (ratesRes.success) {
        this.rates = ratesRes.rates;
        if (window.digitalScale) window.digitalScale.setRates(this.rates);
        this.renderGoldTicker();
      }
      if (puroRes.success) {
        this.puroData = puroRes.puro || { stockGrams: 0, purchases: [], deliveries: [] };
      }
      if (itemsRes.success) this.items = itemsRes.items;
      if (clientsRes.success) this.clients = clientsRes.clients;
      if (suppliersRes.success) this.suppliers = suppliersRes.suppliers;
      if (ordersRes.success) this.orders = ordersRes.orders;
      if (paymentsRes.success) this.payments = paymentsRes.payments;
      if (payMethodsRes && payMethodsRes.success) {
        this.paymentMethods = payMethodsRes.paymentMethods || [];
      }
      if (catRes && catRes.success) {
        this.categories = catRes.categories || [];
      }

      this.updateSidebarVaultChip();
    } catch (err) {
      console.warn('Operando en modo cache / offline:', err);
    }
  },

  setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-item button');
    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetView = btn.getAttribute('data-view');
        if (targetView) {
          this.switchView(targetView);
        }
      });
    });

    // Sound toggle
    const soundBtn = document.getElementById('btn-toggle-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const isMuted = window.soundEngine.toggleMute();
        soundBtn.innerHTML = isMuted 
          ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> Sonido OFF`
          : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Sonido ON`;
      });
    }
  },

  switchView(viewName) {
    this.currentView = viewName;
    if (window.soundEngine) window.soundEngine.playChime();

    // Update nav classes
    document.querySelectorAll('.nav-item').forEach(item => {
      const btn = item.querySelector('button');
      if (btn && btn.getAttribute('data-view') === viewName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Hide all view containers
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.style.display = 'none';
    });

    const activeContainer = document.getElementById(`view-${viewName}`);
    if (activeContainer) {
      activeContainer.style.display = 'block';
    }

    this.render();
  },

  setupEventListeners() {
    // Inventory Category filter tabs
    document.querySelectorAll('.cat-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeCategoryFilter = tab.getAttribute('data-category') || 'all';
        this.renderInventory();
      });
    });

    // Search input
    const searchInput = document.getElementById('inventory-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.activeSearchQuery = e.target.value.toLowerCase();
        this.renderInventory();
      });
    }

    // Modal close triggers
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeAllModals();
      });
    });

    // Close on overlay backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeAllModals();
        }
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    // Balanza controls
    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = parseFloat(chip.getAttribute('data-add'));
        if (val) window.digitalScale.addWeight(val);
      });
    });

    const tareBtn = document.getElementById('btn-scale-tare');
    if (tareBtn) {
      tareBtn.addEventListener('click', () => window.digitalScale.tare());
    }

    const zeroBtn = document.getElementById('btn-scale-zero');
    if (zeroBtn) {
      zeroBtn.addEventListener('click', () => window.digitalScale.reset());
    }

    const scaleCatSelect = document.getElementById('scale-cat-select');
    if (scaleCatSelect) {
      scaleCatSelect.addEventListener('change', (e) => {
        window.digitalScale.setCategory(e.target.value);
      });
    }

    const scaleSaleInput = document.getElementById('scale-sale-rate-input');
    if (scaleSaleInput) {
      scaleSaleInput.addEventListener('input', (e) => {
        window.digitalScale.setCustomSaleRate(e.target.value);
      });
    }
  },

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    const cliId = document.getElementById('newcli-id');
    if (cliId) cliId.value = '';
    const supId = document.getElementById('newsup-id');
    if (supId) supId.value = '';
    const pmId = document.getElementById('pm-id');
    if (pmId) pmId.value = '';
    const gastoId = document.getElementById('gasto-id');
    if (gastoId) gastoId.value = '';
    const userId = document.getElementById('user-input-id');
    if (userId) userId.value = '';
    const passUserId = document.getElementById('change-pass-user-id');
    if (passUserId) passUserId.value = '';
  },

  resetJoyeriaForm() {
    const idElem = document.getElementById('newcli-id');
    if (idElem) idElem.value = '';
    const titleElem = document.getElementById('modal-client-title');
    if (titleElem) titleElem.innerText = 'Registrar Nueva Joyería Mayorista';
    const tradeElem = document.getElementById('newcli-trade');
    if (tradeElem) tradeElem.value = '';
    const nameElem = document.getElementById('newcli-name');
    if (nameElem) nameElem.value = '';
    const docTypeElem = document.getElementById('newcli-doctype');
    if (docTypeElem) docTypeElem.value = 'NIT';
    const docElem = document.getElementById('newcli-doc');
    if (docElem) docElem.value = '';
    const phoneElem = document.getElementById('newcli-phone');
    if (phoneElem) phoneElem.value = '';
    const cityElem = document.getElementById('newcli-city');
    if (cityElem) cityElem.value = '';
    const limitElem = document.getElementById('newcli-limit-pesos');
    if (limitElem) limitElem.value = '50000000';
    const riskElem = document.getElementById('newcli-risk');
    if (riskElem) riskElem.value = 'A - Excelente';
  },

  resetProveedorForm() {
    const idElem = document.getElementById('newsup-id');
    if (idElem) idElem.value = '';
    const titleElem = document.getElementById('modal-supplier-title');
    if (titleElem) titleElem.innerText = 'Registrar Nuevo Proveedor / Taller';
    const nameElem = document.getElementById('newsup-name');
    if (nameElem) nameElem.value = '';
    const catElem = document.getElementById('newsup-cat');
    if (catElem) catElem.value = 'Taller Nacional / Vaciado';
    const moElem = document.getElementById('newsup-mo');
    if (moElem) moElem.value = '22000';
    const contactElem = document.getElementById('newsup-contact');
    if (contactElem) contactElem.value = '';
    const phoneElem = document.getElementById('newsup-phone');
    if (phoneElem) phoneElem.value = '';
    const cityElem = document.getElementById('newsup-city');
    if (cityElem) cityElem.value = '';
  },

  openModal(modalId) {
    if (modalId === 'modal-new-client') {
      const cliId = document.getElementById('newcli-id');
      if (!cliId || !cliId.value) {
        this.resetJoyeriaForm();
      }
    } else if (modalId === 'modal-new-supplier') {
      const supId = document.getElementById('newsup-id');
      if (!supId || !supId.value) {
        this.resetProveedorForm();
      }
    }

    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      if (window.soundEngine) {
        try { window.soundEngine.playChime(); } catch (e) {}
      }
    }
  },

  // Renders the Gold Ticker at the top with Promedios
  renderGoldTicker() {
    const puroElem = document.getElementById('ticker-puro-avg');
    const itElem = document.getElementById('ticker-it-avg');
    const ncElem = document.getElementById('ticker-nc-avg');
    const retalElem = document.getElementById('ticker-retal');

    const avgPuro = this.averages.promedioPuro24k || 404810;
    const avgIt = this.averages.promedioItaliano || 283811;
    const avgNc = this.averages.promedioNacional || 259514;
    const retal = this.rates.retal_oro18k_compra || 255000;

    if (puroElem) puroElem.innerText = `$${avgPuro.toLocaleString('es-CO')}/g`;
    if (itElem) itElem.innerText = `$${avgIt.toLocaleString('es-CO')}/g`;
    if (ncElem) ncElem.innerText = `$${avgNc.toLocaleString('es-CO')}/g`;
    if (retalElem) retalElem.innerText = `$${retal.toLocaleString('es-CO')}/g`;
  },

  updateSidebarVaultChip() {
    const chipVal = document.getElementById('sidebar-vault-grams');
    const chipIt = document.getElementById('sidebar-vault-it');
    const chipNc = document.getElementById('sidebar-vault-nc');
    const chipPuro = document.getElementById('sidebar-vault-puro');

    const total18k = (this.stats.vault18k && this.stats.vault18k.totalGrams) || 0;
    const it = (this.stats.vault18k && this.stats.vault18k.italianGrams) || 0;
    const nc = (this.stats.vault18k && this.stats.vault18k.nationalGrams) || 0;
    const puro = (this.stats.puro24k && this.stats.puro24k.stockGrams) || 0;

    if (chipVal) chipVal.innerText = `${total18k.toFixed(2)} g`;
    if (chipIt) chipIt.innerText = `IT: ${it.toFixed(1)}g`;
    if (chipNc) chipNc.innerText = `NC: ${nc.toFixed(1)}g`;
    if (chipPuro) chipPuro.innerText = `👑 24K: ${puro.toFixed(1)}g`;
  },

  render() {
    if (this.currentView === 'dashboard') {
      this.renderDashboard();
    } else if (this.currentView === 'puro') {
      this.renderPuroMaquila();
    } else if (this.currentView === 'inventario') {
      this.renderInventory();
    } else if (this.currentView === 'despacho') {
      this.renderDespacho();
    } else if (this.currentView === 'joyerias') {
      this.renderJoyerias();
    } else if (this.currentView === 'cartera-clientes') {
      this.renderCarteraClientes();
    } else if (this.currentView === 'proveedores') {
      this.renderProveedoresAdmin();
    } else if (this.currentView === 'cxc') {
      this.renderCxC();
    } else if (this.currentView === 'cxp') {
      this.renderCxP();
    } else if (this.currentView === 'remisiones') {
      this.renderRemisionesList();
    } else if (this.currentView === 'metodos-pago') {
      this.renderPaymentMethods();
    } else if (this.currentView === 'cuadre-caja') {
      this.renderCuadreCaja();
    } else if (this.currentView === 'balance-general') {
      this.loadBalanceGeneral();
    } else if (this.currentView === 'gastos-operativos') {
      this.loadGastosOperativos();
    } else if (this.currentView === 'usuarios') {
      this.loadUsersAndRoles();
    }
  },

  renderDashboard() {
    const v = this.stats.vault18k || {};
    const puro = this.stats.puro24k || {};
    const cxc = this.stats.cxc || {};
    const cxp = this.stats.cxp || {};

    const elTotalGrams = document.getElementById('dash-total-grams');
    const elItGrams = document.getElementById('dash-it-grams');
    const elNcGrams = document.getElementById('dash-nc-grams');
    
    const elPuroStock = document.getElementById('dash-puro-stock');
    const elPuroCost = document.getElementById('dash-puro-avg-cost');
    const elPuroTalleres = document.getElementById('dash-puro-talleres');

    const elVaultVal = document.getElementById('dash-vault-cost');
    const elAvgNc = document.getElementById('dash-avg-nc');
    const elAvgIt = document.getElementById('dash-avg-it');

    const elCxcPesos = document.getElementById('dash-cxc-pesos');
    const elCxcGrams = document.getElementById('dash-cxc-grams');
    const elCxpPesos = document.getElementById('dash-cxp-pesos');
    const elCxpMo = document.getElementById('dash-cxp-mo');

    if (elTotalGrams) elTotalGrams.innerText = `${(v.totalGrams || 0).toFixed(2)} g`;
    if (elItGrams) elItGrams.innerText = `${(v.italianGrams || 0).toFixed(2)} g`;
    if (elNcGrams) elNcGrams.innerText = `${(v.nationalGrams || 0).toFixed(2)} g`;

    if (elPuroStock) elPuroStock.innerText = `${(puro.stockGrams || 0).toFixed(2)} g`;
    if (elPuroCost) elPuroCost.innerText = `Costo Promedio: $${(this.averages.promedioPuro24k || 404810).toLocaleString('es-CO')}/g`;
    if (elPuroTalleres) elPuroTalleres.innerText = `En talleres: ${(puro.inTalleresGrams || 0).toFixed(2)} g`;

    if (elVaultVal) elVaultVal.innerText = `$${(v.totalCost || 0).toLocaleString('es-CO')}`;
    if (elAvgNc) elAvgNc.innerText = `$${(this.averages.promedioNacional || 259514).toLocaleString('es-CO')}/g`;
    if (elAvgIt) elAvgIt.innerText = `$${(this.averages.promedioItaliano || 283811).toLocaleString('es-CO')}/g`;

    if (elCxcPesos) elCxcPesos.innerText = `$${(cxc.totalPesos || 0).toLocaleString('es-CO')}`;
    if (elCxcGrams) elCxcGrams.innerText = `Eq: ${(cxc.totalGrams || 0).toFixed(2)} g oro 18K`;
    
    if (elCxpPesos) elCxpPesos.innerText = `$${(cxp.totalPesos || 0).toLocaleString('es-CO')}`;
    if (elCxpMo) elCxpMo.innerText = `Mano de obra adeudada: $${(cxp.totalManoDeObra || 0).toLocaleString('es-CO')}`;

    if (window.digitalScale) window.digitalScale.render();
    this.renderDashboardCartera();
  },

  renderDashboardCartera() {
    const clients = this.clients || [];
    const payments = this.payments || [];
    const averages = this.averages || {};
    const refRate = averages.promedioNacional || 260000;

    const totalDebtPesos = clients.reduce((acc, c) => acc + (Number(c.currentDebtPesos) || 0), 0);
    const totalDebtGrams = clients.reduce((acc, c) => acc + (Number(c.currentDebtGrams) || 0), 0);
    const activeDebtors = clients.filter(c => (Number(c.currentDebtPesos) || 0) > 0);
    const cleanCount = clients.length - activeDebtors.length;
    const totalCreditLimit = clients.reduce((acc, c) => acc + (Number(c.creditLimitPesos) || 50000000), 0);
    const usagePctGlobal = totalCreditLimit > 0 ? Math.round((totalDebtPesos / totalCreditLimit) * 100) : 0;

    // Retal in CxC abonos
    const cxcPayments = payments.filter(p => p.type === 'abono_cxc');
    const totalRetalGrams = cxcPayments.reduce((acc, p) => acc + (Number(p.scrapGoldGrams) || 0), 0);
    const totalRetalPesos = cxcPayments.reduce((acc, p) => acc + (Number(p.scrapGoldEquivalent) || 0), 0);

    // Update mini KPIs in dashboard
    const elKpiPesos = document.getElementById('dash-cartera-kpi-pesos');
    const elKpiGrams = document.getElementById('dash-cartera-kpi-grams');
    const elKpiCount = document.getElementById('dash-cartera-kpi-count');
    const elKpiClean = document.getElementById('dash-cartera-kpi-clean');
    const elKpiLimit = document.getElementById('dash-cartera-kpi-limit');
    const elKpiUsage = document.getElementById('dash-cartera-kpi-usage');
    const elKpiRetGrams = document.getElementById('dash-cartera-kpi-retal-grams');
    const elKpiRetPesos = document.getElementById('dash-cartera-kpi-retal-pesos');

    if (elKpiPesos) elKpiPesos.innerText = `$${totalDebtPesos.toLocaleString('es-CO')}`;
    if (elKpiGrams) elKpiGrams.innerText = `${totalDebtGrams.toFixed(2)} g Oro 18K equiv.`;
    if (elKpiCount) elKpiCount.innerText = `${activeDebtors.length} de ${clients.length}`;
    if (elKpiClean) elKpiClean.innerText = `${cleanCount} joyerías al día`;
    if (elKpiLimit) elKpiLimit.innerText = `$${totalCreditLimit.toLocaleString('es-CO')}`;
    if (elKpiUsage) elKpiUsage.innerText = `${usagePctGlobal}% del cupo global utilizado`;
    if (elKpiRetGrams) elKpiRetGrams.innerText = `${totalRetalGrams.toFixed(2)} g 18K`;
    if (elKpiRetPesos) elKpiRetPesos.innerText = `Valorizado: $${totalRetalPesos.toLocaleString('es-CO')}`;

    // Filters
    const searchVal = (document.getElementById('dash-cartera-search-input')?.value || '').toLowerCase().trim();
    const statusVal = document.getElementById('dash-cartera-status-filter')?.value || 'con-saldo';

    let list = [...clients];

    if (searchVal) {
      list = list.filter(c => {
        const name = (c.name || '').toLowerCase();
        const trade = (c.tradeName || '').toLowerCase();
        const doc = (c.documentNumber || '').toLowerCase();
        const city = (c.city || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return name.includes(searchVal) || trade.includes(searchVal) || doc.includes(searchVal) || city.includes(searchVal) || phone.includes(searchVal);
      });
    }

    if (statusVal === 'con-saldo') {
      list = list.filter(c => (Number(c.currentDebtPesos) || 0) > 0);
    } else if (statusVal === 'al-dia') {
      list = list.filter(c => (Number(c.currentDebtPesos) || 0) <= 0);
    } else if (statusVal === 'cupo-alerta') {
      list = list.filter(c => {
        const debt = Number(c.currentDebtPesos) || 0;
        const limit = Number(c.creditLimitPesos) || 50000000;
        return limit > 0 && (debt / limit) >= 0.7;
      });
    } else if (statusVal === 'riesgo-c') {
      list = list.filter(c => (c.riskLevel || '').startsWith('C'));
    }

    // Sort by largest debt first
    list.sort((a, b) => (Number(b.currentDebtPesos) || 0) - (Number(a.currentDebtPesos) || 0));

    const countEl = document.getElementById('dash-cartera-shown-count');
    if (countEl) countEl.innerText = `${list.length} de ${clients.length}`;

    const tbody = document.getElementById('dash-cartera-table-body');
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 30px; color: var(--text-dim);">No se encontraron clientes con el filtro seleccionado.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(client => {
      const debtPesos = Number(client.currentDebtPesos) || 0;
      const debtGrams = Number(client.currentDebtGrams) || (refRate > 0 ? Number((debtPesos / refRate).toFixed(2)) : 0);
      const creditLimit = Number(client.creditLimitPesos) || 50000000;
      const usagePct = creditLimit > 0 ? Math.min(100, Math.round((debtPesos / creditLimit) * 100)) : 0;

      let barColor = '#10b981';
      if (usagePct >= 80) barColor = '#ef4444';
      else if (usagePct >= 50) barColor = '#f59e0b';

      let riskBadge = `<span class="stat-badge pos">A</span>`;
      if ((client.riskLevel || '').startsWith('B')) riskBadge = `<span class="stat-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">B</span>`;
      else if ((client.riskLevel || '').startsWith('C')) riskBadge = `<span class="stat-badge neg">C</span>`;

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: var(--text-headings); font-size: 0.9rem;">
              ${this.escapeHtml(client.tradeName || client.name)}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-dim);">
              ${this.escapeHtml(client.name)} • ${this.escapeHtml(client.documentType || 'NIT')}: ${this.escapeHtml(client.documentNumber || '')}
            </div>
          </td>
          <td>
            <div style="font-weight: 600; font-size: 0.82rem; color: var(--text-headings);">${this.escapeHtml(client.city || 'Colombia')}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${this.escapeHtml(client.phone || '')}</div>
          </td>
          <td class="text-center">${riskBadge}</td>
          <td class="text-right mono" style="font-size: 0.85rem;">$${creditLimit.toLocaleString('es-CO')}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="credit-bar-track" style="flex: 1; height: 6px; background: rgba(255,255,255,0.08); border-radius: 9999px; overflow: hidden;">
                <div class="credit-bar-fill" style="width: ${usagePct}%; background: ${barColor}; height: 100%;"></div>
              </div>
              <span class="mono" style="font-size: 0.75rem; color: ${barColor}; font-weight: 700; min-width: 32px;">${usagePct}%</span>
            </div>
            <div style="font-size: 0.68rem; color: var(--text-dim); margin-top: 2px;">
              Disp: $${Math.max(0, creditLimit - debtPesos).toLocaleString('es-CO')}
            </div>
          </td>
          <td class="text-right mono" style="font-weight: 800; font-size: 1rem; color: ${debtPesos > 0 ? 'var(--danger-accent)' : 'var(--emerald-accent)'};">
            $${debtPesos.toLocaleString('es-CO')}
          </td>
          <td class="text-right mono" style="font-weight: 700; color: var(--gold-primary); font-size: 0.9rem;">
            ${debtGrams.toFixed(2)} g 18K
          </td>
          <td>
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-headings);">${client.creditDays || 15} días plazo</div>
            <div style="font-size: 0.7rem; color: var(--text-dim);">Últ. pago: ${client.lastPaymentDate || 'Sin abonos'}</div>
          </td>
          <td class="text-center" style="white-space: nowrap;">
            <div style="display: inline-flex; gap: 4px;">
              <button class="btn btn-gold btn-sm" onclick="App.openClientCarteraDetail('${client.id}')" style="padding: 4px 8px; font-size: 0.75rem;" title="Ver Expediente de Cartera">
                🔍 Ficha
              </button>
              <button class="btn btn-outline-gold btn-sm" onclick="App.openAbonoModal('${client.id}', 'cxc')" style="padding: 4px 8px; font-size: 0.75rem;" title="Registrar Abono">
                💰 Abonar
              </button>
              <button class="btn btn-secondary btn-sm" onclick="App.sendClientWhatsApp('${client.id}')" style="padding: 4px 8px; font-size: 0.75rem;" title="Recordatorio por WhatsApp">
                💬
              </button>
              <button class="btn btn-secondary btn-sm" onclick="App.openStatementPrintModal('${client.id}')" style="padding: 4px 8px; font-size: 0.75rem;" title="Imprimir Estado de Cuenta">
                📄
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  // Oro Puro 24K & Maquila de Talleres View
  renderPuroMaquila() {
    const stockElem = document.getElementById('puro-boveda-stock');
    const avgElem = document.getElementById('puro-boveda-avg');
    const valElem = document.getElementById('puro-boveda-val');
    const inTalleresElem = document.getElementById('puro-talleres-stock');

    const stock = Number(this.puroData.stockGrams || 0);
    const avg = Number(this.averages.promedioPuro24k || 404810);
    const inTalleres = (this.suppliers || []).reduce((acc, s) => acc + (Number(s.puroInHandsGrams) || 0), 0);

    if (stockElem) stockElem.innerText = `${stock.toFixed(2)} g`;
    if (avgElem) avgElem.innerText = `$${avg.toLocaleString('es-CO')} /g`;
    if (valElem) valElem.innerText = `$${Math.round(stock * avg).toLocaleString('es-CO')}`;
    if (inTalleresElem) inTalleresElem.innerText = `${inTalleres.toFixed(2)} g`;

    // Render Purchases of Puro Table
    const purchBody = document.getElementById('puro-purchases-body');
    if (purchBody) {
      const purchases = this.puroData.purchases || [];
      if (purchases.length === 0) {
        purchBody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 20px;">No hay compras de oro puro registradas</td></tr>`;
      } else {
        purchBody.innerHTML = purchases.map(p => `
          <tr>
            <td>${p.date ? new Date(p.date).toLocaleDateString('es-CO') : '-'}</td>
            <td><strong>${p.supplierName || 'Proveedor'}</strong> <span style="font-size: 0.72rem; color: var(--text-dim);">(Ref: ${p.invoiceRef || 'S/N'})</span></td>
            <td class="text-right mono" style="font-weight: 700; color: var(--gold-light);">${Number(p.grams || 0).toFixed(2)} g</td>
            <td class="text-right mono">$${Number(p.costPerGram || 0).toLocaleString('es-CO')} /g</td>
            <td class="text-right mono" style="font-weight: 800; color: var(--text-headings);">$${Number(p.totalCost || 0).toLocaleString('es-CO')}</td>
          </tr>
        `).join('');
      }
    }

    // Render Deliveries & Maquila Table (Entregas y Recepciones de Puro)
    const delivBody = document.getElementById('puro-deliveries-body');
    if (delivBody) {
      const deliveries = this.puroData.deliveries || [];
      if (deliveries.length === 0) {
        delivBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px;">No hay movimientos de maquila con talleres</td></tr>`;
      } else {
        delivBody.innerHTML = deliveries.map(d => {
          const isEntrega = d.type === 'entrega_puro';
          const badge = isEntrega 
            ? `<span class="stat-badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171;">📤 Entrega a Taller</span>`
            : `<span class="stat-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">📥 Recibido Terminado</span>`;

          return `
            <tr>
              <td>${d.date ? new Date(d.date).toLocaleDateString('es-CO') : '-'}</td>
              <td><strong>${d.supplierName || 'Taller'}</strong></td>
              <td>${badge}</td>
              <td class="text-right mono" style="font-weight: 700;">
                ${isEntrega ? `<span style="color: #f87171;">-${Number(d.grams24k || 0).toFixed(2)} g puro</span>` : `<span style="color: #34d399;">+${Number(d.grams18kReceived || 0).toFixed(2)} g 18K</span>`}
              </td>
              <td class="text-right mono">
                ${isEntrega ? `Costo: $${Number(d.costAtDelivery || 0).toLocaleString('es-CO')}/g` : `Mano de obra: $${Number(d.manoDeObraRate || 0).toLocaleString('es-CO')}/g`}
              </td>
              <td style="font-size: 0.8rem; color: var(--text-muted);">${d.notes || ''}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Render Talleres Held Gold Table
    const talleresBody = document.getElementById('puro-talleres-table-body');
    if (talleresBody) {
      const talleres = (this.suppliers || []).filter(s => (s.puroInHandsGrams > 0) || (s.balanceManoDeObra > 0) || s.category.includes('Taller'));
      if (talleres.length === 0) {
        talleresBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px;">No hay talleres con metal en su poder</td></tr>`;
      } else {
        talleresBody.innerHTML = talleres.map(t => {
          const puroHands = Number(t.puroInHandsGrams) || 0;
          const mercancia18k = puroHands > 0 ? Number((puroHands * 1.38).toFixed(2)) : 0;

          return `
            <tr>
              <td><strong>${t.name}</strong> <span style="font-size: 0.72rem; color: var(--text-dim);">(${t.city || 'Nacional'})</span></td>
              <td class="mono">$${(t.manoDeObraPerGram || 0).toLocaleString('es-CO')} /g</td>
              <td class="text-right mono" style="font-weight: 800; font-size: 1.05rem; color: #fbbf24;">${puroHands.toFixed(2)} g</td>
              <td class="text-right mono" style="font-weight: 800; font-size: 1.05rem; color: #34d399;">
                ${mercancia18k.toFixed(2)} g
                ${puroHands > 0 ? '<div style="font-size: 0.68rem; color: var(--text-dim); font-weight: normal;">(+38% liga)</div>' : ''}
              </td>
              <td class="text-right mono" style="font-weight: 800; color: #f87171;">$${(t.balanceManoDeObra || 0).toLocaleString('es-CO')}</td>
              <td class="text-center">
                <button class="btn btn-outline-gold btn-sm" onclick="App.openEntregaPuroModal('${t.id}')">📤 Entregar Puro</button>
                <button class="btn btn-gold btn-sm" onclick="App.openRecepcionTallerModal('${t.id}')">📥 Recibir Joyería</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  },

  getCategoryBadge(slug) {
    const cat = (this.categories || []).find(c => c.slug === slug);
    if (cat) {
      return {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        badgeText: cat.badgeText || cat.name,
        color: cat.color || '#d4af37',
        description: cat.description || ''
      };
    }
    if (slug === 'italiano') {
      return { id: 'cat-italiano', name: 'Oro Italiano 18K (750)', slug: 'italiano', badgeText: '🇮🇹 Italiano 18K', color: '#34d399', description: '' };
    }
    return { id: 'cat-nacional', name: 'Oro Nacional 18K', slug: 'nacional', badgeText: '🇨🇴 Nacional 18K', color: '#fbbf24', description: '' };
  },

  setCategoryFilter(categorySlug) {
    this.activeCategoryFilter = categorySlug;
    this.renderCategoryTabs();
    this.renderInventory();
  },

  renderCategoryTabs() {
    const tabsContainer = document.getElementById('inventory-category-tabs');
    if (!tabsContainer) return;

    const allCount = (this.items || []).length;
    const isAllActive = this.activeCategoryFilter === 'all';

    let html = `
      <button class="cat-tab ${isAllActive ? 'active' : ''}" onclick="App.setCategoryFilter('all')">
        🌟 Todos los Lotes <span class="cat-badge-counter" id="cnt-cat-all">${allCount}</span>
      </button>
    `;

    (this.categories || []).forEach(cat => {
      const count = (this.items || []).filter(i => i.category === cat.slug).length;
      const isActive = this.activeCategoryFilter === cat.slug;
      const color = cat.color || '#d4af37';
      const activeStyle = isActive 
        ? `border-color: ${color}; color: ${color}; box-shadow: 0 0 16px ${color}33;` 
        : '';

      html += `
        <button class="cat-tab ${isActive ? 'active' : ''}" style="${activeStyle}" onclick="App.setCategoryFilter('${cat.slug}')">
          ${cat.badgeText || cat.name} <span class="cat-badge-counter" style="${isActive ? `background: ${color}33; color: ${color}; font-weight: 800;` : ''}">${count}</span>
        </button>
      `;
    });

    html += `
      <button class="cat-tab cat-tab-manage" onclick="App.openManageCategoriesModal()" title="Añadir, editar o eliminar categorías de inventario">
        ⚙️ Categorías
      </button>
    `;

    tabsContainer.innerHTML = html;
  },

  // Inventory View (NO PIECES COUNT, NO FIXED SALE PRICE)
  renderInventory() {
    const container = document.getElementById('inventory-grid');
    if (!container) return;

    this.renderCategoryTabs();

    let filtered = [...this.items];

    if (this.activeCategoryFilter !== 'all') {
      filtered = filtered.filter(i => i.category === this.activeCategoryFilter);
    }

    if (this.activeSearchQuery) {
      filtered = filtered.filter(i => 
        i.name.toLowerCase().includes(this.activeSearchQuery) ||
        i.code.toLowerCase().includes(this.activeSearchQuery) ||
        (i.subcategory && i.subcategory.toLowerCase().includes(this.activeSearchQuery)) ||
        (i.origin && i.origin.toLowerCase().includes(this.activeSearchQuery))
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
          <svg style="margin: 0 auto 16px; display: block; opacity: 0.4;" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p style="font-size: 1.1rem; font-weight: 700;">No se encontraron lotes de oro</p>
          <p style="font-size: 0.85rem; margin-top: 4px;">Ingresa un nuevo lote o recibe prendas terminadas de taller.</p>
        </div>
      `;
      return;
    }

    const avgIt = this.averages.promedioItaliano || 283811;
    const avgNc = this.averages.promedioNacional || 259514;

    container.innerHTML = filtered.map(item => {
      const catInfo = this.getCategoryBadge(item.category);
      const totalCostVal = Math.round(item.weightGrams * item.costPerGram);
      
      const benchmarkAvg = item.category === 'italiano' ? avgIt : avgNc;
      const diffVsAvg = item.costPerGram - benchmarkAvg;
      let diffBadge = `<span class="stat-badge pos">A la media</span>`;
      if (diffVsAvg > 0) {
        diffBadge = `<span class="stat-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">+$${diffVsAvg.toLocaleString('es-CO')} vs prom</span>`;
      } else if (diffVsAvg < 0) {
        diffBadge = `<span class="stat-badge pos">-$${Math.abs(diffVsAvg).toLocaleString('es-CO')} vs prom</span>`;
      }

      return `
        <div class="item-card">
          <div class="item-badge-corner">
            <span class="ticker-badge" style="color: ${catInfo.color}; border: 1px solid ${catInfo.color}66; background: ${catInfo.color}22; font-weight: 700; padding: 3px 8px; border-radius: 9999px;">
              ${catInfo.badgeText}
            </span>
          </div>

          <div class="item-header">
            <span class="item-code">${item.code}</span>
            <h3 class="item-name">${item.name}</h3>
            <span class="item-origin">📍 ${item.origin} • ${item.subcategory}</span>
          </div>

          <div class="item-weight-box">
            <span class="weight-label">Peso en Bóveda</span>
            <span class="weight-val">${Number(item.weightGrams || 0).toFixed(2)} <span style="font-size: 0.9rem; color: var(--gold-primary);">g</span></span>
          </div>

          <div class="item-pricing-meta" style="grid-template-columns: 1.2fr 1fr;">
            <div class="meta-block">
              <span class="meta-lbl">Costo Base /g</span>
              <span class="meta-val" style="color: var(--text-headings); font-size: 1.05rem;">$${Number(item.costPerGram || 0).toLocaleString('es-CO')}</span>
            </div>
            <div class="meta-block" style="align-items: flex-end; justify-content: center;">
              ${diffBadge}
            </div>
          </div>

          <div class="item-total-bar">
            <span style="font-size: 0.78rem; color: var(--text-muted); font-weight: 700;">VALOR TOTAL A COSTO:</span>
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 1.2rem; font-weight: 800; color: var(--gold-light);">
              $${totalCostVal.toLocaleString('es-CO')}
            </span>
          </div>

          <div class="item-actions">
            <button class="btn btn-gold btn-sm" style="flex: 1;" onclick="App.quickDispatchItem('${item.id}')">
              ⚡ Pesar & Vender
            </button>
            <button class="btn btn-secondary btn-icon btn-sm" title="Ajustar Gramos" onclick="App.editItemPrompt('${item.id}')">
              ⚖️
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  // Quickly send an item to the Wholesale Dispatch scale batch
  quickDispatchItem(itemId) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) return;

    this.switchView('despacho');

    // Default weight
    const suggestedWeight = item.weightGrams > 0 ? (item.weightGrams > 50 ? 50.00 : item.weightGrams) : 10.00;
    // Suggest sale price based on cost + 15% margin
    const suggestedSalePrice = Math.round(item.costPerGram * 1.15);
    this.addItemToDispatch(item, suggestedWeight, suggestedSalePrice);
  },

  renderDespacho() {
    // Populate client selector
    const clientSelect = document.getElementById('despacho-client-select');
    if (clientSelect) {
      clientSelect.innerHTML = `<option value="">-- Seleccionar Joyería o Cliente Mayorista --</option>` +
        this.clients.map(c => `
          <option value="${c.id}">${c.tradeName || c.name} (${c.city || 'Principal'}) - Saldo CxC: $${c.currentDebtPesos.toLocaleString('es-CO')}</option>
        `).join('');

      clientSelect.onchange = () => {
        const selClient = this.clients.find(c => c.id === clientSelect.value);
        const infoEl = document.getElementById('despacho-client-info');
        if (infoEl) {
          if (selClient) {
            const isHighRisk = selClient.riskLevel && selClient.riskLevel.includes('C');
            const isGood = selClient.riskLevel && selClient.riskLevel.includes('A');
            const badgeClass = isGood ? 'pos' : (isHighRisk ? 'neg' : 'accent-gold');
            infoEl.innerHTML = `
              <span class="stat-badge ${badgeClass}" style="font-weight: 800;">
                Calificación: ${selClient.riskLevel || 'B - Normal'}
              </span>
              <span style="font-size: 0.8rem; color: var(--text-muted);">
                Cupo Crédito: <strong style="color: var(--text-headings);">$${(selClient.creditLimitPesos || 0).toLocaleString('es-CO')}</strong> | 
                Cartera Actual: <strong style="color: ${selClient.currentDebtPesos > 0 ? '#f87171' : '#34d399'};">$${(selClient.currentDebtPesos || 0).toLocaleString('es-CO')}</strong>
              </span>
            `;
          } else {
            infoEl.innerHTML = '';
          }
        }
      };
    }

    // Populate item selector
    const itemSelect = document.getElementById('despacho-item-select');
    if (itemSelect) {
      itemSelect.innerHTML = `<option value="">-- Seleccionar Lote de Oro de Bóveda --</option>` +
        this.items.map(i => {
          const cat = this.getCategoryBadge(i.category);
          return `<option value="${i.id}">[${cat.badgeText}] ${i.code} - ${i.name} (Stock: ${i.weightGrams}g - Costo: $${i.costPerGram.toLocaleString('es-CO')}/g)</option>`;
        }).join('');

      itemSelect.onchange = () => {
        const selItem = this.items.find(i => i.id === itemSelect.value);
        if (selItem) {
          const costHint = document.getElementById('despacho-cost-hint');
          const saleInput = document.getElementById('despacho-sale-price-input');
          if (costHint) costHint.innerText = `Costo base: $${selItem.costPerGram.toLocaleString('es-CO')} /g`;
          if (saleInput) saleInput.value = Math.round(selItem.costPerGram * 1.15); // Suggested default
        }
      };
    }

    this.renderDispatchTable();
  },

  addSelectedItemToDispatch() {
    const itemSelect = document.getElementById('despacho-item-select');
    const itemId = itemSelect ? itemSelect.value : '';
    const weightInput = document.getElementById('despacho-weight-input');
    const weightVal = parseFloat(weightInput?.value);
    const priceInput = document.getElementById('despacho-sale-price-input');
    const salePriceVal = parseFloat(priceInput?.value);

    if (!itemId) {
      alert('Por favor selecciona una prenda o lote de oro de la lista.');
      return;
    }
    if (!weightVal || weightVal <= 0) {
      alert('Por favor ingresa un peso válido en gramos.');
      return;
    }
    if (!salePriceVal || salePriceVal <= 0) {
      alert('Por favor pacta el precio de venta por gramo.');
      return;
    }

    const item = this.items.find(i => i.id === itemId);
    if (item) {
      this.addItemToDispatch(item, weightVal, salePriceVal);
      if (weightInput) weightInput.value = '';
    }
  },

  addItemToDispatch(item, weightGrams, salePricePerGram) {
    const price = Number(salePricePerGram) || Math.round(item.costPerGram * 1.15);
    const existing = this.dispatchCart.find(c => c.itemId === item.id);
    if (existing) {
      existing.weightGrams = Number((existing.weightGrams + weightGrams).toFixed(2));
      existing.pricePerGram = price;
      existing.subtotal = Math.round(existing.weightGrams * existing.pricePerGram);
      existing.subtotalCost = Math.round(existing.weightGrams * existing.costPerGram);
      existing.margin = existing.subtotal - existing.subtotalCost;
    } else {
      const subtotal = Math.round(weightGrams * price);
      const subtotalCost = Math.round(weightGrams * item.costPerGram);
      this.dispatchCart.push({
        itemId: item.id,
        code: item.code,
        name: item.name,
        category: item.category,
        weightGrams: weightGrams,
        costPerGram: item.costPerGram,
        pricePerGram: price,
        subtotal: subtotal,
        subtotalCost: subtotalCost,
        margin: subtotal - subtotalCost
      });
    }

    if (window.soundEngine) window.soundEngine.playChime();
    this.renderDispatchTable();
  },

  renderDispatchTable() {
    const tableBody = document.getElementById('despacho-items-body');
    if (!tableBody) return;

    if (this.dispatchCart.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-dim);">
            No hay pesadas registradas en este despacho. Selecciona un lote, ingresa los gramos y pacta el precio de venta.
          </td>
        </tr>
      `;
      this.updateDispatchTotals(0, 0, 0);
      return;
    }

    let totalG = 0;
    let total$ = 0;
    let totalCost$ = 0;

    tableBody.innerHTML = this.dispatchCart.map((row, idx) => {
      totalG += row.weightGrams;
      total$ += row.subtotal;
      totalCost$ += row.subtotalCost;
      const isIt = row.category === 'italiano';
      const marginG = row.pricePerGram - row.costPerGram;

      return `
        <tr>
          <td class="mono" style="font-weight: 700; color: var(--gold-primary);">${row.code}</td>
          <td>
            <strong>${row.name}</strong>
            <div style="font-size: 0.72rem; color: ${this.getCategoryBadge(row.category).color}; font-weight: 700;">${this.getCategoryBadge(row.category).badgeText}</div>
          </td>
          <td class="text-right">
            <input type="number" step="0.01" min="0.01" value="${row.weightGrams}" 
              class="form-control mono"
              style="width: 85px; text-align: right; border: 1px solid var(--gold-border); color: var(--gold-primary); font-weight: 800; padding: 4px 6px; display: inline-block;"
              onchange="App.updateCartRow(${idx}, this.value, null)"> g
          </td>
          <td class="text-right mono" style="font-size: 0.8rem; color: var(--text-dim);">$${row.costPerGram.toLocaleString('es-CO')}</td>
          <td class="text-right">
            <input type="number" step="1000" min="0" value="${row.pricePerGram}" 
              class="form-control mono"
              style="width: 105px; text-align: right; border: 1px solid #10b981; color: #10b981; font-weight: 800; padding: 4px 6px; display: inline-block;"
              onchange="App.updateCartRow(${idx}, null, this.value)">
          </td>
          <td class="text-right mono" style="font-weight: 700; font-size: 0.82rem; color: ${marginG >= 0 ? '#34d399' : '#f87171'};">
            ${marginG >= 0 ? '+' : ''}$${marginG.toLocaleString('es-CO')}/g
          </td>
          <td class="text-right mono" style="font-weight: 800; color: var(--text-headings);">$${row.subtotal.toLocaleString('es-CO')}</td>
          <td class="text-center">
            <button class="btn btn-secondary btn-icon btn-sm" onclick="App.removeCartItem(${idx})">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    this.updateDispatchTotals(totalG, total$, total$ - totalCost$);
  },

  updateCartRow(index, newWeight, newPrice) {
    if (!this.dispatchCart[index]) return;
    if (newWeight !== null) this.dispatchCart[index].weightGrams = parseFloat(newWeight) || 0;
    if (newPrice !== null) this.dispatchCart[index].pricePerGram = parseFloat(newPrice) || 0;

    const row = this.dispatchCart[index];
    row.subtotal = Math.round(row.weightGrams * row.pricePerGram);
    row.subtotalCost = Math.round(row.weightGrams * row.costPerGram);
    row.margin = row.subtotal - row.subtotalCost;

    this.renderDispatchTable();
  },

  removeCartItem(index) {
    this.dispatchCart.splice(index, 1);
    this.renderDispatchTable();
  },

  updateDispatchTotals(totalGrams, totalPesos, grossMargin) {
    const elG = document.getElementById('despacho-total-grams');
    const elP = document.getElementById('despacho-total-pesos');
    const elSumG = document.getElementById('despacho-summary-grams');
    const elSumP = document.getElementById('despacho-summary-pesos');
    const elMargin = document.getElementById('despacho-summary-margin');

    if (elG) elG.innerText = `${totalGrams.toFixed(2)} g`;
    if (elP) elP.innerText = `$${totalPesos.toLocaleString('es-CO')}`;
    if (elSumG) elSumG.innerText = `${totalGrams.toFixed(2)} g`;
    if (elSumP) elSumP.innerText = `$${totalPesos.toLocaleString('es-CO')}`;
    if (elMargin) {
      elMargin.innerText = `Margen estimado: +$${grossMargin.toLocaleString('es-CO')}`;
      elMargin.style.color = grossMargin >= 0 ? '#34d399' : '#f87171';
    }

    this.calculatePaymentSettlement(totalPesos);
  },

  calculatePaymentSettlement(totalAmount) {
    const scrapGrams = parseFloat(document.getElementById('pay-scrap-grams')?.value) || 0;
    const scrapRate = parseFloat(document.getElementById('pay-scrap-rate')?.value) || (this.rates.retal_oro18k_compra || 255000);
    const scrapDeduction = Math.round(scrapGrams * scrapRate);

    const scrapValElem = document.getElementById('pay-scrap-calc');
    if (scrapValElem) {
      scrapValElem.innerText = `-$${scrapDeduction.toLocaleString('es-CO')}`;
    }

    const cashAmount = parseFloat(document.getElementById('pay-cash-amount')?.value) || 0;
    const transferAmount = parseFloat(document.getElementById('pay-transfer-amount')?.value) || 0;

    const totalPaid = scrapDeduction + cashAmount + transferAmount;
    const remainingCredit = Math.max(0, totalAmount - totalPaid);

    const creditElem = document.getElementById('pay-credit-balance');
    if (creditElem) {
      creditElem.innerText = `$${remainingCredit.toLocaleString('es-CO')}`;
    }
  },

  async finalizeDispatch() {
    if (this.dispatchCart.length === 0) {
      alert('Debes agregar al menos una pesada al despacho.');
      return;
    }

    const clientSelect = document.getElementById('despacho-client-select');
    const clientId = clientSelect ? clientSelect.value : '';
    if (!clientId) {
      alert('Por favor selecciona un cliente mayorista para generar la remisión.');
      return;
    }

    const client = this.clients.find(c => c.id === clientId);
    const totalPesos = this.dispatchCart.reduce((acc, r) => acc + r.subtotal, 0);

    const scrapGrams = parseFloat(document.getElementById('pay-scrap-grams')?.value) || 0;
    const scrapRate = parseFloat(document.getElementById('pay-scrap-rate')?.value) || (this.rates.retal_oro18k_compra || 255000);
    const scrapAmount = Math.round(scrapGrams * scrapRate);
    const cash = parseFloat(document.getElementById('pay-cash-amount')?.value) || 0;
    const transfer = parseFloat(document.getElementById('pay-transfer-amount')?.value) || 0;
    const credit = Math.max(0, totalPesos - (scrapAmount + cash + transfer));

    let paymentType = 'Contado';
    if (credit === totalPesos) paymentType = 'Credito';
    else if (credit > 0 || scrapGrams > 0) paymentType = 'Mixto';

    const orderPayload = {
      clientId,
      items: this.dispatchCart,
      paymentType,
      paymentDetail: {
        cash,
        transfer,
        scrapGoldGrams: scrapGrams,
        scrapGoldRate: scrapRate,
        scrapGoldAmount: scrapAmount,
        creditAmount: credit
      },
      notes: document.getElementById('despacho-notes')?.value || ''
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(`¡Remisión ${res.order.remisionNumber} generada con éxito!`);
        this.dispatchCart = [];
        await this.refreshAllData();
        this.showRemisionPrintModal(res.order);
      } else {
        alert('Error al generar remisión: ' + (res.message || 'Error desconocido'));
      }
    } catch (err) {
      console.error(err);
      alert('Ocurrió un error al procesar el despacho.');
    }
  },

  showRemisionPrintModal(order) {
    const modal = document.getElementById('modal-remision');
    const container = document.getElementById('remision-print-content');
    if (!modal || !container || !order) return;

    const totalG = Number(order.totalGrams || 0).toFixed(2);
    const client = (this.clients || []).find(c => c.id === order.clientId) || { tradeName: order.clientName || 'Cliente Mayorista', documentNumber: 'Consumidor Final', phone: '' };
    const payDetail = order.paymentDetail || {};
    const orderItems = Array.isArray(order.items) ? order.items : [];

    container.innerHTML = `
      <div class="remision-container">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 16px; margin-bottom: 20px;">
          <div>
            <h1 style="font-family: 'Cinzel', serif; font-size: 1.5rem; letter-spacing: 0.05em; margin: 0;">NEXUS POR MAYOR</h1>
            <p style="font-size: 0.8rem; color: #64748b; margin: 2px 0 0;">Plataforma Mayorista de Joyería en Oro 18K Italiano & Nacional</p>
            <p style="font-size: 0.75rem; color: #94a3b8;">NIT 901.442.118-9 • Medellín / Bogotá / Bucaramanga</p>
          </div>
          <div style="text-align: right;">
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 800; color: #b45309;">${order.remisionNumber || 'REM'}</div>
            <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">Fecha: ${order.date ? new Date(order.date).toLocaleString('es-CO') : 'Fecha actual'}</div>
            <div style="font-size: 0.75rem; font-weight: 700; color: #047857; margin-top: 2px;">ESTADO: ${(order.status || 'Pagado').toUpperCase()}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; font-size: 0.85rem; background: #f8fafc; padding: 12px; border-radius: 8px;">
          <div>
            <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase;">Cliente Mayorista:</div>
            <div style="font-weight: 800; font-size: 0.95rem; color: #0f172a;">${order.clientName || 'Cliente Mayorista'}</div>
            <div style="color: #475569;">DOC: ${client.documentType || 'NIT'} ${client.documentNumber || ''}</div>
            <div style="color: #475569;">Tel: ${client.phone || 'Sin registrar'} • ${client.city || 'Colombia'}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase;">Condición de Venta:</div>
            <div style="font-weight: 800; font-size: 0.95rem; color: #0f172a;">${order.paymentType || 'Contado'}</div>
            <div style="color: #475569;">Gramos Totales Despachados: <strong>${totalG} g</strong></div>
          </div>
        </div>

        <table class="remision-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción & Línea</th>
              <th style="text-align: right;">Peso Gramos</th>
              <th style="text-align: right;">Precio Pactado /g</th>
              <th style="text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${orderItems.map(it => `
              <tr>
                <td style="font-family: monospace; font-weight: 700;">${it.code || 'GEN'}</td>
                <td>
                  <strong>${it.name || 'Joyería'}</strong> 
                  <span style="font-size: 0.75rem; color: #64748b;">(${this.getCategoryBadge(it.category).name})</span>
                </td>
                <td style="text-align: right; font-family: monospace; font-weight: 700;">${Number(it.weightGrams || 0).toFixed(2)} g</td>
                <td style="text-align: right; font-family: monospace;">$${Number(it.pricePerGram || 0).toLocaleString('es-CO')}</td>
                <td style="text-align: right; font-family: monospace; font-weight: 800;">$${Number(it.subtotal || 0).toLocaleString('es-CO')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 16px; border-top: 2px solid #cbd5e1; padding-top: 16px;">
          <div style="max-width: 50%; font-size: 0.78rem; color: #64748b;">
            <p><strong>Desglose de Pago:</strong></p>
            ${(Number(payDetail.cash) || 0) > 0 ? `<p>• Efectivo: $${Number(payDetail.cash).toLocaleString('es-CO')}</p>` : ''}
            ${(Number(payDetail.transfer) || 0) > 0 ? `<p>• Transferencia: $${Number(payDetail.transfer).toLocaleString('es-CO')}</p>` : ''}
            ${(Number(payDetail.scrapGoldGrams) || 0) > 0 ? `<p style="color: #b45309;">• Retal de Oro 18K Recibido: ${payDetail.scrapGoldGrams}g @ $${Number(payDetail.scrapGoldRate || 0).toLocaleString('es-CO')}/g = $${Number(payDetail.scrapGoldAmount || 0).toLocaleString('es-CO')}</p>` : ''}
            ${(Number(payDetail.creditAmount) || 0) > 0 ? `<p style="color: #dc2626; font-weight: 700;">• Saldo a Cartera (CxC): $${Number(payDetail.creditAmount).toLocaleString('es-CO')}</p>` : ''}
            <p style="margin-top: 6px; font-style: italic;">Notas: ${order.notes || 'Sin observaciones'}</p>
          </div>

          <div style="text-align: right;">
            <div style="font-size: 0.8rem; color: #64748b;">TOTAL DESPACHO:</div>
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 1.6rem; font-weight: 900; color: #0f172a;">
              $${Number(order.totalAmount || 0).toLocaleString('es-CO')}
            </div>
            <div style="font-size: 0.85rem; color: #b45309; font-weight: 700; margin-top: 4px;">
              PESO TOTAL: ${totalG} GRAMOS
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; padding-top: 15px; font-size: 0.8rem; color: #64748b; text-align: center;">
          <div style="border-top: 1px dashed #94a3b8; padding-top: 8px;">
            Despachado por: <strong>NEXUS POR MAYOR</strong>
          </div>
          <div style="border-top: 1px dashed #94a3b8; padding-top: 8px;">
            Recibido a conformidad: <strong>${order.clientName}</strong>
          </div>
        </div>
      </div>
    `;

    this.openModal('modal-remision');
  },

  // Direct Administración de Joyerías (Clientes)
  renderJoyerias() {
    const tableBody = document.getElementById('joyerias-admin-table-body');
    if (!tableBody) return;

    let list = [...(this.clients || [])];
    const search = (document.getElementById('joyerias-search')?.value || '').toLowerCase();
    const risk = document.getElementById('joyerias-risk-filter')?.value || 'all';

    if (risk !== 'all') {
      list = list.filter(c => c.riskLevel === risk);
    }
    if (search) {
      list = list.filter(c =>
        (c.tradeName || '').toLowerCase().includes(search) ||
        (c.name || '').toLowerCase().includes(search) ||
        (c.documentNumber || '').toLowerCase().includes(search) ||
        (c.city || '').toLowerCase().includes(search) ||
        (c.phone || '').toLowerCase().includes(search)
      );
    }

    if (list.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 40px; color: var(--text-dim);">No se encontraron joyerías con esos criterios de búsqueda.</td></tr>`;
      return;
    }

    tableBody.innerHTML = list.map(client => {
      const debtPesos = Number(client.currentDebtPesos) || 0;
      const debtGrams = Number(client.currentDebtGrams) || 0;
      const limit = Number(client.creditLimitPesos) || 50000000;
      const cleanPhone = (client.phone || '').replace(/[^0-9]/g, '');

      return `
        <tr>
          <td>
            <strong>${client.tradeName || client.name}</strong>
          </td>
          <td>
            <div>${client.name}</div>
            <div style="font-size: 0.72rem; color: var(--text-dim);">${client.documentType || 'NIT'}: ${client.documentNumber || 'S/N'}</div>
          </td>
          <td>
            ${client.phone ? `
              <a href="https://wa.me/${cleanPhone}" target="_blank" class="whatsapp-badge">
                💬 ${client.phone}
              </a>
            ` : '<span style="color: var(--text-dim); font-size: 0.8rem;">Sin teléfono</span>'}
          </td>
          <td>${client.city || 'Colombia'}</td>
          <td class="text-right mono">$${limit.toLocaleString('es-CO')}</td>
          <td>
            <span class="stat-badge ${client.riskLevel && client.riskLevel.includes('A') ? 'pos' : (client.riskLevel && client.riskLevel.includes('C') ? 'neg' : '')}" style="${client.riskLevel && client.riskLevel.includes('B') ? 'background: rgba(245, 158, 11, 0.2); color: #fbbf24;' : ''}">
              ${client.riskLevel || 'A - Excelente'}
            </span>
          </td>
          <td class="text-right mono" style="font-weight: 800; color: ${debtPesos > 0 ? '#f87171' : '#34d399'};">
            $${debtPesos.toLocaleString('es-CO')}
            <div style="font-size: 0.72rem; color: var(--gold-light); font-weight: 700;">${debtGrams.toFixed(2)} g 18K</div>
          </td>
          <td class="text-center" style="white-space: nowrap;">
            <div class="table-actions">
              <button class="btn btn-secondary btn-sm" onclick="App.openEditJoyeriaModal('${client.id}')" title="Editar Joyería">
                ✏️ Editar
              </button>
              <button class="btn btn-secondary btn-icon btn-sm" onclick="App.deleteJoyeria('${client.id}')" title="Eliminar Joyería" style="color: #f87171;">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openNewJoyeriaModal() {
    this.resetJoyeriaForm();
    this.openModal('modal-new-client');
  },

  openEditJoyeriaModal(id) {
    const client = this.clients.find(c => c.id === id);
    if (!client) return;

    const idElem = document.getElementById('newcli-id');
    if (idElem) idElem.value = client.id;
    const titleElem = document.getElementById('modal-client-title');
    if (titleElem) titleElem.innerText = `Editar Joyería: ${client.tradeName || client.name}`;
    const tradeElem = document.getElementById('newcli-trade');
    if (tradeElem) tradeElem.value = client.tradeName || '';
    const nameElem = document.getElementById('newcli-name');
    if (nameElem) nameElem.value = client.name || '';
    const docTypeElem = document.getElementById('newcli-doctype');
    if (docTypeElem) docTypeElem.value = client.documentType || 'NIT';
    const docElem = document.getElementById('newcli-doc');
    if (docElem) docElem.value = client.documentNumber || '';
    const phoneElem = document.getElementById('newcli-phone');
    if (phoneElem) phoneElem.value = client.phone || '';
    const cityElem = document.getElementById('newcli-city');
    if (cityElem) cityElem.value = client.city || '';
    const limitElem = document.getElementById('newcli-limit-pesos');
    if (limitElem) limitElem.value = client.creditLimitPesos || 50000000;
    const riskElem = document.getElementById('newcli-risk');
    if (riskElem) riskElem.value = client.riskLevel || 'A - Excelente';

    const modal = document.getElementById('modal-new-client');
    if (modal) {
      modal.classList.add('active');
      if (window.soundEngine) {
        try { window.soundEngine.playChime(); } catch (e) {}
      }
    }
  },

  async submitJoyeriaForm() {
    const id = document.getElementById('newcli-id')?.value;
    const tradeName = document.getElementById('newcli-trade')?.value.trim();
    const name = document.getElementById('newcli-name')?.value.trim() || tradeName;
    const documentType = document.getElementById('newcli-doctype')?.value || 'NIT';
    const documentNumber = document.getElementById('newcli-doc')?.value.trim() || '';
    const phone = document.getElementById('newcli-phone')?.value.trim() || '';
    const city = document.getElementById('newcli-city')?.value.trim() || '';
    const creditLimitPesos = parseFloat(document.getElementById('newcli-limit-pesos')?.value) || 50000000;
    const riskLevel = document.getElementById('newcli-risk')?.value || 'A - Excelente';

    if (!tradeName) {
      alert('Por favor ingresa la razón social o nombre comercial de la joyería.');
      return;
    }

    const payload = { tradeName, name, documentType, documentNumber, phone, city, creditLimitPesos, riskLevel };

    try {
      let res;
      if (id) {
        res = await fetch(`/api/clients/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      } else {
        res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      }

      if (res.success) {
        if (window.soundEngine) {
          try { window.soundEngine.playSuccess(); } catch (e) {}
        }
        alert(id ? '¡Joyería actualizada correctamente!' : '¡Joyería registrada con éxito!');
        this.closeAllModals();
        await this.refreshAllData();
        this.render();

        if (res.client && document.getElementById('despacho-client-select')) {
          document.getElementById('despacho-client-select').value = res.client.id;
          this.handleDespachoClientChange();
        }
      } else {
        alert('Error: ' + res.message);
      }
    } catch (e) {
      alert('Error al guardar joyería.');
    }
  },

  submitNewClient() {
    return this.submitJoyeriaForm();
  },

  async deleteJoyeria(id) {
    const client = this.clients.find(c => c.id === id);
    if (!client) return;

    if (!confirm(`¿Estás seguro de que deseas eliminar la joyería "${client.tradeName || client.name}" del directorio?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' }).then(r => r.json());
      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(res.message || 'Joyería eliminada');
        await this.refreshAllData();
        this.render();
      }
    } catch (e) {
      alert('Error al eliminar joyería.');
    }
  },

  // Direct Administración de Proveedores & Talleres
  renderProveedoresAdmin() {
    const tableBody = document.getElementById('proveedores-admin-table-body');
    if (!tableBody) return;

    let list = [...(this.suppliers || [])];
    const search = (document.getElementById('proveedores-search')?.value || '').toLowerCase();
    const cat = document.getElementById('proveedores-cat-filter')?.value || 'all';

    if (cat !== 'all') {
      list = list.filter(s => s.category === cat);
    }
    if (search) {
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(search) ||
        (s.contact || '').toLowerCase().includes(search) ||
        (s.city || '').toLowerCase().includes(search) ||
        (s.phone || '').toLowerCase().includes(search)
      );
    }

    if (list.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 40px; color: var(--text-dim);">No se encontraron proveedores o talleres con esos criterios.</td></tr>`;
      return;
    }

    tableBody.innerHTML = list.map(sup => {
      const debtPesos = Number(sup.balanceDuePesos) || 0;
      const moRate = Number(sup.manoDeObraPerGram) || 0;
      const moBalance = Number(sup.balanceManoDeObra) || 0;
      const puroHands = Number(sup.puroInHandsGrams) || 0;
      const mercancia18k = puroHands > 0 ? Number((puroHands * 1.38).toFixed(2)) : 0;
      const cleanPhone = (sup.phone || '').replace(/[^0-9]/g, '');

      return `
        <tr>
          <td>
            <strong>${sup.name}</strong>
          </td>
          <td>
            <span class="ticker-badge ${sup.category.includes('Italiano') ? 'badge-italian' : (sup.category.includes('24K') ? 'badge-bullion' : 'badge-nacional')}">
              ${sup.category}
            </span>
          </td>
          <td class="mono" style="font-weight: 700; color: var(--text-headings);">$${moRate.toLocaleString('es-CO')} /g</td>
          <td>
            <div>${sup.contact || 'Representante'}</div>
            ${sup.phone ? `
              <a href="https://wa.me/${cleanPhone}" target="_blank" class="whatsapp-badge">
                💬 ${sup.phone}
              </a>
            ` : '<span style="color: var(--text-dim); font-size: 0.75rem;">Sin teléfono</span>'}
          </td>
          <td>${sup.city || 'Nacional'}</td>
          <td class="text-right mono" style="font-weight: 800; color: #fbbf24;">
            ${puroHands.toFixed(2)} g
          </td>
          <td class="text-right mono" style="font-weight: 800; color: #34d399;">
            ${mercancia18k.toFixed(2)} g
            ${puroHands > 0 ? '<div style="font-size: 0.68rem; color: var(--text-dim); font-weight: normal;">(+38% liga)</div>' : ''}
          </td>
          <td class="text-right mono" style="color: #f87171; font-weight: 700;">
            $${moBalance.toLocaleString('es-CO')}
          </td>
          <td class="text-center" style="white-space: nowrap;">
            <div class="table-actions">
              <button class="btn btn-secondary btn-sm" onclick="App.openEditProveedorModal('${sup.id}')" title="Editar Proveedor">
                ✏️ Editar
              </button>
              <button class="btn btn-secondary btn-icon btn-sm" onclick="App.deleteProveedor('${sup.id}')" title="Eliminar Proveedor" style="color: #f87171;">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openNewProveedorModal() {
    this.resetProveedorForm();
    this.openModal('modal-new-supplier');
  },

  openEditProveedorModal(id) {
    const sup = this.suppliers.find(s => s.id === id);
    if (!sup) return;

    const idElem = document.getElementById('newsup-id');
    if (idElem) idElem.value = sup.id;
    const titleElem = document.getElementById('modal-supplier-title');
    if (titleElem) titleElem.innerText = `Editar Proveedor / Taller: ${sup.name}`;
    const nameElem = document.getElementById('newsup-name');
    if (nameElem) nameElem.value = sup.name || '';
    const catElem = document.getElementById('newsup-cat');
    if (catElem) catElem.value = sup.category || 'Taller Nacional / Vaciado';
    const moElem = document.getElementById('newsup-mo');
    if (moElem) moElem.value = sup.manoDeObraPerGram || 0;
    const contactElem = document.getElementById('newsup-contact');
    if (contactElem) contactElem.value = sup.contact || '';
    const phoneElem = document.getElementById('newsup-phone');
    if (phoneElem) phoneElem.value = sup.phone || '';
    const cityElem = document.getElementById('newsup-city');
    if (cityElem) cityElem.value = sup.city || '';

    const modal = document.getElementById('modal-new-supplier');
    if (modal) {
      modal.classList.add('active');
      if (window.soundEngine) {
        try { window.soundEngine.playChime(); } catch (e) {}
      }
    }
  },

  async submitProveedorForm() {
    const id = document.getElementById('newsup-id').value;
    const name = document.getElementById('newsup-name').value.trim();
    const category = document.getElementById('newsup-cat').value;
    const manoDeObraPerGram = parseFloat(document.getElementById('newsup-mo').value) || 0;
    const contact = document.getElementById('newsup-contact').value.trim();
    const phone = document.getElementById('newsup-phone').value.trim();
    const city = document.getElementById('newsup-city').value.trim();

    if (!name) {
      alert('Por favor ingresa el nombre o razón social del proveedor o taller.');
      return;
    }

    const payload = { name, category, manoDeObraPerGram, contact, phone, city };

    try {
      let res;
      if (id) {
        res = await fetch(`/api/suppliers/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      } else {
        res = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      }

      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(id ? '¡Proveedor / Taller actualizado correctamente!' : '¡Proveedor / Taller registrado con éxito!');
        this.closeAllModals();
        await this.refreshAllData();
        this.render();
      } else {
        alert('Error: ' + res.message);
      }
    } catch (e) {
      alert('Error al guardar proveedor.');
    }
  },

  submitNewSupplier() {
    return this.submitProveedorForm();
  },

  async submitQuickSupplier() {
    const nameInput = document.getElementById('quick-sup-name');
    const name = nameInput ? nameInput.value.trim() : '';
    const category = document.getElementById('quick-sup-cat')?.value || 'Taller Nacional / Vaciado';
    const manoDeObraPerGram = parseFloat(document.getElementById('quick-sup-mo')?.value) || 22000;
    const phone = document.getElementById('quick-sup-phone')?.value.trim() || '';
    const city = document.getElementById('quick-sup-city')?.value.trim() || '';

    if (!name) {
      alert('Por favor ingresa el nombre o razón social del proveedor o taller.');
      return;
    }

    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, manoDeObraPerGram, contact: name, phone, city })
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(`¡Proveedor / Taller "${res.supplier.name}" añadido exitosamente!`);
        document.getElementById('form-quick-supplier')?.reset();
        const moInput = document.getElementById('quick-sup-mo');
        if (moInput) moInput.value = '22000';
        await this.refreshAllData();
        this.render();
      } else {
        alert('Error: ' + res.message);
      }
    } catch (e) {
      alert('Error al registrar proveedor.');
    }
  },

  async deleteProveedor(id) {
    const sup = this.suppliers.find(s => s.id === id);
    if (!sup) return;

    if (!confirm(`¿Estás seguro de que deseas eliminar el proveedor / taller "${sup.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' }).then(r => r.json());
      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(res.message || 'Proveedor eliminado');
        await this.refreshAllData();
        this.render();
      }
    } catch (e) {
      alert('Error al eliminar proveedor.');
    }
  },

  // Cuentas por Cobrar (CxC) View
  renderCxC() {
    const tableBody = document.getElementById('cxc-table-body');
    if (!tableBody) return;

    if (this.clients.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 40px;">No hay clientes registrados</td></tr>`;
      return;
    }

    tableBody.innerHTML = this.clients.map(client => {
      const debtPesos = Number(client.currentDebtPesos) || 0;
      const debtGrams = Number(client.currentDebtGrams) || 0;
      const creditLimit = Number(client.creditLimitPesos) || 50000000;
      const usagePct = creditLimit > 0 ? Math.min(100, Math.round((debtPesos / creditLimit) * 100)) : 0;

      let statusBadge = `<span class="stat-badge pos">Al Día</span>`;
      if (debtPesos > 0) {
        statusBadge = usagePct > 70 
          ? `<span class="stat-badge neg">Límite Alto (${usagePct}%)</span>` 
          : `<span class="stat-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">Con Saldo</span>`;
      }

      return `
        <tr>
          <td>
            <strong>${client.tradeName || client.name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${client.name} • ${client.documentType}: ${client.documentNumber}</div>
          </td>
          <td>${client.city || 'Colombia'}</td>
          <td>${statusBadge}</td>
          <td class="text-right mono" style="font-size: 0.85rem; color: var(--text-muted);">$${creditLimit.toLocaleString('es-CO')}</td>
          <td class="text-right mono" style="font-weight: 800; font-size: 1.05rem; color: ${debtPesos > 0 ? '#f87171' : '#34d399'};">
            $${debtPesos.toLocaleString('es-CO')}
          </td>
          <td class="text-right mono" style="font-weight: 700; color: var(--gold-light);">
            ${debtGrams.toFixed(2)} g
          </td>
          <td class="text-center" style="white-space: nowrap;">
            <button class="btn btn-gold btn-sm" onclick="App.openClientCarteraDetail('${client.id}')" title="Ver Cartera a Detalle">
              🔍 Detalle
            </button>
            <button class="btn btn-outline-gold btn-sm" onclick="App.openAbonoModal('${client.id}', 'cxc')">
              💰 Abonar
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  // =========================================================
  // CARTERA DE CLIENTES - DETALLE & AUDITORÍA INTEGRAL
  // =========================================================

  setCarteraViewMode(mode) {
    this.carteraViewMode = mode;
    const btnCards = document.getElementById('btn-view-cards');
    const btnTable = document.getElementById('btn-view-table');
    const cardsContainer = document.getElementById('cartera-cards-container');
    const tableContainer = document.getElementById('cartera-table-container');

    if (btnCards) btnCards.classList.toggle('active', mode === 'cards');
    if (btnTable) btnTable.classList.toggle('active', mode === 'table');

    if (cardsContainer) cardsContainer.style.display = mode === 'cards' ? 'grid' : 'none';
    if (tableContainer) tableContainer.style.display = mode === 'table' ? 'block' : 'none';

    this.filterAndRenderCartera();
  },

  renderCarteraClientes() {
    const clients = this.clients || [];
    const payments = this.payments || [];

    const totalDebtPesos = clients.reduce((acc, c) => acc + (Number(c.currentDebtPesos) || 0), 0);
    const totalDebtGrams = clients.reduce((acc, c) => acc + (Number(c.currentDebtGrams) || 0), 0);
    const activeClientsCount = clients.filter(c => (Number(c.currentDebtPesos) || 0) > 0).length;
    const cleanClientsCount = clients.length - activeClientsCount;
    const totalCreditLimit = clients.reduce((acc, c) => acc + (Number(c.creditLimitPesos) || 0), 0);
    const avgUsagePct = totalCreditLimit > 0 ? Math.round((totalDebtPesos / totalCreditLimit) * 100) : 0;

    // Retal received from clients in CxC payments
    const cxcPayments = payments.filter(p => p.type === 'abono_cxc');
    const totalRetalGrams = cxcPayments.reduce((acc, p) => acc + (Number(p.scrapGoldGrams) || 0), 0);
    const totalRetalPesos = cxcPayments.reduce((acc, p) => acc + (Number(p.scrapGoldEquivalent) || 0), 0);

    const elTotalPesos = document.getElementById('cartera-kpi-total-pesos');
    const elTotalGrams = document.getElementById('cartera-kpi-total-grams');
    const elActiveClients = document.getElementById('cartera-kpi-active-clients');
    const elCleanClients = document.getElementById('cartera-kpi-clean-clients');
    const elCreditLimit = document.getElementById('cartera-kpi-total-credit-limit');
    const elCreditUsage = document.getElementById('cartera-kpi-credit-usage-pct');
    const elRetalGrams = document.getElementById('cartera-kpi-retal-grams');
    const elRetalPesos = document.getElementById('cartera-kpi-retal-pesos');

    if (elTotalPesos) elTotalPesos.innerText = `$${totalDebtPesos.toLocaleString('es-CO')}`;
    if (elTotalGrams) elTotalGrams.innerText = `${totalDebtGrams.toFixed(2)} g Oro 18K equiv.`;
    if (elActiveClients) elActiveClients.innerText = `${activeClientsCount} / ${clients.length}`;
    if (elCleanClients) elCleanClients.innerText = `${cleanClientsCount} al día (sin saldo)`;
    if (elCreditLimit) elCreditLimit.innerText = `$${totalCreditLimit.toLocaleString('es-CO')}`;
    if (elCreditUsage) elCreditUsage.innerText = `${avgUsagePct}% utilizado en total`;
    if (elRetalGrams) elRetalGrams.innerText = `${totalRetalGrams.toFixed(2)} g`;
    if (elRetalPesos) elRetalPesos.innerText = `Valorizado: $${totalRetalPesos.toLocaleString('es-CO')}`;

    this.filterAndRenderCartera();
  },

  filterAndRenderCartera() {
    const searchVal = (document.getElementById('cartera-search-input')?.value || '').toLowerCase().trim();
    const statusVal = document.getElementById('cartera-status-filter')?.value || 'all';
    const sortVal = document.getElementById('cartera-sort-filter')?.value || 'mayor-deuda-pesos';

    let list = [...(this.clients || [])];

    // Filter by text search
    if (searchVal) {
      list = list.filter(c => {
        const name = (c.name || '').toLowerCase();
        const trade = (c.tradeName || '').toLowerCase();
        const doc = (c.documentNumber || '').toLowerCase();
        const city = (c.city || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return name.includes(searchVal) || trade.includes(searchVal) || doc.includes(searchVal) || city.includes(searchVal) || phone.includes(searchVal);
      });
    }

    // Filter by status
    if (statusVal === 'con-saldo') {
      list = list.filter(c => (Number(c.currentDebtPesos) || 0) > 0);
    } else if (statusVal === 'al-dia') {
      list = list.filter(c => (Number(c.currentDebtPesos) || 0) <= 0);
    } else if (statusVal === 'limite-alto') {
      list = list.filter(c => {
        const debt = Number(c.currentDebtPesos) || 0;
        const limit = Number(c.creditLimitPesos) || 50000000;
        return limit > 0 && (debt / limit) >= 0.7;
      });
    } else if (statusVal === 'riesgo-c') {
      list = list.filter(c => (c.riskLevel || '').startsWith('C'));
    }

    // Sorting
    list.sort((a, b) => {
      const debtA = Number(a.currentDebtPesos) || 0;
      const debtB = Number(b.currentDebtPesos) || 0;
      const gramsA = Number(a.currentDebtGrams) || 0;
      const gramsB = Number(b.currentDebtGrams) || 0;
      const limitA = Number(a.creditLimitPesos) || 0;
      const limitB = Number(b.creditLimitPesos) || 0;
      const usageA = limitA > 0 ? (debtA / limitA) : 0;
      const usageB = limitB > 0 ? (debtB / limitB) : 0;

      if (sortVal === 'mayor-deuda-pesos') return debtB - debtA;
      if (sortVal === 'mayor-deuda-gramos') return gramsB - gramsA;
      if (sortVal === 'mayor-cupo') return limitB - limitA;
      if (sortVal === 'mayor-uso-cupo') return usageB - usageA;
      if (sortVal === 'nombre-az') return (a.tradeName || a.name || '').localeCompare(b.tradeName || b.name || '');
      return 0;
    });

    const cardsContainer = document.getElementById('cartera-cards-container');
    const tableBody = document.getElementById('cartera-table-body');

    if (cardsContainer) {
      if (list.length === 0) {
        cardsContainer.innerHTML = `
          <div class="empty-state-box">
            <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
            <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-headings);">No se encontraron clientes con los filtros aplicados</div>
            <div style="font-size: 0.85rem; color: var(--text-dim); margin-top: 4px;">Intenta cambiar el término de búsqueda o restablecer los filtros de cartera.</div>
          </div>
        `;
      } else {
        cardsContainer.innerHTML = list.map(client => {
          const stats = this.getClientCarteraStats(client.id);
          const debtPesos = Number(client.currentDebtPesos) || 0;
          const debtGrams = Number(client.currentDebtGrams) || 0;
          const creditLimit = Number(client.creditLimitPesos) || 50000000;
          const usagePct = stats.usagePct;

          let cardClass = 'client-cartera-card';
          if (debtPesos > 0 && usagePct >= 70) cardClass += ' has-high-debt';
          else if (debtPesos === 0) cardClass += ' is-clean';

          let barColor = '#10b981';
          if (usagePct >= 80) barColor = '#ef4444';
          else if (usagePct >= 50) barColor = '#f59e0b';

          let riskBadge = `<span class="stat-badge pos">A - Excelente</span>`;
          if ((client.riskLevel || '').startsWith('B')) riskBadge = `<span class="stat-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">B - Normal</span>`;
          else if ((client.riskLevel || '').startsWith('C')) riskBadge = `<span class="stat-badge neg">C - Observación</span>`;

          return `
            <div class="${cardClass}">
              <div>
                <div class="cartera-card-header">
                  <div>
                    <div class="cartera-card-title">${client.tradeName || client.name}</div>
                    <div class="cartera-card-sub">${client.name} • ${client.documentType}: ${client.documentNumber}</div>
                    <div class="cartera-card-sub" style="color: var(--gold-light); font-weight: 600;">📍 ${client.city || 'Colombia'}</div>
                  </div>
                  <div>${riskBadge}</div>
                </div>

                <div class="cartera-card-debt-box">
                  <div>
                    <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase;">Saldo Pendiente</div>
                    <div class="cartera-debt-amount" style="color: ${debtPesos > 0 ? '#f87171' : '#34d399'};">
                      $${debtPesos.toLocaleString('es-CO')}
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase;">Equiv. Oro 18K</div>
                    <div class="cartera-debt-grams">${debtGrams.toFixed(2)} g</div>
                  </div>
                </div>

                <div class="credit-meter-wrapper">
                  <div class="credit-meter-labels">
                    <span>Cupo: <strong>$${creditLimit.toLocaleString('es-CO')}</strong></span>
                    <span>Uso: <strong style="color: ${barColor};">${usagePct}%</strong> (Disp: $${stats.availableCredit.toLocaleString('es-CO')})</span>
                  </div>
                  <div class="credit-bar-track">
                    <div class="credit-bar-fill" style="width: ${usagePct}%; background: ${barColor};"></div>
                  </div>
                </div>

                <div class="cartera-card-metrics-row">
                  <div class="cartera-metric-cell">
                    <span>Facturado Histórico</span>
                    <span>$${stats.totalPurchases.toLocaleString('es-CO')} (${stats.totalGramsPurchased.toFixed(1)}g)</span>
                  </div>
                  <div class="cartera-metric-cell">
                    <span>Abonado en Retal</span>
                    <span style="color: #fbbf24;">${stats.totalScrapGrams.toFixed(2)}g ($${stats.totalScrapAmount.toLocaleString('es-CO')})</span>
                  </div>
                </div>
              </div>

              <div class="cartera-card-actions">
                <button class="btn btn-gold btn-sm" onclick="App.openClientCarteraDetail('${client.id}')" title="Ver Expediente Completo">
                  🔍 Ver Cartera
                </button>
                <button class="btn btn-outline-gold btn-sm" onclick="App.openAbonoModal('${client.id}', 'cxc')" title="Registrar Abono">
                  💰 Abonar
                </button>
                <button class="btn btn-outline-gold btn-sm" onclick="App.sendClientWhatsApp('${client.id}')" title="Enviar Estado por WhatsApp">
                  💬 WhatsApp
                </button>
                <button class="btn btn-secondary btn-sm" onclick="App.openStatementPrintModal('${client.id}')" title="Imprimir Estado de Cuenta">
                  📄 Estado
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    if (tableBody) {
      if (list.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 30px;">No se encontraron clientes con los filtros aplicados</td></tr>`;
      } else {
        tableBody.innerHTML = list.map(client => {
          const stats = this.getClientCarteraStats(client.id);
          const debtPesos = Number(client.currentDebtPesos) || 0;
          const debtGrams = Number(client.currentDebtGrams) || 0;
          const creditLimit = Number(client.creditLimitPesos) || 50000000;
          const usagePct = stats.usagePct;

          let barColor = '#10b981';
          if (usagePct >= 80) barColor = '#ef4444';
          else if (usagePct >= 50) barColor = '#f59e0b';

          let riskBadge = `<span class="stat-badge pos">A</span>`;
          if ((client.riskLevel || '').startsWith('B')) riskBadge = `<span class="stat-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">B</span>`;
          else if ((client.riskLevel || '').startsWith('C')) riskBadge = `<span class="stat-badge neg">C</span>`;

          return `
            <tr>
              <td>
                <strong>${client.tradeName || client.name}</strong>
                <div style="font-size: 0.75rem; color: var(--text-dim);">${client.name} • ${client.documentType}: ${client.documentNumber}</div>
              </td>
              <td>
                <div>${client.city || 'Colombia'}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${client.phone || ''}</div>
              </td>
              <td class="text-center">${riskBadge}</td>
              <td class="text-right mono">$${creditLimit.toLocaleString('es-CO')}</td>
              <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div class="credit-bar-track" style="width: 80px;">
                    <div class="credit-bar-fill" style="width: ${usagePct}%; background: ${barColor};"></div>
                  </div>
                  <span class="mono" style="font-size: 0.75rem; color: ${barColor}; font-weight: 700;">${usagePct}%</span>
                </div>
              </td>
              <td class="text-right mono" style="font-weight: 800; font-size: 1.05rem; color: ${debtPesos > 0 ? '#f87171' : '#34d399'};">
                $${debtPesos.toLocaleString('es-CO')}
              </td>
              <td class="text-right mono" style="font-weight: 700; color: var(--gold-light);">
                ${debtGrams.toFixed(2)} g
              </td>
              <td style="font-size: 0.8rem; color: var(--text-muted);">${client.lastPaymentDate || 'Sin registro'}</td>
              <td class="text-center" style="white-space: nowrap;">
                <button class="btn btn-gold btn-sm" onclick="App.openClientCarteraDetail('${client.id}')" style="padding: 4px 8px;" title="Ver Detalle de Cartera">
                  🔍 Detalle
                </button>
                <button class="btn btn-outline-gold btn-sm" onclick="App.openAbonoModal('${client.id}', 'cxc')" style="padding: 4px 8px;" title="Registrar Abono">
                  💰 Abonar
                </button>
                <button class="btn btn-secondary btn-sm" onclick="App.openStatementPrintModal('${client.id}')" style="padding: 4px 8px;" title="Imprimir Estado">
                  📄
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  },

  getClientCarteraStats(clientId) {
    const client = this.clients.find(c => c.id === clientId) || {};
    const clientOrders = (this.orders || []).filter(o => o.clientId === clientId);
    const clientPayments = (this.payments || []).filter(p => p.entityId === clientId && p.type === 'abono_cxc');

    const totalPurchases = clientOrders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
    const totalGramsPurchased = clientOrders.reduce((acc, o) => acc + (Number(o.totalGrams) || 0), 0);

    const totalPaidCash = clientPayments.reduce((acc, p) => acc + (Number(p.amountPesos) || 0), 0);
    const totalScrapGrams = clientPayments.reduce((acc, p) => acc + (Number(p.scrapGoldGrams) || 0), 0);
    const totalScrapAmount = clientPayments.reduce((acc, p) => acc + (Number(p.scrapGoldEquivalent) || 0), 0);
    const totalCredited = clientPayments.reduce((acc, p) => acc + (Number(p.totalCredited) || 0), 0);

    const creditLimit = Number(client.creditLimitPesos) || 50000000;
    const currentDebt = Number(client.currentDebtPesos) || 0;
    const availableCredit = Math.max(0, creditLimit - currentDebt);
    const usagePct = creditLimit > 0 ? Math.min(100, Math.round((currentDebt / creditLimit) * 100)) : 0;

    return {
      totalPurchases,
      totalGramsPurchased,
      totalPaidCash,
      totalScrapGrams,
      totalScrapAmount,
      totalCredited,
      creditLimit,
      currentDebt,
      availableCredit,
      usagePct,
      ordersCount: clientOrders.length,
      paymentsCount: clientPayments.length
    };
  },

  getClientLedger(clientId) {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return [];

    const ledger = [];
    const clientOrders = (this.orders || []).filter(o => o.clientId === clientId);
    const clientPayments = (this.payments || []).filter(p => p.entityId === clientId && p.type === 'abono_cxc');

    // Orders with credit
    clientOrders.forEach(o => {
      const detail = o.paymentDetail || {};
      const isCredit = o.paymentType === 'Credito';
      const creditAmt = isCredit ? o.totalAmount : (Number(detail.creditAmount) || 0);

      if (creditAmt > 0) {
        ledger.push({
          date: o.date,
          ref: o.remisionNumber,
          concept: `Despacho mayorista ${o.remisionNumber} (${(o.totalGrams || 0).toFixed(2)}g oro)`,
          type: 'debito',
          grams: o.totalGrams || 0,
          debit: creditAmt,
          credit: 0,
          sourceObj: o,
          sourceType: 'order'
        });
      }
    });

    // Payments
    clientPayments.forEach(p => {
      let concept = p.notes || `Abono a cartera (${p.paymentMethod || 'Efectivo'})`;
      let type = 'abono_dinero';
      if (p.scrapGoldGrams && Number(p.scrapGoldGrams) > 0) {
        type = 'abono_retal';
        concept = `Abono en Retal 18K: ${p.scrapGoldGrams}g @ $${(p.scrapGoldRate || 0).toLocaleString('es-CO')}/g + Dinero: $${(p.amountPesos || 0).toLocaleString('es-CO')}`;
      }

      ledger.push({
        date: p.date,
        ref: p.reference || 'ABN',
        concept: concept,
        type: type,
        grams: Number(p.scrapGoldGrams) || 0,
        debit: 0,
        credit: Number(p.totalCredited) || (Number(p.amountPesos) || 0),
        sourceObj: p,
        sourceType: 'payment'
      });
    });

    ledger.sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = 0;
    ledger.forEach(item => {
      running = running + item.debit - item.credit;
      item.runningBalance = running;
    });

    return ledger.slice().reverse();
  },

  openClientCarteraDetail(clientId) {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return;

    this.selectedCarteraClientId = clientId;
    this.selectedClientDetailTab = 'ledger';

    const modal = document.getElementById('modal-client-cartera-detail');
    if (!modal) return;

    const elName = document.getElementById('mccd-client-name');
    const elDoc = document.getElementById('mccd-client-doc');
    if (elName) elName.innerText = client.tradeName || client.name;
    if (elDoc) elDoc.innerText = `${client.name} • ${client.documentType || 'NIT'}: ${client.documentNumber} • 📍 ${client.city || 'Colombia'} • Tel: ${client.phone || ''}`;

    const stats = this.getClientCarteraStats(clientId);

    const kpisContainer = document.getElementById('mccd-kpis-container');
    if (kpisContainer) {
      kpisContainer.innerHTML = `
        <div class="client-detail-kpi-card gold-border">
          <div class="kpi-label">Saldo Pendiente Actual</div>
          <div class="kpi-val text-red">$${(Number(client.currentDebtPesos) || 0).toLocaleString('es-CO')}</div>
          <div style="font-size: 0.78rem; color: var(--gold-light); font-weight: 700; margin-top: 2px;">
            ${(Number(client.currentDebtGrams) || 0).toFixed(2)} g Oro 18K equiv.
          </div>
        </div>
        <div class="client-detail-kpi-card">
          <div class="kpi-label">Cupo de Crédito Concedido</div>
          <div class="kpi-val">$${stats.creditLimit.toLocaleString('es-CO')}</div>
          <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 2px;">
            Disponible: <strong style="color: #34d399;">$${stats.availableCredit.toLocaleString('es-CO')}</strong> (${100 - stats.usagePct}% libre)
          </div>
        </div>
        <div class="client-detail-kpi-card">
          <div class="kpi-label">Total Facturado Histórico</div>
          <div class="kpi-val">$${stats.totalPurchases.toLocaleString('es-CO')}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
            ${stats.totalGramsPurchased.toFixed(2)} g despachados
          </div>
        </div>
        <div class="client-detail-kpi-card">
          <div class="kpi-label">Abonos en Retal 18K</div>
          <div class="kpi-val text-amber">${stats.totalScrapGrams.toFixed(2)} g</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
            Valorizado en: $${stats.totalScrapAmount.toLocaleString('es-CO')}
          </div>
        </div>
        <div class="client-detail-kpi-card">
          <div class="kpi-label">Abonos en Dinero (Bancos/Caja)</div>
          <div class="kpi-val text-green">$${stats.totalPaidCash.toLocaleString('es-CO')}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
            Total acreditado: $${stats.totalCredited.toLocaleString('es-CO')}
          </div>
        </div>
      `;
    }

    const badgeRem = document.getElementById('mccd-badge-remisiones');
    const badgeAbo = document.getElementById('mccd-badge-abonos');
    if (badgeRem) badgeRem.innerText = stats.ordersCount;
    if (badgeAbo) badgeAbo.innerText = stats.paymentsCount;

    this.renderClientLedger(clientId);
    this.renderClientRemisiones(clientId);
    this.renderClientAbonos(clientId);

    this.switchClientDetailTab('ledger');

    modal.classList.add('active');
    if (window.soundEngine) window.soundEngine.playChime();
  },

  switchClientDetailTab(tabName) {
    this.selectedClientDetailTab = tabName;
    document.querySelectorAll('.cd-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    const paneLedger = document.getElementById('cd-tab-content-ledger');
    const paneRemisiones = document.getElementById('cd-tab-content-remisiones');
    const paneAbonos = document.getElementById('cd-tab-content-abonos');

    if (paneLedger) paneLedger.style.display = tabName === 'ledger' ? 'block' : 'none';
    if (paneRemisiones) paneRemisiones.style.display = tabName === 'remisiones' ? 'block' : 'none';
    if (paneAbonos) paneAbonos.style.display = tabName === 'abonos' ? 'block' : 'none';
  },

  renderClientLedger(clientId) {
    const tbody = document.getElementById('mccd-ledger-tbody');
    if (!tbody) return;

    const ledger = this.getClientLedger(clientId);

    if (ledger.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 30px;">No hay movimientos registrados para este cliente</td></tr>`;
      return;
    }

    tbody.innerHTML = ledger.map(item => {
      let badge = `<span class="badge-debito">Débito (+)</span>`;
      if (item.type === 'abono_retal') badge = `<span class="badge-retal">Retal 18K (-)</span>`;
      else if (item.type === 'abono_dinero') badge = `<span class="badge-credito">Abono (-)</span>`;

      return `
        <tr>
          <td style="font-size: 0.78rem; color: var(--text-muted);">${new Date(item.date).toLocaleString('es-CO')}</td>
          <td class="mono" style="font-weight: 700; color: var(--gold-primary);">${item.ref}</td>
          <td style="max-width: 300px; font-size: 0.82rem;">${item.concept}</td>
          <td>${badge}</td>
          <td class="text-right mono">${item.grams > 0 ? item.grams.toFixed(2) + ' g' : '-'}</td>
          <td class="text-right mono" style="font-weight: 700; color: ${item.debit > 0 ? '#f87171' : 'inherit'};">
            ${item.debit > 0 ? '$' + item.debit.toLocaleString('es-CO') : '-'}
          </td>
          <td class="text-right mono" style="font-weight: 700; color: ${item.credit > 0 ? '#34d399' : 'inherit'};">
            ${item.credit > 0 ? '$' + item.credit.toLocaleString('es-CO') : '-'}
          </td>
          <td class="text-right mono" style="font-weight: 800; font-size: 0.95rem; color: ${item.runningBalance > 0 ? '#f87171' : '#34d399'};">
            $${item.runningBalance.toLocaleString('es-CO')}
          </td>
        </tr>
      `;
    }).join('');
  },

  renderClientRemisiones(clientId) {
    const tbody = document.getElementById('mccd-remisiones-tbody');
    if (!tbody) return;

    const clientOrders = (this.orders || []).filter(o => o.clientId === clientId);

    if (clientOrders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 30px;">No hay despachos registrados para este cliente</td></tr>`;
      return;
    }

    tbody.innerHTML = clientOrders.map(order => {
      const detail = order.paymentDetail || {};
      const creditAmt = order.paymentType === 'Credito' ? order.totalAmount : (Number(detail.creditAmount) || 0);
      const paidCash = order.totalAmount - creditAmt;

      return `
        <tr>
          <td class="mono" style="font-weight: 700; color: var(--gold-primary);">${order.remisionNumber}</td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(order.date).toLocaleDateString('es-CO')}</td>
          <td class="text-right mono" style="font-weight: 700; color: var(--gold-light);">${(order.totalGrams || 0).toFixed(2)} g</td>
          <td class="text-right mono" style="font-weight: 700;">$${order.totalAmount.toLocaleString('es-CO')}</td>
          <td class="text-right mono" style="color: #34d399;">$${paidCash.toLocaleString('es-CO')}</td>
          <td class="text-right mono" style="color: ${creditAmt > 0 ? '#f87171' : 'var(--text-muted)'}; font-weight: 700;">
            $${creditAmt.toLocaleString('es-CO')}
          </td>
          <td>
            <span class="stat-badge ${order.status === 'Pagado' ? 'pos' : 'neg'}">${order.status}</span>
          </td>
          <td class="text-center">
            <button class="btn btn-secondary btn-sm" onclick="App.showRemisionPrintModal(App.orders.find(o => o.id === '${order.id}'))">
              📄
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderClientAbonos(clientId) {
    const tbody = document.getElementById('mccd-abonos-tbody');
    if (!tbody) return;

    const clientPayments = (this.payments || []).filter(p => p.entityId === clientId && p.type === 'abono_cxc');

    if (clientPayments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 30px;">No hay abonos registrados para este cliente</td></tr>`;
      return;
    }

    tbody.innerHTML = clientPayments.map(p => {
      const scrapGrams = Number(p.scrapGoldGrams) || 0;
      const scrapRate = Number(p.scrapGoldRate) || 0;
      const totalCred = Number(p.totalCredited) || (Number(p.amountPesos) || 0);

      return `
        <tr>
          <td class="mono" style="font-weight: 700; color: var(--gold-primary);">${p.reference || 'ABN'}</td>
          <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(p.date).toLocaleDateString('es-CO')}</td>
          <td><strong>${p.paymentMethod || 'Efectivo'}</strong></td>
          <td class="text-right mono" style="font-weight: 700; color: #fbbf24;">
            ${scrapGrams > 0 ? scrapGrams.toFixed(2) + ' g' : '-'}
          </td>
          <td class="text-right mono">${scrapRate > 0 ? '$' + scrapRate.toLocaleString('es-CO') : '-'}</td>
          <td class="text-right mono" style="font-weight: 800; color: #34d399; font-size: 1rem;">
            $${totalCred.toLocaleString('es-CO')}
          </td>
          <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 250px;">${p.notes || '-'}</td>
        </tr>
      `;
    }).join('');
  },

  openAbonoFromDetail() {
    if (!this.selectedCarteraClientId) return;
    const cid = this.selectedCarteraClientId;
    this.closeAllModals();
    this.openAbonoModal(cid, 'cxc');
  },

  openStatementFromDetail() {
    if (!this.selectedCarteraClientId) return;
    this.openStatementPrintModal(this.selectedCarteraClientId);
  },

  openClientWhatsAppFromDetail() {
    if (!this.selectedCarteraClientId) return;
    this.sendClientWhatsApp(this.selectedCarteraClientId);
  },

  sendClientWhatsApp(clientId) {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return;

    const phoneRaw = client.phone || '';
    const phoneClean = phoneRaw.replace(/[^0-9]/g, '');
    const debtPesos = Number(client.currentDebtPesos) || 0;
    const debtGrams = Number(client.currentDebtGrams) || 0;

    let msg = `Hola, cordial saludo de *Nexus por Mayor*. `
      + `Compartimos el estado actualizado de cartera para *${client.tradeName || client.name}*:\n\n`
      + `💰 *Saldo Pendiente:* $${debtPesos.toLocaleString('es-CO')} COP\n`
      + `⚖️ *Equivalente en Oro 18K:* ${debtGrams.toFixed(2)} g\n`
      + `📅 *Fecha:* ${new Date().toLocaleDateString('es-CO')}\n\n`
      + `Recuerda que recibimos abonos mediante transferencia bancaria o en *retal de oro 18K físico* valorizado a tasa del día. ¡Quedamos atentos!`;

    const url = `https://wa.me/${phoneClean ? phoneClean : ''}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  },

  openStatementPrintModal(clientId) {
    const client = this.clients.find(c => c.id === clientId);
    if (!client) return;

    const container = document.getElementById('statement-print-content');
    const modal = document.getElementById('modal-statement-print');
    if (!container || !modal) return;

    const stats = this.getClientCarteraStats(clientId);
    const ledger = this.getClientLedger(clientId);
    const debtPesos = Number(client.currentDebtPesos) || 0;
    const debtGrams = Number(client.currentDebtGrams) || 0;

    container.innerHTML = `
      <div class="statement-doc">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px;">
          <div>
            <h1 style="font-family: 'Cinzel', serif; font-size: 1.5rem; letter-spacing: 0.05em; margin: 0; color: #0f172a;">NEXUS POR MAYOR</h1>
            <p style="font-size: 0.8rem; color: #475569; margin: 2px 0 0;">Sistema de Gestión Mayorista de Joyería en Oro 18K Italiano & Nacional</p>
            <p style="font-size: 0.75rem; color: #64748b; margin: 2px 0 0;">NIT 901.442.118-9 • Medellín / Bogotá / Bucaramanga • PBX: +57 (4) 448-9210</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.15rem; font-weight: 800; color: #b45309; text-transform: uppercase;">ESTADO DE CUENTA DE CARTERA</div>
            <div style="font-size: 0.78rem; color: #64748b; margin-top: 4px;">Fecha de Expedición: ${new Date().toLocaleDateString('es-CO')}</div>
            <div style="font-size: 0.75rem; color: #64748b;">Hora: ${new Date().toLocaleTimeString('es-CO')}</div>
          </div>
        </div>

        <!-- Client Box -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
          <div>
            <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700;">Titular & Joyería:</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a;">${client.tradeName || client.name}</div>
            <div style="font-size: 0.82rem; color: #334155;">Representante: ${client.name}</div>
            <div style="font-size: 0.82rem; color: #334155;">${client.documentType}: ${client.documentNumber}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700;">Contacto & Ubicación:</div>
            <div style="font-size: 0.85rem; color: #334155;">📍 ${client.city || 'Colombia'}</div>
            <div style="font-size: 0.85rem; color: #334155;">📞 Tel: ${client.phone || 'N/A'}</div>
            <div style="font-size: 0.85rem; color: #334155;">Cupo Asignado: <strong>$${stats.creditLimit.toLocaleString('es-CO')}</strong></div>
          </div>
        </div>

        <!-- Balance Highlights -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px; text-align: center;">
            <div style="font-size: 0.72rem; color: #991b1b; text-transform: uppercase; font-weight: 700;">Saldo Total a Pagar</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #dc2626; font-family: monospace;">$${debtPesos.toLocaleString('es-CO')}</div>
          </div>
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; text-align: center;">
            <div style="font-size: 0.72rem; color: #92400e; text-transform: uppercase; font-weight: 700;">Equivalente en Oro 18K</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #b45309; font-family: monospace;">${debtGrams.toFixed(2)} g</div>
          </div>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; text-align: center;">
            <div style="font-size: 0.72rem; color: #166534; text-transform: uppercase; font-weight: 700;">Cupo Disponible</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #16a34a; font-family: monospace;">$${stats.availableCredit.toLocaleString('es-CO')}</div>
          </div>
        </div>

        <!-- Statement Movement Table -->
        <h4 style="font-size: 0.95rem; margin: 0 0 8px; color: #0f172a; text-transform: uppercase;">Detalle de Movimientos Recientes</h4>
        <table class="statement-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Comprobante</th>
              <th>Concepto</th>
              <th style="text-align: right;">Gramos</th>
              <th style="text-align: right;">Débito (+)</th>
              <th style="text-align: right;">Crédito (-)</th>
              <th style="text-align: right;">Saldo ($)</th>
            </tr>
          </thead>
          <tbody>
            ${ledger.length === 0 ? '<tr><td colspan="7" style="text-align: center; padding: 20px;">Sin movimientos registrados</td></tr>' : ledger.map(m => `
              <tr>
                <td>${new Date(m.date).toLocaleDateString('es-CO')}</td>
                <td style="font-weight: 700; font-family: monospace;">${m.ref}</td>
                <td>${m.concept}</td>
                <td style="text-align: right; font-family: monospace;">${m.grams > 0 ? m.grams.toFixed(2) + 'g' : '-'}</td>
                <td style="text-align: right; font-family: monospace; color: ${m.debit > 0 ? '#b91c1c' : 'inherit'};">
                  ${m.debit > 0 ? '$' + m.debit.toLocaleString('es-CO') : '-'}
                </td>
                <td style="text-align: right; font-family: monospace; color: ${m.credit > 0 ? '#15803d' : 'inherit'};">
                  ${m.credit > 0 ? '$' + m.credit.toLocaleString('es-CO') : '-'}
                </td>
                <td style="text-align: right; font-weight: 700; font-family: monospace;">
                  $${m.runningBalance.toLocaleString('es-CO')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Payment Channels Notice -->
        <div style="margin-top: 24px; padding: 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; font-size: 0.8rem; color: #475569;">
          <strong>Opciones de Cancelación y Pago de Cartera:</strong><br>
          1. Transferencia Bancaria a Bancolombia Cta Corriente # 031-442-990-11 a nombre de Nexus Joyería S.A.S.<br>
          2. Abono en Retal / Oro Chatarra 18K recibido y pesado en báscula certificada a la tasa oficial de retal del día.<br>
          3. Efectivo en Bóveda Principal. Favor remitir soporte de pago al WhatsApp de tesorería.
        </div>

        <div style="display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; border-top: 1px solid #cbd5e1; font-size: 0.78rem; color: #64748b;">
          <div>Elaborado por: <strong>Dpto. de Cartera & Bóveda Nexus</strong></div>
          <div>Recibido y Aceptado por Joyería: _____________________________</div>
        </div>
      </div>
    `;

    modal.classList.add('active');
    if (window.soundEngine) window.soundEngine.playChime();
  },

  printGlobalCarteraReport() {
    window.print();
  },

  // Cuentas por Pagar (CxP con Mano de Obra y Oro Puro en poder de talleres)
  renderCxP() {
    const tableBody = document.getElementById('cxp-table-body');
    if (!tableBody) return;

    if (this.suppliers.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 40px;">No hay proveedores registrados</td></tr>`;
      return;
    }

    tableBody.innerHTML = this.suppliers.map(sup => {
      const debtPesos = Number(sup.balanceDuePesos) || 0;
      const moRate = Number(sup.manoDeObraPerGram) || 0;
      const moBalance = Number(sup.balanceManoDeObra) || 0;
      const puroHands = Number(sup.puroInHandsGrams) || 0;
      const mercancia18k = puroHands > 0 ? Number((puroHands * 1.38).toFixed(2)) : 0;

      return `
        <tr>
          <td>
            <strong>${sup.name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${sup.contact} • Tel: ${sup.phone}</div>
          </td>
          <td>
            <span class="ticker-badge ${sup.category.includes('Italiano') ? 'badge-italian' : 'badge-nacional'}">
              ${sup.category}
            </span>
          </td>
          <td class="mono">$${moRate.toLocaleString('es-CO')} /g</td>
          <td class="text-right mono" style="font-weight: 800; color: #fbbf24;">
            ${puroHands.toFixed(2)} g
          </td>
          <td class="text-right mono" style="font-weight: 800; color: #34d399;">
            ${mercancia18k.toFixed(2)} g
            ${puroHands > 0 ? '<div style="font-size: 0.68rem; color: var(--text-dim); font-weight: normal;">(+38% liga)</div>' : ''}
          </td>
          <td class="text-right mono" style="color: #f87171;">
            $${moBalance.toLocaleString('es-CO')}
          </td>
          <td class="text-right mono" style="font-weight: 800; font-size: 1.05rem; color: ${debtPesos > 0 ? '#f87171' : '#34d399'};">
            $${debtPesos.toLocaleString('es-CO')}
          </td>
          <td class="text-center">
            <button class="btn btn-outline-gold btn-sm" onclick="App.openAbonoModal('${sup.id}', 'cxp')">
              💳 Pagar
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  // Historical Remisiones List View
  renderRemisionesList() {
    const tableBody = document.getElementById('remisiones-table-body');
    if (!tableBody) return;

    if (this.orders.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 40px;">No hay remisiones despachadas todavía</td></tr>`;
      return;
    }

    tableBody.innerHTML = this.orders.map(order => {
      return `
        <tr>
          <td class="mono" style="font-weight: 800; color: var(--gold-primary);">${order.remisionNumber || 'REM'}</td>
          <td>${order.date ? new Date(order.date).toLocaleDateString('es-CO') : '-'}</td>
          <td><strong>${order.clientName || 'Cliente'}</strong></td>
          <td class="text-right mono" style="font-weight: 700; color: var(--gold-light);">${Number(order.totalGrams || 0).toFixed(2)} g</td>
          <td class="text-right mono" style="font-weight: 800; color: var(--text-headings);">$${Number(order.totalAmount || 0).toLocaleString('es-CO')}</td>
          <td>
            <span class="stat-badge ${order.status === 'Pagado' ? 'pos' : 'neg'}">${order.status || 'Pendiente'}</span>
          </td>
          <td class="text-center">
            <button class="btn btn-secondary btn-sm" onclick="App.showRemisionPrintModal(App.orders.find(o => o.id === '${order.id}'))">
              📄 Ver Remisión
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  // =========================================================
  // GESTIÓN DE MÉTODOS DE PAGO (Transferencia, Efectivo, Crédito, Retal)
  // =========================================================

  onPaymentTypeChange() {
    const type = document.getElementById('pm-type').value;
    const secTransf = document.getElementById('pm-section-transferencia');
    const secCred = document.getElementById('pm-section-credito');
    const secCash = document.getElementById('pm-section-efectivo');
    const secRetal = document.getElementById('pm-section-retal');

    if (secTransf) secTransf.style.display = type === 'Transferencia' ? 'block' : 'none';
    if (secCred) secCred.style.display = type === 'Credito' ? 'block' : 'none';
    if (secCash) secCash.style.display = type === 'Efectivo' ? 'block' : 'none';
    if (secRetal) secRetal.style.display = type === 'Retal Oro' ? 'block' : 'none';
  },

  renderPaymentMethods() {
    const grid = document.getElementById('pm-cards-grid');
    if (!grid) return;

    let list = [...(this.paymentMethods || [])];
    const search = (document.getElementById('pm-search')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('pm-type-filter')?.value || 'all';

    // Stats calculation
    const activeTransfer = list.filter(m => m.type === 'Transferencia' && m.status === 'activo').length;
    const activeCash = list.filter(m => m.type === 'Efectivo' && m.status === 'activo').length;
    const activeCredit = list.filter(m => m.type === 'Credito' && m.status === 'activo').length;
    const scrapActive = list.some(m => m.type === 'Retal Oro' && m.status === 'activo');

    const statTrans = document.getElementById('pm-stat-transfer');
    const statTransSub = document.getElementById('pm-stat-transfer-sub');
    const statCash = document.getElementById('pm-stat-cash');
    const statCred = document.getElementById('pm-stat-credit');
    const statScrap = document.getElementById('pm-stat-scrap');

    if (statTrans) statTrans.innerText = activeTransfer;
    if (statTransSub) statTransSub.innerText = `${activeTransfer} cuenta${activeTransfer === 1 ? '' : 's'} bancaria${activeTransfer === 1 ? '' : 's'} activa${activeTransfer === 1 ? '' : 's'}`;
    if (statCash) statCash.innerText = activeCash;
    if (statCred) statCred.innerText = activeCredit;
    if (statScrap) {
      statScrap.innerText = scrapActive ? 'Habilitado' : 'Desactivado';
      statScrap.style.color = scrapActive ? '#34d399' : '#f87171';
    }

    // Filter
    if (typeFilter !== 'all') {
      list = list.filter(m => m.type === typeFilter);
    }
    if (search) {
      list = list.filter(m =>
        (m.name || '').toLowerCase().includes(search) ||
        (m.bank || '').toLowerCase().includes(search) ||
        (m.accountNumber || '').toLowerCase().includes(search) ||
        (m.accountHolder || '').toLowerCase().includes(search) ||
        (m.type || '').toLowerCase().includes(search)
      );
    }

    const countInd = document.getElementById('pm-count-indicator');
    if (countInd) countInd.innerText = `Mostrando ${list.length} método${list.length === 1 ? '' : 's'}`;

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="empty-state-box">
          <div style="font-size: 2.2rem; margin-bottom: 12px;">💳</div>
          <h4 style="color: var(--text-headings); margin-bottom: 6px;">No se encontraron métodos de pago</h4>
          <p style="font-size: 0.85rem; margin-bottom: 16px;">Prueba ajustando los filtros o registra uno nuevo.</p>
          <button class="btn btn-gold btn-sm" onclick="App.openNewPaymentMethodModal()">+ Registrar Nuevo Método</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = list.map(pm => {
      const isTransfer = pm.type === 'Transferencia';
      const isCredit = pm.type === 'Credito';
      const isCash = pm.type === 'Efectivo';
      const isScrap = pm.type === 'Retal Oro';

      const icon = isTransfer ? '🏦' : (isCash ? '💵' : (isCredit ? '⏳' : '♻️'));
      const badgeClass = isTransfer ? 'badge-italian' : (isCredit ? 'badge-nacional' : (isScrap ? 'badge-retal' : 'badge-bullion'));
      const isActive = pm.status === 'activo';

      let detailsHtml = '';
      if (isTransfer) {
        detailsHtml = `
          <div class="pm-detail-item">
            <span class="pm-detail-label">Entidad:</span>
            <span class="pm-detail-val">${pm.bank || 'Banco'} (${pm.accountType || 'Corriente'})</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-label">N° Cuenta:</span>
            <span class="pm-detail-val mono">
              ${pm.accountNumber || 'S/N'}
              ${pm.accountNumber ? `
                <button class="pm-copy-btn" onclick="App.copyToClipboard('${pm.accountNumber}', '¡Número de cuenta copiado!')" title="Copiar cuenta">
                  📋 Copiar
                </button>
              ` : ''}
            </span>
          </div>
          ${pm.accountHolder ? `
            <div class="pm-detail-item">
              <span class="pm-detail-label">Titular:</span>
              <span class="pm-detail-val">${pm.accountHolder}</span>
            </div>
          ` : ''}
          ${pm.documentId ? `
            <div class="pm-detail-item">
              <span class="pm-detail-label">Documento:</span>
              <span class="pm-detail-val mono" style="font-size: 0.78rem;">${pm.documentId}</span>
            </div>
          ` : ''}
        `;
      } else if (isCredit) {
        detailsHtml = `
          <div class="pm-detail-item">
            <span class="pm-detail-label">Plazo:</span>
            <span class="pm-detail-val mono" style="color: var(--gold-light); font-weight: 800;">${pm.creditDays || 0} Días Calendario</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-label">Recargo / Interés:</span>
            <span class="pm-detail-val mono">${pm.surchargePercent > 0 ? `+${pm.surchargePercent}% mensual` : 'Sin recargo (0%)'}</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-label">Condición:</span>
            <span class="pm-detail-val" style="font-size: 0.75rem;">Requiere cupo aprobado</span>
          </div>
        `;
      } else if (isCash) {
        detailsHtml = `
          <div class="pm-detail-item">
            <span class="pm-detail-label">Sede / Ubicación:</span>
            <span class="pm-detail-val">${pm.accountHolder || 'Caja Central'}</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-label">Moneda:</span>
            <span class="pm-detail-val mono" style="color: var(--emerald-accent); font-weight: 700;">Pesos Colombianos (COP)</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-label">Modalidad:</span>
            <span class="pm-detail-val">Entrega física en mostrador</span>
          </div>
        `;
      } else if (isScrap) {
        detailsHtml = `
          <div class="pm-detail-item">
            <span class="pm-detail-label">Tipo Metal:</span>
            <span class="pm-detail-val mono" style="color: var(--danger-accent); font-weight: 800;">Retal Oro 18K (Ley 750)</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-label">Tasa Liquidación:</span>
            <span class="pm-detail-val mono">$${(this.rates.retal_oro18k_compra || 255000).toLocaleString('es-CO')}/g</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-label">Ensayo:</span>
            <span class="pm-detail-val" style="font-size: 0.75rem;">Balanza hidrostática / Ácido</span>
          </div>
        `;
      }

      return `
        <div class="pm-card ${isActive ? '' : 'pm-inactive'}">
          <div>
            <div class="pm-card-header">
              <div style="display: flex; gap: 12px; align-items: center;">
                <div class="pm-icon-wrap">${icon}</div>
                <div>
                  <div class="pm-card-title">${pm.name}</div>
                  <div class="pm-meta-row">
                    <span class="ticker-badge ${badgeClass}">${pm.type}</span>
                    ${pm.isDefault ? `<span class="ticker-badge badge-bullion" style="font-size: 0.68rem;">⭐ Predeterminado</span>` : ''}
                  </div>
                </div>
              </div>
            </div>

            <div class="pm-details-box">
              ${detailsHtml}
            </div>

            ${pm.instructions ? `
              <div class="pm-instructions">
                <strong>Nota:</strong> ${pm.instructions}
              </div>
            ` : ''}
          </div>

          <div class="pm-card-footer">
            <button class="pm-status-pill ${isActive ? 'pm-status-active' : 'pm-status-inactive'}" onclick="App.togglePaymentMethodStatus('${pm.id}')" title="Clic para alternar estado">
              ${isActive ? '● Activo' : '○ Inactivo'}
            </button>

            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-sm" onclick="App.openEditPaymentMethodModal('${pm.id}')" title="Editar Método de Pago">
                ✏️ Editar
              </button>
              <button class="btn btn-secondary btn-icon btn-sm" onclick="App.deletePaymentMethod('${pm.id}')" title="Eliminar Método de Pago" style="color: #f87171;">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  openNewPaymentMethodModal() {
    document.getElementById('pm-id').value = '';
    document.getElementById('modal-pm-title').innerText = 'Registrar Nuevo Método de Pago';
    document.getElementById('pm-name').value = '';
    document.getElementById('pm-type').value = 'Transferencia';
    document.getElementById('pm-bank').value = 'Bancolombia';
    document.getElementById('pm-account-type').value = 'Corriente';
    document.getElementById('pm-account-num').value = '';
    document.getElementById('pm-doc').value = '';
    document.getElementById('pm-holder').value = '';
    document.getElementById('pm-credit-days').value = '15';
    document.getElementById('pm-surcharge').value = '0';
    document.getElementById('pm-cash-loc').value = '';
    document.getElementById('pm-cash-curr').value = 'COP';
    document.getElementById('pm-instructions').value = '';
    document.getElementById('pm-is-active').checked = true;
    document.getElementById('pm-is-default').checked = false;

    this.onPaymentTypeChange();
    this.openModal('modal-payment-method');
  },

  openEditPaymentMethodModal(id) {
    const pm = this.paymentMethods.find(m => m.id === id);
    if (!pm) return;

    document.getElementById('pm-id').value = pm.id;
    document.getElementById('modal-pm-title').innerText = `Editar Método: ${pm.name}`;
    document.getElementById('pm-name').value = pm.name || '';
    document.getElementById('pm-type').value = pm.type || 'Transferencia';
    document.getElementById('pm-bank').value = pm.bank || 'Bancolombia';
    document.getElementById('pm-account-type').value = pm.accountType || 'Corriente';
    document.getElementById('pm-account-num').value = pm.accountNumber || '';
    document.getElementById('pm-doc').value = pm.documentId || '';
    document.getElementById('pm-holder').value = pm.accountHolder || '';
    document.getElementById('pm-credit-days').value = String(pm.creditDays || 15);
    document.getElementById('pm-surcharge').value = String(pm.surchargePercent || 0);
    document.getElementById('pm-cash-loc').value = pm.accountHolder || '';
    document.getElementById('pm-cash-curr').value = 'COP';
    document.getElementById('pm-instructions').value = pm.instructions || '';
    document.getElementById('pm-is-active').checked = pm.status === 'activo';
    document.getElementById('pm-is-default').checked = Boolean(pm.isDefault);

    this.onPaymentTypeChange();
    this.openModal('modal-payment-method');
  },

  async submitPaymentMethodForm() {
    const id = document.getElementById('pm-id').value;
    const name = document.getElementById('pm-name').value.trim();
    const type = document.getElementById('pm-type').value;

    if (!name) {
      alert('Por favor ingresa un nombre para el método de pago.');
      return;
    }

    let bank = '';
    let accountType = '';
    let accountNumber = '';
    let accountHolder = '';
    let documentId = '';
    let creditDays = 0;
    let surchargePercent = 0;

    if (type === 'Transferencia') {
      bank = document.getElementById('pm-bank').value;
      accountType = document.getElementById('pm-account-type').value;
      accountNumber = document.getElementById('pm-account-num').value.trim();
      documentId = document.getElementById('pm-doc').value.trim();
      accountHolder = document.getElementById('pm-holder').value.trim();
    } else if (type === 'Credito') {
      creditDays = parseInt(document.getElementById('pm-credit-days').value) || 0;
      surchargePercent = parseFloat(document.getElementById('pm-surcharge').value) || 0;
      accountHolder = 'Cartera Mayorista';
    } else if (type === 'Efectivo') {
      accountHolder = document.getElementById('pm-cash-loc').value.trim() || 'Caja Principal';
      accountType = document.getElementById('pm-cash-curr').value;
    } else if (type === 'Retal Oro') {
      accountType = 'Oro Ley 750';
      accountHolder = 'Bóveda de Recibo & Fundición';
    }

    const instructions = document.getElementById('pm-instructions').value.trim();
    const status = document.getElementById('pm-is-active').checked ? 'activo' : 'inactivo';
    const isDefault = document.getElementById('pm-is-default').checked;

    const payload = {
      name,
      type,
      bank,
      accountType,
      accountNumber,
      accountHolder,
      documentId,
      creditDays,
      surchargePercent,
      instructions,
      status,
      isDefault
    };

    try {
      let res;
      if (id) {
        res = await fetch(`/api/payment-methods/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      } else {
        res = await fetch('/api/payment-methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      }

      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(id ? '¡Método de pago actualizado exitosamente!' : '¡Método de pago registrado exitosamente!');
        this.closeAllModals();
        await this.refreshAllData();
        this.render();
      } else {
        alert('Error: ' + res.message);
      }
    } catch (e) {
      alert('Error de red al guardar el método de pago.');
    }
  },

  async togglePaymentMethodStatus(id) {
    try {
      const res = await fetch(`/api/payment-methods/${id}/toggle`, { method: 'PATCH' }).then(r => r.json());
      if (res.success) {
        if (window.soundEngine) window.soundEngine.playChime();
        await this.refreshAllData();
        this.render();
      }
    } catch (e) {
      alert('Error al cambiar el estado del método de pago.');
    }
  },

  async deletePaymentMethod(id) {
    const pm = this.paymentMethods.find(m => m.id === id);
    if (!pm) return;

    if (!confirm(`¿Estás seguro de que deseas eliminar el método de pago "${pm.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/payment-methods/${id}`, { method: 'DELETE' }).then(r => r.json());
      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(res.message || 'Método de pago eliminado.');
        await this.refreshAllData();
        this.render();
      }
    } catch (e) {
      alert('Error al eliminar el método de pago.');
    }
  },

  copyToClipboard(text, msg = '¡Copiado al portapapeles!') {
    navigator.clipboard.writeText(text).then(() => {
      if (window.soundEngine) window.soundEngine.playChime();
      alert(msg);
    }).catch(() => {
      prompt('Copia manualmente:', text);
    });
  },

  // Modal: Registrar Compra de Puro 24K (Granalla)
  openCompraPuroModal() {
    // Populate suppliers
    const supSelect = document.getElementById('compra-puro-supplier-select');
    if (supSelect) {
      supSelect.innerHTML = `<option value="">-- Seleccionar Proveedor de Oro Puro --</option>` +
        this.suppliers.map(s => `<option value="${s.id}">${s.name} (${s.category})</option>`).join('');
    }
    document.getElementById('compra-puro-grams').value = '';
    document.getElementById('compra-puro-cost').value = this.averages.promedioPuro24k || 404810;
    this.openModal('modal-compra-puro');
  },

  openNewPurchaseModal() {
    this.openCompraPuroModal();
  },

  async submitCompraPuro() {
    const grams = parseFloat(document.getElementById('compra-puro-grams').value) || 0;
    const costPerGram = parseFloat(document.getElementById('compra-puro-cost').value) || 0;
    const supplierId = document.getElementById('compra-puro-supplier-select').value;
    const invoiceRef = document.getElementById('compra-puro-ref').value;
    const notes = document.getElementById('compra-puro-notes').value;

    if (grams <= 0 || costPerGram <= 0) {
      alert('Ingresa un gramaje y costo por gramo válidos.');
      return;
    }

    try {
      const res = await fetch('/api/puro/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grams, costPerGram, supplierId, invoiceRef, notes })
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(`¡Compra de ${grams}g de Puro 24K registrada! Nuevo costo promedio ponderado de puro: $${res.newAverageCost.toLocaleString('es-CO')}/g`);
        this.closeAllModals();
        await this.refreshAllData();
        this.render();
      }
    } catch (e) {
      alert('Error al registrar compra de puro.');
    }
  },

  // Modal: Entregar Oro Puro 24K a Taller
  openEntregaPuroModal(supplierId = null) {
    const supSelect = document.getElementById('entrega-puro-supplier-select');
    if (supSelect) {
      supSelect.innerHTML = `<option value="">-- Seleccionar Taller / Proveedor --</option>` +
        this.suppliers.map(s => `<option value="${s.id}" ${s.id === supplierId ? 'selected' : ''}>${s.name} (Puro en poder: ${s.puroInHandsGrams || 0}g)</option>`).join('');
    }
    document.getElementById('entrega-puro-stock-hint').innerText = 
      `Oro Puro 24K disponible en bóveda: ${(this.puroData.stockGrams || 0).toFixed(2)} g (Promedio: $${(this.averages.promedioPuro24k || 404810).toLocaleString('es-CO')}/g)`;
    document.getElementById('entrega-puro-grams').value = '';
    document.getElementById('entrega-puro-notes').value = '';

    this.openModal('modal-entrega-puro');
  },

  openNewDeliveryModal(supplierId = null) {
    this.openEntregaPuroModal(supplierId);
  },

  async submitEntregaPuro() {
    const supplierId = document.getElementById('entrega-puro-supplier-select').value;
    const grams24k = parseFloat(document.getElementById('entrega-puro-grams').value) || 0;
    const notes = document.getElementById('entrega-puro-notes').value;

    if (!supplierId) {
      alert('Selecciona un taller de destino.');
      return;
    }
    if (grams24k <= 0) {
      alert('Ingresa una cantidad de gramos válida.');
      return;
    }

    try {
      const res = await fetch('/api/puro/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId, grams24k, notes })
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(`¡Entregados ${grams24k}g de Puro 24K a ${res.supplier.name}! Saldo de puro actualizado.`);
        this.closeAllModals();
        await this.refreshAllData();
        this.render();
      } else {
        alert('Error: ' + res.message);
      }
    } catch (e) {
      alert('Error al registrar entrega de puro.');
    }
  },

  // Modal: Recibir Joyería de Taller (Liquidando Mano de Obra)
  openRecepcionTallerModal(supplierId = null) {
    const supSelect = document.getElementById('recep-supplier-select');
    if (supSelect) {
      supSelect.innerHTML = `<option value="">-- Seleccionar Taller / Proveedor --</option>` +
        this.suppliers.map(s => `<option value="${s.id}" ${s.id === supplierId ? 'selected' : ''}>${s.name} (M.O: $${(s.manoDeObraPerGram || 22000).toLocaleString('es-CO')}/g - Puro en poder: ${s.puroInHandsGrams || 0}g)</option>`).join('');
      
      supSelect.onchange = () => {
        const sup = this.suppliers.find(s => s.id === supSelect.value);
        if (sup) {
          document.getElementById('recep-mo-rate').value = sup.manoDeObraPerGram || 22000;
          document.getElementById('recep-puro-available-hint').innerText = `Oro puro en poder de este taller: ${sup.puroInHandsGrams || 0} g`;
        }
      };
      if (supplierId) supSelect.onchange();
    }

    document.getElementById('recep-grams-18k').value = '';
    document.getElementById('recep-puro-used').value = '';
    document.getElementById('recep-name').value = '';

    this.openModal('modal-recep-taller');
  },

  async submitRecepcionTaller() {
    const supplierId = document.getElementById('recep-supplier-select').value;
    const grams18kReceived = parseFloat(document.getElementById('recep-grams-18k').value) || 0;
    const grams24kUsed = parseFloat(document.getElementById('recep-puro-used').value) || 0;
    const category = document.getElementById('recep-category').value;
    const subcategory = document.getElementById('recep-subcategory').value;
    const name = document.getElementById('recep-name').value;
    const manoDeObraRate = parseFloat(document.getElementById('recep-mo-rate').value) || 22000;

    if (!supplierId || grams18kReceived <= 0) {
      alert('Selecciona el taller e ingresa los gramos recibidos.');
      return;
    }

    try {
      const res = await fetch('/api/puro/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          grams18kReceived,
          grams24kUsed,
          category,
          subcategory,
          name,
          manoDeObraRate
        })
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(`¡Recibido lote de ${grams18kReceived}g! Costo total integrado: $${res.item.costPerGram.toLocaleString('es-CO')}/g. Mano de obra cargada a CxP: $${res.delivery.manoDeObraTotal.toLocaleString('es-CO')}.`);
        this.closeAllModals();
        await this.refreshAllData();
        this.render();
      }
    } catch (e) {
      alert('Error al recibir joyería terminada.');
    }
  },

  // Modal for registering an Abono / Payment (CxC and CxP)
  openAbonoModal(entityId, type) {
    const modal = document.getElementById('modal-abono');
    if (!modal) return;

    const isCxC = type === 'cxc';
    const entity = isCxC 
      ? this.clients.find(c => c.id === entityId)
      : this.suppliers.find(s => s.id === entityId);

    if (!entity) return;

    document.getElementById('abono-type').value = isCxC ? 'abono_cxc' : 'pago_cxp';
    document.getElementById('abono-entity-id').value = entityId;
    document.getElementById('abono-entity-title').innerText = isCxC 
      ? `Abonar a Cartera: ${entity.tradeName || entity.name}`
      : `Registrar Pago a Proveedor/Taller: ${entity.name}`;

    const debtPesos = isCxC ? entity.currentDebtPesos : entity.balanceDuePesos;
    const debtGrams = isCxC ? entity.currentDebtGrams : entity.balanceDueGrams;

    document.getElementById('abono-current-debt-display').innerText = 
      `Saldo pendiente actual: $${debtPesos.toLocaleString('es-CO')} (${debtGrams.toFixed(2)} g oro)`;

    // Populate payment methods select dynamically
    const methodSelect = document.getElementById('abono-method-select');
    if (methodSelect && this.paymentMethods && this.paymentMethods.length > 0) {
      const activeMethods = this.paymentMethods.filter(m => m.status === 'activo');
      methodSelect.innerHTML = activeMethods.map(m => {
        const icon = m.type === 'Transferencia' ? '🏦' : (m.type === 'Efectivo' ? '💵' : (m.type === 'Credito' ? '⏳' : '♻️'));
        const extra = m.bank ? ` - ${m.bank}` : '';
        return `<option value="${m.name}">${icon} ${m.name}${extra}</option>`;
      }).join('') + `<option value="Mixto">🔀 Pago Mixto (Efectivo + Oro/Transf)</option>`;
    }

    // Reset and populate scrap inputs
    const scrapInput = document.getElementById('abono-scrap-grams');
    if (scrapInput) scrapInput.value = '';
    const rateInput = document.getElementById('abono-scrap-rate');
    if (rateInput) rateInput.value = this.rates.retal_oro18k_compra || 255000;
    const cashInput = document.getElementById('abono-cash-amount');
    if (cashInput) cashInput.value = '';
    const refInput = document.getElementById('abono-reference');
    if (refInput) refInput.value = '';
    this.recalcAbonoTotal();

    this.openModal('modal-abono');
  },

  recalcAbonoTotal() {
    const scrapG = parseFloat(document.getElementById('abono-scrap-grams')?.value) || 0;
    const scrapRate = parseFloat(document.getElementById('abono-scrap-rate')?.value) || (this.rates.retal_oro18k_compra || 255000);
    const scrapVal = Math.round(scrapG * scrapRate);

    const calcEl = document.getElementById('abono-scrap-val-calc');
    if (calcEl) calcEl.innerText = `+$${scrapVal.toLocaleString('es-CO')}`;

    const cashVal = parseFloat(document.getElementById('abono-cash-amount')?.value) || 0;
    const totalEl = document.getElementById('abono-total-credited-calc');
    if (totalEl) totalEl.innerText = `$${(cashVal + scrapVal).toLocaleString('es-CO')}`;
  },

  async submitAbono() {
    const type = document.getElementById('abono-type').value;
    const entityId = document.getElementById('abono-entity-id').value;
    const cashVal = parseFloat(document.getElementById('abono-cash-amount')?.value) || 0;
    const scrapG = parseFloat(document.getElementById('abono-scrap-grams')?.value) || 0;
    const scrapRate = parseFloat(document.getElementById('abono-scrap-rate')?.value) || (this.rates.retal_oro18k_compra || 255000);
    const method = document.getElementById('abono-method-select')?.value || 'Efectivo';
    const reference = document.getElementById('abono-reference')?.value || '';

    if (cashVal <= 0 && scrapG <= 0) {
      alert('Ingresa un monto en dinero o un peso en retal de oro para abonar.');
      return;
    }

    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          entityId,
          amountPesos: cashVal,
          scrapGoldGrams: scrapG,
          scrapGoldRate: scrapRate,
          paymentMethod: method,
          reference
        })
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert('¡Abono registrado con éxito en el libro mayor!');
        this.closeAllModals();
        await this.refreshAllData();
        this.render();
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al registrar abono.');
    }
  },

  // Modal: Nuevo Lote en Bóveda (NO PIECES, NO SALE PRICE)
  openNewItemModal() {
    document.getElementById('form-new-item')?.reset();
    const catSelect = document.getElementById('item-cat-input');
    if (catSelect && this.categories && this.categories.length > 0) {
      catSelect.innerHTML = this.categories.map(c => 
        `<option value="${c.slug}">${c.badgeText || c.name}</option>`
      ).join('');
    }
    if (catSelect) {
      catSelect.onchange = (e) => {
        const costInput = document.getElementById('item-cost-input');
        if (costInput) {
          costInput.value = e.target.value === 'italiano' 
            ? (this.averages.promedioItaliano || 283811) 
            : (this.averages.promedioNacional || 259514);
        }
      };
      catSelect.dispatchEvent(new Event('change'));
    }
    this.openModal('modal-new-item');
  },

  async submitNewItem() {
    const code = document.getElementById('item-code-input').value;
    const name = document.getElementById('item-name-input').value;
    const category = document.getElementById('item-cat-input').value;
    const subcategory = document.getElementById('item-subcat-input').value;
    const weightGrams = parseFloat(document.getElementById('item-weight-input').value) || 0;
    const costPerGram = parseFloat(document.getElementById('item-cost-input').value) || 0;
    const origin = document.getElementById('item-origin-input').value;

    if (!name || weightGrams <= 0) {
      alert('Ingresa una descripción y un gramaje válido mayor a cero.');
      return;
    }

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code, name, category, subcategory, weightGrams, costPerGram, origin
        })
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert(`¡Lote ${res.item.name} de ${res.item.weightGrams}g ingresado exitosamente!`);
        this.closeAllModals();
        await this.refreshAllData();
        this.renderInventory();
      }
    } catch (err) {
      console.error(err);
      alert('Error al guardar el nuevo lote.');
    }
  },

  // =========================================================
  // CUADRE DE CAJA & ARQUEO DIARIO
  // =========================================================
  cuadrePeriod: 'hoy',
  cuadreData: null,
  cuadreCustomStart: '',
  cuadreCustomEnd: '',

  async setCuadrePeriod(period) {
    this.cuadrePeriod = period;
    if (window.soundEngine) window.soundEngine.playChime();

    document.querySelectorAll('.cuadre-tab').forEach(tab => {
      if (tab.getAttribute('data-period') === period) {
        tab.classList.add('btn-gold', 'active');
        tab.classList.remove('btn-secondary');
      } else {
        tab.classList.remove('btn-gold', 'active');
        tab.classList.add('btn-secondary');
      }
    });

    const customDiv = document.getElementById('cuadre-custom-range');
    if (customDiv) {
      customDiv.style.display = period === 'custom' ? 'flex' : 'none';
      if (period === 'custom' && !document.getElementById('cuadre-start-date').value) {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('cuadre-start-date').value = today;
        document.getElementById('cuadre-end-date').value = today;
      }
    }

    const labelMap = {
      hoy: 'Hoy (Día en curso)',
      ayer: 'Ayer',
      semana: 'Últimos 7 Días',
      mes: 'Este Mes',
      todos: 'Histórico Completo',
      custom: 'Rango Personalizado'
    };
    const labelEl = document.getElementById('cuadre-active-period-label');
    if (labelEl) labelEl.innerText = `Periodo Activo: ${labelMap[period] || period}`;

    await this.loadCuadreData();
    this.renderCuadreCaja();
  },

  async applyCustomCuadreRange() {
    this.cuadreCustomStart = document.getElementById('cuadre-start-date').value;
    this.cuadreCustomEnd = document.getElementById('cuadre-end-date').value;
    if (!this.cuadreCustomStart || !this.cuadreCustomEnd) {
      alert('Por favor selecciona las fechas de inicio y fin.');
      return;
    }
    await this.loadCuadreData();
    this.renderCuadreCaja();
  },

  async loadCuadreData() {
    try {
      let url = `/api/cuadre-caja?period=${this.cuadrePeriod}`;
      if (this.cuadrePeriod === 'custom' && this.cuadreCustomStart && this.cuadreCustomEnd) {
        url += `&startDate=${this.cuadreCustomStart}&endDate=${this.cuadreCustomEnd}`;
      }
      const res = await fetch(url).then(r => r.json());
      if (res.success) {
        this.cuadreData = res;
      }
    } catch (e) {
      console.error('Error cargando cuadre de caja:', e);
    }
  },

  async renderCuadreCaja() {
    if (!this.cuadreData) {
      await this.loadCuadreData();
    }
    if (!this.cuadreData) return;

    const { summary, items } = this.cuadreData;

    // 1. KPI Cards
    const elIn = document.getElementById('cuadre-kpi-inflows');
    const elInSub = document.getElementById('cuadre-kpi-inflows-sub');
    const elScrapIn = document.getElementById('cuadre-kpi-scrap-in');
    const elOut = document.getElementById('cuadre-kpi-outflows');
    const elOutSub = document.getElementById('cuadre-kpi-outflows-sub');
    const elExpenses = document.getElementById('cuadre-kpi-expenses-sub');
    const elNet = document.getElementById('cuadre-kpi-net');
    const elNetSub = document.getElementById('cuadre-kpi-net-sub');
    const elNetStatus = document.getElementById('cuadre-kpi-net-status');
    const elCredits = document.getElementById('cuadre-kpi-credits');
    const elCreditsSub = document.getElementById('cuadre-kpi-credits-sub');
    const elCartera = document.getElementById('cuadre-kpi-cartera-viva');

    if (elIn) elIn.innerText = `$${(summary.totalInflows || 0).toLocaleString('es-CO')}`;
    if (elInSub) elInSub.innerText = `Efectivo: $${(summary.inflowsBreakdown.cash || 0).toLocaleString('es-CO')} | Bancos: $${(summary.inflowsBreakdown.transfer || 0).toLocaleString('es-CO')}`;
    if (elScrapIn) elScrapIn.innerText = `♻️ Retal 18K recibido: ${(summary.inflowsBreakdown.scrapGoldGrams || 0).toFixed(2)}g ($${(summary.inflowsBreakdown.scrapGold || 0).toLocaleString('es-CO')})`;

    if (elOut) elOut.innerText = `$${(summary.totalOutflows || 0).toLocaleString('es-CO')}`;
    if (elOutSub) elOutSub.innerText = `Puro 24K: $${(summary.outflowsBreakdown.puro24k || 0).toLocaleString('es-CO')} | Talleres M.O: $${(summary.outflowsBreakdown.manoDeObra || 0).toLocaleString('es-CO')}`;
    if (elExpenses) elExpenses.innerText = `Gastos & Operativos: $${(summary.outflowsBreakdown.expenses || 0).toLocaleString('es-CO')}`;

    const isPositiveNet = summary.netCashFlow >= 0;
    if (elNet) {
      elNet.innerText = `${isPositiveNet ? '+' : ''}$${(summary.netCashFlow || 0).toLocaleString('es-CO')}`;
      elNet.style.color = isPositiveNet ? '#34d399' : '#f87171';
    }
    if (elNetStatus) {
      elNetStatus.innerText = isPositiveNet ? '● Flujo de Caja Positivo / Superávit' : '▼ Saldo Negativo / Desembolso Mayor';
      elNetStatus.style.color = isPositiveNet ? '#34d399' : '#f87171';
    }

    if (elCredits) elCredits.innerText = `$${(summary.totalCreditsIssued || 0).toLocaleString('es-CO')}`;
    if (elCreditsSub) elCreditsSub.innerText = `Créditos otorgados en el período`;
    if (elCartera) elCartera.innerText = `Cartera Viva Total: $${(summary.receivables.totalDebtPesos || 0).toLocaleString('es-CO')} (${(summary.receivables.totalDebtGrams || 0).toFixed(2)}g)`;

    // 2. Arqueo por Medio de Pago
    const methodsContainer = document.getElementById('cuadre-methods-container');
    if (methodsContainer) {
      if (!summary.methodBalances || summary.methodBalances.length === 0) {
        methodsContainer.innerHTML = `<div style="color: var(--text-dim); padding: 16px; text-align: center;">No hay saldos registrados en medios de pago.</div>`;
      } else {
        methodsContainer.innerHTML = summary.methodBalances.map(mb => {
          const isBank = mb.method.toLowerCase().includes('bancolombia') || mb.method.toLowerCase().includes('davivienda') || mb.method.toLowerCase().includes('transferencia');
          const isCash = mb.method.toLowerCase().includes('efectivo');
          const isScrap = mb.method.toLowerCase().includes('retal');
          const icon = isBank ? '🏦' : (isCash ? '💵' : (isScrap ? '♻️' : '💳'));

          return `
            <div class="cuadre-method-row">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.25rem;">${icon}</span>
                <div>
                  <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">${mb.method}</div>
                  <div style="font-size: 0.72rem; color: var(--text-dim);">
                    Entradas: <span style="color: #34d399;">+$${mb.totalIn.toLocaleString('es-CO')}</span> | Salidas: <span style="color: #f87171;">-$${mb.totalOut.toLocaleString('es-CO')}</span>
                  </div>
                </div>
              </div>
              <div class="mono" style="font-size: 1.05rem; font-weight: 800; color: ${mb.balance >= 0 ? 'var(--gold-light)' : '#f87171'};">
                $${mb.balance.toLocaleString('es-CO')}
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 3. Pagos a Proveedores y Talleres
    const suppliersBody = document.getElementById('cuadre-suppliers-table-body');
    const elTotalPaidSuppliers = document.getElementById('cuadre-total-paid-suppliers');
    if (suppliersBody) {
      const sups = summary.supplierDisbursements || [];
      const totalPaid = sups.reduce((acc, s) => acc + s.totalPaid, 0);
      if (elTotalPaidSuppliers) elTotalPaidSuppliers.innerText = `Total Pagado a Proveedores: $${totalPaid.toLocaleString('es-CO')}`;

      if (sups.length === 0) {
        suppliersBody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding: 24px; color: var(--text-dim);">No se registran pagos a proveedores en este período.</td></tr>`;
      } else {
        suppliersBody.innerHTML = sups.map(s => {
          return `
            <tr>
              <td>
                <strong>${s.supplierName}</strong>
                <div style="font-size: 0.72rem; color: var(--text-dim);">${s.transactions.length} pago(s) registrado(s)</div>
              </td>
              <td>
                <span class="ticker-badge ${s.category.includes('Italiano') ? 'badge-italian' : (s.category.includes('24K') ? 'badge-bullion' : 'badge-nacional')}">
                  ${s.category}
                </span>
              </td>
              <td class="text-right mono" style="font-weight: 800; color: #f87171;">
                $${s.totalPaid.toLocaleString('es-CO')}
              </td>
              <td class="text-right mono" style="font-weight: 700; color: var(--text-muted);">
                $${(s.currentBalanceDuePesos || 0).toLocaleString('es-CO')}
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 4. Render Ledger Table
    this.filterCuadreLedger();
  },

  filterCuadreLedger() {
    if (!this.cuadreData || !this.cuadreData.items) return;

    const tableBody = document.getElementById('cuadre-ledger-table-body');
    if (!tableBody) return;

    let list = [...this.cuadreData.items];
    const search = (document.getElementById('cuadre-search')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('cuadre-type-filter')?.value || 'all';

    if (typeFilter !== 'all') {
      list = list.filter(item => item.type === typeFilter);
    }

    if (search) {
      list = list.filter(item =>
        (item.description || '').toLowerCase().includes(search) ||
        (item.entityName || '').toLowerCase().includes(search) ||
        (item.reference || '').toLowerCase().includes(search) ||
        (item.method || '').toLowerCase().includes(search) ||
        (item.category || '').toLowerCase().includes(search)
      );
    }

    if (list.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 40px; color: var(--text-dim);">No hay movimientos que coincidan con los filtros de búsqueda.</td></tr>`;
      return;
    }

    tableBody.innerHTML = list.map(item => {
      const isIngreso = item.type === 'ingreso';
      const isEgreso = item.type === 'egreso';
      const isCredito = item.type === 'credito_otorgado';

      const typeBadge = isIngreso 
        ? `<span class="stat-badge pos" style="font-weight: 800;">🟢 INGRESO</span>`
        : (isEgreso 
          ? `<span class="stat-badge neg" style="font-weight: 800;">🔴 EGRESO</span>` 
          : `<span class="ticker-badge badge-nacional" style="font-weight: 800;">⏳ CRÉDITO</span>`);

      const formattedDate = new Date(item.date).toLocaleString('es-CO', {
        dateStyle: 'short',
        timeStyle: 'short'
      });

      return `
        <tr>
          <td class="mono" style="font-size: 0.78rem; white-space: nowrap;">${formattedDate}</td>
          <td>${typeBadge}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-headings);">${item.category}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${item.description}</div>
          </td>
          <td>
            <strong>${item.entityName}</strong>
            <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: capitalize;">${item.entityType}</div>
          </td>
          <td style="font-size: 0.8rem;">
            ${item.method}
          </td>
          <td class="mono" style="font-weight: 700; color: var(--gold-light);">
            ${item.reference}
          </td>
          <td class="text-right mono" style="font-weight: 800; color: #34d399;">
            ${isIngreso ? `+$${item.amount.toLocaleString('es-CO')}` : '-'}
          </td>
          <td class="text-right mono" style="font-weight: 800; color: #f87171;">
            ${isEgreso ? `-$${item.amount.toLocaleString('es-CO')}` : (isCredito ? `<span style="color: #fbbf24;">[$${item.amount.toLocaleString('es-CO')}]</span>` : '-')}
          </td>
          <td class="text-right mono" style="font-weight: 800; color: ${item.runningBalance >= 0 ? 'var(--gold-light)' : '#f87171'};">
            $${item.runningBalance.toLocaleString('es-CO')}
          </td>
        </tr>
      `;
    }).join('');
  },

  openNewCashMovementModal() {
    document.getElementById('mov-type').value = 'egreso';
    document.getElementById('mov-category').value = 'Gasto Operativo';
    document.getElementById('mov-concept').value = '';
    document.getElementById('mov-amount').value = '';
    document.getElementById('mov-ref').value = '';
    document.getElementById('mov-notes').value = '';

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('mov-date').value = today;

    // Populate method select
    const methodSelect = document.getElementById('mov-method');
    if (methodSelect && this.paymentMethods && this.paymentMethods.length > 0) {
      const active = this.paymentMethods.filter(m => m.status === 'activo');
      methodSelect.innerHTML = active.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    }

    this.onMovTypeChange();
    this.openModal('modal-cash-movement');
  },

  onMovTypeChange() {
    const type = document.getElementById('mov-type').value;
    const catSelect = document.getElementById('mov-category');
    if (type === 'egreso') {
      catSelect.innerHTML = `
        <option value="Gasto Operativo">Gasto Operativo General</option>
        <option value="Seguridad & Transporte Valores">Seguridad & Transporte de Valores</option>
        <option value="Arriendo & Sede">Arriendo & Sede Bóveda</option>
        <option value="Suministros Taller">Suministros & Herramientas Taller</option>
        <option value="Nómina & Honorarios">Nómina & Honorarios</option>
        <option value="Retiro de Utilidades">Retiro de Utilidades / Socios</option>
        <option value="Otro">Otro Gasto</option>
      `;
    } else {
      catSelect.innerHTML = `
        <option value="Inyección de Capital">Inyección de Capital / Caja</option>
        <option value="Cobro Extraordinario">Cobro Extraordinario</option>
        <option value="Rendimiento Financiero">Rendimiento Financiero</option>
        <option value="Otro">Otro Ingreso</option>
      `;
    }
  },

  async submitCashMovementForm() {
    const type = document.getElementById('mov-type').value;
    const category = document.getElementById('mov-category').value;
    const concept = document.getElementById('mov-concept').value.trim();
    const amount = parseFloat(document.getElementById('mov-amount').value) || 0;
    const method = document.getElementById('mov-method').value;
    const reference = document.getElementById('mov-ref').value.trim();
    const date = document.getElementById('mov-date').value;
    const notes = document.getElementById('mov-notes').value.trim();

    if (!concept) {
      alert('Por favor ingresa el concepto o motivo del movimiento.');
      return;
    }
    if (amount <= 0) {
      alert('El monto debe ser mayor a cero.');
      return;
    }

    const payload = {
      type,
      category,
      concept,
      amount,
      method,
      reference,
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      notes
    };

    try {
      const res = await fetch('/api/cash-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) window.soundEngine.playSuccess();
        alert('¡Movimiento de caja registrado con éxito!');
        this.closeAllModals();
        await this.loadCuadreData();
        this.renderCuadreCaja();
      } else {
        alert('Error: ' + res.message);
      }
    } catch (e) {
      alert('Error al registrar movimiento.');
    }
  },

  printCuadreCaja() {
    if (!this.cuadreData) return;
    const { summary, items } = this.cuadreData;
    const now = new Date();

    const printContainer = document.getElementById('cuadre-print-content');
    if (!printContainer) return;

    printContainer.innerHTML = `
      <div style="padding: 24px; font-family: 'Inter', sans-serif; color: #000; background: #fff; max-width: 800px; margin: 0 auto;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 14px; margin-bottom: 20px;">
          <div>
            <h1 style="font-size: 1.6rem; font-weight: 900; margin: 0; color: #000; letter-spacing: 1px;">NEXUS POR MAYOR</h1>
            <p style="margin: 2px 0 0 0; font-size: 0.85rem; color: #475569;">Bóveda Central de Joyería en Oro 18K & Metales Preciosos</p>
            <p style="margin: 2px 0 0 0; font-size: 0.8rem; color: #64748b;">NIT: 901.884.221-9 | Medellín, Colombia</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.15rem; font-weight: 800; text-transform: uppercase;">ACTA DE CUADRE DE CAJA</div>
            <div style="font-size: 0.82rem; font-family: monospace; color: #475569;">Corte: ${now.toLocaleDateString('es-CO')} ${now.toLocaleTimeString('es-CO')}</div>
            <div style="font-size: 0.8rem; font-weight: 700; color: #b45309;">Periodo: ${this.cuadrePeriod.toUpperCase()}</div>
          </div>
        </div>

        <!-- KPI Resumen Ejecutivo -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; text-align: center;">
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px;">
            <div style="font-size: 0.7rem; color: #64748b; font-weight: 700;">TOTAL INGRESOS</div>
            <div style="font-size: 1.1rem; font-weight: 900; color: #15803d; font-family: monospace;">+$${summary.totalInflows.toLocaleString('es-CO')}</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px;">
            <div style="font-size: 0.7rem; color: #64748b; font-weight: 700;">TOTAL EGRESOS</div>
            <div style="font-size: 1.1rem; font-weight: 900; color: #b91c1c; font-family: monospace;">-$${summary.totalOutflows.toLocaleString('es-CO')}</div>
          </div>
          <div style="border: 2px solid #000; border-radius: 6px; padding: 10px; background: #f8fafc;">
            <div style="font-size: 0.7rem; color: #000; font-weight: 800;">SALDO NETO CAJA</div>
            <div style="font-size: 1.15rem; font-weight: 900; color: #000; font-family: monospace;">$${summary.netCashFlow.toLocaleString('es-CO')}</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px;">
            <div style="font-size: 0.7rem; color: #64748b; font-weight: 700;">CRÉDITOS OTORGADOS</div>
            <div style="font-size: 1.1rem; font-weight: 900; color: #d97706; font-family: monospace;">$${summary.totalCreditsIssued.toLocaleString('es-CO')}</div>
          </div>
        </div>

        <!-- Detalle de Medios de Pago y Proveedores -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
          <!-- Medios de Pago -->
          <div>
            <h4 style="font-size: 0.85rem; font-weight: 800; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 0 0 8px 0;">ARQUEO POR MEDIO DE PAGO</h4>
            <table style="width: 100%; font-size: 0.78rem; border-collapse: collapse;">
              ${(summary.methodBalances || []).map(mb => `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 4px 0;"><strong>${mb.method}</strong></td>
                  <td style="padding: 4px 0; text-align: right; font-family: monospace; font-weight: 700;">$${mb.balance.toLocaleString('es-CO')}</td>
                </tr>
              `).join('')}
            </table>
          </div>

          <!-- Pagos a Proveedores -->
          <div>
            <h4 style="font-size: 0.85rem; font-weight: 800; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 0 0 8px 0;">PAGOS A PROVEEDORES & TALLERES</h4>
            <table style="width: 100%; font-size: 0.78rem; border-collapse: collapse;">
              ${(summary.supplierDisbursements || []).map(s => `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 4px 0;"><strong>${s.supplierName}</strong></td>
                  <td style="padding: 4px 0; text-align: right; font-family: monospace; font-weight: 700; color: #b91c1c;">-$${s.totalPaid.toLocaleString('es-CO')}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        </div>

        <!-- Renglones de Movimientos -->
        <h4 style="font-size: 0.85rem; font-weight: 800; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 0 0 8px 0;">DETALLE TRANSACCIONAL (LIBRO DIARIO)</h4>
        <table style="width: 100%; font-size: 0.75rem; border-collapse: collapse; margin-bottom: 30px;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left;">
              <th style="padding: 6px;">Hora</th>
              <th style="padding: 6px;">Concepto</th>
              <th style="padding: 6px;">Tercero</th>
              <th style="padding: 6px;">Medio</th>
              <th style="padding: 6px; text-align: right;">Entrada</th>
              <th style="padding: 6px; text-align: right;">Salida</th>
            </tr>
          </thead>
          <tbody>
            ${items.slice(0, 15).map(i => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px; font-family: monospace;">${new Date(i.date).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                <td style="padding: 5px;">${i.category} - <span style="color: #64748b;">${i.reference}</span></td>
                <td style="padding: 5px;"><strong>${i.entityName}</strong></td>
                <td style="padding: 5px;">${i.method.slice(0, 18)}...</td>
                <td style="padding: 5px; text-align: right; font-family: monospace; font-weight: 700; color: #15803d;">${i.type === 'ingreso' ? `+$${i.amount.toLocaleString('es-CO')}` : '-'}</td>
                <td style="padding: 5px; text-align: right; font-family: monospace; font-weight: 700; color: #b91c1c;">${i.type === 'egreso' ? `-$${i.amount.toLocaleString('es-CO')}` : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Firmas de Auditoría -->
        <div style="display: flex; justify-content: space-between; margin-top: 50px; padding-top: 20px;">
          <div style="text-align: center; width: 220px; border-top: 1px solid #000; padding-top: 6px; font-size: 0.8rem;">
            <strong>Entregado Conforme</strong><br>
            <span style="font-size: 0.72rem; color: #64748b;">Cajero / Tesorería Mayorista</span>
          </div>
          <div style="text-align: center; width: 220px; border-top: 1px solid #000; padding-top: 6px; font-size: 0.8rem;">
            <strong>Revisado & Aprobado</strong><br>
            <span style="font-size: 0.72rem; color: #64748b;">Auditoría Interna / Gerencia</span>
          </div>
        </div>
      </div>
    `;

    this.openModal('modal-print-cuadre');
  },

  // WhatsApp quotation copy
  copyWhatsAppQuote() {
    const scale = window.digitalScale;
    const { label, saleRate, costPerGram } = scale.getDetailsForCategory();
    const grams = scale.currentGrams;
    const total = Math.round(grams * saleRate);

    const text = `💎 *NEXUS POR MAYOR - COTIZACIÓN DE JOYERÍA* 💎\n` +
      `📅 Fecha: ${new Date().toLocaleDateString('es-CO')}\n\n` +
      `✨ *Línea:* ${label}\n` +
      `⚖️ *Gramaje pesado:* ${grams.toFixed(2)} gramos netos\n` +
      `🏷️ *Precio por gramo acordado:* $${saleRate.toLocaleString('es-CO')} COP/g\n` +
      `💰 *Total Liquidación:* $${total.toLocaleString('es-CO')} COP\n\n` +
      `📍 Despachos inmediatos a todo el país. Precios válidos por el día de hoy.`;

    navigator.clipboard.writeText(text).then(() => {
      alert('¡Cotización copiada al portapapeles! Lista para pegar en WhatsApp.');
    });
  },

  // Aliases and Operational UI Helpers
  submitNewClient() {
    return this.submitJoyeriaForm();
  },

  addSelectedItemToDispatch() {
    const itemSelect = document.getElementById('despacho-item-select');
    const itemId = itemSelect ? itemSelect.value : '';
    const weightVal = parseFloat(document.getElementById('despacho-weight-input')?.value);
    const salePriceVal = parseFloat(document.getElementById('despacho-sale-price-input')?.value);

    if (!itemId) {
      alert('Por favor selecciona una prenda de la lista.');
      return;
    }
    if (!weightVal || weightVal <= 0) {
      alert('Por favor ingresa un peso válido en gramos.');
      return;
    }
    if (!salePriceVal || salePriceVal <= 0) {
      alert('Por favor pacta el precio de venta por gramo.');
      return;
    }

    const item = this.items.find(i => i.id === itemId);
    if (item) {
      this.addItemToDispatch(item, weightVal, salePriceVal);
      const wInput = document.getElementById('despacho-weight-input');
      if (wInput) wInput.value = '';
    }
  },

  async editItemPrompt(itemId) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) return;

    const currentWeight = Number(item.weightGrams || 0).toFixed(2);
    const newWeightStr = prompt(`Actualizar gramaje en bóveda para "${item.name}" (${item.code}):\nPeso actual: ${currentWeight}g\nIngresa el nuevo gramaje exacto:`, currentWeight);
    if (newWeightStr === null) return;
    const newWeight = parseFloat(newWeightStr);
    if (isNaN(newWeight) || newWeight < 0) {
      alert('Por favor ingresa un gramaje válido (mayor o igual a cero).');
      return;
    }

    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightGrams: newWeight })
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) {
          try { window.soundEngine.playSuccess(); } catch (e) {}
        }
        await this.refreshAllData();
        this.renderInventory();
        alert(`¡Gramaje de ${item.name} actualizado exitosamente a ${newWeight.toFixed(2)}g!`);
      } else {
        alert(res.message || 'Error al actualizar gramaje');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al actualizar gramaje.');
    }
  },

  openNewPurchaseModal() {
    this.openCompraPuroModal();
  },

  openNewDeliveryModal(supplierId = null) {
    this.openEntregaPuroModal(supplierId);
  },

  viewRemision(orderId) {
    const order = typeof orderId === 'object' ? orderId : this.orders.find(o => o.id === orderId);
    if (order) this.showRemisionPrintModal(order);
  },

  openEditRatesModal(focusTarget = 'puro') {
    const avgPuro = this.averages.promedioPuro24k || 404810;
    const avgNc = this.averages.promedioNacional || 259514;
    const avgIt = this.averages.promedioItaliano || 283811;
    const retal = this.rates.retal_oro18k_compra || 255000;

    const inputPuro = document.getElementById('rate-input-puro');
    const inputNc = document.getElementById('rate-input-nc');
    const inputIt = document.getElementById('rate-input-it');
    const inputRetal = document.getElementById('rate-input-retal');

    if (inputPuro) inputPuro.value = avgPuro;
    if (inputNc) inputNc.value = avgNc;
    if (inputIt) inputIt.value = avgIt;
    if (inputRetal) inputRetal.value = retal;

    const hintPuro = document.getElementById('rate-hint-puro');
    const hintNc = document.getElementById('rate-hint-nc');
    const hintIt = document.getElementById('rate-hint-it');

    if (hintPuro) hintPuro.innerText = this.rates.override_promedioPuro24k ? '(Fijado manual)' : '(Ponderado compras)';
    if (hintNc) hintNc.innerText = this.rates.override_promedioNacional ? '(Fijado manual)' : '(Ponderado bóveda)';
    if (hintIt) hintIt.innerText = this.rates.override_promedioItaliano ? '(Fijado manual)' : '(Ponderado bóveda)';

    this.openModal('modal-edit-rates');

    setTimeout(() => {
      let targetInput = inputPuro;
      if (focusTarget === 'nacional') targetInput = inputNc;
      else if (focusTarget === 'italiano') targetInput = inputIt;
      else if (focusTarget === 'retal') targetInput = inputRetal;
      if (targetInput) {
        targetInput.focus();
        targetInput.select();
      }
    }, 100);
  },

  async submitRates() {
    const promedioPuro24k = parseFloat(document.getElementById('rate-input-puro')?.value);
    const promedioNacional = parseFloat(document.getElementById('rate-input-nc')?.value);
    const promedioItaliano = parseFloat(document.getElementById('rate-input-it')?.value);
    const retal_oro18k_compra = parseFloat(document.getElementById('rate-input-retal')?.value);

    if (isNaN(promedioPuro24k) || isNaN(promedioNacional) || isNaN(promedioItaliano) || isNaN(retal_oro18k_compra)) {
      alert('Por favor ingresa valores numéricos válidos mayores a cero para todas las tasas.');
      return;
    }

    try {
      const res = await fetch('/api/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promedioPuro24k,
          promedioNacional,
          promedioItaliano,
          retal_oro18k_compra
        })
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) {
          try { window.soundEngine.playSuccess(); } catch (e) {}
        }
        this.closeAllModals();
        await this.refreshAllData();
        this.renderGoldTicker();
        this.render();
        alert('¡Tasas y promedios del día actualizados correctamente!');
      } else {
        alert(res.message || 'Error al actualizar las tasas');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al guardar las tasas.');
    }
  },

  async resetAutoRates() {
    if (!confirm('¿Deseas restablecer los promedios al cálculo ponderado automático según las compras y el gramaje en bóveda?')) {
      return;
    }

    try {
      const res = await fetch('/api/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetOverrides: true })
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) {
          try { window.soundEngine.playSuccess(); } catch (e) {}
        }
        this.closeAllModals();
        await this.refreshAllData();
        this.renderGoldTicker();
        this.render();
        alert('¡Promedios restablecidos a cálculo ponderado automático!');
      }
    } catch (err) {
      console.error(err);
      alert('Error al restablecer cálculo automático.');
    }
  },

  // =========================================================
  // GESTIÓN DE CATEGORÍAS DE BÓVEDA (Añadir, Editar, Eliminar)
  // =========================================================
  categoryColorPresets: [
    { label: 'Oro 18K Clásico', color: '#d4af37' },
    { label: 'Oro Nacional Ámbar', color: '#fbbf24' },
    { label: 'Oro Italiano Esmeralda', color: '#34d399' },
    { label: 'Oro Rosa / Turco', color: '#f43f5e' },
    { label: 'Zafiro / Importado', color: '#38bdf8' },
    { label: 'Amatista / Alta Joyería', color: '#c084fc' },
    { label: 'Platino / Oro Blanco', color: '#e2e8f0' }
  ],

  openManageCategoriesModal() {
    this.populateCategoryColorPresets();
    this.resetCategoryForm();
    this.renderCategoriesList();
    this.openModal('modal-manage-categories');
  },

  populateCategoryColorPresets() {
    const container = document.getElementById('cat-color-presets');
    if (!container) return;
    container.innerHTML = this.categoryColorPresets.map(p => `
      <button type="button" class="color-preset-pill" style="background: ${p.color};" title="${p.label}" onclick="App.onCategoryColorChange('${p.color}')"></button>
    `).join('');
  },

  onCategoryColorChange(hex) {
    const picker = document.getElementById('cat-color-picker');
    if (picker) picker.value = hex;
    this.onCategoryInputPreview();
  },

  onCategoryInputPreview() {
    const badgeText = document.getElementById('cat-badge-input')?.value.trim() || document.getElementById('cat-name-input')?.value.trim() || '🏷️ Nueva Categoría';
    const color = document.getElementById('cat-color-picker')?.value || '#d4af37';
    const preview = document.getElementById('cat-preview-badge');
    if (preview) {
      preview.innerText = badgeText;
      preview.style.color = color;
      preview.style.borderColor = `${color}66`;
      preview.style.background = `${color}22`;
    }
  },

  renderCategoriesList() {
    const container = document.getElementById('categories-list-container');
    const counter = document.getElementById('cat-total-counter');
    if (!container) return;

    if (counter) {
      counter.innerText = `${(this.categories || []).length} categorías registradas`;
    }

    if (!this.categories || this.categories.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">
          No hay categorías configuradas. Añade una para empezar.
        </div>
      `;
      return;
    }

    container.innerHTML = this.categories.map(cat => {
      const catItems = (this.items || []).filter(i => i.category === cat.slug);
      const totalGrams = catItems.reduce((acc, it) => acc + (Number(it.weightGrams) || 0), 0);
      const color = cat.color || '#d4af37';

      return `
        <div class="cat-item-row">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <div class="cat-color-dot" style="background: ${color}; box-shadow: 0 0 10px ${color}88;"></div>
            <div style="min-width: 0;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-weight: 800; color: var(--text-headings); font-size: 0.95rem;">${cat.name}</span>
                <span class="ticker-badge" style="color: ${color}; border: 1px solid ${color}66; background: ${color}22; font-size: 0.72rem; padding: 2px 7px; border-radius: 9999px;">
                  ${cat.badgeText || cat.name}
                </span>
                <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--text-dim);">slug: ${cat.slug}</span>
              </div>
              <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${cat.description ? `${cat.description} • ` : ''}
                <span style="color: var(--gold-light); font-weight: 700;">📦 ${catItems.length} lotes (${totalGrams.toFixed(1)}g en bóveda)</span>
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-shrink: 0;">
            <button class="btn btn-secondary btn-sm" onclick="App.editCategory('${cat.id}')" title="Editar Categoría" style="padding: 6px 10px; font-size: 0.78rem;">
              ✏️ Editar
            </button>
            <button class="btn btn-secondary btn-sm" onclick="App.deleteCategory('${cat.id}')" title="Eliminar Categoría" style="padding: 6px 10px; font-size: 0.78rem; color: #f87171; border-color: rgba(239, 68, 68, 0.3);">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  editCategory(id) {
    const cat = (this.categories || []).find(c => c.id === id);
    if (!cat) return;

    document.getElementById('cat-edit-id').value = cat.id;
    document.getElementById('cat-name-input').value = cat.name;
    document.getElementById('cat-badge-input').value = cat.badgeText || cat.name;
    document.getElementById('cat-color-picker').value = cat.color || '#d4af37';
    document.getElementById('cat-slug-input').value = cat.slug;
    document.getElementById('cat-desc-input').value = cat.description || '';

    const title = document.getElementById('cat-form-title');
    if (title) title.innerText = `✏️ Editando Categoría: "${cat.name}"`;

    const cancelBtn = document.getElementById('btn-cancel-edit-cat');
    if (cancelBtn) cancelBtn.style.display = 'inline-block';

    const submitBtn = document.getElementById('btn-submit-cat');
    if (submitBtn) submitBtn.innerText = '💾 Actualizar Categoría';

    this.onCategoryInputPreview();

    // Scroll smoothly to form
    document.getElementById('form-category')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  resetCategoryForm() {
    document.getElementById('cat-edit-id').value = '';
    document.getElementById('cat-name-input').value = '';
    document.getElementById('cat-badge-input').value = '';
    document.getElementById('cat-color-picker').value = '#d4af37';
    document.getElementById('cat-slug-input').value = '';
    document.getElementById('cat-desc-input').value = '';

    const title = document.getElementById('cat-form-title');
    if (title) title.innerText = '➕ Añadir Nueva Categoría';

    const cancelBtn = document.getElementById('btn-cancel-edit-cat');
    if (cancelBtn) cancelBtn.style.display = 'none';

    const submitBtn = document.getElementById('btn-submit-cat');
    if (submitBtn) submitBtn.innerText = '💾 Guardar Categoría';

    this.onCategoryInputPreview();
  },

  async submitCategoryForm() {
    const editId = document.getElementById('cat-edit-id')?.value;
    const name = document.getElementById('cat-name-input')?.value.trim();
    const badgeText = document.getElementById('cat-badge-input')?.value.trim();
    const color = document.getElementById('cat-color-picker')?.value || '#d4af37';
    const slug = document.getElementById('cat-slug-input')?.value.trim();
    const description = document.getElementById('cat-desc-input')?.value.trim();

    if (!name) {
      alert('Por favor ingresa un nombre para la categoría.');
      return;
    }

    const payload = {
      name,
      badgeText: badgeText || name,
      color,
      slug: slug || undefined,
      description
    };

    try {
      let res;
      if (editId) {
        res = await fetch(`/api/categories/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      } else {
        res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      }

      if (res.success) {
        if (window.soundEngine) {
          try { window.soundEngine.playSuccess(); } catch (e) {}
        }
        await this.refreshAllData();
        this.resetCategoryForm();
        this.renderCategoriesList();
        this.renderCategoryTabs();
        this.renderInventory();
      } else {
        alert(res.message || 'Error al guardar categoría');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al procesar categoría.');
    }
  },

  async deleteCategory(id) {
    const cat = (this.categories || []).find(c => c.id === id);
    if (!cat) return;

    if (this.categories.length <= 1) {
      alert('No puedes eliminar la única categoría existente en la bóveda.');
      return;
    }

    const catItems = (this.items || []).filter(i => i.category === cat.slug);
    let confirmMsg = `¿Deseas eliminar la categoría "${cat.name}"?`;
    if (catItems.length > 0) {
      confirmMsg += `\n\n⚠️ ATENCIÓN: Hay ${catItems.length} lotes de oro asignados a esta categoría. Al eliminarla, estos lotes serán reasignados automáticamente a otra categoría para no perder inventario.`;
    }

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'DELETE'
      }).then(r => r.json());

      if (res.success) {
        if (window.soundEngine) {
          try { window.soundEngine.playSuccess(); } catch (e) {}
        }
        if (this.activeCategoryFilter === cat.slug) {
          this.activeCategoryFilter = 'all';
        }
        await this.refreshAllData();
        this.resetCategoryForm();
        this.renderCategoriesList();
        this.renderCategoryTabs();
        this.renderInventory();
      } else {
        alert(res.message || 'Error al eliminar categoría');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al eliminar categoría.');
    }
  },

  // ============================================================
  // BALANCE GENERAL & ESTADO PATRIMONIAL CONTABLE
  // ============================================================
  balanceGeneralData: null,

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  async loadBalanceGeneral() {
    try {
      const res = await fetch('/api/balance-general');
      const data = await res.json();
      if (data && data.success) {
        this.balanceGeneralData = data;
        this.renderBalanceGeneral(data);
      } else {
        console.error('Error cargando balance general:', data);
      }
    } catch (err) {
      console.error('Error en fetch /api/balance-general:', err);
    }
  },

  renderBalanceGeneral(data) {
    if (!data) return;
    const { activos, pasivos, patrimonio, ratios, asOfDate } = data;

    // 1. Audit equation banner
    const eqEl = document.getElementById('bg-equation-summary');
    if (eqEl) {
      eqEl.innerHTML = `Activo Total (<strong>$${(activos.total || 0).toLocaleString('es-CO')}</strong>) = Pasivo Total (<strong>$${(pasivos.total || 0).toLocaleString('es-CO')}</strong>) + Patrimonio Neto (<strong>$${(patrimonio.netWorth || 0).toLocaleString('es-CO')}</strong>)`;
    }
    const dateEl = document.getElementById('bg-as-of-date');
    if (dateEl) {
      const d = asOfDate ? new Date(asOfDate) : new Date();
      dateEl.innerText = d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const backingEl = document.getElementById('bg-gold-backing-pill');
    if (backingEl) {
      backingEl.innerText = `👑 Respaldo Físico: ${(activos.totalGramsEq24k || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g 24K eq.`;
    }

    // 2. Executive KPI Cards
    const kpiAssets = document.getElementById('bg-kpi-total-assets');
    const kpiAssetsSub = document.getElementById('bg-kpi-assets-sub');
    if (kpiAssets) kpiAssets.innerText = `$${(activos.total || 0).toLocaleString('es-CO')}`;
    if (kpiAssetsSub) kpiAssetsSub.innerText = `Equivalente a ${(activos.totalGramsEq24k || 0).toFixed(2)}g Oro Puro 24K`;

    const kpiLiab = document.getElementById('bg-kpi-total-liabilities');
    const kpiLiabSub = document.getElementById('bg-kpi-liabilities-sub');
    const kpiLiabTag = document.getElementById('bg-kpi-liabilities-tag');
    if (kpiLiab) kpiLiab.innerText = `$${(pasivos.total || 0).toLocaleString('es-CO')}`;
    if (kpiLiabSub) kpiLiabSub.innerText = `Proveedores: $${(pasivos.proveedoresPesos || 0).toLocaleString('es-CO')} | Talleres: $${(pasivos.manosDeObraTalleres || 0).toLocaleString('es-CO')}`;
    if (kpiLiabTag) kpiLiabTag.innerText = `Apalancamiento: ${ratios.debtToAssetRatio || 0}%`;

    const kpiWorth = document.getElementById('bg-kpi-net-worth');
    const kpiWorthSub = document.getElementById('bg-kpi-worth-sub');
    const kpiSolvencyTag = document.getElementById('bg-kpi-solvency-tag');
    if (kpiWorth) kpiWorth.innerText = `$${(patrimonio.netWorth || 0).toLocaleString('es-CO')}`;
    if (kpiWorthSub) kpiWorthSub.innerText = `Respaldo Puro: ${(patrimonio.netWorthGramsEq24k || 0).toFixed(2)}g 24K eq.`;
    if (kpiSolvencyTag) {
      const sol = ratios.solvencyRatio || 0;
      kpiSolvencyTag.innerText = sol >= 999 ? 'Sin Pasivos (100% Solvente)' : `Solvencia: ${sol}x (${sol >= 2 ? 'Excelente' : 'Normal'})`;
    }

    const kpiWork = document.getElementById('bg-kpi-working-capital');
    const kpiAcidTag = document.getElementById('bg-kpi-acid-tag');
    if (kpiWork) kpiWork.innerText = `$${(patrimonio.workingCapital || 0).toLocaleString('es-CO')}`;
    if (kpiAcidTag) {
      const acid = ratios.acidTestRatio || 0;
      kpiAcidTag.innerText = acid >= 999 ? 'Prueba Ácida: Óptima (Sin Pasivo)' : `Prueba Ácida: ${acid}x`;
    }

    // 3. Asset Allocation Bar & Legend
    const totA = activos.total || 1;
    const valCash = (activos.disponible && activos.disponible.total) || 0;
    const valIt = (activos.realizable && activos.realizable.joyeriaItaliana18k && activos.realizable.joyeriaItaliana18k.totalValue) || 0;
    const valNc = (activos.realizable && activos.realizable.joyeriaNacional18k && activos.realizable.joyeriaNacional18k.totalValue) || 0;
    const valPuro = ((activos.realizable && activos.realizable.oroPuro24kBoveda ? activos.realizable.oroPuro24kBoveda.totalValue : 0) +
                     (activos.realizable && activos.realizable.oroPuro24kEnTalleres ? activos.realizable.oroPuro24kEnTalleres.totalValue : 0));
    const valCxc = (activos.exigible && activos.exigible.totalPesos) || 0;

    const pCash = Math.max(1, ((valCash / totA) * 100)).toFixed(1);
    const pIt = Math.max(1, ((valIt / totA) * 100)).toFixed(1);
    const pNc = Math.max(1, ((valNc / totA) * 100)).toFixed(1);
    const pPuro = Math.max(1, ((valPuro / totA) * 100)).toFixed(1);
    const pCxc = Math.max(1, ((valCxc / totA) * 100)).toFixed(1);

    const barCash = document.getElementById('bg-bar-cash');
    const barIt = document.getElementById('bg-bar-it');
    const barNc = document.getElementById('bg-bar-nc');
    const barPuro = document.getElementById('bg-bar-puro');
    const barCxc = document.getElementById('bg-bar-cxc');

    if (barCash) barCash.style.width = `${pCash}%`;
    if (barIt) barIt.style.width = `${pIt}%`;
    if (barNc) barNc.style.width = `${pNc}%`;
    if (barPuro) barPuro.style.width = `${pPuro}%`;
    if (barCxc) barCxc.style.width = `${pCxc}%`;

    // Legend
    const legCashPct = document.getElementById('bg-legend-cash-pct');
    const legCashVal = document.getElementById('bg-legend-cash-val');
    if (legCashPct) legCashPct.innerText = `${pCash}%`;
    if (legCashVal) legCashVal.innerText = valCash.toLocaleString('es-CO');

    const legItPct = document.getElementById('bg-legend-it-pct');
    const legItVal = document.getElementById('bg-legend-it-val');
    if (legItPct) legItPct.innerText = `${pIt}%`;
    if (legItVal) legItVal.innerText = valIt.toLocaleString('es-CO');

    const legNcPct = document.getElementById('bg-legend-nc-pct');
    const legNcVal = document.getElementById('bg-legend-nc-val');
    if (legNcPct) legNcPct.innerText = `${pNc}%`;
    if (legNcVal) legNcVal.innerText = valNc.toLocaleString('es-CO');

    const legPuroPct = document.getElementById('bg-legend-puro-pct');
    const legPuroVal = document.getElementById('bg-legend-puro-val');
    if (legPuroPct) legPuroPct.innerText = `${pPuro}%`;
    if (legPuroVal) legPuroVal.innerText = valPuro.toLocaleString('es-CO');

    const legCxcPct = document.getElementById('bg-legend-cxc-pct');
    const legCxcVal = document.getElementById('bg-legend-cxc-val');
    if (legCxcPct) legCxcPct.innerText = `${pCxc}%`;
    if (legCxcVal) legCxcVal.innerText = valCxc.toLocaleString('es-CO');

    // 4. Left Column - Activos
    const colAssets = document.getElementById('bg-col-total-assets');
    if (colAssets) colAssets.innerText = `$${(activos.total || 0).toLocaleString('es-CO')}`;

    // 4.1 Disponibles (Caja & Bancos)
    const subDisp = document.getElementById('bg-subtotal-disponible');
    if (subDisp) subDisp.innerText = `$${((activos.disponible && activos.disponible.total) || 0).toLocaleString('es-CO')}`;

    const listDisp = document.getElementById('bg-list-disponible');
    if (listDisp) {
      const cuentas = (activos.disponible && activos.disponible.cuentas) || [];
      if (cuentas.length === 0) {
        listDisp.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-dim); font-size: 0.82rem;">No hay cuentas con saldo registrado.</div>`;
      } else {
        listDisp.innerHTML = cuentas.map(acc => {
          const isCash = acc.type === 'caja';
          const icon = isCash ? '💵' : (acc.type === 'banco' ? '🏦' : '🪙');
          const desc = isCash ? 'Caja Fuerte / Efectivo Físico' : 'Cuenta de Tesorería & Transferencias';
          const isPos = acc.balance >= 0;
          return `
            <div class="balance-line-item">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.15rem;">${icon}</span>
                <div>
                  <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">${this.escapeHtml(acc.name)}</div>
                  <div style="font-size: 0.72rem; color: var(--text-dim);">${desc}</div>
                </div>
              </div>
              <span class="mono line-val" style="color: ${isPos ? 'var(--info-accent)' : 'var(--danger-accent)'}; font-weight: 800;">
                $${acc.balance.toLocaleString('es-CO')}
              </span>
            </div>
          `;
        }).join('');
      }
    }

    // 4.2 Exigibles (Cartera CxC)
    const subExig = document.getElementById('bg-subtotal-exigible');
    if (subExig) subExig.innerText = `$${((activos.exigible && activos.exigible.totalPesos) || 0).toLocaleString('es-CO')}`;

    const cxcGramsBacking = document.getElementById('bg-cxc-grams-backing');
    if (cxcGramsBacking) cxcGramsBacking.innerText = `${((activos.exigible && activos.exigible.totalGrams18k) || 0).toFixed(2)} g 18K`;

    const cxcClientsCount = document.getElementById('bg-cxc-clients-count');
    if (cxcClientsCount) cxcClientsCount.innerText = `${(activos.exigible && activos.exigible.activeDebtorsCount) || 0} joyerías con saldo`;

    const listExig = document.getElementById('bg-list-exigible');
    if (listExig) {
      const debtors = (activos.exigible && activos.exigible.debtors) || [];
      if (debtors.length === 0) {
        listExig.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-dim); font-size: 0.82rem;">No hay cartera pendiente por cobrar. Clientes al día.</div>`;
      } else {
        listExig.innerHTML = debtors.slice(0, 6).map(d => {
          return `
            <div class="balance-line-item">
              <div>
                <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">
                  ${this.escapeHtml(d.name)}
                  <span style="font-size: 0.72rem; color: var(--text-dim); font-weight: 400;">(${this.escapeHtml(d.city || 'Principal')})</span>
                </div>
                <div style="font-size: 0.72rem; color: var(--text-dim);">
                  Pactado en metal: <strong style="color: var(--gold-light);">${(d.debtGrams || 0).toFixed(2)}g 18K</strong> | Cupo: $${(d.creditLimit || 0).toLocaleString('es-CO')}
                </div>
              </div>
              <span class="mono line-val" style="color: #a78bfa; font-weight: 800;">
                $${(d.debtPesos || 0).toLocaleString('es-CO')}
              </span>
            </div>
          `;
        }).join('');
      }
    }

    // 4.3 Realizables (Inventario Físico de Metales)
    const subReal = document.getElementById('bg-subtotal-realizable');
    if (subReal) subReal.innerText = `$${((activos.realizable && activos.realizable.totalInventoryValue) || 0).toLocaleString('es-CO')}`;

    const listReal = document.getElementById('bg-list-realizable');
    if (listReal && activos.realizable) {
      const r = activos.realizable;
      const it = r.joyeriaItaliana18k || {};
      const nc = r.joyeriaNacional18k || {};
      const pBov = r.oroPuro24kBoveda || {};
      const pTal = r.oroPuro24kEnTalleres || {};
      const ret = r.retalOro18kBoveda || {};
      const oth = r.joyeriaOtrasCategorias18k || {};

      const othHtml = (oth.grams > 0) ? `
        <div class="balance-line-item">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.15rem;">✨</span>
            <div>
              <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">Otras Categorías & Joyería Especial (Bóveda)</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">
                Stock: <strong>${(oth.grams || 0).toFixed(2)} g</strong>
              </div>
            </div>
          </div>
          <span class="mono line-val" style="color: #38bdf8; font-weight: 800;">
            $${(oth.totalValue || 0).toLocaleString('es-CO')}
          </span>
        </div>
      ` : '';

      listReal.innerHTML = `
        <div class="balance-line-item">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.15rem;">🇮🇹</span>
            <div>
              <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">Oro Italiano 18K (Ley 750) en Bóveda</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">
                Stock: <strong>${(it.grams || 0).toFixed(2)} g</strong> | Costo promedio: $${(it.costRateAvg || 0).toLocaleString('es-CO')}/g
              </div>
            </div>
          </div>
          <span class="mono line-val" style="color: #10b981; font-weight: 800;">
            $${(it.totalValue || 0).toLocaleString('es-CO')}
          </span>
        </div>

        <div class="balance-line-item">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.15rem;">🇨🇴</span>
            <div>
              <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">Oro Nacional 18K en Bóveda</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">
                Stock: <strong>${(nc.grams || 0).toFixed(2)} g</strong> | Costo promedio: $${(nc.costRateAvg || 0).toLocaleString('es-CO')}/g
              </div>
            </div>
          </div>
          <span class="mono line-val" style="color: #f59e0b; font-weight: 800;">
            $${(nc.totalValue || 0).toLocaleString('es-CO')}
          </span>
        </div>

        ${othHtml}

        <div class="balance-line-item">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.15rem;">👑</span>
            <div>
              <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">Granalla & Lingotes Oro Puro 24K (Bóveda)</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">
                Stock: <strong>${(pBov.grams || 0).toFixed(2)} g</strong> | Costo benchmark: $${(pBov.costRateAvg || 0).toLocaleString('es-CO')}/g
              </div>
            </div>
          </div>
          <span class="mono line-val" style="color: var(--gold-primary); font-weight: 800;">
            $${(pBov.totalValue || 0).toLocaleString('es-CO')}
          </span>
        </div>

        <div class="balance-line-item">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.15rem;">🔨</span>
            <div>
              <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">Oro Puro 24K en Talleres de Maquila</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">
                Metal propio en confección: <strong>${(pTal.grams || 0).toFixed(2)} g</strong>
              </div>
            </div>
          </div>
          <span class="mono line-val" style="color: #eab308; font-weight: 800;">
            $${(pTal.totalValue || 0).toLocaleString('es-CO')}
          </span>
        </div>

        <div class="balance-line-item">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.15rem;">♻️</span>
            <div>
              <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">Retal de Oro 18K en Bóveda (Abonos)</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">
                Stock: <strong>${(ret.grams || 0).toFixed(2)} g</strong> | Tasa retal: $${(ret.rate || 0).toLocaleString('es-CO')}/g
              </div>
            </div>
          </div>
          <span class="mono line-val" style="color: #f87171; font-weight: 800;">
            $${(ret.totalValue || 0).toLocaleString('es-CO')}
          </span>
        </div>
      `;
    }

    // Grand Total Activos
    const gTotAssets = document.getElementById('bg-grand-total-assets');
    const gTotAssetsGrams = document.getElementById('bg-grand-total-assets-grams');
    if (gTotAssets) gTotAssets.innerText = `$${(activos.total || 0).toLocaleString('es-CO')}`;
    if (gTotAssetsGrams) gTotAssetsGrams.innerText = `${(activos.totalGramsEq24k || 0).toFixed(2)} g 24K eq.`;

    // 5. Right Column - Pasivos & Patrimonio
    const colLiabEq = document.getElementById('bg-col-total-liab-equity');
    if (colLiabEq) colLiabEq.innerText = `$${((pasivos.total || 0) + (patrimonio.netWorth || 0)).toLocaleString('es-CO')}`;

    // 5.1 Pasivos Proveedores
    const subCxpProv = document.getElementById('bg-subtotal-cxp-prov');
    if (subCxpProv) subCxpProv.innerText = `$${(pasivos.proveedoresPesos || 0).toLocaleString('es-CO')}`;

    const listProv = document.getElementById('bg-list-pasivos-prov');
    if (listProv) {
      const creditors = (pasivos.creditors || []).filter(c => (c.balanceDuePesos || 0) > 0);
      if (creditors.length === 0) {
        listProv.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-dim); font-size: 0.82rem;">Al día con proveedores de oro y producto terminado.</div>`;
      } else {
        listProv.innerHTML = creditors.map(c => `
          <div class="balance-line-item">
            <div>
              <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">${this.escapeHtml(c.name)}</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">${c.category === 'oro_puro' ? 'Oro Puro 24K' : 'Importador Italiano'}</div>
            </div>
            <span class="mono line-val" style="color: var(--danger-accent); font-weight: 800;">
              $${c.balanceDuePesos.toLocaleString('es-CO')}
            </span>
          </div>
        `).join('');
      }
    }

    // 5.2 Pasivos Manos de Obra
    const subCxpTal = document.getElementById('bg-subtotal-cxp-talleres');
    if (subCxpTal) subCxpTal.innerText = `$${(pasivos.manosDeObraTalleres || 0).toLocaleString('es-CO')}`;

    const listTal = document.getElementById('bg-list-pasivos-talleres');
    if (listTal) {
      const workshops = (pasivos.creditors || []).filter(c => (c.balanceManoDeObra || 0) > 0);
      if (workshops.length === 0) {
        listTal.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-dim); font-size: 0.82rem;">No hay manos de obra pendientes de pago a talleres.</div>`;
      } else {
        listTal.innerHTML = workshops.map(w => `
          <div class="balance-line-item">
            <div>
              <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">${this.escapeHtml(w.name)}</div>
              <div style="font-size: 0.72rem; color: var(--text-dim);">
                Metal en su poder: <strong>${(w.puroInHandsGrams || 0).toFixed(2)} g 24K</strong>
              </div>
            </div>
            <span class="mono line-val" style="color: var(--danger-accent); font-weight: 800;">
              $${w.balanceManoDeObra.toLocaleString('es-CO')}
            </span>
          </div>
        `).join('');
      }
    }

    // Pasivos Subtotal Strip
    const liabStrip = document.getElementById('bg-total-liabilities-strip');
    if (liabStrip) liabStrip.innerText = `$${(pasivos.total || 0).toLocaleString('es-CO')}`;

    // 5.3 Patrimonio
    const subPatrimonio = document.getElementById('bg-subtotal-patrimonio');
    if (subPatrimonio) subPatrimonio.innerText = `$${(patrimonio.netWorth || 0).toLocaleString('es-CO')}`;

    const patSocial = document.getElementById('bg-patrimonio-capital-social');
    if (patSocial) patSocial.innerText = `$${(patrimonio.initialCapitalContribution || 0).toLocaleString('es-CO')}`;

    const patUtil = document.getElementById('bg-patrimonio-utilidad');
    if (patUtil) patUtil.innerText = `$${(patrimonio.accumulatedProfitMargin || 0).toLocaleString('es-CO')}`;

    const patGrams = document.getElementById('bg-patrimonio-grams-eq');
    if (patGrams) patGrams.innerText = `${(patrimonio.netWorthGramsEq24k || 0).toFixed(2)} g 24K`;

    // Grand Total Pasivos + Patrimonio
    const gTotLiabEq = document.getElementById('bg-grand-total-liab-equity');
    if (gTotLiabEq) gTotLiabEq.innerText = `$${((pasivos.total || 0) + (patrimonio.netWorth || 0)).toLocaleString('es-CO')}`;

    // 6. Ratios de Diagnóstico Financiero
    const rSolv = document.getElementById('bg-ratio-solvency');
    const rSolvTxt = document.getElementById('bg-ratio-solvency-text');
    if (rSolv) rSolv.innerText = `${(ratios.solvencyRatio || 0).toFixed(2)}x`;
    if (rSolvTxt) rSolvTxt.innerText = `$${(ratios.solvencyRatio || 0).toLocaleString('es-CO')}`;

    const rAcid = document.getElementById('bg-ratio-acid');
    if (rAcid) rAcid.innerText = `${(ratios.acidTestRatio || 0).toFixed(2)}x`;

    const rDebt = document.getElementById('bg-ratio-debt-pct');
    if (rDebt) rDebt.innerText = `${(ratios.debtToAssetRatio || 0).toFixed(1)}%`;

    const rMetal = document.getElementById('bg-ratio-metal-pct');
    if (rMetal) rMetal.innerText = `${(ratios.metalAllocationPct || 0).toFixed(1)}%`;
  },

  openPrintBalanceModal() {
    const data = this.balanceGeneralData;
    if (!data) {
      this.loadBalanceGeneral().then(() => this.openPrintBalanceModal());
      return;
    }
    const { activos, pasivos, patrimonio, ratios, asOfDate } = data;
    const formattedDate = new Date(asOfDate || Date.now()).toLocaleDateString('es-CO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const container = document.getElementById('balance-print-content');
    if (!container) return;

    container.innerHTML = `
      <div class="print-statement-header" style="border-bottom: 2px solid #d4af37; padding-bottom: 16px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h2 style="font-size: 1.4rem; color: #1e293b; margin: 0; font-weight: 800; letter-spacing: -0.02em;">NEXUS JOYAS MAYORISTAS S.A.S</h2>
            <div style="font-size: 0.85rem; color: #64748b; margin-top: 2px;">NIT: 901.884.221-9 | Régimen Ordinario Comercial</div>
            <div style="font-size: 0.85rem; color: #64748b;">Bóveda Central de Valores & Mayorista de Joyería en Oro 18K (750)</div>
          </div>
          <div style="text-align: right;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 12px; display: inline-block;">
              <span style="font-size: 0.72rem; color: #64748b; text-transform: uppercase; font-weight: 700; display: block;">CORTE CONTABLE</span>
              <strong style="font-size: 0.85rem; color: #0f172a;">${formattedDate}</strong>
            </div>
            <div style="font-size: 0.75rem; color: #059669; font-weight: 700; margin-top: 6px;">✓ Certificado Balance Cuadrado</div>
          </div>
        </div>
      </div>

      <div style="text-align: center; margin-bottom: 22px;">
        <h3 style="font-size: 1.15rem; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 800;">
          ESTADO DE SITUACIÓN FINANCIERA & BALANCE GENERAL PATRIMONIAL
        </h3>
        <p style="font-size: 0.78rem; color: #64748b; margin: 4px 0 0 0;">Expresado en Pesos Colombianos (COP) y Equivalencia Fina en Oro Puro 24K (Ley 999.9)</p>
      </div>

      <!-- Resumen Ejecutivo de Doble Partida -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px;">
          <div style="font-size: 0.75rem; font-weight: 700; color: #166534; text-transform: uppercase;">TOTAL ACTIVOS CONSOLIDADOS</div>
          <div style="font-size: 1.5rem; font-weight: 900; color: #15803d; margin: 4px 0;" class="mono">$${(activos.total || 0).toLocaleString('es-CO')}</div>
          <div style="font-size: 0.75rem; color: #166534;">Equivalente a ${(activos.totalGramsEq24k || 0).toFixed(2)} g Oro 24K</div>
        </div>
        <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 14px;">
          <div style="font-size: 0.75rem; font-weight: 700; color: #854d0e; text-transform: uppercase;">TOTAL PASIVOS + PATRIMONIO NETO</div>
          <div style="font-size: 1.5rem; font-weight: 900; color: #a16207; margin: 4px 0;" class="mono">$${((pasivos.total || 0) + (patrimonio.netWorth || 0)).toLocaleString('es-CO')}</div>
          <div style="font-size: 0.75rem; color: #854d0e;">Equilibrio Patrimonial NIIF Verificado</div>
        </div>
      </div>

      <!-- Detalle 2 Columnas -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
        
        <!-- Columna Activos -->
        <div>
          <h4 style="font-size: 0.92rem; color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 6px; margin-bottom: 10px; font-weight: 800;">
            1. ACTIVOS DE LA COMPAÑÍA
          </h4>
          <table style="width: 100%; font-size: 0.8rem; border-collapse: collapse;">
            <tbody>
              <tr style="background: #f8fafc; font-weight: 700;">
                <td style="padding: 6px 4px;">1.1 Activos Disponibles (Caja & Bancos)</td>
                <td style="padding: 6px 4px; text-align: right;" class="mono">$${((activos.disponible && activos.disponible.total) || 0).toLocaleString('es-CO')}</td>
              </tr>
              ${((activos.disponible && activos.disponible.cuentas) || []).map(a => `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 4px 12px; color: #475569;">• ${this.escapeHtml(a.name)}</td>
                  <td style="padding: 4px 4px; text-align: right; color: #334155;" class="mono">$${(a.balance || 0).toLocaleString('es-CO')}</td>
                </tr>
              `).join('')}

              <tr style="background: #f8fafc; font-weight: 700;">
                <td style="padding: 6px 4px;">1.2 Activos Exigibles (Cartera CxC)</td>
                <td style="padding: 6px 4px; text-align: right;" class="mono">$${((activos.exigible && activos.exigible.totalPesos) || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 4px 12px; color: #475569;">• Respaldo en Metal Cartera (${((activos.exigible && activos.exigible.activeDebtorsCount) || 0)} clientes)</td>
                <td style="padding: 4px 4px; text-align: right; color: #334155;" class="mono">${((activos.exigible && activos.exigible.totalGrams18k) || 0).toFixed(2)} g 18K</td>
              </tr>

              <tr style="background: #f8fafc; font-weight: 700;">
                <td style="padding: 6px 4px;">1.3 Activos Realizables (Inventario Metales)</td>
                <td style="padding: 6px 4px; text-align: right;" class="mono">$${((activos.realizable && activos.realizable.totalInventoryValue) || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 4px 12px; color: #475569;">• Oro Italiano 18K (${((activos.realizable && activos.realizable.joyeriaItaliana18k && activos.realizable.joyeriaItaliana18k.grams) || 0).toFixed(2)}g)</td>
                <td style="padding: 4px 4px; text-align: right; color: #334155;" class="mono">$${((activos.realizable && activos.realizable.joyeriaItaliana18k && activos.realizable.joyeriaItaliana18k.totalValue) || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 4px 12px; color: #475569;">• Oro Nacional 18K (${((activos.realizable && activos.realizable.joyeriaNacional18k && activos.realizable.joyeriaNacional18k.grams) || 0).toFixed(2)}g)</td>
                <td style="padding: 4px 4px; text-align: right; color: #334155;" class="mono">$${((activos.realizable && activos.realizable.joyeriaNacional18k && activos.realizable.joyeriaNacional18k.totalValue) || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 4px 12px; color: #475569;">• Granalla Oro Puro 24K Bóveda (${((activos.realizable && activos.realizable.oroPuro24kBoveda && activos.realizable.oroPuro24kBoveda.grams) || 0).toFixed(2)}g)</td>
                <td style="padding: 4px 4px; text-align: right; color: #334155;" class="mono">$${((activos.realizable && activos.realizable.oroPuro24kBoveda && activos.realizable.oroPuro24kBoveda.totalValue) || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 4px 12px; color: #475569;">• Oro Puro 24K en Talleres Maquila (${((activos.realizable && activos.realizable.oroPuro24kEnTalleres && activos.realizable.oroPuro24kEnTalleres.grams) || 0).toFixed(2)}g)</td>
                <td style="padding: 4px 4px; text-align: right; color: #334155;" class="mono">$${((activos.realizable && activos.realizable.oroPuro24kEnTalleres && activos.realizable.oroPuro24kEnTalleres.totalValue) || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 4px 12px; color: #475569;">• Retal de Oro 18K en Bóveda (${((activos.realizable && activos.realizable.retalOro18kBoveda && activos.realizable.retalOro18kBoveda.grams) || 0).toFixed(2)}g)</td>
                <td style="padding: 4px 4px; text-align: right; color: #334155;" class="mono">$${((activos.realizable && activos.realizable.retalOro18kBoveda && activos.realizable.retalOro18kBoveda.totalValue) || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-top: 2px solid #0284c7; font-weight: 800; font-size: 0.88rem;">
                <td style="padding: 8px 4px;">TOTAL ACTIVOS:</td>
                <td style="padding: 8px 4px; text-align: right; color: #0284c7;" class="mono">$${(activos.total || 0).toLocaleString('es-CO')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Columna Pasivos & Patrimonio -->
        <div>
          <h4 style="font-size: 0.92rem; color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 6px; margin-bottom: 10px; font-weight: 800;">
            2. PASIVOS & OBLIGACIONES
          </h4>
          <table style="width: 100%; font-size: 0.8rem; border-collapse: collapse; margin-bottom: 16px;">
            <tbody>
              <tr style="background: #fef2f2; font-weight: 700;">
                <td style="padding: 6px 4px;">2.1 Proveedores de Oro & Joyería</td>
                <td style="padding: 6px 4px; text-align: right;" class="mono">$${(pasivos.proveedoresPesos || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="background: #fef2f2; font-weight: 700;">
                <td style="padding: 6px 4px;">2.2 Manos de Obra por Liquidar (Talleres)</td>
                <td style="padding: 6px 4px; text-align: right;" class="mono">$${(pasivos.manosDeObraTalleres || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-top: 1px solid #dc2626; font-weight: 800;">
                <td style="padding: 6px 4px; color: #dc2626;">TOTAL PASIVOS EXIGIBLES:</td>
                <td style="padding: 6px 4px; text-align: right; color: #dc2626;" class="mono">$${(pasivos.total || 0).toLocaleString('es-CO')}</td>
              </tr>
            </tbody>
          </table>

          <h4 style="font-size: 0.92rem; color: #d4af37; border-bottom: 2px solid #d4af37; padding-bottom: 6px; margin-bottom: 10px; font-weight: 800;">
            3. PATRIMONIO NETO CONTABLE
          </h4>
          <table style="width: 100%; font-size: 0.8rem; border-collapse: collapse;">
            <tbody>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 6px 4px; color: #334155;">3.1 Capital Social Inicial & Aportes Bóveda</td>
                <td style="padding: 6px 4px; text-align: right;" class="mono">$${(patrimonio.initialCapitalContribution || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 6px 4px; color: #334155;">3.2 Utilidades Acumuladas por Despachos</td>
                <td style="padding: 6px 4px; text-align: right; color: #059669;" class="mono">$${(patrimonio.accumulatedProfitMargin || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 6px 4px; color: #334155;">3.3 Respaldo Fino Equivalente</td>
                <td style="padding: 6px 4px; text-align: right; color: #b45309;" class="mono">${(patrimonio.netWorthGramsEq24k || 0).toFixed(2)} g 24K</td>
              </tr>
              <tr style="border-top: 2px solid #d4af37; font-weight: 800; font-size: 0.88rem;">
                <td style="padding: 8px 4px;">TOTAL PATRIMONIO NETO:</td>
                <td style="padding: 8px 4px; text-align: right; color: #d4af37;" class="mono">$${(patrimonio.netWorth || 0).toLocaleString('es-CO')}</td>
              </tr>
              <tr style="border-top: 2px solid #334155; font-weight: 800; font-size: 0.88rem; background: #f8fafc;">
                <td style="padding: 8px 4px;">TOTAL PASIVO + PATRIMONIO:</td>
                <td style="padding: 8px 4px; text-align: right; color: #0f172a;" class="mono">$${((pasivos.total || 0) + (patrimonio.netWorth || 0)).toLocaleString('es-CO')}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      <!-- Ratios de Solvencia en el Documento -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 30px;">
        <div style="font-size: 0.78rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 8px;">
          INDICADORES DE LIQUIDEZ Y RESPALDO FINANCIERO:
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #334155; flex-wrap: wrap; gap: 8px;">
          <div><strong>Razón Corriente:</strong> ${(ratios.solvencyRatio || 0).toFixed(2)}x</div>
          <div><strong>Prueba Ácida:</strong> ${(ratios.acidTestRatio || 0).toFixed(2)}x</div>
          <div><strong>Apalancamiento:</strong> ${(ratios.debtToAssetRatio || 0).toFixed(1)}%</div>
          <div><strong>Concentración en Oro:</strong> ${(ratios.metalAllocationPct || 0).toFixed(1)}%</div>
        </div>
      </div>

      <!-- Firmas Oficiales de Auditoría -->
      <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; text-align: center;">
        <div>
          <div style="border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 8px;"></div>
          <strong style="font-size: 0.82rem; color: #0f172a; display: block;">GERENCIA GENERAL</strong>
          <span style="font-size: 0.72rem; color: #64748b;">Representante Legal</span>
        </div>
        <div>
          <div style="border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 8px;"></div>
          <strong style="font-size: 0.82rem; color: #0f172a; display: block;">CONTADOR PÚBLICO</strong>
          <span style="font-size: 0.72rem; color: #64748b;">T.P. No. 248911-T</span>
        </div>
        <div>
          <div style="border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 8px;"></div>
          <strong style="font-size: 0.82rem; color: #0f172a; display: block;">AUDITOR DE BÓVEDA</strong>
          <span style="font-size: 0.72rem; color: #64748b;">Custodia de Valores & Metales</span>
        </div>
      </div>
    `;

    const modal = document.getElementById('modal-print-balance');
    if (modal) modal.classList.add('active');
  },

  exportBalanceCSV() {
    const data = this.balanceGeneralData;
    if (!data) {
      alert('Por favor espera a que se cargue el balance antes de exportar.');
      return;
    }
    const { activos, pasivos, patrimonio, ratios, asOfDate } = data;
    const nowStr = (asOfDate ? new Date(asOfDate) : new Date()).toISOString().split('T')[0];

    const lines = [];
    lines.push('NEXUS JOYAS MAYORISTAS S.A.S - BALANCE GENERAL Y ESTADO PATRIMONIAL');
    lines.push(`Fecha de Corte Contable: ${nowStr}`);
    lines.push(`Moneda: COP ($ Pesos Colombianos)`);
    lines.push('');
    lines.push('CODIGO;CONCEPTO;CANTIDAD / GRAMOS;VALOR COP;OBSERVACIONES');
    
    // Activos
    lines.push('1;TOTAL ACTIVOS;;' + (activos.total || 0) + ';Equivalente a ' + (activos.totalGramsEq24k || 0) + ' g 24K');
    lines.push('1.1;ACTIVOS DISPONIBLES (CAJA Y BANCOS);;' + ((activos.disponible && activos.disponible.total) || 0) + ';');
    ((activos.disponible && activos.disponible.cuentas) || []).forEach((c, idx) => {
      lines.push(`1.1.${idx + 1};${c.name};;${c.balance};${c.type}`);
    });

    lines.push('1.2;ACTIVOS EXIGIBLES (CARTERA CXC);' + ((activos.exigible && activos.exigible.totalGrams18k) || 0) + ' g 18K;' + ((activos.exigible && activos.exigible.totalPesos) || 0) + ';Cartera mayorista respaldada en metal');
    ((activos.exigible && activos.exigible.debtors) || []).forEach((d, idx) => {
      lines.push(`1.2.${idx + 1};Cliente: ${d.name} (${d.city || ''});${d.debtGrams} g 18K;${d.debtPesos};Cupo: ${d.creditLimit}`);
    });

    lines.push('1.3;ACTIVOS REALIZABLES (INVENTARIO FISICO METALES);' + ((activos.realizable && activos.realizable.totalInventoryGrams) || 0) + ' g;' + ((activos.realizable && activos.realizable.totalInventoryValue) || 0) + ';');
    if (activos.realizable) {
      const r = activos.realizable;
      if (r.joyeriaItaliana18k) lines.push(`1.3.1;Oro Italiano 18K (750) en Boveda;${r.joyeriaItaliana18k.grams} g;${r.joyeriaItaliana18k.totalValue};Costo promedio $${r.joyeriaItaliana18k.costRateAvg}/g`);
      if (r.joyeriaNacional18k) lines.push(`1.3.2;Oro Nacional 18K en Boveda;${r.joyeriaNacional18k.grams} g;${r.joyeriaNacional18k.totalValue};Costo promedio $${r.joyeriaNacional18k.costRateAvg}/g`);
      if (r.oroPuro24kBoveda) lines.push(`1.3.3;Granalla Oro Puro 24K Boveda;${r.oroPuro24kBoveda.grams} g;${r.oroPuro24kBoveda.totalValue};Benchmark $${r.oroPuro24kBoveda.costRateAvg}/g`);
      if (r.oroPuro24kEnTalleres) lines.push(`1.3.4;Oro Puro 24K en Talleres Maquila;${r.oroPuro24kEnTalleres.grams} g;${r.oroPuro24kEnTalleres.totalValue};Metal propio en confeccion`);
      if (r.retalOro18kBoveda) lines.push(`1.3.5;Retal de Oro 18K en Boveda;${r.retalOro18kBoveda.grams} g;${r.retalOro18kBoveda.totalValue};Tasa retal $${r.retalOro18kBoveda.rate}/g`);
    }

    lines.push('');
    // Pasivos
    lines.push('2;TOTAL PASIVOS EXIGIBLES;;' + (pasivos.total || 0) + ';Obligaciones comerciales');
    lines.push('2.1;Pasivos Proveedores Oro y Joyeria;;' + (pasivos.proveedoresPesos || 0) + ';');
    ((pasivos.creditors || []).filter(c => (c.balanceDuePesos || 0) > 0)).forEach((p, idx) => {
      lines.push(`2.1.${idx + 1};Proveedor: ${p.name};;${p.balanceDuePesos};${p.category}`);
    });
    lines.push('2.2;Pasivos Manos de Obra Talleres;;' + (pasivos.manosDeObraTalleres || 0) + ';');
    ((pasivos.creditors || []).filter(c => (c.balanceManoDeObra || 0) > 0)).forEach((w, idx) => {
      lines.push(`2.2.${idx + 1};Taller: ${w.name};${w.puroInHandsGrams} g 24K en custodia;${w.balanceManoDeObra};Mano de obra pendiente`);
    });

    lines.push('');
    // Patrimonio
    lines.push('3;TOTAL PATRIMONIO NETO;;' + (patrimonio.netWorth || 0) + ';Equivalente a ' + (patrimonio.netWorthGramsEq24k || 0) + ' g 24K');
    lines.push('3.1;Capital Social Inicial y Aportes Boveda;;' + (patrimonio.initialCapitalContribution || 0) + ';Fondo de apertura');
    lines.push('3.2;Utilidades Acumuladas por Despachos;;' + (patrimonio.accumulatedProfitMargin || 0) + ';Margen comercial');

    lines.push('');
    // Verificación
    lines.push('4;VERIFICACION ECUACION PATRIMONIAL;;;');
    lines.push(`4.1;ACTIVOS TOTALES;;${activos.total || 0};`);
    lines.push(`4.2;PASIVOS + PATRIMONIO;;${(pasivos.total || 0) + (patrimonio.netWorth || 0)};DIFERENCIA: 0`);
    lines.push(`4.3;Razon de Solvencia;;${(ratios.solvencyRatio || 0)};veces`);
    lines.push(`4.4;Prueba Acida;;${(ratios.acidTestRatio || 0)};veces`);
    lines.push(`4.5;Nivel de Endeudamiento;;${(ratios.debtToAssetRatio || 0)}%;`);
    lines.push(`4.6;Concentracion en Metales;;${(ratios.metalAllocationPct || 0)}%;`);

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Balance_General_Nexus_${nowStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // =========================================================
  // MÓDULO DE GASTOS OPERATIVOS (OPEX)
  // =========================================================

  populateGastosPaymentMethodDropdowns() {
    const selForm = document.getElementById('gasto-method');
    const selFilter = document.getElementById('gastos-filter-method');
    const methods = (this.paymentMethods && this.paymentMethods.length > 0)
      ? this.paymentMethods.filter(pm => pm.isActive !== false)
      : [
          { name: 'Efectivo en Caja Bóveda Principal (COP)', type: 'Caja' },
          { name: 'Bancolombia Bóveda Operativa', type: 'Bancario' }
        ];

    if (selForm) {
      const currentVal = selForm.value;
      selForm.innerHTML = methods
        .map(pm => `<option value="${pm.name}">${pm.name} (${pm.type || 'Cuenta'})</option>`)
        .join('');
      if (currentVal && Array.from(selForm.options).some(o => o.value === currentVal)) {
        selForm.value = currentVal;
      }
    }

    if (selFilter) {
      const currentVal = selFilter.value;
      let opts = '<option value="all">Todos los Medios / Cuentas</option>';
      methods.forEach(pm => {
        opts += `<option value="${pm.name}">${pm.name}</option>`;
      });
      selFilter.innerHTML = opts;
      if (currentVal && Array.from(selFilter.options).some(o => o.value === currentVal)) {
        selFilter.value = currentVal;
      }
    }
  },

  async loadGastosOperativos() {
    this.populateGastosPaymentMethodDropdowns();

    const tbody = document.getElementById('gastos-table-body');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--gold-light);">⏳ Cargando gastos operativos...</td></tr>`;
    }

    try {
      const params = new URLSearchParams();
      params.append('period', this.gastosPeriod);
      if (this.gastosPeriod === 'custom' && this.gastosStartDate && this.gastosEndDate) {
        params.append('startDate', this.gastosStartDate);
        params.append('endDate', this.gastosEndDate);
      }
      if (this.gastosCategoryFilter && this.gastosCategoryFilter !== 'all') {
        params.append('category', this.gastosCategoryFilter);
      }
      if (this.gastosMethodFilter && this.gastosMethodFilter !== 'all') {
        params.append('method', this.gastosMethodFilter);
      }
      if (this.gastosSearchQuery) {
        params.append('search', this.gastosSearchQuery);
      }

      const res = await fetch(`/api/gastos-operativos?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        this.gastosData = data;
        this.renderGastosOperativos(data);
      } else {
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: #f87171;">Error al cargar gastos: ${data.message || 'Error del servidor'}</td></tr>`;
        }
      }
    } catch (err) {
      console.error('Error fetching gastos operativos:', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: #f87171;">Error de red al consultar egresos de bóveda.</td></tr>`;
      }
    }
  },

  renderGastosOperativos(data) {
    const summary = data.summary || {};
    const expenses = data.expenses || [];

    // Period buttons active state
    document.querySelectorAll('#gastos-period-buttons .btn-period').forEach(btn => {
      const p = btn.getAttribute('data-period');
      if (p === this.gastosPeriod) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    // Period label badge
    const periodLabelEl = document.getElementById('gastos-period-label');
    const periodLabels = {
      hoy: 'Hoy',
      ayer: 'Ayer',
      semana: 'Esta Semana',
      mes: 'Este Mes',
      mes_anterior: 'Mes Anterior',
      ano: 'Este Año',
      custom: `${this.gastosStartDate || 'Desde'} a ${this.gastosEndDate || 'Hasta'}`
    };
    if (periodLabelEl) {
      periodLabelEl.innerText = periodLabels[this.gastosPeriod] || this.gastosPeriod;
    }

    // Benchmark gold pill
    const benchmarkPill = document.getElementById('gastos-benchmark-pill');
    const benchmarkRate = this.averages.promedioPuro24k || 405000;
    if (benchmarkPill) {
      benchmarkPill.innerText = `👑 Benchmark 24K: $${benchmarkRate.toLocaleString('es-CO')}/g`;
    }

    // 4 Executive KPI Cards
    const totalExpenses = summary.totalExpenses || 0;
    const totalGrams24k = summary.totalGrams24kEquivalent || 0;
    const averageDaily = summary.averageDaily || 0;
    const topCat = summary.topCategory || {};
    const opexRatio = summary.opexToSalesRatio || 0;
    const totalSales = summary.totalSalesRef || 0;

    const elTotal = document.getElementById('gastos-kpi-total');
    const elTotalGrams = document.getElementById('gastos-kpi-total-grams');
    const elTotalTag = document.getElementById('gastos-kpi-total-tag');
    if (elTotal) elTotal.innerText = `$${totalExpenses.toLocaleString('es-CO')}`;
    if (elTotalGrams) elTotalGrams.innerText = `Equivalente a ${totalGrams24k.toFixed(2)} g Oro Puro 24K`;
    if (elTotalTag) elTotalTag.innerText = `${summary.totalTransactions || 0} egresos registrados`;

    const elDaily = document.getElementById('gastos-kpi-daily');
    const elDailySub = document.getElementById('gastos-kpi-daily-sub');
    if (elDaily) elDaily.innerText = `$${averageDaily.toLocaleString('es-CO')} / día`;
    if (elDailySub) elDailySub.innerText = `Tasa de quema operativa (Burn Rate)`;

    const elTopCat = document.getElementById('gastos-kpi-top-cat');
    const elTopCatSub = document.getElementById('gastos-kpi-top-cat-sub');
    const elTopIcon = document.getElementById('gastos-kpi-top-icon');
    if (elTopCat) {
      elTopCat.innerText = topCat.category || 'Sin datos';
      elTopCat.style.color = topCat.color || '#a78bfa';
    }
    if (elTopCatSub) {
      elTopCatSub.innerText = `${topCat.percentage || 0}% del gasto total ($${(topCat.amount || 0).toLocaleString('es-CO')})`;
    }
    if (elTopIcon) elTopIcon.innerText = topCat.icon || '🏷️';

    const elRatio = document.getElementById('gastos-kpi-ratio-sales');
    const elRatioSub = document.getElementById('gastos-kpi-ratio-sales-sub');
    const elRatioTag = document.getElementById('gastos-kpi-efficiency-tag');
    if (elRatio) elRatio.innerText = `${opexRatio.toFixed(1)}%`;
    if (elRatioSub) elRatioSub.innerText = `Sobre ventas en remisiones ($${totalSales.toLocaleString('es-CO')})`;
    if (elRatioTag) {
      if (opexRatio <= 12) {
        elRatioTag.innerText = 'Eficiencia Óptima (< 12%)';
        elRatioTag.style.color = '#34d399';
      } else if (opexRatio <= 25) {
        elRatioTag.innerText = 'Nivel Saludable (12-25%)';
        elRatioTag.style.color = '#38bdf8';
      } else {
        elRatioTag.innerText = 'Atención: Alto Impacto (> 25%)';
        elRatioTag.style.color = '#f87171';
      }
    }

    // Category Visual Distribution Bar
    const barContainer = document.getElementById('gastos-category-bar');
    const legendContainer = document.getElementById('gastos-category-legend');
    const catBreakdown = summary.categoryBreakdown || [];

    if (barContainer) {
      if (catBreakdown.length === 0 || totalExpenses === 0) {
        barContainer.innerHTML = `<div style="width: 100%; height: 100%; background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-size: 0.72rem; color: var(--text-dim);">Sin movimientos en este período</div>`;
      } else {
        barContainer.innerHTML = catBreakdown.map(c => `
          <div class="asset-alloc-segment" 
               style="width: ${Math.max(1.5, c.percentage)}%; background-color: ${c.color};" 
               title="${c.category}: $${c.amount.toLocaleString('es-CO')} (${c.percentage}%)">
          </div>
        `).join('');
      }
    }

    if (legendContainer) {
      if (catBreakdown.length === 0) {
        legendContainer.innerHTML = `<span style="font-size: 0.78rem; color: var(--text-dim);">No hay categorías registradas.</span>`;
      } else {
        legendContainer.innerHTML = catBreakdown.map(c => {
          const isSelected = this.gastosCategoryFilter === c.category;
          return `
            <div class="alloc-legend-item ${isSelected ? 'active-filter' : ''}" 
                 onclick="App.setGastosCategoryFilter('${c.category === this.gastosCategoryFilter ? 'all' : c.category}')"
                 style="cursor: pointer; padding: 4px 8px; border-radius: 6px; background: ${isSelected ? 'rgba(212,175,55,0.15)' : 'transparent'}; border: 1px solid ${isSelected ? 'var(--gold-primary)' : 'transparent'}; transition: all 0.2s ease;"
                 title="Haz clic para filtrar por ${c.category}">
              <span class="legend-color-dot" style="background: ${c.color};"></span>
              <span style="font-size: 0.78rem;">
                ${c.icon || '🏷️'} <strong>${c.category}</strong>: 
                <span class="mono" style="color: ${c.color}; font-weight: 700;">${c.percentage}%</span> 
                ($${c.amount.toLocaleString('es-CO')})
              </span>
            </div>
          `;
        }).join('');
      }
    }

    // Filter controls sync
    const selCat = document.getElementById('gastos-filter-category');
    if (selCat) selCat.value = this.gastosCategoryFilter;

    // Render Table Rows
    const tbody = document.getElementById('gastos-table-body');
    const canEditGastos = this.hasPermission('gastos-operativos', 'canEdit');
    const canDeleteGastos = this.hasPermission('gastos-operativos', 'canDelete');
    const canExportGastos = this.hasPermission('gastos-operativos', 'canExport');

    if (tbody) {
      if (expenses.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 48px 20px;">
              <div style="font-size: 2.2rem; margin-bottom: 8px;">📂</div>
              <div style="font-size: 1rem; font-weight: 700; color: var(--text-headings);">No se encontraron egresos operativos</div>
              <p style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">Prueba cambiando el período de tiempo o limpiando los filtros de búsqueda.</p>
              ${canEditGastos ? `<button class="btn btn-gold btn-sm" style="margin-top: 12px;" onclick="App.openModalNuevoGasto()">+ Registrar Primer Gasto</button>` : ''}
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = expenses.map(exp => {
          const dateObj = new Date(exp.date);
          const formattedDate = !isNaN(dateObj.getTime())
            ? dateObj.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
            : exp.date;
          
          const catMeta = (catBreakdown.find(c => c.category === exp.category)) || { color: '#d4af37', icon: '🧾' };
          const categoryColor = catMeta.color || '#d4af37';
          const categoryIcon = catMeta.icon || '🧾';

          return `
            <tr style="transition: background 0.2s ease;">
              <td class="mono" style="font-size: 0.8rem; color: var(--text-dim); white-space: nowrap;">
                📅 ${formattedDate}
              </td>
              <td>
                <div style="font-weight: 700; color: var(--text-headings); font-size: 0.88rem;">
                  ${exp.concept || 'Gasto Operativo'}
                </div>
                ${exp.notes ? `<div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">💬 ${exp.notes}</div>` : ''}
              </td>
              <td>
                <span class="ticker-badge" style="background: ${categoryColor}18; color: ${categoryColor}; border: 1px solid ${categoryColor}40; font-size: 0.75rem; padding: 2px 8px; border-radius: 9999px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">
                  <span>${categoryIcon}</span>
                  <span>${exp.category || 'Varios'}</span>
                </span>
              </td>
              <td style="font-size: 0.8rem; color: var(--text-muted);">
                <div style="display: flex; align-items: center; gap: 4px;">
                  <span>💳</span>
                  <span>${exp.method || exp.paymentMethod || 'Efectivo'}</span>
                </div>
              </td>
              <td style="font-size: 0.82rem; color: var(--text-headings);">
                ${exp.beneficiary || exp.thirdParty ? `<strong>${exp.beneficiary || exp.thirdParty}</strong>` : '<span style="color: var(--text-dim); font-style: italic;">Sin especificar</span>'}
              </td>
              <td>
                <span class="mono" style="font-size: 0.78rem; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); color: var(--gold-light);">
                  ${exp.reference || 'S/N'}
                </span>
              </td>
              <td class="text-right mono" style="font-size: 0.95rem; font-weight: 800; color: #f87171; white-space: nowrap;">
                -$${(Number(exp.amount) || 0).toLocaleString('es-CO')}
              </td>
              <td class="text-center" style="white-space: nowrap;">
                <div style="display: flex; justify-content: center; align-items: center; gap: 6px;">
                  <button type="button" class="btn btn-secondary btn-sm" onclick="App.openEditGastoModal('${exp.id}')" title="Editar este gasto" style="padding: 5px 8px; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px;" ${!canEditGastos ? 'disabled' : ''}>
                    <span>✏️</span> Editar
                  </button>
                  <button type="button" class="btn btn-outline-gold btn-sm" onclick="App.printSingleGastoVoucher('${exp.id}')" title="Ver Comprobante / Factura" style="padding: 5px 8px; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px;" ${!canExportGastos ? 'disabled' : ''}>
                    <span>🧾</span> Factura
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="App.deleteGasto('${exp.id}')" title="Eliminar gasto" style="padding: 5px 8px; font-size: 0.76rem; color: #ef4444; border-color: rgba(239,68,68,0.3); display: inline-flex; align-items: center; gap: 4px;" ${!canDeleteGastos ? 'disabled' : ''}>
                    <span>🗑️</span> Borrar
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // Footer summary
    const footCount = document.getElementById('gastos-foot-count');
    const footTotal = document.getElementById('gastos-foot-total');
    const footGrams = document.getElementById('gastos-foot-grams');
    if (footCount) footCount.innerText = summary.totalTransactions || 0;
    if (footTotal) footTotal.innerText = `-$${totalExpenses.toLocaleString('es-CO')}`;
    if (footGrams) footGrams.innerText = `${totalGrams24k.toFixed(2)} g 24K eq.`;
  },

  setGastosPeriod(period) {
    this.gastosPeriod = period;
    const rangeContainer = document.getElementById('gastos-custom-range-container');
    if (rangeContainer && period !== 'custom') {
      rangeContainer.style.display = 'none';
    }
    if (window.soundEngine) window.soundEngine.playChime();
    this.loadGastosOperativos();
  },

  toggleGastosCustomDateRange() {
    const rangeContainer = document.getElementById('gastos-custom-range-container');
    if (!rangeContainer) return;
    const isVisible = rangeContainer.style.display === 'flex';
    rangeContainer.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
      const today = new Date().toISOString().split('T')[0];
      const startInput = document.getElementById('gastos-date-start');
      const endInput = document.getElementById('gastos-date-end');
      if (startInput && !startInput.value) startInput.value = today;
      if (endInput && !endInput.value) endInput.value = today;
    }
  },

  applyGastosCustomDateRange() {
    const startInput = document.getElementById('gastos-date-start');
    const endInput = document.getElementById('gastos-date-end');
    if (!startInput || !endInput || !startInput.value || !endInput.value) {
      alert('Por favor selecciona tanto la fecha de inicio como la fecha final.');
      return;
    }
    this.gastosPeriod = 'custom';
    this.gastosStartDate = startInput.value;
    this.gastosEndDate = endInput.value;
    if (window.soundEngine) window.soundEngine.playChime();
    this.loadGastosOperativos();
  },

  setGastosCategoryFilter(cat) {
    this.gastosCategoryFilter = cat;
    const sel = document.getElementById('gastos-filter-category');
    if (sel) sel.value = cat;
    if (window.soundEngine) window.soundEngine.playChime();
    this.loadGastosOperativos();
  },

  setGastosMethodFilter(method) {
    this.gastosMethodFilter = method;
    if (window.soundEngine) window.soundEngine.playChime();
    this.loadGastosOperativos();
  },

  onGastosSearch(query) {
    clearTimeout(this.gastosSearchTimer);
    this.gastosSearchTimer = setTimeout(() => {
      this.gastosSearchQuery = query.trim();
      this.loadGastosOperativos();
    }, 250);
  },

  resetGastosFilters() {
    this.gastosPeriod = 'mes';
    this.gastosStartDate = '';
    this.gastosEndDate = '';
    this.gastosCategoryFilter = 'all';
    this.gastosMethodFilter = 'all';
    this.gastosSearchQuery = '';

    const searchInput = document.getElementById('gastos-search-input');
    if (searchInput) searchInput.value = '';
    const selCat = document.getElementById('gastos-filter-category');
    if (selCat) selCat.value = 'all';
    const selMethod = document.getElementById('gastos-filter-method');
    if (selMethod) selMethod.value = 'all';
    const rangeContainer = document.getElementById('gastos-custom-range-container');
    if (rangeContainer) rangeContainer.style.display = 'none';

    if (window.soundEngine) window.soundEngine.playChime();
    this.loadGastosOperativos();
  },

  openModalNuevoGasto() {
    if (!this.hasPermission('gastos-operativos', 'canEdit')) {
      alert('Acceso denegado: Tu rol no tiene permisos para registrar gastos operativos.');
      return;
    }
    this.populateGastosPaymentMethodDropdowns();
    const idInput = document.getElementById('gasto-id');
    const dateInput = document.getElementById('gasto-date');
    const catInput = document.getElementById('gasto-category');
    const conceptInput = document.getElementById('gasto-concept');
    const amountInput = document.getElementById('gasto-amount');
    const benInput = document.getElementById('gasto-beneficiary');
    const refInput = document.getElementById('gasto-reference');
    const notesInput = document.getElementById('gasto-notes');
    const titleEl = document.getElementById('modal-gasto-title');
    const submitBtn = document.getElementById('btn-submit-gasto');

    if (idInput) idInput.value = '';
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    if (catInput) catInput.value = 'Nómina & Comisiones Mayoristas';
    if (conceptInput) conceptInput.value = '';
    if (amountInput) amountInput.value = '';
    if (benInput) benInput.value = '';
    if (refInput) refInput.value = 'EG-' + Date.now().toString().slice(-6);
    if (notesInput) notesInput.value = '';
    if (titleEl) titleEl.innerText = 'Registrar Nuevo Gasto Operativo';
    if (submitBtn) submitBtn.innerHTML = '💾 Guardar Gasto';

    this.openModal('modal-gasto-operativo');
    if (window.soundEngine) window.soundEngine.playChime();
  },

  openEditGastoModal(gastoId) {
    if (!this.hasPermission('gastos-operativos', 'canEdit')) {
      alert('Acceso denegado: Tu rol no tiene permisos para editar gastos operativos.');
      return;
    }
    if (!this.gastosData || !this.gastosData.expenses) return;
    const exp = this.gastosData.expenses.find(e => e.id === gastoId);
    if (!exp) return;

    this.populateGastosPaymentMethodDropdowns();

    const idInput = document.getElementById('gasto-id');
    const dateInput = document.getElementById('gasto-date');
    const catInput = document.getElementById('gasto-category');
    const conceptInput = document.getElementById('gasto-concept');
    const amountInput = document.getElementById('gasto-amount');
    const methodInput = document.getElementById('gasto-method');
    const benInput = document.getElementById('gasto-beneficiary');
    const refInput = document.getElementById('gasto-reference');
    const notesInput = document.getElementById('gasto-notes');
    const titleEl = document.getElementById('modal-gasto-title');
    const submitBtn = document.getElementById('btn-submit-gasto');

    if (idInput) idInput.value = exp.id;
    if (dateInput) {
      const d = new Date(exp.date);
      dateInput.value = !isNaN(d.getTime()) ? exp.date.split('T')[0] : exp.date;
    }
    if (catInput) catInput.value = exp.category || 'Gastos Varios & Caja Menor';
    if (conceptInput) conceptInput.value = exp.concept || '';
    if (amountInput) amountInput.value = exp.amount || '';
    if (methodInput) methodInput.value = exp.method || exp.paymentMethod || '';
    if (benInput) benInput.value = exp.beneficiary || exp.thirdParty || '';
    if (refInput) refInput.value = exp.reference || '';
    if (notesInput) notesInput.value = exp.notes || '';
    if (titleEl) titleEl.innerText = 'Editar Gasto Operativo';
    if (submitBtn) submitBtn.innerHTML = '💾 Actualizar Cambios';

    this.openModal('modal-gasto-operativo');
    if (window.soundEngine) window.soundEngine.playChime();
  },

  async submitGastoForm() {
    if (!this.hasPermission('gastos-operativos', 'canEdit')) {
      alert('Acceso denegado: No tienes permisos para registrar o modificar gastos.');
      return;
    }

    const id = document.getElementById('gasto-id').value;
    const date = document.getElementById('gasto-date').value;
    const category = document.getElementById('gasto-category').value;
    const concept = document.getElementById('gasto-concept').value.trim();
    const amount = Number(document.getElementById('gasto-amount').value);
    const method = document.getElementById('gasto-method').value;
    const beneficiary = document.getElementById('gasto-beneficiary').value.trim();
    const reference = document.getElementById('gasto-reference').value.trim();
    const notes = document.getElementById('gasto-notes').value.trim();

    if (!concept) {
      alert('Por favor especifica el concepto o motivo del gasto.');
      return;
    }
    if (!amount || amount <= 0) {
      alert('El monto del egreso debe ser mayor a cero.');
      return;
    }

    let dateIso;
    if (date) {
      const now = new Date();
      const timePart = [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
      ].join(':');
      dateIso = new Date(`${date}T${timePart}`).toISOString();
    } else {
      dateIso = new Date().toISOString();
    }

    const payload = {
      date: dateIso,
      category,
      concept,
      amount,
      method,
      beneficiary,
      reference,
      notes
    };

    try {
      const isEdit = Boolean(id);
      const url = isEdit ? `/api/gastos-operativos/${id}` : '/api/gastos-operativos';
      const methodHttp = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: methodHttp,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (this.authToken || '')
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        if (window.soundEngine) window.soundEngine.playChime();
        this.closeAllModals();
        await this.loadGastosOperativos();
        await this.refreshAllData(); // Refresh vault chips and general metrics
      } else {
        alert('Error: ' + (data.message || 'No se pudo guardar el gasto.'));
      }
    } catch (err) {
      console.error('Error saving gasto:', err);
      alert('Error de red al intentar guardar el gasto.');
    }
  },

  async deleteGasto(gastoId) {
    if (!this.hasPermission('gastos-operativos', 'canDelete')) {
      alert('Acceso denegado: No tienes permisos para eliminar gastos operativos.');
      return;
    }

    let conceptInfo = 'este gasto operativo';
    if (this.gastosData && this.gastosData.expenses) {
      const exp = this.gastosData.expenses.find(e => e.id === gastoId);
      if (exp) conceptInfo = `"${exp.concept}" por $${(Number(exp.amount) || 0).toLocaleString('es-CO')}`;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar ${conceptInfo}?\n\nEsta acción descontará el egreso y actualizará los balances contables.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/gastos-operativos/${gastoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + (this.authToken || '')
        }
      });
      const data = await res.json();
      if (data.success) {
        if (window.soundEngine) window.soundEngine.playChime();
        alert(data.message || 'Gasto operativo eliminado exitosamente.');
        await this.loadGastosOperativos();
        await this.refreshAllData();
      } else {
        alert('Error al eliminar: ' + (data.message || 'Error del servidor'));
      }
    } catch (err) {
      console.error('Error deleting gasto:', err);
      alert('Error de red al intentar eliminar el gasto.');
    }
  },

  printSingleGastoVoucher(gastoId) {
    if (!this.hasPermission('gastos-operativos', 'canExport')) {
      alert('Acceso denegado: No tienes permisos para visualizar o exportar comprobantes.');
      return;
    }
    if (!this.gastosData || !this.gastosData.expenses) return;
    const exp = this.gastosData.expenses.find(e => e.id === gastoId);
    if (!exp) return;

    const titleEl = document.getElementById('print-gastos-modal-title');
    const subEl = document.getElementById('print-gastos-modal-subtitle');
    if (titleEl) titleEl.innerText = 'Comprobante Oficial de Egreso de Bóveda';
    if (subEl) subEl.innerText = 'Soporte individual de pago y deducción contable en efectivo/bancos';

    const printContainer = document.getElementById('gastos-print-content');
    if (!printContainer) return;

    const dateObj = new Date(exp.date);
    const dateFormatted = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : exp.date;

    const benchmark = this.averages.promedioPuro24k || 405000;
    const grams24kEq = (exp.amount / benchmark).toFixed(2);

    printContainer.innerHTML = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; padding: 24px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #d4af37; padding-bottom: 16px; margin-bottom: 20px;">
          <div>
            <h2 style="margin: 0; color: #0f172a; font-size: 1.4rem; letter-spacing: 0.05em; font-weight: 800;">NEXUS JOYAS MAYORISTAS S.A.S</h2>
            <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">NIT: 901.488.320-4 • Régimen Mayorista de Metales Preciosos</div>
            <div style="font-size: 0.8rem; color: #64748b;">Bóveda Central de Valores • Edificio San Francisco Plaza, Piso 8</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.72rem; color: #64748b; text-transform: uppercase; font-weight: 700;">COMPROBANTE DE EGRESO OFICIAL</div>
            <div style="font-size: 1.2rem; font-weight: 800; color: #dc2626; font-family: monospace;">N° ${exp.reference || exp.id}</div>
            <div style="font-size: 0.78rem; color: #475569; margin-top: 4px;">${dateFormatted}</div>
          </div>
        </div>

        <!-- Voucher Details Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 0.88rem;">
          <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 8px; width: 30%; color: #64748b; font-weight: 600;">Beneficiario / Proveedor:</td>
              <td style="padding: 10px 8px; font-weight: 800; color: #0f172a; font-size: 1rem;">
                ${exp.beneficiary || exp.thirdParty || 'Gastos Generales de Bóveda'}
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
              <td style="padding: 10px 8px; color: #64748b; font-weight: 600;">Categoría Operativa:</td>
              <td style="padding: 10px 8px; font-weight: 700; color: #4338ca;">
                ${exp.category || 'General'}
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 8px; color: #64748b; font-weight: 600;">Concepto / Justificación:</td>
              <td style="padding: 10px 8px; color: #1e293b; line-height: 1.4;">
                ${exp.concept}
              </td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
              <td style="padding: 10px 8px; color: #64748b; font-weight: 600;">Medio de Pago / Cuenta:</td>
              <td style="padding: 10px 8px; font-weight: 600; color: #0284c7;">
                ${exp.method || exp.paymentMethod || 'Efectivo en Caja Bóveda'}
              </td>
            </tr>
            ${exp.notes ? `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 8px; color: #64748b; font-weight: 600;">Observaciones Contables:</td>
              <td style="padding: 10px 8px; color: #475569; font-style: italic;">
                ${exp.notes}
              </td>
            </tr>` : ''}
            <tr style="border-top: 2px solid #0f172a; background: #fef2f2;">
              <td style="padding: 14px 8px; font-weight: 800; color: #dc2626; font-size: 1.05rem;">TOTAL PAGADO / DEDUCIDO:</td>
              <td style="padding: 14px 8px; font-weight: 900; color: #dc2626; font-size: 1.35rem; font-family: monospace;">
                $${(Number(exp.amount) || 0).toLocaleString('es-CO')} COP
                <span style="font-size: 0.85rem; color: #b45309; font-weight: 700; margin-left: 12px;">(≈ ${grams24kEq} g Puro 24K)</span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Signatures -->
        <div style="margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center;">
          <div>
            <div style="border-bottom: 1px solid #94a3b8; height: 44px; margin-bottom: 8px;"></div>
            <strong style="font-size: 0.85rem; color: #0f172a; display: block;">ENTREGADO / AUTORIZADO</strong>
            <span style="font-size: 0.74rem; color: #64748b;">Administración & Custodia de Bóveda</span>
          </div>
          <div>
            <div style="border-bottom: 1px solid #94a3b8; height: 44px; margin-bottom: 8px;"></div>
            <strong style="font-size: 0.85rem; color: #0f172a; display: block;">RECIBIDO A CONFORMIDAD</strong>
            <span style="font-size: 0.74rem; color: #64748b;">C.C. / NIT Beneficiario</span>
          </div>
        </div>

      </div>
    `;

    const modal = document.getElementById('modal-print-gastos');
    if (modal) modal.classList.add('active');
    if (window.soundEngine) window.soundEngine.playChime();
  },

  openPrintGastosModal() {
    if (!this.hasPermission('gastos-operativos', 'canExport')) {
      alert('Acceso denegado: No tienes permisos para emitir el reporte certificado.');
      return;
    }
    if (!this.gastosData) {
      alert('Por favor espera a que se carguen los gastos antes de imprimir.');
      return;
    }

    const titleEl = document.getElementById('print-gastos-modal-title');
    const subEl = document.getElementById('print-gastos-modal-subtitle');
    if (titleEl) titleEl.innerText = 'Certificado de Gastos Operativos (OPEX)';
    if (subEl) subEl.innerText = 'Reporte formal de auditoría de egresos operativos para contabilidad y gerencia';

    const { summary, expenses } = this.gastosData;
    const printContainer = document.getElementById('gastos-print-content');
    if (!printContainer) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const periodLabels = {
      hoy: 'Hoy',
      ayer: 'Ayer',
      semana: 'Esta Semana',
      mes: 'Este Mes',
      mes_anterior: 'Mes Anterior',
      ano: 'Este Año',
      custom: `${this.gastosStartDate} a ${this.gastosEndDate}`
    };
    const periodText = periodLabels[this.gastosPeriod] || this.gastosPeriod;

    printContainer.innerHTML = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; padding: 24px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px;">
        
        <!-- Document Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #d4af37; padding-bottom: 16px; margin-bottom: 20px;">
          <div>
            <h2 style="margin: 0; color: #0f172a; font-size: 1.4rem; letter-spacing: 0.05em; font-weight: 800;">NEXUS JOYAS MAYORISTAS S.A.S</h2>
            <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">NIT: 901.488.320-4 • Régimen Mayorista de Metales Preciosos</div>
            <div style="font-size: 0.8rem; color: #64748b;">Libro Oficial de Gastos Operativos (OPEX) & Egresos de Bóveda</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.72rem; color: #64748b; text-transform: uppercase; font-weight: 700;">PERÍODO AUDITADO</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #d4af37;">${periodText}</div>
            <div style="font-size: 0.78rem; color: #475569; margin-top: 4px;">Emisión: ${dateStr}</div>
          </div>
        </div>

        <!-- 4 Summary KPI Boxes -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 0.72rem; color: #dc2626; font-weight: 700; text-transform: uppercase;">Total Gastos</div>
            <div style="font-size: 1.2rem; font-weight: 900; color: #dc2626; font-family: monospace;">$${(summary.totalExpenses || 0).toLocaleString('es-CO')}</div>
            <div style="font-size: 0.7rem; color: #b91c1c;">${(summary.totalGrams24kEquivalent || 0).toFixed(2)} g 24K eq.</div>
          </div>

          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 0.72rem; color: #d97706; font-weight: 700; text-transform: uppercase;">Gasto Prom. Diario</div>
            <div style="font-size: 1.2rem; font-weight: 900; color: #d97706; font-family: monospace;">$${(summary.averageDaily || 0).toLocaleString('es-CO')}</div>
            <div style="font-size: 0.7rem; color: #92400e;">Burn Rate</div>
          </div>

          <div style="background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 0.72rem; color: #7c3aed; font-weight: 700; text-transform: uppercase;">Mayor Impacto</div>
            <div style="font-size: 0.95rem; font-weight: 800; color: #7c3aed; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${summary.topCategory ? summary.topCategory.category : 'N/A'}</div>
            <div style="font-size: 0.7rem; color: #6d28d9;">${summary.topCategory ? summary.topCategory.percentage : 0}% del total</div>
          </div>

          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="font-size: 0.72rem; color: #16a34a; font-weight: 700; text-transform: uppercase;">Ratio OPEX / Ventas</div>
            <div style="font-size: 1.2rem; font-weight: 900; color: #16a34a; font-family: monospace;">${(summary.opexToSalesRatio || 0).toFixed(1)}%</div>
            <div style="font-size: 0.7rem; color: #15803d;">Eficiencia Operativa</div>
          </div>
        </div>

        <!-- Category Breakdown Table -->
        <h4 style="font-size: 0.92rem; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 10px; font-weight: 800;">
          1. RESUMEN CONSOLIDADO POR CENTRO DE COSTOS / CATEGORÍA
        </h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left;">
              <th style="padding: 6px 8px;">Categoría</th>
              <th style="padding: 6px 8px; text-align: center;">Movimientos</th>
              <th style="padding: 6px 8px; text-align: right;">Participación</th>
              <th style="padding: 6px 8px; text-align: right;">Monto COP</th>
            </tr>
          </thead>
          <tbody>
            ${(summary.categoryBreakdown || []).map(c => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 6px 8px; font-weight: 600; color: #1e293b;">${c.icon || '🏷️'} ${c.category}</td>
                <td style="padding: 6px 8px; text-align: center; color: #64748b;">${c.count}</td>
                <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: ${c.color || '#334155'};">${c.percentage}%</td>
                <td style="padding: 6px 8px; text-align: right; font-weight: 800; font-family: monospace; color: #dc2626;">$${c.amount.toLocaleString('es-CO')}</td>
              </tr>
            `).join('')}
            <tr style="border-top: 2px solid #0f172a; font-weight: 800; background: #f8fafc;">
              <td style="padding: 8px;" colspan="2">TOTAL CONSOLIDADO:</td>
              <td style="padding: 8px; text-align: right;">100%</td>
              <td style="padding: 8px; text-align: right; color: #dc2626; font-size: 0.95rem; font-family: monospace;">$${(summary.totalExpenses || 0).toLocaleString('es-CO')}</td>
            </tr>
          </tbody>
        </table>

        <!-- Detailed Records Table -->
        <h4 style="font-size: 0.92rem; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 10px; font-weight: 800;">
          2. DETALLE DE MOVIMIENTOS Y COMPROBANTES (${expenses.length} REGISTROS)
        </h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-bottom: 30px;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left;">
              <th style="padding: 6px 6px;">Fecha</th>
              <th style="padding: 6px 6px;">Concepto</th>
              <th style="padding: 6px 6px;">Categoría</th>
              <th style="padding: 6px 6px;">Beneficiario</th>
              <th style="padding: 6px 6px;">Medio / Cuenta</th>
              <th style="padding: 6px 6px;">Comprobante</th>
              <th style="padding: 6px 6px; text-align: right;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${expenses.map(e => `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 5px 6px; font-family: monospace; color: #64748b;">${e.date ? e.date.split('T')[0] : ''}</td>
                <td style="padding: 5px 6px; font-weight: 600; color: #0f172a;">${e.concept}</td>
                <td style="padding: 5px 6px; color: #475569;">${e.category}</td>
                <td style="padding: 5px 6px; color: #334155;">${e.beneficiary || e.thirdParty || '-'}</td>
                <td style="padding: 5px 6px; color: #64748b;">${e.method || e.paymentMethod || 'Efectivo'}</td>
                <td style="padding: 5px 6px; font-family: monospace; color: #64748b;">${e.reference || '-'}</td>
                <td style="padding: 5px 6px; text-align: right; font-weight: 700; font-family: monospace; color: #dc2626;">$${(Number(e.amount) || 0).toLocaleString('es-CO')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Signatures -->
        <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; text-align: center;">
          <div>
            <div style="border-bottom: 1px solid #94a3b8; height: 38px; margin-bottom: 8px;"></div>
            <strong style="font-size: 0.82rem; color: #0f172a; display: block;">GERENCIA GENERAL</strong>
            <span style="font-size: 0.72rem; color: #64748b;">Representante Legal</span>
          </div>
          <div>
            <div style="border-bottom: 1px solid #94a3b8; height: 38px; margin-bottom: 8px;"></div>
            <strong style="font-size: 0.82rem; color: #0f172a; display: block;">CONTADOR PÚBLICO</strong>
            <span style="font-size: 0.72rem; color: #64748b;">T.P. No. 248911-T</span>
          </div>
          <div>
            <div style="border-bottom: 1px solid #94a3b8; height: 38px; margin-bottom: 8px;"></div>
            <strong style="font-size: 0.82rem; color: #0f172a; display: block;">AUDITOR DE BÓVEDA</strong>
            <span style="font-size: 0.72rem; color: #64748b;">Custodia de Valores & Caja</span>
          </div>
        </div>

      </div>
    `;

    const modal = document.getElementById('modal-print-gastos');
    if (modal) modal.classList.add('active');
    if (window.soundEngine) window.soundEngine.playChime();
  },

  exportGastosCSV() {
    if (!this.hasPermission('gastos-operativos', 'canExport')) {
      alert('Acceso denegado: No tienes permisos para exportar datos en CSV.');
      return;
    }
    if (!this.gastosData) {
      alert('Por favor espera a que se carguen los gastos antes de exportar.');
      return;
    }

    const { summary, expenses } = this.gastosData;
    const nowStr = new Date().toISOString().split('T')[0];

    const lines = [];
    lines.push('NEXUS JOYAS MAYORISTAS S.A.S - REPORTE DE GASTOS OPERATIVOS (OPEX)');
    lines.push(`Fecha de Exportacion: ${nowStr}`);
    lines.push(`Periodo: ${this.gastosPeriod}`);
    lines.push(`Total Gastos COP: $${summary.totalExpenses || 0}`);
    lines.push(`Equivalente Gramos Oro Puro 24K: ${summary.totalGrams24kEquivalent || 0} g`);
    lines.push(`Gasto Promedio Diario: $${summary.averageDaily || 0}`);
    lines.push(`Ratio OPEX / Ventas: ${summary.opexToSalesRatio || 0}%`);
    lines.push('');
    lines.push('FECHA;HORA;ID;COMPROBANTE;CATEGORIA;CONCEPTO;BENEFICIARIO/PROVEEDOR;MEDIO DE PAGO;MONTO COP;NOTAS');

    expenses.forEach(e => {
      const dateParts = (e.date || '').split('T');
      const d = dateParts[0] || '';
      const t = dateParts[1] ? dateParts[1].substring(0, 8) : '';
      const concept = (e.concept || '').replace(/;/g, ',');
      const ben = (e.beneficiary || e.thirdParty || '').replace(/;/g, ',');
      const notes = (e.notes || '').replace(/;/g, ',');
      const ref = (e.reference || '').replace(/;/g, ',');
      const cat = (e.category || '').replace(/;/g, ',');
      const method = (e.method || e.paymentMethod || '').replace(/;/g, ',');
      const amt = Number(e.amount) || 0;

      lines.push(`${d};${t};${e.id};${ref};${cat};${concept};${ben};${method};${amt};${notes}`);
    });

    lines.push('');
    lines.push('--- CONSOLIDADO POR CATEGORIA ---;;;;;;;;;');
    lines.push('CATEGORIA;CANTIDAD;PORCENTAJE;TOTAL COP;;;;;');
    (summary.categoryBreakdown || []).forEach(c => {
      lines.push(`${c.category};${c.count};${c.percentage}%;${c.amount};;;;;`);
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `Gastos_Operativos_Nexus_${nowStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // =========================================================
  // MÓDULO DE AUTENTICACIÓN, SESIÓN & CONTROL DE ACCESO (RBAC)
  // =========================================================

  async initAuthSession() {
    try {
      const savedToken = localStorage.getItem('nexus_token') || sessionStorage.getItem('nexus_token');
      if (savedToken) {
        this.authToken = savedToken;
        const res = await fetch('/api/auth/me', {
          headers: {
            'Authorization': 'Bearer ' + savedToken,
            'x-auth-token': savedToken
          }
        }).then(r => r.json());

        if (res.success && res.user) {
          this.currentUser = res.user;
          this.currentPermissions = res.permissions || {};
          this.rolesCatalog = res.roles || {};
          this.updateHeaderUserProfile();
          this.applyRolePermissions();
          this.hideLoginScreen();
          return;
        }
      }
    } catch (err) {
      console.warn('Sesión no encontrada o error al validar:', err);
    }

    // If not authenticated or expired:
    this.currentUser = null;
    this.authToken = null;
    this.currentPermissions = {};
    this.showLoginScreen();
  },

  showLoginScreen() {
    const screen = document.getElementById('login-screen');
    if (screen) {
      screen.classList.remove('hidden');
      screen.style.display = 'flex';
    }
    const badge = document.getElementById('user-profile-badge');
    if (badge) badge.style.display = 'none';
  },

  hideLoginScreen() {
    const screen = document.getElementById('login-screen');
    if (screen) {
      screen.classList.add('hidden');
      setTimeout(() => {
        if (screen.classList.contains('hidden')) {
          screen.style.display = 'none';
        }
      }, 300);
    }
  },

  updateHeaderUserProfile() {
    const badge = document.getElementById('user-profile-badge');
    const avatarEl = document.getElementById('header-user-avatar');
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');

    if (!badge || !this.currentUser) return;

    badge.style.display = 'inline-flex';
    if (avatarEl) {
      const initials = (this.currentUser.name || 'US')
        .split(' ')
        .map(w => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();
      avatarEl.innerText = initials || 'NX';
      if (this.currentUser.roleColor) {
        avatarEl.style.border = `2px solid ${this.currentUser.roleColor}`;
      }
    }
    if (nameEl) nameEl.innerText = this.currentUser.name || this.currentUser.username;
    if (roleEl) {
      roleEl.innerText = this.currentUser.roleBadge || this.currentUser.roleName || this.currentUser.role;
      if (this.currentUser.roleColor) {
        roleEl.style.color = this.currentUser.roleColor;
      }
    }
  },

  async handleLoginSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();

    const userInput = document.getElementById('login-username');
    const passInput = document.getElementById('login-password');
    const alertEl = document.getElementById('login-alert');
    const btnSubmit = document.getElementById('btn-login-submit');
    const spinner = document.getElementById('login-btn-spinner');
    const btnText = document.getElementById('login-btn-text');

    if (!userInput || !passInput) return;

    const username = userInput.value.trim();
    const password = passInput.value;

    if (!username || !password) {
      this.showLoginAlert('Por favor completa todos los campos requeridos.', 'danger');
      return;
    }

    if (btnSubmit) btnSubmit.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.innerText = 'Verificando Credenciales...';
    if (alertEl) alertEl.style.display = 'none';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }).then(r => r.json());

      if (res.success && res.token) {
        this.authToken = res.token;
        this.currentUser = res.user;
        this.currentPermissions = res.permissions || {};
        this.rolesCatalog = res.roles || {};

        const remember = document.getElementById('login-remember')?.checked;
        if (remember) {
          localStorage.setItem('nexus_token', res.token);
          localStorage.setItem('nexus_user', JSON.stringify(res.user));
        } else {
          sessionStorage.setItem('nexus_token', res.token);
          localStorage.removeItem('nexus_token');
        }

        this.showLoginAlert(`¡Acceso Concedido! Bienvenido, ${res.user.name}`, 'success');
        if (window.soundEngine) window.soundEngine.playChime();

        setTimeout(() => {
          this.updateHeaderUserProfile();
          this.applyRolePermissions();
          this.hideLoginScreen();
          passInput.value = '';

          // Navigate to permitted view if currently restricted
          if (!this.hasPermission(this.currentView, 'canView')) {
            const firstPermitted = Object.keys(this.currentPermissions).find(k => this.hasPermission(k, 'canView')) || 'dashboard';
            this.switchView(firstPermitted);
          } else {
            this.switchView(this.currentView || 'dashboard');
          }
        }, 400);

      } else {
        this.showLoginAlert(res.message || 'Credenciales inválidas.', 'danger');
        if (window.soundEngine) window.soundEngine.playWarning();
      }
    } catch (err) {
      console.error('Error de autenticación:', err);
      this.showLoginAlert('Error de conexión con el servidor de autenticación.', 'danger');
    } finally {
      if (btnSubmit) btnSubmit.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (btnText) btnText.innerText = '🔐 Entrar a la Plataforma';
    }
  },

  showLoginAlert(msg, type = 'danger') {
    const alertEl = document.getElementById('login-alert');
    if (!alertEl) return;
    alertEl.className = `login-alert alert-${type}`;
    alertEl.innerText = msg;
    alertEl.style.display = 'block';
  },

  fillLoginCredentials(user, pass) {
    const u = document.getElementById('login-username');
    const p = document.getElementById('login-password');
    if (u) u.value = user;
    if (p) p.value = pass;
    this.handleLoginSubmit(new Event('submit'));
  },

  togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) icon.innerText = '🙈';
    } else {
      input.type = 'password';
      if (icon) icon.innerText = '👁️';
    }
  },

  async logout() {
    if (!confirm('¿Deseas cerrar tu sesión segura en Nexus por Mayor?')) return;

    try {
      if (this.authToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.authToken
          },
          body: JSON.stringify({ token: this.authToken })
        });
      }
    } catch (e) {}

    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_user');
    sessionStorage.removeItem('nexus_token');
    this.authToken = null;
    this.currentUser = null;
    this.currentPermissions = {};

    const passInput = document.getElementById('login-password');
    if (passInput) passInput.value = '';
    const alertEl = document.getElementById('login-alert');
    if (alertEl) alertEl.style.display = 'none';

    this.showLoginScreen();
    if (window.soundEngine) window.soundEngine.playChime();
  },

  hasPermission(moduleKey, action = 'canView') {
    if (!this.currentUser) return false;
    if (this.currentUser.role === 'superadmin') return true;
    if (!this.currentPermissions || !this.currentPermissions[moduleKey]) return false;
    return !!this.currentPermissions[moduleKey][action];
  },

  applyRolePermissions() {
    if (!this.currentUser) return;

    // Filter sidebar navigation buttons
    const navItems = document.querySelectorAll('.nav-menu .nav-item');
    let firstAllowedView = null;

    navItems.forEach(item => {
      const btn = item.querySelector('button');
      if (!btn) return;
      const vKey = btn.getAttribute('data-view');
      if (!vKey) return;

      const allowed = this.hasPermission(vKey, 'canView');
      if (allowed) {
        item.style.display = '';
        if (!firstAllowedView) firstAllowedView = vKey;
      } else {
        item.style.display = 'none';
      }
    });

    // Special check for active view
    if (this.currentView && !this.hasPermission(this.currentView, 'canView')) {
      this.switchView(firstAllowedView || 'dashboard');
    }

    // Disable or hide elements that require canEdit / canDelete
    const isSuperAdmin = this.currentUser.role === 'superadmin';
    const canEditUsers = this.hasPermission('usuarios', 'canEdit');
    const btnNewUser = document.getElementById('btn-open-new-user');
    if (btnNewUser) {
      btnNewUser.style.display = canEditUsers ? '' : 'none';
    }

    // Gastos Operativos permissions enforcement
    const canEditGastos = this.hasPermission('gastos-operativos', 'canEdit');
    const canExportGastos = this.hasPermission('gastos-operativos', 'canExport');
    const btnNewGasto = document.getElementById('btn-open-new-gasto');
    const btnExportCSV = document.getElementById('btn-export-gastos-csv');
    const btnPrintReport = document.getElementById('btn-print-gastos-report');
    if (btnNewGasto) btnNewGasto.style.display = canEditGastos ? '' : 'none';
    if (btnExportCSV) btnExportCSV.style.display = canExportGastos ? '' : 'none';
    if (btnPrintReport) btnPrintReport.style.display = canExportGastos ? '' : 'none';

    // Permissions matrix tab visibility in Usuarios view
    const tabMatriz = document.getElementById('tab-btn-permissions');
    if (tabMatriz) tabMatriz.style.display = (canEditUsers || isSuperAdmin) ? '' : 'none';
  },

  async loadUsersAndRoles() {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch('/api/users').then(r => r.json()),
        fetch('/api/roles').then(r => r.json())
      ]);

      if (usersRes.success) {
        this.usersList = usersRes.users || [];
      }
      if (rolesRes.success) {
        this.rolesCatalog = rolesRes.roles || {};
        this.modulesCatalog = rolesRes.modules || [];
      }

      this.renderUsersView();
    } catch (err) {
      console.error('Error cargando usuarios y roles:', err);
    }
  },

  renderUsersView() {
    if (this.usersActiveTab === 'matriz') {
      this.renderPermissionsMatrix();
    } else {
      this.renderUsersDirectory();
    }
  },

  switchUsersTab(tab) {
    this.usersActiveTab = tab;
    const tabDir = document.getElementById('users-tab-directorio');
    const tabMat = document.getElementById('users-tab-matriz');
    const btnDir = document.getElementById('tab-btn-users');
    const btnMat = document.getElementById('tab-btn-permissions');

    if (tab === 'matriz') {
      if (tabDir) tabDir.style.display = 'none';
      if (tabMat) tabMat.style.display = 'block';
      if (btnDir) btnDir.classList.remove('active');
      if (btnMat) btnMat.classList.add('active');
      this.initMatrixRoleSelector();
      this.renderPermissionsMatrix();
    } else {
      if (tabDir) tabDir.style.display = 'block';
      if (tabMat) tabMat.style.display = 'none';
      if (btnDir) btnDir.classList.add('active');
      if (btnMat) btnMat.classList.remove('active');
      this.renderUsersDirectory();
    }
  },

  renderUsersDirectory() {
    const users = this.usersList || [];
    const countTab = document.getElementById('users-count-tab');
    if (countTab) countTab.innerText = users.length;

    // Update KPIs
    const kpiTotal = document.getElementById('kpi-users-total');
    const kpiActive = document.getElementById('kpi-users-active');
    const kpiRoles = document.getElementById('kpi-users-roles');
    if (kpiTotal) kpiTotal.innerText = users.length;
    if (kpiActive) kpiActive.innerText = users.filter(u => u.status === 'activo').length;
    if (kpiRoles) kpiRoles.innerText = `${Object.keys(this.rolesCatalog || {}).length || 6} Roles`;

    // Filter list
    let filtered = users.filter(u => {
      if (this.usersFilterRole !== 'all' && u.role !== this.usersFilterRole) return false;
      if (this.usersFilterStatus !== 'all' && u.status !== this.usersFilterStatus) return false;
      if (this.usersSearchQuery) {
        const q = this.usersSearchQuery.toLowerCase();
        const matchName = (u.name || '').toLowerCase().includes(q);
        const matchUser = (u.username || '').toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchRole = (u.role || '').toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchEmail && !matchRole) return false;
      }
      return true;
    });

    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 36px 20px; color: var(--text-dim);">
            <div style="font-size: 2rem; margin-bottom: 8px;">👤</div>
            <strong>No se encontraron usuarios con los filtros seleccionados</strong>
            <div style="font-size: 0.8rem; margin-top: 4px;">Modifica el término de búsqueda o añade un nuevo colaborador.</div>
          </td>
        </tr>
      `;
      return;
    }

    const isCurrentSuper = this.currentUser && this.currentUser.role === 'superadmin';
    const canEditUsers = this.hasPermission('usuarios', 'canEdit');
    const canDeleteUsers = this.hasPermission('usuarios', 'canDelete');

    tbody.innerHTML = filtered.map(u => {
      const roleObj = (this.rolesCatalog && this.rolesCatalog[u.role]) || {
        name: u.role,
        badge: u.role,
        color: '#94a3b8'
      };

      const isSuper = u.role === 'superadmin' || u.username === 'superadmin';
      const isActive = u.status === 'activo';
      const statusHtml = isActive
        ? `<span class="status-dot-active">🟢 Activo</span>`
        : `<span class="status-dot-inactive">🔴 Inactivo</span>`;

      let lastLoginText = 'Sin ingresos';
      if (u.lastLogin) {
        try {
          const d = new Date(u.lastLogin);
          lastLoginText = d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
          lastLoginText = u.lastLogin;
        }
      }

      const initials = (u.name || 'US')
        .split(' ')
        .map(w => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

      return `
        <tr style="${!isActive ? 'opacity: 0.65;' : ''}">
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.06); border: 2px solid ${roleObj.color || 'var(--gold-primary)'}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.82rem; color: ${roleObj.color || 'var(--gold-light)'}; flex-shrink: 0;">
                ${initials}
              </div>
              <div>
                <strong style="color: var(--text-headings); font-size: 0.9rem; display: block;">${u.name}</strong>
                <span class="mono" style="font-size: 0.76rem; color: var(--gold-light);">@${u.username}</span>
              </div>
            </div>
          </td>
          <td>
            <span class="role-pill-badge" style="color: ${roleObj.color || 'var(--gold-light)'}; background: ${roleObj.color ? roleObj.color + '15' : 'rgba(212,175,55,0.1)'};">
              ${roleObj.badge || roleObj.name}
            </span>
          </td>
          <td>
            <div style="font-size: 0.82rem; color: var(--text-muted);">
              <div>${u.email || '<span style="color: var(--text-dim);">Sin correo</span>'}</div>
              <div class="mono" style="font-size: 0.76rem; color: var(--text-dim); margin-top: 2px;">${u.phone || ''}</div>
            </div>
          </td>
          <td>
            ${statusHtml}
          </td>
          <td>
            <span style="font-size: 0.78rem; color: var(--text-dim);">${lastLoginText}</span>
          </td>
          <td class="text-center" style="white-space: nowrap; padding: 12px 14px;">
            <div style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="App.editUser('${u.id}')" title="Editar datos del usuario" style="padding: 5px 10px; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px;" ${!canEditUsers ? 'disabled' : ''}>
                <span>✏️</span> Editar
              </button>
              <button type="button" class="btn btn-outline-gold btn-sm" onclick="App.openChangePasswordModal('${u.id}')" title="Cambiar contraseña de acceso" style="padding: 5px 10px; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px;" ${!canEditUsers ? 'disabled' : ''}>
                <span>🔑</span> Clave
              </button>
              ${isSuper ? `
                <span class="user-master-badge" title="Super Administrador Principal - Acceso Master Protegido">
                  <span>👑</span> Master
                </span>
              ` : `
                <button type="button" class="btn ${isActive ? 'btn-outline-danger' : 'btn-outline-gold'} btn-sm" onclick="App.toggleUserStatus('${u.id}')" title="${isActive ? 'Desactivar acceso al sistema' : 'Reactivar acceso al sistema'}" style="padding: 5px 10px; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px;" ${!canEditUsers ? 'disabled' : ''}>
                  <span>${isActive ? '⏸️' : '▶️'}</span> ${isActive ? 'Desactivar' : 'Activar'}
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick="App.deleteUser('${u.id}')" title="Eliminar usuario definitivamente" style="padding: 5px 10px; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px;" ${!canDeleteUsers ? 'disabled' : ''}>
                  <span>🗑️</span> Borrar
                </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  onUsersSearch(q) {
    this.usersSearchQuery = q || '';
    this.renderUsersDirectory();
  },

  filterUsers() {
    const roleSel = document.getElementById('users-filter-role');
    const statSel = document.getElementById('users-filter-status');
    if (roleSel) this.usersFilterRole = roleSel.value;
    if (statSel) this.usersFilterStatus = statSel.value;
    this.renderUsersDirectory();
  },

  openNewUserModal() {
    this.resetUserForm();
    const modalTitle = document.getElementById('user-modal-title');
    if (modalTitle) modalTitle.innerText = 'Registrar Nuevo Usuario';

    const roleSel = document.getElementById('user-input-role');
    if (roleSel) {
      const superOpt = roleSel.querySelector('option[value="superadmin"]');
      if (superOpt) superOpt.disabled = true;
      if (roleSel.value === 'superadmin') roleSel.value = 'comercial';
    }

    const passInput = document.getElementById('user-input-password');
    if (passInput) {
      passInput.required = true;
      passInput.placeholder = 'Mínimo 4 caracteres';
    }
    const passHint = document.getElementById('user-password-hint');
    if (passHint) passHint.style.display = 'none';

    this.openModal('modal-user-form');
  },

  resetUserForm() {
    const form = document.getElementById('form-user');
    if (form) form.reset();
    const idEl = document.getElementById('user-input-id');
    if (idEl) idEl.value = '';
    const statusEl = document.getElementById('user-input-status');
    if (statusEl) statusEl.value = 'activo';
    const roleEl = document.getElementById('user-input-role');
    if (roleEl) roleEl.value = 'comercial';
  },

  editUser(userId) {
    const user = (this.usersList || []).find(u => u.id === userId);
    if (!user) return;

    this.resetUserForm();
    const modalTitle = document.getElementById('user-modal-title');
    if (modalTitle) modalTitle.innerText = `Editar Usuario: ${user.name}`;

    const idEl = document.getElementById('user-input-id');
    const nameEl = document.getElementById('user-input-name');
    const userEl = document.getElementById('user-input-username');
    const emailEl = document.getElementById('user-input-email');
    const phoneEl = document.getElementById('user-input-phone');
    const roleEl = document.getElementById('user-input-role');
    const statusEl = document.getElementById('user-input-status');
    const passInput = document.getElementById('user-input-password');
    const passHint = document.getElementById('user-password-hint');

    if (idEl) idEl.value = user.id;
    if (nameEl) nameEl.value = user.name || '';
    if (userEl) {
      userEl.value = user.username || '';
      userEl.disabled = (user.role === 'superadmin'); // Protect superadmin username
    }
    if (emailEl) emailEl.value = user.email || '';
    if (phoneEl) phoneEl.value = user.phone || '';
    if (roleEl) {
      roleEl.value = user.role || 'comercial';
      roleEl.disabled = (user.role === 'superadmin'); // Protect superadmin role
    }
    if (statusEl) {
      statusEl.value = user.status || 'activo';
      statusEl.disabled = (user.role === 'superadmin'); // Protect superadmin status
    }
    if (passInput) {
      passInput.value = '';
      passInput.required = false;
      passInput.placeholder = 'Dejar en blanco para conservar clave actual';
    }
    if (passHint) passHint.style.display = 'block';

    this.openModal('modal-user-form');
  },

  onUserModalRoleChange(roleVal) {
    // Optional helper
  },

  async submitUserForm(event) {
    if (event && event.preventDefault) event.preventDefault();

    const id = document.getElementById('user-input-id')?.value;
    const name = document.getElementById('user-input-name')?.value?.trim();
    const username = document.getElementById('user-input-username')?.value?.trim();
    const email = document.getElementById('user-input-email')?.value?.trim();
    const phone = document.getElementById('user-input-phone')?.value?.trim();
    const role = document.getElementById('user-input-role')?.value;
    const status = document.getElementById('user-input-status')?.value || 'activo';
    const password = document.getElementById('user-input-password')?.value;

    if (!name || !username) {
      alert('Nombre y Usuario son obligatorios.');
      return;
    }

    if (!id && (!password || password.length < 4)) {
      alert('La contraseña para un usuario nuevo debe tener mínimo 4 caracteres.');
      return;
    }

    const payload = { name, username, email, phone, role, status };
    if (password && password.trim().length >= 4) {
      payload.password = password.trim();
    }

    const btnSubmit = document.getElementById('btn-submit-user');
    if (btnSubmit) btnSubmit.disabled = true;

    try {
      let res;
      if (id) {
        res = await fetch(`/api/users/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.authToken
          },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      } else {
        res = await fetch('/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.authToken
          },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      }

      if (res.success) {
        alert(res.message || 'Usuario guardado exitosamente.');
        this.closeAllModals();
        await this.loadUsersAndRoles();
        if (window.soundEngine) window.soundEngine.playChime();
      } else {
        alert('Error: ' + (res.message || 'No se pudo guardar el usuario.'));
      }
    } catch (err) {
      console.error('Error guardando usuario:', err);
      alert('Error de conexión al procesar la solicitud.');
    } finally {
      if (btnSubmit) btnSubmit.disabled = false;
    }
  },

  async toggleUserStatus(userId) {
    const user = (this.usersList || []).find(u => u.id === userId);
    if (!user) return;

    if (user.role === 'superadmin') {
      alert('No puedes desactivar al Super Administrador Principal.');
      return;
    }

    const nextStatus = user.status === 'activo' ? 'inactivo' : 'activo';
    const confirmMsg = nextStatus === 'inactivo'
      ? `¿Bloquear acceso a ${user.name}? No podrá ingresar al sistema hasta que sea reactivado.`
      : `¿Reactivar acceso a ${user.name}?`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.authToken
        },
        body: JSON.stringify({ status: nextStatus })
      }).then(r => r.json());

      if (res.success) {
        await this.loadUsersAndRoles();
        if (window.soundEngine) window.soundEngine.playChime();
      } else {
        alert('Error: ' + res.message);
      }
    } catch (err) {
      console.error('Error cambiando estado:', err);
    }
  },

  async deleteUser(userId) {
    const user = (this.usersList || []).find(u => u.id === userId);
    if (!user) return;

    if (user.role === 'superadmin') {
      alert('Acción bloqueada: No se puede eliminar al Super Administrador.');
      return;
    }

    if (!confirm(`⚠️ ¿ELIMINAR DEFINITIVAMENTE al usuario "${user.name}" (@${user.username})?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + this.authToken
        }
      }).then(r => r.json());

      if (res.success) {
        alert(res.message);
        await this.loadUsersAndRoles();
        if (window.soundEngine) window.soundEngine.playChime();
      } else {
        alert('Error: ' + res.message);
      }
    } catch (err) {
      console.error('Error eliminando usuario:', err);
    }
  },

  openChangePasswordModal(userId) {
    const user = (this.usersList || []).find(u => u.id === userId);
    if (!user) return;

    const idEl = document.getElementById('change-pass-user-id');
    const labelEl = document.getElementById('change-pass-user-label');
    const newPass = document.getElementById('change-pass-new');
    const confPass = document.getElementById('change-pass-confirm');

    if (idEl) idEl.value = user.id;
    if (labelEl) labelEl.innerText = `Colaborador: ${user.name} (@${user.username})`;
    if (newPass) newPass.value = '';
    if (confPass) confPass.value = '';

    this.openModal('modal-change-password');
  },

  async submitChangePassword(event) {
    if (event && event.preventDefault) event.preventDefault();

    const id = document.getElementById('change-pass-user-id')?.value;
    const newPass = document.getElementById('change-pass-new')?.value;
    const confPass = document.getElementById('change-pass-confirm')?.value;

    if (!id || !newPass) return;

    if (newPass.length < 4) {
      alert('La nueva contraseña debe tener al menos 4 caracteres.');
      return;
    }

    if (newPass !== confPass) {
      alert('Las contraseñas no coinciden. Por favor verifícalas.');
      return;
    }

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.authToken
        },
        body: JSON.stringify({ password: newPass })
      }).then(r => r.json());

      if (res.success) {
        alert('Contraseña actualizada con éxito.');
        this.closeAllModals();
        if (window.soundEngine) window.soundEngine.playChime();
      } else {
        alert('Error: ' + res.message);
      }
    } catch (err) {
      console.error('Error cambiando contraseña:', err);
    }
  },

  // =========================================================
  // MATRIZ GRANULAR DE PERMISOS POR ROL
  // =========================================================

  initMatrixRoleSelector() {
    const selector = document.getElementById('matrix-role-selector');
    if (!selector || !this.rolesCatalog) return;

    const currentSelected = this.selectedMatrixRole || 'admin';
    selector.innerHTML = Object.keys(this.rolesCatalog).map(rKey => {
      const r = this.rolesCatalog[rKey];
      return `<option value="${rKey}" ${rKey === currentSelected ? 'selected' : ''}>${r.badge || r.name}</option>`;
    }).join('');

    this.selectRoleForMatrix(currentSelected);
  },

  selectRoleForMatrix(roleKey) {
    this.selectedMatrixRole = roleKey;
    const role = (this.rolesCatalog && this.rolesCatalog[roleKey]) || {};

    const titleEl = document.getElementById('matrix-active-role-title');
    const descEl = document.getElementById('matrix-active-role-desc');
    const quickBar = document.getElementById('matrix-quick-buttons');
    const saveBtn = document.getElementById('btn-save-role-permissions');

    if (titleEl) {
      titleEl.innerText = role.name || roleKey;
      if (role.color) titleEl.style.color = role.color;
    }
    if (descEl) descEl.innerText = role.description || '';

    // Clone working copy of permissions
    this.matrixDirtyPermissions = JSON.parse(JSON.stringify(role.permissions || {}));

    const isProtected = roleKey === 'superadmin' || role.isProtected;
    if (quickBar) quickBar.style.display = isProtected ? 'none' : 'flex';
    if (saveBtn) {
      saveBtn.disabled = isProtected;
      saveBtn.innerText = isProtected
        ? '🔒 Permisos Maestros Inmutables'
        : '💾 Guardar Cambios de Permisos';
    }

    this.renderPermissionsMatrix();
  },

  renderPermissionsMatrix() {
    const tbody = document.getElementById('permissions-matrix-tbody');
    if (!tbody) return;

    const modules = this.modulesCatalog || [];
    const roleKey = this.selectedMatrixRole || 'admin';
    const isProtected = roleKey === 'superadmin';
    const perms = this.matrixDirtyPermissions || {};

    tbody.innerHTML = modules.map(m => {
      const p = perms[m.id] || { canView: false, canEdit: false, canDelete: false, canExport: false };

      return `
        <tr style="transition: background 0.15s ease;">
          <td style="padding: 12px 16px;">
            <div style="display: flex; align-items: flex-start; gap: 10px;">
              <span style="font-size: 1.3rem; line-height: 1.2;">${m.icon || '📦'}</span>
              <div>
                <strong style="color: var(--text-headings); font-size: 0.9rem; display: block;">${m.name}</strong>
                <span style="font-size: 0.74rem; color: var(--text-dim); display: block; line-height: 1.3; margin-top: 2px;">${m.desc || ''}</span>
              </div>
            </div>
          </td>

          <!-- canView -->
          <td style="text-align: center;">
            <div class="matrix-checkbox-wrap">
              <input type="checkbox" class="matrix-checkbox" ${p.canView ? 'checked' : ''} ${isProtected ? 'disabled' : ''} onchange="App.onMatrixCheckboxChange('${m.id}', 'canView', this.checked)">
            </div>
          </td>

          <!-- canEdit -->
          <td style="text-align: center;">
            <div class="matrix-checkbox-wrap">
              <input type="checkbox" class="matrix-checkbox" ${p.canEdit ? 'checked' : ''} ${isProtected || !p.canView ? 'disabled' : ''} onchange="App.onMatrixCheckboxChange('${m.id}', 'canEdit', this.checked)">
            </div>
          </td>

          <!-- canDelete -->
          <td style="text-align: center;">
            <div class="matrix-checkbox-wrap">
              <input type="checkbox" class="matrix-checkbox" ${p.canDelete ? 'checked' : ''} ${isProtected || !p.canView ? 'disabled' : ''} onchange="App.onMatrixCheckboxChange('${m.id}', 'canDelete', this.checked)">
            </div>
          </td>

          <!-- canExport -->
          <td style="text-align: center;">
            <div class="matrix-checkbox-wrap">
              <input type="checkbox" class="matrix-checkbox" ${p.canExport ? 'checked' : ''} ${isProtected || !p.canView ? 'disabled' : ''} onchange="App.onMatrixCheckboxChange('${m.id}', 'canExport', this.checked)">
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  onMatrixCheckboxChange(moduleId, permKey, isChecked) {
    if (this.selectedMatrixRole === 'superadmin') return;

    if (!this.matrixDirtyPermissions[moduleId]) {
      this.matrixDirtyPermissions[moduleId] = { canView: false, canEdit: false, canDelete: false, canExport: false };
    }

    this.matrixDirtyPermissions[moduleId][permKey] = isChecked;

    // Dependency rule: if canView is turned off, turn off all sub-actions
    if (permKey === 'canView' && !isChecked) {
      this.matrixDirtyPermissions[moduleId].canEdit = false;
      this.matrixDirtyPermissions[moduleId].canDelete = false;
      this.matrixDirtyPermissions[moduleId].canExport = false;
    }

    // If sub-action turned on, automatically turn on canView
    if (permKey !== 'canView' && isChecked) {
      this.matrixDirtyPermissions[moduleId].canView = true;
    }

    this.renderPermissionsMatrix();
  },

  toggleAllMatrixColumn(permKey, state) {
    if (this.selectedMatrixRole === 'superadmin') return;
    const modules = this.modulesCatalog || [];

    modules.forEach(m => {
      if (!this.matrixDirtyPermissions[m.id]) {
        this.matrixDirtyPermissions[m.id] = { canView: false, canEdit: false, canDelete: false, canExport: false };
      }
      this.matrixDirtyPermissions[m.id][permKey] = state;
      if (permKey !== 'canView' && state) {
        this.matrixDirtyPermissions[m.id].canView = true;
      }
    });

    this.renderPermissionsMatrix();
  },

  clearAllMatrixRole() {
    if (this.selectedMatrixRole === 'superadmin') return;
    const modules = this.modulesCatalog || [];

    modules.forEach(m => {
      this.matrixDirtyPermissions[m.id] = { canView: false, canEdit: false, canDelete: false, canExport: false };
    });

    this.renderPermissionsMatrix();
  },

  async resetCurrentRolePermissionsToDefault() {
    const roleKey = this.selectedMatrixRole;
    if (roleKey === 'superadmin') {
      alert('El Super Administrador siempre cuenta con los permisos máximos por diseño de bóveda.');
      return;
    }

    if (!confirm(`¿Restablecer los permisos del rol "${roleKey}" a la configuración predeterminada del sistema?`)) {
      return;
    }

    try {
      const res = await fetch('/api/roles').then(r => r.json());
      if (res.success && res.roles && res.roles[roleKey]) {
        this.matrixDirtyPermissions = JSON.parse(JSON.stringify(res.roles[roleKey].permissions || {}));
        this.renderPermissionsMatrix();
        alert('Permisos restaurados en pantalla. Haz clic en "Guardar Cambios" para confirmar.');
      }
    } catch (e) {
      console.error(e);
    }
  },

  async saveRolePermissions() {
    const roleKey = this.selectedMatrixRole;
    if (roleKey === 'superadmin') {
      alert('Los permisos del Super Administrador son maestros e inmutables.');
      return;
    }

    const saveBtn = document.getElementById('btn-save-role-permissions');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = '⏳ Guardando Permisos...';
    }

    try {
      const updatedRoles = JSON.parse(JSON.stringify(this.rolesCatalog || {}));
      if (!updatedRoles[roleKey]) updatedRoles[roleKey] = {};
      updatedRoles[roleKey].permissions = this.matrixDirtyPermissions;

      const res = await fetch('/api/roles', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.authToken
        },
        body: JSON.stringify({ roles: updatedRoles })
      }).then(r => r.json());

      if (res.success) {
        this.rolesCatalog = res.roles;
        alert(`¡Permisos para el rol "${updatedRoles[roleKey].name || roleKey}" guardados con éxito!`);
        if (window.soundEngine) window.soundEngine.playChime();

        // If updated role belongs to current user, update permissions immediately in session!
        if (this.currentUser && this.currentUser.role === roleKey) {
          this.currentPermissions = this.matrixDirtyPermissions;
          this.applyRolePermissions();
        }

        this.selectRoleForMatrix(roleKey);
      } else {
        alert('Error: ' + res.message);
      }
    } catch (err) {
      console.error('Error guardando permisos:', err);
      alert('Error de conexión al guardar los permisos.');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = '💾 Guardar Cambios de Permisos';
      }
    }
  }
};

window.App = App;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
} else {
  App.init();
}
