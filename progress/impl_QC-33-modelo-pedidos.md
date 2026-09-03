# QC-33 — modelo-pedidos · parte de implementacion

> Zona: `backend` · Rama: `feature/QC-33-modelo-pedidos` · Worktree: `.worktrees/QC-33-modelo-pedidos/`
> Spec aprobado por el humano el 2026-09-03 (F1.4): 42 requisitos y 29 decisiones cerradas.
> Implementado por `implementer` delegando en cuatro corridas de `backend_dev`. Fecha: 2026-09-03.

## 1. Estado de las tasks

| Task | Estado | Quien |
| --- | --- | --- |
| T0. Worktree en condiciones de compilar y hablar con la base | `[x]` | implementer |
| T1. Los dos `enum` y el modelo `Order` en `db/schema.prisma` | `[x]` | `backend_dev` (B) |
| T2. `migration.sql` generado y completado a mano | `[x]` | `backend_dev` (B) |
| T3. `down.sql` a mano | `[x]` | `backend_dev` (B) |
| T4. Armazon del modulo `pedidos` y `RecipeId` en `recetas` | `[x]` | `backend_dev` (C) |
| T5. Contrato estatico del esquema | `[x]` | `backend_dev` (D1) |
| T6. Contrato estatico del SQL de la migracion | `[x]` | `backend_dev` (D1) |
| T7. Dominio y forma del modulo | `[x]` | `backend_dev` (D2) |
| T8. Aplicar y revertir de verdad | `[x]` | implementer |
| T9. Tests de integracion contra Postgres real | `[x]` | `backend_dev` (E) |
| T10. Sincronizar con `dev` y gate completo | ver seccion 8 | implementer + leader |
| T11. Este parte | `[x]` | implementer |

## 2. Archivos creados y modificados

### Creados

- `db/migrations/20260903191204_orders/migration.sql`
- `db/migrations/20260903191204_orders/down.sql`
- `lib/modules/pedidos/index.ts`
- `lib/modules/pedidos/domain/order-number.ts`
- `lib/modules/pedidos/domain/order-classification.ts`
- `lib/modules/pedidos/domain/order-contents.ts`
- `lib/modules/pedidos/ports/.gitkeep`
- `lib/modules/pedidos/adapters/driven/.gitkeep`
- `lib/modules/pedidos/adapters/driving/.gitkeep`
- `lib/modules/recetas/domain/recipe-catalog.ts`
- `tests/unit/pedidos/schema/pedidos-schema.test.ts`
- `tests/unit/pedidos/schema/pedidos-migration.test.ts`
- `tests/unit/pedidos/domain/order-number.test.ts`
- `tests/unit/pedidos/module-contract.test.ts`
- `tests/integration/pedidos/pedidos-constraints.int.test.ts`
- `progress/impl_QC-33-modelo-pedidos.md` (este archivo)

### Modificados

- `db/schema.prisma` — **78 inserciones, 0 borrados**. Solo anadido al final: `enum OrderStatus`,
  `enum OrderPriority` y `model Order` con su `/// @module pedidos` y los comentarios OJO 1 / OJO 2.
  **No se toco `Recipe`, `Unit`, `User` ni `Product`** (R5), y no hay ningun campo de vuelta
  `orders Order[]`.
- `lib/modules/recetas/index.ts` — **una linea, aditiva**, el unico archivo ajeno que toca la ficha:
  `export type { RecipeId } from './domain/recipe-catalog';`
  El contrato que dejo QC-25 (los cinco casos de uso, errores, actor, page, image, input, view) quedo
  intacto y en su orden.
- `specs/QC-33-modelo-pedidos/tasks.md` — marcado de tasks.

`lib/composition/index.ts` **no se toco**: `pedidos` no cablea nada (no hay puerto ni adaptador).
`package.json` **no se toco**: ninguna dependencia nueva (R40, decision cerrada 26).

## 3. Evidencia contra base real (T8): ciclo UP, inspeccion, DOWN, UP

`pnpm run db:migrate` produjo `Applying migration 20260903191204_orders` y
`All migrations have been successfully applied.` **El CHECK del ano fue aceptado por Postgres**, que es
lo que demuestra que la forma de dos argumentos del cambio de zona es IMMUTABLE; con
`EXTRACT(YEAR FROM created_at)` a secas la migracion habria caido con «functions in check constraint
must be marked IMMUTABLE».

### Esquema real tras el UP

