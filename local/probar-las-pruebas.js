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
   "var quien = String(p.hoja + '#' + p.fila);"],
  ['un monto con punto decimal se lee cien veces más grande', CODIGO,
   "num = (ultima.length === 3) ? partes.join('') : partes.join('.');", "num = partes.join('');"],
  ['la nota del curso confunde cuota con seña', CODIGO,
   'p.nota = monto >= PRECIOS.cursoCuota', 'p.nota = monto < PRECIOS.cursoCuota'],
  ['la coma de miles vuelve a leerse como decimal', CODIGO,
   "if (/^\\d{1,3}(,\\d{3})+$/.test(num)) num = num.replace(/,/g, '');", ''],
  ['los dólares se suman como pesos', CODIGO,
   "if (/u\\$s|us\\$|\\busd\\b|d[oó]lar/i.test(s)) return null;", ''],
  ['un monto absurdo en el curso vuelve a ser una seña', CODIGO,
   'if (ed.esCurso && monto < PRECIOS.cursoMinimo) {', 'if (false) {'],
  ['una fórmula que cuenta en una pestaña que no existe no avisa', CODIGO,
   'if (ed.regla && !leidas[normalizarNombre(ed.regla.hoja)]) ed.pestanaInexistente = true;', ''],
  ['Anotados con #REF! vuelve a leerse como 0', CODIGO,
   'var anotadosLeidos = /^#/.test(textoAnotados) ? null : parsearMonto(textoAnotados);',
   'var anotadosLeidos = parsearMonto(textoAnotados) || 0;'],
  ['una fila del Panel sin Cupo vuelve a desaparecer', CODIGO,
   'if (!edicion) continue;  // saltea la fila de la fórmula de avisos',
   'if (!edicion || parsearMonto(v[2]) === null) continue;'],
  ['sin Cupo, la edición sale como sobrecupo', CODIGO,
   'quedan: cupo === null ? null : cupo - anotados,', 'quedan: cupo - anotados,'],
  ['el Cupo sin cargar deja de avisarse', CODIGO,
   'if (ed.cupo !== null) return;', 'return;'],
  ['las columnas de inscriptos vuelven a leerse por posición', CODIGO,
   'if (!tomadas[k] && c[2].test(enc[k])) { j = k; break; }', 'if (false) { j = k; break; }'],
  ['una columna de inscriptos que falta deja de avisarse', CODIGO,
   'if (columnas.faltan.length && filas.length > 1) {', 'if (false) {'],
  ['"Abierta" vuelve a contar como cerrada', CODIGO,
   'var abierta = /^abiert[oa]/i.test(estado);', 'var abierta = /^abierto/i.test(estado);'],
  ['un Estado que no se entiende deja de avisarse', CODIGO,
   'if (!ed.estadoRaro) return;', 'return;'],
  ['las columnas corridas del Panel dejan de avisarse', CODIGO,
   'if (!c[3].test(normalizarNombre(dice))) raras.push(', 'if (false) raras.push('],
  ['el curso vuelve a contar los días hasta fin de mes', INDEX,
   'if (e.fechaEsMes && e.inicio) return cuandoEsElMes(e.inicio, e.fecha);', ''],
  ['el curso vuelve a ordenarse por el fin de mes', INDEX,
   'var fa = a.inicio || a.fecha, fb = b.inicio || b.fecha;', 'var fa = a.fecha, fb = b.fecha;'],
  ['la tarjeta sin Cupo vuelve a decir "de null"', INDEX,
   "? '<span class=\"de\">anotados</span><span class=\"quedan\"><b>Cupo sin cargar</b></span>'",
   "? '<span class=\"de\">de ' + e.cupo + '</span>'"],
  ['doGet vuelve a mandar el comprobante al teléfono', CODIGO,
   'estado: paraElTelefono(construirEstado(leerPlanilla()))', 'estado: construirEstado(leerPlanilla())'],
  ['el recorte saca algo que la pantalla sí muestra', CODIGO,
   "persona:     ['comprobante', 'idPago',", "persona:     ['celular', 'comprobante', 'idPago',"],
  ['el recorte borra del estado del servidor', CODIGO,
   'var copia = JSON.parse(JSON.stringify(estado));', 'var copia = estado;'],
  ['las gift cards vuelven a mandar mails al teléfono', CODIGO,
   '  sacar(copia.giftCards, NO_VAN_AL_TELEFONO.giftCard);', ''],
  ['cualquier falla vuelve a contar como PIN rechazado', INDEX,
   "return /PIN incorrecto/i.test(String(mensaje || ''));", 'return true;'],
  ['un PIN rechazado vuelve a dejar los datos en el teléfono', INDEX,
   '  function pinGuardadoNoSirve() {\n    olvidarTodo();', '  function pinGuardadoNoSirve() {\n    olvidarPin();'],
  ['al abrir, un error del servidor vuelve a pedir el PIN', INDEX,
   'if (DESDE_CACHE) { MOTIVO_CACHE = mensaje; pintarPanel(); return; }\n      mostrarFalla(mensaje);',
   "if (DESDE_CACHE) { MOTIVO_CACHE = mensaje; pintarPanel(); return; }\n      olvidarPin(); mostrarPuerta('Volvé a escribir el PIN.');"],
  ['el cartel de datos viejos vuelve a culpar a la señal', INDEX,
   "'<div class=\"viejo\">No pude actualizar. ' + esc(MOTIVO_CACHE || 'No hubo respuesta.') +",
   "'<div class=\"viejo\">Sin conexión.' +"],
  ['la página de error de Google vuelve a salir en inglés', INDEX,
   "return { ok: false, error: 'Google no mandó los datos' +",
   "return { ok: false, error: 'Sin conexión con la planilla. Unexpected token' +"],
  ['el pedido colgado ya no se corta nunca', INDEX,
   '}, ESPERA_MAXIMA);', '}, 1e12);'],
  ['deja de avisar que la planilla está tardando', INDEX,
   'var aviso = setTimeout(function () { if (!terminado && alTardar) alTardar(); }, ESPERA_AVISO);',
   'var aviso = null;'],
  ['lo guardado vuelve a esperar a que falle el pedido', INDEX,
   '    var c = leerCache(pin);\n    if (c) {\n      DATOS = c.estado;',
   '    var c = null;\n    if (c) {\n      DATOS = c.estado;'],
  ['Actualizar lanza un segundo pedido encima del primero', INDEX,
   '    if (CARGANDO) return;', ''],
  ['Actualizar se ve antes de que haya algo que actualizar', INDEX,
   '<button class="refrescar oculto" id="btnRefrescar"', '<button class="refrescar" id="btnRefrescar"'],
  ['el cartel de datos viejos falta en Gente', INDEX,
   "      document.getElementById('cartelGente').innerHTML = viejo;", "      document.getElementById('cartelGente').innerHTML = '';"],
  ['llegan los datos y el buscador de Gente se borra', INDEX,
   "      if (!b) {\n        p.innerHTML = '<div id=\"cartelGente\">", "      if (true) {\n        p.innerHTML = '<div id=\"cartelGente\">"],
  ['el cartel de datos viejos falta en Alertas', INDEX,
   '    else p.innerHTML = viejo + vistaAlertas();', '    else p.innerHTML = vistaAlertas();'],
  ['un error de Google vuelve a vaciar el PIN escrito', INDEX,
   "        if (pinRechazado(mensaje)) campo.value = '';", "        campo.value = '';"],
  ['vuelve el "hace 1 días"', INDEX,
   "('hace ' + dias + (dias === 1 ? ' día' : ' días'))", "('hace ' + dias + ' días')"],
  ['lo que llega después de Salir vuelve a guardarse', INDEX,
   '      if (pinGuardado() !== pin) return;   // tocó Salir mientras se buscaba\n', ''],
  ['un corte a mitad de la respuesta deja la app esperando', INDEX,
   '        }, sinRespuesta);\n      }, sinRespuesta)', '        });\n      }, sinRespuesta)'],
  ['el botón Salir vuelve a un color que no existe', INDEX,
   'border: none; background: none; color: var(--tenue); font: inherit; font-size: 13px;',
   'border: none; background: none; color: var(--apagado); font: inherit; font-size: 13px;']
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
