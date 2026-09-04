# QC-52 — separar-producto-de-catalogo-de-proveedor · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-43` · **Rama** `feature/QC-52-separar-producto-de-catalogo-de-proveedor`
>
> **Alcance.** Separar del todo **lo que la cosa es** de **cómo la vende cada proveedor**. El
> producto pierde `cost`, `min_purchase` y `delivery_time`, que son términos comerciales y dependen
> de a quién le compres. El catálogo del proveedor pasa a ser una tabla con la **misma estructura
> que el producto omitiendo `stock` y `qty_alert`**, más `supplier_id`: gana `name`,
> `presentation_id`, `unit_id`, `image_path` y `deleted_at`, y **pierde `product_id`**. Las dos
> tablas quedan **independientes, sin ningún vínculo ni siquiera opcional**. Trae la migración de
> los dos cambios y arrastra el backend y la pantalla de producto, y buena parte del CRUD de
> proveedores.
>
> **Lo que NO entra.** La **pantalla del catálogo de proveedores**: es **QC-44**, que todavía no
> existe y solo nace con más alcance. El **historial de precios** (pregunta abierta 2 de QC-42):
> ficha propia de la épica QC-41 si hace falta. **Volver a vincular las dos tablas**: si algún día
> se quiere comparar precios entre proveedores, es ficha propia — aquí se decide expresamente que
> no hay vínculo. **Lote y vencimiento**: pregunta abierta 2 del dominio, sigue abierta. Y **la
> subida de imágenes**: la columna se crea porque la estructura la lleva, pero el flujo de subida
> no lo trae esta ficha (ver `## Preguntas abiertas`).
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí son cuatro cosas y ninguna más: el módulo
**`inventario`** (su dominio, sus puertos y sus adaptadores), el módulo **`proveedores`**, la
**pantalla de productos** de QC-22 con su **E2E**, y **la migración única** de esta ficha.

Esta ficha **no re-especifica** QC-14, QC-20, QC-22, QC-42 ni QC-43: lo que aquí no se nombra
sigue valiendo tal cual está mergeado. Lo que sí hace es **derogar** partes concretas de esas
fichas, y cada derogación está escrita en un requisito para que se pueda testear que ocurrió:
QC-14 R5 en la parte de costo/compra mínima/tiempo de entrega (R1), QC-20 en los mismos tres
campos de su contrato (R1), QC-22 R19 en lo que el formulario envía (R5), QC-43 R26 y R27 (R9,
R18), QC-43 R34 (R21) y QC-43 R48 (R23).

Las **operaciones** a las que se refieren los requisitos de autorización son las **cinco del
producto** —crear, listar, consultar ficha, editar, dar de baja— y las **cuatro de la línea de
catálogo** —crear, listar, editar, dar de baja—.

### Producto: qué pierde y qué conserva

**R1.** El sistema NO DEBE ofrecer, en ninguna capa, el **costo**, la **compra mínima** ni el
**tiempo de entrega** de un producto: ni como columna de `products`, ni como campo de los
contratos de entrada y salida del producto, ni como argumento aceptado por ninguna de sus cinco
operaciones; y SI una entrada de alta o de edición de producto llega con alguno de esos tres
campos, ENTONCES el sistema DEBE **rechazarla** como entrada inválida, y NO DEBE ignorarla en
silencio.

**R2.** El sistema DEBE conservar en el producto, con la misma forma y la misma opcionalidad que
tienen hoy, el **nombre**, la **presentación**, la **unidad**, la **ruta de imagen**, la
**existencia**, la **alerta de cantidad**, las marcas de creación y actualización, la marca de
borrado lógico y las dos columnas de autor.

**R3.** CUANDO se aplica la migración de esta ficha, el sistema DEBE conservar en `products` la
clave foránea a presentaciones, la clave foránea a unidades, las dos claves foráneas de autoría,
las restricciones de no negatividad de la **existencia** y de la **alerta de cantidad**, y `ROW
LEVEL SECURITY` **habilitada y forzada**; y NO DEBE dejar ninguna restricción que mencione una
columna eliminada.