**Tabla** `orders` presente en `information_schema.tables`. **14 columnas**, en orden: `id` (uuid, NOT
NULL), `order_year` (integer, NOT NULL), `order_sequence` (integer, NOT NULL), `recipe_id` (uuid, NOT
NULL), `quantity` (numeric **14,4**, NOT NULL), `unit_id` (uuid, NOT NULL), `unit_price` (numeric
**14,4**, NOT NULL), `priority` (USER-DEFINED, NOT NULL), `status` (USER-DEFINED, NOT NULL),
`created_by` (uuid, **NULL**), `updated_by` (uuid, **NULL**), `created_at` (timestamptz, NOT NULL),
`updated_at` (timestamptz, NOT NULL), `deleted_at` (timestamptz, **NULL**).
Sin total, sin subtotal, sin impuestos, sin cliente, sin fecha de solicitud.

**Las cuatro FK** en `pg_constraint` con `contype='f'`, las cuatro con **`confdeltype='r'`** (RESTRICT)
y `confupdtype='c'`:

```
orders_created_by_fkey   r  c
orders_recipe_id_fkey    r  c
orders_unit_id_fkey      r  c
orders_updated_by_fkey   r  c
```

**Los cinco CHECK** en `pg_constraint` con `contype='c'`, con la expresion tal como la guarda Postgres:

```
orders_delivered_not_deleted          CHECK (((deleted_at IS NULL) OR (status <> 'ENTREGADO'::"OrderStatus")))
orders_order_sequence_positive        CHECK ((order_sequence > 0))
orders_order_year_matches_created_at  CHECK ((order_year = (EXTRACT(year FROM (created_at AT TIME ZONE 'UTC'::text)))::integer))
orders_quantity_positive              CHECK ((quantity > (0)::numeric))
orders_unit_price_non_negative        CHECK ((unit_price >= (0)::numeric))
```

**El indice unico del correlativo, SIN predicado** — es TOTAL (R22), al reves que `recipes_name_unique`
de QC-24:

```
orders_order_year_order_sequence_key  CREATE UNIQUE INDEX orders_order_year_order_sequence_key ON public.orders USING btree (order_year, order_sequence)
orders_pkey                           CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)
orders_created_by_idx                 CREATE INDEX orders_created_by_idx ON public.orders USING btree (created_by)
orders_recipe_id_idx                  CREATE INDEX orders_recipe_id_idx ON public.orders USING btree (recipe_id)
orders_unit_id_idx                    CREATE INDEX orders_unit_id_idx ON public.orders USING btree (unit_id)
orders_updated_by_idx                 CREATE INDEX orders_updated_by_idx ON public.orders USING btree (updated_by)
```

**RLS en `pg_class`**: `relrowsecurity = true` y `relforcerowsecurity = true` (R37).

**Los dos tipos en `pg_type`**, con sus valores en el orden de declaracion:
`OrderStatus = {PENDIENTE,EN_CURSO,ENTREGADO}` y `OrderPriority = {BAJA,MEDIA,ALTA,CRITICA}`.

### DOWN (`pnpm run db:rollback`), que es lo que cierra R38 de verdad

```
db:rollback: aplicando down.sql de 20260903191204_orders y borrando su fila de _prisma_migrations
db:rollback: 20260903191204_orders revertida.
```

| | Antes del rollback | Despues del rollback |
| --- | --- | --- |
| Tablas de `public` | `_prisma_migrations, document_types, orders, presentations, products, recipe_lines, recipes, roles, supplier_catalog_lines, suppliers, units, users` (12) | las mismas **sin `orders`** (11) |
| Tipos en `pg_type` | `["OrderPriority","OrderStatus"]` | `[]` |
| `_prisma_migrations` | fila `20260903191204_orders` presente, `finished_at` no nulo | fila borrada; las anteriores (`units_catalog`, `suppliers_...`) intactas y sin `rolled_back_at` |

`orders` **y los dos tipos** desaparecen; **no desaparece ninguna tabla de `identity`, `inventario`,
`recetas` ni `unidades`**; `pgcrypto` queda intacta a proposito (la crean tambien QC-4, QC-14, QC-24 y
QC-32). Tercer paso: `pnpm run db:migrate` otra vez, aplicada, y el esquema vuelve a las 12 tablas y los
dos tipos. La base queda **con la migracion aplicada**.

## 4. Las tres restricciones, ejercidas a mano contra Postgres real

Ejecutado por el implementer dentro de una transaccion que termina en `ROLLBACK`, con datos propios
(unidad y receta creadas en la misma transaccion), afirmando sobre el **SQLSTATE** y el nombre del
constraint, nunca sobre el texto del mensaje, que en esta maquina sale en castellano:

