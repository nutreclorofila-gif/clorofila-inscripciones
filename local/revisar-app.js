// Revisa lo que la app le muestra HOY a Leo, con los datos reales, y lista lo
// que se ve raro: textos que no corresponden donde aparecen. Para cada cosa dice
// en qué fila de la Master está y qué hay que cambiar.
//
// Leo, 19/10/2026: «¿por qué no queda bien automatizado todo?» / «encontrá una
// solución». La app lee la planilla sola, pero la planilla la escriben a mano
// varios chats, y cada forma nueva de escribir algo salía rara en el celular
// hasta que Leo la veía. Esto lo corre la rutina «Check inscripciones» (10 y 18 h),
// que arregla la planilla antes de que Leo lo vea.
//
//   node local/revisar-app.js          → lista (sale con 1 si encontró algo)
//   node local/revisar-app.js --json   → lo mismo en JSON
//
// No imprime el PIN, ni mails, ni celulares.
const fs = require('fs'), path = require('path');

const PIN = fs.readFileSync(path.join(__dirname, 'pin.txt'), 'utf8').trim();
const WEB = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
const URL_API = (WEB.match(/URL_API = "([^"]+)"/) || [])[1];

// Lo que delata que un texto no es una restricción sino una nota de trámite.
const TRAMITE = /tally|pag[oóa]|comprobante|inscrip|transfer|\$|mercado ?pago|whatsapp|mail|cuota|se le (?:dijo|escribi)|leo \d|\d{1,2}\/\d{1,2}/i;
// Un recordatorio Pendiente que es seguimiento de una conversación (va Delegado).
const SEGUIMIENTO = /¿\s*(?:eligi|contest|respond|se hace|le lleg|confirm[oó]|vuelve|vino)|sin respuesta|no contest|no respondi/i;

const tapar = (t) => String(t || '')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<mail>')
  .replace(/\d(?:[\d .-]*\d){7,}/g, '<número>');

function revisar(est) {
  const hallazgos = [];
  const add = (que, donde, arreglo) => hallazgos.push({ que: tapar(que), donde, arreglo });

  // 1) Restricciones: tienen que ser cortas y hablar de comida.
  (est.ediciones || []).filter((e) => e.vigente).forEach((e) => {
    (e.restricciones || []).forEach((r) => {
      const p = (e.personas || []).find((x) => x.nombre === r.nombre) || {};
      const donde = p.hoja ? `«${p.hoja}» fila ${p.fila} (${r.nombre})` : `${e.edicion} (${r.nombre})`;
      if (r.texto.length > 90 || TRAMITE.test(r.texto)) {
        add(`Restricción con texto de trámite en «${e.subtitulo || e.edicion}»: «${r.texto.slice(0, 120)}»`, donde,
          'Si la persona no tiene restricción, en la columna Alergias poné «No». Si la nota de la L no es una restricción, ' +
          'que no diga «alergia/restricción/intolerancia/celíaca» al principio ni lleve «Restricción:».');
      }
    });
  });

  // 2) Recordatorios Pendiente que son seguimiento de un chat (Leo, 15/10: van Delegado).
  (est.alertas || []).filter((a) => a.tipo === 'recordatorio').forEach((a) => {
    if (SEGUIMIENTO.test(a.texto) && !/cuota|debe|pag|cobr/i.test(a.texto)) {
      add(`Recordatorio Pendiente que es seguimiento de un chat: «${a.texto.slice(0, 120)}»`,
        'pestaña «Recordatorios» (buscar por el Qué)',
        'Estado «Delegado» y «Lo hace: Seguimiento» al principio del Detalle. En la app quedan solo visitas, deudas y decisiones de Leo.');
    }
  });

  // 3) Avisos que todavía hablan de Tally (Leo, 18/10: ya no se usa).
  (est.alertas || []).forEach((a) => {
    if (/tally/i.test(a.texto)) add(`Aviso que nombra Tally: «${a.texto.slice(0, 120)}»`, 'texto que arma la app o la planilla',
      'Si sale de un recordatorio, reescribirlo sin Tally; si lo arma la app, avisar a la sesión de la app.');
  });

  // 4) Lo que se ve debajo de cada persona: horario, medio de pago, monto. Cortos.
  (est.ediciones || []).filter((e) => e.vigente).forEach((e) => {
    (e.personas || []).forEach((p) => {
      ['horario', 'medioPago'].forEach((k) => {
        if (String(p[k] || '').length > 45) {
          add(`Texto largo en «${k === 'medioPago' ? 'Medio de pago' : 'Horario'}» de ${p.nombre}: «${String(p[k]).slice(0, 80)}»`,
            `«${p.hoja}» fila ${p.fila}`, 'Dejar solo el dato (ej.: «Transferencia», «Mañana»); el resto va en la nota de la L.');
        }
      });
      if (/\d{6,}|@/.test(p.nombre || '')) {
        add(`Nombre con números o mail: «${p.nombre}»`, `«${p.hoja}» fila ${p.fila}`, 'Dejar solo el nombre y apellido.');
      }
    });
  });

  // 5) Grupos con un Estado que la app no entiende (cae en «propuesta o consulta»).
  (est.eventos || []).filter((g) => g.estado === 'otro').forEach((g) => {
    add(`Grupo con Estado que no se entiende: «${g.estadoTexto}» (${g.grupo})`, `«Eventos y empresas» fila ${g.fila}`,
      'Usar uno de: Consulta, Propuesta enviada, Confirmado con seña, Realizado, Cobrado, Cancelado, Descartado.');
  });

  // 6) Una actividad que viene, sin fecha legible en el nombre: no se puede ordenar.
  (est.ediciones || []).filter((e) => e.vigente && !e.fecha).forEach((e) => {
    add(`Actividad sin fecha legible: «${e.edicion}»`, 'Panel, columna B',
      'El nombre tiene que terminar en la fecha (dd/mm/aaaa) o en el mes («Octubre 2026»).');
  });

  return hallazgos;
}

if (require.main === module) (async () => {
  const r = await fetch(URL_API + '?formato=json&pin=' + encodeURIComponent(PIN));
  const d = JSON.parse(await r.text());
  if (!d.ok) { console.log('La app respondió con error: ' + d.error); process.exit(2); }
  const h = revisar(d.estado);
  if (process.argv.includes('--json')) console.log(JSON.stringify(h, null, 1));
  else if (!h.length) console.log('La app se ve bien: nada raro en lo que le muestra a Leo.');
  else {
    console.log(h.length + (h.length === 1 ? ' cosa rara' : ' cosas raras') + ' en lo que la app le muestra a Leo:\n');
    h.forEach((x, i) => console.log(`${i + 1}. ${x.que}\n   Dónde: ${x.donde}\n   Arreglo: ${x.arreglo}\n`));
  }
  process.exit(h.length ? 1 : 0);
})().catch((e) => { console.log('No pude revisar la app: ' + e.name); process.exit(2); });

module.exports = { revisar };
