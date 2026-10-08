# QC-217 — pestana-por-acondicionar · tasks.md

> Orden: T1 → T2 → T3 → (T4 [P] T5) → T6 → T7 → T8. `[P]` = paralelizable con la marcada a su
> lado. Cada task cierra con `pnpm run typecheck`, `pnpm run lint` y
> `pnpm exec vitest related --run <archivos de la task>`. El E2E solo en T7.
> Spec aprobado el 2026-10-08 con D9–D12. Hechos fijos:
>
> - «Terminados» del acondicionador lista solo `TERMINADO`;
> - sus columnas son las del Empacador;
> - «Envases» es el reparto completo, que ya viaja en el resumen (`presentationLines`). Solo hay que
>   añadir `conditionedBy` (T1).

## [x] T1 — `pedidos`: el resumen publica `conditionedBy` y filtra por él (backend)

- `AssignedOrderSummary.conditionedBy: string | null`. `filter.conditionedBy?` en
  `OrderCatalog.listAliveSummariesInCompany`, `OrderSummaryReader.listAliveInCompany` y
  `listAliveOrderSummariesInCompany`. `SUMMARY_SELECT` y `toOrderSummaryRecord` lo leen
  (`design.md > 2`).
- Fakes de `AssignedOrderSummary` en los tests unitarios: `conditionedBy: null`, sin tocar ninguna
  aserción.
- Test de integración nuevo, `tests/integration/pedidos/order-catalog-conditioned-by.int.test.ts`:
  - con `filter.conditionedBy` devuelve solo los de esa persona, con `total` y paginación del
    conjunto filtrado;
  - un `conditioned_by` nulo no entra;
  - sin filtro, el resultado es idéntico al de antes;
  - `conditionedBy` viaja en el resumen.

**Hecho:** typecheck verde con los fakes ajustados; el test de integración verde; los tests
existentes de `order-catalog` y `finished-orders` siguen verdes sin cambiar ninguna aserción.

## [x] T2 — `asignaciones`: fila, tres casos de uso, vistas y composición (backend) · depende de T1

- `domain/conditioning-order-view.ts`, con `composeConditioningOrderRows` (`design.md > 3.2`).
- `domain/list-conditioning-orders.ts`, `domain/list-conditioned-orders.ts` y
  `domain/get-conditioning-order.ts` (`design.md > 3.3`).
- `domain/assignment-views.ts`: `AssignmentViewKind` y `resolveAssignmentViews` (`design.md > 3.1`).
- Barrel `index.ts` y tres claves al final de la fachada en `lib/composition/index.ts`.
- Tests unitarios nuevos:
  - `tests/unit/asignaciones/list-conditioning-orders.test.ts`: R6, R7 (reparto completo en orden
    de alta), R19, R20;
  - `tests/unit/asignaciones/list-conditioned-orders.test.ts`:
    - R11: solo `['TERMINADO']`, con `filter.conditionedBy = actor.id`; un `ENTREGADO` suyo no sale;
    - R13: no exige `terminados.consultar`, y `listFinishedOrders` sigue igual;
    - R19, R20;
  - `tests/unit/asignaciones/get-conditioning-order.test.ts`: R15, R17 (todos los casos de 404,
    `ENTREGADO` incluido, con el mismo error), R19, R20.
- Tests que se amplían:
  - `tests/unit/asignaciones/assignment-views.test.ts`: R1, R3;
  - `tests/unit/asignaciones/acondicionamiento-authorization.test.ts`: R16 de QC-216 pasa a afirmar
    R2 (enmienda);
  - `tests/unit/composition/asignaciones-facade.test.ts`: las tres claves nuevas.

**Hecho:** los tests nombrados verdes. Cada caso de autorización afirma que ningún puerto se invocó.

## [x] T3 — Barrido del permiso (guardias) · depende de T2

- `tests/unit/identity/roles/acondicionamiento-rol.test.ts`: dos listas, casos de uso y
  consumidores que no son caso de uso (`design.md > 6`). La comparación exacta sigue siendo
  `toEqual` sobre la unión. Un caso sintético con una ruta no abierta sigue disparando (R21).

