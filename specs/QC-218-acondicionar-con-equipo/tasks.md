# QC-218 — acondicionar-con-equipo · tasks.md

> Orden y dependencias entre corchetes. `[P]` = puede ir en paralelo con las demás `[P]` de su
> tanda. Cada task cierra con `pnpm run typecheck`, `pnpm run lint`, `pnpm exec vitest related --run
> <archivos>` y, si toca guardias, `pnpm exec vitest run guard`. **No se corre `pnpm test`.**
> Las decisiones D11–D14 (2026-10-08) están en `requirements.md > Decisiones cerradas`.

## Tanda 1 — datos y contratos (backend_dev)

- [x] **T1. Migración y esquema** (R23, R32).
  `OrderConditioningTeamMember` en `db/schema.prisma` (`design.md > 1.1`). Migración
  `20261008150000_order_conditioning_team`:
  - `migration.sql`: tabla, índices, único de posición, dos `CHECK`, tres FK y RLS forzada, con el
    drift borrado a mano;
  - `down.sql`: `DROP TABLE`.

  Alta en `tests/guards/guard-identificador-de-request.test.ts`.
  **Hecho:** aplica y revierte limpio. `tests/unit/asignaciones/schema/conditioning-team-migration.test.ts`
  afirma el SQL. `tests/integration/asignaciones/conditioning-team-constraints.int.test.ts` prueba
  que la base rechaza:
  - empresa cruzada de persona, grupo o pedido;
  - grupo sin nombre y nombre sin grupo;
  - persona repetida;
  - `position` negativa o repetida;

  y que el rollback deja la base como antes (R32).

- [x] **T2 [P]. Puerto y adaptador del equipo** (R13, R14) [T1].
  `ports/conditioning-team-repository.ts` y `adapters/driven/persistence/conditioning-team-prisma.ts`,
  con la fábrica `createConditioningTeamRepository(db)` (`design.md > 2.1, 2.2`).
  **Hecho:** `tests/integration/asignaciones/conditioning-team-repository.int.test.ts` comprueba:
  - `insertAll` y `listByOrderInCompany` ordenan por `position` y filtran por empresa;
  - una inserción con duplicado lanza;
  - renombrar o dar de baja el grupo, o sacar a un miembro, no cambia ninguna fila (R14).

- [x] **T3 [P]. Listado de grupos en `identity`** (R7).
  `WorkGroupDirectory.listSnapshotsAliveInCompany` y su implementación en
  `assignment-directory-prisma.ts`, con dos consultas en total (`design.md > 2.3`).
  **Hecho:** `tests/integration/identity/assignment-directory.int.test.ts` gana casos:
  - solo grupos vivos de la empresa;
  - orden por nombre;
  - tope;
  - `activeMemberIds` con el estado efectivo;
  - exactamente dos consultas.

- [x] **T4 [P]. Repositorio de acondicionamiento sobre `tx`** (R12, R22).
  `createOrderConditioningRepository(db)` en `order-prisma.ts`. Las dos funciones exportadas delegan
  en ella (`design.md > 2.4`).
  **Hecho:** `tests/integration/pedidos/order-conditioning.int.test.ts` y
  `guard-ambito-empresa-pedidos` siguen en verde sin cambiar aserciones.

- [x] **T5. Errores nuevos** (R16, R17).
  `ConditioningTeamMemberNotAllowedError` y `ConditioningTeamEmptyError` en `domain/errors.ts`,
  con sus códigos en `error-codes.ts` y los textos en `error-catalog.ts` (`design.md > 3.5`).
  **Hecho:** los tests del catálogo cerrado de errores, en verde con los dos códigos.

## Tanda 2 — dominio (backend_dev)

