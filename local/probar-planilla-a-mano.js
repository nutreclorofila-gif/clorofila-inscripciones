// Lo que pasa cuando la planilla se edita a mano, que es como se va a usar
// siempre: cada taller nuevo es una fórmula copiada, y la lista de espera y las
// gift cards se escriben a dedo. Todos estos casos rompían la app antes.
const { cargar } = require('/Users/leonardolemes/Proyectos/clorofila-inscripciones/local/cargar.js');
const G = cargar();

let fallas = 0, corridos = 0;
function caso(nombre, esperado, obtenido) {
  corridos++;
  const a = JSON.stringify(esperado), b = JSON.stringify(obtenido);
  if (a === b) { console.log('  ok    ' + nombre); return; }
  fallas++;
  console.log('  FALLA ' + nombre + '\n        esperaba ' + a + '\n        dio      ' + b);
}

const HOJA = 'Inscriptos Noviembre 2026';
const ED = 'Taller de pastas — 12/11/2026';
const r = (f) => {
  const x = G.parsearRegla(f, ED, 5);
  return x && { hoja: x.hoja, k: x.criterioK, e: x.criterioE };
};

console.log('\n--- Formas de fórmula que Leo puede escribir sin querer ---');
// Importa porque: si la fórmula no se entiende, la edición aparece con 0 anotados.
caso('comillas + B5 (lo que hay hoy)',    { hoja: HOJA, k: ED, e: null }, r(`=COUNTIF('${HOJA}'!K:K;B5)`));
caso('coma en vez de punto y coma',       { hoja: HOJA, k: ED, e: null }, r(`=COUNTIF('${HOJA}'!K:K,B5)`));
caso('pestaña de una palabra, sin comillas',{ hoja: 'Inscriptos', k: ED, e: null }, r('=COUNTIF(Inscriptos!K:K;B5)'));
caso('referencias absolutas $K:$K',       { hoja: HOJA, k: ED, e: null }, r(`=COUNTIF('${HOJA}'!$K:$K;B5)`));
caso('rango acotado K2:K500',             { hoja: HOJA, k: ED, e: null }, r(`=COUNTIF('${HOJA}'!K2:K500;B5)`));
caso('criterio absoluto $B$5',            { hoja: HOJA, k: ED, e: null }, r(`=COUNTIF('${HOJA}'!K:K;$B$5)`));
caso('envuelta en IFERROR',               { hoja: HOJA, k: ED, e: null }, r(`=IFERROR(COUNTIF('${HOJA}'!K:K;B5);0)`));
caso('minúsculas',                        { hoja: HOJA, k: ED, e: null }, r(`=countif('${HOJA}'!k:k;B5)`));
caso('curso, literal',                    { hoja: HOJA, k: 'Curso — Nov', e: 'Mañana*' }, r(`=COUNTIFS('${HOJA}'!K:K;"Curso — Nov";'${HOJA}'!E:E;"Mañana*")`));
caso('curso con B5 en vez del literal',   { hoja: HOJA, k: ED, e: 'Mañana*' }, r(`=COUNTIFS('${HOJA}'!K:K;B5;'${HOJA}'!E:E;"Mañana*")`));
caso('curso con los pares al revés',      { hoja: HOJA, k: ED, e: 'Tarde*' }, r(`=COUNTIFS('${HOJA}'!E:E;"Tarde*";'${HOJA}'!K:K;B5)`));
caso('curso partido en dos renglones',    { hoja: HOJA, k: 'Curso — Nov', e: 'Sábados*' }, r(`=COUNTIFS('${HOJA}'!K:K; "Curso — Nov";\n  '${HOJA}'!E:E; "Sábados*")`));

console.log('\n--- Fórmulas que NO se pueden leer: la alerta tiene que decir por qué ---');
// Importa porque: "no tiene el formato esperado" no le dice a nadie qué arreglar.
function casoMotivo(nombre, fragmento, formula) {
  corridos++;
  const a = G.analizarFormula(formula, ED, 5);
  if (!a.regla && a.motivo.indexOf(fragmento) !== -1) { console.log('  ok    ' + nombre); return; }
  fallas++;
  console.log('  FALLA ' + nombre + '\n        el motivo tenía que hablar de: ' + fragmento +
              '\n        dijo: ' + (a.motivo || '(la dio por buena)'));
}
casoMotivo('número escrito a mano', 'no tiene fórmula', '');
casoMotivo('no es un COUNTIF',      'no usa COUNTIF',   '=SUMA(A1:A9)');
casoMotivo('dos COUNTIF sumados',   'más de un COUNTIF', `=COUNTIF('A'!K:K;B5)+COUNTIF('B'!K:K;B5)`);
casoMotivo('apunta a otra fila',    'B2, pero esta es la fila 5', `=COUNTIF('A'!K:K;B2)`);
casoMotivo('columna equivocada',    'mira la columna D', `=COUNTIF('A'!D:D;B5)`);
casoMotivo('dos pestañas a la vez', 'dos pestañas',      `=COUNTIFS('A'!K:K;B5;'B'!E:E;"Mañana*")`);

console.log('\n--- Qué pestañas hay que leer (tiene que aceptar lo mismo que el parser) ---');
// Importa porque: si la app arma una regla y no leyó esa pestaña, da un descuadre falso.
caso('con comillas',   ['Inscriptos Agosto 2026'], G.hojasDeFormula(`=COUNTIF('Inscriptos Agosto 2026'!K:K;B5)`));
caso('sin comillas',   ['Inscriptos'],             G.hojasDeFormula('=COUNTIF(Inscriptos!K:K;B5)'));
caso('sin referencias',[],                          G.hojasDeFormula('=SUMA(A1:A9)'));

console.log('\n--- Lista de espera escrita a mano ---');
// Importa porque: ligarla a la edición equivocada hace que la alerta llame a la
// persona para un taller que no pidió.
const eds = [{ edicion: 'Taller de tapeo — 18/09/2026' }, { edicion: 'Taller de pastas — 12/11/2026' }, { edicion: 'Curso de cocina — Octubre 2026' }];
caso('el nombre completo liga',        'Taller de tapeo — 18/09/2026', G.ligarAEdicion('Taller de tapeo — 18/09/2026', eds));
caso('una palabra que alcanza liga',   'Taller de tapeo — 18/09/2026', G.ligarAEdicion('tapeo', eds));
caso('"taller" a secas NO liga',       null,                            G.ligarAEdicion('taller', eds));
caso('texto que no es de nadie',       null,                            G.ligarAEdicion('cualquier cosa', eds));
caso('vacío',                          null,                            G.ligarAEdicion('', eds));

console.log('\n--- Gift cards ---');
// Importa porque: darla por usada la saca de la plata cobrada que falta cubrir.
caso('"Sin usar" no está usada',   false, G.estaUsada('Sin usar'));
caso('"No" no está usada',         false, G.estaUsada('No'));
caso('vacío no está usada',        false, G.estaUsada(''));
caso('"Sí" está usada',            true,  G.estaUsada('Sí'));
caso('"Canjeada el 12/8"',         true,  G.estaUsada('Canjeada el 12/8'));
const trampa = G.leerGiftCards([['Nombre', 'Fecha de compra', 'Monto', 'Estado'], ['Fulana', '14/07/2026', '3500', 'Sin usar']])[0];
caso('"Fecha de compra" no se lee como "de quién"', '', trampa.deQuien);
caso('el monto igual se lee',                       3500, trampa.monto);

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
