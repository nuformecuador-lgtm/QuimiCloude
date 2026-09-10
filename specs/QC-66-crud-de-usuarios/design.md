# QC-66 — crud-de-usuarios · design.md

> Zona: `backend` · Complejidad: `medium` · depends_on: `QC-65` ·
> Rama: `feature/QC-66-crud-de-usuarios`
>
> El **qué** está en `requirements.md` (R1–R48) y su alcance lo cerró el humano el 2026-09-10 en la
> tabla de **17 decisiones**. Aquí va el **cómo**: dónde viven los seis casos de uso dentro de
> `lib/modules/identity/` y cómo se cablean, la **migración de datos** del catálogo de permisos con
> su `down.sql`, los **seis archivos de test ajenos** que hay que actualizar en la misma tanda, cómo
> se genera la contraseña al azar de forma que cumpla QC-19 por construcción **y no salga por
> ninguna vía**, cómo se cierra la guarda del «último administrador en `active`» **sin condición de
> carrera**, y la firma exacta del listado.
>
> **Precedentes literales, que son la mitad del trabajo**: `specs/QC-43-crud-de-proveedores/` y
> `specs/QC-38-crud-de-unidades/` (CRUD por permiso, listado paginado con desempate, Server Actions
> con `FormData`, errores con `code` estable), `specs/QC-57-orden-y-filtro-en-listados/` (el contrato
> de consulta de lista), `specs/QC-74-modelo-de-permisos/` (catálogo y autorización),
> `specs/QC-65-estado-de-cuenta-de-usuario/` (las tres columnas de estado) y
> `specs/4-modelo-usuarios-y-roles/` + `specs/QC-47-...` (el modelo y los tres índices únicos). **Este
> diseño no inventa nada donde esos ya decidieron**; cada vez que se aparta, lo dice y explica por qué.
>
> **El modelo ya existe y está mergeado.** `User` está completo en `db/schema.prisma` (rol, empresa,
> `deleted_at`, los tres contadores de QC-19, `must_change_credential` y las tres columnas de QC-65).
> Esta ficha **no re-especifica el modelo y no lo cambia**: lo consume (R43).

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `lib/modules/identity/domain/permissions.ts` | **Dos entradas nuevas** en `PERMISSIONS` y dos códigos en `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]`, escritos uno a uno. La cabecera pasa de «once» a «trece» y **escribe la segunda enmienda a QC-74** (R8, R9, R12). |
| `lib/modules/identity/domain/errors.ts` | **NUEVO.** `identity` todavía no tiene jerarquía de errores (verificado: `grep 'class .*Error' lib/modules/identity` no devuelve nada). Nace aquí `IdentityError` + subclases con `code` estable (§ 6.4). |
| `lib/modules/identity/domain/actor.ts` | **NUEVO.** `Actor` `{ id, companyId, permissions }` y `requirePermission`, delegando en `assertPermission` (§ 5.1). Copia exacta del de `unidades`. |
| `lib/modules/identity/domain/list-query.ts`, `page.ts`, `user-queryable.ts` | **NUEVOS.** Sexta copia del contrato de lista de QC-57 (§ 8). |
| `lib/modules/identity/domain/user-input.ts`, `user-view.ts` | **NUEVOS.** Esquemas `zod` de alta/edición/estado y tipos de salida (§ 6). |
| `lib/modules/identity/domain/create-user.ts`, `get-user.ts`, `list-users.ts`, `update-user.ts`, `delete-user.ts`, `set-user-account-status.ts` | **NUEVOS.** Los **seis** casos de uso, uno por archivo, como factory `createXxx(deps)`. |
| `lib/modules/identity/ports/user-admin-repository.ts` | **NUEVO.** El puerto de lectura/escritura de la administración de usuarios (§ 7). |
| `lib/modules/identity/ports/initial-credential-factory.ts` | **NUEVO.** El puerto que devuelve **el hash** de una credencial generada al azar (§ 4). |
| `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` | **NUEVO.** Implementación Prisma del puerto, único sitio de la feature que toca `@prisma/client`. |
| `lib/modules/identity/adapters/driven/security/initial-credential-factory-crypto.ts` | **NUEVO.** `node:crypto` + la política de QC-19 + bcrypt, sin devolver la credencial (§ 4). |
| `lib/modules/identity/adapters/driving/user-actions.ts` | **NUEVO.** Las seis Server Actions (R40). |
| `lib/modules/identity/index.ts` | Gana tipos, esquemas, errores y las **seis factories** — solo de `./domain`. |
| `lib/composition/index.ts` | La fachada `identity` gana las seis claves + el repositorio y la fábrica de credencial. **Único** sitio de cableado (R42). |
| `db/migrations/<ts>_user_permissions_catalog/migration.sql` + `down.sql` | **Migración de DATOS** del catálogo (§ 3). |
| `tests/**` | Los nuevos de § 13 **y los seis ajenos de § 2**. |

**Declaración explícita para la validación de conflicto del leader** (`tasks.md` la repite):
`db/schema.prisma` **NO se toca**; `db/migrations/` **SÍ** (una carpeta nueva); `lib/composition/`
**SÍ**; `lib/modules/identity/index.ts` **SÍ**. No se toca `app/`, `components/`, `middleware.ts`,
`e2e/`, `lib/shared/**` ni `lib/modules/<otro>/**`.

**Aviso de paralelismo:** **QC-78 está `in_progress` en la misma zona** y también dentro de
`lib/modules/identity/`. Su `tasks.md` declara sus 8 archivos de producción y declara **no tocar**
`db/schema.prisma`, `db/migrations/`, `lib/composition/` ni `lib/modules/identity/index.ts`: con
esta ficha **no hay un solo archivo de producción en común**. El único solape es de tests:
`tests/unit/composition/identity-facade.test.ts` (QC-78 lo toca «solo fixtures»; esta ficha le suma
las seis claves nuevas). Queda anotado para que el leader decida el orden; no se resuelve aquí.

---

## 2. El ripple del catálogo compartido: los seis archivos de test ajenos

**Medido, no estimado** (leído en el árbol de esta rama). Pasar de **once a trece** pone en rojo
exactamente estos seis archivos, que **no son de esta feature**, y la **decisión cerrada 1** exige
tocarlos **en la misma tanda que el cambio del catálogo, nunca al final**. Es la deuda que QC-38 ya
pagó al pasar de diez a once (`progress/impl_QC-38-crud-de-unidades.md > El ripple del catálogo
compartido`).

