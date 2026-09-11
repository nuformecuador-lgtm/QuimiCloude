# QC-67 — pantalla-de-usuarios · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** `QC-66`, `QC-94` ·
> **Rama** `feature/QC-67-pantalla-de-usuarios`
>
> **Alcance.** La pantalla de administración de usuarios en `configuracion/usuarios`: listado
> sobre la tabla compartida de QC-55 (paginado 10/25, búsqueda por nombres, correo o nombre de
> usuario, filtro por estado de cuenta y orden), alta y edición en panel lateral, borrado con
> confirmación y la acción de mover el estado de cuenta entre sus cuatro valores. No construye
> backend: consume las seis Server Actions de QC-66 por su ruta exacta.
>
> **Lo que NO entra.** La consulta de roles que alimenta el selector → **QC-94** (la bloquea).
> Que salir de `blocked` limpie el contador de intentos fallidos → **QC-95** (no la bloquea).
> El enlace para establecer la contraseña → **QC-79**. Restablecer la contraseña de otro →
> **QC-89**. «Mis datos» y cambiar mi propia contraseña → **QC-36**; el actor no se ve a sí
> mismo (QC-66, decisión 12), así que esta pantalla no lo cubre.
>
> *Sembrado por `/afinar-feature` el 2026-09-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> **Glosario mínimo.** **Pantalla de usuarios**: la página que esta ficha crea, servida en la URL
> que declara su constante de ruta. **Layout privado**: el armazón de QC-11 (sidebar + cabecera +
> `<main>` + `<Toaster />`) que envuelve todo `app/(private)/`; se hereda montado. **Sección
> Configuración**: la sección de la navegación privada que QC-45 creó y a la que QC-39 ya añadió su
> segundo ítem; se hereda creada. **Tabla compartida**: `components/shared/data-table`, la de
> QC-55, consumida por su barrel público. **Panel lateral**: el `sheet` donde ocurren el alta y la
> edición. **Operaciones de escritura**: las cuatro Server Actions de mutación de QC-66
> (`createUserAction`, `updateUserAction`, `deleteUserAction`, `setUserAccountStatusAction`).
> **Operaciones de consulta**: las dos Server Actions de lectura de QC-66 (`listUsersAction`,
> `getUserAction`). **Consulta de roles**: la Server Action de QC-94 (`listRolesAction`). **Fila de
> usuario**: lo que la consulta de listado devuelve por cada usuario (`UserRow`). **Ficha de
> usuario**: lo que la consulta individual devuelve (`UserDetail`). **Estado de cuenta**: uno de
> los cuatro valores cerrados de QC-65. **Parámetros de lista**: página, tamaño de página, orden,
> filtros y término de búsqueda. **Actor**: la persona cuya sesión sirve la petición.

### Ubicación, ruta y navegación

**R1** — El sistema DEBE exponer la pantalla de usuarios en la URL que declara **una sola**
constante exportada, dentro del grupo de rutas privadas, de modo que se renderice **envuelta por el
layout privado existente** y sin declarar armazón propio: NO DEBE declarar `main`, barra lateral,
cabecera ni región de avisos propias. Todo consumidor —el ítem de navegación, la lista de prefijos
privados y cualquier destino de navegación de la propia pantalla— DEBE derivarse de esa misma
constante, y ningún archivo de producto DEBE incrustar la URL como literal.

**R2** — El sistema DEBE añadir a la sección Configuración **exactamente un** ítem nuevo, el de
usuarios, apuntando a la constante de R1. NO DEBE crear una segunda sección Configuración, NO DEBE
renombrarla, NO DEBE alterar ni reordenar los ítems de presentaciones y unidades que ya viven en
ella, y NO DEBE modificar el mecanismo de filtrado del menú por permisos ni el componente de
navegación.

**R3** — El ítem de usuarios DEBE declarar como permiso **`usuarios.consultar`**, el mismo que
exige la pantalla (R4). MIENTRAS la sesión no incluya ese permiso, el sistema NO DEBE emitir el
ítem en el HTML servido —ni etiqueta, ni destino, ni identificador de test—; MIENTRAS lo incluya,
DEBE emitirlo. La decisión DEBE tomarse **en el servidor**, a partir de los datos de sesión que el
layout privado ya obtiene, sin añadir ninguna consulta y sin ocultar nada con estilos.

