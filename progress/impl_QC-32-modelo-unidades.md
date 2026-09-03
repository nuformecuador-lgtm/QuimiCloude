# QC-32 — modelo-unidades · parte de implementacion

> Rol: `implementer`. Worktree `.worktrees/QC-32-modelo-unidades`, rama
> `feature/QC-32-modelo-unidades`, base `e82aa49`. Spec aprobado por el humano el 2026-09-03 (F1.4).
> Zona `backend`: toda la implementacion la escribe `backend_dev`; el implementer coordina,
> verifica y firma este parte.

## Bloque A — Preparacion

### T0 · `.env` disponible dentro del worktree — HECHO
El worktree nacio sin `.env` y sin `node_modules`. Se copio el `.env` de la raiz al worktree
(git-ignorado, no versionado, ninguna cadena de conexion pegada aqui) y se corrio
`pnpm install --frozen-lockfile`.

```
$ pnpm exec prisma validate
Prisma schema loaded from db\schema.prisma
The schema at db\schema.prisma is valid

$ pnpm exec prisma generate
Generated Prisma Client (v6.19.3)
```

### T0b · La base esta vacia de unidades escritas — HECHO, y es un CERO limpio
Corrido el **2026-09-03** contra la base real (`DIRECT_URL`), que es lo que exige la pregunta
abierta 2 de `requirements.md`: la comprobacion vale el dia del merge, no el dia del spec.

```
fecha: 2026-09-03T12:11:15.769Z
products total        : {"count":"0"}
products unit NOT NULL: {"count":"0"}
recipe_lines total    : {"count":"0"}
recipes total         : {"count":"0"}
tabla units existe    : {"count":"0"}
migraciones aplicadas :
    20260806122638_users_and_roles                            2026-08-06T13:17:52.324Z
    20260901220609_user_login_lockout                          2026-09-02T00:10:20.699Z
    20260902005510_products_and_presentations                  2026-09-02T13:13:55.904Z
    20260902132253_user_must_change_credential                 2026-09-02T13:42:06.940Z
    20260902163256_recipes_and_recipe_lines                    2026-09-02T16:38:08.800Z
    20260902170759_product_audit_and_presentation_uniqueness   2026-09-02T23:14:49.231Z
```

**Veredicto:** los dos contadores que exige T0b son `0`. La **decision cerrada 6 se confirma** y la
pregunta abierta 2 se cierra en los hechos: no hay ningun texto de unidad que perder, la migracion
no convierte nada y no hay nada que subir al humano por esta via.

---

## Bloque E — Base de datos real

### T10 · Aplicar y revertir de verdad, y probar las dos guardias — HECHO
Lo corrio el **implementer**, no un subagente: altera el estado de la base local y su evidencia es
este parte. Carpeta de migracion: **`db/migrations/20260903121404_units_catalog/`**.
Los tres pasos, en el orden que exige la task, contra Postgres real.

#### Paso 1 · R22 en su forma real — la migracion ABORTA antes que perder el dato
Sembrada a mano una presentacion y **un producto con `unit = 'kg'`** (texto escrito), y despues
`pnpm run db:migrate`:

```
Applying migration `20260903121404_units_catalog`
Error: P3018 · Database error code: P0001
ERROR: QC-32: hay 1 producto(s) y 0 linea(s) de receta con unidad escrita. La migracion se
detiene para no perder ese dato: reabre la decision (specs/QC-32-modelo-unidades/requirements.md,
pregunta abierta 2) antes de aplicarla.
=== EXIT: 1 ===
```

Y el estado despues del fallo — que es lo que R22 pide de verdad («no DEBE aplicar ninguno de sus
cambios»):

```
tabla units existe        : [{"count":"0"}]     <- NO se creo
products.unit sigue       : [{"count":"1"}]
products.unit_id NO existe: [{"count":"0"}]
recipe_lines.unit sigue   : [{"count":"1"}]
el dato NO se perdio      : [{"id":"2222...","name":"QC32 TMP Producto","unit":"kg"}]
registro de la migracion  : [{"finished_at":null,"rolled_back_at":null,"applied_steps_count":0}]
```

