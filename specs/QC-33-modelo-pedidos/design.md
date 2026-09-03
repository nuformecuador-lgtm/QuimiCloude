# QC-33 — modelo-pedidos · design.md

> Zona: `backend` · Complejidad: `medium` · depends_on: `QC-32`, `QC-24` ·
> Rama: `feature/QC-33-modelo-pedidos`
>
> El **qué** está en `requirements.md` (R1–R40) y su alcance lo cerró el humano el 2026-09-03
> (26 decisiones cerradas). Aquí va el **cómo**: la forma exacta del modelo `Order`, los dos
> tipos enumerados —los **primeros** `enum` de Prisma del repositorio—, el correlativo por año
> con lo que el esquema garantiza y lo que no, los tres `CHECK`, las cuatro FK escritas a mano,
> el `down.sql`, y el armazón del módulo `pedidos` con su contrato.
>
> Precedentes literales que se copian, no se reinventan:
> **QC-24 — modelo-recetas** (`specs/QC-24-modelo-recetas/`,
> `db/migrations/20260902163256_recipes_and_recipe_lines/`) para la cantidad `decimal(14,4)` con
> `CHECK`, el borrado lógico, las FK que cruzan de módulo como escalares sin `@relation` y la
> forma de un módulo que hoy es solo modelo y contrato;
> **QC-32 — modelo-unidades** (`specs/QC-32-modelo-unidades/`,
> `db/migrations/20260903121404_units_catalog/`) para la FK al catálogo con `ON DELETE RESTRICT`,
> el reparto de tests y las mutaciones de sensibilidad;
> **QC-14/QC-20** para el `decimal(14,4)` del dinero y para el índice de identidad como única
> garantía real.

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `db/schema.prisma` | **Nuevos**: `enum OrderStatus`, `enum OrderPriority` y el modelo `Order` con `/// @module pedidos`. **No se modifica ningún modelo existente** (R5). |
| `db/migrations/<ts>_orders/migration.sql` | UP: los dos `CREATE TYPE`, `CREATE TABLE "orders"`, el índice único del correlativo, los índices de FK, las **cuatro FK escritas a mano**, los **tres `CHECK`** y los dos `ALTER` de RLS. |
| `db/migrations/<ts>_orders/down.sql` | DOWN manual: `DROP TABLE "orders"` más los dos `DROP TYPE`. |
| `lib/modules/pedidos/index.ts` | **Nuevo**: contrato público del módulo. |
| `lib/modules/pedidos/domain/order-number.ts` | **Nuevo**: `OrderId`, `OrderNumber` y `formatOrderNumber`, la única definición del formato visible (R24). |
| `lib/modules/pedidos/domain/order-classification.ts` | **Nuevo**: los valores de estado y prioridad como tipos y listas ordenadas del dominio, sin Prisma (R35). |
| `lib/modules/pedidos/domain/order-contents.ts` | **Nuevo**: `OrderContents`, la costura tipada hacia `recetas` y `unidades` (§ 6.3). |
| `lib/modules/pedidos/ports/.gitkeep`, `adapters/driven/.gitkeep`, `adapters/driving/.gitkeep` | **Nuevo**: las tres carpetas nacen vacías, igual que en `lib/modules/recetas` y `lib/modules/unidades`. Las llena QC-34. |
| `lib/modules/recetas/domain/recipe-catalog.ts` | **Nuevo, en módulo ajeno**: publica `RecipeId` (§ 6.4). Es el único archivo de `recetas` que toca esta ficha, y es **aditivo**. |
| `lib/modules/recetas/index.ts` | Reexporta el tipo nuevo. |
| `lib/composition/index.ts` | **Sin tocar**: `pedidos` no cablea nada (no hay puerto ni adaptador todavía). |
| `tests/unit/pedidos/schema/pedidos-schema.test.ts` | Estático sobre `db/schema.prisma` (§ 9). |
| `tests/unit/pedidos/schema/pedidos-migration.test.ts` | Estático sobre el SQL del UP y del DOWN, con mutaciones de sensibilidad (§ 9). |
| `tests/unit/pedidos/domain/order-number.test.ts` | El formato del número visible. |
| `tests/unit/pedidos/module-contract.test.ts` | Forma del módulo, fronteras y la coincidencia dominio ↔ esquema (R35). |
| `tests/integration/pedidos/pedidos-constraints.int.test.ts` | Contra Postgres real (§ 9). |

**Ningún test de otra feature caduca con esta ficha.** Es la diferencia con QC-32: aquí no se altera
ninguna tabla ajena ni ninguna columna existente. Lo único que se toca fuera de `pedidos` es el
`index.ts` de `recetas`, y solo para **añadir** un tipo (§ 6.4).

---

## 2. Modelo de datos

### 2.1 Los dos tipos enumerados

```prisma
/// Estado del pedido (QC-33, decision cerrada 4). Conjunto CERRADO en el propio esquema:
/// anadir un valor es una migracion del tipo en Postgres, y el humano lo asumio a conciencia.
/// Se aparta a proposito de `DocumentType` (QC-4), que resolvio el mismo problema con una
/// tabla porque el conjunto DEBIA crecer sin migrar; aqui no debe.
/// Que transiciones son validas NO se decide aqui: es QC-34 (R19).
enum OrderStatus {
  PENDIENTE
  EN_CURSO
  ENTREGADO
}

/// Prioridad del pedido (QC-33, decision cerrada 4). EL ORDEN DE DECLARACION ES EL ORDEN DE
/// LA PRIORIDAD, de menor a mayor: reordenar estas cuatro lineas cambia el significado del
/// dato y el `ORDER BY priority` de cualquier consulta futura. Postgres ordena un enum por su
/// orden de declaracion, no alfabeticamente.
enum OrderPriority {
  BAJA
  MEDIA
  ALTA
  CRITICA
}
```

**Son los primeros `enum` de Prisma del repositorio.** Hasta hoy el único conjunto cerrado
(`DocumentType`) era una tabla. Tres consecuencias que el implementer tiene que tener presentes:

