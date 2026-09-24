# QC-161 — rol-maestro · design.md

> El QUÉ está en `requirements.md` (R1–R35) y el alcance lo cerró el humano antes del spec
> (D1–D12). Aquí va el CÓMO: **un** rol más, **dos** permisos más, **una** migración con su
> `down.sql`, el seed que crea al primer Maestro y, lo que más pesa, **la sesión sin empresa**:
> hoy todo el camino del login da por hecho que cada persona tiene empresa y un Maestro sin ella
> no podría entrar.
>
> Precedentes que se siguen en lugar de reinventarse: **QC-144** (rol Empacador: migración que
> inserta rol, permiso y asignaciones, guardias y tests que se ponen rojos), **QC-6** (el seed que
> lee qué falta y crea solo eso, credenciales desde el entorno), **QC-48** (la empresa en la
> sesión y sus cortes), **QC-94 + fix del PR #106** (el catálogo asignable excluye al
> Administrador en dos capas) y los disparadores de empresa de **QC-49/QC-92**
> (`inventory_movements_check_company`).

---

## 0. Hallazgos al medir el código (sobre `origin/dev` del 2026-09-24)

1. **El catálogo ya tiene 18 permisos, no 16.** QC-153 (`clientes.consultar`,
   `clientes.modificar`) entró después de QC-144. La última enmienda escrita en el JSDoc de
   `lib/modules/identity/domain/permissions.ts` es la **quinta**; esta sería la **sexta** si entrara
   hoy, pero el ordinal y el recuento se escriben al implementar contra `dev` (D3).
2. **Hoy el Administrador tiene el catálogo entero.** `tests/unit/identity/permissions.test.ts:234-236,
   313-316, 318-322` lo afirman con `toEqual(CODIGOS_DEL_REQUISITO)`. Con D4 («Administrador sin
   cambios») esa igualdad deja de ser cierta: el Administrador tiene todo **menos** `empresas.*`. Esos
   tres casos se reescriben (§10.1).
3. **El seed es genérico para roles y permisos, no para usuarios.** Recorre `SEED_ROLES` y
   `SEED_ROLE_PERMISSIONS` sin nombrar ninguno (`seed-initial-access.ts:99-124`), así que el rol y sus
   dos asignaciones salen solos. El **usuario** inicial, en cambio, está escrito para el
   Administrador (`:69-175`) y siempre con empresa (`createInitialAdmin` exige `companyId: string`,
   `ports/initial-access-repository.ts:90-103`).
4. **El seed corre en cada despliegue.** `package.json:7` es
   `prisma migrate deploy && tsx scripts/seed.ts && next build`. El primer despliegue tras el merge
   no encontrará ningún Maestro y exigirá sus variables; sin ellas el `build` falla (pregunta abierta 1).
   Lo mismo en local: la plantilla de integración corre `db:seed` (`tests/helpers/test-database.ts:568-572`)
   y su huella incluye `seed-initial-access.ts` (`:180-186`), así que se reconstruye con esta rama.
5. **`users.company_id` es `NOT NULL` en la base y en Prisma** (`db/schema.prisma:105`,
   `company Company` en `:131`). Lo vigilan `tests/unit/identity/schema/identity-schema.test.ts:552-555`
   (`isOptional` falso) y `tests/integration/identity/identity-constraints.int.test.ts:1194-1211`
   (insertar sin empresa da `23502`).
6. **La unicidad de QC-47 no cubre filas sin empresa.** Los tres índices
   (`20260904180600_companies_and_user_company/migration.sql:171-173`) llevan `company_id` delante, y
   dos `NULL` no chocan en un índice único de Postgres (R28, pregunta abierta 3).
7. **El login busca el usuario sin mirar la empresa y con `JOIN companies`**
   (`user-credentials-prisma.ts:77-87`): `INNER JOIN companies c ON c.id = u.company_id`. Con la
   empresa vacía el Maestro **no se encontraría** y el login respondería «credenciales incorrectas».
   Además la búsqueda es `LIMIT 1` sin empresa, así que un nombre de usuario repetido entre empresas
   ya hoy es ambiguo (pregunta abierta 4, deuda previa que esta ficha no crea).
8. **La sesión exige empresa en cuatro sitios**:
   - `domain/session.ts:29,64-70` — `SessionTicket.companyId: string`.
   - `domain/session-claims.ts:34` — `cid: z.string().uuid()`; `tests/unit/identity/session-claims.test.ts:87`
     afirma que `cid: null` invalida la sesión.
   - `adapters/driven/persistence/session-user-prisma.ts:86-87,108-110` — `company.deletedAt` sin
     opcional.
   - `domain/resolve-session.ts:162-170` — el `SessionContext` sale siempre, con `companyId: string`.
   El middleware (`route-guard-middleware.ts:102-107`) solo usa `parseSessionClaims` y
   `isSessionExpired`: cambia con el esquema, sin tocar su código.
9. **El actor sin empresa ya falla cerrado.** Las nueve copias de `currentActor()` en los adaptadores
   driving (p. ej. `unidades/adapters/driving/unit-actions.ts:66-78`,
   `identity/adapters/driving/session-actions.ts:79-96`) devuelven `null` si `getSessionContext()` es
   `null`, y con actor `null` el caso de uso rechaza en su primera línea. **Basta con que la sesión
   del Maestro no tenga contexto de empresa** para que R29 se cumpla sin tocar ningún módulo de
   negocio.
10. **El selector ya excluye un rol, en dos capas.** `role-catalog-prisma.ts:41`
    (`name: { not: ROLE_ADMINISTRADOR }`) y `user-admin-prisma.ts:295-299` (alta) y `:680-689`
    (edición) responden `'action_not_allowed'` si el `roleId` es el del Administrador. El Maestro se
    añade a las mismas dos capas. **Enmienda a D10, dicha tal cual:** la tabla dice «todo rol
    aparecía en el selector», pero desde el fix del 2026-09-22 el Administrador ya no aparece. No
    cambia nada de lo decidido: el Maestro tampoco aparecerá.
