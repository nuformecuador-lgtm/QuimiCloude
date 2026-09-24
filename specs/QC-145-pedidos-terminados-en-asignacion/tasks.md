# QC-145 — pedidos-terminados-en-asignacion · tasks.md

> Desglose de `design.md` (vuelta 2: D13-D16 cerradas). Cada task lista los **archivos que toca**
> (el leader los usa para validar conflictos con otras features en curso, en especial QC-82 sobre
> `order-catalog-prisma.ts`), su criterio de «hecho» y sus dependencias. `[P]` = puede ir en
> paralelo con las que se indican. Un commit por task (`docs/conventions.md > Commits`). En
> producción, ningún comentario cita fichas ni requisitos. `R<n>` va en el **nombre** de los casos
> de test.
>
> **Base de datos propia, sin excepción.** La migración (T1) y **todos** los tests de integración de
> F2 corren contra una base propia **`QuimiCloude_QC145`**, con el `.env` git-ignorado del worktree
> apuntando a ella. **Nunca** contra la base del `.env` del árbol principal. Antes de cada
> `db:migrate`, `db:rollback` o test de integración se comprueba que `DATABASE_URL` y `DIRECT_URL`
> nombran `QuimiCloude_QC145`.
>
> Cada tanda se cierra con `./init.sh --rapido`; la ficha y el PR, con `./init.sh` completo.
> No quedan preguntas abiertas. D17: las asignaciones previas se dejan como están, sin migración de
> datos, y ninguna task toca los casos de uso de ejecución. D18: en T9, el miembro de grupo con
> `pedidos.consultar` se omite en silencio.

---

## Bloque 1 — Base

- [x] **T1. Migración `orders.finished_at`: columna, CHECK e índice parcial.** (`design.md > 1`; R1, R2, R4, R29.)
      - Archivos: `db/schema.prisma` (modelo `Order`: `finishedAt`, una línea sobre el `CHECK`),
        `db/migrations/20260923120000_orders_finished_at/migration.sql` y `down.sql` (nuevos; el
        timestamp, mayor que el último de `db/migrations/` al crearla).
      - Tests: `tests/unit/pedidos/schema/orders-finished-at-migration.test.ts` (nuevo: anulable,
        sin `DEFAULT` ni backfill, `CHECK orders_finished_at_requires_delivered`, índice parcial
        `finished_at DESC NULLS LAST, order_year DESC, order_sequence DESC`, `down.sql` inverso, el SQL no
        nombra `order_assignments` (R37), con casos de sensibilidad); `pedidos-schema.test.ts` si enumera columnas.
      - Proceso: contra **`QuimiCloude_QC145`**, `db:migrate` → `db:rollback` → `db:migrate`; la
        salida se pega en `progress/impl_QC-145-…md`; `prisma generate`.
      - **Hecho**: ciclo real completo sobre `QuimiCloude_QC145` y el test del esquema en verde.
      - Depende de: nada.

## Bloque 2 — `pedidos`

- [x] **T2. Finalizar escribe la fecha.** (`design.md > 2.1`; R3, R5, R10.)
      - Archivos: `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts` (solo el
        `data` de `transitionAliveOrder`). **No** toca `finish-assigned-order.ts`.
      - Tests: `tests/unit/pedidos/order-catalog.test.ts` (R3);
        `tests/integration/pedidos/order-finished-at.int.test.ts` (nuevo: R3 por el caso de uso
        real, R4 y R2).
      - **Hecho**: estos tests y `guard-ambito-empresa-pedidos` en verde.
      - Depende de: T1.

- [x] **T3. [P con T2] La edición deja de mover el estado.** (`design.md > 2.3`; R6, R8, R9.)
      - Archivos: `lib/modules/pedidos/domain/order-input.ts`, `order-view.ts` (`OrderEdit`),
        `update-order.ts`, `ports/order-repository.ts`,
        `adapters/driven/persistence/order-prisma.ts` (`updateAliveOrder`),
        `adapters/driving/order-actions.ts` (`buildUpdateCandidate`), `lib/modules/pedidos/index.ts`.
      - Tests (con los fixtures arreglados en el mismo commit): `update-order.test.ts` (R6, R8),
        `order-input.test.ts` (R6), `order-actions.test.ts`, `module-contract.test.ts` si enumera,
        `cancel-order.test.ts` (R9, sin cambios); `tests/integration/pedidos/order-crud.int.test.ts`
        (R6).
      - **Hecho**: `pnpm run typecheck` en verde (si la UI deja de compilar, T14 en la misma tanda)
        y estos tests en verde.
      - Depende de: nada.

