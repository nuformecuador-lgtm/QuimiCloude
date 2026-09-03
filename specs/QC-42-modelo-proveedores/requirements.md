# QC-42 — modelo-proveedores · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** `QC-14` ·
> **Rama:** `feature/QC-42-modelo-proveedores`
>
> **Alcance.** Crear el modelo de proveedores como **módulo hexagonal propio `proveedores`**:
> la tabla `Supplier` (nombre único normalizado, teléfono y correo opcionales con la regla
> cruzada «al menos uno») y la tabla `SupplierCatalogLine`, la pareja proveedor-producto como
> entidad propia con su costo, su mínimo de compra y su tiempo de entrega. Su contrato público,
> la migración con su `down.sql` y los tests. Es la primera feature de la épica **QC-41 —
> Proveedores**.
>
> **Lo que NO entra.** El alta, la consulta, la edición y la baja de proveedores y de las líneas
> de su catálogo: van a **QC-43 — CRUD de proveedores**, que también valida formatos y largos y
> fija los permisos. La pantalla: **QC-44 — Pantalla de proveedores**. Órdenes de compra,
> historial de precios y cualquier movimiento de dinero o existencias: no tienen ficha todavía y
> **no se preparan «por si acaso»** (`docs/architecture.md > Dominio` n.º 1).
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es la **capa de persistencia** de
QuimiCloude —el esquema Prisma (`db/schema.prisma`) más la base Postgres con la migración de
esta feature aplicada— **más el armazón del módulo `proveedores`** y la frontera que ese módulo
tiene con `inventario` y con `identity`. No hay caso de uso, ni service, ni interfaz de usuario
en esta ficha (decisiones cerradas 20 y 21), así que ningún requisito habla de quién llama ni
desde dónde. Mismo encuadre que **QC-24**, que es el precedente literal de casi todo lo de
abajo.

### Estructura del proveedor

**R1.** El sistema DEBE persistir, para cada proveedor, un identificador propio, estable y no
derivado de sus datos de negocio, más su nombre, su teléfono y su correo.

**R2.** SI se intenta persistir un proveedor sin nombre, ENTONCES el sistema DEBE rechazar la
operación **en la propia base de datos** y no crear ninguna fila.

**R3.** El sistema DEBE aceptar un proveedor con teléfono y sin correo, y también uno con correo
y sin teléfono, conservando el dato ausente como ausencia de valor: los dos son opcionales **por
separado**.

**R4.** SI se intenta persistir o modificar un proveedor que no tenga ni teléfono ni correo,
ENTONCES el sistema DEBE rechazar la operación **en la propia base de datos**, y NO DEBE
depender de ninguna comprobación de la capa de aplicación para hacerlo.

**R5.** El sistema NO DEBE limitar en la columna la longitud del nombre, del teléfono ni del
correo, y NO DEBE rechazar un proveedor por la longitud de ninguno de los tres: los largos
máximos —120 para el nombre— son validación de aplicación y pertenecen a **QC-43**.

**R6.** El sistema NO DEBE exigir unicidad ni formato del teléfono ni del correo: DEBE aceptar
dos proveedores vivos distintos que compartan el mismo teléfono o el mismo correo, y DEBE
aceptar como correo cualquier texto, incluido uno que no tenga forma de correo.

### Unicidad del nombre del proveedor

**R7.** SI se intenta persistir un proveedor cuyo nombre coincida con el de otro proveedor vivo
ya existente **una vez normalizado** —sin acentos, sin caracteres especiales y sin distinguir
mayúsculas de minúsculas—, ENTONCES el sistema DEBE rechazar la operación **en la propia base de
datos** y no crear ni modificar ninguna fila.

**R8.** El sistema DEBE persistir el nombre normalizado de cada proveedor en una columna propia
junto al nombre original, y DEBE exponer **una única definición** de esa normalización, publicada
por el contrato público del módulo `proveedores`, de modo que la columna y cualquier consumidor
futuro normalicen igual.

