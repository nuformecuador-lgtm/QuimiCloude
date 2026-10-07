# QC-66 — crud-de-usuarios · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** `QC-65` ·
> **Rama:** `feature/QC-66-crud-de-usuarios`
>
> **Alcance.** Los **seis** casos de uso que administran usuarios dentro del módulo `identity`:
> crear, consultar la ficha, listar, editar, borrar lógicamente y mover el estado de cuenta entre
> los cuatro valores que persiste QC-65. Todo acotado a la empresa de la sesión y autorizado por
> **dos permisos nuevos** —`usuarios.consultar` y `usuarios.modificar`— que llevan el catálogo
> cerrado de once a trece, con su migración y su seed. La contraseña la **genera el sistema** y
> nadie la ve: **esta ficha crea cuentas, no da acceso.**
>
> **Lo que NO entra.** La pantalla → **QC-67**. Que el estado mande en el login, y limpiar el
> contador de intentos al salir de `blocked` → **QC-78**. La contraseña opcional en el alta y el
> enlace para establecerla → **QC-79**, bloqueada por esta. Cambiar mi propia contraseña →
> **QC-36**. Restablecer la de otra persona → **QC-89**, creada al acotar esta ficha y bloqueada
> por QC-79. Invalidar sesiones abiertas con un sello por usuario → **QC-23**. Consultar mis
> propios datos → **no existe ficha y no se crea aquí**: el actor no se ve a sí mismo (decisión
> 12), así que «mis datos» tendrá que ser una consulta propia el día que alguien la pida.
>
> Sembrado por `/afinar-feature` el 2026-09-10. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`identity`** —sus seis casos
> de uso nuevos, sus puertos, sus adaptadores—, el catálogo de permisos de
> `lib/modules/identity/domain/permissions.ts`, la **migración de datos** del catálogo y el seed de
> acceso inicial. El modelo `User` **ya existe y no se re-especifica**: lo aportaron la feature 4
> (`specs/4-modelo-usuarios-y-roles/`), QC-47 (empresa y los tres índices únicos por empresa) y
> QC-65 (las tres columnas de estado de cuenta). Esta ficha **no añade ninguna columna**.
>
> Los **seis casos de uso** a los que se refieren los requisitos de autorización son: **crear**,
> **consultar la ficha**, **listar**, **editar**, **borrar** (lógicamente) y **mover el estado de
> cuenta**.
>
> Cómo leer los requisitos que dicen «no»: **R38–R48 son de ALCANCE y son requisitos de pleno
> derecho**, no comentarios, igual que R18–R21 de QC-65. Aquí son críticos: esta ficha no toca el
> mecanismo de bloqueo de QC-19/QC-78, no toca los tres índices únicos de QC-47, no crea pantalla
> (QC-67) y no devuelve la contraseña por ninguna vía.
>
> El mapa `R<n> -> test` lo escribe el implementer en `progress/impl_QC-66-crud-de-usuarios.md`
> (`CHECKPOINTS.md > Trazabilidad`).

### Autorización y actor

**R1.** El sistema DEBE exigir un permiso como **primera línea** de cada uno de los seis casos de
uso —antes de validar la entrada y antes de tocar ningún puerto—: `usuarios.consultar` en
**consultar la ficha** y **listar**, y `usuarios.modificar` en **crear**, **editar**, **borrar** y
**mover el estado de cuenta**.

**R2.** SI el actor no trae **exactamente** el código exigido en su conjunto de permisos, ENTONCES
el caso de uso DEBE rechazar la operación con un error de autorización y NO DEBE realizar ninguna
lectura ni ninguna escritura por ningún puerto. Falla **cerrado**: actor ausente, actor sin
conjunto de permisos, conjunto vacío y conjunto que no es una lista se rechazan igual; la
pertenencia es **exacta**, sin normalización y sin coincidencia parcial (un conjunto con
`usuarios.` o con `usuarios.consultarlo` no concede nada).

**R3.** El sistema NO DEBE conceder `usuarios.consultar` por tener `usuarios.modificar`, ni al
revés: MIENTRAS el actor solo traiga `usuarios.modificar`, consultar la ficha y listar DEBEN
rechazarse igual que a quien no trae ninguno.