11. **Un Administrador no puede alcanzar al Maestro.** Lista, edición, baja y estado de cuenta
    filtran por `companyId` del actor (`user-admin-prisma.ts:808`, `updateAliveInCompany`); con la
    empresa del Maestro vacía, ningún filtro por empresa lo encuentra. R1 es un test, no código.
12. **El aterrizaje ya es por permiso.** `login-action.ts:122-128` aterriza en el primer enlace del
    menú filtrado o, si no queda ninguno, en `DASHBOARD_ROUTE`, que responde el 404 dentro del layout
    privado (QC-93 R14–R17). El layout (`app/(private)/layout.tsx:59-75`) solo usa `getSessionUser()`.
    R33 y R34 no necesitan código; QC-166 solo tendrá que añadir un enlace protegido por
    `empresas.consultar`.
13. **Nadie ramifica por el nombre del Maestro**, porque todavía no existe. La guardia
    `tests/guards/guard-autorizacion-por-permiso.test.ts:182-190` deriva sus patrones de las
    constantes importadas: se amplía con `ROLE_MAESTRO`.

---

## 1. Qué cambia (resumen)

| Archivo | Cambio | Requisitos |
|---|---|---|
| `lib/modules/identity/domain/roles.ts` | `ROLE_MAESTRO = 'Maestro'` y su fila **al final** de `SEED_ROLES`; la cabecera pasa de «tres literales» a «cuatro» | R2, R3, R4 |
| `lib/modules/identity/index.ts` | reexporta `ROLE_MAESTRO` | R3 |
| `lib/modules/identity/domain/permissions.ts` | dos entradas al final de `PERMISSIONS`, párrafo de enmienda, frase del recuento, clave `[ROLE_MAESTRO]` en `SEED_ROLE_PERMISSIONS`, una frase en su JSDoc | R5–R9 |
| `lib/modules/identity/domain/seed-initial-access.ts` | decide y crea el Maestro inicial (§5) | R10–R15 |
| `lib/modules/identity/domain/account-status.ts` | solo si hace falta una constante hermana de `SEED_ADMIN_ACCOUNT_STATUS` (§5.2) | R10 |
| `lib/modules/identity/ports/initial-access-repository.ts` | método `createInitialMaestro` sin empresa | R10, R15 |
| `lib/modules/identity/ports/initial-access-credentials.ts` | proveedor de credenciales del Maestro | R10–R12 |
| `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts` | implementa `createInitialMaestro` | R10 |
| `lib/modules/identity/adapters/driven/config/initial-access-credentials-env.ts` | segunda función con sus tres nombres de variable | R10–R12 |
| `lib/composition/index.ts` | cablea el proveedor del Maestro en `seedInitialAccess` | R10 |
| `scripts/seed.ts` | la línea de resumen dice si creó el Maestro | R10, R11 |
| `.env.example` | las tres variables del Maestro, sin valor | R14 |
| `db/schema.prisma` | `User.companyId String?`, `company Company?`, comentario del porqué | R26, R27 |
| `db/migrations/<ts>_platform_maestro_role/migration.sql` + `down.sql` | §4 | R20–R22, R26–R28 |
| `lib/modules/identity/domain/session.ts` | `SessionTicket.companyId: string \| null` | R30 |
| `lib/modules/identity/domain/session-claims.ts` | `cid` admite `null` explícito | R31, R32 |
| `lib/modules/identity/adapters/driven/session/session-token.ts` | tipo del payload `cid: string \| null` (sin subir versión) | R30, R31 |
| `lib/modules/identity/ports/user-credentials-reader.ts` | `AuthenticatableUser.companyId: string \| null` | R30 |
| `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts` | `LEFT JOIN companies`, fila con `company_id` anulable | R30 |
| `lib/modules/identity/ports/session-user-reader.ts` | `SessionUserRecord.companyId: string \| null` | R31 |
| `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts` | `company?.deletedAt ?? null` | R31 |
| `lib/modules/identity/domain/resolve-session.ts` | `context: null` cuando la ficha no tiene empresa | R29, R31, R32 |
| `lib/modules/identity/ports/session-provider.ts` | contrato de `getSessionContext` enmendado (§6.4) | R29, R31 |
| `lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts` | excluye también `ROLE_MAESTRO` | R23 |
| `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` | alta y edición rechazan también el `roleId` del Maestro | R24, R25 |
| `docs/architecture.md` | `## Dominio` n.º 1: «`users.company_id`, obligatoria» pasa a «obligatoria salvo para el Maestro» | R26, R27 |

`<ts>` es un timestamp **posterior a la última migración de `dev` al implementar** (hoy
`20260924120000_customers`). No se fija aquí: QC-142 y QC-168 también pueden traer migración.

**No se tocan:** `app/**`, `components/**`, `middleware.ts`, `route-guard-middleware.ts`,
`login-action.ts`, `lib/shared/navigation/**`, ningún módulo de negocio
(`inventario`, `recetas`, `unidades`, `proveedores`, `pedidos`, `asignaciones`, `documentos`,
`clientes`), `e2e/**` (R19), `package.json` (R20).

---

## 2. El catálogo de permisos

### 2.1 Las dos entradas

Al final de `PERMISSIONS`:

```ts
{ code: 'empresas.consultar', module: 'empresas', action: 'consultar',
  description: 'Consultar las empresas de la plataforma.' },
{ code: 'empresas.modificar', module: 'empresas', action: 'modificar',
  description: 'Dar de alta, editar y dar de baja empresas de la plataforma.' },
```

