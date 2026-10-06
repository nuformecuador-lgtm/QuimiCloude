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

## Pista B persistencia

B6 y B7 (backend_dev, 2026-10-06).

### Archivos

- `db/schema.prisma` — modelo `InventoryImport` (`/// @module inventario`).
- `db/migrations/20261006120000_inventory_imports/migration.sql` y `down.sql` — tabla, único
  `inventory_imports_company_key_unique`, índice `(company_id, created_at)`, FK a mano a `companies` y
  `users` (RESTRICT), CHECK `inventory_imports_counts_non_negative` y
  `inventory_imports_finished_has_totals`, `ENABLE` + `FORCE ROW LEVEL SECURITY` sin policies (mismo
  patrón que las demás tablas de inventario). `down.sql`: `DROP TABLE IF EXISTS`.
- `lib/modules/inventario/ports/inventory-import-repository.ts` — puerto + `ImportProductRef`,
  `ImportedFinishedGoods`, `ImportClaim`, `ImportedFinishedGoodsOutcome`.
- `lib/modules/inventario/ports/import-formula-lookup.ts` — `ImportFormulaLookup`.
- `lib/modules/inventario/adapters/driven/persistence/inventory-import-prisma.ts` — los seis métodos.
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` — solo `export` en
  `resolveLot` y `toBatchCreateData`. `recalculateProductStock` ya estaba exportada. `writeMovement` no
  vive en `product-prisma.ts` (la importa de `batch-movement-prisma.ts`, donde ya es `export`): el
  adaptador nuevo la importa de allí.
- `tests/integration/inventario/inventory-import-repository.int.test.ts`,
  `tests/integration/inventario/inventory-import-isolation.int.test.ts`,
  `tests/integration/inventario/inventory-import-fixture.ts` (siembra compartida, no es suite).
  Sufijo `.int.test.ts` y no `.test.ts` como dice tasks.md: es el que reconoce
  `guard-aislamiento-integracion` (`SUFIJO_DE_SUITE`).
- `tests/integration/aislamiento.json` — los dos archivos nuevos en `commit`, con motivo y desde.

**No tocado:** `tests/guards/guard-ambito-empresa-inventario.test.ts`. La guardia enumera puertos en
`PUERTOS`, pero cada entrada exige `const inventoryImportRepository: InventoryImportRepository = {`
en `lib/composition/index.ts`, que es B10. Añadirla ahora pondría la guardia en rojo. **B10 debe
añadir** `{ nombre: 'InventoryImportRepository', port: 'inventory-import-repository.ts', constante:
'inventoryImportRepository', adaptadores: ['inventory-import-prisma.ts'] }` al cablear. Mientras,
el segundo bloque de la guardia (barrido de todos los archivos de persistencia) ya verifica que cada
función de `inventory-import-prisma.ts` que consulta declara y consume `scope`.

### Decisiones de implementación (dentro del diseño)

- `findAliveProductsByNormalizedNames` normaliza los nombres con `normalizeProductName` (idempotente),
  devuelve todos los tipos vivos, orden `created_at, id`.
- `findBatchesByLots` incluye lotes de productos dados de baja: la unicidad `(company_id, lot)` no
  mira `deleted_at`.
- `claimImport` guarda `created_at = now`; `already.importedAt` es ese `created_at`.
- `finishImport` lanza si la fila no es de la empresa (0 filas actualizadas).
- `receiveImportedFinishedGoods`: transacción propia; `INSERT ... ON CONFLICT DO NOTHING RETURNING`
  da `created`; presentación ajena o sin contenido -> `presentation_without_content` (ROLLBACK);
  lote a mano repetido -> `duplicate_lot`; lote generado que choca se reintenta hasta 3 veces.
  `ImportedFinishedGoods` lleva `unitCost` ya resuelto, `lot | null`, `purchaseDate`, `expiryDate`.

### Mapa R -> test (lado persistencia)

| R | Test |
| --- | --- |
| R29 | `inventory-import-repository.int.test.ts` > «R29: la segunda reserva de la misma clave devuelve already con la importacion previa»; «R29: dos reservas simultaneas de la misma clave, solo una gana»; `inventory-import-isolation.int.test.ts` > «R31, R29: la misma clave en otra empresa es otra importacion» |
| R30 | `inventory-import-repository.int.test.ts` > «R30: queda quien la hizo, cuando, el archivo y, al cerrar, las cuentas»; «R30: la base rechaza cuentas negativas y un cierre sin cuentas» |
| R31 | `inventory-import-isolation.int.test.ts` > los seis casos «R31: ...» (homónimo, terminado, lote, clave, `finishImport` cruzado lanza y no cierra, `receiveImportedFinishedGoods` con presentación ajena no escribe) |
| R14/R15/R17 (apoyo) | «R14: el primero de cada identidad es el mismo que elige findAliveIdByNameInPresentationUnit»; «R17: devuelve tambien los terminados vivos con su formula y presentacion» |
| R16 (apoyo) | «R16: solo el par pedido, vivo y de tipo terminado»; «R16: la primera vez crea el producto, el lote con package_content y el asiento opening; despues suma»; «R16: presentacion sin contenido devuelve presentation_without_content y no crea el producto» |
| R18/R19 (apoyo) | «R18, R19: devuelve lote y producto, tambien de un producto dado de baja»; «R18: un lote escrito a mano que ya existe devuelve duplicate_lot y no escribe nada» |

### Migración: migrate / rollback

El `.env` del worktree apunta a `localhost:5432/QuimiCloude`, la misma base de desarrollo que el árbol
principal y los demás worktrees. Ningún doc autoriza migrarla desde un worktree: **no se migró la base
de desarrollo**. La verificación se hizo sobre una base desechable `qct_qc209_migcheck`, copia de la
plantilla `qct_tpl_0524a8735d8d` (al día hasta `20261005120000_recipe_packing_steps`), con
`DATABASE_URL`/`DIRECT_URL` apuntando a ella:

```
pnpm run db:migrate   -> 20261006120000_inventory_imports/migration.sql ... All migrations have been successfully applied.
prisma migrate diff   -> en inventory_imports solo "Removed foreign key on columns (company_id)" y "(created_by)": las FK a mano, drift esperado como en el resto de tablas
pnpm run db:rollback  -> db:rollback: 20261006120000_inventory_imports revertida.   (tabla: null; filas en _prisma_migrations: 0)
pnpm run db:migrate   -> All migrations have been successfully applied.            (relrowsecurity true, relforcerowsecurity true; filas en _prisma_migrations: 1)
```

Base desechable borrada al terminar. **Pendiente para el humano/leader:** aplicar
`20261006120000_inventory_imports` a la base de desarrollo cuando se decida (`pnpm run db:migrate`).

### Salidas reales

- `pnpm run typecheck` -> `tsc --noEmit` sin errores.
- `pnpm run lint` -> `✖ 8 problems (0 errors, 8 warnings)` — los 8 preexistentes, ninguno en archivos de B6/B7.
- Integración (`vitest run --project integration` de los dos archivos nuevos, base efímera
  `qct_qc209_3c9e4900_muwrk8qy_do8`, copia de la plantilla nueva `qct_tpl_79d9c897501e`):
  `Test Files  2 passed (2)` / `Tests  18 passed (18)`.
- Guardias (`guard-empresa-en-esquema`, `guard-rls-force`, `guard-ambito-empresa-inventario`,
  `guard-aislamiento-integracion`, `guard-arquitectura-modulos`): `Test Files  5 passed (5)` /
  `Tests  119 passed (119)`.
- `vitest related --run` de los cuatro archivos de lib: `Test Files  5 failed | 310 passed (315)` /
  `Tests  7 failed | 4365 passed | 1 skipped (4373)`. Los 5 archivos rojos (unidades-viewport,
  usuarios-viewport, pantallas-exigen-permiso, product-page, recipe-page) están en
  `tests/baseline-rojos.json` y fallan igual corridos solos.

Veredicto: B6 y B7 hechos; persistencia lista para B8, con la entrada de la guardia de puertos a
completar en B10.
