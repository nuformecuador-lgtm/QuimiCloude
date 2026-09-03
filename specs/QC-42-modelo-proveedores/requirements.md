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

_Pendiente: los escribe spec_author (F1.2)._

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
