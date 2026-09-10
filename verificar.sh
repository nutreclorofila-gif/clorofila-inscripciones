#!/bin/bash
# Corre todas las verificaciones. Tiene que pasar entero antes de subir cambios
# al proyecto de Apps Script.
#
# pipefail NO es opcional: cada suite se pasa por "| tail -2" para no llenar la
# pantalla, y sin pipefail el código de salida es el del tail — siempre 0. Sin
# esto el script imprime "TODO VERIFICADO" con pruebas rotas, que es peor que
# no tener pruebas.
set -e
set -o pipefail
cd "$(dirname "$0")"

echo "=== 1/10  El código, antes de pegarlo en Apps Script ==="
node local/probar-codigo.js | tail -1

echo
echo "=== 2/10  Conteos contra el Panel (datos reales) ==="
node local/probar.js | tail -3

echo
echo "=== 3/10  Casos límite ==="
node local/casos-limite.js | tail -2

echo
echo "=== 4/10  Lectura de la planilla ==="
node local/probar-lectura.js | tail -2

echo
echo "=== 5/10  PIN ==="
node local/probar-pin.js | tail -2

echo
echo "=== 6/10  Planilla editada a mano ==="
node local/probar-planilla-a-mano.js | tail -2

echo
echo "=== 7/10  Lo que queda guardado en el teléfono ==="
node local/probar-cache.js | tail -2

echo
echo "=== 8/10  Las cuatro solapas, con datos nuevos, viejos y vacíos ==="
node local/probar-vistas.js | tail -2

echo
echo "=== 9/10  La plata ==="
node local/probar-plata.js | tail -2

echo
echo "=== 10/10  Datos hostiles del Tally público ==="
node local/probar-xss.js | tail -2
echo
echo "TODO VERIFICADO"
