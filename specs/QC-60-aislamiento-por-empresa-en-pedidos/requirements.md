# QC-60 — aislamiento-por-empresa-en-pedidos · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** `QC-48` (`done`) ·
> **Rama** `feature/QC-60-aislamiento-por-empresa-en-pedidos`
>
> ## Alcance
>
> La tabla `orders` gana `company_id` **NOT NULL** con clave foránea a `companies`. Toda consulta
> y toda escritura del módulo `pedidos` se limitan a la empresa de la sesión, y leer o modificar un
> pedido de otra empresa **se rechaza aunque se conozca el identificador**.
>
> El **correlativo pasa a medirse dentro de la empresa**: la unicidad va de `(año, secuencia)` a
> `(empresa, año, secuencia)`. El enlace de `order_assignments` hacia el pedido pasa a ser
> **compuesto** `(pedido, empresa)`. Migración con su `down.sql` y backfill de las filas vivas a
> «QuimiCloud». Lleva **E2E**.
>
> ## Lo que NO entra
>
> - **Las recetas** → **QC-50**, y con ellas la coherencia pedido→receta (ver *Preguntas
>   abiertas* 1). Esta ficha **declara el hueco, no lo cierra**.
> - **La guardia de esquema** que exige empresa en toda tabla de negocio → **QC-61**.
> - **La limpieza de las 47 empresas residuo de tests** → **QC-77**; aquí se asignan, no se borran.
> - **Inventario** ya lo aisló **QC-49**, **unidades** **QC-76**, y **proveedores** es **QC-59**.
>
> _Sembrado por `/afinar-feature` el 2026-09-15. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí son cinco cosas y ninguna más:

1. la **capa de persistencia** —el esquema Prisma (`db/schema.prisma`, modelos `Order` y
   `OrderAssignment`) más la base Postgres con la migración nueva de esta feature aplicada—;
2. el **módulo `pedidos`** tal y como existe hoy: su contrato público (`index.ts`), sus seis casos de
   uso, su puerto de repositorio (`OrderRepository`), su puerto de costura hacia otros módulos
   (`OrderCatalog`), sus dos adaptadores driven de persistencia y sus seis Server Actions;
3. la **frontera** de ese módulo con `identity`, de donde salen el actor (`getSessionUser()`) y la
   empresa (`getSessionContext()`, QC-48);
4. la **frontera con `asignaciones`**, dueño de `order_assignments`, cuya clave foránea hacia el
   pedido esta ficha convierte en compuesta (decisión cerrada 5);
5. la **pantalla** que ya consume el módulo: `app/(private)/pedidos`.

Cuando un requisito dice «rechazar **en la propia base de datos**» habla de la garantía que deja la
migración: se prueba con un `INSERT`/`UPDATE` directo contra la base de test, no con una llamada a un
caso de uso. Cuando dice «rechazar **en el service**» habla del caso de uso, que es la frontera real
(`docs/architecture.md > Acceso a datos y autorizacion`): esa es la que cierra el requisito, y la de
la base es adicional.

### Esquema, migración y reversión

**R1.** El sistema DEBE persistir, para cada **pedido**, la empresa a la que pertenece, en una columna
**obligatoria** con clave foránea a `companies`; SI se intenta persistir un pedido **sin** empresa, o
con una empresa que no corresponde a ninguna existente, ENTONCES el sistema DEBE rechazar la operación
en la propia base de datos y NO DEBE crear ni modificar ninguna fila.

**R2.** CUANDO se aplica la migración de esta feature, **todas** las filas ya existentes de `orders`
—incluidas las canceladas y las de borrado lógico— DEBEN quedar asignadas a la empresa «QuimiCloud»; y
SI esa empresa no puede identificarse de forma unívoca, ENTONCES la migración DEBE **abortar entera** y
NO DEBE dejar ninguna columna, índice, restricción ni función a medias.

**R3.** La migración de esta feature NO DEBE borrar ni modificar ninguna fila de `companies`, `orders`
ni `order_assignments` más allá de escribir la columna de empresa que ella misma añade: al terminar, el
número de filas de las tres tablas DEBE ser exactamente el de antes.

**R4.** CUANDO termina la migración de esta feature, `orders` DEBE tener `ROW LEVEL SECURITY`
**activada y forzada** (`FORCE ROW LEVEL SECURITY`) y NO DEBE tener ninguna policy; y `order_assignments`
DEBE conservar el régimen de RLS que ya tenía.

