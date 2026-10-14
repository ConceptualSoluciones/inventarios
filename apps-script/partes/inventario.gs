// ---------------------------------------------------------------------------
// Inventario: lo que hay (solo para ver)
// ---------------------------------------------------------------------------

function cargarInventario() {
  return { insumos: insumosActivos(), categorias: categoriasActivas() };
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_INVENTARIO = {
  cargarInventario: { fn: cargarInventario }
};
