# SANTO — Inventario

Instrucciones para Claude Code. Leer completo antes de escribir código. El diseño visual está en `DESIGN.md`; en lo visual, si algo de este plan choca con DESIGN.md, gana DESIGN.md.

## Objetivo

Web app interna para el equipo de SANTO (Mercado San Martín, Lima). **Es solo inventario: no maneja costos, precios ni caja.** Todo gira alrededor del inventario:

- **Producción**: se anota lo que entra o se compra → **suma** al inventario.
- **Ventas**: se anota lo que sale (panes y bebidas) → **descuenta** del inventario. Cada pan descuenta lo que lleva su receta; cada bebida se descuenta sola. Solo se descuentan casillas de **conteo**.
- **Recetas**: lo que lleva cada pan (casillas de conteo, en porciones o unidades).
- **Salsas e ingredientes**: no se cuentan. Las salsas se marcan por **nivel** del pote y el resto se marca como **Hay / Falta**.
- **Alertas y "Por comprar"**: avisa cuando algo baja del mínimo, cuando una salsa queda en Poco o Vacío, o cuando un ingrediente está en Falta.

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
├── RECETAS.md              ← formas de medir, casillas y recetas iniciales
└── README.md               ← instalación paso a paso, en lenguaje simple
```

### Reglas técnicas

- **Llamadas**: `fetch` con `POST` y `Content-Type: text/plain;charset=utf-8`, con el JSON en el body (evita el preflight de CORS). Un solo `doPost` con un campo `action`.
- **Una llamada por pantalla**: Apps Script tarda entre 1 y 3 segundos por llamada. Cada pantalla trae todo de una vez (`cargarHoy(fecha)`, `cargarInventario`, `cargarRecetas`, `cargarVentas(fecha)`). Mientras carga, se muestra un esqueleto. Los botones de nivel y los interruptores Hay / Falta se ven cambiados al instante y se guardan por detrás; si falla, vuelven a su estado anterior con un aviso.
- **Bloqueo**: toda escritura va dentro de `LockService.getScriptLock()`.
- **PIN**: en Script Properties (`PIN`). El frontend lo pide una vez junto con el nombre de quien registra, lo guarda en localStorage y lo manda en cada request. Es una protección básica.
- **Secretos**: PIN, token de Telegram y chat_id van solo en Script Properties. El repo es público.
- **Fechas**: en el Sheet se guardan como texto `yyyy-MM-dd` (columnas en formato texto plano); horas como `HH:mm`. Al leer, si Sheets convirtió algo en fecha, se vuelve a texto en hora de Lima.
- **Zona horaria**: `America/Lima` en el Sheet y en `appsscript.json`.
- **Formas de medir** (`medicion`, detalle en RECETAS.md):
  - `conteo`: proteínas, panes, papas, palta, tomate y bebidas. Se guarda en **porciones** (proteínas y papas) o **unidades** (lo demás). Tiene stock, mínimo y se descuenta con las ventas.
  - `nivel`: salsas y cremas. Solo guarda su estado (lleno · medio · poco · vacío). No tiene stock ni se descuenta.
  - `marcar`: solo guarda hay · falta. No tiene stock ni se descuenta.
  - **Ya no se usan gramos para nada.** El gramaje se guarda como texto en `gramaje_ref` ("140 g") y solo se muestra como referencia; no se hacen cálculos con él.
- **Modo demo**: sin URL en config.js, la app carga `js/demo.js`, `Code.gs` y `Semilla.gs` y corre el mismo backend en el navegador. No hay datos de demo aparte.
- **Stock** (solo conteo): `stock_actual` nunca se escribe a mano; es la suma de los Movimientos de esa casilla y se recalcula en el backend después de cada cambio. Los movimientos `nivel` y `marca` no cuentan para el stock.
- **Errores**: claros ("No se pudo guardar. Revisa tu conexión y vuelve a intentar."). Si falla un guardado, no se limpia lo escrito.
- **Datos reales**: no mostrar datos ni alertas inventadas. El modo demo arranca con los mismos datos que `setup()`.
- **Pantalla**: mobile first. Probar en 360px de ancho.

## Hojas del Google Sheet

**Insumos**: todas las casillas, tanto las preparaciones (Proteínas, Salsas, Complementos) como los insumos (panes, verduras, bebidas…).
`id, nombre, categoria, tipo, medicion, unidad_base, gramaje_ref, stock_actual, stock_minimo, estado_actual, lote_insumo_id, lote_cantidad, proveedor, activo`
- `categoria`: grupo para mostrar (Proteínas, Salsas, Complementos, Panes, Verduras, Lácteos, Secos, Congelados, Bebidas, Solo producción).
- `tipo`: `ingrediente` (va en las recetas o se usa en cocina) o `bebida` (se vende sola y aparece en Ventas).
- `medicion`: `conteo` | `nivel` | `marcar`.
- `unidad_base`: `porción` o `unidad` en las de conteo; vacío en nivel y marcar.
- `gramaje_ref`: texto informativo ("150 g crudo"). Reemplaza a `porcion_g`.
- `stock_actual`, `stock_minimo`: solo en las de conteo; vacíos en las demás.
- `estado_actual`: en nivel `lleno | medio | poco | vacío`; en marcar `hay | falta`; vacío en conteo.
- `lote_insumo_id`, `lote_cantidad`: lo que descuenta "Hice un lote". Por ahora solo el Glaseado Bravo (`beb-chicha` y "Unidades de chicha por lote", vacío al inicio).

**Movimientos** (todo cambio de stock o de estado)
`id, fecha, hora, insumo_id, tipo (entrada | salida | merma | ajuste | venta | nivel | marca), cantidad, origen, nota, usuario`
- `entrada` suma; `salida`, `merma` y `venta` restan; `ajuste` lleva su signo (+ o −). Solo en casillas de conteo.
- `nivel` y `marca`: `cantidad` va vacía y el valor nuevo va en `nota` (por ejemplo `poco` o `falta`). Quedan con quién y a qué hora.
- `origen` vale `manual`, `venta:yyyy-MM-dd` cuando lo generó el registro de ventas de ese día, o `lote:<insumo_id>` cuando lo generó "Hice un lote".

**Cierres** (lo que quedó de cada proteína al final de cada día)
`fecha, insumo_id, queda, actualizado_en`

**Control del día** (solo proteínas, que son de conteo; no es una hoja): `inicial + producido (entradas) − vendido (ventas) − merma (± ajustes) = queda`.
- `inicial` es el último cierre anterior a esa fecha (0 si no hay ninguno).
- Para la fecha consultada se leen **solo los movimientos de ese día**: primero la columna `fecha` y después únicamente el bloque de filas de ese día. Nunca se lee la hoja entera en cada carga.
- Cada vez que se guarda algo que mueve una proteína (Producción, Ventas, Anotar en Hoy, Revisión inicial, nueva casilla), se rehace el cierre de esa fecha para esa proteína.
- Si se corrige un día pasado, solo se rehace su cierre. Si ya había cierres de días siguientes, no se tocan y se avisa: "los días siguientes pueden no cuadrar".

**Recetas** (todo lo que se vende con receta: sándwiches, papas y combos)
`id, nombre, grupo (cultos | criollos | papas), estado (vigente | provisional | sin_ficha), activa, notas`

**RecetaIngredientes** (lo que lleva UN producto): **solo casillas de conteo**.
`receta_id, insumo_id, cantidad` (en porciones o unidades; puede ser decimal, por ejemplo 0.5 palta).

**VentasDia** (lo vendido por día)
`fecha, item_tipo (receta | insumo), item_id, cantidad, actualizado_por, actualizado_en`

`setup()` crea las hojas con sus encabezados y pone en texto las columnas de fecha, hora, ids, notas y estados. Si una hoja tiene datos con columnas de una versión anterior, se detiene y pide correr `empezarDeCero()`. Después llama a `cargarSemilla()` (Semilla.gs), que agrega lo que falta comparando por id, sin duplicar ni pisar lo que cocina cambió:
- las casillas de **RECETAS.md**: 6 proteínas, 7 de conteo (panes, palta, tomate, papas), 2 bebidas, 9 salsas, 11 ingredientes para marcar y 29 de solo producción (64 en total). **Todas** las de conteo (incluidas Chicha y Maracuyá) empiezan con stock 0 y sin mínimo: nada inventado, así no sale ninguna alerta falsa. Los números reales se ponen en la Revisión inicial y los mínimos en Ajustes. Las salsas empiezan en `lleno` y las de marcar en `hay`;
- las 15 recetas de RECETAS.md.

### Empezar de cero

El Sheet solo tenía datos de prueba en gramos, así que no hay migración. `empezarDeCero()` se ejecuta a mano desde el editor de Apps Script: vacía todas las hojas de la app (casillas, movimientos, recetas, ventas y cierres), borra las marcas de alerta y vuelve a correr `setup()` con la semilla nueva. No se puede deshacer.

Las dudas D1–D4 de RECETAS.md se cargan con su valor por defecto y se corrigen desde la app si cocina dice otra cosa.

## Pantallas

### Hoy (inicio)

De arriba hacia abajo:
1. **Alertas**: casillas de conteo en negativo ("Revisar Pan cubano: quedó en −2 u. · falta anotar lo que entró") y un resumen de lo que hay por comprar, con enlace a **"Por comprar"**. Si no hay nada, "Todo en orden".
2. **Selector de fecha** (hoy por defecto). Afecta el control del día de las proteínas; salsas e ingredientes muestran siempre su estado actual.
3. **Proteínas**: una fila por proteína con el control del día (inicial + producido − vendido − merma = queda), en porciones y con el gramaje de referencia en pequeño. Lo producido y la merma se anotan ahí mismo (crean movimientos `entrada` y `merma` en esa fecha). Lo vendido sale de Ventas.
4. **Salsas**: nombre + 4 botones grandes **Lleno · Medio · Poco · Vacío**. Se toca uno y se guarda en el momento (movimiento `nivel`). El Glaseado Bravo abre su detalle, que tiene "Hice un lote".
5. **Ingredientes**: lista con interruptor **Hay / Falta** (movimiento `marca`), agrupada por categoría, con Solo producción al final.

Panes, palta, tomate, papas y bebidas se manejan desde Inventario.

Las píldoras del menú (Inventario, Recetas, Producción, Ventas) se quedan como están, arriba de todo; su diseño y su lugar en Hoy se ven aparte. Los ingredientes "Solo producción" van al final, en un grupo plegado.

### Por comprar

Vista nueva, a la que se entra desde Hoy. Junta, en tres grupos:
- **Bajo el mínimo** (conteo): "Chicha: quedan 2 u. · mínimo 3".
- **Salsas en Poco o Vacío** (nivel).
- **Falta** (marcar).

Es la misma lista que manda Telegram a las 20:00.

### Inventario

- Solo casillas de **conteo**. Buscador arriba. Gráfica de barras horizontales agrupada por categoría (en el orden de la cocina) y en **orden alfabético** dentro de cada grupo, también al agregar casillas. Cada grupo tiene su propia escala.
- Una rayita roja marca el mínimo; si está bajo o en negativo, el número va en rojo con un punto.
- Botón "+ Nueva casilla": nombre, forma de medir (conteo, nivel o marcar), tipo (ingrediente o bebida), categoría y gramaje de referencia (opcional). Si es de conteo, además pide la unidad (porción o unidad), cuánto hay ahora y el mínimo. Si es de nivel o marcar, se crea en Lleno o Hay y aparece en Hoy.

### Producción (lo que entra)

- Buscador y lista de las casillas de **conteo**, agrupadas como en Inventario, cada una con "hay X porc./u." y un campo numérico vacío.
- "Guardar entradas" crea un movimiento `entrada` por cada casilla con cantidad > 0 (fecha de hoy) y recalcula el stock. Después se limpian los campos y se ven los nuevos totales.

### Ventas (lo que sale)

- Selector de fecha (hoy por defecto). Grupos **Cultos**, **Criollos**, **Papas y combos** (las recetas) y **Bebidas** (casillas de tipo bebida, vendidas solas), cada producto con su campo numérico. Si ya hay ventas guardadas ese día, se muestran. Una receta puede llevar una bebida (los combos): la bebida se descuenta tanto vendida sola como dentro de un combo.
- Una receta sin ingredientes muestra la pastilla "Sin receta" y no descuenta nada. Una receta provisional muestra "Provisional" (en gris) y descuenta normal.
- "Revisar descuento" abre una hoja con lo que se va a descontar de cada casilla, en porciones o unidades (por ejemplo, "Palta 1.5 u."), y el aviso de los panes sin receta. "Confirmar ventas" guarda.
- Al guardar las ventas de una fecha:
  1. Se reemplazan las filas de VentasDia de esa fecha (es el total del día, no se suma).
  2. Se borran los Movimientos con `origen = venta:<fecha>` y se vuelven a crear (uno por casilla, tipo `venta`): por cada pan, cantidad vendida × lo que lleva la receta; por cada bebida, la cantidad vendida.
  3. Se recalcula el stock. Así, corregir las ventas del día nunca descuenta dos veces.
- Las salsas y los ingredientes para marcar nunca se tocan desde Ventas.

### Recetas

- Lista agrupada en Cultos, Criollos y Papas, con el resumen de lo que lleva cada uno ("Pan cubano 1 u. · Panceta / Chicharrón 1 porc. · Palta ½ u.") y la pastilla "Sin receta" o "Provisional". Botón "+ Nuevo pan" (nombre y grupo).
- Tocar un producto abre el editor: un bloque por ingrediente (elegir casilla, **solo de conteo**, agrupadas por categoría, + cantidad por unidad vendida en porciones o unidades; acepta decimales), "+ Agregar ingrediente", "Quitar" y "Guardar receta". Si un ingrediente se repite, se suman las cantidades.

### Más

Revisión inicial, Movimientos (historial filtrable por fecha, casilla y tipo, incluidos `nivel` y `marca`), Ajustes y "Cambiar de usuario".

**Revisión inicial**: una sola lista con buscador. Arriba, todas las salsas (Lleno · Medio · Poco · Vacío) y todos los ingredientes (Hay / Falta), con su estado actual marcado. Abajo, "Cuánto hay": todas las casillas de conteo con un campo vacío. "Guardar revisión" guarda solo lo que cambió: los estados como movimientos `nivel` y `marca`, y cada cantidad escrita como un `ajuste` por la diferencia con el stock (nota "Revisión inicial"). Lo que se deja vacío no cambia.

**Movimientos**: un día a la vez (con el selector de fecha; solo se leen las filas de ese día), filtrable por casilla y tipo. Con una casilla elegida, "Ver todo su historial" trae todas sus fechas. Lo más nuevo primero, hasta 200 filas. Cada fila: casilla, hora, quién, tipo, nota y el valor (+5 porc., −3 u., o el estado nuevo: Poco, Falta).

**Ajustes**, cada bloque con su propio botón:
- **Contar una casilla** (ajuste de stock contado): casilla de conteo + lo contado + motivo opcional → `ajuste` por la diferencia y se rehace el cierre del día.
- **Mínimos** de las casillas de conteo (vacío = sin mínimo). Al guardar se revisan las alertas.
- **Lotes**: "Unidades de chicha por lote" del Glaseado (vacío = no descuenta).
- **Forma de medir** de cualquier casilla (porciones, unidades, nivel o hay/falta). No se puede dejar de contar algo que está en una receta, se vende (bebida) o se descuenta con un lote. Al pasar a conteo, el stock sale de sus movimientos anteriores; se recomienda contarlo.
- El mensaje de prueba de Telegram llega en la fase 4.

### Glaseado Bravo: "Hice un lote"

En el detalle del Glaseado: el botón "Hice un lote" crea un movimiento `salida` de `lote_cantidad` en `beb-chicha` (origen `lote:sal-glaseado`) y un movimiento `nivel` que pone el Glaseado en `lleno`. Si "Unidades de chicha por lote" está vacío, solo pone el nivel en `lleno` y avisa: "No se descontó chicha: falta definir cuántas unidades lleva un lote (Ajustes)".

### Botón "+"

Menú corto: "Lo que entró" (Producción), "Ventas del día" y "Nueva casilla".

## Notificaciones (Telegram)

- `UrlFetchApp` a `https://api.telegram.org/bot<TOKEN>/sendMessage`, al grupo del equipo.
- Se disparan:
  - **conteo**: cuando, al guardar, una casilla queda con `stock_actual < stock_minimo` → "Comprar Chicha: quedan 2 unidades (mínimo 3)."
  - **nivel**: cuando una salsa pasa a Poco o Vacío → "Rocoto ahumado picante está en Poco (marcó Ana, 14:20)."
  - **marcar**: cuando algo pasa a Falta → "Falta Lechuga (marcó Ana, 14:20)."
