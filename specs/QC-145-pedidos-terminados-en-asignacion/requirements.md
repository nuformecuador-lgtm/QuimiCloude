# QC-145 — pedidos-terminados-en-asignacion · requirements.md

> **Zona:** `fullstack` · **Complejidad:** — (la asigna el leader en F1.0) · **depends_on:** QC-144, QC-146 ·
> **Rama:** `feature/QC-145-pedidos-terminados-en-asignacion`
>
> **Alcance.** `/asignacion` pasa a mostrar vistas según permiso: «Mis asignados» (la de hoy),
> **«Terminados»** (los `ENTREGADO` de toda la empresa, ordenados por una **fecha de terminado** que
> empieza a guardarse) y, para quien tiene `pedidos.consultar`, **«Todos»** (todos los pedidos de la
> empresa en cualquier estado, filtrable por estado), que sustituye a las otras dos. Además, **el
> estado de un pedido lo mueve solo la planta**: la edición en Pedidos deja de cambiarlo.
>
> **Lo que NO entra.** El rol Empacador y el permiso de terminados → **QC-144**. Un estado «empacado»
> o cualquier acción sobre un pedido terminado. Una pantalla de detalle desde estas listas. Rellenar
> la fecha de los pedidos entregados antes de esta ficha.
>
> Sembrado por `/afinar-feature` el 2026-09-22. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Un Administrador asignado como responsable no tiene por dónde ejecutar el pedido**: su única
   vista es «Todos», que es de solo lectura (decisión «¿Qué se puede hacer desde…?»). El humano lo
   eligió sabiéndolo. Queda abierto si el selector de responsables deja de ofrecer Administradores o
   si se acepta tal cual. No se rellena con supuestos: `spec_author` lo lleva a F1.4.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-22 | ¿Qué sale en «Terminados»? | Los pedidos `ENTREGADO` **de toda la empresa**, sin filtro por usuario. **No** salen los `CANCELADO` ni los borrados lógicos (heredado de **QC-88**). La abre el **permiso de terminados de QC-144**, validado en el service |
| 2026-09-22 | ¿En qué orden? | Por **fecha de terminado**, de la más reciente a la más antigua. Los que no tienen fecha van **al final**, marcados **«sin fecha»**, ordenados por número. Los nulos al final se declaran explícitos: Postgres los pone primero en orden descendente (precedente `product-prisma.ts:158`) |
| 2026-09-22 | ¿De dónde sale la fecha? | **Columna nueva en `orders`**, anulable, identificador en inglés (heredado de **QC-4**). **No** se rellena hacia atrás ni con `updated_at`, que cambia con cualquier edición. Se escribe **en la misma operación** que deja el pedido `ENTREGADO` al **Finalizar** del operario, que pasa a ser el único camino (ver «¿Quién mueve el estado?»). Convive con la anotación «finalizar» de **QC-82 R21**, que no añade columna |
| 2026-09-22 | ¿Qué ve el Administrador en Asignación? | **«Todos»**: todos los pedidos de su empresa **en cualquier estado**, habilitado por **`pedidos.consultar`** (reutilizado: el catálogo **no** cambia, sigue en 16 tras QC-144). **Sustituye** a «Mis asignados» y a «Terminados» para quien tenga ese permiso. La diferencia se hace por permiso, nunca por nombre de rol (**QC-86/87**) |
| 2026-09-22 | ¿Cómo se reparte la pantalla? | Según permiso. **Operador**: «Mis asignados», sin cambios. **Empacador**: «Mis asignados» + «Terminados». **Administrador** (con `pedidos.consultar`): solo «Todos», con filtro por estado |
| 2026-09-22 | ¿Qué se puede hacer desde «Terminados» y «Todos»? | **Solo ver.** Sin acciones ni detalle. «Todos» es **de solo lectura aunque el pedido esté asignado al propio Administrador** (ver Pregunta abierta 1). «Mis asignados» conserva su entrada a ejecución, como hoy |
| 2026-09-22 | ¿Cómo sale «Todos»? | Arranca en **todos los estados**, en el orden de la lista de trabajo (prioridad y antigüedad, **QC-88**). **Filtrado por Entregado**, se ordena como «Terminados». Cada fila muestra **estado y responsables** |
| 2026-09-22 | ¿Quién mueve el estado de un pedido? | **Solo la planta**: arrancar lo pone `EN_CURSO` (QC-63) y **Finalizar** lo pone `ENTREGADO`. **La edición en Pedidos deja de cambiar el estado**: hoy admite `EN_CURSO`/`ENTREGADO` (`lib/modules/pedidos/domain/order-transitions.ts`, `update-order.ts`) y eso se retira del caso de uso y del formulario. Al Administrador le queda **Cancelar**, con su motivo (**QC-34**). **Entra en esta ficha**: es lo que garantiza que todo entregado desde hoy tenga fecha |
| 2026-09-22 | ¿Paginación? | En el servidor, 10/25 por página, con la tabla compartida (heredado de **QC-55/QC-88**) |
| 2026-09-22 | ¿E2E? | **Sí, aquí**: se difirió desde **QC-144**. Entra como **Operador** (no ve Terminados), como **Empacador** (ve Terminados, no Todos) y como **Administrador** (ve Todos). Más el caso de que **Pedidos ya no ofrece cambiar el estado** |
| 2026-09-22 | ¿Dependencia o tabla nueva? | **Ninguna dependencia ni tabla.** Una columna, por migración |
| 2026-09-22 | ¿«Terminados» muestra la presentación? | **Sí**, la de cada pedido; los viejos salen «sin presentación». La columna la crea **QC-146**, que por eso **bloquea a esta** (añadido al acotar QC-146; `depends_on` pasa a QC-144 + QC-146) |
