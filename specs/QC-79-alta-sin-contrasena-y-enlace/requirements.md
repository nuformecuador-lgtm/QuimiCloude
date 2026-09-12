# QC-79 — alta-sin-contrasena-y-enlace · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-66` ·
> **Rama** `feature/QC-79-alta-sin-contrasena-y-enlace`
>
> ## Alcance
>
> La contraseña pasa a ser **opcional** al crear un usuario. Si el administrador la escribe, todo
> sigue como en QC-66. Si no la escribe, el sistema **no inventa ninguna**: envía a la persona un
> enlace por correo con el que ella establece la suya, y al establecerla la cuenta pasa de
> `pending` a `active`. Es el **único camino por el que una cuenta se activa sola**; el otro sigue
> siendo el administrador moviendo el estado a mano desde QC-66.
>
> Arrastra el **primer envío de correo del ERP**: hoy no existe ni librería, ni adaptador, ni
> configuración, ni tabla de tokens.
>
> ## Lo que NO entra
>
> - **Recuperar una contraseña olvidada** → **QC-96** (creada el 2026-09-11 al acotar esta). Es
>   otro flujo y otra superficie de ataque: lo dispara quien **no tiene sesión**, desde la pantalla
>   de acceso, y la respuesta no puede revelar qué correos existen.
> - **Restablecer la contraseña de otro** (el administrador sobre un usuario ya activo) → **QC-89**.
> - **La pantalla de usuarios** → **QC-67**.
> - **Cola de reintentos de correo**: no existe ninguna maquinaria de trabajo en segundo plano en
>   el ERP y esta ficha no la construye.
>
> _Sembrado por `/afinar-feature` el 2026-09-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). **«El sistema»** aquí es: los casos de uso nuevos del módulo
> `identity` —emitir el enlace, reenviarlo y establecer la contraseña con él—, el **alta ya existente
> de QC-66**, que esta ficha enmienda; los puertos y adaptadores que arrastran (persistencia del
> enlace, generación del secreto, envío de correo, configuración del remitente), la **tabla nueva** y
> su migración, la **página pública** donde la persona escribe su contraseña, y las Server Actions
> que la sirven.
>
> **Lo que QC-66 aporta y NO se re-especifica**: el modelo `User` completo, los dos permisos
> `usuarios.consultar` / `usuarios.modificar`, los seis casos de uso de administración, el contrato
> del listado, las dos guardas del administrador y el borrado lógico. Esta ficha **no toca ninguno**
> salvo el alta.
>
> **Requisitos de QC-66 que esta ficha ENMIENDA, citados**, para que nadie los lea desfasados:
>
> | QC-66 | Decía | Qué pasa a decir |
> | --- | --- | --- |
> | **R15** | «CUANDO se crea un usuario, el sistema DEBE fijarle una contraseña **generada al azar por el propio sistema**» | **Enmendado por R4**: solo cuando el administrador la escribe hay contraseña en el alta; sin ella **no se genera ninguna**, y el acceso lo da el enlace. La mitad que sobrevive intacta —hash bcrypt y política de QC-19 por construcción— la recoge **R2**. |
> | **R16** | la contraseña generada no sale por ninguna vía | **Se conserva entero y se extiende** por **R5** a la contraseña que escribe el administrador y a la que la persona establece por el enlace. |
> | **R13** | el alta persiste empresa, rol, `pending`, marca de cambio de credencial y el instante | **Se conserva**; **R3** y **R7** solo añaden qué pasa además según haya contraseña o no. |
> | **Decisión 6 / 7** | «la contraseña la genera el sistema» · «nadie puede entrar tras el alta, por esta ficha» | La primera queda acotada al caso «el administrador la escribió»; la segunda **se cumple igual**: tras el alta sigue sin poder entrar nadie hasta que la persona use el enlace (**R4**, **R19**). |
>
> **R39 y R40 son requisitos de ALCANCE y son requisitos de pleno derecho**, no comentarios: igual
> que R38-R48 de QC-66. Aquí son críticos, porque la frontera con **QC-96** (recuperar la olvidada) y
> con **QC-89** (restablecer la de otro) es la que separa esta ficha de una superficie de ataque que
> el humano dejó explícitamente fuera.
>
> El mapa `R<n> -> test` lo escribe el implementer en
> `progress/impl_QC-79-alta-sin-contrasena-y-enlace.md` (`CHECKPOINTS.md > Trazabilidad`); el mapa
> `R<n> -> task` está en `tasks.md > Trazabilidad`.

