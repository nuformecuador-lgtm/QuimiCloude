# QC-48 — tenant-en-la-sesion · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** `QC-47` · **Rama**
> `feature/QC-48-tenant-en-la-sesion`
>
> **Alcance.** Al autenticarse, el sistema resuelve la empresa de la persona leyendo su propia
> ficha (`users.company_id`, obligatoria desde QC-47) y la deja fijada en la sesión, viajando
> firmada dentro de la cookie igual que ya viaja el rol. El middleware exige que la sesión traiga
> una empresa bien formada, **sin tocar la base**. La comprobación de que esa empresa **sigue
> siendo suya y sigue viva** ocurre al resolver el usuario de la sesión, que ya lee esa misma fila
> en cada petición. Y se puede preguntar desde el servidor en qué empresa estamos, para que los
> servicios lo usen después.
>
> **Lo que NO entra.** Filtrar o separar los datos ya guardados por empresa → **QC-49**, **QC-50**,
> **QC-51**, **QC-59**, **QC-60**. El alta, la edición y la baja de empresas → sin ficha todavía.
> El alta de usuarios desde la aplicación, y con ella la regla de que un usuario nuevo hereda la
> empresa del administrador que lo crea → **QC-66 — crud-de-usuarios**, que ya cubre crear,
> consultar, editar y listar usuarios; la regla queda comentada allí. Cualquier pantalla que
> muestre la empresa. Y cómo elige empresa el login el día que haya dos (pregunta abierta 1).
>
> Sembrado por `/afinar-feature` el 2026-09-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo `identity` completo —dominio,
puertos y sus adaptadores— más el portero de rutas (`middleware.ts` y su adaptador driving) y el
punto de composición. No hay tabla, columna ni migración nueva: **QC-47 ya dejó
`users.company_id` obligatoria y `companies.deleted_at`**, y esta ficha solo los lee (R21).

**Tres avisos de lectura.** (a) «La empresa está **viva**» significa exactamente lo que fijó QC-47:
`companies.deleted_at IS NULL`. (b) R11, R20, R21, R22, R25 y R26 son de **no-regresión y de
límite**: dicen que algo NO cambia o NO entra. Están escritos como requisitos, y no como
comentarios, porque un enunciado que nadie testea es un enunciado que se rompe. (c) «sin sesión» es
el mismo resultado que ya devuelve `resolveSessionUser` cuando el usuario se da de baja a mitad de
sesión (QC-8 R11): no es un estado nuevo.

### Emisión de la sesión: el login

**R1.** CUANDO el sistema autentica unas credenciales correctas, DEBE resolver la empresa de esa
persona **leyendo su propia ficha de usuario**, y NO DEBE pedirla en el formulario de login, NO
DEBE aceptarla desde la entrada de la petición y NO DEBE deducirla de ningún otro dato.

**R2.** CUANDO el sistema emite una sesión, el identificador de empresa que fija DEBE proceder de
la **misma consulta** que ya autentica al usuario, sin ninguna consulta adicional a la base.

**R3.** SI las credenciales son correctas pero la empresa de esa persona **no está viva**, ENTONCES
el sistema NO DEBE emitir sesión, NO DEBE escribir nada en la base (ni registrar un intento
fallido, ni reiniciar los contadores de bloqueo) y DEBE devolver **exactamente el mismo resultado
de rechazo genérico** que devuelve ante unas credenciales incorrectas.

**R4.** MIENTRAS atiende un intento de login, el sistema DEBE gastar **exactamente una**
verificación de hash también en el camino de la empresa no viva, de modo que ese caso no se
distinga por tiempo ni por respuesta de una contraseña incorrecta.

**R5.** SI el sistema no puede resolver una empresa para la persona que se autentica, ENTONCES NO
DEBE emitir sesión y NO DEBE suponer ninguna empresa por defecto.

### Lo que viaja firmado

**R6.** CUANDO el sistema emite una sesión, el contenido firmado DEBE incluir el **identificador**
de la empresa, y NO DEBE incluir ningún otro dato de ella —ni su nombre, ni su nombre normalizado,
ni sus marcas de tiempo, ni su estado de baja—.

**R7.** El sistema DEBE declarar **una sola** versión vigente del formato del valor de la cookie, y
esa versión DEBE ser distinta de la que existía antes de esta feature.

**R8.** SI el valor crudo de la cookie no empieza por la versión vigente, ENTONCES el sistema DEBE
resolverlo como «sin sesión» **sin verificar su firma, sin interpretar su contenido y sin leer el
secreto de firma**; y una cookie del formato anterior con firma correcta y sin caducar DEBE
resolverse igualmente como «sin sesión».