1. Prisma genera `CREATE TYPE "OrderStatus" AS ENUM (...)` en el UP. El `down.sql` **tiene que
   borrarlos a mano**: un `DROP TABLE` no se lleva el tipo, y dejarlo huérfano incumple R38.
2. El nombre del tipo es el del `enum` de Prisma, así que va en **inglés** (R36). Los **valores**
   van en castellano porque son términos de negocio que fijó el humano.
3. Añadir un valor mañana es `ALTER TYPE ... ADD VALUE`, que **no** se puede ejecutar dentro de una
   transacción en Postgres < 12 y que no se puede deshacer con un `DROP VALUE` (no existe). Es el
   coste que la decisión 4 asume.

### 2.2 `Order` → tabla `orders`

```prisma
/// Pedido del ERP (QC-33). Una sola LINEA: receta, cantidad, unidad y precio UNITARIO
/// (decision cerrada 1). No hay cabecera ni items, y no hay cliente ni destinatario
/// (decision cerrada 8, R3): eso es deliberado y anadirlo despues obliga a decidir que
/// cliente llevaban los pedidos ya cargados.
///
/// NO hay columna de total y es deliberado (decision cerrada 5, R10): el total es
/// `quantity * unitPrice`, se calcula al leer y no se guarda, para que no pueda contradecir
/// a sus factores. Tampoco hay impuestos ni facturacion: este ERP no factura
/// (`docs/architecture.md > Dominio`, pregunta abierta 4, cerrada por esta ficha).
///
/// NO hay columna de fecha de solicitud (decision cerrada 10, R4): la pone el sistema y no se
/// edita, o sea que es exactamente `createdAt`. Dos columnas con el mismo dato solo divergen.
///
/// OJO 1 — el correlativo son DOS columnas, `orderYear` + `orderSequence`, con indice unico
/// COMPUESTO y TOTAL (R21, R22). NO es parcial, a diferencia de `recipes_name_unique`: un
/// pedido borrado logicamente conserva su numero y NO lo libera (decision cerrada 9). El
/// numero visible `2026-0001` NO se guarda: lo compone `formatOrderNumber` del dominio (R24).
///
/// OJO 2 — `recipeId`, `unitId`, `createdBy` y `updatedBy` son FK REALES pero se declaran como
/// ESCALARES SIN `@relation` a proposito (decision cerrada 17 y su aplicacion a las otras dos
/// fronteras, R33): las cuatro FK estan escritas A MANO en `migration.sql`. Asi la base
/// garantiza la integridad y, a la vez, el cliente Prisma NO puede atravesar de `pedidos` a
/// `recetas`, `unidades` ni `users` con un `include`. La guardia de modulos NO detectaria ese
/// cruce, porque no es un import. Es DRIFT para Prisma: toda migracion futura de `orders` hay
/// que revisarla a mano para que no borre las cuatro FK, los tres CHECK ni el RLS.
///
/// `createdBy`/`updatedBy` son ANULABLES (decision cerrada 18, R26): NULL significa «no lo creo
/// una persona» —una importacion, un seed—, no «se perdio el dato».
/// @module pedidos
model Order {
  id           String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderYear    Int           @map("order_year")
  orderSequence Int          @map("order_sequence")
  recipeId     String        @map("recipe_id") @db.Uuid
  quantity     Decimal       @db.Decimal(14, 4)
  unitId       String        @map("unit_id") @db.Uuid
  unitPrice    Decimal       @map("unit_price") @db.Decimal(14, 4)
  priority     OrderPriority @default(BAJA)
  status       OrderStatus   @default(PENDIENTE)
  createdBy    String?       @map("created_by") @db.Uuid
  updatedBy    String?       @map("updated_by") @db.Uuid
  createdAt    DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt    DateTime?     @map("deleted_at") @db.Timestamptz(6)

  @@unique([orderYear, orderSequence], map: "orders_order_year_order_sequence_key")
  @@index([recipeId], map: "orders_recipe_id_idx")
  @@index([unitId], map: "orders_unit_id_idx")
  @@index([createdBy], map: "orders_created_by_idx")
  @@index([updatedBy], map: "orders_updated_by_idx")
  @@map("orders")
}
```

| Campo | Columna | Tipo Postgres | Nulo | Requisito |
| --- | --- | --- | --- | --- |
| `id` | `id` | `UUID DEFAULT gen_random_uuid()` | no | R1 |
| `orderYear` | `order_year` | `INTEGER` | no | R20, R23 |
| `orderSequence` | `order_sequence` | `INTEGER` | no | R20, R21, R22 |
| `recipeId` | `recipe_id` | `UUID` | **no** | R14, R33 |
| `quantity` | `quantity` | `DECIMAL(14,4)` | no | R6, R7 |
| `unitId` | `unit_id` | `UUID` | **no** | R12, R33 |
| `unitPrice` | `unit_price` | `DECIMAL(14,4)` | no | R8, R9 |
| `priority` | `priority` | `"OrderPriority" DEFAULT 'BAJA'` | no | R16, R18 |
| `status` | `status` | `"OrderStatus" DEFAULT 'PENDIENTE'` | no | R16, R17, R29 |
| `createdBy` | `created_by` | `UUID` | **sí** | R25, R26 |
| `updatedBy` | `updated_by` | `UUID` | **sí** | R25, R26 |
| `createdAt` | `created_at` | `TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP` | no | R4, R28 |
| `updatedAt` | `updated_at` | `TIMESTAMPTZ(6)` (lo rellena `@updatedAt`) | no | R28 |
| `deletedAt` | `deleted_at` | `TIMESTAMPTZ(6)` | sí | R27, R29 |

Tres ausencias son **deliberadas** y el test estático las comprueba **en positivo**, porque una
columna que no está no salta a la vista: **no** hay `total` ni `subtotal` (R10), **no** hay `tax`,
`discount` ni nada de facturación (R11), **no** hay `customer_id` ni `client` (R3), y **no** hay
`requested_at` ni `order_date` (R4).

