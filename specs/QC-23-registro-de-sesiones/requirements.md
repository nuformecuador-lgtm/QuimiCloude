# QC-23 — registro-de-sesiones · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** `QC-8` ·
> **Rama** `feature/QC-23-registro-de-sesiones`
>
> ## Alcance
>
> Que cerrar sesión invalide **de verdad** el código de sesión, y no solo retire la cookie: hoy una
> copia del código hecha antes de cerrar seguiría funcionando hasta que caduque.
>
> Se hace con **dos mecanismos distintos**, porque las dos acciones son distintas: un **sello por
> usuario** —una fecha de «válido desde»— que mata todo lo emitido antes, y un **identificador de
> sesión** dentro del token más el registro de las sesiones cerradas una a una.
>
> ## Lo que NO entra
>
> - **El botón del usuario** («cerrar todas mis sesiones») → **QC-53**.
> - **El botón del administrador** → **QC-101**, creada el 2026-09-12 al re-acotar esta. Antes no
>   tenía dónde colgar y la capacidad quedaba sin poder invocarse; hoy la pantalla existe.
> - **La lista de dispositivos abiertos** con cierre uno a uno: **descartada a propósito y NO
>   genera ficha** — obliga a una lectura por petición, justo lo que **QC-28** quiere quitar.
> - **Guardar en memoria rápida la comprobación** → **QC-28**.
> - **Cualquier maquinaria de trabajo en segundo plano**: no existe en el ERP y esta ficha no la
>   construye.
>
> _Re-sembrado por `/afinar-feature` el 2026-09-12. **Sustituye al spec del 2026-09-03**, que se
> escribió antes de QC-65, QC-66, QC-67, QC-70, QC-71, QC-78 y QC-79 y no los menciona; sus tres
> archivos siguen en `dc1c6ae`. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó
> el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo
> aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

### A. El identificador de sesión dentro del token

**R1.** El sistema DEBE incluir en el contenido firmado de la cookie de sesión un **identificador
de sesión** (`sid`) con forma de UUID, además de lo que ya viaja (`sub`, `iat`, `exp`, `role`,
`cid`).

**R2.** CUANDO el sistema emite una sesión, DEBE generar un `sid` nuevo: dos emisiones para la
misma persona, aunque ocurran en el mismo instante, DEBEN producir `sid` distintos.

**R3.** El sistema DEBE subir la **versión del formato** del valor de la cookie y DEBE rechazar
todo valor de una versión anterior **sin verificar su firma y sin interpretar su contenido**, igual
que hoy rechaza `v1` y `v2`.

**R4.** CUANDO se despliega esta feature, una cookie de la versión anterior, con firma correcta y
sin caducar, DEBE resolverse como «sin sesión»; quien tuviera sesión abierta DEBE acabar en el
**login** en su siguiente navegación, por el mismo camino de salida que ya existe —sin mensaje de
error, sin pantalla propia y sin borrar ninguna cookie—.

**R5.** El sistema DEBE conservar **una sola** implementación de la firma en todo el repositorio: el
`sid` no introduce ningún algoritmo criptográfico nuevo ni una segunda ruta de verificación.

**R6.** SI el contenido firmado llega sin `sid`, con `sid` vacío, de un tipo que no es texto o sin
forma de UUID, ENTONCES el sistema DEBE resolverlo como «sin sesión» **sin consultar la base**.

### B. El sello por usuario

**R7.** El sistema DEBE guardar, por usuario, un sello **«sesiones válidas desde»**, con precisión
de **segundo** —la misma con la que viaja `iat` en el token—, obligatorio y presente en toda fila de
usuario, incluidas las que ya existen.

**R8.** MIENTRAS el instante de emisión de una sesión (`iat`) sea **anterior o igual** al sello de
su usuario, el sistema DEBE tratar esa sesión como inválida.

