# QC-195 — envases-del-pedido-como-productos · review

> Reviewer, F2.2 vuelta 1 (completa). Rama `feature/QC-195-envases-del-pedido-como-productos`,
> punta `baca3d51`, diff `origin/dev...HEAD` (merge-base `a39b9065`). Grafo no usado: revisión
> por Grep/Read sobre el diff (186 archivos).

## Verificación ejecutada por el reviewer

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | 0 errores |
| `pnpm run lint` | `0 errors, 8 warnings` (ninguno en archivos de la ficha) |
| `vitest run tests/guards` | `44 passed`, `608 passed / 5 skipped` |
| `vitest run` de unit de pedidos, inventario, recetas (qc195), documentos, asignaciones, asignaciones-ui, pedidos-ui, inventario-ui (envase), shared (label) | `300 passed / 1 failed`: el rojo es `inventario/product-page.test.tsx`, que está en `tests/baseline-rojos.json` |
| `vitest run` de los `.int` qc195-* (inventario y pedidos), `finish-with-finished-goods`, `inventario/reservation` | `7 files / 87 tests passed` |

No se corrieron `./init.sh` completo ni E2E (los corre el leader).

## Checklist

### Especificación
- [x] `requirements.md` con R1-R44 en EARS.
- [x] `design.md` con alternativas descartadas (§9) y Enmienda 1 (§1.6).
- [x] `tasks.md`: T0-T17 y T10.E1 marcadas `[x]`.

### Trazabilidad
- [x] Mapa `R1..R44 -> test` en la bitácora (T17). Comprobado por muestreo sobre los nombres de los casos: hay casos para todos los R.
- [~] R27/R29 solo cubiertos para alta, edición completa y cotización; la vía «Reparto y unidad» no guarda el importe y ningún test lo comprueba (B1).
- [~] R30, segunda mitad («no incluir un lote sin costo unitario»): ningún test lo ejercita (m1).

### Calidad de código
- [x] typecheck, lint y guardias en verde (arriba).
- [x] Flujo crítico (movimientos de inventario, importes) con E2E nuevo (`e2e/envases-del-pedido.spec.ts`) más los adaptados; los resultados los da la bitácora.
- [x] Multiplataforma: inputs con `text-base`, targets `min-h-11 min-w-11`, sin `100vh` ni `:hover` como única vía, `Autocomplete` ya usado en el repo. Ver m4.
- [x] Sin dependencias nuevas: `package.json` y el lockfile no están en el diff.

### Datos y seguridad
- [x] Sin tablas nuevas. La columna nueva `order_presentation_lines.packaging_product_id` lleva una FK compuesta `(company_id, packaging_product_id)`; el rechazo cruzado está probado (`qc195-packaging-constraints` «R11 — … envase de otra empresa … FK compuesta»; `qc170-distribution-company-scope` «A no puede repartir su pedido en un envase de B»).
- [x] Consultas nuevas con `productCompanyScope`/`batchCompanyScope`/`presentationCompanyScope` (`packaging-catalog-prisma.ts`, `product-prisma.ts`). Las guardias de ámbito pasan.
- [x] Permisos en el service: `listProducts` exige `inventario.consultar` (R38, unit); el reparto exige `pedidos.modificar`.
- [x] Migración con `down.sql`; rollback probado en base efímera (bitácora F2.3).
- [x] Sin secretos ni hardcode de entorno.

### Módulos hexagonales
- [x] `pedidos` lee envases solo por el puerto público `PackagingCatalog`; `inventario` obtiene la unidad de envases por `PackageUnitSource` (contrato de `unidades`), cableado en `lib/composition`.
- [x] Ninguna Server Action reexportada desde un barrel; `packaging-select.tsx` importa la acción por la ruta del adaptador, igual que el resto de `app/(private)/inventario`.

### Comentarios (`docs/conventions.md > Comentarios`)
- [x] En las líneas añadidas de `lib/ app/ components/ db/` ningún comentario cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». Las citas de `guard-ambito-empresa-pedidos.test.ts` están en tests: no aplica.

