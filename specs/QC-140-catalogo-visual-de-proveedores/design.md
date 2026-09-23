# QC-140 — catalogo-visual-de-proveedores · design.md

> Escrito por spec_author (F1.2) el 2026-09-23, sin red: ningún dato de npm de este archivo está
> verificado contra el registro (ver `## 7`). Las siete preguntas abiertas de `requirements.md`
> siguen abiertas; `## 8` da para cada una la opción recomendada y qué cambia con la otra, para que
> se cierren en F1.4 sin reescribir el spec.

## 0. Lo que hay hoy (leído en el código, no supuesto)

| Hecho | Dónde |
| --- | --- |
| `/proveedores` pinta la tabla compartida (`DataTable`) con búsqueda, orden y paginación, y en cada fila los controles de **edición** (`SupplierSheet supplier=…`) y **baja** (`DeleteSupplierDialog`) | `app/(private)/proveedores/components/supplier-table.tsx:74-85` |
| La página de detalle `/proveedores/<id>` pinta **solo** nombre, teléfono, correo, el catálogo y la subida de documentos. **No** tiene edición ni baja del proveedor | `app/(private)/proveedores/[id]/page.tsx`, `[id]/components/supplier-detail-header.tsx` |
| `SupplierSheet` sin proveedor es el alta; al guardar cierra, avisa con toast y hace `router.refresh()` | `components/supplier-sheet.tsx:46-75` |
| `EntityImage` cubre `null`, `''` y `onError`, con miniatura **fija de 60 px** y `loading="lazy"` | `components/shared/entity-image.tsx` |
| `listCatalogLines` ya pagina las líneas vivas de un proveedor vivo de la empresa, con búsqueda por `name_normalized` (subcadena, sin mayúsculas ni acentos) y orden `name` admitido | `domain/list-catalog-lines.ts`, `supplier-catalog-line-queryable.ts`, `supplier-catalog-line-prisma.ts:524-578` |
| `listSuppliers` (QC-57) filtra por nombre de **proveedor**; no hay consulta que filtre proveedores por el nombre de una **línea** | `domain/list-suppliers.ts`, `supplier-prisma.ts` |
| Índices ya existentes que sirven a esta vista: GIN de trigramas parciales sobre `suppliers.name_normalized` y `supplier_catalog_lines.name_normalized`, `suppliers_name_idx`, `supplier_catalog_lines_name_idx`, `supplier_catalog_lines_company_id_supplier_id_idx` | `db/migrations/20260904160000_list_query_indexes`, `db/schema.prisma` |
| No hay ninguna librería de intersección ni de scroll infinito en `package.json` ni en `pnpm-lock.yaml`; ningún archivo de `app/`, `components/`, `hooks/` o `lib/` usa `IntersectionObserver` | búsqueda en el árbol |
| `swr` **no** está instalado, aunque `docs/architecture.md > Stack` lo nombre | `package.json` |

## 1. Modelo de datos

**Sin tablas, sin columnas y sin migración.** La vista lee `suppliers` y `supplier_catalog_lines`,
las dos del módulo `proveedores` y las dos ya con `company_id`, `deleted_at`, RLS y los índices de
la tabla de arriba. El filtro de producto (subcadena sobre `name_normalized`) lo sirve el GIN de
trigramas; el recorte por proveedor lo sirve `(company_id, supplier_id)`.

Si en la integración (T5) el plan de la consulta de existencia (`EXISTS` de líneas por proveedor)
saliera secuencial sobre una base con volumen, el índice que faltara entra con su `down.sql`,
nombre en inglés y parcial sobre `deleted_at IS NULL` (R29). Hoy no se prevé ninguno.

## 2. Dominio (`lib/modules/proveedores/domain/`)

### 2.1 Tipos y constantes — `supplier-showcase.ts` (nuevo)