**R9.** CUANDO una operación sube el sello de un usuario al instante `t`, toda sesión emitida en
`t` o antes DEBE quedar inválida, **sin ventana ni excepción**; y la única sesión que puede
sobrevivir es la que se emita con un `iat` **posterior** a `t` (R25).

### C. El registro de sesiones cerradas

**R10.** El sistema DEBE guardar el registro de las sesiones cerradas **una a una**, con: el `sid`
cerrado, la persona a la que pertenecía, la **caducidad natural** del token cerrado y el instante
del cierre.

**R11.** MIENTRAS exista una fila en ese registro para el `sid` de la sesión en curso, el sistema
DEBE tratar esa sesión como inválida.

**R12.** CUANDO se registra el cierre de una sesión ya registrada, el sistema NO DEBE crear una
segunda fila ni fallar por ello: el `sid` es único en el registro.

### D. La comprobación en cada petición

**R13.** El sistema DEBE aplicar las dos comprobaciones —sello y registro— **donde ya se resuelve el
usuario contra la base en cada petición**, y NO en el middleware: el borde NO DEBE ganar ninguna
lectura de base de datos.

**R14.** Las dos comprobaciones DEBEN resolverse con **una sola invocación** del puerto que ya se
invocaba: el sello viaja en la misma fila de usuario que ya se lee, y la pertenencia del `sid` al
registro es una búsqueda por índice único. El sistema NO DEBE añadir ninguna otra lectura por
petición.

**R15.** El sistema DEBE aplicar los cortes en este orden, conservando intactos los seis que ya
existen: contenido inválido → caducada → fila del usuario → empresa que no casa → empresa muerta →
estado efectivo de cuenta → **sello** → **registro de cerradas**.

**R16.** SI la comprobación no se puede realizar —fallo de la base, del puerto o de cualquier pieza
de la que dependa—, ENTONCES el sistema DEBE tratar la sesión como **inválida** y la persona DEBE
acabar en el login. El sistema NO DEBE dar por válida una sesión cuya comprobación falló.

**R17.** CUANDO la comprobación falla, el sistema DEBE dejar la causa en el **registro del
servidor** junto al **identificador de petición** de QC-71, y NO DEBE mostrar ese detalle al
navegador.

**R18.** CUANDO el sello y el registro invalidan la misma sesión a la vez, el resultado DEBE ser el
mismo —«sin sesión»— y NO DEBE depender de cuál de los dos se evalúe primero.

**R19.** El estado de revocación NO DEBE vivir **solo** en una memoria rápida: cualquier caché que
se añada después (QC-28) DEBE poder fallar cayendo a la base sin que una sesión cerrada llegue a
autorizar nada.

### E. Cerrar sesión: un dispositivo

**R20.** CUANDO una persona cierra sesión, el sistema DEBE dejar inválido **ese** `sid` y **solo
ese**: las demás sesiones vivas de esa misma persona DEBEN seguir siendo válidas.

**R21.** La operación de cierre de sesión DEBE conservar su firma actual: **sin parámetros y sin
valor de retorno**.

**R22.** CUANDO una persona cierra sesión, el sistema DEBE retirar la cookie exactamente como hoy,
**además** de registrar el cierre, y DEBE llevarla al login.

**R23.** SI al cerrar sesión no se puede registrar el cierre, ENTONCES el sistema DEBE retirar la
cookie y llevar al login **igualmente**, y DEBE dejar la causa en el registro del servidor con el
identificador de petición; NO DEBE quedar en silencio ni impedir el cierre. _(Ver pregunta abierta
1: este requisito es la respuesta propuesta.)_

**R24.** CUANDO una persona cierra sesión, el sistema NO DEBE subir el sello de esa persona ni
tocar ninguna otra de sus sesiones.

### F. Cerrar todas, y el cambio de contraseña

**R25.** CUANDO una persona pide cerrar **todas** sus sesiones, el sistema DEBE dejarlas inválidas
**todas, incluida la actual**, y esa persona DEBE acabar en el login.

