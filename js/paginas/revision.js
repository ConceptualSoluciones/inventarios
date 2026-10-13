/* SANTO — página: Revisión inicial (solo admin) */
(function () {
  'use strict';
  const {
    MSJ_GUARDAR, estado, h, sinVacios, cantidad, redondear, ocupado, libre, mensajeError, aviso,
    campoNumero, esqueletoFilas, cargarEn, volver, seCuenta, alOjo, mostrarTexto, unidadDeIngreso,
    agruparPorCategoria, textoBusqueda, buscador, selectorNivel, filaNivel, grupoInsumos, conCantidad
  } = Santo;

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
      const campo = campoNumero({ etiqueta: item.nombre, id
  });
      campos.push({ item, campo
  });
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
        conteos.push({ insumo_id: item.id, cantidad: redondear(v)
  });
      }
      const niveles = [...elegidos].map(([insumo_id, v]) => ({ insumo_id, estado: v }));
      if (!conteos.length && !niveles.length) { aviso('No cambiaste nada.'); return; }
      ocupado(btn, 'Guardando…');
      try {
        const r = await Api.guardarRevision({ conteos, niveles
  });
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

  Santo.pagina('mas/revision', vistaRevision, { soloAdmin: true });
})();
