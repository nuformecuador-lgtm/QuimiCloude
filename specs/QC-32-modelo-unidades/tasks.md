# QC-32 — modelo-unidades · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task lista los
**archivos que toca** con su ruta exacta desde la raíz del worktree: el leader los usa para la
validación de conflicto de `AGENTS.md > Paralelismo`, así que si una task acaba tocando un archivo
que no está listado, se anota antes de seguir.

`<ts>` = el timestamp que genere Prisma; la carpeta de migración es
`db/migrations/20260903121404_units_catalog/`.

**Aviso de conflicto.** Esta ficha toca archivos de **tres** módulos: `unidades` (nuevos),
`inventario` (`domain/product-input.ts`, `product-view.ts`, `product-catalog.ts`,
`adapters/driven/persistence/product-prisma.ts`, `adapters/driving/product-actions.ts`) y el
esquema de `recetas`. Si QC-20, QC-22, QC-25 o QC-33 estuvieran `in_progress` a la vez, el leader
lo resuelve **antes** de arrancar el bloque C.

**Tests de otras features que hay que acotar** (`design.md > 7`): se **acotan, no se borran**,
conservando lo que el requisito de su feature vigila y con el porqué fechado dentro del propio
test. Van todos en T12, no repartidos por ahí.

**Ronda 3 — 2026-09-03.** El humano corrigió el alcance con T0–T14 ya hechas y el PR #22 abierto:
el conjunto arrancador pasa a ser **cuatro filas de la propia migración** y el aparato del seed se
retira entero (`requirements.md` > decisión cerrada del 2026-09-03, `design.md > 6`). **No se
borra nada del historial de abajo**: T5 y las partes de T9 y T11 que hablaban del seed se marcan
como **ANULADAS**, con lo que se hizo y por qué dejó de aplicar, y lo nuevo entra como **T15 y
T16**. Lo que **no** se toca: T1–T3 (salvo el `INSERT` que T15 añade a `migration.sql`), T6, T7,
T8, T10 y T12.

---

## Bloque A — Preparación

### [x] T0. Dejar el `.env` disponible dentro del worktree
- Dep: ninguna. **Primera task, antes de cualquier `pnpm run db:*`.**
- Archivos: `.env` (git-ignorado, **no versionado**).
- Los worktrees no heredan el `.env` de la raíz. Hace falta `DATABASE_URL` y `DIRECT_URL`: Prisma
  Migrate no funciona a través del pooler (`docs/architecture.md > Variables de entorno de la base`).
- **No se pega ninguna cadena de conexión en un archivo versionado ni en el chat.** Si falta algo,
  se pregunta al humano; no se inventa.
- **Hecho cuando:** `pnpm exec prisma validate` corre desde el worktree sin error de «environment
  variable not found».

### [x] T0b. Comprobar que la base está vacía de unidades escritas
- Dep: T0.
- Archivos: ninguno; la salida se pega en `progress/impl_QC-32-modelo-unidades.md`.
- `SELECT count(*) FROM products WHERE unit IS NOT NULL;` y `SELECT count(*) FROM recipe_lines;`.
- **Si alguno no es cero, se PARA y se sube al humano** (pregunta abierta 2 de `requirements.md`):
  la decisión 6 se reabre. No se convierte ni se borra nada por cuenta propia.
- **Hecho cuando:** los dos contadores están anotados con su fecha en
  `progress/impl_QC-32-modelo-unidades.md`.

---

## Bloque B — Esquema y migración

### [x] T1. Añadir `Unit` y reapuntar las dos columnas ajenas en `db/schema.prisma`
- Dep: ninguna (T0 solo hace falta para los `db:*`).
- Archivos: `db/schema.prisma`.
- El modelo `Unit` tal como está en `design.md > 2.1`, **al final** del archivo, con su
  `/// @module unidades`. En `Product`: `unit String?` → `unitId String? @map("unit_id") @db.Uuid`
  más `@@index([unitId], map: "products_unit_id_idx")`. En `RecipeLine`: `unit String` →
  `unitId String @map("unit_id") @db.Uuid` más `@@index([unitId], map: "recipe_lines_unit_id_idx")`.
