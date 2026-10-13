// ---------------------------------------------------------------------------
// Núcleo del inventario: productos activos, movimientos, stock y niveles al ojo. Lo usan todas las páginas.
// ---------------------------------------------------------------------------

function insumosActivos() {
  return leerTabla('Insumos').filter((i) => activo(i.activo)).map((i) => {
    const medicion = MEDICIONES.indexOf(i.medicion) >= 0 ? i.medicion : 'unidad';
    const ojo = medicion === 'ojo';
    return {
      id: i.id, nombre: i.nombre, alias: String(i.alias || ''), categoria: i.categoria || 'Otros',
      medicion: medicion, unidad: ojo ? '' : String(i.unidad || UNIDAD_POR_DEFECTO[medicion]),
      stock_actual: ojo ? 0 : num(i.stock_actual), stock_minimo: ojo ? 0 : num(i.stock_minimo),
      estado_actual: ojo ? (NIVELES.indexOf(i.estado_actual) >= 0 ? i.estado_actual : NIVEL_INICIAL) : '',
      nota: String(i.nota || ''), revisar: marcado(i.revisar), origen: origenDe(i)
    };
  });
}

// Escribe algunas columnas de una fila de Insumos.
function ponerCampos(fila, campos) {
  const sh = hoja('Insumos');
  Object.keys(campos).forEach((col) => sh.getRange(fila, HOJAS.Insumos.indexOf(col) + 1).setValue(campos[col]));
}

// Un movimiento de hoy hecho a mano. extra cambia lo que haga falta (fecha, nota, precio, origen…).
function movimiento(insumoId, tipo, cantidad, ctx, extra) {
  return Object.assign({
    id: nuevoId('mov'), fecha: hoyLima(), hora: horaLima(), insumo_id: insumoId, tipo: tipo,
    cantidad: cantidad, precio: '', origen: 'manual', nota: '', usuario: ctx.usuario
  }, extra || {});
}

// Solo los movimientos de una fecha: lee la columna de fechas y después únicamente el bloque de filas de ese día.
function movimientosDeFecha(fecha) {
  const sh = hoja('Movimientos');
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  const cab = HOJAS.Movimientos;
  const fechas = sh.getRange(2, cab.indexOf('fecha') + 1, ultima - 1, 1).getValues().map((r) => normalizar('fecha', r[0]));
  const desde = fechas.indexOf(fecha);
  if (desde < 0) return [];
  const hasta = fechas.lastIndexOf(fecha);
  return sh.getRange(desde + 2, 1, hasta - desde + 1, cab.length).getValues()
    .map((r, k) => aObjeto(cab, r, desde + 2 + k))
    .filter((m) => m.fecha === fecha);
}

function valorMovimiento(m) {
  const signo = SIGNO_MOVIMIENTO[m.tipo] || 0;
  return m.tipo === 'ajuste_conteo' ? num(m.cantidad) : signo * Math.abs(num(m.cantidad));
}

// stock_actual de lo que se cuenta = suma de todos sus movimientos. Se escribe la columna entera de una vez.
// Lo que va al ojo no tiene stock. Al final avisa por Telegram de lo que quedó bajo el mínimo.
function recalcularStocks() {
  const totales = {};
  leerTabla('Movimientos').forEach((m) => {
    totales[m.insumo_id] = (totales[m.insumo_id] || 0) + valorMovimiento(m);
  });
  const insumos = leerTabla('Insumos');
  if (!insumos.length) return;
  const stock = (i) => (i.medicion === 'ojo' ? '' : redondear(totales[i.id] || 0));
  const col = HOJAS.Insumos.indexOf('stock_actual') + 1;
  const sh = hoja('Insumos');
  // Las filas de leerTabla pueden tener huecos; se escribe fila por fila solo si hay huecos.
  const contiguas = insumos.every((i, k) => i._fila === k + 2);
  if (contiguas) {
    sh.getRange(2, col, insumos.length, 1).setValues(insumos.map((i) => [stock(i)]));
  } else {
    insumos.forEach((i) => sh.getRange(i._fila, col).setValue(stock(i)));
  }

  alertar(insumos
    .filter((i) => activo(i.activo) && stock(i) !== '' && num(i.stock_minimo) > 0 && stock(i) < num(i.stock_minimo))
    .map((i) => ({
      id: i.id,
      texto: 'Comprar ' + i.nombre + ': quedan ' + cantidadTexto(stock(i), i.unidad) +
        ' (mínimo ' + cantidadTexto(num(i.stock_minimo), i.unidad) + ')'
    })));
}

// Cambia el nivel de varios productos al ojo (sin bloqueo: lo pone quien llama). Devuelve cuántos cambiaron.
// Lo que queda en bajo o vacío avisa por Telegram.
function aplicarNiveles(lista, ctx) {
  if (!lista.length) return 0;
  const porId = {};
  leerTabla('Insumos').forEach((i) => { porId[i.id] = i; });
  const sh = hoja('Insumos');
  const col = HOJAS.Insumos.indexOf('estado_actual') + 1;
  const hora = horaLima();
  const movs = [];
  const alertas = [];
  lista.forEach((c) => {
    const i = porId[String(c.insumo_id || '')];
    if (!i || !activo(i.activo) || i.medicion !== 'ojo') {
      throw new ErrorApp('No se encontró uno de los productos al ojo. Recarga la página.', 'datos');
    }
    const nivel = String(c.estado || '').trim().toLowerCase();
    if (NIVELES.indexOf(nivel) < 0) throw new ErrorApp('Nivel inválido para ' + i.nombre + '.', 'datos');
    if (i.estado_actual === nivel) return;
    sh.getRange(i._fila, col).setValue(nivel);
    i.estado_actual = nivel;
    movs.push(movimiento(i.id, 'nivel', '', ctx, { hora: hora, nota: nivel }));
    if (NIVELES_ALERTA.indexOf(nivel) >= 0) {
      alertas.push({ id: i.id, texto: i.nombre + ' está en ' + capital(nivel) + ' (marcó ' + ctx.usuario + ', ' + hora + ')' });
    }
  });
  agregarFilas('Movimientos', movs);
  alertar(alertas);
  return movs.length;
}

// Los movimientos de una producción comparten el origen "produccion:<id>".
const esProduccion = (m) => String(m.origen).indexOf('produccion:') === 0;
