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

echo "=== 1/12  El código, antes de pegarlo en Apps Script ==="
node local/probar-codigo.js | tail -1

echo
echo "=== 2/12  Conteos contra el Panel (datos reales) ==="
node local/probar.js | tail -3

echo
echo "=== 3/12  Casos límite ==="
node local/casos-limite.js | tail -2

echo
echo "=== 4/12  Lectura de la planilla ==="
node local/probar-lectura.js | tail -2

echo
echo "=== 5/12  PIN ==="
node local/probar-pin.js | tail -2

echo
echo "=== 6/12  Planilla editada a mano ==="
node local/probar-planilla-a-mano.js | tail -2

echo
echo "=== 7/12  Lo que queda guardado en el teléfono ==="
node local/probar-cache.js | tail -2

echo
echo "=== 8/12  Las cuatro solapas, con datos nuevos, viejos y vacíos ==="
node local/probar-vistas.js | tail -2

echo
echo "=== 9/12  La plata ==="
node local/probar-plata.js | tail -2

echo
echo "=== 10/12  Datos hostiles del Tally público ==="
node local/probar-xss.js | tail -2

echo
echo "=== 11/12  Ningún dato real en lo que se publica ==="
node local/probar-privacidad.js | tail -2

echo
echo "=== 12/12  Qué ve Leo cuando algo falla ==="
node local/probar-arranque.js | tail -2
echo
echo "TODO VERIFICADO"