| # | Archivo | Qué afirma hoy | Qué pasa a afirmar |
| --- | --- | --- | --- |
| 1 | `tests/guards/guard-permisos-sembrados.test.ts` | L124 título «exactamente once permisos», L131 `.toBe(11)` y el texto del mensaje de fallo | `.toBe(13)`, título y mensaje a «trece». El ancla anti-vacuidad **se mantiene**, no se borra |
| 2 | `tests/guards/guard-nav-permisos-declarados.test.ts` | L115 `expect(CODIGOS_VALIDOS).toHaveLength(11)` | `13`. **El árbol de navegación NO cambia** (sigue con 7 enlaces, L100): el item de usuarios es de QC-67 |
| 3 | `tests/unit/navegacion/qc75-convenciones.test.ts` | L114-116: `toHaveLength(11)` y la lista `CODIGOS_QC74` comparada ordenada | `13` y los dos códigos nuevos en esa lista. El caso «ningún permiso es comodín» sigue valiendo tal cual |
| 4 | `tests/unit/identity/permissions.test.ts` | `CODIGOS_DEL_REQUISITO` (11 códigos), L59 `toBe(11)`, L92 título, y **L33 `MODULOS`** / L37 `MODULOS_CON_ESCRITURA` | los 13 códigos, `13`, y **`'usuarios'` sumado a `MODULOS` y a `MODULOS_CON_ESCRITURA`**, con el comentario de la enmienda de la decisión 2. **Sin esto el test R1 falla**: hoy exige que todo módulo declarado sea un módulo del repositorio, y `usuarios` no es una carpeta |
| 5 | `tests/unit/identity/seed/seed-initial-access.test.ts` | L694 título «once permisos y las doce asignaciones», L731 `toBe(12)`, L748 `toHaveLength(11)` | «trece y catorce», `toBe(14)`, `toHaveLength(13)` |
| 6 | `tests/integration/identity/identity-seed.int.test.ts` | L240 y L248 comentarios («once», «once + una = doce»), L650 y L674 títulos | comentarios y títulos a trece/catorce. Los conteos ya se **derivan** de `PERMISSIONS`, así que no hay número literal que cambiar |

**El ajuste es de conteo, texto y pertenencia a una lista. Ninguna expectativa se relaja** (R48): ni
un `expect` borrado, ni un `toEqual` degradado a `toContain`, ni un caso saltado. Igual que en QC-38,
`tests/unit/identity/permissions.test.ts` **gana** dos casos explícitos (el `Administrador` con los
dos códigos de usuarios escritos uno a uno; el `Operador` con ninguno de los dos).

**Cómo se caza un séptimo.** Antes de cerrar la tanda se corre
`pnpm exec vitest related --run lib/modules/identity/domain/permissions.ts` (es lo que hizo QC-38 y
encontró exactamente seis). Candidatos descartados por lectura, anotados para que nadie los busque
dos veces: `tests/unit/configuracion-ui/permisos-unidades-coherentes.test.ts` y
`tests/unit/navegacion/private-layout-menu.test.tsx` nombran `unidades.modificar` pero **no cuentan
el catálogo**; `tests/guards/guard-pantallas-exigen-permiso.test.ts` recorre `app/` y esta ficha no
añade ninguna página.

---

## 3. La migración del catálogo de permisos (R11, R44)

### 3.1 Por qué hay migración, si QC-38 no la tuvo

QC-38 añadió `unidades.modificar` **sin migración**: el catálogo lo siembra `seedInitialAccess`, que
deriva de `PERMISSIONS` lo que falta, así que la corrida siguiente del seed crea la fila y su
asignación. Eso funciona **si alguien corre el seed**, y `db:seed` es un **script manual**
(`package.json` L19: `tsx scripts/seed.ts`), no un paso de despliegue. Sobre una instalación ya en
marcha, un catálogo que crece solo en el código deja al `Administrador` **sin los dos permisos
nuevos** hasta que alguien se acuerde — y con ellos, la pantalla de QC-67 inaccesible para todo el
mundo, en despliegue y no en el gate.

La **decisión cerrada 16 del humano** cierra el punto: la migración existe y lleva su `down.sql`. No
contradice a QC-74: su propio esquema lo dice con estas palabras —«el catálogo y sus asignaciones no
se administran por la aplicación: los siembra `seedInitialAccess` y **se cambian por migración**»
(`db/schema.prisma`, comentario de `Permission`)—. Lo que QC-74 prohibió es que la migración
**creadora de las tablas** insertara filas (su `migration.sql`, cabecera: «esta migración no inserta
ninguna fila»), y el motivo era no tener dos verdades del catálogo. Aquí hay **dos escrituras del
mismo dato** y eso se mitiga con el test estático de § 13 (la migración se compara contra
`PERMISSIONS` **importado**, no contra literales copiados; mismo patrón que
`account-status-migration.test.ts` de QC-65).

### 3.2 UP — datos, idempotente, sin tocar el esquema

```sql
-- QC-66: el catalogo de permisos pasa de ONCE a TRECE. Migracion de DATOS: no crea, modifica ni
-- borra ninguna columna, indice, restriccion ni tipo (R43). Los tres indices unicos de `users`
-- (QC-47) NO se tocan (R38). Los dos codigos y sus descripciones son los de
-- `lib/modules/identity/domain/permissions.ts`, que sigue siendo el unico dueno del catalogo; el
-- test estatico los compara importando esa constante, no copiandola.
--
-- Idempotente por `ON CONFLICT DO NOTHING` (R11): aplicarla sobre una base donde el seed ya
-- sembro los dos codigos no falla y no reescribe nada. `updated_at` no tiene default en
-- `permissions`, asi que se escribe explicito.

INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('usuarios.consultar', 'usuarios', 'consultar',
   'Consultar los usuarios de la empresa.', CURRENT_TIMESTAMP),
  ('usuarios.modificar', 'usuarios', 'modificar',
   'Crear, editar, borrar y cambiar el estado de cuenta de los usuarios de la empresa.',
   CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Las dos asignaciones, UNA A UNA (decision 1: `modificar` NO implica `consultar`). El rol se
-- resuelve POR NOMBRE con un subselect, nunca con un uuid escrito a mano: `roles.id` es
-- `gen_random_uuid()` y es distinto en cada instalacion.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code"
FROM "roles" AS "r"
CROSS JOIN (VALUES ('usuarios.consultar'), ('usuarios.modificar')) AS "p"("code")
WHERE "r"."name" = 'Administrador'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
```

Tres cosas que parecen detalle y no lo son:

- **`WHERE r.name = 'Administrador'` es un literal en SQL, y está bien.** R24 y la decisión 9 hablan
  del **código TypeScript**; un archivo `.sql` no puede importar una constante. El test estático
  afirma que ese literal coincide con `ROLE_ADMINISTRADOR` **importado**, que es la única forma de
  que no divergan.
