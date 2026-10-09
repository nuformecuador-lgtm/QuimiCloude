# impl QC-224 — anular-entrega

## T0 — contrato (backend_dev, 2026-10-09)

### Archivos
Nuevos:
- `lib/modules/inventario/domain/finished-goods-return.ts`
- `lib/modules/pedidos/ports/order-delivery-void-repository.ts`
- `lib/modules/pedidos/ports/order-delivery-void-unit-of-work.ts`
- `lib/modules/pedidos/domain/list-order-deliveries.ts` (stub: `pedidos.consultar` y luego `ActionNotAllowedError`)
- `lib/modules/pedidos/domain/void-delivery.ts` (stub: `entregas.anular` y luego `ActionNotAllowedError`)
- `tests/fixtures/order-delivery-void.ts`

Modificados:
- `lib/modules/inventario/index.ts`, `domain/inventory-movement.ts`, `domain/reservation.ts`
- `app/(private)/inventario/components/batch-history.tsx` (solo `KIND_LABELS.delivery_void`)
- `lib/modules/pedidos/domain/errors.ts`, `index.ts`, `adapters/driving/order-actions.ts`
- `lib/modules/identity/domain/permissions.ts`
- `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts`
- `lib/composition/index.ts` (dobles provisionales; B5 los sustituye)
- Censos con nota fechada 2026-10-09: `tests/unit/identity/permissions.test.ts`,
  `tests/unit/errores/catalogo.test.ts`, `tests/unit/pedidos/order-actions.test.ts`,
  `tests/unit/navegacion/qc75-convenciones.test.ts`,
  `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`

### Desvio respecto de tasks.md
- `NewInventoryMovement['kind']` NO gana `'delivery_void'` en T0: `writeMovement` pasa `kind` al enum
  de Prisma, que no tiene el valor hasta B1, y `typecheck` cae. Si ganan el valor
  `InventoryMovementView['kind']` y `BatchHistoryEntry['kind']`, y `NewInventoryMovement` gana
  `orderDeliveryVoidId?`. Lo amplia B1/B2 junto con el enum de `db/schema.prisma`.

### Verificacion de design.md > 4.2
Ningun producto terminado puede ser ingrediente: `isIngredientType` excluye `FINISHED_PRODUCT`
y la usan todos los caminos que escriben lineas de receta (`create-recipe`, `update-recipe`,
`update-recipe-version`, `create-recipe-version` -que ademas rechaza `FINISHED_PRODUCT` explicito-
y `confirm-formula-import`); `updateAliveProduct` devuelve `type_locked` ante un cambio de tipo a o
desde `FINISHED_PRODUCT`, y el alta manual no lo ofrece. Se cumple.

### R -> test (T0)
- R1 (base): `tests/unit/identity/permissions.test.ts > QC-224 — el permiso entregas.anular` (6 casos)

### Gate
- `pnpm run typecheck`: 0 errores.
- `pnpm run lint`: 0 errores, 7 avisos ajenos (tests de documentos y order-service).
- `vitest related --run --project node --project ui <archivos tocados>`: 587 archivos, 9950 pass, 41 skip, 0 fail.
- `vitest run guard`: 62 archivos, 834 pass, 15 skip, 0 fail.
- Unicidad del catalogo (`tests/unit/errores/catalogo.test.ts`): verde.
- Proyecto `integration` no corrido: el worktree no tiene `.env` (`DATABASE_URL`).

Veredicto: T0 listo para commit.
