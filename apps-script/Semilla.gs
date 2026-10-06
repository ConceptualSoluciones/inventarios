/**
 * SANTO — datos iniciales (salen de RECETAS.md, ficha de gramajes vigente al 05/10/2026).
 *
 * cargarSemilla() agrega lo que falta, comparando por id. No duplica nada si se corre dos veces
 * y no toca lo que ya existe (si cocina cambió una receta en la app, se respeta).
 * Unidades: todo en g, salvo panes, huevo y bebidas, que van en unidades.
 * porcion_g: si la tiene, la app muestra y pide esa casilla en porciones, pero guarda gramos.
 */

const SEMILLA = {
  // [id, nombre, categoria, unidad_base, porcion_g]
  insumos: [
    ['prep-panceta', 'Panceta Bravo', 'Proteínas', 'g', 140],
    ['prep-pollo', 'Pollo Invicto', 'Proteínas', 'g', 150],
    ['prep-asado-res', 'Asado de res', 'Proteínas', 'g', 120],
    ['prep-asado-criollo', 'Asado criollo', 'Proteínas', 'g', 120],
    ['prep-chicharron', 'Chicharrón', 'Proteínas', 'g', 140],
    ['prep-portobello', 'Portobello anticuchero', 'Proteínas', 'g', 90],
    ['prep-fiambres', 'Mix fiambres', 'Proteínas', 'g', 90],
    ['prep-pollo-desh', 'Pollo deshilachado', 'Proteínas', 'g', 140],

    ['sal-rocoto-pic', 'Rocoto ahumado picante', 'Salsas', 'g', 0],
    ['sal-rocoto-sin', 'Rocoto ahumado sin picante', 'Salsas', 'g', 0],
    ['sal-aji-ahumado', 'Ají amarillo ahumado', 'Salsas', 'g', 0],
    ['sal-aji-huacatay', 'Ají amarillo, ajo y huacatay', 'Salsas', 'g', 0],
    ['sal-golf', 'Golf ahumada', 'Salsas', 'g', 0],
    ['sal-culantro', 'Culantro y cebollín', 'Salsas', 'g', 0],
    ['sal-pesto', 'Pesto de albahaca', 'Salsas', 'g', 0],
    ['sal-glaseado', 'Glaseado Bravo', 'Salsas', 'g', 0],
    ['sal-crema-aji', 'Crema de ají amarillo', 'Salsas', 'g', 0],

    ['comp-sarsa', 'Sarsa criolla', 'Complementos', 'g', 40],
    ['comp-chalaquita', 'Chalaquita encurtida', 'Complementos', 'g', 40],
    ['comp-quesos', 'Mix quesos Artesano', 'Complementos', 'g', 50],
    ['comp-camote-hilo', 'Camote al hilo', 'Complementos', 'g', 30],
    ['comp-camote-frito', 'Camote frito', 'Complementos', 'g', 70],
    ['comp-aros', 'Aros de cebolla', 'Complementos', 'g', 25],
    ['comp-mantequilla', 'Mantequilla de ajo', 'Complementos', 'g', 10],

    ['ins-pan-cubano', 'Pan cubano', 'Panes', 'unidad', 0],
    ['ins-roseta', 'Roseta', 'Panes', 'unidad', 0],
    ['ins-focaccia', 'Focaccia', 'Panes', 'unidad', 0],
    ['ins-masa-madre', 'Pan masa madre con semillas', 'Panes', 'unidad', 0],
    ['ins-palta', 'Palta (neto)', 'Verduras', 'g', 0],
    ['ins-lechuga', 'Lechuga', 'Verduras', 'g', 0],
    ['ins-tomate', 'Tomate', 'Verduras', 'g', 0],
    ['ins-arugula', 'Arúgula', 'Verduras', 'g', 0],
    ['ins-paria', 'Queso Paria', 'Lácteos', 'g', 0],
    ['ins-jamon', 'Jamón del país', 'Fiambres', 'g', 0],
    ['ins-harina', 'Harina', 'Secos', 'g', 0],
    ['ins-panko', 'Panko', 'Secos', 'g', 0],
    ['ins-huevo', 'Huevo', 'Secos', 'unidad', 0],
    ['ins-papas', 'Papas fritas', 'Congelados', 'g', 0]
  ],

  // Insumos solo de producción: existen en el inventario y bajan solo con salidas manuales.
  soloProduccion: [
    'Mayonesa', 'Kétchup', 'Mostaza', 'Humo líquido', 'Ajinomoto', 'Sal', 'Pimienta negra', 'Comino', 'Laurel',
    'Canela china', 'Rocoto', 'Ají amarillo', 'Ají limo', 'Ají panca', 'Ajo', 'Huacatay', 'Culantro', 'Cebollín',
    'Albahaca', 'Aceite de oliva', 'Aceite', 'Parmesano', 'Almendra', 'Cebolla roja', 'Limón', 'Panceta',
    'Carne para asado', 'Salami ahumado', 'Queso Edam', 'Queso Gouda', 'Mozzarella', 'Pasta de tomate',
    'Concentrado de chicha', 'Portobello', 'Camote', 'Pollo deshuesado', 'Sazonador Doña Gusta carne',
    'Sazonador Doña Gusta pollo/gallina'
  ],

  // Bebidas: se venden solas. Stock y mínimo que dio el equipo.
  // [id, nombre, stock, minimo]
  bebidas: [
    ['beb-chicha', 'Chicha', 2, 3],
    ['beb-maracuya', 'Maracuyá', 6, 3]
  ],

  // [id, nombre, grupo, estado, [[insumo_id, cantidad], ...]] — lo que lleva UN producto vendido
  recetas: [
    ['rec-artesano', 'El Artesano', 'cultos', 'vigente',
      [['ins-masa-madre', 1], ['comp-mantequilla', 10], ['prep-fiambres', 90], ['comp-quesos', 50], ['sal-pesto', 40], ['ins-arugula', 20]]],
    ['rec-bravo-pic', 'El Bravo (picante)', 'cultos', 'vigente',
      [['ins-pan-cubano', 1], ['prep-panceta', 140], ['sal-glaseado', 30], ['sal-rocoto-pic', 40], ['comp-chalaquita', 40]]],
    ['rec-bravo-sin', 'El Bravo (sin picante)', 'cultos', 'vigente',
      [['ins-pan-cubano', 1], ['prep-panceta', 140], ['sal-glaseado', 30], ['sal-rocoto-sin', 40], ['comp-chalaquita', 40]]],
    ['rec-invicto', 'El Invicto', 'cultos', 'vigente',
      [['ins-pan-cubano', 1], ['prep-pollo', 150], ['ins-harina', 30], ['ins-huevo', 0.5], ['ins-panko', 40], ['ins-lechuga', 30], ['ins-tomate', 40], ['ins-palta', 50], ['sal-culantro', 20]]],
    ['rec-fenomeno', 'El Fenómeno', 'cultos', 'vigente',
      [['ins-focaccia', 1], ['prep-portobello', 90], ['ins-paria', 50], ['comp-aros', 25], ['ins-arugula', 15], ['sal-culantro', 20]]],
    ['rec-incondicional', 'El Incondicional', 'cultos', 'vigente',
      [['ins-pan-cubano', 1], ['prep-asado-res', 120], ['ins-palta', 50], ['comp-camote-hilo', 30], ['ins-arugula', 15], ['sal-aji-ahumado', 40]]],

    ['rec-chicharron', 'Pan con chicharrón', 'criollos', 'vigente',
      [['ins-roseta', 1], ['prep-chicharron', 140], ['comp-camote-frito', 70], ['comp-sarsa', 40]]],
    ['rec-asado-criollo', 'Asado criollo', 'criollos', 'vigente',
      [['ins-pan-cubano', 1], ['prep-asado-criollo', 120], ['ins-palta', 50], ['comp-sarsa', 40]]],
    ['rec-butifarra', 'Butifarra', 'criollos', 'vigente',
      [['ins-roseta', 1], ['ins-jamon', 100], ['comp-sarsa', 40]]],
    ['rec-pollo-desh', 'Pollo deshilachado', 'criollos', 'provisional',
      [['ins-pan-cubano', 1], ['prep-pollo-desh', 140], ['ins-lechuga', 20], ['sal-crema-aji', 15]]],
    ['rec-choripan', 'Choripán vegano', 'criollos', 'sin_ficha', []],
    ['rec-kids', 'Kids', 'criollos', 'sin_ficha', []],

    // Papas: un solo producto. El combo lleva papas + una bebida (una línea por bebida, como El Bravo).
    ['rec-papas', 'Papas', 'papas', 'vigente', [['ins-papas', 200]]],
    ['rec-combo-chicha', 'Combo papas + Chicha', 'papas', 'vigente', [['ins-papas', 200], ['beb-chicha', 1]]],
    ['rec-combo-maracuya', 'Combo papas + Maracuyá', 'papas', 'vigente', [['ins-papas', 200], ['beb-maracuya', 1]]]
  ],

  // Recetas de versiones anteriores que ya no se venden: se desactivan (no se borran, para no perder historial).
  retiradas: ['rec-papas-200', 'rec-papas-150']
};

