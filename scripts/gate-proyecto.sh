#!/usr/bin/env bash
# scripts/gate-proyecto.sh — pasos del gate PROPIOS de este proyecto (perfil, no arnes).
#
# `init.sh` lo carga con `source` despues de cargar el `.env` y ANTES de typecheck/lint/tests, en
# los dos modos. Tiene a mano `ok`, `warn` y `fail` y la variable `MODO` (rapido|completo). Lo que
# va aqui NO lo pisa `scripts/arnes-sync.sh`: no esta en `arnes.manifest`.

# Artefactos generados del stack (Prisma + Next).
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
# Lo que SI es `fail` es que falte el script. `docs/gate.md > El anti-patron: la
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
