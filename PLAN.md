# SANTO — Inventario

Instrucciones para Claude Code. Leer completo antes de escribir código. El diseño visual está en `DESIGN.md`; en lo visual, si algo de este plan choca con DESIGN.md, gana DESIGN.md.

## Objetivo

Web app interna para el equipo de SANTO (Mercado San Martín, Lima). **Es solo inventario: no maneja costos, precios ni caja.** Todo gira alrededor del inventario:

- **Producción**: se anota lo que entra o se compra → **suma** al inventario.
- **Ventas**: se anota lo que sale (panes y bebidas) → **descuenta** del inventario. Cada pan descuenta lo que lleva su receta; cada bebida se descuenta sola.
- **Recetas**: lo que lleva cada pan (ingredientes del inventario y cuántas porciones/unidades).
- **Alertas**: avisa cuando algo baja del mínimo.

Se usa sobre todo desde el celular, en cocina, con las manos ocupadas: botones grandes, pocos toques, teclado numérico para cantidades, nada de tablas anchas.

## Arquitectura

- **Frontend**: sitio estático (HTML + CSS + JS vanilla, sin build ni frameworks) en GitHub Pages.
- **Backend**: Google Apps Script publicado como aplicación web, que lee y escribe en un Google Sheet.
- **Notificaciones**: bot de Telegram, enviado desde el Apps Script.

```
/
├── index.html
├── css/styles.css
├── js/config.js            ← URL del Apps Script (lo único que se edita al configurar)
├── js/api.js               ← todas las llamadas al backend (+ modo demo en memoria)
├── js/app.js               ← navegación y vistas
├── assets/ilustraciones/   ← SVG de las píldoras del menú
├── js/demo.js              ← modo demo: imita Sheets para correr Code.gs en el navegador
├── apps-script/Code.gs
├── apps-script/Semilla.gs  ← datos iniciales (salen de RECETAS.md)
├── apps-script/appsscript.json
├── DESIGN.md
├── PLAN.md
├── RECETAS.md              ← ficha de gramajes y datos iniciales
└── README.md               ← instalación paso a paso, en lenguaje simple
```

### Reglas técnicas

- **Llamadas**: `fetch` con `POST` y `Content-Type: text/plain;charset=utf-8`, con el JSON en el body (evita el preflight de CORS). Un solo `doPost` con un campo `action`.
- **Una llamada por pantalla**: Apps Script tarda entre 1 y 3 segundos por llamada. Cada pantalla trae todo de una vez (`cargarInventario`, `cargarRecetas`, `cargarVentas(fecha)`). Mientras carga, se muestra un esqueleto.
- **Bloqueo**: toda escritura va dentro de `LockService.getScriptLock()`.
- **PIN**: en Script Properties (`PIN`). El frontend lo pide una vez junto con el nombre de quien registra, lo guarda en localStorage y lo manda en cada request. Es una protección básica.
- **Secretos**: PIN, token de Telegram y chat_id van solo en Script Properties. El repo es público.
- **Fechas**: en el Sheet se guardan como texto `yyyy-MM-dd` (columnas en formato texto plano); horas como `HH:mm`. Al leer, si Sheets convirtió algo en fecha, se vuelve a texto en hora de Lima.
- **Zona horaria**: `America/Lima` en el Sheet y en `appsscript.json`.
- **Unidades**: todo se guarda en **g**, salvo panes, huevo y bebidas, que van en **unidades**. Si una casilla tiene `porcion_g`, la app la muestra y la pide en porciones ("7 porc." con "980 g" en pequeño), pero guarda gramos. Las recetas se escriben en la unidad de la casilla (g o unidades), igual que la ficha.
- **Modo demo**: sin URL en config.js, la app carga `js/demo.js`, `Code.gs` y `Semilla.gs` y corre el mismo backend en el navegador. No hay datos de demo aparte.
- **Stock**: `stock_actual` nunca se escribe a mano; es la suma de los Movimientos de esa casilla y se recalcula en el backend después de cada cambio.
- **Errores**: claros ("No se pudo guardar. Revisa tu conexión y vuelve a intentar."). Si falla un guardado, no se limpia lo escrito.
- **Datos reales**: no mostrar datos ni alertas inventadas. El modo demo arranca con los mismos datos que `setup()`.
- **Pantalla**: mobile first. Probar en 360px de ancho.

