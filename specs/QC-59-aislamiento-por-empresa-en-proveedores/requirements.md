# QC-59 — aislamiento-por-empresa-en-proveedores · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **`depends_on`** `QC-48`, `QC-49` ·
> **Rama** `feature/QC-59-aislamiento-por-empresa-en-proveedores`
>
> **Alcance.** Los proveedores y las líneas de su catálogo pasan a pertenecer cada uno a una
> empresa. Toda consulta y toda escritura de proveedores se limitan a la empresa de quien pide, y
> leer o modificar un proveedor de otra empresa se rechaza aunque se conozca su identificador. Una
> línea solo puede apuntar a una presentación de su propia empresa, y a una unidad de sistema o de
> su empresa. Es el **último módulo del arco multiempresa**: inventario lo aisló QC-49, unidades
> QC-76, pedidos QC-60 y recetas QC-50.
>
> **Lo que NO entra.** La guardia de esquema que exige empresa en toda tabla de negocio
> (**QC-61**, que esta ficha desbloquea) y la limpieza del residuo de tests (**QC-77**).
>
> Sembrado por `/afinar-feature` el 2026-09-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). Las referencias `[D<n>]` apuntan a la fila `n` de
`## Decisiones cerradas (no reabrir)`, contadas de arriba abajo tal y como el humano las dejó
escritas. **La tabla tiene 19 filas**, así que el rango es `[D1]`–`[D19]`.

**«El sistema»** aquí son cinco cosas y ninguna más:

1. la **capa de persistencia** —el esquema Prisma (`db/schema.prisma`, modelos `Supplier`,
   `SupplierCatalogLine` y, para la clave candidata de `[D5]`, `Presentation`) más la base Postgres
   con la migración nueva de esta feature aplicada—;
2. el **módulo `proveedores`** tal y como existe hoy: su contrato público (`index.ts`), sus **nueve**
   casos de uso, sus **dos** puertos de repositorio (`SupplierRepository`,
   `SupplierCatalogRepository`), sus **dos** adaptadores driven de persistencia
   (`supplier-prisma.ts`, `supplier-catalog-line-prisma.ts`) y sus **dos** archivos de Server Actions
   (`supplier-actions.ts`, `supplier-catalog-actions.ts`);
3. la **frontera** de ese módulo con `identity`, de donde salen el actor (`getSessionUser()`) y la
   empresa (`getSessionContext()`, QC-48), con la lectura única por petición de **QC-104**;
4. la **única costura nueva** que `proveedores` pasa a consumir, `UnitCatalog.findRefs` de
   `unidades`, que **ya llegó acotada** desde QC-50 y que esta ficha empieza a usar `[D6]`;
5. las **dos pantallas** que ya consumen el módulo: la lista bajo `SUPPLIERS_ROUTE` y el detalle
   `SUPPLIERS_ROUTE/[id]`.

Cuando un requisito dice «rechazar **en la propia base de datos**» habla de la garantía que deja la
migración: se prueba con un `INSERT`/`UPDATE` directo contra la base de test, no con una llamada a un
caso de uso. Cuando dice «rechazar **en el service**» habla del caso de uso, que es la frontera real
(`docs/architecture.md > Acceso a datos y autorizacion`, `[D12]`): esa es la que cierra el requisito,
y la de la base es adicional.

### Esquema, migración y reversión

**R1.** El sistema DEBE persistir, para cada **proveedor**, la empresa a la que pertenece, en una
columna **obligatoria** con clave foránea a `companies`; SI se intenta persistir un proveedor **sin**
empresa, o con una empresa que no corresponde a ninguna existente, ENTONCES el sistema DEBE rechazar
la operación en la propia base de datos y NO DEBE crear ni modificar ninguna fila. `[D1]`

**R2.** El sistema DEBE persistir también, para cada **línea del catálogo**, su propia empresa, en una
columna **obligatoria** con clave foránea a `companies`; SI se intenta persistir una línea **sin**
empresa, ENTONCES el sistema DEBE rechazar la operación en la propia base de datos. La línea **sí**
lleva columna propia, a diferencia de la línea de receta de QC-50, porque es el **origen** de las dos
claves foráneas compuestas de R4 y R5. `[D1]`

