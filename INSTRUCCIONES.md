# Clorofila — Inscripciones en el celu

App web **solo lectura** para ver el estado de las inscripciones desde el teléfono.
Misma familia que `~/Proyectos/clorofila-comandas`: un solo archivo, sin build, mobile-first.

## URL

**https://nutreclorofila-gif.github.io/clorofila-inscripciones/** — se abre con un PIN de
6 dígitos. El PIN queda guardado en el teléfono: se escribe una sola vez.

(Sigue existiendo una copia en `clorofila-inscripciones.netlify.app`, de cuando la página
vivía ahí. Funciona igual, pero la de GitHub es la buena: no consume créditos de Netlify.)

Desde Safari en el celu: **Compartir → Añadir a pantalla de inicio** y queda como una app.

## Cómo está armado (y por qué así)

Son dos piezas:

| Pieza | Dónde | Qué hace |
|---|---|---|
| Página | GitHub Pages, repo público `nutreclorofila-gif/clorofila-inscripciones`, rama `gh-pages` | Todo lo que se ve. Un solo HTML. Gratis, cuota aparte de Netlify. |
| API | Apps Script de `nutreclorofila` | Lee la Master Sheet y devuelve los números en JSON. |

**Por qué la página no vive en Apps Script**, que sería más simple: abrir una web app de
Apps Script falla en cualquier navegador con **varias cuentas de Google logueadas** — Google
reescribe la URL agregando `/u/1/` y esa forma devuelve *"No se pudo abrir el archivo en
este momento"*. En el Chrome de escritorio hay tres cuentas, así que ahí no había forma de
abrirla. Sirviendo la página desde Netlify y hablando con la API por `fetch` con
`credentials:'omit'`, no viajan cookies de sesión y el problema desaparece en todos lados.

## El PIN

La API está publicada con acceso anónimo (si no, vuelve el problema de arriba), así que el
PIN es lo único que separa la URL de los datos personales de los inscriptos:

- La página se sirve **vacía**: los datos no viajan hasta que el PIN es correcto.
- Se guarda **hasheado** (SHA-256), nunca en claro, ni en el código ni en el repo.
- **8 intentos cada 15 minutos.** A ese ritmo, probar los 1.000.000 de PINs llevaría años.
- Se configura una sola vez con `?formato=json&configurar=<pin>`, que **solo funciona
  mientras no haya ninguno guardado**: no sirve para cambiarlo ni para pisarlo.

Para cambiarlo hay que borrar la propiedad `PIN_HASH` del script
(Configuración del proyecto → Propiedades de la secuencia de comandos) y volver a llamar a
`?configurar=`.

## Agregar un taller o un curso nuevo

**No hay que tocar la app.** Alcanza con cargarlo en la pestaña **Panel** como se hace hoy,
y la app lo muestra sola en cuanto le des a Actualizar.

Para un **taller**: una fila con la fecha en la Edición y `COUNTIF` sobre la columna K.
```
Taller de risotto | Taller de risotto — 03/12/2026 | 10 | =COUNTIF('Inscriptos Diciembre 2026'!K:K;B7) | =C7-D7 | Abierto
```

Para un **curso con grupos**: una fila por grupo, con `COUNTIFS` sobre K (genérica) y E (el
horario), igual que los del curso de octubre.

También hay que tener creada la pestaña `Inscriptos <Mes> <Año>`; la app la detecta sola por
el nombre, y no se rompe si todavía está vacía.

La fórmula podés escribirla como te salga. La app entiende `;` o `,`, la pestaña con
comillas o sin ellas, `$K:$K`, `K2:K500`, `$B$5`, envuelta en `IFERROR`, en minúsculas, y
en el curso da igual el orden de los pares (K primero o E primero). Si aun así no la
entiende, no se queda callada: saca una alerta alta diciendo qué tiene de raro —
*"cuenta lo que dice B2, pero esta es la fila 5"*, *"mira la columna D"*, *"suma más de un
COUNTIF"*.

Probado el 9/9/2026 simulando un taller de una actividad que nunca existió, un curso nuevo
con dos grupos y una pestaña de un mes nuevo: la app tomó las tres cosas sin tocar código.
El 10/9 se agregaron 12 formas distintas de escribir la fórmula (`local/probar-planilla-a-mano.js`).

El Panel se lee hasta la fila **500**. Si alguna vez se llegara a ese tope, la app avisa con
una alerta alta en vez de dejar de mostrar ediciones en silencio.

## Qué muestra