```
--- R41: CHECK del ano contra created_at en UTC ---
  frontera 2026-12-31T20:00:00-05:00 con order_year=2026 (DEBE caer 23514): SQLSTATE 23514 · constraint=orders_order_year_matches_created_at
  misma fecha con order_year=2027 (DEBE pasar): PASO (sin error)
--- R29: un ENTREGADO no se borra ---
  borrar logicamente un ENTREGADO (DEBE caer 23514): SQLSTATE 23514 · constraint=orders_delivered_not_deleted
  poner ENTREGADO a uno ya borrado (DEBE caer 23514): SQLSTATE 23514 · constraint=orders_delivered_not_deleted
  borrar logicamente un PENDIENTE (DEBE pasar, R30): PASO (sin error)
--- R21/R22: indice unico TOTAL del correlativo ---
  duplicar (Y,905) con el original vivo (DEBE caer 23505): SQLSTATE 23505 · constraint=orders_order_year_order_sequence_key
  duplicar (Y,905) TRAS el borrado logico (DEBE caer 23505, R22): SQLSTATE 23505 · constraint=orders_order_year_order_sequence_key
--- R42: los huecos se aceptan ---
  insertar (Y,910) y luego (Y,915) sin nada en medio (DEBE pasar): PASO (sin error)
anio usado por el helper (UTC): 2026
```

El caso que muerde en R41 es el de **frontera**, no el feliz: `2026-12-31T20:00:00-05:00` ya es 2027 en
UTC, y por eso `order_year = 2026` cae con `23514` y `2027` pasa. `Y` es `new Date().getUTCFullYear()`,
no un literal.

## 5. Salida real de los tests

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida, exit 0)

$ pnpm run lint
> eslint
(sin salida, exit 0)

$ pnpm exec vitest run tests/unit/pedidos tests/integration/pedidos guard
 RUN  v4.1.10 C:/Users/Cristian/Documents/trabajo/arc/labs/.worktrees/QC-33-modelo-pedidos

 Test Files  17 passed (17)
      Tests  209 passed (209)
   Duration  3.48s
