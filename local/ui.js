// Carga el JavaScript de la página real en Node, con un DOM de mentira.
// Lo usan las pruebas de vistas y la de datos hostiles: las dos necesitan
// pintar la interfaz de verdad, no una imitación.
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..');

function cargarUI(datos, novedades) {
  const html = fs.readFileSync(path.join(base, 'apps-script', 'Index.html'), 'utf8');
  const js = html.split('<script>')[1].split('</script>')[0].replace('<?!= datosIniciales ?>', 'null');

  const nodo = () => ({
    textContent: '', value: '', disabled: false, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, appendChild() {}, removeChild() {}, focus() {},
    querySelector: () => null, querySelectorAll: () => []
  });
  const escrito = {};
  const document = {
    getElementById: (id) => {
      const n = nodo();
      Object.defineProperty(n, 'innerHTML', { get: () => escrito[id] || '', set: (v) => { escrito[id] = v; } });
      return n;
    },
    querySelector: () => nodo(), querySelectorAll: () => [],
    createElement: nodo, body: nodo(), addEventListener() {}
  };
  const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const window = { google: null, addEventListener() {}, confirm: () => false, location: { href: '' } };

  // Portapapeles de mentira, para poder ver qué se copia.
  const copiado = { texto: null };
  const navigator = { clipboard: { writeText: (t) => { copiado.texto = t; return Promise.resolve(); } } };

  const api = new Function('document', 'localStorage', 'window', 'navigator', 'setTimeout', 'fetch',
    js + '\nDATOS = arguments[6]; NOVEDADES = arguments[7] || null;' +
    '\nreturn {vistaCupos,vistaPlata,vistaGente,vistaAlertas,pintarTotales,avisoDeNovedades,contacto,persona,enEspera,coincideBusqueda,sinAcentos,copiarLista,plata,esc};')
    (document, localStorage, window, navigator, () => {},
     () => Promise.reject(new Error('sin red')), datos, novedades);
  api.verEscrito = (id) => escrito[id] || '';
  api.verCopiado = () => copiado.texto;
  return api;
}

module.exports = { cargarUI };
