// ---------------------------------------------------------------------------
// Compras: lo que se compró (apertura del día). Por ahora solo las anota un admin.
// ---------------------------------------------------------------------------

// Una compra anulada no se borra: su columna origen pasa a "anulada:<id del movimiento que la revierte>".
// Ese movimiento (tipo compra_anulada) resta la misma cantidad y guarda el motivo, quién y cuándo.
function compraAnulada(m) { return String(m.origen).indexOf('anulada:') === 0; }

// Compras de hoy (para no anotar dos veces) y lo que se puede comprar. Las anuladas vienen marcadas.
function cargarCompras() {
  const fecha = hoyLima();
  const productos = {};
  leerTabla('Insumos').forEach((i) => { productos[i.id] = i; });
  const compras = movimientosDeFecha(fecha).filter((m) => m.tipo === 'compra')
    .sort((a, b) => momentoDe(a).localeCompare(momentoDe(b)))
    .map((m) => {
      const i = productos[m.insumo_id] || {};
      return {
        id: m.id, insumo_id: m.insumo_id, nombre: i.nombre || m.insumo_id, unidad: i.unidad || '', cantidad: num(m.cantidad),
        precio: vacio(m.precio) ? '' : num(m.precio), hora: m.hora, usuario: m.usuario, anulada: compraAnulada(m)
      };
    });
  return { fecha: fecha, compras: compras, insumos: insumosActivos() };
}

// Compras: todo lo que tiene origen "comprado", aunque vaya al ojo. Suma al inventario; lo que va al ojo
// guarda la cantidad comprada y queda en Lleno. El precio total de cada compra es opcional.
function registrarCompras(d, ctx) {
  const compras = (Array.isArray(d.compras) ? d.compras : [])
    .map((e) => ({
      insumo_id: String(e.insumo_id || ''),
      cantidad: validarNumero(e.cantidad, 'la cantidad'),
      precio: vacio(e.precio) ? '' : validarNumero(e.precio, 'el precio')
    }))
    .filter((e) => e.cantidad > 0);
  if (!compras.length) throw new ErrorApp('Escribe al menos una cantidad.', 'datos');

  return conBloqueo(() => {
    const productos = {};
    insumosActivos().forEach((i) => { productos[i.id] = i; });
    compras.forEach((e) => {
      const p = productos[e.insumo_id];
      if (!p) throw new ErrorApp('No se encontró uno de los productos. Recarga la página.', 'datos');
      if (!seCompra(p)) throw new ErrorApp(p.nombre + ' no se compra: se hace en casa (sale de Producción).', 'datos');
    });
    const hora = horaLima();
    agregarFilas('Movimientos', compras.map((e) =>
      movimiento(e.insumo_id, 'compra', e.cantidad, ctx, { hora: hora, precio: e.precio })));
    aplicarNiveles(compras.filter((e) => productos[e.insumo_id].medicion === 'ojo')
      .map((e) => ({ insumo_id: e.insumo_id, estado: NIVEL_INICIAL })), ctx);
    recalcularStocks();
    return Object.assign({ guardadas: compras.length }, cargarCompras());
  });
}

// Anula una compra (de cualquier día): no borra su fila. Agrega hoy un movimiento que resta la misma cantidad,
// con el motivo, y marca la compra como anulada. Para corregir una cantidad: anular y volver a anotar.
// Lo que va al ojo no cambia de nivel (no se sabe cómo estaba antes de la compra).
function anularCompra(d, ctx) {
  const id = String(d.id || '');
  const motivo = String(d.nota || '').trim().slice(0, 200);
  if (!motivo) throw new ErrorApp('Escribe el motivo de la anulación.', 'datos');
  return conBloqueo(() => {
    const compra = leerTabla('Movimientos').find((m) => m.id === id);
    if (!compra || compra.tipo !== 'compra') throw new ErrorApp('No se encontró la compra. Recarga la página.', 'datos');
    if (compraAnulada(compra)) throw new ErrorApp('Esa compra ya estaba anulada.', 'datos');
    const reversa = movimiento(compra.insumo_id, 'compra_anulada', Math.abs(num(compra.cantidad)), ctx, {
      origen: 'anula:' + compra.id, nota: motivo
    });
    agregarFilas('Movimientos', [reversa]);
    hoja('Movimientos').getRange(compra._fila, HOJAS.Movimientos.indexOf('origen') + 1).setValue('anulada:' + reversa.id);
    recalcularStocks();
    return { id: reversa.id, insumos: insumosActivos() };
  });
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_COMPRAS = {
  cargarCompras: { fn: cargarCompras, soloAdmin: true },
  registrarCompras: { fn: registrarCompras, soloAdmin: true },
  anularCompra: { fn: anularCompra, soloAdmin: true }
};
