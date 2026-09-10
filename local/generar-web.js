// Genera web/index.html (lo que publica GitHub Pages) desde apps-script/Index.html.
// Es el mismo archivo: solo se le fija la URL de la API, porque servido fuera de
// Apps Script no existe google.script.run.
const fs = require('fs'), path = require('path');

const API = 'https://script.google.com/macros/s/AKfycbzLD9WH9fQN7_yVuSzC1KtQ1PRabYKK5YBEKUkOmssRDLsV0SfRq-kM5HxgNYN6_FpT/exec';

let s = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Index.html'), 'utf8');
s = s.replace('<?!= datosIniciales ?>', 'null');
s = s.replace('  var DATOS = null;',
  '  // Apunta al Apps Script que lee la planilla. El PIN es lo que protege los datos.\n' +
  '  var URL_API = ' + JSON.stringify(API) + ';\n' +
  '  var DATOS = null;');

if (!s.includes('URL_API')) throw new Error('no se pudo inyectar la URL de la API');
fs.writeFileSync(path.join(__dirname, '..', 'web', 'index.html'), s);
console.log('web/index.html regenerado (' + Math.round(s.length / 1024) + ' KB)');
