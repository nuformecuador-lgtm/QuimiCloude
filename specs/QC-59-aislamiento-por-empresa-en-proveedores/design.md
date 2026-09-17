# QC-59 — aislamiento-por-empresa-en-proveedores · design.md

> Cómo se construye lo que `requirements.md` pide. El **Alcance** y la tabla de **decisiones
> cerradas** los fijó el humano el 2026-09-17 y aquí **no se reabren**: lo que sigue es *cómo* se
> cumplen, no *si* se cumplen. Las referencias `[D<n>]` son a esa tabla, `D1`–`D19`.
>
> Precedentes que mandan, y son tres: **QC-49** (`specs/QC-49-aislamiento-por-empresa-en-inventario/`),
> **QC-60** (`…-pedidos/`) y sobre todo **QC-50** (`…-recetas/`), la más reciente del mismo arco.
> Esta es la **cuarta** ficha del arco y la **última** del módulo: casi todas las decisiones se
> heredan y lo dicen por escrito, así que aquí se copian sus soluciones en vez de reinventarlas y
> solo se argumenta lo que es **propio de proveedores**: las dos claves foráneas compuestas, sus dos
> claves candidatas nuevas, y la única costura nueva hacia `unidades`.

## 0. Hallazgos

Medidos en disco, dentro de este worktree, el 2026-09-17.

### 0.1. Ninguna contradicción con las decisiones cerradas

Reviso las diecinueve y **ninguna choca con el código**. No hay hallazgo que me obligue a
contradecir una decisión, así que no hay nada que parar y reportar al leader por esa vía. Lo único
que reporto es de **conteo**: la tabla tiene **19 filas**, no 18 (ver la nota al pie de
`requirements.md`).

### 0.2. El estado real de las dos tablas

- `db/schema.prisma:381-398`, modelo `Supplier`: **no hay `companyId`**. Dos índices de auditoría,
  borrado lógico (`deletedAt`), y el `///` ya avisa de que `suppliers_name_unique` y los índices de
  búsqueda **viven en las migraciones** porque Prisma no modela índices parciales ni GIN.
- `db/schema.prisma:407-431`, modelo `SupplierCatalogLine`: **no hay `companyId`** y **lo gana**
  `[D1]`. Única FK con `@relation`: `supplier_catalog_lines.supplier_id → suppliers(id)`
  `ON DELETE CASCADE`. `presentationId`, `unitId`, `createdBy` y `updatedBy` van **sin `@relation`** y
  sus FK están escritas a mano. `unitId` es **anulable**. **No hay ningún `@@unique`**, a propósito:
  la unicidad de la línea es un índice parcial escrito a mano.
- `db/migrations/20260903131417_suppliers_and_supplier_catalog_lines/migration.sql:113`:
  `CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("name_normalized") WHERE "deleted_at"
  IS NULL`. **Global y parcial**, las dos cosas. El relevo de §2.3 tiene que conservar la
  parcialidad, y eso es **la trampa número uno de esta ficha** (§2.3 y §8.4).
- `db/migrations/20260904123854_split_product_and_supplier_catalog/migration.sql:148`:
  `supplier_catalog_lines_name_presentation_unique` sobre `(supplier_id, name_normalized,
  presentation_id)`, **parcial** sobre las vivas. **No se toca** `[D8]`.
- Las dos tablas ya están `ENABLE` + `FORCE ROW LEVEL SECURITY` y sin ninguna policy —lo afirma
  `tests/integration/proveedores/proveedores-constraints.int.test.ts:1484`—. Esa es exactamente la
  mina que QC-49 documentó: bajo `FORCE` y sin policy Postgres deniega **también al dueño**, con
  quien conecta Prisma. La migración lee y escribe las dos, así que abre y cierra el mismo
  paréntesis `NO FORCE` / `FORCE` (§7.1).
- Base de desarrollo (dato del encargo, no lo vuelvo a medir): **51 proveedores vivos**, **1 línea
  viva** con presentación de QuimiCloud y **unidad de sistema**, **0 líneas con imagen**, **ningún
  nombre repetido**.

### 0.3. La clave candidata compuesta **no existe** hoy, y hace falta crearla dos veces

Verificado el 2026-09-17 en `db/schema.prisma` y en `db/migrations/**`:

| Tabla | ¿`UNIQUE (company_id, id)`? | `company_id` |
| --- | --- | --- |
| `suppliers` | **No existe** | no existe todavía (la trae esta ficha) |
| `presentations` | **No existe** | **ya es `NOT NULL`** (`schema.prisma:251`, QC-49) |

Sin esas dos claves candidatas **Postgres rechaza la clave foránea** con
`there is no unique constraint matching given keys for referenced table`: no es una optimización,
es la condición de que R4 y R5 se puedan escribir `[D5]`.

El **precedente literal está en el repo**, y es de QC-60/QC-83/QC-86:
`orders_id_company_id_key`, `users_id_company_id_key` y `work_groups_id_company_id_key`, con la FK
compuesta `order_assignments_order_id_company_id_fkey` colgando de ellas
(`20260915120000_orders_company_scope/migration.sql:163-167`). Copio el patrón entero —incluido el
orden del `down.sql`: la FK cae **antes** que la clave candidata, porque Postgres no deja borrar una
clave única mientras una FK la referencie (`…/down.sql:146-156`)—.

**Una diferencia deliberada con ese precedente, y la declaro para que no se lea como un descuido**:
allí las columnas van `(id, company_id)` y aquí `[D5]` dice `(company_id, id)`. **Respeto la
decisión literalmente.** Para Postgres el orden de las columnas de una clave única **no cambia nada**
en el emparejamiento de la clave foránea —se empareja por *conjunto* de columnas—, y a cambio el
orden de `[D5]` deja `company_id` de **cabeza**, así que la misma clave candidata sirve de índice de
la columna de empresa y R13 se cumple sin un índice extra. Los nombres siguen la convención que
Prisma generaría para ese orden: `suppliers_company_id_id_key` y `presentations_company_id_id_key`.

### 0.4. Los puntos de consulta de hoy, contados

**Once**, en dos archivos, y ninguno lleva empresa:

- `supplier-prisma.ts`: `createSupplier`, `findAliveSupplierById`, `buildSupplierWhere` (compartido
  por el `findMany` y el `count` de `listAliveSuppliers`), `updateAliveSupplier`, y
  `softDeleteAliveSupplier` —que son **dos** escrituras dentro de una transacción interactiva: el
  `updateMany` de `suppliers` y el arrastre del catálogo—.
- `supplier-catalog-line-prisma.ts`: `isSupplierAlive` (compartida por el alta y el listado),
  `createCatalogLine`, `replaceAliveCatalogLine`, `softDeleteAliveCatalogLine`,
  `buildCatalogLineWhere` y `listCatalogLinesBySupplierAlive`.

**No hay SQL crudo en este módulo**: `list-query-sql.ts` solo construye condiciones de Prisma. Todo
se compone con `Prisma.SupplierWhereInput` / `Prisma.SupplierCatalogLineWhereInput`.

### 0.5. El actor de `proveedores` todavía no lleva empresa

`lib/modules/proveedores/domain/actor.ts:18-21`: `Actor = { id, permissions }`.
`supplier-actions.ts:81-85`: `currentActor()` llama **solo** a `getSessionUser()`, y **sin**
`runInRequestScope`; `supplier-catalog-actions.ts` hace lo mismo. En cuanto ganen la empresa entran
en el supuesto de **QC-104** (§3.1 y §8.3).

### 0.6. La única costura nueva, y la que NO nace

- **Nace**: `proveedores` pasa a consumir `UnitCatalog.findRefs(ids, companyId)` de `unidades`
  (`lib/modules/unidades/domain/unit-catalog.ts:38`). **Ya llegó acotada** —QC-50 le puso el
  `companyId` y su implementación compone `companyScopeWhere`, la única definición de «de la empresa
  **o de sistema**» (`unit-catalog-prisma.ts:52-57`)—, así que esta ficha **no toca `unidades`**:
  solo la llama. Es la única costura de código nueva entre módulos y `[D6]` la nombra.
