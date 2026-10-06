/**
 * SANTO — backend en Google Apps Script.
 *
 * Se pega en Extensiones › Apps Script del Google Sheet y se publica como aplicación web.
 * La web manda POST con { action, pin, usuario, data } y recibe { ok, data } o { ok: false, error, code }.
 *
 * Son dos archivos en el mismo proyecto: Code.gs (este) y Semilla.gs (datos iniciales).
 *
 * Antes de usarlo:
 *   1. Ejecutar setup() una vez desde el editor (crea las hojas y carga Semilla.gs).
 *   2. En Configuración del proyecto › Propiedades de la secuencia de comandos, agregar PIN.
 *
 * Cómo se mueve el stock (siempre a través de Movimientos, nunca a mano):
 *   - Producción  → movimientos "entrada" (lo que entra o se compra).
 *   - Ventas      → movimientos "venta" (cada pan descuenta su receta; cada bebida se descuenta sola).
 *   - Ajuste      → corrige el stock con una diferencia (+ o −).
 */

const TZ = 'America/Lima';

const HOJAS = {
  Insumos: ['id', 'nombre', 'categoria', 'tipo', 'unidad_base', 'porcion_g', 'stock_actual', 'stock_minimo', 'proveedor', 'activo'],
  Movimientos: ['id', 'fecha', 'hora', 'insumo_id', 'tipo', 'cantidad', 'origen', 'nota', 'usuario'],
  Recetas: ['id', 'nombre', 'grupo', 'estado', 'activa', 'notas'],
  RecetaIngredientes: ['receta_id', 'insumo_id', 'cantidad'],
  VentasDia: ['fecha', 'item_tipo', 'item_id', 'cantidad', 'actualizado_por', 'actualizado_en']
};

// Columnas que se guardan como texto plano (y su formato al leerlas si Sheets las convirtió en fecha).
const FORMATO_TEXTO = { fecha: 'yyyy-MM-dd', hora: 'HH:mm', actualizado_en: 'yyyy-MM-dd HH:mm' };

const UNIDADES = ['unidad', 'porción', 'g', 'ml'];
const TIPOS = ['ingrediente', 'bebida']; // las bebidas se venden directo, sin receta
const GRUPOS_RECETA = ['cultos', 'criollos', 'papas'];
const ESTADOS_RECETA = ['vigente', 'provisional', 'sin_ficha'];

// Cómo suma cada tipo de movimiento al stock. "ajuste" ya viene con su signo (+ o −).
const SIGNO_MOVIMIENTO = { entrada: 1, salida: -1, merma: -1, venta: -1, ajuste: 1 };

// ---------------------------------------------------------------------------
// Instalación
// ---------------------------------------------------------------------------

function setup() {
  const libro = SpreadsheetApp.getActive();
  libro.setSpreadsheetTimeZone(TZ);

  Object.keys(HOJAS).forEach((nombre) => {
    const cab = HOJAS[nombre];
    let sh = libro.getSheetByName(nombre);
    if (!sh) sh = libro.insertSheet(nombre);
    // Una hoja de una versión anterior con datos no se toca: sus columnas quedarían corridas.
    if (sh.getLastRow() > 1) {
      const actual = sh.getRange(1, 1, 1, cab.length).getValues()[0].map(String);
      if (actual.join('|') !== cab.join('|')) {
        throw new Error('La hoja "' + nombre + '" tiene columnas de una versión anterior. ' +
          'Bórrala (clic derecho en la pestaña → Borrar) y vuelve a ejecutar setup().');
      }
    }
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    sh.setFrozenRows(1);
    cab.forEach((col, i) => {
      if (esColumnaTexto(col)) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });

  // Borra la "Hoja 1" vacía que trae todo Sheet nuevo.
  const vacia = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (vacia && vacia.getLastRow() === 0 && libro.getSheets().length > 1) libro.deleteSheet(vacia);

  cargarSemilla(); // Semilla.gs: datos de RECETAS.md

  if (!PropertiesService.getScriptProperties().getProperty('PIN')) {
    console.warn('Falta el PIN: agrégalo en Configuración del proyecto › Propiedades de la secuencia de comandos.');
  }
  console.log('Listo: hojas creadas y datos iniciales cargados.');
}

// ---------------------------------------------------------------------------
// Entrada web
// ---------------------------------------------------------------------------

class ErrorApp extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

const ACCIONES = {
  verificarPin: () => ({ ok: true }),
  cargarInventario: cargarInventario,
  crearInsumo: crearInsumo,
  registrarEntradas: registrarEntradas,
  cargarRecetas: cargarRecetas,
  crearReceta: crearReceta,
  guardarReceta: guardarReceta,
  cargarVentas: cargarVentas,
  guardarVentas: guardarVentas
};

function doPost(e) {
  let pedido;
  try {
    pedido = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, error: 'Pedido inválido.', code: 'formato' });
  }
  try {
    validarPin(pedido.pin);
    const accion = ACCIONES[pedido.action];
    if (!accion) throw new ErrorApp('Acción desconocida: ' + pedido.action, 'accion');
    const ctx = { usuario: String(pedido.usuario || '').trim().slice(0, 40) || 'sin nombre' };
    return responder({ ok: true, data: accion(pedido.data || {}, ctx) });
  } catch (err) {
    if (err instanceof ErrorApp) return responder({ ok: false, error: err.message, code: err.codigo });
    console.error(err && err.stack ? err.stack : err);
    return responder({ ok: false, error: 'Error en el servidor: ' + (err && err.message), code: 'servidor' });
  }
}

