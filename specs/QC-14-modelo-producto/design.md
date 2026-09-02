# QC-14 — modelo-producto · design.md

> Zona: `backend` · Complejidad: `medium` · depends_on: `QC-15` ·
> Rama: `feature/QC-14-modelo-producto`
>
> El **qué** está en `requirements.md` (R1–R24) y su alcance lo cerró el humano el
> 2026-09-01. Aquí va el **cómo**: forma exacta de los dos modelos, qué SQL hay que escribir
> a mano porque Prisma no lo modela, dónde encaja en la estructura de módulos de QC-15, qué
> alternativas se descartaron y qué preguntas deja el diseño abiertas.
>
> El precedente literal de esta feature es **QC-4 — modelo-usuarios-y-roles**
> (`specs/4-modelo-usuarios-y-roles/`, `db/migrations/20260806122638_users_and_roles/`,
> `tests/unit/identity/schema/`). Aquí se le copia la forma: mismos tipos nativos, mismo
> patrón de índice del lado hijo de la FK, mismo `ON DELETE RESTRICT`, mismo borrado lógico,
> mismos dos tests estáticos (esquema y SQL) más un test de integración contra base real.

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `db/schema.prisma` | Se **añaden** dos modelos: `Presentation` y `Product`. No se toca ningún modelo de `identity`. |
| `db/migrations/<ts>_products_and_presentations/migration.sql` | UP: dos `CREATE TABLE`, la FK, el índice de la FK, los cuatro `CHECK` y los cuatro `ALTER TABLE` de RLS. |
| `db/migrations/<ts>_products_and_presentations/down.sql` | DOWN manual (convención propia del repo, `docs/architecture.md > Migraciones up/down`). |
| `tests/unit/inventario/schema/inventario-schema.test.ts` | Contrato estático del esquema. |
| `tests/unit/inventario/schema/inventario-migration.test.ts` | Contrato estático del SQL. |
| `tests/integration/inventario/inventario-constraints.int.test.ts` | Constraints contra Postgres real. |

**No se toca `lib/`.** `lib/modules/inventario/index.ts` ya existe como *slot* vacío
(`export {}`, lo sembró QC-15) y se queda tal cual: esta feature no tiene dominio, ni puertos,
ni adaptadores, porque no tiene ninguna operación que exponer (R23). El módulo `inventario`
gana contenido en QC-20. La propiedad del modelo se declara con el comentario
`/// @module inventario` en el esquema, que es exactamente lo que la guardia lee
(`tests/guards/guard-arquitectura-modulos.test.ts`, bloque 10).

---

## 2. Modelo de datos

### 2.1 `Presentation` → tabla `presentations`

Catálogo compartido. Un producto no existe sin presentación (decisión 4) y una misma
presentación la usan muchos productos.

```prisma
/// Presentacion comercial que clasifica los productos (design.md > 2.1). Catalogo
/// compartido: una misma presentacion la usan muchos productos, y no se puede borrar
/// mientras tenga alguno asignado (R14, via ON DELETE RESTRICT).
///
/// NO lleva `deletedAt`, igual que `Role` en `identity`: el borrado logico es un UPDATE y
/// una FK no puede bloquear un UPDATE, asi que la columna neutralizaria en silencio la
/// unica garantia real de R14. Ver `design.md > 9` (pregunta abierta 2).
/// @module inventario
model Presentation {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  products Product[]

  @@map("presentations")
}
```

- `id` **uuid** con `gen_random_uuid()`, idéntico a `Role` y `User` (R1: identificador propio
  y no derivado de los datos de negocio). La extensión `pgcrypto` ya la creó la migración de
  QC-4; la de QC-14 la vuelve a declarar con `IF NOT EXISTS` para ser autocontenida.
- `name` es `TEXT NOT NULL`, sin `varchar(n)` arbitrario (convención de la cabecera del
  esquema). **Sin `@unique`**: nadie lo decidió — ver pregunta abierta 3.
- Sin `deletedAt`. Es lo que sostiene R14; razonado en la pregunta abierta 2, que el humano
  confirma o corrige al aprobar el spec.

### 2.2 `Product` → tabla `products`