- **No nace**: ningún puerto hacia `inventario`. `create-catalog-line.ts:13-28` deja escrito por qué
  no existe —QC-52 lo cortó entero y «volver a atarlos contradiría la ficha entera»— y `[D4]` lo
  ratifica. La frontera de la presentación es la FK compuesta de §2.2, no una pregunta.

### 0.7. La trampa que el arco ya cobró tres veces: el único de nombre es **parcial**

`suppliers_name_unique` lleva `WHERE "deleted_at" IS NULL`. El molde de QC-49 en `presentations` era
**total** —porque `presentations` no tiene borrado lógico— y copiarlo aquí dejaría el nombre de un
proveedor dado de baja **ocupado para siempre**, sin un solo test en rojo. QC-50 cazó exactamente eso
y esta ficha lo hereda: §2.3 lo escribe, §8.4 lo afirma desde tres ángulos independientes y
**falsables**, y la alternativa **D** de §11 lo descarta por escrito.

### 0.8. El reconocimiento del duplicado sobrevive al relevo

`supplier-prisma.ts:67` compara `meta.target` contra la **columna** `name_normalized`, no contra el
nombre del índice (criterio verificado empíricamente en QC-25 y QC-42). Con el índice compuesto el
`target` pasa a ser `['company_id','name_normalized']` y `includes('name_normalized')` **sigue siendo
cierto**: la constante no cambia. R16 lo fija con un test contra Postgres real para que deje de ser
una deducción.

`supplier-catalog-line-prisma.ts:107-112` (`CATALOG_LINE_UNIQUE_TARGETS`) tampoco cambia: el único de
la línea no se toca `[D8]`.

### 0.9. El `P2003` de la FK compuesta: hallazgo que hay que declarar

`supplier-catalog-line-prisma.ts:140-150` documenta un hallazgo empírico de QC-52: **hoy el conector
no dice qué restricción disparó el `P2003`** (`meta = { modelName, constraint: null }`), así que
`classifyForeignKeyViolation` devuelve `'unknown'` y el error se **relanza crudo**.

Consecuencia de R5/R6, medida y aceptada: una línea que apunte a una presentación de otra empresa
**se rechaza** —que es lo que la ficha existe para conseguir— pero el usuario verá hoy el estado
`unexpected` del traductor de `errores`, no `invalid_input`. **Sigue siendo estrictamente mejor que
hoy**, que la escritura pasa y se queda una fuga. La lógica de clasificación ya está escrita y
*empezará a traducir sola* en cuanto el conector diga el nombre: los nombres nuevos encajan en su
orden de comprobación sin tocarla —`supplier_catalog_lines_company_id_supplier_id_fkey` contiene
`supplier_id` y clasifica como `'supplier'`; `supplier_catalog_lines_company_id_presentation_id_fkey`
**no** contiene `supplier_id` y clasifica como `'catalog_reference'`—. Se añade un caso unitario con
los **nombres nuevos** para dejarlo probado (§8.2) y el coste queda en §12.

### 0.10. Las listas cerradas que esta ficha tensa

QC-50 previó seis y eran **trece** (`progress/impl_QC-50-…​.md`, «Las listas cerradas»). Las busco
yo y salen **catorce**, cada una con su task explícita (§8.5, bloque 3 de `tasks.md`). Ninguna se
relaja: se **tensa**, dando de alta a mano lo que entra y escribiendo el motivo.

| # | Lista | Archivo | Qué le pasa |
| --- | --- | --- | --- |
| 1 | `PRE_EXISTING_INDEXES` (integración) | `tests/integration/inventario/list-query-indexes.int.test.ts:155,182` | sale `suppliers_name_unique` con su comentario de relevo; entra un caso que afirma el compuesto **y su parcialidad** |
| 2 | `PRE_EXISTING_INDEXES` (unit, **la gemela que QC-50 no nombró**) | `tests/unit/inventario/schema/list-query-indexes-migration.test.ts:129,133` | misma alta y misma baja, sobre el **texto** de la migración de QC-57 |
| 3 | `MIGRACIONES_ESPERADAS` | `tests/guards/guard-identificador-de-request.test.ts:137` | entra la migración de esta ficha |
| 4 | `E2E_ESPERADOS` | `tests/guards/guard-identificador-de-request.test.ts:57` | entra `aislamiento-proveedores.spec.ts`, con su motivo y dejando **intacto** el diferimiento de QC-71 R21 |
| 5 | censo de E2E de proveedores | `tests/unit/proveedores/scope.test.ts:232` | `toEqual(['proveedores.spec.ts'])` → **dos** literales; el spec nuevo casa con `/proveedor|supplier/i` |
| 6 | campos de `model Supplier` | `tests/unit/proveedores/scope.test.ts:347` | entra `companyId` y la línea `@@unique([companyId, id], …)` |
| 7 | campos de `model SupplierCatalogLine` | `tests/unit/proveedores/scope.test.ts:377` | entra `companyId` y el `@@index` compuesto nuevo. **La aserción «no hay `@@unique` aquí» sigue en pie y sigue siendo cierta** `[D8]` |
| 8 | migraciones que tocan las dos tablas | `tests/unit/proveedores/scope.test.ts:444` | de **cuatro** a **cinco**, nombrada a mano |
| 9 | `MARCAS_DE_INVENTARIO` | `tests/unit/proveedores/scope.test.ts:81-88` | **colisión real**, ver §6.3: la marca `/\bfindRefs\b/` es una pistola apuntando a la costura de `unidades`. Se **retensa**, no se relaja |
| 10 | `SUPPLIER_COLUMNS`, `SUPPLIER_CATALOG_LINE_COLUMNS`, `CROSS_MODULE_SCALARS` | `tests/unit/proveedores/schema/proveedores-schema.test.ts:126,151,172` | entra `companyId → company_id` en las dos, y las **dos** columnas de empresa entran en el censo de escalares que cruzan de módulo |
| 11 | censo de FK, de CHECK, de índices y de columnas de las dos tablas | `tests/integration/proveedores/proveedores-constraints.int.test.ts:651,906,1319,1414,1441` | `toEqual` exactos contra el catálogo: entran las dos FK simples a `companies` y las **dos compuestas**, las columnas nuevas y los índices nuevos |
| 12 | `MODELOS_YA_AISLADOS_POR_SU_MIGRACION` | `tests/unit/inventario/scope.test.ts:391` | entran **`Supplier` y `SupplierCatalogLine`**, con la misma forma con que entraron `Order` y `Recipe`. **Las dos**, a diferencia de QC-50: aquí la línea **sí** tiene empresa propia `[D1]` |
| 13 | `ADAPTADORES_CON_ORM` | `tests/unit/proveedores/module-contract.test.ts:209` | **RETENSADO**: de dos a **tres** archivos, nombrados uno a uno (`company-scope.ts` tipa `Prisma.SupplierWhereInput`). Precedente literal: QC-60 y QC-50 hicieron lo mismo |
| 14 | `ACCIONES` (QC-104) | `tests/unit/identity/session-once-per-request-actions.test.ts` | entran los **dos** archivos de Server Actions del módulo |

Y una quinceava que no es lista sino **censo de disco**: `tests/integration/aislamiento.json`, donde
todo archivo nuevo de `tests/integration/**` se declara con su forma de aislamiento.

### 0.11. Las listas que comparan el **diff contra `origin/dev`**: por qué no muerden, y cómo se comprueba

Es el aviso del encargo, y QC-60 y QC-50 lo descubrieron tarde las dos veces: **esas listas pasan en
verde mientras no haya commit**. Las busco antes, no después. En este repo son tres familias:

