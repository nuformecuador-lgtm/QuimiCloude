# QC-219 — datos-de-lote-en-acondicionamiento · design.md

> El **qué** está en `requirements.md` (R1–R30). Aquí va el **cómo**. Las rutas son las de este
> worktree: una rama sobre `origin/dev` con QC-215, QC-216, QC-217 y QC-218 mergeadas.
>
> Aprobado el 2026-10-09, con las filas **D13** (pestaña «Entregados»), **D14** (día de
> producción en el lote), **D15** (sin migración de datos) y **D16** («hoy» en UTC), y con las
> enmiendas de § 9. Ninguna librería nueva.

## Lo que ya existe

**Términos buscados.**

- **Board** (`feature_list.json`, nombre y descripción, todos los estados): «vencimiento», «día de
  producción» y «lote real».
- **`specs/`**: `production_date`, «día de producción», `expiry`, «lote automático» y «corregir».
- **Código** (Grep/Read): `productionDate`, `production_date`, `expiryDate`, `resolveLot`,
  `receiveFinishedGoods`, `findBatchesOfOrder`, `order_presentation_line_id`,
  `finishConditioningAliveById` y `ProductBatchesPanel`.

El MCP del grafo no tiene indexado este worktree (`list_projects` no lo lista), así que la
búsqueda de código es por Grep/Read.

**Resultado.** Nada resuelve la ficha: ningún código ni spec escribe un día de producción, y
ninguna vía de la aplicación edita el lote ni el vencimiento de un lote existente. No hay bloqueo.
Lo que apareció se reutiliza o se acota:

| Ref | Qué es | Uso aquí |
|---|---|---|
| QC-81 `product_batches.lot`, índice `product_batches_company_lot_unique`, `lotSchema` de `product-batch-input.ts`, `batch_duplicate_lot` | lote único por empresa, sensible a mayúsculas | **se reutiliza** la regla del lote tecleado (no exportada hoy, § 3.1) y el código de error |
| QC-81 `create-product.ts > rechazarFechaFutura` (`fechaCivilUtc`) | «hoy» = fecha civil UTC | **se calca** para las dos fechas (D16) |
| QC-170 `receiveFinishedGoods` y el asiento `production` con `order_presentation_line_id`, más `inventory_movements_one_production_per_line` | un lote de producto terminado por línea | es **el enlace línea → lote** (§ 2.2). No se toca la entrada |
| QC-150/QC-170 `findBatchesOfOrder` | lotes que entraron por producción de un pedido | **se calca su filtro** (asiento `production` del pedido) para la lectura nueva. No se reutiliza: devuelve la vista de inventario, sin la línea |
| QC-215/QC-218 `finish-conditioning.ts`, `get-conditioning-order.ts`, `order-conditioning-actions.ts`, `ConditioningOrderScreen`, `ConditioningActions` | Terminar y el detalle | **se amplían** (§ 3, § 4, § 5) |
| QC-217 `list-conditioned-orders.ts`, `conditioned-orders-*.tsx`, `assignment-views.ts` | pestaña «Terminados» | **se calcan** para «Entregados» (D13) |
| QC-92 `guard-libro-de-inventario.test.ts` y `qc91-alcance.test.ts` | censo de escrituras de `product_batches` | **se amplían** con un camino nombrado (§ 7) |
| `ProductBatchesPanel` (`/inventario`) | panel de lotes | **se amplía** con «Vencimiento» (R22) |
| QC-196 (`pending`) | reserva por vencimiento | **no entra**: es el consumidor del vencimiento |
| QC-197 (`pending`) | lote real de los insumos que usa el operador | **no entra**: es otro lote, el del material consumido |
| QC-223 (`in_progress`) | entrega `TERMINADO → ENTREGADO`, elige lotes y ya muestra lote y vencimiento | **no se toca**. Es la primera vía que escribe `ENTREGADO` (D13). Posible cruce de archivos (§ 9) |
| QC-225 (`pending`) | detalle de producto terminado, con sus lotes | futuro lector del día de producción (D14). No se toca |

