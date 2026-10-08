# impl QC-215 — estados-de-acondicionamiento

Fase F2.1. Spec aprobado el 2026-10-07. Worktree `.worktrees/QC-215-estados-de-acondicionamiento`.

## Plan de orden (restricción del humano: colisiones al final)

QC-215 choca en archivos con QC-82 y QC-156 (lista del leader, salida de
`scripts/archivos-en-vuelo.mjs --candidata QC-215`). Regla de reparto: cada tanda cierra con
`./init.sh` en verde, así que un cambio de producción va en la fase de los tests que rompe o
que lo cubren. Los archivos en colisión se tocan en la fase A solo si sin ellos no compila o el
gate se pone rojo, con el cambio mínimo y anotado en «Excepciones».

### Fase A — sin colisión

- **A1 · Base de datos y enum (T1, T2, T3, T15 BD, parte de T4/T11/T12/T13).**
  - Migraciones M1 `<ts>_order_conditioning_states` y M2 `<ts+1>_order_terminated_finished_index`
    con su `down.sql` (archivos nuevos).
  - `order-classification.ts`: valores y flujo (R1, R2).
  - Los `Record<OrderStatus, …>` que el `typecheck` exige: `order-transitions.ts` (filas nuevas;
    **provisional**: conserva `EN_EMPAQUE → ENTREGADO` hasta C1, porque quitarlo rompe Terminar el
    empaque, que es colisión), `order-state.ts`, `company-orders-columns.tsx`,
    `order-status-badge.tsx`.
  - Tests nuevos: T2 (`order-conditioning-states-migration.test.ts`) y T3 (dos `.int` nuevos).
- **A2 · Dominio sin colisión.**
  - Puerto `order-conditioning-repository.ts` y dominio `order-conditioning.ts` + su test unitario
    (parte de T7; el adaptador, el catálogo y el cableado van en C1).
  - T8 parte: `error-codes.ts`, `error-catalog.ts`, `catalogo.test.ts` (`errors.ts` va en C2).
  - T5 producción: `transition-order.ts` (R4), `delete-order.ts` (R19) (sus tests, en C2).
- **A3 · UI y listados sin colisión.**
  - T12: `assignment-view-params.ts` + tests de columnas, params y `list-company-orders`.
  - T16 parte: `isExactlyDelivered`, `company-orders-skeleton.tsx`, `resolveOrdering`.
  - T14: `packed-order-notice.tsx` + test.
  - T11 tests sin colisión: `list-packing-orders`, `get-packing-order`, `expire-stale-orders`.
  - `tests/guards/guard-pantalla-pedidos-se-amplia.test.ts` si lo exige.

### Fase C — colisión (al final, una tanda y un commit por bloque)

- **C1 · Núcleo de pedidos (T4 final, T6, T7 resto).** `ALLOWED` exacto de R3,
  `order-packing.ts`, `order-prisma.ts` (`finishPackingAliveOrder`, `setAliveOrderStatus`,
  adaptadores de acondicionamiento), `order-catalog.ts`, `pedidos/index.ts`,
  `lib/composition/index.ts` (`orderCatalog`), `asignaciones/domain/finish-packing.ts` si hace falta.
  Tests: `module-contract`, `order-packing` (unit + int), `order-finished-at.int`,
  `finish-with-finished-goods.int`, `order-conditioning.int` (nuevo).
- **C2 · Casos de uso de `asignaciones` (T8 resto, T9, T10, T11 resto, T5 tests, T17).**
  `asignaciones/domain/errors.ts`, `start-/finish-conditioning.ts`, `asignaciones/index.ts`,
  cableado en `lib/composition/index.ts`, `acondicionamiento-rol.test.ts`. Tests: `order-state`,
  `start-/finish-assigned-order`, `start-/finish-packing`, `transition-/delete-/cancel-/update-order`.
- **C3 · «Terminados» y pantalla de pedidos (T16 resto, T13 tests).** `list-finished-orders.ts`
  + su test + `finished-orders.int`; `order-columns.test.tsx`, `order-row-actions.test.tsx`.
- **C4 · E2E (T18)** y cierre (T19).

## Excepciones de colisión tomadas en la fase A

- A1 · `db/schema.prisma`: 3 valores del enum + `conditionedBy` y su `@@index`. Nada más.
- A1 · `tests/guards/guard-identificador-de-request.test.ts`: alta de M1 y M2.
- A1 · `tests/integration/aislamiento.json`: alta de los dos `.int` nuevos.
- A1 · `order-row-actions.tsx`: los 3 estados en los dos `Record` (lo exige el typecheck).
- A1 · `tests/unit/pedidos/module-contract.test.ts`: los 3 estados al final de la lista literal del
  enum (3 líneas). Motivo: el cambio de enum de A1 lo ponía rojo y la tanda debe cerrar en verde.
- A1 · `tests/unit/pedidos-ui/order-row-actions.test.tsx`: los 3 estados en la lista literal de
  finales (R22). Mismo motivo. El nombre del caso aún dice «exactamente ENTREGADO, CANCELADO,
  POR_EMPACAR y EN_EMPAQUE»: se corrige en C3.
- A2 · `tests/unit/pedidos/module-contract.test.ts`: alta de `order-conditioning.ts` en la lista
  literal de consumidores de `assertTransition` (1 línea). Motivo: el design exige que el dominio
  nuevo llame a `assertTransition` y el caso queda rojo sin el alta.

## Tandas

### A1 — BD, enum y Records (2026-10-07)

- Migraciones: `20261007120000_order_conditioning_states`, `20261007120100_order_terminated_finished_index`.
- Producción: `order-classification.ts`, `order-transitions.ts` (conserva `EN_EMPAQUE → ENTREGADO`
  hasta C1), `order-state.ts`, `company-orders-columns.tsx`, `order-status-badge.tsx`
  (TERMINADO = `secondary`, como ENTREGADO), `order-row-actions.tsx`.