**R9.** MIENTRAS un proveedor esté borrado lógicamente, el sistema DEBE permitir que otro
proveedor vivo use su mismo nombre normalizado.

### Estructura de la línea del catálogo

**R10.** El sistema DEBE persistir cada pareja proveedor–producto como **entidad propia**, con su
propio costo, su propio mínimo de compra y su propio tiempo de entrega, y NO DEBE modelarla como
una tabla de unión sin datos.

**R11.** SI se intenta persistir en el catálogo de un mismo proveedor una segunda línea que
apunte al mismo producto, ENTONCES el sistema DEBE rechazar la operación **en la propia base de
datos** y no crear ninguna fila.

**R12.** El sistema DEBE permitir que un proveedor tenga un número ilimitado de líneas de
catálogo y que un mismo producto aparezca en los catálogos de un número ilimitado de proveedores
distintos, cada uno con su propio costo.

**R13.** El sistema DEBE exigir producto y costo en cada línea, y DEBE aceptar una línea sin
mínimo de compra y sin tiempo de entrega, conservando los dos como ausencia de valor y no como
cero.

**R14.** El sistema DEBE almacenar el costo y el mínimo de compra de la línea como número
**decimal exacto** de 14 dígitos de precisión y 4 decimales, DEBE devolver sin pérdida cualquier
valor con hasta 4 decimales, y NO DEBE usar ninguna representación de coma flotante binaria
(`float`, `double`, `real`).

**R15.** El sistema DEBE aceptar un mínimo de compra con parte fraccionaria y devolverlo sin
redondear, y NO DEBE restringirlo a valores enteros.

**R16.** El sistema DEBE almacenar el tiempo de entrega de la línea como número **entero** de
días, y NO DEBE almacenar ninguna otra unidad de tiempo ni ninguna parte fraccionaria.

**R17.** SI se intenta persistir una línea cuyo costo, cuyo mínimo de compra o cuyo tiempo de
entrega sea negativo, ENTONCES el sistema DEBE rechazar la operación **en la propia base de
datos** y no crear ni modificar ninguna fila.

**R18.** El sistema NO DEBE almacenar ninguna moneda, divisa ni tasa de cambio junto al costo: la
moneda es implícita y única para todo el ERP.

**R19.** El sistema NO DEBE modificar la tabla de productos: NO DEBE añadirle, quitarle ni
cambiar ninguna columna, y en particular DEBE dejar intactos su costo, su mínimo de compra y su
tiempo de entrega, que conviven con los de la línea de catálogo con significado distinto.

### Frontera de módulo

**R20.** El sistema DEBE declarar `proveedores` como módulo propietario de los dos modelos de
esta feature, y ningún módulo distinto de `proveedores` DEBE consultarlos con el cliente Prisma.

**R21.** El módulo `proveedores` NO DEBE consultar el modelo de producto ni el de usuario con el
cliente Prisma, ni importar el dominio, los puertos o los adaptadores de `inventario` o de
`identity` por ruta profunda: todo lo que `proveedores` sepa del producto DEBE llegarle por el
contrato público de `inventario` (`@/lib/modules/inventario`).

**R22.** El sistema DEBE declarar la referencia de la línea al producto y las dos referencias de
auditoría del proveedor al usuario como **campos escalares sin relación de Prisma**, de modo que
**ninguna consulta del cliente Prisma pueda atravesar** desde un proveedor o una línea hasta un
producto o un usuario —ni por `include`, ni por `select`, ni por filtro anidado—; y DEBE mantener
aun así la restricción de clave foránea **real en la base de datos**.

**R23.** El módulo `proveedores` DEBE nacer con la forma hexagonal del repositorio: un contrato
público (`index.ts`) que solo reexporta símbolos de su propio `domain/`, las carpetas `domain/`,
`ports/` y `adapters/` como únicas carpetas del módulo, y ningún `'use server'` alcanzable desde
ese contrato.

### Auditoría, borrado y marcas de tiempo

