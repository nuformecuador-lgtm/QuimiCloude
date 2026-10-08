# QC-223 — entregar-producto-terminado · tasks.md

> **Orden:** T0 (contrato, secuencial) → B1 → bloques B (backend) y F (frontend), en paralelo entre
> sí donde se marca `[P]` → TC (barrido de censos) → TI (integración real + E2E) → TZ (cierre).
>
> **Reglas de toda la feature:**
> - Ningún archivo de un bloque B aparece en un bloque F, y al revés. Las excepciones son T0 y TI,
>   que tocan los dos lados.
> - Gate de cada tanda: `pnpm run typecheck`, `pnpm run lint`,
>   `pnpm exec vitest related --run <archivos tocados>` y `pnpm exec vitest run guard`. Gate de TZ:
>   `./init.sh`.
> - Un commit por task (`feat(QC-223): …` / `test(QC-223): …`).
> - Ningún comentario de producción cita la ficha, un `R<n>`, un `D<n>` ni el spec. En los tests,
>   el `R<n>` va en el nombre del caso.
> - Toda enmienda de un censo o de una guardia conserva sus aserciones previas y lleva una nota
>   fechada (`2026-10-08`, o la del día en que se haga).

---

## [x] T0 — Publicar el contrato (bloquea todo lo demás)

Implementa `design.md > 2` tal cual, con el stub de `design.md > 2.8`.

Archivos:
- `lib/modules/pedidos/domain/order-delivery.ts` (nuevo): tipos, `remainingPackages`,
  `checkDelivery` y `DELIVERY_MAX_ALLOCATIONS`, con su implementación real (es pura).
- `lib/modules/pedidos/domain/get-order-delivery.ts` y `deliver-order.ts` (nuevos): la firma, los
  `…Deps`, `requirePermission(actor, 'entregas.modificar')` como primera sentencia y un cuerpo stub
  que lanza `ActionNotAllowedError`.
- `lib/modules/pedidos/domain/order-customer.ts`: `OrderCustomerSearchPurpose` gana `'deliver'`.
  `search-order-customer-options.ts`: `'deliver'` exige `entregas.modificar` y busca solo vivos.
- `lib/modules/pedidos/domain/errors.ts`: `DeliveryExceedsRemainingError`,
  `DeliveryBatchInsufficientError` y `DeliveryBatchNotFoundError`.
- `lib/modules/pedidos/ports/order-delivery-repository.ts` y `order-delivery-unit-of-work.ts`
  (nuevos).
- `lib/modules/pedidos/index.ts`: exporta lo anterior.
- `lib/modules/inventario/domain/finished-goods-dispatch.ts` (nuevo): `wholePackagesIn` (real),
  `DeliverableBatch`, `FinishedBatchCatalog`, `FinishedGoodsDispatch*`.
- `lib/modules/inventario/index.ts`: lo exporta en una sentencia propia, sin `…Deps`.
- `lib/modules/inventario/domain/inventory-movement.ts`: `kind` gana `'delivery'` y aparece
  `orderDeliveryId?`. En `lib/modules/inventario/domain/reservation.ts`, `BatchHistoryEntry['kind']`
  gana `'delivery'`.
- `app/(private)/inventario/components/batch-history.tsx`: `KIND_LABELS.delivery = 'Entrega a
  cliente'`. Va aquí porque, si no, el `Record` exhaustivo no compila.
- `lib/modules/identity/domain/permissions.ts`: la entrada `entregas.modificar`, el párrafo de
  enmienda y el Administrador. Va en T0 porque `PermissionCode` lo necesita para compilar
  `requirePermission`.
- `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts`: los dos códigos y sus textos.
- `lib/modules/pedidos/adapters/driving/order-actions.ts`: `getOrderDeliveryAction` y
  `deliverOrderAction` con su forma definitiva (`design.md > 2.5`).
- `lib/composition/index.ts`: `pedidos.getOrderDelivery` y `pedidos.deliverOrder` cableados a lo
  que ya existe, y dobles mínimos para lo que todavía no existe. B5 los sustituye.
