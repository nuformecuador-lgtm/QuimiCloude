# QC-155 — pantalla-de-clientes · bitácora de implementación

## T0 — Verificar la base heredada y preparar la base propia

**Verificación de lo que `design.md > 0` da por hecho** (todo confirmado, sin discrepancias):

- Las cinco Server Actions y sus tipos existen en
  `lib/modules/clientes/adapters/driving/customer-actions.ts`:
  `createCustomerAction`, `updateCustomerAction`, `deleteCustomerAction`, `getCustomerAction`,
  `listCustomersAction`, con `CreateCustomerFormState`, `CustomerMutationFormState`,
  `CustomerQueryResult`, `CustomerListResult`.
- `CUSTOMER_QUERYABLE` y `createCustomerSchema`/`updateCustomerSchema` se publican en el barrel
  `lib/modules/clientes/index.ts`, junto con las seis constantes de largo y `CustomerView`.
- Las primitivas `sheet.tsx`, `alert-dialog.tsx` y `sonner.tsx` ya están en `components/ui/`.
- `loginAndLand` existe en `e2e/helpers/landing.ts`.

**Base de datos propia `QuimiCloude_QC155`:**

1. Creada con `CREATE DATABASE "QuimiCloude_QC155"` (no existía).
2. `pnpm install` + `pnpm exec prisma generate`: el worktree se montó sin `node_modules`
   (`docs/worktrees.md`), así que hubo que instalar antes de poder ejecutar `prisma`.
3. `db:migrate` con `DATABASE_URL`/`DIRECT_URL` sobrescritas en el entorno del comando a
   `postgresql://postgres:xerxes@localhost:5432/QuimiCloude_QC155?schema=public`:

   ```
   ...
   20260924190100_finished_products_and_content_copies/
   20260924200000_customers_search_normalized/
   All migrations have been successfully applied.
   ```

4. `db:seed`, mismas variables:

   ```
   db:seed: roles creados: 2 (Administrador, Operador) - permisos creados: 11 (dashboard.consultar,
   inventario.consultar, inventario.modificar, recetas.consultar, recetas.modificar,
   unidades.consultar, unidades.modificar, proveedores.consultar, proveedores.modificar,
   pedidos.consultar, pedidos.modificar) - asignaciones permiso-rol creadas: 22 - empresa inicial:
   creada (QuimiCloud) - usuario inicial: creado
   ```

   El rol Empacador y `terminados.consultar` no salen en este resumen porque los inserta la
   migración de datos `20260922120000_packer_role` (no el seed): se comprobó por consulta directa
   que la base queda con los tres roles (`Administrador`, `Empacador`, `Operador`) y que
   `clientes.consultar`/`clientes.modificar` existen y están asignados **solo** al Administrador:

   ```
   roles: [ 'Administrador', 'Empacador', 'Operador' ]
   clientes perms: [ 'clientes.consultar', 'clientes.modificar' ]
   role-permission clientes: [
     { name: 'Administrador', permission_code: 'clientes.consultar' },
     { name: 'Administrador', permission_code: 'clientes.modificar' }
   ]
   ```

**Sin discrepancias que reportar.** No se tocó `lib/modules/**`, `lib/composition/**`, `db/**`,
`components/shared/**`, `components/ui/**` ni `package.json`.