## 1. Modelo de datos (D14)

### 1.1 Columna nueva `product_batches.production_date`

```prisma
model ProductBatch {
  …
  expiryDate     DateTime? @map("expiry_date") @db.Date
  /// Dia en que se produjo el lote. Solo lo escribe el acondicionamiento, junto con el
  /// vencimiento; el CHECK que lo exige es drift.
  productionDate DateTime? @map("production_date") @db.Date
  …
}
```

- **Anulable.** Todo lote existente, sea de compra, de importación o de producción, queda en `NULL`
  (R24). La obligatoriedad vive en Terminar (R15), no en la columna: un lote recién producido no lo
  tiene hasta que el acondicionador lo escribe.
- **`CHECK product_batches_production_date_requires_expiry`**:
  `production_date IS NULL OR expiry_date IS NOT NULL`. Lo pide R24. Garantiza en la base que los
  tres datos van juntos: la aplicación escribe los tres a la vez y nunca borra el vencimiento.
  Por eso «línea con datos» se decide con una sola columna (`production_date IS NOT NULL`).
- **Lo que la base no garantiza**:
  - que `production_date <= expiry_date`. Con R8 y R9 se cumple al escribir (producción ≤ hoy <
    vencimiento). Un `CHECK` de ese orden sería inofensivo, pero ningún requisito lo pide;
  - que solo los lotes de producción la tengan. Un `CHECK` no puede mirar `products.type` ni los
    asientos. Lo garantiza el adaptador, que solo escribe lotes con asiento `production` del pedido
    (R12).
- **RLS:** `product_batches` ya tiene `ENABLE` + `FORCE ROW LEVEL SECURITY` sin policies desde
  `20260909120000_product_batches`. No cambia.
- **Empresa:** la tabla ya tiene `company_id`. `guard-empresa-en-esquema` no cambia.

### 1.2 Migración `db/migrations/20261009120000_product_batches_production_date/`

- **`migration.sql`**, escrita a mano (el `CHECK` es drift):
  1. `ALTER TABLE "product_batches" ADD COLUMN "production_date" DATE;`
  2. `ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_production_date_requires_expiry" CHECK ("production_date" IS NULL OR "expiry_date" IS NOT NULL);`

  No reescribe filas: `ADD COLUMN` sin `DEFAULT` es solo de catálogo.
- **`down.sql`**: `DROP CONSTRAINT` y `DROP COLUMN`, en ese orden. Si algún lote tenía día de
  producción, ese dato se pierde con el rollback. Es lo esperado de un `down` que «revierte
  exactamente».
- El nombre entra en la lista de migraciones conocidas de
  `tests/guards/guard-identificador-de-request.test.ts`.
- **Timestamp.** QC-223 tiene en vuelo `20261008150050`–`20261008150200`, todas anteriores a esta.
  Si al sincronizar con `dev` (F2.3) hay una posterior, se sube el timestamp y se corrige
  `tasks.md > Archivos esperados`.

## 2. `inventario`: el contrato de datos de lote

`asignaciones` no puede escribir en `product_batches`: es de `inventario`. Se sigue el patrón de
`FinishedGoodsIntake`: `inventario` define el contrato en su dominio, lo implementa un adaptador
driven y lo cablea `lib/composition`.

### 2.1 `lib/modules/inventario/domain/finished-batch-labels.ts` (nuevo, solo tipos)

