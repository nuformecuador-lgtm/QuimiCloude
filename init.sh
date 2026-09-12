#!/usr/bin/env bash
# init.sh — Verificacion e inicializacion del arnes (stack Node/Next/Supabase)
# Debe terminar en verde antes de que el agente empiece a trabajar.
set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
fail() { echo "${RED}✗ $1${NC}"; exit 1; }
ok()   { echo "${GREEN}✓ $1${NC}"; }
warn() { echo "${YELLOW}! $1${NC}"; }

# MODO DEL GATE. `--rapido` existe porque correr la suite completa al cerrar CADA tanda
# convierte el arnes en una sala de espera (una feature de 9 tandas = media hora de reloj solo
# esperando). En modo rapido se corre lo que el GRAFO DE IMPORTS relaciona con lo que has
# tocado, MAS todas las guardias.
#
# Las guardias van SIEMPRE y no es un adorno: recorren el arbol de archivos (censo de tablas,
# barridos de columnas sensibles, modulos puros) en vez de importar lo que vigilan, asi que
# NINGUN grafo de imports las selecciona. Son justo las que se perderian.
#
# `--rapido` NO sustituye al gate completo: es para cerrar tandas. Antes de abrir un PR se corre
# `./init.sh` a secas. La leccion de dos PRs de un proyecto anterior con este arnes sigue en pie
# -se mergeo mirando el estado del PR, que es un build y NO corre tests, y entro un guard rojo
# en `dev`-.
MODO="completo"
if [ "${1:-}" = "--rapido" ]; then
  MODO="rapido"
elif [ -n "${1:-}" ]; then
  echo "uso: ./init.sh [--rapido]"; exit 2
fi

echo "== Arnes SDD :: init (modo: $MODO) =="

# 1. Herramientas base
command -v node >/dev/null 2>&1 || fail "node no esta instalado"
command -v pnpm >/dev/null 2>&1 || fail "pnpm no esta instalado. Instalalo con: npm i -g pnpm"
ok "node $(node -v)"

# 2. Dependencias y artefactos generados
#
# `prisma generate` y `next typegen` van SIEMPRE, no solo cuando falta node_modules: un merge
# con `dev` que trae una migracion deja el cliente de Prisma desfasado, y uno que trae una
# dependencia deja node_modules corto. El 2026-09-11 eso costo CUATRO paradas -dos de ellas
# diagnosticadas mal, porque el error NO nombra su causa: "Module '@prisma/client' has no
# exported member 'Prisma'" era un generate que faltaba, y "Cannot find name 'LayoutProps'"
# un typegen- mas una suite E2E ENTERA caida en dev por un "Cannot find module 'resend'" que
# parecia una dependencia sin aprobar y era solo node_modules corto tras el merge de QC-79.
# Nadie la vio porque el gate no corre Playwright (deuda aparte, anotada en docs/verification.md).
#
# Coste MEDIDO el 2026-09-12, no estimado: 12 s prisma + 5 s typegen = ~17 s en regimen
# estable, y ~128 s la primera vez tras cambiar el esquema (108 de prisma). Sobre el gate
# completo (160-480 s) es +4 a +10 %; sobre el rapido (~60 s) es +28 %, y se paga igual: una
# sola corrida repetida por entorno desfasado cuesta mas que tres con estos pasos dentro.
#
# Los dos avisan y SIGUEN si fallan, en vez de abortar: el gate real es el typecheck que viene
# despues, y si el artefacto no se pudo generar, el aviso explica el error fantasma que va a
# salir. Un fail aqui dejaria sin gate a quien tenga el entorno a medias.
if [ -f package.json ]; then
  if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules ]; then
    echo "Instalando dependencias..."
    pnpm install
  fi
  ok "dependencias presentes"
  if pnpm exec prisma generate >/dev/null 2>&1; then
    ok "cliente de Prisma al dia"
  else
    warn "prisma generate fallo: el typecheck puede dar errores fantasma de @prisma/client"
  fi
  if pnpm exec next typegen >/dev/null 2>&1; then
    ok "tipos de ruta de Next al dia"
  else
    warn "next typegen fallo: el typecheck puede no encontrar LayoutProps ni PageProps"
  fi
