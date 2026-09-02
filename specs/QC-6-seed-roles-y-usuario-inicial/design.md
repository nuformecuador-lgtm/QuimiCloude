# design.md — QC-6: seed-roles-y-usuario-inicial

Cubre `requirements.md` R1-R21. Tres entregables, no uno: **(a)** una migracion aditiva con su
`down.sql`, **(b)** el seed idempotente, **(c)** el enganche que lo corre en cada despliegue.

## 1. Estado de partida (verificado en el repo, no supuesto)

- `db/schema.prisma` tiene `DocumentType`, `Role` y `User`, los tres con `/// @module identity`.
  `users` tiene 14 columnas; **no** hay ninguna marca de cambio de contrasena.
- Las tres unicidades de `users` (`users_email_unique`, `users_username_unique`,
  `users_document_unique`) **no** son `@unique` de Prisma: son indices **funcionales**
  (`lower(...)`) y **parciales** (`WHERE deleted_at IS NULL`) escritos a mano en
  `db/migrations/20260806122638_users_and_roles/migration.sql`. Consecuencia directa para esta
  ficha: **`prisma.user.upsert` no es aplicable** — `upsert` exige un `where` unico que Prisma
  conozca, y ni `email` ni `username` lo son en el cliente generado (§5.2).
- `roles.name` **si** es `@unique` (`roles_name_key`), sensible a mayusculas.
- La migracion de QC-4 ya inserta `('CC', 'Cedula de ciudadania')`. Esta ficha no la toca (R17).
- `lib/modules/identity/ports/password-hasher.ts` declara `hash(plaintext): Promise<string>` y
  `verify(plaintext, storedHash): Promise<boolean>`. `lib/composition/index.ts` lo cablea a
  bcryptjs (coste 10) y expone `identity.passwordHasher`.
- **Limite heredado de bcrypt:** `createPasswordHash` lanza si la entrada supera **72 bytes
  UTF-8**, sin incluir el valor en el mensaje. Una `SEED_ADMIN_PASSWORD` mas larga hace fallar
  el seed con un error claro; es el comportamiento correcto (R13/R18), no un caso a esconder.
- `tests/integration/identity/identity-constraints.int.test.ts` ya establece el patron de test
  contra base real: transaccion interactiva de Prisma que termina en `ROLLBACK`.
- `scripts/db-rollback.ts` deja escrito que **`tsx` no carga `.env`**: hay que llamar a
  `process.loadEnvFile()` explicitamente. Vale igual para el script del seed.
- No hay `vercel.json` ni ningun hook de despliegue en el repo: el enganche de §7 se crea aqui.
- No existe carpeta `tests/unit/identity/seed/` ni ningun archivo de seed. Se parte de cero.

## 2. La restriccion que decide medio diseno: la guardia anti-texto-plano

`tests/guards/guard-password-never-plaintext.test.ts` barre `db/`, `lib/`, `app/` y `scripts/`
y **falla si en posicion de declaracion** (columna SQL, campo Prisma, clave de objeto,
`const`/`let`/`function`, asignacion a propiedad) aparece un identificador cuyos segmentos
incluyan `password`, `pass`, `contrasena` o `contraseña` y **no** termine en `hash` (ni en uno
de los sufijos que denotan «no es un dato guardado»: `route`, `id`, `error`, `label`, `field`,
`hasher`…).

Tres consecuencias que hay que aceptar **antes** de escribir codigo:

1. **La columna nueva no puede llamarse `must_change_password`.** `must_change_password` →
   segmentos `must`,`change`,`password`; el ultimo es `password` → hallazgo. Tampoco vale
   `password_change_required` (contiene `password` y no termina en `hash`). El nombre elegido
   es **`must_change_credential`** / campo Prisma `mustChangeCredential` (§3).
2. **Ningun identificador del seed puede llamarse `SEED_ADMIN_PASSWORD`, `password`, `pass` ni
   derivados.** Los nombres de las variables de entorno se escriben **solo como cadenas
   literales en posicion de valor o de argumento** (`readRequiredEnv('SEED_ADMIN_PASSWORD')`,
   o elementos de un array), que la guardia no considera declaracion. El dato en memoria viaja
   en un campo llamado `credential` (§5.1).
