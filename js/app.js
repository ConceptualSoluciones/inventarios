/* SANTO — navegación y vistas */
(function () {
  'use strict';

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

  // ---------- productos: formas de medir, grupos y buscador ----------

  // unidad · gramos · presentacion (lo producido: porción, jarra…) tienen stock.
  // ojo: salsas, aderezos y verduras que solo se marcan por nivel (Lleno · Medio · Bajo · Vacío).
  const FORMAS_MEDIR = [['unidad', 'Por unidad'], ['gramos', 'Por gramos'],
    ['presentacion', 'Por porción o presentación'], ['ojo', 'Al ojo (lleno · medio · bajo · vacío)']];
  const seCuenta = (i) => i.medicion !== 'ojo';
  const alOjo = (i) => i.medicion === 'ojo';
  // Lo que se compra: por unidad o por gramos. Lo porcionado sale de Producción.
  const seCompra = (i) => i.medicion === 'unidad' || i.medicion === 'gramos';
  const NIVELES = [['lleno', 'Lleno'], ['medio', 'Medio'], ['bajo', 'Bajo'], ['vacío', 'Vacío']];
  const NIVELES_ALERTA = ['bajo', 'vacío'];
  // Mismos colores que el mensaje de WhatsApp.
  const EMOJI_NIVEL = { lleno: '🟢', medio: '🟡', bajo: '🔴', 'vacío': '⚫' };
  const textoNivel = (nivel) => `${EMOJI_NIVEL[nivel] || ''} ${capital(nivel)}`.trim();
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // Lo que hay de un producto, en su unidad.
  const mostrar = (n, item) => cantidad(n, item.unidad);
  function mostrarTexto(n, item) {
    const m = mostrar(n, item);
    return `${m.num} ${m.unidad}`;
  }
  const unidadDeIngreso = (item) => (item.unidad === 'g' ? 'gramos' : unidadPlural(item.unidad));

  // En el orden de la cocina; lo que no está aquí va después, en orden alfabético.
  const ORDEN_CATEGORIAS = ['Panes', 'Carnes y proteínas', 'Salsas y aderezos', 'Verduras', 'Complementos',
    'Lácteos', 'Secos', 'Congelados', 'Bebidas', 'Solo producción'];

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
  // Se busca por el nombre oficial y por sus alias ("chancho" encuentra la panceta).
  const textoBusqueda = (item) => sinTildes(`${item.nombre} ${item.alias || ''}`);

  // Caja de búsqueda que oculta las filas [data-buscar] que no coinciden y los grupos que quedan vacíos.
  function buscador(contenedor, id) {
    const input = h('input', {
      type: 'search', class: 'campo', id, placeholder: 'Buscar…', autocomplete: 'off', 'aria-label': 'Buscar producto',
      oninput: () => {
        const q = sinTildes(input.value.trim());
        contenedor.querySelectorAll('[data-buscar]').forEach((el) => { el.hidden = Boolean(q) && !el.dataset.buscar.includes(q); });
        contenedor.querySelectorAll('[data-grupo]').forEach((g) => { g.hidden = !g.querySelector('[data-buscar]:not([hidden])'); });
      }
    });
    return input;
  }

  // ---------- Hoy: el día en tres pasos + lo que falta hacer ----------

  // Apertura → Producción → Cierre. El cierre lo hace un admin: cocina lo ve, pero no lo abre.
  const PASOS = [
    { id: 'compras', nombre: 'Compras', etiqueta: '1 · apertura', color: 'navy', ilustracion: 'ventas', href: '#compras' },
    { id: 'produccion', nombre: 'Producción', etiqueta: '2 · en cocina', color: 'olive', ilustracion: 'produccion', href: null },
    { id: 'cierre', nombre: 'Cierre', etiqueta: '3 · en la noche', color: 'sand', ilustracion: 'inventario', href: '#ventas', soloAdmin: true }
  ];

  function pildoraPaso(paso, texto) {
    const abre = paso.href && !(paso.soloAdmin && !Api.sesion.esAdmin);
    return h(abre ? 'a' : 'div', { class: `pill pill--${paso.color}`, href: abre ? paso.href : null },
      h('span', { class: 'pill-etiqueta' }, paso.etiqueta),
      h('span', { class: 'pill-nombre pill-nombre--menu' }, paso.nombre),
      texto && h('span', { class: 'pill-estado' }, texto),
      ilustracion(paso));
  }

  // En qué va cada paso, según lo anotado hoy.
  function textoPaso(paso, dia) {
    if (paso.id === 'compras') {
      return dia.compras ? `Anotado: ${dia.compras} ${dia.compras === 1 ? 'producto' : 'productos'}` : 'Todavía no se anotó nada';
    }
    if (paso.id === 'produccion') return 'Próximamente';
    if (!Api.sesion.esAdmin) return dia.cierre ? 'Hecho · lo hace un admin' : 'Lo hace un admin';
    return dia.cierre ? 'Hecho' : 'Pendiente';
  }

  const bajoMinimo = (i) => seCuenta(i) && i.stock_minimo > 0 && i.stock_actual < i.stock_minimo;
  const negativo = (i) => seCuenta(i) && i.stock_actual < 0;
  const nivelBajo = (i) => alOjo(i) && NIVELES_ALERTA.includes(i.estado_actual);

  // Pendientes de compra: lo que está bajo el mínimo y lo que quedó en Bajo o Vacío.
  const porComprar = (insumos) => insumos.filter((i) => bajoMinimo(i) || nivelBajo(i));

  // Botones Lleno · Medio · Bajo · Vacío. Siempre hay uno marcado.
  function selectorNivel(item, valor, alElegir) {
    const botones = NIVELES.map(([v, texto]) => h('button', {
      type: 'button', class: 'estado-btn' + (NIVELES_ALERTA.includes(v) ? ' estado-btn--alerta' : ''),
      'data-valor': v, 'aria-pressed': 'false', onclick: () => alElegir(v)
    }, texto));
    const marcar = (v) => botones.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valor === v)));
    marcar(valor);
    return {
      el: h('div', { class: 'estados', role: 'group', 'aria-label': item.nombre }, botones),
      marcar
    };
  }

  // Producto al ojo: nombre arriba y los 4 botones abajo.
  function filaNivel(item, selector) {
    return h('div', { class: 'fila-estado', 'data-buscar': textoBusqueda(item) },
      h('div', { class: 'fila-estado-cabeza' }, h('span', { class: 'fila-etiqueta' }, item.nombre)),
      selector.el);
  }

  // Nivel solo para ver (Inventario): se marca en el cierre o en la Revisión inicial.
  function filaNivelVer(item) {
    return h('div', { class: 'fila', 'data-buscar': textoBusqueda(item) },
      h('span', { class: 'fila-etiqueta' }, item.nombre),
      h('span', { class: 'nivel-texto' + (nivelBajo(item) ? ' nivel-texto--alerta' : '') }, textoNivel(item.estado_actual)));
  }

  function grupoInsumos(titulo, hijos, clase) {
    return h('section', { class: 'grupo' + (clase ? ' ' + clase : ''), 'data-grupo': '' },
      h('h2', { class: 'subtitulo' }, titulo),
      h('div', { class: 'lista-items' }, hijos));
  }

  // ---------- Hoy: menú principal y notificaciones ----------

  function vistaInicio(main) {
    const pasos = h('nav', { class: 'pills', 'aria-label': 'El día' }, PASOS.map((p) => pildoraPaso(p, '')));
    const alertas = h('div');
    main.replaceChildren(
      h('h1', { class: 'titulo' }, 'Hoy'),
      h('p', { class: 'fecha-larga' }, fechaLarga(Api.hoyLima())),
      pasos,
      alertas);
    cargarEn(alertas, Api.cargarHoy, ({ insumos, dia }) => {
      estado.insumos = insumos;
      pasos.replaceChildren(...PASOS.map((p) => pildoraPaso(p, textoPaso(p, dia))));
      pintarAlertas(alertas, insumos);
    });
  }

  function pintarAlertas(cont, insumos) {
    const revisar = insumos.filter(negativo).sort(porNombre);
    const pc = porComprar(insumos);
    const bajos = pc.filter(seCuenta).length;
    const niveles = pc.length - bajos;
    const detalle = sinVacios([
      bajos && `${bajos} bajo el mínimo`,
      niveles && `${niveles} en Bajo o Vacío`
    ]).join(' · ');
    const fila = (href, contenido) => h('li', null, h('a', { class: 'alerta-fila', href },
      h('span', { class: 'punto', 'aria-hidden': 'true' }), h('span', null, contenido)));
    const items = [
      ...revisar.map((i) => fila('#compras', ['Revisar ', h('strong', null, i.nombre),
        `: quedó en ${mostrarTexto(i.stock_actual, i)} · falta anotar lo que entró`])),
      pc.length && fila('#por-comprar', [h('strong', null, `Pendientes de compra: ${pc.length}`), ` · ${detalle}`])
    ].filter(Boolean);
    cont.replaceChildren(items.length
      ? h('section', { class: 'alertas', 'aria-labelledby': 'alertas-titulo' },
          h('h2', { class: 'subtitulo', id: 'alertas-titulo' }, 'Lo que falta hacer'),
          h('ul', null, items))
      : h('p', { class: 'nota' }, 'Todo en orden.'));
  }

  // ---------- Pendientes de compra ----------

  function vistaPorComprar(main) {
    const zona = h('div', null, esqueletoFilas(5));
    main.replaceChildren(
      volver('#hoy', 'Hoy'),
      h('h1', { class: 'titulo' }, 'Pendientes de compra'),
      h('p', { class: 'texto-suave' }, 'Lo que está bajo el mínimo y lo que quedó en Bajo o Vacío.'),
      zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => {
      estado.insumos = insumos;
      const nota = (i) => (alOjo(i)
        ? `está en ${textoNivel(i.estado_actual)}`
        : `quedan ${mostrarTexto(i.stock_actual, i)} · mínimo ${mostrarTexto(i.stock_minimo, i)}`);
      const grupos = agruparPorCategoria(porComprar(insumos)).map(({ categoria, items }) =>
        grupoInsumos(categoria, items.map((i) => h('div', { class: 'fila' },
          h('span', { class: 'fila-etiqueta' }, i.nombre, h('span', { class: 'fila-nota' }, nota(i)))))));
      zona.replaceChildren(grupos.length ? h('div', { class: 'grupos' }, grupos) : h('p', { class: 'vacio' }, 'No falta nada.'));
    });
  }

  // ---------- Inventario: lo que se cuenta (barras) y lo que va al ojo ----------

  function vistaInventario(main) {
    const zona = h('div', { class: 'hoy' }, esqueletoFilas(7));
    main.replaceChildren(
      h('div', { class: 'titulo-fila' },
        h('h1', { class: 'titulo' }, 'Inventario'),
        Api.sesion.esAdmin && h('button', { type: 'button', class: 'btn btn-secundario btn-chico', onclick: () => abrirProducto(null) }, '+ Nuevo producto')),
      zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => pintarInventario(zona, insumos));
  }

  function pintarInventario(zona, insumos) {
    estado.insumos = insumos;
    if (!insumos.length) {
      zona.replaceChildren(h('p', { class: 'vacio' }, Api.sesion.esAdmin
        ? 'Todavía no hay productos. Crea el primero con “+ Nuevo producto”.' : 'Todavía no hay productos.'));
      return;
    }

    const barras = graficaConteo(insumos.filter(seCuenta));

    const ojo = agruparPorCategoria(insumos.filter(alOjo)).map(({ categoria, items }) => {
      const filas = items.map(filaNivelVer);
      if (categoria !== 'Solo producción') return grupoInsumos(categoria, filas);
      // Es la lista más larga y se usa menos: va plegada.
      return h('details', { class: 'grupo plegable' },
        h('summary', { class: 'subtitulo' }, `Solo producción (${items.length})`),
        h('div', { class: 'lista-items' }, filas));
    });

    const lista = h('div', { class: 'hoy' }, ...sinVacios([
      barras.length && h('section', { class: 'grupos' }, ...barras,
        h('p', { class: 'pequeno texto-suave' }, 'Cada grupo usa su propia escala. La rayita roja marca el mínimo.')),
      ojo.length && h('section', { class: 'grupos' },
        h('h2', { class: 'subtitulo subtitulo--seccion' }, 'Al ojo'),
        h('p', { class: 'pequeno texto-suave' }, 'Solo para ver: el nivel se marca en el cierre.'),
        ...ojo)
    ]));
    zona.replaceChildren(buscador(lista, 'buscar-inventario'), lista);
  }

  // Barras horizontales de lo que se cuenta, agrupadas por categoría y en orden alfabético.
  // Cada grupo tiene su propia escala, porque mezclar gramos con unidades no dice nada.
  function graficaConteo(insumos) {
    return agruparPorCategoria(insumos).map(({ categoria, items }) => {
      const max = Math.max(1, ...items.map((i) => Math.max(i.stock_actual, i.stock_minimo || 0)));
      const idTitulo = 'g-' + sinTildes(categoria).replace(/[^a-z0-9]+/g, '-');
      return h('section', { class: 'grupo', 'data-grupo': '', 'aria-labelledby': idTitulo },
        h('h2', { class: 'subtitulo', id: idTitulo }, categoria),
        h('ul', { class: 'grafica' }, items.map((i) => {
          const bajo = bajoMinimo(i) || negativo(i);
          const m = mostrar(i.stock_actual, i);
          return h('li', { class: 'grafica-fila' + (bajo ? ' grafica-fila--bajo' : ''), 'data-buscar': textoBusqueda(i) },
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
    });
  }

  // ---------- Productos (solo admin): nombre, alias, categoría, forma de medir, unidad y mínimo ----------

  const pastillaRevisar = () => h('span', { class: 'etiqueta-estado etiqueta-estado--suave' }, 'Por revisar');

  function vistaProductos(main) {
    const zona = h('div', { class: 'hoy' }, esqueletoFilas(7));
    main.replaceChildren(
      volver('#mas', 'Más'),
      h('div', { class: 'titulo-fila' },
        h('h1', { class: 'titulo' }, 'Productos'),
        h('button', { type: 'button', class: 'btn btn-secundario btn-chico', onclick: () => abrirProducto(null) }, '+ Nuevo producto')),
      zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => pintarProductos(zona, insumos));
  }

  function resumenProducto(i) {
    return sinVacios([
      alOjo(i) ? 'al ojo' : i.medicion === 'gramos' ? 'por gramos' : `por ${i.unidad}`,
      i.stock_minimo > 0 && `mínimo ${mostrarTexto(i.stock_minimo, i)}`,
      i.alias && `alias: ${i.alias}`,
      i.nota
    ]).join(' · ');
  }

  function pintarProductos(zona, insumos) {
    estado.insumos = insumos;
    const porRevisar = insumos.filter((i) => i.revisar).length;
    const lista = h('div', { class: 'grupos' }, agruparPorCategoria([...insumos]).map(({ categoria, items }) =>
      h('section', { class: 'grupo', 'data-grupo': '' },
        h('h2', { class: 'subtitulo' }, categoria),
        h('div', { class: 'lista' }, items.map((i) =>
          h('button', { type: 'button', class: 'lista-fila', 'data-buscar': textoBusqueda(i), onclick: () => abrirProducto(i) },
            h('span', { class: 'lista-texto' },
              h('strong', null, i.nombre),
              i.revisar && pastillaRevisar(),
              h('span', { class: 'pequeno texto-suave' }, resumenProducto(i))),
            h('span', { html: CHEVRON })))))));
    zona.replaceChildren(...sinVacios([
      porRevisar > 0 && h('p', { class: 'nota' }, porRevisar === 1
        ? 'Queda 1 producto por revisar: ábrelo, corrige lo que haga falta y guarda.'
        : `Quedan ${porRevisar} productos por revisar: vienen del documento de la dueña. Ábrelos, corrige lo que haga falta y guarda.`),
      insumos.length ? buscador(lista, 'buscar-productos') : h('p', { class: 'vacio' }, 'Todavía no hay productos.'),
      lista
    ]));
  }

  // Crear (item = null) o editar un producto.
  function abrirProducto(item) {
    const nuevo = !item;
    const p = item || { nombre: '', alias: '', categoria: '', medicion: 'unidad', unidad: '', stock_minimo: 0, nota: '' };
    const categorias = [...new Set([...ORDEN_CATEGORIAS, ...(estado.insumos || []).map((i) => i.categoria)])].filter(Boolean);
    const input = (id, valor, attrs) => {
      const el = h('input', { class: 'campo', id, autocomplete: 'off', ...attrs });
      el.value = valor || '';
      return el;
    };
    const nombre = input('pr-nombre', p.nombre, { maxlength: 40 });
    const alias = input('pr-alias', p.alias, { maxlength: 120, placeholder: 'por ejemplo, chancho, chicharrón' });
    const categoria = h('select', { class: 'campo', id: 'pr-categoria' },
      categorias.map((c) => h('option', { value: c }, c)), h('option', { value: '' }, 'Otra…'));
    categoria.value = p.categoria || categorias[0];
    const otraCategoria = input('pr-otra', '', { maxlength: 30 });
    const medicion = h('select', { class: 'campo', id: 'pr-medicion' }, FORMAS_MEDIR.map(([v, t]) => h('option', { value: v }, t)));
    medicion.value = p.medicion;
    const unidad = input('pr-unidad', p.medicion === 'unidad' || p.medicion === 'presentacion' ? p.unidad : '',
      { maxlength: 20, placeholder: 'unidad, porción, jarra, pan…' });
    const fMinimo = campoNumero({ valor: p.stock_minimo || null, etiqueta: 'el mínimo', id: 'pr-minimo' });
    const fStock = campoNumero({ etiqueta: 'cuánto hay', id: 'pr-stock' });
    const nota = input('pr-nota', p.nota, { maxlength: 80, placeholder: 'por ejemplo, 140 g por porción' });
    const revisado = h('input', { type: 'checkbox', id: 'pr-revisado', checked: true });
    const notaMinimo = h('span', { class: 'fila-nota' });
    const notaStock = h('span', { class: 'fila-nota' });
    const notaCambio = h('p', { class: 'nota' }, 'Cambia la forma de medir: después cuéntalo de nuevo en Ajustes › Contar un producto.');

    const campo = (id, texto, el, ayuda) => h('div', { class: 'campo-grupo' },
      h('label', { class: 'etiqueta-campo', for: id }, texto, ayuda && ` · ${ayuda}`), el);
    const grupoOtra = campo('pr-otra', 'Categoría nueva', otraCategoria);
    const grupoUnidad = campo('pr-unidad', 'Unidad', unidad, 'en singular');
    const filaMinimo = h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'pr-minimo' }, 'Mínimo', notaMinimo), fMinimo.el);
    const filaStock = nuevo && h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'pr-stock' }, 'Cuánto hay ahora', notaStock), fStock.el);

    const unidadElegida = () => (medicion.value === 'gramos' ? 'g'
      : unidad.value.trim().toLowerCase() || (medicion.value === 'presentacion' ? 'porción' : 'unidad'));
    function actualizar() {
      const cuenta = medicion.value !== 'ojo';
      grupoOtra.hidden = categoria.value !== '';
      grupoUnidad.hidden = !cuenta || medicion.value === 'gramos';
      filaMinimo.hidden = !cuenta;
      if (filaStock) filaStock.hidden = !cuenta;
      notaCambio.hidden = nuevo || !cuenta || (medicion.value === item.medicion && unidadElegida() === item.unidad);
      const en = `en ${unidadDeIngreso({ unidad: unidadElegida() })}`;
      notaMinimo.textContent = `${en} · avisa cuando baja de aquí`;
      notaStock.textContent = en;
    }
    [categoria, medicion].forEach((el) => el.addEventListener('change', actualizar));
    unidad.addEventListener('input', actualizar);
    actualizar();

    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, nuevo ? 'Crear producto' : 'Guardar');
    async function guardar(e) {
      e.preventDefault();
      const cat = categoria.value || otraCategoria.value.trim();
      if (!nombre.value.trim()) { aviso('Escribe el nombre.'); nombre.focus(); return; }
      if (!cat) { aviso('Escribe la categoría nueva.'); otraCategoria.focus(); return; }
      for (const [campoN, texto] of [[fMinimo, 'el mínimo'], [fStock, 'la cantidad']]) {
        const v = campoN.valor;
        if (v != null && (!Number.isFinite(v) || v < 0)) { aviso(`Revisa ${texto}: tiene que ser un número.`); campoN.input.focus(); return; }
      }
      const datos = {
        nombre: nombre.value.trim(), alias: alias.value, categoria: cat, medicion: medicion.value,
        unidad: unidadElegida(), stock_minimo: fMinimo.valor || 0, nota: nota.value.trim()
      };
      ocupado(btn, 'Guardando…');
      try {
        const r = nuevo
          ? await Api.crearProducto({ ...datos, stock_actual: fStock.valor || 0 })
          : await Api.guardarProducto({ ...datos, id: item.id, revisado: item.revisar && revisado.checked });
        estado.insumos = r.insumos;
        Hoja.cerrar();
        render();
        aviso(nuevo ? `Producto creado: ${datos.nombre}` : `Guardado: ${datos.nombre}`);
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }

    // Quitar pide un segundo toque. La fila queda en el Sheet, así el historial conserva su nombre.
    const btnQuitar = !nuevo && h('button', { type: 'button', class: 'btn btn-secundario btn-ancho' }, 'Quitar de la app');
    if (btnQuitar) {
      btnQuitar.addEventListener('click', async () => {
        if (!btnQuitar.dataset.confirmar) {
          btnQuitar.dataset.confirmar = '1';
          btnQuitar.textContent = `Toca otra vez para quitar ${item.nombre}`;
          return;
        }
        ocupado(btnQuitar, 'Quitando…');
        try {
          const r = await Api.guardarProducto({ id: item.id, desactivar: true });
          estado.insumos = r.insumos;
          Hoja.cerrar();
          render();
          aviso(`${item.nombre} ya no aparece en la app. Su historial se guarda.`);
        } catch (err) {
          aviso(mensajeError(err, MSJ_GUARDAR));
          libre(btnQuitar);
        }
      });
    }

    Hoja.abrir(h('form', { class: 'formulario', novalidate: true, onsubmit: guardar }, ...sinVacios([
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, nuevo ? 'Nuevo producto' : item.nombre),
      !nuevo && item.revisar && h('p', { class: 'nota' }, 'Viene del documento de la dueña: revisa los datos y guarda.'),
      !nuevo && seCuenta(item) && h('p', { class: 'texto-suave' }, `Hay ahora: ${mostrarTexto(item.stock_actual, item)}`),
      campo('pr-nombre', 'Nombre oficial', nombre),
      campo('pr-alias', 'Alias', alias, 'opcional, separados por coma'),
      campo('pr-categoria', 'Categoría', categoria),
      grupoOtra,
      campo('pr-medicion', 'Cómo se mide', medicion),
      notaCambio,
      grupoUnidad,
      filaMinimo,
      filaStock,
      campo('pr-nota', 'Nota', nota, 'opcional, solo se muestra'),
      !nuevo && item.revisar && h('label', { class: 'campo-check', for: 'pr-revisado' }, revisado, 'Marcar como revisado'),
      btn,
      btnQuitar
    ])), { foco: nombre });
  }

  // ---------- Compras: lo que entra (suma al inventario) ----------

  function vistaCompras(main) {
    const zona = h('div', { class: 'hoy' }, esqueletoFilas(7));
    main.replaceChildren(
      volver('#hoy', 'Hoy'),
      h('h1', { class: 'titulo' }, 'Compras'),
      h('p', { class: 'texto-suave' }, 'Anota lo que entró o se compró hoy. Se suma al inventario. El precio total es opcional.'),
      zona);
    cargarEn(zona, Api.cargarCompras, (datos) => pintarCompras(zona, datos));
  }

  // Lo ya anotado hoy, para no anotarlo dos veces.
  function compradoHoy(compras) {
    if (!compras.length) return null;
    const conPrecio = compras.filter((c) => c.precio !== '');
    const total = conPrecio.reduce((s, c) => s + c.precio, 0);
    return h('section', { class: 'grupo' },
      h('h2', { class: 'subtitulo' }, 'Ya anotado hoy'),
      h('div', { class: 'lista-items' }, compras.map((c) => {
        const m = cantidad(c.cantidad, c.unidad);
        return h('div', { class: 'fila' },
          h('span', { class: 'fila-etiqueta' }, c.nombre,
            h('span', { class: 'fila-nota' }, sinVacios([c.hora, c.usuario, c.precio !== '' && soles(c.precio)]).join(' · '))),
          h('span', { class: 'valor' }, '+' + m.num, h('span', { class: 'valor-unidad' }, m.unidad)));
      })),
      conPrecio.length > 0 && h('p', { class: 'pequeno texto-suave' },
        `Total con precio: ${soles(total)}` + (conPrecio.length < compras.length ? ' (hay compras sin precio)' : '')));
  }

  function pintarCompras(zona, datos) {
    estado.insumos = datos.insumos;
    const insumos = datos.insumos.filter(seCompra);
    if (!insumos.length) {
      zona.replaceChildren(h('p', { class: 'vacio' }, 'Todavía no hay productos que se compren por unidad o por gramos.'));
      return;
    }
    const campos = [];
    let k = 0;
    // Cada producto: la cantidad y, cuando se escribe algo, el precio total (opcional).
    const lista = h('div', { class: 'grupos' }, agruparPorCategoria(insumos).map(({ categoria, items }) =>
      h('section', { class: 'grupo', 'data-grupo': '' },
        h('h2', { class: 'subtitulo' }, categoria),
        h('div', { class: 'lista-items' }, items.map((insumo) => {
          const id = `com-${k++}`;
          const precio = h('input', {
            class: 'campo campo-precio', id: `${id}-p`, type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done'
          });
          const filaPrecio = h('div', { class: 'fila-precio', hidden: true },
            h('label', { class: 'fila-nota', for: `${id}-p` }, 'Precio total S/ (opcional)'), precio);
          const campo = campoNumero({
            etiqueta: insumo.nombre, id,
            alCambiar: (v) => { filaPrecio.hidden = !(v > 0); }
          });
          campos.push({ insumo, campo, precio });
          const en = insumo.unidad === 'g' ? 'en gramos (1 kg = 1000)' : `en ${unidadDeIngreso(insumo)}`;
          return h('div', { class: 'compra', 'data-buscar': textoBusqueda(insumo) },
            h('div', { class: 'fila' },
              h('label', { class: 'fila-etiqueta', for: id }, insumo.nombre,
                h('span', { class: 'fila-nota' }, `hay ${mostrarTexto(insumo.stock_actual, insumo)} · ${en}`)),
              campo.el),
            filaPrecio);
        })))));

    const btn = h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar compras');
    async function guardar() {
      const compras = [];
      for (const { insumo, campo, precio } of campos) {
        const v = campo.valor;
        if (v == null || v === 0) continue;
        if (!Number.isFinite(v) || v < 0) { aviso(`Revisa ${insumo.nombre}: tiene que ser un número.`); campo.input.focus(); return; }
        const p = parseNumero(precio.value);
        if (p != null && (!Number.isFinite(p) || p < 0)) { aviso(`Revisa el precio de ${insumo.nombre}: tiene que ser un número.`); precio.focus(); return; }
        compras.push({ insumo_id: insumo.id, cantidad: redondear(v), precio: p == null ? '' : redondear(p) });
      }
      if (!compras.length) { aviso('Escribe cuánto entró de al menos un producto.'); return; }
      ocupado(btn, 'Guardando…');
      try {
        const r = await Api.registrarCompras({ compras });
        pintarCompras(zona, r);
        window.scrollTo(0, 0);
        aviso(r.guardadas === 1 ? 'Guardado: 1 producto' : `Guardado: ${r.guardadas} productos`);
      } catch (err) {
        // No se limpia nada: los números escritos siguen ahí.
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }

    zona.replaceChildren(...sinVacios([
      compradoHoy(datos.compras),
      buscador(lista, 'buscar-compras'),
      lista,
      h('div', { class: 'pie-accion' }, btn)
    ]));
  }

  // ---------- Ventas: platos y bebidas que salen (descuenta del inventario) ----------

  const GRUPOS_VENTA = [['cultos', 'Cultos'], ['criollos', 'Criollos'], ['papas', 'Papas y combos'], ['bebidas', 'Bebidas']];

  // Cultos, Criollos, Papas y Bebidas; lo que no tenga grupo conocido va en "Otros" para que nunca desaparezca.
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

  // Lo que la receta descuenta con cada venta (lo que va al ojo solo informa).
  const conCantidad = (r) => r.ingredientes.filter((ing) => !ing.al_ojo);

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

  function pastillasReceta(r) {
    return [
      !conCantidad(r).length && h('span', { class: 'etiqueta-estado' }, 'Sin receta'),
      r.estado === 'provisional' && h('span', { class: 'etiqueta-estado etiqueta-estado--suave' }, 'Provisional'),
      r.revisar && pastillaRevisar()
    ].filter(Boolean);
  }

  function pintarVentas(zona, datos) {
    const insumos = {};
    datos.insumos.forEach((i) => { insumos[i.id] = i; });

    let k = 0;
    const productos = [];
    const fila = (r) => {
      const v = { receta: r, campo: campoNumero({ valor: r.vendidos || null, etiqueta: r.nombre, id: `ven-${k++}` }) };
      productos.push(v);
      return h('div', { class: 'fila' },
        h('label', { class: 'fila-etiqueta', for: v.campo.input.id }, r.nombre, ...pastillasReceta(r)),
        v.campo.el);
    };
    const secciones = agruparRecetas(datos.recetas).map(({ titulo, items }) => h('section', { class: 'grupo' },
      h('h2', { class: 'subtitulo' }, titulo),
      h('div', { class: 'lista-items' }, items.map(fila))));

    // Lo que se va a descontar de cada producto con las cantidades escritas.
    function calcular() {
      const descuentos = {};
      const sinReceta = [];
      for (const v of productos) {
        const n = v.campo.valor;
        if (n == null || n === 0) continue;
        if (!Number.isFinite(n) || n < 0) return { error: v };
        const ingredientes = conCantidad(v.receta).filter((ing) => insumos[ing.insumo_id] && seCuenta(insumos[ing.insumo_id]));
        if (!ingredientes.length) sinReceta.push(v.receta.nombre);
        ingredientes.forEach((ing) => { descuentos[ing.insumo_id] = (descuentos[ing.insumo_id] || 0) + ing.cantidad * n; });
      }
      return { descuentos, sinReceta };
    }

    function revisar() {
      const r = calcular();
      if (r.error) { aviso(`Revisa ${r.error.receta.nombre}: tiene que ser un número.`); r.error.campo.input.focus(); return; }
      const ids = Object.keys(r.descuentos);
      if (!ids.length && !r.sinReceta.length && !datos.guardado) { aviso('Escribe cuánto se vendió de al menos un producto.'); return; }

      const btnConfirmar = h('button', { type: 'button', class: 'btn btn-primario', onclick: confirmar }, 'Confirmar ventas');
      async function confirmar() {
        const ventas = productos
          .filter((v) => Number.isFinite(v.campo.valor) && v.campo.valor > 0)
          .map((v) => ({ receta_id: v.receta.id, cantidad: v.campo.valor }));
        ocupado(btnConfirmar, 'Guardando…');
        try {
          const res = await Api.guardarVentas({ fecha: datos.fecha, ventas });
          estado.insumos = res.insumos;
          Hoja.cerrar();
          aviso(res.sinReceta.length ? `Guardado. Sin receta, no se descontó: ${res.sinReceta.join(', ')}.` : 'Ventas guardadas.');
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
      !productos.length && h('p', { class: 'vacio' }, 'No hay productos. Créalos en Recetas.'),
      h('div', { class: 'pie-accion' }, h('button', { type: 'button', class: 'btn btn-primario', onclick: revisar }, 'Revisar descuento'))
    ]));
  }

  // ---------- Recetas: lo que lleva UN plato o UNA bebida vendida ----------

  function vistaRecetas(main) {
    const zona = h('div', null, esqueletoFilas(5));
    main.replaceChildren(
      h('div', { class: 'titulo-fila' },
        h('h1', { class: 'titulo' }, 'Recetas'),
        Api.sesion.esAdmin && h('button', { type: 'button', class: 'btn btn-secundario btn-chico', onclick: () => abrirNuevaReceta(zona) }, '+ Nueva receta')),
      h('p', { class: 'texto-suave' }, Api.sesion.esAdmin
        ? 'Lo que lleva cada producto. Al registrar una venta, se descuenta esto del inventario.'
        : 'Lo que lleva cada producto. Solo un admin puede cambiarlas.'),
      zona);
    cargarEn(zona, Api.cargarRecetas, (datos) => pintarRecetas(zona, datos));
  }

  function textoIngrediente(ing, i) {
    return ing.al_ojo ? `${i.nombre} al ojo` : `${i.nombre} ${cantidadTexto(ing.cantidad, i.unidad)}`;
  }

  function pintarRecetas(zona, datos) {
    const insumos = {};
    datos.insumos.forEach((i) => { insumos[i.id] = i; });
    const grupos = agruparRecetas(datos.recetas);
    if (!grupos.length) {
      zona.replaceChildren(h('p', { class: 'vacio' }, Api.sesion.esAdmin
        ? 'Todavía no hay recetas. Crea la primera con “+ Nueva receta”.' : 'Todavía no hay recetas.'));
      return;
    }
    const admin = Api.sesion.esAdmin;
    const porRevisar = datos.recetas.filter((r) => r.revisar).length;
    zona.replaceChildren(...sinVacios([
      admin && porRevisar > 0 && h('p', { class: 'nota' }, porRevisar === 1
        ? 'Queda 1 receta por revisar: ábrela, corrige lo que haga falta y guarda.'
        : `Quedan ${porRevisar} recetas por revisar: vienen del documento de la dueña. Ábrelas, corrige lo que haga falta y guarda.`),
      ...grupos.map(({ titulo, items: recetas }) => h('section', { class: 'grupo' },
        h('h2', { class: 'subtitulo' }, titulo),
        h('div', { class: 'lista' }, recetas.map((r) => {
          const resumen = r.ingredientes
            .map((ing) => insumos[ing.insumo_id] && textoIngrediente(ing, insumos[ing.insumo_id]))
            .filter(Boolean).join(' · ');
          const texto = h('span', { class: 'lista-texto' },
            h('strong', null, r.nombre),
            ...pastillasReceta(r),
            resumen && h('span', { class: 'pequeno texto-suave' }, resumen));
          // Cocina solo las ve; editarlas es de admin.
          if (!admin) return h('div', { class: 'lista-fila' }, texto);
          return h('button', { type: 'button', class: 'lista-fila', onclick: () => abrirReceta(r, datos, zona) },
            texto, h('span', { html: CHEVRON }));
        }))))
    ]));
  }

  function abrirNuevaReceta(zona) {
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
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, 'Nueva receta'),
      h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'np-nombre' }, 'Nombre del plato o bebida'), nombre),
      h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'np-grupo' }, 'Grupo'), grupo),
      btn), { foco: nombre });
  }

  function abrirReceta(receta, datos, zona) {
    const insumos = datos.insumos;
    const grupos = agruparPorCategoria([...insumos]);
    const lista = h('div', { class: 'lista-items' });
    const filas = [];
    let contador = 0;

    // Cada ingrediente lleva una cantidad en la unidad del producto (acepta medias: 0.5 palta) o va "al ojo":
    // al ojo solo informa y no se descuenta. Lo que se mide al ojo va siempre así.
    function agregar(ing) {
      const k = contador++;
      const select = h('select', { class: 'campo', id: `ing-${k}`, 'aria-label': 'Ingrediente' },
        h('option', { value: '' }, 'Elige un ingrediente…'),
        grupos.map(({ categoria, items }) => h('optgroup', { label: categoria }, items.map((i) => h('option', { value: i.id }, i.nombre)))));
      select.value = ing ? ing.insumo_id : '';
      const campo = campoNumero({ valor: ing && !ing.al_ojo ? ing.cantidad : null, etiqueta: 'la cantidad', id: `ing-c-${k}`, paso: 0.5 });
      const unidad = h('label', { class: 'fila-nota', for: `ing-c-${k}` });
      const ojo = h('input', { type: 'checkbox', id: `ing-o-${k}`, checked: Boolean(ing && ing.al_ojo) });
      const marcaOjo = h('label', { class: 'campo-check', for: `ing-o-${k}` }, ojo, 'Al ojo (no se descuenta)');
      const cantidadEl = h('div', { class: 'ing-cantidad' }, campo.el, unidad);
      const pintar = () => {
        const i = insumos.find((x) => x.id === select.value);
        const soloOjo = Boolean(i && alOjo(i));
        if (soloOjo) ojo.checked = true;
        ojo.disabled = soloOjo;
        cantidadEl.hidden = ojo.checked;
        if (!i || !seCuenta(i)) { unidad.textContent = ''; return; }
        const base = `${unidadDeIngreso(i)} por cada uno`;
        unidad.textContent = i.nota ? `${base} · ${i.nota}` : base;
      };
      select.addEventListener('change', pintar);
      ojo.addEventListener('change', pintar);
      pintar();
      const fila = { select, campo, ojo };
      const bloque = h('div', { class: 'ing-bloque' },
        select,
        h('div', { class: 'ing-fila' },
          cantidadEl,
          h('button', {
            type: 'button', class: 'btn btn-secundario btn-chico', 'aria-label': 'Quitar ingrediente',
            onclick: () => { filas.splice(filas.indexOf(fila), 1); bloque.remove(); }
          }, 'Quitar')),
        marcaOjo);
      filas.push(fila);
      lista.append(bloque);
      return select;
    }

    receta.ingredientes.forEach((ing) => agregar(ing));

    const revisado = h('input', { type: 'checkbox', id: 'rec-revisado', checked: true });
    const btnGuardar = h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar receta');
    async function guardar() {
      const ingredientes = [];
      for (const { select, campo, ojo } of filas) {
        if (!select.value) { aviso('Elige el ingrediente o quita esa fila.'); select.focus(); return; }
        if (ojo.checked) { ingredientes.push({ insumo_id: select.value, al_ojo: true }); continue; }
        if (!(campo.valor > 0)) { aviso('Cada ingrediente necesita una cantidad mayor que 0 o ir al ojo.'); campo.input.focus(); return; }
        ingredientes.push({ insumo_id: select.value, cantidad: campo.valor });
      }
      ocupado(btnGuardar, 'Guardando…');
      try {
        const nuevos = await Api.guardarReceta({ id: receta.id, ingredientes, revisado: receta.revisar && revisado.checked });
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
      receta.revisar && h('p', { class: 'nota' }, 'Viene del documento de la dueña: revisa los ingredientes y guarda.'),
      receta.estado === 'provisional' && h('p', { class: 'nota' }, 'Receta provisional: descuenta normal, pero falta confirmarla con cocina.'),
      h('p', { class: 'texto-suave' }, 'Lo que lleva uno. Se descuenta del inventario por cada uno vendido.'),
      insumos.length ? lista : h('p', { class: 'vacio' }, 'Primero crea los productos en Más › Productos.'),
      insumos.length && h('button', { type: 'button', class: 'btn btn-secundario btn-ancho', onclick: () => agregar(null).focus() }, '+ Agregar ingrediente'),
      receta.revisar && h('label', { class: 'campo-check', for: 'rec-revisado' }, revisado, 'Marcar como revisada'),
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
      h('nav', { class: 'lista', 'aria-label': 'Más opciones' }, ...sinVacios([
        Api.sesion.esAdmin && filaLista('#mas/productos', 'Productos', 'Nombre, alias, categoría, forma de medir y mínimo'),
        Api.sesion.esAdmin && filaLista('#mas/revision', 'Revisión inicial', 'Marca cómo está todo y anota lo que hay, de una vez'),
        filaLista('#mas/movimientos', 'Movimientos', 'Historial de compras, ventas, conteos y niveles'),
        Api.sesion.esAdmin && filaLista('#mas/ajustes', 'Ajustes', 'Contar un producto y mínimos')])),
      h('div', { class: 'lista' },
        h('button', {
          type: 'button', class: 'lista-fila',
          onclick: async (e) => {
            ocupado(e.currentTarget, 'Cerrando…');
            await Api.cerrarSesion();
            mostrarIngreso();
          }
        },
          h('span', { class: 'lista-texto' },
            h('strong', null, 'Cambiar de usuario'),
            h('span', { class: 'pequeno texto-suave' }, `Registrando como ${Api.sesion.usuario} · ${Api.sesion.rol}`)))));
  }

  // Si alguien sin rol admin abre a mano una sección de admin. El servidor igual lo rechazaría.
  function vistaSoloAdmin(main) {
    main.replaceChildren(
      volver('#hoy', 'Hoy'),
      h('h1', { class: 'titulo' }, 'Solo admin'),
      h('p', { class: 'vacio' }, 'Esto lo hace un admin.'));
  }

  // Selector de producto agrupado por categoría.
  function selectCasilla(id, insumos, vacioTexto) {
    return h('select', { class: 'campo', id },
      h('option', { value: '' }, vacioTexto),
      agruparPorCategoria([...insumos]).map(({ categoria, items }) =>
        h('optgroup', { label: categoria }, items.map((i) => h('option', { value: i.id }, i.nombre)))));
  }
  const campoConEtiqueta = (id, texto, el) => h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: id }, texto), el);

  // ---------- Movimientos: historial ----------

  const TIPOS_MOV = [['compra', 'Compra'], ['produccion_usado', 'Usado en producción'], ['produccion_salida', 'Producido'],
    ['venta', 'Venta'], ['salida_habemus', 'Salida a Habemus'], ['merma', 'Merma'], ['ajuste_conteo', 'Ajuste de conteo'],
    ['nivel', 'Nivel']];
  const filtroMov = { fecha: null, insumo_id: '', tipo: '', todo: false };

  // Un día a la vez (solo se leen las filas de ese día) o todo el historial de un producto.
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
    const casilla = selectCasilla('mov-casilla', datos.insumos, 'Todos los productos');
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
      if (m.tipo === 'nivel') return capital(String(m.nota || ''));
      const c = cantidad(Math.abs(m.cantidad), m.unidad);
      return `${m.cantidad < 0 ? '−' : '+'}${c.num} ${c.unidad}`;
    };
    const fila = (m) => {
      const detalle = sinVacios([
        filtroMov.todo && m.fecha.split('-').reverse().join('/'),
        m.hora,
        m.usuario,
        (TIPOS_MOV.find(([v]) => v === m.tipo) || [m.tipo, m.tipo])[1],
        m.precio !== '' && m.precio != null && soles(m.precio),
        m.tipo !== 'nivel' && m.nota
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
        movs.length && h('p', { class: 'pequeno texto-suave' }, 'Más recientes primero'),
        movs.length
          ? h('div', { class: 'lista-items' }, movs.map(fila))
          : h('p', { class: 'vacio' }, datos.movimientos.length ? 'Nada con esos filtros.' : 'No hay movimientos ese día.'),
        datos.total > datos.movimientos.length &&
          h('p', { class: 'pequeno texto-suave' }, `Se muestran los ${datos.movimientos.length} más recientes de ${datos.total}.`)
      ]));
    }
    casilla.addEventListener('change', () => {
      // En "todo su historial" la lista viene del servidor para ese producto: hay que volver a pedirla.
      if (filtroMov.todo) { filtroMov.insumo_id = casilla.value; render(); return; }
      pintar();
    });
    tipo.addEventListener('change', pintar);
    pintar();

    zona.replaceChildren(h('div', { class: 'formulario' },
      campoConEtiqueta('mov-casilla', 'Producto', casilla),
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
    const cuentan = insumos.filter(seCuenta);
    const porId = {};
    insumos.forEach((i) => { porId[i.id] = i; });
    const bloque = (titulo, ayuda, ...hijos) => h('section', { class: 'formulario bloque-ajuste' },
      h('h2', { class: 'subtitulo subtitulo--seccion' }, titulo),
      ayuda && h('p', { class: 'texto-suave' }, ayuda),
      ...hijos);

    // Contar un producto: entra la diferencia como ajuste de conteo.
    const selConteo = selectCasilla('aj-casilla', cuentan, 'Elige un producto…');
    const notaConteo = h('p', { class: 'pequeno texto-suave' });
    const fContado = campoNumero({ etiqueta: 'lo contado', id: 'aj-contado' });
    const motivo = h('input', { class: 'campo', id: 'aj-motivo', autocomplete: 'off', maxlength: 200, placeholder: 'por ejemplo, conteo después del cierre' });
    const pintarConteo = () => {
      const i = porId[selConteo.value];
      notaConteo.textContent = i ? `El sistema dice ${mostrarTexto(i.stock_actual, i)} · escribe lo que hay de verdad, en ${unidadDeIngreso(i)}.` : '';
    };
    selConteo.addEventListener('change', pintarConteo);
    const btnConteo = h('button', { type: 'button', class: 'btn btn-primario' }, 'Guardar conteo');
    btnConteo.addEventListener('click', () => {
      const i = porId[selConteo.value];
      const v = fContado.valor;
      if (!i) { aviso('Elige el producto que contaste.'); selConteo.focus(); return; }
      if (v == null || !Number.isFinite(v) || v < 0) { aviso('Escribe lo que contaste.'); fContado.input.focus(); return; }
      guardarAjuste(btnConteo, () => Api.ajustarStock({ insumo_id: i.id, cantidad: v, nota: motivo.value.trim() }), (r) =>
        r.diferencia
          ? `${i.nombre}: ${r.diferencia > 0 ? '+' : '−'}${cantidadTexto(Math.abs(r.diferencia), i.unidad)}`
          : `${i.nombre}: ya estaba en ${mostrarTexto(v, i)}`);
    });

    // Mínimos: solo se mandan los que cambiaron.
    const camposMinimo = [];
    let k = 0;
    const minimos = agruparPorCategoria(cuentan).map(({ categoria, items }) => grupoInsumos(categoria, items.map((i) => {
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

    zona.replaceChildren(h('div', { class: 'grupos' },
      bloque('Contar un producto', 'Solo al inicio del día o después del cierre. Si no coincide con el sistema, entra la diferencia como ajuste.',
        campoConEtiqueta('aj-casilla', 'Producto', selConteo), notaConteo,
        h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'aj-contado' }, 'Hay contado'), fContado.el),
        campoConEtiqueta('aj-motivo', 'Motivo (opcional)', motivo),
        btnConteo),
      bloque('Mínimos', 'Lo que baja de aquí pasa a Pendientes de compra. Vacío = sin mínimo.', ...minimos, btnMinimos)));
  }

  // ---------- Revisión inicial: todo en una sola lista ----------

  function vistaRevision(main) {
    const zona = h('div', null, esqueletoFilas(7));
    main.replaceChildren(
      volver('#mas', 'Más'),
      h('h1', { class: 'titulo' }, 'Revisión inicial'),
      h('p', { class: 'texto-suave' }, 'Escribe lo que hay de lo que se cuenta y marca el nivel de lo que va al ojo. Lo que dejes vacío no cambia.'),
      zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => {
      estado.insumos = insumos;
      pintarRevision(zona, insumos);
    });
  }

  function pintarRevision(zona, insumos) {
    const elegidos = new Map(); // insumo_id → nivel nuevo (solo los que cambian)
    const conNivel = (item) => {
      const selector = selectorNivel(item, item.estado_actual, (v) => {
        selector.marcar(v);
        if (v === item.estado_actual) elegidos.delete(item.id);
        else elegidos.set(item.id, v);
      });
      return filaNivel(item, selector);
    };
    const campos = [];
    let k = 0;
    const conCantidad = (item) => {
      const id = `rev-${k++}`;
      const campo = campoNumero({ etiqueta: item.nombre, id });
      campos.push({ item, campo });
      return h('div', { class: 'fila', 'data-buscar': textoBusqueda(item) },
        h('label', { class: 'fila-etiqueta', for: id }, item.nombre,
          h('span', { class: 'fila-nota' }, `ahora ${mostrarTexto(item.stock_actual, item)} · en ${unidadDeIngreso(item)}`)),
        campo.el);
    };

    const cuentan = agruparPorCategoria(insumos.filter(seCuenta));
    const ojo = agruparPorCategoria(insumos.filter(alOjo));
    const lista = h('div', { class: 'grupos' }, ...sinVacios([
      cuentan.length && h('h2', { class: 'subtitulo subtitulo--seccion' }, 'Cuánto hay'),
      ...cuentan.map(({ categoria, items }) => grupoInsumos(categoria, items.map(conCantidad))),
      ojo.length && h('h2', { class: 'subtitulo subtitulo--seccion' }, 'Al ojo'),
      ...ojo.map(({ categoria, items }) => grupoInsumos(categoria, items.map(conNivel)))
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
      const niveles = [...elegidos].map(([insumo_id, v]) => ({ insumo_id, estado: v }));
      if (!conteos.length && !niveles.length) { aviso('No cambiaste nada.'); return; }
      ocupado(btn, 'Guardando…');
      try {
        const r = await Api.guardarRevision({ conteos, niveles });
        estado.insumos = r.insumos;
        const cambios = r.ajustes + r.niveles;
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
    const admin = Api.sesion.esAdmin;

    Hoja.abrir(h('div', null,
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, 'Registrar'),
      h('div', { class: 'menu' }, ...sinVacios([
        opcion('Compras', 'Lo que entró: suma al inventario', ir('#compras')),
        admin && opcion('Ventas del día', 'Platos y bebidas: descuenta del inventario', ir('#ventas')),
        admin && opcion('Nuevo producto', 'Agregar algo nuevo al inventario', () => abrirProducto(null))
      ]))));
  }

  // ---------- ingreso: PIN personal (el nombre lo dice el servidor) ----------

  function mostrarIngreso() {
    Hoja.cerrar();
    const pantalla = document.getElementById('ingreso');
    const pin = h('input', {
      class: 'campo', id: 'ing-pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]*',
      autocomplete: 'current-password', maxlength: 6, enterkeyhint: 'go'
    });
    const error = h('p', { class: 'ingreso-error', role: 'alert' });
    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Entrar');

    async function entrar(e) {
      e.preventDefault();
      const clave = pin.value.trim();
      if (!/^\d{6}$/.test(clave)) { error.textContent = 'Tu PIN tiene 6 números.'; pin.focus(); return; }
      error.textContent = '';
      Api.sesion.olvidarPin();
      ocupado(btn, 'Entrando…');
      try {
        const quien = await Api.ingresar(clave);
        pantalla.hidden = true;
        document.getElementById('app').inert = false;
        render();
        aviso(`Hola, ${quien.nombre}`);
      } catch (err) {
        if (err && err.codigo === 'pin') {
          Api.sesion.olvidarPin();
          error.textContent = 'PIN incorrecto. Si lo olvidaste, pídele a un admin uno nuevo.';
          pin.select();
        } else if (err && err.codigo === 'bloqueado') {
          Api.sesion.olvidarPin();
          error.textContent = err.message;
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
      h('p', { class: 'texto-suave' }, 'Escribe tu PIN personal de 6 números. Este celular queda reconocido por 30 días.'),
      Api.modoDemo() && h('p', { class: 'nota' }, 'Modo demo: 111111 entra como admin y 222222 como cocina.'),
      h('form', { class: 'ingreso-form', novalidate: true, onsubmit: entrar },
        h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'ing-pin' }, 'Tu PIN'), pin),
        error,
        btn)));
    pantalla.hidden = false;
    document.getElementById('app').inert = true;
    pin.focus();
  }

  // ---------- navegación ----------

  const RUTAS = {
    hoy: vistaInicio,
    'por-comprar': vistaPorComprar,
    inventario: vistaInventario,
    compras: vistaCompras,
    ventas: vistaVentas,
    recetas: vistaRecetas,
    mas: vistaMas,
    'mas/productos': vistaProductos,
    'mas/revision': vistaRevision,
    'mas/movimientos': vistaMovimientos,
    'mas/ajustes': vistaAjustes
  };

  const RUTAS_ADMIN = ['mas/productos', 'mas/revision', 'mas/ajustes', 'ventas'];

  function rutaActual() {
    const r = location.hash.replace(/^#\/?/, '');
    return RUTAS[r] ? r : 'hoy';
  }

  function render() {
    estado.vistaId++;
    const ruta = rutaActual();
    // Compras, Ventas y Pendientes de compra se abren desde Hoy, así que la barra marca Hoy.
    const seccion = { compras: 'hoy', ventas: 'hoy', 'por-comprar': 'hoy' }[ruta] || ruta.split('/')[0];
    document.querySelectorAll('.nav-item[data-ruta]').forEach((a) => {
      const activo = a.dataset.ruta === seccion;
      a.classList.toggle('activo', activo);
      if (activo) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const vista = RUTAS_ADMIN.includes(ruta) && !Api.sesion.esAdmin ? vistaSoloAdmin : RUTAS[ruta];
    vista(document.getElementById('vista'));
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
