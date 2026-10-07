# QC-24 — modelo-recetas · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task lista los
**archivos que toca** con su ruta exacta desde la raíz del worktree: el leader los usa para la
validación de conflicto de `AGENTS.md > Paralelismo`, así que si una task acaba tocando un
archivo que no está listado, se anota antes de seguir.

`<ts>` = el timestamp que genere Prisma; la carpeta de migración es
`db/migrations/<ts>_recipes_and_recipe_lines/`.

**Aviso de conflicto:** T5 toca `lib/modules/inventario/index.ts`, que también es territorio de
QC-20. Si QC-20 estuviera `in_progress` a la vez, el leader lo resuelve antes de arrancar el
bloque C.

**Archivos tocados FUERA de esta lista** (se anotan aquí porque la cabecera lo exige). Son
**dos, y por el mismo motivo**: tests de otras features que afirmaban el **censo global del
repo** —cuántos modelos tiene el esquema, cuántas migraciones hay— en vez de lo que su propia
feature garantiza. Un test así se pone rojo en cuanto llega la feature siguiente, y la siguiente
fue QC-24. Los dos se **acotaron, no se borraron**, conservando lo que sus requisitos vigilan y
con el porqué fechado dentro del propio test.

1. `tests/unit/inventario/schema/inventario-schema.test.ts`, de **QC-14**. Dos de sus casos medían
el estado global del repo —el censo de **todos** los modelos del esquema, y que
`lib/modules/inventario/domain/` estuviera vacía con el barrel en `export {};`— en vez de lo que
QC-14 garantiza sobre sí misma, así que se ponían rojos en cuanto llegaba la feature siguiente.
Los rompió esta ficha: T1 añade dos modelos y T5 publica el contrato de `inventario` **por
diseño** (`design.md > 5.2`). Se conserva lo que QC-14 R3 y R23 vigilan.

2. `tests/unit/identity/credential-policy-contract.test.ts`, de **QC-19**, que entró en `dev`
   mientras se implementaba esta ficha y salió a la luz al mergear. Tres aserciones, mismo
   patrón: el censo de modelos del esquema (R20), la lista cerrada de las cuatro migraciones
   que había aquel día (R21), y un barrido de palabras sobre el texto del esquema **con los
   comentarios dentro**, que la prosa de QC-24 rompía. Se conserva lo que QC-19 R20 y R21
   vigilan. **No se tocó nada más de QC-19**, ni su spec ni su código de producción.

Detalle de los dos en `progress/impl_QC-24-modelo-recetas.md`, y del primero en el bloqueante 1
de `progress/review_QC-24-modelo-recetas.md`.

---

## Bloque A — Preparación

### [x] T0. Dejar el `.env` disponible dentro del worktree
- Dep: ninguna. **Primera task, antes de cualquier `pnpm run db:*`.**
- Archivos: `.env` (git-ignorado, **no versionado**).
- Los worktrees no heredan el `.env` de la raíz. Hay que dejarlo disponible en
  `.worktrees/QC-24-modelo-recetas/` con `DATABASE_URL` y `DIRECT_URL`: Prisma Migrate no
  funciona a través del pooler (`docs/architecture.md > Variables de entorno de la base`).
- **No se pega ninguna cadena de conexión en un archivo versionado ni en el chat.** Si falta
  algo, se pregunta al humano; no se inventa.
- **Hecho cuando:** `pnpm exec prisma validate` corre desde el worktree sin error de
  «environment variable not found».

---

## Bloque B — Esquema y migración

### [x] T1. Añadir los modelos `Recipe` y `RecipeLine` a `db/schema.prisma`
- Dep: ninguna (T0 solo hace falta para los `db:*`).
- Archivos: `db/schema.prisma`.
- Los dos modelos tal como están en `design.md > 2`, **añadidos al final**, sin tocar
  `DocumentType`, `Role`, `User`, `Presentation` ni `Product`. Cada uno con su
  `/// @module recetas` dentro del bloque de comentarios que precede al `model`.
