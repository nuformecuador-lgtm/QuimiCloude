# QC-6 — seed-roles-y-usuario-inicial · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** `QC-5`, `QC-15` (ambas `done`) ·
> **Rama** `feature/QC-6-seed-roles-y-usuario-inicial` · **Épica** `QC-17 Identidad y acceso`
>
> **Alcance.** Un seed que deja la base utilizable desde cero. Siembra el catálogo de roles
> (Administrador y Operador) y crea un usuario inicial con rol Administrador, cuyas credenciales
> salen del entorno y cuya contraseña se guarda hasheada pasando por el puerto `PasswordHasher`.
> Ese usuario nace **obligado a cambiar su contraseña la primera vez que entre**, para lo cual
> esta ficha añade la columna que guarda esa marca, con su migración aditiva y su `down.sql`.
> El seed **corre automáticamente tras cada despliegue** y es idempotente en el sentido de
> **crear solo lo que falta**: correrlo dos veces no duplica nada y no pisa ningún dato que
> alguien haya cambiado a mano.
>
> **Lo que NO entra.** *Hacer cumplir* la obligación de cambiar la contraseña: esta ficha solo
> deja la marca escrita, quien la lee y bloquea el acceso es el login, o sea **QC-7**. Las reglas
> de qué es una contraseña aceptable (longitud, composición, caducidad), que van a su propia
> ficha. El tipo de documento `CC`, que ya siembra la migración de QC-4. La pantalla de
> administración de roles: QC-4 la declaró fuera por ser un catálogo cerrado y corto. El alta de
> más usuarios y el login, que son **QC-7**. Y cualquier rol más allá de los dos acordados: se
> añade con la feature que lo necesite, que es un `INSERT` y no una migración.
>
> Sembrado por `/afinar-feature` el 2026-09-01. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notacion EARS (`docs/specs.md`). Cada `R<n>` es testeable y se apoya en el bloque de Alcance
o en una fila de «Decisiones cerradas»; la fila que lo respalda va citada al final de cada
requisito entre parentesis. «Usuario vivo» = fila de `users` con `deleted_at IS NULL`
(heredado de QC-4).

**R1.** El sistema DEBE ofrecer un seed ejecutable de forma no interactiva que, sobre una base
con las migraciones aplicadas, deje el acceso inicial completo: el catalogo de roles y un
usuario con rol Administrador. (Alcance)

**R2.** CUANDO el seed se ejecuta, el sistema DEBE asegurar que existe un rol llamado
`Administrador` y un rol llamado `Operador`, cada uno con su nombre y su descripcion, creando
el que falte. (Decision 2026-09-01 «¿Cuales son los roles base?»)

**R3.** El seed NO DEBE crear ningun rol distinto de `Administrador` y `Operador`. (Alcance >
Lo que NO entra: «cualquier rol mas alla de los dos acordados»)

**R4.** SI no existe ningun usuario vivo con rol `Administrador`, ENTONCES el seed DEBE crear
el usuario inicial y asignarle el rol `Administrador`. (Decision «¿Que rol lleva el usuario
inicial?»)

**R5.** CUANDO el sistema va a crear el usuario inicial, DEBE tomar su nombre de usuario de
`SEED_ADMIN_USERNAME`, su contrasena de `SEED_ADMIN_PASSWORD` y su correo de
`SEED_ADMIN_EMAIL`. (Decisiones «¿De donde salen su usuario y su contrasena?» y «¿Y los seis
datos personales obligatorios?»)

**R6.** El repositorio NO DEBE contener ninguna credencial del usuario inicial: ni nombre de
usuario, ni contrasena, ni correo escritos como valor literal en ningun archivo versionado.
(Decision «¿De donde salen su usuario y su contrasena?»: «Ninguna credencial queda escrita en
el repo»)

**R7.** CUANDO el sistema crea el usuario inicial, DEBE rellenar nombres, apellidos, fecha de
nacimiento, telefono y numero de documento con marcadores fijos y reconocibles definidos en el
propio seed, y el tipo de documento con `CC`. (Decision «¿Y los seis datos personales
obligatorios?»)