### El alta, con la contraseña opcional

**R1.** El esquema de entrada del alta DEBE admitir un campo de contraseña **opcional** y ningún otro
campo nuevo; la ausencia del campo y la cadena vacía DEBEN tratarse **igual**, como «el administrador
no la escribió», y cualquier otra clave desconocida DEBE seguir haciendo fallar la validación.

**R2.** CUANDO el alta llega **con** contraseña, el sistema DEBE evaluarla contra la política
completa de **QC-19** —las seis reglas propias más la lista de filtradas— antes de escribir nada, y
DEBE persistirla **solo** como hash de **QC-5**; SI la política la rechaza, ENTONCES el sistema DEBE
rechazar el alta indicando las **reglas incumplidas**, NO DEBE crear ninguna fila, NO DEBE emitir
ningún enlace y NO DEBE enviar ningún correo.

**R3.** CUANDO el alta llega **con** contraseña, el sistema NO DEBE emitir ningún enlace ni enviar
ningún correo, y la cuenta DEBE nacer igualmente en `pending`, con su instante de cambio de estado y
sin autor (QC-66 R13 y R49): escribir la contraseña **no activa** la cuenta.

**R4.** CUANDO el alta llega **sin** contraseña, el sistema NO DEBE generar ninguna contraseña al
azar —**esto enmienda QC-66 R15**, con esas palabras y no disimulado— y DEBE dejar la fila **sin
ninguna credencial con la que se pueda entrar**: ningún intento de acceso con ninguna contraseña
DEBE tener éxito sobre esa cuenta mientras no se establezca una por el enlace.

**R5.** La contraseña NO DEBE salir del sistema por **ninguna** vía, venga de donde venga —escrita
por el administrador, o establecida por la persona con el enlace—: no se devuelve en el resultado de
ninguna operación, no aparece en ningún mensaje de error, no se escribe en ningún registro ni en
ninguna traza, no viaja en el correo y no se muestra a nadie en ningún instante (QC-66 R16,
extendido).

**R6.** El alta DEBE seguir exigiendo `usuarios.modificar` como **primera línea**, con el actor
—identificador, empresa y conjunto de permisos— **como parámetro** y fallando **cerrado** (QC-66 R1,
R2, R5); SI el actor no trae ese código exacto, ENTONCES el sistema NO DEBE crear ningún usuario, NO
DEBE emitir ningún enlace, NO DEBE enviar ningún correo y NO DEBE realizar ninguna lectura ni
escritura por ningún puerto.

### El enlace: emisión, forma y vida

**R7.** CUANDO el alta se hace **sin** contraseña y el usuario se crea, el sistema DEBE emitir **un**
enlace para establecerla, asociado a ese usuario, con su instante de emisión y su instante de
caducidad, y DEBE intentar enviarlo por correo a la dirección de correo de ese usuario.

**R8.** El enlace DEBE caducar **7 días** después de su emisión; MIENTRAS el instante actual sea
posterior a esa caducidad, el sistema DEBE rechazarlo, y NO DEBE existir ninguna forma de prolongar
un enlace ya emitido —extenderlo es emitir uno nuevo (R16)—.

**R9.** El sistema NO DEBE guardar el secreto del enlace en claro: en la base DEBE quedar **solo una
huella irreversible** de él, y la comprobación DEBE hacerse calculando la huella del valor recibido y
comparándola. Quien lea la tabla entera NO DEBE poder reconstruir ningún enlace vivo.

