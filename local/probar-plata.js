// La parte que más importa: la plata. Estas alertas no deciden nada — avisan.
// Cada caso dice qué pasaría en la planilla y qué tiene que hacer la app.
const { cargar } = require('./cargar.js');
const G = cargar();

let fallas = 0, corridos = 0;
function caso(nombre, porque, fn) {
  corridos++;
  try {
    const r = fn();
    if (r === true) { console.log('  ok    ' + nombre); return; }
    fallas++;
    console.log('  FALLA ' + nombre + '\n        ' + r + '\n        importa porque: ' + porque);
  } catch (e) {
    fallas++;
    console.log('  ERROR ' + nombre + '\n        ' + e.message + '\n        importa porque: ' + porque);
  }
}

const H = ['nombre','email','celular','actividad','horario','medio','comprobante','monto','verif','fecha','Edición'];
const fila = (o) => [o.nombre||'', o.email||'', '', '', o.horario||'', o.medio||'', o.comprobante||'', o.monto||'', o.verificado||'', '', o.edicion||''];
const HOY = new Date(2026, 10, 1);   // 1 de noviembre de 2026

// Arma un estado con una sola edición y la gente que se le pase.
function armar(edicion, cupo, gente, formula, estado, extras) {
  const crudo = {
    panelValores: [
      ['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
      [edicion.split('—')[0].trim(), edicion, String(cupo), String(gente.length), String(cupo - gente.length), estado || 'Abierto']
    ],
    panelFormulas: [
      ['','','','','',''],
      ['','','', formula || "=COUNTIF('Inscriptos Noviembre 2026'!K:K;B2)", '','']
    ],
    hojas: { 'Inscriptos Noviembre 2026': [H].concat(gente.map(g => fila({ ...g, edicion }))) },
    extras: extras || {}
  };
  return G.construirEstado(crudo, HOY);
}
const tipos = (e, t) => e.alertas.filter(a => a.tipo === t);

console.log('\n--- El precio del curso quedó viejo en el código ---');
caso(
  'si todos pagan un precio distinto al del código, avisa',
  'el precio está escrito a mano; el día que cambie, la app calcularía las deudas contra el viejo y nadie se enteraría',
  () => {
    const e = armar('Curso de cocina — Noviembre 2026', 15,
      [{nombre:'A',monto:'13500'},{nombre:'B',monto:'13500'},{nombre:'C',monto:'13500'},{nombre:'D',monto:'13500'}]);
    const a = tipos(e, 'precio_viejo');
    if (a.length !== 1) return 'esperaba 1 alerta, hubo ' + a.length;
    if (!/13\.500/.test(a[0].detalle)) return 'no dice el precio nuevo: ' + a[0].detalle;
    if (!/12\.200/.test(a[0].detalle)) return 'no dice contra qué está calculando: ' + a[0].detalle;
    return true;
  }
);
caso(
  'si el precio sigue siendo el del código, no dice nada',
  'una alerta que aparece cuando está todo bien hace que se dejen de mirar todas',
  () => tipos(armar('Curso de cocina — Noviembre 2026', 15,
      [{nombre:'A',monto:'12200'},{nombre:'B',monto:'12200'},{nombre:'C',monto:'12200'},{nombre:'D',monto:'4800'}]), 'precio_viejo').length === 0
      || 'saltó sin motivo'
);
caso(
  'si la mayoría paga la cuota, tampoco',
  'pagar en cuotas es normal, no es que el precio cambió',
  () => tipos(armar('Curso de cocina — Noviembre 2026', 15,
      [{nombre:'A',monto:'4800'},{nombre:'B',monto:'4800'},{nombre:'C',monto:'4800'}]), 'precio_viejo').length === 0
      || 'confundió las cuotas con un precio nuevo'
);
caso(
  'con dos pagos no concluye nada',
  'dos personas no son evidencia de que cambió el precio; sería una alerta al voleo',
  () => tipos(armar('Curso de cocina — Noviembre 2026', 15,
      [{nombre:'A',monto:'13500'},{nombre:'B',monto:'13500'}]), 'precio_viejo').length === 0
      || 'concluyó con dos pagos'
);
caso(
  'una edición del curso cerrada y pasada no dispara la alerta',
  'los precios viejos de ediciones viejas son correctos, no un error',
  () => tipos(armar('Curso de cocina — Enero 2026', 15,
      [{nombre:'A',monto:'9000'},{nombre:'B',monto:'9000'},{nombre:'C',monto:'9000'},{nombre:'D',monto:'9000'}],
      null, 'Cerrado'), 'precio_viejo').length === 0
      || 'alertó por una edición vieja'
);

console.log('\n--- Montos que no pueden ser un pago de verdad ---');
caso(
  'un monto irrisorio al lado del resto se avisa',
  'suma al cobrado como si fuera un pago entero y esa persona figura como que pagó',
  () => {
    const e = armar('Taller de pastas — 12/11/2026', 12,
      [{nombre:'A',monto:'2600'},{nombre:'B',monto:'2600'},{nombre:'C',monto:'2600'},{nombre:'D',monto:'2600'},{nombre:'Rara',monto:'433,33'}]);
    const a = tipos(e, 'monto_raro');
    if (a.length !== 1) return 'esperaba 1, hubo ' + a.length + ': ' + a.map(x=>x.texto).join(' | ');
    if (!/Rara/.test(a[0].texto)) return 'señaló a otra persona: ' + a[0].texto;
    return true;
  }
);
caso(
  'pagar por dos NO se toma como pago chico',
  'Leo dijo que no se infieran acompañantes; el que paga 5200 en un taller de 2600 pagó por dos, no debe nada',
  () => tipos(armar('Taller de pastas — 12/11/2026', 12,
      [{nombre:'A',monto:'2600'},{nombre:'B',monto:'2600'},{nombre:'C',monto:'5200'},{nombre:'D',monto:'5200'},{nombre:'E',monto:'10400'}]), 'monto_raro').length === 0
      || 'trató un pago grupal como si faltara plata'
);
caso(
  'con pocos pagos no compara',
  'con dos o tres montos cualquier diferencia parece una anomalía',
  () => tipos(armar('Taller de pastas — 12/11/2026', 12,
      [{nombre:'A',monto:'2600'},{nombre:'B',monto:'100'}]), 'monto_raro').length === 0
      || 'comparó con dos pagos'
);
caso(
  'en el curso no se usa esta alerta',
  'ahí las señas son normales y ya se muestran como pago parcial: repetirlo sería ruido',
  () => tipos(armar('Curso de cocina — Noviembre 2026', 15,
      [{nombre:'A',monto:'12200'},{nombre:'B',monto:'12200'},{nombre:'C',monto:'12200'},{nombre:'D',monto:'12200'},{nombre:'Seña',monto:'2000'}]), 'monto_raro').length === 0
      || 'duplicó el aviso de seña en el curso'
);

console.log('\n--- La columna "pago verificado" (hoy vacía en toda la planilla) ---');
caso(
  'vacía no cambia nada',
  'está vacía en las 102 filas: si vacío significara "no verificado", la app marcaría todo para revisar',
  () => {
    const e = armar('Taller de pastas — 12/11/2026', 12, [{nombre:'A',monto:'2600'}]);
    const p = e.ediciones[0].personas[0];
    return (p.estadoPago === 'completo' && !p.enDuda) || 'dio ' + p.estadoPago;
  }
);
caso(
  'un "no" ahí saca el pago de "pagado"',
  'si él marcó que no está verificado, la app no puede darlo por bueno',
  () => {
    const e = armar('Taller de pastas — 12/11/2026', 12, [{nombre:'Dudoso',monto:'2600',verificado:'no'}]);
    const p = e.ediciones[0].personas[0];
    return (p.estadoPago === 'revisar' && p.enDuda === 2600) || 'dio ' + p.estadoPago + ' / ' + p.enDuda;
  }
);
caso(
  'y sale una alerta alta con la plata en duda',
  'ese monto sigue sumando al cobrado: hay que poder verlo, no que quede escondido',
  () => {
    const e = armar('Taller de pastas — 12/11/2026', 12, [{nombre:'Dudoso',monto:'2600',verificado:'pendiente'}]);
    const a = tipos(e, 'sin_verificar');
    if (a.length !== 1) return 'esperaba 1 alerta, hubo ' + a.length;
    if (a[0].nivel !== 'alta') return 'la alerta es ' + a[0].nivel;
    // El monto va en el detalle y no en el texto: el texto se muestra en la
    // portada, donde no se muestra plata. Pero tiene que estar en algún lado.
    if (!/2\.600/.test(a[0].detalle)) return 'no dice cuánta plata: ' + a[0].detalle;
    if (/\$/.test(a[0].texto)) return 'el texto lleva plata y se ve en la portada: ' + a[0].texto;
    if (a[0].conPlata !== true) return 'no quedó marcada como alerta con plata';
    return true;
  }
);
caso(
  'un "sí" no molesta',
  'marcar que está verificado tiene que ser lo normal, no disparar nada',
  () => {
    const e = armar('Taller de pastas — 12/11/2026', 12, [{nombre:'A',monto:'2600',verificado:'sí'}]);
    return (e.ediciones[0].personas[0].estadoPago === 'completo' && tipos(e,'sin_verificar').length === 0)
      || 'un pago verificado disparó algo'
  }
);

caso(
  '«completo» ahí da el curso por pagado aunque falte plata',
  'Leo a veces decide no cobrar la diferencia («dejalo en 12000»): sin esto la app le sigue diciendo que le falta $200',
  () => {
    const e = armar('Curso de cocina — Noviembre 2026', 15, [{nombre:'A',monto:'12000',verificado:'completo'}]);
    const p = e.ediciones[0].personas[0];
    if (p.estadoPago !== 'completo' || p.saldo !== 0) return 'dio ' + p.estadoPago + ' / ' + p.saldo;
    if (!/completo/i.test(p.nota || '')) return 'no dice por qué quedó completo: ' + p.nota;
    return (tipos(e, 'pago').length === 0) || 'sigue saliendo la alerta de pago';
  }
);
caso(
  'sin la marca (o con un «sí»), 12.000 en el curso sigue siendo una seña',
  'la marca es la excepción que pone Leo, no un redondeo: $200 de menos sin decisión suya se avisa',
  () => {
    for (const v of ['', 'sí', 'verificado']) {
      const p = armar('Curso de cocina — Noviembre 2026', 15, [{nombre:'A',monto:'12000',verificado:v}]).ediciones[0].personas[0];
      if (p.estadoPago !== 'parcial' || p.saldo !== 200) return 'con «' + v + '» dio ' + p.estadoPago + ' / ' + p.saldo;
    }
    return true;
  }
);

console.log('\n--- Lo que ya andaba, que no se rompa ---');
caso(
  'una seña en el curso sigue mostrando cuánto falta',
  'es el caso real que Leo mira todos los días',
  () => {
    const e = armar('Curso de cocina — Noviembre 2026', 15, [{nombre:'Seña',monto:'3000'}]);
    const p = e.ediciones[0].personas[0];
    return (p.estadoPago === 'parcial' && p.saldo === 9200) || 'dio ' + p.estadoPago + ' / ' + p.saldo;
  }
);
caso(
  '"ya esta pago" sin monto va a revisar, no a pagado',
  'un texto no es un pago; darlo por bueno esconde plata que puede faltar',
  () => {
    const e = armar('Taller de pastas — 12/11/2026', 12, [{nombre:'X',monto:'no tengo / ya esta pago'}]);
    return e.ediciones[0].personas[0].estadoPago === 'revisar' || 'dio ' + e.ediciones[0].personas[0].estadoPago;
  }
);
caso(
  'el mismo comprobante con monto en dos filas se avisa',
  'puede estar inflando el cobrado al doble sin que se note',
  () => {
    const e = armar('Taller de pastas — 12/11/2026', 12,
      [{nombre:'A',monto:'5200',comprobante:'BBVA 998877665'},{nombre:'B',monto:'5200',comprobante:'BBVA 998877665'}]);
    return tipos(e, 'comprobante_repetido').length === 1 || 'no avisó del comprobante repetido';
  }
);

console.log('\n--- Tikzet ---');
// Las ventas de Tikzet se cargan a mano: es donde más se rompe.
function conTikzet(gente, estado) {
  const e = armar('Taller de tapeo — 12/11/2026', 20, gente, null, estado);
  return e.tikzet;
}
const T = (nombre, monto) => ({ nombre: nombre, monto: monto, medio: 'Tikzet' });

caso(
  'suma las entradas y la plata de la edición que viene',
  'es lo que Leo cruza contra el panel de Tikzet',
  () => {
    const t = conTikzet([T('A', '2600'), T('B', '2600'), { nombre: 'C', monto: '2600', medio: 'transferencia' }]);
    return (t.entradas === 2 && t.recaudado === 5200) || 'dio ' + t.entradas + ' entradas / ' + t.recaudado;
  }
);
caso(
  'cuenta las que no tienen el monto cargado',
  'una venta sin monto hace que el cobrado quede corto y no se note',
  () => {
    const t = conTikzet([T('A', '2600'), T('B', '')]);
    return (t.sinMonto === 1 && t.recaudado === 2600) || 'sinMonto=' + t.sinMonto + ', recaudado=' + t.recaudado;
  }
);
caso(
  'una entrada cubierta por otro pago no cuenta como faltante',
  'es un caso normal, no un error de carga: alertarlo sería ruido',
  () => {
    const t = conTikzet([T('A', '2600'), { nombre: 'B', monto: '', medio: 'Tikzet', comprobante: 'mismo pago que A' }]);
    return t.sinMonto === 0 || 'contó ' + t.sinMonto + ' como faltante';
  }
);
// Ojo: un taller CERRADO pero con fecha futura sigue siendo vigente, y está
// bien que así sea. Para que cuente como pasada hace falta una fecha pasada.
caso(
  'un taller cerrado pero que todavía no pasó sigue en "lo que viene"',
  'cerrar la venta no lo convierte en pasado: el taller igual va a suceder',
  () => {
    const e = armar('Taller de tapeo — 12/11/2026', 20, [T('A', '2600')], null, 'Cerrado');
    return (e.tikzet.entradas === 1 && e.tikzet.historico.entradas === 0)
      || 'vigentes=' + e.tikzet.entradas + ', histórico=' + e.tikzet.historico.entradas;
  }
);
caso(
  'lo de ediciones que YA PASARON va aparte',
  'si se mezclara, el número de "lo que viene" estaría inflado con plata vieja',
  () => {
    const e = armar('Taller de tapeo — 12/09/2026', 20, [T('A', '2600')], null, 'Cerrado');
    return (e.tikzet.entradas === 0 && e.tikzet.historico.entradas === 1)
      || 'vigentes=' + e.tikzet.entradas + ', histórico=' + e.tikzet.historico.entradas;
  }
);
caso(
  'el histórico también avisa si le falta plata',
  'mostrar un total al que le faltan ventas se lee como si fuera todo lo que Tikzet trajo',
  () => {
    const e = armar('Taller de tapeo — 12/09/2026', 20, [T('A', '2600'), T('B', '')], null, 'Cerrado');
    const h = e.tikzet.historico;
    return (h.entradas === 2 && h.recaudado === 2600 && h.sinMonto === 1) || JSON.stringify(h);
  }
);

console.log('\n--- Lectura de montos ---');
// La columna del monto la escribe a mano quien se inscribe. Cada forma de acá
// abajo es plausible, y leerla mal cambia la plata sin que nada lo muestre: en
// el curso, "12,200" leído como 12,2 dejaba a alguien que pagó todo "debiendo".
[
  ['433.33', 433.33, 'punto decimal: leído como 43333 suma cien veces más al cobrado'],
  ['1.5', 1.5, 'punto decimal con una cifra'],
  ['12.200', 12200, 'punto de miles, que es como se escribe acá'],
  ['$ 1.234.567', 1234567, 'varios puntos de miles'],
  ['433,33', 433.33, 'coma decimal'],
  ['$999,99', 999.99, 'coma decimal con signo de pesos'],
  ['1.234,5', 1234.5, 'miles con punto y decimal con coma'],
  ['12,200', 12200, 'coma de miles: leída como decimal daba 12,2'],
  ['4,800', 4800, 'coma de miles en la cuota'],
  ['12 200', 12200, 'espacio de miles: daba 12'],
  ['$ 12 200', 12200, 'espacio de miles con signo de pesos'],
  ['10400 (4 personas)', 10400, 'el total primero y el detalle entre paréntesis'],
  ['5200 (2 x 2600)', 5200, 'una multiplicación entre paréntesis no tapa el total'],
  ['3000 de 12200 (seña) — saldo $9.200', 3000, 'lo abonado es el primer número'],
  ['2 x 5200', null, 'una multiplicación sin el total: daba 2'],
  ['USD 100', null, 'dólares sumados como si fueran pesos'],
  ['U$S 150', null, 'dólares escritos como se escribe acá'],
  ['no tengo / ya esta pago', null, 'texto sin número']
].forEach(([texto, esperado, porque]) => {
  caso('"' + texto + '" se lee ' + esperado, porque, () => {
    const v = G.parsearMonto(texto);
    return v === esperado || 'dio ' + v;
  });
});

console.log('\n--- El curso: cuota, seña y montos que no pueden ser ---');
const persona1 = (monto) => armar('Curso de cocina — Noviembre 2026', 15, [{ nombre: 'A', monto: monto }]).ediciones[0].personas[0];
caso(
  'una cuota dice que pagó por cuotas, y cuántas le faltan',
  'la nota le dice a Leo si es una cuota o una seña: al revés, llama a quien no tiene que llamar',
  () => { const p = persona1('4800'); return (/^Pagó 1 de 3 cuotas/.test(p.nota) && p.falta === 9600) || 'dio ' + p.estadoPago + ' / ' + p.nota + ' / falta ' + p.falta; }
);
caso(
  'un monto que no es una cuota exacta es una seña contra el pago bonificado',
  '$6.000 no es ni una ni dos cuotas: contarlo como cuota inventaría cuántas le faltan',
  () => { const p = persona1('6000'); return (/^Seña/.test(p.nota) && p.saldo === 6200) || 'dio ' + p.nota + ' / ' + p.saldo; }
);
caso(
  'menos que una cuota es una seña',
  'misma razón: la seña y la cuota se cobran distinto',
  () => { const p = persona1('2000'); return /^Seña/.test(p.nota) || 'dio ' + p.nota; }
);
caso(
  '"12,200" en el curso está pago completo',
  'antes quedaba "Seña, le falta $ 12.188" y la invitaba a cobrarle a alguien que ya pagó',
  () => { const p = persona1('12,200'); return (p.estadoPago === 'completo' && p.saldo === 0) || 'dio ' + p.estadoPago + ' / ' + p.nota; }
);
caso(
  'un monto absurdo para el curso va a revisar, no a seña',
  '"2 entradas 10400" se lee como 2: decir que le faltan $ 12.198 es inventar una deuda',
  () => { const p = persona1('2 entradas 10400'); return (p.estadoPago === 'revisar' && p.saldo === 0 && /2 entradas 10400/.test(p.nota)) || 'dio ' + p.estadoPago + ' / ' + p.nota; }
);

console.log('\n--- Los totales de arriba: solo lo que viene ---');
// De acá salen el "Falta cobrar" de Plata y la barra de la portada. Se probaba
// la plata persona por persona, pero ningún total: se podía sumar el cobrado en
// lugar del saldo, o contar las ediciones que ya pasaron, y todo seguía en verde.
// Arma varias ediciones en un mismo Panel, cada una con su COUNTIF sobre su fila.
function armarVarias(ediciones) {
  const panelValores = [['Actividad','Edición','Cupo','Anotados','Quedan','Estado']];
  const panelFormulas = [['','','','','','']];
  let gente = [];
  ediciones.forEach((ed, i) => {
    panelValores.push([ed.edicion.split('—')[0].trim(), ed.edicion, String(ed.cupo), String(ed.gente.length),
                       String(ed.cupo - ed.gente.length), ed.estado]);
    panelFormulas.push(['','','', "=COUNTIF('Inscriptos Noviembre 2026'!K:K;B" + (i + 2) + ")", '','']);
    gente = gente.concat(ed.gente.map(g => fila({ ...g, edicion: ed.edicion })));
  });
  return G.construirEstado({ panelValores, panelFormulas,
    hojas: { 'Inscriptos Noviembre 2026': [H].concat(gente) }, extras: {} }, HOY);
}
{
  const e = armarVarias([
    { edicion: 'Curso de cocina — Noviembre 2026', cupo: 15, estado: 'Abierto', gente: [
      { nombre: 'Total', monto: '12200', comprobante: 'c1' },
      { nombre: 'Señado', monto: '3000', comprobante: 'c2' },
      { nombre: 'Sinpago' }] },
    { edicion: 'Taller de pastas — 20/11/2026', cupo: 10, estado: 'Abierto', gente: [
      { nombre: 'Tallerista', monto: '1500', comprobante: 'c3' },
      { nombre: 'Sinpago2' }] },
    // La trampa: ya pasó y tiene saldo y pendientes propios, que no van arriba.
    { edicion: 'Curso de cocina — Enero 2026', cupo: 15, estado: 'Cerrado', gente: [
      { nombre: 'Viejo', monto: '3000', comprobante: 'c4' },
      { nombre: 'Viejo2' }] }
  ]);
  const r = e.resumen;
  const igual = (campo, esperado) => r[campo] === esperado || campo + ' dio ' + r[campo] + ' y esperaba ' + esperado;
  caso('el armado tiene lo que la prueba supone',
    'si la edición vieja no quedara como pasada, lo de abajo no probaría nada',
    () => (e.ediciones.length === 3 && e.ediciones[2].vigente === false && e.ediciones[2].saldo > 0 &&
           e.ediciones[2].pendientes.length === 2) || 'ediciones: ' + e.ediciones.map(x => x.edicion + ' vigente=' + x.vigente).join(' | '));
  caso('cuenta solo las ediciones que vienen', 'la de enero ya pasó', () => igual('vigentes', 2));
  caso('anotados de lo que viene', 'es el número grande de la barra', () => igual('anotados', 5));
  caso('cupo de lo que viene', 'sale de la columna Cupo del Panel', () => igual('cupo', 25));
  caso('lugares libres: lo que queda, no el cupo',
    'sumar el cupo le diría que hay 25 lugares cuando hay 20', () => igual('libres', 20));
  caso('cobrado de lo que viene', 'la plata de enero no es de lo que viene', () => igual('recaudado', 16700));
  // Sin pago = pendiente, pero NO suma a "Falta cobrar": la app no inventa una
  // deuda que la planilla no dice (evaluarPago le deja saldo 0). Y los talleres
  // no calculan deuda (decisión documentada en INSTRUCCIONES). Por eso es solo
  // la seña del curso, $ 9.200, y no más: no lo "corrijas" pensando que falta.
  caso('"Falta cobrar" suma solo el saldo de lo que viene',
    'sumar el cobrado, o el saldo de enero, le mostraría una deuda que no es', () => igual('saldo', 9200));
  caso('pendientes: la seña y los dos sin pago de lo que viene',
    'contar los de enero lo mandaría a cobrarle a gente de un curso que terminó', () => igual('pendientes', 3));
}


console.log('\n--- La pestaña "Pagos en cuotas" ---');
// Datos inventados. Misma forma que la pestaña real: una fila por cuota.
const HC = ['Alumno','Email','Grupo','Cuota','Monto','Fecha de pago','Medio','Comprobante','Estado','Observaciones'];
const cuota = (o) => [o.nombre||'', o.email||'', 'Grupo', String(o.n||''), o.monto||'', '', 'transferencia', '99999', o.estado||'Pagada', o.obs||''];
function conCuotas(edicion, gente, filasCuotas, estado, hoy) {
  const crudo = {
    panelValores: [
      ['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
      [edicion.split('—')[0].trim(), edicion, '15', String(gente.length), String(15 - gente.length), estado || 'Abierto']
    ],
    panelFormulas: [['','','','','',''], ['','','', "=COUNTIF('Inscriptos Noviembre 2026'!K:K;B2)", '','']],
    hojas: { 'Inscriptos Noviembre 2026': [H].concat(gente.map(g => fila({ ...g, edicion }))) },
    extras: { 'Pagos en cuotas': [HC].concat(filasCuotas.map(cuota)) }
  };
  return G.construirEstado(crudo, hoy || HOY);
}
const CURSO = 'Curso de cocina — Noviembre 2026';
caso(
  'la segunda cuota pagada se suma: le falta solo la tercera',
  'es lo que pasaba el 23/9: con la segunda cuota ya paga, la app seguía cobrándole como si no',
  () => {
    const e = conCuotas(CURSO, [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '4800' }, { nombre: 'Ana', email: 'ana@ejemplo.uy', n: 2, monto: '4800' }]);
    const p = e.ediciones[0].personas[0];
    return (p.monto === 9600 && p.falta === 4800 && /2 de 3 cuotas/.test(p.nota) && e.ediciones[0].recaudado === 9600)
      || 'monto ' + p.monto + ', falta ' + p.falta + ', nota ' + p.nota + ', cobrado ' + e.ediciones[0].recaudado;
  }
);
caso(
  'el mail se compara sin mayúsculas ni espacios',
  'el mail lo escriben a mano en dos pestañas distintas; con una mayúscula de más la cuota no se ligaba',
  () => {
    const e = conCuotas(CURSO, [{ nombre: 'Ana', email: 'Ana@Ejemplo.uy ', monto: '4800' }],
      [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '4800' }, { nombre: 'Ana', email: ' ANA@ejemplo.uy', n: 2, monto: '4800' }]);
    return e.ediciones[0].personas[0].falta === 4800 || 'falta ' + e.ediciones[0].personas[0].falta;
  }
);
caso(
  'completar con el saldo del pago bonificado deja el curso pago',
  '$4.800 + $7.400 = $12.200 es el curso entero: seguir cobrándole sería reclamar plata que no debe',
  () => {
    const e = conCuotas(CURSO, [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '4800' }, { nombre: 'Ana', email: 'ana@ejemplo.uy', n: 2, monto: '7400' }]);
    const p = e.ediciones[0].personas[0];
    return (p.estadoPago === 'completo' && p.saldo === 0 && e.ediciones[0].pendientes.length === 0) || p.estadoPago + ' / ' + p.saldo;
  }
);
caso(
  '«completo» en pago verificado también vale con cuotas: no queda nada por cobrar',
  'la cuenta del curso se rehace al sumar las cuotas: si la marca se mira solo en la inscripción, se pierde',
  () => {
    const e = conCuotas(CURSO, [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '4800', verificado: 'completo' }],
      [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '4800' }]);
    const p = e.ediciones[0].personas[0];
    return (p.estadoPago === 'completo' && !p.saldo && !p.falta && e.ediciones[0].pendientes.length === 0)
      || p.estadoPago + ' / saldo ' + p.saldo + ' / falta ' + p.falta;
  }
);
caso(
  'una cuota pagada sin el monto escrito cuenta como una cuota, y lo dice',
  'en la pestaña real hay cuotas "Pagada" con el monto vacío; no contarlas deja deudas que no existen',
  () => {
    const e = conCuotas(CURSO, [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '4800' }, { nombre: 'Ana', email: 'ana@ejemplo.uy', n: 2 }]);
    const p = e.ediciones[0].personas[0];
    return (p.falta === 4800 && /sin el monto escrito/.test(p.nota)) || p.falta + ' / ' + p.nota;
  }
);
caso(
  'un plan acordado con otros montos manda sobre la cuenta por mes',
  'hay quien arregla seña y dos cuotas de otro monto; la cuenta por mes le inventaría una deuda distinta',
  () => {
    const e = conCuotas(CURSO, [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '3000' }],
      [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '3000' },
       { nombre: 'Ana', email: 'ana@ejemplo.uy', n: 2, monto: '4100', estado: 'Pendiente', obs: 'VENCE EL 20/11/2026 según lo acordado' },
       { nombre: 'Ana', email: 'ana@ejemplo.uy', n: 3, monto: '5100', estado: 'Pendiente', obs: 'VENCE EL 30/11/2026' }]);
    const p = e.ediciones[0].personas[0];
    return (p.falta === 9200 && /plan acordado/.test(p.nota) && /20\/11/.test(p.nota)) || p.falta + ' / ' + p.nota;
  }
);
caso(
  'una cuota vencida sin pagar es una alerta alta',
  'la fecha la acordó él por WhatsApp; si pasa y nadie se acuerda, esa plata no se cobra',
  () => {
    const filas = [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '3000' },
      { nombre: 'Ana', email: 'ana@ejemplo.uy', n: 2, monto: '4100', estado: 'Pendiente', obs: 'VENCE EL 20/10/2026' }];
    const e = conCuotas(CURSO, [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '3000' }], filas);
    const a = tipos(e, 'cuota_vencida');
    if (a.length !== 1 || a[0].nivel !== 'alta') return 'esperaba 1 alerta alta, hubo ' + a.length;
    if (!/20\/10\/2026/.test(a[0].detalle) || !/4\.100/.test(a[0].detalle)) return 'no dice cuál ni cuándo: ' + a[0].detalle;
    const antes = conCuotas(CURSO, [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '3000' }], filas, null, new Date(2026, 9, 19));
    return tipos(antes, 'cuota_vencida').length === 0 || 'avisó antes de que venza';
  }
);
caso(
  'una cuota de alguien que no está anotada se avisa',
  'con el mail mal escrito la cuota no se suma en ningún lado y la deuda sigue figurando entera',
  () => {
    const e = conCuotas(CURSO, [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '4800' }, { nombre: 'Beto', email: 'beto@ejemplo.uy', n: 2, monto: '4800' }]);
    const a = tipos(e, 'cuota_sin_inscripta');
    return (a.length === 1 && /Beto/.test(a[0].texto)) || 'hubo ' + a.length + ' alertas';
  }
);
caso(
  'el curso que ya empezó sigue en lo que falta cobrar, pero solo quien figura en cuotas',
  'la edición de agosto cerró la inscripción y su nombre no tiene fecha: sin esto, las cuotas por cobrar no aparecían en ningún lado',
  () => {
    const e = conCuotas('Curso de cocina — Martes 19-21h',
      [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '4800' }, { nombre: 'Beto', email: 'beto@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '4800' }, { nombre: 'Ana', email: 'ana@ejemplo.uy', n: 2, monto: '4800' }],
      'Cerrado', new Date(2027, 0, 10));   // enero: tercer mes de un curso de noviembre, ya le toca la tercera
    const ed = e.ediciones[0];
    if (ed.vigente) return 'la edición salió vigente; la prueba no prueba nada';
    if (!ed.cobrando) return 'no quedó marcada como cobrando';
    if (ed.pendientes.length !== 1 || ed.pendientes[0].nombre !== 'Ana') return 'pendientes: ' + ed.pendientes.map(p => p.nombre).join(', ');
    return e.resumen.saldo === 4800 || 'falta cobrar ' + e.resumen.saldo;
  }
);
caso(
  'lo cobrado en cuotas no dispara el aviso de precio viejo',
  'tres personas en la segunda cuota ($9.600) parecían un precio nuevo del curso',
  () => {
    const gente = ['a', 'b', 'c'].map(x => ({ nombre: x, email: x + '@ejemplo.uy', monto: '4800' }));
    const filas = [];
    gente.forEach(g => { filas.push({ ...g, n: 1, monto: '4800' }, { ...g, n: 2, monto: '4800' }); });
    return tipos(conCuotas(CURSO, gente, filas), 'precio_viejo').length === 0 || 'saltó el aviso';
  }
);
caso(
  'al teléfono no va nada de la pestaña de cuotas más que la cuenta',
  'comprobante, medio y observaciones traen números de cuenta y de operación',
  () => {
    const e = conCuotas(CURSO, [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '4800', obs: 'cuenta 001234567 referencia ZZTOP' }]);
    const txt = JSON.stringify(G.paraElTelefono(e));
    return (!/ZZTOP|001234567|99999|primerPago|planCuotas|aclaracion|cuotasHechas/.test(txt)) || 'se coló algo de la pestaña de cuotas';
  }
);


