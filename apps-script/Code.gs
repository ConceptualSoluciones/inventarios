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
 * Roles: "admin" puede todo. "cocina" no puede Ajustes, editar recetas, la Revisión inicial
 * ni corregir días pasados (lo valida este archivo, no solo la pantalla).
 *
 * Tres formas de medir (columna medicion):
 *   - conteo: porciones o unidades. Tiene stock, que se mueve siempre a través de Movimientos:
 *       Producción → "entrada" · Ventas → "venta" (según la receta) · Merma → "merma" · Ajuste → diferencia (+ o −).
 *   - nivel:  salsas (lleno · medio · poco · vacío). Solo guarda su estado; cada cambio es un movimiento "nivel".
 *   - marcar: hay · falta. Solo guarda su estado; cada cambio es un movimiento "marca".
 */

const TZ = 'America/Lima';
// Día de operación: antes de esta hora (Lima) todavía cuenta como el día anterior. La pantalla recibe este valor.
const HORA_CORTE_DIA = 5;

const HOJAS = {
  Insumos: ['id', 'nombre', 'categoria', 'tipo', 'medicion', 'unidad_base', 'gramaje_ref', 'stock_actual', 'stock_minimo',
    'estado_actual', 'lote_insumo_id', 'lote_cantidad', 'proveedor', 'activo'],
  // fecha = día de operación (para agrupar por día) · momento = fecha calendario y hora reales (para ordenar).
  Movimientos: ['id', 'fecha', 'hora', 'insumo_id', 'tipo', 'cantidad', 'origen', 'nota', 'usuario', 'momento'],
  Recetas: ['id', 'nombre', 'grupo', 'estado', 'activa', 'notas'],
  RecetaIngredientes: ['receta_id', 'insumo_id', 'cantidad'],
  VentasDia: ['fecha', 'item_tipo', 'item_id', 'cantidad', 'actualizado_por', 'actualizado_en'],
  Cierres: ['fecha', 'insumo_id', 'queda', 'actualizado_en'],
  Equipo: ['nombre', 'pin_hash', 'rol', 'activo']
};

// Columnas que se guardan como texto plano (y su formato al leerlas si Sheets las convirtió en fecha).
const FORMATO_TEXTO = { fecha: 'yyyy-MM-dd', hora: 'HH:mm', actualizado_en: 'yyyy-MM-dd HH:mm', momento: 'yyyy-MM-dd HH:mm:ss' };

const MEDICIONES = ['conteo', 'nivel', 'marcar'];
const ESTADOS = { nivel: ['lleno', 'medio', 'poco', 'vacío'], marcar: ['hay', 'falta'] };
const ESTADO_INICIAL = { nivel: 'lleno', marcar: 'hay' };
const ESTADOS_ALERTA = ['poco', 'vacío', 'falta'];
const UNIDADES = ['porción', 'unidad'];
const TIPOS = ['ingrediente', 'bebida']; // las bebidas se venden directo, sin receta
const GRUPOS_RECETA = ['cultos', 'criollos', 'papas'];
const ESTADOS_RECETA = ['vigente', 'provisional', 'sin_ficha'];

// Cómo suma cada tipo de movimiento al stock. "ajuste" ya viene con su signo (+ o −). "nivel" y "marca" no suman.
const SIGNO_MOVIMIENTO = { entrada: 1, salida: -1, merma: -1, venta: -1, ajuste: 1 };

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

