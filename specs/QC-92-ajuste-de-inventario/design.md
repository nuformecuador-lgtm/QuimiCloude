# QC-92 — ajuste-de-inventario · design.md

> Rama `feature/QC-92-ajuste-de-inventario`, desde `origin/dev` en `b579707` (contiene QC-91,
> QC-50, QC-63 y QC-103). Todo `archivo:línea` de este documento está **medido sobre ese árbol**;
> si una tanda mueve líneas, el número envejece y el nombre del símbolo es lo que manda.

---

## 1. El censo: quién toca hoy `product_batches`

Esto es lo que decide si las tasks son diez o treinta. Está medido, no supuesto: barrido de
`productBatch\.`, `product_batches` y `ProductBatch` sobre el worktree entero, separando producción
de tests, E2E y migraciones.

### 1.1 Escrituras de producción — **hay exactamente dos, y las dos son `create`**

| # | `archivo:línea` | Qué hace | Qué le pasa en QC-92 |
|---|---|---|---|
| 1 | `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:503` | `tx.productBatch.create` dentro de `createWithFirstBatch` (producto nuevo + su primer lote, misma transacción) | **Gana su asiento de alta** en la misma `tx` (R12) |
| 2 | `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:542` | `tx.productBatch.create` dentro de `addBatchToAlive` (lote sobre un producto que ya existe) | **Gana su asiento de alta** en la misma `tx` (R12) |

**No hay ninguna tercera.** No existe hoy ningún `productBatch.update`, `updateMany`, `delete`,
`deleteMany` ni `upsert` en producción, ni ningún `UPDATE`/`DELETE` crudo sobre la tabla; lo afirma
en positivo la guardia R21 de QC-91 (`tests/unit/inventario/qc91-alcance.test.ts:361-373`) y lo
confirma el barrido. **Este censo es la razón por la que la ficha es abordable**: el libro nace con
dos asientos de alta que cablear y un camino de ajuste nuevo, no con un rastreo por todo el módulo.

### 1.2 Lo que rodea a esas dos escrituras y hay que tocar o leer

| `archivo:línea` | Qué es | Efecto |
|---|---|---|
| `…/product-prisma.ts:335-358` | `toBatchCreateData`, **único** constructor del `data` de las dos creaciones | Se reutiliza tal cual; no cambia |
| `…/product-prisma.ts:447-479` | `writeBatchWithLotRetry`: abre `prisma.$transaction`, reintenta el lote generado | **Es la transacción** dentro de la cual entra el asiento. No se toca su lógica de reintento |
| `…/product-prisma.ts:301-328` | `resolveLot`: `$executeRaw` del advisory lock + `$queryRaw SELECT max(lot)` | **Lectura**, no escritura. Intacto |
| `…/product-prisma.ts:482-510` | `createWithFirstBatch` | Añade el asiento tras la línea 503 |
| `…/product-prisma.ts:516-549` | `addBatchToAlive` | Añade el asiento tras la línea 542 |
| `lib/modules/inventario/ports/product-repository.ts:90`, `:115` | Firmas de las dos operaciones del puerto | No cambian de forma; lo que cambia es lo que escriben |
| `lib/modules/inventario/domain/create-product.ts:112`, `:129` | Los dos llamantes del dominio | Sin cambio: el asiento es del adaptador, dentro de la misma `tx` |
| `lib/modules/inventario/domain/product-batch.ts:2-25` | `NewProductBatch` (`stock`, `unitCost`, `lot`, `purchaseDate`, `expiryDate`, `createdBy`) | Sin cambio |

### 1.3 Lecturas de producción de `product_batches` (ninguna escribe)

| `archivo:línea` | Qué lee |
|---|---|
| `…/product-prisma.ts:34-48` | `BATCH_STOCK_BY_UNIT` + `PRODUCT_SELECT`: los lotes del producto con `stock` y `presentation.unitId` |
| `…/product-prisma.ts:52-65` | `toProductView`: `stockByUnit` por `sumStockByUnit`, y `latestBatchUnitId` |
| `…/product-catalog-prisma.ts:40-90` | `findProductRefs`: mismos lotes, misma suma |
| `…/presentation-prisma.ts:35-38`, `:80`, `:248` | Solo comentarios: la protección real es el `RESTRICT` de la FK |

