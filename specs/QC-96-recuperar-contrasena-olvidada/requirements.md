# QC-96 — recuperar-contrasena-olvidada · requirements.md

> **Zona** `fullstack` · **Complejidad** `medium` · **depends_on** `QC-79`, `QC-23` ·
> **Rama** `feature/QC-96-recuperar-contrasena-olvidada`
>
> ## Alcance
>
> Que quien olvidó su contraseña pueda recuperarla **por sí mismo**, sin llamar al administrador:
> la pide desde la pantalla de acceso escribiendo su correo, recibe un enlace, establece una
> contraseña nueva y entra con ella.
>
> **La diferencia con QC-79 no es el mecanismo, es quién dispara.** El enlace del alta lo emite un
> administrador con sesión abierta sobre un usuario que él acaba de crear. Éste lo dispara
> **cualquiera, sin sesión**, escribiendo un correo que puede no ser suyo. De ahí sale todo lo que
> esta ficha decide distinto.
>
> ## Lo que NO entra
>
> - **El límite por origen** (la IP) → **QC-73**, que trae el mecanismo general de límite de
>   peticiones. Aquí entra **solo** el límite por correo.
> - **El alta sin contraseña** → **QC-79**, ya mergeada.
> - **Que el administrador restablezca la de otro** → **QC-89**.
> - **El mecanismo de revocar sesiones** → lo construye **QC-23**; aquí solo se invoca.
>
> _Sembrado por `/afinar-feature` el 2026-09-12. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). **«El sistema»** aquí es: los dos caminos nuevos del módulo
> `identity` —**pedir** la recuperación sin sesión y **establecer** la contraseña con el enlace de
> recuperación—, la **columna de propósito** que gana `credential_setup_tokens` y su migración, la
> **pantalla pública** donde se escribe el correo, la reutilización de la pantalla pública de QC-79
> donde se escribe la contraseña, y las Server Actions que las sirven.
>
> **Lo que QC-79 aporta y NO se re-especifica** (decisión cerrada 7): la tabla y su FK, el índice
> único parcial de «un enlace vivo por persona», el uso único, la huella SHA-256 como único rastro
> del secreto, la fábrica del secreto (`create()` / `digestOf()`), el puerto de correo con su
> adaptador de `resend` y su transporte de buzón, la configuración del remitente y de la base de la
> URL, y la página pública `/establecer-contrasena/[token]`. Esta ficha **no reconstruye ninguna de
> esas piezas**: las usa. Si algún requisito de abajo se puede cumplir escribiendo una tabla nueva o
> un segundo mecanismo de token, está mal leído.
>
> **Requisitos de QC-79 que esta ficha ENMIENDA, citados**, para que nadie los lea desfasados:
>
> | QC-79 | Decía | Qué pasa a decir |
> | --- | --- | --- |
> | **R39** | «el enlace DEBE servir **solo** para el alta y solo MIENTRAS la cuenta esté en `pending`», y «NO DEBE existir ninguna forma de pedirlo desde fuera que no sea el alta o el reenvío autorizado» | **Enmendado por R12, R23 y R25**: sigue siendo verdad **para el enlace de propósito `setup`**, que no cambia ni un ápice. Lo que aparece es un **segundo propósito**, `recovery`, que lo pide cualquiera sin sesión (R2) y que solo vale para cuentas **activas**. La frontera que R39 protegía —que el enlace del alta no se convierta en recuperación— **se conserva en la columna**, no se borra. |
> | **R22** | seis casos de rechazo del enlace, todos con la **misma** respuesta | **Se conserva y se extiende** por **R25**: el propósito que no corresponde al estado de la cuenta entra como un caso más de la **misma** respuesta única. Ni uno solo de los seis se vuelve distinguible. |
> | **R8** | «el enlace DEBE caducar **7 días** después de su emisión» | **Se conserva para `setup`.** **R11** fija **1 hora** para `recovery`: dos plazos, uno por propósito, en la misma tabla (decisión cerrada 1). |
> | **R40** | esta feature no toca el bloqueo por intentos fallidos | **Se hereda literal** en **R26**: QC-96 tampoco lo toca. |
>
> **Requisito de QC-23 que esta ficha ENMIENDA**, y se dice de frente
> porque el reviewer lo va a buscar: la **decisión cerrada 2 de QC-23** («¿Cambiar la contraseña
> cierra sesiones? **Sí: todas menos la actual**») enumera **tres** caminos —QC-36, QC-89 y el
> enlace de QC-79— y **omite éste**. **R29** lo cierra: en la recuperación se cierran **TODAS**, sin
> excepción, porque no hay «actual» que preservar —la persona no está dentro— y el caso para el que
> la recuperación existe es justamente que otro entró a la cuenta. Esto **no reabre** una decisión
> de QC-23: añade el cuarto camino que su enumeración no contempló, y así lo fijó el humano el
> 2026-09-12 en la decisión cerrada 5 de **esta** ficha.
>
> **Y encaja sin fricción con lo que QC-23 construyó.** El «menos la actual» de QC-23 no es una
> excepción dentro de la escritura: la escritura sube el sello y cae **todo**, y quien conserva su
> sesión la conserva porque QC-23 **la reemite** después (su R31, `firstIssuedAtAfterStamp`). En la
> recuperación **no hay nada que reemitir** —no hay sesión abierta que sea la de quien actúa—, así
> que no reemitir es exactamente «todas», sin código propio y sin ninguna variante del mecanismo.
> **R29** lo exige explícitamente.
>
> **Requisitos de ALCANCE (R36) y de ausencia deliberada de autorización (R2)**: son requisitos de
> pleno derecho y no comentarios. Aquí son críticos: esta es la **única** superficie de escritura
> del ERP que cualquiera puede disparar sin sesión, y lo que la hace segura es lo que **no** hace.
>
> El mapa `R<n> -> test` lo escribe el implementer en
> `progress/impl_QC-96-recuperar-contrasena-olvidada.md` (`CHECKPOINTS.md > Trazabilidad`); el mapa
> `R<n> -> task` está en `tasks.md > Trazabilidad`.

