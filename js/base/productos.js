/* SANTO — piezas comunes de productos: formas de medir, niveles al ojo, grupos y buscador */
(function () {
  'use strict';
  const {
    estado, h, unidadPlural, cantidad, porNombre
  } = Santo;

  // ---------- productos: formas de medir, grupos y buscador ----------

  // unidad · gramos · presentacion (lo producido: porción, jarra…) tienen stock.
  // ojo: salsas, aderezos y verduras que solo se marcan por nivel (Lleno · Medio · Bajo · Vacío).
  const FORMAS_MEDIR = [['unidad', 'Por unidad'], ['gramos', 'Por gramos'],
    ['presentacion', 'Por porción o presentación'], ['ojo', 'Al ojo (lleno · medio · bajo · vacío)']];
  const seCuenta = (i) => i.medicion !== 'ojo';
  const alOjo = (i) => i.medicion === 'ojo';
  // Origen: lo comprado aparece en Compras (aunque vaya al ojo); lo hecho en casa sale de Producción.
  const seCompra = (i) => i.origen === 'comprado';
  const seHaceEnCasa = (i) => i.origen === 'hecho_en_casa';
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
    insumos.forEach((i) => { (grupos[i.categoria || 'Otros'] = grupos[i.categoria || 'Otros'] || []).push(i);
  });
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
        contenedor.querySelectorAll('[data-buscar]').forEach((el) => { el.hidden = Boolean(q) && !el.dataset.buscar.includes(q);
  });
        contenedor.querySelectorAll('[data-grupo]').forEach((g) => { g.hidden = !g.querySelector('[data-buscar]:not([hidden])');
  });
      }
    });
    return input;
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

  const pastillaRevisar = () => h('span', { class: 'etiqueta-estado etiqueta-estado--suave' }, 'Por revisar');

  // Selector de producto agrupado por categoría.
  function selectCasilla(id, insumos, vacioTexto) {
    return h('select', { class: 'campo', id },
      h('option', { value: '' }, vacioTexto),
      agruparPorCategoria([...insumos]).map(({ categoria, items }) =>
        h('optgroup', { label: categoria }, items.map((i) => h('option', { value: i.id }, i.nombre)))));
  }
  const campoConEtiqueta = (id, texto, el) => h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: id }, texto), el);

  Object.assign(Santo, {
    FORMAS_MEDIR, seCuenta, alOjo, seCompra, seHaceEnCasa, NIVELES, NIVELES_ALERTA, EMOJI_NIVEL,
    textoNivel, capital, mostrar, mostrarTexto, unidadDeIngreso, ORDEN_CATEGORIAS, agruparPorCategoria,
    TILDES, sinTildes, textoBusqueda, buscador, bajoMinimo, negativo, nivelBajo, porComprar,
    selectorNivel, filaNivel, filaNivelVer, grupoInsumos, pastillaRevisar, selectCasilla,
    campoConEtiqueta
  });
})();
