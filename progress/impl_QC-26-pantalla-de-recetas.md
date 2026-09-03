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

## T23 — Proteccion de ruta y rol (tests ampliados, ninguno de produccion tocado)

Archivos ampliados: `tests/unit/identity/route-role-rules.test.ts`,
`tests/unit/identity/route-access.test.ts` y `tests/unit/app-sidebar.test.tsx` —este ultimo es
**el equivalente real** del «`private-nav.test.ts` o equivalente» que pedia la task: es el que
itera `PRIVATE_NAV_ITEMS`.

**El rojo conocido queda cerrado sin relajarse.** `declara exactamente una regla...` se **reescribio**
como `declara exactamente dos reglas, en orden: inventario y recetas, las dos solo Administrador
(R4, R6)`, afirmando la **lista exacta**. No se degrado a «al menos una»: una tercera fila sin test
seguiria poniendolo rojo, que es para lo que ese test existe.

| Req | Test | Archivo |
| --- | --- | --- |
| R4, R6 | `declara exactamente dos reglas, en orden: inventario y recetas, las dos solo Administrador` | route-role-rules.test.ts |
| R6 | `la regla de recetas cubre la lista y sus dos subrutas de formulario, y la de inventario sigue en pie` | route-role-rules.test.ts |
| R3 | `las filas se derivan de INVENTORY_ROUTE, FORMULAS_ROUTE y ADMIN_ROLE_NAME, no de literales propios` | route-role-rules.test.ts |
| R4 | `sin sesion, pedir %s redirige al login con esa ruta como destino de vuelta` (las tres rutas) | route-access.test.ts |
| R4 | `una ruta que solo comparte el texto del prefijo, sin limite de segmento, no queda cubierta` | route-access.test.ts |
| R6 | `deja pasar al Administrador en las tres rutas` | route-access.test.ts |
| R6 | `a un rol distinto de Administrador lo redirige con motivo forbidden en las tres rutas` | route-access.test.ts |
| R4 | `la regla de inventario sigue en pie: un no Administrador tampoco entra ahi` | route-access.test.ts |
| R5 | `el item de recetas apunta a la constante FORMULAS_ROUTE, es el unico, y ya no dice Formulas` | app-sidebar.test.tsx |

**Por que muerden**: la prueba de `/produccion/formulasX` es la que distingue una comparacion **por
segmentos** de un `startsWith` ingenuo — sin ella, el test no notaria la diferencia; y el test de R5
comprueba **en negativo** que ni la etiqueta vieja ni el `testId` viejo existen ya en el DOM.

R5 en su mitad de «comparte `RECIPES_LABEL` con el encabezado» ya estaba cubierto por
`recipe-page.test.tsx` (T20) y **no se duplico**.

Salida: typecheck limpio; los tres archivos en verde (**59/59**); `test:guardias` **123/123**.
`pnpm run lint` daba rojo en ese momento, pero **por un archivo del formulario a medio escribir**
(`product-picker.tsx`, T14, en vuelo en otra tanda), no por nada de T23.

## T13-T19 y T16b — El formulario en pagina propia

Archivos creados bajo `app/(private)/produccion/formulas/`: `nueva/page.tsx`, `[id]/page.tsx` y
`components/{recipe-form-state.ts, product-picker.tsx, unit-picker.tsx, recipe-lines-field.tsx,
recipe-steps-field.tsx, recipe-image-field.tsx, recipe-form.tsx}`. Test:
`tests/unit/recetas-ui/recipe-lines-unavailable.test.tsx`.
El barrel `components/index.ts` **solo recibio un bloque nuevo al final**; los exports de la lista
no se tocaron.

### Los tres estados de la imagen, por PRESENCIA DE CLAVE (R35, R36)

`buildRecipePayload(mode: RecipeFormMode, state: RecipeFormState): RecipePayload` —**pura**, sin
React ni DOM, en `recipe-form-state.ts`:

| Estado interno | Que produce |
| --- | --- |
| `untouched` | devuelve `base` **sin la clave `image`** — nunca `image: undefined`, que es lo que colapsaria los dos casos |
| `replaced` | `{ ...base, image: { bytes } }`, con `bytes = new Uint8Array(await file.arrayBuffer())` |
| `cleared` | `{ ...base, image: null }` **explicito**, y **solo** en edicion |

**R36 se cumple por interfaz y ademas por invariante**: `recipe-image-field.tsx` **no ofrece** el
control de quitar en el alta, y `buildRecipePayload` **lanza** si le llega `create` + `cleared`.
`Uint8Array` **si cruza** la frontera de la Server Action: no hubo que parar ni tocar el esquema de
QC-25.

### T16b — el test del marcador y del aviso, y la prueba de que MUERDE

Seis tests sobre `data-testid`, `role` y `data-count`, **nunca sobre el copy**. Se rompieron **las
tres piezas por separado** y se confirmo el rojo antes de restaurar:

| Pieza rota a proposito | Tests que se pusieron rojos |
| --- | --- |
| el filtro que cuenta (fijado a `2`) | 3 (los casos a, c y d) |
| el marcador de celda (`data-testid` a `undefined`) | 3 (b, e y «solo esa linea») |
| el desmontaje del aviso (condicion fijada a `true`) | 2 (a y d) |

Tras restaurar, **6/6 en verde**. Un test que solo comprobase «aparece algo» habria seguido verde
con el numero mentiroso; este no.

### Decisiones que el spec no fijaba, anotadas en vez de silenciadas

1. **`ProductPicker` no reutiliza el `Select` de `components/ui`**: ese primitivo espera que el
   valor elegido figure entre sus items, y con **paginacion** casi nunca es asi. Se compone a mano
   con `Button` —**sin ninguna libreria nueva**, R45 intacto— y el motivo queda escrito en el
   archivo.
2. **El discriminante de «producto dado de baja» se protege de un falso positivo**: `productName: ''`
   significa «linea nueva, aun sin elegir producto» y `productName: null` queda **reservado** a
   «vino de la precarga con el producto de baja». Sin esa distincion, una linea recien anadida en
   blanco habria inflado el `data-count` del aviso de R54.
3. **La primera pagina de productos se precarga en las dos `page.tsx`** y baja **por props** a cada
   `ProductPicker` (R49), evitando N peticiones al montar; cambiar de pagina si dispara
   `listProductsAction` desde el propio desplegable, que es lo que R28 pide.
4. **Los errores de carga de unidades/productos reutilizan `RecipeListError`** del barrel, en vez de
   inventar un componente de error que `tasks.md` no pide.
