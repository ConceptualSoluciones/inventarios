/* SANTO — piezas comunes: elementos, formatos, avisos, hoja que sube, campos de número y carga de datos */
(function () {
  'use strict';
  const Santo = window.Santo = {};

  const MSJ_GUARDAR = 'No se pudo guardar. Revisa tu conexión y vuelve a intentar.';
  const MSJ_CARGAR = 'No se pudo cargar. Revisa tu conexión y vuelve a intentar.';
  const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  const estado = {
    vistaId: 0,          // cambia en cada render; las cargas que llegan tarde se ignoran
    fechaVentas: null,   // día elegido en Ventas
    insumos: null
  };

  // ---------- utilidades ----------

  // Crea elementos sin innerHTML para que los nombres del Sheet nunca se interpreten como HTML.
  function h(tag, attrs, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // solo con contenido fijo del código
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const hijo of hijos.flat()) {
      if (hijo == null || hijo === false) continue;
      el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
    }
    return el;
  }
  const sinVacios = (lista) => lista.filter(Boolean);

  const nf = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
  const soles = (n) => 'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  // Las unidades las nombra el admin (unidad, porción, jarra, pan…). Estas dos se abrevian.
  const UNIDAD_CORTA = { 'porción': 'porc.', unidad: 'u.' };

  // "jarra" → "jarras", "porción" → "porciones", "pan" → "panes". Los gramos no cambian.
  function unidadPlural(u) {
    if (!u || u === 'g' || u === 'kg') return u || '';
    if (/ón$/.test(u)) return u.slice(0, -2) + 'ones';
    if (/[aeiouáéíóú]$/.test(u)) return u + 's';
    return u + 'es';
  }

  // Número y unidad para mostrar; los gramos pasan a kg cuando el número es grande.
  function cantidad(n, unidad) {
    let valor = Number(n) || 0;
    let u = unidad || '';
    if (u === 'g' && Math.abs(valor) >= 1000) { valor /= 1000; u = 'kg'; }
    else if (UNIDAD_CORTA[u]) u = UNIDAD_CORTA[u];
    else if (Math.abs(valor) !== 1) u = unidadPlural(u);
    return { num: nf.format(valor), unidad: u };
  }
  function cantidadTexto(n, unidad) {
    const c = cantidad(n, unidad);
    return `${c.num} ${c.unidad}`;
  }

  // "12", "12.5" o "12,5" → número; vacío → null; texto inválido → NaN.
  function parseNumero(texto) {
    const s = String(texto).trim().replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  const redondear = (n) => Math.round(n * 1000) / 1000;
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });

  function fechaLarga(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  }

  function ocupado(btn, texto) {
    btn.dataset.texto = btn.textContent;
    btn.textContent = texto;
    btn.disabled = true;
  }
  function libre(btn) {
    if (btn.dataset.texto) btn.textContent = btn.dataset.texto;
    btn.disabled = false;
  }

  function mensajeError(err, siFallaRed) {
    // Sesión vencida, cerrada o de alguien dado de baja: hay que volver a ingresar el PIN.
    if (err && (err.codigo === 'sesion' || err.codigo === 'pin')) {
      Api.sesion.olvidarPin();
      setTimeout(mostrarIngreso, 0);
      return err.codigo === 'sesion' ? err.message : 'El PIN no es válido. Vuelve a ingresarlo.';
    }
    if (!err || err.codigo === 'red') return siFallaRed;
    return err.message || siFallaRed;
  }

  // ---------- avisos (toasts) ----------

  let avisoTimer;
  function aviso(mensaje) {
    const cont = document.getElementById('avisos');
    cont.replaceChildren(h('div', { class: 'aviso' }, mensaje));
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => cont.replaceChildren(), 3000);
  }

  // ---------- hoja que sube ----------

  const Hoja = {
    abierta: false,
    origen: null,
    abrir(contenido, { foco } = {}) {
      const hoja = document.getElementById('hoja');
      document.getElementById('hoja-cuerpo').replaceChildren(contenido);
      if (!this.abierta) this.origen = document.activeElement;
      document.getElementById('capa').hidden = false;
      document.getElementById('app').inert = true;
      document.body.classList.add('con-hoja');
      hoja.classList.add('abierta');
      hoja.scrollTop = 0;
      this.abierta = true;
      (foco || document.getElementById('hoja-tirador')).focus({ preventScroll: true
  });
    },
    cerrar() {
      if (!this.abierta) return;
      document.getElementById('hoja').classList.remove('abierta');
      document.getElementById('capa').hidden = true;
      document.getElementById('app').inert = false;
      document.body.classList.remove('con-hoja');
      this.abierta = false;
      if (this.origen && this.origen.isConnected) this.origen.focus({ preventScroll: true
  });
      this.origen = null;
    }
  };

  // ---------- campo de número con − y + ----------

  function campoNumero({ valor = null, min = 0, paso = 1, etiqueta = '', id, alCambiar } = {}) {
    const input = h('input', {
      class: 'numero-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done',
      id, 'aria-label': id ? null : etiqueta
    });
    input.value = valor == null ? '' : String(valor);

    const leer = () => parseNumero(input.value);
    const avisar = () => { if (alCambiar) alCambiar(leer()); };
    const ajustar = (delta) => {
      const actual = leer();
      const base = Number.isFinite(actual) ? actual : 0;
      input.value = String(Math.max(min, redondear(base + delta)));
      avisar();
    };
    input.addEventListener('input', avisar);

    const sufijo = etiqueta ? ` a ${etiqueta}` : '';
    const el = h('div', { class: 'numero' },
      h('button', { type: 'button', class: 'numero-btn', 'aria-label': `Restar ${paso}${sufijo}`, onclick: () => ajustar(-paso) }, '−'),
      input,
      h('button', { type: 'button', class: 'numero-btn', 'aria-label': `Sumar ${paso}${sufijo}`, onclick: () => ajustar(paso) }, '+'));

    return {
      el,
      input,
      get valor() { return leer(); },
      set valor(v) { input.value = v == null ? '' : String(v); }
    };
  }

  // ---------- piezas comunes ----------

  function ilustracion(item) {
    const caja = h('span', { class: 'pill-ilus', 'aria-hidden': 'true'
  });
    const inicial = () => h('span', { class: 'pill-inicial' }, (item.nombre || '?').charAt(0).toUpperCase());
    const archivo = String(item.ilustracion || '').replace(/\.svg$/i, '');
    if (archivo) {
      const img = h('img', { src: `assets/ilustraciones/${encodeURIComponent(archivo)}.svg`, alt: '', width: 96, height: 96
  });
      img.addEventListener('error', () => caja.replaceChildren(inicial()), { once: true
  });
      caja.append(img);
    } else {
      caja.append(inicial());
    }
    return caja;
  }

  function esqueletoFilas(n = 5) {
    return h('div', { class: 'lista-items', 'aria-hidden': 'true' },
      Array.from({ length: n }, () => h('div', { class: 'fila-esqueleto' })));
  }

  function errorCarga(err, reintentar) {
    return h('div', { class: 'error-carga' },
      h('p', null, mensajeError(err, MSJ_CARGAR)),
      h('button', { type: 'button', class: 'btn btn-secundario', onclick: reintentar }, 'Reintentar'));
  }

  // Carga los datos de una vista. Si el usuario ya cambió de pantalla, la respuesta se ignora.
  async function cargarEn(zona, pedir, pintar) {
    const id = estado.vistaId;
    zona.setAttribute('aria-busy', 'true');
    try {
      const datos = await pedir();
      if (id !== estado.vistaId) return;
      zona.removeAttribute('aria-busy');
      pintar(datos);
    } catch (err) {
      if (id !== estado.vistaId) return;
      zona.removeAttribute('aria-busy');
      zona.replaceChildren(errorCarga(err, render));
    }
  }

  function volver(href, texto) {
    return h('a', { class: 'volver', href }, '‹ ' + texto);
  }

  // soloHoy: para quien no es admin (no corrige días pasados), solo muestra el día.
  function selectorFecha(fecha, alCambiar, soloHoy) {
    if (soloHoy) return [h('p', { class: 'fecha-larga' }, fechaLarga(fecha))];
    const hoy = Api.hoyLima();
    const input = h('input', {
      type: 'date', class: 'campo campo-fecha', id: 'fecha-dia', value: fecha, max: hoy,
      onchange: (e) => { if (e.target.value) alCambiar(e.target.value > hoy ? hoy : e.target.value); }
    });
    return [
      h('div', { class: 'fila-fecha' },
        h('label', { class: 'etiqueta-campo', for: 'fecha-dia' }, 'Día'),
        input,
        fecha !== hoy && h('button', { type: 'button', class: 'btn btn-secundario btn-chico', onclick: () => alCambiar(hoy) }, 'Volver a hoy')),
      h('p', { class: 'fecha-larga' }, fechaLarga(fecha))
    ];
  }

  // ---------- ganchos y registro de páginas ----------

  // render (app.js), mostrarIngreso (paginas/ingreso.js) y abrirProducto (paginas/productos.js) se definen
  // en otros archivos; estas versiones las llaman cuando la app ya cargó entera.
  Santo.ganchos = {};
  const render = () => Santo.ganchos.render();
  const mostrarIngreso = () => Santo.ganchos.mostrarIngreso();
  const abrirProducto = (item) => Santo.ganchos.abrirProducto(item);

  // Cada página se registra con su ruta. soloAdmin: cocina ve "Solo admin". seccion: qué marca la barra de abajo.
  Santo.paginas = {};
  function pagina(ruta, vista, opciones) {
    Santo.paginas[ruta] = Object.assign({ vista: vista, soloAdmin: false, seccion: ruta.split('/')[0] }, opciones);
  }

  Object.assign(Santo, {
    MSJ_GUARDAR, MSJ_CARGAR, CHEVRON, estado, h, sinVacios, nf, soles, UNIDAD_CORTA, unidadPlural,
    cantidad, cantidadTexto, parseNumero, redondear, porNombre, fechaLarga, ocupado, libre,
    mensajeError, aviso, Hoja, campoNumero, ilustracion, esqueletoFilas, errorCarga, cargarEn, volver,
    selectorFecha, render, mostrarIngreso, abrirProducto, pagina
  });
})();
