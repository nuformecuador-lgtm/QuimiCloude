# QC-50 — aislamiento-por-empresa-en-recetas · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** `QC-48`, `QC-32` (`done`) ·
> **Rama** `feature/QC-50-aislamiento-por-empresa-en-recetas`
>
> ## Alcance
>
> La tabla `recipes` gana `company_id` **NOT NULL** con clave foránea a `companies`. Toda consulta y
> toda escritura del módulo `recetas` se limitan a la empresa de la sesión, y leer o modificar una
> receta de otra empresa **se rechaza aunque se conozca el identificador**.
>
> Una línea de receta solo puede usar **productos de la empresa de su receta** y **unidades de
> sistema o de esa empresa**. El nombre de receta pasa a ser **único por empresa**. Además **se
> cierra el hueco que dejó QC-60**: un pedido ya no puede apuntar a una receta de otra empresa.
> Migración con su `down.sql` y backfill de las filas vivas a «QuimiCloud». Lleva **E2E**.
>
> ## Lo que NO entra
>
> - **Pasar las fotos de receta a enlaces privados**: no se hace, por decisión (decisión cerrada 5).
> - **Proveedores** → **QC-59**.
> - **La guardia de esquema** que exige empresa en toda tabla de negocio → **QC-61**.
> - **La limpieza del residuo de tests** → **QC-77**; aquí se asignan, no se borran.
> - **Inventario** ya lo aisló **QC-49**, **unidades** **QC-76** y **pedidos** **QC-60**.
>
> _Sembrado por `/afinar-feature` el 2026-09-16. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí son seis cosas y ninguna más:

1. la **capa de persistencia** —el esquema Prisma (`db/schema.prisma`, modelos `Recipe` y `RecipeLine`)
   más la base Postgres con la migración nueva de esta feature aplicada—;
2. el **módulo `recetas`** tal y como existe hoy: su contrato público (`index.ts`), sus cinco casos de
   uso, su puerto de repositorio (`RecipeRepository`), su puerto de costura hacia otros módulos
   (`RecipeCatalog`), sus adaptadores driven de persistencia y de almacenamiento, y sus cinco Server
   Actions;
3. la **frontera** de ese módulo con `identity`, de donde salen el actor (`getSessionUser()`) y la
   empresa (`getSessionContext()`, QC-48), con la lectura única por petición de **QC-104**;
4. las **dos costuras que `recetas` consume**, `ProductCatalog.findRefs` (de `inventario`) y
   `UnitCatalog.findRefs` (de `unidades`), que esta ficha acota (decisiones cerradas 3 y 4);
5. la **costura que `recetas` publica**, `RecipeCatalog.findRefsIncludingDeleted`, y sus cuatro
   llamantes en el módulo `pedidos` (decisión cerrada 6);
6. la **pantalla** que ya consume el módulo: `app/(private)` bajo `FORMULAS_ROUTE`.

Cuando un requisito dice «rechazar **en la propia base de datos**» habla de la garantía que deja la
migración: se prueba con un `INSERT`/`UPDATE` directo contra la base de test, no con una llamada a un
caso de uso. Cuando dice «rechazar **en el service**» habla del caso de uso, que es la frontera real
(`docs/architecture.md > Acceso a datos y autorizacion`, decisión cerrada 10): esa es la que cierra el
requisito, y la de la base es adicional.

### Esquema, migración y reversión

**R1.** El sistema DEBE persistir, para cada **receta**, la empresa a la que pertenece, en una columna
**obligatoria** con clave foránea a `companies`; SI se intenta persistir una receta **sin** empresa, o
con una empresa que no corresponde a ninguna existente, ENTONCES el sistema DEBE rechazar la operación
en la propia base de datos y NO DEBE crear ni modificar ninguna fila.

**R2.** El sistema NO DEBE añadir ninguna columna de empresa a `recipe_lines`: la empresa de una línea
DEBE ser **exactamente** la de la receta a la que pertenece, y NO DEBE existir ningún camino por el que
una línea declare una empresa distinta de la de su receta ni sobreviva a su borrado —la línea sigue
cayendo con ella—.

**R3.** CUANDO se aplica la migración de esta feature, **todas** las filas ya existentes de `recipes`
—incluidas las de borrado lógico— DEBEN quedar asignadas a la empresa «QuimiCloud»; y SI esa empresa no
puede identificarse de forma unívoca, ENTONCES la migración DEBE **abortar entera** y NO DEBE dejar
ninguna columna, índice, restricción ni función a medias.

