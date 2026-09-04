# QC-52 — separar-producto-de-catalogo-de-proveedor · design.md

> Decisiones técnicas de la reforma. El **qué** está en `requirements.md`; aquí va el **cómo**, y
> solo lo que hay que decidir antes de escribir código.
>
> Esta ficha **no construye nada nuevo**: reforma tres features ya mergeadas (QC-14/QC-20/QC-22 en
> `inventario`, QC-42/QC-43 en `proveedores`). Por eso casi todo el diseño es «qué se borra, qué se
> renombra y qué NO se puede romper al hacerlo».

---

## 0. Punto de partida verificado

Antes de decidir nada se leyó el estado real del repo. Cuatro hechos que condicionan el diseño y
que **no** se dan por supuestos:

| # | Hecho | Dónde se comprobó |
| --- | --- | --- |
| 0.1 | Las dos tablas de `proveedores` **están vacías**: QC-42 fue esquema puro y QC-43 no sembró nada. La migración es barata hoy y cara mañana | `db/migrations/20260903200343_.../migration.sql`, cabecera |
| 0.2 | `products.image_path` **existe en la base y no en el modelo Prisma** | `db/migrations/20260903200000_product_image_path/migration.sql` vs. `db/schema.prisma` modelo `Product` |
| 0.3 | El formulario de producto **ya no pinta** costo, compra mínima ni tiempo de entrega: viajan como `<input type="hidden">` solo en edición | `app/(private)/inventario/components/product-form.tsx`, `HIDDEN_FIELDS` |
| 0.4 | El E2E de productos **rellena un `data-testid` que la pantalla ya no renderiza** | `e2e/inventario.spec.ts:209` usa `product-field-cost`; no existe en ningún componente |

**0.4 merece una frase aparte.** El E2E de QC-22 está referenciando `product-field-cost`, que
desapareció cuando la decisión del 2026-09-03 ocultó los tres campos. Un `fill()` sobre un locator
inexistente **no pasa**: expira. Esa línea es exactamente lo que esta ficha viene a limpiar, y es
la prueba concreta de por qué la decisión cerrada 8 dice «se actualiza a conciencia en vez de
descubrir que se rompió».

---

## 1. Modelo de datos — `products`

### 1.1 Lo que se va

```prisma
model Product {
  // cost         Decimal?  @db.Decimal(14, 4)      <- FUERA
  // minPurchase  Int       @default(0) @map(...)   <- FUERA
  // deliveryTime Int?      @map("delivery_time")   <- FUERA
}
```

En SQL, tres `ALTER TABLE "products" DROP COLUMN`. Postgres se lleva **con la columna** los
`CHECK` que solo la mencionan, así que `products_cost_non_negative` y
`products_min_purchase_non_negative` desaparecen sin sentencia propia. `delivery_time` nunca tuvo
`CHECK` (QC-14 decisión 7). **El `down.sql` sí tiene que recrear los dos `CHECK` a mano** (R28): no
vuelven solos con el `ADD COLUMN`.

Detalle que hay que respetar al escribir el DOWN: `min_purchase` era `INTEGER NOT NULL DEFAULT 0`,
no anulable. Restaurarla como anulable sería «casi» el esquema anterior, y R28 pide **exactamente**
el anterior.

### 1.2 Lo que se queda, y por qué se escribe aquí

`stock`, `qty_alert`, `unit_id`, `image_path`, `presentation_id`, las marcas de tiempo, el borrado
lógico y las dos columnas de autor. Se enumera porque R3 exige que la migración **no** se lleve por
delante ninguna de las restricciones que cuelgan de ellas, y hay cinco escritas a mano que Prisma
no conoce: `products_presentation_id_fkey` (esa sí la conoce), `products_unit_id_fkey`,
`products_created_by_fkey`, `products_updated_by_fkey`, y los `CHECK` de `stock` y `qty_alert`.

### 1.3 `image_path` y el drift (P4)

