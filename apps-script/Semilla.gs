/**
 * SANTO — datos iniciales (salen de RECETAS.md: la ficha de la dueña, revisada con cocina el 07/10/2026,
 * y de lo que la dueña decidió el 12/10/2026).
 *
 * Todo se carga como BORRADOR: productos y recetas quedan marcados "por revisar" para que la dueña los
 * corrija en las pantallas de Productos y Recetas.
 *
 * cargarSemilla() agrega lo que falta, comparando por id. No duplica nada si se corre dos veces
 * y no toca lo que ya existe (si alguien lo cambió en la app, se respeta).
 *
 * Formas de medir: unidad, gramos, presentacion (porción, jarra…) y ojo (lleno · medio · bajo · vacío).
 * Origen: comprado (aparece en Compras, aunque vaya al ojo) o hecho_en_casa (sale de Producción).
 * Cada proteína tiene su crudo (comprado, por gramos) y su porcionado (hecho en casa, por porción).
 */

const COMPRADO = 'comprado';
const EN_CASA = 'hecho_en_casa';

const SEMILLA = {
  // [id, nombre, categoria, medicion, unidad, nota, origen]
  insumos: [
    // Proteínas crudas: se compran por peso y en Producción se porcionan.
    ['ins-res-cruda', 'Carne de res cruda', 'Carnes y proteínas', 'gramos', 'g', 'se porciona en Asado', COMPRADO],
    ['ins-chancho-crudo', 'Chancho crudo', 'Carnes y proteínas', 'gramos', 'g', 'se porciona en Panceta / Chicharrón', COMPRADO],
    ['ins-pollo-deshuesado', 'Pollo deshuesado', 'Carnes y proteínas', 'gramos', 'g',
      'se porciona en Pollo Invicto y Pollo deshilachado', COMPRADO],
    ['ins-portobello', 'Portobello', 'Carnes y proteínas', 'gramos', 'g', 'se porciona en Portobello anticuchero', COMPRADO],
    ['ins-jamon', 'Jamón', 'Carnes y proteínas', 'gramos', 'g', 'va en el Mix fiambres Artesano', COMPRADO],
    ['ins-salami', 'Salami ahumado', 'Carnes y proteínas', 'gramos', 'g', 'va en el Mix fiambres Artesano', COMPRADO],

    // Proteínas porcionadas: salen de Producción. La nota es el gramaje de referencia de la ficha.
    ['prep-panceta', 'Panceta / Chicharrón', 'Carnes y proteínas', 'presentacion', 'porción', '140 g', EN_CASA],
    ['prep-pollo', 'Pollo Invicto', 'Carnes y proteínas', 'presentacion', 'porción', '150 g crudo', EN_CASA],
    ['prep-asado', 'Asado', 'Carnes y proteínas', 'presentacion', 'porción', '120 g', EN_CASA],
    ['prep-portobello', 'Portobello anticuchero', 'Carnes y proteínas', 'presentacion', 'porción', '90 g', EN_CASA],
    ['prep-fiambres', 'Mix fiambres Artesano', 'Carnes y proteínas', 'presentacion', 'porción', '90 g', EN_CASA],
    ['prep-pollo-desh', 'Pollo deshilachado', 'Carnes y proteínas', 'presentacion', 'porción', '140 g', EN_CASA],

    // Panes, palta, tomate, papas y camote.
    ['ins-pan-cubano', 'Pan cubano', 'Panes', 'unidad', 'unidad', '', COMPRADO],
    ['ins-roseta', 'Roseta', 'Panes', 'unidad', 'unidad', '', COMPRADO],
    ['ins-focaccia', 'Focaccia', 'Panes', 'unidad', 'unidad', '', COMPRADO],
    ['ins-masa-madre', 'Pan masa madre con semillas', 'Panes', 'unidad', 'unidad', '', COMPRADO],
    ['ins-palta', 'Palta', 'Verduras', 'unidad', 'unidad', '1 palta = 2 panes', COMPRADO],
    ['ins-tomate', 'Tomate', 'Verduras', 'unidad', 'unidad', '1 tomate = 2 panes', COMPRADO],
    ['ins-papas', 'Papas congeladas', 'Congelados', 'presentacion', 'porción', 'bolsa de 200 g', COMPRADO],
    ['ins-camote-crudo', 'Camote crudo', 'Verduras', 'gramos', 'g', 'se porciona y congela: sale Camote frito', COMPRADO],
    ['comp-camote-frito', 'Camote frito', 'Complementos', 'presentacion', 'porción', '', EN_CASA],

    // Salsas y aderezos: hechos en casa, al ojo, con la botella dispensadora.
    ['sal-rocoto-pic', 'Rocoto ahumado picante', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-rocoto-sin', 'Rocoto ahumado sin picante', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-aji-ahumado', 'Ají amarillo ahumado', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-aji-huacatay', 'Ají amarillo con ajo y huacatay', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-golf', 'Golf ahumada', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-culantro', 'Culantro y cebollín', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-pesto', 'Pesto de albahaca', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-glaseado', 'Glaseado Bravo', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-crema-aji', 'Crema de ají amarillo', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],
    ['sal-anticuchero', 'Aderezo anticuchero', 'Salsas y aderezos', 'ojo', '', '', EN_CASA],

    // Verduras al ojo (compradas) y complementos hechos en casa.
    ['ins-lechuga', 'Lechuga', 'Verduras', 'ojo', '', '', COMPRADO],
    ['ins-arugula', 'Arúgula', 'Verduras', 'ojo', '', '', COMPRADO],
    ['ins-cebollita', 'Cebollita', 'Verduras', 'ojo', '', '', COMPRADO],
    ['comp-chalaquita', 'Chalaquita encurtida', 'Complementos', 'ojo', '', '', EN_CASA],
    ['comp-sarsa', 'Sarsa criolla', 'Complementos', 'ojo', '', '', EN_CASA],
    ['comp-aros', 'Aros de cebolla', 'Complementos', 'presentacion', 'porción', '', EN_CASA],
    ['comp-quesos', 'Mix quesos Artesano', 'Complementos', 'presentacion', 'porción', '', EN_CASA],

    // Lácteos y secos.
    ['ins-paria', 'Queso Paria', 'Lácteos', 'gramos', 'g', '', COMPRADO],
    ['ins-huevo', 'Huevo', 'Secos', 'unidad', 'unidad', '', COMPRADO],
    ['ins-harina', 'Harina', 'Secos', 'ojo', '', '', COMPRADO],
    ['ins-panko', 'Panko', 'Secos', 'ojo', '', '', COMPRADO],

    // Bebidas: se preparan en casa.
    ['beb-chicha', 'Chicha', 'Bebidas', 'unidad', 'unidad', '', EN_CASA],
    ['beb-maracuya', 'Maracuyá', 'Bebidas', 'unidad', 'unidad', '', EN_CASA]
  ],

  // Insumos solo de producción, comprados: por porción hasta que se decida unidad o gramos. Su id sale del nombre.
  soloProduccion: [
    'Mayonesa', 'Kétchup', 'Mostaza', 'Humo líquido',
    'Rocoto', 'Ají amarillo', 'Ají limo', 'Ají panca', 'Ajo', 'Huacatay', 'Culantro', 'Cebollín',
    'Albahaca', 'Aceite de oliva', 'Aceite', 'Almendra', 'Cebolla roja', 'Limón', 'Pasta de tomate'
  ],
  // Condimentos de solo producción, comprados: al ojo. Su id sale del nombre.
  soloProduccionOjo: ['Sal', 'Pimienta negra', 'Comino', 'Ajinomoto', 'Laurel', 'Canela china',
    'Sazonador Doña Gusta carne', 'Sazonador Doña Gusta pollo/gallina'
  ],

  // Alias por id. "chancho", "carne" y "pollo crudo" apuntan solo al crudo.
  alias: {
    'ins-res-cruda': 'carne, res',
    'ins-chancho-crudo': 'chancho, cerdo',
    'ins-pollo-deshuesado': 'pollo crudo',
    'ins-portobello': 'hongo portobello',
    'comp-sarsa': 'aderezo criollo, salsa criolla',
    'comp-camote-frito': 'camote congelado'
  },

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
  const producto = (id, nombre, categoria, medicion, unidad, nota, origen) => {
    const ojo = medicion === 'ojo';
    return {
      id: id, nombre: nombre, alias: SEMILLA.alias[id] || '', categoria: categoria, medicion: medicion, unidad: ojo ? '' : unidad,
      stock_actual: ojo ? '' : 0, stock_minimo: ojo ? '' : 0, estado_actual: ojo ? NIVEL_INICIAL : '',
      nota: nota || '', revisar: 'sí', activo: true, origen: origen
    };
  };
  SEMILLA.insumos.forEach(([id, nombre, categoria, medicion, unidad, nota, origen]) => {
    if (!existentes[id]) nuevos.push(producto(id, nombre, categoria, medicion, unidad, nota, origen));
  });
  SEMILLA.soloProduccion.forEach((nombre) => {
    const id = 'ins-' + slug(nombre);
    if (!existentes[id]) nuevos.push(producto(id, nombre, 'Solo producción', 'presentacion', 'porción', '', COMPRADO));
  });
  SEMILLA.soloProduccionOjo.forEach((nombre) => {
    const id = 'ins-' + slug(nombre);
    if (!existentes[id]) nuevos.push(producto(id, nombre, 'Solo producción', 'ojo', '', '', COMPRADO));
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