5. **`product-picker.tsx` mueve la peticion de pagina a un manejador de evento** (`goToPage`) en vez
   de a un efecto, siguiendo el patron de `presentation-select.tsx` de QC-22, para no violar
   `react-hooks/set-state-in-effect`.

Salida: `pnpm run typecheck` limpio; `pnpm run lint` limpio; `vitest related` **37 tests en verde**;
`recipe-lines-unavailable.test.tsx` **6/6**; `test:guardias` **123/123**; **`pnpm run build` verde**,
con `/produccion/formulas`, `/produccion/formulas/nueva` y `/produccion/formulas/[id]` en la tabla
de rutas.

`grep` confirma: `@dnd-kit` **solo** en `recipe-steps-field.tsx`; sin `type="number"`; sin `fetch(`;
sin import de `@/lib/composition` ni de `prisma` en cliente; sin `<Toaster />` propio; sin `100vh`.

### Estado del gate al cerrar esta tanda (verificado por el implementer)

`pnpm run typecheck` limpio, `pnpm run lint` limpio, y
`pnpm exec vitest run tests/unit/recetas-ui tests/unit/identity tests/unit/app-sidebar.test.tsx tests/unit/unidades`
-> **37 archivos, 448/448 en verde**. El rojo de `route-role-rules.test.ts` que dejo la tanda
anterior **queda cerrado** por T23.

## T27 — `CHECKPOINTS.md`: los «no aplica», declarados con su motivo (no omitidos)

**Datos y seguridad (Supabase)**

- **Toda tabla nueva con RLS y `FORCE ROW LEVEL SECURITY`** — **NO APLICA**. Esta feature no crea
  ninguna tabla: **cero cambios en `db/`** (R44). El esquema de `recipes`/`recipe_lines` es de
  QC-24 y el de `units` de QC-32, las dos mergeadas con su RLS forzada.
- **Migraciones versionadas y reversibles con su `down.sql`** — **NO APLICA**: **cero migraciones
  nuevas**. Nada que revertir.
- **Secretos hardcodeados** — **NO APLICA**: la feature no introduce ninguna variable de entorno ni
  credencial. Las del almacenamiento las declaro QC-25 y esta ficha **solo consume la URL publica
  que la lectura compone** (R18).
- **Webhooks** — **NO APLICA**: no hay ninguno.
- **El acceso a datos de negocio pasa solo por el repositorio (Prisma)** — **SI APLICA y se
  cumple**: la unica lectura nueva (`unit-prisma.ts`) va por Prisma detras de un puerto. Ninguna
  lectura ni escritura con el cliente de Supabase.

**«Cada permiso se valida en el SERVICE y tiene su test» — SI APLICA, y en dos mitades**

1. Para las **cinco operaciones de receta**, **ya lo cumplio QC-25** (`requireAdmin` como primera
   linea de cada caso de uso) y esta ficha **no lo re-implementa ni lo repite** (R7): la pantalla
   no toma ninguna decision de autorizacion.
2. Para la **operacion nueva de unidades**, **lo aporta esta ficha**: `requireAdmin(actor)` es la
   primera linea de `createListUnits` y su test usa un doble del repositorio **que falla si se le
   llama** (R41, T7).

**El corte de ruta (`ROUTE_ROLE_RULES`) es ADICIONAL y NO cuenta como autorizacion** — es lo que
QC-9 R29 dejo escrito: que una regla deje pasar solo significa que se enseña una pantalla.
Consecuencia deliberada: si alguien borrase la fila de `FORMULAS_ROUTE`, la pantalla se veria pero
**no mostraria ni un dato**.

**Modulos hexagonales — SI APLICA** al modulo `unidades`, que gana dominio, puerto, adaptador driven
y adaptador driving (R42). `domain/` y `ports/` no importan framework, Prisma, `lib/shared/` ni
`lib/composition`; el adaptador driving **no instancia** su driven, se lo pide a `lib/composition`;
y el contrato publico **no reexporta ninguna Server Action**.

**Mutaciones internas por Server Actions — SI APLICA** (R47): cero `fetch` a rutas de API propias.

**Componentes privados reciben datos por props — SI APLICA** (R49): unidades y la primera pagina de
productos bajan por props desde los Server Components; ningun componente de cliente importa
`@/lib/composition` ni Prisma.

**E2E de flujo critico — SI APLICA** (T24), **sin la subida de imagen** y con el motivo escrito:
exigiria bucket real y red, y el gate corre sin red a proposito (`design.md > 12`).

**Multiplataforma — SI APLICA, y `design.md` NO declara ninguna excepcion de escritorio** (R50,
T25).

**Dependencias — SI APLICA**: tres paquetes nuevos (`@dnd-kit/core`, `@dnd-kit/sortable`,
`@dnd-kit/utilities`), cada uno con su fila en `docs/dependencias.md` en estado **`excepcion`**,
diciendo **que check fallo (el 2)** y **por que se acepto igual**, con la aprobacion humana del
2026-09-03 citada en `design.md > 10` (R45).

## T22 — Guardias de fuente y contrato de ruta

Archivo creado: `tests/unit/recetas-ui/recipe-route-contract.test.ts` — **20 tests**, sobre el
patron de `tests/unit/inventario/product-route-contract.test.ts`. Vigila lo que esta feature
promete **no hacer** y que **es invisible renderizando**.

