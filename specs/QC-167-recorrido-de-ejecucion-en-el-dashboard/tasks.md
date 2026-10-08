# QC-167 — recorrido-de-ejecucion-en-el-dashboard · tasks.md

> Orden por dependencias. `[P]` = puede ir en paralelo con las otras `[P]` de su bloque. Cada task
> cierra con su verificación: `pnpm run typecheck`, `pnpm run lint` y
> `pnpm exec vitest related --run <archivos tocados>`; las que tocan arquitectura, además
> `pnpm exec vitest run guard`. Los `.int` se corren contra la base de test (`docs/verification.md`).
> Un commit por task (`feat(QC-167): …` / `test(QC-167): …`). En los tests, `R<n>` va en el nombre
> del caso; en producción, ningún `QC-`/`R<n>` en comentarios.
>
> **Antes de T1:** F1.3 aprobado, con respuesta a P1 y P3 (`design.md > 9`). Si cambian, se ajustan
> R15/R18 y las tasks T3/T6 antes de empezar.

## Bloque A — Contratos de dominio (backend)

- [ ] **T1 [P] — `parseOrderNumber` en `pedidos`.** Inversa de `formatOrderNumber` en
  `domain/order-number.ts`, exportada por el barril (`design.md > 3.3`, punto 1).
  **Hecho cuando:** test unitario con `parse(format(n)) === n` para varias secuencias, `2026-42` y
  `2026-0000042` dan lo mismo, espacios de los extremos se ignoran, y `''`, `2026`, `2026-`,
  `2026-0`, `26-1`, `2026-12345678`, `abc` dan `null`. Cubre **R6**.

- [ ] **T2 [P] — Opciones de `listAliveSummariesByIds` y orden `number_recent_first`.** Tipo
  `OrderSummaryOrdering` con el tercer valor; sexto parámetro opcional `options` en `OrderCatalog`,
  `OrderSummaryReader`, `createListAliveSummariesByIds` y `listAliveOrderSummariesByIds`
  (`design.md > 3.3`, punto 2).
  **Hecho cuando:** (a) los tests actuales de `order-catalog` y `order-catalog-company-summary.int`
  siguen verdes sin tocarlos (sin `options` no cambia nada); (b) `.int` nuevo: filtra por número
  exacto, ordena por número descendente y estable entre páginas, respeta `statuses`, excluye dados
  de baja y **no devuelve pedidos de otra empresa aunque su id venga en la lista**. Cubre **R4, R6,
  R9, R10, R23** (lado `pedidos`).

- [ ] **T3 [P] — `buildExecutionTrace` (puro).** `domain/execution-trace.ts` y el tipo
  `ExecutionEntryRecord` en `domain/execution-entry.ts` (`design.md > 3.4`).
  **Hecho cuando:** tests unitarios de: tramos (la última sin tramo); ejecución cerrada por `finish`
  y por `cancel`; abierta con `EN_CURSO` hasta `now`; «sin cierre anotado» con `CANCELADO` y sin
  `cancel`; empaque cerrado, abierto con `EN_EMPAQUE`, «sin empaque»; el hueco finalizar→comenzar
  empaque no suma a ninguna; pausa larga antes de `retomar` **sí** suma (P1, reloj); `goBackCount`;
  personas distintas en orden de aparición. Cubre **R3, R14, R15, R16**.

## Bloque B — Registro y casos de uso (backend)

- [ ] **T4 — Lecturas del registro.** Tres métodos en `ports/execution-log-repository.ts` y su
  implementación en `execution-log-prisma.ts`, con el mapa inverso del enum derivado del existente
  (`design.md > 3.1`, `> 3.2`). *Depende de T3 (tipo de lectura).*
  **Hecho cuando:** (a) unit: el mapa ida-y-vuelta da las ocho acciones; (b) `.int`: los tres métodos
  filtran por empresa (anotaciones de otra empresa con la misma persona o el mismo pedido no
  vuelven), el filtro de persona y el de rango (`gte` / `lt`) funcionan, `listEntriesForOrders`
  ordena por `occurredAt, id`; (c) el puerto sigue sin ningún método de modificar o borrar. Cubre
  **R7, R8, R22, R23, R24**.

