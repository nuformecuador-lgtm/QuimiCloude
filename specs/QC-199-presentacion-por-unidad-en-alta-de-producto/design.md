# QC-199 — presentacion-por-unidad-en-alta-de-producto · design.md

> Base: `origin/dev` `76980fa0` (incluye QC-201). Abreviaturas: `pp` =
> `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`, `pcp` =
> `.../persistence/product-catalog-prisma.ts`, `pf` =
> `app/(private)/inventario/components/product-form.tsx`.

## 1. Punto de partida (verificado)

| Pieza | Hoy | Dónde |
|---|---|---|
| Formulario de alta | PRODUCT y PACKAGING piden presentación; `unitId` no viaja | pf:162-182, pf:420-441, pf:676-692, pf:721-727 |
| Acción | `presentationId` para PRODUCT y PACKAGING | `adapters/driving/product-actions.ts:132-141` |
| Esquema | `batchFieldsCommon.presentationId` obligatorio para PRODUCT y PACKAGING; todo `strictObject` | `domain/product-input.ts:146-153, 193-200, 229-240` |
| Servicio | el lote guarda `entrada.presentationId`; homónimo por nombre + unidad de la presentación | `domain/create-product.ts:111-128` |
| Escritura | `products.unit_id` sale de `presentations.unit_id` | pp:744-760 |
| Disparador | lote sin presentación pasa sin comprobar nada | `db/migrations/20260918130000_product_unit_and_stored_stock/migration.sql:70-102` (:82-87) |
| Vista de lotes | `unitId` = unidad de la presentación del lote | pp:872-899 (`BATCH_VIEW_SELECT`, `toBatchView`), pp:957 |
| Costeo | filtra `presentationId: { not: null }` y lee la unidad de la presentación | pcp:97-131, pcp:138-158 |

**El costeo es el agujero que esta ficha abre si no se toca.** `findAliveBatchesWithStock`
(pcp:150) descarta todo lote sin presentación. Un insumo nuevo, con lotes solo sin presentación,
no aportaría ningún lote a `findCostingBatches`, y entonces:

- `calculateIngredientsCost` (`pedidos/domain/order-cost.ts:163`) devuelve `null` porque lo
  cubierto queda por debajo de lo necesario: la cotización y el importe guardado del pedido
  (QC-141 D22, `resolveStoredOrderCost`) se quedan **sin importe**.
- `calculateLotIngredientsCost` cuenta ese ingrediente como **cero**: el coste del lote de producto
  terminado sale **más bajo de lo real**, sin aviso.

Por eso R17/R18 cambian el filtro y la fuente de la unidad (§5.2).

## 2. Modelo de datos y migración

Sin columnas nuevas. `product_batches.presentation_id` ya es anulable (`20260923140000`) y
`products.unit_id` ya existe (`20260918130000`). Sin cambios en `db/schema.prisma`.

Migración nueva, escrita a mano: `db/migrations/20261004170000_product_batches_require_product_unit/`.

`migration.sql` — `CREATE OR REPLACE FUNCTION product_batches_check_unit()` con este cuerpo (el
disparador `product_batches_check_unit_trigger` no se toca: sigue `BEFORE INSERT OR UPDATE OF
"product_id", "presentation_id"`):

```sql
DECLARE
  product_unit_id      UUID;
  product_type         "ProductType";
  presentation_unit_id UUID;
BEGIN
  SELECT parent."unit_id", parent."type" INTO product_unit_id, product_type
    FROM "products" AS parent
   WHERE parent."id" = NEW."product_id";

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW."presentation_id" IS NULL THEN
    IF product_type = 'PRODUCT' AND product_unit_id IS NULL THEN
      RAISE EXCEPTION
        'product_batches_product_without_unit: el lote % no tiene presentacion y su producto % no tiene unidad.',
        NEW."id", NEW."product_id"
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- a partir de aqui, el cuerpo vigente sin cambios (presentacion FOR SHARE, comparacion de unidad)
```

- Solo cambia la rama `presentation_id IS NULL`. La rama con presentación es la vigente, letra
  por letra (R13).
- Restringido a `type = 'PRODUCT'`: un instrumento no tiene unidad por diseño y sus lotes no llevan
  presentación; aplicar la regla a todos los tipos rompería su alta (R11, R13). Decisión del humano
  del 2026-10-04 (§9).
