/**
 * Clorofila — Inscripciones en el celu
 * ------------------------------------
 * App web SOLO LECTURA. No escribe nada en la planilla.
 * Lee la Master Sheet y arma el estado de cada edición: cupos, plata y gente.
 *
 * Se despliega como "Aplicación web" (Implementar → Nueva implementación):
 *   Ejecutar como: Yo (nutreclorofila@gmail.com)
 *   Quién tiene acceso: Cualquiera
 *
 * Ese "cualquiera" es a propósito y NO significa que los datos estén a la vista.
 * Tiene que ser así porque la app se sirve desde otra dirección (GitHub Pages) y
 * el navegador llama a este servidor sin sesión de Google; con "solo yo" esas
 * llamadas vuelven 403 y la app no carga nunca. Lo que cuida los datos es que la
 * página se sirve vacía y nada sale de acá hasta que llega el PIN correcto.
 *
 * Toda la lógica de cálculo vive en funciones puras que reciben los datos ya
 * leídos, así se puede probar sin Google (ver local/probar.js).
 */

var ID_PLANILLA = '1C3UfC__jr3F0x_XWp5lRvL47MLjQqOwTa9wURKuXZBQ';

/**
 * Precios de referencia. Solo se usan para calcular SALDO del curso de cocina,
 * que es donde hay un precio fijo conocido. Los talleres tienen precio variable
 * (Tikzet cobra distinto según la edición), así que ahí no se calcula deuda:
 * se muestra si hay pago cargado o no.
 */
var PRECIOS = {
  cursoTotal: 12200,
  cursoCuota: 4800,
  // Por debajo de esto no es un pago del curso sino un monto mal leído: "2
  // entradas 10400" se lee como 2, y la app decía "Seña, le falta $ 12.198". La
  // seña real más chica que hubo fue de $ 2.000, así que el piso no toca a nadie.
  cursoMinimo: 1000
};

/**
 * Hasta qué fila del Panel se lee. La app está pensada para usarse siempre, y
 * cada taller o curso nuevo suma una fila: con un tope corto, en algún momento
 * las ediciones nuevas dejarían de aparecer sin que nadie se entere. Leer de más
 * no cuesta nada — la API no devuelve las filas vacías.
 */
var FILAS_PANEL = 500;

/** Pestañas que NO son ediciones y no cuentan en ningún cupo. */
var HOJAS_IGNORADAS = ['Lista de espera', 'Gift Cards', 'Panel'];

/** De acá salen todas las ediciones: sin esta pestaña la app no tiene nada que mostrar. */
var HOJA_PANEL = 'Panel';

/**
 * Pestañas que no ocupan cupo pero sí hay que mirar: cuando un taller se llena,
 * lo que se necesita es a quién llamar; y una gift card vendida es plata cobrada
 * y un lugar que alguien va a usar más adelante.
 */
var HOJA_ESPERA = 'Lista de espera';
var HOJA_GIFT = 'Gift Cards';

/** Prefijos de la columna K que son intencionales, no errores de carga. */
var PREFIJOS_INTENCIONALES = ['Reubicado', 'Lista de espera', 'Cancelado', 'Anulado', 'Gift card'];


/* ======================================================================
   1. ENTRADA WEB
   ====================================================================== */

/**
 * Los errores de la API de Sheets llegan en inglés y no dicen qué hacer
 * ("Unable to parse range: Panel!A1:F500"). Acá se traducen a algo accionable.
 * El texto original va entre paréntesis, que sirve cuando hay que buscar el
 * problema de verdad.
 */
function explicarError(err) {
  var m = String((err && err.message) || err || 'Error desconocido');

  // Los mensajes que escribe esta app ya están en castellano y ya explican.
  if (/^(PIN|El PIN|Falta configurar|Demasiados intentos|No encuentro|Escribí el PIN)/.test(m)) return m;

  var causas = [
    [/unable to parse range|invalid range|rango/i,
     'Le cambiaron el nombre a una pestaña que la app necesita, o la borraron.'],
    [/requested entity was not found|not found|notfound/i,
     'No encuentro la planilla. Fijate si la movieron, la borraron o cambió el ID.'],
    [/permission|forbidden|not authorized|no tiene autorización/i,
     'La cuenta que corre la app perdió el acceso a la planilla.'],
    [/quota|rate limit|too many requests|429/i,
     'Google frenó las consultas por unos minutos. Probá de nuevo en un rato.'],
    [/timeout|deadline|exceeded maximum execution time/i,
     'La planilla tardó demasiado en responder. Probá de nuevo.'],
    [/service invoked too many times|servicio/i,
     'Google limitó la app por hoy. Vuelve a andar sola mañana.'],
    [/sheets is not defined|advanced service/i,
     'Falta activar el servicio Sheets en el proyecto de Apps Script (Servicios → Sheets API v4).']
  ];
  for (var i = 0; i < causas.length; i++) {
    if (causas[i][0].test(m)) return causas[i][1] + ' (Google dijo: "' + m + '")';
  }
  return m;
}

function doGet(e) {
  var p = (e && e.parameter) || {};

  // Único modo que devuelve algo: el estado como JSON, con el PIN. La app vive en
  // GitHub Pages porque abrirla en script.google.com falla en navegadores con
  // varias cuentas de Google, que es el caso de este equipo. ContentService sí
  // manda las cabeceras CORS que hacen falta; HtmlService no.
  if (p.formato === 'json') {
    var salida;
    try {
      // El PIN NO se puede fijar desde acá, solo con configurarPin() en el editor.
      // Antes había un ?configurar= que aceptaba el primer PIN que llegara si no
      // había ninguno guardado: justo al cambiarlo (borrar el viejo, poner el
      // nuevo) quedaba una ventana en la que cualquiera con la URL ponía el suyo.
      verificarPin(p.pin);
      salida = { ok: true, estado: construirEstado(leerPlanilla()) };
    } catch (err) {
      salida = { ok: false, error: explicarError(err) };
    }
    return ContentService
      .createTextOutput(JSON.stringify(salida))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Fuera del modo JSON no se sirve NINGUNA página, y eso es lo que cierra la
  // puerta. Una página de HtmlService trae google.script.run, que deja llamar
  // desde el navegador a cualquier función de este archivo que no termine en
  // "_" — leerPlanilla() incluida, sin pasar por el PIN. Mientras se servía la
  // app desde acá, cualquiera con esta URL (que es pública: está en la página de
  // GitHub Pages) podía leer la planilla entera. La app vive en GitHub Pages y
  // habla solo por el modo JSON de arriba, que siempre pide el PIN.
  return ContentService.createTextOutput(
    'Clorofila — Inscripciones. Esta dirección solo responde a la app; ' +
    'no muestra nada por sí sola.');
}


/* ======================================================================
   1-bis. PIN
   ----------------------------------------------------------------------
   La app está publicada con acceso anónimo a propósito: pedir cuenta de
   Google la vuelve inusable cuando el navegador tiene varias sesiones
   abiertas (pasa en el Chrome de escritorio, con tres cuentas). El PIN
   reemplaza esa puerta: la URL sola no muestra nada.
   ====================================================================== */

var PROP_PIN = 'PIN_HASH';
var MAX_INTENTOS = 8;

function verificarPin(pin) {
  var cache = CacheService.getScriptCache();
  var intentos = Number(cache.get('intentos_pin') || 0);
  if (intentos >= MAX_INTENTOS) {
    throw new Error('Demasiados intentos fallados. Probá de nuevo en 15 minutos.');
  }

  var guardado = PropertiesService.getScriptProperties().getProperty(PROP_PIN);
  if (!guardado) {
    throw new Error('Falta configurar el PIN: ejecutá configurarPin() una vez desde el editor.');
  }

  if (hashPin(String(pin === null || pin === undefined ? '' : pin)) !== guardado) {
    cache.put('intentos_pin', String(intentos + 1), 900);
    throw new Error('PIN incorrecto.');
  }
  cache.remove('intentos_pin');
}

/** Nunca se guarda el PIN en claro, ni en el código ni en las propiedades. */
function hashPin(pin) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, pin + '|clorofila-inscripciones|v1', Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b & 0xFF) + 0x100).toString(16).slice(1); }).join('');
}

/**
 * Fija o cambia el PIN. Es el ÚNICO camino: se ejecuta desde el editor de Apps
 * Script, con el PIN escrito en PIN_NUEVO. Pisa el que haya sin tener que
 * borrarlo antes, así que nunca queda un momento sin PIN. Después de correrla
 * hay que volver a dejar 'PONER_ACA' (y no guardar nunca el número en el repo):
 * lo que queda guardado es el hash, no el número.
 */
function configurarPin() {
  var PIN_NUEVO = 'PONER_ACA';
  if (PIN_NUEVO === 'PONER_ACA') throw new Error('Escribí el PIN en la constante PIN_NUEVO y volvé a ejecutar.');
  PropertiesService.getScriptProperties().setProperty(PROP_PIN, hashPin(PIN_NUEVO));
  return 'PIN configurado.';
}

/* ======================================================================
   2. LECTURA (única parte que toca Google)
   ====================================================================== */

/**
 * Lee la planilla con la API de Sheets (servicio avanzado "Sheets").
 *
 * NO se usa SpreadsheetApp: `SpreadsheetApp.openById` exige el scope
 * `.../auth/spreadsheets`, que da permiso de LECTURA Y ESCRITURA sobre todas las
 * planillas de la cuenta. Esta app no escribe nada y no tiene por qué poder
 * hacerlo: la Master Sheet es el corazón del negocio. El servicio avanzado sí
 * funciona con `spreadsheets.readonly`, así que un error de código —o alguien
 * que edite el script— no puede tocar un solo dato.
 */
