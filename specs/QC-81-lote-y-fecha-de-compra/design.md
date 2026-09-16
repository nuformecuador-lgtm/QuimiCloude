# QC-81 — lote-y-fecha-de-compra · design.md

> Decisiones técnicas para los requisitos de `requirements.md`. El **alcance y la tabla de
> decisiones cerradas** los fijó el humano el 2026-09-13 y aquí no se reabren: lo que sigue es
> **cómo** se cumplen, no **si** se cumplen.
>
> **Enmienda del 2026-09-15**, sobre el spec aprobado e implementado. Recoge los menores de la
> revisión que tocan el spec (`progress/review_QC-81-lote-y-fecha-de-compra.md > 6`) y una decisión
> humana nueva:
> - **m1**: el `P2002` del lote se reconoce por el **conjunto de columnas** y no por el nombre del
>   índice (§3.3, §4.4).
> - **m3**: el rechazo de R4 no llega con campo a quien llama. Es una herencia para QC-103 (§9.5).
> - **m4**: el máximo de la serie se lee con `numeric`, **sin techo de dígitos** (§2.3, §3.2, §9).
>   §8 recoge además cómo quedó el test de la carrera (m5).
> - **D13 → R34–R36**: el lote tecleado de solo dígitos no puede tener 60 caracteres (§4.6, §6 E y F,
>   §9.6). La pregunta **P1** sobre la migración se abrió y se **cerró el 2026-09-15 con la opción
>   D**: no hay datos previos, así que no hay guardia y el caso queda como límite aceptado (§9.6).
>
> Las referencias de línea al código de las secciones 0–7 son las del 2026-09-13 y se dejan como
> estaban. Las de esta enmienda son las del commit `e10f626`.
>
> **Segunda enmienda del 2026-09-15 (D14 → R37).** El alta de un lote sobre un producto existente
> comprobaba que el producto estaba vivo sin bloquear su fila, y un borrado concurrente podía dejar el
> lote colgando. Es herencia de QC-90 y se arregla aquí.
> - §10 recoge la verificación en el código, el lock de fila, el orden de adquisición frente al lock
>   del correlativo y por qué `createWithFirstBatch` no lo necesita.
> - §6 G, H e I recogen las alternativas descartadas, §8 la verificación y §9.7 el límite.
> - Las referencias de línea de §10 son las del worktree **después** de la limpieza de comentarios.

## 0. Hallazgos

Medido en disco el 2026-09-13, dentro del worktree `QC-81-lote-y-fecha-de-compra`.

### 0.1. El estado real de la tabla (la premisa corregida de la ficha se confirma)

- `db/schema.prisma:697-720`, modelo `ProductBatch`: `lot String? @map("lot")` (**anulable**, línea
  703), `expiryDate DateTime? @db.Date` (704), `companyId String @db.Uuid` **NOT NULL** (705), y
  **ninguna** columna de fecha de compra. Los cinco `@@index` de 714-718 no incluyen ningún único.
- `db/migrations/20260909120000_product_batches/migration.sql:24-25`: `"lot" TEXT` y `"expiry_date"
  DATE`, las dos anulables; `:57` y `:61` los dos `CHECK` (`stock >= 0`, `unit_cost > 0`); `:65-66`
  RLS `ENABLE` + `FORCE` **sin ninguna policy**.
- `db/migrations/20260911130000_inventory_company_scope/migration.sql:58` añade
  `product_batches.company_id`, `:187` lo pasa a `NOT NULL`, `:204` la FK a `companies`, `:212` el
  índice, `:264-301` el disparador `product_batches_check_company`. Su cabecera (`:5-6`) dice
  literalmente que esa columna existe **porque QC-81 necesita la unicidad `(company_id, lot)` y un
  índice no puede indexar la columna de otra tabla**. Esta ficha es la que cobra ese cheque.
- **`products` no tiene ni tuvo `lot`**: la `description` original de la ficha (2026-09-08) está
  derogada, como ya dice el bloque de Alcance. Nada en `lib/modules/inventario/domain/product-*.ts`
  menciona lote fuera del lote.

### 0.2. Todo lo que hoy asume que `lot` puede ser nulo (R7 lo cambia)

Enumerado porque la decisión D7 **cambia** lo que QC-90 cerró a propósito, y cada sitio hay que
tocarlo o re-documentarlo:

| # | Sitio | Qué asume hoy | Qué pasa a ser |
|---|---|---|---|
| 1 | `db/schema.prisma:703` | `lot String?` | `lot String` + `@@unique([companyId, lot])` |
| 2 | `db/migrations/20260909120000_product_batches/migration.sql:24` | `"lot" TEXT` anulable | la migración nueva lo aprieta; **el archivo viejo no se toca** |
| 3 | `lib/modules/inventario/domain/product-batch.ts:22-23` | «`null` cuando no se escribió» | `null` pasa a significar **«que lo genere el backend»**; el docblock se reescribe entero |
| 4 | `lib/modules/inventario/domain/product-batch-input.ts:56, 87` | `lotSchema` + `lot: lotSchema.nullish()` | la entrada **sigue** siendo opcional (ausente ⇒ generado): lo obligatorio es la fila, no el campo |
| 5 | `lib/modules/inventario/domain/create-product.ts:103-106` | comentario «lote y expiración ausentes se guardan como `NULL`» y `lot: entrada.lot ?? null` | el `?? null` se queda, el comentario **miente** desde esta ficha y se reescribe |
| 6 | `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:544-545` | `lot: batch.lot` con «ausente se guarda como `NULL`» | pasa por el generador antes del `create` |
| 7 | `lib/modules/inventario/adapters/driving/product-actions.ts:226` | lee `lot` con `readOptionalFormString` (vacío ⇒ `undefined`) | **no cambia**; se le añade `purchaseDate` al lado |
| 8 | `specs/QC-90-alta-del-primer-lote/requirements.md` R12 | «lote y expiración son opcionales y se guardan `NULL`» | **queda derogado en su mitad del lote** por D7; la expiración sigue igual |
| 9 | `tests/unit/inventario/create-product.test.ts:307, 314, 317` | afirman `loteCreado(...).lot === null` | pasan a afirmar el correlativo generado |
| 10 | `tests/integration/inventario/product-batch-write.int.test.ts:368-383` | caso «deja lot y expiry_date en NULL cuando no vienen» | se parte: `expiry_date` sigue `NULL`, `lot` pasa a llevar correlativo |
| 11 | `tests/unit/inventario/schema/inventario-schema.test.ts:1082` | `expect(field(productBatch,'lot').isOptional).toBe(true)` | **se pone roja con esta ficha**, ver 0.3 |
| 12 | `tests/integration/inventario/company-scope-queries.int.test.ts:230` | fixture con `lot: null` | sigue compilando; la fila resultante ya llevará correlativo |

### 0.3. Una guardia de alcance ajena que esta ficha vuelve roja

`tests/unit/inventario/schema/inventario-schema.test.ts:1050-1096` (bloque «QC-80 R25/R28») fija la
lista **exacta** de escalares de `ProductBatch` y exige `lot.isOptional === true`. Añadir
`purchaseDate` y quitar el `?` de `lot` la pone roja **por hacer justo lo que esta ficha tiene que
hacer**. Hay precedente escrito para esto en ese mismo archivo (`:1030-1048`: QC-80 retiró allí la
guardia de alcance de QC-90 con su explicación). Se actualiza igual: se añade `purchaseDate` a
`PRODUCT_BATCH_COLUMNS`, se invierte la afirmación de `lot` y se deja escrito por qué. **No se
borra el bloque**: su parte útil —que la presentación vive solo en el lote— sigue vigente.

### 0.4. El patrón de la fecha civil ya está resuelto y se copia literal

`expiry_date` viaja como texto `YYYY-MM-DD` y lo convierte **el adaptador**:
`product-prisma.ts:512-514`, `new Date(\`${expiryDate}T00:00:00Z\`)`, con el docblock que explica por
qué el `T00:00:00Z` no es adorno (`:500-511`). La fecha de compra hace **exactamente** lo mismo:
patrón en zod (`product-batch-input.ts:63`), texto hasta el adaptador, conversión en un único sitio.

### 0.5. La autorización y el ámbito ya están donde deben

`create-product.ts:85` `requirePermission(actor, 'inventario.modificar')` es la primera línea, antes
de zod y antes del puerto; `:89` construye `scope = { companyId: actor.companyId }` y la empresa
**no** viaja en `NewProductBatch` (`ports/product-repository.ts:42-44`). El correlativo se calcula
contra **ese** ámbito (R27) y esta ficha no mueve ninguna de las dos cosas.

### 0.6. La concurrencia: qué precedente hay y por qué no sirve tal cual

