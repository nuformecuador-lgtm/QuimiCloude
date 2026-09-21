# Inventario de extraccion — `login`

| Campo | Valor |
| --- | --- |
| Modulo | **login** — el flujo de autenticacion del modulo `identity`, **sin la pantalla** |
| Como se resolvio el argumento | **Frontera fijada por el humano** sobre la ficha **QC-7** (`login-usuario-y-contrasena`). No se calculo cierre transitivo propio: la lista de 25 archivos la entrego el leader ya confirmada |
| Naturaleza | `flujo` (por tanto el eje 13 **si** aplica) |
| SHA de `dev` | `667b04ec97eff9100546565714af60be3ede1db8` |
| Fecha | 2026-09-13 |
| Specs leidos | `specs/QC-7-login-usuario-y-contrasena/{requirements,design,tasks}.md`, `specs/10-pantalla-de-login/` (indice), `specs/QC-30-rediseno-login/` (indice), `docs/architecture.md` |
| Prohibiciones respetadas | No se leyo nada de `.worktrees/`. No se modifico ningun archivo del modulo |

> **Regla de cita.** Toda fila lleva `archivo:linea` o `spec §seccion`. Lo que no la tiene va
> escrito literalmente como `No verificado: …` y **no pasa a `prompt.md`**.

## Aviso de antiguedad: donde el spec y el codigo discrepan

QC-7 es del 2026-09-01/03. Encima pasaron QC-9, QC-19, QC-48, QC-65, QC-75, QC-78, QC-79 y
QC-23. **Manda el codigo.** Las discrepancias verificadas:

| Lo que dice QC-7 | Lo que hace hoy el codigo | Evidencia |
| --- | --- | --- |
| El valor de la cookie es `v1` y lleva **solo** `sub`, `iat`, `exp` (`design.md > 5.1`, R12) | Es `v4` y lleva `sub`, `iat`, `exp`, `role`, `cid`, `sid`. Sin compatibilidad hacia atras en ninguna subida | `session-token.ts:67`, `:86-99`, `:226-238` |
| La firma se hace con `node:crypto` (`createHmac`, `timingSafeEqual`) (`design.md > 6.3`) | Se hace con **WebCrypto** (`crypto.subtle`) y una comparacion en tiempo constante escrita a mano, para que el middleware la pueda cargar en el borde | `session-token.ts:7-20`, `:150-184` |
| `LoginAttemptRecorder.record(userId, AccountLockState)` (`design.md > 8`) | Dos primitivas: `compareAndSet(...6 args)` y `set(...3 args)`, ambas escribiendo tambien el estado de cuenta | `login-attempt-recorder.ts:59-75` |
| Exito -> se redirige siempre a `DASHBOARD_ROUTE` (R19) | Se redirige al destino de vuelta pedido si es interno y valido; si no, al **primer item del menu ya filtrado por permisos**; `DASHBOARD_ROUTE` es solo el ultimo respaldo | `login-action.ts:85-128` |
| El corte de acceso es «usuario no borrado + contrasena + no bloqueado» | Hay **tres cortes mas**: estado de cuenta **efectivo** `active` (QC-78), empresa no dada de baja (QC-48) y la cuenta no entra si su estado no es `active` ni con la contrasena correcta | `verify-credentials.ts:209`, `:227` |
| El bloqueo vive en tres columnas de `users` y nada mas | El bloqueo por intentos y `users.account_status` se escriben **en la misma operacion**, con su rastro (`account_status_changed_at/_by`) | `login-attempt-recorder.ts:14-30`, `user-credentials-prisma.ts:121-127` |
| «El unico resultado de fallo es `{ok:false}`» (R2, R3, R28) | Sigue siendo cierto, y ahora tambien para empresa de baja y estado no activo — es la **misma instancia congelada** | `verify-credentials.ts:52`, `:209`, `:227` |

## Archivos del cierre (25), y el rol de cada uno

### Dominio (7) — `lib/modules/identity/domain/`

| Archivo | Rol |
| --- | --- |
| `verify-credentials.ts` | El caso de uso entero: normaliza, lee, verifica, corta por estado y por empresa, registra el fallo con reintento y emite la sesion. La decision vive aqui |
| `credentials.ts` | El esquema de la entrada (`loginInputSchema`) y el tope de longitud de la credencial. Contrato congelado desde QC-7 |
| `session.ts` | El ticket de sesion (quien, desde cuando, hasta cuando) y la duracion de 8 h |
| `session-claims.ts` | El esquema del contenido firmado ya decodificado y la regla de caducidad (`>=`). Es el **lector**; el emisor es `session.ts` + el codec |
| `account-lock.ts` | La politica de bloqueo por intentos: 5 fallos, escalada 1/5/15/60 min, tope y reinicio. Dominio puro, sin reloj propio |
| `account-status.ts` | El conjunto cerrado de estados de cuenta (`active/pending/inactive/blocked`) y los dos con nombre |
| `effective-account-status.ts` | La UNICA traduccion de «lo que dice la columna» a «lo que significa ahora», y que estado corresponde persistir tras un intento |

### Puertos (5) — `lib/modules/identity/ports/`