```

Desglose por archivo de la feature:

| Archivo | Casos |
| --- | --- |
| `tests/unit/pedidos/schema/pedidos-schema.test.ts` (**S**) | 23 |
| `tests/unit/pedidos/schema/pedidos-migration.test.ts` (**M**) | 23 |
| `tests/unit/pedidos/domain/order-number.test.ts` (**N**) | 4 |
| `tests/unit/pedidos/module-contract.test.ts` (**C**) | 9 |
| `tests/integration/pedidos/pedidos-constraints.int.test.ts` (**I**) | 27 |
| Guardias del repo (12 archivos, incluidas **G1/G2/G3**) | 123 |

**Las seis mutaciones de sensibilidad de T6 caen las seis** (aplicadas en memoria; el SQL en disco no se
toca), con el predicado extraido a funcion pura y aplicado dos veces: al SQL real, que pasa, y al mutado,
que falla.

1. `isTotalUniqueIndex` — anadir `WHERE "deleted_at" IS NULL` al indice unico da `false`.
2. `isRestrictOnDelete` — `RESTRICT` a `CASCADE` (y `SET NULL` / `SET DEFAULT` / `NO ACTION`) da `false`.
3. `isStrictlyPositiveCheck` — `> 0` a `>= 0` en la cantidad da `false`.
4. `hasDeliveredNotDeletedCheck` — quitar el CHECK del entregado da `false`; **y reformularlo a un
   `NOT (... AND ...)` equivalente tambien da `false`**, porque se compara el texto exacto.
5. `matchesUtcYearCheck` — quitar el `AT TIME ZONE 'UTC'` da `false`; cambiar `'UTC'` por
   `'America/Guayaquil'` da `false`.
6. `dropsBothEnumTypes` — quitar cualquiera de los dos `DROP TYPE` del DOWN da `false`.

**El barrido de `prisma.order` de T7 es una funcion pura aplicada dos veces** (patron de QC-32): a los
archivos reales de `lib`, `app`, `components`, `hooks`, `scripts` y `middleware.ts` da `[]`; y a esos
mismos **mas una entrada sintetica** con `prisma.order.findMany`, que **sale senalada**. La lista vacia
no lo es por vacuidad. Mismo patron para `prisma.recipe`, `prisma.unit` y `prisma.user`.

**El caso de R41 de T9 se comprobo en negativo**: se cambio la asercion a `UNIQUE_VIOLATION` y el test
cayo recibiendo `23514`; el archivo quedo restaurado. La asercion muerde de verdad contra Postgres.

## 6. Mapa R -> test (ejecutado, no intencion)

Abreviaturas: **S** = `tests/unit/pedidos/schema/pedidos-schema.test.ts` ·
**M** = `tests/unit/pedidos/schema/pedidos-migration.test.ts` ·
**N** = `tests/unit/pedidos/domain/order-number.test.ts` ·
**C** = `tests/unit/pedidos/module-contract.test.ts` ·
**I** = `tests/integration/pedidos/pedidos-constraints.int.test.ts` ·
**T8** = seccion 3 de este parte (base real) · **S4** = seccion 4 de este parte ·
**G1** = `tests/guards/guard-rls-force.test.ts` ·
**G2** = `tests/guards/guard-arquitectura-modulos.test.ts` ·
**G3** = `tests/guards/guard-dependencias-aprobadas.test.ts`.

| R | Estatico / unitario / guardia | Contra base real | Estado |
| --- | --- | --- | --- |
| R1 | S · «Order declara id uuid propio, receta, cantidad, unidad, precio, prioridad y estado» | I · «crea un pedido completo y lo relee sin perdida» | verde |
| R2 | S · «no existe ningun modelo de linea o item de pedido» | — (ausencia declarativa) | verde |
| R3 | S · «Order no declara cliente, destinatario ni columna equivalente» | I · caso extra sobre `information_schema` | verde |
| R4 | S · «Order no declara ninguna fecha de solicitud aparte de createdAt» | — (ausencia declarativa) | verde |
| R5 | S · «Recipe queda exactamente como la dejo QC-24: sin precio y sin campo de vuelta» | — | verde |
| R6 | S · «quantity es Decimal(14,4) y no hay ningun Float en Order» | I · «guarda y relee una cantidad con cuatro decimales sin perdida» | verde |
| R7 | M · «CHECK orders_quantity_positive con `> 0`, y cae si se cambia a `>= 0`» | I · «rechaza cantidad cero, negativa y ausente con 23514 / 23502» | verde |
| R8 | S · «unitPrice es Decimal(14,4), obligatorio y se llama unit_price» | I · «guarda y relee un precio unitario con cuatro decimales sin perdida» | verde |
| R9 | M · «CHECK orders_unit_price_non_negative con `>= 0`» | I · «rechaza precio negativo con 23514, acepta el cero, rechaza el ausente con 23502» | verde |
| R10 | S · «Order no declara total, subtotal ni columna derivada» · M · «la tabla no crea columna de total ni generada» | I · caso extra con las 14 columnas reales | verde |
| R11 | S · «Order no declara impuesto, descuento ni dato de facturacion» | — (ausencia declarativa) | verde |
| R12 | S · «unitId es uuid OBLIGATORIO y sin @relation» · M · «existe orders_unit_id_fkey» | I · «rechaza pedido sin unidad (23502) y con unit_id inexistente (23503)» | verde |
| R13 | M · «orders_unit_id_fkey es ON DELETE RESTRICT, y cae si se cambia a CASCADE» | I · «rechaza el borrado de una unidad usada con 23503, permite el de una libre» | verde |
| R14 | S · «recipeId es uuid OBLIGATORIO y sin @relation» · M · «existe orders_recipe_id_fkey» | I · «rechaza pedido sin receta (23502) y con recipe_id inexistente (23503)» | verde |
| R15 | M · «orders_recipe_id_fkey es ON DELETE RESTRICT» | I · «una receta borrada logicamente deja el pedido intacto; el borrado FISICO se rechaza con 23503» | verde |
| R16 | S · «OrderStatus y OrderPriority con sus valores exactos y en orden» | I · «rechaza estado y prioridad fuera del enum con 22P02» | verde |
| R17 | S · «status es obligatorio y su default es PENDIENTE» | I · «un pedido insertado sin estado queda PENDIENTE» | verde |
| R18 | S · «priority es NOT NULL con default BAJA» | I · «un pedido insertado sin prioridad queda BAJA, no NULL» | verde |
| R19 | C · «el modulo pedidos no declara ninguna transicion ni maquina de estados» | I · «la base acepta pasar de PENDIENTE a ENTREGADO y de ENTREGADO a PENDIENTE» | verde |
| R20 | S · «orderYear y orderSequence son enteros obligatorios» · M · «CHECK orders_order_sequence_positive» | I · «rechaza sin ano, sin posicion (23502) y con posicion cero o negativa (23514)» | verde |
| R21 | M · «CREATE UNIQUE INDEX sobre (order_year, order_sequence)» | I · «rechaza un segundo pedido con el mismo ano y posicion con 23505» · **S4** | verde |
| R22 | M · «el indice NO lleva WHERE, y cae si se le anade `WHERE deleted_at IS NULL`» | I · «tras el borrado logico, un segundo (ano, N) sigue fallando con 23505» · **S4** | verde |
| R23 | M · «el ano forma parte de la clave unica» | I · «acepta (2026, 1) y (2027, 1) a la vez» | verde |
| R24 | N · «formatOrderNumber compone 2026-0000001 con siete digitos y crece en vez de truncar» · C · «el barrel exporta formatOrderNumber y no hay otra composicion» · S · «Order no declara columna con el numero formateado» | — (funcion pura) | verde |
| R25 | S · «createdBy y updatedBy son uuid sin @relation» · M · «existen las dos FK de autoria» | I · «rechaza un autor inexistente con 23503» | verde |
| R26 | S · «createdBy y updatedBy son anulables» | I · «acepta un pedido sin autor y lo relee con ausencia de valor» | verde |
| R27 | S · «Order declara deletedAt anulable» | I · «tras el borrado logico la fila sigue completa, con su instante y su correlativo» | verde |
| R28 | S · «Order declara createdAt y updatedAt» | I · «created_at y updated_at se rellenan solos y updated_at cambia al modificar» | verde |
| R29 | M · «CHECK orders_delivered_not_deleted con su texto exacto, y cae si se quita» | I · «rechaza borrar un ENTREGADO con 23514 y poner ENTREGADO a uno borrado» · **S4** | verde |
| R30 | M · «el CHECK solo alcanza a ENTREGADO» | I · «acepta borrar un PENDIENTE y un EN_CURSO, y poner ENTREGADO a uno vivo» · **S4** | verde |
| R31 | S · «Order declara /// @module pedidos» · C · «ningun archivo consulta prisma.order, y el barrido senala una entrada sintetica» · G2 | — | verde |
| R32 | C · «pedidos no nombra prisma.recipe, prisma.unit ni prisma.user» · C · «pedidos importa recetas y unidades solo por el barrel» · G2 | — | verde |
| R33 | S · «las cuatro referencias son escalares uuid SIN @relation» · M · «las cuatro FK en el SQL» | I · «la base rechaza las cuatro referencias inexistentes» · **T8** (las cuatro con confdeltype r) | verde |
| R34 | C · «index.ts, solo domain/ports/adapters y ningun 'use server' alcanzable» · G2 | — | verde |
| R35 | C · «los valores del dominio coinciden, en orden, con los enum del esquema, y los defectos con los @default» | — | verde |
| R36 | S · «tabla y columnas en snake_case en ingles» · M · «identificadores en ingles, valores de enum en castellano» | — | verde |
| R37 | M · «orders queda con RLS activado y forzado» · G1 | **T8** (relrowsecurity y relforcerowsecurity en true) | verde |
| R38 | M · «down.sql borra la tabla y los dos tipos, en ese orden, y cae si se quita un DROP TYPE» | **T8** · ciclo migrate, rollback, migrate, con los dos tipos comprobados en pg_type | verde |
| R39 | C · «la feature no anade adaptadores driving, rutas ni Server Actions» | — (E2E diferido con motivo, decision 25) | verde |
| R40 | G3 · «toda dependencia de package.json tiene su fila en el registro» | — | verde |
| R41 | M · «CHECK orders_order_year_matches_created_at con su texto exacto, y cae si se le quita el AT TIME ZONE UTC» | I · «con created_at el 31/12/2026 a las 20:00 de Ecuador rechaza order_year 2026 con 23514 y acepta 2027» · **S4** | verde |
| R42 | M · «la migracion no crea ninguna restriccion de continuidad sobre order_sequence» | I · «acepta (ano, 1) y despues (ano, 5): los huecos no se rechazan ni se rellenan» · **S4** | verde |

**Los 42 requisitos tienen al menos un test ejecutado.** R2, R4, R5, R11, R24, R31, R32, R34, R35, R36,
R39 y R40 se cierran solo con estaticos, unitarios o guardias a proposito (`design.md > 9`); R37
anadiria un falso verde si se probara con Prisma, que se conecta como dueno de las tablas; **R38 se
cierra de verdad en T8**, no en el estatico, que solo lee texto.

## 7. Decisiones tomadas sobre la marcha, y lo que sube al leader

1. **`pnpm run db:migrate:create` no se pudo usar, y no se reseteo nada.** Aborta por drift: la base de
   desarrollo compartida tiene aplicada `20260903131417_suppliers_and_supplier_catalog_lines` (otra
   feature en paralelo), que no existe en el directorio de migraciones de esta rama, y Prisma exige
   `migrate reset`, que borra toda la base. **Alternativa no destructiva usada**: el SQL de Prisma se
   genero con `prisma migrate diff --from-schema-datamodel <schema de HEAD> --to-schema-datamodel
   db/schema.prisma --script` — los dos lados son datamodels, o sea sin conexion y sin shadow DB — y
   sobre esa salida se escribieron a mano las cuatro FK, los cinco CHECK, los dos ALTER de RLS y la
   cabecera. El bloque generado por Prisma quedo **literal**; lo unico reordenado es el indice unico por
   delante de los cuatro de FK, para respetar `design.md > 7.1`. El timestamp `20260903191204` lo puso
   el agente (UTC del momento), no Prisma; queda **posterior** a la migracion de suppliers, asi que
   `migrate deploy` la aplica en ultimo lugar, y de hecho lo hizo sin incidencias (seccion 3).
2. **Discrepancia menor en `tasks.md`, NO corregida por cuenta propia.** El «Hecho cuando» de T9 lista
   `R10` y **no lista `R8`**, pero la tabla de trazabilidad da a **R8** un test de la columna I («guarda
   y relee un precio unitario con cuatro decimales sin perdida») y a **R10** un guion («ausencia
   declarativa»). Parece un typo (`R10` por `R8`). **Se cubrieron los dos**: se implemento el caso de R8
   tal como lo pide la tabla, y se anadio un caso extra que lee `information_schema.columns` de `orders`
   y compara la lista completa de 14 columnas, que cierra R10 y R3 tambien contra la base. Es el unico
   caso del archivo de integracion que no esta en la columna I. **Queda a criterio del reviewer** si se
   borra o si se corrige el «Hecho cuando» de T9.
3. **`@@unique([orderYear, orderSequence], map: "orders_order_year_order_sequence_key")`** lleva el
   `map:` porque asi esta escrito literalmente en `design.md > 2.2`. El nombre coincide con el que
   Prisma generaria por defecto, o sea que el `map:` es documentacion, no un cambio de comportamiento.
4. **`RecipeId` se anadio al barrel de `recetas` sin tocar nada de QC-25.** El merge de QC-25 ya estaba
   en la rama; el contrato real se leyo antes de editar y la unica linea nueva se inserto entre los
   exports de `./domain/page` y `./domain/recipe-name`. Ningun test de `recetas` cambio de resultado
   (`tests/unit/recetas/module-contract.test.ts`: 5 passed).
5. **Ningun test de otra feature caduco**, como anticipaba `tasks.md`: no se altero ninguna tabla,
   columna ni firma existente. Las 12 guardias y los 209 tests de la corrida de la seccion 5 pasan.

### Preguntas abiertas: siguen abiertas las dos, y no se cerro ninguna

- **Pregunta 1 (del humano): el sistema, exporta alguna vez a un contable externo?** Sigue abierta. No
  afecta al esquema de esta ficha y nada de lo implementado la toca.
- **Pregunta 2 (de `spec_author`): quien asigna la posicion del correlativo, y que pasa con dos altas
  simultaneas?** Sigue abierta y **se sube a QC-34**, como fija `design.md > 5.3`. Esta ficha garantiza
  en la base que el numero **no se duplica** (indice unico, R21) y que **no se reutiliza** (indice
  **total**, R22, demostrado en la seccion 4 con la fila borrada), pero **no hay ninguna escritura en
  esta feature**, asi que no hay donde poner el calculo de la siguiente posicion. Con la decision 27
  (los huecos se aceptan) la estrategia que queda en cabeza para QC-34 es **max(order_sequence) + 1 con
  reintento ante 23505**; no se elige aqui. Si QC-34 no la resuelve, dos altas simultaneas del mismo ano
  fallaran una de las dos con un error de indice unico que nadie tradujo.
- Las preguntas 3, 4 y 5 **no se reabrieron**: las cerro el humano el 2026-09-03 y son las decisiones
  27, 28 y 29. Las **29 decisiones cerradas se respetaron sin excepcion**.
- Las tres preguntas de `design.md > 11` (SMALLINT para `order_year`, indices por `status` o
  `deleted_at`, la forma de `OrderContents` tras QC-34) **siguen abiertas y ninguna bloqueo nada**: se
  dejo `INTEGER`, no se creo ningun indice extra y `OrderContents` lleva los importes como texto.

## 8. Gate

`pnpm run typecheck`, `pnpm run lint` y los 17 archivos de test relacionados —los 5 de `pedidos` mas las
12 guardias— estan en verde (seccion 5), y el ciclo UP/DOWN/UP contra Postgres real esta en la
seccion 3.

**El gate completo (`./init.sh` sin flags, T10) lo corre el leader**, por decision explicita suya en esta
sesion: la corrida larga dentro del implementer corto el stream dos veces hoy. El PR
(`gh pr create --base dev --title "feat(QC-33): modelo de pedidos"`) se abre **despues** de que ese gate
termine en `== init OK ==`.

## 9. F2.3 (merge con `dev`) y un rojo AJENO que el leader tiene que ver antes del gate

**Merge limpio, sin conflictos.** `git fetch origin dev` + `git merge origin/dev` trajo **QC-42
(modelo-proveedores, PR #25)** y **QC-22 (pantalla-de-productos)**. Los dos archivos que preocupaban
—`db/schema.prisma` y `lib/modules/recetas/index.ts`— se fusionaron solos: QC-42 anade su bloque al
final del esquema, detras del de `Order`, y no toca `recetas`. **No hubo ninguna resolucion ambigua, o
sea que no hay nada que preguntarle al humano por este merge.**

Tras el merge, y con `pnpm install` + `prisma generate` + `next typegen` rehechos:

```
$ pnpm run typecheck   -> exit 0
$ pnpm run lint        -> exit 0
$ pnpm exec vitest run tests/unit/pedidos tests/integration/pedidos guard
 Test Files  17 passed (17)
      Tests  209 passed (209)
