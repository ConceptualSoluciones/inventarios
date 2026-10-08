# DESIGN.md — SANTO Control

Sistema visual para la app interna de inventario de SANTO. Referencia: app de comida con tarjetas en forma de píldora, colores planos y una ilustración que se sale por el borde derecho de cada tarjeta. Uso principal: celular en cocina, con luz fuerte y prisa.

## Idea central

Las 4 secciones principales (Inventario, Recetas, Producción y Ventas) son **píldoras de color con su ilustración** en la pantalla Hoy. Se reconocen por el color y el dibujo antes de leer. Debajo, "Lo que falta hacer". Las casillas del inventario NO van en píldoras: van en una gráfica de barras o en filas simples. Todo lo demás es tranquilo: fondo limpio, poco texto, una sola barra de navegación abajo con un botón central "+".

## Color

### Modo claro (por defecto, mejor con luz de cocina)

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#FFFFFF` | Fondo de pantalla |
| `--surface` | `#F5F3EF` | Barra inferior, campos de formulario, hojas que suben |
| `--ink` | `#1C2236` | Texto principal, botón "+" central, iconos, barras de la gráfica |
| `--ink-soft` | `#6E7182` | Texto secundario, etiquetas pequeñas |
| `--line` | `#E6E2DA` | Divisores y bordes de campos |

### Colores de píldora (uno por sección del menú, siempre el mismo)

| Token | Hex | Texto encima | Asignación |
|---|---|---|---|
| `--pill-mustard` | `#F4C15D` | `--ink` | Inventario |
| `--pill-plum` | `#4A3B47` | `#FFFFFF` / etiqueta `#F0A08A` | Recetas |
| `--pill-navy` | `#25365C` | `#FFFFFF` / etiqueta `#F4C15D` | Producción |
| `--pill-sand` | `#C9BBA8` | `--ink` | Ventas |
| `--pill-olive` | `#7F8A55` | `--ink` (el blanco no llega a 4.5:1) | Libre |
| `--pill-slate` | `#8C93A3` | `--ink` (el blanco no llega a 4.5:1) | Libre |

No se inventan colores nuevos.

### Estados

| Token | Hex | Uso |
|---|---|---|
| `--alert` | `#C2412A` | Bajo el mínimo. Reservado SOLO para alertas, nunca como color de píldora |
| `--alert-bg` | `#FBE7E2` | Fondo de avisos en listas |
| `--ok` | `#3E7B5A` | Confirmación "Guardado" |

### Modo oscuro

`--bg #12172B`, `--surface #1D2340`, `--ink #FFFFFF`, `--ink-soft #A3A8BA`, `--line #2C3354`. Las píldoras mantienen su color, salvo `--pill-navy`, que pasa a `#34477A` para separarse del fondo. La barra inferior se queda blanca con iconos `#1C2236` (como en la referencia). El texto de error usa `#F0A08A`, porque `--alert` no llega a 4.5:1 sobre el fondo oscuro.

## Tipografía

Una sola familia: **Outfit** (Google Fonts), sans geométrica y redondeada. Fallback: `"Outfit", "Avenir Next", "Segoe UI", system-ui, sans-serif`.

| Rol | Tamaño | Peso | Notas |
|---|---|---|---|
| Logo / título de app | 22px | 700 | Minúsculas, centrado en la cabecera |
| Número grande | 34px | 700 | `font-variant-numeric: tabular-nums` |
| Nombre en píldora del menú | 24px | 700 | |
| Etiqueta en píldora | 12px | 500 | Sobre el nombre, color de acento, en minúscula normal |
| Título de pantalla | 24px | 700 | |
| Texto | 16px | 400 | Nunca menos de 16px en campos (evita el zoom en iPhone) |
| Pequeño | 13px | 500 | Unidades, horas, ayudas |

Nada en mayúsculas sostenidas. Las unidades van al lado del número, en tamaño pequeño: **12** u.

## Forma y espacio

- Píldoras: `border-radius: 999px`, alto mínimo 88px, padding izquierdo 24px.
- Botones y campos: `border-radius: 16px`, alto mínimo 52px.
- Botón central "+": círculo de 60px, `--ink`, sobresale 20px por encima de la barra inferior.
- Barra inferior: `border-radius: 28px 28px 0 0`, fondo `--surface` (claro) o blanco (oscuro).
- Espaciado base de 8px: 8 / 12 / 16 / 24 / 32. Separación entre píldoras: 16px.
- Márgenes laterales: 20px. Ancho máximo del contenido: 480px, centrado en pantallas grandes.
- Sin sombras en las píldoras; el color separa. Única sombra: barra inferior y hojas que suben (`0 -4px 24px rgba(28,34,54,.08)`).

## Componentes

### Píldoras del menú (Hoy)

```
┌─────────────────────────────────────╮  ╭───────╮
│  lo que hay                         │  │ ilus- │
│  Inventario                         │──│ tración│
└─────────────────────────────────────╯  ╰───────╯
```