- [x] **T6. `conditioning-team.ts`** (R13, R15, R16, R17, R18) [T2, T5].
  `startConditioningSchema` y `composeConditioningTeam`, puros (`design.md > 3.1`).
  **Hecho:** `tests/unit/asignaciones/conditioning-team.test.ts` cubre:
  - la forma de la entrada (R18): listas ausentes, repetidos, las dos vacías, claves de más;
  - los tres errores de las sueltas, en orden (R16);
  - la omisión silenciosa de Administradores e inactivos en grupos (R15);
  - «gana el primero» y `position` (R13);
  - el equipo vacío (R17).

- [x] **T7. Comenzar con equipo** (R12, R16–R22, R24) [T3, T4, T6].
  `ExecutionWriters` gana `conditioning` y `team`, y `lib/composition/index.ts` los construye sobre
  `tx`. `start-conditioning.ts` sigue los cinco pasos de `design.md > 3.2`.
  **Hecho:** `tests/unit/asignaciones/start-conditioning.test.ts`, reescrito con dobles, cubre:
  - el orden auth → zod → pedido → equipo → transacción;
  - cero puertos tras `unauthorized` o `invalid_input`;
  - los errores del pedido antes que los del equipo (R20);
  - `already_mine` sin resolver el equipo ni escribir (R21).

  `tests/integration/asignaciones/start-conditioning-team.int.test.ts` cubre:
  - pedido y equipo escritos juntos, y un fallo inyectado en `insertAll` que deja el pedido
    `POR_ACONDICIONAR` (R12);
  - el snapshot del grupo al comenzar (R13);
  - dos comienzos concurrentes con equipos distintos, que dejan solo el equipo del ganador (R22);
  - un miembro del equipo, sin el permiso, que no ve el pedido en «Mis asignados»; los responsables
    del pedido sin cambios; el miembro sin permiso recibe `unauthorized` y el acondicionador miembro
    que no acondiciona recibe `order_conditioning_taken` al terminar (R24, R29).

- [x] **T8 [P]. Candidatos del modal** (R6, R7, R30) [T3].
  `list-conditioning-team-candidates.ts` y la clave `listConditioningTeamCandidates` en la fachada
  (`design.md > 3.3`).
  **Hecho:** `tests/unit/asignaciones/list-conditioning-team-candidates.test.ts` cubre:
  - `unauthorized` antes de zod y sin puertos;
  - ni Administradores ni inactivos;
  - el tope heredado (D13);
  - `contributes` y `excludedAdministrators` por grupo, incluido un grupo de solo Administradores
    con `contributes = 0`.

- [x] **T9 [P]. Detalle con equipo** (R25, D12) [T2].
  `getConditioningOrder` devuelve `ConditioningOrderDetail` con `team`, leído solo en
  `EN_ACONDICIONAMIENTO` y `TERMINADO` (`design.md > 3.4`).
  **Hecho:** `tests/unit/asignaciones/get-conditioning-order.test.ts` gana casos:
  - equipo con sueltas y grupo;
  - nombre de una persona dada de baja;
  - en `POR_ACONDICIONAR` no se lee el equipo.

- [x] **T10. Server Actions** (R27, R28) [T7].
  `order-conditioning-actions.ts` (`design.md > 4`) y `CONDITIONED_ORDER_PARAM` en
  `lib/shared/routes.ts`.
  **Hecho:** `tests/unit/asignaciones/order-conditioning-actions.test.ts` cubre:
  - `FormData` con `getAll`;
  - `revalidatePath` del detalle al comenzar;
  - `redirect` con `vista=por_acondicionar&acondicionado=<n>` al terminar, con el pedido en `TERMINADO` (D11);
  - el `ErrorState` por `code`.

- [x] **T11. Barrido del permiso y fachada** (R31) [T8].
  `tests/unit/identity/roles/acondicionamiento-rol.test.ts` suma el caso de uso de candidatos.
  `tests/unit/composition/asignaciones-facade.test.ts` suma la clave nueva.
  **Hecho:** `pnpm exec vitest run guard` y los dos tests, en verde.

