# QC-49 — aislamiento-por-empresa-en-inventario · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** `QC-48`, `QC-32` (las dos `done`) ·
> **Rama:** `feature/QC-49-aislamiento-por-empresa-en-inventario`
>
> **Alcance.** Las **tres** tablas de inventario —`products`, `presentations` y `product_batches`—
> ganan `company_id` **NOT NULL** con FK a `companies`. Toda consulta y toda escritura del módulo se
> limitan a la empresa de la sesión, y el intento de leer o modificar algo de otra empresa **se
> rechaza aunque se conozca el identificador**. El filtro vive en **un único punto de consulta** del
> módulo, no repetido caso a caso. Migración con su `down.sql` y backfill de las filas vivas a la
> única empresa real. Lleva **E2E**.
>
> **Lo que NO entra.** Recetas → **QC-50**. Proveedores → **QC-59**. Pedidos → **QC-60**. La guardia
> de esquema que exige empresa en toda tabla de negocio → **QC-61**. La limpieza de las 36 empresas y
> las 113 presentaciones de residuo de tests → **QC-77**; aquí se asignan, no se borran. El
> correlativo de lote único por empresa → **QC-81**, que esta ficha **desbloquea**. Las **unidades**
> no entran porque ya las aisló **QC-76** (`company_id` opcional, con las de sistema).
>
> Sembrado por `/afinar-feature` el 2026-09-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí son cuatro cosas y ninguna más:

1. la **capa de persistencia** —el esquema Prisma (`db/schema.prisma`) más la base Postgres con la
   migración nueva de esta feature aplicada—;
2. el **módulo `inventario`** tal y como existe hoy: su contrato público (`index.ts`), sus nueve
   casos de uso, sus dos puertos de repositorio, sus tres adaptadores driven de persistencia y sus
   dos Server Actions;
3. la **frontera** de ese módulo con `identity`, de donde salen el actor (`getSessionUser()`) y la
   empresa (`getSessionContext()`, QC-48);
4. las **pantallas** que ya consumen el módulo: `app/(private)/inventario` y
   `app/(private)/configuracion/presentaciones`.

Cuando un requisito dice «rechazar **en la propia base de datos**» habla de la garantía que deja la
migración: se prueba con un `INSERT`/`UPDATE` directo contra la base de test, no con una llamada a
un caso de uso. Cuando dice «rechazar **en el service**» habla del caso de uso, que es la frontera
real (`docs/architecture.md > Acceso a datos y autorizacion`): esa es la que cierra el requisito, y
la de la base es adicional.

### Esquema, migración y reversión

**R1.** El sistema DEBE persistir, para cada **producto**, cada **presentación** y cada **lote**, la
empresa a la que pertenece, en una columna **obligatoria** con clave foránea a `companies`; SI se
intenta persistir una fila de cualquiera de esas tres tablas **sin** empresa, o con una empresa que
no corresponde a ninguna existente, ENTONCES el sistema DEBE rechazar la operación en la propia base
de datos y NO DEBE crear ni modificar ninguna fila.

**R2.** El sistema DEBE declarar la empresa del **lote** en una columna propia de la tabla de lotes y
NO DEBE deducirla de su producto: SI se intenta persistir un lote sin empresa, ENTONCES el sistema
DEBE rechazarlo en la propia base de datos **aunque** el producto al que apunta sí la declare.

**R3.** CUANDO se aplica la migración de esta feature, **todas** las filas ya existentes de las tres
tablas —incluidas las de productos con borrado lógico— DEBEN quedar asignadas a la empresa
«QuimiCloud»; y SI esa empresa no puede identificarse de forma unívoca, ENTONCES la migración DEBE
**abortar entera** y NO DEBE dejar ninguna columna, índice ni restricción a medias.

**R4.** La migración de esta feature NO DEBE borrar ni modificar ninguna fila de `companies`,
`products`, `presentations` ni `product_batches` más allá de escribir la columna de empresa que ella
misma añade: al terminar, el número de filas de las cuatro tablas DEBE ser exactamente el de antes.

**R5.** CUANDO termina la migración de esta feature, las tres tablas de inventario DEBEN tener
`ROW LEVEL SECURITY` **activada y forzada** (`FORCE ROW LEVEL SECURITY`) y NO DEBEN tener ninguna
policy.

