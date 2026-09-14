// Lo que pasa cuando la planilla se edita a mano, que es como se va a usar
// siempre: cada taller nuevo es una fórmula copiada, y la lista de espera y las
// gift cards se escriben a dedo. Todos estos casos rompían la app antes.
const { cargar } = require('./cargar.js');
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
// Así se escribe de verdad en la planilla: sin la raya que sí tiene el Panel.
// Ninguno contiene al otro, pero la fecha es la misma y eso no da lugar a dudas.
caso('liga por la fecha cuando el texto no calza',
     'Taller de tapeo — 18/09/2026', G.ligarAEdicion('Lista de espera — Taller de tapeo 18/09/2026', eds));
caso('una fecha que no está en el Panel no liga',
     null, G.ligarAEdicion('Taller de tapeo 01/01/2030', eds));

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

// Esto es lo que tiene la planilla de verdad: el encabezado del mail dice
// "compró", y antes se lo llevaban DOS campos — el mail salía también como
// "de quién". Una columna alimenta un campo y nada más.
const real = G.leerGiftCards([['nombre', 'mail de quien compró', 'estado'], ['Fulana', 'x@y.com', 'Libre']]);
caso('una columna no alimenta dos campos', '', real[0].deQuien);
caso('el mail sí se lee',                   'x@y.com', real[0].email);
caso('sin columna de importe, el monto es null', null, real[0].monto);
caso('y la app se da cuenta de que le falta', true, real.faltaElMonto);
caso('y puede decir qué columnas vio', ['nombre', 'mail de quien compró', 'estado'], real.columnas);

// Los encabezados REALES de la pestaña Gift Cards, que la propia app reportó.
const HGC = ['Código', 'Actividad', 'Comprada por', 'Email comprador', 'Fecha de compra',
             'Destinatario', 'Contacto destinatario', 'Estado', 'Usada por (nombre en Inscriptos)', 'Fecha de uso'];
const gcReal = G.leerGiftCards([HGC,
  ['GC-001', 'Taller de tapeo', 'Fulana', 'f@x.com', '14/07/2026', 'Mengana', '099111222', 'Libre', '', ''],
  ['GC-002', 'Taller de tapeo', 'Zutana', 'z@x.com', '01/06/2026', 'Perengano', '099333444', 'Libre', 'Perengano', '20/08/2026']]);
caso('"Destinatario" es de quién es la gift card', 'Mengana', gcReal[0].nombre);
caso('"Comprada por" es quién la regaló',          'Fulana',  gcReal[0].deQuien);
caso('lee para qué actividad es',                  'Taller de tapeo', gcReal[0].actividad);
caso('una sin canjear figura sin usar',            false, gcReal[0].usada);
// Este es el que importa: "Usada por (nombre en Inscriptos)" contiene la palabra
// "usada". Si se la lleva el campo del estado, una gift card canjeada sigue
// contando como disponible para siempre.
caso('una canjeada figura usada aunque Estado diga "Libre"', true, gcReal[1].usada);
caso('y se sabe quién la usó',                     'Perengano', gcReal[1].usadaPor);

// Sin columna "Estado", el campo del estado probaría con "usada" y engancharía
// "Usada por (nombre...)", mostrando el nombre de una persona como si fuera el
// estado de la gift card. Una columna la agarra UN campo y nadie más.
const sinEstado = G.leerGiftCards([
  ['Actividad', 'Comprada por', 'Destinatario', 'Usada por (nombre en Inscriptos)'],
  ['Taller de tapeo', 'Fulana', 'Mengana', 'Perengano']])[0];
caso('sin columna Estado, el estado queda vacío y no muestra un nombre', '', sinEstado.estado);
caso('pero igual se sabe que está usada',                               true, sinEstado.usada);
caso('y quién la usó sigue en su campo',                                'Perengano', sinEstado.usadaPor);

const completa = G.leerGiftCards([['nombre', 'de', 'email', 'monto', 'usada'], ['Fulana', 'Mengana', 'a@b.com', '3500', 'No']]);
caso('con la planilla completa lee todo bien', ['Mengana', 'a@b.com', 3500], [completa[0].deQuien, completa[0].email, completa[0].monto]);
caso('y ahí no falta nada',                    false, completa.faltaElMonto);

