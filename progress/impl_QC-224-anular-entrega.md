# impl QC-224 — anular-entrega

## T0 — contrato (backend_dev, 2026-10-09)

### Archivos
Nuevos:
- `lib/modules/inventario/domain/finished-goods-return.ts`
- `lib/modules/pedidos/ports/order-delivery-void-repository.ts`
- `lib/modules/pedidos/ports/order-delivery-void-unit-of-work.ts`
- `lib/modules/pedidos/domain/list-order-deliveries.ts` (stub: `pedidos.consultar` y luego `ActionNotAllowedError`)
- `lib/modules/pedidos/domain/void-delivery.ts` (stub: `entregas.anular` y luego `ActionNotAllowedError`)
- `tests/fixtures/order-delivery-void.ts`

Modificados:
- `lib/modules/inventario/index.ts`, `domain/inventory-movement.ts`, `domain/reservation.ts`
- `app/(private)/inventario/components/batch-history.tsx` (solo `KIND_LABELS.delivery_void`)
- `lib/modules/pedidos/domain/errors.ts`, `index.ts`, `adapters/driving/order-actions.ts`
- `lib/modules/identity/domain/permissions.ts`
- `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts`
- `lib/composition/index.ts` (dobles provisionales; B5 los sustituye)
- Censos con nota fechada 2026-10-09: `tests/unit/identity/permissions.test.ts`,
  `tests/unit/errores/catalogo.test.ts`, `tests/unit/pedidos/order-actions.test.ts`,
  `tests/unit/navegacion/qc75-convenciones.test.ts`,
  `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`

### Desvio respecto de tasks.md
- `NewInventoryMovement['kind']` NO gana `'delivery_void'` en T0: `writeMovement` pasa `kind` al enum
  de Prisma, que no tiene el valor hasta B1, y `typecheck` cae. Si ganan el valor
  `InventoryMovementView['kind']` y `BatchHistoryEntry['kind']`, y `NewInventoryMovement` gana
  `orderDeliveryVoidId?`. Lo amplia B1/B2 junto con el enum de `db/schema.prisma`.

### Verificacion de design.md > 4.2
Ningun producto terminado puede ser ingrediente: `isIngredientType` excluye `FINISHED_PRODUCT`
y la usan todos los caminos que escriben lineas de receta (`create-recipe`, `update-recipe`,
`update-recipe-version`, `create-recipe-version` -que ademas rechaza `FINISHED_PRODUCT` explicito-
y `confirm-formula-import`); `updateAliveProduct` devuelve `type_locked` ante un cambio de tipo a o
desde `FINISHED_PRODUCT`, y el alta manual no lo ofrece. Se cumple.

### R -> test (T0)
- R1 (base): `tests/unit/identity/permissions.test.ts > QC-224 — el permiso entregas.anular` (6 casos)

### Gate
- `pnpm run typecheck`: 0 errores.
- `pnpm run lint`: 0 errores, 7 avisos ajenos (tests de documentos y order-service).
- `vitest related --run --project node --project ui <archivos tocados>`: 587 archivos, 9950 pass, 41 skip, 0 fail.
- `vitest run guard`: 62 archivos, 834 pass, 15 skip, 0 fail.
- Unicidad del catalogo (`tests/unit/errores/catalogo.test.ts`): verde.
- Proyecto `integration` no corrido: el worktree no tiene `.env` (`DATABASE_URL`).

Veredicto: T0 listo para commit.

## B4 — casos de uso reales (backend_dev, 2026-10-09)

### Archivos
Modificados (solo el cuerpo; firmas, `…Deps` y puertos de T0 intactos):
- `lib/modules/pedidos/domain/void-delivery.ts`: `design.md > 2.3` y § 4 (permiso, zod estricto con
  refine de repetidos, clave previa, entrega, transaccion: bloqueo → clave → estado → lineas →
  `create` → `addLines` → `returnForDeliveryVoid` → `setStatus` si `ENTREGADO`; senal de clave ya
  registrada resuelta fuera con relectura). No llama a `assertTransition`.
- `lib/modules/pedidos/domain/list-order-deliveries.ts`: permiso → uuid → `findAliveById` →
  `listByOrder` → reparto+presentaciones, clientes, personas (incluidos autores de anulacion) y
  lotes en un `Promise.all` → agrupa por `presentationLineId` en orden de aparicion. Sin entregas
  no consulta catalogos. Nombre ausente → primeros 8 caracteres del id, sin lanzar.

