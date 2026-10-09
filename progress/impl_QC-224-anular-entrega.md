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
