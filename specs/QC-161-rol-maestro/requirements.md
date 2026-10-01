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
> [D1]..[D20] en el orden de la tabla (D1–D12 del afinado del 2026-09-24; D13–D20 de la revisión
> humana del 2026-09-25). Las veinte quedan cubiertas; el mapa inverso está al final.
> Ningún requisito afirma el **total** del catálogo de permisos: QC-168 y QC-169 siguen en curso y el
> orden de merge no está fijado (heredado de QC-144, [D3]); `dev` ya tiene una guardia que prohíbe
> totales fijos en los tests. Donde hace falta contar, se afirma la **presencia y la ausencia de
> códigos concretos**.
>
> Vuelta de F1.2 del 2026-09-25: se reescriben R2, R10, R14, R28 y R33 y se añaden R36–R44. Ningún
> otro requisito cambia de texto ni de número.

### El Maestro frente al Administrador

- **R1.** El sistema NO DEBE ofrecer al Maestro a ninguna operación con ámbito de empresa: la lista
  de usuarios de cualquier empresa NO DEBE incluirlo, y SI una edición, una baja o un cambio de
  estado de cuenta de un usuario de empresa apunta al identificador del Maestro, ENTONCES el
  sistema DEBE responder lo mismo que ante un usuario inexistente, sin escribir nada. El
  Administrador sigue gestionando solo los usuarios de su propia empresa. `[D1]` `[D11]`

### El rol

- **R2.** El catálogo de roles que siembra el sistema DEBE contener un rol llamado «Maestro», con
  una descripción no vacía, además de Administrador, Operador y Empacador, cuyos nombres y
  descripciones NO DEBEN cambiar; en particular, la descripción del Administrador sigue siendo
  «Acceso total al sistema.». `[D2]` `[D19]`
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
  DEBE crear **exactamente un** usuario con rol Maestro, sin empresa, con estado de cuenta activo,
  con el nombre de usuario, la contraseña y el correo leídos de `SEED_MAESTRO_USERNAME`,
  `SEED_MAESTRO_PASSWORD` y `SEED_MAESTRO_EMAIL`, con nombres «Plataforma», apellidos «Inicial» y
  los mismos marcadores de fecha de nacimiento, teléfono y documento que el Administrador inicial.
  `[D5]` `[D17]` `[D20]`
- **R11.** SI ya existe un usuario vivo con rol Maestro, ENTONCES el seed NO DEBE leer esas tres
  variables NI crear otro Maestro, y DEBE terminar con éxito aunque falten. `[D5]`
- **R12.** SI hace falta crear el Maestro y alguna de sus tres variables falta o está vacía,
  ENTONCES el seed DEBE fallar con un error que nombre todas las que faltan, sin ningún valor, y
  NO DEBE escribir nada en la base: ni roles, ni permisos, ni asignaciones, ni empresa, ni usuarios.
  `[D5]` `[D17]`
- **R13.** SI hace falta crear el Maestro y su contraseña no cumple la política de credenciales,
  ENTONCES el seed DEBE fallar nombrando las reglas incumplidas y nunca la contraseña, sin escribir
  nada. Cuando sí la crea, la base DEBE guardar solo su hash, nunca el texto en claro. `[D5]`
- **R14.** El archivo de ejemplo de entorno DEBE declarar `SEED_MAESTRO_USERNAME`,
  `SEED_MAESTRO_PASSWORD` y `SEED_MAESTRO_EMAIL`, sin valor. `[D5]` `[D17]`
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
- **R28.** SI se intenta guardar en la base un usuario vivo sin empresa cuyo correo, sin distinguir
  mayúsculas, o cuyo par tipo y número de documento coincide con el de otro usuario vivo sin empresa
  —al crearlo o al cambiarle esos datos—, ENTONCES la base DEBE rechazarlo sin escribir nada. Un
  usuario sin empresa dado de baja NO DEBE ocupar ni su correo ni su documento. (El nombre de usuario
  lo cubre R36.) `[D11]` `[D15]`
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
  usuario; MIENTRAS ningún enlace del menú exija `empresas.consultar` ni `empresas.modificar`, ese
  destino DEBE ser el respaldo de siempre, que le responde el 404 dentro de la zona privada con su
  cabecera y su cierre de sesión. `[D12]` `[D18]`
- **R34.** CUANDO el Maestro pida cualquier pantalla privada para la que no tiene permiso —entre
  ellas las de empresa—, el sistema DEBE responder el mismo 404 dentro de la zona privada que a
  cualquier usuario sin ese permiso, sin ningún dato del módulo. `[D12]`
