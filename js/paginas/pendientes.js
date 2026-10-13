/* SANTO — página: Pendientes de compra */
(function () {
  'use strict';
  const {
    estado, h, esqueletoFilas, cargarEn, volver, alOjo, textoNivel, mostrarTexto, agruparPorCategoria,
    porComprar, grupoInsumos
  } = Santo;

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

  Santo.pagina('por-comprar', vistaPorComprar, { seccion: 'hoy' });
})();
