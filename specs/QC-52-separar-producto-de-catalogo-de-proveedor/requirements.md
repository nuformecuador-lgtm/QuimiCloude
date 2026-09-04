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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

**P1 — La línea gana `image_path`, pero hoy nadie sube imágenes.** El producto ya tiene esa columna
y su pantalla (QC-22) **no la usa**; el único flujo de subida que existe en el repo es el de
recetas (QC-25, sobre Supabase Storage). La columna se crea aquí **porque la estructura la lleva**,
no porque haya un caso de uso que la llene. Quién sube, dónde se guarda y qué pasa al dar de baja
una línea con imagen **no lo decide esta ficha**. Si al diseñar resultara que crear la columna sin
flujo es peor que no crearla, el `spec_author` **para y lo reporta**; no lo rellena con un supuesto
(regla 6 de `CLAUDE.md`).

**P2 — El nombre de la línea y el del producto no se relacionan de ninguna manera.** Es la
consecuencia directa de quitar `product_id`, y está aceptada. Queda escrito para que dentro de unos
meses no se lea como un olvido: el día que se quiera comparar precios entre proveedores habrá que
emparejar por nombre —frágil— o rehacer la tabla.

**P3 — El mínimo de compra sigue sin decir en qué se mide.** Se lee según la unidad, que QC-32
dejó **opcional**: un mínimo de `2,5` sobre una línea sin unidad es ambiguo. Heredada de QC-42
(pregunta 4) y sigue abierta.

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