`pedidos` ya resuelve un correlativo concurrente con una **secuencia por año** creada al vuelo
(`db/migrations/20260904135210_order_cancellation/migration.sql:86-98`, usada dentro del `INSERT` en
`order-prisma.ts:192-209`). Su propia cabecera (`:22-29`) documenta el agujero: **una secuencia solo
sabe de los números que ella entregó**, así que una carga por otra vía deja las altas siguientes
chocando contra el índice único. Eso es exactamente lo que **D6 prohíbe** aquí («la serie continúa
desde el más alto que ya existe… el generador nunca propone un valor que ya existe»), porque el lote
sigue siendo texto que se puede teclear a mano. Luego la secuencia queda descartada (§6, A).

### 0.7. El aislamiento de los tests de integración cambió (QC-77)

`tests/helpers/test-database.ts` crea y **borra** una base por corrida, copiada de una plantilla
cuyo nombre es la huella de `db/migrations/` + el seed (`:176-187`). Consecuencias para esta ficha:

1. Añadir una migración **cambia la huella** ⇒ la plantilla se reconstruye sola, sin bandera.
2. `EXPECTED_FAILING_MIGRATION` (`:95`) es **una sola**: `20260911130000_inventory_company_scope`.
   La receta (`:515-573`) solo tolera **ese** fallo. Si la migración de esta ficha fallara sobre
   base vacía, la construcción de la plantilla se caería entera. De ahí **R20**.
3. Como la migración de QC-81 es **posterior** a la de QC-49, se aplica en el paso 4 («migrando lo
   que queda»), con la empresa inicial ya sembrada.
4. Todo archivo nuevo de `tests/integration/**` tiene que declararse en
   `tests/integration/aislamiento.json`, o `tests/guards/guard-aislamiento-integracion.test.ts` da
   rojo.

### 0.8. Un choque decisión ↔ código, anotado y no resuelto por mi cuenta

D2 exige que un lote repetido **dentro de la empresa** se rechace. El catálogo de errores es
**cerrado** (`lib/modules/errores/domain/error-codes.ts:1-52`) y hoy no tiene ningún código para
esto; `invalid_input` existe, pero su frase es «La entrada recibida no es valida», que para un lote
repetido no dice nada. Añadir un código es una **enmienda al catálogo cerrado** y el propio archivo
exige escribirla y que la apruebe el humano (quinta enmienda, `:40-51`). Va en §7, **aparte y
explícita**, y se aprueba con el spec (F1.4). No la doy por hecha.

---

## 1. Modelo de datos

### 1.1. Las dos columnas

```
product_batches
  lot           TEXT NOT NULL            -- era anulable
  purchase_date DATE NOT NULL            -- nueva
```

- **`purchase_date`, no `purchased_at`**: es una fecha **civil**, no un instante (R26). `DATE`, el
  mismo tipo que `expiry_date`. Identificadores en inglés (D12).
- **`lot` sigue siendo `TEXT`** y no se convierte a entero: D5 lo dice de frente —«el lote sigue
  siendo texto, así que quien quiera escribir "ACME-2026-07" a mano puede»—. El correlativo es un
  número **escrito en texto**.
- El largo máximo (60) sigue viviendo en la validación y no en el tipo de la columna
  (`PRODUCT_BATCH_LOT_MAX_LENGTH`, `product-batch-input.ts:49`). No se cambia. La base lo replica
  con el `CHECK` `product_batches_lot_length` (§1.2). **Enmienda del 2026-09-15:** D13 añade una
  regla de entrada solo para el lote de **solo dígitos**, que no puede llegar a 60 (R34). Vive en
  el mismo esquema y **no** baja a la base (§4.6, §6 E).

### 1.2. Las tres restricciones nuevas

```sql
CREATE UNIQUE INDEX "product_batches_company_lot_unique"
  ON "product_batches" ("company_id", "lot");

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_lot_not_blank"
  CHECK (btrim("lot") <> '');

ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_lot_length"
  CHECK (char_length("lot") <= 60);
```

- El índice único es **la** garantía de R11: está en la base, no en el código, y se cumple aunque
  alguien escriba por otra vía. **No es parcial y no es funcional**, así que Prisma sí sabe
  modelarlo: se declara como `@@unique([companyId, lot], map: "product_batches_company_lot_unique")`
  y **no queda drift** —mismo argumento y mismo desenlace que `presentations_company_name_unique`
  (`20260911130000_inventory_company_scope/migration.sql:224-235`)—. Efecto útil: el `P2002` llega
  tipado al adaptador sin tener que leer SQLSTATE crudos.
- **Sin normalización**: la unicidad es del **texto exacto** ya recortado. `'abc'` y `'ABC'` son dos
  lotes distintos. Es deliberado: el módulo no publica ninguna `normalizeLot`, e inventarla aquí
  crearía una **segunda** definición de «mismo lote» que nadie pidió (la lección que
  `findAliveIdByName` documenta para el nombre del producto, `ports/product-repository.ts:56-63`).
- `product_batches_lot_not_blank` es lo que hace que R7 no se pueda esquivar con `''`; el `CHECK` de
  largo replica en la base lo que zod ya rechaza, con el mismo criterio de «las dos defensas no se
  sustituyen» que `product-batch-input.ts:36-38` escribió para el importe.

### 1.3. La no-futuridad **no** va en la base, y se dice en voz alta

Postgres rechaza un `CHECK` con `CURRENT_DATE`/`now()` («functions in check constraint expression
must be marked IMMUTABLE»), así que R4 **no puede** ser un `CHECK`. Un disparador sí podría, y se
**descarta** (§6, C): ataría la validación al reloj **del servidor de base**, mientras que el caso
de uso ya inyecta el suyo (`create-product.ts:78`, `deps.now`), y en el cambio de día las dos
lecturas discrepan y rechazarían un alta legítima. R4 vive por tanto **solo en el borde y en el caso
de uso**. Queda escrito como límite conocido en vez de aparentar una defensa que no existe.

## 2. La migración

`db/migrations/20260913120000_product_batch_lot_and_purchase_date/`, con su `migration.sql` y su
`down.sql` (R17; `docs/architecture.md > Migraciones up/down`).

**Escrita entera a mano**, no con `prisma migrate dev`: la tabla ya carga con objetos que Prisma no
modela —los dos `CHECK` de QC-90, la FK a `companies` sin `@relation`, las dos FK a `users` escritas
a mano, el disparador de coherencia y la RLS forzada— y `migrate dev` los lee como drift y propone
**resetear**. Es el mismo motivo, con las mismas palabras, que ya escribieron QC-76, QC-80 y QC-49
(`20260911130000_inventory_company_scope/migration.sql:8-13`). Se aplica con `pnpm run db:migrate`.

### 2.1. Orden exacto del UP

| # | Paso | Por qué en ese sitio |
|---|---|---|
| 0 | `ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY` | **La mina de QC-49**: la tabla está `ENABLE`+`FORCE` **sin ninguna policy**, y bajo `FORCE` eso deniega también al dueño —que es con quien conecta Prisma— y también el `SELECT`. Esta migración **lee y escribe** `product_batches`, así que abre el mismo paréntesis que QC-49 (`migration.sql:102-105`) y lo cierra en el paso 7 |
| 1 | Guardia de duplicados (R21) | Si dos filas de una empresa ya comparten lote, el índice del paso 6 sería imposible. Se dice **antes**, con cuántas son y qué hacer, en vez de un `23505` suelto cinco sentencias más abajo (calcado del `down.sql` de QC-49, `:120-138`) |
| 2 | `ADD COLUMN "purchase_date" DATE` **anulable** | No hay `DEFAULT` que poner que no sea mentira: `CURRENT_DATE` afirmaría una fecha falsa para todas las filas viejas, que es justo lo que D8 descarta |
| 3 | Relleno de `purchase_date` (R19) | `("created_at" AT TIME ZONE 'UTC')::date`. **UTC explícito** y no la zona del servidor: es la misma convención con la que el adaptador escribe la fecha civil (`T00:00:00Z`), y sin ella la misma base migrada en dos máquinas daría dos días distintos |
| 4 | Relleno de `lot` (R18) | Solo las filas con `lot IS NULL OR btrim(lot) = ''`, numeradas con `row_number() OVER (PARTITION BY company_id ORDER BY created_at, id)` y sumadas al máximo numérico **de su empresa**. El `id` desempata: dos filas con el mismo `created_at` al microsegundo tendrían orden indefinido, y un relleno no reproducible es un relleno que no se puede revisar |
| 5 | `SET NOT NULL` en las dos columnas (R22) | Llegar aquí significa que no queda ninguna fila sin valor; ningún `SET NOT NULL` puede fallar por dato faltante |
| 6 | Los dos `CHECK` y el índice único | Después del relleno, por lo mismo: puestos antes se dispararían sobre filas todavía sin lote |
| 7 | `ENABLE` + `FORCE ROW LEVEL SECURITY` | Cierra el paréntesis del paso 0. Idempotente y explícito |

Todo ocurre dentro de la **única transacción** en la que Prisma ejecuta el archivo: cualquier `RAISE
EXCEPTION` deshace el archivo entero y la migración queda **sin aplicar y sin marcar** en
`_prisma_migrations` (R22).