**R4.** El sistema DEBE mantener la columna `products.image_path` **existente y sin tocar** tras
la migración, y el modelo Prisma del producto DEBE **declararla**, de modo que ninguna generación
futura de migración la trate como sobra; el cambio DEBE ser solo de modelo, sin ninguna sentencia
SQL sobre esa columna.

### Pantalla de productos y su E2E

**R5.** El formulario de producto NO DEBE enviar el costo, la compra mínima ni el tiempo de
entrega **por ninguna vía** —ni campo visible, ni campo oculto, ni valor precargado en la
edición—, y CUANDO el Administrador guarda un producto nuevo o editado, el sistema DEBE
persistirlo correctamente sin ellos.

**R6.** La lista de productos NO DEBE mostrar ninguna columna ni ningún valor derivado del costo,
la compra mínima o el tiempo de entrega.

**R7.** El E2E de la pantalla de productos DEBE seguir cubriendo el camino completo del
Administrador —entrar, abrir la pantalla, dar de alta un producto con presentación nueva y verlo
en la lista— y el rechazo del que no es Administrador, DEBE hacerlo **sin rellenar ni consultar
ningún campo eliminado**, y NO DEBE referenciar ningún identificador de prueba que la pantalla no
renderice.

### Línea de catálogo: estructura

**R8.** La línea del catálogo de un proveedor DEBE tener **nombre**, **nombre normalizado**,
**presentación**, **unidad**, **ruta de imagen**, **costo**, **mínimo de compra**, **tiempo de
entrega**, **proveedor**, marcas de creación y actualización, **marca de borrado lógico** y las
dos columnas de autor; y NO DEBE tener **existencia** ni **alerta de cantidad**.

**R9.** La línea NO DEBE guardar ni aceptar ninguna referencia a un producto: ni columna, ni clave
foránea, ni campo en ningún contrato de entrada o salida; y SI una entrada de alta o de edición de
línea llega con un identificador de producto, ENTONCES el sistema DEBE **rechazarla** como entrada
inválida, y NO DEBE ignorarla en silencio.

**R10.** El sistema DEBE exigir en la línea una **presentación**, y DEBE admitirla **sin unidad**;
DEBE exigir un **costo estrictamente mayor que cero**, tanto en la validación de aplicación como
**en la propia base de datos**; y DEBE admitir el mínimo de compra y el tiempo de entrega
**ausentes**, rechazando los negativos en los dos sitios.

**R11.** El sistema DEBE almacenar el costo y el mínimo de compra de la línea como **decimal con
precisión y escala explícitas**, y NO DEBE usar coma flotante binaria para ninguno de los dos en
ningún punto del recorrido, desde el borde hasta la base.

**R12.** El sistema DEBE nombrar en **inglés** y en `snake_case` toda columna, índice y restricción
que cree, renombre o elimine esta feature.

**R13.** CUANDO se crea una línea, el sistema DEBE registrar al actor como autor de la creación
**y** de la última modificación; y CUANDO se edita o se da de baja una línea, DEBE registrar al
actor como autor de la última modificación **sin alterar** el autor de la creación.

### Línea de catálogo: qué la identifica

**R14.** CUANDO se crea o se edita una línea, el sistema DEBE persistir junto al nombre su **forma
normalizada** —sin acentos, sin distinguir mayúsculas y sin caracteres no alfanuméricos— y DEBE
mantener las dos sincronizadas en toda escritura; SI el nombre está vacío, se compone solo de
espacios o **queda vacío al normalizarlo**, ENTONCES DEBE rechazar la operación; y CUANDO el
nombre es válido, DEBE recortar los espacios de sus extremos antes de guardarlo.

