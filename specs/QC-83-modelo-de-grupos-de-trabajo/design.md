# QC-83 — modelo-de-grupos-de-trabajo · design.md

> El QUÉ está en `requirements.md` (R1–R28) y el alcance lo cerró el humano antes del spec. Aquí
> va el CÓMO: dos tablas nuevas en el módulo `identity`, una restricción única añadida a `users`,
> una migración con su `down.sql`, y **cero** service, Server Action o pantalla (R27).
>
> El precedente directo es **QC-47** (`specs/QC-47-modelo-empresa-y-membresias/design.md`): tabla
> nueva con empresa, índice único **funcional y parcial** escrito a mano, RLS forzada y `down.sql`
> que revierte al esquema exacto. Lo que QC-83 añade y QC-47 no tenía es la **coherencia de empresa
> entre dos padres** (§2), que es el punto interesante de la ficha.

---

## 1. Modelo de datos

### 1.1 `work_groups` (tabla nueva)

```prisma
/// @module identity
model WorkGroup {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name           String
  nameNormalized String    @map("name_normalized")
  companyId      String    @map("company_id") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(6)

  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@unique([id, companyId], map: "work_groups_id_company_id_key")
  @@index([companyId], map: "work_groups_company_id_idx")
  @@map("work_groups")
}
```

- **`id` UUID aleatorio generado por la base** (R1): patrón de QC-4/QC-47, ni correlativo ni
  derivado del nombre.
- **`name` es `TEXT` sin longitud** (R2). El tope de caracteres vivirá en el `zod` de QC-84, no en
  el tipo de la columna: cambiarlo no puede ser una migración. Mismo criterio que
  `orders.cancellation_reason` (QC-34).
- **`nameNormalized` en columna propia** (R3), calculada por `normalizeWorkGroupName` (§4) y
  persistida junto a `name` en toda escritura futura.
- **La unicidad del nombre NO va como `@@unique`** y es deliberado (R4, R5, R6): es un índice
  **funcional** (`lower(...)`) y **parcial** (`WHERE deleted_at IS NULL`) y **compuesto con la
  empresa**, y Prisma no modela ninguna de las tres cosas. Vive escrito a mano en `migration.sql`
  (§3.1, paso 3) y ese es el único sitio donde existe. Mismo patrón que `companies_name_unique`,
  `recipes_name_unique` y `suppliers_name_unique`.
- **`companyId` va con `@relation` de Prisma**, no como escalar suelto, por la razón exacta que
  QC-47 escribió para `users.company_id`: `WorkGroup` y `Company` son los dos de `identity`, no hay
  frontera de módulo que proteger, y así la FK la genera Prisma en vez de quedar como drift manual
  que toda migración futura tenga que vigilar. `Company` gana `workGroups WorkGroup[]`.
- **`ON DELETE RESTRICT`** (R10): borrar físicamente una empresa con grupos —vivos o de baja— falla
  con `23503`.
- **`work_groups_company_id_idx` no es redundante** con el índice único del nombre: ese es
  **parcial**, así que no sirve para la verificación del `RESTRICT`, que tiene que ver también los
  grupos dados de baja. Postgres tampoco indexa solo por ser el lado hijo de una FK.
- **`work_groups_id_company_id_key` es el único añadido que no pide ningún requisito de negocio**:
  existe para que la pertenencia pueda apuntar a `(id, company_id)` (§2). Es único **trivialmente**
  —`id` ya es la PK—, no impone ninguna restricción nueva y sí es **obligatorio** en Postgres: una
  FK compuesta exige que las columnas referenciadas tengan una restricción única. Se declara en
  Prisma para que **no sea drift**.
- `deletedAt` nace y se queda **vacía** (R7): la operación de baja es de QC-84.

### 1.2 `work_group_members` (tabla nueva)

```prisma
/// @module identity
model WorkGroupMember {
  workGroupId String   @map("work_group_id") @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  companyId   String   @map("company_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@id([workGroupId, userId], map: "work_group_members_pkey")
  @@index([userId], map: "work_group_members_user_id_idx")
  @@map("work_group_members")
}
```

