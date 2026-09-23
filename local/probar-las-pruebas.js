// Rompe el código a propósito y comprueba que ./verificar.sh se dé cuenta.
//
// Una prueba que nunca falla no prueba nada, y eso no se ve leyéndola: pasó de
// verdad en este proyecto — la suite "datos hostiles" generaba una página
// envenenada y nunca miraba si el veneno se ejecutaba, así que se podía sacar
// el escape del XSS y la verificación seguía en verde.
//
// Tarda unos minutos (corre la suite entera una vez por mutación). No va dentro
// de verificar.sh: se corre a mano cuando se tocan las pruebas.
//
//   node local/probar-las-pruebas.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const base = path.join(__dirname, '..');

// ⛔ NO correr esto en segundo plano ni hacer git mientras corre.
// Durante la corrida los archivos del proyecto están ROTOS a propósito. Si en
// ese rato se hace "git add -A && git commit", el commit se lleva el código
// mutado. Pasó el 13/9/2026: quedó commiteado y pusheado un Codigo.gs sin el
// escape del XSS. Por eso el script se planta si hay cambios sin commitear.
try {
  const sucio = execFileSync('git', ['status', '--porcelain'], { cwd: base }).toString().trim();
  if (sucio) {
    console.error('No corras esto con cambios sin commitear: mientras corre, los archivos');
    console.error('quedan rotos a propósito y un commit se llevaría el código mutado.');
    console.error('\nSin commitear:\n' + sucio);
    process.exit(1);
  }
} catch (e) {
  if (e.status === 1) throw e;   // el plantón de arriba
}
const CODIGO = path.join(base, 'apps-script', 'Codigo.gs');
const INDEX = path.join(base, 'apps-script', 'Index.html');
const PREVIEW = path.join(base, 'local', 'generar-preview.js');

// La base tiene que estar en verde. Si verificar.sh ya falla sin tocar nada,
// cada mutación "se detecta" por la falla que ya estaba y el resultado da un
// 100% falso. Pasó: con la suite en rojo por datos nuevos, todo salía detectado.
try {
  execFileSync(path.join(base, 'verificar.sh'), { cwd: base, stdio: 'pipe' });
} catch (e) {
  console.error('verificar.sh ya falla sin mutar nada: arreglá eso primero.');
  console.error(String(e.stdout || '').split('\n').slice(-15).join('\n'));
  process.exit(1);
}