- Tests nuevos: `order-conditioning-states-migration.test.ts`, `order-conditioning-constraints.int.test.ts`,
  `order-conditioning-states-rollback.int.test.ts`.
- Tests ajustados (sin colisión): `order-transitions.test.ts`, `pedidos-schema.test.ts`,
  `order-status-blocked-migration.test.ts`, `order-status-blocked-rollback.int.test.ts`,
  `list-company-orders.test.ts`, `list-order-responsibles.test.ts`.
- R → test: R1, R2, R3 (pares nuevos) → `order-transitions.test.ts`; R20 (consulta) →
  `list-order-responsibles.test.ts`; R24, R25, R26, R30 (BD) → `order-conditioning-constraints.int`
  + estático; R27 → `order-conditioning-states-rollback.int` + estático; R28 (sin filtro) →
  `list-company-orders.test.ts`. R3 «EN_EMPAQUE → ENTREGADO prohibido» queda para C1.
- Verificación: typecheck verde; lint 0 errores (8 warnings ajenos); guardias 52/52;
  `.int` (5 archivos de pedidos) 25/25; `vitest related` 9 casos rojos: 7 en 5 archivos de baseline
  y 2 de colisión (`module-contract`, `order-row-actions.test.tsx`).
- Tras las dos excepciones de arriba: `module-contract.test.ts` 9/9, `order-row-actions.test.tsx` 20/20.
- Veredicto: A1 hecha.
- Gate A1 (commit 310665e6): `./init.sh` OK (typecheck, lint 0 errores, guardias 52/52). Releído
  `test:rapido` tras el commit (18 archivos del diff): 334 archivos verdes, 5 rojos y los 5 están en
  `tests/baseline-rojos.json` (unidades-viewport, usuarios-viewport, product-page,
  pantallas-exigen-permiso, recipe-page): `vitest related` no aplica los `--exclude`. Nada propio.

### A2 + A3 — Dominio y UI sin colisión (2026-10-07/08, una sola tanda tras el corte de sesión)

- Producción nueva: `pedidos/ports/order-conditioning-repository.ts` (puerto, `scope` último),
  `pedidos/domain/order-conditioning.ts` (`createStartConditioning`/`createFinishConditioning`,
  tipos `StartConditioningAliveById`/`FinishConditioningAliveById` con la firma que tendrá
  `OrderCatalog`).
- Producción modificada: `pedidos/domain/transition-order.ts` (destinos reservados + los 3, R4);
  `pedidos/domain/delete-order.ts` (`NO_BORRABLES` + los 3, igual que el CHECK de M1);
  `asignaciones/domain/list-company-orders.ts` (`resolveOrdering`: exactamente `TERMINADO` también);
  `asignacion/components/assignment-view-params.ts` (orden de R2; `isExactlyDelivered` = exactamente
  `ENTREGADO` o exactamente `TERMINADO`); `company-orders-skeleton.tsx` (solo docstring: recibe
  `showFinishedAt` de `page.tsx`); `packed-order-notice.tsx` («Pedido <n> empacado»).
- Tests nuevos: `tests/unit/pedidos/order-conditioning.test.ts`.
- Tests ampliados (sin colisión): `asignaciones/list-company-orders.test.ts`,
  `list-packing-orders.test.ts`, `get-packing-order.test.ts`, `pedidos/expire-stale-orders.test.ts`,
  `asignaciones-ui/assignment-view-params.test.ts`, `company-orders-columns.test.tsx`,
  `packed-order-notice.test.tsx`, `asignacion-page.test.tsx`.
- Arreglo de A1: `tests/integration/pedidos/pedidos-constraints.int.test.ts` (lista literal de
  columnas de `orders` + `conditioned_by`; no está en la lista de colisión).
- **Movido a C2:** los dos códigos de error (`error-codes.ts`, `error-catalog.ts`,
  `catalogo.test.ts`). Se escribieron en A2, pero `guard-catalogo-de-errores` exige que una clase
  declare cada código, y las clases van en `asignaciones/domain/errors.ts` (colisión QC-82). Se
  revirtieron y el diff se guardó en `.git/worktrees/QC-215-estados-de-acondicionamiento/qc215-c2-catalogo-errores.patch`
  para aplicarlo en C2.
- Diferido a C1: los dos métodos de `OrderCatalog` (el literal de `lib/composition/index.ts`
  dejaría de compilar) y el export del puerto en `pedidos/index.ts`.
- Diferido a C3: test de etiquetas/variantes del badge de `/pedidos` (R29, R32): su único test es
  `tests/unit/pedidos-ui/order-columns.test.tsx` (colisión QC-156).
- R → test: R4 → `transition-order.test.ts` sigue verde (casos nuevos en C2); R8, R9, R10, R12, R13
  (dominio) → `order-conditioning.test.ts`; R19, R30 (borrar) → `delete-order.test.ts` sigue verde
  (casos en C2); R23 → `list-packing-orders`, `get-packing-order`, `expire-stale-orders`;
  R28 → `company-orders-columns.test.tsx`, `assignment-view-params.test.ts`, `list-company-orders`;
  R32 (Todos) → `list-company-orders`, `assignment-view-params`, `asignacion-page.test.tsx`;
  R7 → `packed-order-notice.test.tsx`.
- Commit c3bc8989. Antes del corte: typecheck verde, lint 0 errores, tests unitarios de la tanda en
  verde, y `module-contract` + `order-conditioning` 22/22 tras la excepción. **Gate SIN CERRAR:**
  `./init.sh` (2026-10-08) lo mató el sistema por falta de memoria tras pasar las comprobaciones
  de board/perfil y antes de typecheck/tests. Hay que relanzarlo antes de empezar la fase C.