**R4.** La migración de esta feature NO DEBE borrar ni modificar ninguna fila de `companies`, `recipes`
ni `recipe_lines` más allá de escribir la columna de empresa que ella misma añade: al terminar, el
número de filas de las tres tablas DEBE ser exactamente el de antes, y las 5 recetas y las 5 líneas
medidas el 2026-09-16 DEBEN seguir ahí.

**R5.** CUANDO termina la migración de esta feature, `recipes` y `recipe_lines` DEBEN tener `ROW LEVEL
SECURITY` **activada y forzada** (`FORCE ROW LEVEL SECURITY`) y NO DEBEN tener ninguna policy.

**R6.** El sistema DEBE introducir los cambios de esquema de esta feature en una **migración nueva**, NO
DEBE modificar ninguna migración ya aplicada, y esa migración DEBE traer su `down.sql`; CUANDO se
revierte, el esquema DEBE quedar exactamente como estaba antes de aplicarla —sin columna, índice,
restricción, función ni disparador residual, con el índice único **global y parcial** sobre el nombre
normalizado de las recetas vivas restaurado, y con la RLS activada y forzada en las dos tablas— y NO
DEBE desaparecer ninguna fila.

**R7.** SI al revertir la migración existe alguna fila de `recipes` cuya empresa **no** sea la que
escribió el propio UP, o existen dos recetas **vivas** de empresas distintas que compartan el mismo
nombre normalizado —lo que haría imposible recrear el índice único global—, ENTONCES el sistema DEBE
**abortar la reversión completa** y NO DEBE descartar, renombrar ni borrar ese dato en silencio.

**R8.** El sistema DEBE nombrar en **inglés** la columna, los índices y las restricciones que cree,
renombre o borre esta feature, DEBE conservar las marcas de tiempo `created_at`/`updated_at` de las dos
tablas, y NO DEBE cambiar el régimen de borrado de ninguna: `recipes` conserva su **borrado lógico** y
`recipe_lines` sigue **sin** marca de borrado.

**R9.** El sistema DEBE dejar **indexada** la columna de empresa de `recipes`, sea por un índice propio
o como columna de cabeza de un índice compuesto.

### El nombre de receta, medido dentro de la empresa

**R10.** SI se intenta persistir dos recetas **vivas** de la **misma** empresa con el mismo nombre
normalizado, ENTONCES el sistema DEBE rechazar la operación en la propia base de datos, contra un
**índice único** y no contra una comprobación previa al vuelo; DEBE **aceptar** el mismo nombre en dos
empresas distintas; y DEBE seguir **liberando** el nombre cuando la receta que lo ocupaba queda con
borrado lógico.

**R11.** CUANDO el índice único del nombre rechaza una escritura, el adaptador DEBE traducirlo al
resultado discriminado de duplicado del puerto y el caso de uso a su error de nombre duplicado, DEBE
seguir distinguiéndolo del único `(receta, producto)` de `recipe_lines` —que **nunca** se traduce a
nombre duplicado— y NO DEBE dejar que ningún SQLSTATE ni ningún error de Prisma llegue al dominio ni al
navegador.

### La frontera: dónde se valida y dónde vive el filtro

**R12.** El sistema DEBE hacer que el **actor** que recibe cada uno de los cinco casos de uso de
`recetas` lleve la empresa en cuyo nombre se opera, junto con el identificador y el conjunto de
permisos; y esa empresa NO DEBE autorizar por sí sola: el permiso DEBE comprobarse **aparte y antes**,
en la primera línea del caso de uso, antes de validar la entrada y antes de tocar ningún puerto.

**R13.** CUANDO se invoca cualquiera de las Server Actions de `recetas`, la empresa DEBE salir del
**contexto de sesión del servidor** y nunca de la entrada del llamante; SI falta el usuario de sesión o
el contexto de sesión, ENTONCES el sistema DEBE rechazar la operación sin consultar el repositorio; y
cada invocación DEBE leer la ficha de sesión **exactamente una vez**.

**R14.** El sistema DEBE definir la condición «de la empresa» **una sola vez** dentro del módulo
`recetas`, DEBE construir a partir de esa definición **toda** consulta y **toda** escritura del módulo,
y NO DEBE permitir que ninguna operación de sus puertos se ejecute sin recibir la empresa en cuyo nombre
se pide: una **llamada** que la omita NO DEBE compilar, y una **implementación** que la omita —que el
compilador SÍ acepta— NO DEBE poder llegar a `dev`, por lo que el sistema DEBE rechazarla de forma
**mecánica y automática**, sin depender de revisión humana, comprobando **método a método** que cada
implementación de sus puertos declara la empresa y la lleva hasta esa definición única.

