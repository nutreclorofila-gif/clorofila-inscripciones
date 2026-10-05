// Los avisos por mail de los pagos en persona (avisos/Avisos.gs). Cada caso dice
// qué pasaría si fallara: un mail de menos es alguien que viene a pagar y Leo
// no se entera; uno de más, cada hora, es un mail que se termina ignorando.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'avisos', 'Avisos.gs'), 'utf8');
const A = new Function(src + '\nreturn { queAvisar, leerFilas, leerRecordatorios };')();

let fallas = 0, corridos = 0;
function caso(nombre, porque, fn) {
  corridos++;
  try {
    const r = fn();
    if (r === true) { console.log('  ok    ' + nombre); return; }
    fallas++; console.log('  FALLA ' + nombre + '\n        ' + r + '\n        importa porque: ' + porque);
  } catch (e) { fallas++; console.log('  ERROR ' + nombre + '\n        ' + e.message + '\n        importa porque: ' + porque); }
}
const H = ['Nombre','Canal','Edición','Día acordado','Hora','Monto','Estado','Tally','Notas','Cargado el'];
const V = (nombre, dia, estado, hora) => [nombre, 'WhatsApp', 'Curso de cocina — Prueba', dia || '', hora || '', '$ 4.800', estado || 'Pendiente', '', '', ''];
const a8 = new Date(2026, 10, 1, 8, 0);   // 1/11/2026 08:00
const a10 = new Date(2026, 10, 1, 10, 0); // 1/11/2026 10:00

caso('una visita nueva manda un mail con el nombre en el asunto',
  'es el aviso que Leo pidió: enterarse apenas se carga',
  () => { const r = A.queAvisar([H, V('Ana Prueba', '05/11/2026')], a8, {});
    return (r.mails.length === 1 && /Ana Prueba/.test(r.mails[0].asunto)) || JSON.stringify(r.mails.map(m => m.asunto)); });
caso('la misma visita no vuelve a avisar como nueva en la hora siguiente',
  'el activador corre cada hora: sin memoria, sería un mail por hora',
  () => { const r1 = A.queAvisar([H, V('Ana Prueba', '05/11/2026')], a8, {});
    const r2 = A.queAvisar([H, V('Ana Prueba', '05/11/2026')], new Date(2026, 10, 1, 8, 59), r1.estado);
    return r2.mails.length === 0 || JSON.stringify(r2.mails.map(m => m.asunto)); });
caso('después de las 9 manda un resumen por día, una sola vez',
  'el recordatorio diario cubre el día anterior y el mismo día; dos por día es ruido',
  () => { const r1 = A.queAvisar([H, V('Ana Prueba', '05/11/2026')], a8, {});
    const r2 = A.queAvisar([H, V('Ana Prueba', '05/11/2026')], a10, r1.estado);
    const r3 = A.queAvisar([H, V('Ana Prueba', '05/11/2026')], new Date(2026, 10, 1, 15, 0), r2.estado);
    return (r2.mails.length === 1 && r3.mails.length === 0) || `resumen: ${r2.mails.length}, repetido: ${r3.mails.length}`; });
caso('el resumen del día de la visita dice HOY en el asunto',
  'es el que hace falta ver sin abrir el mail',
  () => { const r = A.queAvisar([H, V('Ana Prueba', '01/11/2026', '', '19:00')], a10, { visto: { 'ana prueba|curso de cocina — prueba': true } });
    return (r.mails.length === 1 && /^HOY: Ana Prueba viene al estudio a pagar/.test(r.mails[0].asunto)) || JSON.stringify(r.mails.map(m => m.asunto)); });
caso('el cuerpo del resumen dice HOY y la hora acordada',
  'en el mail tiene que estar a qué hora viene, no solo que viene',
  () => { const r = A.queAvisar([H, V('Ana Prueba', '01/11/2026', '', '19:00')], a10, { visto: { 'ana prueba|curso de cocina — prueba': true } });
    return /Ana Prueba viene al estudio a pagar: HOY a las 19:00/.test((r.mails[0] || {}).cuerpo) || (r.mails[0] || {}).cuerpo; });
caso('el resumen del día anterior dice Mañana en el asunto',
  'el aviso del día anterior es el que permite organizarse',
  () => { const r = A.queAvisar([H, V('Ana Prueba', '02/11/2026')], a10, { visto: { 'ana prueba|curso de cocina — prueba': true } });
    return (r.mails.length === 1 && /^Mañana: Ana Prueba/.test(r.mails[0].asunto)) || JSON.stringify(r.mails.map(m => m.asunto)); });
caso('sin visitas pendientes no manda nada',
  'un resumen vacío todos los días enseña a ignorar estos mails',
  () => { const r = A.queAvisar([H, V('Ana Prueba', '05/11/2026', 'Pagó'), V('Otra Prueba', '', 'No vino')], a10, {});
    return r.mails.length === 0 || JSON.stringify(r.mails.map(m => m.asunto)); });
