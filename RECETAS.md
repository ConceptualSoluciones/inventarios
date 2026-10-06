# RECETAS.md — Datos iniciales de SANTO para la app

> **Cómo se usa en la app (decidido el 05/10/2026):** las proteínas, salsas y complementos de abajo se cargan como **casillas del inventario** (con su `porcion_g` cuando la tienen); no van como píldoras en Hoy ni tienen control diario aparte. Las píldoras de Hoy son el menú (Inventario, Recetas, Producción, Ventas). Además de lo de este archivo, se mantienen las bebidas **Chicha** (stock 2) y **Maracuyá** (stock 6), con mínimo 3. Los datos se cargan desde `apps-script/Semilla.gs`.

Este archivo sale de la ficha "SANTO – Producción general y gramajes" (vigente al 05/10/2026). Sirve para que Claude Code arme `apps-script/Semilla.gs` con una función `cargarSemilla()`, que llena Insumos, Preparaciones, Recetas y RecetaIngredientes. Si una fila ya existe (mismo `id`), no la duplica.

**Regla de unidades:** todo se guarda en **g**, salvo los panes y el huevo, que van en **unidad**. Cuando una preparación tiene `porcion_g`, la app la muestra y la pide en porciones (cantidad ÷ porcion_g), pero la guarda siempre en gramos.

## Supuestos a confirmar con cocina

Se cargan así y después se corrigen desde Ajustes si hace falta:

| # | Supuesto | Por qué |
|---|---|---|
| S1 | Asado de res (Incondicional) y Asado criollo son **dos preparaciones distintas** | La ficha los describe con procesos distintos (reducción vs. fondo criollo) |
| S2 | La "crema de ají amarillo" del Pollo deshilachado es una preparación aparte, no la SAL-04 | La ficha no lo dice |
| S3 | La mantequilla de ajo se prepara en el local | La ficha no lo dice |
| S4 | El huevo se cuenta por unidad: 25 g = 0.5 huevo | Los huevos se compran por unidad |
| S5 | El nombre es **El Artesano** (con S), como en la ficha | El material de marca usaba "Artezano" con Z |
| S6 | El Bravo se registra en ventas en dos líneas: picante y sin picante | Cada una descuenta una salsa de rocoto distinta |
| S7 | Las papas fritas se compran listas para freír (insumo en g) | La ficha no tiene producción de papas |

## Preparaciones

Columnas: `id | nombre | categoria | etiqueta | color | porcion_g | minimo_alerta`

`minimo_alerta` arranca vacío en todas: cocina lo define en Ajustes.

### Proteínas (se muestran como píldoras en Hoy)

| id | nombre | etiqueta | color | porcion_g |
|---|---|---|---|---|
| prep-panceta | Panceta Bravo | lingote | plum | 140 |
| prep-pollo | Pollo Invicto | marinado, crudo | mustard | 150 |
| prep-asado-res | Asado de res | Incondicional | navy | 120 |
| prep-asado-criollo | Asado criollo | criollo | teal | 120 |
| prep-chicharron | Chicharrón | criollo | rose | 140 |
| prep-portobello | Portobello anticuchero | Fenómeno | sand | 90 |
| prep-fiambres | Mix fiambres | jamón + salami | olive | 90 |
| prep-pollo-desh | Pollo deshilachado | provisional | slate | 140 |

### Salsas (filas compactas en Hoy, en g)

| id | nombre | código |
|---|---|---|
| sal-rocoto-pic | Rocoto ahumado picante | SAL-01 |
| sal-rocoto-sin | Rocoto ahumado sin picante | SAL-02 |
| sal-aji-ahumado | Ají amarillo ahumado | SAL-03 |
| sal-aji-huacatay | Ají amarillo, ajo y huacatay | SAL-04 |
| sal-golf | Golf ahumada | SAL-05 |
| sal-culantro | Culantro y cebollín | SAL-06 |
| sal-pesto | Pesto de albahaca | SAL-07 |
| sal-glaseado | Glaseado Bravo | — |
| sal-crema-aji | Crema de ají amarillo | provisional (S2) |

### Complementos (filas compactas en Hoy)

| id | nombre | porcion_g |
|---|---|---|
| comp-sarsa | Sarsa criolla | 40 |
| comp-chalaquita | Chalaquita encurtida | 40 |
| comp-quesos | Mix quesos Artesano | 50 |
| comp-camote-hilo | Camote al hilo | 30 |
| comp-camote-frito | Camote frito | 70 |
| comp-aros | Aros de cebolla | 25 |
| comp-mantequilla | Mantequilla de ajo | 10 |

## Insumos que se descuentan con cada venta

Columnas: `id | nombre | categoria | unidad_base`