- `tests/unit/proveedores-ui/guard-convenciones-proveedores.test.ts:155-193` y
  `guard-herencia-armazon-privado.test.ts:170`. Filtran los commits de `origin/dev..HEAD` **por la
  marca `QC-44`** (`git log --grep=QC-44`) y devuelven `null` —caso saltado— si no hay ninguno.
  **No muerden a QC-59** siempre que **ningún mensaje de commit de esta rama contenga la cadena
  `QC-44`**, porque en cuanto hubiera uno, el árbol de trabajo entero (`git status --porcelain`) se
  le atribuiría. Es una **regla de higiene de commits**, y es una task (T27).
- `tests/unit/unidades/consumidores-catalogo.test.tsx:195-200`: compara el diff de
  `app/(private)/proveedores` contra la base, pero solo **si la rama es la de QC-39**
  (`esLaRamaDeQC39`). Esta ficha **no toca esa carpeta** (§14), así que no aplica por partida doble.
- `tests/guards/guard-qc95-…`, `guard-qc102-…`, `guard-pantalla-pedidos-se-amplia`: del mismo tipo y
  atadas a sus propias fichas.

**Qué se hace con esto**: T27 las corre **después del primer commit** de la rama, no antes, y el
criterio de hecho es «verde con el árbol committeado». No se dan por buenas por haber pasado con el
árbol sucio.

### 0.12. La excepción que muere entera

QC-50 mató `SIN_AMBITO_POR_DECISION_APROBADA` y su maquinaria completa. **Esta ficha no encuentra
ninguna lista de excepciones equivalente** —`tests/guards/guard-ambito-empresa-recetas.test.ts:46`
deja escrito que ya no existe «ni equivalente»— y **no crea ninguna**. Lo que sí queda vacío es otra
cosa, y por eso R24 la nombra:

`docs/architecture.md:33-36` dice literalmente «**Lo ya construido todavía no lo está**, y esa es la
deuda que salda la épica QC-46: unidades (QC-51) y proveedores (QC-59). […] **cuando la lista quede
vacía, esta viñeta se borra**». `proveedores` es la última: esta ficha la saca y, si `unidades`
—hecha por QC-76— ya no debería estar ahí, la viñeta **se borra entera**, con su frase y su
referencia, en vez de quedarse vacía. Es el mismo criterio con el que QC-50 borró la constante, su
rama y su párrafo: `docs/architecture.md` prohíbe preparar infraestructura «por si acaso», y una
viñeta de deuda sin deuda es exactamente eso. Lo que la sustituye ya tiene nombre: **QC-61**, la
guardia de esquema, que esta ficha desbloquea y **no** implementa (R38). Es la task T28.

## 1. Panorama: qué se mueve y qué no

| Capa | Qué cambia |
| --- | --- |
| Base + Prisma | `suppliers.company_id` y `supplier_catalog_lines.company_id` NOT NULL con FK; **dos claves candidatas `(company_id, id)`**; **dos FK compuestas**; relevo del único de nombre a `(empresa, nombre)` **parcial**; backfill (§2) |
| Dominio | `Actor` gana `companyId`; nace `SupplierScope`; los **dos** puertos exigen el ámbito en la firma; los dos casos de uso de escritura de línea ganan el puerto de unidades (§3) |
| Adaptador driven | **un único punto** donde se escribe «de la empresa», y las once operaciones lo componen (§4) |
| Adaptador driving | `currentActor()` pide **las dos caras** de la sesión dentro de `runInRequestScope`, en los **dos** archivos de actions (§3.1) |
| Frontera con `unidades` | se **consume** `UnitCatalog.findRefs`, que ya viene acotada; `unidades` **no se toca** (§6.1) |
| Frontera con `inventario` | **ninguna**, y eso es el requisito (§6.2) |

Lo que **no** se mueve: la unicidad de la línea `[D8]`, el contrato genérico de consulta (QC-57), el
orden por defecto, la búsqueda por trigramas, la paginación, la forma de todos los resultados
públicos, el régimen de borrado lógico de las dos tablas, los cuatro `CHECK` de QC-42/QC-43, el
`onDelete: Cascade` de `supplier_catalog_lines_supplier_id_fkey`, **el almacenamiento de imágenes**
(R32, `[D9]`) y **cualquier componente de las dos pantallas** (§14).

**La frontera es el service, no la RLS.** Prisma conecta como dueño de las tablas y no setea
`request.jwt.claims`: ninguna policy filtra nada. La RLS se conserva activada y forzada como defensa
en profundidad (R9, R35). Es `[D14]`.

## 2. Modelo de datos

### 2.1. Las dos columnas y las dos claves candidatas

```
suppliers.company_id              UUID NOT NULL  REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE
supplier_catalog_lines.company_id UUID NOT NULL  REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE

ALTER TABLE "suppliers"     ADD CONSTRAINT "suppliers_company_id_id_key"     UNIQUE ("company_id", "id");
ALTER TABLE "presentations" ADD CONSTRAINT "presentations_company_id_id_key" UNIQUE ("company_id", "id");
```

- **Obligatorias** (R1, R2). No hay «proveedor de sistema» que justifique la columna opcional de
  QC-76.
- `ON DELETE RESTRICT`: `companies` tiene borrado lógico (QC-47), así que R34 se cumple sin hacer
  nada; el `RESTRICT` deja escrito que un borrado físico no puede dejar filas huérfanas.
- **La línea sí lleva columna propia** `[D1]`, y aquí la ficha **se aparta a conciencia de QC-50 D2**.
  El motivo no es de gusto: la columna es el **origen** de las dos FK compuestas, y sin ella no se
  pueden escribir. Y eso **elimina** el riesgo que motivó QC-50 D2 —dos datos que pueden
  contradecirse— en vez de esquivarlo: la FK de §2.2 lo hace **imposible** en la base. Es el mismo
  razonamiento con el que QC-49 dio columna propia al lote (`product_batches`) y lo ató con
  `product_batches_check_company`, solo que aquí se consigue **declarativamente** y sin disparador.
- En `db/schema.prisma` las dos columnas van como **escalar sin `@relation`**, como `createdBy`/
  `updatedBy` y por el mismo motivo que ya escribe su `///`: con `@relation`, el cliente Prisma
  dejaría hacer `include: { company: true }` desde `proveedores` —una lectura de `identity` que
  ninguna guardia de imports ve—. **Las dos FK a `companies` van escritas a mano y son drift** (R12,
  riesgo 1 de §12).
- Las **dos claves candidatas sí se declaran** en el esquema (`@@unique([companyId, id], map: …)`):
  son **totales**, Prisma las modela sin problema, y declararlas evita que `migrate dev` proponga
  borrarlas. Precedente literal: `orders_id_company_id_key` (`schema.prisma:504`).

### 2.2. Las dos claves foráneas compuestas, que son el corazón de la ficha

```sql
ALTER TABLE "supplier_catalog_lines"
  ADD CONSTRAINT "supplier_catalog_lines_company_id_supplier_id_fkey"
  FOREIGN KEY ("company_id", "supplier_id") REFERENCES "suppliers"("company_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_catalog_lines"
  ADD CONSTRAINT "supplier_catalog_lines_company_id_presentation_id_fkey"
  FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations"("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

- La primera (R4, `[D2]`) hace **imposible** que la empresa de la línea contradiga la de su
  proveedor. `ON DELETE CASCADE` para no cambiar el comportamiento que ya tiene
  `supplier_catalog_lines_supplier_id_fkey`, que **se conserva**: las dos conviven, como conviven en
  `order_assignments` la FK simple y la compuesta. Conservar la simple no es redundancia inútil —es
  la que Prisma conoce por `@relation` y la que sostiene el `include`/`supplier: { … }` del
  adaptador—.
- La segunda (R5, `[D3]`) hace **imposible** que una línea apunte a una presentación de otra empresa,
  **sin un solo `SELECT`** y sin reabrir el acoplamiento que QC-52 cortó `[D4]`. `ON DELETE RESTRICT`
  para conservar el comportamiento de `supplier_catalog_lines_presentation_id_fkey`, que también se
  conserva.
- **`presentations.company_id` ya es `NOT NULL`** desde QC-49, así que la FK compuesta puede ser
  estricta sin `MATCH` raros y sin columnas anulables que la dejarían pasar.
- **Nada de disparadores.** QC-49 necesitó plpgsql para «el lote es de la empresa de su producto»
  porque tenía tres tablas en juego; aquí la relación es de dos y la base la expresa
  **declarativamente**. Es la alternativa **B** de §11, con su porqué.

### 2.3. El relevo del índice único de nombre — y **sigue siendo parcial**

```sql
-- fuera el GLOBAL parcial de QC-42
DROP INDEX "suppliers_name_unique";

