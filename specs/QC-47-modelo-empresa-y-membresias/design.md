# QC-47 — modelo-empresa-y-membresias · design.md

> El QUÉ está en `requirements.md`, con el alcance y las 15 decisiones cerradas por el humano. Aquí
> va el CÓMO, y una sola cosa que `requirements.md` deja explícitamente a este archivo: **cerrar la
> pregunta abierta 1**, el módulo propietario de los dos modelos nuevos (sección 1).

## 1. El módulo propietario: `identity` es el dueño de `Company` y de `Membership`

**Decisión (cierra la pregunta abierta 1): los dos modelos nuevos son de `identity`.** No se crea un
módulo `empresas`. `db/schema.prisma` lleva `/// @module identity` encima de `Company` y de
`Membership` (R22).

### 1.1 Por qué

1. **El dominio ya lo dice.** `docs/architecture.md > Dominio` n.º 1, reescrito hoy: «La identidad
   **NO se parte**: usuarios, roles y tipos de documento son del sistema y se comparten […]. Lo que
   une las dos mitades es la **membresía**: a qué empresas pertenece cada usuario, y con qué rol en
   cada una.» La pertenencia está hecha de **dos entidades de `identity`** (usuario y rol) más una
   tercera; el rol de una persona es exactamente lo que `identity` publica hoy en `SessionUser` y
   firma en la cookie. Poner esa fila en otro módulo parte la identidad justo por donde el documento
   dice que no se parte.
2. **La guardia de módulos lo impone en la práctica.**
   `tests/guards/guard-arquitectura-modulos.test.ts`, bloque 10, prohíbe `prisma.<modelo>` en el
   adaptador driven de un módulo que no es el propietario declarado. `identity` **tiene que**
   consultar la pertenencia en dos sitios que ya existen y ya tienen test:
   `initial-access-repository-prisma.ts` (seed) y `user-credentials-prisma.ts` /
   `session-user-prisma.ts` (login). Con la pertenencia en otro módulo, esas lecturas son ilegales y
   hay que rodearlas por un puerto + adaptador ajeno + cableado en `lib/composition`, que es el
   patrón `UnitCatalog`/`ProductCatalog`. Legal, sí — pero rompe dos cosas concretas, abajo.
3. **Rompe el login de una consulta (R16).** `findActiveByUsername` es hoy **un** `$queryRaw` con
   `JOIN roles`, escrito así a propósito para usar el índice funcional parcial
   `users_username_unique` en la ruta más caliente de la app (el comentario del archivo lo explica y
   lo prohíbe explícitamente cambiar). Con la pertenencia en otro módulo, el `JOIN memberships` deja
   de ser legal desde `identity`: o son **dos** consultas (regresión medida en la ruta de login), o
   es un `$queryRaw` que lee la tabla de otro módulo — un cruce de frontera que **ninguna guardia
   detecta**, porque el bloque 10 busca la cadena `prisma.<modelo>`, no SQL crudo. Es exactamente el
   agujero que los comentarios de `schema.prisma` llevan cuatro fichas señalando.
4. **Rompe la atomicidad del seed (R18, QC-6 R13).** El seed corre dentro de
   `withInitialAccessTransaction`, que construye el repositorio sobre un `Prisma.TransactionClient`
   creado **dentro del adaptador driven de `identity`**. Crear la empresa y la pertenencia en esa
   misma transacción exigiría pasarle ese `tx` a un adaptador driven de otro módulo: un import
   driven → driven **de otro módulo**, que la nota de QC-9 en `docs/architecture.md` prohíbe
   expresamente (la excepción es solo entre drivens del mismo módulo). La alternativa es sacar la
   empresa fuera de la transacción, y entonces un fallo al crear el usuario deja una empresa
   huérfana: la garantía que QC-6 declaró innegociable se pierde.
