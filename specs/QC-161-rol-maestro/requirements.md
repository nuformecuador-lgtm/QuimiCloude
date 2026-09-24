# QC-161 — rol-maestro · requirements.md

> **Zona** backend · **Complejidad** — · **depends_on** — · **Rama** feature/QC-161-rol-maestro
>
> **Alcance.** Nace el rol **Maestro** (dueño de la plataforma, por encima de las empresas) y el
> catálogo gana `empresas.consultar` y `empresas.modificar`. El Maestro recibe **solo** esos dos. El
> primer Maestro lo crea el seed con credenciales de `.env`, igual que el Administrador inicial. El
> Maestro no pertenece a ninguna empresa y nunca aparece en el selector de roles.
>
> **Lo que NO entra.** Operar sobre empresas (listar, alta, edición, baja) y su pantalla: **QC-162**
> «Gestión de empresas por el Maestro». Aquí los permisos nacen y nadie los exige todavía.
>
> Sembrado por `/afinar-feature` el 2026-09-24. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Cada requisito cita entre corchetes la fila de «Decisiones cerradas» que lo origina, numeradas
> [D1]..[D12] en el orden de la tabla. Las doce quedan cubiertas; el mapa inverso está al final.
> Ningún requisito afirma el **total** del catálogo de permisos: QC-142 y QC-168 también lo
> enmiendan y el orden de merge no está fijado (heredado de QC-144, [D3]). Donde hace falta
> contar, se afirma la **presencia y la ausencia de códigos concretos**.

### El Maestro frente al Administrador

- **R1.** El sistema NO DEBE ofrecer al Maestro a ninguna operación con ámbito de empresa: la lista
  de usuarios de cualquier empresa NO DEBE incluirlo, y SI una edición, una baja o un cambio de
  estado de cuenta de un usuario de empresa apunta al identificador del Maestro, ENTONCES el
  sistema DEBE responder lo mismo que ante un usuario inexistente, sin escribir nada. El
  Administrador sigue gestionando solo los usuarios de su propia empresa. `[D1]` `[D11]`

### El rol

- **R2.** El catálogo de roles que siembra el sistema DEBE contener un rol llamado «Maestro», con
  una descripción no vacía, además de Administrador, Operador y Empacador, cuyos nombres y
  descripciones NO DEBEN cambiar. `[D2]`
- **R3.** El literal del nombre del rol Maestro DEBE aparecer entre comillas en **un único** archivo
  del código de producción, el catálogo de roles de `identity`; cualquier otro archivo de producción
  que lo necesite DEBE importar su constante. `[D2]`
- **R4.** El rol Maestro DEBE ser global: DEBE existir **una sola** fila «Maestro» en el catálogo de
  roles, sin ningún campo de empresa, y la misma fila sirve para cualquier usuario Maestro. `[D2]`

### El catálogo de permisos

- **R5.** El catálogo cerrado de permisos DEBE ganar **exactamente** dos códigos,
  `empresas.consultar` y `empresas.modificar`, y ningún otro código con módulo `empresas`. Todo
  código que el catálogo tenía antes de esta ficha DEBE seguir en él. `[D3]`
- **R6.** Cada uno de los dos códigos nuevos DEBE tener la forma `<modulo>.<accion>`, con módulo
  `empresas`, acción `consultar` o `modificar` respectivamente y descripción no vacía; la
  descripción de `empresas.modificar` DEBE nombrar el alta, la edición y la baja. `[D3]`
- **R7.** La documentación del catálogo en el código de producción DEBE contener un párrafo que
  diga que esta es una enmienda más al catálogo cerrado, con su ordinal, que nombre los dos códigos
  y que diga que `empresas` no es una carpeta de `lib/modules/`; ese párrafo y la frase del recuento
  NO DEBEN citar fichas, requisitos, `design.md` ni «decisión cerrada». `[D3]`

### Qué recibe cada rol

- **R8.** El seed DEBE asignar al rol Maestro **exactamente** `empresas.consultar` y
  `empresas.modificar`, escritos uno a uno, y ningún otro permiso. `[D4]`
- **R9.** Los permisos que el seed asigna al Administrador, al Operador y al Empacador NO DEBEN
  cambiar; en particular, ninguno de los tres DEBE recibir `empresas.consultar` ni
  `empresas.modificar`. `[D4]`

### El primer Maestro

- **R10.** MIENTRAS no exista ningún usuario vivo con rol Maestro, CUANDO corra el seed, el sistema
  DEBE crear **exactamente un** usuario con rol Maestro, sin empresa, con estado de cuenta activo y
  con el nombre de usuario, la contraseña y el correo leídos de tres variables de entorno propias,
  análogas a las del Administrador inicial. `[D5]`
