# QC-24 — modelo-recetas · bitácora de implementación

> Zona `backend` · rama `feature/QC-24-modelo-recetas` · worktree
> `.worktrees/QC-24-modelo-recetas/` · spec aprobado por el humano el 2026-09-02.
>
> Tasks T0–T12 y T14 completadas. **T13 (`./init.sh` completo + merge con `dev`) NO la corrí**:
> por la regla del gate (`AGENTS.md > Regla del gate`) el gate completo lo corre el leader al
> recibir el trabajo. Aquí solo se corrieron `typecheck`, `lint` y los tests de los archivos de
> esta feature.

## Archivos creados

| Archivo | Task |
| --- | --- |
| `db/migrations/20260902163256_recipes_and_recipe_lines/migration.sql` | T2 |
| `db/migrations/20260902163256_recipes_and_recipe_lines/down.sql` | T3 |
| `lib/modules/recetas/index.ts` | T4 |
| `lib/modules/recetas/domain/recipe-name.ts` | T4 |
| `lib/modules/recetas/ports/.gitkeep` | T4 |
| `lib/modules/recetas/adapters/driven/.gitkeep` | T4 |
| `lib/modules/recetas/adapters/driving/.gitkeep` | T4 |
| `lib/modules/inventario/domain/product-catalog.ts` | T5 |
| `tests/unit/recetas/schema/recetas-schema.test.ts` | T7 |
| `tests/unit/recetas/schema/recetas-migration.test.ts` | T8 |
| `tests/unit/recetas/domain/recipe-name.test.ts` | T9 |
| `tests/unit/recetas/module-contract.test.ts` | T10 |
| `tests/integration/recetas/recetas-constraints.int.test.ts` | T12 |

## Archivos modificados

| Archivo | Qué cambió |
| --- | --- |
| `db/schema.prisma` | `Recipe` y `RecipeLine` **añadidos al final**. Ningún modelo existente tocado. |
| `lib/modules/inventario/index.ts` | Deja de ser `export {}`: publica `ProductId`, `ProductRef` y `ProductCatalog` **como tipos**. Cabecera reescrita (ya no dice «todavía no tiene contenido»). |
| `specs/QC-24-modelo-recetas/tasks.md` | Tasks marcadas `[x]`. |

## Archivo borrado

`lib/modules/inventario/domain/.gitkeep` — ya hay un archivo real en esa carpeta.

## Lo que NO se tocó, a propósito

- **`lib/composition/index.ts`** (T6). `git diff --stat lib/composition/` y
  `git status --short lib/composition/` salen **vacíos**. Componer es elegir qué
  implementación cumple un puerto, y esta ficha no crea ni puertos ni adaptadores
  (`design.md > 5.4`); una fachada vacía no la consumiría nadie. La forma que QC-25 tendrá que
  añadir está escrita en el diseño para que no la improvise.
- `lib/modules/identity/`, `package.json` (ninguna dependencia nueva, R32), `app/`, y las
  guardias de `tests/guards/` (ninguna necesitó cambio).

## Los cinco puntos frágiles, y cómo quedaron

1. **`recetas` es el primer módulo hexagonal creado desde cero.** Nace con la forma exacta de
   `identity`: un `index.ts` que solo reexporta de `./domain`, y `domain/` / `ports/` /
   `adapters/` como únicas carpetas. Verificado por `module-contract.test.ts` y por
   `guard-arquitectura-modulos.test.ts`.
2. **La frontera con `inventario`.** `inventario` publica `ProductCatalog` como contrato de
   solo tipos; `recetas` no menciona `prisma.product`, ni `@prisma/client`, ni ninguna ruta
   profunda a `inventario`. **Implementar `ProductCatalog` y cablearlo es de QC-25.**
3. **`lib/composition/index.ts` sin tocar.** Comprobado explícitamente, no olvidado.
4. **Las tres FK que cruzan de módulo** (`product_id`, `created_by`, `updated_by`) son
   escalares **sin `@relation`** en el esquema, con la FK escrita a mano en `migration.sql`.
   Confirmado en la base real: las tres salen en `pg_constraint` con `confdeltype` = RESTRICT.