// Abrir la URL en el navegador sirve para comprobar que está publicado.
function doGet() {
  return ContentService.createTextOutput('SANTO: el backend está funcionando.');
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function validarPin(pin) {
  const correcto = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!correcto) throw new ErrorApp('Falta configurar el PIN en el Apps Script.', 'config');
  if (String(pin || '') !== correcto) throw new ErrorApp('PIN incorrecto.', 'pin');
}

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

function cargarInventario() {
  return { insumos: insumosActivos() };
}

function crearInsumo(d, ctx) {
  return conBloqueo(() => crearInsumoSinBloqueo(d, ctx));
}

function crearInsumoSinBloqueo(d, ctx) {
  const nombre = String(d.nombre || '').trim().slice(0, 40);
  if (!nombre) throw new ErrorApp('Falta el nombre.', 'datos');
  const unidad = UNIDADES.indexOf(d.unidad_base) >= 0 ? d.unidad_base : 'unidad';
  const tipo = TIPOS.indexOf(d.tipo) >= 0 ? d.tipo : 'ingrediente';
  const categoria = String(d.categoria || '').trim().slice(0, 30) || (tipo === 'bebida' ? 'Bebidas' : 'Otros');
  const porcion = vacio(d.porcion_g) ? 0 : validarNumero(d.porcion_g, 'la porción');
  const stock = vacio(d.stock_actual) ? 0 : validarNumero(d.stock_actual, 'la cantidad');
  const minimo = vacio(d.stock_minimo) ? 0 : validarNumero(d.stock_minimo, 'el mínimo');
  if (leerTabla('Insumos').some((i) => mismoNombre(i.nombre, nombre))) {
    throw new ErrorApp('Ya existe una casilla llamada ' + nombre + '.', 'datos');
  }

  const id = nuevoId('ins');
  agregarFilas('Insumos', [{
    id: id, nombre: nombre, categoria: categoria, tipo: tipo, unidad_base: unidad,
    porcion_g: unidad === 'g' && porcion > 0 ? porcion : '',
    stock_actual: 0, stock_minimo: minimo, proveedor: String(d.proveedor || ''), activo: true
  }]);
  // El stock nunca se escribe directo: lo que ya hay entra como un ajuste.
  if (stock > 0) {
    agregarFilas('Movimientos', [{
      id: nuevoId('mov'), fecha: hoyLima(), hora: horaLima(), insumo_id: id, tipo: 'ajuste',
      cantidad: stock, origen: 'manual', nota: 'Stock inicial', usuario: ctx.usuario
    }]);
  }
  recalcularStocks();
  return insumosActivos().find((i) => i.id === id);
}