### La solicitud: una pantalla pública y una operación sin actor

**R1.** El sistema DEBE ofrecer una **página pública** —servida sin sesión— a la que se llega desde
el enlace «¿Olvidaste tu contraseña?» que la pantalla de acceso **ya pinta** (`FORGOT_PASSWORD_ROUTE`
de `lib/shared/routes.ts`, hoy un 404), con **un solo campo**: el correo. La página NO DEBE pedir
ningún otro dato —ni nombre de usuario, ni empresa, ni documento— y NO DEBE mostrar ningún dato de
ninguna cuenta en ningún instante.

**R2.** La operación que pide la recuperación NO DEBE exigir ningún permiso ni leer ninguna sesión,
cookie ni cabecera de identidad; una sesión abierta —propia o de otra persona— NO DEBE cambiar su
resultado. **La ausencia de autorización es deliberada y es el requisito**: quien olvidó su
contraseña no tiene sesión con la que autorizarse, y lo que sustituye a la autorización es que la
operación **no devuelve ninguna información** (R4) y **no escribe nada que el llamante pueda
observar**.

**R3.** La entrada DEBE validarse con un esquema **estricto** de un solo campo, el correo: cualquier
clave desconocida DEBE hacer fallar la validación, y NO DEBE existir ningún campo con el que el
llamante pueda elegir la empresa, el usuario destinatario, la dirección a la que se escribe, el plazo
del enlace ni el tope de R17. SI el valor no tiene forma de correo, ENTONCES el sistema DEBE
rechazar la entrada, y ese rechazo NO DEBE depender de ningún dato de la base —solo de lo que la
persona escribió—.

### La respuesta indistinguible: el corazón de la ficha

**R4.** CUANDO se pide la recuperación con una entrada válida, el sistema DEBE responder **siempre el
mismo resultado**, sin ningún dato variable y sin ningún campo que dependa del estado de la base, sea
cual sea lo que ocurrió por dentro.

**R5.** La respuesta de R4 DEBE ser **idéntica** —mismo estado serializado, mismo código de estado
HTTP, mismo contenido pintado— en **todos** estos casos, enumerados uno a uno para que cada uno tenga
su test: (a) el correo no corresponde a ninguna cuenta; (b) corresponde a una cuenta `pending`; (c) a
una `inactive`; (d) a una `blocked`; (e) a una cuenta **borrada** (`deleted_at`); (f) a una cuenta de
una **empresa dada de baja**; (g) a una cuenta activa que **sí** recibe el enlace; (h) a una cuenta
activa que **no** lo recibe por el tope de R17; (i) a una cuenta activa cuyo correo **falló** al
enviarse.

**R6.** El sistema DEBE emitir la respuesta de R4 **no antes** de un **presupuesto fijo de tiempo**,
idéntico para todas las ramas de R5 y medido desde que se recibe la solicitud, de modo que el tiempo
de respuesta **no permita distinguir** un correo que existe de uno que no. El sistema NO DEBE esperar
a que el proveedor de correo conteste más allá de ese presupuesto, y el presupuesto NO DEBE depender
de ningún dato de la base.