**R5.** El sistema DEBE introducir los cambios de esquema de esta feature en una **migración nueva**, NO
DEBE modificar ninguna migración ya aplicada, y esa migración DEBE traer su `down.sql`; CUANDO se
revierte, el esquema DEBE quedar exactamente como estaba antes de aplicarla —sin columna, índice,
restricción, función ni disparador residual, con el índice único **global** `(año, secuencia)`
restaurado, con la clave foránea **simple** de `order_assignments` hacia el pedido restaurada y con la
RLS activada y forzada— y NO DEBE desaparecer ninguna fila.

**R6.** SI al revertir la migración existe alguna fila de `orders` cuya empresa **no** sea la que
escribió el propio UP, o existen dos pedidos —vivos, cancelados o borrados— que compartan la pareja
`(año, secuencia)`, lo que haría imposible recrear el índice único global, o existe alguna asignación
cuya empresa no coincida con la del pedido al que apunta, ENTONCES el sistema DEBE **abortar la
reversión completa** y NO DEBE descartar ese dato en silencio.

**R7.** CUANDO termina la reversión, el estado del contador **global** por año DEBE quedar coherente
con las filas que existan, de modo que el primer pedido dado de alta después de revertir NO DEBE
recibir una pareja `(año, secuencia)` que ya esté escrita en `orders`.

**R8.** El sistema DEBE nombrar en **inglés** la columna, los índices, las restricciones y las funciones
que cree, renombre o borre esta feature, y DEBE conservar las marcas de tiempo `created_at`/`updated_at`
que `orders` y `order_assignments` ya tienen.

**R9.** El sistema NO DEBE cambiar el régimen de borrado de ninguna de las dos tablas: `orders` conserva
su **borrado lógico** y `order_assignments` sigue **sin** marca de borrado, y esta feature NO DEBE
añadir ni quitar ninguna.

**R10.** El sistema DEBE dejar **indexada** la columna de empresa de `orders`, sea por un índice propio
o como columna de cabeza de un índice compuesto.

### El correlativo, medido dentro de la empresa

**R11.** SI se intenta persistir dos pedidos de la **misma** empresa con el mismo año y la misma
posición, ENTONCES el sistema DEBE rechazar la operación en la propia base de datos, contra un **índice
único** y no contra una comprobación previa al vuelo; y DEBE **aceptar** la misma pareja `(año,
posición)` en dos empresas distintas.

**R12.** CUANDO se da de alta un pedido, la posición que recibe DEBE ser la **siguiente a la más alta
que ya exista** para **esa** empresa y **ese** año —contando también los pedidos cancelados y los de
borrado lógico, cuyo número no se libera ni se reutiliza—; y SI esa empresa no tiene ningún pedido de
ese año, ENTONCES la posición DEBE ser **1**.

**R13.** CUANDO se aplica la migración de esta feature, los pedidos ya existentes DEBEN **conservar** el
año y la posición que tienen —37, 44 y 77 de 2026— y NO DEBEN renumerarse; y el primer pedido que se dé
de alta después para esa empresa y ese año NO DEBE recibir ninguna de esas tres posiciones ni ninguna
inferior a la más alta.

**R14.** MIENTRAS varias altas de la **misma** empresa y el **mismo** año se ejecutan a la vez, el
sistema DEBE entregar a cada una una posición **distinta**, DEBE completarlas todas y NO DEBE rechazar
ninguna por duplicado; y dos altas de **empresas distintas** NO DEBEN esperarse entre sí.

**R15.** SI aun así el índice único del correlativo rechaza una pareja, ENTONCES el adaptador DEBE
traducirlo a un **resultado discriminado** del puerto y el caso de uso a su error de duplicado, y NO
DEBE dejar que ningún SQLSTATE ni ningún error de Prisma llegue al dominio ni al navegador.

### La frontera: dónde se valida y dónde vive el filtro

**R16.** El sistema DEBE hacer que el **actor** que recibe cada uno de los seis casos de uso de
`pedidos` lleve la empresa en cuyo nombre se opera, junto con el identificador y el conjunto de
permisos; y esa empresa NO DEBE autorizar por sí sola: el permiso DEBE comprobarse **aparte y antes**,
en la primera línea del caso de uso, antes de validar la entrada y antes de tocar ningún puerto.

**R17.** CUANDO se invoca cualquier adaptador driving de `pedidos`, la empresa DEBE salir del **contexto
de sesión del servidor** y nunca de la entrada del llamante; SI falta el usuario de sesión o el contexto
de sesión, ENTONCES el sistema DEBE rechazar la operación sin consultar el repositorio.

