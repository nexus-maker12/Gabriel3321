require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { connectDB, isMongoConnected, models } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3500;
const isVercel = Boolean(process.env.VERCEL);
const ORIGINAL_DB_PATH = path.join(__dirname, 'data', 'database.json');
const DB_PATH = isVercel
  ? path.join('/tmp', 'database.json')
  : ORIGINAL_DB_PATH;

if (isVercel) {
  try {
    if (!fs.existsSync(DB_PATH) && fs.existsSync(ORIGINAL_DB_PATH)) {
      fs.copyFileSync(ORIGINAL_DB_PATH, DB_PATH);
    }
  } catch (err) {
    console.warn('Vercel DB copy warning:', err.message);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB Atlas (if MONGODB_URI is provided in .env, otherwise fallback to local JSON)
connectDB();

// Helper to read database
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { rates: {}, puro24k: { stockGrams: 0, purchases: [], deliveries: [] }, items: [], clients: [], suppliers: [], orders: [], payments: [] };
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database:', err);
    return { rates: {}, puro24k: { stockGrams: 0, purchases: [], deliveries: [] }, items: [], clients: [], suppliers: [], orders: [], payments: [] };
  }
}

// Helper to write database (writes to JSON and asynchronously syncs with Atlas if connected)
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    
    // Asynchronous background sync to Atlas if connected
    if (isMongoConnected()) {
      syncStateToMongo(data).catch(err => console.warn('Atlas Sync Warning:', err.message));
    }
    return true;
  } catch (err) {
    console.error('Error writing database:', err);
    return false;
  }
}

let isSyncing = false;
let pendingSync = null;

async function syncArrayCollection(Model, list) {
  if (!Array.isArray(list)) return;
  const currentIds = list.map(x => x.id).filter(Boolean);
  if (list.length > 0) {
    const ops = list.map(item => ({
      replaceOne: {
        filter: { id: item.id },
        replacement: item,
        upsert: true
      }
    }));
    await Model.bulkWrite(ops);
  }
  if (currentIds.length > 0) {
    await Model.deleteMany({ id: { $nin: currentIds } });
  } else {
    await Model.deleteMany({});
  }
}

async function syncStateToMongo(db) {
  if (!isMongoConnected()) return;

  if (isSyncing) {
    pendingSync = db;
    return;
  }

  isSyncing = true;
  try {
    const tasks = [];
    if (db.rates) tasks.push(models.Rates.findOneAndUpdate({}, db.rates, { upsert: true }));
    if (db.puro24k) tasks.push(models.Puro24k.findOneAndUpdate({}, db.puro24k, { upsert: true }));
    if (db.items) tasks.push(syncArrayCollection(models.Item, db.items));
    if (db.clients) tasks.push(syncArrayCollection(models.Client, db.clients));
    if (db.suppliers) tasks.push(syncArrayCollection(models.Supplier, db.suppliers));
    if (db.orders) tasks.push(syncArrayCollection(models.Order, db.orders));
    if (db.payments) tasks.push(syncArrayCollection(models.Payment, db.payments));
    if (db.categories) tasks.push(syncArrayCollection(models.Category, db.categories));
    if (db.paymentMethods) tasks.push(syncArrayCollection(models.PaymentMethod, db.paymentMethods));
    if (db.cashMovements) tasks.push(syncArrayCollection(models.CashMovement, db.cashMovements));
    if (db.users) tasks.push(syncArrayCollection(models.User, db.users));
    if (db.roles) {
      const rolesArr = Array.isArray(db.roles) ? db.roles : Object.values(db.roles);
      tasks.push(syncArrayCollection(models.Role, rolesArr));
    }

    await Promise.all(tasks);
  } catch (err) {
    console.warn('⚠️ [Atlas Sync Warning]:', err.message);
  } finally {
    isSyncing = false;
    if (pendingSync) {
      const nextDb = pendingSync;
      pendingSync = null;
      syncStateToMongo(nextDb).catch(e => console.warn(e.message));
    }
  }
}

// Calculation Helpers for Weighted Averages
function calculateAverages(db) {
  const items = db.items || [];
  const puroPurchases = (db.puro24k && db.puro24k.purchases) || [];

  // 1. Promedio Costo Puro 24K (Ponderado de compras o fijado manualmente)
  let totalPuroGrams = 0;
  let totalPuroCost = 0;
  puroPurchases.forEach(p => {
    const g = Number(p.grams) || 0;
    const c = Number(p.costPerGram) || 0;
    totalPuroGrams += g;
    totalPuroCost += (g * c);
  });
  const promedioPuro24k = (db.rates && db.rates.override_promedioPuro24k !== undefined && db.rates.override_promedioPuro24k !== null)
    ? Number(db.rates.override_promedioPuro24k)
    : (totalPuroGrams > 0
        ? Math.round(totalPuroCost / totalPuroGrams)
        : Number(db.rates?.oro24k_fino_benchmark ?? 0));

  // 2. Promedio Nacional 18K (Ponderado en bóveda o fijado manualmente)
  const nationalItems = items.filter(i => i.category === 'nacional');
  let totalNatGrams = 0;
  let totalNatCost = 0;
  nationalItems.forEach(i => {
    const g = Number(i.weightGrams) || 0;
    const c = Number(i.costPerGram) || 0;
    totalNatGrams += g;
    totalNatCost += (g * c);
  });
  const promedioNacional = (db.rates && db.rates.override_promedioNacional !== undefined && db.rates.override_promedioNacional !== null)
    ? Number(db.rates.override_promedioNacional)
    : (totalNatGrams > 0
        ? Math.round(totalNatCost / totalNatGrams)
        : Number(db.rates?.oro18k_nacional_base ?? 0));

  // 3. Promedio Italiano 18K (Ponderado en bóveda o fijado manualmente)
  const italianItems = items.filter(i => i.category === 'italiano');
  let totalItGrams = 0;
  let totalItCost = 0;
  italianItems.forEach(i => {
    const g = Number(i.weightGrams) || 0;
    const c = Number(i.costPerGram) || 0;
    totalItGrams += g;
    totalItCost += (g * c);
  });
  const promedioItaliano = (db.rates && db.rates.override_promedioItaliano !== undefined && db.rates.override_promedioItaliano !== null)
    ? Number(db.rates.override_promedioItaliano)
    : (totalItGrams > 0
        ? Math.round(totalItCost / totalItGrams)
        : Number(db.rates?.oro18k_italiano_base ?? 0));

  // 4. Total Vault 18k Grams (All categories in vault: nacional, italiano, turco, etc.)
  let totalVaultGrams = 0;
  let totalVaultCost = 0;
  items.forEach(i => {
    const g = Number(i.weightGrams) || 0;
    const c = Number(i.costPerGram) || 0;
    totalVaultGrams += g;
    totalVaultCost += (g * c);
  });

  return {
    promedioPuro24k,
    promedioNacional,
    promedioItaliano,
    totalNatGrams: Number(totalNatGrams.toFixed(2)),
    totalItGrams: Number(totalItGrams.toFixed(2)),
    totalVault18kGrams: Number(totalVaultGrams.toFixed(2)),
    totalVault18kCost: totalVaultCost
  };
}

// === API ROUTES ===

// 1. Executive Stats & Averages
app.get('/api/stats', (req, res) => {
  const db = readDB();
  const items = db.items || [];
  const clients = db.clients || [];
  const suppliers = db.suppliers || [];
  const orders = db.orders || [];
  const puro24k = db.puro24k || { stockGrams: 0, purchases: [], deliveries: [] };

  const averages = calculateAverages(db);

  const totalCxCPesos = clients.reduce((acc, c) => acc + (Number(c.currentDebtPesos) || 0), 0);
  const totalCxCGrams = clients.reduce((acc, c) => acc + (Number(c.currentDebtGrams) || 0), 0);

  const totalCxPPesos = suppliers.reduce((acc, s) => acc + (Number(s.balanceDuePesos) || 0), 0);
  const totalCxPGrams = suppliers.reduce((acc, s) => acc + (Number(s.balanceDueGrams) || 0), 0);
  const totalManoDeObraDue = suppliers.reduce((acc, s) => acc + (Number(s.balanceManoDeObra) || 0), 0);
  const totalPuroInHandsTalleres = suppliers.reduce((acc, s) => acc + (Number(s.puroInHandsGrams) || 0), 0);

  const totalDispatchedGrams = orders.reduce((acc, o) => acc + (Number(o.totalGrams) || 0), 0);
  const totalDispatchedPesos = orders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);

  res.json({
    success: true,
    stats: {
      averages: {
        promedioPuro24k: averages.promedioPuro24k,
        promedioItaliano: averages.promedioItaliano,
        promedioNacional: averages.promedioNacional
      },
      puro24k: {
        stockGrams: Number((puro24k.stockGrams || 0).toFixed(2)),
        inTalleresGrams: Number(totalPuroInHandsTalleres.toFixed(2)),
        totalValueAtCost: Math.round((puro24k.stockGrams || 0) * averages.promedioPuro24k)
      },
      vault18k: {
        totalGrams: averages.totalVault18kGrams,
        italianGrams: averages.totalItGrams,
        nationalGrams: averages.totalNatGrams,
        totalItemsCount: items.length,
        totalCost: averages.totalVault18kCost
      },
      cxc: {
        totalPesos: totalCxCPesos,
        totalGrams: Number(totalCxCGrams.toFixed(2)),
        clientsWithDebt: clients.filter(c => (Number(c.currentDebtPesos) || 0) > 0).length
      },
      cxp: {
        totalPesos: totalCxPPesos,
        totalGrams: Number(totalCxPGrams.toFixed(2)),
        totalManoDeObra: totalManoDeObraDue,
        suppliersCount: suppliers.length
      },
      sales: {
        totalOrders: orders.length,
        totalGramsDispatched: Number(totalDispatchedGrams.toFixed(2)),
        totalPesosDispatched: totalDispatchedPesos
      },
      rates: db.rates || {}
    }
  });
});

// 2. Gold Rates
app.get('/api/rates', (req, res) => {
  const db = readDB();
  const averages = calculateAverages(db);
  res.json({
    success: true,
    rates: {
      ...db.rates,
      promedioPuro24k: averages.promedioPuro24k,
      promedioItaliano: averages.promedioItaliano,
      promedioNacional: averages.promedioNacional
    }
  });
});

app.post('/api/rates', (req, res) => {
  const db = readDB();
  db.rates = db.rates || {};
  const { promedioPuro24k, promedioNacional, promedioItaliano, retal_oro18k_compra, resetOverrides } = req.body;

  if (resetOverrides) {
    delete db.rates.override_promedioPuro24k;
    delete db.rates.override_promedioNacional;
    delete db.rates.override_promedioItaliano;
  } else {
    if (promedioPuro24k !== undefined && promedioPuro24k !== '') {
      const val = Number(promedioPuro24k);
      if (!isNaN(val) && val >= 0) {
        db.rates.override_promedioPuro24k = val;
        db.rates.oro24k_fino_benchmark = val;
      }
    }
    if (promedioNacional !== undefined && promedioNacional !== '') {
      const val = Number(promedioNacional);
      if (!isNaN(val) && val >= 0) {
        db.rates.override_promedioNacional = val;
        db.rates.oro18k_nacional_base = val;
      }
    }
    if (promedioItaliano !== undefined && promedioItaliano !== '') {
      const val = Number(promedioItaliano);
      if (!isNaN(val) && val >= 0) {
        db.rates.override_promedioItaliano = val;
        db.rates.oro18k_italiano_base = val;
      }
    }
  }

  if (retal_oro18k_compra !== undefined && retal_oro18k_compra !== '') {
    const val = Number(retal_oro18k_compra);
    if (!isNaN(val) && val >= 0) db.rates.retal_oro18k_compra = val;
  }

  db.rates.last_updated = new Date().toISOString();
  writeDB(db);

  const averages = calculateAverages(db);
  res.json({
    success: true,
    rates: {
      ...db.rates,
      promedioPuro24k: averages.promedioPuro24k,
      promedioItaliano: averages.promedioItaliano,
      promedioNacional: averages.promedioNacional
    },
    message: 'Tasas actualizadas exitosamente.'
  });
});

// 3. Puro 24K Ledger & Maquila (Entregas y Recepciones con Talleres)
app.get('/api/puro', (req, res) => {
  const db = readDB();
  const averages = calculateAverages(db);
  res.json({
    success: true,
    puro: db.puro24k || { stockGrams: 0, purchases: [], deliveries: [] },
    averageCost: averages.promedioPuro24k
  });
});

