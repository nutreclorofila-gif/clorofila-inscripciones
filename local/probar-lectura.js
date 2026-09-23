// Prueba leerPlanilla() con un servicio Sheets falso. Es la única parte que toca
// Google, así que sin esto se despliega código que nunca corrió ni una vez.
const fs = require('fs'), path = require('path');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8'));

// La API real recorta las celdas vacías del final de cada fila: el stub hace lo
// mismo, para que la prueba enfrente los mismos datos irregulares que producción.
const recortar = (filas) => filas.map(f => {
  const c = f.slice();
  while (c.length && (c[c.length - 1] === '' || c[c.length - 1] == null)) c.pop();
  return c;
});

const llamadas = [];
// Los nombres de las pestañas los escribe Leo: la prueba los cambia al final
// para comprobar que la app no depende de las mayúsculas exactas.
let nombreEspera = 'Lista de espera', nombreGift = 'Gift Cards', nombrePanel = 'Panel';
const titulos = () => [
  'Clorofila — Master contactos 2026 v5 DEFINITIVO', nombrePanel, nombreEspera,
  nombreGift, 'Curso Octubre 2026', 'Tapeo 07-08-2026',
  ...Object.keys(fixture.hojas)
].filter(Boolean);

// La API de verdad rechaza un rango cuya pestaña no existe. Sin esto, la prueba
// de "le cambiaron el nombre al Panel" pasaría por la razón equivocada.
const hojaDelRango = (r) => String(r).replace(/^'/, '').replace(/'?!.*$/, '').replace(/''/g, "'");
const exigirQueExista = (rango) => {
  const h = hojaDelRango(rango);
  if (!titulos().includes(h)) throw new Error('Unable to parse range: ' + rango);
};
const igual = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const Sheets = {
  Spreadsheets: {
    get: (id, opts) => {
      llamadas.push({ op: 'get', id, fields: opts && opts.fields });
      return { sheets: titulos().map(t => ({ properties: { title: t } })) };
    },
    Values: {
      get: (id, rango, opts) => {
        llamadas.push({ op: 'values.get', rango, render: opts.valueRenderOption });
        exigirQueExista(rango);
        const base = opts.valueRenderOption === 'FORMULA' ? fixture.panelFormulas : fixture.panelValores;
        return { values: recortar(base) };
      },
      batchGet: (id, opts) => {
        llamadas.push({ op: 'batchGet', ranges: opts.ranges });
        return { valueRanges: opts.ranges.map(r => {
          const nombre = r.replace(/^'/, '').replace(/'!A:[KN]$/, '').replace(/''/g, "'");
          if (igual(nombre, nombreEspera)) {
            return { values: [
              ['nombre','email','celular','edición'],
              ['Ana Espera','ana@ejemplo.com','099111222','Taller de tapeo — 18/09/2026'],
              ['Beto Espera','beto@ejemplo.com','','Otro taller que no existe']
            ]};
          }
          if (igual(nombre, nombreGift)) {
            return { values: [
              ['nombre','de','email','monto','usada'],
              ['Regalada A','Menganita','a@ejemplo.com','2600',''],
              ['Regalada B','Pedro','b@ejemplo.com','12200','sí']
            ]};
          }
          return { values: recortar(fixture.hojas[nombre] || []) };
        })};
      }
    }
  }
};

const sandbox = { Sheets, SpreadsheetApp: undefined, HtmlService: {}, Utilities: {}, console };
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');
const decl = (src.match(/^(?:function|var)\s+([A-Za-z_$][\w$]*)/gm) || [])
  .map(l => l.replace(/^(?:function|var)\s+/, ''));
const api = new Function(...Object.keys(sandbox),
  src + '\nreturn {' + decl.map(n => n + ':' + n).join(',') + '};'
).call({}, ...Object.values(sandbox));

let fallas = 0;
const chequear = (nombre, cond, detalle) => {
  if (cond) console.log('  ok    ' + nombre);
  else { fallas++; console.log('  FALLA ' + nombre + '\n        ' + detalle); }
};

console.log('\n--- leerPlanilla() con la API de Sheets ---');
const crudo = api.leerPlanilla();
const leidas = Object.keys(crudo.hojas);

chequear('nunca llama a SpreadsheetApp',
  !/SpreadsheetApp\s*\./.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')),
  'si lo usa, Google exige permiso de ESCRITURA sobre todas las planillas de la cuenta');

chequear('lee las 3 pestañas de Inscriptos',
  ['Inscriptos Agosto 2026','Inscriptos Septiembre 2026','Inscriptos Octubre 2026'].every(n => leidas.includes(n)),
  'leyó: ' + leidas.join(', '));