- **PK compuesta `(work_group_id, user_id)`** (R16): la misma persona no puede estar dos veces en
  el mismo grupo, y el índice de la PK cubre la consulta caliente «quiénes están en este grupo».
  Mismo patrón que `role_permissions` (QC-74).
- **`work_group_members_user_id_idx` sirve el sentido inverso**, «en qué grupos está esta persona»,
  que es lo que va a preguntar QC-86 al asignar y QC-88 al listar por responsable. La PK no lo
  cubre: un índice compuesto solo sirve las consultas que empiezan por su primera columna.
- **NO hay `deleted_at`, y es un requisito con nombre** (R18, decisión cerrada 4): sacar a alguien
  **borra la fila**. Ver §2.3.
- **`created_at` y `updated_at` van igual** (R11, decisión cerrada 12) aunque la fila **nunca se
  actualice**: una pertenencia se crea o se borra, no se edita. Es la decisión del humano y no se
  reabre; el coste es una columna inerte. `updated_at` es `NOT NULL` **sin default de base** —lo
  rellena `@updatedAt` del cliente Prisma—, así que **un `INSERT` crudo que no la ponga falla**.
  Misma nota que QC-4, QC-32 y QC-47.
- **Las tres columnas de referencia son `NOT NULL`** (R13) y **ninguna lleva `@relation`**: la razón
  está en §2.2, y no es la de siempre (aquí no hay frontera de módulo que proteger: los tres padres
  son de `identity`).

### 1.3 `users`: gana una restricción única y nada más

```prisma
model User {
  …                                                       // ni una columna cambia
  @@unique([id, companyId], map: "users_id_company_id_key")   // ← LO ÚNICO QUE ENTRA (R23)
  @@index([roleId], map: "users_role_id_idx")
  …
}
```

Es el precio de que la garantía de R14 la dé la base. Igual que en `work_groups`, es únicamente
**trivial**: `id` ya es la PK, así que la restricción no puede rechazar ninguna fila que hoy se
acepte, no cambia ningún plan de consulta existente y no obliga a tocar ni un fixture. Lo que sí
hace es **habilitar la FK compuesta** de §2.1. Se declara en Prisma para que no sea drift, y el
`down.sql` la quita (R25).

### 1.4 Lo que NO se modela

- **Ninguna columna de rol, de fecha de entrada o de salida en la pertenencia** (R18): el histórico
  que importa —quién era responsable de un pedido— lo congela QC-86 al asignar, y no depende de
  esta tabla.
- **Ninguna jerarquía de grupos, ni grupos anidados, ni grupos de grupos.** No está pedido y
  `docs/architecture.md > Dominio` n.º 1 lo llama sobre-ingeniería por su nombre.
- **Ningún estado activo/inactivo del grupo aparte del `deleted_at`** (mismo criterio que
  `Supplier`, QC-24 decisión 10): un segundo estado que nadie sabe distinguir del primero es deuda.

---

## 2. El punto delicado: que la BASE rechace la fila cruzada

Es la decisión cerrada 1 y el riesgo n.º 1 de la ficha. El enunciado es fácil de escribir y fácil
de implementar mal: «la persona y el grupo tienen que ser de la misma empresa».

### 2.1 Cómo se garantiza de verdad: dos claves foráneas COMPUESTAS

`work_group_members` lleva `company_id` propio (decisión cerrada 1) y **las dos FK lo incluyen**:

