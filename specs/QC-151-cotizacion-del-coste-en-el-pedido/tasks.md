# QC-151 — cotizacion-del-coste-en-el-pedido · tasks.md

> Orden: T1 -> T2 -> T3 en el servidor; T4 y T5 en paralelo con el servidor; T6 cuando T3, T4 y T5
> están; T7 y T8 al final. `[P]` = paralelizable con las marcadas en su línea. Commits
> `feat(QC-151): …` / `test(QC-151): …`, uno por task. Ningún comentario de producción cita la ficha
> ni un `R<n>` (`docs/conventions.md > Comentarios`).
>
> **Solape con QC-141** (`lib/composition/index.ts` y otros, `design.md > 9`): el humano aceptó el
> 2026-09-23 arrancar en paralelo; quien mergee segundo resuelve el conflicto.

## [x] T1 — Esquema y caso de uso de cotización `[primera]`

Archivos: `lib/modules/pedidos/domain/order-input.ts`, `lib/modules/pedidos/domain/quote-order-cost.ts`
(nuevo), `lib/modules/pedidos/index.ts`, `tests/unit/pedidos/quote-order-cost.test.ts` (nuevo),
`tests/unit/pedidos/order-input.test.ts`.

- `quoteOrderCostSchema = createOrderSchema.pick({ recipeId: true, quantity: true })` y su tipo.
- `createQuoteOrderCost({ recipes, products, units })` según `design.md > 2`, con
  `return async function quoteOrderCost(...)`.
- Exportes nuevos en el barrel del módulo.

**Hecho cuando:** `quote-order-cost.test.ts` verde con dobles de los tres catálogos:
- `R1`: con los mismos dobles, el resultado es idéntico al `ingredientsCost` que recibe
  `orders.create` en `createCreateOrder` y `orders.updateAlive` en `createUpdateOrder` para la misma
  receta y cantidad (dos casos: con importe `'40.0000'` y con `null`);
- `R2`: los dobles solo registran llamadas a `findExecutionContentById`, `findCostingBatches` y
  `findRefs`; `QuoteOrderCostDeps` no tiene `orders` (aserción de tipo con `@ts-expect-error`);
- `R3`: actor `null`, sin permisos y solo con `pedidos.consultar` -> `UnauthorizedError`, cero
  llamadas a los dobles, también con entrada inválida;
- `R5`: `quantity` `'0'`, `'-1'`, `'abc'`, `'12345678901'`, `'1.12345'` y `recipeId` no UUID ->
  `ValidationError`, cero llamadas;
- `R6`: `findExecutionContentById` devuelve `null` -> `{ ingredientsCost: null }` y
  `findCostingBatches`/`findRefs` se llaman solo con `companyId` del actor;
- `R7`: una entrada con `companyId` de otra empresa no cambia el `companyId` con que se llama a los
  tres catálogos.

`order-input.test.ts` gana un caso: `quoteOrderCostSchema` acepta y rechaza exactamente lo mismo que
`createOrderSchema` en `recipeId` y `quantity`. `./init.sh --rapido` verde.

## [x] T2 — Cableado y autorización `[depende de T1]`

Archivos: `lib/composition/index.ts`, `tests/unit/pedidos/authorization.test.ts`.

- `pedidos.quoteOrderCost` según `design.md > 4`.
- En `authorization.test.ts`, fila nueva en `SEIS` (`quoteOrderCost`, `MODIFICAR`) y en
  `SEIS_ARCHIVOS` (`quote-order-cost.ts`, `MODIFICAR`); el caso «la tabla cubre…» espera los siete.

**Hecho cuando:** `authorization.test.ts` verde con la fila nueva (`R3`: concede con
`pedidos.modificar`, rechaza con `pedidos.consultar` y sin nada, `requirePermission` antes de
`safeParse` y de `deps.recipes`) y sus casos «exactamente esos dos códigos» y «ningún código distinto»
siguen verdes sin tocarlos (`R4`); `guard-arquitectura-modulos`, `guard-autorizacion-por-permiso` y
`guard-permisos-sembrados` verdes (`R4`).

## [x] T3 — Server Action `[depende de T2]`

