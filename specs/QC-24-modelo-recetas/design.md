# QC-24 — modelo-recetas · design.md

> Zona: `backend` · Complejidad: `high` · depends_on: `QC-14` ·
> Rama: `feature/QC-24-modelo-recetas`
>
> El **qué** está en `requirements.md` (R1–R33) y su alcance lo cerró el humano el 2026-09-02;
> las tres preguntas que dejó abiertas F1.2 las cerró el mismo día (decisiones 20, 21 y 22) y la
> del autor anulable está propagada aquí, en § 2.1 y § 4.1.
> Aquí va el **cómo**: la forma exacta de los dos modelos, el SQL que hay que escribir a mano
> porque Prisma no lo modela, **cómo nace el módulo `recetas`** —el primero que se crea desde
> cero en este repo— y **qué contrato publica `inventario`** para que una línea pueda apuntar a
> un producto sin que `recetas` toque su tabla.
>
> Precedentes literales: **QC-14 — modelo-producto** (`specs/QC-14-modelo-producto/`,
> `db/migrations/20260902005510_products_and_presentations/`, `tests/unit/inventario/schema/`)
> para la forma del modelo, la migración y el reparto de tests; **QC-15** para la forma del
> módulo (`lib/modules/identity/` es el único módulo con contenido real hoy); **QC-4** para los
> índices únicos funcionales/parciales sobre una tabla con borrado lógico.

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `db/schema.prisma` | Se **añaden** dos modelos: `Recipe` y `RecipeLine`, con `/// @module recetas`. No se toca ningún modelo existente. |
| `db/migrations/<ts>_recipes_and_recipe_lines/migration.sql` | UP: dos `CREATE TABLE`, la FK interna, **las tres FK escritas a mano** (producto y las dos de auditoría), los índices, el `CHECK` de cantidad, el índice único parcial del nombre normalizado y los cuatro `ALTER` de RLS. |
| `db/migrations/<ts>_recipes_and_recipe_lines/down.sql` | DOWN manual (convención propia, `docs/architecture.md > Migraciones up/down`). |
| `lib/modules/recetas/index.ts` | **Nuevo**: contrato público del módulo. |
| `lib/modules/recetas/domain/recipe-name.ts` | **Nuevo**: `normalizeRecipeName`, la única definición de la normalización (R8). |
| `lib/modules/recetas/ports/.gitkeep`, `lib/modules/recetas/adapters/driven/.gitkeep`, `lib/modules/recetas/adapters/driving/.gitkeep` | **Nuevos**: carpetas vacías del armazón, igual que hizo QC-15 con `inventario`. |
| `lib/modules/inventario/domain/product-catalog.ts` | **Nuevo**: el contrato que `inventario` publica hacia fuera (§ 5). |
| `lib/modules/inventario/index.ts` | Deja de ser `export {}`: reexporta lo anterior. |
| `tests/unit/recetas/schema/recetas-schema.test.ts` | Contrato estático del esquema. |
| `tests/unit/recetas/schema/recetas-migration.test.ts` | Contrato estático del SQL. |
| `tests/unit/recetas/domain/recipe-name.test.ts` | La normalización del nombre. |
| `tests/unit/recetas/module-contract.test.ts` | La forma del módulo nuevo y la frontera con `inventario`. |
| `tests/integration/recetas/recetas-constraints.int.test.ts` | Constraints contra Postgres real. |

**`lib/composition/index.ts` NO se toca.** Se explica en § 5.4: no hay nada que cablear todavía
—cablear es elegir qué implementación concreta cumple un puerto, y en esta ficha no hay ni
puertos ni adaptadores— y un `export const recetas = {}` sería una fachada vacía que nadie
consume. Queda escrita en § 5.4 la forma exacta que QC-25 tendrá que añadir, para que no la
improvise.

---

## 2. Modelo de datos

### 2.1 `Recipe` → tabla `recipes`

```prisma
/// Receta (formula) del ERP quimico. Borrado LOGICO: `deletedAt` NULL = receta viva.
///
/// OJO 1 — `createdBy` y `updatedBy` son FK REALES a `users`, pero se declaran como
/// ESCALARES SIN `@relation` a proposito (decision cerrada 3, R19): la FK esta escrita a
/// mano en `migration.sql`. Asi la base garantiza la integridad y, a la vez, el cliente
/// Prisma NO puede atravesar de `recetas` a `users` con un `include`. La guardia de modulos
/// NO detectaria ese cruce, porque no es un import.
/// Son ANULABLES (decision cerrada 22, R33): NULL significa «no la creo una persona»
/// —una importacion, un seed—, no «se perdio el dato».
///
/// OJO 2 — la unicidad del nombre NO esta aqui como `@unique` y es deliberado: es un indice
/// unico PARCIAL (`WHERE deleted_at IS NULL`) sobre `name_normalized`, y Prisma no modela
/// indices parciales. Vive escrito a mano en `migration.sql` (`recipes_name_unique`).
/// @module recetas
model Recipe {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name           String
  nameNormalized String    @map("name_normalized")
  description    String?
  steps          Json      @default("[]")
  imagePath      String?   @map("image_path")
  createdBy      String?   @map("created_by") @db.Uuid
  updatedBy      String?   @map("updated_by") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(6)

  lines RecipeLine[]

  @@index([createdBy], map: "recipes_created_by_idx")
  @@index([updatedBy], map: "recipes_updated_by_idx")
  @@map("recipes")
}
```