Nuevos:
- `tests/unit/pedidos/void-delivery.test.ts` (49 casos)
- `tests/unit/pedidos/list-order-deliveries.test.ts` (16 casos)

### Decisiones de implementacion donde el spec no fija el detalle
- `batch_not_found` → `Error` interno (§ 4 paso 5), no `DeliveryBatchNotFoundError`.
- Identificador corto = `id.slice(0, 8)`: el spec dice «identificador corto» sin longitud y el repo no
  tenia convencion previa.
- Orden de presentaciones dentro de una entrega: el de la primera linea de cada una que entrega el
  lector.

### R -> test (B4)
`void-delivery.test.ts`:
- R2: `R2: sin entregas.anular responde unauthorized antes de validar, y ningun puerto se llama`
- R3: `R3: un actor con entregas.anular y otro rol es aceptado`; `R3: un Administrador sin entregas.anular en su conjunto es rechazado`
- R17: `R17: <caso> responde invalid_input sin leer ni escribir nada` (15 formas) y `R17: el motivo de 500 caracteres con espacios alrededor se acepta y se guarda recortado`
- R18: `R18: la entrega ausente o de otra empresa responde delivery_not_found sin abrir la transaccion`
- R19: `R19: bloquea el pedido de la entrega; si ya no existe o esta borrado responde order_not_found sin escribir`; `R19: un pedido CANCELADO responde action_not_allowed sin escribir`; `R19: un pedido <estado> responde action_not_allowed sin escribir` (resto de estados); `R19: el estado se comprueba sobre la fila bloqueada, despues del bloqueo`
- R20: `R20: una presentacion que no es de esa entrega responde invalid_input sin escribir`
- R21: `R21: una presentacion ya anulada responde delivery_already_voided y no anula las otras pedidas`; `R21: basta con una linea anulada de la presentacion para rechazarla entera`; `R21: addLines con already_voided (respaldo de la base) se traduce a delivery_already_voided y deshace`
- R22: `R22: guarda la anulacion con la entrega, el motivo recortado, el autor y el instante`; `R22: addLines recibe todas las lineas de las presentaciones pedidas, en todos sus lotes, y ninguna otra`; `R22: con dos presentaciones pedidas anula las lineas de las dos y deja la no pedida`
- R23, R24 (parte de dominio): `R23, R24: devuelve a cada lote la cantidad que desconto su linea de entrega, con el pedido y la anulacion`
- R27: `R27: un pedido ENTREGADO pasa a TERMINADO en la misma transaccion`; `R27: un pedido TERMINADO sigue TERMINADO y no se llama a setStatus`; `R27, R29: setStatus distinto de ok con el pedido bloqueado lanza dentro de la transaccion`
- R28: `R28: clave ya registrada antes de abrir la transaccion: already_registered con el estado leido, sin escribir`; `R28: la clave ya registrada responde aunque la entrega pedida no exista`; `R28: clave vista ya con el pedido bloqueado: deshace y responde already_registered con el estado leido`; `R28: la clave vista con el pedido bloqueado gana al estado: …`; `R28: duplicate_key al crear: deshace y responde already_registered con el estado leido`; `R28: si el pedido de la anulacion registrada ya no se lee, responde order_not_found`
- R29 (parte de dominio): `R29: batch_not_found en la devolucion lanza dentro de la transaccion y no cambia el estado`

`list-order-deliveries.test.ts`:
- R4: `R4: sin pedidos.consultar responde unauthorized antes de leer nada`; `R4: decide por el permiso: un actor de otro rol con pedidos.consultar lee la lista`; `R4: un Administrador sin pedidos.consultar en su conjunto es rechazado`
- R6: `R6: un id sin forma de uuid responde order_not_found sin leer nada`; `R6: el pedido que no existe | esta borrado | es de otra empresa (el puerto devuelve null) responde order_not_found sin devolver datos`; `R6: lee con el ambito de la empresa del actor`
- R7: `R7, R9: compone la vista entera: …`; `R7: conserva el orden del lector, de la mas reciente a la mas antigua`; `R7: agrupa por presentacion las lineas de una entrega, aunque lleguen intercaladas, y suma sus lotes`; `R7: muestra el cliente y el autor aunque esten dados de baja`; `R7: un nombre que no vuelve de su catalogo se muestra como identificador corto, sin lanzar`
- R8: `R8: un pedido sin entregas devuelve la lista vacia sin consultar catalogos`
- R9: `R9: la presentacion anulada lleva motivo, autor y fecha de su anulacion, junto a sus envases y lotes`; `R9: el autor de la anulacion se resuelve aunque solo aparezca como autor de una anulacion`

