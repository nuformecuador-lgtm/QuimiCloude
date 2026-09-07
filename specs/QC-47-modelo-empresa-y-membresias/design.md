# QC-47 — modelo-empresa-y-membresias · design.md

> **Reescrito de cero el 2026-09-04**, después de que el humano reacotara la ficha. El
> `design.md` anterior describía un modelo de **muchos a muchos** con tabla `memberships` y con el
> rol mudado a esa tabla. **Está descartado entero**, no parcheado. Lo que sigue es el diseño del
> modelo correcto: **una empresa por usuario, un rol por usuario, `users.role_id` intacta**.
>
> El slug de la carpeta y de la rama dice «membresias» y ya no hay membresías: se conserva a
> propósito (`requirements.md`, cabecera).

---

## 0. Punto de partida: la rama trae una implementación que hay que deshacer

Esto no es una feature que empieza en limpio. La primera vuelta **está commiteada** en
`feature/QC-47-modelo-empresa-y-membresias` (tandas A–F, commits `f76b990`, `8bdf5b3`, `25692d3`,
`7a45677` y siguientes, según `progress/impl_QC-47-modelo-empresa-y-membresias.md`), y responde al
modelo viejo. Inventario de lo que hay hoy en el worktree y de qué pasa con cada cosa:

| Qué hay hoy | Qué pasa |
| --- | --- |
| `db/schema.prisma` > `model Company` | **Se queda**, quitándole `memberships Membership[]` y su comentario sobre la pertenencia |
| `db/schema.prisma` > `model Membership` | **Se borra entero** |
| `db/schema.prisma` > `model User` sin `roleId` | **Vuelve `roleId`** tal cual estaba en QC-4, y **gana `companyId`** |
| `db/schema.prisma` > `model Role` sin `users User[]` | **Vuelve `users User[]`** |
| `db/migrations/20260904180600_companies_and_memberships/` | **Se reescribe en su sitio** (§3) y la carpeta se renombra |
| `lib/modules/identity/domain/company-name.ts` | **Se queda tal cual**: `normalizeCompanyName` sigue siendo R3 |
| `lib/modules/identity/domain/companies.ts` | **Se queda tal cual**: `INITIAL_COMPANY_NAME` sigue siendo R21 |
| `lib/modules/identity/index.ts` | **Se queda**: los dos símbolos siguen siendo del contrato |
| `lib/modules/identity/ports/initial-access-repository.ts` | Pierde el vocabulario de pertenencia; conserva empresa (§5) |
| `lib/modules/identity/domain/seed-initial-access.ts` | Conserva la resolución de la empresa; `createInitialAdmin` recupera `roleId` **como columna del usuario** |
| `…/persistence/initial-access-repository-prisma.ts` | `countLiveUsersWithRole` y el `catch (P2002)` **vuelven a `role: { name }` sobre `users`** |
| `…/persistence/user-credentials-prisma.ts` | El `JOIN memberships` se va: **vuelve el `JOIN roles r ON r.id = u.role_id`** |
| `…/persistence/session-user-prisma.ts` | El `select { memberships: … }` se va: **vuelve `role: { select: { name: true } }`** |
| `tests/unit/identity/schema/companies-migration.test.ts` | Se reescribe: la mitad que habla de `memberships` desaparece |
| `tests/unit/identity/company-name.test.ts` | **Se queda tal cual** |
| Fixtures de 5 specs E2E y 10 tests de integración | **Se revierte lo del rol** y se les añade `companyId` (§6) |

**Cómo se borra lo viejo sin dejar residuo.** No basta con que compile: `memberships` es una
palabra que quedaría en comentarios y en nombres de variables durante años. El criterio de
«hecho» es el de T7 y T21 del `tasks.md`:

```
rg -i 'membership|memberships|pertenencia' lib/ app/ components/ scripts/ db/ tests/ e2e/
```

debe devolver **cero** aciertos fuera de `specs/` y `progress/`, que son historia y no se tocan.
El barrido se repite **después de cada merge de `dev`** — la bitácora vieja documenta que un merge
trajo un quinto fixture roto que ninguna task había previsto.

---

## 1. Modelo de datos

### 1.1 `companies` (tabla nueva)

```prisma
/// @module identity
model Company {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name           String
  nameNormalized String    @map("name_normalized")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(6)

  users User[]

  @@map("companies")
}
```

- **`id` UUID aleatorio generado por la base** (R1), patrón de QC-4: ni correlativo ni derivado del
  nombre, así que conocer un id no permite adivinar otro.
- **`nameNormalized` persistida** y calculada por `normalizeCompanyName` (R3), la misma pieza que ya
  existe en la rama. Se persiste junto a `name` en toda escritura.
