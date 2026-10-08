# RECETAS.md — Datos iniciales de SANTO para la app

> **Cambio del 07/10/2026 (hablado con cocina):** ya no se mide nada en gramos. Cada casilla tiene una forma de medir (`medicion`): **conteo** (porciones o unidades, se descuenta con las ventas), **nivel** (salsas: Lleno · Medio · Poco · Vacío) o **marcar** (Hay / Falta). Las recetas solo descuentan casillas de conteo. El gramaje queda solo como texto de referencia (`gramaje_ref`). Reemplaza la regla de unidades en g y lo decidido el 05/10/2026 sobre el control del día: las proteínas **vuelven a tener control del día** en Hoy.

Este archivo sale de la ficha "SANTO – Producción general y gramajes" y de lo que dijo cocina el 07/10/2026. Sirve para armar `apps-script/Semilla.gs` (`cargarSemilla()`), que llena Insumos, Recetas y RecetaIngredientes. Todas las casillas (preparaciones e insumos) viven en la hoja **Insumos**; "preparación" es solo la categoría (Proteínas, Salsas, Complementos). Si una fila ya existe (mismo `id`), no la duplica.

## Formas de medir

| medicion | Qué es | Cómo se guarda | ¿La descuentan las ventas? |
|---|---|---|---|
| `conteo` | Proteínas, panes, papas, palta, tomate y bebidas | Porciones (proteínas y papas) o unidades (panes, palta, tomate, bebidas) | Sí, según la receta |
| `nivel` | Salsas y cremas | `estado_actual`: lleno · medio · poco · vacío | No |
| `marcar` | Verduras de hoja, complementos, secos y todo lo de solo producción | `estado_actual`: hay · falta | No |

## Supuestos y dudas

Se cargan con el valor por defecto y se corrigen desde Ajustes si cocina dice otra cosa.

**Siguen vigentes**

| # | Supuesto | Por qué |
|---|---|---|
| S2 | La "crema de ají amarillo" del Pollo deshilachado es una salsa aparte, no la SAL-04 | La ficha no lo dice |
| S5 | El nombre es **El Artesano** (con S), como en la ficha | El material de marca usaba "Artezano" con Z |
| S7 | Las papas se compran congeladas, listas para freír | La ficha no tiene producción de papas |

Ya no aplican: S1 (el asado es uno solo), S3 (la mantequilla de ajo se borró), S4 (el huevo pasa a marcar) y S6 (El Bravo vuelve a ser una sola receta).

**Dudas pendientes (cargadas con el valor por defecto)**

| # | Duda | Por defecto |
|---|---|---|
| D1 | Butifarra lleva 100 g de jamón del país, pero el jamón se borró. ¿El jamón va como proteína en porciones? | Solo descuenta la roseta |
| D2 | Sarsa criolla: ¿se quita del todo? | Va como marcar |
| D3 | El Incondicional sin camote al hilo: ¿lleva camote frito o va sin camote? | Va sin camote (de todos modos el camote frito es marcar y no se descuenta) |
| D4 | Papas: 1 porción = bolsa de 200 g. La del combo grupal es de 150 g | Combo grupal = 0.75 porción por persona |

**Decidido el 07/10/2026**

| # | Qué | Decisión |
|---|---|---|
| D5 | Combos papas + bebida (Chicha y Maracuyá) | Se mantienen, con 1 porción de papas + 1 bebida |
| D6 | Maracuyá | Se mantiene como bebida (conteo, unidades); no se agregan más bebidas |

## Proteínas

`medicion = conteo`, `unidad_base = porción`, con control del día en Hoy. `minimo_alerta` arranca vacío: cocina lo define en Ajustes. El gramaje es solo referencia.

