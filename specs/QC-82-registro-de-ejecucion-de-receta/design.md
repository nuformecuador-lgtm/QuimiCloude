# QC-82 — registro-de-ejecucion-de-receta · design.md

> Escrito el 2026-09-18 contra la base `4c057594`, **revisado el 2026-09-24** contra `dev` tras el
> merge `9634f6ae` (la rama iba 813 commits por detrás) y **enmendado el 2026-09-26** contra `dev`
> tras el merge `811416cd`, con **QC-168** ya dentro, y **revisado el 2026-10-06** contra `dev` tras
> el merge `abd455b4` (561 commits). Lo que no sale de la acotación no se rellena: los puntos
> ratificados están en `## 12`, y **lo que sigue abierto para F1.4 está en un solo sitio, `## 14.1`
> (P1–P5)**. Los requisitos que dependen de ellos van marcados ⚑.

## Revisión 2026-10-06 — qué cambió y por qué

Mismo método que la del 2026-09-26: cada punto comprobado contra el **código** de `dev`; cuando el
código y otro spec no coinciden, **gana el código** y se dice. **Ninguna decisión `D1`–`D20` se
reabre.** `D20` y, en su permiso, `D7` quedan **enmendadas por decisión ajena** (QC-201), con la misma
figura con la que QC-168 `D8` enmendó `D1`. Lo que el código no contesta va a `## 14.1` como P3–P5.

**Lo que hace falsa a la revisión del 2026-09-26** (sus tres puntos «[nuevo]» y el diseño de `## 4`):

1. **`transitionAliveById` vuelve a devolver el literal `'ok'`.** QC-195 sacó el lote de producto
   terminado del Finalizar y lo llevó a Terminar empaque (`order-catalog.ts:102-106`, firma en
   `:112-119`). El objeto `{ kind: 'ok', finishedGoods }` **existe**, pero ahora lo devuelve
   **`finishPackingAliveById`** (`order-catalog.ts:161-162`; `finish-packing.ts:75` ya lo trata como
   éxito). El predicado único de éxito sigue haciendo falta —con las mismas dos formas—, pero el sitio
   donde muerde es **Terminar empaque**, no el Finalizar. `## 3.2`, `## 4`, T10, T11 y T25 se ajustan.
2. **`OrderTransactionScope` tiene seis miembros, no cuatro**: `orders`, `reservations`, `recipes`,
   `finishedGoods`, **`products`** y **`units`** (`pedidos/ports/order-unit-of-work.ts:15-22`; el
   bloque de la composición en `lib/composition/index.ts:1260-1273`). `orderTransactionScopeOn(tx)`
   devuelve **esos seis**, y el test que contaba cuatro cuenta seis.
3. **El empaque no es un solo camino, son dos, y ninguno admite hoy la transacción de fuera.**
   - **Terminar empaque ya va por `OrderUnitOfWork`**: `createFinishPacking({ packing, unitOfWork:
     orderUnitOfWork, recipes, products, units, presentations, packaging })`
     (`lib/composition/index.ts:1460-1468`, `pedidos/domain/order-packing.ts:176`). Se une a la
     transacción **igual que el Finalizar**: con `joinOrderUnitOfWork(tx)`.
   - **Comenzar empaque abre su propia transacción sobre el cliente global**:
     `startPackingAliveOrder` hace `prisma.$transaction(...)` (`order-prisma.ts:921-929`), cableado en
     `orderPackingRepository` (`lib/composition/index.ts:1436-1438`). **`createOrderPackingRepository`
     no existe en el repo** (búsqueda sin resultados): el `## 4` del 2026-09-26 lo daba por hecho. Hace
     falta crearlo en el adaptador de `pedidos`, y eso es la **P5** de `## 14.1`.
   - Y `OrderPacking` **no es un tipo publicado** por `pedidos`: `ExecutionWriters.packing` pasa a ser
     `Pick<OrderCatalog, 'startPackingAliveById' | 'finishPackingAliveById'>`, que ya existe. T6 deja
     de depender de T25.
4. **Los casos de uso de empaque no comprueban asignación.** `start-packing.ts:3-5` y
   `finish-packing.ts:3-6`: «cualquier actor con `empaque.modificar` puede tomar [terminar] cualquier
   pedido vivo de su empresa». El `## 3.3` del 2026-09-26 decía que «comprobar que el pedido es tuyo se
   conserva» y T25 lo testeaba: **era falso ya entonces** y QC-82 no lo añade (R42).
5. **`already_mine` es solo de Comenzar.** `finishPackingAliveById` no lo tiene
   (`order-catalog.ts:161-171`). La P1 se estrecha a Comenzar.

**Lo que entró después del 2026-09-26 y cambia esta ficha:**

6. **QC-138 — `BLOQUEADO`** (`20261001170000_order_status_blocked`; `order-classification.ts:12-20`,
   siete valores).
   - **No se abre**: `get-assigned-order-execution.ts:54` y `start-assigned-order.ts:76` lanzan
     `OrderBlockedError` (`order_blocked`, ya en `error-catalog.ts:71`). Sin anotación: **R44**.
   - **Admite escrituras de asignación**: `order-state.ts:56-64` lo pone a `null`. Por eso
     `recordStepMove` no puede delegar en `assertOrderAcceptsWrites` para él: lo rechaza
     **explícitamente con `order_blocked`** (R20).
   - **Es cancelable**: `CANCELABLES = ['PENDIENTE','EN_CURSO','BLOQUEADO']` (`cancel-order.ts:33`,
     razón en `:27-31`). `isCancellableStatus` lo pone a `true`, y la cancelación desde la pantalla lo
     hereda por R29 sin decisión nueva. **`## 5` y T3 corregidos**: el spec decía dos cancelables.
   - **No congela**: `order-transitions.ts:46` (`BLOQUEADO ↔ PENDIENTE`); `EN_CURSO` no llega a
     `BLOQUEADO` (`:41`), así que una anotación de paso sobre un `BLOQUEADO` solo llega forjada.
7. **QC-201 — `asignaciones.ejecutar`** (`20261004150000_execution_permission`; `permissions.ts:56-58`,
   `:155`, `:254-255`). Los tres casos de uso de ejecución lo exigen en la primera línea
   (`get-assigned-order-execution.ts:42`, `start-assigned-order.ts:38`,
   `finish-assigned-order.ts:174`) y la página también (`app/(private)/asignacion/[id]/page.tsx:29`).
   El Empacador **no** lo tiene. Consecuencias:
   - **R26**: el prólogo de `## 3.3` ya no es `asignaciones.consultar`. Para `start`/`finish` es
     `asignaciones.ejecutar` (código). Para `cancelAssignedOrder` y `recordStepMove` es la **P3**.
   - **`module-contract`**: `CASOS_DE_USO_QC63` ahora legitima **`asignaciones.ejecutar`**, no
     `asignaciones.consultar` (`tests/unit/asignaciones/module-contract.test.ts:439-455`), y un caso
     fija la lista **exacta** de quién nombra `asignaciones.ejecutar` (`:1047-1054`). Añadir los dos
     archivos nuevos a esa lista los autoriza a `ejecutar`; con la letra de `D7` haría falta una
     entrada **aparte** para `consultar`. T12 se escribe para las dos ramas de P3.
   - **R27 / `D20`**: «incluido el Empacador» deja de ser cierto. Nota fechada en R27.
   - **La E2E** (R39, R40) no cambia: el Operador tiene `asignaciones.ejecutar`.
8. **QC-211 — pasos de envasado** (`20261005120000_recipe_packing_steps`). La pantalla de empaque
   monta `StepReader` (`app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx:243`).
   - El porqué de R5bis («no recorre pasos») ya no vale; la regla sí (nota en R5bis).
   - `StepReader` tiene **siete** props: `finishLabel` y `finishBusy` se suman
     (`components/shared/step-reader/step-reader.tsx:56-68`). Lo consumen **tres** pantallas: ejecución,
     empaque y el formulario de fórmula (`recipe-form.tsx:496`). R37 nombra la de empaque: sin las
     props nuevas empieza en el paso 1 (QC-211 R31).
   - QC-211 dejó fuera «registrar la ejecución (QC-82)»: si el recorrido de envasado se anota es la
     **P4**. La propuesta es que no.
9. **QC-195 — Terminar empaque escribe más**: consume los envases del reparto y da de alta un lote por
   línea, todo en su unidad de trabajo (`order-packing.ts:176-260`). Sus rechazos —`recipe_not_found`,
   `presentation_without_content`, `incompatible_units`, `order_without_unit`,
   `insufficient_material`— salen como **valores**, atrapando excepciones lanzadas **dentro** de `run`
   (`:261-267`). Con la unidad **unida**, lo escrito antes del rechazo seguiría vivo en la transacción
   de fuera: es justo el caso que la regla «todo desenlace que no sea éxito aborta» cubre (`## 4`).
10. **El Finalizar crea filas de responsable antes de transicionar** (auto-asignado de empacadores,
    `finish-assigned-order.ts:68-127`, `:204`) y las **compensa** si la transición falla (`:134-147`,
    `:217`). Fuera de la transacción, a propósito (una vez por Finalizar, fuera del reintento). Con
    QC-82 hay un fallo nuevo —la anotación— que tiene que disparar **la misma** compensación (R24).
11. **Los rechazos del Finalizar son dos**: `insufficient_material` y `recipe_without_lines`
    (`finish-assigned-order.ts:218-220`). Los otros tres que listaba R24 son de Terminar empaque.
    `NoWholePackageError` sigue en `errors.ts:211` pero ya no lo lanza ningún caso de uso de los que
    toca esta ficha.
12. **La última migración** es **`20261006120000_inventory_imports`**: la de esta ficha va después.
13. **Sin cambios** que muevan nada: QC-170 (reparto en varias presentaciones; solo la lectura de la
    vista), QC-194 (herramientas de la receta, una tarjeta más en la pantalla,
    `order-execution-screen.tsx:111-120`), QC-204 (conversión de unidades, dentro de `pedidos`),
    QC-161 (rol Maestro: sin empresa y sin permisos de `asignaciones`, `permissions.ts:227`), QC-172/174
    (versiones: la posición sigue siendo la de los pasos que `findExecutionContentById` devuelve para la
    receta del pedido, `get-assigned-order-execution.ts:69-71`; el riesgo de `D9` es el mismo). El
    Finalizar se confirma ahora con `ConfirmActionDialog` (`order-execution-screen.tsx:140-147`), molde
    útil para el diálogo de cancelar.
14. **Catálogos.** Errores: **ningún código nuevo** (`not_cancellable`, `order_blocked`,
    `order_produced_frozen` ya están). Permisos: **ninguno nuevo**, decida lo que decida la P3.
15. **Cruce vivo (F2.0)**: **QC-202** (`estado-terminado-tras-empaque`, `pending`, depende de QC-201)
    cambiará el destino de Terminar empaque a `TERMINADO` y lo hará no cancelable. No solapa archivos
    de esta ficha salvo los dos casos de uso de empaque; quien llegue segundo ajusta R41.

## Revisión 2026-09-26 — qué cambió y por qué

> _Nota del 2026-10-06: los puntos 8 (los tres «[nuevo]») y 3 de esta revisión quedan **corregidos**
> por la de arriba (puntos 1–5). Se dejan como estaban para no reescribir la historia._

Nada de lo que decidió el humano cambia. Cambia **el número de acciones** y **qué las hace**, porque
QC-168 (`estado-por-empacar`, `done`) partió la entrega en dos y metió **dos estados nuevos** por medio.
Cada punto está comprobado contra el **código** de `dev`, no contra el spec de QC-168 —que es lo que
se le pidió a esta ficha—, y cuando el código y el spec de QC-168 no coinciden, **gana el código** y se
dice en la fila.

1. **El Finalizar deja `POR_EMPACAR`, no `ENTREGADO` (A1).** `finish-assigned-order.ts` ya pide
   `'POR_EMPACAR'` en su `transitionAliveById`, y `order-transitions.ts` lo admite. El `finished_at` ya
   no lo escribe ahí: lo escribe **terminar empaque**. R24, R21 y T11 se ajustan; nada más cambia.
2. **`POR_EMPACAR` y `EN_EMPAQUE` congelan la asignación (A2).** `order-state.ts` grew de 4 a **6**
   claves y las dos nuevas tiran **`OrderProducedFrozenError`** / `order_produced_frozen`, que
   **comparten** ese mismo código con `ENTREGADO`. Ese detalle obliga a corregir R20: el error de un
   pedido cerrado **no** es siempre un código distinto del de un pedido ya producido.
3. **Seis acciones pasan a ocho, y las dos nuevas se anotan (A3).** `start-packing.ts` y
   `finish-packing.ts` (QC-168) pasan a llevar `log` y `transaction`, y anotan **dentro** del mismo
   `run`. El enum son **ocho** valores, el `CHECK` de la posición **tres**, y T1/T2 se mueven.
4. **`already_mine` no anota (A3, y es la P1 de `## 14`).** Los dos casos de uso de empaque ya
   distinguen `already_mine` de `'ok'`, y esa distinción es justo lo que permite **no** anotar: si no
   hubo cambio de estado, no hay hecho que registrar. La decisión es de producto y se pregunta en
   `## 14`; aquí se diseña para que las dos respuestas que|Q1 admita sean un `if` y nada más.
5. **Las dos escrituras de empaque piden `empaque.modificar` (A4).** Ya lo hacen: es la **primera
   línea** de `start-packing.ts` y `finish-packing.ts`, y `empaque.modificar` existe en
   `identity/domain/permissions.ts` y va excluido del Administrador (`ADMIN_EXCLUDED_PERMISSIONS`).
   **QC-82 no añade el permiso ni lo siembra** (R30): reusa lo que QC-168 sembró.
6. **Los dos estados nuevos no son cancelables, y eso es `not_cancellable` (A5).** `CANCELABLES` sigue
   siendo `['PENDIENTE','EN_CURSO']`, así que la rama `not_cancellable` ya los cubre: `## 5` no
   cambia. Pero `isCancellableStatus` pasa a `satisfies Record<OrderStatus, boolean>` sobre **6**
   valores, y eso **sí** obliga a tocar la lista de `## 5`.
7. **La E2E de empaque de QC-168 ya espera `POR_EMPACAR` (A6).** Es una **premisa cumplida**, no
   trabajo: lo único que QC-82 le aporta es el **arreglo de limpieza** de esa E2E y de
   `e2e/producto-terminado.spec.ts`, las dos con `order.deleteMany` después de haber anotado (A2 y A3
   hacen que las dos anoten), y las dos con FK `RESTRICT` hacia `orders`.