| Req | Test |
| --- | --- |
| R3 | `las tres rutas existen donde las ubican FORMULAS_ROUTE, NEW_RECIPE_ROUTE y recipeEditRoute` + `ningun archivo de produccion incrusta el literal de la ruta y private-nav reexporta, no redeclara` |
| R7 | `la pantalla no repite requireAdmin ni decide autorizacion sobre los datos` |
| R9 | `la lista no puede pintar quien creo o modifico una receta` |
| R10 | `pintar una pagina de lista cuesta una sola invocacion de listado y ningun archivo de la lista lleva la marca de producto de baja` |
| R14 | `la pantalla no ofrece busqueda ni control de orden configurable` |
| R18 | `la imagen se pinta con la direccion que entrega la consulta y ningun archivo compone una URL de almacenamiento` |
| R22 | `el guardado sale por createRecipeAction o updateRecipeAction y no existe ninguna operacion por linea ni por paso` |
| R25 | `el layout privado monta la region de avisos y la ruta no monta otra` |
| R28 | `el selector de producto no filtra en cliente y pide el tamano de pagina importado` |
| R29 | `la cantidad nunca se convierte a numero en ningun archivo de la ruta` |
| R43, R44 | `la pantalla obtiene las unidades solo por listUnitsAction y ninguna operacion de escritura de unidades entra en esta feature` |
| R44 | `la feature no toca lib/modules/recetas ni db/` — comprobado con `git diff --name-only origin/dev...HEAD`, **viable en este entorno**, asi que no hizo falta la lista explicita |
| R45 | `package.json solo incorpora los tres paquetes de arrastre aprobados y sus filas declaran el check fallido` |
| R46 | `los componentes de ruta se exponen por el barrel, las tres paginas importan solo del barrel y no queda ningun componente suelto` — **adaptado** a que esta ruta si tiene subcarpetas (`nueva/`, `[id]/`), a diferencia del precedente |
| R47 | `ningun archivo de la ruta usa fetch a rutas API propias` |
| R48 | `las primitivas de components/ui que usa la ruta existen y ninguna se escribio a mano` |
| R49 | `los componentes de cliente no importan composicion, Prisma ni sesion por su cuenta` |
| R50 | `no usa 100vh, ni hover como unica via, y respeta tamanos tactiles y de fuente` — **control a control**, con la autocomprobacion de que el lector de etiquetas no se queda mudo |
| R51 | `la feature no duplica el armazon heredado: layout, sidebar, avisos y primitivas siguen siendo unicos` |

### La guardia CAZO dos defectos reales de R50, y ese es justo su trabajo

Los dos son de area tactil (44x44 px) en un control que solo llevaba el tamano de fuente. Medir
**por archivo** —como se media antes de que el reviewer lo demostrase en QC-22— **no los habria
visto**, porque otros controles del mismo archivo si llevaban la clase:

1. `recipe-image-field.tsx`: el `Input` de archivo (`data-testid="recipe-image-input"`) tenia
   `className="text-base"` y le faltaba el area tactil -> `className="min-h-11 text-base"`.
2. `recipe-steps-field.tsx`: el `Input` del texto del paso
   (`data-testid="recipe-step-text-${index}"`) tenia `className="text-base"` y le faltaba
   `TOUCH_TARGET` -> `` className={`${TOUCH_TARGET} text-base`} ``.

Los dos arreglos son minimos y siguen el patron que ya usaban los demas controles de la feature.
**La guardia no se debilito en ningun punto**: se arreglo el codigo.

Salida: typecheck limpio, lint limpio, **20/20** en el archivo nuevo, `test:guardias` **123/123**.

## T24 — E2E del camino completo y del rechazo por rol

Archivo creado: `e2e/recetas.spec.ts`, sobre el patron de `e2e/session.spec.ts` y
`e2e/inventario.spec.ts` (fixtures con prefijo **`qc26_e2e_`**, `RUN_ID` por worker, limpieza de
huerfanos por edad en `beforeAll`, borrado en `afterAll`).

| Recorrido | Test | Req |
| --- | --- | --- |
| Camino completo del Administrador | `el Administrador entra, da de alta una receta con una linea y un paso, y la ve en la lista (R52)` | R52, R2, R20, R24 |
| Rechazo del no-Administrador | `un usuario que no es Administrador acaba fuera y no ve el catalogo (R6)` | R52, R6 |

**SI SE EJECUTO, y en verde: 4/4** (los dos recorridos x **Chromium y WebKit**).

**Comando exacto** —y el porque, que importa para el gate—: `pnpm run e2e` **por si solo no exporta
las variables de `.env` al proceso del runner**. El `next dev` que Playwright levanta como
`webServer` si las carga, pero el propio runner —donde `beforeAll`/`afterAll` hablan con Prisma— no.
Asi que:

```bash
set -a && source .env && set +a && pnpm run e2e e2e/recetas.spec.ts
```

**Base de datos**: `QuimiCloude_QC26` (propia de este worktree). **La cadena de conexion no se
toco.** Comprobado con consulta directa a Postgres tras la corrida:
`{ recipes: 0, products: 0, presentations: 0, users: 0 }` para el prefijo `qc26_e2e_` — **la base
queda limpia**.

**Bug real encontrado y corregido durante la verificacion** (y merece quedar escrito, porque es el
fallo que le costo horas a QC-9): el `afterAll` borraba las recetas por el **prefijo compartido** en
vez de por el nombre exacto del worker. Como `fullyParallel` reparte los dos tests en workers
distintos, cada uno con su propio `RUN_ID`, el `afterAll` del test que **no** crea receta borraba la
del otro worker **antes** de que su assert corriera: rojo intermitente que no se reproduce a la
primera. Corregido a `deleteMany({ where: { name: recipeName } })`, igual que ya hacian
`productName` y `presentationName`.

Cobertura de los cinco puntos criticos: **sin subida de imagen**; asserts filtrando por el nombre
con `RUN_ID` —**nunca** «la primera fila» ni totales—, con ayudantes que **paginan de verdad**; las
unidades **no se siembran** (se toma la primera opcion real del selector, ya poblado por la
migracion de QC-32); rutas desde `FORMULAS_ROUTE`/`NEW_RECIPE_ROUTE`; y limpieza por edad mas
borrado exacto.

`pnpm run typecheck` y `pnpm run lint` limpios.

## T21 — Tests del formulario y del payload

Archivos creados: `tests/unit/recetas-ui/recipe-form-payload.test.ts` (proyecto **node**, sin DOM,
sobre la funcion pura) y `tests/unit/recetas-ui/recipe-form.test.tsx` (**jsdom**). **32 tests**, en
verde. **Ningun archivo de produccion quedo modificado por esta task.**

`recipe-form-payload.test.ts` (13):

| Req | Que afirma |
| --- | --- |
| R35 | los tres estados por `'image' in payload` — **presencia de clave**, no valor |
| R36 | alta: nunca viaja el nulo; `create` + `cleared` **lanza** (**en negativo**) |
| R29 | `0.1005`, `1.0000` y `10.0001` llegan como **la misma cadena** — valores elegidos porque delatarian una conversion a coma flotante |
| R32 | el orden de los pasos se conserva, tambien tras reordenar |
| R22 | la linea viaja completa (sin `key` ni `productName`) y quitar una la **excluye** del payload |

`recipe-form.test.tsx` (19): R20, R21 (precarga **conservando la linea con `productName: null`**, y
`not_found` -> estado «no encontrada»), R22 (**una sola** invocacion), R23 (error en linea, **sin
navegar y sin perder lo escrito**), R24, R26, R27 (receta **sin lineas** se guarda), R28 (**alcanza
la pagina 2** pidiendola al backend, sin filtro de texto en cliente), R30 (unidad sin simbolo se
presenta por su nombre y viaja como **id**), R31, R32, **R33** (arrastre real con `user.pointer()`),
**R34**, R37, R38.

