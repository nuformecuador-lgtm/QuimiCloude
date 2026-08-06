# review_1-modelo-usuarios-y-roles.md

> Feature 1 - zona `backend` - complexity `medium` - rama `feature/1-modelo-usuarios-y-roles`
> Worktree: `.worktrees/1-modelo-usuarios-y-roles/` - commits `ffabc3a`, `44e934d`
> **VEREDICTO VIGENTE (ronda 2, commit `37f1d53`, 2026-08-06): APROBADO / OK.**
> Cero bloqueantes. 1 menor nuevo (n1), sin consecuencias. La parte viva de este documento
> es la **seccion 8**.
>
> Ronda 1 (commits `ffabc3a`, `44e934d`): **RECHAZADO**, 1 bloqueante y 5 menores. Las
> secciones 1 a 7 son ese informe y se conservan **como registro historico**: su checklist
> y su veredicto estan **superados** por la seccion 8. No los leas como el estado actual.

_(Texto de la ronda 1, conservado tal cual:)_ El rechazo es por **un solo punto**
(T12 / `db:rollback`) y no por el modelo, la migracion, los indices ni los tests, que estan
bien hechos y verificados de primera mano.

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

---
---

# 8. RONDA 2 - re-revision del commit `37f1d53` (2026-08-06)

> **VEREDICTO: APROBADO (OK).** Cero bloqueantes. B1 resuelto y verificado ejecutando yo el
> ciclo completo, incluida la atomicidad. m2, m3 y m4 cerrados. m1 y m5 documentados con
> accion concreta, que es lo que se pidio para ellos. Un menor nuevo (n1) sin consecuencias.

Alcance de esta ronda: verificar los arreglos y que no hayan roto nada de lo ya aprobado.
No se re-audita lo que la ronda 1 dio por bueno salvo para confirmar que sigue en pie.

## 8.1. B1 - RESUELTO. Esta vez si pude ejecutar el rollback

En la ronda 1 el sandbox me bloqueo `pnpm run db:rollback` y lo hice constar. **Esta vez no
me lo bloqueo y lo corri yo, tres veces, contra la base real.** Nada de lo que sigue viene
de la salida pegada por el implementer.

### (b) El ciclo migrate, rollback y migrate, ejecutado por mi

```
> pnpm run db:rollback
db:rollback: aplicando down.sql de 20260806122638_users_and_roles y borrando su fila de _prisma_migrations
db:rollback: 20260806122638_users_and_roles revertida.                       EXIT=0

> estado tras el rollback (consulta directa a la base, hecha por mi)
tablas en public: _prisma_migrations          <- users, roles y document_types NO existen
_prisma_migrations: 0 filas
indices sobre users: 0                        <- ningun indice residual

> pnpm exec prisma migrate status
Following migration have not yet been applied: 20260806122638_users_and_roles   EXIT=1
                                              <- Prisma la ve PENDIENTE: registro coherente

> pnpm run db:migrate
Applying migration `20260806122638_users_and_roles`
All migrations have been successfully applied.                               EXIT=0

> pnpm exec prisma migrate status
Database schema is up to date!                                               EXIT=0
```

**El registro ya no miente en ningun punto del ciclo.** Tras el rollback Prisma considera la
migracion pendiente (que es la definicion operativa de coherente aqui) y `migrate deploy` la
reaplica sin intervencion manual. La incoherencia que motivo el rechazo de la ronda 1
(terminada y sin marca de rollback, con las tablas ya caidas) **no se reproduce**.

### (d) R20 en su forma real, no solo a nivel de esquema

Este era mi hallazgo y ahora esta cerrado con la mejor evidencia posible: **el esquema se
destruyo y se reconstruyo desde cero y quedo identico** al que valide en la ronda 1.
Comprobado por mi sobre la base reaplicada:

- `users_email_unique` sobre `lower(email)` con `WHERE (deleted_at IS NULL)`
- `users_username_unique` sobre `lower(username)` con `WHERE (deleted_at IS NULL)`
- `users_document_unique` sobre `(document_type_code, document_number)` con `WHERE (deleted_at IS NULL)`
- `roles_name_key` unico total sobre `name`
- RLS `enable=true force=true` en las tres tablas
- `document_types` con 1 fila: CC, Cedula de ciudadania, activo
- las dos FK de `users` con accion de borrado RESTRICT
- `_prisma_migrations` con 1 fila, terminada y sin marca de rollback

Los tres indices escritos a mano **sobreviven el ciclo completo**, que era justo el riesgo de
tenerlos fuera de `schema.prisma`. R20 pasa de PARCIAL a **OK**.

Ademas, la suite entera vuelve a pasar contra la base reconstruida: **57 de 57**, y
`./init.sh` completo termina en `== init OK ==`.

### (a) La atomicidad es REAL, no aparente: lo probe forzando el fallo