5. **Ahorra tres FK escritas a mano.** Como `User`, `Role`, `Company` y `Membership` son del
   **mismo** módulo, las tres relaciones de `Membership` pueden declararse con `@relation` de Prisma
   sin abrir ningún cruce: `include` desde `identity` hacia `identity` no es una fuga. Con un módulo
   `empresas`, las tres tendrían que ser campos escalares con la FK escrita a mano en SQL —el patrón
   `products.unit_id`— y las tres se convertirían en **drift permanente** que hay que revisar a mano
   en toda migración futura de `memberships`. Menos SQL manual es menos superficie donde
   `prisma migrate dev` pueda borrar algo en silencio.

### 1.2 Qué se descarta, y qué se rompería con ello

**Descartado: un módulo `empresas` propio, replicando lo que QC-32 hizo con `unidades`.** Es la
opción que la pregunta abierta 1 nombra primero y la que más se parece al precedente reciente, así
que merece decirse por qué no. `unidades` funcionó porque la unidad es **puramente anotativa**: nadie
la necesita para autenticar, no participa de ninguna transacción de `identity`, y sus consumidores
(`inventario`, `recetas`, `pedidos`) solo la leen para mostrarla. La pertenencia es lo contrario: es
**el dato que decide el rol con el que alguien entra**. Con `empresas` como dueño, lo que se rompe
es concreto y está listado arriba: (3) el login pasa de una consulta a dos, o se cuela por un
`$queryRaw` que ninguna guardia ve; (4) el seed pierde la transacción única; (5) tres FK más
escritas a mano en drift. Ninguna de esas tres es un coste teórico: las tres tienen hoy un test o un
comentario que las protege.

**Coste que esta decisión impone y se acepta, escrito para que no se descubra después.**
`identity` pasa de tres modelos a cinco, y es el módulo más grande del repo. Si algún día nace una
ficha de **CRUD de empresas** —hoy no existe, y `docs/architecture.md > Dominio` n.º 1 la llama
sobre-ingeniería—, es razonable que `Company` se mude a un módulo propio y que `Membership` se
quede en `identity`. Esa mudanza es barata mientras nadie lea `companies` desde fuera: cambiar el
`/// @module`, mover un adaptador driven y añadir un puerto. Lo que la haría cara es que otro módulo
empiece a leer `companies` por su tabla, y eso ya lo prohíbe R22.

## 2. Modelo de datos

Convención del repo: identificadores de base en **inglés** y `snake_case` vía `@@map`/`@map`, campos
del cliente en `camelCase`, todo texto `TEXT` sin `varchar(n)` (R21).

### 2.1 `Company` → tabla `companies`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `UUID` PK, `DEFAULT gen_random_uuid()` | R1. Aleatorio: ni correlativo ni derivado del nombre |
| `name` | `TEXT NOT NULL` | R2 |
| `name_normalized` | `TEXT NOT NULL` | R3. La calcula el dominio y se persiste en toda escritura |
| `created_at` | `TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP` | R6 |
| `updated_at` | `TIMESTAMPTZ(6) NOT NULL` (`@updatedAt`) | R6 |
| `deleted_at` | `TIMESTAMPTZ(6)` nullable | R5. Nace con la tabla; nadie la escribe en esta ficha |

Índice: `companies_name_unique` — **único, funcional sobre `name_normalized`, PARCIAL**
(`WHERE deleted_at IS NULL`), **escrito a mano** en `migration.sql`. Prisma no modela índices
parciales, así que **no** va como `@@unique` en el esquema, igual que `recipes_name_unique` y
`suppliers_name_unique`; el modelo lleva un comentario `///` diciéndolo, con el mismo tono que los
de `Recipe` y `Supplier`, para que nadie «arregle» el esquema añadiendo el `@@unique` y convierta la
unicidad en total sin darse cuenta. Motivo del parcial: pregunta abierta 5 de `requirements.md`.