| Archivo | Rol |
| --- | --- |
| `user-credentials-reader.ts` | Lo minimo que el dominio necesita de una fila de usuario para decidir. Define `AuthenticatableUser` |
| `session-writer.ts` | «Abre esta sesion». El dominio decide **que** sesion; el adaptador sabe **como** se transporta |
| `login-attempt-recorder.ts` | Las dos primitivas de escritura del intento: condicional (fallo) e incondicional (exito) |
| `password-hasher.ts` | `hash` / `verify`. Cuatro lineas, sin comentario |
| `session-id-factory.ts` | Produce el identificador de UNA sesion. Sin parametros: no hay nada de donde derivarlo |

### Adaptadores (5)

| Archivo | Rol |
| --- | --- |
| `adapters/driven/session/session-token.ts` | El **codec**: version, troceado, base64url, HMAC-SHA-256 con WebCrypto, comparacion en tiempo constante y lectura del secreto. Unico dueño de la firma en el repo |
| `adapters/driven/session/session-cookie.ts` | Solo **transporte**: `cookies()` de `next/headers`, atributos de la cookie, lectura y borrado |
| `adapters/driven/persistence/user-credentials-prisma.ts` | La consulta `$queryRaw` que autentica (una sola lectura, con dos `JOIN`) y las dos escrituras del intento |
| `adapters/driving/login-action.ts` | La Server Action: traduce `FormData`, llama al caso de uso, calcula el destino y redirige |
| `adapters/driving/login-form-state.ts` | La union discriminada del estado del formulario y los tres copys (provisionales) |

### Frontera (2)

| Archivo | Rol |
| --- | --- |
| `lib/modules/identity/index.ts` | Contrato publico del modulo: **solo** reexporta de `./domain`; ningun `'use server'`, Prisma ni `next/*` en su cierre transitivo |
| `lib/composition/index.ts` | El UNICO sitio donde cada puerto se ata a su adaptador y se construye la fachada `identity` |

### Tests (6)

| Archivo | Rol |
| --- | --- |
| `tests/unit/identity/verify-credentials.test.ts` | La decision entera con puertos falsos: 30+ casos, sin base, sin bcrypt real, sin Next |
| `tests/unit/identity/login-action.test.ts` | El borde: campos vacios, mensaje unico, `attemptId`, destino de vuelta, «no toca base ni cookie» |
| `tests/unit/identity/session-token.test.ts` | Paridad byte a byte del HMAC con `node:crypto`, tiempo constante, rechazo del formato anterior |
| `tests/unit/identity/account-lock.test.ts` | La escalada entera con `now` inyectado, sin esperar 60 s a que caduque nada |
| `tests/integration/identity/login.int.test.ts` | Contra Postgres real: concurrencia, ABA del CAS, bloqueo, estado de cuenta, empresa de baja |
| `e2e/login.spec.ts` | Navegador real: entra y recibe cookie `httpOnly`; falla y no la recibe; empresa de baja; cuenta no activa |

---

## Los 21 ejes

**Precedencia declarada** (un eje puede llevar varias decisiones dentro): si alguna de sus
decisiones no la responde nadie -> **HUECO**; si alguna eligio sin porque escrito ->
**IMPLICITA**; si todas tienen porque -> **RESUELTO**. Las sub-decisiones resueltas de un eje
marcado IMPLICITA o HUECO **no se pierden**: van en la tabla de `## Decisiones resueltas` de
mas abajo, y de ahi las toma la pasada 2.

