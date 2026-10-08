# QC-223 — entregar-producto-terminado · design.md

> Zona fullstack · Complejidad high · Requisitos en `requirements.md` (R1–R40, decisiones D1–D11,
> preguntas P1 y P2). Sin dependencias nuevas (R40): todo sale de `zod`, Prisma, la aritmética
> `BigInt` de `decimal-quantity.ts` y los primitivos de UI que ya usa `/pedidos`.

## Lo que ya existe

Busqué los términos `entrega`, `entregar`, `delivery`, `despacho`, `ENTREGADO` y `salida` en tres
sitios.

- **Board** (`feature_list.json`): solo aparecen esta ficha y QC-224 `anular-entrega`, que depende
  de ella. QC-225 (detalle del producto terminado) también nace de `/afinar-feature` y depende de
  esta. Ninguna ficha `done` registra entregas a cliente.
- **Specs** (`grep -ril`): las coincidencias usan «entregar» en el sentido viejo de «finalizar el
  pedido» (QC-34, QC-63, QC-145, QC-168). QC-215 R33 dice «ningún camino de aplicación escribe
  `ENTREGADO`», y QC-215 D11 deja expresamente `TERMINADO → ENTREGADO` como «la entrega al
  cliente». Esta ficha es ese camino y enmienda la primera frase de QC-215 R33 (§8). Ningún spec
  define un modelo de entrega.
- **Código** (Grep; no usé el MCP del grafo en esta tanda):
  - No existe ningún modelo, tabla ni caso de uso de entrega.
  - `ENTREGADO` existe en `OrderStatus`, y la matriz (`order-transitions.ts:46`) admite
    `TERMINADO → ENTREGADO`. `createTransitionOrder` lo rechaza como destino reservado
    (`transition-order.ts:24-30`), así que hoy nada escribe `ENTREGADO`.
  - `setStatus` / `setAliveOrderStatus` conserva `finishedAt`, `packedBy` y `conditionedBy`
    (`tests/integration/pedidos/order-finished-at.int.test.ts:200`).
  - Comentarios desfasados que no se toman como verdad: `order-packing-actions.ts:66` («Deja el
    pedido `ENTREGADO`») y QC-141 D12.

**Lo que se reutiliza:**

| Pieza | Dónde | Para qué |
|---|---|---|
| Unidad de trabajo compartida | `withOrderTransaction` (`pedidos/adapters/driven/persistence/order-unit-of-work-prisma.ts:22`) | abrir la transacción de la entrega |
| Bloqueo y estado del pedido | `OrderWriteRepository.lockAliveById` y `setStatus` | bloquear el pedido y moverlo a `ENTREGADO` |
| Líneas del reparto | `OrderWriteRepository.findPresentationLinesForFinish` | envases pedidos por línea |
| Decremento condicional | patrón `updateMany … stock >= qty` de `consumeBatchStock` (`product-prisma.ts:1135`) | descontar sin dejar negativo |
| Asiento y recálculo | `writeMovement` y `recalculateProductStock` | libro y existencia del producto |
| Cliente vivo | `requireAliveCustomer` (`pedidos/domain/order-customer.ts:43`) y `CustomerCatalog` | validar y precargar el cliente |
| Selector de cliente | `OrderCustomerPicker` (`order-customer-picker.tsx`), con un `purpose` nuevo | elegir el cliente |
| Permiso | `identity` y `requirePermission` de `pedidos/domain/actor.ts` | exigir `entregas.modificar` |
| Precedente de servicio entre módulos | `FinishedGoodsIntake` (`inventario/domain/finished-goods.ts:76`) y su fábrica sobre `tx` (`finished-goods-prisma.ts`) | molde del servicio de salida |

## 1. Qué módulo es dueño de la entrega

**Decisión: `pedidos` es dueño de la entrega (caso de uso, tablas `order_deliveries` y
`order_delivery_lines`). `inventario` es dueño de la salida física: el decremento del lote, el
asiento `delivery` y el recálculo. `inventario` la ofrece a `pedidos` como un servicio sobre la
transacción compartida, igual que hoy ofrece `FinishedGoodsIntake` para la entrada.**

Por qué:
1. **La regla que manda es del pedido.** Qué falta, el tope, cuándo pasa a `ENTREGADO` (D1, D2, D3)
   se calcula sobre `order_presentation_lines`, que es de `pedidos`. Y `pedidos` es el único módulo
   que puede escribir el estado del pedido.
2. **El libro y la existencia son de `inventario`.** La guardia `guard-libro-de-inventario`
   concentra toda escritura de `product_batches` en `product-prisma.ts` y exige su asiento. El
   decremento no puede vivir en `pedidos`.
3. **Es el mismo reparto que Terminar el empaque** (`order-packing.ts`). Allí `pedidos` orquesta la
   transacción y llama a `scope.finishedGoods.receiveFromOrder`. La entrega es la operación
   simétrica, así que se resuelve con la misma forma y no abre un patrón nuevo.
4. **El cliente ya entra en `pedidos`** por `CustomerCatalog` (QC-156). `inventario` no conoce
   `clientes`, y no tiene por qué empezar a conocerlo.

Alternativas descartadas en §9 (A1 `inventario` dueño, A2 módulo nuevo `entregas`).

El permiso se llama `entregas.modificar` (D6) aunque no exista la carpeta `lib/modules/entregas`. Es
el mismo caso que `empaque.modificar` y `acondicionamiento.modificar`: `<modulo>` nombra la tarea,
no la carpeta.

## 2. Contrato (lo publica T0)

### 2.1 Función pura compartida: `pedidos/domain/order-delivery.ts` (R16)

Sin servidor, sin reloj y sin Prisma. Se publica en el barrel `lib/modules/pedidos/index.ts`: la
importan el sheet (cliente) y el caso de uso.