console.log('\n--- Al día: la cuota del mes que todavía no empezó no es deuda ---');
// Quien paga por mes paga la segunda cuota en su segundo mes de curso. Hasta el
// 29/9 la app ponía a todos los del curso de octubre con la primera cuota paga
// en "Falta que paguen", con $ 9.600 y una alerta.
const unaCuota = (hoy) => conCuotas(CURSO, [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '4800' }],
  [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '4800' }], null, hoy);
caso(
  'antes de empezar, con la primera cuota paga, está al día',
  'es el caso de todo el curso de octubre en septiembre: listarlos como deudores es mandarle a cobrar a gente que no debe nada',
  () => {
    const e = unaCuota(new Date(2026, 9, 20));
    const p = e.ediciones[0].personas[0];
    if (p.estadoPago !== 'al_dia' || p.saldo !== 0 || p.falta !== 9600) return p.estadoPago + ' / saldo ' + p.saldo + ' / falta ' + p.falta;
    if (!/al día/.test(p.nota) || !/diciembre/.test(p.nota)) return 'la nota no dice que está al día ni cuándo es la próxima: ' + p.nota;
    if (e.ediciones[0].pendientes.length || tipos(e, 'pago').length) return 'igual figura en pendientes o en alertas';
    return (e.resumen.saldo === 0 && e.resumen.porVencer === 9600) || 'falta cobrar ' + e.resumen.saldo + ', más adelante ' + e.resumen.porVencer;
  }
);
caso(
  'en el primer mes de curso sigue al día',
  'la primera cuota cubre el primer mes; la segunda recién se paga en el segundo',
  () => { const p = unaCuota(new Date(2026, 10, 25)).ediciones[0].personas[0]; return p.estadoPago === 'al_dia' || p.estadoPago + ' / ' + p.nota; }
);
caso(
  'en el segundo mes le toca la segunda cuota, y lo dice con el mes',
  'desde ahí sí es plata que tiene que entrar: si no la pide la app, no la pide nadie',
  () => {
    const e = unaCuota(new Date(2026, 11, 3));
    const p = e.ediciones[0].personas[0];
    if (p.estadoPago !== 'parcial' || p.saldo !== 4800 || p.falta !== 9600) return p.estadoPago + ' / saldo ' + p.saldo + ' / falta ' + p.falta;
    if (!/cuota de diciembre/.test(p.nota)) return 'no dice qué cuota le toca: ' + p.nota;
    return (e.ediciones[0].pendientes.length === 1 && e.resumen.saldo === 4800 && e.resumen.porVencer === 4800)
      || 'pendientes ' + e.ediciones[0].pendientes.length + ', falta ' + e.resumen.saldo + ', más adelante ' + e.resumen.porVencer;
  }
);
caso(
  'el curso de agosto, sin fecha en el nombre, cuenta los meses desde su pestaña',
  'las ediciones de agosto se llaman "Martes 19-21h": sin la pestaña no se sabría cuándo empezaron',
  () => {
    const ed = { inicio: null, regla: { hoja: 'Inscriptos Agosto 2026' } };
    const n = [G.cuotasExigibles(ed, new Date(2026, 7, 10)), G.cuotasExigibles(ed, new Date(2026, 8, 29)),
               G.cuotasExigibles(ed, new Date(2026, 9, 5)), G.cuotasExigibles(ed, new Date(2027, 1, 1))];
    return n.join(',') === '1,2,3,3' || 'agosto, septiembre, octubre y después dieron ' + n.join(',');
  }
);
caso(
  'si no se sabe cuándo empezó, se le exigen todas las cuotas',
  'mejor una deuda de más a la vista que esconder una que existe',
  () => G.cuotasExigibles({ inicio: null, regla: { hoja: 'Alumnos' } }, new Date(2026, 8, 1)) === 3 || 'no exigió las 3'
);
caso(
  'con un plan acordado mandan las fechas: antes de la fecha está al día',
  'la fecha la arregló él con la alumna; cobrarle antes sería pisar lo acordado',
  () => {
    const filas = [{ nombre: 'Ana', email: 'ana@ejemplo.uy', n: 1, monto: '3000' },
      { nombre: 'Ana', email: 'ana@ejemplo.uy', n: 2, monto: '4100', estado: 'Pendiente', obs: 'VENCE EL 20/11/2026' },
      { nombre: 'Ana', email: 'ana@ejemplo.uy', n: 3, monto: '5100', estado: 'Pendiente', obs: 'VENCE EL 30/11/2026' }];
    const gente = [{ nombre: 'Ana', email: 'ana@ejemplo.uy', monto: '3000' }];
    const antes = conCuotas(CURSO, gente, filas, null, new Date(2026, 10, 19)).ediciones[0].personas[0];
    if (antes.estadoPago !== 'al_dia' || !/20\/11/.test(antes.nota)) return 'el 19/11: ' + antes.estadoPago + ' / ' + antes.nota;
    const ese = conCuotas(CURSO, gente, filas, null, new Date(2026, 10, 20)).ediciones[0].personas[0];
    if (ese.estadoPago !== 'parcial' || ese.saldo !== 4100 || !/vence hoy/.test(ese.nota)) return 'el 20/11: ' + ese.estadoPago + ' / ' + ese.saldo + ' / ' + ese.nota;
    const despues = conCuotas(CURSO, gente, filas, null, new Date(2026, 11, 1)).ediciones[0].personas[0];
    return (despues.saldo === 9200 && despues.falta === 9200) || 'el 1/12: saldo ' + despues.saldo + ' / falta ' + despues.falta;
  }
);
caso(
  'una seña sin plan se sigue debiendo entera',
  'no hay cuotas de por medio: no hay un "más adelante" que justifique no cobrarla',
  () => { const p = persona1('3000'); return (p.estadoPago === 'parcial' && p.saldo === 9200) || p.estadoPago + ' / ' + p.saldo; }
);
caso(
  'al teléfono no va el número de las transferencias compartidas',
  'es el número de operación con los nombres de quienes pagaron; la página no lo usa y quedaba guardado en el celular',
  () => {
    const e = armar('Taller de tapeo — 20/11/2026', 12,
      [{ nombre: 'A', monto: '2600', comprobante: 'Transferencia 555444333' }, { nombre: 'B', monto: '2600', comprobante: 'Transferencia 555444333' }]);
    if (!e.ediciones[0].pagosCompartidos.length) return 'la prueba no armó un pago compartido; no prueba nada';
    if (!tipos(e, 'comprobante_repetido').length) return 'se perdió la alerta, que sí tiene que seguir';
    const tel = G.paraElTelefono(e);
    return (tel.ediciones[0].pagosCompartidos === undefined && tel.alertas.some(a => a.tipo === 'comprobante_repetido'))
      || 'pagosCompartidos sigue viajando al teléfono';
  }
);


