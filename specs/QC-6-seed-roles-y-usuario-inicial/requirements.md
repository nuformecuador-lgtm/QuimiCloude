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

_Pendiente: los escribe spec_author (F1.2)._

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
