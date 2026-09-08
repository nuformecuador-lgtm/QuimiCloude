# QC-26 — pantalla-de-recetas · design.md

La capa visual del catálogo de recetas sobre un backend que ya está `done` (QC-25), **más** la
única operación de solo lectura que falta en `unidades` para que el selector de unidad tenga de
dónde leer. Este documento fija **qué se hereda**, **qué se añade**, **los archivos ajenos que se
tocan y por qué**, la propuesta de dependencia con su aprobación citada, y las alternativas
descartadas. Las decisiones de producto ya las cerró el humano el 2026-09-03
(`requirements.md > Decisiones cerradas`); aquí va su detalle técnico.

## 0. Estado real del repo (verificado, no supuesto)

Comprobado en el worktree `.worktrees/QC-26-pantalla-de-recetas/` el 2026-09-03, antes de escribir
este diseño:

| Hecho | Evidencia |
| --- | --- |
| `FORMULAS_ROUTE = '/produccion/formulas'` está declarada **en `private-nav.ts`** como placeholder | `lib/shared/navigation/private-nav.ts:37` |
| El ítem del sidebar «Fórmulas» ya apunta a esa constante, dentro del grupo «Producción» | `private-nav.ts:174-181` |
| El patrón de mudanza con reexport de compatibilidad ya existe, escrito, para `INVENTORY_ROUTE` | `private-nav.ts:25-31`, `lib/shared/routes.ts:5-13` |
| `PRIVATE_ROUTE_PREFIXES = [DASHBOARD_ROUTE, INVENTORY_ROUTE]`, y su guardia compara lista contra árbol en los **dos** sentidos | `lib/shared/routes.ts:28`, `tests/guards/guard-rutas-privadas-cubiertas.test.ts` |
| La lista de reglas ruta→rol vive en **`lib/composition/route-role-rules.ts`** (no en `identity/domain/`) y hoy tiene **una** fila | `lib/composition/route-role-rules.ts:1-52` |
| Ese archivo tiene que poder cargar en el **borde** (lo alcanza `middleware.ts`): sin Prisma, sin `next/headers`, sin `lib/composition/index.ts` | comentario de `route-role-rules.ts:18-21` + `tests/guards/guard-middleware-edge.test.ts` |
| Las cinco Server Actions de receta existen; **create/update reciben un objeto tipado `unknown`, no `FormData`**; ninguna toma `prevState`; ninguna exporta `INITIAL_STATE`; ninguna llama a `revalidatePath` | `lib/modules/recetas/adapters/driving/recipe-actions.ts:99-173` |
| El contrato público de `recetas` es **importable desde cliente**: esquemas, `validateRecipeImage`, `MAX_IMAGE_BYTES`, errores y tipos de vista | `lib/modules/recetas/index.ts` |
| El esquema de edición distingue los **tres** estados de la imagen (`.nullable().optional()`, nunca `.default()`); el de alta solo dos | `lib/modules/recetas/domain/recipe-input.ts:94-118` |
| La imagen entra al borde como `{ bytes: Uint8Array }`; `validateRecipeImage` es **pura** y corre igual en cliente | `recipe-input.ts:85-87`, `domain/recipe-image.ts:64-75` |
| `RecipeSummary` no trae líneas; `RecipeDetail` sí, y su `productName` es `null` cuando el producto está de baja; `quantity` es **cadena**; `unitId` es una referencia | `lib/modules/recetas/domain/recipe-view.ts` |
| `unidades` **no tiene ningún adaptador driving**; su contrato publica solo `normalizeUnitName` y tres tipos | `lib/modules/unidades/index.ts` |
| Su único adaptador driven expone `findUnitRefs(ids)` — resolver ids conocidos, **no listar** | `lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts:27-36` |
| El modelo `Unit` tiene `id`, `name`, `nameNormalized`, `symbol?`, y **no tiene `deleted_at`** | `db/schema.prisma:344-354` |
| `lib/composition/index.ts` ya cablea `unitCatalog` y la fachada `recetas` | `lib/composition/index.ts:196`, `:229-250` |
| El layout privado **ya monta `<Toaster richColors />`** (QC-22 R22) | `app/(private)/layout.tsx:7,102` |
| Primitivas presentes: `table`, `select`, `alert-dialog`, `sheet`, `sonner`, `button`, `input`, `label`, `card`, `skeleton`, `separator`, `tooltip`, `avatar`, `badge`, `dropdown-menu`, `collapsible`, `sidebar` | `components/ui/` |
| `DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 25`, `toOffsetLimit` acota por encima | `lib/shared/pagination.ts` |
| Precedente completo de pantalla, con parser de `searchParams`, tres estados y `router.refresh()` | `app/(private)/inventario/**` |
| Playwright montado y helper de viewport | `e2e/`, `tests/helpers/viewport.ts` |

**Conclusión operativa.** No falta nada por construir salvo las tres pantallas y **una** operación
de lectura en `unidades`. Layout, sidebar, navegación, `<Toaster />`, Vitest, Playwright y la base
de shadcn/ui **se heredan y no se re-crean** (R51): por eso `tasks.md` abre con **T0**, el mismo
mecanismo que QC-11 puso tras el choque entre las features 4 y 10.

## 1. Archivos: qué se crea y qué se toca