Leer el codigo solo demuestra que hay un BEGIN y un COMMIT alrededor de los dos pasos sobre
el mismo cliente. Eso es condicion necesaria, no prueba. Asi que **provoque el fallo exacto
que importa**: instale temporalmente un trigger BEFORE DELETE sobre `_prisma_migrations` que
lanza una excepcion, de modo que el `down.sql` (los tres DROP TABLE) tuviera exito y el
DELETE posterior reventara. Es literalmente el escenario de la ronda 1.

```
> pnpm run db:rollback   (con el DELETE saboteado)
db:rollback: la reversion de 20260806122638_users_and_roles fallo y no se aplico nada
             (transaccion deshecha): bloqueo de prueba del reviewer                 EXIT=1

> estado tras el intento fallido
tablas: _prisma_migrations, document_types, roles, users     <- las tres SIGUEN ahi
_prisma_migrations: 1 fila                                   <- el registro SIGUE ahi
indices sobre users: 6                                       <- intactos
```

**Los DROP TABLE se deshicieron.** No hay estado a medias: o se revierte todo o no se
revierte nada, y el mensaje de error lo dice sin stacktrace. El modo de fallo que causo el
rechazo de la ronda 1 **ya no es alcanzable**, y la decision del implementer de meter el
DELETE en la misma transaccion (que era suya, no del humano) esta bien fundada.

Limpieza verificada: trigger y funcion de prueba eliminados, `pg_trigger` sin residuos, base
final en `Database schema is up to date!`. No dejo nada instalado.

### (c) Ni rastro de `prisma migrate resolve --rolled-back`

- En `scripts/db-rollback.ts` la unica aparicion es la **cabecera de comentario** que explica
  por que se descarto (linea 12). Como codigo ejecutable: cero.
- El import de `runPnpmExec` **desaparecio** del script. `run-pnpm.ts` no queda huerfano: lo
  sigue usando `scripts/test-rapido.ts`.
- El DELETE esta **parametrizado** (`WHERE migration_name = $1`): el nombre de la migracion
  no se concatena nunca en el SQL. Correcto.
- Detalle bien resuelto y no pedido: si el DELETE afecta 0 filas el script **avisa y sigue**
  en vez de fallar, que es lo razonable cuando la migracion no estaba registrada.

## 8.2. Los dos tests estaticos nuevos: comprobada su no-vacuidad por mutacion

Los verifique como verifique el resto en la ronda 1: mutando el archivo que vigilan y
comprobando que el assert cae. Resultado, assert por assert:

| Assert | Mutante aplicado | Cae? |
| --- | --- | --- |
| el DELETE sobre `_prisma_migrations` parametrizado esta presente | se elimina el DELETE del script | **si, cae** |
| el codigo no contiene `migrate ... resolve` | se reintroduce la llamada al comando de Prisma con su bandera | **si, cae** |
| el codigo no contiene la bandera de rolled-back | el mismo mutante anterior | **NO cae** (ver n1) |

Conclusion: **los dos tests cumplen su funcion.** La regresion que existen para atrapar, o
sea reintroducir el comando de Prisma que no puede funcionar, **se atrapa de verdad** por el
segundo assert; y la desaparicion del DELETE tambien. No pasan por vacuidad.

## 8.3. Estado de los menores de la ronda 1

| # | Estado | Comprobacion |
| --- | --- | --- |
| **m1** (FORCE RLS inerte en local) | **Documentado con accion concreta, correcto** | Punto 7 de la seccion 6 de la bitacora. No es una nota vaga: dice **que** comprobar (si el rol de conexion de Prisma tiene BYPASSRLS), **cual es la consecuencia si no** (toda query de la app devuelve vacio o falla), **cuando** (antes del primer deploy) y **donde escribirlo** (`docs/architecture.md > Acceso a datos y autorizacion`). En la ronda 1 se quedaba corto; ahora no. |
| **m2** (archivo huerfano) | **CERRADO** | `progress/impl_modelo-usuarios-y-roles.md` borrado en el commit. `progress/` solo tiene los cuatro archivos que le tocan. |
| **m3** (assert explicito de R3) | **CERRADO, y bien resuelto** | Test nuevo "cambiar los datos de negocio del usuario no cambia su identificador": modifica `email` y `phone` y **relee por `document_number`, no por el id**. Es exactamente lo que pedi: releer por el id habria sido tautologico. Ejecutado y en verde. |
| **m4** (el mapa infravalora R12) | **CERRADO** | Corregido en `tasks.md` y en la bitacora, y ademas en R3, que tenia el mismo hueco. Los dos apuntan ya al test real. |
| **m5** (Prisma 6, typecheck fragil) | **Documentado, correcto** | Puntos 1 y 5 de la seccion 6, con el porque verificado (Prisma 7 rompe la config del schema en `package.json` y la propiedad `url` del datasource) y el remedio concreto del typecheck (`pnpm exec next typegen`). |

## 8.4. Auditoria de alcance del commit `37f1d53`