3. **Se adapta el nombre, no la guardia.** Es el mismo precedente que fijo QC-7 al llamar
   `CREDENTIAL_MAX_LENGTH` a lo que iba a llamarse `PASSWORD_MAX_LENGTH`
   (`lib/modules/identity/domain/credentials.ts`). El coste es un nombre menos literal en la
   base; se paga con un comentario en el esquema y en la migracion diciendo, en castellano, que
   `must_change_credential` es «debe cambiar la contrasena la primera vez que entre».

## 3. Modelo de datos: la columna nueva

Una sola columna, en `users`:

| Columna | Tipo | Restricciones | Requisito |
| --- | --- | --- | --- |
| `must_change_credential` | `boolean` | `NOT NULL DEFAULT false` | R9, R10 |

En `db/schema.prisma`, dentro de `model User`:

```prisma
/// TRUE = esta persona tiene que cambiar su contrasena la primera vez que entre.
/// El nombre evita el segmento `password` a proposito (design.md > 2). Quien la LEE y
/// bloquea el acceso es QC-7; esta ficha solo la escribe.
mustChangeCredential Boolean @default(false) @map("must_change_credential")
```

Por que `NOT NULL DEFAULT false` y no `NULL`:

- **Aditiva de verdad.** `ADD COLUMN ... NOT NULL DEFAULT false` en Postgres >= 11 no reescribe
  la tabla (el default se guarda en el catalogo), asi que no hay bloqueo largo sobre `users`.
- **No hay tercer estado.** `NULL` obligaria a cada lector (QC-7) a decidir que significa
  «no se sabe», y ese es exactamente el hueco por el que se cuela un `if` invertido.
- **Las filas existentes quedan en «no obligado»** (R10): nadie que ya use el sistema se ve
  obligado a cambiar su contrasena por instalar esta migracion.

No hay tabla nueva → **no hay `ENABLE`/`FORCE ROW LEVEL SECURITY` que anadir**; `users` ya los
tiene de QC-4 y `tests/guards/guard-rls-force.test.ts` solo exige el par por cada `CREATE
TABLE`. No hay indice nuevo: nadie filtra por esta columna, se lee siempre junto al usuario ya
localizado por `username`.

## 4. Migracion

```
db/migrations/<timestamp>_user_must_change_credential/
  migration.sql   # UP  (generado con `pnpm run db:migrate:create`, revisado a mano)
  down.sql        # DOWN (manual: Prisma no lo genera)
```

`migration.sql`:

```sql
-- QC-6: marca de "debe cambiar la contrasena la primera vez que entre".
-- Aditiva: no toca ninguna columna, indice, restriccion ni fila existente.
ALTER TABLE "users" ADD COLUMN "must_change_credential" BOOLEAN NOT NULL DEFAULT false;
```

`down.sql`:

```sql
ALTER TABLE "users" DROP COLUMN IF EXISTS "must_change_credential";
```

**Revisar el SQL generado antes de aplicarlo, sin excepcion.** Prisma no conoce los tres
indices funcionales/parciales de `users` y `migrate dev` puede proponer eliminarlos por drift
(`specs/4-modelo-usuarios-y-roles/design.md > 4`). Si el `migration.sql` generado contiene un
solo `DROP INDEX`, se borra a mano y se deja unicamente el `ADD COLUMN`.

## 5. Donde vive el codigo (arquitectura hexagonal)

`users` y `roles` pertenecen al modulo `identity` (`/// @module identity`), asi que **solo un
adaptador driven de `identity` puede tocarlos con Prisma**. Reparto:

```
lib/modules/identity/
  domain/roles.ts                         # ROLE_ADMINISTRADOR, ROLE_OPERADOR, SEED_ROLES
  domain/seed-initial-access.ts           # el caso de uso: decide QUE falta y lo pide
  ports/initial-access-repository.ts      # puerto de lectura/escritura del seed
  ports/initial-access-credentials.ts     # puerto de credenciales (resolucion PEREZOSA)
  adapters/driven/persistence/initial-access-repository-prisma.ts
  adapters/driven/config/initial-access-credentials-env.ts   # lee las SEED_ADMIN_* (perezoso)
  index.ts                                # reexporta ROLE_* y seedInitialAccess
lib/composition/index.ts                  # cablea repositorio + hasher + credenciales
scripts/seed.ts                           # entrada ejecutable: pnpm run db:seed
```

