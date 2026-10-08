# QC-167 — bitácora de implementación (F2.1)

Base de la feature: `QuimiCloude_QC167` (`.env` del worktree, migrada y sembrada el 2026-10-07).
Sin migraciones nuevas. Los `.int` corren en base efímera (`docs/verification.md`).

## Tanda 1 — T1, T2, T3, T4 (2026-10-08)

La sesión del 2026-10-07 se cortó con el código de producción escrito y sin commitear. La
tanda se retomó y se terminó: dobles, tests unitarios y los `.int`.

### Archivos

Producción:
- `lib/modules/pedidos/domain/order-number.ts` (`orderNumberContains`)
- `lib/modules/pedidos/domain/order-catalog.ts` (`OrderHistorySummary`, método en `OrderCatalog`)
- `lib/modules/pedidos/domain/list-order-summaries.ts` (`createListSummariesByIdsIncludingDeleted`)
- `lib/modules/pedidos/ports/order-summary-reader.ts` (dos lecturas nuevas)
- `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`
- `lib/modules/pedidos/index.ts` (solo añadidos)
- `lib/composition/index.ts` (solo añadidos)
- `lib/modules/asignaciones/domain/execution-entry.ts` (`ExecutionEntryRecord`)
- `lib/modules/asignaciones/domain/execution-trace.ts` (nuevo, `buildExecutionTrace`)
- `lib/modules/asignaciones/ports/execution-log-repository.ts` (tres lecturas)
- `lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma.ts` (mapa inverso derivado)

Tests nuevos:
- `tests/unit/pedidos/order-number-contains.test.ts`
- `tests/unit/pedidos/list-summaries-including-deleted.test.ts`
- `tests/integration/pedidos/order-catalog-including-deleted.int.test.ts`
- `tests/unit/asignaciones/execution-trace.test.ts`
- `tests/integration/asignaciones/execution-log-read.int.test.ts`

Tests enmendados o ajustados:
- `tests/guards/guard-ambito-empresa-pedidos.test.ts` (fila en `METODOS_DELEGADOS_EN_DOMINIO`)
- `tests/integration/aislamiento.json` (dos entradas `transaccion`)
- `tests/unit/asignaciones/execution-log-prisma.test.ts` (T4a; el caso «solo create y findFirst»
  enmendado con nota fechada a «create y tres de lectura»)
- dobles del puerto del registro: `execution-log-repository`, `finish-assigned-order`,
  `record-step-move`, `start-assigned-order` (`.test.ts`)
- dobles de `OrderCatalog`: eran **nueve**, no cuatro como dice el design: `tests/helpers/order-summaries.ts`,
  `use-case-fixture.ts`, `company-orders.int`, `finished-orders.int`, `responsible-eligibility.int`,
  `batch-states.int`, `assigned-orders.int`, `pedidos/finish-with-finished-goods.int`,
  `unit/asignaciones/assign-responsibles.test.ts`

### Desvíos y notas para el reviewer

- **T4(b), otra empresa con la misma persona o pedido:** esas filas no pueden existir, porque las
  FK compuestas de `order_execution_entries` las rechazan (23503, ya lo afirma
  `order-execution-entries-constraints.int.test.ts`). En su lugar se prueba que la empresa B tiene
  anotaciones propias y que pedir con B el pedido o la persona de A (o al revés) devuelve vacío.
  Conviene que el humano lo dé por bueno o corrija el texto de T4(b).
- **Dados de baja en el `.int` de T2:** el CHECK `orders_delivered_not_deleted` impide dar de baja
  un pedido ENTREGADO, CANCELADO, POR_EMPACAR o EN_EMPAQUE. Las bajas sembradas son `EN_CURSO`.
  R9 se prueba con dos consultas: solo CANCELADO, y solo EN_CURSO (esta trae también el dado de baja).
- En `execution-trace.test.ts`, el caso de personas en orden de aparición lleva la etiqueta R2.
- El mapa ida y vuelta de las acciones está etiquetado R14 en `execution-log-prisma.test.ts`.

### Mapa R<n> → test (tanda 1)

