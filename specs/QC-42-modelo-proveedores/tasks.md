# QC-42 — modelo-proveedores · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task lista los
**archivos que toca** con su ruta exacta desde la raíz del worktree: el leader los usa para la
validación de conflicto de `AGENTS.md > Paralelismo`, así que si una task acaba tocando un archivo
que no está listado, **se anota aquí antes de seguir**.

`<ts>` = el timestamp que genere Prisma; la carpeta de migración es
`db/migrations/<ts>_suppliers_and_supplier_catalog_lines/`.

**Recordatorio de gate** (`docs/verification.md` + `AGENTS.md > Regla del gate`): el implementer
corre **solo** `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run <sus
archivos>`. `./init.sh --rapido` lo corre el **leader** al cerrar cada tanda; `./init.sh`
**completo**, al cerrar la feature y **antes del PR, sin excepción**.

---

## AVISO DE TERRENO COMPARTIDO — QC-32 está tocando los mismos archivos

**Léelo antes de empezar. Es el riesgo principal de esta feature** (`design.md > 10`).

`QC-32 — modelo-unidades` está **`in_progress` ahora mismo** (2026-09-03) y está modificando:

- **`db/schema.prisma`** — añade `model Unit` y cambia `products.unit` y la unidad de
  `recipe_lines` a `unit_id`.
- **`db/migrations/`** — añade su propia carpeta de migración.

QC-42 **no toca `products`** (decisión cerrada 2, R19), así que el choque **debería** limitarse al
conflicto textual en `db/schema.prisma` y al orden de las migraciones por timestamp. **Pero no se
da por hecho:**

1. **T13 (sincronizar con `dev`) se hace ANTES de dar por buena la migración**, no después. Una
   migración validada contra un esquema que ya cambió no está validada.
2. Después del merge hay que **repetir el ciclo de T10** (`db:migrate` → `db:rollback` →
   `db:migrate`), aunque ya hubiera salido verde antes.
3. Si al mergear apareciera que QC-32 añade una unidad a la **línea de catálogo** —hoy no está en
   su alcance—, choca con la pregunta abierta 4 de `requirements.md`: **se para y se pregunta al
   leader**, no se resuelve inventando.

---

## Bloque A — Preparación

### [x] T0. Inventariar lo que YA está montado y no se re-crea (BLOQUEA TODO)
- Dep: ninguna. **Primera task.** Mismo papel que la T0 de `specs/11-layout-privado-con-sidebar/tasks.md`.
- Archivos: ninguno versionado; la evidencia va a `progress/impl_QC-42-modelo-proveedores.md`.
- Comprobar **uno por uno**, en este worktree y tras `git merge origin/dev`, que existen:
  1. `db/schema.prisma` con `model Product` y `model User` (de ellos cuelgan las tres FK de
     `design.md > 4.1`) y con la convención `/// @module` en todos los modelos.
  2. `package.json` con los scripts `db:migrate:create`, `db:migrate` y `db:rollback`, y
     `scripts/db-rollback.ts`.
  3. `lib/shared/db/prisma.ts` — el **cliente Prisma compartido**. Esta feature **no crea otro**.
  4. `vitest.config.ts` y `pnpm test` arrancando en verde, con `tests/unit/`,
     `tests/integration/` y `tests/guards/` ya poblados.
  5. Las guardias que van a mirar esta feature: `tests/guards/guard-arquitectura-modulos.test.ts`,
     `tests/guards/guard-rls-force.test.ts`, `tests/guards/guard-dependencias-aprobadas.test.ts`.
  6. `lib/modules/inventario/index.ts` publicando `ProductCatalog`, `ProductId` y `ProductRef`
     (**los puso QC-24**; esta ficha **no los amplía**, `design.md > 5.2`).
  7. `lib/modules/recetas/` como plantilla literal del módulo que se va a crear.
  8. `.env` disponible **dentro del worktree** con `DATABASE_URL` y `DIRECT_URL`: los worktrees no
     heredan el de la raíz y Prisma Migrate no funciona a través del pooler
     (`docs/architecture.md > Variables de entorno de la base`). **No se pega ninguna cadena de
     conexión en un archivo versionado ni en el chat.** Si falta, se pregunta al humano.
