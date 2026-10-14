/* SANTO — página: Compras (por ahora, solo admin). Anotar lo comprado y, con "Editar lista", armar categorías y productos */
(function () {
  'use strict';
  const {
    MSJ_GUARDAR, estado, h, sinVacios, soles, cantidad, parseNumero, redondear, ocupado, libre, mensajeError,
    aviso, Hoja, campoNumero, esqueletoFilas, cargarEn, volver, seCompra, textoBusqueda, buscador, CHEVRON,
    UNIDADES_COMPRA, unidadCompraCorta, campoConEtiqueta
  } = Santo;

  // ---------- Compras: lo que entra (suma al inventario) ----------

  // Con "Editar lista" se arman las categorías y los productos en vez de anotar cantidades.
  let editando = false;

  function vistaCompras(main) {
    editando = false;
    const zona = h('div', { class: 'hoy' }, esqueletoFilas(7));
    main.replaceChildren(volver('#hoy', 'Hoy'), h('h1', { class: 'titulo' }, 'Compras'), zona);
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
      sinPrecio > 0 && h('p', { class: 'nota nota--alerta' }, sinPrecio === 1 ? '1 compra sin precio' : `${sinPrecio} compras sin precio`));
  }

  // Las categorías en su orden (con emoji), cada una con sus productos comprados. Las vacías solo al editar.
  function grupos(datos) {
    const productos = datos.insumos.filter(seCompra);
    const cats = [...datos.categorias];
    productos.forEach((i) => { if (!cats.some((c) => c.nombre === i.categoria)) cats.push({ nombre: i.categoria, emoji: '' }); });
    return cats.map((c) => ({
      ...c,
      titulo: c.emoji ? `${c.emoji} ${c.nombre}` : c.nombre,
      items: productos.filter((i) => i.categoria === c.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    }));
  }

  // escrito: lo anotado y no guardado ({ insumo_id: { cantidad, precio } }), para que no se pierda al volver a pintar
  // (al crear un producto o al pasar a "Editar lista" y volver). buscar: texto que queda en el buscador.
  function pintarCompras(zona, datos, escrito = {}, buscar = '') {
    estado.insumos = datos.insumos;
    const repintar = (nuevos, b) => pintarCompras(zona, nuevos || datos, leerEscrito(), b || '');
    let leerEscrito = () => escrito;

    const btnEditar = h('button', {
      type: 'button', class: 'btn btn-secundario btn-chico', id: 'btn-editar-lista',
      onclick: () => { editando = !editando; repintar(); }
    }, editando ? 'Listo' : 'Editar lista');
    const cabeza = h('div', { class: 'acciones-lista' }, btnEditar);

    if (editando) {
      zona.replaceChildren(cabeza, listaEditable(datos, repintar));
      return;
    }

    const campos = [];
    let k = 0;
    const lista = h('div', { class: 'grupos' }, grupos(datos).filter((g) => g.items.length).map((g) =>
      h('section', { class: 'grupo', 'data-grupo': '' },
        h('h2', { class: 'subtitulo' }, g.titulo),
        h('div', { class: 'lista-items' }, g.items.map((insumo) => {
          const id = `com-${k++}`;
          const precio = h('input', {
            class: 'campo campo-precio', id: `${id}-p`, type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done'
          });
          const filaPrecio = h('div', { class: 'fila-precio', hidden: true },
            h('label', { class: 'fila-nota', for: `${id}-p` }, 'Precio S/'), precio);
          const campo = campoNumero({
            etiqueta: insumo.nombre, id, paso: insumo.unidad_compra === 'unidad' ? 1 : 100,
            alCambiar: (v) => { filaPrecio.hidden = !(v > 0); }
          });
          const previo = escrito[insumo.id];
          if (previo) {
            campo.input.value = previo.cantidad;
            precio.value = previo.precio;
            filaPrecio.hidden = !(campo.valor > 0);
          }
          campos.push({ insumo, campo, precio });
          return h('div', { class: 'compra', 'data-buscar': textoBusqueda(insumo) },
            h('div', { class: 'fila' },
              h('label', { class: 'fila-etiqueta', for: id }, insumo.nombre,
                h('span', { class: 'fila-nota' }, unidadCompraCorta(insumo))),
              campo.el),
            filaPrecio);
        })))));
    leerEscrito = () => {
      const valores = {};
      campos.forEach(({ insumo, campo, precio }) => {
        if (campo.input.value || precio.value) valores[insumo.id] = { cantidad: campo.input.value, precio: precio.value };
      });
      return valores;
    };

    const btn = h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar compras');
    async function guardar() {
      const compras = [];
      for (const { insumo, campo, precio } of campos) {
        const v = campo.valor;
        if (v == null || v === 0) continue;
        if (!Number.isFinite(v) || v < 0) { aviso(`Revisa ${insumo.nombre}: tiene que ser un número.`); campo.input.focus(); return; }
        const p = parseNumero(precio.value);
        if (p != null && (!Number.isFinite(p) || p < 0)) { aviso(`Revisa el precio de ${insumo.nombre}: tiene que ser un número.`); precio.focus(); return; }
        compras.push({ insumo_id: insumo.id, cantidad: redondear(v), precio: p == null ? '' : redondear(p) });
      }
      if (!compras.length) { aviso('Escribe cuánto entró de al menos un producto.'); return; }
      ocupado(btn, 'Guardando…');
      try {
        const r = await Api.registrarCompras({ compras });
        pintarCompras(zona, r);
        window.scrollTo(0, 0);
        aviso(r.guardadas === 1 ? 'Guardado: 1 producto' : `Guardado: ${r.guardadas} productos`);
      } catch (err) {
        // No se limpia nada: los números escritos siguen ahí.
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }

    // Si el buscador no encuentra nada: crear el producto ahí mismo, con el nombre buscado.
    const busca = buscador(lista, 'buscar-compras');
    const noEsta = h('div', { class: 'vacio no-esta', hidden: true },
      h('p', null, '¿No está?'),
      h('button', {
        type: 'button', class: 'btn btn-secundario',
        onclick: () => {
          const texto = busca.value.trim();
          abrirNuevoProducto(datos, '', texto.charAt(0).toUpperCase() + texto.slice(1), repintar);
        }
      }, 'Crear producto'));
    busca.addEventListener('input', () => {
      noEsta.hidden = !busca.value.trim() || Boolean(lista.querySelector('[data-buscar]:not([hidden])'));
    });

    zona.replaceChildren(...sinVacios([
      cabeza,
      compradoHoy(datos.compras),
      busca,
      noEsta,
      lista,
      h('div', { class: 'pie-accion' }, btn),
      totalDelDia(datos.compras)
    ]));
    if (buscar) {
      busca.value = buscar;
      busca.dispatchEvent(new Event('input'));
    }
  }

  // ---------- Editar lista: categorías y productos (solo admin) ----------

  function listaEditable(datos, repintar) {
    const secciones = grupos(datos).map((g) => {
      const quitar = !g.items.length && botonConfirmar('Quitar categoría', `Toca otra vez para quitar ${g.nombre}`, async () => {
        const r = await Api.quitarCategoria({ nombre: g.nombre });
        aviso(`Categoría quitada: ${g.nombre}`);
        repintar(r);
      });
      return h('section', { class: 'grupo' },
        h('div', { class: 'titulo-fila' }, h('h2', { class: 'subtitulo' }, g.titulo), quitar),
        g.items.length ? h('div', { class: 'lista' }, g.items.map((i) => h('button', {
          type: 'button', class: 'lista-fila', onclick: () => abrirEditarProducto(i, repintar)
        }, h('span', { class: 'lista-texto' }, h('strong', null, i.nombre), h('span', { class: 'pequeno texto-suave' }, unidadCompraCorta(i))),
        h('span', { html: CHEVRON })))) : null,
        h('button', {
          type: 'button', class: 'btn btn-secundario btn-ancho', onclick: () => abrirNuevoProducto(datos, g.nombre, '', repintar)
        }, '+ Producto'));
    });
    return h('div', { class: 'grupos' }, ...secciones,
      h('button', { type: 'button', class: 'btn btn-primario', onclick: () => abrirNuevaCategoria(repintar) }, '+ Categoría'));
  }

  // Botón que pide un segundo toque antes de hacer algo que no se deshace desde aquí.
  function botonConfirmar(texto, textoConfirmar, hacer) {
    const btn = h('button', { type: 'button', class: 'btn btn-secundario btn-chico' }, texto);
    btn.addEventListener('click', async () => {
      if (!btn.dataset.confirmar) {
        btn.dataset.confirmar = '1';
        btn.textContent = textoConfirmar;
        return;
      }
      ocupado(btn, 'Quitando…');
      try {
        await hacer();
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    });
    return btn;
  }

  const selectUnidad = (id, valor) => {
    const el = h('select', { class: 'campo', id }, UNIDADES_COMPRA.map(([v, t]) => h('option', { value: v }, t)));
    el.value = valor || 'gramos';
    return el;
  };

  // Guarda desde una hoja: cierra la hoja y vuelve a pintar Compras con lo que responde el servidor.
  async function guardarHoja(btn, pedir, mensaje, repintar, buscar) {
    ocupado(btn, 'Guardando…');
    try {
      const r = await pedir();
      Hoja.cerrar();
      repintar(r, buscar && buscar(r));
      aviso(mensaje);
    } catch (err) {
      aviso(mensajeError(err, MSJ_GUARDAR));
      libre(btn);
    }
  }

  function abrirNuevaCategoria(repintar) {
    const nombre = h('input', { class: 'campo', id: 'cat-nombre', autocomplete: 'off', maxlength: 30 });
    const emoji = h('input', { class: 'campo', id: 'cat-emoji', autocomplete: 'off', maxlength: 8, placeholder: '🧽' });
    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Crear categoría');
    Hoja.abrir(h('form', {
      class: 'formulario', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        if (!nombre.value.trim()) { aviso('Escribe el nombre.'); nombre.focus(); return; }
        guardarHoja(btn, () => Api.crearCategoria({ nombre: nombre.value.trim(), emoji: emoji.value.trim() }),
          `Categoría creada: ${nombre.value.trim()}`, repintar);
      }
    },
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, 'Nueva categoría'),
      campoConEtiqueta('cat-nombre', 'Nombre', nombre),
      campoConEtiqueta('cat-emoji', 'Emoji', emoji),
      btn), { foco: nombre });
  }

  // Producto nuevo: nombre, categoría y unidad de compra. Lo demás se completa en Productos.
  function abrirNuevoProducto(datos, categoria, texto, repintar) {
    const nombre = h('input', { class: 'campo', id: 'pc-nombre', autocomplete: 'off', maxlength: 40 });
    nombre.value = texto;
    const cats = grupos(datos);
    const selCategoria = h('select', { class: 'campo', id: 'pc-categoria' }, cats.map((c) => h('option', { value: c.nombre }, c.titulo)));
    selCategoria.value = categoria || (cats[0] && cats[0].nombre) || '';
    const unidad = selectUnidad('pc-unidad', 'gramos');
    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Crear producto');
    Hoja.abrir(h('form', {
      class: 'formulario', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const n = nombre.value.trim();
        if (!n) { aviso('Escribe el nombre.'); nombre.focus(); return; }
        guardarHoja(btn, () => Api.crearProductoCompra({ nombre: n, categoria: selCategoria.value, unidad_compra: unidad.value }),
          `Producto creado: ${n}`, repintar, () => (editando ? '' : n));
      }
    },
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, 'Nuevo producto'),
      campoConEtiqueta('pc-nombre', 'Nombre', nombre),
      campoConEtiqueta('pc-categoria', 'Categoría', selCategoria),
      campoConEtiqueta('pc-unidad', 'Se compra en', unidad),
      btn), { foco: nombre });
  }

  // Editar nombre y unidad de compra, o quitarlo (sale de toda la app; su historial se guarda).
  function abrirEditarProducto(item, repintar) {
    const nombre = h('input', { class: 'campo', id: 'pc-nombre', autocomplete: 'off', maxlength: 40 });
    nombre.value = item.nombre;
    const unidad = selectUnidad('pc-unidad', item.unidad_compra);
    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Guardar');
    const quitar = botonConfirmar('Quitar', `Toca otra vez para quitar ${item.nombre}`, async () => {
      await Api.guardarProducto({ id: item.id, desactivar: true });
      const r = await Api.cargarCompras();
      Hoja.cerrar();
      repintar(r);
      aviso(`${item.nombre} ya no aparece. Su historial se guarda.`);
    });
    quitar.classList.remove('btn-chico');
    quitar.classList.add('btn-ancho');
    Hoja.abrir(h('form', {
      class: 'formulario', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const n = nombre.value.trim();
        if (!n) { aviso('Escribe el nombre.'); nombre.focus(); return; }
        guardarHoja(btn, () => Api.editarProductoCompra({ id: item.id, nombre: n, unidad_compra: unidad.value }),
          `Guardado: ${n}`, repintar);
      }
    },
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, item.nombre),
      campoConEtiqueta('pc-nombre', 'Nombre', nombre),
      campoConEtiqueta('pc-unidad', 'Se compra en', unidad),
      btn,
      quitar), { foco: nombre });
  }

  Santo.pagina('compras', vistaCompras, { soloAdmin: true, seccion: 'hoy' });
})();