### 2.2. Sobre la tabla vacía (R20), que es donde el repo ya se quemó

La migración de QC-49 **se planta a propósito** sobre una base vacía porque necesita resolver una
empresa (`migration.sql:130-132`), y `tests/helpers/test-database.ts:95` tolera **ese** fallo y solo
ese. Esta migración **no necesita resolver nada**: con cero filas, la guardia cuenta cero, los dos
`UPDATE` tocan cero filas, los `SET NOT NULL` pasan sobre una tabla vacía y el índice se crea vacío.
**Ninguna sentencia aborta por tabla vacía**, y ningún `ROW_COUNT` se compara contra un mínimo: la
comprobación de QC-49 (`updated_rows <> total_rows`) sí se copia, porque compara contra **el total
de la propia tabla** y con cero filas se cumple con `0 = 0`. Esto es un requisito (R20), no un
efecto colateral, y lleva test propio.

### 2.3. El relleno del lote, escrito

```sql
WITH base AS (
  SELECT "company_id", max(("lot")::numeric) AS top
    FROM "product_batches"
   WHERE "lot" ~ '^[0-9]+$'
   GROUP BY "company_id"
), pendientes AS (
  SELECT "id", "company_id",
         row_number() OVER (PARTITION BY "company_id" ORDER BY "created_at", "id") AS rn
    FROM "product_batches"
   WHERE "lot" IS NULL OR btrim("lot") = ''
)
UPDATE "product_batches" AS b
   SET "lot" = (COALESCE(base.top, 0) + pendientes.rn)::text
  FROM pendientes LEFT JOIN base ON base."company_id" = pendientes."company_id"
 WHERE b."id" = pendientes."id";
```

- **Sin techo de dígitos: `'^[0-9]+$'` y `::numeric`** (enmienda del 2026-09-15, menor m4, decisión
  humana).
  - **Antes** era `'^[0-9]{1,18}$'` con `::bigint`. La cota solo existía para que el `::bigint` no
    reventara con un `22003`, y le ponía techo a la serie: un lote de 19 dígitos se quedaba fuera
    del máximo, y el generador volvía a proponer un valor que ya existía.
  - **Ahora** `numeric` no tiene techo práctico. Lo que acota el largo es el `CHECK`
    `product_batches_lot_length` y, desde R34, la regla del lote tecleado (§4.6).
  - Un lote de 40 dígitos tecleado **entra** en la serie y la continúa; ya no se ignora.
- **El texto del resultado.** `numeric` de escala 0 más el `row_number()` da `numeric` de escala 0,
  y su `::text` sale sin parte decimal y sin ceros a la izquierda. Medido contra base efímera:
  `max(x::numeric)` sobre `'007'`, `'0999999999999999999'` y `'42'` da `999999999999999999`.
- **Mismo criterio que el alta** (`resolveLot`, §3.2), para que la migración y el alta no discrepen
  sobre cuál es «el más alto».
- **Límite: 60 nueves.** Si una empresa ya tiene un lote de 60 nueves **y** alguna fila sin lote, el
  relleno escribe 61 caracteres y la migración aborta **entera** al crear el `CHECK` de largo, con el
  mensaje genérico de Postgres. No deja nada a medias. Es un **límite aceptado**: P1 se cerró con la
  opción D el 2026-09-15, porque no hay datos previos (§9.6).
- Lo **no numérico** (`'ACME-2026-07'`) no entra en el máximo. «El más alto que existe» se lee sobre
  la serie numérica, que es la única que tiene orden; un lote con letras no es un número mayor ni
  menor, simplemente no está en la serie. Es la lectura que hace que D5 y D6 sean compatibles.
- Un `'007'` cuenta como `7`, y el siguiente generado es `'8'` (sin ceros: D5 prohíbe el relleno).

### 2.4. El `down.sql`

Revierte en orden inverso: índice único fuera, los dos `CHECK` fuera, `lot` vuelve a `DROP NOT
NULL`, `purchase_date` se va con su columna, y el paréntesis de RLS abierto/cerrado igual que en el
UP (su guardia **lee** la tabla, que bajo `FORCE` sin policy también está denegada: la lección que
QC-49 tuvo que corregir en revisión, `down.sql:26-63`).

**Lo que el DOWN NO hace, y por qué (R23):** no vacía ningún `lot`. Los valores que escribió el
relleno y los que escribió una persona **no se pueden distinguir** —no hay columna que lo diga—, así
que borrarlos «para dejarlo como estaba» tiraría dato ajeno. Revertir deja la columna anulable con
todos sus valores puestos; volver a aplicar el UP es entonces un relleno de cero filas. El límite se
escribe en la cabecera del archivo, como hacen los `down.sql` de QC-32, QC-76 y QC-49.

`purchase_date` **sí** desaparece con su columna, y eso **sí** pierde las fechas de compra escritas
después de la migración. Es exactamente «lo que el UP añadió» y no hay forma de revertir sin
quitarla; se dice en la cabecera con el mismo tono que
`20260907120000_orders_drop_unit_and_unit_price/migration.sql:7-10`.

## 3. La generación del correlativo y la concurrencia

Esta es la parte difícil y D11 exige **probarla**.

### 3.1. Dónde vive

En el **adaptador driven** (`product-prisma.ts`), **dentro** de la misma `prisma.$transaction` que
ya escribe producto+lote (`:686`) y lote-a-producto-existente (`:747`). No en el caso de uso: el
dominio no consulta la base y un `nextLot()` en el puerto obligaría a un viaje de lectura **fuera**
de la transacción de escritura, que es justo donde la carrera vive (§6, B).

El puerto **no cambia de firma**. Lo que cambia es el **significado** de `NewProductBatch.lot`:

```ts
/**
 * Lote, ya recortado. `null` significa «no vino: que lo genere el backend» (QC-81 R8),
 * NO «este lote se queda sin valor»: desde QC-81 la columna es NOT NULL.
 */
readonly lot: string | null;
```

Se elige esto —y no un tipo discriminado `{ kind: 'given' | 'generate' }`— porque el caso de uso ya
colapsa `undefined` y `null` con `entrada.lot ?? null` (`create-product.ts:106`) y porque el cambio
de tipo obligaría a tocar cada doble de test del repositorio sin ganar ninguna garantía que el
docblock y el test no den.

### 3.2. La secuencia de tres pasos, dentro de la transacción

```
1. SELECT pg_advisory_xact_lock(<ns>, hashtext('product_batches_lot:' || :companyId))   -- solo si hay que generar
2. SELECT max(("lot")::numeric)::text AS "top" FROM "product_batches"
    WHERE "company_id" = :companyId AND "lot" ~ '^[0-9]+$'
3. INSERT ... (la API tipada de Prisma, con toBatchCreateData)
```

**El máximo, sin techo** (enmienda del 2026-09-15, m4, mismo criterio que el relleno de §2.3):
- Se lee con `::numeric` y sin cota de dígitos.
- Llega al adaptador **como texto**, porque un lote de más de 15 dígitos ya no cabe en un `number`
  sin perder precisión.
- El siguiente se calcula con `BigInt` sobre ese texto: `BigInt(top ?? '0') + 1n`. **Nunca** con
  `number`, que redondea a partir de 2^53.
- Sin ningún lote numérico, `top` es `NULL` y el primero es `'1'`.
- Con la cota antigua de 18 dígitos, un `'999999999999999999'` tecleado bloqueaba para siempre la
  generación de esa empresa (R16 roto). Eso ya no pasa y lo fija un test de integración.

**Por qué el lock es una sentencia aparte y va ANTES del `SELECT`, y no dentro de una función
evaluada en el `INSERT`.** Prisma trabaja en `READ COMMITTED`, donde **cada sentencia toma su propia
instantánea al empezar**. Si la sesión B pidiera el lock *dentro* de la sentencia que calcula el
máximo, su instantánea ya estaría tomada **antes** de que A comiteara, y B leería el mismo máximo que
A y propondría el mismo número: el lock no habría servido de nada. Tomándolo en una sentencia
anterior, B **espera** ahí; cuando A comitea y B sigue, la sentencia del paso 2 arranca **después** y
su instantánea **sí** ve la fila de A. Esto es lo que hace que R14 se cumpla sin depender del
reintento. (Detalle que conviene saber: el lock de dos enteros **no colisiona** con el
`pg_advisory_lock(bigint)` que `tests/helpers/test-database.ts:601` usa para la plantilla — son
espacios distintos.)

El lock es `xact`: se suelta solo al comitear o al abortar. No hay ningún camino que lo deje tomado,
y como solo se pide **uno**, no hay orden de adquisición y no hay interbloqueo posible.

**Cuando el lote viene escrito a mano no se pide el lock ni se calcula ningún máximo**: no hay serie
que consultar y serializar altas que no compiten sería cola gratis.

### 3.3. Y si aun así chocan (R15)

