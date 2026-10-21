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

async function seedMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ ERROR: MONGODB_URI no está definido en el archivo .env');
    console.log('   Por favor configura tu cadena de conexión en .env:');
    console.log('   MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/nexus_db?retryWrites=true&w=majority');
    process.exit(1);
  }

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ ERROR: No se encontró el archivo de datos local en ${DB_PATH}`);
    process.exit(1);
  }

  console.log('🔄 Leyendo archivo local data/database.json...');
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  const db = JSON.parse(raw);

  console.log(`🔄 Conectando a MongoDB Atlas...`);
  try {
    await mongoose.connect(uri);
    console.log('✅ Conexión establecida a MongoDB Atlas.\n');

    console.log('📦 Limpiando colecciones existentes en Atlas (Fresh Migration)...');
    await Promise.all([
      models.Rates.deleteMany({}),
      models.Item.deleteMany({}),
      models.Client.deleteMany({}),
      models.Supplier.deleteMany({}),
      models.Order.deleteMany({}),
      models.Payment.deleteMany({}),
      models.Category.deleteMany({}),
      models.PaymentMethod.deleteMany({}),
      models.CashMovement.deleteMany({}),
      models.Puro24k.deleteMany({}),
      models.User.deleteMany({}),
      models.Role.deleteMany({})
    ]);

    console.log('🚀 Migrando datos a MongoDB Atlas:');

    if (db.rates) {
      await models.Rates.create(db.rates);
      console.log('   ✓ Tasas & Promedios migrados');
    }

    if (Array.isArray(db.items) && db.items.length) {
      await models.Item.insertMany(db.items);
      console.log(`   ✓ ${db.items.length} Lotes de Joyería (18K) migrados`);
    }

    if (Array.isArray(db.clients) && db.clients.length) {
      await models.Client.insertMany(db.clients);
      console.log(`   ✓ ${db.clients.length} Joyerías Mayoristas (Cartera CxC) migradas`);
    }

    if (Array.isArray(db.suppliers) && db.suppliers.length) {
      await models.Supplier.insertMany(db.suppliers);
      console.log(`   ✓ ${db.suppliers.length} Proveedores & Talleres Maquila migrados`);
    }

    if (Array.isArray(db.orders) && db.orders.length) {
      await models.Order.insertMany(db.orders);
      console.log(`   ✓ ${db.orders.length} Remisiones de Despacho migradas`);
    }

    if (Array.isArray(db.payments) && db.payments.length) {
      await models.Payment.insertMany(db.payments);
      console.log(`   ✓ ${db.payments.length} Abonos & Pagos migrados`);
    }

    if (Array.isArray(db.categories) && db.categories.length) {
      await models.Category.insertMany(db.categories);
      console.log(`   ✓ ${db.categories.length} Categorías dinámicas migradas`);
    }

    if (Array.isArray(db.paymentMethods) && db.paymentMethods.length) {
      await models.PaymentMethod.insertMany(db.paymentMethods);
      console.log(`   ✓ ${db.paymentMethods.length} Métodos de Pago migrados`);
    }

    if (Array.isArray(db.cashMovements) && db.cashMovements.length) {
      await models.CashMovement.insertMany(db.cashMovements);
      console.log(`   ✓ ${db.cashMovements.length} Movimientos de Caja migrados`);
    }

    if (db.puro24k) {
      await models.Puro24k.create(db.puro24k);
      console.log(`   ✓ Bóveda de Oro Puro 24K & Maquila migrada (${db.puro24k.stockGrams}g stock)`);
    }

    if (Array.isArray(db.users) && db.users.length) {
      await models.User.insertMany(db.users);
      console.log(`   ✓ ${db.users.length} Usuarios & Credenciales migrados`);
    }

    if (db.roles) {
      const rolesArr = Array.isArray(db.roles) ? db.roles : Object.values(db.roles);
      if (rolesArr.length) {
        await models.Role.insertMany(rolesArr);
        console.log(`   ✓ ${rolesArr.length} Roles & Matriz RBAC migrados`);
      }
    }

    console.log('\n🎉 ¡MIGRACIÓN COMPLETADA CON ÉXITO EN MONGODB ATLAS!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error durante la migración:', err);
    process.exit(1);
  }
}

seedMongo();