**R3.** El sistema DEBE crear una clave candidata **única y total** sobre `(empresa, identificador)`
en `suppliers` y otra en `presentations`, cuyo **único** fin es ser el destino de las claves foráneas
compuestas de R4 y R5; NO DEBE crearlas parciales —una clave foránea no puede apuntar a un índice
parcial— y NO DEBE borrar, renombrar ni alterar ninguna otra restricción de esas dos tablas. `[D5]`

**R4.** SI se intenta persistir una línea de catálogo cuya empresa **no** es la del proveedor al que
apunta, ENTONCES el sistema DEBE rechazar la operación **en la propia base de datos**, contra una
**clave foránea compuesta** `(empresa, proveedor)` y no contra una comprobación previa al vuelo ni
contra un disparador; y NO DEBE existir ningún camino —`INSERT`, `UPDATE` de la empresa o `UPDATE` del
proveedor— por el que los dos datos puedan quedar contradiciéndose. `[D2]`

**R5.** SI se intenta persistir una línea de catálogo que apunta a una **presentación de otra
empresa**, ENTONCES el sistema DEBE rechazar la operación **en la propia base de datos**, contra una
**clave foránea compuesta** `(empresa, presentación)`, **sin ejecutar ninguna consulta** hacia
`inventario` y sin preguntar nada a ningún otro módulo; y DEBE seguir **aceptando** una presentación
de la propia empresa. `[D3]`

**R6.** CUANDO el rechazo de R5 llega al adaptador, el sistema NO DEBE escribir ninguna fila, NO DEBE
revelar dato alguno de la presentación ajena —ni su nombre, ni su existencia, ni la de su empresa— y
NO DEBE inventar ningún código de error nuevo en el catálogo cerrado del repositorio. `[D3]`

**R7.** CUANDO se aplica la migración de esta feature, **todas** las filas ya existentes de
`suppliers` y de `supplier_catalog_lines` —incluidas las de borrado lógico— DEBEN quedar asignadas a
la empresa «QuimiCloud»; y SI esa empresa no puede identificarse de forma unívoca, ENTONCES la
migración DEBE **abortar entera** y NO DEBE dejar ninguna columna, índice, restricción ni clave
candidata a medias. `[D10]`

**R8.** La migración de esta feature NO DEBE borrar ni modificar ninguna fila de `companies`,
`suppliers`, `supplier_catalog_lines` ni `presentations` más allá de escribir la columna de empresa
que ella misma añade: al terminar, el número de filas de esas tablas DEBE ser exactamente el de antes,
y los **51 proveedores vivos** y **la línea viva** medidos el 2026-09-17 DEBEN seguir ahí. `[D11]`

**R9.** CUANDO termina la migración de esta feature, `suppliers` y `supplier_catalog_lines` DEBEN
tener `ROW LEVEL SECURITY` **activada y forzada** (`FORCE ROW LEVEL SECURITY`) y NO DEBEN tener
ninguna policy; y `presentations` y `companies` DEBEN quedar con el mismo régimen de RLS que tenían
antes de aplicarla. `[D14]`

**R10.** El sistema DEBE introducir los cambios de esquema de esta feature en una **migración nueva**,
NO DEBE modificar ninguna migración ya aplicada, y esa migración DEBE traer su `down.sql`; CUANDO se
revierte, el esquema DEBE quedar exactamente como estaba antes de aplicarla —sin columna, clave
candidata, clave foránea, índice ni restricción residual, con el índice único **global y parcial**
sobre el nombre normalizado de los proveedores vivos restaurado, y con la RLS activada y forzada en
las dos tablas del módulo— y NO DEBE desaparecer ninguna fila. `[D19]`

**R11.** SI al revertir la migración existe alguna fila de `suppliers` o de `supplier_catalog_lines`
cuya empresa **no** sea la que escribió el propio UP, o existen dos proveedores **vivos** de empresas
distintas que compartan el mismo nombre normalizado —lo que haría imposible recrear el índice único
global—, ENTONCES el sistema DEBE **abortar la reversión completa**, con un mensaje que diga **cuántas
filas** y **qué hacer**, y NO DEBE descartar, renombrar ni borrar ese dato en silencio. `[D19]` `[D7]`