```ts
export const SHOWCASE_SUPPLIER_BATCH = 5;   // D7
export const SHOWCASE_LINE_BATCH = 10;      // D7

export type ShowcaseLine = { readonly id: string; readonly name: string; readonly imagePath: string | null };
export type ShowcaseRow = {
  readonly id: string;
  readonly name: string;
  readonly lines: readonly ShowcaseLine[];   // <= SHOWCASE_LINE_BATCH
  readonly hasMoreLines: boolean;
};
export type ShowcasePage = { readonly items: readonly ShowcaseRow[]; readonly page: number; readonly hasMore: boolean };
export type ShowcaseLinesPage = { readonly items: readonly ShowcaseLine[]; readonly page: number; readonly hasMore: boolean };
```

- Los tipos **no llevan** `createdBy`, `updatedBy`, fechas, costo ni presentación: la vista pinta
  imagen y nombre (R7) y lo que no viaja no se puede pintar por descuido (R8, D11).
- Los tamaños de tanda son **constantes del dominio y no entrada**: el cliente no puede pedir 500
  líneas. El cliente los importa del barrel solo para dibujar el esqueleto.

### 2.2 Esquemas de entrada (zod, dentro del caso de uso)

- `showcaseQuerySchema`: `{ page: int >= 1 (defecto 1), supplierSearch: string trim max 120 (defecto ''), productSearch: string trim max 120 (defecto '') }`. El tope 120 es el mismo `SEARCH_MAX_LENGTH` del contrato genérico de QC-57, para que las dos búsquedas del módulo no discrepen.
- `showcaseLinesQuerySchema`: `{ page: int >= 2, productSearch: string trim max 120 (defecto '') }`. La página 1 de una fila la trae siempre la tanda de proveedores; pedirla por aquí sería una segunda fuente de la misma cosa.

Un término que se normaliza a vacío es ausencia de filtro (R24): lo resuelve
`normalizedSearchCondition`, que ya lo hace.

### 2.3 Casos de uso (nuevos)

1. **`createListSupplierShowcase({ suppliers, log })`** — `(input: unknown, actor) => Promise<ShowcasePage>`.
   Orden fijo de QC-57: `requirePermission(actor, 'proveedores.consultar')` **primero** (R4),
   después zod, después el puerto con `scope = { companyId: actor.companyId }`.
2. **`createListShowcaseLines({ catalog })`** — `(supplierId: string, input: unknown, actor) => Promise<ShowcaseLinesPage>`.
   Mismo orden. Llama al puerto **ya existente** `SupplierCatalogRepository.listBySupplierAlive`
   con una consulta construida en el dominio —`{ page, pageSize: SHOWCASE_LINE_BATCH, search:
   productSearch (según P1), sort: SHOWCASE_LINE_SORT, filters: {} }`—, traduce
   `'supplier_not_found'` a `SupplierNotFoundError` (R28) y proyecta `CatalogLineView` a
   `ShowcaseLine`. `hasMore = page < totalPages`.

`SHOWCASE_SUPPLIER_SORT` y `SHOWCASE_LINE_SORT` viven en `supplier-showcase.ts` y son la única
definición del orden de la vista (P4). Que el «cargar más» y la primera tanda de una fila usen
**el mismo orden y el mismo filtro** es lo que hace cierto R17; por eso los dos salen del dominio
y el adaptador de la tanda de proveedores reutiliza el constructor de `where`/`orderBy` del
catálogo en vez de escribir otro (`## 3`).

### 2.4 Contrato (`index.ts`)

Reexporta de `./domain`: las dos factories con sus `*Deps`, los cinco tipos y las dos constantes
de tanda. Nada de `adapters/` ni `ports/`.

## 3. Puerto y adaptador driven

**`SupplierRepository` gana un método**, `listShowcaseAlive(query: ShowcaseQuery, scope:
SupplierScope): Promise<ShowcasePage>`, con el `scope` al final y obligatorio como los otros cinco.
Va en este puerto porque lo que se pagina son proveedores. `guard-ambito-empresa-proveedores`
cuenta los métodos por puerto (`metodosEsperados: 5`) y pasa a 6 en la misma task.

