/* SANTO — página: Ajustes (solo admin) */
(function () {
  'use strict';
  const {
    MSJ_GUARDAR, estado, h, cantidad, cantidadTexto, ocupado, libre, mensajeError, aviso, campoNumero,
    esqueletoFilas, cargarEn, volver, render, seCuenta, mostrarTexto, unidadDeIngreso,
    agruparPorCategoria, grupoInsumos, selectCasilla, campoConEtiqueta
  } = Santo;

  // ---------- Ajustes ----------

  function vistaAjustes(main) {
    const zona = h('div', null, esqueletoFilas(6));
    main.replaceChildren(volver('#mas', 'Más'), h('h1', { class: 'titulo' }, 'Ajustes'), zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => {
      estado.insumos = insumos;
      pintarAjustes(zona, insumos);
    });
  }

  // Cada bloque guarda por su cuenta y después recarga la pantalla con los datos nuevos.
  async function guardarAjuste(btn, pedir, mensaje) {
    ocupado(btn, 'Guardando…');
    try {
      const r = await pedir();
      aviso(mensaje(r));
      render();
    } catch (err) {
      aviso(mensajeError(err, MSJ_GUARDAR));
      libre(btn);
    }
  }

  function pintarAjustes(zona, insumos) {
    const cuentan = insumos.filter(seCuenta);
    const porId = {};
    insumos.forEach((i) => { porId[i.id] = i;
  });
    const bloque = (titulo, ayuda, ...hijos) => h('section', { class: 'formulario bloque-ajuste' },
      h('h2', { class: 'subtitulo subtitulo--seccion' }, titulo),
      ayuda && h('p', { class: 'texto-suave' }, ayuda),
      ...hijos);

    // Contar un producto: entra la diferencia como ajuste de conteo.
    const selConteo = selectCasilla('aj-casilla', cuentan, 'Elige un producto…');
    const notaConteo = h('p', { class: 'pequeno texto-suave'
  });
    const fContado = campoNumero({ etiqueta: 'lo contado', id: 'aj-contado'
  });
    const motivo = h('input', { class: 'campo', id: 'aj-motivo', autocomplete: 'off', maxlength: 200, placeholder: 'por ejemplo, conteo después del cierre'
  });
    const pintarConteo = () => {
      const i = porId[selConteo.value];
      notaConteo.textContent = i ? `El sistema dice ${mostrarTexto(i.stock_actual, i)} · escribe lo que hay de verdad, en ${unidadDeIngreso(i)}.` : '';
    };
    selConteo.addEventListener('change', pintarConteo);
    const btnConteo = h('button', { type: 'button', class: 'btn btn-primario' }, 'Guardar conteo');
    btnConteo.addEventListener('click', () => {
      const i = porId[selConteo.value];
      const v = fContado.valor;
      if (!i) { aviso('Elige el producto que contaste.'); selConteo.focus(); return; }
      if (v == null || !Number.isFinite(v) || v < 0) { aviso('Escribe lo que contaste.'); fContado.input.focus(); return; }
      guardarAjuste(btnConteo, () => Api.ajustarStock({ insumo_id: i.id, cantidad: v, nota: motivo.value.trim() }), (r) =>
        r.diferencia
          ? `${i.nombre}: ${r.diferencia > 0 ? '+' : '−'}${cantidadTexto(Math.abs(r.diferencia), i.unidad)}`
          : `${i.nombre}: ya estaba en ${mostrarTexto(v, i)}`);
    });

    // Mínimos: solo se mandan los que cambiaron.
    const camposMinimo = [];
    let k = 0;
    const minimos = agruparPorCategoria(cuentan).map(({ categoria, items }) => grupoInsumos(categoria, items.map((i) => {
      const id = `aj-min-${k++}`;
      const campo = campoNumero({ valor: i.stock_minimo || null, etiqueta: `el mínimo de ${i.nombre}`, id
  });
      camposMinimo.push({ i, campo
  });
      return h('div', { class: 'fila' },
        h('label', { class: 'fila-etiqueta', for: id }, i.nombre,
          h('span', { class: 'fila-nota' }, `hay ${mostrarTexto(i.stock_actual, i)} · en ${unidadDeIngreso(i)}`)),
        campo.el);
    })));
    const btnMinimos = h('button', { type: 'button', class: 'btn btn-primario' }, 'Guardar mínimos');
    btnMinimos.addEventListener('click', () => {
      const cambios = [];
      for (const { i, campo } of camposMinimo) {
        const v = campo.valor;
        if (v != null && (!Number.isFinite(v) || v < 0)) { aviso(`Revisa ${i.nombre}: tiene que ser un número.`); campo.input.focus(); return; }
        if ((v || 0) !== (i.stock_minimo || 0)) cambios.push({ insumo_id: i.id, minimo: v || 0
  });
      }
      if (!cambios.length) { aviso('No cambiaste ningún mínimo.'); return; }
      guardarAjuste(btnMinimos, () => Api.guardarMinimos({ minimos: cambios }), (r) =>
        r.guardados === 1 ? 'Mínimo guardado' : `${r.guardados} mínimos guardados`);
    });

    zona.replaceChildren(h('div', { class: 'grupos' },
      bloque('Contar un producto', 'Solo al inicio del día o después del cierre. Si no coincide con el sistema, entra la diferencia como ajuste.',
        campoConEtiqueta('aj-casilla', 'Producto', selConteo), notaConteo,
        h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'aj-contado' }, 'Hay contado'), fContado.el),
        campoConEtiqueta('aj-motivo', 'Motivo (opcional)', motivo),
        btnConteo),
      bloque('Mínimos', 'Lo que baja de aquí pasa a Pendientes de compra. Vacío = sin mínimo.', ...minimos, btnMinimos)));
  }

  Santo.pagina('mas/ajustes', vistaAjustes, { soloAdmin: true });
})();
