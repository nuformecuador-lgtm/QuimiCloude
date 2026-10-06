# QC-213 — ajuste-por-total-contado · design.md

> Zona fullstack · Complejidad high · Requisitos en `requirements.md` (R1–R30, decisiones D1–D11).
> Sin dependencias nuevas (D11): todo sale de `zod`, `decimal-quantity.ts` (BigInt) y Prisma, que
> ya están en el repo.

## 1. Contrato (se publica en T0, antes que nada)

Todo lo de esta sección es la interfaz que comparten `frontend_dev` y `backend_dev`. T0 la deja en
código; a partir de ahí ningún bloque B<n> ni F<n> la cambia sin volver al spec.

### 1.1 Helper puro compartido (pantalla y servidor) — R28, D2

Archivo nuevo `lib/modules/inventario/domain/stock-adjustment.ts`. Sin servidor, sin reloj, sin
Prisma: lo importa el diálogo (componente de cliente) y el caso de uso. Se publica en el barrel
`lib/modules/inventario/index.ts` en una sentencia `export { ... }` **propia y sin ningún
`type ...Deps`**, para que la guardia de factorías de `inventario-schema.test.ts:735` no lo cuente
como caso de uso.

```ts
// movement-reason.ts (junto a MOVEMENT_REASONS)
export const STOCK_INCREASE_REASONS = [
  'conteo_fisico',
  'error_de_carga',
] as const satisfies readonly MovementReason[];

// stock-adjustment.ts
import { compareQuantities, subtractQuantities } from './decimal-quantity';
import { MOVEMENT_REASONS, STOCK_INCREASE_REASONS, type MovementReason } from './movement-reason';

/** Decimal NO negativo, hasta diez enteros y cuatro decimales: la escala de `decimal(14,4)`. */
export const STOCK_QUANTITY_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

export type AdjustmentDirection = 'increase' | 'decrease';

export const REASONS_BY_DIRECTION = {
  increase: STOCK_INCREASE_REASONS,
  decrease: MOVEMENT_REASONS,
} as const satisfies Record<AdjustmentDirection, readonly MovementReason[]>;

export type StockAdjustment = {
  readonly direction: AdjustmentDirection;
  /** Total contado menos existencia vista, con signo, normalizado a cuatro decimales. */
  readonly difference: string;
  /** Valor absoluto de `difference`, normalizado a cuatro decimales. */
  readonly amount: string;
};

/**
 * `'invalid'`: alguno de los dos no cumple `STOCK_QUANTITY_PATTERN` (vacío, parcial como `'12.'`,
 * con signo, con exponente). `'zero'`: los dos son el mismo decimal (`'12'` y `'12.0000'` lo son).
 */
export type StockAdjustmentReading = StockAdjustment | 'zero' | 'invalid';

export function describeAdjustment(seenStock: string, countedStock: string): StockAdjustmentReading;
export function reasonsFor(direction: AdjustmentDirection): readonly MovementReason[];
export function isReasonAllowed(direction: AdjustmentDirection, reason: MovementReason): boolean;
```

La comparación es siempre decimal (`compareQuantities`), nunca de cadenas: `'12'` y `'12.0000'`
son la misma existencia.

**Enmienda (review vuelta 1):** la lista de motivos de aumento vive en `movement-reason.ts` como
`STOCK_INCREASE_REASONS` y `stock-adjustment.ts` la importa, porque el test de motivos
(`tests/unit/inventario/movement-reason.test.ts`, R9 de QC-92) prohíbe enumerar dos o más motivos
fuera de ese archivo. `REASONS_BY_DIRECTION`, `reasonsFor` e `isReasonAllowed` no cambian de forma ni
de tipo; la constante nueva no se publica en el barrel.

### 1.2 Entrada del caso de uso — R12, R15, R16, R19, R21

`lib/modules/inventario/domain/adjust-batch-stock.ts` cambia su esquema y su tipo de entrada. La
factoría y su firma exterior **no cambian** (`input: unknown`, `actor`), para que la guardia
`product-route-contract.test.ts:482` siga encontrando `adjustBatchStock` anidada con
`requirePermission` como primera sentencia.

```ts
const stockQuantity = z.string().trim().regex(STOCK_QUANTITY_PATTERN);

const adjustBatchStockSchema = z.strictObject({
  batchId: z.string().uuid(),
  countedStock: stockQuantity,
  seenStock: stockQuantity,
  reason: z.enum(MOVEMENT_REASONS),
});

export type AdjustBatchStockInput = z.infer<typeof adjustBatchStockSchema>;
// = { batchId: string; countedStock: string; seenStock: string; reason: MovementReason }

// Vive en domain/stock-adjustment.ts (T0); el caso de uso lo importa en B2.
export type AdjustBatchStockResult = {
  readonly stock: string;
  readonly reserved: string;
  readonly overReserved: boolean;
};

export function createAdjustBatchStock(
  deps: AdjustBatchStockDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<AdjustBatchStockResult>;
```

