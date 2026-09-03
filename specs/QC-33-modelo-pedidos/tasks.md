# QC-33 — modelo-pedidos · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task lista los
**archivos que toca** con su ruta exacta desde la raíz del worktree: el leader los usa para la
validación de conflicto de `AGENTS.md > Paralelismo`, así que si una task acaba tocando un archivo
que no está listado, se anota aquí antes de seguir.

`<ts>` = el timestamp que genere Prisma; la carpeta de migración es `db/migrations/<ts>_orders/`.

**Aviso de conflicto.** Esta ficha crea el módulo `pedidos` entero (archivos nuevos, sin conflicto) y
toca **dos archivos de `recetas`**: `lib/modules/recetas/index.ts` y el archivo nuevo
`lib/modules/recetas/domain/recipe-catalog.ts` (`design.md > 6.4`). Si **QC-25** estuviera
`in_progress` a la vez, el leader lo resuelve **antes** del bloque C. `db/schema.prisma` se toca
solo por añadido al final del archivo, pero es un archivo compartido por todas las fichas de modelo.

**Ningún test de otra feature caduca con esta ficha** (`design.md > 1`): no se altera ninguna tabla,
columna ni firma existente. Si durante la implementación algún test ajeno se pone rojo, **se para y
se sube al leader**: significa que algo de lo de arriba dejó de ser cierto.

---

## Bloque A — Preparación

### [ ] T0. Dejar el worktree en condiciones de compilar y de hablar con la base
- Dep: ninguna. **Primera task, antes de cualquier `pnpm run db:*`.**
- Archivos: `.env` (git-ignorado, **no versionado**).
- El worktree se acaba de crear: hace falta `pnpm install` y `pnpm exec next typegen` (sin lo
  segundo `app/layout.tsx` no compila, por un tipo git-ignorado — **deuda conocida del arnés, no de
  esta feature**).
- Los worktrees no heredan el `.env` de la raíz. Hacen falta `DATABASE_URL` y `DIRECT_URL`: Prisma
  Migrate no funciona a través del pooler (`docs/architecture.md > Variables de entorno de la base`).
- **No se pega ninguna cadena de conexión en un archivo versionado ni en el chat.** Si falta algo, se
  pregunta al humano; no se inventa.
- **Hecho cuando:** `pnpm run typecheck` pasa sobre el árbol sin tocar y `pnpm exec prisma validate`
  corre desde el worktree sin error de «environment variable not found».

---

## Bloque B — Esquema y migración

### [ ] T1. Añadir los dos `enum` y el modelo `Order` a `db/schema.prisma`
- Dep: ninguna (T0 solo hace falta para los `db:*`).
- Archivos: `db/schema.prisma`.
- Los dos `enum` y el modelo `Order` tal como están en `design.md > 2.1` y `> 2.2`, **al final** del
  archivo, con su `/// @module pedidos` y con los comentarios «OJO 1» (el correlativo y su índice
  **total**) y «OJO 2» (las cuatro FK escalares sin `@relation`) completos. Sin ellos, el siguiente
  que lea el esquema creerá que falta algo y lo «arreglará».
- **No se modifica ningún modelo existente** (R5): ni `Recipe`, ni `Unit`, ni `User`, ni `Product`.
  En particular, **no** se añaden campos de vuelta `orders Order[]` en ninguno de ellos.
- Puntos que el revisor va a mirar uno a uno: los tres valores de `OrderStatus` y los cuatro de
  `OrderPriority` **en su orden exacto**; `@default(PENDIENTE)` y `@default(BAJA)`; `priority` y
  `status` **no** anulables; `quantity` y `unitPrice` `Decimal @db.Decimal(14, 4)`; `recipeId` y
  `unitId` obligatorios y `createdBy`/`updatedBy` anulables, los cuatro **sin `@relation`**;
  `@@unique([orderYear, orderSequence])` **sin nada más**; y que **no** existen columnas de total,
  impuestos, cliente ni fecha de solicitud.
- **Hecho cuando:** `pnpm exec prisma validate` pasa y `pnpm exec prisma generate` produce el cliente
  con `Order`, `OrderStatus` y `OrderPriority`.

