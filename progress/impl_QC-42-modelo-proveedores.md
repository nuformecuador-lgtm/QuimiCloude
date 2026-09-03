# QC-42 — modelo-proveedores · progreso de implementación

> Estado a medida que se cierra cada bloque. La tabla `R<n> -> test` final y el cierre
> de las preguntas abiertas se completan en T14, tras el merge con `dev` (T13).

## Auditoría del commit `b60236f` (sin auditar, dejado por un implementer anterior)

Verificado línea por línea contra `design.md` antes de tocar nada más:

- `db/schema.prisma` — `model Supplier` y `model SupplierCatalogLine`: campos, tipos,
  las tres FK escalares sin `@relation`, comentarios "OJO" completos. Coincide con
  `design.md > 2`. Sin defectos.
- `db/migrations/20260903131417_suppliers_and_supplier_catalog_lines/migration.sql`:
  las tres FK a mano con `RESTRICT`, el `CASCADE` proveedor→línea, el índice único
  **parcial** `suppliers_name_unique`, los cuatro `CHECK`, los cuatro `ALTER` de RLS,
  orden del UP. Coincide con `design.md > 4`. Sin defectos.
- `down.sql`: exactamente dos `DROP TABLE` en orden inverso, no toca `pgcrypto`.
  Coincide con `design.md > 4.7`. Sin defectos.
- `lib/modules/proveedores/`: armazón completo (`index.ts`, `domain/supplier-name.ts`,
  `ports/.gitkeep`, `adapters/driven|driving/.gitkeep`). Coincide con `design.md > 5.1`.
  Sin defectos.
- `tests/unit/proveedores/domain/supplier-name.test.ts`: cubre R8 (acentos,
  mayúsculas, signos, vacío, idempotencia, distinción). Sin defectos.

**Ningún defecto encontrado.** T0 (inventario del terreno ya montado) verificado con
`pnpm exec prisma validate` sin error de variable de entorno. T5 (`lib/composition/`
sin tocar) confirmado por diff vacío contra `origin/dev`.

## T10 — ciclo real apply → rollback → apply

**1. `pnpm run db:migrate` (aplicación 1)**
```
Applying migration `20260903131417_suppliers_and_supplier_catalog_lines`
All migrations have been successfully applied.
```

**2. Verificación SQL directa contra `pg_tables`, `pg_constraint`, `pg_indexes`, `pg_class`:**

- Tablas: `suppliers`, `supplier_catalog_lines` — ambas existen.
- FK (4/4, `pg_constraint`):
  - `supplier_catalog_lines_product_id_fkey` → `products`, `confdeltype='r'` (RESTRICT)
  - `supplier_catalog_lines_supplier_id_fkey` → `suppliers`, `confdeltype='c'` (CASCADE)
  - `suppliers_created_by_fkey` → `users`, `confdeltype='r'` (RESTRICT)
  - `suppliers_updated_by_fkey` → `users`, `confdeltype='r'` (RESTRICT)
- CHECK (4/4, `pg_constraint contype='c'`):
  - `supplier_catalog_lines_cost_non_negative`: `CHECK ((cost >= (0)::numeric))`
  - `supplier_catalog_lines_delivery_time_non_negative`: `CHECK ((delivery_time >= 0))`
  - `supplier_catalog_lines_min_purchase_non_negative`: `CHECK ((min_purchase >= (0)::numeric))`
  - `suppliers_contact_required`: `CHECK (((phone IS NOT NULL) OR (email IS NOT NULL)))`
- Índice único parcial: `suppliers_name_unique` → `... USING btree (name_normalized)
  WHERE (deleted_at IS NULL)` — confirmado el `WHERE`.
- RLS: ambas tablas con `relrowsecurity=true` y `relforcerowsecurity=true`.

**3. `pnpm run db:rollback`**
```
db:rollback: aplicando down.sql de 20260903131417_suppliers_and_supplier_catalog_lines y borrando su fila de _prisma_migrations
db:rollback: 20260903131417_suppliers_and_supplier_catalog_lines revertida.
```

**4. Verificación post-rollback:**
- `suppliers` y `supplier_catalog_lines`: ya no existen.
- Tablas de `identity`/`inventario`/`recetas` intactas: `document_types`,
  `presentations`, `products`, `recipe_lines`, `recipes`, `roles`, `users` — las 7
  presentes.
- `products` conserva sus 9 constraints (`products_pkey`,
  `products_cost_non_negative`, `products_created_by_fkey`,
  `products_min_purchase_non_negative`, `products_presentation_id_fkey`,
  `products_qty_alert_non_negative`, `products_stock_non_negative`,
  `products_unit_id_fkey`, `products_updated_by_fkey`) — nada relacionado con
  proveedores.
- `_prisma_migrations`: sin fila de `suppliers_and_supplier_catalog_lines` tras el
  rollback.

**5. `pnpm run db:migrate` (aplicación 2)** — misma salida exitosa que el paso 1.

**Hallazgo de terreno compartido (no bloqueante para QC-42, anotado para T13):** la
base física de este worktree (Postgres compartido entre worktrees) ya tiene
`products.unit_id` (FK `products_unit_id_fkey`) en vez de `products.unit`, que es lo
que trae la migración de **QC-32** (`in_progress`, ver `design.md > 10` y el aviso de
terreno compartido en la cabecera de `tasks.md`). Confirma exactamente el riesgo que
el diseño anticipó: cuando llegue T13 (sincronizar con `dev`), hay que repetir T10
completo después del merge, no antes.

## T11 — tests de integración contra Postgres real

`tests/integration/proveedores/proveedores-constraints.int.test.ts` — 25 tests, cada
uno dentro de `prisma.$transaction` con `ROLLBACK` de aislamiento; toda operación que
se espera que falle usa `SAVEPOINT` + `$executeRaw` y se afirma sobre el SQLSTATE, no
sobre el texto del error. Ver el archivo para el detalle caso por caso.

Gate corrido por el subagente que lo implementó:
```
pnpm run typecheck   → sin errores
pnpm run lint        → sin errores
pnpm exec vitest run tests/integration/proveedores/proveedores-constraints.int.test.ts
  Test Files  1 passed (1)
  Tests  25 passed (25)
pnpm exec vitest run guard
  Test Files  12 passed (12)
  Tests  123 passed (123)
```

## Estado de tasks

T0–T11 cerradas. Pendientes: T12 (confirmar sin dependencia nueva), T13 (sincronizar
con `dev`, la corre el leader), T14 (mapa R→test final, tras el merge).
