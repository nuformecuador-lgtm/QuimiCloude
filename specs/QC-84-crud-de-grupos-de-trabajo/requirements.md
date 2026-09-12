# QC-84 — crud-de-grupos-de-trabajo · requirements.md

> **Zona** `backend` · **Complejidad** _la asigna el leader en F1.0_ · **depends_on** QC-83 ·
> **Rama** `feature/QC-84-crud-de-grupos-de-trabajo`
>
> **Alcance.** Los **casos de uso** de un grupo de trabajo sobre el modelo que ya dejó **QC-83**:
> crear uno con su nombre, listar los de la empresa, ver quiénes lo componen, cambiar su nombre,
> **meter** y **sacar** personas, y darlo de baja. Todo limitado a la empresa de quien pide. El
> nombre es único dentro de la empresa y el duplicado se rechaza diciéndolo. Vive en el módulo
> **`identity`**, donde ya vive el grupo.
>
> **Lo que NO entra.** El modelo y la migración → **QC-83** (hechos). La pantalla → **QC-85**.
> Asignar un pedido a un grupo → **QC-86** (hecho), que **consume** el grupo y no lo administra.
> Y **ninguna migración ni cambio de esquema**: si esta ficha necesita tocar `db/schema.prisma`,
> algo se entendió mal.
>
> *Sembrado por `/afinar-feature` el 2026-09-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`identity`**: los **casos de
> uso** nuevos de grupos de trabajo, sus puertos, sus adaptadores driven y driving, y su entrada en
> el catálogo único de errores de **QC-70**. El **modelo ya existe y no se re-especifica**:
> `WorkGroup`, `WorkGroupMember`, la columna `name_normalized`, el índice único **parcial**
> `work_groups_name_unique` y las dos FK **compuestas** con `company_id` los aportó **QC-83** y están
> mergeados (`db/schema.prisma`). Los dos permisos que autorizan —`usuarios.consultar` y
> `usuarios.modificar`— **ya existen** desde QC-66: esta ficha **no crea ninguno** y el catálogo
> cerrado sigue con **quince** entradas.
>
> **Las operaciones.** El Alcance enumera **siete** casos de uso: **crear** un grupo, **listar** los
> de la empresa, **ver sus miembros**, **renombrarlo**, **meter** a una persona, **sacar** a una
> persona y **darlo de baja**. La tabla de decisiones decía «las seis operaciones», heredando la
> redacción de QC-66 (que sí tenía seis): el número **se corrigió a siete al aprobar el spec**
> (F1.4), sin cambiar ninguna decisión. Donde un requisito dice «las siete operaciones» se refiere a
> esa enumeración del Alcance **completa, sin excepción**.
>
> **Segunda vuelta (2026-09-11, F1.4).** El humano cerró al aprobar la pregunta abierta **P2**: la
> consulta de miembros **sí se pagina**. Los requisitos que lo escriben son **R51–R54**, añadidos
> **al final y continuando la serie**: ningún requisito anterior se renumera ni se reescribe
> (precedente **QC-33** en su segunda vuelta). Es la **fila 18** de la tabla de decisiones.
>
> Cómo leer los requisitos que dicen «no»: **R46–R50 son de ALCANCE y son requisitos de pleno
> derecho**, no comentarios, igual que R38–R48 de QC-66 y R27 de QC-83. Aquí son críticos: esta ficha
> **no toca `db/schema.prisma` ni `db/migrations/`**, **no añade ningún permiso**, no crea pantalla y
> no administra asignaciones de pedidos.
>
> Dos avisos de lectura.
> (a) **R19, R20 y R21 son el filtro de lectura** que **QC-83 dec. 2** dejó explícitamente a esta
> ficha, escrito en los tres sentidos en que se puede romper (quién sale, la cuenta `pending` recién
> creada, la cuenta bloqueada que vuelve sola). No son el mismo requisito tres veces: R20 y R21 son
> los **dos precios escritos a propósito** por el humano, y un precio que nadie testea es un precio
> que se reporta como fallo.
> (b) **R30 y R31 son la pareja del duplicado de pertenencia**, y se escriben por separado porque el
> mensaje es distinto: cuando la persona **se ve** en la lista, basta decir que ya pertenece; cuando
> el filtro de R19 **la oculta**, el error tiene que decir además **por qué no se ve**.
>
> El mapa `R<n> -> test` lo escribe el implementer en `progress/impl_QC-84-crud-de-grupos-de-trabajo.md`
> (`CHECKPOINTS.md > Trazabilidad`); el mapa previsto está en `tasks.md > Trazabilidad`.