| Campo | Columna | Tipo Postgres | Nulo | Requisito |
| --- | --- | --- | --- | --- |
| `id` | `id` | `UUID DEFAULT gen_random_uuid()` | no | R1 |
| `name` | `name` | `TEXT` | **no** | R1, R2, R3 |
| `nameNormalized` | `name_normalized` | `TEXT` | **no** | R7, R8 |
| `description` | `description` | `TEXT` | sí (decisión 21) | R1, R3 |
| `steps` | `steps` | `JSONB NOT NULL DEFAULT '[]'` | no | R4, R5 |
| `imagePath` | `image_path` | `TEXT` | sí | R6 |
| `createdBy` | `created_by` | `UUID` | **sí** (decisión 22) | R21, R33 |
| `updatedBy` | `updated_by` | `UUID` | **sí** (decisión 22) | R21, R33 |
| `createdAt` | `created_at` | `TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP` | no | R23 |
| `updatedAt` | `updated_at` | `TIMESTAMPTZ(6)` (lo rellena `@updatedAt`) | no | R23 |
| `deletedAt` | `deleted_at` | `TIMESTAMPTZ(6)` | sí | R22 |

Lo que no es evidente:

- **`steps` es `Json` (jsonb) `NOT NULL DEFAULT '[]'`.** Un único documento, sin tabla de pasos
  (decisión 10). `NOT NULL` con defecto de lista vacía por el mismo razonamiento que
  `min_purchase` en QC-14: si fuera anulable convivirían «receta sin pasos» y «pasos
  desconocidos» sin poder distinguirse, y cada consumidor pondría su propio `?? []`. **Sin
  ningún `CHECK` sobre la forma del documento** —ni siquiera `jsonb_typeof(steps) = 'array'`—:
  la decisión 10 dice literalmente que la base guarda el documento tal cual y que la forma la
  hace cumplir la capa de aplicación (QC-25). R4 se prueba **en positivo**: la base acepta un
  documento que no es una lista de textos.
- **El orden de los pasos es el de la lista JSON**, y jsonb **conserva el orden de los arrays**
  (lo que jsonb reordena son las **claves de un objeto**, no los elementos de un array). Es la
  razón técnica por la que `jsonb` sirve aquí y no hace falta `json`.
- **`name` y `name_normalized` son `TEXT`**, sin `varchar(n)`: R3 y la convención de la cabecera
  del esquema. Los 120/500 son de QC-25.
- **`created_by` / `updated_by` no tienen `@relation`.** Ver § 4.1: es la decisión 3 y es lo que
  impide el `include` a `users`.
- **`created_by` / `updated_by` son anulables** (decisión 22, R33). `NULL` **no** es «autor
  desconocido» ni «se perdió el dato»: es «esta receta no la creó una persona», el caso de una
  importación masiva o de un seed. Quien lo lea en QC-25 lo muestra así —«Sistema», o el sitio
  del autor vacío—, no como un hueco. La integridad no se afloja: `NULL` está permitido, pero
  **cualquier valor presente tiene que ser un usuario que existe**, porque una FK solo verifica
  las filas con valor.
- **Índices sobre `created_by` y `updated_by`.** Postgres no indexa el lado hijo de una FK, y el
  `RESTRICT` al borrar un usuario pasa por ahí. Mismo motivo que `users_role_id_idx` en QC-4.

### 2.2 `RecipeLine` → tabla `recipe_lines`

```prisma
/// Linea de una receta: la pareja receta-producto como ENTIDAD PROPIA, con su cantidad y su
/// unidad (decision cerrada 12).
///
/// NO lleva `deletedAt` a proposito (decision cerrada 5, R24): la linea es parte de la
/// receta, no un hecho historico, y corregir una formula es una edicion normal.
///
/// OJO — `productId` es una FK REAL a `products` declarada como ESCALAR SIN `@relation`
/// (decision cerrada 3 aplicada a la frontera con `inventario`, R19). La FK esta escrita a
/// mano en `migration.sql`. Lo que `recetas` sabe del producto llega por el contrato publico
/// `@/lib/modules/inventario`, nunca por un `include` ni por `prisma.product`.
/// @module recetas
model RecipeLine {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recipeId  String   @map("recipe_id") @db.Uuid
  productId String   @map("product_id") @db.Uuid
  quantity  Decimal  @db.Decimal(14, 4)
  unit      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  recipe Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@unique([recipeId, productId], map: "recipe_lines_recipe_id_product_id_key")
  @@index([productId], map: "recipe_lines_product_id_idx")
  @@map("recipe_lines")
}
```