- El **dominio** no importa Prisma ni `process.env`: recibe todo por puertos. Es lo que permite
  testearlo con dobles y sin base (R12, R13, R14, R15 en unitario).
- El **script** es una cascara: carga `.env`, llama a la composicion, imprime un resumen sin
  secretos y traduce el resultado a codigo de salida. `scripts/**` esta exento de la regla de
  dependencias (`docs/architecture.md > La regla de dependencias`), pero aqui no se aprovecha
  la exencion para meter logica: la logica esta en `domain/`.
- **Import relativo desde el script** (`../lib/composition`), no `@/lib/composition`: `tsx`
  resuelve los alias de `tsconfig` de forma que no esta verificada en este repo, y un seed que
  falla al arrancar en el despliegue es peor que un import feo. Si se comprueba que el alias
  funciona bajo `tsx`, se cambia; hasta entonces no se supone (regla 6 de `CLAUDE.md`).

### 5.1 Contratos

```ts
// domain/roles.ts
export const ROLE_ADMINISTRADOR = 'Administrador';
export const ROLE_OPERADOR = 'Operador';
export const SEED_ROLES = [
  { name: ROLE_ADMINISTRADOR, description: 'Acceso total al sistema.' },
  { name: ROLE_OPERADOR, description: 'Operacion del dia a dia.' },
] as const;

// ports/initial-access-credentials.ts
export interface InitialAdminCredentials {
  readonly username: string;
  readonly credential: string;   // contrasena en claro EN TRANSITO; nunca se persiste (R8)
  readonly email: string;
}
/** Se invoca SOLO si hay que crear el usuario inicial (R12). Lanza si falta algo (R13). */
export type InitialAdminCredentialsProvider = () => InitialAdminCredentials;

// ports/initial-access-repository.ts
export interface InitialAccessRepository {
  findRoleIdsByName(names: readonly string[]): Promise<ReadonlyMap<string, string>>;
  countLiveUsersWithRole(roleName: string): Promise<number>;
  createRole(role: { name: string; description: string }): Promise<string>;
  createInitialAdmin(input: {
    roleId: string;
    username: string;
    email: string;
    passwordHash: string;
  }): Promise<{ id: string }>;
}

// domain/seed-initial-access.ts
export interface SeedOutcome {
  readonly createdRoles: readonly string[];   // nombres creados en ESTA corrida
  readonly createdAdmin: boolean;
}
export function seedInitialAccess(deps: {
  repository: InitialAccessRepository;
  passwordHasher: PasswordHasher;
  credentials: InitialAdminCredentialsProvider;
}): Promise<SeedOutcome>;
```

`SeedOutcome` no es decoracion: es lo que permite que el test afirme **que encontro algo** en la
primera corrida (`createdRoles.length === 2`, `createdAdmin === true`) antes de afirmar que la
segunda no hizo nada. Un test que solo compare estados podria pasar en verde sobre una base
vacia y sin haber ejecutado nada.

### 5.2 Algoritmo, y por que no es un `upsert`

```
1. leer estado:  roles existentes por nombre  +  nº de usuarios vivos con rol Administrador
2. faltaAdmin = (nº == 0)
3. si faltaAdmin:  credentials()   -> lanza si falta una SEED_ADMIN_* (R13)
                   passwordHasher.hash(credential)   -> lanza si supera 72 bytes
   (los dos pasos ANTES de escribir nada: si fallan, no hay nada creado a medias)
4. crear los roles que falten (solo los que falten)
5. si faltaAdmin: crear el usuario con roleId del rol Administrador y
   must_change_credential = true
6. devolver SeedOutcome
```

Puntos que no son negociables y por que:

- **Nada de `upsert`.** Dos razones independientes: (1) para `users` no hay campo `@unique` que
  Prisma acepte en el `where` (§1); (2) aunque lo hubiera, `upsert` con `update: {}` **no es
  inocuo**: `updated_at` lleva `@updatedAt`, asi que Prisma emite el `UPDATE` igualmente y toca
  la marca de tiempo — violacion directa de R15. El patron es **leer y crear solo lo que
  falta**.