console.log('\n--- Dos alumnas con el mismo mail ---');
// Pasó el 30/9 con datos reales: dos alumnas anotadas con un solo mail (una pagó
// por las dos). La cuota se ligaba solo por mail, así que a cada una se le
// sumaba la cuota de la otra: "Pagó 2 de 3, al día" cuando era 1 de 3.
caso(
  'con el mail compartido, cada cuota se liga por el nombre',
  'si no, a cada una se le suma lo que pagó la otra y la deuda real desaparece',
  () => {
    const e = conCuotas(CURSO,
      [{ nombre: 'Rita Pérez', email: 'familia@ejemplo.uy', monto: '4800' }, { nombre: 'Sara Gómez', email: 'familia@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Rita Pérez', email: 'familia@ejemplo.uy', n: 1, monto: '4800' },
       { nombre: 'Sara Gómez', email: 'familia@ejemplo.uy', n: 1, monto: '4800' }]);
    const ps = e.ediciones[0].personas;
    const mal = ps.filter(p => p.cuotasPagadas !== 1 || p.monto !== 4800 || !/1 de 3 cuotas/.test(p.nota));
    return !mal.length || mal.map(p => p.nombre + ': ' + p.cuotasPagadas + ' cuotas, ' + p.monto + ', ' + p.nota).join(' | ');
  }
);
caso(
  'el nombre puede estar más completo en una pestaña que en la otra',
  '"Sara Gómez" en cuotas y "Sara Gómez Ruiz" en inscriptos son la misma; exigir el nombre idéntico dejaría la cuota suelta',
  () => {
    const e = conCuotas(CURSO,
      [{ nombre: 'Rita Pérez', email: 'familia@ejemplo.uy', monto: '4800' }, { nombre: 'Sara Gómez Ruiz', email: 'familia@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Rita Perez', email: 'familia@ejemplo.uy', n: 1, monto: '4800' },
       { nombre: 'Sara Gómez', email: 'familia@ejemplo.uy', n: 1, monto: '4800' }]);
    const ps = e.ediciones[0].personas;
    if (ps.some(p => p.cuotasPagadas !== 1)) return ps.map(p => p.nombre + ': ' + p.cuotasPagadas).join(' | ');
    return tipos(e, 'cuota_sin_inscripta').length === 0 || 'quedó una cuota suelta';
  }
);
caso(
  'con el mail compartido y un nombre que no es de ninguna, la cuota queda suelta y avisa',
  'dársela a cualquiera de las dos inventa un pago; la alerta hace que alguien lo mire',
  () => {
    const e = conCuotas(CURSO,
      [{ nombre: 'Rita Pérez', email: 'familia@ejemplo.uy', monto: '4800' }, { nombre: 'Sara Gómez', email: 'familia@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Tomás López', email: 'familia@ejemplo.uy', n: 2, monto: '4800' }]);
    const ps = e.ediciones[0].personas;
    if (ps.some(p => p.cuotasPagadas !== undefined)) return 'se la dio a alguien';
    return tipos(e, 'cuota_sin_inscripta').length === 1 || 'no avisó';
  }
);
caso(
  'con el mail de una sola persona, el nombre distinto no importa',
  'el mail es lo estable; el nombre se escribe distinto cada vez y no puede romper lo que andaba',
  () => {
    const e = conCuotas(CURSO, [{ nombre: 'Rita Pérez', email: 'rita@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Rita P.', email: 'rita@ejemplo.uy', n: 1, monto: '4800' }, { nombre: 'R. Pérez', email: 'rita@ejemplo.uy', n: 2, monto: '4800' }]);
    return e.ediciones[0].personas[0].cuotasPagadas === 2 || 'cuotas: ' + e.ediciones[0].personas[0].cuotasPagadas;
  }
);