**R18.** El sistema DEBE definir la condición «de la empresa» **una sola vez** dentro del módulo
`pedidos`, DEBE construir a partir de esa definición **toda** consulta y **toda** escritura del módulo
—incluidas las que hoy se escriben en SQL crudo—, y NO DEBE permitir que ninguna operación de sus
puertos se ejecute sin recibir la empresa en cuyo nombre se pide: una **llamada** que la omita NO DEBE
compilar, y una **implementación** que la omita —que el compilador SÍ acepta— NO DEBE poder llegar a
`dev`, por lo que el sistema DEBE rechazarla de forma **mecánica y automática**, sin depender de
revisión humana, comprobando **método a método** que cada implementación de sus puertos declara la
empresa y la lleva hasta esa definición única.

**R19.** CUANDO se consulta el listado de pedidos en nombre de una empresa, el sistema DEBE devolver
**exactamente** los pedidos de esa empresa y NO DEBE devolver ninguno de otra; el recuento total DEBE
contar solo las filas visibles para esa empresa, y el orden, los filtros y la paginación DEBEN aplicarse
dentro de ese conjunto.

**R20.** SI se consulta la ficha de un pedido cuyo identificador pertenece a **otra** empresa, ENTONCES
el sistema DEBE responder **en el service** exactamente igual que ante un pedido inexistente —con el
código «el pedido no existe» que el catálogo cerrado de QC-70 ya tiene—, NO DEBE responder con un error
de autorización y NO DEBE devolver ningún dato de esa fila, ni siquiera su correlativo o su estado.

**R21.** SI se intenta **editar**, **cancelar** o **borrar** un pedido de otra empresa, ENTONCES el
sistema DEBE rechazarlo **en el service** con el mismo código «el pedido no existe» y NO DEBE crear,
modificar ni marcar como borrada ninguna fila, ni de la empresa de quien pide ni de la otra.

**R22.** CUANDO se da de alta un pedido, el sistema DEBE escribir en la fila la empresa **del actor**;
SI la entrada del llamante trae una empresa, ENTONCES el sistema NO DEBE escribirla, NO DEBE tenerla en
cuenta y DEBE rechazar la entrada por campo desconocido.

**R23.** El sistema NO DEBE exponer el identificador de empresa en la salida de su contrato público —ni
en la vista del pedido, ni en el resumen de la lista, ni en el estado que devuelven sus Server
Actions—: la empresa entra en la consulta y no viaja al navegador.

**R24.** CUANDO se calcula la posición del correlativo de un alta, el sistema DEBE calcularla sobre la
**misma** empresa que escribe en la fila: NO DEBE poder numerarse un pedido en la serie de una empresa y
guardarse en otra.

### El enlace con `asignaciones`

**R25.** El enlace de una asignación hacia su pedido DEBE ser **compuesto** por pedido y empresa: SI se
intenta persistir una asignación cuya empresa no coincida con la del pedido al que apunta, ENTONCES el
sistema DEBE rechazar la operación en la propia base de datos y NO DEBE crear ni modificar ninguna fila.

**R26.** El sistema DEBE conservar intacto todo lo demás que `order_assignments` ya garantiza —las dos
claves foráneas compuestas hacia `users` y `work_groups`, el `MATCH SIMPLE` de la del grupo, el `CHECK`
que ata el nombre del grupo a su identificador, la clave primaria `(pedido, persona)` y la ausencia de
marca de borrado— y NO DEBE emitir ningún `DROP CONSTRAINT` sobre ellos, ni aunque lo proponga la
herramienta que genera la migración.

**R27.** CUANDO otro módulo consulta un pedido por el servicio que `pedidos` publica para eso, el
sistema DEBE acotar esa consulta a la empresa en cuyo nombre se pregunta, y un pedido de otra empresa
DEBE responderse **igual que uno inexistente**.

### Permisos, empresa de baja y RLS

**R28.** El sistema DEBE seguir exigiendo los permisos que ya existen —`pedidos.consultar` para
consultar y `pedidos.modificar` para modificar—, validados **en el service**, y NO DEBE crear ningún
permiso nuevo; DEBE rechazar por igual al actor ausente, al que no trae conjunto de permisos, al que lo
trae vacío y al que no trae el código exacto, **antes** de validar la entrada y de tocar ningún puerto.