```sql
ALTER TABLE "work_group_members"
  ADD CONSTRAINT "work_group_members_work_group_id_fkey"
  FOREIGN KEY ("work_group_id", "company_id")
  REFERENCES "work_groups" ("id", "company_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_group_members"
  ADD CONSTRAINT "work_group_members_user_id_fkey"
  FOREIGN KEY ("user_id", "company_id")
  REFERENCES "users" ("id", "company_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

Leído en voz alta: la fila declara **una** empresa, y esa empresa tiene que ser a la vez la del
grupo **y** la de la persona. Como la igualdad es transitiva, grupo y persona son de la misma
empresa **por construcción**, y no hay ningún estado intermedio en el que no lo sean. No es una
comprobación que alguien pueda olvidarse de llamar: es la definición de la tabla (R14).

**Qué pasa en cada intento de romperlo:**

| Intento | Qué responde Postgres |
| --- | --- |
| `INSERT` con un grupo de la empresa A y una persona de la B | `23503` contra una de las dos FK, según cuál se evalúe primero |
| `INSERT` con `company_id` que no es ni la del grupo ni la de la persona | `23503` contra las dos |
| `UPDATE work_group_members SET user_id = <alguien de otra empresa>` | `23503` |
| `UPDATE users SET company_id = <otra>` con esa persona en un grupo | el `ON UPDATE CASCADE` propaga la empresa nueva a sus filas de pertenencia y **entonces** la FK del grupo falla con `23503` (R15) |
| `UPDATE work_groups SET company_id = <otra>` con el grupo poblado | simétrico: cascada a la pertenencia y fallo contra la FK de la persona (R15) |
| `INSERT` desde un seed, un script o una consola | exactamente lo mismo: **no hay camino que se salte esto** |

Ese último renglón es toda la decisión cerrada 1: dejarlo en manos del caso de uso de QC-84 significa
que un script, un seed o un bug futuro escriben la fila y **nada da rojo** hasta que alguien vea
pedidos que no son suyos.

**Por qué `ON DELETE` es distinto en cada FK:**

- Hacia `work_groups`, **`CASCADE`**: la pertenencia es *parte del* grupo y no tiene vida propia,
  igual que `recipe_lines` hacia `recipes`. En operación normal **no se dispara nunca** —el grupo se
  da de baja lógica, y ninguna FK reacciona a un `UPDATE`—; es la red para un borrado físico (una
  purga, un `down.sql`), donde dejar pertenencias huérfanas sería peor que borrarlas.
- Hacia `users`, **`RESTRICT`**: una persona no se borra físicamente en este ERP (borrado lógico,
  QC-4), así que un `DELETE` sobre `users` es ya una anomalía y tiene que ser **ruidosa**. Mismo
  trato que `users.role_id` hacia `roles`.

### 2.2 Por qué las dos FK van escritas A MANO y sin `@relation`

Los tres padres son de `identity`, así que **no aplica** el argumento habitual del repo (evitar que
un `include` cruce de módulo, como en `products.unit_id`). La razón aquí es otra: son FK
**compuestas** y **comparten la columna `company_id`**. Que el esquema de Prisma admita dos campos
de relación que reutilicen el mismo escalar es un **desconocido**: no está escrito en `docs/`, no hay
precedente en `db/schema.prisma` —ninguna FK del repo es compuesta— y no se ha verificado
(regla 6 de `CLAUDE.md`). En vez de apostar, se usa el patrón que el repo ya tiene rodado: escalares
sin `@relation` y **la FK escrita a mano en `migration.sql`**, como `orders.recipe_id`,
`recipe_lines.product_id` o `supplier_catalog_lines.presentation_id`.

**Lo que eso cuesta, y se acepta:** las dos FK son **drift** para Prisma. Toda migración futura que
toque `work_group_members` va a emitir `DROP CONSTRAINT` sobre ellas y **hay que borrarlo a mano del
SQL generado**, exactamente como ya hacen todas las migraciones desde QC-20. Se mitiga con el
comentario `/// OJO` en el modelo —el repo lo usa para justo esto— y con el test de esquema (§6),
que falla si el SQL de la ficha deja de declararlas.

**Consecuencia útil:** sin `@relation`, `WorkGroupMember` tampoco obliga a declarar un lado inverso
en `User`, y ningún `include` puede atravesar de una pertenencia a la ficha completa de una persona.
Lo que QC-84 y QC-86 necesiten saber de la persona lo pedirán al dominio de `identity`.

### 2.3 El `deleted_at` es del GRUPO, no de la pertenencia — y por qué