**R15.** SI se intenta crear o renombrar una línea cuyo **nombre normalizado y presentación**
coinciden con los de otra línea **viva del mismo proveedor**, ENTONCES el sistema DEBE rechazar la
operación con un error de duplicado y NO DEBE crear ni modificar ninguna fila; y esa garantía DEBE
venir del **índice único parcial de la base**, de modo que dos altas simultáneas acaben con **una
sola** línea creada y la otra rechazada.

**R16.** El sistema DEBE admitir **dos líneas vivas del mismo proveedor con el mismo nombre en
presentaciones distintas**, cada una con su propio costo; y DEBE admitir que **dos proveedores
distintos** tengan cada uno una línea viva con el mismo nombre y la misma presentación.

**R17.** MIENTRAS una línea esté dada de baja, su combinación de nombre normalizado y presentación
DEBE quedar **libre** para otra línea viva del mismo proveedor.

### Independencia entre las dos tablas

**R18.** Ninguna operación del catálogo del proveedor DEBE leer, comprobar ni resolver nada del
producto: `lib/modules/proveedores/**` NO DEBE importar el contrato de `inventario`, NO DEBE
consultar el modelo `Product` ni la tabla `products`, y el sistema NO DEBE ofrecer ninguna
consulta que relacione una línea con un producto ni que compare precios entre proveedores.

**R19.** CUANDO se da de baja un producto, el sistema NO DEBE alterar ninguna línea de ningún
catálogo; y MIENTRAS existan líneas de catálogo, ninguna de ellas DEBE impedir dar de baja un
producto.

### Baja lógica de líneas y de proveedores

**R20.** CUANDO se da de baja un proveedor, el sistema DEBE dar de baja **todas sus líneas vivas**
con la misma marca de baja y en la **misma operación atómica**, de modo que no pueda quedar un
proveedor dado de baja con alguna línea viva ni al revés; y NO DEBE eliminar físicamente ninguna
fila.

**R21.** CUANDO se da de baja una línea de catálogo, el sistema DEBE **conservar su fila completa**
y marcar el instante de la baja, y NO DEBE eliminarla físicamente.

**R22.** El sistema DEBE excluir de **toda** consulta del catálogo las líneas dadas de baja y las
líneas de un proveedor dado de baja, y NO DEBE ofrecer ninguna operación de restauración ni ningún
listado de líneas dadas de baja.

**R23.** SI el alta, la edición o la baja apuntan a una línea inexistente, a una línea ya dada de
baja, o a un proveedor inexistente o dado de baja, ENTONCES el sistema DEBE responder con un error
de **«no encontrado»** y NO DEBE crear ni modificar ninguna fila.

### Edición de la línea

**R24.** CUANDO se edita una línea, el sistema DEBE **reemplazar el conjunto completo** de sus
campos de negocio —nombre, presentación, unidad, ruta de imagen, costo, mínimo de compra y tiempo
de entrega—, NO DEBE ofrecer edición parcial campo a campo, y NO DEBE permitir cambiar el
**proveedor** de la línea; y SI la edición deja la línea con una combinación de nombre normalizado
y presentación ya usada por otra línea viva del mismo proveedor, ENTONCES DEBE rechazarla como
duplicado (R15).

### Autorización y RLS

**R25.** SI el rol del actor no es `Administrador`, o la operación llega sin actor o con un rol
nulo, vacío o desconocido, ENTONCES **cada una de las nueve operaciones** DEBE rechazarla con un
error de autorización **en el service**, antes de tocar ningún repositorio, y NO DEBE realizar
ninguna lectura ni ninguna escritura por ningún puerto.

**R26.** El sistema DEBE conservar `ROW LEVEL SECURITY` **habilitada y forzada** en `products` y en
`supplier_catalog_lines` después de la migración, la migración NO DEBE contener ninguna sentencia
que la altere, y ninguna policy DEBE pretender sustituir la comprobación de R25.

### Migración

**R27.** El sistema DEBE traer **una sola migración** con los dos cambios —lo que `products`
pierde y lo que `supplier_catalog_lines` pierde y gana— y esa migración NO DEBE añadir, quitar ni
modificar ninguna columna, índice o restricción de ninguna **otra** tabla.

