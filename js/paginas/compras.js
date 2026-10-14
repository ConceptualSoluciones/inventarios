/* SANTO — página: Compras (por ahora, solo admin) */
(function () {
  'use strict';
  const {
    MSJ_GUARDAR, estado, h, sinVacios, soles, cantidad, parseNumero, redondear, ocupado, libre,
    mensajeError, aviso, campoNumero, esqueletoFilas, cargarEn, volver, alOjo, seCompra, textoNivel,
    mostrarTexto, unidadDeIngreso, agruparPorCategoria, textoBusqueda, buscador
  } = Santo;
  const abrirProducto = (item, opciones) => Santo.ganchos.abrirProducto(item, opciones);

  // ---------- Compras: lo que entra (suma al inventario) ----------

  function vistaCompras(main) {
    const zona = h('div', { class: 'hoy' }, esqueletoFilas(7));
    main.replaceChildren(
      volver('#hoy', 'Hoy'),
      h('h1', { class: 'titulo' }, 'Compras'),
      h('p', { class: 'texto-suave' }, 'Anota lo que entró o se compró hoy, con el precio total de cada compra. Se suma al inventario.'),
      zona);
    cargarEn(zona, Api.cargarCompras, (datos) => pintarCompras(zona, datos));
  }

  // Lo ya anotado hoy, para no anotarlo dos veces. Las anuladas se ven tachadas (se anulan desde Inventario).
  function compradoHoy(compras) {
    if (!compras.length) return null;
    return h('section', { class: 'grupo' },
      h('h2', { class: 'subtitulo' }, 'Ya anotado hoy'),
      h('div', { class: 'lista-items' }, compras.map((c) => {
        const m = cantidad(c.cantidad, c.unidad);
        return h('div', { class: 'fila' + (c.anulada ? ' fila--anulada' : '') },
          h('span', { class: 'fila-etiqueta' }, c.nombre,
            h('span', { class: 'fila-nota' }, sinVacios([
              c.hora, c.usuario, c.precio !== '' ? soles(c.precio) : 'sin precio', c.anulada && 'anulada'
            ]).join(' · '))),
          h('span', { class: 'valor' }, '+' + m.num, h('span', { class: 'valor-unidad' }, m.unidad)));
      })));
  }

  // Al final: lo gastado hoy (sin las anuladas) y cuántas compras quedaron sin precio.
  function totalDelDia(compras) {
    const validas = compras.filter((c) => !c.anulada);
    const sinPrecio = validas.filter((c) => c.precio === '').length;
    const total = validas.reduce((s, c) => s + (c.precio === '' ? 0 : c.precio), 0);
    return h('section', { class: 'total-dia', 'aria-labelledby': 'total-dia-titulo' },
      h('div', { class: 'fila' },
        h('h2', { class: 'fila-etiqueta', id: 'total-dia-titulo' }, 'Total gastado hoy'),
        h('span', { class: 'valor', id: 'total-dia' }, soles(total))),
      sinPrecio > 0 && h('p', { class: 'nota nota--alerta' },
        `${sinPrecio === 1 ? '1 compra no tiene' : `${sinPrecio} compras no tienen`} precio. ` +
        'Para completarla: anúlala en Inventario (toca el producto) y vuelve a anotarla con su precio.'));
  }

  // borrador: lo escrito antes de crear un producto nuevo ({ buscar, valores: { insumo_id: { cantidad, precio } } }),
  // para que no se pierda al volver a pintar la lista con el producto nuevo.
  function pintarCompras(zona, datos, borrador) {
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
            h('label', { class: 'fila-nota', for: `${id}-p` }, 'Precio total S/'), precio);
          const campo = campoNumero({
            etiqueta: insumo.nombre, id,
            alCambiar: (v) => { filaPrecio.hidden = !(v > 0); }
          });
          campos.push({ insumo, campo, precio
  });
          const previo = borrador && borrador.valores[insumo.id];
          if (previo) {
            campo.input.value = previo.cantidad;
            precio.value = previo.precio;
            filaPrecio.hidden = !(campo.valor > 0);
          }
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

    // Si el buscador no encuentra nada: crear el producto ahí mismo (queda como comprado) y volver a Compras.
    const busca = buscador(lista, 'buscar-compras');
    const noEsta = h('div', { class: 'vacio no-esta', hidden: true },
      h('p', null, '¿No está?'),
      h('button', { type: 'button', class: 'btn btn-secundario', onclick: crearProducto }, 'Crear producto'));
    busca.addEventListener('input', () => {
      noEsta.hidden = !busca.value.trim() || Boolean(lista.querySelector('[data-buscar]:not([hidden])'));
    });
    function crearProducto() {
      const valores = {};
      campos.forEach(({ insumo, campo, precio }) => {
        if (campo.input.value || precio.value) valores[insumo.id] = { cantidad: campo.input.value, precio: precio.value };
      });
      const texto = busca.value.trim();
      abrirProducto(null, {
        nombre: texto.charAt(0).toUpperCase() + texto.slice(1),
        origen: 'comprado',
        alGuardar: (insumos, id) => {
          const nuevo = insumos.find((i) => i.id === id);
          pintarCompras(zona, { ...datos, insumos }, { buscar: nuevo ? nuevo.nombre : texto, valores });
        }
      });
    }

    zona.replaceChildren(...sinVacios([
      compradoHoy(datos.compras),
      busca,
      noEsta,
      lista,
      h('div', { class: 'pie-accion' }, btn),
      totalDelDia(datos.compras)
    ]));
    if (borrador && borrador.buscar) {
      busca.value = borrador.buscar;
      busca.dispatchEvent(new Event('input'));
    }
  }

  Santo.pagina('compras', vistaCompras, { soloAdmin: true, seccion: 'hoy' });
})();
