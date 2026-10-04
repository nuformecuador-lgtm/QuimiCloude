# QC-195 — envases-del-pedido-como-productos · bitácora del implementer

Rama `feature/QC-195-envases-del-pedido-como-productos`, worktree
`.worktrees/QC-195-envases-del-pedido-como-productos`. `tasks.md` nombra esta bitácora
`progress/impl_QC-195.md`; se usa el nombre largo, como las demás fichas.

## Base de datos (preparación de T1) — 2026-10-03, backend_dev

- Worktree sin `node_modules`: `pnpm install --frozen-lockfile` (sin cambios en `package.json` ni en
  el lockfile), `prisma generate`, `next typegen`.
- `pnpm run db:test template` → plantilla **reutilizada** `qct_tpl_4ac38981fdda` (63 migraciones;
  las migraciones de la rama no han cambiado).
- **Base propia `QuimiCloude_QC195`**, mismo servidor que `QuimiCloude` (localhost:5432, mismas
  credenciales), creada con `CREATE DATABASE "QuimiCloude_QC195" TEMPLATE "qct_tpl_4ac38981fdda"`
  desde un script de `pg` conectado a la base `postgres` (no hay `psql` en el `PATH`).
  `QuimiCloude` no se tocó.
- `.env` del worktree respaldado en `.env.bak-QC195` (git-ignorado: `git check-ignore` →
  `.gitignore:38:.env*`). `DATABASE_URL` y `DIRECT_URL` apuntan a `QuimiCloude_QC195`:
  `grep -cE '^(DATABASE_URL|DIRECT_URL)=.*QuimiCloude_QC195' .env` = **2**.
- `prisma migrate status`: «Database schema is up to date!».
- Sin migraciones nuevas todavía (T1). **Borrar `QuimiCloude_QC195` al cerrar la feature.**

## T0 — Recontraste

- La rama sale de `dev` en `555c62f6`, la misma punta sobre la que se escribió `design.md`; los tres
  commits posteriores (`956bbee5`, `f27a8dc4`, `0eeaf2e6`) solo tocan `specs/` y `progress/current.md`.
  Las referencias no pueden haberse movido por código; aun así se comprobaron a mano.
- **§6**: comprobadas las filas 1-23c (migraciones, `schema.prisma`, `product-input.ts`,
  `create-product.ts`, `product-prisma.ts`, `product-catalog-prisma.ts:127/:150`,
  `plan-reservation.ts:52-56`, `reservation-prisma.ts:109/:193/:427`, `order-requirement.ts:18`).
  Todas valen. Matiz menor: `db/schema.prisma:672-674` es el comentario del modelo, `model
  OrderPresentationLine` empieza en `:676`, como dice la fila 4.
- **§11**: todas las firmas citadas están en la línea dicha (`product-actions.ts:10/:157/:233`,
  `page.ts:7`, `list-query.ts:54`, `product-view.ts:37`, `product-queryable.ts:20`,
  `list-products.ts:58`, `batch-actions.ts:15/:80`, `order-actions.ts:219/:237/:373/:399/:422/:429`,
  `order-input.ts:70/:187/:213`, `order-view.ts:41`, `quote-order-cost.ts:21`,
  `error-state.ts:27`, `use-order-distribution-availability.ts:20`,
  `order-packing-actions.ts:64-70`, `finish-packing.ts:49`, `recipe-actions.ts:144/:161/:223/:243`,
  `formula-import-actions.ts:57/:75`, `product-batch-view.ts:1`). Movidas: ninguna. Matiz:
  `OrderPresentationAvailability` se declara en `order-presentation-availability.ts:30`
  (§11.5 dice `:30-33`, correcto).
- **§8 sobre la punta**: los archivos existen todos. Corridos (con TC ya escrito, que solo añade
  tipos y no cambia nada en ejecución): 35 archivos unit/guardia → **803 verdes**; 10 de
  integración (`qc170-*`, `inventario-constraints`, `pedidos-constraints`, `order-content-copy`,
  `finish-with-finished-goods`, `finished-goods*`, `list-query-indexes`) → **125 verdes**.
  **Rojos de partida: cero.** E2E no corridas (fuera de esta tanda).
- **Omisión de §8 (encontrada en TC):** `tests/unit/inventario/module-contract.test.ts`
  («QC-90 R31 — el listado de productos no devuelve presentacion») prohibía cualquier
  `presentation*` en `ProductView`, en compilación y por texto. Los cuatro campos de §11.2 lo
  ponen rojo. Se reescribió contra R8-R10: ahora exige que los campos `presentation*` de
  `ProductView` sean **exactamente** los cuatro de la presentación fija (en compilación y por
  texto); la presentación del lote sigue fuera del listado, que era lo que R31 defendía.
- P4: decidida A antes de esta tanda; ni `requirements.md` ni `design.md` se tocaron.

## TC — Contrato front↔back

Solo tipos y constantes; ninguna acción nueva ni falsa, ningún esquema `zod` cambiado.

| Nombre exportado | Dónde vive | Se importa de |
|---|---|---|
| `ProductView.presentationId?`, `.presentationName?`, `.presentationContent?`, `.presentationUnitId?` (todos `string \| null`, opcionales) | `lib/modules/inventario/domain/product-view.ts` | `@/lib/modules/inventario` |
| `PRODUCT_PRESENTATION_UNIT_FILTER = 'presentationUnitId'` (no está aún en `PRODUCT_QUERYABLE`: T4) | `lib/modules/inventario/domain/product-queryable.ts` | `@/lib/modules/inventario` |
| `ORDER_DISTRIBUTION_PACKAGING_FIELD = 'presentationLines.packagingProductId'` | `lib/modules/pedidos/domain/order-input.ts` | `@/lib/modules/pedidos` |
| `DistributionLineInput` = `{ packagingProductId: string; packages: number } \| PresentationLineInput` | `lib/modules/pedidos/domain/resolve-distribution.ts` | `@/lib/modules/pedidos` |
| `PresentationLineInput` (sin cambios, ahora también en el barrel) | `lib/modules/pedidos/domain/resolve-distribution.ts` | `@/lib/modules/pedidos` |
| `UpdateOrderDistributionInput` = `{ unitId; presentationLines: readonly DistributionLineInput[]; confirmBlocked?: boolean }` | `lib/modules/pedidos/domain/order-input.ts` | `@/lib/modules/pedidos` |
| `QuoteOrderCostInput` gana `presentationLines?: readonly DistributionLineInput[]` | `lib/modules/pedidos/domain/order-input.ts` | `@/lib/modules/pedidos` |
| `OrderPresentationAvailabilityNext` = `OrderPresentationAvailability \| { kind: 'packaging_not_found'; packagingProductId: string }` | `lib/modules/pedidos/domain/order-presentation-availability.ts` | `@/lib/modules/pedidos` |
| `OrderPresentationLineView.packagingProductId?`, `.packagingName?` (`string \| null`, opcionales) | `lib/modules/pedidos/domain/order-view.ts` | `@/lib/modules/pedidos` |

Notas para `frontend_dev` y para T4/T6/T8:

- **Opcionales ahora, obligatorios después.** `tasks.md > TC` los pide opcionales para no tocar
  comportamiento; §11.7 los escribe obligatorios (`string | null`). T6 los hará obligatorios en
  `OrderPresentationLineView` cuando `getOrder`/`listOrders` los rellenen. La UI debe tratar
  `undefined` igual que `null` (línea antigua).
- **Nombres.** `tasks.md` llama `DistributionLineInput` a lo que §11.3 escribe como la unión
  `PresentationLineInput`; se sigue a `tasks.md` (los dos conviven hasta T6). El nombre de la
  constante del filtro no lo fija el spec: se eligió `PRODUCT_PRESENTATION_UNIT_FILTER`.
- `UpdateOrderDistributionInput` y `QuoteOrderCostInput` se declaran ya con la forma del contrato,
  aunque los esquemas `zod` sigan siendo los de hoy (lo que el esquema produce sigue siendo
  asignable al tipo); T8 y T9 alinean el esquema.
- **No hecho aquí: `OrderDistributionLine`** (tipo de cliente de §11.7,
  `app/(private)/pedidos/components/use-order-distribution-availability.ts:20-28`). Está en la
  lista de TC, pero vive en `app/` y backend_dev no toca UI: lo añade `frontend_dev` en T13 con la
  forma de §11.7 (`packagingProductId`, `packagingName`, `available`).

### Tests de tipos

- `tests/unit/inventario/qc195-contrato-tipos.test.ts` — R8, R9, R10 (`ProductView`), R8, R9
  (constante del filtro).
- `tests/unit/pedidos/qc195-contrato-tipos.test.ts` — R11 (campo del envase), R11/R35
  (`DistributionLineInput`), R17/R37 (`UpdateOrderDistributionInput`), R11
  (`OrderPresentationAvailabilityNext`), R29 (`QuoteOrderCostInput`), R33
  (`OrderPresentationLineView`).
- `tests/unit/inventario/module-contract.test.ts` — guardia de QC-90 R31 reescrita (ver T0).

Salida real:

```
$ pnpm exec vitest run tests/unit/pedidos/qc195-contrato-tipos.test.ts tests/unit/inventario/qc195-contrato-tipos.test.ts tests/unit/inventario/module-contract.test.ts
 Test Files  3 passed (3)
      Tests  13 passed (13)
$ pnpm run typecheck
> tsc --noEmit
(sin errores)
```

## Gate

`./init.sh --rapido` tras el commit de TC (`a326a442`):

```
✓ base de desarrollo «QuimiCloude_QC195» al dia: 63 migracion(es) aplicada(s)
✓ typecheck paso
✓ lint paso            (0 errores, 8 avisos preexistentes en archivos ajenos)
[test:rapido] tests relacionados con 11 archivo(s) del diff vs origin/dev
 Test Files  6 failed | 369 passed (375)
      Tests  8 failed | 5568 passed | 7 skipped (5583)
✗ 'pnpm run test:rapido' fallo
```

Los 6 archivos rojos están **todos** en `tests/baseline-rojos.json` (deuda de `dev`, no de esta
rama): `configuracion-ui/unidades-viewport.test.tsx`, `configuracion-ui/usuarios-viewport.test.tsx`,
`navegacion/pantallas-exigen-permiso.test.tsx`, `inventario/product-page.test.tsx`,
`recetas-ui/recipe-page.test.tsx`, `recetas/module-contract.test.ts`. No son hallazgo. Salen en la
corrida porque TC toca los barrels de `inventario` y `pedidos`, y `vitest related` arrastra casi
toda la suite (375 archivos). El modo rápido no consulta el baseline (solo lo hace el completo), y
al fallar `related` no llega a correr las guardias, así que se corrieron aparte:

```
$ pnpm exec vitest run guard --passWithNoTests
 Test Files  51 passed (51)
      Tests  670 passed | 11 skipped (681)
```

La primera corrida de `./init.sh --rapido`, antes del commit (sin diff contra `origin/dev`), salió
**verde**: typecheck, lint y 51/51 guardias.

**Veredicto:** T0 y TC hechos; sin rojos nuevos (los únicos rojos están en el baseline); la
base `QuimiCloude_QC195` lista para T1.

## T1 — Migración y esquema (backend_dev, 2026-10-03) — commit `c4f21814`

Archivos:
- `db/migrations/20261003120000_packaging_products_in_distribution/{migration.sql,down.sql}` (nuevos).
- `db/schema.prisma`: `@@unique([companyId, id], map: "products_company_id_id_key")` en `Product`;
  `packagingProductId` + `@@index` en `OrderPresentationLine`.
- Tests nuevos: `tests/unit/inventario/schema/packaging-products-in-distribution-migration.test.ts`,
  `tests/integration/inventario/qc195-packaging-constraints.int.test.ts` (censo `transaccion` en
  `tests/integration/aislamiento.json`).