### Gate
- `pnpm run typecheck`: 0 errores.
- `pnpm run lint`: 0 errores, 7 avisos ajenos (los mismos de T0).
- `vitest run` de los dos archivos nuevos: 2 archivos, 65 pass.
- `vitest related --run --project node --project ui <4 archivos>`: 316 archivos, 5291 pass, 1 skip, 0 fail.
  Proyecto `integration` no corrido: el worktree no tiene `.env` (`DATABASE_URL`).
- `vitest run guard`: 62 archivos, 833 pass, 15 skip, **1 fail ajeno a B4**:
  `guard-aislamiento-integracion > ninguna entrada del censo nombra un archivo que ya no existe`, por
  `pedidos/order-delivery-void-constraints.int.test.ts`, que B1 ya anoto en `aislamiento.json` y
  aun no ha creado (B1 en curso).

Veredicto: B4 (parte unitaria) lista para commit; se cierra tras B3, como pide `tasks.md`.

## B1 — migraciones, esquema y permiso sembrado (backend_dev, 2026-10-09)

### Timestamps
- Ultima de `origin/dev`: `20261008150200_delivery_permission`.
- `origin/feature/QC-218-acondicionar-con-equipo`: ultima `20261008150000_order_conditioning_team`.
- `origin/feature/QC-222-menu-de-integraciones`: ultima `20261008120843_integrations_permission`.
- Las tres nuevas (`20261009120000/…100/…200`) quedan detras de todas; sin choque.
- Texto vigente de los dos CHECK que se reescriben: el de `20261008150100_order_deliveries` (ninguna
  migracion posterior los toca). `users (id, company_id)` existe (la usa `order_deliveries_created_by_fkey`).

### Archivos
Nuevos:
- `db/migrations/20261009120000_inventory_movement_kind_delivery_void/{migration,down}.sql`
- `db/migrations/20261009120100_order_delivery_voids/{migration,down}.sql`
- `db/migrations/20261009120200_delivery_void_permission/{migration,down}.sql`
- `tests/unit/pedidos/schema/order-delivery-voids-migration.test.ts` (20 casos)
- `tests/unit/identity/schema/delivery-void-permission-migration.test.ts` (8 casos)
- `tests/integration/identity/delivery-void-permission-migration.int.test.ts` (6 casos)
- `tests/integration/pedidos/order-delivery-void-constraints.int.test.ts` (12 casos)

Modificados:
- `db/schema.prisma`: `InventoryMovementKind.delivery_void` (al final); `InventoryMovement.orderDeliveryVoidId`
  + su `@@index`; `OrderDelivery.voids`; `OrderDeliveryLine.voidLine` y `@@unique([id, deliveryId])`
  (`order_delivery_lines_id_delivery_id_key`, igual que QC-223 declaro la de `order_presentation_lines`);
  modelos nuevos `OrderDeliveryVoid` y `OrderDeliveryVoidLine` (`/// @module pedidos`). Bloques añadidos, nada reordenado.
- `lib/modules/inventario/domain/inventory-movement.ts`: `NewInventoryMovement['kind']` gana `'delivery_void'`
  (pendiente heredado de T0). Cliente regenerado con `prisma generate`.
- Censos con nota fechada 2026-10-09, aserciones previas conservadas:
  - `tests/guards/guard-identificador-de-request.test.ts` (`MIGRACIONES_ESPERADAS` + 3);
  - `tests/unit/pedidos/schema/pedidos-schema.test.ts` (2 sitios: la lista previa queda como
    `arrayContaining`, la exacta gana `OrderDeliveryVoid` y `OrderDeliveryVoidLine`);
  - `tests/unit/inventario/schema/finished-product-enum-values-migration.test.ts` (+ `delivery_void`);
  - `inventario-schema.test.ts`, `inventario-migration.test.ts` y `proveedores-migration.test.ts` no
    enumeran el tipo entero: sin cambios.
