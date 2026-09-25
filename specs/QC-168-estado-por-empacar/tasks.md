# QC-168 — estado-por-empacar · tasks.md

> Cada task: **Toca** (archivos, para cruzar en F2.0), **Hacer**, **Hecho cuando**. `[P]` = puede ir
> en paralelo con las demás `[P]` de su tanda. Dependencias en «Tras». Cierre de tanda:
> `./init.sh --rapido`; cierre de feature: `./init.sh`.

## Tanda 1 — base de datos y contrato de estados

### T1 [x] — Migración de esquema
**Toca:** `db/schema.prisma` (enum `OrderStatus`, `Order.packedBy`),
`db/migrations/20260925120000_order_packing_states/{migration.sql,down.sql}`,
`tests/unit/pedidos/schema/pedidos-schema.test.ts`, `tests/unit/pedidos/schema/pedidos-migration.test.ts`,
`tests/unit/pedidos/schema/order-packing-states-migration.test.ts` (nuevo),
`tests/integration/pedidos/order-packing-constraints.int.test.ts` (nuevo), `tests/integration/aislamiento.json`.
**Hacer:** §1.1–1.3 de `design.md`.
**Hecho cuando:** `db:migrate` → `db:rollback` → `db:migrate` en limpio; test estático compara cada
CHECK/índice recreado en `down.sql` con su definición literal; integración prueba 23514 de
`orders_packed_by_matches_status` y `orders_delivered_not_deleted`, 23503 de la FK con usuario de otra
empresa, `finished_at` rechazado en `POR_EMPACAR` (R1, R3, R8, R28, R32, R46, R47).

### T2 [x] — Estados y matriz en `pedidos`
Tras T1. **Toca:** `lib/modules/pedidos/domain/order-classification.ts`, `order-transitions.ts`,
`index.ts` (`ORDER_STATUS_FLOW`), `tests/unit/pedidos/module-contract.test.ts`,
`order-transitions.test.ts`, `update-order.test.ts`.
**Hacer:** 6 valores, `ORDER_STATUS_FLOW`, matriz de `design.md > 2`.
**Hecho cuando:** los 36 pares de la matriz probados; editar `POR_EMPACAR`/`EN_EMPAQUE` da
`invalid_transition` sin llamar a la unidad de trabajo (R1, R2, R32).

### T3 [x] [P] — Cancelar y borrar
Tras T2. **Toca:** `lib/modules/pedidos/domain/delete-order.ts`, `tests/unit/pedidos/cancel-order.test.ts`,
`delete-order.test.ts`, `tests/unit/pedidos/expire-stale-orders.test.ts`.
**Hacer:** `NO_BORRABLES` + dos estados; `CANCELABLES` sin cambios.
**Hecho cuando:** cancelar los dos estados ⇒ `not_cancellable` sin liberar; borrar ⇒ `not_deletable`;
cancelar `PENDIENTE`/`EN_CURSO` igual que hoy; el proceso diario no toca los dos estados (R29–R32).

### T4 [x] [P] — Permiso `empaque.modificar`
**Toca:** `lib/modules/identity/domain/permissions.ts` (catálogo, seed, `ADMIN_EXCLUDED_PERMISSIONS`),
`lib/modules/identity/index.ts`, `db/migrations/20260925120100_packing_permission/{migration.sql,down.sql}`,
`tests/unit/identity/permissions.test.ts`, `tests/unit/identity/seed/seed-initial-access.test.ts`,
`tests/integration/identity/identity-seed.int.test.ts`,
`tests/integration/identity/packing-permission-migration.int.test.ts` (nuevo), `tests/integration/aislamiento.json`.
**Hacer:** `design.md > 5`.
**Hecho cuando:** catálogo = previo + 1 sin total fijo; Empacador con sus tres; Administrador y
Operador sin cambios; migración idempotente y reversible; guardias `guard-permisos-sembrados` y
`catalogo-sin-total-fijo` verdes (R34–R38).