5. **`created_by` / `updated_by` anulables**, y sus FK **no** usan `ON DELETE SET NULL`: se
   quedan en `RESTRICT`, porque `SET NULL` convertiría «al usuario lo borraron» en «no la creó
   una persona» (R33). Vigilado por un test estático y por un test de sensibilidad.

## T11 — ciclo real apply → rollback → apply (esto es lo que cierra R30 de verdad)

Las comprobaciones de esquema se hicieron con un script `pg` efímero (borrado al terminar), no
con `psql`. **Ningún paso pidió reset ni borró datos.**

### Paso 1 — `pnpm run db:migrate`

```
> prisma migrate deploy
Datasource "db": PostgreSQL database "QuimiCloude", schema "public" at "localhost:5432"
5 migrations found in prisma/migrations
Applying migration `20260902163256_recipes_and_recipe_lines`
The following migration(s) have been applied:
migrations/
  └─ 20260902163256_recipes_and_recipe_lines/
    └─ migration.sql
All migrations have been successfully applied.
```

Estado previo confirmado con `prisma migrate status`:
`Following migration have not yet been applied: 20260902163256_recipes_and_recipe_lines`.

### Paso 2 — esquema real tras aplicar

```
--- tablas de recetas en pg_tables
recipe_lines
recipes

--- tablas de identity e inventario en pg_tables
document_types · presentations · products · roles · users

--- FK (pg_constraint contype=f)
conname                        | tabla        | referencia | confdeltype | confupdtype
recipe_lines_product_id_fkey   | recipe_lines | products   | r           | c
recipe_lines_recipe_id_fkey    | recipe_lines | recipes    | c           | c
recipes_created_by_fkey        | recipes      | users      | r           | c
recipes_updated_by_fkey        | recipes      | users      | r           | c

--- CHECK constraints
recipe_lines_quantity_positive | recipe_lines | CHECK ((quantity > (0)::numeric))

--- indices (pg_indexes)
recipe_lines_pkey                     | CREATE UNIQUE INDEX ... USING btree (id)
recipe_lines_product_id_idx           | CREATE INDEX ... USING btree (product_id)
recipe_lines_recipe_id_product_id_key | CREATE UNIQUE INDEX ... USING btree (recipe_id, product_id)
recipes_created_by_idx                | CREATE INDEX ... USING btree (created_by)
recipes_name_unique                   | CREATE UNIQUE INDEX recipes_name_unique ON public.recipes USING btree (name_normalized) WHERE (deleted_at IS NULL)
recipes_pkey                          | CREATE UNIQUE INDEX ... USING btree (id)
recipes_updated_by_idx                | CREATE INDEX ... USING btree (updated_by)

--- RLS en pg_class
relname      | relrowsecurity | relforcerowsecurity
recipe_lines | true           | true
recipes      | true           | true

--- _prisma_migrations
20260806122638_users_and_roles             | aplicada
20260901220609_user_login_lockout          | aplicada
20260902005510_products_and_presentations  | aplicada
20260902132253_user_must_change_credential | aplicada
20260902163256_recipes_and_recipe_lines    | aplicada
```

Las **cuatro** FK con el `confdeltype` esperado (`c` = CASCADE solo en receta→línea, `r` =
RESTRICT en las tres escritas a mano), el `CHECK`, el índice único con su
`WHERE (deleted_at IS NULL)` visible en `indexdef`, y RLS **activado y forzado** en las dos
tablas.

### Paso 3 — `pnpm run db:rollback`

```
> tsx scripts/db-rollback.ts
db:rollback: aplicando down.sql de 20260902163256_recipes_and_recipe_lines y borrando su fila de _prisma_migrations
db:rollback: 20260902163256_recipes_and_recipe_lines revertida.
```

### Paso 4 — esquema real tras revertir

```
--- tablas de recetas en pg_tables        -> (vacio)
--- tablas de identity e inventario       -> document_types · presentations · products · roles · users
--- FK de recipes y recipe_lines          -> (vacio)
--- CHECK constraints                     -> (vacio)
--- indices                               -> (vacio)
--- RLS en pg_class                       -> (vacio)
--- _prisma_migrations
20260806122638_users_and_roles             | aplicada
20260901220609_user_login_lockout          | aplicada
20260902005510_products_and_presentations  | aplicada
20260902132253_user_must_change_credential | aplicada
```

