# QC-151 — cotizacion-del-coste-en-el-pedido · review

Reviewer, 2026-09-23. Rama `feature/QC-151-cotizacion-del-coste-en-el-pedido`, diff contra
`df8af4ec` (base de la rama), HEAD `683972f2`.

## Veredicto: RECHAZADO

1 bloqueante (comentarios de producción que citan ficha o requisito, en 3 sitios), 5 menores.
El código, los tests y la trazabilidad están bien. Lo único que falta es quitar tres citas de los
comentarios: el arreglo es mecánico y no hay que tocar código.

## Verificación ejecutada por el reviewer

- `./init.sh --rapido` en el worktree: **verde** (`== init OK ==`). typecheck y lint pasan.
  `vitest related` sobre los 24 archivos del diff: `186 files, 2871 passed, 4 skipped`,
  integración contra Postgres incluida (base efímera `qct_qc151_*`). Guardias:
  `48 files, 600 passed, 9 skipped`.
- No corrí `./init.sh` completo ni el E2E: los corre el leader (instrucción del encargo). La
  bitácora dice que el E2E pasó en chromium y webkit, pero no lo he reproducido yo.

## Checklist

### Especificación
- [x] `requirements.md` con R1-R22 en EARS, la decisión de F1.4 (R21) cerrada y ninguna pregunta abierta.
- [x] `design.md` con cinco alternativas descartadas (A-E) y el motivo de cada una.
- [x] `tasks.md`: T1-T8, todas `[x]`.

### Trazabilidad (R -> test que muerde)
- [x] R1: `quote-order-cost.test.ts` (el mismo `ingredientsCost` que reciben `orders.create` y
  `orders.updateAlive`, y `null` en el caso sin importe) + `order-cost-quote.int.test.ts`
  (cotización == `orders.ingredients_cost` guardado, con existencia y sin ella).
- [x] R2: el tipo `QuoteOrderCostDeps` no tiene `orders` ni `presentations` (hay un `@ts-expect-error`).
  El int test compara una foto de lotes y movimientos y el número de pedidos antes y después.
  Composición: solo recibe `recipeCatalog`, `productCatalog` y `unitCatalog`.
- [x] R3: `quote-order-cost.test.ts`: null, undefined, sin permisos y con solo `consultar` rechazan
  antes de validar y sin llamar a ningún doble. `authorization.test.ts` añade la fila a la tabla y a
  la comprobación de orden en la fuente (`requirePermission` va antes de `safeParse` y de `deps.recipes`).
  `order-actions.test.ts` cubre la sesión incompleta (QC-60 R17) y el actor null.
- [x] R4: `authorization.test.ts`. El barrido de todo el módulo encuentra solo los dos códigos.
- [x] R5: `quote-order-cost.test.ts` (6 entradas inválidas, cero lecturas), `order-input.test.ts`
  (el esquema acepta exactamente lo mismo que el alta) y `order-actions.test.ts`.
- [x] R6: el int test cotiza la receta de Q con el actor de A y da `null`. El control con el actor
  de Q da `6000.0000`, así que ese `null` sale del filtro por empresa y no de un fixture roto. El
  unit test comprueba que todos los catálogos se llaman con el `companyId` del actor.
- [x] R7: `quote-order-cost.test.ts` (un `companyId` ajeno en la entrada no cambia el de los
  catálogos), `order-actions.test.ts` (el actor sale de la sesión) y `order-input.test.ts`
  (el esquema descarta las claves que sobran).
- [x] R8: `order-form-quote.test.tsx` (el bloque está en el alta y en la edición). Para el listado,
  el caso que ya existía en `order-columns.test.tsx:369` («la tabla de pedidos no pinta el importe»).
- [x] R9, R10, R11, R13-R17, R19 y R21: `order-cost-quote.test.tsx` (hook y bloque juntos, con
  temporizadores falsos: 499 ms no dispara la cotización y 500 ms sí). R9, R11-R14, R20 y R21, ya
  cableados con el formulario real: `order-form-quote.test.tsx`.