**R6.** El sistema DEBE introducir los cambios de esquema de esta feature en una **migración nueva**,
NO DEBE modificar ninguna migración ya aplicada, y esa migración DEBE traer su `down.sql`; CUANDO se
revierte, el esquema DEBE quedar exactamente como estaba antes de aplicarla —sin columna, índice,
restricción ni disparador residual, con el índice único global de nombre de presentación
restaurado y con la RLS activada y forzada en las tres tablas— y NO DEBE desaparecer ninguna fila.

**R7.** SI al revertir la migración existe alguna fila de las tres tablas cuya empresa **no** sea la
que escribió el propio UP, o existen dos presentaciones que comparten nombre normalizado —lo que
haría imposible recrear el índice único global—, ENTONCES el sistema DEBE **abortar la reversión
completa** y NO DEBE descartar ese dato en silencio.

**R8.** El sistema DEBE nombrar en **inglés** la columna, los índices, las restricciones, las
funciones y los disparadores que cree o renombre esta feature, y DEBE conservar las marcas de tiempo
`created_at`/`updated_at` que las tres tablas ya tienen.

**R9.** El sistema NO DEBE cambiar el régimen de borrado de ninguna de las tres tablas: `products`
conserva su borrado lógico, `presentations` y `product_batches` siguen **sin** marca de borrado, y
esta feature NO DEBE añadir ni quitar ninguna.

**R10.** El sistema DEBE dejar **indexada** la columna de empresa de cada una de las tres tablas, sea
por un índice propio o como columna de cabeza de un índice compuesto.

### La frontera: dónde se valida y dónde vive el filtro

**R11.** El sistema DEBE hacer que el **actor** que recibe cada caso de uso de `inventario` lleve la
empresa en cuyo nombre se opera, junto con el identificador y el conjunto de permisos; y esa empresa
NO DEBE autorizar por sí sola: el permiso DEBE comprobarse **aparte y antes**, en la primera línea
del caso de uso, antes de validar la entrada y antes de tocar el repositorio.

**R12.** CUANDO se invoca cualquier adaptador driving de `inventario`, la empresa DEBE salir del
**contexto de sesión del servidor** y nunca de la entrada del llamante; SI falta el usuario de sesión
o el contexto de sesión, ENTONCES el sistema DEBE rechazar la operación sin consultar el
repositorio.

**R13.** El sistema DEBE definir la condición «de la empresa» **una sola vez** dentro del módulo
`inventario`, DEBE construir a partir de esa definición **toda** consulta y **toda** escritura del
módulo, y NO DEBE permitir que ninguna operación de sus repositorios se ejecute sin recibir la
empresa en cuyo nombre se pide: una **llamada** que la omita NO DEBE compilar, y una
**implementación** que la omita —que el compilador SÍ acepta— NO DEBE poder llegar a `dev`, por lo
que el sistema DEBE rechazarla de forma **mecánica y automática**, sin depender de revisión humana,
comprobando **método a método** que cada implementación de sus puertos declara la empresa y la lleva
hasta esa definición única, y probando contra la base el rechazo cruzado de cada operación.

> **Nota del 2026-09-11 — corrección de una afirmación falsa, NO una relajación del requisito.** Este
> requisito decía «una implementación **o** una llamada que la omita NO DEBE compilar». El
> `reviewer` lo verificó en F2.2 con el `tsc` de este repo y la mitad de la implementación es
> **falsa**: TypeScript admite asignar una función de **menor aridad** donde se espera una de mayor,
> así que una implementación de lectura sin el parámetro de empresa **compila** y se cablea sin
> protestar. El humano aprobó este spec el 2026-09-11 y tiene derecho a ver qué cambió y por qué: lo
> que cambia es **quién** detecta la omisión, no si se tolera. Sigue siendo inaceptable y sigue
> teniendo que detectarse sola, antes del merge; ahora lo hace una guardia estática **por función**
> (`tests/guards/guard-ambito-empresa-inventario.test.ts`) más los tests de integración del rechazo
> cruzado, en vez del compilador, que solo cubre la mitad de la llamada. La única excepción sigue
> siendo la de R29 (`findProductRefs`, destino QC-50), escrita también en la guardia.