```
lib/shared/routes.ts                     # EDITA: recibe FORMULAS_ROUTE + entra en PRIVATE_ROUTE_PREFIXES
lib/shared/navigation/private-nav.ts     # EDITA: reexport de compatibilidad, etiqueta y RECIPES_LABEL
lib/composition/route-role-rules.ts      # EDITA: segunda regla ruta->rol del repo
lib/composition/index.ts                 # EDITA: cablea la fachada `unidades` (bloque nuevo al final)

lib/modules/unidades/                    # NUEVO dentro de un modulo existente (decision D4)
  domain/actor.ts                        # NUEVO. ADMIN_ROLE_NAME, requireAdmin, Actor (R41)
  domain/errors.ts                       # NUEVO. UnidadesError + UnauthorizedError
  domain/list-units.ts                   # NUEVO. createListUnits({ units }) + MAX_UNITS (R40)
  ports/unit-repository.ts               # NUEVO. listAll(limit) (R42)
  adapters/driven/persistence/unit-prisma.ts   # NUEVO. listUnits(limit) con Prisma
  adapters/driving/unit-actions.ts       # NUEVO. 'use server': listUnitsAction (R40, R41)
  index.ts                               # EDITA: reexporta el caso de uso y sus tipos; NUNCA la action

app/(private)/produccion/formulas/
  page.tsx                               # NUEVO. Lista: metadata + searchParams + Suspense
  nueva/page.tsx                         # NUEVO. Alta (R2, R20)
  [id]/page.tsx                          # NUEVO. Edicion: carga el detalle y precarga (R21)
  components/
    index.ts                             # NUEVO. Barrel de la ruta
    recipe-list-params.ts                # NUEVO. Parser puro de searchParams (R13)
    recipe-list-section.tsx              # NUEVO. Server Component async: llama listRecipesAction
    recipe-columns.ts                    # NUEVO. Columnas como datos (R8, R9)
    recipe-table.tsx                     # NUEVO. Cliente: lista + acciones por fila
    recipe-table-skeleton.tsx            # NUEVO. Estado cargando (R16)
    recipe-list-empty.tsx                # NUEVO. Estado vacio (R15)
    recipe-list-error.tsx                # NUEVO. Estado error + reintento (R17)
    recipe-list-toolbar.tsx              # NUEVO. Tamano de pagina + paginacion (R11, R12)
    delete-recipe-dialog.tsx             # NUEVO. Confirmacion de borrado (R39)
    recipe-form.tsx                      # NUEVO. Cliente: el formulario completo (R22-R26, R35-R38)
    recipe-lines-field.tsx               # NUEVO. Cliente: lineas de producto (R27-R31)
    product-picker.tsx                   # NUEVO. Cliente: selector paginado de producto (R28)
    unit-picker.tsx                      # NUEVO. Cliente: selector de unidad (R30)
    recipe-steps-field.tsx               # NUEVO. Cliente: pasos + arrastre + teclado (R32-R34)
    recipe-image-field.tsx               # NUEVO. Cliente: los tres estados + vista previa (R35-R38)
    recipe-form-state.ts                 # NUEVO. Tipos y armado del payload; puro y testeable
```

**Los cuatro archivos heredados que se editan son exactamente los que R51 autoriza.** Cualquier
otro archivo ajeno que una task pida abrir —y en particular `lib/modules/recetas/**`, que es de
QC-25, `done` y mergeado— es señal de **parar y avisar al leader** (R44).

## 2. La constante de ruta y el ítem del sidebar (R3, R5)

`FORMULAS_ROUTE` **se mueve** de `lib/shared/navigation/private-nav.ts` a `lib/shared/routes.ts`, y
`private-nav.ts` pasa a importarla y a **reexportarla por compatibilidad**, con el mismo comentario
que ya lleva `INVENTORY_ROUTE` desde QC-22. El porqué está escrito allí y no se re-decide: el
middleware y la regla ruta→rol necesitan la constante y **no pueden depender del módulo de
navegación**, que arrastra etiquetas, iconos y agrupación de UI. La flecha ya va
`private-nav → routes`, así que no se invierte nada ni aparece un ciclo.

Dos subrutas, declaradas también como constantes derivadas para que R3 se cumpla también en los
destinos de navegación:

```ts
export const FORMULAS_ROUTE = '/produccion/formulas';
export const NEW_RECIPE_ROUTE = `${FORMULAS_ROUTE}/nueva`;
export function recipeEditRoute(id: string): string { return `${FORMULAS_ROUTE}/${id}`; }
```

`/nueva` es un segmento estático y convive con `[id]` sin ambigüedad: el App Router resuelve el
estático antes que el dinámico. El nombre de las carpetas es el único punto donde la URL aparece
como texto por obligación del framework; como en QC-22, **R3 se comprueba derivando** las rutas
esperadas de la constante (`app/(private)${FORMULAS_ROUTE}/page.tsx`, `…/nueva/page.tsx`,
`…/[id]/page.tsx`) y afirmando que los archivos están ahí, más una guardia de fuente de que ningún
archivo de la feature contiene el literal `'/produccion/formulas'`.

**La etiqueta (R5).** `private-nav.ts` gana `export const RECIPES_LABEL = 'Recetas';` y el ítem la
usa; el `h1` de la pantalla importa **la misma** constante. Así el test afirma sobre una constante
exportada y sobre el negativo que importa —que el ítem ya no dice «Fórmulas»—, y no sobre un
literal de copy (decisión 17). El `testId` del ítem pasa a `nav-produccion-recetas` por el mismo
motivo: un identificador que sigue diciendo «formulas» es una pista falsa para el siguiente.

**Consecuencia sin trabajo extra:** el ítem del sidebar deja de dar 404. De los cinco placeholders
que dejó QC-11, éste deja de serlo; los demás siguen igual y **esta ficha no afirma nada sobre
ellos** (un requisito mide lo que su feature garantiza sobre sí misma).