- [x] R18: `order-amount.test.ts`. Comprueba la tabla de casos, incluidos `0.0050 -> $ 0.01`,
  `999.9950 -> $ 1,000.00` y `12752.5512 -> $ 12,752.55`. También lee la fuente y confirma que no
  usa `Intl`, `toLocaleString`, `parseFloat`, `toFixed` ni `Number(`. El E2E lo cubre en (a) y (b).
- [x] R20: el FormData del alta y el de la edición llevan exactamente los campos de negocio, y
  Guardar sigue habilitado con una cotización en vuelo y con el guion.
- [x] R21: mensaje del catálogo, sin guion ni cifra; con `unexpected`, `UnexpectedErrorNotice` y su
  referencia. Un acierto posterior limpia el mensaje, y Guardar sigue invocando la operación.
- [x] R22: `e2e/pedidos-cotizacion.spec.ts`. Recorre (a)-(d) en chromium y webkit
  (`playwright.config.ts`), comprueba `orders.ingredients_cost` en la base (`12752.5500`) y la
  misma cifra al reabrir la edición. Solo usa Prisma local y la app; ninguna llamada externa.
- [x] `progress/impl_*.md` contiene el mapa `R<n> -> test`.

### Calidad y seguridad
- [x] Sin tablas, migraciones ni RLS nuevas (no aplican). Sin secretos ni configuración hardcodeada.
- [x] El permiso `pedidos.modificar` se valida en el service (`quote-order-cost.ts`, primera línea)
  y tiene su test. La action no repite ni la autorización ni la validación.
- [x] Aislamiento por empresa: la consulta lee con `actor.companyId` (lo prueban el unit test y el
  int test), y el int test demuestra que el acceso cruzado no filtra datos.
- [x] Hexagonal: la lógica está en `domain/`. Los catálogos de otros módulos se importan por su
  contrato. La action pide el caso de uso a `lib/composition` y el barrel no reexporta ninguna
  Server Action.
- [x] `lib/shared/ui/decimal-display.ts` no tiene diff. El redondeo es el de siempre
  (`formatDecimalDisplay`) y la agrupación se hace con `slice`, sin `Number`, `.replace` ni regex.
- [x] Server Action, no `fetch` ni `route.ts`. Tiene el precedente de `getRecipeAction` en el
  mismo formulario.

### Multiplataforma
- [x] Solo se pinta texto (`text-sm`), sin controles nuevos, sin `:hover` como única vía (el
  `title` se añade a la cifra ya pintada, un límite heredado y aceptado en design §11) y sin `100vh`
  ni alturas fijas. No toca ningún input.

### Dependencias
- [x] `package.json` no cambia.

### Solape con QC-141 (excepción humana aprobada)
- [x] `lib/composition/index.ts`: +6 líneas, un import y una entrada al final del objeto `pedidos`.
- [x] `lib/modules/pedidos/index.ts`: +4 líneas, dos nombres en listas que ya existían y un bloque al final.
- [x] `order-form.tsx`: +14/-1, dos imports, el hook, una llamada en cada rama de `chooseRecipe`, el
  `onValueChange` envuelto (es la única línea que se sustituye) y el `<OrderCostQuote />` bajo la cantidad.
- [x] `order-form.test.tsx`: +3 líneas, el doble de `quoteOrderCostAction`.
Los cuatro cambios son mínimos y aditivos. No reordenan nada ni tocan `create-order.ts`, `update-order.ts`,
`resolve-ingredients-cost.ts` ni `order-cost.ts`.

### Ajustes de tests fuera de design.md §10: juicio
- **`order-sheet.test.tsx` («EXACTAMENTE una region de avisos»): legítimo, no relaja.** Esa
  aserción existe para que no se cuele un segundo `<Toaster />` o una segunda región. El ajuste
  mantiene `region` en exactamente 1 y exige exactamente 1 `[aria-live]` fuera del bloque, así que
  un Toaster nuevo seguiría rompiendo el test. Además añade que dentro del bloque haya exactamente
  1. Si el bloque no existiera, `bloqueDeCoste` sería `null`, el filtro dejaría pasar los dos
  `aria-live` y el test fallaría: no puede dar un falso verde. Es más estricto que subir el conteo a 2.
