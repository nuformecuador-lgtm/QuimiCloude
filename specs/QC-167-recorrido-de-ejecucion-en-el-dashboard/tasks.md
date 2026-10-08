# QC-167 — recorrido-de-ejecucion-en-el-dashboard · tasks.md

> Orden por dependencias. `[P]` = puede ir en paralelo con las otras `[P]` de su bloque. Cada task
> cierra con su verificación: `pnpm run typecheck`, `pnpm run lint` y
> `pnpm exec vitest related --run <archivos tocados>`; las que tocan arquitectura, además
> `pnpm exec vitest run guard`. Los `.int` se corren contra la base de test (`docs/verification.md`).
> Un commit por task (`feat(QC-167): …` / `test(QC-167): …`). En los tests, `R<n>` va en el nombre
> del caso; en producción, ningún `QC-`/`R<n>` en comentarios.
>
> **Antes de T1:** F1.3 aprobado. Las cuatro propuestas de `design.md > 9` ya las decidió el humano
> el 2026-10-07 (D11–D17 de `requirements.md`): no queda ningún ⚑.

## Bloque A — Contratos de dominio (backend)

- [x] **T1 [P] — `orderNumberContains` en `pedidos`.** En `domain/order-number.ts`, al lado de
  `formatOrderNumber` y exportada por el barril (`design.md > 3.3`, punto 1).
  **Hecho cuando:** test unitario con los ejemplos de R6, uno por caso: `42` casa con
  `{2026, 42}`, `{2026, 142}` y `{2026, 4200}` y no con `{2026, 43}`; `0000042` casa con
  `{2026, 42}` y `{2025, 42}` y no con `{2026, 142}`; `2026-0000042` solo con `{2026, 42}`;
  `2026-` con cualquier secuencia de 2026 y no con 2025; `2026-42` **no** casa con `{2026, 42}` y sí
  con `{2026, 4200000}`; `2026` casa con `{2025, 2026}`; espacios de los extremos se ignoran;
  `abc`, `42a` y `2026 42` no casan con nada; **`-` y `--` no casan con nada** (D15: al menos un
  dígito), aunque `-` sea subcadena de todos; y una secuencia de ocho dígitos se compara contra su
  forma sin truncar (la de `formatOrderNumber`). Cubre **R6**.

- [x] **T2 [P] — `listSummariesByIdsIncludingDeleted` en el contrato de `pedidos`.** Tipo
  `OrderHistorySummary` y método nuevo en `OrderCatalog`; `listNumbersByIdsIncludingDeleted` y
  `listHistoryByIdsIncludingDeleted` en `ports/order-summary-reader.ts`; factoría
  `createListSummariesByIdsIncludingDeleted` en `domain/list-order-summaries.ts`; dos funciones en
  `order-catalog-prisma.ts`; cableado en `lib/composition/index.ts`; exportes en el barril; fila en
  `METODOS_DELEGADOS_EN_DOMINIO` de `guard-ambito-empresa-pedidos.test.ts`; la entrada nueva en los
  cuatro dobles que declaran `OrderCatalog` entero (`design.md > 3.3`, puntos 2 y 3).
  *Depende de T1.*
  **Hecho cuando:** (a) unit de la factoría (puertos simulados): sin `numberContains` no llama a
  `listNumbersByIdsIncludingDeleted`; con él, filtra con `orderNumberContains` y pasa a
  `listHistoryByIdsIncludingDeleted` solo los ids que casan, y la lista vacía si no casa ninguno;
  (b) `.int` nuevo: **incluye un pedido dado de baja con `deleted: true`** y uno vivo con
  `deleted: false`; ordena por número descendente y estable entre páginas; respeta `statuses`;
  `total` cuenta solo lo filtrado; filtra por parte del número (`42` sobre `…-0000042` y
  `…-0000142`); y **no devuelve pedidos de otra empresa —vivos ni dados de baja— aunque su id venga
  en la lista**; (c) los tests actuales de `order-catalog`, `order-catalog-company-summary.int` y la
  guardia de ámbito siguen verdes, y `listAliveSummariesByIds` sigue excluyendo los dados de baja.
  Cubre **R1, R4, R6, R9, R10, R18, R23, R24** (lado `pedidos`).

