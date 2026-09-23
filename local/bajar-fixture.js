// Baja los datos reales de la Master Sheet a local/fixture.json hablando
// directo con el MCP de Google Drive por stdio. No imprime credenciales.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const ID = '1C3UfC__jr3F0x_XWp5lRvL47MLjQqOwTa9wURKuXZBQ';
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
const srv = cfg.mcpServers['google-drive'];

const proc = spawn(srv.command, srv.args || [], {
  env: { ...process.env, ...(srv.env || {}) },
  stdio: ['pipe', 'pipe', 'inherit']
});

let buf = '';
const pend = new Map();
proc.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const linea = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!linea.startsWith('{')) continue;
    let m; try { m = JSON.parse(linea); } catch { continue; }
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  }
});

let seq = 1;
const enviar = (method, params) => new Promise((res, rej) => {
  const id = seq++;
  pend.set(id, m => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result));
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  setTimeout(() => pend.has(id) && (pend.delete(id), rej(new Error('timeout ' + method))), 90000);
});

const leer = async (rango, render) => {
  const r = await enviar('tools/call', {
    name: 'sheets-get-values',
    arguments: { spreadsheetId: ID, range: rango, valueRenderOption: render }
  });
  return JSON.parse(r.content[0].text).values || [];
};

// Sheets omite las celdas vacías del final de cada fila; el fixture tiene que
// tener la grilla completa para imitar getDisplayValues().
const rellenar = (filas, ancho) =>
  filas.map(f => Array.from({ length: ancho }, (_, i) => (f[i] === undefined ? '' : String(f[i]))));

(async () => {
  await enviar('initialize', {
    protocolVersion: '2024-11-05', capabilities: {},
    clientInfo: { name: 'fixture', version: '1' }
  });
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // Las pestañas se descubren igual que en leerPlanilla(): las que empiezan con
  // "Inscriptos", más las que nombren las fórmulas del Panel. Antes estaban
  // escritas a mano, y la primera pestaña de un mes nuevo quedaba afuera de la
  // prueba con datos reales sin que nada avisara.
  const meta = await enviar('tools/call', {
    name: 'sheets-get-spreadsheet', arguments: { spreadsheetId: ID }
  });
  const titulos = (JSON.parse(meta.content[0].text).sheets || []).map(h => h.title);
  const norm = n => String(n).trim().toLowerCase();
  const buscar = nombre => titulos.find(t => norm(t) === norm(nombre));
  const citar = n => "'" + String(n).replace(/'/g, "''") + "'";

  const panel = buscar('Panel');
  if (!panel) throw new Error('no hay pestaña Panel. Pestañas: ' + titulos.join(', '));
  // Mismo tope que FILAS_PANEL en Codigo.gs.
  const panelFormulas = rellenar(await leer(citar(panel) + '!A1:F500', 'FORMULA'), 6);
  const panelValores = rellenar(await leer(citar(panel) + '!A1:F500', 'FORMATTED_VALUE'), 6);

  const nombradas = new Set();
  panelFormulas.forEach(f => {
    const re = /'((?:[^']|'')+)'!|([A-Za-zÁÉÍÓÚáéíóúÑñ0-9_]+)!/g;
    let m;
    while ((m = re.exec(String(f[3] || '')))) nombradas.add(norm((m[1] || m[2]).replace(/''/g, "'")));
  });
  const ignoradas = ['lista de espera', 'gift cards', 'panel'];
  const aLeer = titulos.filter(t => !ignoradas.includes(norm(t)) &&
    (/^inscriptos /i.test(String(t).trim()) || nombradas.has(norm(t))));

  const hojas = {};
  for (const h of aLeer) hojas[h] = rellenar(await leer(citar(h) + '!A:K', 'FORMATTED_VALUE'), 11);

  // La lista de espera y las gift cards también, con el mismo ancho que usa la
  // app (hasta la N). Sin ellas la prueba con datos reales nunca las veía.
  const extras = {};
  for (const nombre of ['Lista de espera', 'Gift Cards']) {
    const real = buscar(nombre);
    if (real) extras[nombre] = rellenar(await leer(citar(real) + '!A:N', 'FORMATTED_VALUE'), 14);
  }

  const fixture = { panelValores, panelFormulas, hojas, extras, generadoEn: new Date().toISOString() };

  fs.writeFileSync(path.join(__dirname, 'fixture.json'), JSON.stringify(fixture, null, 1));
  console.log('fixture.json escrito:',
    fixture.panelValores.length, 'filas de Panel |',
    Object.entries(hojas).map(([k, v]) => `${k}: ${v.length - 1}`).join(' | '), '|',
    Object.entries(extras).map(([k, v]) => `${k}: ${v.length - 1}`).join(' | '));
  proc.kill();
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); proc.kill(); process.exit(1); });