### Autorización y actor

**R1.** El sistema DEBE exigir un permiso como **primera línea** de cada una de las siete
operaciones —antes de validar la entrada y antes de tocar ningún puerto—: `usuarios.consultar` en
**listar los grupos** y **ver los miembros de un grupo**, y `usuarios.modificar` en **crear**,
**renombrar**, **meter una persona**, **sacar una persona** y **dar de baja**.

**R2.** SI el actor no trae **exactamente** el código exigido en su conjunto de permisos, ENTONCES
la operación DEBE rechazarse con un error de autorización y NO DEBE realizarse ninguna lectura ni
ninguna escritura por ningún puerto. Falla **cerrado**: actor ausente, actor sin conjunto de
permisos, conjunto vacío y conjunto que no es una lista se rechazan igual; la pertenencia es
**exacta**, sin normalización y sin coincidencia parcial (un conjunto con `usuarios.`,
`usuarios.consultarlo` o `asignaciones.modificar` no concede nada).

**R3.** El sistema NO DEBE conceder `usuarios.consultar` por tener `usuarios.modificar`, ni al
revés: MIENTRAS el actor solo traiga `usuarios.modificar`, listar los grupos y ver los miembros
DEBEN rechazarse igual que a quien no trae ninguno; y MIENTRAS solo traiga `usuarios.consultar`, las
cinco escrituras DEBEN rechazarse igual.

**R4.** La decisión de autorizar NO DEBE depender del **nombre del rol** del actor: ninguna de las
siete operaciones lee, recibe ni compara el rol de quien pide, y ningún archivo nuevo de esta ficha
incrusta el literal `'Administrador'` ni ningún otro nombre de rol.

**R5.** El sistema DEBE recibir el actor **como parámetro de entrada** de cada una de las siete
operaciones —su identificador, su **empresa** y su conjunto de permisos—, y el dominio NO DEBE leer
sesión, cookie ni cabecera por su cuenta.

**R6.** CUANDO un adaptador driving de esta feature ejecuta una operación, DEBE obtener el actor de
la sesión del servidor ya cableada a través de `@/lib/composition` —el identificador y los permisos
de `identity.getSessionUser()`, la empresa del contexto de sesión—, y NO DEBE repetir la
comprobación de permiso ni ninguna otra regla de negocio; SI falta cualquiera de las dos caras de la
sesión, ENTONCES el actor DEBE ser ausente y la operación rechazar por R2.

**R7.** El sistema DEBE conservar `ROW LEVEL SECURITY` habilitado **y forzado** sobre `work_groups`
y `work_group_members` después de esta feature, NO DEBE crear, modificar ni suprimir ninguna policy,
y NO DEBE apoyarse en ninguna para cumplir R1: una policy de RLS **no** cuenta como permiso
implementado (`docs/architecture.md > Acceso a datos y autorizacion`).

### Ámbito de empresa

**R8.** Las **siete** operaciones DEBEN estar acotadas a la **empresa del actor**; SI el
identificador de grupo pedido pertenece a otra empresa, ENTONCES el sistema DEBE responder «grupo no
encontrado», NO DEBE revelar que existe y NO DEBE modificar ninguna fila.

**R9.** MIENTRAS un grupo esté dado de baja, las **siete** operaciones DEBEN tratarlo como
inexistente: no sale en el listado, sus miembros no se pueden consultar, y renombrarlo, meterle o
sacarle una persona o volver a darlo de baja responden «grupo no encontrado» sin modificar ninguna
fila.

### Crear un grupo

**R10.** CUANDO un actor con `usuarios.modificar` crea un grupo con un nombre válido, el sistema
DEBE persistirlo con ese nombre, con su **nombre normalizado**, con la **empresa del actor** y con la
marca de baja **vacía**, y DEBE devolver su identificador.

**R11.** La empresa del grupo nuevo DEBE salir **del actor** y de ningún otro sitio: el esquema de
entrada NO DEBE admitir ningún campo de empresa, y NO DEBE existir ninguna forma de crear un grupo en
una empresa distinta a la del actor.

