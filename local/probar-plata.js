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
function armar(edicion, cupo, gente, formula, estado) {
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
    extras: {}
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
  'una cuota dice que pagó por cuotas',
  'la nota le dice a Leo si es una cuota o una seña: al revés, llama a quien no tiene que llamar',
  () => { const p = persona1('6000'); return (p.estadoPago === 'parcial' && /^Pagó por cuotas/.test(p.nota)) || 'dio ' + p.estadoPago + ' / ' + p.nota; }
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

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
