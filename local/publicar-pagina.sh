#!/bin/bash
# Publica web/index.html en la rama gh-pages, que es lo que sirve GitHub Pages
# (la URL que Leo tiene en el teléfono). Lo corre desplegar.sh al final, después
# de que el servidor nuevo respondió bien. También se puede correr solo:
#
#   local/publicar-pagina.sh             publica
#   local/publicar-pagina.sh --revisar   solo controla que se pueda publicar; no sube nada
#
# Hasta el 23/9/2026 esto se hacía a mano y sin receta: desplegar.sh terminaba
# en "LISTO" con la página vieja en el teléfono, y la única receta escrita
# mandaba a publicar en Netlify, que gasta créditos. En Netlify NO se publica.
#
# gh-pages tiene historia propia y un solo archivo, así que no sirve subtree:
# se arma en una carpeta temporal a partir de lo que ya está publicado, se le
# suma un commit y se sube. Nunca se pisa la historia (sin --force).
set -e
set -o pipefail
cd "$(dirname "$0")/.."
REMOTO=origin

# Se publica solo lo que está commiteado en main. Si no, la página del teléfono
# sale de un cambio que no está en ningún commit y nadie sabe de dónde vino.
node local/generar-web.js > /dev/null
if ! git diff --quiet HEAD -- apps-script/Index.html web/index.html; then
  echo "★ apps-script/Index.html o web/index.html tienen cambios sin commitear."
  echo "  Hacé el commit (web/index.html ya quedó regenerado) y volvé a correr esto. No publico nada."
  exit 1
fi
[ "$1" = "--revisar" ] && { echo "  la página se puede publicar"; exit 0; }

git fetch -q "$REMOTO" gh-pages
if git show FETCH_HEAD:index.html | cmp -s - web/index.html; then
  echo "  gh-pages ya tiene esta página: no hay nada que publicar"
  exit 0
fi

TMP=$(mktemp -d)
trap 'git worktree remove --force "$TMP/gh-pages" 2>/dev/null; rm -rf "$TMP"' EXIT
git worktree add -q --detach "$TMP/gh-pages" FETCH_HEAD
cp web/index.html "$TMP/gh-pages/index.html"
git -C "$TMP/gh-pages" add index.html
git -C "$TMP/gh-pages" commit -q -m "$(git log -1 --format=%s)" \
  -m "Página generada desde el commit $(git rev-parse --short HEAD) de main."
git -C "$TMP/gh-pages" push -q "$REMOTO" HEAD:gh-pages

# Comprobación: lo que quedó publicado es lo que hay acá.
git fetch -q "$REMOTO" gh-pages
if ! git show FETCH_HEAD:index.html | cmp -s - web/index.html; then
  echo "★ Subí la página pero gh-pages no quedó igual a web/index.html. Revisalo antes de seguir."
  exit 1
fi
echo "  página publicada en gh-pages (commit $(git rev-parse --short HEAD) de main)."
echo "  GitHub tarda uno o dos minutos en servirla; en el teléfono, cerrá la app y abrila de nuevo."