// Registrar Compra de Puro 24K (Granalla/Lingotes)
app.post('/api/puro/purchase', (req, res) => {
  const db = readDB();
  if (!db.puro24k) db.puro24k = { stockGrams: 0, purchases: [], deliveries: [] };

  const grams = Number(req.body.grams) || 0;
  const costPerGram = Number(req.body.costPerGram) || 0;
  const supplierId = req.body.supplierId || '';
  const supplier = db.suppliers.find(s => s.id === supplierId);
  const supplierName = supplier ? supplier.name : (req.body.supplierName || 'Proveedor de Oro Fino');

  if (grams <= 0 || costPerGram <= 0) {
    return res.status(400).json({ success: false, message: 'Gramaje y costo por gramo deben ser mayores a cero.' });
  }

  const purchase = {
    id: 'pur-comp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    date: new Date().toISOString(),
    supplierId,
    supplierName,
    grams,
    costPerGram,
    totalCost: Math.round(grams * costPerGram),
    invoiceRef: req.body.invoiceRef || 'S/N',
    notes: req.body.notes || 'Compra de granalla 24k pura'
  };

  db.puro24k.stockGrams = Number(((Number(db.puro24k.stockGrams) || 0) + grams).toFixed(2));
  db.puro24k.purchases.unshift(purchase);

  writeDB(db);
  const averages = calculateAverages(db);
  res.status(201).json({ success: true, purchase, newPuroStock: db.puro24k.stockGrams, newAverageCost: averages.promedioPuro24k });
});

// Registrar Entrega de Puro 24K a Taller / Proveedor
app.post('/api/puro/deliver', (req, res) => {
  const db = readDB();
  if (!db.puro24k) db.puro24k = { stockGrams: 0, purchases: [], deliveries: [] };

  const grams24k = Number(req.body.grams24k) || 0;
  const supplierId = req.body.supplierId;
  const supplier = db.suppliers.find(s => s.id === supplierId);

  if (!supplier) {
    return res.status(404).json({ success: false, message: 'Proveedor / Taller no encontrado.' });
  }
  if (grams24k <= 0) {
    return res.status(400).json({ success: false, message: 'Los gramos de 24K a entregar deben ser mayores a cero.' });
  }
  if (grams24k > (Number(db.puro24k.stockGrams) || 0)) {
    return res.status(400).json({ success: false, message: `Stock insuficiente de Puro 24K en bóveda (${db.puro24k.stockGrams}g disponible).` });
  }

  const averages = calculateAverages(db);

  // Deduct 24k from vault stock
  db.puro24k.stockGrams = Number(((Number(db.puro24k.stockGrams) || 0) - grams24k).toFixed(2));

  // Add to supplier's held 24k gold
  supplier.puroInHandsGrams = Number(((Number(supplier.puroInHandsGrams) || 0) + grams24k).toFixed(2));

  const deliveryRecord = {
    id: 'deliv-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    type: 'entrega_puro',
    date: new Date().toISOString(),
    supplierId: supplier.id,
    supplierName: supplier.name,
    grams24k,
    costAtDelivery: averages.promedioPuro24k,
    notes: req.body.notes || 'Entrega de oro puro 24K para fundición y maquila'
  };

  db.puro24k.deliveries.unshift(deliveryRecord);
  writeDB(db);

  res.status(201).json({ success: true, delivery: deliveryRecord, supplier });
});

// Registrar Recepción de Joyería Terminada de Taller (Cobra Mano de Obra)
app.post('/api/puro/receive', (req, res) => {
  const db = readDB();
  const {
    supplierId,
    grams24kUsed,
    grams18kReceived,
    category, // 'nacional' | 'italiano'
    subcategory,
    name,
    code,
    origin,
    manoDeObraRate, // $/g
    notes
  } = req.body;

  const supplier = db.suppliers.find(s => s.id === supplierId);
  if (!supplier) return res.status(404).json({ success: false, message: 'Proveedor / Taller no encontrado' });

  const g18k = Number(grams18kReceived) || 0;
  const g24kUsed = Number(grams24kUsed) || 0;
  const moRate = Number(manoDeObraRate) || (Number(supplier.manoDeObraPerGram) || 22000);

  if (g18k <= 0) {
    return res.status(400).json({ success: false, message: 'Debe ingresar el peso en gramos recibido de joyería.' });
  }

  // Deduct from supplier held 24k gold if specified
  if (g24kUsed > 0) {
    supplier.puroInHandsGrams = Math.max(0, Number(((Number(supplier.puroInHandsGrams) || 0) - g24kUsed).toFixed(2)));
  }

  // Calculate Mano de Obra
  const totalManoDeObra = Math.round(g18k * moRate);
  supplier.balanceManoDeObra = (Number(supplier.balanceManoDeObra) || 0) + totalManoDeObra;
  supplier.balanceDuePesos = (Number(supplier.balanceDuePesos) || 0) + totalManoDeObra;

  // Calculate actual cost per gram of the received 18K piece:
  // Metal cost in 18k = (Grams 24K * Average Cost 24K) / Grams 18K + Mano de obra
  const averages = calculateAverages(db);
  const metalCostPerGram18k = g24kUsed > 0 
    ? Math.round((g24kUsed * averages.promedioPuro24k) / g18k)
    : Math.round(averages.promedioPuro24k * 0.75); // Ley 750 benchmark

  const finalCostPerGram18k = metalCostPerGram18k + moRate;

  // Create or add to inventory lot
  const itemCode = code || `LOTE-${category === 'italiano' ? 'IT' : 'NC'}-${Math.floor(100 + Math.random() * 900)}`;
  const itemName = name || `Lote ${category === 'italiano' ? 'Oro Italiano' : 'Oro Nacional'} (${g18k}g)`;

  const newItem = {
    id: 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    code: itemCode,
    name: itemName,
    category: category || 'nacional',
    subcategory: subcategory || 'Cadenas',
    purity: '18K (750)',
    origin: origin || (supplier.city || 'Taller Nacional'),
    weightGrams: g18k,
    costPerGram: finalCostPerGram18k,
    description: `Recibido de ${supplier.name}. Mano de obra: $${moRate.toLocaleString('es-CO')}/g. Metal 24K utilizado: ${g24kUsed}g.`,
    status: 'activo',
    dateAdded: new Date().toISOString().split('T')[0]
  };

  db.items.unshift(newItem);

  const deliveryRecord = {
    id: 'deliv-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    type: 'recepcion_prenda',
    date: new Date().toISOString(),
    supplierId: supplier.id,
    supplierName: supplier.name,
    grams24kUsed: g24kUsed,
    grams18kReceived: g18k,
    category: category || 'nacional',
    manoDeObraRate: moRate,
    manoDeObraTotal: totalManoDeObra,
    itemCreatedId: newItem.id,
    notes: notes || `Recibido lote terminado de ${g18k}g`
  };

  if (!db.puro24k) db.puro24k = { stockGrams: 0, purchases: [], deliveries: [] };
  db.puro24k.deliveries.unshift(deliveryRecord);

  writeDB(db);
  res.status(201).json({ success: true, item: newItem, delivery: deliveryRecord, supplier });
});

// 4. Items (Prendas y Lotes por gramo - SIN conteo de piezas y SIN precio fijo de venta)
app.get('/api/items', (req, res) => {
  const db = readDB();
  let list = db.items || [];
  const { category, search } = req.query;

  if (category && category !== 'all') {
    list = list.filter(i => i.category.toLowerCase() === category.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(i =>
      i.code.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q) ||
      (i.subcategory && i.subcategory.toLowerCase().includes(q)) ||
      (i.description && i.description.toLowerCase().includes(q))
    );
  }
  res.json({ success: true, items: list });
});

app.post('/api/items', (req, res) => {
  const db = readDB();
  const averages = calculateAverages(db);

  const category = req.body.category || 'italiano';
  const defaultCost = category === 'italiano' ? averages.promedioItaliano : averages.promedioNacional;

  const newItem = {
    id: 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    code: req.body.code || `PRE-${Math.floor(100 + Math.random() * 900)}`,
    name: req.body.name || 'Lote Joyería Mayorista',
    category: category,
    subcategory: req.body.subcategory || 'Cadenas',
    purity: '18K (750)',
    origin: req.body.origin || (category === 'italiano' ? 'Vicenza, Italia' : 'Medellín, Colombia'),
    weightGrams: Math.max(0, Number(req.body.weightGrams) || 0),
    costPerGram: Math.max(0, Number(req.body.costPerGram) || defaultCost),
    description: req.body.description || '',
    status: 'activo',
    dateAdded: new Date().toISOString().split('T')[0]
  };

  db.items.unshift(newItem);
  writeDB(db);
  res.status(201).json({ success: true, item: newItem });
});

app.put('/api/items/:id', (req, res) => {
  const db = readDB();
  const idx = db.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Prenda no encontrada' });
  }

  const it = db.items[idx];
  db.items[idx] = {
    ...it,
    ...req.body,
    id: it.id,
    weightGrams: isNaN(Number(req.body.weightGrams)) ? it.weightGrams : Math.max(0, Number(req.body.weightGrams)),
    costPerGram: isNaN(Number(req.body.costPerGram)) ? it.costPerGram : Math.max(0, Number(req.body.costPerGram))
  };

  // Clean out legacy keys if present
  delete db.items[idx].piecesCount;
  delete db.items[idx].pricePerGram;
  delete db.items[idx].minPricePerGram;

  writeDB(db);
  res.json({ success: true, item: db.items[idx] });
});

app.delete('/api/items/:id', (req, res) => {
  const db = readDB();
  db.items = db.items.filter(i => i.id !== req.params.id);
  writeDB(db);
  res.json({ success: true, message: 'Lote retirado de inventario' });
});

// Helper for category slug generation
function slugifyCategory(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

// 4.1 Categories (Categorías dinámicas de prendas/lotes)
app.get('/api/categories', (req, res) => {
  const db = readDB();
  if (!db.categories || !Array.isArray(db.categories) || db.categories.length === 0) {
    db.categories = [
      {
        id: "cat-italiano",
        name: "Oro Italiano 18K (750)",
        slug: "italiano",
        badgeText: "🇮🇹 Italiano 18K",
        badgeClass: "badge-italian",
        color: "#34d399",
        description: "Cadenas y prendas importadas de Italia Ley 750"
      },
      {
        id: "cat-nacional",
        name: "Oro Nacional 18K",
        slug: "nacional",
        badgeText: "🇨🇴 Nacional 18K",
        badgeClass: "badge-nacional",
        color: "#fbbf24",
        description: "Prendas vaciadas y manufacturadas en talleres colombianos"
      }
    ];
    writeDB(db);
  }
  res.json({ success: true, categories: db.categories });
});

app.post('/api/categories', (req, res) => {
  const db = readDB();
  db.categories = db.categories || [];

  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ success: false, message: 'El nombre de la categoría es obligatorio' });
  }

  let slug = req.body.slug ? slugifyCategory(req.body.slug) : slugifyCategory(name);
  if (!slug) slug = 'cat-' + Date.now();

  // Ensure unique slug
  let uniqueSlug = slug;
  let counter = 1;
  while (db.categories.some(c => c.slug === uniqueSlug)) {
    uniqueSlug = `${slug}-${counter++}`;
  }

  const newCat = {
    id: 'cat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    name: name,
    slug: uniqueSlug,
    badgeText: (req.body.badgeText || name).trim(),
    badgeClass: req.body.badgeClass || 'badge-custom',
    color: req.body.color || '#d4af37',
    description: (req.body.description || '').trim()
  };

  db.categories.push(newCat);
  writeDB(db);
  res.status(201).json({ success: true, category: newCat });
});

app.put('/api/categories/:id', (req, res) => {
  const db = readDB();
  db.categories = db.categories || [];
  const idx = db.categories.findIndex(c => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
  }

  const oldSlug = db.categories[idx].slug;
  const newName = (req.body.name || db.categories[idx].name).trim();
  let newSlug = req.body.slug ? slugifyCategory(req.body.slug) : db.categories[idx].slug;

  // If slug changed, update items using old slug
  if (newSlug !== oldSlug) {
    if (db.items && Array.isArray(db.items)) {
      db.items.forEach(it => {
        if (it.category === oldSlug) {
          it.category = newSlug;
        }
      });
    }
  }

  db.categories[idx] = {
    ...db.categories[idx],
    id: db.categories[idx].id,
    name: newName,
    slug: newSlug,
    badgeText: (req.body.badgeText || db.categories[idx].badgeText || newName).trim(),
    color: req.body.color || db.categories[idx].color || '#d4af37',
    description: req.body.description !== undefined ? req.body.description.trim() : db.categories[idx].description
  };

  writeDB(db);
  res.json({ success: true, category: db.categories[idx] });
});

app.delete('/api/categories/:id', (req, res) => {
  const db = readDB();
  db.categories = db.categories || [];
  const target = db.categories.find(c => c.id === req.params.id);
  if (!target) {
    return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
  }

  if (db.categories.length <= 1) {
    return res.status(400).json({ success: false, message: 'No puedes eliminar la única categoría existente.' });
  }

  const deletedSlug = target.slug;
  db.categories = db.categories.filter(c => c.id !== req.params.id);

  // If items exist with this category slug, reassign them to first remaining category
  const fallbackCat = db.categories[0].slug;
  let reassignedCount = 0;
  if (db.items && Array.isArray(db.items)) {
    db.items.forEach(it => {
      if (it.category === deletedSlug) {
        it.category = fallbackCat;
        reassignedCount++;
      }
    });
  }

  writeDB(db);
  res.json({ 
    success: true, 
    message: `Categoría "${target.name}" eliminada correctamente.${reassignedCount > 0 ? ` ${reassignedCount} lotes reasignados a "${fallbackCat}".` : ''}` 
  });
});

