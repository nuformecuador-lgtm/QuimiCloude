# QC-138 — estado-bloqueado-por-inventario-insuficiente · tasks.md

> Cada tarea lista **los archivos que toca**, para validar conflictos en F2.0, sobre todo contra
> QC-168 (`design.md > 10`). `[P]` significa que puede ir en paralelo con las demás `[P]` del mismo
> nivel una vez cumplidas sus dependencias. «Hecho» incluye siempre que pase `./init.sh --rapido`.
> Los tests nombran el `R<n>` en el título del caso.

## T0. [x] Confirmar las respuestas de F1.4 y el estado de QC-168

- **Depende de:** aprobación del spec.
- **Archivos:** ninguno de producción. Solo `progress/impl_QC-138-...md`, donde se anota si
  QC-168 ya está en `dev`. P1-P10 y las preguntas 2 y 3 quedaron aprobadas el 2026-09-25 en F1.4
  tal como estaban propuestas (`requirements.md > Decisiones cerradas`, D17-D27); la pregunta 1
  sigue abierta y no bloquea.
- **Hecho:** R4, R12, R16, R20, R23, R27 y R31 son firmes, con la propuesta aprobada. El orden del
  enum está decidido según `design.md > 10`.

## T1. [x] Enum `BLOQUEADO` y mapas exhaustivos que no compilan sin él

- **Depende de:** T0.
- **Archivos:**
  - `db/schema.prisma`.
  - `db/migrations/<ts>_order_status_blocked/migration.sql` y `down.sql`.
  - `lib/modules/pedidos/domain/order-classification.ts`.
  - `lib/modules/pedidos/domain/order-transitions.ts`.
  - `lib/modules/pedidos/domain/cancel-order.ts`.
  - `lib/modules/asignaciones/domain/order-state.ts`.
  - `app/(private)/pedidos/components/order-status-badge.tsx` y `order-row-actions.tsx`.
  - `app/(private)/asignacion/components/company-orders-columns.tsx` y
    `assignment-view-params.ts`.
  - Tests: `tests/unit/pedidos/module-contract.test.ts`,
    `tests/unit/pedidos/schema/pedidos-migration.test.ts`,
    `tests/unit/pedidos/order-transitions.test.ts`, `tests/unit/pedidos/cancel-order.test.ts`,
    `tests/unit/pedidos/delete-order.test.ts`, `tests/unit/asignaciones/order-state.test.ts`,
    `tests/integration/pedidos/pedidos-constraints.int.test.ts`.
- **Hecho:**
  - `module-contract` en verde, con el valor al final.
  - La matriz probada par a par: 7×7 = 49 casos tras el rebase sobre QC-168 (5×5 = 25 en la versión aprobada).
  - Se cancela un `BLOQUEADO`.
  - Se borra lógicamente un `BLOQUEADO`.
  - La asignación admite un `BLOQUEADO`.
  - El `down.sql` falla si hay filas `BLOQUEADO` y revierte si no las hay (test de integración
    de rollback).
- **Cubre:** R25, R27, R28, R33, R35, R36.

## T2. [x] [P] Índice parcial de bloqueados

- **Depende de:** T1.
- **Archivos:** `db/migrations/<ts+1>_orders_blocked_index/migration.sql` y `down.sql`;
  `tests/unit/pedidos/schema/pedidos-migration.test.ts`.
- **Hecho:** la migración aplica y revierte. El test del esquema encuentra el índice con su
  predicado.
- **Cubre:** apoyo de R16 y R18.

## T3. [x] [P] `ReservationOutcome` distingue `insufficient`

- **Depende de:** T0.
- **Archivos:**
  - `lib/modules/inventario/domain/reservation.ts`.
  - `lib/modules/inventario/adapters/driven/persistence/reservation-prisma.ts`.
  - `tests/integration/inventario/reservation.int.test.ts`.
  - `tests/helpers/order-unit-of-work-double.ts`.