function leerPlanilla() {
  var meta = Sheets.Spreadsheets.get(ID_PLANILLA, { fields: 'sheets.properties.title' });
  var titulos = (meta.sheets || []).map(function (h) { return h.properties.title; });

  // Se busca por nombre real y no fijo: si un día la pestaña se llamara "PANEL"
  // o "panel", con el nombre fijo la app se rompía entera con un error de Google
  // en inglés que no dice qué pasó.
  var panelReal = buscarHoja(titulos, HOJA_PANEL);
  if (!panelReal) {
    throw new Error('No encuentro la pestaña "' + HOJA_PANEL + '" en la planilla, y de ahí salen ' +
      'todas las ediciones. Las pestañas que hay son: ' + titulos.join(', ') + '.');
  }
  var rangoPanel = "'" + panelReal.replace(/'/g, "''") + "'!A1:F" + FILAS_PANEL;

  var valores = leerRango(rangoPanel, 'FORMATTED_VALUE');
  var formulas = leerRango(rangoPanel, 'FORMULA');

  // Qué pestañas hay que leer: las que empiezan con "Inscriptos", más cualquier
  // otra que las fórmulas del Panel nombren. Así, si mañana una edición apunta a
  // una pestaña con otro nombre, la app la sigue en vez de dar un descuadre falso.
  var nombradas = {};
  formulas.forEach(function (f) {
    hojasDeFormula(f[3]).forEach(function (n) { nombradas[normalizarNombre(n)] = true; });
  });

  var ignoradas = HOJAS_IGNORADAS.map(normalizarNombre);
  var aLeer = titulos.filter(function (n) {
    if (ignoradas.indexOf(normalizarNombre(n)) !== -1) return false;
    return /^inscriptos /i.test(String(n).trim()) || nombradas[normalizarNombre(n)];
  });

  // Van aparte de las de inscriptos: no cuentan en ningún cupo. Se buscan sin
  // exigir mayúsculas exactas: "Gift cards" tiene que valer igual que "Gift Cards".
  var extrasALeer = [];
  var nombreReal = {};
  [[HOJA_ESPERA, 'espera'], [HOJA_GIFT, 'gift']].forEach(function (par) {
    var real = buscarHoja(titulos, par[0]);
    if (real) { extrasALeer.push(real); nombreReal[real] = par[0]; }
  });

  // Todo en UNA sola llamada: las de inscriptos (hasta la columna K) y las dos
  // pestañas extra (hasta la N, que tienen más columnas).
  var hojas = {};
  var extras = {};
  var todas = aLeer.map(function (n) { return { nombre: n, rango: "'" + n.replace(/'/g, "''") + "'!A:K", ancho: 11, extra: false }; })
    .concat(extrasALeer.map(function (n) { return { nombre: n, rango: "'" + n.replace(/'/g, "''") + "'!A:N", ancho: 14, extra: true }; }));

  if (todas.length) {
    var resp = Sheets.Spreadsheets.Values.batchGet(ID_PLANILLA, {
      ranges: todas.map(function (x) { return x.rango; }),
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });
    (resp.valueRanges || []).forEach(function (vr, i) {
      var d = todas[i];
      var filas = rellenar(vr.values || [], d.ancho);
      if (d.extra) extras[nombreReal[d.nombre] || d.nombre] = filas;
      else hojas[d.nombre] = filas;
    });
  }

  return {
    panelLleno: valores.length >= FILAS_PANEL,
    panelValores: valores,
    panelFormulas: formulas,
    hojas: hojas,
    extras: extras,
    generadoEn: new Date().toISOString()
  };
}

/**
 * En qué fila están los encabezados de verdad.
 *
 * "Lista de espera" arranca con un renglón de título que explica qué es la
 * pestaña. Tomando la fila 1 a ciegas, esa frase quedaba como nombre de columna
 * y no se leía ni una persona — y desde afuera parecía que no había nadie
 * esperando. Los encabezados son la primera fila con varias celdas cortas.
 */
function filaDeEncabezados(filas) {
  for (var i = 0; i < Math.min(filas.length, 10); i++) {
    var celdas = (filas[i] || []).map(function (c) { return String(c || '').trim(); })
      .filter(function (c) { return c; });
    if (celdas.length < 2) continue;                                  // un título suelto
    var todasCortas = celdas.every(function (c) { return c.length <= 40; });
    if (todasCortas) return i;
  }
  return -1;
}

/**
 * Convierte una hoja en objetos usando la fila 1 como nombres de columna.
 * Se busca por nombre y no por posición porque estas pestañas las arma Leo a
 * mano y el orden de las columnas puede cambiar sin aviso.
 */
function porEncabezado(filas) {
  if (!filas || filas.length < 2) return [];
  var inicio = filaDeEncabezados(filas);
  if (inicio === -1) return [];
  var claves = filas[inicio].map(function (c) { return String(c || '').trim().toLowerCase(); });
  var salida = [];
  for (var i = inicio + 1; i < filas.length; i++) {
    var o = { _fila: i + 1 }, vacia = true;
    for (var j = 0; j < claves.length; j++) {
      if (!claves[j]) continue;
      var v = String(filas[i][j] === undefined ? '' : filas[i][j]).trim();
      o[claves[j]] = v;
      if (v) vacia = false;
    }
    if (!vacia) salida.push(o);
  }
  return salida;
}

/**
 * Nombre de pestaña normalizado. Las pestañas las nombra Leo a mano: si un día
 * escribe "Lista de Espera" o "Gift cards", con comparación exacta la app las
 * ignora y esas dos vistas quedan vacías sin decir nada.
 */
function normalizarNombre(n) {
  return String(n || '').trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
}

/** Busca una pestaña por nombre sin exigir mayúsculas ni acentos exactos. */
function buscarHoja(titulos, nombre) {
  var buscado = normalizarNombre(nombre);
  for (var i = 0; i < titulos.length; i++) {
    if (normalizarNombre(titulos[i]) === buscado) return titulos[i];
  }
  return null;
}

/**
 * Busca una columna probando varios nombres, y dice CUÁL usó.
 *
 * `usadas` son las columnas que ya se llevó otro campo: una columna alimenta un
 * campo y nada más. Sin eso, un encabezado como "mail de quien compró" lo
 * agarraba el campo del mail Y el de "quién regala", y la app mostraba el mail
 * en los dos lados.
 */
function campoConClave(obj, nombres, usadas) {
  usadas = usadas || {};
  var libre = function (k) { return !usadas[k] && obj[k]; };

  for (var i = 0; i < nombres.length; i++) {
    var k = nombres[i].toLowerCase();
    if (libre(k)) return { valor: obj[k], clave: k };
  }
  // Último intento: cualquier columna que CONTENGA el texto buscado, para
  // tolerar encabezados tipo "monto abonado". Solo con palabras de 4 letras o
  // más: con "de" o "id" engancha cualquier encabezado.
  var claves = Object.keys(obj);
  for (var n = 0; n < nombres.length; n++) {
    if (nombres[n].length < 4) continue;
    for (var c = 0; c < claves.length; c++) {
      if (claves[c].indexOf(nombres[n].toLowerCase()) !== -1 && libre(claves[c])) {
        return { valor: obj[claves[c]], clave: claves[c] };
      }
    }
  }
  return { valor: '', clave: null };
}

/**
 * Marca como ya tomadas las columnas de fecha. Se usa ANTES de buscar campos de
 * texto libre como "qué actividad quiere" o "quién la compró": un encabezado
 * como "Fecha del taller" o "Fecha de compra" engancha por la palabra suelta y
 * la app termina mostrando una fecha donde va un nombre.
 */
function apartarFechas(obj, tomadas) {
  Object.keys(obj).forEach(function (k) {
    if (k.indexOf('fecha') === 0 || k.indexOf('día') === 0 || k.indexOf('dia ') === 0) tomadas[k] = true;
  });
  return tomadas;
}

/** Las columnas que tiene una pestaña, para poder decirlo en una alerta. */
function columnasDe(filas) {
  if (!filas || !filas.length) return [];
  var i = filaDeEncabezados(filas);
  return (filas[i === -1 ? 0 : i] || []).map(function (c) { return String(c || '').trim(); })
    .filter(function (c) { return c; });
}

function leerRango(rango, render) {
  var r = Sheets.Spreadsheets.Values.get(ID_PLANILLA, rango, {
    valueRenderOption: render,
    dateTimeRenderOption: 'FORMATTED_STRING'
  });
  return rellenar(r.values || [], 6);
}

/**
 * La API omite las celdas vacías del final de cada fila, así que las filas
 * llegan con largos distintos. Acá se emparejan para que el resto del código
 * pueda contar con que la columna K siempre existe.
 */
function rellenar(filas, ancho) {
  return filas.map(function (f) {
    var salida = [];
    for (var i = 0; i < ancho; i++) {
      salida.push(f[i] === undefined || f[i] === null ? '' : String(f[i]));
    }
    return salida;
  });
}

/* ======================================================================
   3. PARSERS (funciones puras — se prueban sin Google)
   ====================================================================== */

/**
 * Saca el monto abonado de la columna H, que viene escrita a mano y es un
 * desastre. Casos reales de la planilla que tiene que resolver:
 *   "12200"                             -> 12200
 *   "$ 12200 pesos"                     -> 12200
 *   "12.200"  /  "$12.200"              -> 12200   (punto de miles, locale es_ES)
 *   "4800$"   /  "5200l"                -> 4800 / 5200
 *   "2.600"                             -> 2600
 *   "$433,33"                           -> 433.33  (coma decimal)
 *   "10400 (4 personas)"                -> 10400
 *   "3000 de 12200 (seña) — saldo $9.200" -> 3000   (el primero es lo abonado)
 *   "12,200"  /  "12 200"               -> 12200   (coma o espacio de miles)
 *   "5200 (2 x 2600)"                   -> 5200    (el total primero, el detalle después)
 *   "2 x 5200"                          -> null     (no dice el total: que se mire)
 *   "USD 100"  /  "U$S 150"             -> null     (no son pesos)
 *   "no tengo / ya esta pago"           -> null     (hay texto pero ningún número)
 *   ""                                  -> null
 * Devuelve null cuando no hay número, para poder distinguir "no pagó" de
 * "está mal cargado" en vez de asumir cero.
 *
 * Las formas de coma y espacio de miles, dólares y "N x M" no están hoy en la
 * planilla, pero la columna la escribe a mano quien se inscribe: con la coma
 * siempre decimal, "12,200" en el curso daba 12,2 y la app decía que a alguien
 * que pagó todo le faltaban $ 12.188.
 */
function parsearMonto(texto) {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === 'number') return isFinite(texto) ? texto : null;

  var s = String(texto).trim();
  if (!s) return null;

  // Dólares: sumarlos como pesos da un cobrado falso. Mejor que se mire a mano.
  if (/u\$s|us\$|\busd\b|d[oó]lar/i.test(s)) return null;

  // Primero el número con espacio de miles ("12 200"), que sin esto se cortaba
  // en el espacio y daba 12. Si no hay, el de siempre.
  var m = s.match(/\d{1,3}(?: \d{3})+(?![\d.,])|\d[\d.,]*/);
  if (!m) return null;

  // "2 x 5200": el primer número es cuántos, no cuánto. "5200 (2 x 2600)" sí
  // sirve, porque ahí el primero es el total: solo se descarta si la x viene
  // pegada al primer número.
  if (/^[x×]\s*\d/i.test(s.slice(m.index + m[0].length).trim())) return null;

  var num = m[0].replace(/ /g, '').replace(/[.,]+$/, '');

  // "12,200": coma de miles. Tres cifras exactas después de cada coma y ningún
  // punto; "$433,33" y "1,5" siguen siendo decimales.
  if (/^\d{1,3}(,\d{3})+$/.test(num)) num = num.replace(/,/g, '');

  if (num.indexOf(',') !== -1) {
    // Hay coma: la coma es el decimal, el punto es separador de miles.
    num = num.replace(/\./g, '').replace(',', '.');
  } else if (num.indexOf('.') !== -1) {
    var partes = num.split('.');
    var ultima = partes[partes.length - 1];
    // "12.200" son miles; "433.33" es decimal.
    num = (ultima.length === 3) ? partes.join('') : partes.join('.');
  }

  var valor = parseFloat(num);
  return isFinite(valor) ? valor : null;
}

/**
 * ¿El pago de esta fila lo cubre otra persona? Pasa con acompañantes cargados
 * en su propia fila (ocupan cupo pero no tienen monto) y con gift cards.
 */
function estaCubiertoPorOtro(fila) {
  var texto = ((fila.comprobante || '') + ' ' + (fila.nombre || '') + ' ' + (fila.medioPago || '')).toLowerCase();
  // A propósito NO entra acá "ya está pago" a secas: eso es alguien afirmando que
  // pagó, no un pago rastreable. Va a "revisar" para que se mire, no se dé por bueno.
  // Sí entran los que apuntan a OTRO pago concreto que sí existe en la planilla.
  return /mismo pago|acompañante|acompanante|ya fue enviado por|gift card/.test(texto);
}

/**
 * Identificador de pago para detectar el mismo comprobante repetido en varias
 * filas. Se queda con la tira de dígitos más larga del comprobante, que es lo
 * único estable: el resto es texto libre ("BBVA (mismo pago que Fulana)").
 */
function idDePago(comprobante) {
  if (!comprobante) return '';
  var digitos = String(comprobante).match(/\d{6,}/g);
  if (!digitos || !digitos.length) return '';
  // Sin número de comprobante no hay forma de saber si dos filas son el mismo
  // pago. Comparar el texto libre daba falsos positivos: muchas filas de Tikzet
  // dicen literalmente "Tikzet - Pago aprobado (2 entradas)" sin ser el mismo pago.
  return digitos.sort(function (a, b) { return b.length - a.length; })[0];
}

var MESES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6,
  agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};

/**
 * Saca la fecha de una edición para saber si ya pasó.
 * Los talleres la llevan en el nombre ("Taller de tapeo — 18/09/2026"); el
 * curso lleva solo el mes ("Curso de cocina — Octubre 2026"), y en ese caso se
 * toma el último día del mes, que es hasta cuándo sigue siendo actual.
 * Devuelve null si el nombre no dice ninguna fecha (ediciones viejas del curso
 * como "Curso de cocina — Martes 19-21h").
 */
function fechaDeEdicion(texto) {
  var s = String(texto || '');
  var dma = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dma) {
    var dia = Number(dma[1]), mes = Number(dma[2]), anio = Number(dma[3]);
    var f = new Date(anio, mes - 1, dia);
    // Una fecha que no existe (31/02) la corre sola al mes siguiente y la app
    // diría que el taller es otro día, sin avisar. Mejor decir que no se entiende.
    if (f.getDate() !== dia || f.getMonth() !== mes - 1 || f.getFullYear() !== anio) return null;
    return f;
  }

  var mes = s.toLowerCase().match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(\d{4})/);
  if (mes) return new Date(Number(mes[2]), MESES[mes[1]] + 1, 0);

  return null;
}

/**
 * Cuándo EMPIEZA una edición, que no es lo mismo que hasta cuándo sigue
 * vigente. En el taller es el mismo día. En el curso, que lleva solo el mes, es
 * el 1.º: usando el último día del mes, la tarjeta del curso de octubre decía
 * "en 38 días" el 23/9 y quedaba abajo de los talleres del 2 y del 16/10.
 */
function inicioDeEdicion(texto) {
  var fin = fechaDeEdicion(texto);
  if (!fin) return null;
  if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(String(texto || ''))) return { fecha: fin, esMes: false };
  return { fecha: new Date(fin.getFullYear(), fin.getMonth(), 1), esMes: true };
}

/** Vigente = todavía no pasó, o está marcada Abierto en el Panel. */
function estaVigente(texto, abierta, hoy) {
  var f = fechaDeEdicion(texto);
  if (f === null) return !!abierta;
  var corte = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return f >= corte || !!abierta;
}

/**
 * COUNTIF de Sheets: ignora mayúsculas y acepta * como comodín.
 * Se replica acá para poder ligar cada persona a su edición igual que el Panel.
 */
function coincideCriterio(valor, criterio) {
  var v = String(valor === null || valor === undefined ? '' : valor).trim().toLowerCase();
  var c = String(criterio === null || criterio === undefined ? '' : criterio).trim().toLowerCase();
  if (c.indexOf('*') === -1) return v === c;
  var regex = '^' + c.split('*').map(function (parte) {
    return parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('.*') + '$';
  return new RegExp(regex).test(v);
}

/**
 * Lee la fórmula de la columna "Anotados" del Panel para saber QUÉ filas
 * pertenecen a esa edición. La fórmula es la única fuente de verdad del mapeo
 * grupo -> horario (que "Jueves 10-12h" es el grupo "Mañana*" solo lo dice la
 * fórmula, no hay ninguna columna que lo diga).
 *
 *   =COUNTIF('Inscriptos Agosto 2026'!K:K;B2)
 *   =COUNTIFS('Inscriptos Octubre 2026'!K:K;"Curso de cocina — Octubre 2026";
 *             'Inscriptos Octubre 2026'!E:E;"Mañana*")
 *
 * Devuelve { regla } si la entendió, o { motivo } explicando por qué no.
 * El motivo se muestra en la alerta: si un día una fórmula queda rara, lo que
 * hace falta es saber QUÉ tiene de raro, no que la app diga "no se pudo leer".
 */
function analizarFormula(formula, edicion, filaPanel) {
  var f = String(formula || '').trim();
  if (!f) return { motivo: 'la celda Anotados no tiene fórmula: el número está escrito a mano.' };

  var cuantos = (f.match(/COUNTIFS?\s*\(/gi) || []).length;
  if (!cuantos) return { motivo: 'la fórmula no usa COUNTIF ni COUNTIFS.' };
  if (cuantos > 1) {
    return { motivo: 'la fórmula suma más de un COUNTIF. La app sabe leer uno solo, ' +
                     'así que no puede saber qué filas son de esta edición.' };
  }

  var args = argumentosDeFuncion(f, 'COUNTIFS') || argumentosDeFuncion(f, 'COUNTIF');
  if (!args) return { motivo: 'la fórmula tiene los paréntesis sin cerrar.' };
  if (args.length % 2 !== 0) return { motivo: 'la fórmula tiene un rango sin su criterio.' };

  var regla = { hoja: '', criterioK: null, criterioE: null, origen: 'formula' };
  for (var i = 0; i < args.length; i += 2) {
    var rango = parsearRango(args[i]);
    if (!rango) return { motivo: 'no se entiende el rango ' + args[i].trim() + '.' };
    if (regla.hoja && normalizarNombre(regla.hoja) !== normalizarNombre(rango.hoja)) {
      return { motivo: 'la fórmula cuenta en dos pestañas a la vez (' + regla.hoja + ' y ' + rango.hoja + ').' };
    }
    regla.hoja = rango.hoja;

    if (rango.columna !== 'K' && rango.columna !== 'E') {
      return { motivo: 'la fórmula mira la columna ' + rango.columna + '. La app espera K (Edición) y, en el curso, E (horario).' };
    }

    var crit = parsearCriterio(args[i + 1], edicion, filaPanel);
    if (crit.motivo) return { motivo: crit.motivo };
    if (rango.columna === 'K') regla.criterioK = crit.valor;
    else regla.criterioE = crit.valor;
  }

  if (regla.criterioK === null) {
    return { motivo: 'la fórmula no cuenta por la columna K (Edición), que es la que dice a qué edición va cada anotado.' };
  }
  return { regla: regla };
}

/**
 * Saca los argumentos de COUNTIF(...) respetando comillas y paréntesis
 * anidados, así una fórmula envuelta en IFERROR o con ";" adentro de un texto
 * no la confunde.
 */
function argumentosDeFuncion(formula, nombre) {
  var f = String(formula);
  var re = new RegExp(nombre + '\\s*\\(', 'i');
  var m = re.exec(f);
  if (!m) return null;

  var nivel = 1, comilla = null, actual = '', args = [];
  for (var i = m.index + m[0].length; i < f.length; i++) {
    var c = f.charAt(i);
    if (comilla) {
      if (c === comilla && f.charAt(i + 1) === comilla) { actual += c + c; i++; continue; }
      if (c === comilla) comilla = null;
      actual += c;
      continue;
    }
    if (c === '"' || c === "'") { comilla = c; actual += c; continue; }
    if (c === '(') { nivel++; actual += c; continue; }
    if (c === ')') {
      nivel--;
      if (nivel === 0) { args.push(actual); return args; }
      actual += c;
      continue;
    }
    if ((c === ';' || c === ',') && nivel === 1) { args.push(actual); actual = ''; continue; }
    actual += c;
  }
  return null;
}

/**
 * 'Inscriptos Agosto 2026'!K:K  ->  { hoja: 'Inscriptos Agosto 2026', columna: 'K' }
 * Acepta la pestaña sin comillas (cuando el nombre es una sola palabra), los
 * $ de las referencias absolutas y los rangos acotados tipo K2:K500.
 */
function parsearRango(texto) {
  var s = String(texto || '').trim();
  var m = s.match(/^(?:'((?:[^']|'')+)'|([^'!]+))!\s*\$?([A-Za-z]{1,2})\$?\d*\s*:\s*\$?([A-Za-z]{1,2})\$?\d*$/);
  if (!m) return null;
  var hoja = (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]).trim();
  if (!hoja) return null;
  var c1 = m[3].toUpperCase(), c2 = m[4].toUpperCase();
  if (c1 !== c2) return null;   // rango de varias columnas: no se sabe qué mira
  return { hoja: hoja, columna: c1 };
}

/**
 * Todas las pestañas que nombra una fórmula, con comillas o sin ellas. Se usa
 * para saber qué hay que leer: tiene que aceptar exactamente lo mismo que
 * parsearRango, o la app arma una regla que apunta a una pestaña que no leyó.
 */
function hojasDeFormula(formula) {
  var re = /(?:'((?:[^']|'')+)'|([A-Za-z0-9_\u00C0-\u024F][A-Za-z0-9_\u00C0-\u024F ]*))!\s*\$?[A-Za-z]{1,2}/g;
  var salida = [], m;
  while ((m = re.exec(String(formula || ''))) !== null) {
    var h = (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]).trim();
    if (h && salida.indexOf(h) === -1) salida.push(h);
  }
  return salida;
}