| # | Eje | Estado | Evidencia (archivo:linea o spec §) | Nota |
| --- | --- | --- | --- | --- |
| 1 | Proposito y actor | RESUELTO | `specs/QC-7…/requirements.md:5-14` (§Alcance); `verify-credentials.ts:16-21` | Una persona con cuenta en el ERP entrega usuario y contrasena y, si todo encaja, sale con una sesion de 8 h emitida y aterriza en la pantalla que pidio |
| 2 | Forma de la entrada primaria | RESUELTO | `requirements.md:44` (D1: usuario + contrasena, **no** correo, origen: description del board); `credentials.ts:20-24` | Dos campos y nada mas: ni OTP, ni magic link, ni SSO, ni segundo factor, ni selector de empresa (`user-credentials-reader.ts:14-17`: la empresa sale de la ficha, nunca del formulario) |
| 3 | Camino de recuperacion y quien lo ejecuta | RESUELTO | `requirements.md:33-35`; `design.md > 5.5` (`:303-309`, `:311-318`); `account-lock.ts:12-15`; `specs/QC-96-recuperar-contrasena-olvidada/` existe | **Nadie lo ejecuta**: el bloqueo caduca solo, nunca es permanente, y la razon escrita es que no hay pantalla de administracion que lo levante. La recuperacion de contrasena esta **fuera** de este flujo y es ficha propia (QC-96) |
| 4 | Quien obtiene acceso | RESUELTO | `design.md > 6.5` (`:519`: «ERP de un solo tenant, con usuarios conocidos y **sin registro publico**»); `account-status.ts:38-49`; `index.ts:176-187` (centinela de QC-79) | Alta administrada: una cuenta nace `pending` y sin credencial utilizable; quien la crea es otro flujo (QC-66) y quien la estrena, un enlace de establecimiento (QC-79). Este modulo **solo** verifica |
| 5 | Estado y duracion de la sesion | **HUECO** | Resuelto: `session.ts:6-12`, `design.md > 5.4`, `> 5.2`, `> 6.2`, `session-token.ts:34-67`, `session-cookie.ts:43-57`. Abierto: `requirements.md:178-181` (pregunta abierta 3) | Token firmado sin estado, 8 h **absolutas**, sin renovacion ni «recordarme», cookie `httpOnly`. **Lo que nadie respondio: la rotacion del secreto** (ver Huecos). Ademas una implicita: el login **no** cierra las sesiones previas de la misma persona |
| 6 | Autorizacion y roles | RESUELTO | `docs/architecture.md:416-424`; `session-claims.ts:52-58`, `:60-67`; `verify-credentials.ts:243-250` | El login **no autoriza nada**: autentica. El rol y la empresa viajan firmados como **foto del instante**, y esta escrito que no son frontera de autorizacion; la frontera es el service |
| 7 | Politica de fallo hacia el usuario | **IMPLICITA** | Resuelto: `verify-credentials.ts:46-52`, `:168-178`, `design.md > 5.5:311-326`, `> 6.5`, `requirements.md:45` (D2), `:54-55` (D11, D12). Implicita: `account-lock.ts:7,16` | **El eje mejor documentado del modulo**: mensaje unico e indistinguible con su argumento de oraculo escrito, senuelo de tiempo constante, una sola verificacion de hash en los cuatro caminos, bloqueo por cuenta y no por IP con el riesgo aceptado por escrito. La implicita es que **la politica es codigo, no configuracion** |
| 8 | Mapa de capas y flujo de datos | RESUELTO | `design.md > 2`, `> 3`, `> 6.1` (alternativa descartada: escribir la cookie desde la Server Action); `verify-credentials.ts:16-21`; `lib/composition/index.ts:461-469` | Server Action -> fachada cableada -> caso de uso de dominio -> 5 puertos -> 3 adaptadores. El porque de que la cookie se emita **dentro** del caso de uso esta escrito |
| 9 | Contrato congelado | **IMPLICITA** | Resuelto: `credentials.ts:3-6`, `:9-18`; `login-form-state.ts:3-13`; `login-action.ts:45-49`; `design.md > 8`. Implicita: `credentials.ts:21` | `LoginInput`, `LoginFormState`, la firma de `loginAction` y `{ ok: boolean }` estan congelados con su porque. Lo que nadie justifico: `username` es `min(1)` **sin tope de longitud** en el login |
| 10 | Puntos de costura y stubs | RESUELTO | `requirements.md:48-49` (D5, D6), `:116-119` (R17); los 5 archivos de `ports/`; `lib/composition/index.ts:274-286` | Los puertos **son** las costuras, y estan congeladas por requisito. **No queda ningun stub vivo en este flujo**: QC-7 sustituyo el `login-stub.ts` que devolvia siempre `{ok:false}` |
| 11 | Invariantes y validacion | **IMPLICITA** | Resuelto: `verify-credentials.ts:52`, `:90-107`, `:154-161`, `:176-178`, `:229-236`; `login-attempt-recorder.ts:33-58`; `user-credentials-prisma.ts:129-177`. Implicita: `verify-credentials.ts:54-61`, `:118` | Invariantes fuertes y explicadas: una sola instancia congelada de rechazo, exactamente una verificacion de hash por intento, un solo reloj por invocacion, CAS con `now` por **rango** para no borrar un bloqueo vivo (ABA). Implicita: **que pasa si el bucle de 10 reintentos se agota** |
| 12 | Maquina de estados y su forma serializada | RESUELTO | `login-form-state.ts:8-24`; `login-action.ts:59-61`, `:65-83`; `design.md > 5.5:311-318` | Tres estados (`idle`/`invalid`/`error`) y **ninguno de exito**, con su porque (el exito sale por redireccion). Ausentes a proposito y explicados: «cuenta bloqueada», «cuenta no activa», «empresa de baja» y «cuantos intentos te quedan» — todos colapsan en el mismo `error` |
| 13 | Datos persistidos | **HUECO** | Resuelto: `db/schema.prisma:159-219`, `design.md > 5.6:339-343`, `> 9`; `user-credentials-prisma.ts:27-34` (indice funcional parcial). Abierto: `requirements.md:168-172` (pregunta abierta 1) | Se persiste **estado actual, no historico**: 3 columnas de bloqueo + 3 de estado de cuenta, sobre `users`, sin tabla propia. Borrado **logico** (`deleted_at`), identificadores de base en **ingles** `snake_case`, unicidad de usuario como **indice funcional parcial escrito a mano** (`lower(username) WHERE deleted_at IS NULL`) que Prisma no modela. **Lo que nadie respondio: si un acceso debe dejar rastro auditable** |
| 14 | Acoplado al framework | RESUELTO | `login-action.ts:1` (`'use server'`), `:130-132` (`redirect` fuera de try/catch, con porque); `session-cookie.ts:1`, `:38-41`; `login-form-state.ts:11-13` (`attemptId` para `useActionState`); `session-token.ts:7-11` (WebCrypto por el borde) | Cada acoplamiento a Next lleva escrito **por que esta ahi**, incluido el mas sutil: la firma se hizo con WebCrypto porque `node:crypto` no sobrevive al runtime del borde |
| 15 | Acoplado a librerias | **IMPLICITA** | Resuelto: `design.md > 6.3` (descartada libreria de JWT, con argumento), `> 6.4` (`@playwright/test`, cuatro checks); `session-token.ts:166-184` (por que no se mete dependencia para el tiempo constante); `credentials.ts:1`. Implicita: `password-hash.ts:8` | `zod`, `bcryptjs`, `@prisma/client`, `@playwright/test`, y la decision de **no** usar libreria de JWT, todas con su porque. Implicita: **el coste de bcrypt (10)** — `No verificado: su justificacion podria estar en `specs/QC-5…`, que queda fuera de la frontera y no se leyo` |
| 16 | Acoplado al proyecto | RESUELTO | `session-token.ts:32` (`qc_session`); `login-form-state.ts:27,33,36` (copys en espanol); `user-credentials-prisma.ts:77-87` (tablas `users`/`roles`/`companies`); `lib/shared/routes.ts:180`; `login-action.ts:12` (`DASHBOARD_ROUTE`); `session-token.ts:193` (`SESSION_SECRET`) | Inventario completo y citado; es la tabla de parametros a reemplazar de la §3 del prompt. Los identificadores de base van en **ingles**, los copys de cara al usuario en **espanol** |
| 17 | El nucleo invariante (EARS reusables) | RESUELTO | `requirements.md:58-160` (R1-R31, en las cinco formas de `docs/specs.md`); `tasks.md:341-371` (mapa `R<n>` -> test, 31/31) | El material para la §8 del prompt ya esta escrito y trazado. Hay que **despegarlo del stack** y **actualizarlo** con lo que anadieron QC-9/48/78/23 (ver la tabla de discrepancias) |
| 18 | Lo que el modulo NO hace | RESUELTO | Deliberado: `requirements.md:23-36`; `design.md > 6.2:469-470`. Deuda: `db/schema.prisma:185-188` vs `verify-credentials.ts` entero; `password-hash.ts:35` + `credential-setup-link.ts:43` | **Deliberado**: leer/cerrar sesion (QC-8), proteger rutas (QC-9), la pantalla (QC-10/QC-30), recuperar contrasena (QC-96), limite por IP, desbloqueo manual, auditoria. **Stub**: ninguno vivo. **Deuda**: dos, abajo |
| 19 | Provisionalidad | RESUELTO | `login-form-state.ts:26`, `:29-33`, `:35` («Copy provisional (S4). Los tests afirman sobre esta constante, nunca sobre el literal»); `login-action.test.ts:107` | La tecnica esta escrita y es **transferible tal cual**: copy marcado provisional + test que afirma sobre la constante. Es lo que permite retraducir todos los mensajes sin tocar un solo test |
| 20 | Tests como criterio de aceptacion | RESUELTO | `tasks.md:341-371`; los 6 archivos de test; `verify-credentials.test.ts:1-3`, `:35`; `session-token.test.ts:4-12`; `login.int.test.ts:551`, `:671` | **El E2E existe** (`e2e/login.spec.ts`, 4 casos), que es lo que `CHECKPOINTS.md` exige para autenticacion. Hay dos tests que afirman sobre el **fuente como texto** (R17) y uno que usa `node:crypto` como **oraculo** de la migracion a WebCrypto |
| 21 | Dependencias asumidas ya montadas | RESUELTO | `lib/composition/index.ts:13-48`, `:274-288`; `login-action.ts:5-12`; `user-credentials-prisma.ts:1`; `session-token.ts:193` | El modulo **no crea**: el esquema `users`/`roles`/`companies` con sus indices funcionales, el cliente Prisma, el hasher de QC-5, la fabrica de `sid`, el catalogo de permisos y el menu privado (QC-74/QC-75), las constantes de ruta, el `SESSION_SECRET` del entorno y el tooling de tests (vitest + Playwright) |

