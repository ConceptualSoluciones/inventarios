// ---------------------------------------------------------------------------
// Compras: lo que se compró (apertura del día). Por ahora solo las anota un admin, que también arma la lista:
// categorías (con emoji) y productos con su unidad de compra (gramos o unidad).
// ---------------------------------------------------------------------------

// Una compra anulada no se borra: su columna origen pasa a "anulada:<id del movimiento que la revierte>".
// Ese movimiento (tipo compra_anulada) resta la misma cantidad y guarda el motivo, quién y cuándo.
function compraAnulada(m) { return String(m.origen).indexOf('anulada:') === 0; }
function esCompra(m) { return m.tipo === 'compra' || m.tipo === 'compra_anulada'; }

// En qué unidad se muestra una compra: la del inventario si suma ahí; si no, g o unidad (la de compra).
function unidadDeCompra(i) {
  if (sumaAlComprar(i)) return i.unidad || UNIDAD_POR_DEFECTO[i.medicion];
  return unidadCompraDe(i) === 'unidad' ? 'unidad' : 'g';
}

// Compras de hoy (para no anotar dos veces), lo que se puede comprar y las categorías. Las anuladas vienen marcadas.
function cargarCompras() {
  const fecha = hoyLima();
  const productos = {};
  leerTabla('Insumos').forEach((i) => { productos[i.id] = i; });
  const compras = movimientosDeFecha(fecha).filter((m) => m.tipo === 'compra')
    .sort((a, b) => momentoDe(a).localeCompare(momentoDe(b)))
    .map((m) => {
      const i = productos[m.insumo_id] || {};
      return {
        id: m.id, insumo_id: m.insumo_id, nombre: i.nombre || m.insumo_id, unidad: unidadDeCompra(i), cantidad: num(m.cantidad),
        precio: vacio(m.precio) ? '' : num(m.precio), hora: m.hora, usuario: m.usuario, anulada: compraAnulada(m)
      };
    });
  return { fecha: fecha, compras: compras, insumos: insumosActivos(), categorias: categoriasActivas() };
}

// Compras: todo lo que tiene origen "comprado", en su unidad de compra. Suma al inventario si se cuenta en esa misma
// unidad; si no, guarda la cantidad y el precio (el gasto). Lo que va al ojo queda en Lleno.
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

// ---------- la lista de Compras: categorías y productos (solo admin) ----------

function nombreCategoria(v) {
  const n = String(v || '').trim().slice(0, 30);
  if (!n) throw new ErrorApp('Escribe el nombre de la categoría.', 'datos');
  return n;
}

// Categoría nueva (o una que se había quitado, que vuelve con el emoji nuevo). Va al final del orden.
function crearCategoria(d) {
  const nombre = nombreCategoria(d.nombre);
  const emoji = String(d.emoji || '').trim().slice(0, 8);
  return conBloqueo(() => {
    const filas = leerTabla('Categorias');
    const existe = filas.find((c) => mismoNombre(c.nombre, nombre));
    if (existe && activo(existe.activa)) throw new ErrorApp('Ya existe la categoría ' + existe.nombre + '.', 'datos');
    const orden = filas.reduce((m, c) => Math.max(m, num(c.orden)), 0) + 1;
    if (existe) {
      const sh = hoja('Categorias');
      const col = (n) => HOJAS.Categorias.indexOf(n) + 1;
      sh.getRange(existe._fila, col('emoji')).setValue(emoji);
      sh.getRange(existe._fila, col('orden')).setValue(orden);
      sh.getRange(existe._fila, col('activa')).setValue(true);
    } else {
      agregarFilas('Categorias', [{ nombre: nombre, emoji: emoji, orden: orden, activa: true }]);
    }
    return cargarCompras();
  });
}

// Solo se quita una categoría vacía (sin productos activos). La fila queda en el Sheet con activa = "no".
function quitarCategoria(d) {
  const nombre = nombreCategoria(d.nombre);
  return conBloqueo(() => {
    const usan = insumosActivos().filter((i) => mismoNombre(i.categoria, nombre));
    if (usan.length) throw new ErrorApp(nombre + ' tiene productos: quítalos primero.', 'datos');
    const fila = leerTabla('Categorias').find((c) => mismoNombre(c.nombre, nombre) && activo(c.activa));
    if (!fila) throw new ErrorApp('No se encontró la categoría. Recarga la página.', 'datos');
    hoja('Categorias').getRange(fila._fila, HOJAS.Categorias.indexOf('activa') + 1).setValue('no');
    return cargarCompras();
  });
}

function unidadCompraValida(v) {
  if (UNIDADES_COMPRA.indexOf(v) < 0) throw new ErrorApp('Elige si se compra en gramos o por unidad.', 'datos');
  return v;
}

// Producto nuevo desde Compras: nombre, categoría y unidad de compra. Queda comprado, se cuenta en esa misma
// unidad y "por revisar": lo demás (alias, mínimo…) se completa en Productos.
function crearProductoCompra(d, ctx) {
  const unidad = unidadCompraValida(d.unidad_compra);
  const r = crearProducto({
    nombre: d.nombre, categoria: d.categoria, medicion: unidad === 'unidad' ? 'unidad' : 'gramos', unidad_compra: unidad,
    origen: 'comprado', porRevisar: true
  }, ctx);
  return Object.assign({ id: r.id }, cargarCompras());
}

// Cambia el nombre y la unidad de compra. No cambia cómo se cuenta en el inventario (eso se ve en Productos).
function editarProductoCompra(d) {
  const unidad = unidadCompraValida(d.unidad_compra);
  const nombre = String(d.nombre || '').trim().slice(0, 40);
  if (!nombre) throw new ErrorApp('Falta el nombre.', 'datos');
  return conBloqueo(() => {
    const activos = leerTabla('Insumos').filter((i) => activo(i.activo));
    const i = activos.find((x) => x.id === String(d.id || ''));
    if (!i) throw new ErrorApp('No se encontró el producto. Recarga la página.', 'datos');
    revisarNombres({ nombre: nombre, alias: i.alias }, activos.filter((x) => x.id !== i.id));
    ponerCampos(i._fila, { nombre: nombre, unidad_compra: unidad });
    recalcularStocks();
    return cargarCompras();
  });
}

// Acciones que atiende esta parte (ver acciones() en base.gs).
var ACCIONES_COMPRAS = {
  cargarCompras: { fn: cargarCompras, soloAdmin: true },
  registrarCompras: { fn: registrarCompras, soloAdmin: true },
  anularCompra: { fn: anularCompra, soloAdmin: true },
  crearCategoria: { fn: crearCategoria, soloAdmin: true },
  quitarCategoria: { fn: quitarCategoria, soloAdmin: true },
  crearProductoCompra: { fn: crearProductoCompra, soloAdmin: true },
  editarProductoCompra: { fn: editarProductoCompra, soloAdmin: true }
};
