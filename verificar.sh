#!/bin/bash
# Corre todas las verificaciones. Tiene que pasar entero antes de subir cambios
# al proyecto de Apps Script.
set -e
cd "$(dirname "$0")"

echo "=== 1/5  Conteos contra el Panel (datos reales) ==="
node local/probar.js | tail -3

echo
echo "=== 2/5  Casos límite ==="
node local/casos-limite.js | tail -2

echo
echo "=== 3/5  Lectura de la planilla ==="
node local/probar-lectura.js | tail -2

echo
echo "=== 4/5  PIN ==="
node local/probar-pin.js | tail -2

echo
echo "=== 5/5  Datos hostiles del Tally público ==="
node local/probar-xss.js
echo
echo "TODO VERIFICADO"
