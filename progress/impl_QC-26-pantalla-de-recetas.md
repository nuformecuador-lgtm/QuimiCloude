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

## T3 — Ruta, prefijo y segunda regla ruta->rol

Archivos: `lib/shared/routes.ts`, `lib/shared/navigation/private-nav.ts`,
`lib/composition/route-role-rules.ts` (los tres que R51 autoriza; ninguno mas).

- `FORMULAS_ROUTE` **mudada** a `routes.ts` con el comentario que explica el porque, copiado del
  patron de `INVENTORY_ROUTE`. `private-nav.ts` la importa y la **reexporta por compatibilidad**;
  ya no la declara.
- `NEW_RECIPE_ROUTE` y `recipeEditRoute(id)` derivadas de la constante.
- `PRIVATE_ROUTE_PREFIXES = [DASHBOARD_ROUTE, INVENTORY_ROUTE, FORMULAS_ROUTE]`.
- `ROUTE_ROLE_RULES` gana su **segunda** fila `{ prefix: FORMULAS_ROUTE, roles: [ADMIN_ROLE_NAME] }`,
  reutilizando el import de `ADMIN_ROLE_NAME` que el archivo ya tenia. **La fila de
  `INVENTORY_ROUTE` se conserva**: se anade, no se sustituye. El archivo sigue cargando en el
  borde: no entro ningun import nuevo salvo la constante de `lib/shared/routes`.
- `RECIPES_LABEL = 'Recetas'` exportada; el item del sidebar la usa y su `testId` pasa a
  `nav-produccion-recetas`. Ya no dice «Formulas».

Salida: `pnpm run typecheck` limpio; `pnpm run lint` 0 errores (3 warnings preexistentes en
`lib/composition/index.ts`, ajenos). `pnpm exec vitest related --run` sobre los tres archivos ->
**264 passed, 2 failed**, ambos **esperados y anticipados por el propio `tasks.md > T3`**:

1. `tests/guards/guard-rutas-privadas-cubiertas.test.ts` — el prefijo nuevo todavia no tiene
   `page.tsx`. **Lo cierra T12**; `tasks.md > T3` dice literalmente que T3 y T12 cierran la misma
   tanda.
2. `tests/unit/identity/route-role-rules.test.ts` — afirmaba «exactamente una» fila. **Lo cierra
   T23**, que es la task que la spec encarga para ampliar ese archivo.

`grep`: el literal `'/produccion/formulas'` solo existe en `lib/shared/routes.ts`.

## T4-T7 — La lectura del catalogo de unidades (backend, decision cerrada D4)

**Alcance respetado: SOLO LECTURA.** Cero operaciones de creacion, edicion o borrado de unidades
(son de QC-38, R44). `unit-catalog-prisma.ts` **no se toco**. `db/` **sin un solo cambio**:
cero migraciones, cero columnas, cero indices.

Archivos creados:
- `lib/modules/unidades/domain/actor.ts` — `ADMIN_ROLE_NAME`, `Actor`, `requireAdmin`. Se declara
  aqui **a proposito** y no se importa del barrel de `inventario`: ese import seria un VALOR en
  ejecucion y el centinela de `tests/unit/inventario/schema/inventario-schema.test.ts` exige
  `import type` para todo uso de ese barrel fuera de `lib/composition/`. Es el mismo camino que
  ya recorrio `recetas/domain/actor.ts`; deuda de un cuarto literal del rol, consciente y de una
  linea, **ya declarada en `design.md > 9`** y no abierta por esta ficha.
- `lib/modules/unidades/domain/errors.ts` — `UnidadesError` (abstracta, `code` estable) +
  `UnauthorizedError`.
- `lib/modules/unidades/domain/list-units.ts` — `MAX_UNITS = 200` y `createListUnits({ units })`,
  con `requireAdmin(actor)` **como primera linea, antes de tocar el repositorio**.
- `lib/modules/unidades/ports/unit-repository.ts` — `listAll(limit: number)`.
- `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts` — `listUnits(limit)` con
  `prisma.unit.findMany({ orderBy: { name: 'asc' }, select, take: limit })`. **Siempre con
  `take`** (R40: ninguna consulta sin cota).
- `lib/modules/unidades/adapters/driving/unit-actions.ts` — `'use server'`, `listUnitsAction()`.
  Resuelve el actor con `identity.getSessionUser()` via `@/lib/composition`, igual que
  `recipe-actions.ts`, y traduce el error de dominio. **No repite `requireAdmin` ni decide nada.**

Archivos editados: `lib/modules/unidades/index.ts` (contrato publico; **no reexporta nada con
`'use server'`**, R42) y `lib/composition/index.ts` (**bloque nuevo al final**, sin reordenar ni
reformatear nada previo; solo se ampliaron dos lineas de import ya existentes).

**Firma publica que consume el frontend** (R43):
```ts
export type UnitListResult =
  | { status: 'success'; data: readonly UnitRef[] }
  | { status: 'error'; code: string; message: string };
export async function listUnitsAction(): Promise<UnitListResult>;
// UnitRef = { id: string; name: string; symbol: string | null }
```

