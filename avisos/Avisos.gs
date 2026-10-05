/**
 * Avisos por mail de la Master: "Pagos en persona" y "Recordatorios".
 *
 * La app del celular muestra las alertas, pero solo si Leo la abre. Esto le
 * manda un mail a su propia cuenta, que Gmail le notifica en el teléfono:
 *   - cuando se carga algo nuevo (dentro de la hora);
 *   - un resumen por día, desde las 9, mientras haya cosas pendientes, con HOY /
 *     Mañana en el asunto (cubre el día anterior y el mismo día);
 *   - una vez, si la fecha pasó y sigue Pendiente.
 *
 * Proyecto aparte de la app a propósito: mandar mails pide un permiso que la
 * app no tiene, y agregárselo la dejaría sin andar hasta volver a autorizarla.
 * Solo LEE la planilla. Lo que ya avisó lo guarda en las propiedades del script.
 */

var ID_PLANILLA = '1C3UfC__jr3F0x_XWp5lRvL47MLjQqOwTa9wURKuXZBQ';
var HOJA = 'Pagos en persona';
var HOJA_REC = 'Recordatorios';
var URL_APP = 'https://nutreclorofila-gif.github.io/clorofila-inscripciones/';
var HORA_RESUMEN = 9;

/** Lo corre el activador cada hora. */
function revisarVisitas() {
  var resp = Sheets.Spreadsheets.Values.batchGet(ID_PLANILLA, {
    ranges: ["'" + HOJA + "'!A:J", "'" + HOJA_REC + "'!A:G"], valueRenderOption: 'FORMATTED_VALUE'
  });
  var vr = resp.valueRanges || [];
  var props = PropertiesService.getScriptProperties();
  var estado = JSON.parse(props.getProperty('avisado') || '{}');
  var r = queAvisar((vr[0] || {}).values || [], new Date(), estado, (vr[1] || {}).values || []);
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

function estadoDe(texto) {
  var e = sinTildes(texto);
  return !e || /^pend/.test(e) ? 'pendiente' : /^pag/.test(e) ? 'pago' : /^hech/.test(e) ? 'hecho' : /^deleg/.test(e) ? 'delegado'
       : /^no vin/.test(e) ? 'no_vino' : /^cancel|^anul/.test(e) ? 'cancelado' : 'pendiente';
}

function fechaDe(texto) {
  var m = String(texto || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? { fecha: new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])), dia: m[1] + '/' + m[2] } : { fecha: null, dia: '' };
}

/** " — GRUPO SIN CONFIRMAR: jueves o miércoles?" si la edición lo dice; si no, nada. */
function grupoSinConfirmar(edicion) {
  var g = (String(edicion || '').match(/\(([^)]*sin confirmar[^)]*)\)/i) || [])[1];
  return g ? ' — ' + g.replace(/^grupo sin confirmar/i, 'GRUPO SIN CONFIRMAR') + '?' : '';
}

/** "Pagos en persona": Nombre, Canal, Edición, Día, Hora, Monto, Estado, Tally, Notas, Cargado el. */
function leerFilas(filas) {
  var res = [];
  (filas || []).slice(1).forEach(function (f, i) {
    var nombre = String(f[0] || '').trim();
    if (!nombre) return;
    var d = fechaDe(f[3]);
    res.push({
      tipo: 'visita', fila: i + 2, nombre: nombre, titulo: nombre + ' viene al estudio a pagar' + grupoSinConfirmar(f[2]),
      edicion: String(f[2] || '').trim(), fecha: d.fecha, dia: d.dia, hora: String(f[4] || '').trim(),
      monto: String(f[5] || '').trim(), estado: estadoDe(f[6]), notas: String(f[8] || '').trim(),
      clave: sinTildes(nombre) + '|' + sinTildes(f[2])
    });
  });
  return res;
}

/** "Recordatorios": Qué, Para cuándo, Hora, Detalle, Estado, Quién lo cargó, Cargado el. */
function leerRecordatorios(filas) {
  var res = [];
  (filas || []).slice(1).forEach(function (f, i) {
    var que = String(f[0] || '').trim();
    if (!que) return;
    var d = fechaDe(f[1]);
    res.push({
      tipo: 'recordatorio', fila: i + 2, titulo: que, edicion: '', fecha: d.fecha, dia: d.dia,
      hora: String(f[2] || '').trim(), monto: '', estado: estadoDe(f[4]), notas: String(f[3] || '').trim(),
      clave: 'rec|' + sinTildes(que) + '|' + d.dia
    });
  });
  return res;
}