- **R11.** SI ya existe un usuario vivo con rol Maestro, ENTONCES el seed NO DEBE leer esas tres
  variables NI crear otro Maestro, y DEBE terminar con éxito aunque falten. `[D5]`
- **R12.** SI hace falta crear el Maestro y alguna de sus tres variables falta o está vacía,
  ENTONCES el seed DEBE fallar con un error que nombre todas las que faltan, sin ningún valor, y
  NO DEBE escribir nada en la base: ni roles, ni permisos, ni asignaciones, ni empresa, ni usuarios.
  `[D5]`
- **R13.** SI hace falta crear el Maestro y su contraseña no cumple la política de credenciales,
  ENTONCES el seed DEBE fallar nombrando las reglas incumplidas y nunca la contraseña, sin escribir
  nada. Cuando sí la crea, la base DEBE guardar solo su hash, nunca el texto en claro. `[D5]`
- **R14.** El archivo de ejemplo de entorno DEBE declarar las tres variables del Maestro, sin valor.
  `[D5]`
- **R15.** La creación del Administrador inicial y de la empresa inicial NO DEBE cambiar: crear el
  Maestro NO DEBE crear, leer ni reutilizar ninguna empresa, y SI el Administrador ya existe y el
  Maestro no, ENTONCES el seed DEBE crear solo el Maestro. `[D5]`

### Autorización

- **R16.** El sistema NO DEBE autorizar ninguna operación de los módulos de negocio comparando el
  nombre del rol Maestro, ni con su literal ni con su constante: la guardia de autorización por
  permiso DEBE detectar ambas formas. `[D6]`

### Nadie exige todavía los permisos

- **R17.** Ningún archivo de código de producción, fuera de la declaración del catálogo, DEBE
  mencionar `empresas.consultar` ni `empresas.modificar` (la migración que los inserta queda fuera
  por ser la vía de alta del catálogo). `[D7]`

### Cómo se prueba

- **R18.** CUANDO el seed corra sobre una base vacía, y otra vez sobre la misma base, el sistema
  DEBE dejar a **cada** rol del catálogo sembrado exactamente los permisos que el dominio declara
  para él, y la segunda corrida NO DEBE crear ni cambiar nada. `[D8]`
- **R19.** Esta ficha NO DEBE añadir ni modificar ningún test E2E; sus requisitos se prueban con
  tests unitarios, de integración y guardias. `[D8]`

### Base de datos y dependencias

- **R20.** El sistema NO DEBE incorporar ninguna dependencia ni ninguna tabla nueva: los cambios de
  base DEBEN ser una única migración versionada, con su reversión, más el seed. `[D9]`
- **R21.** CUANDO se aplique la migración sobre una base ya sembrada, el sistema DEBE dejar el rol
  Maestro, los dos permisos nuevos y exactamente las dos asignaciones del Maestro, sin tocar las
  asignaciones de los demás roles; y SI se aplica sobre una base donde el seed ya creó cualquiera de
  esas filas, ENTONCES NO DEBE fallar ni duplicarlas. `[D9]`
- **R22.** CUANDO se revierta la migración sin ningún usuario Maestro en la base, el sistema DEBE
  dejar la base como estaba antes de aplicarla; SI existe algún usuario Maestro, ENTONCES la
  reversión DEBE fallar entera, sin borrar ni reasignar a nadie. `[D9]` `[D11]`

### El selector de roles

- **R23.** CUANDO se consulte el catálogo de roles asignables del alta y la edición de usuarios, el
  sistema NO DEBE incluir el rol Maestro. `[D10]`
- **R24.** SI una petición de alta de usuario pide el rol Maestro, ENTONCES el sistema DEBE
  rechazarla como acción no permitida sin escribir nada, aunque quien la haga tenga
  `usuarios.modificar`. `[D10]`
- **R25.** SI una petición de edición de usuario pide el rol Maestro, ENTONCES el sistema DEBE
  rechazarla como acción no permitida sin escribir nada, aunque quien la haga tenga
  `usuarios.modificar`. `[D10]`

### La empresa del Maestro

- **R26.** SI se intenta guardar en la base un usuario sin empresa cuyo rol no es Maestro —al
  crearlo o al cambiarle el rol o la empresa—, ENTONCES la base DEBE rechazarlo sin escribir nada.
  `[D11]`
- **R27.** SI se intenta guardar en la base un usuario con rol Maestro que tiene empresa —al crearlo
  o al cambiarle el rol o la empresa—, ENTONCES la base DEBE rechazarlo sin escribir nada. `[D11]`
- **R28.** Entre los usuarios vivos sin empresa, el correo, el nombre de usuario y el par tipo y
  número de documento DEBEN ser únicos, sin distinguir mayúsculas en correo y nombre de usuario, con
  la misma regla que ya rige dentro de cada empresa. *(Propuesta del spec: ver «Preguntas abiertas».)*
  `[D11]`
