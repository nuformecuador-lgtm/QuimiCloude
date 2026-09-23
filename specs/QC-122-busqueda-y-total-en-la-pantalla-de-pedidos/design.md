# QC-122 — busqueda-y-total-en-la-pantalla-de-pedidos · design.md

> **Cambio de alcance en F1.4 (2026-09-23):** el importe salió de esta ficha y va a **QC-151**. Este
> diseño cubre **solo la búsqueda**. Todo lo del importe que había en la versión anterior (columna,
> `order-amount.ts`, el paso de 10 a 11 columnas, el retiro del bloque R18 de QC-123 en
> `order-columns.test.tsx`, las guardias de `Intl`/`toLocaleString` y el guion en el E2E) **no se
> hace aquí**.

> Ficha **de pantalla**: todo el cambio vive en `app/(private)/pedidos/components/`, sus tests y un
> spec E2E nuevo. **No toca** `lib/modules/**`, `db/**`, `lib/composition/**`,
> `components/shared/data-table/**`, `components/ui/**`, `order-columns.tsx`, `order-list-skeleton.tsx`,
> `order-list-empty.tsx` ni `package.json`. Sin dependencias nuevas.

## 0. Lo que ya existe y se usa tal cual (verificado en disco el 2026-09-23)

| Pieza | Dónde | Qué aporta |
|---|---|---|
| La consulta con búsqueda | `lib/modules/pedidos/domain/list-orders.ts` | Recibe `search` (ya `trim` + `max(120)` en `createListQuerySchema`), lo resuelve a ids de receta con `findIdsMatchingName` (sin acentos, bajas incluidas, empresa del actor) y pagina sobre el conjunto filtrado. `ORDER_QUERYABLE.searchable === true`. |
| La caja de búsqueda | `DataTableSearchField` dentro de `DataTable` (`components/shared/data-table/data-table-filters.tsx`) | `<Input type="search">` con `min-h-11 text-base`, `data-testid="data-table-search"`, rebote de `SEARCH_DEBOUNCE_MS` (300 ms), emite `withSearch(params, draft)`. Hoy apagada con `searchable={false}`. |
| «En vuelo» sin desmontar | `OrderTable` (`useTransition` + `router.push`) | `aria-busy`, `opacity-60` y el rótulo `ORDER_TABLE_TEXTS.loading` mientras `isPending`. La tabla no se desmonta: el foco de la caja sobrevive. Mismo patrón en inventario y proveedores. Cubre R10–R12 sin código nuevo. |
| Vacío filtrado **dentro** de la tabla | `supplier-table.tsx` (proveedores) | `texts.empty` sustituido y `emptyAction` con un `<Link>` que en clic simple navega dentro de la transición. Precedente de §3 (confirmado en F1.4). |
| Parámetro `q` | `product-list-params.ts` (`SEARCH_PARAM = 'q'`) | Nombre y forma de lectura/escritura que se copia. |

## 1. Parámetros de lista: `order-list-params.ts`

Se **retira explícitamente** la regla «`search` no se lee ni se escribe» (QC-35 R20) —docblock y
comportamiento— y se sustituye por:

- `export const SEARCH_PARAM = 'q';`
- `export const ORDER_SEARCH_MAX_LENGTH = 120;` (ver §1.1).
- `parseOrderListParams`: `search = truncar(trim(firstValue(q) ?? ''), ORDER_SEARCH_MAX_LENGTH)`. Solo
  lee `q`; un parámetro `search` en la URL se sigue ignorando (R5). Vacío o solo espacios -> `''` (R6).
  Truncar tras el `trim` y volver a hacer `trim` (un corte puede dejar un espacio final).
- `buildOrderListQuery`: `if (search !== '') query.set(SEARCH_PARAM, search)`, con `search` ya
  recortado. Nunca `search` (R5). `parse(build(p))` sigue devolviendo `p` con término (R5).
- Función pura nueva `withSearchResetsPage(current, next)` (ver §2).
- Exportaciones nuevas al barrel `components/index.ts`: `SEARCH_PARAM`, `ORDER_SEARCH_MAX_LENGTH`,
  `withSearchResetsPage`. Ninguna existente se quita (lo vigila `guard-pantalla-pedidos-se-amplia.test.ts`).