### Protección y autorización

**R4** — La pantalla DEBE exigir **`usuarios.consultar`** antes de resolver sus parámetros de lista
y antes de renderizar o leer nada. SI la petición no tiene sesión válida, ENTONCES el sistema DEBE
redirigirla al login. SI la sesión es válida pero le falta ese permiso, ENTONCES el sistema DEBE
responder **404**, indistinguible de una ruta que no existe —sin nombrar el módulo, el permiso ni
la existencia de la pantalla—, renderizado **dentro del layout privado**, y NO DEBE redirigir a
otra pantalla ni presentar ningún dato de usuarios. MIENTRAS la sesión incluya el permiso, DEBE
permitir el acceso.

**R5** — La URL de la pantalla DEBE quedar cubierta por la lista declarada de prefijos de ruta
privada, de modo que una petición sin sesión válida sea rechazada en el borde antes de renderizarla.
Esa cobertura garantiza **sesión, no autorización**, y NO DEBE tomarse como el control que decide
quién puede ver la pantalla, que es R4. Ambas garantías DEBEN existir a la vez; ninguna sustituye a
la otra.

**R6** — MIENTRAS la sesión **no** incluya `usuarios.modificar`, el sistema NO DEBE ofrecer ninguna
acción de escritura —crear, editar, borrar ni cambiar el estado de cuenta—: ni disparador, ni botón
deshabilitado, ni panel, ni diálogo, ni formulario en el árbol servido. MIENTRAS la sesión lo
incluya, DEBE ofrecer las cuatro. Ocultarlas es comodidad de la interfaz y **NO es el control**: la
pantalla NO DEBE repetir ni sustituir la autorización, que la ejerce el caso de uso del módulo.

**R7** — SI cualquier operación de consulta o de escritura responde con un error de autorización,
ENTONCES el sistema DEBE presentar ese error y NO DEBE presentar ningún dato de usuarios como si la
operación hubiera prosperado.

**R8** — Los componentes de cliente de la pantalla DEBEN recibir **por props** los datos de sesión
—incluida la decisión de R6— y los datos de usuarios y roles que muestran; NO DEBEN importar el
punto de composición, ni el cliente de base de datos, ni obtener esos datos por su cuenta.

### Listado

**R9** — La lista DEBE presentarse con la **tabla compartida** consumida por su barrel público. El
sistema NO DEBE declarar una tabla propia, ni una barra de paginación propia, ni copiar el
esqueleto de lista de ninguna otra pantalla, ni modificar los archivos de
`components/shared/data-table/`.

**R10** — La tabla DEBE presentar exactamente **cinco columnas de datos** —nombre mostrable, nombre
de usuario, correo, rol y estado de cuenta— más la columna de acciones de fila. NO DEBE presentar
el identificador técnico, ningún dato de credencial, el identificador de empresa, el autor del
último cambio de estado, ni ningún campo que la fila de usuario no traiga.

**R11** — El sistema NO DEBE presentar al **actor** en el listado ni compensar su ausencia: NO DEBE
añadir su fila, NO DEBE anunciar que falta y NO DEBE ofrecer ninguna acción sobre sí mismo desde
esta pantalla.

**R12** — La pantalla DEBE ofrecer búsqueda por **nombres o apellidos, correo y nombre de usuario**.
CUANDO el usuario cambie el término, el sistema DEBE volver a pedir la lista al servidor **sobre el
conjunto entero** y NO DEBE filtrar en el cliente sobre la página visible.

**R13** — La pantalla DEBE ofrecer **un único filtro**, el de **estado de cuenta**, **multivalor**,
cuyas opciones DEBEN derivarse del conjunto cerrado de estados publicado por el módulo y nunca de
literales escritos a mano. NO DEBE ofrecer ningún otro filtro, y en particular NO DEBE ofrecer
filtro por rol. CUANDO el usuario cambie el filtro, el sistema DEBE volver a pedir la lista al
servidor.

**R14** — Las columnas ordenables DEBEN ser exactamente las que declara la lista blanca de consulta
del módulo, **leída de ella** y no reescrita; ninguna otra columna DEBE ser ordenable. CUANDO el
usuario cambie el orden, el sistema DEBE volver a pedir la lista al servidor con ese orden y NO DEBE
reordenar en el cliente.