- Tests ajustados: `tests/guards/guard-identificador-de-request.test.ts` (la lista cerrada de
  migraciones gana la nueva, mismo patrón que las anteriores);
  `tests/unit/inventario/schema/inventario-schema.test.ts` («products.name no tiene @@unique»: el
  `@@unique` nuevo es `[companyId, id]`; el caso sigue prohibiendo cualquier `@@unique` sobre el nombre).

Decisiones de implementación (dentro del spec):
- Unidad `unidad`/`u` sembrada con `INSERT … WHERE NOT EXISTS` dentro del paréntesis
  `NO FORCE`/`FORCE` de `units` (RLS forzada sin policies, mismo patrón que
  `20260907190000`). Si ya existe una unidad de sistema `unidad` que deriva de otra, aborta.
  Una empresa con su propia «unidad» no choca: los índices de nombre/símbolo de empresa son
  parciales (`company_id IS NOT NULL`), los de sistema también (`company_id IS NULL`).
- `down.sql` borra la unidad solo si nada la referencia (`foreign_key_violation` capturada → se
  conserva con `NOTICE`), y al reponer el CHECK anterior **aborta** si hay un PACKAGING con
  presentación (intencional, §2.4).

R → test:
| R | Test |
|---|---|
| R5 | `qc195-packaging-constraints.int.test.ts` › «R5 — un PRODUCT o un MACHINE con presentacion propia se rechaza…», «R5 — un FINISHED_PRODUCT sin receta, o sin presentacion, se rechaza; un PACKAGING con receta tambien»; texto: `packaging-products-in-distribution-migration.test.ts` › «R5 — reescribe el CHECK con el mismo nombre…» |
| R1 (base) | `qc195-packaging-constraints.int.test.ts` › «R1/R5 — un PACKAGING con presentacion entra, y uno sin ella (envase anterior) tambien» |
| R11 (FK) | `qc195-packaging-constraints.int.test.ts` › «R11 — una linea del reparto con un envase de otra empresa se rechaza por la FK compuesta» |
| R14 (columna) | `packaging-products-in-distribution-migration.test.ts` › «R14 — la linea del reparto gana packaging_product_id anulable…» |
| R6 (unidad) | `qc195-packaging-constraints.int.test.ts` › «R6 — existe la unidad de sistema «unidad» (u), base y sin derivacion»; texto › «R6 — siembra la unidad de sistema…» |
| R32 | `qc195-packaging-constraints.int.test.ts` › «R32 — una linea guardada antes de la migracion queda intacta, sin envase y sin apartados»; texto › «R32 — no toca ninguna fila…» |

Salida real:
```
$ pnpm run db:migrate          (.env → QuimiCloude_QC195, grep = 2)
Applying migration `20261003120000_packaging_products_in_distribution`
All migrations have been successfully applied.
$ pnpm run db:test template
✓ plantilla de esta rama: qct_tpl_4bbbe29e9081 (64 migraciones)
$ pnpm exec vitest run tests/unit/inventario/schema/packaging-products-in-distribution-migration.test.ts
 Test Files  1 passed (1)      Tests  7 passed (7)
$ pnpm exec vitest run --project integration tests/integration/inventario/qc195-packaging-constraints.int.test.ts
 Test Files  1 passed (1)      Tests  6 passed (6)
$ pnpm exec vitest run --project integration (inventario-constraints, pedidos-constraints, company-scope x4,
  product-batch-lot, reservations-and-decimal-stock-migration, reserve-existing-orders-migration,
  order-packing-states-rollback, order-status-blocked-rollback, qc170-backfill, unidades/*)
 Test Files  16 passed (16)    Tests  223 passed (223)
$ pnpm exec vitest run tests/unit/inventario/schema tests/unit/pedidos/schema tests/unit/unidades guard
 Test Files  99 passed (99)    (tras ajustar los dos tests citados arriba)
```

Rollback sobre base desechable (`QuimiCloude_QC195_rb`, copia de `qct_tpl_4bbbe29e9081`, borrada al final;
script `pg` en el scratchpad de la sesión):
```
tras UP (plantilla): check nuevo, productsKey 1, column 1, fk 1, idx 1, unit 1, unitsForce true
tras DOWN:           check = CHECK ((type='FINISHED_PRODUCT') = (recipe_id IS NOT NULL AND presentation_id IS NOT NULL)) AND ((recipe_id IS NULL) = (presentation_id IS NULL)),
                     productsKey 0, column 0, fk 0, idx 0, unit 0, unitsForce true
tras UP de nuevo:    igual que el primer UP
bloque de unidad otra vez (idempotente): unit 1
DOWN con un PACKAGING con presentacion: aborta 23514 «products_finished_identity_matches_type»
base QuimiCloude_QC195_rb borrada
```

Gate `./init.sh --rapido` (antes del commit):
```
✓ typecheck paso
✓ lint paso
 Test Files  9 failed | 368 passed (377)
      Tests  8 failed | 5518 passed | 7 skipped (5533)
✗ 'pnpm run test:rapido' fallo
```
- 6 rojos en `tests/baseline-rojos.json` (los mismos de TC): `configuracion-ui/unidades-viewport`,
  `configuracion-ui/usuarios-viewport`, `navegacion/pantallas-exigen-permiso`,
  `inventario/product-page`, `recetas-ui/recipe-page`, `recetas/module-contract`.
- 3 rojos **del carril frontend, no de T1**: `pedidos-ui/order-sheet`, `pedidos-ui/pedidos-viewport`,
  `pedidos-ui/order-list-section` caen al cargar con «No "observabilidad" export is defined on the
  "@/lib/composition" mock». Causa: el cambio sin commitear de frontend_dev en
  `app/(private)/pedidos/components/index.ts` reexporta `PackagingSelect`, que importa
  `listProductsAction` (`product-actions.ts` → `@/lib/composition`), y los `vi.mock` de esos tres
  tests no lo cubren. No se tocó (carril ajeno); avisado en el informe.
- Guardias aparte: `pnpm exec vitest run guard --passWithNoTests` → `Test Files 51 passed (51)`,
  `Tests 670 passed | 11 skipped`.

## T5 — `consumeForOrder` por subconjunto (backend_dev, 2026-10-03) — commit `c3872bb8`

Archivos: `lib/modules/inventario/domain/reservation.ts` (`productIds?: readonly ProductId[]` en
`MaterialReservations.consumeForOrder`), `lib/modules/inventario/adapters/driven/persistence/reservation-prisma.ts`
(filtra lo apartado y el `fallbackRequirement` a esos productos; sin `productIds`, idéntico),
`tests/integration/inventario/reservation.int.test.ts` (tres casos nuevos; los existentes sin tocar).

R → test (`tests/integration/inventario/reservation.int.test.ts`, describe «QC-195 R25, R26 — consumeForOrder por subconjunto de productos»):
- R26 › «R26 — con productIds solo consume lo apartado de esos productos y deja intacto lo demas del pedido»
- R25 › «R25 — sin nada apartado de esos productos, el respaldo se filtra a productIds y no toca lo apartado de los demas»
- R25 › «R25 — con productIds y respaldo que no alcanza devuelve insufficient sin consumir lo de los demas»
(El R25/R26 de punta a punta, con Terminar y `POR_EMPACAR`, es T10.)

Salida real:
```
$ pnpm exec vitest run --project integration tests/integration/inventario/reservation.int.test.ts \
    tests/integration/pedidos/order-reservation.int.test.ts tests/integration/pedidos/order-packing.int.test.ts \
    tests/integration/pedidos/finish-with-finished-goods.int.test.ts
 Test Files  4 passed (4)      Tests  70 passed (70)
$ pnpm exec vitest related --run --project node <los dos archivos de lib>
 Test Files  62 passed (62)    Tests  1169 passed (1169)
```

Gate `./init.sh --rapido` tras el commit: **`✗ typecheck`** por un archivo del carril frontend sin
commitear, no de T5:
```
tests/unit/pedidos-ui/order-distribution-field.test.tsx(85,9): error TS2322: Type 'readonly string[] | undefined' is not assignable to type 'readonly string[]'.
```
Como el modo rápido se para en el typecheck, el resto se corrió aparte:
- `tsc --noEmit` sin errores fuera de `tests/unit/pedidos-ui/`.
- `eslint` de los tres archivos de T5: 0 errores.
- Guardias: `Test Files 1 failed | 50 passed (51)`. El rojo es
  `guard-identificador-de-request` › «las superficies que aplanan un ErrorState…» sobre
  `app/(private)/pedidos/components/order-distribution-dialog.tsx` (carril frontend, sin commitear).
  Avisado en el informe.

## T2 — El envase en inventario: alta, lote y ajuste (backend_dev, 2026-10-03) — commit `7226b1ed`

Archivos de producción:
- `lib/modules/unidades/domain/package-unit.ts` (nuevo): `PACKAGE_UNIT_NAME = 'unidad'` y el puerto
  `PackageUnitSource.findPackageUnitId()`; barrel de `unidades` lo exporta.
  `unit-catalog-prisma.ts` gana `findPackageUnitId` (unidad de sistema, base). Motivo: `units` es de
  `unidades`; `inventario` no puede leer esa tabla (`guard-arquitectura-modulos`), así que la unidad
  de envases le llega por puerto, cableado en `lib/composition` (`createCreateProduct({ …, packageUnit })`).
- `lib/modules/inventario/domain/product-input.ts`: alta PACKAGING exige existencia entera
  (`isWholeQuantity`, exportada para el adaptador). `presentationId` sigue llegando con el mismo nombre.
- `lib/modules/inventario/domain/create-product.ts`: rama `createPackaging`: busca homónimo con
  `findAlivePackagingByName` (solo PACKAGING vivos **con** presentación fija); misma presentación →
  `addBatchToAlive(…, { presentationId })` con lote sin presentación; otra → `ActionNotAllowedError`
  (R3/N10); sin homónimo → `createWithFirstBatch(…, { presentationId, unitId: u })`.
- `lib/modules/inventario/domain/product-view.ts`: tipo `PackagingIdentity` (al final del archivo:
  `NewProduct` sigue sin unidad, lo vigila `unidades/module-contract.test.ts`).
- `lib/modules/inventario/ports/product-repository.ts`: `findAlivePackagingByName` nuevo;
  `createWithFirstBatch` y `addBatchToAlive` ganan un parámetro opcional `packaging`.
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`:
  - `createWithFirstBatch` con `packaging`: valida la presentación en el ámbito de la empresa
    (`ValidationError` si no), escribe `products.presentation_id` y `unit_id = u`; el lote sin
    presentación (el disparador `product_batches_check_unit` sale por `IF NOT FOUND`).
  - `addBatchToAlive`: bajo el `FOR NO KEY UPDATE` del producto, si es un envase con presentación
    fija exige `packaging` con esa misma presentación, y sin `packaging` lo rechaza →
    `ActionNotAllowedError` (R2/R3; cierra también que una materia prima con presentación en `u`
    cuelgue un lote con presentación de un envase).
  - `adjustBatchStock`: envase con presentación fija y `delta` no entero → `ValidationError` (R7/N3).
    Los envases legados (sin presentación) siguen aceptando decimal.
  - Se lanzan errores de dominio desde el adaptador (como ya hacía con `ValidationError`) en vez de
    ampliar las uniones de resultado: no cambia la forma de ningún resultado existente.
- `lib/composition/index.ts`: cablea `findAlivePackagingByName` y `packageUnit`.

Tests: nuevos `tests/integration/inventario/qc195-packaging-product.int.test.ts` (censo `commit`, con
motivo); casos nuevos en `tests/unit/inventario/create-product.test.ts` y
`tests/unit/inventario/product-input.test.ts` (el caso PACKAGING reescrito contra R1, más R7 y R2).
Dobles de `ProductRepository` ampliados con `findAlivePackagingByName` en 8 archivos de test
(compilan contra el puerto entero).

R → test:
| R | Test |
|---|---|
| R1 | `qc195-packaging-product.int.test.ts` › «R1, R6 — el alta guarda la presentacion en el producto…», «R1 — el alta de un envase sin presentacion, o con una de otra empresa, se rechaza sin escribir nada»; `create-product.test.ts` › «R1, R6 — nace con su presentacion fija…», «R1 — sin presentacion se rechaza con invalid_input sin tocar el puerto»; `product-input.test.ts` › «R1 — PACKAGING exige su presentacion fija y rechaza expiryDate» |
| R2 | `qc195-packaging-product.int.test.ts` › «R2, R3 — un lote sobre un envase homonimo con otra presentacion se rechaza…», «R2 — bajo el bloqueo, el adaptador rechaza un lote con otra presentacion o con presentacion propia sobre un envase»; `product-input.test.ts` › «R2 — la edicion de un PACKAGING no acepta presentacion»; `create-product.test.ts` › «R2, R3 — con un envase homonimo en OTRA presentacion…» |
| R3 | `qc195-packaging-product.int.test.ts` › «R3 — un lote sobre un envase homonimo entra en su presentacion fija, sin presentacion propia»; `create-product.test.ts` › «R3 — con un envase homonimo en la misma presentacion, anade el lote sin presentacion propia» |
| R4 | `qc195-packaging-product.int.test.ts` › «R4 — dos envases con presentaciones distintas son productos distintos…» |
| R6 | `qc195-packaging-product.int.test.ts` › «R1, R6 — …existencia en «u»…»; `create-product.test.ts` › «R6 — sin la unidad de envases sembrada, el alta falla sin escribir» |
| R7 | `qc195-packaging-product.int.test.ts` › «R7 — la existencia del alta y el ajuste de un envase son enteros…»; `product-input.test.ts` › «R7 — la existencia del alta de un PACKAGING es un numero entero de envases»; `create-product.test.ts` › «R7 — una existencia no entera se rechaza…» |

Salida real:
```
$ pnpm exec vitest run --project integration tests/integration/inventario/qc195-packaging-product.int.test.ts
 Test Files  1 passed (1)      Tests  7 passed (7)