Archivos: `lib/modules/pedidos/adapters/driving/order-actions.ts`,
`tests/unit/pedidos/order-actions.test.ts`, `tests/unit/pedidos-ui/pedidos-convenciones.test.ts`.

- `quoteOrderCostAction(input: unknown)` y `OrderCostQuoteResult` según `design.md > 3`.
- `ACCIONES` de `pedidos-convenciones.test.ts` gana `quoteOrderCostAction`.

**Hecho cuando:** `order-actions.test.ts` verde con casos nuevos: éxito devuelve
`{ status: 'success', data: { ingredientsCost } }`; sin sesión -> `code: 'unauthorized'` (`R3`);
entrada inválida -> `invalid_input` (`R5`); error ajeno -> `unexpected` sin detalle; la empresa del
actor sale de `getSessionContext` aunque la entrada traiga otra (`R7`).
`session-once-per-request-actions.test.ts`, `module-contract.test.ts` y `pedidos-convenciones.test.ts`
verdes sin más cambios que la línea de `ACCIONES`.

## [x] T4 — Formateador del importe `[P con T1-T3]`

Archivos: `app/(private)/pedidos/components/order-amount.ts` (nuevo),
`app/(private)/pedidos/components/index.ts`, `tests/unit/pedidos-ui/order-amount.test.ts` (nuevo).

- `formatOrderAmount`, `orderAmountTitle`, `ORDER_AMOUNT_SYMBOL` según `design.md > 5.1`.

**Hecho cuando:** `order-amount.test.ts` verde con:
- `R18`: `'40.0000'` -> `'$ 40.00'`; `'0.0000'` -> `'$ 0.00'`; `'0.0050'` -> `'$ 0.01'`;
  `'999.9950'` -> `'$ 1,000.00'`; `'1234567.5000'` -> `'$ 1,234,567.50'`;
  `'9999999999.9999'` -> `'$ 10,000,000,000.00'`; `'12752.5512'` -> `'$ 12,752.55'`;
  y la fuente de `order-amount.ts`, sin comentarios, no contiene `Intl`, `toLocaleString`,
  `parseFloat`, `toFixed` ni `Number(`;
- `R19`: `orderAmountTitle('12752.5512') === '12752.5512'`; `orderAmountTitle('40.0000') === undefined`;
  `orderAmountTitle('1234567.5000') === undefined`.

`pedidos-convenciones.test.ts` (`conversionesDeImporte`) y `guard-pantalla-pedidos-se-amplia.test.ts`
verdes.

## [ ] T5 — Estado y bloque de la cotización `[P con T1-T4]` (necesita la firma de T3; con un doble basta)

Archivos: `app/(private)/pedidos/components/use-order-cost-quote.ts` (nuevo),
`app/(private)/pedidos/components/order-cost-quote.tsx` (nuevo),
`app/(private)/pedidos/components/index.ts`,
`tests/unit/pedidos-ui/order-cost-quote.test.tsx` (nuevo).

- Hook y componente según `design.md > 5.2` y `> 5.3`. Guion: `MISSING_VALUE_MARK` de `order-columns`.

**Hecho cuando:** `order-cost-quote.test.tsx` verde, con `vi.useFakeTimers()` y el módulo de
`order-actions` doblado con respuestas que se resuelven a mano:
- `R9`: `onQuantityChange(null, '5')`, `onQuantityChange(id, '')`, `(id, '0')`, `(id, 'abc')` y
  `onRecipeChange(null, '5')` -> guion y cero llamadas, también tras avanzar 1 s;
- `R10`: respuesta `{ ingredientsCost: null }` -> guion, y el texto no contiene `0`;
- `R11`: montado con `'12752.5512'` -> `$ 12,752.55` y cero llamadas tras avanzar 1 s;
- `R13`: tres `onQuantityChange` a 100 ms entre sí -> ninguna llamada a los 499 ms de la última, una
  sola a los 500 ms, con la última cantidad;
- `R14`: `onRecipeChange(id, '5')` -> una llamada sin avanzar el reloj;
- `R15`: dos peticiones; se resuelve primero la segunda (`'20.0000'`) y después la primera
  (`'10.0000'`) -> queda `$ 20.00`; y una petición en vuelo seguida de `onQuantityChange(id, '')` ->
  al resolverse, sigue el guion;