| R | Archivo | Caso |
|---|---|---|
| R1 | `tests/integration/pedidos/order-catalog-including-deleted.int.test.ts` | «R1, R18: incluye el pedido dado de baja con `deleted: true` y el vivo con `deleted: false`»; «R1: `listAliveSummariesByIds` sigue excluyendo el dado de baja…» |
| R1, R4 | `tests/unit/pedidos/list-summaries-including-deleted.test.ts` | «R1, R4: sin filtro no consulta los numeros…»; «R1: un filtro presente pero sin `numberContains` se trata como ausente» |
| R3 | `tests/unit/asignaciones/execution-trace.test.ts` | «R3: %s es open y cuenta hasta now…»; «R3: dado de baja con estado EN_CURSO es unclosed, no open» |
| R4 | `order-catalog-including-deleted.int.test.ts` | «R4: ordena por numero descendente (anio y secuencia) y es estable entre paginas» |
| R6 | `tests/unit/pedidos/order-number-contains.test.ts` | 10 casos «R6: …», uno por ejemplo de T1 (incluye `-`/`--`, D15) |
| R6, R10 | `list-summaries-including-deleted.test.ts` | «R6, R10: con `numberContains` filtra con `orderNumberContains`…»; «R6: si no casa ninguno, pasa la lista vacia…» |
| R6 | `order-catalog-including-deleted.int.test.ts` | «R6: `42` encuentra `-0000042` y `-0000142` (tambien dado de baja) y no `-0000043`» |
| R7 | `tests/integration/asignaciones/execution-log-read.int.test.ts` | «R7: el filtro de persona deja solo los pedidos con alguna anotacion suya»; «R7: las personas con alguna anotacion en la empresa…incluida una dada de baja» |
| R7, R8 | `tests/unit/asignaciones/execution-log-prisma.test.ts` | «R7 / R8: listExecutedOrderIds lleva la persona y el rango gte / lt en el where» |
| R8 | `execution-log-read.int.test.ts` | «R8: el rango es gte inclusivo y lt exclusivo»; «R8: un extremo ausente no acota por ese lado» |
| R9 | `order-catalog-including-deleted.int.test.ts` | «R9: respeta `statuses`…» |
| R10 | `order-catalog-including-deleted.int.test.ts` | «R10: estado y numero se combinan, y `total` y las paginas cuentan solo lo filtrado» |
| R14 | `execution-trace.test.ts` | «R14: cada anotacion salvo la ultima lleva el tramo…» |
| R14 | `execution-log-read.int.test.ts` | «R14: devuelve las anotaciones ordenadas por pedido, instante e id…» |
| R15 | `execution-trace.test.ts` | «R15: ENTREGADO con ultima pack_finish es closed…»; «R15: CANCELADO sin cancel anotado es unclosed…»; «R15: ENTREGADO sin pack_finish es unclosed»; «R15: una sola anotacion…ms 0»; «R15: FINAL_STATUSES es exactamente…»; «R15: el resultado tiene una sola `duration`…» |
| R16 | `execution-trace.test.ts` | «R16: cada go_back queda marcado y goBackCount los cuenta» |
| R18 | `order-catalog-including-deleted.int.test.ts` | «R1, R18: incluye el pedido dado de baja…» |
| R22 | `tests/unit/asignaciones/execution-log-repository.test.ts` | «R31 / R22: el puerto no declara nada que modifique ni borre una anotacion» |
| R22 | `execution-log-prisma.test.ts` | «R31 / R22: las unicas operaciones sobre orderExecutionEntry son create y tres de lectura» |
| R23 | `execution-log-read.int.test.ts` | «R23: la persona de otra empresa con la empresa propia no devuelve nada, ni al reves»; «R23: el pedido de otra empresa no vuelve aunque su id venga en la lista»; «R23: las personas de otra empresa no salen» |
| R23, R24 | `list-summaries-including-deleted.test.ts` | «R23, R24: la empresa llega a las dos lecturas como primer argumento…» |
| R23, R24 | `order-catalog-including-deleted.int.test.ts` | «R23, R24: no devuelve pedidos de otra empresa, vivos ni dados de baja…» |