// Borra TODOS los datos de la app (casillas, movimientos, recetas, ventas y cierres; el Equipo no) y vuelve a cargar la semilla.
// No se puede deshacer. Solo se ejecuta a mano desde el editor de Apps Script.
function empezarDeCero() {
  soloDesdeEditor('empezarDeCero');
  const libro = SpreadsheetApp.getActive();
  // El equipo no se borra: si no, nadie podría volver a entrar.
  Object.keys(HOJAS).filter((nombre) => nombre !== 'Equipo').forEach((nombre) => {
    const sh = libro.getSheetByName(nombre);
    if (sh) sh.clear();
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

const ACCIONES = {
  verificarPin: (d, ctx) => ({ nombre: ctx.usuario, rol: ctx.rol }),
  cerrarSesion: cerrarSesion,
  cargarHoy: cargarHoy,
  cambiarEstado: cambiarEstado,
  anotarControl: anotarControl,
  hiceUnLote: hiceUnLote,
  cargarInventario: cargarInventario,
  crearInsumo: crearInsumo,
  registrarEntradas: registrarEntradas,
  guardarRevision: guardarRevision,
  cargarMovimientos: cargarMovimientos,
  guardarMinimos: guardarMinimos,
  ajustarStock: ajustarStock,
  guardarLote: guardarLote,
  cambiarMedicion: cambiarMedicion,
  cargarRecetas: cargarRecetas,
  crearReceta: crearReceta,
  guardarReceta: guardarReceta,
  cargarVentas: cargarVentas,
  guardarVentas: guardarVentas
};

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
    revisarPermiso(pedido.action, data, persona);
    const ctx = { usuario: persona.nombre, rol: persona.rol, token: pedido.token };
    let resultado = accion(data, ctx);
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

// ---------------------------------------------------------------------------
// Equipo: PIN por persona, roles y límite de intentos
// ---------------------------------------------------------------------------

const ROLES = ['admin', 'cocina'];
// Lo que "cocina" no puede hacer. Además, solo un admin corrige días pasados (ver revisarPermiso).
const SOLO_ADMIN = ['guardarRevision', 'guardarMinimos', 'ajustarStock', 'guardarLote', 'cambiarMedicion',
  'crearReceta', 'guardarReceta'];
const CON_FECHA = ['anotarControl', 'guardarVentas'];

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

function revisarPermiso(accion, data, persona) {
  if (persona.rol === 'admin') return;
  if (SOLO_ADMIN.indexOf(accion) >= 0) throw new ErrorApp('Esto lo puede hacer solo un admin.', 'permiso');
  if (CON_FECHA.indexOf(accion) >= 0 && !vacio(data.fecha) && String(data.fecha) < hoyLima()) {
    throw new ErrorApp('Corregir un día pasado lo puede hacer solo un admin.', 'permiso');
  }
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

// ---------------------------------------------------------------------------
// Hoy: control del día de las proteínas, salsas por nivel e ingredientes Hay / Falta
// ---------------------------------------------------------------------------

// Las proteínas llevan control del día (inicial + producido − vendido − merma = queda) y un cierre por día.
function conControl(i) { return i.medicion === 'conteo' && i.categoria === 'Proteínas'; }

function cargarHoy(d) {
  const fecha = validarFecha(d.fecha || hoyLima());
  const insumos = insumosActivos();
  const cierres = leerTabla('Cierres');
  const movs = movimientosDeFecha(fecha);
  const control = insumos.filter(conControl).map((i) => {
    const c = cuentasDelDia(movs, i.id);
    const inicial = inicialDelDia(cierres, i.id, fecha);
    return {
      insumo_id: i.id, inicial: inicial, producido: c.producido, vendido: c.vendido, merma: c.merma,
      ajuste: c.ajuste, queda: redondear(inicial + c.total)
    };
  });
  return { fecha: fecha, insumos: insumos, control: control };
}

// Lo producido y la merma de una proteína en una fecha. Se suman a lo que ya había ese día.
function anotarControl(d, ctx) {
  const fecha = validarFecha(d.fecha);
  const producido = vacio(d.producido) ? 0 : validarNumero(d.producido, 'lo producido');
  const merma = vacio(d.merma) ? 0 : validarNumero(d.merma, 'la merma');
  if (!producido && !merma) throw new ErrorApp('Escribe lo producido o la merma.', 'datos');

  return conBloqueo(() => {
    const i = insumosActivos().find((x) => x.id === String(d.insumo_id || ''));
    if (!i || !conControl(i)) throw new ErrorApp('No se encontró esa proteína. Recarga la página.', 'datos');
    const hora = horaLima();
    const mov = (tipo, cantidad) => ({
      id: nuevoId('mov'), fecha: fecha, hora: hora, insumo_id: i.id, tipo: tipo,
      cantidad: cantidad, origen: 'manual', nota: '', usuario: ctx.usuario
    });
    agregarFilas('Movimientos', sinVacios([producido > 0 && mov('entrada', producido), merma > 0 && mov('merma', merma)]));
    recalcularStocks();
    const posteriores = actualizarCierres(fecha, [i.id]);
    return Object.assign(cargarHoy({ fecha: fecha }), { posteriores: posteriores });
  });
}

// Salsas (nivel) e ingredientes (marcar): se guarda al momento, con quién y a qué hora.
function cambiarEstado(d, ctx) {
  return conBloqueo(() => {
    aplicarEstados([{ insumo_id: d.insumo_id, estado: d.estado }], ctx);
    return { insumo: insumosActivos().find((i) => i.id === String(d.insumo_id)) };
  });
}

// Cambia el estado de varias casillas (sin bloqueo: lo pone quien llama). Devuelve cuántas cambiaron.
function aplicarEstados(lista, ctx) {
  if (!lista.length) return 0;
  const porId = {};
  leerTabla('Insumos').forEach((i) => { porId[i.id] = i; });
  const sh = hoja('Insumos');
  const col = HOJAS.Insumos.indexOf('estado_actual') + 1;
  const fecha = hoyLima();
  const hora = horaLima();
  const movs = [];
  const alertas = [];
  lista.forEach((c) => {
    const i = porId[String(c.insumo_id || '')];
    if (!i || !activo(i.activo)) throw new ErrorApp('No se encontró una de las casillas. Recarga la página.', 'datos');
    const estado = String(c.estado || '').trim().toLowerCase();
    const validos = ESTADOS[i.medicion];
    if (!validos || validos.indexOf(estado) < 0) throw new ErrorApp('Estado inválido para ' + i.nombre + '.', 'datos');
    if (i.estado_actual === estado) return;
    sh.getRange(i._fila, col).setValue(estado);
    i.estado_actual = estado;
    movs.push({
      id: nuevoId('mov'), fecha: fecha, hora: hora, insumo_id: i.id, tipo: i.medicion === 'nivel' ? 'nivel' : 'marca',
      cantidad: '', origen: 'manual', nota: estado, usuario: ctx.usuario
    });
    if (ESTADOS_ALERTA.indexOf(estado) >= 0) {
      const quien = ' (marcó ' + ctx.usuario + ', ' + hora + ')';
      alertas.push({ id: i.id, texto: (estado === 'falta' ? 'Falta ' + i.nombre : i.nombre + ' está en ' + capital(estado)) + quien });
    }
  });
  agregarFilas('Movimientos', movs);
  alertar(alertas);
  return movs.length;
}

// Glaseado Bravo: un lote nuevo descuenta lo que lleva (la chicha) y deja la salsa en "lleno".
function hiceUnLote(d, ctx) {
  return conBloqueo(() => {
    const insumos = insumosActivos();
    const i = insumos.find((x) => x.id === String(d.insumo_id || ''));
    if (!i || i.medicion !== 'nivel') throw new ErrorApp('No se encontró esa salsa. Recarga la página.', 'datos');
    const destino = insumos.find((x) => x.id === i.lote_insumo_id && x.medicion === 'conteo');
    const cantidad = num(i.lote_cantidad);
    let descontado = null;
    if (destino && cantidad > 0) {
      agregarFilas('Movimientos', [{
        id: nuevoId('mov'), fecha: hoyLima(), hora: horaLima(), insumo_id: destino.id, tipo: 'salida',
        cantidad: cantidad, origen: 'lote:' + i.id, nota: 'Lote de ' + i.nombre, usuario: ctx.usuario
      }]);
      recalcularStocks();
      actualizarCierres(hoyLima(), [destino.id]);
      descontado = { insumo_id: destino.id, nombre: destino.nombre, cantidad: cantidad, unidad_base: destino.unidad_base };
    }
    aplicarEstados([{ insumo_id: i.id, estado: 'lleno' }], ctx);
    return { insumo: insumosActivos().find((x) => x.id === i.id), descontado: descontado, sinLote: !descontado };
  });
}

// ---------------------------------------------------------------------------
// Cierres: lo que quedó de cada proteína al final de cada día
// ---------------------------------------------------------------------------

// El inicial de un día es el último cierre anterior (o 0 si no hay ninguno).
function inicialDelDia(cierres, insumoId, fecha) {
  let mejor = null;
  cierres.forEach((c) => {
    if (c.insumo_id === insumoId && c.fecha < fecha && (!mejor || c.fecha > mejor.fecha)) mejor = c;
  });
  return mejor ? num(mejor.queda) : 0;
}

function cuentasDelDia(movs, insumoId) {
  const c = { producido: 0, vendido: 0, merma: 0, ajuste: 0, total: 0 };
  movs.forEach((m) => {
    if (m.insumo_id !== insumoId) return;
    const v = valorMovimiento(m);
    if (m.tipo === 'entrada') c.producido += v;
    else if (m.tipo === 'venta') c.vendido -= v;
    else if (m.tipo === 'merma') c.merma -= v;
    else c.ajuste += v; // ajustes y salidas
    c.total += v;
  });
  Object.keys(c).forEach((k) => { c[k] = redondear(c[k]); });
  return c;
}

// Rehace el cierre de esa fecha para las proteínas tocadas. Los días siguientes no se rehacen:
// devuelve true si alguno ya tenía cierre, porque desde ahí los números pueden no cuadrar.
function actualizarCierres(fecha, ids) {
  const proteinas = {};
  insumosActivos().filter(conControl).forEach((i) => { proteinas[i.id] = true; });
  const tocadas = ids.filter((id, k) => proteinas[id] && ids.indexOf(id) === k);
  if (!tocadas.length) return false;

  const cierres = leerTabla('Cierres');
  const movs = movimientosDeFecha(fecha);
  const sh = hoja('Cierres');
  const ahora = ahoraLima();
  const nuevos = [];
  let posteriores = false;
  tocadas.forEach((id) => {
    const cierre = {
      fecha: fecha, insumo_id: id, actualizado_en: ahora,
      queda: redondear(inicialDelDia(cierres, id, fecha) + cuentasDelDia(movs, id).total)
    };
    const fila = cierres.find((c) => c.fecha === fecha && c.insumo_id === id);
    if (fila) sh.getRange(fila._fila, 1, 1, HOJAS.Cierres.length).setValues([aFila('Cierres', cierre)]);
    else nuevos.push(cierre);
    if (cierres.some((c) => c.insumo_id === id && c.fecha > fecha)) posteriores = true;
  });
  agregarFilas('Cierres', nuevos);
  return posteriores;
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
  const medicion = MEDICIONES.indexOf(d.medicion) >= 0 ? d.medicion : 'conteo';
  const conteo = medicion === 'conteo';
  const tipo = conteo && TIPOS.indexOf(d.tipo) >= 0 ? d.tipo : 'ingrediente';
  const unidad = !conteo ? '' : UNIDADES.indexOf(d.unidad_base) >= 0 ? d.unidad_base : 'unidad';
  const categoria = String(d.categoria || '').trim().slice(0, 30) || (tipo === 'bebida' ? 'Bebidas' : 'Otros');
  const stock = !conteo || vacio(d.stock_actual) ? 0 : validarNumero(d.stock_actual, 'la cantidad');
  const minimo = !conteo || vacio(d.stock_minimo) ? 0 : validarNumero(d.stock_minimo, 'el mínimo');
  if (leerTabla('Insumos').some((i) => mismoNombre(i.nombre, nombre))) {
    throw new ErrorApp('Ya existe una casilla llamada ' + nombre + '.', 'datos');
  }

  const id = nuevoId('ins');
  agregarFilas('Insumos', [{
    id: id, nombre: nombre, categoria: categoria, tipo: tipo, medicion: medicion, unidad_base: unidad,
    gramaje_ref: String(d.gramaje_ref || '').trim().slice(0, 40),
    stock_actual: conteo ? 0 : '', stock_minimo: conteo ? minimo : '', estado_actual: ESTADO_INICIAL[medicion] || '',
    lote_insumo_id: '', lote_cantidad: '', proveedor: String(d.proveedor || ''), activo: true
  }]);
  // El stock nunca se escribe directo: lo que ya hay entra como un ajuste.
  if (stock > 0) {
    agregarFilas('Movimientos', [{
      id: nuevoId('mov'), fecha: hoyLima(), hora: horaLima(), insumo_id: id, tipo: 'ajuste',
      cantidad: stock, origen: 'manual', nota: 'Stock inicial', usuario: ctx.usuario
    }]);
    recalcularStocks();
    actualizarCierres(hoyLima(), [id]);
  }
  return insumosActivos().find((i) => i.id === id);
}

// Producción: lo que entra o se compra. Suma al inventario (solo casillas de conteo).
function registrarEntradas(d, ctx) {
  const entradas = (Array.isArray(d.entradas) ? d.entradas : [])
    .map((e) => ({ insumo_id: String(e.insumo_id || ''), cantidad: validarNumero(e.cantidad, 'la cantidad') }))
    .filter((e) => e.cantidad > 0);
  if (!entradas.length) throw new ErrorApp('Escribe al menos una cantidad.', 'datos');
  const nota = String(d.nota || '').slice(0, 200);

  return conBloqueo(() => {
    const ids = insumosActivos().filter((i) => i.medicion === 'conteo').map((i) => i.id);
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
    actualizarCierres(fecha, entradas.map((e) => e.insumo_id));
    return { guardadas: entradas.length, insumos: insumosActivos() };
  });
}

// Revisión inicial: lo que hay de cada casilla de conteo (entra como ajuste) y el estado real de salsas e ingredientes.
function guardarRevision(d, ctx) {
  const conteos = (Array.isArray(d.conteos) ? d.conteos : [])
    .map((c) => ({ insumo_id: String(c.insumo_id || ''), cantidad: validarNumero(c.cantidad, 'la cantidad') }));
  const estados = Array.isArray(d.estados) ? d.estados : [];
  if (!conteos.length && !estados.length) throw new ErrorApp('No hay cambios para guardar.', 'datos');

  return conBloqueo(() => {
    const porId = {};
    insumosActivos().forEach((i) => { porId[i.id] = i; });
    const fecha = hoyLima();
    const hora = horaLima();
    const ajustes = [];
    conteos.forEach((c) => {
      const i = porId[c.insumo_id];
      if (!i || i.medicion !== 'conteo') throw new ErrorApp('No se encontró una de las casillas. Recarga la página.', 'datos');
      const diferencia = redondear(c.cantidad - i.stock_actual);
      if (!diferencia) return;
      ajustes.push({
        id: nuevoId('mov'), fecha: fecha, hora: hora, insumo_id: i.id, tipo: 'ajuste',
        cantidad: diferencia, origen: 'manual', nota: 'Revisión inicial', usuario: ctx.usuario
      });
    });
    agregarFilas('Movimientos', ajustes);
    const cambios = aplicarEstados(estados, ctx);
    if (ajustes.length) {
      recalcularStocks();
      actualizarCierres(fecha, ajustes.map((a) => a.insumo_id));
    }
    return { ajustes: ajustes.length, estados: cambios, insumos: insumosActivos() };
  });
}

function insumosActivos() {
  return leerTabla('Insumos').filter((i) => activo(i.activo)).map((i) => {
    const medicion = MEDICIONES.indexOf(i.medicion) >= 0 ? i.medicion : 'conteo';
    return {
      id: i.id, nombre: i.nombre, categoria: i.categoria || 'Otros', tipo: i.tipo || 'ingrediente',
      medicion: medicion, unidad_base: i.unidad_base, gramaje_ref: String(i.gramaje_ref || ''),
      stock_actual: num(i.stock_actual), stock_minimo: num(i.stock_minimo),
      estado_actual: medicion === 'conteo' ? '' : String(i.estado_actual || ESTADO_INICIAL[medicion]),
      lote_insumo_id: i.lote_insumo_id, lote_cantidad: vacio(i.lote_cantidad) ? '' : num(i.lote_cantidad),
      proveedor: i.proveedor
    };
  });
}

function valorMovimiento(m) {
  const signo = SIGNO_MOVIMIENTO[m.tipo] || 0;
  return m.tipo === 'ajuste' ? num(m.cantidad) : signo * Math.abs(num(m.cantidad));
}

// stock_actual de cada casilla de conteo = suma de todos sus movimientos. Se escribe la columna entera de una vez.
// Las de nivel y marcar no tienen stock. Al final avisa por Telegram de lo que quedó bajo el mínimo.
function recalcularStocks() {
  const totales = {};
  leerTabla('Movimientos').forEach((m) => {
    totales[m.insumo_id] = (totales[m.insumo_id] || 0) + valorMovimiento(m);
  });
  const insumos = leerTabla('Insumos');
  if (!insumos.length) return;
  const stock = (i) => (i.medicion === 'nivel' || i.medicion === 'marcar' ? '' : redondear(totales[i.id] || 0));
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
      texto: 'Comprar ' + i.nombre + ': quedan ' + stock(i) + ' ' + unidadTexto(i.unidad_base, stock(i)) +
        ' (mínimo ' + num(i.stock_minimo) + ')'
    })));
}