Despues se borro la fila de prueba y se marco la migracion fallida como revertida
(`prisma migrate resolve --rolled-back 20260903121404_units_catalog` -> «marked as rolled back»),
que es el paso obligatorio para que Prisma admita reintentarla.

#### Paso 2 · Ciclo normal `apply -> comprobar -> rollback -> comprobar -> apply` (R23)
`pnpm run db:migrate` -> `All migrations have been successfully applied.` (exit 0).
Esquema **real**, leido de los catalogos del sistema, no del texto del SQL:

```
units en information_schema : [{"table_name":"units"}]
columnas de units           : id uuid NO · name text NO · name_normalized text NO ·
                              symbol text YES · created_at timestamptz NO · updated_at timestamptz NO
las dos FK (confdeltype=r)  : [{"conname":"products_unit_id_fkey","confdeltype":"r","confupdtype":"c"},
                               {"conname":"recipe_lines_unit_id_fkey","confdeltype":"r","confupdtype":"c"}]
indice unico + los de FK    : products_unit_id_idx · recipe_lines_unit_id_idx · units_name_normalized_key
RLS de units                : [{"relrowsecurity":true,"relforcerowsecurity":true}]
columnas unit YA NO existen : []
columnas unit_id SI existen : products.unit_id uuid YES · recipe_lines.unit_id uuid NO
```

`confdeltype = 'r'` es `ON DELETE RESTRICT` (decision 10, R13) y `confupdtype = 'c'` es
`ON UPDATE CASCADE`, en las dos FK. `relforcerowsecurity = true` cierra R21 en la base, no solo en
el texto.

`pnpm run db:rollback` -> `20260903121404_units_catalog revertida.` (exit 0). Estado despues:

```
units desaparece            : [{"count":"0"}]
unit VUELVE con tipo exacto : [{"table_name":"products","data_type":"text","is_nullable":"YES","column_default":null},
                               {"table_name":"recipe_lines","data_type":"text","is_nullable":"NO","column_default":null}]
unit_id desaparece          : [{"count":"0"}]
FK e indices desaparecen    : [{"count":"0"}]
indices residuales          : [{"count":"0"}]
NO cae ninguna tabla ajena  : _prisma_migrations, document_types, presentations, products,
                              recipe_lines, recipes, roles, users
_prisma_migrations coherente: las SEIS migraciones anteriores, sin la de QC-32
pgcrypto intacta            : [{"extname":"pgcrypto"}]
```

Esto es **R23 exacto, no aproximado**: `products.unit` vuelve `text` anulable y
`recipe_lines.unit` vuelve `text NOT NULL`, y las dos con **`column_default: null`** — el
`DEFAULT ''` que el design prohibe expresamente no esta. No queda tabla, columna, indice ni
restriccion residual, y no cae ninguna tabla de `identity`, `inventario` ni `recetas`.

Tercera fase: `pnpm run db:migrate` de nuevo -> `All migrations have been successfully applied.`

#### Paso 3 · R24 en su forma real — la reversion ABORTA si algo apunta al catalogo
Con la migracion aplicada, sembrada la unidad `kilogramo`/`kg` y un producto apuntando a ella
(`unit_id = 648cd127-…`). Despues `pnpm run db:rollback`:

```
db:rollback: la reversion de 20260903121404_units_catalog fallo y no se aplico nada
(transaccion deshecha): QC-32 down: hay 1 fila(s) apuntando a una unidad del catalogo. Revertir
borraria esa referencia sin poder reconstruir el texto anterior: vacia o migra esas filas a mano
antes de revertir.
=== EXIT: 1 ===
```

Y **no toco nada**, que es la otra mitad de R24:

```
units sigue existiendo     : [{"count":"1"}]
la unidad sigue            : [{"name":"kilogramo","symbol":"kg"}]
unit_id sigue en las dos   : products · recipe_lines
la referencia sigue viva   : [{"name":"QC32 TMP Producto","unit_id":"648cd127-…"}]
las FK siguen              : products_unit_id_fkey · recipe_lines_unit_id_fkey
la migracion sigue aplicada: [{"aplicada":true}]
```