Implementación en `supplier-prisma.ts` (`listShowcaseAliveSuppliers`):

1. `where` de proveedores: `deletedAt: null` + `supplierCompanyScope(scope)` + búsqueda de
   proveedor contra `name_normalized` (mismo `normalizedSearchCondition(…, normalizeSupplierName)`
   que QC-57) + **si hay filtro de producto**, `catalogLines: { some: <where de línea viva de la
   empresa que coincide> }` (R20). Con P2 = B se añade además `catalogLines: { some: <línea viva
   de la empresa> }` cuando no hay filtro de producto.
2. `findMany` de proveedores con `orderBy` = orden de P4 + `id` de desempate (R31), `skip =
   (page - 1) * 5`, **`take: 6`**: la sexta fila solo dice `hasMore` y se descarta. Así no hace
   falta `count`.
3. Para los ≤5 proveedores, **una** `findMany` de líneas por proveedor, en paralelo, con
   `where = buildCatalogLineWhere(supplierId, lineQuery, scope)` y `orderBy =
   catalogLineOrderBy(lineSort)` —las dos funciones **exportadas hoy** por
   `supplier-catalog-line-prisma.ts` y que usa el «cargar más»— y **`take: 11`**: la undécima solo
   dice `hasMoreLines`. Importar un driven del mismo módulo está permitido (`docs/architecture.md >
   Nota sobre driven -> driven`).
4. `select` mínimo: `id`, `name` del proveedor; `id`, `name`, `imagePath` de la línea.

Coste: **1 + 5 consultas por tanda**, acotado por la constante y no por los datos. Todas pasan por
las envolturas de `company-scope.ts`, que es lo que exige la guardia de ámbito.

## 4. Server Actions (`adapters/driving/supplier-actions.ts`)

Dos nuevas, en el archivo existente para reutilizar su `currentActor()` (una lectura de sesión por
invocación, QC-104):

```ts
export type SupplierShowcaseResult = { status: 'success'; data: ShowcasePage } | ErrorState;
export type ShowcaseLinesResult = { status: 'success'; data: ShowcaseLinesPage } | ErrorState;

export async function listSupplierShowcaseAction(query: unknown): Promise<SupplierShowcaseResult>;
export async function listShowcaseLinesAction(supplierId: string, query: unknown): Promise<ShowcaseLinesResult>;
```

No deciden nada: actor, caso de uso, traductor único de errores (`createErrorStateTranslator`), que
ya convierte cualquier fallo ajeno en `unexpected` con mensaje neutro (R34, R35). El test de conteo
de sesión (`tests/unit/identity/session-once-per-request-actions.test.ts`) lee las acciones del
disco: las dos nuevas entran en su lista si el test lo exige.

`lib/composition/index.ts` cablea las dos factories en la fachada `proveedores`.

**`listSuppliersAction` y `listSuppliers` se quedan.** Dejan de tener consumidor en `app/` pero son
contrato del módulo con tests propios; retirarlos es otra ficha si se quiere.

## 5. Pantalla (`app/(private)/proveedores/`)

### 5.1 Estado en la URL

Los dos filtros viven en la cadena de consulta, como el estado de lista de QC-44: recargar o
compartir el enlace conserva lo filtrado, y QC-139 podrá aterrizar con el filtro de producto
puesto importando la constante del parámetro. Las páginas **no** van a la URL: la carga perezosa es
estado del cliente y siempre arranca en la primera tanda (R25).

### 5.2 Componentes

