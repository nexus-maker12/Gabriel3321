const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const models = require('../models');

let isConnected = false;
const isVercel = Boolean(process.env.VERCEL);
const ORIGINAL_DB_PATH = path.join(__dirname, '..', 'data', 'database.json');
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

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.trim() === '') {
    console.log('ℹ️  [DB] No se detectó MONGODB_URI en .env. Operando con almacenamiento local: data/database.json');
    isConnected = false;
    return false;
  }

  try {
    console.log('🔄 [DB] Conectando a MongoDB Atlas...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000
    });
    isConnected = true;
    console.log('✅ [DB] ¡Conexión exitosa a MongoDB Atlas!');

    // Auto-seed or hydrate database from Atlas
    await autoSeedOrHydrate();
    return true;
  } catch (err) {
    console.warn('⚠️  [DB] Error conectando a MongoDB Atlas:', err.message);
    console.warn('ℹ️  [DB] Continuando en modo fallback con data/database.json...');
    isConnected = false;
    return false;
  }
}

function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

function cleanDoc(doc) {
  if (!doc) return doc;
  const copy = { ...doc };
  delete copy._id;
  delete copy.__v;
  return copy;
}

// Auto-seed from database.json if Mongo collections are empty, or hydrate local cache if Mongo has data
async function autoSeedOrHydrate() {
  if (!isMongoConnected()) return;

  try {
    const clientsCount = await models.Client.countDocuments();
    if (clientsCount === 0 && (fs.existsSync(DB_PATH) || fs.existsSync(ORIGINAL_DB_PATH))) {
      console.log('🌱 [DB] Base de datos en Mongo Atlas vacía. Sincronizando datos iniciales...');
      const sourceFile = fs.existsSync(DB_PATH) ? DB_PATH : ORIGINAL_DB_PATH;
      const raw = fs.readFileSync(sourceFile, 'utf-8');
      const db = JSON.parse(raw);

      if (db.rates) {
        await models.Rates.findOneAndUpdate({}, db.rates, { upsert: true, new: true });
      }
      if (Array.isArray(db.items) && db.items.length) {
        await models.Item.insertMany(db.items);
      }
      if (Array.isArray(db.clients) && db.clients.length) {
        await models.Client.insertMany(db.clients);
      }
      if (Array.isArray(db.suppliers) && db.suppliers.length) {
        await models.Supplier.insertMany(db.suppliers);
      }
      if (Array.isArray(db.orders) && db.orders.length) {
        await models.Order.insertMany(db.orders);
      }
      if (Array.isArray(db.payments) && db.payments.length) {
        await models.Payment.insertMany(db.payments);
      }
      if (Array.isArray(db.categories) && db.categories.length) {
        await models.Category.insertMany(db.categories);
      }
      if (Array.isArray(db.paymentMethods) && db.paymentMethods.length) {
        await models.PaymentMethod.insertMany(db.paymentMethods);
      }
      if (Array.isArray(db.cashMovements) && db.cashMovements.length) {
        await models.CashMovement.insertMany(db.cashMovements);
      }
      if (db.puro24k) {
        await models.Puro24k.create(db.puro24k);
      }
      if (Array.isArray(db.users) && db.users.length) {
        await models.User.insertMany(db.users);
      }
      if (db.roles) {
        const rolesArr = Array.isArray(db.roles) ? db.roles : Object.values(db.roles);
        if (rolesArr.length) {
          await models.Role.insertMany(rolesArr);
        }
      }
      console.log('✅ [DB] ¡Datos iniciales sincronizados exitosamente en MongoDB Atlas!');
    } else if (clientsCount > 0) {
      console.log('📥 [DB] MongoDB Atlas activo con datos existentes. Hidratando cache local...');
      const [
        rates,
        items,
        clients,
        suppliers,
        orders,
        payments,
        categories,
        paymentMethods,
        cashMovements,
        puro24k,
        users,
        roles
      ] = await Promise.all([
        models.Rates.findOne().lean(),
        models.Item.find().lean(),
        models.Client.find().lean(),
        models.Supplier.find().lean(),
        models.Order.find().lean(),
        models.Payment.find().lean(),
        models.Category.find().lean(),
        models.PaymentMethod.find().lean(),
        models.CashMovement.find().lean(),
        models.Puro24k.findOne().lean(),
        models.User.find().lean(),
        models.Role.find().lean()
      ]);

      const rolesMap = {};
      if (Array.isArray(roles)) {
        roles.forEach(r => {
          if (r.id) rolesMap[r.id] = cleanDoc(r);
        });
      }

      const atlasState = {
        rates: rates ? cleanDoc(rates) : {},
        items: (items || []).map(cleanDoc),
        clients: (clients || []).map(cleanDoc),
        suppliers: (suppliers || []).map(cleanDoc),
        orders: (orders || []).map(cleanDoc),
        payments: (payments || []).map(cleanDoc),
        categories: (categories || []).map(cleanDoc),
        paymentMethods: (paymentMethods || []).map(cleanDoc),
        cashMovements: (cashMovements || []).map(cleanDoc),
        puro24k: puro24k ? cleanDoc(puro24k) : { stockGrams: 0, purchases: [], deliveries: [] },
        users: (users || []).map(cleanDoc),
        roles: Object.keys(rolesMap).length ? rolesMap : undefined
      };

      try {
        fs.writeFileSync(DB_PATH, JSON.stringify(atlasState, null, 2), 'utf-8');
        console.log('✅ [DB] Cache local sincronizada con MongoDB Atlas.');
      } catch (e) {
        console.warn('⚠️ [DB] Warning escribiendo cache local:', e.message);
      }
    }
  } catch (err) {
    console.error('Error durante autoSeedOrHydrate en Mongo Atlas:', err.message);
  }
}

module.exports = {
  connectDB,
  isMongoConnected,
  models
};