- **Conteos de `order-actions.test.ts` (catches 6->7, «exporta exactamente las siete») y de
  `authorization.test.ts` (4->5 escrituras): legítimos.** Son la consecuencia mecánica de añadir
  una séptima acción, que además usa `pedidos.modificar`. Las listas siguen siendo exactas
  (`toEqual` con nombres) y no se quita ninguna aserción. El resto de `order-actions.test.ts` añade
  casos: la firma `input: unknown`, la aridad y la sesión incompleta.
- **`guard-identificador-de-request.test.ts` (alta en `E2E_ESPERADOS`): legítimo.** La lista es
  cerrada, darse de alta es su punto de extensión, y la regla no cambia.
- **`tests/integration/aislamiento.json`: legítimo.** Es un alta con motivo y fecha, como exige
  `guard-aislamiento-integracion`.

## Hallazgos

### BLOQUEANTE

1. **Comentarios de producción que citan ficha o requisito en líneas que añade el diff**
   (`docs/conventions.md > Comentarios`: «Nunca se cita una ficha ni un requisito [...] Sin
   excepciones»):
   - `lib/modules/pedidos/adapters/driving/order-actions.ts`, JSDoc de `OrderCostQuoteResult`:
     empieza por `QC-151:`.
   - `lib/modules/pedidos/adapters/driving/order-actions.ts`, JSDoc de `quoteOrderCostAction`:
     `Cotizacion del coste de ingredientes (R1-R7).`
   - `lib/modules/pedidos/domain/order-input.ts`, JSDoc de `quoteOrderCostSchema`:
     `Cotizacion (QC-151): receta y cantidad, ...`
   **Para cumplirlo:** quitar `QC-151:`, `(R1-R7)` y `(QC-151)` de esos tres comentarios. Se puede
   conservar el porqué (por qué no hay estado `idle`, por qué no se usa `FormData`, por qué se usa
   `pick`). Solo se tocan comentarios, así que el cambio no afecta a ningún test.

### menor

1. `use-order-cost-quote.ts`: `quoteOrderCostAction(...).then(...)` no tiene manejo de rechazo. Si
   la promesa de la Server Action se rechaza en el transporte (red caída, un deploy que invalida la
   acción), el bloque se queda en «cotizando…» para siempre y no pinta el mensaje de R21. Lo mismo
   pasa con `loadIngredients` en `order-form.tsx`, que ya tiene ese patrón, así que no es una
   regresión. Recomendable: un `.catch` que pase a `error` con el código `unexpected`.
2. Comentarios de tests que citan fichas o tasks. `docs/conventions.md` aplica a los tests la misma
   regla, salvo `R<n>` en el nombre del caso. Aparecen en: `// QC-151 T1` en `order-input.test.ts`;
   la cabecera de `quote-order-cost.test.ts`, `order-form-quote.test.tsx` y `order-cost-quote.int.test.ts`
   (`QC-151 T<n>`); y el comentario del alta en `guard-identificador-de-request.test.ts` (`QC-151`,
   `QC-71 R21`). Imita el estilo que ya tiene alrededor.
3. Nombres que el cambio deja desfasados: `SEIS`, `SEIS_ARCHIVOS` y el caso «los seis casos de uso
   exigen exactamente esos dos codigos» de `authorization.test.ts`, y el comentario «los seis
   `catch`» de `order-actions.test.ts`, cuando ahora son siete.
4. R12, rama del cambio de receta (`order-form-quote.test.tsx`): solo comprueba la llamada con la
   receta nueva, no que el bloque sustituya el importe guardado por la cotización. La rama de la
   cantidad sí lo comprueba (`$ 20.00`), y a nivel de hook está cubierto, así que no deja R12 sin test.
5. Comentarios que repiten lo que dice el código: `Cotizacion del coste de ingredientes de la
   receta y cantidad elegidas.` en `order-form.tsx` y `Hay una cotizacion en vuelo.` en
   `use-order-cost-quote.ts`.

## Qué falta para OK

Corregir el bloqueante 1, que solo afecta a esos tres comentarios. Después, que el leader corra
`./init.sh` completo antes del PR. Los menores no bloquean.