| Solapa | Qué hay |
|---|---|
| **Cupos** | Una tarjeta por edición vigente con `anotados / cupo` en número grande, barra de ocupación, cobrado y cuántos deben. Se toca la tarjeta y se despliega la gente. Abajo, las ediciones que ya pasaron, colapsadas. |
| **Plata** | Cobrado total de lo que viene, desglose por edición, lista de quién debe y cuánto, y el bloque de Tikzet. |
| **Gente** | Todos los inscriptos con buscador por nombre, mail o celular, y su estado de pago. |
| **Alertas** | Solo lo que necesita que alguien haga algo: descuadres, sobrecupo, pagos incompletos, Tikzet sin cargar. Si no hay nada, no hay nada. |

Además:

- **Tocar a una persona abre su contacto**: botón de WhatsApp y de mail. El celular se
  normaliza a formato uruguayo (`099123456` → `598099123456`); si es un fijo o está
  incompleto **no se ofrece el botón**, para no abrir un chat con el número equivocado.
- **Las ediciones se ordenan por fecha**, lo más próximo primero, con `ES HOY` /
  `es mañana` / `en N días`.
- **Copiar la lista de anotados** de una edición, con el estado de pago de cada uno, para
  pegarla en el grupo.
- **Funciona sin señal**: guarda el último estado en el teléfono y lo muestra avisando de
  cuándo es. El caché se guarda junto al PIN con que se obtuvo, así que sin el PIN correcto
  no se muestra ni aunque alguien agarre el teléfono.

## De dónde salen los números

De la Master Sheet `1C3UfC__jr3F0x_XWp5lRvL47MLjQqOwTa9wURKuXZBQ`. Nada está hardcodeado:
cuando entra una inscripción nueva, el botón **Actualizar** la trae.

Los cupos salen de la pestaña **Panel** tal como está. Para saber qué personas
pertenecen a cada edición, la app **lee la fórmula de la columna "Anotados"** del Panel
en vez de reimplementar la regla. Eso importa porque conviven dos convenciones:

- **Talleres:** la Edición (columna K) lleva la fecha y se cuenta con `COUNTIF` sobre K.
- **Curso de cocina:** la columna K es genérica (`Curso de cocina — Octubre 2026`) y el
  grupo lo define la **columna E "horario"** (`Mañana` / `Tarde` / `Sábados`).
  Que "Jueves 10-12h" sea el grupo "Mañana" **solo lo dice la fórmula** — no hay ninguna
  columna que lo diga. Por eso se lee la fórmula: si mañana cambia, la app la sigue sola.

Si una fila del curso tiene la columna E vacía o con un valor que no matchea ningún grupo,
esa persona no la cuenta nadie y desaparece del cupo. La app lo levanta como alerta alta.

## Lo que NO hace por su cuenta

- **No deduplica montos.** Si el mismo número de comprobante aparece cargado con monto en
  varias filas, avisa ("el comprobante X está cargado 3 veces") en vez de decidir sola si
  fue un pago o tres. En la planilla hay casos de las dos formas.
- **No calcula deuda en los talleres**, porque el precio varía por edición (Tikzet cobra
  distinto). Solo dice si hay pago cargado o no. El saldo se calcula únicamente en el curso,
  donde el precio es fijo: $12.200 el total, $4.800 la cuota (en `PRECIOS`, arriba de todo).
- **No escribe nada en la planilla.** El único scope que pide es `spreadsheets.readonly`.

## Desplegar cambios

**La página** (`web/index.html`, que se genera desde `apps-script/Index.html`):
```bash
npx -y @netlify/mcp@latest --site-id 4f9b1156-1240-41af-ae84-38dc0a83f5bb
```
No tiene build command, así que no consume minutos de compilación.

