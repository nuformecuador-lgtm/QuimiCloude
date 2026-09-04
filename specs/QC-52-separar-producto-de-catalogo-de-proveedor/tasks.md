# QC-52 — separar-producto-de-catalogo-de-proveedor · tasks.md

> Checklist de la implementación. `[P]` = puede ir en paralelo con las otras `[P]` de su mismo
> grupo. Cada task dice **qué archivos toca** y **cuándo está hecha**.
>
> Regla de cierre de tanda (`CLAUDE.md` n.º 5): `./init.sh --rapido` al cerrar cada grupo;
> `./init.sh` completo al cerrar la feature y **antes del PR, sin excepción**.
>
> Si aparece cualquier ambigüedad que no esté en `requirements.md > Preguntas abiertas`, el
> implementer **para y la reporta al leader**; no la rellena con supuestos (regla 6).

---

## Grupo A — Esquema y migración (bloquea a todo lo demás)

### T0 — Cerrar el drift de `products.image_path` antes de generar nada
- **Archivos:** `db/schema.prisma` (modelo `Product`).
- **Qué:** añadir `imagePath String? @map("image_path")` al modelo `Product`. **Solo el modelo**:
  ninguna sentencia SQL, la columna ya existe en la base desde
  `20260903200000_product_image_path`.
- **Por qué va primero:** si no, T2 generará `ALTER TABLE "products" DROP COLUMN "image_path"`
  mezclado entre los tres `DROP COLUMN` que sí queremos (`design.md > 0`, § 1.3, P4).
- **Hecho cuando:** `pnpm run typecheck` pasa y una comprobación de esquema afirma que
  `Product.imagePath` existe, es opcional y mapea a `image_path` (R4).

### T1 — Esquema Prisma: producto adelgaza, línea engorda
- **Depende de:** T0.
- **Archivos:** `db/schema.prisma` (modelos `Product` y `SupplierCatalogLine`).
- **Qué:**
  - `Product`: quitar `cost`, `minPurchase`, `deliveryTime`.
  - `SupplierCatalogLine`: quitar `productId`, el `@@unique([supplierId, productId])` y el
    `@@index([productId])`; añadir `name`, `nameNormalized`, `presentationId` (obligatoria),
    `unitId` (opcional), `imagePath` (opcional), `deletedAt`; añadir los `@@index` de
    `presentationId` y `unitId`.
  - **No** añadir ningún `@@unique` nuevo: la unicidad es un índice parcial y va a mano en T2.
  - Actualizar los comentarios `///` de los dos modelos: qué se fue, por qué la línea ya no conoce
    el producto, y que las dos FK nuevas son escalares sin `@relation` (por tanto **drift** que hay
    que proteger en toda migración futura).
- **Hecho cuando:** `pnpm exec prisma validate` pasa y `pnpm run typecheck` señala exactamente los
  archivos que T4–T9 van a arreglar (es la lista de trabajo, no un fallo).

### T2 — Generar la migración y **auditarla línea a línea**
- **Depende de:** T1.
- **Archivos:** `db/migrations/<ts>_split_product_and_supplier_catalog/migration.sql`.
- **Qué:**
  1. `pnpm run db:migrate:create` (`--create-only`: **no** aplica).
  2. **Auditar el SQL generado contra la tabla de `design.md > 3.1`, entrada por entrada.** Prisma
     emitirá `DROP CONSTRAINT` sobre **todas** las FK que cruzan de módulo del repo —las de autoría
     de `products`, `recipes`, `recipe_lines`, `suppliers`, `supplier_catalog_lines` y `orders`, las
     de unidad de `products` y `recipe_lines`, y la de producto de `recipe_lines`— y sobre cualquier
     `CHECK`, porque ninguna está en el esquema. **Se borran a mano, una por una.** En QC-43 fueron
     diez; aquí se esperan al menos dieciséis. Aplicarlas destruiría en silencio la integridad
     referencial de cinco features ya mergeadas.
  3. Completar a mano lo que Prisma no genera: `DROP CONSTRAINT "supplier_catalog_lines_product_id_fkey"`
     (escalar, Prisma no sabe que existe), las dos FK nuevas a `presentations` y `units` con
     `ON DELETE RESTRICT ON UPDATE CASCADE`, y el índice único **parcial**
     `supplier_catalog_lines_name_presentation_unique` sobre
     `(supplier_id, name_normalized, presentation_id) WHERE deleted_at IS NULL`.
  4. Encabezar el archivo con el aviso de drift, igual que hacen las migraciones de QC-42 y QC-43.