`lib/modules/inventario/adapters/driven/persistence/company-scope.ts:44-55` deja escrito que **no
hay envoltura de `where` de lote** y que el día que haga falta se reintroduce «con su consumidor en
la misma tanda». **Ese día es este**: QC-92 es el primer consumidor que **lee** lotes por su cuenta
(el panel) y el primero que **actualiza** uno.

### 1.4 Fuera de producción (no se tocan, se citan para que nadie los busque)

`e2e/inventario.spec.ts:332-340`, `:413-420`, `:565`, `:631`, `:699`, `:747`;
`e2e/aislamiento-inventario.spec.ts:139`, `:175`, `:239`;
`tests/integration/unidades/unidades-constraints.int.test.ts:204`, `:716`;
las migraciones `20260909120000_product_batches`, `20260911130000_inventory_company_scope`,
`20260913120000_product_batch_lot_and_purchase_date`.

### 1.5 Lo que se verificó del modelo antes de apoyarse en él

`db/schema.prisma:292-320`, comprobado: `ProductBatch` tiene `stock Int`, `lot String`,
`purchaseDate DateTime @db.Date`, `expiryDate DateTime?`, `companyId`, `createdBy`/`updatedBy`
anulables y `createdAt`/`updatedAt`. El `CHECK (stock >= 0)` es
`product_batches_stock_non_negative`, creado en
`db/migrations/20260909120000_product_batches/migration.sql:57`. La RLS `ENABLE` + `FORCE` sin
policies está en `:65-66` de esa misma migración. **Todo confirmado en disco.**

---

## 2. Modelo de datos

### 2.1 `inventory_movements` (tabla nueva, módulo `inventario`)

```
inventory_movements
  id             UUID PK  DEFAULT gen_random_uuid()
  batch_id       UUID NOT NULL   FK -> product_batches(id) ON DELETE RESTRICT ON UPDATE CASCADE
  kind           TEXT NOT NULL   -- 'opening' | 'adjustment'
  quantity       INTEGER NOT NULL -- con signo; el alta escribe el stock inicial
  reason         TEXT NULL        -- solo en 'adjustment'
  company_id     UUID NOT NULL   FK -> companies(id) ON DELETE RESTRICT ON UPDATE CASCADE
  created_by     UUID NULL       FK -> users(id) ON DELETE RESTRICT ON UPDATE CASCADE
  created_at     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
```

- **Sin `updated_at` y sin `deleted_at`, a propósito (R15).** Un asiento no se corrige: se corrige
  con otro asiento. `docs/architecture.md > Dominio` n.º 3 prohíbe el borrado físico en tablas
  transaccionales; aquí el libro directamente no ofrece la vía.
- **`quantity` es `INTEGER`**, no decimal: la existencia es entera desde QC-14 y
  `product_batches.stock` es `Int`. Un asiento decimal no podría cuadrar con la columna que explica.
- **`kind` y `reason` nacieron `TEXT`, no `enum` de Postgres.** Ver §2.2.
  **ENMENDADO EL 2026-09-18** (`requirements.md > Enmienda del 2026-09-18`, R35/R36): `kind`
  **pasa a enum de Postgres** (`InventoryMovementKind`, con `opening` y `adjustment` y nada
  más) y `reason` **sigue siendo `TEXT`** pero gana el CHECK
  `inventory_movements_reason_in_catalog` con la lista escrita. Lo hace una **migración
  aparte**: el `migration.sql` de arriba no se toca.
- **`created_by` anulable** por el mismo criterio que `product_batches.created_by`: NULL significa
  «no lo hizo una persona». En esta ficha siempre viene relleno, porque no hay proceso automático.
- **Índices**: `inventory_movements_batch_id_idx` (el historial de un lote y la verificación del
  `RESTRICT`), `inventory_movements_company_id_idx`, `inventory_movements_created_by_idx`. Postgres
  no indexa el lado hijo de una FK, y por `batch_id` pasa la consulta caliente del panel.
- **CHECK `inventory_movements_quantity_not_zero`**: `quantity <> 0` (R3).
- **CHECK `inventory_movements_reason_matches_kind`**:
  `(kind = 'adjustment' AND reason IS NOT NULL) OR (kind = 'opening' AND reason IS NULL)` — R10 en
  la base, mismo patrón que `orders_cancellation_reason_matches_status`.