// ---------------------------------------------------------------------------
// Movimientos (historial) y Ajustes
// ---------------------------------------------------------------------------

const MAX_HISTORIAL = 200;

// Historial de un día (solo lee las filas de ese día) o, sin fecha, todo el de una casilla. Lo más nuevo primero.
function cargarMovimientos(d) {
  const insumoId = String(d.insumo_id || '');
  let movs;
  if (!vacio(d.fecha)) movs = movimientosDeFecha(validarFecha(d.fecha));
  else if (insumoId) movs = leerTabla('Movimientos');
  else throw new ErrorApp('Elige un día o una casilla.', 'datos');
  if (insumoId) movs = movs.filter((m) => m.insumo_id === insumoId);
  // Dentro del mismo minuto se respeta el orden en que se anotaron (al revés: lo último primero).
  // Se ordena por el momento real, no por día de operación + hora (lo anotado a la 01:30 va después de las 22:00).
  movs.reverse().sort((a, b) => momentoDe(b).localeCompare(momentoDe(a)));

  // Nombres también de casillas desactivadas, para que el historial no quede con ids sueltos.
  const casillas = {};
  leerTabla('Insumos').forEach((i) => { casillas[i.id] = i; });
  return {
    total: movs.length,
    movimientos: movs.slice(0, MAX_HISTORIAL).map((m) => {
      const i = casillas[m.insumo_id] || {};
      return {
        id: m.id, fecha: m.fecha, hora: m.hora, insumo_id: m.insumo_id, nombre: i.nombre || m.insumo_id,
        unidad_base: i.unidad_base || '', tipo: m.tipo, cantidad: vacio(m.cantidad) ? '' : valorMovimiento(m),
        origen: m.origen, nota: m.nota, usuario: m.usuario
      };
    }),
    insumos: insumosActivos()
  };
}