**`priority` es `NOT NULL` con `DEFAULT 'BAJA'`, no anulable.** «Opcional» en la decisión 13 es
opcional **en la entrada**: quien crea un pedido puede no indicarla. En la columna, ausencia de
valor y «prioridad baja» serían dos cosas distintas que significan lo mismo, y R18 lo prohíbe
explícitamente. Es el mismo criterio con el que QC-24 R5 dejó los pasos en lista vacía en vez de
`NULL`.

---

## 3. Los tres `CHECK` (Prisma no modela ninguno)

```sql
-- La cantidad es siempre positiva (decision cerrada 7, R7). `> 0`, no `>= 0`: ni negativa ni
-- cero. La ausencia la rechaza el NOT NULL (23502) y el cero, este CHECK (23514). Copiado
-- literal de `recipe_lines_quantity_positive` (QC-24).
ALTER TABLE "orders" ADD CONSTRAINT "orders_quantity_positive" CHECK ("quantity" > 0);

-- El precio unitario nunca es negativo (decision cerrada 6, R9). `>= 0`, NO `> 0`: el cero es
-- un precio legitimo (una muestra, una reposicion sin cargo) y la decision dice «nunca
-- negativo», no «siempre positivo». Es la diferencia deliberada con el CHECK de arriba.
ALTER TABLE "orders" ADD CONSTRAINT "orders_unit_price_non_negative" CHECK ("unit_price" >= 0);

-- Un pedido ENTREGADO no se puede borrar (decision cerrada 14, R29). Escrito TAL CUAL lo fijo
-- el humano. Misma filosofia que QC-20 D16: sin garantia en la base no es una garantia real, y
-- la validacion de QC-34 se anade a esta, no la sustituye.
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_not_deleted"
  CHECK ("deleted_at" IS NULL OR "status" <> 'ENTREGADO');
```

Qué hace exactamente el tercero, porque es simétrico y conviene leerlo en los dos sentidos:

- Bloquea el `UPDATE` que pone `deleted_at` en un pedido `ENTREGADO` → eso es R29 en su forma
  esperada.
- Bloquea **también** el `UPDATE` que pone `status = 'ENTREGADO'` en un pedido ya borrado. No estaba
  escrito en la decisión, pero es la misma frase leída al revés y es lo correcto: un pedido borrado
  no se entrega.
- Bloquea el `INSERT` que nace con las dos cosas a la vez.
- **No** bloquea nada más: borrar un pedido `PENDIENTE` o `EN_CURSO` sigue siendo legal (R30), y un
  `CHECK` que rechazara eso sería un error silencioso que solo se vería en producción.

Un cuarto `CHECK` que **sí** se añade y no viene de una decisión literal:

```sql
-- La posicion del correlativo es un entero positivo (R20). Sale de «correlativo unico y
-- creciente» (decision cerrada 9): una posicion 0 o negativa no es un correlativo.
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_sequence_positive" CHECK ("order_sequence" > 0);
```

**No se añade ningún `CHECK` sobre `order_year`.** El porqué y la alternativa evaluada están en
§ 5.2; es la pregunta abierta 4 de `requirements.md`.

---

## 4. Las cuatro FK escritas a mano (R14, R12, R25, R33)

```sql
ALTER TABLE "orders" ADD CONSTRAINT "orders_recipe_id_fkey"
  FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Es el razonamiento de QC-24 § 4.1 y QC-32 § 4.3 aplicado a **tres** fronteras a la vez. Dos
garantías por el precio de una:

1. **Integridad real** (R12, R14, R25): un pedido apuntando a una receta, una unidad o un usuario
   inexistentes es basura, y eso solo lo garantiza una FK de verdad.
2. **Frontera de módulo** (R33): con `@relation`, Prisma ofrecería
   `prisma.order.findMany({ include: { recipe: true } })` desde `pedidos` —una lectura de la tabla
   de `recetas` **que ninguna guardia detecta**, porque no es un import ni un `prisma.recipe`—, y
   además obligaría a declarar `orders Order[]` dentro de `Recipe`, `Unit` y `User`, que son de
   otros tres módulos.

Por qué las cuatro son `RESTRICT` y ninguna es otra cosa:

- **Receta** (decisión 16, R15): el borrado de receta es **lógico**, así que en operación normal esta
  FK no se dispara nunca —una FK no reacciona a un `UPDATE`— y el pedido conserva su referencia sin
  que nadie haga nada. El `RESTRICT` existe para que un borrado **físico** por consola o una purga
  no deje pedidos apuntando al vacío. Es exactamente lo que hace verdadera la decisión 16.
- **Unidad** (decisión 11): aquí sí es la garantía activa, porque `units` **no** tiene borrado lógico
  (QC-32 decisión 11): un `DELETE` sobre una unidad usada es posible y este `RESTRICT` es lo único
  que lo para.
- **Autores**: nunca `ON DELETE SET NULL`, aunque la columna lo permitiría. Convertiría «al usuario
  lo borraron» en «no lo creó una persona», que son cosas distintas y la decisión 18 las separa a
  propósito. Literal de QC-24.
- `ON UPDATE CASCADE` por convención del repo: las siete FK que ya existen lo llevan.

**Que `created_by` y `updated_by` sean anulables no afloja nada**: en SQL una FK solo se verifica
cuando la columna tiene valor, así que un pedido sin autor pasa (R26) y un pedido con un autor
inventado se rechaza con `23503` (R25).

Los cuatro `CREATE INDEX` del lado hijo (`orders_recipe_id_idx`, `orders_unit_id_idx`,
`orders_created_by_idx`, `orders_updated_by_idx`) no son decorativos: Postgres no indexa
automáticamente el lado hijo de una FK, y por ahí pasa tanto la verificación del `RESTRICT` como la
consulta «qué pedidos usan esta receta» que QC-34 va a necesitar el primer día.

---

## 5. El correlativo por año: lo delicado de esta ficha

La decisión 9 pide cuatro cosas a la vez —**por año**, **único**, **creciente** y **no reutilizado
aunque el pedido se borre**—, y no todas viven en el mismo sitio. Esta sección dice cuál vive dónde,
y **cuál no cabe en el esquema**.

### 5.1 Dónde vive la garantía: dos columnas y un índice único **total**

```sql
CREATE UNIQUE INDEX "orders_order_year_order_sequence_key"
  ON "orders"("order_year", "order_sequence");