- **La unicidad del nombre NO va como `@@unique`** y es deliberado (R4, R5): es un índice
  **funcional** (`lower(...)`) y **parcial** (`WHERE deleted_at IS NULL`), y Prisma no modela
  ninguna de las dos cosas. Vive escrita a mano en `migration.sql` y ese es el único sitio donde
  existe. Mismo patrón que `recipes_name_unique` y `suppliers_name_unique`.
- **`/// @module identity`** (R27, decisión cerrada 16). La empresa cuelga del usuario y el usuario
  es de `identity`; ningún otro módulo la consulta con Prisma, y eso lo hace cumplir
  `tests/guards/guard-arquitectura-modulos.test.ts`.
- `deletedAt` nace y se queda **vacía** (R6): la operación de baja no se construye aquí.

### 1.2 `users` (tabla existente): gana una columna, no pierde ninguna

```prisma
model User {
  …
  roleId    String  @map("role_id") @db.Uuid        // ← SIGUE EXACTAMENTE COMO ESTABA (R13)
  companyId String  @map("company_id") @db.Uuid     // ← LO ÚNICO QUE ENTRA (R9)
  …
  role    Role    @relation(fields: [roleId],    references: [id], onDelete: Restrict, onUpdate: Cascade)
  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@index([roleId],    map: "users_role_id_idx")
  @@index([companyId], map: "users_company_id_idx")
  @@index([documentTypeCode], map: "users_document_type_code_idx")
}
```

- **`roleId` y todo lo que cuelga de ella se restauran a la letra de QC-4** (R13): mismo nombre,
  mismo tipo, `NOT NULL`, `users_role_id_fkey` con `ON DELETE RESTRICT ON UPDATE CASCADE`, y
  `users_role_id_idx`. La migración **no la toca**: como nunca llegó a mergearse el `DROP COLUMN`
  (§3), en la base de `dev` la columna nunca dejó de existir. Lo que hay que deshacer es el
  esquema y el SQL de esta rama, no un cambio ya aplicado en producción.
- **`companyId` va con `@relation` de Prisma**, no como escalar suelto. Se aparta a propósito del
  patrón `products.unit_id` / `recipe_lines.product_id`: aquel existe para impedir que un `include`
  cruce **de módulo**, y aquí `User` y `Company` son los dos de `identity`, así que no hay frontera
  que proteger y la FK la genera Prisma en vez de quedar como drift manual que toda migración
  futura tenga que vigilar a mano.
- **`ON DELETE RESTRICT`** (R11): borrar físicamente una empresa con usuarios —vivos o de baja—
  falla con `23503`. Es la garantía exacta que pide la decisión cerrada 4.
- **`users_company_id_idx` no es redundante** aunque `company_id` sea la columna líder de los tres
  únicos nuevos (§2): esos tres son **parciales** (`WHERE deleted_at IS NULL`) y por tanto no
  sirven para la verificación del `RESTRICT`, que tiene que mirar también a los usuarios dados de
  baja. Postgres tampoco indexa solo el lado hijo de una FK.
- **`roles` y `document_types` no ganan nada** (R15): son catálogos del sistema.

### 1.3 Lo que NO se modela

**No hay `memberships`, ni nada equivalente** (R12). Un usuario tiene una columna de empresa y una
columna de rol, y no existe ninguna fila intermedia. Consecuencia aceptada y escrita: **hoy no hay
forma de que una persona trabaje en dos empresas**, y si algún día se quiere, es ficha propia, es
una migración de datos, y el login tendrá que resolver la ambigüedad que ya está anotada como
pregunta abierta 1 (QC-48).

---

## 2. El punto delicado: los tres índices únicos de QC-4

**Es el riesgo n.º 1 de la ficha.** Los tres índices que dan identidad al usuario son
**funcionales** (`lower(...)`) y **parciales** (`WHERE deleted_at IS NULL`). Prisma **no los
modela**: no están en `db/schema.prisma`, no aparecen en ningún `@@unique`, y viven escritos a mano
en `db/migrations/20260806122638_users_and_roles/migration.sql`. Esta feature tiene que
**borrarlos y recrearlos** con la empresa dentro (R16, R17, R18, R19).

### 2.1 Cómo están hoy (QC-4, líneas 75–77 de su `migration.sql`)

```sql
CREATE UNIQUE INDEX "users_email_unique"    ON "users" (lower("email"))                          WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_username_unique" ON "users" (lower("username"))                       WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_document_unique" ON "users" ("document_type_code", "document_number")  WHERE "deleted_at" IS NULL;
```

