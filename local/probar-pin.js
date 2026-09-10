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

console.log('\n' + (fallas === 0 ? 'PIN VERIFICADO' : fallas + ' FALLAS'));
process.exit(fallas ? 1 : 0);