-- la unicidad pasa a medirse dentro de la empresa, y SIGUE SIENDO PARCIAL (R14, R15)
CREATE UNIQUE INDEX "suppliers_company_name_unique"
  ON "suppliers" ("company_id", "name_normalized")
  WHERE "deleted_at" IS NULL;
```

**El `WHERE "deleted_at" IS NULL` no es opcional y es la trampa de esta ficha.** El molde de QC-49 en
`presentations` era **total** —`presentations` no tiene `deleted_at`— y copiarlo aquí haría que dar de
baja un proveedor dejara su nombre **ocupado para siempre**, **sin un solo test en rojo**. §8.4 lo
afirma desde tres ángulos independientes y exige que los tres sean falsables.

- **No hace falta `suppliers_company_id_idx` aparte** (R13): la clave candidata
  `suppliers_company_id_id_key` de §2.1 lleva `company_id` **de cabeza** y es **total**, así que sirve
  también para la verificación del `RESTRICT` sobre proveedores dados de baja —cosa que el único de
  nombre, por parcial, **no** haría—. Es una ventaja real del orden de columnas de `[D5]`.
- **Prisma sigue sin poder modelarlo**: es parcial, así que **no** se declara `@@unique` para el
  nombre y el índice vive **solo** en el `migration.sql`, igual que hoy.
- En `supplier_catalog_lines` se añade `@@index([companyId, supplierId], map:
  "supplier_catalog_lines_company_id_supplier_id_idx")`: cubre R13 para esa tabla —`company_id` de
  cabeza— y da índice al lado hijo de la FK compuesta de `suppliers`. El lado hijo de la FK de
  presentaciones se apoya en el `supplier_catalog_lines_presentation_id_idx` que ya existe; con una
  línea viva eso es un coste que no se paga, y queda anotado en §12.

### 2.4. Qué se declara en `db/schema.prisma` y qué no

| Modelo | Entra | NO entra |
| --- | --- | --- |
| `Supplier` | `companyId` escalar; `@@unique([companyId, id], map: "suppliers_company_id_id_key")` | ningún `@relation` a `Company`; ningún `@@unique` de nombre (es parcial); ningún `@@index([companyId])` suelto |
| `SupplierCatalogLine` | `companyId` escalar; `@@index([companyId, supplierId], …)` | **ningún `@@unique`**, ni el de la línea ni ninguno nuevo `[D8]`; ningún `@relation` nuevo |
| `Presentation` | `@@unique([companyId, id], map: "presentations_company_id_id_key")` | **ninguna columna**, ningún cambio de tipo, ningún índice más |

Los `///` de los tres modelos se amplían para nombrar lo nuevo y el drift de las FK escritas a mano.

## 3. Cómo llega el `companyId` hasta el caso de uso y el repositorio

Sin que `proveedores/domain/**` importe sesión, cookie ni `next/*`. Es la respuesta de QC-49 §4,
QC-60 §4 y QC-50 §3, verificada contra el código de esta rama.

### 3.1. El actor lo trae, y lo rellenan los dos adaptadores driving

```ts
export type Actor = {
  readonly id: string;
  readonly companyId: string;          // NUEVO
  readonly permissions: readonly string[];
};
```

Va **dentro del actor** y no como parámetro suelto de cada caso de uso: viaja siempre junto a los
permisos, así que ningún llamante nuevo puede olvidarse de pasarla ni —peor— **elegirla**.
`actor.ts` ya importa del barrel de `identity`; **no se añade ningún import nuevo**.

Los **dos** archivos de Server Actions construyen el actor con las dos caras de la sesión, **dentro
de `runInRequestScope`**, exactamente como `order-actions.ts` y `recipe-actions.ts` (QC-104):

```ts
const [sessionUser, sessionContext] = await runInRequestScope(() =>
  Promise.all([identity.getSessionUser(), identity.getSessionContext()]),
);
if (sessionUser === null || sessionContext === null) return null;   // falla cerrado (R22)
```

El ámbito envuelve **solo** ese `Promise.all`, ni una línea más. Con actor `null`,
`requirePermission` rechaza en la primera línea del caso de uso, antes de tocar ningún puerto. Las
firmas públicas de las Server Actions **no cambian** (R38).

### 3.2. El dominio traduce actor → ámbito, y los dos puertos lo exigen

Nace `lib/modules/proveedores/domain/supplier-scope.ts`, dominio puro:

```ts
/** Empresa EN CUYO NOMBRE se consulta o se escribe. No autoriza: filtra. */
export type SupplierScope = { readonly companyId: string };
```

Los **cinco** métodos de `SupplierRepository` y los **cuatro** de `SupplierCatalogRepository` ganan
`scope: SupplierScope` **al final** de la firma: el diff queda mínimo y ninguna llamada existente
cambia de orden de argumentos.

```ts
interface SupplierRepository {
  create(data: NewSupplier, actorId: string, now: Date, scope: SupplierScope): Promise<{ id: string } | 'duplicate'>;
  findAliveById(id: string, scope: SupplierScope): Promise<SupplierView | null>;
  updateAlive(id: string, data: NewSupplier, actorId: string, now: Date, scope: SupplierScope): Promise<'ok' | 'not_found' | 'duplicate'>;
  softDeleteAlive(id: string, actorId: string, now: Date, scope: SupplierScope): Promise<boolean>;
  listAlive(query: ListQuery, scope: SupplierScope): Promise<Page<SupplierView>>;
}

interface SupplierCatalogRepository {
  create(data: NewCatalogLine, actorId: string, now: Date, scope: SupplierScope): Promise<{ id: string } | 'duplicate' | 'supplier_not_found'>;
  replaceAlive(id: string, data: CatalogLineFields, actorId: string, now: Date, scope: SupplierScope): Promise<'ok' | 'not_found' | 'duplicate'>;
  softDeleteAlive(id: string, actorId: string, now: Date, scope: SupplierScope): Promise<boolean>;
  listBySupplierAlive(supplierId: string, query: ListQuery, scope: SupplierScope): Promise<Page<CatalogLineView> | 'supplier_not_found'>;
}
```

Los resultados discriminados **no crecen**: «de otra empresa» se devuelve como `null`, `false`,
`'not_found'` o `'supplier_not_found'`, o sea por el mismo camino que «no existe», que es justo lo que
R26, R27 y R28 piden. El dominio no necesita distinguirlos porque **no debe** distinguirlos (§10).

**Que el ámbito esté en la firma es lo que hace que una llamada que lo omita no compile** —es la
trampa 5 del encargo, y en QC-50 fue el compilador, no un test, quien atrapó al llamante nuevo de
`asignaciones`—. Por eso **no** es un parámetro opcional ni un campo con valor por defecto: es
obligatorio y va en los nueve métodos. **Una implementación que lo omita, en cambio, SÍ compila**
—TypeScript admite asignar una función de menor aridad donde se espera una de mayor, y así es como
`lib/composition/index.ts` ata las funciones sueltas del adaptador—; está verificado contra el `tsc`
de este repo por el reviewer de QC-49. Por eso la segunda mitad de R23 la cierra una **guardia
estática por función**, no el compilador (§8.1).

