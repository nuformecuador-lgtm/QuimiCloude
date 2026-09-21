# QC-138 — estado-bloqueado-por-inventario-insuficiente · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** `QC-123`, `QC-141` ·
> **Rama:** `feature/QC-138-estado-bloqueado-por-inventario-insuficiente`
>
> **Alcance.** El pedido gana un quinto estado, `BLOQUEADO`. Al **crear** o al **editar**, si la
> existencia no cubre lo que su receta consume, un modal avisa y el pedido se guarda en ese
> estado. Al entrar existencia se revisan los pedidos bloqueados de esa empresa y se desbloquean
> los que ya se cubren, recalculando su importe. El Operador los ve pero no los puede iniciar.
>
> **Lo que NO entra.** La **reserva de material** → **QC-141**, que bloquea a ésta: sin ella dos
> pedidos creados el mismo día pueden contar con los mismos 2.000 gr y verse cubiertos los dos.
> Pintar el importe en la pantalla → **QC-122**. Que la presentación declare cuánto contiene →
> **QC-130**. Devoluciones, que no existen en el ERP.
>
> Sembrado por `/afinar-feature` el 2026-09-21. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **¿Un lote vencido cuenta como existencia?** Depende de la **pregunta 2 del dominio**
   (`docs/architecture.md > Preguntas abiertas del dominio`), «respondida a medias, no cerrada»
   desde QC-90. Hoy no hay vencimiento en `ProductBatch`, así que la cuestión no bloquea esta
   ficha; el día que se cierre, «no alcanza» tendrá que decidir si descuenta lo vencido.
2. **Qué distintivo lleva el pedido bloqueado en la lista del Operador.** Que se vea y que no se
   pueda iniciar está decidido; **cómo** se ve —color, etiqueta, icono, texto del botón
   deshabilitado— no se habló y no se rellena con un supuesto.
3. **Si el desbloqueo automático falla a mitad, ¿se deshace el alta del lote?** La revisión corre
   síncrona dentro de la operación de inventario, así que la transacción las une por defecto; pero
   nadie decidió si un fallo revisando pedidos debe tumbar el registro del material, que es una
   operación legítima por sí misma.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-21 | ¿Qué cuenta como «no alcanza el inventario»? | **Solo la existencia insuficiente.** La receta pide 2.000 gr y en los lotes con existencia hay 1.500: bloquea. Una receta **sin ingredientes**, o un ingrediente cuya unidad **no comparte base** con la de la receta —gramos contra bidones—, **no** bloquean: eso es un dato incompleto (QC-130), no falta de material, y llamarlo «bloqueado por inventario» sería mentir. |
| 2026-09-21 | ¿Cómo sale de `BLOQUEADO`? | **Automático, no a mano.** Al registrar existencia se revisan los pedidos bloqueados de esa empresa y se desbloquea el que ya se cubre. No hay acción manual de desbloqueo. |
| 2026-09-21 | Al desbloquearse, ¿recalcula el importe? | **Sí, con los lotes de ese día.** ⚠️ **DEROGA** una decisión cerrada de QC-123 —«se recalcula en cada edición… **no cambia por movimientos de inventario**: comprar un lote caro mañana no toca ningún pedido ya creado»—. Aceptado a sabiendas: si al crearlo no había material, el coste real es el del material que finalmente entró. |
| 2026-09-21 | ¿Qué movimientos disparan la revisión? | El **alta de lote** (`opening`) y el **ajuste al alza** (`adjustment` que sube existencia). Los dos son material que aparece. |
| 2026-09-21 | ¿Un ajuste a la baja bloquea un pedido pendiente? | **No.** El efecto es de **una sola dirección**: el inventario solo desbloquea, nunca bloquea un pedido que ya estaba `PENDIENTE`. Decidido así a propósito, para que a nadie se le bloquee solo un pedido que estaba a punto de empezar. |
| 2026-09-21 | ¿Síncrono o diferido? | **Síncrono**, dentro de la operación de inventario, pero recorriendo **únicamente los pedidos en `BLOQUEADO`**; los demás ni se miran. El motivo lo dio el humano: nunca habrá un número alto de pedidos bloqueados, así que el coste no crece sin techo. |
| 2026-09-21 | ¿Qué opciones da el modal? | **Dos botones: «Guardar bloqueado» y «Volver».** Quien crea el pedido puede corregir la cantidad antes de guardar en vez de meter un pedido imposible en la lista. |
| 2026-09-21 | ¿Bloquea también al **editar**? | **Sí, con el mismo modal.** La regla es una sola —un pedido sin material suficiente está bloqueado— y da igual por qué puerta entró. |
| 2026-09-21 | ¿Lo ve el Operador? | **Sí: aparece en su lista de asignados, marcado y con el arranque deshabilitado.** Obliga a ampliar la unión literal `'PENDIENTE' \| 'EN_CURSO'` de `assigned-order-view.ts` y `assigned-order-execution-view.ts`, el arreglo `ESTADOS_DE_TRABAJO` de `list-assigned-orders.ts` y el rechazo de `get-assigned-order-execution.ts`. |
| 2026-09-21 | ¿Es cancelable y editable? | **Las dos cosas, como un `PENDIENTE`.** Cancelar lleva su motivo, como hoy. Editar importa: bajar la cantidad de 200 a 50 puede desbloquearlo sin esperar a que entre material. |
| 2026-09-21 | ¿Se puede arrancar a mano? | **No.** `BLOQUEADO` **solo sale a `PENDIENTE`**, y desde ahí se arranca normal. Ni el Operador ni quien tenga `pedidos.modificar` lo llevan a `EN_CURSO` directo: un `EN_CURSO` tiene que seguir implicando que había con qué producirlo. |
| 2026-09-21 | ¿Hay reserva de material? | **Sí, pero en ficha propia (QC-141), que bloquea a ésta.** Su ciclo quedó decidido aquí: **cancelar libera**, **entregar consume** de verdad, **editar a la baja libera la diferencia**, y la pantalla de inventario muestra **total y disponible**, con lo reservado a la vista. |
| Heredada de QC-33 | ¿Enum de Prisma o tabla propia? | **Enum.** «El conjunto es cerrado a propósito y añadir un valor es una migración». |
| Heredada de QC-33 | ¿Dónde va el valor nuevo? | **El último, después de `CANCELADO`.** `ALTER TYPE … ADD VALUE` solo sabe añadir al final, y en este enum el orden no significa nada de negocio —a diferencia del de la prioridad—. `ORDER_STATUS_VALUES` en `order-classification.ts` es un duplicado a mano vigilado por `module-contract.test.ts` (QC-33 R35), que compara las dos listas valor a valor **y en orden**: se tocan juntas o el gate se pone rojo. |
| Heredada de QC-123 | ¿Nace un permiso nuevo? | **No.** El catálogo cerrado de quince permisos no se enmienda. |
| Heredada de la spec 4 | Borrado e identificadores | Borrado **lógico** con `created_at` / `updated_at` / `deleted_at`, e identificadores de base de datos **en inglés**. |

### Nota de diseño que la acotación deja planteada, no resuelta

La señal que esta ficha necesita **no existe hoy**. `calculateIngredientsCost` (QC-123) devuelve el
**mismo `null`** en los cuatro casos que puede producir —receta sin líneas, unidad sin base común,
existencia insuficiente, y desbordamiento— y su propio comentario dice que **no puede saber cuál
ocurrió**. Como aquí solo bloquea la existencia insuficiente, o esa función aprende a distinguir la
causa o hace falta una comprobación propia. **Es la decisión de diseño central de la ficha** y la
toma `spec_author` en F1.2, no esta acotación.
