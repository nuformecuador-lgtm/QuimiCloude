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