chequear('"Lista de espera" y "Gift Cards" NO entran como inscriptos',
  !leidas.includes('Lista de espera') && !leidas.includes('Gift Cards'),
  'no ocupan cupo; contarlas rompería todos los números. Leyó: ' + leidas.join(', '));

chequear('pero SÍ se leen aparte',
  !!(crudo.extras && crudo.extras['Lista de espera'] && crudo.extras['Gift Cards']),
  'sin ellas no se puede saber a quién llamar cuando algo se llena');

chequear('pide las fórmulas del Panel, no solo los valores',
  llamadas.some(l => l.render === 'FORMULA') && /COUNTIF/i.test(crudo.panelFormulas.map(f => f[3]).join(' ')),
  'sin las fórmulas no puede ligar cada persona a su edición');

chequear('trae todas las pestañas en UNA sola llamada',
  llamadas.filter(l => l.op === 'batchGet').length === 1,
  'llamadas: ' + JSON.stringify(llamadas.map(l => l.op)));

chequear('empareja las filas cortas hasta la columna K',
  Object.values(crudo.hojas).every(f => f.every(x => x.length === 11)),
  'la API recorta las celdas vacías del final; sin emparejar, la columna K a veces no existe');

console.log('\n--- construirEstado() de punta a punta ---');
// Cuántas ediciones hay sale del propio Panel del fixture, no de un número fijo:
// con datos nuevos el número cambia y la prueba no tiene que ponerse en rojo por eso.
const edicionesPanel = fixture.panelValores.slice(1).filter(r => String(r[1] || '').trim()).length;
// La fecha queda fija en el 9/9: la lista de espera de mentira de arriba espera
// el tapeo del 18/09, y los avisos de espera dependen de que ese taller no haya
// pasado todavía.
const estado = api.construirEstado(crudo, new Date(2026, 8, 9));
chequear('arma el estado completo sin explotar',
  edicionesPanel > 0 && estado.ediciones.length === edicionesPanel &&
  Object.values(estado.resumen).every(v => typeof v === 'boolean' || Number.isFinite(v)),
  'ediciones: ' + estado.ediciones.length + ' de ' + edicionesPanel + ' — ' + JSON.stringify(estado.resumen));
chequear('los conteos cuadran contra el Panel',
  estado.ediciones.every(e => e.personas.length === e.anotados),
  estado.ediciones.filter(e => e.personas.length !== e.anotados).map(e => e.edicion).join(', '));
chequear('el JSON viaja al navegador sin romperse',
  JSON.parse(JSON.stringify(estado)).ediciones.length === edicionesPanel, 'no serializa');

console.log('\n--- lista de espera y gift cards ---');
chequear('lee la lista de espera',
  estado.espera.length === 2, JSON.stringify(estado.espera));
chequear('liga a la persona con la edición que espera',
  estado.espera[0].edicion === 'Taller de tapeo — 18/09/2026',
  'quedó: ' + estado.espera[0].edicion);
chequear('si no puede ligarla, igual la muestra',
  estado.espera[1].edicion === null && estado.espera[1].nombre === 'Beto Espera',
  'se perdió una persona de la lista de espera');
chequear('arma el WhatsApp de quien espera',
  estado.espera[0].whatsapp === '59899111222', 'quedó: ' + estado.espera[0].whatsapp);
chequear('avisa que hay alguien esperando en una edición llena',
  estado.alertas.some(a => a.tipo === 'espera' && /Ana Espera/.test(a.texto)),
  'el tapeo está 12/12 y hay alguien esperando: tiene que avisar');
chequear('lee las gift cards y distingue usadas de sin usar',
  estado.giftCards.length === 2 && estado.giftCards[0].usada === false && estado.giftCards[1].usada === true,
  JSON.stringify(estado.giftCards));
chequear('cuenta las gift cards sin usar en el resumen',
  estado.resumen.giftSinUsar === 1, 'dio ' + estado.resumen.giftSinUsar);

console.log('\n--- quién repite ---');
// A propósito NO se imprimen los nombres: esta salida se pega en cualquier lado.
const repetidores = {};
estado.ediciones.forEach(e => e.personas.forEach(p => { if (p.veces > 1) repetidores[p.email || p.nombre] = p.veces; }));
const cuantos = Object.keys(repetidores).length;
const maximo = cuantos ? Math.max(...Object.values(repetidores)) : 0;
chequear('detecta a los que vinieron más de una vez',
  cuantos > 0, 'no encontró ninguno, y en la planilla hay gente repetida');
