#!/bin/bash
# Corre todas las verificaciones. Tiene que pasar entero antes de subir cambios
# al proyecto de Apps Script y antes de publicar la página (desplegar.sh lo
# corre primero y no sigue si falla).
#
# pipefail NO es opcional: cada suite se pasa por "| tail -2" para no llenar la
# pantalla, y sin pipefail el código de salida es el del tail — siempre 0. Sin
# esto el script imprime "TODO VERIFICADO" con pruebas rotas, que es peor que
# no tener pruebas.
set -e
set -o pipefail
cd "$(dirname "$0")"

echo "=== 1/15  El código, antes de pegarlo en Apps Script ==="
node local/probar-codigo.js | tail -1

echo
echo "=== 2/15  Conteos contra el Panel (datos reales) ==="
node local/probar.js | tail -3

echo
echo "=== 3/15  Casos límite ==="
node local/casos-limite.js | tail -2

echo
echo "=== 4/15  Lectura de la planilla ==="
node local/probar-lectura.js | tail -2

echo
echo "=== 5/15  Avisos por mail de pagos en persona ==="
node local/probar-avisos.js | tail -1

echo
echo "=== 6/15  PIN ==="
node local/probar-pin.js | tail -2

echo
echo "=== 7/15  Planilla editada a mano ==="
node local/probar-planilla-a-mano.js | tail -2

echo
echo "=== 8/15  Lo que queda guardado en el teléfono ==="
node local/probar-cache.js | tail -2

echo
echo "=== 9/15  Las cuatro solapas, con datos nuevos, viejos y vacíos ==="
node local/probar-vistas.js | tail -2

echo
echo "=== 10/15  La plata ==="
node local/probar-plata.js | tail -2

echo
echo "=== 11/15  Datos hostiles del Tally público ==="
node local/probar-xss.js | tail -2

echo
echo "=== 12/15  Ningún dato real en lo que se publica ==="
node local/probar-privacidad.js | tail -2

echo
echo "=== 13/15  Qué ve Leo cuando algo falla ==="
node local/probar-arranque.js | tail -2

echo
echo "=== 14/15  La página que se publica es la de este código ==="
node local/probar-publicacion.js | tail -2

echo
echo "=== 15/15  La documentación dice lo que hay ==="
node local/probar-documentacion.js | tail -2
echo
echo "TODO VERIFICADO"