**R12.** El sistema DEBE nombrar en **inglés** las columnas, los índices, las claves candidatas y las
restricciones que cree, renombre o borre esta feature, DEBE conservar las marcas de tiempo
`created_at`/`updated_at` de las dos tablas, y NO DEBE cambiar el régimen de borrado de ninguna: las
dos conservan su **borrado lógico** (`deleted_at`). `[D19]`

**R13.** El sistema DEBE dejar **indexada** la columna de empresa de `suppliers` y la de
`supplier_catalog_lines`, sea por un índice propio o como columna de **cabeza** de un índice
compuesto. `[D1]` `[D5]`

### El nombre de proveedor, medido dentro de la empresa

**R14.** SI se intenta persistir dos proveedores **vivos** de la **misma** empresa con el mismo nombre
normalizado, ENTONCES el sistema DEBE rechazar la operación en la propia base de datos, contra un
**índice único** y no contra una comprobación previa al vuelo; DEBE **aceptar** el mismo nombre en dos
empresas distintas; y DEBE seguir **liberando** el nombre —para su empresa— cuando el proveedor que lo
ocupaba queda con borrado lógico. `[D7]`

**R15.** El índice único del nombre de proveedor DEBE seguir siendo **PARCIAL** por
`deleted_at IS NULL` después de esta feature, y esa parcialidad DEBE quedar afirmada desde **tres
ángulos independientes** —el **texto** del SQL de la migración, el **predicado exacto** del índice leído
del catálogo de Postgres, y el **comportamiento** de R14 «dar de baja libera el nombre»—; cada una de
las tres afirmaciones DEBE ser **falsable**, es decir, DEBE ponerse en rojo si se quita el `WHERE` de
la migración. `[D7]`

**R16.** CUANDO el índice único del nombre rechaza una escritura, el adaptador DEBE traducirlo al
resultado discriminado de duplicado del puerto y el caso de uso a su error de nombre duplicado, DEBE
seguir distinguiéndolo del único de `supplier_catalog_lines` —que **nunca** se traduce a nombre de
proveedor duplicado— y NO DEBE dejar que ningún SQLSTATE ni ningún error de Prisma llegue al dominio
ni al navegador. `[D7]`

**R17.** El sistema NO DEBE cambiar la unicidad de la línea de catálogo: sigue siendo
`(proveedor, nombre normalizado, presentación)`, sigue siendo **parcial** sobre las líneas vivas, y
NO DEBE ganar la empresa como cuarta columna —el proveedor ya la implica— ni dejar de liberar su
combinación cuando la línea queda con borrado lógico. `[D8]`

### Lo que puede llevar una línea: la presentación y la unidad

**R18.** SI una línea —de un alta o de una edición— referencia una **unidad** que no es **de sistema**
ni de la empresa de quien pide, ENTONCES el sistema DEBE rechazar la operación **en el service** como
entrada inválida, sin escribir ninguna fila; DEBE **aceptar** tanto las unidades de sistema como las
de esa empresa; y DEBE seguir aceptando la **ausencia** de unidad, que es un valor válido de la línea.
`[D6]`

**R19.** CUANDO `proveedores` resuelve referencias de unidad, DEBE hacerlo por la costura que
`unidades` ya publica, pasando la empresa en cuyo nombre se pregunta, y reutilizando la **única**
definición de «de la empresa o de sistema» que `unidades` ya exporta; NO DEBE escribir una segunda
condición equivalente, NO DEBE consultar la tabla de unidades por su cuenta y esa costura NO DEBE
quedar declarada como excepción de ámbito en ningún sitio del repositorio. `[D6]`

**R20.** El sistema NO DEBE crear ningún puerto, ningún import ni ninguna consulta de `proveedores`
hacia `inventario`: la decisión 3 de QC-52 queda **intacta**, la frontera de la presentación la pone
la base (R5) y NO DEBE aparecer en el módulo ninguna marca del vínculo que QC-52 cortó —ni el tipo del
catálogo de artículos, ni una consulta a su tabla, ni su error—. La única resolución de referencias
que el módulo puede hacer es la de R19, **hacia `unidades` y hacia nadie más**. `[D4]`

### La frontera: dónde se valida y dónde vive el filtro

**R21.** El sistema DEBE hacer que el **actor** que recibe cada uno de los nueve casos de uso de
`proveedores` lleve la empresa en cuyo nombre se opera, junto con el identificador y el conjunto de
permisos; y esa empresa NO DEBE autorizar por sí sola: el permiso DEBE comprobarse **aparte y antes**,
en la primera línea del caso de uso, antes de validar la entrada y antes de tocar ningún puerto.
`[D12]` `[D16]`

