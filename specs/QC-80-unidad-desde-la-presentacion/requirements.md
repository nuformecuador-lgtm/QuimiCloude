# QC-80 — unidad-desde-la-presentacion · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `medium` · **depends_on:** — ·
> **Rama:** `feature/QC-80-unidad-desde-la-presentacion`
>
> **Alcance.** La **presentación** gana una **unidad obligatoria**: columna nueva `unit_id`
> `NOT NULL` en `presentations`, con FK real a `units` y `ON DELETE RESTRICT`. El formulario de
> presentaciones la pide al alta y a la edición y no deja guardarla vacía, ofreciendo **todas** las
> unidades del catálogo. Las 114 filas existentes se rellenan en la misma migración. En paralelo,
> **`products.unit_id` desaparece** —columna, índice y FK—: el producto deja de declarar unidad.
> El selector de unidad de la **línea de receta** deja de leer la del producto y pasa a acotarse
> por la unidad de la presentación del **lote más reciente** de ese producto.
>
> **Lo que NO entra.** La **limpieza de las 113 presentaciones y las 2 unidades de residuo** que
> dejaron las corridas de tests → **QC-77**, que ya existe y es exactamente eso; aquí se rellenan,
> no se borran. La unidad de la **línea de catálogo de proveedor** → **QC-52** ya la separó a
> propósito y se queda como está: propia y opcional, porque es un término comercial y no una
> propiedad de la cosa. El **ámbito por empresa** de las presentaciones —y por tanto filtrar el
> selector de unidades por empresa— → **QC-49**. El **lote** y la **fecha de compra** del producto
> → **QC-81**, bloqueada por QC-49.
>
> Sembrado por `/afinar-feature` el 2026-09-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). **«El sistema»** aquí es: la **migración** y el esquema Prisma;
> el módulo **`inventario`** —esquema de entrada, puerto, casos de uso y adaptador Prisma de
> presentación y de producto—; las **Server Actions** de presentación; la **pantalla de
> presentaciones** (`app/(private)/configuracion/presentaciones/`); y la **línea de receta**
> (`app/(private)/produccion/formulas/`).
>
> **Hechos verificados contra la base el 2026-09-11, que estos requisitos no re-verifican**:
> `presentations` no tiene columna de unidad (esta ficha la crea); hay **114** presentaciones y
> **0** lotes, así que ninguna está referenciada; `products.unit_id` está **vacía en las 7 filas
> vivas**; el catálogo tiene las cuatro unidades de sistema `mililitro`, `litro`, `gramo`,
> `kilogramo` más dos de residuo que no se tocan.

### La columna y su migración

**R1.** El sistema DEBE almacenar la unidad de cada presentación en la columna
`presentations.unit_id`, de tipo `uuid`, **`NOT NULL`** y **sin valor por defecto**. NO DEBE
existir ninguna presentación sin unidad.

**R2.** El sistema DEBE declarar la restricción de clave foránea `presentations_unit_id_fkey`
desde `presentations.unit_id` hacia `units.id` con **`ON DELETE RESTRICT`** y
**`ON UPDATE CASCADE`**. SI se intenta borrar una unidad referenciada por alguna presentación,
ENTONCES la base DEBE rechazar el borrado. La FK NO DEBE ser `ON DELETE SET NULL` ni `CASCADE`.

**R3.** El sistema DEBE crear el índice `presentations_unit_id_idx` sobre `presentations(unit_id)`.

**R4.** CUANDO se aplica la migración, el sistema DEBE dejar **todas** las presentaciones
existentes con la unidad de sistema **`kilogramo`** —la fila de `units` cuyo `name_normalized` es
`kilogramo` y cuyo `company_id` es nulo, buscada **por nombre normalizado y nunca por
identificador**—. SI esa unidad no existe, o SI al terminar el relleno queda alguna presentación
con `unit_id` nulo, ENTONCES la migración DEBE abortar con un error propio y distinguible, sin
dejar la columna a medias ni marcarse como aplicada.

**R5.** La migración NO DEBE insertar ni borrar ninguna fila de `presentations` ni de `units`:
rellena, no limpia. Las 113 presentaciones de residuo y las 2 unidades de residuo DEBEN seguir
existiendo después de aplicarla, con el mismo identificador y el mismo nombre.

**R6.** MIENTRAS la migración escribe el relleno, el sistema DEBE desactivar temporalmente el
`FORCE ROW LEVEL SECURITY` de **`presentations`** (la tabla que escribe) y de **`units`** (la tabla
que lee para resolver `kilogramo`), y DEBE dejar las dos con la RLS **activada y forzada y sin
ninguna policy** al terminar, dentro de la misma transacción.