## Tanda 3 — pantalla (frontend_dev)

- [x] **T12. Botón con espera** (R9, R10, R11).
  `countdown-gated-button.tsx` con `CountdownTimer` y `CONDITIONING_WAIT_SECONDS = 5`.
  **Hecho:** `tests/unit/asignaciones-ui/countdown-gated-button.test.tsx` comprueba con timers
  falsos:
  - deshabilitado y «00:05» al montar;
  - habilitado a los 5 s;
  - sigue deshabilitado si `disabled`;
  - una `key` nueva reinicia la cuenta.

- [x] **T13. Selector y modal de Acondicionar** (R5–R9, R28) [T10, T12].
  `conditioning-team-picker.tsx` y `start-conditioning-dialog.tsx` (`design.md > 5.2`, N2, N3).
  **Hecho:** `tests/unit/asignaciones-ui/start-conditioning-dialog.test.tsx` cubre:
  - los cuatro elementos de R5;
  - un grupo con «· n personas» y la línea de Administradores;
  - un grupo con `contributes = 0` deshabilitado;
  - «Comenzar» deshabilitado sin selección y durante la espera;
  - `userIds` y `workGroupIds` en el formulario;
  - el error en `role="alert"` con lo marcado conservado;
  - la cuenta reiniciada al reabrir.

- [x] **T14. Modal de Terminar** (R10, R26, R28) [T10, T12].
  `finish-conditioning-dialog.tsx` sobre `AlertDialog` (`design.md > 5.3`).
  **Hecho:** `tests/unit/asignaciones-ui/finish-conditioning-dialog.test.tsx` cubre:
  - confirmar deshabilitado durante la espera;
  - «Cancelar» no envía;
  - el error en `role="alert"` con el modal abierto.

- [x] **T15. Detalle y aviso** (R1–R4, R25, R27) [T9, T13, T14].
  `conditioning-actions.tsx`, `conditioning-team-list.tsx` (D12), `conditioning-order-screen.tsx` y
  el `page.tsx` del detalle (`canStart`, `canFinish` y candidatos solo con `canStart`, `design.md >
  5.1`). Además, `ConditionedOrderNotice` en `/asignacion` y en el barrel de
  `app/(private)/asignacion/components`.
  **Hecho:**
  - `tests/unit/asignaciones-ui/conditioning-order-screen.test.tsx` cubre los cuatro casos de
    R1–R3: solo «Acondicionar», solo «Terminar», ninguno con otra persona y ninguno en `TERMINADO`;
    también el equipo agrupado (R25);
  - `tests/unit/asignaciones-ui/conditioning-order-page.test.tsx`: candidatos solo en
    `POR_ACONDICIONAR`, y `canFinish` solo si `conditionedById === actor.id`;
  - `tests/unit/asignaciones-ui/conditioned-order-notice.test.tsx`: el texto «Pedido <n>
    acondicionado»;
  - `tests/unit/identity/session-once-per-request-render.test.tsx`, en verde;
  - ningún botón de acción en las filas de las dos pestañas (R4), por los tests de columnas
    existentes.

## Tanda 4 — E2E y cierre

- [ ] **T16. E2E nuevo** (R33, R34) [T15].
  `e2e/acondicionar-con-equipo.spec.ts`, con el patrón de `e2e/acondicionamiento.spec.ts`:
  - roles reales del seed;
  - empresa nueva con dos acondicionadores, un Administrador, un Operador y un grupo con el Operador
    y el Administrador;
  - un pedido `POR_ACONDICIONAR` sembrado con `packed_by`.

  **Hecho:** `pnpm exec playwright test e2e/acondicionar-con-equipo.spec.ts` en verde:
  - el recorrido completo de R33, con la espera real de 5 s en los dos modales;
  - el caso de R34 con el acondicionador 2.

