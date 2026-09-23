# QC-122 — busqueda-y-total-en-la-pantalla-de-pedidos · design.md

> Ficha **de pantalla**: todo el cambio vive en `app/(private)/pedidos/components/`, sus tests y un
> spec E2E nuevo. **No toca** `lib/modules/**`, `db/**`, `lib/composition/**`,
> `components/shared/data-table/**`, `components/ui/**`, `lib/shared/ui/decimal-display.ts` ni
> `package.json`. Sin dependencias nuevas.

## 0. Lo que ya existe y se usa tal cual (verificado en disco el 2026-09-23)

| Pieza | Dónde | Qué aporta |
|---|---|---|
| La consulta con búsqueda | `lib/modules/pedidos/domain/list-orders.ts` | Recibe `search` (ya `trim` + `max(120)` en `createListQuerySchema`), lo resuelve a ids de receta con `findIdsMatchingName` (sin acentos, bajas incluidas, empresa del actor) y pagina sobre el conjunto filtrado. `ORDER_QUERYABLE.searchable === true`. |
| El importe en la fila | `OrderSummary = OrderView`, `ingredientsCost: string \| null` (`order-view.ts`) | Cadena `decimal(14,4)` o `null`. Ya llega a `OrderTable` en cada fila. |
| La caja de búsqueda | `DataTableSearchField` dentro de `DataTable` (`components/shared/data-table/data-table-filters.tsx`) | `<Input type="search">` con `min-h-11 text-base`, `data-testid="data-table-search"`, rebote de `SEARCH_DEBOUNCE_MS` (300 ms), emite `withSearch(params, draft)`. Hoy apagada con `searchable={false}`. |
| «En vuelo» sin desmontar | `OrderTable` (`useTransition` + `router.push`) | `aria-busy`, `opacity-60` y el rótulo `ORDER_TABLE_TEXTS.loading` mientras `isPending`. La tabla no se desmonta: el foco de la caja sobrevive. Mismo patrón en inventario y proveedores. Cubre R10–R12 sin código nuevo. |
| Vacío filtrado **dentro** de la tabla | `supplier-table.tsx` (proveedores) | `texts.empty` sustituido y `emptyAction` con un `<Link>` que en clic simple navega dentro de la transición. Es el precedente directo de §3. |
| Marcador de ausencia | `MissingValue` en `order-columns.tsx` (`—`, `aria-label="Sin dato"`, `data-testid="order-missing-<campo>"`) | R19 lo reutiliza. |
| Presentación de decimales | `formatDecimalDisplay` / `exactDecimalTitle` (`lib/shared/ui/decimal-display.ts`) | Redondeo exacto con `BigInt` a 2 decimales (empate alejándose del cero) y el `title` exacto solo si difiere. **No se toca** (R23). |
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
- Exportaciones nuevas al barrel `components/index.ts`: `SEARCH_PARAM`, `ORDER_SEARCH_MAX_LENGTH`.
  Ninguna existente se quita (lo vigila `guard-pantalla-pedidos-se-amplia.test.ts`).

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
- **Vuelta a la primera página al cambiar el término (R2).** `onParamsChange` pasa por una función pura
  nueva de `order-list-params.ts`:

  ```ts
  export function withSearchResetsPage(current: DataTableParams, next: DataTableParams): DataTableParams
  // next.search !== current.search ? { ...next, page: FIRST_PAGE } : next
  ```

  Pura y testeable sin montar nada. `withSearch` de la tabla compartida no toca la página, y se deja así
  (lo usan otras cuatro pantallas).
- R10–R12 no requieren código: `navigate` ya envuelve `router.push` en `startTransition`. Se añaden los
  tests que hoy no existen para pedidos, copiando el de proveedores (`supplier-page.test.tsx`, «R14: con
  la navegacion en vuelo…», con el `push` retenido): `aria-busy="true"`, rótulo visible, la misma caja
  con foco y texto, sin `order-list-skeleton` ni `data-table-loading`.

## 3. Estado «sin coincidencias» (R13–R16)

### 3.1 Dónde se pinta