- **`quantity` es `Decimal(14,4)` obligatoria, nunca `Float`** (decisión 8, R13). Heredada de
  `cost`; el riesgo de precisión está anotado como pregunta abierta 2 del `requirements.md`.
- **`unit` es `TEXT NOT NULL`** (decisión 9, R15): obligatoria aquí, a diferencia de
  `products.unit`, que es opcional. **No se copia del producto**, ni se valida contra ella.
- **`@@unique([recipeId, productId])`** implementa R11 y, de paso, sirve de índice para «líneas
  de esta receta» (Postgres puede usar el prefijo izquierdo del índice compuesto). Por eso
  **no** se añade un `@@index([recipeId])` aparte: sería redundante.
- **`@@index([productId])`**: lado hijo de la FK a `products`, por el que pasa la verificación
  del `RESTRICT` y la futura pregunta «¿en qué recetas se usa este producto?».
- **La relación con `Recipe` sí lleva `@relation`**: es intra-módulo, no cruza ninguna
  frontera, y es la que da el `ON DELETE CASCADE` de § 4.2.
- `created_at` / `updated_at` en la línea: convención del repo (todas las tablas las llevan) y
  R23. La línea **no** lleva `deleted_at` (R24) ni columnas de auditoría propias: quien edita
  una fórmula edita la receta, y ahí queda registrado en `recipes.updated_by`.

---

## 3. La normalización del nombre (R7, R8) y por qué no es una columna generada

La decisión 7 exige **columna persistida + índice único**, no comparación al vuelo. La pregunta
que queda es **quién escribe la columna**, y hay una razón técnica dura para que sea la
aplicación:

- Una `GENERATED ALWAYS AS (...) STORED` de Postgres solo admite expresiones **`IMMUTABLE`**, y
  lo mismo un índice funcional. `unaccent()` de la extensión `unaccent` es **`STABLE`**, no
  `IMMUTABLE` (depende de un diccionario configurable), así que **no se puede usar** ni en una
  columna generada ni en un índice sin envolverla en una función `IMMUTABLE` propia —código
  PL/pgSQL sin dueño, sin test y con la extensión `unaccent` como dependencia nueva de la base.
- Además, obligaría a instalar `unaccent` en Supabase y a que la normalización viviera en SQL,
  fuera del alcance de cualquier test unitario del dominio.

Por eso la normalización es **una función pura del dominio de `recetas`**, publicada por su
contrato, y la columna la escribe quien inserta (QC-25):

```ts
// lib/modules/recetas/domain/recipe-name.ts
/** Forma canonica para comparar nombres de receta: sin acentos, sin caracteres especiales y
 *  sin distinguir mayusculas. «Desengrasante 5 %», «desengrasante-5%» y «DESENGRASANTE 5%»
 *  producen la misma clave. Es la UNICA definicion (R8): la columna `name_normalized` y
 *  cualquier consulta futura usan esta. */
export function normalizeRecipeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
```

Es función pura, sin dependencias (`docs/architecture.md > La regla de dependencias`: el dominio
solo importa paquetes puros), y **no** se reimplementa nada que ya resuelva una librería:
`String.prototype.normalize` es del estándar. El criterio de «misma receta» es exactamente el
que QC-20 D12 fijó para presentaciones («Bidón 20 L» = «bidon 20 l» = «BIDON-20L»).

**Por qué esto sí entra en una ficha de modelo:** la columna `name_normalized` no significa nada
sin su algoritmo, y si el algoritmo llegara en QC-25 acabaría existiendo dos veces (una en la
migración, otra en el service). Es la única pieza de dominio que esta ficha crea; no hay tipos
`Recipe`/`RecipeLine` en `domain/` porque nadie los consume todavía y serían código muerto
(mismo criterio que QC-14 > design.md § 5).

---

## 4. Lo que va a mano en `migration.sql`

Prisma Migrate genera las dos `CREATE TABLE`, la FK receta→línea, el índice único compuesto y
los índices simples. **No genera**: las tres FK que cruzan de módulo (§ 4.1), el `CHECK` de
cantidad, el índice único **parcial** del nombre y los `ALTER` de RLS. Se escriben a mano encima
del archivo generado, con la misma cabecera de aviso que puso QC-14, porque toda migración
futura sobre estas tablas hay que revisarla para que el drift no las borre.

### 4.1 Las tres FK escritas a mano (R19, R21, R27)