**R9.** SI el contenido firmado no trae identificador de empresa, o lo trae vacío, de un tipo que no
es texto o sin forma de UUID, ENTONCES el sistema DEBE resolverlo como «sin sesión», sin consultar
la base y sin suponer ninguna empresa.

### El borde: el portero de rutas

**R10.** CUANDO llega una petición a una ruta privada cuya cookie de sesión no lleva una empresa
firmada y bien formada, el sistema DEBE tratarla como **anónima** y redirigir al login llevando la
ruta pedida —con su cadena de consulta— como destino de vuelta.

**R11.** MIENTRAS decide el acceso a una ruta, el sistema NO DEBE consultar la base de datos para
comprobar nada de la empresa —ni su existencia, ni que siga viva, ni que siga siendo de quien
pide—, y el cierre de imports del middleware NO DEBE arrastrar el cliente de base de datos.

**R12.** El sistema NO DEBE hacer depender la decisión de acceso a una ruta del **valor** del
identificador de empresa: dos sesiones idénticas salvo por su empresa DEBEN recibir la misma
decisión para la misma ruta.

### El lector de sesión: la comprobación real

**R13.** CUANDO el sistema resuelve el usuario de la sesión en curso, DEBE comparar el
identificador de empresa **firmado** con el de la ficha del usuario que ya lee en esa misma
petición, y NO DEBE hacer ninguna consulta adicional a la que ya hacía.

**R14.** SI el identificador de empresa firmado no coincide con el de la ficha del usuario,
ENTONCES el sistema DEBE resolver «sin sesión».

**R15.** SI la empresa de la ficha del usuario no está viva, ENTONCES el sistema DEBE resolver «sin
sesión».

**R16.** CUANDO la sesión se resuelve como «sin sesión» por R14 o por R15, el sistema DEBE hacerlo
por el **mismo camino de salida que ya existe** —la persona acaba en el login—, y NO DEBE
introducir pantalla, mensaje ni ruta nuevos para ese caso.

**R17.** El sistema DEBE aplicar los cortes de R14 y R15 **después** de los que ya existen —sin
contenido, contenido inválido, caducada, y usuario inexistente o dado de baja—, de modo que una
sesión ausente, mal formada o caducada siga sin costar ninguna consulta a la base.

### Preguntar la empresa desde el servidor

**R18.** El sistema DEBE ofrecer, desde el servidor y a través del contrato ya cableado del módulo,
una forma de obtener el identificador de la empresa de la sesión en curso.

**R19.** CUANDO no hay sesión válida, esa forma de preguntar DEBE devolver **ausencia de empresa**,
y DEBE hacerlo exactamente en los mismos casos —ni uno más, ni uno menos— en los que el sistema
resuelve «sin sesión» para el usuario.

**R20.** El identificador de empresa que el sistema expone DEBE ser el **leído de la base** en esa
petición, y no el que viajaba firmado, que solo se usa para la comparación de R13.

**R21.** El sistema DEBE resolver la empresa expuesta y el usuario de la sesión con **la misma
cadena de cortes**, de modo que no existan dos definiciones distintas de «hay sesión».

**R22.** Lo que el sistema expone de la sesión DEBE limitarse al identificador de la empresa, al
usuario y a su rol, y NO DEBE exponer permisos, capacidades ni resultados de autorización; que la
empresa viaje en la sesión NO DEBE conceder ni denegar por sí solo ninguna operación ni ningún
dato.

### Límites de alcance y no-regresión

**R23.** El sistema DEBE seguir resolviendo el **rol** exactamente como antes de esta feature
—mismo origen (la ficha del usuario), mismo nombre dentro del contenido firmado y misma decisión de
ruta basada en él—, y esta feature NO DEBE cambiar ninguna de las tres cosas.

**R24.** El sistema NO DEBE modificar el esquema de la base: ninguna tabla, columna, índice,
restricción ni migración nueva.

**R25.** El sistema NO DEBE filtrar por empresa ninguna consulta ni escritura de inventario,
recetas, unidades, proveedores o pedidos, y NO DEBE añadir ninguna pantalla, ruta ni Server Action
que muestre o elija la empresa.

**R26.** El sistema NO DEBE incluir en esta feature ningún alta de usuario ni ninguna regla que
asigne empresa al crear uno: esa regla —el usuario nuevo hereda la empresa de quien lo crea— se
implementa en **QC-66**.

**R27.** Los tests E2E que ya existen DEBEN seguir pasando, y el E2E de autenticación ya existente
DEBE **extenderse** —no duplicarse en un archivo nuevo— con el caso de una persona cuya empresa no
está viva: no entra, ve el mensaje genérico y no recibe cookie de sesión.

