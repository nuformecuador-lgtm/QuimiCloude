# QC-87 — asignar-responsables-a-un-pedido · requirements.md

> **Zona** `fullstack` — **se parte en backend + frontend en F1.0** · **Complejidad** _la asigna el
> leader_ · **depends_on** QC-86, QC-84 · **Rama** `feature/QC-87-asignar-responsables-a-un-pedido`
>
> **Alcance.** Asignar y desasignar responsables de un pedido **desde la pantalla de pedidos**:
> marcar personas sueltas, aplicar uno o varios grupos de trabajo, o mezclar las dos cosas. El
> listado y el detalle muestran a los responsables como **avatares**, y cuando vinieron de un grupo
> se muestra **el nombre del grupo** junto a sus caras — quien mira el tablero tiene que distinguir
> «Turno noche» de cinco personas elegidas a mano. **Consume la tabla de QC-86 y no la define.**
>
> **Lo que NO entra.** El modelo de asignación → **QC-86** (hecho). El listado de pedidos asignados
> del Operador → **QC-88**. Ejecutar la receta → **QC-63**. La pantalla de pedidos **no se rehace**:
> se le añade lo de responsables (**QC-35**).
>
> *Sembrado por `/afinar-feature` el 2026-09-12. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> **La ficha se partió en dos DESPUÉS de sembrar esta semilla (F1.0).** El bloque de Alcance de
> arriba —escrito el 2026-09-12— describe **las dos mitades** y **no se toca**. Estos requisitos son
> la mitad **BACKEND**: los **cuatro casos de uso** (asignar personas sueltas y/o grupos, quitar un
> grupo, desasignar una persona, consultar los responsables de un pedido), sus **puertos**, sus
> **adaptadores** y sus **Server Actions**. El **panel lateral, los avatares, el listado y el E2E de
> pantalla son de QC-102**, que depende de esta, y aquí son un **límite con requisito propio**
> (**R50**), igual que **QC-84 hizo con su R48** y **QC-83 con su R27**.

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`asignaciones`** —sus casos de
uso, su puerto, su adaptador Prisma y sus adaptadores driving— más los **contratos públicos** que
`pedidos` e `identity` tienen que publicar para que esta ficha pueda consumirlos sin tocar sus tablas
(`design.md > 2`).

**Cinco avisos de lectura.**

(a) **R1–R4 son la autorización, y es la primera línea del service, no de la Server Action**
(decisión cerrada 5, `docs/architecture.md > Acceso a datos y autorizacion`). **Esta ficha estrena
`asignaciones.modificar`**: QC-86 R29 dejó escrito que nadie exigía todavía los dos permisos del
módulo. `asignaciones.consultar` **sigue sin estrenarse aquí** y es de QC-88 (`design.md > 0`,
hallazgo 3): leer los responsables basta con poder ver pedidos (**R3**).

(b) **R19–R23 son las dos preguntas que QC-86 dejó abiertas**, cada una con su requisito y su test:
al aplicar un grupo **solo entran las cuentas `active`** (R19–R21, decisión 3) y **reaplicar añade a
los que faltan** sin tocar a los que ya estaban (R22, R23, decisión 2). Están escritas por separado a
propósito: son dos reglas distintas que el mismo `INSERT` puede romper de dos maneras distintas.

(c) **R8–R13 son los estados**, escritos operación por operación. Un pedido **`ENTREGADO` congela**
—ni entra ni sale nadie— y un **`CANCELADO` no admite asignación nueva**; los dos rechazos llevan
**`code` distinto** porque son dos frases distintas para quien las lee (QC-70 R4).

(d) **R45–R51 son requisitos de ALCANCE y de FRONTERA, de pleno derecho**, no comentarios: esta
ficha **no toca `db/schema.prisma` ni `db/migrations/`**, **no añade ningún permiso** —el catálogo
sigue con **quince**— y **no crea ninguna pantalla**.

(e) **«Eliminar» significa borrado FÍSICO de la fila** (QC-86 R15, decisión cerrada 5 de QC-86):
excepción explícita al borrado lógico de QC-4, ya decidida y no reabierta.

### Autorización y actor (decisión cerrada 5)

**R1.** El sistema DEBE exigir el permiso **`asignaciones.modificar`** en la **primera línea** de
cada uno de sus tres casos de uso de escritura —asignar, quitar un grupo y desasignar—, **antes** de
validar la entrada y **antes** de tocar ningún puerto.