- `tests/fixtures/order-delivery.ts` (nuevo): `design.md > 2.7`.
- `tests/unit/pedidos/order-delivery.test.ts` (nuevo): tabla de casos de `checkDelivery`. Cubre
  vacío, exceso por línea, exceso por lote, `batches: null`, `completesOrder` verdadero y falso, y
  varias asignaciones a la misma línea que se suman.
- `tests/unit/inventario/finished-goods-dispatch.test.ts` (nuevo): `wholePackagesIn` con exactos,
  con resto, con contenido decimal y con existencia cero.
- Ajustes mínimos para que compile y siga verde, con nota fechada:
  - `tests/unit/identity/permissions.test.ts`: código, módulo `entregas` en `MODULOS`, excepción
    «solo `modificar`» como `empaque` y conjunto del Administrador;
  - `tests/unit/pedidos/order-customer-contract.test-d.ts`;
  - los tests del catálogo de errores.

Cubre: R16 (función), base de R1, R10, R18, R20 y R38.

**Hecho cuando:**
- el gate de la tanda está en verde;
- `order-delivery.test.ts`, `finished-goods-dispatch.test.ts` y el test de unicidad del catálogo
  están en verde;
- se verificó que ningún producto terminado puede ser ingrediente de una receta (`design.md > 5`,
  «Lotes reservados»). Si no es así, se anota y se para;
- hay commit `feat(QC-223): publica el contrato de la entrega de producto terminado`.

---

## Bloque B — backend (`backend_dev`)

### [x] B1 — Migraciones, esquema y permiso sembrado
Depende de: T0.

Archivos:
- `db/migrations/20261008150000_inventory_movement_kind_delivery/migration.sql` y `down.sql`.
- `db/migrations/20261008150100_order_deliveries/migration.sql` y `down.sql`.
- `db/migrations/20261008150200_delivery_permission/migration.sql` y `down.sql`.
- Las tres van según `design.md > 3`. Antes de escribirlas hay que comprobar dos cosas:
  - el timestamp va detrás de la última migración de `origin/dev`;
  - el texto vigente de los CHECK que se reescriben y el nombre de la clave de `customers`.
- `db/schema.prisma`: `OrderDelivery`, `OrderDeliveryLine`, `InventoryMovement.orderDeliveryId`,
  `InventoryMovementKind.delivery`, y la relación inversa en `Order` y `OrderPresentationLine`.
- Enmiendas de censo, con nota fechada:
  - `tests/guards/guard-identificador-de-request.test.ts` (`MIGRACIONES_ESPERADAS`: las tres);
  - `tests/unit/pedidos/schema/pedidos-schema.test.ts` (modelos de `pedidos` y referencias sin
    `@relation`);
  - `tests/unit/inventario/schema/inventario-schema.test.ts` (valores del enum).
- Tests nuevos:
  - `tests/unit/pedidos/schema/order-deliveries-migration.test.ts`: estático. Comprueba RLS con
    `ENABLE` y `FORCE`, las FK compuestas, los CHECK con `::text`, el `down.sql` inverso y la
    ausencia de `updated_at`/`deleted_at`;
  - `tests/unit/identity/schema/delivery-permission-migration.test.ts`: estático, con el molde de
    `packer-role-migration.test.ts`;
  - `tests/integration/identity/delivery-permission-migration.int.test.ts`: el R1 sobre la base;
  - `tests/integration/pedidos/order-delivery-constraints.int.test.ts`: R31, un `INSERT` crudo por
    cada restricción, todos rechazados.
- `tests/integration/identity/identity-seed.int.test.ts`: el Administrador incluye
  `entregas.modificar` y ningún otro rol lo tiene (R1).
- `tests/integration/aislamiento.json`: las suites nuevas.

**Hecho cuando:**
- `pnpm run db:migrate`, luego `pnpm run db:rollback` tres veces y otra vez `pnpm run db:migrate`
  terminan sin error, y `prisma migrate status` queda limpio;
- el `down.sql` de `delivery` aborta si hay asientos `delivery`;
- el cliente regenerado compila;
- `pnpm exec vitest run guard` está en verde;
- los tests nuevos están en verde contra Postgres.

### [x] B2 [P] — Salida física en `inventario`
Depende de: B1. Va en paralelo con B3.