**R4.** La decisión de autorizar NO DEBE depender del **nombre del rol** del actor: ninguno de los
seis casos de uso lee, recibe ni compara el rol de quien pide, y ningún archivo nuevo de
`lib/modules/identity/**` incrusta el literal `'Administrador'` (la guarda de R22 lo toma de la
constante de R24).

**R5.** El sistema DEBE recibir el actor **como parámetro de entrada** de cada uno de los seis
casos de uso —su identificador, su **empresa** y su conjunto de permisos—, y el dominio NO DEBE
leer sesión, cookie ni cabecera por su cuenta.

**R6.** CUANDO un adaptador driving de esta feature ejecuta un caso de uso, DEBE obtener el actor de
la sesión del servidor ya cableada a través de `@/lib/composition` —el identificador y los permisos
de `identity.getSessionUser()`, la empresa del contexto de sesión—, y NO DEBE repetir la
comprobación de permiso ni ninguna otra regla de negocio; SI falta cualquiera de las dos caras de la
sesión, ENTONCES el actor DEBE ser ausente y el caso de uso rechazar por R2.

**R7.** El sistema DEBE conservar `ROW LEVEL SECURITY` habilitado **y forzado** sobre `users`,
`permissions` y `role_permissions` después de esta feature, y NO DEBE crear ninguna policy que
pretenda sustituir la comprobación de R1: una policy de RLS **no** cuenta como permiso
implementado.

### El catálogo de permisos

**R8.** El catálogo cerrado de permisos DEBE contener **exactamente trece** entradas: las once
anteriores sin ningún cambio, más `usuarios.consultar` y `usuarios.modificar`, cada una con su
módulo, su acción y su descripción no vacía; y DEBE seguir declarándose en **un solo lugar** del
dominio de `identity`.

**R9.** El seed de acceso inicial DEBE asignar al rol `Administrador` los dos códigos nuevos
**escritos uno a uno**, sin comodín y sin derivarlos del catálogo; y el rol `Operador` NO DEBE
recibir ninguno de los dos.

**R10.** CUANDO el seed de acceso inicial corre dos veces seguidas, el sistema DEBE crear las filas
y las asignaciones que falten en la primera y **ninguna** en la segunda, sin reescribir ni borrar
ninguna asignación preexistente.

**R11.** CUANDO se aplica la migración del catálogo de esta feature sobre una base que ya tiene las
once entradas y sus asignaciones, el sistema DEBE dejar **trece** entradas y las dos asignaciones
nuevas del rol `Administrador`, sin duplicar, reescribir ni borrar ninguna fila existente, y DEBE
poder aplicarse dos veces sin fallar.

**R12.** El sistema DEBE admitir `usuarios` como `<modulo>` de un código de permiso **aunque no
exista ninguna carpeta `lib/modules/usuarios`**, y DEBE dejar escrita esa **enmienda a QC-74 R1**
—con esas palabras, no disimulada— en el propio archivo del catálogo, junto a la de QC-38.

### Alta

**R13.** CUANDO un actor con `usuarios.modificar` da de alta un usuario con datos válidos, el
sistema DEBE persistirlo con **la empresa del actor**, el rol indicado, el estado de cuenta
`pending`, la **marca de cambio de credencial en verdadero** y el instante del cambio de estado; y
DEBE devolver su identificador.

**R14.** La empresa del usuario nuevo DEBE salir **del actor** y de ningún otro sitio: el esquema de
entrada del alta NO DEBE admitir ningún campo de empresa, y NO DEBE existir ninguna forma de crear
un usuario en una empresa distinta a la del actor.

**R15.** CUANDO se crea un usuario, el sistema DEBE fijarle una contraseña **generada al azar por
el propio sistema**, persistida **solo** como hash bcrypt, y esa contraseña DEBE cumplir la
política de credenciales de QC-19 **por construcción**: ninguna contraseña generada puede
incumplirla.

**R16.** La contraseña generada NO DEBE salir del sistema por **ninguna** vía: no se devuelve en el
resultado del alta ni en ninguna otra respuesta, no aparece en ningún mensaje de error, no se
escribe en ningún registro ni en ninguna traza, y no se muestra a nadie en ningún instante.