**R22.** CUANDO se invoca cualquiera de las Server Actions de `proveedores`, la empresa DEBE salir del
**contexto de sesión del servidor** y nunca de la entrada del llamante; SI falta el usuario de sesión
o el contexto de sesión, ENTONCES el sistema DEBE rechazar la operación sin escribir nada; y cada
invocación DEBE leer la ficha de sesión **exactamente una vez**. `[D12]`

**R23.** El sistema DEBE definir la condición «de la empresa» **una sola vez** dentro del módulo
`proveedores`, DEBE construir a partir de esa definición **toda** consulta y **toda** escritura del
módulo —las de `suppliers` y las de `supplier_catalog_lines`—, y NO DEBE permitir que ninguna
operación de sus puertos se ejecute sin recibir la empresa en cuyo nombre se pide: una **llamada** que
la omita NO DEBE compilar, y una **implementación** que la omita —que el compilador SÍ acepta— NO DEBE
poder llegar a `dev`, por lo que el sistema DEBE rechazarla de forma **mecánica y automática**, sin
depender de revisión humana, comprobando **método a método** que cada implementación de sus puertos
declara la empresa y la lleva hasta esa definición única. `[D13]`

**R24.** El sistema NO DEBE mantener ninguna lista de excepciones de ámbito para este módulo; y SI al
terminar esta feature alguna lista de excepciones o alguna anotación de deuda del repositorio queda
**vacía** porque esta ficha la salda, ENTONCES el sistema DEBE **borrarla entera** —la constante, la
rama que la comprueba y el párrafo que la anunciaba—, en vez de dejarla vacía «por si acaso»
(`docs/architecture.md`). `[D13]`

**R25.** CUANDO se consulta el listado de proveedores en nombre de una empresa, el sistema DEBE
devolver **exactamente** los proveedores de esa empresa y NO DEBE devolver ninguno de otra; el
recuento total DEBE contar solo las filas visibles para esa empresa, y el orden, la búsqueda, los
filtros y la paginación DEBEN aplicarse dentro de ese conjunto, sin que ningún término de búsqueda ni
ningún filtro pueda ampliarlo. `[D13]`

**R26.** CUANDO se consulta el listado del catálogo de un proveedor en nombre de una empresa, el
sistema DEBE acotar **las dos** tablas: SI el proveedor pertenece a otra empresa, ENTONCES DEBE
responder **igual que ante un proveedor inexistente** y NO DEBE devolver ninguna línea; y las líneas
devueltas DEBEN ser solo las de esa empresa, con el mismo trato para el orden, la búsqueda, los
filtros, la paginación y el total que R25. `[D13]`

**R27.** SI se consulta la ficha de un proveedor cuyo identificador pertenece a **otra** empresa,
ENTONCES el sistema DEBE responder **en el service** exactamente igual que ante un proveedor
inexistente —con el código «el proveedor no existe» que el catálogo cerrado de QC-70 ya tiene—, NO
DEBE responder con un error de autorización y NO DEBE devolver ningún dato de esa fila. `[D12]`

**R28.** SI se intenta **editar** o **dar de baja** un proveedor de otra empresa, o **crear**,
**editar** o **dar de baja** una línea de catálogo de otra empresa —o colgar una línea nueva de un
proveedor de otra empresa—, ENTONCES el sistema DEBE rechazarlo **en el service** con el mismo código
«no existe» que ya usa para lo inexistente, y NO DEBE crear, modificar ni marcar como borrada ninguna
fila, ni de la empresa de quien pide ni de la otra. `[D12]`

**R29.** CUANDO se da de baja un proveedor, el arrastre de sus líneas vivas DEBE seguir ocurriendo en
la **misma** transacción y con la **misma** marca de tiempo, y DEBE ejecutarse **solo** sobre el
proveedor ya acotado a la empresa del actor; SI el proveedor no es de esa empresa, ENTONCES el sistema
NO DEBE marcar **ninguna** línea. `[D12]` `[D1]`

**R30.** CUANDO se da de alta un proveedor o una línea de catálogo, el sistema DEBE escribir en la
fila la empresa **del actor**; SI la entrada del llamante trae una empresa, ENTONCES el sistema NO
DEBE escribirla y NO DEBE tenerla en cuenta. `[D12]`

