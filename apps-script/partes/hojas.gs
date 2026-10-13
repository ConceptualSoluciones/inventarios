// ---------------------------------------------------------------------------
// Hojas: leer y escribir en el Sheet, bloqueo y utilidades (fechas, números, textos)
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
    filas.push(aObjeto(cab, r, i + 2));
  });
  return filas;
}

function aObjeto(cab, r, fila) {
  const o = { _fila: fila };
  cab.forEach((col, j) => { o[col] = normalizar(col, r[j]); });
  return o;
}

function esColumnaTexto(col) {
  return Boolean(FORMATO_TEXTO[col]) || col === 'id' || col.slice(-3) === '_id' ||
    ['origen', 'alias', 'unidad', 'estado_actual', 'nota', 'revisar', 'al_ojo', 'pin_hash'].indexOf(col) >= 0;
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
  // Todo movimiento queda con el momento real en que se anotó, venga de donde venga.
  if (nombre === 'Movimientos') {
    const ahora = momentoReal();
    objs.forEach((o) => { if (!o.momento) o.momento = ahora; });
  }
  const sh = hoja(nombre);
  const desde = sh.getLastRow() + 1;
  const faltan = desde + objs.length - 1 - sh.getMaxRows();
  if (faltan > 0) sh.insertRowsAfter(sh.getMaxRows(), faltan);
  sh.getRange(desde, 1, objs.length, HOJAS[nombre].length).setValues(objs.map((o) => aFila(nombre, o)));
}

// Borra solo las filas cuya columna `col` cumple `coincide`. Lee únicamente esa columna y borra
// de abajo hacia arriba, por bloques seguidos. Nunca vacía la hoja entera. Devuelve cuántas borró.
function borrarFilas(nombre, col, coincide) {
  const sh = hoja(nombre);
  const ultima = sh.getLastRow();
  if (ultima < 2) return 0;
  const filas = [];
  sh.getRange(2, HOJAS[nombre].indexOf(col) + 1, ultima - 1, 1).getValues().forEach((r, k) => {
    if (coincide(normalizar(col, r[0]))) filas.push(k + 2);
  });
  if (!filas.length) return 0;
  // Sheets no deja borrar todas las filas debajo del encabezado: si fuera el caso, primero agrega una vacía.
  if (sh.getMaxRows() - filas.length < 2) sh.insertRowsAfter(sh.getMaxRows(), 1);
  let k = filas.length - 1;
  while (k >= 0) {
    const fin = filas[k];
    while (k > 0 && filas[k - 1] === filas[k] - 1) k--;
    sh.deleteRows(filas[k], fin - filas[k] + 1);
    k--;
  }
  return filas.length;
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


// "Hoy" es el día de operación: antes de HORA_CORTE_DIA todavía es el día anterior (Lima no cambia de horario).
function hoyLima() { return Utilities.formatDate(new Date(Date.now() - HORA_CORTE_DIA * 60 * 60 * 1000), TZ, 'yyyy-MM-dd'); }
function horaLima() { return Utilities.formatDate(new Date(Date.now()), TZ, 'HH:mm'); }
function ahoraLima() { return Utilities.formatDate(new Date(Date.now()), TZ, 'yyyy-MM-dd HH:mm'); }
// Fecha calendario y hora reales de Lima, con segundos (sin el corte del día de operación).
function momentoReal() { return Utilities.formatDate(new Date(Date.now()), TZ, 'yyyy-MM-dd HH:mm:ss'); }
// Movimientos sin momento (no debería haber) se ordenan con su fecha y hora.
function momentoDe(m) { return m.momento || (m.fecha + ' ' + m.hora); }

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
function activo(v) {
  const s = String(v).trim().toUpperCase();
  return v !== false && s !== 'FALSE' && s !== 'NO';
}
function sinVacios(lista) { return lista.filter(Boolean); }
function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
// "12 porciones", "1 jarra", "1.5 kg". Mismas reglas que la pantalla (js/app.js).
function cantidadTexto(n, unidad) {
  let valor = num(n);
  let u = unidad || '';
  if (u === 'g' && Math.abs(valor) >= 1000) { valor = redondear(valor / 1000); u = 'kg'; }
  return valor + ' ' + (Math.abs(valor) === 1 ? u : plural(u));
}
function plural(u) {
  if (!u || u === 'g' || u === 'kg') return u;
  if (/ón$/.test(u)) return u.slice(0, -2) + 'ones';
  if (/[aeiouáéíóú]$/.test(u)) return u + 's';
  return u + 'es';
}
// "sí" / "si" / VERDADERO en el Sheet.
function marcado(v) {
  const s = String(v).trim().toLowerCase();
  return v === true || s === 'sí' || s === 'si' || s === 'true';
}
function mismoNombre(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
function nuevoId(prefijo) { return prefijo + '-' + Utilities.getUuid().slice(0, 8); }
function slug(s) {
  return quitarTildes(String(s).toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
// Quita las tildes. Escrito solo con caracteres ASCII para que copiar y pegar el archivo no lo rompa.
const TILDES = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
function quitarTildes(s) {
  return s.normalize('NFD').replace(TILDES, '');
}
