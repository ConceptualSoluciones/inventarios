/* SANTO — modo demo.
   Imita lo mínimo de Google Sheets y Apps Script para correr el MISMO apps-script/Code.gs y Semilla.gs
   en el navegador, con los datos en memoria (se pierden al recargar). Solo se usa sin URL en config.js
   y abriendo el index.html desde la computadora. */
(function () {
  'use strict';

  class HojaDemo {
    constructor(nombre) { this.nombre = nombre; this.datos = []; this.max = 1000; }
    getMaxRows() { return this.max; }
    insertRowsAfter(fila, n) { this.max += n; }
    deleteRows(fila, n) {
      if (this.max - n < 2) throw new Error('No se pueden borrar todas las filas de ' + this.nombre);
      this.datos.splice(fila - 1, n);
      this.max -= n;
    }
    getLastColumn() { return Math.max(0, ...this.datos.map((f) => f.length)); }
    getLastRow() {
      for (let i = this.datos.length - 1; i >= 0; i--) {
        if (this.datos[i].some((v) => v !== '' && v != null)) return i + 1;
      }
      return 0;
    }
    setFrozenRows() {}
    clear() { this.datos = []; return this; }
    poner(fila, col, valor) {
      if (fila > this.max) throw new Error(`Fila ${fila} fuera de la hoja ${this.nombre}`);
      while (this.datos.length < fila) this.datos.push([]);
      const f = this.datos[fila - 1];
      while (f.length < col) f.push('');
      f[col - 1] = valor;
    }
    leer(fila, col) {
      const f = this.datos[fila - 1];
      return f && f[col - 1] != null ? f[col - 1] : '';
    }
    getDataRange() {
      const alto = this.getLastRow();
      const ancho = Math.max(1, ...this.datos.map((f) => f.length));
      return this.getRange(1, 1, Math.max(alto, 1), ancho);
    }
    getRange(fila, col, filas = 1, cols = 1) {
      const hoja = this;
      const rango = {
        getValues() {
          return Array.from({ length: filas }, (_, i) => Array.from({ length: cols }, (_, j) => hoja.leer(fila + i, col + j)));
        },
        setValues(v) {
          if (v.length !== filas || v.some((f) => f.length !== cols)) throw new Error('El tamaño no coincide con el rango');
          v.forEach((f, i) => f.forEach((x, j) => hoja.poner(fila + i, col + j, x)));
          return rango;
        },
        setValue(x) { hoja.poner(fila, col, x); return rango; },
        clearContent() {
          for (let i = 0; i < filas; i++) for (let j = 0; j < cols; j++) hoja.poner(fila + i, col + j, '');
          return rango;
        },
        setNumberFormat() { return rango; },
        setFontWeight() { return rango; }
      };
      return rango;
    }
  }

  const libro = {
    hojas: {},
    getSheetByName(n) { return this.hojas[n] || null; },
    insertSheet(n) { return (this.hojas[n] = new HojaDemo(n)); },
    setSpreadsheetTimeZone(tz) { this.tz = tz; },
    getSheets() { return Object.values(this.hojas); },
    deleteSheet(h) { delete this.hojas[h.nombre]; }
  };

  // SHA-256 síncrono (como Utilities.computeDigest): devuelve bytes con signo, igual que Apps Script.
  // crypto.subtle no sirve aquí porque es asíncrono y Code.gs no espera promesas.
  function sha256(texto) {
    const bytes = Array.from(new TextEncoder().encode(texto));
    const largoBits = bytes.length * 8;
    const H = [];
    const K = [];
    const fraccion = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
    const esPrimo = (n) => { for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
    for (let n = 2, k = 0; k < 64; n++) {
      if (!esPrimo(n)) continue;
      if (k < 8) H[k] = fraccion(Math.pow(n, 1 / 2));
      K[k++] = fraccion(Math.pow(n, 1 / 3));
    }
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(0, 0, 0, 0, (largoBits >>> 24) & 255, (largoBits >>> 16) & 255, (largoBits >>> 8) & 255, largoBits & 255);
    for (let i = 0; i < bytes.length; i += 64) {
      const w = [];
      for (let j = 0; j < 16; j++) {
        w[j] = (bytes[i + 4 * j] << 24) | (bytes[i + 4 * j + 1] << 16) | (bytes[i + 4 * j + 2] << 8) | bytes[i + 4 * j + 3];
      }
      for (let j = 16; j < 64; j++) {
        const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = H;
      for (let j = 0; j < 64; j++) {
        const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, c, d, e, f, g, hh].forEach((x, k) => { H[k] = (H[k] + x) | 0; });
    }
    return H.flatMap((x) => [x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]).map((v) => (v > 127 ? v - 256 : v));
  }

  // Caché con vencimiento, como CacheService (para el límite de intentos).
  const cache = {};
  const scriptCache = {
    get: (k) => (cache[k] && cache[k].vence > Date.now() ? cache[k].valor : null),
    put(k, valor, segundos) { cache[k] = { valor: String(valor), vence: Date.now() + segundos * 1000 }; },
    remove(k) { delete cache[k]; }
  };

  // Sin Telegram configurado, no se envía nada.
  const propiedades = {};
  const scriptProperties = {
    getProperty: (k) => (k in propiedades ? propiedades[k] : null),
    setProperty(k, v) { propiedades[k] = String(v); return this; },
    deleteProperty(k) { delete propiedades[k]; return this; },
    getProperties: () => ({ ...propiedades })
  };

  window.SpreadsheetApp = { getActive: () => libro, flush() {} };
  window.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
  window.PropertiesService = { getScriptProperties: () => scriptProperties };
  window.CacheService = { getScriptCache: () => scriptCache };
  window.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: (algoritmo, texto) => sha256(texto),
    formatDate(fecha, tz, formato) {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).formatToParts(fecha).map((x) => [x.type, x.value]));
      return formato.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
        .replace('HH', p.hour === '24' ? '00' : p.hour).replace('mm', p.minute).replace('ss', p.second);
    },
    getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now())
  };
  window.ContentService = {
    createTextOutput(texto) { return { texto, setMimeType() { return this; } }; },
    MimeType: { JSON: 'json' }
  };

  let listo = false;
  window.SantoDemo = {
    libro,
    // Mismo formato que el fetch real: devuelve el JSON que respondería doPost.
    sha256,
    llamar(cuerpo) {
      // Dos personas de prueba: 111111 (admin) y 222222 (cocina).
      if (!listo) {
        window.setup();
        window.agregarPersona('Ana (demo)', '111111', 'admin');
        window.agregarPersona('Beto (demo)', '222222', 'cocina');
        listo = true;
      }
      return JSON.parse(window.doPost({ postData: { contents: JSON.stringify(cuerpo) } }).texto);
    }
  };
})();