Es la **excepción explícita al borrado lógico** de QC-4 (decisión cerrada 4), y se argumenta porque
`docs/architecture.md > Anti-patrones` prohíbe el `DELETE` físico **en tablas transaccionales**:

1. **La pertenencia no es una transacción, es una relación viva.** No registra una operación de la
   empresa: registra un hecho presente, «esta persona está en este grupo». El registro que sí es la
   operación —quién era responsable de un pedido— lo **congela QC-86** en el instante de asignar, y
   no lee esta tabla para reconstruir el pasado.
2. **La baja lógica aquí solo compraría «quién estuvo en Turno noche en marzo»**, que nadie ha
   pedido, a cambio de dos costes permanentes: un índice único **parcial** en vez de una PK simple
   (porque `(work_group_id, user_id)` dejaría de ser único al haber filas muertas) y que **toda**
   lectura de miembros, para siempre, tenga que acordarse de filtrar. La que se olvide una vez
   asigna trabajo a alguien que ya no está en el grupo, en silencio.
3. **El grupo sí es distinto**: tiene nombre, se referencia desde fuera y borrarlo de verdad
   destruiría información que alguien puso. Va a baja lógica (R7) con el patrón de siempre, y su
   nombre queda liberado por el índice **parcial** (R6).

**Consecuencia que hay que escribir, porque es contraintuitiva:** dar de baja un grupo **no borra
sus pertenencias** (R21) —ninguna FK reacciona a un `UPDATE`— y dar de baja a una persona tampoco
(R20). Las filas se quedan. **Quién las filtra al leer es QC-84**, no esta ficha, y no hay ninguna
garantía en la base que lo haga por él: es el precio pagado a cambio de que reactivar una cuenta
devuelva a esa persona a sus grupos sin rehacer nada.

---

## 3. La migración

**Una migración nueva y aditiva**, `db/migrations/<ts>_work_groups_and_members/`, con su
`migration.sql` (UP) y su `down.sql` (DOWN, obligatorio,
`docs/architecture.md > Migraciones up/down`). No se reescribe ninguna existente: todas están
mergeadas y aplicadas, que es justo la condición que QC-47 §3 declaró como límite de su excepción.

### 3.1 Orden del `migration.sql` (UP)

El orden **no es cosmético**; cada paso depende del anterior:

1. `CREATE TABLE "work_groups"` (§1.1), con su `work_groups_pkey`.
2. `CREATE TABLE "work_group_members"` (§1.2), con su `work_group_members_pkey`
   `PRIMARY KEY ("work_group_id","user_id")`.
3. `CREATE UNIQUE INDEX "work_groups_name_unique" ON "work_groups" ("company_id", lower("name_normalized")) WHERE "deleted_at" IS NULL;`
   — a mano: **compuesto, funcional y parcial** (R4, R5, R6). El `lower(...)` es redundante sobre
   una columna ya normalizada y se escribe igual, por simetría con `users_email_unique` y
   `companies_name_unique` y para que la unicidad **no dependa de que el llamante haya normalizado
   bien**.
4. `CREATE UNIQUE INDEX "work_groups_id_company_id_key" ON "work_groups"("id", "company_id");` y
   `CREATE UNIQUE INDEX "users_id_company_id_key" ON "users"("id", "company_id");` — las dos dianas
   de las FK compuestas (§2.1). **Antes** de crearlas: una FK compuesta sin restricción única en el
   padre falla con `42830`.
5. `CREATE INDEX "work_groups_company_id_idx"` y `CREATE INDEX "work_group_members_user_id_idx"`.
6. `ALTER TABLE "work_groups" ADD CONSTRAINT "work_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;` (R9, R10).
7. Las **dos FK compuestas** de §2.1 (R13, R14, R15).
8. Los cuatro `ALTER TABLE … ENABLE / FORCE ROW LEVEL SECURITY` sobre las dos tablas nuevas (R24),
   **al final del todo**. Esta migración no escribe ni una fila, y el orden importa igual por la
   lección de QC-32 y QC-74: `FORCE` sin policies deniega también al dueño cuando no es
   superusuario, así que una escritura futura colocada después de estos `ALTER` podría no escribir
   nada **en silencio**.

