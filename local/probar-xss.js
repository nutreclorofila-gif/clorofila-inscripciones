// Los nombres, los mails y los comprobantes salen de un formulario de Tally
// PÚBLICO: cualquiera escribe lo que quiera ahí. Esto mete cargas explosivas en
// la planilla y comprueba que al pintarlas no pase nada.
const fs = require('fs'), path = require('path');
const { cargar } = require('./cargar.js');
const { cargarUI } = require('./ui.js');
const { armar } = require('./generar-preview.js');
const { expresion } = require('./inyeccion.js');
const G = cargar();

let fallas = 0, corridos = 0;
function caso(nombre, porque, fn) {
  corridos++;
  try {
    const r = fn();
    if (r === true) { console.log('  ok    ' + nombre); return; }
    fallas++;
    console.log('  FALLA ' + nombre + '\n        ' + r + '\n        importa porque: ' + porque);
  } catch (e) {
    fallas++;
    console.log('  ERROR ' + nombre + '\n        ' + e.message + '\n        importa porque: ' + porque);
  }
}

/**
 * Nombres de atributo de cada etiqueta abierta. Hace falta mirar los NOMBRES y
 * no el texto: un dato escapado puede contener "onerror=" adentro de un valor
 * y ahí no hace nada. Los valores no pueden traer comillas (se escapan a
 * &quot;), así que "[^"]*" delimita bien.
 */
function atributosPeligrosos(html) {
  var malas = [];
  (html.match(/<[a-zA-Z][^>]*>/g) || []).forEach(function (tag) {
    var cuerpo = tag.slice(1, -1).replace(/^[a-zA-Z0-9-]+/, '');
    var re = /([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*"[^"]*"|([a-zA-Z][a-zA-Z0-9:-]*)(?=\s|$)/g, m;
    while ((m = re.exec(cuerpo)) !== null) {
      var nombre = (m[1] || m[2] || '').toLowerCase();
      if (nombre.indexOf('on') === 0) malas.push(nombre + '  en  ' + tag.slice(0, 70));
    }
  });
  return malas;
}

const VENENOS = [
  '<img src=x onerror="window.__xss=(window.__xss||0)+1">',
  '</script><script>window.__xss=(window.__xss||0)+1;</script>',
  '"><svg onload="window.__xss=(window.__xss||0)+1">',
  "'><button onclick='window.__xss=1'>tocá</button>",
  'javascript:window.__xss=1'
];

console.log('\n--- Escapar al incrustar en un <script> ---');
// Importa porque: JSON.stringify NO escapa "</script>". Fue un XSS real y
// explotable en este mismo proyecto. Hoy la página se sirve vacía, pero la
// función tiene que seguir siendo correcta el día que se vuelva a usar.
caso('escapa el < para que no se pueda cerrar el <script>',
  'con "</script>" adentro de un nombre se cierra el bloque y se ejecuta código arbitrario',
  () => {
    const salida = G.paraIncrustarEnScript('</script><script>malo()</script>');
    if (salida.indexOf('<') !== -1) return 'quedó un "<" sin escapar: ' + salida;
    if (salida.indexOf('\\u003c') === -1) return 'no escapó a \\u003c: ' + salida;
    return true;
  }
);
caso('escapa los saltos de línea invisibles U+2028 y U+2029',
  'JavaScript los trata como fin de línea y parten el script al medio',
  () => {
    const salida = G.paraIncrustarEnScript('a b c');
    return (salida.indexOf(' ') === -1 && salida.indexOf(' ') === -1)
      || 'quedaron sin escapar: ' + JSON.stringify(salida);
  }
);
caso('y lo escapado sigue siendo el mismo texto',
  'de nada sirve escapar si al leerlo del otro lado el dato quedó cambiado',
  () => {
    const original = 'Fulana </script> "comillas"   & <b>';
    return eval('(' + G.paraIncrustarEnScript(original) + ')') === original
      || 'el texto no sobrevivió la ida y vuelta';
  }
);
caso('lo que doGet pone en la página pasa por ahí',
  'si mañana alguien vuelve a incrustar los datos, tiene que ser por el camino escapado',
  () => {
    const usaEscape = /paraIncrustarEnScript/.test(expresion);
    const sirveVacia = expresion.trim() === "'null'";
    if (!usaEscape && !sirveVacia) return 'doGet incrusta con: ' + expresion;
    return true;
  }
);

console.log('\n--- Pintar datos hostiles en la interfaz ---');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));
const hoja = fixture.hojas['Inscriptos Octubre 2026'];
VENENOS.forEach(v => {
  const f = new Array(11).fill('');
  f[0] = v; f[1] = v + '@x.com'; f[2] = v; f[3] = 'Curso de cocina'; f[4] = 'Tarde';
  f[5] = v; f[6] = v; f[7] = '12200'; f[8] = v; f[10] = 'Curso de cocina — Octubre 2026';
  hoja.push(f);
});
const envenenado = G.construirEstado(fixture, new Date(2026, 8, 9));
const ui = cargarUI(envenenado);
const pintado = ui.vistaCupos() + ui.vistaPlata() + ui.vistaGente('') + ui.vistaAlertas();