## 3. Protección: prefijo y regla ruta→rol (R4, R6, R7)

1. **`PRIVATE_ROUTE_PREFIXES` gana `FORMULAS_ROUTE`.** Sin esto,
   `guard-rutas-privadas-cubiertas.test.ts` pone el gate en rojo nombrando `/produccion/formulas`
   en cuanto exista la `page.tsx` — y con razón: `(private)` no aparece en la URL, así que la
   pantalla se serviría **sin sesión**. Un solo prefijo cubre las tres pantallas, porque la guardia
   y el middleware comparan **por segmentos** (`route === prefix || route.startsWith(prefix + '/')`).
2. **`ROUTE_ROLE_RULES` gana su segunda fila**:
   `{ prefix: FORMULAS_ROUTE, roles: [ADMIN_ROLE_NAME] }`, en
   `lib/composition/route-role-rules.ts`, que es donde QC-22 acabó poniéndola tras dos paradas
   fallidas —el recorrido está escrito en ese archivo y **no se repite el experimento**—. Por el
   mismo motivo se reutiliza el `ADMIN_ROLE_NAME` que ya importa ese archivo del barrel de
   `inventario`: **no** se añade un segundo import del mismo valor desde otro barrel, que sería la
   misma constante entrando dos veces por dos puertas.
3. **Ese archivo carga en el borde.** La fila nueva no puede arrastrar nada nuevo: sigue importando
   solo constantes y tipos. `guard-middleware-edge.test.ts` lo comprueba recorriendo el cierre de
   imports desde `middleware.ts`.

**R7, y está escrito aquí porque un rol en una cookie invita al error contrario:** la regla ruta→rol
**no autoriza nada** (QC-9 R29). Los cinco casos de uso de `recetas` llaman a `requireAdmin` como
primera línea y ése es el corte real. Las pantallas **no repiten** `requireAdmin`, no leen la sesión
para decidir qué renderizan y no ocultan columnas por rol: si una action responde
`code: 'unauthorized'`, se pinta el estado de error de R17. Consecuencia deliberada: si alguien
borrase la regla ruta→rol, la pantalla se vería pero **no mostraría ni un dato**.

## 4. Datos de la lista

### 4.1 Contratos de entrada/salida

| Contrato | Valor |
| --- | --- |
| Props de la lista | `searchParams: Promise<{ page?: string \| string[]; pageSize?: string \| string[] }>` |
| Props de la edición | `params: Promise<{ id: string }>` |
| Lista | `listRecipesAction({ page, pageSize })` → `RecipeListResult` (`Page<RecipeSummary>`) |
| Detalle | `getRecipeAction(id)` → `RecipeQueryResult` (`RecipeDetail`) |
| Alta | `createRecipeAction(input)` → `CreateRecipeFormState` (`{ status:'success'; id }`) |
| Edición | `updateRecipeAction(id, input)` → `UpdateRecipeFormState` |
| Borrado | `deleteRecipeAction(id)` → `DeleteRecipeFormState` |
| Productos | `listProductsAction({ page, pageSize })` → `ProductListResult` |
| Unidades | `listUnitsAction()` → `UnitListResult` (§9) |
| Modelo de datos, tablas, RLS, migraciones | **NO APLICA**: cero cambios en `db/` (R44). El esquema de `recipes`/`recipe_lines` es de QC-24 y el de `units` de QC-32 |
| Integraciones externas / variables de entorno | **Ninguna nueva.** Las del Storage ya las declaró QC-25 y esta ficha solo consume la URL que la lectura compone |

**Ojo con la forma de entrada de create/update: no es `FormData`.** QC-25 lo dejó escrito y
razonado —una receta trae listas anidadas que no tienen representación natural en campos planos—.
Consecuencia directa para esta ficha, en §6.

### 4.2 Paginación por URL (R11, R12, R13, R20)

Copia exacta del patrón ya mergeado de QC-22: el estado de lista (`page`, `pageSize`) vive en la
**cadena de consulta**, y `recipe-list-params.ts` es una función pura y testeable sin DOM:

```
parseRecipeListParams(searchParams) -> { page: number; pageSize: 10 | 25 }
```

`page` entero ≥ 1, cualquier otra cosa → 1; `pageSize` solo 10 o 25 —**importados** de
`lib/shared/pagination`, no escritos a mano—, cualquier otra cosa → `DEFAULT_PAGE_SIZE`. Acotar es
de esta capa; validar sigue siendo del dominio (`pageQuerySchema` rechazaría `page: 0` y el usuario
vería un error donde solo esperaba la primera página). Volver del formulario a la lista conserva la
página porque la lista **es** su URL: no hay estado que restaurar (R20).

### 4.3 Los tres estados (R15, R16, R17)

```tsx
<Suspense key={`${page}-${pageSize}`} fallback={<RecipeTableSkeleton rows={pageSize} />}>
  <RecipeListSection page={page} pageSize={pageSize} />
</Suspense>
```

La `key` es lo que hace reaparecer el esqueleto en **cada** cambio de página o de tamaño.
`RecipeListSection` es un Server Component `async` que llama a `listRecipesAction` **una sola vez**
(R10: nunca `getRecipeAction` por fila) y despacha a error / vacío / lista, con el caso
«`items` vacío con `page > 1`» resuelto como enlace a la primera página.

**La imagen en la lista (R18).** `RecipeSummary.imageUrl` ya viene **compuesta** por el backend
(QC-25 R24/R25): la celda la pinta tal cual y **no** hay ninguna dirección de almacenamiento en
esta feature. Si es `null`, se pinta un marcador con `data-testid` y no se emite ningún `<img>` con
`src` vacío —que en algunos navegadores dispara una petición a la propia página—. El test en
negativo de R18 recorre la fuente de la ruta buscando que no aparezca ninguna variable de entorno
de almacenamiento ni ninguna concatenación de URL.