```ts
export type DeliveryLineState = {
  readonly presentationLineId: string;
  readonly orderedPackages: number;    // entero >= 1
  readonly deliveredPackages: number;  // entero >= 0
};

export type DeliveryBatchState = {
  readonly batchId: string;
  readonly presentationLineId: string;
  readonly availablePackages: number;  // entero >= 0
};

export type DeliveryAllocation = {
  readonly presentationLineId: string;
  readonly batchId: string;
  readonly packages: number;           // entero >= 1
};

export function remainingPackages(line: DeliveryLineState): number; // max(0, ordered - delivered)

export type DeliveryCheck =
  | { readonly kind: 'ok'; readonly completesOrder: boolean }
  | { readonly kind: 'empty' }                                             // R15
  | { readonly kind: 'exceeds_remaining'; readonly presentationLineIds: readonly string[] } // R11, R18
  | { readonly kind: 'exceeds_batch'; readonly batchIds: readonly string[] };               // R12, R20

/** Primero `empty`, luego `exceeds_remaining`, luego `exceeds_batch`. `completesOrder` es true si,
 *  sumando las asignaciones, no le faltan envases a ninguna línea (R26, R27). */
export function checkDelivery(
  lines: readonly DeliveryLineState[],
  batches: readonly DeliveryBatchState[] | null, // null: el servidor comprueba el lote bajo bloqueo
  allocations: readonly DeliveryAllocation[],
): DeliveryCheck;

export const DELIVERY_MAX_ALLOCATIONS = 200;
```

El servidor llama a `checkDelivery(lines, null, allocations)` con el pedido bloqueado. El tope por
lote lo comprueba `inventario` con el producto bloqueado (§4, paso 6), porque la existencia
bloqueada solo la ve él. El sheet llama con los lotes que leyó.

### 2.2 Servicio de salida y lectura de lotes: `inventario/domain/finished-goods-dispatch.ts`

Se publica en el barrel de `inventario` con una sentencia `export { … }` propia y sin ningún
`type …Deps`. Así la guardia de fábricas de `tests/unit/inventario/schema/inventario-schema.test.ts`
no lo cuenta como caso de uso (precedente: QC-213 §1.1).

```ts
/** Envases enteros de un lote: floor(stock / content). Aritmética BigInt a cuatro decimales. */
export function wholePackagesIn(stock: string, packageContent: string): number;

export type DeliverableBatch = {
  readonly batchId: string;
  readonly presentationId: string;
  readonly lot: string;
  readonly purchaseDate: string;        // YYYY-MM-DD
  readonly expiryDate: string | null;
  readonly packageContent: string;      // decimal(14,4)
  readonly availablePackages: number;   // >= 1: los de 0 no se devuelven (R7)
};

/** Lectura fuera de transacción. Orden: purchaseDate ascendente y luego lot ascendente (solo de
 *  presentación; la elección es del usuario, D5). */
export interface FinishedBatchCatalog {
  findDeliverableBatches(
    recipeId: string,
    presentationIds: readonly string[],
    companyId: string,
  ): Promise<readonly DeliverableBatch[]>;
}

export type FinishedGoodsDispatchInput = {
  readonly companyId: string;
  readonly orderId: string;
  readonly orderDeliveryId: string;
  readonly recipeId: string;
  readonly presentationId: string;
  readonly allocations: readonly { readonly batchId: string; readonly packages: number }[];
  readonly actorId: string;
  readonly now: Date;
};

export type FinishedGoodsDispatchOutcome =
  | {
      readonly kind: 'dispatched';
      readonly lines: readonly {
        readonly batchId: string;
        readonly packages: number;
        readonly quantity: string; // packages x packageContent, decimal(14,4), positivo
      }[];
    }
  | { readonly kind: 'batch_not_found'; readonly batchId: string }
  | { readonly kind: 'insufficient'; readonly batchId: string; readonly availablePackages: number };

/** Lo implementa un driven de `inventario` sobre la transacción de quien llama. */
export interface FinishedGoodsDispatch {
  dispatchForDelivery(input: FinishedGoodsDispatchInput): Promise<FinishedGoodsDispatchOutcome>;
}
```

### 2.3 Puertos de `pedidos`

`ports/order-delivery-repository.ts`:

```ts
export type NewOrderDelivery = {
  readonly deliveryKey: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly actorId: string;
  readonly now: Date;
};

export type NewOrderDeliveryLine = {
  readonly presentationLineId: string;
  readonly batchId: string;
  readonly packages: number;
  readonly quantity: string;
};

export interface OrderDeliveryRepository {
  /** 'duplicate_key' si (company_id, delivery_key) ya existe (R29). */
  create(delivery: NewOrderDelivery, scope: OrderScope):
    Promise<{ readonly kind: 'created'; readonly id: string } | { readonly kind: 'duplicate_key' }>;
  addLines(deliveryId: string, lines: readonly NewOrderDeliveryLine[], scope: OrderScope): Promise<void>;
  /** Envases entregados por línea del reparto; las líneas sin entregas no aparecen. */
  sumDeliveredPackages(orderId: string, scope: OrderScope): Promise<ReadonlyMap<string, number>>;
}
```

`ports/order-delivery-unit-of-work.ts`:

```ts
export type OrderDeliveryTransactionScope = {
  readonly orders: Pick<OrderWriteRepository, 'lockAliveById' | 'findPresentationLinesForFinish' | 'setStatus'>;
  readonly deliveries: OrderDeliveryRepository;
  readonly finishedGoods: FinishedGoodsDispatch;
};

export interface OrderDeliveryUnitOfWork {
  run<T>(work: (scope: OrderDeliveryTransactionScope) => Promise<T>): Promise<T>;
}
```

**Por qué un puerto aparte y no un miembro nuevo en `OrderTransactionScope`.** 27 archivos de test
construyen hoy un `OrderTransactionScope` completo, entre ellos `tests/helpers/order-unit-of-work-double.ts`
y `order-packing.test.ts`. Un miembro obligatorio más los rompería en `typecheck` sin que ninguno
use la entrega. El puerto aparte usa la misma `withOrderTransaction`, así que comparte transacción,
reintentos y orden de bloqueo.

`scope: OrderScope` va siempre como último parámetro (`tests/guards/guard-ambito-empresa-pedidos.test.ts`).

### 2.4 Casos de uso de `pedidos`

`domain/get-order-delivery.ts` (R5–R9):