- `tests/integration/identity/identity-seed.int.test.ts`: caso `QC-224 R1` (copia del de QC-223 para `entregas.anular`).
- `tests/integration/aislamiento.json`: las dos suites nuevas en `transaccion`.

### R -> test (B1)
- R1: `tests/unit/identity/schema/delivery-void-permission-migration.test.ts` (8);
  `tests/integration/identity/delivery-void-permission-migration.int.test.ts` (6);
  `tests/integration/identity/identity-seed.int.test.ts > QC-224 R1: …`.
- R24: `order-delivery-voids-migration.test.ts > inventory_movement_kind_delivery_void` (UP, guarda del DOWN,
  tipo recreado, CHECK repuestos) y `> R24, R32: delivery_void entra en los CHECK…`;
  `order-delivery-void-constraints.int.test.ts > R24, R32: …` (2 casos).
- R32: `order-delivery-void-constraints.int.test.ts` (control positivo + un INSERT crudo por restriccion:
  entrega/empresa/usuario ajenos, clave por empresa, motivo vacio/espacios/>500, linea anulada dos veces,
  linea de otra entrega, empresa de la linea, asiento sin anulacion/pedido/cantidad<=0/con motivo, anulacion en
  asiento ajeno, uno por lote y anulacion, anulacion y lote de otra empresa, RLS); estatico en
  `order-delivery-voids-migration.test.ts` (RLS ENABLE+FORCE, FK compuestas, `::text`, indice parcial `IS NOT NULL`, DOWN inverso).
- R33 (parte de esquema): `order-delivery-voids-migration.test.ts > R33: ninguna de las dos tablas tiene updated_at ni deleted_at`.
- R34: `order-delivery-voids-migration.test.ts > R34: tablas, columnas y valor de enum nuevos estan en ingles…`.

### Base de la feature
`qc224_anular_entrega` en `localhost:5432` (receta: migrar → sembrar → `resolve --rolled-back` → migrar;
el primer `migrate deploy` ya termino en verde sobre la base vacia y el `resolve` respondio «not in a failed
state»; tras el seed, `No pending migrations`). `DATABASE_URL`/`DIRECT_URL` solo en el entorno de los
comandos; ningun `.env` escrito.

### Migrate / rollback (contra `qc224_anular_entrega`)
```
pnpm run db:migrate   -> Applying 20261009120000…, 20261009120100…, 20261009120200… All migrations have been successfully applied.
pnpm run db:rollback  -> 20261009120200_delivery_void_permission revertida.
  (carpeta apartada)
pnpm run db:rollback  -> 20261009120100_order_delivery_voids revertida.
  (carpeta apartada)
pnpm run db:rollback  -> 20261009120000_inventory_movement_kind_delivery_void revertida.
  estado: enum sin delivery_void = 0, order_delivery_voids = null, permiso = 0, filas _prisma_migrations 20261009* = 0
segundo ciclo up/down: CHECK e indices de inventory_movements identicos a los previos (19 objetos, diff vacio)
pnpm run db:migrate   -> All migrations have been successfully applied.
prisma migrate status -> 84 migrations found … Database schema is up to date!
prisma migrate diff (BD -> schema): en las tablas tocadas solo FK escritas a mano (drift esperado, como QC-223).
```
DOWN de `delivery_void` con asiento presente, en `BEGIN … ROLLBACK` (cadena empresa→…→anulacion→asiento):
```
asiento delivery_void insertado
down.sql abortado: 23514 inventory_movement_kind_delivery_void_in_use: hay asientos con kind = delivery_void; revertir el tipo los dejaria sin representar.
ROLLBACK hecho
```

### Gate
- `pnpm run typecheck`: 0 errores.
- `pnpm run lint`: 0 errores, 7 avisos ajenos (los mismos de T0).
- `vitest related --run --project node --project ui <archivos tocados>`: 5 archivos, 91 pass.
- `vitest run guard`: 62 archivos, 834 pass, 15 skip, 0 fail.
- `vitest run --project node tests/unit/pedidos/schema tests/unit/identity/schema/delivery-void-permission-migration.test.ts tests/unit/inventario/schema`: 33 archivos, 446 pass.
- `vitest run --project integration` (las 3 suites de B1 + `order-delivery-constraints` y
  `delivery-permission-migration` de QC-223): 5 archivos, 66 pass, base efimera borrada al final.
