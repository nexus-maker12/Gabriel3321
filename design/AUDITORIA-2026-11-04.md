# Revisión de errores — Áurea Mayoristas

Fecha: 4 de noviembre de 2026.

Se revisaron servidor, interfaz, cálculos financieros, persistencia y sesiones. Se conservaron los cambios de marca y los cambios locales previos. Las pruebas automatizadas utilizan servidores y archivos temporales; no utilizan la base real ni el puerto 3500.

## Errores corregidos

### Despachos e inventario

1. La API permitía vender más peso que el disponible y simplemente dejaba las existencias en cero. Ahora rechaza el despacho completo antes de descontar inventario.
2. Las líneas repetidas podían superar el stock acumulado del mismo lote. Ahora se valida el peso agregado.
3. Se aceptaban lotes inexistentes, pesos negativos, cantidades que redondeaban a cero y precios inválidos.
4. Dos ventas simultáneas podían trabajar sobre el mismo estado. Las solicitudes se serializan en el proceso y cada operación trabaja sobre una copia aislada. Una desconexión del cliente no libera la cola mientras el manejador sigue trabajando.
5. La liquidación confiaba en importes de retal y crédito enviados por el navegador. Ahora se calculan en el servidor a partir del peso, tarifa y pagos.
6. Se aceptaban pagos superiores al valor de la venta y crédito superior al cupo del cliente.
7. El cupo cero se reemplazaba por un cupo predeterminado. Se conserva el cero tanto en el servidor como en el formulario.
8. Reintentar una petición podía duplicar despachos o abonos. Se incorporaron claves de idempotencia, comprobación del contenido y recuperación tras fallos de red.
9. Agregar nuevamente un lote con un precio distinto cambiaba el precio de los gramos agregados anteriormente. Ahora conserva líneas con precios distintos y valida su peso conjunto.
10. La edición del carrito admitía pesos inválidos o superiores a las existencias. Se comprueba antes de actualizar la línea.
11. La numeración de remisiones utilizaba un año fijo. Ahora utiliza el año de Colombia y la secuencia existente.
12. Las categorías podían duplicar sus códigos o renombrar los códigos base utilizados por los promedios. Se protegen `nacional` e `italiano` y se comprueban duplicados.
13. Los códigos de lote duplicados se validan en altas y ediciones.

### Cartera, pagos y metales

14. Se admitían abonos negativos, cero o superiores a la deuda, con resultados incoherentes en caja y cartera.
15. El retal recibido al despachar se registraba también como abono posterior, provocando un segundo descuento aparente en el historial. Ahora pertenece a la liquidación del despacho y los registros históricos con esa referencia se excluyen de los abonos posteriores.
16. Un abono mixto podía contabilizarse enteramente como dinero. El libro separa su parte monetaria y su parte de metal.
17. El retal del balance se consultaba con un nombre de campo distinto al guardado. Su existencia ahora incluye despachos y abonos, excluye duplicados y descuenta pagos de metal a proveedores.
18. Se permitía pagar con retal a proveedores sin comprobar el metal disponible.
19. La mano de obra se sumaba dos veces en el pasivo: estaba incluida en el saldo del proveedor y se agregaba nuevamente. El pasivo y sus componentes ahora utilizan una misma interpretación.
20. La recepción permitía consumir más puro que el entregado al taller. Ahora rechaza ese movimiento.
21. Pagar un despacho no actualizaba su estado ni su saldo pendiente. Ahora se actualizan los saldos de las remisiones del cliente.
22. Las ediciones generales podían sobrescribir saldos, identificadores y otros campos internos. Se utilizan listas explícitas de campos editables.
23. Se podían eliminar clientes, proveedores o lotes dejando documentos sin referencia. Se protegen los registros con historial y se devuelve 404 para lotes inexistentes.
24. Las rutas de gastos podían convertir o eliminar un movimiento de ingreso. Ahora comprueban que se trate de un egreso.

### Acceso y manejo de datos

25. Muchos endpoints funcionaban sin autenticación y los permisos dependían de la pantalla. Ahora se comprueban sesión y acción en el servidor.
26. Un administrador podía intentar modificar al propietario o concederse permisos mediante la API. Estas operaciones se restringen al propietario.
27. Existía un acceso alternativo mediante contraseñas universales. Se eliminó; se verifica la contraseña registrada de cada cuenta.
28. El cierre de sesión no invalidaba realmente los tokens firmados. Los nuevos tokens aleatorios tienen registros persistentes, expiración e invalidación al cerrar sesión.
29. Los cambios de contraseña no invalidaban sesiones anteriores. Ahora se revocan.
30. Se admitían correos duplicados y permisos con valores que no eran booleanos. Se validan ambas entradas.
31. Los hashes de contraseña utilizaban un coste bajo y comparación directa. Las nuevas contraseñas usan PBKDF2 con 210.000 iteraciones y comparación de tiempo constante; las cuentas antiguas se actualizan al iniciar sesión correctamente.
32. Se incorporó un límite de intentos de acceso y se retiró la credencial MongoDB incrustada en el código. La configuración utiliza variables de entorno.
33. Números no finitos, objetos en campos de texto, filtros en forma de listas, fechas imposibles y estructuras de solicitud inválidas podían causar errores o datos incoherentes. Se validan antes de procesar la operación.
34. Express 4 no capturaba automáticamente los rechazos de varios manejadores asíncronos. Se añadieron manejadores que propagan los errores a la respuesta HTTP.
35. Una base local corrupta podía convertirse silenciosamente en una base vacía. Ahora se conserva el archivo y se informa el error.
36. Una escritura fallida podía devolver éxito. La escritura local se realiza mediante archivo temporal y sustitución atómica; los fallos se propagan.
37. Se evitó que cada solicitud iniciara conexiones MongoDB simultáneas o reintentos inmediatos. Una indisponibilidad de MongoDB configurado bloquea las operaciones remotas en vez de continuar escribiendo sobre una copia local potencialmente desactualizada.
38. Las rutas API inexistentes devolvían el HTML de la aplicación. Ahora devuelven JSON con estado 404.

