// La documentación tiene que decir lo que hay. Cada control de acá es una
// afirmación que en algún momento fue falsa y alguien (Leo o una sesión de
// Claude) la podía seguir al pie de la letra:
//
// - La receta "A mano" mandaba a publicar la página en Netlify, que gasta
//   créditos, y dejaba vieja la de GitHub, que es la que usa el teléfono.
// - Decía que la copia de Netlify "funciona igual": es la del 9/9, con plata en
//   la portada, sin Salir y con el PIN guardado para siempre.
// - Decía que el PIN "nunca" queda en claro: en el servidor no, en el teléfono sí.
// - Decía que "Copiar la lista" lleva el estado de pago: copia solo los nombres.
// - La cabecera de Codigo.gs mandaba a crear una implementación nueva, que
//   cambia la URL; y si cambiaba, mandaba a corregirla en un archivo generado.
// - La tabla de suites daba cantidades de casos que ya no eran (16 contra 22,
//   33 contra 93) y "las 12 mutaciones" cuando eran 25.
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..');
const leer = (r) => fs.readFileSync(path.join(base, r), 'utf8');

let fallas = 0, corridos = 0;
function caso(nombre, ok, detalle) {
  corridos++;
  if (ok) { console.log('  ok    ' + nombre); return; }
  fallas++;
  console.log('  FALLA ' + nombre + (detalle !== undefined ? '\n        ' + String(detalle).slice(0, 300) : ''));
}
const doc = leer('INSTRUCCIONES.md');
const verificar = leer('verificar.sh');
const lineaCon = (texto, re) => (texto.split('\n').filter(l => re.test(l))[0] || '');
// Un párrafo es lo que hay entre dos líneas en blanco.
const parrafoCon = (texto, re) => (texto.split(/\n\s*\n/).filter(p => re.test(p))[0] || '');

console.log('\n--- Las suites ---');
{
  const suites = [...verificar.matchAll(/^node (local\/[\w-]+\.js)/gm)].map(m => m[1]);
  const encabezados = [...verificar.matchAll(/=== (\d+)\/(\d+) /g)];
  const total = encabezados.length ? Number(encabezados[0][2]) : 0;
  caso('los encabezados de verificar.sh cuentan bien (1/N … N/N)',
    total === suites.length && encabezados.every((m, i) => Number(m[1]) === i + 1 && Number(m[2]) === total),
    encabezados.map(m => m[1] + '/' + m[2]).join(' ') + ' para ' + suites.length + ' suites');
  const dice = (doc.match(/corre las (\d+) suites/) || [])[1];
  caso('la documentación dice cuántas suites corre verificar.sh, y es ese número',
    Number(dice) === suites.length, 'dice ' + dice + ', son ' + suites.length);
  const faltan = suites.filter(s => doc.indexOf('| `' + s + '`') === -1);
  caso('cada suite de verificar.sh tiene su fila en la tabla', faltan.length === 0, faltan.join(', '));

  // Las cantidades de casos cambian con cada prueba nueva y nadie vuelve a la
  // tabla a corregirlas. El número de verdad lo imprime cada suite al final.
  const filas = doc.split('\n').filter(l => /^\| `local\//.test(l));
  const conNumero = filas.filter(l => /\b\d+ (casos|escenarios)\b|\b\d+ de \d+\b/.test(l));
  caso('la tabla de suites no promete cantidades de casos', conNumero.length === 0,
    conNumero.map(l => l.slice(0, 60)).join(' | '));
  caso('no dice cuántas mutaciones se detectan (eso lo dice probar-las-pruebas.js al correr)',
    !/\b\d+ mutaciones se detectan/.test(doc), lineaCon(doc, /mutaciones se detectan/));
}

console.log('\n--- Cómo se publica la página ---');
{
  caso('no manda a publicar en Netlify', !/npx[^\n]*netlify/i.test(doc), lineaCon(doc, /npx[^\n]*netlify/i));
  caso('la receta de la página usa local/publicar-pagina.sh', /local\/publicar-pagina\.sh/.test(doc));
  // La receta "A mano" mandaba a regenerar, commitear y publicar sin nombrar la
  // verificación: se podía subir al teléfono una página que no pasa las pruebas.
  const aMano = parrafoCon(doc, /^local\/publicar-pagina\.sh/m);
  caso('la receta "A mano" dice que publicar-pagina.sh verifica antes de publicar',
    /verificar\.sh/.test(aMano) && /no publica/i.test(aMano), aMano);
  // Es el párrafo que explica ./desplegar.sh.
  const rapido = parrafoCon(doc, /^Verifica, sube el código/m);
  caso('dice que desplegar.sh publica también la página',
    /gh-pages/.test(rapido) && /publicar-pagina\.sh/.test(rapido), rapido);
  caso('dice que primero va el servidor y después la página', /primero el servidor/i.test(doc));
  const netlify = parrafoCon(doc, /netlify\.app/);
  caso('no dice que la copia de Netlify "funciona igual"', !/funciona igual/i.test(netlify), netlify);
  caso('dice que la copia de Netlify es vieja y no se usa', /vieja/i.test(netlify) && /no se (usa|vuelve a publicar)/i.test(netlify), netlify);
  caso('no dice que la página se sirve desde Netlify', !/Sirviendo la página desde Netlify/.test(doc));
  const toml = leer('netlify.toml');
  caso('netlify.toml no dice que publicar ahí sea gratis', !/no gasta/i.test(toml) && /NO se vuelve a publicar/.test(toml),
    toml.split('\n')[0]);
}

console.log('\n--- La URL del servidor ---');
{
  caso('no manda a cambiar la URL en web/index.html, que es generado',
    !/actualizarla en `web\/index\.html`/.test(doc), lineaCon(doc, /web\/index\.html`\./));
  caso('dice que la URL vive en local/generar-web.js',
    /implementación nueva[\s\S]{0,300}local\/generar-web\.js/.test(doc));
  const cabecera = leer('apps-script/Codigo.gs').split('*/')[0];
  caso('la cabecera de Codigo.gs no manda a crear una implementación nueva',
    !/Implementar → Nueva implementación/.test(cabecera) && /NO crear una nueva/.test(cabecera),
    lineaCon(cabecera, /Implementar/));
}

console.log('\n--- El PIN y el teléfono ---');
{
  const hash = lineaCon(doc, /hasheado/);
  caso('lo del PIN hasheado aclara que en el teléfono queda en claro',
    /servidor/.test(hash) && /teléfono/.test(hash) && /en claro/.test(hash), hash);
  const guardado = parrafoCon(doc, /^La app guarda el último estado en el navegador/m);
  caso('dice que la app se abre sola con el PIN guardado, con o sin señal',
    /se abre sola/.test(guardado) && /sin señal/.test(guardado), guardado.slice(0, 200));
}

console.log('\n--- Copiar la lista ---');
{
  const item = parrafoCon(doc, /\*\*Copiar la lista de anotados\*\* de una edición/) ||
               lineaCon(doc, /\*\*Copiar la lista de anotados\*\* de una edición/);
  const bullet = (item.split('\n- ').filter(b => /Copiar la lista de anotados/.test(b))[0] || '');
  caso('no dice que copia el estado de pago', !/con el estado de pago/.test(bullet), bullet);
  caso('dice que copia solo los nombres', /solo los nombres/.test(bullet), bullet);
}

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
