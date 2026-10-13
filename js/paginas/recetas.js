/* SANTO — página: Recetas */
(function () {
  'use strict';
  const {
    MSJ_GUARDAR, CHEVRON, estado, h, sinVacios, cantidad, cantidadTexto, ocupado, libre, mensajeError,
    aviso, Hoja, campoNumero, esqueletoFilas, cargarEn, seCuenta, alOjo, unidadDeIngreso,
    agruparPorCategoria, GRUPOS_VENTA, agruparRecetas, pastillasReceta
  } = Santo;

  // ---------- Recetas: lo que lleva UN plato o UNA bebida vendida ----------

  function vistaRecetas(main) {
    const zona = h('div', null, esqueletoFilas(5));
    main.replaceChildren(
      h('div', { class: 'titulo-fila' },
        h('h1', { class: 'titulo' }, 'Recetas'),
        Api.sesion.esAdmin && h('button', { type: 'button', class: 'btn btn-secundario btn-chico', onclick: () => abrirNuevaReceta(zona) }, '+ Nueva receta')),
      h('p', { class: 'texto-suave' }, Api.sesion.esAdmin
        ? 'Lo que lleva cada producto. Al registrar una venta, se descuenta esto del inventario.'
        : 'Lo que lleva cada producto. Solo un admin puede cambiarlas.'),
      zona);
    cargarEn(zona, Api.cargarRecetas, (datos) => pintarRecetas(zona, datos));
  }

  function textoIngrediente(ing, i) {
    return ing.al_ojo ? `${i.nombre} al ojo` : `${i.nombre} ${cantidadTexto(ing.cantidad, i.unidad)}`;
  }

  function pintarRecetas(zona, datos) {
    const insumos = {};
    datos.insumos.forEach((i) => { insumos[i.id] = i;
  });
    const grupos = agruparRecetas(datos.recetas);
    if (!grupos.length) {
      zona.replaceChildren(h('p', { class: 'vacio' }, Api.sesion.esAdmin
        ? 'Todavía no hay recetas. Crea la primera con “+ Nueva receta”.' : 'Todavía no hay recetas.'));
      return;
    }
    const admin = Api.sesion.esAdmin;
    const porRevisar = datos.recetas.filter((r) => r.revisar).length;
    zona.replaceChildren(...sinVacios([
      admin && porRevisar > 0 && h('p', { class: 'nota' }, porRevisar === 1
        ? 'Queda 1 receta por revisar: ábrela, corrige lo que haga falta y guarda.'
        : `Quedan ${porRevisar} recetas por revisar: vienen del documento de la dueña. Ábrelas, corrige lo que haga falta y guarda.`),
      ...grupos.map(({ titulo, items: recetas }) => h('section', { class: 'grupo' },
        h('h2', { class: 'subtitulo' }, titulo),
        h('div', { class: 'lista' }, recetas.map((r) => {
          const resumen = r.ingredientes
            .map((ing) => insumos[ing.insumo_id] && textoIngrediente(ing, insumos[ing.insumo_id]))
            .filter(Boolean).join(' · ');
          const texto = h('span', { class: 'lista-texto' },
            h('strong', null, r.nombre),
            ...pastillasReceta(r),
            resumen && h('span', { class: 'pequeno texto-suave' }, resumen));
          // Cocina solo las ve; editarlas es de admin.
          if (!admin) return h('div', { class: 'lista-fila' }, texto);
          return h('button', { type: 'button', class: 'lista-fila', onclick: () => abrirReceta(r, datos, zona) },
            texto, h('span', { html: CHEVRON }));
        }))))
    ]));
  }

  function abrirNuevaReceta(zona) {
    const nombre = h('input', { class: 'campo', id: 'np-nombre', autocomplete: 'off', maxlength: 40, enterkeyhint: 'done'
  });
    const grupo = h('select', { class: 'campo', id: 'np-grupo' }, GRUPOS_VENTA.map(([v, t]) => h('option', { value: v }, t)));
    const btn = h('button', { type: 'submit', class: 'btn btn-primario' }, 'Crear');
    async function crear(e) {
      e.preventDefault();
      if (!nombre.value.trim()) { aviso('Escribe el nombre.'); nombre.focus(); return; }
      ocupado(btn, 'Creando…');
      try {
        const datos = await Api.crearReceta({ nombre: nombre.value.trim(), grupo: grupo.value
  });
        if (zona.isConnected) pintarRecetas(zona, datos);
        abrirReceta(datos.recetas.find((r) => r.id === datos.id), datos, zona);
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btn);
      }
    }
    Hoja.abrir(h('form', { class: 'formulario', novalidate: true, onsubmit: crear },
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, 'Nueva receta'),
      h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'np-nombre' }, 'Nombre del plato o bebida'), nombre),
      h('div', { class: 'campo-grupo' }, h('label', { class: 'etiqueta-campo', for: 'np-grupo' }, 'Grupo'), grupo),
      btn), { foco: nombre
  });
  }

  function abrirReceta(receta, datos, zona) {
    const insumos = datos.insumos;
    const grupos = agruparPorCategoria([...insumos]);
    const lista = h('div', { class: 'lista-items'
  });
    const filas = [];
    let contador = 0;

    // Cada ingrediente lleva una cantidad en la unidad del producto (acepta medias: 0.5 palta) o va "al ojo":
    // al ojo solo informa y no se descuenta. Lo que se mide al ojo va siempre así.
    function agregar(ing) {
      const k = contador++;
      const select = h('select', { class: 'campo', id: `ing-${k}`, 'aria-label': 'Ingrediente' },
        h('option', { value: '' }, 'Elige un ingrediente…'),
        grupos.map(({ categoria, items }) => h('optgroup', { label: categoria }, items.map((i) => h('option', { value: i.id }, i.nombre)))));
      select.value = ing ? ing.insumo_id : '';
      const campo = campoNumero({ valor: ing && !ing.al_ojo ? ing.cantidad : null, etiqueta: 'la cantidad', id: `ing-c-${k}`, paso: 0.5
  });
      const unidad = h('label', { class: 'fila-nota', for: `ing-c-${k}`
  });
      const ojo = h('input', { type: 'checkbox', id: `ing-o-${k}`, checked: Boolean(ing && ing.al_ojo)
  });
      const marcaOjo = h('label', { class: 'campo-check', for: `ing-o-${k}` }, ojo, 'Al ojo (no se descuenta)');
      const cantidadEl = h('div', { class: 'ing-cantidad' }, campo.el, unidad);
      const pintar = () => {
        const i = insumos.find((x) => x.id === select.value);
        const soloOjo = Boolean(i && alOjo(i));
        if (soloOjo) ojo.checked = true;
        ojo.disabled = soloOjo;
        cantidadEl.hidden = ojo.checked;
        if (!i || !seCuenta(i)) { unidad.textContent = ''; return; }
        const base = `${unidadDeIngreso(i)} por cada uno`;
        unidad.textContent = i.nota ? `${base} · ${i.nota}` : base;
      };
      select.addEventListener('change', pintar);
      ojo.addEventListener('change', pintar);
      pintar();
      const fila = { select, campo, ojo };
      const bloque = h('div', { class: 'ing-bloque' },
        select,
        h('div', { class: 'ing-fila' },
          cantidadEl,
          h('button', {
            type: 'button', class: 'btn btn-secundario btn-chico', 'aria-label': 'Quitar ingrediente',
            onclick: () => { filas.splice(filas.indexOf(fila), 1); bloque.remove(); }
          }, 'Quitar')),
        marcaOjo);
      filas.push(fila);
      lista.append(bloque);
      return select;
    }

    receta.ingredientes.forEach((ing) => agregar(ing));

    const revisado = h('input', { type: 'checkbox', id: 'rec-revisado', checked: true
  });
    const btnGuardar = h('button', { type: 'button', class: 'btn btn-primario', onclick: guardar }, 'Guardar receta');
    async function guardar() {
      const ingredientes = [];
      for (const { select, campo, ojo } of filas) {
        if (!select.value) { aviso('Elige el ingrediente o quita esa fila.'); select.focus(); return; }
        if (ojo.checked) { ingredientes.push({ insumo_id: select.value, al_ojo: true }); continue; }
        if (!(campo.valor > 0)) { aviso('Cada ingrediente necesita una cantidad mayor que 0 o ir al ojo.'); campo.input.focus(); return; }
        ingredientes.push({ insumo_id: select.value, cantidad: campo.valor
  });
      }
      ocupado(btnGuardar, 'Guardando…');
      try {
        const nuevos = await Api.guardarReceta({ id: receta.id, ingredientes, revisado: receta.revisar && revisado.checked
  });
        Hoja.cerrar();
        if (zona.isConnected) pintarRecetas(zona, nuevos);
        aviso(`Receta guardada: ${receta.nombre}`);
      } catch (err) {
        aviso(mensajeError(err, MSJ_GUARDAR));
        libre(btnGuardar);
      }
    }

    Hoja.abrir(h('div', { class: 'formulario' }, ...sinVacios([
      h('h2', { class: 'hoja-titulo', id: 'hoja-titulo' }, receta.nombre),
      receta.revisar && h('p', { class: 'nota' }, 'Viene del documento de la dueña: revisa los ingredientes y guarda.'),
      receta.estado === 'provisional' && h('p', { class: 'nota' }, 'Receta provisional: descuenta normal, pero falta confirmarla con cocina.'),
      h('p', { class: 'texto-suave' }, 'Lo que lleva uno. Se descuenta del inventario por cada uno vendido.'),
      insumos.length ? lista : h('p', { class: 'vacio' }, 'Primero crea los productos en Más › Productos.'),
      insumos.length && h('button', { type: 'button', class: 'btn btn-secundario btn-ancho', onclick: () => agregar(null).focus() }, '+ Agregar ingrediente'),
      receta.revisar && h('label', { class: 'campo-check', for: 'rec-revisado' }, revisado, 'Marcar como revisada'),
      btnGuardar
    ])));
  }

  Santo.pagina('recetas', vistaRecetas);
})();