**Ningun eje resulta NO APLICA, y se declara expresamente por que en los dos candidatos:**

- **Eje 12** (maquina de estados de UI) **si aplica** aunque la pantalla quede fuera: el flujo es
  dueño de `LoginFormState`, que es precisamente la **forma serializada** que cruza la frontera
  (`login-form-state.ts:14-22`).
- **Eje 13** (datos persistidos) **si aplica**: la naturaleza es `flujo` y el flujo escribe
  (`user-credentials-prisma.ts:178-234`).

---

## Decisiones implicitas (5) — pasan al cuestionario

| # | Eje | Lo que eligio | Alternativa concreta | Consecuencia de cambiarla | Evidencia |
| --- | --- | --- | --- | --- | --- |
| I1 | 5 | Un login nuevo **no toca** las sesiones anteriores de la misma persona: se emite otro `sid` y las anteriores siguen vivas hasta caducar | Sesion unica por persona: al entrar, adelantar el sello `sessions_valid_from` y tumbar todo lo anterior | Con la actual, quien roba una cookie conserva el acceso aunque el dueño vuelva a entrar; con la alternativa, nadie puede trabajar en dos dispositivos a la vez | `verify-credentials.ts:251-262` (emite y no revoca nada); `session.ts:30-41`; `db/schema.prisma:212-219` (el sello existe y este flujo **no lo escribe**) |
| I2 | 7 | El umbral (5) y la escalada (1/5/15/60 min) son **constantes de codigo** | Politica configurable por entorno o por empresa | Con la actual, ajustar la severidad exige un despliegue; con la alternativa, aparece una fuente de verdad mas que puede diverger entre entornos. Ojo: para la **duracion de sesion** si esta escrito por que no va por entorno (`session.ts:8-11`), pero para el bloqueo nadie lo escribio | `account-lock.ts:7`, `:16` |
| I3 | 9 | `username` se valida con `min(1)` y **sin maximo**; la contrasena si tiene tope (64) | Tope tambien en el usuario (existe `USER_USERNAME_MAX_LENGTH` para el alta administrada) | Con la actual, una entrada de megabytes llega hasta el `lower()` de Postgres antes de no encontrar nada; con la alternativa, el corte es en el borde y barato | `credentials.ts:21` vs `:23`; `index.ts:104` (la constante existe y el login no la usa) |
| I4 | 11 | Si los 10 reintentos del registro condicional se agotan, la funcion **se rinde en silencio**: no escribe, no lanza, y el intento se rechaza igual | Propagar un error, o reintentar sin tope | Con la actual, bajo contencion extrema un fallo puede no contarse y el bloqueo llega mas tarde; con la alternativa, el usuario veria un fallo distinto del generico y eso reabriria el oraculo del eje 7 | `verify-credentials.ts:54-61` (justifica el **numero** 10, no el desenlace), `:118`, `:151-152` |
| I5 | 15 | bcrypt con coste 10 (~110 ms), y ese coste es el que sostiene la uniformidad de tiempo del eje 7 | Coste mayor (12), o argon2id | Con la actual, el tiempo de respuesta es ~110 ms y la ventana del CAS es esa; subir el coste endurece el hash pero alarga la ventana de carrera y el tiempo de respuesta de toda la pantalla | `password-hash.ts:8`. `No verificado: el porque del 10 podria estar en `specs/QC-5…/design.md > 3`, fuera de la frontera; no se leyo` |

