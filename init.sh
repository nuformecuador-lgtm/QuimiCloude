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

# 4a. Los artefactos que el ciclo dice haber producido existen de verdad.
#
#     El 2026-09-14, revisando QC-102 con el arnes en opencode, el subagente `reviewer` termino
#     su turno afirmando "El informe detallado se encuentra en progress/review_QC-102-...md".
#     Ese archivo no existia. El leader lo habria dado por revisado y seguido a PR con un
#     veredicto que nadie escribio.
#
#     Es el peor fallo posible para este arnes porque no se parece a un fallo: el turno termina
#     en verde, con un veredicto plausible y una ruta que suena bien. La regla 3 -estado en
#     disco, no en el chat- deja de cumplirse sin que nada proteste, y con ella cae la regla 4.
#
#     Va en los DOS modos: es instantaneo y no toca la red.
if [ -f scripts/check-artefactos.mjs ]; then
  ARTEFACTOS=$(node scripts/check-artefactos.mjs 2>&1) || fail "$ARTEFACTOS"
  ok "$(printf '%s' "$ARTEFACTOS" | tail -1)"
fi

# 4b. El arnes corre en dos herramientas y `.opencode/` es GENERADO desde `.claude/`.
#
#     Los formatos no son intercambiables -Claude Code declara `tools:` como CSV y no conoce
#     `mode:` ni `permission:`; opencode quiere booleanos y globs de escritura- asi que la
#     prosa vive una sola vez y `scripts/gen-opencode.mjs` la emite. Sin este check, los 22
#     archivos divergen en silencio y te enteras el dia que un agente de opencode se comporta
#     distinto al mismo agente en Claude Code, que es el peor momento para enterarse.
#
#     Va en los DOS modos: es instantaneo y no toca la red.
if [ -f scripts/gen-opencode.mjs ]; then
  DERIVA=$(node scripts/gen-opencode.mjs --check 2>&1) || fail "el arnes de opencode esta desfasado:
$DERIVA"
  ok "$(printf '%s' "$DERIVA" | head -1)"
fi

# 4c. Los ids de modelo configurados siguen existiendo.
#
#     El 2026-07-31 el id `opus-4.8` dejo de estar disponible y un `backend_dev` murio al
#     arrancar sin escribir una linea. La respuesta de entonces fue prohibir que los agentes
#     fijaran modelo; ahora vuelven a fijarlo -es lo que hace viable repartir siete roles entre
#     modelos gratuitos- asi que el agujero se tapa por el otro lado: el id muerto sale aqui y
#     no a mitad de una feature.
#
#     Solo en gate completo: son llamadas reales contra la API y la cuenta tiene techo de
#     ritmo. Sin `NVIDIA_API_KEY` el script avisa y sigue, no falla.
if [ "$MODO" = "completo" ] && [ -f scripts/check-modelos.mjs ]; then
  MODELOS_OUT=$(node scripts/check-modelos.mjs 2>&1) || fail "hay ids de modelo retirados:
$MODELOS_OUT"
  # Se imprime por sustitucion y no con `while read`: con `printf '%s'` la ultima linea sale
  # SIN salto final, `read` devuelve falso al leerla y el cuerpo del bucle no corre nunca. El
  # paso quedaba mudo y en verde, que es exactamente el agujero que este archivo ya describe
  # dos veces mas arriba.
  ok "$(printf '%s' "$MODELOS_OUT" | tail -1 | sed 's/^ *//')"
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

# 6.c El estado de la base de DESARROLLO, ANTES de los tests y en los DOS modos (R14-R16).
# Va aqui y no antes: el 6.b es quien deja `DATABASE_URL` en el entorno, y sin ella no hay base
# que consultar. Y va antes de los tests porque su razon de ser es explicar un rojo ANTES de
# verlo: el 2026-09-12 la base iba cuatro migraciones atras y eso dejo 22 archivos en rojo sin
# que nada dijera la causa.
#
# AVISA, NO FALLA (R15). El codigo de salida del gate no cambia por el estado de una base local:
# bloquear un PR por eso seria un gate que se ignora. De ahi el `|| true` — sin el, `set -e`
# cortaria el init si `db:test status` devolviera no-cero.
#
# Lo que SI es `fail` es que falte el script. `docs/verification.md > El anti-patron: la
# validacion opcional`: un check colgado de `[ -f <script> ]` con un `warn` en el `else` no es un
# check, se salta entero y el gate sigue verde. Que `scripts/test-db.ts` no exista es una rotura
# del arnes, no una circunstancia.
[ -f scripts/test-db.ts ] || fail "falta scripts/test-db.ts: sin el, el gate no puede decir si la base de desarrollo va atrasada"
echo "-> pnpm run db:test status"
# `2>&1` a proposito: `$(...)` captura solo stdout, y este bloque SI reimprime lo capturado. Si
# el detalle se fuera por stderr, el aviso prometeria una razon que no entrega.
SALIDA_DB=$(pnpm run db:test status 2>&1) || true
# Alternacion de literales, no `[✓!✗]`: una clase de caracteres con multibyte puede casar por
# byte suelto y cazar cualquier otro simbolo Unicode.
VEREDICTO_DB=$(printf '%s\n' "$SALIDA_DB" | grep -E '^(✓|!|✗)' || true)
if [ -z "$VEREDICTO_DB" ]; then
  warn "no se pudo comprobar el estado de la base de desarrollo; salida de 'pnpm run db:test status':"
  printf '%s\n' "$SALIDA_DB"
elif printf '%s\n' "$VEREDICTO_DB" | grep -q '^✓'; then
  printf '%s\n' "$VEREDICTO_DB" | while IFS= read -r LINEA_DB; do
    LINEA_DB=${LINEA_DB#✓ }
    ok "$LINEA_DB"
  done
else
  printf '%s\n' "$VEREDICTO_DB" | while IFS= read -r LINEA_DB; do
    LINEA_DB=${LINEA_DB#! }; LINEA_DB=${LINEA_DB#✗ }
    warn "$LINEA_DB"
  done
  # La coletilla solo cuando la base VA ATRAS: si no se pudo consultar, decir que «la app a mano
  # si se ve afectada» seria afirmar algo que el gate no sabe.
  case "$VEREDICTO_DB" in
    *atras*)
      warn "Los tests de integracion NO se ven afectados (corren sobre base propia), pero la app a mano si." ;;
  esac
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
const ESPERADOS = ['ui', 'node', 'integration'];
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