- **Hecho:**
  - Receta sin líneas → `not_reserved`.
  - Disponible insuficiente → `insufficient`, con los productos que faltan y sin apartar nada.
  - Producto sin lotes → `insufficient`.
  - En la edición, lo apartado por el propio pedido cuenta como disponible.
  - Los tests existentes de QC-141 siguen en verde.
- **Cubre:** R1, R2, R4, R5 (parte de inventario).

## T4. [x] Errores nuevos del catálogo

- **Depende de:** T0.
- **Archivos:**
  - `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts`.
  - `lib/modules/pedidos/domain/errors.ts`.
  - `lib/modules/asignaciones/domain/errors.ts`.
  - El test de la guardia del catálogo (`tests/guards/`, el que ya compara códigos con textos).
- **Hecho:** `order_would_block` y `order_blocked` tienen su texto. La guardia del catálogo está
  en verde.
- **Cubre:** apoyo de R6 y R32.

## T5. [x] Puertos de escritura y lectura de `pedidos`

- **Depende de:** T1, T2.
- **Archivos:**
  - `lib/modules/pedidos/ports/order-write-repository.ts`.
  - `lib/modules/pedidos/ports/order-repository.ts`.
  - `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`.
  - `tests/integration/pedidos/order-repository.int.test.ts`.
  - `tests/unit/pedidos/qc145-estado-solo-planta.test.ts` (solo si la lista de funciones cambia de
    nombre; no debería cambiar).
- **Qué se añade:** `setStatus` con `actorId` anulable, `setIngredientsCost` y `findBlockedIds`.
- **Hecho:**
  - `findBlockedIds` devuelve solo bloqueados vivos de la empresa, en orden `(created_at, id)`.
  - Un pedido de otra empresa no aparece.
  - La guardia de QC-145 sigue en verde: ningún bloque `data:` nuevo con `status:`.
- **Cubre:** R16, R18, R38 (lectura).

## T6. [x] Alta y edición bloquean con confirmación

- **Depende de:** T3, T4, T5.
- **Archivos:**
  - `lib/modules/pedidos/domain/order-input.ts`.
  - `lib/modules/pedidos/domain/create-order.ts`.
  - `lib/modules/pedidos/domain/update-order.ts`.
  - `lib/modules/pedidos/adapters/driving/order-actions.ts`.
  - Tests: `tests/unit/pedidos/create-order.test.ts`, `update-order.test.ts`,
    `order-input.test.ts`, `order-actions.test.ts`, `authorization.test.ts`,
    `company-isolation-service.test.ts`; `tests/integration/pedidos/order-crud.int.test.ts`.
- **Hecho:**
  - Sin confirmación → `order_would_block` y ninguna fila escrita, ni pedido ni movimiento
    (integración).
  - Con confirmación → `BLOQUEADO`, sin apartado, `reserved_at` nulo y sin importe.
  - Una edición que alcanza desbloquea y aparta.
  - Un `PENDIENTE` que pasa a `BLOQUEADO` libera todo, con quien edita como autor.
  - Un `EN_CURSO` que deja de alcanzar → `insufficient_material` sin escribir nada.
  - Receta sin líneas → `PENDIENTE`.
  - Importe nulo por una unidad incompatible, con la reserva cubierta → `PENDIENTE`.
  - Si se confirma pero entre tanto alcanza → `PENDIENTE`.
  - Sin `pedidos.modificar` → `unauthorized` antes de leer nada.
- **Cubre:** R1, R2, R3, R5, R6, R8 (servidor), R10, R11, R12, R26, R37 (parte de pedidos),
  R38 (escritura).

## T7. [x] Caso de uso `reviewBlockedOrders`

- **Depende de:** T5, T3.
- **Archivos:**
  - `lib/modules/pedidos/domain/review-blocked-orders.ts` (nuevo).
  - `lib/modules/pedidos/index.ts`.
  - Tests: `tests/unit/pedidos/review-blocked-orders.test.ts` (nuevo),
    `tests/integration/pedidos/review-blocked-orders.int.test.ts` (nuevo).