### C1 — Núcleo de pedidos (2026-10-08, tras mergear origin/dev con QC-82 y QC-156)

- Arreglo del merge (QC-156): `order-cancellation.ts` (`CANCELLABLE` exhaustivo: los 3 estados nuevos
  = `false`) y su test (mapa de 10 + caso R18 por estado). `set-order-customer.test.ts` y
  `order-row-actions.test.tsx`: cuenta del enum 7 → 10.
- T4 final: `ALLOWED` exacto de R3 (fuera `EN_EMPAQUE → ENTREGADO`); `order-transitions.test.ts`
  12 permitidos, `EN_EMPAQUE → ENTREGADO` en prohibidos, `ENTREGADO` solo desde `TERMINADO`.
- T6: `order-packing.ts` (`assertTransition('EN_EMPAQUE','POR_ACONDICIONAR')`); `order-prisma.ts`
  (`finishPackingAliveOrder` → `POR_ACONDICIONAR` sin `finishedAt`; `setAliveOrderStatus` ya no
  escribe `finishedAt`); JSDoc de `order-catalog.ts` y `asignaciones/domain/finish-packing.ts`.
- T7: `OrderCatalog` + `startConditioningAliveById`/`finishConditioningAliveById`; adaptadores
  `startConditioningAliveOrder`/`finishConditioningAliveOrder` en `order-prisma.ts` (un `updateMany`
  condicional + relectura que clasifica, sin unidad de trabajo); barrel `pedidos/index.ts`;
  `lib/composition/index.ts` (`orderConditioningRepository` + dos métodos en `orderCatalog`).
- Tests ajustados: `module-contract` (comentario), `order-packing` unit (R5, R6) e int, `order-finished-at.int`
  (R33), `finish-with-finished-goods.int` (R5), `order-catalog.test.ts` (R33), `qc145-estado-solo-planta`
  (un solo `data:` con `finishedAt`, el de TERMINADO; 6 escrituras de estado),
  `execution-atomicity.int` (QC-82: Terminar deja `POR_ACONDICIONAR`; el caso R20 siembra ENTREGADO a
  mano). Fakes de `OrderCatalog`: 6 `.int` de asignaciones + `assign-responsibles.test.ts`.
  Guardia `guard-ambito-empresa-pedidos`: los dos métodos en `METODOS_DELEGADOS_EN_DOMINIO`.
- Test nuevo: `tests/integration/pedidos/order-conditioning.int.test.ts` (alta `commit` en
  `aislamiento.json`, desde 2026-10-08).
- R → test: R3 → `order-transitions.test.ts`; R5 → `order-packing.test.ts`, `order-packing.int`,
  `finish-with-finished-goods.int`, `execution-atomicity.int`; R6 → `order-packing.test.ts` y los casos
  de rechazo de `finish-with-finished-goods.int`; R8, R9, R10, R12, R13, R14 → `order-conditioning.int`
  (+ `order-conditioning.test.ts`); R18 → `order-cancellation.test.ts`; R33 → `order-finished-at.int`,
  `order-catalog.test.ts`, `qc145-estado-solo-planta.test.ts`.
- Verificación (sin `./init.sh` por OOM, a petición del humano): typecheck verde; lint 0 errores
  (7 warnings ajenos); guardias 55 archivos, 742 verdes, 11 skipped; `tests/unit/pedidos` +
  `pedidos-ui` 111 archivos, 2083 casos, verdes; `tests/unit/asignaciones` + `composition` 67/67,
  1260 verdes; `.int` de pedidos (conditioning, packing, finished-at, finish-with-finished-goods)
  53/53; `order-repository.int` + `execution-atomicity.int` 27/27; `.int` de asignaciones con fakes
  25/26.
- **Rojo conocido:** `finished-orders.int.test.ts` > «R27: Finalizar -> Comenzar -> Terminar deja el
  pedido en «Terminados»». Lo causa T6 (Terminar ya no deja ENTREGADO) y se arregla con
  `list-finished-orders.ts` → `TERMINADO` + el recorrido de acondicionamiento en el test (C3/T16).
- Veredicto: C1 hecha salvo ese rojo, que depende de C3.

### C2 — Casos de uso de `asignaciones` (+ backend de T16) (2026-10-08)

- T8: parche `qc215-c2-catalogo-errores.patch` aplicado limpio (conteo 72 → 74, igual tras el merge
  de dev). `OrderConditioningTakenError` y `OrderNotConditionableError` en
  `asignaciones/domain/errors.ts`, exportados en `asignaciones/index.ts`.
- T9: `asignaciones/domain/start-conditioning.ts` y `finish-conditioning.ts` (permiso → zod →
  puertos; Terminar lee el número antes y devuelve `{ numberText }`; tabla de traducción del
  design § 3). Exportados al final de `asignaciones/index.ts`; cableados en `lib/composition/index.ts`
  como `asignaciones.startConditioning`/`finishConditioning` (alias `create*ConditioningOrder`
  porque `pedidos` exporta el mismo nombre). Sin Server Action ni ruta.
- T10: `acondicionamiento-rol.test.ts` abre exactamente las dos rutas; anti-cegado = el barrido ve
  catálogo + las dos y ninguna más; caso nuevo: las dos exigen `requirePermission(actor, '…')`.
- T11/T17: `order-state.ts` (solo la tabla del JSDoc: 3 filas). Tests: `order-state` (tabla de
  10 estados + asignar/quitar grupo/desasignar en los 3), `start-/finish-assigned-order` y
  `get-assigned-order-execution` (mismo error que `EN_EMPAQUE`), `start-/finish-packing` unit y
  `order-packing.int` (Comenzar/Terminar el empaque sobre los 3 → `not_packable`, sin escribir).