Las descripciones son propuesta de este spec (D3 fija los códigos y el alcance de `modificar`, no el
texto) y se aprueban con él. Cumplen las reglas vigiladas: `^[a-z]+\.[a-z]+$`, acción en
`{consultar, modificar}`, un módulo con escritura declara exactamente las dos
(`permissions.test.ts:88-119`), y `@@unique([module, action])` no choca.

### 2.2 La enmienda, dicha en el código (R7)

`empresas` **no** es una carpeta de `lib/modules/` —las empresas viven en `identity`—, igual que
`usuarios` y `terminados`. Párrafo nuevo al final del JSDoc de `PERMISSIONS`, sin citas (máximo
cinco líneas, `docs/conventions.md > Comentarios`):

```ts
 * **<Ordinal> enmienda al catalogo cerrado**: suma `empresas.consultar` y `empresas.modificar`,
 * ver y mantener las empresas de la plataforma. Cambia el recuento; como `usuarios`, su modulo no
 * es una carpeta de `lib/modules/`. Solo los recibe el Maestro: ningun rol de empresa los tiene.
```

La frase del recuento (`permissions.ts:8`) es una línea que la rama toca: se reescribe con el número
que resulte contra `dev` al implementar, sin paréntesis de citas. **Propuesta para cortar el
conflicto de raíz** (se aprueba con el spec): quitar el número de esa frase —«El catalogo cerrado:
ni uno mas ni uno menos que los de esta lista»—. Si el humano no la aprueba, el número se escribe
contra `dev` y la segunda ficha en mergear lo sube.

### 2.3 Quién los recibe

```ts
[ROLE_ADMINISTRADOR]: [ /* sin cambios */ ],
[ROLE_OPERADOR]:      [ /* sin cambios */ ],
[ROLE_EMPACADOR]:     [ /* sin cambios */ ],
[ROLE_MAESTRO]:       ['empresas.consultar', 'empresas.modificar'],
```

Una frase en el JSDoc de `SEED_ROLE_PERMISSIONS`: el Maestro nace con exactamente esos dos y ningún
rol de empresa los recibe.

### 2.4 Sitios que hoy afirman el total a mano, y qué se propone

Cada uno se pondrá rojo con esta ficha **y** con QC-142 y QC-168. Se listan todos para que el merge
no descubra ninguno:

| Archivo:línea | Qué fija hoy |
|---|---|
| `lib/modules/identity/domain/permissions.ts:8` | «dieciocho permisos» (prosa) |
| `tests/unit/identity/permissions.test.ts:18-44, 102-105, 234-236, 313-316, 318-322, 350-357` | lista a mano + `size).toBe(18)` + Administrador `toEqual` lista + `toHaveLength(18)` |
| `tests/unit/identity/permissions.test.ts:54-83` | `MODULOS`, `MODULOS_CON_ESCRITURA` (suman `empresas`) |
| `tests/guards/guard-permisos-sembrados.test.ts:124-137` | `PERMISSIONS.length).toBe(18)` |
| `tests/guards/guard-nav-permisos-declarados.test.ts:130` | `CODIGOS_VALIDOS).toHaveLength(18)` |
| `tests/unit/navegacion/qc75-convenciones.test.ts:49-..., 129-130` | lista a mano + `toHaveLength(18)` + módulos esperados |
| `tests/unit/documentos/authorization.test.ts:157-158` | `toHaveLength(18)` |
| `tests/unit/pedidos/qc145-estado-solo-planta.test.ts:316-321` | `toHaveLength(18)` |
| `tests/unit/asignaciones/schema/order-assignments-migration.test.ts:868-877` | `CODIGOS_DE_FICHAS_POSTERIORES` + `toBe(18)` |
| `tests/unit/identity/grupos/scope.test.ts:200, 385-387` | `PERMISOS_ESPERADOS = 18` |
| `tests/unit/identity/roles/scope.test.ts:196, 319-321` | `PERMISOS_ESPERADOS = 18` |
| `tests/unit/identity/seed/seed-initial-access.test.ts:210, 701, 729, 739, 756` | 22 asignaciones, 18 del Administrador |
| `tests/integration/identity/identity-seed.int.test.ts:285, 293, 770, 789-790, 916, 932, 937-938, 967-968` | 18 y 22 |

**Propuesta (se aprueba con el spec):**

- **Un solo sitio con la lista a mano**: `CODIGOS_DEL_REQUISITO` de `permissions.test.ts`, que ya
  compara con `toEqual` y caza igual un código de más, uno de menos o uno cambiado. Ahí el conflicto
  de merge es una unión de líneas, fácil de resolver.
- **Los números sueltos de los demás archivos dejan de ser números**: pasan a comparar contra el
  dato real (`PERMISSIONS.length`, o la suma de `SEED_ROLE_PERMISSIONS`, que la integración ya
  deriva en `identity-seed.int.test.ts:294-297`) y a afirmar la **presencia** de los códigos que
  les importan. Se mantienen las anclas contra la vacuidad (`> 0`, sin repetidos). Los anclajes que
  guardan otra cosa —`CODIGOS_DE_FICHAS_POSTERIORES` en `order-assignments-migration.test.ts`, que
  resta para reconstruir el catálogo de QC-86— suman los dos códigos de esta ficha a su lista.
- **Los tests nuevos de esta ficha no afirman ningún total** (instrucción del leader): afirman
  `toContain` de los dos códigos, la ausencia de cualquier otro `empresas.*` y la igualdad de cada
  rol con su lista en el dominio.
- Si el humano **no** aprueba la conversión, cada número se sube al valor que resulte contra `dev` y
  la segunda y tercera fichas en mergear (QC-142, QC-168) lo vuelven a subir. El `progress/impl_…`
  deja la tabla de arriba para el que resuelva el conflicto.

---

## 3. El rol

