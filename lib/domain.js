'use strict';

const { randomUUID, createHash } = require('node:crypto');
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function number(value, label, { min = 0, positive = false, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') fail(`${label}: ingresa un número válido.`);
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER || result < min || (positive && result <= 0)) fail(`${label}: valor fuera del rango permitido.`);
  return result;
}
function text(value, label, { required = false, fallback = '' } = {}) {
  if (value === undefined) value = fallback;
  if (typeof value !== 'string' || value.length > 2000) fail(`${label}: texto inválido.`);
  const result = value.trim();
  if (required && !result) fail(`${label}: campo obligatorio.`);
  return result;
}
function grams(value, label, optional = false) {
  const result = Math.round(number(value, label, { fallback: optional ? 0 : undefined }) * 100) / 100;
  if (!optional && result <= 0) fail(`${label}: el peso debe ser al menos 0,01 g.`);
  return result;
}
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: estructura inválida.`); return value; }
function money(value) {
  const rounded=Math.round(value);
  if(!Number.isSafeInteger(rounded)) fail('El importe supera el rango de cálculo seguro.');
  return rounded;
}
const id = prefix => `${prefix}-${randomUUID()}`;
function isDispatchRetal(payment) { return payment.type === 'retal_despacho' || String(payment.reference || '').startsWith('RETAL-DESPACHO-'); }
function supplierDebt(supplier) {
  // balanceManoDeObra is the labour component already included in balanceDuePesos.
  return Math.max(Number(supplier.balanceDuePesos) || 0, Number(supplier.balanceManoDeObra) || 0);
}
function retalStock(db) {
  const receivedOnOrders = (db.orders || []).reduce((sum, order) => sum + (Number(order.paymentDetail?.scrapGoldGrams) || 0), 0);
  const standalone = (db.payments || []).filter(p => !isDispatchRetal(p)).reduce((sum, payment) => {
    const weight = Number(payment.scrapGoldGrams ?? payment.scrapGrams) || 0;
    return sum + (payment.type === 'pago_cxp' ? -weight : weight);
  }, 0);
  return Math.round((receivedOnOrders + standalone) * 100) / 100;
}
function dateKey(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !dateKey(value)) fail('Fecha inválida.');
  const calendarDate=value.slice(0,10);
  if (new Date(`${calendarDate}T12:00:00Z`).toISOString().slice(0, 10) !== calendarDate) fail('Fecha inválida.');
  return value;
}
function periodBounds(period, startDate, endDate, now = new Date()) {
  const today = dateKey(now);
  const base = new Date(today+'T12:00:00Z');
  const shifted = days => new Date(base.getTime()+days*86400000).toISOString().slice(0,10);
  if(period==='hoy') return [today,today];
  if(period==='ayer') return [shifted(-1),shifted(-1)];
  if(period==='semana') return [shifted(-6),today];
  if(period==='mes') return [today.slice(0,7)+'-01',today];
  if(period==='ano') return [today.slice(0,4)+'-01-01',today];
  if(period==='mes_anterior') {
    const first=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()-1,1));
    const last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),0));
    return [first.toISOString().slice(0,10),last.toISOString().slice(0,10)];
  }
  if(period==='custom') {
    if(!startDate||!endDate) fail('Selecciona las fechas inicial y final.');
    validDate(startDate);validDate(endDate);
    if(startDate>endDate) fail('Rango de fechas inválido.');
    return [startDate,endDate];
  }
  return null;
}
function filterPeriod(list,period,startDate,endDate,now) {
  const bounds=periodBounds(period,startDate,endDate,now);
  return bounds ? list.filter(item=>{const date=dateKey(item.date);return date>=bounds[0]&&date<=bounds[1];}) : [...list];
}
function refreshOrderBalances(db, clientId) {
  const orders = db.orders.filter(o => o.clientId === clientId).sort((a,b) => new Date(b.date) - new Date(a.date));
  let debt = Number(db.clients.find(client=>client.id===clientId)?.currentDebtPesos) || 0;
  for (const order of orders) {
    const credit = Number(order.paymentDetail?.creditAmount ?? (order.paymentType === 'Credito' ? order.totalAmount : 0)) || 0;
    order.outstandingAmount = money(Math.min(credit,debt));
    debt -= order.outstandingAmount;
    order.status = order.outstandingAmount === 0 ? 'Pagado' : (order.outstandingAmount < order.totalAmount ? 'Parcial' : 'Pendiente');
  }
}
function requestIdentity(req) {
  const key=req.headers['idempotency-key'];
  if(key!==undefined && (typeof key!=='string'||!/^[\w-]{8,128}$/.test(key))) fail('Identificador de solicitud inválido.');
  return {key, fingerprint:createHash('sha256').update(JSON.stringify(req.body)).digest('hex')};
}
function replay(list,identity) {
  const previous=identity.key&&list.find(item=>item.idempotencyKey===identity.key);
  if(previous&&previous.requestFingerprint!==identity.fingerprint) fail('El identificador ya se utilizó para otra operación.',409);
  return previous;
}
function business({ getDB, writeDB, calculateAverages }) {
  return {
    async order(req, res) {
      const db = await getDB();
      const identity=requestIdentity(req);
      const previous=replay(db.orders,identity);
      if(previous) return res.json({success:true,order:previous,client:db.clients.find(client=>client.id===previous.clientId),replayed:true});
      const body = req.body;
      const client = db.clients.find(c => c.id === body.clientId);
      if (!client || client.status === 'inactivo') fail('Cliente mayorista no disponible.');
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 500) fail('Agrega entre 1 y 500 pesadas al despacho.');
      const requested = new Map();
      let totalAmount = 0, totalCostAmount = 0, totalGrams = 0;
      const items = body.items.map(line => {
        object(line, 'Pesada');
        const item = db.items.find(i => i.id === line.itemId);
        if (!item || item.status === 'inactivo') fail('Uno de los lotes ya no está disponible.');
        const weight = grams(line.weightGrams, 'Peso despachado');
        const pricePerGram = number(line.pricePerGram, 'Precio por gramo', { positive: true });
        const costPerGram = number(item.costPerGram, 'Costo del lote');
        requested.set(item.id, (requested.get(item.id) || 0) + weight);
        if (requested.get(item.id) > Number(item.weightGrams) + 1e-8) fail(`Existencias insuficientes para ${item.code || item.name}.`);
        const subtotal = money(weight * pricePerGram);
        totalAmount += subtotal; totalCostAmount += money(weight * costPerGram); totalGrams += weight;
        return { itemId: item.id, code: item.code, name: item.name, category: item.category, weightGrams: weight, costPerGram, pricePerGram, subtotal, marginPerGram: pricePerGram - costPerGram };
      });
      if (totalAmount <= 0 || !Number.isSafeInteger(totalAmount)) fail('El total del despacho no es válido.');
      const averages = calculateAverages(db);
      const detail = body.paymentDetail === undefined ? (body.paymentType === 'Credito' ? {} : { cash: totalAmount }) : object(body.paymentDetail, 'Liquidación');
      const cash = money(number(detail.cash, 'Efectivo', { fallback: 0 }));
      const transfer = money(number(detail.transfer, 'Transferencia', { fallback: 0 }));
      const scrapGoldGrams = grams(detail.scrapGoldGrams, 'Retal recibido', true);
      const scrapGoldRate = number(detail.scrapGoldRate, 'Tarifa de retal', { fallback: Number(db.rates.retal_oro18k_compra) || 0 });
      if (scrapGoldGrams && !scrapGoldRate) fail('Define una tarifa de retal mayor que cero.');
      const scrapGoldAmount = money(scrapGoldGrams * scrapGoldRate);
      const creditAmount = money(totalAmount - cash - transfer - scrapGoldAmount);
      if (creditAmount < 0) fail('Los pagos superan el valor del despacho.');
      if (own(detail, 'creditAmount') && Math.abs(number(detail.creditAmount, 'Saldo a crédito') - creditAmount) > .5) fail('La liquidación no coincide con el total del despacho.');
      const creditLimit = number(client.creditLimitPesos, 'Cupo del cliente', { fallback: 0 });
      if (creditAmount + (Number(client.currentDebtPesos) || 0) > creditLimit) fail('El despacho supera el cupo disponible del cliente.');
      if (creditAmount && !(averages.promedioNacional > 0)) fail('Define la tarifa nacional para calcular el equivalente de la cartera.');
      const year = dateKey().slice(0,4);
      const prefix = `REM-${year}-`;
      const sequence = Math.max(100, ...db.orders.map(o => String(o.remisionNumber || '').startsWith(prefix) ? Number(String(o.remisionNumber).slice(prefix.length)) || 0 : 0)) + 1;
      const paymentType = creditAmount === totalAmount ? 'Credito' : (creditAmount || scrapGoldGrams || (cash && transfer) ? 'Mixto' : 'Contado');
      const order = { id: id('ord'), remisionNumber: `${prefix}${String(sequence).padStart(3,'0')}`, date: new Date().toISOString(), clientId: client.id, clientName: client.tradeName || client.name, items, totalGrams: Math.round(totalGrams * 100) / 100, totalCostAmount, totalAmount, grossMargin: totalAmount-totalCostAmount, paymentType, paymentDetail: { cash, transfer, scrapGoldGrams, scrapGoldRate, scrapGoldAmount, creditAmount }, status: creditAmount === 0 ? 'Pagado' : (creditAmount === totalAmount ? 'Pendiente' : 'Parcial'), outstandingAmount: creditAmount, notes: text(body.notes, 'Notas') };
      for (const [itemId, weight] of requested) { const item = db.items.find(i => i.id === itemId); item.weightGrams = Math.round((item.weightGrams - weight)*100)/100; }
      client.currentDebtPesos = money((Number(client.currentDebtPesos)||0) + creditAmount);
      client.currentDebtGrams = averages.promedioNacional > 0 ? Math.round(client.currentDebtPesos / averages.promedioNacional * 100) / 100 : 0;
      db.orders.unshift(order);
      if(identity.key) Object.assign(order,{idempotencyKey:identity.key,requestFingerprint:identity.fingerprint});
      await writeDB(db);
      res.status(201).json({ success: true, order, client });
    },
    async payment(req, res) {
      const db = await getDB(), b = req.body;
      const identity=requestIdentity(req);
      const previous=replay(db.payments,identity);
      if(previous) return res.json({success:true,payment:previous,replayed:true});
      if (!['abono_cxc','pago_cxp'].includes(b.type)) fail('Tipo de pago no soportado.');
      const isClient = b.type === 'abono_cxc';
      const entity = (isClient ? db.clients : db.suppliers).find(e => e.id === b.entityId);
      if (!entity) fail('Cliente o proveedor no encontrado.',404);
      const amountPesos = money(number(b.amountPesos, 'Monto en dinero', { fallback: 0 }));
      const scrapGoldGrams = grams(b.scrapGoldGrams, 'Peso del retal', true);
      const scrapGoldRate = number(b.scrapGoldRate, 'Tarifa de retal', { fallback: Number(db.rates.retal_oro18k_compra)||0 });
      if (scrapGoldGrams && !scrapGoldRate) fail('Define la tarifa del retal.');
      const scrapGoldEquivalent = money(scrapGoldGrams * scrapGoldRate);
      const totalCredited = money(amountPesos + scrapGoldEquivalent);
      if (totalCredited <= 0 || !Number.isSafeInteger(totalCredited)) fail('El abono debe ser mayor que cero.');
      const debt = isClient ? Number(entity.currentDebtPesos)||0 : supplierDebt(entity);
      if (totalCredited > debt) fail('El abono supera el saldo pendiente.');
      if (!isClient && scrapGoldGrams > retalStock(db) + 1e-8) fail('No hay suficiente retal para este pago.');
      const rate = calculateAverages(db)[isClient ? 'promedioNacional':'promedioItaliano'];
      if (isClient) {
        entity.currentDebtPesos = money(debt - totalCredited);
        entity.currentDebtGrams = rate > 0 ? Math.round(entity.currentDebtPesos/rate*100)/100 : 0;
        entity.lastPaymentDate = dateKey();
      } else {
        entity.balanceDuePesos = money(debt - totalCredited);
        entity.balanceManoDeObra = Math.max(0, (Number(entity.balanceManoDeObra)||0) - totalCredited);
        entity.balanceDueGrams = rate > 0 ? Math.round(entity.balanceDuePesos/rate*100)/100 : 0;
      }
      const payment = { id: id('pay'), type: b.type, entityId: entity.id, entityName: entity.tradeName || entity.name, date: new Date().toISOString(), amountPesos, scrapGoldGrams, scrapGoldRate, scrapGoldEquivalent, totalCredited, paymentMethod: text(b.paymentMethod,'Medio de pago',{fallback:'Efectivo'}), reference: text(b.reference,'Referencia',{fallback:id('ABN')}), notes:text(b.notes,'Notas') };
      db.payments.unshift(payment);
      if(identity.key) Object.assign(payment,{idempotencyKey:identity.key,requestFingerprint:identity.fingerprint});
      if (isClient) refreshOrderBalances(db,entity.id);
      await writeDB(db);
      res.status(201).json({success:true,payment});
    }
  };
}
module.exports = { business, number, text, grams, money, object, fail, own, supplierDebt, retalStock, isDispatchRetal, dateKey, validDate, periodBounds, filterPeriod, refreshOrderBalances };