`git show --stat`: **9 archivos, todos dentro de lo autorizado.**

- `docs/architecture.md`: **un solo hunk**, la vineta 4 de "Migraciones up/down". El resto del
  documento, intacto. **Tenia permiso para esa frase y no toco nada mas.** Confirmado.
- `specs/.../design.md`: solo el parrafo 8 de scripts, mas el bloque nuevo que explica por que
  un DELETE y no el comando de Prisma, con el **coste aceptado escrito** (se pierde el rastro
  historico de que la migracion llego a aplicarse). Que la spec diga lo que el codigo hace es
  exactamente lo que debia pasar.
- `specs/.../tasks.md`: T2 reescrita, T12 marcada, filas R3 y R12 corregidas. Nada mas.
- `scripts/db-rollback.ts`, los dos archivos de tests, la bitacora, el huerfano borrado y mi
  propio informe de la ronda 1, que el implementer commiteo (correcto).
- **Cero cambios en `db/schema.prisma`, en `migration.sql`, en `down.sql`, en `lib/` y en
  `app/`.** Lo aprobado en la ronda 1 no se toco, y lo he vuelto a verificar contra la base
  igualmente (8.1).

## 8.5. Hallazgo nuevo

**n1 (menor). Uno de los tres asserts de los tests de rollback es vacuo por construccion.**
En `tests/unit/schema/identity-migration.test.ts`, el test "el rollback ya no depende de
prisma migrate resolve --rolled-back" pasa el fuente por `stripSqlComments()` antes de
afirmar. Esa funcion borra todo lo que sigue a un doble guion en cada linea, tratandolo como
comentario SQL, y la cadena que se quiere prohibir **empieza precisamente por un doble
guion**. Resultado: esa bandera no sobrevive nunca al filtro y su assert **pasa siempre**,
tambien sobre un mutante que reintroduce el comando entero. Verificado por mutacion (8.2).

**No es bloqueante y no deja ningun hueco**: el assert hermano de ese mismo test, el que
busca `migrate ... resolve`, si sobrevive al filtro y **si atrapa la regresion**, como
demostre. O sea que la guardia protege; lo que sobra es un assert que da una sensacion de
cobertura que no aporta. Lo mismo, en menor grado, con el assert que exige la mencion de
`down.sql` en el primer test: se evalua sobre el fuente **sin** filtrar, asi que lo satisface
la propia cabecera de comentarios del script.

Arreglo, cuando alguien pase por ahi: filtrar comentarios de **TypeScript** (`//` y bloques)
en vez de reutilizar el filtro de SQL, que en un `.ts` confunde un operador de linea con un
comentario. Es la clase de detalle que este mismo informe exigio al resto de la suite, por
eso queda escrito y no se calla; pero no cambia el veredicto.

## 8.6. Checklist de CHECKPOINTS.md, estado tras la ronda 2

Solo los puntos que estaban en rojo o que el arreglo podia mover:

- [x] **Todas las tasks de `tasks.md` marcadas** - T12 cerrada y **verificada por mi**, no
      solo declarada. Queda T14, que es del leader por definicion.
- [x] **Cada `R<n>` mapea a un test que lo verifica** - los 24. R20 pasa de PARCIAL a **OK**.
      R3 y R12 ganan ademas su test de integracion explicito.
- [x] **Migraciones versionadas y reversibles**; `pnpm run db:rollback` revierte **y deja
      `_prisma_migrations` coherente**. Ejecutado por mi. Era el punto del rechazo.
- [x] `pnpm run typecheck`, `pnpm run lint`, `pnpm test` (**57 de 57**) y `./init.sh`
      completo: todo en verde, corrido por mi.
- [x] Sin secretos versionados; alcance sin seed, login ni UI; capas y RLS como en la ronda 1.
- [ ] Entrada en `progress/history.md` y desmontaje del worktree: **pendientes del leader**,
      no del implementer.

## 8.7. Veredicto de la ronda 2

**APROBADO (OK).**

El bloqueante B1 esta resuelto de verdad y no de palabra: corri el ciclo completo yo mismo,
verifique el estado de la base en cada paso y ademas **sabotee el segundo paso a proposito
para comprobar que la atomicidad no era decorativa**, y no lo era. R20 queda cubierto en su
forma real, que era mi objecion de fondo. Los menores m2, m3 y m4 estan cerrados; m1 y m5
quedan documentados con accion concreta, que es lo que correspondia. El alcance del commit se
ajusta a lo autorizado, incluida la unica vineta de `docs/architecture.md`. Nada de lo
aprobado en la ronda 1 se rompio: lo he vuelto a comprobar contra una base reconstruida desde
cero.

Queda un unico menor nuevo (n1): un assert muerto en un test cuyo assert hermano si hace el
trabajo. No condiciona la aprobacion.

La feature puede pasar a `done` una vez el leader ejecute T14 (merge con `dev` y `./init.sh`).