El índice único es la garantía; el lock es solo la manera de no chocar casi nunca. Si llega un
`P2002` cuyo `meta.target` es **exactamente el conjunto de columnas `{company_id, lot}`** —el de
`product_batches_company_lot_unique`—:

> **Cómo se reconoce el choque** (enmienda del 2026-09-15, m1). **No** por el nombre del índice.
> Con `@prisma/client` 6.19.3, por la API tipada que usa el paso 3, `meta.target` trae las
> **columnas** (`['company_id', 'lot']`) y nunca el nombre del índice. Comparar contra el nombre no
> casaría jamás: R13 saldría como `unexpected` y R15 no reintentaría nunca. Así lo documenta QC-76 en
> `lib/modules/unidades/adapters/driven/persistence/unit-write-prisma.ts:21-48`, donde fue un
> defecto real, y lo siguen `recipe-prisma.ts` y `supplier-prisma.ts`. Además lo confirmó contra
> base real la mutación sin lock del test de la carrera (`target: [ 'company_id', 'lot' ]`).
> `isDuplicateOrderNumber` sí usa el nombre, pero porque `pedidos` inserta con SQL crudo y lo busca
> en el mensaje: es otro camino. Se compara el **conjunto exacto**, no un «contiene». Un `target`
> con una tercera columna, con otras columnas o como cadena suelta **no** se reconoce y se relanza.

- **con lote generado** ⇒ se **reintenta la operación entera** —transacción nueva, instantánea
  nueva, máximo nuevo—, hasta **3 intentos** en total. El reintento va **fuera** de
  `prisma.$transaction`, porque una transacción abortada no admite más sentencias. Reintentar
  `createWithFirstBatch` es seguro: la transacción abortada no dejó ni producto ni lote.
- **con lote escrito a mano** ⇒ **no se reintenta jamás**: reintentar daría el mismo choque para
  siempre, y sustituirlo por un correlativo escribiría un lote que nadie pidió. Se traduce a
  `BatchDuplicateLotError` (§7) y sube al borde.
- **agotados los 3 intentos** ⇒ se propaga un `Error` con contexto (empresa, último lote intentado,
  número de intentos). No se disfraza de `invalid_input`: no es entrada inválida, es que la base
  está en un estado que el generador no entiende. `docs/conventions.md` prohíbe el `catch` vacío y
  `product-prisma.ts:643-659` ya establece el criterio conservador de **relanzar lo que no se sabe
  traducir**.

### 3.4. Consecuencias aceptadas, dichas

- **Huecos en la serie.** Una transacción que aborta después de calcular su número no lo consume
  —el número sale de un `max()`, no de un `nextval`—, así que aquí **no** hay huecos por aborto, a
  diferencia de `pedidos` (`20260904135210_order_cancellation/migration.sql:84-85`). Sí los hay si
  alguien borra una fila o teclea `'9000'`: eso último es el coste que D6 acepta por escrito.
- **Cola por empresa.** Dos altas simultáneas **de la misma empresa** se serializan durante el
  `INSERT`. Es el precio de que la serie continúe desde el máximo real; D6 lo eligió sabiendo que la
  alternativa sin cola —la secuencia— no puede cumplirla.

## 4. Contratos de entrada y salida

### 4.1. `createProductWithFirstBatchSchema` (`domain/product-batch-input.ts`)

```ts
purchaseDate: purchaseDateSchema.nullish(),   // campo NUEVO
lot: lotSchema.nullish(),                     // SIN CAMBIO de forma; cambia su docblock
```

`purchaseDateSchema` = patrón `^\d{4}-\d{2}-\d{2}$` **más** una comprobación de que es una fecha de
calendario existente (R6): el patrón solo no distingue `2026-02-30`. La comprobación se hace sobre
la cadena, componiendo `Date.UTC` y verificando que los tres componentes vuelven iguales; **no** se
convierte a `Date` en el borde, por la misma razón que `expiryDate` (`product-batch-input.ts:58-63`).

**`nullish()` y no obligatorio, y esto es lo que mantiene R28 cumplible.** El formulario de hoy
(`app/(private)/inventario/components/product-form.tsx:59`) manda cinco campos y **no** manda
`purchaseDate`. Si el esquema lo exigiera, **toda** alta desde la pantalla moriría con
`invalid_input` hasta que QC-103 entre. Con `nullish()`, ausente significa **hoy** (R2, y es
literalmente lo que dice D3: «su valor por defecto es la fecha actual»), la pantalla sigue
funcionando sin tocar un byte de `app/**`, y QC-103 solo tiene que añadir el campo.

La **no-futuridad** (R4) **no** se comprueba en el esquema: zod no conoce el reloj del caso de uso y
meterlo dentro haría que el mismo esquema diera veredictos distintos en el navegador y en el
servidor. Se comprueba en `create-product.ts`, con `now()`, y se lanza `ValidationError`.

### 4.2. `NewProductBatch` (`domain/product-batch.ts`)

Gana `readonly purchaseDate: string;` — **fecha civil, obligatoria y ya resuelta**: el caso de uso
pone «hoy» cuando no vino, así que el puerto nunca recibe `null` aquí. Que sea `string` y no `Date`
es la regla del archivo (`:1-8`): convertir es del adaptador.

### 4.3. Caso de uso (`domain/create-product.ts`)

Orden fijo, con **dos pasos nuevos** entre zod y la escritura:

```
permiso → zod → fecha de compra (por defecto hoy + rechazo de futura) → costo →
resolución por nombre → escritura
```

«Hoy» = `now()` formateado como fecha civil **en UTC** (`toISOString().slice(0,10)`), el mismo
instante que ya se usa para `created_at`/`updated_at` (`:120`, `instante`). Un solo reloj, como
`createOrder` (`order-prisma.ts:165-170`).

### 4.4. Adaptador (`product-prisma.ts`)

- `toBatchPurchaseDate(purchaseDate: string): Date` ⇒ `new Date(\`${purchaseDate}T00:00:00Z\`)`,
  copia literal de `toBatchExpiryDate` (`:512-514`) sin la rama del nulo.
- `toBatchCreateData` gana `purchaseDate` y recibe el `lot` **ya resuelto**.
- `resolveLot(tx, batch, scope)`: los pasos 1-2 de §3.2; devuelve el lote a escribir.
- `isDuplicateBatchLot(error)`: tiene que ser un `PrismaClientKnownRequestError` con código `P2002`
  **y** con un `meta.target` cuyo **conjunto de columnas** sea exactamente `{company_id, lot}`, en
  cualquier orden. `meta.target` se normaliza antes de mirarlo: una cadena suelta cuenta como una
  sola columna, y un valor no inspeccionable, como ninguna. Mismo criterio conservador que
  `isBatchCompanyScopeViolation`, y **el mismo mecanismo que `unit-write-prisma.ts`**. Un `P2002`
  que no se sabe identificar **se relanza**.
  *(Enmienda del 2026-09-15, m1: antes decía «que el `meta.target` nombre
  `product_batches_company_lot_unique`», con `isDuplicateOrderNumber` como precedente. Con Prisma
  6.19.3 eso no casa nunca; el porqué está en §3.3.)*

### 4.5. Server Action (`adapters/driving/product-actions.ts`)

`buildCreateProductCandidate` gana una línea: `purchaseDate: readOptionalFormString(formData,
'purchaseDate')` (`:217-229`). Vacío ⇒ `undefined` ⇒ hoy. `buildUpdateProductCandidate` **no** se
toca: la edición sigue sin conocer ningún campo de lote (QC-90 R26). No hay ruta ni endpoint nuevo.

### 4.6. El lote de solo dígitos no llega a 60 (enmienda del 2026-09-15: D13, R34–R36)

**Dónde se rechaza: en `lotSchema`** (`domain/product-batch-input.ts:69`), al lado de
`PRODUCT_BATCH_LOT_MAX_LENGTH` (`:49`), que es de donde sale el 60. Ni en el caso de uso ni en el
adaptador:
- **Es una regla de la entrada y no necesita nada más.** No depende del reloj, que era lo que sacó R4
  del esquema (§4.1), ni de la base.
- **Un solo esquema la aplica en los dos lados.** El formulario valida en el cliente con ese esquema, y
  el caso de uso lo vuelve a pasar en el servidor (`create-product.ts:137-138`). Una sola definición
  cubre las dos cosas.
- **Pasan por ahí todos los lotes tecleados.** Los dos caminos del alta (`createWithFirstBatch` y
  `addBatchToAlive`) salen del mismo caso de uso, y no hay otro camino que escriba un lote tecleado:
  R32 no deja editar lotes.
- **Los lotes generados no pasan por el esquema, y está bien que no pasen.** R36 exige que el generado
  pueda tener 60.

**Forma:**