**R28.** CUANDO se revierte la migración de esta feature, el esquema DEBE quedar **exactamente** en
el estado previo a aplicarla —con las tres columnas del producto, con `product_id` en la línea, su
clave foránea y su índice único, y sin las columnas nuevas de la línea— sin dejar columnas,
índices ni restricciones residuales.

**R29.** La migración NO DEBE contener **ningún** `DROP CONSTRAINT` sobre las claves foráneas que
cruzan de módulo y viven escritas a mano —las de autoría de `products`, `recipes`, `recipe_lines`,
`suppliers`, `supplier_catalog_lines` y `orders`, la de unidad de `products` y `recipe_lines`, y la
de producto de `recipe_lines`—, aunque el generador las proponga.

**R30.** Las dos claves foráneas nuevas de la línea —hacia **presentaciones** y hacia
**unidades**— DEBEN existir **en la base**, DEBEN declararse en el esquema como campos
**escalares sin relación**, de modo que el cliente del ORM no pueda atravesar de `proveedores` a
`inventario` ni a `unidades`, y cada una DEBE tener índice en su lado hijo.

### Borde, errores, módulo y dependencias

**R31.** El sistema DEBE validar con un esquema toda entrada externa de las nueve operaciones en el
borde, DEBE exponer las mutaciones como **Server Actions**, y NO DEBE crear ningún route handler
nuevo ni llamar por `fetch` a ninguna ruta API propia.

**R32.** El sistema DEBE señalar cada fallo con una clase de error de dominio que lleve un `code`
estable, traducido por el adaptador driving usando ese `code` y **nunca** el texto del mensaje;
NO DEBE conservar ningún código de error cuyo caso ya no puede ocurrir —en particular el de
«producto no encontrado» del módulo `proveedores`—; y NO DEBE introducir un código nuevo para un
caso que ya tiene uno.

**R33.** El dominio y los puertos de los dos módulos NO DEBEN importar framework, ORM,
`lib/shared/` ni `lib/composition`; el cableado puerto→implementación DEBE vivir **solo** en
`lib/composition`; el contrato de cada módulo NO DEBE reexportar nada que no sea de su `domain/`;
y el adaptador de `proveedores` NO DEBE consultar con el ORM los modelos de presentaciones ni de
unidades, que pertenecen a otros módulos.

**R34.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | El producto pierde costo, compra mínima y tiempo de entrega; conserva el resto | R1, R2, R5, R6 |
| 2 | El catálogo es la estructura del producto sin existencia ni alerta, más el proveedor | R8, R10 |
| 3 | Ningún vínculo entre las dos tablas, ni opcional | R9, R18, R19 |
| 4 | Nombre normalizado + presentación, únicos por proveedor; presentación obligatoria | R10, R14, R15, R16, R17 |
| 5 | Al dar de baja un proveedor sus líneas se van con él, en lógico | R20, R21, R22, R23 |
| 6 | Mandan los tipos estrictos de la línea, no los del producto | R10, R11 |
| 7 | Las reglas de QC-43 que dependían del producto se caen | R9, R18, R19, R32 |
| 8 | E2E: se actualiza el que ya existe | R7 |
| 9 | Una sola migración, con su `down.sql` que revierte al esquema exacto anterior | R3, R4, R27, R28 |
| 10 | Claves foráneas entre módulos, escalares sin relación; el SQL se audita | R29, R30 |
| 11 | Borrado lógico y marcas de tiempo; es lo que la línea gana aquí | R8, R13, R21, R22 |
| 12 | Importes en decimal, nunca coma flotante | R11 |
| 13 | Identificadores de la base en inglés | R12 |
| 14 | RLS habilitada y forzada en las dos tablas; la migración no la toca | R26 |
| 15 | Solo el Administrador, validado en el service | R25 |
| 16 | Ninguna dependencia nueva | R34 |

