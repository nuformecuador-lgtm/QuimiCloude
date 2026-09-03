# QC-42 — modelo-proveedores · design.md

> Zona: `backend` · Complejidad: `medium` · depends_on: `QC-14` ·
> Rama: `feature/QC-42-modelo-proveedores`
>
> El **qué** está en `requirements.md` (R1–R36) y su alcance lo cerró el humano el 2026-09-03 en
> la tabla de 22 decisiones. Aquí va el **cómo**: la forma exacta de los dos modelos, el SQL que
> hay que escribir a mano porque Prisma no lo modela, cómo nace el módulo `proveedores` y por qué
> el cruce de frontera hacia `inventario` **no lo detecta ninguna guardia** y hay que probarlo
> aparte.
>
> **Precedente literal: `specs/QC-24-modelo-recetas/`.** Esta feature es la misma forma —tabla
> padre con borrado lógico y nombre único normalizado, más tabla de líneas que cruza la frontera
> hacia `inventario`— y **no se inventa nada nuevo donde QC-24 ya decidió**. Cada vez que este
> diseño se aparta de QC-24, lo dice y explica por qué. Los otros dos precedentes citados:
> **QC-32 — modelo-unidades** (módulo hexagonal creado desde cero, `requirements.md` disponible;
> su `design.md` y su `tasks.md` todavía no están en `dev` el 2026-09-03) y **QC-14 —
> modelo-producto** (`products`, de donde cuelga el `product_id` del catálogo, y el reparto de
> tests estáticos/integración).

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `db/schema.prisma` | Se **añaden** dos modelos: `Supplier` y `SupplierCatalogLine`, con `/// @module proveedores`. **No se toca ningún modelo existente**, y en particular **no se toca `Product`** (decisión 2, R19). |
| `db/migrations/<ts>_suppliers_and_supplier_catalog_lines/migration.sql` | UP: dos `CREATE TABLE`, la FK interna, **las tres FK escritas a mano** (producto y las dos de auditoría), los índices, los **cuatro** `CHECK` (tres de no-negatividad más el de contacto), el índice único parcial del nombre normalizado y los cuatro `ALTER` de RLS. |
| `db/migrations/<ts>_suppliers_and_supplier_catalog_lines/down.sql` | DOWN manual (convención propia, `docs/architecture.md > Migraciones up/down`). **Obligatorio**: `./init.sh` falla si falta. |
| `lib/modules/proveedores/index.ts` | **Nuevo**: contrato público del módulo. |
| `lib/modules/proveedores/domain/supplier-name.ts` | **Nuevo**: `normalizeSupplierName`, la única definición de la normalización (R8). |
| `lib/modules/proveedores/ports/.gitkeep`, `.../adapters/driven/.gitkeep`, `.../adapters/driving/.gitkeep` | **Nuevos**: carpetas vacías del armazón, igual que QC-24 con `recetas`. |
| `tests/unit/proveedores/schema/proveedores-schema.test.ts` | Contrato estático del esquema. |
| `tests/unit/proveedores/schema/proveedores-migration.test.ts` | Contrato estático del SQL. |
| `tests/unit/proveedores/domain/supplier-name.test.ts` | La normalización del nombre. |
| `tests/unit/proveedores/module-contract.test.ts` | La forma del módulo nuevo y la frontera con `inventario` / `identity`, **incluido el cruce por ORM** (§ 5.4). |
| `tests/integration/proveedores/proveedores-constraints.int.test.ts` | Constraints contra Postgres real, incluido el `CHECK` de contacto (§ 4.4). |

**`lib/modules/inventario/index.ts` NO se toca.** QC-24 ya publicó ahí `ProductId`, `ProductRef`
y `ProductCatalog`, que es exactamente la costura que la decisión 1 pide para que `proveedores`
conozca al producto sin tocar su tabla. Ampliarlo «por si acaso» va contra
`docs/architecture.md > Dominio` n.º 1; si QC-43 necesita más campos del producto, los añade
entonces.

**`lib/composition/index.ts` NO se toca.** Ver § 5.5: el encargo del leader pedía cablearlo, y
este diseño responde que **hoy no hay nada que cablear** y deja escrita la forma exacta que
QC-43 tendrá que añadir. Es la misma conclusión a la que llegó QC-24 (§ 5.4 de su `design.md`,
task T6): componer es elegir qué implementación concreta cumple un puerto, y en esta ficha no hay
ni puertos ni adaptadores. Un `export const proveedores = {}` sería una fachada vacía que nadie
consume y que el reviewer rechazaría como código muerto.

---

## 2. Modelo de datos

### 2.1 `Supplier` → tabla `suppliers`

```prisma
/// Proveedor del ERP quimico. Borrado LOGICO: `deletedAt` NULL = proveedor vivo.
/// NO hay estado activo/inactivo aparte (decision cerrada 10, R26): un segundo estado que
/// nadie sabe distinguir del primero es deuda, no informacion.
///
/// OJO 1 — `createdBy` y `updatedBy` son FK REALES a `users`, pero se declaran como
/// ESCALARES SIN `@relation` a proposito (decision cerrada 14, R22): la FK esta escrita a
/// mano en `migration.sql`. Asi la base garantiza la integridad y, a la vez, el cliente
/// Prisma NO puede atravesar de `proveedores` a `users` con un `include`. La guardia de
/// modulos NO detectaria ese cruce, porque no es un import.
/// Son ANULABLES: NULL significa «no lo creo una persona» —una importacion, un seed—, no
/// «se perdio el dato». Heredado de QC-24 (decision cerrada 22 de aquella ficha).
///
/// OJO 2 — la unicidad del nombre NO esta aqui como `@unique` y es deliberado: es un indice
/// unico PARCIAL (`WHERE deleted_at IS NULL`) sobre `name_normalized`, y Prisma no modela
/// indices parciales. Vive escrito a mano en `migration.sql` (`suppliers_name_unique`).
///
/// OJO 3 — la regla cruzada «al menos telefono o correo» (decision cerrada 7, R4) es un
/// CHECK en la base (`suppliers_contact_required`) y Prisma NO modela CHECK: por eso las dos
/// columnas se ven aqui como simplemente opcionales. Vive escrito a mano en `migration.sql`.
/// @module proveedores
model Supplier {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name           String
  nameNormalized String    @map("name_normalized")
  phone          String?
  email          String?
  createdBy      String?   @map("created_by") @db.Uuid
  updatedBy      String?   @map("updated_by") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(6)

  catalogLines SupplierCatalogLine[]

  @@index([createdBy], map: "suppliers_created_by_idx")
  @@index([updatedBy], map: "suppliers_updated_by_idx")
  @@map("suppliers")
}
```

