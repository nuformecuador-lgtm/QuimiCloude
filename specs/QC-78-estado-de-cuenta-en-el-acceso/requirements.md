# QC-78 — estado-de-cuenta-en-el-acceso · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** `QC-65` ·
> **Rama:** `feature/QC-78-estado-de-cuenta-en-el-acceso`
>
> **Alcance.** Que el estado que QC-65 persiste **mande de verdad**: solo `active` entra al
> login, y quien ya está dentro sale en la siguiente pantalla que abra si su cuenta deja de
> estarlo. El bloqueo por intentos fallidos pasa a **escribirse como `blocked`** conservando
> sus plazos, y sacar una cuenta de `blocked` limpia el contador para que no se vuelva a
> bloquear sola. Módulo `identity`, **sin columnas nuevas y sin migración**.
>
> **Lo que NO entra.** Los casos de uso que cambian el estado a mano y quién puede
> invocarlos → **QC-66**. La pantalla → **QC-67**. Invalidar sesiones con un sello por
> usuario → **QC-23**, y esta ficha **no la usa ni depende de ella**. Guardar en memoria
> rápida la comprobación → **QC-28**.
>
> Sembrado por `/afinar-feature` el 2026-09-08. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Vocabulario, para que los requisitos no repitan la definición:
> - **estado almacenado**: el valor de `users.account_status` que persiste QC-65 (`active`,
>   `pending`, `inactive`, `blocked`).
> - **estado efectivo**: lo que ese estado significa **en un instante concreto**, una vez
>   aplicado el plazo `users.locked_until`. Lo define R7–R12 y lo calcula una única función.
> - **resultado genérico de rechazo**: el objeto de fallo único y congelado que QC-7 dejó en
>   el caso de uso de login (`REJECTED`), el mismo para usuario inexistente y contraseña mala.

### El estado manda en el login

- **R1.** MIENTRAS el estado efectivo de una cuenta sea distinto de `active`, el sistema DEBE
  rechazar su intento de login, incluso si el nombre de usuario existe y la contraseña es
  correcta.
- **R2.** CUANDO el nombre de usuario corresponda a una cuenta existente, el sistema DEBE
  realizar **exactamente una** verificación de hash de contraseña **antes** de evaluar el
  estado efectivo, sea cual sea ese estado, y no DEBE evaluar el estado antes de esa
  verificación.
- **R3.** SI el estado efectivo no es `active`, ENTONCES el sistema DEBE devolver **la misma
  instancia** del resultado genérico de rechazo que devuelve para un usuario inexistente y para
  una contraseña incorrecta, sin campo, código, mensaje ni forma que permita distinguir los
  tres estados no-`active` entre sí, del usuario inexistente ni de la contraseña incorrecta.
- **R4.** SI el estado efectivo no es `active`, ENTONCES el sistema NO DEBE emitir sesión ni
  escribir cookie de sesión, aunque la contraseña sea correcta.
- **R5.** CUANDO el estado efectivo no sea `active`, el sistema DEBE evaluar ese corte **antes**
  de registrar el intento fallido, de modo que el camino de rechazo por estado no llegue a
  ninguna escritura. (Es una diferencia deliberada respecto del corte por empresa dada de baja
  de QC-48, que va **después** del `!correcta`; la fija la decisión cerrada del 2026-09-08 sobre
  `pending` e `inactive`.)
- **R6.** MIENTRAS el estado efectivo de una cuenta sea `pending` o `inactive`, el sistema NO
  DEBE modificar ninguna columna de esa fila en un intento de login —ni
  `failed_login_attempts`, ni `lock_level`, ni `locked_until`, ni `account_status`, ni sus
  columnas de rastro—, con contraseña correcta o incorrecta.

### El estado efectivo: una sola traducción

- **R7.** El sistema DEBE calcular el estado efectivo en **una única función de dominio puro**,
  sin reloj propio (el instante entra por parámetro) y sin acceso a base ni framework, y todo
  lector del estado de cuenta —el login y la resolución de sesión— DEBE obtenerlo por esa
  función y no comparando el estado almacenado por su cuenta.
- **R8.** SI el estado almacenado es `blocked` y `locked_until` tiene un instante ya vencido en
  el momento evaluado, ENTONCES el estado efectivo DEBE ser `active`.
- **R9.** SI el estado almacenado es `blocked` y `locked_until` está vacío, ENTONCES el estado
  efectivo DEBE ser `blocked` en cualquier instante evaluado (bloqueo puesto por una persona: no
  caduca).