## Decisiones resueltas y su porque — material de la §10 del prompt

Cada una tiene el porque **escrito** en el repo. El receptor no debe reabrirlas sin leer antes
el argumento.

| # | Eje | Decision | Por que (citado) |
| --- | --- | --- | --- |
| D-1 | 2 | Se entra con nombre de usuario, no con correo | Decision cerrada D1, origen description del board (`requirements.md:44`) |
| D-2 | 7 | **Un unico objeto de rechazo congelado** para usuario inexistente, contrasena mala, cuenta bloqueada, cuenta no activa y empresa de baja | «Si cada camino construyera su propio objeto, cualquier dia uno de ellos se llevaria un campo de mas y el login pasaria a ser un oraculo» (`verify-credentials.ts:46-52`); D2 (`requirements.md:45`) |
| D-3 | 7 | El bloqueo **no** tiene mensaje propio | «solo un usuario que existe puede estar bloqueado, asi que el mensaje delataria que el nombre de usuario es real, y ademas le confirmaria al atacante que su fuerza bruta esta surtiendo efecto» (`design.md > 5.5:311-318`) |
| D-4 | 7 | Usuario inexistente **verifica igualmente** contra un hash señuelo, producido con el hasher del sistema y cacheado por proceso | R6, R7; «para que un usuario inexistente cueste lo mismo que uno real» (`verify-credentials.ts:36-44`, `:72-88`, `:168-173`) |
| D-5 | 7 | El camino bloqueado y el de cuenta no activa cortan **despues** de la verificacion de hash | «cortar antes responderia en microsegundos y el tiempo de respuesta delataria que la cuenta existe y no esta activa» (`verify-credentials.ts:176-178`, `:189-192`) |
| D-6 | 7 | Ni el camino de cuenta no activa ni el de empresa de baja **escriben nada** | «castigar a alguien —bloquearle la cuenta— por una decision administrativa que no puede arreglar seria injusto» (`verify-credentials.ts:196-204`, `:216-226`). La asimetria con el corte de empresa esta declarada, no es descuido |
| D-7 | 7 | Bloqueo **por cuenta**, no por IP; riesgo de denegacion de servicio a un usuario conocido **aceptado por escrito** | D12; «es un ERP de un solo tenant, con usuarios conocidos y sin registro publico»; y sobre Vercel la IP llega por cabecera falsificable (`design.md > 6.5`) |
| D-8 | 7 | El nivel de escalada **no decae** con el tiempo | Alternativa considerada y descartada: exigiria una cuarta columna y una regla mas «para acotar algo que ya esta acotado en 60 minutos» (`design.md > 5.5:306-309`) |
| D-9 | 7 | El bloqueo **nunca** es permanente | «no hay pantalla de administracion: un bloqueo permanente dejaria al usuario fuera hasta tocar la base a mano» (`account-lock.ts:12-15`, `design.md > 5.5:303-305`) |
| D-10 | 7 | Un exito reinicia contador **y nivel**; un fallo durante el bloqueo no lo alarga | «el dueño demostro su identidad y mantenerle el nivel alto lo castigaria por un ataque que no es suyo»; «para que martillear una cuenta bloqueada no la mantenga bloqueada indefinidamente» (`account-lock.ts:32-42`) |
| D-11 | 5 | Token **firmado y sin estado**, no sesion opaca contra tabla | Tres motivos escritos: coste por peticion, alcance, y que lo que se pierde es acotado y reversible (`design.md > 6.2`) |
| D-12 | 5 | 8 h, caducidad **absoluta**, sin «recordarme» ni renovacion deslizante, y **no** por variable de entorno | D10; «una jornada de trabajo de un ERP interno»; «la caducidad absoluta es la que se puede razonar y testear sin ambiguedad» (`session.ts:6-12`, `design.md > 5.4`) |
| D-13 | 5 | `exp` viaja **dentro y firmado**, no solo en el `Max-Age` | «el `Max-Age` lo controla el navegador y un cliente hostil puede conservar la cookie mas alla de su caducidad» (`design.md > 5.1:228-231`) |
| D-14 | 5 | Atributos de la cookie: `httpOnly`, `sameSite=lax`, `path=/`, `secure` solo en produccion, **sin** `domain` | Tabla entera con un porque por fila (`design.md > 5.2`), y el de `secure` repetido en `session-cookie.ts:38-41` |
| D-15 | 5 | La version del valor sube en cada cambio de contenido y **no hay compatibilidad hacia atras**: al desplegar, todas las sesiones vivas caen | Consecuencia aceptada por escrito tres veces (v2, v3, v4). «mantener dos formatos serian dos caminos de verificacion vivos … para siempre»; «un `sid` opcional obligaria a decidir que hacer con una sesion sin identificador en cada punto de uso» (`session-token.ts:34-67`) |
| D-16 | 5/6 | El contenido firmado lleva **solo** identificadores: `sub`, `iat`, `exp`, `role`, `cid`, `sid` — ni nombre, ni correo, ni el nombre de la empresa | «este valor viaja en cada peticion»; y del nombre de la empresa: «puede cambiar y una foto vieja mentiria durante las 8 h que dura la sesion» (`session-token.ts:72-99`, `session-claims.ts:26-41`) |
| D-17 | 6 | El rol y la empresa salen **de la base**, en la misma consulta que autentica, y jamas de la entrada | «un rol por defecto seria un rol inventado», «una empresa por defecto seria una empresa inventada» (`session.ts:46-62`, `user-credentials-reader.ts:9-17`) |
| D-18 | 6 | Lo firmado **no autoriza**: es una foto para decidir si se **enseña** una pantalla; el service decide si se puede **hacer** | `docs/architecture.md:416-424`; `session-claims.ts:52-58` |
| D-19 | 8 | La cookie se emite **dentro** del caso de uso, por puerto, no desde la Server Action | «deja la decision "hay sesion y dura hasta X" en un adaptador driving … y haria imposible testear la emision de sesion sin montar el runtime de Next» (`design.md > 6.1`) |
| D-20 | 8/11 | Verificar y **luego** emitir; si la emision lanza, nadie queda autenticado | «la excepcion se propaga y nadie queda autenticado sin sesion: `loginAction` no llega a redirigir» (`verify-credentials.ts:243-245`) |
| D-21 | 11 | El registro del fallo es un **compare-and-set** con reintento, no un `UPDATE` incondicional | «entre la lectura y la escritura hay ~110 ms de bcrypt, y con una escritura absoluta N intentos simultaneos leerian el mismo contador … el bloqueo no se dispararia jamas justo frente al unico atacante que importa» (`verify-credentials.ts:90-107`, `login-attempt-recorder.ts:8-12`) |
| D-22 | 11 | El predicado del CAS compara el plazo **por rango**, no por igualdad, y exige tambien el estado de cuenta leido | ABA de manual explicado con el caso `(0,1,T_pasado)` vs `(0,1,T_futuro)`, «se comprobo ejecutandolo contra Postgres»; y `timestamptz(6)` en Postgres contra el milisegundo de JS (`user-credentials-prisma.ts:139-158`) |
| D-23 | 11 | Un solo reloj `new Date()` por invocacion, pasado a todas las capas | «comparar el bloqueo con un instante y escribir el siguiente con otro dejaria ventanas de milisegundos imposibles de razonar» (`verify-credentials.ts:159-161`) |
| D-24 | 11 | El dominio **no** tiene fuentes de azar propias: el `sid` entra por puerto | «es lo que permite afirmar en un test que dos logins seguidos de la misma persona producen `sid` distintos sin espiar ninguna global»; «sin parametros no hay nada de donde derivarlo» (`verify-credentials.ts:27-33`, `session-id-factory.ts:7-25`) |
| D-25 | 11/13 | Los cortes de acceso viven en el **dominio**, no en el `WHERE` de la consulta | «tiene que gastar igualmente su verificacion de hash y … una regla de acceso escondida en un `WHERE` solo se puede afirmar contra Postgres, no con objetos planos» (`user-credentials-prisma.ts:55-59`, `:67-74`) |
| D-26 | 11 | Los puertos devuelven el valor **crudo**, no un booleano ya cocinado | «"activa" es una regla de dominio, y cocinarla fuera la sacaria del unico sitio donde se prueba con objetos planos» (`user-credentials-reader.ts:18-35`) |
| D-27 | 11 | «Lo que la columna dice» -> «lo que significa ahora» vive en **una sola funcion**, con el orden de ramas fijado | `effective-account-status.ts:1-25`, `:49-65`; y por que en archivo aparte y no dentro de `account-status.ts` (`:10-14`) |
| D-28 | 11/13 | `null` en el estado de cuenta significa **«no toques la columna ni su rastro»**, no «escribe null» | «si cada intento de login la reescribiera con el mismo valor, esa marca pasaria a significar "ultimo intento de login" y perderia su unico proposito» (`login-attempt-recorder.ts:20-26`, `user-credentials-prisma.ts:108-127`) |
| D-29 | 2/13 | El usuario se normaliza (`trim` + `lower`); la contrasena **no se toca ni se recorta** | «un espacio inicial o final es parte de la credencial» (`verify-credentials.ts:163-165`, `credentials.ts:22`) |
| D-30 | 13 | La consulta va con `$queryRaw` parametrizado y no con la API tipada + `mode:'insensitive'` | «`ILIKE` **no** usa ese indice: el login haria un seq scan sobre `users` en la ruta mas caliente de la app» (`user-credentials-prisma.ts:26-34`) |
| D-31 | 13 | Estado **actual**, no historico: tres columnas sobre `users`, sin tabla de intentos | «lo que hay que guardar es estado actual, no historico. Una tabla de intentos es un registro de auditoria, y eso es otra feature» (`design.md > 5.6:339-341`, `> 9`) |
| D-32 | 9 | Tope de credencial de 64 caracteres, y el identificador **evita el segmento `password`** | bcrypt solo mira los primeros 72 **bytes**; y la guardia `guard-password-never-plaintext` marca todo identificador que nombre la contrasena y no acabe en `hash` (`credentials.ts:8-18`, `verify-credentials.ts:36-43`) |
| D-33 | 9/12 | `LoginFormState` no tiene `success` ni ningun campo `password`; `attemptId` solo en los estados de fallo | «el tipo es la garantia»; «el exito sale por `redirect`»; `attemptId` «es lo que hace cumplible R21» (`login-form-state.ts:8-24`) |
| D-34 | 9/12 | El error de longitud se distingue del de campo vacio | «sin eso, una contrasena demasiado larga se anunciaria como "campo obligatorio"» (`login-action.ts:25-31`) |
| D-35 | 14 | El `redirect()` va **fuera** de todo `try/catch` | «`redirect()` senaliza con una excepcion de control (`NEXT_REDIRECT`) y tragarsela romperia R17 en silencio» (`login-action.ts:130-131`) |
| D-36 | 14/15 | La firma se implementa con **WebCrypto**, y el `equalsInConstantTime` se escribe a mano (8 lineas) en vez de meter dependencia | «`middleware.ts` corre en el borde y cualquiera de esas dos dependencias lo dejaria sin cargar»; «la unica implementacion del stack no existe en el runtime donde hay que comparar» (`session-token.ts:7-11`, `:166-184`) |
| D-37 | 15 | **No** se usa libreria de JWT | «lo unico que ahorraria es el formato de sobre y el manejo de `alg`, que es precisamente la parte con historial de vulnerabilidades (`alg: none`, confusion HS/RS) y que aqui no existe porque el formato es fijo y de un solo algoritmo» (`design.md > 6.3`) |
| D-38 | 15/21 | El secreto se lee **en la llamada**, no al cargar el modulo, y falla cerrado con minimo 32 caracteres | «en el import romperia el build de Vercel (donde no hay entorno de ejecucion) y haria intestable el fallo cerrado» (`session-token.ts:186-202`, `design.md > 5.3`) |
| D-39 | 16/14 | El nombre de la cookie no dice «auth» ni «token», y vive en el **codec** y no en el transporte | «no hace falta anunciar que ahi viaja la sesion»; «quien lee la cookie en el borde necesita el nombre y no puede cargar `next/headers`» (`session-token.ts:25-32`) |
| D-40 | 19 | Copys **provisionales** en constantes exportadas; los tests afirman sobre la constante, nunca sobre el literal | `login-form-state.ts:26-36`; y el test lo cumple (`login-action.test.ts:107`) |
| D-41 | 20 | El camino feliz se demuestra **sin depender del seed**: la propia verificacion crea y limpia sus datos | R21 (`requirements.md:127-129`), `tasks.md:361` |
| D-42 | 20 | El E2E entra con **navegador real** y comprueba `httpOnly` desde fuera, con Chromium **y WebKit** | «la unica forma honesta de comprobar `httpOnly` desde fuera»; WebKit es el motor de iOS (`design.md > 6.4`) |
| D-43 | 10 | El cableado puerto -> adaptador vive **solo** en `lib/composition`, y el contrato publico no arrastra servidor | D5, D6, D7 (`requirements.md:48-50`), R17/R18; `index.ts:1-3` |

