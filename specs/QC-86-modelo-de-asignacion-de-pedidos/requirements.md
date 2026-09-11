# QC-86 — modelo-de-asignacion-de-pedidos · requirements.md

> **Zona** `backend` · **Complejidad** _la asigna el leader en F1.0_ · **depends_on** QC-83 ·
> **Rama** `feature/QC-86-modelo-de-asignacion-de-pedidos`
>
> **Alcance.** El **módulo nuevo `asignaciones`** y su modelo: la tabla que une un **pedido** con
> las **personas responsables** de prepararlo, su migración, y los **dos permisos** del módulo en
> el catálogo cerrado y en el seed. La asignación **se congela**: se puede marcar personas
> sueltas, aplicar uno o varios grupos de trabajo, o mezclar las dos cosas, y cuando se aplica un
> grupo el pedido guarda **las personas que ese grupo tenía en ese momento**, más la marca de que
> vinieron de él y **su nombre**. Sacar a alguien de un grupo mañana no le quita un pedido que ya
> estaba ejecutando, y meter a alguien no le hace aparecer pedidos viejos. El módulo conoce el
> pedido, la persona y el grupo por su **contrato público**, nunca por sus tablas.
>
> **Lo que NO entra.** La pantalla de asignar y desasignar → **QC-87**. El listado de pedidos
> asignados del Operador → **QC-88**. Ejecutar la receta → **QC-63**. Y **ningún caso de uso,
> ningún service, ninguna Server Action y ninguna pantalla**: es ficha de **modelo**, con el mismo
> límite que **QC-47** y **QC-83**.
>
> *Sembrado por `/afinar-feature` el 2026-09-11. La ficha nació el 2026-09-08 al acotar **QC-63**,
> que descubrió que el Operador entra por sus **pedidos asignados** y no por el catálogo de
> recetas. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del
> spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.*

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es la **capa de persistencia** de
QuimiCloude —el esquema Prisma (`db/schema.prisma`) más la base Postgres con la migración de esta
feature aplicada— y, para R25–R29, el **catálogo cerrado de permisos** y el **seed** que viven en
`lib/modules/identity/domain/permissions.ts`. No hay caso de uso, service, Server Action ni
pantalla: **ningún requisito habla de quién llama ni desde dónde**, y **R36 lo fija como límite**,
igual que hicieron **QC-47 con su R28** y **QC-83 con su R27**.

**Cuatro avisos de lectura.**

(a) «Rechazar **en la propia base de datos**» significa contra una restricción, un CHECK o un
índice de Postgres —el `SQLSTATE` es la evidencia—, nunca contra una comprobación previa al vuelo
del código: entre un `SELECT` y un `INSERT` cabe otra transacción, y un caso de uso que todavía no
existe (QC-87) no puede ser la garantía de nada. Es el criterio de **QC-83** traído entero.

(b) **R11, R12 y R13 son el corazón de la coherencia de empresa** (decisión cerrada 6), escrita en
los tres sentidos en que se puede romper: insertar cruzado, mover de empresa a un padre, y el caso
legítimo que **no** se puede rechazar por error (la asignación suelta, sin grupo).

(c) **R14 es un límite, no una carencia disimulada.** `orders` **no tiene `company_id`** —el
multi-empresa es la épica **QC-46**—, así que el triángulo que la base puede cerrar hoy es
**persona ↔ grupo ↔ fila**. Se escribe como requisito para que nadie «lo arregle» añadiendo una
columna de empresa a `orders` desde esta ficha.

(d) **R6, R7, R8 y R9 son la congelación**, y R15, R16 y R17 son el borrado físico. En la misma
migración es fácil confundir «la fila recuerda de dónde vino» con «la fila se recalcula desde el
grupo»: son lo contrario. Un enunciado que nadie testea es un enunciado que se rompe.

### La fila de asignación

**R1.** El sistema DEBE persistir cada asignación como una fila que referencia **exactamente un**
pedido y **exactamente una** persona, y que lleva **además** la empresa como **columna propia**;
las tres referencias DEBEN ser **obligatorias en la propia base de datos**.

**R2.** SI se intenta persistir una asignación cuya referencia de pedido no corresponda a ningún
pedido existente, ENTONCES el sistema DEBE rechazar la operación **en la propia base de datos** y
no crear ni modificar ninguna fila.

**R3.** SI se intenta persistir dos veces la misma persona en el mismo pedido, ENTONCES el sistema
DEBE rechazar la segunda **en la propia base de datos**, **con independencia de por qué camino
llegue** —marcada suelta, dentro de un grupo, o dentro de un segundo grupo—, de modo que la
primera que la trajo es la que queda.