**R15.** CUANDO se consulta el listado de recetas en nombre de una empresa, el sistema DEBE devolver
**exactamente** las recetas de esa empresa y NO DEBE devolver ninguna de otra; el recuento total DEBE
contar solo las filas visibles para esa empresa, y el orden, la búsqueda, los filtros y la paginación
DEBEN aplicarse dentro de ese conjunto, sin que ningún término de búsqueda pueda ampliarlo.

**R16.** SI se consulta la ficha de una receta cuyo identificador pertenece a **otra** empresa, ENTONCES
el sistema DEBE responder **en el service** exactamente igual que ante una receta inexistente —con el
código «la receta no existe» que el catálogo cerrado de QC-70 ya tiene—, NO DEBE responder con un error
de autorización y NO DEBE devolver ningún dato de esa fila, ni su nombre, ni sus pasos, ni sus líneas,
ni la ruta de su imagen.

**R17.** SI se intenta **editar** o **borrar** una receta de otra empresa, ENTONCES el sistema DEBE
rechazarlo **en el service** con el mismo código «la receta no existe» y NO DEBE crear, modificar ni
marcar como borrada ninguna fila, ni de la empresa de quien pide ni de la otra.

**R18.** CUANDO se da de alta una receta, el sistema DEBE escribir en la fila la empresa **del actor**;
SI la entrada del llamante trae una empresa, ENTONCES el sistema NO DEBE escribirla y NO DEBE tenerla en
cuenta.

**R19.** El sistema NO DEBE exponer el identificador de empresa en la salida de su contrato público —ni
en el detalle de la receta, ni en el resumen de la lista, ni en el estado que devuelven sus Server
Actions—: la empresa entra en la consulta y no viaja al navegador.

**R20.** CUANDO se edita una receta, la conciliación de sus líneas —borrar las que ya no están y
escribir las finales— DEBE ejecutarse **solo** sobre la receta ya acotada a la empresa del actor y
dentro de la misma transacción que la comprueba; SI la receta no es de esa empresa, ENTONCES el sistema
NO DEBE borrar, crear ni actualizar **ninguna** línea.

### Lo que puede llevar una línea: productos y unidades

**R21.** SI una línea —de un alta o de una edición— referencia un producto que no es de la empresa de la
receta, ENTONCES el sistema DEBE rechazar la operación **en el service** como entrada inválida, igual
que si el producto no existiera, y NO DEBE escribir ninguna fila de receta ni de línea.

**R22.** CUANDO `recetas` resuelve referencias de producto por la costura que `inventario` publica, esa
consulta DEBE ir acotada a la empresa en cuyo nombre se pregunta, reutilizando el punto único de ámbito
que `inventario` ya exporta; un producto de otra empresa DEBE resolverse **igual que uno inexistente**,
también al leer una ficha; y esa costura NO DEBE quedar declarada como excepción de ámbito en ningún
sitio del repositorio.

**R23.** SI una línea —de un alta o de una edición— referencia una unidad que no es **de sistema** ni de
la empresa de la receta, ENTONCES el sistema DEBE rechazar la operación **en el service** como entrada
inválida; y DEBE **aceptar** tanto las unidades de sistema como las de esa empresa.

**R24.** CUANDO `recetas` resuelve referencias de unidad por la costura que `unidades` publica, esa
consulta DEBE ir acotada reutilizando la **única** definición de «de la empresa o de sistema» que
`unidades` ya exporta, y NO DEBE escribir una segunda condición equivalente.

### El enlace con `pedidos`

**R25.** CUANDO otro módulo consulta recetas por la costura que `recetas` publica, el sistema DEBE
acotar esa consulta a la empresa en cuyo nombre se pregunta, y una receta de otra empresa DEBE
responderse **igual que una inexistente**; la baja lógica DEBE seguir viajando en la propia referencia y
NO DEBE confundirse con la ausencia.

**R26.** SI se intenta **crear** o **editar** un pedido cuya receta pertenece a otra empresa, ENTONCES
el sistema DEBE rechazarlo **en el service** con el mismo código con el que ya rechaza una receta
inexistente y NO DEBE crear ni modificar ninguna fila; y CUANDO se lee o se lista un pedido cuya receta
es de otra empresa, el sistema NO DEBE mostrar el nombre de esa receta.

### Las fotos

**R27.** El sistema NO DEBE cambiar el tratamiento de la imagen de una receta: DEBE seguir sirviéndola
por **enlace público**, NO DEBE incluir la empresa en su ruta, NO DEBE mover ni renombrar ningún archivo
ya guardado y NO DEBE convertirla en enlace privado.