**R12.** SI el nombre que llega coincide, una vez normalizado, con el de otro grupo **vivo de la
misma empresa**, ENTONCES el sistema DEBE rechazar la operación con un error de **nombre duplicado**
que lleve un `code` **estable** —no un error genérico— y NO DEBE crear ni modificar ninguna fila; la
garantía DEBE venir del **índice único parcial ya existente** de la base (QC-83), de modo que dos
altas simultáneas del mismo nombre acaben con **una sola** fila creada, y NO DEBE implementarse con
una consulta previa de existencia.

**R13.** El sistema DEBE calcular el nombre normalizado con la **única definición** de «mismo nombre
de grupo» que publica el contrato público de `identity` (`normalizeWorkGroupName`, QC-83 R3), y NO
DEBE declarar ninguna segunda normalización ni comparar nombres por su forma original.

**R14.** El sistema DEBE validar con un esquema toda entrada externa de las siete operaciones en el
borde —el nombre del grupo y los identificadores de grupo y de persona—, y NO DEBE dejar que ningún
dato sin validar ni tipar cruce hacia el dominio; SI el nombre llega vacío o solo con espacios,
ENTONCES DEBE rechazar la operación sin escribir ninguna fila.

**R15.** El sistema DEBE aceptar que dos **empresas distintas** tengan cada una un grupo vivo con el
mismo nombre normalizado, y NO DEBE rechazar el segundo por colisión.

### Renombrar un grupo

**R16.** CUANDO se renombra un grupo, el sistema DEBE reemplazar su nombre **y** su nombre
normalizado, y NO DEBE cambiar su empresa, su marca de baja, su identificador ni ninguna de sus filas
de pertenencia.

**R17.** SI el nombre nuevo coincide, una vez normalizado, con el de **otro** grupo vivo de la misma
empresa, ENTONCES el sistema DEBE rechazarlo con el **mismo** error de nombre duplicado de R12,
garantizado por el mismo índice único parcial, y NO DEBE modificar ninguna fila.

**R18.** CUANDO se renombra un grupo, el sistema NO DEBE modificar ninguna asignación de pedido ya
persistida: ni su referencia al grupo, ni el **nombre congelado** que QC-86 guardó, ni ninguna otra
columna suya; de modo que un pedido asignado antes del cambio sigue diciendo cómo se llamaba el grupo
el día que se asignó.

### Ver quiénes componen un grupo

**R19.** CUANDO se consultan los miembros de un grupo, el sistema DEBE devolver **solo** las personas
que **no** están dadas de baja y cuyo **estado efectivo de cuenta** —el que resuelve la única
definición del módulo, teniendo en cuenta el plazo de bloqueo— es **`active`** en el instante de la
consulta; y de cada una DEBE traer su identificador y su **nombre mostrable**, y NO DEBE traer el
hash de la contraseña ni ningún otro dato de credencial.

**R20.** MIENTRAS una persona esté en estado `pending` —el estado con el que **nace** toda cuenta
creada por QC-66—, el sistema NO DEBE incluirla en los miembros de ninguno de sus grupos, aunque su
fila de pertenencia exista; y CUANDO su cuenta pase a `active`, DEBE volver a aparecer en **todos**
sus grupos **sin ninguna escritura adicional** sobre la pertenencia.

**R21.** MIENTRAS una cuenta esté bloqueada —por la política de intentos fallidos o por decisión
administrativa—, el sistema NO DEBE incluirla en los miembros de sus grupos; y CUANDO el plazo de
bloqueo venza, DEBE volver a incluirla **sin ninguna escritura**, ni sobre la pertenencia ni sobre la
persona.

**R22.** El sistema DEBE devolver los miembros en un orden **determinista y estable** —por apellidos
y nombres ascendente, desempatando por un criterio que no pueda repetirse—, de modo que dos consultas
sobre el mismo contenido devuelvan la misma secuencia.

**R23.** La consulta de miembros NO DEBE escribir nada: no crea, modifica ni elimina ninguna fila de
pertenencia, de grupo ni de persona. El filtro de R19 es de **lectura**.

### Listar los grupos de la empresa