| Campo | Columna | Tipo Postgres | Nulo | Requisito |
| --- | --- | --- | --- | --- |
| `id` | `id` | `UUID DEFAULT gen_random_uuid()` | no | R1 |
| `name` | `name` | `TEXT` | **no** | R1, R2, R5 |
| `nameNormalized` | `name_normalized` | `TEXT` | **no** | R7, R8 |
| `phone` | `phone` | `TEXT` | sí | R1, R3, R4, R5, R6 |
| `email` | `email` | `TEXT` | sí | R1, R3, R4, R5, R6 |
| `createdBy` | `created_by` | `UUID` | sí | R24 |
| `updatedBy` | `updated_by` | `UUID` | sí | R24 |
| `createdAt` | `created_at` | `TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP` | no | R27 |
| `updatedAt` | `updated_at` | `TIMESTAMPTZ(6)` (lo rellena `@updatedAt`) | no | R27 |
| `deletedAt` | `deleted_at` | `TIMESTAMPTZ(6)` | sí | R26 |

Lo que no es evidente:

- **`phone` y `email` son `TEXT` opcionales y sin índice único** (decisión 9, R6). Se aparta a
  propósito de **QC-4**, donde el correo del **usuario** sí es único: un mismo contacto comercial
  puede atender a dos proveedores. Tampoco hay `CHECK` de formato: el correo lo valida `zod` en
  QC-43.
- **La obligatoriedad cruzada no se ve en el esquema.** Prisma no modela `CHECK`, así que el
  esquema solo dice «los dos son opcionales». Sin el comentario OJO 3, el siguiente que lea creerá
  que la regla se perdió. Vive en § 4.4.
- **`created_by` / `updated_by` son anulables** y sin `@relation`: idéntico a `recipes`
  (QC-24 § 2.1 y § 4.1), por el mismo motivo y con el mismo coste. `NULL` es «no lo creó una
  persona», no «se perdió el dato».
- **Índices sobre `created_by` y `updated_by`.** Postgres no indexa el lado hijo de una FK y el
  `RESTRICT` al borrar un usuario pasa por ahí. Mismo motivo que `users_role_id_idx` en QC-4 y que
  `recipes_created_by_idx` en QC-24.
- **`suppliers` no lleva `@@index([deletedAt])`**: el índice único parcial de § 4.3 ya cubre el
  predicado y el padrón de proveedores de una sola empresa no justifica un índice más hoy. Misma
  posición que QC-24 (pregunta abierta 1 de su diseño).

### 2.2 `SupplierCatalogLine` → tabla `supplier_catalog_lines`

```prisma
/// Linea del catalogo de un proveedor: la pareja proveedor-producto como ENTIDAD PROPIA, con
/// su costo, su minimo de compra y su tiempo de entrega (decision cerrada 3).
///
/// NO lleva `deletedAt` a proposito (decision cerrada 11, R28): la linea es parte del
/// catalogo, no un hecho historico. Tampoco lleva `createdBy`/`updatedBy` (decision cerrada
/// 14, R25), igual que `recipe_lines`.
///
/// OJO — `productId` es una FK REAL a `products` declarada como ESCALAR SIN `@relation`
/// (decision cerrada 13, R22). La FK esta escrita a mano en `migration.sql`. Lo que
/// `proveedores` sabe del producto llega por el contrato publico `@/lib/modules/inventario`,
/// nunca por un `include` ni por `prisma.product`.
///
/// OJO 2 — los tres CHECK de no negatividad (`cost`, `min_purchase`, `delivery_time`) son
/// SQL escrito a mano: Prisma no modela CHECK. Ver `design.md > 4.4`.
/// @module proveedores
model SupplierCatalogLine {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  supplierId   String   @map("supplier_id") @db.Uuid
  productId    String   @map("product_id") @db.Uuid
  cost         Decimal  @db.Decimal(14, 4)
  minPurchase  Decimal? @map("min_purchase") @db.Decimal(14, 4)
  deliveryTime Int?     @map("delivery_time")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@unique([supplierId, productId], map: "supplier_catalog_lines_supplier_id_product_id_key")
  @@index([productId], map: "supplier_catalog_lines_product_id_idx")
  @@map("supplier_catalog_lines")
}
```

| Campo | Columna | Tipo Postgres | Nulo | Requisito |
| --- | --- | --- | --- | --- |
| `id` | `id` | `UUID DEFAULT gen_random_uuid()` | no | R10 |
| `supplierId` | `supplier_id` | `UUID` | no | R10, R29 |
| `productId` | `product_id` | `UUID` | **no** | R13, R22, R31 |
| `cost` | `cost` | `DECIMAL(14,4)` | **no** | R13, R14, R17 |
| `minPurchase` | `min_purchase` | `DECIMAL(14,4)` | **sí** | R13, R14, R15, R17 |
| `deliveryTime` | `delivery_time` | `INTEGER` | **sí** | R13, R16, R17 |
| `createdAt` / `updatedAt` | ídem | `TIMESTAMPTZ(6)` | no | R27 |