Lo que falta (R2, R5, R11–R13, R17, R19–R21, R25–R29, y los casos de uso de R24) llega en T5–T15.

### Salida de los tests

- `pnpm run typecheck`: sin errores (exit 0, lo corrió también el implementer).
- `pnpm run lint`: `✖ 8 problems (0 errors, 8 warnings)`, todos en archivos ajenos.
- Unit tocados de asignaciones: `Test Files 6 passed (6)`, `Tests 215 passed (215)`.
- Unit nuevos de pedidos: `Test Files 2 passed (2)`, `Tests 16 passed (16)`.
- `pnpm exec vitest run guard`: `Test Files 52 passed (52)`, `Tests 711 passed | 11 skipped (722)`.
- `.int` nuevos:
  - `execution-log-read`: `Tests 10 passed (10)`.
  - `order-catalog-including-deleted` + `order-catalog-company-summary`: `Test Files 2 passed (2)`, `Tests 16 passed (16)`.
- `.int` con dobles enmendados, corridos por el implementer: `use-case-fixture`, `company-orders`,
  `finished-orders`, `responsible-eligibility`, `assigned-orders` y `pedidos/finish-with-finished-goods`
  dan `Test Files 5 passed (5)`, `Tests 44 passed (44)`. `batch-states` da `Test Files 1 passed (1)`,
  `Tests 4 passed (4)`.
- `vitest related --run --project node --project ui`: `Test Files 5 failed | 272 passed (277)`,
  `Tests 7 failed | 4602 passed | 1 skipped (4610)`. Los 7 rojos son de UI, en archivos que esta
  tanda no toca: unidades-viewport, usuarios-viewport, product-page, pantallas-exigen-permiso y
  recipe-page. Los cinco están en `tests/baseline-rojos.json` y siguen rojos al correrlos solos.

## Tanda 2: T5, T6 y T7 (2026-10-08)

Antes de empezar, el leader mergeó `origin/dev` (346fa669). Ese merge trae QC-82 y QC-156.
- Se aplicó a `QuimiCloude_QC167` la migración nueva (`migrate deploy`) y se corrió `prisma generate`.
- Se corrió `pnpm install --frozen-lockfile`, porque dev trae `nodemailer` en el lockfile. No es una
  dependencia nueva de esta rama.

### Archivos

Producción:
- `lib/modules/asignaciones/domain/list-execution-traces.ts` (nuevo)
- `lib/modules/asignaciones/domain/get-execution-trace.ts` (nuevo)
- `lib/modules/asignaciones/adapters/driving/execution-trace-actions.ts` (nuevo, `'use server'`):
  `listExecutionTracesAction` y `getExecutionTraceAction`
- `lib/composition/index.ts` (+12, solo añadidos)
- `lib/modules/asignaciones/index.ts` (+20, bloque nuevo al final)

Tests:
- `tests/unit/asignaciones/list-execution-traces.test.ts` (nuevo)
- `tests/unit/asignaciones/get-execution-trace.test.ts` (nuevo)
- `tests/unit/asignaciones/execution-trace-actions.test.ts` (nuevo)
- `tests/unit/identity/session-once-per-request-actions.test.ts` (+10, fila de `getExecutionTraceAction`)
- `tests/integration/pedidos/order-catalog-including-deleted.int.test.ts` (+1, `customerId: null`).
  Con QC-156, `NewOrder.customerId` es obligatorio y sin esa línea el typecheck sale rojo.

### Desvíos y notas para el reviewer

- **Tipo del detalle:** el design (3.6 y 3.8) lo llama `ExecutionTrace`, pero ese nombre ya es el tipo
  de retorno de `buildExecutionTrace` (T3). La salida del detalle se llama `ExecutionTraceDetail`, y
  sus pasos `ExecutionTraceDetailStep`: `TraceStep` más `userDisplayName`.
- **Entrada del detalle:** el caso de uso recibe `{ orderId }` con `strictObject`. Un id mal formado o
  una clave de más dan el mismo `OrderNotFoundError`.