// 5. Clients & Cuentas por Cobrar (CxC)
app.get('/api/clients', (req, res) => {
  const db = readDB();
  res.json({ success: true, clients: db.clients || [] });
});

app.post('/api/clients', (req, res) => {
  const db = readDB();
  const newClient = {
    id: 'cli-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    name: req.body.name,
    tradeName: req.body.tradeName || req.body.name,
    documentType: req.body.documentType || 'NIT',
    documentNumber: req.body.documentNumber || '',
    phone: req.body.phone || '',
    city: req.body.city || '',
    creditLimitPesos: Number(req.body.creditLimitPesos) || 50000000,
    creditLimitGrams: Number(req.body.creditLimitGrams) || 150,
    currentDebtPesos: 0,
    currentDebtGrams: 0,
    riskLevel: req.body.riskLevel || 'A - Excelente',
    status: 'activo',
    lastPaymentDate: new Date().toISOString().split('T')[0]
  };

  db.clients.push(newClient);
  writeDB(db);
  res.status(201).json({ success: true, client: newClient });
});

app.put('/api/clients/:id', (req, res) => {
  const db = readDB();
  const idx = db.clients.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Joyería no encontrada' });

  const cl = db.clients[idx];
  db.clients[idx] = {
    ...cl,
    ...req.body,
    id: cl.id,
    creditLimitPesos: isNaN(Number(req.body.creditLimitPesos)) ? cl.creditLimitPesos : Math.max(0, Number(req.body.creditLimitPesos)),
    creditLimitGrams: isNaN(Number(req.body.creditLimitGrams)) ? cl.creditLimitGrams : Math.max(0, Number(req.body.creditLimitGrams)),
    currentDebtPesos: isNaN(Number(req.body.currentDebtPesos)) ? cl.currentDebtPesos : Math.max(0, Number(req.body.currentDebtPesos)),
    currentDebtGrams: isNaN(Number(req.body.currentDebtGrams)) ? cl.currentDebtGrams : Math.max(0, Number(req.body.currentDebtGrams))
  };
  writeDB(db);
  res.json({ success: true, client: db.clients[idx], message: 'Joyería actualizada correctamente' });
});

app.delete('/api/clients/:id', (req, res) => {
  const db = readDB();
  const client = db.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ success: false, message: 'Joyería no encontrada' });

  if ((Number(client.currentDebtPesos) || 0) > 0 || (Number(client.currentDebtGrams) || 0) > 0) {
    return res.status(400).json({
      success: false,
      message: `No se puede eliminar la joyería "${client.tradeName || client.name}" porque tiene una cartera pendiente de $${(Number(client.currentDebtPesos) || 0).toLocaleString('es-CO')} (${Number(client.currentDebtGrams) || 0}g 18K). Debe estar a paz y salvo.`
    });
  }

  db.clients = db.clients.filter(c => c.id !== req.params.id);
  writeDB(db);
  res.json({ success: true, message: `Joyería "${client.tradeName || client.name}" eliminada correctamente` });
});

// 6. Suppliers & Cuentas por Pagar (CxP con Mano de Obra y Oro Puro en poder)
app.get('/api/suppliers', (req, res) => {
  const db = readDB();
  res.json({ success: true, suppliers: db.suppliers || [] });
});

app.post('/api/suppliers', (req, res) => {
  const db = readDB();
  const newSupplier = {
    id: 'sup-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    name: req.body.name,
    contact: req.body.contact || '',
    category: req.body.category || 'Taller Nacional / Vaciado',
    phone: req.body.phone || '',
    city: req.body.city || '',
    manoDeObraPerGram: Number(req.body.manoDeObraPerGram) || 22000,
    puroInHandsGrams: 0,
    balanceManoDeObra: 0,
    balanceDuePesos: Number(req.body.balanceDuePesos) || 0,
    balanceDueGrams: Number(req.body.balanceDueGrams) || 0,
    status: 'activo'
  };

  db.suppliers.push(newSupplier);
  writeDB(db);
  res.status(201).json({ success: true, supplier: newSupplier });
});

app.put('/api/suppliers/:id', (req, res) => {
  const db = readDB();
  const idx = db.suppliers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });

  const sup = db.suppliers[idx];
  db.suppliers[idx] = {
    ...sup,
    ...req.body,
    id: sup.id,
    manoDeObraPerGram: isNaN(Number(req.body.manoDeObraPerGram)) ? sup.manoDeObraPerGram : Math.max(0, Number(req.body.manoDeObraPerGram)),
    balanceDuePesos: isNaN(Number(req.body.balanceDuePesos)) ? sup.balanceDuePesos : Math.max(0, Number(req.body.balanceDuePesos)),
    balanceDueGrams: isNaN(Number(req.body.balanceDueGrams)) ? sup.balanceDueGrams : Math.max(0, Number(req.body.balanceDueGrams)),
    puroInHandsGrams: isNaN(Number(req.body.puroInHandsGrams)) ? sup.puroInHandsGrams : Math.max(0, Number(req.body.puroInHandsGrams)),
    balanceManoDeObra: isNaN(Number(req.body.balanceManoDeObra)) ? sup.balanceManoDeObra : Math.max(0, Number(req.body.balanceManoDeObra))
  };
  writeDB(db);
  res.json({ success: true, supplier: db.suppliers[idx], message: 'Proveedor actualizado correctamente' });
});

app.delete('/api/suppliers/:id', (req, res) => {
  const db = readDB();
  const supplier = db.suppliers.find(s => s.id === req.params.id);
  if (!supplier) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });

  const owesMoney = (Number(supplier.balanceDuePesos) || 0) > 0 || (Number(supplier.balanceManoDeObra) || 0) > 0;
  const holdsGold = (Number(supplier.puroInHandsGrams) || 0) > 0;
  if (owesMoney || holdsGold) {
    return res.status(400).json({
      success: false,
      message: `No se puede eliminar el taller/proveedor "${supplier.name}" porque tiene saldos pendientes ($${(Number(supplier.balanceDuePesos) || 0).toLocaleString('es-CO')}) o tiene ${Number(supplier.puroInHandsGrams) || 0}g de oro puro en su poder.`
    });
  }

  db.suppliers = db.suppliers.filter(s => s.id !== req.params.id);
  writeDB(db);
  res.json({ success: true, message: `Proveedor / Taller "${supplier.name}" eliminado correctamente` });
});

// 7. Orders / Despacho Mayorista (Precio acordado negociado en caliente al vender)
app.get('/api/orders', (req, res) => {
  const db = readDB();
  res.json({ success: true, orders: db.orders || [] });
});

app.post('/api/orders', (req, res) => {
  const db = readDB();
  const { clientId, items, paymentType, paymentDetail, notes } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ success: false, message: 'El despacho debe contener al menos una pesada.' });
  }

  const client = db.clients.find(c => c.id === clientId);
  if (!client) {
    return res.status(400).json({ success: false, message: 'Cliente mayorista no válido.' });
  }

  let totalGrams = 0;
  let totalAmount = 0;
  let totalCostAmount = 0;

  const processedItems = items.map(line => {
    const dbItem = db.items.find(i => i.id === line.itemId);
    const weight = Number(line.weightGrams) || 0;
    const pricePerGram = Number(line.pricePerGram) || 0; // Negotiated live at sale!
    const costPerGram = dbItem ? Number(dbItem.costPerGram) || 0 : (Number(line.costPerGram) || 0);
    const subtotal = Math.round(weight * pricePerGram);
    const subtotalCost = Math.round(weight * costPerGram);

    totalGrams += weight;
    totalAmount += subtotal;
    totalCostAmount += subtotalCost;

    // Deduct weight from stock in vault
    if (dbItem) {
      dbItem.weightGrams = Math.max(0, Number((dbItem.weightGrams - weight).toFixed(2)));
    }

    return {
      itemId: line.itemId,
      code: line.code || (dbItem ? dbItem.code : 'GEN'),
      name: line.name || (dbItem ? dbItem.name : 'Joyería'),
      category: line.category || (dbItem ? dbItem.category : 'nacional'),
      weightGrams: weight,
      costPerGram: costPerGram,
      pricePerGram: pricePerGram,
      subtotal: subtotal,
      marginPerGram: pricePerGram - costPerGram
    };
  });

  const remisionNumber = `REM-2026-${String(db.orders.length + 101).padStart(3, '0')}`;
  const now = new Date().toISOString();

  const newOrder = {
    id: 'ord-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    remisionNumber,
    date: now,
    clientId,
    clientName: client.tradeName || client.name,
    items: processedItems,
    totalGrams: Number(totalGrams.toFixed(2)),
    totalCostAmount,
    totalAmount,
    grossMargin: totalAmount - totalCostAmount,
    paymentType: paymentType || 'Contado',
    paymentDetail: paymentDetail || {
      cash: totalAmount,
      transfer: 0,
      scrapGoldGrams: 0,
      scrapGoldRate: 0,
      scrapGoldAmount: 0,
      creditAmount: 0
    },
    status: paymentType === 'Credito' ? 'Pendiente' : (paymentDetail && paymentDetail.creditAmount > 0 ? 'Parcial' : 'Pagado'),
    notes: notes || 'Despacho generado desde Nexus por Mayor'
  };

  // Adjust client debt if Credit or Mixed
  let creditPesos = 0;
  if (paymentType === 'Credito') {
    creditPesos = totalAmount;
  } else if (paymentDetail && paymentDetail.creditAmount > 0) {
    creditPesos = paymentDetail.creditAmount;
  }

  if (creditPesos > 0) {
    client.currentDebtPesos = (Number(client.currentDebtPesos) || 0) + creditPesos;
    const averages = calculateAverages(db);
    const refRate = Number(averages.promedioNacional ?? 0);
    client.currentDebtGrams = refRate > 0 ? Number((client.currentDebtPesos / refRate).toFixed(2)) : 0;
  }

  // Scrap gold / retal payment transaction
  if (paymentDetail && paymentDetail.scrapGoldGrams > 0) {
    const scrapPay = {
      id: 'pay-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      type: 'abono_cxc',
      entityId: client.id,
      entityName: client.tradeName || client.name,
      date: now,
      amountPesos: paymentDetail.scrapGoldAmount,
      scrapGoldGrams: paymentDetail.scrapGoldGrams,
      scrapGoldRate: paymentDetail.scrapGoldRate,
      scrapGoldEquivalent: paymentDetail.scrapGoldAmount,
      paymentMethod: 'Retal de Oro 18K',
      reference: `RETAL-DESPACHO-${remisionNumber}`,
      notes: `Pago en retal: ${paymentDetail.scrapGoldGrams}g @ $${paymentDetail.scrapGoldRate.toLocaleString('es-CO')}/g en ${remisionNumber}`
    };
    db.payments.unshift(scrapPay);
  }

  db.orders.unshift(newOrder);
  writeDB(db);

  res.status(201).json({ success: true, order: newOrder, client });
});

// 8. Payments / Abonos (Cartera CxC y CxP)
app.get('/api/payments', (req, res) => {
  const db = readDB();
  res.json({ success: true, payments: db.payments || [] });
});

app.post('/api/payments', (req, res) => {
  const db = readDB();
  const {
    type,
    entityId,
    amountPesos,
    scrapGoldGrams,
    scrapGoldRate,
    paymentMethod,
    reference,
    notes
  } = req.body;

  const now = new Date().toISOString();
  let totalDeduction = Number(amountPesos) || 0;
  let scrapGrams = Number(scrapGoldGrams) || 0;
  let scrapRate = Number(scrapGoldRate) || (db.rates.retal_oro18k_compra || 255000);
  let scrapEquivalent = 0;

  if (scrapGrams > 0) {
    scrapEquivalent = Math.round(scrapGrams * scrapRate);
    totalDeduction += scrapEquivalent;
  }

  let entityName = '';

  if (type === 'abono_cxc') {
    const client = db.clients.find(c => c.id === entityId);
    if (!client) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });
    entityName = client.tradeName || client.name;

    client.currentDebtPesos = Math.max(0, (Number(client.currentDebtPesos) || 0) - totalDeduction);
    const averages = calculateAverages(db);
    const refRate = Number(averages.promedioNacional ?? 0);
    client.currentDebtGrams = refRate > 0 ? Number((client.currentDebtPesos / refRate).toFixed(2)) : 0;
    client.lastPaymentDate = now.split('T')[0];
  } else if (type === 'pago_cxp') {
    const supplier = db.suppliers.find(s => s.id === entityId);
    if (!supplier) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    entityName = supplier.name;

    supplier.balanceDuePesos = Math.max(0, (Number(supplier.balanceDuePesos) || 0) - totalDeduction);
    // Also discount from Mano de obra if applicable
    if (supplier.balanceManoDeObra > 0) {
      supplier.balanceManoDeObra = Math.max(0, supplier.balanceManoDeObra - totalDeduction);
    }
    const averages = calculateAverages(db);
    const refRate = Number(averages.promedioItaliano ?? 0);
    supplier.balanceDueGrams = refRate > 0 ? Number((supplier.balanceDuePesos / refRate).toFixed(2)) : 0;
  } else {
    return res.status(400).json({ success: false, message: 'Tipo de pago no soportado' });
  }

  const newPayment = {
    id: 'pay-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    type,
    entityId,
    entityName,
    date: now,
    amountPesos: Number(amountPesos) || 0,
    scrapGoldGrams: scrapGrams,
    scrapGoldRate: scrapRate,
    scrapGoldEquivalent: scrapEquivalent,
    totalCredited: totalDeduction,
    paymentMethod: paymentMethod || 'Efectivo',
    reference: reference || 'ABN-' + Date.now().toString().slice(-6),
    notes: notes || ''
  };

  db.payments.unshift(newPayment);
  writeDB(db);

  res.status(201).json({ success: true, payment: newPayment });
});