**R7.** La migración DEBE eliminar de `products` la columna **`unit_id`**, su índice
`products_unit_id_idx` y su clave foránea `products_unit_id_fkey`.

**R8.** El sistema DEBE acompañar la migración de un `down.sql` que revierta exactamente lo que
hace la de subida: devuelve `products.unit_id` **anulable** con su FK y su índice —vacía, sin
restaurar valores, porque no los había—, y quita de `presentations` la columna, su índice y su FK.

**R9.** El sistema NO DEBE añadir a `presentations` borrado lógico ni ninguna columna
`deleted_at`, y DEBE conservar sus identificadores de base **en inglés** y sus marcas
`created_at`/`updated_at`.

### Escritura de la presentación

**R10.** El sistema DEBE exigir la unidad en el alta y en la edición de una presentación. SI la
unidad falta, viene vacía o no tiene forma de uuid, ENTONCES el sistema DEBE rechazar la operación
con el código `invalid_input` señalando el campo `unitId`, y NO DEBE escribir nada.

**R11.** CUANDO se da de alta una presentación, el sistema DEBE escribir su nombre, su nombre
normalizado y su unidad **en la misma escritura**. NO DEBE existir ningún camino que cree una
presentación sin unidad.

**R12.** CUANDO se edita una presentación, el sistema DEBE reemplazar **nombre y unidad** —la
edición sigue siendo reemplazo completo—, y NO DEBE conservar la unidad anterior si se envió otra.

**R13.** SI la unidad enviada no corresponde a ninguna unidad del catálogo, ENTONCES el sistema
DEBE rechazar el alta o la edición con `invalid_input`, sin escribir nada y **distinguiéndolo** del
rechazo por nombre duplicado (`presentation_duplicate_name`) y del de presentación en uso
(`presentation_in_use`).

**R14.** SI el actor no está autenticado o no tiene el permiso `inventario.modificar`, ENTONCES el
sistema DEBE rechazar con `unauthorized` **antes** de validar la entrada y **antes** de tocar el
puerto de datos, también en el camino nuevo de la unidad.

**R15.** El contrato de salida de presentación DEBE incluir la unidad, y CUANDO se abre la edición
de una presentación el formulario DEBE llegar con **su** unidad ya elegida.

### Pantalla de presentaciones

**R16.** El formulario de presentación DEBE ofrecer, tanto en el alta como en la edición, **todas
las unidades del catálogo**, sin filtrar por empresa y sin ofrecer crear ninguna unidad nueva.

**R17.** El formulario NO DEBE ofrecer ninguna opción «sin unidad» y NO DEBE enviar la operación
con la unidad vacía: la validación previa DEBE rechazarla con **el mismo esquema** que valida el
servidor y pintar el error **junto al campo de unidad**.

**R18.** CUANDO el servidor rechaza la operación, el panel DEBE seguir abierto y conservar lo
escrito, **incluida la unidad elegida**.

**R19.** SI el catálogo de unidades no se puede leer, ENTONCES la pantalla NO DEBE ofrecer el alta
ni la edición y DEBE pintar el estado de error, en vez de abrir un formulario con el selector
vacío.

**R20.** El selector de unidad DEBE cumplir la regla multiplataforma
(`docs/architecture.md > Componentes`): objetivo táctil de 44×44 px y texto de campo de 16 px en
todos los anchos.

### El producto deja de declarar unidad

**R21.** El producto NO DEBE declarar unidad en ningún punto del camino: ni en su esquema de
entrada, ni en su contrato de salida, ni en la referencia que `inventario` publica a otros módulos,
ni en el `FormData` de su Server Action, ni como columna ordenable o filtrable del listado de
productos.

**R22.** El sistema DEBE derivar la unidad de un producto de la **presentación de su lote más
reciente** —el lote de creación más reciente, desempatando por identificador descendente—, y DEBE
devolver esa unidad derivada allí donde el producto se lista o se consulta.

**R23.** SI un producto no tiene ningún lote, ENTONCES su unidad derivada DEBE ser «ninguna» y la
línea de receta DEBE ofrecer **el catálogo entero** de unidades, sin bloquear la línea ni impedir
guardar la receta.

**R24.** CUANDO se elige un ingrediente en una línea de receta, el sistema DEBE acotar el selector
de unidad al **grupo** de la unidad derivada de ese ingrediente —las que comparten base efectiva— y
DEBE preseleccionar la más pequeña del grupo, salvo que la ya elegida sea de ese mismo grupo, en
cuyo caso la mantiene.

