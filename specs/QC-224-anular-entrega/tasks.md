# QC-224 — anular-entrega · tasks.md

> **Orden:** T0 (contrato, secuencial) → B1 → bloques B (backend) y F (frontend), en paralelo entre
> sí donde se marca `[P]` → TC (barrido de censos) → TI (E2E) → TZ (cierre).
>
> **Reglas de toda la feature:**
> - Ningún archivo de un bloque B aparece en un bloque F, y al revés. Las excepciones son T0 y TI.
> - Gate de cada tanda: `pnpm run typecheck`, `pnpm run lint`,
>   `pnpm exec vitest related --run <archivos tocados>` y `pnpm exec vitest run guard`. Gate de TZ:
>   `./init.sh`.
> - Un commit por task (`feat(QC-224): …` / `test(QC-224): …`).
> - Ningún comentario de producción cita la ficha, un `R<n>`, un `D<n>` ni el spec. En los tests, el
>   `R<n>` va en el nombre del caso.
> - Toda enmienda de un censo o de una guardia conserva sus aserciones previas y lleva una nota
>   fechada.

---

## [x] T0 — Publicar el contrato (bloquea todo lo demás)

Implementa `design.md > 2` tal cual, con el stub de `design.md > 2.7`.

Archivos:
- `lib/modules/inventario/domain/finished-goods-return.ts` (nuevo): `FinishedGoodsReturn*` y
  `BatchLotDirectory`.
- `lib/modules/inventario/index.ts`: lo exporta en una sentencia propia, sin `…Deps`.
- `lib/modules/inventario/domain/inventory-movement.ts`: `kind` gana `'delivery_void'` y aparece
  `orderDeliveryVoidId?`. En `lib/modules/inventario/domain/reservation.ts`,
  `BatchHistoryEntry['kind']` gana `'delivery_void'`.
- `app/(private)/inventario/components/batch-history.tsx`: `KIND_LABELS.delivery_void = 'Anulación de
  entrega'` (si no, el `Record` exhaustivo no compila).
- `lib/modules/pedidos/ports/order-delivery-void-repository.ts` y
  `order-delivery-void-unit-of-work.ts` (nuevos).
- `lib/modules/pedidos/domain/list-order-deliveries.ts` y `void-delivery.ts` (nuevos): firma,
  `…Deps`, el permiso como primera sentencia (`pedidos.consultar` y `entregas.anular`) y un cuerpo
  stub que lanza `ActionNotAllowedError`.
- `lib/modules/pedidos/domain/errors.ts`: `DeliveryNotFoundError` y `DeliveryAlreadyVoidedError`.
- `lib/modules/pedidos/index.ts`: exporta lo anterior.
- `lib/modules/identity/domain/permissions.ts`: `entregas.anular`, el párrafo de enmienda y el
  Administrador (va en T0 porque `PermissionCode` lo necesita).
- `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts`: los dos códigos y sus textos.
- `lib/modules/pedidos/adapters/driving/order-actions.ts`: `listOrderDeliveriesAction` y
  `voidDeliveryAction` con su forma definitiva (`design.md > 2.4`).
- `lib/composition/index.ts`: `pedidos.listOrderDeliveries` y `pedidos.voidDelivery` con dobles
  mínimos. B5 los sustituye.
- `tests/fixtures/order-delivery-void.ts` (nuevo): `design.md > 2.6`.
- Ajustes mínimos para que compile y siga verde, con nota fechada:
  `tests/unit/identity/permissions.test.ts` y los tests del catálogo de errores.

Cubre: base de R1, R2, R4, R35.

**Hecho cuando:**
- el gate de la tanda está en verde;
- el test de unicidad del catálogo de errores está en verde;
- se verificó de nuevo que ningún producto terminado puede ser ingrediente de una receta
  (`design.md > 4.2`). Si no es así, se anota y se para;
- hay commit `feat(QC-224): publica el contrato de la anulacion de entregas`.

---

## Bloque B — backend (`backend_dev`)

### [ ] B1 — Migraciones, esquema y permiso sembrado
Depende de: T0.

Archivos:
- `db/migrations/20261009120000_inventory_movement_kind_delivery_void/migration.sql` y `down.sql`.
- `db/migrations/20261009120100_order_delivery_voids/migration.sql` y `down.sql`.
- `db/migrations/20261009120200_delivery_void_permission/migration.sql` y `down.sql`.
- Las tres según `design.md > 3`. Antes: el timestamp va detrás de la última migración de
  `origin/dev` y de las features en vuelo, y el texto vigente de los dos CHECK que se reescriben.
