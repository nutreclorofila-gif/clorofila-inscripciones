// Casos límite: escenarios plausibles de la planilla que podrían romper la app.
// Cada caso dice qué espera y por qué importa.
const { cargar } = require('./cargar.js');
const G = cargar();

let fallas = 0, corridos = 0;
function caso(nombre, porque, fn) {
  corridos++;
  try {
    const r = fn();
    if (r === true) { console.log('  ok   ' + nombre); return; }
    fallas++;
    console.log('  FALLA ' + nombre + '\n        ' + r + '\n        importa porque: ' + porque);
  } catch (e) {
    fallas++;
    console.log('  ERROR ' + nombre + '\n        ' + e.message + '\n        importa porque: ' + porque);
  }
}

const H = ['nombre','email','celular','actividad','horario','medio','comprobante','monto','verif','fecha','Edición'];
const fila = (o) => [o.nombre||'', o.email||'', '', o.actividad||'', o.horario||'', o.medio||'',
                     o.comprobante||'', o.monto||'', '', o.fecha||'', o.edicion||''];
const HOY = new Date(2026, 9, 15); // 15 de octubre de 2026

console.log('\n--- 1. Curso con grupos de distinta vigencia ---');
caso(
  'un grupo cerrado del mismo curso no dispara "no cuenta en ningún grupo"',
  'el Panel tiene grupos que se cierran uno por uno; un falso positivo acá haría desconfiar de todas las alertas',
  () => {
    const crudo = {
      panelValores: [
        ['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
        ['Curso de cocina','Curso de cocina — Octubre 2026 (Mañana)','15','1','14','Abierto'],
        ['Curso de cocina','Curso de cocina — Octubre 2026 (Tarde)','15','1','14','Cerrado']
      ],
      panelFormulas: [
        ['','','','','',''],
        ['','','','=COUNTIFS(\'Inscriptos Octubre 2026\'!K:K;"Curso de cocina — Octubre 2026";\'Inscriptos Octubre 2026\'!E:E;"Mañana*")','',''],
        ['','','','=COUNTIFS(\'Inscriptos Octubre 2026\'!K:K;"Curso de cocina — Octubre 2026";\'Inscriptos Octubre 2026\'!E:E;"Tarde*")','','']
      ],
      hojas: { 'Inscriptos Octubre 2026': [H,
        fila({nombre:'Ana', actividad:'Curso de cocina', horario:'Mañana', monto:'12200', edicion:'Curso de cocina — Octubre 2026'}),
        fila({nombre:'Beto', actividad:'Curso de cocina', horario:'Tarde', monto:'12200', edicion:'Curso de cocina — Octubre 2026'})
      ]},
      generadoEn: HOY.toISOString()
    };
    const e = G.construirEstado(crudo, HOY);
    const falsas = e.alertas.filter(a => a.tipo === 'sin_grupo');
    return falsas.length === 0 ? true
      : 'levantó ' + falsas.length + ' alerta(s) falsa(s): ' + falsas.map(a => a.texto).join(' | ');
  }
);

console.log('\n--- 2. Fila del curso con horario que no matchea ningún grupo ---');
caso(
  'SÍ avisa cuando el horario no cae en ningún grupo',
  'es el agujero real: esa persona no suma al cupo de nadie y desaparece sin aviso',
  () => {
    const crudo = {
      panelValores: [
        ['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
        ['Curso de cocina','Curso de cocina — Octubre 2026 (Mañana)','15','1','14','Abierto']
      ],
      panelFormulas: [['','','','','',''],
        ['','','','=COUNTIFS(\'Inscriptos Octubre 2026\'!K:K;"Curso de cocina — Octubre 2026";\'Inscriptos Octubre 2026\'!E:E;"Mañana*")','','']],
      hojas: { 'Inscriptos Octubre 2026': [H,
        fila({nombre:'Ana', actividad:'Curso de cocina', horario:'Mañana', monto:'12200', edicion:'Curso de cocina — Octubre 2026'}),
        fila({nombre:'Perdida', actividad:'Curso de cocina', horario:'', monto:'12200', edicion:'Curso de cocina — Octubre 2026'})
      ]},
      generadoEn: HOY.toISOString()
    };
    const e = G.construirEstado(crudo, HOY);
    const a = e.alertas.filter(x => x.tipo === 'sin_grupo');
    return a.length === 1 && /Perdida/.test(a[0].texto) ? true
      : 'esperaba 1 alerta sobre "Perdida", hubo ' + a.length + ': ' + a.map(x=>x.texto).join(' | ');
  }
);

console.log('\n--- 3. Panel con basura ---');
caso(
  'ignora la fila de la fórmula de avisos y las filas vacías',
  'el Panel real tiene una fórmula suelta en A11 en el medio de la tabla',
  () => {
    const crudo = {
      panelValores: [
        ['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
        ['Taller','Taller — 20/10/2026','12','2','10','Abierto'],
        ['⚠️ algo'], [], ['','','','','',''],
        ['Taller','Taller — 25/10/2026','12','0','12','Abierto']
      ],
      panelFormulas: [['','','','','',''],
        ['','','','=COUNTIF(\'Inscriptos Octubre 2026\'!K:K;B2)','',''],
        [''],[],['','','','','',''],
        ['','','','=COUNTIF(\'Inscriptos Octubre 2026\'!K:K;B6)','','']],
      hojas: { 'Inscriptos Octubre 2026': [H,
        fila({nombre:'Ana', monto:'2600', edicion:'Taller — 20/10/2026'}),
        fila({nombre:'Beto', monto:'2600', edicion:'Taller — 20/10/2026'})
      ]},
      generadoEn: HOY.toISOString()
    };
    const e = G.construirEstado(crudo, HOY);
    return e.ediciones.length === 2 ? true : 'leyó ' + e.ediciones.length + ' ediciones en vez de 2';
  }
);

console.log('\n--- 4. Hoja de inscriptos vacía ---');
caso(
  'no explota con una pestaña recién creada, sin filas',
  'cada mes se crea la pestaña del mes siguiente antes de que se anote nadie',
  () => {
    const crudo = {
      panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
        ['Taller','Taller — 20/11/2026','12','0','12','Abierto']],
      panelFormulas: [['','','','','',''],
        ['','','','=COUNTIF(\'Inscriptos Noviembre 2026\'!K:K;B2)','','']],
      hojas: { 'Inscriptos Noviembre 2026': [] },
      generadoEn: HOY.toISOString()
    };
    const e = G.construirEstado(crudo, HOY);
    return e.ediciones.length === 1 && e.ediciones[0].personas.length === 0 && e.resumen.recaudado === 0
      ? true : 'estado raro: ' + JSON.stringify(e.resumen);
  }
);

console.log('\n--- 5. Pago que dice "ya esta pago" sin número ---');
caso(
  'no lo da por pagado en silencio',
  'un texto sin monto no prueba un pago; darlo por bueno esconde plata que puede faltar',
  () => {
    const f = { nombre:'Ignacio', comprobante:'no tengo / ya esta pago', montoTexto:'no tengo / ya esta pago', medioPago:'transferencia' };
    const p = G.evaluarPago(f, { esCurso: true });
    return p.estadoPago === 'revisar'
      ? true : 'lo marcó como "' + p.estadoPago + '" en vez de "revisar" (nota: ' + p.nota + ')';
  }
);

console.log('\n--- 6. Acompañante real ---');
caso(
  'el acompañante sin monto queda como cubierto, no como deudor',
  'hay muchos; marcarlos deudores llenaría las alertas de ruido y le haría perseguir gente que ya pagó',
  () => {
    const f = { nombre:'Acompañante sin nombre de Fulana', comprobante:'Tikzet - mismo pago que Fulana (2 entradas)', montoTexto:'', medioPago:'Tikzet' };
    const p = G.evaluarPago(f, { esCurso: false });
    return p.estadoPago === 'cubierto' ? true : 'quedó como "' + p.estadoPago + '"';
  }
);

console.log('\n--- 7. Una fila no puede contarse dos veces ---');
caso(
  'dos ediciones del Panel con la misma regla no duplican a la misma persona',
  'un copiar-pegar mal hecho en el Panel inflaría los anotados sin que se note',
  () => {
    const crudo = {
      panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
        ['Taller','Taller — 20/10/2026','12','1','11','Abierto'],
        ['Taller','Taller — 20/10/2026 (copia)','12','1','11','Abierto']],
      panelFormulas: [['','','','','',''],
        ['','','','=COUNTIF(\'Inscriptos Octubre 2026\'!K:K;B2)','',''],
        ['','','','=COUNTIF(\'Inscriptos Octubre 2026\'!K:K;"Taller — 20/10/2026")','','']],
      hojas: { 'Inscriptos Octubre 2026': [H, fila({nombre:'Ana', monto:'2600', edicion:'Taller — 20/10/2026'})] },
      generadoEn: HOY.toISOString()
    };
    const e = G.construirEstado(crudo, HOY);
    // El recaudado total NO debe contar los $2.600 dos veces.
    return e.resumen.recaudado === 2600
      ? true : 'el recaudado dio ' + e.resumen.recaudado + ' en vez de 2600 (contó a Ana dos veces)';
  }
);

console.log('\n--- 8. Curso pagado en cuotas ---');
caso(
  'una cuota de $4.800 es pago parcial con saldo $7.400, no "pagó"',
  'es el caso normal del curso; darlo por completo perdería $7.400 por persona',
  () => {
    const p = G.evaluarPago({ nombre:'X', montoTexto:'4800', comprobante:'123456789', medioPago:'transferencia' }, { esCurso: true });
    return p.estadoPago === 'parcial' && p.saldo === 7400
      ? true : 'estado ' + p.estadoPago + ', saldo ' + p.saldo;
  }
);

console.log('\n--- 9. Edición sin fecha legible ---');
caso(
  'una edición vieja sin fecha en el nombre y cerrada no se muestra como vigente',
  'las del curso de agosto se llaman "Curso de cocina — Martes 19-21h", sin fecha ninguna',
  () => G.estaVigente('Curso de cocina — Martes 19-21h', false, HOY) === false
    ? true : 'la dio por vigente'
);
caso(
  'esa misma edición SÍ se muestra si está marcada Abierto',
  'si Leo la reabre a mano, tiene que aparecer aunque el nombre no diga fecha',
  () => G.estaVigente('Curso de cocina — Martes 19-21h', true, HOY) === true
    ? true : 'no la mostró pese a estar abierta'
);

console.log('\n--- 10. El día de la edición todavía cuenta ---');
caso(
  'el taller de hoy sigue siendo vigente el mismo día',
  'si desapareciera la mañana del taller, perdería la lista de quién viene justo cuando más la necesita',
  () => G.estaVigente('Taller — 15/10/2026', false, HOY) === true
    ? true : 'lo dio por pasado el mismo día'
);

console.log('\n--- 11. Columnas movidas en una pestaña de inscriptos ---');
// Las pestañas de inscriptos se leían por posición. Si se intercambiaban H (monto)
// e I (pago verificado), ninguna fórmula del Panel se enteraba: el cobrado quedaba
// en $0 y toda la gente "Sin pago", sin una sola alerta alta.
const HR = ['nombre','email','celular','actividad','horario','medio de pago','número comprobante',
            'monto abonado','pago verificado','fecha inscripción','Edición'];
const ED11 = 'Taller — 20/10/2026';
function conColumnas(cambiar) {
  const filas = [HR.slice(),
    ['Ana','a@x.com','','Taller','','transferencia','111111111','2600','','01/10/2026',ED11],
    ['Beto','b@x.com','','Taller','','transferencia','222222222','2600','','02/10/2026',ED11],
    ['Caro','c@x.com','','Taller','','transferencia','333333333','2600','','03/10/2026',ED11]];
  cambiar(filas);
  return G.construirEstado({
    panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
                   ['Taller', ED11, '12', '3', '9', 'Abierto']],
    panelFormulas: [['','','','','',''], ['','','',"=COUNTIF('Inscriptos Octubre 2026'!K:K;B2)",'','']],
    hojas: { 'Inscriptos Octubre 2026': filas }, extras: {}, generadoEn: HOY.toISOString()
  }, HOY);
}
const intercambiar = (i, j) => (filas) => filas.forEach(f => { const x = f[i]; f[i] = f[j]; f[j] = x; });
const resumen11 = (e) => 'cobrado ' + e.resumen.recaudado + ', pendientes ' + e.resumen.pendientes +
  ', alertas ' + e.alertas.map(a => a.nivel + '/' + a.tipo).join(' ');
