// ---------------------------------------------------------------------------
// Compras: lo que se compró (apertura del día)
// ---------------------------------------------------------------------------

// Compras de hoy (para no anotar dos veces) y lo que se puede comprar.
function cargarCompras() {
  const fecha = hoyLima();
  const productos = {};
  leerTabla('Insumos').forEach((i) => { productos[i.id] = i; });
  const compras = movimientosDeFecha(fecha).filter((m) => m.tipo === 'compra')
    .sort((a, b) => momentoDe(a).localeCompare(momentoDe(b)))
    .map((m) => {
      const i = productos[m.insumo_id] || {};
      return {
        insumo_id: m.insumo_id, nombre: i.nombre || m.insumo_id, unidad: i.unidad || '', cantidad: num(m.cantidad),
        precio: vacio(m.precio) ? '' : num(m.precio), hora: m.hora, usuario: m.usuario
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

registrar('cargarCompras', cargarCompras);
registrar('registrarCompras', registrarCompras);