### 4.4 Refresco tras mutar (R24)

Las actions de QC-25 **no revalidan nada** (verificado en §0) y esta ficha **no las toca**. Tras un
`status: 'success'` el componente cliente hace `router.replace(FORMULAS_ROUTE…)` (o `router.back()`
cuando corresponde) seguido de `router.refresh()`, que vuelve a ejecutar el Server Component de la
lista. Mismo criterio y misma deuda anotada que QC-22: `revalidatePath` en las actions sería más
barato si más pantallas repiten el patrón, y eso es ficha de backend.

## 5. Formulario en página propia (R20-R26)

Dos páginas, un solo componente `RecipeForm` en dos modos:

- `nueva/page.tsx` — Server Component; pide **las unidades** (`listUnitsAction`) y la primera página
  de productos, y se las pasa al formulario por props (R49). Modo alta.
- `[id]/page.tsx` — Server Component `async`; llama a `getRecipeAction(id)`. Si responde
  `not_found`, pinta el estado «no encontrada» con enlace a la lista (R21). Si responde
  `unauthorized`, el estado de error (R7). Si responde bien, precarga el formulario con el detalle,
  **incluidas las líneas cuyo `productName` es `null`** (producto de baja): se conservan, se
  reenvían intactas y se señalan como fija §6.1 (decisión cerrada del 2026-09-03).

**Por qué el formulario es controlado y NO usa `useActionState`, apartándose de QC-22.** Dos hechos
del contrato, no gusto: (a) `createRecipeAction(input)` y `updateRecipeAction(id, input)` **no
reciben `prevState`**, así que no encajan en la firma que `useActionState` exige; (b) reciben un
**objeto tipado con listas anidadas**, no `FormData`, así que no hay `<form action={fn}>` que las
produzca. El formulario mantiene su estado en React —líneas y pasos son colecciones que se añaden,
se quitan y se reordenan, que ya obligaba a ello—, arma el payload con `buildRecipePayload()` de
`recipe-form-state.ts` (**función pura**, y ahí es donde se prueban R22, R29, R35 y R36 sin montar
DOM) y lo envía dentro de `useTransition`. `isPending` deshabilita el botón de envío (R37).

**Validación previa (R26, R31).** `createRecipeSchema` / `updateRecipeSchema` se importan del
**barrel** `@/lib/modules/recetas`, que es client-safe, y se ejecutan con `safeParse` antes de
llamar: `error.issues[].path` da el campo o el índice de la línea, y de ahí sale el mensaje
`aria-invalid` + `aria-describedby` junto al control. **No se reescribe ninguna regla**: el tope de
50 pasos, los 1.000 caracteres, el patrón decimal de la cantidad y el rechazo de dos líneas con el
mismo producto son del esquema. El servidor revalida igual: el cliente nunca es la frontera.

**Errores de la operación (R23).** `duplicate_name` → junto al campo nombre; `not_found` →
mensaje con enlace a la lista; `invalid_input` y `unauthorized` → región `role="alert"` del
formulario. Nunca se navega fuera con error, y el estado del formulario no se descarta.

**Éxito (R24).** Se navega a la lista, `toast.success(...)` con el `<Toaster />` que el layout ya
monta (R25: **no se monta otro**; el test lo comprueba renderizando layout + pantalla y contando
regiones), y `router.refresh()`.

## 6. Líneas de producto (R27-R31)

`RecipeLinesField` mantiene un array de `{ key, productId, productName, quantity, unitId }`. `key`
es una clave local de React (no el `id` de la línea): la conciliación es del servidor (QC-25 R11) y
esta pantalla **no manda ids de línea** — el esquema no los admite.

**Selector de producto (R28).** `ProductPicker` carga páginas con
`listProductsAction({ page, pageSize: MAX_PAGE_SIZE })` —**importado**, no el número 25 escrito— y
las anexa **al llegar al final del scroll del propio desplegable** (enmienda del 2026-09-07: antes
eran «página anterior / siguiente» con indicador de página; el requisito de fondo no cambió). Se
compone con los primitivos de `components/ui/autocomplete.tsx` y el hook
`hooks/use-async-paginated-options.ts`, que es quien acumula páginas, aplica el rebote y descarta
lo obsoleto. El tamaño de página sigue siendo `MAX_PAGE_SIZE` y no el defecto de 10 del hook,
porque la primera página baja precargada por props (R49) con ese tamaño y una página de 10 la
dejaría inservible. **No filtra en cliente**: la decisión lo dice y el motivo está escrito en QC-22 (un buscador
que solo mira los 25 descargados es una función que miente). El test en negativo de R28 recorre la
fuente buscando que no haya ningún `.filter(` sobre la lista de productos por texto.

**Cantidad como cadena (R29).** El control es `type="text"` con `inputMode="decimal"` y el patrón
del esquema; **nunca `type="number"`**, porque el valor de un input numérico de HTML pasa por el
binario de coma flotante y `quantity` viaja como cadena a propósito (QC-24/QC-25:
`decimal(14,4)`). El payload la copia **tal cual**. El test de R29 es doble: uno de
comportamiento (escribir `0.1005` y comprobar que la action recibe exactamente esa cadena) y una
guardia de fuente de que en la ruta no aparecen `type="number"` sobre la cantidad, `parseFloat(`,
`Number(` ni `toFixed(` sobre ella.