```ts
const NUMERIC_LOT_PATTERN = /^[0-9]+$/;   // NO exportada

const lotSchema = z
  .string()
  .trim()
  .min(1)
  .max(PRODUCT_BATCH_LOT_MAX_LENGTH, { abort: true })
  .refine(
    (value) => !(NUMERIC_LOT_PATTERN.test(value) && value.length >= PRODUCT_BATCH_LOT_MAX_LENGTH),
    { message: MESSAGE_LOTE_NUMERICO_LARGO },
  );
```

- **`/^[0-9]+$/` y no `\d`**: es el **mismo texto** que `'^[0-9]+$'` de `resolveLot` y del relleno.
  La regla y la serie tienen que coincidir en qué es un lote numérico, y con el mismo texto eso se ve
  a simple vista.
- **Ceros a la izquierda.** La regla mira el **valor recortado**: `trim()` va antes. Cuenta
  **caracteres**, no magnitud, así que un `'000…001'` de 60 caracteres se rechaza aunque valga 1.
  Así lo dice D13 («no puede tener 60 caracteres») y así se aplica, sin reinterpretarlo.
- **`abort: true` en el `max`**: el mismo motivo que ya escribió `purchaseDateSchema` (`:112-116`). Sin
  el corte, zod v4 ejecuta también el `refine` y un lote de 61 dígitos cobraría dos rechazos. Con el
  corte, cada lote mal escrito recibe **uno solo**, como exige R34.
- **Ningún export nuevo.** `PRODUCT_BATCH_LOT_MAX_LENGTH` ya es público y el patrón no hace falta
  fuera. Así `module-contract.test.ts` y `qc81-alcance.test.ts` no cambian.

**Código de error: `invalid_input`. No se propone ningún código nuevo.**
- Un lote de 60 dígitos tiene una forma que la regla no admite, así que es **entrada inválida** en el
  sentido exacto del catálogo.
- No es un choque contra la base, que es lo que justificó `batch_duplicate_lot`.
- El caso de uso ya convierte cualquier fallo de zod en `ValidationError` → `invalid_input`
  (`create-product.ts:138`), así que en el caso de uso no se escribe ni una línea nueva.

**Qué ve quien llama**, dicho con la misma precisión que ahora pide R4:
- **En la pantalla de hoy, sin tocar `app/**`:** el rechazo aparece **en el campo del lote y con su
  propio texto**. El formulario reparte los errores por `issue.path[0]` y, para los issues `custom`
  —un `refine` lo es—, pinta `issue.message` (`app/(private)/inventario/components/product-form.tsx:198-208`,
  `:327-331`). Si el mensaje no fuera propio, se leería el genérico «Escribe un lote de 1 a 60
  caracteres.» (`:86`), que para este caso es falso. **Texto propuesto**, a aprobar con la enmienda:
  «Un lote de solo números puede tener hasta 59 caracteres.».
- **Quien llama a la Server Action sin pasar por el formulario** recibe `invalid_input` sin campo. Es
  el mismo contrato que R4 y R6 (§9.5).

**Por qué con esto el siguiente generado cabe siempre, y dónde deja de ser «siempre»:**
- Si ningún lote tecleado de solo dígitos pasa de 59 caracteres, el mayor posible es 10^59 − 1, y el
  siguiente generado es como mucho 10^59, que tiene **60** caracteres y cabe (R36).
- La serie generada solo llegaría a 61 caracteres después de generar unos 9·10^59 lotes a partir de
  ahí, cosa que no va a ocurrir.
- Los únicos caminos reales a 61 son **datos que ya estén escritos**, que según el humano no existen
  (P1, cerrada con la opción D, §9.6), o
  **escrituras por otra vía**, que tampoco pasan por la regla de largo del esquema.

**Sin `CHECK` en la base, a propósito.** Se descarta en §6 E. En resumen:
- La base **no sabe** si un lote se tecleó o se generó: no hay columna que lo diga, que es el mismo
  motivo de R23.
- La única versión que puede expresar es «ningún lote de solo dígitos llega a 60», y esa rechazaría el
  generado de 60 que R36 exige. Reproduciría el mismo fallo un dígito antes: con 59 nueves, el
  siguiente sería 10^59 y lo rechazaría el `CHECK`.
- «Las dos defensas no se sustituyen» vale cuando las dos expresan **la misma regla**. Aquí la base
  conserva la suya, que es la invariante que sí comparten los dos lados: `product_batches_lot_length`,
  60 para todo lote.

**El adaptador no traduce el `23514` de largo.** Sigue saliendo como `unexpected`. Desde R34 solo lo
alcanzarían datos previos, que no existen (P1, opción D), o escrituras por otra vía. Se descarta en
§6 F.

## 5. Autorización, RLS y ámbito

Nada se mueve (R24, R27): el permiso se exige en el caso de uso, la empresa sale del ámbito y la RLS
sigue siendo **defensa en profundidad**, no la frontera (`docs/architecture.md > Acceso a datos y
autorizacion`). El índice único es `(company_id, lot)`, así que el aislamiento no depende de que
nadie se olvide de un `where`: dos empresas no pueden colisionar **por construcción** (R12) y una
empresa no puede duplicar **aunque el código falle** (R11).

Detalle que no hay que perder: el disparador `product_batches_check_company` sigue verificando que
la empresa del lote coincide con la de su producto y su presentación. El correlativo se calcula con
la empresa **del ámbito**, que es la misma que se escribe, así que ningún lote puede numerarse en la
serie de una empresa y guardarse en otra.

## 6. Alternativas descartadas

**A. Una secuencia de Postgres por empresa (`nextval`), el patrón de `pedidos`.** Es la más
tentadora: no bloquea, no hace cola, y el repo ya la tiene escrita
(`20260904135210_order_cancellation/migration.sql:86-98`). **Descartada porque no puede cumplir
D6.** Una secuencia solo conoce los números que ella entregó: quien teclea `'50'` a mano no la mueve,
y la siguiente alta propondría `'8'` —un valor que ya podría existir—, chocando contra el índice
único una y otra vez hasta rebasar el máximo. La cabecera de esa misma migración (`:22-29`) ya
documenta el agujero y dice que ajustar la secuencia es responsabilidad de quien carga a mano: aquí
«quien carga a mano» es **cualquier usuario del formulario**, así que la obligación sería diaria.
Además exigiría crear una secuencia por empresa al vuelo, es decir DDL disparado por un alta.

**B. Un método `nextLot(scope)` en el puerto, con el dominio pidiendo el número y luego escribiendo.**
Más limpio de leer y trivial de probar con dobles. **Descartada porque parte la operación en dos
viajes**: entre el `nextLot` y el `INSERT` cabe otra alta, y como el dominio no tiene transacción
—ni debe tenerla, `ports/product-repository.ts:7-15`—, no hay forma de cerrar la ventana desde
ahí. La carrera volvería y solo se vería en producción. Se prefiere que el número se calcule
**dentro** de la misma transacción que escribe.

**C. Un disparador `BEFORE INSERT` que rechace la fecha futura.** Daría defensa en profundidad como
la tienen `product_batches_check_company` y `units_check_derivation`. **Descartada** por §1.3: «hoy»
depende del reloj de referencia, el caso de uso ya inyecta el suyo y el disparador usaría el del
servidor de base; en el cambio de día las dos lecturas discrepan y el disparador rechazaría un alta
que la aplicación considera válida —un fallo intermitente, dependiente de la hora, imposible de
reproducir—. Se acepta que R4 viva solo en el servidor de aplicación, y se escribe como límite.

**D. Una tabla de contadores `company_batch_counters` con `UPDATE ... RETURNING`.** Atómica y sin
DDL al vuelo. **Descartada** por lo mismo que A —no sabe de los lotes tecleados a mano— y porque
mantiene el lock de fila hasta el commit, es decir, hace exactamente la misma cola que el lock de
aviso pero añadiendo una tabla, una migración y un segundo sitio donde la verdad puede desincronarse
de `product_batches`.

**E. Un `CHECK` en la base para D13** (enmienda del 2026-09-15). Por ejemplo,
`CHECK ("lot" !~ '^[0-9]+$' OR char_length("lot") <= 59)`, como segunda defensa de R34, siguiendo el
criterio de «las dos defensas no se sustituyen» de §1.2. **Se descarta porque la base no puede
expresar D13 sin romper R36:**
- D13 habla de lotes **tecleados**, y la fila no guarda si el lote se tecleó o se generó (el mismo
  límite que R23).
- Un `CHECK` solo puede decir «ningún lote de solo dígitos llega a 60», y eso **también** rechaza el
  generado de 60 caracteres. Con 59 nueves en la empresa, el siguiente generado (10^59) lo rechazaría
  el `CHECK`: es el fallo que D13 quiere evitar, trasladado un dígito antes.
- Añadir una columna de procedencia para poder escribir el `CHECK` sería ampliar el modelo de datos
  por una frontera que no se alcanza, y nadie lo ha pedido.

La base mantiene la defensa que **sí** comparten los dos lados: `product_batches_lot_length`, 60 para
todo lote.

