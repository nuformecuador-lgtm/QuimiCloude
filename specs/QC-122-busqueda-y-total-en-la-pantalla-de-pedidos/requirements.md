# QC-122 — busqueda-y-total-en-la-pantalla-de-pedidos · requirements.md

> **Zona** frontend · **Complejidad** medium · **depends_on** QC-68, QC-123 (done) · **Rama** feature/QC-122-busqueda-y-total-en-la-pantalla-de-pedidos
>
> **Alcance.** La pantalla de `/pedidos` gana la **caja de búsqueda por nombre de receta** (la consulta
> ya existe desde QC-68: `list-orders.ts` recibe `search`) y la **columna Importe**, que pinta el
> `ingredientsCost` que QC-123 ya guarda y devuelve. Más el **E2E** de las dos cosas, diferido aquí por
> QC-68 y QC-123.
>
> **Lo que NO entra.** La consulta, la migración y el índice de la búsqueda (**QC-68**). El cálculo del
> importe, su columna en la base y la selección de lotes (**QC-123**). Ordenar o filtrar por importe.
> Pasar la app a coma decimal.
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-17 | ¿Qué busca la caja? | Solo el nombre de receta, sin acentos ni mayúsculas, sobre el conjunto completo y no sobre la página; incluye recetas dadas de baja (heredado de **QC-68**). |
| 2026-09-18 | ¿Qué es el importe? | El coste de ingredientes de **QC-123**: esta ficha lo pinta, no lo calcula. Solo se muestra: no ordena ni filtra. |
| 2026-09-18 | ¿Pedido sin importe? | Un guion, nunca un cero; los motivos no se distinguen en pantalla (heredado de **QC-123**). |
| 2026-09-23 | ¿Qué se ve mientras la búsqueda está en vuelo? | La lista anterior, atenuada y con indicador de carga, hasta que llega la nueva. Sin esqueleto. |
| 2026-09-23 | ¿Y sin coincidencias? | Un estado propio, distinto de «no hay pedidos»: «No hay pedidos que coincidan…» con la acción «Limpiar la búsqueda» (patrón de `unit-list-empty.tsx` y `user-list-empty.tsx`). |
| 2026-09-23 | ¿Se conserva el término? | Sí: vive en la URL como `?q=` (patrón de `product-list-params.ts`); sobrevive a la paginación y a volver del detalle. |
| 2026-09-23 | ¿Formato del importe? | `$ 1,234,567.50`: símbolo `$` fijo (la moneda no se guarda), coma de miles, punto decimal (como el resto de la app) y siempre dos decimales. El valor exacto va en el `title` (patrón de **QC-132**). Sin `Intl.NumberFormat` ni coma flotante: aritmética sobre el texto (regla de `order-columns.tsx`). |
| 2026-09-23 | ¿E2E? | **Sí, aquí** (diferido por QC-68 y QC-123): escribir en la caja, ver la lista recortada, que coincide con la consulta, y que un pedido sin importe muestra el guion. |