- Puntos que el revisor va a mirar uno a uno: `symbol` es `String?`; `Unit` **no** tiene
  `deletedAt`; el `@@unique([nameNormalized])` existe y **no** hay ninguno sobre `symbol`; ninguna
  de las dos `unitId` lleva `@relation`; `Unit` **no** declara `products Product[]` ni
  `lines RecipeLine[]`.
- Ampliar (no sustituir) los comentarios «OJO» de `Product` y `RecipeLine` para explicar por qué
  `unit_id` no tiene `@relation`. Sin eso, el siguiente que lea creerá que falta y lo «arreglará».
- **Hecho cuando:** `pnpm exec prisma validate` pasa y `pnpm exec prisma generate` produce el
  cliente con `Unit` y con `unitId` en los otros dos modelos.

### [x] T2. Generar y completar a mano `migration.sql`
- Dep: T0, T1.
- Archivos: `db/migrations/<ts>_units_catalog/migration.sql`.
- `pnpm run db:migrate:create` (no aplica nada) y después **completar a mano** lo que Prisma no
  modela, según `design.md > 4`: el bloque `DO $$ ... RAISE EXCEPTION` de la guardia de datos
  **como primera sentencia** (§ 4.1), las **dos FK** `products_unit_id_fkey` y
  `recipe_lines_unit_id_fkey` (`ON DELETE RESTRICT ON UPDATE CASCADE`), y los dos `ALTER TABLE`
  de RLS sobre `units` (`ENABLE` **y** `FORCE`).
- Orden del UP: el de `design.md > 4.2`. Revisar que Prisma **no** haya generado un `DROP COLUMN`
  antes de tiempo ni un `ADD COLUMN ... NOT NULL DEFAULT` en `recipe_lines`.
- Cabecera del archivo indicando qué se escribió a mano y que toda migración futura de `products`
  o `recipe_lines` hay que revisarla para no borrarlo por drift (igual que QC-14, QC-20 y QC-24).
- **Hecho cuando:** el archivo contiene, en este orden, la guardia `DO $$`, `pgcrypto`,
  `CREATE TABLE "units"`, el índice único, las dos `ADD COLUMN "unit_id"`, las dos FK, los dos
  índices de FK, los dos `DROP COLUMN "unit"` y los dos `ALTER` de RLS.

### [x] T3. Escribir `down.sql` a mano
- Dep: T2.
- Archivos: `db/migrations/<ts>_units_catalog/down.sql`.
- Exactamente lo de `design.md > 4.6`, en orden inverso al UP, **con su guardia `DO $$` primero**
  (R24). `products.unit` vuelve `TEXT` anulable y `recipe_lines.unit` vuelve `TEXT NOT NULL`
  **sin `DEFAULT`**: un `DEFAULT ''` dejaría un esquema parecido, no el exacto que R23 pide.
- **No** se toca `pgcrypto` (la crean también QC-4, QC-14 y QC-24).
- **Hecho cuando:** existe el archivo y `./init.sh` no reporta «migraciones sin down.sql».

---

## Bloque C — Módulo `unidades`, seed y reapuntado

### [x] T4. Crear el armazón del módulo `unidades` y su contrato
- Dep: ninguna.
- Archivos: `lib/modules/unidades/index.ts`, `lib/modules/unidades/domain/unit-name.ts`,
  `lib/modules/unidades/domain/unit-catalog.ts`, `lib/modules/unidades/domain/starter-units.ts`,
  `lib/modules/unidades/adapters/driving/.gitkeep`.
- Estructura exacta de `design.md > 5.1`; `normalizeUnitName` tal cual en `design.md > 3`
  (función pura, sin imports, sin `any`); los tipos de `design.md > 5.2`; `STARTER_UNITS` de
  `design.md > 6.1` con el comentario que dice que la capitalización y el símbolo de «unidad»
  están **pendientes de confirmación** (pregunta abierta 4).
- El `index.ts` reexporta **solo** de `./domain`. Nada de `'use server'`, `@prisma/client` ni
  `next/*` en su cierre transitivo de imports.