### La prueba de que R34 y R35 muerden (roturas deliberadas, confirmadas y revertidas)

| Rotura | Resultado |
| --- | --- |
| comentar `useSensor(KeyboardSensor, ...)` en `recipe-steps-field.tsx` | **R34 rojo**: `expected ['Mezclar','Calentar','Enfriar'] to deeply equal ['Calentar','Mezclar','Enfriar']` |
| cambiar `case 'untouched': return base;` por `return { ...base, image: undefined }` | **R35 y R36 rojos**: `expected true to be false` en los dos tests de «no key» |

Las dos se restauraron y se confirmo `git diff` limpio. **R34 se afirma sobre el ORDEN DEL PAYLOAD**
tras hacer la reordenacion **entera** con teclado (`tab` hasta el asa, `Space`, `ArrowDown`,
`Space`), no sobre la existencia de un asa enfocable: un test que solo mirase el `role` habria
seguido verde con la accesibilidad rota. Ademas se afirma que el **nombre accesible del asa incluye
la posicion**.

### Dos matices del entorno, resueltos DENTRO del test (sin debilitar ninguna asercion)

1. `user-event.upload()` filtra los archivos por el `accept` del input **antes** de disparar el
   `change`. El fixture de «formato no aceptado» declara `type: 'image/png'` (un MIME falsificado
   realista) para que lo que se ejercite de verdad sea el **rechazo por firma de bytes** de
   `validateRecipeImage`, que es lo que R38 exige.
2. jsdom no implementa `URL.createObjectURL`/`revokeObjectURL`: se sustituyen con un doble
   documentado en el propio archivo.

## T25 — Verificacion en navegador: lo comprobado y lo que NO se pudo comprobar

**Comprobado por el implementer, en vivo** (`next dev` en el puerto 3111, base `QuimiCloude_QC26`):
las **tres** rutas estan cubiertas por el prefijo privado y **sin sesion** responden `307` al login
**conservando el destino de vuelta** (R4):

```
/produccion/formulas                    307 -> /login?next=%2Fproduccion%2Fformulas
/produccion/formulas/nueva              307 -> /login?next=%2Fproduccion%2Fformulas%2Fnueva
/produccion/formulas/<id>               307 -> /login?next=%2Fproduccion%2Fformulas%2F<id>
```

**Comprobado en WebKit real, via T24**: el E2E corre en **Chromium y WebKit** y pasa **4/4**. Eso
ejercita en WebKit, de verdad, el login, la lista, la navegacion a «nueva», el selector de producto
**paginando**, el selector de unidad, el alta con una linea y un paso, y el rechazo del
no-Administrador.

**LO QUE NO SE PUDO COMPROBAR, y no se declara verde** (`tasks.md > T25` pide explicitamente que si
algo falla en WebKit **no** se declare excepcion de escritorio, sino que se arregle o se reporte —
esto no es un fallo, es **una comprobacion no realizada**, y se reporta):

- inspeccion visual a **>= 1280 px** y a **<= 375 px** con emulacion movil;
- que el scroll horizontal quede **dentro de la tabla y no del documento** (R19) **observado**;
- **arrastrar un paso con el dedo** sin secuestrar el scroll tactil, en WebKit/simulador real;
- **reordenar un paso solo con teclado** observado en navegador (R34) — **si** esta cubierto por
  test automatizado en T21, que afirma sobre el orden del payload;
- que **ningun input haga zoom al enfocar** en iOS.

**Lo que si cubre parte de ese hueco de forma automatizada**: R19 y R50 tienen guardia de fuente
**control a control** en T22 —que de hecho **cazo dos defectos reales de area tactil**— y asserts de
viewport angosto y ancho en `recipe-page.test.tsx` y `recipe-form.test.tsx` con el helper
`tests/helpers/viewport.ts`. Pero **una guardia de fuente no es un dedo sobre un cristal**: la
comprobacion manual en WebKit/iOS **queda pendiente para el leader o el humano**, y se declara aqui
en vez de omitirse.

## T26 — Mapa de trazabilidad `R<n> -> test` (los 54, con nombres REALES)

Ninguno de los 54 queda huerfano. Abreviaturas de archivo:
`page` = `tests/unit/recetas-ui/recipe-page.test.tsx` ·
`params` = `tests/unit/recetas-ui/recipe-list-params.test.ts` ·
`form` = `tests/unit/recetas-ui/recipe-form.test.tsx` ·
`payload` = `tests/unit/recetas-ui/recipe-form-payload.test.ts` ·
`unavail` = `tests/unit/recetas-ui/recipe-lines-unavailable.test.tsx` ·
`contract` = `tests/unit/recetas-ui/recipe-route-contract.test.ts` ·
`rules` = `tests/unit/identity/route-role-rules.test.ts` ·
`access` = `tests/unit/identity/route-access.test.ts` ·
`sidebar` = `tests/unit/app-sidebar.test.tsx` ·
`units` = `tests/unit/unidades/list-units.test.ts` ·
`unitact` = `tests/unit/unidades/unit-actions.test.ts` ·
`modcontract` = `tests/unit/unidades/module-contract.test.ts` ·
`guard-priv` = `tests/guards/guard-rutas-privadas-cubiertas.test.ts` ·
`guard-dep` = `tests/guards/guard-dependencias-aprobadas.test.ts` ·
`guard-arq` = `tests/guards/guard-arquitectura-modulos.test.ts` ·
`unitrepo` = `tests/integration/unidades/unit-repository.int.test.ts` (**anadido en la ronda 2**) ·
`recetascontract` = `tests/unit/recetas/module-contract.test.ts` ·
`e2e` = `e2e/recetas.spec.ts`

