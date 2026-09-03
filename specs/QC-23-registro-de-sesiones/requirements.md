# QC-23 — registro-de-sesiones · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-8` ·
> **Rama:** `feature/QC-23-registro-de-sesiones`
>
> **Alcance.** Que cerrar sesión invalide **de verdad** el código de sesión, y no solo retire la
> cookie. Se hace con **dos mecanismos distintos**, porque las dos acciones son distintas: un
> **sello por usuario** que mata todo lo emitido antes de una fecha, y un **identificador de
> sesión** dentro del token más el registro de las sesiones cerradas una a una. Con ellos: cerrar
> sesión cierra **solo ese dispositivo**; «cerrar todas» las cierra **todas, incluida la actual**;
> el administrador cerrando las de otro es **siempre total**; y cambiar el rol o dar de baja
> **corta todo al instante**. Migración con su `down.sql` y los tests. Módulo `identity`.
>
> **Lo que NO entra.** Los botones: el del usuario es **QC-53**. La **lista de dispositivos
> abiertos** con cierre uno a uno desde ella: **descartada a propósito y NO genera ficha** (ver
> decisión 7). Guardar en memoria rápida la comprobación: **QC-28**. El botón del administrador:
> no tiene ficha porque no existe pantalla de administración de usuarios (ver pregunta abierta 2).
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notacion EARS (`docs/specs.md`). El mapa `decision cerrada -> R<n>` esta en `design.md > 0`; el
> mapa `R<n> -> test` lo escribe el implementer en
> `progress/impl_QC-23-registro-de-sesiones.md` (`CHECKPOINTS.md > Trazabilidad`).
>
> **Vocabulario de este documento.** «Sesion valida» sigue significando lo de QC-9: cookie
> presente, version del formato reconocida, firma verificada y `exp` firmado aun en el futuro.
> Esta ficha añade una condicion mas, que **no** se comprueba en la cookie: que la sesion **no
> este revocada**. «Sello» es la fecha «valido desde» por usuario del mecanismo (a);
> «identificador de sesion» es el dato nuevo que viaja firmado en el token, del mecanismo (b).

### Los dos mecanismos y donde viven

**R1.** El sistema DEBE disponer de **dos** mecanismos de revocacion distintos y simultaneos:
**(a)** un **sello por usuario** —un instante «valido desde»— que invalida de golpe toda sesion
emitida antes de el, y **(b)** un **registro de sesiones cerradas una a una**, identificadas por
el identificador de sesion que viaja en el token. Una sesion DEBE resolverse como invalida SI la
alcanza cualquiera de los dos, evaluados ambos en la misma peticion.

**R2.** El mecanismo (a) DEBE evaluarse comparando el **instante de emision que ya viaja firmado
en el token** (`iat`) contra el sello del usuario, y NO DEBE exigir ningun campo nuevo en el
token ni cambiar su formato por si mismo; SI el instante de emision es anterior al sello,
ENTONCES la sesion DEBE resolverse como «sin sesion».

**R3.** CUANDO se emite una sesion, el contenido firmado DEBE llevar, ademas de lo que ya lleva,
un **identificador de sesion** con forma de UUID; dos emisiones —del mismo usuario o de
usuarios distintos— NUNCA DEBEN recibir el mismo identificador, y ese identificador NUNCA DEBE
derivarse de un dato recibido del cliente.

**R4.** El sistema DEBE **subir la version** del valor de la cookie por el cambio de R3; SI el
valor recibido trae una version anterior a la vigente, ENTONCES DEBE rechazarse como «sin
sesion» **sin verificar su firma y sin intentar interpretarlo**, y la persona DEBE terminar en
el login. NO DEBE existir compatibilidad hacia atras ni un segundo camino de verificacion.

**R5.** SI el contenido firmado de la version vigente no trae un identificador de sesion con
forma valida —ausente, vacio, de un tipo que no es texto o sin forma de UUID—, ENTONCES el
sistema DEBE resolver «sin sesion», sin consultar la base y sin suponer ningun identificador.

**R6.** El sello y el registro de sesiones cerradas DEBEN persistir en la **base de datos**, de
forma que sobrevivan a un reinicio del proceso y sean visibles desde cualquier instancia; NO
DEBEN vivir unicamente en memoria del proceso ni en un almacen que pueda perderlos.

### Que cierra cada operacion

**R7.** CUANDO una persona cierra sesion, el sistema DEBE registrar como cerrada **unicamente la
sesion que presento esa peticion**, y las demas sesiones vivas del mismo usuario DEBEN seguir
resolviendose como validas; SI el registro del cierre no se puede completar, ENTONCES el sistema
DEBE retirar la cookie igualmente y DEBE señalar el fallo, y NUNCA DEBE dar el cierre por hecho
en silencio.

