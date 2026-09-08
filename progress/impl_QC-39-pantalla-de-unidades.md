# QC-39 — pantalla-de-unidades · bitácora de implementación

> Worktree: `.worktrees/QC-39-pantalla-de-unidades`, rama `feature/QC-39-pantalla-de-unidades`,
> base `origin/dev` en `516e9c0`. Spec: `specs/QC-39-pantalla-de-unidades/`.

## T0 — Inventario de lo heredado (verificado en el worktree, no supuesto)

Comprobado con `ls`/`test -f` sobre el worktree antes de escribir una línea de código:

| Pieza heredada | Evidencia en el worktree |
| --- | --- |
| Layout privado con `<main>` y `<Toaster />` | `app/(private)/layout.tsx` |
| `AppSidebar`, `PRIVATE_NAV_ITEMS` con la sección Configuración ya creada, `filterNavItemsByPermissions` | `lib/shared/navigation/private-nav.ts` |
| `requirePagePermission` | `lib/shared/auth/require-page-permission.ts` |
| Tabla compartida con `cell: (row) => ReactNode` | `components/shared/data-table/index.ts` |
| Primitivas shadcn/ui | `components/ui/`: `table`, `sheet`, `alert-dialog`, `select`, `input`, `label`, `button`, `sonner`, `skeleton` — **todas presentes, ningún `shadcn add`** |
| Las tres Server Actions de escritura + `listUnitsAction` | `lib/modules/unidades/adapters/driving/unit-actions.ts` |
| `UNIT_QUERYABLE`, `isUnitPage` | `lib/modules/unidades/domain/unit-queryable.ts`, `lib/modules/unidades/index.ts` |
| Helper de viewport | `tests/helpers/viewport.ts` |
| Playwright | `playwright.config.ts`, `e2e/` |
| Pantalla hermana de referencia (QC-45) | `app/(private)/configuracion/presentaciones/**`, `tests/unit/configuracion-ui/**` |

### Archivos de `lib/modules/unidades/` que esta ficha PUEDE tocar (los seis de `design.md > 1`)

1. `domain/unit-view.ts` — **NUEVO**
2. `domain/list-units.ts` — solo tipos de retorno
3. `ports/unit-repository.ts` — solo tipos de retorno
4. `adapters/driven/persistence/unit-prisma.ts` — `UNIT_SELECT` + `toUnitView`
5. `index.ts` — publica `type UnitView`
6. `adapters/driving/unit-actions.ts` — `listUnitsAction` acepta la consulta

### Archivos que esta ficha NO toca (y que un test de intactitud vigila)

`unit-catalog-prisma.ts`, `create-unit.ts`, `update-unit.ts`, `delete-unit.ts`, `unit-input.ts`,
`errors.ts`, `actor.ts`, `unit-queryable.ts`, `convert-quantity.ts`, `db/schema.prisma`,
`components/shared/data-table/**`, `components/ui/**`, `app/(private)/layout.tsx`, `AppSidebar`,
`app/(private)/produccion/**`, `app/(private)/proveedores/**`.

**Estado al cerrar T0:** ninguno de esos archivos creado ni modificado.

## Bloqueos y desvíos (se anotan aquí, no se improvisan)

- **`tests/helpers/user-event.ts` NO existe en este worktree.** El leader exige usar `setupUser()`
  de ese helper en todo test de interfaz (QC-58 lo está introduciendo en `dev`) y prohíbe
  improvisarlo o copiarlo. Consecuencia: **la implementación se detiene antes del primer test de
  UI**; T1 y T2 (contrato de lectura, sin DOM interactivo) sí se ejecutan.
- **La tarea de tensar `tests/unit/app-sidebar.test.tsx` y `tests/unit/navegacion/private-layout-menu.test.tsx`
  (T4, cuarto bullet) queda DIFERIDA al final por orden del leader**: esos dos archivos son
  intersección con QC-58, que sigue `in_progress`. R9 y R10 quedan cubiertos entretanto por
  `tests/unit/configuracion-ui/private-nav-unidades.test.ts`, que es archivo nuevo.