### Permisos, empresa de baja y RLS

**R28.** El sistema DEBE seguir exigiendo los permisos que ya existen —`recetas.consultar` para
consultar y `recetas.modificar` para modificar—, validados **en el service**, y NO DEBE crear ningún
permiso nuevo; DEBE rechazar por igual al actor ausente, al que no trae conjunto de permisos, al que lo
trae vacío y al que no trae el código exacto, **antes** de validar la entrada y de tocar ningún puerto.

**R29.** CUANDO una empresa queda marcada como borrada, el sistema NO DEBE borrar, vaciar ni alterar
ninguna receta ni ninguna línea de esa empresa.

**R30.** El sistema NO DEBE implementar el aislamiento como policy de RLS ni depender de ella para
filtrar: la RLS de `recipes` y `recipe_lines` es defensa en profundidad, y quitarla NO DEBE cambiar el
resultado de ninguna consulta ni escritura del módulo.

### Prueba de extremo a extremo

**R31.** El sistema DEBE cubrir con un test **E2E** sobre navegador real que, con una sesión abierta en
la empresa A: la pantalla de recetas NO muestra ninguna receta de la empresa B; un intento de **borrar**
una receta de la empresa B **conociendo su identificador** se rechaza con un mensaje de error a la
vista; la receta de la empresa B sigue intacta después del intento; y un alta en la empresa A con el
**mismo nombre** que una receta de la empresa B se completa sin error.

### Límites de alcance

**R32.** El sistema NO DEBE crear en esta feature la guardia de esquema que exige empresa en toda tabla
de negocio (**QC-61**), NO DEBE borrar ni fusionar ninguna empresa residuo (**QC-77**), NO DEBE tocar el
aislamiento de `inventario` (QC-49), `unidades` (QC-76), `pedidos` (QC-60) ni `proveedores` (QC-59) más
allá de las tres costuras que las decisiones 3, 4 y 6 le encargan, NO DEBE cambiar el orden por defecto,
la búsqueda, los filtros, la paginación ni la forma del resultado del listado de recetas más allá de
acotarlo a la empresa, y NO DEBE cambiar la firma pública de ninguna de sus Server Actions.