- **RLS `ENABLE` + `FORCE`, sin policies** (R17): el molde literal de `product_batches`
  (`20260909120000_product_batches/migration.sql:65-66`) y de `recipes`
  (`20260916120000_recipes_company_scope/migration.sql:172-173`).
- **Disparador `inventory_movements_check_company`** (R19): copia estructural de
  `product_batches_check_company`
  (`20260911130000_inventory_company_scope/migration.sql:279-316`). `BEFORE INSERT` —no `UPDATE`,
  porque no hay `UPDATE`—, con `RAISE EXCEPTION` que escribe el identificador
  `inventory_movements_company_differs_from_batch` en el mensaje, para que el adaptador lo reconozca
  **por identificador y no por texto traducible**, igual que
  `product-prisma.ts:387-406`.
- `/// @module inventario` obligatorio en el modelo (`docs/architecture.md > Migraciones up/down`).

**Por qué `company_id` propio y no derivado del lote.** Es la misma razón que ya está escrita para
`product_batches` (`db/schema.prisma:285-290`): el ámbito tiene que poder entrar en el `where` de la
consulta del historial **sin JOIN**, y `docs/architecture.md > Dominio` n.º 1 exige columna de
empresa en toda tabla de operación nueva. La coherencia con la del lote la garantiza el disparador,
no el código de la aplicación. `OrderAssignment` (`db/schema.prisma:519-532`) es el precedente de
tabla nueva nacida con su `company_id`.

### 2.2 El motivo: conjunto cerrado que crece sin migrar (R8, R9, D5)

> **ENMENDADO EL 2026-09-18 — léelo antes que el resto de esta sección.**
> `requirements.md > Enmienda del 2026-09-18` **enmienda D5** y reescribe R9. La columna sigue
> siendo `TEXT` y la definición sigue siendo **una sola en el dominio**, pero la base gana un
> **CHECK con la lista**, así que **añadir un motivo ya NO es «una línea»: cuesta una migración**.
> El humano lo decidió con ese coste delante. El párrafo de abajo que dice «Añadir un motivo es
> **una línea**: ninguna migración» **dejó de ser cierto ese día** y se conserva para que se vea
> qué se cambió y por qué.
> La contrapartida es que la lista vive en **dos sitios** —`MOVEMENT_REASONS` y el CHECK—, y eso lo
> cierra la guardia de igualdad exacta que exige **R37** (`tests/guards/`, no `tests/unit/`).

El conjunto vive en **una sola definición del dominio**:

```ts
// lib/modules/inventario/domain/movement-reason.ts
export const MOVEMENT_REASONS = ['merma', 'rotura', 'conteo_fisico', 'error_de_carga'] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];
```

zod la consume en el borde del caso de uso (`z.enum(MOVEMENT_REASONS)`), y la columna es `TEXT`.
Añadir un motivo es **una línea**: ninguna migración, ninguna fila persistida tocada, y los asientos
viejos siguen agrupándose por su código. Es exactamente lo que pide R10 de la feature 4 llevado a su
forma más barata, y el mismo mecanismo con que este repo mantiene `ERROR_CODES`
(`lib/modules/errores/domain/error-codes.ts:9-59`).

**Coste dicho en voz alta:** la base no valida el valor del motivo. Se acepta porque el único camino
de escritura de datos es Prisma a través del repositorio
(`docs/architecture.md > Acceso a datos y autorizacion`, punto 4) y porque la alternativa que sí lo
valida rompe D5 (ver §6).

### 2.3 Migración

`db/migrations/<timestamp>_inventory_movements/` con `migration.sql` **escrito a mano** —Prisma no
modela CHECK, RLS ni disparadores, y las FK a `users` y `companies` son drift a propósito— y su
**`down.sql`** (R31), que revierte en orden inverso: `DROP TRIGGER`, `DROP FUNCTION`, `DROP INDEX`
×3, `DROP CONSTRAINT` de las FK y los CHECK, `DROP TABLE`. La tabla nace vacía, así que el `down`
no tiene pérdida de datos que declarar más allá de los asientos escritos después del `up`.

---

