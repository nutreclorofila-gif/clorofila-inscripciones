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
  'compararEstados,quienesEstan,recibirEstado,verNovedades:()=>NOVEDADES};')(localStorage);

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

console.log('\n--- Qué cambió desde la última vez ---');
// Se abre la app varias veces por día: lo primero que uno quiere saber es si se
// anotó alguien.
const conGente = (personas, vigente) => ({
  ediciones: [{ edicion: 'Taller X — 12/11/2026', vigente: vigente !== false, personas: personas }]
});
const P = (nombre, email) => ({ nombre: nombre, email: email || (nombre.toLowerCase() + '@x.com') });

almacen = {};
ctx.guardarCache(conGente([P('Ana'), P('Beto')]), '511208');
ctx.recibirEstado(conGente([P('Ana'), P('Beto')]), '511208');
caso('si no cambió nada, no avisa nada', null, ctx.verNovedades());

almacen = {};
ctx.guardarCache(conGente([P('Ana'), P('Beto')]), '511208');
ctx.recibirEstado(conGente([P('Ana'), P('Beto'), P('Caro')]), '511208');
caso('si se anotó alguien, dice quién', ['Caro'], (ctx.verNovedades().gente || []).map(x => x.nombre));

// El caso que rompe las comparaciones por número de fila.
almacen = {};
ctx.guardarCache(conGente([P('Ana'), P('Beto')]), '511208');
ctx.recibirEstado(conGente([P('Beto'), P('Ana')]), '511208');
caso('si se reordenan las filas, NO inventa anotados', null, ctx.verNovedades());

almacen = {};
ctx.guardarCache(conGente([P('Ana')]), '511208');
ctx.recibirEstado(conGente([P('Ana'), P('Caro')], false), '511208');
caso('no avisa de una edición que ya pasó', null, ctx.verNovedades());

almacen = {};   // primera vez en este teléfono: no hay con qué comparar
ctx.recibirEstado(conGente([P('Ana'), P('Beto')]), '511208');
caso('la primera vez no dice que se anotaron todos', null, ctx.verNovedades());

almacen = {};
ctx.guardarCache(conGente([P('Ana')]), '511208');
ctx.recibirEstado(conGente([P('Ana'), P('Sin Mail', '')]), '511208');
caso('a quien no tiene mail lo ubica por el nombre', ['Sin Mail'], (ctx.verNovedades().gente || []).map(x => x.nombre));

almacen = {};
ctx.guardarCache(conGente([P('Ana')]), '511208');
ctx.recibirEstado(conGente([P('Ana'), P('Caro')]), '511208');
caso('y el estado nuevo igual queda guardado', true, !!ctx.leerCache('511208'));

console.log('\n--- Almacenamiento roto (modo privado, sitio bloqueado) ---');
// Importa porque: si tirar una excepción rompe la app, Leo se queda sin números.
const roto = new Function('localStorage', trozo + '\nreturn {guardarCache,leerCache,pinGuardado,olvidarTodo,recibirEstado};')({
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