## Deudas detectadas (no se arreglan aqui; se anotan y se sigue)

| # | Deuda | Evidencia | Por que es deuda y no decision |
| --- | --- | --- | --- |
| T1 | La columna `users.must_change_credential` documenta que **«quien la LEE y bloquea el acceso es QC-7»**, y `verify-credentials.ts` **no la lee en ningun sitio** — ni el puerto la trae (`AuthenticatableUser` no la declara) | `db/schema.prisma:185-188` vs `user-credentials-reader.ts:37-50` y `verify-credentials.ts` completo | El esquema afirma un lector que no existe: alguien puede marcar «debe cambiar su contrasena» y esa persona entra igual, sin ser llevada a ninguna parte |
| T2 | Una cuenta sin credencial guarda el centinela `'!'` en `password_hash`; `verifyPasswordHash` lo rechaza **por el patron, antes de llamar a bcrypt**, o sea en microsegundos | `credential-setup-link.ts:43`; `password-hash.ts:14`, `:35` | La uniformidad de tiempo que R6/R29 construyeron con tanto cuidado no cubre este caso: ese camino responde mucho mas rapido que los demas y distingue «existe y aun no estreno su credencial». Nadie lo escribio como riesgo aceptado — a diferencia de la diferencia residual del `UPDATE`, que si esta anotada en `design.md > 5.5:323-326` |
| T3 | `FORGOT_PASSWORD_ROUTE` se pinta como enlace y la ruta no existe (404) | `lib/shared/routes.ts:180`; `app/(public)/login/page.tsx:131`; `design.md > 5.5:316-318` | Deuda **ya declarada** por QC-10 y con ficha abierta (QC-96). Se anota por completitud; queda **fuera** de esta frontera (es pantalla) |