### 2.2 Cómo quedan (UP de esta migración)

```sql
DROP INDEX "users_email_unique";
DROP INDEX "users_username_unique";
DROP INDEX "users_document_unique";

CREATE UNIQUE INDEX "users_email_unique"    ON "users" ("company_id", lower("email"))                         WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_username_unique" ON "users" ("company_id", lower("username"))                      WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_document_unique" ON "users" ("company_id", "document_type_code", "document_number") WHERE "deleted_at" IS NULL;
```

### 2.3 Cómo vuelven (DOWN de esta migración)

Los tres `DROP` + los tres `CREATE` **con el texto literal de QC-4**, byte a byte (R25):

```sql
DROP INDEX "users_email_unique";
DROP INDEX "users_username_unique";
DROP INDEX "users_document_unique";

CREATE UNIQUE INDEX "users_email_unique"    ON "users" (lower("email"))                         WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_username_unique" ON "users" (lower("username"))                      WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_document_unique" ON "users" ("document_type_code", "document_number") WHERE "deleted_at" IS NULL;
```

El test que los vigila **no copia** ese texto: lo **lee** de
`db/migrations/20260806122638_users_and_roles/migration.sql` y lo compara con lo que emite el
`down.sql`. Copiarlo sería tener dos verdades que se desincronizan en silencio; es exactamente lo
que hizo bien la primera vuelta y lo único de su suite que se conserva íntegro.

### 2.4 Qué se rompe si alguien los deja como estaban

Tres fallos distintos, ninguno ruidoso:

1. **Sin recrearlos, la decisión cerrada 6 no existe.** La unicidad seguiría siendo global: la
   segunda empresa **no podría** tener su propio `admin` ni su propio `contacto@…`, y el alta
   fallaría con «ya existe un usuario con ese correo» señalando a una fila de otra empresa que
   quien da el alta no puede ver. El esquema Prisma sigue validando, el cliente sigue compilando y
   `pnpm test` sigue verde: **no se entera nadie hasta que hay una segunda empresa**, que es
   precisamente QC-48.
2. **Si se recrean sin `lower(...)`,** la unicidad deja de ser insensible a mayúsculas y
   `Admin@x.com` convive con `admin@x.com`. Es la trampa que el comentario de `model User` ya
   avisa: quien «arregle» el esquema poniendo `@unique` obtiene justo esto.
3. **Si se recrean sin `WHERE deleted_at IS NULL`,** un usuario dado de baja **quema su correo, su
   nombre de usuario y su documento para siempre**, y R19 —y con él QC-4 R22/R23— se pierde sin
   ningún error visible.

Y en el otro sentido: si el `down.sql` recrea los índices **con** `company_id`, el esquema revertido
**no es el anterior** y R25 es falso, pero el rollback termina en verde. Por eso el test compara
contra el texto real de QC-4 y no contra una expectativa escrita a mano.

### 2.5 El caso que hace fallar la reversión (R26)

El UP **no puede** fallar por colisión: viene de un mundo donde las tres claves eran globales, así
que ya son únicas dentro de cualquier partición. El DOWN sí: en cuanto exista una segunda empresa
con su propio `admin`, recrear el índice global choca con `23505`. El `down.sql` empieza con una
**guardia explícita** que cuenta los duplicados globales entre usuarios vivos y aborta con un
mensaje que nombra la ficha y el requisito, para que el error llegue antes que el SQLSTATE de
Postgres. **Fallar antes que perder el dato**, mismo criterio que QC-32 R24.

---

## 3. La migración: se reescribe en su sitio, no se añade una segunda

**Decisión: se reescriben `migration.sql` y `down.sql` de
`db/migrations/20260904180600_companies_and_memberships/`, y la carpeta se renombra a
`db/migrations/20260904180600_companies_and_user_company/`.** No se añade una segunda migración
que deshaga la primera.

**Por qué.** La migración vieja **no está mergeada en ningún sitio**: no está en `dev`, no está en
`main`, y no hay ningún entorno desplegado con ella aplicada. La única base que la tiene es
`QuimiCloude_QC47`, la base propia del worktree, que es desechable. En esas condiciones:

- Una segunda migración dejaría `memberships` **en el historial para siempre**. Cualquiera que lea
  `db/migrations/` dentro de un año tendría que reconstruir mentalmente una tabla que **nunca
  existió en ninguna base real** solo para entender por qué la siguiente la borra.
- El `down.sql` de esa segunda migración tendría que revertir **a un estado que nunca existió**
  (`users` sin `role_id`, con `memberships` viva). Es un DOWN imposible de probar contra nada
  significativo, y `docs/architecture.md > Migraciones up/down` exige que el DOWN revierta
  exactamente el UP.
