// =============================================================================
// ARCHIVO ARMADO: no editar aquí. Se arma con `bash apps-script/armar.sh` desde apps-script/partes/.
// Es lo único que se pega en el Apps Script.
// =============================================================================

// ===== partes/base.gs =====

/**
 * SANTO — backend en Google Apps Script.
 *
 * Se pega en Extensiones › Apps Script del Google Sheet y se publica como aplicación web.
 * La web manda POST con { action, token o pin, data } y recibe { ok, data } o { ok: false, error, code }.
 *
 * El código vive separado por tema en apps-script/partes/ y `bash apps-script/armar.sh` lo junta en
 * apps-script/Code.gs, que es lo único que se pega en el Apps Script (trae también la semilla).
 * Cada parte registra las acciones que atiende con registrar(nombre, función, { soloAdmin }).
 *
 * Antes de usarlo:
 *   1. Ejecutar setup() una vez desde el editor (crea las hojas y carga la semilla).
 *      Para borrar todo y volver a la semilla: empezarDeCero().
 *   2. Dar de alta al equipo desde el Sheet: menú SANTO › Agregar persona (nombre, PIN de 6 números, rol).
 *      Cada persona entra con su PIN; en la pestaña Equipo el PIN queda solo como hash con sal.
 *      Para Telegram, en Configuración del proyecto › Propiedades de la secuencia de comandos:
 *      TELEGRAM_TOKEN y TELEGRAM_CHAT_ID.
 *   3. Ejecutar instalarRespaldo() una vez: copia el Sheet cada noche a la carpeta "SANTO respaldos" de Drive.
 *
 * setup(), empezarDeCero(), cargarSemilla(), instalarRespaldo() y agregarPersona() solo corren a mano
 * (editor o menú del Sheet): ningún pedido de la web puede crear, vaciar ni rehacer hojas, ni dar altas.
 *
 * Roles: "admin" puede todo. "cocina" solo anota compras y producción del día; no puede el cierre (ventas,
 * salidas a Habemus, merma, niveles al ojo), la Revisión inicial, los conteos, ni editar productos o recetas
 * (lo valida el servidor, no solo la pantalla).
 *
 * Cuatro formas de medir (columna medicion):
 *   - unidad:       panes, huevos, palta, gaseosas… (la unidad se puede nombrar: "unidad", "pan", "servicio").
 *   - gramos:       insumos crudos comprados (carne, chancho, queso…). Siempre en g; se muestra en kg si es mucho.
 *   - presentacion: lo que sale de producción (porción de asado, jarra de chicha…). La unidad la pone el admin.
 *   - ojo:          salsas, aderezos y verduras que no se cuentan. Solo guardan su nivel (lleno · medio · bajo · vacío);
 *                   cada cambio es un movimiento "nivel". Las ventas no los descuentan.
 * Las tres primeras tienen stock, que se mueve siempre a través de Movimientos (ver SIGNO_MOVIMIENTO).
 */

const TZ = 'America/Lima';
// Día de operación: antes de esta hora (Lima) todavía cuenta como el día anterior. La pantalla recibe este valor.
const HORA_CORTE_DIA = 5;

const HOJAS = {
  // revisar = "sí" en lo que vino de la semilla y la dueña todavía no confirmó.
  // origen = comprado (aparece en Compras) o hecho_en_casa (sale de Producción).
  Insumos: ['id', 'nombre', 'alias', 'categoria', 'medicion', 'unidad', 'stock_actual', 'stock_minimo',
    'estado_actual', 'nota', 'revisar', 'activo', 'origen'],
  // fecha = día de operación (para agrupar por día) · momento = fecha calendario y hora reales (para ordenar).
  // precio = total pagado en una compra (opcional).
  Movimientos: ['id', 'fecha', 'hora', 'insumo_id', 'tipo', 'cantidad', 'precio', 'origen', 'nota', 'usuario', 'momento'],
  Recetas: ['id', 'nombre', 'grupo', 'estado', 'revisar', 'activa', 'notas'],
  // al_ojo = "sí": el ingrediente va en la receta solo como información y no se descuenta.
  RecetaIngredientes: ['receta_id', 'insumo_id', 'cantidad', 'al_ojo'],
  VentasDia: ['fecha', 'receta_id', 'cantidad', 'actualizado_por', 'actualizado_en'],
  Equipo: ['nombre', 'pin_hash', 'rol', 'activo']
};
// Pestañas de versiones anteriores que empezarDeCero() borra.
const HOJAS_ANTIGUAS = ['Cierres'];

// Columnas que se guardan como texto plano (y su formato al leerlas si Sheets las convirtió en fecha).
const FORMATO_TEXTO = { fecha: 'yyyy-MM-dd', hora: 'HH:mm', actualizado_en: 'yyyy-MM-dd HH:mm', momento: 'yyyy-MM-dd HH:mm:ss' };

const MEDICIONES = ['unidad', 'gramos', 'presentacion', 'ojo'];
const UNIDAD_POR_DEFECTO = { unidad: 'unidad', gramos: 'g', presentacion: 'porción' };
const NIVELES = ['lleno', 'medio', 'bajo', 'vacío'];
const NIVEL_INICIAL = 'lleno';
const NIVELES_ALERTA = ['bajo', 'vacío'];
const GRUPOS_RECETA = ['cultos', 'criollos', 'papas', 'bebidas'];
const ESTADOS_RECETA = ['vigente', 'provisional', 'sin_ficha'];

// Cómo suma cada tipo de movimiento al stock. "ajuste_conteo" ya viene con su signo (+ o −). "nivel" no suma.
const SIGNO_MOVIMIENTO = {
  compra: 1, produccion_salida: 1, produccion_usado: -1, venta: -1, salida_habemus: -1, merma: -1, ajuste_conteo: 1
};

// Lo que tiene stock: todo menos lo que va al ojo.
function seCuenta(i) { return i.medicion !== 'ojo'; }
// origen: "comprado" aparece en Compras (aunque vaya al ojo); "hecho_en_casa" sale de Producción.
const ORIGENES = ['comprado', 'hecho_en_casa'];
function seCompra(i) { return i.origen === 'comprado'; }
// Si falta el origen: lo porcionado se hace en casa y lo demás se compra.
function origenDe(i) { return ORIGENES.indexOf(i.origen) >= 0 ? i.origen : i.medicion === 'presentacion' ? 'hecho_en_casa' : 'comprado'; }

// ---------------------------------------------------------------------------
// Instalación
// ---------------------------------------------------------------------------

// En true mientras se atiende un pedido de la web (doPost). Cada ejecución de Apps Script empieza de nuevo en false.
let pedidoWeb = false;

// Las funciones que crean, vacían o rellenan hojas se cortan si las llama un pedido de la web.
function soloDesdeEditor(nombre) {
  if (pedidoWeb) throw new Error(nombre + '() solo se ejecuta a mano desde el editor de Apps Script.');
}