8. **Tres cosas que la re-verificación encontró y que no están en A1–A6**, y que aunque no las pidiera
   QC-168 hay que arreglar porque el código de hoy las hace falsas. Van marcadas **[nuevo]** abajo y
   en `## 14`, y ninguna amplía alcance:
   - **[nuevo] `transitionAliveById` puede devolver un objeto, no `'ok'`.** QC-150
     (`producto-terminado`, `done`) cambió el retorno a `{ kind: 'ok', finishedGoods }` cuando escribe
     lote. La regla de `## 4` —«todo desenlace distinto de `'ok'` aborta»— **dejaría de funcionar tal
     cual**: abortaría un éxito. Hay que cambiar el enunciado a «todo desenlace que **no sea** éxito
     aborta», y el éxito son las dos formas.
   - **[nuevo] `OrderTransactionScope` tiene ya **cuatro** miembros, no tres.** `finishedGoods` (QC-150).
     `orderTransactionScopeOn(tx)` tiene que devolver los cuatro y **no** se amplía para accommodate
     el empaque (§`## 4`): el packing entra por otro camino.
   - **[nuevo] El empaque no pasa por `OrderUnitOfWork`.** `OrderCatalog` expone
     `startPackingAliveById` / `finishPackingAliveById`, pero están implementados sobre
     `orderPackingRepository` (`pedidos/ports/order-packing-repository.ts`), no sobre la unidad de
     trabajo. Y `empaque` **no es** una carpeta de `lib/modules/`. De ahí la forma exacta de
     `## 4`: un **tercer** contrato en `ExecutionWriters`, atado a `tx` **dentro** de
     `executionTransaction` y no en `orderUnitOfWork`.

## Revisión 2026-09-24 — qué cambió y por qué

Nada de lo que decidió el humano cambia. Cambia **cómo** se construye, porque el código de `dev`
ya no es el del 2026-09-18. Punto por punto:

1. **`pedidos` abre ya su propia transacción, y la comparte con `inventario`** (QC-141). Existe el
   puerto `OrderUnitOfWork` (`pedidos/ports/order-unit-of-work.ts`), que abre `withOrderTransaction`
   (`order-unit-of-work-prisma.ts`, `maxWait` 10 s, `timeout` 30 s) y cablea `lib/composition`.
   `OrderCatalog.transitionAliveById` **ya no es una función del adaptador**: es
   `createTransitionOrder({ unitOfWork: orderUnitOfWork })`, un caso de uso de dominio que bloquea
   el pedido con `FOR UPDATE`, y hacia `ENTREGADO` consume el material y escribe `finished_at`
   (QC-145) en la misma transacción. **El plan viejo ya no sirve**: añadir `db` a las funciones del
   catálogo y atarlas con `orderCatalogOn(db)` no alcanza a `transitionAliveById`, y llamar a
   `orderUnitOfWork` dentro de otra transacción abriría **una segunda** transacción en otra conexión,
   que no es «la misma operación». Solución nueva en `## 4`: una **unidad de trabajo unida**, que no
   abre nada y reutiliza la transacción de la ejecución, construida con **el mismo** constructor de
   ámbito que la de `pedidos`. Y una regla que la hace segura: **dentro de la transacción de ejecución,
   todo desenlace distinto de `'ok'` aborta la transacción entera**.
2. **Cancelar ya no es una sola sentencia.** `cancel-order.ts` bloquea el pedido, comprueba otra vez
   que sea cancelable **bajo el candado**, escribe `CANCELADO` y el motivo (`cancelAlive`, único
   método que puede), **libera el material apartado** (`releaseForOrder`) y pone `reserved_at` a
   `NULL`, todo en `OrderUnitOfWork`. Consecuencias: (a) **`order-prisma.ts` y
   `order-catalog-prisma.ts` salen del diff**: `cancelAliveOrder` no necesita `from` ni `db`, porque
   la comprobación bajo el candado ya impide cancelar un pedido que otro acaba de entregar. T4
   desaparece. (b) El cuerpo de la cancelación se extrae **una vez** y lo usan `cancelOrder` y la
   cancelación desde la pantalla (`## 5`). (c) Seguir el camino único libera **todo** el material,
   también el que el operario ya pudo gastar. Se preguntó y el humano lo cerró como **`D19`**: se
   libera todo, y lo gastado se da de baja después con un ajuste de inventario (QC-92), fuera de
   esta ficha.
3. **La cancelación no entra en `OrderCatalog`, sino en un contrato propio, `OrderCancellation`.**
   `OrderCatalog` tiene hoy **11 dobles** en tests que se romperían al compilar, y el `orderCatalog`
   global de la composición tendría que cablear un `cancelAliveById` que nadie llama: `asignaciones`
   solo cancela dentro de la transacción de ejecución. Alternativa descartada en `## 10.6`.
4. **Finalizar puede fallar por material** (QC-141): `transitionAliveById` devuelve
   `'insufficient_material'` o `'recipe_without_lines'`, y `finish-assigned-order.ts` ya los traduce a
   `MaterialShortageError` y `RecipeWithoutLinesError`. R24 lo nombra ahora: si la entrega se rechaza,
   no queda ni la anotación ni el consumo.
5. **`StepReader` ya no es el del 2026-09-18.** Tiene `minStepSeconds` (QC-125) y `mode`
   (`'lectura' | 'ejecucion'`, enmienda fuera de SDD del 2026-09-21); la pantalla lo monta con
   `mode="ejecucion"` y 5 s de espera. El test del R18 de QC-63 **ya lo tensó QC-125** a una lista
   cerrada que admite `step-reader.tsx`: esta ficha **no tiene que tensarlo**, solo no tocar otro
   archivo de la carpeta.
6. **La migración colisionaba.** `20260918120000_order_execution_entries` tenía el mismo timestamp que
   `20260918120000_inventory_movement_kind_enum_and_reason_catalog` y quedaba **detrás** de 13
   migraciones ya en `dev`. La última de `dev` hoy es `20260924120000_customers`: la de esta ficha
   lleva un timestamp **posterior**, fijado al crearla y recomprobado antes del PR (`## 2.2`).
7. **Listas cerradas y archivos nuevos que el spec viejo no veía**: `recipe-route-contract.test.ts`
   (exportaciones exactas de `lib/shared/routes.ts`), `empacador-authorization.test.ts` y dos
   integraciones que construyen `start`/`finish` con sus deps, el mock del módulo de acciones del test
   de la pantalla, y las limpiezas de E2E e integración que borran pedidos después de abrir la pantalla
   (la FK `RESTRICT` nueva las haría fallar). Tabla en `## 7`.
8. **El punto 8 viejo de F1.4 (tensar `TOCA_LA_BASE` para ver `db.`) ya no aplica**: ninguna función
   del catálogo gana parámetro. En su lugar, `guard-ambito-empresa-pedidos` gana **un caso** que vigila
   el contrato nuevo y los dos cableados sobre la transacción unida (`## 7`). Es la misma figura que
   el humano ratificó: tensar, nunca aflojar.
9. **El cruce de F2.0 cambia de socios.** QC-68 y QC-92 están `done` y su código está en `dev`: el
   cruce que dejó el F2.0 esperando **ya no existe**. Los socios nuevos son **QC-150**
   (`producto-terminado`, `fullstack`, `in_progress`), que mete un lote de producto terminado en el
   Finalizar, es decir, en `transition-order.ts`, en el ámbito de `OrderUnitOfWork` y quizá en
   `finish-assigned-order.ts`; y **QC-153** (`modelo-de-clientes`, `backend`, `in_progress`), por
   `db/schema.prisma` y las migraciones. Detalle en `## 11`. _[obsoleto el 2026-09-26: los dos están
   `done` y su código ya está en `dev`; el cruce de `## 11` se re-midió ese día.]_
10. **`/asignacion` tiene vistas por permiso** (QC-145). El aviso de cancelado va donde el de
    entrega, **encima** de las pestañas, así que se ve en cualquier vista. Quien tiene
    `pedidos.consultar` ya no puede ser responsable (`user_cannot_be_responsible`): el E2E asigna al
    Operador, que no lo tiene, y comprueba el motivo leyendo la base.
11. **Base propia.** Migración, integración y E2E contra `QuimiCloude_QC82`, nunca contra la del
    `.env`. Y una sola E2E a la vez en la máquina (`tasks.md`, cabecera).
12. **La pantalla** muestra hoy «% · cantidad» por línea (QC-147) y ya no tiene factor de escala. No
    afecta a esta ficha: el registro no guarda nada de las líneas.

## 0. Lo que ya existe y NO se construye aquí

| Pieza | Dónde | Qué aporta a esta ficha |
| --- | --- | --- |
| Pantalla de ejecución | `app/(private)/asignacion/[id]/` (`page.tsx`, `components/order-execution-screen.tsx`) | `page.tsx:29` abre con `requirePagePermission('asignaciones.ejecutar')` (QC-201) y llama a `startAssignedOrderAction(id)`, que transiciona y lee en una sola llamada. Pinta líneas y herramientas (QC-194). Monta `StepReader` con `mode="ejecucion"` y `minStepSeconds={5}` (`:123-129`). Avanzar y retroceder son **solo de cliente**. Finalizar abre `ConfirmActionDialog` y envía un `<form>` con `orderId` oculto (`:132-147`). |
| Asistente de pasos | `components/shared/step-reader/step-reader.tsx` | Props `steps`, `onFinish`, `title`, `minStepSeconds`, `mode`, **`finishLabel`**, **`finishBusy`** (`:56-68`). Lo montan **tres** pantallas: ejecución, **empaque** (QC-211, `packing-order-screen.tsx:243`) y el formulario de fórmula. `index` empieza en `0`; no expone ningún aviso de cambio de paso. **R13, R17 y R18 no se cumplen sin tocarlo** (`## 6.1`). |
| Casos de uso de ejecución | `asignaciones/domain/{get-assigned-order-execution,start-assigned-order,finish-assigned-order}.ts` | Orden fijo: `requirePermission(actor, 'asignaciones.ejecutar')` (QC-201) → `zod` → `listOrderIdsByUserInCompany` (no es tuyo = no existe) → `findAliveById(orderId, actor.companyId)`. `start` tolera `'stale'` releyendo y rechaza **`BLOQUEADO`** con `OrderBlockedError` (`start-assigned-order.ts:53-80`). `finish` lee el número **antes** de escribir, crea las filas de responsable de los empacadores **antes** de transicionar y las compensa si falla (`finish-assigned-order.ts:201-226`), y traduce solo `not_found`, `insufficient_material` y `recipe_without_lines`. Se **reutiliza el patrón**. |
| **Casos de uso de empaque** | `asignaciones/domain/{start-packing,finish-packing}.ts` (QC-168) | **Son los de R41 y R42**: existen, exigen `empaque.modificar` en la primera línea y rechazan sin dependencias. **No comprueban asignación** (`start-packing.ts:3-5`, `finish-packing.ts:3-6`). Comenzar trata `already_mine` como éxito sin escritura (`start-packing.ts:47`); Terminar trata el objeto `{ kind: 'ok', finishedGoods }` como éxito (`finish-packing.ts:75`). **No se crean casos de uso nuevos para el empaque**: se amplían estos dos con `log` y `transaction`. |
| Estados que congelan | `asignaciones/domain/order-state.ts` → `assertOrderAcceptsWrites` | **Siete** claves (`:56-64`): `ENTREGADO` → `order_delivered_frozen`, `CANCELADO` → `order_cancelled_not_assignable`, **`POR_EMPACAR` y `EN_EMPAQUE` → `order_produced_frozen`** (A2), y **`BLOQUEADO` → `null`, o sea, admite** las escrituras de asignación (`:50-55`). Por eso `recordStepMove` rechaza `BLOQUEADO` por su cuenta (R20). |
| Contrato de `pedidos` para otros módulos | `pedidos/domain/order-catalog.ts` (`OrderCatalog`: `findAliveById`, `listAliveSummariesByIds`, `listAliveSummariesInCompany`, `transitionAliveById`, `startPackingAliveById`, `finishPackingAliveById`) | `transitionAliveById` es `createTransitionOrder` sobre `OrderUnitOfWork` y devuelve el **literal** `'ok'` (`:112-119`). **Terminar** es `createFinishPacking` sobre **`OrderUnitOfWork`** y devuelve `{ kind: 'ok', finishedGoods }` (`:156-171`; `lib/composition/index.ts:1460-1468`). **Comenzar** es `createStartPacking` sobre `orderPackingRepository`, cuyo `startPackingAlive` abre **su propia** `prisma.$transaction` sobre el cliente global (`order-prisma.ts:921-929`; composición `:1436-1438`, `:1456`). |
| Unidad de trabajo de `pedidos` | `pedidos/ports/order-unit-of-work.ts` (`OrderUnitOfWork`, `OrderTransactionScope` = `orders` + `reservations` + `recipes` + `finishedGoods` + **`products`** + **`units`**, `:15-22`), `order-unit-of-work-prisma.ts` (`withOrderTransaction`) y su cableado en `lib/composition/index.ts:1260-1273` (`orderUnitOfWork`) | La composición construye el ámbito con **el mismo `tx`** para los **seis**. **Es lo que esta ficha reutiliza** para meter la anotación en la misma transacción (`## 4`) —y `orderTransactionScopeOn` tiene que devolver **exactamente esos seis**, ni uno más. |
| Cancelación | `pedidos/domain/cancel-order.ts` (`CANCELABLES = ['PENDIENTE','EN_CURSO','BLOQUEADO']`, `:33`, **no exportada**) | Dentro de `OrderUnitOfWork`: `lockAliveById` → re-comprobación bajo el candado → `cancelAlive` → `releaseForOrder` (`reason: 'release'`) → `setReservedAt(null)` (`:80-98`). Exige `pedidos.modificar`. `cancelAlive` es el **único** método que escribe `CANCELADO` y el motivo; lo usan `cancelOrder` y la caducidad diaria. **Que `CANCELABLES` no incluya `POR_EMPACAR` ni `EN_EMPAQUE` es lo que da `not_cancellable` (A5); que incluya `BLOQUEADO` (QC-138) lo hace cancelable también desde la pantalla.** |
| Regla del motivo | `pedidos/domain/order-input.ts` → `cancelOrderSchema` (recorte, 1..500), **publicado** en el barril | Se reutiliza aquí (R10). La UI de `pedidos` ya la importa desde cliente. |
| `CHECK` precedente | `orders_cancellation_reason_matches_status`: `("status"::text = 'CANCELADO') = ("cancellation_reason" IS NOT NULL)` | Forma literal del `CHECK` de R8 (`[D4]`). |
| Claves candidatas para FK compuestas | `orders_id_company_id_key` (QC-60), `users_id_company_id_key` (QC-83) | La empresa de la anotación es la del pedido y la de la persona **por construcción** (R7). |
| Repositorio con cliente inyectable | `createOrderAssignmentRepository(db = prisma)`, `createOrderWriteRepository(tx = prisma)` | Molde de la fábrica del registro. |
| Confirmación al volver a la lista | `DELIVERED_ORDER_PARAM` y **`PACKED_ORDER_PARAM`** (`lib/shared/routes.ts`) + `AssignedOrderDeliveredNotice` y `assigned-order-packed-notice.tsx` | Molde de R25 ⚑. La de «empacado» ya la trae QC-168, y su texto ya dice «por empacar»: **no se toca**. |
| Catálogo de errores | `lib/modules/errores/domain/error-catalog.ts` | Ya trae `not_cancellable`, `order_not_found`, `invalid_input`, `unauthorized`, `order_delivered_frozen`, `order_cancelled_not_assignable`, **`order_produced_frozen`** (`:69`), **`order_blocked`** (`:71`), `insufficient_material`, `recipe_without_lines`, `presentation_without_content`, `incompatible_units`, `order_without_unit`, `recipe_not_found`, `order_packing_taken`, `order_not_packable`, `order_without_distribution`. **Ningún código nuevo.** |
| **`empaque.modificar`** | `identity/domain/permissions.ts`; en `ADMIN_EXCLUDED_PERMISSIONS` | Lo que exigen las dos primeras líneas de `start-packing.ts` y `finish-packing.ts`. **Ya sembrado** por QC-168 para el Empacador y excluido del Administrador. QC-82 **no lo crea ni lo cambia** (A4, R30). |
| **`asignaciones.ejecutar`** (QC-201) | `identity/domain/permissions.ts:56-58`, `:155`; seed `:254` (Administrador y Operador); migración `20261004150000_execution_permission` | Lo exigen los tres casos de uso de ejecución y la página. **El Empacador no lo tiene** (`:255`). QC-82 **no lo crea ni lo siembra** (R30); si lo exigen también cancelar y avanzar/retroceder es la P3. |

