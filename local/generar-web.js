// Genera web/index.html (lo que publica GitHub Pages) desde apps-script/Index.html.
// Es el mismo archivo: solo se le fija la URL de la API, porque servido fuera de
// Apps Script no existe google.script.run.
//
//   node local/generar-web.js              regenera web/index.html
//   node local/generar-web.js --comprobar  no escribe: sale con 1 si está desactualizado
//   node local/generar-web.js --id         imprime la implementación que usa la página
//
// web/index.html NO se edita a mano: lo pisa la próxima regeneración. Hasta el
// 23/9/2026 ninguna prueba lo miraba, y la verificación daba verde con la
// página publicada vieja o rota. Ahora verificar.sh corre --comprobar.
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..');
const RUTA_INDEX = path.join(base, 'apps-script', 'Index.html');
const RUTA_WEB = path.join(base, 'web', 'index.html');

// La implementación de Apps Script con la que habla la página. Es el ÚNICO lugar
// donde está escrita: desplegar.sh la toma de acá (--id) para saber qué
// implementación actualizar. Antes había una copia en cada archivo y nada
// controlaba que coincidieran. Si alguna vez se crea una implementación nueva
// (cambia la URL), se cambia acá, se regenera la página y se publica.
const ID_IMPLEMENTACION = 'AKfycbzLD9WH9fQN7_yVuSzC1KtQ1PRabYKK5YBEKUkOmssRDLsV0SfRq-kM5HxgNYN6_FpT';
const API = 'https://script.google.com/macros/s/' + ID_IMPLEMENTACION + '/exec';

function generar(textoIndex) {
  const s = textoIndex.replace('  var DATOS = null;',
    '  // Apunta al Apps Script que lee la planilla. El PIN es lo que protege los datos.\n' +
    '  var URL_API = ' + JSON.stringify(API) + ';\n' +
    '  var DATOS = null;');
  if (!s.includes('URL_API')) throw new Error('no se pudo inyectar la URL de la API');
  return s;
}

/** true si la página publicada es exactamente la que sale de este Index.html. */
function alDia(textoIndex, textoWeb) {
  return generar(textoIndex) === textoWeb;
}

module.exports = { generar, alDia, API, ID_IMPLEMENTACION };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--id') {
    console.log(ID_IMPLEMENTACION);
  } else if (arg === '--comprobar') {
    if (!alDia(fs.readFileSync(RUTA_INDEX, 'utf8'), fs.readFileSync(RUTA_WEB, 'utf8'))) {
      console.log('★ web/index.html está desactualizado o editado a mano: corré  node local/generar-web.js');
      process.exit(1);
    }
    console.log('web/index.html está al día con apps-script/Index.html');
  } else {
    const s = generar(fs.readFileSync(RUTA_INDEX, 'utf8'));
    fs.writeFileSync(RUTA_WEB, s);
    console.log('web/index.html regenerado (' + Math.round(s.length / 1024) + ' KB)');
  }
}