Las dos tablas desaparecen con sus FK, su `CHECK`, sus índices y su RLS. Las cinco tablas de
`identity` e `inventario` siguen intactas. `_prisma_migrations` pierde **exactamente** la fila
de esta migración y conserva las cuatro anteriores: el registro queda coherente.

### Paso 5 — `pnpm run db:migrate` otra vez

```
Applying migration `20260902163256_recipes_and_recipe_lines`
All migrations have been successfully applied.
```

La comprobación posterior devuelve exactamente lo mismo que el paso 2. **La base queda con la
migración aplicada.**

## Salida real de los tests

`pnpm exec vitest run tests/unit/recetas/ tests/integration/recetas/ tests/guards/guard-rls-force.test.ts tests/guards/guard-arquitectura-modulos.test.ts tests/guards/guard-dependencias-aprobadas.test.ts`

```
 RUN  v4.1.10 C:/Users/Cristian/Documents/trabajo/arc/labs/.worktrees/QC-24-modelo-recetas

 Test Files  8 passed (8)
      Tests  128 passed (128)
   Duration  1.19s
```

Desglose por archivo (corridas individuales de cada tanda):

```
pnpm exec vitest run tests/unit/recetas/
 Test Files  4 passed (4)      Tests  48 passed (48)      Duration  390ms

pnpm exec vitest run tests/integration/recetas/
 Test Files  1 passed (1)      Tests  25 passed (25)      Duration  764ms

pnpm exec vitest run tests/guards/guard-rls-force.test.ts tests/guards/guard-arquitectura-modulos.test.ts
 Test Files  2 passed (2)      Tests  53 passed (53)
```

```
pnpm run typecheck   -> tsc --noEmit, sin salida, exit 0
pnpm run lint        -> eslint, sin salida, exit 0
```

**No se corrió la suite completa ni `./init.sh`**: los corre el leader (regla del gate).

## Mapa `R<n> → test`

Abreviaturas:
**S** = `tests/unit/recetas/schema/recetas-schema.test.ts` (19 casos) ·
**M** = `tests/unit/recetas/schema/recetas-migration.test.ts` (18 casos) ·
**N** = `tests/unit/recetas/domain/recipe-name.test.ts` (6 casos) ·
**C** = `tests/unit/recetas/module-contract.test.ts` (5 casos) ·
**I** = `tests/integration/recetas/recetas-constraints.int.test.ts` (25 casos) ·
**G1** = `tests/guards/guard-rls-force.test.ts` ·
**G2** = `tests/guards/guard-arquitectura-modulos.test.ts` ·
**G3** = `tests/guards/guard-dependencias-aprobadas.test.ts` ·
**T11** = el ciclo apply → rollback → apply de arriba.

Los 33 requisitos tienen al menos un test **ejecutado**, no solo escrito: los 128 casos de la
corrida de arriba están todos en verde.