```sql
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

**El razonamiento completo, porque es el punto crítico de la feature.** Hay dos garantías que
queremos a la vez y que normalmente se estorban:

1. **Integridad referencial real.** Una línea que apunte a un producto inexistente es basura en
   un ERP; una receta cuyo autor no existe, también. Eso solo lo garantiza una FK de verdad en
   la base (R16, R21).
2. **Frontera de módulo.** `recetas` no puede leer `products` ni `users`
   (`CHECKPOINTS.md > Modulos hexagonales`, QC-15). Si la FK se declarase con `@relation` de
   Prisma, el cliente generado ofrecería `prisma.recipeLine.findMany({ include: { product: true } })`
   y `prisma.recipe.findMany({ include: { createdByUser: true } })`: la frontera se cruzaría con
   una línea de código que **ninguna guardia detecta**, porque no es un import —la guardia de
   módulos busca `prisma.<modelo>` y rutas de import, y un `include` no es ni una cosa ni la
   otra.

La decisión 3 (heredada de QC-20 D8) resuelve las dos: **campo escalar en Prisma + FK real en
SQL**. La base sabe de la relación; el ORM no. Es exactamente por eso que las tres van juntas y
por eso la de `products` sigue el mismo patrón que las de auditoría, aunque QC-20 D8 solo
hablase de `users`: el motivo no era «`users` es especial», era «cruza de módulo».

Coste que se acepta: Prisma **no valida** estas FK al generar el cliente, así que un cambio de
nombre de `products.id` o `users.id` no rompe nada hasta que la migración falla en la base; y
`prisma migrate dev` verá drift si alguien regenera la migración sin conservarlas a mano (de ahí
la cabecera de aviso). A cambio, la única forma de que una receta muestre el nombre de su
producto o de su autor es pasar por el contrato público del módulo dueño, que es lo que QC-15
pide.

**Las dos FK de auditoría admiten `NULL`** (decisión 22, R33) y eso **no** debilita nada: en SQL
una clave foránea solo se verifica cuando la columna tiene valor, así que una receta sin autor
pasa y una receta con un autor inventado se rechaza con `23503`. Es justo lo que R21 y R33 piden
a la vez.

**No se usa `ON DELETE SET NULL` en las FK de auditoría**, aunque ahora la columna lo permitiría:
convertiría «al usuario lo borraron» en «no la creó una persona», que son cosas distintas y la
decisión 22 las separa a propósito. `RESTRICT` mantiene esa distinción intacta.

`ON DELETE RESTRICT` en las tres: el borrado de producto y el de usuario son **lógicos**
(QC-20 D5, QC-4), así que en operación normal el `RESTRICT` nunca se dispara; existe para que un
borrado físico por consola o por script no deje líneas apuntando al vacío. Es lo que hace
verdadera la decisión 13 (R27): la fila del producto sigue existiendo, y la línea sigue
apuntándola.

### 4.2 `ON DELETE CASCADE` de receta a línea, y qué significa con borrado lógico (R25, R26)

```sql
-- generada por Prisma a partir de `recipe Recipe @relation(..., onDelete: Cascade)`
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_recipe_id_fkey"
  FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**Hay una trampa aquí y conviene decirla en voz alta.** La decisión 6 dice que la receta se
borra **lógicamente**; la decisión 5 dice que «al borrar la receta, sus líneas se van con ella».
Un borrado lógico es un `UPDATE deleted_at = now()`, y **ninguna FK reacciona a un `UPDATE`**:
el `CASCADE` **no se dispara nunca** en la operación normal del ERP. Las dos decisiones no se
contradicen, pero se cumplen por vías distintas:

- «Las líneas se van con la receta» en el uso normal significa que **las líneas solo se alcanzan
  a través de su receta**, y una receta borrada lógicamente no se devuelve en ninguna consulta.
  El filtro lo pone QC-25 en su repositorio; aquí no hay consultas. Lo que sí garantiza esta
  ficha es que la línea **sigue existiendo intacta** (R26): borrar una receta no destruye su
  fórmula, que es justo lo que permitiría restaurarla si algún día se quiere.
- El `CASCADE` es la red para el borrado **físico** (una purga, un script, el `down.sql`): si
  una fila de `recipes` desaparece de verdad, sus líneas se van con ella y no queda ninguna
  huérfana (R25). Es testeable y se testea.

Alternativa considerada y descartada en § 8.3: `ON DELETE RESTRICT` también entre receta y
línea.

### 4.3 El índice único parcial del nombre (R7, R9)

```sql
-- Unicidad del nombre normalizado (decision cerrada 7). PARCIAL: una receta borrada
-- logicamente libera su nombre (R9, decision cerrada 20). Prisma no modela indices parciales,
-- asi que este indice vive SOLO aqui: si alguien anade `@unique` en el esquema, la unicidad
-- pasa a alcanzar tambien a las recetas borradas y R9 deja de cumplirse en silencio.
CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized") WHERE "deleted_at" IS NULL;
```

Idéntico en forma a `users_email_unique` y `users_username_unique` de QC-4. **No** es funcional
(`lower(...)`) porque la columna ya viene normalizada por § 3, que es lo que la decisión 7 pide:
la garantía la da el índice, no una comparación al vuelo.

### 4.4 El `CHECK` de cantidad (R14)

```sql
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_quantity_positive" CHECK ("quantity" > 0);
```

`> 0`, no `>= 0`: la decisión 8 dice «ni negativa ni cero». La columna es `NOT NULL`, así que
aquí no aplica la semántica de `CHECK` sobre `NULL` que sí importaba en QC-14 —la ausencia la
rechaza el `NOT NULL` (SQLSTATE `23502`) y el cero el `CHECK` (`23514`), y el test de
integración distingue los dos.

