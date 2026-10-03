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
