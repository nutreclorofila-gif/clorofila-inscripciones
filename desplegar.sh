#!/bin/bash
# Sube el código a Apps Script, actualiza la implementación que ya existe y
# publica la página en GitHub Pages. Sin navegador: el editor de Apps Script se
# cuelga cuando falta memoria.
#
# El orden es a propósito: primero el servidor y, recién cuando respondió bien,
# la página. La página nueva lee campos que agrega el servidor nuevo; al revés,
# si el servidor falla, Leo queda con una pantalla que espera datos que nadie
# le manda. Hasta el 23/9/2026 este script no publicaba la página: terminaba en
# "LISTO" y el teléfono seguía con la vieja.
#
# Antes de usarlo por primera vez hacen falta dos cosas, una sola vez:
#   1. Activar la API: https://script.google.com/home/usersettings  -> "API de Apps Script": Activada
#   2. ./node_modules/.bin/clasp login     (abre el navegador, se autoriza con nutreclorofila@gmail.com)
set -e
set -o pipefail
cd "$(dirname "$0")"
CLASP=./node_modules/.bin/clasp

# La implementación con la que habla la página publicada. Si el despliegue no es
# ESTE, no se toca nada. Se toma de generar-web.js, que es el único lugar donde
# está escrita: antes había una copia acá y nada controlaba que coincidieran.
URL_EN_USO=$(node local/generar-web.js --id)

[ -f ~/.clasprc.json ] || { echo "Falta autorizar: corré  $CLASP login"; exit 1; }

echo "=== 1/5  Verificando antes de subir nada ==="
./verificar.sh > /tmp/verificacion.txt 2>&1 || { echo "★ La verificación NO pasa. No subo nada."; tail -20 /tmp/verificacion.txt; exit 1; }
tail -1 /tmp/verificacion.txt
# Si la página no se va a poder publicar, mejor enterarse antes de subir el
# servidor: si no, quedan servidor nuevo y página vieja.
local/publicar-pagina.sh --revisar

echo
echo "=== 2/5  Buscando la implementación que está en uso ==="
LISTA=$($CLASP deployments)
# Se elige por el fragmento de la URL que usa la página publicada, NO por el
# orden de la lista: si algún día hay varias, hay que tocar exactamente esta.
ELEGIDO=$(echo "$LISTA" | grep -F "$URL_EN_USO" | grep -oE '^- [A-Za-z0-9_.-]+' | sed 's/^- //' | head -1)
if [ -z "$ELEGIDO" ]; then
  echo "★ No encontré la implementación que usa la página. NO despliego:"
  echo "  crear una nueva cambiaría la URL y rompería la app."
  echo "$LISTA"
  exit 1
fi
echo "  $ELEGIDO"

echo
echo "=== 3/5  Subiendo el código ==="
$CLASP push --force

echo
echo "=== 4/5  Actualizando esa misma implementación ==="
$CLASP deploy --deploymentId "$ELEGIDO" --description "${1:-actualización}"

echo
echo "=== Comprobando contra la app de verdad ==="
PIN=$(cat local/pin.txt)
# La versión que espera la página que se va a publicar. Si el servidor que
# responde no la trae, la implementación no quedó con el código nuevo y
# publicar la página dejaría a las dos desfasadas.
FORMA=$(grep -oE 'var FORMA_ESPERADA = [0-9]+;' apps-script/Index.html | grep -oE '[0-9]+')
sleep 5
curl -sL "https://script.google.com/macros/s/${URL_EN_USO}/exec?formato=json&pin=$PIN" \
  | FORMA="$FORMA" node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const d=JSON.parse(s);
      if(!d.ok){console.log('★ la app responde con error: '+d.error);process.exit(1)}
      const e=d.estado;
      if(String(e.forma)!==process.env.FORMA){console.log('★ el servidor responde con la versión '+e.forma+' y la página espera la '+process.env.FORMA+'. No publico la página: si recién se desplegó, esperá un minuto y corré  local/publicar-pagina.sh');process.exit(1)}
      console.log('  '+e.resumen.anotados+'/'+e.resumen.cupo+' anotados · '+e.resumen.libres+' libres · \$'+e.resumen.recaudado);
      const mal=(e.ediciones||[]).filter(x=>x.regla&&x.personas.length!==x.anotados).length;
      console.log('  ediciones que no cuadran: '+mal);
      console.log(mal?'★ REVISAR':'  el servidor responde bien');
    }catch(err){console.log('★ no pude leer la respuesta');process.exit(1)}})"

echo
echo "=== 5/5  Publicando la página ==="
local/publicar-pagina.sh   # la sube a gh-pages y comprueba que quedó igual
echo
echo "LISTO"