`products.image_path` está en la base desde `20260903200000_product_image_path` pero **no** en el
modelo `Product`. Consecuencia directa: al generar la migración de esta ficha, Prisma verá una
columna que su esquema no declara y emitirá `ALTER TABLE "products" DROP COLUMN "image_path"`
**mezclada entre los tres `DROP COLUMN` que sí queremos**. Es el peor sitio posible para un drift:
no destaca.

Decisión: **declararla en el modelo** (`imagePath String? @map("image_path")`), sin ninguna
sentencia SQL. La base no cambia; lo que cambia es que Prisma deja de proponer borrarla, hoy y en
toda migración futura de `products`. Cuesta una línea de esquema y su assert en el test de esquema.

> **Se descartó** dejar el drift y limitarse a borrar la línea a mano del SQL generado. Funciona
> una vez y **vuelve a aparecer en la siguiente ficha que toque `products`**, que es como se pierde
> una columna en silencio. La convención de FK escalares ya obliga a auditar el SQL a mano; añadir
> una columna evitable a esa lista es gastar vigilancia humana en algo que el esquema puede
> resolver solo.

---

## 2. Modelo de datos — `supplier_catalog_lines`

### 2.1 Forma final

```prisma
/// @module proveedores
model SupplierCatalogLine {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  supplierId     String    @map("supplier_id") @db.Uuid
  name           String
  nameNormalized String    @map("name_normalized")
  presentationId String    @map("presentation_id") @db.Uuid   // NUEVA, obligatoria
  unitId         String?   @map("unit_id") @db.Uuid           // NUEVA, opcional
  imagePath      String?   @map("image_path")                 // NUEVA, opcional
  cost           Decimal   @db.Decimal(14, 4)
  minPurchase    Decimal?  @map("min_purchase") @db.Decimal(14, 4)
  deliveryTime   Int?      @map("delivery_time")
  createdBy      String?   @map("created_by") @db.Uuid
  updatedBy      String?   @map("updated_by") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(6)   // NUEVA

  supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@index([presentationId], map: "supplier_catalog_lines_presentation_id_idx")
  @@index([unitId], map: "supplier_catalog_lines_unit_id_idx")
  @@index([createdBy], map: "supplier_catalog_lines_created_by_idx")
  @@index([updatedBy], map: "supplier_catalog_lines_updated_by_idx")
  @@map("supplier_catalog_lines")
}
```

Fuera: `productId`, el `@@unique([supplierId, productId])` y el
`@@index([productId])`. **No hay `@@unique` nuevo en el esquema**, y es deliberado: la unicidad es
un índice **parcial** y Prisma no los modela (§ 2.3).

Se **conservan** los tres `CHECK` de QC-42/QC-43: `supplier_catalog_lines_cost_positive`,
`..._min_purchase_non_negative`, `..._delivery_time_non_negative`. Ninguno menciona una columna que
desaparezca, así que la migración no los toca — pero hay que **verificar** que el SQL generado
tampoco (R27, R29).

Tipos: mandan los de la línea (decisión cerrada 6). `cost` sigue `NOT NULL` + `> 0`, `min_purchase`
sigue `DECIMAL(14,4)` anulable. Nada se afloja al de `products`.

### 2.2 Las dos claves foráneas nuevas