- **`cost` es `Decimal(14,4)` obligatorio, nunca `Float`** (decisión 5, R14):
  `docs/architecture.md > Anti-patrones` lo prohíbe explícitamente para importes. Es el mismo tipo
  que `products.cost` (QC-14) y que `recipe_lines.quantity` (QC-24).
- **`min_purchase` es `Decimal(14,4)` y opcional, no entero** (decisión 6, R15). Se aparta a
  propósito de `products.min_purchase`, que es `Int @default(0)`: allí es una cantidad interna
  redonda; aquí es una condición comercial del proveedor y en químicos viene en peso o volumen.
  Y es **opcional sin defecto**, no `0`: la decisión 4 dice que el mínimo se confirma después, y
  un `0` por defecto haría indistinguible «sin mínimo pactado» de «mínimo cero» —el error que
  `products.min_purchase` ya arrastra—. Ver también la pregunta abierta 4 de `requirements.md`:
  el mínimo no dice en qué unidad se mide, y esta ficha **no** añade columna de unidad.
- **`delivery_time` es `Int` opcional, en días** (decisión 5, R16), idéntico a
  `products.delivery_time` de QC-14.
- **`@@unique([supplierId, productId])`** implementa R11 y sirve además de índice para «líneas de
  este proveedor» (Postgres usa el prefijo izquierdo del índice compuesto). Por eso **no** se añade
  un `@@index([supplierId])` aparte: sería redundante. Mismo razonamiento que QC-24.
  El índice es **total, no parcial**: la línea no tiene borrado lógico, así que no hay filas
  muertas de las que protegerse.
- **`@@index([productId])`**: lado hijo de la FK a `products`, por el que pasa la verificación del
  `RESTRICT` y la futura pregunta «¿qué proveedores me venden este producto?», que es justo lo que
  QC-44 va a pintar.
- **La relación con `Supplier` sí lleva `@relation`**: es intra-módulo, no cruza ninguna frontera,
  y es la que da el `ON DELETE CASCADE` de § 4.2.

---

## 3. La normalización del nombre (R7, R8)

Idéntica en forma y en motivo a `normalizeRecipeName` (QC-24 § 3) y a
`normalizePresentationName` (QC-20). La decisión 8 exige **columna persistida + índice único**, no
comparación al vuelo, y la columna la escribe **la aplicación**, no la base:

- Una columna `GENERATED ALWAYS AS (...) STORED` y un índice funcional solo admiten expresiones
  **`IMMUTABLE`**. `unaccent()` es **`STABLE`** (depende de un diccionario configurable), así que
  no sirve sin envolverla en una función PL/pgSQL propia, sin dueño y sin test, y con la extensión
  `unaccent` como dependencia nueva de la base.
- Además dejaría la normalización viviendo en SQL, fuera del alcance de cualquier test unitario.

```ts
// lib/modules/proveedores/domain/supplier-name.ts
/** Forma canonica para comparar nombres de proveedor: sin acentos, sin caracteres especiales
 *  y sin distinguir mayusculas. «Quimicos del Pacifico S.A.», «quimicos-del-pacifico sa» y
 *  «QUIMICOS DEL PACIFICO S A» producen la misma clave. Es la UNICA definicion (R8): la
 *  columna `name_normalized` y cualquier consulta futura usan esta.
 *  Misma forma que `normalizeRecipeName` (QC-24) y `normalizePresentationName` (QC-20). */
export function normalizeSupplierName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
```

Función pura, sin imports (`docs/architecture.md > La regla de dependencias`: el dominio solo
importa paquetes puros). **No se factoriza en `lib/shared/`** aunque sea la tercera copia casi
idéntica del repo: `lib/shared/**` no puede importar módulos y los módulos no deben depender de
`shared` desde el dominio; además unificarlas ataría tres reglas de negocio distintas a un mismo
cambio futuro. Es una decisión consciente, no un descuido — y si el humano prefiere lo contrario,
es una ficha de arnés, no de esta feature.

**Por qué esta pieza de dominio sí entra en una ficha de modelo:** la columna `name_normalized`
no significa nada sin su algoritmo, y si el algoritmo llegara en QC-43 acabaría existiendo dos
veces. No hay tipos `Supplier`/`SupplierCatalogLine` en `domain/` porque nadie los consume todavía
y serían código muerto (mismo criterio que QC-14 § 5 y QC-24 § 3).

---

## 4. Lo que va a mano en `migration.sql`

Prisma Migrate genera las dos `CREATE TABLE`, la FK proveedor→línea, el índice único compuesto y
los índices simples. **No genera**: las tres FK que cruzan de módulo (§ 4.1), los cuatro `CHECK`
(§ 4.4), el índice único **parcial** del nombre (§ 4.3) y los `ALTER` de RLS (§ 4.5). Se escriben
a mano encima del archivo generado, con la misma cabecera de aviso que pusieron QC-14 y QC-24:
**todo eso es DRIFT para Prisma** y cualquier migración futura sobre estas tablas hay que
revisarla a mano para que no lo borre.

### 4.1 Las tres FK escritas a mano (R22, R24, R31)

