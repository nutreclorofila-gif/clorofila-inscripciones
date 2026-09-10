// Stubs de los servicios de Google que usa Codigo.gs, para poder probar en Node.
const crypto = require('crypto');

function crear({ sheetsFalso } = {}) {
  const props = new Map();
  const cache = new Map();
  return {
    Sheets: sheetsFalso,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, v)
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
        remove: k => cache.delete(k)
      })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      // Apps Script devuelve bytes con signo (-128..127); se replica para que el
      // hasheo del PIN se pruebe con los mismos valores que en producción.
      computeDigest: (_alg, texto) =>
        [...crypto.createHash('sha256').update(texto, 'utf8').digest()]
          .map(b => (b > 127 ? b - 256 : b))
    },
    HtmlService: {}, SpreadsheetApp: undefined, console
  };
}

function cargarCon(sandbox) {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8');
  const decl = (src.match(/^(?:function|var)\s+([A-Za-z_$][\w$]*)/gm) || [])
    .map(l => l.replace(/^(?:function|var)\s+/, ''));
  return new Function(...Object.keys(sandbox),
    src + '\nreturn {' + decl.map(n => n + ':' + n).join(',') + '};'
  ).call({}, ...Object.values(sandbox));
}

module.exports = { crear, cargarCon };