Deshechas las filas de prueba, la base queda con la migracion **aplicada** y los contadores a cero:
`products 0 · presentations 0 · units 0 · recipe_lines 0`.

#### De propina: el «hecho cuando» de T5 que no se podia cerrar sin base
T5 dejo pendiente «`pnpm run db:seed` corre dos veces seguidas y la segunda no crea nada», porque
cuando se escribio el codigo la tabla `units` todavia no existia. Cerrado aqui:

```
===== PRIMERA CORRIDA =====
db:seed: nada que crear
db:seed: unidades creadas: 5 (kilogramo, gramo, litro, mililitro, unidad)
===== SEGUNDA CORRIDA =====
db:seed: nada que crear
db:seed: unidades creadas: 0
```

**Veredicto de T10:** los tres pasos terminan como se espera. **R22, R23 y R24 quedan cerrados en
su forma real**, que es lo que la task exige: los tests estaticos de T8 solo leen el texto del SQL.

---

## Bloque B — Esquema y migracion (T1, T2, T3) · `backend_dev`

**Archivos.** `db/schema.prisma` (modificado) · `db/migrations/20260903121404_units_catalog/migration.sql`
(generado por Prisma y **completado y reordenado a mano**) · `.../down.sql` (nuevo, a mano).

`Unit` va al final del esquema con `/// @module unidades`, `symbol String?`, **sin `deletedAt`**,
`@@unique([nameNormalized])` y **sin** indice sobre `symbol`. `Product.unit String?` pasa a
`unitId String? @map("unit_id") @db.Uuid`; `RecipeLine.unit String` pasa a
`unitId String @map("unit_id") @db.Uuid`. Ninguna lleva `@relation` y `Unit` no declara campos de
vuelta. Los comentarios «OJO» de los dos modelos ajenos se **ampliaron** (como «OJO 2»), no se
sustituyeron.

**Dos correcciones a mano sobre lo que genero Prisma**, ambas anotadas en la cabecera del
`migration.sql`, y la segunda es la que habria costado cara:

1. Prisma emitio el `DROP COLUMN "unit"` **antes de tiempo y fusionado** con el `ADD COLUMN`. Se
   separo, y los dos `DROP COLUMN` se movieron al final, como manda `design.md > 4.2`.
2. Prisma genero **cinco `DROP CONSTRAINT` por DRIFT** que hubo que borrar:
   `products_created_by_fkey`, `products_updated_by_fkey`, `recipe_lines_product_id_fkey`,
   `recipes_created_by_fkey`, `recipes_updated_by_fkey`. Son las FK escritas a mano por QC-20 y
   QC-24: Prisma no las conoce (campos escalares sin `@relation`) y queria eliminarlas. **Es
   exactamente el riesgo del que la cabecera del archivo avisa para el futuro**, y aparecio a la
   primera.

## Bloque C — Modulo `unidades`, seed y reapuntado (T4, T5, T6) · `backend_dev`

**Nuevos:** `lib/modules/unidades/index.ts`, `domain/unit-name.ts`, `domain/unit-catalog.ts`,
`domain/starter-units.ts`, `domain/seed-units.ts`, `ports/unit-seed-repository.ts`,
`adapters/driven/persistence/unit-seed-repository-prisma.ts`, `adapters/driving/.gitkeep`.
**Modificados:** `lib/composition/index.ts`, `scripts/seed.ts`, y los cinco de `inventario`
(`domain/product-input.ts`, `product-view.ts`, `product-catalog.ts`,
`adapters/driven/persistence/product-prisma.ts`, `adapters/driving/product-actions.ts`).

- El puerto **no declara `update`, `updateMany` ni `upsert`**: el metodo con el que pisar una
  unidad no esta disponible ni por accidente. La idempotencia sale de la lectura previa por nombre
  normalizado, que es lo que R26 exige y lo que un `upsert` habria roto en silencio.
- `prisma.unit` aparece en **un solo archivo** de todo el repo, el adaptador driven de `unidades`,
  y hay un test que lo vigila distinguiendo codigo de comentario.
