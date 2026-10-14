/* SANTO — página: Inventario (para ver; al tocar un producto, su historial. Un admin puede anular compras ahí) */
(function () {
  'use strict';
  const {
    MSJ_GUARDAR, estado, h, sinVacios, soles, cantidad, esqueletoFilas, cargarEn, abrirProducto, seCuenta,
    alOjo, mostrar, mostrarTexto, agruparPorCategoria, sinTildes, textoBusqueda, buscador, bajoMinimo, negativo,
    filaNivelVer, grupoInsumos, ocupado, libre, mensajeError, aviso, Hoja, errorCarga, render, capital, textoNivel
  } = Santo;

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
      const filas = items.map((i) => tocable(filaNivelVer(i), i));
      if (categoria !== 'Insumos y condimentos') return grupoInsumos(categoria, filas);
      // Es la lista más larga y se usa menos: va plegada.
      return h('details', { class: 'grupo plegable' },
        h('summary', { class: 'subtitulo' }, `Insumos y condimentos (${items.length})`),
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
          return tocable(h('li', { class: 'grafica-fila' + (bajo ? ' grafica-fila--bajo' : ''), 'data-buscar': textoBusqueda(i) },
            h('span', { class: 'grafica-nombre' }, i.nombre),
            h('span', { class: 'grafica-pista', 'aria-hidden': 'true' },
              h('span', { class: 'grafica-barra', style: `width:${Math.max(0, (i.stock_actual / max) * 100)}%` }),
              i.stock_minimo > 0 && h('span', { class: 'grafica-minimo', style: `left:${(i.stock_minimo / max) * 100}%` })),
            h('span', { class: 'grafica-valor' },
              h('span', { class: 'grafica-num' },
                bajo && h('span', { class: 'punto', 'aria-hidden': 'true' }),
                h('strong', null, m.num),
                h('span', { class: 'valor-unidad' }, m.unidad)),
              bajo && h('span', { class: 'solo-lector' }, negativo(i) ? ', quedó en negativo' : `, bajo el mínimo de ${mostrarTexto(i.stock_minimo, i)}`))), i);
        })));
    });
  }

  // ---------- historial de un producto (y anular compras, solo admin) ----------

  // Cada fila se puede tocar (o Enter / espacio) para ver el historial del producto.
  function tocable(el, item) {
    el.classList.add('tocable');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `${item.nombre}: ver su historial`);
    el.addEventListener('click', () => abrirHistorial(item));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirHistorial(item); }
    });
    return el;
  }

  const TIPOS = {
    compra: 'Compra', compra_anulada: 'Compra anulada', produccion_usado: 'Usado en producción', produccion_salida: 'Producido',
    venta: 'Venta', salida_habemus: 'Salida a Habemus', merma: 'Merma', ajuste_conteo: 'Ajuste de conteo', nivel: 'Nivel'
  };
  const anulada = (m) => String(m.origen).indexOf('anulada:') === 0;

  function abrirHistorial(item) {
    const zona = h('div', null, esqueletoFilas(4));
    Hoja.abrir(h('div', { class: 'formulario' },
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, item.nombre),
      h('p', { class: 'texto-suave' }, alOjo(item) ? `Está en ${textoNivel(item.estado_actual)}` : `Hay ahora: ${mostrarTexto(item.stock_actual, item)}`),
      zona));
    cargarHistorial(zona, item);
  }

  async function cargarHistorial(zona, item) {
    zona.setAttribute('aria-busy', 'true');
    try {
      const datos = await Api.cargarMovimientos({ insumo_id: item.id });
      zona.removeAttribute('aria-busy');
      pintarHistorial(zona, item, datos);
    } catch (err) {
      zona.removeAttribute('aria-busy');
      zona.replaceChildren(errorCarga(err, () => cargarHistorial(zona, item)));
    }
  }

  function pintarHistorial(zona, item, datos) {
    const valor = (m) => {
      if (m.tipo === 'nivel') return capital(String(m.nota || ''));
      const c = cantidad(Math.abs(m.cantidad), m.unidad);
      return `${m.cantidad < 0 ? '−' : '+'}${c.num} ${c.unidad}`;
    };
    const fila = (m) => {
      const detalle = sinVacios([
        m.fecha.split('-').reverse().join('/'), m.hora, m.usuario,
        m.tipo === 'compra' && (m.precio !== '' ? soles(m.precio) : 'sin precio'),
        m.tipo === 'compra' && anulada(m) && 'anulada',
        m.tipo !== 'nivel' && m.nota
      ]).join(' · ');
      const el = h('div', { class: 'historial-mov' + (anulada(m) ? ' fila--anulada' : '') },
        h('div', { class: 'fila' },
          h('span', { class: 'fila-etiqueta' }, TIPOS[m.tipo] || m.tipo, h('span', { class: 'fila-nota' }, detalle)),
          h('span', { class: 'mov-valor' + (m.cantidad < 0 ? ' mov-valor--resta' : '') }, valor(m))));
      if (Api.sesion.esAdmin && m.tipo === 'compra' && !anulada(m)) el.append(botonAnular(m, item, zona));
      return el;
    };
    zona.replaceChildren(...sinVacios([
      datos.movimientos.length
        ? h('div', { class: 'lista-items' }, datos.movimientos.map(fila))
        : h('p', { class: 'vacio' }, 'Todavía no tiene movimientos.'),
      datos.total > datos.movimientos.length &&
        h('p', { class: 'pequeno texto-suave' }, `Se muestran los ${datos.movimientos.length} más recientes de ${datos.total}.`)
    ]));
  }

  // "Anular" pide el motivo (obligatorio). No borra la compra: la revierte y la deja marcada como anulada.
  function botonAnular(m, item, zona) {
    const caja = h('div', { class: 'anular' });
    const abrir = h('button', { type: 'button', class: 'btn btn-secundario btn-chico' }, 'Anular');
    caja.append(abrir);
    abrir.addEventListener('click', () => {
      const id = `anular-${m.id}`;
      const motivo = h('input', { class: 'campo', id, autocomplete: 'off', maxlength: 200, placeholder: 'por ejemplo, se anotó dos veces' });
      const confirmar = h('button', { type: 'button', class: 'btn btn-primario' }, 'Anular compra');
      const cancelar = h('button', { type: 'button', class: 'btn btn-secundario', onclick: () => caja.replaceChildren(abrir) }, 'Cancelar');
      confirmar.addEventListener('click', async () => {
        if (!motivo.value.trim()) { aviso('Escribe el motivo de la anulación.'); motivo.focus(); return; }
        ocupado(confirmar, 'Anulando…');
        try {
          const r = await Api.anularCompra({ id: m.id, nota: motivo.value.trim() });
          estado.insumos = r.insumos;
          aviso(`Compra anulada: ${item.nombre}`);
          render();
          cargarHistorial(zona, item);
        } catch (err) {
          aviso(mensajeError(err, MSJ_GUARDAR));
          libre(confirmar);
        }
      });
      caja.replaceChildren(
        h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: id }, 'Motivo (obligatorio)'), motivo),
        h('p', { class: 'pequeno texto-suave' }, 'Se resta lo que sumó esta compra y deja de contar en el total del día. Para corregir una cantidad: anula y vuelve a anotarla.'),
        confirmar, cancelar);
      motivo.focus();
    });
    return caja;
  }

  Santo.pagina('inventario', vistaInventario);
})();
