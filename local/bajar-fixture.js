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

  const hojasInscriptos = ['Inscriptos Agosto 2026', 'Inscriptos Septiembre 2026', 'Inscriptos Octubre 2026'];
  const hojas = {};
  for (const h of hojasInscriptos) {
    hojas[h] = rellenar(await leer(`${h}!A1:K200`, 'FORMATTED_VALUE'), 11);
  }

  const fixture = {
    panelValores: rellenar(await leer('Panel!A1:F40', 'FORMATTED_VALUE'), 6),
    panelFormulas: rellenar(await leer('Panel!A1:F40', 'FORMULA'), 6),
    hojas,
    generadoEn: new Date().toISOString()
  };

  fs.writeFileSync(path.join(__dirname, 'fixture.json'), JSON.stringify(fixture, null, 1));
  console.log('fixture.json escrito:',
    fixture.panelValores.length, 'filas de Panel |',
    Object.entries(hojas).map(([k, v]) => `${k}: ${v.length - 1}`).join(' | '));
  proc.kill();
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); proc.kill(); process.exit(1); });