Es la **única** garantía de R4: no hay `SELECT` previo por igualdad —sería una carrera— y el
choque se traduce del SQLSTATE `23505`, mismo criterio que `Presentation`, `Unit` y `Supplier`.

**Sin `@@unique` sobre `name` a secas** y sin `CHECK` de longitud mínima: los bordes de aplicación
son de la ficha de CRUD que hoy no existe, mismo criterio que QC-14, QC-24, QC-32 y QC-42.

### 2.2 `Membership` → tabla `memberships`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `UUID` PK, `DEFAULT gen_random_uuid()` | |
| `user_id` | `UUID NOT NULL` | R7 |
| `company_id` | `UUID NOT NULL` | R7 |
| `role_id` | `UUID NOT NULL` | R7. Es el rol **en esa empresa** (R8) |
| `created_at` | `TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP` | R6 |
| `updated_at` | `TIMESTAMPTZ(6) NOT NULL` (`@updatedAt`) | R6 |

**Sin `deleted_at`** (R12), y es deliberado: esta ficha no construye ninguna revocación, y una
columna que ningún código escribe es deuda. Mismo criterio explícito que `Role`, `Presentation`,
`Unit` y `RecipeLine`.

Restricciones e índices:

- `memberships_user_id_company_id_key`: **único** sobre `(user_id, company_id)` (R9). **Total, no
  parcial**: `memberships` no tiene borrado lógico, así que no hay filas muertas que liberen la
  pareja. Va como `@@unique` en el esquema —Prisma sí modela este— y por tanto lo genera Prisma.
- `memberships_user_id_fkey` → `users(id)` `ON DELETE RESTRICT ON UPDATE CASCADE` (R10, R11).
- `memberships_company_id_fkey` → `companies(id)` `ON DELETE RESTRICT ON UPDATE CASCADE`.
- `memberships_role_id_fkey` → `roles(id)` `ON DELETE RESTRICT ON UPDATE CASCADE`.
- `memberships_company_id_idx`, `memberships_role_id_idx`: Postgres no indexa el lado hijo de una FK
  y por ahí pasa la verificación del `RESTRICT`. **No** se crea `memberships_user_id_idx`: el único
  compuesto ya tiene `user_id` como columna líder y sirve para las búsquedas por usuario, que son
  las del login.

**Las tres relaciones van con `@relation` de Prisma**, con sus campos de vuelta
(`memberships Membership[]`) en `User`, `Role` y `Company`. Esto **se aparta a propósito** del patrón
`products.unit_id` / `recipe_lines.product_id`, y la razón es la de la sección 1.1 punto 5: aquel
patrón existe para impedir que Prisma **cruce de módulo** con un `include`; aquí los cuatro modelos
son de `identity`, así que no hay frontera que proteger, y las tres FK las genera Prisma en vez de
quedar como drift manual. `RESTRICT` y nunca `CASCADE`: borrar un rol o una empresa no debe
llevarse por delante pertenencias en silencio.

### 2.3 `User` → lo que pierde

Desaparecen del modelo y de la tabla: el campo `roleId` / columna `role_id`, la relación `role`, la
FK `users_role_id_fkey` y el índice `users_role_id_idx` (R14). Gana el campo de vuelta
`memberships Membership[]`.

**No se toca nada más de `users`** (R27): los tres índices únicos **funcionales y parciales** de
QC-4 (`users_email_unique`, `users_username_unique`, `users_document_unique`) siguen escritos a mano
en la migración de QC-4 y esta feature **no los menciona**. Ver la advertencia de la sección 4.4:
el generador de Prisma **va a intentar borrarlos**, y hay que quitarle esas líneas a mano.

## 3. Normalización del nombre de empresa