console.log('\n--- Lista de espera: distinguir "no hay nadie" de "no la supe leer" ---');
// Importa porque las dos cosas dan cero desde afuera, y una es normal y la otra
// es que la app está ciega justo cuando un taller se llena.
const EDS = [{ edicion: 'Taller de tapeo — 18/09/2026' }];
const espera = (filas) => G.leerEspera(filas, EDS);

const bien = espera([['nombre', 'email', 'celular', 'qué quiere'],
                     ['Fulana', 'f@x.com', '099111222', 'Taller de tapeo — 18/09/2026']]);
caso('lee a quien espera',            'Fulana', bien[0].nombre);
caso('y le arma el WhatsApp',         '59899111222', bien[0].whatsapp);
caso('y lo liga a su edición',        'Taller de tapeo — 18/09/2026', bien[0].edicion);
caso('no dice que no supo leer',      false, bien.noSeSupoLeer);

const vacia = espera([['nombre', 'email', 'qué quiere']]);
caso('una pestaña vacía NO es un error', false, vacia.noSeSupoLeer);
caso('y da cero',                        0, vacia.length);

const ilegible = espera([['persona', 'datos'], ['Fulana', '099111222'], ['Mengano', '099333444']]);
caso('si hay filas y no se leyó ninguna, lo dice', true, ilegible.noSeSupoLeer);
caso('y cuenta cuántas filas había',                2, ilegible.filasEnLaPestana);
caso('y dice qué columnas vio', ['persona', 'datos'], ilegible.columnas);

// La trampa de siempre: una columna de fecha que contiene la palabra "taller".
// Así es la pestaña de verdad: un renglón de título arriba explicando qué es,
// y los encabezados recién abajo. Con la fila 1 a ciegas no se leía NADIE, y
// desde afuera parecía que no había nadie esperando.
const conTitulo = espera([
  ['LISTA DE ESPERA: personas que quedaron sin lugar en su fecha original. Se llena sola.'],
  ['nombre', 'email', 'celular', 'Espera para'],
  ['Fulana', 'f@x.com', '099111222', 'Taller de tapeo — 18/09/2026']]);
caso('encuentra los encabezados debajo del título', 1, conTitulo.length);
caso('y lee a la persona',                          'Fulana', conTitulo[0].nombre);
caso('la columna "Espera para" es la edición',      'Taller de tapeo — 18/09/2026', conTitulo[0].quiere);
caso('y queda ligada a su edición',                 'Taller de tapeo — 18/09/2026', conTitulo[0].edicion);
caso('ya no dice que no supo leer',                 false, conTitulo.noSeSupoLeer);
caso('y reporta las columnas de verdad, no el título',
     ['nombre', 'email', 'celular', 'Espera para'], conTitulo.columnas);

const conFecha = espera([['nombre', 'email', 'fecha del taller'], ['Fulana', 'f@x.com', '14/07/2026']]);
caso('una columna de fecha no se lee como la edición', '', conFecha[0].quiere);
caso('y avisa que falta esa columna',                  true, conFecha.sinColumnaEdicion);

const conAmbas = espera([['nombre', 'email', 'fecha de anotación', 'taller que quiere'],
                         ['Fulana', 'f@x.com', '01/09/2026', 'Taller de tapeo — 18/09/2026']]);
caso('con la columna buena, la fecha no molesta', 'Taller de tapeo — 18/09/2026', conAmbas[0].quiere);

const gcFecha = G.leerGiftCards([['Código', 'Fecha de compra', 'Comprada por', 'Destinatario', 'Estado'],
                                 ['GC-1', '14/07/2026', 'Fulana', 'Mengana', 'Libre']])[0];
caso('en gift cards, "Fecha de compra" tampoco es la actividad', '', gcFecha.actividad);
caso('y quién la compró se lee bien',                            'Fulana', gcFecha.deQuien);