caso('el día pasado y sigue Pendiente: avisa una vez que no se marcó',
  'o no vino o pagó y nadie lo anotó',
  () => { const s = { visto: { 'ana prueba|curso de cocina — prueba': true }, resumen: '2026-11-1' };
    const r1 = A.queAvisar([H, V('Ana Prueba', '30/10/2026')], a10, s);
    const r2 = A.queAvisar([H, V('Ana Prueba', '30/10/2026')], new Date(2026, 10, 1, 11, 0), r1.estado);
    return (r1.mails.length === 1 && /No se marcó/.test(r1.mails[0].asunto) && r2.mails.length === 0) || `${r1.mails.length}/${r2.mails.length}`; });
caso('el estado vacío cuenta como pendiente',
  'quien carga la fila puede olvidarse del estado',
  () => A.queAvisar([H, V('Ana Prueba', '05/11/2026', ' ')], a8, {}).mails.length === 1 || 'no avisó');
caso('el mail no lleva el número de celular ni el mail de la persona',
  'son datos que no hacen falta para el aviso',
  () => { const f = V('Ana Prueba', '05/11/2026'); f[1] = '099123456 ana@ejemplo.uy';
    const t = JSON.stringify(A.queAvisar([H, f], a10, {}).mails); return !/099123456|ana@ejemplo/.test(t) || 'se coló el contacto'; });


const HR = ['Qué','Para cuándo','Hora','Detalle','Estado','Quién lo cargó','Cargado el'];
const R = (que, dia, estado, hora) => [que, dia || '', hora || '', 'Detalle de prueba', estado || 'Pendiente', 'Sesión de prueba', ''];
caso('un recordatorio nuevo manda un mail con lo que hay que hacer en el asunto',
  'Leo pidió que los recordatorios importantes le lleguen, no solo los pagos',
  () => { const r = A.queAvisar([H], a8, {}, [HR, R('Llamar a la proveedora de harina', '05/11/2026')]);
    return (r.mails.length === 1 && /^Recordatorio: Llamar a la proveedora/.test(r.mails[0].asunto)) || JSON.stringify(r.mails.map(m => m.asunto)); });
caso('el recordatorio de hoy entra en el asunto del resumen, junto con las visitas',
  'un solo mail por día con todo lo de HOY',
  () => { const s = { visto: { 'ana prueba|curso de cocina — prueba': true, 'rec|confirmar el salon|01/11': true } };
    const r = A.queAvisar([H, V('Ana Prueba', '01/11/2026')], a10, s, [HR, R('Confirmar el salón', '01/11/2026')]);
    return (r.mails.length === 1 && /^HOY: .*Ana Prueba.*Confirmar el salón/.test(r.mails[0].asunto)) || JSON.stringify(r.mails.map(m => m.asunto)); });
caso('un recordatorio Hecho no avisa',
  'lo resuelto no tiene que seguir llegando',
  () => A.queAvisar([H], a10, {}, [HR, R('Algo ya hecho', '01/11/2026', 'Hecho')]).mails.length === 0 || 'avisó algo Hecho');
caso('un recordatorio con la fecha pasada avisa una vez',
  'si pasó y sigue Pendiente, o se hizo y no se marcó o se olvidó',
  () => { const s = { visto: { 'rec|pagar el alquiler|30/10': true }, resumen: '2026-11-1' };
    const r1 = A.queAvisar([H], a10, s, [HR, R('Pagar el alquiler', '30/10/2026')]);
    const r2 = A.queAvisar([H], new Date(2026, 10, 1, 11), r1.estado, [HR, R('Pagar el alquiler', '30/10/2026')]);
    return (r1.mails.length === 1 && /^Pasó la fecha/.test(r1.mails[0].asunto) && r2.mails.length === 0) || `${r1.mails.length}/${r2.mails.length}`; });

caso('varias cosas nuevas juntas van en un solo mail',
  'se cargaron 13 de golpe el 4/10: 13 mails en la misma hora es ruido',
  () => { const r = A.queAvisar([H, V('Ana Prueba', '05/11/2026'), V('Otra Prueba', '')], a8, {}, [HR, R('Algo', ''), R('Otra cosa', '06/11/2026')]);
    return (r.mails.length === 1 && /^4 cosas nuevas: /.test(r.mails[0].asunto) && /Otra cosa/.test(r.mails[0].cuerpo)) || JSON.stringify(r.mails.map(m => m.asunto)); });

caso('si el grupo está sin confirmar, el asunto del mail lo dice',
  'lo que hay que decidir es el grupo, y el asunto es lo que se ve en la notificación',
  () => { const f = V('Ana Prueba', ''); f[2] = 'Curso de cocina — Octubre 2026 (grupo SIN confirmar: jueves 10-12h o miércoles 19-21h)';
    const r = A.queAvisar([H, f], a10, { visto: { 'ana prueba|curso de cocina — octubre 2026 (grupo sin confirmar: jueves 10-12h o miercoles 19-21h)': true } });
    return /GRUPO SIN CONFIRMAR: jueves 10-12h o miércoles 19-21h\?/.test((r.mails[0] || {}).asunto) || JSON.stringify(r.mails.map(m => m.asunto)); });

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
process.exit(fallas ? 1 : 0);