## 3. El punto de corte del libro y el cuadre (R29, R30, D9)

El libro empieza hoy. Los lotes anteriores **no llevan asiento y nunca lo llevarán**, así que
`stock = Σ asientos` es falso para ellos por construcción y sería un falso rojo permanente.

**El corte se escribe una vez**, como constante del módulo con el valor del `timestamp` de la
migración de §2.3:

```ts
// lib/modules/inventario/domain/movement-ledger.ts
export const LEDGER_START = '<timestamp de la migración>';
```

- **Lotes con `created_at >= LEDGER_START`:** `stock` DEBE ser igual a la suma de sus asientos. Es
  lo que comprueba el test de integración de R29.
- **Lotes con `created_at < LEDGER_START`:** **exceptuados, de forma permanente**. La excepción y su
  razón van escritas en el propio test, no en un JSON de configuración (R30).

**Y lo que la excepción deja descubierto, dicho:** un lote anterior al corte que se ajuste sin
asiento no lo caza el cuadre. Lo que lo caza es la **guardia de fuente** de R28 (§5.2), que no mira
datos sino caminos de escritura y por eso no depende de cuándo nació el lote. Las dos juntas son la
respuesta a D12; ninguna de las dos sola lo es.

**Por qué el corte es la fecha y no «tiene cero asientos».** La regla barata —«un lote sin ningún
asiento está exceptuado»— tiene un agujero real: un camino que olvide su asiento sobre un lote
antiguo lo deja en cero asientos y por tanto **permanentemente exceptuado**, que es justo el fallo
que D12 manda vigilar. La fecha no tiene ese agujero.

---

## 4. Rutas, contratos y capas

### 4.1 Dominio (`lib/modules/inventario/domain/`)

| Archivo | Qué |
|---|---|
| `movement-reason.ts` | `MOVEMENT_REASONS`, `MovementReason` (§2.2) |
| `movement-ledger.ts` | `LEDGER_START` (§3) |
| `inventory-movement.ts` | `InventoryMovementView { id, kind, quantity, reason, authorName, createdAt }` y `NewInventoryMovement` |
| `product-batch-view.ts` | `ProductBatchView { id, lot, stock, unitId, purchaseDate, expiryDate }` para el panel (R22) |
| `adjust-batch-stock.ts` | **El caso de uso.** `requirePermission(actor, 'inventario.modificar')` como primera línea (R20), luego zod, luego el puerto |
| `list-product-batches.ts` | `requirePermission(actor, 'inventario.consultar')` (R21) |
| `list-batch-movements.ts` | `requirePermission(actor, 'inventario.consultar')` (R21) |

`adjust-batch-stock.ts` **no calcula el nuevo total y lo escribe**: pide al puerto un ajuste
relativo, y el puerto lo resuelve con un `UPDATE … SET stock = stock + $delta` condicionado. Si el
dominio leyera el stock y escribiera el total, dos ajustes concurrentes se pisarían el último
escrito, que es exactamente el bug que esta ficha existe para quitar.

### 4.2 Puerto (`ports/product-repository.ts`, ampliado)

```ts
adjustBatchStock(
  batchId: string,
  delta: number,
  reason: MovementReason,
  actorId: string,
  now: Date,
  scope: InventoryScope,
): Promise<{ stock: number } | null>;   // null = el lote no existe en esta empresa (R18)

findBatchesOfAliveProduct(productId: string, scope: InventoryScope): Promise<readonly ProductBatchView[]>;
findBatchMovements(batchId: string, scope: InventoryScope): Promise<readonly InventoryMovementView[] | null>;
```

La empresa **no viaja** en ningún tipo de entrada, igual que no viaja en `NewProduct` ni en
`NewProductBatch` (`ports/product-repository.ts:42`): lo que no está en el tipo no se puede elegir
desde fuera.

### 4.3 Adaptador driven (`adapters/driven/persistence/`)

- **`batch-movement-prisma.ts`** (archivo nuevo): las lecturas del historial y el escritor del
  asiento, `writeMovement(tx, …)`, que reciben la `tx` desde fuera para que el asiento **no pueda**
  escribirse en otra transacción que la de su movimiento (R6, R12).