## 1. La forma de la solución, en una frase

Una tabla nueva **del módulo `asignaciones`** con una fila por gesto, de **ocho** gestos; dos casos de
uso nuevos (`cancelAssignedOrder`, `recordStepMove`) y **cuatro** ampliados (`start`, `finish` y los dos
de empaque de QC-168, `startPacking` y `finishPacking`); un **puerto de transacción** de `asignaciones`
que `lib/composition` cablea para que la anotación y el cambio de `pedidos` (con lo que `pedidos`
escriba en `inventario`) compartan **una sola transacción de base de datos**, sin que ningún módulo
toque las tablas de otro; y una pantalla que monta `StepReader` con dos props opcionales nuevas.

**Lo que la enmienda del 2026-09-26 no cambia de esta frase:** ni la tabla, ni el puerto, ni la
pantalla, ni el patrón de un caso de uso nuevo. Añade **dos** casos de uso ampliados y **una** pieza en
`ExecutionWriters`.

## 2. Modelo de datos

### 2.1 La tabla `order_execution_entries` (modelo `OrderExecutionEntry`, `/// @module asignaciones`)

| Columna | Tipo | Nulo | Por qué |
| --- | --- | --- | --- |
| `id` | `UUID` PK, `gen_random_uuid()` | no | Convención del repo. |
| `company_id` | `UUID` | no | Columna propia de empresa (`[D15]`, R7). Cumple también `guard-empresa-en-esquema`. |
| `order_id` | `UUID` | no | El pedido es obligatorio (`[D14]`, R6). |
| `user_id` | `UUID` | no | Quién (R2). |
| `action` | enum `OrderExecutionAction` | no | `START`, `RESUME`, `ADVANCE`, `GO_BACK`, `CANCEL`, `FINISH`, `PACK_START`, `PACK_FINISH`: **ocho y ninguno más** (`[D1]` enmendada por `[D12]` y por `QC-168 D8`, R1). Los dos últimos los elige QC-82 y **están en la P2 de `## 14`**. |
| `step_position` | `INTEGER` | **sí** ⚑ | La posición, desde 1 (`[D9]`, R4). `NULL` si la receta no tiene pasos (R5 ⚑) **y siempre en las dos de empaque** (R5bis), que el `CHECK` de abajo hace cumplir. |
| `reason` | `TEXT` | sí | El motivo; sin longitud en la columna, igual que `orders.cancellation_reason`: el tope vive en `cancelOrderSchema` (R10). |
| `occurred_at` | `TIMESTAMPTZ(6)` | no, **sin default** | El único instante (`[D10]`, R3). Lo pone el caso de uso con el **mismo `now`** que pasa a `pedidos`, así coincide con el `updated_at` del pedido (y con `finished_at` al finalizar). |

**No hay `created_at`, `updated_at` ni `deleted_at`**: `[D10]` fija una sola columna de tiempo y
`[D13]` prohíbe editar o borrar. La purga física es de **QC-124**.

**Restricciones escritas a mano** (Prisma no modela `CHECK` ni FK compuestas sin `@relation`):

```sql
ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_reason_matches_action"
  CHECK (("action"::text = 'CANCEL') = ("reason" IS NOT NULL));

ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_step_position_positive"
  CHECK ("step_position" IS NULL OR "step_position" >= 1);

ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_packing_has_no_step"
  CHECK ("action"::text NOT IN ('PACK_START','PACK_FINISH') OR "step_position" IS NULL);  -- ⚑ R5bis
-- Enmienda F2.1 (humano, 2026-10-06): implicación, no igualdad. La igualdad obligaba a las otras
-- seis acciones a llevar posición y contradecía R5 (receta sin pasos anota con NULL).

ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_order_id_company_id_fkey"
  FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_execution_entries" ADD CONSTRAINT "order_execution_entries_user_id_company_id_fkey"
  FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

**El tercer `CHECK` es nuevo el 2026-09-26 y es la forma más fuerte de R5bis**: con él, la base
**rechaza** una posición en `PACK_START` o `PACK_FINISH`, y no solo el código de aplicación. ⚑ porque
se apoya en P2 (los nombres de los valores): si el humano elige `START_PACKING`/`FINISH_PACKING`, la
literación del `CHECK` cambia con ellos y **nada más**.

`RESTRICT` en las dos: `orders` y `users` tienen borrado lógico, así que un `DELETE` físico sobre
ellos es una anomalía y tiene que ser ruidosa, igual que en `order_assignments`. **Efecto que el spec
viejo no contaba:** todo test o E2E que abra la pantalla (y por tanto anote) y después borre pedidos
físicamente en su limpieza **fallará** hasta que borre antes las anotaciones de esa empresa (`## 7`).

**Índices:**

- `order_execution_entries_order_id_occurred_at_idx` sobre `("order_id", "occurred_at" DESC)`: «la
  última posición anotada de este pedido» (R13), en **cada** apertura de la pantalla.
- `order_execution_entries_user_id_idx` sobre `("user_id")`: la comprobación del `RESTRICT` hacia
  `users`.
- **Sin índice por `company_id`**: nadie consulta el registro por empresa sola.

**RLS** activada y forzada, **sin policies**, **al final** de la migración (R32).

**Identificadores** (R33, `[D16]`): inglés y `snake_case`; los valores del enum, en mayúsculas.

### 2.2 La migración

`db/migrations/<AAAAMMDDhhmmss>_order_execution_entries/` con `migration.sql` y `down.sql`. El
timestamp **tiene que ser mayor que el de la última migración de `dev`** (el 2026-10-06,
**`20261006120000_inventory_imports`**; el 2026-09-26 era `20260925120100_packing_permission`, y entre
medias entraron once más, entre ellas `20261001170000_order_status_blocked`,
`20261004150000_execution_permission` y `20261005120000_recipe_packing_steps`): lo pone
`db:migrate:create` al crearla, y antes del PR se comprueba otra vez contra `origin/dev`; si `dev`
trajo una posterior, se renombra la carpeta (T24).

- **UP**, en este orden: `CREATE TYPE "OrderExecutionAction"` (con los **ocho** valores) →
  `CREATE TABLE` → los dos índices → los **tres** `CHECK` → las dos FK → `ENABLE` + `FORCE ROW LEVEL
  SECURITY`.
- **Drift de Prisma**: `migrate dev --create-only` emitirá `DROP CONSTRAINT`/`DROP INDEX` sobre lo
  escrito a mano en otras tablas. **Se borra a mano del SQL generado.** La migración **no ejecuta
  ningún DDL sobre una tabla preexistente** y **no inserta permisos** (R30).
- **DOWN**: `DROP TABLE "order_execution_entries";` (sin `CASCADE`) y `DROP TYPE
  "OrderExecutionAction";`.
- La plantilla de integración (QC-77) se reconstruye sola: su nombre lleva la huella de las
  migraciones.

## 3. Dominio (`lib/modules/asignaciones/domain/`)

### 3.1 El tipo de la anotación

`execution-entry.ts`:

```ts
export type ExecutionAction =
  | 'start' | 'resume' | 'advance' | 'go_back' | 'cancel' | 'finish'
  | 'pack_start' | 'pack_finish';   // A3; los nombres del enum son P2 de ## 14

type Base = {
  readonly companyId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly stepPosition: number | null;
  readonly occurredAt: Date;
};

export type NewExecutionEntry =
  | (Base & { readonly action: Exclude<ExecutionAction, 'cancel'> })
  | (Base & { readonly action: 'cancel'; readonly reason: string });
```

Los dos últimos van en el mismo tipo que los otros seis y con la misma forma: la unión de
`NewExecutionEntry` **no crece**, porque las dos de empaque no llevan `reason` (R8) y llevan
`stepPosition: null` (R5bis), que es justo el caso que la primera rama ya cubre. Lo que **no** cambia
al ampliar la unión es que el mapa al enum tiene que ser **total** sobre las ocho, y `satisfies
Record<ExecutionAction, …>` lo exige: si se olvida un par, el dominio no compila.

El cruce `'go_back'` ↔ `GO_BACK` lo hace el adaptador, con un mapa total (`satisfies
Record<ExecutionAction, …>`) que **crece a ocho** (A3).

En el mismo archivo, **`ExecutionAbortedError`**: una clase **interna** del dominio (`extends Error`,
no `AsignacionesError`, no se publica en el barril) que lleva el desenlace de `pedidos` que abortó la
transacción. La lanza el trabajo de dentro de `transaction.run` y la atrapa el propio caso de uso
**nada más salir** de `run`, para traducirla. Precedente exacto:
`StatusChangeAfterConsumptionFailedError` de `pedidos/domain/transition-order.ts`. Nunca llega al
adaptador driving.

### 3.2 Los dos puertos nuevos (`ports/`)

```ts
// ports/execution-log-repository.ts
export interface ExecutionLogRepository {
  append(entry: NewExecutionEntry): Promise<void>;
  /** La posicion de la ULTIMA anotacion con posicion de ese pedido en esa empresa, o null. */
  findLastStepPosition(companyId: string, orderId: string): Promise<number | null>;
}
```

**Sin `update`, sin `delete`** (R31). «La última» = `ORDER BY occurred_at DESC, id DESC LIMIT 1`
sobre las filas con `step_position IS NOT NULL`.

```ts
// ports/execution-transaction.ts
import type { OrderCancellation, OrderCatalog } from '@/lib/modules/pedidos';

export type ExecutionWriters = {
  /** Solo las escrituras de `pedidos`: dentro de la transaccion no se lee nada mas. */
  readonly orders: Pick<OrderCatalog, 'transitionAliveById'> & OrderCancellation;
  /** Las dos de empaque, con la firma que `OrderCatalog` ya publica (revision 2026-10-06). */
  readonly packing: Pick<OrderCatalog, 'startPackingAliveById' | 'finishPackingAliveById'>;
  readonly log: ExecutionLogRepository;
};
export interface ExecutionTransaction {
  run<T>(work: (writers: ExecutionWriters) => Promise<T>): Promise<T>;
}
```

`run` promete **una** cosa: lo que `work` escriba por `writers` —incluido lo que `pedidos` escriba en
`inventario` por dentro, y lo que escriba el empaque— **se confirma entero o no se confirma nada**, y
se deshace entero **si `work` lanza**. Por eso la regla de `## 4`: el trabajo **lanza** ante cualquier
desenlace que **no sea un éxito**. «Éxito» son **dos** formas: el literal `'ok'` (transición,
cancelación y Comenzar) y el objeto `{ kind: 'ok', finishedGoods }` de **Terminar empaque**
(`order-catalog.ts:161-162`; el 2026-09-26 se atribuía a `transitionAliveById`, que desde QC-195 ya no
lo devuelve). `already_mine` de Comenzar **no** es éxito para la transacción: no escribió nada y, con
la propuesta de la P1, sale de `run` sin anotar y sin abortar (no hay nada que deshacer).

### 3.3 Los casos de uso

Todos con el prólogo de QC-63 (R26, R27, R28): `requirePermission(actor, PERMISO)` en la **primera
línea** → `zod` strict → `listOrderIdsByUserInCompany(actor.companyId, actor.id)` (no es tuyo ⇒
`OrderNotFoundError`) → `orders.findAliveById(orderId, actor.companyId)` (`null` ⇒
`OrderNotFoundError`). Las lecturas van **fuera** de la transacción, sobre el `OrderCatalog` global.
**`PERMISO`** (revisión 2026-10-06): `'asignaciones.ejecutar'` en `start` y `finish`, que ya lo exigen
(QC-201); ⚑ y en `cancelAssignedOrder` y `recordStepMove` el que diga la **P3** —propuesta
`'asignaciones.ejecutar'`; con la letra de `D7`, `'asignaciones.consultar'`—. Cambia una cadena y la
entrada de `module-contract` (T12), nada más.

**Los dos de empaque son la excepción del párrafo anterior, en la primera línea y en la
comprobación de responsable** (A4, revisión 2026-10-06): exigen `empaque.modificar` y ningún permiso de
`asignaciones` (R42), y **no** leen `listOrderIdsByUserInCompany`: en `dev` cualquiera con
`empaque.modificar` empaca cualquier pedido vivo de su empresa. QC-82 **no** les añade esa comprobación
(R42). El 2026-09-26 este párrafo decía lo contrario, apoyándose en `D20`; el código ya no lo hacía
entonces y QC-201 dejó `D20` superada.

