# QC-92 — ajuste-de-inventario · bitácora de implementación

> Rama `feature/QC-92-ajuste-de-inventario`, desde `origin/dev` en `b579707`.
> Worktree `.worktrees/QC-92-ajuste-de-inventario`.

## T0 — Séptima enmienda del catálogo de errores: **APROBADA**

**Fecha:** 2026-09-17. **Quién:** el humano, expresamente, en la puerta F1.4 junto con el spec.

**Qué se aprobó:** los dos códigos que propone `design.md > 7`:

| Código | Para qué |
|---|---|
| `batch_not_found` | El lote pedido no existe o es de otra empresa (R18) |
| `batch_stock_negative` | El ajuste dejaría el lote bajo cero (R4) |

**Consecuencias, escritas para que no se reabran:**

- **T4 vive** y se implementa: las dos entradas en `ERROR_CODES` + `error-catalog.ts`, la enmienda
  fechada en la cabecera de `error-codes.ts` y las dos clases en `errors.ts` del módulo.
- **El plan B de `design.md > 7` queda descartado.** `batch_not_found` NO cae a
  `product_not_found` y `batch_stock_negative` NO cae a `invalid_input`. T8 no aplica plan B.

## Estado de las tasks

Ver `specs/QC-92-ajuste-de-inventario/tasks.md`.

## Archivos tocados

(se completa por tanda)

## Mapa R<n> -> test

(se completa en T17)

## Salida de los tests

(se completa por tanda)

---

## Tanda 1 — T1, T2 (cerrada)

### Archivos
**Creados**
- `db/migrations/20260917130000_inventory_movements/migration.sql`
- `db/migrations/20260917130000_inventory_movements/down.sql`
- `tests/integration/inventario/inventory-movements-constraints.int.test.ts`

**Modificados**
- `db/schema.prisma` — modelo `InventoryMovement` (`/// @module inventario`) y back-relation `movements` en `ProductBatch`.
- `tests/integration/aislamiento.json` — fila en la lista `transaccion`.
- `tests/guards/guard-identificador-de-request.test.ts` — la migración nueva, añadida a la lista cerrada `MIGRACIONES_ESPERADAS`.

### Dato que arrastran las tandas siguientes
**`LEDGER_START = '20260917130000'`** — el timestamp de la carpeta de la migración. Es lo que T3 escribe en `movement-ledger.ts` y lo que T15 usa como fecha de corte.

### Ciclo de la migración, verificado de verdad
`migrate deploy` → aplica · `pnpm run db:rollback` → revierte por `down.sql` y borra la fila de `_prisma_migrations` · `migrate deploy` otra vez → vuelve a aplicar. `_prisma_migrations` coherente en las tres vueltas.

### Salida real
- `pnpm run typecheck` → verde, sin salida.
- `pnpm run lint` → verde, sin salida.
- `pnpm exec vitest run tests/integration/inventario/inventory-movements-constraints.int.test.ts` → **5 passed (5)**.
- `pnpm exec vitest run guard` → **43 archivos, 511 passed, 9 skipped**.

### Desviaciones declaradas
1. **`companyId` y `createdBy` de `InventoryMovement` no llevan `@relation`.** El design decía «las relaciones (`ProductBatch`, `Company`, `User`) con sus back-relations». El patrón real del esquema es el contrario: ningún campo cuyo destino es de **otro módulo** lleva `@relation` (`ProductBatch.companyId`, `Product.companyId`, `Presentation.unitId`), y es drift a propósito para que ningún `include` cruce la frontera sin que la guardia de módulos lo vea. Solo `batchId` (mismo módulo) lleva `@relation`; las otras dos FK van escritas a mano en el SQL. **Se siguió el patrón real del repo, no la letra del design.**
2. **La fila de `aislamiento.json` no lleva `motivo` ni `desde`.** `tasks.md` los pedía; el archivo solo los admite en la categoría `commit`, y este test se aísla por `prisma.$transaction` + rollback como sus vecinos de `inventario/`, así que va en la lista `transaccion`, donde esas claves no existen.
3. **Se tocó `tests/guards/guard-identificador-de-request.test.ts`,** que no estaba en los archivos de T1. Es obligatorio: esa guardia lleva una lista **cerrada** de migraciones y cualquier migración nueva la pone roja hasta que se nombra. Mismo trámite que ya hicieron `orders_company_scope`, `recipes_company_scope` y `drop_product_stock`. **Es un segundo caso del mismo tipo que la trampa de QC-104 que T9 tiene anotada.**
4. **Los cuatro casos de CHECK/disparador de T2 usan `$executeRaw`**, no `tx.inventoryMovement.create()`: la API tipada envuelve el error y `meta.code` deja de estar disponible. Mismo criterio que ya dejó escrito `tests/integration/inventario/product-batch-write.int.test.ts:379`.

### Nota de entorno
El worktree no traía `node_modules`. Se corrió `pnpm install` + `prisma generate` + `next typegen` para poder ejecutar typecheck/lint/vitest. Son pasos de entorno; no hay cambios de código por ello y `package.json` no cambió (R33).