`OrderListSection` cambia **una** condición:

```
items.length === 0 && params.search === ''  -> <OrderListEmpty …> (sin cambios, R16)
items.length === 0 && params.search !== ''  -> <OrderTable … noMatches={{ clearHref }} />
```

`clearHref = orderListHref({ ...params, search: '', page: FIRST_PAGE })` (R15: conserva tamaño, orden y
filtros). Con cero filas **no** se llama a `listResponsiblesForOrdersAction` ni a
`loadResponsiblesCatalog`: no hay filas a las que repartir (se mantiene «con cero pedidos no hay nada
que preguntar»).

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
  `clearSearchHref`). Es el precedente que cita la decisión y el más barato. **Descartado** porque
  desmonta la tabla —y con ella la caja— en cuanto la consulta devuelve cero filas: quien teclea
  «ác», «áci», «ácix» pierde la caja y el foco a mitad de palabra en cuanto llega el vacío, y para
  corregir tiene que limpiar y volver a escribir. Contradice R11 y R14. Del precedente se conservan
  el copy, la acción y el `<Link>` pintado con `buttonVariants`; lo que cambia es dónde se monta, que es
  lo que ya hace proveedores.
- **C. Arreglar la sincronía en `DataTableSearchField`** (resincronizar el borrador cuando
  `params.search` cambia por fuera). Es el arreglo de fondo y beneficiaría a inventario, proveedores,
  recetas, unidades y usuarios, pero toca una pieza compartida por cinco pantallas con sus propios
  tests, fuera de una ficha de pedidos. Se deja anotado como candidato a ficha propia.
- **D. `key` del `OrderTable` derivada de «hay/no hay coincidencias»** desde el Server Component.
  Remontaría la caja cada vez que el término pasa de casar a no casar mientras se teclea. Rompe R11.

## 4. Columna Importe (R17–R24)

### 4.1 Declaración (`order-columns.tsx`)

```ts
export const INGREDIENTS_COST_COLUMN_ID = 'ingredientsCost';
{
  id: INGREDIENTS_COST_COLUMN_ID,
  label: 'Importe',
  align: 'end',
  // sin sortable y sin filter (R18); pinnable por defecto, como las demás de datos
  cell: (order) =>
    order.ingredientsCost === null
      ? <MissingValue field={INGREDIENTS_COST_COLUMN_ID} />
      : <span title={exactDecimalTitle(order.ingredientsCost)}>{formatOrderAmount(order.ingredientsCost)}</span>,
}
```

**Posición:** entre «Presentación» y «Fecha de solicitud» (tras las dos columnas que describen qué se
pidió y cuánto). La decisión no fija la posición: es la propuesta de este diseño, revisable en F1.4.
Pasan a ser **once** columnas; `ORDER_SKELETON_COLUMN_COUNT` sube a 11 (R24) y el test que lo ata a
`ORDER_COLUMNS.length` ya existe.

Al tocar el archivo se limpian los comentarios de las líneas tocadas (`docs/conventions.md >
Comentarios`): en particular el docblock que dice «No hay columna de total… lo calculará el servidor en
QC-68», que pasa a ser falso.

### 4.2 El formateador: `app/(private)/pedidos/components/order-amount.ts` (nuevo)

`formatDecimalDisplay` redondea a dos decimales pero **recorta** los ceros (`12.5`, `100`) y no agrupa
miles; el formato decidido pide **siempre dos decimales**, coma de miles y `$ `. Hace falta una utilidad
nueva; `decimal-display.ts` no se toca (R23).

```ts
export const ORDER_AMOUNT_SYMBOL = '$';
/** '1234567.5000' -> '$ 1,234,567.50'. Texto no decimal -> se devuelve tal cual. */
export function formatOrderAmount(value: string): string
```

Algoritmo, todo sobre texto:

1. Si `value` no es un decimal en notación plana (`^-?\d+(\.\d+)?$`, el patrón de `decimal-display.ts`),
   devolverlo tal cual, con el mismo criterio que `formatDecimalDisplay`. Si lo es,
   `rounded = formatDecimalDisplay(value)`: reutiliza el redondeo exacto con `BigInt` que ya existe.
