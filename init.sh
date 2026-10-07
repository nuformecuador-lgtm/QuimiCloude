#!/usr/bin/env bash
# init.sh — Verificacion e inicializacion del arnes (proyectos Node + pnpm)
# Debe terminar en verde antes de que el agente empiece a trabajar.
set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
fail() { echo "${RED}✗ $1${NC}"; exit 1; }
ok()   { echo "${GREEN}✓ $1${NC}"; }
warn() { echo "${YELLOW}! $1${NC}"; }

# MODO DEL GATE (arnes v2, docs/gate.md). En LOCAL el default es el RAPIDO: lo que el GRAFO DE
# IMPORTS relaciona con lo que has tocado, MAS todas las guardias. El COMPLETO corre en CI
# (`.github/workflows/gate.yml`) en cada PR a la rama de integracion y, con E2E, en el PR a
# produccion. `--completo` existe para reproducir en local un rojo de CI.
#
# Las guardias van SIEMPRE y no es un adorno: recorren el arbol de archivos (censo de tablas,
# barridos de columnas sensibles, modulos puros) en vez de importar lo que vigilan, asi que
# NINGUN grafo de imports las selecciona. Son justo las que se perderian.
#
# El rapido NO sustituye al completo: lo sustituye el CI. La leccion de dos PRs de un proyecto
# anterior sigue en pie -se mergeo mirando el estado del PR, que es un build y NO corre tests, y
# entro un guard rojo en `dev`-: por eso no se mergea sin el check `gate-completo` en verde.
MODO="rapido"
case "${1:-}" in
  ""|--rapido) MODO="rapido" ;;
  --completo)  MODO="completo" ;;
  *) echo "uso: ./init.sh [--rapido|--completo]   (default: --rapido)"; exit 2 ;;
esac

echo "== Arnes SDD :: init (modo: $MODO) =="

# 1. Herramientas base
command -v node >/dev/null 2>&1 || fail "node no esta instalado"
command -v pnpm >/dev/null 2>&1 || fail "pnpm no esta instalado. Instalalo con: npm i -g pnpm"
ok "node $(node -v)"

# 2. Dependencias. Los artefactos GENERADOS del stack (cliente del ORM, tipos de ruta…) los
#    regenera `scripts/gate-proyecto.sh` (perfil), que corre antes del typecheck.
if [ -f package.json ]; then
  if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules ]; then
    echo "Instalando dependencias..."
    pnpm install
  fi
  ok "dependencias presentes"
else
  warn "no hay package.json todavia (repo recien inicializado)"
fi

# 3+4. Validacion de feature_list.json: assignee en vuelo, cupo personal por zona, specs presentes para
#      las features sdd en vuelo, integridad de ids y de depends_on.
#
#      Vive en Node y no en `jq` a proposito. Antes eran dos bloques de `jq` colgando de un
#      solo `if command -v jq ...`: en una maquina SIN jq no fallaban, se saltaban ENTEROS y
#      el gate terminaba en verde sin validar nada. Estuvo asi lo suficiente para que nadie
#      notara que los dos `ok` no se imprimian nunca. Node ya es obligatorio (paso 1), asi
#      que ahora esto no puede quedarse mudo. Detalle en scripts/validate-features.mjs.
# `feature_list.json` ya no se versiona (arnes v2): vive en la raiz del worktree principal y
# el validador la busca ahi. Se corre SIEMPRE: sin copia del board sale en verde con una nota
# (es lo normal en CI), y ademas valida `arnes.config.json`.
if true; then
  # El validador es OBLIGATORIO, no opcional. Si falta, esto es `fail` y no `warn`: un
  # `warn` aqui reintroduce exactamente el agujero que este bloque vino a cerrar -el check
  # se salta en silencio y el gate sigue en verde-, solo que movido de `jq` al script. Esta
  # en `arnes.manifest`: `scripts/arnes-sync.sh` lo trae de la plantilla; va versionado.
  [ -f scripts/validate-features.mjs ] || fail "falta scripts/validate-features.mjs: sin el, feature_list.json no se valida"
  VALIDACION=$(node scripts/validate-features.mjs 2>&1) || fail "feature_list.json invalido:
$VALIDACION"
  echo "$VALIDACION" | while IFS= read -r linea; do
    case "$linea" in
      "") ;;
      AVISO:*) warn "${linea#AVISO: }" ;;
      *) ok "$linea" ;;
    esac
  done
fi

# 4.b Perfil del proyecto (arnes v2). `fail` si falta `arnes.config.json`; `warn` si un doc del
#     perfil esta vencido o sin marcador de revision. Detalle en scripts/check-perfil.mjs.
[ -f scripts/check-perfil.mjs ] || fail "falta scripts/check-perfil.mjs: sin el, el perfil del proyecto no se verifica"
PERFIL=$(node scripts/check-perfil.mjs 2>&1) || fail "$PERFIL"
echo "$PERFIL" | while IFS= read -r linea; do
  case "$linea" in
    "") ;;
    AVISO:*) warn "${linea#AVISO: }" ;;
    *) ok "$linea" ;;
  esac
done

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

# 6.c Pasos PROPIOS del proyecto (perfil): `scripts/gate-proyecto.sh`, si existe. Va aqui —con el
# `.env` ya cargado y antes de los tests— para que pueda explicar un rojo antes de verlo (p. ej. una
# base de desarrollo atrasada). No esta en `arnes.manifest`, asi que el sync no lo toca.
if [ -f scripts/gate-proyecto.sh ]; then
  # shellcheck disable=SC1091
  . scripts/gate-proyecto.sh
fi

