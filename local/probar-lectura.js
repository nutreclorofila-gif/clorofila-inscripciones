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
const Sheets = {
  Spreadsheets: {
    get: (id, opts) => {
      llamadas.push({ op: 'get', id, fields: opts && opts.fields });
      return { sheets: [
        'Clorofila — Master contactos 2026 v5 DEFINITIVO', 'Panel', 'Lista de espera',
        'Gift Cards', 'Curso Octubre 2026', 'Tapeo 07-08-2026',
        ...Object.keys(fixture.hojas)
      ].map(t => ({ properties: { title: t } })) };
    },
    Values: {
      get: (id, rango, opts) => {
        llamadas.push({ op: 'values.get', rango, render: opts.valueRenderOption });
        const base = opts.valueRenderOption === 'FORMULA' ? fixture.panelFormulas : fixture.panelValores;
        return { values: recortar(base) };
      },
      batchGet: (id, opts) => {
        llamadas.push({ op: 'batchGet', ranges: opts.ranges });
        return { valueRanges: opts.ranges.map(r => {
          const nombre = r.replace(/^'/, '').replace(/'!A:[KN]$/, '').replace(/''/g, "'");
          if (nombre === 'Lista de espera') {
            return { values: [
              ['nombre','email','celular','edición'],
              ['Ana Espera','ana@ejemplo.com','099111222','Taller de tapeo — 18/09/2026'],
              ['Beto Espera','beto@ejemplo.com','','Otro taller que no existe']
            ]};
          }
          if (nombre === 'Gift Cards') {
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
const estado = api.construirEstado(crudo, new Date(2026, 8, 9));
chequear('arma el estado completo sin explotar',
  estado.ediciones.length === 12 && estado.resumen.vigentes === 3, JSON.stringify(estado.resumen));
chequear('los 12 conteos cuadran contra el Panel',
  estado.ediciones.every(e => e.personas.length === e.anotados),
  estado.ediciones.filter(e => e.personas.length !== e.anotados).map(e => e.edicion).join(', '));
chequear('el JSON viaja al navegador sin romperse',
  JSON.parse(JSON.stringify(estado)).ediciones.length === 12, 'no serializa');

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
const repetidores = [];
estado.ediciones.forEach(e => e.personas.forEach(p => { if (p.veces > 1) repetidores.push(p.nombre + ' (' + p.veces + ')'); }));
chequear('detecta a los que vinieron más de una vez',
  repetidores.length > 0, 'no encontró ninguno, y en la planilla hay gente repetida');
console.log('        ' + [...new Set(repetidores)].slice(0, 6).join(', '));

console.log('\n' + (fallas === 0 ? 'LECTURA VERIFICADA' : fallas + ' FALLAS'));
process.exit(fallas ? 1 : 0);
