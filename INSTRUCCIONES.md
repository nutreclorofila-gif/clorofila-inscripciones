# Clorofila — Inscripciones en el celu

App web **solo lectura** para ver el estado de las inscripciones desde el teléfono.
Misma familia que `~/Proyectos/clorofila-comandas`: un solo archivo, sin build, mobile-first.

## URL

**https://clorofila-inscripciones.netlify.app** — se abre con un PIN de 6 dígitos.
El PIN queda guardado en el teléfono: se escribe una sola vez.

Desde Safari en el celu: **Compartir → Añadir a pantalla de inicio** y queda como una app.

## Cómo está armado (y por qué así)

Son dos piezas:

| Pieza | Dónde | Qué hace |
|---|---|---|
| Página | Netlify (`clorofila-inscripciones`) | Todo lo que se ve. Un solo HTML, sin build. |
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

## Qué muestra

| Solapa | Qué hay |
|---|---|
| **Cupos** | Una tarjeta por edición vigente con `anotados / cupo` en número grande, barra de ocupación, cobrado y cuántos deben. Se toca la tarjeta y se despliega la gente. Abajo, las ediciones que ya pasaron, colapsadas. |
| **Plata** | Cobrado total de lo que viene, desglose por edición, lista de quién debe y cuánto, y el bloque de Tikzet. |
| **Gente** | Todos los inscriptos con buscador por nombre, mail o celular, y su estado de pago. |
| **Alertas** | Solo lo que necesita que alguien haga algo: descuadres, sobrecupo, pagos incompletos, Tikzet sin cargar. Si no hay nada, no hay nada. |

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
./verificar.sh                  # corre las 4 suites; tiene que pasar entero antes de subir
node local/bajar-fixture.js     # refresca local/fixture.json con los datos de hoy
node local/generar-preview.js   # arma local/preview.html para mirarla en el navegador
```

| Suite | Qué prueba |
|---|---|
| `local/probar.js` | Los conteos contra el Panel real, edición por edición. **12 de 12 cuadran.** |
| `local/casos-limite.js` | 11 escenarios plausibles de la planilla que podrían romperla. |
| `local/probar-lectura.js` | `leerPlanilla()` con un Sheets falso: qué pestañas lee y cuáles no. |
| `local/probar-xss.js` | Datos hostiles cargados desde el Tally público. |

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

⚠️ `local/fixture.json`, `local/estado.json`, `local/preview.html` y `local/preview-xss.html`
tienen datos personales reales (nombres, mails, celulares). No subirlos a ningún lado —
están en `.gitignore`.