**R7.** El sistema NO DEBE escribir en ningún registro, traza, mensaje de error ni respuesta el
correo recibido, el identificador del usuario resuelto, el estado de su cuenta ni el resultado de la
resolución: nada que, leído después, diga si esa dirección existe. El secreto del enlace tampoco
(QC-79 R13).

**R8.** La solicitud NO DEBE modificar ninguna fila de `users`: ni el estado de la cuenta, ni su
instante o autor de cambio, ni los contadores de intentos fallidos, ni el bloqueo. Lo único que puede
escribir es **una fila** en `credential_setup_tokens` (R12), y solo en el caso (g) de R5.

### Qué cuentas recuperan

**R9.** El sistema DEBE emitir el enlace **solo** para cuentas cuyo **estado efectivo** —el de QC-78,
calculado con la única función que traduce «lo que la columna dice» a «lo que significa ahora»— sea
`active`, que no estén borradas y cuya **empresa** siga viva. MIENTRAS la cuenta esté en `pending`,
`inactive` o `blocked`, el sistema NO DEBE emitir ningún enlace, NO DEBE enviar ningún correo y DEBE
responder exactamente lo mismo (R4, R5).

**R10.** SI el correo recibido corresponde a **más de una** cuenta viva y efectivamente activa —lo
que el modelo permite, porque la unicidad del correo es **por empresa** (`users_email_unique` sobre
`("company_id", lower("email"))`)—, ENTONCES el sistema DEBE emitir **un enlace propio para cada
una** y enviar **un correo por cada una**, y la respuesta DEBE seguir siendo la de R4. El sistema NO
DEBE elegir una sola cuenta, NO DEBE rechazar la solicitud por ambigüedad y NO DEBE preguntar por la
empresa. *(Respuesta propuesta a la pregunta abierta **P1**; mientras P1 no se confirme, manda este
requisito.)*

### El enlace de recuperación

**R11.** El enlace de recuperación DEBE caducar **1 hora** después de su emisión; MIENTRAS el instante
actual sea igual o posterior a esa caducidad, el sistema DEBE rechazarlo (R25), y NO DEBE existir
ninguna forma de prolongar uno ya emitido: extenderlo es pedir otro. El plazo del enlace de **alta**
DEBE seguir siendo **7 días** (QC-79 R8), y los dos plazos DEBEN derivarse del **propósito** de la
fila y de una sola constante cada uno.

**R12.** El enlace de recuperación DEBE persistirse en la **misma tabla** `credential_setup_tokens` de
QC-79, que gana **una** columna de **propósito** con exactamente dos valores —el del alta y el de la
recuperación—. Esta feature NO DEBE crear ninguna tabla nueva, ningún segundo mecanismo de token,
ninguna segunda fábrica de secretos y ningún segundo puerto de correo.

**R13.** El enlace de recuperación DEBE heredar, sin excepción y sin código nuevo que lo reimplemente:
en la base **solo la huella** del secreto y nunca el secreto (QC-79 R9); el secreto generado con el
generador **criptográfico** del runtime y **≥ 256 bits**, sin derivarse del identificador, del correo
ni de ningún instante (QC-79 R10); **un solo uso**, con su instante de consumo y sin borrado físico
(QC-79 R12); y el secreto viajando **solo** en la URL del correo (QC-79 R13).

**R14.** Un usuario NO DEBE tener más de **un** enlace vivo a la vez, **cualquiera que sea el
propósito**: CUANDO se emite uno de recuperación, todo enlace vivo anterior de esa persona DEBE
quedar inservible en la **misma escritura**, y la garantía DEBE seguir viniendo del **índice de la
base** que ya existe, no de una consulta previa de existencia. Esta feature NO DEBE modificar ese
índice.

**R15.** El correo DEBE enviarse por el **puerto de correo que ya existe** y su adaptador, con el
remitente y la base de la URL resueltos por **configuración** y nunca incrustados en el código; el
correo NO DEBE contener ninguna contraseña, y lo único sensible que transporta es el enlace.

**R16.** SI el envío del correo falla, ENTONCES el enlace DEBE quedar emitido y vivo igual, la
respuesta NO DEBE cambiar (R4) y el sistema NO DEBE reintentar por su cuenta, encolar ni programar
nada: el único reintento es que la persona **vuelva a pedirlo**. Esta feature NO DEBE añadir ninguna
maquinaria de trabajo en segundo plano, ningún cron y ningún route handler de tarea.

### El límite por correo, que no puede ser un oráculo

