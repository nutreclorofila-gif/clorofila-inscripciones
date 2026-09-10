// Los nombres salen de un formulario de Tally PÚBLICO: cualquiera escribe lo que
// quiera ahí. Esto arma una preview envenenada para comprobar que nada se ejecuta.
const fs = require('fs'), path = require('path');
const { cargar } = require('./cargar.js');
const { armar } = require('./generar-preview.js');
const G = cargar();

const VENENOS = [
  '<img src=x onerror="window.__xss=(window.__xss||0)+1">',
  '</script><script>window.__xss=(window.__xss||0)+1;</script>',
  '"><svg onload="window.__xss=(window.__xss||0)+1">'
];

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
const hoja = fixture.hojas['Inscriptos Octubre 2026'];
VENENOS.forEach(v => {
  const f = new Array(11).fill('');
  f[0] = v; f[1] = 'x@x.com'; f[3] = 'Curso de cocina'; f[4] = 'Tarde';
  f[5] = v; f[6] = v; f[7] = '12200'; f[10] = 'Curso de cocina — Octubre 2026';
  hoja.push(f);
});

armar(G.construirEstado(fixture, new Date(2026, 8, 9)), 'preview-xss.html');

// Regresión: si alguien vuelve a incrustar los datos en el HTML, tienen que ir escapados.
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');
const inyecta = /t\.datosIniciales\s*=\s*'null'/.test(src);
const escapa = /paraIncrustarEnScript/.test(src) && /replace\(\/<\/g, *'\\\\u003c'\)/.test(src);

console.log('preview-xss.html generada con ' + VENENOS.length + ' cargas.');
console.log(inyecta
  ? '  ok    la página se sirve sin datos: no hay nada que inyectar en el HTML'
  : '  aviso los datos van incrustados en el HTML');
if (!inyecta && !escapa) { console.error('  FALLA: se incrustan datos sin escapar "<"'); process.exit(1); }