| Req | Test (nombre real) | Archivo |
| --- | --- | --- |
| R1 | `la lista de recetas se renderiza dentro del armazon privado y no declara main propio` | page |
| R2 | `las tres rutas existen donde las ubican FORMULAS_ROUTE, NEW_RECIPE_ROUTE y recipeEditRoute` + `el Administrador entra, da de alta una receta con una linea y un paso, y la ve en la lista (R52)` | contract + e2e |
| R3 | `ningun archivo de produccion incrusta el literal de la ruta y private-nav reexporta, no redeclara` + `las filas se derivan de INVENTORY_ROUTE, FORMULAS_ROUTE y ADMIN_ROLE_NAME, no de literales propios` | contract + rules |
| R4 | `sin sesion redirige al login con la ruta pedida como destino de vuelta (R3)` + `una ruta que solo comparte el texto del prefijo, sin limite de segmento, no queda cubierta (R4)` + la guardia de prefijos privados | access + guard-priv |
| R5 | `el item de recetas apunta a la constante FORMULAS_ROUTE, es el unico, y ya no dice Formulas (R5)` + `el item del sidebar comparte RECIPES_LABEL con el encabezado y ya no dice Formulas` | sidebar + page |
| R6 | `declara exactamente dos reglas, en orden: inventario y recetas, las dos solo Administrador (R4, R6)` + `la regla de recetas cubre la lista y sus dos subrutas de formulario, y la de inventario sigue en pie (R6)` + `a un rol distinto de Administrador lo redirige con motivo forbidden en las tres rutas (R6)` + `un usuario que no es Administrador acaba fuera y no ve el catalogo (R6)` | rules + access + e2e |
| R7 | `la pantalla no repite requireAdmin ni decide autorizacion sobre los datos` + `un error unauthorized se presenta y no se muestra ningun dato del catalogo` | contract + page |
| R8 | `la lista presenta todas las columnas de negocio declaradas` | page |
| R9 | `la lista no muestra id, createdBy ni updatedBy` + `la lista no puede pintar quien creo o modifico una receta` (**los dos en negativo**) | page + contract |
| R10 | `pintar una pagina invoca la operacion de listado una sola vez y nunca la de detalle` + `pintar una pagina de lista cuesta una sola invocacion de listado y ningun archivo de la lista lleva la marca de producto de baja` (**en negativo**) | page + contract |
| R11 | `el selector de tamano ofrece 10 y 25 y usa 10 por defecto` + `las dos unicas opciones de tamano son el defecto y el tope del backend` | page + params |
| R12 | `permite avanzar y retroceder e indica la pagina actual y el total` + `en los extremos no ofrece avanzar ni retroceder mas alla` | page |
| R13 | `los parametros invalidos o fuera de rango se acotan a valores validos` + `un tamano de pagina fuera de la lista cae al defecto, tambien si excede el tope` + `un parametro repetido toma el primer valor y sigue acotando` + `una pagina enorme no se corrompe: sigue siendo un entero seguro` + `los parametros invalidos o fuera de rango se acotan y presentan la lista sin fallar` | params + page |
| R14 | `la pantalla no ofrece busqueda ni control de orden` + `la pantalla no ofrece busqueda ni control de orden configurable` (**los dos en negativo**) | page + contract |
| R15 | `sin recetas presenta el estado vacio con la accion de crear` + `una pagina que se quedo atras ofrece volver a la primera` | page |
| R16 | `mientras carga presenta el esqueleto en lugar de la lista` | page |
| R17 | `un error de la consulta presenta el estado de error con reintento y no una lista vacia` | page |
| R18 | `la imagen se pinta con la direccion que entrega la consulta y sin imagen se pinta el marcador` + `la imagen se pinta con la direccion que entrega la consulta y ningun archivo compone una URL de almacenamiento` | page + contract |
| R19 | `el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro` (mas la mitad de fuente de `no usa 100vh, ni hover como unica via, y respeta tamanos tactiles y de fuente`) | page + contract |
| R20 | `crear y editar navegan a su pagina propia y no abren panel ni modal` (**en negativo**) + `el boton de cancelar es un enlace real a la lista, no un panel ni un dialogo` + `terminar con exito tambien devuelve a la lista` | page + form |
| R21 | `precarga el detalle y conserva la linea cuyo productName es null, reenviandola intacta` + `una receta inexistente presenta el estado de no encontrada, no un formulario vacio` | form |
| R22 | `quitar una linea la saca de la lista enviada; cero llamadas por linea ni por paso` + `quitar una linea de state.lines la excluye del payload enviado` + `cada linea viaja con productId, quantity y unitId` + `el guardado sale por createRecipeAction o updateRecipeAction y no existe ninguna operacion por linea ni por paso` | form + payload + contract |
| R23 | `el error se presenta en la region del formulario y el nombre editado sigue en el DOM` | form |
| R24 | `createRecipeAction con exito navega a la lista, avisa y refresca` + `un borrado con exito cierra el dialogo, avisa por toast y refresca la lista` + el E2E | form + page + e2e |
| R25 | `la zona privada sigue teniendo exactamente una region de avisos` + `el layout privado monta la region de avisos y la ruta no monta otra` (**los dos en negativo**) | page + contract |
| R26 | `un nombre vacio -que el esquema rechaza- no invoca la operacion` | form |
| R27 | `anadir y luego quitar la unica linea deja la receta sin lineas, y asi se guarda` | form |
| R28 | `pide la pagina 2 al backend y permite elegir un producto que no estaba descargado` + `el selector de producto no filtra en cliente y pide el tamano de pagina importado` (**en negativo**) | form + contract |
| R29 | los tres casos parametrizados de cantidad (`0.1005`, `1.0000`, `10.0001`) que llegan como **la misma cadena** + `la cantidad nunca se convierte a numero en ningun archivo de la ruta` | payload + contract |
| R30 | `elige Litro (con simbolo) y Gramo (sin simbolo, por su nombre) y envia el id` | form |
| R31 | `dos lineas con el mismo producto no se envian: el error sale en el bloque de lineas` + `una cantidad que el esquema rechaza presenta el error junto a la linea afectada` | form |
| R32 | `anadir tres pasos, editar uno y quitar otro deja el orden esperado en el payload` + `payload.steps sigue exactamente el orden de state.steps` + `un orden distinto en state.steps produce un payload.steps distinto` | form + payload |
| R33 | `arrastrar el primer paso hasta la tercera posicion reordena el payload` | form |
| R34 | `Tab hasta el asa, Espacio para tomar, flecha para mover y Espacio para soltar cambian el payload` — afirma sobre el **orden del payload**, y se comprobo que **se pone rojo al quitar el `KeyboardSensor`** | form |
| R35 | `untouched: el payload NO tiene la clave` + `replaced: el payload lleva image con los bytes elegidos` + `cleared: el payload lleva image null EXPLICITO, no ausente` — los tres por **presencia de clave** | payload |
| R36 | `untouched en alta: tampoco lleva la clave` + `replaced en alta: lleva los bytes, nunca null` + `cleared en alta es un estado que la interfaz nunca ofrece, y buildRecipePayload lo rechaza en vez de enviar null` (**en negativo**) | payload |
| R37 | `elegir un archivo valido muestra su vista previa, y el envio en curso impide un segundo envio` | form |
| R38 | `un archivo demasiado grande se rechaza sin invocar la operacion` + `un archivo con formato no aceptado se rechaza sin invocar la operacion` | form |
| R39 | `el borrado pide confirmacion nombrando la receta y sin confirmar no invoca la operacion` + `un borrado rechazado muestra el error en el dialogo y no navega ni refresca` | page |
| R40 | `el listado de unidades devuelve el catalogo ordenado y pide siempre un limite declarado` + `el orden que devuelve es el que da el repositorio, estable por nombre` (**caso de uso**, contra un doble) + `R40: la cota > devuelve exactamente el limite pedido cuando la tabla tiene mas filas que el limite` + `R40: el orden > devuelve las filas ordenadas de forma ascendente por nombre, no en orden de insercion` (**repositorio REAL contra Postgres**, ronda 2) | units + unitrepo |
| R41 | `sin actor` / `con rol vacio` / `con rol nulo` (**anadido en la ronda 2**) / `con rol desconocido` / `con rol distinto de Administrador se rechaza sin leer del repositorio` (cinco tests, con un doble que **falla si se le llama**) + `sin sesion invoca el caso de uso con actor null, sin decidir nada por su cuenta` | units + unitact |
| R42 | `la action traduce el error de dominio a estado serializable sin relanzar` + `un error que no es de dominio se relanza y no se traduce` + `el modulo unidades tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel` + la guardia de arquitectura | unitact + modcontract + guard-arq |
| R43 | `la pantalla obtiene las unidades solo por listUnitsAction y ninguna operacion de escritura de unidades entra en esta feature` + la asercion de `app/` que solo permite el barrel o el adaptador driving de listado | contract + modcontract |
| R44 | `la feature no toca lib/modules/recetas ni db/` (via `git diff --name-only`, que **ahora cae en rojo si el rango no esta disponible** en vez de pasar en silencio) + `la feature no anade ningun route handler bajo app/, y lib/modules/recetas no cambio de forma` (ronda 2: el censo literal de 19 archivos se sustituyo por el **mismo diff de rama**) + la asercion de que `adapters/driving/` **solo** expone `listUnitsAction` y ningun archivo del modulo nombra una escritura de unidades (**en negativo**) | contract + modcontract + recetascontract |
| R45 | `package.json solo incorpora los tres paquetes de arrastre aprobados y sus filas declaran el check fallido` + `toda dependencia de package.json tiene su fila en el registro` | contract + guard-dep |
| R46 | `los componentes de ruta se exponen por el barrel, las tres paginas importan solo del barrel y no queda ningun componente suelto` | contract |
| R47 | `ningun archivo de la ruta usa fetch a rutas API propias` | contract |
| R48 | `las primitivas de components/ui que usa la ruta existen y ninguna se escribio a mano` | contract |
| R49 | `los componentes de cliente no importan composicion, Prisma ni sesion por su cuenta` + `elige Litro y Gramo` (las unidades llegan **por props**) | contract + form |
| R50 | `presenta la lista y sus acciones en viewport angosto y en ancho` + `no usa 100vh, ni hover como unica via, y respeta tamanos tactiles y de fuente` (**control a control**) | page + contract |
| R51 | `la feature no duplica el armazon heredado: layout, sidebar, avisos y primitivas siguen siendo unicos` (ronda 2: el censo de layouts de **toda** la zona privada se sustituyo por «**la carpeta de la ruta de recetas** no declara layout propio», derivada de `FORMULAS_ROUTE`) | contract |
| R52 | `el Administrador entra, da de alta una receta con una linea y un paso, y la ve en la lista (R52)` + `un usuario que no es Administrador acaba fuera y no ve el catalogo (R6)` | e2e |
| R53 | `(b) con dos lineas de baja existen los dos marcadores -y solo esos- y el aviso cuenta 2` + `la celda de una linea disponible no lleva testid de no disponible` | unavail |
| R54 | `(a) sin lineas de baja, el aviso no existe y ninguna celda lleva marcador` + `(c) al quitar una de las dos lineas de baja, data-count pasa a 1` + `(d) al quitar la ultima linea de baja, el aviso desaparece del DOM` + `(e) el payload enviado sigue conteniendo la linea marcada, intacta` | unavail |