**Selector de unidad (R30).** `UnitPicker` recibe por props las unidades que la página cargó con
`listUnitsAction()` (§9). Muestra `symbol` cuando existe y `name` cuando no, y **envía el `id`**.
Nunca texto libre: el esquema exige un UUID y el caso de uso comprueba la existencia contra el
catálogo (QC-25 R50).

### 6.1 La línea cuyo producto está dado de baja (R53, R54; decisión cerrada del 2026-09-03)

`RecipeDetail` entrega `productName: null` cuando el producto de esa línea está dado de baja
(QC-25 R18/R45). Eso es el **único** discriminante disponible, y de él salen dos piezas:

| Pieza | Dónde | Cómo se identifica | Requisito |
| --- | --- | --- | --- |
| **Marcador de celda** | en la celda de producto de **esa** línea, dentro de `recipe-lines-field.tsx` | `data-testid="recipe-line-unavailable-<índice>"` (uno por línea afectada; las demás **no** lo llevan) | R53 |
| **Aviso al pie** | último hijo del bloque de líneas, `role="status"` | `data-testid="recipe-lines-unavailable-notice"` con el **número** en un `data-*` propio (`data-count`) además de en el texto | R54 |

- **El aviso es derivado, no un flag.** Se calcula de la lista de líneas en render
  (`lines.filter(l => l.productUnavailable).length`), de modo que quitar una línea baja el número y
  quitar la última **desmonta** el aviso. Un aviso montado con un booleano de carga se quedaría
  pegado y el test de R54 lo cazaría.
- **El test de R54 muerde**: afirma (a) que con cero líneas de baja el nodo **no existe**, (b) que
  con dos existe y su `data-count` es `2`, y (c) que tras quitar una pasa a `1`. Borrar el cálculo,
  el filtro o el desmontaje pone el test en rojo; un test que solo comprobase «aparece algo» seguiría
  verde con el número mentiroso.
- **Ni marcador ni aviso dependen del copy** (decisión 17): los asserts van sobre `data-testid`,
  `role` y `data-count`.
- **La lista NO lleva marca** (R10 ampliado). El motivo es de coste y está en §13.L.
- **Nada de esto altera el payload**: la línea viaja intacta (R21, R22). `buildRecipePayload` **no
  conoce** `productUnavailable`; es un dato de presentación derivado de `productName === null`.

## 7. Pasos, arrastre y teclado (R32-R34)

`RecipeStepsField` mantiene `{ key, text }[]` y envía `steps: string[]` en el orden mostrado.

- **Arrastre (R33):** `@dnd-kit/core` + `@dnd-kit/sortable` con `verticalListSortingStrategy`.
- **Teclado (R34), que no es un extra:** `dnd-kit` trae `KeyboardSensor` con `sortableKeyboardCoordinates`,
  que hace la lista reordenable con `Espacio` para tomar, flechas para mover y `Espacio` para
  soltar, **con el mismo `onDragEnd`** que el ratón. El asa de arrastre es un `<button>` real con
  nombre accesible que incluye la posición, y el cambio se anuncia por la región `aria-live` que
  `DndContext` monta (`announcements`). Es exactamente el motivo por el que el humano prefirió
  dnd-kit a la alternativa: esa parte no la escribimos nosotros.
- **Test de R34, y aquí está el riesgo de test mentiroso:** no basta con afirmar que existe un asa
  enfocable. El test **hace la reordenación entera con teclado** (`user.tab()` hasta el asa,
  `{Space}`, `{ArrowDown}`, `{Space}`) y comprueba **el orden del payload enviado**, que es lo que
  se rompería si alguien quitara el `KeyboardSensor`. Un test que solo mirase el `role` seguiría
  verde con la accesibilidad rota.
- **Multiplataforma (R50):** `PointerSensor` con `activationConstraint: { distance: 8 }`, para que
  arrastrar no secuestre el scroll táctil en móvil. Asas ≥ 44×44 px y **siempre visibles**: nada
  detrás de `:hover`.

## 8. Imagen: los tres estados (R35-R38)

`RecipeImageField` mantiene un estado explícito de tres valores, y ésa es la pieza que no se puede
simplificar:

| Estado interno | Qué se envía en la **edición** | Qué se envía en el **alta** |
| --- | --- | --- |
| `untouched` | el campo `image` **no aparece** en el objeto | el campo no aparece |
| `replaced` (archivo elegido) | `image: { bytes }` | `image: { bytes }` |
| `cleared` (quitar imagen) | `image: null` | **imposible**: el control de quitar no se ofrece en el alta (R36) |

`undefined` y `null` **no son lo mismo** y el payload no puede colapsarlos: `buildRecipePayload` se
prueba con los tres casos comprobando la **presencia de la clave** (`'image' in payload`), no su
valor — un test que solo mirase `payload.image === undefined` pasaría en verde con la clave
presente y el backend conservaría la imagen que el usuario pidió quitar.

**Cómo viajan los bytes.** El esquema de QC-25 espera `{ bytes: Uint8Array }`, así que el cliente
hace `new Uint8Array(await file.arrayBuffer())` y lo pasa como argumento de la Server Action. Los
`TypedArray` son serializables por el protocolo de acciones de React 19; **si al implementar
resultara que no cruzan la frontera, se para y se avisa al leader** — la salida no es tocar el
esquema de QC-25 (`done`), es una decisión de alcance.

**Validación previa (R38).** `validateRecipeImage(bytes)` y `MAX_IMAGE_BYTES` salen del **barrel**
de `recetas`, son puros y corren igual en el navegador: el archivo demasiado grande o con firma que
no es JPEG/PNG/WebP se rechaza **antes** de subir 5 MB por la red, con el mensaje junto al campo. El
servidor lo revalida igual.