- **Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` pasan y
  `tests/guards/guard-arquitectura-modulos.test.ts` sigue verde con el módulo nuevo dentro.

### [x] ~~T5.~~ **ANULADA en la ronda 3 (2026-09-03)** — El seed arrancador: caso de uso, puerto, adaptador y cableado
> Se hizo en la ronda 1 y se endureció en la ronda 2 (cierre de MAYOR-1 del review). El humano
> retiró el alcance el 2026-09-03: todo lo que esta task construyó **se ha borrado** en T15, y su
> «hecho cuando» (`pnpm run db:seed` dos veces) ya no aplica porque `scripts/seed.ts` no siembra
> unidades. Se deja escrita tal cual para que se lea qué existió.
- Dep: T1 (necesita el cliente Prisma con `Unit`), T4.
- Archivos: `lib/modules/unidades/domain/seed-units.ts`,
  `lib/modules/unidades/ports/unit-seed-repository.ts`,
  `lib/modules/unidades/adapters/driven/persistence/unit-seed-repository-prisma.ts`,
  `lib/composition/index.ts`, `scripts/seed.ts`, `lib/modules/unidades/index.ts`.
- Forma de `design.md > 6.2`: **leer qué falta por nombre normalizado y crear exactamente eso**.
  Nada de `upsert` —pisaría un símbolo cambiado a mano y R26 lo prohíbe— y nada de `updateMany`.
- El adaptador driven es el **único** sitio del repo donde puede aparecer `prisma.unit`.
- `scripts/seed.ts` sigue siendo cáscara fina: una llamada más y una línea de resumen sin
  secretos.
- **Hecho cuando:** `pnpm run typecheck` pasa, `pnpm run db:seed` corre dos veces seguidas y la
  segunda no crea nada.

### [x] T6. Reapuntar `inventario` de `unit` texto a `unitId`
- Dep: T1, T4.
- Archivos: `lib/modules/inventario/domain/product-input.ts`,
  `lib/modules/inventario/domain/product-view.ts`,
  `lib/modules/inventario/domain/product-catalog.ts`,
  `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`,
  `lib/modules/inventario/adapters/driving/product-actions.ts`.
- La tabla de `design.md > 5.3`, campo por campo. `UnitId` se importa **por el barrel**
  (`@/lib/modules/unidades`), nunca por ruta profunda.
- **Cambio mecánico, sin lógica nueva**: no se añade validación de existencia de la unidad (eso es
  QC-38, `design.md > 11.3`), no se toca ningún caso de uso ni ninguna regla de permisos.
- **Hecho cuando:** `pnpm run typecheck` pasa y `grep -rn "\bunit\b" lib/modules/inventario` no
  devuelve ninguna referencia a la unidad como texto.

---

## Bloque D — Tests estáticos y unitarios (no necesitan base)

### [x] T7. [P] Contrato estático del esquema
- Dep: T1.
- Archivos: `tests/unit/unidades/schema/unidades-schema.test.ts`.
- Lee `db/schema.prisma` como **texto**. Reutilizar los helpers de
  `tests/unit/recetas/schema/recetas-schema.test.ts` (`parseModel`, `field`, `has`).
- Incluir **en positivo** los ausentes deliberados: `Unit` sin `deletedAt`, sin `@unique` sobre
  `symbol`, sin campos de vuelta hacia `Product`/`RecipeLine`; y **ninguna** columna `unit` de
  texto en las dos tablas ajenas.
- **Hecho cuando:** pasa y cubre R1, R2, R3, R6, R7, R8, R9, R10, R11, R15, R18, R20.

### [x] T8. [P] Contrato estático del SQL de la migración
- Dep: T2, T3.
- Archivos: `tests/unit/unidades/schema/unidades-migration.test.ts`.
- Helpers de `tests/unit/recetas/schema/recetas-migration.test.ts` (`statements`,
  `stripSqlComments`, `findStatement`, `createdTables`, `droppedTables`).
- **Tests de sensibilidad obligatorios** (`design.md > 9`): mutar en memoria `RESTRICT` a
  `CASCADE`, quitar el bloque `DO $$` del UP y quitar el `NOT NULL` del `ADD COLUMN "unit"` del
  DOWN, y comprobar que el predicado cae en los tres casos. Un test que no puede fallar no vigila
  nada.
- **Hecho cuando:** pasa y cubre R5, R12, R13, R18, R20, R21, R22, R23, R24.

### [x] T9. [P] Dominio: normalización, seed y forma del módulo
- Dep: T4, T5, T6.
- Archivos: `tests/unit/unidades/domain/unit-name.test.ts`,
  `tests/unit/unidades/domain/seed-units.test.ts`,
  `tests/unit/unidades/module-contract.test.ts`.
- `unit-name`: acentos, mayúsculas, signos, espacios, cadena vacía e **idempotencia**
  (`f(f(x)) === f(x)`).
- `seed-units`: con dobles del puerto —crea las cinco en base vacía; con tres presentes crea
  **dos**; **no** actualiza ninguna existente; dos corridas dejan el mismo estado.
- `module-contract`: `index.ts` solo reexporta de `./domain`; carpetas exactamente
  `domain`/`ports`/`adapters`; ningún `'use server'` alcanzable desde el barrel; `prisma.unit`
  **solo** en el adaptador driven de `unidades`; `inventario` y `recetas` importan `unidades`
  **solo por el barrel**; y la feature **no** crea adaptadores driving, rutas ni Server Actions.
- **Hecho cuando:** pasan y cubren R4, R14, R16, R17, R19, R25, R26, R27.
- **Ronda 3 (2026-09-03):** la parte de `seed-units` **queda anulada** (el archivo y su test se
  borran en T15) y `module-contract` **se rehace** en T16: R25 y R26 pasan a cerrarse en
  `unidades-migration.test.ts`. `unit-name` no cambia salvo un comentario que citaba símbolos que
  ya no existen.

---

## Bloque E — Base de datos real

### [x] T10. Aplicar y revertir de verdad, y probar las dos guardias de datos
- Dep: T0, T0b, T2, T3.
- Archivos: ninguno versionado; la salida se pega en `progress/impl_QC-32-modelo-unidades.md`.
- Tres pasos, en este orden:
  1. **R22 en su forma real:** insertar a mano un producto con `unit` escrita, correr
     `pnpm run db:migrate`, comprobar que **falla con el mensaje de la guardia** y que `units`
     **no** existe. Borrar esa fila después.
  2. **Ciclo normal:** `pnpm run db:migrate` → comprobar el esquema real (`units` en
     `information_schema`, las dos FK en `pg_constraint` con su `confdeltype = 'r'`, el índice
     único en `pg_indexes`, `relrowsecurity` y `relforcerowsecurity` en `pg_class`, y que las
     columnas `unit` **ya no existen**) → `pnpm run db:rollback` → comprobar que `units`
     desaparece, que `products.unit` y `recipe_lines.unit` **vuelven** con su tipo y su
     obligatoriedad exactos, que no desaparece ninguna tabla de `identity`, `inventario` ni
     `recetas`, y que `_prisma_migrations` queda coherente → volver a aplicar.
  3. **R24 en su forma real:** con la migración aplicada, sembrar unidades, apuntar un producto a
     una y comprobar que `pnpm run db:rollback` **falla con el mensaje de la guardia** y no toca
     nada. Deshacer esa fila después.
- **Hecho cuando:** los tres pasos terminan como se espera, la salida queda pegada en
  `progress/impl_QC-32-modelo-unidades.md`, y cierran **R22, R23 y R24** en su forma real (los
  tests estáticos solo miran el texto del SQL).

### [x] T11. Tests de integración contra Postgres real
- Dep: T10, T7 (para no duplicar lo que ya cubre el estático).
- Archivos: `tests/integration/unidades/unidades-constraints.int.test.ts`,
  `tests/integration/unidades/unidades-seed.int.test.ts`.
- Cada caso dentro de `prisma.$transaction` que termina en `ROLLBACK`; toda operación que se
  espera que falle, envuelta en `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` y ejecutada con
  `$executeRaw`. Se afirma sobre el **SQLSTATE** (`23502`, `23503`, `23505`), nunca sobre el texto
  del error. Copiar los helpers de `tests/integration/recetas/recetas-constraints.int.test.ts`.
- **Cada caso crea sus propias unidad, presentación, producto y receta dentro de la transacción**:
  las FK son reales y no se depende del seed.
- `beforeAll` que falle con un mensaje claro («corre `pnpm run db:migrate`») si `units` no existe.
- Casos exactos: los de la tabla de trazabilidad, columna **I**.
- **Hecho cuando:** todos pasan y cubren R1, R2, R3, R5, R7, R9, R10, R11, R12, R13, R14, R18,
  R25, R26.
- **Ronda 3 (2026-09-03):** `unidades-seed.int.test.ts` **se borra** en T15 (probaba el seed
  retirado), así que esta task ya **no** cubre R25 ni R26; los cubre `unidades-migration.test.ts`
  (T16) más el ciclo contra base real de T15. `unidades-constraints.int.test.ts` **se queda
  entero**: nunca dependió del seed.

---

## Bloque F — Cierre

### [x] T12. Acotar los tests de otras features que esta ficha invalida
- Dep: T1, T2, T6.
- Archivos: `tests/unit/inventario/schema/inventario-schema.test.ts`,
  `tests/unit/inventario/product-input.test.ts`, `tests/unit/inventario/product-prisma.test.ts`,
  `tests/unit/inventario/product-actions.test.ts`, `tests/unit/inventario/product-service.test.ts`,
  `tests/integration/inventario/product-crud.int.test.ts`,
  `tests/integration/inventario/inventario-constraints.int.test.ts`,
  `tests/unit/recetas/schema/recetas-schema.test.ts`,
  `tests/unit/recetas/schema/recetas-migration.test.ts`,
  `tests/integration/recetas/recetas-constraints.int.test.ts`.
- **Se acotan, no se borran** (`design.md > 7`): se conserva lo que el requisito de su feature
  sigue vigilando —la unidad de la línea sigue siendo obligatoria y anotativa— y se cambia solo lo
  que la decisión 13 del humano invalidó. **Cada cambio lleva dentro del test el porqué fechado**
  («2026-09-03, QC-32 decisión cerrada 13: la unidad pasa a catálogo»).
- **No se toca ningún requisito ni ningún spec de QC-14, QC-20 ni QC-24.** Si algún test parece
  exigir un cambio de comportamiento y no solo de forma, se para y se sube al leader.
- **Hecho cuando:** `pnpm test` pasa entero y la lista de archivos tocados coincide **exactamente**
  con la de arriba (si aparece uno más, se anota aquí antes de seguir).

### [x] T13. Sincronizar con `dev` y correr el gate completo
- Dep: T0–T12.
- Archivos: ninguno (salvo lo que traiga el merge).
- `git fetch origin dev` → `git merge origin/dev` → `./init.sh` **sin flags**. El modo rápido no
  vale aquí: lo que esta feature acopla es SQL, nombres de archivo y la forma del árbol de
  módulos, y el grafo de imports no lo ve (`docs/gate.md > Lo que --rapido NO cubre`).
- Atención especial al merge sobre `lib/modules/inventario/**` y sobre `db/schema.prisma`.
- **Hecho cuando:** `./init.sh` termina en `== init OK ==`, con todas las guardias en verde.

### [x] T14. Documentar el mapa `R<n> → test`
- Dep: T13.
- Archivos: `progress/impl_QC-32-modelo-unidades.md`.
- Copiar la tabla de trazabilidad de abajo con la **salida real** de los tests, no con la
  intención. Si durante la implementación se resuelve alguna de las preguntas abiertas 4 o 5 de
  `requirements.md` (o alguna de `design.md > 11`), se anota aquí; **no** se cierra por cuenta
  propia.
- **Hecho cuando:** el archivo existe, cada R1–R28 tiene al menos un test **ejecutado** (no solo
  escrito) y el reviewer lo valida contra `CHECKPOINTS.md > Trazabilidad`.

---

## Bloque G — Ronda 3: el arrancador pasa a la migración (2026-09-03)

Añadido tras la corrección de alcance del humano, con T0–T14 ya cerradas. No sustituye al
historial de arriba: lo continúa.

### [x] T15. Mover el arrancador al SQL y retirar el aparato del seed
- Dep: T1–T14 (todas hechas).
- Archivos que **se modifican**: `db/migrations/20260903121404_units_catalog/migration.sql` (el
  `INSERT` de las cuatro filas), `lib/modules/unidades/index.ts`, `lib/composition/index.ts`,
  `scripts/seed.ts`, `tests/unit/unidades/domain/unit-name.test.ts` (solo un comentario).
- Archivos que **se crean**: `lib/modules/unidades/ports/.gitkeep`,
  `lib/modules/unidades/adapters/driven/.gitkeep` (precedente: `lib/modules/recetas`).
- Archivos que **se borran**: `lib/modules/unidades/domain/starter-units.ts`,
  `lib/modules/unidades/domain/seed-units.ts`,
  `lib/modules/unidades/ports/unit-seed-repository.ts`,
  `lib/modules/unidades/adapters/driven/persistence/unit-seed-repository-prisma.ts`,
  `tests/unit/unidades/domain/seed-units.test.ts`, `tests/unit/unidades/seed-wiring.test.ts`,
  `tests/integration/unidades/unidades-seed.int.test.ts`.
- El `INSERT` va **después** del índice único y **antes** del `FORCE ROW LEVEL SECURITY`
  (`design.md > 6.1`): con el FORCE puesto y sin policies, ni el dueño inserta.
- La migración **no está mergeada**: se edita **en su sitio**, no se apila otra encima.
- **No se toca** la guardia de datos del UP, ni la del DOWN, ni las FK, ni los `DROP COLUMN`, ni
  el RLS, ni el reapuntado a `unit_id`.
- **Hecho cuando:** `pnpm typecheck` y `pnpm lint` pasan, no queda ninguna referencia colgando a
  `STARTER_UNITS`/`seedStarterUnits`/`unitSeedRepositoryPrisma` en código, y el ciclo real
  `db:migrate` → comprobar las cuatro filas → `db:rollback` → `db:migrate` termina como se
  espera, con las dos guardias de datos aún fallando cuando deben. Evidencia pegada en
  `progress/impl_QC-32-modelo-unidades.md > Ronda 3`.

### [x] T16. Remapear R25 y R26 a tests que muerdan, y rehacer el criterio del contrato
- Dep: T15.
- Archivos: `tests/unit/unidades/schema/unidades-migration.test.ts`,
  `tests/unit/unidades/module-contract.test.ts`.
- **R25 y R26** pasan al bloque «el conjunto arrancador» de `unidades-migration.test.ts`: las
  cuatro filas en orden con su nombre y símbolo y ninguna más; `normalizeUnitName(name) ===
  name_normalized` **importando la función real**, que es lo único que detecta que el literal del
  SQL y la normalización se han desincronizado; el `INSERT` antes del `FORCE`; y tres mutaciones
  de sensibilidad en memoria (cambiar un normalizado, quitar el `INSERT`, añadir una quinta fila).
- **`module-contract.test.ts` se rehace sin aflojarlo.** Su lista `toEqual` de archivos que
  consultan `units` queda **vacía** al desaparecer el adaptador, y la aserción «y ese archivo la
  consulta de verdad» se queda sin sujeto. El criterio nuevo: el barrido es una **función pura**
  que se aplica dos veces —a los archivos reales, que deben dar `[]`, y a esos mismos **más una
  entrada sintética** con `prisma.unit.findMany`, que **debe** salir señalada—, así que la lista
  vacía no puede estar vacía por vacuidad. Más la mitad negativa de R26: la composición no nombra
  ningún seed de unidades y `scripts/seed.ts` no nombra `unidades`. Queda escrito en el propio
  test por qué la lista es vacía y qué la volvería roja.
- **Hecho cuando:** pasan, cubren R4, R14, R16, R17, R19, R25, R26, R27, y las mutaciones de
  sensibilidad se han corrido en rojo de verdad, no solo escritas.

---

## Trazabilidad

Abreviaturas:
**S** = `tests/unit/unidades/schema/unidades-schema.test.ts` ·
**M** = `tests/unit/unidades/schema/unidades-migration.test.ts` ·
**N** = `tests/unit/unidades/domain/unit-name.test.ts` ·
~~**D** = `tests/unit/unidades/domain/seed-units.test.ts`~~ (borrado en T15) ·
**C** = `tests/unit/unidades/module-contract.test.ts` ·
**I** = `tests/integration/unidades/unidades-constraints.int.test.ts` ·
~~**IS** = `tests/integration/unidades/unidades-seed.int.test.ts`~~ (borrado en T15) ·
**T15** = la task T15 de este archivo (evidencia contra base real en
`progress/impl_QC-32-modelo-unidades.md > Ronda 3`) ·
**G1** = `tests/guards/guard-rls-force.test.ts` ·
**G2** = `tests/guards/guard-arquitectura-modulos.test.ts` ·
**G3** = `tests/guards/guard-dependencias-aprobadas.test.ts` ·
**T10** = la task T10 de este archivo (evidencia en `progress/impl_QC-32-modelo-unidades.md`).

| R | Test estático / unitario / guardia | Test contra base real |
| --- | --- | --- |
| R1 | S · «Unit declara id uuid propio, nombre y simbolo» | I · «crea una unidad con nombre y simbolo y la relee sin perdida» |
| R2 | S · «name es obligatorio y sin default» | I · «rechaza una unidad sin nombre con SQLSTATE 23502» |
| R3 | S · «symbol es opcional y no tiene default» | I · «acepta una unidad sin simbolo y la relee con ausencia de valor, no con cadena vacia» |
| R4 | N · los casos de normalizacion e idempotencia · C · «el barrel de unidades exporta normalizeUnitName» | — (propiedad de una funcion pura) |
| R5 | M · «existe CREATE UNIQUE INDEX sobre name_normalized» | I · «rechaza una segunda unidad con el mismo nombre normalizado con SQLSTATE 23505» |
| R6 | S · «name y symbol son TEXT, sin varchar ni limite declarado» | I · «acepta un nombre de 500 caracteres» |
| R7 | S · «no hay @unique ni indice sobre symbol» | I · «acepta dos unidades distintas con el mismo simbolo» |
| R8 | S · «Unit no declara deletedAt» · M · «la tabla units no crea ninguna columna de borrado logico» | — (ausencia declarativa) |
| R9 | S · «Unit declara createdAt y updatedAt» | I · «created_at y updated_at se rellenan solos y updated_at cambia al modificar» |
| R10 | S · «Product declara unitId uuid OPCIONAL y ninguna columna unit de texto» | I · «acepta un producto sin unidad y otro con unidad» |
| R11 | S · «RecipeLine declara unitId uuid OBLIGATORIO y ninguna columna unit de texto» | I · «rechaza una linea de receta sin unidad con SQLSTATE 23502» |
| R12 | M · «las dos FK de unit_id existen en el SQL» | I · «rechaza un producto y una linea con unit_id inexistente con SQLSTATE 23503» |
| R13 | M · «las dos FK son ON DELETE RESTRICT, y el test cae si se cambian a CASCADE» | I · «rechaza el borrado de una unidad usada por un producto y por una linea con SQLSTATE 23503, y permite el de una unidad libre» |
| R14 | C · «el modulo unidades no expone ninguna conversion ni factor» · S · «Unit no declara factor, base ni equivalencia» | I · «una linea puede usar una unidad distinta de la de su producto» |
| R15 | S · «Unit declara /// @module unidades» · G2 · «todo modelo del esquema real declara su modulo propietario» | — |
| R16 | C · «prisma.unit solo aparece en el adaptador driven de unidades» · C · «inventario y recetas importan unidades solo por el barrel» · G2 | — |
| R17 | C · «el modulo unidades tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel» · G2 | — |
| R18 | S · «las dos unitId son escalares uuid SIN @relation y Unit no tiene campos de vuelta» · M · «las dos FK estan escritas en el SQL» | I · «la base rechaza un unit_id inexistente aunque Prisma no declare la relacion» |
| R19 | C · «ProductRef, ProductView y el esquema zod de producto usan unitId y ningun texto de unidad» | — (propiedad de los tipos) |
| R20 | S · «la tabla y sus columnas mapean a snake_case en ingles» · M · «todos los identificadores creados por la migracion estan en ingles» | — (propiedad del texto) |
| R21 | M · «units queda con RLS activado y forzado» · G1 | — (un test de RLS con Prisma sale verde pase lo que pase: `design.md > 9`) |
| R22 | M · «el UP empieza con la guardia DO $$ que aborta si hay unidad escrita, y el test cae si se quita» | **T10** paso 1 · la migracion falla con el mensaje de la guardia y units no se crea |
| R23 | M · «down.sql devuelve products.unit a TEXT y recipe_lines.unit a TEXT NOT NULL, y borra units» | **T10** paso 2 · ciclo apply → rollback → apply |
| R24 | M · «el DOWN empieza con su propia guardia DO $$, y el test cae si se quita» | **T10** paso 3 · el rollback falla con el mensaje de la guardia y no toca nada |
| R25 | M · «el INSERT del arrancador deja exactamente las cuatro unidades, en orden, con su nombre y su simbolo» (y cae si se anade una quinta o se quita el INSERT) | **T15** · tras el UP, las cuatro filas estan en la base con su nombre, su simbolo y su normalizado |
| R26 | M · «el name_normalized literal del SQL coincide con normalizeUnitName» (y cae si se muta un normalizado) · C · «ningun archivo del repo consulta la tabla units, y el barrido senala una entrada sintetica que si la consulta» · C · «la composicion no cablea ningun seed de unidades y scripts/seed.ts no las nombra» | **T15** · el normalizado real leido de la base coincide con el de la funcion |

> **Reescritas en la ronda 3 (2026-09-03).** Decían: R25 → `D · «sobre catalogo vacio crea las
> cinco unidades arrancadoras y ninguna mas»` / `IS · «db:seed deja las cinco unidades en la
> base»`; R26 → `D · «con tres presentes crea solo dos, no actualiza ninguna existente, y dos
> corridas dejan el mismo estado»` / `IS · «una segunda corrida no crea nada y no pisa una unidad
> renombrada a mano»`. **D** e **IS** eran `tests/unit/unidades/domain/seed-units.test.ts` y
> `tests/integration/unidades/unidades-seed.int.test.ts`, los dos borrados en T15 junto con el
> seed que probaban. Esto es lo que **disuelve MAYOR-1** de
> `progress/review_QC-32-modelo-unidades.md`: el hallazgo era que R25/R26 estaban mapeados a
> tests que ejercitaban una copia del adaptador; sin adaptador y sin seed, ese objeto ya no
> existe, y R25/R26 apuntan ahora al SQL que sí crea las filas y a la función que sí las
> normaliza. El informe del reviewer **no se borra**: la ronda 1 y su rechazo se quedan en el
> historial.
| R27 | C · «la feature no anade adaptadores driving, rutas ni Server Actions» | — (no hay flujo navegable: E2E diferido con motivo, decision cerrada 18) |
| R28 | G3 · «toda dependencia de package.json tiene su fila en el registro» | — |

Los 28 requisitos tienen al menos un test ejecutable. **R4, R8, R15, R16, R17, R19, R20, R21, R27
y R28 se cierran solo con tests estáticos, unitarios o guardias, a propósito**: son propiedades de
una función pura, del texto del esquema o del árbol de archivos, y una base real no añadiría nada
—en el caso de R21 añadiría un falso verde (`docs/architecture.md > Acceso a datos y
autorizacion`)—. **R22, R23 y R24 se cierran de verdad en T10**, no en el test estático, que solo
lee texto.

**Ronda 3:** R25 y R26 se cierran con el bloque del arrancador de **M** (estático, con sus tres
mutaciones de sensibilidad) y con **C** en su mitad negativa, más el ciclo real de **T15**. Sigue
sin haber requisito sin `R<n> → test`.