Función pura `normalizeCompanyName` en `lib/modules/identity/domain/company-name.ts`, publicada por
`lib/modules/identity/index.ts` (R3). Misma forma y mismo comportamiento que `normalizeUnitName`
(`lib/modules/unidades/domain/unit-name.ts`): quita acentos, quita caracteres especiales, pasa a
minúscula. **No se copia el cuerpo**: se escribe una función propia del módulo, porque `identity` no
puede importar la de `unidades` sin declarar una dependencia entre módulos que no tiene ninguna otra
razón de existir, y porque `unidades` no publica hoy esa función como parte de su contrato de
identidad de empresa. Es una duplicación consciente y acotada; lo alternativo —promoverla a
`lib/shared/`— se descarta porque el dominio no puede importar `lib/shared/**`
(`guard-arquitectura-modulos`, bloque 4).

## 4. La migración: `<ts>_companies_and_memberships`

Se genera con `pnpm run db:migrate:create` y se **completa a mano**, igual que QC-4, QC-14, QC-24 y
QC-32. Todo el `migration.sql` corre dentro de **una** transacción (Prisma lo garantiza), así que
cualquier `RAISE EXCEPTION` deja la migración sin aplicar y sin marcar.

### 4.1 Orden del UP, y por qué ese orden

1. `CREATE EXTENSION IF NOT EXISTS pgcrypto;` — autocontenida, como todas. El `down.sql` **no** la
   elimina: puede haberla creado otra migración.
2. `CREATE TABLE "companies"` (sección 2.1).
3. `CREATE UNIQUE INDEX "companies_name_unique" ON "companies" (lower("name_normalized")) WHERE "deleted_at" IS NULL;`
   — **a mano**. (`lower()` es redundante sobre una columna ya normalizada y se escribe igual, por
   simetría con `users_email_unique` y para que la unicidad no dependa de que el llamante haya
   normalizado bien.)
4. `CREATE TABLE "memberships"` con su `@@unique` y sus tres FK (sección 2.2). Lo genera Prisma
   entero.
5. `CREATE INDEX` de `company_id` y `role_id`.
6. **Backfill, en dos pasos y con su guardia** (sección 4.2). Va **aquí**, después de crear todo lo
   nuevo y **antes** del `DROP COLUMN`, porque lee `users.role_id`.
7. `ALTER TABLE "users" DROP COLUMN "role_id";` — **al final**, cuando el dato ya está a salvo en
   `memberships`. Postgres se lleva con la columna su FK `users_role_id_fkey` y su índice
   `users_role_id_idx`; el `down.sql` los recrea a mano porque **no vuelven solos** con el
   `ADD COLUMN` (misma trampa que QC-52 documentó con los `CHECK` de `products`).
8. RLS **al final del todo** (R23):
   ```sql
   ALTER TABLE "companies"   ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "companies"   FORCE  ROW LEVEL SECURITY;
   ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "memberships" FORCE  ROW LEVEL SECURITY;
   ```
   **El sitio no es cosmético**, y es la lección que QC-32 dejó escrita en su `design.md > 6.1` y
   vigila con un test: `FORCE ROW LEVEL SECURITY` sin policies deniega **también** al dueño de la
   tabla, así que cualquier `INSERT` colocado después no insertaría nada. El backfill del paso 6 va
   antes. Sin policies, a propósito: deny-by-default para toda vía que no sea Prisma; es defensa en
   profundidad y **no** la frontera de autorización, que vive en el service
   (`docs/architecture.md > Acceso a datos y autorizacion`).

### 4.2 El backfill: cómo se mueve `role_id` sin perder el rol de nadie

El problema: `memberships.company_id` es `NOT NULL`, así que para meter a los usuarios ya cargados
hace falta una empresa, y esa empresa hay que crearla aquí. Dos casos, resueltos con **un solo**
bloque:

```sql
-- 6a. Si hay al menos un usuario (vivo o de baja: todos tienen role_id NOT NULL y todos
--     conservan su rol), se crea LA empresa inicial y se mete a todos dentro con su rol.
--     Si no hay ninguno, no se crea ninguna empresa: la deja el seed (R18).
DO $$
DECLARE
  usuarios BIGINT;
  empresa  UUID;
BEGIN
  SELECT count(*) INTO usuarios FROM "users";
  IF usuarios = 0 THEN RETURN; END IF;

  INSERT INTO "companies" ("name", "name_normalized", "updated_at")
  VALUES ('<literal de 6.1>', '<literal normalizado de 6.1>', CURRENT_TIMESTAMP)
  RETURNING "id" INTO empresa;

  INSERT INTO "memberships" ("user_id", "company_id", "role_id", "updated_at")
  SELECT u."id", empresa, u."role_id", CURRENT_TIMESTAMP FROM "users" u;
END $$;
```

- **Ni un rol se pierde** (R24): la pertenencia se crea con el `role_id` literal de la fila, no con
  un rol calculado ni con un default. `users.role_id` es `NOT NULL` con FK `RESTRICT`, así que
  ningún usuario puede quedar sin rol resoluble.
- **Los usuarios dados de baja también entran.** Un `WHERE deleted_at IS NULL` los dejaría sin
  pertenencia, y entonces el `down.sql` no podría devolverles su `role_id` —que es `NOT NULL`— y
  R25 sería imposible de cumplir. Se aceptan pertenencias de usuarios muertos: la pertenencia no
  autoriza por sí sola y el login ya filtra por `deleted_at IS NULL`.
- **`updated_at` va explícito** en los dos `INSERT`: es `NOT NULL` sin `DEFAULT` porque su valor lo
  pone `@updatedAt` del cliente Prisma, no la base, así que un `INSERT` crudo sin él falla. Misma
  nota que QC-4 y QC-32.
- **No hace falta guardia de datos previa** del tipo de QC-32 R22: aquí no hay ningún dato que se
  pueda perder en el UP. Lo que hay es su simétrica en el DOWN (sección 4.3).
- **`name_normalized` va literal** en el SQL, y es el punto frágil de la ficha: no hay forma de
  llamar a `normalizeCompanyName` (TypeScript) desde una migración. Es un duplicado que se puede
  desincronizar en silencio, y lo único que se da cuenta es el test de esquema descrito en la
  sección 8 — copiado del `unidades-migration.test.ts` de QC-32, que importa la función real y la
  aplica a los literales extraídos del `INSERT` (R20).

### 4.3 El `down.sql`: devuelve `role_id` a `users` y deja el esquema exacto

```sql
-- 1. GUARDIA: fallar antes que perder o inventar un rol (R26).
DO $$
DECLARE
  malos BIGINT;
BEGIN
  SELECT count(*) INTO malos FROM (
    SELECT u."id"
    FROM "users" u
    LEFT JOIN "memberships" m ON m."user_id" = u."id"
    GROUP BY u."id"
    HAVING count(m."id") <> 1
  ) AS ambiguos;
  IF malos > 0 THEN
    RAISE EXCEPTION
      'QC-47: % usuario(s) tienen un numero de pertenencias distinto de 1. La reversion se detiene: el rol de vuelta seria ambiguo o inexistente (requirements.md R26).',
      malos;
  END IF;
END $$;

-- 2. La columna vuelve, primero ANULABLE: no hay valor que darle todavía.
ALTER TABLE "users" ADD COLUMN "role_id" UUID;

-- 3. Se rellena desde la pertenencia. El paso 1 garantiza que hay exactamente una por usuario.
UPDATE "users" u SET "role_id" = m."role_id" FROM "memberships" m WHERE m."user_id" = u."id";

-- 4. Y solo entonces se endurece a NOT NULL, como la dejó QC-4.
ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;

-- 5. La FK y el índice NO vuelven solos con el ADD COLUMN: se recrean a mano, literalmente
--    como los escribió db/migrations/20260806122638_users_and_roles/migration.sql.
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- 6. Y se van las dos tablas nuevas, en orden inverso a la FK. El DROP TABLE se lleva sus
--    índices, sus FK y su RLS. pgcrypto NO se elimina.
DROP TABLE "memberships";
DROP TABLE "companies";
```