### 4.5 RLS (R29)

```sql
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipe_lines" FORCE ROW LEVEL SECURITY;
```

Sin policies, *deny by default*, igual que QC-4 y QC-14. No es la frontera de autorización: esa
vive en el service y la fija QC-25. `tests/guards/guard-rls-force.test.ts` cubre esta migración
sola, sin tocar la guardia.

### 4.6 Orden del UP

`pgcrypto` (`IF NOT EXISTS`, autocontenida) → `recipes` → `recipe_lines` → FK receta→línea → FK
producto → las dos FK de auditoría → índices (`recipe_lines_recipe_id_product_id_key`,
`recipe_lines_product_id_idx`, `recipes_created_by_idx`, `recipes_updated_by_idx`) → índice único
parcial del nombre → `CHECK` de cantidad → cuatro `ALTER` de RLS.

---

## 5. El módulo `recetas`: qué nace y qué contrato publica `inventario`

Es la **primera vez** que este repo crea un módulo hexagonal desde cero (`identity` e
`inventario` los sembró la migración de QC-15). La forma no se inventa: se copia de
`lib/modules/identity/`, que es el único con contenido real.

### 5.1 Carpetas que nacen

```
lib/modules/recetas/
  index.ts                       # CONTRATO PUBLICO: solo reexporta de ./domain
  domain/
    recipe-name.ts               # normalizeRecipeName (R8)
  ports/.gitkeep                 # vacia: la llena QC-25
  adapters/
    driven/.gitkeep              # vacia: la llena QC-25
    driving/.gitkeep             # vacia: la llena QC-25
```

Las tres carpetas vacías llevan `.gitkeep` porque git no versiona carpetas vacías; es
exactamente lo que QC-15 hizo con `inventario`, y QC-25 los borra al poner el primer archivo
real. La guardia de módulos exige `index.ts` en cada módulo y **prohíbe cualquier carpeta que no
sea `domain/`, `ports/` o `adapters/`**, así que no hay margen para inventar una cuarta.

```ts
// lib/modules/recetas/index.ts — CONTRATO PUBLICO del modulo `recetas`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente
// sin arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de
// imports. Los adaptadores driving que traiga QC-25 NO pasan por aqui.
export { normalizeRecipeName } from './domain/recipe-name';
```

`recetas` **no** aparece en `REQUIRED_MODULES` de la guardia (que lista `identity` e
`inventario`): no hace falta añadirlo, la guardia descubre los módulos leyendo `lib/modules/` y
le aplica todas las demás reglas igual. Tocar la guardia no es de esta ficha.

### 5.2 El contrato que publica `inventario` (R18)

Hoy `lib/modules/inventario/index.ts` es `export {}`: `inventario` **no publica nada**, y sin
esto `recetas` no tendría ninguna forma legítima de saber que un producto existe o cómo se
llama. Esta ficha abre esa puerta con el mínimo imprescindible:

```ts
// lib/modules/inventario/domain/product-catalog.ts
/** Identificador de un producto visto DESDE FUERA de `inventario`. Es lo unico que otro
 *  modulo guarda de un producto (p. ej. `recipe_lines.product_id`). */
export type ProductId = string;

/** Lo que otro modulo puede saber de un producto sin tocar su tabla: identidad, nombre y
 *  unidad anotativa. Deliberadamente NO expone costo, existencia ni compra minima: un
 *  contrato publico se amplia cuando alguien lo necesita, no antes. */
export type ProductRef = {
  readonly id: ProductId;
  readonly name: string;
  readonly unit: string | null;
};

/** Servicio que `inventario` ofrece a los demas modulos (`docs/architecture.md > Dominio`
 *  n.o 2: «se comparten servicios via interfaz, nunca repositorios ni tablas»).
 *  Lo implementa un adaptador driven DE INVENTARIO —el unico que puede tocar
 *  `prisma.product`— y lo cablea `lib/composition`. */
export interface ProductCatalog {
  /** Referencias de los productos vivos entre los ids pedidos. Los ids que no existan o
   *  esten borrados logicamente simplemente no vienen en la respuesta. */
  findRefs(ids: readonly ProductId[]): Promise<readonly ProductRef[]>;
}
```

```ts
// lib/modules/inventario/index.ts — CONTRATO PUBLICO del modulo `inventario`.
export type { ProductCatalog, ProductId, ProductRef } from './domain/product-catalog';
```

Tres cosas que justifican esta forma:

- **Es solo tipos.** No hay código en tiempo de ejecución, así que no es «código muerto»:
  desaparece al compilar. Lo que crea es la **costura** que la FK de § 4.1 hace inevitable.
