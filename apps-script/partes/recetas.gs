
// ---------------------------------------------------------------------------
// Recetas (lo que lleva UN plato o UNA bebida vendida)
// ---------------------------------------------------------------------------

function cargarRecetas() {
  const ingredientes = leerTabla('RecetaIngredientes');
  const recetas = leerTabla('Recetas').filter((r) => activo(r.activa)).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    grupo: GRUPOS_RECETA.indexOf(r.grupo) >= 0 ? r.grupo : 'cultos',
    estado: ESTADOS_RECETA.indexOf(r.estado) >= 0 ? r.estado : 'vigente',
    revisar: marcado(r.revisar),
    notas: r.notas,
    ingredientes: ingredientes
      .filter((i) => i.receta_id === r.id)
      .map((i) => ({ insumo_id: i.insumo_id, cantidad: num(i.cantidad), al_ojo: marcado(i.al_ojo) }))
  }));
  return { recetas: recetas, insumos: insumosActivos() };
}

function crearReceta(d) {
  const nombre = String(d.nombre || '').trim().slice(0, 40);
  if (!nombre) throw new ErrorApp('Falta el nombre.', 'datos');
  return conBloqueo(() => {
    if (leerTabla('Recetas').some((r) => activo(r.activa) && mismoNombre(r.nombre, nombre))) {
      throw new ErrorApp('Ya existe una receta llamada ' + nombre + '.', 'datos');
    }
    const id = nuevoId('rec');
    const grupo = GRUPOS_RECETA.indexOf(d.grupo) >= 0 ? d.grupo : 'cultos';
    agregarFilas('Recetas', [{ id: id, nombre: nombre, grupo: grupo, estado: 'vigente', revisar: '', activa: true, notas: '' }]);
    return Object.assign({ id: id }, cargarRecetas());
  });
}

// Cada ingrediente lleva una cantidad (se descuenta con cada venta) o va "al ojo" (solo informa, no descuenta).
// Solo lo que se cuenta puede llevar cantidad. revisado: true le quita la marca "por revisar".
function guardarReceta(d) {
  const recetaId = String(d.id || '');
  const lista = (Array.isArray(d.ingredientes) ? d.ingredientes : []).map((i) => {
    const alOjo = Boolean(i.al_ojo);
    return { insumo_id: String(i.insumo_id || ''), al_ojo: alOjo, cantidad: alOjo ? 0 : validarNumero(i.cantidad, 'la cantidad') };
  });
  if (lista.some((i) => !i.al_ojo && i.cantidad <= 0)) {
    throw new ErrorApp('Cada ingrediente necesita una cantidad mayor que 0 o ir "al ojo".', 'datos');
  }

  return conBloqueo(() => {
    const receta = leerTabla('Recetas').find((r) => r.id === recetaId && activo(r.activa));
    if (!receta) throw new ErrorApp('No se encontró la receta.', 'datos');
    const productos = {};
    insumosActivos().forEach((i) => { productos[i.id] = i; });
    // Si un ingrediente se repite, se suman las cantidades. Si va con cantidad y también al ojo, gana la cantidad.
    const porInsumo = {};
    lista.forEach((i) => {
      const p = productos[i.insumo_id];
      if (!p) throw new ErrorApp('No se encontró uno de los ingredientes. Recarga la página.', 'datos');
      if (!i.al_ojo && !seCuenta(p)) throw new ErrorApp(p.nombre + ' va al ojo: no puede llevar cantidad.', 'datos');
      const antes = porInsumo[i.insumo_id] || 0;
      porInsumo[i.insumo_id] = i.al_ojo ? antes : redondear(antes + i.cantidad);
    });
    // Solo se tocan las filas de esta receta.
    borrarFilas('RecetaIngredientes', 'receta_id', (v) => v === recetaId);
    agregarFilas('RecetaIngredientes', Object.keys(porInsumo).map((id) => ({
      receta_id: recetaId, insumo_id: id, cantidad: porInsumo[id] || '', al_ojo: porInsumo[id] ? '' : 'sí'
    })));
    if (d.revisado && marcado(receta.revisar)) {
      hoja('Recetas').getRange(receta._fila, HOJAS.Recetas.indexOf('revisar') + 1).setValue('');
    }
    return cargarRecetas();
  });
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_RECETAS = {
  cargarRecetas: { fn: cargarRecetas },
  crearReceta: { fn: crearReceta, soloAdmin: true },
  guardarReceta: { fn: guardarReceta, soloAdmin: true }
};