| Caso de uso | Entrada (`zod` strict) | Qué escribe | Cómo |
| --- | --- | --- | --- |
| `startAssignedOrder` (**ampliado**) | `{ orderId }` (sin cambios) | `PENDIENTE`: transición a **`EN_CURSO`** + `start` | Lee la vista **antes** de escribir (mismas consultas que hoy, en otro orden) para saber si hay pasos (R5). En `transaction.run`: `orders.transitionAliveById(…, 'PENDIENTE', 'EN_CURSO', …)`; si el desenlace **no es `'ok'`**, lanza `ExecutionAbortedError`; si lo es, `log.append(start)`. Fuera: `'stale'` ⇒ relee y sigue (R16) —y si relee **`BLOQUEADO`**, `OrderBlockedError` sin anotar (R44)—; `'not_found'` ⇒ `OrderNotFoundError`. |
| | | `EN_CURSO`: solo `resume` | `log.findLastStepPosition` → posición (o 1, R14 ⚑) → `log.append(resume)`, fuera de transacción (una sola sentencia). **Si falla, lanza** y la pantalla no abre (R15 ⚑). |
| | | **`BLOQUEADO`**: nada | `OrderBlockedError` **antes** de tocar el registro, como hoy (`start-assigned-order.ts:76`; R44). |
| `finishAssignedOrder` (**ampliado**) | `{ orderId, stepPosition }` | transición a **`POR_EMPACAR`** (**A1**; sin `finished_at` ni lote, que son de Terminar empaque) + `finish` | Las filas de responsable de los empacadores se crean **antes** y **fuera** de `run`, una vez, como hoy. En `transaction.run`: la transición y, si es `'ok'`, `log.append(finish)`; si no, lanza `ExecutionAbortedError`. **Cualquier** salida de `run` que no sea éxito —desenlace de `pedidos` o fallo de `append`— pasa por `compensatePackerAssignments` antes de traducirse (R24; hoy solo la llama el desenlace, `finish-assigned-order.ts:217`). Fuera, igual que hoy: `'stale'` ⇒ relee y reintenta (`for(;;)`); `'insufficient_material'` ⇒ `MaterialShortageError`; `'recipe_without_lines'` ⇒ `RecipeWithoutLinesError`; `'not_found'` ⇒ `OrderNotFoundError`. **Solo esos**: los de lote y envase son de Terminar empaque. |
| `cancelAssignedOrder` (**nuevo**) | `{ orderId, stepPosition, reason }` — `reason` con `cancelOrderSchema.shape.reason` del barril de `pedidos` (R10) | `CANCELADO` + motivo + liberación de todo el material (`[D19]`) + `cancel` con el mismo motivo | Lee el número **antes** de escribir (como `finish`), para R25 ⚑. En `transaction.run`: `orders.cancelAliveById(orderId, companyId, reason, actor.id, now)`; si no es `'ok'`, lanza `ExecutionAbortedError`; si lo es, `log.append({ action: 'cancel', reason, … })`. Fuera: `'not_cancellable'` ⇒ `NotCancellableError` —**y con eso quedan cubiertos `POR_EMPACAR`, `EN_EMPAQUE`, `ENTREGADO` y `CANCELADO` sin tocar nada (A5)**—; `'not_found'` ⇒ `OrderNotFoundError`. Un **`BLOQUEADO`** sale por `'ok'` (B1). Sin `'stale'`: la comprobación va bajo el candado. |
| `recordStepMove` (**nuevo**) | `{ orderId, direction: 'advance' \| 'go_back', stepPosition }` | `advance` / `go_back` | Solo si el pedido está `EN_CURSO` (R20); si no, lanza sin escribir: **`BLOQUEADO` ⇒ `OrderBlockedError`**, comprobado **antes** de `assertOrderAcceptsWrites` porque esa función lo deja pasar (`order-state.ts:59`); `assertOrderAcceptsWrites` para los cerrados y para `POR_EMPACAR`/`EN_EMPAQUE` (`order_produced_frozen`, A2, R43); `OrderNotFoundError` para `PENDIENTE`. Un solo `log.append`: **sin** transacción. |
| **`startPacking`** (**ampliado**, QC-168) | `{ orderId }` | transición `POR_EMPACAR` → `EN_EMPAQUE` + **`pack_start`** | **A3**: en `transaction.run`, `packing.startPackingAliveById(…)`; **`'ok'`** ⇒ `log.append({ action: 'pack_start', stepPosition: null, … })`; **`already_mine`** ⇒ sale **sin anotar** y sin abortar ⚑ (P1); cualquier otro (`taken`, `without_distribution`, `not_packable`, `not_found`) ⇒ lanza `ExecutionAbortedError` y fuera se traduce **como hoy** (`start-packing.ts:48-53`). **No escribe `reason`** (R8). |
| **`finishPacking`** (**ampliado**, QC-168) | `{ orderId }` | transición `EN_EMPAQUE` → `ENTREGADO` (`finished_at`, consumo de envases, un lote por línea) + **`pack_finish`** | En `transaction.run`, `packing.finishPackingAliveById(…)`; **`{ kind: 'ok', … }`** ⇒ `log.append({ action: 'pack_finish', stepPosition: null, … })`; cualquier otro (`not_packer`, `not_packable`, `not_found`, `recipe_not_found`, `presentation_without_content`, `incompatible_units`, `order_without_unit`, `insufficient_material`) ⇒ lanza y fuera se traduce **como hoy** (`finish-packing.ts:76-83`). **No hay `already_mine`** (B4). El número se sigue leyendo **antes**, fuera de `run`. |

**Deps nuevas:** `start` y `finish` ganan `log` y `transaction`; **`startPacking` y `finishPacking`
ganan `log` y `transaction` y nada más** —su primera línea sigue siendo `requirePermission(actor,
'empaque.modificar')`, no ganan comprobación de responsable y conservan `orders` para lo que leen
fuera de la transacción (R42)—; `cancelAssignedOrder` recibe `assignments`, `orders` (`OrderCatalog`,
para leer), `transaction` y `now`; `recordStepMove` recibe `assignments`, `orders`, `log` y `now`.

**`stepPosition`**: `z.number().int().min(1).nullable()` (en `FormData`, `z.coerce` o conversión
explícita en el adaptador driving). El servidor **no** la contrasta con la receta (`## 13`, riesgo 5).

**Qué posición lleva cada acción** (R12–R22, R41): `start` → 1; `resume` → la última anotada (o 1);
`advance`/`go_back` → la del paso **al que se llega**; `finish` → la del último paso; `cancel` → la del
paso que se está mostrando; **`pack_start` y `pack_finish` → siempre `null`** (R5bis, y el tercer
`CHECK` lo hace cumplir). Con una receta sin pasos, `null` en todas (R5 ⚑).

**Lo que devuelve `startAssignedOrder`**: `StartedOrderExecution = AssignedOrderExecutionView & {
readonly resumeStepPosition: number | null }`, tipo nuevo en `assigned-order-execution-view.ts`.
`AssignedOrderExecutionView` y `getAssignedOrderExecution` **no cambian**: el campo lo sabe solo
`start`. La vista se devuelve con `status: 'EN_CURSO'`.

**R16 sin código extra**: dos aperturas simultáneas de un `PENDIENTE` compiten por
`lockAliveById … FOR UPDATE` dentro de `createTransitionOrder`. La segunda espera al candado, ve
`EN_CURSO`, devuelve `'stale'`, su trabajo lanza `ExecutionAbortedError`, su transacción **se deshace
sin haber escrito nada**, relee `EN_CURSO` y cae en la rama de retomar.

### 3.4 Errores

`errors.ts` gana **una** clase: `NotCancellableError` con `code = 'not_cancellable'`, que ya existe en
el catálogo y que ya usa `pedidos` para el mismo caso. **Ningún código nuevo.**

## 4. La misma operación entre dos módulos (R24)

**El problema.** Arrancar, finalizar, cancelar y las **dos de empaque** escriben en tablas de **tres
módulos**: `orders` (`pedidos`), las reservas y los movimientos (`inventario`, lo escribe `pedidos` por
su unidad de trabajo) y `order_execution_entries` (`asignaciones`). Ningún adaptador toca el modelo de
otro módulo, ningún driven importa el driven de otro, y `lib/composition` no importa el cliente Prisma
(`guard-arquitectura-modulos`). Y desde QC-141 `pedidos` **abre su propia transacción** para esas
operaciones.

**La solución: una transacción que abre `asignaciones`, a la que `pedidos` se une sin abrir otra.**

```
asignaciones/domain (caso de uso)
   └─ transaction.run(async ({ orders, packing, log }) => {
        const outcome = await orders.transitionAliveById(...)   // o orders.cancelAliveById(...)
                       // o packing.startPackingAliveById(...)  <- A3
        if (outcome is not a success) throw new ExecutionAbortedError(outcome)  // deshace TODO
        await log.append(...)                                   // con stepPosition: null si es empaque
      })

lib/composition
   ├─ orderTransactionScopeOn(tx): OrderTransactionScope     <- UN constructor del ambito, dos usos
   │     EXACTAMENTE orders + reservations + recipes + finishedGoods + products + units (2026-10-06).
   ├─ orderUnitOfWork   = { run: (work) => withOrderTransaction((tx) => work(orderTransactionScopeOn(tx))) }
   ├─ joinOrderUnitOfWork(tx) = { run: (work) => work(orderTransactionScopeOn(tx)) }   <- no abre nada
   └─ executionTransaction = { run: (work) => withExecutionTransaction((tx) => work({
          orders: {
            transitionAliveById: createTransitionOrder({ unitOfWork: joinOrderUnitOfWork(tx) }),
            cancelAliveById:     createCancelAliveOrder({ unitOfWork: joinOrderUnitOfWork(tx) }),
          },
          // revision 2026-10-06: dos caminos distintos, los dos atados a `tx`
          packing: {
            startPackingAliveById:  createStartPacking({ packing: createOrderPackingRepository(tx) }),   // P5
            finishPackingAliveById: createFinishPacking({
              packing: createOrderPackingRepository(tx),
              unitOfWork: joinOrderUnitOfWork(tx),
              recipes: recipeCatalog, products: productCatalog, units: unitCatalog,
              presentations: presentationCatalog, packaging: packagingCatalog,   // lecturas globales, como hoy
            }),
          },
          log: createExecutionLogRepository(tx),
        })) }

pedidos/adapters/driven/persistence/order-prisma.ts       <- P5, unico cambio en un adaptador ajeno
   ├─ createOrderPackingRepository(db): OrderPackingRepository   corre las MISMAS tres sentencias de
   │     hoy (SELECT ... FOR UPDATE, conteo del reparto, UPDATE) sobre `db`, SIN abrir transaccion
   └─ startPackingAliveOrder(...)  = prisma.$transaction((tx) => createOrderPackingRepository(tx).startPackingAlive(...))
                                     (misma firma y mismo comportamiento: el cableado global no cambia)

asignaciones/adapters/driven/persistence/execution-transaction-prisma.ts
   └─ withExecutionTransaction(run) = prisma.$transaction(run, { maxWait: 10_000, timeout: 30_000 })
```

- **Quién abre la transacción**: un driven de `asignaciones`, con los mismos `maxWait`/`timeout` que
  `withOrderTransaction` (Finalizar consume material dentro). No sabe nada de `pedidos`.
- **Quién ata las partes**: `lib/composition`. `orderTransactionScopeOn` es la extracción del cuerpo
  que hoy construye el ámbito **en línea** dentro de `orderUnitOfWork`: la unidad normal y la unida
  lo construyen **con la misma función**, así que lo que `pedidos` gane en su ámbito (el
  `finishedGoods` de QC-150) llega a las dos sin que nadie tenga que acordarse. El tipo de `tx` sale
  de `withOrderTransaction` (`Parameters<…>`), sin importar `@prisma/client`.
- **`pedidos` no cambia de adaptadores.** `createTransitionOrder` y `createCancelAliveOrder` reciben un
  `OrderUnitOfWork`; que su `run` abra o se una es cosa de la composición.
- **[2026-10-06] El empaque, corregido.** Lo que sigue en este punto y en el siguiente es del
  2026-09-26 y **partía de dos hechos que ya no son ciertos** (revisión 2026-10-06, punto 3): que el
  empaque entero iba por `orderPackingRepository` y que `createOrderPackingRepository(tx)` existía. Hoy:
  (a) **Terminar** ya va por `OrderUnitOfWork`, así que se une con `joinOrderUnitOfWork(tx)` y **no**
  necesita nada de `pedidos`; (b) **Comenzar** abre su propia transacción sobre el cliente global y
  **sí** necesita la fábrica nueva de la P5. La conclusión del 2026-09-26 —**no** ampliar
  `OrderTransactionScope` para el empaque— se mantiene, por sus mismas dos razones; la tercera razón
  (si Comenzar no comparte `tx`, R24 es falso justo en `pack_start`) es ahora **más** fuerte, porque hoy
  Comenzar ni siquiera admite que se le pase el cliente.
- **[nuevo] El empaque se ata aparte, y esa es la parte que hay que razonar dos veces (A3).**
  `startPackingAliveById` y `finishPackingAliveById` **no** son métodos de `OrderTransactionScope`:
  están implementados sobre `orderPackingRepository`, que es un puerto **plano** con cliente
  inyectable, y `empaque` **no es** un módulo de `lib/modules/`. Por eso aquí el packing se ata
  calling `createOrderPackingRepository(tx)` **dentro** de `executionTransaction`, y **no** se añade
  un quinto miembro a `OrderTransactionScope`. Las dos razones de no ampliar el ámbito, para que
  F2.0 no lo deshaga por buena intención:
  1. Ampliar `OrderTransactionScope` cambia el **tipo** que `orderUnitOfWork` construye, así que
     obliga a tocar también el camino normal, no solo el de ejecución — y el camino normal es de
     QC-150, ya mergeado.
  2. `orderUnitOfWork` se usa **fuera** de la ejecución de `asignaciones` (la pantalla de pedidos, la
     caducidad diaria, QC-145). Meter `orderPackingRepository` en su ámbito obligaría a esos
     consumidores a tener un packing que no necesitan.
  Y una tercera, que es la que fija el orden de los `if`: si el packing **no** compartiera `tx`, la
  anotación de R41 se escribiría en una **segunda** transacción, y entonces «o las dos cosas o
  ninguna» de R24 sería falso justo en las dos acciones nuevas. `createOrderPackingRepository(tx)` es
  la misma fábrica con otro cliente; es la razón de que el puerto de `pedidos` acepte `tx` y no solo
  `prisma`.
- **[nuevo] La regla que lo hace seguro, corregida.** La unidad unida **no confirma ni deshace**: si
  `createTransitionOrder` —o el empaque— convierten por dentro un fallo en resultado
  (`'insufficient_material'`, `'recipe_without_lines'`, `'already_mine'`, o el `'stale'` tras haber
  consumido), lo ya escrito seguiría vivo en la transacción de fuera. Por eso **el trabajo de
  `asignaciones` lanza ante todo desenlace que no sea un éxito**, y `withExecutionTransaction` deshace
  todo. Y «un éxito» son **dos** formas, no una: el literal `'ok'` y el objeto `{ kind: 'ok',
  finishedGoods }`, que **desde QC-195 es de `finishPackingAliveById`** y no de `transitionAliveById`
  (el 2026-09-26 se le atribuía a esta). Una comparación `outcome !== 'ok'` en Terminar empaque
  **abortaría un éxito**. El predicado correcto es **uno solo** en el módulo para las cinco rutas de
  escritura con transacción, con sus tests contando las dos formas. Es lo que T19 comprueba contra
  Postgres.
- **[2026-10-06] Por qué la regla basta también para Terminar empaque.** `createFinishPacking` lanza
  **dentro** de `unitOfWork.run` y **atrapa fuera** (`order-packing.ts:176`, `:261-267`). Con la unidad
  normal, el `throw` deshace su transacción; con la **unida**, `run` no deshace nada y lo ya escrito
  —el `UPDATE` a `ENTREGADO`, el consumo de envases, algún lote— seguiría vivo en `tx`. El valor que
  devuelve (`'insufficient_material'`, …) no es éxito, el trabajo de `asignaciones` lanza, y
  `withExecutionTransaction` deshace **todo**. Mismo razonamiento que el `'insufficient_material'` del
  Finalizar, que `transition-order.ts:110-112` también atrapa.
- **El dominio no se entera**: recibe `ExecutionWriters`, cinco métodos de interfaces que ya conoce.

## 5. `pedidos`: cancelar por encargo, por el camino único (R29)

1. **`pedidos/domain/order-cancellation.ts` (nuevo)** exporta:
   - `isCancellableStatus(status)`: mapa **total** sobre `OrderStatus` (`satisfies Record<OrderStatus,
     boolean>`); sustituye a `CANCELABLES` de `cancel-order.ts`. **Una** definición. El `satisfies`
     obliga a clasificar **los siete** valores de `OrderStatus` (`order-classification.ts:12-20`):
     **`true`** para `PENDIENTE`, `EN_CURSO` y **`BLOQUEADO`** —los tres de `cancel-order.ts:33`, y el
     tercero llegó con QC-138; el 2026-09-26 este punto decía dos—; **`false`** para `POR_EMPACAR`,
     `EN_EMPAQUE` (**A5**: `'not_cancellable'`, no `'not_found'`), `ENTREGADO` y `CANCELADO`. El
     comentario de `cancel-order.ts:19-32`, que explica cada uno, se muda con la lista.
   - `cancelInsideTransaction(scope: OrderTransactionScope, input: { id, reason, actorId, now,
     companyId })` → `'ok' | 'not_found' | 'not_cancellable'`: el cuerpo que hoy vive dentro del `run`
     de `cancel-order.ts`, **sin cambiar nada**: `lockAliveById` → `isCancellableStatus` sobre la fila
     bloqueada → `cancelAlive` → `releaseForOrder` (`reason: 'release'`, autor `actorId`) →
     `setReservedAt(null)`.
   - El tipo `OrderCancellation = { cancelAliveById(id: string, companyId: string, reason: string,
     actorId: string, now: Date): Promise<'ok' | 'not_found' | 'not_cancellable'> }` y
     `createCancelAliveOrder({ unitOfWork }): OrderCancellation['cancelAliveById']`, que abre
     `unitOfWork.run` y llama a `cancelInsideTransaction`. Mismo papel que `createTransitionOrder`.