- **La existencia del usuario inicial se decide por «hay al menos un usuario vivo con rol
  Administrador», no por `SEED_ADMIN_USERNAME`.** Es la unica formulacion compatible con R12:
  comprobar por nombre de usuario obligaria a leer la variable siempre, que es justo lo que la
  decision del 2026-09-01 descarta. Y ademas es el criterio que responde a la pregunta real
  («¿la base es utilizable?»): si alguien renombro al administrador, no hay que crear otro.
- **Los roles se comprueban por nombre exacto**, que es lo que garantiza `roles_name_key`.
- **Carrera entre dos despliegues simultaneos:** el `INSERT` puede chocar contra
  `roles_name_key` o contra `users_username_unique`. El adaptador captura `P2002` y lo traduce
  a «ya existia», sin reintentar ni sobrescribir: el resultado sigue siendo «crear solo lo que
  falta». Es el unico `catch` del seed y no es vacio (`docs/conventions.md`).
- **Los pasos 4 y 5 corren dentro de una unica `prisma.$transaction`.** Si el alta del usuario
  falla, tampoco quedan los roles a medias (R13).
- **Marcadores del usuario inicial** (R7), fijos en `domain/`, evidentes a simple vista:
  `firstNames: 'Administrador'`, `lastNames: 'Inicial'`, `birthDate: 1900-01-01`,
  `phone: '+00 000 000 0000'`, `documentTypeCode: 'CC'` (via `DOCUMENT_TYPE_CC`, ya exportado
  por el barrel), `documentNumber: '00000000'`. Ninguno pretende ser un dato real; quien mire
  la fila tiene que ver que es de instalacion.

### 5.3 El adaptador y el aislamiento de los tests

`initial-access-repository-prisma.ts` exporta una **fabrica**:

```ts
export function createInitialAccessRepository(
  db: PrismaClient | Prisma.TransactionClient,
): InitialAccessRepository;
```

No es una floritura: es lo que permite que el test de integracion corra el seed **dos veces
dentro de una transaccion con `ROLLBACK`**, igual que hace
`identity-constraints.int.test.ts`, sin dejar basura en la base ni depender del orden de los
tests. `lib/composition/index.ts` la invoca con el `prisma` compartido.

## 6. Contrato de entorno

| Variable | Obligatoria | Cuando se lee |
| --- | --- | --- |
| `SEED_ADMIN_USERNAME` | solo si hay que crear el usuario inicial | paso 3 del algoritmo |
| `SEED_ADMIN_PASSWORD` | idem | idem |
| `SEED_ADMIN_EMAIL` | idem | idem |

- Se anaden a `.env.example` **sin valores** (R6), con el comentario de que solo hacen falta en
  un entorno nuevo.
- Vacia o con solo espacios cuenta como ausente (R13).
- El error nombra **la variable**, nunca su valor (R18): `falta SEED_ADMIN_PASSWORD` es
  aceptable; imprimir lo que valia, no.
- Ningun `console.log` del seed incluye la credencial: el resumen que imprime es
  `roles creados: 2 · usuario inicial: creado` o `nada que crear`.

## 7. Enganche al despliegue (R19, R20)

**Decision: el seed corre en el pipeline de despliegue de Vercel, encadenado en el script
`build` de `package.json`, detras de las migraciones y delante del build de Next.**

```json
"build": "prisma migrate deploy && tsx scripts/seed.ts && next build",
"db:seed": "tsx scripts/seed.ts"
```

- **Automatico, sin que nadie lo lance** (R19): es el comando que Vercel ya ejecuta en cada
  despliegue. No hay nada que recordar.
- **Falla visible** (R20): `&&` corta la cadena; si el seed sale con codigo != 0, el build
  falla y **la version nueva no se publica**. Es mas estricto que «tras el despliegue»: la base
  queda lista *antes* de que el codigo nuevo reciba trafico, nunca despues.
- `db:seed` queda ademas como comando suelto para el entorno local y para el test manual.

**Coste aceptado, dicho en voz alta:** el build pasa a necesitar la base accesible y las
variables de entorno del proyecto Vercel. Un fallo de red hacia Postgres tumba el build. A
cambio no existe la ventana en la que la app nueva esta viva sobre una base sin roles. Y es la
misma dependencia que ya introduce `prisma migrate deploy`, que tiene que estar ahi de todos
modos.