```

- **Único por año** (R21): lo garantiza el índice único compuesto. No hay comprobación previa por
  igualdad, que sería una carrera (entre el `SELECT` y el `INSERT` cabe otra transacción). Es el
  mismo criterio de QC-20 D16 y QC-24: sin índice no es una garantía real.
- **No reutilizado** (R22): el índice es **TOTAL**, sin `WHERE "deleted_at" IS NULL`. Aquí está la
  diferencia con `recipes_name_unique` (QC-24), que **sí** es parcial y libera el nombre al borrar.
  Como el borrado es lógico, la fila del pedido borrado sigue existiendo y sigue ocupando su
  `(año, posición)`: nadie puede volver a usarlo. **Es una línea de SQL que hace lo contrario que su
  precedente más cercano**, así que el test estático de la migración incluye una mutación que le
  añade el `WHERE` y comprueba que el predicado cae.
- **Reinicio anual** (R23): sale gratis de que el año esté **en el índice**. `(2026, 1)` y
  `(2027, 1)` son dos claves distintas.
- **Creciente**: esto **no** lo garantiza el esquema. Ver § 5.3.

El prefijo izquierdo del índice sirve además de índice para «pedidos de este año», así que no hace
falta un `orders_order_year_idx` aparte: sería redundante.

### 5.2 Por qué el año es una columna y no se deriva de `created_at`

La tentación es no guardar el año: ya está en `created_at`. Se descarta por dos motivos, uno técnico
y otro de negocio:

- **Técnico:** una columna generada o un índice necesitan una expresión `IMMUTABLE`, y
  `EXTRACT(YEAR FROM created_at)` sobre un `timestamptz` depende del `TimeZone` de la sesión, así que
  es `STABLE`. Es el mismo muro con el que chocaron QC-24 y QC-32 al querer normalizar en SQL.
- **De negocio:** la decisión 9 dice que **el año forma parte de la identidad** del pedido. Un dato
  que identifica se guarda; uno que se calcula al vuelo puede cambiar de valor sin que nadie escriba
  nada (basta con que cambie la zona horaria de la conexión).

Se evaluó un `CHECK` que atara las dos columnas —
`CHECK (order_year = EXTRACT(YEAR FROM (created_at AT TIME ZONE 'UTC'))::int)`, que **sí** sería
inmutable— y **no se añade**: obliga a elegir una zona horaria, y esa elección no está decidida. Un
pedido creado el 31 de diciembre a las 20:00 en Ecuador (UTC−5) ya es del año siguiente en UTC, así
que el `CHECK` rechazaría un pedido correcto o forzaría un correlativo del año que no toca. Queda
como **pregunta abierta 4** de `requirements.md` con su posición por defecto escrita: hoy nada ata
`order_year` a `created_at`, y quien asigne el correlativo (QC-34) decide con qué reloj.

### 5.3 Lo que NO cabe en esta ficha, y hay que decirlo

**Quién calcula la siguiente posición no se decide aquí, y no puede decidirse aquí**: esta feature no
tiene ninguna escritura —ni caso de uso, ni service, ni adaptador (R39)—, así que no hay ningún sitio
donde poner esa lógica. El esquema garantiza que el número **no se duplica** y que **no se
reutiliza**; que sea **creciente** y que dos altas simultáneas no se estorben es de **QC-34**.

Lo que QC-34 va a tener que resolver, escrito aquí para que llegue a su spec y no se descubra en
producción:

| Estrategia | Qué pasa con dos altas simultáneas del mismo año | Coste |
| --- | --- | --- |
| `max(order_sequence) + 1` dentro del año, en la misma transacción | Las dos leen el mismo máximo; una gana y la otra choca con `23505` sobre `orders_order_year_order_sequence_key` | Hay que **reintentar** el alta al detectar `23505`, y traducir el error si el reintento no basta |
| `SELECT ... FOR UPDATE` sobre una fila de contador por año, o `pg_advisory_xact_lock(year)` | Se serializan: la segunda espera | Sin huecos, pero las altas del mismo año dejan de ser paralelas |
| Una `SEQUENCE` de Postgres por año | No se estorban | DDL en tiempo de ejecución (crear la secuencia del año nuevo el 1 de enero), y **una transacción abortada consume el número**: aparecen huecos |

**No se elige ninguna aquí a propósito.** Elegirla sin el caso de uso delante sería adivinar, y las
tres tienen consecuencias distintas sobre si el correlativo puede tener huecos —que **tampoco está
decidido**: preguntas abiertas 2 y 3 de `requirements.md`—. Lo que esta ficha garantiza es que
**ninguna de las tres puede producir un número duplicado ni reutilizado**, porque el índice único
está debajo de todas.

### 5.4 El número visible no se guarda (R24)

```ts
// lib/modules/pedidos/domain/order-number.ts
/** Identificador de un pedido visto DESDE FUERA de `pedidos`. */
export type OrderId = string;

/** El correlativo tal como vive en la base: el ano y la posicion dentro de ese ano
 *  (decision cerrada 9). El numero VISIBLE no se guarda: se compone con
 *  `formatOrderNumber` (R24). */
export type OrderNumber = {
  readonly year: number;
  readonly sequence: number;
};

/** UNICA definicion del formato visible del correlativo: `2026-0001` (R24). La posicion se
 *  rellena a cuatro digitos; si algun ano pasa de 9.999 el numero crece en vez de truncarse
 *  (requirements.md, pregunta abierta 5). No se persiste el resultado: guardar el texto
 *  formateado seria un tercer sitio donde vive el mismo dato, y el tercer sitio siempre es el
 *  que se desincroniza. */