### 3.3. Los dos casos de uso que ganan un puerto

`create-catalog-line.ts` y `update-catalog-line.ts` ganan `units: UnitCatalog` en sus `*Deps`
(§6.1). Los otros siete casos de uso **no ganan ninguna dependencia**: solo hacen de correa —exigen
el permiso primero, validan la entrada, y pasan `{ companyId: actor.companyId }` al puerto—. Ninguno
construye condiciones de consulta.

## 4. El único punto de consulta

Nace `lib/modules/proveedores/adapters/driven/persistence/company-scope.ts`:

```ts
/** LA definicion de «de la empresa» del modulo `proveedores`. Se escribe UNA vez. */
function companyScope(scope: SupplierScope): { companyId: string } {
  return { companyId: scope.companyId };
}

export function supplierCompanyScope(s: SupplierScope): Prisma.SupplierWhereInput { return companyScope(s); }
export function catalogLineCompanyScope(s: SupplierScope): Prisma.SupplierCatalogLineWhereInput { return companyScope(s); }
export function companyScopeColumns(s: SupplierScope): { readonly companyId: string } { return companyScope(s); }
```

Las tres envolturas existen **solo para tipar**: delegan en la misma función, así que hay **una**
definición y no tres. `companyScopeColumns` hace falta porque en un `…WhereInput` la columna es
`UuidFilter | string` y **opcional**, y esparcirla dentro del `data` de un `create` no compila (mismo
argumento literal que QC-49 y QC-50). Reglas de uso, que la guardia y los tests hacen cumplir:

- **Toda lectura** compone el ámbito **al mismo nivel que `deletedAt: null`**, nunca fundido con la
  búsqueda ni con el `OR` de los filtros: en `buildSupplierWhere` y en `buildCatalogLineWhere` hay un
  `nameNormalized: { contains }` y un `AND` de filtros, y meter el `companyId` ahí dentro dejaría que
  un término de búsqueda **ampliara** lo visible (R25, R26).
- **El `count` de cada listado usa literalmente el mismo objeto `where`** que su `findMany`, como ya
  hace hoy: el total no puede describir un conjunto distinto del que se devuelve.
- **Toda escritura que apunte a una fila existente** lleva el ámbito **en el `where`**, no en un `if`
  posterior sobre la fila leída: los `updateMany` de `updateAliveSupplier`, `softDeleteAliveSupplier`,
  `replaceAliveCatalogLine` y `softDeleteAliveCatalogLine`.
- **`isSupplierAlive` también se acota**, y es el punto más fácil de olvidar: es la función que
  comparten el alta de línea y el listado del catálogo, y sin ámbito un proveedor de B seguiría
  pareciendo «vivo» para alguien de A (R26, R28).
- **Las dos altas escriben `companyId` desde `companyScopeColumns`** (R30). La empresa **no** viaja en
  `NewSupplier` ni en `NewCatalogLine` ni en sus esquemas `zod`: lo que no está en el tipo no se puede
  escribir por accidente.
- **El arrastre del catálogo en la baja del proveedor** (R29) conserva su transacción interactiva y su
  `now` único, y añade el ámbito **a las dos** sentencias. El `updateMany` de `suppliers` va primero y
  **acotado**; si devuelve `count !== 1` se sale sin tocar ninguna línea, que es exactamente lo que ya
  hace hoy con el filtro de vida.
- **El filtro por relación `supplier: { deletedAt: null }`** de `replaceAlive`/`softDeleteAlive` de
  línea gana también el ámbito **del proveedor**, no solo el de la línea: son dos comprobaciones y las
  dos importan mientras la FK compuesta no esté probada en ejecución.

**Sin lista de excepciones** (R24). Esta ficha no crea ninguna.

## 5. Las dos tablas, y por qué la línea no queda «aislada por herencia»

A diferencia de QC-50, aquí la línea **no** hereda su ámbito de su cabecera: lo lleva escrito. Eso no
duplica el riesgo, lo elimina, porque la FK compuesta de §2.2 no deja que los dos valores discrepen.
Lo que sí obliga es a acotar la línea **también por su propia columna**:

| Vía | Qué la acota |
| --- | --- |
| Listado del catálogo | `isSupplierAlive` acotada **y** el ámbito en `buildCatalogLineWhere` (R26) |
| Alta de línea | `isSupplierAlive` acotada; `companyId` escrito desde `companyScopeColumns`; FK compuesta de respaldo (R28, R30, R4) |
| Edición y baja de línea | `updateMany` con ámbito de línea **y** de proveedor (R28) |
| Baja del proveedor | arrastre acotado, misma transacción, mismo `now` (R29) |
| Borrado físico del proveedor | `ON DELETE CASCADE`, conservado y sin cambios |

## 6. Las costuras: la que nace y la que no

### 6.1. `UnitCatalog.findRefs` — la única costura de código nueva `[D6]`

```ts
// ya existe, ya acotada desde QC-50: unidades NO se toca
findRefs(ids: readonly UnitId[], companyId: string): Promise<readonly UnitRef[]>;
```

- Los dos casos de uso de escritura de línea reciben `units: UnitCatalog` y, **solo cuando la entrada
  trae unidad** —`unitId` es anulable y la ausencia es un valor válido—, llaman
  `units.findRefs([unitId], actor.companyId)`. Si la respuesta viene vacía, `ValidationError`
  (R18): es entrada que no cuadra, no un permiso que falta, y es el mismo camino por el que hoy se
  rechaza una referencia inválida.
- La semántica «de sistema **o** de la empresa» **no se reescribe aquí**: la pone
  `companyScopeWhere`, la única definición de `unidades`, dentro de `unit-catalog-prisma.ts` (R19).
  `proveedores` **no** consulta `prisma.unit` ni conoce ese `OR`.
- **Por qué en el service y no en la base**: una FK compuesta **no puede** expresar «la de sistema o
  la mía». Con `company_id` en la línea, `(company_id, unit_id) → units(company_id, id)` rechazaría
  **toda** unidad de sistema, que es justo lo que QC-76 hizo posible al dejar la empresa opcional en
  `units`. Está en `[D6]` y es la alternativa **C** de §11.
- **Coste medido y aceptado**: es **una consulta más** de `proveedores` hacia `unidades` en el alta y
  en la edición de línea, y roza el espíritu de QC-52 aunque no su letra —QC-52 cortó el vínculo con
  `inventario`, no con `unidades`—. Con el dato de hoy, la única línea viva usa una **unidad de
  sistema** y no deja de resolverse.
- **Cableado**: `lib/composition/index.ts` pasa el `unitCatalog` que **ya construye** a las dos
  factories. No se crea ninguna constante nueva y no se reordena ni se reformatea nada del archivo,
  mismo criterio que QC-60 y QC-50.

### 6.2. `inventario`: la costura que **no** nace `[D4]`

No hay puerto, no hay import, no hay consulta. `create-catalog-line.ts:13-28` ya lo explica y su
docblock **se amplía** —con sus propias palabras, sin citar fichas ni requisitos (§13)— para decir que
la coherencia de empresa de la presentación la pone ahora la **clave foránea compuesta**, no una
pregunta a otro módulo. La decisión 3 de QC-52 queda **intacta** y R20 la fija.

### 6.3. La colisión que esa costura provoca, y cómo se **retensa** en vez de relajarse

`tests/unit/proveedores/scope.test.ts:83` guarda la marca `{ nombre: 'llamada a findRefs', pattern:
/\bfindRefs\b/ }` y la aplica a **todo** `lib/modules/proveedores/**`. Se escribió para cazar
`ProductCatalog.findRefs`, pero la palabra es genérica: en cuanto los dos casos de uso llamen a
`units.findRefs`, esa marca se pone **roja por un vínculo que no existe**. Es un **falso positivo**
del barrido por palabra, exactamente de la misma familia que el que QC-50 corrigió en su
`scope.test.ts`.