```ts
/** El lote de produccion de una linea del reparto, con sus datos de lote. */
export type FinishedBatchOfOrderLine = {
  readonly batchId: string;
  readonly orderPresentationLineId: string;
  readonly presentationId: string;
  readonly lot: string;
  readonly expiryDate: string | null;      // 'AAAA-MM-DD'
  readonly productionDate: string | null;  // 'AAAA-MM-DD'
};

export type FinishedBatchLabel = {
  readonly batchId: string;
  readonly lot: string;
  readonly expiryDate: string;
  readonly productionDate: string;
};

export type FinishedBatchLabelsOutcome =
  | { readonly kind: 'written' }
  | { readonly kind: 'batch_not_found'; readonly batchId: string }
  | { readonly kind: 'duplicate_lot'; readonly batchId: string | null };

export interface FinishedBatchLabels {
  /** Un elemento por linea que tiene asiento `production` de ese pedido. Sin lote = la linea no
   *  aparece. Fuera de transaccion. */
  listOfOrder(companyId: string, orderId: string): Promise<readonly FinishedBatchOfOrderLine[]>;
  /** Todo o nada, en su propia transaccion. */
  writeForOrder(input: {
    readonly companyId: string;
    readonly orderId: string;
    readonly labels: readonly FinishedBatchLabel[];
    readonly actorId: string;
    readonly now: Date;
  }): Promise<FinishedBatchLabelsOutcome>;
}
```

Se exporta en `lib/modules/inventario/index.ts`, junto a `FinishedGoodsIntake`. También se exporta
`PRODUCT_BATCH_LOT_MAX_LENGTH`, que ya está, y el esquema del lote tecleado (§ 3.1).

### 2.2 Adaptador

- **`lib/modules/inventario/adapters/driven/persistence/finished-batch-labels-prisma.ts`** (nuevo):
  `createFinishedBatchLabels(): FinishedBatchLabels`.
  - `listOfOrder` usa `inventoryMovement.findMany`, con `where { companyId, orderId, kind:
    'production' }` y `select { orderPresentationLineId, batch: { id, presentationId, lot,
    expiryDate, productionDate } }`. Ámbito en el asiento **y** en el lote, como
    `findBatchesOfOrder`.
  - `writeForOrder` abre `prisma.$transaction` y delega en `writeFinishedBatchLabels` (abajo).
- **`writeFinishedBatchLabels(tx, input, scope)`**, exportada desde **`product-prisma.ts`**. Va ahí
  porque la guardia del libro exige que todo camino de escritura de lotes viva en ese archivo
  (§ 7). Hace:
  1. **Lee y bloquea** los lotes de producción del pedido. Es un `SELECT … FOR UPDATE` de
     `product_batches` unido a `inventory_movements` (`kind = 'production'`, `order_id`, misma
     empresa). Si un `batchId` de la entrada no está → `{ kind: 'batch_not_found', batchId }` (R12).
  2. **Choque previo.** Busca, en la empresa, un lote con un `lot` de la entrada y otro `id` que el
     de su línea → `{ kind: 'duplicate_lot', batchId }` (R10). Incluye los demás lotes del mismo
     pedido. Así un intercambio A↔B en un solo guardado se rechaza, que es lo que dice R10 al pie de
     la letra.
  3. **Escribe** cada línea con `tx.productBatch.update({ where: { id_companyId }, data: { lot,
     expiryDate, productionDate, updatedBy, updatedAt } })`. No toca `stock` ni ningún asiento (R6).
     Las fechas van como fecha civil, con el conversor de `toBatchExpiryDate`.
  4. **Carrera** (R11). Un `P2002` sobre `product_batches_company_lot_unique` →
     `{ kind: 'duplicate_lot', batchId: null }`. La excepción deshace la transacción entera.

  **Por qué sin `writeMovement`:** no cambia existencias. El libro asienta movimientos de cantidad
  (QC-92 R28), no cambios de etiqueta. La trazabilidad del cambio queda en `updated_by` y
  `updated_at` del lote. Un historial de etiquetas no lo pide ningún requisito.