- **Detalles que el spec no fija:**
  - `pageSize` vale 10 si no llega y `cancelledOnly` vale `false`.
  - Las fechas son `YYYY-MM-DD` que existan en el calendario: `2026-02-30` da `ValidationError`.
  - Las opciones de persona salen por nombre y luego por id.
  - Una persona que el directorio no devuelve se omite en la fila y sale con nombre `null` en el detalle.
- **Pedido de la página sin anotaciones** (posible si una purga borra entre las dos lecturas): se omite
  de la página, pero el `total` sigue siendo el de `pedidos`.
- **Consultas:** las opciones de persona y la página se piden en paralelo. Son 6 como mucho por página,
  ninguna por fila.

### Mapa R<n> → test (tanda 2)

| R | Archivo | Caso |
|---|---|---|
| R1 | `tests/unit/asignaciones/list-execution-traces.test.ts` | «R1: sin ningun pedido ejecutado, pagina vacia sin preguntar a pedidos»; «R1: el total y la paginacion son los de pedidos»; «R1: las consultas por pagina son constantes, no una por fila» |
| R1, R24 | `list-execution-traces.test.ts` | «R1 R24: la pagina la pide a listSummariesByIdsIncludingDeleted con los ids del registro» |
| R1, R2, R3 | `list-execution-traces.test.ts` | «R1 R2 R3: un pedido dado de baja sale marcado y su duracion no es abierta» |
| R2, R15 | `list-execution-traces.test.ts` | «R2 R15: la fila lleva una sola duracion, la misma que da buildExecutionTrace» |
| R3 | `list-execution-traces.test.ts` | «R3: un pedido activo sale con la duracion abierta hasta el instante de la consulta» |
| R4 | `list-execution-traces.test.ts` | «R4: las filas salen en el orden en que pedidos pagina, sin reordenar» |
| R5 | `list-execution-traces.test.ts` | «R5: %s es ValidationError sin tocar ningun puerto» (7 casos); «R5: sin pagina ni tamano, pide la pagina 1 de 10»; «R5: la pagina 3 de 25 llega tal cual a pedidos» |
| R6 | `list-execution-traces.test.ts` | «R6: un texto con letras no es invalido, llega tal cual como numberContains»; «R6: los espacios de los extremos se quitan antes de mandarlo»; «R6: un texto vacio tras quitar espacios es filtro ausente y no se manda» |
| R7 | `list-execution-traces.test.ts` | «R7: el filtro de persona llega al registro»; «R7: las opciones de persona incluyen a las dadas de baja, por nombre» |
| R8 | `list-execution-traces.test.ts` | «R8: el rango va de las 00:00Z de «desde» inclusivo al dia siguiente a «hasta» exclusivo»; «R8: un extremo vacio no acota por ese lado»; «R8: sin rango ni persona, el registro no recibe ningun filtro» |
| R9 | `list-execution-traces.test.ts` | «R9: «solo cancelados» pide solo CANCELADO»; «R9: sin «solo cancelados» pide todos los estados» |
| R10 | `list-execution-traces.test.ts` | «R10: todos los filtros viajan a la vez, cada uno a su puerto» |
| R12, R18 | `tests/unit/asignaciones/get-execution-trace.test.ts` | «R12 R18: pide a pedidos el pedido en cualquier estado, incluidos los dados de baja» |
| R13 | `get-execution-trace.test.ts` | «R13: las anotaciones en orden, con persona, posicion y motivo, y el numero y estado del pedido»; «R13: una persona que el directorio ya no devuelve sale sin nombre, no rompe el recorrido» |
| R15 | `get-execution-trace.test.ts` | «R15: la duracion del detalle es la misma cifra que la de la fila de la lista»; «R15: con la ultima anotacion de cierre y el pedido cancelado, la duracion es cerrada» |
| R18 | `get-execution-trace.test.ts` | «R18: id mal formado, pedido inexistente o de otra empresa y pedido sin anotaciones dan el mismo error»; «R18: una entrada con claves de mas tambien es el mismo 404»; «R18: un pedido dado de baja con anotaciones no es 404, abre su recorrido marcado» |
| R18 | `tests/unit/asignaciones/execution-trace-actions.test.ts` | «R18: sin recorrido, el error sale como `order_not_found` para que la pagina responda 404» |
| R19 | `list-execution-traces.test.ts` y `get-execution-trace.test.ts` | «R19: un actor %s se rechaza sin llamar a ningun puerto» (null, undefined, sin permisos, `[]`, catálogo menos `dashboard.consultar`); «R19: con dashboard.consultar solo, …» |
| R19 | `execution-trace-actions.test.ts` | «R19: pasa el actor de la sesion, la entrada tal cual y un instante puesto por la accion»; «R19: un actor sin el permiso llega igual al caso de uso: la accion no comprueba permisos»; «R19: el rechazo de autorizacion lo da el caso de uso y la accion lo traduce» |
| R19 | `tests/unit/identity/session-once-per-request-actions.test.ts` | fila `getExecutionTraceAction` en `ACCIONES` |
| R23 | `list-execution-traces.test.ts` | «R23: todas las llamadas llevan la empresa del actor»; «R23: una entrada con companyId se rechaza y no toca ningun puerto» |
| R23 | `get-execution-trace.test.ts` | «R23: todas las llamadas llevan la empresa del actor» |
| R24 | `execution-trace-actions.test.ts` | «R24: pide el recorrido al caso de uso del modulo con el id y un instante de la accion»; guardias y `module-contract` verdes |

