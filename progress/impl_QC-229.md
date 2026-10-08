# impl QC-229 — despliegue-automatico-a-produccion (backend_dev, 2026-10-08)

Feature `sdd: false`: sin spec ni `R<n>`; el alcance es la ficha y `progress/features/QC-229.md`.

## Archivos
- nuevo `.github/workflows/desplegar.yml` — push a `prod` + `workflow_dispatch`, CLI `vercel@63.1.0 deploy --prod`, build remoto.
- nuevo `scripts/build.mjs` — guarda del build: en Vercel (`VERCEL` definida) migrate y seed solo con `VERCEL_ENV=production` (vacio/ausente/preview/development los saltan, lado seguro); fuera de Vercel, todo. Imprime siempre la linea `[build] ...` de la decision (`motivo`).
- mod `package.json` — `scripts.build` = `node scripts/build.mjs`.
- mod `docs/architecture.md` — seccion `## Despliegue a produccion (QC-229, 2026-10-08)`.
- nuevo `tests/unit/scripts/build.test.ts` — 8 casos de `pasosDelBuild`.
- nuevo `tests/guards/guard-despliegue-produccion.test.ts` — 7 casos sobre el workflow y `scripts.build`.

## Alcance -> test
- migrate/seed solo en produccion o fuera de Vercel -> `tests/unit/scripts/build.test.ts` (VERCEL=1 con production, preview, development, vacio y ausente; sin VERCEL con VERCEL_ENV ausente y con preview; orden; cada uno afirma la linea `motivo`).
- dispara solo en push a prod y a mano; `--prod`; version semver fija; 3 secrets; `contents: read`; sin `vercel build`; `scripts.build` -> `tests/guards/guard-despliegue-produccion.test.ts`.
- Muerde: 9 mutaciones del workflow (rama extra, `latest`, sin version, sin `--prod`, secret renombrado, `contents: write`, `pull_request`, permissions por job, `vercel build`) dan rojo cada una.

## Salida
- `pnpm exec vitest run tests/unit/scripts/build.test.ts tests/guards/guard-despliegue-produccion.test.ts` -> 2 archivos, 15 tests en verde (ajuste VERCEL/VERCEL_ENV).
- `pnpm run typecheck` -> exit 0.
- `pnpm run lint` -> exit 0; 0 errores, 7 warnings preexistentes ajenos (`confirm-catalog-import.test.ts`, `order-service.test.ts`); los 3 archivos nuevos, limpios.
- Humo de `node scripts/build.mjs` con `VERCEL_ENV=preview` y sin PATH: imprime la linea de salto y propaga exit 1 (antes del ajuste; el ajuste solo cambia la decision y el texto, no el bucle).

Veredicto: listo para review; falta que el humano cree los 3 secrets y verificar el primer despliegue real.