- El historial de migraciones es la definición de la base. Dos migraciones que se anulan no
  documentan una decisión: documentan un error de proceso, y el sitio de eso es
  `progress/`, que ya lo tiene escrito.

**Lo que cuesta, y se acepta.** Reescribir en su sitio es correcto **solo mientras nadie la haya
aplicado fuera del worktree**, y eso deja de ser cierto en el instante en que la rama se mergea.
Es una ventana, no una regla general. Coste operativo concreto:

1. La base del worktree tiene la migración vieja aplicada y registrada en `_prisma_migrations`.
   Hay que **revertirla con el `down.sql` VIEJO antes de tocar nada** (`pnpm run db:rollback`, que
   además hace el `prisma migrate resolve --rolled-back`), o recrear la base desde cero. Aplicar la
   nueva sobre una base que cree tener la vieja deja el historial mintiendo.
2. Al renombrar la carpeta cambia el nombre que Prisma registra. Es inofensivo **porque ninguna
   base fuera del worktree la conoce**; si el paso 1 no se hace primero, deja una fila huérfana.
3. Tres tests de otras features nombran migraciones por su ruta y hay que revisarlos:
   `tests/unit/proveedores/scope.test.ts` (censo de migraciones que mencionan `suppliers`),
   `tests/unit/recetas-ui/recipe-route-contract.test.ts` (allowlist de `db/`) y
   `tests/unit/inventario/schema/inventario-audit-migration.test.ts`.

**Alternativa descartada (la de verdad, no una de paja): añadir
`20260904…_drop_memberships_and_add_user_company` encima de la vieja.** Es lo que exige el proceso
normal —una migración aplicada es inmutable— y por eso hay que decir en voz alta por qué aquí no.
Se descarta porque su única ventaja, no romper el historial de un entorno que ya la aplicó, **no
aplica**: no hay tal entorno. A cambio pagaría los tres costes de arriba de forma permanente en vez
de una vez. **Si en el momento de implementar resultara que la rama ya se mergeó a `dev`, esta
decisión se invierte** y hay que hacerla aditiva: es la condición que la sostiene, y el `tasks.md`
la comprueba en T0 antes de tocar SQL.

### 3.1 Orden del `migration.sql` (UP)

El orden **no es cosmético**; cada paso depende del anterior:

1. `CREATE EXTENSION IF NOT EXISTS pgcrypto` — idempotente; el DOWN no la elimina (puede haberla
   creado otra migración).
2. `CREATE TABLE "companies"` (§1.1).
3. `CREATE UNIQUE INDEX "companies_name_unique" ON "companies" (lower("name_normalized")) WHERE "deleted_at" IS NULL;`
   — a mano, funcional y parcial (R4, R5). El `lower(...)` es redundante sobre una columna ya
   normalizada y se escribe igual, por simetría con `users_email_unique` y para que la unicidad no
   dependa de que el llamante haya normalizado bien.
4. `ALTER TABLE "users" ADD COLUMN "company_id" UUID;` — **anulable de momento**: todavía no hay
   valor que darle.
5. **Backfill** (§3.2). Va aquí: después de que exista la tabla y antes de endurecer la columna, y
   **antes** de los `ALTER … ROW LEVEL SECURITY` del final (§3.3).
6. `ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL;` (R9).
7. `ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;` (R10, R11).
8. `CREATE INDEX "users_company_id_idx" ON "users"("company_id");` (§1.2).
9. Los tres `DROP INDEX` + los tres `CREATE UNIQUE INDEX` de §2.2. **Después** del `SET NOT NULL`:
   un índice sobre una columna que todavía admite `NULL` trataría cada `NULL` como distinto y la
   partición no significaría nada.
10. `ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;` +
    `ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;` (R24). **Al final del todo.**

**`users` no se toca en el punto 10**: ya tiene RLS activada y forzada desde QC-4 y esta migración
no la altera. Tampoco toca ninguna FK, CHECK ni RLS de `orders`, `products`, `recipe_lines`,
`recipes`, `supplier_catalog_lines` ni `suppliers`: Prisma los desconoce (son escalares sin
`@relation` a propósito) y emite `DROP CONSTRAINT` sobre ellos por drift. **Hay que borrarlos a
mano del SQL generado**, igual que hizo la primera vuelta; el test de esquema lo vigila.

### 3.2 El backfill (R23)