2. Separar signo, parte entera y fracción con `split('.')`; `fraction.padEnd(2, '0')`.
3. Agrupar la parte entera con un bucle de `slice` de tres en tres desde la derecha, uniendo con `,`.
4. `${sign}${ORDER_AMOUNT_SYMBOL} ${grouped}.${fraction}`. Un negativo no ocurre (QC-123 promedia costes
   de lote), pero el formateador es total y lo pinta `-$ 12.50`.

Sin `.replace(` (la guardia `conversionesDeImporte` lo prohíbe en líneas que nombran `amount`), sin
`Number(`, `parseFloat`, `.toFixed(`, `Intl` ni `toLocaleString`.

**Dónde vive, y por qué ahí.** Un solo consumidor (la celda de pedidos): `docs/architecture.md >
Componentes > sin sobre-ingeniería` lo deja junto a la ruta. Hermano de `order-decimal.ts`, al que se
parece. Si mañana otra pantalla pinta importes con este formato, se promueve a `lib/shared/ui/` en esa
ficha. **Descartado (alternativa E):** `lib/shared/ui/money-display.ts` desde ya —una utilidad
compartida sin segundo consumidor—, y **(F)** añadir un parámetro `minFractionDigits` a
`formatDecimalDisplay`, que es modificar el archivo que la decisión y QC-132 declaran intocable.

**Librería.** Formatear moneda es lo que hace `Intl.NumberFormat` (nativo, sin dependencia), y la
decisión lo excluye expresamente; `decimal.js` / `big.js` resolverían aritmética, no agrupar miles, y
el redondeo ya está resuelto en `decimal-display.ts`. Ninguna dependencia nueva.

### 4.3 El `title` (R22)

`exactDecimalTitle(order.ingredientsCost)` sin cambios: devuelve el valor exacto (`trimDecimal`) solo si
difiere de `formatDecimalDisplay`. Relleno a dos decimales y separadores no cambian el valor, así que
«difiere» es exactamente «el redondeo a 2 esconde cifras». Es el patrón de QC-132, sin `$` ni comas.

### 4.4 La guardia (R23)

`tests/unit/pedidos-ui/pedidos-convenciones.test.ts > conversionesDeImporte` gana dos reglas, con su
caso negativo como el resto del archivo: `\bIntl\s*\.` y `\.toLocaleString\s*\(` prohibidos en toda la
ruta (el `toLocaleLowerCase` de `order-responsibles.tsx` no casa). Y un test de diff que comprueba que la
rama no modifica `lib/shared/ui/decimal-display.ts`, con el `skip` ruidoso cuando el rango
`origin/dev..HEAD` no está (mismo criterio que los casos de diff del archivo).

## 5. Contratos de entrada/salida

Sin endpoints nuevos ni Server Actions nuevas. La única lectura sigue siendo `listOrdersAction(params)`
con `DataTableParams` enteros —ahora con `search` no vacío cuando hay término—. La forma de las claves
no cambia (`filters, page, pageSize, search, sort`), así que el test de «una sola llamada con los
parámetros enteros» solo cambia su comentario.

URL: `/pedidos?page=1&pageSize=10[&sort=…][&status=…][&priority=…][&createdFrom=…][&createdTo=…][&q=<término>]`.

## 6. Modelo de datos, RLS, migraciones

Ninguno. `orders.ingredients_cost` y la búsqueda por receta existen (QC-123, QC-68).

## 7. Tests que se sustituyen (no se relajan en silencio)

| Archivo | Bloque de hoy | Sustituido por |
|---|---|---|
| `order-list-params.test.ts` | «la pantalla todavia no busca…» (ignora `q`/`search`, nunca emite) | R4–R7: lee `q`, emite `q`, sigue ignorando `search`, recorta a 120, ida y vuelta con término |
| `order-table.test.tsx` | «la caja de busqueda NO existe (R20)» | R1, R2, R8, R10–R15 |
| `order-columns.test.tsx` | «las diez acordadas» y «la tabla de pedidos no pinta el importe (R18)» | once ids con `INGREDIENTS_COST_COLUMN_ID` entre presentación y fecha; R17–R22 |
| `order-list-section.test.tsx` | comentario «`search` siempre vacío» | R13, R16 y la ausencia de la llamada de responsables con cero filas |