**Vista previa (R37).** `URL.createObjectURL(file)` con su `revokeObjectURL` al cambiar o
desmontar. En edición, mientras el estado sea `untouched`, la vista previa es la `imageUrl` que
entrega el detalle (R18).

## 9. La operación de unidades: solo lectura (R40-R44)

`unidades` no tiene hoy ningún adaptador driving. Esta ficha le añade **una** operación, siguiendo
la misma frontera hexagonal con la que QC-25 añadió `ProductCatalog` dentro de `inventario`:

```
domain/list-units.ts     createListUnits({ units }: ListUnitsDeps) -> (actor) => Promise<readonly UnitRef[]>
                         MAX_UNITS = 200      // R40: cota declarada, nunca una consulta sin limite
ports/unit-repository.ts interface UnitRepository { listAll(limit: number): Promise<readonly UnitRef[]> }
adapters/driven/persistence/unit-prisma.ts   listUnits(limit) -> prisma.unit.findMany({ orderBy: { name: 'asc' }, take: limit })
adapters/driving/unit-actions.ts             'use server'; listUnitsAction(): Promise<UnitListResult>
```

**Quién puede invocarla: solo Administrador — CONFIRMADO por el humano el 2026-09-03** (fila 20 de
las decisiones cerradas, pregunta 4). El motivo es técnico y conviene que quede escrito aquí porque
es lo que decide **dónde** va la comprobación: **una Server Action es un endpoint invocable
directamente**, con su id en el bundle, aunque la regla ruta→rol proteja la pantalla que la usa. Un
no-Administrador nunca vería `/produccion/formulas`, pero **sí podría llamar a `listUnitsAction`**
si el rol solo se comprobara en la ruta. Por eso el corte vive **en la operación** (R41) y la regla
ruta→rol es adicional, exactamente el criterio que QC-9 R29 dejó escrito. Ensanchar después es
barato; una fuga no se deshace: si QC-38 o una pantalla de Operador necesitan leer unidades con otro
rol, lo decide esa ficha y R41 se relaja entonces.

- **El actor entra por parámetro (R41).** `listUnitsAction` lo resuelve con
  `identity.getSessionUser()` vía `@/lib/composition`, exactamente como `recipe-actions.ts`, y el
  caso de uso llama a `requireAdmin(actor)` **como primera línea, antes de tocar el repositorio**.
  El test usa un doble del repositorio que **falla si se le llama**: así el requisito «no lee» se
  comprueba de verdad y no por ausencia de aserción.
- **Por qué `unidades` declara su propio `ADMIN_ROLE_NAME`/`requireAdmin`** en vez de importarlos
  del barrel de `inventario`: ese import sería un **valor** en ejecución, y el centinela de
  `tests/unit/inventario/schema/inventario-schema.test.ts` exige `import type` para todo uso del
  barrel de `inventario` fuera de `lib/composition/`. `recetas` ya resolvió esto igual
  (`recetas/domain/actor.ts`). Es un cuarto literal del mismo rol: **deuda consciente y de una
  línea**, la misma que `actor.ts` ya declaró y que no la abre esta ficha.
- **`MAX_UNITS` y por qué no hay paginación.** El catálogo es una lista corta y cerrada —la
  migración de QC-32 siembra cuatro filas— y `unidades` no tiene util de paginación cableado.
  Devolver el catálogo entero ordenado por nombre es lo que el selector necesita; para que no haya
  ninguna consulta sin cota (criterio de QC-25 R30) el repositorio recibe siempre un `take`
  declarado. Si algún día el catálogo crece más allá de esa cota, la paginación es de **QC-38**,
  que es quien va a gestionar unidades.
- **El contrato público NO reexporta la Server Action** (R42): `index.ts` gana `createListUnits`,
  `ListUnitsDeps` y `MAX_UNITS`, y nada con `'use server'` —lo dice su propia cabecera, y
  `CHECKPOINTS.md > Modulos hexagonales` lo exige—.
- **Cableado (R42):** `lib/composition/index.ts` gana una fachada
  `export const unidades = { listUnits: createListUnits({ units: unitRepository }) }` en un
  **bloque nuevo al final**, sin reordenar ni reformatear nada de lo existente (diff mínimo: hay
  otras sesiones tocando ese archivo).
- **Lo que NO entra (R44):** crear, renombrar y borrar unidades son de **QC-38**. El adaptador
  `unit-catalog-prisma.ts` que consume `recetas` **no se toca**: sirve a otro propósito (resolver
  ids conocidos para otro módulo) y mezclarlos convertiría la costura entre módulos en un
  repositorio compartido.

## 10. Dependencia nueva: `dnd-kit` (R45) — excepción aprobada

`docs/architecture.md > Dependencias de terceros` exige decir qué librería, qué código nos ahorra y
el resultado de los cuatro checks. Aquí está, y **la fila del registro tiene que decir qué check
falló y por qué se aceptó, o no vale**.

- **Paquetes:** `@dnd-kit/core` y `@dnd-kit/sortable` (con `@dnd-kit/utilities`, que entra como
  dependencia transitiva de `sortable`).
- **Qué código nos ahorra:** la detección de colisiones, los sensores de puntero y **de teclado**,
  las transformaciones y transiciones de la lista ordenable, y el anuncio `aria-live` del cambio de
  posición. Escrito a mano es la parte cara y frágil de R34 —el equivalente por teclado accesible—,
  no la de arrastrar.
