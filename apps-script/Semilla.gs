/**
 * SANTO — datos iniciales (salen de RECETAS.md: la ficha de la dueña, revisada con cocina el 07/10/2026).
 *
 * Todo se carga como BORRADOR: productos y recetas quedan marcados "por revisar" para que la dueña los
 * corrija en las pantallas de Productos y Recetas.
 *
 * cargarSemilla() agrega lo que falta, comparando por id. No duplica nada si se corre dos veces
 * y no toca lo que ya existe (si alguien lo cambió en la app, se respeta).
 *
 * Formas de medir: unidad, gramos, presentacion (lo producido: porción, jarra…) y ojo (lleno · medio · bajo · vacío).
 * Lo que la ficha tenía en "Hay / Falta" pasa a "al ojo", salvo lo que la lógica nueva nombra:
 * huevos por unidad, queso y pollo crudo por gramos y el camote frito por porción.
 */

const SEMILLA = {
  // [id, nombre, categoria, medicion, unidad, nota]
  insumos: [
    // Carnes y proteínas: porciones producidas. La nota es el gramaje de referencia de la ficha.
    ['prep-panceta', 'Panceta / Chicharrón', 'Carnes y proteínas', 'presentacion', 'porción', '140 g'],
    ['prep-pollo', 'Pollo Invicto', 'Carnes y proteínas', 'presentacion', 'porción', '150 g crudo'],
    ['prep-asado', 'Asado', 'Carnes y proteínas', 'presentacion', 'porción', '120 g'],
    ['prep-portobello', 'Portobello anticuchero', 'Carnes y proteínas', 'presentacion', 'porción', '90 g'],
    ['prep-fiambres', 'Mix fiambres Artesano', 'Carnes y proteínas', 'presentacion', 'porción', '90 g'],
    ['prep-pollo-desh', 'Pollo deshilachado', 'Carnes y proteínas', 'presentacion', 'porción', '140 g'],

    // Panes, palta, tomate, papas y camote.
    ['ins-pan-cubano', 'Pan cubano', 'Panes', 'unidad', 'unidad', ''],
    ['ins-roseta', 'Roseta', 'Panes', 'unidad', 'unidad', ''],
    ['ins-focaccia', 'Focaccia', 'Panes', 'unidad', 'unidad', ''],
    ['ins-masa-madre', 'Pan masa madre con semillas', 'Panes', 'unidad', 'unidad', ''],
    ['ins-palta', 'Palta', 'Verduras', 'unidad', 'unidad', '1 palta = 2 panes'],
    ['ins-tomate', 'Tomate', 'Verduras', 'unidad', 'unidad', '1 tomate = 2 panes'],
    ['ins-papas', 'Papas congeladas', 'Congelados', 'presentacion', 'porción', 'bolsa de 200 g'],
    ['comp-camote-frito', 'Camote frito', 'Complementos', 'presentacion', 'porción', ''],

    // Salsas y aderezos: al ojo, con la botella dispensadora.
    ['sal-rocoto-pic', 'Rocoto ahumado picante', 'Salsas y aderezos', 'ojo', '', ''],
    ['sal-rocoto-sin', 'Rocoto ahumado sin picante', 'Salsas y aderezos', 'ojo', '', ''],
    ['sal-aji-ahumado', 'Ají amarillo ahumado', 'Salsas y aderezos', 'ojo', '', ''],
    ['sal-aji-huacatay', 'Ají amarillo con ajo y huacatay', 'Salsas y aderezos', 'ojo', '', ''],
    ['sal-golf', 'Golf ahumada', 'Salsas y aderezos', 'ojo', '', ''],
    ['sal-culantro', 'Culantro y cebollín', 'Salsas y aderezos', 'ojo', '', ''],
    ['sal-pesto', 'Pesto de albahaca', 'Salsas y aderezos', 'ojo', '', ''],
    ['sal-glaseado', 'Glaseado Bravo', 'Salsas y aderezos', 'ojo', '', ''],
    ['sal-crema-aji', 'Crema de ají amarillo', 'Salsas y aderezos', 'ojo', '', ''],

    // Verduras y complementos al ojo.
    ['ins-lechuga', 'Lechuga', 'Verduras', 'ojo', '', ''],
    ['ins-arugula', 'Arúgula', 'Verduras', 'ojo', '', ''],
    ['comp-chalaquita', 'Chalaquita encurtida', 'Complementos', 'ojo', '', ''],
    ['comp-aros', 'Aros de cebolla', 'Complementos', 'ojo', '', ''],
    ['comp-sarsa', 'Sarsa criolla', 'Complementos', 'ojo', '', ''], // D2: pendiente si se quita
    ['comp-quesos', 'Mix quesos Artesano', 'Complementos', 'ojo', '', ''],

    // Lácteos y secos.
    ['ins-paria', 'Queso Paria', 'Lácteos', 'gramos', 'g', ''],
    ['ins-huevo', 'Huevo', 'Secos', 'unidad', 'unidad', ''],
    ['ins-harina', 'Harina', 'Secos', 'ojo', '', ''],
    ['ins-panko', 'Panko', 'Secos', 'ojo', '', ''],

    // Bebidas.
    ['beb-chicha', 'Chicha', 'Bebidas', 'unidad', 'unidad', ''],
    ['beb-maracuya', 'Maracuyá', 'Bebidas', 'unidad', 'unidad', '']
  ],

  // Insumos solo de producción: al ojo. Su id sale del nombre ("ins-" + slug).
  soloProduccion: [
    'Mayonesa', 'Kétchup', 'Mostaza', 'Humo líquido', 'Ajinomoto', 'Sal', 'Pimienta negra', 'Comino', 'Laurel',
    'Canela china', 'Rocoto', 'Ají amarillo', 'Ají limo', 'Ají panca', 'Ajo', 'Huacatay', 'Culantro', 'Cebollín',
    'Albahaca', 'Aceite de oliva', 'Aceite', 'Almendra', 'Cebolla roja', 'Limón', 'Pasta de tomate', 'Camote',
    'Sazonador Doña Gusta carne', 'Sazonador Doña Gusta pollo/gallina'
  ],
  // Solo producción, pero crudo comprado: por gramos. [nombre]
  soloProduccionGramos: ['Pollo deshuesado'],

  // [id, nombre, grupo, estado, [[insumo_id, cantidad], ...]] — lo que lleva UN producto vendido.
  recetas: [
    ['rec-artesano', 'El Artesano', 'cultos', 'vigente', [['ins-masa-madre', 1], ['prep-fiambres', 1]]],
    ['rec-bravo', 'El Bravo', 'cultos', 'vigente', [['ins-pan-cubano', 1], ['prep-panceta', 1]]],
    ['rec-invicto', 'El Invicto', 'cultos', 'vigente',
      [['ins-pan-cubano', 1], ['prep-pollo', 1], ['ins-palta', 0.5], ['ins-tomate', 0.5]]],
    ['rec-fenomeno', 'El Fenómeno', 'cultos', 'vigente', [['ins-focaccia', 1], ['prep-portobello', 1]]],
    // D3: sin camote (pendiente si lleva camote frito).
    ['rec-incondicional', 'El Incondicional', 'cultos', 'vigente', [['ins-pan-cubano', 1], ['prep-asado', 1], ['ins-palta', 0.5]]],

    ['rec-chicharron', 'Pan con chicharrón', 'criollos', 'vigente', [['ins-roseta', 1], ['prep-panceta', 1]]],
    ['rec-asado-criollo', 'Asado criollo', 'criollos', 'vigente', [['ins-pan-cubano', 1], ['prep-asado', 1], ['ins-palta', 0.5]]],
    // D1: solo la roseta (pendiente si el jamón va como proteína).
    ['rec-butifarra', 'Butifarra', 'criollos', 'vigente', [['ins-roseta', 1]]],
    ['rec-pollo-desh', 'Pollo deshilachado', 'criollos', 'provisional', [['ins-pan-cubano', 1], ['prep-pollo-desh', 1]]],
    ['rec-choripan', 'Choripán vegano', 'criollos', 'sin_ficha', []],
    ['rec-kids', 'Kids', 'criollos', 'sin_ficha', []],

    // D4: 1 porción = bolsa de 200 g; la del combo grupal (150 g) vale 0.75.
    ['rec-papas', 'Papas combo individual / extra', 'papas', 'vigente', [['ins-papas', 1]]],
    ['rec-papas-grupal', 'Papas combo grupal (por persona)', 'papas', 'vigente', [['ins-papas', 0.75]]],
    ['rec-combo-chicha', 'Combo papas + Chicha', 'papas', 'vigente', [['ins-papas', 1], ['beb-chicha', 1]]],
    ['rec-combo-maracuya', 'Combo papas + Maracuyá', 'papas', 'vigente', [['ins-papas', 1], ['beb-maracuya', 1]]]
  ]
};

