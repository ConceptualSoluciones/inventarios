/* SANTO — todas las llamadas al backend (Apps Script).
   Sin URL en config.js entra en modo demo: corre el mismo Code.gs en el navegador (js/demo.js). */
(function () {
  'use strict';

  const TIMEOUT_MS = 25000;
  const MSJ_RED = 'No se pudo conectar. Revisa tu conexión y vuelve a intentar.';
  const MSJ_VERSION = 'El Apps Script publicado es de una versión anterior. Pega el Code.gs y el Semilla.gs nuevos, ' +
    'ejecuta empezarDeCero() y publica una versión nueva (Implementar › Administrar implementaciones › editar › Nueva versión).';

  class ApiError extends Error {
    constructor(mensaje, codigo) {
      super(mensaje);
      this.name = 'ApiError';
      this.codigo = codigo; // 'red' | 'pin' | 'formato' | 'servidor' | 'accion' | 'datos' | 'config' | 'ocupado'
    }
  }

  // ---------- sesión guardada en el dispositivo ----------
  const memoria = {};
  function leer(clave) {
    try { return localStorage.getItem(clave); } catch (e) { return memoria[clave] ?? null; }
  }
  function escribir(clave, valor) {
    memoria[clave] = valor;
    try {
      if (valor == null) localStorage.removeItem(clave);
      else localStorage.setItem(clave, valor);
    } catch (e) { /* sin almacenamiento: queda solo en memoria */ }
  }

  const sesion = {
    get usuario() { return leer('santo.usuario') || ''; },
    get pin() { return leer('santo.pin') || ''; },
    get lista() { return Boolean(this.usuario && this.pin); },
    guardar(usuario, pin) { escribir('santo.usuario', usuario); escribir('santo.pin', pin); },
    olvidarPin() { escribir('santo.pin', null); }
  };

  // ---------- fechas (día calendario de Lima) ----------
  function hoyLima() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  // ---------- llamada al Apps Script ----------
  function modoDemo() {
    return !(window.SANTO_CONFIG && window.SANTO_CONFIG.API_URL);
  }

  async function llamar(accion, datos = {}) {
    if (modoDemo()) return Demo.atender(accion, datos);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(window.SANTO_CONFIG.API_URL, {
        method: 'POST',
        // text/plain evita el preflight de CORS, que Apps Script no soporta.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: accion, pin: sesion.pin, usuario: sesion.usuario, data: datos }),
        signal: ctrl.signal
      });
    } catch (e) {
      throw new ApiError(MSJ_RED, 'red');
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) throw new ApiError(MSJ_RED, 'red');

    let json;
    try { json = await resp.json(); } catch (e) {
      throw new ApiError('El servidor respondió algo inesperado. Revisa la URL en config.js.', 'formato');
    }
    if (!json || json.ok !== true) {
      if (json && json.code === 'accion') throw new ApiError(MSJ_VERSION, 'config');
      throw new ApiError((json && json.error) || 'Ocurrió un error en el servidor.', (json && json.code) || 'servidor');
    }
    // Un backend anterior a las formas de medir manda las casillas sin "medicion": la app no sabría mostrarlas.
    const insumos = json.data && json.data.insumos;
    if (Array.isArray(insumos) && insumos.length && insumos.every((i) => !('medicion' in i))) {
      throw new ApiError(MSJ_VERSION, 'config');
    }
    return json.data;
  }

  // ---------- modo demo: corre apps-script/Code.gs y Semilla.gs en el navegador (ver js/demo.js) ----------
  const Demo = (() => {
    let cargando = null;
    const cargarScript = (src) => new Promise((ok, falla) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => falla(new ApiError('No se pudo abrir el modo demo (' + src + ').', 'config'));
      document.head.append(s);
    });
    const cargar = () => cargando || (cargando = cargarScript('js/demo.js')
      .then(() => cargarScript('apps-script/Code.gs'))
      .then(() => cargarScript('apps-script/Semilla.gs')));

    async function atender(accion, datos) {
      await cargar();
      await new Promise((r) => setTimeout(r, 400)); // se parece a la demora de Google
      const json = window.SantoDemo.llamar({ action: accion, pin: sesion.pin, usuario: sesion.usuario, data: datos });
      if (!json.ok) throw new ApiError(json.error, json.code);
      return json.data;
    }

    return { atender };
  })();

  window.Api = {
    ApiError, sesion, hoyLima, modoDemo, llamar,
    verificarPin: () => llamar('verificarPin'),
    cargarHoy: (fecha) => llamar('cargarHoy', { fecha }),
    cambiarEstado: (d) => llamar('cambiarEstado', d),
    anotarControl: (d) => llamar('anotarControl', d),
    hiceUnLote: (d) => llamar('hiceUnLote', d),
    cargarInventario: () => llamar('cargarInventario'),
    crearInsumo: (d) => llamar('crearInsumo', d),
    registrarEntradas: (d) => llamar('registrarEntradas', d),
    guardarRevision: (d) => llamar('guardarRevision', d),
    cargarMovimientos: (d) => llamar('cargarMovimientos', d),
    guardarMinimos: (d) => llamar('guardarMinimos', d),
    ajustarStock: (d) => llamar('ajustarStock', d),
    guardarLote: (d) => llamar('guardarLote', d),
    cambiarMedicion: (d) => llamar('cambiarMedicion', d),
    cargarRecetas: () => llamar('cargarRecetas'),
    crearReceta: (d) => llamar('crearReceta', d),
    guardarReceta: (d) => llamar('guardarReceta', d),
    cargarVentas: (fecha) => llamar('cargarVentas', { fecha }),
    guardarVentas: (d) => llamar('guardarVentas', d)
  };
})();
