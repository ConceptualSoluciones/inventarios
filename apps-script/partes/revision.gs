// ---------------------------------------------------------------------------
// Revisión inicial (solo admin): el punto de partida
// ---------------------------------------------------------------------------

// Revisión inicial: lo que hay de cada producto que se cuenta (entra como ajuste de conteo por la diferencia)
// y el nivel real de lo que va al ojo.
function guardarRevision(d, ctx) {
  const conteos = (Array.isArray(d.conteos) ? d.conteos : [])
    .map((c) => ({ insumo_id: String(c.insumo_id || ''), cantidad: validarNumero(c.cantidad, 'la cantidad') }));
  const niveles = Array.isArray(d.niveles) ? d.niveles : [];
  if (!conteos.length && !niveles.length) throw new ErrorApp('No hay cambios para guardar.', 'datos');

  return conBloqueo(() => {
    const porId = {};
    insumosActivos().forEach((i) => { porId[i.id] = i; });
    const hora = horaLima();
    const ajustes = [];
    conteos.forEach((c) => {
      const i = porId[c.insumo_id];
      if (!i || !seCuenta(i)) throw new ErrorApp('No se encontró uno de los productos. Recarga la página.', 'datos');
      const diferencia = redondear(c.cantidad - i.stock_actual);
      if (diferencia) ajustes.push(movimiento(i.id, 'ajuste_conteo', diferencia, ctx, { hora: hora, nota: 'Revisión inicial' }));
    });
    agregarFilas('Movimientos', ajustes);
    const cambios = aplicarNiveles(niveles, ctx);
    if (ajustes.length) recalcularStocks();
    return { ajustes: ajustes.length, niveles: cambios, insumos: insumosActivos() };
  });
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_REVISION = {
  guardarRevision: { fn: guardarRevision, soloAdmin: true }
};