- **Serie numérica de QC-81.** Un lote tecleado de solo dígitos entra en la serie, como en el alta
  manual. Ejemplo: si el acondicionador escribe `900`, el siguiente automático de la empresa será
  `901` (QC-81 D6). No se toma el advisory lock de `resolveLot`. Con una generación simultánea, el
  índice único decide (QC-81: «el lock solo evita choques; la garantía es el índice único»).
- **Concurrencia con QC-223.** Una entrega actualiza `stock` del mismo lote. Las dos escrituras se
  serializan por el bloqueo de fila y no pisan columnas comunes.

## 3. `asignaciones`: dominio

### 3.1 `save-conditioning-batch-data.ts` (nuevo)

```ts
export const saveConditioningBatchDataSchema = z.strictObject({
  orderId: z.string().uuid(),
  lines: z.array(z.strictObject({
    batchId: z.string().uuid(),
    lot: typedLotSchema,              // el de QC-81, exportado por inventario
    expiryDate: civilDateSchema,      // AAAA-MM-DD y dia que existe
    productionDate: civilDateSchema,
  })).min(1).refine(sinBatchIdRepetidos),
});

export type SaveConditioningBatchDataDeps = {
  readonly orders: OrderCatalog;
  readonly batches: FinishedBatchLabels;
  readonly now?: () => Date;
};
```

**Pasos, y el orden es requisito:**

1. `requirePermission(actor, 'acondicionamiento.modificar')` (R13).
2. `safeParse` → `ValidationError` (R7).
3. **El pedido** (R14):
   - `orders.findAliveById`: `null` → `OrderNotFoundError`;
   - `listAliveSummariesByIds`: da quién acondiciona;
   - `EN_ACONDICIONAMIENTO` ajeno → `OrderConditioningTakenError`;
   - `TERMINADO` o `ENTREGADO` (D13) ajeno o sin quien acondiciona → `OrderNotFoundError`;
   - cualquier otro estado → `OrderNotConditionableError`.
4. **Fechas** contra `hoy = fechaCivilUtc(now())` (D16), comparando cadenas `AAAA-MM-DD`, como QC-81:
   - `expiryDate <= hoy` → `BatchExpiryNotFutureError` (R8);
   - `productionDate > hoy` → `BatchProductionDateFutureError` (R9).

   La primera línea culpable va en `batchId`.
5. **Repetidos en la entrada:** dos líneas con el mismo `lot` → `ConditioningBatchDuplicateLotError`
   con el `batchId` de la segunda (R10).
6. `batches.writeForOrder(...)`. Lo que devuelve se traduce así:
   - `batch_not_found` → `ConditioningBatchNotFoundError`;
   - `duplicate_lot` → `ConditioningBatchDuplicateLotError`.

**De dónde salen las reglas del lote y la fecha.** El `lotSchema` de `product-batch-input.ts` no se
exporta hoy. Se exporta desde `inventario` como `typedLotSchema`, para que «lote tecleado» tenga
una sola definición: si QC-81 cambia su regla, esta la sigue. `esDiaDeCalendario` se exporta junto
a él como `civilDateSchema`. Es una enmienda al contrato de `inventario` (§ 9).

### 3.2 `finish-conditioning.ts` (se amplía, R15–R17)

- Deps: gana `batches: Pick<FinishedBatchLabels, 'listOfOrder'>`.
- Tras leer `target` y `summary`, que ya los lee:
  1. si `target.status !== 'EN_ACONDICIONAMIENTO'` → `OrderNotConditionableError`;
  2. si `summary.conditionedBy !== actor.id` → `OrderConditioningTakenError`;
  3. `listOfOrder` y `missingBatchDataLines(summary.presentationLines, batches)`. Si da más de 0 →
     `ConditioningBatchDataMissingError`.
- Después, `finishConditioningAliveById`, como hoy. El `UPDATE` condicional sigue cubriendo la
  carrera de estado.
- **Por qué la comprobación de datos no va dentro de la transacción de terminar:** los datos no se
  pueden borrar (R7), y el reparto no se edita en este estado (QC-215 D13). Una vez completos,
  siguen completos.