- **Hecho cuando:** el `migration.sql` **no contiene** ningún `DROP CONSTRAINT` fuera de los dos
  legítimos de la línea; no menciona ninguna tabla que no sea `products` y
  `supplier_catalog_lines` (salvo como destino de una FK); y no contiene ninguna sentencia de RLS
  (R26, R27, R29).

### T3 — `down.sql` que revierte al esquema exacto anterior
- **Depende de:** T2.
- **Archivos:** `db/migrations/<ts>_split_product_and_supplier_catalog/down.sql`.
- **Qué:** revertir en orden inverso (`design.md > 3.2`). Restaurar `products.min_purchase` como
  `INTEGER NOT NULL DEFAULT 0` —no anulable— y **recrear a mano** los dos `CHECK` que el
  `DROP COLUMN` se llevó (`products_cost_non_negative`, `products_min_purchase_non_negative`).
  Restaurar `product_id UUID NOT NULL` con su FK `RESTRICT`, su índice y su índice único **total**.
  Añadir la **guarda**: si alguna línea tiene `image_path` escrita o hay filas que el DOWN no puede
  reconstruir, `RAISE EXCEPTION` con un mensaje que diga qué revisar, en vez de destruir en
  silencio (patrón de `20260903200000_product_image_path/down.sql`).
- **Hecho cuando:** `pnpm run db:migrate` aplica, `pnpm run db:rollback` revierte, el esquema
  resultante coincide con el anterior columna a columna y restricción a restricción, y
  `_prisma_migrations` queda coherente. Después se vuelve a aplicar (R28).

---

## Grupo B — Módulo `inventario` (depende de A)

### T4 [P] — Contratos y validación del producto
- **Archivos:** `lib/modules/inventario/domain/product-input.ts`,
  `lib/modules/inventario/domain/product-view.ts`.
- **Qué:** quitar `cost`, `minPurchase` y `deliveryTime` de `createProductSchema`,
  `updateProductSchema`, `NewProduct` y `ProductView`. Pasar el esquema a **`z.strictObject`**
  (`design.md > 4`) para que una entrada con costo se **rechace** en vez de ignorarse.
- **Hecho cuando:** un test afirma que la entrada con `cost` da `invalid_input` (R1) y que la
  entrada válida sin los tres campos pasa.

### T5 [P] — Adaptador Prisma del producto
- **Archivos:** `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`.
- **Qué:** quitar los tres campos del `select`, del `create`, del `updateAlive` y del mapeo a
  `ProductView`. **No tocar** la traducción de `P2003` ni el borrado lógico.
- **Hecho cuando:** `tests/unit/inventario/product-prisma.test.ts` pasa sin referencias a los tres
  campos y `tests/integration/inventario/product-crud.int.test.ts` sigue verde.

### T6 [P] — Server Action del producto
- **Archivos:** `lib/modules/inventario/adapters/driving/product-actions.ts`.
- **Qué:** dejar de leer `cost`, `minPurchase` y `deliveryTime` del `FormData`.
- **Hecho cuando:** `tests/unit/inventario/product-actions.test.ts` pasa y ningún test envía los
  tres campos.

---

## Grupo C — Pantalla de productos y E2E (depende de B)

### T7 — Formulario de producto
- **Archivos:** `app/(private)/inventario/components/product-form.tsx`.
- **Qué:** borrar `HIDDEN_FIELDS` y los tres `<input type="hidden">` del bloque de edición; sacar
  `cost` de `TEXT_FIELDS`, `minPurchase` y `deliveryTime` de `INT_FIELDS`, y las tres entradas de
  `FIELD_MESSAGES` y `FIELD_LABELS`; simplificar `hayErrorVisible`, que ya no tiene campos ocultos
  que contemplar.
- **Hecho cuando:** el formulario **no envía** los tres campos por ninguna vía —ni en alta ni en
  edición— y guardar sigue funcionando en los dos casos (R5).

### T8 [P] — Tabla y columnas
- **Archivos:** `app/(private)/inventario/components/product-columns.ts` (verificación),
  `product-table.tsx` si hiciera falta.
- **Qué:** comprobar que `ProductColumnKey` sigue compilando al encoger `ProductView` y que ninguna
  columna ni ningún valor derivan de los tres campos.