```sql
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_presentation_id_fkey"
  FOREIGN KEY ("presentation_id") REFERENCES "presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Escritas **a mano**, campos **escalares sin `@relation`** (decisión cerrada 10, R30). Es la misma
convención con la que `products.unit_id` cruza a `unidades` y `recipe_lines.product_id` cruza a
`inventario`, y el motivo es idéntico: con `@relation`, el cliente Prisma ofrecería
`include: { presentation: true }` desde `proveedores` —una lectura de la tabla de otro módulo que
**ninguna guardia detecta**, porque no es un import ni un `prisma.presentation`— y además obligaría
a declarar `catalogLines SupplierCatalogLine[]` dentro de `Presentation` y de `Unit`, que son de
otros módulos.

`RESTRICT` en las dos, no `CASCADE` ni `SET NULL`: `presentations` no tiene borrado lógico (QC-20
D6, se borra de verdad) y el `RESTRICT` es justo lo que impide que borrar una presentación deje
líneas apuntando al vacío. Es el mismo trato que `products_presentation_id_fkey`.

Índice en el lado hijo de cada una: Postgres no lo crea solo, y por ahí pasa la verificación del
`RESTRICT`.

### 2.3 La unicidad de la línea

```sql
CREATE UNIQUE INDEX "supplier_catalog_lines_name_presentation_unique"
  ON "supplier_catalog_lines" ("supplier_id", "name_normalized", "presentation_id")
  WHERE "deleted_at" IS NULL;