**La API** (`apps-script/Codigo.gs`): pegar en
[el editor](https://script.google.com/u/1/home/projects/13XHxKVCAS693-LHSTZhyQOMzy5vhXfax4Yxz4WRe2Xv6chb-kx4CvL67/edit)
→ guardar → **Implementar → Administrar implementaciones → lápiz → Versión: Versión nueva →
Implementar**. Si se crea una implementación nueva en vez de editar la existente, cambia la
URL y hay que actualizarla en `web/index.html`.

⚠️ Al copiar código al portapapeles para pegarlo, usar **`LC_CTYPE=UTF-8 pbcopy`**. Sin eso,
`pbcopy` convierte a MacRoman y rompe los acentos — y la lógica del curso compara contra
`"Mañana"` y `"Sábados"`, así que se rompen los conteos en silencio.

## Verificar

```bash
./verificar.sh                  # corre las 10 suites; tiene que pasar entero antes de subir
node local/bajar-fixture.js     # refresca local/fixture.json con los datos de hoy
node local/generar-preview.js   # arma local/preview.html para mirarla en el navegador
node local/probar-las-pruebas.js  # rompe el código a propósito y controla que la suite se dé cuenta
```

⚠️ **`probar-las-pruebas.js` es el control más importante y no está en `verificar.sh`** (tarda
unos minutos: corre la suite entera una vez por mutación). Correlo cada vez que se toquen las
pruebas. Una prueba que nunca falla no prueba nada, y eso no se ve leyéndola.

| Suite | Qué prueba |
|---|---|
| `local/probar.js` | Los conteos contra el Panel real, edición por edición. **12 de 12 cuadran.** |
| `local/casos-limite.js` | 11 escenarios plausibles de la planilla que podrían romperla. |
| `local/probar-lectura.js` | `leerPlanilla()` con un Sheets falso: qué pestañas lee y cuáles no. |
| `local/probar-codigo.js` | Control estático de `Codigo.gs` **antes de pegarlo**: que parsee, que no llame funciones que no existen, que no vuelva a usar `SpreadsheetApp`, que no escriba en la planilla y que la página se siga sirviendo vacía. Verificado rompiendo el archivo a propósito: detecta los cuatro casos. |
| `local/probar-pin.js` | Que sin el PIN correcto no salga nada, y el freno a los intentos. |
| `local/probar-plata.js` | 16 casos de la lógica de plata: señas, precio del curso, montos raros, comprobantes repetidos, columna de verificación. |
| `local/probar-planilla-a-mano.js` | 33 casos: cómo se puede escribir la fórmula del Panel, la lista de espera y las gift cards. |
| `local/probar-cache.js` | 17 casos: qué queda guardado en el teléfono, cuándo vence y que "Salir" lo borre. |
| `local/probar-vistas.js` | Las cuatro solapas con datos nuevos, con un backend viejo y con la planilla vacía. |
| `local/probar-xss.js` | Datos hostiles del Tally público: el escape al incrustar, y que al pintarlos no quede ninguna etiqueta ni ningún manejador vivo — incluidos los enlaces de contacto, que es donde el dato entra dentro de un `href`. |

## Buscar gente

El buscador de la solapa **Gente** ignora los acentos y la ñ: "sofia" encuentra a
*Sofía*, "tomas" a *Tomás*, "nunez" a *Núñez*. Las palabras van en cualquier orden
("gomez sofia" encuentra a *Sofía Gómez*).

Si lo que escribís son números, busca por celular en cualquier formato: `099817677`,
`099 817 677`, `+598 99 817 677` o solo los últimos dígitos. Sirve para pegar directo lo
que copiaste de WhatsApp.

## La plata no se ve en la portada

Lo primero que aparece al abrir la app son **anotados, lugares libres y pagos pendientes**.
Ningún monto: ni arriba, ni en las tarjetas de cada edición. La app se abre en el local y
en la calle, con gente al lado.

Lo cobrado vive entero en la solapa **Plata**, a un toque: el total, lo que falta cobrar,
el desglose por edición, quién debe y las gift cards.

El botón **"Copiar la lista de anotados"** copia **solo los nombres**, con el título y el
cupo. Esa lista se pega en el grupo o se le manda a la cocina: antes copiaba también el
estado de pago (*"Mengano — Debe $ 9.200"*), o sea que contaba quién debe y cuánto.

Hay una prueba que lo garantiza (`local/probar-vistas.js`): si algún día un monto vuelve a
la portada, la verificación falla. Comprobado devolviéndolo a propósito.

## Qué cambió desde la última vez

Al abrirla, si se anotó alguien desde la última vez que la abriste, aparece arriba:
*"Se anotaron 2 personas desde hace 6 h — Fulana, Mengano"*. Si no cambió nada, no aparece
nada. Sin montos, como todo lo de la portada.

La comparación es **por mail** (o por nombre si no hay mail), nunca por número de fila:
insertar una fila en la planilla correría todas las demás y la app diría que se anotaron
doce personas de golpe.

## Lo que queda guardado en el teléfono

La app guarda el último estado en el navegador del celular para poder abrirla sin señal.
**Eso incluye nombres, mails y celulares, en texto plano.** El PIN es la puerta de la app,
no cifra lo guardado: quien tenga el teléfono desbloqueado y sepa mirar el almacenamiento
del navegador lo lee.

Por eso:
- Vence a los **3 días**. Además de por privacidad, porque mostrar la plata de la semana
  pasada como si fuera de hoy es peor que no mostrar nada.
- Hay un botón **Salir** arriba a la derecha, que borra el PIN y los datos del teléfono.

## Lo que encontró la revisión (y ya está arreglado)

Cuatro cosas que no se veían leyendo el código y aparecieron al probarlo:

1. **XSS explotable desde el formulario de Tally.** Los nombres los escribe cualquiera en
   un form público. `JSON.stringify` no escapa `</script>`, así que un nombre como
   `</script><script>…` cerraba el bloque y ejecutaba código arbitrario en la sesión de
   Google de quien abriera la app. Verificado con una carga real: se ejecutaba y la app
   ni cargaba. Se arregló escapando `<` (y U+2028/2029) en `paraIncrustarEnScript()`.
2. **Doble conteo.** Si dos filas del Panel usaban la misma regla, la misma persona
   contaba en las dos ediciones e inflaba el recaudado en silencio. Ahora cada fila entra
   en una sola edición y sale una alerta alta diciendo cuáles se pisan.
3. **`"ya esta pago"` se daba por pagado.** Un texto sin monto no prueba nada; ahora va
   a "Revisar" en vez de esconder plata que puede faltar.
4. **La app se podía embeber en un iframe ajeno** (`XFrameOptionsMode.ALLOWALL`, que no
   hacía falta). Se sacó.

También se endureció `leerPlanilla()`: en vez de adivinar las pestañas por el prefijo
"Inscriptos", lee además las que nombren las fórmulas del Panel, así una edición que
apunte a otra pestaña no produce un descuadre falso.

### Segunda vuelta (10/9/2026)

5. **De 12 formas plausibles de escribir la fórmula del Panel, la app entendía 6.** Cada
   edición nueva es una fórmula copiada; con la pestaña sin comillas, con `$K:$K`, con
   `K2:K500` o con `COUNTIFS` usando `B5`, la edición aparecía **sin gente**. Ahora se
   parsean los argumentos de verdad, y cuando no se puede, la alerta dice por qué.
6. **El descubrimiento de pestañas tenía su propio regex** y también exigía comillas:
   armaba reglas apuntando a pestañas que no había leído.
7. **La lista de espera ligaba `"taller"` a secas a una edición cualquiera** — la última
   que coincidiera — y la alerta nombraba la equivocada. Ahora liga solo si no hay dudas.
8. **Las gift cards leían `"Fecha de compra"` como el nombre de quien regala**, y daban
   por no usada una que dice `"Canjeada el 12/8"`.
9. **La caché del teléfono no vencía nunca y no había forma de borrarla.** Ver arriba.
10. **Tres celulares y el nombre de una clienta reales habían quedado en comentarios del
    código**, en un repo público. Reemplazados por ejemplos inventados y sacados de toda
    la historia del repo.

⚠️ `local/fixture.json`, `local/estado.json`, `local/preview.html` y `local/preview-xss.html`
tienen datos personales reales (nombres, mails, celulares). No subirlos a ningún lado —
están en `.gitignore`.

### Tercera vuelta (10/9/2026)

11. **El precio del curso estaba escrito a mano y nada avisaba si quedaba viejo.** El día
    que cambie, los saldos se calcularían contra el precio anterior en silencio. Ahora la
    app mira lo que está pagando la gente y avisa si dejó de coincidir. No adivina el
    precio nuevo ni lo usa para calcular.
12. **La columna "pago verificado" se leía y no se usaba.** Está vacía en las 102 filas,
    pero el día que se use, un "no" ahí tiene que pesar. Ahora pasa a Revisar y sale una
    alerta con la plata en duda.
13. **Los nombres de pestaña se comparaban exactos.** Si un día fuera "Lista de Espera" o
    "Gift cards", esas vistas quedaban vacías **para siempre y sin ninguna alerta**.
14. **La caché del teléfono y el botón Salir**, verificados en el navegador contra la
    planilla real. Ahí apareció que quedaban 8px entre "Actualizar" y "Salir": en un
    celular se tocaba uno por el otro.

### Cuarta vuelta (10/9/2026) — revisar las pruebas, no el código

15. **La suite "datos hostiles" no probaba nada.** Generaba una página envenenada con tres
    cargas de XSS y **nunca miraba si el veneno se ejecutaba**; el único control real estaba
    dentro de un `if` que hoy nunca se cumple. Se podía sacar el escape del XSS —el bug más
    grave que tuvo este proyecto— y la verificación seguía diciendo "TODO VERIFICADO".
    Descubierto rompiendo el código a propósito, no leyéndolo.
16. **Los enlaces de contacto no se pintaban en ninguna prueba.** `contacto()` solo se
    dibuja al tocar a la persona, y es el ÚNICO lugar donde un dato entra dentro de un
    atributo (`href="mailto:..."`), que es justo donde importa escapar las comillas.
17. **`local/inyeccion.js` no lo corría nadie.** Ahora lo usa la suite de XSS para
    comprobar que lo que `doGet` incrusta pasa por el camino escapado.
18. **`verificar.sh` decía "TODO VERIFICADO" con pruebas en rojo** (faltaba `pipefail`).

Hoy las 12 mutaciones se detectan.

⚠️ **Nunca copiar un dato de la planilla a un comentario o a una prueba.** El repo es
público. Para los ejemplos van números y nombres inventados con la misma forma. Las
pruebas tampoco imprimen nombres por pantalla: esa salida se pega en cualquier lado.