if [ -f package.json ]; then
  run_if typecheck
  run_if lint
  if [ "$MODO" = "rapido" ]; then
    run_if test:rapido
    warn "modo rapido: solo los tests relacionados con tus cambios + las guardias."
    warn "La suite completa corre en CI al abrir el PR (check 'gate-completo'): no se mergea sin el en verde."
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
    # EL INCIDENTE DEL 2026-09-13, que es por lo que las dos comprobaciones de abajo existen:
    # `./init.sh` canto `== init OK ==` con la INTEGRACION ABORTADA EN EL ARRANQUE y CERO tests
    # corridos. El `global setup` de integracion (`tests/integration/_global-setup.ts` ->
    # `tests/helpers/test-database.ts`) murio construyendo la base de plantilla, vitest salio con
    # codigo 1, y el gate lo dio por bueno porque el veredicto salia SOLO del JSON de rojos: un
    # proyecto que no arranca no escribe rojos, luego era invisible. No simplifiques esto.
    #
    # El `|| true` de antes era imprescindible —sin el, `set -e` corta aqui y no se llega a
    # comparar— pero tiraba el codigo de salida a la basura. Ahora se CAPTURA: sigue sin decidir
    # por si solo (lo decide el comparador), pero deja de perderse.
    ESTADO_TESTS=0
    pnpm run test:json || ESTADO_TESTS=$?
    # stderr sale directo a la consola a proposito: asi el detalle esta de verdad "justo
    # arriba" y el mensaje de fallo no promete algo que no entrega.
    COMPARACION=$(node scripts/comparar-baseline-rojos.mjs .vitest-rojos.json) || fail "hay rojos NUEVOS respecto del baseline (el detalle esta justo arriba)"

    # GARANTIA 1: LOS TRES PROYECTOS APARECEN EN EL INFORME. Es la comprobacion que nos habria
    # salvado el 2026-09-13. Los nombres salen de `vitest.config.mts` (`ui`, `node`,
    # `integration`) y el reparto es el mismo de ahi, por convencion de nombre y carpeta,
    # porque el informe JSON de vitest NO trae el proyecto de cada archivo: solo su ruta.
    # Si falta un proyecto ENTERO, no corrio, y el gate no puede afirmar nada sobre el.
    LEER_PROYECTOS=$(cat <<'JS'
const { readFileSync } = require('node:fs');
const { relative, resolve } = require('node:path');
let ESPERADOS = ['ui', 'node', 'integration'];
try {
  const cfg = JSON.parse(readFileSync('arnes.config.json', 'utf8'));
  if (Array.isArray(cfg.gate?.proyectos_vitest)) ESPERADOS = cfg.gate.proyectos_vitest;
} catch { /* sin config: los tres de siempre */ }
const rutaInforme = process.argv[1];
let informe;
try {
  informe = JSON.parse(readFileSync(rutaInforme, 'utf8'));
} catch (err) {
  console.log(`no se pudo leer el informe ${rutaInforme}: ${err.message}`);
  process.exit(1);
}
const norm = (p) => relative(process.cwd(), resolve(p)).split('\\').join('/');
const proyecto = (r) =>
  r.endsWith('.test.tsx') || r.startsWith('tests/ui/')
    ? 'ui'
    : r.startsWith('tests/integration/')
      ? 'integration'
      : 'node';
if (ESPERADOS.length === 0) {
  console.log('comprobacion de proyectos de vitest desactivada (arnes.config.json > gate.proyectos_vitest = [])');
  process.exit(0);
}
const vistos = new Set();
for (const suite of informe.testResults ?? []) vistos.add(proyecto(norm(suite.name)));
const faltan = ESPERADOS.filter((p) => !vistos.has(p));
if (faltan.length > 0) {
  console.log(`el informe no trae NI UN archivo del proyecto: ${faltan.join(', ')}.`);
  console.log(`ese proyecto no llego a correr (global setup, config o un proceso caido), asi que el gate no puede afirmar nada sobre el.`);
  process.exit(1);
}
console.log(`los tres proyectos corrieron (${ESPERADOS.join(', ')})`);
JS
)
    PROYECTOS=$(node -e "$LEER_PROYECTOS" .vitest-rojos.json 2>&1) || fail "$PROYECTOS"
    ok "$PROYECTOS"

    # GARANTIA 2: CONTRADICCION = ROJO. `test:json` salio distinto de cero, el comparador no ve
    # rojos nuevos y el informe NO TRAE NI UN ARCHIVO EN ROJO que explique ese codigo. Eso es
    # contradictorio: algo fallo FUERA de los tests (arranque, global setup, configuracion, un
    # proceso que se cayo). Ahi no se da verde.
    #
    # El disparador NO es "codigo distinto de cero y sin rojos NUEVOS" a secas, y la diferencia
    # importa: con rojos HEREDADOS en el baseline (hoy son 8 archivos) la suite sana termina
    # distinta de cero en cada corrida, asi que esa version pondria el gate rojo SIEMPRE y en
    # dos dias se ignoraria. Lo contradictorio es que el informe no explique el codigo: si hay
    # al menos un archivo en rojo, el codigo ya tiene duena y el baseline sigue mandando.
    ROJOS_EN_INFORME=$(node -e "const {readFileSync} = require('node:fs'); const i = JSON.parse(readFileSync(process.argv[1], 'utf8')); console.log((i.testResults ?? []).filter((s) => s.status === 'failed').length)" .vitest-rojos.json 2>/dev/null || echo 0)
    if [ "$ESTADO_TESTS" -ne 0 ] && [ "$ROJOS_EN_INFORME" -eq 0 ]; then
      fail "contradiccion: 'pnpm run test:json' salio con codigo $ESTADO_TESTS y el informe no trae NI UN archivo en rojo.
algo fallo FUERA de los tests (arranque, global setup, configuracion, un proceso caido); un fallo asi no escribe rojos y por eso era invisible.
Que hacer: mira la salida de vitest de aqui arriba, arreglalo y vuelve a correr el gate."
    fi

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
    # `fail`, no `warn`: CHECKPOINTS exige `down.sql` y un check que solo avisa es el anti-patron
    # de la validacion opcional (docs/gate.md).
    fail "migraciones sin down.sql:$MISSING_DOWN"
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
