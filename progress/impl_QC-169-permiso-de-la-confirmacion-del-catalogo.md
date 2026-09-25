# impl QC-169 — permiso-de-la-confirmacion-del-catalogo

Spec aprobado el 2026-09-25 (P1 ratificada: la vista previa también exige `proveedores.modificar`).
Implementado por `backend_dev` en el worktree `.worktrees/QC-169-permiso-de-la-confirmacion-del-catalogo`.

## Commits
- `8464b391` feat: declara `CATALOG_IMPORT_PERMISSION` en el dominio de documentos (T1)
- `7ce20d82` feat: la confirmación exige `proveedores.modificar` (T2)
- `0703f29c` feat: la vista previa exige `proveedores.modificar` (T3)
- `3f550416` test: la subida sigue exigiendo su permiso y el nuevo se escribe una vez (T4)
- `7bc2fac6` chore: baseline de rojos vacío (T5)
- T6 no genera cambios versionados.

## Archivos
Producción:
- `lib/modules/documentos/domain/actor.ts`: `CATALOG_IMPORT_PERMISSION: PermissionCode = 'proveedores.modificar'`, con JSDoc. No está en el barrel.
- `lib/modules/documentos/domain/confirm-catalog-import.ts`: la primera línea usa `CATALOG_IMPORT_PERMISSION`. `inventario.modificar` (l.177) no cambia.
- `lib/modules/documentos/domain/preview-catalog-import.ts`: la primera línea usa `CATALOG_IMPORT_PERMISSION`.

Tests:
- `tests/unit/documentos/catalog-import-authorization.test.ts`: los actores pasan a `proveedores.modificar`, más los casos R3 y R4.
- `tests/unit/documentos/confirm-catalog-import.test.ts`: el actor base pasa a `['proveedores.modificar','inventario.modificar']`.
- `tests/unit/documentos/preview-catalog-import.test.ts`: el actor base pasa a `proveedores.modificar`, más los casos R8 y R9.
- `tests/unit/documentos/authorization.test.ts`: el caso de R11 y el bloque de R10 (tres casos de subida).
- `tests/unit/documentos/catalog-import-actions.test.ts`: actor a `CATALOG_IMPORT_PERMISSION` (solo coherencia, P2).
- `tests/baseline-rojos.json`: `"archivos": {}`; se conserva `_nota`.

No se tocó: `tests/integration/documentos/catalog-import-isolation.int.test.ts`, `DOCUMENT_UPLOAD_PERMISSION` ni los casos de subida.

## Mapa R -> test
| R | Test |
|---|---|
| R1, R2 | `tests/unit/documentos/catalog-import-authorization.test.ts`, describe «R31 — el permiso de documentos se exige primero» (matriz de denegados y «con permiso, el archivo se lee ANTES que cualquier otro puerto») |
| R3 | ídem, «R3 — el actor tiene solo 'documentos.modificar': unauthorized y ningun puerto tocado» |
| R4 | ídem, «R4 — el actor tiene solo 'proveedores.modificar' y no hay presentacion nueva: devuelve el resumen»; además R22 de `catalog-import-isolation.int.test.ts` |
| R5, R6 | ídem, describe «R33» («rechaza ANTES de crear la presentacion…» y «sin presentacion nueva, confirma sin inventario.modificar») |
| R7, R8, R9 | `tests/unit/documentos/preview-catalog-import.test.ts`, describe «R31»: la matriz de denegados con «R8 — solo con 'documentos.modificar'» y «R9 — con solo 'proveedores.modificar' (sin 'documentos.modificar') devuelve la vista previa» |
| R10 | `tests/unit/documentos/authorization.test.ts`, describe «la subida sigue exigiendo su propio permiso (R10)»: `issueUploadLinks`, `enqueueBatch`, `getBatchStatus` |
| R11 | ídem, «R11 — el codigo de 'CATALOG_IMPORT_PERMISSION' se escribe UNA sola vez y es distinto del de subida» |
| R12 | `tests/integration/documentos/catalog-import-isolation.int.test.ts` sin tocar: 6/6 verde y diff vacío (abajo) |
| R13 | `tests/baseline-rojos.json` sin la clave; el comparador da «baseline vacio» (abajo) |

## Base propia
- `pnpm run db:test template` dio la plantilla `qct_tpl_87988ea6377c` (53 migraciones, ya sembrada).
- Se creó con `CREATE DATABASE "QuimiCloude_QC169" TEMPLATE "qct_tpl_87988ea6377c"`. `.env` del worktree (no versionado): `DATABASE_URL`/`DIRECT_URL` apuntan a `QuimiCloude_QC169`.
- `db:migrate`: `No pending migrations to apply.` `db:seed`: `nada que crear`.
- El worktree no tenía `node_modules`: `pnpm install --frozen-lockfile --prefer-offline` + `prisma generate`. El lockfile no cambió.
- El arnés de integración crea su propia copia efímera desde la plantilla en cada corrida.

## Salidas
- `pnpm run typecheck`: limpio. La primera corrida falló en `app/layout.tsx` por falta de `LayoutProps`, porque el worktree no tenía `.next/types`. Se resolvió con `pnpm exec next typegen`. No es un cambio de esta ficha.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`. Los 7 warnings ya estaban (`_args` en `confirm-catalog-import.test.ts` y 2 en `order-service.test.ts`) y ninguno cae en líneas tocadas.
- `pnpm exec vitest related --run <8 archivos>`: `Test Files 201 passed (201)`, `Tests 2948 passed | 1 skipped (2949)`, 388 s. El grafo arrastró casi toda la suite. No es una corrida de la suite completa ni sustituye al gate.
- `pnpm exec vitest run tests/integration/documentos/catalog-import-isolation.int.test.ts --project=integration`: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.
- `git diff origin/dev -- tests/integration/documentos/catalog-import-isolation.int.test.ts`: vacío (0 líneas).
- `node scripts/comparar-baseline-rojos.mjs .vitest-rojos.json` (con el reporte de un subconjunto): `sin rojos nuevos (1 archivos ejecutados, baseline vacio)`.
- Guardias (`pnpm exec vitest run guard`): `Test Files 50 passed (50)`, `Tests 628 passed | 11 skipped (639)`.
- Mutación: las dos llamadas se devolvieron a `DOCUMENT_UPLOAD_PERMISSION` y se pusieron en rojo 25 de 34 tests, entre ellos R3, R4, R8 y R9. Tras revertir, 34/34 en verde y diff limpio.

## Pendiente (leader)
- T7: `./init.sh --rapido` y `./init.sh` completo. El comparador debe dar «baseline vacio» y ningún aviso «por limpiar». No se ha corrido.
- La feature no toca UI: E2E no necesario.