**R8.** CUANDO el sistema guarda la contrasena del usuario inicial, DEBE guardar el valor que
devuelve el puerto `PasswordHasher`, y NO DEBE guardar en ninguna columna la contrasena en
claro. (Decision «¿La contrasena se hashea llamando a bcrypt?»)

**R9.** CUANDO el sistema crea el usuario inicial, DEBE dejarlo marcado como obligado a cambiar
su contrasena. (Decision «¿Se obliga a cambiar la contrasena al primer ingreso?»)

**R10.** El sistema DEBE guardar esa marca en una columna de `users`, con identificador en
ingles y `snake_case`, cuyo valor para cualquier fila que no la fije explicitamente es «no
obligado». (Decisiones «¿Se obliga a cambiar la contrasena al primer ingreso?» y «Borrado,
marcas de tiempo, idioma del esquema»)

**R11.** La migracion que anade esa columna DEBE ser aditiva —no altera ni elimina ninguna
columna, indice, restriccion ni fila existente— y DEBE traer su `down.sql` escrito a mano, que
elimina la columna y deja el resto de `users` como estaba. (Decision «¿Se obliga a cambiar la
contrasena al primer ingreso?»: «migracion aditiva + down.sql»)

**R12.** SI ya existe un usuario vivo con rol `Administrador`, ENTONCES el seed NO DEBE leer
las variables `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` ni `SEED_ADMIN_EMAIL`, y DEBE
terminar con exito. (Decision «Si corre en cada despliegue y faltan las `SEED_ADMIN_*`…»)

**R13.** SI hay que crear el usuario inicial y falta o esta vacia alguna de las variables
`SEED_ADMIN_*`, ENTONCES el seed DEBE detenerse con un error que nombre la variable ausente y
NO DEBE dejar creada ni modificada ninguna fila. (Decision «Si corre en cada despliegue y
faltan las `SEED_ADMIN_*`…»: «se detiene con un error claro sin crear nada a medias»)

**R14.** CUANDO el seed se ejecuta sobre una base donde el rol o el usuario inicial ya existen,
NO DEBE crear filas duplicadas: el numero de filas de `roles` y de `users` DEBE quedar igual
que antes de la ejecucion. (Decision «En la segunda corrida, ¿que gana?»)

**R15.** CUANDO el seed se ejecuta sobre una base donde el rol o el usuario inicial ya existen,
NO DEBE modificar ningun campo de esas filas —incluidos el hash de la contrasena, la marca de
cambio de contrasena, la descripcion del rol y `updated_at`—, aunque su valor difiera del que
el seed habria escrito. (Decision «En la segunda corrida, ¿que gana?»: «los deja intactos,
incluida una contrasena ya cambiada. Nunca reescribe»)

**R16.** CUANDO el seed se ejecuta dos veces seguidas contra una base real, la segunda
ejecucion DEBE terminar con exito y dejar exactamente el mismo estado que dejo la primera:
mismos identificadores y mismos valores en todas las columnas. (Decision «¿Hace falta E2E?»:
la verificacion de esta ficha es la doble corrida contra base real)

**R17.** El seed NO DEBE crear, modificar ni borrar ninguna fila de `document_types`.
(Decision «¿El seed siembra los tipos de documento?»)

**R18.** El seed NO DEBE escribir la contrasena ni ninguna otra credencial en su salida
estandar, en su salida de error ni en ningun mensaje de excepcion. (Decision «¿De donde salen
su usuario y su contrasena?» + `docs/conventions.md > Manejo de errores`)

**R19.** CUANDO se despliega la aplicacion, el sistema DEBE ejecutar el seed automaticamente,
sin que ninguna persona tenga que lanzarlo a mano. (Decision «¿Cuando corre el seed?»)

**R20.** SI el seed falla durante un despliegue, ENTONCES el despliegue DEBE fallar de forma
visible y la version nueva NO DEBE quedar publicada. (Decision «Si corre en cada despliegue y
faltan las `SEED_ADMIN_*`…»: «ahi si se detiene»)

**R21.** El seed NO DEBE anadir ninguna dependencia a `package.json`. (Decision «¿Libreria
nueva o a mano?»)

## Preguntas abiertas