function setup() {
  soloDesdeEditor('setup');
  const libro = SpreadsheetApp.getActive();
  libro.setSpreadsheetTimeZone(TZ);

  Object.keys(HOJAS).forEach((nombre) => prepararHoja(libro, nombre));

  // Borra la "Hoja 1" vacía que trae todo Sheet nuevo.
  const vacia = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (vacia && vacia.getLastRow() === 0 && libro.getSheets().length > 1) libro.deleteSheet(vacia);

  cargarSemilla(); // Semilla.gs: datos de RECETAS.md

  if (!leerTabla('Equipo').some((p) => activo(p.activo))) {
    console.warn('Todavía no hay nadie en el equipo: agrégalo desde el Sheet con el menú SANTO › Agregar persona.');
  }
  console.log('Listo: hojas creadas y datos iniciales cargados.');
}

// Crea la hoja si falta y le pone encabezados y formato. Una hoja con datos y columnas de otra versión no se toca.
function prepararHoja(libro, nombre) {
  const cab = HOJAS[nombre];
  let sh = libro.getSheetByName(nombre);
  if (!sh) sh = libro.insertSheet(nombre);
  if (sh.getLastRow() > 1) {
    const actual = sh.getRange(1, 1, 1, cab.length).getValues()[0].map(String);
    if (actual.join('|') !== cab.join('|')) {
      throw new Error('La hoja "' + nombre + '" tiene columnas de una versión anterior. ' +
        'Ejecuta empezarDeCero() para borrar todo y cargar los datos iniciales.');
    }
  }
  sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
  sh.setFrozenRows(1);
  cab.forEach((col, i) => {
    if (esColumnaTexto(col)) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  });
  return sh;
}

// Borra TODOS los datos de la app (productos, movimientos, recetas y ventas; el Equipo no) y vuelve a cargar la semilla.
// No se puede deshacer. Solo se ejecuta a mano desde el editor de Apps Script.
function empezarDeCero() {
  soloDesdeEditor('empezarDeCero');
  const libro = SpreadsheetApp.getActive();
  // El equipo no se borra: si no, nadie podría volver a entrar.
  Object.keys(HOJAS).filter((nombre) => nombre !== 'Equipo').forEach((nombre) => {
    const sh = libro.getSheetByName(nombre);
    if (sh) sh.clear();
  });
  HOJAS_ANTIGUAS.forEach((nombre) => {
    const sh = libro.getSheetByName(nombre);
    if (sh) libro.deleteSheet(sh);
  });
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach((k) => { if (k.indexOf('alerta:') === 0) props.deleteProperty(k); });
  setup();
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

// Lo que la web puede pedir. Cada parte registra sus acciones con registrar().
const ACCIONES = {};

// soloAdmin: "cocina" no la puede pedir. Todo lo que se puede anotar en un día pasado es soloAdmin,
// así que solo un admin corrige días pasados.
function registrar(nombre, fn, opciones) {
  ACCIONES[nombre] = { fn: fn, soloAdmin: Boolean(opciones && opciones.soloAdmin) };
}

function doPost(e) {
  pedidoWeb = true;
  let pedido;
  try {
    pedido = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, error: 'Pedido inválido.', code: 'formato' });
  }
  try {
    // El nombre de quien registra sale de su sesión (o de su PIN al ingresar), nunca de lo que manda la pantalla.
    const persona = identificar(pedido);
    revisarHojas();
    const accion = ACCIONES[pedido.action];
    if (!accion) throw new ErrorApp('Acción desconocida.', 'accion');
    const data = pedido.data || {};
    revisarPermiso(accion, persona);
    const ctx = { usuario: persona.nombre, rol: persona.rol, token: pedido.token };
    let resultado = accion.fn(data, ctx);
    // Ingreso con PIN correcto: el celular queda reconocido con un token de sesión.
    if (persona.filaPorPin) resultado = Object.assign({}, resultado, crearSesion(persona.filaPorPin));
    return responder({
      ok: true, data: resultado, quien: { nombre: persona.nombre, rol: persona.rol }, corte: HORA_CORTE_DIA
    });
  } catch (err) {
    if (err instanceof ErrorApp) return responder({ ok: false, error: err.message, code: err.codigo });
    // La persona ve un mensaje general con un código; el mismo código y el detalle quedan en Ejecuciones.
    const codigo = '#' + Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
    console.error(codigo + ' ' + (err && err.stack ? err.stack : err));
    return responder({ ok: false, error: 'Ocurrió un error. Intenta de nuevo. Código ' + codigo, code: 'servidor' });
  }
}

// Antes de cada pedido: cada hoja tiene que existir con sus columnas en orden. Si no, se avisa y no se lee
// ni se escribe nada. Crear o rehacer hojas solo se hace a mano desde el editor (setup / empezarDeCero).
function revisarHojas() {
  const libro = SpreadsheetApp.getActive();
  Object.keys(HOJAS).forEach((nombre) => {
    const cab = HOJAS[nombre];
    const sh = libro.getSheetByName(nombre);
    const actual = sh && sh.getLastColumn() >= cab.length
      ? sh.getRange(1, 1, 1, cab.length).getValues()[0].map(String) : [];
    if (actual.join('|') !== cab.join('|')) {
      throw new ErrorApp('La pestaña "' + nombre + '" del Sheet no existe o tiene sus columnas cambiadas. ' +
        'No se guardó nada: avisa a quien administra la app.', 'config');
    }
  });
}