**F. Traducir en el adaptador el `23514` de `product_batches_lot_length` a `invalid_input`, en vez de
cortar en la entrada.** Con esto, el alta de la empresa con 60 nueves dejaría de salir como
`unexpected`. **Se descarta:**
- Cura el síntoma a 61 caracteres, pero **no** la causa: la generación de esa empresa seguiría
  bloqueada para siempre.
- Para un lote **generado** mentiría: quien da de alta no escribió nada, así que no hay entrada
  inválida que corregir.
- Contradice el criterio conservador de `translateBatchWriteError` (`product-prisma.ts:788-792`), que
  relanza lo que no es entrada del llamante.

D13 lo decidió en la entrada, y ahí se aplica.

**G. `FOR SHARE` en lugar de `FOR NO KEY UPDATE`** (segunda enmienda, §10). También choca con el lock del
borrado y además dejaría hacer en paralelo dos altas sobre el mismo producto. **Se descarta:**
- Dos transacciones con `FOR SHARE` sobre la misma fila que después intenten escribirla **se
  interbloquean**. Hoy el alta no escribe la fila del producto, pero en cuanto una escritura la toque
  dentro de esa transacción, dos altas simultáneas quedarían bloqueadas entre sí, y ese fallo solo se
  ve con concurrencia.
- La ganancia es poca: las altas con lote generado ya hacen cola por empresa en el lock de aviso.

`FOR KEY SHARE` ni siquiera sirve: es el lock que ya toma la FK, y es compatible con el del borrado
(§10.1).

**H. Un disparador `BEFORE INSERT` en `product_batches` que rechace el producto borrado**, bloqueando
dentro la fila del producto. Daría defensa en la base para cualquier vía de escritura. **Se descarta:**
- Sería la **primera** regla de «vivo» (`deleted_at`) escrita en la base. El borrado lógico se filtra en
  los adaptadores, y ningún objeto de la base lo conoce.
- Exige cambiar la migración y su huella, traducir un error de base nuevo a `ProductNotFoundError` y
  tocar los tests de esquema.
- La aplicación tiene una sola vía que escribe lotes sobre un producto existente (R32 no deja otras), y
  un lock de fila en esa vía cierra R37.

Lo que queda sin cubrir va como límite en §9.7.

**I. Subir el aislamiento de la transacción.** **Se descarta:**
- **`REPEATABLE READ` ni siquiera detecta la carrera.** El alta no escribe la fila del producto, así
  que un borrado confirmado no entra en conflicto con ella.
- **`SERIALIZABLE` sí la detectaría, pero rompe dos cosas:**
  - fija la instantánea en la primera sentencia, así que el lock de aviso del correlativo dejaría de
    servir (§3.2 depende de que en READ COMMITTED cada sentencia tome su propia instantánea) y R14
    caería;
  - obligaría a reintentar **toda** alta ante un fallo de serialización (`40001`), por un motivo que
    hoy no existe.

## 7. Dependencias y catálogo de errores

### 7.1. Dependencias: **ninguna**

Esta ficha no necesita ninguna librería nueva (R30). Todo lo que usa —`pg` ya presente para los
tests, el cliente de Prisma, zod— está en el repo. `package.json` y `pnpm-lock.yaml` quedan sin
tocar, y `tests/guards/guard-dependencias-aprobadas.test.ts` sigue verde sin cambiar
`docs/dependencias.md`. **Si alguna task acabara pidiendo una, se para y se propone: no se
instala** (`docs/architecture.md > Dependencias de terceros`).

Nota sobre fechas: la tentación de meter un `date-fns` o un `dayjs` para «hoy» y para validar el
calendario está considerada y descartada **sin proponerla**, porque el repo ya resuelve la fecha
civil con cadena + `T00:00:00Z` (`product-prisma.ts:500-514`) y lo que hace falta aquí son dos
líneas de `Date.UTC`. Reimplementar no sería el problema; el problema sería una dependencia para
`slice(0,10)`.

### 7.2. Código de error nuevo — **sexta enmienda al catálogo cerrado, pendiente de aprobación**

**Qué:** añadir `batch_duplicate_lot` a `ERROR_CODES` (`lib/modules/errores/domain/error-codes.ts`),
su clave en `ERROR_MESSAGE_KEY` y su texto en `ERROR_MESSAGES_ES`
(`lib/modules/errores/domain/error-catalog.ts`), más la clase `BatchDuplicateLotError` en
`lib/modules/inventario/domain/errors.ts`.

**Texto propuesto:** «Ya existe un lote con ese valor en esta empresa.» — distinto de los seis
«duplicado» que ya hay, como exige R4 de QC-70 (dos claves no pueden compartir texto).

**Por qué hace falta:** R13 pide un rechazo **distinguible**, y con `invalid_input` la persona lee
«La entrada recibida no es valida» sobre un formulario entero sin saber que el problema es el lote.
Precedente exacto: `duplicate_number` existe para el correlativo de pedidos.

**No amplía ninguna familia nueva**: `inventario` ya es del catálogo desde QC-70. No redefine ningún
código anterior.

**Puerta:** lo aprueba el humano **con este spec** (F1.4). **Si lo rechaza**, el plan B es reutilizar
`invalid_input` —el mismo desenlace que QC-49 eligió para el disparador de empresa,
`product-prisma.ts:649-654`— y R13 se cumple igual en «no escribe nada», pero se pierde el
«distinguible»: entonces R13 se recorta a «rechaza sin escribir» y se anota en el `impl_`. **No se
implementa ninguna de las dos hasta que haya respuesta.**

## 8. Verificación

**Integración contra base real** es lo que D11 exige, y hay cuatro cosas que un unitario con la base
simulada **no puede** demostrar: el correlativo, la unicidad por empresa, el relleno y la carrera.

Archivo nuevo: `tests/integration/inventario/product-batch-lot.int.test.ts`, declarado en
`tests/integration/aislamiento.json` (§0.7) como **`commit`** con motivo escrito: el adaptador habla
con el cliente Prisma **global**, así que envolver sus llamadas en una transacción del test sería un
aislamiento de mentira —el precedente y el argumento están escritos en
`product-batch-write.int.test.ts:14-21`—. Cada caso fabrica su empresa y su producto con
`randomUUID` y limpia en `finally` en orden de FK; la base de la corrida es suya (QC-77).

**La carrera (R14) se prueba de verdad.** Así quedó implementado, y así lo recoge la enmienda del
2026-09-15 (m5):
- **Qué se lanza.** **3 rondas de 8** `createWithFirstBatch` de la **misma empresa**, a la vez y sin
  `await` intermedio.
- **Cómo se espera.** Cada ronda se espera con **`Promise.allSettled`**. El **primer rechazo se relanza
  tal cual**, antes de afirmar nada y antes de limpiar. Con `Promise.all`, el `finally` limpiaba
  mientras otras altas seguían escribiendo, y la violación de FK de la limpieza tapaba la causa real.
  El nombre del `it` sigue diciendo «con Promise.all», para no romper las referencias del mapa.
- **Qué se afirma.**
  - Todas resuelven, sin excepción.
  - Hay **exactamente 8** `$transaction` por ronda, es decir, ningún reintento, y eso queda medido, no
    deducido.
  - Los lotes son **distintos y consecutivos**.
- **Requisito de entorno.** El test solo tiene sentido con un **pool de Prisma de más de una
  conexión**. Con `connection_limit=1` las altas se serializarían en el pool y pasaría **sin** lock.
  Lo dice un comentario en el propio test.
- **Muerde.** Si se quita el lock (mutación con `num_nonnulls(`), el test da rojo con la causa real: el
  `P2002` agotado a los 3 intentos, con contexto y `cause`. Es un test que **puede fallar si el diseño
  está mal**, que es la única clase que vale aquí.

**La serie sin techo (m4)** tiene dos casos de integración:
- Con `'999999999999999999'` tecleado, las dos altas siguientes generan `'1000000000000000000'` y
  `'1000000000000000001'` sin chocar (R16).
- El relleno, con el SQL real de disco, continúa desde lotes de 18 dígitos o más sin chocar con uno de
  19 y sin reventar con uno de 40 (R18).

**D13 (R34–R36)** se prueba en dos niveles (T13 y T14):
- **Unitario del esquema y del caso de uso**, que cubre el rechazo de 60 dígitos con un solo issue en
  `lot`, el borde de 59 y el lote de 60 caracteres con letras.
- **Integración por el caso de uso con el repositorio real.** Con 59 nueves tecleados, el siguiente
  generado se escribe con **60** caracteres, y el de después también. Es lo único que demuestra de
  verdad que el `CHECK` de largo no muerde en esa frontera.

**El borrado concurrente (R37, segunda enmienda)** se prueba contra base real con dos casos
deterministas (T16). Tienen tres cosas en común:
- **No duermen ni dependen de tiempos.** Un `Client` de `pg` aparte sujeta un lock y el test espera
  mirando `pg_stat_activity` hasta ver al otro backend bloqueado.