- Rojos ajenos vistos en `vitest run --project node tests/unit` (2), ambos de los archivos de B4 en curso
  (`list-order-deliveries.ts`, `void-delivery.ts`): `clientes/scope.test.ts` (import de clientes desde
  `list-order-deliveries.ts`) y `pedidos/order-delivery-append-only.test.ts` (TC lo enmienda). No son de B1.

### Observacion
- `btrim("reason")` sin segundo argumento solo quita espacios: un motivo de solo tabuladores o saltos de linea
  pasa el CHECK. R32 dice «solo con espacios» y design §3.2 fija ese SQL, asi que se dejo tal cual y el test no
  cubre blancos que no son espacio; la validacion del dominio (trim) es quien los rechaza. Si se quiere cerrar en
  la base: `btrim("reason", E' \t\r\n')`. Decision del leader/humano.

Veredicto: B1 listo para commit; migraciones verificadas up/down/up contra `qc224_anular_entrega`.

## B3 — persistencia de la anulacion en `pedidos` (backend_dev, 2026-10-09)

### Archivos
Nuevos:
- `lib/modules/pedidos/adapters/driven/persistence/order-delivery-void-prisma.ts`:
  `createOrderDeliveryVoidRepository(tx)` (`findByKey`, `findDelivery`, `findDeliveryLines` con
  `quantity.toFixed(4)` y `voided` por `voidLine`, `create` con P2002 → `duplicate_key`, `addLines`
  con `createMany` y P2002 → `already_voided`) y `createOrderDeliveryHistoryReader(tx)` (`listByOrder`:
  `createdAt desc, id asc`, lineas con su `voidLine.void`). Todo filtra con `companyScopeColumns`; sin
  `update`, `delete` ni `upsert`.
- `tests/integration/pedidos/order-delivery-void-repository.int.test.ts` (13 casos).

Modificados:
- `order-delivery-prisma.ts`: `sumOrderDeliveredPackages` añade `voidLine: null` al `where`.
- `tests/integration/pedidos/order-delivery-repository.int.test.ts`: caso R26 con nota fechada.
- `tests/integration/aislamiento.json`: `pedidos/order-delivery-void-repository.int.test.ts` en `transaccion`.
- `tests/unit/pedidos/module-contract.test.ts` (censo, nota fechada 2026-10-09): el adaptador nuevo entra en
  `DUENOS_DE_PRISMA` y `DUENOS_DEL_CLIENTE`; listas cerradas y aserciones previas intactas.
- Arreglo heredado de B4: `lib/modules/pedidos/domain/list-order-deliveries.ts` renombra `customers` →
  `customerNames` (tipo interno `Names` y destructuring); sin cambio de contrato. Ya no queda `customers` en
  `lib/modules/pedidos/`; `tests/unit/clientes/scope.test.ts` en verde. El test unitario no lo usaba.

### R -> test (B3)
`order-delivery-void-repository.int.test.ts`:
- R18: `R18: create con el ambito de B no puede apuntar a la entrega de A`; `R18: findDelivery … la de otra empresa y la que no existe salen null`; `R18: addLines con el ambito de B no puede colgar lineas de la anulacion de A`
- R21, R22: `R21, R22: findDeliveryLines trae todas las lineas con su cantidad y su marca de anulada; con el ambito de B, ninguna`
- R21, R30: `R21, R30: addLines sobre una linea ya anulada responde already_voided y no escribe ninguna de las pedidas`
- R22: `R22: create guarda la anulacion …`; `R22: addLines guarda una linea por linea de entrega …`
- R28: `R28: la misma clave … duplicate_key …`; `R28: la clave es unica por empresa …`; `R28: findByKey …`
- R6, R7, R8, R9: `R7, R9: listByOrder ordena … y trae la anulacion de cada linea`; `R7: dos entregas en el mismo instante salen ordenadas por id`; `R6, R8: listByOrder solo ve las entregas del pedido y la empresa; con el ambito de B, ninguna`
`order-delivery-repository.int.test.ts`:
- R26: `R26: sumDeliveredPackages no suma las lineas anuladas, y una linea con todo anulado no aparece`