```ts
export const ROLE_MAESTRO = 'Maestro'
// …
{ name: ROLE_MAESTRO, description: 'Dueno de la plataforma: gestiona las empresas.' },
```

Al final de `SEED_ROLES`, por el mismo motivo que el Empacador: los ids sintéticos `rol-<i>` de los
tests del seed se derivan del índice y los tres existentes no cambian. La descripción es propuesta
del spec (sin tildes, como las otras tres) y se aprueba con él.

---

## 4. La migración `db/migrations/<ts>_platform_maestro_role/`

Se crea con `pnpm run db:migrate:create` (`prisma migrate dev --create-only`) **después** de cambiar
`db/schema.prisma`, para que Prisma genere el `DROP NOT NULL` y confirme que no hay más drift. Si
emite los `DROP CONSTRAINT` de las FK escritas a mano (aviso conocido de QC-66/QC-86/QC-144), se
borran y se dice en la cabecera.

### 4.1 `migration.sql` (UP), en este orden

```sql
-- 1. La empresa deja de ser obligatoria en la columna; el disparador del paso 5 la vuelve a exigir
--    para todo rol que no sea el Maestro.
ALTER TABLE "users" ALTER COLUMN "company_id" DROP NOT NULL;

-- 2. El rol (forma de la migracion del Empacador).
INSERT INTO "roles" ("name", "description", "updated_at") VALUES
  ('Maestro', '<descripcion de SEED_ROLES>', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- 3. Los dos permisos.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('empresas.consultar', 'empresas', 'consultar', '<descripcion>', CURRENT_TIMESTAMP),
  ('empresas.modificar', 'empresas', 'modificar', '<descripcion>', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 4. El Maestro: exactamente sus dos. Ninguna sentencia nombra a otro rol.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('empresas.consultar'), ('empresas.modificar')) AS "p"("code")
WHERE "r"."name" = 'Maestro'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

-- 5. Empresa segun rol: el Maestro sin empresa, cualquier otro con ella.
CREATE OR REPLACE FUNCTION users_check_company_by_role()
  RETURNS TRIGGER AS $users_check_company_by_role$
DECLARE
  role_name TEXT;
BEGIN
  SELECT r."name" INTO role_name FROM "roles" AS r WHERE r."id" = NEW."role_id";
  -- Rol inexistente: lo rechaza "users_role_id_fkey" con su 23503.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF role_name = 'Maestro' AND NEW."company_id" IS NOT NULL THEN
    RAISE EXCEPTION 'users_platform_role_without_company: ...' USING ERRCODE = '23514';
  END IF;
  IF role_name <> 'Maestro' AND NEW."company_id" IS NULL THEN
    RAISE EXCEPTION 'users_company_required: ...' USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END;
$users_check_company_by_role$ LANGUAGE plpgsql;

CREATE TRIGGER "users_check_company_by_role_trigger"
  BEFORE INSERT OR UPDATE OF "company_id", "role_id" ON "users"
  FOR EACH ROW EXECUTE FUNCTION users_check_company_by_role();

-- 6. Unicidad entre usuarios sin empresa (R28): la misma regla que dentro de una empresa.
CREATE UNIQUE INDEX "users_email_without_company_unique"
  ON "users" (lower("email")) WHERE "company_id" IS NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_username_without_company_unique"
  ON "users" (lower("username")) WHERE "company_id" IS NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_document_without_company_unique"
  ON "users" ("document_type_code", "document_number") WHERE "company_id" IS NULL AND "deleted_at" IS NULL;
```

- **`23502` para «falta la empresa» a propósito.** Es el mismo código que daba el `NOT NULL`
  (`identity-constraints.int.test.ts:1211` sigue verde con un rol que no es Maestro), así que
  cualquier lector que hoy lo traduzca como «falta un obligatorio» sigue acertando. `23514` para el
  Maestro con empresa, como los demás disparadores de ámbito del repo.
- **`UPDATE OF "company_id", "role_id"`**: el caso que importa es cambiar de rol (un Administrador
  convertido en Maestro por SQL a mano, o un Maestro al que se asigna empresa). Las escrituras que no
  tocan esas columnas (bloqueo, estado de cuenta, sello de sesiones) no pagan la consulta a `roles`.
- **Las filas existentes cumplen al crear el disparador**: todas tienen empresa y ninguna es Maestro.
  El disparador no revisa filas viejas y no hace falta.
- **El literal `'Maestro'` se duplica en SQL** porque una migración no importa TypeScript. `db/` queda
  fuera del barrido de R3, igual que `'Administrador'` y `'Empacador'` en sus migraciones. El test
  estático compara los literales del SQL con `ROLE_MAESTRO`, `SEED_ROLES`, `PERMISSIONS` y
  `SEED_ROLE_PERMISSIONS` **importados**, para que divergir sea rojo.
- **Renombrar el rol Maestro** dejaría el disparador comparando contra un nombre inexistente. Los roles
  solo cambian por migración y seed (`guard-permisos-no-administrables`, ampliada a `Role` por
  QC-144), así que una migración que lo renombre tendría que rehacer esta función. Se deja dicho en
  la cabecera del SQL.
- RLS: `users`, `roles`, `permissions` y `role_permissions` ya tienen `FORCE ROW LEVEL SECURITY`; no
  se toca ninguna policy.

### 4.2 `down.sql`, en orden inverso

```sql
DROP INDEX "users_document_without_company_unique";
DROP INDEX "users_username_without_company_unique";
DROP INDEX "users_email_without_company_unique";
DROP TRIGGER "users_check_company_by_role_trigger" ON "users";
DROP FUNCTION users_check_company_by_role();
-- Falla con 23502 si queda algun usuario sin empresa (el Maestro): la reversion entera se deshace.
ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL;
DELETE FROM "role_permissions" WHERE "permission_code" IN ('empresas.consultar', 'empresas.modificar');
DELETE FROM "role_permissions" WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Maestro');
DELETE FROM "permissions" WHERE "code" IN ('empresas.consultar', 'empresas.modificar');
DELETE FROM "roles" WHERE "name" = 'Maestro';
```

