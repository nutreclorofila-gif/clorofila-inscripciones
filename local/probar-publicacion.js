// La página que usa Leo es web/index.html publicada en la rama gh-pages. Esta
// suite controla que esa página sea la de este código y que publicarla sea parte
// del mismo camino que el servidor.
//
// Existe porque pasó: hasta el 23/9/2026 todas las suites leían
// apps-script/Index.html y ninguna miraba web/index.html, así que la
// verificación daba verde con la página publicada vieja, editada a mano o rota
// (se probó reemplazándola por "<h1>rota</h1>"). Y desplegar.sh subía el
// servidor y terminaba en "LISTO" sin tocar la página: un arreglo de la pantalla
// quedaba en la copia de Apps Script, que no abre nadie, y el teléfono seguía
// con la vieja. La publicación se hacía a mano y sin receta escrita.
//
// Lo de gh-pages se prueba de verdad, contra un repositorio de mentira en una
// carpeta temporal: nunca toca este repositorio ni la red.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const base = path.join(__dirname, '..');

let fallas = 0, corridos = 0;
function caso(nombre, ok, detalle) {
  corridos++;
  if (ok) { console.log('  ok    ' + nombre); return; }
  fallas++;
  console.log('  FALLA ' + nombre + (detalle !== undefined ? '\n        ' + String(detalle).slice(0, 400) : ''));
}
const leer = (r) => fs.readFileSync(path.join(base, r), 'utf8');

console.log('\n--- web/index.html es la página de apps-script/Index.html ---');
let gw = {};
try { gw = require('./generar-web.js'); } catch (e) { caso('local/generar-web.js se puede cargar sin escribir nada', false, e.message); }
const index = leer('apps-script/Index.html');
const web = leer('web/index.html');
caso('generar-web.js expone generar() y alDia() para poder controlarlo',
  typeof gw.generar === 'function' && typeof gw.alDia === 'function', Object.keys(gw).join(', ') || 'no exporta nada');
if (typeof gw.generar === 'function' && typeof gw.alDia === 'function') {
  caso('web/index.html coincide con lo que se genera desde Index.html (si no: node local/generar-web.js)',
    gw.generar(index) === web);
  caso('una página editada a mano se nota',
    gw.alDia(index, web.replace('</body>', '<p>retoque a mano</p></body>')) === false);
  caso('una página vieja (Index.html cambió y no se regeneró) se nota',
    gw.alDia(index.replace('</body>', '<!-- cambio nuevo --></body>'), web) === false);
  caso('una página rota se nota', gw.alDia(index, '<h1>rota</h1>') === false);
  caso('la página al día no se marca como vieja', gw.alDia(index, web) === true);
}
{
  const r = spawnSync('node', [path.join(__dirname, 'generar-web.js'), '--comprobar'], { cwd: base, encoding: 'utf8' });
  caso('"node local/generar-web.js --comprobar" pasa y no escribe nada',
    r.status === 0 && leer('web/index.html') === web, (r.stdout || '') + (r.stderr || ''));
}

console.log('\n--- La URL del servidor está escrita en un solo lugar ---');
// Estaba dos veces (desplegar.sh y generar-web.js) y nada controlaba que
// coincidieran. Si se desfasan, desplegar.sh actualiza una implementación y la
// página le habla a otra.
const desplegar = leer('desplegar.sh');
caso('desplegar.sh no tiene una copia propia de la URL',
  !/AKfyc/.test(desplegar), (desplegar.match(/.*AKfyc.*/) || [''])[0]);
caso('desplegar.sh la toma de generar-web.js', /node local\/generar-web\.js --id/.test(desplegar));
{
  const r = spawnSync('node', [path.join(__dirname, 'generar-web.js'), '--id'], { cwd: base, encoding: 'utf8' });
  const id = (r.stdout || '').trim();
  caso('"generar-web.js --id" da la implementación que usa la página publicada',
    r.status === 0 && /^AKfyc[\w-]+$/.test(id) && web.indexOf('/macros/s/' + id + '/exec') !== -1, id || r.stderr);
}