**R17.** MIENTRAS ya se hayan emitido **el tope** de enlaces de recuperación para la misma persona
dentro de la **ventana**, el sistema NO DEBE emitir otro ni enviar otro correo, y DEBE responder
exactamente lo mismo (R4, R5 h). El tope y la ventana DEBEN ser **constantes nombradas y únicas**, no
números repartidos por el código.

**R18.** El conteo del límite NO DEBE apoyarse en ninguna tabla nueva, ningún almacén en memoria del
proceso, ninguna caché externa ni ninguna dependencia nueva, y DEBE ser **compartido por todas las
instancias del servidor**: dos peticiones servidas por instancias distintas DEBEN contar contra el
mismo tope.

**R19.** El límite NO DEBE ser observable desde fuera por **ninguna** vía: ni un mensaje, ni un código
de error, ni un código de estado, ni una cabecera, ni una diferencia de tiempo (R6) DEBEN permitir
distinguir «esta dirección ha pedido demasiados» de «esta dirección no existe». En particular, el
sistema NO DEBE contar, ni limitar, ni responder distinto para una dirección que **no** corresponde a
ninguna cuenta activa: sobre ella nunca se envía nada, así que no hay nada que limitar.

**R20.** Esta feature NO DEBE implementar ningún límite **por origen** (dirección de red, cabecera de
proxy, huella de navegador): eso es **QC-73**, y ningún archivo de esta feature DEBE leer la dirección
del solicitante.

### Establecer la contraseña con el enlace de recuperación

**R21.** Se DEBE llegar a la **misma página pública** de QC-79 donde se escribe la contraseña nueva y
su confirmación, y la operación que la establece NO DEBE exigir ningún permiso ni leer ninguna sesión,
cookie ni cabecera de identidad: el **único** credencial que acepta sigue siendo el secreto del
enlace. Esta feature NO DEBE crear una segunda pantalla de contraseña ni un segundo formulario.

**R22.** CUANDO la contraseña se establece con un enlace **de recuperación** válido y la contraseña
cumple la política, el sistema DEBE, **en una sola operación atómica**: persistirla **solo** como
hash de **QC-5** y **consumir** el enlace; y NO DEBE cambiar el estado de la cuenta, ni su instante de
cambio de estado, ni su autor —la cuenta ya estaba `active` y sigue `active`—. CUANDO dos usos del
mismo enlace ocurren a la vez, el sistema DEBE aceptar **exactamente uno**, sin que la comprobación
sea una lectura seguida de una escritura desprotegida.

**R23.** El propósito de la fila DEBE decidir qué estado exige el enlace: el de **alta** solo DEBE
funcionar sobre una cuenta en `pending` y DEBE activarla (QC-79 R19, intacto); el de **recuperación**
solo DEBE funcionar sobre una cuenta **activa** y NO DEBE activar nada. Un enlace de alta NO DEBE
servir sobre una cuenta activa, y uno de recuperación NO DEBE servir sobre una cuenta `pending`,
`inactive`, `blocked` o borrada.

**R24.** SI la contraseña que la persona escribe NO cumple la política de **QC-19** —las seis reglas
propias más la lista de filtradas—, ENTONCES el sistema DEBE rechazarla devolviendo las **reglas
incumplidas**, NO DEBE modificar ninguna fila y el enlace DEBE **seguir vivo** para volver a
intentarlo. El enlace de recuperación NO DEBE ser una puerta lateral a la política ni al hashing de
**QC-5**.

**R25.** SI el secreto recibido no corresponde a ningún enlace, ha **caducado**, ya fue **consumido**,
fue **sustituido**, su **propósito no corresponde** al estado de la cuenta (R23), o la cuenta a la que
apunta **no existe**, está **borrada**, es de una **empresa dada de baja** o **no está en el estado
que su propósito exige**, ENTONCES el sistema DEBE rechazar la operación, NO DEBE modificar ninguna
fila y DEBE responder con una **única** respuesta **indistinguible** entre todos esos casos, con el
código que QC-79 ya creó para esto y **sin ningún dato de diagnóstico**.

**R26.** Al establecer la contraseña por el enlace de recuperación, el sistema NO DEBE modificar la
marca de cambio de credencial (`must_change_credential`) ni el mecanismo de bloqueo por intentos
fallidos (`failed_login_attempts`, `lock_level`, `locked_until`), que son de QC-19 / QC-78. *(Mismo
criterio conservador que QC-79 R21 y R40.)*

### Las sesiones abiertas

