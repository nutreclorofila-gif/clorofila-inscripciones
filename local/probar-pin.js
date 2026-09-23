// El PIN es lo único que separa la URL de los datos personales de los inscriptos.
const fs = require('fs'), path = require('path');
const { crear, cargarCon } = require('./entorno-google.js');

// El PIN real vive en local/pin.txt, que no se versiona.
const PIN = fs.readFileSync(path.join(__dirname, 'pin.txt'), 'utf8').trim();
const OTRO = String((Number(PIN) + 1) % 1000000).padStart(6, '0');

let fallas = 0;
const chequear = (nombre, cond, detalle) => {
  if (cond) console.log('  ok    ' + nombre);
  else { fallas++; console.log('  FALLA ' + nombre + '\n        ' + detalle); }
};

console.log('\n--- PIN ---');

let leyoLaPlanilla = false;
const sandbox = crear({ sheetsFalso: { Spreadsheets: {
  get: () => { leyoLaPlanilla = true; return { sheets: [] }; },
  Values: { get: () => ({ values: [] }), batchGet: () => ({ valueRanges: [] }) }
}}});
const G = cargarCon(sandbox);

sandbox.PropertiesService.getScriptProperties().setProperty('PIN_HASH', G.hashPin(PIN));

chequear('el PIN correcto entra', (() => { try { G.verificarPin(PIN); return true; } catch (e) { return e.message; } })() === true,
  'debería dejar pasar');

chequear('un PIN equivocado no entra',
  (() => { try { G.verificarPin('000000'); return 'entró igual'; } catch (e) { return /incorrecto/i.test(e.message); } })() === true,
  'dejó pasar un PIN equivocado');

chequear('sin PIN no entra',
  ['', null, undefined].every(v => { try { G.verificarPin(v); return false; } catch (e) { return true; } }),
  'entró sin PIN');

chequear('un PIN equivocado NO llega a leer la planilla',
  leyoLaPlanilla === false,
  'leyó la planilla antes de validar: los datos podrían filtrarse por el mensaje de error');

chequear('el PIN nunca se guarda en claro',
  sandbox.PropertiesService.getScriptProperties().getProperty('PIN_HASH').indexOf(PIN) === -1,
  'el PIN quedó legible en las propiedades del script');

chequear('el hash es SHA-256 en hexadecimal',
  /^[0-9a-f]{64}$/.test(G.hashPin(PIN)),
  'hash raro: ' + G.hashPin(PIN));

chequear('PINs distintos dan hashes distintos',
  G.hashPin(PIN) !== G.hashPin(OTRO), 'colisión');

// Fuerza bruta
const s2 = crear({ sheetsFalso: {} });
const G2 = cargarCon(s2);
s2.PropertiesService.getScriptProperties().setProperty('PIN_HASH', G2.hashPin(PIN));
let bloqueado = false;
for (let i = 0; i < 12; i++) {
  try { G2.verificarPin('999999'); } catch (e) { if (/Demasiados/i.test(e.message)) bloqueado = true; }
}
chequear('se frena la fuerza bruta', bloqueado,
  'se pueden probar PINs infinitos: 6 dígitos se rompen en minutos');

chequear('después de bloquear, ni el PIN bueno pasa',
  (() => { try { G2.verificarPin(PIN); return false; } catch (e) { return /Demasiados/i.test(e.message); } })(),
  'el bloqueo no aplica al PIN correcto');

console.log('\n--- La puerta real: doGet ---');
// Hasta ahora ninguna prueba ejecutaba doGet, que es lo que responde en
// producción: se le podía sacar el control del PIN y todo seguía en verde.
const leido = { veces: 0 };
const planillaFalsa = { Spreadsheets: {
  get: () => { leido.veces++; return { sheets: [{ properties: { title: 'Panel' } }] }; },
  Values: {
    get: () => ({ values: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado']] }),
    batchGet: (id, o) => ({ valueRanges: o.ranges.map(() => ({ values: [] })) })
  }
}};
const s3 = crear({ sheetsFalso: planillaFalsa });
const G3 = cargarCon(s3);
const pedir = (param) => JSON.parse(G3.doGet({ parameter: param }).getContent());

chequear('sin PIN guardado, ?configurar= NO fija ninguno',
  (() => {
    const r = pedir({ formato: 'json', configurar: '123456' });
    const guardado = s3.PropertiesService.getScriptProperties().getProperty('PIN_HASH');
    return (guardado === null && r.ok === false) || ('quedó guardado: ' + guardado + ' | respuesta: ' + JSON.stringify(r));
  })() === true,
  'si la URL pública deja fijar el PIN, el primero que llega pone el suyo y se lleva los datos');

s3.PropertiesService.getScriptProperties().setProperty('PIN_HASH', G3.hashPin(PIN));
leido.veces = 0;
chequear('doGet con un PIN equivocado no lee la planilla',
  (() => { const r = pedir({ formato: 'json', pin: OTRO }); return r.ok === false && leido.veces === 0; })(),
  'la puerta de producción deja pasar o lee antes de validar');
s3.CacheService.getScriptCache().remove('intentos_pin');

chequear('doGet sin PIN no lee la planilla',
  (() => { const r = pedir({ formato: 'json' }); return r.ok === false && leido.veces === 0; })(),
  'sin PIN no puede salir nada');
s3.CacheService.getScriptCache().remove('intentos_pin');

chequear('doGet con el PIN correcto sí trae el estado',
  (() => { const r = pedir({ formato: 'json', pin: PIN }); return (r.ok === true && !!r.estado && leido.veces > 0) || JSON.stringify(r).slice(0, 200); })() === true,
  'la app dejaría de andar');

chequear('sin ?formato=json no sirve ninguna página',
  (() => {
    const texto = G3.doGet({ parameter: {} }).getContent();
    return (s3.usosHtml.length === 0 && !/[{<]/.test(texto)) || ('HtmlService usado: ' + s3.usosHtml.join(',') + ' | respuesta: ' + texto.slice(0, 80));
  })() === true,
  'una página de Apps Script trae google.script.run, que llama funciones del servidor sin PIN');

console.log('\n' + (fallas === 0 ? 'PIN VERIFICADO' : fallas + ' FALLAS'));
process.exit(fallas ? 1 : 0);