const MUTACIONES = [
  ['acepta cualquier PIN', CODIGO,
   "if (hashPin(String(pin === null || pin === undefined ? '' : pin)) !== guardado) {", 'if (false) {'],
  ['no escapa el < al incrustar (el XSS que hubo)', PREVIEW,
   ".replace(/</g, '\\\\u003c')", ''],
  ['no escapa los saltos invisibles U+2028/2029', PREVIEW,
   ".replace(/\\u2028/g, '\\\\u2028')", ''],
  ['el servidor vuelve a servir la página (lectura sin PIN)', CODIGO,
   "  return ContentService.createTextOutput(\n    'Clorofila",
   "  return HtmlService.createHtmlOutputFromFile('Index');\n  ContentService.createTextOutput(\n    'Clorofila"],
  ['vuelve el ?configurar= por la URL', CODIGO,
   '      verificarPin(p.pin);',
   '      if (p.configurar) PropertiesService.getScriptProperties().setProperty(PROP_PIN, hashPin(String(p.configurar)));\n      verificarPin(p.pin);'],
  ['doGet deja de pedir el PIN', CODIGO,
   '      verificarPin(p.pin);', ''],
  ['queda una función que no usa nadie', CODIGO,
   'function hashPin(pin) {', 'function sobrante() { return 1; }\nfunction hashPin(pin) {'],
  ['el cupo se lee de otra columna del Panel', CODIGO,
   'var cupo = parsearMonto(v[2]);', 'var cupo = parsearMonto(v[4]);'],
  ['deja que una persona cuente en dos ediciones', CODIGO,
   'if (usadas[f.clave]) {', 'if (false) {'],
  ['los montos con coma decimal se leen mal', CODIGO,
   "num = num.replace(/\\./g, '').replace(',', '.');", "num = num.replace(/[.,]/g, '');"],
  ['da por pagada una seña del curso', CODIGO,
   'if (monto >= PRECIOS.cursoTotal) {', 'if (monto > 0) {'],
  ['la interfaz deja de escapar el <', INDEX,
   ".replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')", ".replace(/&/g, '&amp;')"],
  ['la interfaz deja de escapar las comillas', INDEX,
   '.replace(/"/g, \'&quot;\');', ';'],
  ['la caché del teléfono no vence nunca', INDEX,
   'if (!c.cuando || (Date.now() - c.cuando) > VIDA_CACHE) { borrarCache(); return null; }', ''],
  ['vuelve la plata a la portada', INDEX,
   "caja(r.pendientes, r.pendientes === 1 ? 'pago pendiente' : 'pagos pendientes');",
   "caja(plata(r.recaudado), 'cobrado', true);"],
  ['el nombre de pestaña vuelve a distinguir mayúsculas', CODIGO,
   "if (normalizarNombre(f.hoja) !== normalizarNombre(ed.regla.hoja)) return false;",
   'if (f.hoja !== ed.regla.hoja) return false;'],
  ['el histórico de Tikzet deja de contar lo que le falta', CODIGO,
   'hist.entradas += suyas.length; hist.recaudado += monto; hist.sinMonto += faltantes;',
   'hist.entradas += suyas.length; hist.recaudado += monto;'],
  ['una fecha que no existe se acepta igual', CODIGO,
   "if (f.getDate() !== dia || f.getMonth() !== mes - 1 || f.getFullYear() !== anio) return null;", ''],
  ['el "en N días" se corre un día', INDEX,
   "if (dias === 0) return { texto: 'ES HOY', clase: 'ya', dias: 0 };",
   "if (dias === 1) return { texto: 'ES HOY', clase: 'ya', dias: 0 };"],
  ['una columna de fecha vuelve a leerse como la actividad', CODIGO,
   "if (k.indexOf('fecha') === 0 || k.indexOf('día') === 0 || k.indexOf('dia ') === 0) tomadas[k] = true;", ''],
  ['la lista de espera deja de ligarse por la fecha', CODIGO,
   "var fecha = (t.match(/\\d{1,2}\\/\\d{1,2}\\/\\d{4}/) || [])[0];\n  if (!fecha) return null;",
   'return null;'],
  ['deja de avisar de quien espera algo que ya pasó', CODIGO,
   'if (!ed || ed.vigente) return;', 'if (!ed) return;'],
  ['vuelve a tomar la fila 1 como encabezados a ciegas', CODIGO,
   'var inicio = filaDeEncabezados(filas);', 'var inicio = 0;'],
  ['la lista de espera ilegible deja de avisarse', CODIGO,
   "lista.noSeSupoLeer = crudas.length > 0 && lista.length === 0;", 'lista.noSeSupoLeer = false;'],
  ['una gift card canjeada vuelve a figurar sin usar', CODIGO,
   "usada: estaUsada(estado) || !!usadaPor || !!fechaUso,", 'usada: estaUsada(estado),'],
  ['una columna vuelve a alimentar dos campos', CODIGO,
   "var libre = function (k) { return !usadas[k] && obj[k]; };",
   'var libre = function (k) { return !!obj[k]; };'],
  ['la lista copiada vuelve a llevar el estado de pago', INDEX,
   "return (i + 1) + '. ' + (p.nombre || '(sin nombre)');",
   "return (i + 1) + '. ' + (p.nombre || '(sin nombre)') + ' — ' + ETIQUETAS[p.estadoPago] + (p.estadoPago === 'parcial' ? ' ' + plata(p.saldo) : '');"],
  ['el buscador deja de ignorar los acentos', INDEX,
   ".replace(/[áàäâã]/g, 'a')", ''],
  ['el aviso de novedades compara por fila y no por persona', INDEX,
   "var quien = String(p.email || p.nombre || '').trim().toLowerCase();",
   "var quien = String(p.hoja + '#' + p.fila);"]
];

const original = {
  [CODIGO]: fs.readFileSync(CODIGO, 'utf8'),
  [INDEX]: fs.readFileSync(INDEX, 'utf8'),
  [PREVIEW]: fs.readFileSync(PREVIEW, 'utf8')
};
const restaurar = () => Object.keys(original).forEach(f => fs.writeFileSync(f, original[f]));
process.on('exit', restaurar);
process.on('SIGINT', () => { restaurar(); process.exit(1); });

let sinDetectar = 0, aplicadas = 0, sinAplicar = 0;
for (const [nombre, archivo, viejo, nuevo] of MUTACIONES) {
  const s = original[archivo];
  const veces = s.split(viejo).length - 1;
  if (veces !== 1) {
    // Si el código cambió y la mutación ya no calza, esa parte queda sin probar:
    // antes se salteaba en silencio y el total seguía dando "todo detectado".
    sinAplicar++;
    console.log('  ?     ' + nombre.padEnd(48) + ' no pude aplicarla (' + veces + ' coincidencias)');
    continue;
  }
  aplicadas++;
  fs.writeFileSync(archivo, s.replace(viejo, nuevo));
  let detectada = false;
  try { execFileSync(path.join(base, 'verificar.sh'), { cwd: base, stdio: 'pipe' }); }
  catch (e) { detectada = true; }
  restaurar();
  if (detectada) console.log('  ok    ' + nombre.padEnd(48) + ' la detecta');
  else { sinDetectar++; console.log('  ★     ' + nombre.padEnd(48) + ' NO LA DETECTA'); }
}

console.log('\n' + (aplicadas - sinDetectar) + '/' + aplicadas + ' mutaciones detectadas' +
  (sinAplicar ? ' — ' + sinAplicar + ' que ya no calzan con el código' : ''));
if (sinDetectar) console.log('Hay agujeros en las pruebas: se puede romper eso y la verificación sigue en verde.');
if (sinAplicar) console.log('Hay mutaciones que ya no se aplican: actualizalas o esa parte queda sin probar.');
if (sinDetectar || sinAplicar) process.exit(1);