- **Si falta cualquiera de los ocho: PARAR y avisar al leader.** No se «arregla» montando Vitest,
  creando un segundo cliente Prisma ni reescribiendo una guardia: eso duplica trabajo ya mergeado y
  garantiza conflicto.
- **Hecho cuando:** los ocho puntos están verificados y anotados con su evidencia en
  `progress/impl_QC-42-modelo-proveedores.md`, y `pnpm exec prisma validate` corre desde el
  worktree sin error de «environment variable not found».

---

## Bloque B — Esquema y migración

### [x] T1. Añadir `Supplier` y `SupplierCatalogLine` a `db/schema.prisma`
- Dep: T0.
- Archivos: `db/schema.prisma`.
- Los dos modelos tal como están en `design.md > 2`, **añadidos al final**, sin tocar
  `DocumentType`, `Role`, `User`, `Presentation`, `Product`, `Recipe` ni `RecipeLine`. Cada uno con
  su `/// @module proveedores` dentro del bloque de comentarios que precede al `model`.
- Puntos que el revisor va a mirar uno a uno: `cost` y `minPurchase` son
  `Decimal @db.Decimal(14, 4)` y **nunca** `Float`; `minPurchase` es **opcional y sin defecto**
  (no `@default(0)`); `deliveryTime` es `Int?`; `productId`, `createdBy` y `updatedBy` son
  `@db.Uuid` **sin `@relation`**; `createdBy`/`updatedBy` son **anulables** y `productId`/
  `supplierId` obligatorios; la relación `supplier` declara `onDelete: Cascade`; existen
  `@@unique([supplierId, productId])`, `@@index([productId])`, `@@index([createdBy])`,
  `@@index([updatedBy])`; **no** hay `@unique` ni `@@unique` sobre `name` ni `nameNormalized`;
  `Supplier` tiene `deletedAt` y `SupplierCatalogLine` **no**; la línea **no** tiene `createdBy`
  ni `updatedBy` (R25).
- Dejar en el esquema los comentarios «OJO» de `design.md > 2.1` y `> 2.2` **completos**: sin
  ellos, el siguiente que lea creerá que falta un `@relation`, que falta el `@unique` y que la
  regla «al menos teléfono o correo» se perdió, y los «arreglará».
- **Hecho cuando:** `pnpm exec prisma validate` pasa, `pnpm exec prisma generate` produce el
  cliente con `Supplier` y `SupplierCatalogLine`, `pnpm run typecheck` pasa, y
  `git diff db/schema.prisma` **no muestra ninguna línea modificada dentro de `model Product`**
  (R19).

### [x] T2. Generar y completar a mano `migration.sql`
- Dep: T0, T1.
- Archivos: `db/migrations/<ts>_suppliers_and_supplier_catalog_lines/migration.sql`.
- `pnpm run db:migrate:create` (no aplica nada) y después **completar a mano** lo que Prisma no
  modela, según `design.md > 4`: `CREATE EXTENSION IF NOT EXISTS pgcrypto`, **las tres FK que
  cruzan de módulo** (`supplier_catalog_lines_product_id_fkey`, `suppliers_created_by_fkey`,
  `suppliers_updated_by_fkey`, las tres `ON DELETE RESTRICT ON UPDATE CASCADE`, y **nunca**
  `ON DELETE SET NULL`), el índice único **parcial** `suppliers_name_unique`, los **cuatro**
  `CHECK` (`..._cost_non_negative`, `..._min_purchase_non_negative`,
  `..._delivery_time_non_negative` y `suppliers_contact_required`) y los cuatro `ALTER TABLE` de
  RLS (`ENABLE` **y** `FORCE`, las dos tablas).
