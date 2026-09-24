# QC-122 — busqueda-y-total-en-la-pantalla-de-pedidos · tasks.md

> **Cambio de alcance en F1.4 (2026-09-23):** solo búsqueda. Las tasks del importe (formateador, columna,
> 10 -> 11 columnas, guardias `Intl`/`toLocaleString`, guion en el E2E) se retiran y van a **QC-151**.
>
> Orden: T1 primero. T2 depende de T1. T3 depende de T2. T4 depende de T3. T5 depende de T3 y puede ir
> en paralelo con T4 `[P]`. T6 cierra.
> Cada task: un commit `feat(QC-122): …` / `test(QC-122): …`. Tanda cerrada con `./init.sh --rapido`.
> Comentarios: en cada archivo tocado se limpian los de las líneas que toca la rama, sin citar fichas ni
> `R<n>` en producción (`docs/conventions.md > Comentarios`).

## [x] T1 — Parámetros: `q` entra y sale de la URL (R4, R5, R6, R7, R2)

- `order-list-params.ts`: `SEARCH_PARAM = 'q'`, `ORDER_SEARCH_MAX_LENGTH = 120`; `parseOrderListParams`
  lee `q` (trim, truncar, trim); `buildOrderListQuery` escribe `q` solo si no está vacío; nunca `search`.
  Función pura `withSearchResetsPage(current, next)`. Docblock: se retira «`search` no se lee ni se
  escribe».
- Barrel `components/index.ts`: añadir `SEARCH_PARAM`, `ORDER_SEARCH_MAX_LENGTH`,
  `withSearchResetsPage`. No se quita ninguna exportación.
- `tests/unit/pedidos-ui/order-list-params.test.ts`: **sustituir** el bloque «la pantalla todavia no
  busca…» por casos de R4–R7 (`q` con espacios, vacío, solo espacios, 121+ caracteres recortados, un
  `search` en la URL sigue ignorado, ida y vuelta con término, `withSearchResetsPage` resetea la página
  solo si cambia el término) y el test que ata `ORDER_SEARCH_MAX_LENGTH` a `createListQuerySchema()`
  (acepta 120, rechaza 121).
- **Hecho:** los casos nuevos, con `R<n>` en el nombre, en verde; el bloque viejo ya no existe.

## [x] T2 — La caja montada y la vuelta a la página 1 (R1, R2, R3, R8, R10, R11, R12)

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

## [x] T3 — Estado «sin coincidencias» dentro de la tabla, y limpiar (R13, R14, R15, R16)

Depende de T2.

- `order-table.tsx`: prop `noMatches?: { clearHref }`, `ORDER_NO_MATCHES_MESSAGE`,
  `ORDER_LIST_NO_MATCHES_TESTID`, `ORDER_LIST_CLEAR_SEARCH_TESTID`, `emptyAction` con `<Link>` +
  `navigateOnPlainClick`, y el reinicio de la caja (`boxEpoch` + `clearing`, `design.md > 3.2`).
  Exportar las constantes por el barrel.
- `order-list-section.tsx`: con cero filas y término, `<OrderTable noMatches={{ clearHref }} …>` sin
  pedir responsables ni su catálogo; sin término, `<OrderListEmpty>` como hoy.
- Tests en `order-list-section.test.tsx`: cero filas + término -> `order-list-no-matches` presente
  dentro de `order-table`, `order-list-empty` ausente, `data-table-search` presente con el término (R13,
  R14), `listResponsiblesForOrdersAction` no llamada; `clearHref` sin `q`, con `page=1` y con
  `pageSize`, `sort` y filtros (R15); cero filas sin término -> `order-list-empty` y sin
  `order-list-clear-search` (R16).
- Tests en `order-table.test.tsx`: clic en «Limpiar la búsqueda» -> `router.push(clearHref)` y la caja
  queda vacía antes y después de rerender con `params.search = ''` (R15); clic con modificador no
  intercepta.
- **Hecho:** tests en verde; `order-list-empty.tsx`, `order-columns.tsx` y `order-list-skeleton.tsx`
  sin diff.