**R10.** El secreto del enlace DEBE generarse con el generador **criptográfico** del runtime y llevar
al menos **256 bits** de entropía; dos emisiones consecutivas DEBEN producir secretos distintos, y el
valor NO DEBE derivarse del identificador del usuario, de su correo ni de ningún instante.

**R11.** Un usuario NO DEBE tener más de **un** enlace vivo a la vez: CUANDO se emite uno nuevo, todo
enlace anterior vivo del mismo usuario DEBE quedar inservible en la misma escritura. La garantía DEBE
venir de una **restricción de la base**, de modo que dos emisiones simultáneas para la misma persona
acaben con **un solo** enlace vivo, y NO DEBE implementarse con una consulta previa de existencia.

**R12.** El enlace DEBE ser de **un solo uso**: CUANDO se usa con éxito, DEBE quedar consumido con su
instante de consumo, y un segundo uso del mismo secreto DEBE rechazarse (R22). El enlace consumido o
sustituido NO DEBE borrarse físicamente: queda marcado, conservando el rastro.

**R13.** El secreto DEBE viajar hacia la persona **solo** en la URL del correo; NO DEBE escribirse en
ningún registro, ninguna traza, ningún mensaje de error ni ninguna respuesta de ninguna otra
operación, y NO DEBE entregarse a ningún tercero distinto del proveedor de correo que lo transporta.

### Reenviar el enlace

**R14.** El sistema DEBE ofrecer una operación de **reenvío** del enlace que exija
`usuarios.modificar` como **primera línea**, con el actor **por parámetro** y fallando **cerrado**;
SI el actor no trae ese código exacto, ENTONCES NO DEBE leer ni escribir por ningún puerto, NO DEBE
emitir ningún enlace y NO DEBE enviar ningún correo.

**R15.** El reenvío DEBE estar acotado a la **empresa del actor** y solo DEBE proceder MIENTRAS el
usuario objetivo exista, esté vivo y siga en `pending`; SI pertenece a otra empresa, no existe o está
borrado, ENTONCES el sistema DEBE responder «no encontrado» sin revelar que existe (QC-66 R33, R34);
SI existe pero **no está en `pending`**, ENTONCES DEBE rechazar con un error **distinguible** y NO
DEBE emitir ningún enlace ni escribir ninguna fila.

**R16.** CUANDO se reenvía, el enlace anterior DEBE morir (R11) y el nuevo DEBE contar sus **7 días**
desde el instante del reenvío, no desde el de la emisión original.

### Establecer la contraseña con el enlace

**R17.** El sistema DEBE ofrecer una **página pública** —servida sin sesión— a la que se llega desde
el enlace, donde la persona escribe su contraseña nueva y la confirma.

**R18.** La operación que establece la contraseña NO DEBE exigir ningún permiso ni leer ninguna
sesión, cookie ni cabecera de identidad: el **único** credencial que acepta es el secreto del enlace,
y una sesión abierta de otra persona NO DEBE cambiar su resultado.

**R19.** CUANDO la contraseña se establece con un enlace válido y la contraseña cumple la política,
el sistema DEBE, en una sola operación: persistirla **solo** como hash de **QC-5**, mover la cuenta
de `pending` a `active`, escribir el **instante** del cambio de estado, dejar **vacío** el autor del
cambio —el `NULL` de QC-65 R10, «lo cambió el sistema, no una persona»— y **consumir** el enlace
(R12).

**R20.** Las cuatro escrituras de R19 DEBEN ser **atómicas**: o se escriben todas o ninguna. CUANDO
dos usos del mismo enlace ocurren a la vez, el sistema DEBE aceptar **exactamente uno** y rechazar el
otro, sin que la comprobación sea una lectura seguida de una escritura desprotegida.

**R21.** Al establecer la contraseña por el enlace, el sistema NO DEBE modificar la **marca de cambio
de credencial** con la que la cuenta nació (QC-66 R13). *(Comportamiento conservador mientras la
pregunta abierta **P3** siga sin cerrar; hoy ningún código del repositorio lee esa marca.)*