console.log('        ' + cuantos + ' personas repiten; la que más vino estuvo ' + maximo + ' veces');

chequear('a quien espera un taller que todavía no pasó NO le dice que ya pasó',
  !estado.alertas.some(a => a.tipo === 'espera_vieja' && /Ana Espera/.test(a.texto)),
  'el aviso de "ya pasó" salió para el tapeo del 18/09, que al 9/9 todavía no pasó');

console.log('\n--- Quien espera un taller que ya pasó ---');
// Importa porque la alerta de "está lleno y hay alguien esperando" solo mira
// ediciones vigentes: sin esto, esa persona no aparece en ningún lado y se
// queda esperando para siempre. Pasa de verdad: hay 2 así en la planilla.
{
  const HH = ['nombre','email','celular','actividad','horario','medio','comprobante','monto','verif','fecha','Edición'];
  const VIEJO = 'Taller de tapeo — 07/08/2026', NUEVO = 'Taller de tapeo — 18/12/2026';
  const f = (n, ed) => [n, n.toLowerCase() + '@x.com', '', '', '', '', '', '2600', '', '', ed];
  const armar = (conOtraFecha) => api.construirEstado({
    panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
      ['Taller de tapeo', VIEJO, '12', '1', '11', 'Cerrado']].concat(
      conOtraFecha ? [['Taller de tapeo', NUEVO, '12', '1', '11', 'Abierto']] : []),
    panelFormulas: [['','','','','',''],
      ['','','',"=COUNTIF('Inscriptos'!K:K;B2)",'','']].concat(
      conOtraFecha ? [['','','',"=COUNTIF('Inscriptos'!K:K;B3)",'','']] : []),
    hojas: { 'Inscriptos': [HH, f('Ana', VIEJO)].concat(conOtraFecha ? [f('Beto', NUEVO)] : []) },
    extras: { 'Lista de espera': [
      ['LISTA DE ESPERA: se llena sola.'],
      ['nombre','email','celular','Espera para'],
      ['Fulana','f@x.com','099111222','Taller de tapeo 07/08/2026']] }
  }, new Date(2026, 10, 1));

  const conProxima = armar(true);
  const a1 = (conProxima.alertas || []).filter(x => x.tipo === 'espera_vieja');
  chequear('avisa que quedó esperando algo que ya pasó',
    a1.length === 1 && /Fulana/.test(a1[0].texto), JSON.stringify(a1));
  chequear('y le ofrece la próxima fecha con lugar',
    a1.length === 1 && /18\/12\/2026/.test(a1[0].detalle) && /11 lugares/.test(a1[0].detalle),
    a1.length ? a1[0].detalle : '(sin alerta)');

  // El caso real: la próxima fecha existe pero está LLENA. Decir "no hay otra
  // fecha" ahí es lo contrario de la verdad, y encima esa persona es
  // justamente a quien hay que llamar si alguien larga.
  const llena = api.construirEstado({
    panelValores: [['Actividad','Edición','Cupo','Anotados','Quedan','Estado'],
      ['Taller de tapeo', VIEJO, '12', '1', '11', 'Cerrado'],
      ['Taller de tapeo', NUEVO, '12', '12', '0', 'Abierto']],
    panelFormulas: [['','','','','',''],
      ['','','',"=COUNTIF('Inscriptos'!K:K;B2)",'',''],
      ['','','',"=COUNTIF('Inscriptos'!K:K;B3)",'','']],
    hojas: { 'Inscriptos': [HH, f('Ana', VIEJO)].concat(
      Array.from({ length: 12 }, (_, i) => f('P' + i, NUEVO))) },
    extras: { 'Lista de espera': [
      ['LISTA DE ESPERA: se llena sola.'],
      ['nombre','email','celular','Espera para'],
      ['Fulana','f@x.com','099111222','Taller de tapeo 07/08/2026']] }
  }, new Date(2026, 10, 1));
  const a3 = (llena.alertas || []).filter(x => x.tipo === 'espera_vieja');
  chequear('si la próxima está llena, lo dice en vez de decir que no hay',
    a3.length === 1 && /está llena/.test(a3[0].detalle) && !/No hay otra fecha/.test(a3[0].detalle),
    a3.length ? a3[0].detalle : '(sin alerta)');
  chequear('y dice que es a quien llamar si alguien larga',
    a3.length === 1 && /a quien llamar/.test(a3[0].detalle),
    a3.length ? a3[0].detalle : '(sin alerta)');

  const sinProxima = armar(false);
  const a2 = (sinProxima.alertas || []).filter(x => x.tipo === 'espera_vieja');
  chequear('si no hay otra fecha, lo dice igual',
    a2.length === 1 && /No hay otra fecha/.test(a2[0].detalle),
    a2.length ? a2[0].detalle : '(sin alerta)');
}