**R4.** El sistema DEBE aceptar que un mismo pedido tenga varias personas asignadas y que una misma
persona esté asignada a varios pedidos a la vez, y NO DEBE limitar en la base el número de personas
de un pedido ni el número de pedidos de una persona.

**R5.** El sistema DEBE registrar para cada pareja pedido-persona **un solo origen**, y NO DEBE
declarar ninguna columna, tabla ni fila adicional que conserve un **segundo** origen de esa misma
persona en ese mismo pedido; de modo que ninguna lectura de la persistencia necesite deduplicar
responsables.

### El origen y lo que se congela

**R6.** El sistema DEBE distinguir, **con columnas de la propia fila**, si la persona fue marcada
**suelta** o si llegó **dentro de un grupo de trabajo**; y, cuando llegó dentro de un grupo, DEBE
persistir en la fila la **referencia a ese grupo** y el **nombre que ese grupo tenía en el instante
de la asignación**, copiado en una columna propia.

**R7.** SI se intenta persistir una asignación con referencia a un grupo y **sin** el nombre
congelado de ese grupo, o con el nombre congelado y **sin** referencia al grupo, ENTONCES el
sistema DEBE rechazar la operación **en la propia base de datos**, tanto al insertar como al
modificar.

**R8.** CUANDO cambia el nombre de un grupo de trabajo, o CUANDO ese grupo se da de baja, el
sistema NO DEBE modificar ninguna asignación ya persistida: ni su referencia al grupo, ni el nombre
congelado, ni ninguna otra columna suya.

**R9.** CUANDO una persona entra en un grupo de trabajo o sale de él, el sistema NO DEBE crear,
eliminar ni modificar ninguna asignación ya persistida; y la lista de responsables de un pedido NO
DEBE derivarse de la pertenencia vigente a ningún grupo.

**R10.** SI se intenta eliminar un grupo de trabajo referenciado por al menos una asignación,
ENTONCES el sistema DEBE rechazar el borrado y DEBE dejar el grupo y sus asignaciones intactos.

### La empresa, garantizada en la base

**R11.** SI se intenta persistir una asignación cuya persona y cuyo grupo no sean de la **misma**
empresa —o cuya columna de empresa no coincida con la de la persona o con la del grupo—, ENTONCES
el sistema DEBE rechazar la operación **en la propia base de datos**, tanto al insertar como al
modificar, y no crear ni modificar ninguna fila.

**R12.** SI se intenta cambiar la empresa de una persona, o la de un grupo, que tenga al menos una
asignación, de modo que persona y grupo dejarían de ser de la misma empresa, ENTONCES el sistema
DEBE rechazar el cambio **en la propia base de datos** y NO DEBE dejar ninguna asignación cruzada ni
ninguna fila con la empresa desincronizada.

**R13.** El sistema DEBE aceptar una asignación **sin ningún grupo** cuya columna de empresa sea la
de su persona, y NO DEBE exigir referencia a un grupo para aceptarla ni rechazarla por no tenerla.

**R14.** El sistema NO DEBE exigir ninguna coherencia de empresa entre la asignación y el **pedido**
—la garantía de R11 y R12 es **persona ↔ grupo ↔ fila**—, y NO DEBE añadir a `orders` ninguna
columna de empresa, ninguna referencia a empresa ni ninguna restricción nueva en esta feature.

### Quitar responsables

**R15.** CUANDO se retira a una persona de un pedido, el sistema DEBE eliminar **físicamente** la
fila de asignación; y NO DEBE declarar en ella ninguna marca de baja lógica ni ninguna otra columna
que conserve el rastro de quién estuvo asignado un rato.

**R16.** El sistema DEBE admitir que se elimine **una sola** de las filas que comparten pedido y
grupo, dejando intactas las demás filas de ese mismo grupo en ese mismo pedido y sin modificar
ninguna otra columna de ninguna de ellas.

**R17.** El sistema DEBE permitir identificar, **solo con columnas de la propia fila**, todas las
asignaciones de un pedido que llegaron con un grupo concreto, de modo que eliminarlas no afecte a
las filas sueltas de ese pedido ni a las que llegaron con otro grupo.

**R18.** El sistema DEBE aceptar un pedido **sin ninguna asignación**, y eliminar la última
asignación de un pedido NO DEBE eliminar el pedido, darlo de baja ni modificarlo de ninguna forma.

