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

  // El buscador tiene que aguantar cómo escribe la gente de verdad.
  const buscar = [
    ['sin acento encuentra con acento', 'Úrsula Méndez', '098765110', 'ursula', true],
    ['el apellido solo', 'Úrsula Méndez', '098765110', 'mendez', true],
    ['las palabras en cualquier orden', 'Úrsula Méndez', '098765110', 'mendez ursula', true],
    ['la ñ', 'Ana Núñez', '091234567', 'nunez', true],
    ['la á, que es la más común acá', 'Tomás Rodríguez', '091234567', 'tomas', true],
    ['la Á con mayúscula', 'Álvaro Ángel', '091234567', 'alvaro angel', true],
    ['la é y la ó juntas', 'José Colón', '091234567', 'jose colon', true],
    ['el celular con espacios', 'Úrsula Méndez', '098765110', '098 765 110', true],
    ['el celular como viene de WhatsApp', 'Úrsula Méndez', '098765110', '+598 98 765 110', true],
    ['solo los últimos dígitos', 'Úrsula Méndez', '098765110', '765110', true],
    ['un celular cargado con el país', 'Úrsula Méndez', '59894561230', '094 561 230', true],
    ['otro celular NO coincide', 'Úrsula Méndez', '098765110', '091111111', false],
    ['otro nombre NO coincide', 'Úrsula Méndez', '098765110', 'pedro', false],
    ['quien no tiene celular no aparece por número', 'Sin Celular', '', '098765110', false]
  ];
  buscar.forEach(([nombre, quien, cel, q, esperado]) => {
    corridos++;
    const r = ui.coincideBusqueda(quien + ' x@y.com ' + cel, cel, q);
    if (r === esperado) console.log('  ok    buscador: ' + nombre);
    else { fallas++; console.log('  FALLA buscador: ' + nombre + ' — buscando ' + JSON.stringify(q) +
                                 ' dio ' + r + ' y esperaba ' + esperado); }
  });

  // Esa lista se pega en el grupo o se le manda a la cocina.
  corridos++;
  const edCopia = {
    titulo: 'Taller de tapeo', subtitulo: '18/09/2026', anotados: 3, cupo: 12,
    personas: [
      { nombre: 'Ana', estadoPago: 'completo', saldo: 0 },
      { nombre: 'Beto', estadoPago: 'parcial', saldo: 9200 },
      { nombre: '', estadoPago: 'sin_pago', saldo: 0 }
    ]
  };
  ui.copiarLista(edCopia, { textContent: '' });
  const copiado = ui.verCopiado() || '';
  const problemas = [];
  if (!/Ana/.test(copiado) || !/Beto/.test(copiado)) problemas.push('faltan nombres');
  if (/\$/.test(copiado) || /Debe|Pagó|Sin pago/.test(copiado)) problemas.push('lleva el estado de pago');
  if (!/Taller de tapeo/.test(copiado) || !/3 de 12/.test(copiado)) problemas.push('falta el encabezado');
  if (!/\(sin nombre\)/.test(copiado)) problemas.push('se pierde el que no tiene nombre cargado');
  if (!problemas.length) console.log('  ok    la lista que se copia lleva nombres y no plata');
  else { fallas++; console.log('  FALLA copiar la lista: ' + problemas.join(', ') + '\n        quedó: ' + JSON.stringify(copiado)); }

  // El "en 8 días" de cada tarjeta: es lo que dice qué hay que mirar hoy.
  const comoElServidor = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const enDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return comoElServidor(d); };
  [[-30, 'ya pasó', 'ya'], [-1, 'ya pasó', 'ya'], [0, 'ES HOY', 'ya'], [1, 'es mañana', 'pronto'],
   [2, 'en 2 días', 'pronto'], [7, 'en 7 días', 'pronto'], [8, 'en 8 días', '']].forEach(([n, texto, clase]) => {
    corridos++;
    const r = ui.cuandoEs(enDias(n));
    if (r && r.texto === texto && r.clase === clase) console.log('  ok    cuándo es: ' + n + ' días -> "' + texto + '"');
    else { fallas++; console.log('  FALLA cuándo es: ' + n + ' días dio ' + JSON.stringify(r) + ', esperaba "' + texto + '"'); }
  });
  corridos++;
  if (ui.cuandoEs(null) === null && ui.cuandoEs('cualquier cosa') === null && ui.hora('no es fecha') === '') {
    console.log('  ok    sin fecha o con basura no rompe nada');
  } else { fallas++; console.log('  FALLA una fecha inválida no se maneja bien'); }

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
      detalle:'La fórmula cuenta lo que dice B2, pero esta es la fila 5.' },
    // Sin la marca: es lo que manda el Apps Script que todavía está desplegado.
    { nivel:'alta', tipo:'sin_verificar', edicion:'Z',
      texto:'Zutano: hay un pago sin verificar',
      detalle:'Esos $ 5.400 están sumando al cobrado.' }
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

  // Lo que de verdad llega al teléfono: doGet recorta el comprobante, los mails de
  // las gift cards y otros datos que la pantalla no muestra. Si alguna solapa los
  // usara, acá quedaría un "undefined" a la vista.
  if (typeof G.paraElTelefono !== 'function') {
    fallas++; corridos++;
    console.log('\n--- Lo que manda doGet, recortado ---\n  FALLA no existe paraElTelefono en Codigo.gs');
  } else {
    const entero = G.construirEstado(fixture, new Date(2026, 8, 9, 15, 30));
    const recortado = G.paraElTelefono(entero);
    probarEstado('Lo que manda doGet, recortado', recortado);
    // Más fuerte que "no explota": las cuatro solapas tienen que salir idénticas
    // con y sin el recorte. Si difieren, se sacó algo que la pantalla sí mostraba.
    const a = cargarUI(entero), b = cargarUI(recortado);
    const distintas = ['vistaCupos', 'vistaPlata', 'vistaGente', 'vistaAlertas'].filter(v => a[v]() !== b[v]());
    corridos++;
    if (distintas.length === 0) console.log('  ok    las cuatro solapas quedan idénticas con y sin el recorte');
    else { fallas++; console.log('  FALLA el recorte cambió lo que se ve en: ' + distintas.join(', ')); }
  }

  // Backend viejo: sin los campos que se agregaron después.
  const viejo = G.construirEstado(fixture, new Date(2026, 8, 9, 15, 30));
  delete viejo.espera; delete viejo.giftCards;
  (viejo.ediciones || []).forEach(e => (e.personas || []).forEach(p => { delete p.veces; delete p.whatsapp; }));
  probarEstado('Backend viejo: sin espera, sin gift cards, sin repetidores', viejo);

  // Planilla recién estrenada: todo vacío.
  probarEstado('Planilla vacía', G.construirEstado({ panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado']], panelFormulas: [['','','','','','']], hojas: {}, extras: {} }, new Date()));
}

// El curso lleva solo el mes en el nombre. Para saber si ya pasó se toma el
// último día del mes, y eso está bien; pero la tarjeta usaba esa misma fecha
// para el "en N días" y para el orden: el curso de octubre decía "en 38 días"
// el 23/9 y quedaba abajo de un taller del 16/10.
console.log('\n--- El curso se cuenta y se ordena por cuándo empieza ---');
{
  const { cargar } = require('./cargar.js');
  const G = cargar();
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const COMO_SE_DICE = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','octubre','noviembre','diciembre'];
  const hoy = new Date();
  const dd = (n) => (n < 10 ? '0' : '') + n;
  const conCurso = (mes) => {
    const curso = 'Curso de cocina — ' + MESES[mes.getMonth()] + ' ' + mes.getFullYear() + ' (Jueves 10-12h)';
    const taller = 'Taller de prueba — 16/' + dd(mes.getMonth() + 1) + '/' + mes.getFullYear();
    return G.construirEstado({
      panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
        ['Taller de prueba', taller, '12', '0', '12', 'Abierto'],
        ['Curso de cocina', curso, '15', '0', '15', 'Abierto']],
      panelFormulas: [['','','','','',''],
        ['','','',"=COUNTIF('Inscriptos Prueba'!K:K;B2)",'',''],
        ['','','',"=COUNTIF('Inscriptos Prueba'!K:K;B3)",'','']],
      hojas: { 'Inscriptos Prueba': [['nombre','email','celular','actividad','horario','medio','comprobante','monto','verif','fecha','Edición']] },
      extras: {}
    }, hoy);
  };
  const cuandoDelCurso = (html) => {
    const trozo = html.slice(html.indexOf('Curso de cocina'));
    const m = trozo.match(/class="cuando[^"]*">([^<]*)</);
    return m ? m[1] : '(sin cuándo)';
  };

  const siguiente = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const cupos = cargarUI(conCurso(siguiente)).vistaCupos();
  corridos++;
  if (cupos.indexOf('Curso de cocina') !== -1 && cupos.indexOf('Curso de cocina') < cupos.indexOf('Taller de prueba')) {
    console.log('  ok    el curso del mes que viene queda antes que un taller del 16 de ese mes');
  } else { fallas++; console.log('  FALLA el curso quedó después del taller del 16: se ordena por el fin de mes'); }
  corridos++;
  const esperado = 'en ' + COMO_SE_DICE[siguiente.getMonth()];
  if (cuandoDelCurso(cupos) === esperado) console.log('  ok    la tarjeta del curso dice "' + esperado + '"');
  else { fallas++; console.log('  FALLA la tarjeta del curso dice "' + cuandoDelCurso(cupos) + '" y esperaba "' + esperado + '"'); }

  const esteMes = cuandoDelCurso(cargarUI(conCurso(new Date(hoy.getFullYear(), hoy.getMonth(), 1))).vistaCupos());
  corridos++;
  if (esteMes === 'este mes') console.log('  ok    el curso de este mes dice "este mes", no cuántos días faltan para fin de mes');
  else { fallas++; console.log('  FALLA el curso de este mes dice "' + esteMes + '"'); }
}

// Una fila del Panel con el Cupo sin cargar ya no desaparece: la tarjeta tiene
// que mostrarla sin inventar números ("de null", "0 de más").
console.log('\n--- Tarjeta con el Cupo sin cargar ---');
{
  const { cargar } = require('./cargar.js');
  const G = cargar();
  const e = G.construirEstado({
    panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
      ['Taller de prueba', 'Taller de prueba — 20/12/2099', '', '1', '', 'Abierto']],
    panelFormulas: [['','','','','',''], ['','','',"=COUNTIF('Inscriptos Prueba'!K:K;B2)",'','']],
    hojas: { 'Inscriptos Prueba': [['nombre','email','celular','actividad','horario','medio','comprobante','monto','verif','fecha','Edición'],
      ['Ana','a@x.com','','','','','','2600','','','Taller de prueba — 20/12/2099']] },
    extras: {}
  }, new Date());
  const ui = cargarUI(e);
  const html = ui.vistaCupos();
  corridos++;
  if (!/null|de más|>Lleno</.test(html) && /Cupo sin cargar/.test(html)) console.log('  ok    la tarjeta dice "Cupo sin cargar" y no inventa lugares');
  else { fallas++; console.log('  FALLA la tarjeta con el cupo vacío quedó: ' + (html.match(/class="cifra">[\s\S]*?<\/div>/) || [html.slice(0, 300)])[0]); }
  if (e.ediciones[0]) ui.copiarLista(e.ediciones[0], { textContent: '' });
  const copiado = ui.verCopiado() || '';
  corridos++;
  if (!/null/.test(copiado) && /Ana/.test(copiado)) console.log('  ok    la lista copiada no dice "de null"');
  else { fallas++; console.log('  FALLA la lista copiada quedó: ' + JSON.stringify(copiado)); }
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