**R24.** CUANDO se consulta el listado de grupos, el sistema DEBE devolver **solo los grupos vivos de
la empresa del actor**, como máximo tantos elementos como indique el tamaño de página **efectivo**,
junto con el total de grupos que cumplen la consulta; SI no se indica tamaño de página, ENTONCES DEBE
usar **10**, y SI se pide un tamaño mayor que **25**, ENTONCES DEBE **acotarlo** a 25 y no ejecutar
ninguna consulta sin límite superior.

**R25.** El sistema DEBE ordenar el listado por **nombre ascendente** y DEBE desempatar de forma
**estable**, de modo que ningún grupo aparezca en dos páginas ni se omita de todas ellas mientras el
conjunto no cambie.

**R26.** Cada fila del listado DEBE traer el **identificador** y el **nombre** del grupo, y NO DEBE
traer su nombre normalizado, su empresa ni su marca de baja.

**R27.** La firma del listado DEBE aceptar en una sola forma la página, el tamaño de página, la
búsqueda, el filtro y el orden —el contrato de listado que ya usa el módulo—, de modo que **declarar
un campo consultable más no cambie la forma de la consulta** y la pantalla de **QC-85** no tenga que
reabrirla.

### Meter a una persona en un grupo

**R28.** CUANDO un actor con `usuarios.modificar` mete en un grupo vivo de su empresa a una persona
**viva de esa misma empresa**, el sistema DEBE crear su fila de pertenencia **sea cual sea el estado
de cuenta de esa persona** —`pending`, `active`, `inactive` o `blocked`—, y la pertenencia NO DEBE
depender de ese estado.

**R29.** SI la persona indicada no existe, está **dada de baja** o es de **otra empresa**, ENTONCES el
sistema DEBE responder «persona no encontrada» —tratándola como inexistente— y NO DEBE crear ninguna
fila ni revelar que existe.

**R30.** SI la persona indicada **ya pertenece** al grupo y **aparece** en la lista de miembros de
R19, ENTONCES el sistema DEBE rechazar la operación con un error de **pertenencia duplicada** de
`code` estable y NO DEBE crear ni modificar ninguna fila.

**R31.** SI la persona indicada **ya pertenece** al grupo pero el filtro de R19 **la oculta**,
ENTONCES el sistema DEBE rechazar la operación con un error cuyo mensaje diga **que ya pertenece Y
por qué no se ve**, distinguiendo con un `code` propio cada motivo de ocultación —cuenta `pending`,
cuenta `inactive` y cuenta bloqueada—, y NO DEBE crear ni modificar ninguna fila; el sistema NO DEBE
responder a este caso con el mismo `code` de R30.

**R32.** La garantía de que una persona no quede **dos veces** en el mismo grupo DEBE venir de la
**clave primaria ya existente** de la pertenencia (QC-83 R16), de modo que dos intentos simultáneos
acaben con una sola fila; la lectura previa de R30 y R31 sirve **solo para elegir el mensaje** y NO
DEBE ser la garantía.

**R33.** Meter y sacar personas DEBEN ser **operaciones propias, de a una**, independientes de
renombrar el grupo: ninguna operación de esta feature DEBE aceptar el **conjunto completo** de
miembros de un grupo ni reemplazarlo, de modo que dos encargados trabajando a la vez no se pisen y el
error diga **a quién** se refiere.

### Sacar a una persona de un grupo

**R34.** CUANDO se saca a una persona de un grupo, el sistema DEBE eliminar **físicamente** su fila de
pertenencia, y NO DEBE marcarla, desactivarla ni conservarla de ninguna otra forma.

**R35.** Sacar a una persona de un grupo NO DEBE borrar, desactivar ni modificar a esa persona, NO
DEBE eliminar sus pertenencias a **otros** grupos y NO DEBE dar de baja ni modificar el grupo, aunque
fuera su último miembro.

**R36.** SI la persona indicada **no pertenece** al grupo, ENTONCES el sistema DEBE rechazar la
operación con un `code` estable y NO DEBE modificar ninguna fila.

### Dar de baja un grupo

**R37.** CUANDO se da de baja un grupo, el sistema DEBE conservar su fila completa y marcar el
instante de la baja, y NO DEBE eliminarla físicamente.