**R14.** CUANDO se consulta el listado de productos o el de presentaciones en nombre de una empresa,
el sistema DEBE devolver **exactamente** las filas de esa empresa y NO DEBE devolver ninguna de otra;
el recuento total DEBE contar solo las filas visibles para esa empresa, y el orden, los filtros y la
búsqueda DEBEN aplicarse dentro de ese conjunto.

**R15.** SI se consulta la ficha de un producto cuyo identificador pertenece a **otra** empresa,
ENTONCES el sistema DEBE responder **en el service** exactamente igual que ante un producto
inexistente —con el código de error «no existe» que el catálogo cerrado de QC-70 ya tiene para ese
recurso—, NO DEBE responder con un error de autorización y NO DEBE devolver ningún dato de esa fila.

**R16.** SI se intenta **editar**, **borrar** o **agregar un lote** a un producto de otra empresa, o
**editar** o **borrar** una presentación de otra empresa, ENTONCES el sistema DEBE rechazarlo **en el
service** con el código «no existe» del recurso correspondiente y NO DEBE crear, modificar ni marcar
como borrada ninguna fila, ni de la empresa de quien pide ni de la otra.

**R17.** CUANDO se da de alta un producto, un lote o una presentación, el sistema DEBE escribir en la
fila la empresa **del actor**; SI la entrada del llamante trae una empresa, ENTONCES el sistema NO
DEBE escribirla, NO DEBE tenerla en cuenta y DEBE rechazar la entrada por campo desconocido.

**R18.** CUANDO el alta resuelve si un producto ya existe por su nombre, el sistema DEBE mirar
únicamente los productos **vivos de la empresa del actor**; SI el único homónimo vivo pertenece a
otra empresa, ENTONCES el sistema DEBE crear un producto **nuevo** en la empresa del actor y NO DEBE
colgarle el lote al producto ajeno.

**R19.** El sistema NO DEBE exponer el identificador de empresa en la salida de su contrato público
—ni en la vista de producto, ni en la de presentación, ni en el estado que devuelven sus Server
Actions—: la empresa entra en la consulta y no viaja al navegador.

### Unicidad y coherencia

**R20.** SI se intenta persistir una presentación cuyo **nombre normalizado** coincida con el de otra
presentación **de la misma empresa**, ENTONCES el sistema DEBE rechazar la operación en la propia
base de datos, contra un **índice único** y no contra una comprobación previa al vuelo; y DEBE
**aceptar** el mismo nombre normalizado en dos empresas distintas. El nombre normalizado DEBE seguir
siendo el que produce la única definición de la normalización que publica el contrato del módulo.

**R21.** El sistema NO DEBE introducir ninguna unicidad de nombre de **producto**: dos productos
DEBEN poder llamarse igual dentro de la misma empresa, como hoy.

**R22.** SI se intenta persistir un lote cuya empresa no coincida con la de **su producto** o con la
de **su presentación**, ENTONCES el sistema DEBE rechazar la operación en la propia base de datos y
NO DEBE crear ni modificar ninguna fila.

**R23.** SI se intenta persistir una presentación cuya **unidad** pertenezca a **otra** empresa,
ENTONCES el sistema DEBE rechazar la operación en la propia base de datos; y DEBE seguir aceptando
las unidades de **su** empresa y las de **sistema** —las que no declaran empresa— (ver «Preguntas
abiertas 1»: si el humano decide diferirlo, este requisito y su prueba caen y el resto no cambia).

### Permisos, empresa de baja y RLS

**R24.** El sistema DEBE seguir exigiendo los permisos que ya existen —`inventario.consultar` para
consultar y `inventario.modificar` para modificar—, validados **en el service**, y NO DEBE crear
ningún permiso nuevo; DEBE rechazar por igual al actor ausente, al que no trae conjunto de permisos,
al que lo trae vacío y al que no trae el código exacto, **antes** de validar la entrada y de tocar el
repositorio.

**R25.** CUANDO una empresa queda marcada como borrada, el sistema NO DEBE borrar, vaciar ni alterar
ningún producto, presentación ni lote de esa empresa.