/**
 * El criterio puede ser un texto ("Mañana*") o la celda de la columna B de la
 * misma fila del Panel, que es la Edición. Si apunta a OTRA fila, es un
 * copiar-pegar mal hecho: esa fórmula está contando la edición de al lado.
 */
function parsearCriterio(texto, edicion, filaPanel) {
  var s = String(texto || '').trim();

  var literal = s.match(/^"([\s\S]*)"$/);
  if (literal) return { valor: literal[1].replace(/""/g, '"') };

  var ref = s.match(/^\$?([A-Za-z]{1,2})\$?(\d+)$/);
  if (ref) {
    var col = ref[1].toUpperCase(), fila = Number(ref[2]);
    if (col !== 'B') {
      return { motivo: 'el criterio apunta a la celda ' + s + '. La app espera la columna B, que es donde está la Edición.' };
    }
    if (filaPanel && fila !== filaPanel) {
      return { motivo: 'la fórmula cuenta lo que dice B' + fila + ', pero esta es la fila ' + filaPanel +
                       '. Quedó apuntando a otra edición (copiar y pegar mal hecho).' };
    }
    return { valor: edicion };
  }

  return { motivo: 'no se entiende el criterio ' + s + '.' };
}


/* ======================================================================
   4. ARMADO DEL ESTADO (función pura: datos crudos -> lo que ve la app)
   ====================================================================== */