**R2.** SI el actor está ausente, no trae conjunto de permisos, lo trae vacío o no contiene
`asignaciones.modificar`, ENTONCES el sistema DEBE rechazar la operación con el error de
autorización (`code` `unauthorized`), **sin leer ni escribir nada** y sin revelar si el pedido, la
persona o el grupo existen.

**R3.** El sistema DEBE exigir **`pedidos.consultar`** en la primera línea de la consulta de
responsables, comprobando **pertenencia exacta** del código al conjunto del actor; y NO DEBE aceptar
`asignaciones.consultar` ni `asignaciones.modificar` como sustituto, ni `pedidos.consultar` como
sustituto de `asignaciones.modificar`.

**R4.** El sistema DEBE recibir el actor —identificador, **empresa** y conjunto de permisos— **por
parámetro** en los cuatro casos de uso, y su dominio NO DEBE leer la sesión, ninguna cookie ni
ninguna cabecera.

### La empresa

**R5.** El sistema DEBE tomar la empresa de cada fila que escribe **del actor**, y NO DEBE aceptarla
como dato de entrada de la operación.

**R6.** SI la persona o el grupo indicados no existen, están dados de baja o son de **otra empresa**,
ENTONCES el sistema DEBE rechazar la operación —los tres casos, el **mismo** error: `user_not_found`
para la persona, `work_group_not_found` para el grupo— y NO DEBE crear ni eliminar ninguna fila.

**R7.** La consulta de responsables DEBE devolver **únicamente** las asignaciones del pedido cuya
empresa sea la del actor, y NO DEBE revelar ninguna asignación de otra empresa ni su existencia.

### Los estados del pedido (decisión cerrada 1)

**R8.** SI el pedido indicado no existe o está dado de baja, ENTONCES el sistema DEBE rechazar la
operación con `order_not_found` en las **cuatro** operaciones, y no crear ni eliminar ninguna fila.

**R9.** MIENTRAS el pedido esté en estado **`PENDIENTE`** o **`EN_CURSO`**, el sistema DEBE admitir
asignar responsables, quitar un grupo y desasignar a una persona.

**R10.** MIENTRAS el pedido esté **`ENTREGADO`**, el sistema DEBE rechazar las **tres** escrituras
—asignar, quitar un grupo y desasignar— con un `code` propio y estable de «pedido entregado», y NO
DEBE crear, modificar ni eliminar ninguna asignación suya.

**R11.** MIENTRAS el pedido esté **`CANCELADO`**, el sistema DEBE rechazar las **tres** escrituras
con un `code` propio y estable **distinto del de R10**, y NO DEBE crear, modificar ni eliminar
ninguna asignación suya.

**R12.** El sistema DEBE decidir si el estado admite la operación **sobre la lectura del pedido
hecha dentro de la misma operación**, y NO DEBE expresarlo como condición del `WHERE` de la
escritura; de modo que «el pedido no existe» (R8) y «el pedido no admite la operación» (R10, R11)
sean **errores distintos** y no el mismo.

**R13.** La consulta de responsables DEBE devolver el mismo resultado en los **cuatro** estados del
pedido, y NO DEBE rechazarse por estar el pedido `ENTREGADO` ni `CANCELADO`.

### Asignar personas sueltas

**R14.** CUANDO se asignan una o varias personas **sueltas** a un pedido que admite asignación, el
sistema DEBE crear **una fila por persona** con origen **suelto** —sin referencia a grupo y sin
nombre congelado— y con la empresa del actor.

**R15.** SI alguna de esas personas **ya está asignada** a ese pedido —por el camino que sea—,
ENTONCES el sistema DEBE dejar su fila **exactamente como estaba** —mismo origen, misma referencia
de grupo y mismo nombre congelado—, NO DEBE crear una segunda fila para ella y NO DEBE fallar la
operación por ello.

**R16.** CUANDO una operación de asignación termina, el sistema DEBE devolver **cuántas personas se
añadieron**, contando solo las filas creadas y no las que ya estaban.

**R17.** SI alguna de las personas indicadas no existe, está dada de baja o es de otra empresa,
ENTONCES el sistema DEBE rechazar la operación **entera** con `user_not_found` y NO DEBE dejar creada
ninguna de sus filas.

**R18.** SI alguna de las personas indicadas tiene la cuenta en un **estado efectivo distinto de
`active`** en el instante de la operación, ENTONCES el sistema DEBE rechazar la operación entera con
un `code` propio y estable, y NO DEBE dejar creada ninguna de sus filas.

