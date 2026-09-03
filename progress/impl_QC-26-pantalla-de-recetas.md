# QC-26 — pantalla-de-recetas · bitacora de implementacion

Worktree: `.worktrees/QC-26-pantalla-de-recetas/` · rama `feature/QC-26-pantalla-de-recetas`.
Base de datos propia: `QuimiCloude_QC26` (las siete migraciones aplicadas; no se apunta a
`QuimiCloude` a secas).

Se escribe **sobre la marcha**, no al final.

---

## T0 — Verificacion de la base heredada (evidencia, uno por uno)

| # | Punto | Evidencia verificada |
| --- | --- | --- |
| 1 | Layout privado con `SidebarProvider` + `SidebarInset` (que **es** el `<main>`) y `<Toaster richColors />` ya montado | `app/(private)/layout.tsx:6,7,55,65,102` — comentario en `:61` confirma que `SidebarInset` renderiza el `main`. **No se monta otro Toaster.** |
| 2 | `components/private/app-sidebar.tsx` y `lib/shared/navigation/private-nav.ts` con `PRIVATE_NAV_ITEMS`, `BRAND_LABEL` y `FORMULAS_ROUTE` placeholder | `private-nav.ts:37` (`FORMULAS_ROUTE = '/produccion/formulas'`), `:44` (`BRAND_LABEL`), `:119` (`PRIVATE_NAV_ITEMS`), `:177` (item «Formulas» -> `FORMULAS_ROUTE`) |
| 3 | Primitivas shadcn/ui presentes | `components/ui/`: table, select, alert-dialog, sheet, sonner, button, input, label, skeleton, card, separator, tooltip, dropdown-menu (+ avatar, badge, collapsible, sidebar). **Ninguna se re-anade.** |
| 4 | Vitest + helper de viewport + Playwright | `vitest.config.mts`, `tests/helpers/viewport.ts`, `e2e/{session,inventario,login,login-skin,theme}.spec.ts` |
| 5 | Contrato publico de `recetas` y sus cinco Server Actions | `lib/modules/recetas/index.ts`; `adapters/driving/recipe-actions.ts` con `CreateRecipeFormState`, `UpdateRecipeFormState`, `DeleteRecipeFormState`, `RecipeQueryResult`, `RecipeListResult`. **No se toca.** |
| 6 | Contrato de `inventario` y `listProductsAction` | `lib/modules/inventario/adapters/driving/product-actions.ts:243`; `ProductListResult` (`Page<ProductView>`) en `:65` |
| 7 | `lib/shared/pagination.ts`, `lib/shared/routes.ts` (`PRIVATE_ROUTE_PREFIXES`) y `ROUTE_ROLE_RULES` con **una** fila | `pagination.ts` (`DEFAULT_PAGE_SIZE=10`, `MAX_PAGE_SIZE=25`); `routes.ts:28` (`[DASHBOARD_ROUTE, INVENTORY_ROUTE]`); `lib/composition/route-role-rules.ts` (1 fila: `INVENTORY_ROUTE`) |
| 8 | `lib/modules/unidades/` con `domain/unit-name.ts`, `domain/unit-catalog.ts`, `adapters/driven/persistence/unit-catalog-prisma.ts` y **sin ningun adaptador driving** | `find lib/modules/unidades -type f`: solo esos tres + `index.ts` + tres `.gitkeep` (`adapters/driving/.gitkeep` **vacio**) |
| 9 | **NO existe `app/(private)/produccion/`** | `ls app/(private)/` -> `components/`, `dashboard/`, `inventario/`, `layout.tsx`. Confirmado. |

**Los nueve puntos verificados. No hay motivo de parada.**

## T1 — Contrato que se consume (anotado antes de escribir codigo de datos)

**(a) Firmas exactas de las siete operaciones**