**R17.** SI el correo, el nombre de usuario o la pareja tipo+número de documento que llegan ya están
en uso por un usuario **vivo de la misma empresa**, ENTONCES el sistema DEBE rechazar el alta con un
error de duplicado y NO DEBE crear ninguna fila; la garantía DEBE venir de los **índices únicos ya
existentes** de la base, de modo que dos altas simultáneas acaben con una sola fila creada, y NO DEBE
implementarse con una consulta previa de existencia.

**R18.** El sistema DEBE validar con un esquema toda entrada externa de los seis casos de uso en el
borde —nombres, apellidos, fecha de nacimiento, correo, teléfono, tipo y número de documento,
nombre de usuario y rol en el alta—, y NO DEBE dejar que ningún dato sin validar ni tipar cruce hacia
el dominio; SI el rol o el tipo de documento indicados no existen, ENTONCES DEBE rechazar la
operación sin escribir ninguna fila.

### Edición

**R19.** CUANDO se edita un usuario, el sistema DEBE reemplazar el conjunto completo de sus campos
editables —nombres, apellidos, fecha de nacimiento, correo, teléfono, tipo y número de documento,
nombre de usuario y **rol**—, y NO DEBE ofrecer edición parcial campo a campo.

**R20.** La edición NO DEBE cambiar **la empresa**, el estado de cuenta, el hash de la contraseña, la
marca de cambio de credencial ni ningún contador de acceso: el esquema de edición no admite ninguno
de esos campos, y una entrada que los traiga no los escribe.

### Las dos guardas del administrador

**R21.** SI el usuario objetivo de **mover el estado de cuenta**, de **cambiar el rol** o de
**borrar** es el propio actor, ENTONCES el sistema DEBE rechazar la operación y NO DEBE modificar
ninguna fila.

**R22.** MIENTRAS un usuario sea el **único** administrador vivo y en estado `active` de su empresa,
el sistema DEBE rechazar toda operación que lo dejase de ser —moverlo a `pending`, `inactive` o
`blocked`, cambiarle el rol a otro distinto del administrador, y borrarlo—, de modo que **ninguna
empresa pueda quedarse sin al menos un administrador en `active`**.

**R23.** La garantía de R22 DEBE resistir la concurrencia: CUANDO dos operaciones simultáneas
apuntan a dos administradores distintos, vivos y en `active`, de la misma empresa, el sistema DEBE
rechazar al menos una, y NO DEBE quedar la empresa sin ningún administrador en `active`. La
comprobación no puede ser una lectura seguida de una escritura sin protección contra la carrera.

**R24.** El sistema DEBE tomar el nombre del rol administrador de la **constante ya existente**
`ROLE_ADMINISTRADOR` de `lib/modules/identity/domain/roles.ts`, y NO DEBE declarar ninguna
constante nueva ni escribir el literal en ningún archivo de esta feature.

### Estado de cuenta

**R25.** CUANDO se mueve el estado de cuenta de un usuario, el sistema DEBE escribir el **nuevo
valor** —cualquiera de los cuatro del conjunto cerrado de QC-65, `blocked` incluido—, el **instante**
del cambio y el **identificador del actor** como autor del cambio; y NO DEBE dejar ese autor vacío,
porque aquí el cambio nunca lo hace el sistema.

**R26.** El sistema DEBE admitir cualquiera de los cuatro valores como destino desde cualquier otro:
no hay transiciones prohibidas en esta feature.

### Consulta

**R27.** CUANDO se consulta el listado de usuarios, el sistema DEBE devolver como máximo tantos
elementos como indique el tamaño de página **efectivo**, junto con el total de usuarios que cumplen
la consulta; SI no se indica tamaño de página, ENTONCES DEBE usar **10**, y SI se pide un tamaño
mayor que **25**, ENTONCES DEBE **acotarlo** a 25 y no ejecutar ninguna consulta sin límite superior.

**R28.** CUANDO la consulta trae un texto de búsqueda, el sistema DEBE devolver solo los usuarios de
su ámbito cuyo **nombre** (nombres o apellidos), **correo** o **nombre de usuario** coincidan con él;
y CUANDO no trae ninguno, DEBE devolver todo su ámbito.

**R29.** El filtro por **estado de cuenta** DEBE ser opcional: CUANDO se indica, el listado devuelve
solo los usuarios en esos estados; CUANDO no se indica, devuelve los cuatro.