### Aplicar uno o varios grupos (decisiones cerradas 2, 3, 6 y 7)

**R19.** CUANDO se aplica un grupo de trabajo a un pedido que admite asignación, el sistema DEBE
crear una fila por **cada miembro cuyo estado efectivo sea `active`** en ese instante, y cada fila
DEBE llevar la **referencia al grupo** y el **nombre que el grupo tenía en ese instante**.

**R20.** CUANDO se aplica un grupo, el sistema NO DEBE crear fila para los miembros cuyo estado
efectivo no sea `active`, y NO DEBE fallar la operación por su causa.

**R21.** El sistema DEBE decidir qué miembros están `active` con la **misma definición** que decide
quién aparece en la lista de miembros del grupo, y DEBE recibir el instante (`now`) **por
parámetro**; NO DEBE escribir una segunda definición de «cuenta activa» ni consultarla con un
`WHERE account_status = 'active'` a secas.

**R22.** CUANDO se aplica a un pedido un grupo que **ya se le había aplicado**, el sistema DEBE crear
fila **solo** para los miembros `active` que todavía no tengan fila en ese pedido, y NO DEBE
modificar ni eliminar ninguna fila ya existente de ese pedido —ni su origen, ni su referencia de
grupo, ni su nombre congelado—, sea esa fila suelta, de ese mismo grupo o de otro.

**R23.** SI una persona fue **desasignada a mano** de un pedido y sigue siendo miembro `active` del
grupo, ENTONCES al **reaplicar** ese grupo el sistema DEBE volver a crearle fila.

**R24.** El sistema DEBE admitir en **una sola operación** varias personas sueltas, varios grupos, o
las dos cosas a la vez; y CUANDO la misma persona llegue por **más de un camino** en esa operación,
DEBE persistir **un solo origen**, el del **primer** camino que la trajo, con un orden de
resolución **determinista** y documentado.

**R25.** SI alguno de los grupos indicados no existe, está dado de baja o es de otra empresa,
ENTONCES el sistema DEBE rechazar la operación entera con `work_group_not_found` y NO DEBE dejar
creada ninguna fila.

**R26.** SI un grupo vivo de la empresa no tiene **ningún** miembro `active`, ENTONCES el sistema
DEBE terminar la operación **con éxito**, informando de **cero** personas añadidas por ese grupo, y
NO DEBE crear ninguna fila ni lanzar ningún error.

**R27.** El sistema DEBE escribir **todas** las filas de una misma operación en **una sola
transacción**, de modo que un fallo no deje el pedido con parte de las personas asignadas.

**R28.** El sistema DEBE escribir el **nombre congelado** del grupo en la **misma escritura** que
crea la fila, y NO DEBE recalcularlo, refrescarlo ni releerlo después; CUANDO el grupo se renombre o
se dé de baja, ninguna fila ya creada DEBE cambiar.

### Desasignar y quitar un grupo (decisión cerrada 7)

**R29.** CUANDO se desasigna a una persona de un pedido que admite la operación, el sistema DEBE
eliminar **físicamente** esa fila y **ninguna otra** —ni las demás filas del mismo grupo en ese
pedido, ni las sueltas, ni las de otros pedidos—, y NO DEBE modificar el pedido, la persona ni el
grupo.

**R30.** SI se intenta desasignar a una persona que **no está asignada** a ese pedido, ENTONCES el
sistema DEBE rechazar la operación con un `code` propio y estable de «esa persona no es responsable
de este pedido», sin ningún efecto.

**R31.** El caso de uso de desasignar DEBE operar sobre **exactamente una** persona por invocación, y
su entrada NO DEBE poder expresar un borrado de varias filas ni de todas las de un pedido.

**R32.** CUANDO se quita un **grupo** de un pedido que admite la operación, el sistema DEBE eliminar
físicamente **todas** las filas de ese pedido cuyo origen sea **ese** grupo y **ninguna otra** —ni
las sueltas ni las de otro grupo—, aunque el grupo se haya renombrado o dado de baja después de
aplicarse.

**R33.** SI el grupo indicado no tiene ninguna fila en ese pedido, ENTONCES el sistema DEBE terminar
**con éxito** informando de **cero** filas eliminadas, sin lanzar ningún error.

**R34.** CUANDO se quita un grupo de un pedido, el sistema DEBE devolver **cuántas** filas eliminó.

### La consulta de responsables (decisiones cerradas 5 y 6)