caso(
  'con el mail compartido, un nombre de una sola palabra no alcanza',
  '"Sara" puede ser cualquiera: darle la cuota a la primera que se llame así es adivinar',
  () => {
    const e = conCuotas(CURSO,
      [{ nombre: 'Rita Pérez', email: 'familia@ejemplo.uy', monto: '4800' }, { nombre: 'Sara Gómez', email: 'familia@ejemplo.uy', monto: '4800' }],
      [{ nombre: 'Sara', email: 'familia@ejemplo.uy', n: 2, monto: '4800' }]);
    const ps = e.ediciones[0].personas;
    if (ps.some(p => p.cuotasPagadas !== undefined)) return 'se la dio a ' + ps.filter(p => p.cuotasPagadas !== undefined).map(p => p.nombre).join(', ');
    return tipos(e, 'cuota_sin_inscripta').length === 1 || 'no avisó';
  }
);


console.log('\n--- Restricciones alimentarias ---');
// Pedido de Leo (1/10): que la app le avise de una restricción alimentaria para
// el día del taller. Datos inventados. Columnas como la planilla real: L notas
// a mano, M "Alergias" (la pregunta del formulario).
const HR = H.concat(['', 'Alergias', '']);
function conNotas(edicion, gente, hoy, estado) {
  const crudo = {
    panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
      [edicion.split('—')[0].trim(), edicion, '12', String(gente.length), String(12 - gente.length), estado || 'Abierto']],
    panelFormulas: [['','','','','',''], ['','','', "=COUNTIF('Inscriptos Noviembre 2026'!K:K;B2)", '','']],
    hojas: { 'Inscriptos Noviembre 2026': [HR].concat(gente.map(g => fila({ ...g, edicion }).concat([g.nota || '', g.alergias || '', '']))) },
    extras: {}
  };
  return G.construirEstado(crudo, hoy || new Date(2026, 10, 1));
}
const TAPEO = 'Taller de tapeo — 20/11/2026';
const restr = (e) => (e.ediciones[0] || {}).restricciones || [];
caso(
  'una restricción anotada a mano en la L va en su actividad, con el nombre y sin el rótulo',
  'es lo que hay que tener a mano al cocinar; si no aparece, nadie se acuerda el día del taller',
  () => {
    const r = restr(conNotas(TAPEO, [{ nombre: 'Rita Pérez', monto: '2600', nota: 'RESTRICCIÓN: no puede comer maní (avisó por mail)' }]));
    return (r.length === 1 && r[0].nombre === 'Rita Pérez' && r[0].texto === 'no puede comer maní (avisó por mail)') || JSON.stringify(r);
  }
);
caso(
  'las restricciones no son alertas',
  'Leo, 5/10: «no me pongas los carteles de restricción adelante» / «eso es para cada actividad»',
  () => tipos(conNotas(TAPEO, [{ nombre: 'Rita', monto: '2600', alergias: 'Celíaca' }]), 'restriccion').length === 0 || 'generó alerta'
);
caso(
  'la columna Alergias del formulario: "No" no cuenta, cualquier otra respuesta sí',
  'la llena cada persona al inscribirse; un "celíaca" ahí tiene que verse igual que una nota a mano',
  () => {
    const r = restr(conNotas(TAPEO, [{ nombre: 'Rita', monto: '2600', alergias: 'No' }, { nombre: 'Sara', monto: '2600', alergias: 'ninguna' },
      { nombre: 'Tita', monto: '2600', alergias: 'Maní y nueces' }]));
    return (r.length === 1 && r[0].nombre === 'Tita' && r[0].texto === 'Maní y nueces') || JSON.stringify(r);
  }
);
caso(
  '«No sé» y parecidas cuentan como que no tiene',
  'Leo, 5/10: «si dicen no sé es que no tiene»',
  () => {
    const dichos = ['No sé', 'no se', 'Nose', 'No sé.', 'NS', 'No lo sé', 'No sabe', 'No, ninguna', 'Ninguna que sepa', 'No tengo alergias'];
    const r = restr(conNotas(TAPEO, dichos.map((a, i) => ({ nombre: 'P' + i, monto: '2600', alergias: a }))));
    return r.length === 0 || 'contó como restricción: ' + r.map(x => x.texto).join(' | ');
  }
);
caso(
  'pero «no sé si es celiaquía» sí cuenta',
  'solo la respuesta entera es un no; una duda sobre una alergia hay que verla',
  () => restr(conNotas(TAPEO, [{ nombre: 'Uma', monto: '2600', alergias: 'No sé si soy celíaca' }])).length === 1 || 'la descartó'
);
caso(
  'una nota de pago en la L no es una restricción ni viaja al teléfono',
  'la L tiene cédulas y números de operación: mostrarlos los manda al celular',
  () => {
    const e = conNotas(TAPEO, [{ nombre: 'Rita', monto: '2600', nota: 'CI 12345678 - transferencia op. 998877665544' }]);
    if (restr(e).length) return 'la tomó como restricción';
    return !/12345678|998877665544/.test(JSON.stringify(G.paraElTelefono(e))) || 'la cédula viajó al teléfono';
  }
);