- **`product-prisma.ts`**: `createWithFirstBatch` y `addBatchToAlive` llaman a `writeMovement` tras
  su `create` (líneas 503 y 542 del censo), dentro de la `tx` que ya abre `writeBatchWithLotRetry`.
  Se apoya en la nota **driven → driven del mismo módulo** de
  `docs/architecture.md > Modulos y arquitectura hexagonal` (QC-9): está permitido.
- **`adjustBatchStock`** vive en `product-prisma.ts` y es **la única** función del repositorio que
  llama a `tx.productBatch.update(...)` (R26). Forma:

  ```
  prisma.$transaction:
    UPDATE product_batches SET stock = stock + $delta, updated_by = $actor, updated_at = $now
     WHERE id = $batchId AND company_id = $companyId
     RETURNING stock                     -- 0 filas => lote ajeno o inexistente => null (R18)
    INSERT INTO inventory_movements (...)  -- mismo tx (R6)
  ```

  El `CHECK (stock >= 0)` es quien rechaza el negativo (R4, R5): llega como `23514` con el nombre
  `product_batches_stock_non_negative`, y el adaptador lo traduce **por el nombre de la
  restricción**, no por el texto del mensaje —el criterio ya escrito en `product-prisma.ts:394-406`.
  La aplicación **también** lo comprueba antes, para dar un mensaje útil; la garantía dura sigue
  siendo la base.

- **`company-scope.ts`**: se **reintroduce** `batchCompanyScope(scope): Prisma.ProductBatchWhereInput`
  y nace `movementCompanyScope(scope): Prisma.InventoryMovementWhereInput`, las dos delegando en
  `companyScope`, con su consumidor en la misma tanda — que es exactamente la condición que el
  propio archivo dejó escrita en `:52-55`.

### 4.4 Adaptador driving

`adapters/driving/batch-actions.ts` (`'use server'`), con `adjustBatchStockAction`,
`listProductBatchesAction` y `listBatchMovementsAction`. Resuelven el actor con el **mismo**
`runInRequestScope(() => Promise.all([getSessionUser(), getSessionContext()]))` de
`product-actions.ts:68-80`: son acciones con **las dos caras de la sesión**, así que caen bajo el
conteo de QC-104 y tienen que quedar **en la lista de esa guardia**, que se lee del disco recorriendo
`adapters/driving/` en profundidad (`docs/architecture.md > Permisos y autenticacion`). **Esto es una
trampa conocida: si no se anotan, el gate se pone rojo en un test que no habla de esta ficha.**

No hay Route Handler: son mutaciones y lecturas internas
(`docs/architecture.md > Server Actions vs Route Handlers`).

### 4.5 UI (`app/(private)/inventario/components/`)

Ruta **sin pantalla nueva**: el panel cuelga del listado que ya existe (`page.tsx`, D7).

| Archivo | Qué |
|---|---|
| `product-batches-panel.tsx` | Lista de lotes del producto: número, cantidad + unidad, fecha de compra (R22) |
| `batch-history.tsx` | Despliegue por lote: motivo, autor, fecha (R23), y el texto propio del lote sin asientos (R24) |
| `adjust-batch-dialog.tsx` | Cantidad con signo + motivo del conjunto cerrado (R2, R8). Solo se ofrece con `inventario.modificar` (R21) |
| `index.ts` | El barrel de la ruta los reexporta los tres (obligatorio, `docs/architecture.md > Componentes`) |

Todo lo sensible entra **por props** desde el Server Component; ningún componente de cliente importa
`lib/composition` ni un driven.

**Cantidad con unidad (R22).** El anti-patrón «cantidad sin unidad de medida» está vigente mientras
la pregunta abierta 1 del dominio no se cierre en `null`. La unidad del lote se deriva de su
presentación (`presentation.unitId`), que es de lo que ya tira `BATCH_STOCK_BY_UNIT`
(`product-prisma.ts:34-38`). El panel la muestra; **no convierte** —convertir es QC-63, fuera de
alcance por el bloque «Lo que NO entra».

---

## 5. Las dos guardias

### 5.1 El ajuste de la guardia R21 de QC-91 (R26, R27, D13)