**R31.** El sistema NO DEBE exponer el identificador de empresa en la salida de su contrato público
—ni en la vista del proveedor, ni en la de la línea, ni en el estado que devuelven sus Server
Actions—: la empresa entra en la consulta y no viaja al navegador. `[D13]`

### Las imágenes de las líneas

**R32.** El sistema NO DEBE cambiar el tratamiento de la imagen de una línea de catálogo: DEBE seguir
sirviéndola por **enlace público**, NO DEBE incluir la empresa en su ruta, NO DEBE mover ni renombrar
ningún archivo ya guardado y NO DEBE convertirla en enlace privado. `[D9]`

### Permisos, empresa de baja y RLS

**R33.** El sistema DEBE seguir exigiendo los permisos que ya existen —`proveedores.consultar` para
consultar y `proveedores.modificar` para modificar—, validados **en el service**, y NO DEBE crear
ningún permiso nuevo; DEBE rechazar por igual al actor ausente, al que no trae conjunto de permisos,
al que lo trae vacío y al que no trae el código exacto, **antes** de validar la entrada y de tocar
ningún puerto. `[D16]`

**R34.** CUANDO una empresa queda marcada como borrada, el sistema NO DEBE borrar, vaciar ni alterar
ningún proveedor ni ninguna línea de catálogo de esa empresa. `[D15]`

**R35.** El sistema NO DEBE implementar el aislamiento como policy de RLS ni depender de ella para
filtrar: la RLS de `suppliers` y `supplier_catalog_lines` es defensa en profundidad, y quitarla NO
DEBE cambiar el resultado de ninguna consulta ni escritura del módulo. `[D14]`

### Ningún hueco heredado, y ninguno nuevo

**R36.** El sistema NO DEBE publicar ninguna costura de `proveedores` hacia otro módulo en esta
feature, y NO DEBE existir, al terminarla, ningún módulo distinto de `proveedores` que lea `suppliers`
o `supplier_catalog_lines` fuera del cableado de `lib/composition`; el hueco que QC-49 declaró «hasta
QC-50» sobre las presentaciones queda cerrado por R5 y NO DEBE quedar ninguna anotación en el
repositorio que siga afirmando que existe. `[D18]`

### Prueba de extremo a extremo

**R37.** El sistema DEBE cubrir con un test **E2E** sobre navegador real que, con una sesión abierta
en la empresa A: la pantalla de proveedores NO muestra ningún proveedor de la empresa B; **abrir la
URL del detalle de un proveedor de la empresa B conociendo su identificador es indistinguible de
abrir la de un identificador inexistente**; **intentar la baja de un proveedor de B sustituyendo el
identificador del campo oculto del diálogo de borrado se rechaza** y el proveedor de B sigue intacto
—con sus líneas intactas— después del intento; y un alta en la empresa A con el **mismo nombre** que
un proveedor de la empresa B se completa sin error. `[D17]`

### Límites de alcance

**R38.** El sistema NO DEBE crear en esta feature la guardia de esquema que exige empresa en toda
tabla de negocio (**QC-61**), NO DEBE borrar ni fusionar ninguna empresa residuo (**QC-77**), NO DEBE
tocar el aislamiento de `inventario` (QC-49), `unidades` (QC-76), `recetas` (QC-50) ni `pedidos`
(QC-60) más allá de la clave candidata de R3 sobre `presentations` y del uso de la costura de R19, NO
DEBE cambiar el orden por defecto, la búsqueda, los filtros, la paginación ni la forma del resultado
de los dos listados más allá de acotarlos a la empresa, y NO DEBE cambiar la firma pública de ninguna
de sus Server Actions. `[D11]` `[D4]`