### 1.1 El tope de 120 (R7)

`SEARCH_MAX_LENGTH` es privado en `lib/modules/pedidos/domain/list-query.ts`, y un término de 121
caracteres hace fallar la consulta con `ValidationError` -> estado de error. Esta pantalla promete que
«ninguna entrada de la URL produce un error» (QC-35 R18), así que el parser recorta.

- **Elegido:** constante de pantalla `ORDER_SEARCH_MAX_LENGTH = 120` **atada al dominio por test**: el
  test de parámetros comprueba que `createListQuerySchema().safeParse({ search: 'a'.repeat(ORDER_SEARCH_MAX_LENGTH) })`
  acepta y que con uno más rechaza. Si el dominio mueve su tope, ese test se pone rojo. Mismo patrón que
  `ORDER_SKELETON_COLUMN_COUNT` atado a `ORDER_COLUMNS.length`.
- **Descartado (alternativa A): exportar `SEARCH_MAX_LENGTH` desde el contrato de `pedidos`.**
  `guard-contrato-listados.test.ts:313` exige que el `list-query.ts` de pedidos sea textualmente igual al
  de recetas (y de los demás listados): exportarlo obliga a tocar los siete módulos, lo que se sale de
  una ficha `frontend` y del alcance («la consulta es de QC-68»).

Límite aceptado: la caja compartida no tiene `maxLength`, así que quien teclee 121 caracteres ve los 121
en la caja mientras la consulta usa 120. No se toca el componente compartido por esto.

## 2. Caja de búsqueda: `order-table.tsx`

- Se quita `searchable={false}` (queda el defecto `true`). `ORDER_TABLE_TEXTS.search` pasa a
  `'Buscar por receta'` (copy no afirmado por ningún test; se localiza por `data-testid`/rol).
- **Vuelta a la primera página al cambiar el término (R2; confirmado en F1.4).** `onParamsChange` pasa
  por `withSearchResetsPage(params, next)`: `next.search !== current.search ? { ...next, page: FIRST_PAGE } : next`.
  Pura y testeable sin montar nada. `withSearch` de la tabla compartida no toca la página, y se deja así
  (lo usan otras cuatro pantallas).
- R10–R12 no requieren código: `navigate` ya envuelve `router.push` en `startTransition`. Se añaden los
  tests que hoy no existen para pedidos, copiando el de proveedores (`supplier-page.test.tsx`, «R14: con
  la navegacion en vuelo…», con el `push` retenido): `aria-busy="true"`, rótulo visible, la misma caja
  con foco y texto, sin `order-list-skeleton` ni `data-table-loading`.

## 3. Estado «sin coincidencias» (R13–R16), dentro de la tabla

### 3.1 Dónde se pinta

`OrderListSection` cambia **una** condición:

```
items.length === 0 && params.search === ''  -> <OrderListEmpty …> (sin cambios, R16)
items.length === 0 && params.search !== ''  -> <OrderTable … noMatches={{ clearHref }} />
```

`clearHref = orderListHref({ ...params, search: '', page: FIRST_PAGE })` (R15: conserva tamaño, orden y
filtros). Con cero filas **no** se llama a `listResponsiblesForOrdersAction` ni a
`loadResponsiblesCatalog`: no hay filas a las que repartir.

`OrderTable` recibe la prop opcional `noMatches?: { readonly clearHref: string }` y, cuando viene:

- `texts = { ...ORDER_TABLE_TEXTS, empty: ORDER_NO_MATCHES_MESSAGE }` con
  `ORDER_NO_MATCHES_MESSAGE = 'No hay pedidos que coincidan con la búsqueda.'` (el «…» de la decisión
  completado; no lo afirma ningún test).
- `emptyAction` = contenedor `data-testid="order-list-no-matches"` con un `<Link>` real
  (`buttonVariants({ variant: 'outline' })`, `min-h-11 min-w-11`, `data-slot="button"`,
  `data-testid="order-list-clear-search"`, texto «Limpiar la búsqueda») cuyo clic simple se intercepta y
  navega dentro de la transición (`navigateOnPlainClick`, copiado de `supplier-table.tsx`): así también
  se atenúa mientras vuelve la lista, y con modificadores se abre en otra pestaña.