- [x] **T4. `OrderCatalog.listAliveSummariesInCompany` y `finishedAt` en el resumen.** (`design.md > 2.2`; R17, R20, R22, R24, R27.)
      - Archivos: `lib/modules/pedidos/domain/order-catalog.ts`, `lib/modules/pedidos/index.ts`,
        `adapters/driven/persistence/order-catalog-prisma.ts`.
      - Tests: `order-catalog.test.ts` (R20: `nulls: 'last'` y número descendente [D14]; `work_queue`
        idéntico al de hoy); integración de ámbito, borrados, filtro y `total` contra
        `QuimiCloude_QC145`. Los dobles de `OrderCatalog` en `tests/unit/asignaciones/**` ganan el
        método.
      - **Hecho**: estos tests y `guard-arquitectura-modulos` en verde.
      - Depende de: T1. **En serie con T2**: tocan el mismo archivo.

## Bloque 3 — `identity` y `asignaciones`

- [x] **T5. [P con T1-T4] Vistas por permiso.** (`design.md > 3.1`; R11-R15.)
      - Archivos: `lib/modules/asignaciones/domain/assignment-views.ts` (nuevo),
        `lib/modules/asignaciones/index.ts`.
      - Tests: `tests/unit/asignaciones/assignment-views.test.ts` (nuevo).
      - **Hecho**: tests en verde.
      - Depende de: nada.

- [x] **T6. [P con T1-T5] `PeopleDirectory`: permisos en `PersonRef` y `listAliveInCompany`.** (`design.md > 3.5`, `> 3.6`; R32, R33.)
      - Archivos: `lib/modules/identity/domain/people-directory.ts`,
        `lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma.ts` (`select`
        con los códigos de permiso del rol; método nuevo con empresa, vivos, orden y tope).
      - Tests: `tests/unit/identity/**` del directorio si existe; integración de identity sobre
        `QuimiCloude_QC145` (permisos correctos por rol; otra empresa no vuelve; tope 25). En el
        mismo commit, los dobles de `PeopleDirectory` en `tests/unit/asignaciones/**` y
        `tests/unit/inventario/**` ganan `permissions` y `listAliveInCompany`.
      - **Hecho**: `pnpm run typecheck` y estos tests en verde; `guard-arquitectura-modulos` en verde
        (sin `prisma.<modelo>` ajeno).
      - Depende de: nada.

- [x] **T7. Caso de uso «Terminados» y helper de composición.** (`design.md > 3.2`; R17-R21, R27.)
      - Archivos: `lib/modules/asignaciones/domain/list-finished-orders.ts`,
        `finished-order-view.ts`, `compose-order-rows.ts` (nuevos),
        `list-assigned-orders.ts` (usa el helper **sin cambiar su salida**),
        `lib/modules/asignaciones/index.ts`,
        `tests/unit/identity/roles/empacador-rol.test.ts` (enmienda de QC-144 R16: dos archivos
        exactos).
      - Tests: `tests/unit/asignaciones/list-finished-orders.test.ts` (nuevo: R17, R19, R21
        responsables incluido el actor, R27); `authorization.test.ts` (R18);
        `list-assigned-orders.test.ts` **sin cambios de expectativa** (R11: el refactor no se nota);
        `empacador-authorization.test.ts` si enumera.
      - **Hecho**: estos tests en verde.
      - Depende de: T4, T5.

- [x] **T8. Caso de uso «Todos».** (`design.md > 3.3`; R22-R25, R27, R31.)
      - Archivos: `lib/modules/asignaciones/domain/list-company-orders.ts`,
        `company-order-view.ts` (nuevos), `lib/modules/asignaciones/index.ts`.
      - Tests: `tests/unit/asignaciones/list-company-orders.test.ts` (nuevo: R22; R24/D16:
        exactamente `['ENTREGADO']` → `finished_recent_first`, mezcla → `work_queue`, duplicados
        deduplicados; R25; `finishedAt` viaja siempre; R27); `authorization.test.ts` (R23).
      - **Hecho**: estos tests en verde.
      - Depende de: T7 (el helper). Tocan el mismo `index.ts`: van en serie.