- **R35.** CUANDO el Maestro cierre sesión, el sistema DEBE cerrarla igual que a cualquier usuario,
  y la sesión cerrada NO DEBE volver a valer. `[D12]`

### Unicidad del nombre de usuario y del correo

- **R36.** SI se intenta guardar en la base un usuario vivo —al crearlo o al cambiarle el nombre de
  usuario— cuyo nombre de usuario coincide, sin distinguir mayúsculas, con el de otro usuario vivo de
  **cualquier** empresa o sin empresa, ENTONCES la base DEBE rechazarlo sin escribir nada. Un usuario
  dado de baja NO DEBE ocupar su nombre de usuario. `[D13]`
- **R37.** SI se intenta guardar un usuario vivo de una empresa cuyo correo, sin distinguir
  mayúsculas, o cuyo par tipo y número de documento coincide con el de otro usuario vivo **de la
  misma empresa**, ENTONCES la base DEBE rechazarlo sin escribir nada; CUANDO la coincidencia sea
  solo con un usuario de otra empresa o sin empresa, el sistema DEBE aceptarlo. `[D14]` `[D15]`
- **R38.** CUANDO se aplique la migración sobre una base en la que ningún nombre de usuario se
  repite entre usuarios vivos, sin distinguir mayúsculas, el sistema DEBE dejar en vigor la
  unicidad de R36 sin cambiar ninguna fila de usuario. `[D13]`
- **R39.** SI al aplicar la migración dos o más usuarios vivos comparten nombre de usuario, sin
  distinguir mayúsculas, ENTONCES la migración DEBE fallar entera, sin renombrar, borrar ni dar de
  baja a nadie y sin dejar aplicada ninguna parte, con un mensaje que liste cada nombre repetido y
  cuántos usuarios vivos lo comparten. *(Propuesta, pendiente de confirmar: ver «Preguntas
  abiertas».)* `[D13]`
- **R40.** SI un alta o una edición de usuario pide un nombre de usuario que ya tiene otro usuario
  vivo, de su empresa, de otra o sin empresa, ENTONCES el sistema DEBE rechazarla con el error de
  nombre de usuario duplicado, que señala ese campo, sin escribir nada y sin exponer ningún dato del
  usuario con el que choca. `[D13]`
- **R41.** El mensaje del error de nombre de usuario duplicado NO DEBE decir que el choque es dentro
  de la empresa; los mensajes de correo duplicado y de documento duplicado DEBEN seguir diciéndolo.
  `[D13]` `[D14]`
- **R42.** SI hace falta crear el Maestro y su nombre de usuario coincide, sin distinguir
  mayúsculas, con el de cualquier usuario vivo o con el del Administrador inicial que la misma
  corrida va a crear, ENTONCES el seed DEBE fallar con un error que diga que el nombre de usuario del
  Maestro ya está en uso, sin escribir su valor, y NO DEBE escribir nada en la base. `[D16]`
- **R43.** SI hace falta crear el Maestro y su correo coincide, sin distinguir mayúsculas, con el de
  otro usuario vivo sin empresa, ENTONCES el seed DEBE fallar con un error que diga que el correo del
  Maestro ya está en uso, sin escribir su valor, y NO DEBE escribir nada en la base; CUANDO el correo
  coincida solo con el de un usuario de una empresa, el seed DEBE crearlo. `[D15]` `[D16]`
- **R44.** CUANDO alguien inicie sesión, el sistema DEBE localizar la cuenta solo por su nombre de
  usuario, sin distinguir mayúsculas y sin pedir empresa, y la sesión emitida DEBE ser la de la
  única cuenta viva con ese nombre, sea de una empresa o el Maestro. `[D12]` `[D13]`

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
| D12 — inicia sesión como cualquiera | R29, R30, R31, R32, R33, R34, R35, R44 |
| D13 (D-a) — nombre de usuario único en todo el sistema | R36, R38, R39, R40, R41, R44 |
| D14 (D-b) — correo único por empresa | R37, R41 |
| D15 (D-c) — el Maestro no se duplica | R28, R37, R43 |
| D16 — el seed se niega a duplicar al Maestro | R42, R43 |
| D17 — variables `SEED_MAESTRO_*` | R10, R12, R14 |
| D18 — aterrizaje en el 404 privado hasta QC-166 | R33 |
| D19 — descripción del Administrador sin tocar | R2 |
| D20 — marcadores «Plataforma» / «Inicial» | R10 |