2. **`cancel-order.ts`** usa `isCancellableStatus` en su comprobación previa y
   `cancelInsideTransaction` dentro de su `run`, traduciendo `'not_cancellable'` a
   `NotCancellableError` y `'not_found'` a `OrderNotFoundError` como hoy. Su comportamiento observable
   no cambia: sus tests siguen verdes **sin tocarlos**.
3. **Barril**: `createCancelAliveOrder`, `CancelAliveOrderDeps` y el tipo `OrderCancellation`.
   `isCancellableStatus` y `cancelInsideTransaction` **no** se publican.
4. **Vocabulario vigilado**: `tests/unit/pedidos/module-contract.test.ts` prohíbe en todo archivo de
   `pedidos` (comentarios incluidos) palabras como `transition`, `transicion…`, `nextStatus` o
   `allowedStatus…`. Los archivos nuevos o tocados de `pedidos` no las usan.
5. **El seed no cambia** (R30): el Operador no gana `pedidos.modificar`, y `cancelOrder` sigue
   exigiéndolo para la pantalla de pedidos.

## 6. Pantalla

### 6.1 `StepReader` gana dos props opcionales (R37 ⚑)

```ts
export type StepReaderProps = {
  // … las siete de hoy: steps, onFinish, title, minStepSeconds, mode, finishLabel, finishBusy
  readonly initialStepPosition?: number;                 // desde 1; se recorta a [1, steps.length]
  readonly onStepChange?: (change: { direction: 'advance' | 'go_back'; position: number }) => void;
};
```

- Sin las dos props nuevas, **el comportamiento es el de hoy** en los dos `mode`. Desde QC-211 eso
  cubre **tres** consumidores: la ejecución (que sí las pasa), la **pantalla de empaque** y el
  formulario de fórmula (que no). La de empaque **no** las recibe: QC-211 R31 exige que empiece en el
  paso 1 y no guarde el avance, y la P4 propone no anotar su recorrido. Su test
  (`tests/unit/asignaciones-ui/packing-order-screen.test.tsx`) sigue verde **sin tocarlo**.
- Sigue recibiendo todo por props (QC-64 R20 intacta).
- `initialStepPosition` fija el estado **inicial** de `index`; el efecto de foco de `'ejecucion'` sigue
  saltándose el montaje, así que empezar en el paso 3 no roba el foco. La espera mínima arranca en el
  paso de entrada como en cualquier llegada.
- El recorte a `[1, steps.length]` es R14 ⚑.
- `onStepChange` se llama **después** de cambiar el índice, y solo si cambió.
- Solo cambia `step-reader.tsx`: es lo que admite hoy la lista cerrada del test R18 de QC-63.

### 6.2 `order-execution-screen.tsx`

- Recibe `StartedOrderExecution`; pasa `initialStepPosition={execution.resumeStepPosition ?? 1}` y
  guarda la posición actual en estado para Finalizar y Cancelar.
- **Avanzar y retroceder no esperan a nadie** (R19): en `onStepChange` encola
  `recordStepMoveAction(...)` en una **cadena de promesas** y **no** espera su resultado para pintar.
  Cada eslabón atrapa y descarta su fallo. La cadena existe para que las anotaciones **lleguen en el
  orden de los clics** (`## 10.9`).
- **Finalizar** gana un campo oculto `stepPosition` en el `<form>` que hoy envía `ConfirmActionDialog`
  (`order-execution-screen.tsx:132-147`).
- **Cancelar**: botón «Cancelar pedido» visible en todos los pasos, que abre `order-cancel-dialog.tsx`
  (`AlertDialog` + `Textarea` de shadcn/ui, ya en el repo: `components/ui/alert-dialog.tsx`,
  `components/ui/textarea.tsx`). `ConfirmActionDialog` **no** sirve tal cual: no tiene campo de texto,
  y ampliarlo tocaría un componente compartido por un caso. El motivo se valida en cliente con
  `cancelOrderSchema` del barril de `pedidos` y otra vez en el servidor. Confirmar envía
  `cancelAssignedOrderAction` con `orderId`, `stepPosition` y `reason`. El botón no va dentro de la
  barra fija de `StepReader` (que no se toca por esto).

### 6.3 Server Actions (`asignaciones/adapters/driving/order-execution-actions.ts`)

Van **en el mismo archivo** que las dos de QC-63: el censo de
`tests/unit/identity/session-once-per-request-actions.test.ts` es **por archivo** y ya lo cubre.

| Acción | Entrada | Salida |
| --- | --- | --- |
| `startAssignedOrderAction` | sin cambios | `StartedOrderExecution` |
| `finishAssignedOrderAction` | `FormData` + `stepPosition` | sin cambios (redirige) |
| `cancelAssignedOrderAction` (**nueva**) | `FormData` con `orderId`, `stepPosition`, `reason` | `ErrorState`, o redirige a `` `${ASSIGNED_ORDERS_ROUTE}?${CANCELLED_ORDER_PARAM}=<numero>` `` (R25 ⚑) |
| `recordStepMoveAction` (**nueva**) | `{ orderId, direction, stepPosition }` | `{ status: 'success' } \| ErrorState`; la pantalla lo ignora |

**[nuevo] Las dos de empaque no entran en esta tabla, y esa es la decisión.** QC-168 ya tiene sus
Server Actions (`startPackingAction` / `finishPackingAction`) y ya están en su archivo, con su censo.
No se mueven aquí: la pantalla de empaque es otra (`/empaque`), y R41/R42 son requisitos de lo que
esas acciones **llaman por debajo**, no de ellas. Lo único que cambia de la capa de driving es que los
casos de uso que esas acciones invocan ahora anotan. **[2026-10-06]** Desde QC-211, Terminar se
dispara también desde el botón del último paso de envasado (`packing-order-screen.tsx:243`): es la
**misma** `finishPackingAction`, así que anota igual sin tocar la pantalla de empaque.

### 6.4 La confirmación en la lista (R25 ⚑)

`lib/shared/routes.ts` gana `CANCELLED_ORDER_PARAM` (nombre de parámetro de consulta). La lista
cerrada de `tests/unit/recetas-ui/recipe-route-contract.test.ts` gana esa entrada, con nota fechada,
como hizo `DELIVERED_ORDER_PARAM`; el valor no puede aludir al asistente (el mismo test lo barre).
`app/(private)/asignacion/page.tsx` pinta `AssignedOrderCancelledNotice` junto al aviso de entrega,
**encima de las pestañas de vista** (QC-145), así que se ve sea cual sea la vista.

## 7. Guardias y listas cerradas: qué se toca y qué muerde después
> **Enmiendas F2.1 (humano, 2026-10-06).** (1) `tests/unit/asignaciones/packing-limits.test.ts` (QC-168) se enmienda con nota fechada: su R44 admite el registro de ejecución en `start-packing.ts` y `finish-packing.ts`, y su R45 deja de barrer `specs/QC-82-*`; el resto del archivo no cambia. (2) En `order-execution-screen.test.tsx`, además del mock y el fixture, la aserción de R18 (QC-125) pasa a `[orderId, stepPosition]`; lo que protege, que no viaje nada de la espera, se mantiene. (3) La carrera de R16 abierta por T10 se cierra en `startAssignedOrder`: el `OrderNotFoundError` de la rama `PENDIENTE` cuando el pedido ya está `EN_CURSO` se trata como `stale` y se vuelve a leer.

| Guardia / lista | Qué exige | Qué pasa aquí | Cuándo |
| --- | --- | --- | --- |
| `tests/guards/guard-ambito-empresa-pedidos.test.ts` | Cada método de `OrderCatalog` cableado en `const orderCatalog`; `transitionAliveById` exactamente a `createTransitionOrder({ unitOfWork: orderUnitOfWork })` (`METODOS_DELEGADOS_EN_DOMINIO`); barrido sin excepciones de toda función de persistencia que toque la base. | `orderCatalog` **no cambia**, así que lo existente sigue verde. **Se tensa con un caso nuevo**: `OrderCancellation.cancelAliveById` declara `companyId: string`; `cancelInsideTransaction` lleva `{ companyId }` a `lockAliveById` y `cancelAlive`; y en `lib/composition` toda llamada a `createTransitionOrder(` o `createCancelAliveOrder(` recibe `unitOfWork: orderUnitOfWork` o `unitOfWork: joinOrderUnitOfWork(tx)` y nada más. Con **mutación** que lo pone rojo. **[nuevo]** Y un caso más para A3, con la misma figura: toda llamada a `createOrderPackingRepository(` dentro de `lib/composition` recibe **`tx`**, nunca `prisma`, ni nada, ni menos. Sin él, el packing se leería fuera de la transacción y R41 sería falsa sin que nada lo delatara. | Ahora |
| `tests/unit/asignaciones/module-contract.test.ts` → `CASOS_DE_USO_QC63` | **[2026-10-06]** Lista **cerrada** de archivos que pueden nombrar **`'asignaciones.ejecutar'`** (QC-201, `:439-455`), y un caso que fija **la lista exacta** de quién lo nombra (`:1047-1054`). Hasta QC-201 era `asignaciones.consultar`. | `cancel-assigned-order.ts` y `record-step-move.ts` ⇒ **rojo**. ⚑ Con la propuesta de la P3 se añaden a `CASOS_DE_USO_QC63` (crece, no se afloja), con nota fechada, y el caso exacto crece con ellos; con la letra de `D7`, van en **dos entradas nuevas** de `CONSUMO_LEGITIMO` con `codigo: 'asignaciones.consultar'`, y `CASOS_DE_USO_QC63` no se toca. **[nuevo]** Los dos de empaque **no** entran en esa lista y **no** hay que añadir una lista nueva: no nombran `asignaciones.consultar` (A4, R42), y el permiso que sí exigen —`empaque.modificar`— no lo vigila este test (su `CODIGOS_NUEVOS` son `asignaciones.consultar` y `asignaciones.modificar`). Lo que sí hay que comprobar es que `start-packing.ts` y `finish-packing.ts` **sigan** exigiendo el suyo en la primera línea, y eso lo dice su propio test de autorización. | Ahora |
| `tests/guards/guard-arquitectura-modulos.test.ts` | `@module` en cada modelo; `prisma.<modelo>` solo en su dueño; composición sin cliente Prisma; driven sin driven ajeno. | `OrderExecutionEntry` con `/// @module asignaciones`. La composición no importa `@/lib/shared/db/prisma` (`## 4`). **[nuevo]** Y esto obliga a que `packing` **no** sea el `orderCatalog` global ni un miembro de `OrderUnitOfWork`: `createOrderPackingRepository(tx)` se construye **dentro** de `executionTransaction` y no sale de ahí, igual que `executionLogRepository`. | Ahora, si se hace mal |
| `tests/guards/guard-empresa-en-esquema.test.ts` | Todo modelo con `company_id` o en `EXENTAS`. | Tiene `company_id`. Verde. | — |
| `tests/guards/guard-rls-force.test.ts` | Toda tabla creada con `ENABLE` + `FORCE`. | Verde si la migración cierra con las dos. | Ahora |
| `tests/guards/guard-catalogo-de-errores.test.ts` | Códigos del catálogo cerrado, sin mensaje por parámetro. | `NotCancellableError` reutiliza `not_cancellable`. `ExecutionAbortedError` no es de la jerarquía de errores del módulo (precedente de `transition-order.ts`). | Ahora, si se hace mal |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | Censo **por archivo** de acciones con `currentActor`. | Las acciones nuevas van al archivo ya censado. | Ahora |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | Exportaciones **exactas** de `lib/shared/routes.ts`. | `CANCELLED_ORDER_PARAM` ⇒ **rojo**. Se añade con nota fechada. | Ahora |
| `tests/unit/asignaciones/start-assigned-order.test.ts`, `finish-assigned-order.test.ts` | QC-63 R9/R10 y R16. | Deps nuevas; R9 **sigue cierta sobre el pedido**, y se anota retomar (R38); R16: la entrada gana `stepPosition`. Se **tensan** con nota fechada. | Ahora |
| `tests/unit/asignaciones/empacador-authorization.test.ts` | QC-144 R12: el Empacador concede en `start` y `finish`. | Construye `start`/`finish` con sus deps ⇒ no compila hasta darle `log` y `transaction` (dobles). Sus aserciones no cambian. **[nuevo]** Y **no** hay que construirle `startPacking`/`finishPacking`: hoy ese archivo no los menciona y QC-82 no le amplía el alcance. La garantía de que el Empacador conserva `empaque.modificar` sigue viniendo del seed y del propio test de `start-packing`/`finish-packing`. | Ahora |
| **[nuevo]** `tests/unit/asignaciones/start-packing.test.ts`, `finish-packing.test.ts` | Casos de uso de empaque de **QC-168**: permiso de la primera línea, desenlaces, `already_mine`. | Los dos ganan `log` y `transaction` ⇒ no compilan hasta constructores nuevos. Sus aserciones sobre permiso, `already_mine` y estado **no cambian**; se **tensan** con las de R41/R42: que anotan **dentro** de `run`, que `already_mine` **no** anota ⚑ (P1 de `## 14`), y que la anotación va **sin posición** (R5bis). Nota fechada, sin aflojar ninguna. | Ahora |
| `tests/integration/asignaciones/responsible-eligibility.int.test.ts`, `finished-orders.int.test.ts` | Modo `transaccion`: todo corre en la transacción del test y `$transaction` **no** viaja por el proxy (`prisma-tx-holder.ts`). | Construyen `start`/`finish` ⇒ necesitan `log` (el adaptador real sobre el `tx` del test) y un `transaction` de test cuyo `run` llame a `work` con los escritores atados a ese mismo `tx`, **sin** `withExecutionTransaction`. Así siguen dentro del `ROLLBACK` del test. | Ahora |
| `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` | Mock del módulo de acciones con solo `finishAssignedOrderAction`; caso R18 de QC-63 (lista cerrada). | El mock gana `recordStepMoveAction` y `cancelAssignedOrderAction`; el fixture gana `resumeStepPosition`. El caso R18 **no se toca**: ya admite `step-reader.tsx`. **[nuevo]** Y **no** gana las de empaque: la pantalla de empaque de QC-168 es otra (`/empaque`), con sus propios test, y esas Server Actions ya existen. | Ahora |
| `tests/unit/recetas-ui/step-reader.test.tsx` | Comportamiento de QC-64/QC-125. | No cambia. Se **añaden** casos. | — |
| `tests/integration/aislamiento.json` + `guard-aislamiento-integracion` | Cada `*.int.test.ts` nuevo, declarado. | `order-execution-entries-constraints.int.test.ts` → `transaccion`. `execution-atomicity.int.test.ts` → **`commit`** con `motivo` y `desde`: `withExecutionTransaction` abre su propia transacción. | Ahora |
| Limpiezas que borran pedidos (`order.deleteMany`) en E2E e integración `commit` | Borran pedidos físicamente al terminar. | Las que abren la pantalla de ejecución anotan, y la FK `RESTRICT` rompe su limpieza ⇒ borran antes `orderExecutionEntry` de su empresa. Candidatas medidas: `e2e/ejecucion-receta.spec.ts`, `e2e/reserva-de-material.spec.ts`, `e2e/recetas-porcentaje.spec.ts`, `e2e/pedidos-terminados.spec.ts`, `e2e/pedidos-asignados.spec.ts`. Se confirma una a una. **[nuevo] A6** Y dos que el 2026-09-24 no se veían, porque A3 las vuelve a anotar: **`e2e/empaque.spec.ts`** (la de QC-168, que ya espera `POR_EMPACAR` y llama a las dos Server Actions de empaque) y **`e2e/producto-terminado.spec.ts`** (que abre `assignedOrderRoute`, o sea que **anota**, y luego hace `order.deleteMany`). **[nuevo]** Y una que el 2026-09-24 dejó con una duda y que la medida resuelve: **`e2e/recetas-pasos.spec.ts` no abre la pantalla de ejecución** y **no** necesita limpieza. **[2026-10-06]** Tres más que entraron después y navegan a `assignedOrderRoute` o `packingOrderRoute`: **`e2e/envases-del-pedido.spec.ts`** (QC-195), **`e2e/pasos-de-envasado.spec.ts`** (QC-211) y **`e2e/pedido-en-varias-presentaciones.spec.ts`** (QC-170). A reconfirmar, sin navegación directa encontrada: `e2e/pedido-bloqueado.spec.ts`, `e2e/pedido-conversion-de-unidad.spec.ts`, `e2e/versiones-de-receta.spec.ts`. | Al correr E2E |
| `e2e/ejecucion-receta.spec.ts` | Camino feliz de QC-63. | Debería seguir verde salvo la limpieza; revisar selectores si el botón de cancelar cae cerca. | Al correr Playwright |
| **[2026-10-06]** `tests/guards/guard-ambito-empresa-pedidos.test.ts` → `METODOS_DELEGADOS_EN_DOMINIO` | El cableado **exacto** de `createStartPacking` y `createFinishPacking` en el `orderCatalog` global (`:487-511`). | El `orderCatalog` global **no cambia**: las dos expresiones siguen verdes. Lo nuevo vive en `executionTransaction` y lo vigila el caso de T5. **`createOrderPackingRepository`** (P5) entra en el barrido de funciones de persistencia: su `startPackingAlive` lleva `scope` como último parámetro, igual que hoy. | Ahora |
| **[2026-10-06]** `tests/unit/asignaciones/authorization.test.ts` | Construye `createStartPacking(deps)` y `createFinishPacking(deps)` (`:596-658`). | Consumidor de las deps de T25 que el 2026-09-26 no se vio: gana `log` y `transaction` (dobles). Aserciones intactas. | Ahora |
| **[2026-10-06]** `tests/integration/asignaciones/finished-orders.int.test.ts`, `batch-states.int.test.ts`, `finish-auto-assign-packers.int.test.ts` | Construyen `start`, `finish`, `startPacking` y `finishPacking` (`finished-orders:134-143`, `batch-states:162`, `finish-auto-assign-packers:111-181`). | Mismo arreglo que `responsible-eligibility`: registro real sobre el `tx` del test y un `transaction` de test que no abre nada. Si alguno corre en modo `commit` y borra pedidos, su limpieza borra antes `orderExecutionEntry` (FK `RESTRICT`). | Ahora |
| **[2026-10-06]** `tests/unit/asignaciones-ui/packing-order-screen.test.tsx` | Pantalla de empaque con `StepReader` (QC-211). | **No se toca**: es la prueba de que las props nuevas no cambian nada donde no se pasan (R37). | — |