- **Hecho cuando:** `pnpm run typecheck` pasa y el test en negativo de columnas sigue verde (R6).

### T9 — E2E de productos
- **Depende de:** T7.
- **Archivos:** `e2e/inventario.spec.ts`.
- **Qué:** borrar la línea que rellena `product-field-cost` —un `data-testid` que **la pantalla ya
  no renderiza hoy**, ver `design.md > 0.4`—. Conservar el resto del recorrido y el assert de que
  crear la presentación no pierde lo escrito, apoyado en `product-field-name` y
  `product-field-stock`.
- **Hecho cuando:** `pnpm run e2e` pasa en **Chromium y WebKit**, y una búsqueda de texto confirma
  que el spec no referencia ningún `data-testid` ausente de `app/(private)/inventario/` (R7).

---

## Grupo D — Módulo `proveedores` (depende de A; paralelo a B y C)

### T10 — Cortar la dependencia con `inventario`
- **Archivos:** `lib/modules/proveedores/domain/catalog-line-input.ts`,
  `catalog-line-view.ts`, `create-catalog-line.ts`, `list-catalog-lines.ts`, `errors.ts`,
  `index.ts`.
- **Qué:** quitar `productId` de esquemas y tipos; quitar la dependencia `products: ProductCatalog`
  y la llamada a `findRefs`; quitar `productName` de `CatalogLineView`; borrar
  `ProductNotFoundError` y su `code` del módulo y del barrel. **Conservar**
  `DuplicateCatalogLineError` con su `code` intacto (`design.md > 6.1`).
- **Hecho cuando:** ningún archivo de `lib/modules/proveedores/**` contiene la cadena
  `@/lib/modules/inventario` ni `product`, y `tests/unit/proveedores/scope.test.ts` —invertido—
  lo afirma (R18).

### T11 — Campos nuevos de la línea y su validación
- **Depende de:** T10.
- **Archivos:** `lib/modules/proveedores/domain/catalog-line-input.ts`, `catalog-line-view.ts`.
- **Qué:** añadir `name`, `presentationId` (uuid, obligatorio), `unitId` (uuid, opcional),
  `imagePath` (texto, opcional, **sin patrón de forma**) a los esquemas de alta y edición;
  reordenar los tipos según `design.md > 7`. `name` con `.trim().min(1).max(120)`, en ese orden.
  El rechazo del nombre que **normaliza a vacío** va en el caso de uso, como en `create-supplier`.
- **Hecho cuando:** tests de borde cubren nombre en blanco, nombre que normaliza a vacío,
  presentación ausente, unidad ausente (válida), costo cero (rechazado) y decimal fuera de patrón
  (R10, R14).

### T12 — Normalización y unicidad
- **Depende de:** T11.
- **Archivos:** `lib/modules/proveedores/domain/create-catalog-line.ts`, `update-catalog-line.ts`,
  `adapters/driven/persistence/supplier-catalog-line-prisma.ts`.
- **Qué:** persistir `nameNormalized` con `normalizeSupplierName` en toda escritura; adaptar
  `isDuplicateLineViolation` a las columnas del índice nuevo (`supplier_id`, `name_normalized`,
  `presentation_id`). **Sin `SELECT` previo** de comprobación (`design.md > 10.4`).
- **Hecho cuando:** un test de integración contra Postgres real prueba el duplicado, y otro prueba
  que dos presentaciones distintas del mismo nombre conviven y que dos proveedores distintos pueden
  tener la misma línea (R15, R16).

### T13 — Traducción de las FK nuevas
- **Depende de:** T11.
- **Archivos:** `lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma.ts`.
- **Qué:** traducir `P2003` sobre `presentation_id` y `unit_id` a `ValidationError`
  (`invalid_input`), decidiendo por `meta.field_name` y **nunca** por el texto del mensaje; seguir
  relanzando crudo el de `created_by`/`updated_by` (`design.md > 6.2`).
- **Hecho cuando:** un test de integración con una presentación inexistente da `invalid_input`, y
  uno con un autor inexistente relanza (R10, R32).