| R | Test estático / unitario / guardia | Test contra base real |
| --- | --- | --- |
| R1 | S · «Recipe declara id uuid propio, nombre, descripcion, pasos y direccion de imagen» | I · «crea una receta con todos sus datos y los relee sin perdida» |
| R2 | S · «name es obligatorio y sin default» | I · «rechaza una receta sin nombre con SQLSTATE 23502» |
| R3 | S · «name y description son TEXT, sin varchar ni limite declarado» · M · «ninguna columna de las dos tablas declara VARCHAR(n)» | I · «acepta un nombre de 500 caracteres y una descripcion de 5000» |
| R4 | S · «steps es un unico campo Json y no existe ningun modelo de paso» | I · «guarda un documento JSON arbitrario tal cual y devuelve la lista en el mismo orden» |
| R5 | S · «steps no es opcional y declara default lista vacia» · M · «steps es JSONB NOT NULL DEFAULT lista vacia» | I · «una receta dada de alta sin pasos queda con lista vacia, no con ausencia de valor» |
| R6 | S · «image_path es la unica columna de imagen y es opcional» | I · «acepta una receta sin imagen y otra con una direccion cualquiera» |
| R7 | M · «existe CREATE UNIQUE INDEX sobre name_normalized, y el test cae si desaparece» | I · «rechaza una segunda receta con el mismo nombre normalizado con SQLSTATE 23505» |
| R8 | N · los seis casos de normalizacion e idempotencia · S · «Recipe declara name_normalized obligatorio» · C · «el barrel de recetas exporta normalizeRecipeName» | — (propiedad de una funcion pura; la base no anade informacion) |
| R9 | M · «el indice unico del nombre es PARCIAL (WHERE deleted_at IS NULL), y el test cae si se quita el WHERE» | I · «tras borrar logicamente una receta, otra puede usar su mismo nombre» |
| R10 | S · «RecipeLine declara receta, producto, cantidad y unidad como entidad propia con id» | I · «crea una linea con cantidad y unidad propias y las relee» |
| R11 | M · «existe el indice unico (recipe_id, product_id)» | I · «rechaza dos lineas del mismo producto en la misma receta con SQLSTATE 23505» |
| R12 | — | I · «acepta muchas lineas por receta y el mismo producto en dos recetas distintas» |
| R13 | S · «quantity es Decimal(14,4) obligatoria y en los dos modelos no hay ningun Float» · M · «quantity se declara DECIMAL(14,4) y el test cae si alguien lo cambia a double precision» | I · «la cantidad conserva cuatro decimales exactos y su columna es numeric(14,4)» |
| R14 | M · «recipe_lines lleva CHECK quantity mayor que 0, y el test cae si se relaja a mayor o igual» | I · «rechaza cantidad cero y negativa con SQLSTATE 23514, y cantidad ausente con 23502» |
| R15 | S · «unit de la linea es String obligatorio y no hay enum ni catalogo de unidades» | I · «acepta cualquier texto como unidad de linea y rechaza la linea sin unidad» |
| R16 | M · «las FK de recipe_id y product_id existen» | I · «rechaza una linea sin receta, sin producto, o con receta o producto inexistentes (23502 / 23503)» |
| R17 | S · «los dos modelos declaran /// @module recetas» · G2 | — |
| R18 | C · «lib/modules/recetas no contiene prisma.product, @prisma/client ni rutas profundas a inventario» · C · «@/lib/modules/inventario publica ProductCatalog» · G2 | — |
| R19 | S · «product_id, created_by y updated_by son escalares uuid SIN @relation» · M · «las tres FK que cruzan de modulo existen en el SQL con ON DELETE RESTRICT» | I · «la base rechaza un product_id y un created_by inexistentes con SQLSTATE 23503, aunque Prisma no declare la relacion» · T11 (las tres con confdeltype RESTRICT en pg_constraint) |
| R20 | C · «el modulo recetas tiene index.ts, solo carpetas domain/ports/adapters y ningun use server alcanzable desde el barrel» · G2 | — |
| R21 | S · «created_by y updated_by existen como escalares uuid» · M · «las dos FK de auditoria apuntan a users» | I · «registra autor y ultimo editor, y rechaza un autor inexistente con SQLSTATE 23503» |
| R22 | S · «Recipe declara deletedAt opcional» | I · «el borrado logico conserva la fila completa de la receta y marca deleted_at» |
| R23 | S · «Recipe y RecipeLine declaran createdAt y updatedAt» | I · «created_at y updated_at se rellenan solos y updated_at cambia al modificar, en las dos tablas» |
| R24 | S · «RecipeLine no declara deletedAt» | I · «quitar un producto de una receta elimina la fila de la linea» |
| R25 | M · «la FK recipe_lines_recipe_id_fkey es ON DELETE CASCADE, y el test cae si se cambia a RESTRICT» | I · «borrar fisicamente una receta se lleva sus lineas y no deja huerfanas» |
| R26 | — | I · «el borrado logico de una receta deja sus lineas intactas y asociadas» |
| R27 | M · «la FK a products es ON DELETE RESTRICT» | I · «un producto borrado logicamente conserva su linea» · I · «rechaza el borrado fisico de un producto usado por una linea con SQLSTATE 23503» |
| R28 | S · «las dos tablas y sus columnas mapean a snake_case en ingles» · M · «todos los identificadores creados por la migracion estan en ingles» + su test de sensibilidad | — (propiedad del texto) |
| R29 | M · «las dos tablas quedan con RLS activado y forzado» · G1 | T11 (relrowsecurity y relforcerowsecurity en true). **Sin test de RLS escrito con Prisma, a proposito**: saldria verde pase lo que pase (`design.md > 10`) |
| R30 | M · «down.sql revierte exactamente lo que crea migration.sql y no toca pgcrypto» | **T11** · ciclo apply → rollback → apply, salida pegada arriba |
| R31 | C · «la feature no anade adaptadores driving, rutas ni Server Actions» | — (no hay flujo navegable: E2E diferido con motivo, decision cerrada 17) |
| R32 | G3 · toda dependencia de `package.json` tiene su fila en el registro; `package.json` **no se tocó** | — |
| R33 | S · «created_by y updated_by son opcionales» · M · «created_by y updated_by son UUID anulables y sus FK no son ON DELETE SET NULL» | I · «crea una receta sin autor y la relee con autor ausente, no con cero ni cadena vacia» |