### Interfaz, fechas y documentos

39. El cliente intentaba cargar datos antes del acceso y muchas solicitudes no enviaban el token. Se corrigieron el orden de inicio y el envío de credenciales.
40. Al cambiar de usuario podían permanecer conjuntos de datos de la sesión anterior. Se limpian en los cambios de sesión.
41. Guardar una joyería llamaba a un método inexistente. Se sustituyó por la actualización del selector de despacho.
42. Se eliminaron definiciones duplicadas de métodos que ocultaban validaciones anteriores.
43. La balanza reemplazaba tasas cero por precios fijos, admitía valores no finitos y podía concatenar pesos de texto. Ahora conserva cero y valida los números.
44. El porcentaje presentado como margen bruto se calculaba sobre el costo. Ahora utiliza el valor de venta y presenta correctamente las pérdidas.
45. El formulario de despacho tenía una tarifa fija de retal. Ahora toma la configurada y la etiqueta distingue tarifa de compra de mano de obra.
46. Fechas cercanas a medianoche y periodos dependían de la zona horaria del servidor. Se utilizan días de Colombia; semana, mes anterior y rangos personalizados se filtran por fechas coherentes.
47. El promedio diario asumía meses de 30 días y el indicador de gastos frente a ventas utilizaba ventas fuera del periodo. Ambos cálculos se ajustaron al rango consultado.
48. Se escaparon campos de texto insertados en HTML para evitar que nombres o notas se interpretaran como etiquetas. Se comprobó en navegador un nombre con etiquetas literales.
49. Los CSV podían romper columnas por delimitadores y comillas o interpretar texto como fórmulas. Se añadieron campos correctamente entrecomillados y protección de fórmulas.
50. Los reportes contenían NIT, ciudades, PBX, números de tarjeta profesional y una cuenta bancaria escritos como datos fijos de ejemplo. Se retiraron esos datos y las instrucciones de transferencia consultan los métodos configurados.
51. Los modales cerrados seguían disponibles para la navegación asistida. Ahora se ocultan y el contenido principal queda inactivo durante el acceso.

## Verificación

- **45 pruebas automatizadas aprobadas, 0 fallos.**
- Navegación por los 15 módulos con registros de prueba: sin errores de consola.
- Creación de un cliente desde la interfaz, preservando cupo cero y texto con etiquetas literales.
- Carrito de despacho: 5 g a $200/g y 2 g a $300/g conservan dos líneas y totalizan $1.600.
- Revisión a 390 px de despacho y cartera sin desbordamiento horizontal de página.
- Errores de lectura y escritura simulados sobre archivos desechables.
- Comprobación del hash del archivo de negocio antes y después de las pruebas: sin cambios.
- Arranque de la aplicación real en el puerto 3500: página HTTP 200 y consulta API sin sesión HTTP 401.

Ejecutar nuevamente:

```powershell
node scripts/stress-test.js
```

También está disponible `npm test` cuando npm está instalado. El script anterior de estrés que apuntaba a la base real fue sustituido por la suite aislada.

## Archivos principales

- `lib/domain.js`: validación y transacciones de despachos/abonos, saldos y fechas.
- `lib/security.js`: validación de entradas y autorización de la API.
- `server.js`: persistencia, integración, sesiones y cálculos consolidados.
- `models/Session.js`: sesiones persistentes sin guardar el token de acceso en claro.
- `public/js/safe.js`: escape de HTML, exportaciones CSV y fechas del cliente.
- `public/js/app.js`, `public/js/balanza.js`: comportamiento de la interfaz.
- `test/`: pruebas de servidor, cliente y persistencia.

## Alcance y límites

Las transacciones de prueba se ejecutaron con almacenamiento local temporal. No se efectuaron ventas, pagos ni cambios de contraseña contra los registros reales. La conexión real se comprobó al arrancar, pero no se probaron escrituras de negocio en MongoDB.

La concurrencia automatizada cubre un proceso Node. Un despliegue con varias instancias y escrituras simultáneas requiere validar transacciones o coordinación entre instancias en MongoDB. No se certifican impresión física, dispositivos de pesaje ni servicios externos.

No se reescribieron documentos históricos para reconstruir saldos pasados. Se corrigió el cálculo y el procesamiento; una conciliación histórica requiere contrastar los comprobantes originales.

La contraseña de MongoDB que estaba incrustada en el código debe renovarse con el proveedor: eliminarla del archivo no invalida la credencial existente.

La primera cuenta de una instalación vacía requiere `INITIAL_ADMIN_PASSWORD` con al menos ocho caracteres. Las cuentas existentes conservan su contraseña registrada. Las sesiones anteriores deben volver a iniciarse.