**Lo que hay que borrar a mano del SQL que genere Prisma** (R23), igual que hicieron
`20260904180600_companies_and_user_company` y `20260907183034_permissions_and_role_permissions`:
los `DROP CONSTRAINT` sobre `orders`, `products`, `recipe_lines`, `recipes`,
`supplier_catalog_lines`, `suppliers` y `units` —las FK escritas a mano por QC-20, QC-24, QC-32,
QC-33, QC-40 y QC-76, que Prisma no conoce— y los `DROP INDEX` sobre `presentations` y `units` de
QC-57, incluidos los GIN de trigramas. Esta migración **no toca ninguna tabla existente** salvo por
el índice único que añade a `users` en el paso 4.

### 3.2 No hay backfill, y eso es una diferencia real con QC-47

Las dos tablas nacen **vacías** y ninguna tabla existente gana una columna obligatoria. De ahí se
siguen tres cosas que conviene decir antes de que alguien las busque:

- **No hay pregunta de RLS que resolver.** La duda de QC-47 —si `FORCE ROW LEVEL SECURITY` sobre
  `users` deja pasar el `UPDATE` del backfill— **no aplica aquí**: esta migración no hace ningún
  `UPDATE` ni ningún `INSERT`. Sigue siendo verdad lo que midió QC-47 (T5): con dueño no
  superusuario, una escritura bajo `FORCE` sin policies puede afectar **0 filas sin dar error**. Por
  eso el paso 8 va el último.
- **No hay literal duplicado entre el SQL y el dominio.** QC-47 tuvo que escribir `'QuimiCloud'` a
  mano en el backfill porque una migración no puede llamar a TypeScript. Aquí no hay ningún nombre
  que sembrar.
- **Ningún fixture existente se rompe.** Ni E2E, ni integración, ni unidad: nadie tiene que empezar
  a pasar un dato nuevo para que su `user.create` compile. Es lo que hace que R27 sea barato de
  cumplir y no una promesa.

### 3.3 El `down.sql` (R25, R26)

Orden inverso y estricto:

1. `DROP TABLE "work_group_members";` — se lleva su PK, su índice y sus dos FK compuestas. Va
   **primero**: con la hija en pie, el `DROP TABLE "work_groups"` falla por dependencia. **No se usa
   `CASCADE`**, a propósito: el fallo debe ser ruidoso, no silencioso (mismo criterio que el
   `down.sql` de QC-74).
2. `DROP TABLE "work_groups";` — se lleva `work_groups_name_unique`, `work_groups_id_company_id_key`,
   `work_groups_company_id_idx`, su FK a `companies` y su RLS.
3. `DROP INDEX "users_id_company_id_key";` — **la única línea que toca una tabla preexistente**, y
   deja `users` con la definición literal que tenía antes de la ficha (R25).
4. **`companies` y `users` no se tocan en ninguna otra línea**, y `pgcrypto` tampoco: el UP no la
   crea en exclusiva y medio repo depende de ella.

**Sobre R26.** Este `down.sql` **no puede** perder ni inventar un dato de una tabla preexistente: no
escribe ninguna fila, no borra ninguna de `users` ni de `companies`, y lo único que elimina son las
dos tablas que el propio UP creó —con los grupos y pertenencias que se hayan dado de alta después,
que es el comportamiento normal e inevitable de revertir un `CREATE TABLE`, igual que en QC-74—.
Tampoco hay una guardia previa que escribir, a diferencia de QC-47 R26: allí el DOWN tenía que
**recrear** un índice global que podía chocar; aquí solo suelta uno trivial. El test de migración
(§6) comprueba **en negativo** que el `down.sql` no contiene ningún `UPDATE`, `DELETE`, `INSERT` ni
`ALTER TABLE` sobre `users` o `companies` más allá del `DROP INDEX` del paso 3, que es la forma
ejecutable de R26 en esta ficha.