```prisma
/// Producto del catalogo quimico. Es TAMBIEN el elemento de inventario: una sola tabla
/// (decision cerrada 1), con costo, compra minima, tiempo de entrega y unidad.
///
/// `name` NO tiene indice unico, y es deliberado (decision cerrada 6, R16): dos productos
/// pueden llamarse igual. Se aparta a proposito del precedente de `users`.
/// @module inventario
model Product {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name           String
  presentationId String    @map("presentation_id") @db.Uuid
  stock          Int?
  cost           Decimal?  @db.Decimal(14, 4)
  minPurchase    Int       @default(0) @map("min_purchase")
  deliveryTime   Int?      @map("delivery_time")
  qtyAlert       Int?      @map("qty_alert")
  unit           String?
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(6)

  presentation Presentation @relation(fields: [presentationId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@index([presentationId], map: "products_presentation_id_idx")
  @@map("products")
}
```

Columna a columna, con el tipo nativo de Postgres que le corresponde:

| Campo Prisma | Columna | Tipo Postgres | Nulo | Requisito |
| --- | --- | --- | --- | --- |
| `id` | `id` | `UUID DEFAULT gen_random_uuid()` | no | — |
| `name` | `name` | `TEXT` | **no** | R4 |
| `presentationId` | `presentation_id` | `UUID` | **no** | R4, R12 |
| `stock` | `stock` | `INTEGER` | sí | R5, R7 |
| `cost` | `cost` | `DECIMAL(14,4)` | sí | R5, R8 |
| `minPurchase` | `min_purchase` | `INTEGER NOT NULL DEFAULT 0` | no | R6 |
| `deliveryTime` | `delivery_time` | `INTEGER` (días) | sí | R3, R5, R7 |
| `qtyAlert` | `qty_alert` | `INTEGER` | sí | R5, R7, R11 |
| `unit` | `unit` | `TEXT` | sí | R5, R10 |
| `createdAt` | `created_at` | `TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP` | no | R18 |
| `updatedAt` | `updated_at` | `TIMESTAMPTZ(6)` (lo rellena `@updatedAt`) | no | R18 |
| `deletedAt` | `deleted_at` | `TIMESTAMPTZ(6)` | sí | R17 |

Notas que no son evidentes:

- **`cost` es `Decimal`, nunca `Float`.** `docs/architecture.md > Dominio` n.º 4 y la lista de
  anti-patrones lo tratan como bloqueante. `@db.Decimal(14, 4)` da `numeric(14,4)`: hasta
  10 dígitos enteros y 4 decimales exactos. El cliente Prisma lo devuelve como
  `Prisma.Decimal`, **no como `number`** — es lo que evita el redondeo binario, y QC-20 tendrá
  que serializarlo con cuidado al cruzar al cliente.
- **`minPurchase` es `NOT NULL DEFAULT 0`**, no anulable. Interpretación de «opcional con
  valor por defecto 0» (decisión 8): opcional describe la *entrada*, el defecto describe lo
  *almacenado*. Con la columna anulable el defecto solo actuaría cuando se omite la columna y
  un `NULL` explícito sobreviviría, con lo que «compra mínima 0» y «compra mínima
  desconocida» convivirían sin poder distinguirse. Ver pregunta abierta 1.
- **`unit` es `TEXT` anulable y no hay `enum` ni catálogo.** La pregunta abierta 1 del dominio
  se cerró así el 2026-09-01 (`docs/architecture.md > Preguntas abiertas del dominio`). El
  anti-patrón «cantidad sin unidad de medida» de `docs/architecture.md` estaba condicionado a
  que esa pregunta **no** estuviera cerrada; lo está, y la columna existe, así que no aplica.
- **`@@index([presentationId])`.** Postgres **no** indexa automáticamente el lado hijo de una
  FK, y toda consulta «productos de esta presentación» y toda verificación de `RESTRICT` al
  borrar pasan por ahí. Mismo motivo que `users_role_id_idx` en QC-4.
- **Sin ningún índice único sobre `name`** (R16), ni total, ni parcial, ni funcional. El test
  estático lo afirma en positivo para que nadie lo «arregle» copiando de `users`.
- `onDelete: Restrict` es lo que implementa R14, y `onUpdate: Cascade` replica lo que Prisma
  genera por defecto para las FK de QC-4.

---

## 3. Lo que va a mano en `migration.sql`

Prisma Migrate genera las dos `CREATE TABLE`, la FK y el índice. **No genera** los `CHECK` ni
los `ALTER TABLE` de RLS: se escriben a mano encima del archivo generado, exactamente como en
QC-4 (donde se añadieron a mano `pgcrypto`, el `INSERT` del catálogo, los tres índices
funcionales/parciales y los seis `ALTER` de RLS). El archivo lleva una cabecera diciéndolo,
porque toda migración futura de estas tablas hay que revisarla para que no los borre por drift.

### 3.1 Restricciones `CHECK` de no negatividad (R9)