// 9. Payment Methods Management (Transferencia, Efectivo, Crédito, Retal de Oro, etc.)
const DEFAULT_PAYMENT_METHODS = [
  {
    id: 'pm-bancolombia-cte',
    name: 'Bancolombia Cuenta Corriente',
    type: 'Transferencia',
    bank: 'Bancolombia',
    accountType: 'Corriente',
    accountNumber: '458-99214-01',
    accountHolder: 'Nexus Joyas Mayoristas S.A.S',
    documentId: 'NIT 901.884.221-9',
    creditDays: 0,
    surchargePercent: 0,
    instructions: 'Enviar soporte con el número de remisión al WhatsApp de tesorería (+57 300 900 8899). Verificación en línea.',
    status: 'activo',
    isDefault: true
  },
  {
    id: 'pm-davivienda-aho',
    name: 'Davivienda Cuenta de Ahorros',
    type: 'Transferencia',
    bank: 'Davivienda',
    accountType: 'Ahorros',
    accountNumber: '0089-7741-2309',
    accountHolder: 'Nexus Joyas Mayoristas S.A.S',
    documentId: 'NIT 901.884.221-9',
    creditDays: 0,
    surchargePercent: 0,
    instructions: 'Transferencias interbancarias ACH o directas. Se valida antes del despacho del lote de joyería.',
    status: 'activo',
    isDefault: false
  },
  {
    id: 'pm-efectivo-caja-boveda',
    name: 'Efectivo en Caja Bóveda Principal (COP)',
    type: 'Efectivo',
    bank: 'Caja Central',
    accountType: 'Efectivo Físico',
    accountNumber: 'CAJA-01',
    accountHolder: 'Caja Fuerte - Sede Central Mayorista',
    documentId: '',
    creditDays: 0,
    surchargePercent: 0,
    instructions: 'Pago físico en efectivo moneda legal colombiana al momento de pesar y retirar en mostrador blindado.',
    status: 'activo',
    isDefault: false
  },
  {
    id: 'pm-credito-15d',
    name: 'Crédito Mayorista (Plazo 15 Días)',
    type: 'Credito',
    bank: 'Cartera Directa',
    accountType: 'Plazo Crédito',
    accountNumber: 'PLAZO-15D',
    accountHolder: 'Cartera Mayorista Nexus',
    documentId: '',
    creditDays: 15,
    surchargePercent: 0,
    instructions: 'Aplica para joyerías con cupo de crédito aprobado en su perfil. Vencimiento estricto a 15 días calendario.',
    status: 'activo',
    isDefault: false
  },
  {
    id: 'pm-credito-30d',
    name: 'Crédito Mayorista (Plazo 30 Días)',
    type: 'Credito',
    bank: 'Cartera Directa',
    accountType: 'Plazo Extendido',
    accountNumber: 'PLAZO-30D',
    accountHolder: 'Cartera Preferencial Calificación A',
    documentId: '',
    creditDays: 30,
    surchargePercent: 2,
    instructions: 'Línea de crédito para joyerías calificación A. Recargo financiero acordado del 2% mensual.',
    status: 'activo',
    isDefault: false
  },
  {
    id: 'pm-retal-oro18k',
    name: 'Retal de Oro 18K (Pago en Metal Físico)',
    type: 'Retal Oro',
    bank: 'Metal Físico',
    accountType: 'Oro Ley 750',
    accountNumber: 'ORO-18K-RET',
    accountHolder: 'Bóveda de Recibo & Fundición',
    documentId: '',
    creditDays: 0,
    surchargePercent: 0,
    instructions: 'Se recibe oro chatarra Ley 750 ensayado y pesado en balanza digital. Se liquida a la tasa oficial de retal del día.',
    status: 'activo',
    isDefault: false
  }
];

function ensurePaymentMethods(db) {
  if (!db.paymentMethods || !Array.isArray(db.paymentMethods) || db.paymentMethods.length === 0) {
    db.paymentMethods = [...DEFAULT_PAYMENT_METHODS];
    writeDB(db);
  }
  return db.paymentMethods;
}

app.get('/api/payment-methods', (req, res) => {
  const db = readDB();
  const paymentMethods = ensurePaymentMethods(db);
  res.json({ success: true, paymentMethods });
});

app.post('/api/payment-methods', (req, res) => {
  const db = readDB();
  ensurePaymentMethods(db);

  const {
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
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'El nombre del método de pago es obligatorio.' });
  }

  const newMethod = {
    id: 'pm-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    name: name.trim(),
    type: type || 'Transferencia',
    bank: bank || '',
    accountType: accountType || '',
    accountNumber: accountNumber || '',
    accountHolder: accountHolder || '',
    documentId: documentId || '',
    creditDays: Number(creditDays) || 0,
    surchargePercent: Number(surchargePercent) || 0,
    instructions: instructions || '',
    status: status || 'activo',
    isDefault: Boolean(isDefault)
  };

  if (newMethod.isDefault) {
    db.paymentMethods.forEach(m => {
      if (m.type === newMethod.type) m.isDefault = false;
    });
  }

  db.paymentMethods.push(newMethod);
  writeDB(db);

  res.status(201).json({ success: true, paymentMethod: newMethod, message: 'Método de pago registrado exitosamente.' });
});

app.put('/api/payment-methods/:id', (req, res) => {
  const db = readDB();
  ensurePaymentMethods(db);

  const idx = db.paymentMethods.findIndex(m => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Método de pago no encontrado.' });
  }

  const existing = db.paymentMethods[idx];
  const isDefault = req.body.isDefault !== undefined ? Boolean(req.body.isDefault) : existing.isDefault;

  if (isDefault) {
    db.paymentMethods.forEach(m => {
      if (m.id !== req.params.id && m.type === (req.body.type || existing.type)) {
        m.isDefault = false;
      }
    });
  }

  db.paymentMethods[idx] = {
    ...existing,
    ...req.body,
    id: existing.id,
    creditDays: req.body.creditDays !== undefined ? Number(req.body.creditDays) : existing.creditDays,
    surchargePercent: req.body.surchargePercent !== undefined ? Number(req.body.surchargePercent) : existing.surchargePercent,
    isDefault
  };

  writeDB(db);
  res.json({ success: true, paymentMethod: db.paymentMethods[idx], message: 'Método de pago actualizado exitosamente.' });
});

app.patch('/api/payment-methods/:id/toggle', (req, res) => {
  const db = readDB();
  ensurePaymentMethods(db);

  const method = db.paymentMethods.find(m => m.id === req.params.id);
  if (!method) {
    return res.status(404).json({ success: false, message: 'Método de pago no encontrado.' });
  }

  method.status = method.status === 'activo' ? 'inactivo' : 'activo';
  writeDB(db);

  res.json({ success: true, paymentMethod: method, message: `Método ${method.name} marcado como ${method.status}.` });
});

app.delete('/api/payment-methods/:id', (req, res) => {
  const db = readDB();
  ensurePaymentMethods(db);

  const method = db.paymentMethods.find(m => m.id === req.params.id);
  if (!method) {
    return res.status(404).json({ success: false, message: 'Método de pago no encontrado.' });
  }

  const baseMethods = ['pm-bancolombia-cte', 'pm-davivienda-aho', 'pm-efectivo-caja-boveda', 'pm-credito-15d', 'pm-credito-30d', 'pm-retal-oro18k'];
  if (baseMethods.includes(method.id)) {
    return res.status(400).json({ success: false, message: 'No se puede eliminar un método de pago fundamental del sistema. Puedes desactivarlo usando el botón de estado.' });
  }

  db.paymentMethods = db.paymentMethods.filter(m => m.id !== req.params.id);
  writeDB(db);

  res.json({ success: true, message: `Método de pago "${method.name}" eliminado correctamente.` });
});

// 10. Cuadre de Caja & Arqueo de Flujo de Fondos (Entradas, Salidas, Proveedores y Créditos)
function compileCashLedger(db) {
  const ledger = [];

  // Inflows from wholesale orders (Despachos)
  (db.orders || []).forEach(order => {
    const detail = order.paymentDetail || {};
    const clientName = order.clientName || 'Cliente Mayorista';

    // Cash portion
    if (detail.cash && Number(detail.cash) > 0) {
      ledger.push({
        id: `ord-cash-${order.id}`,
        sourceId: order.id,
        date: order.date,
        type: 'ingreso',
        category: 'Venta Despacho (Efectivo)',
        entityType: 'cliente',
        entityName: clientName,
        method: 'Efectivo en Caja Bóveda Principal (COP)',
        reference: order.remisionNumber || 'REM',
        description: `Cobro en efectivo por despacho mayorista ${order.remisionNumber || ''} (${order.totalGrams}g oro)`,
        amount: Number(detail.cash),
        scrapGrams: 0
      });
    }

    // Transfer portion
    if (detail.transfer && Number(detail.transfer) > 0) {
      ledger.push({
        id: `ord-transf-${order.id}`,
        sourceId: order.id,
        date: order.date,
        type: 'ingreso',
        category: 'Venta Despacho (Transferencia)',
        entityType: 'cliente',
        entityName: clientName,
        method: 'Bancolombia Cuenta Corriente',
        reference: order.remisionNumber || 'REM',
        description: `Transferencia bancaria recibida por despacho ${order.remisionNumber || ''} (${order.totalGrams}g oro)`,
        amount: Number(detail.transfer),
        scrapGrams: 0
      });
    }

    // Scrap gold / retal portion
    if (detail.scrapGoldAmount && Number(detail.scrapGoldAmount) > 0) {
      ledger.push({
        id: `ord-scrap-${order.id}`,
        sourceId: order.id,
        date: order.date,
        type: 'ingreso',
        category: 'Venta Despacho (Retal 18K)',
        entityType: 'cliente',
        entityName: clientName,
        method: 'Retal de Oro 18K (Pago en Metal Físico)',
        reference: order.remisionNumber || 'REM',
        description: `Pago en retal de oro 18K recibido: ${detail.scrapGoldGrams || 0}g @ $${(detail.scrapGoldRate || 0).toLocaleString('es-CO')}/g en ${order.remisionNumber || ''}`,
        amount: Number(detail.scrapGoldAmount),
        scrapGrams: Number(detail.scrapGoldGrams) || 0
      });
    }

    // Credit granted (for tracking pending credits)
    if (detail.creditAmount && Number(detail.creditAmount) > 0) {
      ledger.push({
        id: `ord-cred-${order.id}`,
        sourceId: order.id,
        date: order.date,
        type: 'credito_otorgado',
        category: 'Crédito Mayorista Otorgado',
        entityType: 'cliente',
        entityName: clientName,
        method: 'Crédito Mayorista',
        reference: order.remisionNumber || 'REM',
        description: `Despacho a crédito de ${order.totalGrams}g oro. Saldo cargado a cartera CxC.`,
        amount: Number(detail.creditAmount),
        scrapGrams: 0
      });
    }
  });

  // Payments (Abonos CxC and Pagos CxP)
  (db.payments || []).forEach(pay => {
    // If this payment was auto-generated from a dispatch retal transaction,
    // it is already accounted for in the order's retal portion in ledger to prevent double counting.
    if (pay.reference && pay.reference.startsWith('RETAL-DESPACHO-')) {
      return;
    }

    if (pay.type === 'abono_cxc') {
      ledger.push({
        id: pay.id,
        sourceId: pay.id,
        date: pay.date,
        type: 'ingreso',
        category: 'Abono Cartera Mayorista (CxC)',
        entityType: 'cliente',
        entityName: pay.entityName || 'Cliente Mayorista',
        method: pay.paymentMethod || 'Efectivo en Caja Bóveda Principal (COP)',
        reference: pay.reference || 'ABN',
        description: pay.notes || `Abono de cartera recibido de ${pay.entityName || 'cliente'}`,
        amount: Number(pay.totalCredited || pay.amountPesos) || 0,
        scrapGrams: Number(pay.scrapGoldGrams) || 0
      });
    } else if (pay.type === 'pago_cxp') {
      ledger.push({
        id: pay.id,
        sourceId: pay.id,
        date: pay.date,
        type: 'egreso',
        category: 'Pago a Proveedor / Taller (CxP)',
        entityType: 'proveedor',
        entityName: pay.entityName || 'Proveedor',
        method: pay.paymentMethod || 'Bancolombia Cuenta Corriente',
        reference: pay.reference || 'PGO',
        description: pay.notes || `Pago de mano de obra / liquidación a ${pay.entityName || 'proveedor'}`,
        amount: Number(pay.totalCredited || pay.amountPesos) || 0,
        scrapGrams: 0
      });
    }
  });

  // Purchases of Puro 24K (Granalla/Lingotes)
  const puroPurchases = (db.puro24k && db.puro24k.purchases) || [];
  puroPurchases.forEach(pur => {
    ledger.push({
      id: pur.id,
      sourceId: pur.id,
      date: pur.date,
      type: 'egreso',
      category: 'Compra Oro Puro 24K (Granalla)',
      entityType: 'proveedor',
      entityName: pur.supplierName || 'Fundición Andina Metales Preciosos 24K',
      method: 'Transferencia Bancaria',
      reference: pur.invoiceRef || 'FAC-PURO',
      description: `Compra de ${pur.grams}g puro 24k @ $${Number(pur.costPerGram).toLocaleString('es-CO')}/g (${pur.notes || 'Granalla fina'})`,
      amount: Number(pur.totalCost) || (pur.grams * pur.costPerGram),
      scrapGrams: 0
    });
  });

  // Manual Cash Movements (Gastos, retiros, ingresos varios)
  (db.cashMovements || []).forEach(m => {
    ledger.push({
      id: m.id,
      sourceId: m.id,
      date: m.date,
      type: m.type,
      category: m.category || (m.type === 'ingreso' ? 'Ingreso Vario' : 'Gasto Operativo'),
      entityType: 'general',
      entityName: m.concept || 'Movimiento de Caja',
      method: m.method || 'Efectivo en Caja Bóveda Principal (COP)',
      reference: m.reference || 'MOV',
      description: m.notes || m.concept,
      amount: Number(m.amount) || 0,
      scrapGrams: 0
    });
  });

  // Sort chronological ascending to compute running balances
  ledger.sort((a, b) => new Date(a.date) - new Date(b.date));

  let runningBalance = 0;
  ledger.forEach(item => {
    if (item.type === 'ingreso') {
      runningBalance += item.amount;
    } else if (item.type === 'egreso') {
      runningBalance -= item.amount;
    }
    item.runningBalance = runningBalance;
  });

  return ledger;
}