- `R16`: con cifra visible y petición en vuelo -> la misma cifra con `data-state="quoting"` y el
  testid de «cotizando…» presente;
- `R17`: sin cifra visible (alta, o tras un guion) y petición en vuelo -> solo «cotizando…», ni guion
  ni `$`;
- `R19`: el elemento de la cifra lleva `title` cuando difiere y no lo lleva cuando no;
- `R21`: respuesta `{ status: 'error', code: 'unauthorized', message }` -> el testid
  `order-cost-quote-error` contiene ese `message`, y el bloque NO contiene el guion ni `$` (también
  partiendo de una cifra visible); con `code: 'unexpected'` se pinta `UnexpectedErrorNotice` con su
  identificador; una cotización posterior que responde bien quita el mensaje; y con el error visible,
  la siguiente petición en vuelo muestra solo «cotizando…» (`R17`).

## [ ] T6 — El bloque en el formulario `[depende de T3, T4, T5]`

Archivos: `app/(private)/pedidos/components/order-form.tsx`,
`tests/unit/pedidos-ui/order-form-quote.test.tsx` (nuevo), y el doble de `order-actions` en
`tests/unit/pedidos-ui/{order-form,order-sheet,pedidos-viewport}.test.tsx` (una línea cada uno, solo si
esos archivos se ponen rojos por la export que falta; `design.md > 10`).

- Cambios según `design.md > 5.4`.

**Hecho cuando:** `order-form-quote.test.tsx` verde:
- `R8`: el bloque (`order-cost-quote`) está en el alta y en la edición; y el caso existente de
  `order-columns.test.tsx` «la tabla de pedidos no pinta el importe» sigue verde sin tocarlo;
- `R9`: alta recién abierta -> guion, sin llamada;
- `R11`: edición de un pedido con `ingredientsCost: '40.0000'` -> `$ 40.00` sin llamada; con `null`
  -> guion sin llamada;
- `R12`: en la edición, teclear otra cantidad -> tras 500 ms una llamada con la receta del pedido, y
  el bloque pasa a la respuesta; elegir otra receta -> llamada inmediata;
- `R13`/`R14` de punta a punta: elegir receta con cantidad escrita -> una llamada; teclear `1`, `12`,
  `125` -> una sola llamada más, con `'125'`;
- `R20`: el `FormData` que recibe `createOrderAction`/`updateOrderAction` tiene exactamente las claves
  de `ORDER_BUSINESS_FIELDS` (más `status` en la edición), ninguna de importe; y Guardar está
  habilitado con una cotización en vuelo y con el guion;
- `R21`: con la acción de cotizar devolviendo error, el mensaje del error aparece bajo el bloque (sin
  guion), Guardar sigue habilitado y guardar invoca `createOrderAction`.

`order-form.test.tsx`, `order-sheet.test.tsx`, `pedidos-viewport.test.tsx`, `read-only.test.tsx`,
`order-row-wiring.test.tsx`, `order-sheet-responsibles.test.tsx` y
`guard-pantalla-pedidos-se-amplia.test.ts` verdes. `./init.sh --rapido` verde.

## [ ] T7 — Integración contra Postgres `[depende de T2]` `[P con T4-T6]`

Archivos: `tests/integration/pedidos/order-cost-quote.int.test.ts` (nuevo).

- Sobre el patrón de `tests/integration/pedidos/order-ingredients-cost.int.test.ts`: dos empresas,
  receta al 10 % con un producto en litros y un lote con coste.

**Hecho cuando:** verde con:
- `R1`: `pedidos.quoteOrderCost` para 200 da `'40.0000'` y el `ingredients_cost` que guarda
  `pedidos.createOrder` con la misma entrada es `40.0000`; con cantidad sin existencia suficiente, los
  dos `null`;
- `R2`: el número de filas de `orders`, `product_batches` e `inventory_movements` y el `stock` de los
  lotes son iguales antes y después de cotizar;
- `R6`: cotizar la receta de la empresa B con un actor de la empresa A -> `null`, igual que una
  receta sin líneas de A.