| Archivo | Tipo | Qué hace |
| --- | --- | --- |
| `page.tsx` | servidor | `requirePagePermission('proveedores.consultar')` primero (R3); cabecera con título y `SupplierSheet` de alta (R36); filtros **fuera** del `<Suspense>` (R32); sección dentro, con `SupplierShowcaseSkeleton` de reserva |
| `components/supplier-showcase-params.ts` | puro | nombres de los dos parámetros, `parseShowcaseParams`, `showcaseHref` (derivado de `SUPPLIERS_ROUTE`, R1) |
| `components/supplier-showcase-filters.tsx` | cliente | dos campos (≥16 px, R38) y «limpiar»; aplica con `router.replace` en transición |
| `components/supplier-showcase-section.tsx` | servidor | llama a `listSupplierShowcaseAction({ page: 1, … })`; despacha error (R34, reutiliza `SupplierListError`), vacío (R33, reutiliza `SupplierListEmpty` con `SupplierSheet`), sin resultados (R26) o lista; pasa `key` nuevo en cada render de servidor para que `router.refresh()` tras un alta reinicie la lista (R36) |
| `components/supplier-showcase-list.tsx` | cliente | acumula filas, pide la tanda siguiente con `listSupplierShowcaseAction`, descarta ids repetidos (R17), un solo vuelo a la vez (R14), para al llegar a `hasMore: false` (R13), aviso de fallo según P3 (R35) |
| `components/showcase-load-trigger.tsx` | cliente | **único archivo que importa la librería** (R18). Pinta el centinela al pie de la lista y llama a `onVisible` |
| `components/supplier-showcase-row.tsx` | cliente | nombre como `Link` a `supplierDetailRoute(id)` (R6); carrusel; «cargar más» con `listShowcaseLinesAction` (R15, R16); estado de la fila propio |
| `components/showcase-line-card.tsx` | servidor-compatible | `EntityImage path name` + nombre (R7, R9) |
| `components/supplier-showcase-skeleton.tsx` | servidor | esqueleto de 5 filas × 10 tarjetas |

**Se borran**: `supplier-table.tsx`, `supplier-columns.tsx`, `supplier-columns-skeleton.ts`,
`supplier-table-skeleton.tsx`, `supplier-list-section.tsx`, `supplier-list-params.ts` (R2).
**Se quedan**: `supplier-sheet.tsx`, `supplier-form.tsx`, `supplier-field.tsx`,
`supplier-list-empty.tsx`, `supplier-list-error.tsx`. **`delete-supplier-dialog.tsx` depende de
P6.** El barrel `components/index.ts` se reescribe con lo que queda.

### 5.3 Carrusel, móvil y accesibilidad (R38, R39)

- `<section aria-label="Productos de <proveedor>">` con una lista `<ul>` en `flex overflow-x-auto
  snap-x snap-mandatory overscroll-x-contain` y `tabIndex={0}` para que las flechas lo desplacen.
  Sin botones de flecha que solo aparezcan con `:hover`.
- Scroll horizontal anidado en uno vertical: la regla multiplataforma pide comprobarlo en iOS. Se
  hace en la revisión manual de T15 (Safari iOS y Chrome Android), porque jsdom no desplaza.
- «Cargar más» al final del carrusel, `min-h-11 min-w-11`, `aria-label="Cargar más productos de
  <proveedor>"`, `aria-busy` durante el vuelo.
- **Sin excepción de escritorio**: nada de esta vista es solo de escritorio.

### 5.4 Imagen

`EntityImage` tal cual (D5): 60 px, `loading="lazy"`, marcador por `null`, `''` y `onError`. Si P7
pide un tamaño mayor, ver `## 8`.

## 6. Autorización y aislamiento

- **Página**: `requirePagePermission` (R3), cubierto por el test de pantallas que exigen permiso.
- **Service**: los dos casos de uso exigen `proveedores.consultar` antes de zod y del puerto (R4).
  Es la frontera real (`docs/architecture.md > Acceso a datos y autorizacion`).
- **Empresa**: todas las consultas pasan por `supplierCompanyScope` / `catalogLineCompanyScope`
  (R28). Un `supplierId` de otra empresa en «cargar más» da `supplier_not_found`, igual que uno
  inexistente, porque `listBySupplierAlive` ya comprueba vida **y** empresa.

