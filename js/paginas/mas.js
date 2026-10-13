/* SANTO — página: Más */
(function () {
  'use strict';
  const {
    CHEVRON, h, sinVacios, ocupado, mostrarIngreso
  } = Santo;

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

  Santo.pagina('mas', vistaMas);
})();
