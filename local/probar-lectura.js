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
          const nombre = r.replace(/^'|'!A:K$/g, '').replace(/''/g, "'");
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

chequear('NO lee "Lista de espera" ni "Gift Cards"',
  !leidas.includes('Lista de espera') && !leidas.includes('Gift Cards'),
  'no ocupan cupo; contarlas rompería todos los números. Leyó: ' + leidas.join(', '));

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

console.log('\n' + (fallas === 0 ? 'LECTURA VERIFICADA' : fallas + ' FALLAS'));
process.exit(fallas ? 1 : 0);