**R33.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los requisitos
anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el requisito
que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Solo `recipes` gana columna de empresa | R1, R2, R9 |
| 2 | La línea **no** guarda su empresa: es la de su receta | R2, R20 |
| 3 | Una línea solo usa productos de la empresa de la receta | R21, R22 |
| 4 | Unidades: las de sistema valen para todas; las de empresa, solo para esa | R23, R24 |
| 5 | Las fotos **no** se aíslan y siguen en enlace público | R27 |
| 6 | Se cierra el hueco pedido → receta que dejó QC-60 | R25, R26 |
| 7 | El nombre de receta es único **por empresa** | R10, R11, R7 (su reversión) |
| 8 | Las filas que ya existen se asignan a «QuimiCloud» | R3 |
| 9 | No se vacía nada; la limpieza es QC-77 | R4, R32 |
| 10 | La frontera se valida **en el service** | R12, R13, R16, R17, R18, R21, R23, R28, R30 |
| 11 | El filtro vive en **un único punto de consulta** | R14, R15, R19, R22, R24, R25 |
| 12 | RLS `ENABLE` + `FORCE`, defensa en profundidad y no la frontera | R5, R6, R30 |
| 13 | Las recetas de una empresa dada de baja no se tocan | R29 |
| 14 | No nacen permisos nuevos | R28 |
| 15 | Hace falta **E2E** del acceso cruzado conociendo el identificador | R31 (y R15, R16, R17, R10, que es lo que el E2E ejercita) |
| 16 | Identificadores, marcas de tiempo, borrado y migración con `down` que aborta | R6, R7, R8 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-16 | ¿Qué tablas ganan columna de empresa? | **Solo `recipes`.** Medido en la base el 2026-09-16: **5 recetas vivas, 5 líneas, 0 fotos**; todos los productos usados en líneas son de QuimiCloud y todas las unidades son de sistema |
| 2026-09-16 | ¿La línea de receta guarda su propia empresa? | **No: su empresa es la de su receta.** Una línea no se consulta fuera de su receta y se borra con ella (`ON DELETE CASCADE`), así que no hay dos datos que puedan contradecirse. **Se aparta a conciencia de QC-49 D2**, que dio columna propia al lote porque QC-81 necesitaba unicidad `(empresa, lote)`; las líneas no tienen ninguna necesidad parecida |
| 2026-09-16 | ¿Qué productos puede usar una línea? | **Solo los de la empresa de la receta.** Es el encargo que dejó escrito **QC-49**: `ProductCatalog.findRefs` quedó **sin ámbito «hasta QC-50»**, con la consecuencia aceptada de que una receta de A resolvía un producto de B. Esta ficha lo cierra. `recipe_lines.product_id` no tiene clave foránea —el producto es de otro módulo—, así que la frontera es el service |
| 2026-09-16 | ¿Qué unidades puede usar una línea? | **Las de sistema valen para todas las empresas; las de una empresa, solo para esa.** Heredado de **QC-76**, que hizo la empresa **opcional** en las unidades justamente para que existan las de sistema. Hoy las 5 líneas usan unidades de sistema |
| 2026-09-16 | ¿Las fotos de receta se aíslan por empresa? | **No. Son material de referencia, no algo privado ni crítico.** Siguen sirviéndose con **enlace público** (`getPublicUrl`). Decisión del humano. Poner la empresa en la ruta no aislaría nada, y pasar a enlaces privados no se hace |
| 2026-09-16 | ¿Se cierra el hueco pedido → receta que dejó QC-60? | **Sí, aquí.** Crear o editar un pedido con una receta de otra empresa **se rechaza igual que si la receta no existiera**. Es lo que QC-60 dejó escrito «hasta QC-50» (su *Pregunta abierta 1*). Toca el módulo `pedidos`, igual que QC-60 tocó `asignaciones` para cerrar su propio enlace. Medido: **3 pedidos apuntan a 1 sola receta**, todo de QuimiCloud |
| 2026-09-16 | ¿El nombre de receta sigue siendo único global? | **No: único dentro de cada empresa.** Dos empresas pueden tener cada una su «Desengrasante industrial». Hoy el índice `recipes_name_unique` es global sobre `name_normalized` entre recetas vivas. Heredado del mismo cambio de **QC-49 D3** en presentaciones. Medido: **ningún nombre repetido**, así que el cambio no choca con datos existentes |
| 2026-09-16 | ¿Qué pasa con las filas que ya existen? | **Se asignan a «QuimiCloud»**, la única empresa real. Heredado de **QC-49 D4** y **QC-60** |
| 2026-09-16 | ¿«La base se siembra limpia» significa vaciar recetas? | **No.** No se borra ninguna fila. Heredado de **QC-49 D5** y **QC-60**; la limpieza del residuo es **QC-77** |
| 2026-09-16 | ¿Dónde se valida la frontera? | **En el service**, antes de tocar el repositorio. Heredado de **QC-49 D6** y de `docs/architecture.md > Acceso a datos y autorizacion`: un aislamiento implementado **solo** como policy de RLS no cuenta como implementado, y la empresa que viaja firmada en la sesión (QC-48) tampoco autoriza por sí sola |
| 2026-09-16 | ¿Dónde vive el filtro por empresa? | **En un único punto de consulta del módulo**, no repetido en cada caso de uso. Heredado de **QC-49 D7**, **QC-60** y **QC-76 D15/D16** |
| 2026-09-16 | ¿Y la RLS? | `recipes` y `recipe_lines` conservan `ENABLE` + **`FORCE ROW LEVEL SECURITY`**, que la guardia `guard-rls-force` ya exige. Defensa en profundidad, **no** la frontera. Heredado de **QC-49 D8** |
| 2026-09-16 | ¿Qué pasa con las recetas de una empresa dada de baja? | **No se tocan.** Heredado de **QC-49 D9** y **QC-76 D29** |
| 2026-09-16 | ¿Nacen permisos nuevos? | **No.** Siguen siendo `recetas.consultar` y `recetas.modificar`. Heredado de **QC-49 D10** |
| 2026-09-16 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` lo pide para permisos y esto es la misma familia: un fallo aquí es una **fuga de datos entre clientes**. Cubre que alguien de la empresa A no ve ni toca las recetas de la B ni conociendo el identificador. Heredado de **QC-49 D11** y **QC-60** |
| 2026-09-16 | Identificadores, marcas de tiempo, borrado y migración | **Heredado, no se reabre.** Identificadores de base en inglés y `created_at`/`updated_at` (QC-4). `recipes` conserva su borrado lógico. Migración **nueva** con su `down.sql`, que **aborta entera** en vez de descartar dato en silencio si revertir perdiera información —por ejemplo, dos empresas con el mismo nombre de receta, que harían imposible recrear el único global—. Heredado de **QC-49 R6/R7** y **QC-60** |