```

Parcial sobre las vivas, porque ahora la línea tiene borrado lógico (R17). Mismo patrón exacto que
`suppliers_name_unique` (QC-42) y que `presentations_name_normalized_key` (QC-20), y por la misma
razón: **el índice es la única garantía**. No hay `SELECT` previo por igualdad, porque entre el
`SELECT` y el `INSERT` cabe otra transacción; el puerto no expone ningún método de búsqueda por
nombre, de modo que esa comprobación **ni siquiera es expresable**. El mensaje al usuario sale de
traducir el `23505` (`P2002` en Prisma).

El orden de las columnas es `(supplier_id, name_normalized, presentation_id)` y no es indiferente:
el prefijo izquierdo `supplier_id` sirve además como índice de «líneas de este proveedor», que es
la consulta del listado paginado. Por eso **no** se añade un
`supplier_catalog_lines_supplier_id_idx` aparte — sería redundante. Ojo: el índice de hoy
(`supplier_id, product_id`) es **total**, así que al hacerse parcial deja de cubrir las filas
muertas; el listado ya filtra por `deleted_at IS NULL`, así que sigue sirviendo.

`name_normalized` la calcula `normalizeSupplierName` (`lib/modules/proveedores/domain/`), que ya
existe y es la forma canónica del módulo. **Se reutiliza, no se escribe otra**: dos definiciones de
«mismo nombre» en el mismo módulo divergen.

---

## 3. La migración: una sola, y auditada línea a línea

Nombre propuesto: `<timestamp>_split_product_and_supplier_catalog`.

Proceso obligatorio (`docs/architecture.md > Migraciones up/down`):
`pnpm run db:migrate:create` (no aplica) → auditar → escribir `down.sql` a mano →
`pnpm run db:migrate` → probar `pnpm run db:rollback` → volver a aplicar.

### 3.1 Qué va a proponer Prisma que NO se acepta

Esta es la parte cara de la ficha. `prisma migrate dev --create-only` compara el esquema con la
base y **todo lo que está en la base pero no en el esquema lo emite como `DROP`**. En QC-43 fueron
**diez `DROP CONSTRAINT`** que hubo que borrar a mano. Aquí la lista esperada es al menos esta, y
hay que revisarla entera aunque salgan más:

| Lo que Prisma propondrá borrar | Por qué existe | Qué se hace |
| --- | --- | --- |
| `products_created_by_fkey`, `products_updated_by_fkey` | QC-20, escalares sin `@relation` | **borrar la línea del SQL** |
| `products_unit_id_fkey` | QC-32 | **borrar la línea del SQL** |
| `recipes_created_by_fkey`, `recipes_updated_by_fkey` | QC-24 | **borrar la línea del SQL** |
| `recipe_lines_product_id_fkey`, `recipe_lines_unit_id_fkey` | QC-24, QC-32 | **borrar la línea del SQL** |
| `suppliers_created_by_fkey`, `suppliers_updated_by_fkey` | QC-42 | **borrar la línea del SQL** |
| `supplier_catalog_lines_created_by_fkey`, `..._updated_by_fkey` | QC-43 | **borrar la línea del SQL** |
| `orders_recipe_id_fkey`, `orders_unit_id_fkey`, `orders_created_by_fkey`, `orders_updated_by_fkey` | QC-33 | **borrar la línea del SQL** |
| Cualquier `CHECK` de cualquier tabla | Prisma no modela `CHECK` | **borrar la línea del SQL** |
| `ALTER TABLE "products" DROP COLUMN "image_path"` | drift de 0.2 | **desaparece solo** si se aplica § 1.3; si no, borrar a mano |

Lo que **sí** se acepta del SQL generado: los tres `DROP COLUMN` de `products`, el `DROP COLUMN
"product_id"` de la línea, los cinco `ADD COLUMN` nuevos, y los índices simples. Todo lo demás
—las dos FK nuevas, el índice único parcial— se escribe a mano, porque Prisma no lo puede generar.

`supplier_catalog_lines_product_id_fkey` y `supplier_catalog_lines_supplier_id_product_id_key` **sí
se borran**, y son los únicos dos borrados de restricción legítimos de esta migración. Como
`product_id` es escalar sin `@relation`, Prisma no sabe que la FK existe: hay que escribir su
`DROP CONSTRAINT` **a mano** antes del `DROP COLUMN`. (En Postgres el `DROP COLUMN` se la llevaría
igual, pero dejarlo implícito hace que el `down.sql` no tenga contraparte visible que recrear.)

### 3.2 `down.sql`

Revierte al esquema **exacto** anterior (R28). En orden inverso: quitar el índice único parcial y
las dos FK nuevas, quitar las cinco columnas nuevas, devolver `product_id UUID NOT NULL` con su FK
`RESTRICT`, su índice y su índice único total, devolver las tres columnas de `products` con sus
tipos y defaults originales y recrear sus dos `CHECK`.

**Guarda de seguridad, copiada de `20260903200000_product_image_path/down.sql`:** si hay alguna
línea con `image_path` escrita, o alguna línea viva sin `product_id` posible de reconstruir, el
DOWN **falla con un mensaje que dice qué revisar** en vez de destruir datos en silencio. Hoy es
gratis —las tablas están vacías— y el día que no lo estén es lo único que evita perder el catálogo.
El DOWN **no puede** reconstruir `product_id` a partir del nombre: no hay de dónde. Eso lo hace un
DOWN **destructivo por naturaleza** en cuanto haya una sola fila, y así queda escrito en su
cabecera.

### 3.3 RLS

No se toca (R26). Sigue habilitada y forzada en las cuatro tablas implicadas por sus migraciones
originales. La guardia `tests/guards/guard-rls-force.test.ts` lo vigila.

---

## 4. Módulo `inventario`: qué cambia

| Archivo | Cambio |
| --- | --- |
| `domain/product-input.ts` | `createProductSchema` pierde `cost`, `minPurchase`, `deliveryTime` |
| `domain/product-view.ts` | `NewProduct` y `ProductView` pierden los tres campos |
| `adapters/driven/persistence/product-prisma.ts` | `select`, `create`, `updateAlive` y el mapeo a `ProductView` pierden los tres |
| `adapters/driving/product-actions.ts` | deja de leer los tres del `FormData` |
| `index.ts` | sin cambios de forma: sigue exportando los mismos símbolos |

**El esquema es `strictObject` o no lo es.** Hoy `createProductSchema` es `z.object`, que **ignora
en silencio** las claves de más. R1 pide rechazar la entrada que traiga costo. Decisión: pasarlo a
**`z.strictObject`**, igual que `createCatalogLineSchema` de QC-43. Motivo escrito en el propio
código de QC-43 y aplicable palabra por palabra: ignorar el campo de más es peor que rechazarlo,
porque quien lo envía cree haber guardado un costo que nunca se guardó.

`ProductCatalog` / `ProductRef` **no cambian**: nunca expusieron costo (su comentario ya decía «un
contrato público se amplía cuando alguien lo necesita, no antes»). Siguen sirviendo a `recetas`.

**Lo que NO se toca en `inventario`:** `stock`, `qtyAlert`, la unidad, la presentación, la
paginación, la autorización y todo lo de `presentations`. Cualquier diff ahí es alcance de más.

---

## 5. Pantalla de productos (QC-22): qué cambia

- `product-form.tsx`: se borran `HIDDEN_FIELDS` **y los tres `<input type="hidden">`** del bloque
  de edición; `cost` sale de `TEXT_FIELDS`; `minPurchase` y `deliveryTime` salen de `INT_FIELDS`;
  las tres entradas correspondientes salen de `FIELD_MESSAGES` y `FIELD_LABELS`. Con `HIDDEN_FIELDS`
  vacío, el cálculo de `hayErrorVisible` se simplifica: todo error de campo tiene ya su campo en
  pantalla.
- `product-columns.ts`: **no cambia ninguna columna** —las cuatro que quedan (nombre, presentación,
  existencia, alerta) no incluían ninguna de las tres—, pero `HiddenProductField` y
  `ProductColumnKey` se recalculan solos al encoger `ProductView`. Verificar que sigue compilando es
  parte del criterio de hecho.
- `page.tsx`, `product-table.tsx`, `product-sheet.tsx`, `presentation-select.tsx`: sin cambios.

Multiplataforma (`docs/architecture.md > Componentes`): esta ficha **quita** campos, no añade UI.
No hay ninguna decisión nueva de layout, target táctil ni tamaño de fuente, así que no hay
excepción que declarar.

### 5.1 E2E

`e2e/inventario.spec.ts` pierde la línea 209 (`product-field-cost`). Nada más cambia: el recorrido
—login, `/inventario`, panel lateral, presentación desde el selector, guardar, buscar la fila,
comprobar en la base— sigue siendo el mismo y sigue corriendo en Chromium y WebKit. El segundo test
(el Operador acaba fuera) no toca ninguno de los tres campos.

Ojo al orden: hoy el spec escribe nombre y costo **antes** de crear la presentación, para poder
afirmar después que crearla no perdió lo escrito. Al quitar el costo, esa afirmación tiene que
seguir apoyándose en un campo real — se conserva sobre `product-field-name` y `product-field-stock`,
que es lo que ya hace el assert de la línea 219.

---

## 6. Módulo `proveedores`: qué cae, qué cambia

### 6.1 Lo que se cae con `product_id` (decisión cerrada 7)

| Se cae | Archivo |
| --- | --- |
| `productId` en `createCatalogLineSchema` | `domain/catalog-line-input.ts` |
| `productId` en `NewCatalogLine`, `productName` en `CatalogLineView` | `domain/catalog-line-view.ts` |
| dependencia `products: ProductCatalog` y la llamada a `findRefs` | `domain/create-catalog-line.ts`, `domain/list-catalog-lines.ts` |
| `ProductNotFoundError` y su `code` `product_not_found` | `domain/errors.ts`, `index.ts` |
| el import `import type { ProductCatalog, ProductId } from '@/lib/modules/inventario'` | los tres archivos que lo tienen |
| `isDuplicateLineViolation` mirando `product_id` | `adapters/driven/persistence/supplier-catalog-line-prisma.ts` |
| el cableado `products: productCatalog` de las dos factories | `lib/composition/index.ts` |

Tras esto, `lib/modules/proveedores/**` **no importa `inventario` en absoluto**. `productCatalog`
sigue existiendo en `lib/composition` porque `recetas` lo usa; lo que se quita son las dos líneas
que se lo pasaban a `proveedores`.

`DuplicateCatalogLineError` y su `code` `duplicate_catalog_line` **se conservan**: el caso sigue
existiendo, solo cambia la clave que lo dispara. Renombrarlo obligaría a QC-44 a conocer dos
códigos para lo mismo (mismo criterio con el que QC-43 conservó el nombre de
`suppliers_contact_required` al cambiarle la definición).

### 6.2 Presentación y unidad: quién comprueba que existen

**La base, no el módulo.** `zod` valida la **forma** (que sea un uuid); la **existencia** la
garantiza la FK. Es exactamente lo que ya hace `inventario` con `products.presentation_id` y
`products.unit_id`, y su `product-prisma.ts` deja el precedente completo de la traducción:

- `P2003` sobre `presentation_id` o `unit_id` → **`ValidationError`** (`invalid_input`): es un
  campo de entrada que el borde validó como uuid pero cuya existencia solo la base puede garantizar.
- `P2003` sobre `created_by` / `updated_by` → se **relanza crudo**, como ya hace QC-43: el actor
  sale de una sesión real, así que un autor inexistente no es un caso de negocio sino un fallo del
  sistema, y traducirlo diría al usuario una mentira.

Se decide por `meta.field_name`, **nunca** por el texto del mensaje (que en esta máquina Postgres
devuelve en español).

> **Se descartó** ampliar el contrato público de `inventario` con un `PresentationCatalog` (y el de
> `unidades` con un listado) para comprobar la existencia desde el caso de uso, al estilo de
> `ProductCatalog.findRefs`. Tres razones: (a) esta ficha existe para **cortar** la dependencia de
> `proveedores` a `inventario`, y volver a atarla por otra puerta la contradice; (b) una
> comprobación previa por `SELECT` no es atómica —entre la lectura y el `INSERT` cabe un borrado—
> mientras la FK sí lo es; (c) el precedente del propio `inventario` ya resuelve el caso con la FK y
> un código de error existente. El día que QC-44 necesite **pintar** el nombre de la presentación,
> ese sí es un contrato nuevo y es de QC-44.

Consecuencia aceptada, escrita para que no se lea como olvido: `CatalogLineView` devuelve
`presentationId` y `unitId` **en crudo**, sin nombre. Es la misma situación en la que QC-32 dejó a
`ProductView.unitId`, y la pantalla que los tenga que resolver es QC-44.

### 6.3 Edición: reemplazo completo (P6)

`updateCatalogLineSchema` pasa de tres campos a siete: `name`, `presentationId`, `unitId`,
`imagePath`, `cost`, `minPurchase`, `deliveryTime`. Sigue siendo `strictObject`, y sigue **sin**
`supplierId`: el proveedor es lo único que la edición no puede cambiar, y no porque se filtre sino
porque el tipo no lo tiene.

El puerto `updateTerms` deja de llamarse así —ya no son solo términos— y pasa a `replaceAlive`,
alineado con `SupplierRepository.updateAlive` y `RecipeRepository.replaceAlive`. Devuelve
`'ok' | 'not_found' | 'duplicate'`, los mismos tres desenlaces que el proveedor.

### 6.4 Baja lógica y la caída con el proveedor (decisión 5, P5)

```
softDeleteAliveSupplier(id, actorId, now)
  → prisma.$transaction([
      UPDATE suppliers              SET deleted_at = now, updated_at = now, updated_by = actor
        WHERE id = ? AND deleted_at IS NULL,
      UPDATE supplier_catalog_lines SET deleted_at = now, updated_at = now, updated_by = actor
        WHERE supplier_id = ? AND deleted_at IS NULL,
    ])
```

Una sola transacción y **la misma marca de tiempo** para las dos sentencias (R20): dos `now()`
distintos harían imposible saber después qué líneas cayeron con qué baja. Si el primer `UPDATE`
afecta 0 filas, el caso de uso devuelve «no encontrado» y **la transacción no escribe nada**.

`onDelete: Cascade` de `supplier_catalog_lines_supplier_id_fkey` se **conserva** tal cual: sigue
siendo la red de un borrado físico (una purga, el `down.sql`) y no se dispara nunca en operación
normal, porque ninguna FK reacciona a un `UPDATE`. La decisión cerrada 5 lo sustituye como
*política de negocio*, no como restricción de base.

El puerto `deleteById` pasa a `softDeleteAlive(id, actorId, now)` y devuelve `boolean`. **R48 de
QC-43 queda derogada entera** (P5): las cuatro operaciones sobre una línea de un proveedor dado de
baja responden `not_found`, la baja incluida. El argumento que sostenía la excepción —«rechazarlo
las dejaría atrapadas sin ninguna operación capaz de eliminarlas»— desapareció: ya están dadas de
baja.

`listBySupplierAlive` gana `deletedAt: null` en su `where`, además de la comprobación de proveedor
vivo que ya tiene (R22).

### 6.5 Lo que NO cambia en `proveedores`

Todo el CRUD de proveedores, la autorización (`requireAdmin` en la primera línea de los nueve casos
de uso), la paginación vía `lib/shared/pagination`, el patrón de Server Actions con `FormData`, la
traducción de errores por `code`, y las tres reglas de base que QC-43 acaba de poner (contacto
parcial, costo `> 0`, autoría de la línea). La decisión cerrada 7 lo dice: **no es trabajo
perdido**.

El orden del listado sigue siendo `created_at ASC, id ASC`. **No** se cambia a `name ASC` aunque
ahora la línea tenga nombre propio y eso sería lo natural: sería alcance de más y el listado no
tiene pantalla hasta QC-44. Queda anotado como candidato para esa ficha.

---

## 7. Contratos de entrada y salida

```ts
// domain/catalog-line-view.ts (después)
export type CatalogLineFields = {
  readonly name: string;            // recortado y no vacío al normalizar
  readonly presentationId: string;  // uuid, OBLIGATORIO
  readonly unitId: string | null;   // uuid, opcional
  readonly imagePath: string | null;
  readonly cost: string;            // CADENA decimal, nunca number
  readonly minPurchase: string | null;
  readonly deliveryTime: number | null;
};

export type NewCatalogLine = CatalogLineFields & { readonly supplierId: string };

export type CatalogLineView = CatalogLineFields & {
  readonly id: string;
  readonly supplierId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
};
```

`cost` y `minPurchase` siguen viajando como **cadena** por todo el recorrido (R11): el dominio no
importa `@prisma/client` y el binario de coma flotante está prohibido para importes. La conversión
a `Prisma.Decimal` y la vuelta con `.toFixed(4)` viven **solo** en el adaptador driven, como hoy.

`name` reutiliza el esquema de nombre del proveedor: `trim()` **antes** de `min(1)` (si se aplicara
después, `'   '` pasaría el mínimo) y máximo 120, el mismo largo que el nombre de producto (QC-20
D11) y el de proveedor (QC-43 P6). El rechazo del nombre que **normaliza a vacío** —`'###'`— es una
comprobación aparte, porque `zod` no la expresa: la hace el caso de uso, igual que
`create-supplier.ts`.

`imagePath` en el borde: `z.string().min(1).nullish()`. **Sin patrón de forma**, por el mismo
motivo que la migración de `products.image_path` no le puso `CHECK`: la forma de la ruta no está
acordada en el repo y un patrón inventado aquí sería la definición de facto de algo que nadie
decidió (P1).

---

## 8. Tests que se caen y tests que nacen

Se caen (con la regla que los sostenía): los de `create-catalog-line` que verifican
`ProductNotFoundError`, los que fijan el duplicado por `(supplier_id, product_id)`, los que fijan
el `RESTRICT` de producto, los que comprueban que `listCatalogLines` resuelve `productName` por
`findRefs`, y el que fija el **borrado físico** de la línea (QC-43 R34). El de `scope.test.ts` que
afirma qué importa `proveedores` **no se cae: se invierte** — pasa a afirmar que `inventario` **no**
aparece.

Nacen, como mínimo: unicidad `(proveedor, nombre normalizado, presentación)` en integración contra
Postgres real; dos presentaciones del mismo nombre conviviendo (R16); baja de proveedor arrastrando
sus líneas en la misma transacción y con la misma marca (R20); censo de columnas de `products` y de
`supplier_catalog_lines` tras la migración (R1, R2, R8); el `down.sql` aplicado y el esquema
comparado (R28); el test de esquema que exige `imagePath` en el modelo `Product` (R4); y el test de
migración que afirma que el SQL **no contiene** ningún `DROP CONSTRAINT` de las FK enumeradas en
R29 —ese es un test de texto sobre el `migration.sql`, del mismo tipo que
`tests/unit/proveedores/schema/proveedores-migration.test.ts`—.

---

## 9. Dependencias

**Ninguna nueva** (R34, decisión cerrada 16). Nada de lo que esta ficha necesita —normalización de
texto, decimales, índices parciales, transacciones— sale del stack ya aprobado: `zod` en el borde,
`Prisma.Decimal` para importes, `prisma.$transaction` para la atomicidad, y `normalizeSupplierName`
que ya existe en el módulo. No se propone ninguna librería, así que no hay cuatro checks que
reportar ni fila que añadir a `docs/dependencias.md`.

---

## 10. Alternativas descartadas

### 10.1 Dejar una referencia **opcional** al producto en la línea

Es la alternativa obvia y **la tabla de decisiones ya la cerró en contra** (decisión 3): se anota
aquí porque es la que cualquiera propondría al leer el diseño y conviene que el «no» esté razonado
donde se lee. Habría conservado la posibilidad de comparar precios entre proveedores. Se descarta
porque una columna anulable que a veces apunta y a veces no **es lo peor de los dos mundos**: no se
puede confiar en ella para ninguna consulta (siempre hay que contemplar el `NULL`) y a la vez
arrastra la FK, el `RESTRICT`, la traducción de su error y la pregunta «¿por qué esta línea no
apunta a nada?» en cada pantalla. La decisión cerrada 3 asume a conciencia la consecuencia: el
sistema **no podrá** responder «a cuánto me vende cada proveedor este producto». Si algún día se
quiere, es ficha propia, y la vía razonable no es esta columna sino una tabla de equivalencias.

### 10.2 Dos migraciones en vez de una

Separar «el producto adelgaza» de «la línea engorda» habría dado dos diffs más legibles y dos
`down.sql` más simples. Se descarta porque **duplica el trabajo caro**: la parte difícil de esta
migración no es el SQL, es **auditar el SQL generado línea a línea** contra la lista de § 3.1, y
esa auditoría hay que hacerla entera **en cada** generación. Dos migraciones son dos auditorías con
la misma lista de dieciséis restricciones, y la segunda es exactamente donde baja la guardia. La
decisión cerrada 9 ya fija «una sola»; esto explica por qué sale a cuenta.

### 10.3 Mover `stock` y `qty_alert` fuera del producto de paso

Tentador —«ya que separamos lo que la cosa es de lo que hay de ella»— y **fuera de alcance**. La
existencia es del producto hasta que exista un modelo de movimientos de inventario, que no está en
ninguna ficha del board. Meterlo aquí convertiría una reforma acotada en un rediseño, y la decisión
cerrada 1 dice explícitamente que el producto **conserva** los dos.

### 10.4 Resolver la unicidad con un `SELECT` previo en vez de un índice parcial

Descartada por lo de siempre y se escribe porque es el error que más veces se cuela: entre el
`SELECT` y el `INSERT` cabe otra transacción, así que dos altas simultáneas con el mismo nombre
crearían dos filas y el mensaje bonito habría servido para nada. El índice es la garantía; el
`SELECT` sería, como mucho, un mensaje más temprano — y ni eso, porque el `23505` ya da uno. Por eso
el puerto **no expone** ningún método de búsqueda por nombre: lo que no se puede expresar no se
puede hacer por descuido.