function construirEstado(crudo, ahora) {
  var hoy = ahora || new Date();
  var filas = aplanarInscriptos(crudo.hojas);
  filas.panelLleno = !!crudo.panelLleno;
  filas.panelColumnas = revisarColumnasDelPanel(crudo.panelValores);
  var ediciones = leerEdicionesDelPanel(crudo.panelValores, crudo.panelFormulas, hoy);

  // leerPlanilla lee TODA pestaña que exista y que nombre una fórmula. Si la
  // pestaña de la regla no está entre las leídas, es que no existe: la fórmula
  // tiene el nombre mal escrito ("Novienbre") y la edición queda con 0 personas.
  var leidas = {};
  Object.keys(crudo.hojas || {}).forEach(function (n) { leidas[normalizarNombre(n)] = true; });

  // Cada fila entra en UNA sola edición. Si dos filas del Panel comparten la misma
  // regla (un copiar-pegar mal hecho), la segunda no se vuelve a quedar con la misma
  // persona: eso inflaría los anotados y el recaudado sin que se note.
  var usadas = {};
  var duplicadas = [];
  ediciones.forEach(function (ed) {
    if (ed.regla && !leidas[normalizarNombre(ed.regla.hoja)]) ed.pestanaInexistente = true;
    ed.personas = filas.filter(function (f) {
      if (!ed.regla) return false;
      // Normalizado: en Sheets los nombres de pestaña no distinguen mayúsculas, así
      // que la fórmula puede decir "inscriptos diciembre" y la pestaña llamarse
      // "Inscriptos Diciembre". Comparando literal, la edición quedaba sin gente.
      if (normalizarNombre(f.hoja) !== normalizarNombre(ed.regla.hoja)) return false;
      if (!coincideCriterio(f.edicion, ed.regla.criterioK)) return false;
      if (ed.regla.criterioE && !coincideCriterio(f.horario, ed.regla.criterioE)) return false;
      if (usadas[f.clave]) {
        duplicadas.push({ fila: f, edicion: ed.edicion, ya: usadas[f.clave] });
        return false;
      }
      return true;
    }).map(function (f) { usadas[f.clave] = ed.edicion; return evaluarPago(f, ed); });

    // La celda Anotados da error: se muestran las filas que hay, que es un número
    // real, en vez del 0 que no dice nadie. Nunca null: la página lo imprime tal cual.
    if (ed.anotadosIlegible) {
      ed.anotados = ed.personas.length;
      ed.quedan = ed.cupo === null ? null : ed.cupo - ed.anotados;
      ed.ocupacion = ed.cupo > 0 ? Math.min(ed.anotados / ed.cupo, 1) : 0;
    }

    calcularPlata(ed);
  });

  var vigentes = ediciones.filter(function (e) { return e.vigente; });
  marcarRepetidores(ediciones);
  var espera = leerEspera((crudo.extras || {})[HOJA_ESPERA], ediciones);
  var gift = leerGiftCards((crudo.extras || {})[HOJA_GIFT]);
  var alertas = detectarAlertas(ediciones, filas, usadas, hoy, duplicadas, espera, gift);

  return {
    generadoEn: crudo.generadoEn,
    hoy: hoy.toISOString(),
    ediciones: ediciones,
    alertas: alertas,
    espera: espera,
    giftCards: gift,
    fueraDeCupo: listarFueraDeCupo(filas, usadas, hoy),
    tikzet: resumirTikzet(ediciones),
    resumen: {
      vigentes: vigentes.length,
      abiertas: vigentes.filter(function (e) { return e.abierta; }).length,
      anotados: sumar(vigentes, 'anotados'),
      cupo: sumar(vigentes, 'cupo'),
      libres: sumar(vigentes, 'quedan'),
      recaudado: sumar(vigentes, 'recaudado'),
      saldo: sumar(vigentes, 'saldo'),
      pendientes: vigentes.reduce(function (a, e) { return a + e.pendientes.length; }, 0),
      enEspera: espera.length,
      giftSinUsar: gift.filter(function (g) { return !g.usada; }).length,
      // Va en el resumen y no colgado del array: las propiedades de un array no
      // sobreviven a JSON.stringify y nunca llegarían al navegador.
      giftSinMonto: !!gift.faltaElMonto,
      esperaIlegible: !!espera.noSeSupoLeer,
      alertasAltas: alertas.filter(function (a) { return a.nivel === 'alta'; }).length,
      alertasTotal: alertas.length
    }
  };
}

/**
 * Marca cuántas veces vino cada persona. Se cruza por mail, que es lo único
 * estable: el nombre viene escrito distinto cada vez ("Fulana Pérez" /
 * "Fulana Perez Rodriguez"). Sirve para saber a quién ya conocés.
 */
function marcarRepetidores(ediciones) {
  var cuenta = {};
  ediciones.forEach(function (ed) {
    ed.personas.forEach(function (p) {
      var k = (p.email || '').trim().toLowerCase();
      if (!k) return;
      cuenta[k] = (cuenta[k] || 0) + 1;
    });
  });
  ediciones.forEach(function (ed) {
    ed.personas.forEach(function (p) {
      var k = (p.email || '').trim().toLowerCase();
      p.veces = k ? cuenta[k] : 1;
    });
  });
}

/**
 * Lista de espera. Es la pestaña que se mira cuando algo se llena: quién quiere
 * entrar si alguien larga. Se liga a la edición por texto porque ahí se escribe
 * a mano; si no se puede ligar, igual se muestra en la lista general.
 */
function leerEspera(filas, ediciones) {
  var crudas = porEncabezado(filas);

  var lista = crudas.map(function (o) {
    // Una columna la agarra UN campo y nadie más, igual que en las gift cards:
    // sin esto, un encabezado como "Fecha del taller" se leía como la edición
    // que la persona quiere, y la alerta terminaba nombrando una fecha.
    var tomadas = {};
    var marcar = function (r) { if (r.clave) tomadas[r.clave] = true; return r.valor; };

    var quien   = marcar(campoConClave(o, ['nombre', 'quien espera', 'quien'], tomadas));
    var correo  = marcar(campoConClave(o, ['email', 'mail', 'correo'], tomadas));
    var celular = marcar(campoConClave(o, ['celular', 'whatsapp', 'teléfono', 'telefono', 'contacto'], tomadas));
    apartarFechas(o, tomadas);
    var texto   = marcar(campoConClave(o,
      ['espera para', 'edición', 'edicion', 'quiere', 'espera', 'actividad', 'taller', 'curso'], tomadas));

    return {
      nombre: quien,
      email: correo,
      celular: celular,
      whatsapp: paraWhatsapp(celular),
      quiere: texto,
      edicion: ligarAEdicion(texto, ediciones),
      fila: o._fila
    };
  }).filter(function (x) { return x.nombre || x.email; });

  // Sin esto, una lista vacía y una pestaña que no se supo leer se ven igual
  // desde afuera: las dos dan cero.
  lista.columnas = columnasDe(filas);
  lista.filasEnLaPestana = crudas.length;
  lista.noSeSupoLeer = crudas.length > 0 && lista.length === 0;
  lista.sinColumnaEdicion = lista.length > 0 && lista.every(function (x) { return !x.quiere; });
  return lista;
}

/**
 * Liga un texto escrito a mano ("tapeo 18/9") con una edición del Panel.
 * Solo liga cuando NO hay dudas: si el texto le calza a dos ediciones (poner
 * "taller" a secas le calza a todas), se deja sin ligar. Ligarlo a una
 * cualquiera es peor que no ligarlo: la alerta nombraría la edición equivocada.
 */
function ligarAEdicion(texto, ediciones) {
  var t = String(texto || '').trim().toLowerCase();
  if (!t) return null;

  var exactas = (ediciones || []).filter(function (e) { return e.edicion.toLowerCase() === t; });
  if (exactas.length === 1) return exactas[0].edicion;

  var parecidas = (ediciones || []).filter(function (e) {
    var n = e.edicion.toLowerCase();
    return n.indexOf(t) !== -1 || t.indexOf(n) !== -1;
  });
  if (parecidas.length === 1) return parecidas[0].edicion;

  // Último intento: por la fecha. En la planilla se escribe "Taller de tapeo
  // 07/08/2026" y en el Panel "Taller de tapeo — 07/08/2026": ninguno contiene
  // al otro por la raya, pero la fecha es la misma y eso no se presta a dudas.
  var fecha = (t.match(/\d{1,2}\/\d{1,2}\/\d{4}/) || [])[0];
  if (!fecha) return null;
  var porFecha = (ediciones || []).filter(function (e) {
    return e.edicion.indexOf(fecha) !== -1;
  });
  return porFecha.length === 1 ? porFecha[0].edicion : null;
}