Orden de validación dentro del caso de uso (cada paso corta antes de tocar el puerto):

1. `requirePermission(actor, 'inventario.modificar')` → `UnauthorizedError` (R21).
2. `safeParse` → `ValidationError` (`invalid_input`) si la forma no casa (R19: con signo, más de diez
   enteros o cuatro decimales, campo de más, campo ausente).
3. `describeAdjustment(seenStock, countedStock)`: `'zero'` → `ValidationError` (R16).
4. `isReasonAllowed(direction, reason)` falso → `AdjustmentReasonNotAllowedError` (R15).
5. Puerto (§1.5). Según el resultado: `batch_not_found` → `BatchNotFoundError` (R22);
   `stock_changed` → `BatchStockChangedError(currentStock)` (R13); `increase_not_allowed` →
   `ActionNotAllowedError` (R17); `adjusted` → si `direction === 'increase'`, avisa a
   `stockIncreases` (R23) y devuelve `{ stock, reserved, overReserved }`.

**Por qué el sentido se puede validar antes del puerto sin traicionar D4.** El puerto solo escribe
si la existencia bloqueada es igual a la vista (R13). Por tanto, cuando escribe, la diferencia que
asienta (total − existencia bloqueada) es exactamente total − vista, y su sentido es el que el caso
de uso ya validó. La diferencia la calcula el servidor en los dos sitios a partir del total y de la
existencia; la pantalla nunca la envía (R8).

### 1.3 Server Action: FormData, validación y estado — R8, R9, R10, R13

`lib/modules/inventario/adapters/driving/batch-actions.ts`.

| Campo de `FormData` | Contenido | Lo lee |
|---|---|---|
| `batchId` | uuid del lote | `readOptionalFormString` |
| `countedStock` | total contado, decimal no negativo | `readOptionalFormString`, luego zod |
| `seenStock` | existencia vista, tal como la mostró la pantalla | `readOptionalFormString`, luego zod |
| `reason` | uno de `MOVEMENT_REASONS` | `readOptionalFormString` |

El campo `delta` desaparece. La action no prevalida el total: un `countedStock` no decimal lo
rechaza el esquema del caso de uso con `invalid_input` (mensaje del catálogo), porque un estado
`{ status: 'error' }` literal junto a la captura con `instanceof` dispara la guardia del traductor
único del catálogo de errores (R23 de esa guardia).

```ts
export type AdjustBatchStockFormState =
  | { status: 'idle' }
  | { status: 'success'; stock: string; reserved: string; overReserved: boolean }
  | {
      status: 'stock_changed';
      code: 'batch_stock_changed';
      message: string;
      currentStock: string;
    }
  | ErrorState;

export async function adjustBatchStockAction(
  prevState: AdjustBatchStockFormState,
  formData: FormData,
): Promise<AdjustBatchStockFormState>;
```

- **Aviso de sobre-reserva (D6, R9, R20):** `success` con `overReserved: true`. No cambia.
- **Existencia cambiada (D5, R10, R13):** la action captura `BatchStockChangedError` **antes** de
  `toErrorState` y construye el estado campo a campo:
  `{ status: 'stock_changed', code: error.code, message: error.message, currentStock: error.currentStock }`.
  `createErrorStateTranslator` construye `ErrorState` campo a campo a propósito y nunca arrastraría
  `currentStock`; por eso este caso no pasa por él.
- **Por qué un `status` propio y no `status: 'error'` con un campo de más:** `ErrorState` ya admite
  `{ status: 'error'; code: Exclude<ErrorCode, 'unexpected'>; ... }`, que incluye
  `'batch_stock_changed'`; un miembro con `status: 'error'` y `currentStock` no se podría estrechar
  por `code`, y el diálogo tendría que preguntar `'currentStock' in state`. Con `stock_changed` el
  `switch` del diálogo es exhaustivo y tipado.

### 1.4 Códigos de error — nuevos y reusados

Dos códigos nuevos en `lib/modules/errores/domain/error-codes.ts` (con su comentario «Distinto
de…» como el resto), su clave en `ERROR_MESSAGE_KEY` y su texto en `ERROR_MESSAGES_ES`
(`error-catalog.ts`). Dos clases nuevas en `lib/modules/inventario/domain/errors.ts`, exportadas por
el barrel.

