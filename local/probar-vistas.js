// Pasa un estado por las cuatro solapas y comprueba que ninguna explota.
// Importa porque la página publicada y el Apps Script se despliegan por separado:
// la página tiene que aguantar un backend más viejo, o Leo abre la app y ve una
// pantalla en blanco sin saber por qué.
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..');

const { cargarUI } = require('./ui.js');

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

  // Y tampoco con alertas altas que hablan de plata: esas se muestran arriba de
  // Cupos, así que su detalle no puede llevar montos.
  corridos++;
  const conAlertas = JSON.parse(JSON.stringify(estado));
  conAlertas.alertas = [
    { nivel:'alta', tipo:'sin_verificar', edicion:'X', conPlata:true,
      texto:'Fulana: hay un pago sin verificar',
      detalle:'La planilla dice "no" y esos $ 2.600 están sumando al cobrado.' },
    { nivel:'alta', tipo:'precio_viejo', edicion:'', conPlata:true,
      texto:'El precio del curso que usa la app quedó viejo',
      detalle:'La mayoría paga $ 13.500 pero la app calcula contra $ 12.200.' },
    { nivel:'alta', tipo:'formula', edicion:'Y', conPlata:false,
      texto:'No se pudo leer cómo cuenta "Y"',
      detalle:'La fórmula cuenta lo que dice B2, pero esta es la fila 5.' }
  ];
  const ui2 = cargarUI(conAlertas);
  const cupos2 = ui2.vistaCupos();
  const m2 = montos(cupos2);
  if (m2.length === 0 && /pago sin verificar/.test(cupos2) && /fila 5/.test(cupos2)) {
    console.log('  ok    las alertas altas se ven en la portada, pero sin los montos');
  } else {
    fallas++;
    console.log('  FALLA montos en la portada: ' + JSON.stringify(m2) +
                (/fila 5/.test(cupos2) ? '' : ' — y se perdió el detalle de las que no hablan de plata'));
  }

  // El aviso de "se anotó gente" también se ve en la portada: sin montos.
  corridos++;
  const uiN = cargarUI(estado, {
    desde: Date.now() - 26 * 60 * 60 * 1000,
    gente: [{ nombre: 'Fulana', edicion: 'X' }, { nombre: 'Mengano', edicion: 'X' },
            { nombre: 'Zutano', edicion: 'X' }, { nombre: 'Perengano', edicion: 'X' }]
  });
  const banner = uiN.avisoDeNovedades();
  if (/Se anotaron 4 personas/.test(banner) && /y 1 más/.test(banner) && montos(banner).length === 0
      && /desde hace 1 día/.test(banner)) {
    console.log('  ok    avisa quién se anotó, sin montos y sin listar a todos');
  } else {
    fallas++;
    console.log('  FALLA el aviso de novedades quedó: ' + banner);
  }

  corridos++;
  if (cargarUI(estado, null).avisoDeNovedades() === '' &&
      cargarUI(estado, { desde: Date.now(), gente: [] }).avisoDeNovedades() === '') {
    console.log('  ok    si no se anotó nadie, no muestra nada');
  } else {
    fallas++;
    console.log('  FALLA muestra el aviso sin novedades');
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

// Las piezas se prueban sueltas; esto comprueba que estén enchufadas.
console.log('\n--- Que las piezas estén conectadas ---');
const fuente = fs.readFileSync(path.join(base, 'apps-script', 'Index.html'), 'utf8');
[['el aviso de novedades se pinta en Cupos', /SOLAPA === 'cupos'\)\s*p\.innerHTML = avisoDeCache\(\) \+ avisoDeNovedades\(\)/],
 ['y NO en Plata, que es donde están los montos', /SOLAPA === 'plata'\) p\.innerHTML = avisoDeCache\(\) \+ vistaPlata/],
 ['cada estado que llega del servidor pasa por recibirEstado', /recibirEstado\(/],
 ['ya no se guarda la caché por afuera de recibirEstado', /^(?![\s\S]*guardarCache\(nuevo)/]
].forEach(([nombre, re]) => {
  corridos++;
  if (re.test(fuente)) console.log('  ok    ' + nombre);
  else { fallas++; console.log('  FALLA ' + nombre); }
});
const cuantos = (fuente.match(/recibirEstado\(/g) || []).length;
corridos++;
if (cuantos === 4) console.log('  ok    se usa en los 3 lugares que traen datos (más su definición)');
else { fallas++; console.log('  FALLA recibirEstado aparece ' + cuantos + ' veces, esperaba 4'); }

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