/** Gift cards: una vendida sin usar es plata cobrada y un lugar que se va a ocupar. */
function leerGiftCards(filas) {
  var columnas = columnasDe(filas);
  var sinMonto = false;

  var lista = porEncabezado(filas).map(function (o) {
    // El orden importa: cada columna se la lleva UN solo campo. Primero los que
    // tienen nombres inequívocos, y al final "de quién", que es el más vago.
    var tomadas = {};
    var marcar = function (r) { if (r.clave) tomadas[r.clave] = true; return r.valor; };

    // Las columnas de canje van PRIMERO y por separado: "Usada por (nombre en
    // Inscriptos)" contiene la palabra "usada", así que si la agarraba el campo
    // del estado, una gift card canjeada mostraba el nombre de quien la usó
    // como si fuera su estado — y seguía contando como sin usar.
    var usadaPor = marcar(campoConClave(o, ['usada por', 'usado por', 'canjeada por', 'canjeado por'], tomadas));
    var fechaUso = marcar(campoConClave(o, ['fecha de uso', 'fecha uso', 'fecha de canje'], tomadas));
    var estado   = marcar(campoConClave(o, ['estado', 'situación', 'situacion', 'usada', 'usado', 'canjeada'], tomadas));

    var quien   = marcar(campoConClave(o, ['destinatario', 'nombre', 'para'], tomadas));
    var correo  = marcar(campoConClave(o, ['email', 'mail', 'correo', 'contacto'], tomadas));
    var importe = campoConClave(o, ['monto', 'importe', 'precio', 'valor', 'total', 'abonado', 'pagado'], tomadas);
    marcar(importe);
    apartarFechas(o, tomadas);
    var actividad = marcar(campoConClave(o, ['actividad', 'taller', 'curso'], tomadas));
    // Ojo con los términos cortos: "compra" a secas engancha "Fecha de compra" y
    // la app mostraba la fecha como si fuera quién regaló. Van completos.
    var deQuien = marcar(campoConClave(o,
      ['comprada por', 'comprado por', 'comprada', 'comprado', 'comprador', 'regala', 'de'], tomadas));

    var monto = parsearMonto(importe.valor);
    if (monto === null) sinMonto = true;

    return {
      nombre: quien,
      deQuien: deQuien,
      email: correo,
      actividad: actividad,
      monto: monto,
      estado: estado,
      usadaPor: usadaPor,
      // Canjeada si lo dice el estado, o si hay alguien anotado como que la usó,
      // o si tiene fecha de uso. Cualquiera de las tres alcanza.
      usada: estaUsada(estado) || !!usadaPor || !!fechaUso,
      fila: o._fila
    };
  }).filter(function (x) { return x.nombre || x.email || x.monto; });

  // Sin monto no se puede decir cuánto hay cobrado por adelantado, y mostrar $0
  // como si fuera un dato medido es peor que no mostrar nada.
  lista.columnas = columnas;
  lista.faltaElMonto = lista.length > 0 && lista.every(function (g) { return g.monto === null; });
  return lista;
}

/**
 * ¿La gift card ya se canjeó? La columna se escribe a mano y puede decir "No",
 * "Sin usar", "Sí", "Usada" o "Canjeada el 12/8". Los negativos se miran
 * primero: "sin usar" contiene "usar", y darla por usada la sacaría de la
 * plata que todavía hay que cubrir.
 */
function estaUsada(texto) {
  var t = String(texto || '').trim().toLowerCase();
  if (!t) return false;
  if (/^(no|sin usar|sin canjear|no usada|pendiente|vigente|activa|disponible)/.test(t)) return false;
  return /^(s[ií]|x)$/.test(t) || /(usad|canjead|entregad|cobrad)/.test(t);
}

/**
 * Gente cargada en las pestañas de inscriptos que a propósito no ocupa cupo de
 * ninguna edición: gift cards, reubicados, lista de espera. No son errores,
 * pero conviene tenerlos a la vista para que no se olviden.
 */
function listarFueraDeCupo(filas, usadas, hoy) {
  return filas.filter(function (f) {
    if (usadas[f.clave] || !f.edicion) return false;
    return estaVigente(f.hoja, false, hoy) || estaVigente(f.edicion, false, hoy);
  }).map(function (f) {
    return {
      nombre: f.nombre, email: f.email, edicion: f.edicion,
      actividad: f.actividad, montoTexto: f.montoTexto,
      monto: parsearMonto(f.montoTexto), hoja: f.hoja, fila: f.fila
    };
  });
}

function sumar(lista, campo) {
  return lista.reduce(function (acc, x) { return acc + (Number(x[campo]) || 0); }, 0);
}

/**
 * Dónde está cada columna de una pestaña de inscriptos, buscada por el
 * encabezado de la fila 1: [campo, posición de siempre, palabra que la delata].
 *
 * Se leían todas por posición. Si se intercambiaban H (monto abonado) e I (pago
 * verificado), ninguna fórmula del Panel se enteraba —solo miran K y E— y la app
 * leía el monto de la columna vacía: cobrado $ 0 y todos "Sin pago", sin una
 * alerta alta. Las palabras son cortas a propósito ("verif", "medio"): hay
 * pestañas con los encabezados abreviados.
 *
 * E (horario) y K (Edición) NO se buscan: esas las fija la fórmula del Panel
 * (COUNTIFS sobre K y E). Si se mueven, Sheets reescribe la fórmula y ya salta
 * la alerta de fórmula; leerlas en otro lado haría que la app y el Panel cuenten
 * cosas distintas.
 */
var COLUMNAS_INSCRIPTOS = [
  ['nombre', 0, /nombre/], ['email', 1, /mail/], ['celular', 2, /celu|tel/],
  ['actividad', 3, /actividad/], ['medioPago', 5, /medio/],
  ['comprobante', 6, /comprobante/], ['montoTexto', 7, /monto/],
  ['verificado', 8, /verif/], ['fecha', 9, /fecha/]
];

/** Cómo se llama cada campo en la alerta, que la lee Leo y no el código. */
var NOMBRE_COLUMNA = {
  nombre: 'nombre', email: 'email', celular: 'celular', actividad: 'actividad',
  medioPago: 'medio de pago', comprobante: 'número de comprobante', montoTexto: 'monto abonado',
  verificado: 'pago verificado', fecha: 'fecha de inscripción'
};

function columnasDeInscriptos(encabezados) {
  var enc = (encabezados || []).map(function (c) { return normalizarNombre(c); });
  var idx = {}, faltan = [], tomadas = { 4: true, 10: true };
  COLUMNAS_INSCRIPTOS.forEach(function (c) {
    var j = -1;
    for (var k = 0; k < enc.length; k++) {
      if (!tomadas[k] && c[2].test(enc[k])) { j = k; break; }
    }
    // Si no está, se lee en su lugar de siempre en vez de poner la plata en $ 0.
    // Puede ser la columna equivocada, y por eso se avisa.
    if (j === -1) { idx[c[0]] = c[1]; faltan.push(c[0]); }
    else { idx[c[0]] = j; tomadas[j] = true; }
  });
  return { idx: idx, faltan: faltan };
}

/** Junta todas las pestañas "Inscriptos ..." en una sola lista de personas. */
function aplanarInscriptos(hojas) {
  var salida = [];
  salida.columnasRaras = [];
  Object.keys(hojas).forEach(function (nombreHoja) {
    if (HOJAS_IGNORADAS.indexOf(nombreHoja) !== -1) return;
    var filas = hojas[nombreHoja] || [];
    var columnas = columnasDeInscriptos(filas[0]);
    var col = columnas.idx;
    // Una pestaña recién creada, sin nadie, no tiene nada que leer mal.
    if (columnas.faltan.length && filas.length > 1) {
      salida.columnasRaras.push({ hoja: nombreHoja, faltan: columnas.faltan });
    }
    var celda = function (f, campo) { return (f[col[campo]] || '').trim(); };
    for (var i = 1; i < filas.length; i++) {
      var f = filas[i] || [];
      var nombre = celda(f, 'nombre');
      var edicion = (f[10] || '').trim();
      if (!nombre && !edicion) continue;
      salida.push({
        clave: nombreHoja + '#' + (i + 1),
        hoja: nombreHoja,
        fila: i + 1,
        nombre: nombre,
        email: celda(f, 'email'),
        celular: celda(f, 'celular'),
        actividad: celda(f, 'actividad'),
        horario: (f[4] || '').trim(),
        medioPago: celda(f, 'medioPago'),
        comprobante: celda(f, 'comprobante'),
        montoTexto: celda(f, 'montoTexto'),
        verificado: celda(f, 'verificado'),
        fecha: celda(f, 'fecha'),
        edicion: edicion
      });
    }
  });
  return salida;
}

/**
 * El Panel se lee por posición: Edición en B, Cupo en C, Anotados en D y Estado
 * en F (el rango llega hasta F). Si se agrega una columna entre Quedan y Estado,
 * el Estado pasa a G, no se lee, y todas las ediciones quedan como cerradas sin
 * que nada lo diga. Se mira la fila 1 y se avisa qué esperaba y qué encontró.
 */
var COLUMNAS_PANEL = [[1, 'B', 'Edición', /edici/], [2, 'C', 'Cupo', /cupo/],
                      [3, 'D', 'Anotados', /anotad/], [5, 'F', 'Estado', /estado/]];

function revisarColumnasDelPanel(valores) {
  var enc = (valores || [])[0];
  if (!enc) return [];
  var raras = [];
  COLUMNAS_PANEL.forEach(function (c) {
    var dice = String(enc[c[0]] == null ? '' : enc[c[0]]).trim();
    if (!c[3].test(normalizarNombre(dice))) raras.push({ columna: c[1], esperaba: c[2], dice: dice });
  });
  return raras;
}

/**
 * Cada fila del Panel que tenga Edición es una edición de verdad.
 *
 * Antes se exigía también un Cupo con número, "para saltear la fila de la
 * fórmula de avisos". Pero esa fila no tiene Edición, y con el Cupo vacío, con
 * #REF! o escrito en letras desaparecía una edición entera con su gente y su
 * plata. Ahora queda, con cupo null, y sale una alerta.
 */
