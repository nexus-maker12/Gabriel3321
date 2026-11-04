const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {fork} = require('node:child_process');
const {once} = require('node:events');
const {dateKey} = require('../lib/domain');
const root = path.resolve(__dirname,'..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'aurea-regression-'));
const dataFile = path.join(dir,'database.json');
const realDataPath=path.join(root,'data/database.json');
const originalData = fs.existsSync(realDataPath)?fs.readFileSync(realDataPath):null;
const digest = data=>crypto.createHash('sha256').update(data).digest('hex');
function fixtureUser(id,role,password) {
  const salt=crypto.randomBytes(16).toString('hex');
  return {id,username:id,name:id,role,status:'activo',email:id+'@example.test',salt,passwordHash:crypto.pbkdf2Sync(password,salt,1000,64,'sha512').toString('hex')};
}
fs.writeFileSync(dataFile,JSON.stringify({
  categories:[{id:'cat-nacional',name:'Nacional',slug:'nacional'},{id:'cat-italiano',name:'Italiano',slug:'italiano'}],
  rates:{oro18k_nacional_base:100,oro18k_italiano_base:150,oro24k_fino_benchmark:200,retal_oro18k_compra:50},
  users:[fixtureUser('owner','superadmin','AuditOwner-2026!'),fixtureUser('reader','auditor','Reader-2026!'),fixtureUser('manager','admin','Manager-2026!')]
}));
let child,base,token;
async function start() {
  child=fork(path.join(__dirname,'fixture-server.cjs'),[],{cwd:root,env:{...process.env,AUREA_STORAGE:'local',AUREA_DATA_FILE:dataFile},stdio:['ignore','ignore','pipe','ipc']});
  let errors='';child.stderr.on('data',data=>{errors+=data;});
  const info=await Promise.race([once(child,'message').then(([info])=>info),once(child,'exit').then(()=>{throw Error(errors||'Servidor terminado');}),new Promise((_,reject)=>{const timeout=setTimeout(()=>reject(Error('Timeout del servidor')),10000);timeout.unref();})]);
  base=`http://127.0.0.1:${info.port}`;
}
async function stop() { if(child?.connected){child.send('stop');await once(child,'exit');} }
async function api(url,method='GET',body,auth=token) {
  const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
}
async function login(username='owner',password='AuditOwner-2026!') {return api('/api/auth/login','POST',{username,password},null);}
async function createClient(limit=50000) {const r=await api('/api/clients','POST',{tradeName:'Cliente '+crypto.randomUUID(),creditLimitPesos:limit});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.client;}
async function createItem(weight=100,cost=100) {const r=await api('/api/items','POST',{name:'Lote de prueba',code:crypto.randomUUID(),category:'nacional',weightGrams:weight,costPerGram:cost});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.item;}
async function createSupplier() {const r=await api('/api/suppliers','POST',{name:'Taller '+crypto.randomUUID(),manoDeObraPerGram:10});assert.equal(r.status,201);return r.data.supplier;}
const orderBody=(client,item,weight=10,price=200)=>({clientId:client.id,items:[{itemId:item.id,weightGrams:weight,pricePerGram:price}],paymentType:'Credito'});
before(async()=>{await start();const response=await login();assert.equal(response.status,200);token=response.data.token;});
after(async()=>{await stop();if(originalData)assert.equal(digest(fs.readFileSync(realDataPath)),digest(originalData),'Los datos originales no se modificaron');else assert.equal(fs.existsSync(realDataPath),false,'Las pruebas no crearon una base real');});

test('La API exige sesión para leer y escribir datos',async()=>{
  for(const url of ['/api/items','/api/clients','/api/users','/api/stats','/api/balance-general']) assert.equal((await api(url,'GET',undefined,null)).status,401);
  assert.equal((await api('/api/clients','POST',{tradeName:'Sin sesión'},null)).status,401);
  assert.equal((await api('/api/items','GET',undefined,'token-falso')).status,401);
});
test('El acceso no acepta contraseñas maestras y migra el hash antiguo',async()=>{
  assert.equal((await login('owner','admin123')).status,401);
  assert.equal((await login('owner','not-the-owner-password')).status,401);
  assert.match(JSON.parse(fs.readFileSync(dataFile)).users.find(u=>u.id==='owner').passwordHash,/^pbkdf2\$210000\$/);
});
test('Los permisos de solo lectura se verifican en el servidor',async()=>{
  const reader=(await login('reader','Reader-2026!')).data.token;
  assert.equal((await api('/api/items','GET',undefined,reader)).status,200);
  assert.equal((await api('/api/items','POST',{weightGrams:10,costPerGram:100},reader)).status,403);
  assert.equal((await api('/api/users','GET',undefined,reader)).status,403);
});
test('Un administrador no puede cambiar al propietario ni concederse permisos',async()=>{
  const manager=(await login('manager','Manager-2026!')).data.token;
  assert.equal((await api('/api/users/owner','PUT',{password:'Override-2026!'},manager)).status,403);
  assert.equal((await api('/api/roles','PUT',{roles:{}},manager)).status,403);
});
test('Rechaza números inválidos, infinitos y tipos incorrectos',async()=>{
  for(const value of [-1,'Infinity','NaN',null,{},true]) assert.equal((await api('/api/items','POST',{weightGrams:value,costPerGram:100})).status,400);
  assert.equal((await api('/api/clients','POST',{tradeName:123})).status,400);
  assert.equal((await api('/api/items','GET',undefined)).status,200);
  assert.equal((await api('/api/items?search[]=x')).status,400);
  assert.equal((await api('/api/orders','POST',{items:[null]})).status,400);
  assert.equal((await api('/api/orders','POST',{items:[1]})).status,400);
});
test('El cupo y la mano de obra cero se conservan',async()=>{
  assert.equal((await createClient(0)).creditLimitPesos,0);
  const r=await api('/api/suppliers','POST',{name:'Tarifa cero',manoDeObraPerGram:0});assert.equal(r.data.supplier.manoDeObraPerGram,0);
});
test('Una edición parcial conserva peso, costo, identidad y cartera',async()=>{
  const item=await createItem();const r=await api('/api/items/'+item.id,'PUT',{name:'Nuevo nombre',id:'cambiado'});
  assert.equal(r.data.item.id,item.id);assert.equal(r.data.item.weightGrams,100);assert.equal(r.data.item.costPerGram,100);
  const client=await createClient();const edited=await api('/api/clients/'+client.id,'PUT',{currentDebtPesos:99999,name:'Nombre corregido'});
  assert.equal(edited.data.client.currentDebtPesos,0);
});
test('Impide despachar más gramos que los disponibles, incluso en líneas duplicadas',async()=>{
  const client=await createClient(),item=await createItem(100);
  assert.equal((await api('/api/orders','POST',orderBody(client,item,101))).status,400);
  const body=orderBody(client,item,60);body.items.push({...body.items[0]});
  assert.equal((await api('/api/orders','POST',body)).status,400);
  assert.equal((await api('/api/items')).data.items.find(i=>i.id===item.id).weightGrams,100);
});
test('Las ventas concurrentes no venden dos veces las mismas existencias',async()=>{
  const client=await createClient(),item=await createItem(100);
  const result=await Promise.all([api('/api/orders','POST',orderBody(client,item,80)),api('/api/orders','POST',orderBody(client,item,80))]);
  assert.deepEqual(result.map(r=>r.status).sort(),[201,400]);
  assert.equal((await api('/api/items')).data.items.find(i=>i.id===item.id).weightGrams,20);
});
test('Rechaza lotes inexistentes, pesos negativos, precios cero y crédito sin cupo',async()=>{
  const client=await createClient(0),item=await createItem();
  assert.equal((await api('/api/orders','POST',orderBody(client,item))).status,400);
  for(const [weight,price] of [[-1,200],[10,0],[0.001,200]]) assert.equal((await api('/api/orders','POST',orderBody(client,item,weight,price))).status,400);
  assert.equal((await api('/api/orders','POST',orderBody(client,{id:'inexistente'}))).status,400);
});
test('Calcula la liquidación en el servidor e impide pagos superiores a la venta',async()=>{
  const client=await createClient(),item=await createItem();const body=orderBody(client,item);
  body.paymentDetail={cash:3000};assert.equal((await api('/api/orders','POST',body)).status,400);
  body.paymentDetail={cash:100,creditAmount:0};assert.equal((await api('/api/orders','POST',body)).status,400);
  body.paymentDetail={cash:100,scrapGoldGrams:2,scrapGoldRate:50,scrapGoldAmount:999999};
  const r=await api('/api/orders','POST',body);assert.equal(r.status,201);assert.equal(r.data.order.paymentDetail.scrapGoldAmount,100);assert.equal(r.data.order.paymentDetail.creditAmount,1800);
});
test('Abonar no permite aumentar la deuda, abonar cero ni cobrar más de lo adeudado',async()=>{
  const client=await createClient(),item=await createItem();await api('/api/orders','POST',orderBody(client,item));
  for(const amount of [-1,0,2001,'NaN']) assert.equal((await api('/api/payments','POST',{type:'abono_cxc',entityId:client.id,amountPesos:amount})).status,400);
  const pay=await api('/api/payments','POST',{type:'abono_cxc',entityId:client.id,amountPesos:2000});assert.equal(pay.status,201);
  const orders=(await api('/api/orders')).data.orders;assert.equal(orders.find(o=>o.clientId===client.id).status,'Pagado');
});
test('El retal del despacho se registra una sola vez y aparece en inventario financiero',async()=>{
  const client=await createClient(),item=await createItem();const before=(await api('/api/balance-general')).data.activos.realizable.retalOro18kBoveda.grams;
  const body=orderBody(client,item);body.paymentDetail={cash:1500,scrapGoldGrams:10,scrapGoldRate:50};
  const r=await api('/api/orders','POST',body);assert.equal(r.status,201);assert.equal(r.data.client.currentDebtPesos,0);
  const balance=(await api('/api/balance-general')).data;assert.equal(balance.activos.realizable.retalOro18kBoveda.grams,before+10);
  assert.equal((await api('/api/payments')).data.payments.filter(p=>p.entityId===client.id).length,0);
});
test('Un abono mixto separa dinero de metal en el libro de caja',async()=>{
  const client=await createClient(),item=await createItem();await api('/api/orders','POST',orderBody(client,item));
  const result=await api('/api/payments','POST',{type:'abono_cxc',entityId:client.id,amountPesos:100,scrapGoldGrams:2,scrapGoldRate:50,paymentMethod:'Mixto (Efectivo + Oro)'});assert.equal(result.status,201);
  const ledger=(await api('/api/cuadre-caja')).data.items.filter(m=>m.sourceId===result.data.payment.id);
  assert.equal(ledger.length,2);assert.equal(ledger.find(m=>m.scrapGrams===0).amount,100);assert.equal(ledger.find(m=>m.scrapGrams===2).amount,100);
});
test('La recepción rechaza consumir metal que el taller no tiene',async()=>{
  const supplier=await createSupplier();assert.equal((await api('/api/puro/receive','POST',{supplierId:supplier.id,grams24kUsed:5,grams18kReceived:6,manoDeObraRate:10})).status,400);
  assert.equal((await api('/api/suppliers')).data.suppliers.find(s=>s.id===supplier.id).balanceDuePesos,0);
});
test('La mano de obra forma parte del pasivo y no se suma dos veces',async()=>{
  const supplier=await createSupplier();const before=(await api('/api/balance-general')).data.pasivos.total;
  const receipt=await api('/api/puro/receive','POST',{supplierId:supplier.id,grams18kReceived:10,grams24kUsed:0,manoDeObraRate:10});assert.equal(receipt.status,201);
  assert.equal((await api('/api/balance-general')).data.pasivos.total,before+100);
  const liabilities=(await api('/api/balance-general')).data.pasivos;assert.equal(liabilities.total,liabilities.proveedoresPesos+liabilities.manosDeObraTalleres);
  const payment=await api('/api/payments','POST',{type:'pago_cxp',entityId:supplier.id,amountPesos:100});assert.equal(payment.status,201);
  assert.equal((await api('/api/balance-general')).data.pasivos.total,before);
});
test('Los documentos históricos no quedan huérfanos al eliminar registros',async()=>{
  const client=await createClient(),item=await createItem();const body=orderBody(client,item);body.paymentType='Contado';await api('/api/orders','POST',body);
  assert.equal((await api('/api/clients/'+client.id,'DELETE',{})).status,400);
  assert.equal((await api('/api/items/'+item.id,'DELETE',{})).status,400);
  assert.equal((await api('/api/items/no-existe','DELETE',{})).status,404);
});
test('No convierte entradas de caja en gastos al usar otra ruta',async()=>{
  const movement=await api('/api/cash-movements','POST',{type:'ingreso',concept:'Aporte',amount:100,date:'2026-11-01'});assert.equal(movement.status,201);
  const id=movement.data.movement.id;
  assert.equal((await api('/api/gastos-operativos/'+id,'PUT',{amount:200})).status,400);
  assert.equal((await api('/api/gastos-operativos/'+id,'DELETE',{})).status,400);
});
test('Fechas y filtros usan Colombia y rechazan rangos invertidos',async()=>{
  assert.equal(dateKey('2026-11-04T02:00:00Z'),'2026-11-03');
  assert.equal((await api('/api/gastos-operativos?period=custom&startDate=2026-11-04&endDate=2026-11-01')).status,400);
  assert.equal((await api('/api/gastos-operativos','POST',{concept:'Fecha inválida',amount:100,date:'2026-02-31'})).status,400);
  assert.equal((await api('/api/gastos-operativos','POST',{concept:'Fecha inválida',amount:100,date:'2026-02-31T12:00:00Z'})).status,400);
});
test('Las rutas inexistentes devuelven JSON 404 y el JSON roto devuelve 400',async()=>{
  assert.equal((await api('/api/no-existe')).status,404);
  const broken=await fetch(base+'/api/items',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{'});assert.equal(broken.status,400);assert.equal((await broken.json()).success,false);
});
test('Los permisos solo aceptan valores booleanos',async()=>{
  assert.equal((await api('/api/roles','PUT',{roles:{comercial:{permissions:{inventario:{canEdit:'false'}}}}})).status,400);
});
test('Las categorías no pueden duplicar códigos ni cambiar los códigos base',async()=>{
  const cats=(await api('/api/categories')).data.categories;
  const national=cats.find(c=>c.slug==='nacional');
  assert.equal((await api('/api/categories/'+national.id,'PUT',{slug:'otro-codigo'})).status,400);
  const first=await api('/api/categories','POST',{name:'Categoría de prueba',slug:'prueba',badgeText:'Prueba'});assert.equal(first.status,201);
  const second=await api('/api/categories','POST',{name:'Otra categoría',slug:'otra',badgeText:'Otra'});assert.equal(second.status,201);
  assert.equal((await api('/api/categories/'+second.data.category.id,'PUT',{slug:first.data.category.slug})).status,400);
});
test('Reintentar un despacho con la misma clave no duplica venta ni existencias',async()=>{
  const client=await createClient(),item=await createItem();const body=orderBody(client,item);
  const key=crypto.randomUUID();
  const send=async payload=>{const response=await fetch(base+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key},body:JSON.stringify(payload)});return{status:response.status,data:await response.json()};};
  const first=await send(body),second=await send(body);assert.equal(first.status,201);assert.equal(second.status,200);assert.equal(first.data.order.id,second.data.order.id);
  assert.equal((await api('/api/items')).data.items.find(i=>i.id===item.id).weightGrams,90);
  assert.equal((await send({...body,notes:'Otra operación'})).status,409);
});
test('Reintentar un abono con la misma clave no cobra dos veces',async()=>{
  const client=await createClient(),item=await createItem();await api('/api/orders','POST',orderBody(client,item));
  const body={type:'abono_cxc',entityId:client.id,amountPesos:100},key=crypto.randomUUID();
  for(let i=0;i<2;i++){const res=await fetch(base+'/api/payments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key},body:JSON.stringify(body)});assert.equal(res.status,i?200:201);}
  assert.equal((await api('/api/clients')).data.clients.find(c=>c.id===client.id).currentDebtPesos,1900);
});
test('Un pago parcial actualiza el saldo de la remisión',async()=>{
  const client=await createClient(),item=await createItem();const order=await api('/api/orders','POST',orderBody(client,item));
  await api('/api/payments','POST',{type:'abono_cxc',entityId:client.id,amountPesos:500});
  const updated=(await api('/api/orders')).data.orders.find(o=>o.id===order.data.order.id);assert.equal(updated.outstandingAmount,1500);assert.equal(updated.status,'Parcial');
});
test('No permite un pago de retal a proveedor sin existencias suficientes',async()=>{
  const supplier=await createSupplier();await api('/api/puro/receive','POST',{supplierId:supplier.id,grams18kReceived:100,manoDeObraRate:100});
  assert.equal((await api('/api/payments','POST',{type:'pago_cxp',entityId:supplier.id,amountPesos:0,scrapGoldGrams:100,scrapGoldRate:50})).status,400);
});
test('La sesión persiste al reiniciar y cerrar sesión invalida el token',async()=>{
  const session=(await login('reader','Reader-2026!')).data.token;
  await stop();await start();
  assert.equal((await api('/api/auth/me','GET',undefined,session)).status,200);
  assert.equal((await api('/api/auth/logout','POST',{},session)).status,200);
  assert.equal((await api('/api/auth/me','GET',undefined,session)).status,401);
});
test('Cambiar contraseña invalida las sesiones antiguas',async()=>{
  const r=await api('/api/users/reader','PUT',{password:'NewReader-2026!'});assert.equal(r.status,200);
  assert.equal((await login('reader','Reader-2026!')).status,401);
  assert.equal((await login('reader','NewReader-2026!')).status,200);
});