```ts
export type OrderDeliveryView = {
  readonly orderId: string;
  readonly numberText: string;
  readonly customer: OrderCustomer | null; // el del pedido si está vivo; si no, null (R9)
  readonly lines: readonly {
    readonly presentationLineId: string;
    readonly presentationName: string;
    readonly orderedPackages: number;
    readonly deliveredPackages: number;
    readonly remainingPackages: number;
    readonly batches: readonly DeliverableBatch[]; // vacío si remainingPackages === 0 (R8)
  }[];
};

export type GetOrderDeliveryDeps = {
  readonly orders: OrderRepository;            // findAliveById
  readonly deliveries: Pick<OrderDeliveryRepository, 'sumDeliveredPackages'>; // sobre el cliente global
  readonly lines: Pick<OrderWriteRepository, 'findPresentationLinesForFinish'>; // sobre el cliente global
  readonly presentations: Pick<PresentationCatalog, 'findRefs'>;
  readonly finishedBatches: FinishedBatchCatalog;
  readonly customerCatalog: Pick<CustomerCatalog, 'findAliveRefById'>;
};

export function createGetOrderDelivery(deps: GetOrderDeliveryDeps):
  (orderId: string, actor: Actor | null | undefined) => Promise<OrderDeliveryView>;
```

Orden: `requirePermission(actor, 'entregas.modificar')` (R2) → id con forma de uuid, si no
`order_not_found` → `findAliveById` (`null` → `OrderNotFoundError`) → estado `TERMINADO`, si no
`ActionNotAllowedError` (R5) → líneas, entregados, presentaciones y lotes → cliente
(`findAliveRefById`; si es `null`, `customer: null`).

`domain/deliver-order.ts` (R17–R30):

```ts
const deliverOrderSchema = z.strictObject({
  orderId: z.string().uuid(),
  deliveryKey: z.string().uuid(),
  customerId: z.string(),                       // la forma la decide requireAliveCustomer (R21)
  allocations: z.array(z.strictObject({
    presentationLineId: z.string().uuid(),
    batchId: z.string().uuid(),
    packages: z.number().int().min(1),
  })).min(1).max(DELIVERY_MAX_ALLOCATIONS),
}); // + refine: sin pares (presentationLineId, batchId) repetidos (R22)

export type DeliverOrderResult = {
  readonly status: 'delivered' | 'already_registered';
  readonly orderStatus: 'TERMINADO' | 'ENTREGADO';
};

export type DeliverOrderDeps = {
  readonly customerCatalog: Pick<CustomerCatalog, 'findAliveRefById'>;
  readonly unitOfWork: OrderDeliveryUnitOfWork;
  readonly orders: OrderRepository; // solo para responder en R29 con el estado actual
  readonly now?: () => Date;
};

export function createDeliverOrder(deps: DeliverOrderDeps):
  (input: unknown, actor: Actor | null | undefined) => Promise<DeliverOrderResult>;
```

Orden de validación. Cada paso corta antes del siguiente:
1. `requirePermission(actor, 'entregas.modificar')`: es la primera sentencia (R2, R3).
2. `safeParse`: si falla, `ValidationError` (R22).
3. `requireAliveCustomer`: si falla, `CustomerNotFoundError` (R21).
4. `unitOfWork.run`: §4.

`assertTransition('TERMINADO', 'ENTREGADO')` se llama antes de abrir la transacción, igual que
`createFinishPacking`, para que falle rápido si la matriz dejara de admitirlo.

`domain/search-order-customer-options.ts`: el `purpose` gana `'deliver'`. Exige
`entregas.modificar` y ofrece solo clientes vivos (R10, R2). `OrderCustomerSearchPurpose` pasa a
`'assign' | 'filter' | 'deliver'`. Un `purpose` desconocido sigue exigiendo `pedidos.modificar`
antes de rechazarse; `'deliver'` no lo exige.

### 2.5 Server Actions (en `pedidos/adapters/driving/order-actions.ts`)

Van en el archivo que ya existe para no abrir un segundo archivo `'use server'` en `pedidos`. Así no
se amplía el caso «las Server Actions viven en UN SOLO archivo driving» de
`tests/unit/pedidos/module-contract.test.ts:721`.

```ts
// Misma forma que `OrderCustomerOptionsResult` (`order-actions.ts:495`).
export type OrderDeliveryResult = { status: 'success'; data: OrderDeliveryView } | ErrorState;
export async function getOrderDeliveryAction(orderId: string): Promise<OrderDeliveryResult>;

export type DeliverOrderInput = {
  readonly orderId: string;
  readonly deliveryKey: string;
  readonly customerId: string;
  readonly allocations: readonly DeliveryAllocation[];
};
export type DeliverOrderActionResult = { status: 'success'; data: DeliverOrderResult } | ErrorState;
export async function deliverOrderAction(input: unknown): Promise<DeliverOrderActionResult>;
```

Las dos resuelven el actor con `identity.getSessionUser()` una sola vez por petición. Los errores
pasan por el traductor único (`createErrorStateTranslator`) como el resto del archivo, sin estados
literales propios.

### 2.6 Códigos de error

Hay dos códigos nuevos en `lib/modules/errores/domain/error-codes.ts`. Cada uno lleva su comentario
«Distinto de…», su clave en `ERROR_MESSAGE_KEY` y su texto en `ERROR_MESSAGES_ES`. Las clases van en
`lib/modules/pedidos/domain/errors.ts`.

| Situación | Código | Clase | Nuevo / reusado | Mensaje |
|---|---|---|---|---|
| Más envases que los que faltan (R18, R28) | `delivery_exceeds_remaining` | `DeliveryExceedsRemainingError` | **nuevo** | `La entrega supera los envases que faltan por entregar en alguna presentacion.` |
| Más envases que los del lote (R20, R28) | `delivery_batch_insufficient` | `DeliveryBatchInsufficientError` | **nuevo** | `Algun lote ya no tiene los envases elegidos: revisa los lotes y confirma de nuevo.` |
| Lote ajeno, inexistente o de otro producto (R19) | `batch_not_found` | `DeliveryBatchNotFoundError` (de `pedidos`, mismo código) | código reusado | catálogo |
| Pedido no `TERMINADO` (R5, R17) | `action_not_allowed` | `ActionNotAllowedError` | reusado | catálogo |
| Pedido ausente, borrado o ajeno (R5, R17) | `order_not_found` | `OrderNotFoundError` | reusado | catálogo |
| Cliente (R21) | `customer_not_found` | `CustomerNotFoundError` | reusado | catálogo |
| Forma (R22) | `invalid_input` | `ValidationError` | reusado | catálogo |
| Permiso (R2) | `unauthorized` | `UnauthorizedError` | reusado | catálogo |

Antes de dar el texto por bueno se comprueba que ninguno repite otro del catálogo (lo vigila el test
de unicidad).

### 2.7 Fixtures (T0)

`tests/fixtures/order-delivery.ts`:
- `deliveryView(overrides)`: un `OrderDeliveryView` con dos presentaciones (una completa y otra con
  envases pendientes y dos lotes).