Hoy `tests/unit/inventario/qc91-alcance.test.ts:361-373` afirma dos cosas sobre `product-prisma.ts`:
`escrituraDestructivaDeLotes(...)` vacío, y `not.toMatch(/tx\.productBatch\.(?:update|…)\s*\(/)`.
QC-92 rompe las dos.

**Lo que se hace, y lo que NO.** No se borra el `describe`, no se borra el detector y no se relaja a
«cualquier cosa vale»:

1. `escrituraDestructivaDeLotes` conserva **íntegras** las ramas de `delete`, `deleteMany`, `upsert`,
   `DELETE` crudo y `UPDATE` crudo. La rama de `update` deja de ser un hallazgo *del archivo* y pasa
   a ser un hallazgo *fuera de la función admitida*.
2. Se añade un extractor que aísla el cuerpo de `adjustBatchStock` con `cuerpoDeFuncion` —el que ya
   existe en `:114-132`— y la afirmación pasa a ser: `product-prisma.ts` **menos** ese cuerpo no
   contiene ningún `productBatch.update(`.
3. **Nota fechada** encima del `describe`: qué ficha lo cambió, cuándo, y qué sigue prohibido. El
   precedente es `dfe1a9a` (la guardia de `recetas-ui` acotada en QC-91) y su verificación en
   `progress/review_QC-91-existencia-por-lote.md:176-191`.
4. **Prueba por mutación** (R27), con fuentes fabricadas en el mismo archivo —el estilo que ya usa
   `:375-391`—: un `update` dentro de `adjustBatchStock` da verde; el **mismo** `update` en otra
   función da rojo; `delete`, `deleteMany` y el SQL crudo siguen dando rojo.

Se descarta **invertir** la afirmación («ahora sí tiene que haber un `update`»): fijaría un estado
que otra ficha puede cambiar legítimamente, que es el error que el reviewer de QC-91 evitó al borrar
en vez de invertir (`review_QC-91…:167-174`).

### 5.2 La guardia de la divergencia (R28, D12)

`tests/guards/guard-libro-de-inventario.test.ts`. **En `tests/guards/` y no en `tests/unit/`**
porque no la selecciona ningún grafo de imports: es un barrido de fuentes, como
`guard-aislamiento-integracion.test.ts` (`docs/verification.md:199-206`).

Qué afirma, **en positivo**:

1. El censo de caminos de escritura de `product_batches` bajo `lib/` es **exactamente** el conjunto
   nombrado `{ createWithFirstBatch, addBatchToAlive, adjustBatchStock }`. Si aparece un cuarto —o
   un `productBatch.create` en un archivo que no sea `product-prisma.ts`—, rojo.
2. El cuerpo de **cada uno** de los tres contiene una llamada a `writeMovement(`. Si una tanda añade
   un camino de escritura sin asiento, rojo antes de que llegue a la base.
3. Sus propios detectores, probados con fuentes fabricadas (mismo estilo que §5.1).

**Lo que esta guardia NO puede ver, escrito para que nadie la sobreestime:** que `writeMovement` se
llame con la `tx` correcta y con el mismo delta que el `UPDATE`. Eso lo cubre el test de integración
del cuadre (R29), no ella.

---

## 6. Alternativas descartadas

**1. El motivo como catálogo en tabla (`inventory_movement_reasons`), calcado de `document_types`.**
Es el molde literal que cita D5 y el primero que se consideró. **Descartado** por una colisión con
`docs/architecture.md > Dominio` n.º 1: toda tabla de negocio nueva nace con columna de empresa, y la
lista de exentas es «corta y cerrada» —`users`, `roles`, `document_types`—. Un catálogo de motivos
**del sistema** no tiene empresa, así que o se añade a una lista que el documento declara cerrada, o
se le pone una `company_id` que no significa nada. El coste de la alternativa elegida es menor que
el de tocar esa regla en una ficha que no es de aislamiento.

**2. El motivo como `enum` de Postgres.** Es lo que hace `OrderStatus`, y `db/schema.prisma:77` dice
por qué: «el conjunto es cerrado a propósito y añadir un valor **es una migración**». Eso es
literalmente lo que D5 descarta («crece sin migrar lo ya guardado»). **Descartado.**

**3. Dejar el lote inmutable y derivar la existencia de lote + movimientos.** Ya está descartado por
el humano en D3 y se anota aquí para que no vuelva por la puerta de atrás: dejaría la existencia en
dos sitios y el `CHECK (stock >= 0)` sin poder garantizar el total.