### Verificación final
- [ ] `progress/review_*.md` con OK: no (RECHAZADO).
- [ ] `progress/history.md`, desmontar el worktree: pendientes de cierre.

## Hallazgos

### B1 — BLOQUEANTE. «Reparto y unidad» cambia los envases pero no recalcula el importe guardado (R27, R29, R19; design §4.1)

`lib/modules/pedidos/domain/update-order-presentation-lines.ts` sincroniza la reserva de los envases,
pero solo toca `ingredients_cost` para ponerlo a `null` cuando el pedido queda `BLOQUEADO`. No llama a
`resolveOrderCost` en ningún momento, y sus dependencias (test
«las dependencias declaradas son solo packaging, presentations, units, unitOfWork y now») no
incluyen `recipes`/`products` para hacerlo. Antes de esta ficha no pasaba nada, porque el importe no
dependía del reparto. Desde N4 el importe incluye los envases, y la edición acotada deja tres estados
incorrectos:

1. Un pedido `PENDIENTE`, `EN_CURSO` o `POR_EMPACAR` al que se le añaden, quitan o cambian envases por
   el diálogo conserva el importe viejo. La cotización del formulario de edición, con el mismo reparto,
   da otra cifra, y eso incumple R29 («mismo reparto … el mismo valor»). R27 cubre «el importe que
   guarda … al editar», y `design.md > 4.1` mete «Reparto y unidad» en el mismo flujo de guardado con
   el paso 4: «Importe calculado fuera de la transacción como hoy, y a `null` si queda `BLOQUEADO`».
2. Un `BLOQUEADO` que el diálogo desbloquea pasa a `PENDIENTE` con todo apartado pero **sin importe**.
   La edición completa, en el mismo caso, guarda el importe (`update-order.ts`, rama
   `BLOQUEADO -> PENDIENTE`), y R19 pide «igual que hoy hace la edición completa».
3. Consecuencia en inventario: Terminar usa el importe guardado si no es `null`
   (`order-packing.ts`, `lotCost`). Con el importe viejo, el lote de producto terminado se costea sin
   los envases añadidos en el diálogo, o con los que se quitaron.

**Qué falta.** `updateOrderPresentationLines` tiene que calcular el importe con
`resolveOrderCost(…, packagingLinesOf(writeLines), …, { orderId })` y escribirlo cuando el pedido no
queda `BLOQUEADO`, en particular al pasar de `BLOQUEADO` a `PENDIENTE`. Puede calcularlo fuera de la
transacción, como la edición completa, o dentro. Hacen falta además un test unit (escribe el importe
nuevo; `BLOQUEADO -> PENDIENTE` lo escribe) y un `.int` del tipo «R27, R29 por Reparto y unidad»: tras
añadir 40 botellas, el importe guardado es igual a `quoteOrderCost` con ese reparto y `orderId`. Para
`POR_EMPACAR`, la receta ya se consumió y los ingredientes no tienen disponible que costear: hay que
decidir si se conserva la parte de ingredientes y se recalcula solo la de envases, o si se acepta que
el importe pase a `null`. Si el implementer no lo puede resolver con lo escrito, es pregunta para el
humano, no supuesto.

### m1 — menor. R30, segunda mitad, sin test
«NO DEBE incluir en el promedio un lote sin costo unitario». El adaptador lo filtra
(`unitCost: { not: null }` en `findBatchesOf`), pero ningún caso siembra un lote de envase sin costo.
Hace falta un caso en `qc195-packaging-catalog.int.test.ts` o en `order-cost.test.ts`.