**R15** — El sistema NO DEBE ampliar la lista blanca de consulta de usuarios: NO DEBE declarar
ningún campo consultable nuevo, ni cambiar el orden por defecto, ni el desempate estable, ni el
tope de tamaño de página, ni el conjunto devuelto.

**R16** — La pantalla DEBE ofrecer un selector de tamaño de página con exactamente dos opciones, 10
y 25, y DEBE usar 10 cuando no se indique ninguno. CUANDO existan más usuarios de los que caben en
una página, el sistema DEBE permitir avanzar y retroceder de página e indicar la página actual y el
total de páginas.

**R17** — SI los parámetros de lista recibidos son inválidos, están fuera de rango, exceden el tope
soportado o nombran un campo o un valor de filtro que el módulo no admite, ENTONCES el sistema DEBE
acotarlos a valores válidos y presentar la lista, y NO DEBE fallar ni mostrar un error.

**R18** — MIENTRAS la consulta no devuelva ningún usuario, el sistema DEBE presentar un estado
vacío identificable de **«la búsqueda no encontró nada»**. SI había término de búsqueda o filtro
activo, ENTONCES el estado vacío DEBE ofrecer limpiarlos; SI la página pedida era mayor que el
total, ENTONCES DEBE ofrecer volver a la primera página.

**R19** — MIENTRAS la lista se está obteniendo, el sistema DEBE presentar un indicador de carga
identificable en lugar de la tabla. SI la operación de consulta responde con error, ENTONCES el
sistema DEBE presentar un estado de error identificable con el mensaje devuelto y una acción para
reintentar, y NO DEBE presentar una tabla vacía como si no hubiera usuarios.

**R20** — La columna de estado de cuenta DEBE presentar **el estado almacenado tal cual lo devuelve
la consulta**. El sistema NO DEBE calcular ningún estado efectivo, NO DEBE leer ni pedir el
instante de fin de bloqueo, y NO DEBE derivar el estado de ningún contador de intentos fallidos.

**R21** — MIENTRAS el ancho disponible no alcance para todas las columnas, el sistema DEBE resolver
el desbordamiento con **scroll horizontal contenido en la propia tabla**, sin provocar scroll
horizontal del documento, y las acciones de fila DEBEN seguir siendo alcanzables.

### Alta y edición

**R22** — CUANDO el usuario active la acción de crear o la de editar un usuario, el sistema DEBE
abrir el formulario en un **panel lateral** sobre la lista, NO DEBE navegar a otra URL de pantalla
completa y NO DEBE usar un diálogo modal centrado. CUANDO el panel se cierre —por guardado o por
cancelación—, el sistema DEBE devolver al usuario a la lista **con los mismos parámetros de lista**
que tenía antes de abrirlo.

**R23** — El formulario DEBE capturar **exactamente los nueve campos** que el módulo declara
editables: nombres, apellidos, fecha de nacimiento, correo, teléfono, tipo de documento, número de
documento, nombre de usuario y rol. NO DEBE capturar ningún otro campo, y en particular NO DEBE
capturar empresa, contraseña, estado de cuenta, marca de cambio de credencial ni ningún contador de
acceso.

**R24** — Las opciones del selector de **rol** DEBEN provenir de la consulta de roles del módulo, y
el sistema NO DEBE derivarlas de ninguna otra fuente ni escribirlas a mano. SI esa consulta
responde con error, ENTONCES el sistema DEBE presentarlo de forma identificable y NO DEBE ofrecer
opciones inventadas ni un selector que aparente tener opciones.

**R25** — Las opciones del selector de **tipo de documento** DEBEN derivarse del conjunto cerrado
que publica el contrato del módulo, nunca de literales escritos a mano.

**R26** — CUANDO el usuario abra el formulario de edición de un usuario, el sistema DEBE precargarlo
con los **nueve** valores actuales de ese usuario obtenidos de la ficha individual, DEBE presentar
la fecha de nacimiento en el formato que el campo de fecha requiere, y DEBE enviar el **reemplazo
completo** de los nueve mediante la operación de edición, nunca un envío parcial. MIENTRAS la ficha
se está obteniendo, el panel DEBE presentar un indicador de carga; SI la ficha responde con error,
el panel DEBE presentarlo y NO DEBE presentar un formulario con campos en blanco.