// Mínimos de las casillas de conteo. Vacío o 0 = sin mínimo.
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
      if (!i || !activo(i.activo) || i.medicion !== 'conteo') throw new ErrorApp('No se encontró una de las casillas. Recarga la página.', 'datos');
      ponerCampos(i._fila, { stock_minimo: m.minimo });
    });
    recalcularStocks(); // si algo quedó bajo su nuevo mínimo, avisa
    return { guardados: lista.length, insumos: insumosActivos() };
  });
}

// Ajuste de stock contado: entra la diferencia entre lo contado y lo que dice el sistema.
function ajustarStock(d, ctx) {
  const cantidad = validarNumero(d.cantidad, 'lo contado');
  const nota = String(d.nota || '').trim().slice(0, 200) || 'Conteo';
  return conBloqueo(() => {
    const i = insumosActivos().find((x) => x.id === String(d.insumo_id || ''));
    if (!i || i.medicion !== 'conteo') throw new ErrorApp('Elige una casilla que se cuente.', 'datos');
    const diferencia = redondear(cantidad - i.stock_actual);
    if (diferencia) {
      const fecha = hoyLima();
      agregarFilas('Movimientos', [{
        id: nuevoId('mov'), fecha: fecha, hora: horaLima(), insumo_id: i.id, tipo: 'ajuste',
        cantidad: diferencia, origen: 'manual', nota: nota, usuario: ctx.usuario
      }]);
      recalcularStocks();
      actualizarCierres(fecha, [i.id]);
    }
    return { diferencia: diferencia, insumos: insumosActivos() };
  });
}