- **El `SET NOT NULL` va antes de cualquier `DELETE`** para que, con un Maestro vivo o dado de baja,
  la reversión falle **antes** de tocar datos. `scripts/db-rollback.ts` aplica el `down.sql` y borra
  la fila de `_prisma_migrations` en la misma transacción, así que todo se deshace (R22). Reasignar
  o borrar al Maestro sería inventar un dato.
- Sin `CASCADE`, sin `UPDATE`, sin `INSERT`.

### 4.3 `db/schema.prisma`

```prisma
/// Vacia solo para el Maestro: lo exige el disparador "users_check_company_by_role".
companyId        String?   @map("company_id") @db.Uuid
…
company          Company?  @relation(fields: [companyId], references: [id], onDelete: Restrict, onUpdate: Cascade)
```

`@@unique([id, companyId])` se queda: sigue siendo destino de las FK compuestas de grupos de trabajo.
Una fila con `company_id` nulo no puede ser miembro de un grupo de empresa (esas FK no admiten
`NULL` en el hijo), que es lo correcto. El comentario de cabecera del modelo gana una frase sobre los
tres índices parciales sin empresa.

---

## 5. El seed del primer Maestro

### 5.1 Variables de entorno

`SEED_MAESTRO_USERNAME`, `SEED_MAESTRO_PASSWORD`, `SEED_MAESTRO_EMAIL` (propuesta; pregunta abierta
1). Viven **solo** como elementos de un arreglo en `initial-access-credentials-env.ts`, igual que las
`SEED_ADMIN_*` (`:17`), por `guard-password-never-plaintext`. Nueva función exportada
`readInitialMaestroCredentialsFromEnv`, que reutiliza `readRequiredEnv` y el mismo formato de error
(«faltan las variables de entorno: …», sin valores). `.env.example` gana un bloque hermano del de
`SEED_ADMIN_*` (`:19-24`).

### 5.2 El algoritmo (`seed-initial-access.ts`)

Mismo patrón que hoy, con el Maestro en paralelo al Administrador:

1. Leer roles existentes, **y** `countLiveUsersWithRole(ROLE_ADMINISTRADOR)` **y**
   `countLiveUsersWithRole(ROLE_MAESTRO)` (el método del puerto ya existe y es genérico).
2. `needsAdmin`, `needsMaestro`.
3. **Antes de escribir nada**: si `needsAdmin`, credenciales + política + hash del Administrador
   (sin cambios); si `needsMaestro`, lo mismo para el Maestro. Si cualquiera de las dos falla, el
   seed lanza y **no escribe nada** (R12, R13). Si `needsMaestro` es falso, el proveedor del Maestro
   **no se invoca** (R11).
4. Roles que falten (el Maestro sale solo de `SEED_ROLES`).
5. Permisos y asignaciones que falten (salen solos de `PERMISSIONS` y `SEED_ROLE_PERMISSIONS`).
6. Administrador inicial y empresa inicial: **sin cambios** (R15).
7. Si `needsMaestro`: `repository.createInitialMaestro({ roleId, accountStatus, username, email,
   passwordHash, firstNames, lastNames, birthDate, phone, documentTypeCode, documentNumber })` —
   **sin** `companyId`— con estado `active` explícito (una constante del dominio hermana de
   `SEED_ADMIN_ACCOUNT_STATUS`, o esa misma si el implementador la renombra a algo neutro; nunca el
   `@default(pending)` de la columna) y los marcadores de instalación (pregunta abierta 6: nombres
   «Plataforma»/«Inicial», fecha, teléfono y documento iguales a los del Administrador; el documento
   no choca porque los índices de empresa y el nuevo sin empresa son disjuntos).
8. `SeedOutcome` gana `createdMaestro: boolean`; `scripts/seed.ts` suma «usuario maestro:
   creado / ya existia» a su línea.

`SeedInitialAccessDeps` gana `maestroCredentials` (el proveedor). La composición lo cablea con
`readInitialMaestroCredentialsFromEnv`.

**Por qué un método nuevo en el puerto y no `companyId: string | null` en `createInitialAdmin`**: la
firma actual hace imposible crear al Administrador sin empresa por un descuido; abrirla a `null` la
convertiría en una puerta a lo que la base ya rechaza. Dos métodos, cada uno con su invariante de
tipo.

### 5.3 Precondición de despliegue (operación, no código)

Antes de mergear a `dev` (y a `master`): las tres variables tienen que existir en Vercel para
**producción y preview**, y en el `.env` local de quien corra la integración o el seed. El
`progress/impl_…` lo deja escrito como paso de despliegue, y el leader lo pregunta al humano antes
del PR (pregunta abierta 1).

---

## 6. La sesión sin empresa

### 6.1 Qué significa «sin empresa» en el contenido firmado

`cid` pasa de `z.string().uuid()` a `z.string().uuid().nullable()`: **`null` explícito** significa
«esta persona no tiene empresa». Ausente, vacío, número o texto sin forma de UUID siguen invalidando
la sesión (R32). **No se sube la versión** (`v4` se queda): toda cookie `v4` emitida hasta hoy lleva
un UUID y sigue siendo válida, y el único emisor de `null` es el login de alguien cuya ficha no tiene
empresa.

**Respuesta a la objeción de QC-48** (`session-token.ts:49-51`: «una empresa opcional obligaría a
decidir qué hacer con una sesión sin empresa en cada punto de uso»): el punto de uso es **uno**,
`resolve-session.ts`, que la traduce a «sin contexto de empresa» (§6.3), y todos los consumidores de
ese contexto ya fallan cerrado ante `null` (hallazgo 9). Nadie más recibe la empresa firmada: el
middleware no la lee y la autorización usa la de la base.