## 7. Dependencia nueva: la librería de carga perezosa (P5, D8, regla 7)

### 7.1 Lo que ya hay

Nada. No hay en `package.json` ni en el árbol (`pnpm-lock.yaml`) ninguna librería de intersección,
de scroll infinito ni de virtualización, ni `swr`. El navegador trae `IntersectionObserver`, pero
usarlo a mano es justo lo que D8 descarta.

### 7.2 Propuesta: `react-intersection-observer`

**Qué hace.** Un hook, `useInView`, que envuelve `IntersectionObserver` y devuelve `ref` e `inView`.
Se usa en un solo archivo (`showcase-load-trigger.tsx`): cuando el centinela entra en pantalla, se
pide la tanda siguiente.

**Qué código nos ahorra.** Crear y desconectar el observador en el ciclo de vida de React
(incluido el doble montaje de Strict Mode), compartir una instancia entre elementos, el
`rootMargin`/`threshold`, y el mock para tests (`react-intersection-observer/test-utils`, que da
`mockAllIsIntersecting` para jsdom, donde `IntersectionObserver` no existe).

**Los cuatro checks — NINGUNO VERIFICADO.** Este diseño se escribió sin red. Los datos siguientes
son de memoria, con fecha de corte anterior a hoy, y **no cuentan como un sí** (regla 6 de
`CLAUDE.md`). Los tiene que confirmar quien tenga red antes de F1.4, con
`npm view react-intersection-observer deprecated version time.modified license peerDependencies`
y la API de descargas de npm.

| Check | Dato recordado (NO verificado) | Estado |
| --- | --- | --- |
| 1. No `deprecated` | no lo estaba | **no verificado** |
| 2. Release en 12 meses (desde 2025-09-23) | línea 9.x con publicaciones durante 2025; no sé si hay alguna posterior a 2025-09-23 | **no verificado — es el check con más riesgo** |
| 3. ≥ 10.000 descargas/semana | del orden de millones | **no verificado** |
| 4. Licencia | MIT | **no verificado** |

Otros datos a confirmar en el mismo paso: `peerDependencies` que admitan `react@19.2.8` (recuerdo
`^17 || ^18 || ^19`, no verificado) y que no declare dependencias propias.

**Multiplataforma.** Se apoya en `IntersectionObserver` nativo, disponible en Safari iOS desde la
12.2 y en Chrome Android; no depende de ratón ni de `:hover`. Dato de memoria, **a confirmar** en la
revisión manual de T15.

**Aislamiento.** Un solo archivo la importa. Sustituirla es reescribir `showcase-load-trigger.tsx`
(una prop `onVisible`, un centinela) y su test.

### 7.3 Alternativas descartadas

- **`react-infinite-scroll-component`** (MIT). Descartada. Recuerdo su última versión (6.1.0) como
  de 2020; si es así, **falla el check 2**, y aquí no hay motivo para una excepción. **No
  verificado**. Además impone su propio contenedor, su marcado de «cargando» y un contrato
  `dataLength`/`next` que duplica el estado que ya lleva `supplier-showcase-list.tsx`.
- **`swr` con `useSWRInfinite`.** Descartada. Resuelve la **obtención** de páginas, no la
  **detección** del final: habría que añadir igualmente algo que observe el centinela, o sea dos
  dependencias. Y `docs/architecture.md` reserva SWR para datos públicos, y estos no lo son.
- **`@tanstack/react-virtual`.** Descartada. Virtualiza listas largas, y aquí nunca hay muchas filas
  montadas a la vez. Con filas de alto variable (carruseles), medir es más código y más fallos de
  los que ahorra.
- **`IntersectionObserver` a mano en un hook propio.** Descartada por D8.

### 7.4 Si en F1.4 se eligiera otra