## Dos hallazgos que cambiaron la construcción (ninguno es un fallo del spec)

1. **El camino tipado de Prisma pierde el SQLSTATE.** La primera versión del test de
   integración usaba la API tipada para las operaciones que deben fallar y 9 de 25 salían
   rojos: `expected 'P2002' to be '23505'`, `expected 'P2003' to be '23503'`. Prisma traduce el
   SQLSTATE a su propio código antes de que llegue a `meta.code`, que es de donde lo lee el
   helper `sqlStateOf` copiado del precedente de `inventario`. Consecuencia: **toda** operación
   que se espera que la base rechace va con `$executeRaw`, no solo las que omiten una columna
   obligatoria, que era lo que decía el precedente. Queda escrito en la cabecera del archivo
   para que el próximo no lo redescubra. Los caminos felices y las lecturas siguen con la API
   tipada.
2. **La cabecera de `lib/modules/recetas/index.ts` advierte en prosa contra `use server`,
   `@prisma/client` y `next/*`.** Un barrido de `module-contract.test.ts` sobre el texto crudo
   leía la advertencia como infracción. El test descomenta antes de afirmar, mismo criterio que
   `stripComments` / `stripSqlComments` de los precedentes. La producción estaba correcta.

## Decisiones de test que conviene que el reviewer sepa

- `name_normalized` se escribe **literal** en cada caso de integración, sin importar
  `normalizeRecipeName`: si el test importara la función, un fallo del algoritmo podría dejar
  verde el test del índice único. El algoritmo lo cubre **N**, que es donde toca.
- `quantity` nunca pasa por `number`: se compara con `Prisma.Decimal` y contra el texto de la
  propia base. Convertirlo reintroduciría la coma flotante binaria que
  `docs/architecture.md > Dominio` n.º 4 prohíbe, y R13 dejaría de demostrarse.
- Los cuatro **tests de sensibilidad** que exigía T8 están, mutando el SQL en memoria y con una
  aserción previa de que la mutación se aplicó de verdad. Se añadieron variantes: relajar más
  el CHECK, invertir el predicado del índice parcial, degradar la precisión decimal, y las
  cuatro acciones de borrado alternativas en las FK.
- **C** vigila de más tres cosas útiles: que `normalizeRecipeName` esté definida **una sola
  vez** en todo `lib/` y `app/` (si QC-25 la copia en un service, R8 cae en silencio), que
  `lib/composition/**` no mencione `recetas` (T6), y que ningún fuente de `app/` mencione
  recetas todavía (R31).

## Preguntas abiertas

Las cuatro de `design.md > 9` —índice por `deleted_at`, si un nombre de receta vacío es un
nombre, si la unidad de la línea debería avisar cuando difiere de la del producto, y si
`image_path` guarda ruta relativa o URL completa— **siguen abiertas**: ninguna se resolvió
durante la implementación y ninguna bloqueaba nada. Las dos de `requirements.md` —historial de
versiones de fórmula y precisión de la cantidad— también siguen abiertas, tal cual. Las tres que
había añadido `spec_author` en F1.2 ya estaban cerradas por el humano (decisiones 20, 21 y 22) y
están implementadas: índice único **parcial**, descripción **opcional**, autor **anulable**.