- `DELIVER_RESULTS`: `delivered` + `TERMINADO`, `delivered` + `ENTREGADO` y `already_registered`.
- `DELIVERY_ERROR_STATES`: un `ErrorState` por cada código de §2.6.
- `deliverInput(overrides)`: un `DeliverOrderInput` válido.

### 2.8 Stub de T0

T0 deja los dos casos de uso con su firma, el permiso primero y un cuerpo que lanza
`ActionNotAllowedError`. Las dos actions quedan cableadas a ellos, y `composition` publica
`pedidos.getOrderDelivery` y `pedidos.deliverOrder` con dependencias reales donde ya existen y con
dobles mínimos donde aún no. Con eso `frontend_dev` trabaja contra las actions mockeadas y las
fixtures, y `backend_dev` contra los tipos.

## 3. Modelo de datos y migraciones (R1, R24, R25, R29, R31)

Son tres migraciones, porque Postgres no deja usar un valor de enum recién añadido dentro de la
misma transacción (55P04). Precedentes: `20260924190000_finished_product_enum_values` y
`20261001170000_order_status_blocked`. Los timestamps son orientativos: al crearlas hay que
comprobar que van detrás de la última migración de `origin/dev` y que no chocan con QC-217, QC-218
ni QC-219, que corren en paralelo.

### 3.1 `20261008150000_inventory_movement_kind_delivery`

```sql
ALTER TYPE "InventoryMovementKind" ADD VALUE 'delivery';
```

`down.sql`: es el molde de `20260924190000_finished_product_enum_values/down.sql`.
1. Aborta con `RAISE EXCEPTION` si hay asientos `delivery`. Mismo guardián que
   `20260923150000_inventory_movement_kind_consumption/down.sql`.
2. Quita los CHECK que dependen del tipo.
3. Recrea el tipo sin `delivery` y repone los CHECK.

### 3.2 `20261008150100_order_deliveries`

```sql
-- pedidos: la entrega
CREATE TABLE "order_deliveries" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id"   UUID NOT NULL,
  "order_id"     UUID NOT NULL,
  "customer_id"  UUID NOT NULL,
  "delivery_key" UUID NOT NULL,
  "created_by"   UUID NOT NULL,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_deliveries_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_id_company_id_key" UNIQUE ("id", "company_id");
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_company_key_unique" UNIQUE ("company_id", "delivery_key");
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_order_id_fkey"
  FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_customer_id_fkey"
  FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "order_deliveries_order_id_idx" ON "order_deliveries"("order_id");
CREATE INDEX "order_deliveries_customer_id_idx" ON "order_deliveries"("company_id", "customer_id");
CREATE INDEX "order_deliveries_created_by_idx" ON "order_deliveries"("created_by");

-- pedidos: un lote dentro de una entrega
ALTER TABLE "order_presentation_lines"
  ADD CONSTRAINT "order_presentation_lines_id_company_id_key" UNIQUE ("id", "company_id");

CREATE TABLE "order_delivery_lines" (
  "id"                         UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id"                 UUID NOT NULL,
  "delivery_id"                UUID NOT NULL,
  "order_presentation_line_id" UUID NOT NULL,
  "batch_id"                   UUID NOT NULL,
  "packages"                   INTEGER NOT NULL,
  "quantity"                   DECIMAL(14,4) NOT NULL,
  CONSTRAINT "order_delivery_lines_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_packages_positive" CHECK ("packages" > 0);
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_delivery_batch_unique" UNIQUE ("delivery_id", "batch_id");
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_delivery_id_fkey"
  FOREIGN KEY ("delivery_id", "company_id") REFERENCES "order_deliveries"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_presentation_line_id_fkey"
  FOREIGN KEY ("order_presentation_line_id", "company_id") REFERENCES "order_presentation_lines"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_delivery_lines" ADD CONSTRAINT "order_delivery_lines_batch_id_fkey"
  FOREIGN KEY ("batch_id", "company_id") REFERENCES "product_batches"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "order_delivery_lines_company_id_idx" ON "order_delivery_lines"("company_id");
CREATE INDEX "order_delivery_lines_presentation_line_id_idx" ON "order_delivery_lines"("order_presentation_line_id");
CREATE INDEX "order_delivery_lines_batch_id_idx" ON "order_delivery_lines"("batch_id");

-- inventario: el asiento de entrega. "kind"::text porque 'delivery' nace en la migracion anterior
-- y los down.sql viejos recrean el enum.
ALTER TABLE "inventory_movements" ADD COLUMN "order_delivery_id" UUID;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_delivery_id_fkey"
  FOREIGN KEY ("order_delivery_id", "company_id") REFERENCES "order_deliveries"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "inventory_movements_order_delivery_id_idx" ON "inventory_movements"("order_delivery_id");
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_delivery_id_matches_kind"
  CHECK (("kind"::text = 'delivery') = ("order_delivery_id" IS NOT NULL));
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_delivery_quantity_negative"
  CHECK ("kind"::text <> 'delivery' OR "quantity" < 0);
CREATE UNIQUE INDEX "inventory_movements_one_delivery_per_batch"
  ON "inventory_movements" ("order_delivery_id", "batch_id") WHERE "kind"::text = 'delivery';

ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_matches_kind"
  CHECK (("kind"::text IN ('consumption', 'production', 'delivery')) = ("order_id" IS NOT NULL));
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"
  CHECK (("kind"::text = 'adjustment' AND "reason" IS NOT NULL)
      OR ("kind"::text IN ('opening', 'consumption', 'production', 'delivery') AND "reason" IS NULL));

ALTER TABLE "order_deliveries"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_deliveries"     FORCE  ROW LEVEL SECURITY;
ALTER TABLE "order_delivery_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_delivery_lines" FORCE  ROW LEVEL SECURITY;
```

**Antes de escribir el SQL** hay que verificar:
- la definición vigente de `inventory_movements_order_id_matches_kind` y
  `inventory_movements_reason_matches_kind`, porque alguna migración posterior a
  `20260924190100` pudo reescribirlas;
- el nombre real de la clave de `customers`, que es `customers_company_id_id_key` según el
  comentario de `Order` en `schema.prisma`.

