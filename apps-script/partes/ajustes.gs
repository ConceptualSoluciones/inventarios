// ---------------------------------------------------------------------------
// Ajustes (solo admin): conteo de un producto y mínimos
// ---------------------------------------------------------------------------

// Mínimos de lo que se cuenta. Vacío o 0 = sin mínimo.
function guardarMinimos(d) {
  const lista = (Array.isArray(d.minimos) ? d.minimos : []).map((m) => ({
    insumo_id: String(m.insumo_id || ''),
    minimo: vacio(m.minimo) ? 0 : validarNumero(m.minimo, 'el mínimo')
  }));
  if (!lista.length) throw new ErrorApp('No hay cambios para guardar.', 'datos');
  return conBloqueo(() => {
    const porId = {};
    leerTabla('Insumos').forEach((i) => { porId[i.id] = i; });
    lista.forEach((m) => {
      const i = porId[m.insumo_id];
      if (!i || !activo(i.activo) || !seCuenta(i)) throw new ErrorApp('No se encontró uno de los productos. Recarga la página.', 'datos');
      ponerCampos(i._fila, { stock_minimo: m.minimo });
    });
    recalcularStocks(); // si algo quedó bajo su nuevo mínimo, avisa
    return { guardados: lista.length, insumos: insumosActivos() };
  });
}

// Conteo: entra la diferencia entre lo contado y lo que dice el sistema.
function ajustarStock(d, ctx) {
  const cantidad = validarNumero(d.cantidad, 'lo contado');
  const nota = String(d.nota || '').trim().slice(0, 200) || 'Conteo';
  return conBloqueo(() => {
    const i = insumosActivos().find((x) => x.id === String(d.insumo_id || ''));
    if (!i || !seCuenta(i)) throw new ErrorApp('Elige un producto que se cuente.', 'datos');
    const diferencia = redondear(cantidad - i.stock_actual);
    if (diferencia) {
      agregarFilas('Movimientos', [movimiento(i.id, 'ajuste_conteo', diferencia, ctx, { nota: nota })]);
      recalcularStocks();
    }
    return { diferencia: diferencia, insumos: insumosActivos() };
  });
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_AJUSTES = {
  guardarMinimos: { fn: guardarMinimos, soloAdmin: true },
  ajustarStock: { fn: ajustarStock, soloAdmin: true }
};