caso(
  'con las columnas en su lugar lee la plata y no avisa nada',
  'es la planilla de hoy: una alerta ahí sería ruido',
  () => {
    const e = conColumnas(() => {});
    return e.resumen.recaudado === 7800 && e.alertas.length === 0 ? true : resumen11(e);
  }
);
caso(
  'monto y pago verificado intercambiados: la plata se sigue leyendo bien',
  'antes daba cobrado $0 y a todos "Sin pago", sin avisar: le haría perseguir gente que pagó',
  () => {
    const e = conColumnas(intercambiar(7, 8));
    return e.resumen.recaudado === 7800 && e.resumen.pendientes === 0 && e.alertas.length === 0 ? true : resumen11(e);
  }
);
caso(
  'comprobante y monto intercambiados: el número de comprobante no se suma como plata',
  'antes el cobrado subía a cientos de millones',
  () => {
    const e = conColumnas(intercambiar(6, 7));
    return e.resumen.recaudado === 7800 && e.alertas.length === 0 ? true : resumen11(e);
  }
);
caso(
  'si la columna del monto se renombra y no se encuentra, avisa con una alerta alta',
  'la app la sigue leyendo en su lugar de siempre, pero puede ser la equivocada: hay que decirlo',
  () => {
    const e = conColumnas((filas) => { filas[0][7] = 'importe'; });
    const a = e.alertas.filter(x => x.tipo === 'columnas');
    if (e.resumen.recaudado !== 7800) return 'la plata dejó de leerse: ' + resumen11(e);
    if (a.length !== 1 || a[0].nivel !== 'alta') return 'esperaba 1 alerta alta de columnas: ' + resumen11(e);
    if (!/Inscriptos Octubre 2026/.test(a[0].texto) || !/monto/.test(a[0].texto)) return 'no dice qué falta ni dónde: ' + a[0].texto;
    return true;
  }
);