**R39.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores. `[D19]`

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el requisito
que la hace testeable. **Ninguna queda sin `R<n>`.**

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| D1 | Las **dos** tablas ganan columna de empresa | R1, R2, R13, R29 |
| D2 | FK compuesta `(empresa, proveedor)` → `suppliers(empresa, id)` | R4 |
| D3 | FK compuesta `(empresa, presentación)` → `presentations(empresa, id)` | R5, R6 |
| D4 | No se reabre el acoplamiento `proveedores` → `inventario` (QC-52 D3 intacta) | R20, R38 |
| D5 | Dos claves candidatas `(empresa, id)` nuevas, en `presentations` y en `suppliers` | R3, R13 |
| D6 | La unidad se valida **en el service**: de sistema o de la empresa | R18, R19 |
| D7 | El nombre de proveedor es único **por empresa**, y su índice sigue **PARCIAL** | R14, R15, R16, R11 (su reversión) |
| D8 | La unicidad de la línea de catálogo **no cambia** | R17 |
| D9 | Las imágenes **no** se aíslan y siguen en enlace público | R32 |
| D10 | Las filas que ya existen se asignan a «QuimiCloud» | R7 |
| D11 | No se vacía nada; la limpieza es QC-77 | R8, R38 |
| D12 | La frontera se valida **en el service** | R21, R22, R27, R28, R29, R30, R33 |
| D13 | El filtro vive en **un único punto de consulta** | R23, R24, R25, R26, R31 |
| D14 | RLS `ENABLE` + `FORCE`, defensa en profundidad y no la frontera | R9, R35 |
| D15 | Los proveedores de una empresa dada de baja no se tocan | R34 |
| D16 | No nacen permisos nuevos | R33, R21 |
| D17 | Hace falta **E2E** del acceso cruzado conociendo el identificador | R37 (y R14, R25, R27, R28, que es lo que el E2E ejercita) |
| D18 | No hay hueco heredado que cerrar desde otro módulo, y no nace ninguno | R36 |
| D19 | Identificadores, marcas de tiempo, borrado y migración con `down` que aborta | R10, R11, R12, R39 |