- `db/schema.prisma`: `OrderDeliveryVoid`, `OrderDeliveryVoidLine`, las relaciones inversas en
  `OrderDelivery` y `OrderDeliveryLine`, `InventoryMovement.orderDeliveryVoidId` y
  `InventoryMovementKind.delivery_void`.
- Enmiendas de censo, con nota fechada:
  - `tests/guards/guard-identificador-de-request.test.ts` (`MIGRACIONES_ESPERADAS`);
  - `tests/unit/pedidos/schema/pedidos-schema.test.ts`;
  - `tests/unit/inventario/schema/inventario-schema.test.ts`,
    `tests/unit/inventario/schema/inventario-migration.test.ts`,
    `tests/unit/inventario/schema/finished-product-enum-values-migration.test.ts` y
    `tests/unit/proveedores/schema/proveedores-migration.test.ts`, solo si enumeran el tipo entero.
- Tests nuevos:
  - `tests/unit/pedidos/schema/order-delivery-voids-migration.test.ts`: estático. RLS con `ENABLE`
    y `FORCE`, FK compuestas, CHECK con `::text`, índice parcial con `IS NOT NULL`, `down.sql`
    inverso, sin `updated_at`/`deleted_at`, y R34 (nombres en inglés);
  - `tests/unit/identity/schema/delivery-void-permission-migration.test.ts`: estático;
  - `tests/integration/identity/delivery-void-permission-migration.int.test.ts`: R1 sobre la base;
  - `tests/integration/pedidos/order-delivery-void-constraints.int.test.ts`: R32, un `INSERT` crudo
    por cada restricción, todos rechazados.
- `tests/integration/identity/identity-seed.int.test.ts`: el Administrador incluye `entregas.anular`
  y ningún otro rol lo tiene (R1).
- `tests/integration/aislamiento.json`: las suites nuevas.

**Hecho cuando:**
- `pnpm run db:migrate`, `pnpm run db:rollback` tres veces y otra vez `pnpm run db:migrate`
  terminan sin error, y `prisma migrate status` queda limpio;
- el `down.sql` de `delivery_void` aborta si hay asientos `delivery_void`;
- el cliente regenerado compila, `pnpm exec vitest run guard` está en verde y los tests nuevos
  también, contra Postgres.

### [ ] B2 [P] — Devolución física en `inventario`
Depende de: B1. Va en paralelo con B3.

Archivos:
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`: `returnFinishedGoods`
  (`design.md > 4.2`).
- `lib/modules/inventario/adapters/driven/persistence/finished-goods-return-prisma.ts` (nuevo):
  `createFinishedGoodsReturn(tx)` y `batchLotDirectoryPrisma`.
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`: `writeMovement`
  escribe `orderDeliveryVoidId`; la lectura del historial admite `delivery_void`.
- Enmiendas que la función nueva pone en rojo:
  - `tests/guards/guard-libro-de-inventario.test.ts`: `CAMINOS_ESPERADOS` y el título;
  - `tests/unit/inventario/qc121-alcance.test.ts`: `CAMINOS_ESPERADOS` y la fuente fabricada.
  - `tests/unit/inventario/qc91-alcance.test.ts`: verificar que sigue en verde sin cambios.
- Tests nuevos:
  - `tests/unit/inventario/finished-goods-return-prisma.test.ts` (tx doblado): orden lotes →
    productos bloqueados por `id` → incremento → asiento → recálculo; lote ausente da
    `batch_not_found` sin escribir; R24: `writeMovement` recibe `kind: 'delivery_void'`, cantidad
    positiva, `orderId`, `orderDeliveryVoidId` y `reason: null`;
  - `tests/integration/inventario/finished-goods-return.int.test.ts`: R23 (lote = antes + cantidad,
    `products.stock` = suma de lotes), R24 (un asiento por lote), R31 (producto dado de baja:
    devuelve igual y recalcula), lote de la empresa B no se toca, y `findLots` (empresa B no vuelve).
- `tests/integration/inventario/ledger-cuadre.int.test.ts`: un caso con entrega y anulación, donde la
  suma del libro sigue igual a la existencia.
- `tests/integration/aislamiento.json`.

**Hecho cuando:** los archivos están en verde y cada caso lleva su `R<n>`, las guardias enmendadas
están en verde y el gate de la tanda también.

