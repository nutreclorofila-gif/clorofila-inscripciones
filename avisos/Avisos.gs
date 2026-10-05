/**
 * Avisos por mail de los "Pagos en persona" de la Master.
 *
 * La app del celular muestra la alerta, pero solo si Leo la abre. Esto le manda
 * un mail a su propia cuenta, que Gmail le notifica en el teléfono:
 *   - cuando se carga una visita nueva (dentro de la hora);
 *   - un resumen por día, desde las 9, mientras haya visitas pendientes, que
 *     dice HOY / MAÑANA / sin día acordado (cubre el día anterior y el mismo día);
 *   - una vez, si el día acordado pasó y la visita sigue Pendiente.
 *
 * Proyecto aparte de la app a propósito: mandar mails pide un permiso que la
 * app no tiene, y agregárselo la dejaría sin andar hasta volver a autorizarla.
 * Solo LEE la planilla. Lo que ya avisó lo guarda en las propiedades del script.
 */

var ID_PLANILLA = '1C3UfC__jr3F0x_XWp5lRvL47MLjQqOwTa9wURKuXZBQ';
var HOJA = 'Pagos en persona';
var URL_APP = 'https://nutreclorofila-gif.github.io/clorofila-inscripciones/';
var HORA_RESUMEN = 9;

/** Lo corre el activador cada hora. */
function revisarVisitas() {
  var resp = Sheets.Spreadsheets.Values.get(ID_PLANILLA, "'" + HOJA + "'!A:J", { valueRenderOption: 'FORMATTED_VALUE' });
  var props = PropertiesService.getScriptProperties();
  var estado = JSON.parse(props.getProperty('avisado') || '{}');
  var r = queAvisar(resp.values || [], new Date(), estado);
  var para = Session.getEffectiveUser().getEmail();
  r.mails.forEach(function (m) {
    MailApp.sendEmail({ to: para, subject: m.asunto, body: m.cuerpo + '\n\nAbrir la app: ' + URL_APP, name: 'Clorofila — Avisos' });
  });
  props.setProperty('avisado', JSON.stringify(r.estado));
}

/** Correr UNA vez a mano desde el editor: crea el activador y autoriza los permisos. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarVisitas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarVisitas').timeBased().everyHours(1).create();
  revisarVisitas();
}

/**
 * Para autorizar desde el navegador: el editor abre el permiso en una ventana
 * emergente que el navegador de Claude bloquea, y esta página (solo la ve el
 * dueño) lo pide en la misma pestaña. Instala el activador y dice qué quedó.
 */
function doGet() {
  instalar();
  var n = ScriptApp.getProjectTriggers().length;
  return ContentService.createTextOutput('Listo: avisos instalados (' + n + ' activador).');
}

/* ---------- lógica pura (se prueba en local/probar-avisos.js) ---------- */

function sinTildes(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function leerFilas(filas) {
  var res = [];
  (filas || []).slice(1).forEach(function (f, i) {
    var nombre = String(f[0] || '').trim();
    if (!nombre) return;
    var e = sinTildes(f[6]);
    var estado = !e || /^pend/.test(e) ? 'pendiente' : /^pag/.test(e) ? 'pago'
               : /^no vin/.test(e) ? 'no_vino' : /^cancel|^anul/.test(e) ? 'cancelado' : 'pendiente';
    var m = String(f[3] || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    var fecha = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
    res.push({
      fila: i + 2, nombre: nombre, edicion: String(f[2] || '').trim(), fecha: fecha,
      dia: m ? m[1] + '/' + m[2] : '', hora: String(f[4] || '').trim(), monto: String(f[5] || '').trim(),
      estado: estado, notas: String(f[8] || '').trim(),
      clave: sinTildes(nombre) + '|' + sinTildes(f[2])
    });
  });
  return res;
}

function fechaClave(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function linea(v, hoy) {
  var cuando = 'sin día acordado';
  if (v.fecha) {
    var dias = Math.round((v.fecha - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000);
    cuando = dias === 0 ? 'HOY' : dias === 1 ? 'MAÑANA' : dias < 0 ? 'tenía que venir el ' + v.dia + ' (sigue Pendiente)' : 'el ' + v.dia;
    if (dias >= 0 && v.hora) cuando += ' a las ' + v.hora;
  }
  return '- ' + v.nombre + ': ' + cuando +
    (v.edicion ? '\n  ' + v.edicion : '') + (v.monto ? '\n  Trae ' + v.monto : '') + (v.notas ? '\n  ' + v.notas : '');
}

/**
 * Qué mails mandar ahora. estado = { visto: {clave: true}, resumen: 'aaaa-m-d',
 * vencida: {clave: true} }. Devuelve los mails y el estado nuevo.
 */
function queAvisar(filas, ahora, estado) {
  var est = { visto: Object.assign({}, (estado && estado.visto) || {}), resumen: (estado && estado.resumen) || '',
              vencida: Object.assign({}, (estado && estado.vencida) || {}) };
  var hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  var pend = leerFilas(filas).filter(function (v) { return v.estado === 'pendiente'; });
  var mails = [];

  var nuevas = pend.filter(function (v) { return !est.visto[v.clave]; });
  nuevas.forEach(function (v) {
    mails.push({ asunto: 'Pago en persona: ' + v.nombre, cuerpo: 'Se cargó una visita para pagar en el estudio:\n\n' + linea(v, hoy) });
    est.visto[v.clave] = true;
  });

  pend.forEach(function (v) {
    if (v.fecha && v.fecha < hoy && !est.vencida[v.clave] && !nuevas.some(function (n) { return n.clave === v.clave; })) {
      mails.push({ asunto: 'No se marcó: ' + v.nombre + ' tenía que venir a pagar el ' + v.dia,
                   cuerpo: '¿Vino? Si pagó, poné Pagó en Estado; si no, No vino.\n\n' + linea(v, hoy) });
      est.vencida[v.clave] = true;
    }
  });

  if (pend.length && ahora.getHours() >= HORA_RESUMEN && est.resumen !== fechaClave(hoy)) {
    var dias = function (v) { return v.fecha ? Math.round((v.fecha - hoy) / 86400000) : null; };
    var deHoy = pend.filter(function (v) { return dias(v) === 0; });
    var deManana = pend.filter(function (v) { return dias(v) === 1; });
    var asunto = deHoy.length ? 'HOY viene a pagar: ' + deHoy.map(function (v) { return v.nombre; }).join(', ')
               : deManana.length ? 'Mañana viene a pagar: ' + deManana.map(function (v) { return v.nombre; }).join(', ')
               : 'Pagos en persona pendientes (' + pend.length + ')';
    mails.push({ asunto: asunto, cuerpo: 'Visitas pendientes para pagar en el estudio:\n\n' +
      pend.map(function (v) { return linea(v, hoy); }).join('\n\n') +
      '\n\nCuando alguien paga, poné Pagó en la pestaña "' + HOJA + '".' });
    est.resumen = fechaClave(hoy);
  }

  // Lo que ya no está pendiente se olvida: si vuelve a cargarse, avisa de nuevo.
  var vivas = {};
  pend.forEach(function (v) { vivas[v.clave] = true; });
  Object.keys(est.visto).forEach(function (k) { if (!vivas[k]) delete est.visto[k]; });
  Object.keys(est.vencida).forEach(function (k) { if (!vivas[k]) delete est.vencida[k]; });
  return { mails: mails, estado: est };
}