- **La interfaz vive en el dominio de `inventario`, no en `ports/` de `recetas`.** Un puerto es
  «lo que mi dominio necesita y alguien me cablea»; aquí lo correcto es que el módulo **dueño
  del dato** publique el servicio, porque la implementación tiene que ser suya —solo sus
  adaptadores driven pueden ejecutar `prisma.product` (guardia de módulos, bloque 10)—. Si la
  interfaz viviera en `recetas/ports/`, su implementación tendría que vivir en
  `recetas/adapters/driven/` y consultar `prisma.product`: **la guardia fallaría**, y con razón.
- **Se amplía por demanda.** `findRefs` es lo que QC-25 va a necesitar para pintar «Producto ×
  cantidad unidad» y para comprobar que los productos de una línea existen y están vivos. No se
  añade nada más «por si acaso».

En esta ficha `ProductCatalog` **no tiene implementación**: no hay ningún caso de uso que lo
consuma. La implementación (`lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`)
y su cableado son de QC-25, y su forma está escrita en § 5.4 para que no se improvise.

### 5.3 Cómo consume `recetas` ese contrato

Import por el **barrel**, nunca por ruta profunda, y desde el dominio (que es lo que la tabla de
`docs/architecture.md > La regla de dependencias` permite: `domain/` puede importar
`@/lib/modules/N`):

```ts
// asi, en QC-25:
import type { ProductCatalog, ProductId } from '@/lib/modules/inventario';   // SI
// import type { ProductRef } from '@/lib/modules/inventario/domain/product-catalog'; // NO
// import { prisma } from '@/lib/shared/db/prisma'; ... prisma.product...              // NO
```

`tests/unit/recetas/module-contract.test.ts` afirma en positivo que en todo
`lib/modules/recetas/**` **no aparece** `prisma.product`, ni `@prisma/client`, ni ninguna ruta
profunda a `inventario`. La guardia de módulos ya lo prohíbe, pero el test lo deja escrito como
requisito de esta feature (R18) en vez de como efecto colateral de una guardia genérica.

### 5.4 `lib/composition/` — qué NO se toca hoy, y qué añadirá QC-25

Hoy: **nada**. Componer es elegir implementación para un puerto; sin puertos ni adaptadores no
hay elección que hacer, y una fachada `export const recetas = {}` sería una mentira útil a nadie.

Lo que QC-25 tendrá que escribir, para que no lo invente:

```ts
// lib/composition/index.ts (QC-25, no ahora)
import { createSaveRecipe /* ... */ } from '@/lib/modules/recetas';
import { findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { /* repositorio de recetas */ } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-repository-prisma';
import type { ProductCatalog } from '@/lib/modules/inventario';

const productCatalog: ProductCatalog = { findRefs: findProductRefs };
export const recetas = { saveRecipe: createSaveRecipe({ products: productCatalog, /* ... */ }) } as const;
```

Es el mismo patrón que `identity` usa hoy con `PasswordHasher` y `UserCredentialsReader`, y deja
la composición como el único sitio del repo donde `recetas` e `inventario` se tocan de verdad.

---

## 6. Contratos de entrada/salida

**Ninguno externo.** Esta feature no expone endpoints, ni rutas, ni Server Actions, ni servicios
(R31). Los dos contratos que produce son internos y están arriba: `normalizeRecipeName`
(`@/lib/modules/recetas`, § 3) y los tipos `ProductId` / `ProductRef` / `ProductCatalog`
(`@/lib/modules/inventario`, § 5.2). El tercero es el cliente Prisma generado del esquema.

**Integraciones externas:** ninguna. En particular, **Supabase Storage no se toca**: el modelo
guarda una dirección de texto y nada más (decisión 11, R6). Subir el archivo es de QC-25.

---

## 7. Dependencias de terceros

**Ninguna dependencia nueva** (decisión cerrada 19, R32). Regla 7 de `CLAUDE.md` sin propuesta
que abrir, y `tests/guards/guard-dependencias-aprobadas.test.ts` seguirá verde sin tocar
`package.json` — ese es exactamente el criterio de R32.

Tres candidatos que podrían parecerlo y **no** lo son, con su porqué:

| Candidata | Qué haría | Por qué no entra |
| --- | --- | --- |
| `unaccent` (extensión de Postgres) | Quitar acentos en SQL para el índice único | Es `STABLE`, no `IMMUTABLE`: no sirve para un índice ni para una columna generada sin envolverla (§ 3). Además es una extensión de la base, no un paquete npm, y añadirla ataría el esquema a que Supabase la tenga habilitada. |
| `slugify` / `speakingurl` y similares | La normalización del nombre | `String.prototype.normalize('NFD')` es del estándar del lenguaje y resuelve el caso en cuatro líneas puras y testeadas. Además el dominio solo puede importar paquetes **puros** y la regla de `docs/architecture.md > Dependencias de terceros` exige aprobación humana: no compensa una parada por esto. |
| `decimal.js` | Aritmética de la cantidad | `Prisma.Decimal` ya viene con el cliente y aquí **no se hace ninguna aritmética**: solo se guarda y se lee. Mismo argumento que QC-14 § 7. |

La única librería del área —el cliente de Supabase para subir la imagen— es de **QC-25** y entra
por la regla 7 allí (decisión cerrada 19).