- **Si el rol `Administrador` no existe, el `INSERT … SELECT` no inserta nada y no falla.** Es el
  comportamiento correcto sobre una base virgen: ahí el rol lo crea el seed, que a continuación
  siembra las dos asignaciones derivadas de `SEED_ROLE_PERMISSIONS`. Los dos caminos convergen.
- **Ninguna fila de `users` se toca.** El permiso cuelga del rol (QC-74 R6), así que nadie tiene que
  recibir nada individualmente.

### 3.3 DOWN — vuelve al estado exacto anterior

```sql
-- Orden inverso: primero las asignaciones (la FK role_permissions -> permissions es RESTRICT, asi
-- que borrar el permiso antes fallaria), despues las dos entradas del catalogo.
DELETE FROM "role_permissions"
WHERE "permission_code" IN ('usuarios.consultar', 'usuarios.modificar');

DELETE FROM "permissions"
WHERE "code" IN ('usuarios.consultar', 'usuarios.modificar');
```

**Por qué borra también las asignaciones de cualquier rol, no solo las del `Administrador`:** el
`RESTRICT` de `role_permissions_permission_code_fkey` no deja otra salida, y dejar el permiso
huérfano **no es el estado anterior** (R44). El `DELETE` es acotado por código: ninguna otra
asignación se pierde. Se verifica de verdad con el ciclo `db:migrate` → `db:rollback` → `db:migrate`
(T12), no solo con el test estático que lee texto.

### 3.4 El seed, idempotente, sin tocar su algoritmo (R9, R10)

**`seed-initial-access.ts` no se modifica.** Su algoritmo ya deriva de `PERMISSIONS` las filas que
faltan y de `SEED_ROLE_PERMISSIONS` las asignaciones que faltan, sin `upsert` y sin `delete`: sumar
dos entradas al catálogo y dos códigos al conjunto del `Administrador` es **todo** lo que hace falta
(R9), y la idempotencia (R10) sale gratis por el mismo camino que la de QC-74 y QC-38. Lo que sí
cambia son sus **tests** (§ 2, filas 5 y 6), porque los conteos están escritos.

---

## 4. La contraseña generada: cumple QC-19 por construcción y no sale de su adaptador

### 4.1 La decisión de forma: el puerto devuelve el HASH, nunca la credencial

```ts
// lib/modules/identity/ports/initial-credential-factory.ts
/**
 * Produce la credencial inicial de un usuario nuevo y devuelve SOLO SU HASH (R15, R16). La
 * credencial en claro no cruza este puerto: no existe fuera del cuerpo del adaptador, y por tanto
 * ningun caso de uso, ningun resultado y ningun error puede filtrarla.
 */
export interface InitialCredentialFactory {
  createCredentialHash(): Promise<string>;
}
```

**Esto es lo que hace R16 una propiedad del diseño y no una promesa.** La alternativa natural
—generar en el dominio y hashear después— deja la cadena en claro viva dentro del caso de uso, al
alcance de un `console.log`, de un mensaje de error con contexto o de un `return` descuidado; y el
día que alguien añada «devuélvela una sola vez» (lo que la decisión 7 descartó) el cambio son dos
líneas. Con esta forma, **el tipo no lo permite**: el caso de uso recibe un `string` que es un hash
bcrypt y no tiene nada más.

El nombre evita el segmento `password` a propósito y acaba en `Hash`, como exige
`tests/guards/guard-password-never-plaintext.test.ts` (la guardia marca todo identificador declarado
que nombre la contraseña y no acabe en `hash`). Se adapta el nombre, no la guardia.

### 4.2 El adaptador: `node:crypto` y la política de QC-19 como condición de salida

```ts
// lib/modules/identity/adapters/driven/security/initial-credential-factory-crypto.ts
import { randomInt } from 'node:crypto';
```

- **`randomInt`, no `Math.random`.** Es el generador criptográfico del runtime, viene en el `crypto`
  de Node (R47: ninguna dependencia nueva) y `randomInt(max)` da un entero **sin sesgo de módulo**,
  que es el error clásico de hacerlo a mano con `randomBytes` + `%`.
- **Cumple QC-19 por construcción, en dos capas.**
  1. **Construcción:** la candidata se arma con **24** caracteres tomados de cuatro alfabetos
     —mayúsculas, minúsculas, dígitos y símbolos—, garantizando **al menos uno de cada** y
     completando el resto de la unión, y después se **mezcla** con un Fisher–Yates alimentado por
     `randomInt` (sin la mezcla, la posición del símbolo sería predecible). 24 está cómodamente entre
     `CREDENTIAL_MIN_LENGTH` (8) y `CREDENTIAL_MAX_LENGTH` (64), que se **importan** de
     `domain/credential-policy.ts` y `domain/credentials.ts` en vez de reescribirse.
  2. **Verificación:** el adaptador pasa la candidata por la **política completa** de QC-19
     —`createCredentialPolicy`, que suma a las seis reglas propias la lista de credenciales
     filtradas— y SI el resultado no es aceptable, **reintenta** un número acotado de veces y, si
     sigue sin serlo, **lanza** nombrando las **reglas** incumplidas y nunca la candidata (mismo
     criterio que el seed, `seed-initial-access.ts` L85-90). No es redundancia: es lo que convierte
     «por construcción» en una afirmación verificada, y lo que evita el caso real —improbable, no
     imposible— de que la candidata caiga en la lista de filtradas.
- **Apoyarse en la política dentro de un driven es legal**: un adaptador driven puede importar
  `../../domain` y **otro driven de su mismo módulo** (`docs/architecture.md > La regla de
  dependencias`, nota QC-9), que es exactamente `breached-credential-list.ts`. El cableado
  puerto→implementación sigue siendo exclusivo de `lib/composition`.
- **El hash lo produce el `PasswordHasher` ya cableado** (bcrypt, QC-5). Esta feature no vuelve a
  elegir algoritmo ni coste.
- **Ni un `console.log`, ni un campo en el resultado, ni la candidata en el `cause` de un error.**
  La verificación de R16 es un test que ejerce el alta con dobles y afirma que el valor devuelto y el
  estado serializado de la Server Action **no contienen** la candidata, más un test de alcance que
  recorre el archivo del adaptador y falla ante cualquier `console.*`.

---

## 5. Autorización, actor y módulo

### 5.1 `requirePermission`, primera línea de los seis (R1–R5)

