# QC-224 — anular-entrega · design.md

> Zona fullstack · Complejidad medium · Requisitos en `requirements.md` (R1–R37, decisiones
> D1–D13; P1 y P2 se cerraron en F1.3 como D12 y D13). Sin dependencias nuevas (R37): todo sale de `zod`,
> Prisma, la aritmética `BigInt` de `finished-goods-dispatch.ts` y los primitivos de UI que ya usa
> `/pedidos` (`Sheet`, `Dialog`, `Checkbox`, `Textarea`, `lucide-react`).

## Lo que ya existe

Busqué los términos `anular`, `anulación`, `void`, `reversal`, `revert`, `devolución`,
`listDeliveries` y `DeliveryHistory` en tres sitios.

- **Board** (`feature_list.json`): solo aparece esta ficha. QC-225 (detalle del producto terminado)
  pide «historial de entregas» y depende de QC-223; esta ficha le deja la lista para reutilizar (D5).
  Ninguna ficha `done` anula entregas.
- **Specs** (`grep -ril`): QC-223 manda la anulación aquí (su D7 y su R32). El resto de
  coincidencias usan «anular» en el sentido de cancelar un pedido (`pedidos.modificar`, «Crear,
  editar, anular y borrar pedidos») o no tocan entregas. Ningún spec define una anulación de
  entrega ni una lista de entregas.
- **Código** (Grep y Read; no usé el MCP del grafo en esta tanda):
  - No existe ningún modelo, tabla, caso de uso ni componente de anulación ni de lista de entregas.
  - `tests/unit/pedidos/order-delivery-append-only.test.ts` (QC-223 R32) **prohíbe** hoy cualquier
    nombre exportado que junte `void|annul|cancel|revert|…` con `Deliver`. Hay que enmendarlo (§8).
  - `sumOrderDeliveredPackages` (`order-delivery-prisma.ts:85`) suma todas las líneas de entrega:
    hay que excluir las anuladas (R26).
  - `product_batches` no tiene `deleted_at`; lo que se da de baja es el producto
    (`softDeleteAliveProduct`, `product-prisma.ts:162`), sin restaurar. Base de D12.
  - `recalculateProductStock` (`product-prisma.ts:484`) no filtra por `deleted_at`: sirve tal cual
    para un producto dado de baja (R31).
  - `order-transitions.ts` deja `ENTREGADO: []` porque la **edición** no sale de un estado final;
    `setStatus` (`order-prisma.ts:780`) no pasa por la matriz y conserva `finishedAt`.

**Lo que se reutiliza:**

| Pieza | Dónde | Para qué |
|---|---|---|
| Unidad de trabajo compartida | `withOrderTransaction` (`order-unit-of-work-prisma.ts`) | abrir la transacción de la anulación |
| Bloqueo y estado del pedido | `OrderWriteRepository.lockAliveById` y `setStatus` | bloquear y volver a `TERMINADO` |
| Patrón de idempotencia | `findByKey` + `create` con `duplicate_key` + señal interna (`deliver-order.ts`) | clave de anulación (R28) |
| Asiento y recálculo | `writeMovement` y `recalculateProductStock` (`product-prisma.ts`) | libro y existencia |
| Servicio de inventario sobre `tx` | molde de `createFinishedGoodsDispatch` (`finished-goods-dispatch-prisma.ts`) | devolución física |
| Permiso | `requirePermission` de `pedidos/domain/actor.ts`; molde de migración `20261008150200_delivery_permission` | `entregas.anular` |
| Presentaciones, clientes, personas | `PresentationCatalog.findRefs`, `CustomerCatalog.findRefsIncludingDeleted`, `PeopleDirectory.findRefsIncludingDeletedInCompany` | nombres de la lista (R7, R9) |
| Esquema del motivo | `cancelOrderSchema.reason` (`order-input.ts:177`): `trim().min(1).max(500)` | mismo tope (R13, R17) |
| Diálogo con motivo | `cancel-order-dialog.tsx` | molde del diálogo de anulación |
| Sheet de entrega | `order-delivery-sheet.tsx` (QC-223) | no se toca: R26 sale del cambio en `sumDeliveredPackages` |

## 1. Qué módulo es dueño de la anulación

**Decisión: el mismo reparto que QC-223.** `pedidos` es dueño de la anulación (caso de uso, tablas
`order_delivery_voids` y `order_delivery_void_lines`, la regla de qué se puede anular y el regreso a
`TERMINADO`). `inventario` es dueño de la entrada física: el incremento del lote, el asiento
`delivery_void` y el recálculo. Se lo ofrece a `pedidos` como un servicio sobre la transacción
compartida (`FinishedGoodsReturn`), simétrico a `FinishedGoodsDispatch`.

Por qué: es la operación inversa de la entrega y tiene los mismos dueños de datos (QC-223
`design.md > 1`). La guardia `guard-libro-de-inventario` exige que toda escritura de
`product_batches` viva en `product-prisma.ts` con su asiento.

## 2. Contrato (lo publica T0)

### 2.1 Servicio de devolución y directorio de lotes: `inventario/domain/finished-goods-return.ts`

Se publica en el barrel de `inventario` con una sentencia `export { … }` propia y sin `type …Deps`
(mismo motivo que QC-223 §2.2: la guardia de fábricas no lo cuenta como caso de uso).