**Hecho:** `pnpm exec vitest run guard` verde y el test del barrido verde. Quitar cualquiera de las
ocho rutas de la lista lo pone rojo (comprobado a mano una vez).

## [x] T4 [P con T5] — Pestañas «Por acondicionar» y «Terminados» (frontend) · depende de T2

- `lib/shared/routes.ts`: `conditioningOrderRoute`.
- Componentes de `design.md > 4.2` y barrel. `assignment-view-tabs.tsx`: etiquetas y `testid` de
  las dos vistas. `page.tsx`: las dos ramas.
- Tests nuevos:
  - `tests/unit/asignaciones-ui/conditioning-orders-columns.test.tsx`:
    - R8: cinco columnas; «Envases» = «12 × 500 g / 4 × 1 kg», «Sin presentación», «—»;
    - R12: `buildConditionedOrdersColumns()` tiene los mismos ids, rótulos y orden que
      `buildFinishedOrdersColumns()`, y solo el número cambia, a enlace;
    - R13: las columnas del Empacador siguen sin enlace;
    - R14: enlace y 44 px;
  - `tests/unit/asignaciones-ui/conditioning-orders-list-section.test.tsx`: R9, R10, el texto
    vacío de R12, el error.
- Tests que se amplían:
  - `tests/unit/asignaciones-ui/asignacion-page.test.tsx`: R2 (aterrizaje), R4, R5;
  - `tests/unit/identity/session-once-per-request-render.test.tsx`: las dos vistas;
  - `tests/unit/pedidos-ui/order-route-contract.test.ts`: `conditioningOrderRoute`, si fija las
    rutas de `/asignacion`.

**Hecho:** tests verdes; en el navegador, con un usuario del rol, se ven las dos pestañas.

## [x] T5 [P con T4] — Detalle `/asignacion/acondicionamiento/[id]` (frontend) · depende de T2

- `page.tsx` y `components/` (`conditioning-order-screen.tsx`, `index.ts`), según
  `design.md > 4.3`.
- Tests nuevos:
  - `tests/unit/asignaciones-ui/conditioning-order-page.test.tsx`: R17 (404 con
    `OrderNotFoundError` y con un id no uuid), R18 (404 sin el permiso antes de llamar a la
    fachada);
  - `tests/unit/asignaciones-ui/conditioning-order-screen.test.tsx`: R15 y R16 (cero `button`, cero
    `form`, enlace de vuelta según estado).
- Tests que se amplían:
  - `tests/guards/guard-pantallas-exigen-permiso.test.ts`: veintiuna pantallas;
  - `tests/unit/identity/require-page-permission.test.ts`: con los permisos del rol pasa el
    detalle; con los de Administrador, Operador y Empacador, «no encontrado» (R18);
  - `tests/unit/identity/session-once-per-request-render.test.tsx`: el detalle.

**Hecho:** tests verdes y guardias verdes.

## T6 — Verificación de cierre de las capas · depende de T3, T4, T5

`./init.sh` en verde. `docs/conventions.md > Comentarios`: ninguna cita de ficha ni de requisito en
producción.

**Hecho:** `./init.sh` verde, sin avisos nuevos.

## T7 — E2E (`e2e/acondicionamiento.spec.ts`) · depende de T6

Escenarios de `design.md > 7`:

- R22, con el acondicionador: pedido A con dos líneas de reparto, y un `ENTREGADO` suyo que no sale;
- R23, un `test` por cada rol sin el permiso.

**Hecho:** `pnpm exec playwright test e2e/acondicionamiento.spec.ts` verde sobre una base sembrada.
`e2e/empaque.spec.ts` sigue verde.

## T8 — Trazabilidad · depende de T7

`progress/impl_QC-217-pestana-por-acondicionar.md` con el mapa `R1…R24 → test`. R24 se cubre por
revisión del diff (sin `package.json`, `db/schema.prisma` ni `db/migrations/`) y por
`guard-dependencias-aprobadas`.