- Inventario (mustard, "lo que hay"), Recetas (plum, "lo que lleva cada pan"), Producción (navy, "lo que entra o se compra") y Ventas (sand, "panes y bebidas que salen").
- Izquierda: etiqueta corta y nombre en 24px. Derecha: ilustración circular de 96px que se sale 12px por el borde derecho y el superior.
- Si hay algo pendiente: borde de 3px `--alert` y una pastilla blanca arriba a la izquierda con texto `--alert` ("1 por comprar"). El color de la píldora no cambia.

### Lo que falta hacer (Hoy)

Debajo de las píldoras. Filas con fondo `--alert-bg`, un punto `--alert` y el texto "Comprar **Chicha**: quedan 2 u. · mínimo 3". Si no hay nada pendiente, una nota tranquila: "Todo está sobre el mínimo". Solo datos reales, nunca de ejemplo.

### Gráfica de inventario

Aquí no van píldoras de colores, porque serían demasiadas. Arriba, un buscador. Después, una gráfica de barras horizontales agrupada por categoría (encabezado de 13px en `--ink-soft`), con las casillas en orden alfabético dentro de cada grupo: nombre a la izquierda, barra en `--ink` sobre una pista `--surface` (misma escala dentro del grupo, punta derecha con radio de 4px) y el número con su unidad a la derecha. Una rayita `--alert` de 2px marca el mínimo sobre la pista; si está bajo o en negativo, el número va en `--alert` con un punto al lado. Arriba a la derecha, el botón "+ Nueva casilla".

### Filas con campo de número (Producción y Ventas)

Una fila por casilla, producto o bebida: el nombre a la izquierda (con una nota pequeña debajo, por ejemplo "hay 7 porc. · en porciones", o la pastilla "Sin receta" / "Provisional") y el campo de número a la derecha. Divisores `--line` entre filas. Producción lleva buscador y los mismos grupos que Inventario; Ventas va en grupos Cultos, Criollos, Papas y Bebidas. Abajo, el botón principal a lo ancho ("Guardar entradas", "Revisar descuento").

### Resumen de descuento (Ventas)

Hoja que sube con el título "Se va a descontar", una fila por casilla con "−3 u." y, si hay panes sin receta, una nota con fondo `--alert-bg`. Abajo, "Confirmar ventas".

### Editor de receta

Hoja que sube con el nombre del producto. Un bloque por ingrediente: el selector de casilla a lo ancho (con las casillas agrupadas por categoría) y, debajo, el campo de número con la unidad ("g por pan · 1 porc. = 140 g") y el botón "Quitar". Después, "+ Agregar ingrediente" (secundario) y "Guardar receta" (principal).

### Hoja que sube

Fondo `--bg`, esquinas superiores de 28px, con un tirador gris arriba (también sirve para cerrar). Botón principal a lo ancho, con fondo `--ink` y texto blanco.

### Botón "+" central

Abre un menú corto con tres opciones grandes: "Lo que entró", "Ventas del día" y "Nueva casilla".

### Barra inferior

Iconos de línea de 24px con etiqueta de 12px debajo: Hoy, Inventario, [+], Recetas, Más. La sección activa se muestra con el icono relleno y la etiqueta en peso 700. Producción y Ventas marcan Hoy. "Más" abre una lista simple con Movimientos, Ajustes y "Cambiar de usuario".

### Campos de número

Usan `inputmode="decimal"` para abrir el teclado numérico. Tienen botones − y + de 44px a los lados para ajustar sin escribir, y el número va centrado en 24px y peso 700.

### Pastillas de estado

Blancas, borde de 1.5px y texto `--alert`, 12px y peso 700: "Sin receta", "1 por comprar". "Provisional" no es una alerta: va con borde y texto `--ink-soft` sobre `--bg`.

### Avisos

Son toasts que aparecen arriba, con fondo `--ink`, texto blanco y 3 segundos de duración: "Guardado", "No se pudo guardar. Revisa tu conexión y vuelve a intentar."

## Ilustraciones

- Estilo plano, vista cenital (desde arriba), formas simples, sin contornos negros y sin degradados, igual que la referencia.
- Una por píldora del menú, en SVG, dentro de un círculo: `inventario.svg` (cajón con productos), `recetas.svg` (pan), `produccion.svg` (olla) y `ventas.svg` (boleta y monedas). Se pueden reemplazar con el mismo nombre de archivo.
- Si falta una ilustración, se muestra un círculo `--surface` con la inicial del nombre en 28px y peso 700.
- No usar emojis ni fotos dentro de las píldoras.

## Movimiento

- La hoja que sube aparece en 220ms con `ease-out`.
- Nada más se anima. Con `prefers-reduced-motion` se quita todo.

## Accesibilidad

- El texto sobre cada color de píldora cumple un contraste de 4.5:1 como mínimo. Si una etiqueta de acento no lo cumple, se usa blanco o `--ink`.
- Las alertas nunca dependen solo del color: siempre llevan texto.
- El foco visible es un anillo de 3px `--ink`, con 2px de separación.
- Las áreas táctiles miden como mínimo 44×44px.

## No hacer

- No usar `--alert` como color de una píldora.
- No poner más de 6 colores de píldora.
- No meter tablas anchas: en celular todo va en filas, barras o píldoras.
- No mezclar familias tipográficas.
- No usar sombras grandes ni degradados en las tarjetas.
- No mostrar datos ni alertas de ejemplo: solo lo real.