### m2 — menor. `design.md` desfasado con lo construido
§1.6/§5 dicen que `packagingName` lo rellena «el adaptador de `pedidos` que ya lee las líneas». Se
resuelve en el dominio (`list-order-summaries.ts` + puerto `order-summary-reader.ts`). Es lo correcto,
porque el adaptador de `pedidos` no puede leer `products` (`guard-arquitectura-modulos`). §8 tampoco
lista `module-contract.test.ts` ni `e2e/versiones-de-receta.spec.ts`. Hay que anotar las tres cosas en
el design.

### m3 — menor. `consumeForOrder` con `productIds`: el respaldo es de todo o nada por pedido, no por producto
El respaldo solo se usa si, dentro del subconjunto, **ningún** producto tiene nada apartado. En un
estado mixto (envase A con algo apartado y envase B sin nada), B no se consume y no se avisa. Hoy no
se alcanza (ver la pregunta 5 abajo), pero esa semántica debería quedar escrita en el comentario de
`reservation.ts`.

### m4 — menor (preexistente, no regresión). Ajuste de un lote de envase en iOS
`adjust-batch-dialog.tsx` pasa a `inputMode="numeric"` para el envase. El teclado numérico de iOS no
tiene signo menos y el ajuste es un `delta` con signo. Antes se usaba `decimal`, que en iOS tampoco lo
tiene, así que no lo empeora. Queda anotado para una ficha aparte.

## Veredicto sobre los puntos señalados por el implementer

1. **`module-contract.test.ts` reescrito.** Aceptable. §3.4/§11.2 del design añaden los cuatro campos
   a `ProductView`, así que el test viejo («`ProductView` sin presentación») quedaba superado. El
   nuevo es más estricto: exige exactamente esos cuatro, en compilación y en test. Que §8 no lo
   listara es un hueco del design (m2), no del código.
2. **`PackageUnitSource` y `PACKAGE_UNIT_NAME` en `unidades`.** Aceptable y correcto: `inventario`
   no puede consultar `units` (frontera de módulos). El puerto es del contrato de `unidades` y se
   cablea en composición. `findPackageUnitId` filtra por `companyId: null` y `baseUnitId: null`.
3. **`packagingName` resuelto en el dominio.** Aceptable, y necesario por la frontera de módulos. Las
   dos entradas nuevas de `guard-ambito-empresa-pedidos` fijan la firma exacta del cableado. Los
   lectores Prisma (`listAliveOrderSummaries*`) siguen filtrando por `orderCompanyScope`, y la
   consulta de envases va por `PackagingCatalog` con `companyId`. Solo falta anotarlo en el design
   (m2).
4. **Fix `a9714d4d`.** Correcto y con test que falla sin él (`order-form.test.tsx`, «R17: dos envases
   de presentaciones distintas…»). El duplicado envase/presentación lo siguen viendo `addLine` en el
   cliente y `resolveDistributionLines` en el servidor (R12, con unit).
5. **Estado mixto en `consumeForOrder`.** **No se alcanza** desde la aplicación y **no bloquea**.
   `syncForOrder` aparta todo o nada, así que todos los envases del reparto están apartados o
   ninguno. El único caso que puede romperlo es R43: un envase que también es ingrediente, y eso solo
   se produce sembrando la base, como dice la nota de R43. Aun así, al pasar a `POR_EMPACAR` se
   consume **todo** lo apartado de ese envase (como ingrediente y como envase), así que en Terminar
   queda A sin nada y B apartado: es el camino con reserva y es correcto. El mixto A apartado + B sin
   nada exigiría una reserva parcial que ninguna ruta escribe. Se deja como m3.
6. **Migración `20261003130000_*` y `down.sql`.** Correctos tras el merge. `recipe_tools` apunta a
   `products(id)`, no a `products_company_id_id_key`, y no toca el CHECK, `order_presentation_lines`
   ni `units`. El `down.sql` deshace en orden inverso y repone el CHECK literal de
   `20260924190100:27-30` (cotejado). Aborta a propósito si existe un envase con presentación (§2.4).
   La unidad solo se borra si nada la usa (`foreign_key_violation` da `NOTICE`). La bitácora prueba el
   rollback en base efímera: de 65 a 64 y de vuelta a 65 migraciones, con `recipe_tools` intacta.