**R28.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | La empresa no se pregunta en el login: se lee de la ficha del usuario | R1, R2, R5 |
| 2 | El usuario nuevo hereda la empresa de quien lo crea — se decide aquí, se implementa en QC-66 | R26 |
| 3 | Se valida en el lector de sesión, NO en el middleware; el borde no toca la base | R10, R11, R12, R13, R17 |
| 4 | Si la comprobación falla, la sesión no vale y se sale por el camino que ya existe | R14, R15, R16 |
| 5 | Quien pertenece a una empresa dada de baja no entra: lo valida el login | R3, R4, R27 |
| 6 | De la empresa viaja firmado **solo** el identificador | R6, R9, R20 |
| 7 | El formato sube de versión **sin compatibilidad hacia atrás** | R7, R8 |
| 8 | Ir en la sesión no autoriza por sí solo: decide el service | R22, R25 |
| 9 | E2E extendiendo el de login existente, no uno nuevo | R27 |

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **Cómo elige empresa el login cuando exista la segunda empresa.** Heredada de **QC-47**
   (pregunta abierta 1) y **aplazada hoy a conciencia por decisión humana**, no resuelta. Desde
   QC-47 el correo, el nombre de usuario y la pareja tipo+número de documento son únicos **dentro
   de la empresa** y no en todo el sistema, así que dos empresas pueden tener cada una su `admin` y
   usuario + contraseña dejan de identificar a una sola persona. **Hoy no rompe nada**: solo existe
   una empresa y ninguna ficha permite crear otra. Las salidas conocidas son un campo de empresa en
   el login, un subdominio o una ruta por empresa, o volver a hacer el usuario único en todo el
   sistema. La decide la ficha que traiga el alta de empresas. **Consecuencia aceptada por
   escrito: el día que exista la segunda empresa, el login hay que tocarlo.**

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-06 | ¿Cómo sabe el login de qué empresa eres? | **No se pregunta en el login: se lee de la ficha del usuario ya autenticado** (`users.company_id`). No se inventa interfaz para un escenario que hoy no existe. El escenario de dos empresas queda **documentado** en la pregunta abierta 1, no resuelto |
| 2026-09-06 | ¿Y cuando un administrador cree usuarios? | **El usuario nuevo hereda la empresa del administrador que lo crea.** No se pregunta ni se elige. La regla se decide aquí y **se implementa en QC-66 (crud-de-usuarios)**, no en esta ficha |
| 2026-09-06 | ¿Dónde se valida que la empresa sigue existiendo y sigue siendo suya? | **En el lector de sesión, NO en el middleware.** El middleware solo exige que la empresa venga firmada y bien formada, sin consultar la base — igual que ya hace con el rol (**QC-9**, el borde decide sin base a propósito, y corre en runtime Edge). La comparación contra la base va en `resolveSessionUser`, que ya lee la fila del usuario en cada petición: `company_id` está en **esa misma fila** y comparar cuesta cero consultas nuevas |
| 2026-09-06 | ¿Qué pasa cuando esa comprobación falla? | **La sesión no vale y la persona sale a login**, por el mismo camino que ya existe cuando el usuario se da de baja a mitad de sesión (`resolveSessionUser` devuelve nulo, QC-8 R11). Un solo camino de salida, sin pantalla nueva. **Aceptado por escrito: quien esté a mitad de un formulario pierde lo escrito** |
| 2026-09-06 | ¿Puede entrar quien pertenece a una empresa dada de baja? | **No. El login valida que la empresa esté activa** antes de emitir sesión. Cierra por el lado del login la pregunta abierta 4 de **QC-47**, que la dejó para «la ficha que construya la baja»; el lado de la baja de empresas sigue sin ficha |
| 2026-09-06 | ¿Qué viaja firmado de la empresa? | **Solo el identificador (UUID), nada más.** Es el dato estable: el nombre puede cambiar y una foto vieja mentiría durante las 8 h que dura la sesión. Quien necesite mostrarlo lo lee de la base, como ya hace el rol para la zona privada (QC-8 R12) |
| 2026-09-06 | Formato de la cookie | **Sube a `v3` sin compatibilidad hacia atrás**: un valor `v2` se rechaza sin ni verificar su firma, y el corte va antes de leer el secreto. **Heredado de QC-9 R27**, que hizo exactamente esto al añadir el rol. **Consecuencia aceptada: al desplegar, todas las sesiones vivas caen** |
| 2026-09-06 | ¿Ir en la sesión autoriza por sí solo? | **No.** Decide el service, con su test. Heredado de `docs/architecture.md > Acceso a datos y autorizacion` y de `CHECKPOINTS.md`, y es lo que la `description` ya decía del rol |
| 2026-09-06 | ¿Hace falta E2E? | **Sí, extendiendo el E2E de login existente**, no creando uno nuevo. Es flujo de autenticación y `CHECKPOINTS.md` lo exige para flujos críticos |