### Gate
- `pnpm run typecheck`: 0 errores.
- `pnpm run lint`: 0 errores, 7 avisos ajenos (los mismos de T0).
- `vitest related --run --project node --project ui` (3 archivos de produccion): 315 archivos, 5241 pass, 1 skip,
  1 fail (`module-contract` por el adaptador nuevo) → enmendado; rerun de `module-contract`, `clientes/scope`,
  `pedidos/company-scope` y `guard-ambito-empresa-pedidos`: 4 archivos, 103 pass.
- `vitest run guard` (+ los anteriores): 65 archivos, 890 pass, 15 skip, **1 fail ajeno a B3**:
  `guard-aislamiento-integracion > ningun archivo del arbol se queda fuera del censo`, por
  `inventario/finished-goods-return.int.test.ts` (B2 en curso, aun sin su entrada).
- `vitest run --project integration` contra `qc224_anular_entrega` (copia efimera): `order-delivery-void-repository`,
  `order-delivery-repository`, `company-scope`, `company-scope-queries`, `order-delivery`: 5 archivos, 72 pass.
- No corrido: `order-delivery-append-only.test.ts` (lo enmienda TC).

Veredicto: B3 listo para commit; la guardia de aislamiento queda verde cuando B2 anote su suite.

## B2 — devolucion fisica en `inventario` (backend_dev, 2026-10-09)

### Archivos
Nuevos:
- `lib/modules/inventario/adapters/driven/persistence/finished-goods-return-prisma.ts`: `createFinishedGoodsReturn(tx)`
  (molde de `createFinishedGoodsDispatch`) y `batchLotDirectoryPrisma` (`findLots`: id + empresa, sin filtrar producto vivo).
- `tests/unit/inventario/finished-goods-return-prisma.test.ts` (9 casos, tx doblado)
- `tests/integration/inventario/finished-goods-return.int.test.ts` (5 casos)

Modificados:
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`: `returnFinishedGoods` (octavo camino,
  design § 4.2): lee lotes (id IN, empresa) → `batch_not_found` sin escribir → bloquea productos `FOR NO KEY UPDATE`
  `ORDER BY "id"` sin `deleted_at` → por linea `productBatch.update` (`stock increment`, clave `(id, companyId)`) +
  `writeMovement(delivery_void)` → `recalculateProductStock` una vez por producto (en orden de id). Sin aviso a
  `StockIncreaseListener`.
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`: `writeMovement` escribe
  `orderDeliveryVoidId` cuando llega. La lectura del historial ya admitia `delivery_void` (cast de T0; sin filtro por kind).
- Censos con nota fechada 2026-10-09, aserciones previas conservadas:
  `tests/guards/guard-libro-de-inventario.test.ts` (`CAMINOS_ESPERADOS` + titulo) y
  `tests/unit/inventario/qc121-alcance.test.ts` (`CAMINOS_ESPERADOS`, fuente fabricada con el octavo camino, titulos siete→ocho, noveno fabricado).
- `tests/integration/inventario/ledger-cuadre.int.test.ts`: caso `QC-224 R23, R24` (entrega + anulacion, cuadra antes y despues).
- `tests/integration/aislamiento.json`: `inventario/finished-goods-return.int.test.ts` en `commit` (motivo: `findLots` y
  `findBatchMovements` leen con el cliente global; el resto de casos usa ROLLBACK).
- `lib/composition/index.ts` NO se toca (B5 cablea).

### BLOQUEO: `qc91-alcance.test.ts` rojo
`tasks.md` B2 pide verificar que `qc91-alcance.test.ts` sigue verde sin cambios, y design § 4.2 dice que el incremento es
un `update` porque «el censo de qc91 limita `updateMany`». Pero qc91 tambien limita `update`:
`R21: el alta y el agregado de lote siguen creando; el unico update vive en adjustBatchStock`
(`llamaAUpdateFueraDe(fuente, 'adjustBatchStock')` debe ser `false`) cae con `returnFinishedGoods`. Cualquier
alternativa tambien rompe qc91 (`updateMany` fuera de los dos decrementos; `UPDATE "product_batches"` crudo lo caza
`escrituraDestructivaDeLotes`). No se enmendo por la instruccion explicita «sin cambios». Propuesta (decision del
leader/humano): enmendar qc91 con nota fechada, admitiendo `update` tambien en `returnFinishedGoods` (mismo
mecanismo de lista que QC-223 uso para `updateMany`), conservando la asercion con `'adjustBatchStock'` solo como `true`.

