// Carga Codigo.gs en Node con stubs de las APIs de Google, para poder probar
// la lógica sin desplegar nada.
const fs = require('fs');
const path = require('path');

function cargar() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');
  const sandbox = {
    SpreadsheetApp: { openById: () => { throw new Error('sin Google en modo local'); } },
    HtmlService: { createTemplateFromFile: () => { throw new Error('sin Google en modo local'); } },
    Utilities: {},
    console
  };
  const fn = new Function(...Object.keys(sandbox), src + '\n;return this;');
  const ctx = fn.call({}, ...Object.values(sandbox));
  // Recupera las funciones y constantes declaradas con var/function.
  const api = {};
  const nombres = src.match(/^(?:function|var)\s+([A-Za-z_$][\w$]*)/gm) || [];
  const decl = nombres.map(l => l.replace(/^(?:function|var)\s+/, ''));
  const fn2 = new Function(...Object.keys(sandbox), src + '\nreturn {' + decl.map(n => n + ':' + n).join(',') + '};');
  Object.assign(api, fn2.call({}, ...Object.values(sandbox)));
  return api;
}

module.exports = { cargar };
