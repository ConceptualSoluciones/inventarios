// ---------------------------------------------------------------------------
// Movimientos: historial
// ---------------------------------------------------------------------------

const MAX_HISTORIAL = 200;

// Historial de un día (solo lee las filas de ese día) o, sin fecha, todo el de un producto. Lo más nuevo primero.
function cargarMovimientos(d) {
  const insumoId = String(d.insumo_id || '');
  let movs;
  if (!vacio(d.fecha)) movs = movimientosDeFecha(validarFecha(d.fecha));
  else if (insumoId) movs = leerTabla('Movimientos');
  else throw new ErrorApp('Elige un día o un producto.', 'datos');
  if (insumoId) movs = movs.filter((m) => m.insumo_id === insumoId);
  // Dentro del mismo minuto se respeta el orden en que se anotaron (al revés: lo último primero).
  // Se ordena por el momento real, no por día de operación + hora (lo anotado a la 01:30 va después de las 22:00).
  movs.reverse().sort((a, b) => momentoDe(b).localeCompare(momentoDe(a)));

  // Nombres también de productos desactivados, para que el historial no quede con ids sueltos.
  const productos = {};
  leerTabla('Insumos').forEach((i) => { productos[i.id] = i; });
  return {
    total: movs.length,
    movimientos: movs.slice(0, MAX_HISTORIAL).map((m) => {
      const i = productos[m.insumo_id] || {};
      return {
        id: m.id, fecha: m.fecha, hora: m.hora, insumo_id: m.insumo_id, nombre: i.nombre || m.insumo_id,
        unidad: i.unidad || '', tipo: m.tipo, cantidad: vacio(m.cantidad) ? '' : valorMovimiento(m),
        precio: vacio(m.precio) ? '' : num(m.precio), origen: m.origen, nota: m.nota, usuario: m.usuario
      };
    }),
    insumos: insumosActivos()
  };
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_MOVIMIENTOS = {
  cargarMovimientos: { fn: cargarMovimientos }
};