- Cabecera del archivo indicando qué se escribió a mano y que **toda migración futura de estas
  tablas hay que revisarla para no borrarlo por drift** (igual que la de QC-14 y la de QC-24).
  Mencionar explícitamente que las tres FK **no** las regenera Prisma porque los campos son
  escalares.
- Orden del UP: el de `design.md > 4.6`.
- **Hecho cuando:** el archivo contiene las dos `CREATE TABLE` (`suppliers` antes que
  `supplier_catalog_lines`), las **cuatro** FK (la de proveedor→línea con `ON DELETE CASCADE` y las
  tres a mano con `RESTRICT`), los cuatro índices, el índice único parcial, los cuatro `CHECK` y
  los cuatro `ALTER` de RLS; y **no aparece ningún `ALTER TABLE "products"`** (R19).

### [x] T3. Escribir `down.sql` a mano
- Dep: T2.
- Archivos: `db/migrations/<ts>_suppliers_and_supplier_catalog_lines/down.sql`.
- Exactamente dos sentencias, en orden inverso al UP (`design.md > 4.7`):
  `DROP TABLE IF EXISTS "supplier_catalog_lines";` y `DROP TABLE IF EXISTS "suppliers";`. Nada
  más: índices, FK —también las tres escritas a mano— y `CHECK` caen con sus tablas. **No** se
  toca `pgcrypto` (la crean también QC-4, QC-14 y QC-24). Cabecera explicando ambas cosas.
- **Es guardia del gate**: `./init.sh` falla si una migración no tiene `down.sql`.
- **Hecho cuando:** existe el archivo y `./init.sh` no reporta «migraciones sin down.sql».

---

## Bloque C — El módulo `proveedores`

### [x] T4. Crear el armazón completo del módulo `proveedores`
- Dep: T0. (Independiente de T1–T3; se puede hacer en paralelo al bloque B.)
- Archivos: `lib/modules/proveedores/index.ts`,
  `lib/modules/proveedores/domain/supplier-name.ts`,
  `lib/modules/proveedores/ports/.gitkeep`,
  `lib/modules/proveedores/adapters/driven/.gitkeep`,
  `lib/modules/proveedores/adapters/driving/.gitkeep`.
- Estructura exacta de `design.md > 5.1`, copiada de `lib/modules/recetas/`.
  `normalizeSupplierName` tal cual en `design.md > 3`: función pura, sin imports, sin `any`.
- El `index.ts` reexporta **solo** de `./domain`. Nada de `'use server'`, `@prisma/client` ni
  `next/*` en su cierre transitivo de imports.
- Las tres carpetas vacías llevan `.gitkeep` (git no versiona carpetas vacías) y **no** se crea
  ninguna cuarta carpeta: la guardia solo admite `domain/`, `ports/` y `adapters/`.
- **No se toca `lib/modules/inventario/`** (`design.md > 5.2`): su contrato ya publica lo que hace
  falta y ampliarlo sin consumidor sería sobre-ingeniería.