**R26.** CUANDO el Administrador cierra las sesiones de **otra** persona, el sistema DEBE cerrarlas
**todas**: elegir un dispositivo concreto de otra persona NO DEBE ser expresable en la operación.

**R27.** El sistema DEBE validar la autorización de estas operaciones **en el service**, en la
**primera línea**, antes de validar la entrada y antes de tocar el repositorio, y DEBE fallar
cerrado —actor ausente, sin conjunto de permisos, con el conjunto vacío o sin el código exigido se
rechazan todos igual—. Cerrar las **propias** sesiones no exige ningún código; cerrar las de otra
persona exige el código de modificación de usuarios.

**R28.** SI la persona objetivo no existe, está borrada lógicamente o es de **otra empresa**,
ENTONCES el sistema DEBE responder **no encontrada**, con el mismo código de error con el que ya
responde la administración de usuarios, sin distinguir los tres casos.

**R29.** El **actor** DEBE entrar por parámetro en estas operaciones: el service NO DEBE leer
cookies ni cabeceras, y la RLS NO cuenta como autorización.

**R30.** CUANDO la contraseña de una persona cambia, el sistema DEBE dejar inválidas **todas** las
sesiones vivas de esa persona, por los tres caminos que existen hoy: el cambio propio (**QC-36**),
el restablecimiento que hace el Administrador (**QC-89**) y el enlace de **QC-79**.

**R31.** DONDE quien cambia la contraseña es **la propia persona y tiene sesión en curso**, el
sistema DEBE dejar **esa sesión, y solo esa**, utilizable, emitiendo en ese mismo dispositivo una
sesión nueva con un `sid` nuevo y un instante de emisión **posterior** al sello.

**R32.** El sistema DEBE ofrecer el corte de R30 y R31 como una operación del módulo **invocable**
por QC-36 y QC-89, y DEBE dejarlo **ya aplicado** en el camino del enlace de QC-79, que es el único
de los tres que existe hoy. Esta ficha NO DEBE implementar ninguna de las dos pantallas pendientes.

### G. Lo que corta las sesiones vivas

**R33.** CUANDO una cuenta pasa a **bloqueada** o a **inactiva**, el sistema DEBE dejar inválidas
todas las sesiones vivas de esa persona, al instante.

**R34.** CUANDO una persona es **borrada**, el sistema DEBE dejar inválidas todas sus sesiones
vivas, al instante.

**R35.** CUANDO el **rol** de una persona cambia, el sistema DEBE dejar inválidas todas sus sesiones
vivas, al instante.

**R36.** El paso a **`pending`** NO DEBE cortar sesiones por esta ficha: una cuenta pendiente nunca
llegó a tener una, y el corte inmediato que ya existe por estado de cuenta sigue aplicándose sin
cambios.

**R37.** El sistema NO DEBE duplicar la lógica que ya corta al entrar y al resolver la sesión: el
corte **inmediato** por estado de cuenta y por borrado ya existe y se conserva tal cual; lo que esta
ficha añade es que ese corte sea **duradero** —volver a activar una cuenta bloqueada NO DEBE revivir
las sesiones que tenía abiertas antes—.

**R38.** Los cortes de R33, R34, R35 y R30 DEBEN aplicarse en la **misma transacción** que la
escritura que los provoca: si la escritura no se confirma, el sello no sube; si el sello no puede
subir, la escritura no se confirma.

### H. La purga de las filas caducadas

**R39.** CUANDO una operación de esta ficha lee o escribe el registro de sesiones cerradas de una
persona, el sistema DEBE borrar, en esa misma transacción, las filas **de esa persona** cuya
caducidad natural ya pasó.

**R40.** El sistema NO DEBE depender de ninguna tarea programada ni de ningún proceso en segundo
plano para esa purga, y la comprobación por petición (sección D) NO DEBE escribir en la base.

### I. Datos, migración y arquitectura