1. **Qué reglas debe cumplir una contraseña aceptable.** Hoy de `SEED_ADMIN_PASSWORD` solo se
   exige que exista. Longitud mínima, composición y caducidad se acordaron el 2026-09-01 como
   ficha aparte, no como supuesto de esta. No bloquea: cuando esa política exista, aplicarla al
   seed es añadir una validación de borde, no rehacer nada.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-01 | ¿Cuáles son «los roles base»? | Dos: **Administrador** (acceso total) y **Operador** (día a día). Cierra la pregunta abierta 2 de `specs/4-modelo-usuarios-y-roles/requirements.md`, que la difirió explícitamente a esta ficha. |
| 2026-09-01 | ¿Qué rol lleva el usuario inicial? | **Administrador**. Es el único que deja la base utilizable: sin él nadie puede crear a los demás. |
| 2026-09-01 | ¿De dónde salen su usuario y su contraseña? | De `SEED_ADMIN_USERNAME` y `SEED_ADMIN_PASSWORD`. Ninguna credencial queda escrita en el repo. |
| 2026-09-01 | ¿Y los seis datos personales obligatorios? | Marcadores fijos y evidentes en el seed (nombres, apellidos, fecha de nacimiento, teléfono, número de documento), salvo el **correo**, que sale de `SEED_ADMIN_EMAIL` por ser único en la tabla. |
| 2026-09-01 | En la segunda corrida, ¿qué gana? | **Lo que ya está en la base.** El seed solo crea lo que falta: si el rol o el usuario existen, los deja intactos, incluida una contraseña ya cambiada. Nunca reescribe. |
| 2026-09-01 | ¿Cuándo corre el seed? | **Automáticamente después de cada despliegue.** No es un comando que alguien recuerde lanzar a mano. |
| 2026-09-01 | Si corre en cada despliegue y faltan las `SEED_ADMIN_*`, ¿se rompe el despliegue? | **Solo si hay algo que crear.** El seed comprueba primero si el usuario inicial existe; si existe, ni lee las variables y sigue. Solo un entorno nuevo las exige, y ahí sí se detiene con un error claro sin crear nada a medias. |
| 2026-09-01 | ¿Se obliga a cambiar la contraseña al primer ingreso? | **Sí.** El usuario inicial nace marcado. La marca es una **columna nueva en `users`** que añade esta ficha (migración aditiva + `down.sql`), porque el seed es quien crea a alguien con una contraseña que esa persona no eligió. **Hacerla cumplir es de QC-7**, no de aquí. |
| 2026-09-01 | ¿La contraseña se hashea llamando a bcrypt? | No. Pasa por el puerto `PasswordHasher` (`lib/modules/identity/ports/password-hasher.ts`), cableado en `lib/composition/`. Heredado de **QC-5** y exigido por la dirección de dependencias de **QC-15**. |
| 2026-09-01 | ¿El seed siembra los tipos de documento? | No. `CC` ya lo inserta la migración `20260806122638_users_and_roles` de **QC-4**. |
| 2026-09-01 | Borrado, marcas de tiempo, idioma del esquema | Heredado de **QC-4**: borrado lógico, `created_at`/`updated_at`/`deleted_at`, identificadores en inglés y `snake_case`. La columna nueva sigue esa convención. |
| 2026-09-01 | ¿Hace falta E2E (Playwright)? | **No, y se difiere aquí con motivo.** `CHECKPOINTS.md` lo pide para flujos críticos de autenticación, pero el seed no tiene interfaz: no hay nada que un navegador recorra. Su verificación es un test de integración que **corre el seed dos veces** y comprueba que la segunda no duplica ni modifica. El E2E de autenticación entra con **QC-7**. |
| 2026-09-01 | ¿Librería nueva o a mano? | Ninguna dependencia nueva. El seed usa Prisma y el `PasswordHasher` que ya existen. |
| 2026-10-08 | ¿El `build` sigue siendo de tres comandos (migrar, sembrar, compilar)? | **No: son cuatro.** El build incluye `prisma generate` entre la migración y el seed (b79a43c4): `prisma migrate deploy && prisma generate && tsx scripts/seed.ts && next build`. El seed necesita el cliente generado, y Prisma recomienda generarlo en el build porque Vercel cachea `node_modules` (si no, queda un cliente viejo). Siguen unidos por `&&`; R19 y R20 no cambian. Donde T15 dice «los tres», léase los cuatro. |
