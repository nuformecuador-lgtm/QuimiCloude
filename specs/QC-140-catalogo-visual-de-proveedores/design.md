# QC-140 — catalogo-visual-de-proveedores · design.md

> Escrito por spec_author (F1.2) el 2026-09-23 y ajustado ese mismo día tras la aprobación de
> F1.4. El humano aceptó la recomendación de cada pregunta abierta, que ya son las decisiones
> D14-D20 de `requirements.md`. Los cuatro checks de la librería los verificó el leader con red
> (`## 7`).

## 0. Lo que hay hoy (leído en el código, no supuesto)

| Hecho | Dónde |
| --- | --- |
| `/proveedores` pinta la tabla compartida (`DataTable`) con búsqueda, orden y paginación, y en cada fila los controles de **edición** (`SupplierSheet supplier=…`) y **baja** (`DeleteSupplierDialog`) | `app/(private)/proveedores/components/supplier-table.tsx:74-85` |
| La página de detalle `/proveedores/<id>` pinta **solo** nombre, teléfono, correo, el catálogo y la subida de documentos. **No** tiene edición ni baja del proveedor | `app/(private)/proveedores/[id]/page.tsx`, `[id]/components/supplier-detail-header.tsx` |
| La ruta de detalle **no puede importar** de `app/(private)/proveedores/components/`: lo prohíbe su guardia | `tests/unit/proveedores-ui/catalog-route-contract.test.ts:138-150` |
| `SupplierSheet` sin proveedor es el alta y con proveedor la edición; al guardar cierra, avisa con toast y hace `router.refresh()`. `DeleteSupplierDialog` también termina en `router.refresh()` | `components/supplier-sheet.tsx:46-75`, `components/delete-supplier-dialog.tsx` |
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
trigramas; el recorte por proveedor lo sirve `(company_id, supplier_id)`; el orden alfabético
(D17) lo sirven `suppliers_name_idx` y `supplier_catalog_lines_name_idx`.

Si en la integración (T5) el plan de la consulta de existencia (`EXISTS` de líneas por proveedor)
saliera secuencial sobre una base con volumen, el índice que faltara entra con su `down.sql`,
nombre en inglés y parcial sobre `deleted_at IS NULL` (R29). Hoy no se prevé ninguno.

## 2. Dominio (`lib/modules/proveedores/domain/`)

### 2.1 Tipos y constantes — `supplier-showcase.ts` (nuevo)

```ts
export const SHOWCASE_SUPPLIER_BATCH = 5;   // D7
export const SHOWCASE_LINE_BATCH = 10;      // D7
export const SHOWCASE_SUPPLIER_SORT = { columnId: 'name', direction: 'asc' } as const; // D17
export const SHOWCASE_LINE_SORT = { columnId: 'name', direction: 'asc' } as const;     // D17

export type ShowcaseLine = { readonly id: string; readonly name: string; readonly imagePath: string | null };
export type ShowcaseRow = {
  readonly id: string;
  readonly name: string;
  readonly lines: readonly ShowcaseLine[];   // <= SHOWCASE_LINE_BATCH; vacío = «Sin productos todavía» (D15)
  readonly hasMoreLines: boolean;
};
export type ShowcasePage = { readonly items: readonly ShowcaseRow[]; readonly page: number; readonly hasMore: boolean };
export type ShowcaseLinesPage = { readonly items: readonly ShowcaseLine[]; readonly page: number; readonly hasMore: boolean };
```

- Los tipos **no llevan** `createdBy`, `updatedBy`, fechas, costo ni presentación: la vista pinta
  imagen y nombre (R7), y lo que no viaja no se puede pintar por descuido (R8, D11).
- Los tamaños de tanda y el orden son **constantes del dominio, no entrada**: el cliente no puede
  pedir 500 líneas ni otro orden. El cliente importa los tamaños del barrel solo para dibujar el
  esqueleto.
- El desempate por `id` lo añaden las funciones de orden del adaptador (`## 3`), como ya hacen hoy.

### 2.2 Esquemas de entrada (zod, dentro del caso de uso)

- `showcaseQuerySchema`: `{ page: int >= 1 (defecto 1), supplierSearch: string trim max 120 (defecto ''), productSearch: string trim max 120 (defecto '') }`. El tope 120 es el mismo `SEARCH_MAX_LENGTH` del contrato genérico de QC-57, para que las dos búsquedas del módulo no discrepen.
- `showcaseLinesQuerySchema`: `{ page: int >= 2, productSearch: string trim max 120 (defecto '') }`. La página 1 de una fila la trae siempre la tanda de proveedores; pedirla por aquí sería una segunda fuente de la misma cosa. `productSearch` viaja porque, con filtro de producto, el «cargar más» recorre solo las líneas que coinciden (D14).