**R35.** CUANDO se consultan los responsables de un pedido, el sistema DEBE devolver **una entrada
por fila viva**, con el **identificador** de la persona, su **nombre mostrable**, su **origen** y
—cuando el origen sea un grupo— la **referencia** a ese grupo y su **nombre congelado**.

**R36.** El sistema NO DEBE derivar la lista de responsables de la pertenencia **vigente** a ningún
grupo, y NO DEBE sustituir el nombre congelado por el nombre **actual** del grupo.

**R37.** MIENTRAS una persona responsable esté dada de baja, inactiva o bloqueada, la consulta DEBE
seguir devolviéndola con su nombre mostrable, y NO DEBE ocultarla ni omitirla.

**R38.** El sistema DEBE devolver los responsables en un orden **determinista y estable** —por nombre
mostrable, con desempate por identificador de la persona—, de modo que dos lecturas seguidas del
mismo pedido devuelvan la misma secuencia.

**R39.** La consulta NO DEBE devolver ningún dato de credencial, ni correo, ni documento, ni estado
de cuenta, ni ninguna marca de baja de la persona.

**R40.** SI el pedido no tiene ninguna asignación, ENTONCES la consulta DEBE devolver una lista
**vacía** y NO DEBE lanzar ningún error.

### Forma de las operaciones (decisión cerrada 10)

**R41.** El sistema DEBE exponer las tres mutaciones como **Server Actions** que reciben **`FormData`**
y entregan sus valores **crudos** al esquema de validación del dominio; y DEBE exponer la consulta
con argumentos **ya tipados**, no con `FormData`.

**R42.** El sistema DEBE validar la entrada de las cuatro operaciones con un esquema declarado en su
dominio; y SI la entrada es inválida —identificador que no es un uuid, listas ausentes, operación
sin ninguna persona ni ningún grupo—, ENTONCES DEBE rechazarla con `invalid_input` **sin tocar
ningún puerto**.

**R43.** Cada error que el sistema devuelva DEBE llevar un **`code` estable** del catálogo cerrado de
errores; el adaptador driving DEBE traducirlo **por su `code`** y nunca por su texto; y ese adaptador
NO DEBE comprobar ningún permiso por su cuenta.

**R44.** El sistema DEBE nombrar en **inglés** sus archivos, símbolos exportados y campos de
`FormData`.

### Frontera de módulo, esquema y permisos (decisiones cerradas 7 y 8)

**R45.** El módulo `asignaciones` DEBE conocer el **pedido**, la **persona** y el **grupo**
únicamente a través del **contrato público** de sus módulos (`@/lib/modules/...`): NO DEBE importar
ninguna ruta interna suya ni consultar sus tablas con el cliente Prisma; y ningún módulo distinto de
`asignaciones` DEBE consultar `order_assignments` con el cliente Prisma.

**R46.** El **contrato público** de `asignaciones` NO DEBE arrastrar `next/*`, `@prisma/client` ni
`'use server'` en su cierre de imports, y las Server Actions de esta ficha NO DEBEN reexportarse
desde él.

**R47.** El sistema DEBE cablear cada puerto con su adaptador **únicamente** en `lib/composition`, y
ningún adaptador driving DEBE instanciar un adaptador driven.

**R48.** Esta feature NO DEBE modificar `db/schema.prisma` ni añadir, cambiar o revertir ninguna
migración: el diff de `db/**` DEBE ser **vacío**.

**R49.** Esta feature NO DEBE añadir, quitar ni renombrar ningún permiso: reutiliza
`asignaciones.modificar` y `pedidos.consultar`, el catálogo cerrado DEBE seguir teniendo **quince**
entradas y los tests que afirman ese número **no se tocan**.

### Límite de alcance

**R50.** Esta feature NO DEBE incluir ninguna pantalla, página, componente de interfaz ni ruta bajo
`app/` o `components/` —van a **QC-102**—; por lo tanto no aporta ningún flujo navegable que un test
E2E pueda visitar, su verificación es **unitaria y de integración contra Postgres real**, el **E2E de
pantalla se difiere aquí y con motivo a QC-102**, y los E2E existentes DEBEN seguir pasando **sin
cambios en su guion** (lo que ejercita cada `test(...)`, sus selectores y sus aserciones).

