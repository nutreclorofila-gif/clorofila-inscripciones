// Qué ve Leo cuando algo falla: al abrir la app, al escribir el PIN y al tocar
// Actualizar. Carga el JavaScript real de la página, con la URL de la API
// puesta (el camino de GitHub Pages), un fetch que responde lo que le digamos,
// relojes de mentira y un DOM que recuerda lo que se pintó.
//
// Existe porque pasó: el 23/9/2026 Google devolvió un 403 en HTML (se había
// revocado el permiso del Apps Script). La app borró el PIN guardado y le pidió
// a Leo "Volvé a escribir el PIN", así que buscó el problema en su clave. Y con
// datos guardados, el cartel decía "Sin conexión… cuando tengas señal" teniendo
// señal. Ninguna prueba ejecutaba arrancar(), la puerta ni Actualizar.
const fs = require('fs'), path = require('path');
const base = path.join(__dirname, '..');
const { cargar } = require('./cargar.js');

const html = fs.readFileSync(path.join(base, 'apps-script', 'Index.html'), 'utf8');
const js = html.split('<script>')[1].split('</script>')[0].replace('<?!= datosIniciales ?>', 'null');

// Un estado inventado, armado por el mismo servidor. Nadie de acá existe.
const G = cargar();
const ESTADO = G.construirEstado({
  panelValores: [['Actividad', 'Edición', 'Cupo', 'Anotados', 'Quedan', 'Estado'],
    ['Taller de prueba', 'Taller de prueba — 20/12/2099', '10', '2', '8', 'Abierto']],
  panelFormulas: [['', '', '', '', '', ''], ['', '', '', "=COUNTIF('Inscriptos Prueba'!K:K;B2)", '', '']],
  hojas: { 'Inscriptos Prueba': [
    ['nombre', 'email', 'celular', 'actividad', 'horario', 'medio', 'comprobante', 'monto', 'verif', 'fecha', 'Edición'],
    ['Zenobia Inventada', 'zenobia@ejemplo.invalid', '', '', '', '', '', '2600', '', '', 'Taller de prueba — 20/12/2099'],
    ['Teodulfo Ficticio', 'teodulfo@ejemplo.invalid', '', '', '', '', '', '', '', '', 'Taller de prueba — 20/12/2099']] },
  extras: {}
}, new Date());

const PIN = '424242';
const HORA = 60 * 60 * 1000;

