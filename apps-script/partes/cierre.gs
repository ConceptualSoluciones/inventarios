// ---------------------------------------------------------------------------
// Cierre (solo admin): ventas del día y niveles al ojo
// ---------------------------------------------------------------------------

// Se guarda al momento, con quién y a qué hora.
function cambiarNivel(d, ctx) {
  return conBloqueo(() => {
    aplicarNiveles([{ insumo_id: d.insumo_id, estado: d.estado }], ctx);
    return { insumo: insumosActivos().find((i) => i.id === String(d.insumo_id)) };
  });
}

// ---------------------------------------------------------------------------

function cargarVentas(d) {
  const fecha = validarFecha(d.fecha || hoyLima());
  const ventas = leerTabla('VentasDia').filter((v) => v.fecha === fecha);
  const vendidos = (id) => {
    const v = ventas.find((x) => x.receta_id === id);
    return v ? num(v.cantidad) : 0;
  };
  const datos = cargarRecetas();
  return {
    fecha: fecha,
    guardado: ventas.length > 0,
    recetas: datos.recetas.map((r) => Object.assign({}, r, { vendidos: vendidos(r.id) })),
    insumos: datos.insumos
  };
}

// Reemplaza las ventas de la fecha (no suma) y rehace sus descuentos, así corregir no descuenta dos veces.
function guardarVentas(d, ctx) {
  const fecha = validarFecha(d.fecha);
  const lista = (Array.isArray(d.ventas) ? d.ventas : []).map((v) => ({
    receta_id: String(v.receta_id || ''),
    cantidad: validarNumero(v.cantidad, 'la cantidad')
  })).filter((v) => v.cantidad > 0);

  return conBloqueo(() => {
    const datos = cargarRecetas();
    const recetas = {};
    datos.recetas.forEach((r) => { recetas[r.id] = r; });
    const productos = {};
    datos.insumos.forEach((i) => { productos[i.id] = i; });

    const descuentos = {};
    const sinReceta = [];
    lista.forEach((v) => {
      const r = recetas[v.receta_id];
      if (!r) throw new ErrorApp('No se encontró uno de los productos vendidos. Recarga la página.', 'datos');
      const conCantidad = r.ingredientes.filter((ing) => !ing.al_ojo && productos[ing.insumo_id] && seCuenta(productos[ing.insumo_id]));
      if (!conCantidad.length) sinReceta.push(r.nombre);
      conCantidad.forEach((ing) => {
        descuentos[ing.insumo_id] = (descuentos[ing.insumo_id] || 0) + ing.cantidad * v.cantidad;
      });
    });

    // Solo se tocan las filas de esta fecha: sus ventas y los descuentos que esas ventas hicieron.
    const ahora = ahoraLima();
    borrarFilas('VentasDia', 'fecha', (v) => v === fecha);
    agregarFilas('VentasDia', lista.map((v) => ({
      fecha: fecha, receta_id: v.receta_id, cantidad: v.cantidad, actualizado_por: ctx.usuario, actualizado_en: ahora
    })));

    const origen = 'venta:' + fecha;
    const hora = horaLima();
    const nuevos = Object.keys(descuentos).map((id) => movimiento(id, 'venta', redondear(descuentos[id]), ctx,
      { fecha: fecha, hora: hora, origen: origen, nota: 'Ventas del día' }));
    borrarFilas('Movimientos', 'origen', (v) => v === origen);
    agregarFilas('Movimientos', nuevos);
    recalcularStocks();

    return {
      sinReceta: sinReceta,
      descontado: nuevos.map((m) => ({ insumo_id: m.insumo_id, cantidad: m.cantidad })),
      insumos: insumosActivos()
    };
  });
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_CIERRE = {
  cambiarNivel: { fn: cambiarNivel, soloAdmin: true },
  cargarVentas: { fn: cargarVentas },
  guardarVentas: { fn: guardarVentas, soloAdmin: true }
};