> **Enmienda del 2026-09-12, con QC-23 ya implementada en disco.** La versión anterior de R27–R29
> exigía **invocar** un revocador por un puerto, con la firma asumida `revokeAllSessionsOf(userId,
> now)`. **Esa firma no existe y no podía existir.** Lo que QC-23 expone es
> `endAllSessions(actor: Actor | null | undefined, targetUserId: string)`
> (`lib/modules/identity/domain/end-all-sessions.ts`), que **exige un actor en su primera línea**
> —`requirePermission(actor, 'usuarios.modificar')` o `requireActor(actor)`, su R27— y que saca el
> ámbito de `actor.companyId`. **QC-96 no tiene actor** (R2, R21: nadie está dentro), así que
> invocarlo no es «adaptar un nombre»: sería imposible, o exigiría fabricar un actor falso.
>
> Y no hace falta. QC-23 no implementó el corte por contraseña como una función que haya que
> acordarse de llamar, sino como **una regla sobre la escritura**: toda transacción que escriba
> `users.password_hash` sube `users.sessions_valid_from` **en la misma sentencia**
> (`domain/session-revocation.ts`, su decisión cerrada 2), y lo vigila
> `tests/guards/guard-sesiones-cortadas.test.ts`, que **cubre explícitamente el `UPDATE` crudo de
> `credential-setup-link-prisma.ts`** — justo el archivo y el camino que esta ficha extiende.
>
> **La decisión cerrada 5 no se reabre**: recuperar sigue cerrando **TODAS** las sesiones. Lo que
> cambia es **cómo**: por la regla de escritura, no por una invocación. Ver **P3**, cerrada.

**R27.** CUANDO la contraseña se establece con un enlace de **recuperación** válido, el sistema DEBE
dejar inválidas **TODAS** las sesiones abiertas de esa persona, sin preservar ninguna, **subiendo el
sello `users.sessions_valid_from` de esa persona en la MISMA sentencia `UPDATE` que escribe
`users.password_hash`**, al instante de la operación y truncado al segundo con la única función del
repositorio que lo trunca. El sistema NO DEBE hacerlo con una segunda escritura, ni con una segunda
transacción, ni invocando ningún caso de uso de revocación: `endAllSessions` de QC-23 exige un actor
autorizado y aquí **no hay ninguno** (R2, R21), y dos escrituras sobre la misma fila abrirían una
ventana en la que la contraseña ya cambió y las cookies viejas todavía valen.

**R28.** La escritura de R27 —hash y sello— DEBE ser **una sola sentencia dentro de la misma
transacción** que consume el enlace, de modo que **ningún camino de fallo** pueda dejar una
contraseña nueva conviviendo con una sesión antigua todavía válida: si la sentencia no se confirma,
no se confirma ninguna de las dos columnas y el enlace **no** queda consumido. SI la transacción
falla, ENTONCES el sistema DEBE responder un fallo, NO DEBE modificar ninguna fila y la persona DEBE
poder volver a usar el enlace o pedir otro.

**R29.** El corte de R27 DEBE alcanzar **toda** sesión abierta de esa persona, incluida cualquiera
del dispositivo desde el que se establece la contraseña, y NO DEBE quedar acotado por empresa ni por
ningún otro filtro además del identificador del usuario dueño del enlace. Esta feature NO DEBE
ofrecer ninguna opción de preservar una sesión y NO DEBE iniciar sesión automáticamente al terminar.
Además, esta feature NO DEBE implementar ningún mecanismo propio de revocación: NO DEBE añadir
ninguna columna, ninguna tabla, ningún índice ni ningún cambio de formato del token de sesión, NO
DEBE tocar `revoked_sessions` ni `resolve-session.ts`, y NO DEBE modificar ni debilitar
`tests/guards/guard-sesiones-cortadas.test.ts`, que DEBE seguir verde **sin haber sido tocada**. Todo
lo que esta ficha aporta al corte es **cumplir** la regla que esa guardia ya vigila.

### Frontera, datos, errores y dependencias

**R30.** Los dos casos de uso nuevos DEBEN vivir en `lib/modules/identity/domain/`, con la
persistencia, la fábrica del secreto, el reloj y el envío de correo detrás de **puertos**
implementados en `adapters/driven/` y cableados **solo** en `lib/composition/`. El sello de R27 lo
escribe el **adaptador de persistencia** —es una columna más del `UPDATE` que ya hace, no una
dependencia nueva del dominio—, y esta feature NO DEBE añadir ningún puerto de revocación de
sesiones; el `domain/` y los `ports/` NO DEBEN importar Prisma, `resend`, framework ni
`lib/shared/**`, y el contrato `lib/modules/identity/index.ts` NO DEBE reexportar ningún adaptador
`driving`.

