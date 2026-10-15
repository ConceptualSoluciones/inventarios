# DESIGN.md — SANTO Control

Sistema visual de la app interna de inventario de SANTO. Dirección: **"pizarra sobre pared blanca"**. Sale del local: las pizarras de menú son negras y cuelgan sobre una pared blanca, los títulos son gruesos, angostos y en mayúsculas, y el único color es un azul eléctrico. Uso principal: celular en cocina, con luz fuerte y apuro.

## Idea central

Fondo blanco (la pared) y bloques negros (las pizarras). **El azul SANTO marca solo lo que toca hacer ahora**: la pincelada bajo el paso del día que toca y el botón "+". Todo lo demás es tranquilo: negro, blanco y gris pared.

## Color

### Modo claro (por defecto, mejor con luz de cocina)

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#FFFFFF` | Fondo (pared), fondo de los campos |
| `--surface` | `#EDEDEA` | Gris pared: notas, pasos que todavía no tocan, botones − + |
| `--ink` | `#141414` | Negro pizarra: texto, botón principal, contornos, barras de la gráfica |
| `--ink-soft` | `#5C5C5C` | Texto secundario (6.7:1 sobre blanco, 5.7:1 sobre gris pared) |
| `--line` | `#D6D6D1` | Divisores (decorativos, no marcan nada que se toque) |
| `--borde-campo` | `#76766F` | Borde de 2px de campos y botones − + (4.6:1 sobre blanco) |
| `--azul` | `#2D6BF5` | Azul SANTO: pincelada, foco, botón "+". **Nunca texto chico sobre negro** (4.0:1) |
| `--azul-tinta` | `#1F55E0` | Azul para fondos con texto blanco o texto azul sobre blanco (6.1:1) |

### Estados

| Token | Hex | Uso |
|---|---|---|
| `--alert` | `#C2412A` | Bajo el mínimo, errores. Solo alertas |
| `--alert-bg` | `#FBE7E2` | Fondo de avisos en listas |
| `--ok` | `#2E7D4F` | Check de "hecho" |

### Modo oscuro (la pizarra entera)

`--bg #141414`, `--surface #242424`, `--ink #FFFFFF`, `--ink-soft #B5B5B0`, `--line #333333`, `--borde-campo #8A8A85`, fondo de campos `#1C1C1C`. El paso que toca se vuelve **blanco con texto negro** (como el círculo del logo) y la pincelada pasa a `#1F55E0`. Texto de error `#FF8A70`, fondo de aviso `#3A2320`, check `#6FCF97`. La barra inferior es negra con línea blanca arriba.

**Regla del azul:** sobre negro, el texto va blanco (o azul claro `#7FA8FF` si hace falta azul). El azul fuerte sobre negro solo se usa para dibujos (pincelada) o fondos con texto blanco grande.

No se inventan colores nuevos.

## Tipografía

Una familia: **Archivo** (Google Fonts, variable en ancho y peso). Respaldo: `"Archivo", "Segoe UI", system-ui, sans-serif`. En títulos, `"Arial Narrow"` antes del respaldo.

| Rol | Tamaño | Estilo | Notas |
|---|---|---|---|
| Título de pantalla | 40px (36px si comparte fila con un botón) | Extra condensada (`font-stretch: 62%`), 900, MAYÚSCULAS | Como los títulos de las pizarras |
| Nombre del paso (Hoy) | 36px | Igual que el título | |
| Título de hoja que sube | 32px | Igual que el título | |
| Sección dentro de pantalla ("Lo que usé") | 24px | Igual que el título | |
| Texto | 16px | Normal 400–500 | Nunca menos de 16px en campos (evita el zoom en iPhone) |
| Número en campo | 24px | 700, `tabular-nums` | |
| Pequeño | 13–14px | 500 | Unidades, horas, ayudas |

**Las mayúsculas van solo en títulos.** Botones, ayudas, nombres de productos y etiquetas van en letra normal.

## Logo

- Archivo oficial: `assets/logo-santo.png` (blanco sobre negro, con "Culto al sandwich"). **No se redibuja ni se modifica.** Si hace falta más definición, se pide a la dueña un SVG o un PNG más grande.
- Cabecera: insignia negra de 80×56 con bordes de 10px. Se recorta para mostrar solo la palabra "Santo".
- Ingreso (PIN): el logo completo, de 168px de ancho, centrado.

## Forma y espacio

