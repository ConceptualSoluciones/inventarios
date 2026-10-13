
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