**R29.** CUANDO una empresa queda marcada como borrada, el sistema NO DEBE borrar, vaciar ni alterar
ningún pedido ni ninguna asignación de esa empresa.

**R30.** El sistema NO DEBE implementar el aislamiento como policy de RLS ni depender de ella para
filtrar: la RLS de `orders` es defensa en profundidad, y quitarla NO DEBE cambiar el resultado de
ninguna consulta ni escritura del módulo.

### Prueba de extremo a extremo

**R31.** El sistema DEBE cubrir con un test **E2E** sobre navegador real que, con una sesión abierta en
la empresa A: la pantalla de pedidos NO muestra ningún pedido de la empresa B; un intento de **borrar**
un pedido de la empresa B **conociendo su identificador** se rechaza con un mensaje de error a la vista;
el pedido de la empresa B sigue intacto después del intento; y un alta en la empresa A obtiene su propio
correlativo sin que la numeración de la empresa B lo desplace.

### Límites de alcance

**R32.** El sistema NO DEBE añadir columna de empresa, filtro ni rechazo cruzado a `recipes` ni a
`recipe_lines`: eso es **QC-50**. En consecuencia —y queda **declarado, no cerrado**— un pedido de la
empresa A DEBE poder seguir apuntando a una receta de la empresa B, y el sistema NO DEBE comprobar esa
coherencia en ningún punto de esta feature.

**R33.** El sistema NO DEBE crear en esta feature la guardia de esquema que exige empresa en toda tabla
de negocio (**QC-61**), NO DEBE borrar ni fusionar ninguna de las 48 empresas (**QC-77**), y NO DEBE
tocar el aislamiento de `inventario` (QC-49), `unidades` (QC-76) ni `proveedores` (QC-59).

**R34.** El sistema NO DEBE cambiar el orden por defecto, los filtros, la paginación ni la forma del
resultado del listado de pedidos más allá de acotarlo a la empresa, NO DEBE cambiar la firma pública de
ninguna de sus Server Actions, y NO DEBE cambiar la firma de ninguno de los seis casos de uso más allá
de la empresa que entra dentro del actor.

**R35.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los requisitos
anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el requisito
que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Entra **solo `orders`**; no hay tabla de líneas | R1, R2, R33 |
| 2 | El correlativo es **por empresa**: `(empresa, año, secuencia)` | R11, R14, R24 |
| 3 | Los pedidos que ya existen **no se renumeran** (37, 44, 77) | R12, R13 |
| 4 | La coherencia pedido → receta **se declara, no se cierra** | R32 |
| 5 | El enlace de `order_assignments` pasa a **compuesto** | R25, R26, R5 (su reversión) |
| 6 | Las filas que ya existen se asignan a «QuimiCloud» | R2 |
| 7 | No se vacía nada; la limpieza es QC-77 | R3, R33 |
| 8 | La frontera se valida **en el service** | R16, R17, R20, R21, R28, R30 |
| 9 | El filtro vive en **un único punto de consulta** | R18, R19, R27 |
| 10 | RLS `ENABLE` + `FORCE`, defensa en profundidad y no la frontera | R4, R5, R30 |
| 11 | Los pedidos de una empresa dada de baja no se tocan | R29 |
| 12 | No nacen permisos nuevos | R28 |
| 13 | Hace falta **E2E** del acceso cruzado conociendo el identificador | R31 (y R19, R20, R21, que es lo que el E2E ejercita) |
| 14 | Identificadores en inglés, marcas de tiempo y borrado heredados | R8, R9 |

## Preguntas abiertas

Las tres que pedían decisión humana **se cerraron el 2026-09-15 al acotar** y están abajo, en la
tabla de decisiones. Quedan dos, y las dos son **informativas**: no piden decisión, avisan.

**1. La ventana pedido → receta queda abierta hasta QC-50.** `orders.recipe_id` apunta a `recipes`,
que **no tienen empresa** (`db/schema.prisma:743`). A partir de esta ficha, un pedido de la empresa
A puede seguir apuntando a una receta de la B si alguien teclea el identificador. Es exactamente el
mismo patrón que QC-49 dejó escrito para `ProductCatalog.findRefs` y para
`supplier_catalog_lines.presentation_id`: consecuencia declarada, con ficha destinataria. **QC-50
no está acotada ni tiene fecha**, así que la ventana no tiene cierre previsto.