7. **R39-R42 frente a QC-194.** Sin interacción que abra hueco. `assertToolsValid`
   (`recetas/domain/recipe-tools.ts:26`) exige `MACHINE`, así que un envase no entra como
   herramienta. Las herramientas no son líneas de receta, así que R42 no aplica. Los cuatro rechazos
   de `isIngredientType` y la regla de versión de R42 siguen en su sitio tras el merge (unit
   `qc195-envase-no-es-ingrediente.test.ts` en verde).
8. **Tres E2E rojas.** Aceptable que vengan de `dev`. El diff por nombres de la rama contra
   `origin/dev` sobre `pedidos-busqueda`, `pedidos-responsables` y `pedidos-terminados` sale vacío:
   la rama no los toca. El menú de 3 puntos llegó con `527a9902`, que ya está en `origin/dev`. No son
   hallazgo de esta ficha. El leader debería abrir una ficha para adaptarlas.

## Otros puntos pedidos

- **Fichas citadas en comentarios:** ninguna en producción (barrido de las líneas añadidas en
  `lib/ app/ components/ db/`).
- **Códigos de error:** ninguno nuevo. `pedidos` gana la clase `ProductNotFoundError` con el código
  existente `product_not_found`, y `guard-catalogo-de-errores` está en verde.
- **Dependencias:** ninguna nueva.
- **Unidad `unidad`/`u`:** sembrada como unidad de sistema base e idempotente, y aborta si ya existe
  derivada. Una empresa con su propia «unidad» o su propio símbolo `u` no choca:
  `units_company_name_unique`/`units_company_symbol_unique` cubren `company_id IS NOT NULL` y
  `units_system_*` cubren `company_id IS NULL`. El `WHERE NOT EXISTS` y `findPackageUnitId` miran solo
  `company_id IS NULL`, así que nunca toman la de la empresa. Ningún test siembra la unidad homónima
  de empresa; queda razonado, no probado (va dentro de m1 como sugerencia, no es requisito).
- **Existencia entera (N3):** se comprueba en el esquema del alta (`isWholeQuantity`), en el
  adaptador del ajuste bajo el bloqueo y en la UI (alta y ajuste). Probado en `.int`
  («R7 — … lo fraccionario se rechaza sin escribir») y en UI.

## Veredicto

**RECHAZADO**, por un bloqueante: B1. «Reparto y unidad» no guarda el importe con los envases nuevos,
lo que incumple R27/R29, la paridad de R19 con la edición completa y `design.md > 4.1`. Los menores
m1-m4 no bloquean; m1 y m2 conviene cerrarlos en la misma vuelta.

## Vuelta 2 (acotada a cd0336dc..91ee1b6f, ampliada a la Enmienda 2)

Ampliación por regla: la corrección enmienda el spec (R45-R47, E5, P6-A, E6 en `design.md > 1.7`) y
toca el esquema (`20261004120000_orders_packaging_cost`).

### Verificación ejecutada

| Comando | Resultado |
|---|---|
| typecheck | 0 errores |
| lint | `0 errors, 8 warnings` (los mismos de la vuelta 1, ajenos) |
| guardias | `44 passed`, `608 passed / 5 skipped` |
| vitest related sobre `lib/ app/ db/` del diff + `tests/unit/pedidos` + `envase-en-inventario` | `304 passed / 5 failed`; los 5 están en `tests/baseline-rojos.json` (unidades-viewport, usuarios-viewport, product-page, pantallas-exigen-permiso, recipe-page) |
| `.int` tocados (qc195-packaging-reservation, pedidos-constraints, order-repository, qc170 x2, finish-with-finished-goods, order-ingredients-cost, review-blocked-orders, order-crud, qc195-packaging-catalog, qc195-packaging-product) | `11 files / 179 tests passed` |

### Estado de los hallazgos de la vuelta 1