**R31.** Las operaciones nuevas DEBEN exponerse como **Server Actions** en `adapters/driving/` del
módulo `identity`, con **`FormData`**; el sistema NO DEBE crear ningún route handler nuevo ni llamar
por `fetch` a ninguna ruta API propia.

**R32.** Cada fallo DEBE señalarse con una clase de error de dominio derivada de `IdentityError` cuyo
`code` esté en el **catálogo cerrado de QC-70**, traducido por el **traductor único**, con el error
inesperado llevando su mensaje neutro y su `reference` de **QC-71**. Esta feature NO DEBE añadir
**ningún** código nuevo al catálogo: los que necesita —el enlace inválido, la entrada inválida y el
inesperado— ya existen.

**R33.** La migración de esta feature DEBE llevar su **`down.sql`**, que deja el esquema exactamente
como estaba y no toca ningún otro objeto; el ciclo aplicar → revertir → aplicar DEBE poder ejecutarse
dejando `_prisma_migrations` coherente; las filas que ya existan DEBEN quedar con el propósito de
**alta**; la tabla DEBE conservar `ROW LEVEL SECURITY` **activado y forzado** y sus identificadores en
**inglés** y `snake_case`; y la migración NO DEBE tocar `users`, ni los tres índices únicos de QC-47,
ni el índice parcial de «un enlace vivo por persona».

**R34.** Esta feature NO DEBE añadir **ninguna** dependencia: `package.json` NO DEBE ganar ninguna
entrada respecto de `origin/dev`. El envío sigue siendo el `resend` ya aprobado, el secreto y su
huella salen de `node:crypto`, la validación de `zod` y el hashing de `bcryptjs`.

**R35.** Las dos pantallas públicas que esta feature toca —la de pedir (R1) y la de establecer (R21)—
DEBEN cumplir la regla multiplataforma de `docs/architecture.md`: alto con `dvh` y no `100vh`,
`font-size` de al menos 16 px en los campos, objetivos táctiles de al menos 44 × 44 px y ninguna
acción alcanzable solo con `:hover`.

### Alcance: lo que esta ficha NO hace

**R36.** Esta feature NO DEBE incluir: el límite **por origen** (R20, es **QC-73**); el
restablecimiento de la contraseña **de otra persona** por un administrador (**QC-89**); ninguna
pantalla ni ruta de **administración de usuarios** (**QC-67**); el **mecanismo** de revocación de
sesiones —sello, registro de sesiones cerradas y su guardia— que es de **QC-23** y aquí solo se
**cumple** (R27, R29); ni ningún botón de «cerrar mis sesiones» (**QC-53**) o de cerrar las de
otro (**QC-101**). La única superficie de interfaz que aporta es la pantalla de R1.

### Prueba de extremo a extremo

**R37.** El camino completo —**pedir** la recuperación con el correo de una cuenta activa → el enlace
sale por el **buzón** (`MAIL_TRANSPORT=outbox`) → **establecer** la contraseña nueva → **entrar** con
ella— DEBE quedar cubierto por **una** prueba de extremo a extremo que lo ejerza en un navegador,
incluida la comprobación de que el mismo enlace **ya no sirve** una segunda vez y de que un correo
que **no existe** produce en pantalla **exactamente** lo mismo.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. **Ninguna de las 7 queda sin `R<n>`.**

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | El enlace vive **1 hora**, no los 7 días del alta; si caduca se vuelve a pedir | **R11**, R25, R16 |
| 2 | Un correo que no existe ve **el mismo mensaje** y con el **mismo tiempo de respuesta** | **R4**, **R5**, **R6**, R7, R37 |
| 3 | **Solo `active`** recupera; `pending`, `inactive` y `blocked`, **en silencio** | **R9**, R5 (b, c, d), R23, R25 |
| 4 | **Límite por correo** dentro de esta ficha, sin librería ni almacén nuevo; el de origen es QC-73 | **R17**, **R18**, **R19**, R20, R34 |
| 5 | Recuperar cierra **TODAS** las sesiones; lo construye QC-23, aquí se **invoca** | **R27**, **R28**, **R29**, R36 — *el **qué** sigue en pie; el **cómo** es la regla de escritura de QC-23 y no una invocación (ver la enmienda sobre R27 y **P3**)* |
| 6 | **Misma tabla** que QC-79, con un campo que distingue el propósito | **R12**, R11, R14, R23, R33 |
| 7 | Precedentes heredados de QC-79: solo la huella, uno vivo por índice, un solo uso, política QC-19 + hashing QC-5, errores del catálogo de QC-70 con el identificador de QC-71, remitente por configuración | **R13**, R14, R24, R15, R32, R30 |