**R30.** El sistema DEBE ordenar el listado por **apellidos y nombres ascendente** y DEBE desempatar
de forma **estable**, de modo que ningún usuario aparezca en dos páginas ni se omita de todas ellas
mientras el conjunto no cambie.

**R31.** Cada fila del listado DEBE traer el identificador, el **nombre** mostrable, el **nombre de
usuario**, el **correo**, el **rol** y el **estado de cuenta**; y NO DEBE traer el hash de la
contraseña ni ningún otro dato de credencial.

**R32.** El sistema DEBE ofrecer además la **ficha individual por identificador**, con los campos
que R19 declara editables, y NO DEBE incluir en ella el hash de la contraseña ni ningún dato de
credencial.

**R33.** Toda consulta —listado y ficha— DEBE estar acotada a la **empresa del actor**; SI el
identificador pedido pertenece a otra empresa, ENTONCES el sistema DEBE responder «no encontrado» y
NO DEBE revelar que existe. Lo mismo vale para editar, borrar y mover el estado.

**R34.** MIENTRAS un usuario esté borrado lógicamente, las **seis** operaciones DEBEN tratarlo como
inexistente: no sale en el listado, la ficha por identificador responde «no encontrado», y editarlo,
borrarlo otra vez o moverle el estado responden «no encontrado» sin modificar ninguna fila.

**R35.** El sistema DEBE **excluir al propio actor** de sus consultas: su fila no aparece en el
listado y la ficha de su propio identificador responde «no encontrado». Esta feature NO DEBE añadir
ninguna consulta de «mis datos».

**R36.** La firma del listado DEBE aceptar en una sola forma la página, el tamaño de página, la
búsqueda, el filtro y el orden, de modo que **declarar un campo consultable más no cambie la forma
de la consulta** y la pantalla de QC-67 no tenga que reabrirla.

### Borrado lógico

**R37.** CUANDO se borra un usuario, el sistema DEBE conservar su fila completa y marcar el instante
del borrado, y NO DEBE eliminarla físicamente.

**R38.** MIENTRAS un usuario esté borrado, su correo, su nombre de usuario y su pareja tipo+número de
documento DEBEN quedar **libres** para otro usuario de la misma empresa; y esta feature NO DEBE
modificar, recrear ni renombrar los **tres índices únicos** de QC-47 (`users_email_unique`,
`users_username_unique`, `users_document_unique`), ni añadir ninguna migración de índices.

**R39.** El sistema NO DEBE ofrecer ninguna operación de **recuperación** de un usuario borrado ni
ningún listado de borrados.

### Frontera, módulo y errores

**R40.** El sistema DEBE exponer los seis casos de uso como **Server Actions** en
`adapters/driving/` del módulo `identity`, con **`FormData`** en las cuatro mutaciones y argumentos
ya tipados en las dos consultas; y NO DEBE crear ningún route handler ni llamar por `fetch` a
ninguna ruta API propia.

**R41.** El sistema DEBE señalar cada fallo con una clase de error de dominio que lleve un **`code`
estable**, y el adaptador driving DEBE traducirlo a `{ status: 'error', code, message }` usando ese
`code` —**nunca** el texto del mensaje—; y NO DEBE existir ningún `catch` que descarte un error sin
manejarlo ni propagarlo con contexto.

**R42.** El sistema DEBE alojar los seis casos de uso en `lib/modules/identity/domain/`, con los
accesos a datos y la generación al azar detrás de **puertos** implementados en `adapters/driven/` y
cableados **solo** en `lib/composition/`; el dominio y los puertos NO DEBEN importar framework,
Prisma, `lib/shared/`, `lib/composition` ni las tripas de otro módulo; y el contrato
`lib/modules/identity/index.ts` NO DEBE reexportar nada que no sea de `./domain`, en particular
ningún adaptador driving.

### Alcance (lo que esta ficha NO hace)

**R43.** Esta feature NO DEBE añadir, quitar ni modificar ninguna **columna, tabla, índice,
restricción ni tipo** de la base: su única migración inserta **filas** del catálogo de permisos y sus
asignaciones. Todo identificador de base que nombre va en **inglés** y `snake_case`.