| id | nombre | categoria | unidad |
|---|---|---|---|
| ins-pan-cubano | Pan cubano | Panes | unidad |
| ins-roseta | Roseta | Panes | unidad |
| ins-focaccia | Focaccia | Panes | unidad |
| ins-masa-madre | Pan masa madre con semillas | Panes | unidad |
| ins-palta | Palta (neto) | Verduras | g |
| ins-lechuga | Lechuga | Verduras | g |
| ins-tomate | Tomate | Verduras | g |
| ins-arugula | Arúgula | Verduras | g |
| ins-paria | Queso Paria | Lácteos | g |
| ins-jamon | Jamón del país | Fiambres | g |
| ins-harina | Harina | Secos | g |
| ins-panko | Panko | Secos | g |
| ins-huevo | Huevo | Secos | unidad |
| ins-papas | Papas fritas | Congelados | g |

## Insumos solo de producción (no se descuentan solos)

Se cargan para que existan en el inventario. Como descontar insumos al producir está fuera de alcance, estos bajan solo con salidas manuales:

Mayonesa, kétchup, mostaza, humo líquido, ajinomoto, sal, pimienta negra, comino, laurel, canela china, rocoto, ají amarillo, ají limo, ají panca, ajo, huacatay, culantro, cebollín, albahaca, aceite de oliva, aceite, parmesano, almendra, cebolla roja, limón, panceta, carne para asado, salami ahumado, queso Edam, queso Gouda, mozzarella, pasta de tomate, concentrado de chicha, portobello, camote, pollo deshuesado, sazonador Doña Gusta carne, sazonador Doña Gusta pollo/gallina.

## Recetas (lo que lleva UN producto vendido)

Columnas de Recetas: `id | nombre | grupo | estado`. Los valores de `estado` son `vigente`, `provisional` y `sin_ficha`.

### Cultos

**rec-artesano · El Artesano** · vigente
ins-masa-madre 1 · comp-mantequilla 10 · prep-fiambres 90 · comp-quesos 50 · sal-pesto 40 · ins-arugula 20

**rec-bravo-pic · El Bravo (picante)** · vigente
ins-pan-cubano 1 · prep-panceta 140 · sal-glaseado 30 · sal-rocoto-pic 40 · comp-chalaquita 40

**rec-bravo-sin · El Bravo (sin picante)** · vigente
ins-pan-cubano 1 · prep-panceta 140 · sal-glaseado 30 · sal-rocoto-sin 40 · comp-chalaquita 40

**rec-invicto · El Invicto** · vigente
ins-pan-cubano 1 · prep-pollo 150 · ins-harina 30 · ins-huevo 0.5 · ins-panko 40 · ins-lechuga 30 · ins-tomate 40 · ins-palta 50 · sal-culantro 20

**rec-fenomeno · El Fenómeno** · vigente
ins-focaccia 1 · prep-portobello 90 · ins-paria 50 · comp-aros 25 · ins-arugula 15 · sal-culantro 20

**rec-incondicional · El Incondicional** · vigente
ins-pan-cubano 1 · prep-asado-res 120 · ins-palta 50 · comp-camote-hilo 30 · ins-arugula 15 · sal-aji-ahumado 40

### Criollos

**rec-chicharron · Pan con chicharrón** · vigente
ins-roseta 1 · prep-chicharron 140 · comp-camote-frito 70 · comp-sarsa 40

**rec-asado-criollo · Asado criollo** · vigente
ins-pan-cubano 1 · prep-asado-criollo 120 · ins-palta 50 · comp-sarsa 40

**rec-butifarra · Butifarra** · vigente
ins-roseta 1 · ins-jamon 100 · comp-sarsa 40

**rec-pollo-desh · Pollo deshilachado** · provisional
ins-pan-cubano 1 · prep-pollo-desh 140 · ins-lechuga 20 · sal-crema-aji 15

**rec-choripan · Choripán vegano** · sin_ficha (sin ingredientes)

**rec-kids · Kids** · sin_ficha (sin ingredientes)

### Papas y combos

> Cambiado por el equipo el 05/10/2026: las papas son **un solo producto** y hay un **combo papas + bebida**. Reemplaza a "Papas 200 g" y "Papas 150 g".

**rec-papas · Papas** · vigente
ins-papas 200

**rec-combo-chicha · Combo papas + Chicha** · vigente
ins-papas 200 · beb-chicha 1

**rec-combo-maracuya · Combo papas + Maracuyá** · vigente
ins-papas 200 · beb-maracuya 1

## Cosas de la ficha que la app NO cubre todavía

- **Producción por lote** (salsas, sarsa, chicharrón, asado): la ficha tiene sus fórmulas, pero descontar esos insumos al producir es una fase futura ("Lotes").
- **Bebidas y concentrado de jugo:** el formato todavía figura "según formato vigente", así que no se cargan.
- **Vida útil** (por ejemplo, sarsa máximo 24 h): podría ser una alerta futura.
- **Inconsistencia en la ficha:** el humo líquido aparece en ml en unas salsas y en g en la SAL-05. La app no lo usa todavía, pero conviene unificarlo en la ficha.
