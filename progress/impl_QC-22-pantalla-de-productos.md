# QC-22 — pantalla-de-productos · bitácora de implementación

> Worktree: `.worktrees/QC-22-pantalla-de-productos/` · Rama `feature/QC-22-pantalla-de-productos`
> Spec aprobado por el humano el 2026-09-03 (F1.4). P2 **resuelta: no entra ninguna dependencia nueva.**

## T0 — Verificación de la base heredada (los ocho puntos)

| # | Punto | Evidencia comprobada en el worktree |
| --- | --- | --- |
| 1 | Layout privado con `SidebarProvider` + `SidebarInset`, y `SidebarInset` **es** el `<main>` | `app/(private)/layout.tsx` lo monta y su comentario lo dice explícitamente («`SidebarInset` **es** el `<main>` … aquí no se anida otro»). **No se crea otro layout ni otro `main`.** |
| 2 | `components/private/app-sidebar.tsx` y `lib/shared/navigation/private-nav.ts` con `PRIVATE_NAV_ITEMS`, `BRAND_LABEL` e `INVENTORY_ROUTE` | `private-nav.ts` declara `INVENTORY_ROUTE = '/inventario'`, `BRAND_LABEL`, `PRIVATE_NAV_ITEMS` (el ítem `nav-inventario` ya apunta a la constante). **El sidebar no se re-crea.** |
| 3 | Base de shadcn/ui | `components.json` y `lib/utils.ts` presentes. `components/ui/`: `avatar, badge, button, card, collapsible, dropdown-menu, input, label, separator, sheet, sidebar, skeleton, sonner, tooltip`. **`sheet` y `sonner` YA EXISTEN: no se vuelven a añadir.** Ausentes: `table`, `select`, `alert-dialog` (los añade T2). |
| 4 | Vitest configurado y helper de viewport | `vitest.config.mts` y `tests/helpers/viewport.ts` presentes. **No se monta Vitest.** |
| 5 | Playwright montado | `playwright.config.ts` y `e2e/` con 4 specs (`login`, `login-skin`, `session`, `theme`). **No se monta Playwright.** |
| 6 | Contrato público de `inventario` y las Server Actions | `lib/modules/inventario/index.ts` (solo reexporta de `./domain`); `adapters/driving/product-actions.ts` y `presentation-actions.ts` con `CreateProductFormState`, `ProductMutationFormState`, `ProductListResult`. **El backend no se toca ni se amplía.** |
| 7 | `pagination.ts`, `routes.ts`, `route-role-rules.ts` | `DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 25`, `toOffsetLimit` acota; `PRIVATE_ROUTE_PREFIXES = ['/dashboard']`; `ROUTE_ROLE_RULES = []` (vacío a propósito, con el encargo escrito de que la primera regla es esta pantalla). |
| 8 | **NO existe `app/(private)/inventario/`** | `ls app/(private)/` → `components`, `dashboard`, `layout.tsx`. Confirmado: la carpeta no existe. |

**Resultado: los ocho puntos verdes.** Nada que re-crear; solo la pantalla.

## T1 — Contrato consumido (anotado, no supuesto)

### (a) Firma exacta de las seis actions que se usan

```
// lib/modules/inventario/adapters/driving/product-actions.ts  ('use server')
createProductAction(prevState: CreateProductFormState, formData: FormData): Promise<CreateProductFormState>
updateProductAction(id: string, prevState: ProductMutationFormState, formData: FormData): Promise<ProductMutationFormState>
deleteProductAction(prevState: ProductMutationFormState, formData: FormData): Promise<ProductMutationFormState>   // `id` en campo oculto
listProductsAction(query: unknown): Promise<ProductListResult>

// lib/modules/inventario/adapters/driving/presentation-actions.ts  ('use server')
createPresentationAction(prevState: CreatePresentationFormState, formData: FormData): Promise<CreatePresentationFormState>
listPresentationsAction(query: unknown): Promise<PresentationListResult>
```

Estados: `{ status: 'idle' } | { status: 'success'; id } | { status: 'error'; code; message }` para las altas;
sin `id` en `success` para edición y borrado. `ProductListResult` = `{ status: 'success'; data: Page<ProductView> } | { status:'error'; code; message }`.

`updateProductAction` se consume con `.bind(null, id)` para encajar en `useActionState`.

### (b) No exportan `INITIAL_STATE`

Confirmado por lectura: `product-actions.ts` deja el comentario de por qué («un archivo con `'use server'` solo
puede exportar funciones async»). El consumidor construye el literal `{ status: 'idle' }` **tipado** con el tipo
exportado. Esta feature lo hace así; no añade ningún archivo al módulo.

### (c) Ninguna llama a `revalidatePath`/`revalidateTag`

Confirmado por lectura de los dos archivos de `adapters/driving/`. Por tanto el refresco tras mutar es de la
pantalla: `router.refresh()` (`design.md > 4.4`). QC-20 está `done` y **no se toca** (`design.md > 10.G`).

### (d) Campos de `ProductView` y cuáles quedan fuera de la tabla

`ProductView`: `id, name, presentationId, presentationName, stock, cost, minPurchase, deliveryTime, qtyAlert,
unit, createdAt, updatedAt, createdBy, updatedBy`.

**Fuera de la tabla (R7):** `id`, `presentationId`, `createdBy`, `updatedBy`. Las diez columnas de negocio son
`name, presentationName, stock, unit, cost, minPurchase, deliveryTime, qtyAlert, createdAt, updatedAt`.
`cost` es **cadena decimal** (`string | null`) y se pinta tal cual (R8): nada de `Number(...)` ni `parseFloat`.

**Nada difiere de `design.md > 0`.** No hay que parar.