## 8. Multiplataforma (R36)

Botón de cancelar y botones del diálogo con `min-h-11 min-w-11`; `Textarea` con `text-base` (16 px);
el motivo del rechazo como texto en el DOM, nunca `title`; todo alcanzable con teclado. **Ninguna
excepción de escritorio**: se usa en planta, en móvil o tablet.

## 9. Dependencias de terceros

**Ninguna** (`[D18]`, R35). `AlertDialog`, `Textarea` y `Button` ya están en `components/ui/`; la
validación es `zod`; la transacción es `prisma.$transaction`, ya usado en diez adaptadores driven.
`docs/dependencias.md` no cambia.

## 10. Alternativas descartadas

**10.1 — Abrir la transacción en `lib/composition` con `prisma.$transaction`.** La composición no
puede importar el cliente Prisma (`guard-arquitectura-modulos`). Se abre en un driven.

**10.2 — Que `pedidos` escriba también la anotación.** `pedidos` pasaría a saber de pasos y de
retomar, y la tabla tendría el dueño equivocado.

**10.3 — Escribir en dos pasos y compensar (saga).** La compensación sería borrar una anotación
(`[D13]` lo prohíbe) o deshacer un estado (la matriz de transiciones lo prohíbe).

**10.4 — Un trigger que anote al cambiar `orders.status`.** No sabe la posición ni distingue arrancar
de un cambio desde la oficina.

**10.5 — Llamar al `orderUnitOfWork` global dentro de la transacción de ejecución. DESCARTADA (nueva
el 2026-09-24).** Es lo más corto —ningún cableado nuevo—, pero `withOrderTransaction` abre **otra**
transacción en **otra** conexión: la anotación y el cambio del pedido se confirmarían por separado,
que es justo lo que R24 prohíbe, y con el pedido bloqueado por la de dentro mientras la de fuera
espera se arriesga un bloqueo mutuo bajo el pooler.

**10.6 — Meter `cancelAliveById` en `OrderCatalog`. DESCARTADA (nueva el 2026-09-24).** Era el plan
del 2026-09-18. Hoy `OrderCatalog` tiene 11 dobles en tests que dejarían de compilar, y el
`orderCatalog` global tendría que cablear un método que nadie llama fuera de la transacción de
ejecución. Un contrato propio y estrecho, `OrderCancellation`, dice lo mismo sin cableado muerto.

**10.7 — Savepoints (`SAVEPOINT` crudo) para que la unidad unida pueda deshacer lo suyo.**
**DESCARTADA (nueva el 2026-09-24).** Resolvería los resultados que `createTransitionOrder` convierte
en valores, pero mete SQL crudo de control de transacciones en la composición o en un driven, y
Prisma no los modela. Abortar la transacción entera ante todo desenlace no `'ok'` es más simple y
cumple R24 igual.

**10.8 — `cancelAliveById` con su propio `updateMany`.** Habría **dos** sentencias capaces de escribir
`CANCELADO` y el motivo, y **no liberaría el material**: `[D6]` pide el camino único.

**10.9 — Recuperar el paso en el cliente (`localStorage`).** `[D12]` dice «el último paso anotado **de
ese pedido**», no de ese navegador; y QC-64 R19 prohíbe guardar estado del asistente en el navegador.

**10.10 — Montar `StepReader` sin tocarlo, con `key` y clics simulados.** No se puede empezar en el
paso 3 sin marcar los pasos 1 y 2 y esperar sus 5 s.

**10.11 — Mandar avanzar/retroceder sin cadena, en paralelo.** Dos Siguiente seguidos pueden llegar
al revés y la recarga volvería atrás.

**10.12 — Meter `orderPackingRepository` en `OrderTransactionScope` para que el empaque venga con el
ámbito. DESCARTADA (nueva el 2026-09-26).** Es lo que hace el resto de las escrituras de `pedidos`, y
parece más limpio. Descartada por las dos razones de la nota de `## 4`: cambia un tipo que
`orderUnitOfWork` ya construye en el camino normal —que es de QC-150 y ya está mergeado—, y obliga a
los consumidores de ese ámbito que no son de ejecución (la pantalla de pedidos, la caducidad diaria) a
tener un packing que no usan. Atarlo a `tx` **dentro** de `executionTransaction` da lo mismo sin tocar
el tipo compartido.

**10.13 — Escribir la anotación de las dos de empaque **fuera** de la transacción de empaque. DESCARTADA
(nueva el 2026-09-26).** El `already_mine` que QC-168 ya devuelve hace parecer que da igual: no hubo
cambio, y una anotación sola «no rompe nada». Rompe R24, que no admite escrituras sueltas, y además
deja un hueco entre el estado y su anotación que el reinicio del proceso puede llenar. Se anota
dentro.

**10.14 — Un caso de uso nuevo `recordPackingStep` en vez de ampliar `startPacking` y `finishPacking`.
DESCARTADA (nueva el 2026-09-26).** R42 dice que no: los dos archivos existen, ya traen la
autorización y la traducción de errores que hacen falta (_2026-10-06: «la comprobación de
responsable» que se citaba aquí no existe; ver `## 3.3`_). Un caso de uso nuevo por acción dejaría
cuatro caminos para un mismo gesto y la mitad de la garantía de QC-168 —que es que solo quien tiene
`empaque.modificar` puede— se quedaría en un archivo que nadie relee.

**10.15 — Meter `startPackingAlive` en `OrderWriteRepository` para que Comenzar vaya por la unidad de
trabajo, como Terminar. DESCARTADA como propuesta de la P5 (nueva el 2026-10-06).** Es la forma más
uniforme: las cinco escrituras se unirían con `joinOrderUnitOfWork(tx)` y `OrderPackingRepository`
podría desaparecer. Pero cambia un puerto de dominio de `pedidos` que implementan
`createOrderWriteRepository` y el doble compartido `tests/helpers/order-unit-of-work-double.ts`, y que
usan decenas de integraciones de `pedidos`; cambia `createStartPacking` y su expresión exacta en
`METODOS_DELEGADOS_EN_DOMINIO`; y mete en la transacción de `inventario` una escritura que hoy, a
propósito, va fuera (`order-packing-repository.ts:3-5`). La fábrica `createOrderPackingRepository(db)`
logra lo mismo para QC-82 tocando **un** adaptador y sin cambiar ningún puerto. Si el humano prefiere
la uniformidad, la P5 se contesta con esta.

**10.16 — Exigir `asignaciones.consultar` en cancelar y avanzar/retroceder, a la letra de `D7`.
DESCARTADA como propuesta de la P3 (nueva el 2026-10-06), no como decisión.** Es lo que `D7` dice, y
no exige nada de QC-201. Pero deja dos escrituras de la pantalla de ejecución con un permiso más
**ancho** que el de abrirla: el Empacador, que tiene `asignaciones.consultar` y no ve el pedido
(QC-201 `D8`), podría cancelarlo o anotarle pasos forjando la petición. Lo decide el humano en F1.4.

**10.17 — Meter la creación de filas de empacador dentro de la transacción de la ejecución.
DESCARTADA (nueva el 2026-10-06).** Quitaría la compensación de R24: un `ROLLBACK` deshace las filas.
Pero esas filas se crean **una sola vez por Finalizar, fuera del reintento** de `'stale'`
(`finish-assigned-order.ts:202-204`), y cada vuelta del `for(;;)` abre una transacción nueva: dentro,
se recrearían en cada vuelta. Se conserva el diseño de hoy y se amplía la compensación al fallo nuevo.
## 11. Archivos que la feature va a tocar

> **Para F2.0 — cruce con las ramas vivas (re-medido el 2026-09-26; el del 2026-09-24 ya no vale).**
> Los dos socios que aquel día estaban `in_progress` están **`done`** y su código está en `dev`:
> **QC-150** (`producto-terminado`, que metió `finishedGoods` en el ámbito y el lote de producto
> terminado en el Finalizar) y **QC-153** (`modelo-de-clientes`, que tocó `db/schema.prisma` y sus
> migraciones). **El riesgo que esta sección señalaba ya no es un riesgo de solape: es una
> obligación de adaptación**, y son las tres cosas de la fila «[nuevo]» de la revisión.
> - **Lo que queda vivo, y hay que mirarlo antes de empezar:** **QC-167**
>   (`recorrido-de-ejecucion-en-el-dashboard`, `pending`, **`depends_on: QC-82`**): leerá esta tabla, así
>   que el enum de ocho y la forma de las filas son su contrato. No solapa archivos con esta ficha, y
>   por eso no bloquea nada; lo que sí hace es que **los nombres de P2 son los suya** de entrada.
> - **QC-68** y **QC-92** siguen `done`; su cruce sigue sin aplicar.
> - **[2026-10-06]** Todo lo de la lista del leader (QC-138, QC-170, QC-194, QC-195, QC-204, QC-211,
>   QC-161, QC-172/174) y QC-201 están **`done`** y en `dev`: son adaptación, no solape (revisión
>   2026-10-06). Vivo y con cruce: **QC-202** (`pending`), que tocará `finish-packing.ts`,
>   `order-packing.ts` y el estado de destino de Terminar empaque. **QC-167** y **QC-124** siguen
>   `pending` y dependen de esta ficha.

**Nuevos**

| Archivo | Qué |
| --- | --- |
| `db/migrations/<AAAAMMDDhhmmss>_order_execution_entries/migration.sql` | UP (`## 2.2`) |
| `db/migrations/<AAAAMMDDhhmmss>_order_execution_entries/down.sql` | DOWN |
| `lib/modules/asignaciones/domain/execution-entry.ts` | Tipos de la anotación y `ExecutionAbortedError` |
| `lib/modules/asignaciones/domain/cancel-assigned-order.ts` | Caso de uso de cancelar |
| `lib/modules/asignaciones/domain/record-step-move.ts` | Caso de uso de avanzar/retroceder |
| `lib/modules/asignaciones/ports/execution-log-repository.ts` | Puerto del registro |
| `lib/modules/asignaciones/ports/execution-transaction.ts` | Puerto de transacción |
| `lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma.ts` | Adaptador del registro (fábrica con `db`) |
| `lib/modules/asignaciones/adapters/driven/persistence/execution-transaction-prisma.ts` | `withExecutionTransaction` |
| `lib/modules/pedidos/domain/order-cancellation.ts` | `isCancellableStatus`, `cancelInsideTransaction`, `OrderCancellation`, `createCancelAliveOrder` |
| `app/(private)/asignacion/[id]/components/order-cancel-dialog.tsx` | Diálogo del motivo |
| `app/(private)/asignacion/components/assigned-order-cancelled-notice.tsx` | Confirmación en la lista (R25 ⚑) |
| `tests/unit/asignaciones/schema/order-execution-entries-migration.test.ts` | R1, R3, R5–R8, R32–R34 sobre el SQL |
| `tests/unit/asignaciones/execution-log-repository.test.ts` | R8 (tipos), R31 (forma del puerto) |
| `tests/unit/asignaciones/cancel-assigned-order.test.ts` | R9, R10, R22–R24, R26–R30 |
| `tests/unit/asignaciones/record-step-move.test.ts` | R17, R18, R20, R26–R28 |
| `tests/unit/pedidos/order-cancellation.test.ts` | R29 (una definición, un cuerpo, dos consumidores) |
| `tests/unit/asignaciones-ui/order-cancel-dialog.test.tsx` | R9, R11, R22, R36 |
| `tests/unit/asignaciones-ui/order-execution-step-log.test.tsx` | R13, R14, R17–R19 en la pantalla |
| `tests/unit/asignaciones-ui/assigned-orders-cancelled-notice.test.tsx` | R25 |
| `tests/integration/asignaciones/order-execution-entries-constraints.int.test.ts` | R1, R5–R8, R32 contra Postgres |
| `tests/integration/asignaciones/execution-atomicity.int.test.ts` | R16, R20, R23, R24, R29 contra Postgres |
| `e2e/registro-ejecucion.spec.ts` | R39, R40 |

