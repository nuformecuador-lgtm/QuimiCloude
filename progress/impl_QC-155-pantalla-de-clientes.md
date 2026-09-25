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

## T1 — Constante, prefijo, ítem de menú, icono y alcance de `scope.test.ts`

### Archivos tocados

- `lib/shared/routes.ts`: `CUSTOMERS_ROUTE = '/clientes'` y fila en `PRIVATE_ROUTE_PREFIXES`.
- `lib/shared/navigation/private-nav.ts`: `CUSTOMERS_LABEL`, `'contact'` en `NavIconName`, ítem
  `nav-clientes` al final de `PRIVATE_NAV_ITEMS`, sección `NAV_SECTION_CHAIN`, permiso
  `clientes.consultar`.
- `lib/shared/navigation/nav-icons.ts`: fila `contact: Contact` (de `lucide-react`, ya instalado).
- `app/(private)/clientes/page.tsx` (nuevo): versión mínima, solo `requirePagePermission` y el
  título (`data-testid="clientes-title"`).
- `tests/unit/clientes/scope.test.ts`: sustituidos por su versión acotada los tres casos que
  QC-153/QC-154 dejaron en rojo a propósito (R26, R28, R38), con sus casos de sensibilidad. Los
  nombres conservan el `R<n>` de QC-153/154 y añaden `R37 (QC-155)`.
- `tests/unit/navegacion/private-layout-menu.test.tsx`: tensado con `nav-clientes` (ancla, casos
  de Administrador/Operador, caso "sin ningún permiso").
- `tests/unit/clientes-ui/private-nav-clientes.test.ts` (nuevo): forma del ítem, icono, filtrado
  con los tres roles del seed, `firstVisibleNavHref` sin cambios. El caso que lee el permiso de
  `page.tsx` queda `it.skip` hasta T6, como pide `tasks.md`.
- `tests/unit/clientes-ui/customers-route-contract.test.ts` (nuevo): R1, R2.
- Colateral, para tensar anclas anti-vacuidad que la nueva ruta/ítem rompían (fuera de la lista
  explícita de `design.md > 10`, pero con el mismo criterio de "se tensa, no se afloja"):
  `tests/unit/app-sidebar.test.tsx` (conteo y orden de `PRIVATE_NAV_ITEMS`) y
  `tests/unit/recetas-ui/recipe-route-contract.test.ts` (censo cerrado de exports de
  `lib/shared/routes.ts`).

### Mapa parcial R<n> → test

| Requisito | Test |
| --- | --- |
| R1 | `tests/unit/clientes-ui/customers-route-contract.test.ts` > "la ruta de clientes se declara una sola vez (R1)" |
| R2 | `tests/unit/clientes-ui/customers-route-contract.test.ts` > "el prefijo privado cubre la pantalla de clientes (R2)" |
| R4 | `tests/unit/clientes-ui/private-nav-clientes.test.ts` > "la navegacion privada lleva a clientes (R4)"; `tests/unit/navegacion/private-layout-menu.test.tsx` (ancla, casos Admin/Operador) |
| R6 (parte menú) | `tests/unit/clientes-ui/private-nav-clientes.test.ts` > "el item se oculta a quien no tiene el permiso (R4, R6)" |

R3, R5, R6 (parte pantalla) y el resto de R7–R42 quedan para las tandas siguientes (T2–T9), que
son las que construyen el resto de la pantalla.

### Salida real de los tests corridos

```
$ pnpm exec vitest run tests/unit/clientes/scope.test.ts
 Test Files  1 passed (1)
      Tests  25 passed (25)

$ pnpm exec vitest run tests/unit/navegacion/private-layout-menu.test.tsx
 Test Files  1 passed (1)
      Tests  12 passed (12)

$ pnpm exec vitest run tests/unit/clientes-ui/customers-route-contract.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)

$ pnpm exec vitest run tests/unit/clientes-ui/private-nav-clientes.test.ts
 Test Files  1 passed (1)
      Tests  12 passed | 1 skipped (13)

$ pnpm exec vitest run tests/guards/guard-nav-permisos-declarados.test.ts tests/guards/guard-pantallas-exigen-permiso.test.ts tests/guards/guard-rutas-privadas-cubiertas.test.ts
 Test Files  3 passed (3)
      Tests  23 passed (23)

$ pnpm exec vitest run tests/guards/guard-nav-serializable.test.ts tests/guards/guard-e2e-landing.test.ts
 Test Files  2 passed (2)
      Tests  19 passed (19)

$ pnpm exec vitest run tests/unit/app-sidebar.test.tsx tests/unit/recetas-ui/recipe-route-contract.test.ts
 Test Files  2 passed (2)
      Tests  42 passed (42)
```

Corrida conjunta final de los once archivos de arriba, tras las últimas tensadas:

```
$ pnpm exec vitest run tests/unit/clientes/scope.test.ts tests/unit/navegacion/private-layout-menu.test.tsx \
    tests/unit/clientes-ui/private-nav-clientes.test.ts tests/unit/clientes-ui/customers-route-contract.test.ts \
    tests/unit/app-sidebar.test.tsx tests/unit/recetas-ui/recipe-route-contract.test.ts \
    tests/guards/guard-nav-permisos-declarados.test.ts tests/guards/guard-pantallas-exigen-permiso.test.ts \
    tests/guards/guard-rutas-privadas-cubiertas.test.ts tests/guards/guard-nav-serializable.test.ts \
    tests/guards/guard-e2e-landing.test.ts
 Test Files  11 passed (11)
      Tests  141 passed | 1 skipped (142)
```

También se corrió `pnpm exec vitest related --run` sobre los tres archivos de `lib/shared/` y
`app/(private)/clientes/page.tsx`: arrastró 240 archivos / 3460 tests, con **3 rojos** —los tres
listados arriba en `app-sidebar.test.tsx` y `recipe-route-contract.test.ts`—, ya corregidos y
reverificados en verde. Nada más se puso rojo en esa corrida de 310 s.

`pnpm run typecheck`: verde (tras `pnpm exec next typegen`, necesario en un worktree recién
montado — `docs/worktrees.md > El gate`). `pnpm run lint`: verde, 0 errores (7 warnings
preexistentes en `tests/unit/documentos/confirm-catalog-import.test.ts` y
`tests/unit/pedidos/order-service.test.ts`, ajenos a este diff).

**No se corrió `pnpm test` ni `./init.sh` completo** (fuera del alcance de esta entrega, que es
T0+T1). `./init.sh` completo queda para el cierre de la ficha (T9).

### Archivos fuera de alcance

No se tocó `lib/modules/**`, `lib/composition/**`, `db/**`, `components/shared/**`,
`components/ui/**` ni `package.json`. No se tocó `feature_list.json` ni `progress/current.md`.
