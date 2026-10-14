/* SANTO — página: Producción */
(function () {
  'use strict';
  const {
    MSJ_GUARDAR, estado, h, sinVacios, cantidad, cantidadTexto, redondear, ocupado, libre,
    mensajeError, aviso, Hoja, campoNumero, esqueletoFilas, cargarEn, volver, seCuenta, alOjo,
    seCompra, seHaceEnCasa, sumaAlComprar, textoNivel, mostrarTexto, unidadDeIngreso, agruparPorCategoria,
    textoBusqueda, buscador
  } = Santo;

  // ---------- Producción: lo que se usó (resta) y lo que salió (suma) ----------


  function vistaProduccion(main) {
    const zona = h('div', { class: 'hoy' }, esqueletoFilas(6));
    main.replaceChildren(
      volver('#hoy', 'Hoy'),
      h('h1', { class: 'titulo' }, 'Producción'),
      h('p', { class: 'texto-suave' }, 'Anota lo que usaste y lo que salió. Las cantidades las pones tú cada vez: lo usado se resta y lo que salió se suma.'),
      zona);
    cargarEn(zona, Api.cargarProduccion, (datos) => pintarProduccion(zona, datos));
  }

  // "3 kg de Carne de res" o, si va al ojo, "Golf ahumada (🟢 Lleno)".
  const textoProducido = (it) => (it.nivel ? `${it.nombre} (${textoNivel(it.nivel)})` : `${cantidadTexto(it.cantidad, it.unidad)} de ${it.nombre}`);

  function produccionesHoy(producciones) {
    if (!producciones.length) return null;
    return h('section', { class: 'grupo' },
      h('h2', { class: 'subtitulo' }, 'Ya anotado hoy'),
      h('div', { class: 'lista-items' }, producciones.map((p) => h('div', { class: 'fila' },
        h('span', { class: 'fila-etiqueta' }, p.salidas.map(textoProducido).join(', '),
          h('span', { class: 'fila-nota' }, sinVacios([
            p.hora, p.usuario,
            p.usados.length ? `usó ${p.usados.map(textoProducido).join(', ')}` : 'sin nada usado anotado'
          ]).join(' · ')))))));
  }

  // Hoja para elegir un producto, con buscador (también encuentra por alias).
  function elegirProducto(titulo, productos, alElegir) {
    const lista = h('div', { class: 'grupos' }, agruparPorCategoria([...productos]).map(({ categoria, items }) =>
      h('section', { class: 'grupo', 'data-grupo': '' },
        h('h2', { class: 'subtitulo' }, categoria),
        h('div', { class: 'lista' }, items.map((i) => h('button', {
          type: 'button', class: 'lista-fila', 'data-buscar': textoBusqueda(i),
          onclick: () => { Hoja.cerrar(); alElegir(i); }
        }, h('span', { class: 'lista-texto' },
          h('strong', null, i.nombre),
          h('span', { class: 'pequeno texto-suave' }, alOjo(i) ? textoNivel(i.estado_actual) : `hay ${mostrarTexto(i.stock_actual, i)}`))))))));
    const busca = buscador(lista, 'buscar-elegir');
    Hoja.abrir(h('div', { class: 'formulario' },
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, titulo),
      productos.length ? busca : h('p', { class: 'vacio' }, 'No hay productos para elegir.'),
      lista), { foco: productos.length ? busca : null
  });
  }

  function pintarProduccion(zona, datos) {
    estado.insumos = datos.insumos;
    const usados = [];
    const salidas = [];
    const listaUsados = h('div', { class: 'lista-items'
  });
    const listaSalidas = h('div', { class: 'lista-items'
  });

    // Una fila por producto elegido: su cantidad (lo que va al ojo no lleva: queda en Lleno) y "Quitar".
    function agregar(lista, filas, item) {
      if (filas.some((f) => f.item.id === item.id)) { aviso(`${item.nombre} ya está en la lista.`); return; }
      const id = `pro-${filas === usados ? 'u' : 's'}-${item.id}`;
      const campo = alOjo(item) ? null : campoNumero({ etiqueta: item.nombre, id
  });
      const fila = { item, campo };
      const nota = alOjo(item) ? `queda en ${textoNivel('lleno')}` : `hay ${mostrarTexto(item.stock_actual, item)} · en ${unidadDeIngreso(item)}`;
      const el = h('div', { class: 'ing-bloque' },
        h('div', { class: 'fila-estado-cabeza' },
          h('label', { class: 'fila-etiqueta', for: campo ? id : null }, item.nombre, h('span', { class: 'fila-nota' }, nota)),
          h('button', {
            type: 'button', class: 'btn btn-secundario btn-chico', 'aria-label': `Quitar ${item.nombre}`,
            onclick: () => { filas.splice(filas.indexOf(fila), 1); el.remove(); }
          }, 'Quitar')),
        campo && campo.el);
      filas.push(fila);
      lista.append(el);
      if (campo) campo.input.focus();
    }

    const btnUsado = h('button', {
      type: 'button', class: 'btn btn-secundario btn-ancho',
      onclick: () => elegirProducto('¿Qué usaste?', datos.insumos.filter((i) => seCompra(i) && seCuenta(i)), (i) => agregar(listaUsados, usados, i))
    }, '+ Agregar lo que usé');
    const btnSalida = h('button', {
      type: 'button', class: 'btn btn-secundario btn-ancho',
      // Sale lo hecho en casa y lo comprado que se porciona (Papas congeladas: se compran en gramos, salen porciones).
      onclick: () => elegirProducto('¿Qué salió?', datos.insumos.filter((i) => seHaceEnCasa(i) || (seCompra(i) && seCuenta(i) && !sumaAlComprar(i))),
        (i) => agregar(listaSalidas, salidas, i))
    }, '+ Agregar lo que salió');

    const btn = h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar producción');
    // Devuelve la lista para el servidor o null si falta una cantidad (y pone el foco ahí).
    function leer(filas) {
      const lista = [];
      for (const { item, campo } of filas) {
        if (!campo) { lista.push({ insumo_id: item.id }); continue; }
        const v = campo.valor;
        if (!(Number.isFinite(v) && v > 0)) { aviso(`Escribe cuánto de ${item.nombre}.`); campo.input.focus(); return null; }
        lista.push({ insumo_id: item.id, cantidad: redondear(v)
  });
      }
      return lista;
    }
    async function guardar() {
      if (!salidas.length) { aviso('Agrega lo que salió de la producción.'); return; }
      const u = leer(usados);
      if (!u) return;
      const s = leer(salidas);
      if (!s) return;
      ocupado(btn, 'Guardando…');
      try {
        const r = await Api.registrarProduccion({ usados: u, salidas: s
  });
        pintarProduccion(zona, r);
        window.scrollTo(0, 0);
        aviso('Producción guardada');
      } catch (err) {
        // No se limpia nada: lo elegido y lo escrito sigue ahí.
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }

    zona.replaceChildren(...sinVacios([
      produccionesHoy(datos.producciones),
      h('section', { class: 'grupo formulario' },
        h('h2', { class: 'subtitulo subtitulo--seccion' }, 'Lo que usé'),
        h('p', { class: 'pequeno texto-suave' }, 'Lo comprado que se usó: carne cruda, huevos, camote… Se resta del inventario.'),
        listaUsados, btnUsado),
      h('section', { class: 'grupo formulario' },
        h('h2', { class: 'subtitulo subtitulo--seccion' }, 'Lo que salió'),
        h('p', { class: 'pequeno texto-suave' }, 'Porciones, jarras, salsas hechas en casa… Se suma al inventario.'),
        listaSalidas, btnSalida),
      h('div', { class: 'pie-accion' }, btn)
    ]));
  }

  Santo.pagina('produccion', vistaProduccion, { seccion: 'hoy' });
})();