Un término que se normaliza a vacío es ausencia de filtro (R24): lo resuelve
`normalizedSearchCondition`, que ya lo hace.

### 2.3 Casos de uso (nuevos)

1. **`createListSupplierShowcase({ suppliers })`** — `(input: unknown, actor) => Promise<ShowcasePage>`.
   Orden fijo de QC-57: `requirePermission(actor, 'proveedores.consultar')` **primero** (R4),
   después zod, después el puerto con `scope = { companyId: actor.companyId }`.
2. **`createListShowcaseLines({ catalog })`** — `(supplierId: string, input: unknown, actor) => Promise<ShowcaseLinesPage>`.
   Mismo orden. Llama al puerto **ya existente** `SupplierCatalogRepository.listBySupplierAlive`
   con una consulta construida en el dominio —`{ page, pageSize: SHOWCASE_LINE_BATCH, search:
   productSearch, sort: SHOWCASE_LINE_SORT, filters: {} }`—, traduce `'supplier_not_found'` a
   `SupplierNotFoundError` (R28) y proyecta `CatalogLineView` a `ShowcaseLine`. `hasMore = page <
   totalPages`.

`SHOWCASE_SUPPLIER_SORT` y `SHOWCASE_LINE_SORT` son la única definición del orden de la vista.
R17 solo se cumple si el «cargar más» y la primera tanda de una fila usan **el mismo orden y el
mismo filtro**. Por eso los dos salen del dominio, y el adaptador de la tanda de proveedores
reutiliza el constructor de `where`/`orderBy` del catálogo en vez de escribir otro (`## 3`).

### 2.4 Contrato (`index.ts`)

Reexporta de `./domain`: las dos factories con sus `*Deps`, los cinco tipos, las dos constantes de
tanda y las dos de orden. Nada de `adapters/` ni `ports/`.

## 3. Puerto y adaptador driven

**`SupplierRepository` gana un método**, `listShowcaseAlive(query: ShowcaseQuery, scope:
SupplierScope): Promise<ShowcasePage>`, con el `scope` al final y obligatorio, como en los otros
cinco. Va en este puerto porque lo que se pagina son proveedores. `guard-ambito-empresa-proveedores`
cuenta los métodos de cada puerto (`metodosEsperados: 5`), y ese número pasa a 6 en la misma task.

Implementación en `supplier-prisma.ts` (`listShowcaseAliveSuppliers`):

1. `where` de proveedores: `deletedAt: null` + `supplierCompanyScope(scope)` + búsqueda de
   proveedor contra `name_normalized` (el mismo `normalizedSearchCondition(…,
   normalizeSupplierName)` que QC-57) + **solo si hay filtro de producto**, `catalogLines: { some:
   <where de línea viva de la empresa que coincide> }` (R20). **Sin filtro de producto no se exige
   ninguna línea**: el proveedor sin catálogo sale y cuenta en su tanda (D15, R30).
2. `findMany` de proveedores con `orderBy = [{ name: 'asc' }, { id: 'asc' }]` (D17, R31), `skip =
   (page - 1) * 5` y **`take: 6`**: la sexta fila solo dice `hasMore` y se descarta. Así no hace
   falta `count`.
3. Para los ≤5 proveedores, **una** `findMany` de líneas por proveedor, en paralelo, con
   `where = buildCatalogLineWhere(supplierId, lineQuery, scope)` —`lineQuery.search =
   productSearch` (D14)— y `orderBy = catalogLineOrderBy(SHOWCASE_LINE_SORT)`, y con **`take:
   11`**: la undécima línea solo dice `hasMoreLines`. Las dos funciones las **exporta ya**
   `supplier-catalog-line-prisma.ts`, y son las que usa el «cargar más». Un driven puede importar
   otro driven de su mismo módulo (`docs/architecture.md > Nota sobre driven -> driven`).
4. `select` mínimo: `id` y `name` del proveedor; `id`, `name` e `imagePath` de la línea.

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