**Hecho:** cada `R<n>` tiene al menos un test concreto con `R<n>` en el nombre del caso.

## Archivos esperados

### Producción

- `lib/modules/pedidos/domain/order-catalog.ts`
- `lib/modules/pedidos/ports/order-summary-reader.ts`
- `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`
- `lib/modules/asignaciones/domain/assignment-views.ts`
- `lib/modules/asignaciones/domain/conditioning-order-view.ts`
- `lib/modules/asignaciones/domain/list-conditioning-orders.ts`
- `lib/modules/asignaciones/domain/list-conditioned-orders.ts`
- `lib/modules/asignaciones/domain/get-conditioning-order.ts`
- `lib/modules/asignaciones/index.ts`
- `lib/composition/index.ts`
- `lib/shared/routes.ts`
- `app/(private)/asignacion/page.tsx`
- `app/(private)/asignacion/components/index.ts`
- `app/(private)/asignacion/components/assignment-view-tabs.tsx`
- `app/(private)/asignacion/components/conditioning-orders-list-section.tsx`
- `app/(private)/asignacion/components/conditioned-orders-list-section.tsx`
- `app/(private)/asignacion/components/conditioning-orders-table.tsx`
- `app/(private)/asignacion/components/conditioning-orders-columns.tsx`
- `app/(private)/asignacion/components/conditioned-orders-table.tsx`
- `app/(private)/asignacion/components/conditioned-orders-columns.tsx`
- `app/(private)/asignacion/components/order-distribution-full.tsx`
- `app/(private)/asignacion/components/conditioning-orders-empty.tsx`
- `app/(private)/asignacion/components/conditioning-orders-skeleton.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/page.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/index.ts`
- `app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-order-screen.tsx`

### Tests nuevos

- `tests/integration/pedidos/order-catalog-conditioned-by.int.test.ts`
- `tests/unit/asignaciones/list-conditioning-orders.test.ts`
- `tests/unit/asignaciones/list-conditioned-orders.test.ts`
- `tests/unit/asignaciones/get-conditioning-order.test.ts`
- `tests/unit/asignaciones-ui/conditioning-orders-columns.test.tsx`
- `tests/unit/asignaciones-ui/conditioning-orders-list-section.test.tsx`
- `tests/unit/asignaciones-ui/conditioning-order-page.test.tsx`
- `tests/unit/asignaciones-ui/conditioning-order-screen.test.tsx`
- `e2e/acondicionamiento.spec.ts`

### Tests ampliados

- `tests/unit/asignaciones/assignment-views.test.ts`
- `tests/unit/asignaciones/acondicionamiento-authorization.test.ts`
- `tests/unit/composition/asignaciones-facade.test.ts`
- `tests/unit/asignaciones-ui/asignacion-page.test.tsx`
- `tests/unit/identity/roles/acondicionamiento-rol.test.ts`
- `tests/unit/identity/require-page-permission.test.ts`
- `tests/unit/identity/session-once-per-request-render.test.tsx`
- `tests/unit/pedidos-ui/order-route-contract.test.ts`
- `tests/guards/guard-pantallas-exigen-permiso.test.ts`

### Fixtures que ganan `conditionedBy: null` (T1)

- `tests/unit/pedidos/order-catalog.test.ts`
- `tests/unit/asignaciones/list-assigned-orders.test.ts`
- `tests/unit/asignaciones/list-packing-orders.test.ts`
- `tests/unit/asignaciones/get-packing-order.test.ts`
- `tests/unit/asignaciones/get-assigned-order-execution.test.ts`
- `tests/unit/asignaciones/start-assigned-order.test.ts`
- `tests/unit/asignaciones/list-company-orders.test.ts`
- `tests/unit/asignaciones/list-finished-orders.test.ts`

### Trazabilidad

- `progress/impl_QC-217-pestana-por-acondicionar.md`
