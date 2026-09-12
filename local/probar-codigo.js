// Control estático de Codigo.gs ANTES de pegarlo en Apps Script.
// Importa porque ese pegado es a ciegas: si hay un typo en un nombre de función,
// la app queda rota en producción y solo se descubre abriéndola.
const fs = require('fs'), path = require('path');
const ruta = process.argv[2] || path.join(__dirname, '..', 'apps-script', 'Codigo.gs');
const src = fs.readFileSync(ruta, 'utf8');

let fallas = 0;
const chequear = (nombre, cond, detalle) => {
  if (cond) console.log('  ok    ' + nombre);
  else { fallas++; console.log('  FALLA ' + nombre + '\n        ' + detalle); }
};

// Deja solo el código: sin comentarios y sin el contenido de los textos, porque
// en castellano abundan cosas como "a la vez (" que parecen llamadas a función.
const soloCodigo = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/.*/g, ' ')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

chequear('parsea como JavaScript', (() => {
  try { new Function(src); return true; } catch (e) { return 'no parsea: ' + e.message; }
})() === true, 'un error de sintaxis rompe la app entera al desplegar');

// Las de arriba de todo (las que se pueden llamar desde cualquier lado).
const declaradas = new Set((src.match(/^function\s+([A-Za-z_$][\w$]*)/gm) || []).map(l => l.replace(/^function\s+/, '')));
const constantes = new Set((src.match(/^var\s+([A-Za-z_$][\w$]*)/gm) || []).map(l => l.replace(/^var\s+/, '')));
// Y las de adentro de una función: "var marcar = function (...)", indentadas.
// Sin esto el control marcaba como inexistentes a funciones que sí existen.
const locales = new Set((soloCodigo.match(/(?:^|[\s;{(])(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/gm) || [])
  .map(l => l.replace(/^[\s;{(]*(?:var|let|const)\s+/, '').replace(/\s*=$/, '')));

const conocidas = new Set(['function','if','for','while','switch','catch','return','typeof','new','var','else','do',
  'String','Number','Boolean','Array','Object','Math','Date','JSON','RegExp','Error','isFinite','isNaN',
  'parseFloat','parseInt','encodeURIComponent','decodeURIComponent',
  // servicios de Google que solo existen dentro de Apps Script
  'Sheets','HtmlService','ContentService','PropertiesService','CacheService','Utilities','SpreadsheetApp']);
const metodos = new Set(['filter','map','forEach','reduce','some','every','indexOf','join','split','slice','replace',
  'match','test','trim','toLowerCase','toUpperCase','push','pop','sort','concat','keys','values','stringify','parse',
  'round','min','max','floor','ceil','abs','getTime','toISOString','charAt','getFullYear','getMonth','getDate',
  'exec','apply','call','valueOf','toString','setProperty','getProperty','put','get','remove','createTextOutput',
  'setMimeType','createTemplateFromFile','evaluate','setTitle','addMetaTag','getScriptCache','getScriptProperties',
  'computeDigest','batchGet','getContent','includes','startsWith','endsWith','padStart','find','reverse','splice']);

// Ojo: NO consumir el carácter de antes. Con /(^|[^\w$.])nombre\(/ el paréntesis
// de la llamada externa se consume y la llamada de adentro —construirEstado(
// leerPlanilla())— queda sin delimitador y no se ve. Es el caso que importa.
const llamadas = new Set();
const re = /(?<![\w$.])([a-z][A-Za-z0-9_$]*)\s*\(/g;
let m;
while ((m = re.exec(soloCodigo)) !== null) llamadas.add(m[1]);

const faltan = [...llamadas].filter(n => !declaradas.has(n) && !constantes.has(n) && !locales.has(n)
                                        && !conocidas.has(n) && !metodos.has(n));
chequear('todas las funciones que se llaman existen',
  faltan.length === 0, 'se llaman y no están declaradas: ' + faltan.join(', '));

const entradas = ['doGet','obtenerEstado','configurarPin','include'];  // las llama Google, no el código
const muertas = [...declaradas].filter(n => !llamadas.has(n) && entradas.indexOf(n) === -1);
chequear('no hay funciones que no use nadie',
  muertas.length === 0, 'código muerto: ' + muertas.join(', '));

chequear('sigue sin usar SpreadsheetApp',
  !/SpreadsheetApp\s*\./.test(soloCodigo),
  'usarlo obliga a pedir permiso de ESCRITURA sobre todas las planillas de la cuenta');

chequear('la app no escribe en la planilla',
  !/Values\s*\.\s*(update|append|batchUpdate|clear)/i.test(soloCodigo),
  'es una app de solo lectura: no puede tocar la planilla ni por accidente');

// Los datos de la gente no pueden viajar en la propia página.
// Se mira el archivo crudo: acá el texto 'null' es justamente lo que importa.
chequear('la página se sirve sin datos adentro',
  /datosIniciales\s*=\s*'null'\s*;/.test(src),
  'si se incrusta el estado en el HTML, tener la URL alcanza para ver los nombres y los celulares');

console.log('\n' + (fallas === 0 ? 'CÓDIGO VERIFICADO — listo para pegar en Apps Script' : fallas + ' FALLAS'));
process.exit(fallas ? 1 : 0);