**Modificados**

| Archivo | Qué cambia | Riesgo |
| --- | --- | --- |
| `db/schema.prisma` | `+ enum OrderExecutionAction`, `+ model OrderExecutionEntry` (al final) | Medio: caliente (QC-153) |
| `lib/modules/asignaciones/domain/start-assigned-order.ts` | `start`/`resume` + transacción | Medio |
| `lib/modules/asignaciones/domain/finish-assigned-order.ts` | `stepPosition` + `finish` en transacción, destino `POR_EMPACAR` (A1) | Medio |
| **[nuevo]** `lib/modules/asignaciones/domain/start-packing.ts`, `finish-packing.ts` (QC-168) | `log` + `transaction`; anotan dentro de `run` (A3). **Solo deps**: ni la autorización, ni `already_mine`, ni la traducción de errores cambian. | Bajo |
| **[nuevo]** `lib/modules/asignaciones/domain/order-state.ts` (QC-168) | **No se toca.** Ya tiene las seis claves y `order_produced_frozen` para los dos estados nuevos (A2). Se toca **su test** para R43. | — |
| `lib/modules/asignaciones/domain/assigned-order-execution-view.ts` | `+ StartedOrderExecution` | Bajo |
| `lib/modules/asignaciones/domain/errors.ts` | `+ NotCancellableError` | Bajo |
| `lib/modules/asignaciones/index.ts` | `+` factories nuevas, `*Deps`, tipos | Bajo |
| `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts` | `+` dos acciones; `finish` lee `stepPosition` | Bajo |
| `lib/modules/pedidos/domain/cancel-order.ts` | usa `isCancellableStatus` y `cancelInsideTransaction` | Bajo |
| `lib/modules/pedidos/index.ts` | `+ createCancelAliveOrder`, `CancelAliveOrderDeps`, `OrderCancellation` | Bajo |
| `lib/composition/index.ts` | `orderTransactionScopeOn`, `joinOrderUnitOfWork`, `executionLogRepository`, `executionTransaction`, `packing: createOrderPackingRepository(tx)` (A3), fachada | **Alto: archivo caliente; QC-150 ya lo tocó, así que el conflicto real es de versión, no de orden** |
| **[nuevo]** `lib/modules/pedidos/domain/order-packing.ts`, `pedidos/ports/order-packing-repository.ts` | **No se tocan.** _2026-10-06: el porqué del 2026-09-26 («ya aceptan un cliente inyectable») era falso para el adaptador; el puerto y el dominio, en cambio, no necesitan cambio._ | — |
| **[2026-10-06]** `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` | ⚑ P5: `+ createOrderPackingRepository(db)`; `startPackingAliveOrder` pasa a abrir su transacción y delegar en ella, con la misma firma | **Medio**: adaptador de otro módulo; vigilado por `guard-ambito-empresa-pedidos` |
| **[2026-10-06]** `tests/integration/pedidos/order-packing.int.test.ts` | casos nuevos de la fábrica sobre un `tx` ajeno (T26) | Bajo |
| **[2026-10-06]** `tests/unit/asignaciones/authorization.test.ts`, `tests/integration/asignaciones/{batch-states,finish-auto-assign-packers}.int.test.ts` | deps nuevas, sin cambiar aserciones (`## 7`) | Bajo |
| `lib/shared/routes.ts` | `+ CANCELLED_ORDER_PARAM` (R25 ⚑) | Bajo |
| `components/shared/step-reader/step-reader.tsx` | dos props opcionales (R37 ⚑) | Medio: compartido con QC-64/QC-125 |
| `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` | posición, cadena, botón de cancelar | Medio |
| `app/(private)/asignacion/[id]/components/index.ts` | `+ OrderCancelDialog` | Bajo |
| `app/(private)/asignacion/page.tsx` | pinta la confirmación de cancelado (R25 ⚑) | Medio |
| `app/(private)/asignacion/components/index.ts` | `+ AssignedOrderCancelledNotice` | Bajo |
| `tests/guards/guard-ambito-empresa-pedidos.test.ts` | caso nuevo, **tensada** | Medio |
| `tests/unit/asignaciones/module-contract.test.ts` | `CASOS_DE_USO_QC63` crece | Bajo |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | `+ CANCELLED_ORDER_PARAM` en la lista exacta | Bajo |
| `tests/unit/asignaciones/start-assigned-order.test.ts` | deps nuevas; R9 tensado | Bajo |
| `tests/unit/asignaciones/finish-assigned-order.test.ts` | deps nuevas; R16 tensado | Bajo |
| `tests/unit/asignaciones/empacador-authorization.test.ts` | deps nuevas de `start`/`finish`, sin cambiar aserciones | Bajo |
| **[nuevo]** `tests/unit/asignaciones/start-packing.test.ts`, `finish-packing.test.ts` | deps nuevas; R41/R42/R5bis tensados con nota fechada; `already_mine` sin anotar ⚑ | Bajo |
| **[nuevo]** `tests/unit/asignaciones/order-state.test.ts` | los dos estados nuevos → `order_produced_frozen` (A2, R43) | Bajo |
| `tests/unit/asignaciones/order-execution-actions.test.ts` | acciones nuevas | Bajo |
| `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` | mock y fixture (el caso R18 no se toca) | Bajo |
| `tests/unit/recetas-ui/step-reader.test.tsx` | casos nuevos para las props | Bajo |
| `tests/integration/asignaciones/responsible-eligibility.int.test.ts`, `finished-orders.int.test.ts` | deps nuevas atadas al `tx` del test | Bajo |
| `tests/integration/aislamiento.json` | dos entradas | Bajo |
| E2E cuya limpieza borra pedidos tras abrir la pantalla (`## 7`) | borrar antes las anotaciones. **[nuevo]** Añadidas **`e2e/empaque.spec.ts`** y **`e2e/producto-terminado.spec.ts`** (A3, A6) | Bajo |
| `specs/QC-63-ejecutar-receta-operador/requirements.md` | nota fechada al pie: R10 y R18 enmendadas por QC-82 R37/R38 | Bajo |

**Sin tocar, a propósito:** `order-catalog-prisma.ts` (y `order-prisma.ts` **salvo** la fábrica de la
P5, revisión 2026-10-06), `lib/modules/pedidos/domain/order-catalog.ts`, `order-packing.ts`,
`transition-order.ts`, `order-transitions.ts`, `pedidos/ports/**`, `lib/modules/identity/**` y el seed
(R30), `lib/modules/asignaciones/domain/order-state.ts`, `get-assigned-order-execution.ts`,
`lib/modules/inventario/**`, `lib/modules/errores/**`, `app/(private)/pedidos/**`, `package.json`.

## 12. Puntos para F1.4 — no salen de la acotación

Ratificados con el spec el 2026-09-18. La revisión del 2026-09-24 **no** los reabre; anota solo lo
que el código de hoy cambia de ellos. **Ninguno está abierto**: lo que queda por decidir está todo
en `## 14.1`. _Revisión 2026-10-06: el punto 1 crece (QC-211 monta el mismo asistente en la pantalla
de empaque, que no recibe las props nuevas, R37); el 7 sigue igual —la oficina sigue cancelando sin
anotar, y la revisión diaria de bloqueados (`review-blocked-orders.ts`) tampoco anota—; el 8 crece con
el caso de T5._

1. **Enmendar QC-63 R18: `StepReader` gana dos props opcionales (R37).** _Revisión_: QC-125 ya tensó
   el test a lista cerrada con `step-reader.tsx` dentro; esta ficha no toca el test.
2. **Receta sin pasos (R5)**: `step_position` anulable solo para ese caso.
3. **Si falla anotar retomar, no se abre la pantalla (R15).**
4. **Pedido `EN_CURSO` sin anotaciones (R14)**: empieza en el paso 1.
5. **Posición anotada mayor que los pasos de hoy (R14)**: abre en el último, sin error.
6. **Confirmación visible al cancelar (R25).** _Revisión_: ahora obliga además a tocar
   `recipe-route-contract.test.ts`.
7. **Cancelaciones y entregas hechas desde la oficina no se anotan.** _Revisión_: desde QC-145 la
   oficina ya no entrega editando; solo cancela (y la caducidad diaria cancela `PENDIENTE`). Ninguna
   de las dos se anota.
8. **Tensar `guard-ambito-empresa-pedidos`.** _Revisión 09-24_: ya no es ver `db.` en `TOCA_LA_BASE`
   (ninguna función gana ese parámetro), sino el caso nuevo de `## 7`. Misma figura: la guardia
   crece, no se afloja. _Revisión 09-26_: **crece otra vez**, con el caso de `createOrderPackingRepository(tx)`.

La revisión del 2026-09-24 abrió dos preguntas **nuevas**, que el humano cerró ese mismo día:
**`D19`** (cancelar desde la pantalla libera todo el material, por el camino único) y **`D20`** (el
Empacador ejecuta, finaliza y, por `D7`, cancela lo que tenga asignado). La consulta del recorrido
irá en el dashboard del Administrador, en **QC-167**, bloqueada por esta ficha. Ninguna de las dos
la reabre la enmienda del 2026-09-26: A3 y R42 solo confirman que `D20` se cumple por el otro camino,
el de QC-168, con `empaque.modificar` en vez de `asignaciones.consultar`.

**Ratificados con el spec el 2026-09-18 los ocho puntos de arriba**, y ninguno se reabre. Lo único que
la enmienda del 2026-09-26 resolvió sin humano es lo que el código ya contestaba: qué hace el Finalizar
(A1, `POR_EMPACAR`), qué error dan los estados nuevos (A2, `order_produced_frozen`), qué permiso piden
las dos de empaque (A4, `empaque.modificar`), si los estados nuevos se pueden cancelar (A5,
`not_cancellable`) y qué espera ya la E2E de QC-168 (A6).

## 13. Riesgos

1. **Solape con QC-150 en `lib/composition/index.ts`** y en el Finalizar (`## 11`). Mitigación: el
   constructor único del ámbito; se decide el orden de merge en F2.0.
2. **Orden de las anotaciones en el mismo instante.** Dos responsables en el mismo milisegundo
   desempatan por `id`, sin significado. `[D12]` ya lo acepta.
3. **Cada petición de la página anota un retomar.** No está verificado que el prefetch del `<Link>` no
   pida el RSC; lo comprueba el E2E (abrir y recargar una vez: una sola fila de retomar).
4. **Transacciones interactivas sobre el pooler.** Ya las usan diez adaptadores y la de `pedidos` con
   `inventario`; esta es la primera que cruza **tres** módulos (`asignaciones`, `pedidos`,
   `inventario`) y la de Finalizar es la más larga. Mismos `maxWait`/`timeout` que la de `pedidos`.
5. **La posición no se valida contra la receta**: una petición forjada puede anotar 999. Al retomar se
   recorta al último paso. Se acepta por el mismo motivo que `[D9]`.
6. **`recordStepMove` comprueba `EN_CURSO` y luego escribe, sin candado.** Un avanzar que llegue en el
   mismo instante en que otro responsable finaliza puede quedar anotado justo después del
   `ENTREGADO`. Es una fila de más en un registro que `[D11]` ya declara con pérdidas; bloquear el
   pedido en cada clic costaría una transacción por Siguiente.
7. **Una unidad de trabajo unida usada fuera de una transacción** escribiría sin atomicidad. Solo la
   construye `lib/composition`, y solo dentro de `withExecutionTransaction`; lo vigila el caso nuevo
   de `guard-ambito-empresa-pedidos` (`## 7`). **[nuevo] Y lo mismo vale para
   `createOrderPackingRepository`**, que es el riesgo que A3 introduce: si se atara a `prisma` en vez
   de a `tx`, las dos anotaciones nuevas serían las **únicas** del registro que no comparten
   transacción con el cambio que describen, y R24 sería cierto para seis acciones y falso para ocho
   sin que ningún test lo notara. El caso nuevo de la guardia es lo que lo hace notar.
8. **[nuevo] El predicado de éxito se duplica si nadie lo centraliza.** Con QC-150 hay dos formas de
   éxito y con QC-168 un tercer desenlace (`already_mine`) que hay que tratar como no-exito-en-la-
   parte-de-la-transacción. Tres caminos de escritura con tres comparaciones escritas a mano es
   exactamente como se cuela un `!== 'ok'` que aborta un éxito. Un **único** predicado exportado por
   el módulo, con un test por cada forma, es lo que lo evita. _2026-10-06: la forma objeto está ahora
   en Terminar empaque, no en el Finalizar; el riesgo es el mismo y cae en T25._
9. **[2026-10-06] Terminar empaque es la escritura más larga de la ficha.** Une a la transacción de la
   ejecución el `UPDATE`, el consumo de envases, un lote por línea y la anotación, con lecturas de
   catálogo **globales** por medio (`order-packing.ts:214-234`), mientras `tx` retiene el candado del
   pedido. Es lo mismo que hoy hace dentro de `orderUnitOfWork`, con los mismos `maxWait`/`timeout`;
   lo nuevo es una sentencia más. Lo mide T19.
10. **[2026-10-06] La fábrica de la P5 duplica una transacción si se cablea mal.** Si
    `createOrderPackingRepository` recibiera el cliente global en `executionTransaction`, Comenzar
    escribiría en **otra** conexión y R24 sería falso en `pack_start` sin que ningún unitario lo viera.
    Lo cierran el caso nuevo de T5 y el caso (a) de A3 en T19.
11. **[2026-10-06] Filas de empacador huérfanas.** La compensación de `finish` es best-effort
    (`finish-assigned-order.ts:129-147`): si falla después de que falle la anotación, queda una fila
    de responsable de más sobre un pedido que sigue `EN_CURSO`. Es el mismo riesgo que ese spec ya
    aceptó para un fallo de transición; QC-82 solo le añade un disparador.
12. **[2026-10-06] La respuesta a la P3 mueve una lista cerrada.** Las dos ramas están escritas en T12;
    cambiar de idea después de T12 es tocar `module-contract` dos veces.

## 14. Preguntas abiertas, mapa de trazabilidad y recuento

### 14.1 Lo que queda abierto para F1.4 — lista única (al día el 2026-10-06)
> **F1.4 APROBADO por el humano el 2026-10-06** ("aprobado"): P1-P5 con la propuesta de cada una (P1 no anota `already_mine`; P2 `PACK_START`/`PACK_FINISH`; P3 `asignaciones.ejecutar`; P4 no se anota el recorrido de envasado; P5 `createOrderPackingRepository(db)`). Los ocho puntos de `## 12` quedan ratificados.

**Cinco puntos, todos aquí y en ningún otro sitio.** Los ocho de `## 12` están **ratificados** desde
el 2026-09-18 y no se repiten; `D19` y `D20` están **cerradas** (la segunda, enmendada por QC-201).
`requirements.md > Preguntas abiertas` resume estos cinco y remite aquí.

