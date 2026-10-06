# impl QC-209 — importar-inventario-desde-excel

## Estado (2026-10-06)

- Rama al día con `origin/dev` (merge 215dc36f, 47 commits de QC-204 y otros) antes de T0.
- **T0 cerrada**: commit 717dfcd5 `feat(QC-209): T0 contrato de la importacion`.
- Pistas B y F **sin empezar**: esperan el gate de T0 (ver Bloqueo).

## T0 — archivos

Nuevos:
- `lib/modules/inventario/domain/inventory-import-contract.ts`
- `lib/modules/inventario/domain/inventory-import-downloads.ts` (plantilla simple; errores stub)
- `lib/modules/inventario/domain/preview-inventory-import.ts` (lanza «sin implementar»)
- `lib/modules/inventario/domain/confirm-inventory-import.ts` (lanza «sin implementar»)
- `lib/modules/inventario/adapters/driving/inventory-import-actions.ts` (stubs de 1.9)
- `lib/modules/inventario/adapters/driving/inventory-import-fixtures.ts`
- `tests/unit/inventario/inventory-import-contract.test-d.ts`
- `tests/unit/inventario/inventory-import-actions.test.ts` (15 casos `R32 …`)

Modificados:
- `lib/modules/inventario/index.ts` (reexporta los cuatro de dominio, exportaciones nombradas)
- `lib/shared/routes.ts` (`INVENTORY_IMPORT_ROUTE`; el prefijo `/inventario` ya la cubre)
- `tests/unit/inventario/scope.test.ts` — exime `inventory-import-fixtures.ts` de la exigencia
  de `'use server'` en `adapters/driving/`. **TI debe quitar la exención al borrar los fixtures.**
- `tests/unit/recetas-ui/recipe-route-contract.test.ts` — lista fija de constantes de `routes.ts`.

## Desvíos de forma respecto a design.md > 1 (sin cambio de contrato)

1. `ImportRowType = ProductType` (mismo tipo; `guard-tipos-de-producto` prohíbe los literales fuera
   de `product-type.ts`). El test-d lo fija.
2. Borde de `file` con `z.file()` y no `z.instanceof(File)` (`guard-catalogo-de-errores`).
3. `INVENTORY_IMPORT_COLUMNS` lleva además `satisfies` de la forma de columna; tipo inferido igual.
4. Deps de las factorías: `Readonly<Record<string, unknown>>`, B8 lo estrecha sin tocar el barrel.
5. Los stubs no llaman a `revalidatePath` (no escriben); lo añade TI.
6. Nombre del archivo de errores: `<origen sin extensión>-errores.csv`.

## Abierto para el humano

- **`IMPORT_EXAMPLE_ROW`**: el spec no fija sus valores; T0 puso Insumo «Ejemplo ácido cítrico»,
  unidad kilogramo, existencia 25, costo unitario 3,50, lote EJEMPLO-001, fechas 2026-01-15 /
  2027-01-15, alerta 5. Pendiente de validar (R3, R8 dependen de ella).

## Test-d

Vitest no recoge `*.test-d.ts` (config incluye solo `*.test.ts(x)`). Lo compila `pnpm run typecheck`
vía `tsconfig` (`**/*.ts`), igual que `tests/unit/observabilidad/error-state-types.test-d.ts`.
Incluye un `@ts-expect-error` (fila `error` con `issues` vacío).

## Verificación T0 (salida real)

- `pnpm run typecheck`: exit 0, sin salida.
- `pnpm run lint`: `✖ 8 problems (0 errors, 8 warnings)` — los 8 preexistentes.
- vitest (actions + scope + recipe-route-contract): `Test Files 3 passed (3) / Tests 45 passed (45)`.
- vitest guardias + actions: `Test Files 52 passed (52) / Tests 696 passed | 11 skipped (707)`.
- `pnpm run test:rapido`: `Test Files 7 failed | 433 passed (440)`; los 7 rojos están en
  `tests/baseline-rojos.json` (product-page, recipe-page, unidades-viewport, usuarios-viewport,
  recetas/scope, recetas/module-contract, pantallas-exigen-permiso). `--rapido` no consulta el baseline.
- `./init.sh --rapido`: **exit 1 en el primer check**: `specs/QC-209-importar-inventario-desde-excel/
  no tiene ficha en feature_list.json: falta QC-209.`

## Bloqueo

La ficha QC-209 solo existe como cambio **sin commitear** en `feature_list.json` del árbol principal
(`dev`). El worktree no la tiene. Es archivo del leader: hace falta commitearla en `dev` (y la
mergeo) o indicarme cómo proceder.

## DS-13 (fixture .xlsx)

No hay LibreOffice ni openpyxl, pero **Excel 16 responde por COM** en esta máquina: B4 puede producir
`tests/fixtures/inventario-importar/mixto.xlsx` desde el .csv mixto con Excel.

## Setup del worktree

`pnpm install --frozen-lockfile --prefer-offline`, `prisma generate`, `next typegen`. Lockfile sin cambios.

## Gate de T0, segunda corrida (tras 9b9666fc, ficha en feature_list.json)

`./init.sh --rapido` -> **exit 1, no verde.** En verde: Node, dependencias, Prisma, tipos de ruta,
fichas, cupo (in_progress=2), specs, worktrees, base de desarrollo (71 migraciones), typecheck y lint
(0 errores, 8 warnings preexistentes). Falla el check `pnpm run test:rapido` (vitest related de los
12 archivos del diff contra origin/dev, más las guardias), y el gate se corta ahí:

```
 Test Files  7 failed | 433 passed (440)
      Tests  9 failed | 6699 passed | 50 skipped (6758)
✗ 'pnpm run test:rapido' fallo
```

Los 7 archivos rojos están todos en `tests/baseline-rojos.json`: configuracion-ui/unidades-viewport (2),
configuracion-ui/usuarios-viewport (2), navegacion/pantallas-exigen-permiso (1), inventario/product-page (1),
recetas-ui/recipe-page (1), recetas/module-contract (1), recetas/scope (1). Salen porque importan el
barrel de inventario o `routes.ts`. No hay rojos fuera del baseline.

Mientras la rama toque el barrel de inventario o `routes.ts`, `--rapido` va a salir así; el leader
decide con qué criterio se sigue. Pistas B y F sin lanzar.

TI: anotada en tasks.md la retirada de la exención de `scope.test.ts`.