- **Hecho:**
  - Desbloquea el que alcanza: aparta, pasa a `PENDIENTE`, fija `reserved_at` al instante de la
    revisión y recalcula el importe, también a nulo.
  - Deja intacto el que no alcanza.
  - Revisa del más antiguo al más nuevo: con material para uno solo, se desbloquea el más
    antiguo.
  - No toca los `PENDIENTE` ni otra empresa.
  - Autor nulo en el pedido y en los apartados.
  - Un fallo en un pedido no impide los demás y aparece en `failed` con su código.
  - Dos revisiones concurrentes desbloquean una sola vez (integración con dos transacciones).
  - Una cancelación que llega antes impide el desbloqueo.
- **Cubre:** R14, R15, R16, R17, R18, R22, R23 (parte de pedidos), R24.

## T8. [x] Disparo desde inventario y cableado

- **Depende de:** T7.
- **Archivos:**
  - `lib/modules/inventario/domain/stock-increase-listener.ts` (nuevo).
  - `lib/modules/inventario/index.ts`.
  - `lib/modules/inventario/domain/create-product.ts` y `adjust-batch-stock.ts`.
  - `lib/composition/index.ts`.
  - Tests: `tests/unit/inventario/create-product.test.ts`, `adjust-batch-stock.test.ts`;
    `tests/integration/pedidos/review-blocked-orders.int.test.ts`; el test de arquitectura de
    módulos (`tests/guards/guard-arquitectura-modulos.test.ts`), que no se edita: tiene que
    seguir en verde.
- **Hecho:**
  - El alta (primer lote y lote adicional) y el ajuste positivo llaman al listener una vez,
    después de confirmar.
  - El ajuste negativo no lo llama.
  - Un fallo de la revisión no hace fallar el alta ni el ajuste: el lote queda escrito.
  - Un alta en la empresa A no desbloquea pedidos de B (integración, a través de la fachada
    cableada).
  - Un usuario con solo `inventario.modificar` desbloquea.
  - La guardia de arquitectura está en verde.
- **Cubre:** R13, R19, R20, R23, R37 (parte de inventario), R38.

## T9. [x] [P] Asignaciones: el Operador ve el bloqueado y no lo arranca

- **Depende de:** T1, T4.
- **Archivos:**
  - `lib/modules/asignaciones/domain/list-assigned-orders.ts`, `assigned-order-view.ts`,
    `get-assigned-order-execution.ts` y `start-assigned-order.ts`.
  - Tests: `tests/unit/asignaciones/list-assigned-orders.test.ts`,
    `get-assigned-order-execution.test.ts`, `start-assigned-order.test.ts`;
    `tests/integration/asignaciones/batch-states.int.test.ts`.
- **Hecho:**
  - La lista incluye los `BLOQUEADO` asignados.
  - Abrir o arrancar un bloqueado → `order_blocked` y el estado no cambia.
  - Un pedido bloqueado por una edición entre la lectura y la transición → `order_blocked`.
- **Cubre:** R28 (planta), R30, R32.

## T10. [x] [P] Proceso diario ignora los bloqueados

- **Depende de:** T6.
- **Archivos:** `tests/integration/pedidos/order-expiry.int.test.ts`. No se espera cambio de
  código: el filtro ya exige `PENDIENTE`.
- **Hecho:** un `BLOQUEADO` creado hace más de 15 días sigue `BLOQUEADO` después de la ejecución.
- **Cubre:** R29.

## T11. [x] UI de Pedidos: modal y estado

- **Depende de:** T6.
- **Archivos:**
  - `app/(private)/pedidos/components/order-form.tsx`.
  - `app/(private)/pedidos/components/blocked-order-dialog.tsx` (nuevo).
  - `app/(private)/pedidos/components/index.ts`.
  - `app/(private)/pedidos/components/order-status-badge.tsx`.
  - Tests: `tests/unit/pedidos-ui/order-form.test.tsx`,
    `tests/unit/pedidos-ui/blocked-order-dialog.test.tsx` (nuevo),
    `tests/unit/pedidos-ui/order-columns.test.tsx`.