- [x] **T3 [P] — `buildExecutionTrace` (puro).** `domain/execution-trace.ts` y el tipo
  `ExecutionEntryRecord` en `domain/execution-entry.ts` (`design.md > 3.4`).
  **Hecho cuando:** tests unitarios de: tramos (la última sin tramo); **una sola** `duration`, sin
  campos de ejecución ni de empaque; `closed` con `ENTREGADO` y última `pack_finish`, medida de la
  primera a la última anotación **incluyendo** el hueco `finish → pack_start` y una pausa larga
  antes de `resume`; `closed` con `CANCELADO` y última `cancel`; `open` hasta `now` con `EN_CURSO`,
  con `POR_EMPACAR` y con `EN_EMPAQUE` (no hasta la última anotación); `unclosed` con `CANCELADO` sin
  `cancel` y con `ENTREGADO` sin `pack_finish`; **dado de baja con estado `EN_CURSO` → `unclosed`,
  no `open`**; una sola anotación no activa → `ms` 0; `FINAL_STATUSES` es exactamente
  `['ENTREGADO', 'CANCELADO']`; `goBackCount`; personas distintas en orden de aparición. Cubre
  **R3, R14, R15, R16**.

## Bloque B — Registro y casos de uso (backend)

- [x] **T4 — Lecturas del registro.** Tres métodos en `ports/execution-log-repository.ts` y su
  implementación en `execution-log-prisma.ts`, con el mapa inverso del enum derivado del existente
  (`design.md > 3.1`, `> 3.2`). *Depende de T3 (tipo de lectura).*
  **Hecho cuando:** (a) unit: el mapa ida-y-vuelta da las ocho acciones; (b) `.int`: los tres métodos
  filtran por empresa (anotaciones de otra empresa con la misma persona o el mismo pedido no
  vuelven), el filtro de persona y el de rango (`gte` / `lt`) funcionan, `listEntriesForOrders`
  ordena por `occurredAt, id`; (c) el puerto sigue sin ningún método de modificar o borrar. Cubre
  **R7, R8, R22, R23, R24**.

- [ ] **T5 — Caso de uso de la lista.** `domain/list-execution-traces.ts` (`design.md > 3.5`).
  *Depende de T2, T3, T4.*
  **Hecho cuando** (unit, puertos simulados): (a) **autorización**: actor ausente, sin `permissions`,
  con `[]`, o con todo el catálogo **menos** `dashboard.consultar` → `UnauthorizedError` y **ningún
  puerto llamado**; con `dashboard.consultar` solo, pasa; (b) entrada inválida (`pageSize` 50, `userId`
  no uuid, clave de más) → `ValidationError` sin tocar puertos; (c) `orderNumber` con letras **no**
  es `ValidationError`: llega tal cual a `orders` como `numberContains`; vacío tras `trim` no se
  manda; (d) ids vacíos → página vacía sin llamar a `orders`; (e) `cancelledOnly` pasa
  `['CANCELADO']`, si no todos los estados; (f) la llamada es a `listSummariesByIdsIncludingDeleted`;
  (g) un pedido dado de baja sale en la página con `deleted: true` y su duración no es `open`;
  (h) la fila lleva **una** `duration`, la misma que da `buildExecutionTrace`; (i) el rango llega
  como `00:00Z` inclusivo / día siguiente exclusivo; (j) **la empresa de todas las llamadas es la
  del actor**, también si la entrada trae un `companyId` (rechazado por `strictObject`);
  (k) `personOptions` con dadas de baja; (l) consultas constantes por página. Cubre **R1, R2, R3,
  R4, R5, R6, R7, R8, R9, R10, R15, R19, R23**.

- [ ] **T6 — Caso de uso del detalle.** `domain/get-execution-trace.ts` (`design.md > 3.6`).
  *Depende de T2, T3, T4.*
  **Hecho cuando** (unit): (a) autorización como T5(a); (b) id mal formado, pedido inexistente / de
  otra empresa (`orders` vacío) y pedido sin anotaciones → **el mismo** `OrderNotFoundError`;
  (c) un pedido **dado de baja** con anotaciones **no** lanza: devuelve el recorrido con
  `deleted: true`; (d) anotaciones en orden con nombre de persona, posición y motivo, y la misma
  `duration` que la fila; (e) la empresa sale del actor. Cubre **R12, R13, R15, R18, R19, R23**.