Requisitos que **no** salen de una fila de la tabla, y de dónde salen: **R1**, **R2**, **R3** y
**R21** del Alcance («la pide desde la pantalla de acceso… lo dispara cualquiera, sin sesión») y de
`docs/architecture.md > Acceso a datos y autorizacion`; **R8** del mismo criterio de no-oráculo que
la decisión 2, aplicado a las escrituras; **R10** de `users_email_unique` por empresa (QC-47) y de
`docs/architecture.md > Dominio` n.º 1 — **pendiente de P1**; **R22** y **R26** de QC-79 R19–R21 y
R40; **R31**, **R33**, **R34** y **R35** de `docs/architecture.md` y `CHECKPOINTS.md`; **R36** de la
sección «Lo que NO entra»; **R37** de `CHECKPOINTS.md > Calidad de codigo` (flujo de autenticación) y
del precedente de QC-79 R41.

## Preguntas abiertas

Ninguna del sembrado: las cinco que la ficha traía del 2026-09-11 quedan cerradas y las 7 decisiones
de abajo no se reabren.

**Tres NUEVAS, abiertas por `spec_author` en F1.2.** Ninguna bloquea la implementación: las tres van
con su **respuesta propuesta ya escrita como requisito**, y mientras no se confirmen manda el
requisito.

**Estado al 2026-09-12, tras la enmienda de QC-23: solo P1 sigue abierta.** P2 la cerró el humano;
**P3 la cierra el código de QC-23 leído en disco**, y su respuesta cambió R27–R29.

1. **P1 — Un correo que existe en DOS empresas.** La unicidad del correo es **por empresa**
   (`users_email_unique` sobre `("company_id", lower("email"))`, QC-47), así que una misma dirección
   puede ser de dos personas distintas en dos empresas. Ni el Alcance ni las 7 decisiones lo
   contemplan, y no hay nada en `docs/`, `specs/` ni el código que lo resuelva: el login usa el
   **nombre de usuario**, no el correo, y también resuelve con `LIMIT 1` global —lo que es una
   ambigüedad propia suya, anterior a esta ficha y fuera de su alcance—.
   - **Respuesta propuesta, escrita como requisito: R10.** Se emite **un enlace para cada** cuenta
     viva y efectivamente activa con ese correo. Rechazar por ambigüedad dejaría a una persona real
     sin poder recuperar nunca, y elegir una sola sería elegir mal en silencio; emitir para todas no
     filtra nada, porque la respuesta es la misma de R4 en cualquier caso (dos correos al mismo buzón
     solo los ve quien ya es dueño de las dos cuentas).
   - **Si el humano decide otra cosa**, el cambio es acotado: R10 y su test, y una línea del `WHERE`
     del adaptador. Sin migración.

2. **P2 — CERRADA por el humano el 2026-09-12: tope 3, ventana 1 hora.** Es exactamente la
   respuesta que proponía `spec_author`, así que **R17 se mantiene tal cual está escrito** y no hay
   nada que cambiar en el código ni en los tests. La ventana coincide con la vida del enlace
   (decisión 1) para que no haya dos plazos que explicar. Queda además anotado, por si alguien los
   toca luego: **no son variables de entorno a propósito** —no cambian entre entornos—, y moverlos
   cuesta dos constantes y los casos que las citan, sin migración. Ver la decisión 8 de la tabla.