**R22.** SI el secreto recibido no corresponde a ningún enlace, ha **caducado**, ya fue **consumido**,
fue **sustituido** por un reenvío, o la cuenta a la que apunta **no existe**, está **borrada** o **ya
no está en `pending`** —activa, inactiva o bloqueada—, ENTONCES el sistema DEBE rechazar la
operación, NO DEBE modificar ninguna fila y DEBE responder con una **única** respuesta,
**indistinguible** entre esos casos, de modo que el enlace no sirva para averiguar si una cuenta
existe ni en qué estado está.

**R23.** SI la contraseña que la persona escribe NO cumple la política de **QC-19**, ENTONCES el
sistema DEBE rechazarla devolviendo las **reglas incumplidas**, NO DEBE modificar ninguna fila y el
enlace DEBE **seguir vivo** para volver a intentarlo. El enlace NO DEBE ser una puerta lateral a la
política: no se relaja ni se salta ninguna de sus reglas.

**R24.** La página pública NO DEBE mostrar ningún dato del usuario —nombre, correo, nombre de
usuario, rol ni empresa— antes, durante ni después de establecer la contraseña.

**R25.** La página pública DEBE cumplir la regla multiplataforma de `docs/architecture.md`: alto de
pantalla con `dvh` y no `100vh`, `font-size` de al menos 16 px en los campos de contraseña, objetivos
táctiles de al menos 44 × 44 px y ninguna acción alcanzable solo con `:hover`.

### El correo

**R26.** El envío de correo DEBE hacerse a través de un **puerto** del módulo, implementado por un
adaptador `driven` y cableado **solo** en `lib/composition/`; el `domain/` y los `ports/` NO DEBEN
importar la librería del proveedor, Prisma, framework ni `lib/shared/**`.

**R27.** El adaptador del proveedor DEBE ser el **único archivo** del repositorio que importe la
librería de envío de correo; ningún otro archivo de `lib/`, `app/`, `components/` ni `scripts/` DEBE
importarla.

**R28.** La dirección remitente, la credencial del proveedor y la base de la URL con la que se
construye el enlace DEBEN resolverse por **configuración**, leída **en el momento de la invocación** y
nunca al importar el módulo, y NO DEBEN estar incrustadas en el código; SI falta alguna, ENTONCES el
adaptador DEBE fallar **nombrándola** y sin incluir ningún valor en el mensaje.

**R29.** El correo NO DEBE contener ninguna contraseña, ni la del destinatario ni la de nadie; lo
único sensible que transporta es el enlace de R13.

**R30.** SI el envío del correo falla, ENTONCES el usuario DEBE quedar **creado** igual, en `pending`
y con su enlace emitido, y el resultado del alta DEBE **distinguir** «creado y correo enviado» de
«creado y correo no enviado», para que la pantalla de **QC-67** pueda ofrecer el reenvío de R14; el
sistema NO DEBE deshacer la creación ni devolver un fallo del alta por esta causa.

**R31.** El sistema NO DEBE reintentar el envío por su cuenta, encolarlo ni programarlo: el único
reintento es el **reenvío a mano** de R14. Esta feature NO DEBE añadir ninguna maquinaria de trabajo
en segundo plano, ningún cron y ningún route handler de tarea.

### Frontera, datos y errores

**R32.** Los casos de uso nuevos DEBEN vivir en `lib/modules/identity/domain/`, con la persistencia
del enlace, la generación del secreto, el cálculo de su huella, el reloj y el envío de correo detrás
de **puertos** implementados en `adapters/driven/` y cableados **solo** en `lib/composition/`; y el
contrato `lib/modules/identity/index.ts` NO DEBE reexportar ningún adaptador `driving`.

**R33.** Las mutaciones nuevas DEBEN exponerse como **Server Actions** en `adapters/driving/` del
módulo `identity`, con **`FormData`**; el sistema NO DEBE crear ningún route handler nuevo ni llamar
por `fetch` a ninguna ruta API propia.