- [ ] **T7 — Cableado, contrato y Server Actions.** Dos factorías en `lib/composition/index.ts`,
  bloque nuevo en `lib/modules/asignaciones/index.ts`, `adapters/driving/execution-trace-actions.ts`
  con `currentActor()` dentro de `runInRequestScope`, y su fila en `ACCIONES` de
  `session-once-per-request-actions.test.ts` (`design.md > 3.7`, `> 3.8`). *Depende de T5, T6.*
  **Hecho cuando:** unit de las acciones (error traducido por `code`, ningún permiso comprobado en la
  acción, `now` puesto por la acción); el test de una lectura de sesión por petición verde con la
  fila nueva; `module-contract` de `asignaciones` y `pnpm exec vitest run guard` verdes (barril sin
  `'use server'`, ningún `prisma.order` en `asignaciones`). Cubre **R19, R24**.

## Bloque C — Pantalla (frontend)

- [ ] **T8 [P] — Ruta y parámetros de la URL.** `executionTraceRoute` en `lib/shared/routes.ts`;
  `components/execution-trace-list-params.ts` (`design.md > 4.1`, `> 4.2`). *Sin dependencias de
  backend.*
  **Hecho cuando:** unit: `parse` nunca lanza y acota cada parámetro de la tabla del design;
  `parse(build(p))` = `p`; cambiar un filtro devuelve `page` 1; `persona` no uuid se descarta;
  `cancelados` distinto de `1` = desactivado; `q` con letras o sin dígitos (`-`) **se conserva** (no se descarta: R6 pide
  lista vacía, no filtro ignorado) y `q` de solo espacios se descarta. Cubre **R5, R6, R11, R17**
  (parte pura).

- [ ] **T9 [P] — Formato.** `components/execution-trace-format.ts`: duraciones, instantes UTC,
  etiquetas de acción (las ocho, exhaustivo por tipo), de estado (exhaustivo por `OrderStatus`,
  «En curso» para `EN_CURSO`) y la marca «Dado de baja» (`design.md > 4.3`).
  **Hecho cuando:** unit de los tres `kind` de duración («(en curso)», «(sin cierre anotado)», nada
  en `closed`), horas/minutos/segundos por debajo de 24 h (`45 s`, `12 min 30 s`, `1 h 05 min`,
  `0 s`, `23 h 59 min` justo antes del umbral), días desde 24 h (`1 d 00 h 00 min` en 24 h exactas,
  `2 d 02 h 05 min`, segundos truncados), y que ningún formato usa `toLocaleString` ni
  `Intl.NumberFormat`. Cubre **R3, R13, R15**.

- [ ] **T10 — Lista en el dashboard.** `dashboard-content.tsx` (recibe `params`, `<Suspense>`),
  `execution-trace-list-section.tsx`, `execution-trace-table.tsx`, `execution-trace-columns.tsx`,
  barril y `page.tsx` con `searchParams` (`design.md > 4.3`). *Depende de T7, T8, T9.*
  **Hecho cuando** (proyecto `ui`, acción simulada): columnas de R2 con **una** columna de duración;
  fila activa marcada «En curso» y duración «(en curso)»; fila dada de baja con el **texto** «Dado de
  baja» visible sin `:hover`; vueltas atrás con la cifra del dominio; ninguna columna ordenable;
  filtro de persona con las opciones del servidor; buscar, filtrar persona, fechas y el interruptor
  hacen `router.push` a la URL que produce `build` con `page` 1; paginar conserva los filtros; el
  enlace de cada fila es `executionTraceRoute(id)?<consulta actual>`; error de la acción → aviso
  dentro del área sin tumbar la pantalla; interruptor y enlaces con `min-h-11 min-w-11`, `label`
  accesible y operables por teclado. Cubre **R1, R2, R3, R5, R6, R7, R8, R9, R11, R15, R26**.

- [ ] **T11 — Detalle del recorrido.** `app/(private)/dashboard/recorrido/[id]/page.tsx` y
  `components/{execution-trace-detail.tsx,index.ts}` (`design.md > 4.3`). *Depende de T7, T8, T9.*
  **Hecho cuando** (proyecto `ui`): primera línea `requirePagePermission('dashboard.consultar')`;
  `OrderNotFoundError` → `notFound()`; resumen con número, estado, marca «Dado de baja» cuando
  `deleted`, **una** duración y vueltas atrás; `<ol>` con las anotaciones en orden, acción en
  español, instante, persona, posición, motivo en cancelar, tramo hasta la siguiente (no en la
  última) y cada retroceder marcado con texto «Vuelta atrás»; «Volver» a
  `DASHBOARD_ROUTE?build(parse(searchParams))`, y sin parámetros a la lista por defecto; un único
  `h1`; `min-h-11` en «Volver». Cubre **R12, R13, R14, R15, R16, R17, R18, R26**.