- T5/T17: tests `transition-order` (4 destinos reservados sin abrir la unidad), `delete-order`,
  `cancel-order`, `update-order`, `update-order-presentation-lines` con los 3 estados.
- T16 backend: `list-finished-orders.ts` → `['TERMINADO']`. `list-finished-orders.test.ts` y
  `finished-orders.int.test.ts` reescritos sobre `TERMINADO` (helper `terminado()`); la cadena R27
  recorre Finalizar → empaque → acondicionamiento; POR_ACONDICIONAR, EN_ACONDICIONAMIENTO y ENTREGADO
  antiguo no aparecen. Se quitó el caso «ENTREGADO sin fecha sale como Sin fecha» (ya no aplica).
- Censo de la fachada: `tests/unit/composition/asignaciones-facade.test.ts` (+2 operaciones, +2 casos R15).
- R → test: R8–R16 → `start-conditioning.test.ts`, `finish-conditioning.test.ts` (+R9, R13, R14 en
  `catalogo.test.ts`; R15 en `asignaciones-facade.test.ts`); R17 → `acondicionamiento-rol.test.ts` +
  guardia de autorización; R4 → `transition-order.test.ts`; R18 → `cancel-order.test.ts`; R19 →
  `delete-order`, `update-order`, `update-order-presentation-lines`; R20 → `order-state.test.ts`;
  R21 → `start-/finish-assigned-order`, `get-assigned-order-execution`; R23 → `start-/finish-packing`,
  `order-packing.int`; R30 → los mismos con `TERMINADO`; R31 → `list-finished-orders.test.ts`,
  `finished-orders.int`; R27 (QC-145) → `finished-orders.int` (verde de nuevo).
- **Discrepancia a revisar (no resuelta):** R19 dice que la edición acotada de reparto y unidad
  rechaza con `invalid_transition`; el código (lista blanca, design § 2.4 «ninguno») devuelve
  `not_editable` → `order_presentation_line_not_editable`, igual que con `EN_EMPAQUE`. El test
  afirma el comportamiento real («igual que EN_EMPAQUE»).
- Verificación: typecheck verde; lint 0 errores (7 warnings ajenos); guardias 55/55 (742 verdes, 11
  skipped); unit de la tanda (`tests/unit/asignaciones`, `errores`, `identity/roles`, `composition`,
  5 de `pedidos`) 83 archivos, 1621 verdes, 4 skipped; `.int` `finished-orders` + `order-packing`
  22/22; `vitest related` sobre la producción tocada: 671/674 archivos, 3 rojos ajenos
  (`recetas/module-contract` y `pantallas-exigen-permiso`, en baseline; `proveedores/catalog-line.int`
  R32, sin diff contra origin/dev, no está en baseline).
- Veredicto: C2 hecha.

### C3 — Badge y menú de `/pedidos`, cierre de T12/T14/T16 (2026-10-08)

- Tests: `tests/unit/pedidos-ui/order-columns.test.tsx` (+3 casos parametrizados: el filtro de estado
  ofrece los 3 nuevos en orden de flujo entre «En empaque» y «Entregado»; `parseOrderListParams`
  acepta cada uno en `status`; la celda pinta «Por acondicionar»/«En acondicionamiento»/«Terminado»
  con `data-status` = valor y la clase de `Badge` `secondary`/`default`/`secondary`).
  `tests/unit/pedidos-ui/order-row-actions.test.tsx`: nombre del caso corregido a los 7 estados
  finales (R22); bloque nuevo R22: los 3 son finales y no aceptan reparto; con cada uno, editar/
  cancelar/eliminar `aria-disabled` y sin invocar, sin «Reparto y unidad» aun con
  `canEditDistribution`, y «Responsables» activa y emitiendo.
- Producción (solo comentarios): JSDoc de `order-row-actions.tsx` (lista de estados finales) y de
  `company-orders-columns.tsx` (fecha con `['ENTREGADO']` o `['TERMINADO']`). Ningún cambio de lógica.
- Revisión T12/T16 frente a A3: nada más que hacer en UI (columnas/etiquetas de «Todos», params,
  skeleton, `isExactlyDelivered`, aviso «empacado» ya cubiertos y verdes). QC-156 en `/pedidos`
  (cliente, cancelación): compila y sus tests de `pedidos-ui` pasan con los 10 estados.
- R → test: R22 → `order-row-actions.test.tsx` («R22: …» ×7); R29 → `order-columns.test.tsx` («R29, R32: …»,
  «R29: el filtro de estado acepta … en la URL»); R32 (badge y filtro de `/pedidos`) → mismos casos;
  R28/R32 «Todos» → `company-orders-columns.test.tsx`, `assignment-view-params.test.ts`,
  `list-company-orders.test.ts`, `asignacion-page.test.tsx`; R7 → `packed-order-notice.test.tsx`;
  R31 → `list-finished-orders.test.ts` (+ `finished-orders.int`, C2).
- Verificación: `pnpm run typecheck` verde; `pnpm run lint` 0 errores (7 warnings ajenos);
  `vitest run` `order-columns` + `order-row-actions` + `guard-pantalla-pedidos-se-amplia`: 3 archivos,
  112 verdes, 2 skipped; `order-columns` + `order-row-actions` solos: 104/104; `tests/unit/pedidos-ui`
  completo: 42 archivos, 691 verdes, 3 skipped; asignaciones-ui (`company-orders-columns`,
  `assignment-view-params`, `packed-order-notice`, `asignacion-page`) + `list-company-orders` +
  `list-finished-orders`: 6 archivos, 106/106.
- Veredicto: C3 hecha; T12, T13, T14 y T16 marcadas.