Cuatro, nombradas en inglés (R19), sobre las cuatro columnas que la decisión 7 enumera:

```sql
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative"        CHECK ("stock" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_min_purchase_non_negative" CHECK ("min_purchase" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_qty_alert_non_negative"    CHECK ("qty_alert" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_cost_non_negative"         CHECK ("cost" >= 0);
```

**Semántica de `NULL` que hay que entender antes de tocar esto:** en SQL un `CHECK` que evalúa
a `NULL` **se cumple**. Como `stock`, `qty_alert` y `cost` son opcionales (R5), esta forma es
justo la que se quiere: la fila sin valor pasa, y el valor negativo no. No hace falta —ni se
debe— escribir `("stock" IS NULL OR "stock" >= 0)`: dice lo mismo con más ruido.

`delivery_time` **no** lleva `CHECK`, y no es un olvido: la decisión 7 enumera las cuatro
columnas de arriba y el tiempo de entrega no está en esa lista. Ver pregunta abierta 4.

### 3.2 RLS (R21)

```sql
ALTER TABLE "presentations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "presentations" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "products"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"      FORCE  ROW LEVEL SECURITY;
```

Sin policies, igual que QC-4: *deny by default* para cualquier vía que no sea Prisma. Y con
`FORCE`, porque sin él el dueño de las tablas —que es con quien se conecta Prisma— ignora la
RLS entera. Esto **no** es la frontera de autorización: la frontera vive en el service y la
decide QC-20 (`docs/architecture.md > Acceso a datos y autorizacion`, pregunta abierta 4 del
requirements). La guardia `tests/guards/guard-rls-force.test.ts` ya recorre
`db/migrations/**/migration.sql` y cubre esta migración **sola, sin tocarla**.

### 3.3 Orden del UP

`pgcrypto` → `presentations` → `products` → FK → índice de la FK → los cuatro `CHECK` → los
cuatro `ALTER` de RLS. `presentations` antes que `products` porque la FK apunta hacia ella.

---

## 4. `down.sql` (R22)

```sql
DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "presentations";
```

En orden inverso al UP. El índice, la FK y los cuatro `CHECK` **caen con sus tablas**, así que
no se dropean aparte. La extensión `pgcrypto` **no** se toca: esta migración no la crea en
exclusiva (`IF NOT EXISTS`) y `identity` depende de ella — el mismo razonamiento, palabra por
palabra, que el `down.sql` de QC-4. El DOWN no hace **nada más** que esos dos `DROP`, y el test
estático lo afirma contando sentencias.

Se verifica de verdad con el ciclo `db:migrate` → `db:rollback` → `db:migrate` (task T7):
`down.sql` es convención propia del repo y nadie lo prueba por ti
(`docs/verification.md > Datos`).

---

## 5. Encaje en la arquitectura hexagonal de QC-15

- Los dos modelos declaran `/// @module inventario` **inmediatamente encima** de su `model`.
  La guardia lee las líneas `///` que preceden al `model` hasta encontrar `@module`, así que el
  comentario de documentación puede ser largo (lo es) mientras la anotación esté dentro del
  bloque.
- A partir de ahí, `prisma.product` y `prisma.presentation` solo pueden aparecer en
  `lib/modules/inventario/adapters/driven/**` (o en `tests/`/`scripts/`, que están exentos).
  En QC-14 **no aparecen en ninguna parte** salvo en el test de integración.
- `lib/modules/inventario/index.ts` se queda con su `export {}`: un contrato público solo
  reexporta de `./domain`, y aquí no hay dominio todavía. Inventar hoy un
  `domain/product.ts` con tipos que nadie consume sería código muerto y sobre-ingeniería, y
  además chocaría con R23.
- Ningún adaptador de `identity` puede tocar estas tablas, y `inventario` no toca `users`: eso
  ya lo vigila el bloque 10 de la guardia de módulos, sin escribir nada nuevo.

---

## 6. Contratos de entrada/salida

**Ninguno.** Esta feature no expone endpoints, ni rutas, ni Server Actions, ni servicios
(R23). El único «contrato» que produce es el cliente Prisma generado a partir del esquema, y
sus consumidores llegan con QC-20. Se anota explícitamente porque `docs/specs.md` pide la
sección: aquí está vacía a propósito, no por descuido.

**Integraciones externas:** ninguna.

---

## 7. Dependencias de terceros

