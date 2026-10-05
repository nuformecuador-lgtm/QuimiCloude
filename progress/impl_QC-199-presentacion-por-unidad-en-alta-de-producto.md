# QC-199 — presentacion-por-unidad-en-alta-de-producto · bitácora de implementación

## T0 — lotes con unidad de presentación distinta de la del producto

- Fecha: 2026-10-05.
- Base: `QuimiCloude` (la de `.env` del worktree; 55 filas en `product_batches`).
- Consulta: la de `design.md > 9`, literal.
- Resultado: **0 filas**. Se sigue con T6 y T7.
- Nota: esa base va 1 migración atrás (`20261004150000_execution_permission`, ajena a esta ficha);
  no afecta a la consulta (no toca `products`, `product_batches` ni `presentations`).

## Contrato

Commit `b24050e4` "feat(QC-199): contrato de servicios para el alta por unidad".

| Pieza | archivo:línea |
|---|---|
| Esquema de unidad (`'Elige una unidad.'`) | `lib/modules/inventario/domain/product-input.ts:94` |
| Rama PRODUCT (`unitId` obligatorio, `presentationId` = clave desconocida) | `product-input.ts:197` |
| Rama PACKAGING con su `presentationId` | `product-input.ts:234` |
| `createProductSchema` / `CreateProductInput` | `product-input.ts:293` / `:296` |
| `CreateProductFormState` (sin cambios) | `lib/modules/inventario/adapters/driving/product-actions.ts:18` |
| `createProductAction(prevState, formData)` (firma sin cambios; PRODUCT lee `unitId`) | `product-actions.ts:179` (lectura `:149`/`:151`) |
| `UnitCatalog.listVisibleRefs(companyId): Promise<readonly UnitRef[]>` | `lib/modules/unidades/domain/unit-catalog.ts:53` |
| Adaptador `listVisibleUnitRefs` (implementado) | `lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts:63` |
| `ListProductFormUnitsDeps` / `ListProductFormUnits` / `createListProductFormUnits` | `lib/modules/inventario/domain/list-product-form-units.ts:8` / `:12` / `:18` |
| `listProductFormUnitsAction(): Promise<ProductFormUnitsResult>` | `product-actions.ts:278` |
| `ProductFormUnitsResult = { status:'success'; data: ProductFormUnits } \| ErrorState` | `product-actions.ts:40` |
| Prop `formUnits`: `ProductFormUnits = readonly UnitRef[]` | `list-product-form-units.ts:6`, reexport `lib/modules/inventario/index.ts:89` |
| Cableado | `lib/composition/index.ts:900`, `:946` |

Imports para la UI: `import type { ProductFormUnits } from '@/lib/modules/inventario'`;
`import { listProductFormUnitsAction } from '@/lib/modules/inventario/adapters/driving/product-actions'`.

Estado transitorio tras el contrato: `create-product.ts:112` lanza `Error` de cableado en el alta de
insumo hasta T8. 25 dobles de `UnitCatalog` en tests ganaron `listVisibleRefs` (sin cambiar aserciones).
Rojos previstos hasta T4/T8/T9/T10: product-input (9), product-actions (5), create-product (33),
authorization (5), company-isolation-service (6), product-service (2), product-page (17),
envase-en-inventario (1); integración product-batch-lot (2), review-blocked-orders (3).
Rojos que ya estaban en HEAD antes del contrato: configuracion-ui/unidades-viewport (2),
configuracion-ui/usuarios-viewport (2), navegacion/pantallas-exigen-permiso (1),
recetas-ui/recipe-page (1), recetas/module-contract (1).