$ pnpm exec vitest run --project integration tests/integration/inventario tests/integration/unidades
 Test Files  34 passed (34)    Tests  337 passed (337)
$ pnpm exec vitest run --project node tests/unit/inventario
 Test Files  63 passed (63)    Tests  936 passed | 5 skipped (941)
$ pnpm exec vitest related --run --project node <8 archivos de lib de T2>
 Test Files  1 failed | 152 passed (153)   Tests  1 failed | 2760 passed | 8 skipped
   (el rojo: tests/unit/recetas/module-contract.test.ts, en tests/baseline-rojos.json)
$ pnpm exec vitest run guard --passWithNoTests
 Test Files  51 passed (51)    Tests  671 passed | 11 skipped (682)
$ eslint (lib/modules/inventario, lib/modules/unidades, composition, tests tocados): 0 errores, 0 avisos
```

Gate `./init.sh --rapido`: **`✗ typecheck`**, solo por el carril frontend sin commitear:
`tests/unit/inventario-ui/envase-en-inventario.test.tsx` (3 errores TS2322 contra
`ProductBatchesPanelProps`/`AdjustBatchDialogProps`). `tsc --noEmit` sin errores fuera de
`tests/unit/inventario-ui/` y `tests/unit/pedidos-ui/`. Lo demás, corrido aparte arriba.

## T12 — Selector de envases (frontend_dev, 2026-10-03) — commit `7eb0553f`

Archivos: `app/(private)/pedidos/components/packaging-select.tsx` (nuevo), `components/index.ts`
(barrel), `tests/unit/pedidos-ui/packaging-select.test.tsx` (nuevo); dobles de
`product-actions` añadidos a `order-list-section`, `order-sheet` y `pedidos-viewport` (su barrel
ahora importa el selector, que arrastraria `@/lib/composition`).

| R | Test (`tests/unit/pedidos-ui/packaging-select.test.tsx`) |
|---|---|
| R8 | «R8: pide solo envases con presentacion en las unidades compatibles con la del pedido», «R8: la busqueda viaja al servidor con los mismos filtros», «R8: escribir algo distinto de lo elegido retira la eleccion» |
| R10 | «R10: cada opcion muestra nombre, presentacion y disponible en envases», «R10: el envase con disponible cero tambien se ofrece y se puede elegir» |
| R38 | «R38: sin permiso de consultar inventario avisa y no lista ningun envase», «R38: un rechazo distinto del permiso no se pinta como falta de permiso», «R38: si la accion no responde se pinta el inesperado con su referencia…» (este ultimo, añadido en T13) |

Salida real: `vitest run packaging-select.test.tsx` → `Tests 7 passed (7)`; tras T13, 8/8.
Gate `./init.sh --rapido`: typecheck ✓, lint ✓, `test:rapido` `Test Files 9 failed | 368 passed`:
6 en `tests/baseline-rojos.json` (`recetas/module-contract`, `configuracion-ui/unidades-viewport`,
`configuracion-ui/usuarios-viewport`, `navegacion/pantallas-exigen-permiso`,
`inventario/product-page`, `recetas-ui/recipe-page`) y 3 mios (`order-list-section`, `order-sheet`,
`pedidos-viewport`: faltaba el doble de `product-actions`), arreglados antes del commit:
`Test Files 4 passed (4) Tests 70 passed (70)`. Guardias aparte: `51 passed (51)`.

## T13 — Formulario y «Reparto y unidad» en envases (frontend_dev, 2026-10-03) — commit `1fa8dc58`

Archivos: `order-distribution-field.tsx`, `order-distribution-dialog.tsx`, `order-form.tsx`,
`use-order-distribution-availability.ts` (gana `packagingProductId`/`packagingName`/`available`
opcionales en `OrderDistributionLine`, `isLegacyLine`, `lineKey`, `distributionLinesValid`,
`toDistributionLinesInput`), `use-order-cost-quote.ts` (`onDistributionChange`),
`packaging-select.tsx` (conserva el `ErrorState` entero), barrel; tests de `pedidos-ui`
`order-distribution-field`, `order-distribution-dialog`, `order-form`, `order-form-quote`.
`use-saved-line-contents.ts` no cambia: una linea guardada con envase trae `presentationId` y
`presentationName`, y resuelve su contenido igual que una antigua.

Decisiones de interfaz (no cambian el contrato):
- La linea antigua se pinta marcada («Anterior a los envases») y sus envases son de solo lectura:
  R34 rechaza una antigua cambiada, asi que la UI solo permite conservarla (R35) o quitarla.
- **Validacion previa del reparto en cliente, provisional.** `createOrderSchema`,
  `orderPresentationAvailabilitySchema` y `quoteOrderCostSchema` siguen con la linea de hoy
  (`presentationId` obligatorio) hasta T6/T8/T9. Para no depender de eso, el formulario valida con
  el esquema el resto de campos (`presentationLines: []`) y el reparto con
  `distributionLinesValid` (envases enteros > 0, sin envase ni presentacion repetidos); el hook
  del disponible valida `quantity`/`unitId` con `orderPresentationAvailabilitySchema.pick`. Cuando
  T6 publique el esquema con la union, conviene volver a validar el reparto con el esquema (T17).
- La cotizacion solo envia `presentationLines` con lineas de envase (las antiguas no cuestan,
  §11.6) y solo si hay alguna; con envases no validos no cotiza (guion).

| R | Test |
|---|---|
| R29 (UI) | `order-form-quote.test.tsx` › «R29: cambiar los envases de una linea vuelve a cotizar con el reparto en envases», «R29: anadir un envase en el alta vuelve a cotizar con esa linea», «R29: cambiar la cantidad cotiza con el reparto vigente», «R29: las lineas antiguas no viajan a la cotizacion porque no tienen envase», «R29: con envases no validos en el reparto no cotiza y muestra el guion» |
| R36 | `order-distribution-field.test.tsx` › «R36: el titulo dice que el reparto es en envases», «R36: el envase elegido se anade como linea con su nombre, su presentacion y sus envases», «R36: la linea muestra lo que cubre en la unidad del pedido, convirtiendo ml a L»; `order-form.test.tsx` › «R36: el selector del reparto es de envases…», «R36: las lineas anadidas viajan en el alta con el envase, la presentacion vacia y los envases», «R36: la edicion precarga unidad y reparto en envases, y permite cambiar los envases» |
| R37 | `order-distribution-dialog.test.tsx` › «R37: el aviso order_would_block muestra la misma confirmacion que el formulario del pedido», «R17/R37: confirmar reenvia el mismo reparto con confirmBlocked y cierra al guardar», «R37: sin confirmar no se reenvia nada y el dialogo sigue abierto» |
| R17 (UI) | `order-distribution-dialog.test.tsx` › «R17/R37: confirmar reenvia…»; `order-form.test.tsx` › «R8: en la edicion, «Guardar bloqueado» reenvia al mismo pedido…» (ahora comprueba tambien el campo del envase en el reenvio) |
| R18 (UI) | `order-distribution-dialog.test.tsx` › «R18: insufficient_material se pinta como error y el dialogo no pide confirmar» |
| R35 (UI) | `order-distribution-field.test.tsx` › «R35: la linea antigua se pinta con su presentacion, marcada…», «R35: sus envases no se pueden cambiar, solo quitar la linea», «R35: el disponible se pide con la linea antigua por su presentacion»; `order-form.test.tsx` › «R35: una linea antigua se reenvia sin cambios por su presentacion y sin envase»; `order-distribution-dialog.test.tsx` › «R35: una linea antigua se reenvia tal cual, por su presentacion» |
| R8, R10, R12, R38 (UI del campo) | `order-distribution-field.test.tsx` › «R8: el selector solo pide envases…», «R10: un envase con disponible cero tambien se puede anadir al reparto», «R12: el mismo envase dos veces no se puede anadir», «R12: otro envase con la misma presentacion que una linea no se puede anadir», «R38: sin permiso de consultar inventario avisa, no lista envases y conserva las lineas» |
| R11 (UI) | `order-distribution-field.test.tsx` › «R11: el envase que ya no vuelve del catalogo marca su linea y avisa»; `order-form.test.tsx` › «R11: el rechazo product_not_found del envase se pinta junto al reparto» |

Salida real:
```
$ pnpm exec vitest run tests/unit/pedidos-ui tests/unit/shared-ui
 Test Files  40 passed (40)      Tests  603 passed | 3 skipped (606)
$ pnpm exec vitest run tests/unit/pedidos-ui   (tras el ajuste de packaging-select)
 Test Files  37 passed (37)      Tests  569 passed | 3 skipped (572)
$ pnpm exec vitest run guard --passWithNoTests
 Test Files  51 passed (51)      Tests  671 passed | 11 skipped (682)
$ eslint app/(private)/pedidos/components tests/unit/pedidos-ui   → 0 problemas
```
Gate `./init.sh --rapido`: typecheck ✓, lint ✓, `test:rapido` `Test Files 6 failed | 374 passed
(380)`; los 6 son los de `tests/baseline-rojos.json` listados en T12. Guardias aparte arriba (la
primera corrida de guardias de backend_dev vio `guard-identificador-de-request` rojo sobre una
version intermedia del dialogo, que aplanaba el aviso a `string`; la final guarda mensaje y
borrador juntos y ademas `guard-catalogo-de-errores` pide no traducir con `instanceof`: ambas
verdes).

## T3 — `PackagingCatalog` (backend_dev, 2026-10-03) — commit `5c38bbb3`

Archivos: `lib/modules/inventario/domain/packaging-catalog.ts` (nuevo: `PackagingRef`,
`PackagingCostingBatch`, `PackagingCatalog` con la firma de §3.1), barrel de `inventario` (solo
tipos), `lib/modules/inventario/adapters/driven/persistence/packaging-catalog-prisma.ts` (nuevo:
`findPackagingRefs`, `findPackagingCostingBatches`), `lib/composition/index.ts`
(`export const packagingCatalog: PackagingCatalog`; exportado porque aún no lo consume ningún caso
de uso —lo hará T6 en `pedidos`— y una constante sin uso la marcaría el lint),
`tests/integration/inventario/qc195-packaging-catalog.int.test.ts` (censo `commit`, con motivo).

Notas: tipo vía `PRODUCT_TYPES.PACKAGING`, ámbito con `productCompanyScope`/
`presentationCompanyScope`/`batchCompanyScope`, disponible con `findReservedAndAvailableByBatch`
(el mismo agregado de siempre). `findCostingBatches` filtra lotes con `stock > 0`, `unit_cost` no
nulo y disponible (tras `excludeOrderId`) > 0.

R → test (`tests/integration/inventario/qc195-packaging-catalog.int.test.ts`):
- R11 › «R11 — findRefs solo devuelve envases vivos, de la empresa y con presentacion fija» (fuera: legado sin presentación, materia prima, borrado, de otra empresa, inexistente)
- R10, R30 › «R10, R30 — el disponible es en envases, descuenta lo apartado y con excludeOrderId cuenta lo del propio pedido»
- R10 › «R10 — un envase con disponible cero tambien vuelve»
- R27, R30 › «R27, R30 — findCostingBatches devuelve costo y disponible por lote, sin los lotes sin disponible»
- R11 › «R11 — findCostingBatches ignora lo que no es un envase con presentacion fija de la empresa»

Salida real:
```
$ pnpm exec vitest run --project integration tests/integration/inventario/qc195-packaging-catalog.int.test.ts
 Test Files  1 passed (1)      Tests  5 passed (5)