// Abrir la URL en el navegador sirve para comprobar que está publicado.
function doGet() {
  return ContentService.createTextOutput('SANTO: el backend está funcionando.');
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ===== partes/equipo.gs =====


// ---------------------------------------------------------------------------
// Equipo: PIN por persona, roles y límite de intentos
// ---------------------------------------------------------------------------

const ROLES = ['admin', 'cocina'];

registrar('verificarPin', (d, ctx) => ({ nombre: ctx.usuario, rol: ctx.rol }));
registrar('cerrarSesion', cerrarSesion);

const MAX_FALLOS = 10;              // PINs equivocados...
const VENTANA_FALLOS_S = 10 * 60;   // ...en 10 minutos...
const BLOQUEO_S = 15 * 60;          // ...bloquean los ingresos 15 minutos.
const MSJ_BLOQUEO = 'Hubo demasiados intentos con un PIN equivocado. El ingreso está bloqueado por 15 minutos.';
const MSJ_SESION = 'Tu sesión venció o se cerró. Vuelve a ingresar tu PIN.';
const DIAS_SESION = 30;

// Devuelve { nombre, rol, filaPorPin } de quien hace el pedido.
//   - Con token: tiene que ser una sesión vigente de una persona activa. No le afecta el bloqueo por intentos.
//   - Sin token: solo se acepta para ingresar (verificarPin) con el PIN. Ahí rige el bloqueo y se cuentan los fallos.
// filaPorPin es la fila de Equipo cuando entró con PIN (para crearle la sesión); con token es null.
function identificar(pedido) {
  const equipo = leerTabla('Equipo');
  const sesiones = limpiarSesiones(equipo);
  if (pedido.token) {
    const s = sesiones[claveSesion(pedido.token)];
    if (!s) throw new ErrorApp(MSJ_SESION, 'sesion');
    return datosPersona(equipo.find((p) => mismoNombre(p.nombre, s.nombre)), null);
  }
  if (pedido.action !== 'verificarPin') throw new ErrorApp(MSJ_SESION, 'sesion');

  const cache = CacheService.getScriptCache();
  if (cache.get('ingreso:bloqueado')) throw new ErrorApp(MSJ_BLOQUEO, 'bloqueado');
  const clave = String(pedido.pin || '');
  const persona = /^\d{6}$/.test(clave)
    ? equipo.find((p) => activo(p.activo) && pinCoincide(clave, p.pin_hash))
    : null;
  if (!persona) {
    anotarFallo(cache);
    throw new ErrorApp('PIN incorrecto.', 'pin');
  }
  return datosPersona(persona, persona);
}

function datosPersona(p, filaPorPin) {
  const rol = String(p.rol || '').trim().toLowerCase();
  return { nombre: String(p.nombre).trim().slice(0, 40), rol: ROLES.indexOf(rol) >= 0 ? rol : 'cocina', filaPorPin: filaPorPin };
}

// ---------- Sesiones (dispositivo reconocido) ----------
// Cada sesión vive en Script Properties como "sesion:<sha256 del token>" → { nombre, pin_hash, vence }.
// El celular guarda el token; el servidor solo su hash. Una sesión deja de valer si vence, si la persona
// pasa a activo = no o si le cambian el PIN (su pin_hash ya no coincide).

function claveSesion(token) { return 'sesion:' + hashPin('', String(token)); }

function crearSesion(fila) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const vence = Date.now() + DIAS_SESION * 24 * 60 * 60 * 1000;
  PropertiesService.getScriptProperties().setProperty(claveSesion(token),
    JSON.stringify({ nombre: String(fila.nombre).trim(), pin_hash: fila.pin_hash, vence: vence }));
  return { token: token, vence: vence };
}

// "Cambiar de usuario": borra en el servidor la sesión con la que se hizo el pedido.
function cerrarSesion(d, ctx) {
  if (ctx.token) PropertiesService.getScriptProperties().deleteProperty(claveSesion(ctx.token));
  return { cerrada: Boolean(ctx.token) };
}

// Borra las sesiones que ya no valen y devuelve las vigentes. Corre en cada pedido: así una baja
// (activo = no) anula todas las sesiones de esa persona apenas alguien usa la app.
function limpiarSesiones(equipo) {
  const props = PropertiesService.getScriptProperties();
  const todas = props.getProperties();
  const ahora = Date.now();
  const vigentes = {};
  Object.keys(todas).forEach((k) => {
    if (k.indexOf('sesion:') !== 0) return;
    let s = null;
    try { s = JSON.parse(todas[k]); } catch (e) { /* dañada: se borra */ }
    const vale = s && s.vence > ahora && equipo.some((p) =>
      activo(p.activo) && mismoNombre(p.nombre, s.nombre) && p.pin_hash === s.pin_hash);
    if (vale) vigentes[k] = s;
    else props.deleteProperty(k);
  });
  return vigentes;
}

// Guarda la hora de cada fallo de los últimos 10 minutos. Al llegar a 10, bloquea y avisa por Telegram.
function anotarFallo(cache) {
  const lock = LockService.getScriptLock();
  const tengo = lock.tryLock(10000);
  try {
    const ahora = Date.now();
    const fallos = JSON.parse(cache.get('ingreso:fallos') || '[]')
      .filter((t) => t > ahora - VENTANA_FALLOS_S * 1000);
    fallos.push(ahora);
    if (fallos.length < MAX_FALLOS) {
      cache.put('ingreso:fallos', JSON.stringify(fallos), VENTANA_FALLOS_S);
      return;
    }
    cache.put('ingreso:bloqueado', String(ahora), BLOQUEO_S);
    cache.remove('ingreso:fallos');
    console.warn('Ingreso bloqueado por ' + MAX_FALLOS + ' PINs equivocados en 10 minutos.');
    enviarTelegram('Se bloqueó el acceso por intentos fallidos: ' + MAX_FALLOS +
      ' PINs equivocados en 10 minutos. Durante 15 minutos (desde las ' + horaLima() + ') no se acepta ningún ingreso ' +
      'nuevo con PIN; los celulares que ya habían entrado siguen funcionando.');
  } finally {
    if (tengo) lock.releaseLock();
  }
}

// accion: lo que guardó registrar() (con su marca soloAdmin).
function revisarPermiso(accion, persona) {
  if (persona.rol === 'admin') return;
  if (accion.soloAdmin) throw new ErrorApp('Esto lo puede hacer solo un admin.', 'permiso');
}

function hashPin(sal, pin) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + pin, Utilities.Charset.UTF_8);
  return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// pin_hash se guarda como "sal$hash".
function pinCoincide(pin, guardado) {
  const partes = String(guardado || '').split('$');
  return partes.length === 2 && hashPin(partes[0], pin) === partes[1];
}

// Alta (o cambio de PIN o rol) de una persona. Si ya existe alguien con ese nombre, se actualiza y queda activo.
// Se usa desde el Sheet (menú SANTO › Agregar persona) o desde otra función del editor.
function agregarPersona(nombre, pin, rol) {
  soloDesdeEditor('agregarPersona');
  nombre = String(nombre || '').trim().slice(0, 40);
  pin = String(pin || '').trim();
  rol = String(rol || '').trim().toLowerCase();
  if (!nombre) throw new Error('Falta el nombre.');
  if (!/^\d{6}$/.test(pin)) throw new Error('El PIN tiene que ser de 6 números.');
  if (ROLES.indexOf(rol) < 0) throw new Error('El rol tiene que ser "admin" o "cocina".');

  const libro = SpreadsheetApp.getActive();
  if (!libro.getSheetByName('Equipo')) prepararHoja(libro, 'Equipo');
  return conBloqueo(() => {
    const equipo = leerTabla('Equipo');
    if (equipo.some((p) => activo(p.activo) && !mismoNombre(p.nombre, nombre) && pinCoincide(pin, p.pin_hash))) {
      throw new Error('Ese PIN ya lo usa otra persona. Elige otro.');
    }
    const sal = Utilities.getUuid().replace(/-/g, '');
    const fila = { nombre: nombre, pin_hash: sal + '$' + hashPin(sal, pin), rol: rol, activo: 'sí' };
    const existente = equipo.find((p) => mismoNombre(p.nombre, nombre));
    if (existente) hoja('Equipo').getRange(existente._fila, 1, 1, HOJAS.Equipo.length).setValues([aFila('Equipo', fila)]);
    else agregarFilas('Equipo', [fila]);
    console.log((existente ? 'Actualizado: ' : 'Agregado: ') + nombre + ' (' + rol + ').');
    return existente ? 'actualizado' : 'agregado';
  });
}