### [ ] B3 [P] — Persistencia de la anulación en `pedidos`
Depende de: B1. Va en paralelo con B2.

Archivos:
- `lib/modules/pedidos/adapters/driven/persistence/order-delivery-void-prisma.ts` (nuevo):
  `createOrderDeliveryVoidRepository(client)` (`findByKey`, `findDelivery`, `findDeliveryLines`,
  `create` con P2002 → `duplicate_key`, `addLines` con P2002 → `already_voided`) y
  `createOrderDeliveryHistoryReader(client)` (`listByOrder`, `design.md > 5`). Todas filtran por
  empresa. Ninguna declara `update`, `delete` ni `upsert`.
- `lib/modules/pedidos/adapters/driven/persistence/order-delivery-prisma.ts`:
  `sumOrderDeliveredPackages` añade `voidLine: null` (`design.md > 4.1`).
- `tests/integration/pedidos/order-delivery-void-repository.int.test.ts` (nuevo): `create` y su
  `duplicate_key`; `addLines` y su `already_voided`; `findDelivery` no ve la empresa B;
  `listByOrder` ordena y trae la anulación por línea.
- `tests/integration/pedidos/order-delivery-repository.int.test.ts`: R26, una línea anulada no suma.
- `tests/integration/aislamiento.json`.

**Hecho cuando:** los archivos están en verde, `tests/guards/guard-ambito-empresa-pedidos.test.ts` y
los `company-scope` de `pedidos` están en verde, y el gate de la tanda también.

### [ ] B4 — Casos de uso reales
Depende de: T0. La parte unitaria puede empezar en paralelo con B1–B3 porque trabaja con dobles; se
cierra después de B3.

Archivos:
- `lib/modules/pedidos/domain/void-delivery.ts`: el cuerpo de `design.md > 2.3` y § 4.
- `lib/modules/pedidos/domain/list-order-deliveries.ts`: el cuerpo de `design.md > 2.3`.
- `tests/unit/pedidos/void-delivery.test.ts` (nuevo):
  - R2: sin permiso, ningún puerto se llama;
  - R3: actor sintético con el permiso y otro rol, aceptado; Administrador sin él, rechazado;
  - R17: un caso por forma no acordada;
  - R18; R19 (`null`, `CANCELADO` y otro estado); R20; R21;
  - R22: `addLines` recibe todas las líneas de las presentaciones pedidas y ninguna otra;
  - R27: `setStatus('ENTREGADO', 'TERMINADO')` solo si el pedido estaba `ENTREGADO`;
  - R28: clave registrada antes y con el pedido bloqueado, y `duplicate_key`: `already_registered`
    con el estado leído;
  - `batch_not_found` y `already_voided` se traducen a su error.
- `tests/unit/pedidos/list-order-deliveries.test.ts` (nuevo): R4; R6 (los tres casos); R7 (orden,
  agrupado por presentación, cliente y autor dados de baja); R8; R9.

**Hecho cuando:** los archivos están en verde, cada caso lleva su `R<n>` y el gate de la tanda
también.

### [ ] B5 — Cableado real, actions e integración del caso de uso
Depende de: B2, B3, B4.

Archivos:
- `lib/composition/index.ts`: `orderDeliveryVoidUnitOfWork` sobre `withOrderTransaction`, con
  `createOrderWriteRepository(tx)`, `createOrderDeliveryVoidRepository(tx)` y
  `createFinishedGoodsReturn(tx)`; el lector de la lista, `batchLotDirectoryPrisma`,
  `peopleDirectory` y los catálogos; quita los dobles de T0.
- `lib/modules/pedidos/adapters/driving/order-actions.ts`: el cuerpo real de las dos actions.
- `tests/unit/pedidos/order-actions-delivery-void.test.ts` (nuevo): la entrada pasa tal cual; cada
  código de `design.md > 2.5` llega como `ErrorState`; `success` lleva el resultado.
