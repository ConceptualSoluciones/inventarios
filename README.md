# SANTO · control

App interna de inventario, recetas y control diario de SANTO. La página es un sitio estático; los datos viven en un Google Sheet y los atiende un Apps Script (`apps-script/`).

## Cómo se usa en el día a día

1. **Revisión inicial (una sola vez).** Cuando la app empieza a usarse, se cuenta todo lo que hay y se anota en *Más › Revisión inicial*. Ese es el punto de partida. Después no se vuelve a contar todo cada día.
2. **Todos los días:**
   - **Al inicio del día:** se anota lo que se compra y lo que se produce.
   - **En la noche, en el cierre de caja:** se anota lo que se vendió.

   La app suma las compras y la producción, y resta las ventas sola.
3. **Conteos de confirmación (de vez en cuando).** Sirven para revisar que el stock cuadre. Se hacen **solo al inicio del día** (antes de anotar compras y producción) **o después del cierre de caja**. **Nunca en medio del día.**

### Por qué nunca se cuenta en medio del día

Cuando se cuenta, la app guarda la diferencia entre lo contado y lo que ella tenía anotado en ese momento. Si en ese momento hay ventas que todavía no se anotaron, se terminan restando dos veces.

Ejemplo con panes:

- La app dice que hay **10** panes.
- Durante el día se venden **4**, pero todavía no se anotan (se anotan en el cierre).
- Alguien cuenta a media tarde: hay **6**. La app corrige su número de 10 a 6.
- En el cierre de caja se anota la venta de 4. La app resta otra vez: ahora dice **2**, pero en el local hay **6**.

Contando solo al inicio del día o después del cierre, todo lo vendido ya está anotado y no pasa.

## Equipo y PINs

Cada persona entra con **su propio PIN de 6 números**. El nombre que aparece en Movimientos sale de ese PIN, no de lo que se escribe en el celular.

Los PINs están en la pestaña **Equipo** del Sheet (`nombre`, `pin_hash`, `rol`, `activo`). El PIN nunca se guarda tal cual: `pin_hash` es una sal al azar y el SHA-256 de sal + PIN, así que no se puede leer mirando la hoja. Ojo: con solo 6 números, alguien con acceso al Sheet y conocimientos técnicos podría averiguar un PIN probando todas las combinaciones en su computadora. Por eso el Sheet debe estar compartido solo con quienes lo administran.

### Roles

| Rol | Puede |
| --- | --- |
| `admin` | Todo: Ajustes, editar recetas, Revisión inicial y corregir días pasados. |
| `cocina` | Todo lo demás: Hoy, Inventario, Producción, ventas del día, ver recetas y Movimientos. |

El Apps Script revisa el rol en cada pedido: no basta con esconder botones en la pantalla.

**Ten siempre al menos 2 personas con rol `admin`.** Si hay una sola y pierde el celular, se va de vacaciones o se le da de baja, nadie puede tocar Ajustes, recetas ni días pasados hasta que alguien con acceso al Sheet agregue otro admin.

### Celular reconocido

Al entrar con el PIN correcto, ese celular queda reconocido por **30 días**: guarda una clave de sesión (no el PIN) y no vuelve a pedirlo hasta que venza. "Cambiar de usuario" (en Más) la cierra en el servidor y la borra del celular.

### Dar de alta a alguien

1. Abre el Google Sheet. Arriba aparece el menú **SANTO**. Si no aparece, recarga la página.
2. **SANTO › Agregar persona** pide tres cosas: nombre, PIN de 6 números y rol (`admin` o `cocina`).
3. La primera vez, Google pide permiso para el menú: acéptalo.

Si escribes un nombre que ya existe, a esa persona se le cambia el PIN o el rol y queda activa. Así se cambia el PIN de alguien que lo olvidó. Dos personas activas no pueden tener el mismo PIN.

También se puede hacer desde el editor de Apps Script, con una función de un solo uso:

```js
function altaRosa() { agregarPersona('Rosa', '482915', 'cocina'); }
```

Ejecútala y **bórrala después**, para que el PIN no quede escrito en el código.

### Dar de baja a alguien (por ejemplo, si pierde el celular)

1. Abre el Sheet, pestaña **Equipo**.
2. En la fila de esa persona, escribe **`no`** en la columna `activo`.

Es inmediato: desde ese momento su PIN ya no sirve y se anulan todas sus sesiones, así que el celular perdido no puede guardar ni ver nada. Para volver a darle acceso, usa **SANTO › Agregar persona** con su nombre y un PIN nuevo. Cambiarle el PIN también anula sus sesiones anteriores.

No borres la fila: así se ve en el historial quién fue.

### Intentos fallidos

Si se escriben **10 PINs equivocados en 10 minutos** (sumando todos los celulares), la app bloquea los ingresos nuevos durante **15 minutos** y manda por Telegram: *"Se bloqueó el acceso por intentos fallidos"*. Mientras dura el bloqueo no entra nadie con PIN, ni siquiera con el correcto. Los celulares que ya estaban reconocidos siguen funcionando normalmente.

Si llega ese aviso y no fue nadie del equipo, alguien está probando PINs: avisa a quien administra la app.