- **Cada caso tiene su orden de R37:**
  - **(a) El borrado gana.** El `Client` deja sin confirmar el `UPDATE` del borrado; el alta tiene que
    **esperar** a la fila y, tras el `COMMIT`, devolver `null` sin escribir ningún lote.
  - **(b) El alta gana.** El `Client` sujeta el lock de aviso del correlativo para pausar un alta que
    ya tiene la fila; el borrado tiene que **esperar**, y el alta se confirma antes que él.
- **Muerden.** Sin el `FOR NO KEY UPDATE`, el alta de (a) no espera y escribe su lote, y el borrado de
  (b) no espera y se confirma antes: los dos dan rojo con su propio mensaje. La mutación se hace con
  copia y restauración, como la del lock de aviso.

Un unitario con dobles fija además el **orden**: la lectura con lock de fila va antes que el lock de
aviso (§10.3).

**El relleno (R18-R21)** se prueba aplicando el `migration.sql` sobre una copia con filas sembradas
a mano antes de la migración. Si eso resulta impracticable contra la base ya migrada de la corrida,
la alternativa aceptada es un test de **esquema** que lee el SQL —patrón de
`tests/unit/inventario/schema/inventory-company-scope-migration.test.ts`— **más** un caso de
integración que reproduce las mismas sentencias del relleno sobre filas recién insertadas. Lo que
**no** vale es dar el relleno por bueno solo leyendo el archivo: la task lo dice.

**Sin E2E** (R29): se difiere a QC-103 con motivo escrito —aquí no hay recorrido nuevo que mirar—.
Es una excepción consciente a `CHECKPOINTS.md:20` y va anotada en el `impl_`.

## 9. Límites conocidos

1. **R4 no está en la base** (§1.3, §6 C). Una escritura por otra vía puede meter una fecha futura.
2. **La unicidad no normaliza** (§1.2): `'L1'` y `'l1'` conviven en la misma empresa.
3. **Un `'9000'` tecleado deja la serie saltada para siempre.** Lo acepta D6 por escrito.
   **Enmienda del 2026-09-15:** desde m4 el salto **no tiene techo**. Un lote de 40 dígitos tecleado
   salta la serie a 40 dígitos, y desde D13 el salto llega como mucho a 59 dígitos. **Los dieciocho
   nueves de m4 dejan de ser un límite**: con `numeric` quedan resueltos y tienen test (§8).
4. **Bajo el `postgres` superusuario del `.env` local, el paréntesis de RLS de la migración no hace
   nada** y no se puede distinguir de no escribirlo —la trampa que QC-49 documentó en voz alta
   (`migration.sql:88-94`)—. Lo verificable en local es que las líneas están escritas y el
   paréntesis bien cerrado, y eso lo vigila el test de esquema.
5. **QC-103 hereda dos cosas**: pintar la fecha de compra (con hoy por defecto) y **enseñar** el lote
   generado tras el alta. Esta ficha lo **escribe** pero no lo devuelve a la pantalla:
   `CreateProductFormState` sigue devolviendo solo el `id` (`product-actions.ts:262-263`) y no se
   cambia, porque cambiarlo sería tocar el borde de una pantalla que no entra.
   **Enmienda del 2026-09-15: hereda también el rechazo de la fecha futura (m3, R4).**
   - **Qué pasa hoy.** Una fecha de compra posterior a hoy sale como `ValidationError`: quien llama
     recibe `invalid_input` y su mensaje del catálogo, **sin campo**. El `diagnostic` que nombra
     `purchaseDate` va solo al registro del servidor (`create-product.ts:87-89`).
   - **No es una asimetría nueva.** Cualquier fallo de zod dentro del caso de uso ya sale sin campo
     (`create-product.ts:138`), y R6 tampoco llega con campo a quien llama en el servidor.
   - **La diferencia con R6 está en el formulario.** R6 y R34 los caza el esquema **en el cliente** y
     se pintan en su campo; R4 **no** puede cazarlo el esquema (§4.1), así que en la pantalla de hoy
     llega como un error general del formulario.
   - **QC-103 elige una de dos, y la elección es suya:**
     - (a) **Pintar el rechazo en el campo `purchaseDate`**, comprobando «no futura» también en el
       cliente, con su propio «hoy» y sabiendo que puede discrepar del servidor en el cambio de día.
       El servidor sigue siendo el que decide.
     - (b) **Cambiar el contrato** de errores del borde para que un `invalid_input` pueda llevar el
       campo. Afecta al traductor único `createErrorStateTranslator` y, por tanto, a los siete
       adaptadores driving: no es una decisión de inventario solo.
   - **Y hereda el texto del lote numérico (R34, §4.6)**, que ya se pinta en el campo `lot` sin tocar
     la pantalla. QC-103 solo tiene que revisar la redacción.
6. **Un lote de solo dígitos de 60 caracteres ya escrito antes de D13: LÍMITE CONOCIDO Y ACEPTADO**
   (pregunta **P1**, abierta y cerrada el 2026-09-15 con la **opción D**).
   - **Motivo del humano, textual:** «no los hay, es nuevo todo». No hay datos previos con lotes de
     solo dígitos de 60 caracteres o más.
   - **Consecuencia:** la migración **no** lleva guardia para este caso, no cambia ninguna sentencia de
     `migration.sql`, no nace ningún requisito y T15 no aplica. El R37 actual es de D14, §10.
   - **El caso vecino tampoco se protege, y por el mismo motivo.** Son los lotes ya escritos de **más**
     de 60 caracteres de cualquier forma (desviación 5 de la Tanda 1 de la bitácora), que harían
     abortar la migración entera al crear `product_batches_lot_length`, con el mensaje genérico.
   - **Qué queda cubierto, tras D13.** Desde D13 ninguno de los dos se puede crear por la aplicación:
     R34 para los de solo dígitos y el largo máximo del esquema para el resto. Lo único que podría
     alcanzarlos es una escritura por otra vía, que ya estaba fuera de las defensas del esquema.

   Se deja a continuación lo que se midió y las opciones que se plantearon, como constancia de qué se
   aceptó. D13 impide teclearlo desde ahora, pero no dice nada de los datos previos ni de las
   escrituras por otra vía. Medido contra base efímera (bitácora, «Correcciones de la revision»):
   - **En la migración:** si una empresa tiene 60 nueves **y** alguna fila sin lote, el relleno escribe
     61 caracteres y el `CHECK` `product_batches_lot_length` aborta la migración **entera**, con el
     mensaje genérico «violada por alguna fila». No deja nada a medias.
   - **En el alta:** si el máximo numérico de una empresa son 60 nueves, cada alta con lote generado
     de esa empresa la rechaza el `CHECK` con `23514`. Llega como `PrismaClientUnknownRequestError`
     crudo y el borde lo devuelve como `unexpected`. Abre una sola transacción y no escribe nada, pero
     **bloquea para siempre la generación en esa empresa**, y R32 no deja arreglarlo desde la
     aplicación. Las altas con lote tecleado siguen funcionando.
   - **Con 60 dígitos que no son todos nueves no falla nada**, ni en la migración ni en el alta.

   Las opciones que se plantearon para P1, en términos de SQL (constancia; se eligió D):
   - **A**: guardia en el paso 1 que aborta si existe
     `"lot" ~ '^[0-9]+$' AND char_length("lot") >= 60`.
   - **B**: guardia en el paso 1 que aborta si, para alguna empresa,
     `max(("lot")::numeric) FILTER (WHERE "lot" ~ '^[0-9]+$') >= (10::numeric ^ 60) - 1`. Es la
     condición **exacta** de los dos fallos de arriba. La potencia tiene que ser `numeric`: con
     enteros, Postgres la calcula en `double precision` y el `- 1` se pierde por redondeo. La condición
     atrapa también los lotes de solo dígitos de más de 60 caracteres, que de todos modos abortarían
     en el `CHECK`, así que les da el mensaje legible.
   - **D**: ninguna sentencia nueva. Solo cambia el comentario del paso 4 para citar D13, y este punto
     queda como límite aceptado.

   Con A o B, el mensaje habría seguido el formato de R21. **Se eligió D el 2026-09-15**: ninguna
   sentencia nueva. El comentario del paso 4 de `migration.sql` sigue diciendo «LIMITE CONOCIDO»,
   que es exactamente lo que ahora es, y **no** se toca en esta enmienda. Este punto es un **límite
   aceptado**, con el motivo escrito arriba.
7. **Una escritura de lote por otra vía que no sea la aplicación puede colgarlo de un producto
   borrado** (segunda enmienda del 2026-09-15). R37 se cierra con un lock de fila en la única vía de
   la aplicación que escribe lotes sobre un producto existente (§10). La base no rechaza un lote sobre
   un producto con `deleted_at` puesto, porque el disparador se descartó (§6 H).

## 10. Segunda enmienda del 2026-09-15: el alta sobre un producto que se borra a la vez (D14, R37)

### 10.1. La carrera existe: comprobado en el código