caso(
  'las ediciones de agosto saben su mes aunque la pestaña cambie de nombre o se archive',
  'se van a pasar al Archivo histórico; si el mes sale solo del nombre de la pestaña, el cálculo de cuotas les exige las tres',
  () => {
    const nombres = ['Curso de cocina — Martes 19-21h', 'Curso de cocina — Miércoles 10-12h', 'Curso de cocina — Sábados quincenal'];
    const mal = nombres.filter(n => {
      const i = G.inicioDelCurso({ edicion: n, inicio: null, regla: { hoja: 'Archivo — Agosto' } });
      return !i || i.getFullYear() !== 2026 || i.getMonth() !== 7;
    });
    return !mal.length || 'sin mes de inicio: ' + mal.join(', ');
  }
);


console.log('\n--- Inscripciones que el formulario no pudo ubicar ---');
const RESERVA = 'Sin pestaña del mes (webhook)';
const HRES = ['nombre','email','celular','actividad','horario','medio de pago','número comprobante','monto abonado','pago verificado','fecha inscripción','Edición','','Alergias'];
caso(
  'una fila en la pestaña de reserva del formulario da alerta alta',
  'el formulario la deja ahí cuando no existe la pestaña del mes; si nadie la ve, esa persona pagó y no figura en ningún cupo',
  () => {
    const e = armar('Curso de cocina — Diciembre 2026', 10, [], null, null,
      { [RESERVA]: [HRES, ['Ana Prueba', 'ana@ejemplo.uy', '', 'Curso', '', '', '', '4800', '', '', 'Curso de cocina — Diciembre 2026', '', '']] });
    const a = tipos(e, 'sin_pestana_mes');
    if (a.length !== 1) return 'esperaba 1 alerta sin_pestana_mes, hay ' + a.length;
    if (a[0].nivel !== 'alta') return 'esperaba nivel alta, es ' + a[0].nivel;
    if (!/Ana Prueba/.test(a[0].texto + a[0].detalle)) return 'la alerta no dice a quién mover';
    return /Sin pestaña del mes/.test(a[0].detalle) || 'la alerta no dice en qué pestaña está';
  }
);
caso(
  'la pestaña de reserva vacía (solo encabezado o filas en blanco) no da alerta',
  'una vez movidas las filas, la pestaña queda y la alerta tiene que irse sola',
  () => {
    const e = armar('Curso de cocina — Diciembre 2026', 10, [], null, null,
      { [RESERVA]: [HRES, HRES.map(() => '')] });
    return tipos(e, 'sin_pestana_mes').length === 0 || 'alertó con la pestaña vacía';
  }
);
caso(
  'la pestaña de reserva no se cuenta como una edición',
  'si se leyera como inscriptos, esa persona sumaría en un cupo sin que nadie la haya ubicado',
  () => G.HOJAS_IGNORADAS.map(G.normalizarNombre).indexOf(G.normalizarNombre(RESERVA)) !== -1 || 'no está en HOJAS_IGNORADAS'
);