`DataTable` pinta su `DataTableEmpty` (`data-testid="data-table-empty"`) con ese texto y esa acción, y
**mantiene montada la barra con la caja** (R14). `order-list-empty.tsx` **no se toca**.

Testids nuevos exportados por `order-table.tsx` y el barrel: `ORDER_LIST_NO_MATCHES_TESTID`,
`ORDER_LIST_CLEAR_SEARCH_TESTID`, `ORDER_NO_MATCHES_MESSAGE`.

### 3.2 La caja se vacía al limpiar (R15)

`DataTableSearchField` guarda su borrador en estado local inicializado **una vez** con `params.search`.
Tras «Limpiar» la tabla no se desmonta (es la misma instancia), así que sin más la caja seguiría
mostrando el término viejo. Ocurre hoy en proveedores y ningún test lo mira. Aquí se resuelve **sin
tocar el componente compartido**:

- `OrderTable` guarda dos estados: `boxEpoch: number` (empieza en 0) y `clearing: boolean`.
- El clic de «Limpiar la búsqueda»: `setBoxEpoch(e => e + 1)`, `setClearing(true)` y
  `navigate(clearHref)`.
- A `DataTable` se le pasa `key={boxEpoch}` y, mientras `clearing`, `params` con `search: ''` y
  `page: FIRST_PAGE`: la instancia nueva nace con el borrador vacío aunque la navegación no haya
  vuelto todavía.
- Cualquier emisión de la tabla (`onParamsChange`) pone `clearing` a `false`: a partir de ahí vuelven
  a mandar los `params` del servidor, que ya no traen término.

Remontar solo ocurre en ese clic explícito, nunca mientras se teclea, así que no rompe R11. El fijado de
columnas se restaura de `localStorage` al remontar (`usePinnedColumns`), sin pérdida.

### 3.3 Alternativas descartadas

- **B. El vacío fuera de la tabla, como `unit-list-empty.tsx`** (una variante de `OrderListEmpty` con
  `clearSearchHref`). Descartado —y confirmado así en F1.4— porque desmonta la tabla y con ella la caja
  en cuanto la consulta devuelve cero filas: quien teclea pierde la caja y el foco a mitad de palabra.
  Contradice R11 y R14. Del precedente se conservan el copy, la acción y el `<Link>` pintado con
  `buttonVariants`.
- **C. Arreglar la sincronía en `DataTableSearchField`** (resincronizar el borrador cuando
  `params.search` cambia por fuera). Es el arreglo de fondo y beneficiaría a inventario, proveedores,
  recetas, unidades y usuarios, pero toca una pieza compartida por cinco pantallas, fuera de una ficha
  de pedidos. Candidato a ficha propia.
- **D. `key` del `OrderTable` derivada de «hay/no hay coincidencias»** desde el Server Component.
  Remontaría la caja cada vez que el término pasa de casar a no casar mientras se teclea. Rompe R11.

## 4. El término sobrevive al panel lateral y a «Atrás» (R9, R26)

Se sigue de que el término vive **solo en la URL** y de que nada de esta pantalla la reescribe fuera
de `navigate`:

- **Panel lateral** (`OrderSheet`, diálogos de cancelar/borrar, responsables): abrir y cerrar no
  navega; guardar hace `router.refresh()`, que conserva la URL. No se toca nada; se añade el test.
- **Otra pantalla y «Atrás»**: la navegación con `router.push` apila cada consulta en el historial, así
  que «Atrás» vuelve a `/pedidos?…&q=<término>`. La página vuelve a leer `searchParams`, el parser saca
  el término, la consulta lo usa y la caja nace con él (su borrador se inicializa con `params.search`).
  Tampoco requiere código; lo cubre el E2E (R25 d), porque jsdom no tiene historial real.

Límite conocido y fuera de alcance: dentro de la propia `/pedidos`, «Atrás» entre dos términos
distintos cambia la URL y la lista pero **no** el texto de la caja (el mismo desfase de §3.2, sin clic
que lo dispare). Lo arregla la alternativa C.

## 5. Contratos de entrada/salida

Sin endpoints nuevos ni Server Actions nuevas. La única lectura sigue siendo `listOrdersAction(params)`
con `DataTableParams` enteros —ahora con `search` no vacío cuando hay término—. La forma de las claves
no cambia (`filters, page, pageSize, search, sort`), así que el test de «una sola llamada con los
parámetros enteros» solo cambia su comentario.