### [ ] T2. Generar y completar a mano `migration.sql`
- Dep: T0, T1.
- Archivos: `db/migrations/<ts>_orders/migration.sql`.
- `pnpm run db:migrate:create` (no aplica nada) y después **completar a mano** lo que Prisma no
  modela, según `design.md > 7.1`: las **cuatro FK** (`design.md > 4`), los **cuatro `CHECK`**
  (`design.md > 3`) y los dos `ALTER TABLE` de RLS (`ENABLE` **y** `FORCE`).
- El `CHECK` del entregado se escribe **tal cual lo fijó el humano**:
  `CHECK ("deleted_at" IS NULL OR "status" <> 'ENTREGADO')`. No se reformula ni se «mejora».
- Revisar que el índice único que genera Prisma **no** lleve ningún `WHERE`: tiene que ser **total**
  (`design.md > 5.1`). Es lo contrario de `recipes_name_unique`, y es fácil de copiar mal.
- Cabecera del archivo indicando qué se escribió a mano y que toda migración futura sobre `orders`
  hay que revisarla para no borrarlo por drift (igual que QC-14, QC-20, QC-24 y QC-32).
- **No** se escribe ninguna guardia de datos `DO $$`: esta migración solo crea, no toca ninguna fila
  existente (`design.md > 7.1`).
- **Hecho cuando:** el archivo contiene, en este orden, `pgcrypto`, los dos `CREATE TYPE`,
  `CREATE TABLE "orders"`, el índice único **sin `WHERE`**, los cuatro índices de FK, las cuatro FK,
  los cuatro `CHECK` y los dos `ALTER` de RLS.

### [ ] T3. Escribir `down.sql` a mano
- Dep: T2.
- Archivos: `db/migrations/<ts>_orders/down.sql`.
- Exactamente lo de `design.md > 7.2`: `DROP TABLE "orders"` y **después** los dos `DROP TYPE`. Al
  revés, Postgres rechaza el `DROP TYPE` por dependencia.
- **Es el primer `down.sql` del repo que borra tipos**: un `DROP TABLE` no se lleva un `enum`, y
  dejarlos huérfanos no es «el esquema exacto anterior» (R38).
- **No** se toca `pgcrypto` (la crean también QC-4, QC-14, QC-24 y QC-32).
- **Hecho cuando:** existe el archivo y `./init.sh` no reporta «migraciones sin down.sql».

---

## Bloque C — El módulo `pedidos`

### [ ] T4. Crear el armazón del módulo `pedidos` y su contrato, y publicar `RecipeId` en `recetas`
- Dep: ninguna.
- Archivos **nuevos**: `lib/modules/pedidos/index.ts`,
  `lib/modules/pedidos/domain/order-number.ts`,
  `lib/modules/pedidos/domain/order-classification.ts`,
  `lib/modules/pedidos/domain/order-contents.ts`,
  `lib/modules/pedidos/ports/.gitkeep`,
  `lib/modules/pedidos/adapters/driven/.gitkeep`,
  `lib/modules/pedidos/adapters/driving/.gitkeep`,
  `lib/modules/recetas/domain/recipe-catalog.ts`.
- Archivos **modificados**: `lib/modules/recetas/index.ts` (una línea, **aditiva**).
- Estructura exacta de `design.md > 6.1`; el contenido de los tres archivos de dominio, tal cual está
  en `design.md > 5.4`, `> 6.2` y `> 6.3`; `RecipeId` como en `design.md > 6.4`.
- El `index.ts` de `pedidos` reexporta **solo** de `./domain`. Nada de `'use server'`,
  `@prisma/client` ni `next/*` en su cierre transitivo de imports. `RecipeId` y `UnitId` se importan
  **por el barrel** (`@/lib/modules/recetas`, `@/lib/modules/unidades`), nunca por ruta profunda.
- `lib/composition/index.ts` **no se toca**: `pedidos` no cablea nada (no hay puerto ni adaptador).
- **No se implementa ningún `RecipeCatalog` con `findRefs`** (`design.md > 8.4`): solo el tipo del
  identificador.