- **Los cuatro checks** (`requirements.md > Decisiones cerradas`, fila 7):
  1. `deprecated` — **PASA** (no está marcada).
  2. **Release en los últimos 12 meses — FALLA.** `@dnd-kit/core` publicó por última vez el
     **2024-12-05** (21 meses) y `@dnd-kit/utilities` el **2023-11-06** (34 meses).
  3. ≥ 10.000 descargas semanales — **PASA**: **24.862.894**.
  4. Licencia MIT/Apache-2.0/BSD/ISC — **PASA**: **MIT**.
- **Alternativa ofrecida y descartada por el humano:** `@atlaskit/pragmatic-drag-and-drop`, que
  **sí pasa los cuatro** (Apache-2.0, publicada el 2026-08-29, 1.343.967 descargas/semana). El
  humano prefirió dnd-kit por su API de listas ordenables.
- **Aprobación:** el humano la aprobó **explícitamente el 2026-09-03** al acotar la ficha, como
  `excepcion` y no como `aprobada`. Se reafirma al aprobar este spec (F1.4), como manda `AGENTS.md`.
  La fila de `docs/dependencias.md` la añade el leader en F1.4 y **debe** decir el check 2 fallido y
  el motivo de la aceptación; sin eso, `guard-dependencias-aprobadas.test.ts` deja el gate rojo
  igualmente por nombre.
- **Riesgo asumido, escrito:** la pregunta abierta 3 lo deja registrado. Salida identificada si una
  versión de React rompe algo: `@atlaskit/pragmatic-drag-and-drop`. Para que esa salida sea barata,
  **todo lo de dnd-kit vive en un solo archivo** (`recipe-steps-field.tsx`): ningún otro componente
  de la ruta lo importa, y una guardia de fuente lo comprueba.

**Ninguna otra dependencia entra.** Todas las primitivas de shadcn/ui que hacen falta (`table`,
`select`, `alert-dialog`, `sheet`, `sonner`, `button`, `input`, `label`, `skeleton`) **ya están en
el repo** desde QC-11 y QC-22: esta ficha probablemente no necesite correr el CLI. Si aun así
hiciera falta alguna, se añade por CLI y **se compara `package.json` antes y después**; si el CLI
añadió una entrada, se **para y se avisa** (regla 7).

## 11. Modelo de datos, RLS y migraciones

**NO APLICA, y se declara en vez de omitirse.** Cero cambios en `db/` (R44): `recipes` y
`recipe_lines` son de QC-24 y `units` de QC-32, las dos mergeadas con su RLS forzada y sus
`down.sql`. Esta feature no añade ninguna columna, índice, restricción ni migración, y no lee ni
escribe ningún dato de negocio fuera del repositorio Prisma de cada módulo.

## 12. E2E (decisión cerrada: SÍ, sin imagen)

`e2e/recetas.spec.ts`, sobre el patrón de `e2e/session.spec.ts` y `e2e/inventario.spec.ts`
(fixtures propios con prefijo `qc26_e2e_`, limpieza de huérfanos por edad, `RUN_ID` por worker,
borrado en `afterAll`). Dos recorridos (R52):

1. **Camino completo del Administrador:** login → la pantalla → «nueva» → nombre + una línea de
   producto (producto de fixture, unidad tomada del selector, cantidad decimal) + un paso →
   guardar → la receta aparece en la lista filtrando por el nombre con `RUN_ID`.
2. **Rechazo del no-Administrador:** sesión válida con otro rol pide la URL y acaba fuera, sin ver
   la lista.

**Sin subida de imagen, y el motivo es de diseño, no de pereza:** exigiría bucket real y red, y el
gate corre sin red a propósito (QC-25 R43) — sería una prueba de infraestructura ajena. Los tres
estados de la imagen se cubren en unitario sobre `buildRecipePayload`, que es donde vive la
distinción que importa.

**Las unidades no se siembran en el E2E:** las cuatro filas las inserta la propia migración de
QC-32, así que el selector tiene contenido sin fixture. Los asserts filtran por el nombre con
`RUN_ID`, **nunca** por «la primera fila» ni por totales: Chromium y WebKit corren a la vez.

## 13. Alternativas descartadas (y por qué)

**A — Panel lateral (`sheet`) como en QC-22.** Reutilizaba el patrón ya mergeado y ahorraba dos
rutas. **Descartada por decisión humana del 2026-09-03**, y el motivo es de tamaño: cuatro bloques
—datos, líneas, pasos, imagen— más un reordenable por arrastre en una columna estrecha es incómodo
en escritorio e inusable en móvil, y el `sheet` no da URL que compartir. Se anota para que el
reviewer vea que la opción se consideró; el coste que asume la decisión —dos navegaciones más— se
mitiga porque la lista conserva su estado en la URL.

**B — Formulario con `<form action>` + `useActionState`, como el resto del repo.** Es el patrón
mergeado y sería consistente. **Descartada por el contrato, no por gusto:** las actions de QC-25 no
reciben `prevState` ni `FormData` (§4.1), así que la firma no encaja; y las listas anidadas no
tienen representación natural en campos planos. La alternativa real sería serializar líneas y pasos
a un campo oculto con JSON, que es un formato propio inventado en la capa visual para esquivar el
contrato tipado que el backend ya expone. §5 documenta la divergencia para que no se lea como
descuido.

**C — `@atlaskit/pragmatic-drag-and-drop`.** Pasa los cuatro checks y evitaría la excepción.
**Descartada por decisión humana del 2026-09-03** a favor de dnd-kit por su API de listas
ordenables. Queda como salida documentada si el riesgo del check 2 se materializa.