**Los 54 requisitos tienen al menos un test nombrado. Ningun hueco.** Tras la ronda 2, **R40 y R41
estan mejor cubiertos que antes**: R40 ya no se verifica solo contra un doble, sino tambien contra
Postgres real.

## Tests de alcance heredados: tres mas retensados (no borrados)

Al correr la suite completa aparecieron **tres rojos mas**, todos de la misma familia que el de
`unidades`: tests de fichas anteriores que codificaban **«esta ficha NO trae la pantalla, la
pantalla es de QC-26»**. QC-26 llego. Ninguno era una regresion.

| Archivo | Antes | Ahora |
| --- | --- | --- |
| `tests/unit/recetas/scope.test.ts` | `no existe ninguna pantalla, pagina ni componente de recetas` | `la pantalla de recetas vive solo donde la declara QC-26, y en ningun otro sitio` — deriva la carpeta permitida de `FORMULAS_ROUTE`, exige que la `page.tsx` **este ahi**, y que **ningun** archivo de recetas viva fuera de esa carpeta ni en `components/` |
| `tests/unit/recetas/module-contract.test.ts` | `la feature no anade ninguna pantalla ni route handler bajo app/` | `la feature no anade ningun route handler bajo app/, y lib/modules/recetas no cambio de forma` — conserva la prohibicion de route handlers y **anade** que el conjunto de archivos de `lib/modules/recetas/**` es **exactamente** el que dejo QC-25 |
| `tests/unit/inventario/scope.test.ts` | marcaba `product-picker.tsx` como «segunda pantalla de catalogo» | **falso positivo de un barrido por NOMBRE**: ese archivo es el **selector de producto de una linea de receta**, que consume `listProductsAction` — justo lo que R28 y R49 mandan. Se excluye la carpeta de recetas **con el motivo escrito**, y se **anade** la exigencia de que ahi dentro no aparezca ninguna **senal real** de pantalla de catalogo (`page.tsx`, `ProductListSection`, `product-table`) |

**Las tres se comprobaron rompiendo a proposito**, y las tres se pusieron rojas antes de restaurar:
un archivo de recetas temporal bajo `app/(private)/dashboard/` enrojecio los dos de `recetas`; una
`page.tsx` de catalogo bajo otra ruta enrojecio el de `inventario`. **Ninguna quedo vaciada.**

