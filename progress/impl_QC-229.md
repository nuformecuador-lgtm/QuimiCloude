# impl QC-229 — despliegue-automatico-a-produccion (backend_dev, 2026-10-08)

Feature `sdd: false`: sin spec ni `R<n>`; el alcance es la ficha y `progress/features/QC-229.md`.

## Archivos
- nuevo `.github/workflows/desplegar.yml` — push a `prod` + `workflow_dispatch`, CLI `vercel@63.1.0 deploy --prod`, build remoto.
- nuevo `scripts/build.mjs` — guarda del build: migrate y seed solo con `VERCEL_ENV=production` o sin `VERCEL_ENV`.
- mod `package.json` — `scripts.build` = `node scripts/build.mjs`.
- mod `docs/architecture.md` — seccion `## Despliegue a produccion (QC-229, 2026-10-08)`.
- nuevo `tests/unit/scripts/build.test.ts` — 5 casos de `pasosDelBuild`.
- nuevo `tests/guards/guard-despliegue-produccion.test.ts` — 7 casos sobre el workflow y `scripts.build`.

## Alcance -> test
- migrate/seed solo en produccion o fuera de Vercel -> `tests/unit/scripts/build.test.ts` (production, preview, development, ausente, orden).
- dispara solo en push a prod y a mano; `--prod`; version semver fija; 3 secrets; `contents: read`; sin `vercel build`; `scripts.build` -> `tests/guards/guard-despliegue-produccion.test.ts`.
- Muerde: 9 mutaciones del workflow (rama extra, `latest`, sin version, sin `--prod`, secret renombrado, `contents: write`, `pull_request`, permissions por job, `vercel build`) dan rojo cada una.

## Salida
- `pnpm exec vitest run tests/unit/scripts/build.test.ts tests/guards/guard-despliegue-produccion.test.ts` -> 2 archivos, 12 tests en verde.
- `pnpm run typecheck` -> exit 0.
- `pnpm run lint` -> exit 0; 0 errores, 7 warnings preexistentes ajenos (`confirm-catalog-import.test.ts`, `order-service.test.ts`); los 3 archivos nuevos, limpios.
- Humo de `node scripts/build.mjs` con `VERCEL_ENV=preview` y sin PATH: imprime la linea de salto y propaga exit 1.

Veredicto: listo para review; falta que el humano cree los 3 secrets y verificar el primer despliegue real.