$ pnpm exec vitest run guard --passWithNoTests     (incluye guard-tipos-de-producto, guard-arquitectura-modulos, guard-ambito-empresa-inventario)
 Test Files  51 passed (51)    Tests  672 passed | 11 skipped (683)
```
(Un primer intento con un envase de existencia 0 cayó por `inventory_movements_quantity_not_zero`:
el alta con existencia 0 ya se rechaza hoy para cualquier producto; el caso se reescribió apartando
todo el lote.)

Gate `./init.sh --rapido` tras el commit:
```
✓ typecheck paso
✓ lint paso
 Test Files  6 failed | 392 passed (398)
      Tests  8 failed | 5890 passed | 9 skipped (5907)
✗ 'pnpm run test:rapido' fallo
```
Los 6 rojos, todos en `tests/baseline-rojos.json`: `recetas/module-contract`,
`configuracion-ui/unidades-viewport`, `configuracion-ui/usuarios-viewport`, `inventario/product-page`,
`navegacion/pantallas-exigen-permiso`, `recetas-ui/recipe-page`. Guardias corridas aparte (arriba): verdes.

## T14 — El envase en la interfaz de inventario (frontend_dev, 2026-10-03) — commit `98bb74fd`

Archivos: `app/(private)/inventario/components/product-form.tsx` (alta de Envase: nota de
presentacion fija, «Existencia (envases)» con teclado numerico y entero obligatorio; edicion:
presentacion de solo lectura o marca «Envase sin presentación fija»), `product-batches-panel.tsx`
(prop `product`: un lote sin unidad propia se cuenta en la del producto, cabecera con la
presentacion del envase o la marca del legado), `product-table.tsx` (pasa `product` y
`wholePackages`), `adjust-batch-dialog.tsx` (`wholePackages`: delta entero), `product-field.tsx`
(`inputMode` admite `numeric`); test nuevo `tests/unit/inventario-ui/envase-en-inventario.test.tsx`
(los tests de UI de inventario viven en `tests/unit/inventario/`, carril de backend: no se tocaron).

La validacion de entero en cliente (alta y ajuste) es la misma regla que T2 pone en el esquema;
se escribe aparte para señalar el campo sin depender de que el esquema del cliente ya la tenga.

| R | Test (`tests/unit/inventario-ui/envase-en-inventario.test.tsx`) |
|---|---|
| R1 | «R1: la presentacion del envase se pide como fija del producto», «R1: sin presentacion el alta del envase no llega a la operacion», «R1, R7: con presentacion y envases enteros el alta viaja con la presentacion y la existencia», «R1: la presentacion fija se muestra y no se puede cambiar», «R1: el envase legado sin presentacion fija lleva su marca» |
| R6 | «R6: la existencia del envase se pide en envases», «R6: un lote de envase se pinta en u, con la presentacion del producto», «R6: el lote de un envase legado conserva la unidad de su presentacion y la marca» |
| R7 | «R7: una existencia de envases no entera se rechaza junto al campo sin llamar a la operacion», «R7: la existencia decimal sigue valiendo para un producto que no es envase», «R7: el ajuste de un lote de envase no acepta envases no enteros» |

Salida real:
```
$ pnpm exec vitest run tests/unit/inventario-ui
 Test Files  1 passed (1)      Tests  11 passed (11)
$ pnpm exec vitest related --run <5 componentes de inventario>
 Test Files  2 failed | 9 passed (11)   Tests  2 failed | 211 passed (213)
   (rojos: inventario/product-page R18 y navegacion/pantallas-exigen-permiso, ambos en el baseline)
$ eslint app/(private)/inventario/components tests/unit/inventario-ui
 0 errores, 1 aviso preexistente (product-columns.tsx, no tocado)
```
Gate `./init.sh --rapido`: typecheck ✓, lint ✓, `test:rapido` `Test Files 6 failed | 393 passed
(399)`, los 6 del baseline. Guardias aparte: `Test Files 51 passed (51) Tests 672 passed`.

## T15 — Lecturas con lineas antiguas y con envase (frontend_dev, 2026-10-03)

Archivos: `app/(private)/pedidos/components/order-columns.tsx` (la columna del reparto nombra la
linea por `packagingName` y, si es `null`/ausente, por la presentacion como hoy; el componente
compartido `OrderDistributionLabel` no cambia), `tests/unit/pedidos-ui/order-columns.test.tsx`,
`tests/unit/asignaciones-ui/qc195-lineas-antiguas.test.tsx` (nuevo).

- **Ficha** (el panel del pedido): la pinta `OrderDistributionField`, hecho en T13.
- **Empaque y ejecucion**: leen `AssignedOrderPresentationLine`/`OrderDistributionLineView` de
  `asignaciones`, que no traen `packagingName` (`design.md > 5` y `> 11.7`: «las vistas de
  `asignaciones` no cambian»). Siguen pintando la presentacion de cada linea, que es R33 para las
  antiguas; para pintar el envase en esas dos pantallas haria falta ampliar esas vistas en `lib/`
  (fuera de este carril). Pregunta abierta en el informe.

| R | Test |
|---|---|
| R33 (UI) | `order-columns.test.tsx` › «R33: una linea con envase se pinta con el nombre del envase», «R33: una linea antigua se sigue pintando con el nombre de su presentacion», «R33: un envase cuyo nombre no vuelve del catalogo se pinta con su presentacion»; `asignaciones-ui/qc195-lineas-antiguas.test.tsx` › «R33: la linea antigua se pinta con sus envases y el nombre de su presentacion»; ficha: `order-distribution-field.test.tsx` › «R35: la linea antigua se pinta con su presentacion, marcada como anterior a los envases» y «R33: la linea antigua resuelve su contenido en el catalogo y luego muestra lo que cubre» |

Salida real:
```
$ pnpm exec vitest run tests/unit/pedidos-ui/order-columns.test.tsx tests/unit/asignaciones-ui/qc195-lineas-antiguas.test.tsx
 Test Files  2 passed (2)      Tests  44 passed (44)
```
Gate `./init.sh --rapido`: typecheck ✓, lint ✓, `test:rapido` `Test Files 6 failed | 394 passed
(400)`, los 6 del baseline. Guardias aparte: verdes (51/51).

## T4 — Listado de productos para el selector (backend_dev, 2026-10-03) — commit `8002ad3f`

Archivos: `lib/modules/inventario/domain/product-queryable.ts` (`PRODUCT_QUERYABLE.filterable` gana
`[PRODUCT_PRESENTATION_UNIT_FILTER]: 'select'`, es decir `presentationUnitId`; la constante se movió
encima de la lista), `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`:
- `listAliveProducts` resuelve primero las presentaciones de la empresa **con contenido** cuya unidad
  está en los valores del filtro y lo traduce a `presentationId IN (…)`: `Product` no tiene relación
  Prisma con `Presentation`, así que no cabe un `where` anidado. Un producto sin presentación fija
  nunca coincide (R9). `buildProductWhere` gana un tercer parámetro opcional con esas presentaciones;
  sin él, el filtro no deja pasar nada (los dos llamantes de test siguen igual).
- Rellena `presentationId`, `presentationName`, `presentationContent` (4 decimales) y
  `presentationUnitId` en cada `ProductView` del listado (una consulta más por página, no por fila);
  `null` en los cuatro si el producto no tiene presentación fija. (Un producto terminado también los
  trae: su `presentation_id` es su presentación.)
- No hay índice nuevo: `list-query-indexes.int.test.ts` no exige índice por filtro y sigue verde;
  el filtro va por `products.presentation_id` (cubierto por la FK compuesta) tras resolver las
  presentaciones por `presentations_unit_id_idx`.

Tests: `tests/integration/inventario/qc195-packaging-list.int.test.ts` (nuevo, censo `commit`),
casos nuevos en `tests/unit/inventario/list-use-cases.test.ts`, `product-prisma.test.ts`,
`list-query.test.ts` (la lista blanca exacta de filtros se amplía con `presentationUnitId`, §8).

R → test:
| R | Test |
|---|---|
| R8 | `qc195-packaging-list.int.test.ts` › «R8, R9, R10 — con type=PACKAGING y presentationUnitId={ml, l} salen solo los envases en ml/l con contenido…» (no salen kg, g, sin contenido); `list-use-cases.test.ts` › «R8 — con inventario.consultar, el filtro presentationUnitId llega al puerto sin descartarse»; `product-prisma.test.ts` › «R8 — se traduce a las presentaciones ya resueltas…»; `list-query.test.ts` › «QC-195 R8, R9 — el listado de productos acepta el filtro presentationUnitId como select» |
| R9 | mismo caso de integración (no salen el envase legado ni la materia prima; el legado sale con los cuatro campos a `null` sin el filtro); `product-prisma.test.ts` › «R9 — sin presentaciones resueltas no deja pasar ningun producto…» |
| R10 | mismo caso de integración (`available` 120 tras apartar 30 de 150; el envase agotado sale con `0.0000`) |
| R38 (servidor) | `list-use-cases.test.ts` › «R38 — con pedidos.modificar y sin inventario.consultar responde unauthorized sin tocar el puerto» |

Salida real:
```
$ pnpm exec vitest run --project integration tests/integration/inventario/qc195-packaging-list.int.test.ts \
    tests/integration/inventario/list-query-products.int.test.ts tests/integration/inventario/list-query-indexes.int.test.ts
 Test Files  3 passed (3)      Tests  37 passed (37)
$ pnpm exec vitest run --project node <list-query, list-use-cases, product-service, product-list-params,
    shared/listas-blancas-listados, guard-contrato-listados, product-prisma, module-contract, qc195-contrato-tipos>
 Test Files  9 passed (9)      (tras ampliar list-query.test.ts)
$ pnpm exec vitest run guard --passWithNoTests
 Test Files  51 passed (51)    Tests  672 passed | 11 skipped (683)
```

Gate `./init.sh --rapido` tras el commit:
```
✓ typecheck paso
✓ lint paso
 Test Files  6 failed | 394 passed (400)
      Tests  8 failed | 5900 passed | 9 skipped (5917)