| id | nombre | etiqueta | color | gramaje_ref |
|---|---|---|---|---|
| prep-panceta | Panceta / Chicharrón | Bravo · chicharrón | plum | 140 g |
| prep-pollo | Pollo Invicto | marinado, crudo | mustard | 150 g crudo |
| prep-asado | Asado | Incondicional · criollo | navy | 120 g |
| prep-portobello | Portobello anticuchero | Fenómeno | sand | 90 g |
| prep-fiambres | Mix fiambres Artesano | jamón + salami | olive | 90 g |
| prep-pollo-desh | Pollo deshilachado | provisional | slate | 140 g |

- El asado es **uno solo** (El Incondicional y Asado criollo).
- Panceta y chicharrón son **uno solo** (El Bravo y Pan con chicharrón).

## Panes, verduras de conteo, papas y bebidas

`medicion = conteo`. Se manejan desde Inventario.

| id | nombre | categoria | unidad | gramaje_ref |
|---|---|---|---|---|
| ins-pan-cubano | Pan cubano | Panes | unidad | |
| ins-roseta | Roseta | Panes | unidad | |
| ins-focaccia | Focaccia | Panes | unidad | |
| ins-masa-madre | Pan masa madre con semillas | Panes | unidad | |
| ins-palta | Palta | Verduras | unidad | 1 palta = 2 panes |
| ins-tomate | Tomate | Verduras | unidad | 1 tomate = 2 panes |
| ins-papas | Papas congeladas | Congelados | porción | 1 porción = bolsa de 200 g (D4) |
| beb-chicha | Chicha | Bebidas | unidad | la bebida; también da el concentrado del Glaseado |
| beb-maracuya | Maracuyá | Bebidas | unidad | (D6) |

Todo lo de conteo (incluidas las bebidas) arranca en 0 y sin mínimo: los números reales se ponen en la Revisión inicial y los mínimos en Ajustes.

## Salsas

`medicion = nivel`. `estado_actual` arranca en `lleno`. Las ventas no las descuentan.

| id | nombre | código |
|---|---|---|
| sal-rocoto-pic | Rocoto ahumado picante | SAL-01 |
| sal-rocoto-sin | Rocoto ahumado sin picante | SAL-02 |
| sal-aji-ahumado | Ají amarillo ahumado | SAL-03 |
| sal-aji-huacatay | Ají amarillo con ajo y huacatay | SAL-04 |
| sal-golf | Golf ahumada | SAL-05 |
| sal-culantro | Culantro y cebollín | SAL-06 |
| sal-pesto | Pesto de albahaca | SAL-07 |
| sal-glaseado | Glaseado Bravo | ver "Glaseado y chicha" |
| sal-crema-aji | Crema de ají amarillo | provisional (S2) |

### Glaseado y chicha

El concentrado de chicha del Glaseado Bravo sale de las bebidas.
- El Glaseado tiene "Unidades de chicha por lote" (en Ajustes), **vacío al inicio**.
- En su detalle hay un botón **"Hice un lote"**: descuenta esas unidades de `beb-chicha` y pone el Glaseado en `lleno`.
- Si el campo está vacío, no descuenta nada y muestra un aviso.

## Ingredientes para marcar

`medicion = marcar`. `estado_actual` arranca en `hay`. Las ventas no los descuentan.

| id | nombre | categoria |
|---|---|---|
| ins-lechuga | Lechuga | Verduras |
| ins-arugula | Arúgula | Verduras |
| comp-chalaquita | Chalaquita encurtida | Complementos |
| comp-camote-frito | Camote frito | Complementos |
| comp-aros | Aros de cebolla | Complementos |
| comp-sarsa | Sarsa criolla | Complementos (D2) |
| comp-quesos | Mix quesos Artesano | Complementos |
| ins-paria | Queso Paria | Lácteos |
| ins-harina | Harina | Secos |
| ins-huevo | Huevo | Secos |
| ins-panko | Panko | Secos |

### Solo producción (también marcar)