> **Nota de conteo, para el leader.** El encargo hablaba de **18** decisiones; la tabla sembrada tiene
> **19 filas**. No se ha tocado ni reordenado ninguna: se han numerado `D1`–`D19` en el orden en que
> están escritas y **las 19 quedan citadas**. Ninguna queda huérfana.

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-17 | ¿Qué tablas ganan columna de empresa? | **Las dos: `suppliers` y `supplier_catalog_lines`.** **Se aparta a conciencia de QC-50 D2**, donde la línea de receta **no** lleva columna y hereda la de su cabecera: aquí la línea la necesita para poder ser **origen** de las claves foráneas compuestas de las dos filas siguientes |
| 2026-09-17 | ¿Cómo se impide que la empresa de la línea contradiga la de su proveedor? | **Clave foránea compuesta** `(company_id, supplier_id)` → `suppliers(company_id, id)`. Es lo que **elimina** el riesgo que motivó QC-50 D2 —dos datos que pueden contradecirse— en vez de esquivarlo no teniendo columna |
| 2026-09-17 | ¿Cómo se impide que una línea apunte a una presentación de otra empresa? | **En la base, con clave foránea compuesta** `(company_id, presentation_id)` → `presentations(company_id, id)`. La base lo vuelve **imposible**, sin un solo `SELECT` |
| 2026-09-17 | ¿Se reabre el acoplamiento entre `proveedores` e `inventario`? | **No. La decisión 3 de QC-52 queda INTACTA**: no nace ningún puerto de `proveedores` hacia `inventario`. Esa ficha quitó a propósito la consulta que resolvía referencias del catálogo de artículos y dejó escrito que volver a atarlos «contradiría la ficha entera». La frontera de la presentación la pone la base, no una pregunta entre módulos |
| 2026-09-17 | ¿Qué cuesta esa decisión? | **Dos índices únicos nuevos como destino de las claves foráneas**: `(company_id, id)` en `presentations` y en `suppliers`. Postgres exige que las columnas referenciadas sean únicas. Son **redundantes por definición** —la clave primaria ya lo garantiza— y su único fin es ese. **Uno de ellos toca una tabla de `inventario`**: verificado el 2026-09-17 que hoy no existe ninguno de los dos |
| 2026-09-17 | ¿Y la unidad de la línea? | **Se valida en el service**: las de sistema valen para todas las empresas, las de una empresa solo para esa. Heredado de **QC-50 D4** y **QC-76**, que hizo la empresa **opcional** en unidades justamente para que existan las de sistema. Una clave foránea compuesta **no puede** expresar «la de sistema o la mía»: con `company_id` en la línea, una unidad de sistema sería rechazada. **Esto sí añade una consulta de `proveedores` hacia `unidades`** —no hacia `inventario`—, y queda dicho porque roza el espíritu de QC-52 aunque no su letra. Medido: la única línea viva usa una unidad de sistema |
| 2026-09-17 | ¿El nombre de proveedor sigue siendo único global? | **No: único dentro de cada empresa.** Heredado de **QC-49 D3** y **QC-50 D7**. **El índice `suppliers_name_unique` es PARCIAL** (`WHERE deleted_at IS NULL`) y **tiene que seguir siéndolo**: si se perdiera el `WHERE`, dar de baja un proveedor dejaría su nombre **ocupado para siempre**. Es la misma trampa que QC-50 cazó al copiar el molde de QC-49, que allí era total. Medido: ningún nombre repetido hoy |
| 2026-09-17 | ¿Cambia la unicidad de la línea de catálogo? | **No.** Sigue siendo `(supplier_id, name_normalized, presentation_id)`, ya parcial: `supplier_id` implica la empresa, así que añadirla sería redundante |
| 2026-09-17 | ¿Las imágenes de las líneas se aíslan por empresa? | **No.** Siguen sirviéndose con **enlace público**. Heredado de **QC-50 D5**: son material de referencia comercial, no algo crítico. Medido: **0 líneas con imagen** |
| 2026-09-17 | ¿Qué pasa con las filas que ya existen? | **Se asignan a «QuimiCloud»**, la única empresa real. Medido el 2026-09-17: **51 proveedores vivos** y **1 línea viva**, con presentación de QuimiCloud. Heredado de **QC-49 D4**, **QC-60** y **QC-50 D8** |
| 2026-09-17 | ¿«La base se siembra limpia» significa vaciar proveedores? | **No.** No se borra ninguna fila. Heredado de **QC-49 D5**, **QC-60** y **QC-50 D9**; la limpieza del residuo de tests es **QC-77**. De las 48 empresas, solo QuimiCloud es real |
| 2026-09-17 | ¿Dónde se valida la frontera? | **En el service**, antes de tocar el repositorio. Heredado de **QC-49 D6** y de `docs/architecture.md > Acceso a datos y autorizacion`: un aislamiento implementado **solo** como policy de RLS no cuenta como implementado |
| 2026-09-17 | ¿Dónde vive el filtro por empresa? | **En un único punto de consulta del módulo**, no repetido en cada caso de uso. Heredado de **QC-49 D7**, **QC-60**, **QC-76 D15/D16** y **QC-50 D11** |
| 2026-09-17 | ¿Y la RLS? | `suppliers` y `supplier_catalog_lines` conservan `ENABLE` + **`FORCE ROW LEVEL SECURITY`**, que la guardia `guard-rls-force` ya exige. Defensa en profundidad, **no** la frontera. Heredado de **QC-49 D8** |
| 2026-09-17 | ¿Qué pasa con los proveedores de una empresa dada de baja? | **No se tocan.** Heredado de **QC-49 D9**, **QC-76 D29** y **QC-50 D13** |
| 2026-09-17 | ¿Nacen permisos nuevos? | **No.** Siguen siendo `proveedores.consultar` y `proveedores.modificar`. Heredado de **QC-49 D10** |
| 2026-09-17 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` lo pide para permisos y esto es la misma familia: un fallo aquí es una **fuga de datos entre clientes**. Cubre que alguien de la empresa A no ve ni toca los proveedores de la B ni conociendo el identificador. Heredado de **QC-49 D11**, **QC-60** y **QC-50 D15** |
| 2026-09-17 | ¿Hay algún hueco heredado que cerrar desde otro módulo? | **No, y se verificó en el código**: ningún módulo lee `proveedores` desde fuera —solo el cableado de `lib/composition`—. Se dice explícitamente porque **QC-50 sí tenía uno** (pedido → receta, que QC-60 dejó abierto) y porque esta ficha **deja de tener** el que QC-49 declaró «hasta QC-50»: ese ya está cerrado |
| 2026-09-17 | ¿Identificadores, marcas de tiempo y borrado? | **Identificadores en inglés**, `created_at`/`updated_at`/`deleted_at` y **borrado lógico**, como todo el repo desde la 4. La migración lleva **`down.sql` que aborta** si encuentra datos que no podría revertir, heredado de **QC-50 D16** |