## Hojas del Google Sheet

**Insumos** (las casillas del inventario: proteínas, salsas, complementos, panes, verduras, bebidas…)
`id, nombre, categoria, tipo, unidad_base, porcion_g, stock_actual, stock_minimo, proveedor, activo`
- `categoria`: grupo para mostrar (Proteínas, Salsas, Complementos, Panes, Verduras, Lácteos, Fiambres, Secos, Congelados, Bebidas, Solo producción).
- `tipo`: `ingrediente` (va en las recetas) o `bebida` (se vende sola y aparece en Ventas).
- `porcion_g`: gramos por porción; vacío si se cuenta en g o unidades sin porción.

**Movimientos** (todo cambio de stock)
`id, fecha, hora, insumo_id, tipo (entrada | salida | merma | ajuste | venta), cantidad, origen, nota, usuario`
- `entrada` suma; `salida`, `merma` y `venta` restan; `ajuste` lleva su signo (+ o −).
- `origen` vale `manual`, o `venta:yyyy-MM-dd` cuando lo generó el registro de ventas de ese día.

**Recetas** (todo lo que se vende con receta: sándwiches y porciones de papas)
`id, nombre, grupo (cultos | criollos | papas), estado (vigente | provisional | sin_ficha), activa, notas`

**RecetaIngredientes** (lo que lleva UN pan)
`receta_id, insumo_id, cantidad`

**VentasDia** (lo vendido por día)
`fecha, item_tipo (receta | insumo), item_id, cantidad, actualizado_por, actualizado_en`

`setup()` crea las hojas con sus encabezados y pone en texto las columnas de fecha, hora e ids. Si una hoja tiene datos con columnas de una versión anterior, se detiene y pide borrarla (para no correr columnas). Después llama a `cargarSemilla()` (Semilla.gs), que agrega lo que falta comparando por id, sin duplicar ni pisar lo que cocina cambió:
- las casillas de **RECETAS.md**: 8 proteínas, 9 salsas, 7 complementos, 14 insumos que se descuentan y 38 insumos solo de producción, todas con stock 0 y sin mínimo (cocina los define);
- las bebidas **Chicha** (stock 2) y **Maracuyá** (stock 6), con mínimo 3; el stock inicial entra como un movimiento de ajuste;
- las recetas de RECETAS.md con sus gramajes (El Artesano con S; El Bravo en dos líneas, picante y sin picante; Choripán vegano y Kids sin ficha; Pollo deshilachado provisional);
- en Papas: un solo producto **Papas** (200 g) y el **combo papas + bebida** en dos líneas, "Combo papas + Chicha" y "Combo papas + Maracuyá" (200 g de papas + 1 bebida). Las recetas viejas "Papas 200 g" y "Papas 150 g" se desactivan (`SEMILLA.retiradas`).

Los supuestos S1–S7 de RECETAS.md se cargan tal cual y se corrigen desde la app si cocina dice otra cosa.

## Pantallas

### Hoy (inicio)

Arriba, 4 píldoras grandes que son el menú principal: **Inventario**, **Recetas**, **Producción** y **Ventas**. Si hay casillas pendientes, la píldora de Inventario lleva una pastilla ("1 por comprar" o "4 por revisar"). Debajo, "Lo que falta hacer":
- casillas en negativo (se vendió más de lo que se anotó que entró): "Revisar Rocoto ahumado picante: quedó en −120 g · falta anotar lo que entró";
- casillas bajo el mínimo: "Comprar Chicha: quedan 2 u. · mínimo 3".

Si no hay nada, "Todo está sobre el mínimo".

### Inventario

- Buscador arriba. Gráfica de barras horizontales agrupada por categoría (en el orden de la cocina) y en **orden alfabético** dentro de cada grupo, también al agregar casillas. Cada grupo tiene su propia escala, porque mezclar gramos con unidades no dice nada.
- Una rayita roja marca el mínimo; si está bajo o en negativo, el número va en rojo con un punto.
- Botón "+ Nueva casilla": nombre, tipo (ingrediente o bebida), categoría, unidad, porción en g (opcional), cuánto hay ahora y mínimo (en porciones si hay porción).

### Producción (lo que entra)

- Buscador y lista de todas las casillas, agrupadas como en Inventario, cada una con "hay X · en porciones/g/unidades" y un campo numérico vacío.
- "Guardar entradas" convierte porciones a gramos, crea un movimiento `entrada` por cada casilla con cantidad > 0 (fecha de hoy) y recalcula el stock. Después se limpian los campos y se ven los nuevos totales.