Mayonesa, kétchup, mostaza, humo líquido, ajinomoto, sal, pimienta negra, comino, laurel, canela china, rocoto, ají amarillo, ají limo, ají panca, ajo, huacatay, culantro, cebollín, albahaca, aceite de oliva, aceite, almendra, cebolla roja, limón, pasta de tomate, camote, pollo deshuesado, sazonador Doña Gusta carne y sazonador Doña Gusta pollo/gallina.

## Lo que se borra

Como se empieza de cero (`empezarDeCero()`), esto simplemente ya no está en la semilla.

| Qué | ids / nombres |
|---|---|
| Proteínas que se juntan | prep-asado-res, prep-asado-criollo (→ prep-asado), prep-chicharron (→ prep-panceta) |
| Mantequilla de ajo | comp-mantequilla (sale también de El Artesano) |
| Camote al hilo | comp-camote-hilo (sale también de El Incondicional) |
| Fiambres sueltos | ins-jamon y Salami ahumado (queda solo el Mix fiambres) |
| Solo producción | Carne para asado, Panceta, Portobello, Parmesano, Queso Edam, Queso Gouda, Mozzarella |
| Concentrado de chicha | Ahora sale de `beb-chicha` (ver "Glaseado y chicha") |
| Recetas | rec-bravo-pic y rec-bravo-sin (→ rec-bravo) |

## Recetas (lo que lleva UN producto vendido)

Columnas de Recetas: `id | nombre | grupo | estado`. Los valores de `estado` son `vigente`, `provisional` y `sin_ficha`. **En RecetaIngredientes solo van casillas de conteo**: porciones para proteínas y papas, y unidades para lo demás.

### Cultos

| id | nombre | estado | lleva |
|---|---|---|---|
| rec-artesano | El Artesano | vigente | ins-masa-madre 1 · prep-fiambres 1 |
| rec-bravo | El Bravo | vigente | ins-pan-cubano 1 · prep-panceta 1 |
| rec-invicto | El Invicto | vigente | ins-pan-cubano 1 · prep-pollo 1 · ins-palta 0.5 · ins-tomate 0.5 |
| rec-fenomeno | El Fenómeno | vigente | ins-focaccia 1 · prep-portobello 1 |
| rec-incondicional | El Incondicional | vigente | ins-pan-cubano 1 · prep-asado 1 · ins-palta 0.5 (D3) |

### Criollos

| id | nombre | estado | lleva |
|---|---|---|---|
| rec-chicharron | Pan con chicharrón | vigente | ins-roseta 1 · prep-panceta 1 |
| rec-asado-criollo | Asado criollo | vigente | ins-pan-cubano 1 · prep-asado 1 · ins-palta 0.5 |
| rec-butifarra | Butifarra | vigente | ins-roseta 1 (D1) |
| rec-pollo-desh | Pollo deshilachado | provisional | ins-pan-cubano 1 · prep-pollo-desh 1 |
| rec-choripan | Choripán vegano | sin_ficha | nada |
| rec-kids | Kids | sin_ficha | nada |

### Papas y combos

| id | nombre | estado | lleva |
|---|---|---|---|
| rec-papas | Papas combo individual / extra | vigente | ins-papas 1 |
| rec-papas-grupal | Papas combo grupal (por persona) | vigente | ins-papas 0.75 (D4) |
| rec-combo-chicha | Combo papas + Chicha | vigente | ins-papas 1 · beb-chicha 1 (D5) |
| rec-combo-maracuya | Combo papas + Maracuyá | vigente | ins-papas 1 · beb-maracuya 1 (D5) |

## Cosas de la ficha que la app NO cubre todavía

- **Producción por lote** (fórmulas de salsas, sarsa, chicharrón y asado): no se descuentan insumos al producir. La única excepción es la chicha del Glaseado.
- **Vida útil** (por ejemplo, sarsa máximo 24 h): podría ser una alerta futura.
- **Inconsistencia en la ficha:** el humo líquido aparece en ml en unas salsas y en g en la SAL-05. La app ya no lo usa, pero conviene unificarlo en la ficha.