**R24.** El sistema DEBE registrar, para cada proveedor, qué usuario lo creó y qué usuario lo
modificó por última vez **cuando ese usuario exista**; DEBE aceptar un proveedor sin ninguno de
los dos, conservándolos como ausencia de valor; y SI se intenta registrar como autor un usuario
inexistente, ENTONCES DEBE rechazar la operación.

**R25.** El sistema NO DEBE registrar autor de creación ni autor de última modificación en la
línea del catálogo.

**R26.** CUANDO se borra un proveedor, el sistema DEBE conservar su fila completa y registrar el
instante del borrado, sin eliminar ninguno de sus datos; y NO DEBE mantener ningún otro indicador
de estado activo o inactivo del proveedor.

**R27.** El sistema DEBE registrar, para cada proveedor y cada línea de catálogo, el instante de
creación y el instante de la última modificación, y DEBE actualizar el segundo cada vez que la
fila cambia.

**R28.** CUANDO se quita un producto del catálogo de un proveedor, el sistema DEBE eliminar la
fila de la línea por completo, y NO DEBE conservar ninguna marca de borrado lógico de líneas.

**R29.** SI se elimina físicamente un proveedor, ENTONCES el sistema DEBE eliminar también todas
sus líneas de catálogo y NO DEBE dejar ninguna línea huérfana.

**R30.** CUANDO se borra lógicamente un proveedor, el sistema DEBE conservar sus líneas de
catálogo sin modificar y asociadas a él.

**R31.** MIENTRAS un producto usado por al menos una línea de catálogo esté borrado lógicamente,
el sistema DEBE conservar esa línea apuntando al mismo producto; y SI se intenta eliminar
físicamente un producto referenciado por alguna línea, ENTONCES DEBE rechazar el borrado.

### Esquema, seguridad y migración

**R32.** El sistema DEBE nombrar en **inglés** y en `snake_case` todas las tablas, columnas,
índices y restricciones que cree esta feature, y las dos tablas DEBEN llamarse `suppliers` y
`supplier_catalog_lines`.

**R33.** El sistema DEBE tener `ROW LEVEL SECURITY` activado **y forzado**
(`FORCE ROW LEVEL SECURITY`) en las dos tablas que crea esta feature.

**R34.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar exactamente en
el estado de esquema previo a aplicarla, sin dejar tablas, restricciones, índices ni columnas
residuales.

### Límite de alcance

**R35.** El sistema NO DEBE incluir en esta feature ninguna operación de alta, consulta, edición
o baja de proveedores ni de sus líneas de catálogo, ni ninguna regla de permisos, ni adaptador
driving, ruta, Server Action o pantalla que las exponga; por lo tanto esta feature no aporta
ningún flujo navegable que un test E2E pueda visitar.

**R36.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el
requisito que la hace testeable. Ninguna queda sin `R<n>` (regla 4 de `CLAUDE.md`).

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Módulo propio `proveedores`; el producto se conoce por el contrato de `inventario` | R20, R21, R23 |
| 2 | Costo, mínimo y plazo conviven en producto y en catálogo; QC-42 no toca `products` | R19, R10 |
| 3 | La relación proveedor-producto es entidad propia, única por pareja | R10, R11, R12 |
| 4 | `product_id` y `cost` obligatorios; `min_purchase` y `delivery_time` opcionales | R13 |
| 5 | `decimal(14,4)` para costo y mínimo, entero de días para el plazo, ninguno negativo | R14, R16, R17 |
| 6 | El mínimo de compra admite fracciones | R15 |
| 7 | `name` obligatorio; `phone` y `email` opcionales por separado, con `CHECK` de «al menos uno» | R1, R2, R3, R4 |
| 8 | Nombre único normalizado: columna persistida + índice único **parcial** | R7, R8, R9 |
| 9 | Correo y teléfono: sin unicidad y sin `CHECK` de formato | R6 |
| 10 | Baja del proveedor: borrado lógico y nada más, sin estado activo/inactivo | R26, R27 |
| 11 | La línea se borra físicamente y se va con su proveedor (`CASCADE`) | R28, R29, R30 |
| 12 | Un producto dado de baja no se lleva la línea (`RESTRICT`) | R31 |
| 13 | FK al producto: escalar SIN `@relation`, escrita a mano en el SQL | R22 |
| 14 | Auditoría en `suppliers`, anulable, escalar sin `@relation`; la línea no la lleva | R24, R25, R22 |
| 15 | Largos máximos en la validación de aplicación, no en la columna | R5 |
| 16 | Moneda implícita, no se guarda | R18 |
| 17 | Tablas `suppliers` y `supplier_catalog_lines`, identificadores en inglés | R32 |
| 18 | RLS activada y forzada en las dos tablas | R33 |
| 19 | Migración con `down.sql` que revierte al esquema exacto anterior | R34 |
| 20 | Los permisos no se deciden aquí | R35 |
| 21 | E2E diferido con motivo | R35 |
| 22 | Ninguna librería nueva | R36 |

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea el modelo.