**R19.** MIENTRAS un pedido esté dado de baja, el sistema DEBE conservar intactas todas sus
asignaciones, y darlo de baja NO DEBE eliminar ni modificar ninguna.

**R20.** SI se intenta eliminar **físicamente** un pedido que tenga al menos una asignación,
ENTONCES el sistema DEBE rechazar el borrado y DEBE dejar el pedido y sus asignaciones intactos.

**R21.** MIENTRAS una persona esté dada de baja, o su cuenta esté inactiva o bloqueada, el sistema
DEBE conservar intactas todas sus asignaciones, y NO DEBE eliminarlas, marcarlas ni ocultarlas en
la persistencia.

**R22.** SI se intenta eliminar **físicamente** a una persona que tenga al menos una asignación,
ENTONCES el sistema DEBE rechazar el borrado y DEBE dejar la persona y sus asignaciones intactas.

### Marcas de tiempo y nombres

**R23.** El sistema DEBE registrar, en la tabla que crea esta feature, el instante de creación y el
instante de la última modificación, y DEBE actualizar el segundo cada vez que la fila cambia.

**R24.** El sistema DEBE nombrar en **inglés** y en `snake_case` las tablas, columnas, índices,
restricciones y CHECK que cree, renombre o recree esta feature.

### Los dos permisos

**R25.** El sistema DEBE declarar en el catálogo cerrado de permisos **exactamente dos** entradas
nuevas para el módulo `asignaciones` —una de **consulta** y una de **modificación**—, con el mismo
formato `<modulo>.<accion>` en español y en minúsculas que el resto del catálogo y con descripción
no vacía; y NO DEBE declarar ninguna otra entrada nueva.

**R26.** El sistema DEBE asignar en el seed la entrada de **consulta** al rol **Operador** y **las
dos** entradas al rol **Administrador**, escritas una a una, sin comodín ni regla implícita; y NO
DEBE dejar ninguna de las dos entradas sin ningún rol.

**R27.** El sistema NO DEBE añadir al conjunto que el seed asigna al rol **Operador** ningún permiso
distinto de la entrada de consulta de `asignaciones`; en particular, NO DEBE añadirle
`recetas.consultar`.

**R28.** CUANDO se aplica la migración de esta feature sobre una instalación que ya existe, el
sistema DEBE dejar persistidas las dos entradas nuevas del catálogo y sus asignaciones de rol —la de
consulta al Operador y las dos al Administrador—, resolviendo cada rol **por su nombre** y no por un
identificador escrito a mano; y aplicarla dos veces DEBE dejar exactamente el mismo estado que
aplicarla una, sin duplicar, reescribir ni borrar ninguna fila de permiso o de asignación ya
presente.

**R29.** El sistema NO DEBE exigir ninguno de los dos permisos nuevos desde ningún punto del
código en esta feature: se declaran y se siembran, y ningún caso de uso, ruta, pantalla ni enlace
de menú los consume todavía.

### Frontera de módulo, esquema y migración

**R30.** El sistema DEBE declarar **`asignaciones`** como módulo propietario de la tabla que crea
esta feature, y ningún módulo distinto de `asignaciones` DEBE consultarla con el cliente Prisma.

**R31.** El sistema DEBE publicar un **contrato público propio** para el módulo `asignaciones`, y
ese módulo DEBE conocer el pedido, la persona y el grupo **únicamente a través del contrato público
de sus módulos** (`@/lib/modules/...`): NO DEBE importar ninguna ruta interna suya, NO DEBE
consultar sus tablas con el cliente Prisma, y su contrato NO DEBE arrastrar `next/*` ni
`@prisma/client`.

**R32.** El sistema NO DEBE cambiar ninguna columna, índice, clave foránea, restricción, CHECK ni
RLS ya existentes en `orders`, `users`, `work_groups`, `work_group_members`, `companies`,
`permissions`, `role_permissions` ni en ninguna otra tabla preexistente; la **única** escritura
admitida sobre datos preexistentes es la inserción de las dos entradas de permiso y de sus
asignaciones de rol que exige R28.

**R33.** El sistema DEBE tener `ROW LEVEL SECURITY` activado **y forzado**
(`FORCE ROW LEVEL SECURITY`) en la tabla que crea esta feature.

**R34.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar exactamente en el
estado previo a aplicarla: no queda tabla, columna, índice, clave foránea, CHECK, tipo ni RLS
residual de las asignaciones, y el catálogo de permisos persistido vuelve a tener **las mismas
entradas y las mismas asignaciones de rol** que tenía antes.

