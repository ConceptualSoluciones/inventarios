#!/usr/bin/env bash
# Sube el servidor (apps-script/partes/ y appsscript.json) al Apps Script con clasp y publica una versión nueva
# en la MISMA implementación, así la dirección de la app (js/config.js) no cambia.
#
#   bash publicar.sh            prueba, sube y publica
#   bash publicar.sh --solo-subir   prueba y sube, sin publicar (la app sigue usando la versión anterior)
#
# Necesita clasp 2.4.2 con sesión iniciada (ver README › Publicar el servidor).
set -euo pipefail
cd "$(dirname "$0")"

grep -q PEGAR_AQUI .clasp.json && { echo 'Falta el ID del proyecto en .clasp.json (ver README).' >&2; exit 1; }

# No se sube nada si alguna prueba del servidor falla.
bash pruebas/correr.sh servidor

clasp push --force
[ "${1:-}" = "--solo-subir" ] && { echo 'Subido. La app sigue con la versión anterior hasta publicar.'; exit 0; }

# La implementación es la que ya usa la app: su ID está en la dirección de js/config.js.
ID=$(sed -n "s|.*API_URL: '.*/macros/s/\([^/]*\)/exec'.*|\1|p" js/config.js)
[ -n "$ID" ] || { echo 'No encontré la dirección del Apps Script en js/config.js.' >&2; exit 1; }
clasp deploy --deploymentId "$ID" --description "$(git log -1 --format=%s)"
echo 'Publicado: la app ya usa el servidor nuevo.'