1. **¿Un costo de 0 es una línea válida?** La base solo prohíbe negativos, así que hoy sí se
   puede guardar. Una muestra gratis lo justificaría; un cero por descuido, no. Si tiene que
   ser `> 0`, es un `CHECK` distinto y cambiarlo con catálogos cargados obliga a limpiar datos.
2. **El costo del catálogo no tiene historial.** Cuando un proveedor sube el precio, el anterior
   se pierde: no hay dato del que reconstruirlo después. Mismo problema que la pregunta abierta
   n.º 1 de QC-24 con las versiones de fórmula, y en compras suele acabar haciendo falta. Si
   aparece, es ficha propia de la épica QC-41.
3. **Nada concilia el costo del producto con el del catálogo.** Conviven a propósito (decisión 2)
   y pueden contradecirse sin que ninguna capa se queje. Quién manda cuando difieren lo decidirá
   la feature que registre compras; hoy no hay dueño.
4. **El mínimo de compra no dice en qué se mide.** Se lee según la unidad del producto, que
   QC-32 deja **opcional**. Un mínimo de `2,5` sobre un producto sin unidad es ambiguo. No se
   añade columna de unidad a la línea: hacerlo después es barato mientras el catálogo esté vacío.
5. **Trazabilidad por lote y vencimiento** (pregunta abierta n.º 2 del dominio). Sigue abierta y
   sigue siendo cara. No se decide aquí: el lote vive en el movimiento, no en el catálogo.

Las tres siguientes las **añadió `spec_author` en F1.2** (2026-09-03) y son nuevas: el acotado no
las vio. Ninguna bloquea el modelo y las tres tienen posición por defecto escrita, pero las
cierra el humano —como pasó en QC-24 con las tres de `spec_author`, que bajaron a la tabla de
decisiones—.

6. **¿Un teléfono o un correo en blanco cuenta como contacto?** La decisión 7 exige «al menos
   uno», y el `CHECK` de la base solo puede mirar **ausencia de valor**: `phone = ''` y
   `email = ''` lo satisfacen igual que un teléfono real. La posición por defecto de este spec es
   **no añadir nada más en la base** y dejar que **QC-43** rechace el texto en blanco con `zod`,
   coherente con la decisión 15 (los largos viven en la validación de aplicación). Se anota
   porque, si la respuesta fuera que la base también lo tiene que impedir, es un `CHECK` distinto
   (`coalesce(nullif(btrim(phone),''), nullif(btrim(email),'')) IS NOT NULL`) y cambiarlo con
   proveedores ya cargados obliga a limpiar datos antes.
7. **Editar una línea del catálogo no deja rastro de quién la editó.** La decisión 14 dice que la
   línea no lleva columnas de autor, heredando el criterio de `recipe_lines`. Pero allí editar una
   línea es editar la fórmula, y el rastro queda en `recipes.updated_by`; aquí **subir el costo de
   un producto es un hecho comercial propio** que no modifica ninguna otra cosa del proveedor. Si
   se quiere rastro, hay dos caminos y ninguno es gratis: que **QC-43** toque `suppliers.updated_by`
   al escribir una línea (barato, impreciso), o columnas de auditoría propias en la línea (una
   migración más). Se relaciona con la pregunta abierta 2: sin historial de costo **y** sin autor,
   una subida de precio no deja ningún dato.