**R25.** El sistema NO DEBE devolverle al producto una presentación propia: `products` NO DEBE
recuperar ninguna columna `presentation_id`, y la presentación sigue viviendo **solo** en
`product_batches`.

### Límites de esta ficha

**R26.** El sistema NO DEBE tocar la línea de catálogo de proveedor: `supplier_catalog_lines`
conserva su presentación y su unidad **propia y opcional**, con la misma forma y la misma
opcionalidad de hoy.

**R27.** El sistema NO DEBE filtrar el selector de unidades de la presentación por empresa, y
`presentations` NO DEBE ganar ninguna columna de empresa.

**R28.** El sistema NO DEBE mover ninguna existencia ni tocar ningún importe: `product_batches`
—`stock`, `unit_cost`—, `orders` y el costo de la línea de catálogo de proveedor conservan su forma
y sus valores, y ni el alta ni la edición de una presentación escriben en ninguna de esas tablas.
Es el motivo por el que esta ficha no lleva E2E.

## Preguntas abiertas

Ninguna. La que traía la ficha —con qué unidad se rellenan las 114 presentaciones existentes— se
cerró el 2026-09-11 y está abajo, y la acotación destapó y cerró además la premisa obsoleta sobre
dónde cuelga la presentación.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-08 | ¿La unidad de la presentación es obligatoria? | **Sí.** `NOT NULL` en base y exigida en el esquema de entrada, sin valor por defecto |
| 2026-09-08 | ¿Qué pasa con `products.unit_id`? | **Se elimina** —columna, índice `products_unit_id_idx` y FK `products_unit_id_fkey`—. Está vacía en las **7** filas vivas, comprobado contra la base: no se pierde ningún dato y no hace falta rescatarlo |
| 2026-09-11 | Si QC-90 mudó la presentación de `products` a `product_batches`, ¿de dónde sale la unidad de un producto? | **De la presentación de su lote más reciente.** La premisa original de la ficha —«cada producto hereda la de la suya»— quedó obsoleta el 2026-09-09. No se le devuelve presentación propia al producto: eso reabriría lo que QC-90 cerró |
| 2026-09-11 | ¿Y si el producto todavía no tiene ningún lote? | **La línea de receta ofrece el catálogo entero**, que es lo que hace hoy. Sin lote no hay dato con el que acotar, y no se bloquea la línea: se escriben recetas antes de comprar el ingrediente |
| 2026-09-11 | ¿Con qué unidad se rellenan las 114 presentaciones existentes? | **Kilogramo, las 114, en la propia migración.** 113 son residuo de tests, sin referenciar por ningún lote (hay 0 lotes), y la única real —«Bolsa 5 KG»— es kilogramo |
| 2026-09-11 | ¿La migración borra el residuo? | **No.** Rellenar no es limpiar: el borrado de las 113 presentaciones y las 2 unidades basura es **QC-77**. Hacerlo aquí sería QC-77 de contrabando |
| 2026-09-11 | ¿Qué unidades ofrece el selector de la presentación? | **Todas las del catálogo**, sin filtrar por empresa, igual que hace hoy el formulario de producto. Las presentaciones no tienen empresa todavía; filtrarlas se adelantaría a **QC-49** |
| 2026-09-11 | ¿Entra la unidad de la línea de catálogo de proveedor? | **No.** Conserva su unidad propia y **opcional**. QC-52 la separó a conciencia: lo del proveedor son términos comerciales, no propiedades de la cosa |
| 2026-09-11 | ¿Hace falta E2E? | **No, y con motivo.** No hay movimiento de inventario ni importe: se añade un campo obligatorio a un formulario y se acota un selector. Lo cubren los tests unitarios y de integración. El E2E del alta con presentación y costo ya lo dejó puesto QC-90 |
| 2026-09-08 | Identificadores, marcas de tiempo y borrado | **Heredado, no se reabre.** Identificadores de base en inglés y `created_at`/`updated_at` (QC-4). `presentations` **no** tiene borrado lógico y esta ficha no se lo añade |
| 2026-09-11 | ¿Qué `ON DELETE` lleva la FK de la presentación hacia la unidad? | **`RESTRICT`, heredado de QC-32 (decisión 10).** Nunca `SET NULL`: convertiría «esta unidad se borró» en «esta presentación no declara unidad», y además la columna es `NOT NULL` |
