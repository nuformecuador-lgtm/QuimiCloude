# QC-102 — responsables-en-la-pantalla-de-pedidos · requirements.md

> **Zona** `fullstack` — **creció de `frontend` al acotar** · **Complejidad** `high` ·
> **depends_on** QC-87 (hecho) · **Rama** `feature/QC-102-responsables-en-la-pantalla-de-pedidos`
>
> **Alcance.** Ver y gestionar los responsables de un pedido desde la pantalla de pedidos. El
> **listado** muestra por fila hasta **tres iniciales y un `+N`**; el **detalle y el panel** los
> muestran **todos**, agrupados por su origen y con **el nombre del grupo** cuando la asignación
> vino de uno. El panel permite marcar personas sueltas, aplicar grupos, quitar a una persona y
> **quitar un grupo entero**. Añade la **única pieza de backend que falta**: una consulta de
> responsables **para varios pedidos a la vez**.
>
> **Lo que NO entra.** Los cuatro casos de uso de asignar y desasignar → **QC-87** (hecho), que
> esta ficha **consume**. El modelo → **QC-86** (hecho). El listado del Operador → **QC-88**.
>
> *Sembrado por `/afinar-feature` el 2026-09-13. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe `spec_author` (F1.2)._

## Preguntas abiertas

Ninguna.

**Nota para `design.md`, que NO es decisión de acotación:** `asignaciones` **ya depende de
`pedidos`** (consume `OrderCatalog`, QC-87), así que la consulta en lote **no puede crear un ciclo
`pedidos → asignaciones`**. Dónde se compone —en la página o en un caso de uso— lo decide el
diseño, no esta acotación.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-13 | ¿Dónde viven los responsables dentro de la pantalla? | **Sección dentro del `order-sheet` que ya existe** —no se monta un panel nuevo—, más una **entrada propia «Responsables»** en las acciones de la fila que abre ese mismo panel en esa sección. **Motivo**: sin la segunda puerta, ver quién prepara un pedido obligaría a abrir el formulario de **edición**, que quien solo consulta no puede guardar |
| 2026-09-13 | ¿Qué ve quien puede ver pedidos pero NO tiene `asignaciones.modificar`? | **El panel, en solo lectura**: iniciales, nombres y nombre de grupo, **sin** buscador, **sin** selector y **sin** quitar. Ver quién prepara un pedido basta con `pedidos.consultar` (QC-87 dec. 5), así que negarle el panel entero le escondería algo a lo que tiene derecho. El corte real lo sigue ejerciendo el caso de uso |
| 2026-09-13 | ¿Y en un pedido `ENTREGADO` o `CANCELADO`? | **Los controles de asignar no aparecen, y sin frase que lo explique.** **Consecuencia escrita, aceptada por el humano**: la misma fila **sí** explica por qué no se puede editar, cancelar ni eliminar (`FINAL_ORDER_REASON`, constante visible y exportada de QC-35), así que la pantalla explicará una cosa y callará la otra a dos centímetros |
| 2026-09-13 | ¿El listado pinta responsables? | **Sí.** Es el motivo de que la ficha **deje de ser `frontend` y pase a `fullstack`**: se verificó en disco que el listado **no tiene de dónde sacarlos** —`OrderView` tiene catorce campos y ninguno de asignación, y el módulo `pedidos` no tiene **ni una** referencia a `orderAssignment`— |
| 2026-09-13 | ¿Cómo llega el dato al listado? | **Una consulta EN LOTE por página.** Se añade a `asignaciones` una consulta de responsables para **varios** pedidos y se **compone**, exactamente como hoy se compone `recipeName` en `list-orders.ts`: la página de pedidos primero, los nombres de golpe después. **NI UN JOIN** —lo prohíben **R53** y **QC-33 R31/R32**, y QC-33 dejó las FK como **escalares sin `@relation`** justamente para que no haya relación que navegar ni por descuido— **NI UNA CONSULTA POR FILA**, que con 20 filas serían 20 por render en la pantalla más transitada |
| 2026-09-13 | ¿Hace falta un join a grupos para el nombre del grupo? | **No.** **QC-86 congeló `workGroupName` dentro de la fila de asignación**: el nombre ya viaja con el dato, y por eso además sobrevive a un renombrado posterior |
| 2026-09-13 | ¿El panel vuelve a consultar al abrirse? | **No**: la fila del listado ya trae sus responsables, así que abrir el panel **no cuesta ninguna consulta**. El refresco tras asignar es **`router.refresh()`**, sin `revalidatePath`. Heredado de QC-38/QC-45/QC-67, verificado en disco |
| 2026-09-13 | ¿Qué se ve si no caben en la fila? | **Tres iniciales y un `+N`**, cuyo tooltip lista **por nombre** a los que faltan. La columna no crece ni encoge según el pedido. En el **detalle y el panel no hay límite**: salen todos |
| 2026-09-13 | ¿La pantalla ofrece quitar un grupo entero? | **Sí**, agrupando a los responsables **por su origen**, con acción propia por grupo, **además** de quitar persona a persona. Sin esto, el caso de uso que **QC-87 ya construyó y probó** (R32–R34) se quedaría **sin puerta** y deshacer un grupo de ocho serían ocho acciones |
| 2026-09-13 | ¿Qué es un «avatar» aquí, exactamente? | Un **círculo con las iniciales** (`John Doe` → `JD`) y **tooltip con el nombre**. **Sin foto, y no es una preferencia**: `OrderResponsible` tiene **tres claves** —`userId`, `displayName`, `origin`— y ninguna imagen. **`getInitials`, `avatar.tsx` y `tooltip.tsx` ya existen en disco**: no se invoca la CLI de shadcn ni entra dependencia alguna |
| 2026-09-13 | Lo que se hereda de disco y no se decide otra vez | El trío **vacío / error / skeleton** por lista (QC-45/QC-67/QC-85), y el **toast de `sonner`** —ya en uso en `order-sheet.tsx`— para decir **cuántas personas se añadieron**, que es lo que QC-87 dec. 2 dejó pedido |
| 2026-09-13 | Lo que se hereda de QC-87 y **no se reabre** | Los **estados que admiten asignación** (solo `PENDIENTE` y `EN_CURSO`); **reaplicar un grupo añade** a los que faltan y no toca a los que ya estaban; **solo cuentas `active`**; **quién ve y quién asigna**; el **congelado** de personas y nombre; **Server Actions con `FormData`**, errores por **`code` estable** e identificadores en **inglés**; y **ninguna librería nueva**. Las doce decisiones completas viven en `specs/QC-87-asignar-responsables-a-un-pedido/requirements.md` |
| 2026-09-13 | ¿Hace falta E2E? | **Sí, y ya estaba acordado**: QC-87 dec. 11 definió el recorrido —abrir un pedido, marcar una persona, aplicar un grupo, sacar a alguien y comprobar que **el listado** muestra los avatares y el nombre del grupo— **incluyendo el listado**. Dejar el listado fuera del alcance habría roto un E2E ya pactado |