**R51.** Esta feature NO DEBE incorporar ninguna dependencia de terceros nueva.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`; las que son de **pantalla** se mapean a
su requisito de **límite** (**R50**), que es lo que las hace verificables en esta mitad.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Solo `PENDIENTE` y `EN_CURSO` admiten asignación; `ENTREGADO` congela; `CANCELADO` no admite asignación nueva | R8, R9, R10, R11, R12, R13 |
| 2 | Reaplicar un grupo **añade a los que faltan**, sin tocar a los que ya estaban, y se dice cuántas se añadieron | R15, R16, R22, R23 |
| 3 | Al aplicar un grupo solo entran las cuentas **`active`**; quien no lo esté entra cuando se reaplique | R19, R20, R21, R23, R26 |
| 4 | Se asigna desde el **panel lateral** del pedido (patrón QC-45/QC-67/QC-85) | R50 (límite: la pantalla es de QC-102) |
| 5 | Ver: `pedidos.consultar`. Asignar y desasignar: `asignaciones.modificar`, en el service, primera línea, fallando cerrado, actor por parámetro | R1, R2, R3, R4 |
| 6 | El **nombre del grupo** se muestra junto a los avatares de sus personas | R19, R28, R35, R36 + R50 (el pintado es de QC-102) |
| 7 | Heredado de QC-86: congelado, gana el primer origen, quitar un grupo se lleva a sus personas, se desasigna persona a persona, la empresa la vigila la base | R5, R6, R24, R28, R29, R31, R32, R36 |
| 8 | **No se toca el esquema** y **no nacen permisos**: el catálogo sigue con quince | R48, R49 |
| 9 | Se reutiliza tabla compartida, orden y filtro, panel lateral y la pantalla de QC-35, que no se rehace; el `avatar` ya existe y no hay que añadirlo | R50, R51 |
| 10 | **Server Actions con `FormData`**, errores con `code` estable, identificadores en inglés | R41, R42, R43, R44 |
| 11 | Hace falta E2E del recorrido completo | R50 (el E2E **de pantalla** es de QC-102, que lo hereda con su motivo escrito; lo de esta mitad son tests de integración contra Postgres real) |
| 12 | Ninguna librería nueva | R51 |

Requisitos que **no** salen de una fila de la tabla, y de dónde salen: **R7** de
`docs/architecture.md > Dominio` n.º 1 (ninguna consulta cruza la frontera de la empresa); **R14,
R17, R18** del Alcance («marcar personas sueltas») y del precedente QC-84 R29/R31; **R27** de
`docs/architecture.md > Dominio` n.º 3 (el registro es la operación); **R30, R33, R34** de la forma
de los casos de uso de QC-84 (cada «no encontrado» con su mensaje); **R37** de QC-86 decisión 9 («la
persona de baja sigue siendo responsable; quien lee la filtra»); **R38, R39, R40** de QC-66/QC-84
(orden estable, proyección mínima, lista vacía no es error); **R45, R46, R47** de
`docs/architecture.md > Modulos y arquitectura hexagonal` y de QC-86 R30/R31.

## Preguntas abiertas

Tres. **Ninguna bloquea la implementación**: las tres están escritas como requisito con la respuesta
más coherente con lo ya decidido, y cada una dice **qué requisito cae** si el humano decide lo
contrario. Se escriben para que no se descubran revisando el código.

1. **¿Se puede asignar SUELTA a una persona cuya cuenta no está `active`?** La decisión 3 solo habla
   de **aplicar un grupo**. **R18** la rechaza, por coherencia con esa decisión —«lo que la pantalla
   muestra es lo que se asigna»— y con QC-84, que no deja meter en un grupo a quien no se ve sin
   decirlo. Si el humano prefiere que **sí** se pueda —la asignación está congelada y la cuenta puede
   activarse mañana—, **cae R18** y no cambia nada más.
2. **¿Un pedido `CANCELADO` admite DESASIGNAR o quitar un grupo?** La decisión 1 dice literalmente
   «no admite **asignación nueva**». **R11** lo trata como el `ENTREGADO` para las **tres**
   escrituras, que es la lectura literal de «solo se asigna sobre `PENDIENTE` y `EN_CURSO`». Si se
   quiere poder **limpiar** los responsables de un pedido cancelado, cambia **solo R11**.
3. **¿«Quitar un grupo del pedido» entra en esta mitad o en QC-102?** El encargo de F1.2 enumeró
   «desasignar **persona a persona**», pero la decisión 7 hereda de QC-86 que «quitar un grupo se
   lleva a las personas que trajo», y sin caso de uso **QC-102 no podría ofrecerlo**. Está escrito
   como **R32, R33, R34**; si el humano lo difiere, **caen esos tres** y el resto no se toca.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-12 | ¿Qué estados de pedido admiten asignación? | **Solo `PENDIENTE` y `EN_CURSO`.** Un **`ENTREGADO` congela su asignación** —ni se añade ni se quita a nadie: es el único dato que dice quién preparó realmente ese pedido, y reescribirlo después de los hechos lo destruiría— y un **`CANCELADO` no admite asignación nueva**, como ya decía el board. Quien se equivocó lo corrige **antes** de entregar. **Cierra la pregunta abierta 2 que dejó QC-86** |
| 2026-09-12 | Se vuelve a aplicar un grupo ya aplicado, y entretanto entró gente. ¿Qué pasa? | **Añade a los que faltan.** Las personas que ya estaban **se quedan como estaban, con su origen intacto**, y entran las nuevas; la pantalla dice **cuántas se añadieron**. Se descartó reemplazar por la foto de hoy: sacaría del pedido a quien ya no esté en el grupo, que es **exactamente lo que QC-86 prohíbe**. **Consecuencia escrita**: alguien a quien se desasignó a mano vuelve a entrar si sigue en el grupo y se reaplica. **Cierra la pregunta abierta 1 de QC-86** |
| 2026-09-12 | Al aplicar un grupo, ¿se asigna a quien tiene la cuenta bloqueada o recién creada? | **No: solo a las cuentas `active`.** Lo que la pantalla de grupos muestra (QC-84 dec. 3) es **lo que se asigna**, así que nadie pulsa «5» y obtiene otra cosa. **Precio escrito**: dar de alta a alguien y meterlo en el turno **no le asigna nada** hasta que entre por primera vez y cambie su contraseña; cuando se reaplique el grupo, entrará. **Cierra la pregunta abierta que QC-85 dejó para esta ficha** |
| 2026-09-12 | ¿Dónde se asigna dentro de la pantalla de pedidos? | **En el panel lateral del pedido**, con buscador para marcar personas, selector de grupos y acción para sacar. Es el patrón de **QC-45**, **QC-67** y **QC-85**, y evita estrenar una forma nueva de editar |
| 2026-09-12 | ¿Quién ve los avatares y quién puede asignar? | **Ver: quien pueda ver pedidos** (`pedidos.consultar`) — quién prepara un pedido es información del pedido, como su receta o su estado. **Asignar y desasignar: `asignaciones.modificar`** (QC-86), comprobado **en el service, primera línea, fallando cerrado**, con el actor por parámetro. Heredado de **QC-66 dec. 15** |
| 2026-09-12 | ¿Cómo se distingue un grupo de cinco personas sueltas? | Se muestra **el nombre del grupo junto a los avatares de sus personas**, no solo las caras. Viene del board y es el motivo de que QC-86 congelara **el nombre** además de las personas |
| 2026-09-12 | Lo que se hereda de QC-86 y no se reabre | La asignación **se congela**; **gana el primer origen**; **quitar un grupo se lleva a las personas que trajo**; se puede **desasignar persona a persona**; y la **coherencia de empresa la vigila la base**. Esta ficha **consume** esa tabla y no la redefine |
| 2026-09-12 | ¿Se toca el esquema? | **Nada.** El modelo entero es de **QC-86** y está mergeado: ni `db/schema.prisma` ni `db/migrations/`. **Tampoco nacen permisos**: los dos de `asignaciones` ya existen y el catálogo sigue con **quince** |
| 2026-09-12 | ¿Qué se reutiliza y no se vuelve a montar? | La **tabla de datos compartida** (QC-55), **orden y filtro** (QC-57), el **panel lateral** (QC-45/QC-67/QC-85) y la **pantalla de pedidos de QC-35**, que **no se rehace**. La primitiva **`avatar` ya existe** en `components/ui/` —verificado en disco—, así que **no hay que añadirla con la CLI** ni arrastrar ninguna dependencia |
| 2026-09-12 | Forma de las operaciones | **Server Actions con `FormData`** en las mutaciones, errores con **`code` estable**, identificadores en **inglés**. Heredado de **QC-66 dec. 16** |
| 2026-09-12 | ¿Hace falta E2E? | **Sí, y es de esta ficha.** `CHECKPOINTS.md` pide E2E para flujos críticos y aquí hay permisos y un cambio real en el trabajo de la gente. Recorrido: abrir un pedido, marcar una persona, aplicar un grupo, sacar a alguien y comprobar que el listado muestra los avatares y el nombre del grupo |
| 2026-09-12 | ¿Librería nueva? | **Ninguna** |