## Bloque D — Enmiendas de tests existentes

- [ ] **T12 — La costura y las pantallas que exigen permiso.** *Depende de T10, T11.*
  Con **nota fechada** en cada test enmendado (`design.md > 7`):
  - `tests/unit/dashboard-page.test.tsx`: el caso «área vacía» pasa a «el área contiene la lista del
    recorrido y nada más»; el de R12, a «un hijo a los dos anchos». R2 y R4 sin tocar.
  - `tests/unit/dashboard-route-contract.test.ts`: R6, R7 y R8 **se mantienen** para `page.tsx` y
    `dashboard-content.tsx`; la sección y la tabla entran en las fuentes vigiladas por `100vh` /
    `hover`; la ruta del detalle se deriva de `executionTraceRoute`.
  - `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`: dashboard con `searchParams` espía y
    `leeAlgo: true`; caso nuevo para `/dashboard/recorrido/[id]`.
  - `tests/guards/guard-pantallas-exigen-permiso.test.ts`: veintiuna pantallas.
  **Hecho cuando:** los cuatro verdes y ninguna aserción de R2/R4/R6/R7/R8 de QC-12 ni de QC-75
  quitada. Cubre **R20, R25**.

- [ ] **T13 [P] — Seed y catálogo sin cambios.** Test que compara `SEED_ROLE_PERMISSIONS` y
  `PERMISSIONS` de esta rama con los de su base: mismos códigos y `dashboard.consultar` solo en el
  Administrador. Si un test existente ya lo afirma (`tests/unit/identity/permissions.test.ts`), se
  cita en el mapa de trazabilidad y no se duplica. Cubre **R21**.

- [ ] **T14 [P] — Ni dependencias ni migraciones.** Comprobar que el diff de la rama no toca
  `package.json`, `pnpm-lock.yaml` ni `db/` (`guard-dependencias-aprobadas` verde y `git diff
  --stat` de la rama contra su base sin `db/`). Se anota en `progress/impl_QC-167.md`. Cubre
  **R27**.

## Bloque E — Extremo a extremo

- [ ] **T15 — E2E `e2e/recorrido-ejecucion.spec.ts`.** *Depende de T10, T11, T12.*
  Siembra por Prisma (como `e2e/ejecucion-receta.spec.ts`): una empresa, un Administrador, un
  Operador, dos pedidos con anotaciones de dos personas (uno con un retroceder, uno `EN_CURSO`), un
  pedido **dado de baja** con anotaciones y un pedido de **otra empresa** con anotaciones. Números
  con `formatOrderNumber`, rutas con `executionTraceRoute`, nunca literales.
  - Caso 1 (**R28**): el Administrador entra, ve los pedidos de su empresa y **no** el ajeno;
    filtra por persona → la URL lleva `persona`; filtra por una parte del número que solo casa con
    uno → una fila; abre el recorrido → anotaciones en orden y «Vuelta atrás» visible; «Volver» →
    misma URL de lista y mismos filtros.
  - Caso 2 (**R29**): el Operador pide `/dashboard` → 404; pide el recorrido de un pedido de su
    empresa → 404.
  - Caso 3 (**R18**, **R23**): el Administrador pide el recorrido del pedido de la otra empresa → 404.
  - Caso 4 (**R1**, **R2**, **R13**, **R18**): el pedido dado de baja sale en la lista con «Dado de
    baja» y su recorrido se abre con la misma marca.
  **Hecho cuando:** `pnpm exec playwright test e2e/recorrido-ejecucion.spec.ts` verde y la limpieza
  borra solo lo sembrado.

## Bloque F — Cierre

- [ ] **T16 — Trazabilidad y gate local.** `progress/impl_QC-167.md` con el mapa `R1…R29 → test`
  (archivo y nombre del caso) y `./init.sh` verde.

## Mapa de cobertura (previsto)

| Requisito | Task(s) |
|---|---|
| R1 | T2, T5, T10, T15 |
| R2 | T5, T10, T15 |
| R3 | T3, T5, T9, T10 |
| R4 | T2 |
| R5 | T5, T8, T10 |
| R6 | T1, T2, T5, T8, T10, T15 |
| R7 | T4, T5, T10, T15 |
| R8 | T4, T5, T10 |
| R9 | T2, T5, T10 |
| R10 | T2, T5 |
| R11 | T8, T10, T15 |
| R12 | T6, T11, T15 |
| R13 | T6, T9, T11, T15 |
| R14 | T3, T11 |
| R15 | T3, T5, T6, T9, T10, T11 |
| R16 | T3, T11, T15 |
| R17 | T8, T11, T15 |
| R18 | T2, T6, T11, T15 |
| R19 | T5, T6, T7 |
| R20 | T11, T12, T15 |
| R21 | T13 |
| R22 | T4 |
| R23 | T2, T4, T5, T6, T15 |
| R24 | T2, T4, T7 |
| R25 | T12 |
| R26 | T10, T11 |
| R27 | T14 |
| R28 | T15 |
| R29 | T15 |