**Ninguna dependencia nueva** (decisión cerrada 17, R24). Esto es esquema Prisma y SQL: no hay
utilidad que reimplementar ni librería que evalúe los cuatro checks de
`docs/architecture.md > Dependencias de terceros`. Prisma, `@prisma/client`, `vitest` y `tsx`
ya están instalados y registrados en `docs/dependencias.md` desde QC-4.

Un punto que podría parecer candidato y **no** lo es: la aritmética decimal. No hace falta
`decimal.js` ni similar, porque `Prisma.Decimal` ya viene con el cliente y aquí no se hace
ninguna operación aritmética — solo se guarda y se lee.

`tests/guards/guard-dependencias-aprobadas.test.ts` seguirá en verde sin tocar
`package.json`, y ese es justo el criterio de R24.

---

## 8. Alternativas descartadas

### 8.1 `min_purchase` anulable con `DEFAULT 0` — descartada

Se descarta porque deja dos formas de decir lo mismo y ninguna de distinguirlas: un `NULL`
explícito sobreviviría al defecto, y en un ERP «compra mínima 0» y «compra mínima sin
definir» acabarían mezcladas en la misma columna, con cada consumidor decidiendo su propio
`?? 0`. `NOT NULL DEFAULT 0` hace que el defecto **siempre** actúe, que es lo que dice la
decisión 8. Está anotada como pregunta abierta 1 por si el humano quería lo contrario.

### 8.2 Índice único (funcional y parcial) sobre `products.name` — descartada

Es lo que hizo QC-4 con `users_email_unique` y sería copiar el precedente sin pensar. La
decisión cerrada 6 dice explícitamente que **no**: dos productos pueden llamarse igual, porque
en un catálogo químico el mismo nombre comercial aparece con distinta presentación o distinto
proveedor. Se descarta, y además el test estático afirma **en positivo** que no existe, para
que la ausencia no parezca un olvido y alguien la «arregle» en una migración futura.

### 8.3 No negatividad validada solo en el borde (zod, en QC-20) — descartada

Sería más flexible y daría mejores mensajes de error. Se descarta porque la decisión 7 dice
«garantizado por CHECK **en la base**»: la validación de borde protege un camino de entrada, y
un `INSERT` desde una consola, un script de carga o un job la esquiva entera. La validación de
zod en QC-20 se añadirá **encima** del `CHECK`, no en su lugar.

### 8.4 Enum de Prisma o columna de texto para la presentación — descartada por el humano

Consta aquí para que el implementer no la reconsidere: la decisión cerrada 3 fijó tabla propia,
porque el conjunto tiene que crecer sin migrar lo ya guardado (mismo razonamiento que el
catálogo `document_types` de QC-4, que además demostró en su test de integración que añadir un
tipo es un `INSERT` y no una migración). También se descartó la variante intermedia
`presentation (product_id, url)` con imágenes.

### 8.5 Un `TRIGGER` que impida borrar presentaciones con productos — descartada

`ON DELETE RESTRICT` sobre la FK ya lo hace, lo hace la propia base, no hay que mantenerlo y su
comportamiento es el que QC-4 ya dejó verificado (incluido el caso fino: un producto borrado
lógicamente **sigue** contando como asignado, porque la FK no sabe nada de `deleted_at`). Un
trigger añadiría código PL/pgSQL sin dueño ni test propio para conseguir exactamente lo mismo.

---

## 9. Preguntas abiertas que deja este diseño

Nuevas, del `design.md`; **no tocan** las cuatro de `requirements.md`, que las escribió el
humano. Ninguna bloquea la implementación: las cuatro tienen una posición por defecto tomada
del precedente de QC-4 o de la letra de una decisión cerrada, y las cuatro se cierran en la
puerta de aprobación humana del spec (F1.4). Se escriben en vez de rellenarse con supuestos
(regla 6 de `CLAUDE.md`).

1. **¿`min_purchase` es `NOT NULL DEFAULT 0` o anulable con defecto 0?** La decisión 8 dice
   «opcional con valor por defecto 0» y las dos lecturas caben. Este diseño toma `NOT NULL
   DEFAULT 0` (§ 8.1). Si la respuesta fuera la otra, cambia una palabra en el esquema y una
   línea en la migración.
2. **¿`presentations` lleva `deleted_at`?** La decisión 11 dice «borrado lógico con
   `created_at`/`updated_at`/`deleted_at`, heredado de QC-4», y la decisión 4 dice que una
   presentación con productos asignados **no se puede borrar**. En QC-4 esas dos cosas
   resultaron incompatibles y se resolvieron dejando el catálogo (`roles`) **sin**
   `deleted_at`: con la columna, «borrar» pasa a ser un `UPDATE` y ninguna FK puede bloquear un
   `UPDATE`, así que la garantía de R14 se evaporaría en silencio. Este diseño hereda esa misma
   solución —`products` con las tres marcas, `presentations` solo con `created_at`/`updated_at`—
   pero es una lectura, no una decisión tomada, y por eso se anota. **Los requisitos están
   escritos para no depender de la respuesta**: R17 habla del producto y R14 exige que el
   borrado de una presentación con productos se rechace, sea cual sea el mecanismo.
