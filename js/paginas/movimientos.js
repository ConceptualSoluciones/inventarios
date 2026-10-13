/* SANTO — página: Movimientos (historial) */
(function () {
  'use strict';
  const {
    h, sinVacios, soles, cantidad, esqueletoFilas, cargarEn, volver, selectorFecha, render, capital,
    selectCasilla, campoConEtiqueta
  } = Santo;

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

  Santo.pagina('mas/movimientos', vistaMovimientos);
})();