---

## 8. Alternativas descartadas

### 8.1 Declarar las FK a `products` y a `users` con `@relation` de Prisma — **descartada**

Es lo natural y lo que Prisma empuja a hacer: daría `include`, tipos ligados y validación del
esquema. Se descarta porque **regala precisamente el cruce de frontera que QC-15 prohíbe**:
`prisma.recipeLine.findMany({ include: { product: true } })` leería la tabla de `inventario`
desde `recetas` sin que ninguna guardia se entere —no es un import, así que
`guard-arquitectura-modulos` no lo ve—. La decisión 3 lo cierra y esta ficha la extiende a la FK
del producto. Coste asumido, escrito en § 4.1: Prisma no valida esas FK y hay que protegerlas del
drift a mano en cada migración futura.

### 8.2 Índice único **total** sobre `name_normalized` — **descartada**

Sería más simple y Prisma lo modelaría solo (`@unique`). Se descarta porque `recipes` tiene
borrado lógico: con índice total, borrar una receta **quema su nombre para siempre** y nadie
puede volver a crear una receta con ese nombre. QC-4 se topó con lo mismo en `users` y lo
resolvió con índices parciales. La decisión 7 heredaba de un caso (presentaciones) que no tenía
borrado lógico y por tanto no respondió a esto; el humano lo cerró el 2026-09-02 a favor del
índice **parcial** (**decisión cerrada 20**), confirmando la posición de este diseño.

### 8.3 `ON DELETE RESTRICT` también entre receta y línea — **descartada**

Impediría borrar físicamente una receta con líneas, lo que suena «seguro». Se descarta porque
contradice la decisión 5 —«al borrar la receta, sus líneas se van con ella»— y porque dejaría el
`down.sql` y cualquier purga bloqueados por filas que **no son hechos históricos**: la línea es
parte de la receta, no un registro independiente. `CASCADE` es lo que dice la decisión; en
operación normal no se dispara nunca (§ 4.2).

### 8.4 Tabla `recipe_steps` con columna de orden — **descartada por el humano**

Consta aquí para que el implementer no la reconsidere: la decisión 10 fijó **un único documento
JSON**. Una tabla de pasos daría integridad de orden y consultas por paso, a cambio de una
tercera tabla, una migración más y un `order` que hay que recalcular en cada reordenación. El
orden de un array jsonb se conserva, que es todo lo que se necesita.

### 8.5 Columna generada `GENERATED ALWAYS AS` para `name_normalized` — **descartada**

Sería imposible de desincronizar, que es su gran ventaja. Se descarta por el motivo técnico de
§ 3: la expresión tendría que ser `IMMUTABLE` y quitar acentos en SQL no lo es sin una función
propia o la extensión `unaccent`. Riesgo que se acepta a cambio: la columna la escribe la
aplicación, así que un `INSERT` por consola puede dejarla incoherente con `name`. El índice único
sigue garantizando que no haya dos claves iguales; lo que no garantiza es que la clave
corresponda al nombre.

### 8.6 Poner la interfaz del producto como puerto de `recetas` — **descartada**

`recetas/ports/product-catalog.ts` parecería más «hexagonal» desde la óptica de `recetas`. Se
descarta porque su implementación tendría que vivir en `recetas/adapters/driven/` y ejecutar
`prisma.product`, y eso es exactamente lo que el bloque 10 de la guardia de módulos prohíbe: el
modelo pertenece a `inventario`. El servicio lo publica el dueño del dato (§ 5.2).

### 8.7 Meter las recetas dentro del módulo `inventario` — **descartada por el humano**

Consta para no reconsiderarla: la decisión 1 fijó módulo propio, coherente con que Recetas sea
épica propia (QC-27). Habría ahorrado toda la frontera de § 4.1 y § 5.2, a cambio de un módulo
`inventario` que crece sin límite.

---

## 9. Preguntas abiertas que deja este diseño

Las de `requirements.md` no se repiten aquí: quedan **dos**, las del humano, porque las tres que
añadió `spec_author` en F1.2 se cerraron el 2026-09-02 y bajaron a la tabla de decisiones (filas
20, 21 y 22) — la 22 cambió el diseño y está propagada en § 2.1 y § 4.1. Estas cuatro son propias
del diseño, ninguna bloquea la implementación y todas tienen posición por defecto:

1. **¿`recipes` necesita índice por `deleted_at`?** No se crea. Todas las consultas de QC-25
   filtrarán `deleted_at IS NULL`, pero el índice único parcial de § 4.3 ya cubre parcialmente
   ese predicado y el catálogo de recetas de una sola empresa no justifica un índice más hoy.
   Añadirlo después es aditivo y barato.
