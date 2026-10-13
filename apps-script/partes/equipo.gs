
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