✗ 'pnpm run test:rapido' fallo
```
Los 6 rojos son los de `tests/baseline-rojos.json` (los mismos de T3). Guardias aparte: verdes.

## T11 — El envase no es ingrediente (backend_dev, 2026-10-03) — commit `2a43b5c7`

Archivos: `lib/modules/inventario/domain/product-type.ts` (`isIngredientType(type)`: ni
FINISHED_PRODUCT ni PACKAGING; exportada por el barrel), y las seis llamadas de §3.5:
`recetas/domain/create-recipe.ts`, `update-recipe.ts`, `update-recipe-version.ts`,
`create-recipe-version.ts`, `documentos/domain/preview-formula-import.ts` (los candidatos excluyen
envases), `confirm-formula-import.ts` (rechaza el envase elegido y no lo reutiliza como materia prima
nueva homónima). Mismo error que el producto terminado: `ActionNotAllowedError` → `action_not_allowed`.

P4 = A, cómo quedó en código:
- Edición de receta y de versión: como ya hacían, solo se validan las líneas que no tenían → un envase
  que ya era ingrediente se conserva.
- **Alta de versión**: el producto terminado se sigue rechazando en cualquier línea (sin cambio); el
  envase solo se rechaza si **no estaba en la original**. Motivo: el formulario de versión
  (`app/(private)/produccion/formulas/components/recipe-version-form.tsx:77`) precarga las líneas de
  la original y **siempre las envía** en `lines`, así que leer «líneas indicadas en la entrada» al pie
  de la letra haría imposible versionar una original con un envase desde la pantalla, que es justo lo
  que A descarta («una original con un envase dejaría de poder versionarse»). Las copiadas pasan «con
  la misma exención que la edición» = las que la original ya tenía. **Para confirmar por el reviewer /
  humano** (ver informe).
- `requirements.md` no tiene un requisito escrito para P4 (la decisión está en `design.md > 1.5`);
  los tests llevan `P4` en el nombre del caso.

R → test:
| R | Test |
|---|---|
| R39 | `tests/unit/recetas/qc195-envase-no-es-ingrediente.test.ts` › «R39 — el alta de una receta con un envase como ingrediente se rechaza con action_not_allowed sin escribir», «R39 — el alta de una version con un envase que la original no tenia se rechaza sin escribir», «R39 — PRODUCT y MACHINE siguen entrando como ingrediente en el alta» |
| R40 | mismo archivo › «R40 — editar una receta anadiendo un envase que no tenia se rechaza sin modificarla», «R40 — editar una version anadiendo un envase que no tenia se rechaza sin modificarla» |
| R41 | `tests/unit/documentos/preview-formula-import.test.ts` › «QC-195 R41 — un envase como UNICO homonimo: match "none", nunca se propone», «QC-195 R41 — un envase y una materia prima homonimos: se propone solo la materia prima»; `tests/unit/documentos/confirm-formula-import.test.ts` › «QC-195 R41 — el producto elegido es un ENVASE: action_not_allowed, cero escrituras», «QC-195 R41 — una materia prima nueva cuyo unico homonimo es un envase no lo reutiliza: crea la suya» |
| P4 | `qc195-envase-no-es-ingrediente.test.ts` › «P4 — una version que copia las lineas de una original con un envase se crea», «P4 — una version que repite el envase que ya tenia la original (como lo envia el formulario) se crea», «P4 — editar una receta que ya tenia un envase como ingrediente lo conserva y se guarda», «P4 — editar una version que ya tenia un envase lo conserva y se guarda» |
| — | mismo archivo › «isIngredientType: solo PRODUCT y MACHINE son ingredientes» |

Los casos de FINISHED_PRODUCT existentes no se tocaron y siguen verdes.

Salida real:
```
$ pnpm exec vitest run --project node tests/unit/recetas/qc195-envase-no-es-ingrediente.test.ts \
    tests/unit/documentos/confirm-formula-import.test.ts tests/unit/documentos/preview-formula-import.test.ts \
    tests/unit/recetas/create-recipe-version.test.ts tests/unit/recetas/update-recipe-version.test.ts tests/unit/recetas/recipe-service.test.ts
 Test Files  6 passed (6)      Tests  108 passed (108)
$ pnpm exec vitest run --project integration tests/integration/recetas tests/integration/documentos/formula-import.int.test.ts
 Test Files  11 passed (11)    Tests  139 passed (139)
$ pnpm exec vitest run guard --passWithNoTests      (incluye guard-tipos-de-producto)
 Test Files  51 passed (51)    Tests  672 passed | 11 skipped (683)
$ pnpm exec vitest related --run --project node <los 7 archivos de lib de T11>
 Test Files  1 failed | 142 passed (143)   Tests  1 failed | 2657 passed | 6 skipped
   (el rojo: tests/unit/recetas/module-contract.test.ts, en el baseline)
$ pnpm exec vitest run --project node tests/unit/recetas tests/unit/documentos
 Test Files  2 failed | 111 passed (113)  (recetas/module-contract y recetas/scope, los dos en el baseline;
   scope cae por app/(private)/pedidos/page.tsx, fuera de este carril)
```

Gate `./init.sh --rapido`: `✓ typecheck`, `✓ lint`; la fase de tests **no terminó**: el proceso en
segundo plano se cortó dos veces por el límite de tiempo de la herramienta, con la máquina cargada
(`inventario/product-page.test.tsx` solo tardó 242 s y dio un rojo de tiempo de 20 s, además del de
baseline). Lo que llegó a salir antes del corte son los mismos archivos del baseline. Sustituido por
las corridas `related`/guardias de arriba. **El implementer debería repetir `./init.sh --rapido` con la
máquina libre.**

## Implementer — gate de la tanda 1 (TC + T1-T5 + T11 + T12-T15), punta 4b18eec9

`./init.sh --rapido` con la maquina libre (sin subagentes corriendo):
- typecheck paso; lint paso.
- `test:rapido` (related, 401 archivos): `Test Files 6 failed | 395 passed (401)`, `Tests 8 failed | 5914 passed | 9 skipped (5931)`.
  Los 6 rojos estan todos en `tests/baseline-rojos.json`: `configuracion-ui/unidades-viewport`,
  `configuracion-ui/usuarios-viewport`, `inventario/product-page`, `navegacion/pantallas-exigen-permiso`,
  `recetas-ui/recipe-page`, `recetas/module-contract`. El modo rapido no consulta el baseline.
- Como el related fallo, el script no lanzo las guardias; corridas aparte (`vitest run guard`):
  `Test Files 51 passed (51)`, `Tests 672 passed | 11 skipped (683)`.

Tasks marcadas [x]: T0, TC, T1-T5, T12-T14. Abiertas con pregunta al leader: T11 (lectura de P4 en
versiones) y T15 (packagingName en pantallas de empaque/ejecucion de `asignaciones`).

## T6 — Necesidad, resolucion del reparto y vistas (backend_dev, 2026-10-03)

Archivos de produccion:
- `lib/modules/pedidos/domain/order-requirement.ts`: `buildOrderRequirement({ recipeLines, quantity,
  packagingLines, phase })` (`before_consumption` = receta + envases; `materials_consumed` = solo
  envases), suma por producto exacta (sin recortar a 4 decimales); `packagingLinesOf(lines)`;
  `buildRequirement` se conserva y la usa por dentro.
- `lib/modules/pedidos/domain/resolve-distribution.ts`: una sola resolucion para los cuatro
  llamadores, `resolveDistributionLines(catalogs, companyId, unitId, lines, { savedLines? })`, que no
  lanza (`resolved | unit_not_found | presentation_not_found | packaging_not_found | invalid_lines`).
  Linea con envase -> copia la presentacion fija y su contenido (`PackagingCatalog.findRefs`); linea
  antigua -> solo si llega igual que una guardada sin envase (con `savedLines`; el disponible no
  las compara); dos lineas con la misma presentacion -> `invalid_lines` (R12). Una sola llamada a
  `UnitCatalog.findRefs`. `resolveDistribution` (alta/edicion) lanza: `ProductNotFoundError`
  (`product_not_found`, clase nueva en `pedidos`, codigo existente) y `ValidationError` para
  `invalid_lines`, y devuelve `{ lines, packagingLines }`.
- `order-presentation-availability.ts` y `update-order-presentation-lines.ts`: sobre la resolucion
  compartida. El disponible devuelve `OrderPresentationAvailabilityNext` (con `packaging_not_found`);
  `invalid_lines` alli es `invalid_input`. «Reparto y unidad» gana `packaging_not_found` e
  `invalid_lines` en su resultado (la accion los traduce a `product_not_found` / `invalid_input`).
  Sigue en `OrderDistributionTransaction`: el cambio a la unidad de trabajo es T8.
- `order-input.ts`: `distributionLineSchema` (exportado) = un objeto con `packagingProductId?` y
  `presentationId?` (UUID), uno y solo uno, `packages` entero positivo, transformado a
  `DistributionLineInput`; `presentationLinesSchema` es ahora el array de la union (rechaza el mismo
  envase o la misma presentacion antigua repetidos). `createOrderSchema`, `updateOrderSchema`,
  `orderPresentationAvailabilitySchema` y `updateOrderDistributionSchema` heredan la union.
  `quoteOrderCostSchema` no cambia aqui (T9).
- `order-view.ts`: `OrderPresentationLineWrite.packagingProductId` y
  `OrderPresentationLineRow.packagingProductId` obligatorios (`string | null`).
  `OrderPresentationLineView.packagingProductId`/`packagingName` **siguen opcionales** en el tipo
  (ver «Lo que la UI tiene que cambiar»), aunque `getOrder`/`listOrders` los rellenan siempre.
- `get-order.ts`/`list-orders.ts`: `orderPackagingIds`, `findPackagingNames` (una llamada a
  `PackagingCatalog.findRefs` por ficha o por pagina, solo si hay envases); `toOrderView` gana el
  mapa de nombres de envase. Un envase que ya no vuelve (baja) conserva el id y `packagingName: null`.
- `order-prisma.ts`: lee y escribe `packaging_product_id` en `order_presentation_lines`.
- `order-actions.ts`: `readPresentationLines` lee las tres listas (`ORDER_DISTRIBUTION_PACKAGING_FIELD`
  incluido) y convierte la cadena vacia en ausencia; `OrderPresentationAvailabilityResult` lleva
  `OrderPresentationAvailabilityNext`.
- `create-order.ts`/`update-order.ts`: deps ganan `packaging`; el alta resuelve con `savedLines: []`
  (una linea antigua en un alta es R34), la edicion con las lineas de la fila bloqueada. La
  necesidad con envases es T7.
- `lib/composition/index.ts`: `packagingCatalog` deja de exportarse (ya lo consumen los casos de uso)
  y se cablea en alta, edicion, ficha, listado, «Reparto y unidad» y disponible.
- `order-distribution.ts` no se toco.

Tests: helpers nuevos `tests/helpers/packaging-catalog-double.ts` (doble de `PackagingCatalog`) y
`tests/helpers/packaging-seed.ts` (siembra/borrado de un envase real para integracion). Los dobles
de dependencias de ~25 archivos ganan `packaging`. Reescritos contra los requisitos nuevos (no para
que pasen): los casos QC-170 de reparto de `create-order.test.ts`, `update-order.test.ts`,
`update-order-presentation-lines.test.ts`, `company-isolation-service.test.ts` («presentacion de otra
empresa» pasa a «envase de otra empresa» -> `product_not_found`), y en integracion
`order-content-copy`, `finish-with-finished-goods`, `qc170-distribution-company-scope`,
`qc170-distribution-concurrency` (siembran envases y reparten por envase; las aserciones sobre
`presentation_id` y el contenido copiado siguen igual). `order-presentation-availability.test.ts`
(«dos lineas: una sola llamada a units.findRefs») pasa de esperar 2 llamadas a 1, que es lo que
dice su nombre.

R -> test:
| R | Test |
|---|---|
| R11 | `resolve-distribution.test.ts` › «R11: un envase que no vuelve del catalogo (…) -> ProductNotFoundError», «R11: un envase cuya presentacion no comparte unidad base con el pedido -> IncompatibleUnitsError»; «QC-195 resolveDistributionLines — R11: el envase que no vuelve sale como packaging_not_found con su id»; `create-order.test.ts` › «QC-195 R11: un envase que no vuelve del catalogo de la empresa -> product_not_found, sin escribir», «R7 / QC-195 R11: …incompatible_units, sin escribir»; `update-order-presentation-lines.test.ts` › «QC-195 R11: packaging_not_found…»; `company-isolation-service.test.ts` › «createOrder/updateOrder: el envase es de la empresa B y el actor es de A -> product_not_found…»; `order-input.test.ts` › «QC-195 — …» (5 casos R11); `order-actions.test.ts` › «QC-195 R11, R35: las tres listas se unen por posicion…», «QC-195 R11: una posicion con envase y presentacion a la vez, o con ninguno, es invalid_input»; `order-actions-distribution.test.ts` › «traduce packaging_not_found al codigo product_not_found…», «QC-195 R11: una linea con envase llega a la fachada…»; int `qc170-distribution-company-scope` › «R29 / QC-195 R11: A no puede repartir su pedido en un envase de B: packaging_not_found…» |
| R12 | `resolve-distribution.test.ts` › «R12: dos envases distintos con la misma presentacion -> ValidationError», «R12: un envase con la misma presentacion que una linea antigua conservada -> ValidationError»; `order-input.test.ts` › «R12: el mismo envase dos veces se rechaza en el borde…»; `update-order-presentation-lines.test.ts` › «R12: dos envases con la misma presentacion -> invalid_lines, sin escribir» |
| R13 | `resolve-distribution.test.ts` › «R13: un envase en ml y otro en l se suman convertidos…», «R13: un envase cuya presentacion no tiene contenido -> PresentationWithoutContentError»; `create-order.test.ts` › «R35 / QC-195 R13…», «R36 / QC-195 R13…»; `update-order.test.ts` › «R36, R38 / QC-195 R13…» |
| R14 | `resolve-distribution.test.ts` › «R13, R14, R15: 40 botellas de 500 ml cubren 20 l, copian la presentacion y el contenido del envase y piden 40 envases»; `create-order.test.ts` › «R6, R8 / QC-195 R14: una linea con envase escribe la presentacion fija del envase y su contenido copiado»; `update-order.test.ts` › «R6, R8 / QC-195 R14…»; int `order-content-copy` › «la presentacion del envase tiene contenido: la linea copia ese valor (QC-195 R14)», «cambiar de envase sustituye la linea…(QC-195 R14)» |
| R15 (necesidad) | `order-requirement.test.ts` › «R15: un reparto de 40 botellas pide 40 envases, junto a la receta, antes de consumir»; `resolve-distribution.test.ts` › «R13, R14, R15: … y piden 40 envases» |
| R24 (necesidad) | `order-requirement.test.ts` › «R24: con la receta ya consumida (POR_EMPACAR) solo quedan los envases» |
| R33 (vistas) | `get-order.test.ts` › «R33: la linea antigua sale con su presentacion y envase null; la de envase, con su id y su nombre», «R33: un pedido solo con lineas antiguas no consulta el catalogo de envases», «R33: toOrderView sin nombres de envase deja packagingName en null y conserva el id»; `list-orders.test.ts`/`order-service.test.ts` (las lineas antiguas salen con `packagingProductId: null, packagingName: null`) |
| R34 | `resolve-distribution.test.ts` › «R34: una linea antigua con sus envases cambiados -> ValidationError sin consultar ningun catalogo», «R34: una linea por presentacion que el pedido no tenia (o en un alta) -> ValidationError», «R34: una linea guardada con envase no sirve para reenviarla por su presentacion»; `create-order.test.ts` › «QC-195 R34: un alta con una linea por presentacion (sin envase) -> invalid_input…»; `update-order.test.ts` › «QC-195 R34: una linea antigua con sus envases cambiados -> invalid_input, sin escribir»; `update-order-presentation-lines.test.ts` › «R34: …» (2 casos) |
| R35 | `resolve-distribution.test.ts` › «R35: una linea antigua que llega igual (misma presentacion, mismos envases) se conserva sin envase»; `update-order.test.ts` › «QC-195 R35: una linea antigua que llega igual…»; `update-order-presentation-lines.test.ts` › «R35: una linea antigua que llega igual a la guardada se conserva sin envase»; `order-input.test.ts` › «R35: una linea antigua por su presentacion sigue teniendo forma valida» |

Salida real:
```
$ pnpm exec vitest run --project node tests/unit/pedidos
 Test Files  61 passed (61)      Tests  1088 passed | 3 skipped (1091)
