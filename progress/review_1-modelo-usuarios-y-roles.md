# review_1-modelo-usuarios-y-roles.md

> Feature 1 - zona `backend` - complexity `medium` - rama `feature/1-modelo-usuarios-y-roles`
> Worktree: `.worktrees/1-modelo-usuarios-y-roles/` - commits `ffabc3a`, `44e934d`
> Revisado: 2026-08-06 - **VEREDICTO: RECHAZADO** (1 bloqueante, 5 menores)

El rechazo es por **un solo punto** (T12 / `db:rollback`) y no por el modelo, la migracion,
los indices ni los tests, que estan bien hechos y verificados de primera mano. Ver seccion 6.

---

## 1. Checklist de CHECKPOINTS.md

### Especificacion
- [x] `specs/1-modelo-usuarios-y-roles/requirements.md` con R1-R24 en EARS.
- [x] `design.md` con alternativas descartadas y su porque (secciones 3, 4, 5, 6).
- [ ] **`tasks.md` con todas las tasks `[x]`** -> **T12 y T14 estan sin marcar.** T14 es del
      leader (posterior al reviewer) y no cuenta; **T12 si.**

### Trazabilidad
- [x] Cada `R1`-`R24` mapea a al menos un test concreto que existe y que afirma lo que dice.
      Verificado requisito por requisito (seccion 2). Ninguno pasa por vacuidad.
- [x] `progress/impl_1-modelo-usuarios-y-roles.md` contiene el mapa `R<n> -> test`.

### Calidad de codigo
- [x] `pnpm run typecheck` - verde (corrido por mi).
- [x] `pnpm run lint` - verde (corrido por mi).
- [x] `pnpm test` - **54/54 en verde, 5 archivos** (corrido por mi con `--reporter=verbose`;
      los 22 de integracion golpean Postgres de verdad, no estan skipeados).
- [x] E2E: no aplica. La feature no expone ruta, controller, service ni UI (design 10), asi
      que no hay flujo critico que ejercitar con Playwright.

### Datos y seguridad (Supabase)
- [x] Permisos en el service: **no aplica**, la feature no expone ninguna operacion de
      negocio. Correctamente razonado en design 9 y no disimulado.
- [x] RLS: las tres tablas con `ENABLE` **y** `FORCE`. Verificado en el SQL, en la guardia y
      **en la base real** (`relrowsecurity` y `relforcerowsecurity` = true en `users`,
      `roles`, `document_types`; `pg_policies` vacio = deny-by-default).
- [x] Acceso a datos solo por Prisma. `lib/prisma.ts` es la unica instancia; no hay
      `createServerClient()` ni cliente de Supabase en ningun sitio.
- [ ] **Migraciones reversibles:** `down.sql` existe y revierte el esquema, pero
      `pnpm run db:rollback` **no deja `_prisma_migrations` coherente** (seccion 6). Este es
      el bloqueante.
- [x] Ningun secreto hardcodeado. `git ls-files` solo versiona `.env.example`, sin valores;
      busqueda de cadenas de conexion en archivos versionados: cero resultados.
- [x] Webhooks: no aplica.

### Patron de capas
- [x] No hay controller, service ni repository, y eso es deliberado y esta justificado
      (design 7: nada los consume todavia; crearlos seria sobre-ingenieria).
      `lib/interfaces/` no se crea vacio. Correcto.

### Permisos
- [x] No aplica (sin paginas, sin componentes, sin Server Actions).

### Configuracion
- [x] Nada que cambie entre entornos quedo hardcodeado. `DATABASE_URL` / `DIRECT_URL` por
      entorno, plantilla versionada en `.env.example`.

### Verificacion final
- [x] `./init.sh` completo termina en `== init OK ==` (corrido por mi dentro del worktree).
- [ ] `progress/review_*.md` con veredicto OK -> este archivo, veredicto **RECHAZADO**.
- [ ] Entrada en `progress/history.md` -> pendiente (leader, tras el OK).
- [ ] Worktree desmontado -> pendiente (leader, tras el OK).

---

## 2. Trazabilidad R1-R24 verificada una a una

Metodo: para cada R se abrio el test que la tabla del implementer declara, se leyo el assert
y se comprobo que afirma **el requisito** y no una tautologia. Ademas se verifico contra la
base real lo que se puede verificar ahi.