---

## Huecos para el humano

Los dos vienen de preguntas que **QC-7 dejo abiertas por escrito** y que ningun spec
posterior de los leidos cierra. Redactados ya como pregunta de negocio:

1. **(Eje 13, y toca el 7) Rastro de los accesos.** Hoy el sistema **no guarda ninguna
   historia** de quien entro ni de quien fallo al entrar: solo tres contadores sobre la ficha
   del usuario que se sobrescriben, y ni un solo mensaje de registro en todo el camino
   (`user-credentials-prisma.ts:35-36` lo dice explicitamente: «aqui no hay ni un
   `console.*`»). **¿Un acceso —correcto o fallido— debe dejar rastro consultable (quien,
   cuando, desde donde), o basta con el estado actual?** Si la respuesta es si, el receptor
   necesita saberlo antes de diseñar sus tablas, porque despues es una migracion.
   *Evidencia de que sigue abierta:* `specs/QC-7…/requirements.md:168-172`.

2. **(Eje 5) Cambiar el secreto que firma las sesiones.** Hay **un solo** `SESSION_SECRET`:
   cambiarlo echa fuera a todo el mundo de golpe, en mitad de su jornada. **¿Se acepta ese
   corte, o el sistema tiene que poder convivir con el secreto nuevo y el anterior durante
   una temporada?** QC-7 acepto el corte «por ahora» y dejo la pregunta escrita sin
   responder; el receptor decide, y la respuesta cambia la forma del verificador, no solo su
   configuracion.
   *Evidencia de que sigue abierta:* `specs/QC-7…/requirements.md:178-181`.