**Desviacion menor respecto a `tasks.md > T4`**, anotada en vez de silenciada: el contrato publico
**no** reexporta `UnitRepository`. `guard-arquitectura-modulos.test.ts` prohibe que el barrel
reexporte nada que no viva en `domain/`, y el puerto vive en `ports/`. La composicion importa el
tipo por su ruta —que es exactamente lo que `lib/composition` puede hacer— y R42 se cumple igual:
el caso de uso solo conoce el tipo, nunca la implementacion.

### Tests (T7) — `tests/unit/unidades/list-units.test.ts` y `unit-actions.test.ts`

| Test | Requisito |
| --- | --- |
| `el listado de unidades devuelve el catalogo ordenado y pide siempre un limite declarado` | R40 |
| `el orden que devuelve es el que da el repositorio, estable por nombre` | R40 |
| `sin actor / con rol vacio / con rol desconocido / con rol distinto de Administrador se rechaza sin leer del repositorio` | R41 |
| `resuelve el actor con identity.getSessionUser y responde success con el catalogo` | R41 |
| `sin sesion invoca el caso de uso con actor null, sin decidir nada por su cuenta` | R41 |
| `la action traduce el error de dominio a estado serializable sin relanzar` | R42 |
| `un error que no es de dominio se relanza y no se traduce` | R42 |

**Por que muerden**: el rechazo se prueba con un doble del repositorio **cuyo `listAll` lanza si se
le llama**, asi «no lee del repositorio» se comprueba de verdad y no por ausencia de asercion; y el
`limit` se asierta contra `MAX_UNITS` **importado**, no contra `200` escrito a mano.

Salida: `pnpm run typecheck` limpio, `pnpm run lint` limpio, los dos archivos en verde.

### Hallazgo: un test heredado de QC-32 contradecia una decision cerrada de esta ficha

`tests/unit/unidades/module-contract.test.ts` (QC-32) afirmaba tres cosas que la **fila 4 de las
decisiones cerradas** y `design.md > 9` derogan expresamente: que `ports/` esta vacia, que **un**
solo adaptador driven consulta la tabla, y que el modulo **no tiene adaptador driving**.

**No se relajo: se retenso**, y es la **ronda 5** de un archivo que ya llevaba cuatro
actualizaciones documentadas en su cabecera (la ultima, QC-25/R50). Detalle en la seccion
siguiente de esta bitacora.

### Ronda 5 de `tests/unit/unidades/module-contract.test.ts` (QC-26)

**Ninguna asercion se borro: se RETENSARON**, y el archivo ya llevaba cuatro rondas documentadas
en su cabecera (la ultima, QC-25/R50). Se anadio el parrafo de la ronda 5.

| Antes (limite de alcance de QC-32) | Ahora (forma real del modulo) |
| --- | --- |
| `ports/` no debe tener fuentes | contiene **exactamente** `unit-repository.ts` |
| el barrel no alcanza `adapters/` ni `ports/` | no alcanza `adapters/`; el **puerto** si es alcanzable —es una interfaz pura— y sigue sometido al mismo bucle que prohibe servidor, Prisma, `next` y `react` |
| **un** adaptador driven consulta la tabla | **exactamente dos**, los dos de `driven/persistence/`; se conservan **las dos pasadas sinteticas** que impiden que el barrido sea verde por vacuidad |
| `adapters/driving/` debe estar vacia | contiene **exactamente** `unit-actions.ts`, que exporta **exactamente una** funcion (`listUnitsAction`); **ningun** archivo del modulo nombra `createUnit`, `updateUnit`, `deleteUnit` ni `renameUnit`, ni una escritura Prisma sobre la tabla. Se conservan intactas las comprobaciones de que **no existe** ninguna ruta ni pantalla de unidades |
| ningun archivo de `app/` conoce el modulo | `app/` puede importar **solo** el barrel o el adaptador driving de **listado**, y **nunca** una ruta profunda a `domain/`, `ports/` o un adaptador **driven**. Es la forma util de **R43**, retensada **antes** de que el formulario la necesitara |

La cuarta fila es **mas fuerte que la que sustituye**: «la carpeta esta vacia» solo protegia mientras
no hubiera nada; «contiene exactamente esta funcion y ninguna escritura» es literalmente la frontera
de **R44** (el CRUD de unidades es de QC-38). **Comprobado que muerde**: al anadir un
`createUnitAction` de prueba, la asercion se puso **roja**; despues se revirtio.

Salida: `pnpm exec vitest run tests/unit/unidades/` -> **7 archivos, 60/60 en verde**.

## T8-T12 y T20 — La lista

Archivos creados, todos bajo `app/(private)/produccion/formulas/`: `page.tsx` y
`components/{index.ts, recipe-list-params.ts, recipe-columns.ts, recipe-table.tsx,
recipe-table-skeleton.tsx, recipe-list-empty.tsx, recipe-list-error.tsx, recipe-list-toolbar.tsx,
delete-recipe-dialog.tsx, recipe-list-section.tsx}`. Tests:
`tests/unit/recetas-ui/recipe-page.test.tsx` (23 tests) y
`tests/unit/recetas-ui/recipe-list-params.test.ts` (8 tests).