**R38.** CUANDO se da de baja un grupo, el sistema DEBE conservar **intactas todas** sus filas de
pertenencia, y NO DEBE eliminar, marcar ni modificar ninguna: no se pierde quién estaba dentro.

**R39.** CUANDO se da de baja un grupo que ya fue aplicado a uno o varios pedidos, el sistema NO DEBE
modificar ni eliminar **ninguna** asignación de esos pedidos —ni las personas congeladas, ni la
referencia al grupo, ni el nombre congelado—, de modo que **ningún pedido queda sin responsables**.

**R40.** El sistema NO DEBE ofrecer ninguna operación de **restauración** de un grupo dado de baja ni
ningún listado de grupos dados de baja.

**R41.** MIENTRAS un grupo esté dado de baja, su nombre normalizado DEBE quedar **libre** dentro de su
empresa: crear un grupo nuevo con ese mismo nombre DEBE tener éxito y NO DEBE rechazarse por
duplicado.

### Frontera, módulo y errores

**R42.** El sistema DEBE exponer las siete operaciones como **Server Actions** en `adapters/driving/`
del módulo `identity`, con **`FormData`** en las cinco mutaciones y argumentos ya tipados en las dos
consultas; y NO DEBE crear ningún route handler ni llamar por `fetch` a ninguna ruta API propia.

**R43.** El sistema DEBE señalar cada fallo con una clase de error de dominio cuyo `code` sea
**estable** y pertenezca al **catálogo único de errores** (QC-70) —con su clave y su texto, y sin que
dos códigos compartan texto—, y el adaptador driving DEBE traducirlo a `{ status, code, message }`
usando ese `code` y **nunca** el texto del mensaje; NO DEBE existir ningún `catch` que descarte un
error sin manejarlo ni propagarlo con contexto; y CUANDO el catálogo crece con los códigos de esta
feature, los tests ajenos que afirman su tamaño DEBEN quedar en verde **en la misma tanda**,
actualizados al número nuevo y **sin que ninguna expectativa se elimine ni se debilite**.

**R44.** El sistema DEBE alojar las siete operaciones en `lib/modules/identity/domain/`, con los
accesos a datos detrás de **puertos** implementados en `adapters/driven/` y cableados **solo** en
`lib/composition/`; el dominio y los puertos NO DEBEN importar framework, Prisma, `lib/shared/`,
`lib/composition` ni las tripas de otro módulo; y `lib/modules/identity/index.ts` NO DEBE reexportar
nada que no sea de `./domain`, en particular ninguna Server Action de esta feature.

**R45.** Todo identificador de base de datos que esta feature nombre DEBE ir en **inglés** y
`snake_case`, y la feature NO DEBE introducir ninguno nuevo: consume los que creó QC-83.

### Alcance (lo que esta ficha NO hace)

**R46.** Esta feature NO DEBE modificar `db/schema.prisma` ni añadir, editar ni revertir ninguna
migración: no crea ni cambia ninguna tabla, columna, índice, clave foránea, restricción ni tipo, y no
inserta ni borra ninguna fila por migración. El modelo entero es de **QC-83** y está mergeado; el
diff de `db/**` de esta feature DEBE ser **vacío**.

**R47.** Esta feature NO DEBE añadir, quitar ni renombrar ningún permiso del catálogo cerrado:
reutiliza `usuarios.consultar` y `usuarios.modificar`, el catálogo DEBE seguir teniendo **quince**
entradas después de esta ficha, y los tests que afirman ese número **no se tocan**.

**R48.** Esta feature NO DEBE incluir ninguna pantalla, página, componente de interfaz ni ruta bajo
`app/` o `components/` —van a **QC-85**—; por lo tanto no aporta ningún flujo navegable que un test
E2E pueda visitar, su verificación es **unitaria y de integración**, el E2E se difiere **aquí y con
motivo** a QC-85, y los E2E existentes DEBEN seguir pasando **sin cambios en su guion**.

**R49.** Esta feature NO DEBE incorporar ninguna dependencia de terceros nueva.

**R50.** Esta feature NO DEBE administrar ni modificar la asignación de pedidos: ninguna de sus
operaciones escribe en las tablas de **QC-86**, ninguna deriva responsables de la pertenencia vigente,
y **a quién se puede asignar** según su estado de cuenta es de **QC-87** y no se decide aquí.