- **R29.** SI una operación con ámbito de empresa la invoca un actor cuya sesión no tiene empresa,
  ENTONCES el sistema DEBE rechazarla como no autorizada antes de tocar el repositorio, aunque el
  actor tuviera el permiso que la operación exige. `[D11]` `[D12]`

### El inicio de sesión del Maestro

- **R30.** CUANDO el Maestro inicie sesión con credenciales correctas y cuenta activa, el sistema
  DEBE emitirle una sesión igual que a cualquier usuario, sin empresa, y DEBE aplicarle los mismos
  cortes que a cualquiera: contraseña incorrecta, bloqueo por intentos y estado de cuenta. `[D12]`
- **R31.** MIENTRAS la sesión del Maestro esté vigente, el sistema DEBE reconocerla como válida en
  el borde y en el servidor, DEBE exponer su usuario con sus permisos y NO DEBE exponer ninguna
  empresa de sesión. `[D12]`
- **R32.** SI la empresa firmada en la sesión y la de la ficha del usuario no coinciden —una vacía y
  la otra no—, ENTONCES el sistema DEBE tratar la sesión como inexistente. SI el contenido firmado no
  trae el campo de empresa, o lo trae con un valor que no es ni vacío explícito ni un identificador
  válido, ENTONCES la sesión DEBE seguir siendo inválida, como hoy. `[D12]`
- **R33.** CUANDO el Maestro inicie sesión sin un destino de vuelta válido, el sistema DEBE llevarlo
  al destino que resulta de filtrar el menú con sus permisos, con el mismo respaldo que a cualquier
  usuario. `[D12]`
- **R34.** CUANDO el Maestro pida cualquier pantalla privada para la que no tiene permiso —entre
  ellas las de empresa—, el sistema DEBE responder el mismo 404 dentro de la zona privada que a
  cualquier usuario sin ese permiso, sin ningún dato del módulo. `[D12]`
- **R35.** CUANDO el Maestro cierre sesión, el sistema DEBE cerrarla igual que a cualquier usuario,
  y la sesión cerrada NO DEBE volver a valer. `[D12]`

### Mapa decisión → requisitos

| Decisión | Requisitos |
|---|---|
| D1 — dueño de la plataforma | R1 |
| D2 — rol «Maestro», literal único, global | R2, R3, R4 |
| D3 — `empresas.consultar` / `empresas.modificar`, enmienda | R5, R6, R7 |
| D4 — qué recibe cada rol | R8, R9 |
| D5 — primer Maestro por seed | R10, R11, R12, R13, R14, R15 |
| D6 — por permiso, nunca por rol | R16 |
| D7 — nadie los usa aún | R17 |
| D8 — sin E2E; unit e integración sí | R18, R19 |
| D9 — ni dependencia ni tabla | R20, R21, R22 |
| D10 — nunca en el selector | R23, R24, R25 |
| D11 — sin empresa | R1, R22, R26, R27, R28, R29 |
| D12 — inicia sesión como cualquiera | R29, R30, R31, R32, R33, R34, R35 |

## Preguntas abiertas

Ninguna heredada del afinado. Las que siguen las abre el spec al medir el código; ninguna bloquea
el diseño, pero todas necesitan un sí o un no del humano al aprobar.

1. **Precondición de despliegue.** El `build` encadena `prisma migrate deploy && tsx scripts/seed.ts
   && next build`, así que el seed corre en **cada** despliegue. El primero tras el merge no
   encontrará ningún Maestro y exigirá sus tres variables: si no están en Vercel (producción y
   preview), **el despliegue falla** (R12). Lo mismo en local: la plantilla de los tests de
   integración corre `db:seed`, y sin las variables en el `.env` del worktree falla toda la
   integración. ¿Quién las da de alta y cuándo? Nombres propuestos: `SEED_MAESTRO_USERNAME`,
   `SEED_MAESTRO_PASSWORD`, `SEED_MAESTRO_EMAIL`.
2. **Aterrizaje hasta QC-166.** Con solo `empresas.*` y ningún enlace de menú que los pida, R33 lleva
   al Maestro al respaldo de siempre: `/dashboard`, que le responde el 404 dentro de la zona privada,
   con cabecera y cerrar sesión (el mismo camino que QC-93 R14–R17 para un usuario sin permisos). Su
   área propia llega con QC-166, que solo tiene que añadir un enlace protegido por
   `empresas.consultar`. ¿Se acepta ese estado intermedio?