Las acciones no deciden nada: resuelven el actor, llaman al caso de uso y pasan el resultado por
el traductor único de errores (`createErrorStateTranslator`). Ese traductor ya convierte cualquier
fallo ajeno en `unexpected` con un mensaje neutro (R34, R35). El test de conteo de sesión
(`tests/unit/identity/session-once-per-request-actions.test.ts`) lee las acciones del disco; las
dos nuevas entran en su lista si el test lo exige.

`lib/composition/index.ts` cablea las dos factories en la fachada `proveedores`.

**`listSuppliersAction` y `listSuppliers` se quedan.** Se quedan sin consumidor en `app/`, pero son
contrato del módulo y tienen tests propios. Si se quieren retirar, es otra ficha.

## 5. Pantalla

### 5.1 Estado en la URL

Los dos filtros viven en la cadena de consulta, igual que el estado de lista de QC-44. Así, recargar
o compartir el enlace conserva lo filtrado, y QC-139 podrá aterrizar con el filtro de producto
puesto importando la constante del parámetro. Las páginas **no** van a la URL: la carga perezosa es
estado del cliente y siempre arranca en la primera tanda (R25).

### 5.2 Componentes de la vista (`app/(private)/proveedores/`)

| Archivo | Tipo | Qué hace |
| --- | --- | --- |
| `page.tsx` | servidor | `requirePagePermission('proveedores.consultar')` primero (R3); cabecera con título y `SupplierSheet` de alta (R36); filtros **fuera** del `<Suspense>` (R32); sección dentro, con `SupplierShowcaseSkeleton` de reserva |
| `components/supplier-showcase-params.ts` | puro | nombres de los dos parámetros, `parseShowcaseParams`, `showcaseHref` (derivado de `SUPPLIERS_ROUTE`, R1) |
| `components/supplier-showcase-filters.tsx` | cliente | dos campos (≥16 px, R39) y «limpiar»; aplica con `router.replace` en transición |
| `components/supplier-showcase-section.tsx` | servidor | llama a `listSupplierShowcaseAction({ page: 1, … })` y despacha según el resultado: error (R34, reutiliza `SupplierListError`), vacío (R33, reutiliza `SupplierListEmpty` con `SupplierSheet`), sin resultados (R26) o lista. Pasa un `key` nuevo en cada render de servidor, para que el `router.refresh()` que sigue a un alta reinicie la lista (R36) |
| `components/supplier-showcase-list.tsx` | cliente | acumula filas, pide la tanda siguiente con `listSupplierShowcaseAction`, descarta ids repetidos (R17), un solo vuelo a la vez (R14), para al llegar a `hasMore: false` (R13). Si una tanda falla, aviso al pie con «Reintentar» (D16, R35); mientras el aviso está puesto, el centinela no dispara |
| `components/showcase-load-trigger.tsx` | cliente | **único archivo que importa `react-intersection-observer`** (R18). Pinta el centinela al pie de la lista y llama a `onVisible` cuando `useInView` lo da por visible |
| `components/supplier-showcase-row.tsx` | cliente | nombre como `Link` a `supplierDetailRoute(id)` (R6). Si `lines` está vacío, «Sin productos todavía» + enlace a la ficha (R30); si no, el carrusel. «Cargar más» con `listShowcaseLinesAction` (R15, R16); si falla, aviso al final del carrusel con «Reintentar» (D16, R35). El estado de la fila es propio |
| `components/showcase-line-card.tsx` | servidor-compatible | `EntityImage path name` + nombre (R7, R9) |
| `components/supplier-showcase-skeleton.tsx` | servidor | esqueleto de 5 filas × 10 tarjetas |

**Se borran**: `supplier-table.tsx`, `supplier-columns.tsx`, `supplier-columns-skeleton.ts`,
`supplier-table-skeleton.tsx`, `supplier-list-section.tsx` y `supplier-list-params.ts` (R2).
**Se quedan en la ruta**: `supplier-list-empty.tsx` y `supplier-list-error.tsx`. **Salen de la
ruta**: `supplier-sheet.tsx`, `supplier-form.tsx`, `supplier-field.tsx` y
`delete-supplier-dialog.tsx` (ver `## 5.3`). El barrel `components/index.ts` se reescribe con lo
que queda.

### 5.3 Edición y baja en la cabecera del detalle (D19, R37, R38)

**Por qué entra aquí.** La semilla decía que esta ficha no tocaba `/proveedores/<id>`. En `dev`, los
dos controles solo existen en las filas de la tabla que D2 retira. Sin moverlos, la aplicación se
queda sin forma de editar ni de dar de baja un proveedor. D19 enmienda la semilla **solo en este
punto**: el catálogo, los datos de contacto y la subida de documentos del detalle no cambian.