```sql
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Es el punto crítico de la feature.** Hay dos garantías que se quieren a la vez y que
normalmente se estorban:

1. **Integridad referencial real.** Una línea que apunte a un producto inexistente es basura en un
   ERP; un proveedor cuyo autor no existe, también. Solo lo garantiza una FK de verdad (R24, R31).
2. **Frontera de módulo.** `proveedores` no puede leer `products` ni `users`
   (`CHECKPOINTS.md > Modulos hexagonales`, QC-15). Si la FK se declarase con `@relation`, el
   cliente generado ofrecería
   `prisma.supplierCatalogLine.findMany({ include: { product: true } })`: la frontera se cruzaría
   con **una línea de código que ninguna guardia detecta**, porque
   `tests/guards/guard-arquitectura-modulos.test.ts` busca **imports** y la cadena
   `prisma.<modelo>`, y un `include` no es ni una cosa ni la otra.

La decisión 13 (heredada de QC-24 D3, que a su vez viene de QC-20 D8) resuelve las dos: **campo
escalar en Prisma + FK real en SQL**. La base sabe de la relación; el ORM no.

Coste que se acepta, escrito para que nadie lo descubra tarde: Prisma **no valida** estas FK al
generar el cliente, así que renombrar `products.id` o `users.id` no rompe nada hasta que la
migración falla en la base; el error de integridad llega siempre en **tiempo de ejecución**
(SQLSTATE `23503`), no en el tipo; y `prisma migrate dev` verá **drift** si alguien regenera la
migración sin conservarlas a mano.

`ON DELETE RESTRICT` en las tres: el borrado de producto y el de usuario son **lógicos** (QC-20 D5,
QC-4), así que en operación normal el `RESTRICT` nunca se dispara; existe para que un borrado
físico por consola o por script no deje líneas apuntando al vacío. Es lo que hace verdadera la
decisión 12 (R31). **No se usa `ON DELETE SET NULL`** en las de auditoría, aunque la columna lo
permitiría: convertiría «al usuario lo borraron» en «no lo creó una persona», que son cosas
distintas.

### 4.2 `ON DELETE CASCADE` de proveedor a línea, y qué significa con borrado lógico (R29, R30)

```sql
-- generada por Prisma a partir de `supplier Supplier @relation(..., onDelete: Cascade)`
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**La misma trampa que QC-24 § 4.2, y conviene repetirla en voz alta.** La decisión 10 dice que el
proveedor se borra **lógicamente**; la decisión 11 dice `ON DELETE CASCADE` desde el proveedor y
añade, con toda razón, «que hoy no llega a dispararse». Un borrado lógico es un
`UPDATE deleted_at = now()`, y **ninguna FK reacciona a un `UPDATE`**:

- En el uso normal, «el catálogo se va con el proveedor» significa que **las líneas solo se
  alcanzan a través de su proveedor**, y un proveedor borrado lógicamente no se devuelve en
  ninguna consulta. Ese filtro lo pone QC-43; aquí no hay consultas. Lo que **sí** garantiza esta
  ficha es que la línea sigue existiendo intacta (R30).
- El `CASCADE` es la red para el borrado **físico** (una purga, un script, el `down.sql`): si una
  fila de `suppliers` desaparece de verdad, sus líneas se van con ella y no queda ninguna huérfana
  (R29). Es testeable y se testea.

### 4.3 El índice único parcial del nombre (R7, R9)

```sql
-- Unicidad del nombre normalizado (decision cerrada 8). PARCIAL: un proveedor dado de baja
-- libera su nombre (R9). Prisma no modela indices parciales, asi que este indice vive SOLO
-- aqui: si alguien anade `@unique` en el esquema, la unicidad pasa a alcanzar tambien a los
-- proveedores borrados y R9 deja de cumplirse en silencio.
CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("name_normalized") WHERE "deleted_at" IS NULL;
```

Idéntico en forma a `recipes_name_unique` (QC-24) y a `users_email_unique` (QC-4). **No** es
funcional (`lower(...)`) porque la columna ya viene normalizada por § 3: la garantía la da el
índice, no una comparación al vuelo.

### 4.4 Los cuatro `CHECK` (R4, R17)

```sql
-- No negatividad (decision cerrada 5, R17). En SQL un CHECK que evalua a NULL SE CUMPLE, asi
-- que estos aceptan la fila sin valor: la ausencia de `min_purchase` y de `delivery_time` es
-- legitima (R13) y quien la prohibe donde no lo es es el NOT NULL de `cost`.
-- Es `>= 0`, no `> 0`: la decision 5 dice «ninguno admite negativos». Que un costo de 0 sea
-- valido es la pregunta abierta 1 de `requirements.md` y hoy la respuesta de la base es que si.
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_cost_non_negative"          CHECK ("cost" >= 0);
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_min_purchase_non_negative"  CHECK ("min_purchase" >= 0);
ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_delivery_time_non_negative" CHECK ("delivery_time" >= 0);

-- Regla cruzada «al menos telefono o correo» (decision cerrada 7, R4). Vive EN LA BASE a
-- proposito: la garantiza el esquema, no solo la aplicacion. Un proveedor sin ninguno de los
-- dos es un proveedor al que no se puede comprar.
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_contact_required"
  CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL);
```

Sobre `suppliers_contact_required`, tres cosas que hay que saber antes de escribirlo:

1. **Solo mira ausencia de valor.** `phone = ''` lo satisface. Es la **pregunta abierta 6** de
   `requirements.md`, y la posición por defecto de este diseño es dejarlo así y que QC-43 rechace
   el texto en blanco con `zod`, coherente con la decisión 15.
2. **Alcanza también a los proveedores dados de baja** (`CHECK` se evalúa en toda fila).
   Consecuencia anotada en la **pregunta abierta 8**.
3. **Se dispara igual en `INSERT` y en `UPDATE`**, así que un `UPDATE` que borre el único contacto
   falla con SQLSTATE `23514`. R4 lo dice explícitamente («persistir **o modificar**») y el test de
   integración cubre los dos caminos.

### 4.5 RLS (R33)

```sql
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "supplier_catalog_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_catalog_lines" FORCE ROW LEVEL SECURITY;
```