- **`missingBatchDataLines`** va en `conditioning-batch-data.ts` (nuevo, puro). La usan Terminar y
  el detalle, así que el aviso de R4 y el rechazo de R15 no pueden discrepar. Una línea cuenta
  como «sin datos» si no hay lote para su `presentationId` o si su lote tiene `productionDate`
  `null`. La clave es `presentationId`, que es única por pedido
  (`order_presentation_lines_order_id_presentation_id_key`). Un pedido sin líneas da 0 (R17, D15).

### 3.3 `get-conditioning-order.ts` (se amplía)

- `DETAIL_STATUSES` gana `ENTREGADO` (D13), con la misma regla que `TERMINADO`: solo si lo
  acondicionó el actor.
- `ConditioningOrderDetail` gana:

  ```ts
  readonly batchData: {
    readonly lines: readonly ConditioningBatchLineView[];
    readonly missingCount: number;
  } | null;
  ```

  Es `null` en `POR_ACONDICIONAR` y cuando el actor no es quien acondiciona (R3). `ConditioningBatchLineView`
  trae `batchId | null`, `presentationName`, `packagingName`, `packages`, `provisionalLot` (el
  `lot` cuando no hay datos), `lot`, `expiryDate` y `productionDate`.
- Deps nuevas: `batches: Pick<FinishedBatchLabels, 'listOfOrder'>`.
- La fila de «Por acondicionar» (`ConditioningOrderRow`) **no cambia**.

### 3.4 «Entregados» del acondicionador (D13)

- `list-delivered-conditioned-orders.ts` (nuevo). Es `list-conditioned-orders.ts` con `ENTREGADO` en
  vez de `TERMINADO`: mismo orden, mismo filtro por quien acondiciona, mismas columnas.
- **Por qué un caso de uso nuevo y no un parámetro:** `list-conditioned-orders.ts` y sus tests son de
  QC-217, mergeados. Son unas 40 líneas, y la forma ya está probada.
- `assignment-views.ts`: vista nueva `acondicionados_entregados`, detrás de `acondicionados`, con el
  mismo predicado de permiso.

### 3.5 Errores nuevos (enmienda al catálogo cerrado)

| Clase (`asignaciones/domain/errors.ts`) | `code` | Texto propuesto (estilo del catálogo, sin tildes) |
|---|---|---|
| `BatchExpiryNotFutureError` | `batch_expiry_not_future` (nuevo) | `'La fecha de vencimiento debe ser posterior a hoy.'` |
| `BatchProductionDateFutureError` | `batch_production_date_future` (nuevo) | `'El dia de produccion no puede ser posterior a hoy.'` |
| `ConditioningBatchDataMissingError` | `conditioning_batch_data_missing` (nuevo) | `'Faltan datos de lote en alguna linea del pedido.'` |
| `ConditioningBatchDuplicateLotError` | `batch_duplicate_lot` (existe, QC-81) | el actual: `'Ya existe un lote con ese valor en esta empresa.'` |
| `ConditioningBatchNotFoundError` | `batch_not_found` (existe, QC-92) | el actual |

- Las tres primeras van en `error-codes.ts`, con su línea de fecha, y en `error-catalog.ts`.
- Las cinco llevan `batchId?: string` como dato de diagnóstico, para que la pantalla marque la línea
  (R5).
- **Por qué no `order_not_conditionable` para los datos que faltan:** su texto dice que el pedido no
  se puede acondicionar, y aquí sí se puede; solo faltan datos.

## 4. Server Action

En `lib/modules/asignaciones/adapters/driving/order-conditioning-actions.ts` (se amplía):