- Sin `UPDATE`, `DELETE` ni `INSERT` de datos, y sin tocar `presentations` (R15). No hace falta el
  paréntesis de `NO FORCE ROW LEVEL SECURITY`: no se lee ni se escribe ninguna fila al migrar. La
  función lee `products` igual que la vigente.

`down.sql` — `CREATE OR REPLACE FUNCTION product_batches_check_unit()` con el cuerpo **exacto** de
`20260918130000/migration.sql:70-98` (R14). Se revierte con `pnpm run db:rollback`.

## 3. Contratos de entrada

### 3.1 Esquema (`domain/product-input.ts`)

- `batchFieldsCommon` pierde `presentationId`. PACKAGING lo declara en su propia rama (sigue
  obligatorio, R11).
- La rama PRODUCT declara `unitId: z.string().uuid()` obligatorio, con el mensaje `Elige una unidad.`
  para «falta» y «forma inválida». Con `strictObject`, un `presentationId` en PRODUCT es
  `unrecognized_keys` → `invalid_input` (R6).
- MACHINE: sin cambios (sigue aceptando `presentationId` nullish).
- Se reescribe el comentario de :43-50 («el producto no declara unidad en el borde»), que deja de
  ser cierto, sin citar fichas (`docs/conventions.md > Comentarios`).

Forma resultante del alta de insumo:

```ts
{ name, type: 'PRODUCT', qtyAlert, stock, unitId, unitCost?, totalCost?, lot?, purchaseDate?, expiryDate? }
```

### 3.2 Acción (`adapters/driving/product-actions.ts`)

`buildCreateProductCandidate`: con `type === PRODUCT` lee `unitId` del `FormData` y no
`presentationId`; con PACKAGING sigue leyendo `presentationId`. Sin decisión propia: el servicio
valida.

## 4. Servicio (`domain/create-product.ts`)

Orden, sin cambios en lo que ya existe: permiso → zod → reloj/fecha → rama por tipo.

Rama PRODUCT nueva:

1. `deps.units.findRefs([entrada.unitId], scope.companyId)`. Vacío → `ValidationError` (R7). Es el
   contrato público de `unidades` (`UnitCatalog`), que ya devuelve solo «de la empresa o de
   sistema»; `inventario` no puede leer `units` con Prisma (guardia de módulos).
2. Lote con `presentationId: null` (R9, R10).
3. `deps.products.findAliveIdByNameInUnit(entrada.name, entrada.unitId, scope)` (puerto nuevo, §5.1).
4. Homónimo → `addBatchToAlive` (camino actual; rechazo de terminado incluido). Sin homónimo →
   `createWithFirstBatch({ name, qtyAlert, type: PRODUCT, unitId }, batch, …)`.

`CreateProductDeps` gana `units?: Pick<UnitCatalog, 'findRefs'>`. Sin él, el alta de insumo lanza
un `Error` de cableado (mismo criterio que `packageUnit` en :198-201). `lib/composition/index.ts`
cablea el `findRefs` del catálogo de unidades que ya se usa para `pedidos`/`recetas`.

La rama MACHINE sigue llamando a `findAliveIdByNameInPresentationUnit` (con `presentationId`
nullish, como hoy). PACKAGING no se toca.

## 5. Persistencia

### 5.1 `product-prisma.ts` y puerto `ports/product-repository.ts`

- **`findAliveIdByNameInUnit(name, unitId, scope)`**: mismo `where`, orden y desempate que
  `findAliveIdByNameInPresentationUnit` (pp:412-426), sin la lectura de la presentación. La
  existente se queda para MACHINE.
- **`NewProduct.unitId?: string`** (en `domain/product-view.ts`). `createWithFirstBatch` resuelve la
  unidad así: `packaging` → `packaging.unitId`; si no, `product.unitId` definido → ese; si no,
  `batch.presentationId` → unidad de la presentación (MACHINE con presentación, como hoy); si no,
  `null`. El primer paso y el último no cambian.
- **`translateBatchWriteError`**: reconoce también `product_batches_product_without_unit` (`23514`
  + identificador, mismo criterio que `isBatchUnitMismatchViolation`) → `ValidationError` (R12).
  Solo es alcanzable por un fallo de programación o una escritura fuera del servicio: el servicio
  siempre escribe la unidad antes del lote.
