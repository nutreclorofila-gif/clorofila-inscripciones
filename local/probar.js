// Corre la lógica de Codigo.gs contra el fixture real y verifica que los
// números coincidan con el Panel. Falla ruidosamente si algo no cuadra.
const fs = require('fs'), path = require('path');
const { cargar } = require('./cargar.js');

const G = cargar();
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
const estado = G.construirEstado(fixture, new Date(2026, 8, 9));

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

console.log('\n=== ALERTAS (' + estado.alertas.length + ') ===');
estado.alertas.forEach(a => console.log(` [${a.nivel}] ${a.texto}`));

// --- verificación dura ---
const descuadres = estado.ediciones.filter(e => e.personas.length !== e.anotados);
const esperado = {
  'Taller de tapeo — 18/09/2026': [12, 12],
  'Curso de cocina — Octubre 2026 (Miércoles 19-21h)': [4, 15],
  'Curso de cocina — Octubre 2026 (Jueves 10-12h)': [1, 15]
};
let fallas = 0;
Object.entries(esperado).forEach(([nombre, [anotados, cupo]]) => {
  const e = estado.ediciones.find(x => x.edicion === nombre);
  if (!e) { console.log(`\nFALLA: no se encontró "${nombre}"`); fallas++; return; }
  if (e.anotados !== anotados || e.cupo !== cupo || e.personas.length !== anotados) {
    console.log(`\nFALLA: ${nombre} -> panel ${e.anotados}/${e.cupo}, filas ${e.personas.length} (esperado ${anotados}/${cupo})`);
    fallas++;
  }
});
console.log('\n' + (fallas === 0 && descuadres.length === 0
  ? 'VERIFICADO: los conteos de la app coinciden con el Panel y con el estado esperado al 9/9/2026.'
  : `REVISAR: ${fallas} falla(s) contra el estado esperado, ${descuadres.length} descuadre(s) panel-vs-filas.`));