- [ ] **T17. Ajuste del E2E de QC-217** (R35) [T15].
  En `e2e/acondicionamiento.spec.ts`, la aserción «cero botones» del detalle del pedido A pasa a
  «el único botón es Acondicionar».
  **Hecho:** `pnpm exec playwright test e2e/acondicionamiento.spec.ts` en verde, sin otra línea
  cambiada.

- [ ] **T18. Cierre** (R36) [todas].
  `./init.sh` en verde. `package.json` sin dependencias nuevas. `progress/impl_QC-218.md` con el mapa
  `R<n> -> test` de R1–R36.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261008150000_order_conditioning_team/migration.sql`
- `db/migrations/20261008150000_order_conditioning_team/down.sql`
- `lib/modules/asignaciones/ports/conditioning-team-repository.ts`
- `lib/modules/asignaciones/ports/execution-transaction.ts`
- `lib/modules/asignaciones/adapters/driven/persistence/conditioning-team-prisma.ts`
- `lib/modules/asignaciones/adapters/driving/order-conditioning-actions.ts`
- `lib/modules/asignaciones/domain/conditioning-team.ts`
- `lib/modules/asignaciones/domain/start-conditioning.ts`
- `lib/modules/asignaciones/domain/list-conditioning-team-candidates.ts`
- `lib/modules/asignaciones/domain/get-conditioning-order.ts`
- `lib/modules/asignaciones/domain/conditioning-order-view.ts`
- `lib/modules/asignaciones/domain/errors.ts`
- `lib/modules/asignaciones/index.ts`
- `lib/modules/errores/domain/error-codes.ts`
- `lib/modules/errores/domain/error-catalog.ts`
- `lib/modules/identity/domain/work-group-directory.ts`
- `lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma.ts`
- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`
- `lib/composition/index.ts`
- `lib/shared/routes.ts`
- `app/(private)/asignacion/page.tsx`
- `app/(private)/asignacion/components/index.ts`
- `app/(private)/asignacion/components/conditioned-order-notice.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/page.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/index.ts`
- `app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-order-screen.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-actions.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/start-conditioning-dialog.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-team-picker.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/finish-conditioning-dialog.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/countdown-gated-button.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-team-list.tsx`
- `tests/guards/guard-identificador-de-request.test.ts`
- `tests/unit/asignaciones/schema/conditioning-team-migration.test.ts`
- `tests/integration/asignaciones/conditioning-team-constraints.int.test.ts`
- `tests/integration/asignaciones/conditioning-team-repository.int.test.ts`
- `tests/integration/asignaciones/start-conditioning-team.int.test.ts`
- `tests/integration/identity/assignment-directory.int.test.ts`
- `tests/unit/asignaciones/conditioning-team.test.ts`
- `tests/unit/asignaciones/start-conditioning.test.ts`
- `tests/unit/asignaciones/conditioning-doubles.ts`
- `tests/unit/asignaciones/list-conditioning-team-candidates.test.ts`
- `tests/unit/asignaciones/get-conditioning-order.test.ts`
- `tests/unit/asignaciones/order-conditioning-actions.test.ts`
- `tests/unit/composition/asignaciones-facade.test.ts`
- `tests/unit/identity/roles/acondicionamiento-rol.test.ts`
- `tests/unit/identity/session-once-per-request-render.test.tsx`
- `tests/unit/asignaciones-ui/countdown-gated-button.test.tsx`
- `tests/unit/asignaciones-ui/start-conditioning-dialog.test.tsx`
- `tests/unit/asignaciones-ui/finish-conditioning-dialog.test.tsx`
- `tests/unit/asignaciones-ui/conditioning-order-screen.test.tsx`
- `tests/unit/asignaciones-ui/conditioning-order-page.test.tsx`
- `tests/unit/asignaciones-ui/conditioned-order-notice.test.tsx`
- `e2e/acondicionar-con-equipo.spec.ts`
- `e2e/acondicionamiento.spec.ts`