// Menú en el Sheet, para dar altas sin escribir el PIN en el código.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('SANTO').addItem('Agregar persona', 'agregarPersonaDesdeMenu').addToUi();
}

function agregarPersonaDesdeMenu() {
  const ui = SpreadsheetApp.getUi();
  const preguntar = (texto) => {
    const r = ui.prompt('Agregar persona', texto, ui.ButtonSet.OK_CANCEL);
    return r.getSelectedButton() === ui.Button.OK ? r.getResponseText().trim() : null;
  };
  const nombre = preguntar('Nombre (si ya existe, se le cambia el PIN o el rol):');
  if (nombre == null) return;
  const pin = preguntar('PIN de 6 números:');
  if (pin == null) return;
  const rol = preguntar('Rol: admin o cocina');
  if (rol == null) return;
  try {
    const r = agregarPersona(nombre, pin, rol);
    ui.alert('Listo: ' + nombre + ' ' + r + ' como ' + rol.toLowerCase() + '.');
  } catch (err) {
    ui.alert('No se pudo: ' + err.message);
  }
}

// ===== partes/hojas.gs =====

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

// ===== partes/stock.gs =====

// ---------------------------------------------------------------------------
// Núcleo del inventario: productos activos, movimientos, stock y niveles al ojo. Lo usan todas las páginas.
// ---------------------------------------------------------------------------

function insumosActivos() {
  return leerTabla('Insumos').filter((i) => activo(i.activo)).map((i) => {
    const medicion = MEDICIONES.indexOf(i.medicion) >= 0 ? i.medicion : 'unidad';
    const ojo = medicion === 'ojo';
    return {
      id: i.id, nombre: i.nombre, alias: String(i.alias || ''), categoria: i.categoria || 'Otros',
      medicion: medicion, unidad: ojo ? '' : String(i.unidad || UNIDAD_POR_DEFECTO[medicion]),
      stock_actual: ojo ? 0 : num(i.stock_actual), stock_minimo: ojo ? 0 : num(i.stock_minimo),
      estado_actual: ojo ? (NIVELES.indexOf(i.estado_actual) >= 0 ? i.estado_actual : NIVEL_INICIAL) : '',
      nota: String(i.nota || ''), revisar: marcado(i.revisar), origen: origenDe(i)
    };
  });
}

// Escribe algunas columnas de una fila de Insumos.
function ponerCampos(fila, campos) {
  const sh = hoja('Insumos');
  Object.keys(campos).forEach((col) => sh.getRange(fila, HOJAS.Insumos.indexOf(col) + 1).setValue(campos[col]));
}

// Un movimiento de hoy hecho a mano. extra cambia lo que haga falta (fecha, nota, precio, origen…).
function movimiento(insumoId, tipo, cantidad, ctx, extra) {
  return Object.assign({
    id: nuevoId('mov'), fecha: hoyLima(), hora: horaLima(), insumo_id: insumoId, tipo: tipo,
    cantidad: cantidad, precio: '', origen: 'manual', nota: '', usuario: ctx.usuario
  }, extra || {});
}

// Solo los movimientos de una fecha: lee la columna de fechas y después únicamente el bloque de filas de ese día.
function movimientosDeFecha(fecha) {
  const sh = hoja('Movimientos');
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  const cab = HOJAS.Movimientos;
  const fechas = sh.getRange(2, cab.indexOf('fecha') + 1, ultima - 1, 1).getValues().map((r) => normalizar('fecha', r[0]));
  const desde = fechas.indexOf(fecha);
  if (desde < 0) return [];
  const hasta = fechas.lastIndexOf(fecha);
  return sh.getRange(desde + 2, 1, hasta - desde + 1, cab.length).getValues()
    .map((r, k) => aObjeto(cab, r, desde + 2 + k))
    .filter((m) => m.fecha === fecha);
}

function valorMovimiento(m) {
  const signo = SIGNO_MOVIMIENTO[m.tipo] || 0;
  return m.tipo === 'ajuste_conteo' ? num(m.cantidad) : signo * Math.abs(num(m.cantidad));
}

// stock_actual de lo que se cuenta = suma de todos sus movimientos. Se escribe la columna entera de una vez.
// Lo que va al ojo no tiene stock. Al final avisa por Telegram de lo que quedó bajo el mínimo.
function recalcularStocks() {
  const totales = {};
  leerTabla('Movimientos').forEach((m) => {
    totales[m.insumo_id] = (totales[m.insumo_id] || 0) + valorMovimiento(m);
  });
  const insumos = leerTabla('Insumos');
  if (!insumos.length) return;
  const stock = (i) => (i.medicion === 'ojo' ? '' : redondear(totales[i.id] || 0));
  const col = HOJAS.Insumos.indexOf('stock_actual') + 1;
  const sh = hoja('Insumos');
  // Las filas de leerTabla pueden tener huecos; se escribe fila por fila solo si hay huecos.
  const contiguas = insumos.every((i, k) => i._fila === k + 2);
  if (contiguas) {
    sh.getRange(2, col, insumos.length, 1).setValues(insumos.map((i) => [stock(i)]));
  } else {
    insumos.forEach((i) => sh.getRange(i._fila, col).setValue(stock(i)));
  }

  alertar(insumos
    .filter((i) => activo(i.activo) && stock(i) !== '' && num(i.stock_minimo) > 0 && stock(i) < num(i.stock_minimo))
    .map((i) => ({
      id: i.id,
      texto: 'Comprar ' + i.nombre + ': quedan ' + cantidadTexto(stock(i), i.unidad) +
        ' (mínimo ' + cantidadTexto(num(i.stock_minimo), i.unidad) + ')'
    })));
}

// Cambia el nivel de varios productos al ojo (sin bloqueo: lo pone quien llama). Devuelve cuántos cambiaron.
// Lo que queda en bajo o vacío avisa por Telegram.
function aplicarNiveles(lista, ctx) {
  if (!lista.length) return 0;
  const porId = {};
  leerTabla('Insumos').forEach((i) => { porId[i.id] = i; });
  const sh = hoja('Insumos');
  const col = HOJAS.Insumos.indexOf('estado_actual') + 1;
  const hora = horaLima();
  const movs = [];
  const alertas = [];
  lista.forEach((c) => {
    const i = porId[String(c.insumo_id || '')];
    if (!i || !activo(i.activo) || i.medicion !== 'ojo') {
      throw new ErrorApp('No se encontró uno de los productos al ojo. Recarga la página.', 'datos');
    }
    const nivel = String(c.estado || '').trim().toLowerCase();
    if (NIVELES.indexOf(nivel) < 0) throw new ErrorApp('Nivel inválido para ' + i.nombre + '.', 'datos');
    if (i.estado_actual === nivel) return;
    sh.getRange(i._fila, col).setValue(nivel);
    i.estado_actual = nivel;
    movs.push(movimiento(i.id, 'nivel', '', ctx, { hora: hora, nota: nivel }));
    if (NIVELES_ALERTA.indexOf(nivel) >= 0) {
      alertas.push({ id: i.id, texto: i.nombre + ' está en ' + capital(nivel) + ' (marcó ' + ctx.usuario + ', ' + hora + ')' });
    }
  });
  agregarFilas('Movimientos', movs);
  alertar(alertas);
  return movs.length;
}