**R34.** Cada fallo nuevo DEBE señalarse con una clase de error de dominio derivada de
`IdentityError` cuyo `code` esté en el **catálogo cerrado de QC-70**, sin mensaje pasado por el sitio
que lanza; el adaptador `driving` DEBE traducirlo con el **traductor único** de QC-70, y el error
inesperado DEBE seguir llevando su `reference` de **QC-71** y su mensaje neutro. NO DEBE existir
ninguna segunda traducción de error a estado serializable ni ningún `catch` que descarte un error sin
manejarlo ni propagarlo con contexto.

**R35.** La tabla nueva DEBE nacer con `ROW LEVEL SECURITY` **activado y forzado**, sin ninguna
policy que pretenda sustituir la autorización del service (una policy **no** cuenta como permiso
implementado), y todos sus identificadores —tabla, columnas, índices, restricciones— DEBEN ir en
**inglés** y `snake_case`.

**R36.** La migración de esta feature DEBE llevar su **`down.sql`**, que deja el esquema exactamente
como estaba antes de aplicarla y no toca ningún otro objeto; y el ciclo aplicar → revertir → aplicar
DEBE poder ejecutarse dejando `_prisma_migrations` coherente.

**R37.** La tabla nueva NO DEBE llevar columna de empresa: cuelga del usuario, del que se deriva su
empresa, y **toda** consulta suya DEBE acotarse por el usuario al que pertenece. Esta feature NO DEBE
añadir, quitar ni modificar ninguna columna de `users` ni ninguno de los **tres índices únicos** de
QC-47.

**R38.** La **única** dependencia nueva DEBE ser la librería de envío de correo, con su fila en
`docs/dependencias.md` —los cuatro checks y la aprobación humana citada— antes de instalarse; y
`package.json` NO DEBE ganar ninguna otra entrada respecto de `origin/dev`.

### Alcance: lo que esta ficha NO hace

**R39.** Esta feature NO DEBE ofrecer ninguna recuperación de contraseña **olvidada** —que es
**QC-96** y se dispara sin sesión desde la pantalla de acceso— ni ningún restablecimiento de la
contraseña **de otra persona** —que es **QC-89**—: el enlace DEBE servir **solo** para el alta y solo
MIENTRAS la cuenta esté en `pending` (R22), y NO DEBE existir ninguna forma de pedirlo desde fuera
que no sea el alta (R7) o el reenvío autorizado (R14).

**R40.** Esta feature NO DEBE incluir ninguna pantalla, componente ni ruta de **administración de
usuarios** —van a **QC-67**—: la única superficie de interfaz que aporta es la **página pública** de
R17 y los adaptadores `driving` que la sirven. Tampoco DEBE tocar el mecanismo de bloqueo por
intentos fallidos (`failed_login_attempts`, `lock_level`, `locked_until`), que es de QC-19 / QC-78.

### Prueba de extremo a extremo

**R41.** El camino completo —alta **sin** contraseña → enlace → establecer la contraseña → **entrar**
con ella— DEBE quedar cubierto por **una** prueba de extremo a extremo que lo ejerza en un navegador,
incluida la entrada efectiva en la aplicación con la contraseña recién establecida y la comprobación
de que la cuenta quedó en `active`.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