else
  warn "no hay package.json todavia (repo recien inicializado)"
fi

# 3+4. Validacion de feature_list.json: max 2 in_progress por zona, specs presentes para
#      las features sdd en vuelo, integridad de ids y de depends_on.
#
#      Vive en Node y no en `jq` a proposito. Antes eran dos bloques de `jq` colgando de un
#      solo `if command -v jq ...`: en una maquina SIN jq no fallaban, se saltaban ENTEROS y
#      el gate terminaba en verde sin validar nada. Estuvo asi lo suficiente para que nadie
#      notara que los dos `ok` no se imprimian nunca. Node ya es obligatorio (paso 1), asi
#      que ahora esto no puede quedarse mudo. Detalle en scripts/validate-features.mjs.
if [ -f feature_list.json ]; then
  # El validador es OBLIGATORIO, no opcional. Si falta, esto es `fail` y no `warn`: un
  # `warn` aqui reintroduce exactamente el agujero que este bloque vino a cerrar -el check
  # se salta en silencio y el gate sigue en verde-, solo que movido de `jq` al script. La
  # plantilla (`harnessConfig/scripts/`) lo trae, asi que un repo recien clonado lo tiene.
  [ -f scripts/validate-features.mjs ] || fail "falta scripts/validate-features.mjs: sin el, feature_list.json no se valida"
  VALIDACION=$(node scripts/validate-features.mjs 2>&1) || fail "feature_list.json invalido:
$VALIDACION"
  echo "$VALIDACION" | while IFS= read -r linea; do
    [ -n "$linea" ] && ok "$linea"
  done
fi

# 5. Worktrees acumulados. Es `warn`, NO `fail`, a proposito: poner el gate en rojo por
#    tareas domesticas bloquearia trabajo real y la respuesta previsible seria ignorar el
#    gate — justo lo que la regla 5 del CLAUDE.md intenta evitar. Pero tampoco puede ser
#    invisible: en este repo lo que no sale en `./init.sh` no existe, y asi fue como un
#    proyecto anterior con este mismo arnes llego a 80 worktrees vivos sin enterarse.
if [ -x scripts/wt.sh ] && git rev-parse --git-dir >/dev/null 2>&1; then
  WT_TOTAL=$(git worktree list --porcelain | grep -c '^worktree ' || true)
  WT_EXTRA=$((WT_TOTAL - 1))            # el principal no cuenta
  WT_PRUNABLE=$(git worktree list --porcelain | grep -c '^prunable' || true)
  if [ "$WT_EXTRA" -gt 5 ] || [ "$WT_PRUNABLE" -gt 0 ]; then
    warn "$WT_EXTRA worktree(s) ademas del principal, $WT_PRUNABLE con el directorio ya borrado."
    warn "Revisa cuales se pueden desmontar: ./scripts/wt.sh list"
  else
    ok "worktrees bajo control ($WT_EXTRA ademas del principal)"
  fi
fi

# 6. Calidad de codigo (si los scripts existen)
# Distingue TRES casos que no son lo mismo: (a) pnpm ausente, (b) script no definido
# en package.json -> se omite, (c) el script CORRIO Y FALLO -> rojo, corta el init.
#
# La version previa los confundia: `pnpm run | grep -q ... && { ...; pnpm run "$1"; }
# || warn "no definido"`. Si el script fallaba, el grupo `&&` devolvia no-cero, se
# ejecutaba la rama `||` y reportaba "script no definido, se omite" -> la funcion
# terminaba en `warn` (exit 0), `set -e` no disparaba e init.sh llegaba a "init OK"
# con la suite roja. El gate del que depende la regla #5 del CLAUDE.md mentia.
run_if() {
  if ! pnpm run --help >/dev/null 2>&1; then
    warn "pnpm no disponible para correr script '$1'"
    return 0
  fi
  if ! pnpm run 2>/dev/null | grep -q "^  $1"; then
    warn "script '$1' no definido, se omite"
    return 0
  fi
  echo "-> pnpm run $1"
  pnpm run "$1" || fail "'pnpm run $1' fallo"
  ok "$1 paso"
}