export function formatOrderNumber({ year, sequence }: OrderNumber): string {
  return `${year}-${String(sequence).padStart(4, '0')}`;
}
```

Mismo criterio con el que la decisión 5 dejó fuera el total: **un dato derivado no se guarda**. Con
el año y la posición en la base, el texto es una función pura de dos enteros; con el texto en una
tercera columna, hay tres representaciones del mismo hecho y nada impide que digan cosas distintas.
La alternativa —una sola columna `order_number TEXT` con índice único— está evaluada y descartada en
§ 8.2.

---

## 6. El módulo `pedidos`

### 6.1 Carpetas que nacen

```
lib/modules/pedidos/
  index.ts                       # CONTRATO PUBLICO: solo reexporta de ./domain
  domain/
    order-number.ts              # OrderId, OrderNumber, formatOrderNumber (R24)
    order-classification.ts      # estado y prioridad, sin Prisma (R35)
    order-contents.ts            # OrderContents: la costura hacia recetas y unidades (R32)
  ports/.gitkeep                 # vacia: no hay puerto todavia (lo trae QC-34)
  adapters/
    driven/.gitkeep              # vacia: NADIE consulta `orders` hoy
    driving/.gitkeep             # vacia: la llena QC-34
```

Precedente exacto: `lib/modules/recetas` y `lib/modules/unidades`, que hoy son solo modelo y
contrato. La guardia de módulos prohíbe cualquier carpeta que no sea `domain/`, `ports/` o
`adapters/`, y sigue verde con las tres presentes y vacías. **`pedidos` no hay que añadirlo a
`REQUIRED_MODULES`** de `tests/guards/guard-arquitectura-modulos.test.ts` (esa lista son solo
`identity` e `inventario`): la guardia descubre los módulos leyendo `lib/modules/` y le aplica todas
las demás reglas igual. Tocar la guardia no es de esta ficha.

```ts
// lib/modules/pedidos/index.ts — CONTRATO PUBLICO del modulo `pedidos`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente sin
// arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de imports.
// Los adaptadores driving que traiga QC-34 NO pasan por aqui.
export { formatOrderNumber } from './domain/order-number';
export type { OrderId, OrderNumber } from './domain/order-number';
export {
  ORDER_PRIORITY_VALUES,
  ORDER_STATUS_VALUES,
  DEFAULT_ORDER_PRIORITY,
  DEFAULT_ORDER_STATUS,
} from './domain/order-classification';
export type { OrderPriority, OrderStatus } from './domain/order-classification';
export type { OrderContents } from './domain/order-contents';
```

### 6.2 Estado y prioridad en el dominio, sin Prisma (R35)

```ts
// lib/modules/pedidos/domain/order-classification.ts
/** Los tres estados, EN SU ORDEN DE DECLARACION del esquema. El dominio NO puede importar
 *  `@prisma/client` (`docs/architecture.md > La regla de dependencias`), asi que estos valores
 *  son un DUPLICADO del `enum OrderStatus` de `db/schema.prisma`. Es el punto fragil del
 *  modulo, y por eso R35 existe: `module-contract.test.ts` lee el esquema y compara las dos
 *  listas, valor a valor y en orden. */
export const ORDER_STATUS_VALUES = ['PENDIENTE', 'EN_CURSO', 'ENTREGADO'] as const;
export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

/** Las cuatro prioridades, DE MENOR A MAYOR. El orden es el dato: es lo que fijo la decision
 *  cerrada 4 y lo que ordena Postgres al comparar dos valores del enum. */
export const ORDER_PRIORITY_VALUES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type OrderPriority = (typeof ORDER_PRIORITY_VALUES)[number];

/** Los dos defectos, tambien duplicados del esquema (`@default`) y tambien vigilados por R35. */
export const DEFAULT_ORDER_STATUS: OrderStatus = 'PENDIENTE';
export const DEFAULT_ORDER_PRIORITY: OrderPriority = 'BAJA';
```

Este duplicado es exactamente el mismo problema que QC-32 § 6.1.3 (el `name_normalized` literal en
el SQL) y se resuelve igual: **no se evita, se vigila con un test que importa las dos fuentes y las
compara**. La alternativa —reexportar el tipo generado por Prisma desde el dominio— está descartada
en § 8.3.

### 6.3 `OrderContents`: la costura tipada hacia los otros dos módulos (R32)

```ts
// lib/modules/pedidos/domain/order-contents.ts
import type { RecipeId } from '@/lib/modules/recetas';
import type { UnitId } from '@/lib/modules/unidades';

/** Lo que un pedido guarda de la receta y de la unidad: SUS IDENTIFICADORES, nada mas
 *  (`docs/architecture.md > Dominio` n.o 2). `pedidos` no conoce la tabla de recetas ni la de
 *  unidades, y quien necesite el nombre de la receta o el simbolo de la unidad para pintarlos
 *  los pedira al contrato de su dueno.
 *
 *  Los importes viajan como TEXTO decimal, no como `number`: 14 digitos con 4 decimales no
 *  caben en un `number` de JavaScript sin riesgo de redondeo, y el dominio no puede importar
 *  el `Decimal` de Prisma (`docs/architecture.md > Anti-patrones`, § 10). */
export type OrderContents = {
  readonly recipeId: RecipeId;
  readonly quantity: string;
  readonly unitId: UnitId;
  readonly unitPrice: string;
};
```

Son **solo tipos**: desaparecen al compilar, así que no son código muerto — son la costura que las FK
de § 4 hacen inevitable, con el mismo argumento con el que QC-24 publicó `ProductCatalog` y QC-32
`UnitCatalog` antes de tener consumidor. Y son lo que hace **testeable** la parte del alcance que
dice que `pedidos` conoce la receta y la unidad por su contrato público: sin ningún tipo que los
importe, R32 sería un requisito vacío que pasa por no existir el sujeto.

### 6.4 Lo único que esta ficha toca fuera de `pedidos`: `RecipeId`

`recetas` hoy publica **solo** `normalizeRecipeName`. `unidades` ya publica `UnitId`, pero `recetas`
no tiene equivalente, así que § 6.3 no compila sin añadirlo:

```ts
// lib/modules/recetas/domain/recipe-catalog.ts
/** Identificador de una receta visto DESDE FUERA de `recetas`. Es lo unico que otro modulo
 *  guarda de una receta (p. ej. `orders.recipe_id`). Anadido por QC-33; el modelo de QC-24 NO
 *  se toca (R5). */
