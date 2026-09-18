# QC-68 — busqueda-y-total-en-el-listado-de-pedidos · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** ninguna ·
> **Rama** `feature/QC-68-busqueda-y-total-en-el-listado-de-pedidos`
>
> **Alcance.** El listado de pedidos gana las dos cosas que le faltan y que caen en la misma
> consulta: **buscar por nombre de receta** —escribir «buffer» devuelve los pedidos cuya receta se
> llama así— y **el total del pedido calculado en el servidor**, devuelto como cadena decimal junto
> a la cantidad y el precio unitario. La migración lleva su `down` y los índices que la búsqueda
> necesite.
>
> **Lo que NO entra.** La pantalla —la caja de búsqueda y la columna— → **QC-122**, creada al
> acotar esta y que además carga con el **E2E de importes** diferido desde aquí. Ordenar o filtrar
> por el total → fuera de alcance por decisión de esta acotación; si hace falta, ficha propia con su
> caso medido. Cómo se resuelve la comparación —cruzando tablas o denormalizando el nombre— es
> decisión del `design.md`, no de este archivo.
>
> *Sembrado por `/afinar-feature` el 2026-09-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-17 | ¿Se puede ordenar y filtrar por el total, o solo mostrarlo? | **Solo se muestra.** No entra en `ORDER_QUERYABLE`. Ordenar o filtrar obligaría a que el total **exista en la base como dato calculado con su índice** —no basta con calcularlo al devolver la fila—, y esa es una migración mayor para algo que **nadie ha pedido todavía**. Si en uso real hace falta, es ficha nueva con el caso medido. **Cierra la única pregunta que la ficha traía abierta** |
| 2026-09-17 | ¿La búsqueda encuentra los pedidos cuya receta está **de baja**? | **Sí.** Verificado en disco: `list-orders.ts:149` resuelve los nombres con `findRefsIncludingDeleted`, así que **la lista ya muestra el nombre de una receta dada de baja**. Si al buscar ese mismo nombre el pedido no saliera, parecería que se ha perdido. La búsqueda es coherente con lo que el usuario ve en pantalla |
| 2026-09-17 | ¿Hace falta E2E aquí? | **No: se difiere a QC-122, y el motivo se escribe ahora.** `CHECKPOINTS.md` lo exige para flujos con importes y el total lo es, pero **esta ficha no tiene pantalla**: sin caja de búsqueda ni columna que manejar no hay recorrido que ejercitar en un navegador, y montar uno obligaría a inventar una interfaz que otra ficha va a construir. **La ficha destino se creó el mismo día** para que la exigencia no quedara sin dueño. La cobertura de esta ficha es de **integración contra la base real** |
| 2026-09-17 | ¿Qué se busca exactamente? | **Solo el nombre de la receta**, no el número de pedido ni ningún otro campo. Viene de la `description` y no se amplía aquí |
| 2026-09-17 | ¿Cómo se comporta la búsqueda? | **Heredado del contrato genérico de QC-57**: se aplica **sobre el conjunto completo y nunca sobre la página ya traída**, e **ignora acentos y mayúsculas** igual que las otras seis listas. Verificado en disco: `recipes.name_normalized` **ya existe**, así que la parte normalizada del dato no se inventa aquí |
| 2026-09-17 | ¿Con qué permiso y con qué ámbito? | **Heredado, sin cambios**: `pedidos.consultar` como primera línea del caso de uso y ámbito de empresa por `OrderScope`. Verificado en `list-orders.ts:91` y `:131`. Esta ficha **no toca la autorización** ni añade un permiso nuevo |
| 2026-09-17 | ¿Cómo viaja el total? | **Como cadena decimal**, igual que la cantidad y el precio unitario, y **calculado en el servidor**. Multiplicar dos `Decimal(14,4)` con el tipo numérico de JavaScript pierde precisión. **NO entra `decimal.js` ni ninguna otra dependencia**: Prisma ya opera decimales |
| 2026-09-17 | ¿Qué exige la migración? | **Su `down.sql`** y **los índices que la búsqueda necesite**, mismo criterio con el que QC-57 metió los suyos: buscar u ordenar por un campo sin índice es el anti-patrón que el reviewer rechaza en cuanto las tablas crezcan. **Los tests que hoy pasan tienen que seguir pasando** |