```ts
export type FinishedGoodsReturnInput = {
  readonly companyId: string;
  readonly orderId: string;
  readonly orderDeliveryVoidId: string;
  /** Una por línea de entrega anulada; `quantity` es la de esa línea, decimal(14,4), positiva. */
  readonly lines: readonly { readonly batchId: string; readonly quantity: string }[];
  readonly actorId: string;
  readonly now: Date;
};

export type FinishedGoodsReturnOutcome =
  | { readonly kind: 'returned' }
  | { readonly kind: 'batch_not_found'; readonly batchId: string };

/** Lo implementa un driven de `inventario` sobre la transacción de quien llama. */
export interface FinishedGoodsReturn {
  returnForDeliveryVoid(input: FinishedGoodsReturnInput): Promise<FinishedGoodsReturnOutcome>;
}

/** Lectura fuera de transacción: el código de lote de cada id. Un id ajeno o inexistente no vuelve. */
export interface BatchLotDirectory {
  findLots(batchIds: readonly string[], companyId: string): Promise<ReadonlyMap<string, string>>;
}
```

`batch_not_found` no debería darse nunca (las FK `RESTRICT` impiden borrar un lote con líneas de
entrega), pero el adaptador no lanza: devuelve y el caso de uso deshace todo (R29).

### 2.2 Puertos de `pedidos`: `ports/order-delivery-void-repository.ts`

```ts
export type DeliveryForVoid = { readonly id: string; readonly orderId: string };

export type DeliveryLineForVoid = {
  readonly id: string;
  readonly presentationLineId: string;
  readonly batchId: string;
  readonly packages: number;
  readonly quantity: string;        // decimal(14,4), positiva
  readonly voided: boolean;
};

export type NewDeliveryVoid = {
  readonly voidKey: string;
  readonly deliveryId: string;
  readonly reason: string;          // ya recortado
  readonly actorId: string;
  readonly now: Date;
};

export type RegisteredDeliveryVoid = { readonly id: string; readonly orderId: string };

export interface OrderDeliveryVoidRepository {
  /** La anulación de la empresa con esa clave, con el pedido de su entrega; la de otra empresa no se ve. */
  findByKey(voidKey: string, scope: OrderScope): Promise<RegisteredDeliveryVoid | null>;
  /** La entrega de la empresa; la de otra empresa sale como `null` (R18). */
  findDelivery(deliveryId: string, scope: OrderScope): Promise<DeliveryForVoid | null>;
  /** Todas las líneas de la entrega, con su marca de anulada. Se llama con el pedido ya bloqueado. */
  findDeliveryLines(deliveryId: string, scope: OrderScope): Promise<readonly DeliveryLineForVoid[]>;
  /** `duplicate_key` si la empresa ya tiene una anulación con esa clave (R28). */
  create(entry: NewDeliveryVoid, scope: OrderScope):
    Promise<{ readonly kind: 'created'; readonly id: string } | { readonly kind: 'duplicate_key' }>;
  /** `already_voided` si alguna línea de entrega ya tenía su línea de anulación (único de la base, R30). */
  addLines(voidId: string, deliveryId: string, deliveryLineIds: readonly string[], scope: OrderScope):
    Promise<'ok' | 'already_voided'>;
}

/** Lectura de la lista (R7, R9), sobre el cliente global. */
export type DeliveryHistoryRow = {
  readonly id: string;
  readonly customerId: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly lines: readonly {
    readonly presentationLineId: string;
    readonly batchId: string;
    readonly packages: number;
    readonly void: { readonly reason: string; readonly createdBy: string; readonly createdAt: Date } | null;
  }[];
};

export interface OrderDeliveryHistoryReader {
  /** Por `createdAt` descendente y luego `id`. Solo las del pedido y la empresa. */
  listByOrder(orderId: string, scope: OrderScope): Promise<readonly DeliveryHistoryRow[]>;
}
```

`ports/order-delivery-void-unit-of-work.ts`:

```ts
export type OrderDeliveryVoidTransactionScope = {
  readonly orders: Pick<OrderWriteRepository, 'lockAliveById' | 'setStatus'>;
  readonly voids: OrderDeliveryVoidRepository;
  readonly finishedGoods: FinishedGoodsReturn;
};

export interface OrderDeliveryVoidUnitOfWork {
  run<T>(work: (scope: OrderDeliveryVoidTransactionScope) => Promise<T>): Promise<T>;
}
```

Va aparte de `OrderDeliveryTransactionScope` y de `OrderTransactionScope` por el mismo motivo que en
QC-223 §2.3: no obliga a los dobles que ya existen a construir la anulación (A5).

`scope: OrderScope` va siempre último (`guard-ambito-empresa-pedidos`).

### 2.3 Casos de uso de `pedidos`

`domain/list-order-deliveries.ts` (R4, R6–R9):

```ts
export type OrderDeliveryHistoryView = {
  readonly orderId: string;
  readonly numberText: string;
  readonly orderStatus: OrderStatus;
  readonly deliveries: readonly {
    readonly id: string;
    readonly createdAt: string;            // ISO
    readonly customerName: string;         // aunque esté dado de baja
    readonly authorName: string;           // aunque esté dado de baja
    readonly presentations: readonly {
      readonly presentationLineId: string;
      readonly presentationName: string;
      readonly packages: number;           // suma de sus lotes
      readonly batches: readonly { readonly batchId: string; readonly lot: string; readonly packages: number }[];
      readonly void: { readonly reason: string; readonly authorName: string; readonly createdAt: string } | null;
    }[];
  }[];
};

export type ListOrderDeliveriesDeps = {
  readonly orders: OrderRepository;                                   // findAliveById
  readonly lines: Pick<OrderWriteRepository, 'findPresentationLinesForFinish'>;
  readonly history: OrderDeliveryHistoryReader;
  readonly presentations: Pick<PresentationCatalog, 'findRefs'>;
  readonly customerCatalog: Pick<CustomerCatalog, 'findRefsIncludingDeleted'>;
  readonly people: Pick<PeopleDirectory, 'findRefsIncludingDeletedInCompany'>;
  readonly batchLots: BatchLotDirectory;
  readonly now?: () => Date;
};

export function createListOrderDeliveries(deps: ListOrderDeliveriesDeps):
  (orderId: string, actor: Actor | null | undefined) => Promise<OrderDeliveryHistoryView>;
```