```sql
DO $$
DECLARE
  usuarios BIGINT;
  empresa  UUID;
BEGIN
  SELECT count(*) INTO usuarios FROM "users";
  IF usuarios = 0 THEN RETURN; END IF;

  INSERT INTO "companies" ("name", "name_normalized", "updated_at")
  VALUES ('QuimiCloud', 'quimicloud', CURRENT_TIMESTAMP)
  RETURNING "id" INTO empresa;

  UPDATE "users" SET "company_id" = empresa WHERE "company_id" IS NULL;
END $$;
```

Cuatro cosas que no son evidentes:

- **Si no hay ningún usuario, no se crea ninguna empresa.** La deja el seed (R20). Por eso el
  bloque empieza contando: una empresa vacía creada por una migración es una fila que nadie
  pidió y que el seed tendría que reutilizar por casualidad.
- **Los usuarios dados de baja entran también**, a propósito: `company_id` va a ser `NOT NULL` y un
  `WHERE deleted_at IS NULL` los dejaría fuera y el paso 6 fallaría. La empresa no autoriza por sí
  sola y el login sigue filtrando por `deleted_at IS NULL`.
- **El rol no se toca en ninguna línea.** Esa es toda la diferencia con la primera vuelta, y es
  literalmente R23: `role_id` no aparece en el backfill porque no hay nada que mover. El test de
  esquema comprueba en negativo que el SQL **no menciona** `role_id` fuera de los comentarios.
- **`updated_at` va explícito.** Es `NOT NULL` sin default: su valor lo pone `@updatedAt` del
  cliente Prisma en tiempo de ejecución, no la base, así que un `INSERT` crudo sin él falla. Misma
  nota que QC-4 y QC-32.

**El punto frágil, escrito en voz alta.** `'QuimiCloud'` y `'quimicloud'` van **literales**: no hay
forma de llamar a `INITIAL_COMPANY_NAME` ni a `normalizeCompanyName` (TypeScript,
`lib/modules/identity/domain/`) desde una migración. Es un duplicado que se puede desincronizar en
silencio, y lo único que se da cuenta es el test de esquema, que **importa la constante y la
función reales** y las compara con los literales extraídos de este `INSERT` (R21).

### 3.3 El `down.sql` (R25, R26)

Orden inverso, con la guardia la primera:

1. **Guardia (R26):** cuenta usuarios vivos que compartan, globalmente, `lower(email)`,
   `lower(username)` o la pareja `(document_type_code, document_number)`; si hay alguno, `RAISE
   EXCEPTION` nombrando QC-47 y R26 y la reversión entera queda sin aplicar (Prisma corre cada SQL
   en una transacción).
2. Los tres `DROP INDEX` + los tres `CREATE UNIQUE INDEX` con **el texto literal de QC-4** (§2.3).
3. `DROP INDEX "users_company_id_idx";`
4. `ALTER TABLE "users" DROP CONSTRAINT "users_company_id_fkey";`
5. `ALTER TABLE "users" DROP COLUMN "company_id";`
6. `DROP TABLE "companies";` — se lleva con ella su índice único y su RLS.
7. **`pgcrypto` no se toca:** el UP no la crea en exclusiva y `identity`, `inventario`, `recetas` y
   `unidades` dependen de ella.

**Lo que este archivo NO menciona, y es correcto:** `role_id`, `users_role_id_fkey` y
`users_role_id_idx`. El UP tampoco los tocó (R13). Que el `down.sql` viejo tuviera que recrearlos a
mano era exactamente el síntoma del modelo equivocado.

**Límite conocido de «exacto» (R25).** El `DROP COLUMN` + el `ADD COLUMN` del UP no devuelven la
tabla a su orden ordinal original si alguien vuelve a aplicar el ciclo; aquí no aplica, porque el
DOWN solo **quita** una columna que el UP añadió al final. `users.role_id` mantiene su posición
original en todo momento, que es una consecuencia agradable de no tocarla.

---

## 4. Rutas, endpoints y contratos de entrada/salida

**Ninguno nuevo** (R28). Esta ficha no crea ruta, pantalla, Server Action ni route handler, y no
aporta ningún flujo navegable. Lo que existe se conserva:

| Superficie | Cambio |
| --- | --- |
| `POST` del login (`login-action.ts`) | **Ninguno.** Ni en la entrada ni en la salida |
| Cookie de sesión (`session-token.ts`, `session-claims.ts`) | **Ninguno.** El rol firmado sigue siendo el mismo string y sale del mismo sitio |
| `middleware.ts` / `route-guard-middleware.ts` | **Ninguno** (R14) |
| Contrato público `@/lib/modules/identity` | **Se conserva** `normalizeCompanyName` e `INITIAL_COMPANY_NAME`, ya exportados en la rama |
| `lib/composition/index.ts` | **Ninguno.** El repositorio del seed sale de la misma fábrica |