### Salida de los tests

- `pnpm run typecheck`: exit 0 (lo corrió el implementer después del `pnpm install`).
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`. Los avisos están en archivos ajenos
  (`confirm-catalog-import.test`, `order-service.test`).
- Implementer, los tres tests nuevos más `session-once-per-request-actions`, en dos corridas
  (`session-once-per-request-actions` solo, tras el `pnpm install`):
  - tres tests nuevos: `Test Files 3 passed (3)`, `Tests 60 passed (60)`;
  - `session-once-per-request-actions`: `Test Files 1 passed (1)`, `Tests 66 passed (66)`.
- Dev, los tres tests nuevos más `session-once-per-request-actions`, `module-contract` y
  `execution-trace`: `Test Files 6 passed (6)`, `Tests 188 passed (188)`.
- `pnpm exec vitest run guard`: `Test Files 55 passed (55)`, `Tests 741 passed | 11 skipped (752)`.
- `.int` `order-catalog-including-deleted` tras añadir `customerId`: `Test Files 1 passed (1)`, `Tests 7 passed (7)`.

## Tanda 3: T8, T9, T10 y T11 (+ T12) (2026-10-08)

Antes de empezar, el texto de T4(b) en `tasks.md` se cambió por la prueba equivalente que aceptó el
humano (opción A). El test no se tocó.

T8-T11 cambian la firma de `DashboardContent` (recibe `params`) y añaden la pantalla privada 21. Con
eso, sin T12 la rama quedaba con typecheck rojo (TS2554 en `dashboard-page.test.tsx` y
`pantallas-exigen-permiso.test.tsx`) y con `guard-pantallas-exigen-permiso` rojo. Por eso T12 entra
en esta tanda; ver más abajo.

### Archivos

Producción:
- `lib/shared/routes.ts` (`executionTraceRoute`)
- `app/(private)/dashboard/page.tsx` (`searchParams`)
- `app/(private)/dashboard/components/dashboard-content.tsx` (`params`, `<Suspense>`)
- `app/(private)/dashboard/components/index.ts`
- nuevos en `app/(private)/dashboard/components/`:
  - `execution-trace-list-params.ts`
  - `execution-trace-format.ts`
  - `execution-trace-columns.tsx`
  - `execution-trace-table.tsx`
  - `execution-trace-list-section.tsx`
- nuevos: `app/(private)/dashboard/recorrido/[id]/page.tsx` y
  `recorrido/[id]/components/{execution-trace-detail.tsx,index.ts}`

Tests nuevos:
- `tests/unit/dashboard/execution-trace-list-params.test.ts` (params)
- `tests/unit/dashboard/execution-trace-format.test.ts` (format)
- `tests/ui/dashboard/execution-trace-table.test.tsx` (table)
- `tests/ui/dashboard/execution-trace-detail.test.tsx` (detail)

### Desvíos y notas para el reviewer

- **Marca «En curso» (R3):** sigue el design. «En curso» es la etiqueta de estado de `EN_CURSO`, y
  toda duración abierta lleva el sufijo «(en curso)». Un pedido activo en `POR_EMPACAR` o
  `EN_EMPAQUE` solo se marca por ese sufijo. **Decisión para el humano:** si R3 pide una marca
  explícita en todo pedido activo, esto cambia.
- **Filtro de persona:** el `select` del `DataTable` compartido permite marcar varias personas, pero
  el caso de uso acepta una. Cuenta solo la última marcada, que sustituye a la anterior.
- **Formatos que el spec no fija:**
  - «12 min 05 s»: los segundos van a dos cifras cuando hay minutos y no hay horas.
  - El tramo del detalle usa el mismo formato, sin sufijo.
  - Una persona que el directorio no devuelve se pinta «—», con nombre accesible «Sin dato».
- **«Volver» sin parámetros:** lleva a `/dashboard?page=1&pageSize=10`, que es lo que da
  `build(parse({}))`.
- **Errores del detalle:** `order_not_found` llama a `notFound()`. Cualquier otro error pinta un
  aviso con el enlace de volver.
- **Barril de otra ruta:** el detalle importa los formateadores y `DeletedOrderMark` del barril del
  dashboard. El design ya anota el riesgo: no hay precedente de una ruta que importe el barril de
  otra. Si el reviewer lo rechaza, se sube a `lib/shared/ui/`.
- **Validación del uuid:** se hace con `zod`, que ya era dependencia, como en el backend.

### Mapa R<n> → test (tanda 3)

| R | Archivo | Caso |
|---|---|---|
| R1 | table | «R1 - con datos, monta la tabla…»; «R1 - un error de la accion se avisa dentro del area…» |
| R2 | table | «R2 - numero, estado, personas…»; «R2 - la fila dada de baja lleva el texto «Dado de baja»…» |
| R3 | table | «R3 - la fila activa se marca «En curso»…» |
| R3 | format | «R3 - una duracion abierta se marca (en curso)» |
| R4 | table | «R4 - ninguna columna ofrece ordenar…» |
| R5 | params | «R5 - …» (7 casos) |
| R5 | table | «R5 - cambiar el tamano a 25…» |
| R6 | params | «R6 - …» (4 casos) |
| R6 | table | «R6 - buscar un numero navega con q y page 1» |
| R7 | params | «R7 - …» |
| R7 | table | «R7 - el filtro de persona ofrece las personas del servidor…» |
| R8 | params | «R8 - …» |
| R8 | table | «R8 - el rango de fechas navega…» |
| R9 | params | «R9 - …» |
| R9 | table | «R9 - el interruptor «solo cancelados»…» |
| R11 | params | «R11 - …» (7 casos) |
| R11 | table | «R11 - paginar conserva los filtros» |
| R12 | table | «R12 - el enlace es executionTraceRoute(id)…» |
| R12 | detail | «R12 - pide el recorrido del id de la ruta…» |
| R12 | params | «R12 - executionTraceRoute…» |
| R13 | detail | «R13 - resumen…»; «R13 - todas las anotaciones en orden…» |
| R13 | format | «R13 - …» |
| R14 | detail | «R14 - cada anotacion salvo la ultima…» |
| R15 | format | «R15 - …» |
| R15 | table | «R15 - una sola cifra por fila…» |
| R15 | detail | «R15 - una sola duracion…» |
| R16 | detail | «R16 - cada retroceder se marca…» |
| R16 | table | «R16 - las vueltas atras…» |
| R17 | params | «R17 - …» |
| R17 | detail | «R17 - con la consulta del detalle…»; «R17 - sin parametros…» |
| R18 | detail | «R18 - order_not_found responde 404»; «R18 - un pedido dado de baja…» |
| R20 (página del detalle) | detail | «R20 - exige dashboard.consultar…»; «R20 - sin permiso…»; «R20 - la primera linea…» |
| R26 | table | «R26 - el interruptor…»; «R26 - el enlace de cada fila…» |
| R26 | detail | «R26 - «Volver» mide 44x44…» |

### Salida de los tests (T8-T11, antes de T12)

- `pnpm run typecheck`: 2 errores TS2554, los dos en tests que enmienda T12.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`, todos ajenos.
- Los 4 tests nuevos: `Test Files 4 passed (4)`, `Tests 98 passed (98)`.
- `pnpm exec vitest run guard`: `Test Files 1 failed | 54 passed (55)`. El rojo es
  `guard-pantallas-exigen-permiso` (pantalla 21) y lo arregla T12.