**R27** — SI el guardado se rechaza, ENTONCES el sistema DEBE decidir qué pintar por el **código
estable** del error y nunca por su texto; DEBE presentar el error **en línea junto al campo**
cuando el código identifique uno —correo duplicado junto al correo, nombre de usuario duplicado
junto al nombre de usuario, documento duplicado junto al documento, rol inexistente junto al
selector de rol— y en una región de error del formulario cuando no lo identifique; y NO DEBE cerrar
el panel ni perder lo escrito.

**R28** — CUANDO el alta termine con éxito, el sistema DEBE cerrar el panel y notificar el éxito con
un aviso emergente **neutro**, y NO DEBE anunciar ninguna credencial, ningún enlace para establecer
la contraseña ni ninguna vía de acceso para la cuenta recién creada.

**R29** — CUANDO una operación de alta, edición, borrado o cambio de estado termine con éxito, el
sistema DEBE cerrar el panel o el diálogo abierto, notificar el éxito mediante un aviso emergente y
actualizar la lista para que refleje el cambio **sin que el usuario tenga que recargar la pantalla**
y sin perder los parámetros de lista vigentes. El sistema DEBE emitir sus avisos sobre la región que
el layout privado ya monta y NO DEBE montar una segunda: en la zona privada DEBE seguir habiendo
exactamente una.

### Borrado

**R30** — CUANDO el usuario active el borrado de un usuario, el sistema DEBE pedir confirmación en
un diálogo que **nombre a ese usuario** y advierta que la acción no se puede deshacer. MIENTRAS el
usuario no confirme, el sistema NO DEBE invocar la operación de borrado; CUANDO confirme, DEBE
invocarla y aplicar R29.

**R31** — SI la operación de borrado se rechaza —por cualquier código, incluidos «es tu propia
ficha» y «dejaría a la empresa sin administrador»—, ENTONCES el sistema DEBE presentar ese error
**dentro del diálogo de confirmación**, distinguiéndolo por su código y nunca por su texto, DEBE
mantener el diálogo abierto y NO DEBE retirar la fila de la lista.

### Estado de cuenta

**R32** — La fila DEBE ofrecer **una sola** acción para el estado de cuenta, con un selector de los
**cuatro** valores del conjunto cerrado del módulo y confirmación antes de escribir. El sistema NO
DEBE ofrecer verbos por estado, NO DEBE decidir qué transiciones son posibles y NO DEBE excluir
ningún valor del selector.

**R33** — SI el cambio de estado se rechaza, ENTONCES el sistema DEBE presentar el error por su
código dentro del propio diálogo, mantenerlo abierto y NO DEBE cambiar el estado pintado en la fila.

**R34** — El sistema DEBE ofrecer el paso de `blocked` a `active` **igual que cualquier otro**, y NO
DEBE reiniciar contadores de intentos fallidos, NO DEBE retirar bloqueos ni prometer que la cuenta
podrá entrar: el efecto de esa transición sobre el acceso lo decide el módulo, no esta pantalla.

### Datos que no salen

**R35** — El sistema NO DEBE hacer llegar al cliente ningún dato de credencial: NO DEBE declarar,
leer, presentar ni enviar hash de contraseña, contraseña, marca de cambio de credencial ni ninguno
de los contadores de acceso, y NO DEBE escribirlos en ninguna traza.

### Estructura, convenciones y plataforma

**R36** — Toda lectura y toda escritura DEBEN realizarse mediante las Server Actions ya publicadas
por el módulo, importadas **por su ruta exacta** y nunca desde el contrato público del módulo. El
sistema NO DEBE llamar a rutas API propias con `fetch` y NO DEBE construir ninguna consulta a base
de datos por su cuenta. El estado inicial de los formularios DEBE construirlo **esta pantalla**.

**R37** — El sistema NO DEBE modificar el módulo `identity` —ni sus casos de uso, ni sus puertos, ni
sus esquemas, ni sus errores, ni sus Server Actions—, NO DEBE añadir ninguna migración ni cambiar
`db/schema.prisma`, y NO DEBE añadir ninguna dependencia a `package.json`. Las primitivas de
interfaz que necesite DEBEN provenir de la librería de componentes por su CLI, sin escribir ni
editar a mano archivos de `components/ui/`.

