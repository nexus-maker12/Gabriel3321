'use strict';
const { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } = require('node:crypto');
const { fail, number, object, validDate } = require('./domain');
const tokenHash = token => createHash('sha256').update(token).digest('hex');
function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { hash: `pbkdf2$210000$${pbkdf2Sync(password,salt,210000,64,'sha512').toString('hex')}`, salt };
}
function verifyPassword(password, stored, salt) {
  if (typeof password !== 'string' || typeof stored !== 'string' || !salt || password.length > 1024) return false;
  const parts = stored.split('$');
  const iterations = parts[0] === 'pbkdf2' ? Number(parts[1]) : 1000;
  const hex = parts[0] === 'pbkdf2' ? parts[2] : stored;
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1000000 || !/^[a-f\d]{128}$/i.test(hex || '')) return false;
  const computed = pbkdf2Sync(password,salt,iterations,64,'sha512');
  return timingSafeEqual(computed,Buffer.from(hex,'hex'));
}
const numericFields = new Set(['weightGrams','costPerGram','pricePerGram','creditLimitPesos','creditLimitGrams','currentDebtPesos','currentDebtGrams','balanceDuePesos','balanceDueGrams','balanceManoDeObra','puroInHandsGrams','manoDeObraPerGram','manoDeObraRate','grams','grams24k','grams24kUsed','grams18kReceived','amount','amountPesos','scrapGoldGrams','scrapGoldRate','scrapGoldAmount','creditAmount','cash','transfer','creditDays','surchargePercent','promedioPuro24k','promedioNacional','promedioItaliano','retal_oro18k_compra','oro24k_fino_benchmark','oro18k_nacional_base','oro18k_italiano_base']);
function validateInput(req) {
  for (const value of Object.values(req.query)) if (typeof value !== 'string') fail('Los filtros deben ser valores de texto simples.');
  if (req.query.startDate) validDate(req.query.startDate);
  if (req.query.endDate) validDate(req.query.endDate);
  if (req.query.startDate && req.query.endDate && req.query.startDate > req.query.endDate) fail('La fecha inicial no puede superar la final.');
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return;
  object(req.body, 'Solicitud');
  function visit(value) {
    object(value,'Registro');
    for (const [key, field] of Object.entries(value)) {
      if (['__proto__','prototype','constructor'].includes(key)) fail('Campo no permitido.');
      if (numericFields.has(key)) number(field,key);
      else if (['isDefault','resetOverrides','isProtected'].includes(key) && typeof field !== 'boolean') fail(`${key}: se esperaba verdadero o falso.`);
      else if (field && typeof field === 'object') {
        if (!['roles','permissions','items','paymentDetail'].includes(key)) fail(`${key}: tipo de dato inválido.`);
        if (key === 'items') { if (!Array.isArray(field)) fail('Las pesadas deben ser una lista.'); field.forEach(visit); }
        else if (key === 'roles' || key === 'permissions') continue;
        else visit(field);
      } else if (!numericFields.has(key) && !['isDefault','resetOverrides','isProtected'].includes(key) && (typeof field !== 'string' || field.length > 2000)) fail(`${key}: texto inválido.`);
    }
  }
  visit(req.body);
  if (req.body.date !== undefined) validDate(req.body.date);
  if (req.body.status !== undefined && !['activo','inactivo'].includes(req.body.status)) fail('Estado inválido.');
  if (req.body.color !== undefined && !/^#[a-f\d]{6}$/i.test(req.body.color)) fail('Color inválido.');
}
function modulesFor(req) {
  const first = req.path.split('/')[2];
  const read = req.method === 'GET';
  const routes = {
    stats: ['dashboard'], rates: read ? ['dashboard','puro','inventario','despacho','cxc','cxp','balance-general','gastos-operativos','cuadre-caja'] : ['puro'],
    puro: ['puro'], items: read ? ['inventario','despacho','dashboard'] : ['inventario'],
    categories: read ? ['inventario','despacho','puro'] : ['inventario'],
    clients: read ? ['joyerias','cartera-clientes','cxc','despacho','dashboard','cuadre-caja'] : ['joyerias'],
    suppliers: read ? ['proveedores','cxp','puro','dashboard'] : ['proveedores'],
    orders: read ? ['remisiones','cartera-clientes','despacho','dashboard','cuadre-caja'] : ['despacho'],
    payments: read ? ['cxc','cxp','cartera-clientes','dashboard','cuadre-caja'] : (req.body.type === 'pago_cxp' ? ['cxp'] : ['cxc','cartera-clientes']),
    'payment-methods': read ? ['metodos-pago','despacho','cxc','cxp','cuadre-caja','gastos-operativos'] : ['metodos-pago'],
    'cash-movements': ['cuadre-caja'], 'cuadre-caja': ['cuadre-caja'], 'gastos-operativos': ['gastos-operativos'], 'balance-general': ['balance-general'], users: ['usuarios'], roles: ['usuarios']
  };
  return routes[first] || [];
}
function authorize(req, db, verifyAuthToken) {
  if (req.path === '/api/auth/login') return;
  const raw = req.headers.authorization || req.headers['x-auth-token'];
  const token = typeof raw === 'string' ? raw.replace(/^Bearer\s+/i,'').trim() : '';
  const payload = verifyAuthToken(token);
  if (!payload) fail('Inicia sesión para continuar.',401);
  const user = db.users.find(u => u.id === payload.userId);
  if (!user || user.status !== 'activo') fail('La cuenta ya no está disponible.',401);
  req.user = user; req.authToken = token;
  if (req.path.startsWith('/api/auth/')) return;
  if (user.role === 'superadmin') return;
  const permissions = db.roles[user.role]?.permissions || {};
  const action = req.method === 'GET' ? 'canView' : (req.method === 'DELETE' ? 'canDelete' : 'canEdit');
  if (!modulesFor(req).some(module => permissions[module]?.[action] === true)) fail('Tu rol no tiene permiso para esta operación.',403);
  if (req.path === '/api/roles' && req.method !== 'GET') fail('Solo el propietario puede modificar la matriz de permisos.',403);
  if (req.path.startsWith('/api/users/') && req.method !== 'GET') {
    const target = db.users.find(u => u.id === req.params?.id || u.id === req.path.split('/')[3]);
    if (target?.role === 'superadmin') fail('Solo el propietario puede modificar su cuenta.',403);
  }
}
module.exports = { hashPassword, verifyPassword, tokenHash, validateInput, authorize };