**R41.** Todo identificador nuevo de base de datos —tabla, columnas, índices y restricciones— DEBE
estar en **inglés** y en `snake_case`.

**R42.** La tabla nueva DEBE nacer con **RLS activada y forzada** (`ENABLE` + `FORCE ROW LEVEL
SECURITY`) y sin ninguna policy que conceda acceso. Eso NO sustituye a la autorización de R27.

**R43.** La feature DEBE entregar su migración con `migration.sql` (UP) **y** `down.sql` (DOWN)
obligatorio, y revertirla DEBE dejar el esquema **exactamente** como estaba.

**R44.** La tabla nueva NO DEBE llevar columna de empresa: no es una tabla de operación, cuelga de
la ficha de la persona y su empresa es, por definición, la de esa persona.

**R45.** La tabla nueva DEBE llevar `created_at`, y NO DEBE llevar `updated_at` ni `deleted_at`: sus
filas son un hecho inmutable —una sesión cerrada— y la única escritura posterior es el borrado de
R39, que por eso es **físico** y no lógico.

**R46.** La lógica de **qué sesión es válida** DEBE vivir en `domain/`; el almacén DEBE ser un
**adaptador driven** detrás de un puerto; y el cableado puerto → implementación DEBE ocurrir **solo**
en `lib/composition/`.

**R47.** La feature NO DEBE añadir ninguna dependencia nueva a `package.json`.

**R48.** Todo código de error que la feature necesite DEBE salir del **catálogo cerrado** de QC-70
con su traductor único, y ningún sitio que lanza DEBE escribir el texto del mensaje.

**R49.** La caducidad de la sesión NO DEBE cambiar: **8 h absolutas**, sin renovación deslizante y
sin «recordarme». Ninguna petición ordinaria DEBE reemitir ni prolongar una sesión; la única
reemisión fuera del login es la de R31, que abre una sesión **nueva** con su propia ventana.

**R50.** La prueba de extremo a extremo en navegador queda **diferida a QC-53** con motivo: esta
ficha no añade ninguna pantalla, ninguna ruta ni ningún botón que visitar, y QC-53 es quien trae el
recorrido navegable. Es una **deuda con destinatario**, no una exención de
`CHECKPOINTS.md > Calidad de codigo`.

**R51.** El botón del Administrador NO DEBE entrar aquí: la operación de R26 queda **implementada y
probada en el service**, y la feature NO DEBE crear ninguna pantalla, ruta, componente ni Server
Action para invocarla desde la interfaz. Esa mitad es **QC-101**.

## Preguntas abiertas

El sembrado del 2026-09-12 no dejó ninguna. Al escribir los requisitos apareció **una nueva**, que
no se puede responder con lo que hay en `docs/`, `specs/` o el código, y que se escribe aquí con su
respuesta propuesta en vez de rellenarla en silencio (regla 6 de `CLAUDE.md`).

1. **¿Qué pasa si el cierre de sesión no puede registrarse?** La decisión del 2026-09-03 «¿qué pasa
   si no se puede comprobar si una sesión fue cerrada?» resuelve el camino de **lectura** —se corta—,
   pero no dice nada del camino de **escritura**: si la base no responde en el instante en que
   alguien pulsa «cerrar sesión», la cookie se puede retirar igual, pero la copia del token seguiría
   viva hasta su caducidad natural. Las dos salidas son malas de formas distintas: fallar la
   operación deja a la persona **dentro**, y seguir adelante deja una copia viva **sin avisar**.
   **Respuesta propuesta, escrita como R23**: se retira la cookie, se lleva al login y la causa queda
   en el registro del servidor con el identificador de petición de QC-71 — el cierre nunca se
   bloquea, y el fallo nunca queda en silencio. Mientras no se cierre, manda R23.

## Cobertura: cada decisión cerrada, en al menos un requisito