- Pasos de Hoy: bloques rectangulares con radio de 14px (no píldoras) y alto mínimo de 104px.
- Botones y campos: radio de 12px y alto mínimo de 52px. Los botones − + miden 44px.
- Botón "+" central: círculo azul de 64px con borde del color de la barra y anillo de 2px del color de la tinta.
- Barra inferior: recta, con una línea de 2px arriba (negra en claro, blanca en oscuro).
- Hoja que sube: esquinas superiores de 20px y una línea de 2px arriba.
- Espaciado base de 8px. Márgenes laterales de 20px. Ancho máximo de 480px.
- Sin sombras en tarjetas. Solo la hoja que sube lleva una sombra suave.

## Componentes

### Pasos del día (Hoy)

```
┌───────────────────────────────────┐
│ 1 · apertura                 ╭───╮│
│ COMPRAS                      │ ◎ ││   ← dibujo en círculo blanco con borde
│ Todavía no se anotó nada     ╰───╯│
└───────────────────────────────────┘
```

| Estado | Clase | Cómo se ve |
|---|---|---|
| En reposo | `.pill` | Bloque gris pared, texto negro |
| **Toca ahora** | `.pill--ahora` | Pizarra negra (blanca de noche) con pincelada azul bajo el nombre |
| Hecho | `.pill--hecho` | Blanco con contorno gris, nombre en gris y "✓" verde antes del estado |
| No lo puede abrir (Cierre para cocina) | `div.pill` | Contorno punteado, nombre y dibujo apagados |

Quién lleva `.pill--ahora` y `.pill--hecho` lo decide `js/paginas/hoy.js`. Las clases ya están en el css, pero falta conectar esa decisión: es lógica y le toca a la programadora.

### Campos

- Fondo blanco (`--campo-bg`), borde de 2px `--borde-campo`. Al escribir, el borde se pone azul.
- Campos de número con botones − y + de 44px, en gris pared, con borde de 2px. El número va centrado, en 24px y peso 700.
- Usan `inputmode="decimal"`.

### Botones

- Principal: negro a lo ancho, con texto blanco (en modo oscuro, blanco con texto negro).
- Secundario: blanco con contorno negro de 2px.
- Opciones del menú "+": bloques blancos con contorno negro de 2px.

### Gráfica de inventario

Barras horizontales en `--ink` sobre una pista `--surface`. Una rayita `--alert` de 2px marca el mínimo. Si está bajo, el número va en `--alert-texto` con un punto al lado.

### Pastillas de estado

Blancas, borde de 1.5px y texto `--alert`, 12px y 700 ("Sin receta"). "Provisional" y "Por revisar" van en gris.

### Avisos

Toasts arriba, con fondo `--ink`, texto `--on-ink` y 3 segundos de duración.

## Ilustraciones

- Estilo "marcador": trazo negro `#141414` de 4px con puntas redondas, rellenos blancos y **un solo acento azul `#2D6BF5`** por dibujo. Cada dibujo va dentro de un círculo blanco (como el cartel del local). Son SVG de 96×96, en `assets/ilustraciones/`.
- `compras.svg`: bolsa de mercado con pan y hierbas.
- `produccion.svg`: olla con vapor y llama azul.
- `cierre.svg`: puesto con la persiana bajando y luna azul.
- `inventario.svg`: caja abierta con botella y lata.
- `recetas.svg`: sándwich.
- `ventas.svg`: boleta y moneda.
- Todas son originales. Si falta una, se muestra un círculo blanco con la inicial.

## Movimiento

- La hoja que sube aparece en 220ms con `ease-out`. Nada más se anima. Con `prefers-reduced-motion` se quita todo.

## Accesibilidad

- Todo texto cumple 4.5:1 y los bordes de campos y botones cumplen 3:1.
- Las alertas y estados nunca dependen solo del color: "Toca ahora" lleva pincelada y fondo distinto, y "hecho" lleva "✓".
- Foco visible: anillo azul de 3px con 2px de separación.
- Áreas táctiles de 44×44px como mínimo.

## No hacer

- No usar azul en texto chico sobre negro.
- No poner la pincelada en más de un paso a la vez: marca solo lo que toca.
- No usar `--alert` fuera de alertas.
- No poner mayúsculas fuera de los títulos.
- No mezclar otras familias tipográficas.
- No modificar ni redibujar el logo.
- No mostrar datos ni alertas de ejemplo: solo lo real.
