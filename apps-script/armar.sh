#!/usr/bin/env bash
# Junta apps-script/partes/*.gs en apps-script/Code.gs, que es lo único que se pega en el Apps Script.
#
#   bash apps-script/armar.sh            arma Code.gs
#   bash apps-script/armar.sh --revisar  solo revisa que Code.gs esté al día con las partes (sale con error si no)
#
# El orden importa: base define las constantes y registrar(); las demás partes registran sus acciones.
set -euo pipefail
cd "$(dirname "$0")"

PARTES=(
  base        # constantes, forma de las hojas, instalación y entrada web
  equipo      # PIN, roles, sesiones y menú del Sheet
  hojas       # leer y escribir en el Sheet, bloqueo y utilidades
  stock       # productos activos, movimientos, stock y niveles al ojo (lo usan todas las páginas)
  avisos      # Telegram y respaldo nocturno
  hoy
  inventario
  productos
  compras
  produccion
  cierre
  recetas
  revision
  movimientos
  ajustes
  semilla     # datos iniciales
)

armar() {
  echo '// ============================================================================='
  echo '// ARCHIVO ARMADO: no editar aquí. Se arma con `bash apps-script/armar.sh` desde apps-script/partes/.'
  echo '// Es lo único que se pega en el Apps Script.'
  echo '// ============================================================================='
  for p in "${PARTES[@]}"; do
    echo
    echo "// ===== partes/$p.gs ====="
    echo
    cat "partes/$p.gs"
  done
}

# Ninguna parte puede quedar fuera de la lista.
for f in partes/*.gs; do
  nombre=$(basename "$f" .gs)
  [[ " ${PARTES[*]} " == *" $nombre "* ]] || { echo "Falta $nombre en la lista de armar.sh" >&2; exit 1; }
done

if [[ "${1:-}" == "--revisar" ]]; then
  if armar | cmp -s - Code.gs; then echo "Code.gs está al día."; else echo "Code.gs NO está al día: corre bash apps-script/armar.sh" >&2; exit 1; fi
else
  armar > Code.gs
  echo "Listo: Code.gs armado con ${#PARTES[@]} partes."
fi