En total, esta feature retenso **cuatro** archivos de test heredados —los tres de arriba mas
`tests/unit/unidades/module-contract.test.ts`— y **no relajo ninguna asercion**: cada una se
sustituyo por otra igual o mas estricta sobre la realidad nueva. Es el precio de ser la ficha que
materializa lo que tres fichas anteriores dejaron declarado como «pendiente de QC-26».

---

## Gate: salida REAL de la verificacion final (corrida por el implementer)

```
pnpm run typecheck   -> limpio, sin errores
pnpm run lint        -> limpio, sin errores
pnpm test            -> Test Files 124 passed (124)
                        Tests      1366 passed (1366)
pnpm run e2e         -> 32 passed (54.6s)   [Chromium y WebKit]
```

El E2E se corrio con el `.env` cargado en el shell (ver T24):
`set -a && source .env && set +a && pnpm run e2e`.

**`./init.sh` completo NO lo corri: lo corre el leader** (`tasks.md > T28`), igual que el PR.

### Nota menor para el reviewer, declarada en vez de omitida

Durante el E2E, la consola del navegador emite un aviso de la libreria de primitivas
(`Base UI: A component that acts as a button expected a native <button>…`). **No es de esta
feature ni la pone roja**: el **mismo** aviso aparece en el recorrido de `inventario.spec.ts`, que
es de QC-22 y esta mergeado. Viene del primitivo de shadcn/ui, no del codigo de QC-26. Se anota
porque es visible en la salida del gate y conviene que no se lea como un hallazgo nuevo.

## Archivos de esta feature, en una lista

**Creados — pantalla** (`app/(private)/produccion/formulas/`): `page.tsx`, `nueva/page.tsx`,
`[id]/page.tsx`, y `components/`: `index.ts`, `recipe-list-params.ts`, `recipe-columns.ts`,
`recipe-table.tsx`, `recipe-table-skeleton.tsx`, `recipe-list-empty.tsx`, `recipe-list-error.tsx`,
`recipe-list-toolbar.tsx`, `recipe-list-section.tsx`, `delete-recipe-dialog.tsx`,
`recipe-form-state.ts`, `recipe-form.tsx`, `recipe-lines-field.tsx`, `product-picker.tsx`,
`unit-picker.tsx`, `recipe-steps-field.tsx`, `recipe-image-field.tsx`.

**Creados — modulo `unidades`**: `domain/actor.ts`, `domain/errors.ts`, `domain/list-units.ts`,
`ports/unit-repository.ts`, `adapters/driven/persistence/unit-prisma.ts`,
`adapters/driving/unit-actions.ts`.

**Creados — tests**: `tests/unit/recetas-ui/{recipe-page.test.tsx, recipe-list-params.test.ts,
recipe-form.test.tsx, recipe-form-payload.test.ts, recipe-lines-unavailable.test.tsx,
recipe-route-contract.test.ts}`, `tests/unit/unidades/{list-units.test.ts, unit-actions.test.ts}`,
`e2e/recetas.spec.ts`.

**Editados — los heredados que R51 autoriza**: `lib/shared/routes.ts`,
`lib/shared/navigation/private-nav.ts`, `lib/composition/route-role-rules.ts`,
`lib/composition/index.ts`, `lib/modules/unidades/index.ts`.

**Editados — registro y tests heredados**: `docs/dependencias.md`, `package.json`,
`pnpm-lock.yaml`, `tests/unit/unidades/module-contract.test.ts`, `tests/unit/recetas/scope.test.ts`,
`tests/unit/recetas/module-contract.test.ts`, `tests/unit/inventario/scope.test.ts`,
`tests/unit/identity/route-role-rules.test.ts`, `tests/unit/identity/route-access.test.ts`,
`tests/unit/app-sidebar.test.tsx`.

**Cero cambios en**: `db/`, `lib/modules/recetas/**`, `lib/modules/inventario/**`,
`components/ui/**`, `app/(private)/layout.tsx`, `components/private/app-sidebar.tsx`.

---

# Ronda 2 — respuesta al review (`progress/review_QC-26-pantalla-de-recetas.md`)

El reviewer RECHAZO la ficha con 3 mayores y 6 menores. Al implementer le tocaban **MAYOR 1,
MAYOR 3 y los menores 1-4**. MAYOR 2 (seis archivos de otra sesion arrastrados a la rama) lo
resolvio el leader en el commit `cc0a547`, verificado aqui: `git diff origin/dev HEAD --
components/ui components/private "app/(private)/inventario"` sale **vacio**. Los menores 5 y 6
son del leader (marcas de T25/T28 y `history.md`).

**Cero cambios de produccion en toda la ronda.** `git diff HEAD -- lib app components db` sale
vacio: los dos mayores se cierran con tests y con margen de tiempo, no tocando el codigo.

## MAYOR 1 — la suite completa estaba roja de forma reproducible (R30 y R31 por timeout)

`tests/unit/recetas-ui/recipe-form.test.tsx`. Se atacaron **las dos causas**, sin debilitar ni
una asercion y sin `retry` (un test que solo pasa a veces seguiria siendo rojo):

1. **`setupUser()`** — `userEvent.setup({ delay: null })`, aplicado a los 19 casos del archivo.
   Por defecto `user-event` intercala un `setTimeout(0)` entre **cada** evento, y estos casos
   emiten cientos. `delay: null` quita **solo** esa espera artificial: la secuencia de eventos
   que recibe el DOM es identica y siguen activas todas las comprobaciones de `user-event`,
   incluida la de `pointer-events`. Medido en aislado, el tiempo de tests del archivo baja de
   **13,90 s a 8,54 s**.
2. **`vi.setConfig({ testTimeout: 30_000 })`** — margen de sobra para la carga de la suite
   entera. No es un parche a un test lento: un formulario completo con popups no se cronometra
   igual que una funcion pura.

**Por que hacian falta las dos.** Con `delay: null` sola, R30/R31 seguian en ~1,3 s en aislado
pero volvian a ~2,0 s con solo tres archivos en paralelo. Medido **bajo la suite completa** ya
con el arreglo puesto (`--reporter=verbose`):

```
R30  2700 ms      R31  3191 ms      R31 (2.o)  1352 ms      R33  961 ms      R34  930 ms
```

Eso explica el fallo original y demuestra el arreglo: contra el `testTimeout` por defecto de
**5000 ms**, R30 y R31 estaban justo en el borde bajo carga -de ahi que expiraran las cuatro
veces que los corrio el reviewer-. Contra los 30 000 ms de ahora el margen es de **~9x**.