```ts
// lib/modules/identity/domain/actor.ts
import { assertPermission } from './require-permission';   // ruta RELATIVA, ver nota
import type { PermissionCode } from './permissions';
import { UnauthorizedError } from './errors';

export type Actor = {
  readonly id: string;
  readonly companyId: string;
  readonly permissions: readonly string[];
};

export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
```

Copia **literal** del `actor.ts` de `unidades`, con una sola diferencia: estamos **dentro** de
`identity`, así que `assertPermission` y `PermissionCode` se importan por **ruta relativa de su
propio dominio** (`./require-permission`, `./permissions`) y **no** por el barrel
`@/lib/modules/identity` — un módulo que se importa a sí mismo por su barrel crea un ciclo. Es la
única adaptación del precedente y conviene decirlo porque es el error fácil al copiar.

- **Antes de `zod` y antes de tocar ningún puerto.** El test que cierra R2 llama a los seis casos de
  uso con un actor sin el código y con dobles que **fallan si los llaman**: así se demuestra «no
  llega al repositorio», que es lo que distingue una autorización real de un `if` decorativo.
- **Falla cerrado** (R2) y **sin implicación entre permisos** (R3): lo garantiza `assertPermission`,
  que ya es la única implementación de la regla en el repo y ya tiene sus trece casos de test.
- **El rol del actor no viaja hasta aquí** (R4). Lo único que esta feature compara contra
  `ROLE_ADMINISTRADOR` es el rol **del usuario objetivo**, dentro de la guarda de § 9.
- La RLS de `users`, `permissions` y `role_permissions` sigue activa y forzada y **no autoriza nada**
  (R7): Prisma se conecta como dueño de las tablas.

### 5.2 De dónde sale el actor (R6)

Las **dos caras** de la sesión del servidor, como en `unidades/adapters/driving/unit-actions.ts`:
`identity.getSessionUser()` da el identificador y el conjunto de permisos; `identity.getSessionContext()`
da la **empresa**. Si falta cualquiera de las dos, el actor es `null` y `requirePermission` rechaza.
La empresa **nunca** llega de la entrada del llamante (R14).

Detalle propio de estar dentro de `identity`: la Server Action de esta feature consume
`@/lib/composition` igual que cualquier otro driving (la regla de dependencias lo permite), así que
no se duplica ninguna resolución de sesión.

---

## 6. Contratos de entrada y salida

Validación con **zod** en el borde (R18). Los esquemas viven en `domain/` y se reexportan por el
contrato, así que la Server Action y —mañana— el formulario de QC-67 validan con el **mismo** esquema.

### 6.1 Alta (`createUserSchema`)

| Campo | Forma | Requisito |
| --- | --- | --- |
| `firstNames`, `lastNames` | `string`, `trim`, min 1, max 80 | R18 |
| `birthDate` | fecha `YYYY-MM-DD` | R18 |
| `email` | `string`, `trim`, min 1, max 160 | R18 |
| `phone` | `string`, `trim`, min 1, max 40 | R18 |
| `documentTypeCode` | uno de `DOCUMENT_TYPE_CODES` | R18 |
| `documentNumber` | `string`, `trim`, min 1, max 40 | R18 |
| `username` | `string`, `trim`, min 1, max 60 | R18 |
| `roleId` | `uuid` | R18 |

**Lo que NO está en el esquema, y es el requisito**: `companyId` (R14), cualquier campo de contraseña
(R15, R16, decisión 10), `accountStatus` (nace `pending` por R13), `mustChangeCredential` (nace
verdadero por R13) y los tres contadores de QC-19 (R45). Un esquema `strictObject` hace que mandarlos
**falle**, en vez de ignorarlos en silencio.

**Los largos máximos son la posición por defecto de este diseño**, no una decisión del humano: la
base los tiene como `TEXT` sin restricción y **no se les añade ninguna** (R43), igual que QC-43 D14 y
QC-38. Cambiar un número es una línea de `zod` y su caso de test; ningún requisito los cita por su
valor, a propósito.

**Sin validación de formato de correo ni de teléfono, y sin normalización del nombre de usuario más
allá de `trim`.** Es lo que hace el modelo hoy (los tres índices únicos aplican `lower(...)` **en la
base**), y cambiarlo sería reabrir QC-47 por la puerta de atrás.

### 6.2 Edición (`updateUserSchema`) y estado (`setAccountStatusSchema`)

`updateUserSchema` = los **nueve** campos de R19 (los ocho de arriba más `roleId`), **reemplazo
completo**, sin edición parcial (R19) y sin empresa ni contraseña (R20).
`setAccountStatusSchema` = `{ accountStatus: z.enum(USER_ACCOUNT_STATUSES) }`, importando el conjunto
cerrado de QC-65 —**el enum no se reescribe**— y admitiendo los cuatro valores (R26).

### 6.3 Salida

```
UserRow   (listado, R31)  = { id, displayName, username, email, roleName, accountStatus }
UserDetail (ficha,  R32)  = { id, firstNames, lastNames, birthDate, email, phone,
                              documentTypeCode, documentNumber, username, roleId, roleName,
                              accountStatus, accountStatusChangedAt, createdAt, updatedAt }
```

- **Ni `passwordHash`, ni `mustChangeCredential`, ni `failedLoginAttempts`, ni `lockLevel`, ni
  `lockedUntil`, ni `companyId`, ni `deletedAt`** salen por ninguna de las dos (R31, R32, R45). El
  adaptador **enumera** las columnas en el `select` de Prisma: nunca un `findMany` sin `select`, que
  es como un hash acaba en un payload del cliente. Un test afirma las claves exactas del objeto, no
  solo que falten algunas.
- **`displayName` se compone con `buildDisplayName`**, que ya existe en el dominio de `identity` y ya
  tiene tests: no se concatena a mano.
- **`roleName` viaja resuelto** (un `include`/`select` del rol, legal: `Role` es de `identity`). Es
  display; no autoriza nada.
- `accountStatusChangedBy` **no sale**: es un identificador que la pantalla no muestra, y exponerlo
  obligaría a resolver un nombre más.

### 6.4 Errores (R41)

Clases nuevas en `domain/errors.ts`, todas derivando de `IdentityError`, con `code` **estable**:

| Clase | `code` | Cuándo |
| --- | --- | --- |
| `UnauthorizedError` | `unauthorized` | R2, R3 |
| `NotFoundError` | `not_found` | el usuario no existe, está borrado, es de **otra empresa** o es **el propio actor** (R33, R34, R35) |
| `DuplicateEmailError` | `duplicate_email` | choque contra `users_email_unique` (R17) |
| `DuplicateUsernameError` | `duplicate_username` | choque contra `users_username_unique` (R17) |
| `DuplicateDocumentError` | `duplicate_document` | choque contra `users_document_unique` (R17) |
| `RoleNotFoundError` | `role_not_found` | el `roleId` no existe (R18) |
| `SelfOperationError` | `self_operation` | el objetivo es el propio actor en estado, rol o borrado (R21) |
| `LastAdministratorError` | `last_administrator` | la operación dejaría la empresa sin administrador en `active` (R22) |
| `ValidationError` | `invalid_input` | la entrada no pasa `zod` (R18) |