3. **¿El nombre de una presentación es único?** La decisión 3 fija `presentation (id, name)` y
   no dice nada de unicidad; la decisión 6 solo habla del nombre del **producto**. Este diseño
   **no** crea índice único sobre `presentations.name` (no inventar). Consecuencia asumida: el
   catálogo admite dos presentaciones con el mismo nombre hasta que alguien lo decida, y
   añadirlo después exigirá limpiar duplicados si los hay.
4. **¿`delivery_time` admite negativos?** La decisión 7 enumera cuatro columnas y el tiempo de
   entrega no está entre ellas, así que este diseño **no** le pone `CHECK` (§ 3.1). Un plazo de
   entrega negativo no significa nada, así que probablemente debería llevarlo; añadirlo después
   es un `ALTER TABLE ... ADD CONSTRAINT` aditivo y barato **mientras no haya datos negativos
   cargados**, que es exactamente el riesgo que se acepta al dejarlo fuera hoy.
5. **¿Un nombre vacío es un nombre?** Ni `products.name` ni `presentations.name` llevan `CHECK`
   de longitud mínima: `NOT NULL` acepta la cadena vacía. QC-4 tomó la misma postura con el
   número de documento y lo dejó como validación de borde (zod) en la feature que da de alta.
   Aquí igual: lo decide QC-20.

---

## 10. Cómo se verifica

Tres archivos de test nuevos, con el mismo reparto que QC-4 —dos estáticos que leen texto y uno
de integración contra Postgres real—, más dos guardias que ya existen y cubren esta migración
sin que haya que escribirlas.

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Estático | `tests/unit/inventario/schema/inventario-schema.test.ts` | La **declaración**: campos, obligatoriedad, tipos, `@module`, ausencia de único en `name`. Lee `db/schema.prisma` como texto, no el cliente generado: un tipo de TypeScript no distingue un campo obligatorio de uno con defecto, ni dice si la relación es `Restrict`. |
| Estático | `tests/unit/inventario/schema/inventario-migration.test.ts` | El **SQL**: los cuatro `CHECK`, `DECIMAL(14,4)`, `NOT NULL DEFAULT 0`, la FK `RESTRICT`, el índice de la FK, la ausencia de índice único sobre `name`, y que `down.sql` dropea exactamente las dos tablas del UP y nada más. |
| Integración | `tests/integration/inventario/inventario-constraints.int.test.ts` | Que la base **de verdad** rechaza lo que debe. Cada caso en `prisma.$transaction` que termina en `ROLLBACK`, y toda operación que se espera que falle envuelta en `SAVEPOINT`. Se afirma sobre el **SQLSTATE** (`23502` not-null, `23503` FK, `23514` check), nunca sobre el texto del mensaje: en esta máquina Postgres responde en español. Copiar los helpers de `tests/integration/identity/identity-constraints.int.test.ts`. |
| Guardia (ya existe) | `tests/guards/guard-rls-force.test.ts` | R21, sin tocar la guardia: descubre las tablas leyendo el SQL. |
| Guardia (ya existe) | `tests/guards/guard-arquitectura-modulos.test.ts` | R20, bloque 10: todo modelo declara `/// @module`. |
| Guardia (ya existe) | `tests/guards/guard-dependencias-aprobadas.test.ts` | R24. |

**Sin E2E**, y con motivo (decisión 16, R23): no hay pantalla ni flujo navegable que visitar.
`CHECKPOINTS.md` pide E2E para «movimientos de inventario»; esta feature no mueve nada, solo
persiste la ficha. Lo decide QC-20.

Dos avisos para el implementer, ambos aprendidos en QC-4:

- El test de integración necesita la migración **aplicada** en la base de pruebas. Debe fallar
  con un mensaje claro en `beforeAll` si las dos tablas no existen, no con un error de Prisma
  a mitad del primer caso.
- Un test de RLS escrito con Prisma sale verde pase lo que pase, porque Prisma se conecta como
  dueño de las tablas. No se escribe: R21 se cierra con la guardia estática sobre el SQL
  (`docs/verification.md > Datos`).
