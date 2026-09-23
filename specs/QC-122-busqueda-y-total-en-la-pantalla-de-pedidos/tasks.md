# QC-122 — busqueda-y-total-en-la-pantalla-de-pedidos · tasks.md

> Orden: T1 y T2 son independientes `[P]`. T3 depende de T1. T4 depende de T3. T5 depende de T2.
> T6 depende de T3, T4 y T5. T7 depende de T4 y T5. T8 cierra.
> Cada task: un commit `feat(QC-122): …` / `test(QC-122): …`. Tanda cerrada con `./init.sh --rapido`.
> Comentarios: en cada archivo tocado se limpian los de las líneas que toca la rama, sin citar fichas ni
> `R<n>` en producción (`docs/conventions.md > Comentarios`).

## T1 [P] — Parámetros: `q` entra y sale de la URL (R4, R5, R6, R7, R2)

- `order-list-params.ts`: `SEARCH_PARAM = 'q'`, `ORDER_SEARCH_MAX_LENGTH = 120`; `parseOrderListParams`
  lee `q` (trim, truncar, trim); `buildOrderListQuery` escribe `q` solo si no está vacío; nunca `search`.
  Función pura `withSearchResetsPage(current, next)`. Docblock: se retira «`search` no se lee ni se
  escribe».
- Barrel `components/index.ts`: añadir `SEARCH_PARAM`, `ORDER_SEARCH_MAX_LENGTH`,
  `withSearchResetsPage`. No se quita ninguna exportación.
- `tests/unit/pedidos-ui/order-list-params.test.ts`: **sustituir** el bloque «la pantalla todavia no
  busca…» por casos de R4–R7 (`q` con espacios, vacío, solo espacios, 121+ caracteres recortados, un
  `search` en la URL sigue ignorado, ida y vuelta con término, `withSearchResetsPage` resetea página
  solo si cambia el término) y el test que ata `ORDER_SEARCH_MAX_LENGTH` a `createListQuerySchema()`
  (acepta 120, rechaza 121).
- **Hecho:** los casos nuevos, con `R<n>` en el nombre, en verde; el bloque viejo ya no existe.

## T2 [P] — Formateador del importe (R21, R22, R23)

- Nuevo `app/(private)/pedidos/components/order-amount.ts`: `ORDER_AMOUNT_SYMBOL`,
  `formatOrderAmount(value)` según `design.md > 4.2` (texto + `formatDecimalDisplay`, sin `.replace(`,
  `Number(`, `parseFloat`, `.toFixed(`, `Intl`, `toLocaleString`). Exportar por el barrel.
- Nuevo `tests/unit/pedidos-ui/order-amount.test.ts`: `1234567.5000` -> `$ 1,234,567.50`; `12.3456` ->
  `$ 12.35`; `999.9950` -> `$ 1,000.00`; `100.0000` -> `$ 100.00`; `0.1250` -> `$ 0.13`; `0.0000` ->
  `$ 0.00`; `999.0000` -> `$ 999.00` (sin coma); `1000` -> `$ 1,000.00`; `9999999999.9999` (el máximo de
  `decimal(14,4)`) -> `$ 10,000,000,000.00`; texto no decimal -> tal cual.
- `pedidos-convenciones.test.ts > conversionesDeImporte`: añadir `\bIntl\s*\.` y `\.toLocaleString\s*\(`
  con su caso negativo (y que `toLocaleLowerCase` no muerde). Añadir el caso de diff «la rama no
  modifica `lib/shared/ui/decimal-display.ts`» con `skip` ruidoso sin rango.
- **Hecho:** tests en verde; `decimal-display.ts` y su test sin diff.

## T3 — La caja montada y la vuelta a la página 1 (R1, R2, R3, R8, R10, R11, R12)

Depende de T1.

- `order-table.tsx`: quitar `searchable={false}`; `ORDER_TABLE_TEXTS.search = 'Buscar por receta'`;
  `onParamsChange={(next) => navigate(orderListHref(withSearchResetsPage(params, next)))}`. Limpiar el
  docblock de «la caja no se monta».
- `tests/unit/pedidos-ui/order-table.test.tsx`: **sustituir** «la caja de busqueda NO existe (R20)» por:
  la caja existe con `min-h-11` y `text-base` (R1); teclear + temporizadores falsos ->
  `router.push` con `q=<término>` y `page=1` desde la página 3, conservando `pageSize`, `sort` y filtros
  (R2, R8); pasar de página con término conserva `q` (R8); las filas pintadas son las recibidas, en su
  orden, aunque ninguna contenga el término (R3); con el `push` retenido: `aria-busy="true"`, rótulo de
  carga visible, la misma caja con foco y texto, sin `order-list-skeleton` ni `data-table-loading` (R10,
  R11), y al soltarlo desaparecen (R12). Patrón: `supplier-page.test.tsx > R14`.
- **Hecho:** tests en verde; ningún test de `order-table.test.tsx` fuera del bloque sustituido cambia
  sus afirmaciones.

## T4 — Estado «sin coincidencias» y limpiar (R13, R14, R15, R16)

