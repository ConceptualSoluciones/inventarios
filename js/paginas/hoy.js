/* SANTO — página: Hoy (el día en tres pasos y lo que falta hacer) */
(function () {
  'use strict';
  const {
    estado, h, sinVacios, porNombre, fechaLarga, ilustracion, cargarEn, seCuenta, mostrarTexto,
    negativo, porComprar
  } = Santo;

  // ---------- Hoy: el día en tres pasos + lo que falta hacer ----------

  // Apertura → Producción → Cierre. El cierre lo hace un admin: cocina lo ve, pero no lo abre.
  // Las compras, por ahora, también son de admin: cocina no ve ese paso.
  const PASOS = [
    { id: 'compras', nombre: 'Compras', etiqueta: '1 · apertura', color: 'navy', ilustracion: 'compras', href: '#compras', oculto: true },
    { id: 'produccion', nombre: 'Producción', etiqueta: '2 · en cocina', color: 'olive', ilustracion: 'produccion', href: '#produccion' },
    { id: 'cierre', nombre: 'Cierre', etiqueta: '3 · en la noche', color: 'sand', ilustracion: 'cierre', href: '#ventas', soloAdmin: true }
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
    if (paso.id === 'produccion') {
      return dia.produccion ? `Salió: ${dia.produccion} ${dia.produccion === 1 ? 'producto' : 'productos'}` : 'Todavía no se anotó nada';
    }
    if (!Api.sesion.esAdmin) return dia.cierre ? 'Hecho · lo hace un admin' : 'Lo hace un admin';
    return dia.cierre ? 'Hecho' : 'Pendiente';
  }

  // ---------- Hoy: menú principal y notificaciones ----------

  function vistaInicio(main) {
    // oculto: solo admin lo ve (soloAdmin: lo ven todos, pero solo admin lo abre).
    const visibles = PASOS.filter((p) => !p.oculto || Api.sesion.esAdmin);
    const pasos = h('nav', { class: 'pills', 'aria-label': 'El día' }, visibles.map((p) => pildoraPaso(p, '')));
    const alertas = h('div');
    main.replaceChildren(
      h('h1', { class: 'titulo' }, 'Hoy'),
      h('p', { class: 'fecha-larga' }, fechaLarga(Api.hoyLima())),
      pasos,
      alertas);
    cargarEn(alertas, Api.cargarHoy, ({ insumos, dia }) => {
      estado.insumos = insumos;
      pasos.replaceChildren(...visibles.map((p) => pildoraPaso(p, textoPaso(p, dia))));
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
    // Las compras las anota un admin: a cocina el aviso la lleva al Inventario.
    const items = [
      ...revisar.map((i) => fila(Api.sesion.esAdmin ? '#compras' : '#inventario', ['Revisar ', h('strong', null, i.nombre),
        `: quedó en ${mostrarTexto(i.stock_actual, i)} · falta anotar lo que entró`])),
      pc.length && fila('#por-comprar', [h('strong', null, `Pendientes de compra: ${pc.length}`), ` · ${detalle}`])
    ].filter(Boolean);
    cont.replaceChildren(items.length
      ? h('section', { class: 'alertas', 'aria-labelledby': 'alertas-titulo' },
          h('h2', { class: 'subtitulo', id: 'alertas-titulo' }, 'Lo que falta hacer'),
          h('ul', null, items))
      : h('p', { class: 'nota' }, 'Todo en orden.'));
  }

  Santo.pagina('hoy', vistaInicio);
})();