function getLocalDateString(dateInput) {
  if (!dateInput) {
    const now = new Date();
    return now.toLocaleDateString('en-CA');
  }
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA');
}

app.get('/api/cuadre-caja', (req, res) => {
  const db = readDB();
  const allLedger = compileCashLedger(db);
  const { period, startDate, endDate, method, type } = req.query;

  const now = new Date();
  const todayStr = getLocalDateString(now);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = getLocalDateString(yesterdayDate);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthPrefix = todayStr.slice(0, 7);

  let filtered = [...allLedger];

  if (period === 'hoy') {
    filtered = filtered.filter(item => getLocalDateString(item.date) === todayStr);
  } else if (period === 'ayer') {
    filtered = filtered.filter(item => getLocalDateString(item.date) === yesterdayStr);
  } else if (period === 'semana') {
    filtered = filtered.filter(item => item.date >= sevenDaysAgo);
  } else if (period === 'mes') {
    filtered = filtered.filter(item => getLocalDateString(item.date).startsWith(monthPrefix));
  } else if (period === 'custom' && startDate && endDate) {
    filtered = filtered.filter(item => {
      const itemDate = getLocalDateString(item.date);
      return itemDate >= startDate && itemDate <= endDate;
    });
  }

  if (method && method !== 'all') {
    filtered = filtered.filter(item => (item.method || '').toLowerCase().includes(method.toLowerCase()));
  }

  if (type && type !== 'all') {
    filtered = filtered.filter(item => item.type === type);
  }

  // Summary Metrics
  const totalInflows = filtered.filter(i => i.type === 'ingreso').reduce((a, b) => a + b.amount, 0);
  const totalOutflows = filtered.filter(i => i.type === 'egreso').reduce((a, b) => a + b.amount, 0);
  const netCashFlow = totalInflows - totalOutflows;
  const totalCreditsIssued = filtered.filter(i => i.type === 'credito_otorgado').reduce((a, b) => a + b.amount, 0);

  // Inflows breakdown
  const inflowCash = filtered.filter(i => i.type === 'ingreso' && (i.method || '').toLowerCase().includes('efectivo')).reduce((a, b) => a + b.amount, 0);
  const inflowScrap = filtered.filter(i => i.type === 'ingreso' && (i.method || '').toLowerCase().includes('retal')).reduce((a, b) => a + b.amount, 0);
  const inflowTransfer = filtered.filter(i => i.type === 'ingreso' && !(i.method || '').toLowerCase().includes('efectivo') && !(i.method || '').toLowerCase().includes('retal')).reduce((a, b) => a + b.amount, 0);
  const inflowScrapGrams = filtered.filter(i => i.type === 'ingreso' && i.scrapGrams > 0).reduce((a, b) => a + b.scrapGrams, 0);

  // Outflows breakdown
  const outflowPuroPurchases = filtered.filter(i => i.type === 'egreso' && i.category.includes('Puro')).reduce((a, b) => a + b.amount, 0);
  const outflowManoDeObra = filtered.filter(i => i.type === 'egreso' && (i.category.includes('Proveedor') || i.category.includes('Taller'))).reduce((a, b) => a + b.amount, 0);
  const outflowExpenses = filtered.filter(i => i.type === 'egreso' && i.category.includes('Gasto')).reduce((a, b) => a + b.amount, 0);

  // Supplier disbursements detail (Who was paid and how much)
  const supplierMap = {};
  filtered.filter(i => i.type === 'egreso' && (i.entityType === 'proveedor' || i.category.includes('Proveedor') || i.category.includes('Puro'))).forEach(item => {
    const sName = item.entityName || 'Proveedor';
    if (!supplierMap[sName]) {
      const dbSup = (db.suppliers || []).find(s => s.name === sName);
      supplierMap[sName] = {
        supplierName: sName,
        category: dbSup ? dbSup.category : 'Proveedor / Taller',
        totalPaid: 0,
        transactions: [],
        currentBalanceDuePesos: dbSup ? (dbSup.balanceDuePesos || 0) : 0,
        currentPuroInHandsGrams: dbSup ? (dbSup.puroInHandsGrams || 0) : 0
      };
    }
    supplierMap[sName].totalPaid += item.amount;
    supplierMap[sName].transactions.push(item);
  });
  const supplierDisbursements = Object.values(supplierMap).sort((a, b) => b.totalPaid - a.totalPaid);

  // Receivables status (Créditos totales vivos en el negocio)
  const clients = db.clients || [];
  const currentTotalDebtPesos = clients.reduce((a, c) => a + (Number(c.currentDebtPesos) || 0), 0);
  const currentTotalDebtGrams = clients.reduce((a, c) => a + (Number(c.currentDebtGrams) || 0), 0);
  const debtorsList = clients.filter(c => (Number(c.currentDebtPesos) || 0) > 0).map(c => ({
    id: c.id,
    name: c.tradeName || c.name,
    city: c.city,
    debtPesos: c.currentDebtPesos,
    debtGrams: c.currentDebtGrams,
    creditLimit: c.creditLimitPesos,
    riskLevel: c.riskLevel,
    lastPaymentDate: c.lastPaymentDate
  })).sort((a, b) => b.debtPesos - a.debtPesos);

  // Method balances across entire database
  const methodBalances = {};
  allLedger.forEach(item => {
    const m = item.method || 'Otros';
    if (!methodBalances[m]) {
      methodBalances[m] = { method: m, totalIn: 0, totalOut: 0, balance: 0 };
    }
    if (item.type === 'ingreso') {
      methodBalances[m].totalIn += item.amount;
      methodBalances[m].balance += item.amount;
    } else if (item.type === 'egreso') {
      methodBalances[m].totalOut += item.amount;
      methodBalances[m].balance -= item.amount;
    }
  });

  // Chronological items for display (latest first)
  const displayItems = [...filtered].reverse();

  res.json({
    success: true,
    summary: {
      totalInflows,
      totalOutflows,
      netCashFlow,
      totalCreditsIssued,
      inflowsBreakdown: {
        cash: inflowCash,
        transfer: inflowTransfer,
        scrapGold: inflowScrap,
        scrapGoldGrams: Number(inflowScrapGrams.toFixed(2))
      },
      outflowsBreakdown: {
        puro24k: outflowPuroPurchases,
        manoDeObra: outflowManoDeObra,
        expenses: outflowExpenses
      },
      receivables: {
        totalDebtPesos: currentTotalDebtPesos,
        totalDebtGrams: Number(currentTotalDebtGrams.toFixed(2)),
        clientsWithDebtCount: debtorsList.length,
        debtorsList
      },
      supplierDisbursements,
      methodBalances: Object.values(methodBalances)
    },
    items: displayItems
  });
});

app.post('/api/cash-movements', (req, res) => {
  const db = readDB();
  if (!db.cashMovements) db.cashMovements = [];

  const { type, category, concept, amount, method, reference, notes, date } = req.body;
  if (!concept || !amount || Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Concepto y monto válido son requeridos.' });
  }

  const mov = {
    id: 'mov-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    date: date || new Date().toISOString(),
    type: type || 'egreso',
    category: category || (type === 'ingreso' ? 'Ingreso Extraordinario' : 'Gasto Operativo'),
    concept: concept.trim(),
    amount: Number(amount) || 0,
    method: method || 'Efectivo en Caja Bóveda Principal (COP)',
    reference: reference || 'MOV-' + Date.now().toString().slice(-6),
    notes: notes || ''
  };

  db.cashMovements.unshift(mov);
  writeDB(db);

  res.status(201).json({ success: true, movement: mov, message: 'Movimiento de caja registrado exitosamente.' });
});

app.delete('/api/cash-movements/:id', (req, res) => {
  const db = readDB();
  if (!db.cashMovements) db.cashMovements = [];

  const mov = db.cashMovements.find(m => m.id === req.params.id);
  if (!mov) {
    return res.status(404).json({ success: false, message: 'Movimiento no encontrado.' });
  }

  db.cashMovements = db.cashMovements.filter(m => m.id !== req.params.id);
  writeDB(db);

  res.json({ success: true, message: 'Movimiento de caja eliminado.' });
});