// Producción: lo que entra o se compra. Suma al inventario.
function registrarEntradas(d, ctx) {
  const entradas = (Array.isArray(d.entradas) ? d.entradas : [])
    .map((e) => ({ insumo_id: String(e.insumo_id || ''), cantidad: validarNumero(e.cantidad, 'la cantidad') }))
    .filter((e) => e.cantidad > 0);
  if (!entradas.length) throw new ErrorApp('Escribe al menos una cantidad.', 'datos');
  const nota = String(d.nota || '').slice(0, 200);

  return conBloqueo(() => {
    const ids = insumosActivos().map((i) => i.id);
    entradas.forEach((e) => {
      if (ids.indexOf(e.insumo_id) < 0) throw new ErrorApp('No se encontró una de las casillas. Recarga la página.', 'datos');
    });
    const fecha = hoyLima();
    const hora = horaLima();
    agregarFilas('Movimientos', entradas.map((e) => ({
      id: nuevoId('mov'), fecha: fecha, hora: hora, insumo_id: e.insumo_id, tipo: 'entrada',
      cantidad: e.cantidad, origen: 'manual', nota: nota, usuario: ctx.usuario
    })));
    recalcularStocks();
    return { guardadas: entradas.length, insumos: insumosActivos() };
  });
}

function insumosActivos() {
  return leerTabla('Insumos').filter((i) => activo(i.activo)).map((i) => ({
    id: i.id, nombre: i.nombre, categoria: i.categoria || 'Otros', tipo: i.tipo || 'ingrediente',
    unidad_base: i.unidad_base, porcion_g: num(i.porcion_g),
    stock_actual: num(i.stock_actual), stock_minimo: num(i.stock_minimo), proveedor: i.proveedor
  }));
}

// stock_actual de cada insumo = suma de todos sus movimientos. Se escribe la columna entera de una vez.
function recalcularStocks() {
  const totales = {};
  leerTabla('Movimientos').forEach((m) => {
    const signo = SIGNO_MOVIMIENTO[m.tipo] || 0;
    const valor = m.tipo === 'ajuste' ? num(m.cantidad) : signo * Math.abs(num(m.cantidad));
    totales[m.insumo_id] = (totales[m.insumo_id] || 0) + valor;
  });
  const insumos = leerTabla('Insumos');
  if (!insumos.length) return;
  const col = HOJAS.Insumos.indexOf('stock_actual') + 1;
  const sh = hoja('Insumos');
  // Las filas de leerTabla pueden tener huecos; se escribe fila por fila solo si hay huecos.
  const contiguas = insumos.every((i, k) => i._fila === k + 2);
  if (contiguas) {
    sh.getRange(2, col, insumos.length, 1).setValues(insumos.map((i) => [redondear(totales[i.id] || 0)]));
  } else {
    insumos.forEach((i) => sh.getRange(i._fila, col).setValue(redondear(totales[i.id] || 0)));
  }
  // Fase 6: aquí se avisa por Telegram de los insumos que quedaron bajo el mínimo.
}

// ---------------------------------------------------------------------------
// Recetas (lo que lleva UN pan)
// ---------------------------------------------------------------------------

function cargarRecetas() {
  const ingredientes = leerTabla('RecetaIngredientes');
  const recetas = leerTabla('Recetas').filter((r) => activo(r.activa)).map((r) => ({
    id: r.id,
    nombre: r.nombre,
    grupo: GRUPOS_RECETA.indexOf(r.grupo) >= 0 ? r.grupo : 'cultos',
    estado: ESTADOS_RECETA.indexOf(r.estado) >= 0 ? r.estado : 'vigente',
    notas: r.notas,
    ingredientes: ingredientes
      .filter((i) => i.receta_id === r.id)
      .map((i) => ({ insumo_id: i.insumo_id, cantidad: num(i.cantidad) }))
  }));
  return { recetas: recetas, insumos: insumosActivos() };
}

function crearReceta(d) {
  const nombre = String(d.nombre || '').trim().slice(0, 40);
  if (!nombre) throw new ErrorApp('Falta el nombre del pan.', 'datos');
  return conBloqueo(() => {
    if (leerTabla('Recetas').some((r) => mismoNombre(r.nombre, nombre))) {
      throw new ErrorApp('Ya existe un pan llamado ' + nombre + '.', 'datos');
    }
    const id = nuevoId('rec');
    const grupo = GRUPOS_RECETA.indexOf(d.grupo) >= 0 ? d.grupo : 'cultos';
    agregarFilas('Recetas', [{ id: id, nombre: nombre, grupo: grupo, estado: 'vigente', activa: true, notas: '' }]);
    return Object.assign({ id: id }, cargarRecetas());
  });
}