function cargarSemilla() {
  const ctx = { usuario: 'semilla' };
  const hoy = hoyLima();
  const hora = horaLima();

  // Insumos
  const existentes = {};
  leerTabla('Insumos').forEach((i) => { existentes[i.id] = true; });
  const nuevos = [];
  const movimientos = [];
  const insumo = (id, nombre, categoria, tipo, unidad, porcion, minimo) => ({
    id: id, nombre: nombre, categoria: categoria, tipo: tipo, unidad_base: unidad, porcion_g: porcion || '',
    stock_actual: 0, stock_minimo: minimo || 0, proveedor: '', activo: true
  });
  SEMILLA.insumos.forEach(([id, nombre, categoria, unidad, porcion]) => {
    if (!existentes[id]) nuevos.push(insumo(id, nombre, categoria, 'ingrediente', unidad, porcion, 0));
  });
  SEMILLA.soloProduccion.forEach((nombre) => {
    const id = 'ins-' + slug(nombre);
    if (!existentes[id]) nuevos.push(insumo(id, nombre, 'Solo producción', 'ingrediente', 'g', 0, 0));
  });
  SEMILLA.bebidas.forEach(([id, nombre, stock, minimo]) => {
    if (existentes[id]) return;
    nuevos.push(insumo(id, nombre, 'Bebidas', 'bebida', 'unidad', 0, minimo));
    if (stock > 0) {
      movimientos.push({
        id: nuevoId('mov'), fecha: hoy, hora: hora, insumo_id: id, tipo: 'ajuste',
        cantidad: stock, origen: 'manual', nota: 'Stock inicial', usuario: ctx.usuario
      });
    }
  });
  agregarFilas('Insumos', nuevos);
  agregarFilas('Movimientos', movimientos);

  // Recetas: solo se cargan los ingredientes de las recetas que recién se crean.
  const recetasExistentes = {};
  const colActiva = HOJAS.Recetas.indexOf('activa') + 1;
  leerTabla('Recetas').forEach((r) => {
    recetasExistentes[r.id] = true;
    if (SEMILLA.retiradas.indexOf(r.id) >= 0 && activo(r.activa)) hoja('Recetas').getRange(r._fila, colActiva).setValue(false);
  });
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