Orden: `requirePermission(actor, 'pedidos.consultar')` (R4, D13) → id con forma de uuid, si no
`order_not_found` → `findAliveById` (`null` → `OrderNotFoundError`, R6) → `listByOrder` → líneas del
reparto, presentaciones, clientes, personas y lotes, en un `Promise.all` → agrupa por
`presentationLineId` dentro de cada entrega. Una presentación está anulada si sus líneas lo están;
como se anulan juntas (R22, R32), basta con mirar la primera. Si un nombre no vuelve (no debería),
se muestra el identificador corto, nunca se lanza.

`domain/void-delivery.ts` (R2, R3, R17–R31):

```ts
const voidDeliverySchema = z.strictObject({
  deliveryId: z.string().uuid(),
  voidKey: z.string().uuid(),
  presentationLineIds: z.array(z.string().uuid()).min(1).max(DELIVERY_MAX_ALLOCATIONS),
  reason: z.string().trim().min(1).max(500),
}); // + refine: presentationLineIds sin repetidos (R17)

export type VoidDeliveryResult = {
  readonly status: 'voided' | 'already_registered';
  readonly orderStatus: 'TERMINADO' | 'ENTREGADO';
};

export type VoidDeliveryDeps = {
  readonly unitOfWork: OrderDeliveryVoidUnitOfWork;
  readonly voids: Pick<OrderDeliveryVoidRepository, 'findByKey' | 'findDelivery'>; // cliente global
  readonly orders: OrderRepository; // para responder a R28 con el estado actual
  readonly now?: () => Date;
};

export function createVoidDelivery(deps: VoidDeliveryDeps):
  (input: unknown, actor: Actor | null | undefined) => Promise<VoidDeliveryResult>;
```

Orden fuera de la transacción:
1. `requirePermission(actor, 'entregas.anular')`: primera sentencia (R2, R3).
2. `safeParse`: si falla, `ValidationError` (R17).
3. `voids.findByKey(voidKey, scope)`: si existe, responde `already_registered` con el estado actual
   del pedido de esa anulación (R28) y no sigue.
4. `voids.findDelivery(deliveryId, scope)`: `null` → `DeliveryNotFoundError` (R18).
5. `unitOfWork.run`: §4.

No llama a `assertTransition`: la matriz es de la **edición**, y `ENTREGADO → TERMINADO` no es una
edición (A7). El regreso queda en un solo sitio, este caso de uso, igual que `cancelOrder` es el
único que escribe `CANCELADO`.

### 2.4 Server Actions (en `pedidos/adapters/driving/order-actions.ts`)

En el archivo que ya existe, por el mismo motivo que QC-223 §2.5 (un solo archivo `'use server'`
en `pedidos`, `module-contract.test.ts`).

```ts
export type OrderDeliveriesResult = { status: 'success'; data: OrderDeliveryHistoryView } | ErrorState;
export async function listOrderDeliveriesAction(orderId: string): Promise<OrderDeliveriesResult>;

export type VoidDeliveryInput = {
  readonly deliveryId: string;
  readonly voidKey: string;
  readonly presentationLineIds: readonly string[];
  readonly reason: string;
};
export type VoidDeliveryActionResult = { status: 'success'; data: VoidDeliveryResult } | ErrorState;
export async function voidDeliveryAction(input: unknown): Promise<VoidDeliveryActionResult>;
```

Las dos resuelven el actor una vez por petición y traducen errores con `createErrorStateTranslator`.

### 2.5 Códigos de error

Dos nuevos en `lib/modules/errores/domain/error-codes.ts`, cada uno con su «Distinto de…», su clave
en `ERROR_MESSAGE_KEY` y su texto en `ERROR_MESSAGES_ES`. Las clases van en
`lib/modules/pedidos/domain/errors.ts`.

| Situación | Código | Clase | Nuevo / reusado | Mensaje |
|---|---|---|---|---|
| Entrega ausente o ajena (R18) | `delivery_not_found` | `DeliveryNotFoundError` | **nuevo** | `La entrega no existe.` |
| Presentación ya anulada (R21, R30) | `delivery_already_voided` | `DeliveryAlreadyVoidedError` | **nuevo** | `Alguna presentacion elegida ya estaba anulada: revisa la lista y vuelve a intentarlo.` |
| Pedido no `TERMINADO` ni `ENTREGADO` (R19) | `action_not_allowed` | `ActionNotAllowedError` | reusado | catálogo |
| Pedido ausente o borrado (R6, R19) | `order_not_found` | `OrderNotFoundError` | reusado | catálogo |
| Forma (R17, R20) | `invalid_input` | `ValidationError` | reusado | catálogo |
| Permiso (R2, R4) | `unauthorized` | `UnauthorizedError` | reusado | catálogo |

El test de unicidad del catálogo vigila que ningún texto repita otro.

### 2.6 Fixtures (T0)

`tests/fixtures/order-delivery-void.ts`:
- `deliveryHistoryView(overrides)`: un pedido `ENTREGADO` con dos entregas; la primera con dos
  presentaciones (una anulada con motivo) y la segunda con una.
- `VOID_RESULTS`: `voided` + `TERMINADO` y `already_registered` + `ENTREGADO`.
- `VOID_ERROR_STATES`: un `ErrorState` por código de §2.5.
- `voidInput(overrides)`: un `VoidDeliveryInput` válido.

### 2.7 Stub de T0

T0 deja los dos casos de uso con su firma, el permiso primero y un cuerpo que lanza
`ActionNotAllowedError`; las dos actions cableadas; y `composition` publica
`pedidos.listOrderDeliveries` y `pedidos.voidDelivery` con dobles mínimos donde aún no hay adaptador.

## 3. Modelo de datos y migraciones (R1, R24, R32, R34)