### Alternativas descartadas

**A. Un route handler `app/api/seed/route.ts` disparado por un Vercel Deploy Hook o un cron —
DESCARTADA.** Es el «después del despliegue» literal, y por eso tienta. Se descarta porque
convierte una tarea de instalacion en **superficie HTTP publica**: habria que inventar un
secreto de cabecera, validarlo, protegerlo del replay y aceptar que un endpoint capaz de crear
un administrador queda expuesto a internet para siempre. Ademas el disparo es asincrono y
best-effort: si falla, el despliegue **ya esta publicado** y nadie se entera — R20 no se
cumpliria. Un `&&` en el build da la misma automatizacion con cero superficie de ataque.

**B. `postinstall` de npm/pnpm — DESCARTADA.** Corre tambien en `pnpm install` local y en CI,
donde no hay base ni variables, asi que o rompe el flujo de todos los dias o se llena de `if`
que lo apagan; y un check que se salta solo es exactamente el anti-patron de
`docs/verification.md > La validacion opcional`.

**C. `prisma db seed` (bloque `prisma.seed` en `package.json`) — DESCARTADA como enganche**,
aunque es el mecanismo «oficial». Solo lo invocan `prisma migrate reset` y `prisma db seed` a
mano; **`prisma migrate deploy` no lo ejecuta**, que es justo el comando del despliegue. O sea
que no cumple R19 por si solo y habria que anadir igualmente la llamada explicita. Declararlo
ademas duplicaria el punto de entrada.

**D. Un `INSERT` dentro de una migracion — DESCARTADA.** Es lo que hizo QC-4 con `CC`, y ahi
era correcto porque el valor es parte de la definicion del esquema. Aqui no vale: (1) la
contrasena tiene que pasar por el `PasswordHasher`, que es TypeScript, no SQL; (2) una
migracion se ejecuta **una sola vez** en la vida de una base — si alguien borra al
administrador, no se regenera nunca; (3) meteria credenciales de entorno en un archivo
versionado. El seed es idempotente y repetible; una migracion, no.

## 8. Alternativas descartadas en el propio seed

**E. `prisma.role.upsert` / `prisma.user.upsert` — DESCARTADA.** Razonado en §5.2: no hay
`@unique` utilizable en `users`, y en `roles` el `update: {}` seguiria tocando `updated_at` por
`@updatedAt`, rompiendo R15. Se paga con dos consultas de lectura previas, que sobre un
catalogo de dos filas no cuesta nada.

**F. `INSERT ... ON CONFLICT DO NOTHING` en SQL crudo — DESCARTADA.** Resolveria la carrera de
forma atomica y sin `catch`. Se descarta porque para `users` el conflicto real esta en indices
**parciales** (`WHERE deleted_at IS NULL`), asi que el `ON CONFLICT` tendria que nombrar la
expresion del indice completa (`(lower(username)) WHERE deleted_at IS NULL`) — SQL fragil que
se rompe en silencio si alguien toca el indice, y que ademas saltaria la validacion de tipos.
La lectura previa + `catch` de `P2002` es explicita y testeable.

**G. Que el seed «repare» divergencias (reponer la descripcion del rol, resetear la contrasena
del admin) — DESCARTADA.** Es lo que hace un seed declarativo tipo «estado deseado», y suena
mas robusto. Contradice frontalmente la decision del 2026-09-01 («en la segunda corrida gana lo
que ya esta en la base»): un seed que corre en **cada** despliegue y repone valores machacaria
la contrasena que el administrador acaba de cambiar, en cada despliegue, para siempre.

**H. Un usuario inicial con credenciales fijas conocidas (`admin`/`admin`) — DESCARTADA.** Es
el patron mas comun en instaladores y el motivo de una cantidad enorme de intrusiones: queda
escrito en el repo (viola R6) y sobrevive en produccion porque nadie lo cambia. Las variables
de entorno mas la marca `must_change_credential` cubren el mismo caso sin ese agujero.

## 9. Rutas, endpoints y contratos publicos

**Ninguna ruta, ningun endpoint, ninguna Server Action.** El unico consumidor es el script
`scripts/seed.ts`. El contrato publico que esta ficha anade al barrel de `identity` es
`ROLE_ADMINISTRADOR`, `ROLE_OPERADOR` y `seedInitialAccess`, mas el campo
`mustChangeCredential` en el tipo `User` generado por Prisma — que es lo que QC-7 va a leer.
Nada de esto arrastra servidor al cliente: son constantes y una funcion pura sobre puertos.