### T5 [x] [P] — Códigos de error
**Toca:** `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts`,
`lib/modules/asignaciones/domain/errors.ts`, `tests/unit/errores/catalogo.test.ts`.
**Hacer:** `order_packing_taken`, `order_not_packable`, `order_produced_frozen` (⚑ P1) con sus clases.
**Hecho cuando:** `guard-catalogo-de-errores` verde; mensajes de `design.md > 3`.

## Tanda 2 — dominio

### T6 [x] — Finalizar deja `POR_EMPACAR`
Tras T2. **Toca:** `lib/modules/pedidos/domain/transition-order.ts`, `order-catalog.ts` (doc),
`lib/modules/asignaciones/domain/finish-assigned-order.ts`,
`lib/modules/asignaciones/adapters/driving/order-execution-actions.ts` (doc),
`tests/unit/pedidos/transition-order.test.ts`, `tests/unit/asignaciones/finish-assigned-order.test.ts`,
`tests/integration/pedidos/finish-with-finished-goods.int.test.ts`, `order-finished-at.int.test.ts`.
**Hecho cuando:** Finalizar sobre `EN_CURSO` ⇒ `POR_EMPACAR`, consumo + lote en la misma transacción,
`finished_at` nulo; cada error deshace todo; `transitionAliveById` rechaza destinos `EN_EMPAQUE` y
`ENTREGADO`; doble Finalizar no da segundo lote (R4–R8, R10).

### T7 [x] [P] — Estados congelados en `asignaciones`
Tras T5. **Toca:** `lib/modules/asignaciones/domain/order-state.ts`, `start-assigned-order.ts`,
`tests/unit/asignaciones/order-state.test.ts`, `start-assigned-order.test.ts`,
`assign-responsibles`/`unassign-responsible`/`remove-work-group-from-order` tests.
**Hecho cuando:** los dos estados rechazan las tres escrituras y la apertura con `order_produced_frozen`;
la consulta de responsables sigue (R11, R33).

### T8 [x] — Métodos de empaque en `pedidos`
Tras T1, T2. **Toca:** `lib/modules/pedidos/domain/order-catalog.ts`, `order-packing.ts` (nuevo),
`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`, `order-catalog-prisma.ts`
(`packedBy` en el resumen), `lib/composition/index.ts`, `tests/unit/pedidos/order-packing.test.ts`
(nuevo), `tests/integration/pedidos/order-packing.int.test.ts` (nuevo), `tests/integration/aislamiento.json`.
**Hecho cuando:** los cinco/cuatro resultados de `design.md > 3`; dos Comenzar concurrentes reales ⇒
uno `ok` y uno `taken`; Terminar escribe estado + fecha en una sentencia; otra empresa ⇒ `not_found`;
`guard-ambito-empresa-pedidos` verde (R18–R24, R28).

### T9 [x] [P] — Envases del lote por pedido en `inventario`
**Toca:** `lib/modules/inventario/domain/product-catalog.ts`,
`lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`, `lib/composition/index.ts`,
`tests/unit/inventario/product-catalog.test.ts`, `tests/integration/inventario/finished-goods-receipts.int.test.ts`
(nuevo), `tests/integration/aislamiento.json`.
**Hecho cuando:** devuelve los envases del asiento de producción por pedido, solo de la empresa;
`guard-ambito-empresa-inventario` verde (R14).

### T10 [x] — Casos de uso de empaque en `asignaciones`
Tras T5, T8, T9. **Toca:** `lib/modules/asignaciones/domain/{list-packing-orders,get-packing-order,start-packing,finish-packing,packing-order-view}.ts`
(nuevos), `assignment-views.ts`, `index.ts`, `lib/composition/index.ts`,
`tests/unit/asignaciones/{list-packing-orders,start-packing,finish-packing,get-packing-order}.test.ts`
(nuevos), `assignment-views.test.ts`, `authorization.test.ts`, `tests/unit/composition/asignaciones-facade.test.ts`.
**Hecho cuando:** autorización primero sin tocar puertos; lista solo los dos estados de la empresa con
los seis datos y el orden de trabajo; errores mapeados; ningún puerto de inventario de escritura
invocado (R12–R25, R39).

