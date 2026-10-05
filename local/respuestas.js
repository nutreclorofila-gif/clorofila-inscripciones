// Lo que Leo contestó desde la app a los recordatorios, para las sesiones de
// Claude. Uso:  node /Users/leonardolemes/Proyectos/clorofila-inscripciones/local/respuestas.js
//
// Las respuestas no están en la planilla (la app solo la lee): están guardadas
// en el servidor y se ven con el PIN, que se toma de local/pin.txt y no se
// muestra nunca. Después de hacer lo que dice cada respuesta, la sesión pone en
// la pestaña «Recordatorios», en esa fila: Estado = Hecho y, en Detalle,
// «Leo respondió (fecha): … — Hecho: …». Con eso la respuesta se borra sola.
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..');
const pin = fs.readFileSync(path.join(__dirname, 'pin.txt'), 'utf8').trim();
const url = (fs.readFileSync(path.join(base, 'web', 'index.html'), 'utf8').match(/var URL_API = "([^"]+)"/) || [])[1];
if (!url) { console.error('No encontré la dirección del servidor en web/index.html.'); process.exit(1); }

fetch(url + '?formato=json&pin=' + encodeURIComponent(pin), { redirect: 'follow' })
  .then(r => r.json())
  .then(d => {
    if (!d.ok) { console.error('El servidor dijo: ' + d.error); process.exit(1); }
    const lista = (d.estado.alertas || []).filter(a => a.tipo === 'recordatorio_respondido');
    if (!lista.length) { console.log('Leo no tiene respuestas sin hacer.'); return; }
    console.log(lista.length + (lista.length === 1 ? ' respuesta' : ' respuestas') + ' de Leo para hacer:\n');
    lista.forEach(a => {
      console.log('- Fila ' + a.fila + ' de «Recordatorios»: ' + a.texto);
      console.log('  Leo respondió: ' + a.respuesta);
      console.log('  ' + a.detalle.replace(/^Respondiste/, 'Fecha').split(': «')[0]);
      if (a.quien) console.log('  Lo cargó: ' + a.quien);
      console.log('');
    });
  })
  .catch(e => { console.error('No pude hablar con el servidor: ' + e.message); process.exit(1); });
