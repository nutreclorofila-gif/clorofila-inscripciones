#!/bin/bash
# Corre todas las verificaciones. Tiene que pasar entero antes de subir cambios
# al proyecto de Apps Script.
set -e
cd "$(dirname "$0")"

echo "=== 1/9  Conteos contra el Panel (datos reales) ==="
node local/probar.js | tail -3

echo
echo "=== 2/9  Casos límite ==="
node local/casos-limite.js | tail -2

echo
echo "=== 3/9  Lectura de la planilla ==="
node local/probar-lectura.js | tail -2

echo
echo "=== 4/9  PIN ==="
node local/probar-pin.js | tail -2

echo
echo "=== 5/9  Planilla editada a mano ==="
node local/probar-planilla-a-mano.js | tail -2

echo
echo "=== 6/9  Lo que queda guardado en el teléfono ==="
node local/probar-cache.js | tail -2

echo
echo "=== 7/9  Las cuatro solapas, con datos nuevos, viejos y vacíos ==="
node local/probar-vistas.js | tail -2

echo
echo "=== 8/9  La plata ==="
node local/probar-plata.js | tail -2

echo
echo "=== 9/9  Datos hostiles del Tally público ==="
node local/probar-xss.js
echo
echo "TODO VERIFICADO"