---

## Nota de frontera para el leader

Dos observaciones sobre la lista de 25, que **no amplie por mi cuenta**:

- `login-action.ts:5-12` importa cuatro simbolos que **no estan en la lista** y sin los cuales
  el destino de aterrizaje no se puede describir: `RETURN_PARAM` y `resolveReturnPath`
  (`domain/return-path.ts`, QC-9), y `PRIVATE_NAV_ITEMS` + `filterNavItemsByPermissions`
  (`lib/shared/navigation/private-nav.ts`, QC-75). Tambien `identity.getSessionUser()`. Los
  tratare como **prerrequisitos asumidos** (eje 21) y describire su contrato por lo que se ve
  desde el sitio de llamada, sin inventar sus cuerpos.
- El adaptador de la fabrica de `sid` (`adapters/driven/session/session-id-crypto.ts`) esta
  cableado en `lib/composition/index.ts:41,286` y **no** esta en la lista. El puerto si lo
  esta, que es lo que importa para el contrato; la implementacion concreta ira como
  prerrequisito («una fuente de UUID aleatorios»).

## Respuestas del humano a los HUECOS (2026-09-13)

Preguntadas con `AskUserQuestion` en el Paso 4 del comando, en lenguaje de negocio. Ninguna se
rellenó con supuestos.

### Eje 13 (roza el 7) — rastro de los accesos

**Pregunta.** Hoy no queda ninguna historia de quién entró ni de quién falló al entrar: solo tres
contadores sobre la ficha de la persona, que se sobrescriben, y ningún registro de salida.
¿Debe quedar rastro consultable de los accesos?

**Respuesta: SÍ, aciertos Y fallos** — quién entró, cuándo y desde dónde, y lo mismo cuando el
intento falla. El motivo: es lo que permite responder «¿alguien entró a mi cuenta?» y detectar a
alguien probando contraseñas; los contadores que se sobrescriben no sirven para ninguna de las dos.

**Cómo entra al `prompt.md`**: como **requisito del núcleo invariante** (sección 8), no como
descripción de lo que este repo hace — porque este repo **no lo hace**. Dilo así de claro: es una
capacidad que el módulo portado debe tener y que el original no tiene. En este repo sería ficha
aparte y **no se implementa desde esta extracción**.

### Eje 5 — cambiar el secreto que firma las sesiones

**Pregunta.** Las sesiones se firman con un único secreto. Si hay que cambiarlo —por rotación o
porque se filtró—, hoy eso echa fuera a todo el mundo en el acto. ¿Es aceptable?

**Respuesta: SÍ, que caigan todas.** Cambiar el secreto invalida todas las sesiones vivas y cada
quien vuelve a entrar. El argumento que lo cierra: **si el motivo del cambio es una filtración,
echar a todos es la función y no el daño**, y la convivencia de dos secretos precisamente no sirve
para ese caso. Se descartó la ventana de convivencia de secreto nuevo y anterior.

**Cómo entra al `prompt.md`**: como **decisión consciente con su porqué** en la sección de estado y
duración de la sesión, y como fila de `decisiones.md`. Deja de ser un hueco: ya no es que nadie lo
pensara, es que se decidió.