// Unidades que descuenta "Hice un lote" (por ahora, la chicha del Glaseado). Vacío o 0 = no descuenta.
function guardarLote(d) {
  const cantidad = vacio(d.lote_cantidad) ? 0 : validarNumero(d.lote_cantidad, 'las unidades por lote');
  return conBloqueo(() => {
    const i = leerTabla('Insumos').find((x) => x.id === String(d.insumo_id || ''));
    if (!i || !activo(i.activo) || !i.lote_insumo_id) throw new ErrorApp('Esa casilla no tiene lotes.', 'datos');
    ponerCampos(i._fila, { lote_cantidad: cantidad || '' });
    return { insumos: insumosActivos() };
  });
}

// Cambia la forma de medir de una casilla. Lo que está en una receta, se vende o se descuenta con un lote
// tiene que seguir contándose.
function cambiarMedicion(d) {
  const medicion = String(d.medicion || '');
  if (MEDICIONES.indexOf(medicion) < 0) throw new ErrorApp('Elige cómo se mide.', 'datos');
  return conBloqueo(() => {
    const insumos = leerTabla('Insumos').filter((x) => activo(x.activo));
    const i = insumos.find((x) => x.id === String(d.insumo_id || ''));
    if (!i) throw new ErrorApp('No se encontró la casilla. Recarga la página.', 'datos');
    const actual = MEDICIONES.indexOf(i.medicion) >= 0 ? i.medicion : 'conteo';
    const conteo = medicion === 'conteo';
    const unidad = !conteo ? '' : UNIDADES.indexOf(d.unidad_base) >= 0 ? d.unidad_base
      : UNIDADES.indexOf(i.unidad_base) >= 0 ? i.unidad_base : 'unidad';
    if (actual === medicion && unidad === (conteo ? i.unidad_base : '')) return { cambio: false, insumos: insumosActivos() };

    if (!conteo) {
      if (i.tipo === 'bebida') throw new ErrorApp('Las bebidas se cuentan: se venden y se descuentan solas.', 'datos');
      const enRecetas = {};
      leerTabla('RecetaIngredientes').forEach((ri) => { if (ri.insumo_id === i.id) enRecetas[ri.receta_id] = true; });
      const recetas = leerTabla('Recetas').filter((r) => activo(r.activa) && enRecetas[r.id]).map((r) => r.nombre);
      if (recetas.length) throw new ErrorApp('Está en la receta de ' + recetas.join(', ') + '. Quítala de ahí primero.', 'datos');
      const lotes = insumos.filter((x) => x.lote_insumo_id === i.id).map((x) => x.nombre);
      if (lotes.length) throw new ErrorApp('Se descuenta con los lotes de ' + lotes.join(', ') + '.', 'datos');
    }

    ponerCampos(i._fila, {
      medicion: medicion, unidad_base: unidad,
      stock_minimo: conteo ? num(i.stock_minimo) : '',
      estado_actual: conteo ? '' : (actual === medicion ? i.estado_actual : ESTADO_INICIAL[medicion])
    });
    recalcularStocks();
    if (conteo) actualizarCierres(hoyLima(), [i.id]);
    return { cambio: true, insumos: insumosActivos() };
  });
}