Archivos:
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`:
  `dispatchFinishedGoods` (`design.md > 4.2`).
- `lib/modules/inventario/adapters/driven/persistence/finished-goods-dispatch-prisma.ts` (nuevo):
  `createFinishedGoodsDispatch(tx)`.
- `lib/modules/inventario/adapters/driven/persistence/deliverable-batches-prisma.ts` (nuevo):
  `findDeliverableBatches` (`design.md > 5`).
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`: `writeMovement`
  escribe `orderDeliveryId`.
- Enmiendas, que van en esta misma task porque la función nueva las pone en rojo:
  - `tests/guards/guard-libro-de-inventario.test.ts`: `CAMINOS_ESPERADOS` y el título del caso;
  - `tests/unit/inventario/qc121-alcance.test.ts`: `CAMINOS_ESPERADOS` y la fuente fabricada de
    siete caminos;
  - `tests/unit/inventario/qc91-alcance.test.ts`: el `updateMany` se admite en
    `consumeBatchStock` y en `dispatchFinishedGoods`, y un tercero sigue en rojo, con un caso
    sintético.
- Tests nuevos:
  - `tests/unit/inventario/finished-goods-dispatch-prisma.test.ts` (tx doblado):
    - orden producto → lotes → decremento → asiento → recálculo;
    - R19: producto ausente, lote ajeno, lote de otro producto y lote sin contenido dan
      `batch_not_found` sin escribir;
    - R20: `count === 0` da `insufficient` con `availablePackages` y sin asiento;
    - R24: `writeMovement` recibe `kind: 'delivery'`, cantidad negativa, `orderId`,
      `orderDeliveryId` y `reason: null`.
  - `tests/integration/inventario/finished-goods-dispatch.int.test.ts`:
    - R23: existencia del lote = antes − envases × contenido, y `products.stock` = suma de lotes;
    - R24: un asiento por lote;
    - R19: acceso cruzado con un lote de la empresa B;
    - R20: no se escribe nada.
  - `tests/integration/inventario/deliverable-batches.int.test.ts`: R7. Lotes de origen
    `production` y `opening` (importación) sí aparecen. No aparecen los lotes con menos de un
    envase, los de otra presentación o receta, los de la empresa B ni los de un producto dado de
    baja. Comprueba el orden.
- `tests/integration/inventario/ledger-cuadre.int.test.ts`: un caso con entrega, donde la suma del
  libro sigue igual a la existencia.
- `tests/integration/aislamiento.json`: las suites nuevas.

**Hecho cuando:** los archivos están en verde y cada caso lleva su `R<n>`, las tres guardias
enmendadas están en verde y el gate de la tanda también.

### [x] B3 [P] — Persistencia de la entrega en `pedidos`
Depende de: B1. Va en paralelo con B2.

Archivos:
- `lib/modules/pedidos/adapters/driven/persistence/order-delivery-prisma.ts` (nuevo): la fábrica
  `createOrderDeliveryRepository(client)` con `create` (P2002 de la clave da `duplicate_key`),
  `addLines` y `sumDeliveredPackages`. Todas filtran por empresa. Ninguna declara `update`,
  `delete` ni `upsert`.
- `tests/integration/pedidos/order-delivery-repository.int.test.ts` (nuevo):
  - `create` y su `duplicate_key`;
  - `sumDeliveredPackages` suma por línea y no ve las entregas de la empresa B;
  - `addLines` rechaza el lote de otra empresa por FK.
- `tests/integration/aislamiento.json`.

**Hecho cuando:** el archivo está en verde, `tests/guards/guard-ambito-empresa-pedidos.test.ts` y
los `company-scope` de `pedidos` están en verde, y el gate de la tanda también.

### [x] B4 — Casos de uso reales
Depende de: T0. La parte unitaria puede empezar en paralelo con B1–B3 porque trabaja con dobles;
se cierra después de B3.

Archivos:
- `lib/modules/pedidos/domain/deliver-order.ts`: el cuerpo de `design.md > 2.4` y de §4, con
  `assertTransition('TERMINADO', 'ENTREGADO')`.
