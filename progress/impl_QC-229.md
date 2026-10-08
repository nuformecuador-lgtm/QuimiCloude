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

## Tanda 2 — arreglos de `progress/review_QC-229.md` (2026-10-08)

### Archivos
- mod `scripts/build.mjs` — el bucle de `main` pasa a `export function ejecutarBuild(env, ejecutar, salida)`:
  devuelve el codigo (0; el del paso que falla; 1 si `error` o `status` null). La entrada directa la
  llama con `spawnSync` real y hace `process.exit(codigo)`.
- mod `tests/unit/scripts/build.test.ts` — +6 casos de `ejecutarBuild` con ejecutor falso (14 en total).
- mod `tests/unit/identity/seed/deploy-hook.test.ts` — QC-6 R19/R20 adaptados al contrato nuevo.
- mod `specs/QC-6-seed-roles-y-usuario-inicial/requirements.md` — fila 2026-10-08 en la tabla de decisiones (enmienda del mecanismo de R19/R20).
- mod `tests/guards/guard-despliegue-produccion.test.ts` — +3 casos: `concurrency`, paso de secrets antes del deploy, sin `--token` (10 en total).
- mod `.github/workflows/desplegar.yml` — fuera `--token "$VERCEL_TOKEN"`: la CLI 63.1.0 lo lee del entorno (`dist/index.js:16` del paquete).
- mod `docs/dependencias.md` — seccion `## Herramientas fuera de package.json` con la CLI `vercel@63.1.0` (estado abierto).

### Mapa -> test
- QC-6 R19 (el seed corre en cada despliegue de produccion) -> `deploy-hook.test.ts`: «scripts.build delega en scripts/build.mjs» y «fuera de Vercel / en Vercel production: los cuatro pasos, en orden» (`it.each`).
- QC-6 R20 (si el seed falla, falla el despliegue) -> `deploy-hook.test.ts`: «si el seed falla, el build sale con su codigo distinto de 0 y next build no corre»; detalle en `build.test.ts > ejecutarBuild` (falla el seed, falla el primero, status null, error de lanzamiento, todos ok, log de la decision).
- concurrency fija y sin cancelar; secrets comprobados antes del deploy; token por entorno -> `guard-despliegue-produccion.test.ts`.
- Muerde (10 mutaciones, todas revertidas, `cmp` contra copia): `cancel-in-progress: true`, sin `cancel-in-progress`, grupo con `${{ github.ref }}`, sin paso de secrets, sin `exit 1`, sin el check de ORG, con `--token`, paso de secrets despues del deploy -> 1 rojo cada una; `build.mjs` sin el corte en `status !== 0` -> 4 rojos (incluido R20 de QC-6); error de lanzamiento que no corta -> 1 rojo.

### Salida
- `pnpm exec vitest run tests/unit/identity tests/unit/scripts tests/guards` -> 154 archivos, 2630 passed, 36 skipped, 0 rojos.
- `pnpm run typecheck` -> exit 0.
- `pnpm run lint` -> exit 0; 0 errores, 7 warnings preexistentes ajenos (`confirm-catalog-import.test.ts`, `order-service.test.ts`); los archivos tocados, limpios.

### Abierto
- Version `vercel@63.1.0` sin aprobacion humana explicita; transitivas de `npx` sin lockfile (ver `docs/dependencias.md`).

Veredicto: arreglos del review aplicados y en verde; falta la re-review, que el humano cree los 3 secrets y el primer despliegue real.