**R38** — Los componentes propios de la pantalla DEBEN vivir en la carpeta `components/` de la ruta
y exponerse por su barrel `index.ts`; la página NO DEBE importarlos por ruta profunda ni dejarlos
sueltos junto a `page.tsx`.

**R39** — El sistema NO DEBE re-crear ni duplicar el layout privado, la barra lateral, la región de
avisos, las primitivas ya instaladas, la tabla compartida, la sección Configuración, el filtrado
del menú por permisos, el corte por permiso de página ni las utilidades de test: los hereda. Los
únicos archivos ajenos a la ruta que esta feature puede modificar son los que declaran la ruta y su
prefijo privado (R1, R5) y el que declara la navegación privada (R2, R3). Cualquier test heredado
de lista CERRADA cuyo punto de extensión por diseño sea darse de alta en él DEBE **tensarse**,
nunca relajarse.

**R40** — La pantalla DEBE ser utilizable en viewport angosto y en viewport ancho: NO DEBE usar
`100vh` como alto de pantalla, NO DEBE depender de `:hover` como única vía para descubrir o activar
una acción, sus controles táctiles DEBEN medir al menos 44×44 px y sus campos de formulario DEBEN
tener un tamaño de fuente de al menos 16 px. NO DEBE declararse ninguna excepción de escritorio.

**R41** — Los tests de la pantalla DEBEN identificar controles, estados y destinos por rol ARIA,
`data-testid` o constantes exportadas, y NO DEBEN afirmar sobre literales de copy.