console.log('\n--- Si las pestañas se llaman con otras mayúsculas ---');
// Importa porque: con comparación exacta, "Lista de Espera" hacía que esa vista
// quedara vacía para siempre y la app no decía nada.
nombreEspera = 'Lista de Espera';
nombreGift = 'Gift cards';
const crudo2 = api.leerPlanilla();
chequear('encuentra "Lista de Espera" con E mayúscula',
  !!(crudo2.extras && crudo2.extras['Lista de espera']),
  'extras leídos: ' + Object.keys(crudo2.extras || {}).join(', '));
chequear('encuentra "Gift cards" con c minúscula',
  !!(crudo2.extras && crudo2.extras['Gift Cards']),
  'extras leídos: ' + Object.keys(crudo2.extras || {}).join(', '));
chequear('y siguen sin contar como inscriptos',
  !Object.keys(crudo2.hojas).some(n => /lista de espera|gift/i.test(n)),
  'se colaron en los cupos: ' + Object.keys(crudo2.hojas).join(', '));
const estado2 = api.construirEstado(crudo2, new Date(2026, 8, 9));
chequear('la lista de espera llega igual a la app',
  estado2.espera.length === 2 && estado2.resumen.giftSinUsar === 1,
  'espera: ' + estado2.espera.length + ', gift sin usar: ' + estado2.resumen.giftSinUsar);
nombreEspera = 'Lista de espera'; nombreGift = 'Gift Cards';

console.log('\n--- Cuando se rompe algo: qué mensaje ve Leo ---');
// Importa porque: "Unable to parse range: Panel!A1:F500" no le dice a nadie qué
// hacer, y Leo va a estar editando la planilla todo el tiempo.
nombrePanel = 'PANEL';
let sirve = true, dijo = '';
try { api.leerPlanilla(); } catch (e) { sirve = false; dijo = e.message; }
chequear('si el Panel se llama "PANEL", la app lo encuentra igual',
  sirve, 'se rompió con: ' + dijo);

nombrePanel = null;   // la pestaña ya no está
let mensaje = '';
try { api.leerPlanilla(); } catch (e) { mensaje = api.explicarError(e); }
chequear('si no está el Panel, dice cuál falta y qué pestañas hay',
  /No encuentro la pestaña "Panel"/.test(mensaje) && /Inscriptos Agosto 2026/.test(mensaje),
  'dijo: ' + mensaje);

nombrePanel = 'Panel';
chequear('un error de Google se traduce a algo accionable',
  /Le cambiaron el nombre a una pestaña/.test(api.explicarError(new Error('Unable to parse range: X!A1:B2'))),
  'dijo: ' + api.explicarError(new Error('Unable to parse range: X!A1:B2')));
chequear('y no se pierde el texto original de Google',
  /Google dijo/.test(api.explicarError(new Error('Requested entity was not found.'))),
  'sin el original no hay con qué buscar el problema de verdad');
chequear('los mensajes que ya están en castellano no se tocan',
  api.explicarError(new Error('PIN incorrecto.')) === 'PIN incorrecto.',
  'quedó: ' + api.explicarError(new Error('PIN incorrecto.')));

