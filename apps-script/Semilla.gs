/**
 * SANTO — datos iniciales (salen de RECETAS.md, revisado con cocina el 07/10/2026).
 *
 * cargarSemilla() agrega lo que falta, comparando por id. No duplica nada si se corre dos veces
 * y no toca lo que ya existe (si cocina cambió una receta en la app, se respeta).
 * Formas de medir: conteo (porciones o unidades), nivel (salsas) y marcar (hay / falta).
 * Ya no se usan gramos: el gramaje queda solo como texto de referencia.
 */

const SEMILLA = {
  // [id, nombre, categoria, medicion, unidad_base, gramaje_ref]
  insumos: [
    // Proteínas: conteo en porciones, con control del día.
    ['prep-panceta', 'Panceta / Chicharrón', 'Proteínas', 'conteo', 'porción', '140 g'],
    ['prep-pollo', 'Pollo Invicto', 'Proteínas', 'conteo', 'porción', '150 g crudo'],
    ['prep-asado', 'Asado', 'Proteínas', 'conteo', 'porción', '120 g'],
    ['prep-portobello', 'Portobello anticuchero', 'Proteínas', 'conteo', 'porción', '90 g'],
    ['prep-fiambres', 'Mix fiambres Artesano', 'Proteínas', 'conteo', 'porción', '90 g'],
    ['prep-pollo-desh', 'Pollo deshilachado', 'Proteínas', 'conteo', 'porción', '140 g'],

    // Panes, palta, tomate y papas: conteo.
    ['ins-pan-cubano', 'Pan cubano', 'Panes', 'conteo', 'unidad', ''],
    ['ins-roseta', 'Roseta', 'Panes', 'conteo', 'unidad', ''],
    ['ins-focaccia', 'Focaccia', 'Panes', 'conteo', 'unidad', ''],
    ['ins-masa-madre', 'Pan masa madre con semillas', 'Panes', 'conteo', 'unidad', ''],
    ['ins-palta', 'Palta', 'Verduras', 'conteo', 'unidad', '1 palta = 2 panes'],
    ['ins-tomate', 'Tomate', 'Verduras', 'conteo', 'unidad', '1 tomate = 2 panes'],
    ['ins-papas', 'Papas congeladas', 'Congelados', 'conteo', 'porción', 'bolsa de 200 g'],

    // Salsas: nivel del pote.
    ['sal-rocoto-pic', 'Rocoto ahumado picante', 'Salsas', 'nivel', '', ''],
    ['sal-rocoto-sin', 'Rocoto ahumado sin picante', 'Salsas', 'nivel', '', ''],
    ['sal-aji-ahumado', 'Ají amarillo ahumado', 'Salsas', 'nivel', '', ''],
    ['sal-aji-huacatay', 'Ají amarillo con ajo y huacatay', 'Salsas', 'nivel', '', ''],
    ['sal-golf', 'Golf ahumada', 'Salsas', 'nivel', '', ''],
    ['sal-culantro', 'Culantro y cebollín', 'Salsas', 'nivel', '', ''],
    ['sal-pesto', 'Pesto de albahaca', 'Salsas', 'nivel', '', ''],
    ['sal-glaseado', 'Glaseado Bravo', 'Salsas', 'nivel', '', ''],
    ['sal-crema-aji', 'Crema de ají amarillo', 'Salsas', 'nivel', '', ''],

    // Ingredientes: solo se marca si hay o si falta.
    ['ins-lechuga', 'Lechuga', 'Verduras', 'marcar', '', ''],
    ['ins-arugula', 'Arúgula', 'Verduras', 'marcar', '', ''],
    ['comp-chalaquita', 'Chalaquita encurtida', 'Complementos', 'marcar', '', ''],
    ['comp-camote-frito', 'Camote frito', 'Complementos', 'marcar', '', ''],
    ['comp-aros', 'Aros de cebolla', 'Complementos', 'marcar', '', ''],
    ['comp-sarsa', 'Sarsa criolla', 'Complementos', 'marcar', '', ''], // D2: pendiente si se quita
    ['comp-quesos', 'Mix quesos Artesano', 'Complementos', 'marcar', '', ''],
    ['ins-paria', 'Queso Paria', 'Lácteos', 'marcar', '', ''],
    ['ins-harina', 'Harina', 'Secos', 'marcar', '', ''],
    ['ins-huevo', 'Huevo', 'Secos', 'marcar', '', ''],
    ['ins-panko', 'Panko', 'Secos', 'marcar', '', '']
  ],

  // Insumos solo de producción: se marcan (hay / falta). Su id sale del nombre ("ins-" + slug).
  soloProduccion: [
    'Mayonesa', 'Kétchup', 'Mostaza', 'Humo líquido', 'Ajinomoto', 'Sal', 'Pimienta negra', 'Comino', 'Laurel',
    'Canela china', 'Rocoto', 'Ají amarillo', 'Ají limo', 'Ají panca', 'Ajo', 'Huacatay', 'Culantro', 'Cebollín',
    'Albahaca', 'Aceite de oliva', 'Aceite', 'Almendra', 'Cebolla roja', 'Limón', 'Pasta de tomate', 'Camote',
    'Pollo deshuesado', 'Sazonador Doña Gusta carne', 'Sazonador Doña Gusta pollo/gallina'
  ],

  // Bebidas: se venden solas (conteo, unidades). [id, nombre]
  bebidas: [
    ['beb-chicha', 'Chicha'],
    ['beb-maracuya', 'Maracuyá']
  ],

  // Lo que descuenta "Hice un lote". La cantidad por lote arranca vacía: cocina la define en Ajustes.
  // { salsa: insumo que se descuenta }
  lotes: { 'sal-glaseado': 'beb-chicha' },

  // [id, nombre, grupo, estado, [[insumo_id, cantidad], ...]] — lo que lleva UN producto vendido.
  // Solo casillas de conteo: porciones (proteínas y papas) o unidades.
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

// Nada trae stock ni mínimo inventado: todo lo que se cuenta arranca en 0 y sin mínimo.
// Los números reales se ponen en la Revisión inicial y los mínimos en Ajustes.
function cargarSemilla() {
  // Casillas
  const existentes = {};
  leerTabla('Insumos').forEach((i) => { existentes[i.id] = true; });
  const nuevos = [];
  const insumo = (id, nombre, categoria, tipo, medicion, unidad, gramaje) => ({
    id: id, nombre: nombre, categoria: categoria, tipo: tipo, medicion: medicion,
    unidad_base: medicion === 'conteo' ? unidad : '', gramaje_ref: gramaje || '',
    stock_actual: medicion === 'conteo' ? 0 : '', stock_minimo: medicion === 'conteo' ? 0 : '',
    estado_actual: ESTADO_INICIAL[medicion] || '',
    lote_insumo_id: SEMILLA.lotes[id] || '', lote_cantidad: '', proveedor: '', activo: true
  });
  SEMILLA.insumos.forEach(([id, nombre, categoria, medicion, unidad, gramaje]) => {
    if (!existentes[id]) nuevos.push(insumo(id, nombre, categoria, 'ingrediente', medicion, unidad, gramaje));
  });
  SEMILLA.soloProduccion.forEach((nombre) => {
    const id = 'ins-' + slug(nombre);
    if (!existentes[id]) nuevos.push(insumo(id, nombre, 'Solo producción', 'ingrediente', 'marcar', '', ''));
  });
  SEMILLA.bebidas.forEach(([id, nombre]) => {
    if (!existentes[id]) nuevos.push(insumo(id, nombre, 'Bebidas', 'bebida', 'conteo', 'unidad', ''));
  });
  agregarFilas('Insumos', nuevos);

  // Recetas: solo se cargan los ingredientes de las recetas que recién se crean.
  const recetasExistentes = {};
  leerTabla('Recetas').forEach((r) => { recetasExistentes[r.id] = true; });
  const recetas = [];
  const ingredientes = [];
  SEMILLA.recetas.forEach(([id, nombre, grupo, estado, items]) => {
    if (recetasExistentes[id]) return;
    recetas.push({ id: id, nombre: nombre, grupo: grupo, estado: estado, activa: true, notas: '' });
    items.forEach(([insumoId, cantidad]) => ingredientes.push({ receta_id: id, insumo_id: insumoId, cantidad: cantidad }));
  });
  agregarFilas('Recetas', recetas);
  agregarFilas('RecetaIngredientes', ingredientes);

  recalcularStocks();
  console.log('Semilla: ' + nuevos.length + ' casillas y ' + recetas.length + ' recetas nuevas.');
}