**R42** — El sistema DEBE quedar cubierto por una prueba de extremo a extremo que recorra login → la
pantalla → **alta de un usuario** → verlo en la lista con estado `pending`, y por otra que compruebe
que una sesión válida **sin `usuarios.consultar`** no llega a la pantalla: recibe 404 dentro del
layout privado y no ve la tabla (R4).

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-11 | ¿De dónde salen los roles del selector? | **De QC-94**, ficha backend nueva que devuelve identificador y nombre de los roles y se autoriza con `usuarios.consultar`. QC-66 exige un `roleId` UUID y el módulo solo exporta `SEED_ROLES` (nombres, sin id): hoy no hay de dónde sacarlos. Esta ficha **no construye backend propio** —lo dice su tarjeta— y por eso el trabajo va a su propia ficha, no aquí. **QC-67 queda bloqueada por QC-94** |
| 2026-09-11 | ¿Dónde vive la pantalla? | **`configuracion/usuarios`**, tercer ítem de la sección **Configuración** que ya existe junto a Presentaciones (QC-45) y Unidades (QC-39). La sección **no se crea de nuevo, no se renombra y no se reordena su primer ítem**. Descartada una sección «Administración» propia: nacería con un solo ítem, que es exactamente la deuda de los cinco ítems de navegación de QC-11 |
| 2026-09-11 | ¿Qué permiso corta la pantalla? | **Dos, y cada uno para lo suyo.** El ítem del menú y la página exigen **`usuarios.consultar`** (`requirePagePermission`); crear, editar, borrar y mover el estado **solo se ofrecen** si la sesión trae además **`usuarios.modificar`**. QC-74 decidió que `modificar` NO implica `consultar`, y QC-66 creó los dos: usarlos así es para lo que nacieron. Se aparta a propósito de **QC-45**, que cortó la pantalla entera con `.modificar` —allí no existía el par—. La autorización de verdad sigue **en el service** (QC-66 R1): la UI oculta, no autoriza |
| 2026-09-11 | ¿Cómo se cambia el estado de cuenta? | **Una sola acción de fila, «Cambiar estado», con selector de los cuatro valores y confirmación** antes de escribir. Es exactamente la firma de `setUserAccountStatusAction`: la pantalla no traduce estados a verbos ni decide qué transiciones ofrecer, porque eso sería regla de negocio escrita en la UI |
| 2026-09-11 | ¿Qué estado pinta el listado? | **El almacenado, tal cual lo devuelve QC-66.** La pantalla no calcula el estado efectivo ni lee `locked_until` —QC-66 R45 no lo devuelve, a propósito—. Queda un desfase conocido: una cuenta `blocked` con el plazo ya vencido se pinta `blocked` mientras el login la deja entrar. Es **la dirección segura** (muestra más bloqueado de lo que está) y queda anotado como deuda con nombre, no tapado con lógica en la UI |
| 2026-09-11 | Salir de `blocked`, ¿desbloquea de verdad? | **Sí, y lo arregla QC-95**: mover una cuenta de `blocked` a `active` retira el bloqueo y reinicia el contador de intentos fallidos. Lo que cambia es **R45 de QC-66** —`setUserAccountStatus` llama a `clearedLockState()` de QC-78—, no el código de esta pantalla. **QC-95 no bloquea a QC-67**: la acción se ofrece igual desde el primer día; hasta que esa ficha esté `done`, salir de `blocked` no surte efecto en el acceso |
| 2026-09-11 | ¿E2E? | **Sí**: login → la pantalla → crear un usuario → verlo en la lista con estado `pending`, más el **rechazo de quien no tiene el permiso** (404 dentro del layout privado, mecanismo de QC-75). Es el camino de **QC-45**, y **cierra la E2E que QC-66 difirió aquí con motivo** |
| 2026-09-11 | ¿Qué se dice tras el alta? | **Toast de éxito neutro**, «Usuario creado», como las otras seis pantallas. La cuenta nace `pending` y nadie puede entrar hasta QC-79, pero la pantalla no anuncia un enlace que todavía no existe |
| 2026-09-11 | ¿Qué trae cada fila y qué NO? | Las **seis claves de `UserRow`**: identificador, nombre mostrable, nombre de usuario, correo, rol y estado de cuenta. **Ningún dato de credencial** —el tipo lo impide—, ni `companyId`, ni `accountStatusChangedBy`. El actor **no aparece** en su propio listado (QC-66, decisión 12) |
| 2026-09-11 | Listado, búsqueda, filtro y orden | **Se consumen tal cual los dejó `USER_QUERYABLE`**: paginado 10/25, búsqueda por nombres o apellidos, correo y nombre de usuario, filtro **multivalor** por estado de cuenta y orden por apellidos y nombres. La firma nació abierta para que esta ficha **no tenga que reabrirla** (QC-66, decisión 11): no se añade ningún campo consultable |
| 2026-09-11 | Base heredada, sin re-crear | **Tabla compartida de QC-55**, panel lateral (`sheet`) para alta y edición, **toast** en éxito y error en línea junto al campo, diálogo de confirmación para borrar nombrando al usuario, `<Toaster />` ya montado por el layout privado, constante de ruta única en `lib/shared/routes.ts`, componentes en `<ruta>/components/` con barrel `index.ts`, shadcn/ui **por CLI**, datos de sesión **por props**, asserts sobre roles ARIA / `data-testid` / constantes exportadas y **nunca** sobre literales de copy, viewport angosto y ancho sin excepción de escritorio. Heredado de **QC-22 / QC-45 / QC-55** |
| 2026-09-11 | Mutaciones y errores | **Server Actions de QC-66, importadas por su ruta exacta** (`lib/modules/identity/adapters/driving/user-actions`), nunca por el barrel: un `'use server'` en el cierre transitivo del contrato lo haría inimportable desde un componente de cliente. El estado inicial `{ status: 'idle' }` **lo construye esta pantalla** (un archivo `'use server'` no puede exportar constantes). El error se reconoce **por su `code` estable**, nunca por el texto del mensaje. **Quien decide qué se revalida es esta ficha**: QC-66 no escribió ningún `revalidatePath` porque no había ruta que revalidar |
| 2026-09-11 | Protección de la ruta | **Dos controles, y ninguno sustituye al otro**: `PRIVATE_ROUTE_PREFIXES` cubre la ruta en el borde —garantiza **sesión**, y su guardia pone el gate en rojo si una pantalla de `app/(private)/` se queda sin prefijo— y `requirePagePermission('usuarios.consultar')` exige el **permiso** dentro. Ya no existe regla ruta→rol: QC-75 la borró |
| 2026-09-11 | ¿Librería nueva? | **Ninguna.** Todo lo que hace falta está aprobado y montado |