| Situación | Código | Clase | Nuevo / reusado | Mensaje (`ERROR_MESSAGES_ES`) |
|---|---|---|---|---|
| Motivo no válido para el sentido (R15) | `adjustment_reason_not_allowed` | `AdjustmentReasonNotAllowedError` | **nuevo** | `Un aumento de existencia solo admite los motivos conteo fisico o error de carga.` |
| Existencia cambiada (R13) | `batch_stock_changed` | `BatchStockChangedError` | **nuevo** | `La existencia del lote cambio mientras ajustabas: revisa la diferencia y confirma de nuevo.` |
| Diferencia cero (R16) | `invalid_input` | `ValidationError` | reusado | `La entrada recibida no es valida.` |
| Aumento en producto terminado (R17) | `action_not_allowed` | `ActionNotAllowedError` | reusado | `La accion no esta permitida.` |
| Envase con presentación fija, total no entero (R18) | `invalid_input` | `ValidationError` | reusado | ídem `invalid_input` |
| Total o existencia vista con signo / fuera de escala (R19) | `invalid_input` | `ValidationError` | reusado | ídem |
| Existencia final negativa, respaldo de la base (R19) | `batch_stock_negative` | `BatchStockNegativeError` | reusado | `El ajuste dejaria la existencia del lote por debajo de cero.` |
| Lote ajeno o inexistente (R22) | `batch_not_found` | `BatchNotFoundError` | reusado | `El lote solicitado no existe.` |
| Sin permiso (R21) | `unauthorized` | `UnauthorizedError` | reusado | catálogo |

El mensaje de `adjustment_reason_not_allowed` puede nombrar el sentido porque solo el aumento
restringe motivos (D2): la disminución admite los cuatro y nunca lo dispara. Ningún texto se repite
con otro del catálogo (lo vigila su test de unicidad).

```ts
export class BatchStockChangedError extends InventarioError {
  readonly code = 'batch_stock_changed';
  readonly currentStock: string;

  constructor(currentStock: string, diagnostic?: string) {
    super('batch_stock_changed', diagnostic);
    this.currentStock = currentStock;
  }
}

export class AdjustmentReasonNotAllowedError extends InventarioError {
  readonly code = 'adjustment_reason_not_allowed';

  constructor(diagnostic?: string) {
    super('adjustment_reason_not_allowed', diagnostic);
  }
}
```

### 1.5 Puerto `ProductRepository.adjustBatchStock` — firma nueva

Los tipos viven en `domain/stock-adjustment.ts` (§1.1) para que el contrato esté en un solo archivo;
el método cambia en `ports/product-repository.ts`.

```ts
export type BatchStockAdjustment = {
  readonly batchId: string;
  readonly countedStock: string;
  readonly seenStock: string;
  readonly reason: MovementReason;
};

export type AdjustBatchStockOutcome =
  | {
      readonly kind: 'adjusted';
      readonly previousStock: string;
      readonly difference: string;
      readonly stock: string;
      readonly reserved: string;
      readonly overReserved: boolean;
    }
  | { readonly kind: 'batch_not_found' }
  | { readonly kind: 'stock_changed'; readonly currentStock: string }
  | { readonly kind: 'increase_not_allowed' };

// ProductRepository
adjustBatchStock(
  adjustment: BatchStockAdjustment,
  actorId: string,
  now: Date,
  scope: InventoryScope,
): Promise<AdjustBatchStockOutcome>;
```

Lanza `ValidationError` (envase con presentación fija y total no entero) y `BatchStockNegativeError`
(el `CHECK` de la base). Todas las cantidades salen normalizadas a cuatro decimales (`toFixed(4)`).
El nombre de la función **no cambia**: las guardias `qc91-alcance.test.ts:481,487`,
`qc121-alcance.test.ts:270,295` y `guard-libro-de-inventario.test.ts:21,250` la buscan por nombre
como el único `productBatch.update`, con su `writeMovement` y su `recalculateProductStock`.

### 1.6 Historial: `BatchHistoryEntry` — R26, R27

`lib/modules/inventario/domain/reservation.ts`:

```ts
export type BatchHistoryEntry = {
  readonly id: string;
  readonly kind: 'opening' | 'adjustment' | 'consumption' | 'reserve' | 'release' | 'expire' | 'consume';
  readonly quantity: string;
  readonly reason: MovementReason | null;
  readonly orderNumberText: string | null;
  readonly authorName: string | null;
  readonly createdAt: string;
  /** Solo en los ajustes que la guardaron; `null` en el resto y en los ajustes anteriores a la columna. */
  readonly previousStock: string | null;
  /** Mismo criterio que `previousStock`: o vienen los dos o ninguno. */
  readonly countedStock: string | null;
};
```

Campos **obligatorios y anulables**, no opcionales: así cada productor (el adaptador del libro
físico, el de la reserva, las fixtures) tiene que decidir el valor de forma explícita.
`list-batch-movements.ts` ya propaga con `...movement` y no cambia.

