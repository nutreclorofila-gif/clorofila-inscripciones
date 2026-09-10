#!/bin/bash
# Corre todas las verificaciones. Tiene que pasar entero antes de subir cambios
# al proyecto de Apps Script.
set -e
cd "$(dirname "$0")"

echo "=== 1/6  Conteos contra el Panel (datos reales) ==="
node local/probar.js | tail -3

echo
echo "=== 2/6  Casos límite ==="
node local/casos-limite.js | tail -2

echo
echo "=== 3/6  Lectura de la planilla ==="
node local/probar-lectura.js | tail -2

echo
echo "=== 4/6  PIN ==="
node local/probar-pin.js | tail -2

echo
echo "=== 5/6  Planilla editada a mano ==="
node local/probar-planilla-a-mano.js | tail -2

echo
echo "=== 6/6  Datos hostiles del Tally público ==="
node local/probar-xss.js
echo
echo "TODO VERIFICADO"