- Puntos que el revisor va a mirar uno a uno: `quantity` es `Decimal @db.Decimal(14, 4)` y
  **nunca** `Float`; `productId`, `createdBy` y `updatedBy` son `@db.Uuid` **sin `@relation`**;
  `createdBy` y `updatedBy` son **anulables** (`String?`, decisión cerrada 22) mientras que
  `productId` y `recipeId` son obligatorios;
  la relación `recipe` declara `onDelete: Cascade`; existen `@@unique([recipeId, productId])`,
  `@@index([productId])`, `@@index([createdBy])`, `@@index([updatedBy])`; **no** hay `@unique`
  ni `@@unique` sobre `name` ni sobre `nameNormalized`; `Recipe` tiene `deletedAt` y
  `RecipeLine` **no**; `steps` es `Json @default("[]")` y no anulable.
- Dejar en el esquema los dos comentarios «OJO» de `design.md > 2`: sin ellos, el siguiente que
  lea creerá que falta un `@relation` y que falta el `@unique`, y los «arreglará».
- **Hecho cuando:** `pnpm exec prisma validate` pasa, `pnpm exec prisma generate` produce el
  cliente con `Recipe` y `RecipeLine`, y `pnpm run typecheck` pasa.

### [x] T2. Generar y completar a mano `migration.sql`
- Dep: T0, T1.
- Archivos: `db/migrations/<ts>_recipes_and_recipe_lines/migration.sql`.
- `pnpm run db:migrate:create` (no aplica nada) y después **completar a mano** lo que Prisma no
  modela, según `design.md > 4`: `CREATE EXTENSION IF NOT EXISTS pgcrypto`, **las tres FK que
  cruzan de módulo** (`recipe_lines_product_id_fkey`, `recipes_created_by_fkey`,
  `recipes_updated_by_fkey`, las tres `ON DELETE RESTRICT ON UPDATE CASCADE`; las dos de
  auditoría sobre columnas `UUID` **anulables**, y **nunca** `ON DELETE SET NULL`,
  `design.md > 4.1`), el índice único
  **parcial** `recipes_name_unique`, el `CHECK` `recipe_lines_quantity_positive` y los cuatro
  `ALTER TABLE` de RLS (`ENABLE` **y** `FORCE`, las dos tablas).
- Cabecera del archivo indicando qué se escribió a mano y que toda migración futura de estas
  tablas hay que revisarla para no borrarlo por drift (igual que la de QC-14). Mencionar
  explícitamente que las tres FK **no** las regenera Prisma porque los campos son escalares.
- Orden del UP: el de `design.md > 4.6`.
- **Hecho cuando:** el archivo contiene las dos `CREATE TABLE` (`recipes` antes que
  `recipe_lines`), las **cuatro** FK (la de receta→línea con `ON DELETE CASCADE` y las tres a
  mano con `RESTRICT`), los cuatro índices, el índice único parcial, el `CHECK > 0` y los cuatro
  `ALTER` de RLS.

### [x] T3. Escribir `down.sql` a mano
- Dep: T2.
- Archivos: `db/migrations/<ts>_recipes_and_recipe_lines/down.sql`.
- Exactamente dos sentencias, en orden inverso al UP: `DROP TABLE IF EXISTS "recipe_lines";` y
  `DROP TABLE IF EXISTS "recipes";`. Nada más: índices, FK y `CHECK` caen con sus tablas. **No**
  se toca `pgcrypto` (la crean también QC-4 y QC-14).
- La decisión 22 (autor anulable) **no cambia el DOWN**: las FK de auditoría caen con su tabla,
  así que sigue siendo exactamente el mismo par de `DROP TABLE`. Se anota para que nadie añada
  un `ALTER TABLE ... DROP CONSTRAINT` de más «por simetría».
- **Hecho cuando:** existe el archivo y `./init.sh` no reporta «migraciones sin down.sql».

---

## Bloque C — Módulo `recetas` y contrato de `inventario`

### [x] T4. Crear el armazón del módulo `recetas`
- Dep: ninguna.
- Archivos: `lib/modules/recetas/index.ts`, `lib/modules/recetas/domain/recipe-name.ts`,
  `lib/modules/recetas/ports/.gitkeep`, `lib/modules/recetas/adapters/driven/.gitkeep`,
  `lib/modules/recetas/adapters/driving/.gitkeep`.
- Estructura exacta de `design.md > 5.1`. `normalizeRecipeName` tal cual en `design.md > 3`:
  función pura, sin imports, sin `any`.