Abreviaturas como en la bitacora: S = test estatico de schema, M = test estatico de
migracion, G1/G2 = guardias, I = tests de integracion contra base real.

| R | Veredicto | Que se comprobo |
| --- | --- | --- |
| R1 | **OK** | S afirma los 9 campos y **la lista completa** de columnas escalares (si alguien anade o quita una, cae). I los lee todos de vuelta con sus valores. |
| R2 | **OK** | I itera las 9 columnas obligatorias, omite **una y solo una** por vuelta con INSERT crudo, exige SQLSTATE 23502 y count()==0 tras cada rechazo. Incluye `phone` y `birth_date`. |
| R3 | **OK, con matiz (menor m3)** | S: `id` uuid con default `gen_random_uuid()`. I: el id es uuid y no derivado. Verificado en base: `users.id` y `roles.id` de tipo uuid. |
| R4 | **OK** | M: el indice es sobre `lower(email)` y **no** sobre `email` crudo. I: alta con ANA.perez@EXAMPLE.COM frente a Ana.Perez@Example.com produce 23505, y el original sobrevive con su texto tal cual. Base real: indice sobre `lower(email)` con `WHERE (deleted_at IS NULL)`. |
| R5 | **OK** | Igual que R4 con `username`. Base real: indice sobre `lower(username)` con `WHERE (deleted_at IS NULL)`. |
| R6 | **OK** | M: indice compuesto. I: misma pareja (tipo, numero) con correo y username distintos produce 23505; solo esa restriccion puede dispararlo. |
| R7 | **OK** | I crea el tipo TI y da de alta dos usuarios con el mismo numero y tipo distinto; ambos entran. No es el test de R6 disfrazado. |
| R8 | **OK** | S: FK y ausencia de `enum` en todo el schema. I: tipo PASAPORTE_MARCIANO produce 23503 y count()==0. |
| R9 | **OK** | M: un unico INSERT en `document_types`, con CC, y sin segundo tuple. I: catalogo en base = exactamente CC. Verificado tambien a mano en la base. |
| R10 | **OK** | I inserta el tipo CE (DML puro), relee el usuario previo y afirma que el **objeto completo** es identico al de antes, y ademas usa el tipo nuevo de inmediato. Esto si prueba "sin migrar los datos ya guardados". |
| R11 | **OK** | G1 barre `db/`, `lib/`, `app/`, `scripts/` en posiciones de **declaracion** y acepta solo el sufijo `_hash`. Tiene tests de sensibilidad: detecta `plain_password` en SQL, `password` en `.prisma` y en `.ts`, y no se traga la bandera `--passWithNoTests`. |
| R12 | **OK, mejor que su mapa** | S: sin `@db.VarChar(n)` ni `@db.Char(n)`. M: TEXT sin longitud. Y ademas, lo que la tabla marca como vacio, I guarda un hash de **10.000 caracteres** y lo relee entero. |
| R13 | **OK** | S: `name` y `description` obligatorios. I: rol sin `description` produce 23502. |
| R14 | **OK** | M: `roles_name_key` sobre `name`, **total y no parcial**. I: segundo rol con el mismo nombre produce 23505 y el original queda intacto. Base real: `roles_name_key` existe. |
| R15 | **OK** | S: `roleId` obligatorio y FK a Role. I: sin `role_id` produce 23502; con uuid inexistente produce 23503. Los dos casos, no uno. |
| R16 | **OK** | S: sin `@unique` en `roleId`. I: 5 usuarios sobre el mismo rol. |
| R17 | **OK** | S: `onDelete: Restrict` y **Role sin `deletedAt`**. I: dos casos, rol con usuario vivo y rol cuyo unico usuario esta **borrado logicamente**; ambos 23503, con el rol y el usuario intactos. Base real: `users_role_id_fkey` con accion de borrado RESTRICT. |
| R18 | **OK** | I borra un rol sin usuarios y comprueba que desaparece. |
| R19 | **OK** | G2 descubre las tablas **del propio SQL** (no una lista fija), exige ENABLE y FORCE, y tiene sensibilidad: cae si falta el FORCE y no se conforma con un RLS puesto en un comentario. Verificado ademas en la base real. |
| R20 | **PARCIAL** | Mitad estatica **OK**: M afirma que `down.sql` dropea exactamente las 3 tablas del UP, en orden inverso, que **no hace nada mas** y que no toca `pgcrypto`. Mitad contra base real: el implementer la ejecuto y las 3 tablas desaparecen, pero **`_prisma_migrations` queda incoherente** y T12 sigue sin cerrar. Ver seccion 6. |
| R21 | **OK** | S: `deletedAt` opcional. I: tras el borrado logico compara la fila **entera** contra la previa, no solo el flag. |
| R22 | **OK** | M: los tres indices son parciales. I: alta, borrado logico y **re-alta con el mismo correo, username y documento**; entra. Esto es lo que R22 pide. |
| R23 | **OK** | I deja **dos** borrados compartiendo correo, username y documento, y ademas un tercero vivo. |
| R24 | **OK** | S: default `now()` y `@updatedAt` en User y Role. I: `createdAt` estable y `updatedAt` estrictamente mayor tras modificar, en **ambas** entidades. |

