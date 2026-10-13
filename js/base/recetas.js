/* SANTO — piezas comunes de recetas: grupos de venta y pastillas */
(function () {
  'use strict';
  const {
    estado, h, porNombre, pastillaRevisar
  } = Santo;

  // ---------- recetas: grupos de venta y pastillas (Recetas y Cierre) ----------

  const GRUPOS_VENTA = [['cultos', 'Cultos'], ['criollos', 'Criollos'], ['papas', 'Papas y combos'], ['bebidas', 'Bebidas']];

  // Cultos, Criollos, Papas y Bebidas; lo que no tenga grupo conocido va en "Otros" para que nunca desaparezca.
  function agruparRecetas(recetas) {
    const conocidos = GRUPOS_VENTA.map(([clave]) => clave);
    return [...GRUPOS_VENTA, ['', 'Otros']]
      .map(([clave, titulo]) => ({
        titulo,
        items: recetas
          .filter((r) => (clave ? r.grupo === clave : !conocidos.includes(r.grupo)))
          .sort(porNombre)
      }))
      .filter((g) => g.items.length);
  }

  // Lo que la receta descuenta con cada venta (lo que va al ojo solo informa).
  const conCantidad = (r) => r.ingredientes.filter((ing) => !ing.al_ojo);


  function pastillasReceta(r) {
    return [
      !conCantidad(r).length && h('span', { class: 'etiqueta-estado' }, 'Sin receta'),
      r.estado === 'provisional' && h('span', { class: 'etiqueta-estado etiqueta-estado--suave' }, 'Provisional'),
      r.revisar && pastillaRevisar()
    ].filter(Boolean);
  }

  Object.assign(Santo, {
    GRUPOS_VENTA, agruparRecetas, conCantidad, pastillasReceta
  });
})();