### 6.2 Login

- `AuthenticatableUser.companyId: string | null`, `SessionTicket.companyId: string | null`,
  `createSessionTicket(userId, roleName, companyId: string | null, …)`: `strict` marca los sitios de
  llamada.
- `user-credentials-prisma.ts`: `JOIN companies` pasa a **`LEFT JOIN`**, con `company_id` y
  `company_deleted_at` anulables. Sin empresa, `companyDeletedAt` es `null` y el corte «empresa dada
  de baja» (`verify-credentials.ts:227`) no dispara. **Ningún otro corte cambia**: señuelo, un solo
  `verify` de hash, estado de cuenta, contador y bloqueo (R30). `verify-credentials.ts` no cambia
  más que el tipo que pasa a `createSessionTicket`.
- Un usuario de empresa **no** puede llegar aquí con la empresa vacía: lo impide la base (R26). Por
  eso el `LEFT JOIN` no abre ninguna puerta.

### 6.3 Resolución de la sesión

- `SessionUserRecord.companyId: string | null`; `session-user-prisma.ts` devuelve
  `companyDeletedAt: usuario.company?.deletedAt ?? null`. **Ni una consulta más**: la relación ya
  estaba en el `select`.
- `resolve-session.ts`:
  - Corte 4 (`record.companyId !== claims.companyId`) **no cambia de texto**: con valores anulables
    compara igual, y «firmada vacía / ficha con empresa» o al revés sale por `null` (R32).
  - Corte 5 no cambia: sin empresa, la marca de baja es `null`.
  - La composición final devuelve `context: record.companyId === null ? null : { userId, companyId,
    roleName }`. `ResolvedSession.context` pasa a `SessionContext | null`. `SessionContext` **no
    cambia** (`companyId: string` sigue siendo cierto para todo contexto que exista).
- `getSessionContext` en `lib/composition/index.ts:434` ya es `?.context ?? null`: no cambia.

### 6.4 Enmienda al contrato de `SessionProvider` (QC-48 R19)

`ports/session-provider.ts:6-14` dice que `getSessionContext` devuelve `null` «EXACTAMENTE en los
mismos casos» que `getSessionUser`. Deja de ser cierto en un caso, y se dice así en el JSDoc (sin
citas): además de sin sesión, devuelve `null` cuando la sesión es de alguien sin empresa, y entonces
toda operación con ámbito de empresa falla cerrado. Es lo que implementa R29.

### 6.5 Borde, layout, aterrizaje, cierre

- **Middleware**: sin cambios de código. `parseSessionClaims` acepta el `cid: null`, así que la
  sesión del Maestro es `authenticated` (R31).
- **Layout privado**: usa solo `getSessionUser()`; el menú filtrado sale vacío (R31, R33).
- **Aterrizaje**: `login-action.ts` sin cambios; hoy acaba en `/dashboard` → 404 dentro del layout
  (R33, pregunta abierta 2).
- **Pantallas**: `requirePagePermission` compara permisos; sin ellos, 404 (R34).
- **Cierre de sesión**: `endSession` lee el `sid` con el mismo `parseSessionClaims`, registra el
  cierre y borra la cookie; nada suyo depende de la empresa (R35). `revoked_sessions` no tiene
  columna de empresa y sigue exenta (`guard-empresa-en-esquema`); su motivo en la guardia dice
  «cuelgan de un usuario que ya tiene empresa», que para el Maestro deja de ser literal: se ajusta
  la redacción del motivo, sin cambiar la lista.

---

## 7. El selector de roles y el alta/edición (D10)

- `role-catalog-prisma.ts:41`: `where: { name: { notIn: [ROLE_ADMINISTRADOR, ROLE_MAESTRO] } }` (R23).
- `user-admin-prisma.ts`, alta (`:295-299`) y edición (`:680-689`): se resuelven **los dos** ids
  (Administrador y Maestro) con una sola lectura por nombre y se responde `'action_not_allowed'` si
  el `roleId` pedido es cualquiera de ellos, **antes** de escribir. En la edición, la lectura sigue
  dentro de la transacción y la variable del Administrador se conserva para la guarda del último
  administrador (`:690`). La decisión no mira quién pide: da igual el rol o los permisos del actor
  (R24, R25).
- El dominio (`create-user.ts:241-245`, `update-user.ts:89`) ya traduce `'action_not_allowed'` a
  `ActionNotAllowedError`: no cambia.

---

## 8. Autorización por permiso (D6)

- `tests/guards/guard-autorizacion-por-permiso.test.ts`: `buildForbiddenPatterns()` suma el literal
  derivado de `ROLE_MAESTRO` y el identificador `ROLE_MAESTRO`; el ancla de patrones (`:438-448`) se
  tensa con los dos; casos sintéticos «dispara» y «no dispara» como los del Empacador (`:468-500`)
  (R16).
- Las dos exclusiones de §7 viven en `identity`, que la guardia exime por diseño (`:61-63`): no es
  autorizar al actor por su rol, es una propiedad del rol **objetivo**, y es el mismo patrón que ya
  tiene el Administrador.

---

## 9. Qué NO se construye

Ningún caso de uso, Server Action ni pantalla usa `empresas.*` (R17): los exige QC-162, y el área del
Maestro es QC-166. Nada de listar, crear, editar ni dar de baja empresas. No se toca el login por
nombre de usuario ambiguo (pregunta abierta 4).

---

## 10. Tests

### 10.1 Los que se ponen rojos y cómo se arreglan (sin relajar ninguno)