`down.sql`, en orden inverso:
1. Repone los dos CHECK con su texto previo.
2. Quita el índice, los CHECK y la columna `order_delivery_id`.
3. Hace `DROP` de `order_delivery_lines` y de `order_presentation_lines_id_company_id_key`.
4. Hace `DROP` de `order_deliveries`.

**Por qué la empresa queda cubierta (R31).** Cada FK hacia una fila de empresa es compuesta con
`company_id`. La empresa del asiento la ata a la del lote el disparador
`inventory_movements_check_company`, que ya existe. Una entrega no puede apuntar al pedido, al
cliente ni al lote de otra empresa, y una línea o un asiento no pueden apuntar a la entrega de otra.

**RLS.** Las dos tablas nuevas nacen con `ENABLE` y `FORCE`, sin policies, como el resto
(`docs/architecture.md > Acceso a datos y autorizacion`). No es la frontera: la frontera es el
permiso en el caso de uso más el ámbito de empresa en cada consulta.

**Append-only (R32).** Ninguna de las dos tablas tiene `updated_at` ni `deleted_at`. Ningún
adaptador declara `update`, `delete` ni `upsert` sobre ellas, y lo vigila el test de §8.

**`db/schema.prisma`:**
- `/// @module pedidos model OrderDelivery`. `customerId`, `createdBy` y `companyId` van sin
  `@relation` porque son de otro módulo (drift). `order` va con `@relation` porque `Order` es del
  mismo módulo.
- `/// @module pedidos model OrderDeliveryLine`. `batchId` va sin `@relation` porque
  `ProductBatch` es de `inventario`. `delivery` y `presentationLine` van con `@relation`.
- `InventoryMovement` gana `orderDeliveryId String? @map("order_delivery_id") @db.Uuid`, sin
  `@relation`.
- `InventoryMovementKind` gana `delivery`, al final, sin reordenar.
- Los CHECK, los índices parciales y las FK compuestas son drift, como en el resto de la tabla.

### 3.3 `20261008150200_delivery_permission`

Es una migración de datos con el molde de `20261004150000_execution_permission`:

```sql
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('entregas.modificar', 'entregas', 'modificar',
   'Entregar al cliente el producto terminado de los pedidos de la empresa.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'entregas.modificar' FROM "roles" AS "r" WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
```

`down.sql`: hace `DELETE` de `role_permissions` y luego de `permissions` con ese código.

`lib/modules/identity/domain/permissions.ts` gana la entrada en `PERMISSIONS`, al final, con la misma
descripción. La JSDoc del catálogo gana un párrafo de enmienda corto, sin citar ficha (lo vigila
`permissions.test.ts`). `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]` gana `'entregas.modificar'`, y
`ADMIN_EXCLUDED_PERMISSIONS` no cambia.

## 4. Escritura: flujo de la transacción (R17–R30)

Todo ocurre dentro de `unitOfWork.run` (`withOrderTransaction`). El orden de bloqueo es pedido,
producto y lote, el mismo que Terminar el empaque (pedido y luego producto) y el ajuste (producto y
luego lote). No aparece ningún ciclo nuevo.

1. `orders.lockAliveById(orderId, scope)`. Si devuelve `null`, `OrderNotFoundError`. Si
   `status !== 'TERMINADO'`, `ActionNotAllowedError` (R17).
2. `orders.findPresentationLinesForFinish(orderId, scope)`. Cada `presentationLineId` de la entrada
   tiene que estar en ellas; si no, `ValidationError` (R22). Un pedido sin líneas rechaza siempre
   por aquí.
3. `deliveries.sumDeliveredPackages(orderId, scope)` con el pedido ya bloqueado. Dos entregas del
   mismo pedido se serializan en el paso 1 (R28).
4. `checkDelivery(lines, null, allocations)`: `exceeds_remaining` lanza
   `DeliveryExceedsRemainingError` (R18). `empty` no llega aquí, porque zod exige al menos una
   asignación.
5. `deliveries.create(...)`. Si devuelve `duplicate_key`, se lanza `DeliveryAlreadyRegisteredSignal`
   (§4.1).
6. Por cada línea del reparto con asignaciones, `finishedGoods.dispatchForDelivery(...)`:
   - `batch_not_found` lanza `DeliveryBatchNotFoundError` (R19);
   - `insufficient` lanza `DeliveryBatchInsufficientError` (R20).
   Cualquiera de los dos deshace todo (R30).
7. `deliveries.addLines(deliveryId, …)` con la `quantity` que devolvió `inventario`.
8. Si `completesOrder`, `orders.setStatus(orderId, 'TERMINADO', 'ENTREGADO', actorId, now, scope)`.
   Algo distinto de `'ok'` lanza (R27). `setStatus` no escribe `finishedAt` y conserva `packedBy`
   y `conditionedBy` (QC-215 R33, segunda frase).
9. Devuelve `{ status: 'delivered', orderStatus }`.

### 4.1 Idempotencia (R29)

La pantalla genera la clave de entrega (`crypto.randomUUID()`) al crear el borrador y la guarda con
él (R35). Si la misma clave llega dos veces (doble clic, reintento tras perder la respuesta, recarga
con el borrador intacto), el `INSERT` choca con `order_deliveries_company_key_unique`.
`create` devuelve `duplicate_key` (P2002 capturado en el adaptador) y el paso 5 lanza una señal
interna. La señal deshace la transacción, y fuera el caso de uso lee el estado del pedido con
`orders.findAliveById` y devuelve `{ status: 'already_registered', orderStatus }`.

Si dos peticiones con la misma clave llegan a la vez, la segunda espera el bloqueo del pedido
(paso 1), y al llegar al paso 5 la primera ya confirmó. Si la primera dejó el pedido `ENTREGADO`, la
segunda sale antes, por el paso 1, con `action_not_allowed`. El sheet trata ese código, cuando viene
tras un envío con la misma clave, igual que un rechazo normal: vuelve a leer y muestra el pedido ya
entregado. Esa carrera exacta no tiene requisito propio; queda cubierta por R28 y R30.

### 4.2 `dispatchFinishedGoods` en `product-prisma.ts`

Es una función exportada nueva, el séptimo camino de escritura de `product_batches`. La envuelve
`adapters/driven/persistence/finished-goods-dispatch-prisma.ts` (`createFinishedGoodsDispatch(tx)`),
con el mismo molde que `createFinishedGoodsIntake`.

1. Bloquea el producto terminado vivo de `(companyId, recipeId, presentationId)` con
   `FOR NO KEY UPDATE`, como en `receiveFinishedGoods`. Si no hay producto, devuelve
   `batch_not_found` con el primer lote.