Sin policies, *deny by default*, igual que QC-4, QC-14 y QC-24. **No es la frontera de
autorización**: esa vive en el service y la fija QC-43 (decisión 20).
`tests/guards/guard-rls-force.test.ts` cubre esta migración sola, sin tocar la guardia.

### 4.6 Orden del UP

`pgcrypto` (`CREATE EXTENSION IF NOT EXISTS`, autocontenida) → `suppliers` →
`supplier_catalog_lines` → FK proveedor→línea (`CASCADE`) → FK producto → las dos FK de auditoría
→ índices (`supplier_catalog_lines_supplier_id_product_id_key`,
`supplier_catalog_lines_product_id_idx`, `suppliers_created_by_idx`, `suppliers_updated_by_idx`) →
índice único parcial del nombre → los cuatro `CHECK` → cuatro `ALTER` de RLS.

### 4.7 `down.sql` (R34) — obligatorio y guardia del gate

```sql
DROP TABLE IF EXISTS "supplier_catalog_lines";
DROP TABLE IF EXISTS "suppliers";
```

Exactamente dos sentencias, en orden inverso al UP. Nada más: índices, FK y `CHECK` **caen con sus
tablas**, así que no se dropean aparte (mismo criterio que QC-14 y QC-24, y lo mismo vale para las
tres FK escritas a mano: caen con la tabla que las declara). **No se toca `pgcrypto`**: la crean
también QC-4, QC-14 y QC-24, y dropearla rompería las tres.

`./init.sh` valida que toda migración tenga su `down.sql`, así que esto no es una recomendación:
sin el archivo, el gate falla. Y R34 no se cierra con el test estático —que solo lee texto— sino
con el ciclo real `db:migrate` → `db:rollback` → `db:migrate` de la task T10.

---

## 5. El módulo `proveedores`

Es un módulo hexagonal nuevo desde cero, el tercero que se crea así (`recetas` en QC-24,
`unidades` en QC-32). La forma **no se inventa**: se copia de `lib/modules/recetas/`, que es el
precedente exacto —módulo de modelo, sin puertos ni adaptadores todavía—.

### 5.1 Carpetas que nacen

```
lib/modules/proveedores/
  index.ts                       # CONTRATO PUBLICO: solo reexporta de ./domain
  domain/
    supplier-name.ts             # normalizeSupplierName (R8)
  ports/.gitkeep                 # vacia: la llena QC-43
  adapters/
    driven/.gitkeep              # vacia: la llena QC-43
    driving/.gitkeep             # vacia: la llena QC-43
```

Las tres carpetas vacías llevan `.gitkeep` porque git no versiona carpetas vacías; es lo que hizo
QC-24 y QC-43 los borra al poner el primer archivo real. La guardia de módulos exige `index.ts` en
cada módulo y **prohíbe cualquier carpeta que no sea `domain/`, `ports/` o `adapters/`**, así que
no hay margen para inventar una cuarta.

```ts
// lib/modules/proveedores/index.ts — CONTRATO PUBLICO del modulo `proveedores`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente
// sin arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de
// imports. Los adaptadores driving que traiga QC-43 NO pasan por aqui.
export { normalizeSupplierName } from './domain/supplier-name';
```

`proveedores` **no** hay que añadirlo a `REQUIRED_MODULES` de la guardia: la guardia descubre los
módulos leyendo `lib/modules/` y le aplica todas las demás reglas igual. Tocar la guardia no es de
esta ficha.

### 5.2 Qué consume de `inventario`, y qué no

La decisión 1 dice que `proveedores` conoce al producto **por el contrato público de
`inventario`**. Ese contrato **ya existe**: QC-24 publicó `ProductId`, `ProductRef` y
`ProductCatalog` en `lib/modules/inventario/index.ts`. Esta ficha **no lo amplía ni lo toca**,
porque no tiene ningún consumidor: no hay caso de uso que pida referencias de producto. Lo que
esta ficha garantiza es la **prohibición** (R21, R22), que sí es testeable hoy; el consumo
positivo llega en QC-43:

```ts
// asi, en QC-43:
import type { ProductCatalog, ProductId } from '@/lib/modules/inventario';          // SI
// import type { ProductRef } from '@/lib/modules/inventario/domain/product-catalog'; // NO
// import { prisma } from '@/lib/shared/db/prisma'; ... prisma.product ...            // NO
```

### 5.3 Nada de `identity`

`proveedores` guarda `created_by` y `updated_by` pero **no importa nada de `identity`**: el actor
se lo pasará QC-43 desde su Server Action, como hace `inventario` con su `Actor`. Aquí no hay ni
tipo `Actor` propio: sería código muerto.

### 5.4 El cruce por ORM: por qué hace falta un test que la guardia no da (R22)

`tests/guards/guard-arquitectura-modulos.test.ts` compara **imports** y busca la cadena
`prisma.<modelo>` fuera del módulo propietario. Las dos cosas son necesarias y ninguna ve el
cruce que aquí importa: si `SupplierCatalogLine` declarase `product Product @relation(...)`,
cualquier adaptador driven de `proveedores` podría escribir
`prisma.supplierCatalogLine.findMany({ include: { product: true } })` —consulta legítima sobre
**su propio** modelo— y leer la tabla de `inventario` sin un solo import prohibido y sin la cadena
`prisma.product`. La guardia quedaría verde.

Por eso la afirmación se prueba **contra el cliente generado**, no contra el texto del esquema:

```ts
// tests/unit/proveedores/module-contract.test.ts (idea, no literal)
import { Prisma } from '@prisma/client';

const relationFields = (model: string) =>
  Prisma.dmmf.datamodel.models
    .find((m) => m.name === model)!
    .fields.filter((f) => f.kind === 'object')
    .map((f) => f.type);

// La UNICA relacion que Prisma conoce desde el catalogo es su propio proveedor.
expect(relationFields('SupplierCatalogLine')).toEqual(['Supplier']);
expect(relationFields('Supplier')).toEqual(['SupplierCatalogLine']);
// Y en sentido contrario: `Product` y `User` no ganan ningun campo de vuelta.
expect(relationFields('Product')).not.toContain('SupplierCatalogLine');
expect(relationFields('User')).not.toContain('Supplier');
```

`Prisma.dmmf` es el modelo de datos **tal como el cliente lo entiende**, así que esto falla en el
instante en que alguien añade el `@relation` «que faltaba» — que es exactamente el fallo del que
hay que protegerse, y el que ningún otro test del repo detecta. Es un test **de sensibilidad
inherente**: no puede quedarse verde por accidente.

### 5.5 `lib/composition/` — qué NO se toca hoy, y qué añadirá QC-43

El encargo del leader pedía cablear el módulo en `lib/composition/`. **La respuesta de este
diseño es que hoy no hay nada que cablear, y por eso el archivo no se toca**; la task T5 lo
convierte en una comprobación explícita en vez de en un olvido. Cablear es elegir qué
implementación concreta cumple un puerto (`docs/architecture.md > Punto unico de composicion`) y
esta ficha no crea ni un puerto ni un adaptador: un `export const proveedores = {}` sería una
fachada vacía sin consumidor. Es la misma conclusión que QC-24 (§ 5.4, T6) y la que el reviewer
aceptó allí.

Lo que QC-43 tendrá que escribir, para que no lo improvise:

```ts
// lib/composition/index.ts (QC-43, no ahora)
import { createSaveSupplier /* ... */ } from '@/lib/modules/proveedores';
import { /* repositorio */ } from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-repository-prisma';
import { findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import type { ProductCatalog } from '@/lib/modules/inventario';

const productCatalog: ProductCatalog = { findRefs: findProductRefs };
export const proveedores = { saveSupplier: createSaveSupplier({ products: productCatalog /* ... */ }) } as const;
```

Nótese que `product-catalog-prisma.ts` **tampoco existe todavía**: lo trae QC-25 o QC-43, el que
llegue primero. Si al implementar QC-43 ya lo hubiera puesto QC-25, se reutiliza; no se escribe
una segunda implementación.

---

## 6. Contratos de entrada/salida

**Ninguno externo.** Esta feature no expone endpoints, ni rutas, ni Server Actions, ni servicios
(R35). El único contrato que produce es interno: `normalizeSupplierName`, publicado por
`@/lib/modules/proveedores` (§ 3). El segundo «contrato» es el cliente Prisma generado del
esquema.

**Integraciones externas:** ninguna.

**Permisos:** ninguno se decide aquí (decisión 20). No hay service que autorizar, y
`CHECKPOINTS.md > Permisos` no aplica a una ficha sin caso de uso. Los fija QC-43 con su test en
el service, que es la frontera real (`docs/architecture.md > Acceso a datos y autorizacion`).

---

## 7. Dependencias de terceros

**Ninguna dependencia nueva** (decisión cerrada 22, R36). Regla 7 de `CLAUDE.md` sin propuesta que
abrir: no hay ninguna librería que este diseño necesite y no tenga, así que **no se propone
ninguna** y `tests/guards/guard-dependencias-aprobadas.test.ts` seguirá verde sin tocar
`package.json` — ese es exactamente el criterio de R36.

Tres candidatas que podrían parecerlo y **no** lo son, con su porqué (los cuatro checks de
`docs/architecture.md > Dependencias de terceros` no llegan a evaluarse porque ninguna se propone):

| Candidata | Qué haría | Por qué no entra |
| --- | --- | --- |
| `unaccent` (extensión de Postgres) | Quitar acentos en SQL para el índice único | Es `STABLE`, no `IMMUTABLE`: no sirve para un índice ni para una columna generada (§ 3). Además es extensión de la base, no un paquete npm, y ataría el esquema a que Supabase la tenga habilitada. |
| `slugify` / `speakingurl` | La normalización del nombre | `String.prototype.normalize('NFD')` es del estándar y resuelve el caso en cuatro líneas puras y testeadas. Ya se decidió así dos veces (QC-20, QC-24) y cambiarlo ahora crearía una tercera semántica. |
| `libphonenumber-js` / `validator` | Validar teléfono y correo | **Aquí no se valida ningún formato** (decisión 9, R6). El correo lo valida `zod` —ya aprobado— en **QC-43**; si allí hiciera falta algo más para el teléfono, es propuesta de QC-43 por la regla 7, no de esta ficha. |

---

## 8. Alternativas descartadas

### 8.1 Declarar la FK a `products` y las de auditoría con `@relation` de Prisma — **descartada**

Es lo natural y lo que Prisma empuja a hacer: daría `include`, tipos ligados y validación del
esquema. Se descarta porque **regala precisamente el cruce de frontera que QC-15 prohíbe** y que
**ninguna guardia detecta** (§ 4.1, § 5.4). La decisión 13 lo cierra. Coste asumido y escrito:
Prisma no valida esas FK, el error llega en tiempo de ejecución y hay que protegerlas del drift a
mano en cada migración futura.

### 8.2 Índice único **total** sobre `name_normalized` — **descartada**

Sería más simple y Prisma lo modelaría solo (`@unique`). Se descarta porque `suppliers` tiene
borrado lógico: con índice total, dar de baja un proveedor **quema su nombre para siempre**. La
decisión 8 pide explícitamente el índice **parcial**. Es el mismo camino que recorrieron QC-4 y
QC-24.

### 8.3 Una columna de estado `is_active` además de `deleted_at` — **descartada por el humano**