URL: `/pedidos?page=1&pageSize=10[&sort=…][&status=…][&priority=…][&createdFrom=…][&createdTo=…][&q=<término>]`.

## 6. Modelo de datos, RLS, migraciones

Ninguno. La búsqueda por receta existe (QC-68).

## 7. Tests que se sustituyen (no se relajan en silencio)

| Archivo | Bloque de hoy | Sustituido por |
|---|---|---|
| `order-list-params.test.ts` | «la pantalla todavia no busca…» (ignora `q`/`search`, nunca emite) | R4–R7: lee `q`, emite `q`, sigue ignorando `search`, recorta a 120, ida y vuelta con término |
| `order-table.test.tsx` | «la caja de busqueda NO existe (R20)» | R1, R2, R8, R10–R15 |
| `order-list-section.test.tsx` | comentario «`search` siempre vacío» | R13, R16 y la ausencia de la llamada de responsables con cero filas |

`order-columns.test.tsx` **no se toca**: sus diez columnas y el bloque «la tabla de pedidos no pinta el
importe (R18)» de QC-123 siguen vigentes.

## 8. E2E: `e2e/pedidos-busqueda.spec.ts` (R25)

Sobre el patrón de `e2e/aislamiento-pedidos.spec.ts` y `e2e/pedidos.spec.ts`: prefijo `qc122_e2e_` +
`RUN_ID`, empresa efímera (la lista solo contiene lo del spec), administrador creado con hash real,
`loginAndLand` de `e2e/helpers/landing.ts` (lo exige `guard-e2e-landing.test.ts`), URL derivada de
`ORDERS_ROUTE`, correlativo con `formatOrderNumber`, limpieza en `afterAll` en el orden de las FK y
limpieza defensiva de huérfanos por prefijo y edad. Chromium y WebKit.

Fixture (Prisma directo, sin pasar por la UI):

- Receta A `Ácido Cítrico <RUN_ID>` (viva), receta B `Acido citrico baja <RUN_ID>` (dada de baja,
  `deletedAt` puesto), receta C `Sosa <RUN_ID>` (viva).
- Pedidos: dos de A, uno de B, y más de diez de C, para que el término de C dé **dos páginas** con
  `pageSize=10`.

Recorrido:

1. Escribir `acido citrico` en `data-table-search`: esperar a que la URL lleve `q=acido+citrico`; las
   filas son exactamente las de A y B, por correlativo (R25 a).
2. Escribir un término que no casa: aparece `order-list-no-matches` dentro de `order-table` y no
   `order-list-empty`; la caja sigue con el término. «Limpiar la búsqueda» -> la URL sin `q`, la caja
   vacía, vuelven todos (R25 c).
3. Escribir el término de C: pasar a la página 2 -> la URL conserva `q`; abrir el panel lateral de una
   fila y cerrarlo -> URL, caja y filas siguen; recargar -> igual; ir a otra pantalla del menú y
   volver con `page.goBack()` -> URL, caja y filas siguen (R25 d, R9, R26).

«Sin red»: no llama a ningún servicio externo; necesita la app (`webServer` de Playwright) y el Postgres
local con `db:seed` (roles), igual que el resto de `e2e/`. `init.sh` no corre Playwright: el E2E se
ejecuta con `pnpm run e2e` y su salida va a `progress/impl_QC-122-….md`.

## 9. Multiplataforma

La caja es el `Input` compartido con `min-h-11` y `text-base` (44 px, 16 px); la acción de limpiar,
`min-h-11 min-w-11`. Nada depende de `:hover`. Sin excepción de escritorio.

## 10. Decisiones de este diseño cerradas en F1.4 (2026-09-23)

1. El estado «sin coincidencias» va **dentro de la tabla** (§3, patrón de proveedores).
2. Una búsqueda nueva vuelve a la **página 1** (§2).
3. «Volver del detalle» = abrir y cerrar el panel lateral **y** ir a otra pantalla y volver con Atrás
   (§4, R9, R26).
4. «Importe entre Presentación y Fecha de solicitud»: **descartada**, no hay columna (importe -> QC-151).