2. Lee los lotes pedidos con `id IN (...)`, `company_id`, `product_id = product.id` y
   `package_content IS NOT NULL`. El primer lote que falte devuelve `batch_not_found` (R19).
3. Por cada asignación:
   - calcula `quantity = packages × packageContent`, exacto en `BigInt`;
   - hace el decremento condicional
     `tx.productBatch.updateMany({ where: { id, companyId, productId, stock: { gte: quantity } }, data: { stock: { decrement }, updatedBy, updatedAt } })`;
   - si `count === 0`, relee el `stock` y devuelve
     `{ kind: 'insufficient', batchId, availablePackages: wholePackagesIn(stock, content) }` (R20).
4. `writeMovement` con:
   - `kind: 'delivery'` y `quantity: -quantity`;
   - `reason: null`, `orderId` y `orderPresentationLineId: null`;
   - `orderDeliveryId` y `createdBy` (R24).
5. `recalculateProductStock(tx, product.id, scope)`, una vez por llamada (R23).
6. Devuelve `dispatched` con las líneas.

Lo que hay que tocar para soportarlo:
- `NewInventoryMovement` (`domain/inventory-movement.ts`): `kind` gana `'delivery'` y aparece
  `readonly orderDeliveryId?: string | null`, opcional para no tocar los demás escritores.
  `writeMovement` lo escribe cuando llega.
- `InventoryMovementView['kind']` y `BatchHistoryEntry['kind']` ganan `'delivery'`.

Comprobar el tope de envases con el decremento condicional, y no solo comparando, hace que una
entrega concurrente de otro pedido sobre el mismo lote no deje nunca la existencia negativa (R28).
El `CHECK stock >= 0` sigue siendo el respaldo.

## 5. Lectura del sheet (R5–R10)

- **`findDeliverableBatches`** vive en un archivo nuevo,
  `inventario/adapters/driven/persistence/deliverable-batches-prisma.ts`, sobre el cliente global.
  Hace `products` (`FINISHED_PRODUCT`, vivos, `recipe_id`, `presentation_id IN`) JOIN
  `product_batches` con `stock > 0` y `package_content IS NOT NULL`, filtrado por empresa en las dos
  tablas con `companyScopeColumns`. `availablePackages` se calcula con `wholePackagesIn`, y se
  descartan los de 0 (R7).
- **`sumDeliveredPackages`** vive en `pedidos/adapters/driven/persistence/order-delivery-prisma.ts`:
  `groupBy order_presentation_line_id` sobre `order_delivery_lines` JOIN `order_deliveries` con
  `order_id` y `company_id`. Se usa sobre `tx` en la escritura y sobre el cliente global en la
  lectura.
- **Lotes reservados.** Los lotes de producto terminado no se apartan para pedidos, porque las
  recetas no admiten un producto terminado como ingrediente (`create-recipe-version.ts:55`). La
  existencia del lote es entera para entregar. T0 lo verifica y, si encuentra lo contrario, lo
  anota y para.

## 6. UI

### 6.1 Acción de fila (R4, P1)

- `order-row-actions.tsx` gana el prop `canDeliver?: boolean` y el callback
  `onDeliver?: (order) => void`.
- El ítem «Entregar» (`order-action-deliver`, icono `TruckIcon` de `lucide-react`, que ya está en el
  repo) se añade solo si `canDeliver && order.status === 'TERMINADO'`.
- El mapa de estados es exhaustivo y tipado (`ORDER_STATUS_ACCEPTS_DELIVERY`), como los demás de ese
  archivo.
- `order-list-section.tsx` calcula `canDeliver` con `assertPermission(user, 'entregas.modificar', …)`
  dentro del mismo `Promise.all`. Es presentación, no autorización.
- `order-table.tsx` y `order-columns.tsx` pasan el prop.

### 6.2 Sheet: `app/(private)/pedidos/components/order-delivery-sheet.tsx`

Es un componente de cliente sobre el `Sheet` que ya usa `order-sheet.tsx`. Lo monta `order-table.tsx`
con el pedido elegido.

- **Apertura:** llama a `getOrderDeliveryAction(orderId)`. Mientras espera muestra un esqueleto. Si
  falla, muestra `order-delivery-error` con el mensaje del catálogo.
- **Cabecera:** número del pedido. El campo de cliente es `OrderCustomerPicker` con
  `purpose="deliver"`, precargado según R9 o con el borrador.
- **Por cada línea** (`order-delivery-line`, con `data-presentation-line-id`):
  - nombre, «Pedidos N · Entregados M · Faltan K» (R6);
  - si `K === 0`, la marca «Completa» (`order-delivery-line-complete`), sin campos (R8);
  - si no, una fila por lote (`order-delivery-batch`, con `data-batch-id`): lote, envases
    disponibles, entrada, vencimiento y un campo numérico de envases (`inputMode="numeric"`,
    saneado a dígitos) (R7).
- **Validación en cada render** con `checkDelivery` sobre los valores parseados:
  - campo no entero: `order-delivery-whole-error` (R13);
  - exceso por línea: `order-delivery-line-exceeds` (R11);
  - exceso por lote: `order-delivery-batch-exceeds` (R12);
  - sin cliente al confirmar: `order-delivery-customer-error` (R14);
  - nada que entregar: `order-delivery-empty-error` (R15).
  Ninguno de los cinco envía.
- **Botones:** «Entregar» (`order-delivery-submit`) y «Cancelar» (`order-delivery-cancel`, R36).
  Cerrar con la X, Escape o un clic fuera no borra el borrador (R35).
- **Respuesta:**
  - `delivered` o `already_registered`: borra el borrador, cierra, toast «Entrega registrada» (o
    «Pedido entregado» si `orderStatus === 'ENTREGADO'`) y `router.refresh()` (R33);
  - `delivery_exceeds_remaining` o `delivery_batch_insufficient`: muestra `order-delivery-rejected`
    con el mensaje, vuelve a llamar a `getOrderDeliveryAction` y aplica R37 sobre el borrador, que se
    conserva (R34);
  - cualquier otro error: muestra `order-delivery-error`, sigue abierto.

### 6.3 Borrador: `use-order-delivery-draft.ts` y `order-delivery-draft.ts`