// Los movimientos de una producción comparten el origen "produccion:<id>".
const esProduccion = (m) => String(m.origen).indexOf('produccion:') === 0;

// ===== partes/avisos.gs =====


// ---------------------------------------------------------------------------
// Alertas por Telegram
// ---------------------------------------------------------------------------

// Máximo un aviso por casilla por día: "alerta:<id>" guarda en Script Properties la fecha del último aviso,
// y solo se vuelve a avisar cuando esa fecha ya no es hoy. Las marcas de días anteriores se borran,
// así solo quedan las de hoy y no se acumulan claves.
// Si Telegram no está configurado o falla, no se marca nada y el guardado sigue normal.
function alertar(lista) {
  if (!lista.length) return;
  const props = PropertiesService.getScriptProperties();
  const hoy = hoyLima();
  const marcas = props.getProperties();
  Object.keys(marcas).forEach((k) => {
    if (k.indexOf('alerta:') === 0 && marcas[k] !== hoy) props.deleteProperty(k);
  });
  const nuevas = lista.filter((a) => marcas['alerta:' + a.id] !== hoy);
  if (!nuevas.length) return;
  if (!enviarTelegram(nuevas.map((a) => a.texto).join('\n'))) return;
  nuevas.forEach((a) => props.setProperty('alerta:' + a.id, hoy));
}

function enviarTelegram(texto) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_TOKEN');
  const chat = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chat) return false;
  try {
    const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', payload: { chat_id: chat, text: texto }, muteHttpExceptions: true
    });
    if (r.getResponseCode() === 200) return true;
    console.error('Telegram respondió ' + r.getResponseCode() + ': ' + r.getContentText());
  } catch (err) {
    console.error('No se pudo enviar a Telegram: ' + err);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Respaldo nocturno
// ---------------------------------------------------------------------------

const CARPETA_RESPALDOS = 'SANTO respaldos';
const PREFIJO_RESPALDO = 'SANTO respaldo ';
const DIAS_RESPALDO = 30;

// Se ejecuta una vez a mano desde el editor (pide permiso para Drive). Programa respaldoNocturno() cada día
// a las 23:30 de Lima (Google lo corre dentro de unos 15 minutos de esa hora) y hace la primera copia ya.
// Si ya estaba programado, lo reemplaza: no quedan activadores repetidos.
function instalarRespaldo() {
  soloDesdeEditor('instalarRespaldo');
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'respaldoNocturno')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('respaldoNocturno').timeBased().everyDays(1).atHour(23).nearMinute(30).inTimezone(TZ).create();
  respaldoNocturno();
  console.log('Listo: respaldo programado cada noche en la carpeta "' + CARPETA_RESPALDOS + '".');
}

// Copia el Sheet a "SANTO respaldos" y manda a la papelera las copias de más de 30 días.
// Solo toca archivos de esa carpeta cuyo nombre empieza con "SANTO respaldo ".
function respaldoNocturno() {
  soloDesdeEditor('respaldoNocturno');
  const carpetas = DriveApp.getFoldersByName(CARPETA_RESPALDOS);
  const carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder(CARPETA_RESPALDOS);
  DriveApp.getFileById(SpreadsheetApp.getActive().getId()).makeCopy(PREFIJO_RESPALDO + ahoraLima(), carpeta);

  const limite = new Date(Date.now() - DIAS_RESPALDO * 24 * 60 * 60 * 1000);
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const a = archivos.next();
    if (a.getName().indexOf(PREFIJO_RESPALDO) === 0 && a.getDateCreated() < limite) a.setTrashed(true);
  }
}

// ===== partes/hoy.gs =====

// ---------------------------------------------------------------------------
// Hoy: en qué va el día
// ---------------------------------------------------------------------------

// Hoy: en qué va el día (Apertura → Producción → Cierre), según lo anotado en el día de operación.
function cargarHoy() {
  const fecha = hoyLima();
  const movs = movimientosDeFecha(fecha);
  const distintos = (lista) => lista.map((m) => m.insumo_id).filter((id, k, ids) => ids.indexOf(id) === k).length;
  return {
    fecha: fecha,
    insumos: insumosActivos(),
    dia: {
      compras: distintos(movs.filter((m) => m.tipo === 'compra')),
      // Lo que salió de Producción (lo preparado al ojo deja un movimiento "nivel" con origen de producción).
      produccion: distintos(movs.filter((m) => esProduccion(m) && m.tipo !== 'produccion_usado')),
      // El cierre deja ventas (origen "venta:<fecha>"), salidas a Habemus o merma.
      cierre: movs.some((m) => String(m.origen).indexOf('venta:') === 0 || m.tipo === 'salida_habemus' || m.tipo === 'merma')
    }
  };
}

registrar('cargarHoy', cargarHoy);

// ===== partes/inventario.gs =====

// ---------------------------------------------------------------------------
// Inventario: lo que hay (solo para ver)
// ---------------------------------------------------------------------------

function cargarInventario() {
  return { insumos: insumosActivos() };
}

registrar('cargarInventario', cargarInventario);

// ===== partes/productos.gs =====

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

registrar('crearProducto', crearProducto, { soloAdmin: true });
registrar('guardarProducto', guardarProducto, { soloAdmin: true });

// ===== partes/compras.gs =====

// ---------------------------------------------------------------------------
// Compras: lo que se compró (apertura del día)
// ---------------------------------------------------------------------------

// Compras de hoy (para no anotar dos veces) y lo que se puede comprar.
function cargarCompras() {
  const fecha = hoyLima();
  const productos = {};
  leerTabla('Insumos').forEach((i) => { productos[i.id] = i; });
  const compras = movimientosDeFecha(fecha).filter((m) => m.tipo === 'compra')
    .sort((a, b) => momentoDe(a).localeCompare(momentoDe(b)))
    .map((m) => {
      const i = productos[m.insumo_id] || {};
      return {
        insumo_id: m.insumo_id, nombre: i.nombre || m.insumo_id, unidad: i.unidad || '', cantidad: num(m.cantidad),
        precio: vacio(m.precio) ? '' : num(m.precio), hora: m.hora, usuario: m.usuario
      };
    });
  return { fecha: fecha, compras: compras, insumos: insumosActivos() };
}

// Compras: todo lo que tiene origen "comprado", aunque vaya al ojo. Suma al inventario; lo que va al ojo
// guarda la cantidad comprada y queda en Lleno. El precio total de cada compra es opcional.
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

