// Corre la lógica de Codigo.gs contra el fixture real y verifica que los
// números coincidan con el Panel. Falla ruidosamente si algo no cuadra.
const fs = require('fs'), path = require('path');
const { cargar } = require('./cargar.js');

const G = cargar();
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
// "Hoy" es el día en que se bajaron los datos, no una fecha fija: con una fecha
// vieja, un taller de la semana pasada figura como si todavía no hubiera pasado.
const hoy = fixture.generadoEn ? new Date(fixture.generadoEn) : new Date(2026, 8, 9);
const estado = G.construirEstado(fixture, hoy);

fs.writeFileSync(path.join(__dirname, 'estado.json'), JSON.stringify(estado, null, 1));

const pl = G.plata;
console.log('\n=== EDICIONES ===');
estado.ediciones.forEach(e => {
  const marca = e.personas.length === e.anotados ? 'ok  ' : 'MAL ';
  console.log(
    marca,
    (e.abierta ? '[ABIERTA] ' : '[cerrada] ') + e.edicion.padEnd(50),
    `panel ${String(e.anotados).padStart(2)}/${String(e.cupo).padEnd(2)}`,
    `| filas ${String(e.personas.length).padStart(2)}`,
    `| ${pl(e.recaudado).padStart(10)}`,
    e.saldo ? `| falta ${pl(e.saldo)}` : ''
  );
});

console.log('\n=== RESUMEN ===');
console.log(estado.resumen);

console.log('\n=== TIKZET ===');
console.log(`${estado.tikzet.entradas} entradas · ${pl(estado.tikzet.recaudado)} · ${estado.tikzet.sinMonto} sin monto`);

// Solo el tipo de cada alerta, nunca el texto: el texto trae nombres y montos de
// personas reales, y esta salida termina en la pantalla y en los registros.
console.log('\n=== ALERTAS (' + estado.alertas.length + ') ===');
const porTipo = {};
estado.alertas.forEach(a => { const k = a.nivel + ' · ' + a.tipo; porTipo[k] = (porTipo[k] || 0) + 1; });
Object.entries(porTipo).forEach(([k, n]) => console.log(` [${k}] × ${n}`));

// --- verificación dura ---
// La referencia es el propio Panel: sus números los calcula Google Sheets con
// sus fórmulas, sin pasar por este código. Antes se comparaba contra tres cifras
// anotadas a mano el 9/9, que se volvían falsas en cuanto se anotaba alguien más
// — y con la suite en rojo, desplegar.sh no deja subir nada.
const filasPanel = fixture.panelValores.slice(1).filter(r => String(r[1] || '').trim());
let fallas = 0;
filasPanel.forEach(r => {
  const nombre = String(r[1]).trim();
  const e = estado.ediciones.find(x => x.edicion === nombre);
  if (!e) { console.log(`\nFALLA: la app no muestra "${nombre}", que está en el Panel`); fallas++; return; }
  const anotados = Number(r[3]), cupo = Number(r[2]);
  if (e.anotados !== anotados || e.cupo !== cupo || e.personas.length !== anotados) {
    console.log(`\nFALLA: ${nombre} -> app ${e.anotados}/${e.cupo} con ${e.personas.length} personas; el Panel dice ${anotados}/${cupo}`);
    fallas++;
  }
});
if (estado.ediciones.length !== filasPanel.length) {
  console.log(`\nFALLA: el Panel tiene ${filasPanel.length} ediciones y la app muestra ${estado.ediciones.length}`);
  fallas++;
}
if (filasPanel.length === 0) { console.log('\nFALLA: el fixture no tiene ediciones en el Panel'); fallas++; }
const cuando = fixture.generadoEn ? fixture.generadoEn.slice(0, 10) : 'sin fecha';
console.log('\n' + (fallas === 0
  ? `VERIFICADO: las ${filasPanel.length} ediciones coinciden con el Panel (anotados, cupo y personas), datos del ${cuando}.`
  : `REVISAR: ${fallas} diferencia(s) contra el Panel (datos del ${cuando}).`));
process.exitCode = fallas ? 1 : 0;