// ---------- respuestas del servidor ----------
const R = {
  json: (obj) => () => Promise.resolve({ ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify(obj)), json: () => Promise.resolve(obj) }),
  datos: () => R.json({ ok: true, estado: ESTADO }),
  error: (mensaje) => R.json({ ok: false, error: mensaje }),
  // La página de error de Google: HTML, y r.json() explota en inglés.
  html: (status) => () => Promise.resolve({ ok: false, status: status,
    text: () => Promise.resolve('<!DOCTYPE html><html><body>Error</body></html>'),
    json: () => Promise.reject(new SyntaxError('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON')) }),
  vacia: () => () => Promise.resolve({ ok: true, status: 200,
    text: () => Promise.resolve(''), json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')) }),
  // Sin señal, o Google sin cabeceras CORS: Safari dice "Load failed".
  sinRed: () => () => Promise.reject(new TypeError('Load failed')),
  // Se corta la señal a mitad de la respuesta: llegó el encabezado, no el cuerpo.
  cortada: () => () => Promise.resolve({ ok: true, status: 200,
    text: () => Promise.reject(new TypeError('Load failed')), json: () => Promise.reject(new TypeError('Load failed')) }),
  // Una respuesta que llega cuando la prueba lo dice.
  diferida: (control) => () => new Promise((res) => { control.soltar = () => R.datos()().then(res); }),
  // Señal débil: el pedido queda colgado hasta que alguien lo corte.
  colgado: () => (opts) => new Promise((res, rej) => {
    const s = opts && opts.signal;
    if (s) s.addEventListener('abort', () => rej(new DOMException('The user aborted a request.', 'AbortError')));
  })
};

const MENSAJES = {
  pinMal: 'PIN incorrecto.',
  intentos: 'Demasiados intentos fallados. Probá de nuevo en 15 minutos.',
  sinConfigurar: 'Falta configurar el PIN: ejecutá configurarPin() una vez desde el editor.',
  cuota: 'Google frenó las consultas por unos minutos. Probá de nuevo en un rato. (Google dijo: "quota")',
  pestana: 'Le cambiaron el nombre a una pestaña que la app necesita, o la borraron. (Google dijo: "Unable to parse range")'
};

// ---------- el teléfono de mentira ----------
function montar(op) {
  op = op || {};
  const almacen = {};
  if (op.pin) almacen.clorofila_pin = op.pin;
  if (op.cache) almacen.clorofila_ultimo = JSON.stringify({ pin: op.cachePin || op.pin || PIN, estado: ESTADO, cuando: Date.now() - op.cache });
  const localStorage = {
    getItem: (k) => (k in almacen ? almacen[k] : null),
    setItem: (k, v) => { almacen[k] = String(v); },
    removeItem: (k) => { delete almacen[k]; }
  };

  const nodos = {};
  function nuevoNodo(id) {
    const clases = new Set(), oyentes = {};
    const n = {
      id: id, value: '', disabled: false, dataset: {}, _html: '', _texto: '',
      classList: { add: (c) => clases.add(c), remove: (c) => clases.delete(c), contains: (c) => clases.has(c) },
      addEventListener: (ev, fn) => { (oyentes[ev] = oyentes[ev] || []).push(fn); },
      disparar: (ev, datos) => (oyentes[ev] || []).forEach(fn => fn.call(n, Object.assign({ target: n }, datos || {}))),
      focus() {}, appendChild() {}, removeChild() {}, select() {},
      querySelector: () => null, querySelectorAll: () => [], closest: () => null, style: {}
    };
    Object.defineProperty(n, 'innerHTML', {
      get: () => n._html,
      set: (v) => {
        n._html = String(v);
        n._texto = n._html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        // Lo que se pinta adentro reemplaza a los nodos que había con esos ids.
        const re = /id="([^"]+)"[^>]*>([^<]*)/g;
        let m;
        while ((m = re.exec(n._html))) {
          const hijo = nuevoNodo(m[1]);
          hijo._texto = m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
          nodos[m[1]] = hijo;
        }
      }
    });
    Object.defineProperty(n, 'textContent', {
      get: () => n._texto,
      set: (v) => { n._texto = String(v); n._html = n._texto; }
    });
    // Como en el HTML de verdad: los botones de la cabecera arrancan con sus clases.
    if (id === 'btnRefrescar' || id === 'btnSalir' || id === 'error') {
      const etiqueta = (html.match(new RegExp('<[^>]*id="' + id + '"[^>]*>')) || [''])[0];
      ((etiqueta.match(/class="([^"]*)"/) || [])[1] || '').split(/\s+/).filter(Boolean).forEach(c => clases.add(c));
      if (id === 'btnRefrescar') n._texto = 'Actualizar';
    }
    return n;
  }
  const nodo = (id) => nodos[id] || (nodos[id] = nuevoNodo(id));
  const document = {
    getElementById: nodo,
    querySelector: () => nuevoNodo(''), querySelectorAll: () => [],
    createElement: () => nuevoNodo(''), body: nuevoNodo('body'), addEventListener() {},
    execCommand() {}
  };

  // Relojes a mano: nada vence hasta que la prueba lo diga.
  let relojes = [], sigId = 1;
  const setTimeout = (fn, ms) => { const id = sigId++; relojes.push({ id, fn, ms: ms || 0 }); return id; };
  const clearTimeout = (id) => { relojes = relojes.filter(r => r.id !== id); };
  const pasar = (ms) => {
    const ya = relojes.filter(r => r.ms <= ms);
    relojes = relojes.filter(r => r.ms > ms);
    ya.forEach(r => r.fn());
  };

  const cola = (op.respuestas || []).slice();
  const pedidos = [];
  const fetch = (url, opciones) => {
    pedidos.push({ url, opciones });
    const r = cola.shift();
    if (!r) return new Promise(() => {});
    return r(opciones);
  };

  const navigator = { onLine: op.onLine !== false, clipboard: null };
  const window = { AbortController, addEventListener() {}, confirm: () => true, scrollTo() {}, location: { href: '' } };

  const api = new Function('document', 'localStorage', 'window', 'navigator', 'setTimeout', 'clearTimeout', 'fetch',
    "var URL_API = 'https://api.prueba.invalid/exec';\n" + js +
    '\nreturn { ver: function () { return { DATOS: DATOS, DESDE_CACHE: DESDE_CACHE }; },' +
    ' solapa: function (s) { SOLAPA = s; pintarPanel(); } };')
    (document, localStorage, window, navigator, setTimeout, clearTimeout, fetch);

  return {
    api, almacen, pedidos, nodo, pasar,
    agregar: (r) => cola.push(r),
    puerta: () => /class="puerta"/.test(nodo('panel').innerHTML),
    panel: () => nodo('panel').textContent,
    abierta: () => !!api.ver().DATOS && !/class="puerta"/.test(nodo('panel').innerHTML)
  };
}