3. **Unicidad entre usuarios sin empresa (R28).** Los tres índices únicos de QC-47 llevan
   `company_id` delante y en Postgres dos `NULL` no chocan: sin índices propios, dos Maestros podrían
   tener el mismo nombre de usuario. R28 lo cierra con tres índices parciales para las filas sin
   empresa. Es una propuesta del spec, no una decisión del afinado: ¿se aprueba?
4. **Nombre de usuario repetido entre el Maestro y una empresa.** El login busca el nombre de usuario
   **sin mirar la empresa** y se queda con la primera fila (`LIMIT 1`). Ese problema ya existe entre
   dos empresas y esta ficha no lo crea, pero el Maestro lo hereda: si su nombre de usuario coincide
   con el de alguien de una empresa, el login elige uno de los dos. ¿Se deja como deuda aparte (lo
   que propone el spec) o el seed debe negarse a crear un Maestro con un nombre ya usado?
5. **Descripción del Administrador.** Dice «Acceso total al sistema.» y deja de ser exacta: no tendrá
   `empresas.*`. D4 dice «sin cambios», así que el spec **no** la toca. ¿Se confirma?
6. **Marcadores del Maestro inicial.** Como el Administrador inicial, necesita nombres, fecha de
   nacimiento, teléfono y documento de instalación. El spec propone nombres «Plataforma» / «Inicial»
   y los mismos marcadores de fecha, teléfono y documento que el Administrador. No propone «Maestro»
   como nombre de pila, porque volvería a escribir el literal del rol fuera de su archivo (R3).
7. **Aviso, sin pregunta.** D8 difiere el E2E a **QC-162**, pero la descripción de QC-166 en
   `feature_list.json` dice que es QC-166 quien «paga el diferido de QC-161». No se reabre nada: basta
   con que la ficha que tenga la pantalla lo recoja.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-24 | ¿Quién es el Maestro? | **Dueño de la plataforma**, por encima de las empresas. El Administrador sigue gestionando solo la suya. |
| 2026-09-24 | ¿Qué rol nace? | **«Maestro»** en `SEED_ROLES`, con su descripción. El literal se escribe solo en `roles.ts` (heredado de **QC-54**). Rol **global** (heredado de **QC-94/QC-144**). |
| 2026-09-24 | ¿Qué permisos nacen? | `empresas.consultar` y `empresas.modificar`; `modificar` cubre alta, edición y baja. Nombre en español `<modulo>.<accion>` (heredado de **QC-74 R1/R3**). Es una enmienda más al catálogo y se dice así en el código (**QC-38/66/86/144**). Recuento y ordinal contra `dev` al implementar: QC-142 y QC-153 también lo tocan (heredado de **QC-144**). |
| 2026-09-24 | ¿Qué recibe cada rol? | **Maestro:** solo los dos de empresas. **Administrador, Operador, Empacador:** sin cambios. Escritos uno a uno en `SEED_ROLE_PERMISSIONS` (heredado de **QC-74**). |
| 2026-09-24 | ¿Cómo nace el primer Maestro? | **Por seed, igual que el Administrador inicial**: usuario, contraseña y correo desde `.env`, con tres variables análogas a `SEED_ADMIN_*` (heredado de **QC-6**). |
| 2026-09-24 | ¿Autorización? | **Por permiso, nunca por nombre de rol** (guardia `guard-autorizacion-por-permiso`, **QC-86/QC-87**). |
| 2026-09-24 | ¿Quién usa los permisos? | **Nadie en esta ficha**: los exige QC-162. |
| 2026-09-24 | ¿E2E? | **No: se difiere a QC-162**, que tiene la pantalla (precedente **QC-94 → QC-67**, **QC-144 → QC-145**). Unitarios e integración **sí**, incluido el que fija que el seed da a cada rol exactamente sus permisos. |
| 2026-09-24 | ¿Dependencia o tabla nueva? | **Ninguna.** Solo migración y seed, que crea lo que falta (heredado de **QC-6**). |
| 2026-09-24 | ¿Maestro aparece en el selector de roles? | **Nunca.** Ni en el alta ni en la edición, y el **service rechaza** asignarlo aunque se fuerce la petición: un Maestro solo nace por seed. Cierra la escalada del Administrador de cualquier empresa a dueño de la plataforma. Enmienda **QC-94/QC-67** (todo rol aparecía en el selector). |
| 2026-09-24 | ¿A qué empresa pertenece el Maestro? | **A ninguna.** `users.company_id` sigue **obligatoria para todos menos el Maestro**: enmienda **QC-47**. La base debe garantizar que solo un Maestro tenga la empresa vacía. |
| 2026-09-24 | ¿Cómo inicia sesión el Maestro? | **Como cualquiera, y entra en esta ficha**: aterriza en su **área propia** (las pantallas son **QC-166**). Las pantallas de empresa le niegan el acceso **por permiso**, igual que a cualquiera sin permiso (**QC-93**). |