**R8.** CUANDO una persona pide cerrar **todas** sus sesiones, el sistema DEBE dejarlas todas sin
valor —**incluida la que ejecuta la operacion**—, esa misma peticion DEBE terminar en el login, y
cualquier otra sesion viva de esa persona DEBE resolverse como «sin sesion» en su siguiente
peticion; SI la operacion no se puede completar, ENTONCES aplica la misma regla de R7: cookie
retirada, fallo señalado, cierre no dado por hecho.

**R9.** CUANDO el actor es el propio dueño de las sesiones, el sistema DEBE permitir tanto el
cierre de la sesion en curso (R7) como el cierre total (R8) **sin exigir ningun rol**.

**R10.** El cierre de las sesiones **de otro usuario** DEBE autorizarse **en el service**, antes
de tocar ningun puerto: SI el actor no tiene el rol Administrador, ENTONCES DEBE rechazarse con
un error de autorizacion; SI el usuario objetivo es el propio actor, ENTONCES tambien DEBE
rechazarse —su operacion es la de R8—; y la operacion DEBE ser **siempre total**: el sistema NO
DEBE ofrecer ninguna forma de que un administrador cierre una sesion suelta de otra persona.

### Cambio de rol y baja

**R11.** CUANDO el nombre del rol que el usuario tiene en la base difiere del rol **firmado** en
el token que presenta, el sistema DEBE resolver «sin sesion» en **esa misma peticion**, sin
renovar ni reemitir la cookie. Con esto **QC-9 R30 deja de describir el comportamiento**: su
test de caracterizacion —que afirmaba que el rol firmado envejece hasta la caducidad— DEBE
sustituirse por el de este requisito, no simplemente borrarse.

**R12.** SI el usuario identificado por el token no existe o tiene `deleted_at` con valor,
ENTONCES el sistema DEBE seguir resolviendo «sin sesion» (heredado de QC-8 R11) **y** esa
condicion DEBE quedar cubierta por un test propio de esta ficha: la baja corta todas las
sesiones al instante, en todos los dispositivos.

### Donde se comprueba y que pasa si falla

**R13.** La comprobacion de los dos mecanismos DEBE ejecutarse **en el mismo punto donde ya se
resuelve el usuario contra la base en cada peticion** (QC-8 D2, R10), y DEBE ocurrir **antes** de
devolver un usuario de sesion; NINGUNA respuesta DEBE entregar un usuario de sesion sin haber
comprobado antes que la sesion no esta revocada.

**R14.** SI el estado de revocacion **no se puede determinar** —la base no responde, el almacen
falla, la consulta lanza—, ENTONCES el sistema DEBE tratar la sesion como **invalida** y la
persona DEBE terminar en el login; el sistema NUNCA DEBE resolver una sesion como valida ante un
fallo de esa comprobacion, y el fallo NO DEBE quedar silenciado (se registra con contexto, sin
secretos ni PII).

**R15.** El middleware NO DEBE consultar la base ni el estado de revocacion, y NO DEBE
convertirse en la frontera: una sesion revocada PUEDE atravesar el middleware, pero NO DEBE
poder obtener un usuario de sesion ni ver contenido de la zona privada. Esta ficha NO DEBE añadir
ninguna lectura de base al camino del borde.

### Contrato publico del modulo

**R16.** El sistema DEBE conservar la firma congelada de `logoutAction()` —sin parametros y sin
valor de retorno (QC-11, QC-8 R19)—, cambiando solo su **efecto**: ademas de retirar la cookie y
redirigir, deja la sesion en curso registrada como cerrada (R7).

**R17.** El modulo DEBE exponer **exactamente tres** operaciones de revocacion —cerrar la sesion
en curso, cerrar todas las propias, y cerrar todas las de otro usuario— y NO DEBE exponer
ninguna operacion de **listado de sesiones abiertas**; el sistema NO DEBE registrar las sesiones
**abiertas**: solo el sello y las **cerradas**.

**R18.** Ninguna operacion de esta ficha DEBE alterar la caducidad de la sesion: siguen siendo 8
h absolutas desde la emision, sin renovacion deslizante y sin «recordarme»; el sistema NO DEBE
reemitir ni prolongar la cookie al comprobar la revocacion.

**R19.** NO DEBE existir una segunda implementacion del algoritmo de firma en el repositorio
—raiz incluida—: la version nueva del token DEBE emitirse y verificarse con la misma unica
implementacion que hay hoy.