```ts
// lib/modules/recetas/adapters/driving/recipe-actions.ts  ('use server')
listRecipesAction(query: unknown): Promise<RecipeListResult>            // Page<RecipeSummary>
getRecipeAction(id: string): Promise<RecipeQueryResult>                 // RecipeDetail
createRecipeAction(input: unknown): Promise<CreateRecipeFormState>      // { status:'success'; id }
updateRecipeAction(id: string, input: unknown): Promise<UpdateRecipeFormState>
deleteRecipeAction(id: string): Promise<DeleteRecipeFormState>
// lib/modules/inventario/adapters/driving/product-actions.ts ('use server')
listProductsAction(query: unknown): Promise<ProductListResult>          // Page<ProductView>
// lib/modules/unidades/adapters/driving/unit-actions.ts  <- LA ANADE ESTA FICHA (T5)
listUnitsAction(): Promise<UnitListResult>
```

**(b)** `createRecipeAction` y `updateRecipeAction` **reciben un objeto tipado (`unknown` validado
con zod), NO `FormData`, y NO toman `prevState`**. Por eso el formulario **no usa
`useActionState`** (`design.md > 5`, alternativa B descartada): es el contrato quien lo impide, no
el gusto. Ninguna exporta `INITIAL_STATE` (un archivo `'use server'` solo puede exportar funciones
async).

**(c)** Ninguna de las cinco llama a `revalidatePath` (verificado por `grep`): el refresco tras
mutar es responsabilidad de la pantalla — `router.refresh()` (R24, `design.md > 4.4`). Deuda
anotada: `revalidatePath` en las actions seria mas barato, pero es ficha de backend (R44 prohibe
abrir `lib/modules/recetas/**`).

**(d) Campos.** `RecipeSummary`: `id`, `name`, `description|null`, `imageUrl|null`, `stepCount`,
`createdAt`, `updatedAt`, `createdBy|null`, `updatedBy|null`. **Quedan fuera de la lista** `id`,
`createdBy` y `updatedBy` (R9). `RecipeDetail = RecipeSummary & { steps: readonly string[]; lines:
readonly RecipeLineView[] }`, con `RecipeLineView = { id, productId, productName: string|null,
quantity: string, unitId }` — `productName === null` es el **unico** discriminante de «producto
dado de baja» (R53, R54), y `quantity` **es cadena** (R29).

**(e) Estados de `image`.** `updateRecipeSchema`: `recipeImageUploadSchema.nullable().optional()`
-> **tres** estados (omitido / `{bytes}` / `null` explicito), y el esquema **no usa `.default()`**
justamente para no colapsar `undefined` con `null`. `createRecipeSchema`:
`recipeImageUploadSchema.optional()` -> **dos** estados (ausente / `{bytes}`); **`null` no se
admite en el alta** (R36). `image` entra como `{ bytes: Uint8Array }` (`z.instanceof(Uint8Array)`).

Nada difiere de `design.md > 0`. No hay motivo de parada.

## T2 — Dependencia aprobada instalada

`pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` -> `@dnd-kit/core 6.3.1`,
`@dnd-kit/sortable 10.0.0`, `@dnd-kit/utilities 3.2.2`. **Diff de `package.json`: exactamente esas
tres lineas y nada mas** (verificado con `diff` contra la copia previa). Cero paquetes adicionales.

**Ajuste necesario en `docs/dependencias.md`:** la fila que dejo escrita el leader agrupaba los
tres paquetes en **una sola celda** (`` `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` ``)
y `guard-dependencias-aprobadas.test.ts` solo acepta una primera celda con **un** nombre entre
backticks (`/^`([^`]+)`$/`), asi que los tres paquetes contaban como **no registrados** y el gate
quedaba rojo. Se dividio en **tres filas**, una por paquete, cada una conservando integro lo que
`docs/dependencias.md > Estados` exige para una `excepcion`: **que check fallo** (el 2, con la
fecha de ultima publicacion propia de cada paquete: core y sortable 2024-12-05, utilities
2023-11-06), los otros tres checks que pasan, **por que se acepto igual** (decision humana del
2026-09-03, alternativa `@atlaskit/pragmatic-drag-and-drop` ofrecida y descartada) y la
**condicion de la aprobacion**: el reordenado tambien con TECLADO. No se cambio ninguna decision:
solo el formato de la tabla, para que el acta sea legible por su guardia.

Salida: `pnpm run test:guardias` -> **12 archivos, 123 tests, todos en verde**.