**Dónde viven los componentes.** A partir de esta ficha, el panel de proveedor
(`SupplierSheet`/`SupplierForm`/`SupplierField`) lo usan **dos rutas**: el alta en la vista y la
edición en el detalle. La guardia del detalle (`catalog-route-contract.test.ts:138`) prohíbe que el
detalle importe de `../components`. Por eso los tres archivos **se promueven a
`components/shared/supplier/`**, con un `index.ts`. Esa es la condición de `docs/architecture.md >
Regla: sin sobre-ingenieria` (dos usuarios, misma API). `delete-supplier-dialog.tsx` solo lo usa el
detalle, así que **se muda a `[id]/components/`** y entra en su barrel.

**Cambios de comportamiento, los mínimos:**
- La cabecera del detalle monta `SupplierSheet supplier={…}` y `DeleteSupplierDialog supplier={…}`
  junto a `SupplierDetailHeader`. Los dos reciben el proveedor por props desde `page.tsx`, que ya
  lo tiene de `getSupplierAction`.
- La edición conserva su `router.refresh()`: el detalle vuelve a pedir la ficha y pinta los datos
  nuevos.
- La baja deja de hacer `router.refresh()`, porque refrescar el detalle de un proveedor ya dado de
  baja pintaría «no encontrado». Ahora hace `router.replace(SUPPLIERS_ROUTE)` y avisa con el toast
  de siempre (R38).

### 5.4 Carrusel, móvil y accesibilidad (R39, R40)

- `<section aria-label="Productos de <proveedor>">` con una lista `<ul>` en `flex overflow-x-auto
  snap-x snap-mandatory overscroll-x-contain` y `tabIndex={0}` para que las flechas lo desplacen.
  Sin botones de flecha que solo aparezcan con `:hover`.
- El carrusel es un scroll horizontal anidado dentro de uno vertical. La regla multiplataforma pide
  comprobarlo en iOS, y se comprueba en la revisión manual de T14 (Safari iOS y Chrome Android)
  porque jsdom no desplaza.
- «Cargar más» y «Reintentar» van al final del carrusel, con `min-h-11 min-w-11`, `aria-label` que
  nombra al proveedor y `aria-busy` durante el vuelo.
- **Sin excepción de escritorio**: nada de esta vista es solo de escritorio.

### 5.5 Imagen

`EntityImage` tal cual, a 60 px (D5, D20): `loading="lazy"` y marcador para `null`, `''` y
`onError`. El componente compartido no se toca.

## 6. Autorización y aislamiento

- **Página**: `requirePagePermission` (R3), cubierto por el test de pantallas que exigen permiso.
  El detalle ya lo tenía.
- **Service**: los dos casos de uso exigen `proveedores.consultar` antes de zod y del puerto (R4).
  Es la frontera real (`docs/architecture.md > Acceso a datos y autorizacion`). La edición y la baja
  mueven controles de sitio, pero siguen llamando a las mismas acciones, con los permisos que ya
  exigen sus casos de uso.
- **Empresa**: todas las consultas pasan por `supplierCompanyScope` / `catalogLineCompanyScope`
  (R28). Un `supplierId` de otra empresa en «cargar más» da `supplier_not_found`, igual que uno
  inexistente, porque `listBySupplierAlive` ya comprueba vida **y** empresa.

## 7. Dependencia nueva: `react-intersection-observer` (D8, D18, regla 7)

### 7.1 Lo que ya hay

Nada. No hay en `package.json` ni en el árbol (`pnpm-lock.yaml`) ninguna librería de intersección,
de scroll infinito ni de virtualización, ni `swr`. El navegador trae `IntersectionObserver`, pero
usarlo a mano es justo lo que D8 descarta.

### 7.2 La elegida

**Qué hace.** Un hook, `useInView`, que envuelve `IntersectionObserver` y devuelve `ref` e `inView`.
Se usa en un solo archivo (`showcase-load-trigger.tsx`): cuando el centinela entra en pantalla, se
pide la tanda siguiente.

**Qué código nos ahorra.** Crear y desconectar el observador dentro del ciclo de vida de React
(incluido el doble montaje de Strict Mode), compartir una instancia entre elementos y el manejo de
`rootMargin`/`threshold`.