**No se borra la marca y no se añade una lista de excepciones.** Se sustituye por una comprobación
**más estricta**, en dos mitades:

1. la marca de inventario pasa de la palabra suelta a la forma real del vínculo:
   `/\b(products|productCatalog)\s*\.\s*findRefs\b/` **además** de la marca de tipo
   `/\bProduct(Catalog|Ref|Id)\b/`, que ya existe y sigue cazando cualquier retorno del contrato;
2. entra una marca **nueva y positiva**: el **único** receptor de `findRefs` admitido en el módulo es
   `units`, nombrado literalmente. Cualquier otro receptor —`products`, `recipes`, `deps.catalog`— es
   un hallazgo.

Antes había una puerta abierta a cualquier `findRefs` mal escrito con tal de que no se llamara
`findRefs`; ahora el conjunto permitido es **uno y con nombre**. Se comprueba falsable: escribiendo a
mano un `products.findRefs(...)` en un archivo del módulo, el caso se pone rojo.

## 7. La migración

Una migración nueva, `db/migrations/<ts>_suppliers_company_scope/`, con `migration.sql` y `down.sql`
(R10). **Escrita entera a mano**, no generada por `prisma migrate dev`: las dos tablas cargan con FK
escritas a mano, cuatro `CHECK`, dos índices únicos parciales, índices GIN de trigramas y RLS
forzada, todo lo cual `migrate dev` lee como drift y propone resetear una base con datos. Mismo motivo
y mismas palabras que QC-49, QC-76, QC-81, QC-60 y QC-50. Se aplica con `pnpm run db:migrate`
(`prisma migrate deploy`), que no mira drift.

### 7.1. UP, en orden

| # | Paso | Por qué ahí |
|---|---|---|
| 0 | `NO FORCE ROW LEVEL SECURITY` en `suppliers`, `supplier_catalog_lines`, `presentations` y `companies` | **La mina de QC-49**: están `ENABLE`+`FORCE` **sin ninguna policy**, y bajo `FORCE` eso deniega también al dueño —con quien conecta Prisma—, incluido el `SELECT`. Esta migración lee `companies` y `presentations` y escribe las dos del módulo. Se cierra en el paso 8 |
| 1 | `ADD COLUMN "company_id" UUID` **anulable** en las dos tablas | No hay `DEFAULT` que poner que no sea mentira |
| 2 | **Backfill de `suppliers`** (R7) | La empresa se resuelve por `name_normalized = 'quimicloud'`, **nunca por identificador**: los uuid los genera `gen_random_uuid()` y difieren en cada base. Único fallback: que `companies` tenga exactamente **una** fila. Cualquier otro caso —cero, o varias sin la de nombre— `RAISE EXCEPTION`. **Todas** las filas, incluidas las de `deleted_at`. `ROW_COUNT` contra el total de la tabla. **Ningún `INSERT`, ningún `DELETE`** (R8) |
| 3 | **Backfill de `supplier_catalog_lines`**: la empresa **de su proveedor**, con un `UPDATE … FROM "suppliers"` | Derivarla del proveedor y no repetir la resolución por nombre es lo que garantiza que R4 se cumple **desde la primera fila**: no hay ventana en la que exista una línea cuya empresa discrepe de la de su proveedor. `ROW_COUNT` contra el total |
| 4 | **Guardia de presentaciones**: `RAISE EXCEPTION` si alguna línea apunta a una presentación de otra empresa | Imposible con el dato de hoy —la única línea viva es de QuimiCloud y su presentación también—, pero se escribe igual: el mensaje dice **cuántas filas** y **qué hacer**, en vez de un `23503` suelto. Calcado de QC-81 §2.1 y QC-60 §7.1 |
| 5 | `SET NOT NULL` en las dos columnas | Llegar aquí significa que no queda ninguna fila sin valor |
| 6 | Las **dos claves candidatas** `(company_id, id)`, y después las **dos FK simples** a `companies` y las **dos FK compuestas** | Las candidatas **antes** que las compuestas: Postgres exige que el destino exista. Las compuestas **después** del paso 4, por lo mismo |
| 7 | Guardia + relevo del índice único de nombre (§2.3) | Antes del `CREATE UNIQUE`, un `RAISE EXCEPTION` si dos proveedores **vivos** de la misma empresa comparten `name_normalized` —imposible hoy, porque el único global aún vive—. Después: `DROP INDEX suppliers_name_unique` y `CREATE UNIQUE INDEX suppliers_company_name_unique … WHERE deleted_at IS NULL`. Y el `@@index` compuesto de la línea |
| 8 | `ENABLE` + `FORCE ROW LEVEL SECURITY` en las cuatro | Cierra el paréntesis del paso 0. Explícito e idempotente (R9) |

Todo ocurre dentro de la **única transacción** en la que Prisma ejecuta el archivo: cualquier
`RAISE EXCEPTION` deshace el archivo entero y la migración queda sin aplicar y **sin marcar** en
`_prisma_migrations`.

### 7.2. Sobre la base vacía

**Ninguna sentencia de este archivo puede abortar por tabla vacía**, y no es un efecto colateral:
`tests/helpers/test-database.ts` tolera **una sola** migración fallida al construir la plantilla, la
de QC-49, y si ésta también fallara la construcción se caería entera. Con cero proveedores: los dos
backfills actualizan cero filas y `0 = 0` cumple la comprobación; los `SET NOT NULL` pasan; los
índices y las claves se crean vacíos. **Pero el paso 2 sí aborta si no puede resolver la empresa**,
exactamente como QC-49, QC-60 y QC-50 — y por eso la plantilla siembra la empresa inicial antes de
migrar lo que queda. La migración de esta ficha es **posterior** a la de QC-49, así que se aplica con
«QuimiCloud» ya sembrada.

### 7.3. DOWN — y por qué **tiene que abortar entero**

Revierte en orden inverso y deja el esquema exacto anterior, **con el índice único global y parcial
restaurado** (R10). Lo primero del archivo, tras abrir el mismo paréntesis de RLS del UP —su guardia
**lee** las tablas, que bajo `FORCE` sin policy también están denegadas; es la lección que QC-49 tuvo
que corregir en revisión—, es la **guardia de datos** (R11):

1. **Identificar la empresa que escribió el UP**, con el mismo criterio del backfill; si es ambigua,
   abortar.
2. **Alguna fila de `suppliers` o de `supplier_catalog_lines` cuya empresa no sea ésa** → abortar:
   quitar las columnas convertiría las filas de varias empresas en un único montón indistinguible.
3. **Dos proveedores vivos de empresas distintas con el mismo nombre normalizado** → abortar. Recrear
   el índice único **global** es imposible si dos empresas tienen cada una su «Químicos del
   Pacífico», y con 48 empresas eso deja de ser hipotético en cuanto la segunda dé de alta un
   proveedor. La alternativa —renombrar, o borrar la fila que estorba— **descartaría dato de un
   cliente en silencio**, que es peor que no poder revertir. Precedente literal: QC-49 R7 y QC-50 R7.

Los tres mensajes dicen **cuántas filas** y **qué hacer**, no solo que falló. Después, en este orden,
que **no es negociable**: las **dos FK compuestas** fuera → las dos FK simples a `companies` fuera →
las **dos claves candidatas** fuera (no antes: Postgres no deja borrar una clave única referenciada,
y es el error que QC-60 dejó escrito en su `down.sql:146`) → `DROP INDEX
suppliers_company_name_unique` → `CREATE UNIQUE INDEX suppliers_name_unique … WHERE deleted_at IS
NULL` → el `@@index` compuesto fuera → las dos columnas fuera → `ENABLE` + `FORCE`. **Ninguna fila se
borra**: el archivo no tiene un solo `DELETE`. `pnpm run db:rollback` lo aplica y deja
`_prisma_migrations` coherente.

## 8. Verificación

### 8.1. La segunda mitad de R23: guardia estática por función