Solo cambia `showcase-load-trigger.tsx`, su test y la fila de `docs/dependencias.md`. Si se aprobara
`react-infinite-scroll-component` como **excepción** (check 2), el disparador pasa a envolver la
lista en lugar de ser un centinela, y `supplier-showcase-list.tsx` le cede el control de «¿hay
más?». El dominio, las acciones y el adaptador no cambian.

## 8. Preguntas abiertas: recomendación y coste de la otra opción

| # | Recomiendo | Por qué | Si se elige la otra |
| --- | --- | --- | --- |
| **P1** Contenido de la fila con filtro de producto | **A: solo las líneas que coinciden** | Quien escribe «ácido» busca quién lo vende y ver esos productos; con B la coincidencia puede quedar en la línea 40 de un carrusel de 10 | B: `lineQuery.search` y `productSearch` de `listShowcaseLines` se dejan vacíos; el filtro solo actúa en el `some` de proveedores. Se simplifica `showcaseLinesQuerySchema` (sin `productSearch`) |
| **P2** Proveedor sin líneas | **A: aparece con aviso «sin productos»** | El alta está en esta vista (D3): con B, el proveedor recién creado **desaparece** al guardar, porque aún no tiene líneas, y parece que el alta falló. Además con A el censo es el de siempre, «proveedores vivos» | B: el `where` de proveedores lleva siempre `catalogLines: { some: <línea viva> }`; R36 necesita otra salida, como navegar al detalle del proveedor creado en lugar de refrescar. `SupplierSheet` habría que tocarlo |
| **P3** Fallo de una carga incremental | **Aviso en línea con «Reintentar»**: al pie de la lista si falla la tanda; al final del carrusel si falla un «cargar más». Lo ya cargado no se toca | El fallo queda donde ocurrió y se puede repetir sin recargar. Un toast suelto desaparece y deja al centinela sin forma de reintentar | Toast: se elimina el estado de error de fila y de lista; el centinela se rearma al volver a entrar en pantalla. Menos código, peor recuperación |
| **P4** Orden por defecto | **Proveedores por nombre ascendente; líneas por nombre ascendente**, las dos con `id` de desempate | El de proveedores es el orden por defecto de QC-57 para esta lista. En un catálogo que se recorre con la vista, alfabético se lee mejor que por fecha de alta | Líneas por `createdAt` (orden actual del detalle): cambia `SHOWCASE_LINE_SORT` y nada más; `catalogLineOrderBy` ya lo admite y hay índice |
| **P5** Librería | **`react-intersection-observer`**, sujeta a que los cuatro checks salgan bien al verificarlos | `## 7` | `## 7.4` |
| **P6** Edición y baja del proveedor (añadida) | **Llevarlas a la cabecera del detalle en esta ficha**: `SupplierSheet supplier=…` y `DeleteSupplierDialog` junto a `SupplierDetailHeader`; tras la baja, navegar a la vista | Es lo que D3 describe («viven en `/proveedores/<id>`») y evita dejar la aplicación sin editar ni dar de baja. Enmienda el «esta ficha NO toca» de D3 solo en ese punto: dos controles que ya existen, sin tocar el catálogo | (b) Dejarlos en la fila de la vista nueva: contradice D3 y R37 cambia. (c) Ficha aparte: hasta que llegue, no se puede editar ni dar de baja ningún proveedor, y los E2E de aislamiento que dan de baja desde la lista pierden su camino |
| **P7** Tamaño de imagen (añadida) | **Dejar 60 px en esta ficha** | D5 dice reutilizar `EntityImage` tal cual. Cambiar su tamaño afecta a dos pantallas más | Añadir una prop opcional `size` (defecto 60) a `EntityImage`: toca `components/shared/`, pero las otras dos pantallas no cambian. Una task más (tamaño y test) |

## 9. Alternativas de diseño descartadas