**«De otra empresa» y «soy yo» responden `not_found`, no `unauthorized`.** Distinguirlos convertiría
la ficha en un **oráculo de existencia** sobre datos ajenos. Es el criterio de QC-38 y de QC-43.
**`self_operation` sí es distinto de `not_found`** y a propósito: la pantalla tiene que poder decir
«no puedes cambiar tu propio rol» sin mentir, y ese caso no revela nada que el actor no sepa ya.

Los tres duplicados se discriminan **por columna** (`error.meta.target`), no por nombre de índice:
con `@prisma/client@6.19.3` `meta.target` trae las **columnas** afectadas, y confundirlo fue el
defecto real que QC-38 encontró solo con integración
(`progress/impl_QC-38-crud-de-unidades.md > El hallazgo importante`). Para el índice del documento, el
`target` trae `company_id`+`document_type_code`+`document_number`.

---

## 7. El puerto de datos

```ts
// lib/modules/identity/ports/user-admin-repository.ts
export type UserAdminRow = { /* UserRow, estructural */ };
export type UserAdminDetail = { /* UserDetail, estructural */ };

export type NewUser = {
  readonly firstNames: string; readonly lastNames: string; readonly birthDate: Date;
  readonly email: string; readonly phone: string;
  readonly documentTypeCode: string; readonly documentNumber: string;
  readonly username: string; readonly roleId: string;
};

export type DuplicateKey = 'email' | 'username' | 'document';

export interface UserAdminRepository {
  /** La EMPRESA y el HASH son argumentos propios y obligatorios: una llamada que los olvide no
   *  compila (R14, R15), en vez de crear un usuario sin empresa o sin credencial. */
  create(
    companyId: string,
    data: NewUser,
    credentialHash: string,
    accountStatus: 'pending',
    now: Date,
  ): Promise<{ id: string } | DuplicateKey | 'role_not_found'>;

  findAliveInCompany(companyId: string, id: string): Promise<UserAdminDetail | null>;
  listAliveInCompany(
    companyId: string, excludeUserId: string, query: ListQuery,
  ): Promise<Page<UserAdminRow>>;
  updateAliveInCompany(
    companyId: string, id: string, data: NewUser, now: Date,
  ): Promise<'ok' | 'not_found' | DuplicateKey | 'role_not_found'>;

  /** Las TRES operaciones guardadas (§ 9) viven detras de este metodo unico y transaccional. */
  applyGuardedChange(input: GuardedChange): Promise<GuardedOutcome>;
}
```

- **`create` no recibe ni escribe autor del cambio de estado** (R49, decisión 18): la fila nace con
  `account_status` en `pending`, `account_status_changed_at` en el instante de la creación y
  `account_status_changed_by` **sin escribir**, que es el `NULL` de QC-65 R10 y lo mismo que hace el
  seed (`seed-initial-access.ts`, comentario de `createInitialAdmin`). El único método que escribe
  autor es el de mover el estado, dentro de `applyGuardedChange` (R25). Que el puerto **no tenga**
  parámetro de autor en `create` es lo que impide que alguien lo rellene con el actor por reflejo.
- **`…AliveInCompany` en el nombre no es adorno**: los filtros `deleted_at IS NULL` (R34) y
  `company_id = ?` (R33) son **del puerto**, no del dominio, así que ningún caso de uso puede
  olvidarlos. `excludeUserId` es obligatorio por la misma razón (R35): como parámetro opcional, un
  llamante nuevo se olvidaría y el actor reaparecería en su propio listado.
- **Resultados discriminados, nunca excepciones de Prisma.** El adaptador traduce `P2002` a la clave
  duplicada y `P2003`/`23503` a `'role_not_found'`. El dominio no ve ni un código de Postgres.
- **La unicidad se garantiza SOLO con los índices existentes, sin consulta previa** (R17): el puerto
  **no expone** ninguna búsqueda por correo, usuario o documento, así que la comprobación previa —que
  es una carrera— ni siquiera es expresable.
- **El borrado lógico es un `UPDATE` de `deleted_at`** (R37), nunca un `DELETE`: borrado físico en
  `users` está prohibido además por el `RESTRICT` de `users_account_status_changed_by_fkey` (QC-65
  R12).

---

## 8. El listado: firma exacta, orden y proyección (R27–R31, R36)

### 8.1 La firma es el contrato compartido de QC-57, no una propia

```ts
listUsers(actor: Actor, query: ListQuery): Promise<Page<UserRow>>
```

con `ListQuery = { page, pageSize?, sort: ListSort | null, filters, search }` y
`Page<T> = { items, total, page, pageSize, totalPages }`, **copiando verbatim**
`lib/modules/<m>/domain/list-query.ts` y `page.ts` a `identity`. Eso es lo que hace verdadera la
decisión 11 («la firma nace abierta a propósito, para que QC-67 no tenga que reabrirla»): es el mismo
contrato que emite la tabla de datos compartida de QC-55, así que la pantalla conecta sin traducir.

La lista blanca (`domain/user-queryable.ts`):

```ts
export const USER_QUERYABLE: ListQueryable = {
  sortable: ['lastNames', 'firstNames', 'username', 'email', 'accountStatus', 'createdAt'],
  filterable: { accountStatus: 'select' },   // R29: el filtro por estado, opcional
  searchable: true,                          // R28
};
```

- **`accountStatus` como filtro `select`** es exactamente la forma que la decisión 11 pide: opcional,
  multivalor, y lo que no se declara se **omite** sin romper la consulta (QC-57 R5).
- **`deletedAt` no está** en ninguna de las dos listas, y `NEVER_QUERYABLE` lo bloquea además por su
  cuenta: nadie puede pedir ver los borrados por la puerta del filtro (R34, R39).
- **La búsqueda cubre tres campos** —nombres/apellidos, correo y nombre de usuario (R28)—. El
  contrato compartido dice `searchable: boolean`; **qué columnas toca es del adaptador driven**, que
  es el único que conoce la base, igual que ya ocurre en los otros cinco módulos.