**R26.** El sistema NO DEBE implementar el aislamiento como policy de RLS ni depender de ella para
filtrar: la RLS de las tres tablas es defensa en profundidad, y quitarla NO DEBE cambiar el resultado
de ninguna consulta ni escritura del módulo.

### Prueba de extremo a extremo

**R27.** El sistema DEBE cubrir con un test **E2E** sobre navegador real que, con una sesión abierta
en la empresa A: las pantallas de inventario y de presentaciones NO muestran ninguna fila de la
empresa B; un intento de **borrar** una fila de la empresa B **conociendo su identificador** se
rechaza con un mensaje de error a la vista; y la fila de la empresa B sigue intacta después del
intento.

### Límites de alcance

**R28.** El sistema NO DEBE añadir columna de empresa, filtro ni rechazo cruzado a `recipes`,
`recipe_lines`, `suppliers`, `supplier_catalog_lines` ni `orders`: eso es QC-50, QC-59 y QC-60.

**R29.** El sistema NO DEBE acotar por empresa la resolución de referencias de producto que consumen
otros módulos (`ProductCatalog.findRefs`): acotarla obligaría a tocar `recetas`, que es su único
llamante y que se aísla en **QC-50**. Es una **excepción explícita** a R13 y queda escrita con
destino nombrado, no como olvido: quien cierre QC-50 reutiliza la definición de ámbito que esta
feature deja exportada, en vez de escribir un segundo filtro. (Mismo criterio con el que QC-76 dejó
`UnitCatalog.findRefs` fuera de su ámbito.)

**R30.** El sistema NO DEBE crear en esta feature la guardia de esquema que exige empresa en toda
tabla de negocio (QC-61), NO DEBE borrar ninguna empresa ni presentación de residuo de tests (QC-77),
y NO DEBE introducir el correlativo de lote por empresa (QC-81), al que esta feature solo
**desbloquea** dejando la columna.

**R31.** El sistema NO DEBE cambiar el orden por defecto, la búsqueda, el filtrado, la paginación ni
la forma del resultado de los dos listados del módulo más allá de acotarlos a la empresa, y NO DEBE
cambiar la firma pública de ninguna de sus Server Actions.

**R32.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el requisito
que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Entran las **tres** tablas, no dos | R1, R3 |
| 2 | El lote lleva **columna propia** | R2, R22 |
| 3 | Las presentaciones son **de la empresa**, sin catálogo compartido | R1, R14, R20 |
| 4 | Las filas que ya existen se asignan a «QuimiCloud» | R3 |
| 5 | No se borra ninguna fila; la limpieza es QC-77 | R4, R30 |
| 6 | La frontera se valida **en el service** | R11, R15, R16, R24, R26 |
| 7 | El filtro vive en **un único punto de consulta** | R13, R14, R29 |
| 8 | RLS `ENABLE` + `FORCE`, defensa en profundidad y no la frontera | R5, R26 |
| 9 | El inventario de una empresa dada de baja no se toca | R25 |
| 10 | No nacen permisos nuevos | R24 |
| 11 | Hace falta **E2E** del acceso cruzado conociendo el identificador | R27 (y R15, R16, que es lo que el E2E ejercita) |
| 12 | Identificadores en inglés, marcas de tiempo y borrado heredados | R8, R9 |

## Preguntas abiertas

Las dos que necesitaban decisión humana **se cerraron el 2026-09-11 al aprobar el spec** y están
abajo, en la tabla de decisiones. Quedan dos, y las dos son informativas: no piden decisión, avisan.

**3. ¿Qué pasa con `supplier_catalog_lines.presentation_id`?** `proveedores` tiene una FK real hacia
`presentations`, así que a partir de esta ficha una línea de catálogo puede apuntar a una
presentación de otra empresa. No lo toco —`proveedores` se aísla en **QC-59** y R28 lo deja fuera—,
pero queda dicho aquí para que no aparezca como sorpresa al cerrar QC-59.