8. **El `CHECK` de contacto también alcanza a los proveedores dados de baja.** Un `CHECK` se
   evalúa en toda fila, viva o no, así que **no se pueden vaciar el teléfono y el correo de un
   proveedor ya borrado lógicamente** —lo que pediría una solicitud de borrado de datos de
   contacto— sin violar la restricción o borrar la fila entera. La posición por defecto es
   asumirlo: hoy no hay ninguna ficha de retención ni de borrado de datos personales. Si la
   hubiera, el `CHECK` pasa a ser parcial (`WHERE deleted_at IS NULL`), que es una migración
   pequeña mientras no haya datos.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | ¿Proveedores es módulo propio o parte de `inventario`? | **Módulo propio `proveedores`**, hexagonal como `identity`, `inventario`, `recetas` y `unidades` (**QC-15**). Conoce al producto **por el contrato público de `inventario`** (`@/lib/modules/inventario`), nunca por su tabla, su modelo de Prisma ni su repositorio. La frontera de la épica **QC-41** es la del módulo (`docs/jira.md`) |
| 2026-09-03 | QC-14 ya puso costo, mínimo de compra y tiempo de entrega **en el producto** | **Conviven, con significados distintos.** El del producto es el dato interno de referencia; el del catálogo es lo que cobra **ese** proveedor. **QC-42 no toca `products`**: retirarlos rompería QC-20, ya mergeado con esos tres campos en su formulario, su validación y sus tests |
| 2026-09-03 | La relación proveedor-producto | **Entidad propia**, no tabla de unión sin datos: cada pareja guarda su costo, su mínimo y su plazo. Índice único `(supplier_id, product_id)` para que un producto no aparezca dos veces en el catálogo del mismo proveedor. Heredado de **QC-24 D12** |
| 2026-09-03 | Obligatoriedad de los datos de la línea | **`product_id` y `cost` obligatorios**; `min_purchase` y `delivery_time` **opcionales**. La razón de existir de la línea es «este proveedor me vende esto a este precio»; el plazo y el mínimo se confirman después |
| 2026-09-03 | Tipo y precisión de los números de la línea | `cost` y `min_purchase` **`decimal(14,4)`** exacto — nunca `float` (`docs/architecture.md > Dominio` n.º 4); `delivery_time` **entero, en días**. **Ninguno admite negativos**, garantizado por `CHECK` en la base. Heredado de **QC-14** |
| 2026-09-03 | ¿El mínimo de compra admite fracciones? | **Sí, `decimal(14,4)`.** Se aparta a propósito de **QC-14**, donde `products.min_purchase` es entero: allí es una cantidad interna redonda, aquí es una condición comercial del proveedor y en químicos viene en peso o volumen («2,5 kg de catalizador») |
| 2026-09-03 | Obligatoriedad de los datos del proveedor | **`name` obligatorio**; `phone` y `email` **opcionales por separado**, con un **`CHECK` en la base** que exige al menos uno de los dos. La regla cruzada la garantiza el esquema, no solo la aplicación |
| 2026-09-03 | ¿El nombre del proveedor es único? | **Sí, comparando normalizado**: sin acentos, sin caracteres especiales y sin distinguir mayúsculas, con **columna normalizada persistida más índice único**, no comparación al vuelo. El índice es **parcial** (`WHERE deleted_at IS NULL`): dar de baja un proveedor libera su nombre. Heredado de **QC-20 D16**, **QC-24** y **QC-32**. Se aparta de **QC-14**, que dejó el nombre del producto sin unicidad |
| 2026-09-03 | Correo y teléfono: ¿unicidad o formato en la base? | **Ninguno de los dos.** Texto opcional, sin índice único y sin `CHECK` de formato. El formato del correo lo valida la aplicación con `zod` en **QC-43**. Se aparta de **QC-4** (correo de usuario único) a propósito: un mismo contacto comercial puede atender a dos proveedores |
| 2026-09-03 | Baja del proveedor | **Borrado lógico y nada más**, con `created_at` / `updated_at` / `deleted_at`. **Sin estado activo/inactivo** aparte: un segundo estado que nadie sabe distinguir del primero es deuda, no información. Heredado de **QC-4** y reforzado por `docs/architecture.md > Dominio` n.º 3 |
| 2026-09-03 | Al quitar un producto del catálogo, ¿la línea desaparece? | **Sí, borrado físico de la línea.** Sin `deleted_at`: la línea es parte del catálogo, no un hecho histórico. `ON DELETE CASCADE` desde el proveedor, que hoy no llega a dispararse porque su borrado es lógico. Mismo criterio que **QC-24 D5** |
| 2026-09-03 | ¿Qué pasa si se da de baja un producto que está en catálogos? | **La línea se conserva.** El borrado de producto es lógico (**QC-20 D5**), así que la fila sigue existiendo y la línea sigue apuntando al mismo producto. `ON DELETE RESTRICT` en la FK. Heredado de **QC-24 D13** |
| 2026-09-03 | Forma de la FK al producto | **FK real a `products`, declarada como escalar SIN `@relation` de Prisma**, con la FK escrita a mano en el `migration.sql`. Es lo que impide que el ORM atraviese de `proveedores` a `inventario` con un `include`. **La guardia de módulos no detectaría ese cruce**, porque no es un import. Heredado de **QC-24 D3** |
| 2026-09-03 | ¿Quién crea las columnas de auditoría? | **Esta ficha**, en la migración inicial: `created_by` y `updated_by` en `suppliers`, **anulables** (NULL = «no lo creó una persona»: una importación, un seed) y con la misma forma de FK escalar sin `@relation` hacia `users`. La línea de catálogo **no** las lleva, como `recipe_lines`. Heredado de **QC-24 D2 / D22**, que se apartó a propósito de QC-14/QC-20, donde el modelo nació sin auditoría y el CRUD tuvo que añadirla en una segunda migración |
| 2026-09-03 | Largos máximos del nombre, el teléfono y el correo | Viven en la **validación de aplicación** (**QC-43**), no en la columna: sin migración que cambie el tipo. El nombre reutiliza el mismo **120** del producto y la receta. Heredado de **QC-20 D11** y **QC-24** |
| 2026-09-03 | Moneda del costo | **Implícita, no se guarda.** El ERP es de un solo tenant (`docs/architecture.md > Dominio` n.º 1). Si algún día hay compras en otra divisa, es columna nueva y conversión. Heredado de la pregunta abierta n.º 2 de **QC-14** |
| 2026-09-03 | Nombre de las tablas | **`suppliers` y `supplier_catalog_lines`.** El `proveedor_catalogo` de la ficha del board nombra el **concepto**, no el identificador: los identificadores de base van en **inglés** y `snake_case`. Heredado de **QC-4** |
| 2026-09-03 | RLS | **Activada y forzada** (`FORCE ROW LEVEL SECURITY`) en las dos tablas. Heredado de **QC-4 R19**. No sustituye a la autorización en el service (`docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-03 | Migración | `migration.sql` (UP) más `down.sql` (DOWN) obligatorio, y revertirla deja el esquema exactamente como estaba. Heredado de **QC-4 R20** |
| 2026-09-03 | Permisos | **Aquí no se deciden**: no hay service en esta ficha. Los fija **QC-43**, con su test (`CHECKPOINTS.md > Permisos`) |
| 2026-09-03 | E2E | **Diferido con motivo**: no hay pantalla ni flujo navegable que visitar, es esquema y migración. Lo decide **QC-44**. Mismo criterio que QC-14, QC-24 y QC-32 |
| 2026-09-03 | Librería nueva | **Ninguna.** Es esquema Prisma, migración y el armazón del módulo. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