**Ripple declarado:** `tests/guards/guard-contrato-listados.test.ts` compara hoy **cinco** copias
idénticas del contrato y ancla el número. Con `identity` pasan a ser **seis**: la guardia gana una
entrada en su `MODULOS` y su texto «cinco» pasa a «seis». Es un séptimo archivo ajeno, de la misma
naturaleza que los seis de § 2, y se toca **en la misma tanda** (T7). La alternativa —una firma
propia y estrecha— está descartada en § 12.2.

### 8.2 Orden, defectos y desempate

- **Defecto 10, tope 25** (R27) con `lib/shared/pagination.ts` **tal cual**, consumido desde el
  **adaptador driven** (el dominio no puede importar `lib/shared/**`). Es el reparto de QC-20/QC-43,
  no el de `recetas`; el porqué está en § 12.4.
- **Orden por defecto: `last_names ASC, first_names ASC, id ASC`** (R30). El `id` **no es adorno**:
  dos personas pueden llamarse igual dentro de una empresa —nada lo prohíbe— y sin tercer criterio
  una fila puede salir en dos páginas o en ninguna. Cuando `sort` llega con una columna de la lista
  blanca, se aplica esa columna y **se conserva `id ASC` como último desempate**.
- `pageSize` devuelto es siempre el **efectivo** (pedir 100 da 25, no un error).

---

## 9. La guarda del «último administrador en `active`», sin condición de carrera (R22, R23)

### 9.1 Qué pide y qué no basta

Las tres operaciones guardadas —mover el estado, cambiar el rol, borrar— comparten la misma
invariante: **después** de escribir, la empresa tiene que conservar ≥ 1 usuario vivo, con rol
administrador y en `active`. Leer el conteo y después escribir **no vale** (R23): dos
administradores apagándose a la vez leen «somos dos», los dos se creen seguros y la empresa queda sin
ninguno. Es el caso que la decisión 9(b) nombra.

### 9.2 La decisión: **transacción + bloqueo de fila sobre el conjunto de administradores activos**

```
$transaction(isolation: default = READ COMMITTED) {
  1. SELECT "id" FROM "users"
     WHERE "company_id" = $companyId
       AND "role_id"    = (SELECT "id" FROM "roles" WHERE "name" = $adminRoleName)
       AND "account_status" = 'active'
       AND "deleted_at" IS NULL
     FOR UPDATE;                       -- bloquea las filas; un segundo intento ESPERA aqui
  2. calcular el conjunto que quedaria tras la escritura pedida
  3. si quedaria vacio -> abortar con 'last_administrator' (nada escrito)
  4. si no -> el UPDATE (estado / rol / deleted_at) y COMMIT
}
```

**Por qué esto y no otra cosa:**

- **`FOR UPDATE` sobre el conjunto, no un conteo suelto.** El bloqueo es lo que serializa: mientras
  T1 tiene bloqueadas las filas {A, B}, T2 **se queda esperando** en su propio `SELECT … FOR UPDATE`;
  cuando T1 confirma, T2 **re-lee** y ve solo {B}, calcula que quedaría vacío y aborta. Sin el
  `FOR UPDATE`, las dos leerían {A, B} en paralelo y las dos escribirían.
- **No hace falta `SERIALIZABLE`.** El único fenómeno peligroso aquí es el *write skew* sobre filas
  **existentes**, y el bloqueo explícito lo cubre en `READ COMMITTED` sin pagar el precio de los
  reintentos por `40001` (que obligarían a un bucle de reintento en el adaptador, código nuevo y
  difícil de probar).
- **Un `INSERT` concurrente de un administrador nuevo no queda bloqueado, y da igual**: solo puede
  **añadir** administradores activos, nunca quitarlos, así que no puede violar la invariante.
- **Una restricción de base NO puede expresarlo.** `CHECK` es por fila y no puede contar otras filas;
  un índice único expresa «a lo sumo uno», no «al menos uno»; «al menos uno por empresa» solo se
  escribiría con un **trigger** o con un contador materializado en `companies`, y las dos cosas son
  objetos de esquema nuevos que R43 prohíbe y que además meterían lógica de negocio en la base, fuera
  del service, justo donde `docs/architecture.md > Acceso a datos y autorizacion` dice que no vive.
- **La decisión, en una línea: transacción + bloqueo de fila, sin restricción de base y sin
  `SERIALIZABLE`.**

### 9.3 Dónde vive cada mitad

- **El service decide** (decisión 9: «las dos, en el service y con su test»): los tres casos de uso
  comprueban R21 —objetivo ≠ actor— y piden la escritura al puerto.
- **La atomicidad es del adaptador**, porque una transacción es un detalle de persistencia: el
  método único `applyGuardedChange` recibe qué cambio se pide y devuelve
  `'ok' | 'not_found' | 'last_administrator'`. El dominio traduce ese resultado a su error; **nunca
  ve una transacción**.
- **Un método y no tres** a propósito: las tres operaciones comparten la invariante, y tres copias
  del bloqueo serían tres sitios donde olvidarlo.
- **`ROLE_ADMINISTRADOR` se importa** (R24); el nombre del rol viaja al adaptador como argumento,
  resuelto desde la constante. Ningún literal nuevo.
- **Test de R23, de integración y real**: dos transacciones concurrentes contra Postgres sobre dos
  administradores activos de la misma empresa; se afirma que **una falla** y que el conteo final es
  ≥ 1. Un test con dobles no puede demostrar esto y no se acepta como prueba.

---

## 10. Las seis Server Actions (R40, R41)

`adapters/driving/user-actions.ts`, con `'use server'`:

- **Mutaciones (`create`, `update`, `delete`, `setAccountStatus`) reciben `FormData`**, porque salen
  de un formulario; **consultas (`get`, `list`) reciben argumentos ya tipados**, porque nadie las
  llama desde un `<form>`.
- **La acción no decide nada**: resuelve el actor (§ 5.2), traduce entrada y traduce resultado. Ni una
  regla de negocio, ni una segunda comprobación de permiso.
- **Ningún route handler y ningún `fetch` a ruta propia** (`docs/architecture.md > Server Actions vs
  Route Handlers`).
- **`revalidatePath` no se llama aquí**: no hay ninguna ruta que revalidar todavía (R46), y adivinar
  la de QC-67 sería inventarla.
- Los adaptadores driving **no pasan por el barrel** (`index.ts`); QC-67 los importará por su ruta
  exacta.

---

## 11. Punto de composición (R42)

`lib/composition/index.ts` — **el único sitio donde se cablea**— gana, **sin reordenar ni reformatear
nada de lo que hay** (hay otras sesiones tocando este archivo):

