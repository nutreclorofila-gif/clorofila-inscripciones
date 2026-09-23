// Arma local/preview.html: el Index.html real con un servidor falso que pide el
// PIN igual que en producción. Sirve para mirarla sin desplegar.
const fs = require('fs'), path = require('path');
const { cargar } = require('./cargar.js');

const PIN = fs.readFileSync(path.join(__dirname, 'pin.txt'), 'utf8').trim();
const G = cargar();

/**
 * Serializa un valor para meterlo dentro de un <script>.
 *
 * Los nombres los escribe cualquiera en el formulario público de Tally, así que
 * son texto hostil. JSON.stringify solo NO alcanza: no escapa "</script>", y un
 * nombre como `</script><script>...` cierra el bloque y ejecuta lo que quiera.
 * Escapando "<" eso se vuelve imposible. U+2028 y U+2029 van también porque son
 * saltos de línea válidos en JavaScript y rompen el literal.
 *
 * Vivía en el servidor, cuando la app se servía desde Apps Script. Hoy solo la
 * necesita esta vista previa, que es la única que mete datos en un <script>.
 */
function paraIncrustarEnScript(valor) {
  return JSON.stringify(valor)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const comoJs = paraIncrustarEnScript;
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
const hoy = fixture.generadoEn ? new Date(fixture.generadoEn) : new Date(2026, 8, 9, 15, 30);
// Recortado igual que en doGet: la vista previa tiene que ver lo mismo que el
// teléfono, no el estado entero que solo existe dentro del servidor.
const estado = G.paraElTelefono(G.construirEstado(fixture, hoy));

function armar(estadoUsado, salida) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Index.html'), 'utf8');

  // Mismo camino que en el celular: la página pide por fetch con el PIN y el
  // servidor contesta { ok, estado } o { ok:false, error }.
  const stub = `<script>
var URL_API = 'https://servidor.falso/exec';
window.fetch = function (url) {
  var pin = decodeURIComponent((String(url).match(/[?&]pin=([^&]*)/) || [])[1] || '');
  var resp = pin === ${comoJs(PIN)}
    ? { ok: true, estado: ${comoJs(estadoUsado)} }
    : { ok: false, error: 'PIN incorrecto.' };
  return new Promise(function (listo) {
    setTimeout(function () {
      listo({ ok: true, status: 200, json: function () { return Promise.resolve(resp); } });
    }, 250);
  });
};
<\/script>
`;
  // Con función de reemplazo, NO con string: los montos traen "$" y un "$'" haría
  // que replace lo interprete como patrón y pegue medio archivo donde no va.
  fs.writeFileSync(path.join(__dirname, salida), html.replace('<script>', () => stub + '<script>'));
}

armar(estado, 'preview.html');
// El PIN no se imprime: queda solo en local/pin.txt.
console.log('preview.html listo — entra con el PIN de local/pin.txt');
module.exports = { armar, paraIncrustarEnScript };