**R20.** La logica de que sesion es valida —los dos mecanismos, su orden de evaluacion y el corte
ante fallo— DEBE vivir en `domain/` del modulo `identity` y ser ejercitable **sin cookie, sin
Next y sin base de datos**; el almacen DEBE ser un **adaptador driven detras de un puerto**, y su
cableado DEBE vivir unicamente en `lib/composition/`.

### Datos, migracion y verificacion

**R21.** Los identificadores de la base que introduzca esta ficha —tabla, columnas, indices y
restricciones— DEBEN estar en **ingles**.

**R22.** Toda tabla nueva DEBE llevar `created_at` y `updated_at`; cada registro de sesion
cerrada DEBE guardar tambien **el instante en que su token caduca**, para que la purga de la
pregunta abierta 1 sea posible mas adelante sin otra migracion. NINGUNA operacion del modulo
DEBE poder **deshacer** una revocacion ya registrada.

**R23.** Toda tabla nueva DEBE tener RLS **activada y forzada** (`ENABLE` + `FORCE ROW LEVEL
SECURITY`); eso NO DEBE contarse como la autorizacion de R10, que vive en el service.

**R24.** La migracion DEBE entregarse con su `migration.sql` (UP) **y** su `down.sql` (DOWN), y
revertirla DEBE dejar el esquema exactamente como estaba antes de aplicarla.

**R25.** *(DIFERIDO A QC-53 por la decision cerrada correspondiente. No se implementa ni se
testea aqui: esta ficha no aporta ninguna pantalla que visitar. Se deja numerado para que la
numeracion no se mueva y para que QC-53 lo herede con su historia. **Es una deuda con
destinatario, no una exencion**: `CHECKPOINTS.md > Calidad de codigo` pide E2E para
autenticacion.)*

CUANDO se ejecute la suite E2E, DEBE existir al menos un recorrido en navegador real que entre
con credenciales correctas desde dos contextos de navegador distintos, cierre sesion en uno y
compruebe que el otro **sigue dentro**, use despues «cerrar todas mis sesiones» y compruebe que
**los dos** terminan en el login; ese recorrido DEBE borrar al terminar todas las filas que haya
creado.

**R26.** El sistema NO DEBE añadir ninguna dependencia nueva a `package.json`. SI aun asi
hiciera falta una, ENTONCES DEBE proponerse en `design.md` con los cuatro checks de
`docs/architecture.md > Dependencias de terceros` y quedar **pendiente de aprobacion humana**,
sin instalarse.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **¿Se purgan las filas de sesiones cerradas una vez pasada su caducidad natural?** Una sesión
   cerrada deja de poder autorizar nada en cuanto su token caduca (8 h, **QC-7 D10**), así que la
   fila que la recuerda es basura a partir de ese momento. No se decidió si se borra, ni con qué
   —una tarea programada, un borrado perezoso al leer, o nada—. **Posición por defecto: se pueden
   borrar, y no borrarlas no rompe nada**, solo hace crecer la tabla.
2. **¿Dónde vive el botón del administrador?** La decisión 9 le da al Administrador el poder de
   cerrar las sesiones de otro usuario, pero **este ERP no tiene pantalla de administración de
   usuarios ni ficha que la cree**. No se inventó ninguna: crear la ficha obligaría a inventar
   también dónde cuelga. Hasta que exista, esa capacidad queda **implementada y sin forma de
   invocarse desde la interfaz**.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | ¿Cómo se invalida un código de sesión ya emitido? | **Con dos mecanismos, no uno.** (a) Un **sello por usuario** —una fecha de «válido desde»— que invalida todo lo emitido antes: sirve para el cierre total. (b) Un **identificador de sesión** dentro del token más el **registro de las sesiones cerradas** una a una: sirve para el cierre individual. Las dos acciones son distintas y ninguno de los dos mecanismos cubre la otra |