- El `index.ts` reexporta **solo** de `./domain`. Nada de `'use server'`, `@prisma/client` ni
  `next/*` en su cierre transitivo de imports.
- **Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` pasan, y
  `tests/guards/guard-arquitectura-modulos.test.ts` sigue en verde con el módulo nuevo dentro.

### [x] T5. Publicar el contrato de `inventario` hacia otros módulos
- Dep: ninguna (independiente de T4, pero se revisa junto con él).
- Archivos: `lib/modules/inventario/domain/product-catalog.ts`,
  `lib/modules/inventario/index.ts`.
- Los tipos `ProductId`, `ProductRef` y la interfaz `ProductCatalog` tal como están en
  `design.md > 5.2`, y el barrel dejando de ser `export {}` para reexportarlos **como tipos**
  (`export type { ... }`).
- **Solo tipos**: ninguna implementación, ningún import de Prisma. La implementación
  (`product-catalog-prisma.ts`) y su cableado son de QC-25.
- Borrar el `.gitkeep` de `lib/modules/inventario/domain/` si lo hubiera, y actualizar el
  comentario de cabecera del `index.ts`, que hoy dice que el módulo «todavía no tiene
  contenido».
- **Hecho cuando:** `pnpm run typecheck` pasa y `@/lib/modules/inventario` exporta los tres
  símbolos de tipo.

### [x] T6. Confirmar que `lib/composition/index.ts` NO se toca
- Dep: T4, T5.
- Archivos: ninguno.
- Comprobación explícita, no un olvido: en esta ficha no hay puertos ni adaptadores que
  cablear (`design.md > 5.4`). Si el implementer siente la necesidad de tocarlo, ha construido
  algo que no está en el alcance y para antes de seguir.
- **Hecho cuando:** `git diff --stat lib/composition/` está vacío al cerrar la feature.

---

## Bloque D — Tests estáticos y unitarios (no necesitan base)

### [x] T7. [P] Contrato estático del esquema
- Dep: T1.
- Archivos: `tests/unit/recetas/schema/recetas-schema.test.ts`.
- Lee `db/schema.prisma` como **texto**. Reutilizar los helpers de
  `tests/unit/inventario/schema/inventario-schema.test.ts` (`parseModel`, `field`, `has`).
- Casos exactos: los de la tabla de trazabilidad, columna **S**. Incluir en **positivo** los dos
  ausentes deliberados: **ningún** `@relation` desde `RecipeLine` a `Product` ni desde `Recipe`
  a `User`, y **ningún** `@unique` sobre el nombre.
- **Hecho cuando:** pasa y cubre R1, R2, R3, R4, R5, R6, R8, R10, R13, R15, R17, R19, R21, R22,
  R23, R24, R28, R33.

### [x] T8. [P] Contrato estático del SQL de la migración
- Dep: T2, T3.
- Archivos: `tests/unit/recetas/schema/recetas-migration.test.ts`.
- Lee `migration.sql` y `down.sql` como texto, con los helpers de
  `tests/unit/inventario/schema/inventario-migration.test.ts` (`statements`, `stripSqlComments`,
  `findStatement`, `createdTables`, `droppedTables`).
- **Tests de sensibilidad obligatorios** (QC-14 los estrenó): mutar en memoria `> 0` a `>= 0`,
  quitar el `WHERE "deleted_at" IS NULL` del índice único, cambiar `DECIMAL(14,4)` por
  `DOUBLE PRECISION` y cambiar un `RESTRICT` por `CASCADE`, y comprobar que el predicado cae en
  los cuatro casos. Un test que no puede fallar no vigila nada.
- **Hecho cuando:** pasa y cubre R3, R5, R7, R9, R11, R13, R14, R16, R19, R21, R25, R27, R28,
  R29, R30, R33.

### [x] T9. [P] La normalización del nombre
- Dep: T4.
- Archivos: `tests/unit/recetas/domain/recipe-name.test.ts`.
- Casos: acentos (`Bidón` → `bidon`), mayúsculas, signos y espacios (los tres ejemplos de
  QC-20 D12), cadena vacía, e **idempotencia** (`f(f(x)) === f(x)`), que es la propiedad que
  hace segura la columna persistida.
- **Hecho cuando:** pasa y cubre R8.

### [x] T10. [P] Forma del módulo nuevo y frontera con `inventario`
- Dep: T4, T5.
- Archivos: `tests/unit/recetas/module-contract.test.ts`.
- Lee el árbol de `lib/modules/recetas/**` y el texto de sus archivos. Afirma: `index.ts` existe
  y solo reexporta de `./domain`; las carpetas del módulo son exactamente `domain`, `ports` y
  `adapters`; **no** hay `'use server'` alcanzable desde el barrel; **no** aparece
  `prisma.product`, `@prisma/client` ni ninguna ruta profunda a `inventario`; y
  `@/lib/modules/inventario` publica `ProductCatalog`. Afirma además que la feature **no** crea
  ningún archivo en `adapters/driving/` ni ninguna ruta de `app/` (R31).
- **Hecho cuando:** pasa y cubre R18, R20, R31, y refuerza R8.

---

## Bloque E — Base de datos real

### [x] T11. Aplicar y revertir la migración de verdad (ciclo apply → rollback → apply)
- Dep: T0, T2, T3.
- Archivos: ninguno versionado; la salida se pega en `progress/impl_QC-24-modelo-recetas.md`.
- `pnpm run db:migrate` → comprobar el esquema real (las dos tablas, las **cuatro** FK en
  `pg_constraint` con su `confdeltype`, el `CHECK`, el índice único parcial en `pg_indexes` con
  su `WHERE`, `relrowsecurity` y `relforcerowsecurity` en `pg_class`) → `pnpm run db:rollback` →
  comprobar que las dos tablas desaparecen, que **no** desaparece ninguna tabla de `identity` ni
  de `inventario` y que `_prisma_migrations` queda coherente → volver a aplicar.
- **Hecho cuando:** el ciclo termina limpio, la salida queda pegada en
  `progress/impl_QC-24-modelo-recetas.md`, y cierra **R30** en su forma real (el test estático
  solo mira el texto del SQL).

### [x] T12. Tests de integración contra Postgres real
- Dep: T11, T7 (para no duplicar lo que ya cubre el estático).
- Archivos: `tests/integration/recetas/recetas-constraints.int.test.ts`.
- Cada caso dentro de `prisma.$transaction` que termina en `ROLLBACK`; toda operación que se
  espera que falle, envuelta en `SAVEPOINT` / `ROLLBACK TO SAVEPOINT`. Se afirma sobre el
  **SQLSTATE** (`23502`, `23503`, `23505`, `23514`), nunca sobre el texto del error. Copiar los
  helpers de `tests/integration/inventario/inventario-constraints.int.test.ts`.
- **Cada caso crea sus propios usuario y producto dentro de la transacción**: las tres FK son
  reales y no se depende del seed. El autor es **opcional** (R33), así que hay que cubrir los dos
  caminos: receta con autor real y receta sin autor.
- `beforeAll` que falle con un mensaje claro («corre `pnpm run db:migrate`») si `recipes` o
  `recipe_lines` no existen.
- Casos exactos: los de la tabla de trazabilidad, columna **I**.
- **Hecho cuando:** todos los casos pasan y cubren R1, R2, R3, R4, R5, R6, R7, R9, R10, R11,
  R12, R13, R14, R15, R16, R19, R21, R22, R23, R24, R25, R26, R27, R33.

---

## Bloque F — Cierre

### [x] T13. Sincronizar con `dev` y correr el gate completo (pendiente del leader)
- Dep: T0–T12.
- Archivos: ninguno (salvo lo que traiga el merge).
- **La corre el leader, no el implementer** (`AGENTS.md > Regla del gate`), igual que la T9
  de QC-12. Se marca `[x]` porque la task está cerrada por el lado del implementer —no hay
  nada más que preparar— y queda **anotada como pendiente del leader** para que la ausencia
  quede registrada y no silenciada. El implementer corrió `typecheck`, `lint` y, tras el
  rechazo del reviewer del 2026-09-02, **la suite completa** (ver
  `progress/impl_QC-24-modelo-recetas.md > Salida real de los tests`).
- `git fetch origin dev` → `git merge origin/dev` → `./init.sh` **sin flags**. El modo rápido no
  vale aquí: lo que esta feature acopla es SQL, nombres de archivo y la forma del árbol de
  módulos, y el grafo de imports no lo ve (`docs/gate.md > Lo que --rapido NO cubre`).
- Atención especial al merge sobre `lib/modules/inventario/index.ts` si QC-20 tocó el mismo
  archivo.
- **Hecho cuando:** `./init.sh` termina en `== init OK ==`, con las cinco guardias en verde.

### [x] T14. Documentar el mapa `R<n> → test`
- Dep: T13.
- Archivos: `progress/impl_QC-24-modelo-recetas.md`.
- Copiar la tabla de trazabilidad de abajo con la **salida real** de los tests, no con la
  intención. Las tres preguntas abiertas que añadió `spec_author` ya están cerradas (decisiones
  20, 21 y 22 de `requirements.md`); si alguna de las cuatro de `design.md > 9` se resolviera
  durante la implementación, se anota aquí.
- **Hecho cuando:** el archivo existe, cada R1–R33 tiene al menos un test **ejecutado** (no solo
  escrito) y el reviewer lo valida contra `CHECKPOINTS.md > Trazabilidad`.

---

## Trazabilidad

Abreviaturas:
**S** = `tests/unit/recetas/schema/recetas-schema.test.ts` ·
**M** = `tests/unit/recetas/schema/recetas-migration.test.ts` ·
**N** = `tests/unit/recetas/domain/recipe-name.test.ts` ·
**C** = `tests/unit/recetas/module-contract.test.ts` ·
**I** = `tests/integration/recetas/recetas-constraints.int.test.ts` ·
**G1** = `tests/guards/guard-rls-force.test.ts` ·
**G2** = `tests/guards/guard-arquitectura-modulos.test.ts` ·
**G3** = `tests/guards/guard-dependencias-aprobadas.test.ts` ·
**T11** = la task T11 de este archivo (ciclo apply → rollback → apply, evidencia en
`progress/impl_QC-24-modelo-recetas.md`).

| R | Test estático / unitario / guardia | Test contra base real |
| --- | --- | --- |
| R1 | S · «Recipe declara id uuid propio, nombre, descripcion, pasos y direccion de imagen» | I · «crea una receta con todos sus datos y los relee sin perdida» |
| R2 | S · «name es obligatorio y sin default» | I · «rechaza una receta sin nombre con SQLSTATE 23502» |
| R3 | S · «name y description son TEXT, sin varchar ni limite declarado» · M · «ninguna columna de las dos tablas declara VARCHAR(n)» | I · «acepta un nombre de 500 caracteres y una descripcion de 5000» |
| R4 | S · «steps es un unico campo Json y no existe ningun modelo de paso» | I · «guarda un documento JSON arbitrario tal cual y devuelve la lista en el mismo orden» |
| R5 | S · «steps no es opcional y declara default lista vacia» · M · «steps es JSONB NOT NULL DEFAULT '[]'» | I · «una receta dada de alta sin pasos queda con lista vacia, no con ausencia de valor» |
| R6 | S · «image_path es la unica columna de imagen y es opcional» | I · «acepta una receta sin imagen y otra con una direccion cualquiera» |
| R7 | M · «existe CREATE UNIQUE INDEX sobre name_normalized, y el test cae si desaparece» | I · «rechaza una segunda receta con el mismo nombre normalizado con SQLSTATE 23505» |
| R8 | N · los seis casos de normalizacion e idempotencia · S · «Recipe declara name_normalized obligatorio» · C · «el barrel de recetas exporta normalizeRecipeName» | — (propiedad de una funcion pura; la base no añade informacion) |
| R9 | M · «el indice unico del nombre es PARCIAL (WHERE deleted_at IS NULL), y el test cae si se quita el WHERE» | I · «tras borrar logicamente una receta, otra puede usar su mismo nombre» |
| R10 | S · «RecipeLine declara receta, producto, cantidad y unidad como entidad propia con id» | I · «crea una linea con cantidad y unidad propias y las relee» |
| R11 | M · «existe el indice unico (recipe_id, product_id)» | I · «rechaza dos lineas del mismo producto en la misma receta con SQLSTATE 23505» |
| R12 | — | I · «acepta muchas lineas por receta y el mismo producto en dos recetas distintas» |
| R13 | S · «quantity es Decimal(14,4) obligatoria y en los dos modelos no hay ningun Float» · M · «quantity se declara DECIMAL(14,4) y el test cae si alguien lo cambia a double precision» | I · «la cantidad conserva cuatro decimales exactos y su columna es numeric(14,4)» |
| R14 | M · «recipe_lines lleva CHECK quantity > 0, y el test cae si se relaja a >= 0» | I · «rechaza cantidad cero y negativa con SQLSTATE 23514, y cantidad ausente con 23502» |
| R15 | S · «unit de la linea es String obligatorio y no hay enum ni catalogo de unidades» | I · «acepta cualquier texto como unidad de linea y rechaza la linea sin unidad» |
| R16 | M · «las FK de recipe_id y product_id existen» | I · «rechaza una linea sin receta, sin producto, o con receta o producto inexistentes (23502 / 23503)» |
| R17 | S · «los dos modelos declaran /// @module recetas» · G2 · «todo modelo del esquema real declara su modulo propietario» | — |
| R18 | C · «lib/modules/recetas no contiene prisma.product, @prisma/client ni rutas profundas a inventario» · C · «@/lib/modules/inventario publica ProductCatalog» · G2 | — |
| R19 | S · «product_id, created_by y updated_by son escalares uuid SIN @relation» · M · «las tres FK que cruzan de modulo existen en el SQL con ON DELETE RESTRICT» | I · «la base rechaza un product_id y un created_by inexistentes con SQLSTATE 23503, aunque Prisma no declare la relacion» |
| R20 | C · «el modulo recetas tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel» · G2 | — |
| R21 | S · «created_by y updated_by existen como escalares uuid» · M · «las dos FK de auditoria apuntan a users» | I · «registra autor y ultimo editor, y rechaza un autor inexistente con SQLSTATE 23503» |
| R22 | S · «Recipe declara deletedAt opcional» | I · «el borrado logico conserva la fila completa de la receta y marca deleted_at» |
| R23 | S · «Recipe y RecipeLine declaran createdAt y updatedAt» | I · «created_at y updated_at se rellenan solos y updated_at cambia al modificar, en las dos tablas» |
| R24 | S · «RecipeLine no declara deletedAt» | I · «quitar un producto de una receta elimina la fila de la linea» |
| R25 | M · «la FK recipe_lines_recipe_id_fkey es ON DELETE CASCADE, y el test cae si se cambia a RESTRICT» | I · «borrar fisicamente una receta se lleva sus lineas y no deja huerfanas» |
| R26 | — | I · «el borrado logico de una receta deja sus lineas intactas y asociadas» |
| R27 | M · «la FK a products es ON DELETE RESTRICT» | I · «un producto borrado logicamente conserva su linea» · I · «rechaza el borrado fisico de un producto usado por una linea con SQLSTATE 23503» |
| R28 | S · «las dos tablas y sus columnas mapean a snake_case en ingles» · M · «todos los identificadores creados por la migracion estan en ingles» | — (propiedad del texto) |
| R29 | M · «las dos tablas quedan con RLS activado y forzado» · G1 · «toda tabla creada tiene RLS activado y forzado» | — (un test de RLS con Prisma sale verde pase lo que pase: `design.md > 10`) |
| R30 | M · «down.sql revierte exactamente lo que crea migration.sql y no toca pgcrypto» | **T11** · ciclo apply → rollback → apply, con la salida pegada en `progress/impl_QC-24-modelo-recetas.md` |
| R31 | C · «la feature no anade adaptadores driving, rutas ni Server Actions» | — (no hay flujo navegable: E2E diferido con motivo, decision cerrada 17) |
| R32 | G3 · «toda dependencia de package.json tiene su fila en el registro» | — |
| R33 | S · «created_by y updated_by son opcionales» · M · «created_by y updated_by son UUID anulables y sus FK no son ON DELETE SET NULL» | I · «crea una receta sin autor y la relee con autor ausente, no con cero ni cadena vacia» |

Los 33 requisitos tienen al menos un test ejecutable. **R8, R17, R18, R20, R28, R29, R31 y R32 se
cierran solo con tests estáticos, unitarios o guardias, a propósito**: son propiedades de una
función pura, del texto del esquema o del árbol de archivos, y una base real no añadiría nada
—en el caso de R29, añadiría un falso verde
(`docs/architecture.md > Acceso a datos y autorizacion`)—. **R12 y R26 se cierran solo contra
base real**, porque son comportamientos de permiso y de conservación que el texto del esquema no
expresa.
