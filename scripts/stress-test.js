const http = require('http');

const BASE_URL = 'http://localhost:3500';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOpts = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runStressTests() {
  console.log('🚀 INICIANDO AUDITORÍA & STRESS TEST ADVERSARIAL DE NEXUS POR MAYOR...\n');

  // TEST 1: Stats & Rates
  console.log('📌 Test 1: Stats & Executive Averages');
  const statsRes = await request('/api/stats');
  assert(statsRes.status === 200 && statsRes.data.success, 'GET /api/stats responde HTTP 200 con success: true');
  assert(typeof statsRes.data.stats.averages.promedioItaliano === 'number' && !isNaN(statsRes.data.stats.averages.promedioItaliano), 'Promedio Italiano es número válido y no NaN');
  assert(typeof statsRes.data.stats.averages.promedioNacional === 'number' && !isNaN(statsRes.data.stats.averages.promedioNacional), 'Promedio Nacional es número válido y no NaN');
  assert(typeof statsRes.data.stats.averages.promedioPuro24k === 'number' && !isNaN(statsRes.data.stats.averages.promedioPuro24k), 'Promedio Puro 24K es número válido y no NaN');

  // TEST 2: Rates Adversarial NaN Injection
  console.log('\n📌 Test 2: Inyección Adversarial en /api/rates');
  const rateAttack = await request('/api/rates', {
    method: 'POST',
    body: {
      promedioPuro24k: "INJECTION_INVALID",
      promedioItaliano: -5000,
      retal_oro18k_compra: "NaN"
    }
  });
  assert(rateAttack.status === 200, 'POST /api/rates maneja inputs maliciosos sin colapsar');
  const ratesVerify = await request('/api/rates');
  assert(!isNaN(ratesVerify.data.rates.promedioPuro24k) && ratesVerify.data.rates.promedioPuro24k > 0, 'Tasas resisten inyección y mantienen valores válidos');

  // TEST 3: Deletion Protection on Debtors
  console.log('\n📌 Test 3: Protección de Integridad Contable en Clientes');
  const clientsRes = await request('/api/clients');
  const clientWithDebt = clientsRes.data.clients.find(c => Number(c.currentDebtPesos) > 0);
  if (clientWithDebt) {
    const deleteAttempt = await request(`/api/clients/${clientWithDebt.id}`, { method: 'DELETE' });
    assert(deleteAttempt.status === 400 && deleteAttempt.data.success === false, `Bloqueada eliminación de cliente "${clientWithDebt.name}" con deuda activa (HTTP 400)`);
  }

  // TEST 4: Deletion Protection on Active Suppliers
  console.log('\n📌 Test 4: Protección de Integridad Contable en Proveedores & Talleres');
  const supRes = await request('/api/suppliers');
  const supWithHoldings = supRes.data.suppliers.find(s => Number(s.puroInHandsGrams) > 0 || Number(s.balanceDuePesos) > 0);
  if (supWithHoldings) {
    const deleteSupAttempt = await request(`/api/suppliers/${supWithHoldings.id}`, { method: 'DELETE' });
    assert(deleteSupAttempt.status === 400 && deleteSupAttempt.data.success === false, `Bloqueada eliminación de taller "${supWithHoldings.name}" con metal o saldo en poder (HTTP 400)`);
  }

  // TEST 5: System Payment Method Protection
  console.log('\n📌 Test 5: Protección de Métodos de Pago Base del Sistema');
  const deleteBasePm = await request('/api/payment-methods/pm-efectivo-caja-boveda', { method: 'DELETE' });
  assert(deleteBasePm.status === 400 && deleteBasePm.data.success === false, 'Bloqueada eliminación de método base "Efectivo Caja Bóveda" (HTTP 400)');

  // TEST 6: Tamper-resistance on PUT /api/items
  console.log('\n📌 Test 6: Inviolabilidad de ID y Sanitización Numérica en PUT');
  const itemsRes = await request('/api/items');
  if (itemsRes.data.items.length > 0) {
    const testItem = itemsRes.data.items[0];
    const putItem = await request(`/api/items/${testItem.id}`, {
      method: 'PUT',
      body: {
        id: 'HACKED_ID',
        weightGrams: -999,
        costPerGram: "NOT_A_NUMBER"
      }
    });
    assert(putItem.status === 200, 'PUT responde con éxito');
    assert(putItem.data.item.id === testItem.id, 'ID del item se mantiene inalterado frente a intentos de sobreescritura');
    assert(putItem.data.item.weightGrams >= 0, 'Gramaje negativo sanitizado a valor no negativo');
  }

  // TEST 7: Balance General Fundamental Equation
  console.log('\n📌 Test 7: Cuadre y Ratios del Balance General Patrimonial');
  const bgRes = await request('/api/balance-general');
  assert(bgRes.status === 200 && bgRes.data.success, 'GET /api/balance-general responde HTTP 200');
  
  const bg = bgRes.data;
  const activos = bg.activos.total;
  const pasivos = bg.pasivos.total;
  const patrimonio = bg.patrimonio.netWorth;

  const diffEquation = Math.abs(activos - (pasivos + patrimonio));
  assert(diffEquation < 1, `Ecuación Contable Perfecta: Activos ($${activos.toLocaleString('es-CO')}) = Pasivos ($${pasivos.toLocaleString('es-CO')}) + Patrimonio ($${patrimonio.toLocaleString('es-CO')}) | Diferencia: $${diffEquation}`);
  
  assert(!isNaN(bg.ratios.solvencyRatio) && bg.ratios.solvencyRatio >= 0, `Ratio de Solvencia válido: ${bg.ratios.solvencyRatio}x`);
  assert(!isNaN(bg.ratios.acidTestRatio) && bg.ratios.acidTestRatio >= 0, `Prueba Ácida válida: ${bg.ratios.acidTestRatio}x`);
  assert(!isNaN(bg.patrimonio.accumulatedProfitMargin), `Utilidad acumulada por despachos no es NaN: $${bg.patrimonio.accumulatedProfitMargin.toLocaleString('es-CO')}`);

  // TEST 8: Cuadre de Caja Arithmetic
  console.log('\n📌 Test 8: Cuadre de Caja y Arqueo de Fondos');
  const cajaRes = await request('/api/cuadre-caja');
  assert(cajaRes.status === 200 && cajaRes.data.success, 'GET /api/cuadre-caja responde HTTP 200');
  const metrics = cajaRes.data.summary;
  const expectedNet = metrics.totalInflows - metrics.totalOutflows;
  assert(metrics.netCashFlow === expectedNet, `Arqueo Cuadrado: Ingresos ($${metrics.totalInflows.toLocaleString('es-CO')}) - Egresos ($${metrics.totalOutflows.toLocaleString('es-CO')}) = Flujo Neto ($${metrics.netCashFlow.toLocaleString('es-CO')})`);

  console.log('\n======================================================');
  console.log(`🏁 RESULTADOS: ${passed} PRUEBAS EXITOSAS | ${failed} FALLOS`);
  console.log('======================================================');

  if (failed === 0) {
    console.log('🎉 ¡SISTEMA 100% BLINDADO Y LISTO PARA PRODUCCIÓN!');
  }
}

runStressTests().catch(err => {
  console.error('Error fatal durante stress test:', err);
  process.exit(1);
});
