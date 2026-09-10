// Arma local/preview.html: el Index.html real con un google.script.run falso que
// pide el PIN igual que en producción. Sirve para mirarla sin desplegar.
const fs = require('fs'), path = require('path');
const { cargar } = require('./cargar.js');

const PIN = fs.readFileSync(path.join(__dirname, 'pin.txt'), 'utf8').trim();
const G = cargar();

// En producción los datos NO se incrustan en el HTML: viajan por google.script.run.
// Acá hay que simularlos dentro de un <script>, así que se escapan igual que lo
// haría el servidor. Sin esto, un nombre con "</script>" rompe el propio stub y la
// prueba pasaría por la razón equivocada.
const comoJs = (v) => G.paraIncrustarEnScript(v);
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
const estado = G.construirEstado(fixture, new Date(2026, 8, 9, 15, 30));

function armar(estadoUsado, salida) {
  let html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Index.html'), 'utf8');
  // doGet sirve la página sin datos: los manda después, ya validado el PIN.
  html = html.replace('<?!= datosIniciales ?>', 'null');

  const stub = `<script>
window.google = { script: { run: {
  _ok: null, _err: null,
  withSuccessHandler(f) { this._ok = f; return this; },
  withFailureHandler(f) { this._err = f; return this; },
  obtenerEstado(pin) {
    const ok = this._ok, err = this._err;
    setTimeout(() => {
      if (String(pin || '') !== ${comoJs(PIN)}) err(new Error('PIN incorrecto.'));
      else ok(${comoJs(estadoUsado)});
    }, 250);
  }
} } };
<\/script>
`;
  // Con función de reemplazo, NO con string: los montos traen "$" y un "$'" haría
  // que replace lo interprete como patrón y pegue medio archivo donde no va.
  fs.writeFileSync(path.join(__dirname, salida), html.replace('<script>', () => stub + '<script>'));
}

armar(estado, 'preview.html');
console.log('preview.html listo — PIN ' + PIN);
module.exports = { armar, PIN };