**2. El residuo de tests está creciendo, con QC-77 ya `done`.** QC-49 contó **37 empresas** el
2026-09-11; el 2026-09-15 hay **48**. El backfill de esta ficha no se ve afectado —solo QuimiCloud
tiene pedidos— pero la limpieza que QC-77 prometió no está ocurriendo, y quien mida «una sola
empresa real» en una ficha futura se va a encontrar el mismo ruido.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-15 | ¿Qué tablas entran? | **Solo `orders`.** La ficha decía «y sus lineas» y **eso es falso**: no existe ninguna tabla de líneas de pedido. Un pedido es una receta más una cantidad (`db/schema.prisma:1080`). La `description` del board se corrigió antes de sembrar |
| 2026-09-15 | ¿El número de pedido es por empresa? | **Sí, cada empresa lleva el suyo.** La unicidad pasa de `(año, secuencia)` a `(empresa, año, secuencia)`. Hoy el contador es **uno solo** y los huecos de la numeración delatan cuántos pedidos hace el vecino |
| 2026-09-15 | ¿Se renumeran los pedidos que ya existen? | **No.** Medido en la base el 2026-09-15: 3 pedidos vivos, los tres de QuimiCloud, con los correlativos **37, 44 y 77** de 2026 —los huecos los gastaron las corridas de test—. QuimiCloud continúa desde donde va; «empieza en 1» es para la empresa que todavía no tiene ninguno |
| 2026-09-15 | ¿Y la coherencia pedido → receta? | **Se declara el hueco, no se cierra aquí.** Hasta **QC-50** un pedido de A puede apuntar a una receta de B. **No se añade `depends_on: QC-50`**: la alternativa era aplazar esta ficha dos fichas más. Mismo patrón que **QC-49** con `findRefs` |
| 2026-09-15 | ¿Entra el enlace de `order_assignments`? | **Sí, compuesto `(pedido, empresa)`,** como ya son los de persona y grupo en esa misma tabla. Lo dejó apuntado el propio esquema (`OJO 2` de `OrderAssignment`), que dice que la FK es simple **solo** porque `orders` no tenía empresa y que eso «es la épica QC-46», o sea ésta. Hoy cuesta cero: **0 asignaciones guardadas**. Toca una tabla del módulo `asignaciones`, y es deliberado |
| 2026-09-15 | ¿Qué pasa con las filas que ya existen? | **Se asignan a «QuimiCloud»**, la única empresa real de las 48. Heredado de **QC-49 D4** |
| 2026-09-15 | ¿«La base se siembra limpia» significa vaciar pedidos? | **No.** No se borra ninguna fila. Heredado de **QC-49 D5**; la limpieza del residuo es **QC-77** |
| 2026-09-15 | ¿Dónde se valida la frontera? | **En el service**, antes de tocar el repositorio. Heredado de **QC-49 D6** y de `docs/architecture.md > Acceso a datos y autorizacion`: un aislamiento implementado **solo** como policy de RLS no cuenta como implementado, y la empresa que viaja firmada en la sesión (QC-48) tampoco autoriza por sí sola |
| 2026-09-15 | ¿Dónde vive el filtro por empresa? | **En un único punto de consulta del módulo**, no repetido en cada caso de uso. Heredado de **QC-49 D7** y **QC-76 D15/D16** |
| 2026-09-15 | ¿Y la RLS? | `orders` conserva `ENABLE` + **`FORCE ROW LEVEL SECURITY`**, que la guardia `guard-rls-force` ya exige. Es defensa en profundidad, **no** la frontera. Heredado de **QC-49 D8** |
| 2026-09-15 | ¿Qué pasa con los pedidos de una empresa dada de baja? | **No se tocan.** Heredado de **QC-49 D9** / **QC-76 D29** |
| 2026-09-15 | ¿Nacen permisos nuevos? | **No.** Siguen siendo `pedidos.consultar` y `pedidos.modificar`, que ya existen (`identity/domain/permissions.ts:94`). Heredado de **QC-49 D10** |
| 2026-09-15 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` lo pide para permisos y esto es la misma familia: un fallo aquí es una **fuga de datos entre clientes**. Cubre que alguien de la empresa A no ve ni toca los pedidos de la B ni conociendo el identificador. Heredado de **QC-49 D11** |
| 2026-09-15 | Identificadores, marcas de tiempo y borrado | **Heredado, no se reabre.** Identificadores de base en inglés y `created_at`/`updated_at` (QC-4). `orders` conserva su borrado lógico; esta ficha no cambia el de nadie. Heredado de **QC-49 D12** |