Tres migraciones, por el 55P04 de Postgres (un valor de enum nuevo no se usa en la misma
transacción), igual que QC-223. Los timestamps son orientativos: al crearlas se comprueba que van
detrás de la última de `origin/dev` (hoy `20261008150200_delivery_permission`) y que no chocan con
otra feature en vuelo.

### 3.1 `20261009120000_inventory_movement_kind_delivery_void`

```sql
ALTER TYPE "InventoryMovementKind" ADD VALUE 'delivery_void';
```

`down.sql`: molde de `20261008150050_inventory_movement_kind_delivery/down.sql`. Aborta con
`RAISE EXCEPTION` si hay asientos `delivery_void`, quita los CHECK que dependen del tipo, recrea el
tipo sin el valor y repone los CHECK.

### 3.2 `20261009120100_order_delivery_voids`

```sql
-- pedidos: la anulación
CREATE TABLE "order_delivery_voids" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id"  UUID NOT NULL,
  "delivery_id" UUID NOT NULL,
  "void_key"    UUID NOT NULL,
  "reason"      TEXT NOT NULL,
  "created_by"  UUID NOT NULL,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_delivery_voids_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_id_company_id_key" UNIQUE ("id", "company_id");
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_id_delivery_id_key" UNIQUE ("id", "delivery_id");
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_company_key_unique" UNIQUE ("company_id", "void_key");
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_reason_not_blank"
  CHECK (length(btrim("reason")) BETWEEN 1 AND 500);
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_delivery_id_fkey"
  FOREIGN KEY ("delivery_id", "company_id") REFERENCES "order_deliveries"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_voids" ADD CONSTRAINT "order_delivery_voids_created_by_fkey"
  FOREIGN KEY ("created_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "order_delivery_voids_delivery_id_idx" ON "order_delivery_voids"("delivery_id");
CREATE INDEX "order_delivery_voids_created_by_idx" ON "order_delivery_voids"("created_by");

-- pedidos: una línea de entrega anulada
ALTER TABLE "order_delivery_lines"
  ADD CONSTRAINT "order_delivery_lines_id_delivery_id_key" UNIQUE ("id", "delivery_id");

CREATE TABLE "order_delivery_void_lines" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id"       UUID NOT NULL,
  "void_id"          UUID NOT NULL,
  "delivery_id"      UUID NOT NULL,
  "delivery_line_id" UUID NOT NULL,
  CONSTRAINT "order_delivery_void_lines_pkey" PRIMARY KEY ("id")
);
-- Una línea de entrega se anula una sola vez (R21, R30, R32).
ALTER TABLE "order_delivery_void_lines" ADD CONSTRAINT "order_delivery_void_lines_delivery_line_unique" UNIQUE ("delivery_line_id");
-- La línea de entrega es de la entrega anulada: las dos FK comparten "delivery_id" (R32).
ALTER TABLE "order_delivery_void_lines" ADD CONSTRAINT "order_delivery_void_lines_void_fkey"
  FOREIGN KEY ("void_id", "delivery_id") REFERENCES "order_delivery_voids"("id", "delivery_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_void_lines" ADD CONSTRAINT "order_delivery_void_lines_delivery_line_fkey"
  FOREIGN KEY ("delivery_line_id", "delivery_id") REFERENCES "order_delivery_lines"("id", "delivery_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_void_lines" ADD CONSTRAINT "order_delivery_void_lines_void_company_fkey"
  FOREIGN KEY ("void_id", "company_id") REFERENCES "order_delivery_voids"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "order_delivery_void_lines_void_id_idx" ON "order_delivery_void_lines"("void_id");
CREATE INDEX "order_delivery_void_lines_company_id_idx" ON "order_delivery_void_lines"("company_id");

-- inventario: el asiento de anulación
ALTER TABLE "inventory_movements" ADD COLUMN "order_delivery_void_id" UUID;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_delivery_void_id_fkey"
  FOREIGN KEY ("order_delivery_void_id", "company_id") REFERENCES "order_delivery_voids"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "inventory_movements_order_delivery_void_id_idx" ON "inventory_movements"("order_delivery_void_id");
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_delivery_void_id_matches_kind"
  CHECK (("kind"::text = 'delivery_void') = ("order_delivery_void_id" IS NOT NULL));
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_delivery_void_quantity_positive"
  CHECK ("kind"::text <> 'delivery_void' OR "quantity" > 0);
CREATE UNIQUE INDEX "inventory_movements_one_delivery_void_per_batch"
  ON "inventory_movements" ("order_delivery_void_id", "batch_id") WHERE "order_delivery_void_id" IS NOT NULL;

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind"
  CHECK (("kind"::text IN ('consumption', 'production', 'delivery', 'delivery_void')) = ("order_id" IS NOT NULL));
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind"::text = 'adjustment' AND "reason" IS NOT NULL)
      OR ("kind"::text IN ('opening', 'consumption', 'production', 'delivery', 'delivery_void') AND "reason" IS NULL));

ALTER TABLE "order_delivery_voids"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_delivery_voids"      FORCE  ROW LEVEL SECURITY;
ALTER TABLE "order_delivery_void_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_delivery_void_lines" FORCE  ROW LEVEL SECURITY;
```

**Antes de escribir el SQL** se verifica el texto vigente de `inventory_movements_order_id_matches_kind`
y `inventory_movements_reason_matches_kind` (el de QC-223 §3.2 es la referencia; puede haberlo
reescrito otra migración posterior) y que `users` tiene la clave `(id, company_id)` que ya usa
`order_deliveries_created_by_fkey`.

**El índice parcial** usa `"order_delivery_void_id" IS NOT NULL` y no `"kind"::text = …`, por el
42P17 que QC-223 ya encontró (el cast de enum a texto no es `IMMUTABLE`).