La empresa **no entra en la sesión** en esta ficha: eso es QC-48 (`requirements.md > Alcance`).

---

## 5. Los consumidores dentro de `identity`

Tres archivos vuelven a leer el rol de `users` y uno gana la empresa.

### 5.1 `user-credentials-prisma.ts` — el login

Vuelve al `JOIN` de QC-9, sin `memberships`:

```sql
SELECT u.id, u.password_hash, u.failed_login_attempts, u.lock_level, u.locked_until,
       r.name AS role_name
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE lower(u.username) = lower($1) AND u.deleted_at IS NULL
LIMIT 1
```

- Sigue con `$queryRaw` parametrizado y **no** con la API tipada + `mode: 'insensitive'`, por la
  razón de siempre: `ILIKE` no usa `users_username_unique` y el login haría un seq scan en la ruta
  más caliente de la app.
- **El índice ahora es `(company_id, lower(username))`, y `company_id` es la columna líder.** Un
  `WHERE lower(username) = …` sin empresa **no puede usarlo como búsqueda por igualdad**: en el
  mejor caso Postgres hace un *index skip/full scan* del índice, no un seek. Sobre una única
  empresa y una tabla de decenas de filas eso es irrelevante y no se optimiza aquí. **Se anota
  porque es exactamente lo que QC-48 tiene que resolver** cuando el login sepa de qué empresa eres:
  el `WHERE` gana `company_id = $2` y el índice vuelve a ser un seek. Es la contrapartida técnica
  de la pregunta abierta 1, y esta ficha la deja escrita en vez de descubrirla luego.
- `INNER JOIN` y no `LEFT`, igual que antes: la garantía «quien entra tiene rol» vuelve a darla el
  `NOT NULL` de `users.role_id`, que es donde estaba.
- Sigue devolviendo id, hash, estado de bloqueo y nombre del rol. Ni correo, ni documento, ni
  teléfono: lo que no sale de la base no se puede filtrar por error en un log.
- **No devuelve la empresa.** Añadirla al `SELECT` sin que nadie la use es construir la mitad de
  QC-48 sin su ficha.

### 5.2 `session-user-prisma.ts` — la sesión

Vuelve al `select` tipado por clave primaria con `role: { select: { name: true } }`, y desaparecen
el `memberships`, el `orderBy` y el `take: 1`, junto con el `return null` por falta de pertenencia.
Una consulta, por PK, con `deletedAt: null` en el `where`.

### 5.3 El seed: `ports/initial-access-repository.ts`, `domain/seed-initial-access.ts`, `adapters/driven/persistence/initial-access-repository-prisma.ts`

El puerto queda así (marcadores personales omitidos por brevedad; se conservan tal cual):

```ts
findRoleIdsByName(names: readonly string[]): Promise<ReadonlyMap<string, string>>;
countLiveUsersWithRole(roleName: string): Promise<number>;
createRole(role: { name: string; description: string }): Promise<string>;
findCompanyIdByNormalizedName(normalized: string): Promise<string | null>;
createCompany(input: { name: string; nameNormalized: string }): Promise<string>;
createInitialAdmin(input: { roleId: string; companyId: string; … }): Promise<{ id: string }>;
```

- **`countLiveUsersWithRole` vuelve a
  `db.user.count({ where: { deletedAt: null, role: { name: roleName } } })`.** Es el punto donde la
  primera vuelta invirtió más esfuerzo (mutó la implementación tres veces para demostrar el
  riesgo); ahora es la consulta trivial que ya existía antes de QC-47, y el riesgo desaparece con
  ella. Lo mismo en el `catch (P2002)` de `createInitialAdmin`.
- **`findCompanyIdByNormalizedName` y `createCompany` se conservan íntegros**, incluida la
  traducción de `P2002` a «relee la empresa viva y devuelve su id sin pisar su `name`». Es lo que
  hace idempotente al seed (R22) y es correcto tal cual está.
- **`createInitialAdmin` pasa de `memberships: { create: { companyId, roleId } }` a `roleId` y
  `companyId` como columnas del propio `user.create`.** Una sola sentencia, dentro del mismo `tx`:
  no hay ningún instante en el que exista una persona sin empresa ni sin rol (R20).
- **La resolución de la empresa se queda dentro del `if (needsAdmin)`** de
  `seedInitialAccess`, tal como está hoy: sobre una instalación que ya tiene administrador el seed
  no toca `companies` ni para leer de más ni para crear una empresa sin nadie dentro (R22).
- **`SeedOutcome.createdCompany` se conserva** — solo alimenta la línea de resumen de
  `scripts/seed.ts`; no es una credencial.