### T12, dentro de la tanda 3 (2026-10-08)

Solo tests, sin código de producción. Cada enmienda lleva nota fechada 2026-10-08.

### Archivos modificados

- `tests/unit/dashboard-page.test.tsx`: el caso R3 «área vacía» pasa a «R25: el area de contenido
  contiene la lista del recorrido y nada mas». Afirma un solo hijo, que es la sección; que el texto
  del área es el de la sección; que ningún rol de contenido queda fuera de ella; y que la sección
  recibe `parseExecutionTraceListParams(searchParams)`. R12 pasa a «un hijo a los dos anchos».
  La sección se simula con su `data-testid` y su título reales, y la acción se mockea porque el
  mock de `@/lib/composition` no trae `observabilidad`. R1, R2, R4 y R5 siguen igual; solo cambia
  la forma de invocar la página, que ahora recibe `searchParams`.
- `tests/unit/dashboard-route-contract.test.ts`: R6, R7, R8, R9, R10 y R11 siguen sobre
  `page.tsx` + `dashboard-content.tsx`. La guardia `100vh`/`hover` ahora mira también la sección,
  la tabla, la página del detalle y su componente. Caso nuevo «R20: la pagina del detalle vive en
  la ruta que declara executionTraceRoute», con la ruta sacada de `executionTraceRoute('[id]')`.