**Los cuatro checks — PASAN.** Los verificó el leader el 2026-09-23 contra el registro de npm:

| Check | Dato | Estado |
| --- | --- | --- |
| 1. No `deprecated` | sin `deprecated` | pasa |
| 2. Release en los últimos 12 meses | **v11.0.1, publicada el 2026-08-26** | pasa |
| 3. ≥ 10.000 descargas/semana | **3.538.265** (del 2026-09-15 al 2026-09-21) | pasa |
| 4. Licencia | **MIT** | pasa |

**A confirmar en T0, al instalar, porque el leader no lo verificó:** que las `peerDependencies`
admitan `react@19.2.8`, y que la v11 siga exponiendo `useInView` con el comportamiento descrito y
las utilidades de test (`react-intersection-observer/test-utils`, `mockAllIsIntersecting`). Si no
las expone, el test del disparador simula `IntersectionObserver` en jsdom. La API de producción no
cambia.

**Multiplataforma.** La librería se apoya en `IntersectionObserver` nativo (Safari iOS y Chrome
Android) y no depende de ratón ni de `:hover`. Se comprueba en la revisión manual de T14.

**Aislamiento.** Un solo archivo la importa. Sustituirla es reescribir `showcase-load-trigger.tsx`
(una prop `onVisible` y un centinela) y su test.

### 7.3 Alternativas descartadas

- **`react-infinite-scroll-component`.** **Corrección**: la primera versión de este diseño decía, de
  memoria, que estaba parada desde 2020, y era falso. Según los datos del leader, su última versión
  es la **7.2.1 del 2026-06-06**, con **956.575** descargas/semana, así que **pasa los checks 2 y
  3**. La licencia y el estado de `deprecated` no se verificaron en esa consulta. Se descarta por
  **diseño**, no por salud:
  - Es un **componente contenedor** que envuelve la lista entera y gobierna su propio «¿hay más?»
    con el contrato `dataLength`/`next`/`hasMore`. Aquí ese estado ya lo lleva
    `supplier-showcase-list.tsx` (un vuelo a la vez, descarte de ids repetidos, pausa mientras
    hay aviso de fallo), y tendríamos dos dueños del mismo estado.
  - Trae su propio marcado de «cargando» y de fin de lista, cuando R14, R35 y D16 piden los
    nuestros.
  - `react-intersection-observer` solo **detecta** y no decide nada. Ocupa un archivo y deja el
    estado donde ya está.
- **`swr` con `useSWRInfinite`.** Descartada. Resuelve la **obtención** de páginas, no la
  **detección** del final: seguiría haciendo falta algo que observe el centinela, o sea dos
  dependencias. Además `docs/architecture.md` reserva SWR para datos públicos, y estos no lo son.
- **`@tanstack/react-virtual`.** Descartada. Virtualiza listas largas, y aquí nunca hay muchas filas
  montadas a la vez. Con filas de alto variable (carruseles), medirlas cuesta más código y más
  fallos de los que la librería ahorra.
- **`IntersectionObserver` a mano en un hook propio.** Descartada por D8.

## 8. Decisiones de F1.4 y dónde caen

| Decisión | Efecto en el diseño |
| --- | --- |
| D14 · con filtro de producto, solo las que coinciden | `productSearch` entra en el `where` de las líneas de la tanda y en `showcaseLinesQuerySchema` (`## 2.2`, `## 3`) |
| D15 · proveedor sin líneas aparece | sin filtro de producto no se exige `some` de líneas; la fila con `lines` vacío pinta «Sin productos todavía» + enlace (`## 3`, `## 5.2`) |
| D16 · aviso en el punto con Reintentar | estado de error propio en la lista y en cada fila (`## 5.2`) |
| D17 · orden alfabético | `SHOWCASE_SUPPLIER_SORT` y `SHOWCASE_LINE_SORT` por `name asc`, desempate por `id` (`## 2.1`, `## 3`) |
| D18 · `react-intersection-observer` | `## 7` |
| D19 · editar y dar de baja en la cabecera del detalle | `## 5.3` |
| D20 · `EntityImage` a 60 px | `## 5.5` |

## 9. Alternativas de diseño descartadas

1. **Reutilizar `listSuppliersAction` + `listCatalogLinesAction` desde el cliente, una por proveedor.**
   Descartada. Supone 6 invocaciones por tanda, y cada una lee la sesión una vez (QC-104 las
   cuenta). Además, `SUPPLIER_QUERYABLE` no puede filtrar proveedores por el nombre de una línea
   (R20): esa consulta no existe y hay que escribirla de todos modos.