2. **¿Un nombre de receta vacío es un nombre?** `NOT NULL` acepta `''`, y `normalizeRecipeName('  ')`
   devuelve `''`, con lo que **dos recetas de nombre en blanco chocarían** contra el índice
   único. No se añade `CHECK` de longitud mínima: QC-4 y QC-14 dejaron el borde en la ficha del
   CRUD, y la decisión 4 dice explícitamente que los largos viven en la validación de aplicación
   (QC-25). Se anota porque el síntoma —«ya existe una receta con ese nombre» al guardar una
   segunda receta sin nombre— es confuso si nadie lo esperaba.
3. **¿La unidad de la línea debería avisar cuando difiere de la del producto?** Hoy no: la
   decisión 9 dice texto libre y anotativo, sin conversión. Si alguna vez se quiere una alerta
   («esta línea está en g y el producto está en L»), es comparación de texto en la capa de
   aplicación, no una restricción de la base.
4. **¿`image_path` guarda ruta relativa al bucket o URL completa?** El modelo no lo sabe ni le
   importa (R6): es texto. Lo decide QC-25 cuando elija cómo sube el archivo. Se anota porque
   mezclar los dos formatos en la misma columna sí sería un problema, y evitarlo es gratis
   ahora.

---

## 10. Cómo se verifica

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Estático | `tests/unit/recetas/schema/recetas-schema.test.ts` | La **declaración**: campos, obligatoriedad, tipos, `@module recetas`, ausencia de `@relation` hacia `Product` y `User`, ausencia de `@unique` sobre el nombre, `RecipeLine` sin `deletedAt`. Lee `db/schema.prisma` como texto: un tipo de TypeScript no distingue obligatorio de con-defecto ni dice si la relación es `Cascade`. |
| Estático | `tests/unit/recetas/schema/recetas-migration.test.ts` | El **SQL**: las tres FK a mano con su `RESTRICT`, el `CASCADE` receta→línea, `DECIMAL(14,4)`, el `CHECK > 0`, el índice único **parcial**, el índice único compuesto, los índices de FK, los cuatro `ALTER` de RLS, y que `down.sql` revierte exactamente el UP. Con **tests de sensibilidad** (mutar `> 0` a `>= 0`, quitar el `WHERE deleted_at IS NULL`, cambiar `DECIMAL` por `DOUBLE PRECISION`) como hizo QC-14: un test que no puede fallar no vigila nada. |
| Unitario | `tests/unit/recetas/domain/recipe-name.test.ts` | La normalización: acentos, mayúsculas, signos y espacios; los tres ejemplos de QC-20 D12; e idempotencia (`f(f(x)) === f(x)`). |
| Unitario | `tests/unit/recetas/module-contract.test.ts` | La forma del módulo nuevo y la frontera: `index.ts` solo reexporta de `./domain`, las carpetas del módulo son exactamente `domain`/`ports`/`adapters`, ningún `'use server'` alcanzable desde el barrel, `inventario` publica `ProductCatalog`, y en `lib/modules/recetas/**` no hay `prisma.product`, `@prisma/client` ni rutas profundas a `inventario`. |
| Integración | `tests/integration/recetas/recetas-constraints.int.test.ts` | Que la base **de verdad** rechaza y permite lo que debe. Cada caso en `prisma.$transaction` que termina en `ROLLBACK`, cada operación que debe fallar envuelta en `SAVEPOINT`, y se afirma sobre el **SQLSTATE** (`23502` not-null, `23503` FK, `23505` único, `23514` check), **nunca** sobre el texto del mensaje: en esta máquina Postgres responde en español. Copiar los helpers de `tests/integration/inventario/inventario-constraints.int.test.ts`. |
| Guardia (ya existe) | `tests/guards/guard-rls-force.test.ts` | R29, sin tocar la guardia. |
| Guardia (ya existe) | `tests/guards/guard-arquitectura-modulos.test.ts` | R17, R18, R20: `@module` en los dos modelos, forma del módulo nuevo, ninguna ruta profunda. |
| Guardia (ya existe) | `tests/guards/guard-dependencias-aprobadas.test.ts` | R32. |

**Sin E2E**, y con motivo (decisión 17, R31): no hay pantalla ni flujo navegable. `CHECKPOINTS.md`
pide E2E para «movimientos de inventario»; esta feature no mueve existencias, persiste una
fórmula. Lo decide QC-26.

Cuatro avisos para el implementer:

- El test de integración necesita **productos** en la base para poder insertar una línea (la FK
  es real), y **usuarios** para los casos con autor. El autor es opcional (R33), así que hay que
  cubrir los dos caminos: receta con autor real y receta sin autor. Crear las filas dentro de la
  transacción y hacerles `ROLLBACK`, sin depender del seed.
- `beforeAll` debe fallar con un mensaje claro («corre `pnpm run db:migrate`») si `recipes` o
  `recipe_lines` no existen, no con un error de Prisma a mitad del primer caso.
- Un test de RLS escrito con Prisma sale verde pase lo que pase (Prisma se conecta como dueño de
  las tablas). No se escribe: R29 se cierra con la guardia estática sobre el SQL.
- R30 se cierra de verdad con el ciclo `db:migrate` → `db:rollback` → `db:migrate` (task T8), no
  con el test estático, que solo lee texto.
