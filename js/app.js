/* SANTO — navegación y vistas */
(function () {
  'use strict';

  const MSJ_GUARDAR = 'No se pudo guardar. Revisa tu conexión y vuelve a intentar.';
  const MSJ_CARGAR = 'No se pudo cargar. Revisa tu conexión y vuelve a intentar.';
  const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  const estado = {
    vistaId: 0,          // cambia en cada render; las cargas que llegan tarde se ignoran
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

  // ---------- casillas: porciones, grupos y buscador ----------

  // Cómo se muestra lo que hay de una casilla. Si tiene porcion_g, en porciones (y los gramos aparte).
  function mostrar(n, item) {
    if (item.porcion_g > 0) {
      const porc = (Number(n) || 0) / item.porcion_g;
      return { num: nf.format(Math.round(porc * 10) / 10), unidad: 'porc.', detalle: cantidadTexto(n, 'g') };
    }
    return { ...cantidad(n, item.unidad_base), detalle: '' };
  }
  function mostrarTexto(n, item) {
    const m = mostrar(n, item);
    return `${m.num} ${m.unidad}`;
  }
  // Unidad en la que se escribe una cantidad para esta casilla (porciones si tiene porcion_g).
  function unidadDeIngreso(item) {
    return item.porcion_g > 0 ? 'porciones' : unidadPlural(item.unidad_base);
  }
  const factorIngreso = (item) => (item.porcion_g > 0 ? item.porcion_g : 1);

  const ORDEN_CATEGORIAS = ['Proteínas', 'Salsas', 'Complementos', 'Panes', 'Verduras', 'Lácteos', 'Fiambres',
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

  const sinTildes = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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

  const bajoMinimo = (i) => i.stock_minimo > 0 && i.stock_actual < i.stock_minimo;
  const negativo = (i) => i.stock_actual < 0;

  function vistaInicio(main) {
    const menu = h('nav', { class: 'pills', 'aria-label': 'Menú principal' }, MENU.map((op) => pildoraMenu(op)));
    const alertas = h('div');
    main.replaceChildren(
      h('h1', { class: 'titulo' }, 'Hoy'),
      h('p', { class: 'fecha-larga' }, fechaLarga(Api.hoyLima())),
      menu,
      alertas);

    cargarEn(alertas, Api.cargarInventario, ({ insumos }) => {
      estado.insumos = insumos;
      const bajos = insumos.filter((i) => bajoMinimo(i) && !negativo(i)).sort(porNombre);
      const revisar = insumos.filter(negativo).sort(porNombre);
      const pendientes = bajos.length + revisar.length;
      menu.replaceChildren(...MENU.map((op) => pildoraMenu(op, op.id === 'inventario' && pendientes
        ? (revisar.length ? `${pendientes} por revisar` : `${pendientes} por comprar`) : null)));

      const fila = (i, texto) => h('li', null, h('a', { class: 'alerta-fila', href: '#produccion' },
        h('span', { class: 'punto', 'aria-hidden': 'true' }), h('span', null, texto)));
      const items = [
        ...revisar.map((i) => fila(i, ['Revisar ', h('strong', null, i.nombre),
          `: quedó en ${mostrarTexto(i.stock_actual, i)} · falta anotar lo que entró`])),
        ...bajos.map((i) => fila(i, ['Comprar ', h('strong', null, i.nombre),
          `: quedan ${mostrarTexto(i.stock_actual, i)} · mínimo ${mostrarTexto(i.stock_minimo, i)}`]))
      ];
      alertas.replaceChildren(items.length
        ? h('section', { class: 'alertas', 'aria-labelledby': 'alertas-titulo' },
            h('h2', { class: 'subtitulo', id: 'alertas-titulo' }, 'Lo que falta hacer'),
            h('ul', null, items))
        : h('p', { class: 'nota' }, 'Todo está sobre el mínimo.'));
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

  // Barras horizontales agrupadas por categoría, en orden alfabético. Cada grupo tiene su propia escala,
  // porque mezclar gramos con unidades en una misma escala no dice nada.
  function pintarInventario(zona) {
    const insumos = estado.insumos || [];
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
              m.detalle && h('span', { class: 'grafica-detalle' }, m.detalle),
              bajo && h('span', { class: 'solo-lector' }, negativo(i) ? ', quedó en negativo' : `, bajo el mínimo de ${mostrarTexto(i.stock_minimo, i)}`)));
        })));
    }));
    zona.replaceChildren(
      buscador(lista, 'buscar-inventario'),
      lista,
      h('p', { class: 'pequeno texto-suave' }, 'Cada grupo usa su propia escala. La rayita roja marca el mínimo.'));
  }

  function abrirNuevaCasilla() {
    const categorias = [...new Set([...ORDEN_CATEGORIAS, ...(estado.insumos || []).map((i) => i.categoria)])].filter(Boolean);
    const nombre = h('input', { class: 'campo', id: 'nc-nombre', autocomplete: 'off', maxlength: 40, enterkeyhint: 'next' });
    const tipo = h('select', { class: 'campo', id: 'nc-tipo' },
      h('option', { value: 'ingrediente' }, 'Ingrediente (va en los panes)'),
      h('option', { value: 'bebida' }, 'Bebida (se vende sola)'));
    const categoria = h('select', { class: 'campo', id: 'nc-categoria' }, categorias.map((c) => h('option', { value: c }, c)));
    const unidad = h('select', { class: 'campo', id: 'nc-unidad' },
      h('option', { value: 'g' }, 'gramos (g)'),
      h('option', { value: 'unidad' }, 'unidades'),
      h('option', { value: 'ml' }, 'mililitros (ml)'));
    const fPorcion = campoNumero({ etiqueta: 'la porción', id: 'nc-porcion', paso: 10 });
    const filaPorcion = h('div', { class: 'fila' },
      h('label', { class: 'fila-etiqueta', for: 'nc-porcion' }, 'Porción', h('span', { class: 'fila-nota' }, 'gramos por porción (opcional)')),
      fPorcion.el);
    const fStock = campoNumero({ etiqueta: 'cuánto hay', id: 'nc-stock' });
    const fMinimo = campoNumero({ etiqueta: 'el mínimo', id: 'nc-minimo' });
    const notaStock = h('span', { class: 'fila-nota' });
    const notaMinimo = h('span', { class: 'fila-nota' });

    // Cantidad y mínimo se escriben en porciones si hay porción, si no en la unidad elegida.
    function actualizar() {
      if (tipo.value === 'bebida') { unidad.value = 'unidad'; categoria.value = 'Bebidas'; }
      filaPorcion.hidden = unidad.value !== 'g';
      const conPorcion = unidad.value === 'g' && fPorcion.valor > 0;
      const en = conPorcion ? 'en porciones' : 'en ' + unidadPlural(unidad.value);
      notaStock.textContent = en;
      notaMinimo.textContent = en + ' · avisa cuando baja de aquí';
    }
    [tipo, unidad].forEach((el) => el.addEventListener('change', actualizar));
    fPorcion.input.addEventListener('input', actualizar);
    actualizar();

    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Crear casilla');
    async function crear(e) {
      e.preventDefault();
      const porcion = unidad.value === 'g' && fPorcion.valor > 0 ? fPorcion.valor : 0;
      const factor = porcion || 1;
      const stock = fStock.valor == null ? 0 : fStock.valor;
      const minimo = fMinimo.valor == null ? 0 : fMinimo.valor;
      if (!nombre.value.trim()) { aviso('Escribe el nombre de la casilla.'); nombre.focus(); return; }
      if (!Number.isFinite(stock) || stock < 0) { aviso('Revisa la cantidad: tiene que ser un número.'); fStock.input.focus(); return; }
      if (!Number.isFinite(minimo) || minimo < 0) { aviso('Revisa el mínimo: tiene que ser un número.'); fMinimo.input.focus(); return; }
      ocupado(btn, 'Creando…');
      try {
        const nuevo = await Api.crearInsumo({
          nombre: nombre.value.trim(), tipo: tipo.value, categoria: categoria.value, unidad_base: unidad.value,
          porcion_g: porcion, stock_actual: redondear(stock * factor), stock_minimo: redondear(minimo * factor)
        });
        estado.insumos = [...(estado.insumos || []), nuevo];
        Hoja.cerrar();
        if (estado.zonaInventario && estado.zonaInventario.isConnected) pintarInventario(estado.zonaInventario);
        else render();
        aviso(`Casilla creada: ${nuevo.nombre}`);
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }

    Hoja.abrir(h('form', { class: 'formulario', novalidate: true, onsubmit: crear },
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, 'Nueva casilla'),
      h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'nc-nombre' }, 'Nombre'), nombre),
      h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'nc-tipo' }, 'Tipo'), tipo),
      h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'nc-categoria' }, 'Categoría'), categoria),
      h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'nc-unidad' }, 'Se cuenta en'), unidad),
      filaPorcion,
      h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'nc-stock' }, 'Cuánto hay ahora', notaStock), fStock.el),
      h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'nc-minimo' }, 'Mínimo', notaMinimo), fMinimo.el),
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
    const insumos = estado.insumos || [];
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
        entradas.push({ insumo_id: insumo.id, cantidad: redondear(v * factorIngreso(insumo)) });
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
      : datos.insumos.filter((i) => i.tipo === 'bebida' || i.categoria === 'Bebidas').map((i) => ({ ...i, vendidos: 0 }));
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
          aviso(res.sinReceta.length ? `Guardado. Sin receta, no se descontó: ${res.sinReceta.join(', ')}` : 'Ventas guardadas');
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
            h('span', { class: 'fila-etiqueta' }, i.nombre, m.detalle && h('span', { class: 'fila-nota' }, m.detalle)),
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
    const insumos = datos.insumos; // incluye bebidas: un combo puede llevar una
    const grupos = agruparPorCategoria([...insumos]);
    const lista = h('div', { class: 'lista-items' });
    const filas = [];
    let contador = 0;

    // Las cantidades de la receta se escriben en la unidad de la casilla (g o unidades), igual que la ficha.
    function agregar(ing) {
      const k = contador++;
      const select = h('select', { class: 'campo', id: `ing-${k}`, 'aria-label': 'Ingrediente' },
        h('option', { value: '' }, 'Elige un ingrediente…'),
        grupos.map(({ categoria, items }) => h('optgroup', { label: categoria }, items.map((i) => h('option', { value: i.id }, i.nombre)))));
      select.value = ing ? ing.insumo_id : '';
      const campo = campoNumero({ valor: ing ? ing.cantidad : null, etiqueta: 'la cantidad', id: `ing-c-${k}` });
      const unidad = h('label', { class: 'fila-nota', for: `ing-c-${k}` });
      const pintarUnidad = () => {
        const i = insumos.find((x) => x.id === select.value);
        if (!i) { unidad.textContent = ''; return; }
        const base = (i.unidad_base === 'g' ? 'g' : unidadPlural(i.unidad_base)) + ' por cada uno';
        unidad.textContent = i.porcion_g > 0 ? `${base} · 1 porc. = ${nf.format(i.porcion_g)} g` : base;
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

  function vistaPendiente(titulo, texto, volverHref, volverTexto) {
    return (main) => main.replaceChildren(...sinVacios([
      volverHref && volver(volverHref, volverTexto),
      h('h1', { class: 'titulo' }, titulo),
      h('p', { class: 'vacio' }, texto)
    ]));
  }

  function filaLista(href, titulo, ayuda) {
    return h('a', { class: 'lista-fila', href },
      h('span', { class: 'lista-texto' }, h('strong', null, titulo), h('span', { class: 'pequeno texto-suave' }, ayuda)),
      h('span', { html: CHEVRON }));
  }

  function vistaMas(main) {
    main.replaceChildren(
      h('h1', { class: 'titulo' }, 'Más'),
      h('nav', { class: 'lista', 'aria-label': 'Más opciones' },
        filaLista('#mas/movimientos', 'Movimientos', 'Historial de entradas, ventas y ajustes'),
        filaLista('#mas/ajustes', 'Ajustes', 'Mínimos y Telegram')),
      h('div', { class: 'lista' },
        h('button', {
          type: 'button', class: 'lista-fila',
          onclick: () => { Api.sesion.olvidarPin(); mostrarIngreso(); }
        },
          h('span', { class: 'lista-texto' },
            h('strong', null, 'Cambiar de usuario'),
            h('span', { class: 'pequeno texto-suave' }, `Registrando como ${Api.sesion.usuario}`)))));
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
    inventario: vistaInventario,
    produccion: vistaProduccion,
    ventas: vistaVentas,
    recetas: vistaRecetas,
    mas: vistaMas,
    'mas/movimientos': vistaPendiente('Movimientos', 'Aquí va el historial de entradas, ventas y ajustes (siguiente fase).', '#mas', 'Más'),
    'mas/ajustes': vistaPendiente('Ajustes', 'Aquí van los mínimos y Telegram (fase de notificaciones).', '#mas', 'Más')
  };

  function rutaActual() {
    const r = location.hash.replace(/^#\/?/, '');
    return RUTAS[r] ? r : 'hoy';
  }

  function render() {
    estado.vistaId++;
    const ruta = rutaActual();
    // Producción y Ventas se abren desde Hoy, así que la barra marca Hoy.
    const seccion = { produccion: 'hoy', ventas: 'hoy' }[ruta] || ruta.split('/')[0];
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