2. **Un `include` anidado de Prisma con `take: 11`** (`supplier.findMany({ select: { catalogLines:
   { take: 11 } } })`). Descartada **por no verificada**: no he podido comprobar si el motor pagina
   la relación en SQL o si trae todas las líneas de los 5 proveedores y las recorta en memoria. Con
   catálogos grandes esa diferencia importa, y cinco consultas acotadas en paralelo tienen un coste
   conocido. Si la integración demostrara que el `take` anidado va a SQL, sería una mejora
   compatible que no cambia el contrato.
3. **Una sola consulta `$queryRaw` con `ROW_NUMBER() OVER (PARTITION BY supplier_id …)`.**
   Descartada. Hace menos viajes a la base, pero se salta las envolturas de `company-scope.ts`, y
   `guard-ambito-empresa-proveedores` exige que ninguna consulta del módulo lea la empresa a mano.
   Además duplicaría en SQL la búsqueda normalizada, que hoy es una sola función.
4. **Paginación por cursor (keyset) de los proveedores.** Descartada. Es más robusta ante altas
   concurrentes, pero obliga a codificar un cursor `(name, id)`, y el resto del módulo pagina por
   desplazamiento con `lib/shared/pagination`. El riesgo que cubre (un alta entre dos tandas
   duplica una fila) ya lo cubre el descarte por `id` que hace el cliente para R17.
5. **Un route handler `GET` para las tandas.** Descartada. `app/api/` es para terceros
   (`docs/architecture.md > Server Actions vs Route Handlers`), y las guardias de la ruta prohíben
   `fetch` a rutas propias.
6. **Mantener la lista de QC-44 como segunda vista.** Descartada por D2.
7. **Para D19, relajar la guardia del detalle y dejar que importe de `../components`.** Descartada.
   La guardia existe para que dos rutas no se aten por sus tripas; promover a `components/shared/`
   lo que ya comparten es la salida que la arquitectura prevé.

## 10. Tests previstos (trazabilidad)

| R | Test |
| --- | --- |
| R1, R2 | `tests/unit/proveedores-ui/supplier-route-contract.test.ts` (se reescribe el caso «R30» de QC-56: la lista ya no monta `DataTable`) + `supplier-showcase-page.test.tsx` (sin `data-table`, sin paginación) |
| R3 | `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` (existente, sigue verde) + E2E existente de 404 |
| R4 | `tests/unit/proveedores/showcase-service.test.ts`: con actor nulo o sin permiso lanza `UnauthorizedError` y el puerto no se llama, en los dos casos de uso |
| R5-R8, R10, R11, R13-R16, R25, R26, R30, R32-R37, R40 | `tests/unit/proveedores-ui/supplier-showcase-*.test.tsx` (sección, lista, fila, filtros), con las acciones como dobles y el centinela simulado |
| R9 | `showcase-line-card.test.tsx`: importa `EntityImage` de `components/shared` y comprueba `data-missing` con `null`/`''`/`error`; el tamaño sigue en 60 |
| R12, R18 | `showcase-load-trigger.test.tsx` + `guard-convenciones-showcase.test.ts`: un solo importador de la librería; ningún `new IntersectionObserver` ni `addEventListener('scroll'` en `app/(private)/proveedores/` |
| R17, R19-R24, R27, R28, R30, R31 | `tests/integration/proveedores/supplier-showcase.int.test.ts`: dos empresas, proveedores vivos, dados de baja y sin líneas, líneas con y sin imagen, acentos y mayúsculas; prefijos sin huecos ni repetidos al encadenar tanda + «cargar más»; orden alfabético |
| R29 | ningún archivo nuevo bajo `db/` en el diff (caso de la guardia de convenciones de la ficha) + guardias existentes de `down.sql` |
| R38 | `tests/unit/proveedores-ui/supplier-detail-page.test.tsx`: la cabecera monta editar y dar de baja; la baja con éxito navega a la vista; el catálogo sigue igual. `catalog-route-contract.test.ts` sigue verde |
| R39 | test de clases (`min-h-11`, `text-base` en inputs, sin `hover:` como única vía) + revisión manual iOS/Android en T14 |
| R41 | `e2e/proveedores.spec.ts` y `e2e/aislamiento-proveedores.spec.ts` adaptados y en verde |