## Pendiente para el leader

- **T13**: `git fetch origin dev` → `git merge origin/dev` → `./init.sh` **sin flags**. No lo
  corrí por la regla del gate. Atención al merge sobre `lib/modules/inventario/index.ts` si
  QC-20 tocó el mismo archivo, y sobre `lib/composition/index.ts` si QC-19 lo tocó — esta
  feature no lo modifica, así que por nuestro lado no debería haber conflicto.
- PR: **no abierto** y **nada mergeado**, según lo pedido.

---

# Corrección tras el review del 2026-09-02

`progress/review_QC-24-modelo-recetas.md` **RECHAZÓ** la feature por un bloqueante: la suite
completa estaba en rojo, `2 failed | 507 passed`. Los dos fallos eran de QC-24 aunque no
estuvieran en archivos de QC-24, y con ellos `./init.sh` no podía terminar en verde (regla 5 de
`CLAUDE.md`). Corregido. Este bloque documenta qué se cambió y por qué.

## El bloqueante: dos casos de QC-14 que medían el repo, no su feature

Los dos vivían en `tests/unit/inventario/schema/inventario-schema.test.ts`, **archivo que no
está en la lista de `design.md > 1` ni en la de ninguna task** — por eso se anotó también en la
cabecera de `tasks.md`, como esa cabecera exige. Se **acotaron, no se borraron**: las dos
aserciones protegen requisitos reales de QC-14 y esos siguen vigilados. Lo que se quitó es la
parte que retrataba el estado global del repo del día en que se escribió el test. En los dos
casos el porqué queda escrito **dentro del propio test**, fechado y con referencia a QC-24, para
que el siguiente que lo lea vea que no se relajó por conveniencia.

### 1. `el esquema declara exactamente dos modelos nuevos: Presentation y Product`

Enumeraba **todos** los modelos del esquema y exigía que fueran exactamente los cinco que había
aquel día:

```
AssertionError: expected [ Array(7) ] to deeply equal [ Array(5) ]
+   "Recipe",
+   "RecipeLine",
```

Eso no es lo que **QC-14 R3** pide. R3 dice: «persistir, en **una única entidad de producto**,
los siguientes datos […]; y NO DEBE mantener ninguna entidad separada de *elemento de
inventario*». Habla de la entidad de producto, no del censo del esquema. Un test que se rompe
cuando llega la feature siguiente estaba midiendo el repo.

Qué **se conserva** de R3, todo lo que ya estaba y sigue estando:
- que `inventario` declara **exactamente dos** modelos, `Presentation` y `Product` — ahora
  leídos de su `/// @module`, que es el mismo criterio que usa el caso de R20 tres tests más
  abajo, en vez de una lista escrita a mano;
- que `InventoryItem`, `Inventory`, `StockItem` e `Item` **no existen** en ninguna parte del
  esquema (esa es la entidad separada que la decisión cerrada 1 fusionó);
- que no hay ningún `@@map("inventory"|"inventory_items"|"stock_items"|"items")`.

Qué **se añade** para no perder cobertura al quitar la lista cerrada: que los tres modelos de
`identity` (`DocumentType`, `Role`, `User`) siguen existiendo, es decir, que QC-14 no los
absorbió ni los hizo desaparecer.

Qué **se quita**: la igualdad contra el censo completo del esquema. Nada más.

### 2. `la feature no anade adaptadores driving, rutas ni contrato de dominio en el modulo inventario`

Exigía que `lib/modules/inventario/domain/` estuviera **vacía** y que el barrel fuese
literalmente `export {};`:

```
AssertionError: expected [ 'product-catalog.ts' ] to deeply equal []
```

**QC-24 hace justo lo contrario por diseño** (T5, `design.md > 5.2`): `inventario` tiene que
publicar `ProductCatalog` desde su dominio para que `recetas` pueda apuntar a un producto sin
tocar su tabla (R18). Sin eso, la frontera de módulo de esta feature no existe.

Y ninguna de las dos aserciones está en **QC-14 R23**, que enumera exactamente: «ninguna
operación de alta, consulta, edición o borrado […] ni adaptador driving, ruta, Server Action o
pantalla que las exponga». Un contrato de **solo tipos** no es ninguna de esas cosas: desaparece
al compilar y no ejecuta nada.

