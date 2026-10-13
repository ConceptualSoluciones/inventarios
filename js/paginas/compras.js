/* SANTO — página: Compras */
(function () {
  'use strict';
  const {
    MSJ_GUARDAR, estado, h, sinVacios, soles, cantidad, parseNumero, redondear, ocupado, libre,
    mensajeError, aviso, campoNumero, esqueletoFilas, cargarEn, volver, alOjo, seCompra, textoNivel,
    mostrarTexto, unidadDeIngreso, agruparPorCategoria, textoBusqueda, buscador
  } = Santo;

  // ---------- Compras: lo que entra (suma al inventario) ----------

  function vistaCompras(main) {
    const zona = h('div', { class: 'hoy' }, esqueletoFilas(7));
    main.replaceChildren(
      volver('#hoy', 'Hoy'),
      h('h1', { class: 'titulo' }, 'Compras'),
      h('p', { class: 'texto-suave' }, 'Anota lo que entró o se compró hoy. Se suma al inventario. El precio total es opcional.'),
      zona);
    cargarEn(zona, Api.cargarCompras, (datos) => pintarCompras(zona, datos));
  }

  // Lo ya anotado hoy, para no anotarlo dos veces.
  function compradoHoy(compras) {
    if (!compras.length) return null;
    const conPrecio = compras.filter((c) => c.precio !== '');
    const total = conPrecio.reduce((s, c) => s + c.precio, 0);
    return h('section', { class: 'grupo' },
      h('h2', { class: 'subtitulo' }, 'Ya anotado hoy'),
      h('div', { class: 'lista-items' }, compras.map((c) => {
        const m = cantidad(c.cantidad, c.unidad);
        return h('div', { class: 'fila' },
          h('span', { class: 'fila-etiqueta' }, c.nombre,
            h('span', { class: 'fila-nota' }, sinVacios([c.hora, c.usuario, c.precio !== '' && soles(c.precio)]).join(' · '))),
          h('span', { class: 'valor' }, '+' + m.num, h('span', { class: 'valor-unidad' }, m.unidad)));
      })),
      conPrecio.length > 0 && h('p', { class: 'pequeno texto-suave' },
        `Total con precio: ${soles(total)}` + (conPrecio.length < compras.length ? ' (hay compras sin precio)' : '')));
  }

  function pintarCompras(zona, datos) {
    estado.insumos = datos.insumos;
    const insumos = datos.insumos.filter(seCompra);
    if (!insumos.length) {
      zona.replaceChildren(h('p', { class: 'vacio' }, 'Todavía no hay productos comprados.'));
      return;
    }
    const campos = [];
    let k = 0;
    // Cada producto: la cantidad y, cuando se escribe algo, el precio total (opcional).
    const lista = h('div', { class: 'grupos' }, agruparPorCategoria(insumos).map(({ categoria, items }) =>
      h('section', { class: 'grupo', 'data-grupo': '' },
        h('h2', { class: 'subtitulo' }, categoria),
        h('div', { class: 'lista-items' }, items.map((insumo) => {
          const id = `com-${k++}`;
          const precio = h('input', {
            class: 'campo campo-precio', id: `${id}-p`, type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done'
          });
          const filaPrecio = h('div', { class: 'fila-precio', hidden: true },
            h('label', { class: 'fila-nota', for: `${id}-p` }, 'Precio total S/ (opcional)'), precio);
          const campo = campoNumero({
            etiqueta: insumo.nombre, id,
            alCambiar: (v) => { filaPrecio.hidden = !(v > 0); }
          });
          campos.push({ insumo, campo, precio
  });
          const nota = alOjo(insumo)
            ? `va al ojo: está en ${textoNivel(insumo.estado_actual)} · al comprar queda en ${textoNivel('lleno')}`
            : `hay ${mostrarTexto(insumo.stock_actual, insumo)} · ${insumo.unidad === 'g' ? 'en gramos (1 kg = 1000)' : `en ${unidadDeIngreso(insumo)}`}`;
          return h('div', { class: 'compra', 'data-buscar': textoBusqueda(insumo) },
            h('div', { class: 'fila' },
              h('label', { class: 'fila-etiqueta', for: id }, insumo.nombre,
                h('span', { class: 'fila-nota' }, nota)),
              campo.el),
            filaPrecio);
        })))));

    const btn = h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar compras');
    async function guardar() {
      const compras = [];
      for (const { insumo, campo, precio } of campos) {
        const v = campo.valor;
        if (v == null || v === 0) continue;
        if (!Number.isFinite(v) || v < 0) { aviso(`Revisa ${insumo.nombre}: tiene que ser un número.`); campo.input.focus(); return; }
        const p = parseNumero(precio.value);
        if (p != null && (!Number.isFinite(p) || p < 0)) { aviso(`Revisa el precio de ${insumo.nombre}: tiene que ser un número.`); precio.focus(); return; }
        compras.push({ insumo_id: insumo.id, cantidad: redondear(v), precio: p == null ? '' : redondear(p)
  });
      }
      if (!compras.length) { aviso('Escribe cuánto entró de al menos un producto.'); return; }
      ocupado(btn, 'Guardando…');
      try {
        const r = await Api.registrarCompras({ compras
  });
        pintarCompras(zona, r);
        window.scrollTo(0, 0);
        aviso(r.guardadas === 1 ? 'Guardado: 1 producto' : `Guardado: ${r.guardadas} productos`);
      } catch (err) {
        // No se limpia nada: los números escritos siguen ahí.
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }

    zona.replaceChildren(...sinVacios([
      compradoHoy(datos.compras),
      buscador(lista, 'buscar-compras'),
      lista,
      h('div', { class: 'pie-accion' }, btn)
    ]));
  }

  Santo.pagina('compras', vistaCompras, { seccion: 'hoy' });
})();