- `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`: el dashboard se invoca con
  `searchParams` espía y pasa a `leeAlgo: true`. Fila nueva para `/dashboard/recorrido/[id]`
  (espías en `params` y `searchParams`). `listExecutionTracesAction` y `getExecutionTraceAction`
  se espían igual que las demás acciones.
- `tests/guards/guard-pantallas-exigen-permiso.test.ts`: de veinte a veintiuna pantallas, con
  `/dashboard/recorrido/[id]`.

### Mapa R<n> → test (T12)

| R | Archivo | Caso |
|---|---|---|
| R20 | `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` | `'/dashboard' …` y `'/dashboard/recorrido/[id]' …` en los cuatro `it.each`: 404 sin permiso, 404 sin permisos, sirve con permiso, login sin sesión |
| R20 | `tests/guards/guard-pantallas-exigen-permiso.test.ts` | «el barrido encuentra exactamente las veintiuna pantallas privadas de hoy»; «cada pantalla privada llama a requirePagePermission…» |
| R20 | `tests/unit/dashboard-route-contract.test.ts` | «R20: la pagina del detalle vive en la ruta que declara executionTraceRoute»; «la pagina exige dashboard.consultar…» |
| R25 | `tests/unit/dashboard-page.test.tsx` | «R25: el area de contenido contiene la lista del recorrido y nada mas»; «R12: renderiza titulo y un hijo en el area…»; R2 y R4 sin cambios |
| R25 | `tests/unit/dashboard-route-contract.test.ts` | «la pantalla no consulta datos…» (R6); «…se renderizan en servidor» (R7); «la pantalla no valida sesion…» (R8); «no usa 100vh ni hover…» (ampliado) |

### Salida de los tests

- `pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`, todos en archivos ajenos
  (`confirm-catalog-import.test.ts`, `order-service.test.ts`).
- Los 4 archivos: `Test Files 1 failed | 3 passed (4)`, `Tests 1 failed | 71 passed (72)`. El único
  rojo es «'/pedidos' se sirve con el permiso», que ya está en `tests/baseline-rojos.json` y no es
  de esta feature.
- `pnpm exec vitest run guard`: `Test Files 55 passed (55)`, `Tests 741 passed | 11 skipped (752)`.

Veredicto T12: los cuatro verdes salvo el rojo de baseline de `/pedidos`, y no se quitó ninguna
aserción de R2/R4/R6/R7/R8.