console.log('\n--- 12. El Estado del Panel ---');
// Solo se aceptaba "Abierto". Con "Abierta" (la edición es femenino) todo quedaba
// como cerrado, y una edición sin fecha en el nombre desaparecía de las vigentes.
function conEstado(estado, edicion, encabezados) {
  const ed = edicion || 'Taller — 20/10/2026';
  return G.construirEstado({
    panelValores: [encabezados || ['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
                   ['Taller', ed, '12', '0', '12', estado]],
    panelFormulas: [['','','','','',''], ['','','',"=COUNTIF('Inscriptos Octubre 2026'!K:K;B2)",'','']],
    hojas: { 'Inscriptos Octubre 2026': [H] }, extras: {}, generadoEn: HOY.toISOString()
  }, HOY);
}
caso(
  '"Abierta" cuenta como abierta',
  'la edición es femenino: escribirlo así es lo más natural',
  () => {
    const e = conEstado('Abierta');
    return e.ediciones[0].abierta === true && e.alertas.length === 0 ? true
      : 'abierta=' + e.ediciones[0].abierta + ', alertas ' + e.alertas.map(a => a.tipo).join(' ');
  }
);
caso(
  'una edición sin fecha marcada "Abierta" sigue vigente',
  'si no, se iba a "ediciones que ya pasaron" con su gente y su plata, sin avisar',
  () => conEstado('Abierta', 'Curso de cocina — Jueves 10-12h').ediciones[0].vigente === true || 'la dio por pasada'
);
caso(
  'un Estado que no se entiende se avisa',
  'la app lo toma como cerrado: hay que saberlo',
  () => {
    const a = conEstado('Lleno').alertas.filter(x => x.tipo === 'estado_raro');
    return a.length === 1 && /Lleno/.test(a[0].texto) && /fila 2 del Panel/i.test(a[0].texto) ? true
      : 'alertas: ' + JSON.stringify(a);
  }
);
caso(
  'una columna agregada antes de Estado se avisa con una alerta alta',
  'el Estado pasa a la columna G, que la app no lee, y todo queda como cerrado sin decir nada',
  () => {
    const e = conEstado('2600', null, ['Actividad','Edición','Cupo','Anotados','Quedan','Precio']);
    const a = e.alertas.filter(x => x.tipo === 'panel_columnas');
    return a.length === 1 && a[0].nivel === 'alta' && /Estado/.test(a[0].detalle) && /Precio/.test(a[0].detalle) ? true
      : 'alertas: ' + e.alertas.map(x => x.nivel + '/' + x.tipo + ' ' + x.detalle).join(' | ');
  }
);

console.log('\n--- 13. Sobrecupo, fórmula ilegible y Panel lleno ---');
// Estas tres alertas funcionaban, pero ninguna prueba las hacía saltar: se
// podían apagar y todo seguía en verde. Y son la única señal de lo que avisan:
// sin la de sobrecupo, un taller con gente de más se ve como uno lleno; sin la
// de fórmula, una edición con gente se ve vacía y no se sabe por qué.
const ED13 = 'Taller de prueba — 20/10/2026';
function conSobrecupo(estado, formula, panelLleno) {
  return G.construirEstado({
    panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
                   ['Taller de prueba', ED13, '1', '2', '-1', estado]],
    panelFormulas: [['','','','','',''], ['','','', formula, '','']],
    hojas: { 'Inscriptos Octubre 2026': [H,
      fila({nombre:'Ana', monto:'2600', edicion:ED13}),
      fila({nombre:'Beto', monto:'2600', edicion:ED13})
    ]},
    extras: {}, panelLleno: panelLleno, generadoEn: HOY.toISOString()
  }, HOY);
}
const FORMULA13 = "=COUNTIF('Inscriptos Octubre 2026'!K:K;\"" + ED13 + "\")";
const deTipo13 = (e, t) => e.alertas.filter(a => a.tipo === t);
const lista13 = (e) => e.alertas.map(a => a.nivel + '/' + a.tipo).join(' ') || '(ninguna)';
caso(
  'una edición abierta con gente de más da UNA alerta alta de sobrecupo',
  'es un lugar que se vendió dos veces: hay que llamar a alguien antes del día',
  () => {
    const e = conSobrecupo('Abierto', FORMULA13);
    const a = deTipo13(e, 'sobrecupo');
    if (a.length !== 1 || a[0].nivel !== 'alta') return 'alertas: ' + lista13(e);
    if (!/1 persona de más/.test(a[0].texto)) return 'no dice cuántos sobran: ' + a[0].texto;
    // El Panel y las filas dicen lo mismo (2): no hay descuadre que avisar.
    return deTipo13(e, 'descuadre').length === 0 || 'avisó un descuadre que no hay: ' + lista13(e);
  }
);
caso(
  'cerrada pero todavía por venir, el sobrecupo es un aviso medio',
  'ya no se anota nadie más, pero la gente de más sigue viniendo el mismo día',
  () => {
    const e = conSobrecupo('Cerrado', FORMULA13);
    const a = deTipo13(e, 'sobrecupo');
    return (a.length === 1 && a[0].nivel === 'media') || 'alertas: ' + lista13(e);
  }
);
caso(
  'con el número de Anotados escrito a mano, avisa que no puede leer la fórmula',
  'la edición queda con 0 personas aunque tenga gente: sin la alerta, parece vacía',
  () => {
    const e = conSobrecupo('Abierto', '');
    const a = deTipo13(e, 'formula');
    if (a.length !== 1 || a[0].nivel !== 'alta') return 'alertas: ' + lista13(e);
    if (!/escrito a mano/.test(a[0].detalle)) return 'no dice por qué: ' + a[0].detalle;
    if (e.ediciones[0].personas.length !== 0) return 'sin regla le asignó ' + e.ediciones[0].personas.length + ' personas';
    // La alerta de fórmula corta ahí: decir además "el Panel dice 2 y hay 0" es
    // la misma causa contada dos veces.
    return deTipo13(e, 'descuadre').length === 0 || 'avisó dos veces lo mismo: ' + lista13(e);
  }
);
caso(
  'con el Panel en el tope de filas que se leen, avisa',
  'de ahí en más las ediciones nuevas no aparecen en la app y nadie se entera',
  () => {
    const e = conSobrecupo('Abierto', FORMULA13, true);
    const a = deTipo13(e, 'panel_lleno');
    return (a.length === 1 && a[0].nivel === 'alta') || 'alertas: ' + lista13(e);
  }
);
caso(
  'y si no llegó al tope, no dice nada',
  'una alerta que salta sin motivo hace que se dejen de mirar todas',
  () => {
    const e = conSobrecupo('Abierto', FORMULA13);
    return deTipo13(e, 'panel_lleno').length === 0 || 'alertas: ' + lista13(e);
  }
);

console.log('\n' + (fallas === 0
  ? 'TODOS LOS CASOS PASAN (' + corridos + ')'
  : fallas + ' DE ' + corridos + ' CASOS FALLAN'));
process.exit(fallas ? 1 : 0);