### C4 — E2E existentes (T18) (2026-10-08)

- Aserciones ajustadas (R34), ningún spec nuevo:
  - `e2e/empaque.spec.ts`: tras Terminar, estado `POR_ACONDICIONAR`; en «Terminados» la fila NO
    aparece (`toHaveCount(0)`). Título del caso y cabecera ajustados a lo que afirman.
  - `e2e/pasos-de-envasado.spec.ts`, `e2e/envases-del-pedido.spec.ts`,
    `e2e/pedido-en-varias-presentaciones.spec.ts`, `e2e/producto-terminado.spec.ts`: `ENTREGADO` →
    `POR_ACONDICIONAR` tras Terminar el empaque (una línea cada uno).
  - `e2e/pedidos-terminados.spec.ts`: el pedido «con fecha» se siembra `TERMINADO` con `finishedAt`,
    `packedBy` (Empacador) y `conditionedBy` (Administrador); el «sin fecha» sigue `ENTREGADO`
    (`TERMINADO` no admite `finished_at` nulo). Empacador: ve el `TERMINADO` y NO el `ENTREGADO` en
    «Terminados» (R31). Administrador: «Todos» sin filtro con {PENDIENTE, EN_CURSO, TERMINADO,
    ENTREGADO, CANCELADO}; filtro exacto Entregado → solo el `ENTREGADO`, 1 celda de fecha «Sin fecha»
    (R32 «como hoy»). Se pierde la aserción E2E de orden con-fecha/sin-fecha (con un solo `ENTREGADO`
    no hay orden que afirmar); el orden de terminados sigue en `list-company-orders.test.ts`.
  - `e2e/pedidos-asignados.spec.ts` (bloque del Empacador): `deliveredOwn`/`deliveredOther` sembrados
    `TERMINADO` + `conditionedBy` (Operador de la empresa); `deliveredNoPacker` sigue `ENTREGADO` sin
    empacador (no puede ser `TERMINADO`) y su aserción (no aparece) no cambia.
- Verificación: `pnpm run typecheck` verde (incluye `e2e/**`); `pnpm run lint` 0 errores (7 warnings
  ajenos).
- **Playwright NO corrido.** `playwright.config.ts` levanta `next dev` en el 3117 contra el
  `DATABASE_URL` del `.env` (`localhost:5432/QuimiCloude`, base compartida). Esa base NO tiene las
  migraciones de esta rama: `enum_range(null::"OrderStatus")` =
  `{PENDIENTE,EN_CURSO,ENTREGADO,CANCELADO,POR_EMPACAR,EN_EMPAQUE,BLOQUEADO}` y `orders.conditioned_by`
  no existe (0 columnas). Correrlo exige `db:migrate` sobre la base compartida (afecta a otros
  worktrees; su rollback aborta si quedan filas en estados nuevos): decisión del humano.
- Veredicto: aserciones editadas y compilando; T18 SIN marcar hasta que los 7 specs corran en verde.

### T18 — E2E (2026-10-08)

- Base compartida (`localhost:5432/QuimiCloude`) con M1 y M2 aplicadas por el leader. Cada spec
  corrido solo, en serie, con `pnpm exec playwright test e2e/<spec> --reporter=line` (chromium +
  webkit, `next dev` en el 3117):
  - `e2e/empaque.spec.ts`: 2 passed (1.3m)
  - `e2e/pasos-de-envasado.spec.ts`: 2 passed (1.2m)
  - `e2e/envases-del-pedido.spec.ts`: 4 passed (1.5m)
  - `e2e/pedido-en-varias-presentaciones.spec.ts`: 4 passed (1.5m)
  - `e2e/producto-terminado.spec.ts`: 2 passed (1.1m)
  - `e2e/pedidos-terminados.spec.ts`: 8 passed (48.1s)
  - `e2e/pedidos-asignados.spec.ts`: 8 passed (50.8s)
- Arreglos: ninguno (las aserciones de C4 pasaron a la primera). Rojos ajenos: ninguno. Sin
  reintentos.
- Veredicto: los 7 E2E en verde (30 passed, 0 failed, 0 skipped); T18 marcada.

## Pendiente

- Cerrar el gate de A2+A3 (`./init.sh`).
- ~~T18: correr los 7 E2E (de uno en uno) con una base migrada con M1/M2.~~ Hecho (ver «T18 — E2E»).
- T19.

## Mapa R<n> → test (consolidado)

Verificado con Grep en T19. Cada caso existe, nombra el R en su nombre o en su `describe` y es de
QC-215. Los casos que llevan números de otros specs (p. ej. QC-145 «R41, R2, R28» o QC-87 «R35») se
usan solo si además citan un estado de QC-215 en el nombre o van marcados «(QC-215)».

