# QC-83 — modelo-de-grupos-de-trabajo · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** QC-47 · **Rama**
> `feature/QC-83-modelo-de-grupos-de-trabajo`
>
> **Alcance.** El **modelo** de un grupo de trabajo —un conjunto de personas con nombre, «Turno
> noche», «Planta 2»— dentro del módulo **`identity`**: la tabla del grupo, la tabla de
> **pertenencia** que lo une con las personas, y su migración. El grupo pertenece a **una** empresa;
> una persona está en **varios** grupos; el nombre del grupo es único **dentro de la empresa**.
> Vive en `identity` porque un grupo es un conjunto de personas y las personas ya viven ahí, junto a
> roles, permisos y empresa.
>
> **Lo que NO entra.** El alta, la edición, el borrado y la lectura de grupos → **QC-84**. La
> pantalla → **QC-85**. Asignar un pedido a un grupo o a personas → **QC-86**, que **consume** esta
> tabla y no la define. Y **ningún service, ninguna Server Action y ninguna pantalla**: es ficha de
> **modelo**, con el mismo límite que se escribió en **QC-47**.
>
> *Sembrado por `/afinar-feature` el 2026-09-08. La ficha nació ese mismo día al acotar **QC-63**,
> que descubrió que el Operador entra por sus **pedidos asignados** y no por el catálogo de recetas.
> El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec.
> `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.*

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es la **capa de persistencia** de
QuimiCloude —el esquema Prisma (`db/schema.prisma`) más la base Postgres con la migración de esta
feature aplicada— y, para R3, la **única definición de «mismo nombre de grupo»** publicada por el
contrato público del módulo `identity`. No hay alta, edición, baja ni lectura de grupos, ni
service, ni Server Action, ni pantalla: ningún requisito habla de quién llama ni desde dónde, y
**R27 lo fija como límite**, igual que hizo **QC-47 con su R28**.

**Tres avisos de lectura.**
(a) «Rechazar **en la propia base de datos**» significa contra una restricción o un índice de
Postgres —el `SQLSTATE` es la evidencia—, nunca contra una comprobación previa al vuelo del
código: entre un `SELECT` y un `INSERT` cabe otra transacción, y un caso de uso que todavía no
existe (QC-84) no puede ser la garantía de nada.
(b) **R14, R15 y R16 son el corazón de la ficha**: son la decisión cerrada 1 —«la BASE, no el
código»— escrita en los tres sentidos en que se puede romper (insertar cruzado, mover de empresa
al padre, duplicar la fila).
(c) **R18, R19, R20 y R21 son la pareja de excepciones de las decisiones 4 y 5**, y se escriben
por separado a propósito: la pertenencia **se borra de verdad** y el grupo **se da de baja
lógica**. En la misma migración es fácil confundirlas, y un enunciado que nadie testea es un
enunciado que se rompe.

### El grupo

**R1.** El sistema DEBE persistir, para cada grupo de trabajo, un identificador propio, estable,
**no correlativo y no derivado de sus datos de negocio**, y DEBE generarlo la propia base de datos.

**R2.** SI se intenta persistir un grupo sin nombre, ENTONCES el sistema DEBE rechazar la operación
**en la propia base de datos** y no crear ninguna fila; y NO DEBE limitar en la columna la longitud
del nombre.

**R3.** El sistema DEBE persistir el nombre normalizado de cada grupo —sin acentos, sin signos y
sin distinguir mayúsculas de minúsculas— en una **columna propia** junto al nombre original, y DEBE
exponer **una única definición** de esa normalización, publicada por el contrato público del módulo
`identity`, de modo que la columna y cualquier consumidor futuro normalicen igual.

**R4.** SI se intenta persistir un grupo **vivo** cuyo nombre coincida, una vez normalizado, con el
de otro grupo vivo **de la misma empresa**, ENTONCES el sistema DEBE rechazar la operación **contra
un índice único de la base de datos** —no contra una comprobación previa al vuelo— y no crear ni
modificar ninguna fila.

**R5.** El sistema DEBE aceptar que dos empresas distintas tengan cada una un grupo vivo con el
mismo nombre normalizado, y NO DEBE rechazar el segundo por colisión.

**R6.** MIENTRAS un grupo esté dado de baja, el sistema DEBE aceptar el alta de otro grupo con ese
mismo nombre normalizado **en su misma empresa**, y NO DEBE rechazarla por colisión.

**R7.** El sistema DEBE declarar en el grupo una marca de baja lógica que nace **vacía**, y NO DEBE
incluir en esta feature ninguna operación que la escriba: no hay alta, edición ni baja de grupos.

**R8.** El sistema DEBE persistir, para cada grupo, una referencia a **exactamente una** empresa, y
esa referencia DEBE ser **obligatoria en la propia base de datos**.

**R9.** SI se intenta persistir un grupo cuya referencia de empresa no corresponda a ninguna empresa
existente, ENTONCES el sistema DEBE rechazar la operación **en la propia base de datos** y no crear
ni modificar ninguna fila.

**R10.** SI se intenta eliminar una empresa referenciada por al menos un grupo —esté ese grupo vivo
o dado de baja—, ENTONCES el sistema DEBE rechazar el borrado y DEBE dejar la empresa y sus grupos
intactos.

**R11.** El sistema DEBE registrar, en **cada una de las dos tablas** que crea esta feature, el
instante de creación y el instante de la última modificación, y DEBE actualizar el segundo cada vez
que la fila cambia.

**R12.** El sistema DEBE nombrar en **inglés** y en `snake_case` las tablas, columnas, índices y
restricciones que cree, renombre o recree esta feature.

### La pertenencia

**R13.** El sistema DEBE persistir cada pertenencia como una fila que referencia **exactamente un**
grupo y **exactamente una** persona, y que lleva **además** la empresa como **columna propia**; las
tres referencias DEBEN ser **obligatorias en la propia base de datos**.

**R14.** SI se intenta persistir una pertenencia cuyo grupo y cuya persona no sean de la **misma**
empresa —o cuya columna de empresa no coincida con la del grupo o con la de la persona—, ENTONCES el
sistema DEBE rechazar la operación **en la propia base de datos**, tanto al insertar como al
modificar, y no crear ni modificar ninguna fila.

**R15.** SI se intenta cambiar la empresa de una persona o la de un grupo que tenga al menos una
pertenencia, de modo que grupo y persona dejarían de ser de la misma empresa, ENTONCES el sistema
DEBE rechazar el cambio **en la propia base de datos** y NO DEBE dejar ninguna pertenencia cruzada
ni ninguna fila con la empresa desincronizada.

**R16.** SI se intenta persistir dos veces la misma persona en el mismo grupo, ENTONCES el sistema
DEBE rechazar la segunda **en la propia base de datos**.

**R17.** El sistema DEBE aceptar que un mismo grupo tenga varias personas y que una misma persona
esté en varios grupos a la vez, y NO DEBE limitar en la base el número de grupos de una persona ni
el número de personas de un grupo.

**R18.** CUANDO se saca a una persona de un grupo, el sistema DEBE eliminar **físicamente** la fila
de pertenencia; y NO DEBE declarar en la pertenencia ninguna marca de baja lógica ni ninguna otra
columna que conserve el rastro de quién estuvo en el grupo.

**R19.** El sistema DEBE aceptar un grupo **sin ninguna persona dentro**, y sacar a su última
persona NO DEBE eliminar el grupo, darlo de baja ni modificarlo de ninguna forma.

**R20.** MIENTRAS una persona esté dada de baja, o su cuenta esté inactiva o bloqueada, el sistema
DEBE conservar intactas todas sus pertenencias, y NO DEBE eliminarlas, marcarlas ni ocultarlas en la
persistencia; de modo que reactivar esa cuenta la devuelve a sus grupos sin ninguna escritura
adicional.

**R21.** MIENTRAS un grupo esté dado de baja, el sistema DEBE conservar intactas sus filas de
pertenencia, y darlo de baja NO DEBE eliminar ninguna.

### Frontera de módulo, esquema y migración

**R22.** El sistema DEBE declarar `identity` como módulo propietario de **las dos** tablas que crea
esta feature, y ningún módulo distinto de `identity` DEBE consultarlas con el cliente Prisma.

**R23.** El sistema NO DEBE cambiar ninguna columna, índice, clave foránea, restricción, CHECK ni
RLS ya existentes en `users`, en `companies` ni en ninguna tabla de otro módulo; la **única**
modificación admitida sobre una tabla preexistente es **añadir a `users` la restricción única
`(id, company_id)`** que hace posible la garantía de R14, que no altera ninguna columna ni ninguna
otra restricción y que ninguna consulta existente necesita cambiar para usar.

**R24.** El sistema DEBE tener `ROW LEVEL SECURITY` activado **y forzado**
(`FORCE ROW LEVEL SECURITY`) en **las dos** tablas que crea esta feature.

**R25.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar exactamente en el
estado de esquema previo a aplicarla: no queda tabla, columna, índice, clave foránea, restricción
única ni RLS residual de los grupos ni de la pertenencia, y `users` vuelve a tener **la definición
literal** que tenía antes de esta feature.

**R26.** CUANDO se revierte la migración de esta feature, el sistema NO DEBE borrar, modificar,
renombrar ni dar de baja ninguna fila de una tabla que ya existiera antes de aplicarla; y SI
revertir obligara a tocar una de esas filas, o a inventar un dato para poder hacerlo, ENTONCES DEBE
**abortar la reversión completa** sin aplicar ninguno de sus cambios (es R25 leído al revés: fallar
antes que perder el dato).

### Límite de alcance

**R27.** El sistema NO DEBE incluir en esta feature ningún service, caso de uso, ruta, pantalla,
Server Action, route handler ni regla de permisos, y por tanto NO DEBE aportar ningún flujo
navegable nuevo; y los tests E2E que ya existen DEBEN seguir pasando **sin cambios en su guion** (lo
que ejercita cada `test(...)`, sus selectores y sus aserciones).

**R28.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Nadie de la empresa A acaba en un grupo de la empresa B, y lo impide la BASE: la pertenencia lleva `company_id` | R13, R14, R15, R23 |
| 2 | La persona de baja, inactiva o bloqueada sigue en sus grupos; filtrar al leer es de QC-84 | R20 |
| 3 | Un grupo puede existir sin ninguna persona dentro | R17, R19 |
| 4 | Sacar a alguien BORRA la fila: excepción explícita al borrado lógico de QC-4 | R18 |
| 5 | Aviso de coherencia: el `deleted_at` es del GRUPO, no de la pertenencia | R7, R18, R21 |
| 6 | El grupo se identifica por un UUID aleatorio generado por la base | R1 |
| 7 | No hay dos grupos con el mismo nombre dentro de la empresa, medido sin mayúsculas ni acentos, en columna propia | R3, R4, R5 |
| 8 | Un grupo dado de baja libera su nombre (índice único parcial) | R6 |
| 9 | Nombre obligatorio, rechazado en la base, sin límite de longitud en la columna | R2 |
| 10 | El grupo pertenece a UNA empresa, obligatoria, con FK que impide borrar una empresa con grupos | R8, R9, R10 |
| 11 | Identificadores de la base en inglés | R12 |
| 12 | `created_at` y `updated_at` en las tablas nuevas | R11 |
| 13 | RLS activada y forzada en las tablas nuevas | R24 |
| 14 | Migración con `down.sql` que revierte al esquema exacto anterior, y falla antes que perder o inventar un dato | R25, R26 |
| 15 | `/// @module identity` en las tablas nuevas | R22 |
| 16 | No hay E2E nuevo; los existentes tienen que seguir verdes | R27 |
| 17 | Ninguna librería nueva | R28 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-08 | ¿Una persona de la empresa A puede acabar en un grupo de la empresa B? | **No, y lo impide la BASE, no solo el código.** La tabla de pertenencia lleva **también `company_id`**, y la base rechaza la fila cruzada. Una tabla que une dos cosas de empresas distintas es la fuga de datos más barata que existe: meter a alguien de otra empresa en «Turno noche» le daría **pedidos ajenos** en cuanto **QC-88** liste por responsable. Dejarlo en manos del caso de uso de QC-84 significa que un script, un seed o un bug futuro pueden escribir la fila y **nada da rojo** hasta que alguien vea pedidos que no son suyos |
| 2026-09-08 | Una persona dada de baja, o con la cuenta `inactive` o `blocked` (**QC-65**), ¿sigue en sus grupos? | **Sigue dentro. Quien LEE la filtra.** La pertenencia no se toca: sale del grupo el día que alguien la saca. Así, **reactivar una cuenta la devuelve a sus grupos sin rehacer nada** —sacarla automáticamente obligaría a volver a meterla grupo por grupo, y nadie recuerda en cuáles estaba—, y no se pierde el rastro de quién estaba en «Turno noche». **El filtrado al leer es de QC-84**, no de esta ficha |
| 2026-09-08 | ¿Puede existir un grupo sin ninguna persona dentro? | **Sí.** Se crea «Turno noche» y se le van añadiendo personas después, y sacar a la última **no** borra el grupo. Es como se crea un grupo en la vida real. Un grupo vacío simplemente **no aporta responsables** cuando QC-86 lo usa para asignar. Exigir un miembro mínimo complicaría el alta y podría dejar bloqueada la baja de una persona por ser el último miembro de algún grupo |
| 2026-09-08 | Cuando se saca a alguien de un grupo, ¿queda rastro de que estuvo? | **No: la pertenencia se borra de verdad.** Es la **EXCEPCIÓN EXPLÍCITA al borrado lógico** que fijó **QC-4**, y por eso se escribe en vez de darse por hecha. La pertenencia es una relación viva, no un hecho histórico: el histórico que de verdad importa —**quién era responsable de un pedido**— queda **congelado en QC-86** en el momento de asignar, y no depende de esta tabla. La baja lógica aquí solo compraría «quién estuvo en Turno noche en marzo», que nadie ha pedido, a cambio de un índice único parcial y de que **toda** lectura de miembros tenga que acordarse de filtrar |
| 2026-09-08 | **Aviso de coherencia**: ¿dónde va el `deleted_at`? | **En el GRUPO, no en la pertenencia.** Son las dos decisiones anteriores, y en la misma migración es fácil confundirlas: el grupo se da de baja **lógica**; sacar a una persona del grupo **borra la fila** |
| 2026-09-08 | ¿Cómo se identifica un grupo? | Por un **identificador propio no adivinable**: UUID aleatorio generado por la base, ni correlativo ni derivado del nombre. Heredado de **QC-4** y **QC-47** |
| 2026-09-08 | ¿Puede haber dos grupos con el mismo nombre? | **No, dentro de la misma empresa.** Único, medido **sin mayúsculas y sin acentos**, con el patrón de **nombre normalizado en columna propia** de **QC-14**/**QC-20**/**QC-32**/**QC-47**. Dos empresas pueden tener cada una su «Turno noche» |
| 2026-09-08 | ¿Un grupo dado de baja libera su nombre? | **Sí.** Índice único **parcial** (`WHERE deleted_at IS NULL`), el precedente de `recipes`, `suppliers`, `users` y `companies` |
| 2026-09-08 | ¿El nombre del grupo es obligatorio, y con qué tope? | **Obligatorio**, rechazado **en la propia base**, y **sin límite de longitud en la columna**: el tope vive en `zod`, no en el tipo, para que cambiarlo no sea una migración. Heredado de **QC-47 R2** |
| 2026-09-08 | ¿A cuántas empresas pertenece un grupo? | **A una sola**, obligatoria, con FK que impide borrar una empresa que todavía tenga grupos. Mismo trato que `users.company_id` en **QC-47** |
| 2026-09-08 | Idioma de los identificadores de la base | **Inglés.** Heredado de **QC-4** y **QC-47** |
| 2026-09-08 | Marcas de tiempo | `created_at` y `updated_at` en las tablas nuevas. Heredado de **QC-4**, **QC-14** y **QC-47** |
| 2026-09-08 | RLS | **Activada y forzada** en las tablas nuevas. La frontera real sigue siendo el **service** (`docs/architecture.md > Acceso a datos y autorizacion`), no la policy. Heredado de **QC-47** |
| 2026-09-08 | Migración | Con su **`down.sql`**, que revierte al **esquema exacto anterior**; y si revertir obligara a perder o inventar un dato, la reversión **falla** en vez de hacerlo. Heredado de **QC-47 R25/R26** |
| 2026-09-08 | Módulo declarado en el esquema | `/// @module identity` en las tablas nuevas: el grupo es un conjunto de personas y la persona es de `identity`. La guardia del esquema ya lo exige |
| 2026-09-08 | ¿Hace falta E2E? | **No hay E2E nuevo.** Es ficha de **modelo**, sin pantalla ni flujo que recorrer; `CHECKPOINTS.md` lo pide para flujos críticos y aquí no hay ninguno todavía. Los E2E existentes tienen que **seguir verdes**. Heredado del criterio de **QC-47**. El E2E de grupos, si hace falta, es de **QC-85** |
| 2026-09-08 | ¿Librería nueva? | **Ninguna** |