`down.sql`, en orden inverso: repone los dos CHECK con su texto previo; quita índice, CHECK, FK y
columna `order_delivery_void_id`; hace `DROP` de `order_delivery_void_lines`, de
`order_delivery_lines_id_delivery_id_key` y de `order_delivery_voids`.

**Por qué la empresa queda cubierta (R32).**
- La anulación apunta a la entrega con FK compuesta `(delivery_id, company_id)`, y al usuario con
  `(created_by, company_id)`.
- La línea de anulación hereda empresa y entrega de la anulación por dos FK compuestas, y la línea de
  entrega tiene que ser de esa misma entrega.
- El asiento apunta a la anulación con `(order_delivery_void_id, company_id)`; la empresa del asiento
  la ata a la del lote el disparador `inventory_movements_check_company`, que ya existe.

**RLS.** Las dos tablas nacen con `ENABLE` y `FORCE`, sin policies, como el resto
(`docs/architecture.md > Acceso a datos y autorizacion`). La frontera es el permiso en el caso de uso
más el ámbito de empresa en cada consulta.

**Sin borrado (R33, D9).** Ninguna de las dos tablas tiene `updated_at` ni `deleted_at`: son de solo
inserción, como `order_deliveries`. «Borrado lógico» (D9) se cumple por exceso: no hay borrado de
ningún tipo. Ningún adaptador declara `update`, `delete` ni `upsert` sobre ellas (§8).

**`db/schema.prisma`:**
- `/// @module pedidos model OrderDeliveryVoid`: `delivery` con `@relation` (mismo módulo);
  `createdBy` y `companyId` sin `@relation` (drift). `lines OrderDeliveryVoidLine[]`.
- `/// @module pedidos model OrderDeliveryVoidLine`: `void` y `deliveryLine` con `@relation`;
  `deliveryLineId` con `@unique`. Las FK compuestas son drift.
- `OrderDelivery` gana `voids OrderDeliveryVoid[]`; `OrderDeliveryLine` gana
  `voidLine OrderDeliveryVoidLine?`.
- `InventoryMovement` gana `orderDeliveryVoidId String? @map("order_delivery_void_id") @db.Uuid`, sin
  `@relation`. `InventoryMovementKind` gana `delivery_void`, al final.

### 3.3 `20261009120200_delivery_void_permission`

Migración de datos con el molde de `20261008150200_delivery_permission`:

```sql
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('entregas.anular', 'entregas', 'anular',
   'Anular entregas de producto terminado de los pedidos de la empresa.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'entregas.anular' FROM "roles" AS "r" WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
```

`down.sql`: `DELETE` de `role_permissions` y luego de `permissions` con ese código.

`permissions.ts` gana la entrada al final, el párrafo de enmienda corto (sin citar ficha) y
`'entregas.anular'` en `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]`. `anular` es la segunda acción
que no es `consultar` ni `modificar` (como `asignaciones.ejecutar`); `permissions.test.ts` la admite
igual que admite aquella.

## 4. Escritura: flujo de la transacción (R18–R31)

Dentro de `unitOfWork.run` (`withOrderTransaction`). Orden de bloqueo: pedido, producto, lote. Es el
de la entrega, así que una anulación y una entrega del mismo pedido se serializan en el paso 1 sin
ciclo nuevo (R30).

0. *Antes de la transacción* (§2.3, pasos 3 y 4): clave ya registrada → `already_registered`;
   entrega ausente o ajena → `delivery_not_found`.
1. `orders.lockAliveById(delivery.orderId, scope)`. `null` → `OrderNotFoundError`. Con el pedido
   bloqueado, `voids.findByKey(voidKey)`: si ya está, `VoidAlreadyRegisteredSignal` (otra petición
   con la misma clave confirmó mientras esta esperaba). Estado distinto de `TERMINADO` y `ENTREGADO`
   → `ActionNotAllowedError` (R19).
2. `voids.findDeliveryLines(deliveryId, scope)`, ya bajo el bloqueo del pedido. Agrupa por
   `presentationLineId`:
   - un `presentationLineId` pedido sin líneas en la entrega → `ValidationError` (R20);
   - alguna línea de una presentación pedida con `voided: true` → `DeliveryAlreadyVoidedError` (R21).
3. `voids.create(...)`. `duplicate_key` → `VoidAlreadyRegisteredSignal`.
4. `voids.addLines(voidId, deliveryId, <todas las líneas de las presentaciones pedidas>)` (R22).
   `already_voided` → `DeliveryAlreadyVoidedError`. Con el pedido bloqueado no debería darse; es el
   respaldo de la base.
5. `finishedGoods.returnForDeliveryVoid({ …, lines: [{ batchId, quantity }] })` con la `quantity`
   guardada en cada línea de entrega (R23, R24). `batch_not_found` → `Error` interno (R29).
6. Si el pedido estaba `ENTREGADO`: `orders.setStatus(orderId, 'ENTREGADO', 'TERMINADO', actorId, now,
   scope)`; algo distinto de `'ok'` lanza (R27). `setStatus` no toca `finishedAt`, `packedBy` ni
   `conditionedBy`.
7. Devuelve `{ status: 'voided', orderStatus: 'TERMINADO' }`.

Fuera de la transacción, `VoidAlreadyRegisteredSignal` se resuelve como en QC-223 §4.1: se relee la
anulación por clave y se responde `already_registered` con el estado actual del pedido de esa
anulación (R28). Ese pedido solo puede estar `TERMINADO` o `ENTREGADO` (una vez anulada, se puede
volver a entregar y completar), y cabe en `VoidDeliveryResult.orderStatus`.

### 4.1 Envases entregados sin las líneas anuladas (R26)

`sumOrderDeliveredPackages` (`order-delivery-prisma.ts`) añade `voidLine: null` al `where`. Con eso:
- `getOrderDelivery` (sheet de QC-223) muestra lo anulado como pendiente y vuelve a ofrecer lotes;
- `deliverOrder` admite volver a entregarlo y vuelve a calcular cuándo el pedido pasa a `ENTREGADO`.