$ pnpm exec vitest run --project node tests/unit/pedidos/order-requirement.test.ts
 Test Files  1 passed (1)        Tests  10 passed (10)
$ pnpm exec vitest run --project integration tests/integration/pedidos tests/integration/documentos/formula-import.int.test.ts
 Test Files  28 passed (28)      Tests  295 passed (295)     (tras el ultimo ajuste de order-repository)
$ pnpm exec tsc --noEmit -p .     -> 0 errores
$ pnpm exec eslint lib/modules/pedidos lib/composition/index.ts tests/unit/pedidos tests/helpers tests/integration/pedidos …
 0 errores, 2 avisos preexistentes (order-service.test.ts:16-17, imports sin usar que no toque)
$ pnpm exec vitest run guard --passWithNoTests
 Test Files  51 passed (51)      Tests  672 passed | 11 skipped (683)
```
(La primera corrida de integracion dio 38 rojos: todos por repartir en alta/edicion con una linea por
presentacion, que ahora es R34; se reescribieron sembrando envases.)

Gate `./init.sh --rapido` (antes del commit): `✓ typecheck`, `✓ lint`, `test:rapido`
`Test Files 6 failed | 395 passed (401)`, `Tests 8 failed | 5951 passed | 9 skipped`. Los 6 son los
de `tests/baseline-rojos.json` (`recetas/module-contract`, `configuracion-ui/unidades-viewport`,
`configuracion-ui/usuarios-viewport`, `inventario/product-page`, `navegacion/pantallas-exigen-permiso`,
`recetas-ui/recipe-page`). Guardias aparte: verdes (arriba).

### Lo que la UI tiene que cambiar (frontend_dev, no hecho aqui)

- **Validar el reparto con el esquema.** `createOrderSchema`/`updateOrderSchema`,
  `orderPresentationAvailabilitySchema` y `updateOrderDistributionSchema` ya aceptan la union; se
  publica tambien `distributionLineSchema` (una linea). Sustituir `distributionLinesValid`
  (`app/(private)/pedidos/components/use-order-distribution-availability.ts:58`) por
  `presentationLinesSchema.safeParse(toDistributionLinesInput(lines))` (envases enteros > 0, uno y
  solo uno de los dos ids, sin envase ni presentacion antigua repetidos). La regla «dos envases con
  la misma presentacion» no la puede ver el esquema (necesita el catalogo): `distributionLinesValid`
  la comprueba en cliente y el servidor la rechaza con `invalid_input`; conviene conservar esa
  comprobacion o pintar el `invalid_input`.
- `order-form.tsx:564-571` valida con `{ ...values, presentationLines: [] }`: ya puede pasar las
  lineas reales (`toDistributionLinesInput`).
- `use-order-distribution-availability.ts:125` (`scalarsSchema = …pick({ quantity, unitId })`) puede
  validar ya con el esquema entero.
- `quoteOrderCostSchema` aun no lleva `presentationLines` (T9).
- **Tipos de la vista**: `OrderPresentationLineView.packagingProductId`/`packagingName` siguen
  opcionales porque hacerlos obligatorios rompe el typecheck de fixtures de UI que no toco:
  `tests/unit/pedidos-ui/order-columns.test.tsx:343,355,356`,
  `order-distribution-dialog.test.tsx:309`, `order-form-quote.test.tsx:246`,
  `order-form.test.tsx:578`, `order-sheet.test.tsx:263`, `pedidos-viewport.test.tsx:315` (lineas
  `{ presentationId, presentationName, packages }` sin los dos campos). Cuando frontend_dev anada
  `packagingProductId: null, packagingName: null` a esas fixtures, se pueden hacer obligatorios
  (`order-view.ts`) y actualizar el test de tipos `tests/unit/pedidos/qc195-contrato-tipos.test.ts`
  (11.7).

**Veredicto T6:** hecho; unit e integracion de pedidos verdes; gate rapido solo con los rojos del
baseline; guardias verdes.

## T7 — Alta, edicion y revision de bloqueados con envases (backend_dev, 2026-10-03)

Archivos de produccion:
- `create-order.ts`, `update-order.ts`, `review-blocked-orders.ts`: la necesidad sale de
  `buildOrderRequirement({ recipeLines, quantity, packagingLines, phase: 'before_consumption' })`.
  Alta y edicion usan los `packagingLines` de `resolveDistribution`; la revision de bloqueados, los
  de las lineas de la fila bloqueada (`packagingLinesOf(locked.presentationLines)`). El aviso, el
  `BLOQUEADO`, el rechazo en `EN_CURSO` y el paso `BLOQUEADO -> PENDIENTE` ya existian y no cambian.
- **`transition-order.ts` (adelantado de T10):** `EN_CURSO -> POR_EMPACAR` consume con
  `productIds` = productos de la receta. Motivo: desde T7 los envases quedan apartados desde el
  alta, y `consumeForOrder` sin `productIds` consume **todo** lo apartado del pedido, envases
  incluidos (R26 roto) y, si solo habia envases apartados, deja de usar el respaldo de la receta:
  `finish-with-finished-goods` › «con importe nulo, se recalcula al Terminar…» se puso rojo (la
  materia prima quedaba sin consumir, 100 en vez de 90). Lo que queda en T10 es el consumo de los
  envases al Terminar.

Tests: `tests/integration/pedidos/qc195-packaging-reservation.int.test.ts` (nuevo, censo `commit` en
`tests/integration/aislamiento.json` con motivo), casos nuevos en `create-order.test.ts`,
`review-blocked-orders.test.ts` y `transition-order.test.ts`.

R -> test:
| R | Test |
|---|---|
| R15 | int `qc195-packaging-reservation` › «R15: un pedido de 40 l en 40 botellas aparta 40 envases junto a la materia prima, en la misma operacion», «R15, R20: bajar los envases de una linea libera lo que sobra en la misma operacion»; `create-order.test.ts` › «R15: la necesidad que se aparta lleva la receta y 40 envases por un reparto de 40 botellas» |
| R16 | int › «R16, R17: si el envase no alcanza, el alta avisa con order_would_block y no deja nada escrito», «R16, R17: con la confirmacion queda BLOQUEADO, sin nada apartado (ni la materia prima) y sin importe»; `create-order.test.ts` › «R16, R17: si falta un envase y no se confirma, lanza order_would_block…» |
| R17 (alta y edicion completa) | int › los dos de arriba y «R17: editar un PENDIENTE con un envase que no alcanza avisa; con la confirmacion queda BLOQUEADO sin nada apartado»; `create-order.test.ts` › «R17: con la confirmacion, el pedido queda BLOQUEADO y sin reserved_at» |
| R18 (edicion completa) | int › «R18: editar un EN_CURSO con un envase que no alcanza rechaza con insufficient_material y no cambia nada» |
| R19 (edicion completa) | int › «R19: guardar un BLOQUEADO cuando ya hay envases lo deja PENDIENTE con todo apartado» |
| R20 (edicion completa) | int › «R15, R20: bajar los envases…» |
| R21 | int › «R21: la revision no desbloquea un pedido mientras falte un envase, y lo desbloquea cuando entra»; `review-blocked-orders.test.ts` › «R21: la necesidad que se evalua lleva la receta y los envases del reparto (las lineas antiguas no aportan)», «R21: si falta un envase no se desbloquea: ni estado, ni importe, ni reserved_at» |
| R22 | int › «R22: cancelar y borrar un pedido liberan tambien lo apartado de sus envases» (la caducidad usa el mismo `releaseForOrder` sin filtro de producto que la cancelacion: `expire-stale-orders.ts`, sin cambio) |
| R23 | int › «R23: apartar, liberar y editar los envases de un pedido no cambia lo que otro pedido tiene apartado» |
| R26 | int › «R26: la materia prima se consume y los envases siguen apartados, con su existencia intacta»; `transition-order.test.ts` › «R26: consumeForOrder recibe como productIds los productos de la receta, no los envases del reparto» |

Salida real:
```
$ pnpm exec vitest run --project integration tests/integration/pedidos/qc195-packaging-reservation.int.test.ts
 Test Files  1 passed (1)        Tests  11 passed (11)