// === MÓDULO DE GASTOS OPERATIVOS (OPEX) ===
app.get('/api/gastos-operativos', (req, res) => {
  const db = readDB();
  const allMovements = db.cashMovements || [];
  const rates = db.rates || {};
  const averages = calculateAverages(db);
  const puroBenchmark = Number(averages.promedioPuro24k ?? rates.oro24k_fino_benchmark ?? 0);

  // Filter only operating expenses (type: egreso)
  let expenses = allMovements.filter(m => m.type === 'egreso');

  const { period, startDate, endDate, category, method, search } = req.query;
  const now = new Date();
  const todayStr = getLocalDateString(now);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = getLocalDateString(yesterdayDate);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthPrefix = todayStr.slice(0, 7);
  
  // Previous month calculation
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthPrefix = getLocalDateString(prevMonthDate).slice(0, 7);
  const yearPrefix = todayStr.slice(0, 4);

  if (period === 'hoy') {
    expenses = expenses.filter(item => getLocalDateString(item.date) === todayStr);
  } else if (period === 'ayer') {
    expenses = expenses.filter(item => getLocalDateString(item.date) === yesterdayStr);
  } else if (period === 'semana') {
    expenses = expenses.filter(item => item.date >= sevenDaysAgo);
  } else if (period === 'mes') {
    expenses = expenses.filter(item => getLocalDateString(item.date).startsWith(monthPrefix));
  } else if (period === 'mes_anterior') {
    expenses = expenses.filter(item => getLocalDateString(item.date).startsWith(prevMonthPrefix));
  } else if (period === 'ano') {
    expenses = expenses.filter(item => getLocalDateString(item.date).startsWith(yearPrefix));
  } else if (period === 'custom' && startDate && endDate) {
    expenses = expenses.filter(item => {
      const d = getLocalDateString(item.date);
      return d >= startDate && d <= endDate;
    });
  }

  if (category && category !== 'all') {
    expenses = expenses.filter(item => (item.category || '').toLowerCase() === category.toLowerCase());
  }

  if (method && method !== 'all') {
    expenses = expenses.filter(item => (item.method || item.paymentMethod || '').toLowerCase().includes(method.toLowerCase()));
  }

  if (search) {
    const normalize = str => (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = normalize(search.trim());
    expenses = expenses.filter(item =>
      normalize(item.concept).includes(q) ||
      normalize(item.reference).includes(q) ||
      normalize(item.beneficiary || item.thirdParty).includes(q) ||
      normalize(item.category).includes(q) ||
      normalize(item.notes).includes(q)
    );
  }

  // Sort chronological descending (most recent first)
  expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Compute Metrics
  const totalExpenses = expenses.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
  const totalGrams24kEquivalent = puroBenchmark > 0 ? Number((totalExpenses / puroBenchmark).toFixed(2)) : 0;

  // Category Breakdown
  const catMap = {};
  const defaultColors = {
    'Nómina & Comisiones Mayoristas': { color: '#38bdf8', icon: '👥' },
    'Seguridad, Blindaje & Transporte': { color: '#ef4444', icon: '🛡️' },
    'Arrendamiento & Mantenimiento Bóveda': { color: '#f59e0b', icon: '🏢' },
    'Pólizas de Seguro de Metales': { color: '#8b5cf6', icon: '📜' },
    'Suministros de Bóveda & Empaque': { color: '#10b981', icon: '📦' },
    'Servicios Públicos & Conectividad': { color: '#06b6d4', icon: '⚡' },
    'Gastos Bancarios & 4x1000': { color: '#f97316', icon: '🏦' },
    'Honorarios Legales & Auditoría': { color: '#a855f7', icon: '⚖️' },
    'Viáticos & Giras Comerciales': { color: '#ec4899', icon: '✈️' },
    'Gastos Varios & Caja Menor': { color: '#64748b', icon: '☕' }
  };

  expenses.forEach(m => {
    const c = m.category || 'Otros Gastos';
    if (!catMap[c]) {
      const meta = defaultColors[c] || { color: '#d4af37', icon: '🧾' };
      catMap[c] = { category: c, amount: 0, count: 0, color: meta.color, icon: meta.icon };
    }
    catMap[c].amount += Number(m.amount) || 0;
    catMap[c].count++;
  });

  const categoryBreakdown = Object.values(catMap).map(c => ({
    ...c,
    percentage: totalExpenses > 0 ? Number(((c.amount / totalExpenses) * 100).toFixed(1)) : 0
  })).sort((a, b) => b.amount - a.amount);

  // Method Breakdown
  const methodMap = {};
  expenses.forEach(m => {
    const met = m.method || m.paymentMethod || 'Efectivo en Caja Bóveda Principal (COP)';
    if (!methodMap[met]) methodMap[met] = { method: met, amount: 0, count: 0 };
    methodMap[met].amount += Number(m.amount) || 0;
    methodMap[met].count++;
  });

  const methodBreakdown = Object.values(methodMap).map(m => ({
    ...m,
    percentage: totalExpenses > 0 ? Number(((m.amount / totalExpenses) * 100).toFixed(1)) : 0
  })).sort((a, b) => b.amount - a.amount);

  // Top category
  const topCategory = categoryBreakdown[0] || { category: 'Sin gastos', amount: 0, percentage: 0, color: '#64748b', icon: '🧾' };

  // Calculate Average Daily Spend
  let daysCount = 30;
  if (period === 'hoy' || period === 'ayer') daysCount = 1;
  else if (period === 'semana') daysCount = 7;
  else if (period === 'mes' || period === 'mes_anterior') daysCount = 30;
  else if (period === 'ano') daysCount = 365;
  else if (period === 'custom' && startDate && endDate) {
    const d1 = new Date(startDate);
    const d2 = new Date(endDate);
    daysCount = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
  }
  const averageDaily = Math.round(totalExpenses / daysCount);

  // OPEX / Sales ratio
  const orders = db.orders || [];
  const totalSales = orders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
  const opexToSalesRatio = totalSales > 0 ? Number(((totalExpenses / totalSales) * 100).toFixed(1)) : 0;

  res.json({
    success: true,
    summary: {
      totalExpenses,
      totalGrams24kEquivalent,
      averageDaily,
      topCategory,
      totalTransactions: expenses.length,
      categoryBreakdown,
      methodBreakdown,
      opexToSalesRatio,
      totalSalesRef: totalSales
    },
    expenses
  });
});

app.post('/api/gastos-operativos', (req, res) => {
  const db = readDB();
  if (!db.cashMovements) db.cashMovements = [];

  const { date, category, concept, amount, method, reference, beneficiary, notes } = req.body;
  if (!concept || !amount || Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Concepto y monto válido mayor a cero son obligatorios.' });
  }

  const newExpense = {
    id: 'exp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    date: date || new Date().toISOString(),
    type: 'egreso',
    category: category || 'Gastos Varios & Caja Menor',
    concept: concept.trim(),
    amount: Number(amount),
    method: method || 'Efectivo en Caja Bóveda Principal (COP)',
    reference: reference ? reference.trim() : 'EG-' + Date.now().toString().slice(-6),
    beneficiary: beneficiary ? beneficiary.trim() : '',
    thirdParty: beneficiary ? beneficiary.trim() : '',
    notes: notes ? notes.trim() : ''
  };

  db.cashMovements.unshift(newExpense);
  writeDB(db);

  res.status(201).json({ success: true, expense: newExpense, message: 'Gasto operativo registrado exitosamente.' });
});

app.put('/api/gastos-operativos/:id', (req, res) => {
  const db = readDB();
  if (!db.cashMovements) db.cashMovements = [];

  const idx = db.cashMovements.findIndex(m => m.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Gasto no encontrado.' });
  }

  if (req.body.amount !== undefined) {
    const parsedAmt = Number(req.body.amount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      return res.status(400).json({ success: false, message: 'El monto del gasto debe ser un número mayor a cero.' });
    }
  }

  const existing = db.cashMovements[idx];
  db.cashMovements[idx] = {
    ...existing,
    ...req.body,
    id: existing.id,
    type: 'egreso',
    amount: (req.body.amount !== undefined && !isNaN(Number(req.body.amount))) ? Number(req.body.amount) : existing.amount,
    concept: req.body.concept ? req.body.concept.trim() : existing.concept,
    category: req.body.category || existing.category,
    method: req.body.method || existing.method,
    reference: req.body.reference !== undefined ? req.body.reference.trim() : existing.reference,
    beneficiary: req.body.beneficiary !== undefined ? req.body.beneficiary.trim() : (existing.beneficiary || existing.thirdParty || ''),
    thirdParty: req.body.beneficiary !== undefined ? req.body.beneficiary.trim() : (existing.thirdParty || ''),
    notes: req.body.notes !== undefined ? req.body.notes.trim() : existing.notes
  };

  writeDB(db);
  res.json({ success: true, expense: db.cashMovements[idx], message: 'Gasto operativo actualizado exitosamente.' });
});

app.delete('/api/gastos-operativos/:id', (req, res) => {
  const db = readDB();
  if (!db.cashMovements) db.cashMovements = [];

  const exp = db.cashMovements.find(m => m.id === req.params.id);
  if (!exp) {
    return res.status(404).json({ success: false, message: 'Gasto no encontrado.' });
  }

  db.cashMovements = db.cashMovements.filter(m => m.id !== req.params.id);
  writeDB(db);

  res.json({ success: true, message: 'Gasto operativo eliminado correctamente.' });
});

// === Balance General Financiero & Estado Patrimonial ===
app.get('/api/balance-general', (req, res) => {
  const db = readDB();
  const averages = calculateAverages(db);
  const rates = db.rates || {};
  const puroBenchmark = Number(averages.promedioPuro24k ?? rates.oro24k_fino_benchmark ?? 0);
  const retalRate = Number(rates.retal_oro18k_compra ?? 0);
  const plataRate = Number(rates.plata925_venta ?? 0);

  // 1. Activos Disponibles (Caja & Bancos)
  const allLedger = compileCashLedger(db);
  const methodMap = {};
  allLedger.forEach(item => {
    const m = item.method || 'Otros';
    if (!methodMap[m]) methodMap[m] = { name: m, totalIn: 0, totalOut: 0, balance: 0 };
    if (item.type === 'ingreso') {
      methodMap[m].totalIn += item.amount;
      methodMap[m].balance += item.amount;
    } else if (item.type === 'egreso') {
      methodMap[m].totalOut += item.amount;
      methodMap[m].balance -= item.amount;
    }
  });

  // Filter out physical scrap metal accounts from liquid cash accounts to avoid double-counting with physical realizable inventory
  const liquidAccounts = Object.values(methodMap)
    .filter(acc => !acc.name.toLowerCase().includes('retal') && !acc.name.toLowerCase().includes('metal'))
    .map(acc => ({
      name: acc.name,
      balance: acc.balance,
      type: acc.name.toLowerCase().includes('efectivo') ? 'caja' : 'banco'
    }));

  const totalCashAndBanks = liquidAccounts.reduce((acc, a) => acc + a.balance, 0);

  // 2. Activos Exigibles (Cuentas por Cobrar - CxC Cartera)
  const clients = db.clients || [];
  const totalReceivablesPesos = clients.reduce((acc, c) => acc + (Number(c.currentDebtPesos) || 0), 0);
  const totalReceivablesGrams = Number(clients.reduce((acc, c) => acc + (Number(c.currentDebtGrams) || 0), 0).toFixed(2));
  const activeDebtors = clients.filter(c => (Number(c.currentDebtPesos) || 0) > 0).map(c => ({
    id: c.id,
    name: c.tradeName || c.name,
    city: c.city,
    debtPesos: Number(c.currentDebtPesos) || 0,
    debtGrams: Number(c.currentDebtGrams) || 0,
    creditLimit: Number(c.creditLimitPesos) || 50000000,
    riskLevel: c.riskLevel
  })).sort((a, b) => b.debtPesos - a.debtPesos);

  // 3. Activos Realizables (Inventario Físico en Bóveda y Talleres)
  const items = db.items || [];
  const italianItems = items.filter(i => i.category === 'italiano');
  const nationalItems = items.filter(i => i.category === 'nacional');
  const otherItems = items.filter(i => i.category !== 'italiano' && i.category !== 'nacional');

  const italianGrams = Number(italianItems.reduce((acc, i) => acc + (Number(i.weightGrams) || 0), 0).toFixed(2));
  const italianValuation = italianItems.reduce((acc, i) => acc + (Number(i.weightGrams) * Number(i.costPerGram)), 0);

  const nationalGrams = Number(nationalItems.reduce((acc, i) => acc + (Number(i.weightGrams) || 0), 0).toFixed(2));
  const nationalValuation = nationalItems.reduce((acc, i) => acc + (Number(i.weightGrams) * Number(i.costPerGram)), 0);

  const otherGrams = Number(otherItems.reduce((acc, i) => acc + (Number(i.weightGrams) || 0), 0).toFixed(2));
  const otherValuation = otherItems.reduce((acc, i) => acc + (Number(i.weightGrams) * Number(i.costPerGram)), 0);

  // Oro Puro 24K en Bóveda
  const puroGramsVault = Number((db.puro24k && db.puro24k.stockGrams) || 0);
  const puroCostAvg = Number(averages.promedioPuro24k ?? puroBenchmark ?? 0);
  const puroValuationVault = Math.round(puroGramsVault * puroCostAvg);

  // Oro Puro 24K en Talleres de Maquila (Activo Propio en Custodia / Transformación)
  const suppliers = db.suppliers || [];
  const puroGramsInWorkshops = Number(suppliers.reduce((acc, s) => acc + (Number(s.puroInHandsGrams) || 0), 0).toFixed(2));
  const puroValuationWorkshops = Math.round(puroGramsInWorkshops * puroCostAvg);

  // Retal de Oro 18K en Bóveda
  const payments = db.payments || [];
  const retalPaymentsGrams = payments.filter(p => p.type === 'retal_18k' || p.scrapGrams > 0).reduce((acc, p) => acc + (Number(p.scrapGrams) || 0), 0);
  const retalValuation = Math.round(retalPaymentsGrams * retalRate);

  const inventorySummary = {
    joyeriaItaliana18k: { grams: italianGrams, costRateAvg: averages.promedioItaliano, totalValue: italianValuation },
    joyeriaNacional18k: { grams: nationalGrams, costRateAvg: averages.promedioNacional, totalValue: nationalValuation },
    joyeriaOtrasCategorias18k: { grams: otherGrams, totalValue: otherValuation },
    oroPuro24kBoveda: { grams: puroGramsVault, costRateAvg: puroCostAvg, totalValue: puroValuationVault },
    oroPuro24kEnTalleres: { grams: puroGramsInWorkshops, costRateAvg: puroCostAvg, totalValue: puroValuationWorkshops },
    retalOro18kBoveda: { grams: Number(retalPaymentsGrams.toFixed(2)), rate: retalRate, totalValue: retalValuation },
    totalInventoryGrams: Number((italianGrams + nationalGrams + otherGrams + puroGramsVault + puroGramsInWorkshops + retalPaymentsGrams).toFixed(2)),
    totalInventoryValue: italianValuation + nationalValuation + otherValuation + puroValuationVault + puroValuationWorkshops + retalValuation
  };

  // TOTAL ACTIVOS
  const totalAssets = totalCashAndBanks + totalReceivablesPesos + inventorySummary.totalInventoryValue;
  const totalAssetsPuroGramsEq = puroBenchmark > 0 ? Number((totalAssets / puroBenchmark).toFixed(2)) : 0;

  // 4. PASIVOS (Cuentas por Pagar Proveedores & Manos de Obra Talleres)
  const totalPayablesPesos = suppliers.reduce((acc, s) => acc + (Number(s.balanceDuePesos) || 0), 0);
  const totalManoDeObraDue = suppliers.reduce((acc, s) => acc + (Number(s.balanceManoDeObra) || 0), 0);
  const totalLiabilities = totalPayablesPesos + totalManoDeObraDue;

  const creditorsList = suppliers.filter(s => (Number(s.balanceDuePesos) || 0) > 0 || (Number(s.balanceManoDeObra) || 0) > 0).map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    balanceDuePesos: Number(s.balanceDuePesos) || 0,
    balanceManoDeObra: Number(s.balanceManoDeObra) || 0,
    puroInHandsGrams: Number(s.puroInHandsGrams) || 0,
    totalOwed: (Number(s.balanceDuePesos) || 0) + (Number(s.balanceManoDeObra) || 0)
  })).sort((a, b) => b.totalOwed - a.totalOwed);

  // 5. PATRIMONIO NETO / CAPITAL CONTABLE (Activo - Pasivo)
  const netWorth = totalAssets - totalLiabilities;
  const netWorthPuroGramsEq = puroBenchmark > 0 ? Number((netWorth / puroBenchmark).toFixed(2)) : 0;
  const workingCapital = (totalCashAndBanks + totalReceivablesPesos + inventorySummary.totalInventoryValue) - totalLiabilities;

  // Utilidad Neta Acumulada por Despachos
  const orders = db.orders || [];
  const accumulatedProfitMargin = orders.reduce((acc, o) => acc + (Number(o.grossMargin) || Number(o.profitMargin) || 0), 0);
  const totalSalesVolume = orders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);

  // Capital Social Inicial Aportado / Reservas
  const initialCapitalContribution = Math.max(0, netWorth - accumulatedProfitMargin);

  // 6. Ratios Financieros
  const solvencyRatio = totalLiabilities > 0 ? Number((totalAssets / totalLiabilities).toFixed(2)) : 999;
  const acidTestRatio = totalLiabilities > 0 ? Number(((totalCashAndBanks + totalReceivablesPesos) / totalLiabilities).toFixed(2)) : 999;
  const debtToAssetRatio = totalAssets > 0 ? Number(((totalLiabilities / totalAssets) * 100).toFixed(1)) : 0;
  const metalAllocationPct = totalAssets > 0 ? Number(((inventorySummary.totalInventoryValue / totalAssets) * 100).toFixed(1)) : 0;
  const receivablesAllocationPct = totalAssets > 0 ? Number(((totalReceivablesPesos / totalAssets) * 100).toFixed(1)) : 0;
  const cashAllocationPct = totalAssets > 0 ? Number(((totalCashAndBanks / totalAssets) * 100).toFixed(1)) : 0;

  res.json({
    success: true,
    asOfDate: new Date().toISOString(),
    rates: {
      oro24k_fino_benchmark: puroBenchmark,
      retal_oro18k_compra: retalRate,
      plata925_venta: plataRate,
      promedios: averages
    },
    activos: {
      total: totalAssets,
      totalGramsEq24k: totalAssetsPuroGramsEq,
      disponible: {
        total: totalCashAndBanks,
        cuentas: liquidAccounts
      },
      exigible: {
        totalPesos: totalReceivablesPesos,
        totalGrams18k: totalReceivablesGrams,
        activeDebtorsCount: activeDebtors.length,
        debtors: activeDebtors
      },
      realizable: inventorySummary
    },
    pasivos: {
      total: totalLiabilities,
      proveedoresPesos: totalPayablesPesos,
      manosDeObraTalleres: totalManoDeObraDue,
      creditors: creditorsList
    },
    patrimonio: {
      netWorth,
      netWorthGramsEq24k: netWorthPuroGramsEq,
      workingCapital,
      accumulatedProfitMargin,
      totalSalesVolume,
      initialCapitalContribution
    },
    ratios: {
      solvencyRatio,
      acidTestRatio,
      debtToAssetRatio,
      metalAllocationPct,
      receivablesAllocationPct,
      cashAllocationPct
    }
  });
});