### R -> test (B2)
`finished-goods-return-prisma.test.ts`:
- R23: `R23: lotes -> bloqueo de productos -> (incremento -> asiento) por linea -> un recalculo por producto`;
  `R23: el recalculo va una vez por producto afectado, en orden de id`; `R23: los lotes se leen por id y empresa, sin filtrar por producto vivo`;
  `R23: el incremento suma la cantidad de la linea al lote por su clave (id, empresa), sin condicion de stock`
- R24: `R24: writeMovement recibe delivery_void, cantidad positiva, pedido, anulacion y reason null`;
  `R24: returnForDeliveryVoid acota por la empresa de la entrada y delega en la misma tx`
- R29: `R29: un lote que no vuelve (ausente o de otra empresa) da batch_not_found con ese lote y no escribe nada`
- R30, R31: `R30, R31: bloquea los productos de la empresa ordenados por id, FOR NO KEY UPDATE y sin filtrar por deleted_at`
`finished-goods-return.int.test.ts`:
- R23: `R23: cada lote queda en antes + cantidad y products.stock es la suma de todos sus lotes`
- R24: `R24: un asiento delivery_void por lote, en positivo, con pedido, anulacion, autor y sin motivo`
- R31: `R31: el producto dado de baja recupera igual sus envases y su existencia se recalcula`
- R29 (empresa B no se toca): `R29: un lote de la empresa B pedido con el ambito de A da batch_not_found y no toca nada`
- R7, R24 (`findLots` + historial): `R7, R24: findLots devuelve solo los lotes de la empresa y el historial muestra el asiento delivery_void`
`ledger-cuadre.int.test.ts`: `QC-224 R23, R24: cuadra con un lote del que sale una entrega y vuelve con su anulacion`

### Gate
- `pnpm run typecheck`: 0 errores.
- `pnpm run lint`: 0 errores, 7 avisos ajenos (los mismos de T0).
- `vitest related --run --project node --project ui <6 archivos>`: 292 archivos, 4536 pass, 1 skip, 1 fail por timeout
  (`ui` `inventario/product-page.test.tsx`, 20 s con otra corrida en paralelo); solo, en verde.
- `vitest run guard`: 62 archivos, 838 pass, 15 skip, 0 fail.
- `vitest run tests/unit/inventario/qc121-alcance.test.ts tests/unit/inventario/qc91-alcance.test.ts`: qc121 verde;
  **qc91 1 fail (el bloqueo de arriba)**.
- `vitest run --project integration` contra `qc224_anular_entrega` (copia efimera): `finished-goods-return`,
  `ledger-cuadre`, `finished-goods-dispatch`: 3 archivos, 16 pass, base efimera borrada.

Veredicto: B2 implementado y verde salvo `qc91-alcance` R21, que exige decidir la enmienda (spec contradictorio).

## Estado de la tanda 1 (implementer, 2026-10-09)

- Cerradas: T0, B1, B3, B4. B2 implementada pero NO cerrada; B5 no empezada.
- Bloqueo B2: `tests/unit/inventario/qc91-alcance.test.ts` «R21: el alta y el agregado de lote siguen
  creando; el unico update vive en adjustBatchStock» prohibe todo `productBatch.update` fuera de
  `adjustBatchStock`. `design.md > 4.2` (linea ~524) manda un `update` en `returnFinishedGoods` y
  `design.md > 8` / `tasks.md > B2` dicen que qc91 queda «sin cambio». Contradiccion del spec: pendiente
  de decision (propuesta de backend_dev: enmendar qc91 con nota fechada para admitir `update` tambien en
  `returnFinishedGoods`, conservando las aserciones previas).
- Decisiones de B4 a validar: id corto de 8 caracteres cuando falta un nombre; orden de presentaciones
  dentro de una entrega; `batch_not_found` -> `Error` interno (design § 4 paso 5).
- Decision de B1 a validar: el CHECK `btrim("reason")` acepta un motivo de solo tabs/saltos de linea
  (R32 dice «solo con espacios»); el dominio si lo rechaza.