- **B1 — CERRADO.**
  - `update-order-presentation-lines.ts` calcula y escribe el importe siempre que el pedido no queda `BLOQUEADO`, también en `BLOQUEADO -> PENDIENTE`. En `PENDIENTE`/`EN_CURSO`/`BLOQUEADO` usa `resolveStoredOrderCost` con `{ orderId }`, el mismo cálculo que `quoteOrderCost`.
  - En `POR_EMPACAR` (R47) conserva la parte de ingredientes guardada (`ingredients_cost - packaging_cost`) y suma los envases recalculados.
  - Cubierto por unit (PENDIENTE/EN_CURSO, «sin importe», `BLOQUEADO -> PENDIENTE`, queda `BLOQUEADO` -> null, y los tres casos de `POR_EMPACAR`) y por `.int` (importe igual a `quoteOrderCost` en PENDIENTE y EN_CURSO, R45 «sin importe», R46, y R47 distinto de la cotización).
- **m1 — CERRADO.** «R30 — un lote de envase sin costo unitario no entra en el promedio…» (`qc195-packaging-catalog`). También «R6 — con una unidad propia de la empresa llamada «unidad» y símbolo «u»…» (`qc195-packaging-product`).
- **m2 — CERRADO.** El design anota la resolución de `packagingName` en el dominio (§5) y añade `module-contract.test.ts` y `e2e/versiones-de-receta.spec.ts` a §8.
- **m3 — CERRADO.** El comentario de `consumeForOrder` en `reservation.ts` dice que el respaldo no se decide producto a producto. Sin citas de ficha.
- **m4 — CERRADO.** `inputMode="text"` solo para el lote de envase, que trae el signo menos en iOS; el resto sigue en `decimal`. Va sin `pattern`, con motivo: la validación nativa taparía el aviso propio de envases enteros. `sanitizeDeltaInput` sigue filtrando a dígitos y signo, y el aviso de enteros queda. Dos tests de UI fijan el atributo y conservan el negativo. El campo mantiene `text-base` y el target de 44 px.

### Enmienda 2: trazabilidad R45-R47

| R | Tests |
|---|---|
| R45 | unit `update-order-presentation-lines.test.ts`: `it.each(PENDIENTE, EN_CURSO)`, «R45: un envase sin lote con costo deja el pedido sin importe», «R45, R17: si queda BLOQUEADO el importe es null…»; `.int` `qc195-packaging-reservation`: `it.each(PENDIENTE, EN_CURSO)`, «R45: si el envase nuevo no tiene lote con costo…» |
| R46 | unit «R46: BLOQUEADO -> PENDIENTE escribe el importe calculado…»; `.int` «R46, R19: un BLOQUEADO que el diálogo desbloquea queda PENDIENTE con el importe de quoteOrderCost» |
| R47 | unit, los tres casos de `POR_EMPACAR` (25 - 5 + 1.2; sin importe guardado; envases sin importe); `.int` «R47: en POR_EMPACAR, el importe es la parte de ingredientes guardada más los envases nuevos, y no el de quoteOrderCost»; esquema y migración: `orders-packaging-cost-migration.test.ts` (6 casos), `pedidos-schema.test.ts`, `pedidos-constraints` (CHECK 23514), `order-repository` (`setIngredientsCost` con las dos columnas) |

El mapa R1-R44 de la vuelta 1 sigue valiendo. R19, R27, R29 y R31 siguen verdes (`.int` de arriba).

### Migración `20261004120000_orders_packaging_cost`