Requisitos que no salen de una fila de la tabla, y de dónde salen: **R24** de la pregunta abierta
**P6**, añadida por `spec_author` porque al desaparecer `product_id` la línea deja de tener la
«pareja identidad» que QC-43 R33 protegía; **R31** de `docs/architecture.md > Principios` n.º 2 y
de la decisión 10 de QC-43, que esta ficha hereda; **R33** de
`docs/architecture.md > Modulos y arquitectura hexagonal` y de QC-43 R44; y **R4** de la pregunta
abierta **P4**, también añadida por `spec_author`.

## Preguntas abiertas

**P1 — La línea gana `image_path`, pero hoy nadie sube imágenes.** El producto ya tiene esa columna
y su pantalla (QC-22) **no la usa**; el único flujo de subida que existe en el repo es el de
recetas (QC-25, sobre Supabase Storage). La columna se crea aquí **porque la estructura la lleva**,
no porque haya un caso de uso que la llene. Quién sube, dónde se guarda y qué pasa al dar de baja
una línea con imagen **no lo decide esta ficha**. Si al diseñar resultara que crear la columna sin
flujo es peor que no crearla, el `spec_author` **para y lo reporta**; no lo rellena con un supuesto
(regla 6 de `CLAUDE.md`).

**Respuesta de `spec_author` (F1.2): NO paro, y este es el motivo.** Crear la columna sin flujo
**no** es peor que no crearla, porque el repo **ya hizo exactamente eso y está mergeado**:
`db/migrations/20260903200000_product_image_path/` añade `products.image_path` como `TEXT` sin
`CHECK`, sin `DEFAULT` y sin índice, y su propio comentario razona las tres ausencias —la forma de
la ruta (clave de Storage, ruta relativa, URL absoluta) no está acordada en ningún sitio del repo,
así que un patrón inventado aquí sería la definición de facto de algo que nadie ha decidido—. La
línea copia ese precedente al pie de la letra, incluido el `down.sql` que **se niega a revertir**
si alguna fila tiene ruta escrita. Coste de crearla hoy: una columna anulable sin índice sobre una
tabla vacía. Coste de crearla después: otra migración sobre una tabla que ya no lo estará. **Lo que
sigue abierto es lo que la propia pregunta enumera** —quién sube, dónde se guarda y qué pasa al dar
de baja una línea con imagen—, y esta ficha no lo cierra: hasta que exista ese flujo, la columna
vale `NULL` en toda fila y ningún requisito la lee.

**P2 — El nombre de la línea y el del producto no se relacionan de ninguna manera.** Es la
consecuencia directa de quitar `product_id`, y está aceptada. Queda escrito para que dentro de unos
meses no se lea como un olvido: el día que se quiera comparar precios entre proveedores habrá que
emparejar por nombre —frágil— o rehacer la tabla.

**P3 — El mínimo de compra sigue sin decir en qué se mide.** Se lee según la unidad, que QC-32
dejó **opcional**: un mínimo de `2,5` sobre una línea sin unidad es ambiguo. Heredada de QC-42
(pregunta 4) y sigue abierta.

**P4 — `products.image_path` existe en la base pero NO en el modelo Prisma.** Hallazgo de
`spec_author` en F1.2, no cubierto por la tabla. La migración
`20260903200000_product_image_path` añadió la columna, pero el modelo `Product` de
`db/schema.prisma` **no la declara** (sí lo hace `Recipe`, que es lo que confunde al leerlo por
encima). O sea: es **drift**, y `prisma migrate dev` propondrá `ALTER TABLE "products" DROP
COLUMN "image_path"` en la generación de **esta** migración —justo la que ya tiene que borrar
otras tres columnas de esa misma tabla, donde un `DROP COLUMN` de más se lee como parte del
trabajo—. La decisión cerrada 1 dice que el producto **conserva** `image_path`, así que la
columna se queda. Posición por defecto escrita, no decidida (`design.md > 3.1`): **declararla en
el modelo Prisma**, sin ninguna sentencia SQL, porque desarma la mina para esta migración y para
todas las siguientes y no cambia la base ni un byte. La escribe **R4**; si el humano prefiere
dejar el drift, R4 se reduce a «la migración no toca esa columna» y el `tasks.md` conserva igual
su paso de auditoría.