> **Nota de conteo:** el encargo hablaba de **11** decisiones; la tabla tiene **12 filas** —la
> duodécima es la de precedentes heredados—. Se cubren **las doce**.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | La contraseña pasa a ser **opcional**; si el administrador la escribe, sigue todo como en QC-66 (bcrypt, no se muestra a nadie) | R1, R2, R3, R5, R6 |
| 2 | Si no la escribe: **enlace por correo**, y establecerla mueve `pending` → `active` | R4, R7, R17, R19 |
| 3 | El enlace vive **7 días** | R8, R16, R22 |
| 4 | Se puede **reenviar**, el anterior **muere**, **un enlace vivo por persona**, bajo `usuarios.modificar` | R11, R14, R15, R16 |
| 5 | **Solo para el alta**; la recuperación sale a QC-96 y hereda de aquí el mecanismo | R22, R39 |
| 6 | El correo se envía con **`resend`**, con sus cuatro checks y **aprobación humana** en F1.4 | R26, R27, R28, R38 |
| 7 | Si el envío falla, **el usuario se crea igual**, en `pending`, se dice, y hay reenvío a mano | R30, R31, R14 |
| 8 | Borrado, bloqueado o ya activo: **el enlace deja de servir siempre** | R22 |
| 9 | La contraseña del enlace pasa por la **política de QC-19** y el hashing de **QC-5**, sin excepción | R19, R23 |
| 10 | **Sí lleva E2E**, el camino completo hasta entrar | R41 |
| 11 | **No se parte** en backend + frontend: la pantalla pública y su token son la misma funcionalidad | R17, R18, R24, R25, R33, R40 |
| 12 | Precedentes heredados: borrado **lógico**, inglés `snake_case`, migración con `down.sql`, **autorización en el service** con el actor por parámetro fallando cerrado, **Server Actions con `FormData`**, errores con `code` estable del catálogo de QC-70 | R6, R12, R14, R32, R33, R34, R35, R36 |

Requisitos que **no** salen de una fila de la tabla, y de dónde salen: **R9**, **R10**, **R13** y
**R20** de `docs/architecture.md > Acceso a datos y autorizacion` y del criterio que QC-66 R17 ya
fijó («la garantía la da la base, nunca un `SELECT` previo») aplicado al secreto del enlace, que es
el corazón de esta ficha; **R21** del hueco que deja **P3**; **R24** del mismo criterio de «oráculo
de existencia» de QC-66 R33 y del `code` compartido de `UserNotFoundError`; **R29** de
`docs/architecture.md > Anti-patrones` (ningún `console.log` de secretos o PII); **R37** de
`docs/architecture.md > Dominio` n.º 1 y de QC-66 R38/R43; **R40** de la sección «Lo que NO entra».

## Preguntas abiertas

1. **Desde qué dirección y con qué dominio sale el correo.** `resend` exige un dominio verificado
   por DNS, y en el repo **no hay ningún dato** del dominio de correo de la empresa: ni en `.env`,
   ni en `docs/`, ni en el código. No se rellena con un supuesto (regla 6 de `CLAUDE.md`).
2. **Qué dice el correo.** No hay sistema de plantillas ni de idiomas —**QC-72**
   (`internacionalizacion-de-textos`) sigue `pending`—, así que el texto nacería en español y
   escrito en el código. Falta decidir si eso es aceptable ahora o si el copy espera a QC-72.

3. **P3 — ¿La cuenta sigue pidiendo cambiar la contraseña después de que la persona la eligió ella
   misma por el enlace? Añadida por `spec_author` en F1.2.** La **decisión 8 de QC-66** puso
   `must_change_credential` en verdadero al nacer la cuenta, y su motivo escrito es literal: «la
   marca cierra el caso de que la contraseña llegue por **otro camino** —el enlace de QC-79, o el
   restablecimiento de QC-89— sin que nadie se acuerde de ponerla». Eso se escribió **antes** de
   saber que en QC-79 la contraseña no llega «por otro camino»: la elige la propia persona, y nadie
   más la conoce. Dejar la marca en verdadero obligaría a cambiarla otra vez en el primer acceso, a
   los dos minutos de haberla elegido; bajarla contradice la letra de una decisión cerrada de otra
   ficha. **No se decide por supuesto** (regla 6 de `CLAUDE.md`).
   - **Respuesta propuesta, escrita como requisito:** «CUANDO la contraseña se establece con el
     enlace, el sistema DEBE dejar la marca de cambio de credencial en **falso**, porque la eligió
     la propia persona y nadie más la conoce; la marca sigue naciendo en verdadero (QC-66 R13) y
     sigue en verdadero cuando la contraseña la escribe **otra persona** —el alta con contraseña de
     R2, y el restablecimiento de QC-89—.»
   - **Mientras siga abierta manda R21**: la marca **no se toca**. Es la opción conservadora y hoy
     su consecuencia es **nula medible**: ningún archivo de `lib/`, `app/` ni `middleware.ts` lee
     `must_change_credential` (verificado el 2026-09-11; solo la escriben el seed y el alta de
     QC-66). Quien la lea será **QC-7/QC-36**, y ese día esta pregunta se vuelve visible para una
     persona real. Cerrarla es cambiar R21 por el requisito propuesto: un caso de test más y una
     columna en la misma escritura de R19, sin migración.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-11 | ¿La contraseña sigue siendo obligatoria al crear un usuario? | **No: pasa a ser opcional.** Si el administrador la escribe, todo sigue como en QC-66 (su decisión 6: generada al azar, guardada con bcrypt, no se muestra a nadie) |