- `inventario` importa `UnitId` **por el barrel**, nunca por ruta profunda.
- Cambio mecanico: **no** se anadio validacion de existencia de la unidad (es QC-38,
  `design.md > 11.3`) y no se toco ningun caso de uso ni ninguna regla de permisos.
- La comprobacion que pedia T6 quedo limpia: buscar la unidad como texto en
  `lib/modules/inventario` no devuelve nada.

## Bloques D y F — Tests (T7, T8, T9, T11, T12) · `backend_dev`

**Nuevos (7 archivos, 65 tests):** `tests/unit/unidades/schema/unidades-schema.test.ts` (14) ·
`.../unidades-migration.test.ts` (13) · `tests/unit/unidades/domain/unit-name.test.ts` (8) ·
`.../seed-units.test.ts` (6) · `tests/unit/unidades/module-contract.test.ts` (8) ·
`tests/integration/unidades/unidades-constraints.int.test.ts` (13) ·
`.../unidades-seed.int.test.ts` (3).

**Los tres tests de sensibilidad que exige `design.md > 9` existen y estan verificados.** Cada
predicado esta extraido a una **funcion pura exportada** que recibe el texto SQL, y se corre sobre
el SQL real **y** sobre una mutacion en memoria (nunca sobre el archivo en disco): `RESTRICT` a
`CASCADE` tumba R13; quitar el bloque de guardia del UP tumba R22; quitar el `NOT NULL` del DOWN
tumba R23. Hay mas de los pedidos (indice unico degradado, FK borrada, `DROP COLUMN` perdido,
`ENABLE`/`FORCE` quitados, identificadores en espanol). **Un test que no puede fallar no vigila
nada.**

### T12 — los diez tests ajenos: se acotaron, no se aflojaron
Los diez archivos de la lista contractual, ni uno mas. Lo que importa, y es lo que el reviewer va a
mirar: **en ningun caso se cambio un `toEqual` por un `toContain`**. Las cuatro listas cerradas
(indices de `products`, indices de `recipes`/`recipe_lines`, escalares de `RecipeLine`, FK reales)
siguen siendo cerradas, con el elemento nuevo sumado — aflojarlas habria sido perder la capacidad
de detectar lo que se anada a escondidas manana. Cuatro decisiones que merecen constar:

- **En `tests/unit/recetas/schema/recetas-migration.test.ts` la asercion sobre la columna `unit`
  de texto se conserva TAL CUAL.** Ese archivo lee el SQL **historico y ya aplicado** de QC-24, que
  no se reescribe nunca: cambiarlo seria falsear la historia y desactivar la guardia que existe
  justo para impedir ese drift. Solo se anadio la nota fechada de que esa columna la sustituye
  `20260903121404_units_catalog`, cuyo SQL vigila `unidades-migration.test.ts`.
- **Dos archivos GANARON cobertura** (`product-input.test.ts`, `product-actions.test.ts`): tras el
  cambio de forma, el campo se quedaba sin que **nadie** lo vigilara — en uno nunca lo estuvo, en
  el otro el `FormData` llevaba la unidad sin ninguna asercion encima. Un fixture que nadie
  comprueba es precisamente la regresion disfrazada que habia que evitar.
- **En `recetas-constraints.int.test.ts` el caso de R15 de QC-24 muerde MAS que antes**: donde
  decia «acepta cualquier texto como unidad» ahora dice «acepta cualquier unidad del catalogo, sin
  restriccion por producto», y **apunta cada producto a una unidad distinta de la de su linea**
  (antes dejaba el producto sin unidad). R14 — la unidad es anotativa y la linea no hereda la del
  producto — queda mejor vigilada despues de QC-32 que antes.
- **No se toco `classifyForeignKeyViolation`** para anadir la rama de `unit_id`: traducir ese error
  a un mensaje de usuario es de QC-38 (`design.md > 11.3`) y anadirlo aqui habria sido inventar
  comportamiento.

**No se toco ningun requisito ni ningun spec de QC-14, QC-20 ni QC-24.**

