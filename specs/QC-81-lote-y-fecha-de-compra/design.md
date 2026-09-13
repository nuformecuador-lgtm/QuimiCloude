# QC-81 — lote-y-fecha-de-compra · design.md

> Decisiones técnicas para los requisitos de `requirements.md`. El **alcance y la tabla de
> decisiones cerradas** los fijó el humano el 2026-09-13 y aquí no se reabren: lo que sigue es
> **cómo** se cumplen, no **si** se cumplen.

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
  (`PRODUCT_BATCH_LOT_MAX_LENGTH`, `product-batch-input.ts:49`). No se cambia.

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
  SELECT "company_id", max(("lot")::bigint) AS top
    FROM "product_batches"
   WHERE "lot" ~ '^[0-9]{1,18}$'
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

- `'^[0-9]{1,18}$'` acota a lo que cabe en `bigint`: sin la cota, un lote de 40 dígitos tecleado a
  mano reventaría el `::bigint` con un `22003` en mitad de la migración.
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
2. SELECT max(("lot")::bigint) FROM "product_batches"
    WHERE "company_id" = :companyId AND "lot" ~ '^[0-9]{1,18}$'
3. INSERT ... (la API tipada de Prisma, con toBatchCreateData)
```

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
`P2002` sobre `product_batches_company_lot_unique`:

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
- `isDuplicateBatchLot(error)`: `P2002` **y** que el `meta.target` nombre
  `product_batches_company_lot_unique` — dos condiciones, mismo criterio conservador que
  `isBatchCompanyScopeViolation` (`:631-641`) e `isDuplicateOrderNumber` (`order-prisma.ts:128-139`).
  Un `P2002` que no se sabe identificar **se relanza**.

### 4.5. Server Action (`adapters/driving/product-actions.ts`)

`buildCreateProductCandidate` gana una línea: `purchaseDate: readOptionalFormString(formData,
'purchaseDate')` (`:217-229`). Vacío ⇒ `undefined` ⇒ hoy. `buildUpdateProductCandidate` **no** se
toca: la edición sigue sin conocer ningún campo de lote (QC-90 R26). No hay ruta ni endpoint nuevo.

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

**La carrera (R14) se prueba de verdad:** dos `createWithFirstBatch` de la **misma empresa**
lanzados con `Promise.all`, sin `await` intermedio, y se afirma que las dos resuelven, que los dos
lotes son **distintos**, **consecutivos** y que no hubo excepción. Con el lock, el segundo espera; sin
el lock, el test da rojo por `P2002` o por lotes repetidos. Es un test que **puede fallar si el
diseño está mal**, que es la única clase que vale aquí.

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
4. **Bajo el `postgres` superusuario del `.env` local, el paréntesis de RLS de la migración no hace
   nada** y no se puede distinguir de no escribirlo —la trampa que QC-49 documentó en voz alta
   (`migration.sql:88-94`)—. Lo verificable en local es que las líneas están escritas y el
   paréntesis bien cerrado, y eso lo vigila el test de esquema.
5. **QC-103 hereda dos cosas**: pintar la fecha de compra (con hoy por defecto) y **enseñar** el lote
   generado tras el alta. Esta ficha lo **escribe** pero no lo devuelve a la pantalla:
   `CreateProductFormState` sigue devolviendo solo el `id` (`product-actions.ts:262-263`) y no se
   cambia, porque cambiarlo sería tocar el borde de una pantalla que no entra.
