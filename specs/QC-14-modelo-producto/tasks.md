# QC-14 — modelo-producto · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task lista los
**archivos que toca** con su ruta exacta desde la raíz del worktree: el leader los usa para la
validación de conflicto de `AGENTS.md > Paralelismo`, así que si una task acaba tocando un
archivo que no está listado, se anota antes de seguir.

`<ts>` = el timestamp que genere Prisma; el nombre de la carpeta de migración es
`db/migrations/<ts>_products_and_presentations/`.

---

## Bloque A — Preparación

### [x] T0. Dejar el `.env` disponible dentro del worktree
- Dep: ninguna. **Primera task, antes de cualquier `pnpm run db:*`.**
- Archivos: `.env` (git-ignorado, **no versionado**).
- `.env` vive en la raíz del worktree principal y **los worktrees no lo heredan**. Hay que
  dejarlo disponible en `.worktrees/QC-14-modelo-producto/` (copia local o enlace), con
  `DATABASE_URL` y `DIRECT_URL`: Prisma Migrate no funciona a través del pooler
  (`docs/architecture.md > Variables de entorno de la base`).
- **No se pega ninguna cadena de conexión en un archivo versionado ni en el chat.** Si falta
  algo, se pregunta al humano; no se inventa.
- **Hecho cuando:** `pnpm exec prisma validate` corre desde el worktree sin error de
  «environment variable not found».

---

## Bloque B — Esquema y migración

### [x] T1. Añadir los modelos `Presentation` y `Product` a `db/schema.prisma`
- Dep: ninguna (T0 solo hace falta para los `db:*`).
- Archivos: `db/schema.prisma`.
- Los dos modelos tal como están en `design.md > 2`, **añadidos al final**, sin tocar
  `DocumentType`, `Role` ni `User`. Cada uno con su `/// @module inventario` dentro del bloque
  de comentarios que precede al `model`.
- Puntos que el revisor va a mirar uno a uno: `cost` es `Decimal? @db.Decimal(14, 4)` y **nunca**
  `Float`; `minPurchase` es `Int @default(0)` y **no** anulable; `presentationId` es obligatorio
  con `@db.Uuid`; la relación declara `onDelete: Restrict`; hay `@@index([presentationId], map:
  "products_presentation_id_idx")`; **no** hay `@unique` ni `@@unique` sobre `name`;
  `Presentation` **no** tiene `deletedAt` y `Product` **sí**.
- Dejar en el esquema el comentario que explica por qué `name` no es único y por qué
  `Presentation` no lleva `deletedAt`, o el siguiente que lo lea creerá que falta.
- **Hecho cuando:** `pnpm exec prisma validate` pasa, `pnpm exec prisma generate` produce el
  cliente con `Product` y `Presentation`, y `pnpm run typecheck` pasa.

### [x] T2. Generar y completar a mano `migration.sql`
- Dep: T0, T1.
- Archivos: `db/migrations/<ts>_products_and_presentations/migration.sql`.
- `pnpm run db:migrate:create` (no aplica nada) y después **completar a mano** lo que Prisma no
  modela, según `design.md > 3`: `CREATE EXTENSION IF NOT EXISTS pgcrypto`, los cuatro `CHECK`
  de no negatividad con sus nombres en inglés, y los cuatro `ALTER TABLE` de RLS
  (`ENABLE` **y** `FORCE`, las dos tablas).
- Cabecera del archivo indicando qué se escribió a mano y que toda migración futura de estas
  tablas hay que revisarla para no borrarlo por drift (igual que la de QC-4).
- **Hecho cuando:** el archivo contiene las dos `CREATE TABLE` (`presentations` antes que
  `products`), la FK `products_presentation_id_fkey` con `ON DELETE RESTRICT`, el índice
  `products_presentation_id_idx`, los cuatro `CHECK`, los cuatro `ALTER TABLE` de RLS, y
  **ningún** `CREATE UNIQUE INDEX` sobre `products`.

### [x] T3. Escribir `down.sql` a mano
- Dep: T2.
- Archivos: `db/migrations/<ts>_products_and_presentations/down.sql`.
- Exactamente dos sentencias, en orden inverso al UP: `DROP TABLE IF EXISTS "products";` y
  `DROP TABLE IF EXISTS "presentations";`. Nada más: índices, FK y `CHECK` caen con sus tablas.
  **No** se toca `pgcrypto` (`design.md > 4`).
- **Hecho cuando:** existe el archivo y `./init.sh` no reporta «migraciones sin down.sql».

---

## Bloque C — Tests estáticos (no necesitan base)

### [x] T4. [P] Contrato estático del esquema
- Dep: T1.
- Archivos: `tests/unit/inventario/schema/inventario-schema.test.ts`.
- Lee `db/schema.prisma` como **texto** y afirma sobre la declaración. Reutilizar los helpers
  de `tests/unit/identity/schema/identity-schema.test.ts` (`parseModel`, `field`, `has`).
