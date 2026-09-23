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
const WEB = path.join(base, 'web', 'index.html');
const GENERAR_WEB = path.join(base, 'local', 'generar-web.js');
const PUBLICAR = path.join(base, 'local', 'publicar-pagina.sh');
const DESPLEGAR = path.join(base, 'desplegar.sh');

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
  ['Plata no muestra el curso que se cobra en cuotas', INDEX,
   'return e.vigente || e.cobrando; });', 'return e.vigente; });'],
  ['no se leen las cuotas', CODIGO,
   '    aplicarCuotas(ed, cuotas);\n', ''],
  ['una cuota pagada sin monto no cuenta', CODIGO,
   '(c.monto || PRECIOS.cursoCuota)', '(c.monto || 0)'],
  ['el precio viejo mira el total con cuotas', CODIGO,
   'if (p.primerPago) montos.push(p.primerPago)', 'if (p.monto) montos.push(p.monto)'],
  ['la cuota vencida no avisa nunca', CODIGO,
   'if (!c || fechaOrdenable(c.vence) >= corte) return;', 'if (!c || true) return;'],
  ['la cuota avisa antes de vencer', CODIGO,
   'if (!c || fechaOrdenable(c.vence) >= corte) return;', 'if (!c) return;'],
  ['el primer pago viaja al teléfono', CODIGO,
   "'montoTexto', 'primerPago']", "'montoTexto']"],
  ['el curso que empezó lista como deudor a todos', CODIGO,
   'ed.pendientes = ed.pendientes.filter(function (p) { return p.cuotasPagadas !== undefined && p.saldo > 0; });', ''],
  ['el mail de las cuotas se compara tal cual', CODIGO,
   "email: String(correo || '').trim().toLowerCase(),", "email: String(correo || ''),"],
  ['la cuota mensual se cobra contra el pago bonificado', CODIGO,
   'p.saldo = PRECIOS.cursoCuota * (PRECIOS.cursoMeses - hechas);', 'p.saldo = PRECIOS.cursoTotal - cobrado;'],
  ['una cuota de alguien no anotado no avisa', CODIGO,
   '    if (c.ligada) return;', '    return;'],
  ['la tarjeta dice "hay lugar" en una edición cerrada o pasada', INDEX,
   'e.quedan > 0 && e.abierta && e.vigente', 'e.quedan > 0'],
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
   'if (!ed || ed.vigente || x.yaAnotado) return;', 'if (!ed || x.yaAnotado) return;'],
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
   'border: none; background: none; color: var(--apagado); font: inherit; font-size: 13px;'],
  ['en Plata, tocar a quien debe ya no abre su contacto', INDEX,
   "(CONTACTOS[clave] ? contacto(x.p) : '');", "'';"],
  ['en Gente, tocar a alguien ya no abre su contacto', INDEX,
   "(CONTACTOS[quien] ? contacto(x.p) : '');", "'';"],
  ['se libera un lugar con gente esperando y no avisa', CODIGO,
   '(conLugar[ed.edicion] = conLugar[ed.edicion] || { ed: ed, gente: [] }).gente.push(x);', ''],
  ['avisa de escribirle aunque la edición esté cerrada', CODIGO,
   'if (!ed.abierta) return;', ''],
  ['la tarjeta con lugar vuelve a decir lo mismo que llena', INDEX,
   '? (e.quedan > 0', '? (false'],
  ['la lista de espera sin fecha vuelve a no verse', INDEX,
   'var sueltos = (DATOS.espera || []).filter(function (x) { return !x.edicion; });', 'var sueltos = [];'],
  ['sin nada guardado, vuelve a no avisar quién se anotó', INDEX,
   ': novedadesPorFecha(estado);', ': null;'],
  ['el aviso por fecha deja de contar a los que no tienen fecha', INDEX,
   'if (NOVEDADES.porFecha && NOVEDADES.sinFecha) {', 'if (false) {'],
  ['la persona deja de mostrar cuándo se anotó', INDEX,
   "anotado ? 'se anotó el ' + diaYMes(anotado) : ''", "''"],
  ['la fecha de inscripción se lee mes/día', CODIGO,
   'var dia = Number(m[1]), mes = Number(m[2]), anio = Number(m[3]);',
   'var dia = Number(m[2]), mes = Number(m[1]), anio = Number(m[3]);'],
  ['la fecha con el año primero vuelve a no entenderse', CODIGO,
   'if (alReves) m = [alReves[0], alReves[3], alReves[2], alReves[1]];', ''],
  ['el aviso por fecha vuelve a culpar a Tikzet de todos los sin fecha', INDEX,
   'sin fecha en la planilla (por ejemplo, las ventas de Tikzet), ',
   'sin fecha en la planilla (las ventas de Tikzet no la traen), '],
  ['manda a escribirle a quien espera y ya se anotó', CODIGO,
   '    if (x.yaAnotado) return;\n', ''],
  ['no reconoce por el celular a quien ya se anotó', CODIGO,
   '(x.whatsapp && p.whatsapp === x.whatsapp)', 'false'],
  ['dice que quedó esperando un taller al que fue', CODIGO,
   'if (!ed || ed.vigente || x.yaAnotado) return;', 'if (!ed || ed.vigente) return;'],
  ['la tarjeta cuenta como esperando a quien ya se anotó', INDEX,
   'x.edicion === e.edicion && !x.yaAnotado', 'x.edicion === e.edicion'],
  // Alertas que funcionaban pero ninguna prueba hacía saltar (hasta el 23/9).
  ['el sobrecupo deja de avisarse', CODIGO,
   'if (ed.quedan < 0) {', 'if (false) {'],
  ['el sobrecupo de una edición cerrada sale como urgente', CODIGO,
   "nivel: ed.abierta ? 'alta' : 'media', tipo: 'sobrecupo'", "nivel: 'alta', tipo: 'sobrecupo'"],
  ['una fórmula que no se entiende deja de avisarse', CODIGO,
   'if (!ed.regla) {\n      alertas.push({', 'if (!ed.regla) {\n      return;\n      alertas.push({'],
  ['el Panel lleno deja de avisarse', CODIGO,
   'if (filas.panelLleno) {', 'if (false) {'],
  ['el Panel justo en el tope no se da por lleno', CODIGO,
   'panelLleno: valores.length >= FILAS_PANEL,', 'panelLleno: valores.length > FILAS_PANEL,'],
  ['una edición sin fórmula leíble rompe el armado', CODIGO,
   'if (!ed.regla) return false;', ''],
  ['las gift cards sin importe dejan de avisarse', CODIGO,
   'if (giftGlobal && giftGlobal.faltaElMonto) {', 'if (false) {'],
  ['la lista de espera ilegible no llega a Alertas', CODIGO,
   'if (esperaGlobal && esperaGlobal.noSeSupoLeer) {', 'if (false) {'],
  ['la lista de espera sin qué espera deja de avisarse', CODIGO,
   'if (esperaGlobal && esperaGlobal.sinColumnaEdicion) {', 'if (false) {'],
  ['una fecha que no se entiende deja de avisarse', CODIGO,
   'if (ed.fecha) return;', 'return;'],
  ['el casi lleno deja de avisarse', CODIGO,
   'ed.ocupacion >= 0.7', 'ed.ocupacion >= 7'],
  // Los totales de arriba (barra de la portada y "Falta cobrar" de Plata).
  ['"Falta cobrar" suma lo cobrado en vez del saldo', CODIGO,
   "saldo: sumar(vigentes, 'saldo'),", "saldo: sumar(vigentes, 'recaudado'),"],
  ['los lugares libres suman el cupo', CODIGO,
   "libres: sumar(vigentes, 'quedan'),", "libres: sumar(vigentes, 'cupo'),"],
  ['los pendientes cuentan ediciones que ya pasaron', CODIGO,
   'pendientes: vigentes.reduce(', 'pendientes: ediciones.reduce('],
  // La tarjeta abierta de Cupos y las gift cards de Plata.
  ['la tarjeta abierta deja de escapar el nombre', INDEX,
   "'<div class=\"nom\">' + esc(p.nombre || '(sin nombre)') +", "'<div class=\"nom\">' + (p.nombre || '(sin nombre)') +"],
  ['el chip de quien debe muestra lo que pagó', INDEX,
   "plata(p.saldo) : '');", "plata(p.monto) : '');"],
  ['las gift cards usadas suman a lo cobrado por adelantado', INDEX,
   'sinUsar.reduce(function (a, g) { return a + (g.monto || 0); }, 0)', 'gc.reduce(function (a, g) { return a + (g.monto || 0); }, 0)'],
  ['el nombre de la gift card deja de escaparse', INDEX,
   "esc(g.nombre || '(sin nombre)')", "(g.nombre || '(sin nombre)')"],
  ['sin importe en las gift cards se inventa un $ 0', INDEX,
   "(r.giftSinMonto ? ''", "(false ? ''"],
  // Publicar la página y el desfase entre página y servidor (23/9).
  ['el aviso de versiones distintas no sale nunca', INDEX,
   "if (f === FORMA_ESPERADA) return '';", "return '';"],
  ['el servidor deja de mandar su versión', CODIGO,
   'forma: FORMA_ESTADO,', ''],
  ['una página editada a mano pasa por buena', GENERAR_WEB,
   'return generar(textoIndex) === textoWeb;', 'return true;'],
  ['publicar-pagina.sh no sube nada a gh-pages', PUBLICAR,
   'git -C "$TMP/gh-pages" push -q "$REMOTO" HEAD:gh-pages', 'true'],
  ['publicar-pagina.sh publica cambios sin commitear', PUBLICAR,
   'if ! git diff --quiet HEAD -- apps-script/Index.html web/index.html; then', 'if false; then'],
  ['desplegar.sh sube el servidor sin mirar si la página se puede publicar', DESPLEGAR,
   'local/publicar-pagina.sh --revisar', 'true'],
  ['desplegar.sh deja de publicar la página', DESPLEGAR,
   'local/publicar-pagina.sh   # la sube a gh-pages', 'true   # la sube a gh-pages'],
  // Publicar sin verificar: pasó en una copia de prueba el 23/9 (ver publicar-pagina.sh).
  ['publicar-pagina.sh publica sin correr verificar.sh', PUBLICAR,
   '  if ! ./verificar.sh > "$SALIDA" 2>&1; then', '  if false; then'],
  ['cualquier VERIFICADO_EN saltea la verificación', PUBLICAR,
   'if [ "${VERIFICADO_EN:-}" != "$(git rev-parse HEAD)" ]; then', 'if [ -z "${VERIFICADO_EN:-}" ]; then'],
  ['desplegar.sh no avisa qué commit ya verificó', DESPLEGAR,
   'export VERIFICADO_EN=$(git rev-parse HEAD)', 'true']
];

const original = {};
[CODIGO, INDEX, PREVIEW, WEB, GENERAR_WEB, PUBLICAR, DESPLEGAR].forEach(f => { original[f] = fs.readFileSync(f, 'utf8'); });
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
  // Una mutación de Index.html se lleva también a web/index.html. Si no, la
  // suite que compara las dos páginas la "detecta" siempre, por el desfase y no
  // por la prueba que tendría que verla, y un agujero en las pruebas de la
  // pantalla quedaría tapado.
  if (archivo === INDEX) execFileSync('node', [GENERAR_WEB], { cwd: base, stdio: 'pipe' });
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