registrar('cargarCompras', cargarCompras);
registrar('registrarCompras', registrarCompras);

// ===== partes/produccion.gs =====


// ---------------------------------------------------------------------------
// Producción: lo que se usó (resta) y lo que salió (suma). Las cantidades las pone quien produce.
// ---------------------------------------------------------------------------

// Lo que sale de Producción es lo hecho en casa (porciones, jarras, salsas…); lo que va al ojo queda en "lleno".
// Lo que se usa es lo comprado que se cuenta (carne cruda, huevos…).

// Las producciones de hoy, cada una con lo que se usó y lo que salió.
function cargarProduccion() {
  const fecha = hoyLima();
  const productos = {};
  leerTabla('Insumos').forEach((i) => { productos[i.id] = i; });
  const grupos = {};
  movimientosDeFecha(fecha).filter(esProduccion).forEach((m) => {
    const g = grupos[m.origen] || (grupos[m.origen] = { hora: m.hora, usuario: m.usuario, momento: momentoDe(m), usados: [], salidas: [] });
    const i = productos[m.insumo_id] || {};
    const item = {
      insumo_id: m.insumo_id, nombre: i.nombre || m.insumo_id, unidad: i.unidad || '',
      cantidad: vacio(m.cantidad) ? '' : num(m.cantidad), nivel: m.tipo === 'nivel' ? m.nota : ''
    };
    (m.tipo === 'produccion_usado' ? g.usados : g.salidas).push(item);
  });
  const producciones = Object.keys(grupos).map((k) => grupos[k]).sort((a, b) => a.momento.localeCompare(b.momento));
  return { fecha: fecha, producciones: producciones, insumos: insumosActivos() };
}

// usados: [{ insumo_id, cantidad }] de lo que se compra · salidas: [{ insumo_id, cantidad }] de lo que se prepara
// (lo que va al ojo no lleva cantidad). Todos los movimientos de una producción comparten el origen "produccion:<id>".
function registrarProduccion(d, ctx) {
  const leer = (lista, nombre) => (Array.isArray(lista) ? lista : []).map((e) => ({
    insumo_id: String(e.insumo_id || ''), cantidad: vacio(e.cantidad) ? 0 : validarNumero(e.cantidad, nombre)
  }));
  const usados = leer(d.usados, 'lo que usaste').filter((e) => e.cantidad > 0);
  const salidas = leer(d.salidas, 'lo que salió');

  return conBloqueo(() => {
    const porId = {};
    leerTabla('Insumos').forEach((i) => { porId[i.id] = i; });
    const producto = (e) => {
      const p = porId[e.insumo_id];
      if (!p || !activo(p.activo)) throw new ErrorApp('No se encontró uno de los productos. Recarga la página.', 'datos');
      return p;
    };
    usados.forEach((e) => {
      const p = producto(e);
      if (origenDe(p) !== 'comprado' || p.medicion === 'ojo') {
        throw new ErrorApp(p.nombre + ' no se puede anotar como usado: solo lo comprado que se cuenta.', 'datos');
      }
    });
    const salen = salidas.filter((e) => {
      const p = producto(e);
      if (origenDe(p) !== 'hecho_en_casa') throw new ErrorApp(p.nombre + ' no sale de Producción: se compra.', 'datos');
      return p.medicion === 'ojo' || e.cantidad > 0;
    });
    if (!salen.length) throw new ErrorApp('Escribe lo que salió de la producción.', 'datos');

    const extra = { hora: horaLima(), origen: 'produccion:' + Utilities.getUuid().slice(0, 8) };
    const colNivel = HOJAS.Insumos.indexOf('estado_actual') + 1;
    const movs = usados.map((e) => movimiento(e.insumo_id, 'produccion_usado', e.cantidad, ctx, extra));
    salen.forEach((e) => {
      const p = porId[e.insumo_id];
      if (p.medicion !== 'ojo') {
        movs.push(movimiento(e.insumo_id, 'produccion_salida', e.cantidad, ctx, extra));
        return;
      }
      // Lo que se prepara al ojo (una salsa nueva) queda lleno.
      hoja('Insumos').getRange(p._fila, colNivel).setValue(NIVEL_INICIAL);
      movs.push(movimiento(e.insumo_id, 'nivel', '', ctx, Object.assign({ nota: NIVEL_INICIAL }, extra)));
    });
    agregarFilas('Movimientos', movs);
    recalcularStocks();
    return cargarProduccion();
  });
}

registrar('cargarProduccion', cargarProduccion);
registrar('registrarProduccion', registrarProduccion);

// ===== partes/cierre.gs =====

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

registrar('cambiarNivel', cambiarNivel, { soloAdmin: true });
registrar('cargarVentas', cargarVentas);
registrar('guardarVentas', guardarVentas, { soloAdmin: true });

// ===== partes/recetas.gs =====


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

registrar('cargarRecetas', cargarRecetas);
registrar('crearReceta', crearReceta, { soloAdmin: true });
registrar('guardarReceta', guardarReceta, { soloAdmin: true });

// ===== partes/revision.gs =====

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

registrar('guardarRevision', guardarRevision, { soloAdmin: true });

// ===== partes/movimientos.gs =====

// ---------------------------------------------------------------------------
// Movimientos: historial
// ---------------------------------------------------------------------------

const MAX_HISTORIAL = 200;

// Historial de un día (solo lee las filas de ese día) o, sin fecha, todo el de un producto. Lo más nuevo primero.
function cargarMovimientos(d) {
  const insumoId = String(d.insumo_id || '');
  let movs;
  if (!vacio(d.fecha)) movs = movimientosDeFecha(validarFecha(d.fecha));
  else if (insumoId) movs = leerTabla('Movimientos');
  else throw new ErrorApp('Elige un día o un producto.', 'datos');
  if (insumoId) movs = movs.filter((m) => m.insumo_id === insumoId);
  // Dentro del mismo minuto se respeta el orden en que se anotaron (al revés: lo último primero).
  // Se ordena por el momento real, no por día de operación + hora (lo anotado a la 01:30 va después de las 22:00).
  movs.reverse().sort((a, b) => momentoDe(b).localeCompare(momentoDe(a)));

  // Nombres también de productos desactivados, para que el historial no quede con ids sueltos.
  const productos = {};
  leerTabla('Insumos').forEach((i) => { productos[i.id] = i; });
  return {
    total: movs.length,
    movimientos: movs.slice(0, MAX_HISTORIAL).map((m) => {
      const i = productos[m.insumo_id] || {};
      return {
        id: m.id, fecha: m.fecha, hora: m.hora, insumo_id: m.insumo_id, nombre: i.nombre || m.insumo_id,
        unidad: i.unidad || '', tipo: m.tipo, cantidad: vacio(m.cantidad) ? '' : valorMovimiento(m),
        precio: vacio(m.precio) ? '' : num(m.precio), origen: m.origen, nota: m.nota, usuario: m.usuario
      };
    }),
    insumos: insumosActivos()
  };
}