## [x] T4 [P] — El término sobrevive al panel lateral (R4, R9) y regresiones

Depende de T3.

- Test de pantalla (`order-sheet.test.tsx` o `pedidos-viewport.test.tsx`, el que ya monta
  `PedidosPage`): con `q` en `searchParams`, la consulta recibe el término y la caja lo muestra (R4);
  abrir y cerrar el panel lateral de una fila no llama a `router.push` ni `router.replace` y la caja
  conserva el término (R9).
- Revisar que siguen en verde sin relajar afirmaciones: `order-columns` (diez columnas y el bloque R18
  de QC-123, intactos), `pedidos-viewport`, `a11y-tactil`, `read-only`, `order-row-wiring`,
  `order-sheet-responsibles`, `pedidos-convenciones`, `permiso-ruta-pedidos`,
  `guard-pantalla-pedidos-se-amplia`.
- **Hecho:** `./init.sh --rapido` en verde.

## [x] T5 [P] — E2E (R25 a, c, d; R9; R26)

Depende de T3.

- Nuevo `e2e/pedidos-busqueda.spec.ts` según `design.md > 8`: fixture por Prisma (empresa efímera,
  admin, receta A acentuada, B dada de baja, C con más de diez pedidos), `loginAndLand`, recorrido 1–3
  (incluidos recargar y otra pantalla + `page.goBack()`), limpieza en `afterAll` y de huérfanos por
  prefijo y edad. Chromium y WebKit. Nada sobre el importe.
- **Hecho:** `pnpm run e2e -- pedidos-busqueda` en verde en los dos navegadores, salida pegada en
  `progress/impl_QC-122-busqueda-y-total-en-la-pantalla-de-pedidos.md`; `guard-e2e-landing.test.ts` en
  verde.

## [x] T6 — Cierre — gate completo 2026-09-23: 640 archivos verdes y 1 rojo AJENO (`guard-arquitectura-modulos`, de `a01c90cb` en dev; lo arregla `fix/import-profundo-product-type`)

Depende de T1–T5.

- `progress/impl_QC-122-busqueda-y-total-en-la-pantalla-de-pedidos.md` con el mapa `R<n> -> test`
  (archivo y nombre del caso) para R1–R16, R25 (a, c, d) y R26; R17–R24 y R25 (b) anotados como
  «retirados en F1.4, van a QC-151», sin test; y la lista de tests sustituidos de `design.md > 7`.
- `./init.sh` completo en verde.
- **Hecho:** todos los requisitos vigentes mapeados a un test concreto; gate completo verde.

## [x] T7 — La caja sigue a la URL cuando el término cambia por fuera (R27)

> Ampliación de alcance decidida por el humano el 2026-09-23 («sí, arréglalo aquí»). R27 lo escribirá
> formalmente `spec_author` en `requirements.md`.

Depende de T3.

- **R27.** Cuando el término de búsqueda de la URL (`?q=`) cambie sin que el usuario teclee en la caja
  —p. ej. buscar A, luego B, y pulsar Atrás dentro de `/pedidos`—, el texto de la caja DEBE mostrar el
  término de la URL (A), igual que ya lo hacen la lista y la paginación.
- Resolverlo en `order-table.tsx` **sin tocar** `components/shared/data-table` y sin romper el foco
  mientras el usuario escribe (R11): remontar la caja solo cuando `params.search` llega con un valor
  que no salió de la propia caja.
- Test de componente en `order-table.test.tsx` que muerda (rojo sin el arreglo): rerender con un
  `params.search` externo -> la caja lo muestra; rerender con el término que la propia caja emitió
  (y con uno intermedio ya superado mientras se teclea) -> la caja no se remonta y conserva foco y texto.
- Paso en `e2e/pedidos-busqueda.spec.ts`: buscar A, buscar B, `page.goBack()` -> URL con `q=A` y la caja
  dice A.
- **Hecho:** tests en verde; `components/shared/**` sin diff; anotado en la bitácora.
