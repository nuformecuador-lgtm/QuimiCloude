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

_Pendiente: los escribe spec_author (F1.2)._

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