- `lib/modules/pedidos/domain/get-order-delivery.ts`: el cuerpo de `design.md > 2.4`.
- `tests/unit/pedidos/deliver-order.test.ts` (nuevo):
  - R2: sin permiso, ningún puerto se llama;
  - R3: actor sintético con el permiso y otro rol, aceptado; Administrador sin el permiso,
    rechazado;
  - R17: `null` da `order_not_found`; un estado distinto de `TERMINADO` da `action_not_allowed`;
  - R18;
  - R21;
  - R22: un caso por forma no acordada;
  - R26 y R27: `setStatus` se llama solo si se completa el pedido;
  - R29: `duplicate_key` da `already_registered` con el estado leído;
  - los tres resultados de `dispatchForDelivery` se traducen a su error.
- `tests/unit/pedidos/get-order-delivery.test.ts` (nuevo):
  - R2;
  - R5: los tres casos de no encontrado y el estado no `TERMINADO`;
  - R6: pedidos, entregados y faltan;
  - R8: una línea completa lleva `batches: []`;
  - R9: cliente vivo, sin cliente y cliente dado de baja.
- `tests/unit/pedidos/search-order-customer-options.test.ts`: R10 y R2 con `purpose: 'deliver'`
  (`includeDeleted: false`, `entregas.modificar`).
- `tests/unit/pedidos/module-contract.test.ts`: consumidores de `assertTransition` más
  `deliver-order.ts`, con nota fechada.

**Hecho cuando:** los archivos están en verde, cada caso lleva su `R<n>` y el gate de la tanda
también.

### [x] B5 — Cableado real, actions e integración del caso de uso
Depende de: B2, B3, B4.

Archivos:
- `lib/composition/index.ts`:
  - `orderDeliveryUnitOfWork`, sobre `withOrderTransaction`, con `createOrderWriteRepository(tx)`,
    `createOrderDeliveryRepository(tx)` y `createFinishedGoodsDispatch(tx)`;
  - `finishedBatchCatalog`;
  - quita los dobles de T0.
- `lib/modules/pedidos/adapters/driving/order-actions.ts`: el cuerpo real de las dos actions, con
  el actor una vez por petición.
- `tests/unit/pedidos/order-actions-delivery.test.ts` (nuevo):
  - la action pasa la entrada tal cual al caso de uso;
  - cada código de `design.md > 2.6` llega como `ErrorState` por el traductor;
  - `success` lleva `DeliverOrderResult`.
- `tests/unit/identity/session-once-per-request-actions.test.ts`: `ACCIONES` más las dos actions,
  con nota fechada.
- `tests/integration/pedidos/order-delivery.int.test.ts` (nuevo, contra Postgres):
  - R17: empresa B y pedido no `TERMINADO`;
  - R21: cliente de B y cliente dado de baja;
  - R25: filas de entrega y de línea, y `orders.customer_id` intacto;
  - R26: entrega parcial, sigue `TERMINADO`;
  - R27: entrega que completa, pasa a `ENTREGADO` con `finished_at`, `packed_by` y
    `conditioned_by` intactos;
  - R29: la misma clave dos veces deja un solo juego de filas y un solo asiento por lote;
  - R30: el segundo lote insuficiente no deja nada escrito, ni siquiera el primero;
  - R5: `getOrderDelivery` de punta a punta.
- `tests/integration/pedidos/order-delivery-concurrency.int.test.ts` (nuevo), R28:
  - dos entregas simultáneas del mismo pedido que juntas superan lo que falta: una aplicada y otra
    rechazada;
  - dos pedidos que piden a la vez al mismo lote más de lo que tiene: una aplicada y la otra con
    `delivery_batch_insufficient`;
  - la existencia nunca queda negativa.
- `tests/integration/aislamiento.json`.

**Hecho cuando:** los archivos están en verde contra Postgres y el gate de la tanda también.

---

## Bloque F — frontend (`frontend_dev`)

Trabaja contra las actions mockeadas y `tests/fixtures/order-delivery.ts`. No toca `lib/`.

### [x] F1 [P] — Acción «Entregar» en la fila
Depende de: T0. Va en paralelo con F2 y con el bloque B.

Archivos:
- `app/(private)/pedidos/components/order-row-actions.tsx`: `canDeliver`, `onDeliver` y
  `ORDER_STATUS_ACCEPTS_DELIVERY` (`design.md > 6.1`).