---

## 4. La normalización del nombre (R3)

Hace falta **una** definición de «mismo nombre de grupo», nacida con la columna, para que QC-84 no
se invente una segunda. `identity` ya tiene una gemela: `normalizeCompanyName`
(`lib/modules/identity/domain/company-name.ts`), que recorta, baja a minúsculas, quita acentos y
quita todo lo que no sea `[a-z0-9]`.

**Diseño:** se extrae ese cuerpo a un normalizador puro **interno del módulo**
(`lib/modules/identity/domain/normalize-key.ts`, **no** exportado por el barrel) y las dos funciones
con nombre delegan en él:

```ts
// lib/modules/identity/domain/work-group-name.ts
export function normalizeWorkGroupName(name: string): string { return normalizeKey(name) }
```

`normalizeWorkGroupName` se exporta desde `lib/modules/identity/index.ts` (R3). Tres notas:

- **No se reutiliza `normalizeCompanyName` tal cual** para grupos: llamar «nombre de empresa» a la
  normalización del nombre de un grupo es una mentira que sobrevive años, y el día que una de las
  dos reglas cambie —un tope, un carácter admitido— no habría forma de cambiarla sin cambiar la
  otra.
- **Tampoco se copia el cuerpo.** La duplicación consciente que documenta `company-name.ts` es
  **entre módulos** (`identity` no puede importar de `unidades` sin inventarse una dependencia);
  dentro del **mismo** módulo no hay ninguna razón para tener dos veces la misma expresión regular.
- **Es un refactor de comportamiento nulo** sobre un archivo de QC-47, y lo fija el test que ya
  existe: `tests/unit/identity/company-name.test.ts` tiene que seguir verde **sin tocar ni una
  línea**. Si hay que editarlo, el refactor está mal.

**Consecuencia conocida y aceptada:** un nombre compuesto solo por signos normaliza a la cadena
vacía y colisionaría con cualquier otro igual dentro de su empresa. No es un caso que ninguna
decisión cerrada contemple y la base lo trata como cualquier otra colisión (`23505`); rechazarlo
antes es trabajo del `zod` de QC-84, donde vive el tope de longitud.

---

## 5. Rutas, endpoints y contratos de entrada/salida

**Ninguno nuevo** (R27). Esta ficha no crea ruta, pantalla, Server Action, route handler ni regla de
permisos, y no aporta ningún flujo navegable.

| Superficie | Cambio |
| --- | --- |
| Login, sesión, cookie, middleware | **Ninguno.** No leen ni escriben grupos |
| `scripts/seed.ts` y `seedInitialAccess` | **Ninguno.** El seed **no** crea ningún grupo: un «Turno noche» que nadie pidió es una fila fantasma que QC-84 tendría que reutilizar por casualidad |
| Contrato público `@/lib/modules/identity` | **Gana un símbolo**: `normalizeWorkGroupName` (§4). Dominio puro, no arrastra servidor ni Prisma |
| `lib/composition/index.ts` | **Ninguno.** No hay puerto nuevo que cablear: sin caso de uso no hay repositorio |
| Catálogo de permisos (`domain/permissions.ts`) | **Ninguno.** El permiso de grupos, si hace falta, nace con su caso de uso en QC-84 |

**Contrato de datos para quien viene detrás**, escrito aquí para que QC-84 y QC-86 no lo deduzcan:
un grupo se identifica por su `id` (uuid); sus miembros son las filas de `work_group_members` con
ese `work_group_id`; y **la lista incluye a las personas dadas de baja, inactivas o bloqueadas**
(R20). Filtrarlas es de quien lee.

---

## 6. Verificación: qué prueba qué

Sin service ni pantalla, el peso cae en dos sitios, igual que en QC-47.