console.log('--- La fórmula nombra la pestaña con otras mayúsculas ---');
// Importa porque en Sheets los nombres de pestaña NO distinguen mayúsculas: el
// Panel cuenta bien y la app contaba cero, con tres alertas falsas encima.
const HI = ['nombre', 'email', 'celular', 'actividad', 'horario', 'medio', 'comprobante', 'monto', 'verif', 'fecha', 'Edición'];
const EDI = 'Taller de risotto — 03/12/2026';
function conPestana(nombreEnLaFormula) {
  const e = G.construirEstado({
    panelValores: [['Actividad', 'Edición', 'Cupo', 'Anotados', 'Quedan', 'Estado'],
                   ['Taller de risotto', EDI, '10', '2', '8', 'Abierto']],
    panelFormulas: [['', '', '', '', '', ''],
                    ['', '', '', "=COUNTIF('" + nombreEnLaFormula + "'!K:K;B2)", '', '']],
    hojas: { 'Inscriptos Diciembre 2026': [HI,
      ['Ana', 'a@x.com', '', '', '', '', '', '2600', '', '', EDI],
      ['Beto', 'b@x.com', '', '', '', '', '', '2600', '', '', EDI]] },
    extras: {}
  }, new Date(2026, 10, 1));
  return { gente: e.ediciones[0].personas.length, alertas: (e.alertas || []).length };
}
caso('igual que la pestaña',        { gente: 2, alertas: 0 }, conPestana('Inscriptos Diciembre 2026'));
caso('todo en minúscula',           { gente: 2, alertas: 0 }, conPestana('inscriptos diciembre 2026'));
caso('todo en mayúscula',           { gente: 2, alertas: 0 }, conPestana('INSCRIPTOS DICIEMBRE 2026'));
caso('con un espacio de más',       { gente: 2, alertas: 0 }, conPestana('Inscriptos  Diciembre 2026'));
// Y una pestaña que de verdad no existe tiene que seguir avisando.
caso('una pestaña que no existe sí avisa', 0, conPestana('Otra Pestaña').gente);

console.log('\n--- Fechas de las ediciones ---');
// Importa porque de acá sale el "en 8 días" de cada tarjeta y qué edición se
// considera vigente. Una fecha mal leída cambia las dos cosas.
const fe = (t) => { const d = G.fechaDeEdicion(t); return d ? d.toISOString().slice(0, 10) : null; };
caso('fecha normal',                '2026-09-18', fe('Taller de tapeo — 18/09/2026'));
caso('día y mes de una cifra',      '2026-02-01', fe('Taller — 1/2/2026'));
caso('un mes toma su último día',   '2026-10-31', fe('Curso de cocina — Octubre 2026'));
caso('"setiembre" como se escribe acá', '2026-09-30', fe('Curso — Setiembre 2026'));
caso('cambio de año',               '2027-01-31', fe('Curso — Enero 2027'));
caso('año bisiesto',                '2028-02-29', fe('Curso — Febrero 2028'));
// Sin esto, "31/02" se convertía sola en el 3 de marzo y la app mostraba otro día.
caso('31 de febrero no existe',     null, fe('Taller — 31/02/2026'));
caso('29 de febrero de un año no bisiesto', null, fe('Taller — 29/02/2027'));
caso('día 32',                      null, fe('Taller — 32/01/2026'));
caso('mes 13',                      null, fe('Taller — 18/13/2026'));
caso('una edición sin fecha',       null, fe('Curso de cocina — Martes 19-21h'));

const HOY13 = new Date(2026, 8, 13);
caso('un taller HOY sigue vigente',      true,  G.estaVigente('Taller — 13/09/2026', false, HOY13));
caso('el de ayer ya pasó',               false, G.estaVigente('Taller — 12/09/2026', false, HOY13));
caso('el de mañana está vigente',        true,  G.estaVigente('Taller — 14/09/2026', false, HOY13));
caso('un curso del mes en curso vigente', true,  G.estaVigente('Curso — Septiembre 2026', false, HOY13));
caso('sin fecha, vale lo que diga Abierto', true,  G.estaVigente('Curso — Martes 19-21h', true, HOY13));
caso('sin fecha y cerrada, ya pasó',        false, G.estaVigente('Curso — Martes 19-21h', false, HOY13));

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