El caso «ninguna columna es `total`, `createdBy`, `updatedBy`, unidad ni precio» **se conserva**: el id
nuevo es `ingredientsCost`.

## 8. E2E: `e2e/pedidos-busqueda-importe.spec.ts` (R25)

Sobre el patrón de `e2e/aislamiento-pedidos.spec.ts` y `e2e/pedidos.spec.ts`: prefijo
`qc122_e2e_` + `RUN_ID`, empresa efímera (así la lista solo contiene lo del spec y no hace falta filtrar
por correlativo para contar filas), administrador creado con hash real, `loginAndLand` de
`e2e/helpers/landing.ts` (lo exige `guard-e2e-landing.test.ts`), URL derivada de `ORDERS_ROUTE`,
correlativo con `formatOrderNumber`, limpieza en `afterAll` en el orden de las FK y limpieza defensiva
de huérfanos por prefijo y edad. Chromium y WebKit.

Fixture (Prisma directo, sin pasar por la UI):

- Receta A `Ácido Cítrico <RUN_ID>` (viva), receta B `Acido citrico baja <RUN_ID>` (dada de baja,
  `deletedAt` puesto), receta C `Sosa <RUN_ID>` (viva).
- Pedidos: A1 con `ingredientsCost = '1234567.5000'`, A2 con `ingredientsCost = null`, B1 con
  importe, C1 con importe; y los suficientes de C para que haya **dos páginas** con `pageSize=10` y
  término que case con C (R25 d).

Recorrido:

1. Entrar en la lista: los pedidos de A, B y C visibles; A1 muestra `$ 1,234,567.50`; A2 muestra el
   marcador `order-missing-ingredientsCost` y no `$ 0.00` (R25 b).
2. Escribir `acido citrico` en `data-table-search`: esperar a que la URL lleve `q=acido+citrico`; las
   filas son exactamente A1, A2 y B1, por correlativo (R25 a).
3. Escribir un término que no casa: aparece `order-list-no-matches` y no `order-list-empty`; la caja
   sigue con el término. «Limpiar la búsqueda» -> la URL sin `q`, la caja vacía, vuelven todos (R25 c).
4. Escribir el término de C: pasar a la página 2 -> la URL conserva `q`; abrir el panel lateral de una
   fila y cerrarlo -> la URL, la caja y las filas siguen (R25 d). Recargar -> igual.

«Sin red»: no llama a ningún servicio externo; necesita la app (`webServer` de Playwright) y el Postgres
local con `db:seed` (roles), igual que el resto de `e2e/`. `init.sh` no corre Playwright: el E2E se
ejecuta con `pnpm run e2e` y su salida va a `progress/impl_QC-122-….md`.

## 9. Multiplataforma

La caja es el `Input` compartido con `min-h-11` y `text-base` (44 px, 16 px); la acción de limpiar,
`min-h-11 min-w-11`. La columna nueva entra en el scroll horizontal que ya absorbe
`components/ui/table.tsx`. Nada depende de `:hover`: el `title` es complemento (aceptado en QC-127 /
QC-132 que no se ve en móvil). Sin excepción de escritorio.

## 10. Puntos que el diseño decide y conviene mirar en F1.4

1. **Posición de la columna Importe** (§4.1): entre Presentación y Fecha de solicitud.
2. **«Volver del detalle»** se lee como abrir y cerrar el panel lateral: `/pedidos` no tiene página de
   detalle (`lib/shared/routes.ts`, «no hay pagina de detalle»).
3. **El vacío se pinta dentro de la tabla** (§3.1, patrón de proveedores) y no fuera como en unidades,
   para no perder la caja.
4. **Cambiar el término vuelve a la página 1** (R2), derivado de «sobre el conjunto completo».