3. **P3 — CERRADA el 2026-09-12 leyendo QC-23 en disco, no su spec.** La pregunta era «con qué firma
   se invoca el revocador de QC-23». **La respuesta es que no se invoca.** Lo que se comprobó, con
   ruta y línea, en el worktree `QC-23-registro-de-sesiones`:
   - **La firma asumida no existe.** No hay ningún `revokeAllSessionsOf(userId, now)`. Lo que hay es
     `createEndAllSessions(deps)` devolviendo
     `endAllSessions(actor: Actor | null | undefined, targetUserId: string): Promise<void>`
     (`lib/modules/identity/domain/end-all-sessions.ts`). **Y no podía ser la otra**: su primera
     línea es `requirePermission(actor, 'usuarios.modificar')` o `requireActor(actor)` —la
     autorización antes que nada, R27 de QC-23— y el ámbito sale de `actor.companyId` —el actor por
     parámetro, su R29—. **QC-96 no tiene actor** (R2, R21), así que no hay nada que pasarle; el
     puerto `SessionRevocationRepository.stampAll` exige además `companyId`, que esta ficha tampoco
     tiene sin resolverlo a mano.
   - **Y no hace falta invocar nada.** QC-23 implementó el corte por contraseña como **una regla
     sobre la escritura**, no como una llamada: `domain/session-revocation.ts` lo dice literalmente
     («el cambio de contraseña no es una decisión, es una regla sobre la escritura») y
     `tests/guards/guard-sesiones-cortadas.test.ts` la vigila sobre todo
     `adapters/driven/persistence/`, con un caso que ancla **por nombre** el `UPDATE` crudo de
     `credential-setup-link-prisma.ts` — el archivo que esta ficha extiende. Ese `UPDATE` ya escribe
     hoy `"sessions_valid_from" = ${floorToSecond(now)}` junto a `"password_hash"`, y su comentario
     dice, textualmente, que se escribe «para que quede cerrada la puerta si QC-89 o QC-96 reutilizan
     este camino».
   - **Consecuencia, escrita como requisito: R27, R28 y R29 reescritos.** El corte llega porque el
     `UPDATE` de `applyRecoveryCredential` sube el sello en el mismo `SET`. Si alguien lo olvidara,
     la guardia de QC-23 se pone roja en ese commit: la trazabilidad no depende de que el implementer
     se acuerde.
   - **Se gana atomicidad**: desaparece el paso intermedio de revocación que `design.md > 7.2` metía
     entre el consumo y la escritura, así que QC-96 recupera **una sola transacción**, como QC-79.
   - **QC-96 sigue con `QC-23` en su `depends_on`**, porque la columna `users.sessions_valid_from` y
     `floorToSecond` son suyas y tienen que estar en el árbol; pero ya **no hay ninguna task
     bloqueada a la espera de un contrato** (ver `tasks.md`).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-12 | ¿Cuánto vive el enlace? | **1 hora**, no los 7 días del alta. La diferencia es deliberada: éste lo dispara cualquiera sin sesión, y quien olvidó su contraseña está delante del teclado **ahora**. Si caduca, se vuelve a pedir y no cuesta nada |
| 2026-09-12 | ¿Qué ve quien escribe un correo que no existe? | **Exactamente el mismo mensaje** que si existiera, y con el **mismo tiempo de respuesta**. Es lo único que impide que la pantalla se use para averiguar quién trabaja en la empresa probando direcciones |
| 2026-09-12 | ¿Qué cuentas pueden recuperar? | **Solo `active`**, y las otras tres **en silencio**: no reciben enlace, pero la pantalla responde igual. Distinguir revelaría el estado de la cuenta de alguien. Una cuenta `pending` ya tiene el enlace de **QC-79**; `inactive` o `blocked` hablan con el administrador |
| 2026-09-12 | ¿Hay límite de intentos? | **Sí, por correo y dentro de esta ficha**: un tope por ventana, sin librería ni almacén nuevo. El límite **por origen** se queda en **QC-73** |
| 2026-09-12 | ¿Qué pasa con las sesiones abiertas? | **Se cierran TODAS.** No hay «actual» que preservar —la persona no está dentro— y el caso para el que la recuperación existe es justamente que otro entró a la cuenta. **Cierra el hueco de QC-23**, cuya enumeración decía tres caminos y omitía éste |
| 2026-09-12 | ¿Comparte tabla con el enlace del alta? | **Sí: `credential_setup_tokens` de QC-79**, con un campo que distingue **alta** de **recuperación**. La huella, el uso único y el índice de «uno vivo por persona» ya existen y **no se duplican**. Las dos caducidades sí son distintas: 7 días y 1 hora |
| 2026-09-12 | Precedentes de QC-79 que se heredan y no se reabren | En la base **solo la huella**, nunca el secreto; **un enlace vivo por persona** garantizado por índice de la base, no por un `SELECT` previo; **un solo uso**; la contraseña pasa por la política de **QC-19** y el hashing de **QC-5**, sin excepción; errores por el **catálogo cerrado de QC-70** con el identificador de **QC-71**; el remitente sale de **configuración**, no del código; y el envío con **`resend`**, ya aprobada y con su fila en `docs/dependencias.md` |
| 2026-09-12 | ¿Cuántas peticiones de enlace se admiten y en cuánto tiempo? | **3 por hora**, con la ventana igual a la vida del enlace. Cerrada por el humano sobre la propuesta de `spec_author`; **R17 no cambia**. Deja margen para el «no me llegó, lo pido otra vez» sin convertir el buzón de nadie en un vertedero |