---

## 6. Los fixtures ajenos: coste conocido y declarado

`docs/architecture.md` no lo exige, pero la bitácora de la primera vuelta dejó escrito el aprendizaje
y aquí se aplica: **esta ficha añade una columna obligatoria a `users`, y todo fixture del repo que
siembre un usuario deja de compilar.** No es un efecto colateral que se descubre por el typecheck:
es trabajo con nombre y task propia: **T6** revierte lo del rol y **T19** añade la empresa.

- **Se revierte** todo lo que la primera vuelta quitó: los fixtures vuelven a pasar `roleId` en su
  `user.create`, porque la columna vuelve.
- **Se añade** `companyId` a esos mismos `user.create`, y la creación de la empresa efímera del
  spec en su `beforeAll` (con `normalizeCompanyName`, nunca la de instalación: el índice único de
  `companies` es global y chocaría con la que crea el seed).
- **Se simplifica la limpieza**: el orden de barrido `memberships → users → companies` pasa a
  `users → companies`, porque solo queda una FK `RESTRICT` en medio.
- **Ni un `test(...)`, ni un selector, ni una aserción cambian** (R28). El criterio de «hecho» es
  que el diff de cada spec E2E no contenga coincidencias de `test(`, `expect(`, `getByRole`,
  `getByLabel`, `page.goto` ni `toHaveURL`.

Alcance del barrido, verificado con `rg 'companyId|company_id|memberships|roleId' e2e/ tests/ lib/`:

| Grupo | Archivos |
| --- | --- |
| E2E (5) | `e2e/login.spec.ts`, `e2e/session.spec.ts`, `e2e/inventario.spec.ts`, `e2e/recetas.spec.ts`, `e2e/proveedores.spec.ts` |
| Integración de `identity` (4) | `login`, `session-user`, `identity-seed`, `identity-constraints` |
| Integración de otros módulos (10) | `inventario/product-crud`, `recetas/{recetas-constraints,recipe-crud}`, `pedidos/{order-crud,order-repository,order-sequence,pedidos-constraints}`, `proveedores/{catalog-line,supplier-crud,proveedores-constraints}` |
| Guardias de alcance ajenas retensadas (4) | `identity/credential-policy-contract`, `proveedores/module-contract`, `proveedores/scope`, `recetas-ui/recipe-route-contract` |

Las cuatro guardias de la última fila llevan **congelada una foto del esquema** (censo de campos de
`User`, `relationTargets`, allowlist de `db/`). Hay que **retensarlas a la verdad nueva, sin
relajarlas**: `User` recupera `roleId` y gana `companyId`, y `relationTargets` pasa de
`{ DocumentType, Membership }` a `{ DocumentType, Company, Role }`.

**Tests que se borran, no se adaptan:** todo lo que en
`tests/unit/identity/schema/companies-migration.test.ts` y en
`tests/integration/identity/identity-constraints.int.test.ts` afirma algo **sobre membresías** —la
pareja única `(user_id, company_id)`, las tres FK de `memberships`, «la misma persona en dos
empresas con rol distinto», «un usuario vivo sin pertenencia no entra», el backfill del rol y la
guardia de «exactamente una pertenencia» del DOWN—. Adaptarlos sería conservar la forma del modelo
muerto.

---

## 7. Dependencias de terceros

**Ninguna nueva** (R29, decisión cerrada 17). Es esquema Prisma, SQL escrito a mano y tres
adaptadores que vuelven a su forma anterior. No hay ninguna utilidad escrita a mano que una
librería del ecosistema ya resuelva: la normalización del nombre (`normalizeCompanyName`) ya existe
en el repo desde la primera vuelta y sigue el precedente de `normalizeUnitName` y
`normalizeSupplierName`. Regla 7 de `CLAUDE.md` sin propuesta que abrir, y por tanto **sin los
cuatro checks de `docs/architecture.md > Dependencias de terceros` que rellenar**.

---

## 8. Riesgos

1. **Que alguien deje los tres índices únicos como estaban** (§2.4). Es el riesgo n.º 1 y el más
   silencioso: nada se pone rojo. Mitigación: el test de esquema **lee** el `migration.sql` de QC-4
   y el de esta ficha y compara los seis `CREATE UNIQUE INDEX` uno a uno, en los dos sentidos.