Cero cambios en `lib/modules/recetas/**`, `lib/modules/inventario/**`, `db/` y `components/ui/**`.

**`guard-rutas-privadas-cubiertas.test.ts` volvio a verde** con esta `page.tsx`, que es exactamente
lo que `tasks.md > T3` anticipaba al pedir que T3 y T12 cerrasen la misma tanda. Confirmado
aislada (7/7) y en el conjunto (`test:guardias` **123/123**).

### Decisiones que el spec no fijaba, anotadas en vez de silenciadas

1. **`DeleteRecipeDialog` no usa `useActionState`**, a diferencia de su gemelo de QC-22: la firma
   real es `deleteRecipeAction(id)`, sin `prevState` ni `FormData`. Se usa `useTransition`. Es el
   **mismo** motivo por el que el formulario tampoco lo usara (`design.md > 5`).
2. **La celda de imagen no vive en `RECIPE_COLUMNS`.** La columna declara `value` que devuelve
   siempre cadena, y una receta sin imagen exige un **marcador visual**, no texto (R18). La celda
   se pinta aparte en `recipe-table.tsx` con `data-testid="recipe-cell-image"`. **R8 sigue
   cubierto**: las seis columnas de negocio se presentan; solo cambia que la de imagen es
   presentacion y no un dato formateado.
3. **Elemento de imagen nativo en vez de `next/image`**, con su excepcion de lint comentada en el
   archivo: `next/image` exigiria declarar dominios remotos —decision de infraestructura fuera de
   alcance— y R18 manda pintar **la direccion que entrega la consulta, sin componerla**.
4. **El test de R25 cuenta regiones `aria-live`**, no el atributo del primitivo de avisos, que solo
   se pinta cuando hay un aviso en cola. Mismo criterio que `tests/unit/private-layout.test.tsx`.

### Mapa de la lista (nombres reales; en `recipe-page.test.tsx` salvo indicacion)

| Req | Test |
| --- | --- |
| R1 | `la lista de recetas se renderiza dentro del armazon privado y no declara main propio` |
| R5 | `el item del sidebar comparte RECIPES_LABEL con el encabezado y ya no dice Formulas` |
| R7 | `un error unauthorized se presenta y no se muestra ningun dato del catalogo` |
| R8 | `la lista presenta todas las columnas de negocio declaradas` |
| R9 | `la lista no muestra id, createdBy ni updatedBy` (**en negativo**) |
| R10 | `pintar una pagina invoca la operacion de listado una sola vez y nunca la de detalle` (**en negativo**) |
| R11 | `el selector de tamano ofrece 10 y 25 y usa 10 por defecto` |
| R12 | `permite avanzar y retroceder e indica la pagina actual y el total` + `en los extremos no ofrece avanzar ni retroceder mas alla` |
| R13 | `los parametros invalidos o fuera de rango se acotan y presentan la lista sin fallar` + toda `recipe-list-params.test.ts` |
| R14 | `la pantalla no ofrece busqueda ni control de orden` (**en negativo**) |
| R15 | `sin recetas presenta el estado vacio con la accion de crear` + `una pagina que se quedo atras ofrece volver a la primera` |
| R16 | `mientras carga presenta el esqueleto en lugar de la lista` |
| R17 | `un error de la consulta presenta el estado de error con reintento y no una lista vacia` |
| R18 | `la imagen se pinta con la direccion que entrega la consulta y sin imagen se pinta el marcador` |
| R19 | `el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro` |
| R20 | `crear y editar navegan a su pagina propia y no abren panel ni modal` (**en negativo**) |
| R25 | `la zona privada sigue teniendo exactamente una region de avisos` (**en negativo**) |
| R39 | `el borrado pide confirmacion nombrando la receta y sin confirmar no invoca la operacion` + `un borrado con exito cierra el dialogo, avisa por toast y refresca la lista` + `un borrado rechazado muestra el error en el dialogo y no navega ni refresca` |
| R50 | `presenta la lista y sus acciones en viewport angosto y en ancho` |

Salida: typecheck limpio, lint limpio, **31/31** en los dos archivos, `test:guardias` **123/123**.

### Estado del gate al cerrar esta tanda (verificado por el implementer)

- `pnpm run typecheck` -> limpio.
- `pnpm run test:guardias` -> **12 archivos, 123/123 en verde**.
- `pnpm exec vitest run tests/unit/unidades tests/unit/recetas-ui tests/unit/identity/route-role-rules.test.ts`
  -> **101 passed, 1 failed**. El unico rojo es
  `tests/unit/identity/route-role-rules.test.ts > declara exactamente una regla: la pantalla de
  inventario, solo Administrador (R4)`, que ahora ve **dos** filas. **Es el rojo que T23 tiene
  encargado cerrar** («ampliar `route-role-rules.test.ts`»), no una regresion.