## Tanda 3 — pantallas

### T11 [x] — Server Actions de empaque
Tras T10. **Toca:** `lib/modules/asignaciones/adapters/driving/order-packing-actions.ts` (nuevo),
`lib/shared/routes.ts` (`packingOrderRoute`, `PACKED_ORDER_PARAM`),
`tests/unit/asignaciones/order-packing-actions.test.ts` (nuevo), test de una lectura de sesión por petición.
**Hecho cuando:** traduce errores por `code`, redirige tras Terminar (R26).

### T12 [x] — Pestaña «Por empacar»
Tras T10. **Toca:** `app/(private)/asignacion/page.tsx`, `app/(private)/asignacion/components/{index.ts,packing-orders-list-section.tsx,packing-orders-columns.tsx,packing-orders-skeleton.tsx,packed-order-notice.tsx,assignment-view-params.ts,company-orders-columns.tsx,assigned-order-delivered-notice.tsx}`,
tests en `tests/unit/asignaciones-ui/`.
**Hecho cuando:** pestaña solo con el permiso y al final; «Todos» con etiquetas y filtro nuevos;
confirmación «Pedido N por empacar»; 44×44 (R9, R14, R16, R39, R41, R43).

### T13 [x] — Pantalla del pedido de empaque
Tras T11. **Toca:** `app/(private)/asignacion/empaque/[id]/page.tsx`,
`app/(private)/asignacion/empaque/[id]/components/{index.ts,packing-order-screen.tsx}` (nuevos),
`tests/unit/asignaciones-ui/packing-order-page.test.tsx` (nuevo).
**Hecho cuando:** 404 sin permiso; Comenzar/Terminar/ninguno según R17; `guard-pantallas-exigen-permiso`
verde (R17, R40, R43).

### T14 [x] [P] — Pedidos: etiquetas y acciones cerradas
Tras T2. **Toca:** `app/(private)/pedidos/components/order-status-badge.tsx`, `order-row-actions.tsx`,
`tests/unit/pedidos-ui/order-row-actions.test.tsx`, `order-columns.test.tsx`.
**Hecho cuando:** etiquetas nuevas; editar/cancelar/borrar deshabilitados con motivo visible; barrel
sin exportaciones perdidas (R42).

## Tanda 4 — cierre

### T15 [x] [P] — Enmiendas fechadas en specs cerrados
**Toca:** `specs/QC-63-…/requirements.md`, `specs/QC-141-…/requirements.md`,
`specs/QC-150-…/requirements.md`, `specs/QC-145-…/requirements.md`, `specs/QC-74-…/requirements.md`,
`specs/QC-144-rol-empacador/requirements.md`, `docs/architecture.md` (pregunta 2 del dominio).
**NO toca** `specs/QC-82-…` (R45).
**Hecho cuando:** cada requisito de `design.md > 8` lleva nota «Enmendado el <fecha> por QC-168».

### T16 [x] — E2E
Tras T12, T13, T14. **Toca:** `e2e/empaque.spec.ts` (nuevo), `e2e/ejecucion-receta.spec.ts`,
`e2e/producto-terminado.spec.ts`, `e2e/reserva-de-material.spec.ts`, `e2e/pedidos-terminados.spec.ts`,
`e2e/pedidos-asignados.spec.ts`.
**Hecho cuando:** recorrido de R48 verde y los E2E existentes adaptados a Finalizar → Por empacar.

### T17 [ ] — Gate completo y trazabilidad
Tras todas. **Toca:** `progress/impl_QC-168-estado-por-empacar.md`.
**Hecho cuando:** `./init.sh` verde; mapa `R1..R48 → test` completo.