- [x] **T9. [P con T7-T8] Quién puede ser responsable: rechazo en el service.** (`design.md > 3.5`; R33-R37.)
      - Archivos: `lib/modules/asignaciones/domain/responsible-eligibility.ts` (nuevo:
        `canBeResponsible`), `assign-responsibles.ts` (paso 4: rechazo; paso 5: omitir en silencio,
        D18), `errors.ts` (`UserCannotBeResponsibleError`),
        `lib/modules/asignaciones/index.ts`, `lib/modules/errores/domain/error-codes.ts` y
        `error-catalog.ts` (`user_cannot_be_responsible`).
      - Tests: `tests/unit/asignaciones/responsible-eligibility.test.ts` (nuevo: por permiso, la
        firma no recibe rol); `assign-responsibles.test.ts` (R33: rechazo entero sin escribir, orden
        de rechazos; R34 y R36: un grupo con un Administrador y un Operador no falla, el Operador
        queda asignado y el Administrador sin fila);
        `tests/integration/asignaciones/responsible-eligibility.int.test.ts` (nuevo, sobre
        `QuimiCloude_QC145`: R33 llamando al caso de uso directamente; R34 y R36; R35: un
        Administrador no asignado recibe `order_not_found` en get/start/finish y no se escribe nada;
        R37: un Administrador con una fila sembrada directamente en `order_assignments` antes sigue
        pudiendo abrir, arrancar y finalizar ese pedido); el test del catálogo de `errores` si
        enumera códigos.
      - **No** toca `get-assigned-order-execution.ts`, `start-assigned-order.ts`,
        `finish-assigned-order.ts` ni `app/(private)/asignacion/[id]/**` (D17).
      - **Hecho**: estos tests en verde.
      - Depende de: T6.

- [x] **T10. [P con T9] Candidatos del selector.** (`design.md > 3.6`; R32.)
      - Archivos: `lib/modules/asignaciones/domain/list-responsible-candidates.ts` (nuevo),
        `lib/modules/asignaciones/index.ts`.
      - Tests: `tests/unit/asignaciones/list-responsible-candidates.test.ts` (nuevo: excluye a quien
        tiene `pedidos.consultar`, conserva al resto y su orden, exige `asignaciones.modificar`,
        esquema estricto).
      - **Hecho**: estos tests en verde.
      - Depende de: T6, T9 (`canBeResponsible`).

- [x] **T11. Server Actions y composición.** (`design.md > 4`, `> 5`.)
      - Archivos: `lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts` (tres
        acciones), `lib/composition/index.ts`, `tests/guards/guard-qc87-no-reimplementado.test.ts`
        (`ACCIONES` +3), `tests/unit/identity/session-once-per-request-actions.test.ts` si su lista lo
        exige.
      - Tests: `order-assignment-actions.test.ts` (delegan con el actor de la sesión;
        `user_cannot_be_responsible` sale traducido por `code`);
        `tests/integration/asignaciones/finished-orders.int.test.ts` (R17, R19, R20 estable entre
        páginas y «sin fecha» descendente, R30) y `company-orders.int.test.ts` (R22, R24, rechazo
        cruzado de empresa), los dos nuevos y sobre `QuimiCloude_QC145`.
      - **Hecho**: `typecheck` y `lint` del repo en verde, y `./init.sh --rapido` en verde.
      - Depende de: T2, T8, T9, T10.

## Bloque 4 — UI

- [x] **T12. `/asignacion`: vistas, pestañas y parámetros.** (`design.md > 6.1`, `> 6.2`, `> 6.6`; R11-R15, R27.)
      - Archivos: `app/(private)/asignacion/page.tsx`,
        `components/assignment-view-tabs.tsx`, `components/assignment-view-params.ts` (nuevos),
        `components/assigned-orders-list-params.ts` (los href conservan `vista`),
        `components/index.ts`.
      - Tests: `tests/unit/asignaciones-ui/asignacion-page.test.tsx`,
        `assignment-view-params.test.ts` (nuevos); `assigned-orders-list-params.test.ts` y
        `assigned-orders-route-contract.test.ts` si fijan href o contenido;
        `session-once-per-request-render.test.tsx`.
      - **Hecho**: estos tests en verde y las pestañas miden al menos 44 × 44 px.
      - Depende de: T5, T11.

- [x] **T13. Listas «Terminados» y «Todos».** (`design.md > 6.3`, `> 6.4`; R19, R21, R24-R27, R31.)
      - Archivos (nuevos, en `app/(private)/asignacion/components/`): `finished-orders-*` y
        `company-orders-*` (sección, tabla, columnas, vacío, esqueleto), `index.ts`. El error se
        reutiliza de `assigned-orders-error.tsx` si su API lo permite.
      - Tests: `finished-orders-columns.test.tsx` (R21: presentación, fecha o «Sin fecha» y
        responsables; R26); `company-orders-columns.test.tsx` (R25, R24 filtro; R31: la fecha solo
        aparece con el filtro exactamente ENTREGADO; R26); `*-list-section.test.tsx` (R19, R27);
        `a11y-tactil.test.tsx`.
      - **Hecho**: `tests/unit/asignaciones-ui/` en verde y la revisión multiplataforma hecha.
      - Depende de: T11, T12.