## Archivos esperados

Backend — `pedidos`:
- `lib/modules/pedidos/domain/order-number.ts`
- `lib/modules/pedidos/domain/order-catalog.ts`
- `lib/modules/pedidos/domain/list-order-summaries.ts`
- `lib/modules/pedidos/ports/order-summary-reader.ts`
- `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`
- `lib/modules/pedidos/index.ts`

Backend — `asignaciones`:
- `lib/modules/asignaciones/domain/execution-entry.ts`
- `lib/modules/asignaciones/domain/execution-trace.ts`
- `lib/modules/asignaciones/domain/list-execution-traces.ts`
- `lib/modules/asignaciones/domain/get-execution-trace.ts`
- `lib/modules/asignaciones/ports/execution-log-repository.ts`
- `lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma.ts`
- `lib/modules/asignaciones/adapters/driving/execution-trace-actions.ts`
- `lib/modules/asignaciones/index.ts`
- `lib/composition/index.ts`
- `lib/shared/routes.ts`

Pantalla:
- `app/(private)/dashboard/page.tsx`
- `app/(private)/dashboard/components/index.ts`
- `app/(private)/dashboard/components/dashboard-content.tsx`
- `app/(private)/dashboard/components/execution-trace-list-params.ts`
- `app/(private)/dashboard/components/execution-trace-list-section.tsx`
- `app/(private)/dashboard/components/execution-trace-table.tsx`
- `app/(private)/dashboard/components/execution-trace-columns.tsx`
- `app/(private)/dashboard/components/execution-trace-format.ts`
- `app/(private)/dashboard/recorrido/[id]/page.tsx`
- `app/(private)/dashboard/recorrido/[id]/components/index.ts`
- `app/(private)/dashboard/recorrido/[id]/components/execution-trace-detail.tsx`

Tests nuevos:
- `tests/unit/pedidos/order-number-contains.test.ts`
- `tests/unit/pedidos/list-summaries-including-deleted.test.ts`
- `tests/integration/pedidos/order-catalog-including-deleted.int.test.ts`
- `tests/unit/asignaciones/execution-trace.test.ts`
- `tests/unit/asignaciones/list-execution-traces.test.ts`
- `tests/unit/asignaciones/get-execution-trace.test.ts`
- `tests/unit/asignaciones/execution-trace-actions.test.ts`
- `tests/integration/asignaciones/execution-log-read.int.test.ts`
- `tests/unit/dashboard/execution-trace-list-params.test.ts`
- `tests/unit/dashboard/execution-trace-format.test.ts`
- `tests/ui/dashboard/execution-trace-table.test.tsx`
- `tests/ui/dashboard/execution-trace-detail.test.tsx`
- `e2e/recorrido-ejecucion.spec.ts`

Tests que se enmiendan o pueden necesitar ajuste:
- `tests/unit/dashboard-page.test.tsx`
- `tests/unit/dashboard-route-contract.test.ts`
- `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`
- `tests/guards/guard-pantallas-exigen-permiso.test.ts`
- `tests/guards/guard-ambito-empresa-pedidos.test.ts`
- `tests/unit/identity/session-once-per-request-actions.test.ts`
- `tests/unit/asignaciones/execution-log-prisma.test.ts`
- `tests/unit/asignaciones/execution-log-repository.test.ts`
- `tests/unit/asignaciones/module-contract.test.ts`
- `tests/unit/pedidos/order-catalog.test.ts`
- `tests/unit/identity/permissions.test.ts`
- `tests/integration/asignaciones/use-case-fixture.ts`
- `tests/integration/asignaciones/finished-orders.int.test.ts`
- `tests/integration/asignaciones/company-orders.int.test.ts`
- `tests/integration/asignaciones/responsible-eligibility.int.test.ts`
- `tests/helpers/order-summaries.ts`

Estado:
- `progress/impl_QC-167.md`
- `progress/features/QC-167.md`
