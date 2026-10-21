require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const models = require('../models');

const DB_PATH = path.join(__dirname, '..', 'data', 'database.json');

async function resetDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI no encontrado en .env');
    process.exit(1);
  }

  // 1. Read existing database.json to preserve Superadmin credentials & system roles
  console.log('🔄 Leyendo credenciales de Superadmin desde data/database.json...');
  let currentDB = {};
  try {
    currentDB = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (e) {
    console.error('Error leyendo database.json:', e);
  }

  const superadminUser = (currentDB.users || []).find(u => u.role === 'superadmin') || {
    id: 'usr-superadmin',
    name: 'Super Administrador (Dueño)',
    username: 'superadmin',
    email: 'admin@nexusjoyas.com',
    role: 'superadmin',
    passwordHash: '62bb49774d8530e3e955a3bf9e1e94878e704aeb1075535948f2d8d829e9fcd2ee013096acd9a39491c13fafde13ad26cabc89ae88b56a5b08c609d429918ff2',
    salt: 'd14f645bbc57d23f9883bf3e9ba5ef6d',
    status: 'activo',
    phone: '+57 300 000 0000',
    createdAt: new Date().toISOString(),
    lastLogin: null
  };

  const defaultRoles = currentDB.roles || {};

  // Clean Zero State
  const cleanState = {
    rates: {
      oro24k_fino_benchmark: 0,
      oro18k_nacional_base: 0,
      oro18k_italiano_base: 0,
      retal_oro18k_compra: 0,
      plata925_venta: 0,
      override_promedioPuro24k: 0,
      override_promedioNacional: 0,
      override_promedioItaliano: 0,
      last_updated: new Date().toISOString()
    },
    puro24k: {
      stockGrams: 0,
      purchases: [],
      deliveries: []
    },
    items: [],
    clients: [],
    suppliers: [],
    orders: [],
    payments: [],
    paymentMethods: [],
    cashMovements: [],
    categories: [],
    roles: defaultRoles,
    users: [superadminUser]
  };

  // 2. Connect exclusively to nexus_por_mayor on MongoDB Atlas
  console.log('🔄 Conectando a MongoDB Atlas...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  const activeDBName = mongoose.connection.name;
  console.log(`🔒 Base de datos activa conectada: "${activeDBName}"`);

  // SAFETY CHECK: Ensure we ONLY touch 'nexus_por_mayor'
  if (activeDBName !== 'nexus_por_mayor') {
    console.error(`⛔ ALERTA DE SEGURIDAD: La base de datos conectada no es "nexus_por_mayor" sino "${activeDBName}". Operación cancelada.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('🧹 Limpiando y reseteando en 0 todas las colecciones de "nexus_por_mayor"...');

  await Promise.all([
    models.Item.deleteMany({}),
    models.Client.deleteMany({}),
    models.Supplier.deleteMany({}),
    models.Order.deleteMany({}),
    models.Payment.deleteMany({}),
    models.CashMovement.deleteMany({}),
    models.Category.deleteMany({}),
    models.PaymentMethod.deleteMany({})
  ]);

  // Set Puro24k to 0 grams
  await models.Puro24k.deleteMany({});
  await models.Puro24k.create({ stockGrams: 0, purchases: [], deliveries: [] });

  // Reset Rates to base defaults
  await models.Rates.deleteMany({});
  await models.Rates.create(cleanState.rates);

  // Keep ONLY superadmin in User collection
  await models.User.deleteMany({});
  await models.User.create(superadminUser);

  // Keep roles intact
  const rolesArr = Array.isArray(defaultRoles) ? defaultRoles : Object.values(defaultRoles);
  if (rolesArr.length) {
    await models.Role.deleteMany({});
    await models.Role.insertMany(rolesArr);
  }

  console.log('✅ MongoDB Atlas "nexus_por_mayor" reseteado exitosamente a 0.');
  await mongoose.disconnect();

  // 3. Write cleanState to local database.json
  fs.writeFileSync(DB_PATH, JSON.stringify(cleanState, null, 2), 'utf-8');
  console.log('✅ Archivo local data/database.json reseteado en 0.');

  console.log('\n=============================================');
  console.log('💎 NEXUS POR MAYOR - BASE DE DATOS EN CERO 💎');
  console.log('   - Joyería e Inventario (Lotes): 0');
  console.log('   - Clientes (CxC): 0');
  console.log('   - Proveedores & Talleres: 0');
  console.log('   - Remisiones & Ventas: 0');
  console.log('   - Pagos & Abonos: 0');
  console.log('   - Movimientos de Caja & Gastos: 0');
  console.log('   - Bóveda Oro Puro 24K: 0.00g');
  console.log(`   - Usuario Activo: ${superadminUser.username} (${superadminUser.name})`);
  console.log('=============================================\n');
}

resetDB().catch(err => {
  console.error('Error durante reset:', err);
  process.exit(1);
});