**Contrato hacia QC-7:** `must_change_credential = true` significa «no dejes entrar a esta
persona a ninguna pantalla que no sea la de cambio de contrasena». Esta ficha **no** lo hace
cumplir; si QC-7 no lo lee, la marca no protege de nada.

## 10. Dependencias de terceros

**Ninguna dependencia nueva** (R21). El seed usa Prisma (`@prisma/client`), el `PasswordHasher`
ya cableado (bcryptjs) y `tsx`, los tres ya en `package.json` y en `docs/dependencias.md`. No
hace falta un cargador de `.env`: Node ya expone `process.loadEnvFile()`, que es lo que usa
`scripts/db-rollback.ts`. Por tanto no hay que ejecutar los cuatro checks de
`docs/architecture.md > Dependencias de terceros` ni anadir ninguna fila al registro.

## 11. Verificacion

Cinco frentes. El detalle por task esta en `tasks.md`; aqui va el criterio.

1. **Estatico sobre el esquema y el SQL** — la columna existe con su `@map`, su `@default(false)`
   y su `NOT NULL DEFAULT false`; el `down.sql` la elimina y **no** contiene ningun `DROP TABLE`
   ni `DROP INDEX` (R10, R11).
2. **Unitario del dominio con dobles** — cubre R2, R3, R4, R7, R8, R9, R12, R13, R14, R15, R17
   sin tocar base: repositorio falso que registra las llamadas recibidas. Aqui se comprueba lo
   que un test contra base no ve bien: que el proveedor de credenciales **no se invoco** cuando
   el admin ya existe (R12), y que ante credenciales incompletas **no se llamo a ningun metodo
   de escritura** (R13).
3. **Integracion contra base real: la doble corrida** — R16, y confirmacion de R14/R15. Es el
   requisito central de la ficha y **no se da por bueno en prosa**.
4. **Guardias** — `pnpm run test:guardias` tiene que seguir verde con el codigo nuevo dentro de
   `lib/` y `scripts/`; es la comprobacion de §2 y de R8/R18.
5. **Ciclo real de migracion** — `db:migrate` → comprobar la columna → `db:rollback` →
   comprobar que desaparece y que `users` conserva sus tres indices unicos → `db:migrate` otra
   vez (R11).

**La trampa que este repo ya piso dos veces** (`docs/verification.md > Que NO cuenta`): una
comprobacion que no comprueba nada. Reglas para estos tests, en concreto:

- Antes de afirmar «la segunda corrida no cambio nada», el test **afirma que la primera creo
  algo**: `outcome.createdRoles` tiene 2 nombres y `createdAdmin` es `true`, y la consulta
  posterior devuelve 2 roles y 1 usuario. Sin eso, una base vacia con un seed roto pasaria.
- La comparacion de la segunda corrida es sobre **la fila entera releida** (incluidos `id`,
  `password_hash`, `updated_at` y `must_change_credential`), no sobre un conteo.
- El test del hash **no compara textos**: llama a `identity.passwordHasher.verify(credencial,
  storedHash)` y exige `true`, y ademas exige que `storedHash !== credencial`. Comparar cadenas
  seria el error de «comparar texto en vez del valor resuelto».
- El caso de R15 **modifica a mano** el usuario ya creado (otro `password_hash`,
  `must_change_credential = false`) y solo entonces vuelve a correr el seed: si el seed
  reescribiera, este test cae.

**No hay E2E** y esta diferido con motivo por decision del 2026-09-01: el seed no tiene
interfaz. El E2E de autenticacion entra con QC-7.

## 12. Preguntas abiertas

La unica es la que ya recoge `requirements.md > Preguntas abiertas`: **que reglas debe cumplir
una contrasena aceptable**. Hoy de `SEED_ADMIN_PASSWORD` solo se exige que exista y que quepa
en el limite de 72 bytes de bcrypt (§1). **No bloquea**: cuando esa politica exista, aplicarla
es anadir una validacion en el paso 3 del algoritmo (§5.2), antes de escribir nada.