| Archivo:línea | Por qué | Arreglo |
|---|---|---|
| todos los de §2.4 | recuento | §2.4 |
| `tests/unit/identity/permissions.test.ts:234-236, 313-316, 318-322` | Administrador `toEqual` catálogo entero | Administrador = catálogo **sin** `empresas.*`, escrito como lista a mano (`CODIGOS_DEL_ADMINISTRADOR`), y un caso que afirma que no contiene ninguno de los dos |
| `tests/unit/identity/permissions.test.ts:54-83` | `MODULOS`, `MODULOS_CON_ESCRITURA` | suman `empresas` |
| `tests/unit/identity/schema/identity-schema.test.ts:552-555` | `companyId` deja de ser obligatorio | «opcional, y solo por el disparador»: `isOptional` verdadero, `@db.Uuid`, `@map`, sin `@default` |
| `tests/unit/identity/session-claims.test.ts:81-87` | `cid: null` pasa a ser válido | se separa: `null` explícito → claims con `companyId: null`; ausente, vacío, número y no-UUID → `null` |
| `tests/unit/identity/seed/seed-initial-access.test.ts` (roles creados sobre base vacía, `:463` `toHaveLength(3)`, el caso «falta un rol»…) | un rol más, un usuario más, deps nuevas | los dobles suman `maestroCredentials` y `createInitialMaestro`; las listas de roles se derivan de `SEED_ROLES` |
| `tests/integration/identity/identity-seed.int.test.ts` (reset `:250-268`, casos de `SEED_ADMIN_*` `:113-129, 623-674`) | el reset tiene que borrar también al Maestro; los casos sin variables tienen que decidir las del Maestro | el reset ya borra todos los usuarios; los casos de variables guardan y restauran también `SEED_MAESTRO_*` |
| `tests/unit/identity/seed/deploy-hook.test.ts:89-106` | no falla, pero no vigila las nuevas | suma las tres del Maestro |
| `tests/guards/guard-autorizacion-por-permiso.test.ts:438-448` | ancla de patrones | §8 |
| `tests/guards/guard-rol-administrador-unico.test.ts` | no debería ponerse rojo | los marcadores del Maestro no escriben `'Administrador'` |
| Tests de `resolve-session`, `session-token`, `verify-credentials`, `session-user-prisma`, `user-credentials-prisma` | los tipos pasan a anulables | los dobles existentes siguen con UUID; se suman los casos sin empresa (§10.2) |
| Tests de índices de `users`, si alguno enumera los índices únicos | tres índices nuevos | se suman nombrándolos |

### 10.2 Tests nuevos o ampliados

| Archivo | Tipo | Cubre |
|---|---|---|
| `tests/unit/identity/roles/maestro-rol.test.ts` (nuevo) | unit | R2 (fila con descripción, los otros tres intactos), R3 (barrido del literal `Maestro` en `lib/`, `app/`, `components/`, `hooks/` y raíz, sin comentarios: solo `roles.ts`), R4 (el modelo `Role` sin campo de empresa), R17 (barrido de `empresas.consultar`/`empresas.modificar` fuera de `permissions.ts`) |
| `tests/unit/identity/permissions.test.ts` (ampliado) | unit | R5 (presencia de los dos, ningún otro `empresas.*`, los de antes siguen), R6, R7 (párrafo ≤5 líneas con «enmienda», `lib/modules/` y los dos códigos, sin citas; más el caso simétrico sintético), R8, R9 |
| `tests/unit/identity/schema/maestro-migration.test.ts` (nuevo) | unit estático | R20, R21, R22, R26–R28: sentencias del UP en orden, literales contra constantes importadas, ninguna sentencia nombra a otro rol en `role_permissions`, códigos de error del disparador, tres índices parciales; DOWN inverso con `SET NOT NULL` antes de cualquier `DELETE`, sin `CASCADE`. Plantilla: `packer-role-migration.test.ts` |
| `tests/integration/identity/maestro-migration.int.test.ts` (nuevo) | integración | R21 (UP leído del archivo sobre base sembrada, en transacción revertida: filas exactas, los demás roles intactos; dos veces: mismos conteos), R22 (DOWN sin Maestro: base como antes; con un Maestro: falla y no borra), R26 (usuario sin empresa con rol de empresa: `23502` al insertar y al pasar a `NULL`), R27 (Maestro con empresa: `23514` al insertar y al cambiar a rol Maestro un usuario con empresa), R28 (dos Maestros vivos con el mismo nombre de usuario, correo o documento: rechazo; con uno dado de baja: se acepta) |
| `tests/integration/identity/identity-constraints.int.test.ts` (ampliado) | integración | R26: el caso existente `:1194-1211` sigue verde tal cual, con su `23502` |
| `tests/unit/identity/seed/seed-initial-access.test.ts` (ampliado) | unit | R10 (crea un Maestro sin empresa, `active`, con hash y marcadores; no llama a `createCompany` para él), R11 (Maestro existe: el proveedor no se invoca), R12 (falta variable: lanza nombrándola y **ningún** método de escritura se llamó, ni roles), R13 (política: lanza con reglas, sin la contraseña, nada escrito; `hash` recibe la contraseña y el puerto solo el hash), R15 (Administrador existe y Maestro no: crea solo el Maestro; y al revés) |
| `tests/unit/identity/seed/initial-access-credentials-env.test.ts` (ampliado) | unit | R12: las tres del Maestro, vacías = ausentes, error con todas y sin valores |
| `tests/unit/identity/seed/deploy-hook.test.ts` (ampliado) | unit | R14 |
| `tests/integration/identity/identity-seed.int.test.ts` (ampliado) | integración | R10, R18 (dos corridas; para **cada** rol de `SEED_ROLES`, `codigosEnBaseDe` = `codigosSembradosDe`; la segunda no crea nada), R4 (una sola fila `Maestro`), R15 |
| `tests/guards/guard-autorizacion-por-permiso.test.ts` (ampliado) | guardia | R16 |
| `tests/integration/identity/role-catalog.int.test.ts` (ampliado) | integración | R23: `listAllRoles()` no incluye `Maestro` ni `Administrador` |
| `tests/integration/identity/user-crud.int.test.ts` (ampliado) | integración | R24, R25: alta y edición con el `roleId` del Maestro, actor con `usuarios.modificar` → `ActionNotAllowedError`, cero filas escritas. R1: la lista de la empresa inicial no trae al Maestro; edición, baja y cambio de estado con su id → «no encontrado», sin escribir |
| `tests/unit/identity/session-claims.test.ts` (ampliado) | unit | R32 |
| `tests/unit/identity/resolve-session.test.ts` (ampliado) | unit | R31 (ficha sin empresa + firma `null` → `user` con permisos, `context` `null`), R32 (firma `null`/ficha con empresa y al revés → `null`) |
| `tests/unit/identity/verify-credentials.test.ts` (ampliado) | unit | R30: sin empresa emite ticket con `companyId: null`; contraseña mala, bloqueo y cuenta no activa siguen rechazando igual |
| `tests/integration/identity/login.int.test.ts` y `session-user.int.test.ts` (ampliados) | integración | R30, R31 contra Postgres: el `LEFT JOIN` encuentra al Maestro; la lectura de sesión lo resuelve sin empresa |
| `tests/unit/identity/route-guard-middleware.test.ts` (ampliado) | unit | R31: cookie firmada con `cid: null` → `allow` en ruta privada |
| `tests/unit/identity/maestro-sin-empresa-actions.test.ts` (nuevo) | unit | R29: con `getSessionUser` devolviendo un usuario con **todo** el catálogo y `getSessionContext` `null`, una acción representativa de `inventario`, `pedidos`, `unidades` e `identity` (usuarios) responde no autorizada y el repositorio no se llama. Todos los permisos a propósito: así lo único que falta es la empresa |
| `tests/unit/identity/login-action.test.ts` (ampliado) | unit | R33: permisos `['empresas.consultar','empresas.modificar']` → destino `DASHBOARD_ROUTE` hoy, calculado con las mismas funciones del menú |
| `tests/unit/identity/require-page-permission.test.ts` (ampliado) | unit | R34: usuario con solo `empresas.*` pidiendo una página de `inventario.consultar` → `notFound()` |
| `tests/unit/identity/end-session.test.ts` (ampliado) | unit | R35: claims con `companyId: null` → se registra el cierre y se borra la cookie |