- `tests/unit/identity/session-once-per-request-actions.test.ts`: `ACCIONES` más las dos.
- `tests/integration/pedidos/order-delivery-void.int.test.ts` (nuevo, contra Postgres):
  - R6, R18, R19: empresa B, pedido en otro estado;
  - R22, R25: filas de anulación; la entrega, sus líneas y sus asientos idénticos antes y después;
  - R27: pedido `ENTREGADO` pasa a `TERMINADO` con `finished_at`, `packed_by` y `conditioned_by`
    intactos; uno `TERMINADO` sigue igual;
  - R26: tras anular, `getOrderDelivery` muestra lo anulado como pendiente y `deliverOrder` lo
    vuelve a entregar y deja el pedido `ENTREGADO`;
  - R28: la misma clave dos veces deja un solo juego de filas y un solo asiento por lote;
  - R29: un fallo forzado tras la devolución no deja nada escrito;
  - `listOrderDeliveries` de punta a punta.
- `tests/integration/pedidos/order-delivery-void-concurrency.int.test.ts` (nuevo), R30: dos
  anulaciones simultáneas de la misma presentación (una aplicada, otra `delivery_already_voided`);
  una anulación y una entrega simultáneas del mismo pedido; la existencia cuadra con el libro y
  nunca es negativa.
- `tests/integration/aislamiento.json`.

**Hecho cuando:** los archivos están en verde contra Postgres y el gate de la tanda también.

---

## Bloque F — frontend (`frontend_dev`)

Trabaja contra las actions mockeadas y `tests/fixtures/order-delivery-void.ts`. No toca `lib/`.

### [ ] F1 [P] — Acción «Entregas» en la fila
Depende de: T0. Va en paralelo con F2.

Archivos:
- `app/(private)/pedidos/components/order-row-actions.tsx`: `onDeliveries` y
  `ORDER_STATUS_HAS_DELIVERIES` (`design.md > 6.1`).
- `app/(private)/pedidos/components/order-list-section.tsx`: `canVoidDelivery` con `entregas.anular`
  en `loadRowPermissions`.
- `app/(private)/pedidos/components/order-table.tsx`, `order-columns.tsx` y `order-sheet.tsx`: pasan
  el prop y montan el sheet de entregas solo mientras está abierto.
- `tests/unit/pedidos-ui/order-row-actions.test.tsx`, R5: el ítem aparece en `TERMINADO` y
  `ENTREGADO` y en ninguno de los otros ocho estados.

**Hecho cuando:** el archivo está en verde, los tests que ya existían de `order-row-actions`,
`order-columns` y `order-row-wiring` siguen en verde, y el gate de la tanda también.

### [ ] F2 [P] — Lista reutilizable
Depende de: T0. Va en paralelo con F1.

Archivos:
- `app/(private)/pedidos/components/order-delivery-list.tsx` (nuevo, presentacional,
  `design.md > 6.3`).
- `tests/unit/pedidos-ui/order-delivery-list.test.tsx` (nuevo): R7 (orden y contenido), R8, R9, R10
  (sin `canVoid` no está en el DOM; entrega toda anulada; pedido en otro estado).

**Hecho cuando:** el archivo está en verde y el componente no importa ninguna action ni
`lib/composition`.

### [ ] F3 — Sheet y diálogo
Depende de: F1 y F2.

Archivos:
- `app/(private)/pedidos/components/order-deliveries-sheet.tsx` (nuevo, `design.md > 6.2`).
- `app/(private)/pedidos/components/delivery-void-dialog.tsx` (nuevo, `design.md > 6.4`).
- `app/(private)/pedidos/components/index.ts`: exporta lo que el barrel exija.
- `tests/unit/pedidos-ui/delivery-void-dialog.test.tsx` (nuevo), con las actions mockeadas:
  - R11: presentaciones sin anular, todas marcadas, sin campos de cantidad;
  - R12, R13: cada aviso aparece y la action no se llama;
  - R14: dos confirmaciones del mismo diálogo envían la misma clave; reabrirlo envía otra;
  - R15: tras `voided` y `already_registered`, cierre, toast, relectura y `refresh`;
  - R16: `delivery_already_voided` relee; otro error conserva lo marcado y el motivo.
- `tests/unit/pedidos-ui/order-deliveries-sheet.test.tsx` (nuevo): carga, esqueleto, error y
  relectura tras anular.

**Hecho cuando:** los archivos están en verde y el gate de la tanda también.

### [ ] F4 [P] — Historial del lote
Depende de: T0. Va en paralelo con F1–F3.

Archivos: `tests/unit/inventario/batch-history.test.tsx`. Caso R35: un asiento `delivery_void` se
pinta como «Anulación de entrega», con la cantidad positiva, el número de pedido, el autor y la
fecha.

**Hecho cuando:** el archivo está en verde.

---

## [ ] TC — Barrido de censos y guardias
Depende de: B1–B5 y F1–F4.