- **Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` pasan, y
  `tests/guards/guard-arquitectura-modulos.test.ts` sigue en verde con el módulo nuevo dentro.

### [x] T5. Confirmar que `lib/composition/index.ts` NO se toca
- Dep: T4.
- Archivos: ninguno.
- Comprobación explícita, no un olvido (`design.md > 5.5`): en esta ficha no hay puertos ni
  adaptadores que cablear, y una fachada `export const proveedores = {}` sería código muerto. La
  forma exacta que añadirá QC-43 está escrita en `design.md > 5.5` para que no se improvise.
- Si el implementer siente la necesidad de tocarlo, **ha construido algo que no está en el
  alcance**: para y avisa al leader antes de seguir.
- **Hecho cuando:** `git diff --stat lib/composition/` está vacío al cerrar la feature, y la
  decisión queda anotada en `progress/impl_QC-42-modelo-proveedores.md`.

---

## Bloque D — Tests estáticos y unitarios (no necesitan base)

### [x] T6. [P] Contrato estático del esquema
- Dep: T1.
- Archivos: `tests/unit/proveedores/schema/proveedores-schema.test.ts`.
- Lee `db/schema.prisma` como **texto**. Reutilizar los helpers de
  `tests/unit/recetas/schema/recetas-schema.test.ts` (`parseModel`, `field`, `has`).
- Incluir en **positivo** los ausentes deliberados: **ningún** `@relation` desde
  `SupplierCatalogLine` a `Product` ni desde `Supplier` a `User`; **ningún** `@unique` sobre el
  nombre; `SupplierCatalogLine` **sin** `deletedAt`, `createdBy` ni `updatedBy`; `minPurchase`
  **sin** `@default`. Y un caso que afirme que `model Product` **no declara ninguna relación ni
  campo nuevo hacia proveedores** (R19).
- **No** afirmar el censo global de modelos ni el número de migraciones del repo: es lo que rompió
  dos tests ajenos en QC-24 (`specs/QC-24-modelo-recetas/tasks.md`, cabecera).
- **Hecho cuando:** pasa y cubre R1, R3, R5, R10, R13, R14, R15, R16, R18, R19, R20, R22, R25,
  R26, R27, R32.

### [x] T7. [P] Contrato estático del SQL de la migración
- Dep: T2, T3.
- Archivos: `tests/unit/proveedores/schema/proveedores-migration.test.ts`.
- Lee `migration.sql` y `down.sql` como texto, con los helpers de
  `tests/unit/recetas/schema/recetas-migration.test.ts` (`statements`, `stripSqlComments`,
  `findStatement`, `createdTables`, `droppedTables`).
- **Tests de sensibilidad obligatorios** (`design.md > 12`): mutar en memoria `>= 0` a `> -1`,
  quitar el `WHERE "deleted_at" IS NULL` del índice único, cambiar `DECIMAL(14,4)` por
  `DOUBLE PRECISION`, cambiar un `RESTRICT` por `CASCADE` y cambiar el `OR` de
  `suppliers_contact_required` por `AND`, y comprobar que el predicado **cae** en los cinco casos.
  Un test que no puede fallar no vigila nada.
- Un caso propio: la migración **no contiene ningún `ALTER TABLE "products"` ni
  `ALTER TABLE "users"`** salvo las FK que declara sobre sus **propias** tablas (R19).
- **Hecho cuando:** pasa y cubre R2, R4, R5, R7, R9, R11, R13, R14, R16, R17, R19, R22, R24, R26,
  R29, R31, R32, R33, R34.

### [x] T8. [P] La normalización del nombre
- Dep: T4.
- Archivos: `tests/unit/proveedores/domain/supplier-name.test.ts`.
- Casos: acentos (`Químicos` → `quimicos`), mayúsculas, signos y espacios (`Quimicos del
  Pacifico S.A.` = `quimicos-del-pacifico sa`), cadena vacía, e **idempotencia**
  (`f(f(x)) === f(x)`), que es la propiedad que hace segura la columna persistida.
- **Hecho cuando:** pasa y cubre R8.

### [x] T9. [P] Forma del módulo, frontera de imports **y cruce por ORM**
- Dep: T4, T1 (necesita el cliente generado para `Prisma.dmmf`).
- Archivos: `tests/unit/proveedores/module-contract.test.ts`.
- Dos mitades, y la segunda es el encargo específico de esta feature:
  1. **Forma e imports.** Lee el árbol de `lib/modules/proveedores/**` y el texto de sus archivos:
     `index.ts` existe y solo reexporta de `./domain`; las carpetas del módulo son exactamente
     `domain`, `ports` y `adapters`; **no** hay `'use server'` alcanzable desde el barrel; **no**
     aparece `prisma.product`, `prisma.user`, `@prisma/client` ni ninguna ruta profunda a
     `inventario` o `identity`; y la feature **no** crea nada en `adapters/driving/` ni en `app/`.
  2. **Cruce por ORM (R22), contra `Prisma.dmmf`** — `design.md > 5.4`. La guardia
     `guard-arquitectura-modulos` **no lo detecta**, porque un `include` no es un import ni la
     cadena `prisma.<modelo>`. Afirmar que las únicas relaciones que el **cliente generado**
     conoce son `SupplierCatalogLine → Supplier` y `Supplier → SupplierCatalogLine`, y que ni
     `Product` ni `User` ganan campo de vuelta. El test falla en el instante en que alguien añade
     el `@relation` «que faltaba», que es justo el fallo del que hay que protegerse.
- **Hecho cuando:** pasa y cubre R20, R21, R22, R23, R35, y refuerza R8.

---

## Bloque E — Base de datos real

### [x] T10. Aplicar y revertir la migración de verdad (ciclo apply → rollback → apply)
- Dep: T0, T2, T3.
- Archivos: ninguno versionado; la salida se pega en `progress/impl_QC-42-modelo-proveedores.md`.
- `pnpm run db:migrate` → comprobar el esquema real (las dos tablas, las **cuatro** FK en
  `pg_constraint` con su `confdeltype`, los **cuatro** `CHECK` en `pg_constraint`, el índice único
  parcial en `pg_indexes` **con su `WHERE`**, `relrowsecurity` y `relforcerowsecurity` en
  `pg_class`) → `pnpm run db:rollback` → comprobar que **las dos tablas desaparecen**, que **no**
  desaparece ninguna tabla de `identity`, `inventario` ni `recetas`, que **`products` queda
  idéntica** (mismas columnas, mismos constraints) y que `_prisma_migrations` queda coherente →
  volver a aplicar.
- **Se repite después de T13** (merge con `dev`), por el aviso de terreno compartido.
- **Hecho cuando:** el ciclo termina limpio, la salida queda pegada en
  `progress/impl_QC-42-modelo-proveedores.md`, y cierra **R34** en su forma real (el test estático
  solo mira el texto del SQL).

### [x] T11. Tests de integración contra Postgres real
- Dep: T10, T6 (para no duplicar lo que ya cubre el estático).
- Archivos: `tests/integration/proveedores/proveedores-constraints.int.test.ts`.
- Cada caso dentro de `prisma.$transaction` que termina en `ROLLBACK`; toda operación que se
  espera que falle, envuelta en `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` y ejecutada con
  `$executeRaw` (`design.md > 12`, nota de QC-24 § 10.1: por la API tipada Prisma pierde el
  SQLSTATE). Se afirma sobre el **SQLSTATE** (`23502`, `23503`, `23505`, `23514`), **nunca** sobre
  el texto del error. Copiar los helpers de
  `tests/integration/recetas/recetas-constraints.int.test.ts`.
- **Cada caso crea sus propios usuario y producto dentro de la transacción**: las tres FK son
  reales y no se depende del seed. El autor es **opcional**, así que hay que cubrir los dos
  caminos.
- **Casos obligatorios de la regla cruzada de contacto (R4, encargo propio de esta feature):**
  1. proveedor con teléfono y sin correo → **acepta**;
  2. proveedor con correo y sin teléfono → **acepta**;
  3. proveedor con los dos → **acepta**;
  4. proveedor **sin ninguno de los dos** → **rechaza con `23514`**;
  5. `UPDATE` que deja al proveedor sin ninguno de los dos → **rechaza con `23514`**.
- `beforeAll` que falle con un mensaje claro («corre `pnpm run db:migrate`») si `suppliers` o
  `supplier_catalog_lines` no existen.
- **Hecho cuando:** todos los casos pasan y cubren R1, R2, R3, R4, R5, R6, R7, R9, R10, R11, R12,
  R13, R14, R15, R16, R17, R22, R24, R26, R27, R28, R29, R30, R31.

---

## Bloque F — Cierre

### [x] T12. Confirmar que no entró ninguna dependencia nueva
- Dep: T4, T11.
- Archivos: ninguno.
- `git diff origin/dev -- package.json pnpm-lock.yaml` **vacío** (decisión cerrada 22, R36). Si el
  implementer creyó necesitar una librería, **no la instala**: para y la propone al leader, que la
  sube al humano (regla 7 de `CLAUDE.md`). `design.md > 7` ya descarta las tres candidatas
  previsibles.
- **Hecho cuando:** el diff está vacío y `tests/guards/guard-dependencias-aprobadas.test.ts` pasa.

### [x] T13. Sincronizar con `dev` y correr el gate completo (la corre el leader)
- Dep: T0–T12. **Y su parte de merge se hace ANTES de dar por buena la migración** (aviso de
  terreno compartido): si al mergear cambia `db/schema.prisma`, **se repite T10**.
- Archivos: ninguno (salvo lo que traiga el merge).
- **La corre el leader, no el implementer** (`AGENTS.md > Regla del gate`), igual que la T13 de
  QC-24.
- `git fetch origin dev` → `git merge origin/dev` → resolver el conflicto de `db/schema.prisma`
  con QC-32 **conservando los dos bloques de modelos y los comentarios OJO de ambos** → `./init.sh`
  **sin flags**. El modo rápido no vale aquí: lo que esta feature acopla es SQL, nombres de archivo
  y la forma del árbol de módulos, y el grafo de imports no lo ve
  (`docs/verification.md > Lo que --rapido NO cubre`).
- Comprobación específica del merge: que **QC-32 no haya tocado `supplier_catalog_lines`** y que
  `products` siga sin ninguna columna añadida por QC-42.
- **Hecho cuando:** `./init.sh` termina en `== init OK ==`, con todas las guardias en verde, y T10
  se ha vuelto a correr limpio **después** del merge.
- **Corrida por el leader el 2026-09-03.** El merge con `origin/dev` fue **no-op**: QC-32 no
  esta en `origin/dev` todavia, solo existe local en otro worktree, asi que `db/schema.prisma`
  no cambio y no hubo que repetir T10. **Pero el gate cayo rojo igual**: 4 archivos de
  integracion de `inventario` y `recetas`, porque la base fisica `QuimiCloude` esta
  **compartida entre worktrees** y QC-32 ya le aplico su migracion (`products.unit_id` y la
  tabla `units`). El cliente de Prisma de esta rama pide `unit`, la base tiene `unit_id`.
  Ningun rojo era de QC-42. Se aplico el precedente de QC-14 y QC-20 —**una base por
  worktree**—: base propia `QuimiCloude_QC42`, `.env` git-ignorado del worktree apuntando
  ahi, cadena completa de migraciones aplicada limpia. Segunda corrida: **94 archivos,
  1039 tests, 0 rojos, `== init OK ==`**.


### [x] T14. Documentar el mapa `R<n> → test`
- Dep: T13.
- Archivos: `progress/impl_QC-42-modelo-proveedores.md`.
- Copiar la tabla de trazabilidad de abajo con la **salida real** de los tests, no con la
  intención (`CHECKPOINTS.md > Trazabilidad`).
- Anotar además: el estado de las **ocho** preguntas abiertas de `requirements.md` (cinco del
  humano, tres de `spec_author`) y de las tres de `design.md > 11`; si alguna se resolvió durante
  la implementación, se dice aquí y el leader la lleva a la tabla de decisiones.
- **Hecho cuando:** el archivo existe, cada R1–R36 tiene al menos un test **ejecutado** (no solo
  escrito) y el reviewer lo valida contra `CHECKPOINTS.md > Trazabilidad`.

---

## Trazabilidad

Abreviaturas:
**S** = `tests/unit/proveedores/schema/proveedores-schema.test.ts` ·
**M** = `tests/unit/proveedores/schema/proveedores-migration.test.ts` ·
**N** = `tests/unit/proveedores/domain/supplier-name.test.ts` ·
**C** = `tests/unit/proveedores/module-contract.test.ts` ·
**I** = `tests/integration/proveedores/proveedores-constraints.int.test.ts` ·
**G1** = `tests/guards/guard-rls-force.test.ts` ·
**G2** = `tests/guards/guard-arquitectura-modulos.test.ts` ·
**G3** = `tests/guards/guard-dependencias-aprobadas.test.ts` ·
**T10** = la task T10 de este archivo (ciclo apply → rollback → apply, evidencia en
`progress/impl_QC-42-modelo-proveedores.md`).

| R | Test estático / unitario / guardia | Test contra base real |
| --- | --- | --- |
| R1 | S · «Supplier declara id uuid propio, nombre, telefono y correo» | I · «crea un proveedor con todos sus datos y los relee sin perdida» |
| R2 | M · «name es NOT NULL en la tabla suppliers» | I · «rechaza un proveedor sin nombre con SQLSTATE 23502» |
| R3 | S · «phone y email son opcionales por separado» | I · «acepta proveedor solo con telefono y proveedor solo con correo» |
| R4 | M · «existe el CHECK suppliers_contact_required con OR, y el test cae si se cambia a AND» | I · «rechaza un proveedor sin telefono ni correo con 23514, en INSERT y en UPDATE» |
| R5 | S · «name, phone y email son TEXT, sin varchar ni limite declarado» · M · «ninguna columna de las dos tablas declara VARCHAR(n)» | I · «acepta un nombre de 500 caracteres y un correo de 500» |
| R6 | M · «no hay indice unico ni CHECK de formato sobre phone ni sobre email» | I · «dos proveedores vivos comparten telefono y correo, y un correo sin forma de correo se acepta» |
| R7 | M · «existe CREATE UNIQUE INDEX sobre name_normalized, y el test cae si desaparece» | I · «rechaza un segundo proveedor con el mismo nombre normalizado con SQLSTATE 23505» |
| R8 | N · los casos de normalizacion e idempotencia · S · «Supplier declara name_normalized obligatorio» · C · «el barrel de proveedores exporta normalizeSupplierName» | — (propiedad de una funcion pura; la base no añade informacion) |
| R9 | M · «el indice unico del nombre es PARCIAL (WHERE deleted_at IS NULL), y el test cae si se quita el WHERE» | I · «tras dar de baja un proveedor, otro puede usar su mismo nombre» |
| R10 | S · «SupplierCatalogLine declara proveedor, producto, costo, minimo y plazo como entidad propia con id» | I · «crea una linea con costo, minimo y plazo propios y la relee» |
| R11 | M · «existe el indice unico (supplier_id, product_id)» | I · «rechaza dos lineas del mismo producto en el mismo proveedor con 23505» |
| R12 | — | I · «acepta muchas lineas por proveedor y el mismo producto en dos proveedores distintos con costos distintos» |
| R13 | S · «product_id y cost obligatorios; min_purchase y delivery_time opcionales y sin default» · M · «cost es NOT NULL y min_purchase/delivery_time admiten NULL» | I · «una linea sin minimo y sin plazo queda con ausencia de valor, no con cero» |
| R14 | S · «cost y min_purchase son Decimal(14,4) y en los dos modelos no hay ningun Float» · M · «se declaran DECIMAL(14,4) y el test cae si alguien lo cambia a double precision» | I · «costo y minimo conservan cuatro decimales exactos y su columna es numeric(14,4)» |
| R15 | S · «min_purchase es Decimal, no Int, a diferencia de products.min_purchase» | I · «acepta un minimo de compra de 2,5 y lo devuelve sin redondear» |
| R16 | S · «delivery_time es Int» · M · «delivery_time es INTEGER» | I · «rechaza un plazo con parte fraccionaria y acepta uno entero» |
| R17 | M · «los tres CHECK de no negatividad existen, y el test cae si se relaja >= 0» | I · «rechaza costo, minimo y plazo negativos con 23514, y acepta el cero» |
| R18 | S · «no existe ninguna columna de moneda ni divisa en las dos tablas» | — (propiedad de la declaracion) |
| R19 | S · «model Product no cambia y no gana ninguna relacion hacia proveedores» · M · «la migracion no contiene ningun ALTER TABLE products» | **T10** · tras el rollback, `products` queda con las mismas columnas y constraints |
| R20 | S · «los dos modelos declaran /// @module proveedores» · G2 · «todo modelo del esquema real declara su modulo propietario» | — |
| R21 | C · «lib/modules/proveedores no contiene prisma.product, prisma.user, @prisma/client ni rutas profundas a inventario/identity» · G2 | — |
| R22 | S · «product_id, created_by y updated_by son escalares uuid SIN @relation» · M · «las tres FK que cruzan de modulo existen en el SQL con ON DELETE RESTRICT» · **C · «Prisma.dmmf: la unica relacion de SupplierCatalogLine es Supplier; Product y User no ganan campo de vuelta»** | I · «la base rechaza un product_id y un created_by inexistentes con 23503, aunque Prisma no declare la relacion» |
| R23 | C · «el modulo proveedores tiene index.ts, solo carpetas domain/ports/adapters y ningun 'use server' alcanzable desde el barrel» · G2 | — |
| R24 | S · «created_by y updated_by son escalares uuid opcionales» · M · «las dos FK de auditoria apuntan a users y no son ON DELETE SET NULL» | I · «registra autor y ultimo editor, acepta un proveedor sin autor, y rechaza un autor inexistente con 23503» |
| R25 | S · «SupplierCatalogLine no declara createdBy ni updatedBy» | — (propiedad de la declaracion) |
| R26 | S · «Supplier declara deletedAt opcional y ninguna columna de estado activo/inactivo» | I · «la baja conserva la fila completa y marca deleted_at» |
| R27 | S · «las dos tablas declaran createdAt y updatedAt» | I · «created_at y updated_at se rellenan solos y updated_at cambia al modificar, en las dos tablas» |
| R28 | S · «SupplierCatalogLine no declara deletedAt» | I · «quitar un producto del catalogo elimina la fila de la linea» |
| R29 | M · «la FK supplier_catalog_lines_supplier_id_fkey es ON DELETE CASCADE, y el test cae si se cambia a RESTRICT» | I · «borrar fisicamente un proveedor se lleva sus lineas y no deja huerfanas» |
| R30 | — | I · «la baja logica de un proveedor deja sus lineas intactas y asociadas» |
| R31 | M · «la FK a products es ON DELETE RESTRICT» | I · «un producto borrado logicamente conserva su linea» · I · «rechaza el borrado fisico de un producto usado por una linea con 23503» |
| R32 | S · «las dos tablas mapean a suppliers y supplier_catalog_lines, en ingles y snake_case» · M · «todos los identificadores creados por la migracion estan en ingles» | — (propiedad del texto) |
| R33 | M · «las dos tablas quedan con RLS activado y forzado» · G1 · «toda tabla creada tiene RLS activado y forzado» | — (un test de RLS con Prisma sale verde pase lo que pase: `design.md > 12`) |
| R34 | M · «down.sql revierte exactamente lo que crea migration.sql y no toca pgcrypto» | **T10** · ciclo apply → rollback → apply, con la salida pegada en `progress/impl_QC-42-modelo-proveedores.md` |
| R35 | C · «la feature no anade adaptadores driving, rutas ni Server Actions» | — (no hay flujo navegable: E2E diferido con motivo, decision cerrada 21, `design.md > 9`) |
| R36 | G3 · «toda dependencia de package.json tiene su fila en el registro» · T12 · diff vacio de package.json | — |

Los 36 requisitos tienen al menos un test ejecutable. **R8, R18, R20, R21, R23, R25, R32, R33, R35
y R36 se cierran solo con tests estáticos, unitarios o guardias, a propósito**: son propiedades de
una función pura, del texto del esquema o del árbol de archivos, y una base real no añadiría nada
—en el caso de R33 añadiría un falso verde—. **R12 y R30 se cierran solo contra base real**,
porque son comportamientos de permiso y de conservación que el texto del esquema no expresa.
**R19 y R34 se cierran con la task T10**, que es la única evidencia real de que revertir deja el
esquema como estaba.
