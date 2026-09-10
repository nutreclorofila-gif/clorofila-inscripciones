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

console.log('\n' + (fallas === 0
  ? 'TODOS LOS CASOS PASAN (' + corridos + ')'
  : fallas + ' DE ' + corridos + ' CASOS FALLAN'));
process.exit(fallas ? 1 : 0);