console.log('\n--- Lleno pero el Panel lo sigue mostrando Abierto ---');
const dos = [{ nombre: 'Uno Prueba', email: 'uno@ejemplo.uy', monto: '1000' }, { nombre: 'Dos Prueba', email: 'dos@ejemplo.uy', monto: '1000' }];
caso(
  'una edición llena con el Estado en Abierto da alerta',
  'el Estado se escribe a mano: si nadie lo pasa a Cerrado, la venta sigue y se pasa del cupo',
  () => {
    const a = tipos(armar('Taller de tapeo — 16/11/2026', 2, dos, "=COUNTIF('Inscriptos Noviembre 2026'!K:K;B2)", 'Abierto'), 'lleno_abierto');
    if (a.length !== 1) return 'esperaba 1 alerta lleno_abierto, hay ' + a.length;
    return /Cerrado/.test(a[0].detalle) || 'la alerta no dice que hay que pasarlo a Cerrado';
  }
);
caso(
  'llena y Cerrada no da alerta',
  'es el estado correcto: avisar ahí es ruido',
  () => tipos(armar('Taller de tapeo — 16/11/2026', 2, dos, "=COUNTIF('Inscriptos Noviembre 2026'!K:K;B2)", 'Cerrado'), 'lleno_abierto').length === 0 || 'alertó con la edición cerrada'
);
caso(
  'con lugares libres no da alerta de lleno',
  'quedan lugares: que siga abierta es lo que corresponde',
  () => tipos(armar('Taller de tapeo — 16/11/2026', 3, dos, "=COUNTIF('Inscriptos Noviembre 2026'!K:K;B2)", 'Abierto'), 'lleno_abierto').length === 0 || 'alertó con un lugar libre'
);