$ pnpm exec vitest run --project integration tests/integration/pedidos tests/integration/asignaciones tests/integration/documentos/formula-import.int.test.ts
 Test Files  46 passed (46)      Tests  407 passed (407)
$ pnpm exec vitest run --project node tests/unit/pedidos
 Test Files  61 passed (61)      Tests  1098 passed | 3 skipped (1101)   (antes de los casos de transition-order)
$ pnpm exec vitest run --project node tests/unit/pedidos/transition-order.test.ts
 Test Files  1 passed (1)        Tests  13 passed (13)
$ pnpm exec tsc --noEmit -p .   -> 0 errores;  eslint (pedidos) -> 0 errores, 2 avisos preexistentes
$ pnpm exec vitest run guard --passWithNoTests
 Test Files  51 passed (51)      Tests  672 passed | 11 skipped (683)
```

Gate `./init.sh --rapido` tras el commit de T7 (`aa6418fa`): `✓ typecheck`, `✓ lint`, `test:rapido`
`Test Files 6 failed | 404 passed (410)`, `Tests 8 failed | 6128 passed | 9 skipped`; los 6 del
baseline (los mismos de T6). Guardias aparte: `51 passed (51)`.

**Veredicto T7:** hecho; R15-R23 y R26 verdes en integracion; sin rojos fuera del baseline.

## T8 — «Reparto y unidad» toca la reserva (backend_dev, 2026-10-03)

Archivos de produccion:
- `update-order-presentation-lines.ts`: corre en `OrderUnitOfWork` (deps `packaging`,
  `presentations`, `units`, `unitOfWork`, `now`). Tras escribir unidad y lineas arma la necesidad con
  `buildOrderRequirement` (`POR_EMPACAR` -> `materials_consumed`, solo envases y sin leer la receta;
  el resto -> receta + envases) y llama a `syncForOrder`. Con falta: `PENDIENTE`/`BLOQUEADO` sin
  `confirmBlocked` -> `'would_block'`; con confirmacion -> `BLOQUEADO` (si no lo estaba) e importe a
  `null`; `EN_CURSO`/`POR_EMPACAR` -> `'insufficient_material'` aunque llegue la confirmacion. Sin
  falta y `BLOQUEADO` -> `PENDIENTE`. `reserved_at` como en `update-order.ts`. Los dos rechazos se
  lanzan dentro de la transaccion para deshacer lineas, unidad y apartado, y se traducen al
  resultado fuera. Entrada gana `confirmBlocked?`.
- `order-input.ts`: `updateOrderDistributionSchema` gana `confirmBlocked: z.boolean().default(false)`
  (sigue `.strict()`); `UpdateOrderDistributionInput` conserva `confirmBlocked?: boolean` (contrato
  11.4, el test de tipos de TC sigue verde).
- `order-actions.ts`: `updateOrderDistributionAction` pasa `confirmBlocked` y traduce
  `'would_block'` -> `order_would_block`, `'insufficient_material'` -> `insufficient_material`.
- `lib/composition/index.ts`: cablea `orderUnitOfWork`. **Retirados** el puerto
  `ports/order-distribution-transaction.ts` y `createOrderDistributionTransaction`
  (`order-unit-of-work-prisma.ts`): su unico consumidor era este caso de uso. Los dos censos de
  `aislamiento.json` que lo nombraban dicen ahora `withOrderTransaction`.

Tests:
- `tests/unit/pedidos/update-order-presentation-lines.test.ts`: dobles sobre la unidad de trabajo
  (`fakeOrderUnitOfWork` + `fakeMaterialReservations` + `fakeRecipeExecutionReader`). El caso de la
  linea 327 («no toca quantity, receta ni reserva») **reescrito contra R15/R20**, con el motivo en el
  nombre: describe «R46: no toca quantity ni receta; QC-195 R15, R20: la reserva si, porque el
  reparto aparta sus envases», casos «R46: no escribe cantidad ni receta -ni create, ni updateAlive- y,
  con todo apartado, no mueve el estado» y «R15, R20: la reserva se sincroniza con la necesidad
  completa -receta y envases del reparto nuevo-, en la misma unidad de trabajo». Las dependencias
  declaradas pasan a `now, packaging, presentations, unitOfWork, units`.
- `qc170-distribution-concurrency`/`-company-scope` (int): construyen el caso de uso con la unidad de
  trabajo; sus aserciones no cambian (R37/R48 siguen probando la serializacion sobre la fila; «R30,
  R46 — cambiar la unidad en POR_EMPACAR no altera reservas ni asientos» sigue valiendo: el mismo
  reparto no escribe asientos nuevos).
- `qc195-packaging-reservation.int.test.ts`: describe «QC-195 — Reparto y unidad toca la reserva de
  los envases».

R -> test:
| R | Test |
|---|---|
| R17 (Reparto y unidad) | int › «R17: en PENDIENTE, si falta envase avisa sin escribir nada; con la confirmacion queda BLOQUEADO sin nada apartado ni importe»; unit › «R17: en %s, sin confirmacion, falta de envase -> would_block…» (PENDIENTE, BLOQUEADO), «R17: con la confirmacion, un PENDIENTE pasa a BLOQUEADO sin importe y sin reserved_at», «R17: con la confirmacion, un BLOQUEADO sigue BLOQUEADO…»; `order-actions-distribution.test.ts` › «traduce would_block al codigo order_would_block…», «QC-195 R17, R37: confirmBlocked viaja al caso de uso; solo un booleano lo confirma» |
| R18 (Reparto y unidad) | int › «R18: en EN_CURSO, si falta envase rechaza con insufficient_material…», «R18: en POR_EMPACAR, si falta envase rechaza con insufficient_material sin tocar nada»; unit › «R18: en %s, falta de envase -> insufficient_material aunque llegue la confirmacion» (EN_CURSO, POR_EMPACAR); acciones › «traduce insufficient_material…» |
| R19 (Reparto y unidad) | int › «R19: un BLOQUEADO cuyo reparto nuevo ya queda cubierto pasa a PENDIENTE con todo apartado»; unit › «R19: un BLOQUEADO cuyo reparto nuevo ya queda cubierto pasa a PENDIENTE con reserved_at» |
| R20 | int › «R20: bajar los envases de una linea libera lo que sobra en la misma operacion»; unit › «R15, R20: la reserva se sincroniza con la necesidad completa…» |
| R24 | int › «R24: en POR_EMPACAR solo se sincronizan los envases y la materia prima consumida no se vuelve a apartar»; unit › «R24: en POR_EMPACAR solo se sincronizan los envases: la receta ni se lee» |
| R15 (Reparto y unidad) | unit › «R15, R20: la reserva se sincroniza con la necesidad completa…» |

Salida real:
```
$ pnpm exec vitest run --project node tests/unit/pedidos
 Test Files  61 passed (61)      Tests  1111 passed | 3 skipped (1114)
$ pnpm exec vitest run --project integration tests/integration/pedidos/qc195-packaging-reservation.int.test.ts
 Test Files  1 passed (1)        Tests  17 passed (17)
$ pnpm exec vitest run --project integration tests/integration/pedidos tests/integration/asignaciones
 Test Files  45 passed (45)      Tests  405 passed (405)     (qc170-* incluidos)
$ pnpm exec tsc --noEmit -p .   -> 0 errores;  eslint -> 0 errores, 2 avisos preexistentes
$ pnpm exec vitest run guard --passWithNoTests
 Test Files  51 passed (51)      Tests  672 passed | 11 skipped (683)
```

Pregunta abierta (no decidida aqui): «Reparto y unidad» cambia los envases pero **no recalcula
`orders.ingredients_cost`** (`design.md > 3.3` no lo pide para este caso de uso; solo lo pone a
`null` al bloquear). Con T9 el importe incluye envases, asi que tras cambiar el reparto por esta via
el importe guardado queda con los envases anteriores hasta la siguiente edicion completa, y un
`BLOQUEADO` que se desbloquea por aqui queda `PENDIENTE` con importe `null`. ¿Debe recalcularlo?

Gate `./init.sh --rapido` tras el commit de T8: `✓ typecheck`, `✓ lint`, `test:rapido`
`Test Files 6 failed | 404 passed (410)`, `Tests 8 failed | 6146 passed | 9 skipped`; los 6 del
baseline. Guardias aparte: `51 passed (51)`. **Veredicto T8:** hecho.

## T9 — Costo de los envases (backend_dev, 2026-10-03)

Archivos de produccion:
- `order-cost.ts`: `calculatePackagingCost(lines, batches)` (por linea, envases x promedio simple
  del costo de sus lotes con disponible > 0; `null` si un envase no tiene lote o su disponible no
  cubre sus envases; sin envases `'0.0000'`), `calculateLotPackagingCost` (mismo calculo; un envase
  sin lote cuenta cero, nunca `null`), `calculateOrderCost(ingredientes, envases)` (`null` si
  cualquiera lo es; redondeo mitad arriba a 4 decimales; los dos sumandos ya vienen a 4 decimales,
  asi que la suma no cambia el redondeo de cada uno).
- `resolve-ingredients-cost.ts`: `resolveOrderCost(catalogs, recipeId, quantity, packagingLines,
  companyId, { orderId })` y `resolveLotCost(...)`; leen `PackagingCatalog.findCostingBatches` con
  `excludeOrderId` (R30) solo si hay envases.
- `create-order.ts`/`update-order.ts`: el importe guardado es `resolveOrderCost` con los envases de
  la entrada (`packagingLinesOfInput`, nuevo en `resolve-distribution.ts`); la edicion cuenta lo
  apartado por el propio pedido.
- `quote-order-cost.ts` + `quoteOrderCostSchema`: acepta `presentationLines` (opcional, la union);
  las lineas antiguas no cuestan. Deps ganan `packaging`.
- `review-blocked-orders.ts`: el importe al desbloquear incluye los envases de la fila; si el
  reparto cambio entre la lectura y el candado, el pedido se deja para la siguiente revision (igual
  que ya se hacia con receta y cantidad).
- `order-packing.ts`: lote sin importe guardado -> `resolveLotCost` con los envases de las lineas
  (R31). `FinishPackingLine` gana `packagingProductId` (lo lee `findPresentationLinesForFinish`).
- `lib/composition/index.ts`: `packaging` en cotizacion, revision de bloqueados y Terminar.

Tests: nuevos casos en `order-cost.test.ts`, `quote-order-cost.test.ts`, `order-packing.test.ts`,
`qc195-packaging-reservation.int.test.ts`. Ajustados contra R27/R31 (el importe y el lote ahora
incluyen los envases): `finish-with-finished-goods.int.test.ts` (5 expectativas recalculadas con el
envase sembrado a 0.5000 por envase, la formula en el comentario de cada una; el costo cero no es
posible: `product_batches_unit_cost_positive`). Dobles de `packaging` en `review-blocked-orders`,
`quote-order-cost`, `order-packing` (unit e int), `order-cost-quote.int`. Guardia
`guard-ambito-empresa-pedidos.test.ts`: la firma exacta del cableado de `finishPackingAliveById`
gana `packaging: packagingCatalog` (el catalogo filtra por empresa en `inventario`).

R -> test:
| R | Test |
|---|---|
| R27 | `order-cost.test.ts` › «R27: 40 botellas con lotes A (100 a 0.50) y B (50 a 0.70) cuestan 40 x (0.50 + 0.70) / 2 = 24.0000», «R27: el importe del pedido es ingredientes + envases (500 + 24 = 524.0000)», «R27: el promedio es simple, sin ponderar por el disponible de cada lote»; `quote-order-cost.test.ts` › «R27, R29: con 40 envases suma 24.0000 a los ingredientes…»; int › «R27, R29, R30: 40 l y 40 botellas (lotes a 0.50 y 0.70): cotizacion, alta y edicion guardan 40 + 24 = 64.0000» |
| R28 | `order-cost.test.ts` › «R28: si la suma de los disponibles no cubre los envases, el pedido queda sin importe», «R28: un envase sin ningun lote con costo y disponible deja el pedido sin importe»; `quote-order-cost.test.ts` › «R28: …la cotizacion queda sin importe»; int › «R28: si los envases disponibles no cubren el reparto, la cotizacion y lo guardado quedan sin importe» |
| R29 (dominio) | `quote-order-cost.test.ts` › «R29: el alta guarda el mismo importe que da la cotizacion con el mismo reparto», «R29: las lineas antiguas, sin envase, no cuestan ni consultan el catalogo de envases»; int › «R27, R29, R30: …» |
| R30 | `quote-order-cost.test.ts` › «R30: en la edicion, lo apartado por el propio pedido cuenta como disponible del envase»; `order-cost.test.ts` › «R30: un lote sin disponible no entra en el promedio»; int › «R27, R29, R30: …» (la edicion sin cambios conserva 64.0000); el lote sin costo lo excluye el adaptador (`qc195-packaging-catalog.int.test.ts` › «R27, R30 — findCostingBatches…», T3) |
| R31 | `order-packing.test.ts` › «QC-195 R31: sin importe guardado, el lote se costea con sus envases…», «QC-195 R31: con importe guardado el lote usa ese importe y no vuelve a costear los envases»; `order-cost.test.ts` › «R31: para el lote de producto terminado un envase sin lote con costo cuenta cero, nunca null»; int `finish-with-finished-goods` › «con importe nulo, se recalcula al Terminar…» (30 + 10 x 0.50 = 3.5000 por unidad) |

Salida real:
```
$ pnpm exec vitest run --project node tests/unit/pedidos tests/unit/asignaciones
 Test Files  94 passed (94)      Tests  1736 passed | 3 skipped (1739)
