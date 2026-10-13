/* SANTO — página: Cierre (por ahora, las ventas del día; solo admin) */
(function () {
  'use strict';
  const {
    MSJ_GUARDAR, estado, h, sinVacios, cantidad, redondear, porNombre, ocupado, libre, mensajeError,
    aviso, Hoja, campoNumero, esqueletoFilas, cargarEn, volver, selectorFecha, render, seCuenta,
    mostrar, agruparRecetas, conCantidad, pastillasReceta
  } = Santo;

  // ---------- Ventas: platos y bebidas que salen (descuenta del inventario) ----------

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

  function pintarVentas(zona, datos) {
    const insumos = {};
    datos.insumos.forEach((i) => { insumos[i.id] = i;
  });

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
        ingredientes.forEach((ing) => { descuentos[ing.insumo_id] = (descuentos[ing.insumo_id] || 0) + ing.cantidad * n;
  });
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
          const res = await Api.guardarVentas({ fecha: datos.fecha, ventas
  });
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

  Santo.pagina('ventas', vistaVentas, { soloAdmin: true, seccion: 'hoy' });
})();