| 2026-09-03 | ¿El sello obliga a cambiar el formato del token? | **No.** El token **ya lleva `iat`** (la fecha de emisión firmada, **QC-7**/**QC-8**), así que el sello se compara contra algo que ya viaja. Verificado en `lib/modules/identity/domain/session-claims.ts` al acotar |
| 2026-09-03 | ¿Y el identificador de sesión? | **Sí, ese cambia el formato del token**, que sube de versión otra vez. Las sesiones vivas se rompen. Se acepta con el mismo criterio con que ya se aceptó en **QC-9**: *«no existen sesiones vivas y si alguna vive la borramos desde el navegador»* |
| 2026-09-03 | ¿Cerrar sesión cierra un dispositivo o todos? | **Solo ese dispositivo.** Quien sale en el móvil sigue dentro en la oficina. Se apartó de la propuesta inicial —que era aceptar el cierre total por ser mucho más barato— porque el humano quiso separar la comodidad del usuario de la acción de seguridad |
| 2026-09-03 | ¿Y «cerrar todas mis sesiones»? | **Las cierra todas, incluida la actual**, así que quien la usa acaba en el login. Está en la ficha del board: poder cerrarlas «desde cualquiera de sus dispositivos» |
| 2026-09-03 | ¿El administrador puede cerrar una sesión suelta de otro? | **No: lo suyo es siempre total.** El administrador no elige dispositivo. Su acción es de seguridad —se fue un empleado, quedó una sesión abierta en un equipo compartido de planta—, no de comodidad |
| 2026-09-03 | ¿El usuario ve la lista de sus dispositivos abiertos? | **No, y no genera ficha.** Descartada a propósito: obliga a una lectura por petición —justo lo que **QC-28** quiere quitar— y no da nada que no dé el cierre total. Si algún día se quiere, se decide entonces |
| 2026-09-03 | ¿Un cambio de rol o una baja cortan las sesiones? | **Sí, al instante y todas.** **Cierra la deuda que QC-9 dejó anotada con nombre y apellido** en su decisión «¿un cambio de rol debe cortar las sesiones?» → *«sí, pero se implementa en QC-23»*, hoy sostenida por un test de caracterización del límite (**QC-9 R30**) |
| 2026-09-03 | Permisos | **El Administrador puede cerrar las sesiones de otro usuario; cualquiera puede cerrar las suyas.** Se valida **en el service**, no en el middleware (`docs/architecture.md > Acceso a datos y autorizacion`), y lleva su test (`CHECKPOINTS.md > Permisos`) |
| 2026-09-03 | ¿Qué pasa si no se puede comprobar si una sesión fue cerrada? | **Se corta: la sesión se trata como inválida y la persona vuelve al login.** Una revocación que se puede saltar provocando un fallo no es una revocación. **Es lo contrario de lo que exige QC-28 para su caché** —que falla abierta y cae a la base—, y por eso el estado de revocación **no puede vivir solo en la memoria rápida** |
| 2026-09-03 | ¿Dónde se aplica la comprobación? | **Donde ya se resuelve el usuario contra la base en cada petición** (**QC-8 D2**: *«el usuario se resuelve contra la base en cada petición»*). El middleware **no** gana una lectura: **QC-9** ya decidió que no es la frontera de seguridad y que el rol firmado solo evita enseñar una pantalla inútil |
| 2026-09-03 | ¿Cambia el «cerrar sesión» que ya existe? | **Sí en el efecto, no en la firma.** `logoutAction()` sigue **sin parámetros y sin valor de retorno**, congelada por **QC-11** y respetada por **QC-8** |
| 2026-09-03 | Caducidad de la sesión | **Sin cambios: 8 h absolutas, sin renovación deslizante y sin «recordarme».** Heredado de **QC-7 D10**. Esta ficha acorta la vida de una sesión por decisión, no por tiempo |
| 2026-09-03 | ¿Cuántas implementaciones del HMAC quedan? | **Una sola en todo el repositorio.** Heredado de **QC-8 R5** y **QC-9**, que ampliaron las guardias para que un `createHmac` propio en la raíz no pasara el gate en verde |
| 2026-09-03 | Módulo propietario y capas | **`identity`.** La lógica de qué sesión es válida vive en `domain/`; el almacén es un **adaptador driven** detrás de un puerto, y el cableado solo en `lib/composition/index.ts`. Heredado de **QC-15** y **QC-8** |
| 2026-09-03 | Borrado y marcas de tiempo | **Borrado lógico** donde aplique, con `created_at` / `updated_at` / `deleted_at`. Heredado de **QC-4** y `docs/architecture.md > Dominio` n.º 3 |
| 2026-09-03 | Idioma de los identificadores de la DB | **Inglés** (tablas, columnas, índices, restricciones). Heredado de **QC-4** |
| 2026-09-03 | RLS | **Activada y forzada** (`FORCE ROW LEVEL SECURITY`). Heredado de **QC-4 R19**. No sustituye a la autorización en el service |
| 2026-09-03 | Migración | `migration.sql` (UP) más `down.sql` (DOWN) obligatorio, y revertirla deja el esquema exactamente como estaba. Heredado de **QC-4 R20** |
| 2026-09-03 | E2E | **Diferido con motivo a QC-53**, que es quien trae el botón y el recorrido navegable. Aquí no hay pantalla que visitar. Mismo criterio con el que **QC-8** difirió su prueba en navegador a QC-9. **Ojo**: `CHECKPOINTS.md` pide E2E para autenticación, así que el diferimiento **es una deuda con destinatario**, no una exención |
| 2026-09-03 | Librería nueva | **Ninguna.** Es esquema, migración y dominio. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
