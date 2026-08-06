# design.md — Feature 1: modelo-usuarios-y-roles

## 1. Estado de partida (verificado en el repo, no supuesto)

- No existe `db/schema.prisma` ni ninguna carpeta `db/`. **No hay ningun modelo Prisma
  todavia**: esta feature crea el esquema desde cero y fija la convencion.
- `package.json` no tiene `prisma`, `@prisma/client`, `zod` ni `vitest`, y solo declara los
  scripts `dev`, `build`, `start`, `lint`, `typecheck`. No hay `test`, `test:rapido`,
  `test:guardias`, `db:migrate*` ni `db:rollback`.
- **Actualizado 2026-08-06:** el repo ya tiene `.env` con `DATABASE_URL` en la raiz del
  worktree principal. La feature **no tiene bloqueo de infraestructura**. Aviso operativo,
  no de diseno: `.env` esta git-ignorado y **los worktrees no lo heredan**, asi que el
  implementer tiene que asegurarse de que exista dentro de
  `.worktrees/1-modelo-usuarios-y-roles/` antes de correr nada de `db:*` (ver T0 en
  `tasks.md`). Ningun archivo de esta spec contiene ni debe contener la cadena de conexion.
- `tsconfig.json` tiene `strict: true` y alias `@/*` → raiz.
- `docs/architecture.md` fija: schema en `db/schema.prisma` (no `prisma/`), migraciones en
  `db/migrations/<timestamp>_<nombre>/` con `migration.sql` (UP, generado) y `down.sql`
  (DOWN, manual), Prisma como unico camino de datos, RLS + `FORCE` en tablas nuevas.

## 2. Modelo de datos

Tres tablas. Nombres e identificadores (tablas, columnas, indices, restricciones) en
**ingles**, `snake_case` — decidido por el humano el 2026-08-06. Todo texto es `text`; no se
usan `varchar(n)` arbitrarios.

### 2.1 `document_types` — catalogo del conjunto cerrado

| Columna | Tipo | Restricciones | Por que |
| --- | --- | --- | --- |
| `code` | `text` | PK | Clave natural corta y estable (`CC`). Se lee sin join desde `users`. |
| `name` | `text` | NOT NULL | Etiqueta legible ("Cedula de ciudadania"). |
| `is_active` | `boolean` | NOT NULL DEFAULT `true` | Permite retirar un tipo del conjunto admitido **sin borrar filas** que ya lo referencian. |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `@updatedAt` | |

`document_types` **no** lleva `deleted_at`: un tipo de documento no se borra, se desactiva, y
`is_active` ya dice exactamente eso. Meter las dos columnas seria tener dos formas de
expresar el mismo estado y que alguien las deje incoherentes.

Fila inicial: `('CC', 'Cedula de ciudadania', true)` — cubre **R9**. Se inserta en el
`migration.sql` de esta feature y se borra en su `down.sql`: **no es seed de negocio**, es la
definicion del conjunto cerrado, que en este diseno vive como datos. El seed de la feature 3
sigue siendo el de roles y usuario inicial y no toca esta tabla.