### La consulta de miembros se pagina (añadido el 2026-09-11 al aprobar el spec, F1.4)

> Cierra **P2**. Mismo patrón que el listado de grupos (R24–R27) y que el listado de usuarios de
> **QC-66 dec. 11**. **R19, R22 y R23 no cambian**: qué personas salen, en qué orden y que la lectura
> no escribe nada siguen dichos donde estaban; lo que R51–R54 añaden es **cuántas** salen por página,
> **cuántas hay en total** y que **ninguna se pierde entre páginas**.

**R51.** CUANDO se consultan los miembros de un grupo, el sistema DEBE devolver como máximo tantos
elementos como indique el tamaño de página **efectivo**; SI no se indica tamaño de página, ENTONCES
DEBE usar **10**, y SI se pide un tamaño mayor que **25**, ENTONCES DEBE **acotarlo** a 25 y no
devolver ninguna página sin límite superior.

**R52.** El sistema DEBE devolver, junto con la página, el **total** de miembros del grupo, y ese
total DEBE contar **exactamente** las personas que pasan el filtro de R19: una persona `pending`,
`inactive` o bloqueada **no suma** al total, del mismo modo que no aparece en ninguna página.

**R53.** El sistema DEBE paginar los miembros con un **desempate estable**: MIENTRAS el conjunto de
miembros y sus estados de cuenta no cambien, ninguna persona DEBE aparecer en **dos páginas** ni
omitirse de **todas** ellas, ni siquiera cuando dos personas del mismo grupo compartan apellidos y
nombres.

**R54.** La consulta de miembros DEBE aceptar la página y el tamaño de página **en la misma forma**
que el listado de grupos, y DEBE devolver el resultado con la misma forma de página que él, de modo
que **QC-85** use una sola manera de paginar en las dos listas y declarar mañana un campo consultable
más no cambie la forma de la consulta.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Se reusan `usuarios.consultar` y `usuarios.modificar`; **no** nacen permisos y el catálogo se queda en **quince** | R1, R2, R3, R47 |
| 2 | Autorización **en el service**, primera línea, fallando cerrado; actor por parámetro; sesión vía `identity.getSessionUser()`; sin implicación entre los dos permisos; la RLS no cuenta | R1, R2, R3, R5, R6, R7, R4 |
| 3 | Los miembros son **solo las cuentas `active` y no dadas de baja**; los dos precios: `pending` no aparece y la bloqueada vuelve sola; la pertenencia **no se toca** | R19, R20, R21, R23 |
| 4 | Se puede meter a **cualquier persona viva de la empresa**, sea cual sea su estado; a una dada de baja **no** | R28, R29 |
| 5 | Meter a quien ya está pero el filtro oculta: se rechaza diciendo **que ya pertenece Y por qué no se ve** | R31, R30 |
| 6 | Meter y sacar son **operaciones propias, de a una**; descartado mandar el conjunto completo | R33, R28, R34 |
| 7 | Sacar borra **solo la fila de pertenencia, y de verdad**; no toca a la persona ni sus otros grupos | R34, R35 |
| 8 | La baja del grupo es **lógica**, conserva las pertenencias, **no se restaura** y libera el nombre | R37, R38, R40, R41 |
| 9 | Dar de baja un grupo **no** deja un pedido sin responsables, y esta ficha lo demuestra con test | R39 |
| 10 | Renombrar **no** cambia lo ya asignado: el nombre congelado de QC-86 no se toca | R18, R16 |
| 11 | No hay dos grupos con el mismo nombre en la empresa, medido sin mayúsculas ni acentos, contra el índice único parcial, y el duplicado se rechaza **diciéndolo** | R12, R13, R17, R15, R41 |
| 12 | Alguien de otra empresa **no ve nada**: las operaciones se acotan a la empresa de la sesión | R8, R9, R29 |
| 13 | Listado **paginado, con orden y desempate estable**, siguiendo el listado de usuarios | R24, R25, R26, R27, R22 |
| 14 | **Server Actions con `FormData`** en las mutaciones, errores con `code` estable, identificadores en inglés `snake_case` | R42, R43, R45 |
| 15 | **Ninguna migración**, y es un límite: ni `db/schema.prisma` ni `db/migrations/` se tocan | R46 |
| 16 | **Sin E2E aquí**, diferida a QC-85; los existentes siguen verdes | R48 |
| 17 | **Ninguna librería nueva** | R49 |
| 18 | La consulta de **miembros se pagina**, con orden y desempate estable y con el total, heredado de QC-66 dec. 11 | R51, R52, R53, R54, R22 |