function guardarReceta(d) {
  const recetaId = String(d.id || '');
  const lista = (Array.isArray(d.ingredientes) ? d.ingredientes : []).map((i) => ({
    insumo_id: String(i.insumo_id || ''),
    cantidad: validarNumero(i.cantidad, 'la cantidad')
  }));
  if (lista.some((i) => i.cantidad <= 0)) throw new ErrorApp('Cada ingrediente necesita una cantidad mayor que 0.', 'datos');

  return conBloqueo(() => {
    if (!leerTabla('Recetas').some((r) => r.id === recetaId)) throw new ErrorApp('No se encontró la receta.', 'datos');
    const ids = insumosActivos().map((i) => i.id);
    // Si un ingrediente se repite, se suman las cantidades.
    const porInsumo = {};
    lista.forEach((i) => {
      if (ids.indexOf(i.insumo_id) < 0) throw new ErrorApp('Elige un ingrediente del inventario.', 'datos');
      porInsumo[i.insumo_id] = redondear((porInsumo[i.insumo_id] || 0) + i.cantidad);
    });
    const otras = leerTabla('RecetaIngredientes').filter((i) => i.receta_id !== recetaId);
    const nuevas = Object.keys(porInsumo).map((id) => ({ receta_id: recetaId, insumo_id: id, cantidad: porInsumo[id] }));
    reescribirTabla('RecetaIngredientes', otras.concat(nuevas));
    return cargarRecetas();
  });
}

// ---------------------------------------------------------------------------
// Ventas del día (lo que sale)
// ---------------------------------------------------------------------------

function cargarVentas(d) {
  const fecha = validarFecha(d.fecha || hoyLima());
  const ventas = leerTabla('VentasDia').filter((v) => v.fecha === fecha);
  const vendidos = (tipo, id) => {
    const v = ventas.find((x) => x.item_tipo === tipo && x.item_id === id);
    return v ? num(v.cantidad) : 0;
  };
  const datos = cargarRecetas();
  return {
    fecha: fecha,
    guardado: ventas.length > 0,
    panes: datos.recetas.map((r) => Object.assign({}, r, { vendidos: vendidos('receta', r.id) })),
    bebidas: datos.insumos.filter((i) => i.tipo === 'bebida').map((i) => Object.assign({}, i, { vendidos: vendidos('insumo', i.id) })),
    insumos: datos.insumos
  };
}

// Reemplaza las ventas de la fecha (no suma) y rehace sus descuentos, así corregir no descuenta dos veces.
function guardarVentas(d, ctx) {
  const fecha = validarFecha(d.fecha);
  const lista = (Array.isArray(d.ventas) ? d.ventas : []).map((v) => ({
    item_tipo: v.item_tipo === 'insumo' ? 'insumo' : 'receta',
    item_id: String(v.item_id || ''),
    cantidad: validarNumero(v.cantidad, 'la cantidad')
  })).filter((v) => v.cantidad > 0);

  return conBloqueo(() => {
    const datos = cargarRecetas();
    const recetas = {};
    datos.recetas.forEach((r) => { recetas[r.id] = r; });
    const insumos = {};
    datos.insumos.forEach((i) => { insumos[i.id] = i; });

    const descuentos = {};
    const sinReceta = [];
    lista.forEach((v) => {
      if (v.item_tipo === 'receta') {
        const r = recetas[v.item_id];
        if (!r) throw new ErrorApp('No se encontró uno de los panes. Recarga la página.', 'datos');
        if (!r.ingredientes.length) sinReceta.push(r.nombre);
        r.ingredientes.forEach((ing) => {
          descuentos[ing.insumo_id] = (descuentos[ing.insumo_id] || 0) + ing.cantidad * v.cantidad;
        });
      } else {
        if (!insumos[v.item_id]) throw new ErrorApp('No se encontró una de las bebidas. Recarga la página.', 'datos');
        descuentos[v.item_id] = (descuentos[v.item_id] || 0) + v.cantidad;
      }
    });

    const ahora = ahoraLima();
    reescribirTabla('VentasDia', leerTabla('VentasDia').filter((v) => v.fecha !== fecha).concat(lista.map((v) => ({
      fecha: fecha, item_tipo: v.item_tipo, item_id: v.item_id, cantidad: v.cantidad,
      actualizado_por: ctx.usuario, actualizado_en: ahora
    }))));

    const origen = 'venta:' + fecha;
    const hora = horaLima();
    const nuevos = Object.keys(descuentos).map((id) => ({
      id: nuevoId('mov'), fecha: fecha, hora: hora, insumo_id: id, tipo: 'venta',
      cantidad: redondear(descuentos[id]), origen: origen, nota: 'Ventas del día', usuario: ctx.usuario
    }));
    reescribirTabla('Movimientos', leerTabla('Movimientos').filter((m) => m.origen !== origen).concat(nuevos));
    recalcularStocks();

    return {
      sinReceta: sinReceta,
      descontado: nuevos.map((m) => ({ insumo_id: m.insumo_id, cantidad: m.cantidad })),
      insumos: insumosActivos()
    };
  });
}