- `tests/unit/pedidos/order-delivery-append-only.test.ts` (R33), con nota fechada:
  - `NOMBRE_MUTANTE` admite exactamente `createVoidDelivery` y `voidDeliveryAction`;
  - `PRISMA_MUTANTE` y `SQL_MUTANTE` cubren `orderDeliveryVoid`, `orderDeliveryVoidLine`,
    `order_delivery_voids` y `order_delivery_void_lines`;
  - casos sintéticos: un `orderDeliveryVoid.update` y un tercer nombre `void…Deliver` dan rojo.
- Corre `pnpm exec vitest run guard` y los censos de `design.md > 8` (`module-contract`, `scope` y
  `company-scope` de `pedidos` e `inventario`, `identity/permissions`,
  `session-once-per-request-actions`, `pedidos-schema` e `inventario-schema`, `tests/unit/composition/*`).
- Enmienda, con nota fechada, solo lo que siga en rojo por esta rama. Cada enmienda queda anotada en
  `progress/impl_QC-224-anular-entrega.md`.

**Hecho cuando:** `pnpm exec vitest run guard` y los censos listados están en verde, y el gate de la
tanda también.

---

## [ ] TI — E2E
Depende de: TC.

Archivos:
- `e2e/anular-entrega.spec.ts` (nuevo), R36. Siembra por Prisma con prefijo `qc224_e2e_` y el id
  del worker: empresa A con un Administrador y un usuario con `pedidos.consultar` y sin
  `entregas.anular` (rol sintético); un cliente; una receta con dos presentaciones; un pedido
  `ENTREGADO` con una entrega de dos presentaciones desde dos lotes, con sus asientos `delivery`.
  Pasos:
  1. El Administrador abre «Entregas» desde la fila (`order-action-deliveries`).
  2. Pulsa «Anular», desmarca una presentación y confirma con el motivo vacío: aparece el aviso y no
     se escribe nada en Postgres.
  3. Escribe el motivo y confirma. En Postgres: el lote de la presentación anulada recupera su
     cantidad, hay un asiento `delivery_void`, la fila de `order_delivery_voids` tiene el motivo,
     la entrega y sus asientos están intactos y el pedido está `TERMINADO`.
  4. La lista muestra la presentación anulada con su motivo, y la fila del pedido muestra
     «Terminado».
  5. «Entregar» muestra esa presentación como pendiente.
  6. El otro usuario abre «Entregas» y no ve «Anular».
  7. `afterAll` borra solo lo de su worker.
- `tests/guards/guard-identificador-de-request.test.ts`: `E2E_ESPERADOS` más el spec.

**Hecho cuando:**
- `pnpm exec playwright test e2e/anular-entrega.spec.ts` está en verde en Chromium y WebKit, con la
  salida anotada en `progress/impl_QC-224-anular-entrega.md`;
- tras la corrida no queda ninguna fila con el prefijo;
- el gate de la tanda está en verde.

---

## [ ] TZ — Cierre
Depende de: TI.

- `./init.sh` en verde, y `gate-completo` de CI en verde en el PR.
- En `progress/impl_QC-224-anular-entrega.md`: el mapa `R1`–`R37` → test concreto (desde
  `design.md > 10`, con los nombres reales), los censos enmendados y el resultado del E2E.
- R37: `git diff origin/dev -- package.json pnpm-lock.yaml` vacío y `guard-dependencias-aprobadas` en
  verde.
- Comentarios: en las líneas que toca la rama, ninguno cita `QC-`, `R<n>`, `D<n>` ni el spec.

**Hecho cuando:** todo lo anterior se cumple y la feature queda lista para `reviewer`.

---

## Archivos esperados