export type RecipeId = string;
```

Es **aditivo**: no cambia ninguna firma existente, no toca `db/schema.prisma` y no invalida ningún
test de QC-24. Lo que **no** se hace es publicar ya un `RecipeCatalog` con `findRefs` copiando a
`ProductCatalog` y `UnitCatalog` — ver § 8.4.

---

## 7. La migración

### 7.1 Orden del UP

1. `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (autocontenida, como QC-4/QC-14/QC-24/QC-32).
2. `CREATE TYPE "OrderStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'ENTREGADO');`
3. `CREATE TYPE "OrderPriority" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');`
4. `CREATE TABLE "orders" (...)` con sus catorce columnas y su `orders_pkey`.
5. `CREATE UNIQUE INDEX "orders_order_year_order_sequence_key"` (§ 5.1).
6. Los cuatro `CREATE INDEX` del lado hijo de las FK.
7. Las **cuatro FK** escritas a mano (§ 4).
8. Los **cuatro `CHECK`** escritos a mano (§ 3).
9. `ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;` + `... FORCE ROW LEVEL SECURITY;` (R37).

**No hay guardia de datos `DO $$` en esta migración**, a diferencia de QC-32. No hace falta: esta
feature **crea** una tabla y dos tipos y no toca ni una fila ni una columna existente, así que no
hay ningún dato que pueda perderse. Escribir una guardia «por simetría» sería ruido.

Cabecera del `migration.sql` indicando, como en QC-24 y QC-32, **qué se escribió a mano** —las
cuatro FK, los cuatro `CHECK` y los dos `ALTER` de RLS— y que toda migración futura sobre `orders`
hay que revisarla a mano para que el drift de `prisma migrate dev` no las borre. Si esas líneas se
pierden, el esquema sigue validando y el cliente sigue compilando: no se entera nadie.

### 7.2 El `down.sql` (R38)

```sql
-- DOWN de la migracion orders. Convencion propia del repo: Prisma Migrate no genera down
-- migrations (`docs/architecture.md > Migraciones up/down`). Lo aplica `pnpm run db:rollback`.
--
-- Revierte exactamente el `migration.sql`, en orden inverso. Los cinco indices, los cuatro
-- CHECK y las cuatro FK —tambien las cuatro escritas a mano— caen con la tabla, asi que no se
-- dropean aparte.
--
-- LOS DOS TIPOS SI HAY QUE BORRARLOS A MANO: un DROP TABLE no se lleva el tipo enumerado, y
-- dejarlos huerfanos NO es «el esquema exacto anterior» (R38). Son los primeros enum del
-- repositorio, asi que este es el primer down.sql que lo necesita.
--
-- NO se elimina la extension `pgcrypto`: esta migracion no la crea en exclusiva y otras cuatro
-- dependen de ella.

DROP TABLE IF EXISTS "orders";
DROP TYPE IF EXISTS "OrderStatus";
DROP TYPE IF EXISTS "OrderPriority";
```

El orden importa: los tipos se borran **después** de la tabla que los usa, o Postgres rechaza el
`DROP TYPE` por dependencia. R38 se cierra de verdad con el ciclo `db:migrate` → `db:rollback` →
`db:migrate` (T8), no con el test estático, que solo lee texto.

### 7.3 Identificadores (R36)