- Casos exactos: los de la tabla de trazabilidad de abajo, columna **S**.
- **Hecho cuando:** pasa y cubre R1, R3, R4, R5, R6, R7, R8, R10, R11, R12, R13, R14, R16, R17,
  R18, R19, R20, R23.

### [x] T5. [P] Contrato estático del SQL de la migración
- Dep: T2, T3.
- Archivos: `tests/unit/inventario/schema/inventario-migration.test.ts`.
- Lee `migration.sql` y `down.sql` como texto, con los helpers de
  `tests/unit/identity/schema/identity-migration.test.ts` (`statements`, `stripSqlComments`,
  `findStatement`, `createdTables`, `droppedTables`).
- Incluir al menos un **test de sensibilidad** por cada afirmación frágil, como hace QC-4:
  mutar en memoria el `DECIMAL(14,4)` a `DOUBLE PRECISION` y el `>= 0` a `> -1` y comprobar que
  el predicado cae. Un test que no puede fallar no vigila nada.
- **Hecho cuando:** pasa y cubre R6, R8, R9, R12, R14, R16, R19, R21, R22.

---

## Bloque D — Base de datos real

### [x] T6. Aplicar y revertir la migración de verdad (ciclo apply → rollback → apply)
- Dep: T0, T2, T3.
- Archivos: ninguno versionado; la salida se pega en
  `progress/impl_QC-14-modelo-producto.md`.
- `pnpm run db:migrate` → comprobar el esquema real (las dos tablas, los cuatro `CHECK` en
  `pg_constraint`, `relrowsecurity` y `relforcerowsecurity` en `pg_class`, el índice de la FK)
  → `pnpm run db:rollback` → comprobar que las dos tablas desaparecen, que **no** desaparece
  ninguna tabla de `identity` y que `_prisma_migrations` queda coherente → volver a aplicar.
- **Hecho cuando:** el ciclo termina limpio, la salida queda pegada en
  `progress/impl_QC-14-modelo-producto.md`, y cierra **R22** en su forma real (el test estático
  solo mira el texto del SQL).

### [x] T7. Tests de integración contra Postgres real
- Dep: T6, T4 (para no duplicar lo que ya cubre el estático).
- Archivos: `tests/integration/inventario/inventario-constraints.int.test.ts`.
- Cada caso dentro de `prisma.$transaction` que termina en `ROLLBACK`; toda operación que se
  espera que falle, envuelta en `SAVEPOINT` / `ROLLBACK TO SAVEPOINT`. Se afirma sobre el
  **SQLSTATE** (`23502`, `23503`, `23514`), nunca sobre el texto del error. Copiar los helpers
  de `tests/integration/identity/identity-constraints.int.test.ts`.
- `beforeAll` que falle con un mensaje claro («corre `pnpm run db:migrate`») si `products` o
  `presentations` no existen.
- Casos exactos: los de la tabla de trazabilidad, columna **I**.
- **Hecho cuando:** todos los casos pasan y cubren R1, R2, R3, R4, R5, R6, R7, R8, R9, R10,
  R11, R12, R13, R14, R15, R16, R17, R18.

---

## Bloque E — Cierre

### [x] T8. Sincronizar con `dev` y correr el gate completo
- Dep: T0–T7.
- Archivos: ninguno (salvo lo que traiga el merge).
- `git fetch origin dev` → `git merge origin/dev` → `./init.sh` **sin flags**. El modo rápido
  no vale aquí: lo que esta feature acopla es SQL y nombres de archivo, no imports, y el grafo
  no lo ve (`docs/gate.md > Lo que --rapido NO cubre`).
- **Hecho cuando:** `./init.sh` termina en `== init OK ==`, con las tres guardias en verde.

### [x] T9. Documentar el mapa `R<n> → test`
- Dep: T8.
- Archivos: `progress/impl_QC-14-modelo-producto.md`.
- Copiar la tabla de trazabilidad de abajo con la **salida real** de los tests, no con la
  intención.
- **Hecho cuando:** el archivo existe, cada R1–R24 tiene al menos un test **ejecutado** (no
  solo escrito) y el reviewer lo valida contra `CHECKPOINTS.md > Trazabilidad`.

---

## Trazabilidad

Abreviaturas:
**S** = `tests/unit/inventario/schema/inventario-schema.test.ts` ·
**M** = `tests/unit/inventario/schema/inventario-migration.test.ts` ·
**I** = `tests/integration/inventario/inventario-constraints.int.test.ts` ·
**G1** = `tests/guards/guard-rls-force.test.ts` ·
**G2** = `tests/guards/guard-arquitectura-modulos.test.ts` ·
**G3** = `tests/guards/guard-dependencias-aprobadas.test.ts` ·
**T6** = la task T6 de este archivo (ciclo apply → rollback → apply, evidencia en
`progress/impl_QC-14-modelo-producto.md`).