- [ ] **T5 — Caso de uso de la lista.** `domain/list-execution-traces.ts` (`design.md > 3.5`).
  *Depende de T1, T2, T3, T4.*
  **Hecho cuando** (unit, puertos simulados): (a) **autorización**: actor ausente, sin `permissions`,
  con `[]`, o con todo el catálogo **menos** `dashboard.consultar` → `UnauthorizedError` y **ningún
  puerto llamado**; con `dashboard.consultar` solo, pasa; (b) entrada inválida (`pageSize` 50, `userId`
  no uuid, clave de más) → `ValidationError` sin tocar puertos; (c) número no parseable → página vacía
  sin llamar a `orders`; (d) ids vacíos → página vacía sin llamar a `orders`; (e) `cancelledOnly` pasa
  `['CANCELADO']`, si no todos los estados; (f) `ordering: 'number_recent_first'` y `number` llegan a
  `orders`; (g) el rango llega como `00:00Z` inclusivo / día siguiente exclusivo; (h) **la empresa de
  todas las llamadas es la del actor**, también si la entrada trae un `companyId` (rechazado por
  `strictObject`); (i) `personOptions` con dadas de baja; (j) consultas constantes por página. Cubre
  **R1, R2, R4, R5, R6, R7, R8, R9, R10, R19, R23**.

- [ ] **T6 — Caso de uso del detalle.** `domain/get-execution-trace.ts` (`design.md > 3.6`).
  *Depende de T2, T3, T4.*
  **Hecho cuando** (unit): (a) autorización como T5(a); (b) id mal formado, pedido inexistente / de
  otra empresa / dado de baja (`orders` vacío) y pedido sin anotaciones → **el mismo**
  `OrderNotFoundError`; (c) anotaciones en orden con nombre de persona, posición y motivo; (d) la
  empresa sale del actor. Cubre **R12, R13, R18, R19, R23**.

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
  `components/execution-trace-list-params.ts` (`design.md > 4.1`, `> 4.2`). *Puede empezar tras T1.*
  **Hecho cuando:** unit: `parse` nunca lanza y acota cada parámetro de la tabla del design;
  `parse(build(p))` = `p`; cambiar un filtro devuelve `page` 1; `persona` no uuid se descarta;
  `cancelados` distinto de `1` = desactivado. Cubre **R5, R11, R17** (parte pura).

- [ ] **T9 [P] — Formato.** `components/execution-trace-format.ts`: duraciones, instantes UTC,
  etiquetas de acción (las ocho, exhaustivo por tipo) y de estado (exhaustivo por `OrderStatus`,
  «En curso» para `EN_CURSO`) (`design.md > 4.3`).
  **Hecho cuando:** unit de los cuatro `kind` de duración («(en curso)», «(sin cierre anotado)»,
  «Sin empaque»), horas/minutos/segundos, y que ningún formato usa `toLocaleString` ni
  `Intl.NumberFormat`. Cubre **R3, R13, R15**.

- [ ] **T10 — Lista en el dashboard.** `dashboard-content.tsx` (recibe `params`, `<Suspense>`),
  `execution-trace-list-section.tsx`, `execution-trace-table.tsx`, `execution-trace-columns.tsx`,
  barril y `page.tsx` con `searchParams` (`design.md > 4.3`). *Depende de T7, T8, T9.*
  **Hecho cuando** (proyecto `ui`, acción simulada): columnas de R2; fila `EN_CURSO` marcada «En
  curso» y duración «(en curso)»; vueltas atrás con la cifra del dominio; ninguna columna ordenable;
  filtro de persona con las opciones del servidor; buscar, filtrar persona, fechas y el interruptor
  hacen `router.push` a la URL que produce `build` con `page` 1; paginar conserva los filtros; el
  enlace de cada fila es `executionTraceRoute(id)?<consulta actual>`; error de la acción → aviso
  dentro del área sin tumbar la pantalla; interruptor y enlaces con `min-h-11 min-w-11`, `label`
  accesible y operables por teclado. Cubre **R1, R2, R3, R5, R6, R7, R8, R9, R11, R26**.