`NewInventoryMovement` (`domain/inventory-movement.ts`) gana
`readonly previousStock?: string | null; readonly countedStock?: string | null;` **opcionales**:
solo los escribe `adjustBatchStock`, y hacerlos obligatorios obligaría a tocar los otros cuatro
escritores del libro sin motivo.

### 1.7 Fixtures (T0)

`tests/fixtures/adjust-batch-stock.ts` (nuevo), compartido por los tests de los dos lados:

- `ADJUST_FORM_STATES`: un `AdjustBatchStockFormState` por caso —`success`, `successOverReserved`,
  `stockChanged` (con `currentStock`), `reasonNotAllowed`, `zero` (`invalid_input`),
  `finishedIncrease` (`action_not_allowed`), `unexpected` (con `reference`)—.
- `historyEntry(overrides)`: un `BatchHistoryEntry` completo con `previousStock`/`countedStock`
  `null` por defecto, y `ADJUSTMENT_WITH_COUNT` / `LEGACY_ADJUSTMENT` ya armados.
- `adjustFormData(fields)`: `FormData` con los cuatro campos del §1.3.
- `adjustedOutcome(overrides)`: un `AdjustBatchStockOutcome` `adjusted` para dobles del puerto.

### 1.8 Stub de T0: qué queda funcionando entre T0 y B2

Cambiar la firma del puerto obliga a tocar a la vez el adaptador, el caso de uso y una veintena de
tests (§8), así que eso no puede ir en T0 sin bloquear a los dos lados. T0 publica el contrato **sin
cambiar todavía el puerto ni el esquema del caso de uso**:

- Tipos, helper, errores, códigos, `BatchHistoryEntry` y fixtures: definitivos.
- La action ya tiene su forma definitiva (lee los cuatro campos del §1.3, devuelve el
  `AdjustBatchStockFormState` nuevo y traduce `BatchStockChangedError` a `stock_changed`), pero
  mientras el caso de uso siga pidiendo `delta` lleva un **puente**: si `describeAdjustment` da un
  `StockAdjustment`, pasa `{ batchId, delta: difference, reason }`; si no, devuelve `invalid_input`.
  El puente no comprueba la existencia vista. B2 lo quita y pasa los cuatro campos tal cual.

  **Enmienda (implementación):** el puente que se hizo no devolvía `invalid_input` él mismo: ante
  una lectura no válida pasaba el candidato sin `delta`, para que el caso de uso comprobara primero
  el permiso y respondiera `invalid_input` desde su esquema. B2 lo quitó; ya no existe.
- El adaptador del historial devuelve `previousStock: null, countedStock: null` hasta B5.

Con eso, `frontend_dev` trabaja contra la action mockeada y las fixtures, y `backend_dev` contra
los tipos, sin tocar un solo archivo en común.

## 2. Modelo de datos y migración — R24, R25

Migración `db/migrations/20261006140000_inventory_movements_adjustment_count/` (verificar al crearla
que no choque con otra rama: QC-209 corre en paralelo y también puede migrar).

`migration.sql`:

```sql
ALTER TABLE "inventory_movements" ADD COLUMN "stock_before"  DECIMAL(14,4);
ALTER TABLE "inventory_movements" ADD COLUMN "counted_stock" DECIMAL(14,4);

-- o los dos o ninguno
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_count_pair"
  CHECK (("stock_before" IS NULL) = ("counted_stock" IS NULL));

-- solo un ajuste los lleva
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_count_only_adjustment"
  CHECK ("stock_before" IS NULL OR "kind"::text = 'adjustment');

-- el asiento cuadra: total = existencia de antes + cantidad, y ninguno es negativo
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_count_balances"
  CHECK ("counted_stock" IS NULL
         OR ("counted_stock" = "stock_before" + "quantity"
             AND "stock_before" >= 0 AND "counted_stock" >= 0));
```

`down.sql`, orden inverso: `DROP CONSTRAINT` de los tres y `DROP COLUMN` de las dos.

`db/schema.prisma`, modelo `InventoryMovement`:
`stockBefore Decimal? @map("stock_before") @db.Decimal(14, 4)` y
`countedStock Decimal? @map("counted_stock") @db.Decimal(14, 4)`. Los tres `CHECK` son drift para
Prisma, como los que ya tiene la tabla.

Enmienda (humano, 2026-10-06):
- **`stock_before` / `stockBefore`, no `previous_stock`.** La guardia de identidad
  (`credential-policy-contract.test.ts`) prohíbe «previous» en lo declarado del esquema. El
  contrato del §1 conserva `previousStock` (`BatchHistoryEntry`, `NewInventoryMovement`,
  `AdjustBatchStockOutcome`); el adaptador traduce `previousStock` ↔ `stockBefore`.