$ pnpm exec vitest run --project integration tests/integration/pedidos tests/integration/asignaciones tests/integration/documentos/formula-import.int.test.ts
 Test Files  46 passed (46)      Tests  415 passed (415)
$ pnpm exec tsc --noEmit -p .   -> 0 errores;  eslint -> 0 errores, 2 avisos preexistentes
$ pnpm exec vitest run guard --passWithNoTests
 Test Files  51 passed (51)      Tests  672 passed | 11 skipped (683)   (tras ampliar la firma de la guardia)
```

Decision dentro del spec: en el lote de producto terminado (R31) un envase sin ningun lote con costo
cuenta cero, como un ingrediente sin costo en `calculateLotIngredientsCost` (el lote siempre entra
con costo). La cobertura no se exige ahi: al Terminar los envases estan apartados por el pedido.

Cierre de la seccion (backend_dev siguiente, 2026-10-03; el anterior se detuvo antes de esta
linea). Archivos de `git show --stat ccd7dbfb`: `lib/composition/index.ts`,
`pedidos/adapters/driven/persistence/order-prisma.ts`, `pedidos/domain/{create-order,order-cost,
order-input,order-packing,quote-order-cost,resolve-distribution,resolve-ingredients-cost,
review-blocked-orders,update-order}.ts`, `pedidos/ports/order-write-repository.ts`,
`tests/guards/guard-ambito-empresa-pedidos.test.ts`, `tests/integration/pedidos/{finish-with-
finished-goods,order-cost-quote,order-packing,qc195-packaging-reservation,review-blocked-orders}
.int.test.ts`, `tests/unit/pedidos/{order-cost,order-packing,quote-order-cost,review-blocked-
orders}.test.ts` y esta bitacora (23 archivos, +579 -84).

Reejecucion de los unit de T9 (arbol con T10 en curso, sin commit):
```
$ pnpm exec vitest run --project node tests/unit/pedidos/order-cost.test.ts tests/unit/pedidos/quote-order-cost.test.ts tests/unit/pedidos/order-packing.test.ts tests/unit/pedidos/review-blocked-orders.test.ts
 Test Files  4 passed (4)      Tests  109 passed (109)
```
Los de integracion de T9 se reejecutan con todo `tests/integration/pedidos` en el cierre de T10.

**Veredicto T9:** hecho.

## T10 — Consumo al Terminar (backend_dev, 2026-10-03) — commit `2b28d72b`

Archivos de produccion:
- `transition-order.ts`: sin cambio en T10. `POR_EMPACAR` ya pasa `productIds` = productos de la
  receta a `consumeForOrder` desde T7 (`aa6418fa`); los envases siguen apartados.
- `order-packing.ts`: tras `finishPackingAlive` y antes del alta de producto terminado, si el
  reparto tiene lineas con envase, `consumeForOrder({ productIds: envases, fallbackRequirement:
  envases sumados por producto })` en la misma unidad de trabajo; `insufficient` lanza
  `InsufficientMaterialError` -> rollback -> `'insufficient_material'`. Solo lineas antiguas: no
  se llama a `consumeForOrder`.
- `order-catalog.ts`: `finishPackingAliveById` gana `'insufficient_material'`.
- `asignaciones/domain/finish-packing.ts`: `'insufficient_material'` -> `MaterialShortageError`
  (code `insufficient_material`, el que ya publica la acción). `finishPackingAction` no cambia: el
  traductor de errores ya lo pasa como `ErrorState`.

Tests: `tests/unit/pedidos/order-packing.test.ts` (4 casos nuevos; `montar` acepta y devuelve
`consumeForOrder`), `tests/unit/asignaciones/finish-packing.test.ts` (1 caso),
`tests/integration/pedidos/finish-with-finished-goods.int.test.ts` (describe nuevo con 4 casos).
`transition-order.test.ts:206-260` sigue valido contra R26 sin tocarlo (no comprueba
`productIds`); el caso de R26 ya existia (T7).

R -> test:
| R | Test |
|---|---|
| R25 | unit `order-packing.test.ts` › «QC-195 R25: consume los envases del reparto (solo esos productos) ANTES de dar de alta el producto terminado», «QC-195 R25: si los envases no alcanzan, Terminar rechaza con insufficient_material y NO da de alta ningun lote», «QC-195 R25, R33: con una linea antigua y una con envase…»; unit `asignaciones/finish-packing.test.ts` › «QC-195 R25: `insufficient_material` (los envases no alcanzan) rechaza con `MaterialShortageError`…»; int `finish-with-finished-goods` › «R25: Terminar consume los envases apartados en la misma transaccion…», «R25: si el disponible de los envases no alcanza, Terminar rechaza con insufficient_material sin mover el estado ni dar de alta producto terminado» |
| R26 | unit `transition-order.test.ts` › «R26: consumeForOrder recibe como productIds los productos de la receta, no los envases del reparto»; int `qc195-packaging-reservation` › «R26: la materia prima se consume y los envases siguen apartados, con su existencia intacta»; int `finish-with-finished-goods` › «R25: Terminar consume…» (comprueba apartado 10 y existencia 1000 antes de Terminar) |
| R14 | int `finish-with-finished-goods` › «R14: el producto terminado entra en la presentacion y el contenido copiados al guardar, aunque el envase y su presentacion cambien despues» |
| R33 | unit `order-packing.test.ts` › «QC-195 R33: un reparto solo con lineas antiguas, sin envase, no consume nada…»; int `finish-with-finished-goods` › «R33: una linea antigua, sin envase ni nada apartado por ella, termina como hoy y no consume ningun envase» |

Salida real:
```
$ pnpm exec vitest run --project node tests/unit/pedidos tests/unit/asignaciones
 Test Files  94 passed (94)      Tests  1741 passed | 3 skipped (1744)
$ pnpm exec vitest run --project integration tests/integration/pedidos tests/integration/asignaciones
 Test Files  45 passed (45)      Tests  411 passed (411)
$ pnpm exec tsc --noEmit -p .   -> 0 errores; eslint de los 6 archivos -> 0
$ ./init.sh --rapido
 ✓ typecheck paso   ✓ lint paso   ✗ test:rapido
 Test Files  6 failed | 405 passed (411)      Tests  8 failed | 6215 passed | 9 skipped (6232)
 rojos: recetas/module-contract, configuracion-ui/unidades-viewport, configuracion-ui/usuarios-viewport,
        inventario/product-page, navegacion/pantallas-exigen-permiso, recetas-ui/recipe-page (los 6 del baseline)
$ pnpm exec vitest run guard --passWithNoTests
 Test Files  51 passed (51)      Tests  672 passed | 11 skipped (683)
```

Nota: una primera corrida del caso R14 fallo en el `finally` (borraba la unidad antes que la
presentacion extra); corregido el orden. Esa corrida dejo una empresa efimera huerfana en
`QuimiCloude_QC195` (no afecta a otros casos: todos filtran por su empresa).

Decision dentro del spec: si el pedido no tiene nada apartado de un envase (p. ej. la reserva se
libero), `consumeForOrder` consume del disponible con el respaldo filtrado a los envases, igual que
hace `POR_EMPACAR` con la receta; si no alcanza, `insufficient_material` (R25).

Abierto para el leader: si una receta conservada por P4 lleva como ingrediente el mismo producto
PACKAGING que el reparto usa como envase, `POR_EMPACAR` consume todo lo apartado de ese producto
(receta + envases, porque se apartan sumados) y Terminar consumiria los envases otra vez desde el
disponible. Solo afecta a envases legados en receta; el spec no lo cubre.

**Veredicto T10:** hecho; unit e integracion de pedidos/asignaciones verdes; gate rapido solo con
los rojos del baseline; guardias verdes.

## T13 (cont.) — la UI valida el reparto con los esquemas del contrato (frontend_dev, 63fd3a6d)

Comprobado antes en `lib/modules/pedidos/domain/order-input.ts`: `presentationLinesSchema`
(barrel) acepta linea con envase o con presentacion, y `createOrderSchema`/`updateOrderSchema`,
`orderPresentationAvailabilitySchema` y `quoteOrderCostSchema` lo usan. Sin hallazgos en lib.

Archivos:
- `app/(private)/pedidos/components/use-order-distribution-availability.ts`: `distributionLinesValid`
  = `presentationLinesSchema.safeParse(toDistributionLinesInput(lines))` + chequeo local de
  presentacion repetida; `availabilityKey` usa `orderPresentationAvailabilitySchema` entero
  (fuera `scalarsSchema` y la regex local).
- `app/(private)/pedidos/components/order-form.tsx`: `save` valida con las lineas reales
  (`toDistributionLinesInput(readDistributionLines(formData))`) contra `createOrderSchema`/`updateOrderSchema`.
- `app/(private)/pedidos/components/use-order-cost-quote.ts`: `canQuote` pasa `presentationLines`
  a `quoteOrderCostSchema`.
- Fixtures `OrderPresentationLineView` antiguas con `packagingProductId: null, packagingName: null`:
  order-columns (3), order-distribution-dialog, order-form-quote, order-form, order-sheet,
  pedidos-viewport. Ninguna otra en `tests/unit/pedidos-ui` le faltaba.

Matiz: los envases se validan ahora con `z.coerce.number().int().positive()` (el del servidor)
en vez de `/^[1-9]\d*$/`; un texto como `01` deja de bloquear la consulta y el servidor lo acepta igual.

Salida real:
- `pnpm exec tsc --noEmit`: sin errores.
- `pnpm exec vitest run tests/unit/pedidos-ui`: 37 archivos, 572 passed | 3 skipped.
- `./init.sh --rapido`: typecheck y lint pasan (0 errores, 8 warnings ajenos); test:rapido
  405 passed / 6 failed, todos en baseline (configuracion-ui/unidades-viewport,
  configuracion-ui/usuarios-viewport, inventario/product-page, navegacion/pantallas-exigen-permiso,
  recetas-ui/recipe-page, recetas/module-contract).
- `pnpm exec vitest run guard --passWithNoTests`: 51 archivos, 672 passed | 11 skipped.

**Veredicto:** hecho; sin cambio visible; gate rapido solo con rojos del baseline; guardias verdes.