| # | Decisión cerrada | Requisitos |
| --- | --- | --- |
| 1 | Qué corta las sesiones vivas (bloqueada, inactiva, borrada, cambio de rol; `pending` no) | R33, R34, R35, R36, R37, R38 |
| 2 | Cambiar la contraseña corta todas menos la actual, por los tres caminos | R30, R31, R32 |
| 3 | Purga por borrado perezoso al leer, sin tarea programada | R39, R40, R45 |
| 4 | El botón del administrador sale a QC-101 | R51 |
| 5 | Errores por el catálogo de QC-70; el inesperado lleva el identificador de QC-71 | R17, R48 |
| 6 | Dos mecanismos, no uno | R7, R8, R10, R11, R18 |
| 7 | El sello no cambia el formato del token (usa `iat`) | R8, R9 |
| 8 | El identificador de sesión sí sube la versión, y rompe las sesiones vivas | R1, R2, R3, R4 |
| 9 | Cerrar sesión cierra solo ese dispositivo | R20, R24 |
| 10 | «Cerrar todas» las cierra todas, incluida la actual | R25 |
| 11 | El administrador no elige dispositivo: lo suyo es siempre total | R26 |
| 12 | No hay lista de dispositivos abiertos, y no genera ficha | R14, R19 |
| 13 | Si no se puede comprobar, se corta; el estado no vive solo en memoria rápida | R16, R17, R19 |
| 14 | La comprobación va donde ya se resuelve el usuario contra la base | R13, R14, R15 |
| 15 | `logoutAction()` cambia en el efecto, no en la firma | R21, R22 |
| 16 | Caducidad sin cambios: 8 h absolutas | R49 |
| 17 | Permisos: el Administrador cierra las de otro; cualquiera las suyas; validado en el service | R27, R28, R29 |
| 18 | Una sola implementación del HMAC en todo el repositorio | R5 |
| 19 | Módulo `identity`; dominio, puerto, adaptador driven y cableado en `lib/composition/` | R46 |
| 20 | Borrado lógico donde aplique, con `created_at` / `updated_at` / `deleted_at` | R45 |
| 21 | Identificadores de base en inglés | R41 |
| 22 | RLS activada y forzada, que no sustituye a la autorización | R42 |
| 23 | Migración con `down.sql` obligatorio y reversión exacta | R43 |
| 24 | E2E diferida con motivo a QC-53 | R50 |
| 25 | Ninguna librería nueva | R47 |

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-12 | ¿Qué corta exactamente las sesiones vivas? | Cuenta **bloqueada**, cuenta **inactiva**, usuario **borrado** y **cambio de rol**: los cuatro cortan **todo lo abierto al instante**. `pending` **no aplica** —una cuenta pendiente nunca llegó a tener sesión—. **Sustituye** a «un cambio de rol o una baja» del spec anterior, escrito cuando no existían los cuatro estados (**QC-65**, **QC-78**) ni el borrado lógico (**QC-66**) |
| 2026-09-12 | ¿Cambiar la contraseña cierra sesiones? | **Sí: todas menos la actual.** Quien la cambia sigue trabajando; el resto de dispositivos vuelven al login. Aplica a los **cuatro** caminos que existen hoy: **QC-36** (cambiar la mía), **QC-89** (el administrador restablece la de otro), el enlace de alta de **QC-79** y la **recuperación de QC-96** —esta última cierra **todas**, porque quien recupera no tiene sesión abierta que preservar—. *(Ampliado el 2026-09-12 al acotar QC-96: la redacción original decía tres y omitía QC-96, que ya existía. Fue un descuido de redacción, no una decisión.)* |
| 2026-09-12 | ¿Qué se hace con las filas de sesiones cerradas ya caducadas? | **Borrado perezoso al leer**: quien consulta las sesiones de un usuario borra de paso las suyas caducadas. Sin tarea programada, que este ERP no tiene. **Cierra la pregunta abierta 1** del spec anterior |
| 2026-09-12 | ¿El botón del administrador entra aquí? | **No: sale a QC-101** (`frontend`). Coherente con que esta ficha es `backend` y sus botones ya salían fuera. **Cierra la pregunta abierta 2** |
| 2026-09-12 | Errores | Todo código nuevo entra por el **catálogo cerrado de QC-70** con su traductor único, sin mensaje en el sitio que lanza; y el error inesperado lleva su **identificador de petición de QC-71**. Ninguna de las dos existía al escribir el spec original |
| 2026-09-03 | ¿Cómo se invalida un código ya emitido? | **Con dos mecanismos, no uno**: sello por usuario (mata todo lo anterior a una fecha) e identificador de sesión (mata una sola) |
| 2026-09-03 | ¿El sello cambia el formato del token? | **No.** El token ya lleva `iat` firmado (**QC-7**/**QC-8**): el sello se compara contra algo que ya viaja |
| 2026-09-03 | ¿Y el identificador de sesión? | **Sí, sube la versión del token** y las sesiones vivas se rompen. Aceptado con el mismo criterio que ya se aceptó antes |
| 2026-09-03 | ¿Cerrar sesión cierra un dispositivo o todos? | **Solo ese dispositivo.** Quien sale en el móvil sigue dentro en la oficina |
| 2026-09-03 | ¿Y «cerrar todas mis sesiones»? | **Todas, incluida la actual**, así que quien la usa acaba en el login |
| 2026-09-03 | ¿El administrador puede cerrar una sesión suelta de otro? | **No: lo suyo es siempre total.** No elige dispositivo |
| 2026-09-03 | ¿El usuario ve sus dispositivos abiertos? | **No, y no genera ficha.** Obliga a una lectura por petición y no da nada que no dé el cierre total |
| 2026-09-03 | ¿Qué pasa si no se puede comprobar si una sesión fue cerrada? | **Se corta**: se trata como inválida y la persona vuelve al login. Una revocación que se puede saltar provocando un fallo no es una revocación |
| 2026-09-03 | ¿Dónde se aplica la comprobación? | **Donde ya se resuelve el usuario contra la base en cada petición** (**QC-8 D2**) |
| 2026-09-03 | ¿Cambia el «cerrar sesión» que ya existe? | **En el efecto sí, en la firma no**: `logoutAction()` sigue sin parámetros y sin valor de retorno, congelada por **QC-11** |
| 2026-09-03 | Caducidad | **Sin cambios: 8 h absolutas**, sin renovación deslizante y sin «recordarme» (**QC-7 D10**) |
| 2026-09-03 | Permisos | El **Administrador** cierra las sesiones de otro; **cualquiera** cierra las suyas. Se valida **en el service**, no en el middleware, con su test |
| 2026-09-03 | ¿Cuántas implementaciones del HMAC? | **Una sola en todo el repositorio** (**QC-8 R5**, **QC-9**) |
| 2026-09-03 | Módulo y capas | **`identity`**: la lógica en `domain/`, el almacén como **adaptador driven** detrás de un puerto, cableado solo en `lib/composition/` |
| 2026-09-03 | Borrado y marcas de tiempo | **Borrado lógico** donde aplique, con `created_at` / `updated_at` / `deleted_at` (**QC-4**) |
| 2026-09-03 | Idioma de los identificadores de la DB | **Inglés** — tablas, columnas, índices y restricciones (**QC-4**) |
| 2026-09-03 | RLS | **Activada y forzada.** No sustituye a la autorización en el service (**QC-4 R19**) |
| 2026-09-03 | Migración | `migration.sql` más **`down.sql` obligatorio**, y revertirla deja el esquema exactamente como estaba (**QC-4 R20**) |
| 2026-09-03 | E2E | **Diferida con motivo a QC-53**, que trae el botón y el recorrido navegable. Aquí no hay pantalla que visitar |
| 2026-09-03 | ¿Librería nueva? | **Ninguna.** Es esquema, migración y dominio |
