# QC-153 — modelo-de-clientes · bitácora de implementación

## T0 — Preparación

- Base propia: `QuimiCloude_QC153`, creada con `CREATE DATABASE "QuimiCloude_QC153" TEMPLATE
  "qct_tpl_664cc76c19c8"` (plantilla ya migrada+sembrada de esta rama, 45 migraciones,
  reutilizada por `pnpm run db:test template`).
- `.env` del worktree apunta `DATABASE_URL`/`DIRECT_URL` a `QuimiCloude_QC153` (no se commitea).
- `pnpm run db:test status` con `DATABASE_URL`/`DIRECT_URL` exportadas a `QuimiCloude_QC153`:
  `✓ base de desarrollo «QuimiCloude_QC153» al dia: 45 migracion(es) aplicada(s)`.
- Última migración de `dev` (y de esta rama, que parte de `dev`):
  `20260923140000_product_batch_nullable_machine`, confirmado contra `origin/dev` (`git ls-tree`).
  Ramas en origin con migración posterior no mergeada: `feature/QC-141-...` termina en
  `20260923150200_reserve_existing_orders`; `feature/QC-158-...` termina en
  `20260923180000_supplier_catalog_line_material_and_measurements`. Ninguna aplicada a `dev`
  todavía. `<ts>` elegido para esta ficha: **`20260924120000`** (posterior a las tres).
- Catálogo de `PERMISSIONS` en `dev`/esta rama antes de la ficha (`lib/modules/identity/domain/permissions.ts`):
  **16 códigos**: `dashboard.consultar`, `inventario.consultar`, `inventario.modificar`,
  `recetas.consultar`, `recetas.modificar`, `unidades.consultar`, `unidades.modificar`,
  `proveedores.consultar`, `proveedores.modificar`, `pedidos.consultar`, `pedidos.modificar`,
  `usuarios.consultar`, `usuarios.modificar`, `asignaciones.consultar`, `asignaciones.modificar`,
  `terminados.consultar`.
  Administrador: los 16. Operador: 2 (`inventario.consultar`, `asignaciones.consultar`).
  Empacador: 2 (`asignaciones.consultar`, `terminados.consultar`). Total de asignaciones del
  seed: 20.
  Tras esta ficha (T4): **18** códigos (suma `clientes.consultar`, `clientes.modificar`),
  Administrador **18**, Operador y Empacador sin cambio, total de asignaciones **22**.
- `pnpm install` fue necesario (worktree recién montado, `node_modules` ausente). `pnpm approve-builds`
  en modo no interactivo escribió de más en `pnpm-workspace.yaml` (`ignoredBuiltDependencies`
  ampliado): se revirtió con `git checkout -- pnpm-workspace.yaml` y se corrió
  `pnpm exec prisma generate` directo, que generó el cliente sin problema.

## Verificación T0

```
pnpm run db:test template
  test-db: plantilla reutilizada: qct_tpl_664cc76c19c8 (las migraciones no han cambiado)
  ✓ plantilla de esta rama: qct_tpl_664cc76c19c8 (45 migraciones)

pnpm run db:test status  (DATABASE_URL/DIRECT_URL -> QuimiCloude_QC153)
  ✓ base de desarrollo «QuimiCloude_QC153» al dia: 45 migracion(es) aplicada(s)
```