**R44.** La migración de esta feature DEBE llevar su **`down.sql`**, que deja el catálogo de permisos
y sus asignaciones exactamente como estaban antes de aplicarla —las once entradas, sin las dos
nuevas ni sus dos asignaciones— y no toca ninguna otra fila ni ningún objeto del esquema.

**R45.** Esta feature NO DEBE modificar el mecanismo de bloqueo por intentos fallidos: ninguna de
las seis operaciones lee ni escribe `failed_login_attempts`, `lock_level` ni `locked_until`, y
limpiar el contador al salir de `blocked` **es de QC-78**.

**R46.** Esta feature NO DEBE incluir ninguna pantalla, página, componente de interfaz ni ruta bajo
`app/` o `components/` —van a **QC-67**—, ni ningún adaptador de navegación o de menú; por lo tanto
no aporta ningún flujo navegable que un test E2E pueda visitar, y su verificación es **unitaria y de
integración**. El E2E se difiere **aquí y con motivo** a QC-67.

**R47.** Esta feature NO DEBE incorporar ninguna dependencia de terceros nueva: la generación al azar
sale del `crypto` de Node detrás de un puerto y el hash de la bcrypt ya instalada.

**R48.** CUANDO esta feature lleva el catálogo de once a trece, DEBE dejar en verde, **en la misma
tanda**, todos los tests ajenos que afirman el tamaño del catálogo o la lista de módulos válidos,
actualizados al número nuevo y **sin que ninguna expectativa se elimine ni se debilite**: cada uno
conserva su ancla contra el verde por vacuidad.

### El autor del estado con el que nace la cuenta (añadido el 2026-09-10)

**R49.** CUANDO se crea un usuario, el sistema DEBE dejar **vacía** la referencia al autor del último
cambio de estado de cuenta —el `pending` inicial no se atribuye a ninguna persona, que es el
significado del `NULL` en QC-65 R10—, y NO DEBE escribir ahí el identificador del actor que da el
alta. El autor **sí** se escribe al **mover** el estado después (R25). Añadido al aprobar el spec
(F1.4), cerrando **P4**.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Por permiso y no por rol: nacen los dos códigos, el catálogo pasa a trece, sembrados al `Administrador` uno a uno, `modificar` no implica `consultar` | R1, R2, R3, R4, R8, R9, R48 |
| 2 | `usuarios` vale como `<modulo>` aunque no sea carpeta; enmienda QC-74 R1, escrita con esas palabras | R8, R12 |
| 3 | Entra el borrado **lógico** con `deleted_at`; no se recupera | R37, R39, R34 |
| 4 | El borrado libera correo, nombre de usuario y documento dentro de la empresa; los tres índices de QC-47 **no se tocan** | R38, R43 |
| 5 | Con un usuario borrado no se puede hacer **nada**: las seis operaciones lo tratan como inexistente | R34 |
| 6 | La contraseña la genera el sistema al azar, se guarda con bcrypt, cumple QC-19 por construcción y no se devuelve a nadie | R15, R16 |
| 7 | Nadie puede entrar tras el alta: empresa, rol y estado `pending`, y ahí termina; no se muestra la generada | R13, R16 |
| 8 | El usuario nace con la marca de cambiar la contraseña al entrar, en verdadero | R13 |
| 9 | Las dos guardas del administrador, en el service y con su test; el rol sale de `ROLE_ADMINISTRADOR` | R21, R22, R23, R24 |
| 10 | Qué se edita —nueve campos, rol incluido—; la empresa **nunca**; la contraseña de otro tampoco | R19, R20, R14 |
| 11 | Listado paginado 10/25, búsqueda, filtro por estado, orden con desempate estable, proyección de la fila, ficha individual, firma abierta | R27, R28, R29, R30, R31, R32, R33, R36 |
| 12 | El actor no se ve a sí mismo, ni en el listado ni por identificador; «mis datos» no se crea aquí | R35 |
| 13 | Al mover el estado se escribe el valor, el instante y el actor; los cuatro valores valen; no se toca el contador de intentos | R25, R26, R45 |
| 14 | La empresa del usuario nuevo se hereda de la sesión del administrador que lo crea | R13, R14 |
| 15 | Autorización en el service, primera línea de los seis, fallando cerrado; el actor entra por parámetro; la sesión sale de `identity.getSessionUser()`; RLS no cuenta | R1, R2, R5, R6, R7 |
| 16 | Server Actions con `FormData` en las mutaciones, errores con `code` estable, identificadores en inglés `snake_case`, migración con su `down.sql` | R40, R41, R43, R44 |
| 17 | E2E diferida a QC-67 con motivo; ninguna dependencia nueva | R46, R47 |
| 18 | En el nacimiento de la cuenta no se guarda quién hizo el cambio: el autor queda vacío (el `NULL` de QC-65 R10); solo se escribe al mover el estado | R49, R25 |