console.log('\n--- Pagos en persona (visitas al estudio) ---');
const VIS = 'Pagos en persona';
const HV = ['Nombre','Canal','Edición','Día acordado','Hora','Monto','Estado','Tally','Notas','Cargado el'];
const ED_V = 'Curso de cocina — Noviembre 2026';
const conVisitas = (filasV, gente) => armar(ED_V, 15, gente || [], null, null, { [VIS]: [HV].concat(filasV) });
// HOY es 1/11/2026
caso(
  'una visita pendiente da alerta alta con el día y la hora en el título',
  'si alguien viene a pagar en mano y Leo no se entera, se pierde la venta: tiene que estar arriba en la portada',
  () => {
    const a = tipos(conVisitas([['Visita Prueba', 'WhatsApp', ED_V, '03/11/2026', '18:00', '4800', 'Pendiente', '', '', '01/11/2026']]), 'pago_en_persona');
    if (a.length !== 1) return 'esperaba 1 alerta pago_en_persona, hay ' + a.length;
    if (a[0].nivel !== 'alta') return 'esperaba alta, es ' + a[0].nivel;
    if (!/Visita Prueba/.test(a[0].texto) || !/03\/11/.test(a[0].texto) || !/18:00/.test(a[0].texto)) return 'el título no dice quién, qué día y a qué hora: ' + a[0].texto;
    if (/\$/.test(a[0].texto)) return 'el título tiene montos y la portada lo taparía';
    return /\$ 4\.800/.test(a[0].detalle) || 'el detalle no dice cuánto trae: ' + a[0].detalle;
  }
);
caso(
  'una visita pendiente sin día acordado también alerta, y lo dice',
  'el caso real: queda en pasar cuando se mejore, sin fecha',
  () => {
    const a = tipos(conVisitas([['Visita Prueba', 'WhatsApp', ED_V, '', '', '', 'Pendiente', '', '', '']]), 'pago_en_persona');
    if (a.length !== 1) return 'esperaba 1, hay ' + a.length;
    return /a confirmar/i.test(a[0].texto) || 'no avisa que falta acordar el día: ' + a[0].texto;
  }
);
caso(
  'el estado vacío cuenta como pendiente',
  'quien carga la fila puede olvidarse de escribir el estado',
  () => tipos(conVisitas([['Visita Prueba', '', ED_V, '05/11/2026', '', '', '', '', '', '']]), 'pago_en_persona').length === 1 || 'no alertó con el estado vacío'
);
caso(
  'un estado escrito de otra forma ("Confirmado") sigue como pendiente',
  'solo Pagó, No vino o Cancelado cierran la visita: cualquier otra cosa no puede apagar el aviso',
  () => tipos(conVisitas([['Visita Prueba', '', ED_V, '05/11/2026', '', '', 'Confirmado', '', '', '']]), 'pago_en_persona').length === 1 || 'no alertó con el estado Confirmado'
);
caso(
  'el día de hoy dice HOY',
  'el mismo día es cuando hay que estar en el estudio',
  () => {
    const a = tipos(conVisitas([['Visita Prueba', '', ED_V, '01/11/2026', '19:00', '', 'Pendiente', '', '', '']]), 'pago_en_persona');
    return (a.length === 1 && /hoy/i.test(a[0].texto)) || 'no dice hoy: ' + (a[0] || {}).texto;
  }
);
caso(
  'el día anterior dice MAÑANA',
  'el recordatorio del día anterior es el que permite organizarse',
  () => {
    const a = tipos(conVisitas([['Visita Prueba', '', ED_V, '02/11/2026', '19:00', '', 'Pendiente', '', '', '']]), 'pago_en_persona');
    return (a.length === 1 && /mañana/i.test(a[0].texto)) || 'no dice mañana: ' + (a[0] || {}).texto;
  }
);
caso(
  'si el día ya pasó y sigue Pendiente, avisa que no se marcó',
  'o no vino o pagó y nadie lo anotó: las dos cosas hay que resolverlas',
  () => {
    const a = tipos(conVisitas([['Visita Prueba', '', ED_V, '30/10/2026', '19:00', '', 'Pendiente', '', '', '']]), 'pago_en_persona');
    return (a.length === 1 && /ten[ií]a que venir/i.test(a[0].texto) && /vino\?/.test(a[0].texto)) || 'no avisa del día vencido: ' + (a[0] || {}).texto;
  }
);
caso(
  'Pagó, No vino y Cancelado no dan alerta de visita',
  'cuando se resolvió, la alerta se tiene que ir sola',
  () => {
    const e = conVisitas([
      ['Uno Prueba', '', ED_V, '03/11/2026', '', '', 'Pagó', 'Sí', '', ''],
      ['Dos Prueba', '', ED_V, '03/11/2026', '', '', 'No vino', '', '', ''],
      ['Tres Prueba', '', ED_V, '03/11/2026', '', '', 'Cancelado', '', '', '']]);
    return tipos(e, 'pago_en_persona').length === 0 || 'alertó una visita resuelta';
  }
);
caso(
  'pagó en persona y no está anotada: avisa que falta el Tally',
  'sin el Tally no entra en la pestaña de inscriptos y no ocupa su lugar en el cupo',
  () => {
    const a = tipos(conVisitas([['Visita Prueba', '', ED_V, '03/11/2026', '', '4800', 'Pagó', '', '', '']]), 'pago_sin_tally');
    if (a.length !== 1) return 'esperaba 1 alerta pago_sin_tally, hay ' + a.length;
    return /Tally/.test(a[0].texto) || 'el título no habla del Tally';
  }
);
caso(
  'pagó y ya está anotada en la edición: no pide el Tally',
  'si ya completó el formulario, pedirlo de nuevo es ruido',
  () => tipos(conVisitas([['Visita Prueba', '', ED_V, '03/11/2026', '', '4800', 'Pagó', '', '', '']],
    [{ nombre: 'Visita Prueba', email: 'v@ejemplo.uy', monto: '4800' }]), 'pago_sin_tally').length === 0 || 'pidió el Tally a alguien ya anotado'
);
caso(
  'pagó y la columna Tally dice Sí: no pide el Tally',
  'quien carga la fila puede marcarlo a mano',
  () => tipos(conVisitas([['Visita Prueba', '', ED_V, '03/11/2026', '', '4800', 'Pagó', 'Sí', '', '']]), 'pago_sin_tally').length === 0 || 'pidió el Tally con la columna en Sí'
);
caso(
  'filas vacías y el encabezado solo no alertan',
  'la pestaña empieza vacía',
  () => {
    const e = conVisitas([HV.map(() => '')]);
    return tipos(e, 'pago_en_persona').length + tipos(e, 'pago_sin_tally').length === 0 || 'alertó sin visitas';
  }
);
caso(
  'la pestaña de visitas no se cuenta como una edición',
  'si se leyera como inscriptos, una visita ocuparía cupo antes de pagar',
  () => G.HOJAS_IGNORADAS.map(G.normalizarNombre).indexOf(G.normalizarNombre(VIS)) !== -1 || 'no está en HOJAS_IGNORADAS'
);


caso(
  'si el grupo está sin confirmar, el título lo dice con las opciones',
  'lo que Leo tiene que decidir es el grupo: si solo se ve "día a confirmar", parece que falta nada más el día',
  () => {
    const a = tipos(conVisitas([['Visita Prueba', '', 'Curso de cocina — Noviembre 2026 (grupo SIN confirmar: jueves 10-12h o miércoles 19-21h)', '', '', '', 'Pendiente', '', '', '']]), 'pago_en_persona');
    return (a.length === 1 && /GRUPO SIN CONFIRMAR: jueves 10-12h o miércoles 19-21h\?/.test(a[0].texto)) || (a[0] || {}).texto;
  }
);
caso(
  'con el grupo confirmado el título no habla de grupo',
  'decir "sin confirmar" cuando está confirmado confunde',
  () => { const a = tipos(conVisitas([['Visita Prueba', '', ED_V, '', '', '', 'Pendiente', '', '', '']]), 'pago_en_persona');
    return (a.length === 1 && !/GRUPO/.test(a[0].texto)) || a[0].texto; }
);

