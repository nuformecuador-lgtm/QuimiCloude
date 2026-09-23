# QC-145 — pedidos-terminados-en-asignacion · tasks.md

> Desglose de `design.md`. Cada task lista los **archivos que toca** (el leader los usa para validar
> conflictos con otras features en curso, en especial QC-82 sobre `order-catalog-prisma.ts`), su
> criterio de «hecho» y sus dependencias. `[P]` = puede ir en paralelo con las que se indican. Un
> commit por task (`docs/conventions.md > Commits`). Sin comentarios que citen fichas ni requisitos
> en producción. `R<n>` va en el **nombre** de los casos de test.
>
> **Base de datos propia, sin excepción.** La migración (T1) y **todos** los tests de integración de
> F2 corren contra una base propia **`QuimiCloude_QC145`**, con el `.env` git-ignorado del worktree
> apuntando a ella. **Nunca** contra la base del `.env` del árbol principal. Antes de cada
> `db:migrate`, `db:rollback` o `pnpm test` de integración se comprueba que `DATABASE_URL` y
> `DIRECT_URL` nombran `QuimiCloude_QC145`.
>
> Cierre de tanda con `./init.sh --rapido`. Cierre de ficha y antes del PR, `./init.sh` completo.
> Las Preguntas abiertas 2-5 **no bloquean** empezar. Si el humano responde algo distinto de la
> propuesta, cambian T4 (sentido del número, índice), T9/T10 (columnas) o T5 (filtro mixto), y lo
> dice cada task.

---

## Bloque 1 — Base

- [ ] **T1. Migración `orders.finished_at`: columna, CHECK e índice parcial.** (`design.md > 1`; R1, R2, R4, R29.)
      - Archivos: `db/schema.prisma` (modelo `Order`: `finishedAt DateTime? @map("finished_at")
        @db.Timestamptz(6)` y una línea en el comentario del modelo sobre el `CHECK`, que es drift),
        `db/migrations/20260923120000_orders_finished_at/migration.sql` y `down.sql` (nuevos; el
        timestamp debe ser mayor que el último de `db/migrations/` al crearla).
      - Tests: `tests/unit/pedidos/schema/orders-finished-at-migration.test.ts` (nuevo: anulable,
        sin `DEFAULT`, sin `UPDATE`/backfill, `CHECK orders_finished_at_requires_delivered`, índice
        parcial con `NULLS LAST`, `down.sql` inverso exacto, con casos de sensibilidad que mutan el
        SQL); `tests/unit/pedidos/schema/pedidos-schema.test.ts` si enumera columnas de `Order`.
      - Proceso: contra **`QuimiCloude_QC145`**, `pnpm run db:migrate` → `pnpm run db:rollback` →
        `pnpm run db:migrate`. Salida pegada en `progress/impl_QC-145-…md` y `_prisma_migrations`
        coherente. `prisma generate` después.
      - **Hecho**: ciclo real completo sobre `QuimiCloude_QC145`; test de esquema en verde.
      - Depende de: nada.

## Bloque 2 — `pedidos`

- [ ] **T2. Finalizar escribe la fecha.** (`design.md > 2.1`; R3, R5, R10.)
      - Archivos: `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`
        (solo el `data` de `transitionAliveOrder`).
      - **No** toca `lib/modules/asignaciones/domain/finish-assigned-order.ts` (QC-82 lo reescribe).
      - Tests: `tests/unit/pedidos/order-catalog.test.ts` («R3: a ENTREGADO el mismo `updateMany`
        lleva `finishedAt = now`; a EN_CURSO no»); `tests/integration/pedidos/order-finished-at.int.test.ts`
        (nuevo, contra `QuimiCloude_QC145`: R3 por el caso de uso real `finishAssignedOrder`; R4, la
        base rechaza `finished_at` con estado ≠ ENTREGADO; R2, un ENTREGADO sembrado antes queda
        `NULL`).
      - **Hecho**: tests en verde; `guard-ambito-empresa-pedidos` en verde.
      - Depende de: T1.