**D — Arrastre a mano con la API HTML5 (`draggable` + `dragover`).** Cero dependencias.
**Descartada:** no funciona con toque en móvil sin polyfill, no trae equivalente por teclado —que
es **requisito**, R34— y el anuncio accesible habría que escribirlo entero. Es exactamente lo que
`docs/architecture.md > Dependencias de terceros` dice que no hay que reimplementar.

**E — «Arrastrar ahora, teclado después».** **Descartada por decisión humana**: dejaría la pantalla
inutilizable sin ratón y una deuda de accesibilidad sin ficha.

**F — Leer las unidades ampliando `UnitCatalog.findRefs` o llamándolo con una lista de ids.**
Ahorraba crear caso de uso, puerto y adaptador driving. **Descartada:** `UnitCatalog` es la costura
que `unidades` ofrece **a otros módulos del dominio**, no una API para una pantalla; usarla desde
`app/` obligaría a que un componente pidiera un adaptador driven —cableado fuera de
`lib/composition`, anti-patrón explícito de `docs/architecture.md`— y además `findRefs(ids)` no
sabe listar: habría que inventar los ids que se quieren. La Server Action con su caso de uso es la
misma frontera que ya respeta `recetas`.

**G — Consultar `prisma.unit` desde el Server Component de la página.** Dos líneas.
**Descartada:** es acceso a un modelo ajeno desde fuera de su módulo, lo prohíbe
`CHECKPOINTS.md > Modulos hexagonales` y lo caza `guard-arquitectura-modulos`.

**H — Filtrar productos en el cliente.** **Descartada por decisión humana**, con el motivo técnico
escrito: el backend solo acepta `page`/`pageSize`, así que un buscador de cliente solo miraría
dentro de la página cargada. Es una función que miente. Ficha de backend, y hoy no existe.

**I — `revalidatePath` dentro de las actions de `recetas`.** Más limpio que `router.refresh()`.
**Descartada:** obligaría a abrir `lib/modules/recetas/adapters/driving/`, que es de QC-25, `done` y
mergeado, y R44 lo prohíbe.

**J — Dejar `FORMULAS_ROUTE` en `private-nav.ts` e importarla desde ahí.** Ahorra tocar dos
archivos. **Descartada por decisión humana del 2026-09-03**, con el mismo argumento que ya está
escrito en el repo para `INVENTORY_ROUTE`: el middleware y la regla ruta→rol no pueden depender del
módulo de navegación.

**K — Traer también el CRUD de unidades «ya que estamos».** El formulario lo agradecería el día que
falte una unidad. **Descartada por decisión humana**: es **QC-38**. Aquí entra solo la lectura, y
el catálogo ya viene sembrado por la migración de QC-32, así que ninguna pantalla queda muerta.

**L — Marcar también en la lista la receta que tiene líneas con el producto dado de baja.** Sería
coherente: el usuario vería en el catálogo cuáles necesitan atención sin abrir cada una.
**Descartada el 2026-09-03, y por un coste concreto, no por gusto:** `RecipeSummary` **no trae las
líneas** —es una decisión propia de QC-25, que está `done` y mergeada—, así que la marca solo tendría
dos caminos y los dos son peores que no tenerla:

1. **Añadir un campo al listado del backend** (p. ej. `unavailableLineCount`): abre
   `lib/modules/recetas/**`, que R44 prohíbe expresamente y que es feature ajena ya cerrada.
2. **Pedir el detalle de cada fila**: hasta **25 invocaciones de `getRecipeAction` por página**, que
   es literalmente lo que **R10 prohíbe** y el peor patrón de rendimiento que esta pantalla podía
   adoptar.

Por eso la señal vive **solo en el formulario** (§6.1), que además es **donde el usuario puede
actuar**: en la lista sería una alarma sin remedio a mano. Si algún día el campo entra en el listado,
es ficha de backend y esta decisión se revisa entonces; hoy R10 la prohíbe explícitamente para que
nadie la cuele por consultas por fila sin que nada se ponga rojo.

## 14. Riesgos y cómo se mitigan

1. **La guardia de rutas privadas pone el gate en rojo** en cuanto exista la `page.tsx` sin el
   prefijo. Por eso la task de ruta + prefijo + regla de rol va **antes** que las páginas.
2. **`Uint8Array` a través de la frontera de Server Action.** Si no cruza, **parar y avisar**: no
   se toca el esquema de QC-25.
3. **El CLI de shadcn instala un paquete sin avisar.** Mitiga la comparación obligatoria de
   `package.json`; y probablemente no haga falta correrlo (§10).
4. **`dnd-kit` no se publica desde 2024** (pregunta abierta 3). Mitiga el aislamiento en un solo
   archivo y la salida ya identificada.
5. **Un test de teclado que no prueba el teclado.** El patrón que el reviewer caza desde QC-30 y
   QC-25. Mitiga el criterio explícito de §7: el test afirma sobre el **orden del payload**, no
   sobre la existencia del asa.
6. **Colapsar `undefined` y `null` en la imagen.** Mitiga la prueba por **presencia de clave** de §8.
7. **Conflicto de archivos con otra feature** que toque `lib/shared/routes.ts`,
   `private-nav.ts` o `lib/composition/index.ts`. Lo vigila el leader
   (`AGENTS.md > Paralelismo`); esta ficha declara sus cuatro archivos ajenos en §1 para que se
   pueda vigilar, y el bloque de composición se añade **al final**, sin reordenar.
8. **El E2E ensucia la base y pone rojo un test de integración ajeno** (le pasó a QC-9). Mitiga el
   patrón de prefijos y limpieza de `e2e/session.spec.ts`.
