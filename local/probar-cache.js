// Lo que queda escrito en el teléfono. Importa porque ahí están los nombres,
// los mails y los celulares de todos los inscriptos.
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..');

// Se saca el JS de la página tal cual y se le da un localStorage de mentira.
const html = fs.readFileSync(path.join(base, 'apps-script', 'Index.html'), 'utf8');
const js = html.split('<script>')[1].split('</script>')[0].replace('<?!= datosIniciales ?>', 'null');
const trozo = js.slice(0, js.indexOf('/**\n   * Trae los datos del servidor'));

let almacen = {};
const localStorage = {
  getItem: (k) => (k in almacen ? almacen[k] : null),
  setItem: (k, v) => { almacen[k] = String(v); },
  removeItem: (k) => { delete almacen[k]; }
};
const ctx = new Function('localStorage', trozo +
  '\nreturn {guardarCache,leerCache,borrarCache,guardarPin,pinGuardado,olvidarPin,olvidarTodo,VIDA_CACHE,' +
  'verAlmacen:()=>0};')(localStorage);

let fallas = 0, corridos = 0;
function caso(nombre, esperado, obtenido) {
  corridos++;
  const a = JSON.stringify(esperado), b = JSON.stringify(obtenido);
  if (a === b) { console.log('  ok    ' + nombre); return; }
  fallas++;
  console.log('  FALLA ' + nombre + '\n        esperaba ' + a + '\n        dio      ' + b);
}

const ESTADO = { totales: { recaudado: 80400 }, gente: ['Fulana'] };

console.log('\n--- Guardar y recuperar ---');
almacen = {};
ctx.guardarPin('511208');
ctx.guardarCache(ESTADO, '511208');
caso('vuelve con el PIN correcto',  ESTADO, (ctx.leerCache('511208') || {}).estado);
caso('no vuelve con otro PIN',      null,   ctx.leerCache('000000'));
caso('el PIN queda guardado',       '511208', ctx.pinGuardado());

console.log('\n--- Vencimiento ---');
// Importa porque: mostrar la plata de hace una semana como si fuera de hoy es
// peor que decir "no pude leer".
almacen = {};
ctx.guardarCache(ESTADO, '511208');
const c = JSON.parse(almacen['clorofila_ultimo']);
c.cuando = Date.now() - (ctx.VIDA_CACHE + 1000);
almacen['clorofila_ultimo'] = JSON.stringify(c);
caso('vencida no se muestra',            null, ctx.leerCache('511208'));
caso('vencida además se borra sola',     undefined, almacen['clorofila_ultimo']);

almacen = {};
ctx.guardarCache(ESTADO, '511208');
const c2 = JSON.parse(almacen['clorofila_ultimo']);
c2.cuando = Date.now() - (ctx.VIDA_CACHE - 60000);
almacen['clorofila_ultimo'] = JSON.stringify(c2);
caso('un minuto antes de vencer sigue sirviendo', ESTADO, (ctx.leerCache('511208') || {}).estado);

almacen = {};
almacen['clorofila_ultimo'] = JSON.stringify({ pin: '511208', estado: ESTADO });  // sin fecha
caso('sin fecha se descarta', null, ctx.leerCache('511208'));

console.log('\n--- Salir ---');
// Importa porque: hasta ahora no había ninguna forma de sacar los datos del teléfono.
almacen = {};
ctx.guardarPin('511208');
ctx.guardarCache(ESTADO, '511208');
ctx.olvidarTodo();
caso('no queda nada guardado', [], Object.keys(almacen));
caso('y no se puede recuperar', null, ctx.leerCache('511208'));

console.log('\n--- Almacenamiento roto (modo privado, sitio bloqueado) ---');
// Importa porque: si tirar una excepción rompe la app, Leo se queda sin números.
const roto = new Function('localStorage', trozo + '\nreturn {guardarCache,leerCache,pinGuardado,olvidarTodo};')({
  getItem: () => { throw new Error('bloqueado'); },
  setItem: () => { throw new Error('bloqueado'); },
  removeItem: () => { throw new Error('bloqueado'); }
});
caso('guardar no explota', undefined, roto.guardarCache(ESTADO, '511208'));
caso('leer devuelve null',  null,     roto.leerCache('511208'));
caso('pinGuardado devuelve vacío', '', roto.pinGuardado());
caso('salir no explota', undefined,   roto.olvidarTodo());

console.log('\n--- El botón está conectado ---');
const tieneBoton = /id="btnSalir"/.test(html);
const tieneHandler = /getElementById\('btnSalir'\)\.addEventListener/.test(html);
const seMuestra = /getElementById\('btnSalir'\)\.classList\.remove\('oculto'\)/.test(html);
const seEsconde = /getElementById\('btnSalir'\)\.classList\.add\('oculto'\)/.test(html);
caso('existe el botón', true, tieneBoton);
caso('tiene handler', true, tieneHandler);
caso('se muestra al entrar', true, seMuestra);
caso('se esconde en la puerta', true, seEsconde);

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