`orders`, `order_year`, `order_sequence`, `recipe_id`, `quantity`, `unit_id`, `unit_price`,
`priority`, `status`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`,
`orders_pkey`, `orders_order_year_order_sequence_key`, `orders_recipe_id_idx`, `orders_unit_id_idx`,
`orders_created_by_idx`, `orders_updated_by_idx`, `orders_recipe_id_fkey`, `orders_unit_id_fkey`,
`orders_created_by_fkey`, `orders_updated_by_fkey`, `orders_quantity_positive`,
`orders_unit_price_non_negative`, `orders_delivered_not_deleted`, `orders_order_sequence_positive`,
`OrderStatus`, `OrderPriority`. Todos en inglés, sin excepciones. Los **valores**
(`PENDIENTE`, `EN_CURSO`, `ENTREGADO`, `BAJA`, `MEDIA`, `ALTA`, `CRITICA`) van en castellano porque
los fijó el humano y son datos, no identificadores (R36).

---

## 8. Alternativas descartadas

### 8.1 Declarar las cuatro FK con `@relation` de Prisma — **descartada**

Es lo natural y lo que Prisma empuja: daría `include`, tipos ligados y validación del esquema. Se
descarta porque regala tres cruces de frontera que QC-15 prohíbe —`include: { recipe: true }`,
`{ unit: true }`, `{ createdByUser: true }` desde `pedidos`— y **ninguna guardia lo detectaría**,
porque no es un import ni un `prisma.<modelo>`. Además obligaría a declarar los campos de vuelta
`orders Order[]` dentro de `Recipe`, `Unit` y `User`, que son de otros tres módulos: el esquema
pasaría a decir que `recetas`, `unidades` e `identity` conocen a sus consumidores. Coste asumido, el
mismo de QC-24 y QC-32: Prisma no valida estas FK, el error llega en tiempo de ejecución como
`P2003`, y toda migración futura de `orders` hay que revisarla a mano contra el drift.

### 8.2 Una sola columna `order_number TEXT` con el número ya formateado — **descartada**

Sería una columna en vez de dos, un índice único simple, y las búsquedas por «2026-0001» serían
directas. Se descarta por tres motivos:

1. **Calcular el siguiente exige parsear texto.** `max(order_sequence)` filtrando por año es una
   consulta trivial e indexada; `max(substring(order_number from 6)::int)` no usa el índice y se
   rompe el día que el formato cambie.
2. **El reinicio anual se vuelve implícito.** Con dos columnas, `(2026, 1)` y `(2027, 1)` son
   claves distintas porque el año **es** parte de la clave. Con texto, el reinicio depende de que
   quien formatee no se equivoque.
3. **El ancho fijo se convierte en una regla de la base.** Con cuatro dígitos guardados,
   `2026-10000` ordenaría antes que `2026-0999`; con enteros, el orden es el de los números.

Coste aceptado: buscar por número visible obliga a descomponerlo primero (QC-34), y el texto se
compone en dos sitios distintos si alguien olvida `formatOrderNumber`. Por eso R24 exige **una
única definición** y el test del contrato la vigila.

### 8.3 Reexportar los tipos `OrderStatus`/`OrderPriority` que genera Prisma — **descartada**

Eliminaría de un golpe el duplicado de § 6.2 y con él R35 entero. Se descarta porque el dominio
**no puede importar `@prisma/client`** (`docs/architecture.md > La regla de dependencias`), y
saltarse esa regla para ahorrar siete líneas metería el cliente de base de datos en el cierre de
imports del contrato público, que tiene que poder importarse desde un componente de cliente. La
alternativa intermedia —declarar los valores en `lib/shared/`— tampoco vale: `lib/shared/**` es hoja
del grafo y no conoce módulos, así que el estado de un pedido no es asunto suyo. Coste aceptado: dos
listas que hay que cambiar a la vez, y un test que se pone rojo si no se hace.

### 8.4 Publicar ya un `RecipeCatalog` con `findRefs`, copiando a QC-24 y QC-32 — **descartada**

Los dos precedentes publicaron el servicio completo (`ProductCatalog`, `UnitCatalog`) en la ficha del
modelo, antes de tener consumidor. Aquí se publica **solo `RecipeId`** (§ 6.4). Motivo: esta ficha no
lee nada de una receta —el pedido guarda el id y nada más—, y el propio QC-32 dejó anotado en su
pregunta abierta 2 que la forma del `Ref` publicado sin consumidor delante es una **suposición**
(«¿debería llevar la `UnitRef` resuelta?»). Publicar `findRefs` hoy sería adivinar qué necesita
QC-35 para pintar la pantalla. Coste aceptado: cuando QC-34 o QC-35 necesiten el nombre de la
receta, tendrán que añadir el servicio y su adaptador, que es trabajo aditivo y con el consumidor
delante.

### 8.5 Una tabla de estados y prioridades en vez de dos `enum` — **descartada por el humano**

Consta para que el implementer no la reconsidere: es lo que hizo `DocumentType` (QC-4) y la
decisión 4 se aparta de ello **a conciencia**. La tabla permitiría añadir «CANCELADO» sin migrar y
daría sitio para etiquetas o colores; a cambio, cada lectura de pedido arrastra un `JOIN` o un
catálogo en memoria, y el orden de la prioridad tendría que vivir en una columna `sort_order` que
nadie garantiza. El humano eligió el `enum` sabiendo que añadir un valor será una migración.

### 8.6 Guardar el total (`total_price`) como columna calculada — **descartada por el humano**

Consta para no reconsiderarla: decisión 5, R10. Ahorraría multiplicar al leer y permitiría
`ORDER BY total`. Se descarta porque una columna de total puede **contradecir a sus factores** —basta
un `UPDATE` que cambie la cantidad y no el total— y porque el ERP no factura (decisión 23): el total
no es un hecho que haya que congelar, es una cuenta. Una columna **generada**
(`GENERATED ALWAYS AS (quantity * unit_price) STORED`) no tendría ese riesgo y sería inmutable, pero
Prisma no la modela y R10 la prohíbe explícitamente: el humano no pidió «un total consistente», pidió
«ningún total».

---

## 9. Cómo se verifica

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Estático | `tests/unit/pedidos/schema/pedidos-schema.test.ts` | La **declaración**: los dos `enum` con sus valores exactos y en orden; `Order` con sus catorce campos, sus tipos y su nulabilidad; los dos `@default`; `@@unique([orderYear, orderSequence])`; las cuatro referencias **sin `@relation`**; `/// @module pedidos`; y **en positivo** las ausencias deliberadas (sin `total`, sin impuestos, sin cliente, sin fecha de solicitud, sin campos de vuelta en `Recipe`/`Unit`/`User`). Lee `db/schema.prisma` como texto, con los helpers de `tests/unit/recetas/schema/recetas-schema.test.ts`. |
| Estático | `tests/unit/pedidos/schema/pedidos-migration.test.ts` | El **SQL**: los dos `CREATE TYPE`, la tabla, el índice único **sin `WHERE`**, los cuatro índices de FK, las cuatro FK con `ON DELETE RESTRICT`, los cuatro `CHECK` **con su texto exacto** —en particular `"deleted_at" IS NULL OR "status" <> 'ENTREGADO'`—, los dos `ALTER` de RLS, identificadores en inglés, y que `down.sql` borra la tabla **y los dos tipos** y nada más. **Mutaciones de sensibilidad obligatorias**: añadir `WHERE "deleted_at" IS NULL` al índice único, cambiar un `RESTRICT` por `CASCADE`, cambiar `> 0` por `>= 0` en la cantidad, quitar el `CHECK` del entregado y quitar un `DROP TYPE` del DOWN — el predicado debe caer en los cinco casos. Un test que no puede fallar no vigila nada. |
| Unitario | `tests/unit/pedidos/domain/order-number.test.ts` | `formatOrderNumber`: `(2026, 1) → '2026-0001'`, `(2026, 42) → '2026-0042'`, `(2026, 9999) → '2026-9999'`, y que con 10.000 **crece** en vez de truncar (pregunta abierta 5). |
| Unitario | `tests/unit/pedidos/module-contract.test.ts` | La forma del módulo y las fronteras: `index.ts` solo reexporta de `./domain`; carpetas exactamente `domain`/`ports`/`adapters`; ningún `'use server'` alcanzable desde el barrel; **ningún archivo del repo consulta `prisma.order`**, y el barrido —función pura— señala una entrada sintética que sí lo hace, para que la lista vacía no lo sea por vacuidad (patrón de QC-32 § 9); `pedidos` no nombra `prisma.recipe`, `prisma.unit` ni `prisma.user`; `pedidos` importa `recetas` y `unidades` **solo por el barrel**; la feature no crea driving, rutas ni Server Actions (R39). **Y R35**: lee los dos `enum` de `db/schema.prisma` y los compara valor a valor y en orden con `ORDER_STATUS_VALUES` / `ORDER_PRIORITY_VALUES`, más los dos `@default` contra `DEFAULT_ORDER_*`. |
| Integración | `tests/integration/pedidos/pedidos-constraints.int.test.ts` | Que la base **de verdad** rechaza y permite lo que debe. Cada caso dentro de `prisma.$transaction` que termina en `ROLLBACK`; toda operación que debe fallar, envuelta en `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` y ejecutada con `$executeRaw` (**no** con la API tipada: Prisma convierte el SQLSTATE en `P2003`/`P2002` antes de que llegue a `meta.code`, QC-24 § 10.1). Se afirma sobre el **SQLSTATE** (`23502`, `23503`, `23505`, `23514`, `22P02` para el valor fuera del enum), **nunca** sobre el texto del mensaje: en esta máquina Postgres responde en español. Cada caso crea su propia unidad, presentación, producto, receta y usuario dentro de la transacción: las FK son reales. Copiar los helpers de `tests/integration/recetas/recetas-constraints.int.test.ts` y de `tests/integration/unidades/unidades-constraints.int.test.ts`. |
| Base real (task) | T8 de `tasks.md` | El ciclo `db:migrate` → inspección del esquema real → `db:rollback` → `db:migrate`, con la salida pegada en `progress/impl_QC-33-modelo-pedidos.md`. Es lo que cierra **R38** de verdad. |
| Guardia (ya existe) | `tests/guards/guard-rls-force.test.ts` | R37, sin tocar la guardia: descubre las tablas leyendo el SQL. |
| Guardia (ya existe) | `tests/guards/guard-arquitectura-modulos.test.ts` | R31, R32, R34. |
| Guardia (ya existe) | `tests/guards/guard-dependencias-aprobadas.test.ts` | R40. |

**Sin E2E**, y con motivo (decisión 25, R39): no hay pantalla ni flujo navegable. `CHECKPOINTS.md`
pide E2E para «importes» y esta feature **es** la que trae el primer importe al modelo — pero no
trae ninguna operación que un navegador pueda ejecutar: no hay ruta, ni acción, ni formulario. Lo
decide **QC-35**, y ahí el E2E deja de ser diferible.

Cuatro avisos para el implementer:

- **Un test de RLS escrito con Prisma sale verde pase lo que pase** (Prisma se conecta como dueño de
  las tablas). No se escribe: R37 se cierra con la guardia estática sobre el SQL.
- **El `CHECK` del entregado necesita sus cuatro casos**, no uno: rechaza borrar un `ENTREGADO`,
  rechaza poner `ENTREGADO` a uno borrado, **acepta** borrar un `PENDIENTE` (R30) y **acepta** poner
  `ENTREGADO` a uno vivo. Un test que solo prueba el primero deja pasar un `CHECK` demasiado
  estricto.
- **R22 se prueba con una fila borrada**: crear el pedido `(2026, 1)`, borrarlo lógicamente y
  comprobar que un segundo `(2026, 1)` sigue fallando con `23505`. Es el caso que distingue esta
  ficha de QC-24, y sin él el índice podría ser parcial sin que nadie se entere.
- **`beforeAll` debe fallar con un mensaje claro** («corre `pnpm run db:migrate`») si `orders` no
  existe, no con un error de Prisma a mitad del primer caso.

---

## 10. Dependencias de terceros

**Ninguna dependencia nueva** (decisión cerrada 26, R40). Regla 7 de `CLAUDE.md` sin propuesta que
abrir, y `tests/guards/guard-dependencias-aprobadas.test.ts` sigue verde sin tocar `package.json` —
ese es exactamente el criterio de R40. Todo lo que hace esta ficha es esquema Prisma, SQL y tres
archivos de tipos y una función pura de doce caracteres de formato.

Una candidata que **podría parecerlo y no entra aquí**:

| Candidata | Qué haría | Por qué no entra en esta ficha |
| --- | --- | --- |
| `decimal.js` / `big.js` (aritmética decimal en JS) | Multiplicar cantidad × precio unitario sin el redondeo binario de `number` (`docs/architecture.md > Anti-patrones`) | **Esta ficha no multiplica nada.** El decimal vive entero en Postgres (`DECIMAL(14,4)`) y el dominio solo transporta los importes **como texto** (§ 6.3). El primer sitio donde el total se calcula de verdad es **QC-34**, y ahí habrá que decidirlo con la regla 7 delante: `decimal.js` ya viaja como dependencia **transitiva** de Prisma (`Prisma.Decimal`), pero usarla desde el dominio significaría importar `@prisma/client`, que la regla de dependencias prohíbe, así que sería una dependencia **directa** nueva con sus cuatro checks y su aprobación humana. **No se propone aquí**: sin red no se pueden verificar los cuatro checks, y un check no verificable no es un sí (regla 6). |

---

## 11. Preguntas abiertas que deja este diseño

Las cinco de `requirements.md` no se repiten —las tres del correlativo (2, 3 y 4) son las que este
diseño no puede cerrar solo, y su posición por defecto está en § 5.2 y § 5.3—. Estas son propias del
diseño, ninguna bloquea la implementación:

1. **¿`order_year` debería ser `SMALLINT` en vez de `INTEGER`?** Un año cabe de sobra en dos bytes.
   Se deja `INTEGER` porque es lo que Prisma genera para `Int` sin `@db.SmallInt` y porque cuatro
   bytes por fila no son un problema en una tabla de pedidos. Cambiarlo después es una migración de
   tipo, barata mientras la tabla sea pequeña.
2. **¿Hace falta un índice por `status` o por `deleted_at`?** No se crea ninguno. Las consultas que
   los necesitarían («pedidos pendientes», «pedidos vivos») son de **QC-34**, y añadir un índice
   sin la consulta delante es adivinar. Es aditivo y barato.
3. **¿`OrderContents` sobrevive a QC-34 con esta forma?** Hoy lleva los importes como texto (§ 6.3)
   porque el dominio no puede tocar `Prisma.Decimal`. Si QC-34 descubre que todos sus consumidores
   acaban convirtiendo ese texto al mismo tipo, conviene reconsiderarlo **entonces**, con el
   consumidor delante — igual que dejó anotado QC-32 § 11.2 sobre `ProductRef`.