function leerEdicionesDelPanel(valores, formulas, hoy) {
  var salida = [];
  for (var i = 1; i < valores.length; i++) {
    var v = valores[i] || [];
    var edicion = (v[1] || '').trim();
    if (!edicion) continue;  // saltea la fila de la fórmula de avisos
    var cupo = parsearMonto(v[2]);

    // Una celda con error (#REF!, #N/A) se leía como 0 anotados. Se marca, y
    // construirEstado pone en su lugar las filas que encontró. Se mira el '#'
    // antes de parsear porque parsearMonto('#DIV/0!') agarra el 0.
    var textoAnotados = String(v[3] == null ? '' : v[3]).trim();
    var anotadosLeidos = /^#/.test(textoAnotados) ? null : parsearMonto(textoAnotados);
    var anotados = anotadosLeidos === null ? 0 : anotadosLeidos;

    var estado = (v[5] || '').trim();
    // "Abierta" también: la edición es femenino y escribirlo así es lo natural.
    // Con /^abierto/ quedaba todo como cerrado sin que nada lo dijera.
    var abierta = /^abiert[oa]/i.test(estado);
    var partes = edicion.split('—');
    var fecha = fechaDeEdicion(edicion);
    var inicio = inicioDeEdicion(edicion);
    var analisis = analizarFormula((formulas[i] || [])[3], edicion, i + 1);

    salida.push({
      id: 'ed' + (i + 1),
      filaPanel: i + 1,
      actividad: (v[0] || '').trim(),
      edicion: edicion,
      titulo: (partes[0] || edicion).trim(),
      subtitulo: partes.slice(1).join('—').trim(),
      cupo: cupo,
      cupoTexto: String(v[2] == null ? '' : v[2]).trim(),
      anotados: anotados,
      anotadosIlegible: anotadosLeidos === null ? (textoAnotados || '(vacía)') : '',
      pestanaInexistente: false,
      // Sin cupo no se sabe cuántos lugares quedan. null y no cupo - anotados:
      // null - 4 da -4, y la edición salía como sobrecupo con una alerta alta falsa.
      quedan: cupo === null ? null : cupo - anotados,
      ocupacion: cupo > 0 ? Math.min(anotados / cupo, 1) : 0,
      estado: estado,
      abierta: abierta,
      estadoRaro: !!estado && !/^(abiert|cerrad)/i.test(estado),
      // fecha es hasta cuándo sigue vigente (en el curso, el último día del mes);
      // inicio es cuándo empieza, que es lo que sirve para ordenar y para el
      // "en N días". fechaEsMes: el nombre solo dice el mes, no el día.
      fecha: fecha ? fecha.toISOString() : null,
      inicio: inicio ? inicio.fecha.toISOString() : null,
      fechaEsMes: !!(inicio && inicio.esMes),
      vigente: estaVigente(edicion, abierta, hoy),
      esCurso: /curso de cocina/i.test(edicion),
      regla: analisis.regla || null,
      motivoFormula: analisis.motivo || '',
      personas: [],
      recaudado: 0,
      saldo: 0,
      pagosCompartidos: []
    });
  }
  return salida;
}

/** Decide en qué situación de pago está cada persona. */
/**
 * Arma el número para wa.me. Los celulares están cargados de cualquier forma:
 * "59891234567", "099123456", "43001234", "598099123456". Se normaliza a formato
 * internacional uruguayo; si no se puede, se devuelve vacío y no se muestra el botón,
 * que es mejor que ofrecer un link que abre un chat con el número equivocado.
 */
function paraWhatsapp(celular) {
  var d = String(celular || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('598') === 0) d = d.slice(3);          // ya trae el país
  d = d.replace(/^0+/, '');                            // 099... -> 99...
  if (d.length === 8 && d.charAt(0) === '9') return '598' + d;   // celular uruguayo
  return '';                                            // fijo o incompleto: no arriesgar
}

/**
 * La columna I de las pestañas de inscriptos se llama "pago verificado" y hoy
 * está vacía en las 102 filas: nadie la usa. Si algún día se empieza a usar, un
 * "no" ahí tiene que pesar — sin esto, un pago marcado como no verificado
 * seguiría figurando como plata cobrada.
 *
 * Vacío significa "sin opinión", que es exactamente como está hoy: mientras la
 * columna siga en blanco, esto no cambia absolutamente nada.
 */
function pagoDesmentido(texto) {
  var t = String(texto || '').trim().toLowerCase();
  if (!t) return false;
  return /^(no|false|falso|pendiente|sin verificar|no verificad|dudos|revisar|rechazad|falta verificar)/.test(t);
}

function evaluarPago(f, ed) {
  var p = {
    nombre: f.nombre, email: f.email, celular: f.celular, horario: f.horario,
    whatsapp: paraWhatsapp(f.celular),
    medioPago: f.medioPago, comprobante: f.comprobante, montoTexto: f.montoTexto,
    fecha: f.fecha, hoja: f.hoja, fila: f.fila, verificado: f.verificado,
    esTikzet: /tikzet/i.test(f.medioPago + ' ' + f.comprobante),
    idPago: idDePago(f.comprobante)
  };

  var monto = parsearMonto(f.montoTexto);
  p.monto = monto;
  p.saldo = 0;

  if (monto === null || monto === 0) {
    if (estaCubiertoPorOtro(f)) {
      p.estadoPago = 'cubierto';
      p.nota = 'Lo cubre otro pago';
    } else if (f.montoTexto) {
      p.estadoPago = 'revisar';
      p.nota = 'El monto no se entiende: "' + f.montoTexto + '"';
    } else {
      p.estadoPago = 'sin_pago';
      p.nota = 'Sin pago cargado';
    }
    return p;
  }

  // En el curso no hay otra red: detectarMontosRaros solo mira talleres. Un monto
  // que no puede ser ni una seña es algo que se leyó mal, y tratarlo como seña
  // inventa una deuda de casi el total.
  if (ed.esCurso && monto < PRECIOS.cursoMinimo) {
    p.estadoPago = 'revisar';
    p.nota = 'Monto demasiado chico para el curso: "' + f.montoTexto + '"';
    return p;
  }

  if (ed.esCurso) {
    if (monto >= PRECIOS.cursoTotal) {
      p.estadoPago = 'completo';
    } else {
      p.estadoPago = 'parcial';
      p.saldo = PRECIOS.cursoTotal - monto;
      p.nota = monto >= PRECIOS.cursoCuota
        ? 'Pagó por cuotas, le falta ' + plata(p.saldo)
        : 'Seña, le falta ' + plata(p.saldo);
    }
  } else {
    // Talleres: el precio varía por edición (Tikzet cobra distinto), así que
    // no se calcula deuda. Si hay plata cargada, se da por pago.
    p.estadoPago = 'completo';
  }

  // Él mismo marcó que ese pago no está verificado: no se le puede dar por bueno.
  // El monto sigue sumando al cobrado (es lo que dice la planilla), pero sale
  // una alerta con la plata que está en duda.
  if (pagoDesmentido(f.verificado)) {
    p.estadoPago = 'revisar';
    p.enDuda = p.monto;
    p.nota = 'Marcado "' + f.verificado + '" en la columna pago verificado';
  }
  return p;
}

/**
 * Recaudado y saldo de la edición. No deduplica montos automáticamente: si el
 * mismo comprobante aparece en varias filas CON monto, se avisa aparte en vez
 * de decidir por cuenta propia si fue un pago o cuatro.
 */
function calcularPlata(ed) {
  ed.recaudado = ed.personas.reduce(function (acc, p) { return acc + (p.monto || 0); }, 0);
  ed.saldo = ed.personas.reduce(function (acc, p) { return acc + (p.saldo || 0); }, 0);

  var porId = {};
  ed.personas.forEach(function (p) {
    if (!p.idPago || !p.monto) return;
    (porId[p.idPago] = porId[p.idPago] || []).push(p);
  });
  ed.pagosCompartidos = Object.keys(porId)
    .filter(function (k) { return porId[k].length > 1; })
    .map(function (k) {
      return {
        comprobante: k,
        cuanto: porId[k].reduce(function (a, p) { return a + p.monto; }, 0),
        quienes: porId[k].map(function (p) { return p.nombre; })
      };
    });

  ed.pendientes = ed.personas.filter(function (p) {
    return p.estadoPago === 'parcial' || p.estadoPago === 'sin_pago' || p.estadoPago === 'revisar';
  });
}


/* ======================================================================
   5. ALERTAS — solo lo que necesita que alguien haga algo
   ====================================================================== */

/**
 * El precio del curso es el único número escrito a mano en toda la app
 * (PRECIOS). Si algún día cambia y nadie toca el código, los saldos quedan mal
 * en silencio: la app diría que falta plata que ya está paga, o al revés.
 *
 * Esto no adivina el precio nuevo ni lo usa para calcular: mira lo que está
 * pagando la gente y avisa si ya no se parece a lo que dice el código.
 */
function revisarPrecioDelCurso(ediciones) {
  var montos = [];
  ediciones.forEach(function (ed) {
    if (!ed.esCurso || !ed.vigente) return;
    ed.personas.forEach(function (p) { if (p.monto) montos.push(p.monto); });
  });
  if (montos.length < 3) return null;   // con dos pagos no hay nada que concluir

  var frecuente = masFrecuente(montos);
  if (!frecuente || frecuente.veces < 3) return null;
  if (frecuente.valor === PRECIOS.cursoTotal || frecuente.valor === PRECIOS.cursoCuota) return null;

  return {
    nivel: 'alta', tipo: 'precio_viejo', edicion: '',
    texto: 'El precio del curso que usa la app quedó viejo',
    detalle: 'La mayoría está pagando ' + plata(frecuente.valor) + ' (' + frecuente.veces + ' de ' +
             montos.length + ' pagos), pero la app calcula las deudas contra ' + plata(PRECIOS.cursoTotal) +
             '. Mientras siga así, lo que falta cobrar está mal. Hay que actualizar PRECIOS en el código.'
  };
}

/**
 * Un monto muchísimo más chico que el resto de su taller. No se puede saber el
 * precio de un taller (varía por edición, y hay quien paga por dos o por
 * cuatro), así que no se calcula deuda: solo se avisa de lo que no puede ser
 * un pago de verdad, como $433 en un taller donde todos pagan miles.
 */
function detectarMontosRaros(ediciones) {
  var alertas = [];
  ediciones.forEach(function (ed) {
    if (ed.esCurso || !ed.vigente) return;
    var montos = ed.personas.map(function (p) { return p.monto; }).filter(function (m) { return m; });
    if (montos.length < 4) return;      // sin varios pagos no hay con qué comparar
    var corte = mediana(montos) / 3;
    ed.personas.forEach(function (p) {
      if (!p.monto || p.monto >= corte) return;
      alertas.push({
        nivel: 'media', tipo: 'monto_raro', edicion: ed.edicion,
        texto: p.nombre + ': ' + plata(p.monto) + ' es muy poco para este taller',
        detalle: 'El resto de "' + ed.edicion + '" paga alrededor de ' + plata(mediana(montos)) +
                 '. Está en ' + p.hoja + ', fila ' + p.fila + '. Suma al cobrado como si fuera un pago entero.'
      });
    });
  });
  return alertas;
}

function masFrecuente(nums) {
  var cuenta = {}, mejor = null;
  nums.forEach(function (n) {
    cuenta[n] = (cuenta[n] || 0) + 1;
    if (!mejor || cuenta[n] > mejor.veces) mejor = { valor: Number(n), veces: cuenta[n] };
  });
  return mejor;
}