// Escribe algunas columnas de una fila de Insumos.
function ponerCampos(fila, campos) {
  const sh = hoja('Insumos');
  Object.keys(campos).forEach((col) => sh.getRange(fila, HOJAS.Insumos.indexOf(col) + 1).setValue(campos[col]));
}

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

// En una receta solo van casillas de conteo: las salsas y lo que se marca no se descuentan con las ventas.
function guardarReceta(d) {
  const recetaId = String(d.id || '');
  const lista = (Array.isArray(d.ingredientes) ? d.ingredientes : []).map((i) => ({
    insumo_id: String(i.insumo_id || ''),
    cantidad: validarNumero(i.cantidad, 'la cantidad')
  }));
  if (lista.some((i) => i.cantidad <= 0)) throw new ErrorApp('Cada ingrediente necesita una cantidad mayor que 0.', 'datos');

  return conBloqueo(() => {
    if (!leerTabla('Recetas').some((r) => r.id === recetaId)) throw new ErrorApp('No se encontró la receta.', 'datos');
    const ids = insumosActivos().filter((i) => i.medicion === 'conteo').map((i) => i.id);
    // Si un ingrediente se repite, se suman las cantidades.
    const porInsumo = {};
    lista.forEach((i) => {
      if (ids.indexOf(i.insumo_id) < 0) throw new ErrorApp('Elige un ingrediente que se cuente (porciones o unidades).', 'datos');
      porInsumo[i.insumo_id] = redondear((porInsumo[i.insumo_id] || 0) + i.cantidad);
    });
    // Solo se tocan las filas de esta receta.
    borrarFilas('RecetaIngredientes', 'receta_id', (v) => v === recetaId);
    agregarFilas('RecetaIngredientes', Object.keys(porInsumo).map((id) => ({
      receta_id: recetaId, insumo_id: id, cantidad: porInsumo[id]
    })));
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
    bebidas: datos.insumos.filter((i) => i.tipo === 'bebida' && i.medicion === 'conteo')
      .map((i) => Object.assign({}, i, { vendidos: vendidos('insumo', i.id) })),
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
          // Solo se descuenta lo que se cuenta.
          if (!insumos[ing.insumo_id] || insumos[ing.insumo_id].medicion !== 'conteo') return;
          descuentos[ing.insumo_id] = (descuentos[ing.insumo_id] || 0) + ing.cantidad * v.cantidad;
        });
      } else {
        if (!insumos[v.item_id]) throw new ErrorApp('No se encontró una de las bebidas. Recarga la página.', 'datos');
        descuentos[v.item_id] = (descuentos[v.item_id] || 0) + v.cantidad;
      }
    });

    // Solo se tocan las filas de esta fecha: sus ventas y los descuentos que esas ventas hicieron.
    const ahora = ahoraLima();
    borrarFilas('VentasDia', 'fecha', (v) => v === fecha);
    agregarFilas('VentasDia', lista.map((v) => ({
      fecha: fecha, item_tipo: v.item_tipo, item_id: v.item_id, cantidad: v.cantidad,
      actualizado_por: ctx.usuario, actualizado_en: ahora
    })));

    const origen = 'venta:' + fecha;
    const hora = horaLima();
    const nuevos = Object.keys(descuentos).map((id) => ({
      id: nuevoId('mov'), fecha: fecha, hora: hora, insumo_id: id, tipo: 'venta',
      cantidad: redondear(descuentos[id]), origen: origen, nota: 'Ventas del día', usuario: ctx.usuario
    }));
    const anteriores = movimientosDeFecha(fecha).filter((m) => m.origen === origen).map((m) => m.insumo_id);
    borrarFilas('Movimientos', 'origen', (v) => v === origen);
    agregarFilas('Movimientos', nuevos);
    recalcularStocks();
    const posteriores = actualizarCierres(fecha, anteriores.concat(nuevos.map((m) => m.insumo_id)));

    return {
      sinReceta: sinReceta,
      posteriores: posteriores,
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
    ['origen', 'gramaje_ref', 'estado_actual', 'nota', 'pin_hash'].indexOf(col) >= 0;
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

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

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
function unidadTexto(unidad, n) {
  const plural = Math.abs(n) !== 1;
  if (unidad === 'porción') return plural ? 'porciones' : 'porción';
  return plural ? 'unidades' : 'unidad';
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