- [ ] **T3. [P con T2] La edición deja de mover el estado.** (`design.md > 2.3`; R6, R8, R9.)
      - Archivos: `lib/modules/pedidos/domain/order-input.ts` (`updateOrderSchema` sin `status`),
        `order-view.ts` (`OrderEdit`), `update-order.ts` (`assertTransition(row.status, row.status)`),
        `ports/order-repository.ts` (`updateAlive(…, data: OrderEdit, …)`),
        `adapters/driven/persistence/order-prisma.ts` (`updateAliveOrder` sin `status`),
        `adapters/driving/order-actions.ts` (`buildUpdateCandidate` sin `status`),
        `lib/modules/pedidos/index.ts` (exporta `OrderEdit`).
      - **No** toca `order-transitions.ts`, `cancel-order.ts` ni `create-order.ts`.
      - Tests (fixtures arreglados en el mismo commit): `tests/unit/pedidos/update-order.test.ts`
        (R6: `status` en la entrada no cambia el estado; R8: final → `invalid_transition` sin
        escribir), `order-input.test.ts` (R6: el esquema descarta `status`), `order-actions.test.ts`
        (el candidato no lleva `status`), `order-transitions.test.ts` sin cambios de matriz,
        `module-contract.test.ts` si enumera exportaciones, `cancel-order.test.ts` (R9, sin
        cambios y en verde); `tests/integration/pedidos/order-crud.int.test.ts` (R6: editar un
        EN_CURSO lo deja EN_CURSO, contra `QuimiCloude_QC145`).
      - **Hecho**: `pnpm run typecheck` en verde (la UI se arregla en T11 si deja de compilar por
        `ORDER_STATUS_FIELD`; en ese caso T11 va en la misma tanda); tests en verde.
      - Depende de: nada (T1 solo si algún test de integración lo exige).

- [ ] **T4. `OrderCatalog.listAliveSummariesInCompany` y `finishedAt` en el resumen.** (`design.md > 2.2`; R17, R20, R22, R24, R27.)
      - Archivos: `lib/modules/pedidos/domain/order-catalog.ts` (`OrderSummaryOrdering`,
        `AssignedOrderSummary.finishedAt`, método nuevo), `lib/modules/pedidos/index.ts` (exporta
        `OrderSummaryOrdering`), `adapters/driven/persistence/order-catalog-prisma.ts`
        (`listAliveOrderSummariesInCompany`, constante de orden de trabajo compartida,
        `finishedAt` en `select` y `toAssignedOrderSummary`).
      - Tests: `tests/unit/pedidos/order-catalog.test.ts` (R20: `nulls: 'last'` explícito y
        desempate total; `work_queue` idéntico al de `listAliveOrderSummariesByIds`);
        `tests/integration/pedidos/order-repository.int.test.ts` o archivo nuevo
        `order-catalog-company.int.test.ts` (ámbito de empresa, borrados fuera, filtro de estados,
        `total` filtrado; contra `QuimiCloude_QC145`). Todo doble de `OrderCatalog` en
        `tests/unit/asignaciones/**` gana el método nuevo.
      - Si la Pregunta abierta 2 se responde «ascendente»: cambian el `orderBy` de
        `finished_recent_first`, el índice de T1 y el caso de R20.
      - **Hecho**: tests en verde; `guard-arquitectura-modulos` en verde.
      - Depende de: T1 (tipo generado `finishedAt`). Toca el mismo archivo que T2: **en serie** con T2.

## Bloque 3 — `asignaciones`

- [ ] **T5. Vistas por permiso.** (`design.md > 3.1`; R11-R15.)
      - Archivos: `lib/modules/asignaciones/domain/assignment-views.ts` (nuevo:
        `AssignmentViewKind`, `resolveAssignmentViews`, `resolveAssignmentView`),
        `lib/modules/asignaciones/index.ts`.
      - Tests: `tests/unit/asignaciones/assignment-views.test.ts` (nuevo: Operador → `['asignados']`;
        Empacador → `['asignados','terminados']`; con `pedidos.consultar` → `['todos']` aunque tenga
        terminados; `null` → `['asignados']`; la firma no recibe rol, R14; vista no permitida o
        inventada → primera, R15).
      - **Hecho**: tests en verde.
      - Depende de: nada. [P con T1-T4]

- [ ] **T6. Caso de uso «Terminados».** (`design.md > 3.2`; R17-R21, R27.)
      - Archivos: `lib/modules/asignaciones/domain/list-finished-orders.ts` (nuevo),
        `lib/modules/asignaciones/domain/finished-order-view.ts` (nuevo),
        `lib/modules/asignaciones/index.ts`,
        `tests/unit/identity/roles/empacador-rol.test.ts` (**enmienda de QC-144 R16**: la puerta se
        abre a `list-finished-orders.ts` y `assignment-views.ts`, por archivo exacto y con su
        porqué; el caso negativo se conserva).
      - Tests: `tests/unit/asignaciones/list-finished-orders.test.ts` (nuevo: R17 pide
        `['ENTREGADO']` + `finished_recent_first` con la empresa del actor; R19 vacío; R27 esquema
        estricto; una llamada por página a recetas y presentaciones);
        `tests/unit/asignaciones/authorization.test.ts` (R18: sin `terminados.consultar` →
        `unauthorized` sin tocar ningún puerto; el Operador rechazado);
        `tests/unit/asignaciones/empacador-authorization.test.ts` si enumera casos de uso.
      - **Hecho**: tests en verde.
      - Depende de: T4 (tipos del catálogo), T5 (barrel).