| Acción | Entrada (`FormData`) | Éxito | Error |
|---|---|---|---|
| `saveConditioningBatchDataAction(prev, fd)` | `orderId`; `getAll('batchId')`, `getAll('lot')`, `getAll('expiryDate')`, `getAll('productionDate')`, emparejadas por posición | `revalidatePath(conditioningOrderRoute(id))` → `{ status: 'success' }` | `ErrorState & { batchId?: string }` (R5) |

- La acción **omite** las líneas con los tres campos vacíos. Una línea con algún campo vacío viaja
  tal cual, y el caso de uso la rechaza con `invalid_input` (R7).
- El formulario marca `required` los tres campos de una línea en cuanto uno tiene valor. Es solo
  ayuda: la frontera es el caso de uso.
- `finishConditioningAction` no cambia: el error nuevo llega por `toErrorState`, como los demás.

## 5. Pantalla

### 5.1 `page.tsx` del detalle

- `canFinish` sigue siendo el de QC-218 y gana un dato más:
  `finishBlocked = order.batchData !== null && order.batchData.missingCount > 0` (R4).
- Pasa `order.batchData` a la pantalla.
- Con `ENTREGADO` (D13) no hay `canStart` ni `canFinish`.

### 5.2 Componentes de ruta (`app/(private)/asignacion/acondicionamiento/[id]/components/`)

| Archivo | Tipo | Qué |
|---|---|---|
| `conditioning-batch-data-form.tsx` (nuevo) | cliente | `<section>` «Datos de lote». Va con `useActionState(saveConditioningBatchDataAction)`, un `<fieldset>` por línea (`<legend>` con la línea), tres `Input` (`type="text"`, `type="date"`, `type="date"`) en `text-base` y `min-h-11`, la nota «Lote provisional: X.», «Guardar datos de lote», el error en `role="alert"` y el éxito en `role="status"` (R1, R2, R5) |
| `conditioning-order-screen.tsx` | servidor | pinta el formulario si `order.batchData !== null` y la nota de R4 si `missingCount > 0`. El enlace de vuelta en `ENTREGADO` es «Volver a «Entregados»» |
| `conditioning-actions.tsx` | cliente | con `finishBlocked`, «Terminar» se pinta `disabled` y no abre el modal (R4) |
| `index.ts` | barrel | reexporta el formulario |

**Multiplataforma** (`docs/perfil-agentes.md > frontend_dev` regla 9):

- se usa el selector de fecha nativo (`type="date"`), que existe en Safari/WebKit y Chrome Android;
- los bloques van en una columna en móvil y en tres en `md:`;
- nada depende de `:hover`.

### 5.3 `/inventario` (R22)

`app/(private)/inventario/components/product-batches-panel.tsx`: un `<div>` más en el `<dl>`, con
`<dt>Vencimiento</dt><dd data-testid="product-batch-expiry-date">`. Solo se pinta si
`batch.expiryDate !== null`. `ProductBatchView.expiryDate` ya llega en todas las lecturas, así que
no cambia ningún adaptador.

### 5.4 «Entregados» en `/asignacion` (D13)

- `app/(private)/asignacion/page.tsx` gana la tercera vista y su sección.
- Componentes nuevos calcados de los de «Terminados»: `delivered-conditioned-orders-list-section.tsx`.
  La tabla y las columnas se reutilizan tal cual (`conditioned-orders-table.tsx` y
  `conditioned-orders-columns.tsx`), porque R20 pide las mismas.
- `conditioning-orders-href.ts` sabe volver a la vista nueva.

## 6. Propuestas que se aprueban con el spec