## [ ] T8 — E2E `[depende de T6]`

Archivos: `e2e/pedidos-cotizacion.spec.ts` (nuevo).

- Patrón de `e2e/recetas-porcentaje.spec.ts`: prefijo `qc151_e2e_` + `RUN_ID`, empresa efímera,
  administrador con hash real, `loginAndLand` (`guard-e2e-landing.test.ts`), rutas de
  `lib/shared/routes`, sembrado con Prisma (producto en `litro` con `unit_id`, presentación, un lote
  de existencia `1000` y coste `25.5000`, receta con una línea al 10 %), limpieza en `afterAll` por
  `companyId` en el orden de las FK y limpieza defensiva por prefijo y edad. Chromium y WebKit.
- Recorrido: (a) abrir el alta, elegir la receta, teclear `5000` -> `order-cost-quote-value` muestra
  `$ 12,750.00`; (b) teclear `5001` -> `$ 12,752.55`; (c) teclear `20000` (2000 L > 1000 L de
  existencia) -> guion; (d) volver a `5001`, elegir presentación, guardar; en Prisma,
  `ingredients_cost = 12752.5500`; reabrir la edición del pedido desde su fila -> `$ 12,752.55` sin
  teclear nada.

**Hecho cuando:** `pnpm run e2e -- e2e/pedidos-cotizacion.spec.ts` verde en los dos navegadores contra
la app local y el Postgres local con `db:seed`, sin red externa (`R22`); la salida va a
`progress/impl_QC-151-cotizacion-del-coste-en-el-pedido.md`. `./init.sh` completo verde.

## Trazabilidad prevista `R<n> -> test`

| Req | Test |
|---|---|
| R1 | `tests/unit/pedidos/quote-order-cost.test.ts` (paridad con alta y edición), `tests/integration/pedidos/order-cost-quote.int.test.ts` |
| R2 | `quote-order-cost.test.ts` (solo lecturas; sin `orders` en el tipo), `order-cost-quote.int.test.ts` (conteos) |
| R3 | `quote-order-cost.test.ts`, `tests/unit/pedidos/authorization.test.ts`, `tests/unit/pedidos/order-actions.test.ts` |
| R4 | `authorization.test.ts` («exactamente esos dos códigos», «ningún código distinto»), `tests/guards/guard-permisos-sembrados.test.ts` |
| R5 | `quote-order-cost.test.ts`, `order-actions.test.ts`, `tests/unit/pedidos/order-input.test.ts` |
| R6 | `quote-order-cost.test.ts`, `order-cost-quote.int.test.ts` |
| R7 | `quote-order-cost.test.ts`, `order-actions.test.ts` |
| R8 | `tests/unit/pedidos-ui/order-form-quote.test.tsx`, `tests/unit/pedidos-ui/order-columns.test.tsx` (caso existente, sin tocar) |
| R9 | `tests/unit/pedidos-ui/order-cost-quote.test.tsx`, `order-form-quote.test.tsx` |
| R10 | `order-cost-quote.test.tsx` |
| R11 | `order-cost-quote.test.tsx`, `order-form-quote.test.tsx`, `e2e/pedidos-cotizacion.spec.ts` (d) |
| R12 | `order-form-quote.test.tsx` |
| R13 | `order-cost-quote.test.tsx`, `order-form-quote.test.tsx` |
| R14 | `order-cost-quote.test.tsx`, `order-form-quote.test.tsx` |
| R15 | `order-cost-quote.test.tsx` |
| R16 | `order-cost-quote.test.tsx` |
| R17 | `order-cost-quote.test.tsx` |
| R18 | `tests/unit/pedidos-ui/order-amount.test.ts`, `e2e/pedidos-cotizacion.spec.ts` (a, b) |
| R19 | `order-amount.test.ts`, `order-cost-quote.test.tsx` |
| R20 | `order-form-quote.test.tsx` |
| R21 | `order-cost-quote.test.tsx`, `order-form-quote.test.tsx` (mensaje del error, nunca guion; cerrada en F1.4) |
| R22 | `e2e/pedidos-cotizacion.spec.ts` |