**4. Un dato del encargo que no cuadra con el código.** El encargo dice que «`products` tiene índice
único parcial». Comprobado contra `db/migrations/**`: **no existe ningún índice único sobre
`products`**; los parciales que hay (`products_name_idx`, `products_stock_idx`, …) son de orden y
filtro, no únicos, y la ausencia de unicidad de nombre es deliberada desde QC-20 (D14). Por eso R21
la conserva en vez de convertirla en «por empresa». Si el humano quería decir otra cosa, es aquí
donde hay que corregirlo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-11 | ¿Qué tablas entran? | **Tres, no dos.** La tarjeta nombraba `products` y `presentations` porque se escribió **antes** de que existieran los lotes: `product_batches` nació el 2026-09-09 con QC-90. Las tres ganan `company_id` obligatorio |
| 2026-09-11 | ¿El lote lleva columna propia o hereda la empresa de su producto? | **Columna propia.** **QC-81** necesita la unicidad `(empresa, lote)` y sin columna no se puede construir. Esta ficha la desbloquea |
| 2026-09-11 | ¿De quién son las presentaciones? | **De la empresa, sin catálogo compartido.** Cada empresa tiene las suyas y no ve las de nadie más. **Se aparta a conciencia de QC-76** (D10), que hizo la empresa *opcional* en las unidades justo para que existieran las de sistema |
| 2026-09-11 | ¿Qué pasa con las filas que ya existen? | **Se asignan a «QuimiCloud»**, la única empresa real. Comprobado contra la base: 23 productos vivos, 114 presentaciones, 1 lote y 37 empresas, de las que 36 son residuo de tests |
| 2026-09-11 | ¿«La base se siembra limpia» significa vaciar el inventario? | **No.** No se borra ninguna fila. La limpieza del residuo es **QC-77** |
| 2026-09-11 | ¿Dónde se valida la frontera? | **En el service**, antes de tocar el repositorio. Heredado de `docs/architecture.md > Acceso a datos y autorizacion`: un aislamiento implementado **solo** como policy de RLS **no cuenta como implementado**, y la empresa que viaja firmada en la sesión (QC-48) tampoco autoriza por sí sola |
| 2026-09-11 | ¿Dónde vive el filtro por empresa? | **En un único punto de consulta del módulo**, no repetido en cada caso de uso. Heredado de **QC-76 D15/D16**: ninguna base lo garantiza, y la consulta nueva que se olvide de él enseña a una empresa lo que no es suyo |
| 2026-09-11 | ¿Y la RLS? | Lo que se toque conserva `ENABLE` + **`FORCE ROW LEVEL SECURITY`**, que la guardia `guard-rls-force` ya exige. Es defensa en profundidad, **no** la frontera |
| 2026-09-11 | ¿Qué pasa con el inventario de una empresa dada de baja? | **No se toca.** Heredado de **QC-76 D29** |
| 2026-09-11 | ¿Nacen permisos nuevos? | **No.** Siguen siendo `inventario.consultar` e `inventario.modificar`, que ya existen |
| 2026-09-11 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` lo pide para permisos y esto es la misma familia: un fallo aquí es una **fuga de datos entre clientes**, no una molestia. Cubre que alguien de la empresa A no ve ni toca el inventario de la B ni conociendo el identificador |
| 2026-09-11 | ¿Entra la coherencia presentación → unidad (R23)? | **Sí, entra, con su disparador.** Aprobado por el humano al aprobar el spec (F1.4). Hoy la FK `presentations_unit_id_fkey` no mira de quién es la unidad, así que escribir el identificador a mano es el único modo de apuntar a una ajena — y esta ficha existe para cerrar justo eso. Se acepta el coste: una migración de `inventario` lee `units`, con el precedente del disparador de QC-76 |
| 2026-09-11 | ¿`ProductCatalog.findRefs` se queda sin ámbito (R29)? | **Sí, se queda, siguiendo QC-76 D33.** Aprobado por el humano al aprobar el spec (F1.4), **sabiendo que tensiona el Alcance** («toda consulta del módulo»): `findRefs` no tiene sesión de la que sacar la empresa — la llama `recetas` con identificadores que ya conoce. **Consecuencia aceptada**: una receta de la empresa A que guarde el identificador de un producto de la B lo sigue resolviendo **hasta QC-50** |
| 2026-09-11 | Identificadores, marcas de tiempo y borrado | **Heredado, no se reabre.** Identificadores de base en inglés y `created_at`/`updated_at` (QC-4). `products` conserva su borrado lógico; esta ficha no cambia el de nadie |