- **Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` pasan y
  `tests/guards/guard-arquitectura-modulos.test.ts` sigue verde con el módulo nuevo dentro.

---

## Bloque D — Tests estáticos y unitarios (no necesitan base)

### [ ] T5. [P] Contrato estático del esquema
- Dep: T1.
- Archivos: `tests/unit/pedidos/schema/pedidos-schema.test.ts`.
- Lee `db/schema.prisma` como **texto**. Reutilizar los helpers de
  `tests/unit/recetas/schema/recetas-schema.test.ts` y de
  `tests/unit/unidades/schema/unidades-schema.test.ts` (`parseModel`, `field`, `has`).
- Incluir **en positivo** las ausencias deliberadas (`design.md > 2.2`): sin `total` ni `subtotal`,
  sin impuestos ni descuentos, sin cliente ni destinatario, sin fecha de solicitud, y sin campos de
  vuelta `orders Order[]` en `Recipe`, `Unit` ni `User`. Una columna que no está no salta a la vista.
- **Hecho cuando:** pasa y cubre R1, R2, R3, R4, R5, R6, R8, R10, R11, R12, R14, R16, R17, R18, R20,
  R26, R27, R28, R31, R33, R36.

### [ ] T6. [P] Contrato estático del SQL de la migración
- Dep: T2, T3.
- Archivos: `tests/unit/pedidos/schema/pedidos-migration.test.ts`.
- Helpers de `tests/unit/recetas/schema/recetas-migration.test.ts` (`statements`, `stripSqlComments`,
  `findStatement`, `createdTables`, `droppedTables`).
- **Mutaciones de sensibilidad obligatorias** (`design.md > 9`), en memoria: (1) añadir
  `WHERE "deleted_at" IS NULL` al índice único, (2) cambiar un `RESTRICT` por `CASCADE`, (3) cambiar
  `> 0` por `>= 0` en el `CHECK` de la cantidad, (4) quitar el `CHECK` del entregado, (5) quitar un
  `DROP TYPE` del DOWN. El predicado debe caer en los cinco casos. Un test que no puede fallar no
  vigila nada.
- El `CHECK` del entregado se compara con su **texto exacto**, no con una expresión equivalente.
- **Hecho cuando:** pasa y cubre R7, R9, R13, R15, R21, R22, R23, R25, R29, R33, R36, R37, R38.

### [ ] T7. [P] Dominio y forma del módulo
- Dep: T4.
- Archivos: `tests/unit/pedidos/domain/order-number.test.ts`,
  `tests/unit/pedidos/module-contract.test.ts`.
- `order-number`: `(2026, 1) → '2026-0001'`, `(2026, 42)`, `(2026, 9999)` y que con `10000` el número
  **crece** en vez de truncarse (pregunta abierta 5 de `requirements.md`).
- `module-contract`: la forma del módulo y las fronteras de `design.md > 9`, incluido el barrido como
  **función pura** aplicada dos veces —a los archivos reales (`[]`) y a esos mismos más una entrada
  sintética con `prisma.order.findMany`, que **debe** salir señalada—, para que la lista vacía no lo
  sea por vacuidad (patrón de QC-32).
- **R35 va aquí**: leer los dos `enum` de `db/schema.prisma` y compararlos **valor a valor y en
  orden** con `ORDER_STATUS_VALUES` y `ORDER_PRIORITY_VALUES`, y los dos `@default` con
  `DEFAULT_ORDER_STATUS` / `DEFAULT_ORDER_PRIORITY`. Es lo único que detecta que el duplicado del
  dominio y el esquema se han desincronizado (`design.md > 6.2`).
- **Hecho cuando:** pasan y cubren R24, R32, R34, R35, R39.

---

## Bloque E — Base de datos real

### [ ] T8. Aplicar y revertir de verdad
- Dep: T0, T2, T3.
- Archivos: ninguno versionado; la salida se pega en `progress/impl_QC-33-modelo-pedidos.md`.
- Ciclo completo: `pnpm run db:migrate` → comprobar el esquema **real** (`orders` en
  `information_schema`; los cuatro `pg_constraint` de tipo `f` con `confdeltype = 'r'`; los cuatro
  `CHECK` en `pg_constraint` con su expresión; el índice único en `pg_indexes` **sin predicado**;
  `relrowsecurity` y `relforcerowsecurity` en `pg_class`; los dos tipos en `pg_type`) →
  `pnpm run db:rollback` → comprobar que `orders` **y los dos tipos** desaparecen, que no desaparece
  ninguna tabla de `identity`, `inventario`, `recetas` ni `unidades`, y que `_prisma_migrations`
  queda coherente → `pnpm run db:migrate` otra vez.
- **Hecho cuando:** el ciclo termina como se espera, la salida queda pegada en
  `progress/impl_QC-33-modelo-pedidos.md`, y cierra **R38** en su forma real (el test estático solo
  mira el texto del SQL).

### [ ] T9. Tests de integración contra Postgres real
- Dep: T8, T5 (para no duplicar lo que ya cubre el estático).
- Archivos: `tests/integration/pedidos/pedidos-constraints.int.test.ts`.
- Cada caso dentro de `prisma.$transaction` que termina en `ROLLBACK`; toda operación que se espera
  que falle, envuelta en `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` y ejecutada con `$executeRaw`. Se
  afirma sobre el **SQLSTATE** (`23502`, `23503`, `23505`, `23514`, `22P02`), nunca sobre el texto del
  error: en esta máquina Postgres responde en español. Copiar los helpers de
  `tests/integration/recetas/recetas-constraints.int.test.ts`.
- **Cada caso crea su propia unidad, presentación, producto, receta y usuario dentro de la
  transacción**: las cuatro FK son reales y no se depende de ningún seed.
- Los cuatro casos del `CHECK` del entregado, no uno (`design.md > 9`), y el caso de R22 **con la
  fila borrada** —crear `(2026, 1)`, borrarlo lógicamente, y comprobar que un segundo `(2026, 1)`
  sigue fallando—, que es el que distingue esta ficha de QC-24.
- `beforeAll` que falle con un mensaje claro («corre `pnpm run db:migrate`») si `orders` no existe.
- Casos exactos: los de la tabla de trazabilidad, columna **I**.
- **Hecho cuando:** todos pasan y cubren R1, R6, R7, R9, R10, R12, R13, R14, R15, R16, R17, R18, R19,
  R20, R21, R22, R23, R25, R26, R27, R28, R29, R30, R33.

---

## Bloque F — Cierre

### [ ] T10. Sincronizar con `dev` y correr el gate completo
- Dep: T0–T9.
- Archivos: ninguno (salvo lo que traiga el merge).
- `git fetch origin dev` → `git merge origin/dev` → `./init.sh` **sin flags**. El modo rápido no vale
  aquí: lo que esta feature acopla es SQL, nombres de archivo y la forma del árbol de módulos, y el
  grafo de imports no lo ve (`docs/verification.md > Lo que --rapido NO cubre`).
- Atención especial al merge sobre `db/schema.prisma` y sobre `lib/modules/recetas/index.ts`.
- **Hecho cuando:** `./init.sh` termina en `== init OK ==`, con todas las guardias en verde.

### [ ] T11. Documentar el mapa `R<n> → test`
- Dep: T10.
- Archivos: `progress/impl_QC-33-modelo-pedidos.md`.
- Copiar la tabla de trazabilidad de abajo con la **salida real** de los tests, no con la intención.
- Si durante la implementación se resuelve alguna de las preguntas abiertas 2–5 de `requirements.md`
  (o alguna de `design.md > 11`), se anota aquí; **no** se cierra por cuenta propia (regla 6 de
  `CLAUDE.md`). Las preguntas 2, 3 y 4 son las que hay que **subir a QC-34**: son las que el esquema
  no puede cerrar (`design.md > 5.3`).
- **Hecho cuando:** el archivo existe, cada R1–R40 tiene al menos un test **ejecutado** (no solo
  escrito) y el reviewer lo valida contra `CHECKPOINTS.md > Trazabilidad`.

---

## Trazabilidad

Abreviaturas:
**S** = `tests/unit/pedidos/schema/pedidos-schema.test.ts` ·
**M** = `tests/unit/pedidos/schema/pedidos-migration.test.ts` ·
**N** = `tests/unit/pedidos/domain/order-number.test.ts` ·
**C** = `tests/unit/pedidos/module-contract.test.ts` ·
**I** = `tests/integration/pedidos/pedidos-constraints.int.test.ts` ·
**T8** = la task T8 de este archivo (evidencia contra base real en
`progress/impl_QC-33-modelo-pedidos.md`) ·
**G1** = `tests/guards/guard-rls-force.test.ts` ·
**G2** = `tests/guards/guard-arquitectura-modulos.test.ts` ·
**G3** = `tests/guards/guard-dependencias-aprobadas.test.ts`.

| R | Test estático / unitario / guardia | Test contra base real |
| --- | --- | --- |
| R1 | S · «Order declara id uuid propio, receta, cantidad, unidad, precio, prioridad y estado» | I · «crea un pedido completo y lo relee sin perdida» |
| R2 | S · «no existe ningun modelo de linea o item de pedido, y Order no tiene coleccion de lineas» | — (ausencia declarativa) |
| R3 | S · «Order no declara cliente, destinatario ni ninguna columna equivalente» | — (ausencia declarativa) |
| R4 | S · «Order no declara ninguna fecha de solicitud aparte de createdAt» | — (ausencia declarativa) |
| R5 | S · «Recipe queda exactamente como la dejo QC-24: sin precio y sin campo de vuelta hacia Order» | — |
| R6 | S · «quantity es Decimal(14,4) y no hay ningun Float en Order» | I · «guarda y relee una cantidad con cuatro decimales sin perdida» |
| R7 | M · «existe el CHECK orders_quantity_positive con `> 0`, y el test cae si se cambia a `>= 0`» | I · «rechaza cantidad cero, negativa y ausente con SQLSTATE 23514 / 23502» |
| R8 | S · «unitPrice es Decimal(14,4), obligatorio, y se llama unit_price (unitario, no total)» | I · «guarda y relee un precio unitario con cuatro decimales sin perdida» |
| R9 | M · «existe el CHECK orders_unit_price_non_negative con `>= 0`» | I · «rechaza un precio negativo con 23514, acepta el precio cero y rechaza el precio ausente con 23502» |
| R10 | S · «Order no declara total, subtotal ni ninguna columna derivada» · M · «la tabla orders no crea ninguna columna de total ni columna generada» | — (ausencia declarativa) |
| R11 | S · «Order no declara impuesto, descuento ni dato de facturacion» | — (ausencia declarativa) |
| R12 | S · «unitId es uuid OBLIGATORIO y sin @relation» · M · «existe orders_unit_id_fkey» | I · «rechaza un pedido sin unidad (23502) y con unit_id inexistente (23503)» |
| R13 | M · «orders_unit_id_fkey es ON DELETE RESTRICT, y el test cae si se cambia a CASCADE» | I · «rechaza el borrado de una unidad usada por un pedido con 23503, y permite el de una unidad libre» |
| R14 | S · «recipeId es uuid OBLIGATORIO y sin @relation» · M · «existe orders_recipe_id_fkey» | I · «rechaza un pedido sin receta (23502) y con recipe_id inexistente (23503)» |
| R15 | M · «orders_recipe_id_fkey es ON DELETE RESTRICT» | I · «una receta borrada logicamente deja el pedido intacto apuntando a ella; el borrado FISICO de esa receta se rechaza con 23503» |
| R16 | S · «OrderStatus declara PENDIENTE, EN_CURSO, ENTREGADO y OrderPriority BAJA, MEDIA, ALTA, CRITICA, en ese orden y sin ningun valor mas» | I · «rechaza un estado y una prioridad fuera del enum con SQLSTATE 22P02» |
| R17 | S · «status es obligatorio y su default es PENDIENTE» | I · «un pedido insertado sin estado queda PENDIENTE» |
| R18 | S · «priority es NOT NULL con default BAJA, no anulable» | I · «un pedido insertado sin prioridad queda BAJA, no NULL» |
| R19 | C · «el modulo pedidos no declara ninguna transicion ni maquina de estados» | I · «la base acepta pasar de PENDIENTE a ENTREGADO y de ENTREGADO a PENDIENTE» |
| R20 | S · «orderYear y orderSequence son enteros obligatorios» · M · «existe el CHECK orders_order_sequence_positive» | I · «rechaza un pedido sin año, sin posicion (23502) y con posicion cero o negativa (23514)» |
| R21 | M · «existe CREATE UNIQUE INDEX sobre (order_year, order_sequence)» | I · «rechaza un segundo pedido con el mismo año y posicion con SQLSTATE 23505» |
| R22 | M · «el indice unico del correlativo NO lleva WHERE, y el test cae si se le añade `WHERE deleted_at IS NULL`» | I · «tras borrar logicamente el pedido (2026, 1), un segundo (2026, 1) sigue fallando con 23505» |
| R23 | M · «el año forma parte de la clave unica» | I · «acepta (2026, 1) y (2027, 1) a la vez» |
| R24 | N · «formatOrderNumber compone 2026-0001 y crece en vez de truncar» · C · «el barrel de pedidos exporta formatOrderNumber y no hay ninguna otra composicion del numero visible» · S · «Order no declara ninguna columna con el numero formateado» | — (propiedad de una funcion pura) |
| R25 | S · «createdBy y updatedBy son uuid sin @relation» · M · «existen orders_created_by_fkey y orders_updated_by_fkey» | I · «rechaza un autor inexistente con 23503» |
| R26 | S · «createdBy y updatedBy son anulables» | I · «acepta un pedido sin autor y lo relee con ausencia de valor» |
| R27 | S · «Order declara deletedAt anulable» | I · «tras el borrado logico la fila sigue completa, con su instante de borrado y su correlativo» |
| R28 | S · «Order declara createdAt y updatedAt» | I · «created_at y updated_at se rellenan solos y updated_at cambia al modificar» |
| R29 | M · «existe el CHECK orders_delivered_not_deleted con su texto exacto, y el test cae si se quita» | I · «rechaza borrar un ENTREGADO con 23514, y rechaza poner ENTREGADO a uno ya borrado» |
| R30 | M · «el CHECK solo alcanza a ENTREGADO» | I · «acepta borrar logicamente un PENDIENTE y un EN_CURSO, y acepta poner ENTREGADO a un pedido vivo» |
| R31 | S · «Order declara /// @module pedidos» · C · «ningun archivo del repo consulta prisma.order, y el barrido señala una entrada sintetica que si lo hace» · G2 | — |
| R32 | C · «pedidos no nombra prisma.recipe, prisma.unit ni prisma.user» · C · «pedidos importa recetas y unidades solo por el barrel, y los dos barrels publican lo que usa» · G2 | — |
| R33 | S · «las cuatro referencias son escalares uuid SIN @relation y Recipe/Unit/User no tienen campos de vuelta» · M · «las cuatro FK estan escritas en el SQL» | I · «la base rechaza las cuatro referencias inexistentes aunque Prisma no declare ninguna relacion» |
| R34 | C · «el modulo pedidos tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel» · G2 | — |
| R35 | C · «los valores del dominio coinciden, en orden, con los enum del esquema, y los dos defectos con los @default» | — (propiedad del texto del esquema y de dos constantes) |
| R36 | S · «la tabla y sus columnas mapean a snake_case en ingles» · M · «todos los identificadores creados por la migracion estan en ingles, y los valores de los enum son los que fijo el humano» | — (propiedad del texto) |
| R37 | M · «orders queda con RLS activado y forzado» · G1 | — (un test de RLS con Prisma sale verde pase lo que pase: `design.md > 9`) |
| R38 | M · «down.sql borra la tabla y los dos tipos, en ese orden, y nada mas; y el test cae si se quita un DROP TYPE» | **T8** · ciclo migrate → rollback → migrate, con los dos tipos comprobados en `pg_type` |
| R39 | C · «la feature no añade adaptadores driving, rutas ni Server Actions» | — (no hay flujo navegable: E2E diferido con motivo, decision cerrada 25) |
| R40 | G3 · «toda dependencia de package.json tiene su fila en el registro» | — |

Los 40 requisitos tienen al menos un test ejecutable. **R2, R3, R4, R5, R10, R11, R24, R31, R32,
R34, R35, R36, R37, R39 y R40 se cierran solo con tests estáticos, unitarios o guardias, a
propósito**: son propiedades del texto del esquema, de una función pura o del árbol de archivos, y
una base real no añadiría nada — en el caso de R37 añadiría un falso verde
(`docs/architecture.md > Acceso a datos y autorizacion`). **R38 se cierra de verdad en T8**, no en el
test estático, que solo lee texto.