Requisitos que **no** salen de una fila de la tabla, y de dónde salen: **R10** y **R11** del Alcance
(«crear uno con su nombre… todo limitado a la empresa de quien pide») y del precedente de QC-66 R13/R14
(la empresa se hereda de la sesión); **R14** de `docs/architecture.md > Principios` n.º 2 (borde tipado
con `zod`) y de QC-83 R2 (nombre obligatorio); **R32** de QC-83 R16 y del criterio «la unicidad la
garantiza la base, nunca un `SELECT` previo» (QC-20 § 11.4, QC-43 R17, QC-83 aviso (a)); **R36** del
caso simétrico de R30 —sacar a quien no está tiene que decirlo, no fallar en silencio—; **R44** de
`docs/architecture.md > Modulos y arquitectura hexagonal` y `> Punto unico de composicion`; **R50** del
bloque «Lo que NO entra» y de la pregunta abierta, que deja a **QC-87** decidir a quién se puede
asignar.

## Preguntas abiertas

**P1 (del humano, 2026-09-11).** Una, y **no bloquea**: al asignar un pedido, ¿QC-87 descarta a los
miembros cuya cuenta no está activa? Esta ficha decide qué se **muestra**; a quién se puede
**asignar** es de QC-87.

**P2 — CERRADA el 2026-09-11** por decisión humana al aprobar el spec (F1.4): la consulta de miembros
**sí se pagina**, con orden y desempate estable y con el total. Pasó a ser la **fila 18** de
`## Decisiones cerradas (no reabrir)` y la escriben **R51–R54**.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-11 | ¿Qué permiso corta las operaciones de grupos? | **Se reusan `usuarios.consultar` y `usuarios.modificar`. NO nacen permisos nuevos y el catálogo se queda en 15.** Un grupo es un conjunto de personas y vive en `identity`: quien administra usuarios administra sus grupos. **Precio escrito**: no se puede dar a alguien la gestión de turnos sin darle también el alta y la baja de usuarios. Si algún día hace falta separarlo, es una ficha con su migración |
| 2026-09-11 | ¿Dónde se comprueba el permiso? | **En el service, primera línea de cada operación, fallando cerrado**, con el actor por parámetro y la sesión desde `identity.getSessionUser()`. `consultar` para leer, `modificar` para escribir, **sin implicación entre ellos**. La RLS no cuenta como frontera. Heredado de **QC-66 dec. 15** y **QC-74** |
| 2026-09-11 | Al pedir los miembros de «Turno noche», ¿quién sale? | **Solo las cuentas con estado `active`** (y no dadas de baja). **Dos precios, escritos a propósito**: (a) una persona recién dada de alta nace **`pending`** (QC-66 dec. 7) y **no aparecerá en sus grupos** hasta que entre y cambie la contraseña; (b) una cuenta bloqueada por intentos fallidos **desaparece del grupo y vuelve sola** al desbloquearse. La pertenencia **no se toca** en ninguno de los dos casos: esto es un filtro de **lectura**, que es exactamente el encargo que **QC-83 dec. 2** dejó a esta ficha |
| 2026-09-11 | ¿A quién se puede meter en un grupo? | **A cualquier persona viva de la empresa, sea cual sea su estado de cuenta.** La pertenencia no depende del estado (**QC-83 dec. 2**). A una persona **dada de baja no se la puede meter**: las operaciones la tratan como inexistente (**QC-66 dec. 5**) |
| 2026-09-11 | Si alguien intenta meter a una persona que ya está dentro pero el filtro oculta, ¿qué pasa? | **Se rechaza con un error que dice que ya pertenece Y por qué no se ve** («ya pertenece a Turno noche; su cuenta está bloqueada»). Sin eso, el operador lee «ya existe» sobre una lista donde esa persona no aparece y no tiene forma de entenderlo. **Es el caso que esta ficha tiene que cubrir con test** |
| 2026-09-11 | ¿Meter y sacar personas es parte de editar el grupo? | **No: son operaciones propias, de a una**, independientes de cambiar el nombre. Dos encargados pueden trabajar a la vez sin pisarse y el error dice **quién** falló. Se descartó mandar el conjunto completo al editar: si dos personas editan a la vez, la segunda **borra en silencio** lo que hizo la primera |
| 2026-09-11 | Al sacar a alguien de un grupo, ¿qué se borra? | **Solo la fila de pertenencia, y de verdad** (excepción al borrado lógico, **QC-83 dec. 4**). **No borra ni desactiva a la persona**: sigue siendo usuario y sigue en sus otros grupos |
| 2026-09-11 | Se da de baja un grupo con 5 personas dentro. ¿Qué pasa con las pertenencias? | **Se quedan.** La baja es **lógica** y es del **grupo** (`deleted_at`, QC-83 dec. 5); sus filas de pertenencia se conservan, así que no se pierde quién estaba dentro. **No se ofrece restaurar**: un grupo dado de baja no se recupera (**QC-66 dec. 3**), y su nombre queda libre para otro grupo nuevo (índice único parcial, QC-83 dec. 8) |
| 2026-09-11 | ¿Dar de baja un grupo puede dejar un pedido sin responsables? | **No, y esta ficha lo demuestra con test.** **QC-86 guardó a las PERSONAS, no al grupo vivo**: el pedido conserva sus responsables y el nombre del grupo congelado. El test es la prueba ejecutable de que esa decisión de QC-86 aguanta desde el otro lado |
| 2026-09-11 | ¿Renombrar un grupo cambia lo que ya se asignó? | **No.** El nombre que QC-86 congeló en un pedido **no se toca**: el pedido sigue diciendo cómo se llamaba el grupo el día que se asignó |
| 2026-09-11 | ¿Puede haber dos grupos con el mismo nombre? | **No, dentro de la misma empresa**, medido **sin mayúsculas y sin acentos** contra la columna normalizada y el índice único **parcial** que ya creó **QC-83** (dec. 7 y 8). El duplicado **se rechaza diciéndolo**, con un `code` estable, no con un error genérico |
| 2026-09-11 | ¿Qué ve alguien de otra empresa? | **Nada.** Las siete operaciones se acotan a la empresa de la sesión. Heredado de **QC-47** y **QC-48**. *(Decía «las seis»; el número se corrigió al aprobar el spec (F1.4): el Alcance de esta misma ficha enumera **siete** casos de uso y el «seis» venía de copiar la redacción de QC-66. **La decisión no cambia**, y sigue siendo «todas, sin excepción».)* |
| 2026-09-11 | ¿Cómo se lista? | **Paginado, con orden y desempate estable**, siguiendo el listado de usuarios. Heredado de **QC-66 dec. 11** y **QC-57** |
| 2026-09-11 | Forma de las operaciones | **Server Actions con `FormData`** en las mutaciones, errores con **`code` estable**, identificadores en **inglés** `snake_case`. Heredado de **QC-66 dec. 16** |
| 2026-09-11 | ¿Hay migración? | **Ninguna, y es un límite, no un olvido.** El modelo entero es de **QC-83** y está mergeado. Ni `db/schema.prisma` ni `db/migrations/` se tocan |
| 2026-09-11 | ¿Hace falta E2E? | **No aquí: diferida a QC-85**, que es donde existe la pantalla que recorrer. Los E2E existentes tienen que **seguir verdes**. Mismo criterio de **QC-66 dec. 17** |
| 2026-09-11 | ¿Librería nueva? | **Ninguna** |
| 2026-09-11 | ¿La consulta de los miembros de un grupo se pagina? | **Sí: paginada, con orden y desempate estable y con el total.** Mismos tamaños que el resto de la aplicación —**10** por defecto, **25** de tope— y el mismo desempate que impide que dos personas del mismo turno se intercambien entre páginas. Heredado de **QC-66 dec. 11** y **QC-57**: que las dos listas de la pantalla de QC-85 se paginen igual es lo que evita que QC-85 tenga que inventarse una segunda manera. **Cerrada al aprobar el spec (F1.4)**, y cierra la pregunta abierta **P2** que `spec_author` dejó escrita en F1.2. La escriben **R51–R54** |