El paso 1 es la simétrica exacta de R24: **fallar antes que perder el dato**, igual que QC-32 R24. Se
dispara en dos situaciones reales: un usuario con dos pertenencias (el modelo lo permite desde el
día uno, R8) y un usuario sin ninguna (una fila metida a mano). En las dos, `role_id` de vuelta sería
inventado.

Este `down.sql` **no menciona** `users_email_unique`, `users_username_unique` ni
`users_document_unique`, porque el UP tampoco los tocó (R27).

### 4.4 Advertencia de drift, para quien genere el SQL

`prisma migrate dev --create-only` compara el esquema con la base y **va a emitir `DROP` de todo lo
que Prisma no conoce**: los tres índices únicos funcionales de `users`, las FK escritas a mano de
`products`, `recipes`, `recipe_lines`, `suppliers`, `supplier_catalog_lines` y `orders`, sus `CHECK`
y sus `ALTER ... ROW LEVEL SECURITY`. Todas esas líneas **se borran a mano** del `migration.sql`
antes de aplicarlo, exactamente como hizo QC-32 (su nota 6). Si se cuelan, el esquema sigue
validando, el cliente sigue compilando y **no se entera nadie**: es el modo de fallo más caro del
repo. El test de esquema de la sección 8 comprueba que el `migration.sql` de esta feature no
contiene ningún `DROP` sobre esos nombres.

## 5. Qué cambia en `lib/modules/identity/**` — la parte con riesgo de regresión

Tres consumidores leen hoy `users.role_id`. Los tres cambian de fuente y **ninguno cambia de
resultado observable** (R16, decisión cerrada 6).

### 5.1 Login, consulta de credenciales — `adapters/driven/persistence/user-credentials-prisma.ts`

Sigue siendo **un solo** `$queryRaw` parametrizado, sigue apoyándose en `users_username_unique` y
sigue devolviendo el mismo `AuthenticatableUser` con su `roleName`. Solo cambia el `JOIN`:

```sql
SELECT u.id, u.password_hash, u.failed_login_attempts, u.lock_level, u.locked_until,
       r.name AS role_name
FROM users u
JOIN memberships m ON m.user_id = u.id
JOIN roles r       ON r.id = m.role_id
WHERE lower(u.username) = lower(${username}) AND u.deleted_at IS NULL
ORDER BY m.created_at, m.company_id
LIMIT 1
```

- **`INNER JOIN` y no `LEFT`**, igual que antes y por la misma razón escrita en el archivo: si una
  persona no tiene pertenencia, **no se la encuentra** y no entra, en vez de emitirse una sesión con
  un rol inventado. Eso es literalmente R17, y el comentario del archivo se actualiza para decir que
  ahora la garantía la da la existencia de la pertenencia y no el `NOT NULL` de `role_id`.
- **El `ORDER BY` no decide nada de negocio.** Hoy no puede haber más de una pertenencia por
  persona: el seed crea una y no hay ninguna otra vía de alta. Está para que el día que la haya el
  resultado sea **reproducible** en vez de arbitrario, no para elegir empresa: quién elige es
  **QC-48** (pregunta abierta 2 de `requirements.md`), y esta línea no la prejuzga.
- **Sigue costando una lectura** (R16). El plan usa `users_username_unique` para llegar a la fila y
  `memberships_user_id_company_id_key` para la pertenencia.

### 5.2 Sesión, lectura del usuario — `adapters/driven/persistence/session-user-prisma.ts`

Hoy hace `select: { …, role: { select: { name: true } } }`. Pasa a
`memberships: { select: { role: { select: { name: true } } }, orderBy: [...], take: 1 }`, y
`roleName` sale de ahí. Si el array viene vacío, devuelve `null` — mismo criterio que 5.1 y misma
consecuencia: sin pertenencia no hay sesión (R17). Sigue siendo **una** consulta por clave primaria
con `select` explícito y mínimo (nada de correo, teléfono, documento ni `password_hash`).

