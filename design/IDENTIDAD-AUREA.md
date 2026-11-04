# Áurea Mayoristas

Identidad aplicada a la plataforma mayorista a partir del portafolio local de Áurea y sus capturas de producto.

## Dirección visual

- Verde profundo: `#163E35`.
- Dorado de marca: `#B79B68`; variante de texto accesible sobre marfil: `#826A3E`.
- Marfil: `#F5F5F0`; verde suave: `#EAF0E8`.
- Inter para operación y cifras; Cormorant Garamond para la marca y el acceso.
- Símbolo vectorial de gema, superficies limpias, bordes finos y acciones principales verdes.
- Modo oscuro con fondo `#121A17` y superficies `#1C2722`.

## Archivos principales

- `public/css/aurea.css`: tokens, componentes, acceso y adaptación móvil.
- `public/js/aurea.js`: menú móvil, indicador de sección y limpieza visual de etiquetas heredadas.
- `public/assets/aurea-symbol.svg`: símbolo y favicon.
- `public/index.html`: estructura, navegación y textos de marca.
- `public/js/app.js`: marca en documentos, exportaciones y mensajes; preferencia de tema.

Las claves de sesión anteriores se mantienen para conservar compatibilidad. La preferencia visual se guarda en `aurea_theme`, con lectura de la preferencia anterior cuando existe. No se cambiaron datos de negocio ni titulares de cuentas bancarias.

## Verificación

- Comprobación de sintaxis de `app.js`, `aurea.js` y `server.js`.
- Inicio de sesión en una copia temporal de los datos, sin conexión a MongoDB.
- Navegación de los 15 módulos en escritorio y a 390 px, sin desbordamiento horizontal de página tras los ajustes.
- Revisión visual del acceso, panel, inventario, cartera, formulario de lotes, modo oscuro y vista imprimible del balance.
- Sin errores de consola durante estas comprobaciones.
- Corregido un cierre de función faltante en `setupNavigation` que impedía cargar el controlador.

No se ejecutaron transacciones contra los datos originales ni se verificó la impresión física. Las fuentes web tienen fuentes de reserva locales.

## Ejecutar

Desde la carpeta del proyecto: `npm start`. El puerto predeterminado es 3500.

## Refinamiento de sobriedad

Se retiraron emojis, luces, pulsos, brillos, sombras decorativas y adornos de los indicadores. Las acciones que antes solo tenían un emoji ahora muestran texto. Las etiquetas heredadas de la API se limpian al mostrarse sin modificar registros ni valores de formularios. Se verificaron panel, inventario, cartera, pagos, balance, gastos y usuarios sin emojis ni botones vacíos y sin errores de consola. El control Mostrar/Ocultar contraseña también fue comprobado.
