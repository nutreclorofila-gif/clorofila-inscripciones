// Cruza los datos reales de la planilla contra TODO lo que se publica: los
// archivos del repo (que es público) y la página que sirve GitHub Pages.
//
// Existe porque pasó: el 11/9/2026 entraron al repo, como "ejemplos" del
// buscador, dos celulares y un nombre completo de clientas reales, y quedaron
// publicados en la página. Ninguna prueba lo vio.
//
// No imprime ningún dato: solo archivo, línea y de qué tipo es lo que coincide.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const base = path.join(__dirname, '..');
const rutaFixture = path.join(__dirname, 'fixture.json');

if (!fs.existsSync(rutaFixture)) {
  console.log('FALLA: falta local/fixture.json (no está en git a propósito). Bajalo con: node local/bajar-fixture.js');
  process.exit(1);
}
const fixture = JSON.parse(fs.readFileSync(rutaFixture, 'utf8'));

// Lo que identifica a una persona: nombre completo, mail y celular (los últimos
// 8 dígitos, que es lo que queda igual escrito con 0, con +598 o con espacios).
const nombres = new Set(), mails = new Set(), celulares = new Set();
const tablas = [...Object.values(fixture.hojas || {}), ...Object.values(fixture.extras || {})];
for (const t of tablas) {
  for (const fila of t) {
    for (const celda of fila) {
      const c = String(celda || '').trim();
      (c.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).forEach(m => mails.add(m.toLowerCase()));
      const d = c.replace(/\D/g, '');
      if (/^(598)?0?9\d{7}$/.test(d)) celulares.add(d.slice(-8));
    }
    const n = String(fila[0] || '').trim();
    const palabras = n.split(/\s+/);
    if (palabras.length >= 2 && palabras.length <= 4 && n.length <= 40 && palabras.every(p => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.-]{2,}$/.test(p))) {
      nombres.add(n.toLowerCase());
    }
  }
}
if (!nombres.size || !celulares.size) {
  console.log('FALLA: el fixture no trae nombres o celulares; el cruce no probaría nada');
  process.exit(1);
}

const hallados = [];
function revisar(donde, texto) {
  texto.split('\n').forEach((linea, i) => {
    const bajo = linea.toLowerCase();
    const digitos = linea.replace(/\D/g, '');
    const tipos = [];
    for (const n of nombres) if (bajo.includes(n)) { tipos.push('nombre completo'); break; }
    for (const m of mails) if (bajo.includes(m)) { tipos.push('mail'); break; }
    for (const c of celulares) if (digitos.includes(c)) { tipos.push('celular'); break; }
    if (tipos.length) hallados.push(donde + ':' + (i + 1) + '  ' + tipos.join(' + '));
  });
}

const archivos = execFileSync('git', ['ls-files'], { cwd: base }).toString().trim().split('\n')
  .filter(a => a && !/package-lock\.json$/.test(a));
archivos.forEach(a => revisar(a, fs.readFileSync(path.join(base, a), 'utf8')));

// La página publicada, tal como está en la rama gh-pages (si la rama está bajada).
try {
  revisar('gh-pages:index.html', execFileSync('git', ['show', 'origin/gh-pages:index.html'], { cwd: base, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
} catch (e) {
  console.log('  (no está bajada la rama gh-pages: se revisa solo el repo)');
}

console.log('  cruzados ' + archivos.length + ' archivos contra ' + nombres.size + ' nombres, ' +
  mails.size + ' mails y ' + celulares.size + ' celulares reales');
if (hallados.length) {
  console.log('\nFALLA: datos de personas reales en lo que se publica:');
  hallados.forEach(h => console.log('  ' + h));
  console.log('\nReemplazalos por inventados. Nunca copiar un dato de la planilla a un comentario o a una prueba.');
  process.exit(1);
}
console.log('\nNINGÚN DATO REAL en lo que se publica');