const esperar = () => new Promise(r => setImmediate(r));
async function asentar() { for (let i = 0; i < 8; i++) await esperar(); }

let fallas = 0, corridos = 0;
function caso(nombre, ok, detalle) {
  corridos++;
  if (ok) { console.log('  ok    ' + nombre); return; }
  fallas++;
  console.log('  FALLA ' + nombre + (detalle !== undefined ? '\n        ' + JSON.stringify(detalle).slice(0, 400) : ''));
}
// Lo que el motor del navegador dice en inglés no le sirve a Leo.
const JERGA = /Unexpected|JSON|token|Load failed|Failed to fetch|NetworkError|AbortError|aborted/i;

(async () => {
  console.log('\n--- Al abrir la app, con el PIN guardado y sin datos guardados ---');
  {
    const t = montar({ pin: PIN, respuestas: [R.error(MENSAJES.pinMal)] });
    await asentar();
    caso('"PIN incorrecto" borra el PIN y pide escribirlo', t.puerta() && !('clorofila_pin' in t.almacen), t.almacen);
  }
  for (const [nombre, resp, busca] of [
    ['"Demasiados intentos"', R.error(MENSAJES.intentos), /Demasiados intentos/],
    ['"Falta configurar el PIN"', R.error(MENSAJES.sinConfigurar), /Falta configurar/],
    ['Google frenó las consultas', R.error(MENSAJES.cuota), /Google frenó/],
    ['un 403 en HTML de Google', R.html(403), /Google/],
    ['un 500 en HTML de Google', R.html(500), /Google/],
    ['una respuesta vacía', R.vacia(), /Google/]
  ]) {
    const t = montar({ pin: PIN, respuestas: [resp] });
    await asentar();
    const texto = t.panel();
    caso(nombre + ': el PIN sigue guardado', t.almacen.clorofila_pin === PIN, t.almacen);
    caso(nombre + ': no pide el PIN de nuevo', !t.puerta() && !/Volvé a escribir/.test(texto), texto);
    caso(nombre + ': dice el motivo, en castellano', busca.test(texto) && !JERGA.test(texto) && !/Sin conexión/.test(texto), texto);
  }
  {
    const t = montar({ pin: PIN, respuestas: [R.sinRed()], onLine: false });
    await asentar();
    const texto = t.panel();
    caso('sin señal: el PIN sigue guardado', t.almacen.clorofila_pin === PIN, t.almacen);
    caso('sin señal: lo dice, sin inglés', /señal/i.test(texto) && !JERGA.test(texto) && !t.puerta(), texto);
  }
  {
    // Con "señal" según el teléfono, pero el pedido rebota: puede ser Google
    // sin cabeceras (el 403 real llega así), no necesariamente la señal.
    const t = montar({ pin: PIN, respuestas: [R.sinRed()], onLine: true });
    await asentar();
    const texto = t.panel();
    caso('el pedido rebota con señal: no culpa solo a la señal ni habla en inglés',
      /Google/.test(texto) && !JERGA.test(texto) && t.almacen.clorofila_pin === PIN, texto);
  }
  {
    const t = montar({ pin: PIN, respuestas: [R.error(MENSAJES.intentos), R.datos()] });
    await asentar();
    const boton = t.nodo('reintentar');
    boton.disparar('click');
    await asentar();
    caso('el botón Reintentar vuelve a pedir y abre la app', t.pedidos.length === 2 && t.abierta(), t.pedidos.length);
  }
  {
    const t = montar({ pin: PIN, respuestas: [R.json({ ok: false })] });
    await asentar();
    caso('una respuesta {ok:false} no se toma como datos', !t.api.ver().DATOS);
  }

  console.log('\n--- Al abrir la app, con datos guardados de hace 2 h ---');
  {
    const t = montar({ pin: PIN, cache: 2 * HORA, respuestas: [R.error(MENSAJES.pestana)] });
    await asentar();
    const texto = t.panel();
    caso('error del servidor: muestra lo guardado', t.abierta());
    caso('error del servidor: el cartel dice el motivo y no culpa a la señal',
      /cambiaron el nombre a una pestaña/.test(texto) && !/Sin conexión|cuando tengas señal/.test(texto), texto);
    caso('error del servidor: sigue diciendo de cuándo es', /hace 2 h/.test(texto), texto);
  }
  {
    const t = montar({ pin: PIN, cache: 2 * HORA, respuestas: [R.html(403)] });
    await asentar();
    const texto = t.panel();
    caso('403 en HTML: muestra lo guardado y habla de Google, sin inglés',
      t.abierta() && /Google/.test(texto) && !JERGA.test(texto) && !/cuando tengas señal/.test(texto), texto);
  }
  {
    const t = montar({ pin: PIN, cache: 2 * HORA, respuestas: [R.sinRed()], onLine: false });
    await asentar();
    const texto = t.panel();
    caso('sin señal: muestra lo guardado y dice que no hay señal', t.abierta() && /señal/.test(texto) && !JERGA.test(texto), texto);
  }
  {
    // Leo cambió el PIN porque perdió el teléfono: lo guardado tiene que irse.
    const t = montar({ pin: PIN, cache: 2 * HORA, respuestas: [R.error(MENSAJES.pinMal)] });
    await asentar();
    caso('"PIN incorrecto": pide el PIN y NO muestra lo guardado', t.puerta() && !t.api.ver().DATOS);
    caso('"PIN incorrecto": borra el PIN y los datos del teléfono', Object.keys(t.almacen).length === 0, Object.keys(t.almacen));
  }

  console.log('\n--- Con señal débil: el pedido queda colgado ---');
  {
    const t = montar({ pin: PIN, cache: 1 * HORA, respuestas: [R.colgado()] });
    await asentar();
    const texto = t.panel();
    caso('lo guardado se ve enseguida, sin esperar la respuesta', t.abierta(), texto);
    caso('y avisa que está buscando lo nuevo', /Actualizando/.test(texto) && /hace 1 h/.test(texto), texto);
    t.nodo('btnRefrescar').disparar('click');
    await asentar();
    caso('Actualizar no dispara un segundo pedido mientras espera', t.pedidos.length === 1, t.pedidos.length);
    caso('el pedido lleva límite de espera', !!(t.pedidos[0].opciones && t.pedidos[0].opciones.signal));
    t.pasar(10 * 60 * 1000);
    await asentar();
    const despues = t.panel();
    caso('si no contesta a tiempo, corta y lo dice', /no contestó a tiempo/.test(despues) && t.abierta() && !JERGA.test(despues), despues);
    caso('el PIN sigue guardado', t.almacen.clorofila_pin === PIN);
  }
  {
    const t = montar({ pin: PIN, respuestas: [R.colgado()] });
    await asentar();
    caso('sin datos guardados: dice que está buscando', /Buscando/.test(t.panel()), t.panel());
    caso('y Actualizar no está a la vista mientras tanto', t.nodo('btnRefrescar').classList.contains('oculto'));
    t.pasar(10 * 1000);
    await asentar();
    caso('pasado un rato, avisa que la planilla todavía no contestó', /todavía no contestó/i.test(t.panel()), t.panel());
    t.pasar(10 * 60 * 1000);
    await asentar();
    const texto = t.panel();
    caso('al final corta, con el motivo y sin pedir el PIN',
      /no contestó a tiempo/.test(texto) && !t.puerta() && t.almacen.clorofila_pin === PIN, texto);
  }
  {
    // Se muestra lo guardado y enseguida llega la respuesta buena: la reemplaza.
    const t2 = montar({ pin: PIN, cache: 1 * HORA, respuestas: [R.datos()] });
    await asentar();
    caso('cuando llegan los datos nuevos, el cartel de viejos desaparece',
      t2.abierta() && !/class="viejo"/.test(t2.nodo('panel').innerHTML) && !t2.api.ver().DESDE_CACHE, t2.panel());
    caso('y Actualizar vuelve a estar disponible', !t2.nodo('btnRefrescar').disabled && !t2.nodo('btnRefrescar').classList.contains('oculto'));
  }

  {
    const t = montar({ pin: PIN, respuestas: [R.cortada()] });
    await asentar();
    const texto = t.panel();
    caso('la señal se corta a mitad de la respuesta: lo dice enseguida, sin esperar el corte',
      /Google|señal/.test(texto) && !/Buscando/.test(texto) && !JERGA.test(texto), texto);
  }
  {
    // Tocó Salir mientras se buscaba: lo que llega después no puede volver a
    // guardarse ni abrir la app, o Salir no sirve justo cuando más apuro hay.
    const control = {};
    const t = montar({ pin: PIN, cache: 1 * HORA, respuestas: [R.diferida(control)] });
    await asentar();
    t.nodo('btnSalir').disparar('click');
    control.soltar();
    await asentar();
    caso('Salir mientras busca: lo que llega después no se guarda', Object.keys(t.almacen).length === 0, Object.keys(t.almacen));
    caso('Salir mientras busca: queda en la puerta', t.puerta() && !t.api.ver().DATOS);
  }

  console.log('\n--- La puerta: escribir el PIN y tocar Entrar ---');
  async function entrar(t, pin) {
    t.nodo('pin').value = pin;
    t.nodo('entrar').disparar('click');
    await asentar();
  }
  {
    const t = montar({ respuestas: [R.html(403)] });
    await asentar();
    await entrar(t, PIN);
    const aviso = t.nodo('malPin').textContent;
    caso('403 en HTML: lo dice en castellano, sin "Sin conexión"', /Google/.test(aviso) && !JERGA.test(aviso) && !/Sin conexión/.test(aviso), aviso);
    caso('403 en HTML: no borra lo que escribió', t.nodo('pin').value === PIN, t.nodo('pin').value);
  }
  {
    const t = montar({ respuestas: [R.error(MENSAJES.pinMal)] });
    await asentar();
    await entrar(t, '111111');
    caso('"PIN incorrecto": lo dice y vacía el campo', /PIN incorrecto/.test(t.nodo('malPin').textContent) && t.nodo('pin').value === '');
    caso('"PIN incorrecto": no guarda nada', Object.keys(t.almacen).length === 0, Object.keys(t.almacen));
  }
  {
    const t = montar({ cache: 2 * HORA, respuestas: [R.error(MENSAJES.pestana)] });
    await asentar();
    await entrar(t, PIN);
    caso('con datos guardados de ese PIN y error del servidor: los muestra con el motivo',
      t.abierta() && /cambiaron el nombre a una pestaña/.test(t.panel()), t.panel());
  }
  {
    const t = montar({ cache: 2 * HORA, respuestas: [R.error(MENSAJES.pinMal)] });
    await asentar();
    await entrar(t, PIN);
    caso('"PIN incorrecto" con datos guardados: no los muestra', !t.api.ver().DATOS && t.puerta());
  }
  {
    const t = montar({ respuestas: [R.json({ ok: false })] });
    await asentar();
    await entrar(t, PIN);
    caso('una respuesta {ok:false} no deja entrar', !t.api.ver().DATOS && t.puerta());
  }

  console.log('\n--- El botón Actualizar, con la app abierta ---');
  async function abierta(respuestaDespues) {
    const t = montar({ pin: PIN, respuestas: [R.datos(), respuestaDespues] });
    await asentar();
    t.nodo('btnRefrescar').disparar('click');
    await asentar();
    return t;
  }
  {
    const t = await abierta(R.html(403));
    const caja = t.nodo('error');
    caso('403 en HTML: avisa en castellano y no pide el PIN',
      !caja.classList.contains('oculto') && /Google/.test(caja.textContent) && !JERGA.test(caja.textContent) && !t.puerta(), caja.textContent);
    caso('403 en HTML: el PIN sigue guardado', t.almacen.clorofila_pin === PIN);
  }
  {
    const t = await abierta(R.error(MENSAJES.sinConfigurar));
    caso('"Falta configurar el PIN": no borra el PIN guardado', t.almacen.clorofila_pin === PIN && !t.puerta(), t.almacen);
  }
  {
    const t = await abierta(R.error(MENSAJES.pinMal));
    caso('"PIN incorrecto": pide el PIN', t.puerta());
    caso('"PIN incorrecto": borra el PIN y los datos del teléfono', Object.keys(t.almacen).length === 0, Object.keys(t.almacen));
  }

  console.log('\n--- El cartel de datos viejos, en las cuatro solapas ---');
  {
    const t = montar({ pin: PIN, cache: 30 * HORA, respuestas: [R.sinRed()], onLine: false });
    await asentar();
    for (const s of ['cupos', 'plata', 'gente', 'alertas']) {
      if (!t.api.ver().DATOS) { caso('solapa ' + s + ': hay datos guardados para mostrar', false); continue; }
      t.api.solapa(s);
      caso('solapa ' + s + ': tiene el cartel', /class="viejo"/.test(t.nodo('panel').innerHTML), t.panel().slice(0, 120));
    }
    const t2 = montar({ pin: PIN, cache: 26 * HORA, respuestas: [R.sinRed()], onLine: false });
    await asentar();
    caso('dice "hace 1 día", no "hace 1 días"', /hace 1 día\b/.test(t2.panel()) && !/hace 1 días/.test(t2.panel()), t2.panel());
  }

  console.log('\n--- Los colores ---');
  {
    // Una variable que no existe no da error: el color se hereda sin avisar.
    // Así quedó el botón Salir con el color del texto en vez del gris.
    const definidas = new Set((html.match(/--[\w-]+(?=\s*:)/g) || []));
    const usadas = [...new Set((html.match(/var\((--[\w-]+)\)/g) || []).map(v => v.slice(4, -1)))];
    const faltan = usadas.filter(v => !definidas.has(v));
    caso('toda variable de color que se usa está definida', faltan.length === 0, faltan);
  }

  console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
  if (fallas) process.exit(1);
})().catch(e => { console.log('FALLA la prueba explotó: ' + (e && e.stack || e)); process.exit(1); });