Producción:
- `lib/modules/inventario/domain/finished-goods-return.ts`
- `lib/modules/inventario/domain/inventory-movement.ts`
- `lib/modules/inventario/domain/reservation.ts`
- `lib/modules/inventario/index.ts`
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
- `lib/modules/inventario/adapters/driven/persistence/finished-goods-return-prisma.ts`
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`
- `lib/modules/pedidos/ports/order-delivery-void-repository.ts`
- `lib/modules/pedidos/ports/order-delivery-void-unit-of-work.ts`
- `lib/modules/pedidos/domain/list-order-deliveries.ts`
- `lib/modules/pedidos/domain/void-delivery.ts`
- `lib/modules/pedidos/domain/errors.ts`
- `lib/modules/pedidos/index.ts`
- `lib/modules/pedidos/adapters/driven/persistence/order-delivery-void-prisma.ts`
- `lib/modules/pedidos/adapters/driven/persistence/order-delivery-prisma.ts`
- `lib/modules/pedidos/adapters/driving/order-actions.ts`
- `lib/modules/identity/domain/permissions.ts`
- `lib/modules/errores/domain/error-codes.ts`
- `lib/modules/errores/domain/error-catalog.ts`
- `lib/composition/index.ts`
- `db/schema.prisma`
- `db/migrations/20261009120000_inventory_movement_kind_delivery_void/migration.sql`
- `db/migrations/20261009120000_inventory_movement_kind_delivery_void/down.sql`
- `db/migrations/20261009120100_order_delivery_voids/migration.sql`
- `db/migrations/20261009120100_order_delivery_voids/down.sql`
- `db/migrations/20261009120200_delivery_void_permission/migration.sql`
- `db/migrations/20261009120200_delivery_void_permission/down.sql`
- `app/(private)/pedidos/components/order-row-actions.tsx`
- `app/(private)/pedidos/components/order-list-section.tsx`
- `app/(private)/pedidos/components/order-table.tsx`
- `app/(private)/pedidos/components/order-columns.tsx`
- `app/(private)/pedidos/components/order-sheet.tsx`
- `app/(private)/pedidos/components/order-deliveries-sheet.tsx`
- `app/(private)/pedidos/components/order-delivery-list.tsx`
- `app/(private)/pedidos/components/delivery-void-dialog.tsx`
- `app/(private)/pedidos/components/index.ts`
- `app/(private)/inventario/components/batch-history.tsx`

Tests, fixtures y E2E:
- `tests/fixtures/order-delivery-void.ts`
- `tests/unit/pedidos/void-delivery.test.ts`
- `tests/unit/pedidos/list-order-deliveries.test.ts`
- `tests/unit/pedidos/order-actions-delivery-void.test.ts`
- `tests/unit/pedidos/order-delivery-append-only.test.ts`
- `tests/unit/pedidos/module-contract.test.ts`
- `tests/unit/pedidos/schema/pedidos-schema.test.ts`
- `tests/unit/pedidos/schema/order-delivery-voids-migration.test.ts`
- `tests/unit/pedidos-ui/order-row-actions.test.tsx`
- `tests/unit/pedidos-ui/order-delivery-list.test.tsx`
- `tests/unit/pedidos-ui/delivery-void-dialog.test.tsx`
- `tests/unit/pedidos-ui/order-deliveries-sheet.test.tsx`
- `tests/unit/inventario/finished-goods-return-prisma.test.ts`
- `tests/unit/inventario/batch-history.test.tsx`
- `tests/unit/inventario/qc91-alcance.test.ts`
- `tests/unit/inventario/qc121-alcance.test.ts`
- `tests/unit/inventario/schema/inventario-schema.test.ts`
- `tests/unit/inventario/schema/inventario-migration.test.ts`
- `tests/unit/inventario/schema/finished-product-enum-values-migration.test.ts`
- `tests/unit/proveedores/schema/proveedores-migration.test.ts`
- `tests/unit/identity/permissions.test.ts`
- `tests/unit/identity/schema/delivery-void-permission-migration.test.ts`
- `tests/unit/identity/session-once-per-request-actions.test.ts`
- `tests/unit/errores/catalogo.test.ts`
- `tests/guards/guard-libro-de-inventario.test.ts`
- `tests/guards/guard-identificador-de-request.test.ts`
- `tests/integration/aislamiento.json`
- `tests/integration/identity/identity-seed.int.test.ts`
- `tests/integration/identity/delivery-void-permission-migration.int.test.ts`
- `tests/integration/inventario/finished-goods-return.int.test.ts`
- `tests/integration/inventario/ledger-cuadre.int.test.ts`
- `tests/integration/pedidos/order-delivery-repository.int.test.ts`
- `tests/integration/pedidos/order-delivery-void-repository.int.test.ts`
- `tests/integration/pedidos/order-delivery-void.int.test.ts`
- `tests/integration/pedidos/order-delivery-void-concurrency.int.test.ts`
- `tests/integration/pedidos/order-delivery-void-constraints.int.test.ts`
- `e2e/anular-entrega.spec.ts`

Progreso:
- `progress/impl_QC-224-anular-entrega.md`
