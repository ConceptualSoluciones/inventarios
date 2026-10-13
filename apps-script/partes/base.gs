/**
 * SANTO — backend en Google Apps Script.
 *
 * Vive en el Apps Script del Google Sheet (Extensiones › Apps Script) y se publica como aplicación web.
 * La web manda POST con { action, token o pin, data } y recibe { ok, data } o { ok: false, error, code }.
 *
 * El código está separado por tema en apps-script/partes/ y `clasp push` sube cada parte como un archivo
 * del proyecto (ver README). Apps Script comparte las variables entre archivos, y ninguna parte depende de que
 * otra cargue antes: cada parte declara sus acciones en ACCIONES_<PARTE> y acciones() las junta al atender.
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

// Lo que la web puede pedir. Cada parte declara las suyas en una variable ACCIONES_<PARTE>, por ejemplo:
//   var ACCIONES_COMPRAS = { cargarCompras: { fn: cargarCompras }, registrarCompras: { fn: registrarCompras } };
// soloAdmin: true → "cocina" no la puede pedir. Todo lo que se puede anotar en un día pasado es soloAdmin,
// así que solo un admin corrige días pasados.
// Las listas se juntan al atender cada pedido, no al cargar los archivos: así no importa en qué orden
// carga Apps Script los archivos. Van con "var" (no const) para que se puedan encontrar por su nombre.
function acciones() {
  const todas = {};
  Object.keys(globalThis).filter((k) => k.indexOf('ACCIONES_') === 0).forEach((k) => {
    Object.keys(globalThis[k]).forEach((nombre) => {
      if (todas[nombre]) throw new Error('La acción ' + nombre + ' está en dos partes (' + k + ').');
      todas[nombre] = globalThis[k][nombre];
    });
  });
  return todas;
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
    const accion = acciones()[pedido.action];
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
