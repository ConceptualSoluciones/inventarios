/* SANTO — página: Productos (solo admin) */
(function () {
  'use strict';
  const {
    MSJ_GUARDAR, CHEVRON, estado, h, sinVacios, cantidad, ocupado, libre, mensajeError, aviso, Hoja,
    campoNumero, esqueletoFilas, cargarEn, volver, render, FORMAS_MEDIR, seCuenta, alOjo, mostrarTexto,
    unidadDeIngreso, ORDEN_CATEGORIAS, agruparPorCategoria, textoBusqueda, buscador, pastillaRevisar
  } = Santo;

  // ---------- Productos (solo admin): nombre, alias, categoría, forma de medir, unidad y mínimo ----------

  function vistaProductos(main) {
    const zona = h('div', { class: 'hoy' }, esqueletoFilas(7));
    main.replaceChildren(
      volver('#mas', 'Más'),
      h('div', { class: 'titulo-fila' },
        h('h1', { class: 'titulo' }, 'Productos'),
        h('button', { type: 'button', class: 'btn btn-secundario btn-chico', onclick: () => abrirProducto(null) }, '+ Nuevo producto')),
      zona);
    cargarEn(zona, Api.cargarInventario, ({ insumos }) => pintarProductos(zona, insumos));
  }

  function resumenProducto(i) {
    return sinVacios([
      i.origen === 'hecho_en_casa' ? 'hecho en casa' : 'comprado',
      alOjo(i) ? 'al ojo' : i.medicion === 'gramos' ? 'por gramos' : `por ${i.unidad}`,
      i.stock_minimo > 0 && `mínimo ${mostrarTexto(i.stock_minimo, i)}`,
      i.alias && `alias: ${i.alias}`,
      i.nota
    ]).join(' · ');
  }

  function pintarProductos(zona, insumos) {
    estado.insumos = insumos;
    const porRevisar = insumos.filter((i) => i.revisar).length;
    const lista = h('div', { class: 'grupos' }, agruparPorCategoria([...insumos]).map(({ categoria, items }) =>
      h('section', { class: 'grupo', 'data-grupo': '' },
        h('h2', { class: 'subtitulo' }, categoria),
        h('div', { class: 'lista' }, items.map((i) =>
          h('button', { type: 'button', class: 'lista-fila', 'data-buscar': textoBusqueda(i), onclick: () => abrirProducto(i) },
            h('span', { class: 'lista-texto' },
              h('strong', null, i.nombre),
              i.revisar && pastillaRevisar(),
              h('span', { class: 'pequeno texto-suave' }, resumenProducto(i))),
            h('span', { html: CHEVRON })))))));
    zona.replaceChildren(...sinVacios([
      porRevisar > 0 && h('p', { class: 'nota' }, porRevisar === 1
        ? 'Queda 1 producto por revisar: ábrelo, corrige lo que haga falta y guarda.'
        : `Quedan ${porRevisar} productos por revisar: vienen del documento de la dueña. Ábrelos, corrige lo que haga falta y guarda.`),
      insumos.length ? buscador(lista, 'buscar-productos') : h('p', { class: 'vacio' }, 'Todavía no hay productos.'),
      lista
    ]));
  }

  // Crear (item = null) o editar un producto.
  function abrirProducto(item) {
    const nuevo = !item;
    const p = item || { nombre: '', alias: '', categoria: '', medicion: 'unidad', unidad: '', stock_minimo: 0, nota: '' };
    const categorias = [...new Set([...ORDEN_CATEGORIAS, ...(estado.insumos || []).map((i) => i.categoria)])].filter(Boolean);
    const input = (id, valor, attrs) => {
      const el = h('input', { class: 'campo', id, autocomplete: 'off', ...attrs
  });
      el.value = valor || '';
      return el;
    };
    const nombre = input('pr-nombre', p.nombre, { maxlength: 40
  });
    const alias = input('pr-alias', p.alias, { maxlength: 120, placeholder: 'por ejemplo, chancho, chicharrón'
  });
    const categoria = h('select', { class: 'campo', id: 'pr-categoria' },
      categorias.map((c) => h('option', { value: c }, c)), h('option', { value: '' }, 'Otra…'));
    categoria.value = p.categoria || categorias[0];
    const otraCategoria = input('pr-otra', '', { maxlength: 30
  });
    const medicion = h('select', { class: 'campo', id: 'pr-medicion' }, FORMAS_MEDIR.map(([v, t]) => h('option', { value: v }, t)));
    medicion.value = p.medicion;
    const origen = h('select', { class: 'campo', id: 'pr-origen' },
      h('option', { value: 'comprado' }, 'Se compra (aparece en Compras)'),
      h('option', { value: 'hecho_en_casa' }, 'Se hace en casa (sale de Producción)'));
    origen.value = p.origen || 'comprado';
    const unidad = input('pr-unidad', p.medicion === 'unidad' || p.medicion === 'presentacion' ? p.unidad : '',
      { maxlength: 20, placeholder: 'unidad, porción, jarra, pan…'
  });
    const fMinimo = campoNumero({ valor: p.stock_minimo || null, etiqueta: 'el mínimo', id: 'pr-minimo'
  });
    const fStock = campoNumero({ etiqueta: 'cuánto hay', id: 'pr-stock'
  });
    const nota = input('pr-nota', p.nota, { maxlength: 80, placeholder: 'por ejemplo, 140 g por porción'
  });
    const revisado = h('input', { type: 'checkbox', id: 'pr-revisado', checked: true
  });
    const notaMinimo = h('span', { class: 'fila-nota'
  });
    const notaStock = h('span', { class: 'fila-nota'
  });
    const notaCambio = h('p', { class: 'nota' }, 'Cambia la forma de medir: después cuéntalo de nuevo en Ajustes › Contar un producto.');

    const campo = (id, texto, el, ayuda) => h('div', { class: 'campo-grupo' },
      h('label', { class: 'etiqueta-campo', for: id }, texto, ayuda && ` · ${ayuda}`), el);
    const grupoOtra = campo('pr-otra', 'Categoría nueva', otraCategoria);
    const grupoUnidad = campo('pr-unidad', 'Unidad', unidad, 'en singular');
    const filaMinimo = h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'pr-minimo' }, 'Mínimo', notaMinimo), fMinimo.el);
    const filaStock = nuevo && h('div', { class: 'fila' }, h('label', { class: 'fila-etiqueta', for: 'pr-stock' }, 'Cuánto hay ahora', notaStock), fStock.el);

    const unidadElegida = () => (medicion.value === 'gramos' ? 'g'
      : unidad.value.trim().toLowerCase() || (medicion.value === 'presentacion' ? 'porción' : 'unidad'));
    function actualizar() {
      const cuenta = medicion.value !== 'ojo';
      grupoOtra.hidden = categoria.value !== '';
      grupoUnidad.hidden = !cuenta || medicion.value === 'gramos';
      filaMinimo.hidden = !cuenta;
      if (filaStock) filaStock.hidden = !cuenta;
      notaCambio.hidden = nuevo || !cuenta || (medicion.value === item.medicion && unidadElegida() === item.unidad);
      const en = `en ${unidadDeIngreso({ unidad: unidadElegida() })}`;
      notaMinimo.textContent = `${en} · avisa cuando baja de aquí`;
      notaStock.textContent = en;
    }
    [categoria, medicion].forEach((el) => el.addEventListener('change', actualizar));
    // En un producto nuevo, lo porcionado se hace en casa y lo demás se compra, hasta que se elija a mano.
    origen.addEventListener('change', () => { origen.dataset.elegido = '1';
  });
    medicion.addEventListener('change', () => {
      if (nuevo && !origen.dataset.elegido) origen.value = medicion.value === 'presentacion' ? 'hecho_en_casa' : 'comprado';
    });
    unidad.addEventListener('input', actualizar);
    actualizar();

    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, nuevo ? 'Crear producto' : 'Guardar');
    async function guardar(e) {
      e.preventDefault();
      const cat = categoria.value || otraCategoria.value.trim();
      if (!nombre.value.trim()) { aviso('Escribe el nombre.'); nombre.focus(); return; }
      if (!cat) { aviso('Escribe la categoría nueva.'); otraCategoria.focus(); return; }
      for (const [campoN, texto] of [[fMinimo, 'el mínimo'], [fStock, 'la cantidad']]) {
        const v = campoN.valor;
        if (v != null && (!Number.isFinite(v) || v < 0)) { aviso(`Revisa ${texto}: tiene que ser un número.`); campoN.input.focus(); return; }
      }
      const datos = {
        nombre: nombre.value.trim(), alias: alias.value, categoria: cat, medicion: medicion.value,
        unidad: unidadElegida(), stock_minimo: fMinimo.valor || 0, nota: nota.value.trim(), origen: origen.value
      };
      ocupado(btn, 'Guardando…');
      try {
        const r = nuevo
          ? await Api.crearProducto({ ...datos, stock_actual: fStock.valor || 0 })
          : await Api.guardarProducto({ ...datos, id: item.id, revisado: item.revisar && revisado.checked
  });
        estado.insumos = r.insumos;
        Hoja.cerrar();
        render();
        aviso(nuevo ? `Producto creado: ${datos.nombre}` : `Guardado: ${datos.nombre}`);
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }

    // Quitar pide un segundo toque. La fila queda en el Sheet, así el historial conserva su nombre.
    const btnQuitar = !nuevo && h('button', { type: 'button', class: 'btn btn-secundario btn-ancho' }, 'Quitar de la app');
    if (btnQuitar) {
      btnQuitar.addEventListener('click', async () => {
        if (!btnQuitar.dataset.confirmar) {
          btnQuitar.dataset.confirmar = '1';
          btnQuitar.textContent = `Toca otra vez para quitar ${item.nombre}`;
          return;
        }
        ocupado(btnQuitar, 'Quitando…');
        try {
          const r = await Api.guardarProducto({ id: item.id, desactivar: true
  });
          estado.insumos = r.insumos;
          Hoja.cerrar();
          render();
          aviso(`${item.nombre} ya no aparece en la app. Su historial se guarda.`);
        } catch (err) {
          aviso(mensajeError(err, MSJ_GUARDAR));
          libre(btnQuitar);
        }
      });
    }

    Hoja.abrir(h('form', { class: 'formulario', novalidate: true, onsubmit: guardar }, ...sinVacios([
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, nuevo ? 'Nuevo producto' : item.nombre),
      !nuevo && item.revisar && h('p', { class: 'nota' }, 'Viene del documento de la dueña: revisa los datos y guarda.'),
      !nuevo && seCuenta(item) && h('p', { class: 'texto-suave' }, `Hay ahora: ${mostrarTexto(item.stock_actual, item)}`),
      campo('pr-nombre', 'Nombre oficial', nombre),
      campo('pr-alias', 'Alias', alias, 'opcional, separados por coma'),
      campo('pr-categoria', 'Categoría', categoria),
      grupoOtra,
      campo('pr-origen', '¿Se compra o se hace en casa?', origen),
      campo('pr-medicion', 'Cómo se mide', medicion),
      notaCambio,
      grupoUnidad,
      filaMinimo,
      filaStock,
      campo('pr-nota', 'Nota', nota, 'opcional, solo se muestra'),
      !nuevo && item.revisar && h('label', { class: 'campo-check', for: 'pr-revisado' }, revisado, 'Marcar como revisado'),
      btn,
      btnQuitar
    ])), { foco: nombre
  });
  }

  Santo.ganchos.abrirProducto = abrirProducto;
  Santo.pagina('mas/productos', vistaProductos, { soloAdmin: true });
})();
