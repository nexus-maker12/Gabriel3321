# 💎 Nexus por Mayor - Plataforma Mayorista de Joyería por Gramo

**Nexus por Mayor** es una solución especializada de alta gama diseñada con las reglas exactas del gremio de **joyería al por mayor**:
1. **Netamente por gramaje**: Eliminado el conteo de piezas en lote; cada movimiento se audita en peso real (`g`).
2. **Sin precios rígidos de venta**: En inventario no existe precio de venta fijo. El precio por gramo se pacta en caliente con el cliente al momento de pesar y despachar.
3. **Promedios Ponderados Matemáticos**:
   - **Promedio Costo Oro Puro 24K** (calculado por cada compra de granalla o lingotes).
   - **Promedio Nacional 18K** (calculado en vivo según el stock en bóveda).
   - **Promedio Italiano 18K** (calculado en vivo según el stock en bóveda).
4. **Manos de Obra para Proveedores & Talleres**: Tarifa de mano de obra por gramo (`$/g`) y control del saldo pendiente por mano de obra.
5. **Entregas de Puro 24K y Recepción de Joyería Terminada**: Auditoría de metal puro en poder de terceros y liquidación de maquila.
6. **Cartera CxC con Abono en Retal / Oro Chatarra**: El cliente puede pagar o abonar entregando oro chatarra (`Gramos × Tasa de Compra`).

---

## 🚀 Acceso Rápido

El servidor se encuentra activo en tu equipo:
👉 **`http://localhost:3500`**

Para iniciar manualmente en el futuro:
```bash
cd C:\Users\Usuario\.gemini\antigravity-ide\scratch\nexus-por-mayor
npm start
```

---

## 📊 Arquitectura & Módulos

- **`Bóveda & Dashboard`**: Ticker en vivo con los promedios de Puro 24K, Nacional e Italiano 18K, stock total y balanza interactiva.
- **`Oro Puro 24K & Maquila`**: Compras de fino 999.9, entregas de metal a talleres y recepción de lotes terminados con mano de obra integrada.
- **`Inventario por Gramo`**: Lotes segmentados entre 🇮🇹 Italiano y 🇨🇴 Nacional con su costo base/g y comparador contra la media.
- **`Despacho & Balanza`**: Registro de pesadas, definición del precio acordado /g, cálculo del margen en vivo y remisión oficial imprimible.
- **`Cartera CxC`**: Cuentas por cobrar en pesos y su equivalente en gramos de oro 18K.
- **`Proveedores & CxP`**: Saldos de mano de obra, deudas en dinero y oro puro en poder de cada taller.