| R | Archivo(s) de test | Caso que lo cubre |
|---|---|---|
| R1 | `tests/unit/pedidos/order-transitions.test.ts`; `tests/unit/pedidos/schema/order-conditioning-states-migration.test.ts` | «R1: los tres estados nuevos van detras de los siete de antes, que conservan su orden»; «R1, R30: los tres valores son los ultimos del esquema, detras de BLOQUEADO» |
| R2 | `tests/unit/pedidos/order-transitions.test.ts` | «R2: el orden del flujo pone el acondicionamiento y TERMINADO entre el empaque y la entrega» |
| R3 | `tests/unit/pedidos/order-transitions.test.ts` | «R3: la matriz es de 10x10 y hay exactamente 12 pares permitidos»; «R3: cada estado del acondicionamiento solo se alcanza desde el anterior»; «EN_EMPAQUE solo se alcanza desde POR_EMPACAR, y ENTREGADO solo desde TERMINADO (R1, R3)» |
| R4 | `tests/unit/pedidos/transition-order.test.ts` | «R4 (QC-215): rechaza ${hacia} como destino desde ${desde} con invalid_transition, SIN abrir la unidad de trabajo» |
| R5 | `tests/unit/pedidos/order-packing.test.ts`; `tests/integration/pedidos/order-packing.int.test.ts`; `tests/integration/pedidos/finish-with-finished-goods.int.test.ts` | «R5 (QC-215): Terminar comprueba EN_EMPAQUE -> POR_ACONDICIONAR, nunca hacia ENTREGADO ni TERMINADO»; «R21, R5 (QC-215): Terminar sobre su EN_EMPAQUE deja POR_ACONDICIONAR sin finished_at y conserva packed_by, en una sola escritura»; «R5: un producto terminado nuevo nace con su lote … queda POR_ACONDICIONAR …» |
| R6 | `tests/unit/pedidos/order-packing.test.ts` | «R6 (QC-215): si la matriz rechazara EN_EMPAQUE -> POR_ACONDICIONAR, Terminar falla sin abrir la unidad de trabajo» |
| R7 | `tests/unit/asignaciones-ui/packed-order-notice.test.tsx` | «R7 - nombra el pedido empacado y nunca dice «entregado»»; «R7 - el texto sale de una funcion, no de un literal duplicado» |
| R8 | `tests/unit/pedidos/order-conditioning.test.ts`; `tests/unit/asignaciones/start-conditioning.test.ts`; `tests/integration/pedidos/order-conditioning.int.test.ts` | «R8: comprueba POR_ACONDICIONAR -> EN_ACONDICIONAMIENTO y delega con la empresa como ultimo parametro»; «R8, R11: llama al catalogo una vez con el pedido, la empresa y el id del actor, y el instante»; «R8: sobre POR_ACONDICIONAR deja EN_ACONDICIONAMIENTO con el actor como quien acondiciona y autor, …» |
| R9 | `tests/unit/asignaciones/start-conditioning.test.ts`; `tests/integration/pedidos/order-conditioning.int.test.ts` | «R9: already_mine es exito»; «R9: el mismo acondicionador sobre su EN_ACONDICIONAMIENTO es already_mine, sin escribir nada»; «R9: sobre un EN_ACONDICIONAMIENTO de otra persona es taken, sin escribir nada» |
| R10 | `tests/unit/asignaciones/start-conditioning.test.ts`; `tests/integration/pedidos/order-conditioning.int.test.ts` | «R9, R10: taken rechaza con order_conditioning_taken»; «R10: dos Comenzar reales a la vez sobre el mismo POR_ACONDICIONAR dejan a uno ok y al otro taken» |
| R11 | `tests/unit/asignaciones/start-conditioning.test.ts` | «R11, R15: un actor con los permisos de semilla del Administrador de acondicionamiento comienza»; «R8, R11: llama al catalogo una vez …» |
| R12 | `tests/unit/pedidos/order-conditioning.test.ts`; `tests/unit/asignaciones/finish-conditioning.test.ts`; `tests/integration/pedidos/order-conditioning.int.test.ts` | «R12: comprueba EN_ACONDICIONAMIENTO -> TERMINADO y delega con la empresa como ultimo parametro»; «R12: devuelve el numero visible leido ANTES de transicionar, …»; «R12: quien acondiciona deja TERMINADO con finished_at = now, …» |
| R13 | `tests/unit/asignaciones/finish-conditioning.test.ts`; `tests/integration/pedidos/order-conditioning.int.test.ts` | «R13: not_conditioner rechaza con order_conditioning_taken»; «R13: otra persona con el permiso recibe not_conditioner y el pedido sigue EN_ACONDICIONAMIENTO sin finished_at» |
| R14 | `tests/unit/asignaciones/start-conditioning.test.ts`; `tests/unit/asignaciones/finish-conditioning.test.ts`; `tests/integration/pedidos/order-conditioning.int.test.ts` | «R14: not_conditionable rechaza con order_not_conditionable»; «R14: pedido inexistente, de baja o de otra empresa rechaza con order_not_found sin transicionar»; «R14: un pedido inexistente, dado de baja o de otra empresa es not_found» |
| R15 | `tests/unit/asignaciones/start-conditioning.test.ts`; `tests/unit/asignaciones/finish-conditioning.test.ts`; `tests/unit/composition/asignaciones-facade.test.ts` | «R15: actor %s rechaza con unauthorized sin tocar ningun puerto»; «R15: actor %s con entrada invalida sigue dando unauthorized: autorizar va antes de validar»; «R15: los permisos de semilla del Administrador y del Empacador no incluyen el permiso»; «R15: `startConditioning` / `finishConditioning` rechaza sin `acondicionamiento.modificar` sin llegar a la base» |
| R16 | `tests/unit/asignaciones/start-conditioning.test.ts`; `tests/unit/asignaciones/finish-conditioning.test.ts` | «R16: entrada %s rechaza con invalid_input sin tocar ningun puerto» |
| R17 | `tests/unit/identity/roles/acondicionamiento-rol.test.ts` (+ `tests/guards/guard-autorizacion-por-permiso.test.ts` en verde) | describe «R17 — solo el catalogo y los dos casos de uso del acondicionamiento nombran acondicionamiento.modificar»: «R17: el codigo solo aparece en el catalogo de permisos y en las dos rutas exactas abiertas»; «R17: cada caso de uso abierto exige el permiso con requirePermission, no lo nombra de pasada» |
| R18 | `tests/unit/pedidos/order-cancellation.test.ts`; `tests/unit/pedidos/cancel-order.test.ts` | «R18: un pedido ${estado} es not_cancellable, sin cancelar ni liberar»; «R18, R30 (QC-215): no cancela un POR_ACONDICIONAR, un EN_ACONDICIONAMIENTO ni un TERMINADO, sin escribir ni liberar» |
| R19 | `tests/unit/pedidos/delete-order.test.ts`; `tests/unit/pedidos/update-order.test.ts`; `tests/unit/pedidos/update-order-presentation-lines.test.ts` | «R19, R30 (QC-215): no borra un POR_ACONDICIONAR, un EN_ACONDICIONAMIENTO ni un TERMINADO, sin escribir ni liberar»; «R19, R30 (QC-215): POR_ACONDICIONAR, EN_ACONDICIONAMIENTO y TERMINADO -> `invalid_transition`, sin escribir»; «R19, R30 (QC-215): rechaza %s igual que EN_EMPAQUE, con not_editable, …» (ver la discrepancia not_editable / invalid_transition anotada arriba) |
| R20 | `tests/unit/asignaciones/order-state.test.ts`; `tests/unit/asignaciones/list-order-responsibles.test.ts` | describe «QC-215 — los estados de acondicionamiento y TERMINADO congelan los responsables»: «R20, R30: asignar, quitar un grupo y desasignar sobre un ${status} rechazan con order_produced_frozen sin escribir»; «R20: los estados recorridos son todos, incluidos los de acondicionamiento y TERMINADO» |
| R21 | `tests/unit/asignaciones/start-assigned-order.test.ts`; `tests/unit/asignaciones/finish-assigned-order.test.ts`; `tests/unit/asignaciones/get-assigned-order-execution.test.ts` | «R21, R30: ${estado} rechaza con el mismo error que EN_EMPAQUE, sin escribir»; «R21, R30 (QC-215): ${estado} rechaza con el mismo error que EN_EMPAQUE, sin escribir ni anotar»; «R21, R30: leer la ejecucion de un ${estado} rechaza con el mismo error que EN_EMPAQUE» |
| R22 | `tests/unit/pedidos-ui/order-row-actions.test.tsx` | «R22: exactamente `ENTREGADO`, … `POR_ACONDICIONAR`, `EN_ACONDICIONAMIENTO` y `TERMINADO` …»; «R22: %s es final y no acepta la edicion acotada de reparto»; «R22: con un pedido %s, editar, cancelar y eliminar deshabilitados, sin «Reparto y unidad» y con «Responsables» activa» |
| R23 | `tests/unit/asignaciones/list-packing-orders.test.ts`; `tests/unit/asignaciones/get-packing-order.test.ts`; `tests/unit/pedidos/expire-stale-orders.test.ts`; `tests/unit/asignaciones/start-packing.test.ts`; `tests/unit/asignaciones/finish-packing.test.ts`; `tests/integration/pedidos/order-packing.int.test.ts`; `tests/unit/asignaciones/list-assigned-orders.test.ts`; `tests/unit/pedidos/review-blocked-orders.test.ts` | «R23: el filtro que viaja al catalogo no incluye POR_ACONDICIONAR, EN_ACONDICIONAMIENTO ni TERMINADO»; «R23: un pedido %s responde `order_not_found` sin leer recibos ni pasos»; «R23: un candidato %s bajo el candado no se cancela ni se libera»; «R23, R30: el catalogo clasifica ${estado} como not_packable -> order_not_packable, …»; «R23, R30: un pedido ${status} que el catalogo clasifica not_packable -> order_not_packable, …»; «R23, R30 (QC-215): Comenzar / Terminar el empaque sobre POR_ACONDICIONAR, … es not_packable, …»; «R23 - los estados de acondicionamiento (POR_ACONDICIONAR, EN_ACONDICIONAMIENTO, TERMINADO) no entran en el filtro de estados de trabajo» («Mis asignados»); «R23 - solo desbloquea BLOQUEADO: un pedido POR_ACONDICIONAR, EN_ACONDICIONAMIENTO o TERMINADO no se toca, ni al leerlo ni bajo el candado» (revisión de `BLOQUEADO`) |
| R24 | `tests/integration/pedidos/order-conditioning-constraints.int.test.ts`; `tests/unit/pedidos/schema/order-conditioning-states-migration.test.ts` | «R24: acepta la fila valida de cada estado de acondicionamiento»; «R24: rechaza deleted_at no nulo, packed_by nulo o finished_at no nulo, con SQLSTATE 23514»; «R24, R30: amplia quien empaca y el borrado a los estados nuevos» |
| R25 | `tests/integration/pedidos/order-conditioning-constraints.int.test.ts`; `tests/unit/pedidos/schema/order-conditioning-states-migration.test.ts`; `tests/unit/pedidos/schema/pedidos-schema.test.ts` | «R25: exige quien acondiciona en EN_ACONDICIONAMIENTO y en TERMINADO»; «R25: rechaza a quien acondiciona de OTRA empresa con SQLSTATE 23503»; «R25: anade conditioned_by con su indice y la FK compuesta contra la empresa»; «R25: conditionedBy es uuid anulable, sin @relation y con su indice» |
| R26 | `tests/unit/pedidos/schema/order-conditioning-states-migration.test.ts`; `tests/integration/pedidos/order-conditioning-constraints.int.test.ts` | «R26: las tres primeras sentencias anaden los valores, idempotentes y en orden»; «R26: la migracion no modifica ninguna fila de orders»; «R26: ninguna fila de orders incumple las reglas nuevas» |
| R27 | `tests/unit/pedidos/schema/order-conditioning-states-migration.test.ts`; `tests/integration/pedidos/order-conditioning-states-rollback.int.test.ts` | «R27: la primera sentencia aborta si hay pedidos en un estado nuevo»; «R27: recrea OrderStatus con los valores de antes, sacados del esquema»; «R27: un pedido POR_ACONDICIONAR aborta el DOWN entero y deja el esquema intacto»; «R27: sin pedidos en los estados nuevos, revierte entero y deja el enum, la columna y los CHECK de antes» |
| R28 | `tests/unit/asignaciones-ui/company-orders-columns.test.tsx`; `tests/unit/asignaciones-ui/assignment-view-params.test.ts`; `tests/unit/asignaciones/list-company-orders.test.ts` | describe «R28, R32 - «Todos» pinta y filtra los estados de acondicionamiento y TERMINADO»; describe «R28, R32 - el filtro de estado de «Todos» acepta los estados nuevos en la URL»; «sin `statuses`, consulta con todos los estados en el orden del flujo, incluidos los de acondicionamiento (R41, R28)» |
| R29 | `tests/unit/pedidos-ui/order-columns.test.tsx` | «R29, R32: la celda pinta %s como «%s», con su valor en `data-status` y la variante %s»; «R29, R32: el filtro de estado ofrece los tres estados nuevos, en el orden del flujo, entre «En empaque» y «Entregado»»; «R29: el filtro de estado acepta %s en la URL» |
| R30 | `tests/integration/pedidos/order-conditioning-constraints.int.test.ts`; `tests/unit/pedidos/schema/order-conditioning-states-migration.test.ts`; `tests/unit/pedidos/order-transitions.test.ts` | «R30: acepta TERMINADO con finished_at, quien empaca y quien acondiciona»; «R30: rechaza TERMINADO sin finished_at, sin quien empaca, sin quien acondiciona o borrado»; «R30: crea el gemelo de orders_company_finished_idx para TERMINADO»; «R3, R19, R30: POR_ACONDICIONAR, EN_ACONDICIONAMIENTO y TERMINADO no admiten «quedarse igual»» (+ los casos «R18/R19/R20/R21/R23, R30» de las filas anteriores) |
| R31 | `tests/unit/asignaciones/list-finished-orders.test.ts`; `tests/integration/asignaciones/finished-orders.int.test.ts` | «R31: consulta el catalogo con la empresa del actor, solo TERMINADO -nunca ENTREGADO- y el orden de terminados»; «R31: la lista de estados que pide es exactamente TERMINADO, sin ENTREGADO ni estados de acondicionamiento»; «R31: un ENTREGADO antiguo, con o sin `finished_at`, NO aparece en «Terminados»» |
| R32 | `tests/unit/asignaciones/list-company-orders.test.ts`; `tests/unit/asignaciones-ui/assignment-view-params.test.ts`; `tests/unit/asignaciones-ui/asignacion-page.test.tsx`; `tests/unit/pedidos-ui/order-columns.test.tsx` | «R32: exactamente `TERMINADO` ordena como «Terminados»»; «R32 - ["TERMINADO"] tambien cuenta como exacto»; describe «R32 — el skeleton de «Todos» suma la columna de fecha con el filtro exacto»; «R29, R32: la celda pinta %s …» |
| R33 | `tests/unit/pedidos/order-catalog.test.ts`; `tests/unit/pedidos/qc145-estado-solo-planta.test.ts`; `tests/integration/pedidos/order-finished-at.int.test.ts` | «R33 (QC-215): ni a ENTREGADO ni a EN_CURSO escribe finishedAt»; «R33 (QC-215): order-prisma.ts tiene exactamente un bloque `data:` que nombra finishedAt, el de Terminar el acondicionamiento hacia TERMINADO»; describe «R33 (QC-215) — setAliveOrderStatus no escribe finished_at con ningun destino» |
| R34 | E2E tocados: `e2e/empaque.spec.ts`, `e2e/envases-del-pedido.spec.ts`, `e2e/pasos-de-envasado.spec.ts`, `e2e/pedido-en-varias-presentaciones.spec.ts`, `e2e/pedidos-asignados.spec.ts`, `e2e/pedidos-terminados.spec.ts`, `e2e/producto-terminado.spec.ts` (+ esta tabla) | Aserciones ajustadas, sin spec nuevo. Ejecutados en T18: 7 specs, 30 passed |
| R35 | `git diff --name-only origin/dev -- package.json pnpm-lock.yaml` | Salida vacía (exit 0); ver abajo |