## Preguntas abiertas

1. **Nombres de usuario ya repetidos entre empresas en la base desplegada** *(propuesta, pendiente
   de confirmar: el humano aprobó el 2026-09-25 antes de verla)*. Hasta hoy la unicidad del nombre de
   usuario es por empresa (QC-47), así que la base de `dev`, la de preview o la de producción pueden
   tener ya dos usuarios vivos con el mismo nombre en empresas distintas. El spec no puede saberlo:
   no hay acceso a esas bases y ningún dato del repo lo dice. En la base de los tests de integración
   no hay caso: la migración corre antes del seed, sobre una base sin usuarios. **Propuesta (R39):**
   la migración comprueba los duplicados **antes** de tocar nada y, si hay alguno, falla entera con
   un mensaje que lista cada nombre repetido (en minúsculas) y cuántos usuarios vivos lo comparten;
   no renombra, no borra ni da de baja a nadie. Como el `build` corre `prisma migrate deploy`, el
   despliegue falla hasta que alguien resuelva los duplicados a mano. Es el mismo criterio que ya
   aplicó la reversión de QC-47 («fallar antes que perder el dato»), que solo contaba los duplicados;
   esta propuesta además los nombra. Lo que hay que confirmar: (a) que se falla en vez de renombrar;
   (b) que el mensaje puede llevar los nombres de usuario, que quedarán en el log del `build` de
   Vercel. Si (b) es que no, el mensaje da solo el número de nombres repetidos.

**Nota, sin pregunta (antes pregunta 7).** D8 difiere el E2E a **QC-162**, pero la descripción de
QC-166 en `feature_list.json` dice que es QC-166 quien «paga el diferido de QC-161». No se reabre
nada: basta con que la ficha que tenga la pantalla lo recoja.

**Preguntas del spec del 2026-09-24 ya resueltas** (quedan en «Decisiones cerradas» con fecha
2026-09-25): la 1 → D17; la 2 → D18; la 3 → absorbida por D13 y D15; la 4 → cerrada por D13; la
5 → D19; la 6 → D20.

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
| 2026-09-25 | (D-a) ¿El nombre de usuario es único por empresa o en todo el sistema? | **Único en todo el sistema**, sin distinguir mayúsculas y entre usuarios vivos, como hoy. Enmienda la unicidad por empresa de **QC-47** para el nombre de usuario. Con esto el login, que busca sin empresa, deja de ser ambiguo: **cierra la pregunta 4 del spec**. Texto del humano: «nombre de usuario debe ser unico, el email tambien por empresa, si es el maestro no se debe poder duplicar». |
| 2026-09-25 | (D-b) ¿Y el correo? | **Sigue siendo único por empresa** (regla de QC-47, sin cambios). El documento, también. |
| 2026-09-25 | (D-c) ¿Se puede duplicar el Maestro? | **No.** Su nombre de usuario lo cubre D-a; su correo y su documento no pueden repetir los de otro usuario vivo sin empresa (unicidad propia para las filas sin empresa, la propuesta que el spec hacía en R28). **Absorbe la pregunta 3 del spec** junto con D-a. |
| 2026-09-25 | ¿Qué hace el seed ante un choque? | **Se niega** a crear el Maestro si su nombre de usuario choca con el de cualquier usuario vivo o su correo con el de otro Maestro: error claro y sin escribir nada. |
| 2026-09-25 | ¿Quién da de alta `SEED_MAESTRO_*` y cuándo? (pregunta 1) | `SEED_MAESTRO_USERNAME`, `SEED_MAESTRO_PASSWORD` y `SEED_MAESTRO_EMAIL`: las da de alta **el humano** en Vercel (producción y preview) y en el `.env` **antes del merge**. Es condición del PR. |
| 2026-09-25 | ¿Aterrizaje hasta QC-166? (pregunta 2) | **Se acepta** el estado intermedio: el Maestro aterriza en el 404 dentro de la zona privada hasta que QC-166 añada su enlace. |
| 2026-09-25 | ¿Descripción del Administrador? (pregunta 5) | **No se toca**: sigue «Acceso total al sistema.». |
| 2026-09-25 | ¿Marcadores del Maestro inicial? (pregunta 6) | Nombres **«Plataforma»**, apellidos **«Inicial»**; fecha, teléfono y documento, los mismos marcadores que el Administrador inicial. |