### Ventas (lo que sale)

- Selector de fecha (hoy por defecto). Grupos **Cultos**, **Criollos**, **Papas y combos** (las recetas) y **Bebidas** (casillas de tipo bebida, vendidas solas), cada producto con su campo numérico. Si ya hay ventas guardadas ese día, se muestran. Una receta puede llevar una bebida (los combos): la bebida se descuenta tanto vendida sola como dentro de un combo.
- Una receta sin ingredientes muestra la pastilla "Sin receta" y no descuenta nada. Una receta provisional muestra "Provisional" (en gris) y descuenta normal.
- "Revisar descuento" abre una hoja con lo que se va a descontar de cada casilla y el aviso de los panes sin receta. "Confirmar ventas" guarda.
- Al guardar las ventas de una fecha:
  1. Se reemplazan las filas de VentasDia de esa fecha (es el total del día, no se suma).
  2. Se borran los Movimientos con `origen = venta:<fecha>` y se vuelven a crear (uno por casilla, tipo `venta`): por cada pan, cantidad vendida × lo que lleva la receta; por cada bebida, la cantidad vendida.
  3. Se recalcula el stock. Así, corregir las ventas del día nunca descuenta dos veces.

### Recetas

- Lista agrupada en Cultos, Criollos y Papas, con el resumen de lo que lleva cada uno ("Pan cubano 1 u. · Panceta Bravo 140 g…") y la pastilla "Sin receta" o "Provisional". Botón "+ Nuevo pan" (nombre y grupo).
- Tocar un producto abre el editor: un bloque por ingrediente (elegir casilla, agrupadas por categoría, + cantidad por unidad vendida en g o unidades, con la equivalencia en porciones), "+ Agregar ingrediente", "Quitar" y "Guardar receta". Si un ingrediente se repite, se suman las cantidades.

### Más

Movimientos (historial filtrable por fecha, casilla y tipo), Ajustes (mínimos, ajuste de stock contado, mensaje de prueba de Telegram) y "Cambiar de usuario".

### Botón "+"

Menú corto: "Lo que entró" (Producción), "Ventas del día" y "Nueva casilla".

## Notificaciones (Telegram)

- `UrlFetchApp` a `https://api.telegram.org/bot<TOKEN>/sendMessage`, al grupo del equipo.
- Se disparan cuando, al guardar, una casilla queda con `stock_actual < stock_minimo` → "Comprar Chicha: quedan 2 unidades (mínimo 3)."
- Máximo una alerta por casilla por día (marca con la fecha en Script Properties).
- Activador de tiempo a las 20:00 (hora de Lima) con el resumen del día: lo vendido, lo que entró y lo que está bajo el mínimo.
- Si Telegram falla, el guardado no falla: se registra el error y se sigue.

## Fases

| # | Fase | Estado |
|---|---|---|
| 0 | Base: estructura, estilos, barra inferior, toasts, hoja que sube, campos de número, PIN y nombre | Hecha |
| 1 | Backend: Code.gs (`setup()`, PIN, bloqueo), appsscript.json, api.js | Hecha |
| 2 | Hoy (menú + alertas), Inventario (gráfica + nueva casilla), Producción (entradas), Ventas (descuento por receta), Recetas (editor) | Hecha |
| 2b | Datos reales de RECETAS.md (Semilla.gs), porciones, categorías, buscador, grupos de venta y estados de receta | Hecha |
| 3 | Movimientos (historial) y Ajustes (mínimos, ajuste de stock contado) | Siguiente |
| 4 | Telegram: alertas, mensaje de prueba y resumen de las 20:00 | |
| 5 | README: instalación paso a paso (Sheet, Apps Script, publicación, GitHub Pages, Telegram) | |

Al final de cada fase, detenerse y mostrar lo hecho antes de seguir.

**Publicación del Apps Script (va en el README):** aplicación web que se ejecuta como el dueño, con acceso para "Cualquier usuario". Cada cambio en Code.gs se publica como versión nueva de la MISMA implementación (Administrar implementaciones → editar → Nueva versión), para que la URL no cambie.

## Fuera de alcance

Costos y precios, caja, reportes en PDF, varios locales, modo sin conexión.