`tests/guards/guard-ambito-empresa-proveedores.test.ts` (nueva), calcada de
`guard-ambito-empresa-recetas.test.ts` y `guard-ambito-empresa-pedidos.test.ts`: **método a método**
de `SupplierRepository` y de `SupplierCatalogRepository` —y función a función de todo
`proveedores/adapters/driven/persistence/`— comprueba que la implementación **declara**
`scope: SupplierScope` y que ese valor **llega hasta** una envoltura de `./company-scope`.
Comprueba además, explícitamente, que **`isSupplierAlive`** —que no es método de ningún puerto y por
eso podría escaparse— lo declara y lo compone. **Sin lista de excepciones** (R24).

### 8.2. Los tres niveles

1. **Integración contra Postgres**: rechazo cruzado real de las once operaciones, cada una con su
   control positivo; las **dos FK compuestas** rechazando de verdad —línea con empresa distinta de la
   de su proveedor, y línea con presentación de otra empresa—, con el `SQLSTATE` y el nombre de la
   restricción; el mismo nombre de proveedor en dos empresas **se acepta**, dos veces en una
   **choca**, y la baja **libera** el nombre; los dos backfills; la reversión abortada por cada una de
   sus causas; el `23505`/`P2002` auténtico con el índice compuesto y su `meta.target` (§0.8, R16).
2. **Unit con dobles**: los nueve casos de uso, el orden permiso → zod → puertos, y que «de otra
   empresa» sale como inexistente y **jamás** como `unauthorized`; unidad ajena → entrada inválida;
   unidad de sistema y unidad propia → aceptadas; ausencia de unidad → aceptada; la empresa de la
   entrada se descarta; `classifyForeignKeyViolation` con los **nombres nuevos** de las dos
   restricciones compuestas (§0.9).
3. **Guardias**: la de §8.1, `guard-rls-force`, `guard-arquitectura-modulos`,
   `guard-dependencias-aprobadas`, `guard-aislamiento-integracion`, `guard-identificador-de-request` y
   la del catálogo de errores.
4. **E2E** (R37, `[D17]`), uno solo: `e2e/aislamiento-proveedores.spec.ts`.

### 8.3. El E2E, y por qué aquí **sí** sirve el molde de QC-49/QC-60

En `recetas` el diálogo de borrado toma el id del **cierre de React** y por eso QC-50 tuvo que
cambiar el recorrido. **En `proveedores` no**: `app/(private)/proveedores/components/delete-supplier-dialog.tsx:124-125`
lleva un `<input type="hidden" name="id">` que viaja en el `FormData`, igual que
`delete-product-dialog.tsx:106` y `delete-order-dialog.tsx:128`. Así que el spec hace **las dos
cosas**, y las dos son gestos reales:

1. con sesión en A, el listado no contiene el proveedor de B (aserción sobre el HTML servido);
2. navegar a `/proveedores/<id de B>` no lo enseña y el resultado es **idéntico** al de un
   identificador inexistente —mismo mensaje, mismo enlace—, que es lo que prueba que no hay **oráculo
   de existencia**;
3. se abre el diálogo de borrado de un proveedor **propio** y se sustituye por DOM el valor del campo
   oculto por el id del proveedor **de B**: la baja se rechaza y, comprobado con Prisma, el proveedor
   de B sigue con `deleted_at` nulo **y su línea también**;
4. un alta en A con el **mismo nombre** que un proveedor de B se completa sin error.

**Ningún componente se toca** (§14): el campo oculto ya existe y el spec lo localiza por
`input[name="id"]` dentro del diálogo, o por su `data-testid` si lo tiene. Patrón, fixture, prefijo
por worker, limpieza defensiva y **una sola sesión real** (la de A) como en
`e2e/aislamiento-inventario.spec.ts`; el aterrizaje del login sale del helper único de QC-93.

### 8.4. La parcialidad del único, afirmada tres veces y las tres falsables (R15)

| Ángulo | Dónde | Cómo se comprueba falsable |
| --- | --- | --- |
| **Texto del SQL** | `tests/unit/proveedores/schema/suppliers-company-scope-migration.test.ts` | el predicado se evalúa sobre el archivo real (verdadero) y sobre una copia **en memoria** sin el `WHERE` (falso) |
| **Predicado exacto del índice** | `tests/integration/inventario/list-query-indexes.int.test.ts` | contra `pg_indexes`, exigiendo `WHERE (deleted_at IS NULL)` literal y no un `WHERE` genérico; falsabilidad con dos índices scratch, uno total y otro parcial |
| **Comportamiento** | `tests/integration/proveedores/company-scope.int.test.ts` | dar de baja **libera** el nombre para su empresa, y volver a darlo de alta funciona |

Las tres tienen que ser **independientes**: si una sola se apoyara en otra, la trampa volvería a
poder colarse sin un test en rojo.

### 8.5. Las listas cerradas, una por una

Las **catorce** de §0.10 más el censo de `aislamiento.json`, **cada una con su task explícita**
(bloque 3 de `tasks.md`). No se dan por hechas como efecto colateral de otra task: una lista cerrada
que se actualiza «de paso» es exactamente cómo QC-60 y QC-50 se dejaron varias hasta el gate. Y las
tres familias que comparan el **diff contra `origin/dev`** (§0.11) tienen **su propia task después del
primer commit**, porque antes del commit pasan en verde y no prueban nada.

## 9. Errores: nada nuevo en el catálogo

| Caso | Código | Por qué |
| --- | --- | --- |
| Ficha / edición / baja de un proveedor de otra empresa | el «el proveedor no existe» de QC-70 (`SupplierNotFoundError`) | Ya existe y su mensaje es exactamente el que hay que dar |
| Línea de otra empresa, o de un proveedor de otra empresa | `CatalogLineNotFoundError` / `SupplierNotFoundError`, los que ya usa | Mismo criterio: «de otra empresa» y «no existe» son el mismo desenlace |
| Unidad de otra empresa en una línea | `invalid_input` (`ValidationError`) | Es entrada que no cuadra, no un permiso que falta |
| Nombre repetido dentro de la empresa | `SupplierDuplicateNameError` | Ya existe; lo único que cambia es el alcance de la unicidad |
| Presentación de otra empresa | hoy **`unexpected`**, por §0.9 | La base rechaza; el conector no dice qué restricción, así que el error se relanza crudo. Declarado, no inventado, y sin código nuevo |

**Nunca `unauthorized`.** Distinguir «no puedes» de «no existe» sobre datos ajenos es un oráculo de
existencia: quien sondea identificadores aprendería qué proveedores tienen las demás empresas. Es el
mismo criterio con el que la zona privada responde 404 y no 403
(`docs/architecture.md > Permisos y autenticacion`). **No se añade ninguna fila a `ERROR_CODES`**.

## 10. Dependencias de terceros

**Ninguna nueva** (R39). Esto es esquema, migración, dos claves candidatas, dos claves foráneas
compuestas, una definición de ámbito y un campo más en un tipo: no hay nada que una librería
mantenida resuelva mejor, y todo lo que hace falta —`@prisma/client`, `pg` para los tests, `zod`,
Playwright— está en el repo. Regla 7 de `CLAUDE.md` **sin propuesta que abrir**: no hay cuatro checks
de salud que reportar ni fila que añadir a `docs/dependencias.md`; `package.json` y `pnpm-lock.yaml`
quedan sin tocar y `guard-dependencias-aprobadas` sigue verde sin cambios. **Si alguna task acabara
pidiendo una, se para y se propone: no se instala**
(`docs/architecture.md > Dependencias de terceros`).

## 11. Alternativas descartadas