```ts
const userAdminRepository: UserAdminRepository = { /* create, findAliveInCompany, listAliveInCompany,
                                                      updateAliveInCompany, applyGuardedChange */ };
const initialCredentialFactory: InitialCredentialFactory = {
  createCredentialHash: () => createRandomCredentialHash({ hasher: passwordHasher, checkCredentialPolicy }),
};

export const identity = {
  ...,                                   // lo que ya hay, intacto
  createUser: createCreateUser({ users: userAdminRepository, credentials: initialCredentialFactory }),
  getUser:    createGetUser({ users: userAdminRepository }),
  listUsers:  createListUsers({ users: userAdminRepository }),
  updateUser: createUpdateUser({ users: userAdminRepository }),
  deleteUser: createDeleteUser({ users: userAdminRepository }),
  setUserAccountStatus: createSetUserAccountStatus({ users: userAdminRepository }),
} as const;
```

`passwordHasher` y `checkCredentialPolicy` **ya están construidos en ese archivo** (QC-5 y QC-19): se
**reutilizan las constantes existentes**, no se crean segundas —dos cableados del hasher serían dos
costes de bcrypt que pueden divergir—.

---

## 12. Alternativas descartadas

### 12.1 Un módulo nuevo `lib/modules/usuarios/` — descartada

Es lo que el nombre del permiso sugiere y lo que la decisión 2 obliga a mirar de frente. Se descarta:
`User` es un modelo **de `identity`** en `db/schema.prisma` (`/// @module identity`), y
`tests/guards/guard-arquitectura-modulos.test.ts` prohíbe que el adaptador driven de un módulo
consulte `prisma.user` si no es el propietario declarado. Mudar la propiedad del modelo arrastraría
el login, la sesión, el seed y QC-78 —que está `in_progress` sobre esos mismos archivos—. La
decisión 2 eligió la salida barata y honesta: el **permiso** se llama `usuarios` porque lo lee una
persona, el **código** sigue en `identity`, y la enmienda a QC-74 R1 queda escrita (R12).

### 12.2 Una firma de listado propia y estrecha (`{ page, pageSize, search, accountStatus }`) — descartada

Es más pequeña y se escribe en diez minutos. Se descarta por la **decisión 11**, que cita
explícitamente la lección QC-38 → QC-39: el listado cerrado costó una ficha entera. Con el contrato
de QC-57 compartido, añadir un campo consultable es una línea en la lista blanca y **no cambia la
forma de la consulta** (R36), y la tabla de datos de QC-55 conecta sin traducción. El precio, dicho
entero: una **sexta copia** del contrato y una entrada más en
`tests/guards/guard-contrato-listados.test.ts` (§ 8.1). Se acepta porque la guardia es precisamente
lo que impide que las copias divergan.

### 12.3 Generar la contraseña en el dominio y hashearla después — descartada

Lo natural: una función pura que devuelve la cadena, y el caso de uso la hashea. Se descarta por R16:
deja la credencial en claro viva dentro del caso de uso, donde un `console.log` de depuración, un
mensaje de error con contexto o un `return` descuidado la filtran, y donde «devolverla una sola vez»
—lo que la **decisión 7 descartó**— pasa a estar a dos líneas. Además el dominio **no puede importar
`node:crypto`** (no es un paquete puro), así que haría falta un puerto igualmente: el puerto que
devuelve el hash cuesta lo mismo y cierra la puerta. § 4.1.

### 12.4 Inyectar la paginación en el caso de uso, como hace `recetas` — descartada

Legítima y con una ventaja real (hace testeables el defecto y el tope en unitario). Se descarta por
los mismos tres motivos que QC-43 § 12.6: el defecto y el tope ya tienen su test en
`tests/unit/pagination.test.ts`, la decisión 11 dice «10/25» refiriéndose al de `lib/shared`, y añade
claves al `deps` sin que ningún requisito lo pida.

### 12.5 Un `CHECK`, un índice o un trigger que garantice «al menos un administrador activo» — descartada

Sería la garantía más fuerte y no depende de que nadie se acuerde. No se puede: `CHECK` es por fila,
un índice único expresa «a lo sumo uno» y no «al menos uno», y la única forma real —trigger o
contador materializado— es un **objeto de esquema nuevo** que R43 prohíbe y que movería la regla de
negocio de la empresa fuera del service. § 9.2.

### 12.6 Seed sin migración, como hizo QC-38 — descartada por la decisión 16

Habría sido cero SQL. La descarta el humano (decisión 16) y el diseño coincide: `db:seed` es un
script **manual**, así que sobre una instalación ya en marcha el `Administrador` se quedaría sin los
dos permisos nuevos y la pantalla de QC-67 sería inaccesible para todo el mundo. § 3.1.

### 12.7 Devolver la contraseña generada una sola vez al administrador — descartada por el humano

Consta para que no se reconsidere: **decisión 6 y 7**. Dejaría una contraseña conocida por dos
personas, y el acceso lo da QC-79 con su enlace. Es también la razón de la forma del puerto (§ 4.1).

### 12.8 Una operación de recuperar un usuario borrado — descartada por el humano

**Decisión 3.** Choca además con la 4: el correo, el nombre de usuario y el documento quedan libres al
borrar, así que otra persona puede haberlos tomado y «restaurar» fallaría con un duplicado
incomprensible. Mismo razonamiento que QC-43 D6.

---

## 13. Dependencias de terceros (R47)

**Ninguna dependencia nueva, y ninguna propuesta que abrir.** Todo lo que este diseño necesita está
instalado y registrado en `docs/dependencias.md`: `zod` (borde), `bcrypt` (hash, desde QC-5),
`@prisma/client` (persistencia y la transacción de § 9), `vitest`. La generación al azar sale de
**`node:crypto`**, que es el runtime y no una dependencia. La paginación ya está escrita en
`lib/shared/pagination.ts` y la composición del nombre mostrable en `domain/display-name.ts`.

Los cuatro checks de `docs/architecture.md > Dependencias de terceros` **no llegan a evaluarse**
porque no se propone ninguna librería. Dos candidatas que podrían parecerlo y no lo son:

| Candidata | Qué haría | Por qué no entra |
| --- | --- | --- |
| `generate-password`, `nanoid`, `secure-random-password` | Generar la credencial inicial | `randomInt` de `node:crypto` ya da enteros sin sesgo de módulo, y la garantía que importa —cumplir la política de QC-19— la da la **verificación contra la política propia** (§ 4.2), que ninguna librería conoce. Sería una dependencia para ahorrar ~15 líneas y añadir una superficie nueva al código que produce credenciales. |
| `libphonenumber-js`, `validator` | Validar teléfono y correo | **Aquí no se valida ningún formato** (§ 6.1): el modelo no lo hace hoy y añadirlo sería reabrir QC-47 por la puerta de atrás. |