- **Hecho:**
  - Ante `order_would_block` aparece un modal con exactamente dos botones.
  - «Guardar bloqueado» reenvía con `confirmBlocked=true`.
  - «Volver» cierra el modal sin llamar a la action y los campos conservan su valor.
  - El filtro de estado ofrece «Bloqueado».
  - Objetivos táctiles de al menos 44 px.
- **Cubre:** R7, R8 (cliente), R9, R34 (Pedidos).

## T12. [x] [P] UI de Asignación

- **Depende de:** T9.
- **Archivos:**
  - `app/(private)/asignacion/components/assigned-orders-columns.tsx`,
    `assigned-order-enter-trigger.tsx`, `company-orders-columns.tsx` y
    `assignment-view-params.ts`.
  - Tests: `tests/unit/asignaciones-ui/assigned-order-enter-trigger.test.tsx`,
    `company-orders-columns.test.tsx`, `assignment-view-params.test.ts` y `a11y-tactil.test.tsx`.
- **Hecho:**
  - El bloqueado se pinta con la etiqueta y un botón deshabilitado, sin enlace, con el motivo
    visible.
  - «Todos» filtra por `BLOQUEADO`.
  - El test táctil está en verde.
- **Cubre:** R31, R34 (Asignación).

## T13. [x] Transversales

- **Depende de:** T6, T8.
- **Archivos:** `tests/unit/pedidos/qc138-transversales.test.ts` (nuevo).
- **Qué comprueba el test:**
  - El catálogo de permisos no gana ningún código respecto de su padre: comprueba que no aparece
    ningún código nuevo, sin fijar un número, para no chocar con QC-168.
  - `package.json` no gana dependencias.
  - Ninguna escritura nueva usa `delete` sobre `orders` ni sobre `reservation_movements`.
  - Los identificadores nuevos de las migraciones están en inglés.
- **Hecho:** los cuatro casos están en verde.
- **Cubre:** R37, R39.

## T14. [x] E2E

- **Depende de:** T8, T11, T12.
- **Archivos:** `e2e/pedido-bloqueado.spec.ts` (nuevo).
- **Hecho:** recorre el flujo de R40 en la configuración de Playwright del repo y pasa en
  `./init.sh` completo.
- **Cubre:** R40, y además R7, R13, R14 y R31 de punta a punta.

## T15. [x] Cierre

- **Depende de:** todas.
- **Archivos:** `progress/impl_QC-138-...md`.
- **Hecho:**
  - Mapa `R1..R40 → test` completo en `progress/impl_QC-138-...md`.
  - Ningún comentario de producción cita fichas.
  - `./init.sh` completo en verde.

## Trazabilidad prevista R → tarea

| R | Tarea(s) | | R | Tarea(s) |
|---|---|---|---|---|
| R1 | T3, T6 | | R21 | T1, T6, T7 (no hay acción manual; el test comprueba que la fachada no publica ninguna) |
| R2 | T3, T6 | | R22 | T7 |
| R3 | T6 | | R23 | T7, T8 |
| R4 | T3 | | R24 | T7 |
| R5 | T3, T6 | | R25 | T1 |
| R6 | T6 | | R26 | T6 |
| R7 | T11 | | R27 | T1 |
| R8 | T6, T11 | | R28 | T1, T9 |
| R9 | T11 | | R29 | T10 |
| R10 | T6 | | R30 | T9 |
| R11 | T6 | | R31 | T12 |
| R12 | T6 | | R32 | T9 |
| R13 | T8 | | R33 | T1 |
| R14 | T7, T14 | | R34 | T11, T12 |
| R15 | T7 | | R35 | T1 |
| R16 | T7 | | R36 | T1 |
| R17 | T7 | | R37 | T6, T8, T13 |
| R18 | T5, T7 | | R38 | T5, T6, T8 |
| R19 | T8 | | R39 | T13 |
| R20 | T8 | | R40 | T14 |