Requisitos que **no** salen de una fila de la tabla, y de dónde salen: **R10** y **R11** del
precedente del seed idempotente de QC-74 (`seed-initial-access.ts`, «leer lo que falta y crear
exactamente eso») y de que `db:seed` sea un script manual; **R17** de los tres índices únicos de
QC-47 y del criterio «la unicidad la garantiza el índice, nunca un `SELECT` previo» (QC-20 § 11.4,
QC-43 R17); **R18** de `docs/architecture.md > Principios` n.º 2 (borde tipado con zod); **R42** de
`docs/architecture.md > Modulos y arquitectura hexagonal` y `> Punto unico de composicion`; **R46**
del bloque «Lo que NO entra»; **R48** del ripple que QC-38 ya pagó al pasar de diez a once
(`progress/impl_QC-38-crud-de-unidades.md`, «el ripple del catálogo compartido, atendido en la MISMA
tanda»).

## Preguntas abiertas

**P1 — Nadie le dice a la persona que tiene cuenta.** El alta no da acceso (decisiones 6 y 7), el
enlace para establecer la contraseña es **QC-79** y hasta que exista quedan usuarios creados que no
pueden entrar **sin que nada en el sistema lo diga**. Puede ser solo un orden de trabajo —hacer
QC-79 inmediatamente detrás de esta— o un requisito de esta ficha, y eso no se decide por supuesto
(regla 6 de `CLAUDE.md`).

**P2 — Qué pasa con una sesión ya abierta cuando cambia el rol o el nombre de usuario.** La
edición admite los dos (decisión 10). **QC-78** resuelve el caso del estado de cuenta y **QC-23**
el sello de invalidación, pero **ninguna de las dos habla del rol**: hoy una sesión viva podría
seguir operando con los permisos del rol anterior hasta que caduque. Tampoco está decidido si
cambiar el nombre de usuario afecta a la sesión que se abrió con el nombre viejo.

**P3 — ¿Puede el actor editar sus propios datos que no son el rol? Añadida por `spec_author` en
F1.2.** La decisión 9(a) nombra **tres** operaciones sobre uno mismo y las prohíbe: el estado, el
rol y el borrado. La decisión 12 esconde al actor de las **dos consultas**. Entre las dos queda un
hueco: **editar por identificador su propia fila** para cambiarse el teléfono o el correo no está
prohibido por la 9(a) ni mencionado por la 12. Las dos lecturas son defendibles —«si no se ve, no
se edita» o «editarse el teléfono no es encerrarse fuera»— y no se decide por supuesto (regla 6 de
`CLAUDE.md`). **R21 está escrito para no prejuzgarlo**: cubre exactamente las tres operaciones que
la decisión 9(a) nombra. Si el humano cierra «tampoco se edita a sí mismo», es un caso de test más
en el mismo sitio y R21 gana una cláusula; si cierra lo contrario, no cambia nada. Consecuencia de
no cerrarlo: QC-67 no sabrá si ofrecer o no ese camino, aunque hoy no pueda llegar a él porque la
ficha propia responde «no encontrado» (R35).

