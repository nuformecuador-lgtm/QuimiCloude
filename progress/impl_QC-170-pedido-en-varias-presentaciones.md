# QC-170 — pedido-en-varias-presentaciones · bitácora de implementación

Base propia: `QuimiCloude_QC170` (58 migraciones aplicadas tras la tanda A). Worktree en
`feature/QC-170-pedido-en-varias-presentaciones`.

## Estado por tanda

| Tanda | Tasks | Estado |
|---|---|---|
| A | T0, T1, T2, T17, T18, T24 | cerradas |
| A (resto) | T3 (backfill + drop) | pendiente: pasa a la siguiente vuelta |
| B | T4, T5, T6, T7, T12, T20 | pendiente |
| C | T8, T9, T10, T13, T23 | pendiente |
| D | T11, T14, T21, T25 (Server Action) | pendiente |
| E | T16, T15, T22, T25 (UI) | pendiente |
| final | T19 (E2E escrito) | pendiente |

## Archivos creados/modificados

Tanda A:
- `specs/QC-170-pedido-en-varias-presentaciones/design.md` — solo se añade §13 (T0: recontraste,
  sin divergencias que cambien requisitos ni tasks; fija la ruta de la pantalla de empaque y que no
  hay `BLOQUEADO` en el enum).
- `db/schema.prisma` — `OrderPresentationLine`, `Order.unitId`, `InventoryMovement.orderPresentationLineId`.
- `db/migrations/20260927120000_order_presentation_lines/{migration.sql,down.sql}` (T1).
- `db/migrations/20260927120100_inventory_movements_production_per_line/{migration.sql,down.sql}` (T2).
- `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts`, `lib/modules/pedidos/domain/errors.ts` (T17).
- Tests: `tests/unit/pedidos/schema/order-presentation-lines-migration.test.ts` (nuevo),
  `tests/unit/inventario/schema/inventory-movements-production-per-line-migration.test.ts` (nuevo;
  sustituye a «ampliar `inventory-movements-migration.test.ts`», que censa el `CREATE TABLE` de la
  migración original y no ve los `ALTER` posteriores), `tests/unit/errores/catalogo.test.ts` (60 → 64),
  `tests/guards/guard-identificador-de-request.test.ts` (dos migraciones esperadas),
  `tests/integration/pedidos/pedidos-constraints.int.test.ts` (`unit_id` en el censo),
  `tests/integration/proveedores/company-scope.int.test.ts` (dependientes de segundo grado en el down).
- Specs ajenos, solo notas de cabecera: QC-168, QC-150, QC-146 (T18); QC-35, QC-123 (T24).

## Mapa R<n> -> test (parcial, se completa por tanda)

| R | Test |
|---|---|
| R1, R2, R3 (estructura del reparto) | `tests/unit/pedidos/schema/order-presentation-lines-migration.test.ts` |
| R17, R21 (un asiento `production` por línea) | `tests/unit/inventario/schema/inventory-movements-production-per-line-migration.test.ts` |
| R28 (errores nuevos) | `tests/unit/errores/catalogo.test.ts`, `tests/guards/guard-catalogo-de-errores.test.ts` |
| R40, R43 (columna `orders.unit_id` anulable) | `order-presentation-lines-migration.test.ts`, `pedidos-constraints.int.test.ts` |

## Salida de tests (tanda A, 2026-09-27)

- `pnpm run typecheck`: verde (antes hizo falta `pnpm exec next typegen`: el worktree no tenía los
  tipos de ruta de Next y `LayoutProps` faltaba en `app/layout.tsx`, sin relación con el cambio).
- `pnpm run lint`: 0 errores, 7 avisos ya existentes.
- Tests de la tanda + guardias (`catalogo-de-errores`, `empresa-en-esquema`, `rls-force`,
  `libro-de-inventario`, `identificador-de-request`): 9 archivos, 168/168 en verde.
- **Rojos esperados hasta la tanda B** (ninguno está en `tests/baseline-rojos.json`): 48 casos en
  `tests/integration/inventario/{finished-goods,finished-goods-receipts,product-type-lock}.int.test.ts`
  y `tests/integration/pedidos/{finish-with-finished-goods,order-reservation}.int.test.ts`. Causa
  única: el CHECK nuevo `inventory_movements_order_presentation_line_id_matches_kind` (design §2.3)
  rechaza el asiento `production` sin línea que el Finalizar de QC-150 todavía da de alta. Se
  arreglan con T6/T12 (y T14 reescribe `finish-with-finished-goods`).
- `tests/unit/configuracion-ui/user-table.test.tsx` falló una vez y pasó en la segunda pasada:
  inestable y sin relación con este cambio.