console.log('\n--- desplegar.sh publica la página, después del servidor ---');
{
  const pos = (re) => { const m = desplegar.match(re); return m ? m.index : -1; };
  const revisa = pos(/local\/publicar-pagina\.sh --revisar/);
  const sube = pos(/\$CLASP push/);
  const comprueba = pos(/curl /);
  const publica = pos(/^local\/publicar-pagina\.sh(\s+#.*)?$/m);
  const version = pos(/e\.forma/);
  caso('antes de subir nada, controla que la página esté commiteada y al día',
    revisa !== -1 && sube !== -1 && revisa < sube, 'revisar en ' + revisa + ', clasp push en ' + sube);
  // El orden importa: la página nueva lee campos que agrega el servidor nuevo.
  // Si se publica primero la página y el servidor falla, Leo queda con una
  // pantalla que espera datos que nadie le manda.
  caso('publica la página recién cuando el servidor nuevo respondió bien',
    publica !== -1 && comprueba !== -1 && publica > comprueba, 'publicar en ' + publica + ', comprobación en ' + comprueba);
  // Si clasp deploy no dejó el código nuevo en la implementación, el servidor
  // responde bien pero con la versión anterior: publicar la página ahí es
  // justo el desfase que se quiere evitar.
  caso('antes de publicar la página, controla que el servidor que responde sea el nuevo',
    version !== -1 && version < publica && /FORMA_ESPERADA/.test(desplegar), 'control de versión en ' + version);
}

console.log('\n--- Servidor y página hablan la misma versión ---');
{
  const enCodigo = (leer('apps-script/Codigo.gs').match(/var FORMA_ESTADO = (\d+);/) || [])[1];
  const enPagina = (index.match(/var FORMA_ESPERADA = (\d+);/) || [])[1];
  caso('Codigo.gs y la página declaran el mismo número de versión',
    enCodigo !== undefined && enCodigo === enPagina, 'servidor: ' + enCodigo + ', página: ' + enPagina);
}

console.log('\n--- local/publicar-pagina.sh contra un gh-pages de mentira ---');
const script = path.join(base, 'local', 'publicar-pagina.sh');
if (!fs.existsSync(script)) {
  caso('existe local/publicar-pagina.sh', false);
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clorofila-publicar-'));
  const env = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Prueba', GIT_AUTHOR_EMAIL: 'prueba@ejemplo.invalid',
    GIT_COMMITTER_NAME: 'Prueba', GIT_COMMITTER_EMAIL: 'prueba@ejemplo.invalid',
    GIT_CONFIG_NOSYSTEM: '1', HOME: tmp
  });
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const correr = (cwd, ...a) => spawnSync('bash', [path.join(cwd, 'local', 'publicar-pagina.sh'), ...a], { cwd, env, encoding: 'utf8' });
  try {
    // El remoto, con un gh-pages que tiene su propia historia y una página vieja.
    const remoto = path.join(tmp, 'remoto.git');
    git(tmp, 'init', '-q', '--bare', remoto);
    const semilla = path.join(tmp, 'semilla');
    fs.mkdirSync(semilla);
    git(semilla, 'init', '-q', '-b', 'gh-pages');
    fs.writeFileSync(path.join(semilla, 'index.html'), '<h1>página vieja</h1>\n');
    git(semilla, 'add', 'index.html');
    git(semilla, 'commit', '-q', '-m', 'Página vieja');
    git(semilla, 'push', '-q', remoto, 'gh-pages');

    // El proyecto: solo lo que el script necesita, commiteado en main.
    const obra = path.join(tmp, 'obra');
    ['local', 'apps-script', 'web'].forEach(d => fs.mkdirSync(path.join(obra, d), { recursive: true }));
    for (const f of ['local/generar-web.js', 'local/publicar-pagina.sh', 'apps-script/Index.html', 'web/index.html']) {
      fs.copyFileSync(path.join(base, f), path.join(obra, f));
    }
    git(obra, 'init', '-q', '-b', 'main');
    git(obra, 'add', '-A');
    git(obra, 'commit', '-q', '-m', 'La app, de prueba');
    git(obra, 'remote', 'add', 'origin', remoto);
    const enGhPages = () => git(remoto, 'show', 'gh-pages:index.html') + '\n';
    const commitsGhPages = () => Number(git(remoto, 'rev-list', '--count', 'gh-pages'));
    const paginaObra = () => fs.readFileSync(path.join(obra, 'web', 'index.html'), 'utf8');

    const rev = correr(obra, '--revisar');
    caso('--revisar con todo commiteado pasa y no publica nada',
      rev.status === 0 && commitsGhPages() === 1, rev.stdout + rev.stderr);

    const r1 = correr(obra);
    caso('publica web/index.html en gh-pages', r1.status === 0 && enGhPages() === paginaObra(), r1.stdout + r1.stderr);
    caso('suma un commit a la historia de gh-pages, no la pisa', commitsGhPages() === 2, 'commits: ' + commitsGhPages());
    const mensaje = git(remoto, 'log', '-1', '--format=%B', 'gh-pages');
    const corto = git(obra, 'rev-parse', '--short', 'HEAD');
    caso('el commit de gh-pages dice de qué commit de main sale', mensaje.indexOf(corto) !== -1, mensaje);
    caso('no deja carpetas de trabajo colgadas', git(obra, 'worktree', 'list').split('\n').length === 1,
      git(obra, 'worktree', 'list'));

    const r2 = correr(obra);
    caso('si gh-pages ya tiene esta página, no hace otro commit',
      r2.status === 0 && commitsGhPages() === 2, r2.stdout + r2.stderr);

    // Un cambio en Index.html sin commitear: se publicaría algo que no está en
    // ningún commit de main y nadie sabría de dónde salió.
    fs.appendFileSync(path.join(obra, 'apps-script', 'Index.html'), '\n<!-- cambio sin commitear -->\n');
    const rev2 = correr(obra, '--revisar');
    caso('--revisar se planta con Index.html sin commitear', rev2.status !== 0 && commitsGhPages() === 2, rev2.stdout + rev2.stderr);
    const r3 = correr(obra);
    caso('con cambios sin commitear no publica', r3.status !== 0 && commitsGhPages() === 2, r3.stdout + r3.stderr);
    caso('y dice qué hacer, en castellano', /commit/i.test(r3.stdout + r3.stderr) && !/fatal:/.test(r3.stdout), r3.stdout + r3.stderr);
  } catch (e) {
    caso('el repositorio de mentira se pudo armar', false, (e.stderr || '') + e.message);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('\n' + (corridos - fallas) + '/' + corridos + ' pasan');
if (fallas) process.exit(1);