No hace falta tocar `checkDelivery` ni el sheet. Las líneas de entrega no se modifican (R25).

### 4.2 `returnFinishedGoods` en `product-prisma.ts`

Función exportada nueva, el **octavo** camino de escritura de `product_batches`. La envuelve
`adapters/driven/persistence/finished-goods-return-prisma.ts` (`createFinishedGoodsReturn(tx)`), con
el molde de `createFinishedGoodsDispatch`.

1. Lee los lotes pedidos (`id IN (…)`, empresa) con su `product_id`. El primero que falte →
   `batch_not_found`.
2. Bloquea sus productos con `FOR NO KEY UPDATE`, ordenados por `id` para no abrir un orden de
   bloqueo nuevo entre dos anulaciones. **Sin filtrar por `deleted_at`** (R31, D12).
3. Por cada línea:
   - incremento del lote por su clave `(id, company_id)`: `stock + quantity`, `updatedBy`,
     `updatedAt`. No es condicional, porque sumar no puede dejar el lote negativo;
   - `writeMovement` con `kind: 'delivery_void'`, `quantity` positiva, `reason: null`, `orderId`,
     `orderPresentationLineId: null`, `orderDeliveryVoidId` y `createdBy` (R24).
4. `recalculateProductStock` una vez por producto afectado (R23).
5. Devuelve `returned`.

Es un `update` y no un `updateMany`: el censo de `qc91-alcance.test.ts`, que limita `updateMany` a
los dos decrementos condicionales, no cambia.

**No avisa a `StockIncreaseListener`.** Ese aviso revisa pedidos bloqueados por falta de material, y
un producto terminado no puede ser ingrediente de una receta (QC-223 §5, «Lotes reservados»). Por
eso tampoco lo dispara la entrada del empaque. T0 lo vuelve a verificar.

Para soportarlo:
- `NewInventoryMovement` (`domain/inventory-movement.ts`): `kind` gana `'delivery_void'` y aparece
  `readonly orderDeliveryVoidId?: string | null`. `writeMovement` lo escribe cuando llega.
- `InventoryMovementView['kind']` y `BatchHistoryEntry['kind']` ganan `'delivery_void'`.

## 5. Lectura de la lista (R6–R9)

- **`listByOrder`** vive en `pedidos/adapters/driven/persistence/order-delivery-void-prisma.ts`,
  sobre el cliente global: `order_deliveries` del pedido y la empresa, con sus líneas y, por cada
  línea, su `voidLine` con la anulación (`reason`, `created_by`, `created_at`). Ordena por
  `created_at DESC, id`.
- **`findLots`** vive en `inventario/adapters/driven/persistence/finished-goods-return-prisma.ts`
  (`batchLotDirectoryPrisma`): `product_batches` por `id IN` y empresa, sin filtrar por producto
  vivo (un lote entregado de un producto dado de baja también tiene que verse).
- Clientes y personas, **incluidos los dados de baja**: `findRefsIncludingDeleted` y
  `findRefsIncludingDeletedInCompany`, como la lista de responsables.

## 6. UI

### 6.1 Acción de fila «Entregas» (R5)

- `order-row-actions.tsx` gana `onDeliveries?: (order) => void` y el mapa exhaustivo
  `ORDER_STATUS_HAS_DELIVERIES` (`true` solo en `TERMINADO` y `ENTREGADO`).
- El ítem «Entregas» (`order-action-deliveries`, icono `ClipboardListIcon` de `lucide-react`) se
  añade solo con un estado de ese mapa. No pide permiso propio: la pantalla ya exige
  `pedidos.consultar` (D13).
- `order-list-section.tsx` calcula `canVoidDelivery` con `hasPermission(user, 'entregas.anular')` en
  `loadRowPermissions`. `order-table.tsx`, `order-columns.tsx` y `order-sheet.tsx`
  (`OrderRowSheetActions`) pasan el prop y montan el sheet de entregas solo mientras está abierto,
  como el de entrega.

### 6.2 Sheet: `app/(private)/pedidos/components/order-deliveries-sheet.tsx`

Componente de cliente sobre `Sheet`. Al abrir llama a `listOrderDeliveriesAction(orderId)`, con
esqueleto mientras espera y `order-deliveries-error` si falla. Pinta `OrderDeliveryList` con los
datos, `canVoid` y el estado del pedido. Expone `reload()` para el diálogo.

### 6.3 Lista reutilizable: `app/(private)/pedidos/components/order-delivery-list.tsx`

Presentacional, sin llamadas propias: recibe `deliveries`, `canVoid`, `orderStatus` y `onVoid`. Vive
en la ruta de Pedidos porque hoy la usa un solo sitio (`docs/architecture.md > sin sobre-ingenieria`);
QC-225 la promueve a `components/shared/` cuando la necesite, con la misma API (D5).

- Vacío: `order-deliveries-empty` (R8).
- Por entrega (`order-delivery-entry`, `data-delivery-id`): fecha, cliente, autor (R7).
- Por presentación (`order-delivery-entry-presentation`, `data-presentation-line-id`): nombre,
  envases y lotes (`order-delivery-entry-batch`: lote y envases). Si está anulada:
  `order-delivery-entry-voided` con «Anulada», motivo, autor y fecha (R9).
- Botón «Anular» (`order-delivery-void`) solo si `canVoid`, el estado es `TERMINADO` o `ENTREGADO`
  y queda alguna presentación sin anular (R10).

### 6.4 Diálogo: `app/(private)/pedidos/components/delivery-void-dialog.tsx`

Molde de `cancel-order-dialog.tsx`, montado solo mientras está abierto.

- Al montarse genera `voidKey = crypto.randomUUID()` y lo guarda en estado: cada confirmación de
  este diálogo usa la misma (R14). Cerrarlo y volver a abrirlo genera otra.