- **R10.** SI el estado almacenado es `blocked` y `locked_until` es un instante todavía futuro,
  ENTONCES el estado efectivo DEBE ser `blocked`.
- **R11.** SI `locked_until` es un instante todavía futuro, ENTONCES el estado efectivo DEBE ser
  `blocked` aunque el estado almacenado sea `active` (filas bloqueadas por la política de QC-19
  antes de que esta ficha unificara las dos cosas).
- **R12.** SI el estado almacenado es `pending` o `inactive`, ENTONCES el estado efectivo DEBE
  ser ese mismo valor, cualquiera que sea `locked_until`.

### El bloqueo por intentos se escribe como `blocked`

- **R13.** CUANDO un intento fallido consume un bloqueo según la política de intentos ya
  existente, el sistema DEBE escribir `account_status = blocked` en la misma operación en la que
  escribe el estado de bloqueo, dejando el rastro de cambio con el instante del intento y **sin
  autor** (vacío = lo hizo el sistema).
- **R14.** El sistema DEBE derivar el estado de cuenta que persiste **del estado de bloqueo que
  ya calculó la política existente** (número de fallos, nivel de escalada y plazo), sin duplicar
  ni reimplementar esa política: los plazos de 1, 5, 15 y 60 minutos y su escalada NO DEBEN
  cambiar, y NO DEBE existir bloqueo automático sin plazo.
- **R15.** CUANDO el sistema escriba un estado de bloqueo cuyo plazo quede vacío (un fallo que
  no consuma bloqueo, o un ingreso correcto) sobre una fila cuyo estado almacenado sea
  `blocked`, DEBE escribir además `account_status = active`. Ninguna escritura de esta ficha
  DEBE dejar nunca una fila con `account_status = blocked` y `locked_until` vacío, porque esa
  combinación significa «bloqueada por una persona» (R9) y no caducaría jamás.
- **R16.** CUANDO un login sea correcto, el sistema DEBE seguir reiniciando el contador de
  intentos y el nivel de escalada, y SI el estado almacenado era `blocked`, ENTONCES DEBE
  dejarlo en `active` con el rastro de cambio sin autor.
- **R17.** SI el estado de cuenta que corresponde escribir es igual al almacenado, ENTONCES el
  sistema NO DEBE escribir `account_status` ni su rastro de cambio, para que la marca de último
  cambio siga significando un cambio real y no el último intento de login.
- **R18.** CUANDO el sistema registre un intento fallido con escritura condicional, DEBE incluir
  el estado de cuenta leído en la condición de la escritura, de modo que SI el estado cambió
  entre la lectura y la escritura, ENTONCES la escritura no se aplica, se relee la fila y se
  recalcula sobre el estado fresco; el registro del intento NUNCA DEBE sobrescribir un cambio de
  estado hecho por otro camino.
- **R19.** CUANDO al releer la fila fresca el estado efectivo ya no sea `active`, el sistema DEBE
  abandonar el registro del intento sin escribir nada.

### La sesión ya abierta

- **R20.** MIENTRAS exista una sesión con cookie válida y no caducada, el sistema DEBE
  comprobar en **cada petición** el estado efectivo de la cuenta y, SI no es `active`, ENTONCES
  DEBE resolver «no hay sesión», por el mismo camino de salida que los cortes ya existentes de
  baja lógica y empresa no viva —sin borrar la cookie y sin mensaje que diga por qué—.
- **R21.** El corte por estado en la resolución de sesión NO DEBE añadir ninguna consulta
  adicional a la base por petición, y NO DEBE escribir nada: una ficha con el plazo vencido se
  corrige en el camino de escritura del login (R15, R16), no al leerla.
- **R22.** El corte por estado en la resolución de sesión NO DEBE depender de ningún registro ni
  sello de invalidación de sesiones por usuario (QC-23): DEBE decidirse solo con la ficha del
  usuario que la resolución ya relee.
- **R23.** El sistema NO DEBE introducir ninguna tarea programada, cron ni proceso de fondo para
  corregir estados vencidos.

### Desbloqueo administrativo

- **R24.** El módulo `identity` DEBE publicar, como dominio puro y probado, el estado de bloqueo
  que corresponde a una cuenta que sale de `blocked`: contador de intentos a cero, nivel de
  escalada a cero y plazo vacío, los tres a la vez. (La operación que mueve el estado a mano es
  de QC-66; esta ficha entrega el mecanismo que esa operación tiene que aplicar.)