- **Test de esquema y migración** (unidad, lee los archivos):
  `tests/unit/identity/schema/work-groups-migration.test.ts`. Como mínimo: que
  `work_groups_name_unique` es compuesto con `company_id`, funcional (`lower`) **y** parcial
  (`WHERE deleted_at IS NULL`); que las dos FK de `work_group_members` son **compuestas y llevan
  `company_id`** (si alguien las simplifica a `FOREIGN KEY ("user_id") REFERENCES "users"("id")`,
  este test es lo único que se pone rojo); que el UP no ejecuta DDL sobre tablas de otros módulos
  (R23); que las dos tablas quedan con RLS `ENABLE` **y** `FORCE` (R24, además de la guardia global
  `tests/guards/guard-rls-force.test.ts`); que el `down.sql` no escribe filas ni toca `users` más
  allá del `DROP INDEX` (R26); y que ni el esquema ni el SQL declaran `deleted_at` en
  `work_group_members` (R18).
- **Test de constraints contra Postgres real** (integración, cada caso dentro de una transacción que
  acaba en `ROLLBACK`): `tests/integration/identity/work-groups-constraints.int.test.ts`. Es el
  único sitio donde se demuestra R14, R15 y R16 —los `23503`/`23505` de verdad—, y también R5, R6,
  R10, R17, R19, R20 y R21.

**Criterio de «hecho» que se aplica a los dos:** cada aserción cae al **mutar** lo que vigila, no al
leerla. Es lo que QC-47 exigió en su T11 y lo que separa un test de un comentario largo.

---

## 7. Dependencias de terceros

**Ninguna nueva** (R28, decisión cerrada 17). Es esquema Prisma, SQL escrito a mano y una función
pura de normalización que ya existe en el módulo en forma de gemela. No hay ninguna utilidad
escrita a mano que una librería del ecosistema resuelva mejor: `normalizeKey` son cinco llamadas de
`String.prototype` y ya es el precedente de `normalizeCompanyName`, `normalizeUnitName`,
`normalizeSupplierName` y `normalizeProductName`. Regla 7 de `CLAUDE.md` **sin propuesta que
abrir**, y por tanto **sin los cuatro checks de `docs/architecture.md > Dependencias de terceros`
que rellenar**.

---

## 8. Riesgos

1. **Que alguien simplifique las dos FK compuestas a dos FK simples.** Es el riesgo n.º 1 y el más
   silencioso: el esquema sigue validando, el cliente sigue compilando, todo sigue verde, y la
   decisión cerrada 1 deja de existir sin que nadie se entere hasta que QC-88 liste pedidos ajenos.
   Mitigación: el test de esquema lee las dos `ADD CONSTRAINT` del SQL y exige `company_id` en las
   dos, y el test de integración inserta una fila cruzada y espera `23503`.
2. **Que una migración futura borre esas FK por drift** (§2.2). Es una certeza, no una posibilidad:
   Prisma no las conoce. Mitigación: el comentario `/// OJO` en el modelo, la nota en la cabecera
   del `migration.sql` y el test de esquema, que sigue leyendo el SQL de esta migración.
3. **Que alguien «arregle» el esquema añadiendo `@@unique([companyId, nameNormalized])`.** La
   unicidad pasaría a ser **total** en silencio y un grupo dado de baja quemaría su nombre para
   siempre (R6 muerto, sin error). Mitigación: el comentario `/// OJO` que ya usan `Company`,
   `Recipe`, `Supplier` y `Unit`, y el test de esquema, que comprueba que **no hay** `@@unique` de
   nombre en el modelo.
4. **Que alguien añada `deleted_at` a la pertenencia** «por coherencia con el resto del repo». Es
   exactamente lo que la decisión cerrada 4 descartó, y rompería además la PK (§2.3). Mitigación:
   R18 escrito como requisito y comprobado en negativo por el test de esquema.
5. **Que la restricción única de `users` se cuele como drift.** Si se crea solo en SQL y no se
   declara en Prisma, el siguiente `prisma migrate dev` emitirá su `DROP INDEX` mezclado entre los
   que sí se quieren. Mitigación: se declara en `db/schema.prisma` (§1.3) y el test de esquema lo
   comprueba.

---