- Una casilla por presentación sin anular (`delivery-void-presentation`, todas marcadas al abrir) con
  nombre y envases. Sin campos de cantidad (R11).
- `Textarea` de motivo (`delivery-void-reason`).
- Validación al confirmar: ninguna marcada → `delivery-void-empty-error` (R12); motivo vacío tras
  recortar → `delivery-void-reason-error`; más de 500 → `delivery-void-reason-too-long` (R13).
  Ninguno envía.
- Respuesta:
  - `voided` o `already_registered`: cierra, toast «Entrega anulada», `reload()` de la lista y
    `router.refresh()` (R15);
  - `delivery_already_voided`: muestra `delivery-void-rejected` con el mensaje y llama a `reload()`
    (R16);
  - cualquier otro error: `delivery-void-error`, sigue abierto con lo marcado y el motivo (R16).

### 6.5 Historial del lote (R35)

`batch-history.tsx`: `KIND_LABELS.delivery_void = 'Anulación de entrega'`. La cantidad y el número de
pedido se pintan como en `delivery`, porque el asiento lleva `orderId`.

## 7. Idempotencia (R28)

La clave nace en el diálogo (§6.4), no en un borrador: anular no tiene borrador (no lo pide ninguna
decisión). Cubre el doble clic y el reintento tras perder la respuesta dentro del mismo diálogo. Si
el usuario cierra el diálogo sin respuesta y vuelve a anular, la clave es otra; el servidor responde
entonces `delivery_already_voided` (R21) si la primera ya se aplicó, que es correcto: no hay doble
devolución, porque el único de `delivery_line_id` lo impide.

## 8. Censos, guardias y llamadores afectados

Cada enmienda conserva sus aserciones previas y lleva una nota fechada.

| Archivo | Qué censa | Cambio | Task |
|---|---|---|---|
| `tests/unit/pedidos/order-delivery-append-only.test.ts` | caminos que modifican o anulan una entrega | `NOMBRE_MUTANTE` admite exactamente `createVoidDelivery` y `voidDeliveryAction` (solo insertan, R33); `PRISMA_MUTANTE` y `SQL_MUTANTE` ganan `orderDeliveryVoid`, `orderDeliveryVoidLine`, `order_delivery_voids` y `order_delivery_void_lines`; un caso sintético nuevo con un tercer nombre `void…Deliver` sigue en rojo | TC |
| `tests/guards/guard-libro-de-inventario.test.ts` | caminos de escritura de `product_batches` | + `returnFinishedGoods` y el título | B2 |
| `tests/unit/inventario/qc121-alcance.test.ts` | caminos con recálculo | + `returnFinishedGoods` (recalcula) | B2 |
| `tests/unit/inventario/qc91-alcance.test.ts` | `update` y `updateMany` sobre `productBatch` | enmienda 2026-10-09: admite exactamente un `update` más, en `returnFinishedGoods` (D12, R31); `delete`, `deleteMany`, `upsert`, SQL crudo y `updateMany` siguen igual | B2 |
| `tests/guards/guard-identificador-de-request.test.ts` | `MIGRACIONES_ESPERADAS`, `E2E_ESPERADOS` | + las tres migraciones; + `anular-entrega.spec.ts` | B1, TI |
| `tests/unit/pedidos/schema/pedidos-schema.test.ts` | modelos `@module pedidos`, referencias sin `@relation` | + `OrderDeliveryVoid`, `OrderDeliveryVoidLine` | B1 |
| `tests/unit/inventario/schema/inventario-schema.test.ts`, `inventario-migration.test.ts`, `finished-product-enum-values-migration.test.ts`, `tests/unit/proveedores/schema/proveedores-migration.test.ts` | valores de `InventoryMovementKind` | + `delivery_void`, si enumeran el tipo entero | B1 |
| `tests/unit/identity/permissions.test.ts` | catálogo, módulos, acciones, Administrador | + `entregas.anular`; `anular` admitida como acción, como `ejecutar` | T0 |
| `tests/integration/identity/identity-seed.int.test.ts` | seed por rol | + `entregas.anular` en el Administrador | B1 |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | `ACCIONES` | + `listOrderDeliveriesAction`, `voidDeliveryAction` | B5 |
| `tests/unit/pedidos/module-contract.test.ts` | un solo archivo `'use server'`; consumidores de `assertTransition` | sin cambio (verificar: `void-delivery.ts` no llama a `assertTransition`) | TC |
| `tests/integration/aislamiento.json` | modo de cada `.int.test.ts` | + suites nuevas | B1–B5 |
| `tests/unit/pedidos/scope.test.ts`, `tests/unit/inventario/scope.test.ts`, `company-scope.test.ts` (los dos) | ámbito de empresa | revisar; enmendar solo si un caso lo exige | TC |
| `tests/unit/errores/*` | textos únicos | dos códigos nuevos | T0 |
| `tests/integration/pedidos/order-delivery-repository.int.test.ts` | `sumDeliveredPackages` | + caso: una línea anulada no suma | B3 |

Llamadores de tipos que cambian, todos en `typecheck`:
- `BatchHistoryEntry['kind']`: `batch-history.tsx` (`KIND_LABELS`) y las fixtures que lo enumeren.
- `InventoryMovementView['kind']`: sus lectores (`batch-movement-prisma.ts`).

Sin cambio, verificado:
- `RUTAS_ESPERADAS_HOY` de `guard-pantallas-exigen-permiso`: no hay ruta nueva.
- `order-delivery-sheet.tsx`, `deliver-order.ts`, `get-order-delivery.ts`: el cambio de R26 entra por
  `sumDeliveredPackages`.
- `order-transitions.ts`: la matriz de edición no cambia (A7).

## 9. Alternativas descartadas