**Ningun R1-R24 se queda sin test, y ningun test revisado pasa por vacuidad.** La afirmacion
del implementer se sostiene. El unico con cobertura incompleta es **R20**, y exactamente por
donde el spec avisaba: su mitad contra base real esta verificada **solo a nivel de esquema**.

Nota de calidad, no hallazgo: los asserts de rechazo se hacen sobre **SQLSTATE** (23502,
23503, 23505) mas el efecto observable, y cada caso se construye con **un unico valor en
conflicto**, de modo que solo una restriccion puede dispararlo. Es la forma correcta cuando
el servidor responde en otro idioma. Y los tests estaticos incluyen **tests de
sensibilidad** (mutan el SQL y comprueban que su propio assert cae): eso es justamente lo
que impide que la trazabilidad sea decorativa.

---

## 3. Los tres indices unicos escritos a mano: verificado en la base, no en el papel

Consultado `pg_indexes` de la base real (localhost:5432, base QuimiCloude):

- `users_email_unique` - UNIQUE, btree sobre `lower(email)`, `WHERE (deleted_at IS NULL)`
- `users_username_unique` - UNIQUE, btree sobre `lower(username)`, `WHERE (deleted_at IS NULL)`
- `users_document_unique` - UNIQUE, btree `(document_type_code, document_number)`, `WHERE (deleted_at IS NULL)`
- `users_role_id_idx` y `users_document_type_code_idx` - los dos indices de FK que exige design 2.3
- `roles_name_key` - UNIQUE total sobre `name`

Conclusiones:

- **Existen los tres**, con `lower(...)` **y** con `WHERE (deleted_at IS NULL)`: las dos
  mitades, no una.
- **Hacen lo que dicen**, y eso no se deduce del texto del indice: los tests de integracion
  lo ejercitan de verdad contra esa base (mayusculas rechazadas, borrados logicos que no
  queman el valor, tercero vivo admitido). Case-insensitive Y solo sobre filas vivas:
  comprobado.

**Drift entre `schema.prisma`, la base y la migracion: cero, comprobado en las dos
direcciones.** `prisma migrate diff` de datasource a datamodel y su inverso devuelven ambos
"This is an empty migration". Los tres indices escritos a mano **no** aparecen como drift, o
sea que Prisma no va a proponer borrarlos en la proxima migracion. `prisma migrate status`
responde "Database schema is up to date!".

---

## 4. Los cuatro puntos de riesgo que se pidio mirar

1. **`roles` NO tiene `deleted_at`**: confirmado en `schema.prisma` (el test S lo vigila
   explicitamente), en `migration.sql` y en `information_schema.columns` de la base, donde
   `roles` tiene exactamente id, name, description, created_at, updated_at. Y la razon esta
   escrita donde toca (design 2.2): con la columna, R17 se quedaria sin garantia real.
2. **Nada de hashing**: no hay bcrypt, argon2 ni ningun paquete equivalente en
   `package.json`; no hay `lib/services/` ni util de contrasenas. Solo la columna
   `password_hash TEXT NOT NULL`, sin longitud, sin CHECK, sin columnas salt ni algorithm.
   La feature 2 llega a un hueco limpio.
3. **Alcance**: el diff contra `origin/dev` son 24 archivos (esquema, migracion, `lib/`,
   tooling, tests y specs). **Cero cambios en `app/`**, cero seed de negocio, cero login,
   cero UI. La unica fila insertada es la de CC en `document_types`, que es la definicion
   del conjunto cerrado y esta razonada como tal en design 2.1.