- **`"kind"::text`.** `proveedores/company-scope.int.test.ts` reproduce `down.sql` viejos que
  recrean el enum `InventoryMovementKind`; sin el cast, el `CHECK` falla con
  `42883 text = "InventoryMovementKind"`.

Sin RLS nueva: el acceso sigue el patrón del repo (`docs/architecture.md > Acceso a datos y
autorizacion`), con el ámbito de empresa en cada consulta. Columnas anulables, sin valor por
defecto: la migración no reescribe ninguna fila (ver §6).

## 3. Adaptador Prisma `adjustBatchStock` — R12, R13, R14, R17, R18, R19, R20, R24

`lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:1027`. Dentro de una sola
`prisma.$transaction`:

1. **Bloqueo y lectura.** La consulta que hoy bloquea el producto pasa a bloquear también el lote y a
   leer su existencia, en el mismo orden de siempre (producto, luego lote):
   `SELECT p.id, p.type, p.presentation_id, b.stock::text AS "batchStock" FROM products p JOIN
   product_batches b ... WHERE b.id = $batchId AND b.company_id = $companyId FOR NO KEY UPDATE OF p, b`.
   Sin fila → `{ kind: 'batch_not_found' }`.
2. **Existencia cambiada.** `compareQuantities(batchStock, seenStock) !== 0` →
   `{ kind: 'stock_changed', currentStock: batchStock normalizado }`. Va **antes** que las reglas de
   producto terminado y envase: con otra existencia el sentido puede ser otro.
3. `difference = subtractQuantities(countedStock, batchStock)`.
4. Producto terminado y `difference > 0` → `{ kind: 'increase_not_allowed' }`.
5. Envase con presentación fija y total no entero → `ValidationError` (el mismo `isWholeQuantity`
   de hoy, aplicado al total).
6. `productBatch.update` con `stock: { increment: difference }` (sigue siendo el único `update`).
7. `writeMovement` con `kind: 'adjustment'`, `quantity: difference`, `reason`,
   `previousStock: batchStock`, `countedStock`.
8. `recalculateProductStock`, y lo apartado y `overReserved` como hoy.
9. Devuelve `{ kind: 'adjusted', previousStock, difference, stock, reserved, overReserved }`.

`catch`: `P2025` → `batch_not_found`; violación del `CHECK` de existencia negativa →
`BatchStockNegativeError`; el resto se propaga.

**Concurrencia (R14).** Dos ajustes del mismo lote con la misma vista: el segundo espera el bloqueo
del primero, lee la existencia ya comprometida, no coincide con su vista y sale por el paso 2. El
mismo bloqueo del producto que hoy serializa ajuste/alta/consumo sigue siendo el primero que se toma,
así que no aparece un orden de bloqueo nuevo.

`writeMovement` (`batch-movement-prisma.ts:22`) escribe `previousStock` (columna `stock_before`) y
`countedStock` cuando llegan, y `null` cuando no.

## 4. Diálogo — R1–R11

`app/(private)/inventario/components/adjust-batch-dialog.tsx`. Props sin cambios
(`batch`, `canAdjust`, `productType`, `wholePackages`, `onAdjusted`).

- Muestra «Existencia registrada» (`adjust-batch-recorded-stock`) con `formatDecimalDisplay`.
  Su valor es `seenStock`, un estado local que arranca en `batch.stock` al abrir y pasa a
  `currentStock` cuando llega `stock_changed`; se reinicia al cerrar y reabrir.
- Campo «Total contado» (`adjust-batch-counted`, `name="countedStock"`, `inputMode="decimal"`, o
  `"numeric"` si `wholePackages`: ya no hace falta el signo menos). El saneado deja dígitos y un
  punto (coma → punto), hasta diez enteros y cuatro decimales, **sin signo**.
- `describeAdjustment(seenStock, counted)` en cada render:
  - `StockAdjustment` → `adjust-batch-difference` con `data-direction` y el texto «Aumento de X» /
    «Disminución de X» (R2); el selector ofrece `reasonsFor(direction)` (R4).
  - `'zero'` / `'invalid'` → sin diferencia y selector deshabilitado (R5).
- El motivo es controlado: si el sentido cambia y el motivo elegido no está en
  `reasonsFor(direction)`, vuelve a vacío (R6, R10).
- Al confirmar, bloquea sin enviar: `'zero'` → `adjust-batch-zero-error` «El total contado es igual a
  la existencia registrada.» (R3); envase con total no entero → `adjust-batch-whole-error` (R7); sin
  motivo → `adjust-batch-reason-error`.