### 5.3 Seed — `domain/seed-initial-access.ts`, `ports/initial-access-repository.ts`,
`adapters/driven/persistence/initial-access-repository-prisma.ts`, `lib/composition/index.ts`

El algoritmo del dominio sigue siendo «leo qué falta y creo exactamente eso», sin `upsert` y sin
reescritura. Cambios:

- El puerto `InitialAccessRepository` gana `findCompanyIdByNormalizedName(normalized): Promise<string | null>`
  y `createCompany({ name, nameNormalized }): Promise<string>`; `createInitialAdmin` **pierde**
  `roleId` de su entrada y gana un método hermano `createMembership({ userId, companyId, roleId })`,
  o bien —preferido, y menos superficie— `createInitialAdmin` recibe `{ …, companyId, roleId }` y
  crea usuario **y** pertenencia en la misma llamada, que es lo que hace atómica la pareja dentro de
  la transacción que ya existe. El `tasks.md` fija la segunda forma.
- `countLiveUsersWithRole(roleName)` deja de contar por `user.role.name` y pasa a contar por
  `user.memberships.some({ role: { name } })`, con `deletedAt: null`. Es la lectura que decide
  `needsAdmin`, así que su semántica tiene que quedar **idéntica**: «hay alguna persona viva que sea
  Administrador **en alguna** empresa». Es el punto exacto donde una regresión rompería R19
  (idempotencia) creando un segundo admin en cada corrida.
- El nombre de la empresa inicial vive en **una sola constante** del dominio (sección 6.1, R20) y el
  seed la resuelve por nombre normalizado antes de crearla: si ya existe, la reutiliza; si no, la
  crea. Eso es lo que hace R19 cierto para la empresa.
- `lib/composition/index.ts`: el cableado de `seedInitialAccess` no cambia de forma —sigue siendo
  `withInitialAccessTransaction(...)`—; solo se le suman los métodos nuevos del repositorio, que
  vienen de la misma fábrica y por tanto del mismo `tx` (R18, atomicidad).
- `scripts/seed.ts` es una cáscara fina y **su lógica no cambia**. Sí puede cambiar la línea de
  resumen por consola para mencionar la empresa; sin secretos, como hoy.

### 5.4 Lo que NO cambia

`login-action.ts`, `logout-action.ts`, `route-guard-middleware.ts`, `session-cookie.ts`,
`session-token.ts`, `session-claims.ts`, `route-access.ts` y el contrato `index.ts` en todo lo
relativo a la sesión: el rol que se firma es el mismo, con el mismo nombre y el mismo formato de
cookie. Esa es la razón por la que **no hay E2E nuevo** y por la que el E2E de login de QC-7 es la
prueba (decisión cerrada 14, R28).

## 6. Datos de instalación

### 6.1 Nombre de la empresa inicial

Es la **pregunta abierta 4** de `requirements.md`, y la posición por defecto que se implementa si el
humano no dice otra cosa al aprobar el spec:

- literal propuesto: **`Empresa Inicial`**, en `lib/modules/identity/domain/companies.ts`, como
  `export const INITIAL_COMPANY_NAME = 'Empresa Inicial'`;
- normalizado esperado: `empresa inicial`;
- criterio: marcador de instalación reconocible a simple vista, mismo espíritu que
  `INITIAL_ADMIN_FIRST_NAMES = 'Administrador'` / `'Inicial'` de QC-6. **No** sale del entorno: no es
  un secreto, y `.env` no es donde vive un dato de negocio.

Ese archivo es el **único** sitio del repo que escribe ese literal en TypeScript, igual que
`roles.ts` es el único que escribe `'Administrador'`. En SQL aparece una segunda vez, en el backfill
de la migración, y el test de la sección 8 es lo que impide que las dos copias diverjan.

