# QC-92 — ajuste-de-inventario · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-91` ·
> **Rama** `feature/QC-92-ajuste-de-inventario`
>
> ## Alcance
>
> Corregir la existencia de un **lote** registrando un **movimiento** que suma o resta, en vez de
> sobrescribir un número a ciegas. Nace una tabla de movimientos de inventario —que hoy **no
> existe**— y el alta de lote pasa a asentar también en ella. El producto gana un panel que
> **lista sus lotes** —hoy no hay ninguna pantalla que los muestre— y que despliega el historial
> de cada uno.
>
> ## Lo que NO entra
>
> - **Consumo por lote** —qué lote sale al despachar— y **aviso de lotes por vencer**: las dos
>   siguen abiertas en `docs/architecture.md > Preguntas abiertas del dominio`, 2. **Sin ficha y a
>   propósito**: no se diseñan a ciegas.
> - **Pantalla propia de ajustes** con búsqueda e histórico global: no se construye.
> - **Convertir entre unidades** → **QC-63**, único consumidor de la conversión de QC-76.
> - **La unidad como identidad del ítem** (y el retorno de `products.stock` como columna) →
>   **QC-121**.
>
> _Sembrado por `/afinar-feature` el 2026-09-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

**Ninguna.** Las cinco que la ficha traía escritas —sobre qué se ajusta, el motivo, el permiso, si
era tabla nueva, y el negativo con los lotes consumidos— se cerraron el 2026-09-17 y están abajo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-17 | ¿Sobre qué se ajusta? | **Sobre un lote concreto**, no sobre el producto. El error se cargó en un lote y se corrige ahí. Evita inventar una **regla de reparto entre lotes**, que es la pregunta 2 del dominio y sigue abierta: decidirla aquí sería decidir para todo el ERP |
| 2026-09-17 | ¿Queda historial? | **Sí: tabla nueva `inventory_movements`**, con qué lote, cuánto sumó o restó, quién y cuándo |
| 2026-09-17 | ¿El lote se modifica? | **Sí.** `product_batches.stock` **sigue siendo el número de verdad**; el movimiento es el historial que explica cómo llegó ahí. La existencia se lee de **un solo sitio** y el `CHECK (stock >= 0)` sigue protegiendo de verdad. Se descartó dejar el lote inmutable y derivar la existencia de lote + movimientos: habría dejado la existencia repartida en dos sitios y el CHECK sin poder garantizar el total |
| 2026-09-17 | ¿Qué registra el libro? | **Todo movimiento de inventario, incluida el alta de lote**: el alta de **QC-90** gana su asiento. **El consumo NO**: no existe todavía y no se diseña a ciegas. Se eligió a sabiendas de que cuesta más que registrar solo ajustes |
| 2026-09-17 | ¿Motivo? | **Obligatorio en los ajustes**, de un **conjunto cerrado que crece sin migrar** lo ya guardado —merma, rotura, conteo físico, error de carga—. Mecanismo **heredado del tipo de documento de la feature 4** (su R10: añadir un valor no obliga a tocar ninguna fila ya persistida). Se descartó el texto libre porque el historial dejaría de poder agruparse. **El asiento de alta no lleva motivo** |
| 2026-09-17 | ¿Permiso? | **`inventario.modificar`. Sin permiso nuevo.** El Administrador lo tiene y el Operador **no** —solo `inventario.consultar`—. Validado **en el service**, con su test (`docs/architecture.md > Acceso a datos y autorizacion`, `CHECKPOINTS.md`) |
| 2026-09-17 | ¿Dónde se ajusta? | **En el listado de inventario**: el producto abre un **panel con sus lotes** —número, cantidad, fecha de compra— y cada uno se corrige ahí. Resuelve de paso que hoy **no hay forma de ver los lotes de un producto**, que es lo que hace falta para poder elegir cuál está mal |
| 2026-09-17 | ¿Se ve el historial? | **Sí**: el lote despliega sus movimientos con **motivo, autor y fecha**. Si nadie puede verlo, el libro existe solo para la base de datos |
| 2026-09-17 | ¿Los lotes ya existentes entran al libro? | **No. El libro empieza hoy**, sin asientos retroactivos. **Consecuencia aceptada y que hay que ESCRIBIR, no descubrir**: la comprobación de que el libro cuadra con el `stock` necesita una **excepción permanente** para los lotes anteriores a esta feature |
| 2026-09-17 | ¿Puede quedar en negativo? | **No.** Heredado: el `CHECK (stock >= 0)` de `product_batches`, que existe desde que nació la tabla, es la **garantía dura** y no se toca |
| 2026-09-17 | ¿Y los lotes ya consumidos? | **No existen.** Nada consume lotes todavía —es la mitad abierta de la pregunta 2 del dominio—, así que no hay caso que resolver |
| 2026-09-17 | Riesgo declarado del diseño | **El libro y el `stock` pueden divergir** si algún camino de escritura olvida su asiento. Se cierra con una **guardia que lo vigile**: es **requisito de esta ficha**, no deuda para después |
| 2026-09-17 | La guardia R21 de QC-91 | **Hay que ajustarla, y deliberadamente.** Hoy `tests/unit/inventario/qc91-alcance.test.ts` afirma que `product-prisma.ts` **nunca** hace `productBatch.update(...)` —solo `create`—, y esta ficha lo necesita. **No se toca en silencio**: se ajusta con nota fechada y se prueba por mutación, como se hizo con la guardia de `recetas-ui` en QC-91 |
| 2026-09-17 | Enteros, borrado, idioma | Heredados: existencia **entera** (QC-14); **borrado lógico** e **identificadores en inglés** (feature 4). **Esta ficha no borra lotes** |
| 2026-09-17 | ¿Hace falta E2E? | **Sí**: es movimiento de inventario (`CHECKPOINTS.md`). **Aviso: `init.sh` NO corre Playwright** —deuda conocida, `docs/verification.md`—, así que el E2E se corre **a mano** y no basta con el gate en verde |
| 2026-09-17 | ¿Librería? | **Ninguna nueva** |