// =========================================================
// MÓDULO DE AUTENTICACIÓN, USUARIOS & CONTROL DE ACCESO (RBAC)
// =========================================================

function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false;
  const calc = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return calc === hash;
}

const DEFAULT_ROLES = {
  superadmin: {
    id: 'superadmin',
    name: 'Super Administrador (Dueño)',
    badge: '👑 Super Admin',
    color: '#d4af37',
    description: 'Control absoluto e irrevocable de todo el sistema, finanzas, bóveda, usuarios y permisos',
    isProtected: true,
    permissions: {
      dashboard: { canView: true, canEdit: true, canDelete: true, canExport: true },
      puro: { canView: true, canEdit: true, canDelete: true, canExport: true },
      inventario: { canView: true, canEdit: true, canDelete: true, canExport: true },
      despacho: { canView: true, canEdit: true, canDelete: true, canExport: true },
      joyerias: { canView: true, canEdit: true, canDelete: true, canExport: true },
      'cartera-clientes': { canView: true, canEdit: true, canDelete: true, canExport: true },
      proveedores: { canView: true, canEdit: true, canDelete: true, canExport: true },
      cxc: { canView: true, canEdit: true, canDelete: true, canExport: true },
      cxp: { canView: true, canEdit: true, canDelete: true, canExport: true },
      remisiones: { canView: true, canEdit: true, canDelete: true, canExport: true },
      'metodos-pago': { canView: true, canEdit: true, canDelete: true, canExport: true },
      'cuadre-caja': { canView: true, canEdit: true, canDelete: true, canExport: true },
      'balance-general': { canView: true, canEdit: true, canDelete: true, canExport: true },
      'gastos-operativos': { canView: true, canEdit: true, canDelete: true, canExport: true },
      usuarios: { canView: true, canEdit: true, canDelete: true, canExport: true }
    }
  },
  admin: {
    id: 'admin',
    name: 'Administrador General',
    badge: '⭐ Administrador',
    color: '#38bdf8',
    description: 'Gestión operacional y financiera completa de la empresa mayorista',
    isProtected: false,
    permissions: {
      dashboard: { canView: true, canEdit: true, canDelete: true, canExport: true },
      puro: { canView: true, canEdit: true, canDelete: false, canExport: true },
      inventario: { canView: true, canEdit: true, canDelete: true, canExport: true },
      despacho: { canView: true, canEdit: true, canDelete: true, canExport: true },
      joyerias: { canView: true, canEdit: true, canDelete: true, canExport: true },
      'cartera-clientes': { canView: true, canEdit: true, canDelete: false, canExport: true },
      proveedores: { canView: true, canEdit: true, canDelete: true, canExport: true },
      cxc: { canView: true, canEdit: true, canDelete: false, canExport: true },
      cxp: { canView: true, canEdit: true, canDelete: false, canExport: true },
      remisiones: { canView: true, canEdit: true, canDelete: false, canExport: true },
      'metodos-pago': { canView: true, canEdit: true, canDelete: false, canExport: true },
      'cuadre-caja': { canView: true, canEdit: true, canDelete: false, canExport: true },
      'balance-general': { canView: true, canEdit: false, canDelete: false, canExport: true },
      'gastos-operativos': { canView: true, canEdit: true, canDelete: true, canExport: true },
      usuarios: { canView: true, canEdit: true, canDelete: false, canExport: true }
    }
  },
  boveda: {
    id: 'boveda',
    name: 'Jefe de Bóveda & Joyería',
    badge: '💎 Jefe de Bóveda',
    color: '#fbbf24',
    description: 'Custodia de metales, ingreso de prendas, pesaje de balanza y entrega a talleres',
    isProtected: false,
    permissions: {
      dashboard: { canView: true, canEdit: false, canDelete: false, canExport: true },
      puro: { canView: true, canEdit: true, canDelete: false, canExport: true },
      inventario: { canView: true, canEdit: true, canDelete: false, canExport: true },
      despacho: { canView: true, canEdit: true, canDelete: false, canExport: true },
      joyerias: { canView: true, canEdit: false, canDelete: false, canExport: false },
      'cartera-clientes': { canView: false, canEdit: false, canDelete: false, canExport: false },
      proveedores: { canView: true, canEdit: true, canDelete: false, canExport: true },
      cxc: { canView: false, canEdit: false, canDelete: false, canExport: false },
      cxp: { canView: true, canEdit: true, canDelete: false, canExport: true },
      remisiones: { canView: true, canEdit: false, canDelete: false, canExport: true },
      'metodos-pago': { canView: false, canEdit: false, canDelete: false, canExport: false },
      'cuadre-caja': { canView: false, canEdit: false, canDelete: false, canExport: false },
      'balance-general': { canView: false, canEdit: false, canDelete: false, canExport: false },
      'gastos-operativos': { canView: false, canEdit: false, canDelete: false, canExport: false },
      usuarios: { canView: false, canEdit: false, canDelete: false, canExport: false }
    }
  },
  comercial: {
    id: 'comercial',
    name: 'Asesor Comercial / Ventas',
    badge: '💼 Comercial',
    color: '#34d399',
    description: 'Atención a joyerías, despacho en balanza, catálogo de piezas y remisiones',
    isProtected: false,
    permissions: {
      dashboard: { canView: true, canEdit: false, canDelete: false, canExport: false },
      puro: { canView: false, canEdit: false, canDelete: false, canExport: false },
      inventario: { canView: true, canEdit: false, canDelete: false, canExport: false },
      despacho: { canView: true, canEdit: true, canDelete: false, canExport: true },
      joyerias: { canView: true, canEdit: true, canDelete: false, canExport: false },
      'cartera-clientes': { canView: true, canEdit: false, canDelete: false, canExport: true },
      proveedores: { canView: false, canEdit: false, canDelete: false, canExport: false },
      cxc: { canView: true, canEdit: false, canDelete: false, canExport: false },
      cxp: { canView: false, canEdit: false, canDelete: false, canExport: false },
      remisiones: { canView: true, canEdit: false, canDelete: false, canExport: true },
      'metodos-pago': { canView: false, canEdit: false, canDelete: false, canExport: false },
      'cuadre-caja': { canView: false, canEdit: false, canDelete: false, canExport: false },
      'balance-general': { canView: false, canEdit: false, canDelete: false, canExport: false },
      'gastos-operativos': { canView: false, canEdit: false, canDelete: false, canExport: false },
      usuarios: { canView: false, canEdit: false, canDelete: false, canExport: false }
    }
  },
  cajero: {
    id: 'cajero',
    name: 'Caja & Facturación',
    badge: '💵 Caja & Facturación',
    color: '#06b6d4',
    description: 'Cobros, abonos de joyerías, retal de oro, métodos de pago y arqueo de caja',
    isProtected: false,
    permissions: {
      dashboard: { canView: true, canEdit: false, canDelete: false, canExport: false },
      puro: { canView: false, canEdit: false, canDelete: false, canExport: false },
      inventario: { canView: false, canEdit: false, canDelete: false, canExport: false },
      despacho: { canView: false, canEdit: false, canDelete: false, canExport: false },
      joyerias: { canView: true, canEdit: false, canDelete: false, canExport: false },
      'cartera-clientes': { canView: true, canEdit: true, canDelete: false, canExport: true },
      proveedores: { canView: false, canEdit: false, canDelete: false, canExport: false },
      cxc: { canView: true, canEdit: true, canDelete: false, canExport: true },
      cxp: { canView: false, canEdit: false, canDelete: false, canExport: false },
      remisiones: { canView: true, canEdit: true, canDelete: false, canExport: true },
      'metodos-pago': { canView: true, canEdit: true, canDelete: false, canExport: false },
      'cuadre-caja': { canView: true, canEdit: true, canDelete: false, canExport: true },
      'balance-general': { canView: false, canEdit: false, canDelete: false, canExport: false },
      'gastos-operativos': { canView: true, canEdit: true, canDelete: false, canExport: true },
      usuarios: { canView: false, canEdit: false, canDelete: false, canExport: false }
    }
  },
  auditor: {
    id: 'auditor',
    name: 'Auditor Contable & Fiscal',
    badge: '⚖️ Auditor NIIF',
    color: '#a855f7',
    description: 'Revisoría fiscal, balance general, auditoría de arqueos y gastos operativos (Solo Lectura)',
    isProtected: false,
    permissions: {
      dashboard: { canView: true, canEdit: false, canDelete: false, canExport: true },
      puro: { canView: true, canEdit: false, canDelete: false, canExport: true },
      inventario: { canView: true, canEdit: false, canDelete: false, canExport: true },
      despacho: { canView: false, canEdit: false, canDelete: false, canExport: false },
      joyerias: { canView: true, canEdit: false, canDelete: false, canExport: true },
      'cartera-clientes': { canView: true, canEdit: false, canDelete: false, canExport: true },
      proveedores: { canView: true, canEdit: false, canDelete: false, canExport: true },
      cxc: { canView: true, canEdit: false, canDelete: false, canExport: true },
      cxp: { canView: true, canEdit: false, canDelete: false, canExport: true },
      remisiones: { canView: true, canEdit: false, canDelete: false, canExport: true },
      'metodos-pago': { canView: true, canEdit: false, canDelete: false, canExport: true },
      'cuadre-caja': { canView: true, canEdit: false, canDelete: false, canExport: true },
      'balance-general': { canView: true, canEdit: false, canDelete: false, canExport: true },
      'gastos-operativos': { canView: true, canEdit: false, canDelete: false, canExport: true },
      usuarios: { canView: false, canEdit: false, canDelete: false, canExport: false }
    }
  }
};

const activeSessions = new Map();