- `app/(private)/pedidos/components/order-list-section.tsx`: `canDeliver` con
  `entregas.modificar`, dentro del `Promise.all` que ya existe.
- `app/(private)/pedidos/components/order-table.tsx` y `order-columns.tsx`: pasan el prop, montan
  el sheet y guardan el pedido elegido.
- `tests/unit/pedidos-ui/order-row-actions.test.tsx`, R4: el ítem aparece solo con `canDeliver` y
  en `TERMINADO`; no aparece en los otros nueve estados; sin `canDeliver` no está en el DOM.

**Hecho cuando:** el archivo está en verde, los tests que ya existían de `order-row-actions`,
`order-columns` y `order-row-wiring` siguen en verde, y el gate de la tanda también.

### [x] F2 [P] — Borrador
Depende de: T0. Va en paralelo con F1.

Archivos:
- `app/(private)/pedidos/components/order-delivery-draft.ts` (nuevo, puro): clave, forma
  versionada, parseo tolerante y ajuste contra un `OrderDeliveryView` (`design.md > 6.3`).
- `app/(private)/pedidos/components/use-order-delivery-draft.ts` (nuevo).
- `tests/unit/pedidos-ui/order-delivery-draft.test.ts` (nuevo):
  - R35: escribe y lee por pedido con la clave de entrega;
  - R36: borra;
  - R37: descarta los lotes que ya no se ofrecen y marca `adjusted`;
  - JSON corrupto o de otra versión: se descarta;
  - sin `localStorage`: no lanza.

**Hecho cuando:** el archivo está en verde y el gate de la tanda también.

### [x] F3 — Sheet de entrega
Depende de: F1 y F2.

Archivos:
- `app/(private)/pedidos/components/order-delivery-sheet.tsx` (nuevo, `design.md > 6.2`).
- `app/(private)/pedidos/components/index.ts`: exporta el sheet si el barrel lo exige
  (`docs/architecture.md > Componentes`).
- `tests/unit/pedidos-ui/order-delivery-sheet.test.tsx` (nuevo), con las actions mockeadas:
  - R6 y R8: presentaciones con pedidos, entregados y faltan, y la completa sin campos;
  - R7: lotes de la fixture;
  - R9: cliente precargado, vacío sin cliente y vacío con cliente dado de baja;
  - R11, R12, R13, R14 y R15: cada aviso aparece y la action no se llama;
  - R33: tras `delivered` y `already_registered`, borrador borrado, cierre, toast y `refresh`;
  - R34: tras cada rechazo, sigue abierto, muestra el mensaje, relee y conserva el borrador;
  - R35: cerrar con la X o con Escape conserva el borrador, y al reabrir se restaura junto con la
    clave de entrega;
  - R36: «Cancelar» borra;
  - R37: aviso de borrador ajustado;
  - el selector de cliente se monta con `purpose="deliver"`.

**Hecho cuando:** el archivo está en verde, el sheet no declara ninguna aritmética de tope propia
(usa `checkDelivery`) y el gate de la tanda también.

### [x] F4 [P] — Historial del lote
Depende de: T0. Va en paralelo con F1–F3.

Archivos: `tests/unit/inventario/batch-history.test.tsx`. Caso R38: un asiento `delivery` se pinta
como «Entrega a cliente», con la cantidad negativa, el número de pedido, el autor y la fecha.

**Hecho cuando:** el archivo está en verde.

---

## [ ] TC — Barrido de censos y guardias
Depende de: B1–B5 y F1–F4.

- Corre `pnpm exec vitest run guard` y los censos de `design.md > 8`:
  - `tests/unit/composition/*`;
  - `module-contract` y `scope` de `pedidos` e `inventario`;
  - los dos `company-scope`;
  - `identity/permissions`;
  - `session-once-per-request-actions`;
  - `pedidos-schema` e `inventario-schema`.
- Enmienda, con nota fechada, solo lo que siga en rojo por esta rama. Cada enmienda queda anotada
  en `progress/impl_QC-223-entregar-producto-terminado.md`.
- `tests/unit/pedidos/order-delivery-append-only.test.ts` (nuevo), R32:
  - barrido de `lib/` y `app/`: ningún `orderDelivery.update|updateMany|delete|deleteMany|upsert` ni
    `orderDeliveryLine.*` equivalente, y ningún `UPDATE`/`DELETE` crudo sobre `order_deliveries` u
    `order_delivery_lines`;
  - un caso sintético que sí lo hace y da rojo.