| R | Test estático / guardia | Test contra base real |
| --- | --- | --- |
| R1 | S · «Presentation declara id uuid propio y name obligatorio» | I · «crea una presentacion y su identificador no cambia al renombrarla» |
| R2 | — | I · «rechaza una presentacion sin nombre» |
| R3 | S · «el esquema declara exactamente dos modelos nuevos: Presentation y Product» · S · «Product declara los ocho datos del producto en una sola tabla» | I · «crea un producto con todos sus datos y los relee sin perdida» |
| R4 | S · «name y presentationId son obligatorios y sin default» | I · «rechaza el alta si falta el nombre o la presentacion» |
| R5 | S · «stock, cost, deliveryTime, qtyAlert y unit son opcionales» | I · «acepta un producto sin existencia, costo, tiempo de entrega, cantidad de alerta ni unidad, y los devuelve como ausencia de valor» |
| R6 | S · «minPurchase no es opcional y declara default 0» · M · «min_purchase es INTEGER NOT NULL DEFAULT 0» | I · «un producto dado de alta sin compra minima queda con compra minima 0» |
| R7 | S · «stock, minPurchase, qtyAlert y deliveryTime son Int» | I · «las cuatro columnas enteras son integer en information_schema» |
| R8 | S · «cost es Decimal(14,4) y en el esquema no hay ningun Float» · M · «cost se declara DECIMAL(14,4) y el test cae si alguien lo cambia a double precision» | I · «el costo conserva cuatro decimales exactos y su columna es numeric(14,4)» |
| R9 | M · «las cuatro columnas numericas llevan CHECK de no negatividad, y el test cae si se relaja el >= 0» | I · «rechaza existencia, compra minima, cantidad de alerta y costo negativos con SQLSTATE 23514» |
| R10 | S · «unit es String opcional y el esquema no declara ningun enum» | I · «acepta cualquier texto como unidad y tambien un producto sin unidad» |
| R11 | S · «no hay ninguna columna derivada de bajo de existencias ni relacion entre qtyAlert y stock» | I · «guardar una cantidad de alerta por debajo de la existencia no cambia ninguna otra columna» |
| R12 | S · «la relacion Product-Presentation es obligatoria» · M · «la FK de presentacion existe y es ON DELETE RESTRICT» | I · «rechaza un producto sin presentacion o con una presentacion inexistente» |
| R13 | S · «presentationId no tiene restriccion de unicidad» | I · «acepta varios productos con la misma presentacion» |
| R14 | S · «la relacion Product-Presentation declara onDelete Restrict» · M · «la FK de presentacion es ON DELETE RESTRICT» | I · «rechaza borrar una presentacion con productos asignados» · I · «rechaza borrar una presentacion cuyo unico producto esta borrado logicamente» |
| R15 | — | I · «permite borrar una presentacion sin productos asignados» |
| R16 | S · «products.name no tiene @unique ni @@unique» · M · «la migracion no crea ningun indice unico sobre products» | I · «acepta dos productos con el mismo nombre, y tambien con distintas mayusculas» |
| R17 | S · «Product declara deletedAt opcional» | I · «el borrado logico conserva la fila del producto y marca deleted_at» |
| R18 | S · «Product y Presentation declaran createdAt y updatedAt» | I · «created_at y updated_at se rellenan solos y updated_at cambia al modificar» |
| R19 | S · «las dos tablas mapean a snake_case en ingles» · M · «todos los identificadores creados por la migracion estan en ingles» | — (propiedad del texto; una base real no añade información) |
| R20 | S · «los dos modelos declaran /// @module inventario» · G2 · «todo modelo del esquema real declara su modulo propietario» | — |
| R21 | M · «las dos tablas quedan con RLS activado y forzado» · G1 · «toda tabla creada tiene RLS activado y forzado» | — (un test de RLS con Prisma sale verde pase lo que pase: `design.md > 10`) |
| R22 | M · «down.sql revierte exactamente lo que crea migration.sql y no toca pgcrypto» | **T6** · ciclo apply → rollback → apply, con la salida pegada en `progress/impl_QC-14-modelo-producto.md` |
| R23 | S · «la feature no anade adaptadores driving, rutas ni contrato de dominio en el modulo inventario» | — (no hay flujo navegable: E2E diferido con motivo, decisión cerrada 16) |
| R24 | G3 · «toda dependencia de package.json tiene su fila en el registro» | — |

Los 24 requisitos tienen al menos un test ejecutable. **R19, R20, R21, R23 y R24 se cierran
solo con tests estáticos o guardias, a propósito**, no por falta de cobertura: son propiedades
del texto del esquema, del SQL o del árbol de archivos, y una base real no añadiría nada
—en el caso de R21, un test contra la base añadiría un falso verde
(`docs/architecture.md > Acceso a datos y autorizacion`)—. **R2 y R15 se cierran solo contra
base real**, porque son comportamientos de rechazo y de permiso que el texto del esquema no
expresa.