console.log('\n--- Lo que sale hacia el teléfono: solo lo que la pantalla usa ---');
// Importa porque: todo lo que manda doGet queda guardado entero, en texto plano,
// en el almacenamiento del navegador del celular. Hasta el 23/9 viajaban el
// comprobante de cada pago (texto libre: números de operación y de cuenta,
// "mismo pago que…" con el nombre de otra persona), el mail de quien regaló una
// gift card y de quién la usó, y el monto de gente que no ocupa cupo. La página
// no mostraba nada de eso. El servidor los sigue usando para sus cuentas (pagos
// compartidos, columna de verificación); al teléfono no le sirven.
{
  const { crear, cargarCon } = require('./entorno-google.js');
  const PIN_DE_PRUEBA = '314159';
  const s4 = crear({ sheetsFalso: Sheets });
  const G4 = cargarCon(s4);
  s4.PropertiesService.getScriptProperties().setProperty('PIN_HASH', G4.hashPin(PIN_DE_PRUEBA));
  const r = JSON.parse(G4.doGet({ parameter: { formato: 'json', pin: PIN_DE_PRUEBA } }).getContent());

  const QUE_NO_SALEN = {
    personas:    ['comprobante', 'idPago', 'verificado', 'esTikzet', 'fecha', 'montoTexto'],
    pendientes:  ['comprobante', 'idPago', 'verificado', 'esTikzet', 'fecha', 'montoTexto'],
    giftCards:   ['email', 'usadaPor'],
    fueraDeCupo: ['email', 'montoTexto', 'monto']
  };
  const sobrantes = (est) => {
    const vistos = [];
    const mirar = (donde, lista) => (lista || []).forEach(x => QUE_NO_SALEN[donde].forEach(k => {
      if (k in x) vistos.push(donde + '.' + k);
    }));
    (est.ediciones || []).forEach(e => { mirar('personas', e.personas); mirar('pendientes', e.pendientes); });
    mirar('giftCards', est.giftCards);
    mirar('fueraDeCupo', est.fueraDeCupo);
    return [...new Set(vistos)];
  };
  const personasDe = (est) => (est.ediciones || []).reduce((a, e) => a.concat(e.personas || []), []);

  chequear('doGet con el PIN trae personas y gift cards (si no, lo de abajo no probaría nada)',
    r.ok === true && personasDe(r.estado).length > 0 && (r.estado.giftCards || []).length > 0,
    'respuesta: ' + JSON.stringify(r).slice(0, 200));
  chequear('doGet no manda comprobantes, mails ni montos que la pantalla no muestra',
    r.ok === true && sobrantes(r.estado).length === 0,
    'salen igual: ' + (r.ok ? sobrantes(r.estado).join(', ') : r.error));

  // fueraDeCupo depende de la fecha de hoy y puede venir vacío: se prueba el
  // recorte directo, con una persona inventada.
  const completo = api.construirEstado(crudo, new Date(2026, 8, 9));
  completo.fueraDeCupo = [{ nombre: 'Persona Inventada', email: 'inventada@ejemplo.com', edicion: 'Taller inventado',
    actividad: 'Taller', montoTexto: '$ 1.234', monto: 1234, hoja: 'Inscriptos Inventados', fila: 7 }];
  const antes = JSON.stringify(completo);
  let recortado = null, error = '';
  try { recortado = api.paraElTelefono(completo); } catch (e) { error = e.message; }
  chequear('el recorte también saca lo que no se usa de "No ocupan cupo"',
    !!recortado && sobrantes(recortado).length === 0 &&
    recortado.fueraDeCupo[0].nombre === 'Persona Inventada' && recortado.fueraDeCupo[0].edicion === 'Taller inventado',
    recortado ? 'salen igual: ' + sobrantes(recortado).join(', ') : 'no hay recorte: ' + error);
  chequear('el recorte no toca el estado del servidor',
    JSON.stringify(completo) === antes,
    'construirEstado todavía usa "verificado" para las alertas: borrarlo del original rompe cuentas');

  // Lo que la página SÍ usa tiene que llegar igual. hoja y fila son la clave con
  // la que persona() encuentra a alguien; mail y celular, los botones de contacto.
  const QUE_SI_SALEN = ['nombre', 'email', 'celular', 'whatsapp', 'horario', 'medioPago', 'monto', 'saldo',
                        'estadoPago', 'veces', 'nota', 'hoja', 'fila'];
  const perdidos = [];
  if (recortado) {
    const orig = personasDe(completo), rec = personasDe(recortado);
    if (orig.length !== rec.length) perdidos.push('personas: ' + orig.length + ' → ' + rec.length);
    orig.forEach((p, i) => QUE_SI_SALEN.forEach(k => {
      if (k in p && JSON.stringify(p[k]) !== JSON.stringify((rec[i] || {})[k])) perdidos.push(k);
    }));
    if (JSON.stringify(completo.resumen) !== JSON.stringify(recortado.resumen)) perdidos.push('resumen');
    if (recortado.ediciones.some((e, i) => e.pendientes.length !== completo.ediciones[i].pendientes.length)) perdidos.push('pendientes');
    const g0 = completo.giftCards[0], g1 = recortado.giftCards[0] || {};
    ['nombre', 'deQuien', 'actividad', 'monto', 'estado', 'usada'].forEach(k => {
      if (JSON.stringify(g0[k]) !== JSON.stringify(g1[k])) perdidos.push('giftCards.' + k);
    });
  }
  chequear('y todo lo que la pantalla usa llega igual',
    !!recortado && perdidos.length === 0,
    recortado ? 'se perdió: ' + [...new Set(perdidos)].join(', ') : 'no hay recorte: ' + error);
}

console.log('\n' + (fallas === 0 ? 'LECTURA VERIFICADA' : fallas + ' FALLAS'));
process.exit(fallas ? 1 : 0);