### 6.2 Rutas, endpoints y contratos de I/O

**Ninguno nuevo.** Esta feature no añade rutas de `app/`, ni route handlers, ni Server Actions, ni
componentes, ni contratos de entrada/salida hacia el borde (R28). El contrato público de `identity`
gana exactamente dos símbolos: `normalizeCompanyName` y `INITIAL_COMPANY_NAME`.

**Integraciones externas:** ninguna.

## 7. Dependencias de terceros

**Ninguna nueva** (decisión cerrada 15, R29). No hay nada que proponer, así que no hay cuatro checks
que anotar ni fila nueva en `docs/dependencias.md`
(`docs/architecture.md > Dependencias de terceros`). Lo que la feature necesita —normalización de
texto, UUID, transacción— ya está resuelto en el repo: `normalizeUnitName` es el precedente de la
primera, `gen_random_uuid()` de pgcrypto de la segunda y `prisma.$transaction` de la tercera.

## 8. Verificación (el mapa `R<n> -> test` lo cierra el implementer)

Dónde vive cada tipo de comprobación, siguiendo `docs/verification.md` y los precedentes:

| Tipo | Archivo | Qué cubre |
| --- | --- | --- |
| Unit, esquema | `tests/unit/identity/schema/identity-schema.test.ts` (existente, se amplía) | `/// @module identity` en los dos modelos, ausencia de `roleId` en `User`, forma de `Membership` y `Company` |
| Unit, migración | `tests/unit/identity/schema/companies-migration.test.ts` (nuevo) | orden del UP (backfill antes del `FORCE RLS`), RLS en las dos tablas, el `down.sql` recrea FK e índice de `role_id`, el literal de empresa del SQL coincide con `INITIAL_COMPANY_NAME` y su normalización con `normalizeCompanyName`, y el `migration.sql` no contiene `DROP` sobre los índices de QC-4 |
| Unit, dominio | `tests/unit/identity/company-name.test.ts` (nuevo) | `normalizeCompanyName` |
| Unit, dominio | `tests/unit/identity/seed-initial-access.test.ts` (existente, se amplía) | R18, R19 con dobles del puerto |
| Integración | `tests/integration/identity/identity-constraints.int.test.ts` (existente, se amplía) | R4, R9, R10, R11 contra Postgres real, dentro de transacción con `ROLLBACK` |
| Integración | `tests/integration/identity/identity-seed.int.test.ts` (existente, se amplía) | R18, R19 de verdad contra la base |
| Guardia | `tests/guards/guard-arquitectura-modulos.test.ts` (existente, sin cambios) | R22: al declarar `@module identity` la guardia ya vigila que nadie más haga `prisma.company` / `prisma.membership` |
| E2E | `e2e/login.spec.ts` (existente, **sin tocar el guion**) | R16, R28: la prueba de que nada se rompió hacia fuera |

**El login tiene que tener test de la resolución del rol por pertenencia**, no solo el E2E: un
unitario del adaptador que compruebe que la consulta devuelve `roleName` desde la pertenencia y
`null` cuando no hay ninguna (R17).

## 9. Riesgos conocidos

1. **La regresión silenciosa está en `countLiveUsersWithRole`** (5.3). Si se traduce mal, el seed
   deja de ser idempotente y crea un segundo administrador en cada despliegue. Tiene test unitario y
   de integración, y es la primera cosa que el reviewer debe mirar.
2. **El literal duplicado del nombre de empresa** (4.2, 6.1). Mismo riesgo que QC-32 asumió con
   `name_normalized`, con la misma mitigación: un test que importa la función real.
3. **El drift del generador** (4.4). Si alguien aplica el `migration.sql` tal cual sale de Prisma,
   se lleva por delante los tres índices únicos de `users`, y la unicidad de correo y de nombre de
   usuario deja de existir **en verde**.