Depende de T3.

- `order-table.tsx`: prop `noMatches?: { clearHref }`, `ORDER_NO_MATCHES_MESSAGE`,
  `ORDER_LIST_NO_MATCHES_TESTID`, `ORDER_LIST_CLEAR_SEARCH_TESTID`, `emptyAction` con `<Link>` +
  `navigateOnPlainClick`, y el reinicio de la caja (`boxEpoch` + `clearing`, `design.md > 3.2`).
  Exportar las constantes por el barrel.
- `order-list-section.tsx`: con cero filas y término, `<OrderTable noMatches={{ clearHref }} …>` sin
  pedir responsables ni su catálogo; sin término, `<OrderListEmpty>` como hoy.
- Tests en `order-list-section.test.tsx`: cero filas + término -> `order-list-no-matches` presente,
  `order-list-empty` ausente, `data-table-search` presente con el término (R13, R14),
  `listResponsiblesForOrdersAction` no llamada; `clearHref` sin `q`, con `page=1` y con `pageSize`,
  `sort` y filtros (R15); cero filas sin término -> `order-list-empty` y sin
  `order-list-clear-search` (R16).
- Tests en `order-table.test.tsx`: clic en «Limpiar la búsqueda» -> `router.push(clearHref)` y la caja
  queda vacía antes y después de rerender con `params.search = ''` (R15); clic con modificador no
  intercepta.
- **Hecho:** tests en verde; `order-list-empty.tsx` sin diff.

## T5 — Columna Importe (R17, R18, R19, R20, R21, R22, R24)

Depende de T2.

- `order-columns.tsx`: `INGREDIENTS_COST_COLUMN_ID`, columna «Importe» entre Presentación y Fecha de
  solicitud, `align: 'end'`, sin `sortable` ni `filter`; `null` -> `MissingValue`; valor ->
  `<span title={exactDecimalTitle(v)}>{formatOrderAmount(v)}</span>`. Limpiar el docblock de «no hay
  columna de total». Exportar el id por el barrel.
- `order-list-skeleton.tsx`: `ORDER_SKELETON_COLUMN_COUNT = 11`.
- `order-columns.test.tsx`: **sustituir** «las diez acordadas» por las once en orden y «la tabla de
  pedidos no pinta el importe (R18)» por: la columna existe y pinta `ingredientsCost` tal cual llega
  formateado (R17); `sortable`/`filter` indefinidos (R18); `null` -> `order-missing-ingredientsCost`,
  sin `0` en el texto (R19); `0.0000` -> `$ 0.00` sin marcador (R20); `1234567.5000` ->
  `$ 1,234,567.50` sin `title`, `12.3456` -> `$ 12.35` con `title="12.3456"` (R21, R22). Se conserva
  el caso «ninguna columna es `total`…».
- `order-table.test.tsx`: la cabecera de Importe no tiene botón de orden y la barra de filtros no tiene
  control `data-table-filter-ingredientsCost` (R18). Test del esqueleto ya existente en verde con 11
  (R24).
- **Hecho:** tests en verde; `guard-pantalla-pedidos-se-amplia.test.ts` en verde (solo se añaden
  exportaciones).

## T6 — Conservar el término (R9) y regresiones de la pantalla

Depende de T3, T4 y T5.

- Test de pantalla (`order-sheet.test.tsx` o `pedidos-viewport.test.tsx`, el que ya monta
  `PedidosPage`): con `q` en `searchParams`, la consulta recibe el término y la caja lo muestra (R4);
  abrir y cerrar el panel lateral de una fila no llama a `router.push` ni `router.replace` y la caja
  conserva el término (R9).
- Revisar que siguen en verde sin relajar afirmaciones: `pedidos-viewport`, `a11y-tactil`,
  `read-only`, `order-row-wiring`, `order-sheet-responsibles`, `pedidos-convenciones`,
  `permiso-ruta-pedidos`.
- **Hecho:** `./init.sh --rapido` en verde.

## T7 — E2E (R25)

Depende de T4 y T5.

- Nuevo `e2e/pedidos-busqueda-importe.spec.ts` según `design.md > 8`: fixture por Prisma (empresa
  efímera, admin, recetas A acentuada, B dada de baja, C; pedidos con y sin importe; >10 de C),
  `loginAndLand`, recorrido (a)–(d), limpieza en `afterAll` y de huérfanos por prefijo y edad.
  Chromium y WebKit.
- **Hecho:** `pnpm run e2e -- pedidos-busqueda-importe` en verde en los dos navegadores, salida pegada
  en `progress/impl_QC-122-busqueda-y-total-en-la-pantalla-de-pedidos.md`;
  `guard-e2e-landing.test.ts` en verde.

## T8 — Cierre

Depende de T1–T7.

- `progress/impl_QC-122-busqueda-y-total-en-la-pantalla-de-pedidos.md` con el mapa `R1…R25 -> test`
  (archivo y nombre del caso) y la lista de tests sustituidos de `design.md > 7`.
- `./init.sh` completo en verde.
- **Hecho:** los 25 requisitos mapeados a un test concreto; gate completo verde.