- Columna `DECIMAL(14,4)` anulable y sin default, en `db/schema.prisma` con su comentario. El paréntesis de RLS (`NO FORCE`/`FORCE`) abarca `orders` y `order_presentation_lines`.
- Relleno según E6: primero pone a `NULL` el importe de los pedidos con importe y con alguna línea con envase; después pone `packaging_cost = 0` donde hay importe. Es exacto: antes de esta ficha el importe no incluía envases. No aborta.
- El CHECK `orders_packaging_cost_matches_ingredients_cost` exige que las dos columnas sean `NULL` juntas o tengan valor juntas.
- **`down.sql`.** Quita el CHECK y la columna, y no restaura los totales que el UP dejó a `NULL`. **Es aceptable y no bloquea.**
  - Las líneas con envase nacen en `20261003130000`, de esta misma ficha, así que en una base desplegada desde `dev` el UP no anula nada.
  - Solo pierde datos en bases de desarrollo de esta rama, y esos pedidos se costean igual al Terminar (R31).
  - Pero el comentario del `down.sql` («quitar el desglose no cambia ningún importe») es cierto solo para el DOWN, y ni el `down.sql` ni E6 dicen que el UP es irreversible en esas filas. Hay que declararlo (m6).

### Doble escritura `ingredients_cost`/`packaging_cost`

Todo lo que escribe el importe pasa por `costColumns`/`StoredOrderCost` del adaptador. Revisé estos
puntos:
- `insertAliveOrder`: alta.
- `updateAliveOrder`: edición completa.
- `setAliveOrderIngredientsCost`: lo usan la revisión de bloqueados, el `null` al bloquear en el alta, en la edición y en «Reparto y unidad», y el importe de «Reparto y unidad».

Busqué las escrituras de `ingredients_cost`/`ingredientsCost:` en `lib/`, `e2e/`, `tests/integration`,
`scripts` y `db`: no hay otra. Lo demás son lecturas, y `finishPackingAlive` no escribe el importe.
Ninguna siembra de `e2e/` ni de `.int` escribe `ingredientsCost` a mano. El CHECK garantiza el resto
en la base. **Sin huecos.**

### Decisión del implementer: el importe se calcula DENTRO de la transacción

**Aceptable; no bloquea.**
- Es correcto: los catálogos leen lo confirmado. Con `excludeOrderId` lo apartado por el propio pedido cuenta como disponible igual dentro que fuera. La receta y la cantidad salen de la fila ya bloqueada, así que no hay carrera con otra edición; fuera habría que releerlas y compararlas bajo el candado, como hace `review-blocked-orders`.
- Hay precedente: Terminar (`order-packing.ts`) ya llama a `resolveLotCost` con los lectores globales dentro de `unitOfWork.run`.
- El coste: mientras la transacción retiene su conexión, `resolveStoredOrderCost` pide otras (en paralelo) al pool, el riesgo que el comentario de `transition-order.ts` describe. Queda como m7.
- El design (§1.7) y T18 siguen diciendo **«fuera de la transacción»**: hay que alinearlos con lo construido (m5).

### Hallazgos nuevos

- **m5 — menor.** `design.md > 1.7` («el importe se calcula **fuera** de la transacción») y la viñeta de T18 en `tasks.md` contradicen el código, que lo calcula dentro con motivo. Hay que actualizar el design con la decisión y su porqué.
- **m6 — menor.** Hay que declarar en el comentario de `down.sql` (y en E6) que el DOWN no repone los importes que el UP anuló en pedidos con líneas con envase, y que eso solo puede pasar en bases de desarrollo de esta rama.
- **m7 — menor.** «Reparto y unidad» lee los catálogos de costo (varias conexiones en paralelo) mientras la transacción retiene la suya. Igual que Terminar, que ya lo hace. Si el pool se queda corto bajo carga, es el primer sitio a mirar. Sin acción en esta ficha; anotar en `progress/current.md > Deudas`.

Sin regresiones: los R1-R44 que tocan los archivos del diff siguen verdes.

### Veredicto vuelta 2

**OK.** Cerrados B1, m1, m2, m3 y m4. Los nuevos m5, m6 y m7 son menores y no bloquean: m5 y m6 son
texto (design/`down.sql`) y pueden ir en el cierre; m7 es una deuda que se anota. Quedan para F2.4 el
`./init.sh` completo y las E2E.