// Nada trae stock ni mínimo inventado: todo lo que se cuenta arranca en 0 y sin mínimo, y lo que va al ojo en lleno.
// Los números reales se ponen en la Revisión inicial y los mínimos en Productos.
function cargarSemilla() {
  soloDesdeEditor('cargarSemilla');
  // Productos
  const existentes = {};
  leerTabla('Insumos').forEach((i) => { existentes[i.id] = true; });
  const nuevos = [];
  const producto = (id, nombre, categoria, medicion, unidad, nota) => {
    const ojo = medicion === 'ojo';
    return {
      id: id, nombre: nombre, alias: '', categoria: categoria, medicion: medicion, unidad: ojo ? '' : unidad,
      stock_actual: ojo ? '' : 0, stock_minimo: ojo ? '' : 0, estado_actual: ojo ? NIVEL_INICIAL : '',
      nota: nota || '', revisar: 'sí', activo: true
    };
  };
  SEMILLA.insumos.forEach(([id, nombre, categoria, medicion, unidad, nota]) => {
    if (!existentes[id]) nuevos.push(producto(id, nombre, categoria, medicion, unidad, nota));
  });
  SEMILLA.soloProduccion.forEach((nombre) => {
    const id = 'ins-' + slug(nombre);
    if (!existentes[id]) nuevos.push(producto(id, nombre, 'Solo producción', 'ojo', '', ''));
  });
  SEMILLA.soloProduccionGramos.forEach((nombre) => {
    const id = 'ins-' + slug(nombre);
    if (!existentes[id]) nuevos.push(producto(id, nombre, 'Solo producción', 'gramos', 'g', ''));
  });
  agregarFilas('Insumos', nuevos);

  // Recetas: solo se cargan los ingredientes de las recetas que recién se crean.
  const recetasExistentes = {};
  leerTabla('Recetas').forEach((r) => { recetasExistentes[r.id] = true; });
  const recetas = [];
  const ingredientes = [];
  SEMILLA.recetas.forEach(([id, nombre, grupo, estado, items]) => {
    if (recetasExistentes[id]) return;
    recetas.push({ id: id, nombre: nombre, grupo: grupo, estado: estado, revisar: 'sí', activa: true, notas: '' });
    items.forEach(([insumoId, cantidad]) =>
      ingredientes.push({ receta_id: id, insumo_id: insumoId, cantidad: cantidad, al_ojo: '' }));
  });
  agregarFilas('Recetas', recetas);
  agregarFilas('RecetaIngredientes', ingredientes);

  recalcularStocks();
  console.log('Semilla: ' + nuevos.length + ' productos y ' + recetas.length + ' recetas nuevas (por revisar).');
}
