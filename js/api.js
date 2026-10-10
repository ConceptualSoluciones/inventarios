/* SANTO — todas las llamadas al backend (Apps Script).
   Sin URL en config.js entra en modo demo: corre el mismo Code.gs en el navegador (js/demo.js). */
(function () {
  'use strict';

  const TIMEOUT_MS = 25000;
  const MSJ_RED = 'No se pudo conectar. Revisa tu conexión y vuelve a intentar.';
  const MSJ_VERSION = 'El Apps Script publicado es de una versión anterior. Pega el Code.gs y el Semilla.gs nuevos ' +
    'y publica una versión nueva (Implementar › Administrar implementaciones › editar › Nueva versión).';

  class ApiError extends Error {
    constructor(mensaje, codigo) {
      super(mensaje);
      this.name = 'ApiError';
      this.codigo = codigo; // 'red' | 'pin' | 'formato' | 'servidor' | 'accion' | 'datos' | 'config' | 'ocupado' | 'bloqueado' | 'permiso' | 'sesion'
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

  // El PIN (personal, 6 números) solo viaja al ingresar y no se guarda. A cambio, el servidor entrega un token
  // de sesión que queda en este celular. El nombre y el rol también los manda el servidor: no se escriben.
  // Las claves de versiones anteriores (PIN compartido o PIN guardado) se borran.
  ['santo.pin', 'santo.usuario', 'santo.clave'].forEach((k) => escribir(k, null));
  const sesion = {
    get token() { return leer('santo.token') || ''; },
    get usuario() { return leer('santo.nombre') || ''; },
    get rol() { return leer('santo.rol') || 'cocina'; },
    get esAdmin() { return this.rol === 'admin'; },
    get lista() { return Boolean(this.token); },
    guardarToken(token) { escribir('santo.token', token); },
    guardarQuien(quien) {
      if (!quien) return;
      escribir('santo.nombre', quien.nombre);
      escribir('santo.rol', quien.rol);
    },
    olvidarPin() { ['santo.token', 'santo.nombre', 'santo.rol'].forEach((k) => escribir(k, null)); }
  };

  // ---------- fechas: día de operación en Lima ----------
  // Antes de la hora de corte todavía es el día anterior. La hora la manda el servidor (HORA_CORTE_DIA en Code.gs).
  function horaCorte() {
    const guardada = leer('santo.corte');
    const n = guardada == null || guardada === '' ? NaN : Number(guardada);
    return Number.isInteger(n) && n >= 0 && n < 24 ? n : 5;
  }
  function hoyLima() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(Date.now() - horaCorte() * 60 * 60 * 1000));
  }
  // Lo que todo pedido exitoso trae además de los datos: quién es y la hora de corte.
  function recibir(json) {
    sesion.guardarQuien(json.quien);
    if (Number.isInteger(json.corte)) escribir('santo.corte', String(json.corte));
  }
  // Con PIN solo se ingresa; todo lo demás va con el token.
  const cuerpo = (accion, datos, pin) =>
    (pin ? { action: accion, pin, data: datos } : { action: accion, token: sesion.token, data: datos });

  // ---------- llamada al Apps Script ----------
  function modoDemo() {
    return !(window.SANTO_CONFIG && window.SANTO_CONFIG.API_URL);
  }

  async function llamar(accion, datos = {}, pin) {
    if (modoDemo()) return Demo.atender(accion, datos, pin);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(window.SANTO_CONFIG.API_URL, {
        method: 'POST',
        // text/plain evita el preflight de CORS, que Apps Script no soporta.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(cuerpo(accion, datos, pin)),
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
      throw new ApiError((json && json.error) || 'Ocurrió un error. Intenta de nuevo.', (json && json.code) || 'servidor');
    }
    recibir(json);
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

    async function atender(accion, datos, pin) {
      await cargar();
      await new Promise((r) => setTimeout(r, 400)); // se parece a la demora de Google
      const json = window.SantoDemo.llamar(cuerpo(accion, datos, pin));
      if (!json.ok) throw new ApiError(json.error, json.code);
      recibir(json);
      return json.data;
    }

    return { atender };
  })();

  window.Api = {
    ApiError, sesion, hoyLima, modoDemo, llamar,
    // Ingresa con el PIN y deja guardado el token de sesión (el PIN no se guarda).
    ingresar: async (pin) => {
      const r = await llamar('verificarPin', {}, pin);
      sesion.guardarToken(r.token);
      return r;
    },
    // Cierra la sesión en el servidor y la borra del celular. Si no hay conexión, igual se borra aquí.
    cerrarSesion: async () => {
      try { await llamar('cerrarSesion'); } catch (e) { /* se borra igual en el celular */ }
      sesion.olvidarPin();
    },
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
