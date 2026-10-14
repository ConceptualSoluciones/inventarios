// ---------------------------------------------------------------------------
// Hoy: en qué va el día
// ---------------------------------------------------------------------------

// Hoy: en qué va el día (Apertura → Producción → Cierre), según lo anotado en el día de operación.
function cargarHoy() {
  const fecha = hoyLima();
  const movs = movimientosDeFecha(fecha);
  const distintos = (lista) => lista.map((m) => m.insumo_id).filter((id, k, ids) => ids.indexOf(id) === k).length;
  return {
    fecha: fecha,
    insumos: insumosActivos(),
    dia: {
      compras: distintos(movs.filter((m) => m.tipo === 'compra' && !compraAnulada(m))),
      // Lo que salió de Producción (lo preparado al ojo deja un movimiento "nivel" con origen de producción).
      produccion: distintos(movs.filter((m) => esProduccion(m) && m.tipo !== 'produccion_usado')),
      // El cierre deja ventas (origen "venta:<fecha>"), salidas a Habemus o merma.
      cierre: movs.some((m) => String(m.origen).indexOf('venta:') === 0 || m.tipo === 'salida_habemus' || m.tipo === 'merma')
    }
  };
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_HOY = {
  cargarHoy: { fn: cargarHoy }
};
