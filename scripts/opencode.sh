#!/usr/bin/env bash
# Lanza opencode con el `.env` del repo ya cargado en el entorno del proceso.
# Gemelo de `scripts/opencode.ps1` para Git Bash, WSL y Linux. El porque, en el .ps1 y en
# `docs/opencode.md`: opencode resuelve `{env:...}` contra el entorno y NO lee el `.env`, asi
# que sin esto la credencial se resuelve a cadena vacia y la peticion sale en blanco.
#
# USO:  ./scripts/opencode.sh              -> abre la TUI
#       ./scripts/opencode.sh agent list   -> los argumentos se pasan tal cual
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOTENV="$RAIZ/.env"

if [ -f "$DOTENV" ]; then
  cargadas=0
  while IFS= read -r linea || [ -n "$linea" ]; do
    linea="${linea%$'\r'}"                       # finales CRLF de Windows
    case "$linea" in ''|\#*) continue ;; esac
    case "$linea" in *=*) ;; *) continue ;; esac

    nombre="${linea%%=*}"
    valor="${linea#*=}"
    nombre="$(printf '%s' "$nombre" | tr -d '[:space:]')"
    # Comillas envolventes fuera.
    case "$valor" in
      \"*\") valor="${valor#\"}"; valor="${valor%\"}" ;;
      \'*\') valor="${valor#\'}"; valor="${valor%\'}" ;;
    esac

    # Lo que ya esta en el entorno manda sobre el `.env`.
    if [ -z "${!nombre:-}" ]; then
      export "$nombre=$valor"
      cargadas=$((cargadas + 1))
    fi
  done < "$DOTENV"
  echo "[arnes] .env cargado ($cargadas variable(s)) -> lanzando opencode"
else
  echo "[arnes] no hay .env; se usa el entorno tal cual"
fi

if [ -z "${NVIDIA_API_KEY:-}" ]; then
  echo "[arnes] NVIDIA_API_KEY sigue vacia: los modelos de NVIDIA no van a resolver."
  echo "[arnes] Ponla en .env o en el entorno. Detalle en docs/opencode.md."
fi

exec opencode "$@"
