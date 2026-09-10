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
    if (!/2\.600/.test(a[0].texto)) return 'no dice cuánta plata: ' + a[0].texto;
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

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