**P5 — Con las líneas cayendo con su proveedor, la excepción de QC-43 R48 se queda sin
sentido.** Hallazgo de `spec_author` en F1.2. R48 permitía **borrar** —y solo borrar— una línea de
un proveedor dado de baja, con el argumento de que rechazarlo dejaría esas filas «atrapadas sin
ninguna operación capaz de eliminarlas». Desde la decisión cerrada 5 esas filas **ya están dadas
de baja**, así que no hay nada que atrapar. Posición por defecto escrita, no decidida
(`design.md > 6.4`): **las cuatro operaciones sobre las líneas de un proveedor dado de baja
responden «no encontrado»**, la baja incluida, y R48 queda derogada entera. La escribe **R23**.

**P6 — ¿La edición de una línea puede cambiar su nombre y su presentación?** Hallazgo de
`spec_author` en F1.2. QC-43 R33 lo dejaba en solo condiciones comerciales, porque la pareja
`(supplier_id, product_id)` era la identidad y no se tocaba. Al quitar `product_id` ese argumento
desaparece: la identidad pasa a ser un texto que se escribe a mano y **una errata en el nombre no
tendría forma de corregirse** salvo dando de baja la línea y perdiendo su historial y su autoría.
Posición por defecto escrita, no decidida (`design.md > 6.3`): **la edición es reemplazo completo
de los campos de negocio**, nombre y presentación incluidos, exactamente como la del proveedor
(QC-43 R14), y puede chocar con el índice único igual que un renombrado (QC-43 R15). Lo único que
nunca cambia es el proveedor. La escribe **R24**; si el humano decide lo contrario, R24 se reduce
a las condiciones comerciales y el esquema de edición pierde tres campos, nada más.