- **Vista de lotes** (R16): `BATCH_VIEW_SELECT` cambia `presentation: { select: { unitId } }` por
  `product: { select: { unitId: true } }`, y `toBatchView` lee `row.product.unitId`. Cubre
  `findBatchesOfAliveProduct` y `findBatchesOfOrder`. En `findBatchesOfOrder` (pp:957) se mantiene
  `presentation: { select: { name: true } }` solo para `presentationName`, que es el nombre del
  envase del lote de producto terminado y no una unidad.
  - Efecto por tipo: insumo con o sin presentación → unidad del producto (cambio buscado); terminado
    → unidad del producto, que el disparador ya obliga a coincidir con la de su presentación;
    envase con presentación fija → hoy `null` y el panel cae a `product.unitId`
    (`product-batches-panel.tsx:166-167`), ahora llega directo: mismo texto; instrumento → `null`
    como hoy.
  - El comentario de `ProductBatchView.unitId` (`domain/product-batch-view.ts:5`) pasa a decir
    «unidad del producto».

### 5.2 Costeo (`product-catalog-prisma.ts`) — R17, R18

`findAliveBatchesWithStock`, filtro nuevo:

```ts
{
  productId: { in: [...ids] },
  stock: { gt: 0 },
  unitCost: { not: null },
  product: { deletedAt: null, unitId: { not: null } },
  OR: [{ presentationId: { not: null } }, { product: { type: PRODUCT_TYPES.PRODUCT } }],
}
```

- El `OR` deja el conjunto de antes **más** los lotes de insumo sin presentación, y nada más:
  envases (lotes sin presentación) e instrumentos siguen fuera, terminados (lotes con presentación)
  siguen dentro (R18).
- `COSTING_BATCH_SELECT` pasa a `product: { select: { unitId: true } }`; `toCostingBatch` lee
  `row.product.unitId` y lanza si es `null` o si `unitCost` es `null` (no ocurre por el filtro).
- `CostingBatch` y `pedidos` no cambian: el contrato ya lleva `unitId` por lote.

## 6. Interfaz (`app/(private)/inventario/components/`)

- `ProductFieldName` gana `unitId`; `FIELD_LABELS.unitId = 'Unidad'`;
  `FIELD_MESSAGES.unitId = 'Elige una unidad.'`.
- `shouldShowField`: `presentationId` solo para PACKAGING; `unitId` solo para PRODUCT (R1, R3).
- El campo «Unidad» reutiliza `components/shared/presentation-unit-select.tsx` en modo no
  controlado, con `name="unitId"`, las unidades de §6.1 (bajan por props desde `page.tsx` →
  `ProductSheet` → `ProductForm`), `defaultValue` = lo escrito tras un fallo o la unidad del insumo elegido como
  plantilla, y `key` de remontaje como hoy hace `PresentationSelect` (pf:678). No ofrece «sin
  unidad» ni texto libre (R2). Helper: «La unidad en que se cuenta este insumo. Todos sus lotes se
  registran en ella.»
- `save` (pf:420-441): rama PRODUCT envía `unitId` y no `presentationId`; PACKAGING envía
  `presentationId`. Un error de zod en `unitId` cae en ese campo (R4).
- Plantilla (R5): `ProductNameOption` gana `unitId?: string | null`; `product-name-picker.tsx`
  lo copia de `item.unitId` (`ProductView` ya lo trae). `applyTemplate` lo guarda y el selector se
  remonta con él.
- El comentario «AQUI IBA LA UNIDAD» (pf:721-727) y los de :649-668 que dicen que la presentación
  es obligatoria para todos se reescriben o se quitan.
- Edición: sin cambios (no muestra ni envía unidad).

### 6.1 Unidades del formulario con `inventario.modificar` (R20)

Hoy el formulario recibe `units` de `listUnitsAction()` (`app/(private)/inventario/page.tsx:70-74`),
que exige `unidades.consultar` (`lib/modules/unidades/domain/list-units.ts:108`). Decisión del humano:
el alta las trae con su propio permiso.

- **`unidades`**: `UnitCatalog` (contrato público, `domain/unit-catalog.ts`) gana
  `listVisibleRefs(companyId): Promise<readonly UnitRef[]>`: todas las unidades de la empresa más
  las de sistema, con la misma definición de ámbito que ya usa el adaptador
  (`unit-prisma.ts:138`), orden por nombre. Lo implementa `unit-catalog-prisma.ts` (el único que
  puede tocar `prisma.unit`). Es un servicio entre módulos: no comprueba permisos, igual que
  `findRefs`.
