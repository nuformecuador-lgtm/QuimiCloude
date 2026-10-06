#!/usr/bin/env bash
# arnes-sync.sh — trae una version nueva del ARNES desde la plantilla a este proyecto.
#
#   ./scripts/arnes-sync.sh                    dry-run: que archivos cambiarian
#   ./scripts/arnes-sync.sh --aplicar          los copia (sin commit: revisa el diff y commitea tu)
#   --desde <ruta|url>   plantilla (default: https://github.com/singularis-co/harness_config.git)
#   --ref <rama|tag>     version de la plantilla (default: main)
#
# Solo toca lo que lista `arnes.manifest` DE LA PLANTILLA (puede traer archivos nuevos). Nunca
# toca el perfil del proyecto (`arnes.config.json`, `docs/architecture.md`…), ni codigo, ni
# `progress/`, ni `specs/`. Ante la duda no borra: un archivo que la plantilla quito del manifest
# se reporta y se deja en su sitio.
set -euo pipefail
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
fail() { echo "${RED}✗ $1${NC}" >&2; exit 1; }

DESDE="https://github.com/singularis-co/harness_config.git"
REF="main"
APLICAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --desde)   DESDE="${2:?}"; shift 2 ;;
    --ref)     REF="${2:?}"; shift 2 ;;
    --aplicar) APLICAR=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) fail "opcion desconocida: $1" ;;
  esac
done

[ -f arnes.config.json ] || fail "corre esto en la raiz de un proyecto con arnes (falta arnes.config.json)"
if [ -n "$(git status --porcelain -- $(sed -e 's/#.*//' -e '/^\s*$/d' arnes.manifest 2>/dev/null) 2>/dev/null)" ]; then
  fail "hay cambios sin commitear en archivos del arnes: commitea o descarta antes de sincronizar"
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git -c core.autocrlf=false clone --quiet --depth 1 --branch "$REF" "$DESDE" "$TMP/plantilla" || fail "no pude clonar $DESDE@$REF"
P="$TMP/plantilla"
[ -f "$P/arnes.manifest" ] || fail "la plantilla no trae arnes.manifest"

entradas() { sed -e 's/#.*//' -e 's/[[:space:]]*$//' -e '/^$/d' "$1"; }
archivos_de() { # $1 = raiz, lee entradas por stdin
  while IFS= read -r e; do
    if [ "${e%/}" != "$e" ]; then [ -d "$1/$e" ] && (cd "$1" && find "${e%/}" -type f); else [ -f "$1/$e" ] && echo "$e"; fi
  done
}

NUEVOS=0; CAMBIADOS=0; IGUALES=0
while IFS= read -r f; do
  if [ ! -f "$f" ]; then echo "${GREEN}+ $f${NC}"; NUEVOS=$((NUEVOS+1))
  elif ! diff -q --strip-trailing-cr "$P/$f" "$f" >/dev/null 2>&1; then echo "${YELLOW}~ $f${NC}"; CAMBIADOS=$((CAMBIADOS+1))
  else IGUALES=$((IGUALES+1)); continue; fi
  if [ "$APLICAR" = 1 ]; then mkdir -p "$(dirname "$f")"; cp "$P/$f" "$f"; fi
done < <(entradas "$P/arnes.manifest" | archivos_de "$P" | sort -u)

# Lo que este proyecto tiene como arnes y la plantilla ya no: se avisa, no se borra.
if [ -f arnes.manifest ]; then
  comm -23 <(entradas arnes.manifest | archivos_de . | sort -u) <(entradas "$P/arnes.manifest" | archivos_de "$P" | sort -u) \
    | while IFS= read -r f; do echo "${RED}? $f${NC}  (la plantilla ya no lo trae: decide si borrarlo)"; done
fi

# Por stdin y no con require(ruta): en Windows, node no entiende las rutas POSIX de Git Bash.
VERSION="$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).arnes_version??'?')}catch{console.log('?')}})" < "$P/arnes.config.example.json" 2>/dev/null || echo '?')"
echo
echo "plantilla $DESDE@$REF (arnes $VERSION): $NUEVOS nuevo(s), $CAMBIADOS cambiado(s), $IGUALES igual(es)."
if [ "$APLICAR" = 1 ]; then
  [ "$VERSION" != "?" ] && node -e "
    const fs=require('fs');const c=JSON.parse(fs.readFileSync('arnes.config.json','utf8'));
    c.arnes_version='$VERSION';fs.writeFileSync('arnes.config.json',JSON.stringify(c,null,2)+'\n');"
  echo "Aplicado. Siguiente: lee el CHANGELOG de la plantilla, corre ./init.sh y commitea: chore(arnes): sync a $VERSION"
else
  echo "Dry-run. Para aplicarlo: ./scripts/arnes-sync.sh --aplicar"
fi