Si durante la implementación aparece cualquier otra ambigüedad, el implementer **para y la reporta
al leader**; no la rellena con supuestos.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | ¿Qué pierde el producto? | **`cost`, `min_purchase` y `delivery_time`.** Son términos comerciales y dependen de a quién le compres. **Conserva** `name`, `presentation_id`, `unit_id`, `image_path`, `stock` y `qty_alert`: lo que la cosa **es** y lo que **hay** de ella |
| 2026-09-03 | ¿Qué es el catálogo del proveedor? | Una tabla con la **misma estructura que el producto, omitiendo `stock` y `qty_alert`** —cuánto tienes es tuyo, no del proveedor—, más `supplier_id`. Respecto a hoy **gana** `name`, `presentation_id`, `unit_id`, `image_path` y `deleted_at`, y **pierde `product_id`** |
| 2026-09-03 | ¿Hay algún vínculo entre las dos tablas? | **NO, ni siquiera opcional.** Se descartó expresamente una referencia opcional al producto. Es lo que permite que el catálogo de un proveedor incluya cosas que aún no tienes dadas de alta. **Consecuencia aceptada:** el sistema **no podrá** responder «a cuánto me vende cada proveedor este producto» ni comparar precios entre proveedores |
| 2026-09-03 | Sin `product_id`, ¿qué identifica una línea? | **Nombre + presentación, únicos dentro de cada proveedor**, comparando por **nombre normalizado** (sin acentos ni mayúsculas), con el mismo patrón de columna persistida + índice único parcial que QC-42 usa para el nombre del proveedor y QC-20 para las presentaciones. **La presentación pasa a ser obligatoria en la línea.** Dos proveedores sí pueden vender ambos lo mismo, y un mismo proveedor puede tener el mismo producto en bidón de 20 L y en tambor de 200 L como **dos líneas distintas con precios distintos** |
| 2026-09-03 | ¿Qué pasa con el catálogo al dar de baja un proveedor? | **Sus líneas se dan de baja con él, en lógico.** Nada se borra físicamente, el histórico queda, y ninguna línea sobrevive a su proveedor de cara al usuario. **Sustituye al borrado físico en `CASCADE`** que decidió QC-42 (decisión 11) y **deroga el test que lo fijaba** en QC-43 (R34) |
| 2026-09-03 | Los tipos no coinciden entre las dos tablas. ¿Cuáles manda la copia? | **Los estrictos de la línea, no los del producto.** `cost` sigue **obligatorio y mayor que cero** y `min_purchase` sigue **decimal**. Copiar el producto al pie de la letra haría el costo **opcional** y el mínimo **entero**, y se perderían dos garantías que QC-43 acaba de poner: una línea de catálogo sin precio no dice nada —es para eso— y comprar 2,5 kg es normal. `presentation_id` **obligatoria**, `unit_id` **opcional** |
| 2026-09-03 | ¿Qué reglas de QC-43 se caen? | Las que dependían del producto: que la línea **exija un producto existente**, el **`RESTRICT`** que impide borrar un producto con líneas, el error de **producto no encontrado**, el rechazo del **duplicado por pareja `(supplier_id, product_id)`**, y el uso del contrato **`ProductCatalog`** de `inventario` desde `proveedores`. Con ellas se van sus tests. **No es trabajo perdido**: el CRUD, la autorización, la migración y las tres reglas nuevas de base de QC-43 siguen valiendo |
| 2026-09-03 | ¿E2E? | **SÍ, actualizando el que ya existe.** QC-22 dejó un E2E que da de alta un producto y lo ve en la lista, verde en Chromium y WebKit; esta ficha le quita **tres campos** al formulario, así que hay que tocarlo igualmente. Se actualiza a conciencia en vez de descubrir que se rompió. **No** se escribe uno nuevo para el catálogo de proveedores: eso es **QC-44** |
| 2026-09-03 | Migración | **Una sola**, con las dos tablas: quita tres columnas de `products`; quita `product_id` de `supplier_catalog_lines` con su clave foránea y su índice único; y añade las cinco columnas nuevas con sus claves foráneas a presentaciones y unidades. Con su **`down.sql` que revierte al esquema exacto anterior** (heredado de QC-14 y QC-42), verificado por el gate. **Barata porque las tablas están vacías** y cara en cuanto no lo estén |
| 2026-09-03 | Claves foráneas entre módulos | **Escalares sin `@relation`**, heredado de QC-20, QC-24 y QC-42. **OJO**: es justo la convención que hace que `prisma migrate dev` proponga **borrar** esas FK como si fueran sobras. En QC-43 generó **diez `DROP CONSTRAINT`** que había que quitar a mano. **El SQL generado se audita línea a línea antes de aceptarlo** |
| 2026-09-03 | Borrado y marcas de tiempo | **Lógico**, con `created_at` / `updated_at` / `deleted_at`, heredado de la feature 4 y de QC-14. Es lo que la línea gana en esta ficha |
| 2026-09-03 | Importes | **`decimal(14,4)`, nunca `float`**, heredado de QC-14 y QC-42 |
| 2026-09-03 | Idioma de los identificadores de la base | **Inglés**, heredado de la feature 4 |
| 2026-09-03 | RLS | **Habilitada y forzada** en las dos tablas, como ya están. La migración **no la toca**, y ninguna policy sustituye la comprobación de permiso del service |
| 2026-09-03 | Permisos | **Solo el Administrador**, en todas las operaciones de las dos tablas, heredado de QC-20 y QC-43. La autorización se valida **en el service** (`docs/architecture.md > Acceso a datos y autorizacion`), y `CHECKPOINTS.md` exige su test |
| 2026-09-03 | Dependencias nuevas | **Ninguna.** Si el diseño creyera necesitar una librería, el implementer **para y la propone**; no la instala (regla 7 de `CLAUDE.md`) |
