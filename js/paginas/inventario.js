/* SANTO — página: Inventario (solo para ver) */
(function () {
  'use strict';
  const {
    estado, h, sinVacios, esqueletoFilas, cargarEn, abrirProducto, seCuenta, alOjo, mostrar,
    mostrarTexto, agruparPorCategoria, sinTildes, textoBusqueda, buscador, bajoMinimo, negativo,
    filaNivelVer, grupoInsumos
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

  Santo.pagina('inventario', vistaInventario);
})();