- **Ordenación forzada por las guardias:** `guard-rutas-privadas-cubiertas` exige la
  correspondencia en **los dos sentidos** («ningun prefijo puede sobrar»). Por tanto la entrada de
  `UNITS_ROUTE` en `PRIVATE_ROUTE_PREFIXES` (T3) y `page.tsx` (T8) tienen que aterrizar en la
  **misma tanda**; no pueden separarse sin dejar el gate en rojo a mitad.

## Tanda 1 — Bloque 1: el contrato de lectura (T1, T2)

Delegada en `backend_dev`. Commits: `16edbab` (T1), `ce75b2e` (T2).

### Archivos de producto tocados (los seis autorizados, ni uno más)

- `lib/modules/unidades/domain/unit-view.ts` — **NUEVO**: `UnitView = UnitRef & { baseUnitId, factor: string | null, isSystem }`
- `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts` — `UNIT_SELECT` + `toUnitView`
- `lib/modules/unidades/ports/unit-repository.ts` — solo tipos de retorno
- `lib/modules/unidades/domain/list-units.ts` — solo tipos de retorno
- `lib/modules/unidades/index.ts` — publica `type UnitView`
- `lib/modules/unidades/adapters/driving/unit-actions.ts` — `listUnitsAction` sobrecargada

**Las sobrecargas de `design.md > 3` compilan: NO hizo falta el plan B** (`listUnitsPageAction`).

### Tests nuevos

- `tests/unit/unidades/unit-view-projection.test.ts` (R1, R2)
- `tests/unit/unidades/modulo-intacto.test.ts` (R3, R6, R47)
- `tests/unit/unidades/list-units-action.test.ts` (R5)
- `tests/unit/unidades/consumidores-catalogo.test.tsx` (R4)

### Tests heredados tocados, y por qué

Solo **ensanche de fixtures** por el cambio de tipo `UnitRef` → `UnitView`; **ningún aserto se
relajó** y ninguno cambió de exigencia: `tests/unit/unidades/list-units.test.ts`,
`list-units-query.test.ts`, `tests/unit/recetas-ui/recipe-form.test.tsx`,
`tests/unit/pedidos-ui/pedidos-viewport.test.tsx`, `tests/unit/proveedores-ui/{catalog-line-sheet,
delete-catalog-line-dialog,supplier-detail-page}.test.tsx`.
`tests/unit/unidades/module-contract.test.ts` se **tensó**: deduplica el barrido de funciones
exportadas para que las sobrecargas no cuenten tres veces; el conjunto exacto de cuatro actions
sigue siendo el mismo aserto.
**Ningún archivo de `app/` fue tocado** (R4 se cumple por tipos, no por edición).

### Verificación de la tanda (corrida por el implementer, en el worktree)

Antes hubo que **preparar el worktree**, que venía sin dependencias instaladas: `pnpm install
--frozen-lockfile` y `pnpm exec prisma generate` (el `postinstall` de Prisma queda como *ignored
build script* en un worktree recién montado, y sin el cliente generado `pnpm typecheck` sale rojo
con ~20 `TS2305: '@prisma/client' has no exported member 'Prisma'` que **no son de esta feature**).

```
$ pnpm typecheck
> tsc --noEmit
(sin salida — verde)

$ pnpm lint
> eslint
(sin salida — verde)

$ pnpm exec vitest run tests/unit/unidades tests/unit/recetas-ui tests/unit/proveedores-ui tests/unit/pedidos-ui
 Test Files  59 passed (59)
      Tests  779 passed | 7 skipped (786)
   Duration  82.31s
```

El gate (`./init.sh --rapido`) lo corre el leader; el implementer no se autoaprueba.

## Estado al cerrar la tanda 1

- **Hechas:** T0, T1, T2.
- **Pendientes:** T3 a T15.
- **Parada obligada:** falta `tests/helpers/user-event.ts` (ver «Bloqueos y desvíos»). El Bloque 2
  en adelante es todo pantalla, y su primer test de UI no se puede escribir sin el helper.
