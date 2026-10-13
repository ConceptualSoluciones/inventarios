/* SANTO — navegación: abre la página que pide la dirección (#compras, #produccion…), el menú del botón +
   y el aviso "Solo admin". Las páginas viven en js/paginas/ y se registran solas con Santo.pagina(). */
(function () {
  'use strict';
  const { estado, h, sinVacios, Hoja, volver, mostrarIngreso, abrirProducto } = Santo;

  // Si alguien sin rol admin abre a mano una sección de admin. El servidor igual lo rechazaría.
  function vistaSoloAdmin(main) {
    main.replaceChildren(
      volver('#hoy', 'Hoy'),
      h('h1', { class: 'titulo' }, 'Solo admin'),
      h('p', { class: 'vacio' }, 'Esto lo hace un admin.'));
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
        opcion('Producción', 'Lo que usé y lo que salió', ir('#produccion')),
        admin && opcion('Ventas del día', 'Platos y bebidas: descuenta del inventario', ir('#ventas')),
        admin && opcion('Nuevo producto', 'Agregar algo nuevo al inventario', () => abrirProducto(null))
      ]))));
  }

  // ---------- navegación ----------

  function rutaActual() {
    const r = location.hash.replace(/^#\/?/, '');
    return Santo.paginas[r] ? r : 'hoy';
  }

  function render() {
    estado.vistaId++;
    const ruta = rutaActual();
    const pagina = Santo.paginas[ruta];
    // La barra de abajo marca la sección de la página (Compras, Producción y Cierre marcan Hoy).
    document.querySelectorAll('.nav-item[data-ruta]').forEach((a) => {
      const activo = a.dataset.ruta === pagina.seccion;
      a.classList.toggle('activo', activo);
      if (activo) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const vista = pagina.soloAdmin && !Api.sesion.esAdmin ? vistaSoloAdmin : pagina.vista;
    vista(document.getElementById('vista'));
  }
  Santo.ganchos.render = render;

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