Si durante la implementación apareciera la tentación de instalar algo, **se para y se propone**, no
se instala (regla 7 de `CLAUDE.md`); `tests/guards/guard-dependencias-aprobadas.test.ts` lo pondría en
rojo igualmente. **Nada de esto cambia sin aprobación humana** (decisión 17).

---

## 14. Cómo se verifica

**Sin E2E, y con motivo** (decisión 17, R46): esta ficha es backend puro y no aporta ningún flujo
navegable; Playwright no tendría pantalla que abrir. Lo trae **QC-67**, igual que QC-44 lo trajo para
QC-43. **El diferimiento se declara aquí, no al final.**

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Unit (dominio) | `tests/unit/identity/usuarios/authorization.test.ts` | R1–R5: los seis casos de uso rechazan al actor sin el código **sin tocar ningún puerto** (dobles que lanzan si los llaman), `modificar` no concede `consultar` ni al revés, y el rol del actor no participa. |
| Unit (dominio) | `tests/unit/identity/usuarios/user-service.test.ts` | R13, R14, R17, R18, R19, R20, R25, R26, R33, R34, R35, R37, R39, **R49** con dobles del puerto (el alta no pasa ningún autor de estado; mover el estado sí). |
| Unit (dominio) | `tests/unit/identity/usuarios/admin-guards.test.ts` | R21, R22, R24: las dos guardas y el rechazo de las tres operaciones sobre uno mismo. |
| Unit (borde) | `tests/unit/identity/usuarios/user-input.test.ts` | R14, R18, R20: los esquemas `zod`, y que **no admiten** empresa, contraseña, estado ni contadores. |
| Unit (dominio) | `tests/unit/identity/usuarios/credential-factory.test.ts` | R15, R16: 1.000 credenciales generadas cumplen `evaluateCredentialRules`; el puerto devuelve un hash y **no** la candidata. |
| Unit (driving) | `tests/unit/identity/usuarios/user-actions.test.ts` | R6, R40, R41: `FormData` en las cuatro mutaciones, actor de las dos caras de la sesión, traducción por `code`, y que el estado serializado **no contiene** ningún hash ni credencial. |
| Unit (estático) | `tests/unit/identity/schema/user-permissions-migration.test.ts` | R8, R11, R43, R44: el SQL compara los dos códigos y descripciones contra `PERMISSIONS` **importado** y el nombre del rol contra `ROLE_ADMINISTRADOR`; que el UP **no contiene** ningún `ALTER`/`CREATE`/`DROP`; que el `down.sql` borra las asignaciones **antes** del permiso. Con tests de sensibilidad: quitar el `ON CONFLICT`, invertir el orden del `down.sql`. |
| Unit (alcance) | `tests/unit/identity/usuarios/scope.test.ts` | R38, R43, R45, R46, R47: cero diff en `db/schema.prisma`, ninguna migración que toque los tres índices únicos, ninguna mención a `failed_login_attempts`/`lock_level`/`locked_until` en los archivos de la feature, nada bajo `app/`/`components/`/`e2e/`, ningún `console.*` en el adaptador de credencial, y `package.json` sin dependencias nuevas. |
| Integración | `tests/integration/identity/user-crud.int.test.ts` | R13, R17, R27, R28, R29, R30, R31, R33, R34, R35, R37, R38 contra Postgres real, incluido que **el borrado libera** correo, usuario y documento y que **R49** se
cumple: tras el alta, `account_status_changed_by` es `NULL` en la fila. |
| Integración | `tests/integration/identity/last-administrator.int.test.ts` | **R23**: dos transacciones concurrentes, una falla, la empresa conserva ≥ 1 administrador en `active`. |
| Ciclo real | task T12 | R44 en su forma real: `db:migrate` → `db:rollback` → `db:migrate`, con la salida pegada en la bitácora. |
| Ajenos (se actualizan) | los **seis** de § 2 + `guard-contrato-listados.test.ts` | R48, R8, R9, R12, R36. |
| Guardia (ya existe) | `guard-arquitectura-modulos.test.ts`, `guard-password-never-plaintext.test.ts`, `guard-rls-force.test.ts`, `guard-dependencias-aprobadas.test.ts`, `guard-permisos-sembrados.test.ts` | R42, R16, R7, R47, R9. |

El mapa completo `R<n> → test` está en `tasks.md > Trazabilidad`.

**Cinco avisos para el implementer**, todos aprendidos en fichas anteriores:

- **Los tres duplicados se traducen por COLUMNA, no por nombre de índice** (§ 6.4): es el defecto real
  que QC-38 solo vio con integración.
- **Se afirma sobre el SQLSTATE** (`23505`, `23503`), nunca sobre el texto del mensaje: en esta
  máquina Postgres responde en español.
- **El test de R2 tiene que demostrar que no se llega al repositorio**: doble que registra la llamada
  y `expect(...).not.toHaveBeenCalled()`. Un doble permisivo dejaría pasar una autorización puesta
  después de la consulta.
- **Un test de RLS escrito con Prisma sale verde pase lo que pase** (se conecta como dueño). No se
  escribe: R7 lo cierra la guardia estática.
- **El test de concurrencia necesita dos conexiones de verdad**, no dos promesas sobre la misma
  transacción; y el `beforeAll` debe fallar con un mensaje claro («corre `pnpm run db:migrate`») si
  faltan los dos permisos.

---

## 15. Preguntas abiertas que deja este diseño

Las cuatro de `requirements.md` no se repiten aquí. **P1** y **P2** las hereda el diseño **sin
resolverlas**: ninguna bloquea la implementación —P1 es orden de trabajo entre fichas, P2 es
invalidación de sesión y vive en QC-23/QC-78— y ninguna cambia un archivo de esta feature. **P3**
(editarse a sí mismo) la **abre este spec** y sigue abierta: es un caso de test y una línea, y se deja
sin supuesto (regla 6 de `CLAUDE.md`).

**P4 quedó CERRADA el 2026-09-10 al aprobar el spec (F1.4)**: al crear un usuario,
`account_status_changed_by` **queda vacío** —el `NULL` de QC-65 R10, «lo cambió el sistema, no una
persona»— y el autor se escribe **solo al mover** el estado después. Es la **fila 18** de la tabla de
decisiones y la escribe **R49**; el efecto en este diseño está en § 7.

Una más, propia y menor: **el listado no ofrece filtro por rol**. La decisión 11 enumera búsqueda y
filtro por estado, y nada más; añadirlo después es una línea en `USER_QUERYABLE` y no cambia la firma
(R36), que es precisamente para lo que se eligió el contrato abierto.