---

## T13 · Sincronizacion con `dev` y gate completo

`git fetch origin dev` deja `origin/dev` en **`8f4a5ae`**, que es el **padre** de la base de esta
rama (`e82aa49`). No ha avanzado desde que se monto el worktree: el merge es un **no-op** y **no
hubo ningun conflicto que resolver**, ni trivial ni ambiguo. Nada que subir al humano por esta via,
y en particular nada que resolver sobre `lib/modules/inventario/**` ni sobre `db/schema.prisma`,
que era donde la task avisaba del riesgo.

Gate completo, **sin flags**: el modo rapido no vale aqui porque lo que esta feature acopla es SQL,
nombres de archivo y la forma del arbol de modulos, y el grafo de imports no lo ve
(`docs/verification.md > Lo que --rapido NO cubre`).

```
$ ./init.sh
 Test Files  96 passed (96)
      Tests  1025 passed (1025)
   Duration  29.12s
JSON report written to .vitest-rojos.json
✓ tests: sin rojos nuevos (96 archivos ejecutados, baseline vacio)
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

Los tres archivos de integracion de esta ficha y los ajenos, dentro de esa corrida:

```
✓ |integration| tests/integration/unidades/unidades-constraints.int.test.ts (13 tests)
✓ |integration| tests/integration/unidades/unidades-seed.int.test.ts        (3 tests)
✓ |integration| tests/integration/recetas/recetas-constraints.int.test.ts   (25 tests)
✓ |integration| tests/integration/inventario/inventario-constraints.int.test.ts (19 tests)
✓ |integration| tests/integration/inventario/product-crud.int.test.ts       (7 tests)
```

**El flake conocido de `dev` no aparecio.** `tests/unit/login-form.test.tsx` paso dentro de la
suite completa (25 tests, 7.7 s). No se toco nada suyo.

---

## T14 · Mapa `R<n> -> test`, con la salida REAL

Abreviaturas: **S** `tests/unit/unidades/schema/unidades-schema.test.ts` · **M**
`.../unidades-migration.test.ts` · **N** `tests/unit/unidades/domain/unit-name.test.ts` · **D**
`.../seed-units.test.ts` · **C** `tests/unit/unidades/module-contract.test.ts` · **I**
`tests/integration/unidades/unidades-constraints.int.test.ts` · **IS**
`.../unidades-seed.int.test.ts` · **G1** `tests/guards/guard-rls-force.test.ts` · **G2**
`tests/guards/guard-arquitectura-modulos.test.ts` · **G3**
`tests/guards/guard-dependencias-aprobadas.test.ts` · **T10** la evidencia contra base real de
este mismo parte.

**Los 28 requisitos tienen al menos un test EJECUTADO, no solo escrito.** Todo lo de abajo corrio
en verde dentro de `./init.sh`.

| R | Test estatico / unitario / guardia | Test contra base real |
| --- | --- | --- |
| R1 | S · «Unit declara id uuid propio, nombre y simbolo» | I · «crea una unidad con nombre y simbolo y la relee sin perdida» |
| R2 | S · «name es obligatorio y sin default» | I · «rechaza una unidad sin nombre con SQLSTATE 23502» |
| R3 | S · «symbol es opcional y no tiene default» | I · «acepta una unidad sin simbolo y la relee con ausencia de valor, no con cadena vacia» |
| R4 | N · los 8 casos: acentos, mayusculas, signos, recorte, cadena vacia, litro no colisiona con mililitro, los simbolos no se normalizan, **idempotencia** · C · «el barrel exporta normalizeUnitName» | — (propiedad de una funcion pura) |
| R5 | S · «name_normalized obligatorio junto al nombre original, con su @@unique» · M · «existe CREATE UNIQUE INDEX sobre name_normalized» | I · «rechaza una segunda unidad con el mismo nombre normalizado con SQLSTATE 23505» |
| R6 | S · «name y symbol son TEXT, sin varchar ni limite declarado» | I · «acepta un nombre de 500 caracteres» |
| R7 | S · «no hay @unique ni indice sobre symbol» | I · «acepta dos unidades distintas con el mismo simbolo» |
| R8 | S · «Unit no declara deletedAt» · M · «la tabla units no crea ninguna columna de borrado logico» | — (ausencia declarativa) |
| R9 | S · «Unit declara createdAt y updatedAt» | I · «created_at y updated_at se rellenan solos y updated_at cambia al modificar» |
| R10 | S · «Product declara unitId uuid OPCIONAL y ninguna columna unit de texto» | I · «acepta un producto sin unidad y otro con unidad» |
| R11 | S · «RecipeLine declara unitId uuid OBLIGATORIO y ninguna columna unit de texto» | I · «rechaza una linea de receta sin unidad con SQLSTATE 23502» |
| R12 | M · «las dos FK de unit_id existen en el SQL» | I · «rechaza un producto y una linea con unit_id inexistente con SQLSTATE 23503» |
| R13 | M · «las dos FK son ON DELETE RESTRICT, **y el test cae si se cambian a CASCADE**» | I · «rechaza el borrado de una unidad usada por un producto y por una linea con 23503, y permite el de una unidad libre» |
| R14 | C · «el modulo unidades no expone ninguna conversion ni factor» · S · «Unit no declara factor, base ni equivalencia» | I · «una linea puede usar una unidad distinta de la de su producto» |
| R15 | S · «Unit declara /// @module unidades» · G2 · «todo modelo del esquema real declara su modulo propietario» | — |
| R16 | C · «prisma.unit solo aparece en el adaptador driven de unidades» · «el criterio distingue codigo de comentario, y cae ante una consulta real» · «inventario y recetas importan unidades solo por el barrel» · G2 | — |
| R17 | C · «index.ts, solo carpetas domain/ports/adapters y ninguna directiva de servidor alcanzable desde el barrel» · G2 | — |
| R18 | S · «las dos unitId son escalares uuid SIN @relation y Unit no tiene campos de vuelta» · M · «las dos FK estan escritas en el SQL» | I · «la base rechaza un unit_id inexistente aunque Prisma no declare la relacion» |
| R19 | C · «ProductRef, ProductView, NewProduct y el esquema zod de producto usan unitId y ningun texto de unidad» | — (propiedad de los tipos) |
| R20 | S · «la tabla y sus columnas mapean a snake_case en ingles» · M · «todos los identificadores creados estan en ingles» + «la guardia de idioma cae con un identificador en espanol» | — (propiedad del texto) |
| R21 | M · «units queda con RLS activado y forzado» · G1 | **T10** paso 2 · `relrowsecurity` y `relforcerowsecurity` en **true** en `pg_class`. No se escribe test de RLS con Prisma: seria un falso verde, y T10 lo confirmo — se conecta como `postgres`, con `rolbypassrls = true` |
| R22 | M · «el UP empieza con la guardia DO $$ que aborta si hay unidad escrita, **y el test cae si se quita**» | **T10 paso 1** · la migracion falla con el mensaje de la guardia, `units` **no** se crea, `applied_steps_count = 0` y el dato **no** se pierde |
| R23 | M · «down.sql devuelve products.unit a TEXT y recipe_lines.unit a TEXT NOT NULL, **y el test cae si se quita el NOT NULL**» | **T10 paso 2** · ciclo apply -> rollback -> apply, con tipo y obligatoriedad **exactos** y `column_default: null` en las dos |
| R24 | M · «el DOWN empieza con su propia guardia DO $$, **y el test cae si se quita**» | **T10 paso 3** · el rollback falla con el mensaje de la guardia y **no toca nada** |
| R25 | D · «sobre catalogo vacio crea las cinco unidades arrancadoras y ninguna mas» | IS · «db:seed deja las cinco unidades en la base» · **T10** · corrida real: «unidades creadas: 5 (kilogramo, gramo, litro, mililitro, unidad)» |
| R26 | D · «con tres presentes crea solo las dos que faltan» · «no actualiza ninguna existente» · «dos corridas dejan el mismo estado» · «una unidad renombrada a mano no se duplica y no se toca» | IS · «una segunda corrida no crea nada y no pisa una unidad renombrada a mano» · **T10** · segunda corrida real: «unidades creadas: 0» |
| R27 | C · «la feature no anade adaptadores driving, rutas ni Server Actions» | — (no hay flujo navegable: E2E diferido con motivo, decision cerrada 18) |
| R28 | G3 · «toda dependencia de package.json tiene su fila en el registro» | — (`package.json` no se toco) |

---

## Decisiones tomadas sobre la marcha, y lo que queda abierto

Ninguna decision cerrada se reabrio. Ninguna pregunta abierta se cerro por cuenta propia.

1. **Pregunta abierta 2 — resuelta por los hechos, no por criterio.** T0b se corrio **el dia del
   merge** contra la base real, que es lo que la pregunta exigia: productos con unidad escrita = 0,
   lineas de receta = 0. La decision cerrada 6 se confirma y no hubo nada que subir al humano. **Y
   la guardia se probo igualmente**, sembrando la fila a proposito (T10 paso 1): que hoy la base
   este vacia no es motivo para no verificar la red.
2. **Preguntas abiertas 1, 3, 4 y 5 siguen ABIERTAS.** El conjunto arrancador se implemento con la
   **posicion por defecto** de `design.md > 6.1` — nombres en minuscula y «unidad» **sin** simbolo —,
   con el comentario de «pendiente de confirmacion» intacto en el codigo. Si el humano quiere otra
   capitalizacion, o darle simbolo a «unidad», es **cambiar cinco literales y el test que los
   espera**: no toca ni el esquema, ni la migracion, ni ningun requisito.
3. **`design.md > 11.1, 11.2 y 11.3` siguen abiertas**, con su posicion por defecto implementada:
   sin indice por `symbol`; `ProductRef` con `unitId` y no con una `UnitRef` embebida; y nadie
   valida que el `unitId` exista antes de que lo rechace la base con `23503` — es de QC-38.
4. **Montar un worktree cuesta mas de lo que dice `docs/worktrees.md`.** Ademas de T0 (`.env`),
   hubo que correr `pnpm install --frozen-lockfile` y **`pnpm exec next typegen`**: sin lo ultimo,
   `app/layout.tsx` no compila (`TS2304: Cannot find name LayoutProps`, un tipo global que Next
   genera en `.next/types`, que esta git-ignorado). **No es un error de esta ficha** — se reproduce
   en la rama limpia sin ningun cambio — pero es un paso de montaje que hoy no esta escrito y que
   deja el gate rojo con un error que no tiene nada que ver con lo que estas haciendo. Se anota por
   si el leader quiere llevarlo a `/afinar-regla`; **no se toco `docs/`**.
5. **El test de integracion del seed no invoca la fachada de `lib/composition`**, y es deliberado:
   el adaptador se exporta **ya construido** sobre el cliente compartido (asi lo fija
   `design.md > 5.4`), asi que llamarlo dentro de una transaccion escribiria por otra conexion,
   **quedaria comiteado en la base compartida** y no veria las filas de la transaccion. El test
   ejercita el caso de uso real del dominio contra un repositorio Prisma construido sobre el `tx`
   — el mismo patron que `identity-seed.int.test.ts` — y anade un caso que comprueba que el
   cableado de `lib/composition` existe. La alternativa limpia seria exportar tambien una fabrica
   que reciba el cliente; **no se hizo porque el design no la pide** (regla 6), y el cableado real
   si queda verificado de punta a punta por las dos corridas de `pnpm run db:seed` de T10.

## Veredicto

Las **16 tareas** cerradas y marcadas `[x]` en `tasks.md`. Gate completo en **`== init OK ==`**,
con **1025 tests en 96 archivos** y sin rojos nuevos. Los **28 requisitos** con al menos un test
ejecutado, y **R22, R23 y R24 cerrados contra Postgres real**, no solo contra el texto del SQL.
Ningun test ajeno aflojado; dos ganaron cobertura y uno muerde mas que antes.

**No me autoapruebo: lo decide el reviewer.**