function mediana(nums) {
  var o = nums.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

function detectarAlertas(todasLasEdiciones, filas, usadas, hoy, duplicadas, esperaGlobal, giftGlobal) {
  var alertas = [];
  // Una edición que ya pasó no se arregla: alertar sobre ella es solo ruido.
  var ediciones = todasLasEdiciones.filter(function (e) { return e.vigente; });
  var abiertas = ediciones;

  // a) El Panel dice un número y las filas dicen otro: alguna fórmula quedó mal.
  ediciones.forEach(function (ed) {
    if (!ed.regla) {
      alertas.push({
        nivel: 'alta', tipo: 'formula', edicion: ed.edicion,
        texto: 'No se pudo leer cómo cuenta "' + ed.edicion + '"',
        detalle: 'Fila ' + ed.filaPanel + ' del Panel, columna Anotados: ' +
                 (ed.motivoFormula || 'no tiene el formato esperado.') +
                 ' Mientras esté así, la app no puede mostrar la gente de esta edición.'
      });
      return;
    }
    // La pestaña va primero: con el nombre mal escrito la celda también da #REF!,
    // y la causa es una sola. Dos alertas por lo mismo confunden.
    if (ed.pestanaInexistente) {
      alertas.push({
        nivel: 'alta', tipo: 'pestana_inexistente', edicion: ed.edicion,
        texto: '"' + ed.edicion + '" cuenta en una pestaña que no existe',
        detalle: 'La fórmula de la fila ' + ed.filaPanel + ' del Panel cuenta en "' + ed.regla.hoja +
                 '", y esa pestaña no está en la planilla. Revisá cómo está escrito el nombre. ' +
                 'Mientras tanto la app no puede mostrar la gente de esta edición ni cuántos lugares quedan.'
      });
      return;
    }
    if (ed.anotadosIlegible) {
      alertas.push({
        nivel: 'alta', tipo: 'anotados_ilegible', edicion: ed.edicion,
        texto: ed.edicion + ': la celda Anotados del Panel no tiene un número',
        detalle: 'Fila ' + ed.filaPanel + ' del Panel: la celda Anotados ' +
                 (ed.anotadosIlegible === '(vacía)' ? 'está vacía' : 'dice ' + ed.anotadosIlegible) +
                 '. La app muestra ' + ed.anotados + ', que son las filas que encontró para esta edición.'
      });
      return;
    }
    if (ed.personas.length !== ed.anotados) {
      alertas.push({
        nivel: 'alta', tipo: 'descuadre', edicion: ed.edicion,
        texto: ed.edicion + ': el Panel dice ' + ed.anotados + ' y hay ' + ed.personas.length + ' fila' + (ed.personas.length === 1 ? '' : 's'),
        detalle: 'Los dos números salen de la misma planilla, así que uno de los dos está mal. Mirá la fila ' + ed.filaPanel + ' del Panel.'
      });
    }
  });

  // a-bis) Dos filas del Panel se pelean por la misma persona.
  (duplicadas || []).forEach(function (d) {
    alertas.push({
      nivel: 'alta', tipo: 'doble_conteo', edicion: d.edicion,
      texto: (d.fila.nombre || 'Una fila sin nombre') + ' cae en dos ediciones a la vez',
      detalle: 'Cuenta en "' + d.ya + '" y también en "' + d.edicion + '". Se la contó una sola vez, ' +
               'en la primera. Dos filas del Panel están usando la misma regla — revisá la columna Anotados.'
    });
  });

  // a-ter) El Panel llegó al tope que se lee: de acá en más, una edición nueva
  // no aparecería y nadie se enteraría. Mejor avisar antes de que pase.
  if (filas.panelLleno) {
    alertas.push({
      nivel: 'alta', tipo: 'panel_lleno', edicion: '',
      texto: 'El Panel llegó a la fila ' + FILAS_PANEL,
      detalle: 'La app lee hasta ahí. Si agregás más ediciones, no las va a mostrar. ' +
               'Hay que subir FILAS_PANEL en el código.'
    });
  }

  // a-quater) Las columnas del Panel no están donde la app las lee.
  var panelRaro = filas.panelColumnas || [];
  if (panelRaro.length) {
    alertas.push({
      nivel: 'alta', tipo: 'panel_columnas', edicion: '',
      texto: 'Las columnas del Panel no están donde la app las busca',
      detalle: 'La app lee la Edición en la columna B, el Cupo en la C, los Anotados en la D y el Estado en la F. ' +
               panelRaro.map(function (r) {
                 return 'La ' + r.columna + ' tendría que decir "' + r.esperaba + '" y dice "' + (r.dice || '(vacía)') + '"';
               }).join('. ') +
               '. Si agregaste una columna, pasala a la derecha de Estado. Mientras tanto, lo que muestra la app puede estar mal.'
    });
  }

  // a-quinquies) Una pestaña de inscriptos sin alguna de sus columnas. Solo las
  // que tienen algo que ver con lo que viene: una pestaña vieja no se arregla.
  var hojasVigentes = {};
  ediciones.forEach(function (ed) { if (ed.regla) hojasVigentes[normalizarNombre(ed.regla.hoja)] = true; });
  (filas.columnasRaras || []).forEach(function (c) {
    if (!hojasVigentes[normalizarNombre(c.hoja)] && !estaVigente(c.hoja, false, hoy)) return;
    var plataEnJuego = c.faltan.indexOf('montoTexto') !== -1 || c.faltan.indexOf('verificado') !== -1;
    alertas.push({
      nivel: plataEnJuego ? 'alta' : 'media', tipo: 'columnas', edicion: '',
      texto: 'En "' + c.hoja + '" no encuentro la columna ' +
             c.faltan.map(function (k) { return NOMBRE_COLUMNA[k] || k; }).join(', '),
      detalle: 'La busco por el título de la fila 1. Como no está, la leo en su lugar de siempre, ' +
               'y puede ser la columna equivocada. Revisá los títulos de esa pestaña.'
    });
  });

  // a-sexies) El Cupo del Panel no es un número. La edición se muestra igual, con
  // su gente y su plata, pero no se sabe cuántos lugares quedan.
  ediciones.forEach(function (ed) {
    if (ed.cupo !== null) return;
    alertas.push({
      nivel: ed.abierta ? 'alta' : 'media', tipo: 'cupo_ilegible', edicion: ed.edicion,
      texto: ed.edicion + ': el Cupo no se entiende',
      detalle: 'Fila ' + ed.filaPanel + ' del Panel, columna Cupo: ' +
               (ed.cupoTexto ? 'dice "' + ed.cupoTexto + '"' : 'está vacía') +
               '. La gente y la plata se muestran igual, pero no se sabe cuántos lugares quedan.'
    });
  });

  // b) Sobrecupo. (Con el cupo sin cargar, quedan es null y null < 0 da false.)
  ediciones.forEach(function (ed) {
    if (ed.quedan < 0) {
      alertas.push({
        nivel: ed.abierta ? 'alta' : 'media', tipo: 'sobrecupo', edicion: ed.edicion,
        texto: ed.edicion + ': hay ' + Math.abs(ed.quedan) + ' persona' + (Math.abs(ed.quedan) === 1 ? '' : 's') + ' de más',
        detalle: 'Cupo ' + ed.cupo + ', anotados ' + ed.anotados + '.'
      });
    }
  });

  // c) Curso: fila cuyo horario no cae en ningún grupo. Esa inscripción no la
  //    cuenta nadie y desaparece del cupo sin avisar.
  var gruposPorK = {};
  ediciones.forEach(function (ed) {
    if (!ed.regla || !ed.regla.criterioE) return;
    var k = normalizarNombre(ed.regla.hoja) + '||' + ed.regla.criterioK;
    (gruposPorK[k] = gruposPorK[k] || []).push(ed.regla.criterioE);
  });
  Object.keys(gruposPorK).forEach(function (k) {
    var partes = k.split('||');
    filas.forEach(function (f) {
      if (normalizarNombre(f.hoja) !== normalizarNombre(partes[0])) return;
      if (!coincideCriterio(f.edicion, partes[1])) return;
      var entra = gruposPorK[k].some(function (c) { return coincideCriterio(f.horario, c); });
      if (!entra) {
        alertas.push({
          nivel: 'alta', tipo: 'sin_grupo', edicion: partes[1],
          texto: (f.nombre || 'Una fila sin nombre') + ' no cuenta en ningún grupo del curso',
          detalle: 'Su horario dice "' + (f.horario || '(vacío)') + '", que no coincide con ' + gruposPorK[k].join(' / ') + '. Está en ' + f.hoja + ', fila ' + f.fila + '. No suma al cupo de nadie.'
        });
      }
    });
  });

  // d) Filas que no pertenecen a ninguna edición del Panel.
  filas.forEach(function (f) {
    if (usadas[f.clave]) return;
    var intencional = PREFIJOS_INTENCIONALES.some(function (p) {
      return f.edicion.toLowerCase().indexOf(p.toLowerCase()) === 0;
    });
    if (intencional || !f.edicion) return;
    if (!estaVigente(f.hoja, false, hoy) && !estaVigente(f.edicion, false, hoy)) return;
    alertas.push({
      nivel: 'media', tipo: 'huerfana', edicion: f.edicion,
      texto: (f.nombre || 'Una fila sin nombre') + ' no entra en ninguna edición del Panel',
      detalle: 'Su Edición dice "' + f.edicion + '". Está en ' + f.hoja + ', fila ' + f.fila + '.'
    });
  });

  // e) Mismo comprobante cargado con monto en varias filas: puede estar
  //    inflando el recaudado (o puede ser un pago grupal bien cargado).
  ediciones.forEach(function (ed) {
    ed.pagosCompartidos.forEach(function (pc) {
      alertas.push({
        nivel: 'media', tipo: 'comprobante_repetido', edicion: ed.edicion,
        texto: 'El comprobante ' + pc.comprobante + ' está cargado ' + pc.quienes.length + ' veces con monto',
        detalle: 'Suma ' + plata(pc.cuanto) + ' entre ' + pc.quienes.join(', ') + '. Si fue un solo pago, el recaudado de "' + ed.edicion + '" está inflado.'
      });
    });
  });

  // f) Plata que falta en ediciones abiertas.
  abiertas.forEach(function (ed) {
    ed.pendientes.forEach(function (p) {
      alertas.push({
        nivel: p.estadoPago === 'revisar' ? 'media' : 'media',
        tipo: 'pago', edicion: ed.edicion,
        texto: p.nombre + ' — ' + p.nota,
        detalle: ed.edicion + (p.email ? ' · ' + p.email : '')
      });
    });
  });

  // f-bis) El precio del curso que usa la app dejó de coincidir con lo que paga
  //        la gente, y los saldos calculados están mal.
  var precio = revisarPrecioDelCurso(todasLasEdiciones);
  if (precio) alertas.push(precio);

  // f-ter) Montos que no pueden ser un pago de verdad.
  detectarMontosRaros(ediciones).forEach(function (a) { alertas.push(a); });

  // f-quater) Pagos que él mismo marcó como no verificados y siguen sumando al cobrado.
  ediciones.forEach(function (ed) {
    ed.personas.forEach(function (p) {
      if (!p.enDuda) return;
      alertas.push({
        nivel: 'alta', tipo: 'sin_verificar', edicion: ed.edicion,
        // El monto va en el detalle, no en el texto: el texto se muestra en la
        // portada y ahí no se muestra plata.
        texto: p.nombre + ': hay un pago sin verificar',
        detalle: 'La planilla dice "' + p.verificado + '" en la columna pago verificado (fila ' + p.fila +
                 ' de ' + p.hoja + '), y esos ' + plata(p.enDuda) + ' están sumando al cobrado de "' +
                 ed.edicion + '".'
      });
    });
  });

  // f-quinquies) En Gift Cards no se encontró la columna del monto. La app no
  //              puede inventar el dato, pero sí decir qué columnas vio.
  if (giftGlobal && giftGlobal.faltaElMonto) {
    alertas.push({
      nivel: 'media', tipo: 'gift_sin_monto', edicion: '',
      texto: 'No sé cuánto valen las ' + giftGlobal.length + ' gift cards',
      detalle: 'En la pestaña "' + HOJA_GIFT + '" no encontré una columna con el importe. ' +
               'Las columnas que hay son: ' + (giftGlobal.columnas || []).join(', ') + '. ' +
               'Mientras tanto no se cuentan como plata cobrada por adelantado.'
    });
  }

  // f-sexies) Hay gente en la lista de espera pero la app no pudo leerla. Una
  //           lista vacía y una pestaña ilegible dan cero las dos: hay que
  //           poder distinguirlas.
  if (esperaGlobal && esperaGlobal.noSeSupoLeer) {
    alertas.push({
      nivel: 'alta', tipo: 'espera_ilegible', edicion: '',
      texto: 'Hay ' + esperaGlobal.filasEnLaPestana + ' en la lista de espera y no pude leer ninguna',
      detalle: 'En la pestaña "' + HOJA_ESPERA + '" no encontré ni nombre ni mail. ' +
               'Las columnas que hay son: ' + (esperaGlobal.columnas || []).join(', ') + '.'
    });
  }
  if (esperaGlobal && esperaGlobal.sinColumnaEdicion) {
    alertas.push({
      nivel: 'media', tipo: 'espera_sin_edicion', edicion: '',
      texto: 'No sé qué está esperando la gente de la lista de espera',
      detalle: 'En la pestaña "' + HOJA_ESPERA + '" no encontré una columna que diga qué taller o curso ' +
               'quiere cada uno. Las columnas que hay son: ' + (esperaGlobal.columnas || []).join(', ') + '. ' +
               'Se muestran igual en la lista general, pero no se pueden ligar a su edición.'
    });
  }

  // f-septies) La edición trae algo con forma de fecha que no se entiende.
  todasLasEdiciones.forEach(function (ed) {
    if (ed.fecha) return;
    if (!/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(ed.edicion)) return;
    alertas.push({
      nivel: 'media', tipo: 'fecha_rara', edicion: ed.edicion,
      texto: 'No entiendo la fecha de "' + ed.edicion + '"',
      detalle: 'Fila ' + ed.filaPanel + ' del Panel. La fecha tiene que ir como 18/09/2026, con el ' +
               'año de cuatro cifras y un día que exista. Sin fecha, la edición solo aparece mientras ' +
               'esté marcada Abierto, y no muestra cuánto falta.'
    });
  });

  // f-octies) El Estado dice algo que no es Abierto ni Cerrado: la app lo toma
  //           como cerrado. Importa en lo que viene, y en las ediciones sin fecha,
  //           que dependen de estar Abiertas para aparecer.
  todasLasEdiciones.forEach(function (ed) {
    if (!ed.estadoRaro) return;
    if (!ed.vigente && ed.fecha) return;
    alertas.push({
      nivel: 'media', tipo: 'estado_raro', edicion: ed.edicion,
      texto: 'Fila ' + ed.filaPanel + ' del Panel: no entiendo el Estado "' + ed.estado + '"',
      detalle: 'Tiene que decir Abierto o Cerrado. Mientras tanto "' + ed.edicion + '" figura como cerrada.'
    });
  });

  // g) Tikzet sin monto: es carga manual, es donde más se rompe.
  ediciones.forEach(function (ed) {
    ed.personas.forEach(function (p) {
      if (!p.esTikzet) return;
      if (p.monto || p.estadoPago === 'cubierto') return;
      alertas.push({
        nivel: 'media', tipo: 'tikzet', edicion: ed.edicion,
        texto: p.nombre + ': venta de Tikzet sin monto cargado',
        detalle: 'Fila ' + p.fila + ' de ' + p.hoja + '. Las ventas de Tikzet se cargan a mano, cruzá contra el panel de Tikzet.'
      });
    });
  });

  // g-bis) Está lleno y hay gente esperando: si alguien larga, hay a quién llamar.
  (esperaGlobal || []).forEach(function (x) {
    if (!x.edicion) return;
    var ed = ediciones.filter(function (e) { return e.edicion === x.edicion; })[0];
    // Sin cupo cargado no se sabe si está llena: decirlo sería inventarlo.
    if (!ed || ed.quedan === null || ed.quedan > 0) return;
    alertas.push({
      nivel: 'info', tipo: 'espera', edicion: ed.edicion,
      texto: x.nombre + ' está esperando lugar en ' + ed.edicion,
      detalle: 'Esa edición está llena. Si alguien larga, hay a quién llamar.'
    });
  });

  // g-ter) Alguien quedó esperando un taller que YA PASÓ. Sin esto no aparece en
  //        ningún lado: la alerta de arriba solo mira ediciones vigentes, así que
  //        esa persona se queda esperando para siempre y nadie la llama.
  (esperaGlobal || []).forEach(function (x) {
    if (!x.edicion) return;
    var ed = todasLasEdiciones.filter(function (e) { return e.edicion === x.edicion; })[0];
    if (!ed || ed.vigente) return;

    // La próxima fecha de lo mismo, HAYA O NO lugar. Decir "no hay otra fecha"
    // cuando en realidad la hay pero está llena es peor que no decir nada: esa
    // persona es justamente a quien llamar si alguien larga.
    var proxima = ediciones
      .filter(function (e) { return normalizarNombre(e.titulo) === normalizarNombre(ed.titulo); })
      .sort(function (a, b) {
        return String(a.fecha || '9999') < String(b.fecha || '9999') ? -1 : 1;
      })[0];

    var queHacer;
    if (!proxima) {
      queHacer = 'No hay otra fecha de eso todavía.';
    } else if (proxima.quedan === null) {
      queHacer = 'La próxima es "' + proxima.edicion + '", pero su cupo no está cargado en el Panel.';
    } else if (proxima.quedan > 0) {
      queHacer = 'Hay otra fecha con lugar: "' + proxima.edicion + '", ' + proxima.quedan +
                 (proxima.quedan === 1 ? ' lugar libre.' : ' lugares libres.');
    } else {
      queHacer = 'La próxima es "' + proxima.edicion + '", pero está llena. ' +
                 'Si alguien larga, esta persona es a quien llamar.';
    }

    alertas.push({
      nivel: 'media', tipo: 'espera_vieja', edicion: ed.edicion,
      texto: (x.nombre || 'Alguien') + ' quedó esperando un taller que ya pasó',
      detalle: 'Esperaba "' + ed.edicion + '". ' + queHacer
    });
  });

  // h) Casi lleno (buena noticia, pero hay que actuar).
  abiertas.forEach(function (ed) {
    if (ed.cupo > 0 && ed.quedan > 0 && ed.ocupacion >= 0.7) {
      alertas.push({
        nivel: 'info', tipo: 'casi_lleno', edicion: ed.edicion,
        texto: ed.edicion + ': quedan ' + ed.quedan + ' lugar' + (ed.quedan === 1 ? '' : 'es'),
        detalle: 'Está al ' + Math.round(ed.ocupacion * 100) + '% del cupo.'
      });
    }
  });

  // Se marca sola: la portada no muestra el detalle de las que hablan de plata.
  // Calcularlo acá y no a mano evita que una alerta nueva se olvide de marcarse.
  alertas.forEach(function (a) {
    a.conPlata = /\$/.test((a.texto || '') + ' ' + (a.detalle || ''));
  });

  var orden = { alta: 0, media: 1, info: 2 };
  return alertas.sort(function (a, b) { return orden[a.nivel] - orden[b.nivel]; });
}


/* ======================================================================
   6. TIKZET
   ====================================================================== */

function resumirTikzet(ediciones) {
  var porEdicion = [];
  var vig = { entradas: 0, recaudado: 0, sinMonto: 0 };
  var hist = { entradas: 0, recaudado: 0, sinMonto: 0 };

  ediciones.forEach(function (ed) {
    var suyas = ed.personas.filter(function (p) { return p.esTikzet; });
    if (!suyas.length) return;
    var monto = suyas.reduce(function (a, p) { return a + (p.monto || 0); }, 0);
    var faltantes = suyas.filter(function (p) { return !p.monto && p.estadoPago !== 'cubierto'; }).length;

    if (ed.vigente) {
      vig.entradas += suyas.length; vig.recaudado += monto; vig.sinMonto += faltantes;
      porEdicion.push({
        edicion: ed.edicion, titulo: ed.titulo, subtitulo: ed.subtitulo,
        entradas: suyas.length, recaudado: monto, sinMonto: faltantes
      });
    } else {
      // El histórico también cuenta las que no tienen monto: sin eso, el total
      // sale incompleto y se muestra como si fuera lo que Tikzet realmente trajo.
      hist.entradas += suyas.length; hist.recaudado += monto; hist.sinMonto += faltantes;
    }
  });

  return {
    entradas: vig.entradas, recaudado: vig.recaudado, sinMonto: vig.sinMonto,
    porEdicion: porEdicion, historico: hist
  };
}


/* ======================================================================
   7. FORMATO
   ====================================================================== */

/** $ 12.200 — con punto de miles, como se escribe en Uruguay. */
function plata(n) {
  var v = Math.round(Number(n) || 0);
  var signo = v < 0 ? '-' : '';
  return signo + '$ ' + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