registrar('cargarMovimientos', cargarMovimientos);

// ===== partes/ajustes.gs =====

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

registrar('guardarMinimos', guardarMinimos, { soloAdmin: true });
registrar('ajustarStock', ajustarStock, { soloAdmin: true });

// ===== partes/semilla.gs =====

/**
 * SANTO — datos iniciales (salen de RECETAS.md: la ficha de la dueña, revisada con cocina el 07/10/2026,
 * y de lo que la dueña decidió el 12/10/2026).
 *
 * Todo se carga como BORRADOR: productos y recetas quedan marcados "por revisar" para que la dueña los
 * corrija en las pantallas de Productos y Recetas.
 *
 * cargarSemilla() agrega lo que falta, comparando por id. No duplica nada si se corre dos veces
 * y no toca lo que ya existe (si alguien lo cambió en la app, se respeta).
 *
 * Formas de medir: unidad, gramos, presentacion (porción, jarra…) y ojo (lleno · medio · bajo · vacío).
 * Origen: comprado (aparece en Compras, aunque vaya al ojo) o hecho_en_casa (sale de Producción).
 * Cada proteína tiene su crudo (comprado, por gramos) y su porcionado (hecho en casa, por porción).
 */

const COMPRADO = 'comprado';
const EN_CASA = 'hecho_en_casa';