- **`order-delivery-draft.ts`**: funciones puras para la clave, la forma, el parseo tolerante y el
  ajuste del borrador.
  - Clave: `qc.order-delivery-draft.<orderId>`.
  - Forma, versionada: `{ v: 1, orderId, deliveryKey, customer: OrderCustomer | null, packages: Record<"<lineId>:<batchId>", string> }`.
  - Un JSON corrupto o de otra versión se descarta sin error.
  - El ajuste contra un `OrderDeliveryView` devuelve el borrador sin los lotes que ya no se ofrecen
    y `adjusted: boolean` (R37).
- **`use-order-delivery-draft.ts`**: el hook que lee al abrir, escribe en cada cambio y borra al
  cancelar o al aplicar (R35, R36, R33). Si no hay borrador, genera la `deliveryKey` nueva. Si
  `localStorage` no está disponible (modo privado o cuota), el sheet funciona sin persistir.
- **Varios usuarios en el mismo navegador.** La clave lleva el `orderId` y no el usuario, así que el
  borrador lo ve quien abra ese pedido en ese navegador. Se acepta: solo lo ve quien ya tiene
  `entregas.modificar`, y el servidor revalida todo.
- **Aviso de ajuste:** `order-delivery-draft-adjusted`.

## 7. Historial del lote (R38)

- `batch-history.tsx`: `KIND_LABELS.delivery = 'Entrega a cliente'`. Lo exige el `Record`
  exhaustivo. La cantidad y el número de pedido se pintan como en `consumption`, porque el asiento
  lleva `orderId`.
- `batch-movement-prisma.ts` no cambia la consulta: `kind` llega tal cual.
- No se toca la etiqueta vieja de `consumption` («Salida por entrega»). Renombrarla no es de esta
  ficha; se anota como hallazgo para el leader.

## 8. Censos, guardias y llamadores afectados

Cada enmienda conserva las aserciones previas y lleva una nota fechada 2026-10-08 (lección de
QC-167).

| Archivo | Qué censa | Cambio | Task |
|---|---|---|---|
| `tests/guards/guard-libro-de-inventario.test.ts:18,251` | caminos de escritura de `product_batches` | + `dispatchFinishedGoods` y el título del caso | TC |
| `tests/unit/inventario/qc121-alcance.test.ts:268` | caminos con recálculo | + `dispatchFinishedGoods` (recalcula: no es excepción) | TC |
| `tests/unit/inventario/qc91-alcance.test.ts:490` | `updateMany` solo en `consumeBatchStock` | admite también `dispatchFinishedGoods` (decremento condicional); el detector sigue cazando un tercero | TC |
| `tests/guards/guard-identificador-de-request.test.ts:330` | `MIGRACIONES_ESPERADAS` | + las tres migraciones | B1 |
| `tests/guards/guard-identificador-de-request.test.ts:57` | `E2E_ESPERADOS` | + `entregar-producto-terminado.spec.ts` | TI |
| `tests/unit/pedidos/schema/pedidos-schema.test.ts:623,731` | modelos `@module pedidos` | + `OrderDelivery`, `OrderDeliveryLine`; revisar el censo de referencias sin `@relation` (`:169`) | B1 |
| `tests/unit/inventario/schema/inventario-schema.test.ts` | enum `InventoryMovementKind`, factorías del barrel | + `delivery`; factorías sin cambio (§2.2) | B1 / T0 |
| `tests/unit/identity/permissions.test.ts` | catálogo exacto, `MODULOS`, R3 (módulo con escritura declara consultar y modificar), Administrador | + código, + módulo `entregas`, excepción `entregas` solo `modificar` (como `empaque`), Administrador | T0 (el código entra en T0 porque `PermissionCode` lo necesita) |
| `tests/guards/guard-permisos-sembrados.test.ts` | permiso sin rol | sin cambio (verde con el seed) | B1 (verificar) |
| `tests/integration/identity/identity-seed.int.test.ts` | seed por rol | + `entregas.modificar` en el Administrador | B1 |
| `tests/unit/pedidos/module-contract.test.ts:642` | consumidores de `assertTransition` | + `lib/modules/pedidos/domain/deliver-order.ts` | B4 |
| `tests/unit/identity/session-once-per-request-actions.test.ts:165` | `ACCIONES` | + `getOrderDeliveryAction` y `deliverOrderAction` | B5 |
| `tests/integration/aislamiento.json` | modo de aislamiento de cada `.int.test.ts` | + cada suite nueva de integración | B2, B3, B4 |
| `tests/unit/pedidos/scope.test.ts`, `tests/unit/inventario/scope.test.ts`, `company-scope.test.ts` (los dos) | ámbito de empresa y alcance del módulo | revisar con las fuentes nuevas; enmendar solo si un caso lo exige | TC |
| `tests/unit/pedidos/order-customer-contract.test-d.ts` | tipo `OrderCustomerSearchPurpose` | + `'deliver'` | T0 |
| `tests/unit/errores/*` (unicidad del catálogo) | textos únicos | dos códigos nuevos | T0 |
| QC-215 R33, primera frase («ningún camino escribe `ENTREGADO`») | — | queda enmendada por R27. Ningún test la afirma como barrido (los de R33 citados en `order-finished-at.int.test.ts:199` y `qc145-estado-solo-planta.test.ts:180` miran `finishedAt` y siguen valiendo) | TC (verificar) |

Llamadores de tipos que cambian, todos en `typecheck`:
- `BatchHistoryEntry['kind']`: `batch-history.tsx` (`KIND_LABELS`) y `tests/fixtures/adjust-batch-stock.ts`, si enumera.
- `InventoryMovementView['kind']`: sus lectores.
- `OrderCustomerSearchPurpose`: `order-customer-picker.tsx` y los `switch` que lo recorran.

Sin cambio, verificado:
- `RUTAS_ESPERADAS_HOY` de `guard-pantallas-exigen-permiso`: no hay ruta nueva, el sheet vive en
  `/pedidos`.
- Censo de usuarios de `DataTable`: el sheet no usa `DataTable`.
- Fachadas de `tests/unit/composition/*`: no existe fachada censada de `pedidos`. Si aparece una al
  sincronizar con `dev`, se enmienda en TC.

## 9. Alternativas descartadas

- **A1 — `inventario` dueño de la entrega.** Tendría que leer las líneas del reparto y escribir el
  estado del pedido, que son de `pedidos`. Exigiría un puerto de escritura de pedidos dentro de
  `inventario` y un ciclo de barriles `inventario → pedidos → inventario` (hoy `pedidos` ya importa
  `inventario`). El tope y el paso a `ENTREGADO` son reglas del pedido.