### 2.2 `roles`

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| `id` | `uuid` | PK, DEFAULT `gen_random_uuid()` |
| `name` | `text` | NOT NULL, UNIQUE (`roles_name_key`) → **R14** |
| `description` | `text` | NOT NULL → **R13** |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` |
| `updated_at` | `timestamptz` | NOT NULL, `@updatedAt` |

**`roles` NO lleva `deleted_at`, y la razon es R17.** El borrado logico es un `UPDATE`, y una
FK no puede bloquear un `UPDATE`: si `roles` tuviera `deleted_at`, "borrar" un rol con
usuarios asignados dejaria de estar impedido por la base y R17 pasaria a depender de una
comprobacion en un service que esta feature no expone. Es decir, anadir la columna
**neutralizaria en silencio la unica garantia real** que tiene ese requisito. `roles` es
ademas un catalogo cerrado y corto sin pantalla de administracion, no una tabla
transaccional, asi que la prohibicion de borrado fisico de `docs/architecture.md > Dominio`
no le aplica. El borrado es fisico: se permite si no hay usuarios (**R18**) y lo rechaza la
FK si los hay (**R17**). Si mas adelante se quiere borrado logico de roles, hay que traer con
el la comprobacion en el service que lo pida, o un trigger; no vale solo la columna.

### 2.3 `users`

| Columna | Tipo | Restricciones | Requisito |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, DEFAULT `gen_random_uuid()` | R3 |
| `first_names` | `text` | NOT NULL | R1, R2 |
| `last_names` | `text` | NOT NULL | R1, R2 |
| `birth_date` | `date` | NOT NULL | R1, R2 |
| `email` | `text` | NOT NULL, unico por indice parcial sobre `lower(email)` | R4, R22 |
| `phone` | `text` | NOT NULL | R1, R2 |
| `document_type_code` | `text` | NOT NULL, FK → `document_types(code)` ON DELETE RESTRICT ON UPDATE CASCADE | R8 |
| `document_number` | `text` | NOT NULL | R1 |
| `username` | `text` | NOT NULL, unico por indice parcial sobre `lower(username)` | R5, R22 |
| `password_hash` | `text` | NOT NULL, sin longitud declarada | R11, R12 |
| `role_id` | `uuid` | NOT NULL, FK → `roles(id)` ON DELETE RESTRICT ON UPDATE CASCADE | R15, R16, R17 |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | R24 |
| `updated_at` | `timestamptz` | NOT NULL, `@updatedAt` | R24 |
| `deleted_at` | `timestamptz` | NULL (NULL = usuario vivo) | R21, R22, R23 |

Restricciones adicionales (las tres unicidades son **indices unicos parciales creados en SQL
crudo**, no atributos `@unique` de Prisma; el porque esta en §4 y §5):

```sql
CREATE UNIQUE INDEX users_email_unique     ON users (lower(email))    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_username_unique  ON users (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_document_unique  ON users (document_type_code, document_number)
                                           WHERE deleted_at IS NULL;
```

- `users_document_unique` cubre **R6** y, por ser compuesta, **R7** sale gratis.
- Los tres indices sirven ademas como indice de busqueda: el login de la feature 4 buscara
  por `lower(username) = lower($1)` y usara `users_email_unique`/`users_username_unique`
  directamente. Escribir la condicion de otra forma (`username ILIKE $1`) **no** usa el
  indice; queda anotado aqui para la feature 4.
- Indices adicionales: `users_role_id_idx` y `users_document_type_code_idx`. Postgres **no** crea indice
  automatico en el lado hijo de una FK; sin ellos, cada `DELETE` de rol y cada listado por
  rol hace seq scan (anti-patron "queries sin indice" de `docs/architecture.md`).
- `document_number` es `text`, nunca numerico: admite ceros a la izquierda y nunca se opera
  aritmeticamente.
- `birth_date` es `date`, no `timestamptz`: una fecha de nacimiento no tiene zona horaria.

### 2.4 Cardinalidad

`roles 1 ── N users`. `role_id NOT NULL` da el "exactamente uno y obligatorio" (**R15**); que
sea una columna sin unicidad da el "muchos usuarios por rol" (**R16**); `ON DELETE RESTRICT`
da el rechazo del borrado (**R17**) sin necesidad de logica de aplicacion.

**Un usuario borrado logicamente sigue contando como asignado** (**R17**): conserva su fila y
su `role_id`, y la FK no sabe nada de `deleted_at`, asi que sigue impidiendo borrar el rol.
Es la respuesta deliberada, no un efecto colateral: si el rol desapareciera, el usuario
borrado quedaria apuntando a un rol inexistente y se perderia el dato de con que permisos
operaba — justo lo que el borrado logico existe para conservar (`docs/architecture.md >
Dominio`: el registro es la operacion de la empresa). Consecuencia practica que hay que
aceptar: un rol usado alguna vez ya no se puede borrar nunca. Con un catalogo cerrado, corto
y sin pantalla de administracion, el coste es cero.

## 3. Decision clave: el conjunto de tipos de documento

**Decision: tabla catalogo `document_types` con FK desde `users`.**

Anadir un tipo nuevo = `INSERT INTO document_types ...`. Es DML, no DDL: no toca el esquema,
no reescribe la tabla `users`, no requiere migracion de los datos ya guardados (**R10**).
Retirar un tipo = `UPDATE ... SET is_active = false`, que preserva las filas historicas que
lo referencian. Ademas admite metadatos por tipo (nombre legible, orden, futura validacion de
formato) sin volver a tocar el esquema.

### Alternativas descartadas

**A. Enum nativo de Postgres (`CREATE TYPE document_type AS ENUM ('CC')` / `enum` de Prisma)
— DESCARTADA.**
Cumple hoy y es la opcion mas barata en escritura, pero cada valor nuevo es una migracion de
tipo (`ALTER TYPE ... ADD VALUE`) mas un cambio en `schema.prisma`, un redeploy y una
regeneracion del cliente Prisma. Tres agravantes concretos: (1) `ALTER TYPE ... ADD VALUE` no
se puede ejecutar dentro de un bloque transaccional en versiones de Postgres anteriores a la
12 y sigue teniendo restricciones de uso del valor nuevo en la misma transaccion, lo que
choca con como Prisma Migrate envuelve las migraciones; (2) **quitar** un valor de un enum no
existe en Postgres — hay que recrear el tipo y reescribir toda la columna, o sea exactamente
la migracion de datos que la description prohibe; (3) el enum no admite metadatos (nombre
legible, activo/inactivo), asi que la etiqueta de UI acabaria duplicada en el codigo. El
coste extra del catalogo es un join que en la practica ni se paga: el codigo (`CC`) esta ya
en `users`.

**B. `CHECK (document_type IN ('CC'))` sobre una columna `text` — DESCARTADA.**
Anadir un valor obliga a `DROP CONSTRAINT` + `ADD CONSTRAINT`, y el `ADD` valida la tabla
`users` entera (`ACCESS EXCLUSIVE` lock, salvo el rodeo `NOT VALID` + `VALIDATE`). Es DDL
sobre la tabla de usuarios cada vez que crece el conjunto — justo lo que la restriccion 1 de
la feature pide evitar. Ademas Prisma no modela `CHECK` constraints, o sea que la lista
quedaria solo en SQL crudo y el tipo TypeScript no la reflejaria.

**C. Texto libre validado solo en la aplicacion — DESCARTADA.** No cumple "conjunto cerrado":
cualquier escritura por fuera del service (seed, script, consola) mete basura y la base no lo
impide. Contradice **R8**.

## 4. Decision clave: unicidad insensible a mayusculas (R4, R5)

**Decision: indice unico funcional sobre `lower(email)` y `lower(username)`, en SQL crudo
dentro de la migracion, mas normalizacion a minusculas en escritura cuando la haya.** La
columna guarda el texto tal como lo escribio el usuario (`Ana.Perez@x.com` se muestra como
lo tecleo); lo que se indexa y se compara es su version en minusculas.

La garantia vive **en la base**, no en la aplicacion: cualquier via de escritura —seed de la
feature 3, script, consola, una futura importacion masiva— choca contra el indice. Una
normalizacion hecha solo en un service no protege de nada de eso.

**Coste que hay que conocer, no descubrir despues:** Prisma **no modela indices funcionales
ni parciales** (`@@unique([lower(email)])` no existe). Consecuencias: (1) los tres indices
unicos se escriben a mano en `migration.sql` y **no** aparecen como `@unique` en
`schema.prisma`; (2) `prisma migrate dev` puede proponer eliminarlos al detectar drift, asi
que **todo `migration.sql` generado se revisa antes de aplicarlo**; (3) los tipos de Prisma
no exponen `findUnique` por email/username — se busca con `findFirst` sobre
`lower(...)`/`mode: 'insensitive'` y la unicidad la garantiza la base. La guardia de §9 y el
test de migracion (T9) existen justamente para que la desaparicion de un indice no pase
inadvertida.

### Alternativas descartadas

**A. Columnas de tipo `citext` (extension `citext`) — DESCARTADA.**
Es la opcion mas comoda de escribir: `email citext UNIQUE` y se acabo, sin `lower()` en
ningun sitio. Se descarta por tres razones concretas: (1) **la semantica queda invisible** —
`WHERE email = $1` se comporta distinto segun el tipo de la columna, y ese comportamiento no
se ve en la query; el dia que alguien copie el valor a otra tabla, a una vista materializada
o a un `text` intermedio, la insensibilidad desaparece en silencio y nadie lo nota hasta que
hay dos cuentas duplicadas; (2) **es una dependencia de extension** que hay que instalar y
mantener en local, en CI y en el proyecto de Supabase, y la propia documentacion de Postgres
la trata como solucion heredada frente a las colaciones no deterministas; (3) **no evita el
problema de Prisma**: aun con `@db.Citext` sigue haciendo falta SQL crudo para el indice
**parcial** que exige el borrado logico (§5), asi que el SQL a mano no se ahorra — solo se
suma una extension. El `lower()` explicito es feo pero se lee en la query.

**B. Colacion ICU no determinista en la columna — DESCARTADA.** Resuelve el caso y es lo
moderno, pero un indice con colacion no determinista **no sirve para operadores de patron**
(`LIKE`, `ILIKE`, busquedas por prefijo), que es exactamente lo que va a querer la primera
pantalla de busqueda de usuarios; obligaria a un segundo indice con `COLLATE "C"`. Prisma
tampoco puede declararla. Mas piezas moviles para el mismo resultado.

**C. Normalizar solo en la aplicacion (guardar siempre en minusculas) — DESCARTADA.** Es la
mas barata y la unica que no cumple el requisito tal como lo pidio el humano: la garantia
tiene que estar en la base. Ademas pierde el texto original del usuario, que es un dato que
no se recupera.

## 5. Decision clave: borrado logico y unicidad (R21-R23)

**Decision: las tres unicidades de `users` son indices unicos PARCIALES con
`WHERE deleted_at IS NULL`. La unicidad aplica solo a usuarios vivos; los valores de un
usuario borrado NO quedan quemados.**

El problema es real y no se puede dejar implicito: con borrado logico la fila sobrevive, y un
indice unico normal seguiria reservando su correo, su username y su documento para siempre.
En un ERP eso significa que **una persona que sale de la empresa y vuelve no se puede volver
a dar de alta con su propia cedula** — el numero de documento identifica a la persona, no al
registro, y no hay ningun valor alternativo que pueda usar. Quemar los valores convierte un
borrado reversible en un bloqueo permanente. Por eso la unicidad se acota a
`deleted_at IS NULL` (**R22**).

Efecto secundario aceptado y escrito como requisito para que nadie lo lea como un bug:
**pueden coexistir varios usuarios borrados con el mismo correo o el mismo documento**
(**R23**). Es la consecuencia inevitable de un indice parcial y es la correcta: son registros
historicos, no identidades activas.

Lo que esta feature **no** decide, porque no expone service ni repositorio: que las consultas
de negocio filtren `deleted_at IS NULL`. Eso lo tiene que hacer quien lea usuarios — el login
de la feature 4 **debe** excluir borrados, o un usuario dado de baja seguiria entrando. Queda
anotado aqui como contrato hacia esas features, no como algo ya resuelto.

**Alternativa descartada: indice unico total (los valores quedan quemados).** Es una linea
menos de SQL y hace el modelo mas simple de razonar: un correo pertenece a un usuario y punto,
para siempre. Se descarta porque el caso de re-alta es normal en un ERP (recontratacion,
usuario borrado por error, prueba mal hecha) y la unica salida seria editar a mano la fila
borrada para liberar el valor, que es peor que no tener borrado logico. Tambien se descarto
**mover los borrados a una tabla historica** (`users_deleted`): libera los indices, pero
duplica el esquema, rompe las FK de cualquier tabla futura que apunte a `users` y convierte
cada baja en una operacion de dos tablas que puede quedar a medias.

## 6. Decision clave: la columna de contrasena

**Decision: una unica columna `password_hash text NOT NULL`, sin longitud, sin `CHECK`, sin
columnas hermanas.**

Esta feature define **el hueco**, no lo que va dentro. Lo que se evita a proposito, porque
pertenece a la feature 2:

- **`char(60)` / `varchar(60)`** — es la huella exacta de bcrypt. Elegirla aqui decidiria el
  algoritmo por la feature 2; un hash argon2id ronda los 95-100 caracteres y no cabria.
- **Columna `salt` separada** — presupone un algoritmo que no embebe el salt. bcrypt y argon2
  lo embeben en la propia cadena. Anadirla obligaria a la feature 2 a usarla o a dejar una
  columna muerta.
- **Columnas `algorithm` / `params`** — pueden hacer falta para rehash en rotacion de
  algoritmo, pero eso es una decision de la feature 2 y anadirlas ahora seria adivinar (ver
  pregunta abierta 3 de §11).

El nombre `password_hash` es explicito y hace que la guardia anti-texto-plano (§9) pueda
comprobar por barrido de nombres que no existe `password`, `pass`, `plain_password` ni
`clear_password` en ningun `migration.sql` ni en el schema (**R11**).

## 7. Prisma: configuracion y ubicacion

```prisma
// db/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooler 6543, runtime
  directUrl = env("DIRECT_URL")     // directa 5432, Prisma Migrate
}
generator client { provider = "prisma-client-js" }
```

Ambas URLs van declaradas: `docs/architecture.md` avisa de que Prisma Migrate no funciona a
traves del pooler en transaction mode. Los valores viven en `.env`; **ningun archivo de esta
spec los contiene**. Si el `.env` existente solo trae `DATABASE_URL`, `DIRECT_URL` se resuelve
con la conexion directa del mismo proyecto — el implementer lo comprueba en T0, no lo inventa
la spec.

El schema **no** va en `prisma/schema.prisma`. Hay que declarar la ruta en `package.json`:

```json
"prisma": { "schema": "db/schema.prisma" }
```

Los modelos usan `@@map` / `@map` para que el codigo sea `camelCase`/`PascalCase`
(`docs/conventions.md`) y la base `snake_case`:
`model User { firstNames String @map("first_names") ... @@map("users") }`.

Cliente: `lib/prisma.ts`, singleton con cache en `globalThis` para no agotar el pool con el
hot-reload de Next dev. Es la unica instancia del proyecto; los repositorios de las features
2-4 la importan de ahi. **Esta feature no crea repositorios ni servicios**: nada los consume
todavia y `docs/architecture.md` rechaza la sobre-ingenieria. `UserRepo`/`RoleRepo` y sus
interfaces nacen con la feature que los necesita (3 seed, 4 login).

## 8. Migracion

```
db/migrations/<timestamp>_users_and_roles/
  migration.sql   # UP  (generado con `prisma migrate dev --create-only`, luego editado a mano)
  down.sql        # DOWN (manual, convencion propia del repo)