R19 y R20 no llevan test propio: R19 se verifica en la revisión (el diff no toca `e2e/`), R20 lo
hacen cumplir `guard-dependencias-aprobadas` y el test estático de la migración (una sola carpeta
nueva en `db/migrations/`, ningún `CREATE TABLE`).

**Sin E2E (D8).** `CHECKPOINTS.md > Calidad de código` pide E2E para autenticación y permisos. D8 lo
difiere, con el precedente QC-94 → QC-67 y QC-144 → QC-145; el reviewer lo tiene que leer como
decisión humana, no como olvido. Lo pagan QC-162/QC-166 (pregunta abierta 7).

---

## 11. Alternativas descartadas

1. **El Maestro en una «empresa de plataforma» oculta.** Evitaría tocar `users.company_id`, la sesión
   y el login. Descartada: contradice D11 («a ninguna»), y una empresa fantasma aparecería en todo
   lo que liste empresas (QC-162) y en todo filtro por empresa: el Maestro sería, a efectos de datos,
   el Administrador de una empresa más.
2. **Garantía estructural en vez de disparador**: columna `roles.without_company`, copia en `users`,
   FK compuesta `(role_id, role_without_company)` y `CHECK ((company_id IS NULL) =
   role_without_company)`. Declarativa y sin el literal `'Maestro'` en SQL. Descartada: añade dos
   columnas y una FK compuesta que Prisma ve como drift, obliga al seed a mantener la bandera y
   generaliza a «roles sin empresa» algo que hoy es un solo rol; es la infraestructura «por si acaso»
   que `docs/architecture.md > Dominio` rechaza. El disparador tiene precedente en el repo
   (`inventory_movements_check_company`, `product_batches_check_company`).
3. **Contexto de sesión con `companyId: string | null`** en vez de `context: null`. Más explícito,
   pero obliga a tocar las nueve copias de `currentActor()` y cada módulo de negocio para decidir qué
   hacer con `null`; olvidarlo en una sola compila si alguien pone `?? ''`. `context: null` reutiliza
   el camino que ya falla cerrado y no toca ningún módulo de negocio.
4. **Subir la cookie a `v5`.** Descartada: las cookies `v4` vivas siguen siendo válidas bajo el
   esquema nuevo, así que subir la versión solo echaría a todo el mundo sin ganar nada.
5. **Comprobar en el dominio del login que «sin empresa» implica «Maestro»**, comparando el rol.
   Descartada: sería autorizar por nombre de rol (D6), y la base ya lo garantiza (R26, R27).
6. **Rechazar el rol Maestro en el caso de uso** (`create-user.ts`) en vez de en el adaptador. El
   dominio necesitaría el id del Maestro por un puerto nuevo. Se sigue el precedente del
   Administrador: la lectura por nombre vive en el adaptador, dentro de la misma transacción que
   escribe, y el dominio traduce `'action_not_allowed'`.
7. **Solo seed, sin migración de datos.** Descartada por la misma razón que QC-144: la migración
   corre antes del seed en el `build`, y el disparador y los índices tienen que existir aunque el
   seed no corra.
8. **Ampliar `createInitialAdmin` con `companyId: string | null`.** Descartada en §5.2: un solo
   método con empresa opcional deja crear un Administrador sin empresa por un descuido de tipo.

---

## 12. Dependencias de terceros

Ninguna (D9, R20). No hay librería que evaluar.