- [ ] **T7. [P con T6] Caso de uso «Todos».** (`design.md > 3.3`; R22-R25, R27.)
      - Archivos: `lib/modules/asignaciones/domain/list-company-orders.ts` (nuevo),
        `lib/modules/asignaciones/domain/company-order-view.ts` (nuevo),
        `lib/modules/asignaciones/index.ts`.
      - Tests: `tests/unit/asignaciones/list-company-orders.test.ts` (nuevo: R22 sin filtro → cuatro
        estados + `work_queue`; R24 `['ENTREGADO']` → `finished_recent_first`, mezcla → `work_queue`,
        duplicados → deduplicados; R25 incluye al actor y sin responsables → `[]`; R27 esquema
        estricto, `statuses: []` → `invalid_input`); `authorization.test.ts` (R23: sin
        `pedidos.consultar` → `unauthorized`; el Empacador rechazado).
      - Si la Pregunta abierta 4 cambia: solo el paso 3 de `design.md > 3.3` y su caso.
      - **Hecho**: tests en verde.
      - Depende de: T4, T5. **Mismo `index.ts` que T6**: se integran en serie o se resuelve el
        conflicto al juntar.

- [ ] **T8. Server Actions y composición.** (`design.md > 4`, `> 5`.)
      - Archivos: `lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts`
        (`listFinishedOrdersAction`, `listCompanyOrdersAction`), `lib/composition/index.ts`
        (cablea las dos factories; `orderCatalog.listAliveSummariesInCompany`),
        `tests/guards/guard-qc87-no-reimplementado.test.ts` (`ACCIONES` gana las dos),
        `tests/unit/identity/session-once-per-request-actions.test.ts` si su lista lo exige.
      - Tests: `tests/unit/asignaciones/order-assignment-actions.test.ts` (las dos acciones
        delegan con el actor de la sesión y traducen `unauthorized`/`invalid_input` por `code`);
        integración `tests/integration/asignaciones/finished-orders.int.test.ts` (nuevo: R17, R19,
        R20 estable entre páginas, R30 finalizar por el caso de uso real → aparece con fecha) y
        `tests/integration/asignaciones/company-orders.int.test.ts` (nuevo: R22, R24 y rechazo
        cruzado de empresa), los dos contra `QuimiCloude_QC145` y con `use-case-fixture.ts`
        ampliado si hace falta.
      - **Hecho**: `pnpm run typecheck` y `pnpm run lint` del repo en verde; `./init.sh --rapido`
        en verde.
      - Depende de: T2, T6, T7.

## Bloque 4 — UI

- [ ] **T9. `/asignacion`: vistas, pestañas y parámetros.** (`design.md > 6.1`, `> 6.2`, `> 6.6`; R11-R15, R27.)
      - Archivos: `app/(private)/asignacion/page.tsx`,
        `app/(private)/asignacion/components/assignment-view-tabs.tsx` (nuevo),
        `app/(private)/asignacion/components/assignment-view-params.ts` (nuevo),
        `app/(private)/asignacion/components/assigned-orders-list-params.ts` (los href conservan
        `vista`), `app/(private)/asignacion/components/index.ts`.
      - Tests: `tests/unit/asignaciones-ui/asignacion-page.test.tsx` (nuevo: pestañas por conjunto
        de permisos; con una sola vista no hay pestañas; `?vista=todos` para el Empacador → «Mis
        asignados»); `assignment-view-params.test.ts` (nuevo: parseo tolerante, `status` con coma,
        valores fuera del conjunto descartados); `assigned-orders-list-params.test.ts` y
        `assigned-orders-route-contract.test.ts` actualizados si fijan el href o el contenido de la
        página; `tests/unit/identity/session-once-per-request-render.test.tsx` (la página sigue con
        una sola lectura de sesión).
      - **Hecho**: tests en verde; pestañas ≥ 44 × 44 px revisadas.
      - Depende de: T5, T8.

