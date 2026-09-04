# QC-44 — pantalla-de-proveedores · design.md

La capa visual de proveedores sobre un backend que ya está `done` y **mergeado**: QC-43 (las nueve
Server Actions) y QC-52 (la reforma de la línea de catálogo, PR #32, merge `855fae6`). Este
documento fija **qué se hereda**, **qué se crea**, **los archivos ajenos que se tocan y por qué**,
los contratos de entrada/salida, y las alternativas descartadas. Las decisiones de producto ya las
cerró el humano el 2026-09-04 (`requirements.md > Decisiones cerradas`); aquí va su detalle técnico.

## 0. Estado real del repo (verificado, no supuesto)

Comprobado en el worktree `.worktrees/QC-44-pantalla-de-proveedores/` el 2026-09-04, leyendo el
código, **antes** de escribir este diseño.

| Hecho | Evidencia |
| --- | --- |
| `lib/shared/routes.ts` declara `DASHBOARD_ROUTE`, `LOGIN_ROUTE`, `INVENTORY_ROUTE`, `FORMULAS_ROUTE`, `NEW_RECIPE_ROUTE`, `recipeEditRoute(id)`, `FORGOT_PASSWORD_ROUTE`. **No existe ninguna constante de proveedores** | `lib/shared/routes.ts:1-34` |
| `PRIVATE_ROUTE_PREFIXES = [DASHBOARD_ROUTE, INVENTORY_ROUTE, FORMULAS_ROUTE]`, con guardia que compara lista contra árbol en los **dos** sentidos | `lib/shared/routes.ts:46`, `tests/guards/guard-rutas-privadas-cubiertas.test.ts` |
| `ROUTE_ROLE_RULES` vive en `lib/composition/route-role-rules.ts` y hoy tiene **dos** filas (`INVENTORY_ROUTE`, `FORMULAS_ROUTE`), las dos con `ADMIN_ROLE_NAME` importado **como valor** del barrel de `inventario` | `lib/composition/route-role-rules.ts:30-53` |
| Ese archivo tiene que poder cargar en el **borde** (lo alcanza `middleware.ts`): sin Prisma, sin `next/headers`, sin `lib/composition/index.ts` | comentario `route-role-rules.ts:18-21` + `tests/guards/guard-middleware-edge.test.ts` |
| `private-nav.ts` tiene `NAV_SECTION_CHAIN = 'Cadena'`, con un solo ítem de nivel superior en esa sección: el grupo «Producción» | `lib/shared/navigation/private-nav.ts:69,146-160` |
| `NavIconName` incluye `'truck'` y `NAV_ICONS` lo mapea a `Truck` de lucide. **No hace falta icono nuevo** | `private-nav.ts:83-92`, `nav-icons.ts:34-44` |
| Las **nueve** Server Actions de `proveedores` existen: cinco de proveedor, cuatro de catálogo | `lib/modules/proveedores/adapters/driving/supplier-actions.ts`, `supplier-catalog-actions.ts` |
| `create/update/delete` reciben **`FormData`** y `(prevState, formData)` → encajan con `useActionState`. `updateSupplierAction(id, prevState, formData)` y `updateCatalogLineAction(id, prevState, formData)` necesitan `bind` del `id` | `supplier-actions.ts:110-164`, `supplier-catalog-actions.ts:90-184` |
| `get`/`list` reciben argumentos ya tipados (`id: string`, `query: unknown`), no `FormData` | `supplier-actions.ts:167-192`, `supplier-catalog-actions.ts:191-203` |
| Ninguna action llama a `revalidatePath`, **a propósito**: «QC-44 decide qué revalida» | cabecera de `supplier-actions.ts:38-39` |
| Ninguna action exporta un `INITIAL_STATE` (un archivo `'use server'` solo exporta funciones async); el literal `{ status: 'idle' }` lo construye quien consume | `supplier-actions.ts:62-64` |
| Códigos de error estables: `unauthorized`, `not_found`, `duplicate_name`, `duplicate_catalog_line`, `invalid_input`. El de «artículo del inventario no encontrado» **fue borrado por QC-52** | `lib/modules/proveedores/domain/errors.ts` |
| `CatalogLineFields` = `name`, `presentationId` (obligatoria), `unitId` (opcional), `imagePath`, `cost` (cadena), `minPurchase` (cadena\|null), `deliveryTime` (int\|null). **No hay `productId`** | `domain/catalog-line-view.ts:31-42` |
| `CatalogLineView` devuelve `presentationId` y `unitId` **en crudo, sin nombre**, y su cabecera reenvía la resolución a QC-44 | `domain/catalog-line-view.ts:9-13` |
| `SupplierView` = `id`, `name`, `nameNormalized`, `phone`, `email`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`. `createdBy`/`updatedBy` son **ids**, y su cabecera reenvía a QC-44 | `domain/supplier-view.ts:24-43` |
| El contrato público es **importable desde cliente**: esquemas (`createSupplierSchema`, `updateSupplierSchema`, `createCatalogLineSchema`, `updateCatalogLineSchema`), largos máximos, errores, `Page`, `pageQuerySchema` | `lib/modules/proveedores/index.ts` |
| `pageQuerySchema` acepta **solo** `page` y `pageSize`. El defecto 10 y el tope 25 los aplica `lib/shared/pagination` | `domain/page.ts:22-25`, `lib/shared/pagination.ts` |
| La baja de proveedor **arrastra sus líneas vivas** en una sola transacción y con la misma marca de tiempo | `adapters/driven/persistence/supplier-prisma.ts:166-208` |
| `listPresentationsAction(query)` es **paginada** (`Page<PresentationView>`, tope 25) y `createPresentationAction(prevState, formData)` existe | `lib/modules/inventario/adapters/driving/presentation-actions.ts:62,124` |
| `listUnitsAction()` devuelve **todas** las unidades (`UnitRef[]`, cota `MAX_UNITS = 200`), sin paginar, y exige Administrador | `lib/modules/unidades/adapters/driving/unit-actions.ts:43-52` |
| `PresentationSelect` ya existe, no controlado, con `defaultValue`/`error` y campo `presentationId`, con alta en línea y «cargar más» | `app/(private)/inventario/components/presentation-select.tsx` |
| `UnitPicker` de QC-26 existe pero es **controlado** (`value`/`onChange`) | `app/(private)/produccion/formulas/components/unit-picker.tsx:27-35` |
| El layout privado **ya monta `<Toaster />`** (QC-22 R22) | `app/(private)/layout.tsx` |
| Patrón completo de pantalla lista+sheet ya mergeado: parser de `searchParams`, tres estados, `Suspense` con `key`, toolbar | `app/(private)/inventario/**` |
| Patrón de página de detalle con `params: Promise<{ id }>` ya mergeado | `app/(private)/produccion/formulas/[id]/page.tsx` |
| Playwright montado (6 specs) y helper de viewport | `e2e/`, `tests/helpers/viewport.ts` |

**Conclusión operativa.** No falta nada por construir salvo las dos pantallas y sus componentes.
Layout, sidebar, `<Toaster />`, Vitest, Playwright y las primitivas de shadcn/ui **se heredan y no
se re-crean** (R50): por eso `tasks.md` abre con **T0**, el mismo mecanismo que QC-11 puso tras el
choque entre las features 4 y 10.

## 1. Archivos: qué se crea y qué se toca

```
lib/shared/routes.ts                     # EDITA: SUPPLIERS_ROUTE + supplierDetailRoute() + prefijo privado (R2,R3,R5)
lib/shared/navigation/private-nav.ts     # EDITA: SUPPLIERS_LABEL + item de nivel superior en «Cadena» (R4)
lib/composition/route-role-rules.ts      # EDITA: tercera fila ruta->rol, solo Administrador (R6)

components/shared/presentation-select.tsx            # MUEVE aqui el componente de QC-22 (§8.1, R37, R38)
app/(private)/inventario/components/presentation-select.tsx   # BORRA (queda reexportado, ver abajo)
app/(private)/inventario/components/index.ts         # EDITA: reexport de compatibilidad desde components/shared

app/(private)/proveedores/
  page.tsx                               # NUEVO. Lista: metadata + searchParams + Suspense (R1,R14)
  components/
    index.ts                             # NUEVO. Barrel de la ruta (R42)
    supplier-list-params.ts              # NUEVO. Parser puro de searchParams (R8,R10)
    supplier-list-section.tsx            # NUEVO. Server Component async: llama listSuppliersAction (R14,R16,R17,R18)
    supplier-columns.ts                  # NUEVO. Columnas como datos (R12,R14)
    supplier-table.tsx                   # NUEVO. Cliente: filas, enlace al detalle y acciones (R13,R15)
    supplier-table-skeleton.tsx          # NUEVO. Estado cargando (R17)
    supplier-list-empty.tsx              # NUEVO. Estado vacio propio de proveedores (R16)
    supplier-list-error.tsx              # NUEVO. Estado error + reintento (R18)
    supplier-list-toolbar.tsx            # NUEVO. Tamano de pagina + paginacion (R8,R9)
    supplier-field.tsx                   # NUEVO. Campo con label + error accesible (R32,R48)
    supplier-form.tsx                    # NUEVO. Cliente: <form action> + useActionState (R27,R28,R32,R45)
    supplier-sheet.tsx                   # NUEVO. Cliente: panel lateral alta/edicion (R26,R33)
    delete-supplier-dialog.tsx           # NUEVO. Confirmacion con aviso de arrastre (R35)

app/(private)/proveedores/[id]/
  page.tsx                               # NUEVO. Detalle: params + getSupplierAction + Suspense (R19,R20,R24)
  components/
    index.ts                             # NUEVO. Barrel de la ruta de detalle (R42)
    catalog-list-params.ts               # NUEVO. Parser puro de searchParams del catalogo (R8,R10)
    supplier-detail-header.tsx           # NUEVO. Datos de contacto del proveedor (R19)
    supplier-not-found.tsx               # NUEVO. Estado «proveedor inexistente» + vuelta a la lista (R20)
    catalog-directories.ts               # NUEVO. Resolucion id->nombre de presentacion y unidad (R22, §6.2)
    catalog-list-section.tsx             # NUEVO. Server Component async: listCatalogLinesAction (R21,R23,R25)
    catalog-columns.ts                   # NUEVO. Columnas como datos (R12,R21)
    catalog-table.tsx                    # NUEVO. Cliente: filas y acciones (R13,R22,R41)
    catalog-table-skeleton.tsx           # NUEVO. Estado cargando del catalogo (R24)
    catalog-list-empty.tsx               # NUEVO. Estado vacio propio del catalogo (R23)
    catalog-list-error.tsx               # NUEVO. Estado error + reintento (R25)
    catalog-list-toolbar.tsx             # NUEVO. Tamano de pagina + paginacion (R8,R9)
    catalog-line-form.tsx                # NUEVO. Cliente: los siete campos (R29,R30,R31,R32,R41,R45)
    catalog-line-sheet.tsx               # NUEVO. Cliente: panel lateral alta/edicion (R26,R33)
    delete-catalog-line-dialog.tsx       # NUEVO. Confirmacion nombrando la linea (R36)
    unit-select.tsx                      # NUEVO. Cliente: selector de unidad NO controlado (R40, §8.2)

e2e/proveedores.spec.ts                  # NUEVO. Camino completo + rechazo del no-Administrador (R51,R52)
```

**Los archivos ajenos que se editan son exactamente los que R49 autoriza**, más la reubicación de
`presentation-select.tsx` que §8.1 justifica. Cualquier otro archivo ajeno que una task pida abrir
—y en particular `lib/modules/**` y `db/**`— es señal de **parar y avisar al leader** (R49).

## 2. La constante de ruta, el helper de detalle y el ítem de navegación (R2, R3, R4)

`lib/shared/routes.ts` gana, siguiendo literalmente el patrón que ya escribieron `INVENTORY_ROUTE` y
`recipeEditRoute`:

```ts
export const SUPPLIERS_ROUTE = '/proveedores';
export function supplierDetailRoute(id: string): string { return `${SUPPLIERS_ROUTE}/${id}`; }
```

Vive **en `lib/shared/routes.ts` y no en `private-nav.ts`** porque el middleware y la regla ruta→rol
la necesitan y no pueden depender de la navegación, que arrastra etiquetas, iconos y agrupación de
UI (el porqué ya está escrito en el repo para las otras dos constantes y **no se re-decide**).
`private-nav.ts` la importa, como ya importa las demás. **No hace falta reexport de compatibilidad**:
a diferencia de `INVENTORY_ROUTE` y `FORMULAS_ROUTE`, esta constante **nace** aquí, no se muda, así
que nadie la importaba antes de `private-nav`.

El nombre de las carpetas (`proveedores/`, `[id]/`) es el único punto donde la URL aparece como
texto por obligación del framework. Como en QC-22 y QC-26, **R2 y R3 se comprueban derivando** las
rutas esperadas de la constante (`app/(private)${SUPPLIERS_ROUTE}/page.tsx`, `…/[id]/page.tsx`) y
afirmando que los archivos existen, más una guardia de fuente de que ningún archivo de la feature
contiene el literal `'/proveedores'`.

**El ítem de navegación (R4).** `private-nav.ts` gana `export const SUPPLIERS_LABEL = 'Proveedores';`
y un `NavLink` de **nivel superior** en `NAV_SECTION_CHAIN`, con `icon: 'truck'` —que ya existe en
`NavIconName` y en `NAV_ICONS`, así que no se añade ningún icono— y `testId: 'nav-proveedores'`. Va
en la sección «Cadena» junto al grupo «Producción», **no dentro de él**: proveedores es módulo de
dominio propio (épica QC-41, creada expresamente fuera de Catálogos y de Inventario). El test itera
`PRIVATE_NAV_ITEMS` y afirma sobre `SUPPLIERS_ROUTE`, `SUPPLIERS_LABEL` y el `testId`, nunca sobre
el literal del copy (R47).

## 3. Protección: prefijo y regla ruta→rol (R5, R6, R7)

1. **`PRIVATE_ROUTE_PREFIXES` gana `SUPPLIERS_ROUTE`.** Sin esto,
   `guard-rutas-privadas-cubiertas.test.ts` pone el gate en rojo nombrando `/proveedores` en cuanto
   exista la `page.tsx` — y con razón: `(private)` no aparece en la URL, así que las dos pantallas
   se servirían **sin sesión**. **Un solo prefijo cubre lista y detalle**, porque la guardia y el
   middleware comparan por segmentos (`route === prefix || route.startsWith(prefix + '/')`), y
   `/proveedores/<id>` cae dentro.
2. **`ROUTE_ROLE_RULES` gana su tercera fila**: `{ prefix: SUPPLIERS_ROUTE, roles: [ADMIN_ROLE_NAME] }`,
   en `lib/composition/route-role-rules.ts`. Se reutiliza el `ADMIN_ROLE_NAME` que ese archivo ya
   importa del barrel de `inventario`: **no** se añade un segundo import del mismo valor desde el
   barrel de `proveedores` —sería la misma constante entrando dos veces por dos puertas— y **no** se
   escribe un literal nuevo del rol.
3. **Ese archivo carga en el borde.** La fila nueva no arrastra nada: solo añade una constante de
   `lib/shared/routes`, que ya está en su cierre de imports. `guard-middleware-edge.test.ts` lo
   comprueba.

**R7, escrito aquí porque un rol en una cookie invita al error contrario:** la regla ruta→rol **no
autoriza nada** (QC-9 R29). Los nueve casos de uso de `proveedores` llaman a `requireAdmin` como
primera línea y **ése** es el corte real. Las pantallas no repiten `requireAdmin`, no leen la sesión
para decidir qué renderizan y no ocultan columnas por rol: si una action responde
`code: 'unauthorized'`, se pinta el estado de error (R18, R25). Consecuencia deliberada: si alguien
borrase la regla ruta→rol, la pantalla se vería pero **no mostraría ni un dato**.

## 4. Contratos de entrada y salida

| Contrato | Valor |
| --- | --- |
| Props de la lista | `searchParams: Promise<{ page?: string \| string[]; pageSize?: string \| string[] }>` |
| Props del detalle | `params: Promise<{ id: string }>` + los mismos `searchParams` |
| Lista de proveedores | `listSuppliersAction({ page, pageSize })` → `SupplierListResult` (`Page<SupplierView>`) |
| Ficha del proveedor | `getSupplierAction(id)` → `SupplierQueryResult` (`SupplierView`) |
| Alta de proveedor | `createSupplierAction(prevState, formData)` → `CreateSupplierFormState` (`{ status:'success'; id }`) |
| Edición de proveedor | `updateSupplierAction(id, prevState, formData)` → `SupplierMutationFormState` |
| Baja de proveedor | `deleteSupplierAction(prevState, formData)` con `id` en campo oculto → `SupplierMutationFormState` |
| Catálogo | `listCatalogLinesAction(supplierId, { page, pageSize })` → `CatalogLineListResult` (`Page<CatalogLineView>`) |
| Alta de línea | `createCatalogLineAction(prevState, formData)` con `supplierId` en campo oculto → `CreateCatalogLineFormState` |
| Edición de línea | `updateCatalogLineAction(id, prevState, formData)` → `CatalogLineMutationFormState` |
| Baja de línea | `deleteCatalogLineAction(prevState, formData)` con `id` en campo oculto → `CatalogLineMutationFormState` |
| Presentaciones | `listPresentationsAction({ page, pageSize })`, `createPresentationAction(prevState, formData)` |
| Unidades | `listUnitsAction()` → `UnitListResult` (`readonly UnitRef[]`) |
| Modelo de datos, tablas, RLS, migraciones | **NO APLICA**: cero cambios en `db/` (R49). El esquema de `suppliers` y `supplier_catalog_lines` es de QC-43 y su reforma de QC-52 (`20260904123854_split_product_and_supplier_catalog`), ya mergeada con RLS forzada y `down.sql` |
| Integraciones externas / variables de entorno | **Ninguna nueva.** Ni Storage (R30 deja la imagen fuera) ni ninguna otra |

**Nombres de los campos del `FormData`** —los fija el adaptador driving, no esta pantalla, y basta
con leerlos: proveedor `name`, `phone`, `email` (y `id` en la baja); línea `supplierId`, `name`,
`presentationId`, `unitId`, `imagePath`, `cost`, `minPurchase`, `deliveryTime` (y `id` en la baja).
`imagePath` **no se emite**: R30 lo deja fuera y el adaptador ya trata su ausencia como ausencia.

**`useActionState` y el `id`.** Las dos actions de edición tienen la firma
`(id, prevState, formData)`, que no es la que `useActionState` espera. Se resuelve con
`updateSupplierAction.bind(null, supplier.id)` en el componente cliente —el patrón estándar de React
para acciones parcialmente aplicadas— y no cambiando nada del módulo (R49). Las de baja no lo
necesitan: el `id` viaja en un `input` oculto, tal como su código documenta.

## 5. Lista de proveedores

### 5.1 Paginación por URL (R8, R9, R10, R26)

Copia exacta del patrón ya mergeado de QC-22: el estado de lista (`page`, `pageSize`) vive en la
**cadena de consulta**, y `supplier-list-params.ts` es una función pura y testeable sin DOM:

```
parseSupplierListParams(searchParams) -> { page: number; pageSize: 10 | 25 }
buildSupplierListQuery({ page, pageSize }) -> string
```

`page` entero ≥ 1, cualquier otra cosa → 1; `pageSize` solo 10 o 25 —**importados** de
`lib/shared/pagination` (`DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`), nunca escritos a mano—, cualquier
otra cosa → `DEFAULT_PAGE_SIZE`. Acotar es de esta capa; validar sigue siendo del dominio
(`pageQuerySchema` rechazaría `page: 0` y el usuario vería un error donde solo esperaba la primera
página). Que el panel lateral devuelva a la misma página (R26) sale gratis: la lista **es** su URL,
no hay estado que restaurar.

### 5.2 Los tres estados (R16, R17, R18)

```tsx
<Suspense key={`${page}-${pageSize}`} fallback={<SupplierTableSkeleton rows={pageSize} />}>
  <SupplierListSection page={page} pageSize={pageSize} />
</Suspense>
```

La `key` es lo que hace reaparecer el esqueleto en **cada** cambio de página o de tamaño; sin ella
Next reutiliza el límite y el usuario se queda mirando la página anterior. `SupplierListSection` es
un Server Component `async` que llama a `listSuppliersAction` **una sola vez** —nunca
`getSupplierAction` por fila— y despacha a error / vacío / tabla, con el caso «`items` vacío con
`page > 1`» resuelto como enlace a la primera página, igual que `product-list-section.tsx`.

### 5.3 Columnas (R12, R14, R15)

`supplier-columns.ts` declara las columnas **como datos** (clave, etiqueta, `data-testid`): nombre,
teléfono, correo, creado, actualizado. **No hay columna de creador ni de modificador** (R12): el
`SupplierView` trae ids y resolverlos exigiría consumir el contrato de `identity`, que esta ficha no
abre; esto **cierra el reenvío** que QC-43 dejó escrito en `supplier-view.ts`. El test de R12 es en
negativo: recorre las columnas declaradas y afirma que ninguna clave es `createdBy`/`updatedBy`, y
una guardia de fuente comprueba que la ruta no los pinta.

La celda de nombre es el enlace al detalle, construido con `supplierDetailRoute(id)` (R3). Las
acciones de fila (editar, dar de baja) van en una columna final **siempre visible** —nada detrás de
`:hover` (R48)—.

## 6. Página de detalle

### 6.1 Estructura (R19, R20)

`[id]/page.tsx` es un Server Component `async` que:

1. resuelve `params` y `searchParams`;
2. llama a `getSupplierAction(id)`;
3. si responde `not_found` → `<SupplierNotFound />` con vuelta a `SUPPLIERS_ROUTE` (R20);
   si responde `unauthorized` u otro error → el estado de error (R7);
4. si responde bien → `<SupplierDetailHeader supplier={…} />` con nombre, teléfono y correo, y
   debajo el catálogo dentro de su propio `<Suspense>` con `key` (R24).

El catálogo se pagina con su propia cadena de consulta (`catalog-list-params.ts`), con los mismos
nombres de parámetro y las mismas dos opciones de tamaño (R8–R11). **Es un parser propio, no el de
la lista de proveedores**: importar el de la otra ruta sería atar dos rutas por sus componentes
internos, y el precedente del repo es que cada ruta tenga el suyo.

### 6.2 Resolver los nombres de presentación y de unidad (R22)

`CatalogLineView` entrega `presentationId` y `unitId` **en crudo** —QC-52 lo dejó escrito y lo
reenvió aquí—. `catalog-directories.ts` construye, **en el servidor y una sola vez por render de la
sección** (nunca por fila), dos diccionarios `Map<string, string>`:

- **Unidades:** una llamada a `listUnitsAction()`, que devuelve el catálogo entero acotado a 200 por
  QC-26. Sin paginación que gestionar.
- **Presentaciones:** `listPresentationsAction` **solo existe paginada** (tope 25). Se recorren
  páginas mientras `page < totalPages` y **hasta una cota declarada**,
  `MAX_PRESENTATION_PAGES = 20` (500 presentaciones), para que no exista ninguna secuencia de
  consultas sin límite superior (mismo criterio que `MAX_UNITS` de QC-26).

SI un identificador no aparece en su diccionario —porque la unidad es `null`, porque la
presentación quedó fuera de la cota, o porque el directorio falló—, la celda pinta un **marcador
identificable** (`data-testid` propio) y **nunca el uuid** (R22). El test de R22 es doble: con el id
en el diccionario sale el nombre; con el id fuera sale el marcador y la fuente no contiene el
identificador.

**Esto es una solución de pantalla a una carencia de backend, y así queda anotado** (`P4`): la
solución de fondo sería una operación de lectura de presentaciones por ids o sin paginar, y eso es
ficha de backend, no un añadido aquí (R49 prohíbe abrir `lib/modules/`).

## 7. Formularios: panel lateral, `<form action>` y `useActionState` (R26–R33, R45)

Los cuatro paneles —alta y edición de proveedor, alta y edición de línea— usan **dos** componentes de
formulario (`SupplierForm`, `CatalogLineForm`), cada uno en dos modos, dentro de un `sheet` de
shadcn/ui. El patrón es exactamente el de `product-form.tsx` de QC-22, que ya está mergeado:

- `<form action={formAction}>` **no controlado**, `useActionState(action, { status: 'idle' })` —el
  literal se construye aquí porque un archivo `'use server'` no puede exportar constantes (§0)—, y
  `useFormStatus`/`isPending` para deshabilitar el botón de envío.
- **La validación previa usa los esquemas del contrato público** (`createSupplierSchema`,
  `updateCatalogLineSchema`…), importados del **barrel** de `proveedores`, que es client-safe (§0).
  No se reescribe ninguna regla: el patrón decimal, los largos máximos y la obligatoriedad de la
  presentación son del esquema. El servidor revalida igual: el cliente nunca es la frontera.
- **Ninguna dependencia nueva** (R45): no entra `react-hook-form`, no se corre `shadcn add form`.
  La decisión ya la cerró QC-22 al aprobar su spec y la tabla de esta ficha la repite.

**Traducción de errores por `code`, nunca por texto (R32).** El mapa vive en un solo sitio por
formulario:

| `code` | Dónde se pinta |
| --- | --- |
| `duplicate_name` | junto al campo **nombre** del proveedor |
| `duplicate_catalog_line` | junto al campo **nombre** de la línea, indicando que la pareja nombre + presentación ya existe |
| `invalid_input` | junto al campo cuando el esquema del cliente ya lo señaló; si no, en la región `role="alert"` del formulario |
| `not_found` | región del formulario, con vuelta a la lista |
| `unauthorized` | región del formulario |

**Éxito (R33).** Se cierra el panel, `toast.success(...)` sobre el `<Toaster />` que el layout ya
monta (R34: **no se monta otro**; el test lo comprueba renderizando layout + pantalla y contando
regiones) y `router.refresh()`, que vuelve a ejecutar el Server Component de la lista. **No se llama
a `revalidatePath`**: exigiría abrir `lib/modules/proveedores/adapters/driving/`, que R49 prohíbe;
misma deuda anotada que QC-22 y QC-26.

## 8. Los dos selectores de la línea

### 8.1 Presentación, con alta en línea (R37, R38, R39)

El componente que hace exactamente esto **ya existe y está mergeado**: `PresentationSelect` de
QC-22 —no controlado, `defaultValue`/`error`, campo `presentationId`, «cargar más» sobre
`listPresentationsAction` con `MAX_PAGE_SIZE` importado, alta en línea con
`createPresentationAction` sin anidar formularios—. Su API es **la misma** que necesita el
formulario de la línea, campo incluido.

Por eso **se promueve a `components/shared/presentation-select.tsx`**, que es lo que
`docs/architecture.md > Regla: sin sobre-ingeniería` manda cuando **dos** features lo necesitan con
la misma API. El barrel de la ruta de inventario pasa a reexportarlo desde la ubicación nueva, de
modo que ni `product-form.tsx` ni sus tests cambian de import. Los tests existentes que apunten al
archivo por su ruta se actualizan a la nueva ubicación en la misma task, y el gate de QC-22 tiene
que seguir verde: si no lo está, **se para y se avisa**.

**Riesgo declarado:** si otra feature en vuelo estuviera tocando
`app/(private)/inventario/components/**`, la mudanza conflictúa. Lo vigila el leader
(`AGENTS.md > Paralelismo`); la alternativa, si el leader lo decide, está en §13.B.

R39 se cumple por construcción: de las cuatro operaciones de presentación que el módulo expone,
este componente importa **solo** listar y crear.

### 8.2 Unidad, sin alta (R40)

`unit-select.tsx` es **propio de esta ruta** y **no controlado**: el `sheet` de la línea usa
`<form action>`, así que el valor tiene que viajar en el `FormData` con el nombre `unitId`, no en
estado de React. `UnitPicker` de QC-26 **no sirve tal cual**: es controlado (`value`/`onChange`,
§0), porque el formulario de receta sí mantiene su estado en React. Promoverlo obligaría a cambiarle
la API y con ella el formulario de recetas, que es feature ajena ya cerrada — exactamente lo que
`docs/architecture.md` describe como promoción prematura, y lo que R49 prohíbe.

Las unidades **llegan por props** (R46): las pide **una vez** el Server Component de la página de
detalle con `listUnitsAction()` y bajan por `CatalogLineSheet` → `CatalogLineForm` → `UnitSelect`.
Muestra `symbol` cuando existe y `name` cuando no —mismo criterio que QC-26—, ofrece una opción
explícita **«sin unidad»** que envía cadena vacía (el adaptador driving ya traduce vacío a ausencia)
y **no ofrece crear ninguna unidad**: eso es QC-38 y su pantalla QC-39.

## 9. Importes y campos numéricos (R41)

`cost` y `minPurchase` viajan como **cadena decimal** de punta a punta. En consecuencia:

- El control es `type="text"` con `inputMode="decimal"` y el patrón del esquema; **nunca
  `type="number"`**, porque el valor de un input numérico de HTML pasa por el binario de coma
  flotante.
- La celda de la tabla pinta la cadena **tal cual la entrega la consulta**. Sin `Intl.NumberFormat`,
  sin `toFixed`, sin división ni multiplicación.
- `deliveryTime` **sí** es entero (`z.number().int()`) y ahí `type="number"` con `step="1"` es
  correcto: el adaptador ya rechaza lo que no sea entero antes de llamar al caso de uso.
- El test de R41 es doble: uno de comportamiento (escribir `0.1005` y comprobar que la action recibe
  exactamente esa cadena) y una guardia de fuente de que en las dos rutas no aparecen `parseFloat(`,
  `Number(` ni `toFixed(` sobre el costo o el mínimo, ni `type="number"` en esos dos campos.

## 10. Modelo de datos, RLS y migraciones

**NO APLICA, y se declara en vez de omitirse.** Cero cambios en `db/` (R49): `suppliers` y
`supplier_catalog_lines` son de QC-43 y su reforma de QC-52, las dos mergeadas con su RLS forzada y
su `down.sql`. Esta feature no añade ninguna columna, índice, restricción ni migración, y no lee ni
escribe ningún dato de negocio fuera de las Server Actions de los módulos.

## 11. Dependencias de terceros

**Ninguna nueva** (R45). Todas las primitivas de shadcn/ui que hacen falta —`table`, `select`,
`sheet`, `alert-dialog`, `sonner`, `button`, `input`, `label`, `skeleton`— **ya están en el repo**
desde QC-11 y QC-22, así que esta ficha probablemente no necesite correr el CLI. Si aun así hiciera
falta alguna primitiva, se añade por CLI y **se compara `package.json` antes y después**; si el CLI
añadió una entrada, se **para y se avisa** (regla 7 de `CLAUDE.md`;
`tests/guards/guard-dependencias-aprobadas.test.ts` lo pondría en rojo igualmente). No se propone
ninguna librería: no hay en esta ficha ningún problema —fechas, drag&drop, decimales, tablas
virtualizadas— que el repo no resuelva ya con lo instalado.

## 12. E2E (R51, R52)

`e2e/proveedores.spec.ts`, sobre el patrón ya mergeado de `e2e/inventario.spec.ts` y
`e2e/recetas.spec.ts`: fixtures propios con prefijo `qc44_e2e_`, `RUN_ID` por worker, limpieza de
huérfanos por edad y borrado en `afterAll`. Dos recorridos:

1. **Camino completo del Administrador (R51):** login → `SUPPLIERS_ROUTE` → alta de proveedor →
   entrar a su detalle → añadir una línea (nombre con `RUN_ID`, presentación tomada del selector,
   costo decimal) → la línea aparece en la lista del catálogo.
2. **Rechazo del no-Administrador (R52):** sesión válida con otro rol pide `SUPPLIERS_ROUTE` y acaba
   fuera, sin ver la lista.

Los asserts filtran **por el nombre con `RUN_ID`**, nunca por «la primera fila» ni por totales:
Chromium y WebKit corren a la vez. Si la base de E2E no tuviera ninguna presentación, el recorrido 1
crea una con el alta en línea del selector (R38), que es justamente el motivo de que exista.

## 13. Alternativas descartadas (y por qué)

**A — Una sola pantalla, con el catálogo desplegable dentro de la fila del proveedor.** Ahorraba una
ruta. **Descartada por decisión humana del 2026-09-04**, y el motivo también es técnico:
`listCatalogLinesAction` es una consulta paginada **por proveedor**, así que meterla dentro de una
fila obligaría a una consulta por fila desplegada y a dos paginaciones anidadas en el mismo
documento. La página de detalle es la única forma que da sitio a esa lista, y es el patrón de QC-26.

**B — Duplicar el selector de presentación en la ruta de proveedores en vez de promoverlo a
`components/shared/`.** Cero archivos ajenos tocados y cero riesgo de conflicto con QC-22.
**Descartada:** serían dos copias de un componente con lógica real —paginación acumulativa, alta en
línea, traducción de `duplicate_name`— que divergirían al primer arreglo, y
`docs/architecture.md > Regla: sin sobre-ingeniería` dice exactamente cuándo se promueve: cuando dos
features lo necesitan **con la misma API**, que es el caso. Queda como **salida documentada** si el
leader detecta conflicto de archivos con otra feature en vuelo (§8.1).

**C — Promover también `UnitPicker` de QC-26.** Sería simétrico con B. **Descartada:** su API es
controlada (`value`/`onChange`) y este formulario es no controlado; unificarlas obligaría a cambiar
el formulario de recetas, feature ajena ya cerrada, y R49 lo prohíbe. No es la misma API, así que la
regla de promoción no se cumple.

**D — Formulario controlado, como el de recetas.** **Descartada por el contrato, no por gusto:** las
actions de proveedores reciben `(prevState, FormData)` (§0), que es justo la firma de
`useActionState`; el proveedor y la línea son campos planos, sin listas anidadas. El patrón no
controlado es el más barato y el que ya está probado en `product-form.tsx`.

**E — `react-hook-form` + `shadcn add form`.** **Descartada:** son dos entradas nuevas en
`package.json` bajo la regla 7, y la tabla de decisiones de esta ficha las veta expresamente
remitiendo a QC-22 P2, que se resolvió en «no entra» al aprobar aquel spec.

**F — Resolver el nombre de la presentación pidiendo el detalle por fila.** Sería exacto.
**Descartada:** son hasta 25 consultas por página, el peor patrón de rendimiento que esta pantalla
podía adoptar, y además `inventario` no expone ninguna consulta de presentación por id. El
diccionario de §6.2 se construye una vez por render.

**G — Añadir a `inventario` una operación de listar presentaciones sin paginar (o por ids).** Es la
solución de fondo de P4 y dejaría R22 sin marcador. **Descartada:** abre `lib/modules/`, que R49
prohíbe expresamente, y es ficha de backend. Queda anotada como P4.

**H — Mostrar el nombre de quien creó o modificó.** El dato (el id) está en la vista.
**Descartada por decisión humana del 2026-09-04:** resolver ids a nombres exige consumir el contrato
público de `identity`, trabajo nuevo que la ficha del board no pide. Mismo criterio que QC-22.

**I — Buscar o filtrar proveedores en el cliente.** **Descartada por decisión humana**, con el motivo
técnico escrito: `pageQuerySchema` solo acepta `page` y `pageSize`, así que un buscador de cliente
solo miraría dentro de la página visible. Es una función que miente. Si se quiere, es ficha de
backend.

**J — Declarar `SUPPLIERS_ROUTE` en `private-nav.ts`.** Ahorra tocar un archivo.
**Descartada por decisión humana del 2026-09-04**, con el mismo argumento ya escrito en el repo para
`INVENTORY_ROUTE` y `FORMULAS_ROUTE`: el middleware y la regla ruta→rol no pueden depender del
módulo de navegación.

**K — Dos filas en `PRIVATE_ROUTE_PREFIXES`, una para la lista y otra para el detalle.**
**Descartada:** la comparación es por segmentos, así que la segunda fila sería redundante y la
guardia —que compara en los dos sentidos— la señalaría como prefijo sin pantalla propia.

**L — Poner el ítem de navegación dentro del grupo «Producción».** Ahorra un ítem de nivel superior.
**Descartada por decisión humana del 2026-09-04:** proveedores es módulo de dominio propio (épica
QC-41, creada fuera de Catálogos y de Inventario), y colgarlo de Producción lo escondería bajo un
área que no es la suya.

**M — Un `revalidatePath` dentro de las actions de `proveedores`.** Más limpio que
`router.refresh()`. **Descartada:** obligaría a abrir
`lib/modules/proveedores/adapters/driving/`, feature ajena ya mergeada, y R49 lo prohíbe. Las
propias actions dejaron escrito que «QC-44 decide qué revalida»; lo decide, y lo decide **en la
pantalla**.

## 14. Riesgos y cómo se mitigan

1. **La guardia de rutas privadas pone el gate en rojo** en cuanto exista la `page.tsx` sin el
   prefijo. Por eso la task de constante + prefijo + regla de rol va **antes** que las páginas.
2. **La mudanza de `PresentationSelect` conflictúa con otra feature en vuelo.** Mitiga la salida
   documentada de §13.B y la declaración de archivos ajenos de §1.
3. **El diccionario de presentaciones se queda corto** en un catálogo grande. Mitiga el marcador de
   R22 —la celda nunca miente ni enseña un uuid— y la anotación P4.
4. **Un test que solo comprueba que «aparece algo»** en los estados vacío/cargando/error. Mitiga el
   criterio de R16/R23: los dos vacíos son **distintos** y el test afirma sobre `data-testid`
   distintos, no sobre la existencia de un nodo cualquiera.
5. **Colar el `id` en `useActionState`.** Si `bind` no encajara con la firma real al implementar, se
   **para y se avisa**: la salida no es tocar el adaptador driving de QC-43.
6. **El E2E ensucia la base y pone rojo un test de integración ajeno** (le pasó a QC-9). Mitiga el
   patrón de prefijos `qc44_e2e_` y limpieza de `e2e/session.spec.ts`.
7. **El CLI de shadcn instala un paquete sin avisar.** Mitiga la comparación obligatoria de
   `package.json` (§11); y probablemente no haga falta correrlo.