Salida real de R35:

```
$ git diff --name-only origin/dev -- package.json pnpm-lock.yaml
(sin salida; exit=0)
```

Huecos: ningún R se queda sin test. R23 queda cubierto en sus cinco puntos (incluidos «Mis
asignados» y la revisión que desbloquea `BLOQUEADO`). Los e2e de R34 siguen sin ejecutar.

### Corrida de los tests unit del mapa (T19)

`pnpm exec vitest run` con los 37 archivos unit y de guardia del mapa, en una sola invocación (sin
.int ni e2e):

```
 Test Files  37 passed (37)
      Tests  1117 passed (1117)
   Duration  14.91s
```

## Cierre (2026-10-08)

- Por OOM, el humano sustituyó `./init.sh` por typecheck + lint + tests concretos por tanda; el
  gate completo lo corre CI en el PR #170. T19 está marcada con esa salvedad.
- Cerrado: T18 (7 E2E en verde, 30 passed; ver «T18 — E2E»).
- Abierto: R19 en reparto y unidad: el código devuelve `not_editable`
  (`order_presentation_line_not_editable`), no `invalid_transition` como dice R19; design § 2.4 no
  lo cambia. Hay que corregir el texto de R19 o el código.
- Abierto: el cambio de cliente de QC-156 (su R14) se admite también en los 3 estados nuevos;
  ningún spec lo cubre.
- Ajeno: `tests/integration/proveedores/catalog-line.int.test.ts` (R32) falla en local (shape del
  error de Prisma); dev lo sacó del baseline en f2be3eb8 y la rama no tiene diff en `proveedores`.
