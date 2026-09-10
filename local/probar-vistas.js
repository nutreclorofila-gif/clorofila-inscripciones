// Pasa un estado por las cuatro solapas y comprueba que ninguna explota.
// Importa porque la página publicada y el Apps Script se despliegan por separado:
// la página tiene que aguantar un backend más viejo, o Leo abre la app y ve una
// pantalla en blanco sin saber por qué.
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..');

function cargarUI(datos) {
  const html = fs.readFileSync(path.join(base, 'apps-script', 'Index.html'), 'utf8');
  const js = html.split('<script>')[1].split('</script>')[0].replace('<?!= datosIniciales ?>', 'null');

  const nodo = () => ({
    innerHTML: '', textContent: '', value: '', disabled: false, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, appendChild() {}, removeChild() {}, focus() {}, querySelector: () => null,
    querySelectorAll: () => []
  });
  const escrito = {};
  const document = {
    getElementById: (id) => {
      const n = nodo();
      Object.defineProperty(n, 'innerHTML', {
        get: () => escrito[id] || '', set: (v) => { escrito[id] = v; }
      });
      return n;
    },
    querySelector: () => nodo(), querySelectorAll: () => [],
    createElement: nodo, body: nodo(), addEventListener() {}
  };
  const verEscrito = (id) => escrito[id] || '';
  const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const window = { google: null, addEventListener() {}, confirm: () => false, location: { href: '' } };

  const api = new Function('document', 'localStorage', 'window', 'navigator', 'setTimeout', 'fetch',
    js + '\nDATOS = arguments[6];' +
    '\nreturn {vistaCupos,vistaPlata,vistaGente,vistaAlertas,pintarTotales,plata,esc};')
    (document, localStorage, window, { clipboard: null }, () => {}, () => Promise.reject(new Error('sin red')), datos);
  api.verEscrito = verEscrito;
  return api;
}

let fallas = 0, corridos = 0;
function correr(nombre, fn) {
  corridos++;
  try {
    const html = fn();
    if (typeof html !== 'string') throw new Error('no devolvió HTML sino ' + typeof html);
    if (/undefined|NaN|\[object Object\]/.test(html)) {
      throw new Error('quedó un "' + html.match(/undefined|NaN|\[object Object\]/)[0] + '" a la vista');
    }
    console.log('  ok    ' + nombre + '  (' + html.length + ' caracteres)');
  } catch (e) {
    fallas++;
    console.log('  FALLA ' + nombre + '\n        ' + e.message);
  }
}

function probarEstado(titulo, estado) {
  console.log('\n--- ' + titulo + ' ---');
  const ui = cargarUI(estado);
  correr('solapa Cupos',   () => ui.vistaCupos());
  correr('solapa Plata',   () => ui.vistaPlata());
  correr('solapa Gente',   () => ui.vistaGente(''));
  correr('solapa Alertas', () => ui.vistaAlertas());

  // El buscador tiene que filtrar de verdad: si devuelve lo mismo con cualquier
  // texto, Leo escribe un nombre, ve la lista entera y cree que la app no anda.
  corridos++;
  const todos = ui.vistaGente('');
  const nada = ui.vistaGente('zqxjkbwv');
  const cuantos = (h) => (h.match(/class="persona"/g) || []).length;
  if (cuantos(nada) === 0 && (cuantos(todos) > 0 || titulo.indexOf('vacía') !== -1)) {
    console.log('  ok    el buscador filtra  (' + cuantos(todos) + ' -> 0)');
  } else {
    fallas++;
    console.log('  FALLA el buscador no filtra: ' + cuantos(todos) + ' personas con texto vacío, ' +
                cuantos(nada) + ' buscando algo que no existe');
  }

  // La plata no puede aparecer en lo primero que se ve. La app se abre en el
  // local y en la calle, con gente al lado.
  corridos++;
  ui.pintarTotales();
  const barra = ui.verEscrito('totales');
  const cupos = ui.vistaCupos();
  const montos = (h) => (h.match(/\$\s?[\d.]+/g) || []);
  if (montos(barra).length === 0 && montos(cupos).length === 0) {
    console.log('  ok    no hay ningún monto en la portada');
  } else {
    fallas++;
    console.log('  FALLA se ve plata en la portada: barra ' + JSON.stringify(montos(barra)) +
                ', solapa Cupos ' + JSON.stringify(montos(cupos)));
  }

  // Pero tiene que seguir estando a un toque.
  corridos++;
  const conPlata = montos(ui.vistaPlata()).length;
  const hayPlata = (estado.ediciones || []).some(e => e.recaudado > 0);
  if (!hayPlata || conPlata > 0) {
    console.log('  ok    la solapa Plata sigue mostrando los montos (' + conPlata + ')');
  } else {
    fallas++;
    console.log('  FALLA se escondió la plata también en la solapa Plata');
  }

  // Y tiene que encontrar a alguien concreto.
  const alguien = (estado.ediciones || []).flatMap(e => e.personas || [])[0];
  if (alguien && alguien.nombre) {
    corridos++;
    const buscado = ui.vistaGente(alguien.nombre.split(' ')[0]);
    if (cuantos(buscado) >= 1 && cuantos(buscado) < cuantos(todos)) {
      console.log('  ok    buscar un nombre lo encuentra  (' + cuantos(buscado) + ' de ' + cuantos(todos) + ')');
    } else {
      fallas++;
      console.log('  FALLA buscar un nombre dio ' + cuantos(buscado) + ' de ' + cuantos(todos));
    }
  }
}

const archivo = process.argv[2];
if (archivo) {
  const d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  probarEstado('Datos vivos del backend que está desplegado', d.estado || d);
} else {
  const { cargar } = require('./cargar.js');
  const G = cargar();
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
  probarEstado('Backend nuevo (el de este repo)', G.construirEstado(fixture, new Date(2026, 8, 9, 15, 30)));

  // Backend viejo: sin los campos que se agregaron después.
  const viejo = G.construirEstado(fixture, new Date(2026, 8, 9, 15, 30));
  delete viejo.espera; delete viejo.giftCards;
  (viejo.ediciones || []).forEach(e => (e.personas || []).forEach(p => { delete p.veces; delete p.whatsapp; }));
  probarEstado('Backend viejo: sin espera, sin gift cards, sin repetidores', viejo);

  // Planilla recién estrenada: todo vacío.
  probarEstado('Planilla vacía', G.construirEstado({ panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado']], panelFormulas: [['','','','','','']], hojas: {}, extras: {} }, new Date()));
}

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
