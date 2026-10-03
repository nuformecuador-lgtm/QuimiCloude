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