- `tests/unit/pedidos/order-delivery.test.ts`, caso R16: lee las fuentes de
  `order-delivery-sheet.tsx` y `deliver-order.ts`, exige que importen `checkDelivery` o
  `remainingPackages` del barrel de `pedidos`, y que no resten envases pedidos menos entregados por
  su cuenta.
- Comprueba que ningún test afirma todavía la primera frase de QC-215 R33 como barrido; si alguno
  lo hace, se enmienda con nota (`design.md > 8`, última fila).

**Hecho cuando:** `pnpm exec vitest run guard` y los censos listados están en verde, los dos casos
nuevos también y el gate de la tanda también.

---

## [ ] TI — E2E
Depende de: TC.

Archivos:
- `e2e/entregar-producto-terminado.spec.ts` (nuevo), R39. Siembra por Prisma con prefijo
  `qc223_e2e_` y el id del worker:
  - empresa A con un Administrador y un Operador;
  - dos clientes;
  - una receta y dos presentaciones;
  - un pedido `TERMINADO` con dos líneas;
  - tres lotes de producto terminado (dos de una presentación, uno de la otra).
  Pasos:
  1. El Administrador abre «Entregar» desde la fila (`order-action-deliver`).
  2. Cambia el cliente al segundo y escribe envases en dos lotes.
  3. Recarga, reabre y comprueba que se restaura el borrador (R35).
  4. Confirma. En Postgres comprueba la existencia de los lotes, los asientos `delivery` y la fila
     `order_deliveries` con el cliente elegido, y que el pedido sigue `TERMINADO` con su cliente
     original.
  5. Segunda entrega que completa: el pedido queda `ENTREGADO` y la fila muestra «Entregado».
  6. El Operador no ve la acción (R4).
  7. `afterAll` borra solo lo de su worker.
- `tests/guards/guard-identificador-de-request.test.ts`: `E2E_ESPERADOS` más el spec, con nota
  fechada.

**Hecho cuando:**
- `pnpm exec playwright test e2e/entregar-producto-terminado.spec.ts` está en verde en Chromium y
  WebKit, con la salida anotada en `progress/impl_QC-223-entregar-producto-terminado.md`;
- tras la corrida no queda ninguna fila con el prefijo;
- el gate de la tanda está en verde.

---

## [ ] TZ — Cierre
Depende de: TI.

- `./init.sh` en verde, y `gate-completo` de CI en verde en el PR.
- En `progress/impl_QC-223-entregar-producto-terminado.md`:
  - el mapa `R1`–`R40` → test concreto, partiendo de `design.md > 10` y corregido con los nombres
    reales;
  - la lista de censos enmendados;
  - el resultado del E2E.
- R40: `git diff origin/dev -- package.json pnpm-lock.yaml` vacío, y
  `guard-dependencias-aprobadas` en verde.
- Comentarios: en las líneas que toca la rama, ninguno cita `QC-`, `R<n>`, `D<n>` ni el spec.

**Hecho cuando:** todo lo anterior se cumple y la feature queda lista para `reviewer`.

---

## Archivos esperados