- **R25.** SI una cuenta sale de `blocked` aplicando el mecanismo de R24, ENTONCES su siguiente
  intento de login fallido DEBE contar como el primero de una nueva serie y NO DEBE volver a
  bloquear la cuenta de inmediato.

### Alcance

- **R26.** El sistema NO DEBE añadir ninguna columna, tabla, enum ni migración: `db/schema.prisma`
  y `db/migrations/` DEBEN quedar sin cambios. Esta ficha solo cambia quién escribe y quién lee
  `account_status`, `failed_login_attempts`, `lock_level` y `locked_until`, que ya existen.
- **R27.** El sistema NO DEBE incorporar ninguna dependencia nueva: `package.json` DEBE quedar
  sin cambios.
- **R28.** El sistema DEBE cubrir con pruebas de extremo a extremo, ampliando las que ya existen,
  (a) que una cuenta cuyo estado efectivo no es `active` no entra y ve el mismo mensaje de
  siempre, y (b) que una sesión abierta cuya cuenta deja de estar `active` deja de tener sesión
  en la siguiente pantalla que abre.

### El corte de sesión no puede acabar en un bucle (ampliación del 2026-09-10)

> Vocabulario añadido:
> - **cortes de sesión que dependen de la ficha**: los tres cortes de la resolución de sesión que
>   solo se pueden decidir consultando la base — baja lógica (**QC-8 R11**), empresa no viva
>   (**QC-48 R15**) y estado efectivo distinto de `active` (**R20** de esta ficha). Los tres
>   resuelven «no hay sesión» y salen por el mismo `redirect` al login.
> - **marca de sesión cortada**: el dato que la redirección al login lleva consigo para que la
>   decisión de acceso a rutas sepa que ese login **sí se tiene que servir**.
>
> El porqué de estos dos requisitos, y las tres salidas que se descartaron, están en
> `## Ampliación del 2026-09-10`, más abajo.

- **R29.** CUANDO el servidor de la zona privada redirija al login porque la resolución de sesión
  no devolvió sesión por **cualquiera** de los cortes que dependen de la ficha —los tres, no solo
  el de estado—, el sistema DEBE incluir la marca de sesión cortada en esa redirección, y la
  decisión de acceso a rutas NO DEBE devolver a la zona privada una petición del login que traiga
  la marca, aunque la cookie firmada siga resolviendo como sesión válida. La navegación DEBE
  terminar sirviendo la pantalla de login **con una sola redirección** y NUNCA DEBE encadenar más
  de una. Todo ello sin borrar ni modificar la cookie de sesión, sin ninguna consulta a la base
  desde el borde y sin depender de ningún sello de invalidación por usuario (QC-23).