```

`migration.sql` (orden importa): `pgcrypto` para `gen_random_uuid()` → `document_types` →
INSERT de `CC` → `roles` → `users` → los tres **indices unicos parciales** de §4/§5 escritos a
mano → indices de FK → `ENABLE`/`FORCE ROW LEVEL SECURITY` en las tres tablas.

Como los indices unicos no salen de `schema.prisma`, el `migration.sql` que genera Prisma
**siempre hay que completarlo a mano** y revisar que ninguna migracion futura los borre por
drift. El test T9 los comprueba en el SQL, que es el unico sitio donde existen.

`down.sql` en orden inverso exacto: `DROP TABLE users` → `roles` → `document_types`. No se
elimina la extension `pgcrypto` (puede haberla puesto otro y no la crea esta feature en
exclusiva); `CREATE EXTENSION IF NOT EXISTS` la hace idempotente. **R20**.

Scripts a anadir en `package.json` (los pide `docs/architecture.md > Migraciones up/down` y
hoy no existen): `db:migrate:create`, `db:migrate`, `db:rollback` (→ `scripts/db-rollback.ts`,
que aplica `down.sql` **y, en la misma transaccion**, `DELETE FROM _prisma_migrations WHERE
migration_name = <migracion>` (parametrizado); ese segundo paso no es opcional o
`_prisma_migrations` queda mintiendo).

**Por que un DELETE y no `prisma migrate resolve --rolled-back`** (que es lo que decia este
design antes y resulto no poder funcionar): ese comando **solo admite migraciones en estado
fallido** y devuelve `P3012` sobre una aplicada con exito, que es exactamente el caso de un
rollback. **Coste aceptado** (decision humana, 2026-08-06): se pierde el rastro historico de
que la migracion llego a aplicarse; a cambio el ciclo cierra y `migrate deploy` la reaplica
limpia. Los dos pasos van en una sola transaccion (el DDL de Postgres es transaccional): o se
revierte todo o no se revierte nada.

## 9. RLS y autorizacion

Las tres tablas llevan `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` **y** `... FORCE ROW LEVEL
SECURITY` (**R19**). Sin `FORCE`, el dueno de las tablas —que es con quien se conecta
Prisma— la ignora entera.

Se activa **sin policies**: deny-by-default para cualquier via que no sea Prisma (PostgREST,
consola con anon key, job mal configurado). Es defensa en profundidad, no la frontera:
`docs/architecture.md > Acceso a datos y autorizacion` es explicito en que las policies **no
filtran** las queries de esta app. Esta feature **no tiene ningun permiso que validar**: no
expone controller, service ni operacion de negocio; el primer permiso real llega con la
feature que exponga altas o consultas de usuarios. Un test de RLS escrito con Prisma saldria
verde pase lo que pase, asi que **no se escribe** ninguno: la comprobacion que si significa
algo es la guardia estatica de que el `FORCE` esta en el SQL.

## 10. Rutas, endpoints y contratos

**Ninguno.** Esta feature no expone rutas, route handlers ni Server Actions: es esquema y
persistencia. El unico contrato publico que deja son los tipos generados por Prisma
(`User`, `Role`, `DocumentType`) mas `lib/types/identity.ts`, que exporta la constante
`DOCUMENT_TYPE_CC = 'CC'` y el tipo de union derivado, para que las features 3 y 4 no
escriban el literal a mano. No hay zod aqui porque no hay borde externo que validar; entra
con la feature que reciba entrada de usuario.

Contrato implicito hacia las features 2-4, derivado de §4 y §5:

- La busqueda por username o correo se hace **insensible a mayusculas** (`lower(...)`), o no
  usa el indice unico y ademas contradice R4/R5.
- Toda consulta de negocio sobre usuarios **filtra `deleted_at IS NULL`**. El login de la
  feature 4 en particular: sin ese filtro, un usuario dado de baja sigue entrando.

## 11. Preguntas abiertas

**Ninguna bloquea la implementacion.** Las cinco preguntas de la primera version quedaron
cerradas por el humano el 2026-08-06 (ver `requirements.md > Decisiones cerradas`), incluida
la de infraestructura: hay `.env` con `DATABASE_URL` y ninguna tarea queda bloqueada.

1. **Formato del numero de documento.** ¿Solo digitos, longitud minima/maxima, o texto libre
   no vacio? Esta feature guarda texto sin imponer formato. Si se impone, sera validacion de
   borde (zod) en la feature que dé de alta usuarios, no un cambio de esquema. **No bloquea.**
2. **Roles concretos del catalogo.** La description dice "catalogo cerrado y corto" pero no
   nombra ninguno. Esta feature no crea ninguna fila de `roles`: son la feature 3. Si alguno
   debe existir como constante referenciada por codigo, hay que saberlo antes de cerrar la
   feature 3, no antes de esta. **No bloquea.**
3. **Rotacion del algoritmo de contrasena.** Si la feature 2 quiere rehashear al cambiar de
   algoritmo o de coste, podria necesitar `password_algorithm` / `password_updated_at`. Aqui
   no se anaden por no adivinar (§6). Es una migracion aditiva barata. **No bloquea.**