- **`inventario`**: caso de uso nuevo `domain/list-product-form-units.ts`:
  `requirePermission(actor, 'inventario.modificar')` primero y después `deps.units.listVisibleRefs`.
  Server Action `listProductFormUnitsAction()` en `adapters/driving/` (mismo patrón
  actor → caso de uso → `toErrorState` que `product-actions.ts`). Cableado en `lib/composition`.
- **Página**: `page.tsx` llama a la acción nueva junto a `listUnitsAction()` (en el mismo
  `Promise.all`). Las unidades del formulario salen de la nueva; las etiquetas del listado siguen
  saliendo de `listUnitsAction()`, sin cambios. `ProductSheet` y `ProductForm` reciben la lista
  nueva por la prop `formUnits` (la prop `units` sigue para el alta rápida de presentación del
  envase). Si la acción falla, el formulario se pinta con el selector vacío y el envío lo rechaza
  el esquema (R4).
- Alternativa descartada: relajar `listUnits` para aceptar `inventario.modificar`. Haría que
  `unidades` conociera permisos de otro módulo y abriría la pantalla de unidades entera, con
  filtros y paginación, a quien solo debería ver la lista del selector.

## 7. Integraciones y permisos

Sin integraciones externas. Permiso `inventario.modificar` en `createCreateProduct` (:93), antes de
todo (R8). No hay dependencias nuevas.

## 8. Alternativas descartadas

1. **Seguir guardando una presentación «técnica» por unidad** (crear o reutilizar una presentación
   sin contenido por cada unidad y colgar de ella el lote). Evitaría tocar el costeo y la vista de
   lotes, pero contradice la decisión cerrada «el lote solo lleva la cantidad en la unidad del
   producto», llena `presentations` de filas que nadie eligió y mezcla esas filas con las reales en
   el selector de envases y de proveedores.
2. **Endurecer el disparador para todos los tipos** («lote sin presentación ⇒ producto con unidad»).
   Más simple, pero rechaza todo lote de instrumento, que no tiene unidad por diseño (R11, R13).
3. **Quitar el filtro de presentación del costeo sin más** (`product.unitId not null`). Dejaría
   entrar los lotes de envase en `ProductCatalog.findCostingBatches` si algún llamante le pasa un
   id de envase; hoy no los ve. El `OR` del §5.2 no cambia nada fuera de los insumos.
4. **Un selector de unidad nuevo** o el `UnitSelect` de proveedores. El de proveedores tiene como
   API la opción «sin unidad», que aquí está prohibida (R2); uno nuevo duplicaría
   `PresentationUnitSelect`, que ya es `shared`, ya no ofrece «sin unidad» y ya admite `name`.

## 9. Decisiones del humano sobre las preguntas del diseño (2026-10-04)

Ya no queda ninguna pregunta abierta. Las tres están también en la tabla de decisiones de
`requirements.md`.

- **Unidades sin `unidades.consultar`.** El formulario trae las unidades con `inventario.modificar`.
  Se hace como describe §6.1 (R20, T14).
- **Alcance del control de la base.** Solo se aplica a insumos (`PRODUCT`), como describe §2.
  Instrumentos (`MACHINE`) y el resto de tipos siguen como hoy (R12, R13).
- **Lotes con unidad de presentación distinta de la del producto.** La migración `20260918130000`
  no partió los productos cuyos lotes ya mezclaban unidades (:24-27). Antes de cambiar las
  lecturas (T6, T7), T0 cuenta en la base los lotes **vivos** que tienen presentación y cuya
  `presentations.unit_id` no coincide con `products.unit_id`. Si hay alguno, el implementer
  **para** y devuelve al humano la lista con producto, lote, unidad del producto y unidad de la
  presentación. Si no hay ninguno, sigue. Consulta de referencia:

  ```sql
  SELECT b."company_id", p."id" AS product_id, p."name", b."id" AS batch_id, b."lot",
         p."unit_id" AS product_unit_id, pr."unit_id" AS presentation_unit_id, b."stock"
    FROM "product_batches" b
    JOIN "products" p       ON p."id" = b."product_id" AND p."deleted_at" IS NULL
    JOIN "presentations" pr ON pr."id" = b."presentation_id"
   WHERE p."unit_id" IS DISTINCT FROM pr."unit_id";
  ```

  Aquí, «vivo» quiere decir que el producto no está borrado. Los lotes con existencia 0 también
  entran en la cuenta, porque se ven en el panel.