- [ ] **T11 — Detalle del recorrido.** `app/(private)/dashboard/recorrido/[id]/page.tsx` y
  `components/{execution-trace-detail.tsx,index.ts}` (`design.md > 4.3`). *Depende de T7, T8, T9.*
  **Hecho cuando** (proyecto `ui`): primera línea `requirePagePermission('dashboard.consultar')`;
  `OrderNotFoundError` → `notFound()`; resumen con número, estado, dos duraciones y vueltas atrás;
  `<ol>` con las anotaciones en orden, acción en español, instante, persona, posición, motivo en
  cancelar, tramo hasta la siguiente (no en la última) y cada retroceder marcado con texto «Vuelta
  atrás»; «Volver» a `DASHBOARD_ROUTE?build(parse(searchParams))`, y sin parámetros a la lista por
  defecto; un único `h1`; `min-h-11` en «Volver». Cubre **R12, R13, R14, R15, R16, R17, R18, R26**.

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
  Operador, dos pedidos con anotaciones de dos personas (uno con un retroceder, uno `EN_CURSO`) y un
  pedido de **otra empresa** con anotaciones. Números con `formatOrderNumber`, rutas con
  `executionTraceRoute`, nunca literales.
  - Caso 1 (**R28**): el Administrador entra, ve los dos pedidos de su empresa y **no** el ajeno;
    filtra por persona → la URL lleva `persona`; filtra por número → una fila; abre el recorrido →
    anotaciones en orden y «Vuelta atrás» visible; «Volver» → misma URL de lista y mismos filtros.
  - Caso 2 (**R29**): el Operador pide `/dashboard` → 404; pide el recorrido de un pedido de su
    empresa → 404.
  - Caso 3 (**R18**, **R23**): el Administrador pide el recorrido del pedido de la otra empresa → 404.
  **Hecho cuando:** `pnpm exec playwright test e2e/recorrido-ejecucion.spec.ts` verde y la limpieza
  borra solo lo sembrado.

## Bloque F — Cierre

- [ ] **T16 — Trazabilidad y gate local.** `progress/impl_QC-167.md` con el mapa `R1…R29 → test`
  (archivo y nombre del caso) y `./init.sh` verde.

## Mapa de cobertura (previsto)

| Requisito | Task(s) |
|---|---|
| R1 | T5, T10, T15 |
| R2 | T5, T10 |
| R3 | T3, T9, T10 |
| R4 | T2, T5 |
| R5 | T5, T8, T10 |
| R6 | T1, T2, T5, T10, T15 |
| R7 | T4, T5, T10, T15 |
| R8 | T4, T5, T10 |
| R9 | T2, T5, T10 |
| R10 | T2, T5 |
| R11 | T8, T10, T15 |
| R12 | T6, T11, T15 |
| R13 | T6, T9, T11, T15 |
| R14 | T3, T11 |
| R15 | T3, T9, T11 |
| R16 | T3, T11, T15 |
| R17 | T8, T11, T15 |
| R18 | T6, T11, T15 |
| R19 | T5, T6, T7 |
| R20 | T11, T12, T15 |
| R21 | T13 |
| R22 | T4 |
| R23 | T2, T4, T5, T6, T15 |
| R24 | T4, T7 |
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
- `tests/unit/pedidos/order-number-parse.test.ts`
- `tests/integration/pedidos/order-catalog-trace-options.int.test.ts`
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
- `tests/unit/identity/session-once-per-request-actions.test.ts`
- `tests/unit/asignaciones/execution-log-prisma.test.ts`
- `tests/unit/asignaciones/execution-log-repository.test.ts`
- `tests/unit/asignaciones/module-contract.test.ts`
- `tests/unit/pedidos/order-catalog.test.ts`
- `tests/unit/identity/permissions.test.ts`

Estado:
- `progress/impl_QC-167.md`
- `progress/features/QC-167.md`