**4. Un disparador de base que escriba el asiento solo, en cada `INSERT`/`UPDATE` de
`product_batches`.** Es tentador: cerraría D12 por construcción y ninguna feature futura podría
olvidarse. **Descartado** por dos razones medidas. (a) El autor: un disparador no sabe **quién** hizo
el movimiento —Prisma se conecta como dueño de las tablas y `auth.uid()` es NULL
(`docs/architecture.md > Acceso a datos y autorizacion`)—, así que `created_by` saldría NULL siempre
y R11 no se cumpliría. (b) El motivo: tampoco lo sabría, y R8 lo exige. Habría que pasarlo por una
variable de sesión, que es un canal invisible y sin tipos. La guardia de fuente (§5.2) da la misma
protección con la información completa.

**5. Que el ajuste reciba el nuevo total del lote en vez del delta.** Es lo que hace hoy cualquier
edición de campo y lo que la ficha viene a quitar («en vez de sobrescribir un número a ciegas»).
Además pierde ante la concurrencia: dos ajustes simultáneos se pisan y el libro registra dos
movimientos cuya suma no explica el resultado. **Descartado**; entra el delta (R2), y el `UPDATE` es
relativo (§4.3).

**6. Una pantalla propia de ajustes con búsqueda e histórico global.** Fuera de alcance por el
bloque «Lo que NO entra» de la semilla. Se anota porque es la forma en que esta feature crecería
sola si nadie lo dice.

---

## 7. Catálogo de errores: **séptima enmienda**, sujeta a aprobación

El catálogo es cerrado y su propio archivo exige escribir la enmienda y que la apruebe el humano
(`lib/modules/errores/domain/error-codes.ts:1-8`; la sexta fue `batch_duplicate_lot`, QC-81). QC-92
propone **dos** códigos (R32):

| Código | Por qué no vale uno existente |
|---|---|
| `batch_not_found` | El lote pedido no existe **o es de otra empresa** (R18). `product_not_found` mentiría sobre qué no se encontró, y el panel necesita distinguir «este lote ya no está» de «este producto no está» |
| `batch_stock_negative` | El ajuste dejaría el lote bajo cero (R4). `invalid_input` es correcto de tipo pero inútil de mensaje: la entrada tiene forma válida y lo que falla es el **estado**, exactamente el mismo argumento con que se aceptó `batch_duplicate_lot` |

**Plan B, si el humano no aprueba la enmienda** (mismo formato con que QC-81 declaró el suyo):
`batch_not_found` cae a `product_not_found` y `batch_stock_negative` a `invalid_input`. **Coste que
se paga:** el panel pierde la distinción entre lote y producto, y el mensaje de «te pasaste
restando» queda como «entrada no válida», que es lo que el usuario no puede accionar. Ningún
requisito se cae; solo empeora el mensaje.

---

## 8. Dependencias

**Ninguna nueva** (R33, D16). Todo lo que hace falta está en el stack: zod para el borde, Prisma
para la transacción, shadcn/ui para el panel y el diálogo. Si en la implementación apareciera una
candidata, **se para** y se sube al humano con los cuatro checks
(`docs/architecture.md > Dependencias de terceros`); no se instala.

---

## 9. Verificación

- **Gate:** `./init.sh --rapido` por tanda; `./init.sh` completo para cerrar y antes del PR.
- **E2E (R34, D15): `init.sh` NO corre Playwright.** `e2e/ajuste-de-inventario.spec.ts` se corre **a
  mano** y su resultado se anota en `progress/impl_QC-92-ajuste-de-inventario.md`. El gate en verde
  **no** lo acredita.
- **Integración:** el archivo nuevo bajo `tests/integration/**` necesita su fila en
  `tests/integration/aislamiento.json` con `transaccion` o `commit` (+ `motivo` y `desde`), o
  `guard-aislamiento-integracion.test.ts` pone el gate rojo (`docs/verification.md:199-206`).
- **Trazabilidad:** el mapa `R1..R34 -> test` va en `progress/impl_QC-92-ajuste-de-inventario.md`
  (`CHECKPOINTS.md > Trazabilidad`).