- [ ] **T10. [P con T11] Listas «Terminados» y «Todos».** (`design.md > 6.3`, `> 6.4`; R19, R21, R24-R27.)
      - Archivos (nuevos, en `app/(private)/asignacion/components/`): `finished-orders-list-section.tsx`,
        `finished-orders-table.tsx`, `finished-orders-columns.tsx`, `finished-orders-empty.tsx`,
        `finished-orders-skeleton.tsx`, `company-orders-list-section.tsx`,
        `company-orders-table.tsx`, `company-orders-columns.tsx`, `company-orders-empty.tsx`,
        `company-orders-skeleton.tsx`; `index.ts`. El error se reutiliza de
        `assigned-orders-error.tsx` si su API lo permite. Si no, se crea uno por vista.
      - Tests: `tests/unit/asignaciones-ui/finished-orders-columns.test.tsx` (R21 presentación y
        «Sin presentación», fecha `YYYY-MM-DD` y «Sin fecha»; R26 sin columna de acción ni enlace a
        `/asignacion/<id>`); `company-orders-columns.test.tsx` (R25 estado y todos los
        responsables; R24 filtro `select` con los cuatro estados; R26);
        `finished-orders-list-section.test.tsx` y `company-orders-list-section.test.tsx` (vacío,
        error, página fuera de rango → vuelta a la 1, R19, R27); `a11y-tactil.test.tsx` ampliado.
      - Si la Pregunta abierta 3 cambia: solo `*-columns.tsx`, sus esqueletos y sus tests.
      - **Hecho**: tests de `tests/unit/asignaciones-ui/` en verde; revisión multiplataforma hecha.
      - Depende de: T8 (acciones y tipos), T9 (parámetros).

- [ ] **T11. [P con T10] Pedidos: el formulario de edición sin estado.** (`design.md > 6.5`; R7.)
      - Archivos: `app/(private)/pedidos/components/order-form.tsx` (quita el selector y el envío
        de `status`; `invalid_transition` → error general del formulario).
      - Tests: `tests/unit/pedidos-ui/order-form.test.tsx` (R7: la edición no pinta
        `order-status-select` y el `FormData` no lleva `status`; un `invalid_transition` sale como
        error general); `order-sheet.test.tsx`, `read-only.test.tsx` y `a11y-tactil.test.tsx` si
        cuentan controles del panel.
      - **Hecho**: tests de `tests/unit/pedidos-ui/` en verde.
      - Depende de: T3.

## Bloque 5 — E2E, alcance y cierre

- [ ] **T12. E2E con los tres roles.** (`design.md > 10`; R28, R30, R7.)
      - Archivos: `e2e/pedidos-terminados.spec.ts` (nuevo). Roles **reales del seed** (Operador,
        Empacador, Administrador), nunca creados por el test. Siembra en una empresa propia del
        test: un pedido ENTREGADO **no asignado** al Empacador con `finished_at`, un ENTREGADO sin
        fecha, un PENDIENTE y un CANCELADO. Casos: Operador ve «Mis asignados» y no ve las pestañas
        «Terminados»/«Todos», y `?vista=terminados` no le enseña nada ajeno; Empacador ve
        «Terminados» con el pedido ajeno, su fecha y «Sin fecha» al final, y no ve «Todos»;
        Administrador ve solo «Todos» con los cuatro estados, filtra por Entregado y ve el orden de
        terminados, sin entrada a ejecución; en `/pedidos` el panel de edición no ofrece estado.
        Limpia sus filas al terminar.
      - **Hecho**: `pnpm run e2e -- pedidos-terminados` en verde contra `QuimiCloude_QC145`
        sembrada (`pnpm run db:seed`); el resto de `e2e/pedidos*.spec.ts` sigue en verde (el de
        `/pedidos` pudo usar el selector de estado: se ajusta aquí si lo hacía).
      - Depende de: T9, T10, T11.

- [ ] **T13. Alcance, trazabilidad y gate.** (R5, R10, R16, R29; `CHECKPOINTS.md`.)
      - Archivos: `tests/unit/pedidos/qc145-estado-solo-planta.test.ts` (nuevo: fuente sin
        comentarios; `finishedAt` solo en `transitionAliveOrder`; `status` solo lo escriben el alta,
        `transitionAliveOrder` y `cancelAliveOrder`, R5 y R10; `package.json` sin dependencias
        nuevas y catálogo en 16, R16 y R29),
        `progress/impl_QC-145-pedidos-terminados-en-asignacion.md` (mapa `R1`-`R30` → test,
        verificado contra `design.md > 10`, y la salida del ciclo de migración de T1).
      - **Hecho**: `./init.sh` **completo** en verde; cada `R<n>` con al menos un test que existe y
        pasa; sin citas de ficha ni de requisito en comentarios de producción del diff.
      - Depende de: T1-T12.

---

## Resumen de dependencias

```
T1 ─┬─ T2 ── T4 ─┬─ T6 ─┐
    │            └─ T7 ─┼─ T8 ─ T9 ─ T10 ─┐
T5 ─┴───────────────────┘                 ├─ T12 ─ T13
T3 ─────────────────────── T11 ───────────┘
```

`[P]`: T5 con T1-T4 · T3 con T1/T2 · T6 con T7 (hay que integrar `index.ts`) · T10 con T11.
En serie por archivo compartido: T2 → T4 (`order-catalog-prisma.ts`).