### T14 — Borrado lógico de la línea y caída con el proveedor
- **Depende de:** T11.
- **Archivos:** `lib/modules/proveedores/ports/supplier-catalog-repository.ts`,
  `ports/supplier-repository.ts`, `domain/delete-catalog-line.ts`, `domain/list-catalog-lines.ts`,
  `adapters/driven/persistence/supplier-catalog-line-prisma.ts`,
  `adapters/driven/persistence/supplier-prisma.ts`.
- **Qué:**
  - `deleteById` → `softDeleteAlive(id, actorId, now)`: marca `deleted_at`, jamás borra la fila.
  - `softDeleteAliveSupplier` pasa a `prisma.$transaction` con los dos `UPDATE` y **la misma marca
    de tiempo** (`design.md > 6.4`).
  - `listBySupplierAlive` gana `deletedAt: null` en el `where`.
  - Derogar QC-43 R48: las cuatro operaciones sobre líneas de un proveedor dado de baja responden
    `not_found`, la baja incluida (P5).
- **Hecho cuando:** un test de integración da de baja un proveedor con dos líneas y comprueba que
  las tres filas siguen existiendo, las tres tienen `deleted_at` y **es el mismo instante**; y que
  ninguna consulta las devuelve (R20, R21, R22, R23).

### T15 — Edición como reemplazo completo
- **Depende de:** T11, T12.
- **Archivos:** `lib/modules/proveedores/domain/update-catalog-line.ts`,
  `ports/supplier-catalog-repository.ts`, el adaptador.
- **Qué:** `updateTerms` → `replaceAlive`, devolviendo `'ok' | 'not_found' | 'duplicate'`. El
  esquema de edición pasa a los siete campos de negocio y sigue **sin** `supplierId`, en
  `strictObject` (P6, `design.md > 6.3`).
- **Hecho cuando:** un test prueba el renombrado válido, el renombrado que choca con otra línea viva
  (duplicado) y el intento de cambiar de proveedor (rechazado como entrada inválida) (R24).

### T16 — Server Actions y cableado
- **Depende de:** T10–T15.
- **Archivos:** `lib/modules/proveedores/adapters/driving/supplier-catalog-actions.ts`,
  `lib/composition/index.ts`.
- **Qué:** leer del `FormData` los campos nuevos con el mismo criterio de hoy (vacío = ausencia para
  los opcionales, tal cual para el costo); quitar `products: productCatalog` de las dos factories de
  `proveedores` en la composición. `productCatalog` **se queda**: `recetas` lo usa.
- **Hecho cuando:** `tests/unit/proveedores/*actions*.test.ts` pasan y la guardia de arquitectura
  sigue verde (R31, R33).

---

## Grupo E — Verificación (depende de A–D)

### T17 [P] — Autorización, en el service
- **Archivos:** `tests/unit/inventario/authorization.test.ts`,
  `tests/unit/proveedores/authorization.test.ts`.
- **Qué:** confirmar que las nueve operaciones rechazan al no-Administrador, al actor ausente y al
  rol vacío o desconocido **sin tocar ningún puerto**. Ampliar a las operaciones cuya firma cambió.
- **Hecho cuando:** cada una tiene su caso y los dobles de repositorio afirman cero llamadas (R25).

### T18 [P] — Censo de esquema y de migración
- **Archivos:** `tests/unit/inventario/schema/*.test.ts`,
  `tests/unit/proveedores/schema/*.test.ts`.
- **Qué:** afirmar las columnas exactas de `products` y de `supplier_catalog_lines` tras la
  migración; afirmar que `Product.imagePath` está declarado; y afirmar **sobre el texto del
  `migration.sql`** que no contiene ningún `DROP CONSTRAINT` de las FK enumeradas en R29 ni ninguna
  sentencia de RLS.
- **Hecho cuando:** los tres asserts pasan y **muerden**: se comprueba a mano que introducir un
  `DROP CONSTRAINT` en el SQL los pone rojos (R1, R2, R4, R8, R26, R27, R29).

### T19 — Trazabilidad y gate completo
- **Depende de:** todas.
- **Archivos:** `progress/impl_QC-52-separar-producto-de-catalogo-de-proveedor.md`.
- **Qué:** escribir el mapa **`R1`–`R34` → test concreto**, con la salida real de la suite pegada.
  Un requisito sin test es un fallo de la feature (`CHECKPOINTS.md > Trazabilidad`).
- **Hecho cuando:** `./init.sh` termina en verde, `pnpm run e2e` pasa en Chromium y WebKit, y los 34
  requisitos tienen fila en el mapa.