- **A1 — Marcar la línea de entrega como anulada** (`voided_at`, `voided_by`, `void_reason` en
  `order_delivery_lines`). Es lo más corto, pero modifica la entrega: va contra D8 y QC-223 R32, y
  pierde la anulación como registro con su propia clave.
- **A2 — Devolver con un asiento `adjustment`.** El ajuste exige un motivo del conjunto cerrado de
  `MovementReason` y no lleva pedido ni entrega: el historial del lote no diría de qué pedido vuelve
  el producto, y el libro mezclaría recuentos con devoluciones.
- **A3 — Reutilizar el tipo `delivery` con cantidad positiva.** Rompe el CHECK
  `inventory_movements_delivery_quantity_negative` y el único `(order_delivery_id, batch_id)`, y la
  suma de asientos `delivery` dejaría de ser «lo que salió».
- **A4 — Línea de anulación por presentación, no por línea de entrega.** Guardaría menos filas, pero
  la base no podría impedir una segunda devolución del mismo lote: el único por `delivery_line_id`
  es lo que cierra R30 sin depender del bloqueo.
- **A5 — Ampliar `OrderDeliveryTransactionScope` con la anulación.** Obliga a todos los dobles de la
  entrega a construir piezas que no usan, como QC-223 A4.
- **A6 — Bloquear la anulación si el producto está dado de baja** (descartada por D12). El producto no se
  restaura, así que el pedido quedaría `ENTREGADO` para siempre.
- **A7 — Añadir `ENTREGADO → TERMINADO` a la matriz de `order-transitions.ts`.** La matriz es la de
  la edición: abriría `ENTREGADO` a `updateOrder`. El regreso vive solo en `void-delivery.ts`, igual
  que `CANCELADO` vive solo en `cancelOrder`.
- **A8 — Anular desde el sheet de entrega de QC-223.** Ese sheet solo abre en `TERMINADO`; un pedido
  `ENTREGADO`, que es el caso principal (D1), no llegaría. Y D5 pide la lista de entregas.
- **A9 — Un permiso `entregas.consultar` para la lista** (descartada por D13). Es un permiso más en catálogo y seed
  para un dato que quien ve el pedido ya puede ver.

## 10. Trazabilidad prevista (R → test)

Rutas abreviadas: **u** `tests/unit/pedidos/` (o `inventario/`, `identity/`); **ui**
`tests/unit/pedidos-ui/`; **int** `tests/integration/pedidos/` (o `inventario/`, `identity/`);
**e2e** `e2e/anular-entrega.spec.ts`.

| R | Test previsto |
|---|---|
| R1 | u `identity/permissions.test.ts`; u `identity/schema/delivery-void-permission-migration.test.ts`; int `identity/delivery-void-permission-migration.int.test.ts`; int `identity/identity-seed.int.test.ts` |
| R2, R3 | u `void-delivery.test.ts` (ningún puerto se llama; actor sintético con otro rol; Administrador sin el permiso) |
| R4, R6 | u `list-order-deliveries.test.ts`; int `order-delivery-void.int.test.ts` (empresa B) |
| R5 | ui `order-row-actions.test.tsx` (los diez estados) |
| R7, R8, R9 | u `list-order-deliveries.test.ts` (cliente y autor dados de baja); ui `order-delivery-list.test.tsx` |
| R10 | ui `order-delivery-list.test.tsx` (sin permiso no está en el DOM; todo anulado; pedido en otro estado) |
| R11–R16 | ui `delivery-void-dialog.test.tsx` (la action no se llama en R12, R13; misma clave en dos confirmaciones) |
| R17, R18, R19, R20, R21 | u `void-delivery.test.ts`; int `order-delivery-void.int.test.ts` |
| R22, R25, R27 | int `order-delivery-void.int.test.ts` (filas de anulación; entrega y asientos de entrega idénticos antes y después; `finished_at`, `packed_by`, `conditioned_by` intactos) |
| R23, R24 | u `inventario/finished-goods-return-prisma.test.ts` (tx doblado); int `inventario/finished-goods-return.int.test.ts`; int `inventario/ledger-cuadre.int.test.ts` (caso con anulación) |
| R26 | int `order-delivery-repository.int.test.ts` (línea anulada no suma); int `order-delivery-void.int.test.ts` (`getOrderDelivery` vuelve a ofrecer lo anulado y `deliverOrder` lo entrega de nuevo) |
| R28 | u `void-delivery.test.ts`; int `order-delivery-void.int.test.ts` (misma clave dos veces: un solo juego de filas) |
| R29 | int `order-delivery-void.int.test.ts` (fallo en `setStatus` o en el segundo lote: nada escrito) |
| R30 | int `order-delivery-void-concurrency.int.test.ts` |
| R31 | int `inventario/finished-goods-return.int.test.ts` (producto dado de baja: el lote recupera y el producto recalcula) |
| R32 | int `order-delivery-void-constraints.int.test.ts` (`INSERT` crudos); u `pedidos/schema/order-delivery-voids-migration.test.ts` |
| R33 | u `order-delivery-append-only.test.ts` (enmendado) |
| R34 | u `pedidos/schema/order-delivery-voids-migration.test.ts` (nombres de tablas, columnas y valor de enum en `[a-z_]` y en la lista esperada) |
| R35 | u `inventario/batch-history.test.tsx` |
| R36 | e2e |
| R37 | `tests/guards/guard-dependencias-aprobadas.test.ts` |

## 11. Dependencias e integraciones

- **Dependencias:** ninguna (R37). `ClipboardListIcon` sale de `lucide-react`, que ya está en el
  repo. `crypto.randomUUID()` es del navegador. `Checkbox`, `Textarea`, `Dialog` y `Sheet` ya están
  en `components/ui/`.
- **Integraciones externas:** ninguna. La devolución sube existencia de producto terminado, que no
  es ingrediente, así que no avisa a `StockIncreaseListener` (§4.2).