Consta para que no se reconsidere: la decisión 10 lo cierra («un segundo estado que nadie sabe
distinguir del primero es deuda, no información»). Habría permitido «pausar» un proveedor sin
darlo de baja, a cambio de dos estados que toda consulta futura tendría que combinar y que nadie
sabría explicar. `Presentation` y `Role` tampoco lo tienen.

### 8.4 Hacer cumplir «al menos teléfono o correo» solo en la aplicación — **descartada por el humano**

Sería una regla `zod` en QC-43 y ninguna migración. Se descarta porque la decisión 7 dice
literalmente que la garantiza **el esquema, no solo la aplicación**: un `INSERT` por consola, un
seed o una importación masiva se saltan la validación de aplicación entera, y un proveedor sin
ningún contacto es un proveedor al que no se puede comprar. El coste es el de la pregunta abierta
8: el `CHECK` alcanza también a las filas dadas de baja.

### 8.5 `min_purchase` entero, como en `products` — **descartada por el humano**

Sería consistente con QC-14 y más simple. La decisión 6 se aparta a propósito: en el catálogo el
mínimo es una condición comercial del proveedor y en químicos viene en peso o volumen («2,5 kg de
catalizador»). El precio de la inconsistencia se paga en QC-44, que pintará dos campos con el
mismo nombre y distinto tipo, y está anotado aquí para que a nadie le parezca un error.

### 8.6 Reutilizar `products.cost` y no tener costo en la línea — **descartada por el humano**

Habría evitado la pregunta abierta 3 («nada concilia los dos costos»). La decisión 2 la cierra:
conviven con significados distintos —el del producto es el dato interno de referencia, el del
catálogo es lo que cobra **ese** proveedor— y quitar los del producto rompería QC-20, ya mergeado.

### 8.7 Meter los proveedores dentro de `inventario` — **descartada por el humano**

Consta para no reconsiderarla: la decisión 1 fijó módulo propio, coherente con que Proveedores sea
épica propia (QC-41). Habría ahorrado toda la frontera de § 4.1 y § 5.4, a cambio de un
`inventario` que crece sin límite.

### 8.8 Una tabla de unión sin datos entre proveedor y producto — **descartada por el humano**

La decisión 3 la cierra: cada pareja guarda su costo, su mínimo y su plazo, así que es entidad
propia y no una unión. Consta porque es el modelado por defecto de una relación N:M y alguien
podría «simplificar» hacia allí.

---

## 9. E2E: diferido, con motivo

**No hay test E2E en esta feature y no se propone ninguno** (decisión 21, R35). El motivo no es de
esfuerzo: **no hay flujo navegable que visitar**. Esta ficha es esquema, migración y armazón de
módulo; no crea ninguna ruta, ninguna pantalla, ningún adaptador driving y ninguna Server Action,
así que Playwright no tendría a dónde apuntar. `CHECKPOINTS.md` pide E2E cuando la feature toca
autenticación, permisos, movimientos de inventario, importes o webhooks: esta no mueve
existencias ni dinero, persiste un padrón y un catálogo.

**Quién lo decide:** el E2E de la épica QC-41 lo decide **QC-44 — Pantalla de proveedores**, que
es la que trae la pantalla. Mismo criterio y misma cadena que QC-14 → QC-22, QC-24 → QC-26 y
QC-32 → QC-39.

---

## 10. Riesgo de terreno compartido: QC-32 está tocando los mismos archivos

**Esto no es una nota de color: es la parte de este diseño que más probablemente falle.**
`QC-32 — modelo-unidades` está `in_progress` el 2026-09-03 y está modificando `db/schema.prisma` y
`db/migrations/`, incluyendo la columna `unit` de `products` (su decisión 13: `products.unit` y la
unidad de `recipe_lines` pasan a `unit_id`).

Qué se espera y qué no:

- **QC-42 no toca `products`** (decisión 2, R19), así que el choque **debería** limitarse a (a) el
  archivo `db/schema.prisma`, donde las dos features añaden modelos —conflicto textual de merge,
  no semántico— y (b) el **orden** de las carpetas de migración, que se resuelve por timestamp.
- **No se da por hecho.** Si QC-32 entra en `dev` primero, `db/schema.prisma` traerá `model Unit`
  y `products.unit_id`, y la migración de QC-42 quedará **detrás** de la suya en el historial de
  `_prisma_migrations`. Si entra después, es QC-32 quien tendrá que rebasar. En cualquiera de los
  dos casos hay que **volver a aplicar el ciclo `db:migrate` → `db:rollback` → `db:migrate`
  después del merge**, no antes: una migración validada contra un esquema que ya cambió no está
  validada.
- **Un caso que sí sería semántico:** si QC-32 acabara añadiendo una unidad a la línea de
  catálogo, chocaría con la pregunta abierta 4 de `requirements.md` («el mínimo de compra no dice
  en qué se mide»). Hoy **no está en su alcance** y esta ficha no añade columna de unidad. Si
  apareciera, se para y se pregunta.

Por eso `tasks.md` ordena que la sincronización con `dev` (T13) se haga **antes** de dar por buena
la migración, y que el gate que se corre después sea `./init.sh` **completo**, no `--rapido`: lo
que esta feature acopla es SQL, nombres de archivo y forma del árbol de módulos, y el grafo de
imports no lo ve (`docs/verification.md > Lo que --rapido NO cubre`).

---

## 11. Preguntas abiertas que deja este diseño

Las ocho de `requirements.md` no se repiten aquí (cinco del humano, tres añadidas en F1.2). Estas
tres son propias del diseño, ninguna bloquea la implementación y todas tienen posición por
defecto:

1. **¿Un nombre de proveedor en blanco es un nombre?** `NOT NULL` acepta `''`, y
   `normalizeSupplierName('  ')` devuelve `''`, con lo que **dos proveedores sin nombre chocarían**
   contra el índice único con un mensaje confuso («ya existe un proveedor con ese nombre»). No se
   añade `CHECK` de longitud mínima: la decisión 15 manda los largos a la validación de aplicación
   (QC-43). Mismo síntoma que anotó QC-24.
2. **La normalización del nombre es ya la tercera copia casi idéntica del repo**
   (`presentation-name.ts`, `recipe-name.ts`, `supplier-name.ts`). Se duplica a conciencia (§ 3):
   unificarlas requiere una casa que hoy no existe. Si el humano quiere una, es ficha de arnés.
3. **`delivery_time` no tiene cota superior.** Un plazo de 100.000 días pasa el `CHECK`. No se
   añade: es validación de aplicación de QC-43 y ponerle un techo arbitrario en la base es una
   migración para cambiarlo.

---

## 12. Cómo se verifica

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Estático | `tests/unit/proveedores/schema/proveedores-schema.test.ts` | La **declaración**: campos, obligatoriedad, tipos, `@module proveedores`, ausencia de `@relation` hacia `Product` y `User`, ausencia de `@unique` sobre el nombre, `SupplierCatalogLine` sin `deletedAt` ni columnas de autor, y que **`Product` no cambia**. Lee `db/schema.prisma` como texto: un tipo de TypeScript no distingue obligatorio de con-defecto. |
| Estático | `tests/unit/proveedores/schema/proveedores-migration.test.ts` | El **SQL**: las tres FK a mano con su `RESTRICT`, el `CASCADE` proveedor→línea, `DECIMAL(14,4)`, `INTEGER` para el plazo, los cuatro `CHECK`, el índice único **parcial**, el índice único compuesto, los índices de FK, los cuatro `ALTER` de RLS, que la migración **no menciona `products` ni `users` salvo en las FK**, y que `down.sql` revierte exactamente el UP. Con **tests de sensibilidad** (mutar `>= 0` a `> -1`, quitar el `WHERE deleted_at IS NULL`, cambiar `DECIMAL` por `DOUBLE PRECISION`, cambiar un `RESTRICT` por `CASCADE`, convertir el `OR` del contacto en `AND`): un test que no puede fallar no vigila nada. |
| Unitario | `tests/unit/proveedores/domain/supplier-name.test.ts` | La normalización: acentos, mayúsculas, signos y espacios, cadena vacía e idempotencia (`f(f(x)) === f(x)`), que es la propiedad que hace segura la columna persistida. |
| Unitario | `tests/unit/proveedores/module-contract.test.ts` | La forma del módulo nuevo y la frontera: `index.ts` solo reexporta de `./domain`, carpetas exactamente `domain`/`ports`/`adapters`, ningún `'use server'` alcanzable desde el barrel, ni `prisma.product`, ni `prisma.user`, ni `@prisma/client`, ni rutas profundas a `inventario`/`identity` en `lib/modules/proveedores/**`; **y el cruce por ORM contra `Prisma.dmmf`** (§ 5.4). Afirma además que la feature no crea nada en `adapters/driving/` ni en `app/` (R35). |
| Integración | `tests/integration/proveedores/proveedores-constraints.int.test.ts` | Que la base **de verdad** rechaza y permite lo que debe, incluido el `CHECK` de contacto. Cada caso en `prisma.$transaction` que termina en `ROLLBACK`, cada operación que debe fallar envuelta en `SAVEPOINT`, y se afirma sobre el **SQLSTATE** (`23502`, `23503`, `23505`, `23514`), **nunca** sobre el texto del mensaje: en esta máquina Postgres responde en español. Copiar los helpers de `tests/integration/recetas/recetas-constraints.int.test.ts`. |
| Guardia (ya existe) | `tests/guards/guard-rls-force.test.ts` | R33, sin tocar la guardia. |
| Guardia (ya existe) | `tests/guards/guard-arquitectura-modulos.test.ts` | R20, R21, R23: `@module` en los dos modelos, forma del módulo nuevo, ninguna ruta profunda. **No cubre R22**: ver § 5.4. |
| Guardia (ya existe) | `tests/guards/guard-dependencias-aprobadas.test.ts` | R36. |
| Ciclo real | task T10 de `tasks.md` | R34 en su forma real: `db:migrate` → `db:rollback` → `db:migrate`, con la salida pegada en `progress/impl_QC-42-modelo-proveedores.md`. El test estático solo lee texto. |

Cuatro avisos para el implementer:

- **Nota de QC-24 § 10.1, que aplica igual aquí:** por la API tipada, **Prisma traduce el SQLSTATE
  a su propio código** (`P2002`, `P2003`) antes de que llegue a `meta.code`. Solo `$queryRaw` /
  `$executeRaw` lo propagan intacto. Las operaciones que se espera que **fallen** van con
  `$executeRaw` —es además el instrumento más fiel al enunciado «en la propia base de datos»—; los
  caminos felices y las lecturas siguen tipados.
- El test de integración necesita **productos** en la base para insertar una línea (la FK es real)
  y **usuarios** para los casos con autor. Se crean dentro de la transacción y se hace `ROLLBACK`,
  sin depender del seed. El autor es opcional, así que hay que cubrir los dos caminos.
- `beforeAll` debe fallar con un mensaje claro («corre `pnpm run db:migrate`») si `suppliers` o
  `supplier_catalog_lines` no existen, no con un error de Prisma a mitad del primer caso.
- Un test de RLS escrito con Prisma sale verde pase lo que pase (Prisma se conecta como dueño de
  las tablas). No se escribe: R33 se cierra con la guardia estática sobre el SQL
  (`docs/architecture.md > Acceso a datos y autorizacion`).