| # | Propuesta | Dónde |
|---|---|---|
| N1 | El lote de una línea sin datos se muestra **vacío**, con «Lote provisional: X.» debajo, y no relleno con el automático. Así el acondicionador escribe el lote real y no confirma el provisional sin mirarlo (D1). Puede teclear el mismo valor si quiere conservarlo | R2 |
| N2 | Textos: sección «Datos de lote»; campos «Lote», «Vencimiento» y «Día de producción»; botón «Guardar datos de lote»; éxito «Datos de lote guardados.»; aviso «Faltan los datos de lote de 1 línea.» / «… de <k> líneas.»; los tres textos de error de § 3.5 | R1, R2, R4, R8, R9, R15 |
| N3 | «Terminar» deshabilitado con aviso mientras falten datos (R4). El rechazo del servidor (R15) es la frontera, y se prueba en unit e integración | R4, R15 |
| N4 | La sección no se muestra a otro acondicionador, ni en solo lectura (R3). Es el mínimo que pide D6 | R3 |
| N5 | En `/inventario`, «Vencimiento» solo en los lotes que lo tienen. Los demás se pintan como hoy | R22 |
| N6 (D13) | Pestaña «Entregados», vista `acondicionados_entregados`; vacío «Todavía no se ha entregado ningún pedido que acondicionaste.»; vuelta «Volver a «Entregados»» | R20, R21 |

## 7. Autorización y guardias

- **Service:**
  - guardar exige el permiso en su primera línea (R13) y que el actor sea quien acondiciona (R14);
  - Terminar ya lo exigía;
  - el detalle solo arma `batchData` para quien acondiciona (R3).
- **`tests/unit/identity/roles/acondicionamiento-rol.test.ts`:** la lista de casos de uso que
  exigen el permiso suma `save-conditioning-batch-data.ts` y
  `list-delivered-conditioned-orders.ts` (R26).
- **`tests/guards/guard-libro-de-inventario.test.ts`:** `CAMINOS_ESPERADOS` suma
  `writeFinishedBatchLabels`. La regla «todo camino asienta con `writeMovement`» gana una excepción
  nombrada para él. Además, una aserción nueva: su cuerpo no escribe `stock`, ni con `stock:` en
  `data` ni con `increment`/`decrement`. Lleva su prueba por mutación sobre una fuente fabricada
  (R27, enmienda QC-92 R28).
- **`tests/unit/inventario/qc91-alcance.test.ts`:** `update` sobre `productBatch` se admite en
  `adjustBatchStock` **y** en `writeFinishedBatchLabels`. Lleva nota fechada y la misma prueba por
  mutación que el resto (R27, enmienda QC-92 R26).
- **`guard-arquitectura-modulos`:**
  - el dominio de `asignaciones` importa solo `@/lib/modules/inventario` y `@/lib/modules/pedidos`
    (contratos);
  - el adaptador nuevo lo cablea `lib/composition`;
  - el `ProductBatch` sigue con `/// @module inventario`.
- **Aislamiento por empresa** (reviewer, punto 8): las dos lecturas y la escritura filtran por la
  empresa del actor. Hay un test de integración que intenta guardar el lote de otra empresa y
  recibe `batch_not_found` (R12).

## 8. Alternativas descartadas

1. **El día de producción en `order_presentation_lines`** (D14). Separaría dos datos del mismo
   lote físico en dos módulos: el vencimiento en `inventario` (D5) y la producción en `pedidos`.
   QC-225 tendría que unir pedido y lote para pintar un lote. Y la línea es del reparto
   (planificación), no del inventario.
2. **Reutilizar `purchase_date` como día de producción.** Es la columna por la que QC-141 y QC-223
   eligen de qué lote sale lo que se aparta o se entrega (el más antiguo primero). Sobrescribirla
   cambiaría ese orden sin que nadie lo haya decidido. Además, «fecha de compra» de un producto
   fabricado dejaría de significar lo que dice su etiqueta en `/inventario`.
3. **Una tabla aparte `finished_batch_labels`** (lote, vencimiento, producción por línea), sin
   tocar `product_batches`. Contradice D1 y D5: el lote y el vencimiento tienen que quedar **en el
   lote del inventario**, que es el que ven `/inventario`, QC-223 y QC-196.
4. **Guardar los datos al confirmar Terminar, en el mismo modal.** Juntaría dos pasos que D8
   separa: los datos se corrigen también después. Haría falta un segundo formulario para corregir,
   y el bloqueo de 5 s de QC-218 se aplicaría también a corregir.