- Campos ocultos: `batchId` y `seenStock` (`adjust-batch-seen-stock`). No hay campo de diferencia (R8).
- `stock_changed` → bloque `adjust-batch-stock-changed` con el mensaje, el diálogo sigue abierto y
  no reenvía (R10); el siguiente envío lleva el `currentStock` como `seenStock` (R11).
- `success` con `overReserved` → aviso `adjust-batch-over-reserved`, abierto (R9). `success` sin él →
  toast, `router.refresh()`, cierra (como hoy). `error` → `adjust-batch-error` (como hoy).
- El aviso de producto terminado (`adjust-batch-finished-product-notice`) se conserva con su texto:
  lo comprueba `e2e/producto-terminado.spec.ts:758`.

**Enmienda (implementación, aceptada por el leader como detalle de UI):**
- Un total que `describeAdjustment` lee como `'invalid'` (vacío o parcial, como `5.`) bloquea el
  envío con la alerta `adjust-batch-counted-error`.
- El selector de motivo ignora el reset que hace Base UI (`onValueChange` con `null` y
  `details.reason === 'none'`) cuando la opción elegida deja de estar en la lista; quien decide si
  el motivo sigue valiendo es la regla de R6/R10.
- Al reabrir el diálogo se oculta el resultado del envío anterior (el estado de la action de esa
  vez se descarta), además de reiniciar los campos y los errores.

## 5. Historial — R26, R27

`app/(private)/inventario/components/batch-history.tsx`: en cada entrada con
`previousStock !== null` (y por tanto `countedStock !== null`), dos pares etiqueta/valor más,
«Existencia anterior» (`batch-history-entry-previous-stock`) y «Total contado»
(`batch-history-entry-counted-stock`), con `formatDecimalDisplay`, `exactDecimalTitle` y
`trimDecimal` como la cantidad. Con `null`, la entrada se pinta exactamente como hoy.

`batch-movement-prisma.ts`: `MOVEMENT_SELECT` añade `previousStock` y `countedStock`;
`toInventoryHistoryEntry` los pasa con `toFixed(4)` o `null`; `toReservationHistoryEntry` pone
`null` a los dos.

## 6. Decisión para aprobar: ajustes anteriores sin existencia anterior ni total contado

**Propuesta (R27):** se muestran como hoy —cantidad con signo, motivo, autor, fecha— y **sin** los
dos campos nuevos ni ningún sustituto («—», «0», «sin dato»). La migración **no** rellena hacia atrás.

**Alternativa descartada: rellenar en la migración con la suma acumulada del libro.** Para cada
ajuste viejo, existencia anterior = suma de los asientos previos del lote. Se descarta porque:
(a) hay lotes anteriores al libro, sin asiento de alta (`batch-history.tsx` ya los distingue), y en
ellos la suma acumulada no es la existencia que había; (b) dos asientos con el mismo `created_at`
no tienen un orden fiable, y el valor dependería de un desempate arbitrario; (c) escribiría en filas
de un libro que solo se corrige con asientos nuevos. Un dato reconstruido que puede ser falso es
peor que un dato ausente que el usuario ya conoce.

**Alternativa descartada: calcularlo al leer el historial.** Mismos problemas (a) y (b), y además
una suma por fila en cada apertura del historial.

## 7. Otras alternativas descartadas

- **Seguir enviando la diferencia desde la pantalla y añadir solo la existencia vista.** Cumpliría
  D5 pero no D4: la pantalla sería la fuente de la diferencia y una petición manipulada podría
  asentar una cantidad que no casa con ningún total. Con el total, el servidor deriva la diferencia
  de dos datos que comprueba.
- **Escribir el total (`SET stock = counted`) sin comprobar la existencia vista.** Es el «último
  gana» que el ajuste relativo existe para evitar: un consumo entre abrir el diálogo y confirmar
  quedaría borrado en silencio. D5 lo descarta explícitamente.
- **`status: 'error'` con `currentStock` opcional para el rechazo por existencia cambiada.** Ver
  §1.3: no se puede estrechar contra `ErrorState`.
- **Un solo código genérico (`invalid_input`) para el motivo no válido.** Sería el mensaje «La
  entrada recibida no es valida.», que no dice qué corregir. El caso solo llega al servidor si la
  pantalla se salta R4, o tras un rechazo por existencia cambiada que invierte el sentido; el
  mensaje propio cuesta una línea en el catálogo. **Necesita aprobación** (enmienda del catálogo).

## 8. Llamadores afectados (`archivo:linea`)

Producción:

| Archivo:línea | Qué usa | Cambio |
|---|---|---|
| `lib/modules/inventario/ports/product-repository.ts:208` | firma del puerto | §1.5 (B2) |
| `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:1027` | implementación | §3 (B2) |
| `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts:22,43,73,85` | `writeMovement`, historial | B1 (escritura), T0 + B5 (lectura) |
| `lib/modules/inventario/domain/adjust-batch-stock.ts:20-39,73-89` | esquema y llamada al puerto | B2 (T0 no lo toca) |
| `lib/modules/inventario/domain/inventory-movement.ts:16` | `NewInventoryMovement` | B1 |
| `lib/modules/inventario/domain/reservation.ts:83` | `BatchHistoryEntry` | T0 |
| `lib/modules/inventario/domain/errors.ts` | clases nuevas | T0 |
| `lib/modules/inventario/index.ts:69,92-95,161` | barrel | T0 |
| `lib/modules/inventario/adapters/driving/batch-actions.ts:15-18,30,43-56,80-105` | FormState y action | T0 (con puente, §1.8) + B2 (quita el puente) |
| `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts` | códigos | T0 |
| `lib/composition/index.ts:63,92,820,900` | cableado | sin cambio (verificar en TI) |
| `app/(private)/inventario/components/adjust-batch-dialog.tsx:28-29,43-85,152` | action y campos | F1 |
| `app/(private)/inventario/components/batch-history.tsx:128-171` | historial | F2 |
| `app/(private)/inventario/components/product-batches-sheet.tsx:111` | monta el diálogo | sin cambio |

Tests y E2E:

| Archivo:línea | Qué usa | Task |
|---|---|---|
| `tests/unit/inventario/adjust-batch-stock.test.ts:39-64,97-284,528-565` | caso de uso con `delta` y doble del puerto; 5 objetos de historial | T0 (campos `null` en el historial) + B2 (+ casos nuevos B3) |
| `tests/unit/inventario/adjust-batch-stock-prisma.test.ts:45,160-352` | adaptador posicional | B2 (+ casos nuevos B3) |
| `tests/unit/inventario/batch-actions.test.ts:2,5,38,82,104-235` | action con `delta` | T0 (+ casos nuevos B4) |
| `tests/unit/inventario/authorization.test.ts:23,143,284,339,462,464` | doble del puerto y entrada válida | B2 |
| `tests/unit/inventario/list-use-cases.test.ts:63` | `vi.fn<ProductRepository['adjustBatchStock']>()` | B2 |
| `tests/unit/inventario/create-product.test.ts:85` | doble que devuelve `null` | B2 |
| `tests/unit/inventario/company-isolation-service.test.ts:181` | doble que devuelve `null` | B2 |
| `tests/unit/inventario/product-service.test.ts:107` | doble que devuelve `null` | B2 |
| `tests/unit/inventario/product-input.test.ts:177` | doble `vi.fn()` | B2 (verificar tipo) |
| `tests/unit/asignaciones/empacador-authorization.test.ts:195` | doble que explota | sin cambio (verificar) |
| `tests/unit/inventario/product-route-contract.test.ts:484` | guardia del permiso | sin cambio; debe seguir verde |
| `tests/unit/inventario/qc91-alcance.test.ts:481,487` | guardia del único `update` | sin cambio |
| `tests/unit/inventario/qc121-alcance.test.ts:270,295` | guardia del recálculo | sin cambio |
| `tests/guards/guard-libro-de-inventario.test.ts:21,250,309-347` | censo de escritores del libro | sin cambio |
| `tests/guards/guard-identificador-de-request.test.ts:447` | `MIGRACIONES_ESPERADAS` | B1 (enmienda): una línea, `'20261006140000_inventory_movements_adjustment_count'`; la propia guardia lo pide a la ficha que añade migración. Sin cambio de lógica |
| `tests/unit/inventario/schema/inventario-schema.test.ts:735-755` | censo de factorías | sin cambio (§1.1) |
| `tests/unit/inventario/batch-movement-prisma.test.ts` (4 objetos con `orderNumberText`) | historial | T0 (campos `null`) + B5 |
| `tests/unit/inventario/batch-history.test.tsx` (5 objetos) | historial | T0 (campos `null`) + F2 |
| `tests/unit/inventario/adjust-batch-dialog.test.tsx:9-266` | diálogo y FormData | F1 |
| `tests/unit/inventario-ui/envase-en-inventario.test.tsx:26-322` | diálogo de envase | F1 |
| `tests/unit/inventario/product-batches-sheet.test.tsx:23-46`, `product-page.test.tsx:123-208`, `finished-stock-table.test.tsx:30-55` | mock de la action | sin cambio (verificar) |
| `tests/helpers/product-batch-result.ts:16` | `stockAdjusted` | B2 |
| `tests/integration/inventario/reservation.int.test.ts:25,921,972,1022,1052,1102,1129` (+2 objetos de historial) | adaptador posicional | T0 (historial) + B2 |
| `tests/integration/pedidos/order-reservation-concurrency.int.test.ts:22,337` | adaptador | B2 |
| `tests/integration/pedidos/review-blocked-orders.int.test.ts:645,663,682` | caso de uso con `delta` | B2 |
| `tests/integration/inventario/order-batches.int.test.ts:15,248,252` | adaptador | B2 |
| `tests/integration/inventario/qc195-packaging-product.int.test.ts:17,31,50,56` | adaptador y caso de uso | B2 |
| `tests/integration/inventario/ledger-cuadre.int.test.ts:31,270,276` | adaptador | B2 |
| `tests/integration/inventario/product-stock.int.test.ts:20,432,443,481,514,559,560,586` | adaptador | B2 |
| `tests/integration/inventario/finished-product-prohibitions.int.test.ts:16,226,251,276` | adaptador | B2 |
| `tests/integration/inventario/company-scope-queries.int.test.ts:19,693,708` | adaptador | B2 |
| `tests/integration/inventario/finished-stock.int.test.ts:16,201` | adaptador | B2 |
| `tests/integration/inventario/product-batch-lot.int.test.ts:24,694` | adaptador | B2 |
| `tests/integration/aislamiento.json:188,208,248,253,323,448,468,473` | inventario de aislamiento | B2: comprobar si lo regenera un script o se edita a mano |
| `e2e/ajuste-de-inventario.spec.ts:98,179-184,352,420-461` | diálogo con cantidad con signo | TI |
| `e2e/producto-terminado.spec.ts:756-758` | aviso de producto terminado | TI (debe seguir verde) |

