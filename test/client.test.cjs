const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const safe=require('../public/js/safe');
const {periodBounds,filterPeriod}=require('../lib/domain');
function client() {
  const nodes=new Map(),alerts=[];
  function element(id){if(!nodes.has(id))nodes.set(id,{id,value:'',innerHTML:'',innerText:'',textContent:'',style:{},inert:false,classList:{add(){},remove(){},toggle(){}},setAttribute(){},getAttribute(){return null;},addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;}});return nodes.get(id);}
  const storage={getItem(){return null;},setItem(){},removeItem(){}};
  const context={console,Intl,URL,Headers,Response,Promise,Date,Number,Math,Map,Set,JSON,Array,String,Boolean,parseFloat,parseInt,isNaN,localStorage:storage,sessionStorage:storage,AureaSafe:safe,alert:message=>alerts.push(message),confirm:()=>true,setTimeout,clearTimeout,document:{readyState:'loading',addEventListener(){},getElementById:element,querySelector:element,querySelectorAll(){return[];}}};
  context.window={fetch:async()=>new Response('{}',{status:200}),dispatchEvent(){},crypto:require('node:crypto').webcrypto};context.CustomEvent=class{};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/balanza.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8'),context);
  const app=context.window.App;app.currentUser={role:'superadmin'};
  return {app,scale:context.window.digitalScale,element,nodes,alerts,context};
}
test('La balanza conserva una tarifa cero y no inventa cotizaciones',()=>{
  const {scale}=client();scale.setAverages({promedioNacional:0});assert.equal(scale.getDetailsForCategory().costPerGram,0);assert.equal(scale.getDetailsForCategory().saleRate,0);
  scale.setCustomSaleRate(0);assert.equal(scale.getDetailsForCategory().saleRate,0);
});
test('La balanza rechaza NaN e infinito y suma pesos numéricos',()=>{
  const {scale}=client();scale.setWeight(10);scale.setWeight(NaN);scale.addWeight(Infinity);assert.equal(scale.currentGrams,10);scale.addWeight('5');assert.equal(scale.currentGrams,15);
});
test('El porcentaje de margen se calcula sobre la venta y muestra bien las pérdidas',()=>{
  const {scale,element}=client();scale.setAverages({promedioNacional:100});scale.setCustomSaleRate(200);scale.setWeight(10);assert.equal(element('scale-margin-display').innerText,'+$1.000 (50.0%)');
  scale.setCustomSaleRate(50);assert.equal(element('scale-margin-display').innerText,'-$500 (-100.0%)');
});
test('El carrito no sobrevende y conserva precios distintos para un mismo lote',()=>{
  const {app,alerts}=client();app.items=[{id:'lot',weightGrams:10,costPerGram:100,name:'Lote'}];app.renderDispatchTable=()=>{};
  app.addItemToDispatch(app.items[0],5,200);app.addItemToDispatch(app.items[0],2,300);assert.equal(app.dispatchCart.length,2);assert.equal(app.dispatchCart[0].pricePerGram,200);
  app.addItemToDispatch(app.items[0],4,300);assert.equal(app.dispatchCart.reduce((sum,r)=>sum+r.weightGrams,0),7);assert.equal(alerts.length,1);
  app.updateCartRow(1,9,null);assert.equal(app.dispatchCart[1].weightGrams,2);
});
test('La API del cliente adjunta el token a todas las operaciones',async()=>{
  const {app,context}=client();app.authToken='test-token';let headers;context.window.fetch=async(url,options)=>{headers=options.headers;return new Response('{}');};
  await app.apiFetch('/api/items',{method:'POST',body:'{}'});assert.equal(headers.get('Authorization'),'Bearer test-token');
});
test('La interfaz no consulta datasets prohibidos para el rol',async()=>{
  const {app,context}=client();app.currentUser={role:'auditor'};app.currentPermissions={};let calls=0;context.window.fetch=async()=>{calls++;return new Response('{}');};
  await app.apiFetch('/api/suppliers');assert.equal(calls,0);
});
test('No intenta consultar información de negocio antes del acceso',async()=>{
  const {app}=client();app.currentUser=null;app.initTheme=()=>{};app.setupNavigation=()=>{};app.setupEventListeners=()=>{};app.initAuthSession=async()=>{};let loaded=false;app.refreshAllData=async()=>{loaded=true;};await app.init();assert.equal(loaded,false);
});
test('Un rol no puede navegar a un módulo sin permiso',()=>{
  const {app}=client();app.currentUser={role:'comercial'};app.currentPermissions={};app.switchView('usuarios');assert.equal(app.currentView,'dashboard');
});
test('Nombres maliciosos se muestran como texto en el directorio',()=>{
  const {app,nodes}=client();const name='<img src=x onerror="alert(1)">';app.clients=[{id:'client-safe-id',name,tradeName:name,documentNumber:'1',phone:'123',city:'Ciudad',riskLevel:'A',creditLimitPesos:0}];
  app.renderJoyerias();const html=[...nodes.values()].map(el=>el.innerHTML).join('');assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
});
test('El historial no descuenta el retal del despacho como un segundo abono',()=>{
  const {app}=client();app.clients=[{id:'c'}];app.orders=[{id:'o',clientId:'c',date:'2026-11-01',paymentDetail:{creditAmount:100},totalAmount:200,totalGrams:1}];app.payments=[{type:'abono_cxc',entityId:'c',reference:'RETAL-DESPACHO-REM-2026-101',date:'2026-11-01',amountPesos:100,scrapGoldGrams:2}];
  assert.equal(app.getClientLedger('c').length,1);assert.equal(app.getClientLedger('c')[0].runningBalance,100);
});
test('CSV conserva delimitadores, comillas y neutraliza fórmulas',()=>{
  assert.equal(safe.csvCell('A;B "C"'),'"A;B ""C"""');assert.equal(safe.csvCell('=1+1'),'"\'=1+1"');assert.equal(safe.csvCell(-20),'-20');assert.equal(safe.escapeHtml(0),'0');
});
test('Los periodos incluyen siete días y respetan el mes de Colombia',()=>{
  const now=new Date('2026-03-01T02:00:00Z');assert.deepEqual(periodBounds('mes',undefined,undefined,now),['2026-02-01','2026-02-28']);assert.deepEqual(periodBounds('mes_anterior',undefined,undefined,now),['2026-01-01','2026-01-31']);
  const rows=[{date:'2026-02-21'},{date:'2026-02-22'},{date:'2026-02-28'},{date:'2026-03-01'}];assert.equal(filterPeriod(rows,'semana',undefined,undefined,now).length,2);assert.equal(safe.dateKey('2026-03-01T02:00:00Z'),'2026-02-28');
});
test('Un reintento tras fallo de red conserva la clave de la operación',async()=>{
  const {app,context}=client();const keys=[];let first=true;
  context.window.fetch=async(url,options)=>{keys.push(options.headers.get('Idempotency-Key'));if(first){first=false;throw Error('Conexión interrumpida');}return new Response('{"success":true}');};
  await assert.rejects(app.apiFetch('/api/orders',{method:'POST',body:'{}'}));await app.apiFetch('/api/orders',{method:'POST',body:'{}'});assert.equal(keys[0],keys[1]);assert.equal(app.requestIds.size,0);
});
test('Cambiar de sesión elimina los datos del usuario anterior',()=>{
  const {app}=client();app.clients=[{name:'Privado'}];app.suppliers=[{name:'Privado'}];app.usersList=[{username:'Privado'}];app.clearSessionData();assert.equal(app.clients.length,0);assert.equal(app.suppliers.length,0);assert.equal(app.usersList.length,0);
});
test('El despacho utiliza la tarifa de retal configurada',()=>{
  const {app,element}=client();app.rates={retal_oro18k_compra:50};app.renderDispatchTable=()=>{};app.renderDespacho();assert.equal(element('pay-scrap-rate').value,50);
});

test('El gramaje manual sincroniza entradas y descarta valores no finitos',()=>{
  const {scale,element}=client();
  element('scale-lcd-digits').tagName='INPUT';
  scale.setManualWeight('18.456');
  assert.equal(scale.currentGrams,18.46);
  assert.equal(element('scale-lcd-digits').value,'18.46');
  assert.equal(element('scale-manual-grams-input').value,18.46);
  assert.equal(element('scale-panel-grams-input').value,18.46);
  scale.setManualWeight('Infinity');assert.equal(scale.currentGrams,0);
  scale.setManualWeight('-2');assert.equal(scale.currentGrams,0);
});