| | Pregunta | Propuesta recomendada | Requisitos ⚑ | Bloquea |
|---|---|---|---|---|
| **P1** | ¿Comenzar empaque con `already_mine` anota? | **No**: cero anotaciones | R41 | T19, T25 |
| **P2** | Nombre de los dos valores nuevos del enum | **`PACK_START`, `PACK_FINISH`** | R1, R5bis, R33 | **T1** |
| **P3** | Permiso de cancelar y avanzar/retroceder | **`asignaciones.ejecutar`** | R26, R27 | T8, T9, T12 |
| **P4** | ¿Se anota el recorrido de los pasos de envasado? | **No**: sigue fuera, ficha aparte si se quiere | R1, R5bis, R37 | — (si es «sí», reabre alcance) |
| **P5** | Cómo entra Comenzar empaque en la transacción | **`createOrderPackingRepository(db)`** en el adaptador de `pedidos` | R24, R42 | T13, T26 |

Detalle de cada una, con el porqué y qué cambia si el humano elige la otra:

**P1 — Cuando Comenzar empaque responde `already_mine`, ¿se anota o no?** (A3, R41) _2026-10-06: el
enunciado original nombraba también a `finishPacking`; Terminar ya no tiene `already_mine`
(`order-catalog.ts:161-171`), así que solo queda Comenzar._
- **Recomendado: cero anotaciones.** `already_mine` significa que el `UPDATE` no cambió ninguna fila.
  R24 dice que las dos escrituras de esa acción van en la misma operación o no va ninguna, y aquí no
  hubo cambio que emparejarla. D13 llama al registro «un hecho, no un intentions-log», y repetir un
  clic que no ocurrió no es un hecho.
- **Alternativa: una anotación.** El registro como bitácora de gestos: alguien intentó empaquetar algo
  ya empaquetado, y eso merece fila. El coste es real y hay que pagarlo: obliga a **exceptuar
  `already_mine` de R24**, y R24 no admite excepciones, así que habría que enmendarlo. Precedente en
  la propia ficha: `recordStepMove` ya acepta que se pierda una fila (R19, D11), así que la
  alternativa no es absurda.
- Lo que **no** cabe: anotar o no según el caso. Sería un registro cuyo significado depende de un
  detalle de implementación del `UPDATE` de QC-168.

**P2 — ¿Cómo se llaman los dos valores nuevos del enum `OrderExecutionAction`?** (A3, R1, `## 2.1`)
- **Recomendado: `PACK_START` y `PACK_FINISH`.** `PACK` va delante por la misma razón que `GO_BACK` no
  lleva prefijo: son abreviaturas, no palabras, y un verbo primero se lee. El cruce de `## 3.1` queda
  `pack_start` ↔ `PACK_START` y `pack_finish` ↔ `PACK_FINISH`, simétrico con `go_back` ↔ `GO_BACK`.
- **Alternativa: `START_PACKING` y `FINISH_PACKING`.** Literal a `startPacking` / `finishPacking` y a
  la redacción de QC-168 («comenzar empaque», «terminar empaque»). Coste: ninguno más allá de un enum
  algo más largo.
- Lo que decide es dónde caen dos literales: el `CREATE TYPE` y el tercer `CHECK` de `## 2.1`. Los dos
  cambian con la respuesta y **nada más** cambia.

**P3 — ¿Qué permiso exigen `cancelAssignedOrder` y `recordStepMove`?** (R26, R27; nueva el 2026-10-06)
- **Hecho**: `D7` (2026-09-18) dice «con `asignaciones.consultar` … mismo camino que QC-63 abrió». El
  2026-10-04 el humano cerró en QC-201 `D5` que leer, comenzar y terminar la ejecución exigen
  **`asignaciones.ejecutar`**, y `D4` que la página lo exige; está en `dev`
  (`start-assigned-order.ts:38`, `finish-assigned-order.ts:174`, `page.tsx:29`). QC-201 no habló de
  los dos casos de uso de QC-82 porque no existían.
- **Recomendado: `asignaciones.ejecutar`.** Es el permiso de la pantalla desde la que se cancela y se
  avanza, y es lo que la letra de `D7` pedía en el fondo: el mismo camino que la ejecución. Con él, el
  Empacador —que no ve el pedido (QC-201 `D8`)— no puede cancelarlo ni anotarle pasos ni forjando la
  petición. El Operador lo tiene: R30 y la E2E no cambian.
- **Alternativa: `asignaciones.consultar`, a la letra de `D7`.** Coste: dos escrituras con un permiso
  más ancho que el de abrir la pantalla (`## 10.16`), y dos entradas aparte en `module-contract`.
- Cambia: una cadena en cada caso de uso, la rama de T12 y la nota de R27.

**P4 — ¿Se anota el recorrido de los pasos de envasado?** (R1, R5bis, R37; nueva el 2026-10-06)
- **Hecho**: QC-211 monta `StepReader` en la pantalla de empaque con los pasos de envasado, y su
  alcance dice «Guardar el avance o registrar la ejecución (QC-82)» en «Lo que NO entra», con R31 «el
  sistema NO DEBE guardar el avance del empacador».
- **Recomendado: no.** R1 fija **ocho** acciones (`D1`, `D12`, QC-168 `D8`) y la posición del registro
  es la de los pasos del operador (R4); anotar avanzar/retroceder en envasado exige o acciones nuevas o
  una columna que diga de qué lista es la posición, y las dos cosas son alcance nuevo. Si se quiere, es
  una ficha propia que depende de esta.
- **Alternativa: sí.** Reabre `D1` y la tabla de R1; no se diseña aquí.

**P5 — ¿Cómo entra Comenzar empaque en la transacción de la ejecución?** (R24, R42; nueva el
2026-10-06)
- **Hecho**: `startPackingAliveOrder` abre `prisma.$transaction` sobre el cliente global
  (`order-prisma.ts:921-929`) y no acepta otro cliente; `createOrderPackingRepository` no existe. Sin
  cambiar eso, `pack_start` y el cambio a `EN_EMPAQUE` irían en dos transacciones y R24 sería falso.
- **Recomendado: `createOrderPackingRepository(db)` en `order-prisma.ts`**, que corre las mismas tres
  sentencias sobre el cliente que recibe sin abrir transacción; `startPackingAliveOrder` conserva su
  firma y pasa a abrir su transacción y delegar en ella. Mismo patrón que
  `createOrderWriteRepository(tx: PrismaLike = prisma)` (`order-prisma.ts:874`). Ningún puerto cambia.
- **Alternativa: `startPackingAlive` dentro de `OrderWriteRepository`** (`## 10.15`): más uniforme,
  más archivos y un puerto de dominio de `pedidos` cambiado.
- Es una decisión técnica, pero se sube porque toca el adaptador de otro módulo, que este spec daba por
  intocable desde el 2026-09-24.

### 14.2 Mapa `R<n> -> test previsto (tarea)` — rehecho el 2026-10-06

> El mapa del 2026-09-26 tenía las columnas descuadradas (citaba la T4, retirada, en R13, R14 y R17, y
> R39/R40 en T23/T24 en vez de en la E2E). Se rehace por **archivo de test**, que es lo que exige
> `CHECKPOINTS.md > Trazabilidad`; la tarea va entre paréntesis. Abreviaturas: `mig` =
> `tests/unit/asignaciones/schema/order-execution-entries-migration.test.ts`; `cons` =
> `tests/integration/asignaciones/order-execution-entries-constraints.int.test.ts`; `atom` =
> `tests/integration/asignaciones/execution-atomicity.int.test.ts`; `ua/` = `tests/unit/asignaciones/`;
> `ui/` = `tests/unit/asignaciones-ui/`.

| R | Test previsto (tarea) |
|---|---|
| R1 | `mig` (T1); `cons` (T2); `ua/execution-log-repository.test.ts`, mapa total de ocho (T6, T7) |
| R2 | `mig` lista exacta de columnas (T1); `ua/execution-log-repository.test.ts` tipos (T6) |
| R3 | `mig` una sola columna de tiempo (T1) |
| R4 | `mig` sin texto ni id del paso (T1); `ua/execution-log-repository.test.ts` fuente sin `update` (T7) |
| R5 | `mig` y `cons` posición ≥ 1 (T1, T2); `ua/start-assigned-order.test.ts` receta sin pasos ⇒ `null` (T10) |
| R5bis | `mig` tercer `CHECK` (T1); `cons` (T2); `ua/execution-log-repository.test.ts` tipos (T6); `ua/start-packing.test.ts`, `ua/finish-packing.test.ts` (T25); `atom` (T19) |
| R6 | `cons` pedido inexistente (T2); `mig` FK (T1) |
| R7 | `cons` empresa cruzada (T2); `mig` FK compuestas (T1) |
| R8 | `mig` (T1); `cons` (T2); `ua/execution-log-repository.test.ts` `@ts-expect-error` (T6) |
| R9 | `ua/cancel-assigned-order.test.ts` (T9); `ui/order-cancel-dialog.test.tsx` (T17) |
| R10 | `ua/cancel-assigned-order.test.ts` tope 501 (T9) |
| R11 | `ui/order-cancel-dialog.test.tsx` (T17); `ui/order-execution-step-log.test.tsx` (T16) |
| R12 | `ua/start-assigned-order.test.ts` (T10); `atom` (T19) |
| R13 | `ua/start-assigned-order.test.ts` (T10); `tests/unit/recetas-ui/step-reader.test.tsx` (T15); `ui/order-execution-step-log.test.tsx` (T16); `e2e/registro-ejecucion.spec.ts` (T20) |
| R14 | `ua/start-assigned-order.test.ts` (T10); `step-reader.test.tsx` recorte (T15) |
| R15 | `ua/start-assigned-order.test.ts` (T10) |
| R16 | `ua/start-assigned-order.test.ts` (T10); `atom` carrera (T19) |
| R17 | `ua/record-step-move.test.ts` (T8); `step-reader.test.tsx` (T15); `ui/order-execution-step-log.test.tsx` (T16) |
| R18 | `ua/record-step-move.test.ts` (T8); `step-reader.test.tsx` (T15); `ui/order-execution-step-log.test.tsx` (T16) |
| R19 | `ui/order-execution-step-log.test.tsx` (T16) |
| R20 | `ua/record-step-move.test.ts`, incluido `BLOQUEADO` (T8); `atom` (T19) |
| R21 | `ua/finish-assigned-order.test.ts` destino `POR_EMPACAR` (T11); `ui/order-execution-step-log.test.tsx` (T16) |
| R22 | `ua/cancel-assigned-order.test.ts` (T9); `ui/order-cancel-dialog.test.tsx` (T17) |
| R23 | `ua/cancel-assigned-order.test.ts` (T9); `atom` (T19) |
| R24 | `ua/start-assigned-order.test.ts` (T10); `ua/finish-assigned-order.test.ts` con compensación (T11); `ua/cancel-assigned-order.test.ts` (T9); `ua/start-packing.test.ts`, `ua/finish-packing.test.ts` (T25); `atom` (T19); `tests/integration/pedidos/order-packing.int.test.ts` fábrica sobre `tx` ajeno (T26) |
| R25 | `ui/assigned-orders-cancelled-notice.test.tsx` (T18); `ua/order-execution-actions.test.ts` redirección (T14); `e2e/registro-ejecucion.spec.ts` (T20) |
| R26 | `ua/record-step-move.test.ts` (T8); `ua/cancel-assigned-order.test.ts` (T9); `ua/start-assigned-order.test.ts`, `ua/finish-assigned-order.test.ts` (T10, T11); `ua/start-packing.test.ts`, `ua/finish-packing.test.ts` (T25); `ua/module-contract.test.ts` (T12) |
| R27 | `ua/record-step-move.test.ts` (T8); `ua/cancel-assigned-order.test.ts` (T9) |
| R28 | `ua/record-step-move.test.ts` (T8); `ua/cancel-assigned-order.test.ts` (T9) |
| R29 | `tests/unit/pedidos/order-cancellation.test.ts`, siete estados (T3); `ua/cancel-assigned-order.test.ts` (T9); `atom` liberación (T19) |
| R30 | `ua/cancel-assigned-order.test.ts` sin `pedidos.modificar` (T9); `mig` sin `INSERT` de permisos (T1) |
| R31 | `ua/execution-log-repository.test.ts` forma del puerto y fuente del adaptador (T6, T7) |
| R32 | `mig` RLS al final (T1); `cons` `relforcerowsecurity` (T2) |
| R33 | `mig` identificadores (T1) |
| R34 | `mig` `down.sql` (T1) + salida de `db:rollback` en `progress/impl_…` |
| R35 | `tests/guards/guard-dependencias-aprobadas` verde y `package.json` fuera del diff (T22) |
| R36 | `ui/order-cancel-dialog.test.tsx` (T17) |
| R37 | `step-reader.test.tsx` (T15); caso R18 de `ui/order-execution-screen.test.tsx` y `ui/packing-order-screen.test.tsx`, los dos **sin tocar** (T15, T16) |
| R38 | `ua/start-assigned-order.test.ts` R9 de QC-63 tensado (T10); nota de T21 |
| R39 | `e2e/registro-ejecucion.spec.ts` (a) (T20) |
| R40 | `e2e/registro-ejecucion.spec.ts` (b) (T20) |
| R41 | `ua/start-packing.test.ts`, `ua/finish-packing.test.ts` (T25); `atom` (T19) |
| R42 | `ua/start-packing.test.ts`, `ua/finish-packing.test.ts` (T25); `ua/module-contract.test.ts` (T12); `tests/guards/guard-ambito-empresa-pedidos.test.ts` caso nuevo (T5) |
| R43 | (a) `ua/record-step-move.test.ts` (T8); (b) `tests/unit/pedidos/order-cancellation.test.ts` y `ua/cancel-assigned-order.test.ts` (T3, T9); (c) limpieza de `e2e/empaque.spec.ts` (T23) |
| R44 | `ua/start-assigned-order.test.ts` `BLOQUEADO` y `stale`→`BLOQUEADO` (T10); `atom` cero filas (T19) |

### 14.3 Recuento

- **Requisitos: 44** numerados (`R1`–`R44`) **más `R5bis`** = **45**. `R41`–`R43` son del 2026-09-26;
  **`R44` es nuevo** del 2026-10-06. Ajustados el 2026-10-06: R5bis, R20, R24, R26, R27, R29, R37, R41
  y R42.
- **Decisiones cerradas: 20** (`D1`–`D20`), **ninguna reabierta** y **ninguna nueva**. Enmendadas por
  decisión ajena: `D1` (QC-168 `D8`), `D20` (QC-201 `D2`/`D5`/`D8`) y, en el permiso de los tres casos
  de uso que ya existían, `D7` (QC-201 `D5`).
- **Preguntas abiertas: 5** (P1–P5 de `## 14.1`). Eran 0 el 2026-09-24 y 2 el 2026-09-26.
- **Tareas: `T1`–`T26`**, con **`T4` retirada** (2026-09-24), `T25` del 2026-09-26 y **`T26` nueva**
  del 2026-10-06: **25 activas**.
- **Alternativas descartadas: 17** (10.1–10.14, más **10.15**, **10.16** y **10.17** de esta revisión).
- **Guardias y listas cerradas que se tensan: 6** (`guard-ambito-empresa-pedidos`,
  `module-contract` de `asignaciones`, `guard-arquitectura-modulos`,
  `empacador-authorization`, `start`/`finish-assigned-order` y
  `recipe-route-contract`). **Ninguna se afloja.**
