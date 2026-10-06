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
    getLastRow() {
      for (let i = this.datos.length - 1; i >= 0; i--) {
        if (this.datos[i].some((v) => v !== '' && v != null)) return i + 1;
      }
      return 0;
    }
    setFrozenRows() {}
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

  // El PIN del demo es el que escriba la persona: cualquiera sirve.
  let pinDemo = '';

  window.SpreadsheetApp = { getActive: () => libro, flush() {} };
  window.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
  window.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k === 'PIN' ? pinDemo : null) }) };
  window.Utilities = {
    formatDate(fecha, tz, formato) {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(fecha).map((x) => [x.type, x.value]));
      return formato.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
        .replace('HH', p.hour === '24' ? '00' : p.hour).replace('mm', p.minute);
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
    llamar(cuerpo) {
      pinDemo = cuerpo.pin || '';
      if (!listo) { window.setup(); listo = true; }
      return JSON.parse(window.doPost({ postData: { contents: JSON.stringify(cuerpo) } }).texto);
    }
  };
})();