Qué **se conserva** de R23:
- `lib/modules/inventario/adapters/driving/` sin ningún `.ts`/`.tsx`;
- ninguna ruta `app/api/products`, `app/api/presentations` ni `app/api/inventario`.

Qué **se añade**, para que R23 siga vigilado sobre el contrato en vez de sobre un retrato fijo:
- el barrel no contiene `'use server'`;
- el barrel **solo reexporta de `./domain/`**, nunca de `adapters/` — que es por donde entraría
  una operación de alta/consulta/edición/borrado;
- todo lo que el barrel reexporta son **tipos** (`export type { … }`), no valores: sin runtime
  en el contrato no hay operación que exponer.

Esas tres son más estrictas que `toBe('export {};')` en lo que importa y no se rompen cuando
llega la feature siguiente.

Qué **se quita**: que `domain/` esté vacía y la igualdad literal del barrel.

**No se tocó nada más de QC-14**: ni su `requirements.md`, ni su `design.md`, ni su `tasks.md`,
ni ningún otro caso del archivo, ni el otro test de la carpeta.

## Los dos menores del review

- **menor 1 — T13.** Marcada `[x]` con el sufijo **«(pendiente del leader)»** y explicada en su
  cuerpo, exactamente como hizo QC-12 con su T9: el gate completo y el PR los corre el leader
  (`AGENTS.md > Regla del gate`), y la task queda cerrada por el lado del implementer. La
  ausencia queda **registrada, no silenciada**.
- **menor 2 — el hallazgo del SQLSTATE.** Movido a donde QC-25 lo va a leer: nueva sección
  **`design.md > 10.1`** de esta ficha, marcada como añadida después de implementar y que no
  cambia ninguna decisión. Dice qué pasa (por el camino tipado Prisma entrega `P2002`/`P2003` y
  el SQLSTATE de Postgres ya no está en `meta.code`) y las dos consecuencias para el CRUD de
  QC-25. **No se afirma qué campo de `meta` identifica la restricción**: no se verificó en esta
  ficha y no se rellena con un supuesto (regla 6 de `CLAUDE.md`); queda dicho que QC-25 lo
  compruebe.

## Archivos tocados en esta corrección

| Archivo | Qué cambió |
| --- | --- |
| `tests/unit/inventario/schema/inventario-schema.test.ts` | **Fuera de la lista de tasks.** Los dos casos acotados, con el porqué fechado dentro del test. |
| `specs/QC-24-modelo-recetas/tasks.md` | T13 marcada y explicada; anotado el archivo tocado fuera de la lista, como exige su cabecera. |
| `specs/QC-24-modelo-recetas/design.md` | Nueva § 10.1 con el hallazgo del SQLSTATE para QC-25. |
| `progress/impl_QC-24-modelo-recetas.md` | Este bloque. |

Producción: **nada**. No se tocó `db/`, ni `lib/`, ni `package.json`, ni los tests de `recetas`.

## Gate tras la corrección — la suite COMPLETA, esta vez

El leader autorizó explícitamente correrla, porque el fallo era de **interacción entre
features** y `vitest related` no lo engancha: los archivos rotos no estaban en el diff de QC-24.

```
pnpm run typecheck   -> tsc --noEmit, sin salida, exit 0
pnpm run lint        -> eslint, sin salida, exit 0

pnpm exec vitest run   (SUITE COMPLETA)
 RUN  v4.1.10 C:/Users/Cristian/Documents/trabajo/arc/labs/.worktrees/QC-24-modelo-recetas

 Test Files  47 passed (47)
      Tests  509 passed (509)
   Duration  29.60s
```

**47 de 47 archivos y 509 de 509 tests en verde.** Antes de la corrección: `1 failed | 46
passed` y `2 failed | 507 passed`. **Nada más salió rojo**, y el total de tests no cambió (509):
se acotaron dos casos, no se borró ninguno.

Las dos líneas `Not implemented: navigation to another Document` que imprime la corrida son
avisos de jsdom de los tests de login, preexistentes y ajenos a esta feature: no son fallos y
salían igual antes.

`./init.sh` sigue siendo del leader.