- **A2 — Módulo nuevo `lib/modules/entregas`.** Separaría la entrega con su barrel y su fachada,
  pero:
  - tendría que leer y escribir el estado del pedido a través de `pedidos` (el mismo problema que
    A1);
  - añadiría un módulo entero (estructura, `scope`, `module-contract`, fachada) para dos casos de
    uso;
  - `docs/architecture.md` rechaza la infraestructura «por si acaso».
  Si QC-224 y QC-225 hicieran crecer la entrega, extraerla después es un movimiento de archivos
  dentro del mismo dueño de datos.
- **A3 — Sin tabla `order_delivery_lines`, derivando lo entregado del libro.** Lo entregado por línea
  saldría de sumar los asientos `delivery` y dividir por el contenido de cada lote. Se descarta
  porque:
  - `pedidos` tendría que leer el libro de `inventario` para su propia regla de negocio;
  - los envases (entero) se reconstruirían por división en vez de guardarse;
  - la entrega se quedaría sin un registro propio con su cliente y sus envases (D9).
  El libro sigue siendo la verdad de la existencia; la línea de entrega es la verdad de lo
  entregado al pedido. Las dos se escriben en la misma transacción, y el test de cuadre de §10 las
  ata.
- **A4 — Ampliar `OrderTransactionScope`.** Ver §2.3: rompe 27 archivos de test que no usan la
  entrega.
- **A5 — Reutilizar `consumeBatchStock` con un parámetro de tipo.** Mezclaría dos asientos de
  significado distinto (consumo de material frente a salida a cliente) en la función que hoy no
  recalcula `products.stock` a propósito. Una función propia mantiene la regla de cada camino y la
  hace visible en los censos.
- **A6 — Elegir el lote automáticamente (el más antiguo primero, como QC-141).** Lo descarta D5.
- **A7 — Borrador en `sessionStorage` o en el servidor.** `sessionStorage` no sobrevive a cerrar la
  pestaña. Un borrador en el servidor es una tabla más y no lo pide D8, que fija `localStorage`.
- **A8 — Idempotencia sin clave, comparando el contenido de la entrega.** Dos entregas legítimas
  iguales (mismo lote, mismos envases, mismo cliente) serían indistinguibles de un doble clic. La
  clave generada por borrador las separa.

## 10. Trazabilidad prevista (R → test)

Rutas abreviadas:
- **u:** `tests/unit/pedidos/` (o `inventario/`, `identity/`)
- **ui:** `tests/unit/pedidos-ui/`
- **int:** `tests/integration/pedidos/` (o `inventario/`, `identity/`)
- **e2e:** `e2e/entregar-producto-terminado.spec.ts`

| R | Test previsto |
|---|---|
| R1 | u `identity/permissions.test.ts`; u `identity/schema/delivery-permission-migration.test.ts`; int `identity/delivery-permission-migration.int.test.ts`; int `identity/identity-seed.int.test.ts` |
| R2 | u `deliver-order.test.ts`, `get-order-delivery.test.ts`, `search-order-customer-options.test.ts` (los puertos no se llaman) |
| R3 | u `deliver-order.test.ts` (actor sintético con el permiso y otro rol; Administrador sin él) |
| R4 | ui `order-row-actions.test.tsx`; e2e (Operador) |
| R5 | u `get-order-delivery.test.ts`; int `order-delivery.int.test.ts` (empresa B) |
| R6, R8, R9 | u `get-order-delivery.test.ts`; ui `order-delivery-sheet.test.tsx` |
| R7 | int `inventario/deliverable-batches.int.test.ts`; ui `order-delivery-sheet.test.tsx` |
| R10 | u `search-order-customer-options.test.ts` |
| R11–R15 | ui `order-delivery-sheet.test.tsx` (la action no se llama) |
| R16 | u `order-delivery.test.ts` (tabla de casos) + un caso que lee las fuentes del sheet y de `deliver-order.ts` y exige que importen `checkDelivery`/`remainingPackages` del barrel, sin aritmética de tope propia |
| R17, R18, R22 | u `deliver-order.test.ts`; int `order-delivery.int.test.ts` |
| R19, R20 | u `inventario/finished-goods-dispatch-prisma.test.ts` (tx doblado); int `inventario/finished-goods-dispatch.int.test.ts` |
| R21 | u `deliver-order.test.ts`; int `order-delivery.int.test.ts` (cliente de B, dado de baja) |
| R23, R24 | int `inventario/finished-goods-dispatch.int.test.ts`; int `inventario/ledger-cuadre.int.test.ts` (caso de entrega) |
| R25 | int `order-delivery.int.test.ts` (filas de entrega y líneas; `orders.customer_id` intacto) |
| R26, R27 | u `deliver-order.test.ts`; int `order-delivery.int.test.ts` (`finished_at`, `packed_by`, `conditioned_by` intactos) |
| R28 | int `order-delivery-concurrency.int.test.ts` |
| R29 | u `deliver-order.test.ts`; int `order-delivery.int.test.ts` (misma clave dos veces: un solo juego de filas) |
| R30 | int `order-delivery.int.test.ts` (fallo en el segundo lote: nada escrito) |
| R31 | int `order-delivery-constraints.int.test.ts` (`INSERT` crudos que violan cada restricción); u `pedidos/schema/order-deliveries-migration.test.ts` |
| R32 | u `order-delivery-append-only.test.ts` (barrido: ningún `update`/`delete`/`upsert` sobre `orderDelivery*` en `lib/`, y ninguna action ni caso de uso que lo nombre) |
| R33, R34 | ui `order-delivery-sheet.test.tsx` |
| R35–R37 | ui `order-delivery-draft.test.ts` + `order-delivery-sheet.test.tsx` |
| R38 | u `inventario/batch-history.test.tsx` |
| R39 | e2e |
| R40 | `tests/guards/guard-dependencias-aprobadas.test.ts` (`package.json` sin cambios) |

## 11. Dependencias e integraciones

- **Dependencias:** ninguna (R40). El icono sale de `lucide-react`, que ya está en el repo.
  `crypto.randomUUID()` es del navegador.
- **Integraciones externas:** ninguna. No hay avisos a otros módulos: la entrega solo resta
  existencia, así que no dispara el `StockIncreaseListener`.