function fechaClave(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function hoja(v) { return v.tipo === 'visita' ? HOJA : HOJA_REC; }

function linea(v, hoy) {
  var cuando = 'día a confirmar';
  if (v.fecha) {
    var dias = Math.round((v.fecha - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000);
    cuando = dias === 0 ? 'HOY' : dias === 1 ? 'MAÑANA' : dias < 0 ? 'era para el ' + v.dia + ' (sigue Pendiente)' : 'el ' + v.dia;
    if (dias >= 0 && v.hora) cuando += ' a las ' + v.hora;
  }
  return '- ' + v.titulo + ': ' + cuando +
    (v.edicion ? '\n  ' + v.edicion : '') + (v.monto ? '\n  Trae ' + v.monto : '') + (v.notas ? '\n  ' + v.notas : '') +
    '\n  (fila ' + v.fila + ' de la pestaña "' + hoja(v) + '")';
}

/**
 * Qué mails mandar ahora. filas = "Pagos en persona", filasRec = "Recordatorios".
 * estado = { visto: {clave: true}, resumen: 'aaaa-m-d', vencida: {clave: true} }.
 * Devuelve los mails y el estado nuevo.
 */
function queAvisar(filas, ahora, estado, filasRec) {
  var est = { visto: Object.assign({}, (estado && estado.visto) || {}), resumen: (estado && estado.resumen) || '',
              vencida: Object.assign({}, (estado && estado.vencida) || {}) };
  var hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  var pend = leerFilas(filas).concat(leerRecordatorios(filasRec))
    .filter(function (v) { return v.estado === 'pendiente'; });
  var mails = [];

  // Lo nuevo va en UN mail: si se cargan varias cosas juntas, un mail por cada
  // una es una ráfaga que se termina ignorando.
  var nuevas = pend.filter(function (v) { return !est.visto[v.clave]; });
  if (nuevas.length === 1) {
    var v1 = nuevas[0];
    mails.push(v1.tipo === 'visita'
      ? { asunto: 'Pago en persona: ' + v1.nombre, cuerpo: 'Se cargó una visita para pagar en el estudio:\n\n' + linea(v1, hoy) }
      : { asunto: 'Recordatorio: ' + v1.titulo, cuerpo: 'Se cargó un recordatorio:\n\n' + linea(v1, hoy) });
  } else if (nuevas.length > 1) {
    mails.push({ asunto: nuevas.length + ' cosas nuevas: ' + nuevas.map(function (v) { return v.titulo; }).join('; '),
                 cuerpo: 'Se cargaron:\n\n' + nuevas.map(function (v) { return linea(v, hoy); }).join('\n\n') });
  }
  nuevas.forEach(function (v) { est.visto[v.clave] = true; });

  pend.forEach(function (v) {
    if (v.fecha && v.fecha < hoy && !est.vencida[v.clave] && !nuevas.some(function (n) { return n.clave === v.clave; })) {
      mails.push(v.tipo === 'visita'
        ? { asunto: 'No se marcó: ' + v.nombre + ' tenía que venir a pagar el ' + v.dia,
            cuerpo: '¿Vino? Si pagó, poné Pagó en Estado; si no, No vino.\n\n' + linea(v, hoy) }
        : { asunto: 'Pasó la fecha: ' + v.titulo,
            cuerpo: 'Si ya está, poné Hecho en Estado; si no corre más, Cancelado.\n\n' + linea(v, hoy) });
      est.vencida[v.clave] = true;
    }
  });

  if (pend.length && ahora.getHours() >= HORA_RESUMEN && est.resumen !== fechaClave(hoy)) {
    var dias = function (v) { return v.fecha ? Math.round((v.fecha - hoy) / 86400000) : null; };
    var titulos = function (l) { return l.map(function (v) { return v.titulo; }).join('; '); };
    var deHoy = pend.filter(function (v) { return dias(v) === 0; });
    var deManana = pend.filter(function (v) { return dias(v) === 1; });
    var asunto = deHoy.length ? 'HOY: ' + titulos(deHoy)
               : deManana.length ? 'Mañana: ' + titulos(deManana)
               : 'Pendientes (' + pend.length + '): ' + titulos(pend);
    mails.push({ asunto: asunto, cuerpo: 'Lo que está pendiente:\n\n' +
      pend.map(function (v) { return linea(v, hoy); }).join('\n\n') +
      '\n\nCuando algo se resuelve, cambiá el Estado en su pestaña (Pagó / Hecho / No vino / Cancelado).' });
    est.resumen = fechaClave(hoy);
  }

  // Lo que ya no está pendiente se olvida: si vuelve a cargarse, avisa de nuevo.
  var vivas = {};
  pend.forEach(function (v) { vivas[v.clave] = true; });
  Object.keys(est.visto).forEach(function (k) { if (!vivas[k]) delete est.visto[k]; });
  Object.keys(est.vencida).forEach(function (k) { if (!vivas[k]) delete est.vencida[k]; });
  return { mails: mails, estado: est };
}