- [x] **T14. [P con T13] Pedidos: formulario de edición sin estado.** (`design.md > 6.5`; R7.)
      - Archivos: `app/(private)/pedidos/components/order-form.tsx`.
      - Tests: `tests/unit/pedidos-ui/order-form.test.tsx` (R7); `order-sheet.test.tsx`,
        `read-only.test.tsx` y `a11y-tactil.test.tsx` si cuentan controles.
      - **Hecho**: `tests/unit/pedidos-ui/` en verde.
      - Depende de: T3.

- [x] **T15. [P con T13] Pedidos: selector de responsables sin personas con `pedidos.consultar`.** (`design.md > 6.7`; R32.)
      - Archivos: `app/(private)/pedidos/components/order-list-section.tsx`
        (`loadResponsiblesCatalog` usa `listResponsibleCandidatesAction`).
      - Tests: `tests/unit/pedidos-ui/order-list-section.test.tsx` (R32: el catálogo de personas sale
        de la acción nueva; la degradación de QC-102 se reescribe según `design.md > 3.6`, con su
        porqué); `order-responsibles.test.tsx` y `assign.test.tsx` si simulan `listUsersAction`.
      - **Hecho**: `tests/unit/pedidos-ui/` en verde.
      - Depende de: T11. **Mismo directorio que T14, archivos distintos.**

## Bloque 5 — E2E, alcance y cierre

- [x] **T16. E2E con los tres roles.** (R28, R30, R7, R32, R35.)
      - Archivos: `e2e/pedidos-terminados.spec.ts` (nuevo). Usa los roles **reales del seed**. La
        siembra va en una empresa propia del test: un ENTREGADO con `finished_at` no asignado al
        Empacador, un ENTREGADO sin fecha, un PENDIENTE y un CANCELADO.
      - Casos:
        - **Operador**: solo «Mis asignados», sin pestañas.
        - **Empacador**: ve «Terminados» con el pedido ajeno, su fecha, sus responsables y «Sin
          fecha» al final; no ve «Todos».
        - **Administrador**: solo «Todos» con los cuatro estados; al filtrar Entregado aparecen la
          columna de fecha y el orden de terminados; sin entrada a ejecución; `/asignacion/<id>` de
          un pedido le responde «no encontrado».
        - **`/pedidos`**: el panel de edición no ofrece estado y el selector de responsables no
          lista al Administrador.
        - Al terminar, el test borra sus filas.
      - **Hecho**: `pnpm run e2e -- pedidos-terminados` en verde contra `QuimiCloude_QC145`
        sembrada, y el resto de `e2e/pedidos*.spec.ts` también (se ajustan aquí si usaban el
        selector de estado o asignaban a un Administrador).
      - Depende de: T12, T13, T14, T15.

- [x] **T17. Alcance, trazabilidad y gate.** (R5, R10, R16, R29; `CHECKPOINTS.md`.)
      - Archivos: `tests/unit/pedidos/qc145-estado-solo-planta.test.ts` (nuevo: `finishedAt` solo
        en `transitionAliveOrder`; quién escribe `status`; `package.json` sin dependencias nuevas;
        catálogo con 16 permisos), `progress/impl_QC-145-pedidos-terminados-en-asignacion.md` (mapa
        `R1`-`R37` → test, verificado contra `design.md > 10`, más la salida del ciclo de T1).
      - **Hecho**: `./init.sh` **completo** en verde; cada `R<n>` tiene un test que existe y pasa;
        el diff no deja citas de ficha en comentarios de producción.
      - Depende de: T1-T16.

---

## Resumen de dependencias

```
T1 ─┬─ T2 ── T4 ── T7 ── T8 ─┐
    │                        │
T5 ─┴────────────────────────┤
T6 ─┬─ T9 ─ T10 ─────────────┼─ T11 ─ T12 ─ T13 ─┐
    └────────────────────────┘          T15 ─────┼─ T16 ─ T17
T3 ────────────────────────────────── T14 ───────┘
```

`[P]`:
- T5, T6 y T3: con T1-T4.
- T9 y T10: con T7-T8.
- T13, T14 y T15: entre sí.

En serie por archivo compartido:
- T2 → T4, por `order-catalog-prisma.ts`.
- T7 → T8, y T9/T10 al integrar, por `asignaciones/index.ts`.