function initAuth(db) {
  let modified = false;

  if (!db.roles || typeof db.roles !== 'object') {
    db.roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
    modified = true;
  } else {
    Object.keys(DEFAULT_ROLES).forEach(rKey => {
      if (!db.roles[rKey]) {
        db.roles[rKey] = JSON.parse(JSON.stringify(DEFAULT_ROLES[rKey]));
        modified = true;
      }
    });
  }

  if (!Array.isArray(db.users)) {
    db.users = [];
    modified = true;
  }

  let superadmin = db.users.find(u => u.role === 'superadmin' || u.username === 'superadmin' || u.username === 'admin');
  if (!superadmin) {
    const { hash, salt } = hashPassword('nexus2026!');
    superadmin = {
      id: 'usr-superadmin',
      name: 'Super Administrador (Dueño)',
      username: 'superadmin',
      email: 'admin@nexusjoyas.com',
      role: 'superadmin',
      passwordHash: hash,
      salt: salt,
      status: 'activo',
      phone: '+57 300 000 0000',
      createdAt: new Date().toISOString(),
      lastLogin: null
    };
    db.users.unshift(superadmin);
    modified = true;
  }

  if (modified) {
    writeDB(db);
  }
}

// 1. Login Endpoint
app.post('/api/auth/login', (req, res) => {
  const db = readDB();
  initAuth(db);
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Ingresa tu usuario y contraseña.' });
  }

  const cleanUser = username.trim().toLowerCase();
  const user = db.users.find(u =>
    (u.username && u.username.toLowerCase() === cleanUser) ||
    (u.email && u.email.toLowerCase() === cleanUser) ||
    (cleanUser === 'admin' && (u.username === 'superadmin' || u.role === 'superadmin'))
  );

  if (!user) {
    return res.status(401).json({ success: false, message: 'Usuario o correo no encontrado.' });
  }

  if (user.status !== 'activo') {
    return res.status(403).json({ success: false, message: 'Tu cuenta se encuentra inactiva. Contacta al Super Administrador.' });
  }

  // Password verification: checks regular hash OR master fallback for superadmin
  const isValid = verifyPassword(password, user.passwordHash, user.salt) ||
    (user.role === 'superadmin' && (password === 'nexus2026!' || password === 'admin123'));

  if (!isValid) {
    return res.status(401).json({ success: false, message: 'Contraseña incorrecta. Verifica tus credenciales.' });
  }

  // Generate secure token
  const token = 'tok_' + Date.now() + '_' + crypto.randomBytes(24).toString('hex');
  const roleData = (db.roles && db.roles[user.role]) || DEFAULT_ROLES[user.role] || DEFAULT_ROLES.comercial;

  user.lastLogin = new Date().toISOString();
  writeDB(db);

  const sessionData = {
    token,
    userId: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    roleData,
    permissions: roleData.permissions || {},
    createdAt: Date.now(),
    expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  };

  activeSessions.set(token, sessionData);

  res.json({
    success: true,
    message: `¡Bienvenido de nuevo, ${user.name}!`,
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      roleName: roleData.name,
      roleBadge: roleData.badge,
      roleColor: roleData.color,
      status: user.status,
      phone: user.phone,
      lastLogin: user.lastLogin
    },
    permissions: roleData.permissions || {},
    roles: db.roles || DEFAULT_ROLES
  });
});

// 2. Validate current session / user profile
app.get('/api/auth/me', (req, res) => {
  const db = readDB();
  initAuth(db);
  const authHeader = req.headers.authorization || req.headers['x-auth-token'] || req.query.token;
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;

  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ success: false, message: 'Sesión no iniciada o token expirado.' });
  }

  const session = activeSessions.get(token);
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return res.status(401).json({ success: false, message: 'La sesión ha expirado. Por favor ingresa nuevamente.' });
  }

  const user = db.users.find(u => u.id === session.userId);
  if (!user || user.status !== 'activo') {
    activeSessions.delete(token);
    return res.status(403).json({ success: false, message: 'Usuario no disponible o inactivo.' });
  }

  const roleData = (db.roles && db.roles[user.role]) || DEFAULT_ROLES[user.role] || DEFAULT_ROLES.comercial;

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      roleName: roleData.name,
      roleBadge: roleData.badge,
      roleColor: roleData.color,
      status: user.status,
      phone: user.phone,
      lastLogin: user.lastLogin
    },
    permissions: roleData.permissions || {},
    roles: db.roles || DEFAULT_ROLES
  });
});

// 3. Logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || req.headers['x-auth-token'] || req.body.token;
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;
  if (token && activeSessions.has(token)) {
    activeSessions.delete(token);
  }
  res.json({ success: true, message: 'Sesión cerrada correctamente.' });
});

// 4. Users CRUD
app.get('/api/users', (req, res) => {
  const db = readDB();
  initAuth(db);
  const users = (db.users || []).map(u => ({
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email || '',
    role: u.role,
    status: u.status || 'activo',
    phone: u.phone || '',
    createdAt: u.createdAt || null,
    lastLogin: u.lastLogin || null
  }));
  res.json({ success: true, users, roles: db.roles || DEFAULT_ROLES });
});

app.post('/api/users', (req, res) => {
  const db = readDB();
  initAuth(db);
  const { name, username, email, role, password, phone, status } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'El nombre completo es obligatorio.' });
  }
  if (!username || !username.trim()) {
    return res.status(400).json({ success: false, message: 'El nombre de usuario es obligatorio.' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ success: false, message: 'La contraseña debe tener mínimo 4 caracteres.' });
  }

  if (role === 'superadmin') {
    return res.status(400).json({ success: false, message: 'El rol de Super Administrador es exclusivo e irrepetible para el Dueño Principal.' });
  }

  const cleanUser = username.trim().toLowerCase();
  if (db.users.some(u => u.username.toLowerCase() === cleanUser)) {
    return res.status(400).json({ success: false, message: `El usuario "${username}" ya está registrado.` });
  }

  const { hash, salt } = hashPassword(password);
  const newUser = {
    id: 'usr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    name: name.trim(),
    username: cleanUser,
    email: email ? email.trim() : '',
    role: role && db.roles && db.roles[role] ? role : 'comercial',
    passwordHash: hash,
    salt: salt,
    status: status === 'inactivo' ? 'inactivo' : 'activo',
    phone: phone ? phone.trim() : '',
    createdAt: new Date().toISOString(),
    lastLogin: null
  };

  db.users.push(newUser);
  writeDB(db);

  res.status(201).json({
    success: true,
    message: 'Usuario creado exitosamente.',
    user: {
      id: newUser.id,
      name: newUser.name,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
      phone: newUser.phone,
      createdAt: newUser.createdAt
    }
  });
});

app.put('/api/users/:id', (req, res) => {
  const db = readDB();
  initAuth(db);
  const { id } = req.params;
  const idx = db.users.findIndex(u => u.id === id);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
  }

  const current = db.users[idx];

  // Protect superadmin from being demoted or deactivated
  if (current.role === 'superadmin' && req.body.status === 'inactivo') {
    return res.status(400).json({ success: false, message: 'No puedes desactivar la cuenta del Super Administrador Principal.' });
  }
  if (current.role === 'superadmin' && req.body.role && req.body.role !== 'superadmin') {
    return res.status(400).json({ success: false, message: 'No puedes cambiar el rol del Super Administrador Principal.' });
  }
  if (req.body.role === 'superadmin' && current.role !== 'superadmin') {
    return res.status(400).json({ success: false, message: 'No se puede ascender una cuenta regular al rol exclusivo de Super Administrador.' });
  }

  if (req.body.name) current.name = req.body.name.trim();
  if (req.body.email !== undefined) current.email = req.body.email.trim();
  if (req.body.phone !== undefined) current.phone = req.body.phone.trim();
  if (req.body.status && current.role !== 'superadmin') {
    current.status = req.body.status;
    if (req.body.status === 'inactivo') {
      for (const [t, s] of activeSessions.entries()) {
        if (s.userId === current.id) activeSessions.delete(t);
      }
    }
  }
  if (req.body.role && db.roles && db.roles[req.body.role] && current.role !== 'superadmin') {
    current.role = req.body.role;
    // Update active session role if logged in
    for (const [t, s] of activeSessions.entries()) {
      if (s.userId === current.id) {
        s.role = req.body.role;
        s.roleData = db.roles[req.body.role];
        s.permissions = db.roles[req.body.role]?.permissions || {};
      }
    }
  }

  // Update password if provided
  if (req.body.password && req.body.password.trim().length >= 4) {
    const { hash, salt } = hashPassword(req.body.password.trim());
    current.passwordHash = hash;
    current.salt = salt;
  }

  writeDB(db);

  res.json({
    success: true,
    message: 'Usuario actualizado exitosamente.',
    user: {
      id: current.id,
      name: current.name,
      username: current.username,
      email: current.email,
      role: current.role,
      status: current.status,
      phone: current.phone
    }
  });
});

app.delete('/api/users/:id', (req, res) => {
  const db = readDB();
  initAuth(db);
  const { id } = req.params;
  const user = db.users.find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
  }

  if (user.role === 'superadmin' || user.username === 'superadmin') {
    return res.status(400).json({ success: false, message: 'Acción bloqueada: No se puede eliminar al Super Administrador Principal.' });
  }

  db.users = db.users.filter(u => u.id !== id);
  for (const [t, s] of activeSessions.entries()) {
    if (s.userId === id) activeSessions.delete(t);
  }
  writeDB(db);

  res.json({ success: true, message: `Usuario "${user.name}" eliminado correctamente.` });
});

// 5. Roles & Permissions Matrix
app.get('/api/roles', (req, res) => {
  const db = readDB();
  initAuth(db);
  res.json({
    success: true,
    roles: db.roles || DEFAULT_ROLES,
    modules: [
      { id: 'dashboard', name: 'Bóveda & Dashboard', icon: '👑', desc: 'Resumen de bóveda, tasas del día y métricas principales' },
      { id: 'puro', name: 'Oro Puro 24K & Maquila', icon: '✨', desc: 'Granalla 24K, compras, maquilas y entregas a talleres' },
      { id: 'inventario', name: 'Inventario por Gramo', icon: '📦', desc: 'Stock físico de joyas 18K en bóveda, pesos y costos' },
      { id: 'despacho', name: 'Despacho & Balanza', icon: '⚖️', desc: 'Balanza digital, pesaje en caliente y armado de pedidos' },
      { id: 'joyerias', name: 'Joyerías (Clientes)', icon: '🏛️', desc: 'Directorio de clientes mayoristas, NIT y cupos de crédito' },
      { id: 'cartera-clientes', name: 'Cartera de Clientes', icon: '📑', desc: 'Límites, saldos en mora, histórico y estados de cuenta' },
      { id: 'proveedores', name: 'Proveedores & Talleres', icon: '🏭', desc: 'Directorio de talleres, compras e importaciones italianas' },
      { id: 'cxc', name: 'Cuentas por Cobrar (CxC)', icon: '📈', desc: 'Gestión de créditos, abonos en efectivo y retal 18K' },
      { id: 'cxp', name: 'Talleres & CxP', icon: '🔨', desc: 'Liquidación de manos de obra y oro fino en talleres' },
      { id: 'remisiones', name: 'Historial Remisiones', icon: '🧾', desc: 'Facturas de despacho, estado de remisiones e impresiones' },
      { id: 'metodos-pago', name: 'Métodos de Pago', icon: '💳', desc: 'Cuentas bancarias, cajas de bóveda y medios activos' },
      { id: 'cuadre-caja', name: 'Cuadre de Caja', icon: '💵', desc: 'Arqueo de fondos, balance de caja y movimientos' },
      { id: 'balance-general', name: 'Balance General NIIF', icon: '🏛️', desc: 'Activos, pasivos, patrimonio neto y ratios de solvencia' },
      { id: 'gastos-operativos', name: 'Gastos Operativos (OPEX)', icon: '📋', desc: 'Costos fijos, nómina, blindaje, pólizas y egresos' },
      { id: 'usuarios', name: 'Gestión de Usuarios & Roles', icon: '🛡️', desc: 'Personal, asignación de credenciales y matriz de permisos' }
    ]
  });
});

app.put('/api/roles', (req, res) => {
  const db = readDB();
  initAuth(db);
  const { roles } = req.body;

  if (!roles || typeof roles !== 'object') {
    return res.status(400).json({ success: false, message: 'Estructura de roles inválida.' });
  }

  Object.keys(roles).forEach(rKey => {
    if (db.roles[rKey]) {
      if (rKey === 'superadmin') {
        db.roles[rKey].permissions = DEFAULT_ROLES.superadmin.permissions;
      } else if (roles[rKey].permissions) {
        db.roles[rKey].permissions = roles[rKey].permissions;
        if (roles[rKey].name) db.roles[rKey].name = roles[rKey].name;
        if (roles[rKey].color) db.roles[rKey].color = roles[rKey].color;
        if (roles[rKey].description) db.roles[rKey].description = roles[rKey].description;
      }
    }
  });

  writeDB(db);

  // Synchronize active sessions with updated permissions immediately
  for (const [token, sess] of activeSessions.entries()) {
    if (db.roles[sess.role]) {
      sess.roleData = db.roles[sess.role];
      sess.permissions = db.roles[sess.role].permissions || {};
    }
  }

  res.json({ success: true, message: 'Matriz de permisos actualizada exitosamente.', roles: db.roles });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    success: false,
    message: 'Error interno en el servidor.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Fallback to SPA index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`💎 Nexus por Mayor Server ejecutándose en http://localhost:${PORT}`);
  });
}

module.exports = app;