const SEMILLA = {
  // [id, nombre, categoria, medicion, unidad, nota, origen]
  insumos: [
    // Proteínas crudas: se compran por peso y en Producción se porcionan.
    ['ins-res-cruda', 'Carne de res cruda', 'Carnes y proteínas', 'gramos', 'g', 'se porciona en Asado', COMPRADO],
    ['ins-chancho-crudo', 'Chancho crudo', 'Carnes y proteínas', 'gramos', 'g', 'se porciona en Panceta / Chicharrón', COMPRADO],
    ['ins-pollo-deshuesado', 'Pollo deshuesado', 'Carnes y proteínas', 'gramos', 'g',
      'se porciona en Pollo Invicto y Pollo deshilachado', COMPRADO],
    ['ins-portobello', 'Portobello', 'Carnes y proteínas', 'gramos', 'g', 'se porciona en Portobello anticuchero', COMPRADO],
    ['ins-jamon', 'Jamón', 'Carnes y proteínas', 'gramos', 'g', 'va en el Mix fiambres Artesano', COMPRADO],
    ['ins-salami', 'Salami ahumado', 'Carnes y proteínas', 'gramos', 'g', 'va en el Mix fiambres Artesano', COMPRADO],

    // Proteínas porcionadas: salen de Producción. La nota es el gramaje de referencia de la ficha.
    ['prep-panceta', 'Panceta / Chicharrón', 'Carnes y proteínas', 'presentacion', 'porción', '140 g', EN_CASA],
    ['prep-pollo', 'Pollo Invicto', 'Carnes y proteínas', 'presentacion', 'porción', '150 g crudo', EN_CASA],
    ['prep-asado', 'Asado', 'Carnes y proteínas', 'presentacion', 'porción', '120 g', EN_CASA],
    ['prep-portobello', 'Portobello anticuchero', 'Carnes y proteínas', 'presentacion', 'porción', '90 g', EN_CASA],
    ['prep-fiambres', 'Mix fiambres Artesano', 'Carnes y proteínas', 'presentacion', 'porción', '90 g', EN_CASA],
    ['prep-pollo-desh', 'Pollo deshilachado', 'Carnes y proteínas', 'presentacion', 'porción', '140 g', EN_CASA],

    // Panes, palta, tomate, papas y camote.
    ['ins-pan-cubano', 'Pan cubano', 'Panes', 'unidad', 'unidad', '', COMPRADO],
    ['ins-roseta', 'Roseta', 'Panes', 'unidad', 'unidad', '', COMPRADO],
    ['ins-focaccia', 'Focaccia', 'Panes', 'unidad', 'unidad', '', COMPRADO],
    ['ins-masa-madre', 'Pan masa madre con semillas', 'Panes', 'unidad', 'unidad', '', COMPRADO],
    ['ins-palta', 'Palta', 'Verduras', 'unidad', 'unidad', '1 palta = 2 panes', COMPRADO],
    ['ins-tomate', 'Tomate', 'Verduras', 'unidad', 'unidad', '1 tomate = 2 panes', COMPRADO],
    ['ins-papas', 'Papas congeladas', 'Congelados', 'presentacion', 'porción', 'bolsa de 200 g', COMPRADO],
    ['ins-camote-crudo', 'Camote crudo', 'Verduras', 'gramos', 'g', 'se porciona y congela: sale Camote frito', COMPRADO],
    ['comp-camote-frito', 'Camote frito', 'Complementos', 'presentacion', 'porción', '', EN_CASA],

    // Salsas y aderezos: hechos en casa, al ojo, con la botella dispensadora.
    ['sal-rocoto-pic', 'Rocoto ahumado picante', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-rocoto-sin', 'Rocoto ahumado sin picante', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-aji-ahumado', 'Ají amarillo ahumado', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-aji-huacatay', 'Ají amarillo con ajo y huacatay', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-golf', 'Golf ahumada', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-culantro', 'Culantro y cebollín', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-pesto', 'Pesto de albahaca', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-glaseado', 'Glaseado Bravo', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-crema-aji', 'Crema de ají amarillo', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-anticuchero', 'Aderezo anticuchero', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],

    // Verduras al ojo (compradas) y complementos hechos en casa.
    ['ins-lechuga', 'Lechuga', 'Verduras', 'ojo', '', '', COMPRADO],
    ['ins-arugula', 'Arúgula', 'Verduras', 'ojo', '', '', COMPRADO],
    ['ins-cebollita', 'Cebollita', 'Verduras', 'ojo', '', '', COMPRADO],
    ['comp-chalaquita', 'Chalaquita encurtida', 'Complementos', 'ojo', '', '', EN_CASA],
    ['comp-sarsa', 'Sarsa criolla', 'Complementos', 'ojo', '', '', EN_CASA],
    ['comp-aros', 'Aros de cebolla', 'Complementos', 'presentacion', 'porción', '', EN_CASA],
    ['comp-quesos', 'Mix quesos Artesano', 'Complementos', 'presentacion', 'porción', '', EN_CASA],

    // Lácteos y secos.
    ['ins-paria', 'Queso Paria', 'Lácteos', 'gramos', 'g', '', COMPRADO],
    ['ins-huevo', 'Huevo', 'Secos', 'unidad', 'unidad', '', COMPRADO],
    ['ins-harina', 'Harina', 'Secos', 'ojo', '', '', COMPRADO],
    ['ins-panko', 'Panko', 'Secos', 'ojo', '', '', COMPRADO],

    // Bebidas: se preparan en casa.
    ['beb-chicha', 'Chicha', 'Bebidas', 'unidad', 'unidad', '', EN_CASA],
    ['beb-maracuya', 'Maracuyá', 'Bebidas', 'unidad', 'unidad', '', EN_CASA]
  ],

  // Insumos solo de producción, comprados: por porción hasta que se decida unidad o gramos. Su id sale del nombre.
  soloProduccion: [
    'Mayonesa', 'Kétchup', 'Mostaza', 'Humo líquido',
    'Rocoto', 'Ají amarillo', 'Ají limo', 'Ají panca', 'Ajo', 'Huacatay', 'Culantro', 'Cebollín',
    'Albahaca', 'Aceite de oliva', 'Aceite', 'Almendra', 'Cebolla roja', 'Limón', 'Pasta de tomate'
  ],
  // Condimentos de solo producción, comprados: al ojo. Su id sale del nombre.
  soloProduccionOjo: ['Sal', 'Pimienta negra', 'Comino', 'Ajinomoto', 'Laurel', 'Canela china',
    'Sazonador Doña Gusta carne', 'Sazonador Doña Gusta pollo/gallina'
  ],

  // Alias por id. "chancho", "carne" y "pollo crudo" apuntan solo al crudo.
  alias: {
    'ins-res-cruda': 'carne, res',
    'ins-chancho-crudo': 'chancho, cerdo',
    'ins-pollo-deshuesado': 'pollo crudo',
    'ins-portobello': 'hongo portobello',
    'comp-sarsa': 'aderezo criollo, salsa criolla',
    'comp-camote-frito': 'camote congelado'
  },

  // [id, nombre, grupo, estado, [[insumo_id, cantidad], ...]] — lo que lleva UN producto vendido.
  recetas: [
    ['rec-artesano', 'El Artesano', 'cultos', 'vigente', [['ins-masa-madre', 1], ['prep-fiambres', 1]]],
    ['rec-bravo', 'El Bravo', 'cultos', 'vigente', [['ins-pan-cubano', 1], ['prep-panceta', 1]]],
    ['rec-invicto', 'El Invicto', 'cultos', 'vigente',
      [['ins-pan-cubano', 1], ['prep-pollo', 1], ['ins-palta', 0.5], ['ins-tomate', 0.5]]],
    ['rec-fenomeno', 'El Fenómeno', 'cultos', 'vigente', [['ins-focaccia', 1], ['prep-portobello', 1]]],
    // D3: sin camote (pendiente si lleva camote frito).
    ['rec-incondicional', 'El Incondicional', 'cultos', 'vigente', [['ins-pan-cubano', 1], ['prep-asado', 1], ['ins-palta', 0.5]]],

    ['rec-chicharron', 'Pan con chicharrón', 'criollos', 'vigente', [['ins-roseta', 1], ['prep-panceta', 1]]],
    ['rec-asado-criollo', 'Asado criollo', 'criollos', 'vigente', [['ins-pan-cubano', 1], ['prep-asado', 1], ['ins-palta', 0.5]]],
    // D1: solo la roseta (pendiente si el jamón va como proteína).
    ['rec-butifarra', 'Butifarra', 'criollos', 'vigente', [['ins-roseta', 1]]],
    ['rec-pollo-desh', 'Pollo deshilachado', 'criollos', 'provisional', [['ins-pan-cubano', 1], ['prep-pollo-desh', 1]]],
    ['rec-choripan', 'Choripán vegano', 'criollos', 'sin_ficha', []],
    ['rec-kids', 'Kids', 'criollos', 'sin_ficha', []],

    // D4: 1 porción = bolsa de 200 g; la del combo grupal (150 g) vale 0.75.
    ['rec-papas', 'Papas combo individual / extra', 'papas', 'vigente', [['ins-papas', 1]]],
    ['rec-papas-grupal', 'Papas combo grupal (por persona)', 'papas', 'vigente', [['ins-papas', 0.75]]],
    ['rec-combo-chicha', 'Combo papas + Chicha', 'papas', 'vigente', [['ins-papas', 1], ['beb-chicha', 1]]],
    ['rec-combo-maracuya', 'Combo papas + Maracuyá', 'papas', 'vigente', [['ins-papas', 1], ['beb-maracuya', 1]]]
  ]
};

// Nada trae stock ni mínimo inventado: todo lo que se cuenta arranca en 0 y sin mínimo, y lo que va al ojo en lleno.
// Los números reales se ponen en la Revisión inicial y los mínimos en Productos.
function cargarSemilla() {
  soloDesdeEditor('cargarSemilla');
  // Productos
  const existentes = {};
  leerTabla('Insumos').forEach((i) => { existentes[i.id] = true; });
  const nuevos = [];
  const producto = (id, nombre, categoria, medicion, unidad, nota, origen) => {
    const ojo = medicion === 'ojo';
    return {
      id: id, nombre: nombre, alias: SEMILLA.alias[id] || '', categoria: categoria, medicion: medicion, unidad: ojo ? '' : unidad,
      stock_actual: ojo ? '' : 0, stock_minimo: ojo ? '' : 0, estado_actual: ojo ? NIVEL_INICIAL : '',
      nota: nota || '', revisar: 'sí', activo: true, origen: origen
    };
  };
  SEMILLA.insumos.forEach(([id, nombre, categoria, medicion, unidad, nota, origen]) => {
    if (!existentes[id]) nuevos.push(producto(id, nombre, categoria, medicion, unidad, nota, origen));
  });
  SEMILLA.soloProduccion.forEach((nombre) => {
    const id = 'ins-' + slug(nombre);
    if (!existentes[id]) nuevos.push(producto(id, nombre, 'Solo producción', 'presentacion', 'porción', '', COMPRADO));
  });
  SEMILLA.soloProduccionOjo.forEach((nombre) => {
    const id = 'ins-' + slug(nombre);
    if (!existentes[id]) nuevos.push(producto(id, nombre, 'Solo producción', 'ojo', '', '', COMPRADO));
  });
  agregarFilas('Insumos', nuevos);

  // Recetas: solo se cargan los ingredientes de las recetas que recién se crean.
  const recetasExistentes = {};
  leerTabla('Recetas').forEach((r) => { recetasExistentes[r.id] = true; });
  const recetas = [];
  const ingredientes = [];
  SEMILLA.recetas.forEach(([id, nombre, grupo, estado, items]) => {
    if (recetasExistentes[id]) return;
    recetas.push({ id: id, nombre: nombre, grupo: grupo, estado: estado, revisar: 'sí', activa: true, notas: '' });
    items.forEach(([insumoId, cantidad]) =>
      ingredientes.push({ receta_id: id, insumo_id: insumoId, cantidad: cantidad, al_ojo: '' }));
  });
  agregarFilas('Recetas', recetas);
  agregarFilas('RecetaIngredientes', ingredientes);

  recalcularStocks();
  console.log('Semilla: ' + nuevos.length + ' productos y ' + recetas.length + ' recetas nuevas (por revisar).');
}
