#!/bin/bash
# Sube el código a Apps Script y actualiza la implementación que ya existe.
# Sin navegador: el editor de Apps Script se cuelga cuando falta memoria.
#
# Antes de usarlo por primera vez hacen falta dos cosas, una sola vez:
#   1. Activar la API: https://script.google.com/home/usersettings  -> "API de Apps Script": Activada
#   2. ./node_modules/.bin/clasp login     (abre el navegador, se autoriza con nutreclorofila@gmail.com)
set -e
set -o pipefail
cd "$(dirname "$0")"
CLASP=./node_modules/.bin/clasp

# La URL que usa la página publicada. Si el despliegue no es ESTE, no se toca nada.
URL_EN_USO="AKfycbzLD9WH9fQN7_yVuSzC1KtQ1PRabYKK5YBEKUkOmssRDLsV0SfRq-kM5HxgNYN6"

[ -f ~/.clasprc.json ] || { echo "Falta autorizar: corré  $CLASP login"; exit 1; }

echo "=== 1/4  Verificando antes de subir nada ==="
./verificar.sh > /tmp/verificacion.txt 2>&1 || { echo "★ La verificación NO pasa. No subo nada."; tail -20 /tmp/verificacion.txt; exit 1; }
tail -1 /tmp/verificacion.txt

echo
echo "=== 2/4  Buscando la implementación que está en uso ==="
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
echo "=== 3/4  Subiendo el código ==="
$CLASP push --force

echo
echo "=== 4/4  Actualizando esa misma implementación ==="
$CLASP deploy --deploymentId "$ELEGIDO" --description "${1:-actualización}"

echo
echo "=== Comprobando contra la app de verdad ==="
PIN=$(cat local/pin.txt)
sleep 5
curl -sL "https://script.google.com/macros/s/${URL_EN_USO}_FpT/exec?formato=json&pin=$PIN" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const d=JSON.parse(s);
      if(!d.ok){console.log('★ la app responde con error: '+d.error);process.exit(1)}
      const e=d.estado;
      console.log('  '+e.resumen.anotados+'/'+e.resumen.cupo+' anotados · '+e.resumen.libres+' libres · \$'+e.resumen.recaudado);
      const mal=(e.ediciones||[]).filter(x=>x.regla&&x.personas.length!==x.anotados).length;
      console.log('  ediciones que no cuadran: '+mal);
      console.log(mal?'★ REVISAR':'LISTO');
    }catch(err){console.log('★ no pude leer la respuesta');process.exit(1)}})"
