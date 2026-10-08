# fix-ci-shards — la suite de CI en 3 shards (2026-10-07)

Rama `chore/arnes-ci-shards`. Diseño aprobado por el humano; sin commit.

## Qué cambió
- `init.sh` (arnés): el veredicto de `--completo` (comparador + garantía 1 + garantía 2) pasa a la
  función `veredicto_tests <informe> <codigo>`, con todos sus comentarios. Modos nuevos, solo CI:
  `GATE_PARTE=estatico --completo` (todo menos vitest), `GATE_SHARD=i/N --completo` (sin
  typecheck/lint; `pnpm run test:json --shard=i/N`; escribe `.vitest-rojos.json` + `.vitest-codigo`,
  borrados antes; sale 0 sin veredicto) y `--unir <dir> <N>` (Node puro, antes de pedir pnpm;
  une y aplica `veredicto_tests` una vez). Combinaciones inválidas = `fail`.
- `--shard` va SIN `--`: con pnpm 10, `pnpm run test:json -- --shard=9/3` le pasa un `--` literal a
  vitest, que ignora el shard y corrió la suite ENTERA (visto en el proceso). Sin `--`, vitest lo
  valida (`9/3` da error).
- `scripts/unir-informes-vitest.mjs` (nuevo, arnés): exige exactamente N informes, JSON válido con
  `testResults`, `.vitest-codigo` numérico al lado y ningún archivo en dos shards. Suma contadores,
  `startTime` = mínimo, `success` = todos. stdout = código máximo (único sitio que lo calcula).
- `tests/guards/guard-unir-informes-vitest.test.ts` (nuevo, arnés): 13 casos. Script: verde con
  contadores, success, falta shard, JSON roto, sin testResults, archivo duplicado, sin
  `.vitest-codigo`, N inválido. `./init.sh --unir` sobre un repo de mentira en tmp (sin BD ni
  red): verde, G1 sin integration, G2 contradicción, rojo nuevo, falta shard.
- `arnes.manifest`: los dos archivos nuevos. `docs/gate.md`: subsección «En CI la suite va en
  shards» y viñeta en su «Por qué». `.gitignore`: `.vitest-codigo`.
- `.github/workflows/gate.yml` (perfil): jobs `estatico` (sin Postgres), `vitest` (matriz 1..3,
  fail-fast false, Postgres + credenciales, artefacto `informe-shard-<i>` con
  `include-hidden-files: true`) y `gate-completo` (needs ambos, `always()` + borrador; solo Node,
  clon superficial; rojo si estatico ≠ success o vitest cancelled/skipped; `--unir informes 3`).
  `e2e` intacto. `NODE_OPTIONS=--max-old-space-size=4096` en `env:` (texto literal de PR #163).
  El artefacto unido también lleva `include-hidden-files` (antes `.vitest-rojos.json` no se subía).

## Cómo se verificó (local, Windows, Postgres 5433)
- YAML: parseado con js-yaml (ya en el árbol); 4 jobs, needs/if correctos. Sin actionlint.
- Combinaciones inválidas de GATE_PARTE/GATE_SHARD/--unir: las 12 probadas salen 1 (o 2 de uso).
- `GATE_PARTE=estatico ./init.sh --completo`: verde en 143 s, typecheck+lint sí, vitest no.
- Shards: 1/3 269 s, 2/3 241 s, 3/3 304 s (310 archivos cada uno, sin typecheck/lint).
  `--unir`: 1 s → 930 archivos, 13396 tests. `--completo` entero: 1016 s, 930 archivos, 13396
  tests, **mismo conjunto de 10 archivos rojos** y mismo veredicto.
- Muerde con informes reales: falta un shard → 1; sin integration → 1 (G1); shard duplicado → 1;
  control (quitando el rojo ajeno) → 0.
- La primera corrida por shards cazó un fallo de la guardia nueva: heredaba `GATE_SHARD` del shard
  y `init.sh --unir` lo rechazaba. Arreglado (env sin GATE_*), re-corrido shard 2: verde.
- Guardias completas 53/53; `aviso-base-atrasada` (lee init.sh) 9/9; tsc y eslint 0.
- `./init.sh` rápido: rojo en el validador por QC-156 sin spec (feature ajena, conocido). Para
  correr lo demás se creó un `specs/QC-156-.../requirements.md` temporal y se borró al acabar.

## Riesgos abiertos
- **Rojo ajeno en dev:** `tests/unit/identity/seed/deploy-hook.test.ts` falla desde b79a43c4
  («fix build command», hoy: el build tiene 4 tramos y el test espera 3) y no está en el baseline.
  El gate completo de cualquier PR a dev saldrá rojo hasta que se arregle o se anote.
- El 3 vive en dos sitios de `gate.yml` (matriz y `--unir … 3`); un desajuste da rojo, no verde.
- `--unir` normaliza rutas contra su cwd: asume el mismo path de checkout en shards y job final
  (en GitHub es `/home/runner/work/<repo>/<repo>`). Un `.test.ts` en dos proyectos de vitest se
  vería como duplicado (hoy no hay ninguno).
- `progress/fix-ci-velocidad-ui.md` (citado en docs/gate.md) no existe en esta rama: llega con PR #161.
- Sin probar en GitHub: `include-hidden-files`, `download-artifact` por patrón y la matriz.
- Mejora al arnés sin subir a la plantilla (aviso de `arnes-sync --estado`): toca `--subir`.

Veredicto: implementado y verificado en local; falta la primera corrida real en CI.