**R35.** CUANDO se revierte la migración de esta feature, el sistema NO DEBE borrar, modificar,
renombrar ni dar de baja ninguna **otra** fila de una tabla que ya existiera antes de aplicarla; y
SI revertir obligara a tocar una de esas filas, o a inventar un dato para poder hacerlo, ENTONCES
DEBE **abortar la reversión completa** sin aplicar ninguno de sus cambios (es R34 leído al revés:
fallar antes que perder el dato).

### Límite de alcance

**R36.** El sistema NO DEBE incluir en esta feature ningún service, caso de uso, repositorio, ruta,
pantalla, Server Action, route handler ni corte de autorización, y por tanto NO DEBE aportar ningún
flujo navegable nuevo; y los tests E2E que ya existen DEBEN seguir pasando **sin cambios en su
guion** (lo que ejercita cada `test(...)`, sus selectores y sus aserciones).

**R37.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Módulo nuevo `asignaciones`, con barril público, `/// @module asignaciones`, que conoce pedido, persona y grupo por contrato público | R30, R31 |
| 2 | La ficha llega hasta modelo + migración + permisos + armazón: sin caso de uso, service, Server Action ni pantalla | R29, R36 |
| 3 | Un solo origen: gana el primero que la trajo; una fila por persona y pedido, sin deduplicar | R1, R3, R4, R5 |
| 4 | Las personas de un grupo se van con el grupo cuando se quita ese grupo del pedido | R17 |
| 5 | Se puede sacar a UNA persona que vino en grupo, y la fila se borra de verdad (excepción al borrado lógico de QC-4) | R15, R16 |
| 6 | Nadie de la empresa A acaba asignado con gente de la B, y lo impide la BASE; el pedido queda fuera del triángulo hasta QC-46 | R1, R11, R12, R13, R14 |
| 7 | Se congelan las personas del momento, la marca de que vinieron de un grupo, el grupo y su nombre de entonces | R6, R7, R8, R9, R10 |
| 8 | Dos permisos; el Operador nace con `consultar`, el Administrador con los dos; al Operador no se le da `recetas.consultar` | R25, R26, R27, R28 |
| 9 | La persona de baja, inactiva o bloqueada sigue siendo responsable; quien LEE la filtra | R21, R22 |
| 10 | Un pedido puede no tener responsables, y quedarse sin el último no lo cambia | R18 |
| 11 | Las asignaciones se conservan si el pedido se da de baja | R19, R20 |
| 12 | Identificadores de la base en inglés y `snake_case` | R24 |
| 13 | `created_at` y `updated_at` en las tablas nuevas | R23 |
| 14 | RLS activada y forzada en las tablas nuevas | R33 |
| 15 | Migración con `down.sql` que revierte al esquema exacto anterior, y falla antes que perder o inventar un dato | R34, R35 |
| 16 | No hay E2E nuevo; los existentes tienen que seguir verdes | R36 |
| 17 | Ninguna librería nueva | R37 |

## Preguntas abiertas

Dos, y **ninguna bloquea el modelo**: las dos son reglas de caso de uso y su sitio es **QC-87**.
Se escriben aquí para que no se descubran escribiendo la pantalla.

1. Volver a aplicar al mismo pedido un grupo que ya se le aplicó —y que entretanto ganó gente—,
   ¿refresca la lista de responsables o no hace nada? El modelo admite las dos.
2. ¿Qué estados de pedido admiten asignación? Un pedido `ENTREGADO` o `CANCELADO` no debería
   poder ganar responsables, pero eso es una transición y las transiciones son de QC-34/QC-87.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-11 | ¿Dónde vive esto? | **Módulo nuevo `asignaciones`**, carpeta propia con barril público y `/// @module asignaciones` en sus tablas. Conoce el pedido, la persona y el grupo **por contrato público**, nunca por sus tablas ni sus repositorios. Es lo que dice la ficha del board y lo que hace coherente el permiso; meterlo en `pedidos` dejaría un módulo con permisos de otro nombre y QC-88 acabaría pidiendo su sitio igual |