Para no reescribir a mano cada llamada posicional de los tests de integración, B2 añade
`tests/helpers/adjust-by-delta.ts`: lee la existencia del lote, llama al puerto nuevo con
`seenStock` = existencia y `countedStock` = existencia + delta, y devuelve el `AdjustBatchStockOutcome`.
Las llamadas concurrentes de `product-stock.int.test.ts:559-586` y
`order-reservation-concurrency.int.test.ts:337` compiten con otro lote o con un apartado, no con otro
ajuste del mismo lote, así que leer antes no cambia lo que comprueban.

## 9. Trazabilidad prevista (R → test)

| R | Test previsto |
|---|---|
| R1, R2, R3, R5, R6, R8, R9, R10, R11 | `tests/unit/inventario/adjust-batch-dialog.test.tsx` |
| R4 | `adjust-batch-dialog.test.tsx` + `tests/unit/inventario/stock-adjustment.test.ts` |
| R7 | `tests/unit/inventario-ui/envase-en-inventario.test.tsx` |
| R12 | `adjust-batch-stock-prisma.test.ts` + `tests/integration/inventario/adjust-by-count.int.test.ts` |
| R13 | `adjust-batch-stock-prisma.test.ts`, `adjust-batch-stock.test.ts`, `batch-actions.test.ts`, `adjust-by-count.int.test.ts` |
| R14 | `adjust-by-count.int.test.ts` (dos ajustes concurrentes del mismo lote) |
| R15, R16, R19 (forma) | `adjust-batch-stock.test.ts` (el puerto no se llama) |
| R17 | `adjust-batch-stock-prisma.test.ts` + `finished-product-prohibitions.int.test.ts` |
| R18 | `adjust-batch-stock-prisma.test.ts` + `qc195-packaging-product.int.test.ts` |
| R19 (respaldo de la base) | `adjust-batch-stock-prisma.test.ts` (violación del `CHECK` → `BatchStockNegativeError`) |
| R20 | `reservation.int.test.ts` + `batch-actions.test.ts` |
| R21 | `authorization.test.ts`, `product-route-contract.test.ts:482`, E2E del Operador |
| R22 | `adjust-batch-stock.test.ts` + `company-scope-queries.int.test.ts` |
| R23 | `adjust-batch-stock.test.ts` |
| R24, R25 | `adjust-by-count.int.test.ts` (asiento con los dos campos; `INSERT` crudos que violan cada `CHECK`) |
| R26, R27 | `tests/unit/inventario/batch-history.test.tsx` + `batch-movement-prisma.test.ts` |
| R28 | `stock-adjustment.test.ts` (tabla de casos) + un caso que lee las fuentes del diálogo y del caso de uso y exige que importen `describeAdjustment`/`isReasonAllowed`/`reasonsFor` del módulo, sin una lista de motivos propia |
| R29 | `e2e/ajuste-de-inventario.spec.ts` |
| R30 | `tests/guards/guard-dependencias-aprobadas.test.ts` (sin cambios en `package.json`) |

## 10. Integraciones

Ninguna externa. El aviso de aumento (`StockIncreaseListener`, `lib/composition/index.ts:900-903`)
sigue cableado igual; solo cambia de dónde sale el sentido (§1.2, paso 5).