```

### `./init.sh --rapido` sale ROJO, y NO es por esta feature

```
✓ node v22.13.1
✓ dependencias presentes
✓ regla max-2-por-zona respetada (in_progress=4)
✓ specs presentes para features sdd en vuelo
✓ ninguna ficha sembrada esperando al board
✓ cada spec sembrado tiene su ficha, con el mismo slug
✓ typecheck paso
✓ lint paso
✗ 'pnpm run test:rapido' fallo

 Test Files  1 failed | 27 passed (28)
      Tests  8 failed | 316 passed (324)
```

**El unico archivo rojo es `tests/integration/identity/identity-seed.int.test.ts`**, en los ocho casos
que pasan por `resetIdentityToEmptyState`, que hace `tx.user.deleteMany({})` (linea 121).

**Diagnostico, hecho contra la base y no por deduccion.** Ejecutado `DELETE FROM users` dentro de una
transaccion revertida:

```
delete from users FALLA -> SQLSTATE 23503  constraint products_created_by_fkey  tabla products
```

La restriccion que lo bloquea es **`products_created_by_fkey`**, que es de **QC-20**, no de esta ficha.
La causa es una **fila residual en `products`** en la base de desarrollo compartida:
`name = 'FeldesQuack'`, `created_at = 2026-09-03T19:36:02.805Z`, con `created_by` y `updated_by`
apuntando al usuario `admin`. Encaja con una corrida de otra feature en vuelo (QC-22,
pantalla-de-productos), que quedo sin limpiar.

**Por que QC-33 no puede ser la causa:** `orders` tiene **0 filas** (todo lo que se escribio en las
verificaciones y en los tests fue dentro de transacciones revertidas), y **una tabla hija vacia no puede
violar una FK al borrar el padre**. Las FK `orders_created_by_fkey` / `orders_updated_by_fkey` existen,
pero no participan: el 23503 nombra explicitamente `products_created_by_fkey`.

**No se toco la base.** Borrar esa fila es una escritura destructiva sobre una base **compartida** con
features que corren en paralelo, y podria romper la corrida de quien la creo. **Se sube al leader** en
vez de resolverlo por cuenta propia (regla 6). El gate completo (T10) va a salir rojo por este mismo
motivo hasta que la fila se limpie o se decida otra cosa.

## 10. Segunda tanda: cinco tests ajenos ACOTADOS (2026-09-03)

El gate completo, que corrio el leader, saco **seis archivos rojos, no uno**. El fast gate se habia
quedado corto porque `vitest related` **no alcanza a los tests de alcance de otros modulos** — el mismo
agujero que documento QC-20 en `history.md`. **Cinco de los seis son de QC-33**; el sexto no (seccion 9).

El leader verifico los cinco en el worktree principal sobre `dev` limpio: **pasan alli y fallan aqui**.
Son de esta ficha.

**La causa es la misma en los cinco: una feature no puede cumplir la afirmacion de alcance de otra.**
Cuatro casos afirmaban `expect(schema).not.toMatch(/^\s*enum\s+\w+\s*\{/m)` —«ningun `enum` en TODO el
esquema»— y dos afirmaban lo equivalente contra la base. Se escribieron cuando la decision del repo era
«los conjuntos cerrados van como tabla», y **eran ciertas hasta hoy**. El humano decidio expresamente
que los conjuntos cerrados de QC-33 van como **enum de Prisma**, apartandose a conciencia del precedente
de `DocumentType` de QC-4 (decision cerrada 4). **Los tests no estaban mal escritos: se quedaron
viejos.**

**Acotar no es aflojar**, y el criterio es el que fijo QC-32 con sus diez tests ajenos: **ni un `toEqual`
degradado a `toContain`**. Lo unico que se borro en los cinco archivos son las **cuatro** lineas
`not.toMatch(/enum/)` que afirmaban sobre el repositorio entero; todo lo demas se sumo. El diff son
**308 inserciones y 9 borrados**.

| Archivo | Que afirmaba | Contra que afirma ahora | Muere ante |
| --- | --- | --- | --- |
| `tests/unit/identity/schema/identity-schema.test.ts` (2 casos) | cero `enum` en todo el esquema | `expectDocumentTypeIsNotAnEnum()`: ningun bloque `enum` se llama `/documen|tipodoc/i` **ni** declara ninguno de los `DOCUMENT_TYPE_CODES`, importados de `@/lib/modules/identity` (la contrapartida en TS de la fila `'CC'` que siembra la migracion de QC-4). Ningun codigo escrito a mano | `enum DocumentType { CC }` y `enum Clasificacion { CC MILILITRO }` |
| `tests/unit/inventario/schema/inventario-schema.test.ts` (1 caso) | idem | `expectUnitCatalogIsNotAnEnum()`: ningun `enum` se llama `/unit|unidad|uom|medida|measure/i` ni declara una palabra del catalogo. Las palabras se leen de los `INSERT INTO "units"` de las migraciones, y si no encuentra ninguna **el helper lanza** en vez de quedarse verde sin sujeto | `enum Unit { ALGO }` y `enum Clasificacion { MILILITRO }` |
| `tests/unit/recetas/schema/recetas-schema.test.ts` (1 caso) | idem | idem. El comentario de QC-32 que ya estaba **no se borro**: el nuevo va debajo | idem |
| `tests/integration/recetas/recetas-constraints.int.test.ts` | `toEqual([])` sobre **todos** los enum de `public` en Postgres | se traen los enum **con sus etiquetas** y se filtra por el **sujeto propio** —nombre con pinta de unidad, o etiqueta que coincida con un nombre o simbolo leido de `tx.unit.findMany`—; **se mantiene el `toEqual([])`** sobre esa lista. **Sin lista negra de `OrderStatus`/`OrderPriority`**, que ataria `recetas` a `pedidos`. Se anadio un `toBeGreaterThan(0)` sobre el numero de unidades para que el filtro no pueda quedarse sin sujeto | `CREATE TYPE "Unit" AS ENUM ('a')` y `CREATE TYPE "Clasificacion" AS ENUM ('kilogramo')` — detecta por nombre **y** por etiqueta |
| `tests/integration/unidades/unidades-constraints.int.test.ts` | `toEqual` con la lista **exacta** de FK hacia `units`: dos | **la lista exacta sigue siendo exacta**: se SUMA `{ conname: 'orders_unit_id_fkey', referencia: 'units', confdeltype: 'r', confupdtype: 'c' }`, primera por el `ORDER BY c.conname`. **Sigue siendo `toEqual`** | una FK de mas (`tmp_qc33_u_fkey`) y una FK de menos (`DROP CONSTRAINT orders_unit_id_fkey`) |

Las mutaciones de la columna «Muere ante» **se ejecutaron de verdad** y se revirtieron; las dos de
integracion vivieron dentro de la transaccion revertida del propio test, asi que **la base no se toco**.
Un acotado que ya no puede fallar no es un acotado: es un borrado.

En los cinco archivos queda escrito **por que** cambio y **que feature** lo cambio, con el estilo de los
acotados previos de QC-24 y QC-32 que ya vivian en esos mismos archivos.

### Salida real de esta tanda

```
$ pnpm run typecheck   -> exit 0
$ pnpm run lint        -> exit 0

$ pnpm exec vitest run <los cinco acotados> tests/unit/pedidos tests/integration/pedidos guard
 Test Files  22 passed (22)
      Tests  305 passed (305)

$ pnpm exec vitest related --run <los cinco acotados>
 Test Files  5 passed (5)
      Tests  96 passed (96)
```

### El sexto rojo sigue rojo, y es deliberado

`tests/integration/identity/identity-seed.int.test.ts` **no se toco, no se baseline y no se borro
ninguna fila de la base**, por decision del humano. Sigue rojo por la fila residual `FeldesQuack` en
`products`, que bloquea `user.deleteMany` contra `products_created_by_fkey` (QC-20). Diagnostico
completo en la seccion 9. **Se declara en el PR.**