// ---------------------------------------------------------------------------
// Acceso a las hojas
// ---------------------------------------------------------------------------

function hoja(nombre) {
  const sh = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!sh) throw new ErrorApp('Falta la hoja ' + nombre + '. Ejecuta setup() en el Apps Script.', 'config');
  return sh;
}

// Devuelve las filas como objetos { columna: valor, _fila: número de fila en la hoja }.
function leerTabla(nombre) {
  const valores = hoja(nombre).getDataRange().getValues();
  const cab = valores.shift() || [];
  const filas = [];
  valores.forEach((r, i) => {
    if (!r.some((v) => v !== '' && v !== null)) return;
    const o = { _fila: i + 2 };
    cab.forEach((col, j) => { o[col] = normalizar(col, r[j]); });
    filas.push(o);
  });
  return filas;
}

function esColumnaTexto(col) {
  return Boolean(FORMATO_TEXTO[col]) || col === 'id' || col.slice(-3) === '_id' || col === 'origen';
}

// Si Sheets convirtió una fecha u hora en Date, la vuelve a texto en hora de Lima.
function normalizar(col, v) {
  if (FORMATO_TEXTO[col] && v instanceof Date) return Utilities.formatDate(v, TZ, FORMATO_TEXTO[col]);
  if (esColumnaTexto(col)) return v === '' || v == null ? '' : String(v);
  return v;
}

function aFila(nombre, obj) {
  return HOJAS[nombre].map((col) => (obj[col] == null ? '' : obj[col]));
}

function agregarFilas(nombre, objs) {
  if (!objs.length) return;
  const sh = hoja(nombre);
  const desde = sh.getLastRow() + 1;
  const faltan = desde + objs.length - 1 - sh.getMaxRows();
  if (faltan > 0) sh.insertRowsAfter(sh.getMaxRows(), faltan);
  sh.getRange(desde, 1, objs.length, HOJAS[nombre].length).setValues(objs.map((o) => aFila(nombre, o)));
}

// Borra todas las filas de datos y escribe las que se pasan (para reemplazar sin dejar huecos).
function reescribirTabla(nombre, objs) {
  const sh = hoja(nombre);
  const ultima = sh.getLastRow();
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, HOJAS[nombre].length).clearContent();
  agregarFilas(nombre, objs);
}

// Toda escritura pasa por aquí para que dos personas guardando a la vez no se pisen.
function conBloqueo(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new ErrorApp('Hay otra persona guardando. Vuelve a intentar.', 'ocupado');
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function hoyLima() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function horaLima() { return Utilities.formatDate(new Date(), TZ, 'HH:mm'); }
function ahoraLima() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }

function validarFecha(f) {
  const s = String(f || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ErrorApp('Fecha inválida.', 'datos');
  if (s > hoyLima()) throw new ErrorApp('No se puede registrar un día que todavía no llega.', 'datos');
  return s;
}

function validarNumero(v, nombre) {
  const n = Number(String(v).replace(',', '.'));
  if (vacio(v) || !isFinite(n) || n < 0) throw new ErrorApp('Revisa ' + nombre + ': tiene que ser un número.', 'datos');
  return redondear(n);
}

function vacio(v) { return v === '' || v == null; }
function num(v) { return Number(v) || 0; }
function redondear(n) { return Math.round(n * 1000) / 1000; }
function activo(v) { return v !== false && String(v).toUpperCase() !== 'FALSE'; }
function mismoNombre(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
function nuevoId(prefijo) { return prefijo + '-' + Utilities.getUuid().slice(0, 8); }
function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