## 9. Alternativas descartadas

### 9.1 Un disparador (`TRIGGER`) que valide «misma empresa» al insertar

Es la salida que primero se le ocurre a cualquiera: un `BEFORE INSERT OR UPDATE` en
`work_group_members` que lea la empresa del grupo y la de la persona y lance si no coinciden.
**Descartado**, y es la alternativa seria de esta ficha:

- **Solo mira la tabla hija.** Un `UPDATE users SET company_id = …` o un
  `UPDATE work_groups SET company_id = …` **no lo disparan**, así que la coherencia se rompe por la
  espalda y las filas cruzadas aparecen sin que nada falle (R15 muerto). Para taparlo harían falta
  **tres** disparadores, uno por tabla, y mantener los tres sincronizados para siempre.
- **Es código nuestro, no una garantía declarativa.** Un `FOREIGN KEY` lo verifica el planificador
  de Postgres en cada camino de escritura, incluidos los que no existen todavía; un trigger es una
  función PL/pgSQL que hay que leer para saber qué garantiza, que se puede desactivar
  (`ALTER TABLE … DISABLE TRIGGER`) y que nadie recuerda al escribir la migración siguiente.
- **Cuesta dos `SELECT` extra por fila insertada**, mientras que la FK compuesta usa índices que ya
  existen.

El repo tiene un precedente de trigger (`units_check_derivation`, QC-76) y por eso hay que decir por
qué **aquí no**: aquel valida una regla **dentro de la propia fila y su padre** que ninguna FK sabe
expresar (que `factor` y `base_unit_id` vayan juntos o ninguno, y que la derivación sea de un solo
nivel). Esta regla, en cambio, **sí** se expresa con FK. Cuando la declaración alcanza, gana la
declaración.

### 9.2 No llevar `company_id` en la pertenencia y validar en el service (QC-84)

Es la opción barata: dos FK simples (`user_id`, `work_group_id`) y una comprobación en el caso de
uso. **Descartada por el humano en la decisión cerrada 1**, y se anota aquí porque es lo que alguien
va a proponer al ver una tabla de unión con tres columnas en vez de dos. La razón está escrita en la
decisión: un script, un seed o un bug futuro escriben la fila cruzada y **nada da rojo**.
`docs/architecture.md > Acceso a datos y autorizacion` dice que la frontera de **autorización** vive
en el service —y sigue siendo verdad, QC-84 tendrá que filtrar por empresa igual—, pero eso no es lo
mismo que la **integridad referencial**, que es de la base desde siempre.

### 9.3 Baja lógica también en la pertenencia

Conservar el rastro de quién estuvo en el grupo con un `deleted_at` en `work_group_members`.
**Descartada por la decisión cerrada 4**; el argumento completo, con sus dos costes permanentes,
está en §2.3.

### 9.4 Meter la empresa en la clave primaria de `work_groups` (`(company_id, id)` compuesta)

El patrón de aislamiento fuerte de algunos ERP multiempresa: ninguna FK puede cruzar de empresa por
construcción, sin necesidad de restricción única auxiliar. **Descartado**, por la misma razón que
QC-47 §9.3 lo descartó para `users`: obligaría a que **toda** referencia futura a un grupo —QC-86 la
primera— arrastre dos columnas en vez de una, y el beneficio es idéntico al que ya da la FK
compuesta de §2.1 con una PK normal. Se paga complejidad en todos los hijos para ahorrar una
restricción única trivial en el padre.

### 9.5 Un módulo propio `grupos` en vez de vivir en `identity`

**Descartado por el Alcance**, que lo cierra: «un grupo es un conjunto de personas y las personas ya
viven ahí». Técnicamente además abriría un problema real: la pertenencia necesita una FK **a
`users`**, que es de `identity`, y una FK entre módulos hay que escribirla a mano y vigilarla
—precedente `products.unit_id`—. Si algún día nace ese módulo, la mudanza es barata **mientras nadie
lea estas dos tablas desde fuera de `identity`**, y eso ya lo prohíbe R22.
