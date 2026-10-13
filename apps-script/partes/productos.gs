// ---------------------------------------------------------------------------
// Productos (solo admin): crear, editar, forma de medir, origen, alias y quitar
// ---------------------------------------------------------------------------

// Lee y valida lo que manda la pantalla de Productos.
function datosProducto(d) {
  const nombre = String(d.nombre || '').trim().slice(0, 40);
  if (!nombre) throw new ErrorApp('Falta el nombre.', 'datos');
  const medicion = String(d.medicion || '');
  if (MEDICIONES.indexOf(medicion) < 0) throw new ErrorApp('Elige cómo se mide.', 'datos');
  const ojo = medicion === 'ojo';
  const alias = [];
  listaAlias(d.alias).forEach((a) => {
    a = a.slice(0, 40);
    if (!mismoNombre(a, nombre) && !alias.some((x) => mismoNombre(x, a))) alias.push(a);
  });
  return {
    nombre: nombre, alias: alias.join(', '), categoria: String(d.categoria || '').trim().slice(0, 30) || 'Otros',
    medicion: medicion,
    unidad: ojo ? '' : medicion === 'gramos' ? 'g'
      : String(d.unidad || '').trim().toLowerCase().slice(0, 20) || UNIDAD_POR_DEFECTO[medicion],
    stock_minimo: ojo || vacio(d.stock_minimo) ? 0 : validarNumero(d.stock_minimo, 'el mínimo'),
    nota: String(d.nota || '').trim().slice(0, 80),
    origen: ORIGENES.indexOf(d.origen) >= 0 ? d.origen : origenDe({ medicion: medicion })
  };
}

function listaAlias(alias) { return String(alias || '').split(',').map((a) => a.trim()).filter(Boolean); }

// Ningún nombre ni alias se repite entre productos activos: "chancho" tiene que llevar a un solo producto.
function revisarNombres(p, otros) {
  const nombres = [p.nombre].concat(listaAlias(p.alias));
  otros.forEach((o) => {
    const suyos = [o.nombre].concat(listaAlias(o.alias));
    const choca = nombres.find((n) => suyos.some((s) => mismoNombre(s, n)));
    if (choca) throw new ErrorApp('"' + choca + '" ya es el nombre o un alias de ' + o.nombre + '.', 'datos');
  });
}

function crearProducto(d, ctx) {
  const p = datosProducto(d);
  const cuenta = seCuenta(p);
  const stock = !cuenta || vacio(d.stock_actual) ? 0 : validarNumero(d.stock_actual, 'la cantidad');
  return conBloqueo(() => {
    revisarNombres(p, leerTabla('Insumos').filter((i) => activo(i.activo)));
    const id = nuevoId('prod');
    agregarFilas('Insumos', [Object.assign({ id: id }, p, {
      stock_actual: cuenta ? 0 : '', stock_minimo: cuenta ? p.stock_minimo : '',
      estado_actual: cuenta ? '' : NIVEL_INICIAL, revisar: '', activo: true
    })]);
    // El stock nunca se escribe directo: lo que ya hay entra como un ajuste de conteo.
    if (stock > 0) {
      agregarFilas('Movimientos', [movimiento(id, 'ajuste_conteo', stock, ctx, { nota: 'Stock inicial' })]);
      recalcularStocks();
    }
    return { id: id, insumos: insumosActivos() };
  });
}

// Edita un producto. revisado: true le quita la marca "por revisar".
// Con desactivar: true sale de la app; la fila queda en el Sheet para que el historial tenga su nombre.
function guardarProducto(d) {
  return conBloqueo(() => {
    const activos = leerTabla('Insumos').filter((i) => activo(i.activo));
    const i = activos.find((x) => x.id === String(d.id || ''));
    if (!i) throw new ErrorApp('No se encontró el producto. Recarga la página.', 'datos');

    if (d.desactivar) {
      const recetas = recetasQueLlevan(i.id, true);
      if (recetas.length) throw new ErrorApp('Está en la receta de ' + recetas.join(', ') + '. Quítalo de ahí primero.', 'datos');
      ponerCampos(i._fila, { activo: 'no' });
      return { insumos: insumosActivos() };
    }

    const p = datosProducto(d);
    revisarNombres(p, activos.filter((x) => x.id !== i.id));
    const ojo = p.medicion === 'ojo';
    if (ojo && i.medicion !== 'ojo') {
      const recetas = recetasQueLlevan(i.id, false);
      if (recetas.length) {
        throw new ErrorApp('Se descuenta en la receta de ' + recetas.join(', ') + '. Ahí ponlo "al ojo" primero.', 'datos');
      }
    }
    ponerCampos(i._fila, {
      nombre: p.nombre, alias: p.alias, categoria: p.categoria, medicion: p.medicion, unidad: p.unidad,
      stock_minimo: ojo ? '' : p.stock_minimo,
      estado_actual: !ojo ? '' : NIVELES.indexOf(i.estado_actual) >= 0 ? i.estado_actual : NIVEL_INICIAL,
      nota: p.nota, origen: p.origen,
      revisar: d.revisado ? '' : i.revisar
    });
    recalcularStocks(); // si cambió el mínimo o la forma de medir
    return { insumos: insumosActivos() };
  });
}

// Nombres de las recetas activas que llevan el producto. conOjo: cuenta también las que lo llevan al ojo.
function recetasQueLlevan(insumoId, conOjo) {
  const ids = {};
  leerTabla('RecetaIngredientes').forEach((ri) => {
    if (ri.insumo_id === insumoId && (conOjo || !marcado(ri.al_ojo))) ids[ri.receta_id] = true;
  });
  return leerTabla('Recetas').filter((r) => activo(r.activa) && ids[r.id]).map((r) => r.nombre);
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_PRODUCTOS = {
  crearProducto: { fn: crearProducto, soloAdmin: true },
  guardarProducto: { fn: guardarProducto, soloAdmin: true }
};