1. **Reutilizar `listSuppliersAction` + `listCatalogLinesAction` desde el cliente, una por proveedor.**
   Descartada. Hace 6 invocaciones por tanda, y cada una lee la sesión una vez (QC-104 las cuenta).
   Además `SUPPLIER_QUERYABLE` no puede filtrar proveedores por el nombre de una línea (R20). Esa
   consulta no existe y hay que escribirla de todos modos.
2. **Un `include` anidado de Prisma con `take: 11`** (`supplier.findMany({ select: { catalogLines:
   { take: 11 } } })`). Descartada **por no verificado**: no he podido comprobar si el motor
   pagina la relación en SQL o si trae todas las líneas de los 5 proveedores y las recorta en
   memoria. Con catálogos grandes eso importa. Cinco consultas acotadas en paralelo tienen un
   coste conocido. Si la integración demostrara que el `take` anidado va a SQL, sería una mejora
   compatible, que no cambia el contrato.
3. **Una sola consulta `$queryRaw` con `ROW_NUMBER() OVER (PARTITION BY supplier_id …)`.**
   Descartada. Es menos viajes, pero se salta las envolturas de `company-scope.ts`, y
   `guard-ambito-empresa-proveedores` exige que ninguna consulta del módulo lea la empresa a mano.
   Además duplicaría en SQL la búsqueda normalizada que hoy es una sola función.
4. **Paginación por cursor (keyset) de los proveedores.** Descartada. Es más robusta ante altas
   concurrentes, pero hay que codificar un cursor `(name, id)` y el resto del módulo pagina por
   desplazamiento con `lib/shared/pagination`. El riesgo que cubre (un alta entre dos tandas
   duplica una fila) lo cubre el descarte por `id` de R17 en el cliente.
5. **Un route handler `GET` para las tandas.** Descartada. `app/api/` es para terceros
   (`docs/architecture.md > Server Actions vs Route Handlers`), y las guardias de la ruta prohíben
   `fetch` a rutas propias.
6. **Mantener la lista de QC-44 como segunda vista.** Descartada por D2.

## 10. Tests previstos (trazabilidad)

| R | Test |
| --- | --- |
| R1, R2 | `tests/unit/proveedores-ui/supplier-route-contract.test.ts` (reescrito el caso «R30» de QC-56: la lista ya no monta `DataTable`) + `supplier-showcase-page.test.tsx` (sin `data-table`, sin paginación) |
| R3 | `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` (existente, sigue verde) + E2E existente de 404 |
| R4 | `tests/unit/proveedores/showcase-service.test.ts`: actor nulo / sin permiso lanza `UnauthorizedError` y el puerto no se llama, en los dos casos de uso |
| R5-R8, R10, R11, R13-R17, R25, R26, R30, R32-R37, R39 | `tests/unit/proveedores-ui/supplier-showcase-*.test.tsx` (sección, lista, fila, filtros), con las acciones como dobles y `mockAllIsIntersecting` |
| R9 | `showcase-line-card.test.tsx`: importa `EntityImage` de `components/shared` y `data-missing` con `null`/`''`/`error` |
| R12, R18 | `showcase-load-trigger.test.tsx` + guarda en `guard-convenciones-showcase.test.ts`: solo ese archivo importa la librería; nadie hace `new IntersectionObserver` ni `addEventListener('scroll'` en `app/(private)/proveedores/` |
| R17, R19-R24, R27, R28, R31 | `tests/integration/proveedores/supplier-showcase.int.test.ts`: dos empresas, proveedores vivos y dados de baja, líneas con y sin imagen, acentos y mayúsculas; prefijos sin huecos ni repetidos al encadenar tanda + «cargar más» |
| R29 | ningún archivo nuevo bajo `db/` en el diff (caso de la guardia de convenciones de la ficha) + guardias existentes de `down.sql` |
| R38 | test de clases (`min-h-11`, `text-base` en inputs, sin `hover:` como única vía) + revisión manual iOS/Android en T15 |
| R40 | `e2e/proveedores.spec.ts` y `e2e/aislamiento-proveedores.spec.ts` adaptados, en verde |