2. **Que `FORCE ROW LEVEL SECURITY` sobre `users` deniegue el `UPDATE` del backfill**
   (`requirements.md > pregunta abierta 3`). QC-4 dejó `users` con RLS forzada y sin policies, y
   `FORCE` alcanza al dueño de la tabla. La única evidencia es que la primera vuelta **leyó**
   `users` desde su migración sin problema; **escribir** no se ha probado nunca. Mitigación:
   **T5 lo comprueba contra Postgres real antes de escribir el backfill definitivo.** Si resulta
   denegado, la salida es acotar el paso con `ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;` /
   `… FORCE …` alrededor del `UPDATE`, dentro de la misma transacción y con el restablecimiento
   **en el mismo archivo**; no se elige a ciegas y no se da por buena sin ejecutarla.
3. **El literal `'QuimiCloud'` duplicado entre el backfill y la constante del dominio** (§3.2).
   Mitigación: el test importa la constante y la función reales y falla si divergen (R21).
4. **Reescribir una migración ya aplicada en la base del worktree** (§3). Mitigación: T0 verifica
   que la rama no está mergeada y T1 revierte con el `down.sql` viejo **antes** de reescribir nada.
5. **Un merge de `dev` puede traer un sexto fixture** que siembre un usuario y que hoy no existe.
   Le pasó a la primera vuelta con `e2e/proveedores.spec.ts`. Mitigación: T21 se repite después de
   cada merge, no una sola vez (§0).

---

## 9. Alternativas descartadas

### 9.1 Añadir una segunda migración en vez de reescribir la vieja

Ver §3, donde está argumentada en detalle con su condición de validez («mientras la rama no esté
mergeada») y su punto de inversión.

### 9.2 Mantener `memberships` con un único parcial que la limite a una empresa por usuario

Se podría conservar la tabla y añadir `CREATE UNIQUE INDEX … ON memberships(user_id)` para forzar
«una sola empresa». **Descartado.** Conservaría toda la maquinaria del modelo de muchos a muchos
—una tabla, tres FK, un `JOIN` en el login, un `select` anidado en la sesión, una escritura
adicional en el seed y un orden de barrido en cada fixture— para expresar algo que una columna
`NOT NULL` dice mejor y que la base garantiza sola. Además el rol seguiría viviendo fuera de
`users`, que es exactamente lo que el humano descartó, o quedaría duplicado en los dos sitios. Y
guarda la trampa peor: el día que alguien borre ese índice único —una línea— el sistema vuelve a
admitir dos empresas por persona **sin que ningún requisito ni ningún test hable de ello**. Un
modelo que solo es correcto por un índice que nadie mira no es un modelo correcto.

### 9.3 Meter la empresa en la clave primaria de `users` (`(company_id, id)` compuesta)

Es el patrón de aislamiento fuerte de algunos ERP multiempresa: la empresa forma parte de la PK y
ninguna FK puede cruzar de empresa por construcción. **Descartado.** Obligaría a cambiar la clave
primaria de `users` y con ella las siete FK que ya la referencian (`recipes.created_by`,
`recipes.updated_by`, `products.created_by`, `products.updated_by`, `suppliers.*`,
`supplier_catalog_lines.*`, `orders.*`), todas escritas a mano y todas drift para Prisma. Es una
migración de una magnitud que no guarda ninguna proporción con lo que esta ficha pide, y ninguna
decisión cerrada la reclama. La frontera de empresa se valida **en el service**
(`docs/architecture.md > Acceso a datos y autorizacion`), no en la forma de la clave.

### 9.4 Dejar el correo y el nombre de usuario únicos globalmente y hacer únicos por empresa solo el documento

Evitaría de golpe la pregunta abierta 1: el login seguiría identificando a alguien con usuario y
contraseña. **Descartado por el humano en la decisión cerrada 6**, que es explícita: los tres pasan
a medirse dentro de la empresa, y «dos empresas pueden tener cada una su `admin`». Se anota aquí
porque es la salida barata que alguien va a proponer al leer la pregunta abierta 1, y la respuesta
es que la pregunta la hereda QC-48, no que se anule la decisión.

### 9.5 Empezar de cero en una rama nueva y abandonar esta

Descartar la rama entera y volver a especificar desde `dev`. **Descartado**, aunque es defendible:
más de la mitad del trabajo de la primera vuelta —`normalizeCompanyName`, `INITIAL_COMPANY_NAME`,
el contrato público, `companies` entera, el `findCompanyIdByNormalizedName` idempotente, y el test
que lee los índices de QC-4 en vez de copiarlos— **es válido tal cual en el modelo nuevo**. Tirarlo
para reescribirlo igual no es limpieza, es repetición. Lo que sí exige es que la vuelta atrás sea
explícita y verificable, y de ahí que §0 y la tanda A de `tasks.md` sean un inventario nombrado
archivo a archivo y un barrido de `rg`, y no un «se limpia lo que sobre».