| 2026-09-11 | Si no la escribe, ¿qué ocurre? | Se envía un **enlace por correo** con el que la persona establece la suya. Establecerla mueve la cuenta `pending` → `active` |
| 2026-09-11 | ¿Cuánto vive el enlace? | **7 días** |
| 2026-09-11 | ¿Se puede reenviar? ¿Y el anterior? | **Sí, y el anterior muere**: como máximo **un enlace vivo por persona**. El reenvío va bajo el permiso `usuarios.modificar`, heredado de QC-66 |
| 2026-09-11 | ¿Sirve también para recuperar una contraseña olvidada? | **No: solo para el alta.** La recuperación sale a **QC-96**, que hereda de aquí el envío de correo y el mecanismo de token y no los reconstruye |
| 2026-09-11 | ¿Con qué se envía el correo? | **`resend`**. Los cuatro checks verificados contra el registro de npm el 2026-09-11: `6.27.0` publicada el 2026-09-09, 8.288.901 descargas/semana, licencia MIT, sin `deprecated`. Elegido por **API HTTP frente a SMTP**, porque el despliegue es Vercel y una función serverless no sostiene bien una conexión SMTP viva. Descartados: `nodemailer` (MIT-0 y SMTP desde serverless), `@sendgrid/mail` (pasa el check de release por tres semanas), `postmark` (el menos usado de los cuatro). **La dependencia la aprueba el humano en F1.4 y su fila en `docs/dependencias.md` es condición** (regla 7 de `CLAUDE.md`) |
| 2026-09-11 | ¿Qué pasa si el envío falla? | **El usuario se crea igual**, en `pending`, y la pantalla lo dice, con reenvío a mano. Una caída del proveedor no deja al administrador sin poder dar de alta a nadie |
| 2026-09-11 | ¿Y si el administrador borra al usuario o le cambia el estado antes de que use el enlace? | **El enlace deja de servir siempre**: solo funciona si la cuenta existe y sigue en `pending`. Borrada, bloqueada o ya activa, no hace nada. Coherente con QC-66 decisión 5, donde un usuario borrado se trata como inexistente |
| 2026-09-11 | ¿La contraseña que se establece por el enlace pasa por la política? | **Sí, sin excepción**: política de **QC-19** y hashing de **QC-5**. El enlace **no es una puerta lateral** a la política de contraseñas |
| 2026-09-11 | ¿Lleva E2E? | **Sí, el camino completo**: alta sin contraseña → enlace → establecerla → entrar con ella. Es un flujo de autenticación y de activación de cuenta, que es justo lo que `CHECKPOINTS.md` exige cubrir |
| 2026-09-11 | Siendo `fullstack`, ¿se parte en backend + frontend? | **No se parte.** La pantalla pública donde se establece la contraseña y el token que la respalda son la misma funcionalidad por sus dos puntas; partirla dejaría una ficha de front esperando. Mismo criterio que QC-70, QC-90 y QC-66 |
| 2026-09-11 | Precedentes que se heredan y no se reabren | Borrado **lógico** con `deleted_at` (QC-66 d.3); identificadores de DB en **inglés `snake_case`**; migración **con su `down.sql`**; **autorización en el service**, fallando cerrado, con el actor por parámetro (QC-66 d.15); **Server Actions con `FormData`** en las mutaciones; errores con **`code` estable** del catálogo de **QC-70** |