caso('las cargas llegan a la interfaz (si no, la prueba no prueba nada)',
  'una prueba que no enfrenta el veneno pasa por la razón equivocada',
  () => /&lt;img|&lt;svg|&lt;\/script/.test(pintado) || 'los datos hostiles no aparecieron en lo pintado'
);
caso('no queda ninguna etiqueta ejecutable',
  'un <script> o un <img> con onerror corre en el navegador de Leo, con sus datos a la vista',
  () => {
    const malas = pintado.match(/<\s*(script|img|svg|iframe|object|embed|link|style)\b/gi);
    return !malas || 'quedaron etiquetas vivas: ' + [...new Set(malas)].join(', ');
  }
);
caso('no queda ningún manejador de evento en línea',
  'onerror, onload y onclick ejecutan sin que haya que tocar nada',
  () => {
    // Solo adentro de etiquetas DE VERDAD: el veneno escapado sigue conteniendo
    // el texto "onerror=", pero ahí es texto y no hace nada. Lo que importa es
    // que no haya quedado como atributo de una etiqueta abierta.
    const malas = atributosPeligrosos(pintado);
    return !malas.length || 'quedaron manejadores: ' + malas.slice(0, 2).join(' | ');
  }
);
caso('el veneno queda como texto, no como marcado',
  'es la prueba de que se escapó y no de que se borró: borrarlo también escondería el nombre',
  () => {
    const escapados = (pintado.match(/&lt;(img|svg|\/script)/gi) || []).length;
    return escapados >= 3 || 'solo aparecieron ' + escapados + ' cargas escapadas';
  }
);
caso('ningún enlace termina apuntando a javascript:',
  'un mail o un celular hostil podrían convertir un enlace en código',
  () => {
    const malas = pintado.match(/(href|src)\s*=\s*"\s*javascript:/gi);
    return !malas || 'quedaron enlaces ejecutables: ' + malas.length;
  }
);
caso('los atributos no se pueden cortar con una comilla',
  'con " adentro de un dato se sale del atributo y se agrega otro',
  () => {
    const sospechosas = pintado.match(/data-quien="[^"]*"[^\s>]/g);
    return !sospechosas || 'un atributo quedó partido: ' + sospechosas[0];
  }
);

console.log('\n--- Los enlaces de contacto (donde el dato va DENTRO de un atributo) ---');
// Importa porque: acá el dato entra en href="...". Es el único lugar donde
// escapar las comillas cambia algo, y solo se pinta cuando se toca a la persona,
// así que no aparecía en ninguna otra prueba.
const hostil = {
  nombre: '"><svg onload="window.__xss=1">',
  email: 'x" onmouseover="window.__xss=1" data-x="',
  celular: '099" onfocus="window.__xss=1',
  whatsapp: '',
  estadoPago: 'completo', saldo: 0, veces: 1, hoja: 'X', fila: 2
};
const enlaces = ui.contacto(hostil) + ui.contacto({ ...hostil, whatsapp: '59899111222' }) +
                ui.enEspera({ nombre: hostil.nombre, quiere: hostil.email }, 'k1');

caso('el mail hostil no agrega atributos al enlace',
  'con una comilla sin escapar se sale del href y se cuelga un onmouseover',
  () => {
    const malas = atributosPeligrosos(enlaces);
    return !malas.length || 'quedó: ' + malas[0];
  }
);
caso('el celular hostil tampoco',
  'va a href="tel:..." tal como está escrito en la planilla',
  () => {
    const dentro = (enlaces.match(/href="tel:([^"]*)"/) || [])[1] || '';
    return dentro.indexOf('"') === -1 || 'quedó una comilla sin escapar en el tel:';
  }
);
caso('el enlace de WhatsApp solo lleva dígitos',
  'wa.me con basura abre un chat con un número equivocado, o algo peor',
  () => {
    const m = enlaces.match(/wa\.me\/([^"]*)"/);
    return (m && /^[0-9]+$/.test(m[1])) || 'quedó: ' + (m ? m[1] : 'sin enlace');
  }
);
caso('y los enlaces siguen sirviendo con datos normales',
  'de nada sirve que sea seguro si dejó de funcionar',
  () => {
    const bueno = ui.contacto({ nombre: 'Ana', email: 'ana@x.com', celular: '099111222', whatsapp: '59899111222' });
    return (/href="https:\/\/wa\.me\/59899111222"/.test(bueno) && /href="mailto:ana@x\.com"/.test(bueno))
      || 'los enlaces normales quedaron: ' + bueno;
  }
);

// La preview envenenada queda para poder mirarla en el navegador si hace falta.
armar(envenenado, 'preview-xss.html');

console.log('\n--- La página se sigue sirviendo vacía ---');
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');
caso('doGet no manda datos adentro del HTML',
  'si los manda, tener la URL alcanza para ver nombres, mails y celulares sin el PIN',
  () => /t\.datosIniciales\s*=\s*'null'\s*;/.test(src) || 'doGet incrusta datos'
);
caso('y la preview envenenada tampoco los ejecuta',
  'es la que se abre a mano para mirar; tiene que ser segura ella también',
  () => {
    const p = fs.readFileSync(path.join(__dirname, 'preview-xss.html'), 'utf8');
    const cuerpo = p.split('</head>')[1] || p;
    return !/<\s*img\s+src=x/i.test(cuerpo) || 'la preview trae un <img> vivo';
  }
);

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