5. **Un `UPDATE` crudo en SQL desde `asignaciones`.** Rompe la regla de dependencias: `asignaciones`
   no puede tocar tablas de `inventario`. Además saltaría el censo de escrituras de lotes de QC-92.
6. **Escribir la etiqueta con su propio asiento en el libro** (`kind = 'relabel'`). Haría falta un
   valor de enum nuevo, que necesita su migración aparte (55P04, como QC-223), y el cuadre del
   libro tendría que ignorarlo. Ningún requisito pide historial de etiquetas.

## 9. Choques y enmiendas

**Enmiendas a specs mergeados** (se aprueban con el spec):

- **QC-218 R27 y QC-215 R12/R13:** Terminar gana la precondición de datos y el error
  `conditioning_batch_data_missing` (R15, R16). D7 sembrada ya lo anunciaba.
- **QC-218 R3:** el detalle de un `TERMINADO` ofrece el formulario de datos a quien lo acondicionó
  (R3, R18).
- **QC-217 R21 y QC-218 R31:** el código del permiso aparece en una o dos rutas más (R26).
- **QC-81 R32 (y QC-90 R30):** el contrato de `inventario` ofrece ahora escribir los datos de lote,
  solo en lotes que entraron por producción, y exporta la regla del lote tecleado (R27, § 3.1).
- **QC-92 R26 y R28:** las dos guardias admiten un camino más, nombrado (R27).
- **QC-217 R1, R2, R5 y R17, y D9 (D13):** tercera pestaña, y el detalle abre `ENTREGADO` propio
  (R20, R21). «Terminados» sigue listando solo `TERMINADO`.
- **Fila sembrada «¿Se corrigen después de entregado?» (D13):** la corrección de un `ENTREGADO`
  se hace desde «Entregados», no desde «Terminados».

**Tests existentes que cambian:**

- `tests/unit/asignaciones/finish-conditioning.test.ts`: deps y casos nuevos;
- `tests/unit/asignaciones/get-conditioning-order.test.ts`: `batchData` y `ENTREGADO`;
- `tests/unit/asignaciones-ui/conditioning-order-screen.test.tsx` y `conditioning-order-page.test.tsx`;
- `tests/unit/asignaciones/order-conditioning-actions.test.ts`;
- `tests/unit/composition/asignaciones-facade.test.ts`: dos claves nuevas;
- `tests/unit/inventario/product-batches-panel.test.tsx`;
- `tests/unit/asignaciones/assignment-views.test.ts`.

**E2E existentes:** sin cambios de aserción (R29). El de QC-218 termina un pedido sin reparto (R17).

**Cruce con QC-223** (en vuelo, del mismo assignee). Comparten, según su `tasks.md`:

- `db/schema.prisma`;
- `lib/composition/index.ts`;
- `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts`;
- `lib/modules/inventario/index.ts`;
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`;
- `tests/guards/guard-libro-de-inventario.test.ts` y `guard-identificador-de-request.test.ts`;
- `tests/unit/inventario/qc91-alcance.test.ts` y `schema/inventario-schema.test.ts`;
- `tests/integration/aislamiento.json`.

Los dos tocan las guardias del libro: QC-223 añade su camino de entrega, y este, el de la etiqueta.
Lo comprueba `scripts/archivos-en-vuelo.mjs` en F2.0, y la segunda en mergear resuelve en F2.3.

**`docs/architecture.md`:** al cerrar, el punto 2 de las preguntas del dominio pasa QC-219 de «sin
implementar» a entregado. Se dice dónde vive el día de producción (D14). D10 deja la pregunta
abierta.

## 10. Dependencias de terceros

Ninguna (D12, R30). `Input`, `Button` y el selector de fecha nativo ya están. `zod` ya es del stack.
