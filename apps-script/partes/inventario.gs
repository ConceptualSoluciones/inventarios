// ---------------------------------------------------------------------------
// Inventario: lo que hay (solo para ver)
// ---------------------------------------------------------------------------

function cargarInventario() {
  return { insumos: insumosActivos() };
}

registrar('cargarInventario', cargarInventario);