console.log('\n--- Recordatorios ---');
const REC = 'Recordatorios';
const HREC = ['Qué','Para cuándo','Hora','Detalle','Estado','Quién lo cargó','Cargado el'];
const conRec = (filasR) => armar(ED_V, 15, [], null, null, { [REC]: [HREC].concat(filasR) });
caso(
  'un recordatorio para hoy da alerta alta que dice HOY',
  'Leo pidió que los recordatorios importantes aparezcan en la app',
  () => {
    const a = tipos(conRec([['Llevar el horno a revisar', '01/11/2026', '10:00', 'Lo pidió Leo', 'Pendiente', 'Prueba', '']]), 'recordatorio');
    if (a.length !== 1) return 'esperaba 1 alerta recordatorio, hay ' + a.length;
    if (a[0].nivel !== 'alta') return 'esperaba alta, es ' + a[0].nivel;
    return (/Llevar el horno/.test(a[0].texto) && /HOY a las 10:00/.test(a[0].texto)) || a[0].texto;
  }
);
caso(
  'un recordatorio para dentro de una semana se ve, pero como media',
  'todavía no es urgente: no tiene que tapar lo de hoy',
  () => {
    const a = tipos(conRec([['Pedir presupuesto', '08/11/2026', '', '', '', '', '']]), 'recordatorio');
    return (a.length === 1 && a[0].nivel === 'media' && /08\/11/.test(a[0].texto)) || JSON.stringify(a);
  }
);
caso(
  'un recordatorio sin fecha es alta',
  'sin fecha no hay otro momento en que aparezca',
  () => { const a = tipos(conRec([['Revisar el stock de frascos', '', '', '', 'Pendiente', '', '']]), 'recordatorio');
    return (a.length === 1 && a[0].nivel === 'alta' && /sin fecha/.test(a[0].texto)) || JSON.stringify(a); }
);
caso(
  'un recordatorio con la fecha pasada pregunta si se hizo',
  'si quedó Pendiente, o se olvidó o nadie lo marcó',
  () => { const a = tipos(conRec([['Pagar el alquiler', '30/10/2026', '', '', 'Pendiente', '', '']]), 'recordatorio');
    return (a.length === 1 && a[0].nivel === 'alta' && /se hizo\?/.test(a[0].texto)) || JSON.stringify(a); }
);
caso(
  'Hecho y Cancelado no alertan',
  'lo resuelto se va solo',
  () => tipos(conRec([['Uno', '01/11/2026', '', '', 'Hecho', '', ''], ['Dos', '01/11/2026', '', '', 'Cancelado', '', '']]), 'recordatorio').length === 0 || 'alertó algo resuelto'
);
caso(
  'un recordatorio Delegado no es de Leo: sale aparte, como info',
  'Leo pidió que le quede solo lo que tiene que decidir él; lo de las sesiones no puede competir con eso',
  () => {
    const e = conRec([['Algo delegado', '01/11/2026', '', 'Lo hace: Seguimiento', 'Delegado', '', '']]);
    const d = tipos(e, 'recordatorio_delegado');
    return (tipos(e, 'recordatorio').length === 0 && d.length === 1 && d[0].nivel === 'info') || JSON.stringify(e.alertas.map(a => a.tipo + ':' + a.nivel));
  }
);
caso(
  'la pestaña de recordatorios no se cuenta como una edición',
  'no es gente anotada',
  () => G.HOJAS_IGNORADAS.map(G.normalizarNombre).indexOf(G.normalizarNombre(REC)) !== -1 || 'no está en HOJAS_IGNORADAS'
);

console.log('\n--- Respuestas de Leo desde la app ---');
// Leo, 5/10: «decir que Paula puede hacer octubre y noviembre, y que Claude lo sepa».
const conResp = (filasR, respuestas) => G.construirEstado({
  panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado'], ['Curso de cocina', ED_V, '15', '0', '15', 'Abierto']],
  panelFormulas: [['','','','','',''], ['','','', "=COUNTIF('Inscriptos Noviembre 2026'!K:K;B2)", '','']],
  hojas: { 'Inscriptos Noviembre 2026': [H] }, extras: { [REC]: [HREC].concat(filasR) }, respuestas
}, HOY);
const resp1 = { 'decidir si prueba puede ir': { texto: 'Sí, que venga', cuando: '2026-11-01T13:20:00.000Z' } };
caso(
  'un recordatorio que Leo ya contestó sale de su lista y queda como respondido',
  'si lo sigue viendo como pendiente, contesta dos veces o cree que no se guardó',
  () => {
    const e = conResp([['Decidir si Prueba puede ir', '01/11/2026', '', 'Detalle', 'Pendiente', 'Seguimiento', '']], resp1);
    const r = tipos(e, 'recordatorio_respondido');
    return (tipos(e, 'recordatorio').length === 0 && r.length === 1 && r[0].nivel === 'info' &&
            r[0].respuesta === 'Sí, que venga' && /«Sí, que venga»/.test(r[0].detalle) && r[0].fila === 2 &&
            r[0].quien === 'Seguimiento') || JSON.stringify(e.alertas);
  }
);
caso(
  'la respuesta se engancha aunque el Qué cambie de mayúsculas o tildes',
  'la clave es el Qué normalizado: una sesión puede reescribirlo con otra tilde',
  () => tipos(conResp([['DECIDIR si Prueba púede ir', '', '', '', 'Pendiente', '', '']], resp1), 'recordatorio_respondido').length === 1 || 'no la encontró'
);
caso(
  'la respuesta de un recordatorio ya Hecho no aparece',
  'cuando la sesión lo hizo y puso Hecho, se termina',
  () => conResp([['Decidir si Prueba puede ir', '', '', '', 'Hecho', '', '']], resp1).alertas.filter(a => /respondido|^recordatorio$/.test(a.tipo)).length === 0 || 'apareció'
);
caso(
  'cada recordatorio pendiente lleva su clave, para poder contestarlo',
  'sin clave la app no sabe a cuál responde',
  () => (tipos(conResp([['Otra Cosa', '', '', '', 'Pendiente', '', '']], {}), 'recordatorio')[0] || {}).clave === 'otra cosa' || 'sin clave'
);
const recsP = G.leerRecordatorios([HREC, ['Uno', '', '', '', 'Pendiente', '', ''], ['Dos', '', '', '', 'Hecho', '', '']]);
const AHORA = new Date(2026, 10, 1, 10);
caso(
  'guardar una respuesta: texto limpio y la hora',
  'se guarda lo que escribió, sin caracteres de control',
  () => { const c = G.cambioDeRespuesta(recsP, {}, 'uno', '  hacelo\u0007 ya  ', AHORA);
    return (c.guardar && c.guardar.texto === 'hacelo ya' && c.guardar.cuando === AHORA.toISOString() && c.borrar.length === 0) || JSON.stringify(c); }
);
caso(
  'no se puede contestar un recordatorio que ya no está pendiente',
  'si alguien lo cerró mientras Leo escribía, la respuesta quedaría colgada',
  () => { try { G.cambioDeRespuesta(recsP, {}, 'dos', 'algo', AHORA); return 'lo aceptó'; } catch (e) { return /ya no está pendiente/.test(e.message) || e.message; } }
);
caso(
  'tampoco uno que no existe',
  'la clave viene del teléfono: no se confía en ella',
  () => { try { G.cambioDeRespuesta(recsP, {}, 'inventado', 'algo', AHORA); return 'lo aceptó'; } catch (e) { return true; } }
);
caso(
  'el texto vacío borra la respuesta',
  'para arrepentirse',
  () => { const c = G.cambioDeRespuesta(recsP, { uno: { texto: 'x' } }, 'uno', '   ', AHORA);
    return (c.guardar === null && c.borrar.indexOf('uno') !== -1) || JSON.stringify(c); }
);
caso(
  'se borran las respuestas de recordatorios que ya no están pendientes',
  'si no, quedan guardadas para siempre en el servidor',
  () => { const c = G.cambioDeRespuesta(recsP, { dos: { texto: 'x' }, borrado: { texto: 'y' } }, 'uno', 'ok', AHORA);
    return (c.borrar.indexOf('dos') !== -1 && c.borrar.indexOf('borrado') !== -1 && c.borrar.indexOf('uno') === -1) || JSON.stringify(c.borrar); }
);
caso(
  'una respuesta larguísima se rechaza',
  'las propiedades del script tienen tope de tamaño',
  () => { try { G.cambioDeRespuesta(recsP, {}, 'uno', 'a'.repeat(1001), AHORA); return 'la aceptó'; } catch (e) { return /muy larga/.test(e.message) || e.message; } }
);
caso(
  'la app sigue sin permiso para escribir la planilla',
  'responder no puede costar el permiso de solo lectura: las respuestas van a las propiedades del script',
  () => {
    const m = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'apps-script', 'appsscript.json'), 'utf8'));
    return (m.oauthScopes.length === 1 && /spreadsheets\.readonly$/.test(m.oauthScopes[0])) || JSON.stringify(m.oauthScopes);
  }
);

console.log('\n--- Lo que no ocupa cupo no manda números al teléfono ---');
caso(
  'los celulares, cédulas y comprobantes de la nota de un anulado se tapan',
  'el 5/10 la portada mostraba un celular y un comprobante de Mercado Pago de un duplicado',
  () => {
    const e = { ediciones: [], giftCards: [], fueraDeCupo: [{ nombre: 'Prueba', email: 'p@ejemplo.com', montoTexto: '1', monto: 1,
      edicion: 'Anulado — duplicado de la fila 7: comprobante Mercado Pago 123456789012, CI 1.234.567-8, celular 099 123 456; tapeo 12/09 10:15' }] };
    const t = G.paraElTelefono(e).fueraDeCupo[0].edicion;
    return (!/123456789012|1\.234\.567-8|099 123 456/.test(t) && /fila 7/.test(t) && /12\/09 10:15/.test(t)) || t;
  }
);

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