**P4 — CERRADA el 2026-09-10** por decisión humana al aprobar el spec (F1.4): en el nacimiento de la
cuenta **no se guarda quién hizo el cambio**, así que `account_status_changed_by` queda vacío — el
`NULL` de QC-65 R10. Pasó a ser la **fila 18** de `## Decisiones cerradas (no reabrir)` y la escribe
**R49**.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-10 | ¿Cómo se decide quién puede? | **Por permiso**, no por rol. Nacen `usuarios.consultar` y `usuarios.modificar`, y el catálogo cerrado pasa de once a **trece**, sembrados al rol `Administrador` **uno a uno** —**QC-74 decidió que `modificar` NO implica `consultar`**—. `usuarios.modificar` cubre crear, editar, borrar y mover el estado. **Descartado** comparar contra el literal «Administrador»: sería el séptimo sitio haciéndolo, justo después de que **QC-54** gastara una ficha entera en unificarlos. Precedente exacto: **QC-38**, que hizo esto mismo con `unidades.modificar` |
| 2026-09-10 | `usuarios` no es una carpeta de `lib/modules/`. ¿Vale igual como `<modulo>` del código? | **Sí, y esto enmienda QC-74 R1** («`<modulo>` siguiendo los nombres de módulo del repositorio»). Es el primer permiso cuyo módulo no es una carpeta: los usuarios viven dentro de `identity`, pero el código lo lee una persona y `identidad.consultar` no dice **qué** se consulta. Es la **segunda** enmienda al catálogo de QC-74, después de la de QC-38, y se dice con esas palabras en vez de disimularla |
| 2026-09-10 | ¿Entra borrar, si la tarjeta no lo enumeraba? | **Sí: borrado lógico**, con la columna `deleted_at` que ya dejó **QC-4**. **No se recupera**: si la persona vuelve, se crea de nuevo (precedente **QC-43 D6**). No se añade ninguna operación de recuperación |
| 2026-09-10 | ¿El borrado libera el correo, el nombre de usuario y el documento? | **Sí**, dentro de la empresa. Los tres índices únicos funcionales de **QC-47** solo miran filas vivas (`WHERE deleted_at IS NULL`) y **no se tocan**: no hay migración de índices en esta ficha. **Descartado** ocuparlos para siempre: obligaría a reescribir los tres índices por migración |
| 2026-09-10 | ¿Qué se puede hacer con un usuario ya borrado? | **Nada.** No sale en el listado, no responde por identificador, no se edita y no se le cambia el estado. Las seis operaciones tratan una fila con `deleted_at` como inexistente |
| 2026-09-10 | ¿Qué contraseña lleva el usuario que se crea? | **La genera el sistema al azar.** Se guarda ya transformada con bcrypt (**QC-5**), cumple la política de **QC-19** por construcción y **no se devuelve en ninguna respuesta ni se muestra a nadie** — ni al administrador, ni en un registro, ni un instante |
| 2026-09-10 | Entonces, ¿quién puede entrar después del alta? | **Nadie, por esta ficha. Consecuencia aceptada y escrita en el board.** El acceso lo da **QC-79** con su enlace. Esta ficha crea la cuenta, le pone empresa, rol y estado `pending`, y ahí termina. **Descartado** mostrar la contraseña generada una sola vez al administrador: deja una contraseña conocida por dos personas |
| 2026-09-10 | ¿El usuario nace con la marca de cambiar la contraseña al entrar? | **Sí, en verdadero.** Nadie conoce la generada, pero la marca cierra el caso de que la contraseña llegue por otro camino —el enlace de QC-79, o el restablecimiento de QC-89— sin que nadie se acuerde de ponerla. Precedente: el seed de acceso inicial, que crea al administrador con `mustChangeCredential: true` |
| 2026-09-10 | ¿Guardas para que un administrador no se encierre fuera? | **Dos, las dos en el service y con su test.** (a) No puede cambiar **su propio** estado de cuenta, **su propio** rol, ni **borrarse** a sí mismo. (b) **Ninguna** operación —estado, rol o borrado— puede dejar a la empresa sin **al menos un** administrador en estado `active`. La guarda usa `ROLE_ADMINISTRADOR` de `lib/modules/identity/domain/roles.ts`, que ya existe: **no** se escribe una séptima constante del nombre del rol |
| 2026-09-10 | ¿Qué se puede editar de un usuario ya creado? | Nombres, apellidos, fecha de nacimiento, correo, teléfono, tipo y número de documento, nombre de usuario y **rol**. **La empresa NUNCA**: se heredó de quien lo creó, y moverla no es editar, es otra cosa. **La contraseña de otra persona tampoco**: cambiar la mía es QC-36, restablecer la de otro es QC-89 |
| 2026-09-10 | ¿Cómo es la consulta? | **Listado paginado 10/25**, búsqueda por nombre, correo o nombre de usuario, **filtro opcional por estado de cuenta**, y orden por apellidos y nombres ascendente con **desempate estable**. Siempre acotado a la empresa de la sesión y **sin** los borrados. Cada fila trae nombre, usuario, correo, rol y estado; más la **ficha individual por identificador**. La firma nace abierta **a propósito**, para que **QC-67** no tenga que reabrirla: es exactamente la lección de QC-38 → QC-39, donde el listado cerrado costó una ficha entera |
| 2026-09-10 | ¿El actor se ve a sí mismo? | **No: ni en el listado ni pidiendo su ficha por identificador.** El listado excluye su propia fila y la consulta individual de su propio identificador no lo devuelve. Encaja con que tampoco pueda cambiarse el estado ni el rol (decisión 9). **Consecuencia:** «mis datos» necesita una consulta aparte que hoy no existe, y **no se crea aquí** |
| 2026-09-10 | ¿Qué se escribe al mover el estado de cuenta? | El nuevo valor más `account_status_changed_at` y `account_status_changed_by` **con el identificador del actor** (**QC-65** R8–R12; `NULL` significa «lo cambió el sistema», y aquí nunca es el caso). Se puede mover a cualquiera de los cuatro, `blocked` incluido. **Limpiar el contador de intentos fallidos al salir de `blocked` es de QC-78**, dueña de ese mecanismo: esta ficha **no** toca `failed_login_attempts`, `lock_level` ni `locked_until` |
| 2026-09-10 | ¿De dónde sale la empresa del usuario nuevo? | **Se hereda de la sesión del administrador que lo crea.** No se pregunta ni se elige en el alta. Heredado de la decisión humana del **2026-09-06**, tomada al acotar **QC-48** y comentada en este issue; es lo que mantiene coherente que correo, usuario y documento sean únicos **dentro de la empresa** (QC-47) |
| 2026-09-10 | ¿Dónde se autoriza y cómo llega el actor? | **En el service, como primera línea de cada uno de los seis casos de uso, y falla cerrado** —rechaza al actor ausente, al que trae el conjunto de permisos vacío y al que no trae ese código exacto, sin normalización ni coincidencia parcial—. El actor entra **por parámetro** (identificador, empresa y conjunto de permisos) y el dominio **no** lee sesión, cookie ni cabecera; la sesión sale de `identity.getSessionUser()` vía `@/lib/composition`. Heredado de **QC-38 / QC-43 / QC-74** y exigido por `docs/checkpoints-proyecto.md > Permisos`. Una policy de RLS **no** cuenta como implementado |
| 2026-09-10 | Forma de la frontera, errores y nombres | **Server Actions** para mutaciones y consultas, con `FormData` en las mutaciones; errores con `code` estable y sin `catch` vacíos; identificadores de base en **inglés** y `snake_case`; la migración del catálogo de permisos lleva su **`down.sql`** que revierte al esquema exacto anterior. Heredado de **QC-4** y **QC-43 D10/D12/D15** |
| 2026-09-10 | ¿E2E y dependencias nuevas? | **E2E diferida a QC-67, y se difiere aquí con motivo**: esta ficha no tiene pantalla, y el flujo de extremo a extremo se prueba cuando exista la pantalla que lo ejerce (precedente **QC-43 D8**, que la difirió a QC-44). **Ninguna dependencia nueva**: bcrypt ya está desde QC-5 y la generación al azar sale del `crypto` de Node |
| 2026-09-10 | ¿Quién figura como autor del estado `pending` con el que nace una cuenta? | **En el nacimiento de la cuenta no hace falta guardar quién hizo el cambio: `account_status_changed_by` queda vacío.** Es exactamente el significado que le dio **QC-65 R10** al `NULL` —«lo cambió el sistema, no una persona»—, el mismo con el que el seed crea al administrador inicial. El autor se guarda **solo al mover** el estado después (decisión 13): no se inventa un autor para el `pending` inicial ni se copia ahí el identificador del administrador que da el alta. **Cerrada al aprobar el spec (F1.4)**, y cierra la pregunta abierta **P4** que `spec_author` dejó escrita en F1.2. La escribe **R49** |
