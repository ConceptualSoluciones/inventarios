
// ---------------------------------------------------------------------------
// Producción: lo que se usó (resta) y lo que salió (suma). Las cantidades las pone quien produce.
// ---------------------------------------------------------------------------

// Lo que sale de Producción es lo hecho en casa (porciones, jarras, salsas…); lo que va al ojo queda en "lleno".
// Lo que se usa es lo comprado que se cuenta (carne cruda, huevos…).

// Las producciones de hoy, cada una con lo que se usó y lo que salió.
function cargarProduccion() {
  const fecha = hoyLima();
  const productos = {};
  leerTabla('Insumos').forEach((i) => { productos[i.id] = i; });
  const grupos = {};
  movimientosDeFecha(fecha).filter(esProduccion).forEach((m) => {
    const g = grupos[m.origen] || (grupos[m.origen] = { hora: m.hora, usuario: m.usuario, momento: momentoDe(m), usados: [], salidas: [] });
    const i = productos[m.insumo_id] || {};
    const item = {
      insumo_id: m.insumo_id, nombre: i.nombre || m.insumo_id, unidad: i.unidad || '',
      cantidad: vacio(m.cantidad) ? '' : num(m.cantidad), nivel: m.tipo === 'nivel' ? m.nota : ''
    };
    (m.tipo === 'produccion_usado' ? g.usados : g.salidas).push(item);
  });
  const producciones = Object.keys(grupos).map((k) => grupos[k]).sort((a, b) => a.momento.localeCompare(b.momento));
  return { fecha: fecha, producciones: producciones, insumos: insumosActivos() };
}

// usados: [{ insumo_id, cantidad }] de lo que se compra · salidas: [{ insumo_id, cantidad }] de lo que se prepara
// (lo que va al ojo no lleva cantidad). Todos los movimientos de una producción comparten el origen "produccion:<id>".
function registrarProduccion(d, ctx) {
  const leer = (lista, nombre) => (Array.isArray(lista) ? lista : []).map((e) => ({
    insumo_id: String(e.insumo_id || ''), cantidad: vacio(e.cantidad) ? 0 : validarNumero(e.cantidad, nombre)
  }));
  const usados = leer(d.usados, 'lo que usaste').filter((e) => e.cantidad > 0);
  const salidas = leer(d.salidas, 'lo que salió');

  return conBloqueo(() => {
    const porId = {};
    leerTabla('Insumos').forEach((i) => { porId[i.id] = i; });
    const producto = (e) => {
      const p = porId[e.insumo_id];
      if (!p || !activo(p.activo)) throw new ErrorApp('No se encontró uno de los productos. Recarga la página.', 'datos');
      return p;
    };
    usados.forEach((e) => {
      const p = producto(e);
      if (origenDe(p) !== 'comprado' || p.medicion === 'ojo') {
        throw new ErrorApp(p.nombre + ' no se puede anotar como usado: solo lo comprado que se cuenta.', 'datos');
      }
    });
    const salen = salidas.filter((e) => {
      const p = producto(e);
      if (origenDe(p) !== 'hecho_en_casa') throw new ErrorApp(p.nombre + ' no sale de Producción: se compra.', 'datos');
      return p.medicion === 'ojo' || e.cantidad > 0;
    });
    if (!salen.length) throw new ErrorApp('Escribe lo que salió de la producción.', 'datos');

    const extra = { hora: horaLima(), origen: 'produccion:' + Utilities.getUuid().slice(0, 8) };
    const colNivel = HOJAS.Insumos.indexOf('estado_actual') + 1;
    const movs = usados.map((e) => movimiento(e.insumo_id, 'produccion_usado', e.cantidad, ctx, extra));
    salen.forEach((e) => {
      const p = porId[e.insumo_id];
      if (p.medicion !== 'ojo') {
        movs.push(movimiento(e.insumo_id, 'produccion_salida', e.cantidad, ctx, extra));
        return;
      }
      // Lo que se prepara al ojo (una salsa nueva) queda lleno.
      hoja('Insumos').getRange(p._fila, colNivel).setValue(NIVEL_INICIAL);
      movs.push(movimiento(e.insumo_id, 'nivel', '', ctx, Object.assign({ nota: NIVEL_INICIAL }, extra)));
    });
    agregarFilas('Movimientos', movs);
    recalcularStocks();
    return cargarProduccion();
  });
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_PRODUCCION = {
  cargarProduccion: { fn: cargarProduccion },
  registrarProduccion: { fn: registrarProduccion }
};