**No se toco `tests/baseline-rojos.json`**: sigue vacio. Este rojo era propio, no deuda ajena de
`dev`, y meterlo ahi habria sido esconderlo.

## MAYOR 3 — el adaptador driven ya no puede perder la cota ni el orden en silencio

Nuevo: `tests/integration/unidades/unit-repository.int.test.ts`, que ejercita
`listUnits(limit)` de `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts`
**directamente contra Postgres**, no contra un doble. Dos casos (R40): la **cota** -con una
precondicion explicita de que la tabla tiene mas filas que el limite, para que no pueda quedar
verde por vacuidad- y el **orden** -tres unidades marcadas insertadas en orden NO alfabetico,
filtradas por su marcador-. Aislamiento por la estrategia 2 de `recipe-crud.int.test.ts`
(`listUnits` usa el cliente Prisma global, asi que no admite `$transaction` + ROLLBACK): siembra
con `prisma` real y borra por `id` exacto en un `finally`. Ninguna afirmacion global.

**La prueba de que muerde — las dos mutaciones, ejecutadas y no supuestas:**

| Linea borrada de `unit-prisma.ts` | Resultado |
| --- | --- |
| `take: limit` | **ROJO** — cae `R40: la cota > devuelve exactamente el limite pedido cuando la tabla tiene mas filas que el limite`: `expected 7 to be less than or equal to 2`. El caso del orden sigue verde: cada mutacion mata exactamente su caso. |
| `orderBy: { name: 'asc' }` | **ROJO** — cae `R40: el orden > devuelve las filas ordenadas de forma ascendente por nombre, no en orden de insercion`: esperado `[01, 02, 03]`, recibido `[02, 03, 01]`. Sin `ORDER BY`, Postgres devolvio el orden de heap. |

Tras cada una se restauro el archivo; `git diff --stat lib/` quedo vacio. Es la misma M2/M10 del
reviewer, que antes salia **verde**.

## Los cuatro menores

- **menor 1** (`recipe-route-contract.test.ts`, caso de R51) — fuera el censo de layouts de
  **toda** la zona privada. En su lugar, lo que R51 pide de **esta** feature: la carpeta de la
  ruta de recetas -derivada de `FORMULAS_ROUTE`, nunca de un literal- no contiene ningun
  `layout.tsx`, con `existsSync` de la carpeta y un `length > 0` de sus fuentes para que no
  pueda quedar verde por vacuidad. **Muerde**: creado un `layout.tsx` vacio en esa carpeta, el
  caso cae con `ningun archivo bajo app\(private)\produccion\formulas puede ser un layout`.
  Borrado despues.
- **menor 2** (`tests/unit/recetas/module-contract.test.ts`) — fuera `EXPECTED_RECETAS_MODULE_FILES`,
  la lista literal de 19 rutas de un modulo **ajeno** que congelaba `recetas` (QC-25, ya `done`).
  La misma intencion -«QC-26 no toca `recetas` por la puerta de atras»- se expresa ahora sobre el
  **diff de rama**, como el caso de R44. Intactas la prohibicion de `app/api/recipes|recetas` y la
  defensa `fueraDeSuCarpeta`.
- **menor 3** (`recipe-route-contract.test.ts`, caso de R44) — el `catch` que dejaba `diff = []`
  permitia terminar en `expect(diff).toEqual([])`: verde sin mirar un solo archivo. Ahora el caso
  exige `diff.length > 0` con el mensaje `el rango git origin/dev...HEAD no estaba disponible:
  este caso no ha comprobado nada`. **Muerde**: apuntando el rango a una ref inexistente, caen
  **los dos** casos (este y el de menor 2) con `expected 0 to be greater than 0`. Restaurado.
- **menor 4** (`tests/unit/unidades/list-units.test.ts`) — anadido el quinto caso de R41,
  `con rol nulo se rechaza sin leer del repositorio`, con el mismo doble que **lanza si se le
  llama**. No habia defecto de produccion: `requireAdmin` ya lo manejaba por igualdad estricta;
  faltaba el caso escrito.

## Gate de la ronda 2 — salida REAL

```
pnpm run typecheck   -> tsc --noEmit, sin salida, exit 0
pnpm run lint        -> eslint, sin salida, exit 0

pnpm exec vitest run   (suite COMPLETA, 1.a corrida)
  Test Files  125 passed (125)
  Tests       1369 passed (1369)
  Duration    75.79s

pnpm exec vitest run   (suite COMPLETA, 2.a corrida seguida)
  Test Files  125 passed (125)
  Tests       1369 passed (1369)
  Duration    64.46s
```

Dos corridas completas seguidas, **las dos verdes**, frente al `1364/1366` que el reviewer
reprodujo cuatro veces de cuatro. Los numeros cuadran con lo anadido: **+1 archivo** (el de
integracion, 124 -> 125) y **+3 tests** (dos de R40 y uno de R41, 1366 -> 1369).

Todo se corrio con el entorno del worktree cargado (`set -a && . ./.env && set +a`), contra su
base propia `QuimiCloude_QC26`.

**`./init.sh` completo y el PR siguen siendo del leader** (`tasks.md > T28`). El E2E no se
reejecuto en esta ronda: ningun cambio la toca -cero produccion modificada- y su ultima salida
verde consta arriba.

### Correccion (ronda de cierre, post-revision): la nota de arriba era incorrecta

Esta seccion afirmaba originalmente que `pnpm exec vitest run tests/integration/unidades
tests/unit/unidades` (dos filtros de directorio a la vez) **no ejecuta los tests de
integracion** -que solo seleccionaria archivos del proyecto `node`- y se dejo esa afirmacion
como posible explicacion de por que una mutacion se habia visto en verde en algun momento de
la ronda.

El reviewer comprobo esa afirmacion y **no se reproduce**: con los mismos dos filtros de
directorio (`vitest run tests/integration/unidades tests/unit/unidades`) si corren los tests
de integracion -**9 archivos, 76 tests**, con los casos `|integration|` visibles usando
`--reporter=verbose`-. La nota original era falsa.

La explicacion real de que aquella mutacion se viera en verde en su momento es mas simple: en
ese momento **el test de integracion todavia no existia**, asi que ningun filtro -con uno o con
dos directorios- podia haberlo ejecutado. No fue un problema del selector de archivos de
Vitest con multiples filtros de directorio; fue que el test que debia cazar la mutacion aun no
se habia escrito.

Se deja esta correccion en vez de borrar la nota original en silencio, para que quede rastro de
que la explicacion original fue investigada, resultó falsa y se reemplaza por la correcta.