Las referencias de línea son las del worktree **después** de la limpieza de comentarios.

| Pieza | Qué hace | ¿Impide la carrera? |
|---|---|---|
| Borrado lógico, `softDeleteAliveProduct` (`product-prisma.ts:117-130`) | Un `updateMany` con `deleted_at IS NULL` que escribe `deleted_at` y `updated_at`. Es un `UPDATE` suelto, fuera de transacción interactiva. Como no cambia ninguna columna con índice único, Postgres toma sobre la fila el lock **`FOR NO KEY UPDATE`** hasta su commit | Es el lock con el que hay que chocar |
| Comprobación de «vivo» en `addBatchToAlive` (`:525-529`) | Un `findFirst` **sin lock**. En READ COMMITTED lee la última versión confirmada y no bloquea nada | No |
| Correlativo (`resolveBatchLot`, `:532`) | Pide `pg_advisory_xact_lock` **después** de la comprobación; con altas en cola, la espera **ensancha** la ventana | No; la agranda |
| FK `product_batches_product_id_fkey` (`20260909120000_product_batches/migration.sql:37`) | El `INSERT` del lote toma `FOR KEY SHARE` sobre la fila del producto, que es **compatible** con `FOR NO KEY UPDATE`. Su `ON DELETE RESTRICT` solo actúa en un borrado **físico** | No |
| Disparador `product_batches_check_company` (`20260911130000_inventory_company_scope/migration.sql:264-301`) | Lee `company_id` del producto, sin lock y sin mirar `deleted_at` | No |
| Disparadores y `CHECK` sobre `products` | No hay ninguno. Los tres disparadores del repo son `units_check_derivation_trigger`, `product_batches_check_company_trigger` y `presentations_check_unit_scope_trigger` | No |
| Caso de uso del borrado (`delete-product.ts:40-43`) | No mira los lotes | No |

**La secuencia que falla hoy:**
1. El alta A comprueba que el producto está vivo.
2. El borrado B se confirma.
3. A escribe el lote y confirma.

A recibe éxito, pero su lote cuelga de un producto que ya no se ve. Con el arreglo, A recibe
`product_not_found`, por la rama del caso de uso que ya existe para `addBatchToAlive` devolviendo
`null`. Al reintentar, la resolución por nombre ya no encuentra el producto y crea uno nuevo (QC-90
R19).

### 10.2. El arreglo: bloquear la fila del producto al comprobarlo

En `addBatchToAlive`, el `findFirst` pasa a ser esta consulta, como **primera sentencia** de la
transacción:

```sql
SELECT "id"
  FROM "products"
 WHERE "id" = :productId
   AND "company_id" = :companyId      -- de companyScopeColumns(scope)
   AND "deleted_at" IS NULL
   FOR NO KEY UPDATE
```

- **Con `tx.$queryRaw`**, porque la API tipada de Prisma no expresa locks de fila. La empresa sale de
  `companyScopeColumns(scope)`, igual que en `resolveLot`: la guardia de ámbito exige que el `scope`
  llegue a las envolturas de `./company-scope` (`tests/guards/guard-ambito-empresa-inventario.test.ts`).
- **Sin fila, `null`**, como hoy. Ni el puerto ni el caso de uso cambian de firma ni de significado.
- **Por qué `FOR NO KEY UPDATE` y no `FOR UPDATE`.** Es de la misma familia que el `SELECT … FOR
  UPDATE` del encargo y basta:
  - choca con el lock del borrado, que es el mismo modo, y con el de la edición (`updateAliveProduct`,
    `:98-115`, también un `UPDATE` sin columnas únicas);
  - `FOR UPDATE` bloquearía además los `FOR KEY SHARE` que toman los `INSERT` de otras tablas con FK a
    `products`, sin proteger nada más. Son las líneas de receta
    (`20260902163256_recipes_and_recipe_lines/migration.sql:68`) y las del catálogo de proveedor
    (`20260903131417_suppliers_and_supplier_catalog_lines/migration.sql:75`).
- **Por qué basta con esa fila.** «Vivo» es `deleted_at IS NULL` **en esa fila** y nada más: ninguna otra
  fila decide si el producto está vivo. Toda escritura que pueda volver falso el predicado es un `UPDATE`
  de esa fila y tiene que esperar.
  - **Si el borrado va primero:** el `SELECT … FOR NO KEY UPDATE` espera a que se confirme, y en READ
    COMMITTED Postgres **vuelve a evaluar el `WHERE` sobre la versión nueva** de la fila. `deleted_at`
    ya no es nulo, la fila no sale y el alta devuelve `null` (R37 a).
  - **Si el alta va primero:** mantiene el lock hasta su commit o rollback, cubriendo el correlativo y
    el `INSERT`, y el borrado espera (R37 b).
- **Reintentos.** Cada reintento del correlativo (§3.3) abre una transacción nueva y vuelve a tomar el
  lock de fila. Si entre dos intentos se confirma un borrado, el intento siguiente devuelve `null`.

### 10.3. El orden de adquisición, fijado

Dentro de la transacción de `addBatchToAlive`, **siempre** en este orden:
1. la fila de `products`, con `FOR NO KEY UPDATE`;
2. el `pg_advisory_xact_lock` del correlativo de la empresa, solo si hay que generar (§3.2);
3. el `INSERT` del lote. Su `FOR KEY SHARE` de la FK cae sobre la fila que la misma transacción ya
   tiene, así que no espera.

**No hay interbloqueo posible.** Estos son los locks de cada transacción que toca alguna de las dos
cosas:

| Transacción | Fila de `products` ya existente | Lock de aviso del correlativo |
|---|---|---|
| Alta sobre producto existente (`addBatchToAlive`) | 1.º | 2.º, solo si genera |
| Alta con producto nuevo (`createWithFirstBatch`) | ninguna: la fila que crea no la ve nadie | sí |
| Borrado lógico y edición del producto | sí, por su `UPDATE` | no |
| Alta de línea de receta o de catálogo | `FOR KEY SHARE`, compatible | no |

Ninguna transacción toma el lock de aviso y **después** una fila de producto existente, así que no se
forma ningún ciclo. **Regla para quien toque esto después:** ninguna transacción puede pedir el lock de
aviso del correlativo y, a continuación, bloquear una fila de `products` que ya existe.

**Por qué este orden y no el contrario.** El contrario tampoco formaría un ciclo hoy, pero tiene dos
costes:
- un alta que espera al borrado de **un** producto retendría la cola de correlativos de **toda** la
  empresa mientras espera;
- pediría el lock de aviso para un producto que quizá ya no está vivo, algo que el orden actual de
  `addBatchToAlive` ya evita.

### 10.4. `createWithFirstBatch` no necesita el lock

- **No hay ventana que cerrar.** El producto se inserta en la misma transacción que su lote, y nadie
  más lo ve hasta el commit:
  - un borrado concurrente no lo encuentra: su `UPDATE` afecta a cero filas y el borrado sale con
    `product_not_found`;
  - un borrado posterior es un borrado secuencial de un producto que ya tiene lotes.
- **La resolución por nombre tampoco cambia**, aunque va fuera de la transacción. Si el producto se borra
  entre esa lectura y `addBatchToAlive`, el caso es R37 (a).

### 10.5. Qué ve quien llama, y qué no cambia

- **(a) El borrado gana:** el alta recibe `product_not_found` («El producto solicitado no existe.») y
  el borrado, éxito.
- **(b) El alta gana:** las dos reciben éxito, y el borrado tarda lo que tarde el alta en confirmarse.
- **Nada más cambia:** ni código de error, ni puerto, ni migración, ni pantalla (R28), ni dependencias
  (R30).

### 10.6. Coste aceptado

- **Esperas del borrado y la edición.** Un borrado o una edición de un producto esperan a que termine
  cualquier alta en curso sobre ese mismo producto. Si el alta genera lote, la espera incluye su turno
  en la cola del correlativo de la empresa (§3.4).
- **Cola entre altas.** Dos altas sobre el mismo producto hacen cola aunque las dos traigan lote
  tecleado, cosa que hoy no pasa.
- **Límite de tiempo.** La espera del alta sobre el lock de fila cuenta dentro del límite de tiempo de
  la transacción interactiva de Prisma. El adaptador no pasa opciones a `$transaction`, así que rige
  el valor por defecto del cliente: es la misma cota que ya tiene la espera del lock de aviso.

### 10.7. Comentarios del código

El porqué que se quitó del docblock de `addBatchToAlive` era falso. Si el código nuevo lleva
comentario, explica solo el porqué que el código no muestra:
- sin el lock de fila, un borrado confirmado entre la comprobación y el `INSERT` deja el lote colgando;
- el orden es fila primero y lock de aviso después.

No cita fichas, requisitos ni este documento (`docs/conventions.md > Comentarios (2026-09-15)`).
**Este spec no ordena citar D14 ni R37 en ningún comentario**; R37 va solo en el nombre de los tests.