- **R30.** La marca de sesión cortada DEBE cumplir a la vez estas dos propiedades:
  - **(a) Opaca.** DEBE ser **exactamente el mismo texto** para los tres cortes, NO DEBE llevar
    código, motivo, estado de cuenta ni nada que permita distinguir un corte de otro, y la
    pantalla de login DEBE renderizarse **igual** con la marca y sin ella: ni mensaje, ni aviso,
    ni cambio visible alguno.
  - **(b) De un solo sentido.** La marca NO DEBE alterar ninguna decisión de acceso distinta de la
    del login descrita en R29: una petición a una ruta privada que la lleve en su cadena de
    consulta DEBE decidirse **exactamente igual** que la misma petición sin ella, y la marca NUNCA
    DEBE hacer que una sesión válida se trate como anónima ni que una sesión ausente se trate como
    válida. Además NO DEBE persistirse (ni en cookie, ni en la sesión, ni en el destino de vuelta)
    ni propagarse a la navegación siguiente: su efecto DEBE agotarse en la petición que la lleva.
    Consecuencia verificable, y es lo que la hace inofensiva: para alguien con sesión legítima que
    escriba la URL a mano, el **único** efecto posible es ver la pantalla pública de login en esa
    única petición, sin ganar ni perder acceso a nada.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)` queda cubierta por al menos un requisito:

| Decisión | Requisitos |
|---|---|
| ¿Quién entra al login? | R1, R4 |
| ¿Se distingue en pantalla por qué no entró? | R3 |
| ¿Dónde se comprueba el estado? | R2 |
| ¿El bloqueo por intentos se vuelve permanente? | R8, R13, R14, R15 |
| ¿Cómo se distingue el bloqueo automático del que pone una persona? | R9, R10, R15 |
| ¿Qué dice la ficha con el plazo vencido? | R7, R8, R11, R21, R23 |
| ¿Qué le pasa a quien ya está dentro? | R20, R21 |
| ¿Se usa el sello por usuario de QC-23? | R22 |
| ¿`pending` e `inactive` suman intentos fallidos? | R5, R6, R12, R19 |
| ¿Qué limpia el desbloqueo administrativo? | R24, R25 |
| ¿Añade columnas o migración? | R26 |
| ¿Hace falta E2E? | R28 |
| ¿Librería nueva? | R27 |
| Idioma y convenciones del esquema | R26 (no se añade persistencia, así que no hay identificador nuevo que nombrar) |
| ¿Qué le pasa a quien ya está dentro? — que la salida **llegue** al login y no rebote (ampliación del 2026-09-10) | R29, R30 |

## Ampliación del 2026-09-10 — el corte de sesión rebotaba en un bucle

**Qué se descubrió.** Una cuenta que deja de estar `active` no acababa en el login: el navegador
moría con `Load cannot follow more than 20 redirections`.

**Cómo.** Falló el **E2E de R28 (b)** (`e2e/session.spec.ts`) **en los dos navegadores** durante
F2.1, con los 28 requisitos ya implementados y en verde en el resto del gate. No es un fallo del
test: el test hace exactamente lo que R28 (b) pide y el producto no lo cumplía.

**El mecanismo, comprobado en las tres piezas.**

1. La cookie sigue viva y firmada, así que `route-guard-middleware.ts` la resuelve como
   `authenticated` y deja pasar. **No puede saber más**: el borde tiene prohibido consultar la
   base (QC-9 R4, QC-75 R18).
2. El layout privado sí consulta: la resolución de sesión devuelve «no hay sesión» por el corte y
   el layout redirige al login (`app/(private)/layout.tsx`). Lo mismo hace
   `requirePagePermission` cuando es la página la que llega primero.
3. El middleware ve `/login` **con sesión válida** y aplica la regla 3 de
   `lib/modules/identity/domain/route-access.ts` («el login con sesión no se sirve, se aterriza
   donde el usuario quería ir»), devolviéndolo a la zona privada.
4. Vuelta al paso 2.

**Es preexistente, y eso amplía el alcance del requisito.** El corte de esta ficha (R20) es el
**sexto** de una lista donde ya estaban el de **baja lógica (QC-8 R11)** y el de **empresa no viva
(QC-48 R15)**. Los tres devuelven «no hay sesión» y salen por el mismo `redirect`, así que **los
tres producen el mismo bucle**. QC-78 no lo introduce: lo hace alcanzable por el camino que R28
(b) existe para cubrir. Por eso R29 cubre **los tres cortes** y no solo el de estado; arreglar uno
y dejar dos sería dejar el defecto vivo con otro disparador.

**La salida elegida (decisión humana del 2026-09-10): una marca en la redirección.** El servidor
redirige al login con una marca y la regla 3 del dominio **no dispara** cuando esa marca está
presente. Se eligió porque es la única de las cuatro que **no choca con ninguna decisión cerrada**:
no borra la cookie, no consulta la base en el borde y no usa el sello por usuario de QC-23.

**Las tres salidas descartadas, cada una con aquello contra lo que chocaba:**

| Salida | Por qué se descartó |
|---|---|
| **Borrar la cookie de sesión en el corte** (un cierre de sesión implícito): sin cookie, el borde ve un anónimo y sirve el login. | Choca con la **decisión cerrada del 2026-09-08** («por el mismo camino de salida que los cortes ya existentes… **sin borrar la cookie** y sin mensaje que diga por qué») y con **R20**, que la repite. Además obligaría a mover el corte fuera del render: un layout o una página no pueden escribir cookies durante el render en el App Router, solo pueden hacerlo una Server Action o un Route Handler. |
| **Comprobar el estado en el borde**, dentro del middleware, para que no deje pasar a la zona privada. | Choca con **QC-9 R4** y **QC-75 R18** —el borde decide **sin tocar la base**, y lo hace cumplir `tests/guards/guard-middleware-edge.test.ts`— y con **R21** de esta ficha, que prohíbe consultas nuevas por petición. Sería además la consulta más caliente de toda la aplicación. |
| **Usar el sello por usuario de QC-23** para que el borde sepa, sin consultar la base, que esa sesión está muerta. | Choca con la **decisión cerrada del 2026-09-08** («¿Se usa el sello por usuario de QC-23? **No**») y con **R22**. QC-23 está en `spec_ready`: usarla aquí la convertiría en dependencia de una ficha que declara expresamente no depender de ella. |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-08 | ¿Quién entra al login? | **Solo `active`.** `pending`, `inactive` y `blocked` no entran. |
| 2026-09-08 | ¿Se distingue en pantalla por qué no entró? | **No.** Los tres estados devuelven **exactamente** el mismo resultado genérico y congelado que usuario inexistente y contraseña mala. Heredado de **QC-7 R2, R3, R28**: distinguirlos confirmaría que ese usuario existe. |
| 2026-09-08 | ¿Dónde se comprueba el estado? | **Después de verificar el hash**, nunca antes. Heredado de **QC-7 R29** y del corte de «empresa dada de baja» de **QC-48**: cortar antes respondería en microsegundos y sería un oráculo de tiempo. |
| 2026-09-08 | ¿El bloqueo por intentos se vuelve permanente? | **No.** Se conservan los plazos de **QC-19**: 1, 5, 15 y 60 minutos según reincidencia, sin bloqueo eterno. La cuenta se marca `blocked` mientras dura y **vuelve sola a `active`** al vencer. Un administrador puede adelantarlo. |
| 2026-09-08 | ¿Cómo se distingue el bloqueo automático del que pone una persona? | **Por el plazo de vencimiento.** `blocked` **con** plazo es automático y caduca; `blocked` **sin** plazo lo puso un administrador y no caduca nunca. No hace falta ningún dato nuevo: usa `locked_until`, que ya existe. |
| 2026-09-08 | Mientras el plazo ya venció y nadie lo ha mirado, ¿qué dice la ficha? | **Se corrige al leerla.** Un **único** sitio traduce «`blocked` con el plazo vencido» a «`active`» y todos los lectores pasan por ahí, así que la ficha nunca se muestra bloqueada cuando ya no lo está. **Sin tarea programada** — este ERP no tiene ninguna y esta ficha no la introduce. |
| 2026-09-08 | ¿Qué le pasa a quien ya está dentro cuando su cuenta deja de estar `active`? | **Sale en la siguiente navegación.** La resolución de sesión ya relee la ficha en cada petición y ya corta por baja lógica (**QC-8 R11**) y por empresa muerta (**QC-48 R14, R15**): esto es **un corte más en la misma lista**, con cero consultas nuevas. |
| 2026-09-08 | ¿Se usa el sello por usuario de QC-23 para cortar la sesión? | **No.** QC-23 está en `spec_ready` y usarlo la convertiría en dependencia. El corte por navegación resuelve el caso hoy; si algún día hace falta cortar sin esperar a la siguiente petición, es QC-23 quien lo trae. |
| 2026-09-08 | ¿`pending` e `inactive` suman intentos fallidos? | **No, y ese camino no escribe nada.** Heredado del precedente de **QC-48** con la empresa dada de baja: castigar a alguien por una decisión administrativa que no puede arreglar sería injusto, y la cuenta no entra igual. Se asume a conciencia que quien pruebe contraseñas contra una cuenta no activa no se topa con un bloqueo. |
| 2026-09-08 | ¿Qué limpia el desbloqueo administrativo? | **El contador de intentos y el nivel de escalada, los dos a cero**, más el plazo. Heredado de **QC-19 R27** (un ingreso correcto reinicia contador *y* nivel). Sin esto, la cuenta se vuelve a bloquear al primer intento. La operación que mueve el estado es de **QC-66**; el mecanismo que se limpia es de esta ficha. |
| 2026-09-08 | ¿Añade columnas o migración? | **Ninguna de las dos.** `failed_login_attempts`, `lock_level` y `locked_until` siguen donde están y `account_status` lo creó QC-65. Esta ficha cambia **quién escribe y quién lee** lo que ya existe. |
| 2026-09-08 | ¿Hace falta E2E? | **Sí**, y se amplían los que ya hay: `e2e/login.spec.ts` (una cuenta que no está `active` no entra y ve el mismo mensaje de siempre) y `e2e/session.spec.ts` (una sesión abierta cuya cuenta se desactiva). `CHECKPOINTS.md` lo pide para autenticación. |
| 2026-09-08 | ¿Librería nueva? | **Ninguna.** Todo el mecanismo existe ya en `identity`. |
| 2026-09-08 | Idioma y convenciones del esquema | Heredado de **QC-4**. Esta ficha no añade persistencia. |