4. **Identificadores en ingles y `phone` / `birth_date` NOT NULL**: confirmado en la base.
   Todas las tablas, columnas, indices y constraints en ingles snake_case; `phone text NOT
   NULL`, `birth_date date NOT NULL`. La unica columna nullable de `users` es `deleted_at`,
   que es lo esperado.

---

## 5. Hallazgos

### BLOQUEANTE

**B1. `pnpm run db:rollback` no completa: deja `_prisma_migrations` mintiendo (T12).**
`prisma migrate resolve --rolled-back` solo admite migraciones en estado **fallido** y
responde P3012 sobre una aplicada con exito. Resultado real: el `down.sql` se aplica (las
tres tablas se van), el script sale con exit 1, y la fila queda con `finished_at` puesto y
`rolled_back_at` nulo. A partir de ahi `migrate deploy` no reaplica nada y hay que operar la
tabla a mano.

Que incumple, textualmente:

- `CHECKPOINTS.md > Datos y seguridad`: "`pnpm run db:rollback` revierte **y deja
  `_prisma_migrations` coherente**". Hoy no lo deja.
- `tasks.md > T12`, cuyo "hecho cuando" es el ciclo apply, rollback y apply **limpio**. La
  task esta sin marcar, asi que tambien cae `CHECKPOINTS.md > Especificacion`: "todas las
  tasks estan marcadas".
- Deja **R20 cerrado solo a nivel de esquema**, que es exactamente donde el spec puso el
  riesgo.