| 2026-09-11 | ¿Hasta dónde llega la ficha? | **Modelo + migración + permisos + armazón del módulo** (barril público y tipos). **Sin caso de uso, sin service, sin Server Action y sin pantalla**: mismo límite que **QC-47** y **QC-83**. Asignar y desasignar de verdad es **QC-87** |
| 2026-09-11 | Si la misma persona llega por dos caminos —suelta y en un grupo, o en dos grupos—, ¿qué recuerda el pedido? | **Un solo origen: gana el primero que la trajo.** Una fila por persona y pedido, sin deduplicar en ninguna lectura. **El precio queda escrito**: el pedido no sabrá que Ana también estaba en «Planta 2», y si se quita «Turno noche» Ana se va con él |
| 2026-09-11 | ¿Qué pasa con las personas de un grupo cuando se quita ese grupo del pedido? | **Se van con el grupo.** Quitar «Turno noche» saca a las personas marcadas con ese grupo, que es lo que espera quien lo quita. Quien tenga que quedarse se marca **suelta** |
| 2026-09-11 | ¿Se puede sacar a UNA persona que vino dentro de un grupo? | **Sí, persona a persona.** El pedido queda con el grupo aplicado pero sin ella, y la tabla tiene que poder representarlo. **La fila se borra de verdad**: excepción explícita al borrado lógico de **QC-4**, heredada de **QC-83 dec. 4**. El histórico que importa es el congelado, no el rastro de quién estuvo un rato |
| 2026-09-11 | ¿Alguien de la empresa A puede acabar asignado a un pedido con gente de la empresa B? | **No, y lo impide la BASE.** La fila lleva **`company_id`** y la base rechaza asignar a una persona de otra empresa o aplicar un grupo ajeno. Decisión 1 de **QC-83** traída entera, y por el mismo motivo: sin ella, un seed o un bug mete la fila y **QC-88 muestra pedidos ajenos sin que nada se ponga rojo**. **Aviso**: `orders` **no tiene `company_id`** hoy —el multi-empresa es la épica **QC-46**—, así que la coherencia que esta ficha puede exigir es **persona ↔ grupo ↔ fila**; el triángulo se cierra con el pedido cuando llegue QC-46 |
| 2026-09-11 | ¿Qué se congela exactamente al aplicar un grupo? | **Las personas que el grupo tenía en ese momento**, más la **marca de que vinieron de un grupo**, el **grupo** y **su nombre tal como se llamaba entonces**. Renombrar o dar de baja el grupo después **no toca** ninguna asignación ya hecha |
| 2026-09-11 | ¿Qué permisos trae el módulo y quién nace con ellos? | **`asignaciones.consultar`** («ver los pedidos que tengo asignados») y **`asignaciones.modificar`** («asignar y desasignar»), en el catálogo cerrado y en el seed. **El Operador nace con `consultar`** y **el Administrador recibe los dos** —si un permiso queda sin rol, `guard-permisos-sembrados` se pone roja—. **Al Operador no se le da `recetas.consultar`**: hoy ese permiso abre también el formulario de edición, que es justo lo que QC-63 prohíbe. Heredado de **QC-74** |
| 2026-09-11 | Una persona dada de baja, `inactive` o `blocked`, ¿sigue siendo responsable de sus pedidos? | **Sigue. Quien LEE la filtra.** Heredado de **QC-83 dec. 2**: la asignación está congelada y reactivar una cuenta no obliga a reasignar nada |
| 2026-09-11 | ¿Un pedido puede no tener responsables? | **Sí**, y es el estado de todos los pedidos que ya existen. Quedarse sin el último responsable **no** cambia el pedido |
| 2026-09-11 | ¿Qué pasa con las asignaciones si el pedido se da de baja? | **Se conservan.** El pedido tiene borrado lógico (**QC-33 dec. 19**) y su asignación es parte de su historia |
| 2026-09-11 | Identificadores de la base | **Inglés** y `snake_case`. Heredado de **QC-4**, **QC-47**, **QC-83** |
| 2026-09-11 | Marcas de tiempo | `created_at` y `updated_at` en las tablas nuevas. Heredado de **QC-4**, **QC-47**, **QC-83** |
| 2026-09-11 | RLS | **Activada y forzada** en las tablas nuevas. La frontera real sigue siendo el **service** (`docs/architecture.md > Acceso a datos y autorizacion`), no la policy. Heredado de **QC-47**, **QC-83** |
| 2026-09-11 | Migración | Con su **`down.sql`**, que revierte al **esquema exacto anterior**; si revertir obligara a perder o inventar un dato, la reversión **falla** en vez de hacerlo. Heredado de **QC-47 R25/R26** |
| 2026-09-11 | ¿Hace falta E2E? | **No hay E2E nuevo.** Ficha de modelo, sin pantalla que recorrer; los existentes tienen que **seguir verdes**. El E2E del flujo del Operador es de **QC-87**/**QC-88** |
| 2026-09-11 | ¿Librería nueva? | **Ninguna** |
