#!/usr/bin/env bash
# Corre las pruebas en Microsoft Edge sin ventana, siempre en MODO DEMO: copia la app a una carpeta temporal
# con config.js vacío, así nunca se conecta al Apps Script real (ni gasta intentos de PIN).
#
#   bash pruebas/correr.sh              servidor y pantallas
#   bash pruebas/correr.sh servidor     solo el servidor (apps-script/partes/)
#   bash pruebas/correr.sh pantallas    solo las pantallas (recorre la app como admin y como cocina)
#
# Sale con error si alguna prueba falla o si la lista de partes de js/demo.js no coincide con apps-script/partes/.
set -uo pipefail
cd "$(dirname "$0")/.."

EDGE="${EDGE:-/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}"
# La lista de partes (js/demo.js) tiene que coincidir con los archivos de apps-script/partes/.
lista=$(sed -n '/PARTES: \[/,/\]/p' js/demo.js | grep -oE "'[a-z]+'" | tr -d "'" | sort)
carpeta=$(ls apps-script/partes/*.gs | xargs -n1 basename | sed 's/\.gs$//' | sort)
if [ "$lista" != "$carpeta" ]; then echo 'La lista PARTES de js/demo.js no coincide con apps-script/partes/:' >&2; diff <(echo "$lista") <(echo "$carpeta") >&2; exit 1; fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/web"
cp -r index.html css js assets apps-script "$TMP/web/"
echo "window.SANTO_CONFIG = { API_URL: '' };" > "$TMP/web/js/config.js"
cp pruebas/*.html "$TMP/"

fallo=0
for p in "${@:-servidor pantallas}"; do
  for nombre in $p; do
    echo "== $nombre =="
    salida=$("$EDGE" --headless --disable-gpu --allow-file-access-from-files --user-data-dir="$(cygpath -w "$TMP/perfil-$nombre")" \
      --virtual-time-budget=900000 --dump-dom "file:///$(cygpath -m "$TMP/$nombre.html")" 2>/dev/null \
      | sed -n '/<pre id="out"/,/<\/pre>/p' | sed 's/<[^>]*>//g')
    echo "$salida" | grep -v '^OK' | sed '/^$/d'
    echo "$salida" | grep -q '^FALLAS: 0$' || fallo=1
  done
done
exit $fallo