**No es culpa del implementer** y esta bien escalado: el comando exacto lo mandan design 8,
`tasks.md > T2` y `docs/architecture.md > Migraciones up/down` ("ese segundo paso no es
opcional"). El implementer hizo lo correcto al no improvisar un parche sobre una instruccion
de arquitectura. Pero **la feature no puede pasar a done asi**: ver seccion 6.

*Nota de honestidad sobre mi verificacion:* intente reproducir el ciclo yo mismo y el
sandbox bloqueo `pnpm run db:rollback` por destructivo, asi que **no re-ejecute el
rollback**. Lo que si verifique de primera mano: el estado actual de `_prisma_migrations`
(1 fila, terminada, sin marca de rollback, coherente tras la reparacion manual); que
`scripts/db-rollback.ts` invoca efectivamente `prisma migrate resolve --rolled-back` como
paso 2 obligatorio y aborta si devuelve distinto de 0; y que `prisma migrate resolve` no
ofrece ningun modo para migraciones aplicadas con exito. La salida P3012 pegada en la
bitacora es coherente con el codigo y con el comportamiento documentado de Prisma.

### Menores

**m1. La guardia de RLS no puede distinguir un FORCE efectivo de uno inerte en esta
maquina.** El rol de conexion local es `postgres` con superusuario y BYPASSRLS, asi que RLS
**no se aplica** aunque este forzado, y por eso los tests de integracion pueden escribir.
Con FORCE y **cero policies**, la correccion en produccion depende de que el rol con el que
Prisma se conecte tenga BYPASSRLS; si no lo tiene, toda query de la app devuelve vacio o
falla. Design 9 describe el FORCE como deny-by-default para vias que no son Prisma, pero no
deja escrito de que privilegio del rol depende que Prisma **si** pase. R19 se cumple tal
como esta redactado y esto no lo bloquea; **conviene verificarlo en el proyecto de Supabase
antes del primer deploy** y anotarlo en `docs/architecture.md`.

**m2. `progress/impl_modelo-usuarios-y-roles.md` es un archivo huerfano** (2 lineas que
apuntan al canonico `impl_1-...`). Ruido versionado; borrarlo.

**m3. R3 no tiene un assert explicito de "cambiar un dato de negocio no cambia el id".** La
propiedad esta garantizada estructuralmente (uuid con default generado, sin `@updatedAt` ni
trigger sobre `id`) y probada **de forma implicita**: el test de `updated_at` modifica
`phone` y vuelve a leer la fila **por el mismo id** con exito. Es suficiente, pero un
assert de igualdad del id tras un update lo dejaria explicito y costaria una linea.

**m4. La tabla de trazabilidad infravalora R12.** Marca vacio en la columna de integracion
cuando el caso de los 10.000 caracteres si existe y es el que realmente prueba "longitud
arbitraria". Corregir el mapa, no el test.

**m5. Deuda ya conocida y bien anotada por el implementer, la confirmo.** Prisma fijado a la
mayor 6 a proposito (la 7 rompe la configuracion del schema en `package.json` y la
propiedad `url` del datasource), con el aviso de deprecacion saliendo en cada comando; y
`pnpm run typecheck` puede fallar en maquina limpia por `LayoutProps` si no existe
`.next/types` (preexistente, no de esta feature). En esta maquina `./init.sh` completo sale
verde.

---

## 6. Sobre el bloqueo de T12: bloqueante o deuda documentable

**Bloqueante.** Razonamiento, para que la decision del leader no dependa de mi tono:

1. **Es un checkpoint explicito, no una interpretacion.** `CHECKPOINTS.md` no dice "las
   migraciones tienen down.sql"; dice que `db:rollback` **revierte y deja
   `_prisma_migrations` coherente**. Ese punto falla, reproducible, siempre.
2. **El fallo tiene consecuencias, no es cosmetico.** El propio `docs/architecture.md`
   explica el dano: "la siguiente migracion se aplica sobre un estado que Prisma cree que es
   otro". La feature 2 ya trae migracion. Quien la revierta se encuentra con un exit 1 y una
   tabla que hay que editar a mano, y editar `_prisma_migrations` a mano bajo presion es
   exactamente como se pierde una base.
3. **Es la primera migracion del repo.** Esta feature no solo entrega un esquema: **fija la
   convencion de migraciones** para todo lo que venga. Aceptar un `db:rollback` roto aqui es
   aceptarlo para las nueve features siguientes.
4. **El arreglo es barato y ya esta disenado.** La opcion 3 de la bitacora, intentar
   `prisma migrate resolve --rolled-back` y **solo ante P3012** caer a un UPDATE de
   `rolled_back_at` sobre `_prisma_migrations`, hace exactamente lo que el comando de Prisma
   escribiria, conserva el rastro historico y permite que `migrate deploy` reaplique. Son
   unas 15 lineas en `scripts/db-rollback.ts` mas una frase en design 8, `tasks.md > T2` y
   `docs/architecture.md > Migraciones up/down`. No justifica dejar un checkpoint en rojo.

**Lo que hace falta para levantar el rechazo, y nada mas que esto:**

1. **Decision del leader o del humano** sobre cual de las tres salidas se adopta, y
   correccion de design 8, `tasks.md > T2` y la frase de `docs/architecture.md > Migraciones
   up/down` que hoy manda un comando que no puede funcionar. Es cambio de spec, no de
   implementacion: por eso el implementer hizo bien en pararse.
2. **Implementer:** aplicar la salida elegida en `scripts/db-rollback.ts`.
3. **Implementer:** cerrar T12, con el ciclo `db:migrate`, `db:rollback`, `db:migrate`
   limpio, `_prisma_migrations` coherente al final, salida pegada en la bitacora y la task
   marcada. Eso cierra R20 en su forma real.
4. Opcional pero recomendado: un test que cubra el ciclo, o al menos que `migrate status`
   quede limpio tras el rollback, para que esto no vuelva a depender de que alguien lo corra
   a mano.
5. Menores m2, m3 y m4 (dos borrados y una linea de test). m1 se anota como riesgo a
   verificar antes del deploy, no bloquea.

---

## 7. Veredicto

**RECHAZADO.**

Un unico bloqueante: **B1, `db:rollback` no deja `_prisma_migrations` coherente, T12 sin
cerrar y R20 cubierto solo a nivel de esquema.** Su causa es una contradiccion entre la spec
y el comportamiento real de Prisma, correctamente escalada por el implementer; se levanta
con una decision de spec y unas 15 lineas de script.

Todo lo demas esta bien y verificado de primera mano: los 24 requisitos tienen test real y
no vacuo, los tres indices funcionales y parciales existen en la base y se comportan como
dicen, cero drift, RLS forzado en las tres tablas, `roles` sin `deleted_at`, ningun rastro
de hashing, alcance limpio sin seed ni login ni UI, identificadores en ingles, `phone` y
`birth_date` NOT NULL, sin secretos versionados, y `./init.sh` completo en verde con 54 de
54 tests. La calidad de los tests (sensibilidad en las guardias y en los estaticos, asserts
sobre SQLSTATE mas efecto observable, aislamiento por transaccion con savepoints) esta por
encima de lo que exige el arnes.