- Máximo una alerta por casilla por día: la fecha del último aviso queda en Script Properties como `alerta:<insumo_id>`. Si Telegram no está configurado (`TELEGRAM_TOKEN` y `TELEGRAM_CHAT_ID`) o falla, no se marca nada. Esto ya funciona desde la fase 2c.
- Activador de tiempo a las 20:00 (hora de Lima) con el resumen del día: lo vendido, lo que entró y la lista **Por comprar** (la misma de la vista).
- Si Telegram falla, el guardado no falla: se registra el error y se sigue.

## Fases

| # | Fase | Estado |
|---|---|---|
| 0 | Base: estructura, estilos, barra inferior, toasts, hoja que sube, campos de número, PIN y nombre | Hecha |
| 1 | Backend: Code.gs (`setup()`, PIN, bloqueo), appsscript.json, api.js | Hecha |
| 2 | Hoy (menú + alertas), Inventario (gráfica + nueva casilla), Producción (entradas), Ventas (descuento por receta), Recetas (editor) | Hecha |
| 2b | Datos reales de RECETAS.md (Semilla.gs), porciones, categorías, buscador, grupos de venta y estados de receta | Hecha |
| 2c | Formas de medir: columnas nuevas, `empezarDeCero()`, semilla nueva, Cierres, Hoy (proteínas con control del día, salsas por nivel, ingredientes Hay / Falta), Por comprar, "Hice un lote", Revisión inicial, alertas con marca diaria; Inventario, Producción y Recetas solo con conteo | Hecha |
| 3 | Movimientos (historial, con `nivel` y `marca`) y Ajustes (mínimos, ajuste de stock contado, forma de medir, chicha por lote) | Hecha |
| 4 | Telegram: mensaje de prueba y resumen de las 20:00 con Por comprar | Siguiente |
| 5 | README: instalación paso a paso (Sheet, Apps Script, publicación, `empezarDeCero()`, GitHub Pages, Telegram) | |

Al final de cada fase, detenerse y mostrar lo hecho antes de seguir.

**Publicación del Apps Script (va en el README):** aplicación web que se ejecuta como el dueño, con acceso para "Cualquier usuario". Cada cambio en Code.gs se publica como versión nueva de la MISMA implementación (Administrar implementaciones → editar → Nueva versión), para que la URL no cambie.

## Fuera de alcance

Costos y precios, caja, reportes en PDF, varios locales, modo sin conexión, descontar insumos al producir (salvo la chicha del Glaseado).