**A) No dar columna de empresa a `supplier_catalog_lines` y heredarla de su proveedor, copiando
QC-50 D2.** Es el molde inmediatamente anterior y evitaría una columna. **Descartada por `[D1]`**, y
además es **inviable**: sin columna en la línea no hay nada que poner en el **origen** de las dos
claves foráneas compuestas de `[D2]` y `[D3]`, y sin ellas la presentación ajena solo se podría
rechazar preguntándole a `inventario` —que es exactamente lo que `[D4]` prohíbe—. Donde QC-50
*esquivaba* el riesgo de dos datos contradictorios no teniendo el segundo, esta ficha lo *elimina*
haciéndolo imposible en la base.

**B) Un disparador plpgsql de coherencia, como `product_batches_check_company` de QC-49.** «La empresa
de la línea es la de su proveedor y la de su presentación», con `RAISE EXCEPTION`. Tiene precedente
literal en el repo. **Descartada**: aquí la relación es de **dos** tablas y Postgres la expresa
**declarativamente** con una FK compuesta, que es más barata de leer, imposible de desincronizar y no
hay que mantener. QC-49 necesitó el disparador porque comparaba **tres** tablas a la vez; aquí sería
código donde basta una restricción.

**C) Validar la unidad también con una FK compuesta `(company_id, unit_id) → units(company_id, id)`,
por simetría con la presentación.** Sería «todo en la base» y ninguna consulta nueva. **Descartada, y
no por gusto: es imposible.** `units.company_id` es **anulable** desde QC-76 —así existen las
unidades de sistema—, y una FK compuesta contra una columna anulable **rechazaría toda unidad de
sistema** para una línea que sí tiene empresa. `[D6]` lo dice con esas palabras y la única línea viva
usa precisamente una unidad de sistema: la habría roto el primer día.

**D) Crear el índice compuesto del nombre SIN el `WHERE deleted_at IS NULL`,** copiando literalmente
el de presentaciones de QC-49. **Descartada**: el de presentaciones era total porque `presentations`
no tiene borrado lógico. Aquí quitaría la liberación del nombre al dar de baja (R14) **en silencio**,
que es justo la trampa que QC-50 cazó y que §8.4 vigila desde tres ángulos.

**E) Reordenar las claves candidatas a `(id, company_id)`, como `orders_id_company_id_key`.** Sería
literalmente el patrón del repo. **Descartada por `[D5]`**, que dice `(company_id, id)` — y además el
orden de la decisión es el bueno aquí: deja `company_id` de cabeza, así que la misma clave sirve de
índice de la columna de empresa (R13) y, por ser **total**, también para la verificación del
`RESTRICT` sobre filas dadas de baja, cosa que el único de nombre no puede por ser parcial. Para el
emparejamiento de la FK el orden es indiferente.

**F) Implementar el aislamiento con policies de RLS y `set_config('app.company_id', …)` por
petición.** La respuesta canónica en Supabase. **Descartada entera**: Prisma conecta con el dueño de
las tablas, no setea claims, y el pooler en modo transacción no garantiza que el `set_config` y la
consulta caigan en la misma sesión física. Además `[D12]` y
`docs/architecture.md > Acceso a datos y autorizacion` ya lo tienen cerrado: **un aislamiento que
solo existe como policy no cuenta como implementado**. La RLS se queda como defensa en profundidad
(R9, R35).

**G) Repetir el filtro en cada una de las once consultas.** Es lo que sale solo si nadie decide nada.
**Descartada por `[D13]`**: la consulta número doce —la que escriba otra ficha dentro de tres
semanas— se olvida, y le enseña a una empresa lo que no es suyo.

**H) Una extensión del cliente Prisma (`$extends`) que inyecte el `where` globalmente.** Cero cambios
en el adaptador. **Descartada** con los dos argumentos que QC-49, QC-60 y QC-50 dejaron en pie: es
**implícita** —la consulta filtra por algo que no está escrito en el archivo que la escribe— y es
**global**, así que alcanzaría a módulos que esta ficha no toca.

**I) Hacer el ámbito un parámetro opcional (`scope?: SupplierScope`) para que el diff sea menor.**
**Descartada, y es la trampa 5 del encargo**: en QC-50 al llamante nuevo de `asignaciones` lo atrapó
el **compilador**, no un test, precisamente porque el parámetro era obligatorio. Opcional, ese
llamante habría compilado y habría leído datos de otra empresa hasta que alguien lo notara.

**J) Pasar las imágenes de las líneas a enlaces privados y meter la empresa en la ruta.** Es lo que
haría un aislamiento «completo». **Descartada por `[D9]`**, que es del humano y es explícita: son
material de referencia comercial, la empresa en la ruta no aislaría nada por sí sola, y hoy hay **0
líneas con imagen**. R32 lo fija para que nadie lo «arregle» de paso.

**K) Publicar una costura `SupplierCatalog` «ya que estamos», para que otros módulos resuelvan
proveedores.** **Descartada por `[D18]` y por `docs/architecture.md`**: hoy **nadie** lee
`proveedores` desde fuera, y preparar infraestructura «por si acaso» está prohibido. El día que un
módulo la necesite, nace con su ficha y con su ámbito en la firma.

## 12. Riesgos y costes aceptados

1. **Drift de Prisma, ampliado.** Las dos FK a `companies`, las dos FK compuestas y el índice único
   parcial viven escritos a mano en el SQL. Toda migración futura de estas tablas hay que revisarla y
   borrarle los `DROP` que genere. Los `///` lo avisan y esta ficha los amplía.
2. **Una presentación de otra empresa da hoy `unexpected` y no `invalid_input`** (§0.9). Declarado,
   con el porqué; mejora sola en cuanto el conector diga el nombre de la restricción. **Sin ficha
   destinataria**: es una limitación del conector, no deuda de este repo.
3. **El lado hijo de la FK compuesta de presentaciones se apoya en el índice simple que ya existe**
   (§2.3). Con una línea viva no se paga; el día que el volumen lo pida, un índice compuesto es una
   línea.
4. **Los índices de listado no se recomponen** con `company_id` de cabeza. Decisión de volumen, no de
   corrección; mismo criterio que QC-49 §2.2, QC-60 §2.2 y QC-50 §12.
5. **El backfill depende de que exista «QuimiCloud»**. Sobre una base sin ella y con varias empresas,
   aborta entera y con mensaje: es lo que R7 pide, pero conviene saberlo antes de aplicarla en un
   entorno nuevo.
6. **Las imágenes siguen siendo públicas** (`[D9]`, R32). Quien tenga la URL de una imagen de otra
   empresa la sigue viendo. Declarado, no cerrado, y **sin ficha destinataria**.
7. **Una consulta más hacia `unidades`** en el alta y la edición de línea (§6.1). Es el precio
   explícito de `[D6]` y está medido: una línea viva, con unidad de sistema.
8. **El residuo de empresas de tests sigue creciendo** (48 el 2026-09-15). No afecta a los backfills
   —solo QuimiCloud tiene proveedores—, pero QC-77 sigue sin limpiarlo.

## 13. Comentarios en el código de producción

Nada de citar `QC-<n>`, `R<n>` ni `design.md` en el código que esta ficha escriba o modifique
(`docs/conventions.md > Comentarios`): el porqué se explica con sus propias palabras, y la
trazabilidad vive en el spec y en los **nombres de los tests** —donde `R<n>` sí va—. **Los
comentarios que ya existen en archivos que esta ficha toca no se reescriben en masa**: solo se
corrigen los que esta feature deja mintiendo —el de `create-catalog-line.ts` sobre quién garantiza la
coherencia de la presentación, y el de `MARCAS_DE_INVENTARIO` sobre `findRefs`—.

## 14. UI

No hay pantalla nueva ni cambio visual: la lista bajo `SUPPLIERS_ROUTE` y el detalle
`SUPPLIERS_ROUTE/[id]` ven menos filas, nada más. **No se toca ningún componente** (R38), y en
particular **no se toca `delete-supplier-dialog.tsx`**: su campo oculto ya existe y el E2E lo usa tal
cual. No aplica la regla multiplataforma más allá de lo que las dos pantallas ya cumplen.