# 6.b El `.env`, ANTES de los tests. La integracion se conecta a Postgres con `DATABASE_URL` y
# nadie la carga por ella: `prisma.config.ts` solo la carga para el CLI de Prisma, y Vitest no lee
# `.env` en este proyecto. Sin esto el veredicto del gate depende del shell que lo lance: el
# 2026-09-08 la MISMA rama dio 23 archivos y 32 tests en rojo desde un shell limpio, y 1 archivo y
# 2 tests con el `.env` cargado. Un gate cuyo resultado cambia con quien lo invoca no es una
# verificacion (`docs/verification.md`).
#
# Si `DATABASE_URL` YA viene del entorno, manda ella y el archivo no se toca: quien apunta a otra
# base a proposito no debe verse pisado por el `.env` del repo.
#
# Ojo: la comprobacion de que el `.env` existe vive mas abajo, DESPUES de los tests. Se queda ahi
# -es un aviso de inicializacion, no una precondicion- pero por eso esta carga no puede colgar de
# ella.
if [ -n "${DATABASE_URL:-}" ]; then
  ok "DATABASE_URL viene del entorno; no se carga el .env"
elif [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  ok ".env cargado en el entorno del gate"
fi

if [ -f package.json ]; then
  run_if typecheck
  run_if lint
  if [ "$MODO" = "rapido" ]; then
    run_if test:rapido
    warn "modo rapido: solo los tests relacionados con tus cambios + las guardias."
    warn "Antes de abrir el PR corre './init.sh' sin flags."
  else
    # Suite completa + comparacion contra el baseline de rojos heredados. NO es `run_if test`
    # porque la pregunta al cerrar una feature no es "¿esta todo verde?" sino "¿rompi algo YO?":
    # cuando `dev` arrastra deuda ajena la suite termina siempre en rojo y el gate deja de
    # responder nada. Detalle y limites en scripts/comparar-baseline-rojos.mjs.
    # `fail`, no `warn`: el gate depende de este script. Si un repo trasplantado desde
    # la plantilla no lo tiene, hay que enterarse aqui y no tres pasos mas abajo con un
    # "no existe el reporte" que no explica nada.
    pnpm run 2>/dev/null | grep -q "^  test:json$" || fail "falta el script 'test:json' en package.json (lo necesita la comparacion contra el baseline)"
    echo "-> pnpm run test:json"
    # Borrar el reporte ANTES de correr. Si vitest revienta sin escribirlo, el comparador tiene
    # que encontrarse con que no hay reporte —y fallar— en vez de leer el de la corrida
    # anterior y dar verde sobre datos viejos.
    rm -f .vitest-rojos.json
    # El `|| true` es imprescindible: sin el, `set -e` corta aqui y no se llega a comparar.
    # Que la suite acabe roja ya no decide por si solo; lo decide el comparador.
    pnpm run test:json || true
    # stderr sale directo a la consola a proposito: asi el detalle esta de verdad "justo
    # arriba" y el mensaje de fallo no promete algo que no entrega.
    COMPARACION=$(node scripts/comparar-baseline-rojos.mjs .vitest-rojos.json) || fail "hay rojos NUEVOS respecto del baseline (el detalle esta justo arriba)"
    ok "tests: $COMPARACION"
  fi
fi

# 7. Migraciones: verificar que toda migracion tenga down.sql
MIGRATIONS_DIR="db/migrations"
if [ -d "$MIGRATIONS_DIR" ]; then
  MISSING_DOWN=""
  for MIG in "$MIGRATIONS_DIR"/*/; do
    [ -d "$MIG" ] || continue
    [ -f "$MIG/down.sql" ] || MISSING_DOWN="$MISSING_DOWN $(basename "$MIG")"
  done
  if [ -n "$MISSING_DOWN" ]; then
    warn "migraciones sin down.sql:$MISSING_DOWN"
  else
    ok "todas las migraciones tienen down.sql"
  fi
fi

# 8. Variables de entorno
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    warn "no hay .env. Crea uno a partir de .env.example"
  else
    warn "no hay .env ni .env.example"
  fi
else
  ok ".env presente"
fi

echo "${GREEN}== init OK ==${NC}"
echo "Siguiente: abre AGENTS.md y sigue el flujo desde ahi."