Producción:
- `lib/modules/pedidos/domain/order-delivery.ts`
- `lib/modules/pedidos/domain/get-order-delivery.ts`
- `lib/modules/pedidos/domain/deliver-order.ts`
- `lib/modules/pedidos/domain/order-customer.ts`
- `lib/modules/pedidos/domain/search-order-customer-options.ts`
- `lib/modules/pedidos/domain/errors.ts`
- `lib/modules/pedidos/ports/order-delivery-repository.ts`
- `lib/modules/pedidos/ports/order-delivery-unit-of-work.ts`
- `lib/modules/pedidos/index.ts`
- `lib/modules/pedidos/adapters/driven/persistence/order-delivery-prisma.ts`
- `lib/modules/pedidos/adapters/driving/order-actions.ts`
- `lib/modules/inventario/domain/finished-goods-dispatch.ts`
- `lib/modules/inventario/domain/inventory-movement.ts`
- `lib/modules/inventario/domain/reservation.ts`
- `lib/modules/inventario/index.ts`
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
- `lib/modules/inventario/adapters/driven/persistence/finished-goods-dispatch-prisma.ts`
- `lib/modules/inventario/adapters/driven/persistence/deliverable-batches-prisma.ts`
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`
- `lib/modules/identity/domain/permissions.ts`
- `lib/modules/errores/domain/error-codes.ts`
- `lib/modules/errores/domain/error-catalog.ts`
- `lib/composition/index.ts`
- `db/schema.prisma`
- `db/migrations/20261008150000_inventory_movement_kind_delivery/migration.sql`
- `db/migrations/20261008150000_inventory_movement_kind_delivery/down.sql`
- `db/migrations/20261008150100_order_deliveries/migration.sql`
- `db/migrations/20261008150100_order_deliveries/down.sql`
- `db/migrations/20261008150200_delivery_permission/migration.sql`
- `db/migrations/20261008150200_delivery_permission/down.sql`
- `app/(private)/pedidos/components/order-row-actions.tsx`
- `app/(private)/pedidos/components/order-list-section.tsx`
- `app/(private)/pedidos/components/order-table.tsx`
- `app/(private)/pedidos/components/order-columns.tsx`
- `app/(private)/pedidos/components/order-delivery-sheet.tsx`
- `app/(private)/pedidos/components/order-delivery-draft.ts`
- `app/(private)/pedidos/components/use-order-delivery-draft.ts`
- `app/(private)/pedidos/components/index.ts`
- `app/(private)/inventario/components/batch-history.tsx`

Tests, fixtures y E2E:
- `tests/fixtures/order-delivery.ts`
- `tests/unit/pedidos/order-delivery.test.ts`
- `tests/unit/pedidos/deliver-order.test.ts`
- `tests/unit/pedidos/get-order-delivery.test.ts`
- `tests/unit/pedidos/search-order-customer-options.test.ts`
- `tests/unit/pedidos/order-actions-delivery.test.ts`
- `tests/unit/pedidos/order-delivery-append-only.test.ts`
- `tests/unit/pedidos/module-contract.test.ts`
- `tests/unit/pedidos/order-customer-contract.test-d.ts`
- `tests/unit/pedidos/schema/pedidos-schema.test.ts`
- `tests/unit/pedidos/schema/order-deliveries-migration.test.ts`
- `tests/unit/pedidos-ui/order-row-actions.test.tsx`
- `tests/unit/pedidos-ui/order-delivery-draft.test.ts`
- `tests/unit/pedidos-ui/order-delivery-sheet.test.tsx`
- `tests/unit/inventario/finished-goods-dispatch.test.ts`
- `tests/unit/inventario/finished-goods-dispatch-prisma.test.ts`
- `tests/unit/inventario/batch-history.test.tsx`
- `tests/unit/inventario/qc91-alcance.test.ts`
- `tests/unit/inventario/qc121-alcance.test.ts`
- `tests/unit/inventario/schema/inventario-schema.test.ts`
- `tests/unit/identity/permissions.test.ts`
- `tests/unit/identity/schema/delivery-permission-migration.test.ts`
- `tests/unit/identity/session-once-per-request-actions.test.ts`
- `tests/guards/guard-libro-de-inventario.test.ts`
- `tests/guards/guard-identificador-de-request.test.ts`
- `tests/integration/aislamiento.json`
- `tests/integration/identity/identity-seed.int.test.ts`
- `tests/integration/identity/delivery-permission-migration.int.test.ts`
- `tests/integration/inventario/finished-goods-dispatch.int.test.ts`
- `tests/integration/inventario/deliverable-batches.int.test.ts`
- `tests/integration/inventario/ledger-cuadre.int.test.ts`
- `tests/integration/pedidos/order-delivery-repository.int.test.ts`
- `tests/integration/pedidos/order-delivery.int.test.ts`
- `tests/integration/pedidos/order-delivery-concurrency.int.test.ts`
- `tests/integration/pedidos/order-delivery-constraints.int.test.ts`
- `e2e/entregar-producto-terminado.spec.ts`

Progreso:
- `progress/impl_QC-223-entregar-producto-terminado.md`
