/* SANTO — navegación y vistas */
(function () {
  'use strict';

  const MSJ_GUARDAR = 'No se pudo guardar. Revisa tu conexión y vuelve a intentar.';
  const MSJ_CARGAR = 'No se pudo cargar. Revisa tu conexión y vuelve a intentar.';
  const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  const estado = {
    vistaId: 0,          // cambia en cada render; las cargas que llegan tarde se ignoran
    fechaHoy: null,      // día elegido en Hoy (control del día de las proteínas)
    fechaVentas: null,   // día elegido en Ventas
    insumos: null,
    zonaInventario: null
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
  const UNIDAD_CORTA = { 'porción': 'porc.', porcion: 'porc.', unidad: 'u.', g: 'g', ml: 'ml' };
  const UNIDAD_LARGA = {
    'porción': ['porción', 'porciones'], porcion: ['porción', 'porciones'],
    unidad: ['unidad', 'unidades'], g: ['gramo', 'gramos'], ml: ['mililitro', 'mililitros']
  };

  // Número y unidad para mostrar; pasa a kg o l cuando el número es grande.
  function cantidad(n, unidad) {
    let valor = Number(n) || 0;
    let u = UNIDAD_CORTA[unidad] || unidad || '';
    if (unidad === 'g' && Math.abs(valor) >= 1000) { valor /= 1000; u = 'kg'; }
    if (unidad === 'ml' && Math.abs(valor) >= 1000) { valor /= 1000; u = 'l'; }
    return { num: nf.format(valor), unidad: u };
  }
  function cantidadTexto(n, unidad) {
    const c = cantidad(n, unidad);
    return `${c.num} ${c.unidad}`;
  }
  function unidadPlural(unidad) {
    return (UNIDAD_LARGA[unidad] || [unidad, unidad])[1];
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
    if (err && err.codigo === 'pin') {
      Api.sesion.olvidarPin();
      setTimeout(mostrarIngreso, 0);
      return 'El PIN no es válido. Vuelve a ingresarlo.';
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
      (foco || document.getElementById('hoja-tirador')).focus({ preventScroll: true });
    },
    cerrar() {
      if (!this.abierta) return;
      document.getElementById('hoja').classList.remove('abierta');
      document.getElementById('capa').hidden = true;
      document.getElementById('app').inert = false;
      document.body.classList.remove('con-hoja');
      this.abierta = false;
      if (this.origen && this.origen.isConnected) this.origen.focus({ preventScroll: true });
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
    const caja = h('span', { class: 'pill-ilus', 'aria-hidden': 'true' });
    const inicial = () => h('span', { class: 'pill-inicial' }, (item.nombre || '?').charAt(0).toUpperCase());
    const archivo = String(item.ilustracion || '').replace(/\.svg$/i, '');
    if (archivo) {
      const img = h('img', { src: `assets/ilustraciones/${encodeURIComponent(archivo)}.svg`, alt: '', width: 96, height: 96 });
      img.addEventListener('error', () => caja.replaceChildren(inicial()), { once: true });
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

  function selectorFecha(fecha, alCambiar) {
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

  // ---------- casillas: formas de medir, grupos y buscador ----------

  // conteo: porciones o unidades, con stock · nivel: salsas (Lleno · Medio · Poco · Vacío) · marcar: Hay / Falta.
  const esConteo = (i) => i.medicion === 'conteo';
  const NIVELES = [['lleno', 'Lleno'], ['medio', 'Medio'], ['poco', 'Poco'], ['vacío', 'Vacío']];
  const MARCAS = [['hay', 'Hay'], ['falta', 'Falta']];
  const ESTADOS_ALERTA = ['poco', 'vacío', 'falta'];
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // Lo que hay de una casilla de conteo, en su unidad (porciones o unidades).
  const mostrar = (n, item) => cantidad(n, item.unidad_base);
  function mostrarTexto(n, item) {
    const m = mostrar(n, item);
    return `${m.num} ${m.unidad}`;
  }
  const unidadDeIngreso = (item) => unidadPlural(item.unidad_base);

  const ORDEN_CATEGORIAS = ['Proteínas', 'Salsas', 'Complementos', 'Panes', 'Verduras', 'Lácteos',
    'Secos', 'Congelados', 'Bebidas', 'Solo producción'];

  // Agrupa por categoría (en el orden de la cocina) y ordena alfabéticamente dentro de cada grupo.
  function agruparPorCategoria(insumos) {
    const grupos = {};
    insumos.forEach((i) => { (grupos[i.categoria || 'Otros'] = grupos[i.categoria || 'Otros'] || []).push(i); });
    const pos = (c) => { const k = ORDEN_CATEGORIAS.indexOf(c); return k < 0 ? ORDEN_CATEGORIAS.length : k; };
    return Object.keys(grupos)
      .sort((a, b) => pos(a) - pos(b) || a.localeCompare(b, 'es'))
      .map((categoria) => ({ categoria, items: grupos[categoria].sort(porNombre) }));
  }

  const TILDES = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
  const sinTildes = (s) => String(s).toLowerCase().normalize('NFD').replace(TILDES, '');

  // Caja de búsqueda que oculta las filas [data-buscar] que no coinciden y los grupos que quedan vacíos.
  function buscador(contenedor, id) {
    const input = h('input', {
      type: 'search', class: 'campo', id, placeholder: 'Buscar…', autocomplete: 'off', 'aria-label': 'Buscar casilla',
      oninput: () => {
        const q = sinTildes(input.value.trim());
        contenedor.querySelectorAll('[data-buscar]').forEach((el) => { el.hidden = Boolean(q) && !el.dataset.buscar.includes(q); });
        contenedor.querySelectorAll('[data-grupo]').forEach((g) => { g.hidden = !g.querySelector('[data-buscar]:not([hidden])'); });
      }
    });
    return input;
  }

  // ---------- Hoy: menú principal + lo que falta hacer ----------

  const MENU = [
    { id: 'inventario', nombre: 'Inventario', etiqueta: 'lo que hay', color: 'mustard', ilustracion: 'inventario', href: '#inventario' },
    { id: 'recetas', nombre: 'Recetas', etiqueta: 'lo que lleva cada pan', color: 'plum', ilustracion: 'recetas', href: '#recetas' },
    { id: 'produccion', nombre: 'Producción', etiqueta: 'lo que entra o se compra', color: 'navy', ilustracion: 'produccion', href: '#produccion' },
    { id: 'ventas', nombre: 'Ventas', etiqueta: 'panes y bebidas que salen', color: 'sand', ilustracion: 'ventas', href: '#ventas' }
  ];

  function pildoraMenu(op, tag) {
    return h('a', { class: `pill pill--${op.color}` + (tag ? ' pill--alerta' : ''), href: op.href },
      tag && h('span', { class: 'pill-tag' }, tag),
      h('span', { class: 'pill-etiqueta' }, op.etiqueta),
      h('span', { class: 'pill-nombre pill-nombre--menu' }, op.nombre),
      ilustracion(op));
  }

  const bajoMinimo = (i) => esConteo(i) && i.stock_minimo > 0 && i.stock_actual < i.stock_minimo;
  const negativo = (i) => esConteo(i) && i.stock_actual < 0;

  // Pastilla de la píldora de Inventario: solo mira las casillas de conteo.
  function pendientesInventario(insumos) {
    const bajos = insumos.filter((i) => bajoMinimo(i) && !negativo(i)).length;
    const revisar = insumos.filter(negativo).length;
    const n = bajos + revisar;
    if (!n) return null;
    return revisar ? `${n} por revisar` : `${n} por comprar`;
  }

  // Bajo el mínimo (conteo), salsas en Poco o Vacío (nivel) y lo que está en Falta (marcar).
  function porComprar(insumos) {
    return {
      bajos: insumos.filter(bajoMinimo).sort(porNombre),
      salsas: insumos.filter((i) => i.medicion === 'nivel' && ESTADOS_ALERTA.includes(i.estado_actual)).sort(porNombre),
      faltan: insumos.filter((i) => i.medicion === 'marcar' && i.estado_actual === 'falta').sort(porNombre)
    };
  }

  // Botones de estado: Lleno · Medio · Poco · Vacío, o Hay / Falta. Siempre hay uno marcado.
  function selectorEstado(item, valor, alElegir) {
    const opciones = item.medicion === 'nivel' ? NIVELES : MARCAS;
    const botones = opciones.map(([v, texto]) => h('button', {
      type: 'button', class: 'estado-btn' + (ESTADOS_ALERTA.includes(v) ? ' estado-btn--alerta' : ''),
      'data-valor': v, 'aria-pressed': 'false', onclick: () => alElegir(v)
    }, texto));
    const marcar = (v) => botones.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valor === v)));
    marcar(valor);
    return {
      el: h('div', { class: `estados estados--${botones.length}`, role: 'group', 'aria-label': item.nombre }, botones),
      marcar
    };
  }

  // Fila de una salsa (nombre arriba, 4 botones abajo) o de un ingrediente (nombre y Hay / Falta en la misma línea).
  function filaConEstado(item, selector, extra) {
    return h('div', { class: `fila-estado fila-estado--${item.medicion}`, 'data-buscar': sinTildes(item.nombre) },
      h('div', { class: 'fila-estado-cabeza' }, h('span', { class: 'fila-etiqueta' }, item.nombre), extra),
      selector.el);
  }

  function grupoInsumos(titulo, hijos, clase) {
    return h('section', { class: 'grupo' + (clase ? ' ' + clase : ''), 'data-grupo': '' },
      h('h2', { class: 'subtitulo' }, titulo),
      h('div', { class: 'lista-items' }, hijos));
  }

  // ---------- Hoy: alertas, control del día, salsas e ingredientes ----------

  function vistaInicio(main) {
    const hoy = Api.hoyLima();
    if (!estado.fechaHoy || estado.fechaHoy > hoy) estado.fechaHoy = hoy;
    const fecha = estado.fechaHoy;
    const menu = h('nav', { class: 'pills', 'aria-label': 'Menú principal' }, MENU.map((op) => pildoraMenu(op)));
    const zona = h('div', { class: 'hoy' }, esqueletoFilas(6));
    main.replaceChildren(h('h1', { class: 'titulo' }, 'Hoy'), menu, zona);
    cargarEn(zona, () => Api.cargarHoy(fecha), (datos) => pintarHoy(zona, menu, datos));
  }

  function pintarHoy(zona, menu, datos) {
    estado.insumos = datos.insumos;
    const insumos = datos.insumos;
    const porId = {};
    insumos.forEach((i) => { porId[i.id] = i; });

    const alertas = h('div');
    const repintarAlertas = () => {
      menu.replaceChildren(...MENU.map((op) => pildoraMenu(op, op.id === 'inventario' && pendientesInventario(insumos))));
      pintarAlertas(alertas, insumos);
    };
    repintarAlertas();

    // Proteínas: control del día de la fecha elegida.
    const control = datos.control
      .filter((c) => porId[c.insumo_id])
      .sort((a, b) => porNombre(porId[a.insumo_id], porId[b.insumo_id]))
      .map((c) => filaControl(porId[c.insumo_id], c, datos.fecha));

    // Salsas e ingredientes: muestran siempre el estado actual y se guardan al tocar.
    const conEstado = (item) => {
      const extra = item.lote_insumo_id && h('button', {
        type: 'button', class: 'btn btn-secundario btn-chico', onclick: () => abrirLote(item, porId)
      }, 'Hice un lote');
      return filaConEstado(item, selectorEnVivo(item, repintarAlertas), extra);
    };
    const salsas = insumos.filter((i) => i.medicion === 'nivel').sort(porNombre).map(conEstado);
    const ingredientes = agruparPorCategoria(insumos.filter((i) => i.medicion === 'marcar')).map(({ categoria, items }) => {
      const filas = items.map(conEstado);
      if (categoria !== 'Solo producción') return grupoInsumos(categoria, filas);
      // Es la lista más larga y se usa menos: va plegada.
      return h('details', { class: 'grupo plegable' },
        h('summary', { class: 'subtitulo' }, `Solo producción (${items.length})`),
        h('div', { class: 'lista-items' }, filas));
    });

    zona.replaceChildren(...sinVacios([
      alertas,
      ...selectorFecha(datos.fecha, (f) => { estado.fechaHoy = f; render(); }),
      control.length && grupoInsumos('Proteínas', control),
      salsas.length && grupoInsumos('Salsas', salsas),
      ingredientes.length && h('section', { class: 'grupos' },
        h('h2', { class: 'subtitulo subtitulo--seccion' }, 'Ingredientes'),
        ...ingredientes)
    ]));
  }

  function pintarAlertas(cont, insumos) {
    const revisar = insumos.filter(negativo).sort(porNombre);
    const pc = porComprar(insumos);
    const total = pc.bajos.length + pc.salsas.length + pc.faltan.length;
    const detalle = sinVacios([
      pc.bajos.length && `${pc.bajos.length} bajo el mínimo`,
      pc.salsas.length && `${pc.salsas.length} ${pc.salsas.length === 1 ? 'salsa' : 'salsas'} por acabarse`,
      pc.faltan.length && `${pc.faltan.length} ${pc.faltan.length === 1 ? 'falta' : 'faltan'}`
    ]).join(' · ');
    const fila = (href, contenido) => h('li', null, h('a', { class: 'alerta-fila', href },
      h('span', { class: 'punto', 'aria-hidden': 'true' }), h('span', null, contenido)));
    const items = [
      ...revisar.map((i) => fila('#produccion', ['Revisar ', h('strong', null, i.nombre),
        `: quedó en ${mostrarTexto(i.stock_actual, i)} · falta anotar lo que entró`])),
      total && fila('#por-comprar', [h('strong', null, `Por comprar: ${total}`), ` · ${detalle}`])
    ].filter(Boolean);
    cont.replaceChildren(items.length
      ? h('section', { class: 'alertas', 'aria-labelledby': 'alertas-titulo' },
          h('h2', { class: 'subtitulo', id: 'alertas-titulo' }, 'Lo que falta hacer'),
          h('ul', null, items))
      : h('p', { class: 'nota' }, 'Todo en orden.'));
  }

  // Se marca al tocar y se guarda por detrás. Si falla, vuelve a lo último que se guardó.
  function selectorEnVivo(item, alGuardar) {
    let guardado = item.estado_actual;
    let mostrado = guardado;
    let ultimo = 0;
    const selector = selectorEstado(item, guardado, async (v) => {
      if (v === mostrado) return;
      mostrado = v;
      selector.marcar(v);
      const pedido = ++ultimo;
      try {
        const r = await Api.cambiarEstado({ insumo_id: item.id, estado: v });
        if (pedido !== ultimo) return;
        guardado = r.insumo ? r.insumo.estado_actual : v;
        item.estado_actual = guardado;
        alGuardar();
      } catch (err) {
        if (pedido !== ultimo) return;
        mostrado = guardado;
        selector.marcar(guardado);
        aviso(mensajeError(err, MSJ_GUARDAR));
      }
    });
    return selector;
  }

  function filaControl(item, c, fecha) {
    const unidad = cantidad(0, item.unidad_base).unidad;
    const celda = (etiqueta, n, signo) => h('div', { class: 'control-celda' },
      h('span', { class: 'control-num' }, (n ? signo : '') + nf.format(n)),
      h('span', { class: 'control-etiqueta' }, etiqueta));
    const bajo = c.queda < 0;
    return h('div', { class: 'control' + (bajo ? ' control--bajo' : '') },
      h('div', { class: 'control-cabeza' },
        h('span', { class: 'fila-etiqueta' }, item.nombre,
          item.gramaje_ref && h('span', { class: 'fila-nota' }, `${item.gramaje_ref} por porción`)),
        h('span', { class: 'control-queda' },
          h('span', { class: 'control-queda-num' },
            bajo && h('span', { class: 'punto', 'aria-hidden': 'true' }),
            h('strong', null, nf.format(c.queda)),
            h('span', { class: 'valor-unidad' }, unidad)),
          h('span', { class: 'control-etiqueta' }, bajo ? 'quedó en negativo' : 'quedan'))),
      h('div', { class: 'control-cuentas' },
        celda('inicial', c.inicial, ''),
        celda('producido', c.producido, '+'),
        celda('vendido', c.vendido, '−'),
        celda('merma', c.merma, '−'),
        c.ajuste !== 0 && celda('ajuste', Math.abs(c.ajuste), c.ajuste < 0 ? '−' : '+')),
      h('button', { type: 'button', class: 'btn btn-secundario btn-chico', onclick: () => abrirControl(item, fecha) },
        'Anotar producido o merma'));
  }

  function abrirControl(item, fecha) {
    const fProducido = campoNumero({ etiqueta: 'lo producido', id: 'ctl-producido' });
    const fMerma = campoNumero({ etiqueta: 'la merma', id: 'ctl-merma' });
    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Guardar');
    async function guardar(e) {
      e.preventDefault();
      const producido = fProducido.valor;
      const merma = fMerma.valor;
      for (const [v, campo, nombre] of [[producido, fProducido, 'lo producido'], [merma, fMerma, 'la merma']]) {
        if (v != null && (!Number.isFinite(v) || v < 0)) { aviso(`Revisa ${nombre}: tiene que ser un número.`); campo.input.focus(); return; }
      }
      if (!(producido > 0) && !(merma > 0)) { aviso('Escribe lo producido o la merma.'); fProducido.input.focus(); return; }
      ocupado(btn, 'Guardando…');
      try {
        const r = await Api.anotarControl({ fecha, insumo_id: item.id, producido: producido || 0, merma: merma || 0 });
        Hoja.cerrar();
        aviso(r.posteriores ? 'Guardado. Corregiste un día pasado: los días siguientes pueden no cuadrar.' : 'Guardado');
        render();
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }
    Hoja.abrir(h('form', { class: 'formulario', novalidate: true, onsubmit: guardar },
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, item.nombre),
      h('p', { class: 'texto-suave' }, `${capital(fechaLarga(fecha))}. Se suma a lo que ya se anotó ese día, en ${unidadDeIngreso(item)}.`),
      h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'ctl-producido' }, 'Producido'), fProducido.el),
      h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'ctl-merma' }, 'Merma', h('span', { class: 'fila-nota' }, 'lo que se botó o se malogró')), fMerma.el),
      btn), { foco: fProducido.input });
  }

  // Glaseado Bravo: un lote nuevo descuenta la chicha y deja la salsa en Lleno.
  function abrirLote(item, porId) {
    const destino = porId[item.lote_insumo_id];
    const cantidadLote = Number(item.lote_cantidad) || 0;
    const btn = h('button', { type: 'button', class: 'btn btn-primario', onclick: confirmar }, 'Confirmar lote');
    async function confirmar() {
      ocupado(btn, 'Guardando…');
      try {
        const r = await Api.hiceUnLote({ insumo_id: item.id });
        Hoja.cerrar();
        aviso(r.descontado
          ? `Lote anotado: −${cantidadTexto(r.descontado.cantidad, r.descontado.unidad_base)} de ${r.descontado.nombre}`
          : 'Lote anotado. No se descontó chicha: falta definir cuántas unidades lleva un lote (Ajustes).');
        render();
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }
    Hoja.abrir(h('div', { class: 'formulario' }, ...sinVacios([
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, `${item.nombre}: nuevo lote`),
      destino && cantidadLote > 0
        ? h('p', null, `Se descuenta ${cantidadTexto(cantidadLote, destino.unidad_base)} de ${destino.nombre} `,
            h('span', { class: 'texto-suave' }, `(hay ${mostrarTexto(destino.stock_actual, destino)})`),
            ' y el nivel queda en Lleno.')
        : h('p', { class: 'nota nota--alerta' },
            'Falta definir cuántas unidades de chicha lleva un lote (Ajustes). Si sigues, solo se pone en Lleno y no se descuenta nada.'),
      btn
    ])));
  }

  // ---------- Por comprar ----------

  function vistaPorComprar(main) {
    const zona = h('div', null, esqueletoFilas(5));
    main.replaceChildren(
      volver('#hoy', 'Hoy'),
      h('h1', { class: 'titulo' }, 'Por comprar'),
      h('p', { class: 'texto-suave' }, 'Lo que está bajo el mínimo, las salsas en Poco o Vacío y lo que falta.'),
      zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => {
      estado.insumos = insumos;
      const pc = porComprar(insumos);
      const grupo = (titulo, items, nota) => items.length && grupoInsumos(titulo, items.map((i) => h('div', { class: 'fila' },
        h('span', { class: 'fila-etiqueta' }, i.nombre, h('span', { class: 'fila-nota' }, nota(i))))));
      const grupos = sinVacios([
        grupo('Bajo el mínimo', pc.bajos, (i) => `quedan ${mostrarTexto(i.stock_actual, i)} · mínimo ${mostrarTexto(i.stock_minimo, i)}`),
        grupo('Salsas por acabarse', pc.salsas, (i) => `está en ${capital(i.estado_actual)}`),
        grupo('Falta', pc.faltan, (i) => i.categoria)
      ]);
      zona.replaceChildren(grupos.length ? h('div', { class: 'grupos' }, grupos) : h('p', { class: 'vacio' }, 'No falta nada.'));
    });
  }

  // ---------- Inventario: gráfica de lo que hay ----------

  function vistaInventario(main) {
    const zona = h('div', null, esqueletoFilas(7));
    estado.zonaInventario = zona;
    main.replaceChildren(
      h('div', { class: 'titulo-fila' },
        h('h1', { class: 'titulo' }, 'Inventario'),
        h('button', { type: 'button', class: 'btn btn-secundario btn-chico', onclick: abrirNuevaCasilla }, '+ Nueva casilla')),
      zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => {
      estado.insumos = insumos;
      pintarInventario(zona);
    });
  }

  // Barras horizontales de las casillas de conteo, agrupadas por categoría y en orden alfabético.
  // Cada grupo tiene su propia escala, porque mezclar porciones con unidades no dice nada.
  function pintarInventario(zona) {
    const insumos = (estado.insumos || []).filter(esConteo);
    if (!insumos.length) {
      zona.replaceChildren(h('p', { class: 'vacio' }, 'Todavía no hay casillas. Crea la primera con “+ Nueva casilla”.'));
      return;
    }
    const lista = h('div', { class: 'grupos' }, agruparPorCategoria(insumos).map(({ categoria, items }) => {
      const max = Math.max(1, ...items.map((i) => Math.max(i.stock_actual, i.stock_minimo || 0)));
      const idTitulo = 'g-' + sinTildes(categoria).replace(/[^a-z0-9]+/g, '-');
      return h('section', { class: 'grupo', 'data-grupo': '', 'aria-labelledby': idTitulo },
        h('h2', { class: 'subtitulo', id: idTitulo }, categoria),
        h('ul', { class: 'grafica' }, items.map((i) => {
          const bajo = bajoMinimo(i) || negativo(i);
          const m = mostrar(i.stock_actual, i);
          return h('li', { class: 'grafica-fila' + (bajo ? ' grafica-fila--bajo' : ''), 'data-buscar': sinTildes(i.nombre) },
            h('span', { class: 'grafica-nombre' }, i.nombre),
            h('span', { class: 'grafica-pista', 'aria-hidden': 'true' },
              h('span', { class: 'grafica-barra', style: `width:${Math.max(0, (i.stock_actual / max) * 100)}%` }),
              i.stock_minimo > 0 && h('span', { class: 'grafica-minimo', style: `left:${(i.stock_minimo / max) * 100}%` })),
            h('span', { class: 'grafica-valor' },
              h('span', { class: 'grafica-num' },
                bajo && h('span', { class: 'punto', 'aria-hidden': 'true' }),
                h('strong', null, m.num),
                h('span', { class: 'valor-unidad' }, m.unidad)),
              bajo && h('span', { class: 'solo-lector' }, negativo(i) ? ', quedó en negativo' : `, bajo el mínimo de ${mostrarTexto(i.stock_minimo, i)}`)));
        })));
    }));
    zona.replaceChildren(
      buscador(lista, 'buscar-inventario'),
      lista,
      h('p', { class: 'pequeno texto-suave' }, 'Cada grupo usa su propia escala. La rayita roja marca el mínimo. Las salsas y los ingredientes que solo se marcan están en Hoy.'));
  }

  function abrirNuevaCasilla() {
    const categorias = [...new Set([...ORDEN_CATEGORIAS, ...(estado.insumos || []).map((i) => i.categoria)])].filter(Boolean);
    const nombre = h('input', { class: 'campo', id: 'nc-nombre', autocomplete: 'off', maxlength: 40, enterkeyhint: 'next' });
    const medicion = h('select', { class: 'campo', id: 'nc-medicion' },
      h('option', { value: 'conteo' }, 'Se cuenta (porciones o unidades)'),
      h('option', { value: 'nivel' }, 'Por nivel del pote (Lleno · Medio · Poco · Vacío)'),
      h('option', { value: 'marcar' }, 'Solo se marca si hay o si falta'));
    const tipo = h('select', { class: 'campo', id: 'nc-tipo' },
      h('option', { value: 'ingrediente' }, 'Ingrediente (va en los panes)'),
      h('option', { value: 'bebida' }, 'Bebida (se vende sola)'));
    const categoria = h('select', { class: 'campo', id: 'nc-categoria' }, categorias.map((c) => h('option', { value: c }, c)));
    const unidad = h('select', { class: 'campo', id: 'nc-unidad' },
      h('option', { value: 'porción' }, 'porciones'),
      h('option', { value: 'unidad' }, 'unidades'));
    const gramaje = h('input', { class: 'campo', id: 'nc-gramaje', autocomplete: 'off', maxlength: 40, placeholder: 'por ejemplo, 140 g' });
    const fStock = campoNumero({ etiqueta: 'cuánto hay', id: 'nc-stock' });
    const fMinimo = campoNumero({ etiqueta: 'el mínimo', id: 'nc-minimo' });
    const notaStock = h('span', { class: 'fila-nota' });
    const notaMinimo = h('span', { class: 'fila-nota' });

    const campo = (id, texto, el, nota) => h('div', { class: 'campo-grupo' },
      h('label', { class: 'etiqueta-campo', for: id }, texto, nota && ` · ${nota}`), el);
    const grupoTipo = campo('nc-tipo', 'Tipo', tipo);
    const grupoUnidad = campo('nc-unidad', 'Se cuenta en', unidad);
    const filaStock = h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'nc-stock' }, 'Cuánto hay ahora', notaStock), fStock.el);
    const filaMinimo = h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'nc-minimo' }, 'Mínimo', notaMinimo), fMinimo.el);

    // Tipo, unidad, cantidad y mínimo solo existen en las casillas que se cuentan.
    function actualizar(e) {
      const conteo = medicion.value === 'conteo';
      if (e && e.target === medicion && medicion.value === 'nivel') categoria.value = 'Salsas';
      if (!conteo) tipo.value = 'ingrediente';
      if (tipo.value === 'bebida') { unidad.value = 'unidad'; categoria.value = 'Bebidas'; }
      [grupoTipo, grupoUnidad, filaStock, filaMinimo].forEach((el) => { el.hidden = !conteo; });
      const en = 'en ' + unidadPlural(unidad.value);
      notaStock.textContent = en;
      notaMinimo.textContent = en + ' · avisa cuando baja de aquí';
    }
    [medicion, tipo, unidad].forEach((el) => el.addEventListener('change', actualizar));
    actualizar();

    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Crear casilla');
    async function crear(e) {
      e.preventDefault();
      const conteo = medicion.value === 'conteo';
      const stock = !conteo || fStock.valor == null ? 0 : fStock.valor;
      const minimo = !conteo || fMinimo.valor == null ? 0 : fMinimo.valor;
      if (!nombre.value.trim()) { aviso('Escribe el nombre de la casilla.'); nombre.focus(); return; }
      if (!Number.isFinite(stock) || stock < 0) { aviso('Revisa la cantidad: tiene que ser un número.'); fStock.input.focus(); return; }
      if (!Number.isFinite(minimo) || minimo < 0) { aviso('Revisa el mínimo: tiene que ser un número.'); fMinimo.input.focus(); return; }
      ocupado(btn, 'Creando…');
      try {
        const nuevo = await Api.crearInsumo({
          nombre: nombre.value.trim(), medicion: medicion.value, tipo: tipo.value, categoria: categoria.value,
          unidad_base: unidad.value, gramaje_ref: gramaje.value.trim(), stock_actual: stock, stock_minimo: minimo
        });
        estado.insumos = [...(estado.insumos || []), nuevo];
        Hoja.cerrar();
        if (estado.zonaInventario && estado.zonaInventario.isConnected) pintarInventario(estado.zonaInventario);
        else render();
        aviso(conteo ? `Casilla creada: ${nuevo.nombre}` : `Casilla creada: ${nuevo.nombre}. Se marca en Hoy.`);
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }

    Hoja.abrir(h('form', { class: 'formulario', novalidate: true, onsubmit: crear },
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, 'Nueva casilla'),
      campo('nc-nombre', 'Nombre', nombre),
      campo('nc-medicion', 'Cómo se mide', medicion),
      grupoTipo,
      campo('nc-categoria', 'Categoría', categoria),
      grupoUnidad,
      campo('nc-gramaje', 'Gramaje de referencia', gramaje, 'opcional, solo se muestra'),
      filaStock,
      filaMinimo,
      btn), { foco: nombre });
  }

  // ---------- Producción: lo que entra o se compra (suma al inventario) ----------

  function vistaProduccion(main) {
    const zona = h('div', null, esqueletoFilas(7));
    main.replaceChildren(
      volver('#hoy', 'Hoy'),
      h('h1', { class: 'titulo' }, 'Producción'),
      h('p', { class: 'texto-suave' }, 'Anota lo que entró, se compró o se produjo hoy. Se suma al inventario.'),
      zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => {
      estado.insumos = insumos;
      pintarProduccion(zona);
    });
  }

  function pintarProduccion(zona) {
    const insumos = (estado.insumos || []).filter(esConteo);
    if (!insumos.length) {
      zona.replaceChildren(h('p', { class: 'vacio' }, 'Todavía no hay casillas. Créalas en Inventario.'));
      return;
    }
    const campos = [];
    let k = 0;
    const lista = h('div', { class: 'grupos' }, agruparPorCategoria(insumos).map(({ categoria, items }) =>
      h('section', { class: 'grupo', 'data-grupo': '' },
        h('h2', { class: 'subtitulo' }, categoria),
        h('div', { class: 'lista-items' }, items.map((insumo) => {
          const id = `ent-${k++}`;
          const campo = campoNumero({ etiqueta: insumo.nombre, id });
          campos.push({ insumo, campo });
          return h('div', { class: 'fila', 'data-buscar': sinTildes(insumo.nombre) },
            h('label', { class: 'fila-etiqueta', for: id }, insumo.nombre,
              h('span', { class: 'fila-nota' }, `hay ${mostrarTexto(insumo.stock_actual, insumo)} · en ${unidadDeIngreso(insumo)}`)),
            campo.el);
        })))));

    const btn = h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar entradas');
    async function guardar() {
      const entradas = [];
      for (const { insumo, campo } of campos) {
        const v = campo.valor;
        if (v == null || v === 0) continue;
        if (!Number.isFinite(v) || v < 0) { aviso(`Revisa ${insumo.nombre}: tiene que ser un número.`); campo.input.focus(); return; }
        entradas.push({ insumo_id: insumo.id, cantidad: redondear(v) });
      }
      if (!entradas.length) { aviso('Escribe cuánto entró de al menos una casilla.'); return; }
      ocupado(btn, 'Guardando…');
      try {
        const r = await Api.registrarEntradas({ entradas });
        estado.insumos = r.insumos;
        pintarProduccion(zona);
        window.scrollTo(0, 0);
        aviso(r.guardadas === 1 ? 'Guardado: 1 casilla' : `Guardado: ${r.guardadas} casillas`);
      } catch (err) {
        // No se limpia nada: los números escritos siguen ahí.
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }

    zona.replaceChildren(buscador(lista, 'buscar-produccion'), lista, h('div', { class: 'pie-accion' }, btn));
  }

  // ---------- Ventas: panes y bebidas que salen (descuenta del inventario) ----------

  const GRUPOS_VENTA = [['cultos', 'Cultos'], ['criollos', 'Criollos'], ['papas', 'Papas y combos']];

  // Cultos, Criollos y Papas; lo que no tenga grupo conocido va en "Otros" para que nunca desaparezca.
  function agruparRecetas(recetas) {
    const conocidos = GRUPOS_VENTA.map(([clave]) => clave);
    return [...GRUPOS_VENTA, ['', 'Otros']]
      .map(([clave, titulo]) => ({
        titulo,
        items: recetas
          .filter((r) => (clave ? r.grupo === clave : !conocidos.includes(r.grupo)))
          .sort(porNombre)
      }))
      .filter((g) => g.items.length);
  }

  function vistaVentas(main) {
    const hoy = Api.hoyLima();
    if (!estado.fechaVentas || estado.fechaVentas > hoy) estado.fechaVentas = hoy;
    const fecha = estado.fechaVentas;
    const zona = h('div', null, esqueletoFilas(6));
    main.replaceChildren(
      volver('#hoy', 'Hoy'),
      h('h1', { class: 'titulo' }, 'Ventas'),
      ...selectorFecha(fecha, (f) => { estado.fechaVentas = f; render(); }),
      zona);
    cargarEn(zona, () => Api.cargarVentas(fecha), (datos) => pintarVentas(zona, datos));
  }

  function pastillaReceta(r) {
    if (!r.ingredientes.length) return h('span', { class: 'etiqueta-estado' }, 'Sin receta');
    if (r.estado === 'provisional') return h('span', { class: 'etiqueta-estado etiqueta-estado--suave' }, 'Provisional');
    return null;
  }

  function pintarVentas(zona, datos) {
    const insumos = {};
    datos.insumos.forEach((i) => { insumos[i.id] = i; });

    let k = 0;
    const productos = [];
    const crear = (tipo, item) => {
      const v = { tipo, item, sinReceta: tipo === 'receta' && !item.ingredientes.length,
        campo: campoNumero({ valor: item.vendidos || null, etiqueta: item.nombre, id: `ven-${k++}` }) };
      productos.push(v);
      return v;
    };
    const fila = (v) => h('div', { class: 'fila' },
      h('label', { class: 'fila-etiqueta', for: v.campo.input.id }, v.item.nombre, v.tipo === 'receta' && pastillaReceta(v.item)),
      v.campo.el);
    const grupo = (titulo, items) => items.length && h('section', { class: 'grupo' },
      h('h2', { class: 'subtitulo' }, titulo),
      h('div', { class: 'lista-items' }, items.map(fila)));

    const secciones = agruparRecetas(datos.panes).map(({ titulo, items }) =>
      grupo(titulo, items.map((p) => crear('receta', p))));
    // Si el backend no marca las bebidas (versión anterior publicada), se toman por su categoría.
    const listaBebidas = datos.bebidas.length
      ? datos.bebidas
      : datos.insumos.filter((i) => esConteo(i) && (i.tipo === 'bebida' || i.categoria === 'Bebidas')).map((i) => ({ ...i, vendidos: 0 }));
    const bebidas = grupo('Bebidas', [...listaBebidas].sort(porNombre).map((b) => crear('insumo', b)));

    // Lo que se va a descontar de cada casilla con las cantidades escritas.
    function calcular() {
      const descuentos = {};
      const sinReceta = [];
      for (const v of productos) {
        const n = v.campo.valor;
        if (n == null || n === 0) continue;
        if (!Number.isFinite(n) || n < 0) return { error: v };
        if (v.tipo === 'insumo') descuentos[v.item.id] = (descuentos[v.item.id] || 0) + n;
        else if (v.sinReceta) sinReceta.push(v.item.nombre);
        else v.item.ingredientes.forEach((ing) => { descuentos[ing.insumo_id] = (descuentos[ing.insumo_id] || 0) + ing.cantidad * n; });
      }
      return { descuentos, sinReceta };
    }

    function revisar() {
      const r = calcular();
      if (r.error) { aviso(`Revisa ${r.error.item.nombre}: tiene que ser un número.`); r.error.campo.input.focus(); return; }
      const ids = Object.keys(r.descuentos);
      if (!ids.length && !r.sinReceta.length && !datos.guardado) { aviso('Escribe cuánto se vendió de al menos un producto.'); return; }

      const btnConfirmar = h('button', { type: 'button', class: 'btn btn-primario', onclick: confirmar }, 'Confirmar ventas');
      async function confirmar() {
        const ventas = productos
          .filter((v) => Number.isFinite(v.campo.valor) && v.campo.valor > 0)
          .map((v) => ({ item_tipo: v.tipo, item_id: v.item.id, cantidad: v.campo.valor }));
        ocupado(btnConfirmar, 'Guardando…');
        try {
          const res = await Api.guardarVentas({ fecha: datos.fecha, ventas });
          estado.insumos = res.insumos;
          Hoja.cerrar();
          aviso(sinVacios([
            res.sinReceta.length ? `Guardado. Sin receta, no se descontó: ${res.sinReceta.join(', ')}.` : 'Ventas guardadas.',
            res.posteriores && 'Es un día pasado: los días siguientes pueden no cuadrar.'
          ]).join(' '));
          render();
        } catch (err) {
          aviso(mensajeError(err, MSJ_GUARDAR));
          libre(btnConfirmar);
        }
      }

      const filas = ids
        .map((id) => ({ i: insumos[id], n: redondear(r.descuentos[id]) }))
        .filter((x) => x.i)
        .sort((a, b) => porNombre(a.i, b.i))
        .map(({ i, n }) => {
          const m = mostrar(n, i);
          return h('div', { class: 'fila' },
            h('span', { class: 'fila-etiqueta' }, i.nombre),
            h('span', { class: 'valor' }, '−' + m.num, h('span', { class: 'valor-unidad' }, m.unidad)));
        });

      Hoja.abrir(h('div', { class: 'formulario' }, ...sinVacios([
        h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, 'Se va a descontar'),
        datos.guardado && h('p', { class: 'nota' }, 'Este día ya tenía ventas guardadas. Esto las reemplaza: no se descuenta dos veces.'),
        filas.length ? h('div', { class: 'lista-items' }, filas) : h('p', { class: 'vacio' }, 'No se descuenta nada.'),
        r.sinReceta.length && h('p', { class: 'nota nota--alerta' },
          `${r.sinReceta.join(', ')} no ${r.sinReceta.length === 1 ? 'tiene' : 'tienen'} receta: no se descuenta nada por eso. Anótala en Recetas.`),
        btnConfirmar
      ])));
    }

    zona.replaceChildren(...sinVacios([
      datos.guardado && h('p', { class: 'nota' }, 'Este día ya tiene ventas guardadas. Si cambias algo, se reemplaza.'),
      ...secciones,
      bebidas,
      !productos.length && h('p', { class: 'vacio' }, 'No hay productos. Créalos en Recetas.'),
      h('div', { class: 'pie-accion' }, h('button', { type: 'button', class: 'btn btn-primario', onclick: revisar }, 'Revisar descuento'))
    ]));
  }

  // ---------- Recetas: lo que lleva UN producto vendido ----------

  function vistaRecetas(main) {
    const zona = h('div', null, esqueletoFilas(5));
    main.replaceChildren(
      h('div', { class: 'titulo-fila' },
        h('h1', { class: 'titulo' }, 'Recetas'),
        h('button', { type: 'button', class: 'btn btn-secundario btn-chico', onclick: () => abrirNuevoPan(zona) }, '+ Nuevo pan')),
      h('p', { class: 'texto-suave' }, 'Lo que lleva cada producto. Al registrar una venta, se descuenta esto del inventario.'),
      zona);
    cargarEn(zona, Api.cargarRecetas, (datos) => pintarRecetas(zona, datos));
  }

  function pintarRecetas(zona, datos) {
    const insumos = {};
    datos.insumos.forEach((i) => { insumos[i.id] = i; });
    const grupos = agruparRecetas(datos.recetas);
    if (!grupos.length) {
      zona.replaceChildren(h('p', { class: 'vacio' }, 'Todavía no hay recetas. Crea la primera con “+ Nuevo pan”.'));
      return;
    }
    zona.replaceChildren(...grupos.map(({ titulo, items: recetas }) => {
      return h('section', { class: 'grupo' },
        h('h2', { class: 'subtitulo' }, titulo),
        h('div', { class: 'lista' }, recetas.map((r) => {
          const resumen = r.ingredientes
            .map((ing) => insumos[ing.insumo_id] && `${insumos[ing.insumo_id].nombre} ${cantidadTexto(ing.cantidad, insumos[ing.insumo_id].unidad_base)}`)
            .filter(Boolean).join(' · ');
          return h('button', { type: 'button', class: 'lista-fila', onclick: () => abrirReceta(r, datos, zona) },
            h('span', { class: 'lista-texto' },
              h('strong', null, r.nombre),
              pastillaReceta(r),
              resumen && h('span', { class: 'pequeno texto-suave' }, resumen)),
            h('span', { html: CHEVRON }));
        })));
    }));
  }

  function abrirNuevoPan(zona) {
    const nombre = h('input', { class: 'campo', id: 'np-nombre', autocomplete: 'off', maxlength: 40, enterkeyhint: 'done' });
    const grupo = h('select', { class: 'campo', id: 'np-grupo' }, GRUPOS_VENTA.map(([v, t]) => h('option', { value: v }, t)));
    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Crear');
    async function crear(e) {
      e.preventDefault();
      if (!nombre.value.trim()) { aviso('Escribe el nombre.'); nombre.focus(); return; }
      ocupado(btn, 'Creando…');
      try {
        const datos = await Api.crearReceta({ nombre: nombre.value.trim(), grupo: grupo.value });
        if (zona.isConnected) pintarRecetas(zona, datos);
        abrirReceta(datos.recetas.find((r) => r.id === datos.id), datos, zona);
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }
    Hoja.abrir(h('form', { class: 'formulario', novalidate: true, onsubmit: crear },
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, 'Nuevo producto'),
      h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'np-nombre' }, 'Nombre'), nombre),
      h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'np-grupo' }, 'Grupo'), grupo),
      btn), { foco: nombre });
  }

  function abrirReceta(receta, datos, zona) {
    // Solo lo que se cuenta (incluye bebidas: un combo puede llevar una). Salsas e ingredientes no se descuentan.
    const insumos = datos.insumos.filter(esConteo);
    const grupos = agruparPorCategoria([...insumos]);
    const lista = h('div', { class: 'lista-items' });
    const filas = [];
    let contador = 0;

    // Las cantidades se escriben en la unidad de la casilla (porciones o unidades); acepta medias (0.5 palta).
    function agregar(ing) {
      const k = contador++;
      const select = h('select', { class: 'campo', id: `ing-${k}`, 'aria-label': 'Ingrediente' },
        h('option', { value: '' }, 'Elige un ingrediente…'),
        grupos.map(({ categoria, items }) => h('optgroup', { label: categoria }, items.map((i) => h('option', { value: i.id }, i.nombre)))));
      select.value = ing ? ing.insumo_id : '';
      const campo = campoNumero({ valor: ing ? ing.cantidad : null, etiqueta: 'la cantidad', id: `ing-c-${k}`, paso: 0.5 });
      const unidad = h('label', { class: 'fila-nota', for: `ing-c-${k}` });
      const pintarUnidad = () => {
        const i = insumos.find((x) => x.id === select.value);
        if (!i) { unidad.textContent = ''; return; }
        const base = unidadPlural(i.unidad_base) + ' por cada uno';
        unidad.textContent = i.gramaje_ref ? `${base} · ${i.gramaje_ref}` : base;
      };
      select.addEventListener('change', pintarUnidad);
      pintarUnidad();
      const fila = { select, campo };
      const bloque = h('div', { class: 'ing-bloque' },
        select,
        h('div', { class: 'ing-fila' },
          h('div', { class: 'ing-cantidad' }, campo.el, unidad),
          h('button', {
            type: 'button', class: 'btn btn-secundario btn-chico', 'aria-label': 'Quitar ingrediente',
            onclick: () => { filas.splice(filas.indexOf(fila), 1); bloque.remove(); }
          }, 'Quitar')));
      filas.push(fila);
      lista.append(bloque);
      return select;
    }

    receta.ingredientes.forEach((ing) => agregar(ing));

    const btnGuardar = h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar receta');
    async function guardar() {
      const ingredientes = [];
      for (const { select, campo } of filas) {
        if (!select.value) { aviso('Elige el ingrediente o quita esa fila.'); select.focus(); return; }
        if (!(campo.valor > 0)) { aviso('Cada ingrediente necesita una cantidad mayor que 0.'); campo.input.focus(); return; }
        ingredientes.push({ insumo_id: select.value, cantidad: campo.valor });
      }
      ocupado(btnGuardar, 'Guardando…');
      try {
        const nuevos = await Api.guardarReceta({ id: receta.id, ingredientes });
        Hoja.cerrar();
        if (zona.isConnected) pintarRecetas(zona, nuevos);
        aviso(`Receta guardada: ${receta.nombre}`);
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btnGuardar);
      }
    }

    Hoja.abrir(h('div', { class: 'formulario' }, ...sinVacios([
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, receta.nombre),
      receta.estado === 'provisional' && h('p', { class: 'nota' }, 'Receta provisional: descuenta normal, pero falta confirmarla con cocina.'),
      h('p', { class: 'texto-suave' }, 'Lo que lleva uno. Se descuenta del inventario por cada uno vendido.'),
      insumos.length ? lista : h('p', { class: 'vacio' }, 'Primero crea los ingredientes en Inventario.'),
      insumos.length && h('button', { type: 'button', class: 'btn btn-secundario btn-ancho', onclick: () => agregar(null).focus() }, '+ Agregar ingrediente'),
      btnGuardar
    ])));
  }

  // ---------- Más ----------

  function filaLista(href, titulo, ayuda) {
    return h('a', { class: 'lista-fila', href },
      h('span', { class: 'lista-texto' }, h('strong', null, titulo), h('span', { class: 'pequeno texto-suave' }, ayuda)),
      h('span', { html: CHEVRON }));
  }

  function vistaMas(main) {
    main.replaceChildren(
      h('h1', { class: 'titulo' }, 'Más'),
      h('nav', { class: 'lista', 'aria-label': 'Más opciones' },
        filaLista('#mas/revision', 'Revisión inicial', 'Marca cómo está todo y anota lo que hay, de una vez'),
        filaLista('#mas/movimientos', 'Movimientos', 'Historial de entradas, ventas, ajustes, niveles y marcas'),
        filaLista('#mas/ajustes', 'Ajustes', 'Mínimos, contar una casilla, lotes y forma de medir')),
      h('div', { class: 'lista' },
        h('button', {
          type: 'button', class: 'lista-fila',
          onclick: () => { Api.sesion.olvidarPin(); mostrarIngreso(); }
        },
          h('span', { class: 'lista-texto' },
            h('strong', null, 'Cambiar de usuario'),
            h('span', { class: 'pequeno texto-suave' }, `Registrando como ${Api.sesion.usuario}`)))));
  }

  // Selector de casilla agrupado por categoría.
  function selectCasilla(id, insumos, vacioTexto) {
    return h('select', { class: 'campo', id },
      h('option', { value: '' }, vacioTexto),
      agruparPorCategoria([...insumos]).map(({ categoria, items }) =>
        h('optgroup', { label: categoria }, items.map((i) => h('option', { value: i.id }, i.nombre)))));
  }
  const campoConEtiqueta = (id, texto, el) => h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: id }, texto), el);

  // ---------- Movimientos: historial ----------

  const TIPOS_MOV = [['entrada', 'Entrada'], ['venta', 'Venta'], ['merma', 'Merma'], ['salida', 'Salida'],
    ['ajuste', 'Ajuste'], ['nivel', 'Nivel'], ['marca', 'Marca']];
  const filtroMov = { fecha: null, insumo_id: '', tipo: '', todo: false };

  // Un día a la vez (solo se leen las filas de ese día) o todo el historial de una casilla.
  function vistaMovimientos(main) {
    const hoy = Api.hoyLima();
    if (!filtroMov.fecha || filtroMov.fecha > hoy) filtroMov.fecha = hoy;
    if (!filtroMov.insumo_id) filtroMov.todo = false;
    const f = { ...filtroMov };
    const zona = h('div', null, esqueletoFilas(6));
    main.replaceChildren(
      volver('#mas', 'Más'),
      h('h1', { class: 'titulo' }, 'Movimientos'),
      ...(f.todo ? [] : selectorFecha(f.fecha, (x) => { filtroMov.fecha = x; render(); })),
      zona);
    cargarEn(zona, () => Api.cargarMovimientos(f.todo ? { insumo_id: f.insumo_id } : { fecha: f.fecha }),
      (datos) => pintarMovimientos(zona, datos));
  }

  function pintarMovimientos(zona, datos) {
    const casilla = selectCasilla('mov-casilla', datos.insumos, 'Todas las casillas');
    casilla.value = filtroMov.insumo_id;
    const tipo = h('select', { class: 'campo', id: 'mov-tipo' },
      h('option', { value: '' }, 'Todos los tipos'), TIPOS_MOV.map(([v, t]) => h('option', { value: v }, t)));
    tipo.value = filtroMov.tipo;
    const lista = h('div');
    const historial = h('button', {
      type: 'button', class: 'btn btn-secundario btn-chico',
      onclick: () => { filtroMov.todo = !filtroMov.todo; render(); }
    }, filtroMov.todo ? 'Ver un solo día' : 'Ver todo su historial');

    const valor = (m) => {
      if (m.tipo === 'nivel' || m.tipo === 'marca') return capital(String(m.nota || ''));
      const c = cantidad(Math.abs(m.cantidad), m.unidad_base);
      return `${m.cantidad < 0 ? '−' : '+'}${c.num} ${c.unidad}`;
    };
    const fila = (m) => {
      const detalle = sinVacios([
        filtroMov.todo && m.fecha.split('-').reverse().join('/'),
        m.hora,
        m.usuario,
        (TIPOS_MOV.find(([v]) => v === m.tipo) || [m.tipo, m.tipo])[1],
        m.tipo !== 'nivel' && m.tipo !== 'marca' && m.nota
      ]).join(' · ');
      return h('div', { class: 'fila' },
        h('span', { class: 'fila-etiqueta' }, m.nombre, h('span', { class: 'fila-nota' }, detalle)),
        h('span', { class: 'mov-valor' + (m.cantidad < 0 ? ' mov-valor--resta' : '') }, valor(m)));
    };

    function pintar() {
      filtroMov.insumo_id = casilla.value;
      filtroMov.tipo = tipo.value;
      historial.hidden = !casilla.value;
      const movs = datos.movimientos.filter((m) =>
        (!casilla.value || m.insumo_id === casilla.value) && (!tipo.value || m.tipo === tipo.value));
      lista.replaceChildren(...sinVacios([
        movs.length
          ? h('div', { class: 'lista-items' }, movs.map(fila))
          : h('p', { class: 'vacio' }, datos.movimientos.length ? 'Nada con esos filtros.' : 'No hay movimientos ese día.'),
        datos.total > datos.movimientos.length &&
          h('p', { class: 'pequeno texto-suave' }, `Se muestran los ${datos.movimientos.length} más recientes de ${datos.total}.`)
      ]));
    }
    casilla.addEventListener('change', () => {
      // En "todo su historial" la lista viene del servidor para esa casilla: hay que volver a pedirla.
      if (filtroMov.todo) { filtroMov.insumo_id = casilla.value; render(); return; }
      pintar();
    });
    tipo.addEventListener('change', pintar);
    pintar();

    zona.replaceChildren(h('div', { class: 'formulario' },
      campoConEtiqueta('mov-casilla', 'Casilla', casilla),
      campoConEtiqueta('mov-tipo', 'Tipo', tipo),
      historial,
      lista));
  }

  // ---------- Ajustes ----------

  function vistaAjustes(main) {
    const zona = h('div', null, esqueletoFilas(6));
    main.replaceChildren(volver('#mas', 'Más'), h('h1', { class: 'titulo' }, 'Ajustes'), zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => {
      estado.insumos = insumos;
      pintarAjustes(zona, insumos);
    });
  }

  // Cada bloque guarda por su cuenta y después recarga la pantalla con los datos nuevos.
  async function guardarAjuste(btn, pedir, mensaje) {
    ocupado(btn, 'Guardando…');
    try {
      const r = await pedir();
      aviso(mensaje(r));
      render();
    } catch (err) {
      aviso(mensajeError(err, MSJ_GUARDAR));
      libre(btn);
    }
  }

  function pintarAjustes(zona, insumos) {
    const conteo = insumos.filter(esConteo);
    const porId = {};
    insumos.forEach((i) => { porId[i.id] = i; });
    const bloque = (titulo, ayuda, ...hijos) => h('section', { class: 'formulario bloque-ajuste' },
      h('h2', { class: 'subtitulo subtitulo--seccion' }, titulo),
      ayuda && h('p', { class: 'texto-suave' }, ayuda),
      ...hijos);

    // Contar una casilla: ajuste de stock contado.
    const selConteo = selectCasilla('aj-casilla', conteo, 'Elige una casilla…');
    const notaConteo = h('p', { class: 'pequeno texto-suave' });
    const fContado = campoNumero({ etiqueta: 'lo contado', id: 'aj-contado' });
    const motivo = h('input', { class: 'campo', id: 'aj-motivo', autocomplete: 'off', maxlength: 200, placeholder: 'por ejemplo, conteo del cierre' });
    const pintarConteo = () => {
      const i = porId[selConteo.value];
      notaConteo.textContent = i ? `El sistema dice ${mostrarTexto(i.stock_actual, i)} · escribe lo que hay de verdad, en ${unidadDeIngreso(i)}.` : '';
    };
    selConteo.addEventListener('change', pintarConteo);
    const btnConteo = h('button', { type: 'button', class: 'btn btn-primario' }, 'Guardar ajuste');
    btnConteo.addEventListener('click', () => {
      const i = porId[selConteo.value];
      const v = fContado.valor;
      if (!i) { aviso('Elige la casilla que contaste.'); selConteo.focus(); return; }
      if (v == null || !Number.isFinite(v) || v < 0) { aviso('Escribe lo que contaste.'); fContado.input.focus(); return; }
      guardarAjuste(btnConteo, () => Api.ajustarStock({ insumo_id: i.id, cantidad: v, nota: motivo.value.trim() }), (r) =>
        r.diferencia
          ? `${i.nombre}: ${r.diferencia > 0 ? '+' : '−'}${cantidadTexto(Math.abs(r.diferencia), i.unidad_base)}`
          : `${i.nombre}: ya estaba en ${mostrarTexto(v, i)}`);
    });

    // Mínimos: solo se mandan los que cambiaron.
    const camposMinimo = [];
    let k = 0;
    const minimos = agruparPorCategoria(conteo).map(({ categoria, items }) => grupoInsumos(categoria, items.map((i) => {
      const id = `aj-min-${k++}`;
      const campo = campoNumero({ valor: i.stock_minimo || null, etiqueta: `el mínimo de ${i.nombre}`, id });
      camposMinimo.push({ i, campo });
      return h('div', { class: 'fila' },
        h('label', { class: 'fila-etiqueta', for: id }, i.nombre,
          h('span', { class: 'fila-nota' }, `hay ${mostrarTexto(i.stock_actual, i)} · en ${unidadDeIngreso(i)}`)),
        campo.el);
    })));
    const btnMinimos = h('button', { type: 'button', class: 'btn btn-primario' }, 'Guardar mínimos');
    btnMinimos.addEventListener('click', () => {
      const cambios = [];
      for (const { i, campo } of camposMinimo) {
        const v = campo.valor;
        if (v != null && (!Number.isFinite(v) || v < 0)) { aviso(`Revisa ${i.nombre}: tiene que ser un número.`); campo.input.focus(); return; }
        if ((v || 0) !== (i.stock_minimo || 0)) cambios.push({ insumo_id: i.id, minimo: v || 0 });
      }
      if (!cambios.length) { aviso('No cambiaste ningún mínimo.'); return; }
      guardarAjuste(btnMinimos, () => Api.guardarMinimos({ minimos: cambios }), (r) =>
        r.guardados === 1 ? 'Mínimo guardado' : `${r.guardados} mínimos guardados`);
    });

    // Lotes (Glaseado Bravo → chicha).
    const lotes = insumos.filter((i) => i.lote_insumo_id && porId[i.lote_insumo_id]).sort(porNombre).map((i) => {
      const destino = porId[i.lote_insumo_id];
      const id = `aj-lote-${i.id}`;
      const campo = campoNumero({ valor: i.lote_cantidad || null, etiqueta: `las unidades de ${destino.nombre} por lote`, id });
      const btn = h('button', { type: 'button', class: 'btn btn-secundario btn-ancho' }, `Guardar lote de ${i.nombre}`);
      btn.addEventListener('click', () => {
        const v = campo.valor;
        if (v != null && (!Number.isFinite(v) || v < 0)) { aviso('Revisa las unidades: tiene que ser un número.'); campo.input.focus(); return; }
        guardarAjuste(btn, () => Api.guardarLote({ insumo_id: i.id, lote_cantidad: v || 0 }), () =>
          v > 0 ? `Cada lote de ${i.nombre} descuenta ${cantidadTexto(v, destino.unidad_base)} de ${destino.nombre}` : `${i.nombre}: el lote no descuenta nada`);
      });
      return h('div', { class: 'formulario' },
        h('div', { class: 'fila' },
          h('label', { class: 'fila-etiqueta', for: id }, `${i.nombre}: ${destino.nombre} por lote`,
            h('span', { class: 'fila-nota' }, `en ${unidadDeIngreso(destino)} · vacío = no descuenta`)),
          campo.el),
        btn);
    });

    // Forma de medir.
    const FORMAS = [['conteo|porción', 'Se cuenta en porciones'], ['conteo|unidad', 'Se cuenta en unidades'],
      ['nivel|', 'Por nivel del pote (salsas)'], ['marcar|', 'Solo hay o falta']];
    const formaDe = (i) => `${i.medicion}|${i.medicion === 'conteo' ? i.unidad_base : ''}`;
    const selMedir = selectCasilla('aj-medir', insumos, 'Elige una casilla…');
    const forma = h('select', { class: 'campo', id: 'aj-forma' }, FORMAS.map(([v, t]) => h('option', { value: v }, t)));
    const notaForma = h('p', { class: 'pequeno texto-suave' });
    const pintarForma = () => {
      const i = porId[selMedir.value];
      forma.disabled = !i;
      if (i) forma.value = formaDe(i);
      notaForma.textContent = i ? `Ahora: ${(FORMAS.find(([v]) => v === formaDe(i)) || ['', i.medicion])[1].toLowerCase()}.` : '';
    };
    selMedir.addEventListener('change', pintarForma);
    pintarForma();
    const btnForma = h('button', { type: 'button', class: 'btn btn-primario' }, 'Cambiar forma de medir');
    btnForma.addEventListener('click', () => {
      const i = porId[selMedir.value];
      if (!i) { aviso('Elige la casilla.'); selMedir.focus(); return; }
      if (forma.value === formaDe(i)) { aviso('Ya se mide así.'); return; }
      const [medicion, unidad] = forma.value.split('|');
      guardarAjuste(btnForma, () => Api.cambiarMedicion({ insumo_id: i.id, medicion, unidad_base: unidad }), () =>
        medicion === 'conteo' && i.medicion !== 'conteo'
          ? `${i.nombre} ahora se cuenta. Anota cuánto hay en "Contar una casilla".`
          : `${i.nombre}: forma de medir cambiada`);
    });

    zona.replaceChildren(h('div', { class: 'grupos' }, ...sinVacios([
      bloque('Contar una casilla', 'Si lo que hay no coincide con el sistema, escribe lo contado: entra la diferencia como ajuste.',
        campoConEtiqueta('aj-casilla', 'Casilla', selConteo), notaConteo,
        h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'aj-contado' }, 'Hay contado'), fContado.el),
        campoConEtiqueta('aj-motivo', 'Motivo (opcional)', motivo),
        btnConteo),
      bloque('Mínimos', 'Avisa cuando algo baja de aquí. Vacío = sin mínimo.', ...minimos, btnMinimos),
      lotes.length && bloque('Lotes', 'Lo que se descuenta al tocar “Hice un lote”.', ...lotes),
      bloque('Forma de medir', 'Lo que va en una receta, se vende o se descuenta con un lote tiene que seguir contándose.',
        campoConEtiqueta('aj-medir', 'Casilla', selMedir), notaForma,
        campoConEtiqueta('aj-forma', 'Se mide', forma),
        btnForma)
    ])));
  }

  // ---------- Revisión inicial: todo en una sola lista ----------

  function vistaRevision(main) {
    const zona = h('div', null, esqueletoFilas(7));
    main.replaceChildren(
      volver('#mas', 'Más'),
      h('h1', { class: 'titulo' }, 'Revisión inicial'),
      h('p', { class: 'texto-suave' }, 'Marca cómo están de verdad las salsas y los ingredientes, y escribe lo que hay de lo que se cuenta. Lo que dejes vacío no cambia.'),
      zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => {
      estado.insumos = insumos;
      pintarRevision(zona, insumos);
    });
  }

  function pintarRevision(zona, insumos) {
    const elegidos = new Map(); // insumo_id → estado nuevo (solo los que cambian)
    const conEstado = (item) => {
      const selector = selectorEstado(item, item.estado_actual, (v) => {
        selector.marcar(v);
        if (v === item.estado_actual) elegidos.delete(item.id);
        else elegidos.set(item.id, v);
      });
      return filaConEstado(item, selector);
    };
    const campos = [];
    let k = 0;
    const conCantidad = (item) => {
      const id = `rev-${k++}`;
      const campo = campoNumero({ etiqueta: item.nombre, id });
      campos.push({ item, campo });
      return h('div', { class: 'fila', 'data-buscar': sinTildes(item.nombre) },
        h('label', { class: 'fila-etiqueta', for: id }, item.nombre,
          h('span', { class: 'fila-nota' }, `ahora ${mostrarTexto(item.stock_actual, item)} · en ${unidadDeIngreso(item)}`)),
        campo.el);
    };

    const salsas = insumos.filter((i) => i.medicion === 'nivel').sort(porNombre);
    const marcar = agruparPorCategoria(insumos.filter((i) => i.medicion === 'marcar'));
    const conteo = agruparPorCategoria(insumos.filter(esConteo));
    const lista = h('div', { class: 'grupos' }, ...sinVacios([
      salsas.length && grupoInsumos('Salsas', salsas.map(conEstado)),
      ...marcar.map(({ categoria, items }) => grupoInsumos(categoria, items.map(conEstado))),
      conteo.length && h('h2', { class: 'subtitulo subtitulo--seccion' }, 'Cuánto hay'),
      ...conteo.map(({ categoria, items }) => grupoInsumos(categoria, items.map(conCantidad)))
    ]));

    const btn = h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar revisión');
    async function guardar() {
      const conteos = [];
      for (const { item, campo } of campos) {
        const v = campo.valor;
        if (v == null) continue;
        if (!Number.isFinite(v) || v < 0) { aviso(`Revisa ${item.nombre}: tiene que ser un número.`); campo.input.focus(); return; }
        conteos.push({ insumo_id: item.id, cantidad: redondear(v) });
      }
      const estados = [...elegidos].map(([insumo_id, v]) => ({ insumo_id, estado: v }));
      if (!conteos.length && !estados.length) { aviso('No cambiaste nada.'); return; }
      ocupado(btn, 'Guardando…');
      try {
        const r = await Api.guardarRevision({ conteos, estados });
        estado.insumos = r.insumos;
        const cambios = r.ajustes + r.estados;
        aviso(cambios ? `Revisión guardada: ${cambios} ${cambios === 1 ? 'cambio' : 'cambios'}` : 'Revisión guardada: todo estaba igual');
        location.hash = '#hoy';
      } catch (err) {
        // No se limpia nada: lo marcado y lo escrito sigue ahí.
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }

    zona.replaceChildren(buscador(lista, 'buscar-revision'), lista, h('div', { class: 'pie-accion' }, btn));
  }

  // ---------- menú del botón + ----------

  function abrirMenuRegistrar() {
    const opcion = (texto, ayuda, fn) => h('button', { type: 'button', class: 'menu-op', onclick: fn },
      h('span', { class: 'menu-op-texto' }, texto),
      h('span', { class: 'menu-op-ayuda' }, ayuda));
    const ir = (hash) => () => { Hoja.cerrar(); location.hash = hash; };

    Hoja.abrir(h('div', null,
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, 'Registrar'),
      h('div', { class: 'menu' },
        opcion('Lo que entró', 'Producción y compras: suma al inventario', ir('#produccion')),
        opcion('Ventas del día', 'Panes y bebidas: descuenta del inventario', ir('#ventas')),
        opcion('Nueva casilla', 'Agregar algo nuevo al inventario', abrirNuevaCasilla))));
  }

  // ---------- ingreso: nombre y PIN ----------

  function mostrarIngreso() {
    Hoja.cerrar();
    const pantalla = document.getElementById('ingreso');
    const nombre = h('input', { class: 'campo', id: 'ing-nombre', autocomplete: 'name', maxlength: 40, enterkeyhint: 'next' });
    nombre.value = Api.sesion.usuario;
    const pin = h('input', { class: 'campo', id: 'ing-pin', type: 'password', inputmode: 'numeric', autocomplete: 'current-password', maxlength: 12, enterkeyhint: 'go' });
    const error = h('p', { class: 'ingreso-error', role: 'alert' });
    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Entrar');

    async function entrar(e) {
      e.preventDefault();
      const usuario = nombre.value.trim();
      const clave = pin.value.trim();
      if (!usuario) { error.textContent = 'Escribe tu nombre.'; nombre.focus(); return; }
      if (!clave) { error.textContent = 'Escribe el PIN del equipo.'; pin.focus(); return; }
      error.textContent = '';
      Api.sesion.guardar(usuario, clave);
      ocupado(btn, 'Entrando…');
      try {
        await Api.verificarPin();
        pantalla.hidden = true;
        document.getElementById('app').inert = false;
        render();
      } catch (err) {
        if (err && err.codigo === 'pin') {
          Api.sesion.olvidarPin();
          error.textContent = 'PIN incorrecto. Pregunta al equipo cuál es.';
          pin.select();
        } else {
          error.textContent = (err && err.codigo !== 'red' && err.message) || 'No se pudo conectar. Revisa tu conexión y vuelve a intentar.';
        }
      } finally {
        libre(btn);
      }
    }

    pantalla.replaceChildren(h('div', { class: 'ingreso-caja' },
      h('p', { class: 'logo' }, 'santo'),
      h('h1', { class: 'titulo' }, 'Hola'),
      h('p', { class: 'texto-suave' }, 'Escribe tu nombre y el PIN del equipo. Quedan guardados en este celular.'),
      h('form', { class: 'ingreso-form', novalidate: true, onsubmit: entrar },
        h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'ing-nombre' }, 'Tu nombre'), nombre),
        h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'ing-pin' }, 'PIN'), pin),
        error,
        btn)));
    pantalla.hidden = false;
    document.getElementById('app').inert = true;
    (nombre.value ? pin : nombre).focus();
  }

  // ---------- navegación ----------

  const RUTAS = {
    hoy: vistaInicio,
    'por-comprar': vistaPorComprar,
    inventario: vistaInventario,
    produccion: vistaProduccion,
    ventas: vistaVentas,
    recetas: vistaRecetas,
    mas: vistaMas,
    'mas/revision': vistaRevision,
    'mas/movimientos': vistaMovimientos,
    'mas/ajustes': vistaAjustes
  };

  function rutaActual() {
    const r = location.hash.replace(/^#\/?/, '');
    return RUTAS[r] ? r : 'hoy';
  }

  function render() {
    estado.vistaId++;
    const ruta = rutaActual();
    // Producción, Ventas y Por comprar se abren desde Hoy, así que la barra marca Hoy.
    const seccion = { produccion: 'hoy', ventas: 'hoy', 'por-comprar': 'hoy' }[ruta] || ruta.split('/')[0];
    document.querySelectorAll('.nav-item[data-ruta]').forEach((a) => {
      const activo = a.dataset.ruta === seccion;
      a.classList.toggle('activo', activo);
      if (activo) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    RUTAS[ruta](document.getElementById('vista'));
  }

  function init() {
    document.getElementById('modo-demo').hidden = !Api.modoDemo();
    document.getElementById('btn-registrar').addEventListener('click', abrirMenuRegistrar);
    document.getElementById('hoja-tirador').addEventListener('click', () => Hoja.cerrar());
    document.getElementById('capa').addEventListener('click', () => Hoja.cerrar());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') Hoja.cerrar(); });
    window.addEventListener('hashchange', () => {
      Hoja.cerrar();
      window.scrollTo(0, 0);
      render();
    });

    if (Api.sesion.lista) render();
    else mostrarIngreso();
  }

  init();
})();
