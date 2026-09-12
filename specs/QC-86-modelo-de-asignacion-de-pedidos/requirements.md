# QC-86 — modelo-de-asignacion-de-pedidos · requirements.md

> **Zona** `backend` · **Complejidad** _la asigna el leader en F1.0_ · **depends_on** QC-83 ·
> **Rama** `feature/QC-86-modelo-de-asignacion-de-pedidos`
>
> **Alcance.** El **módulo nuevo `asignaciones`** y su modelo: la tabla que une un **pedido** con
> las **personas responsables** de prepararlo, su migración, y los **dos permisos** del módulo en
> el catálogo cerrado y en el seed. La asignación **se congela**: se puede marcar personas
> sueltas, aplicar uno o varios grupos de trabajo, o mezclar las dos cosas, y cuando se aplica un
> grupo el pedido guarda **las personas que ese grupo tenía en ese momento**, más la marca de que
> vinieron de él y **su nombre**. Sacar a alguien de un grupo mañana no le quita un pedido que ya
> estaba ejecutando, y meter a alguien no le hace aparecer pedidos viejos. El módulo conoce el
> pedido, la persona y el grupo por su **contrato público**, nunca por sus tablas.
>
> **Lo que NO entra.** La pantalla de asignar y desasignar → **QC-87**. El listado de pedidos
> asignados del Operador → **QC-88**. Ejecutar la receta → **QC-63**. Y **ningún caso de uso,
> ningún service, ninguna Server Action y ninguna pantalla**: es ficha de **modelo**, con el mismo
> límite que **QC-47** y **QC-83**.
>
> *Sembrado por `/afinar-feature` el 2026-09-11. La ficha nació el 2026-09-08 al acotar **QC-63**,
> que descubrió que el Operador entra por sus **pedidos asignados** y no por el catálogo de
> recetas. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del
> spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Dos, y **ninguna bloquea el modelo**: las dos son reglas de caso de uso y su sitio es **QC-87**.
Se escriben aquí para que no se descubran escribiendo la pantalla.

1. Volver a aplicar al mismo pedido un grupo que ya se le aplicó —y que entretanto ganó gente—,
   ¿refresca la lista de responsables o no hace nada? El modelo admite las dos.
2. ¿Qué estados de pedido admiten asignación? Un pedido `ENTREGADO` o `CANCELADO` no debería
   poder ganar responsables, pero eso es una transición y las transiciones son de QC-34/QC-87.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-11 | ¿Dónde vive esto? | **Módulo nuevo `asignaciones`**, carpeta propia con barril público y `/// @module asignaciones` en sus tablas. Conoce el pedido, la persona y el grupo **por contrato público**, nunca por sus tablas ni sus repositorios. Es lo que dice la ficha del board y lo que hace coherente el permiso; meterlo en `pedidos` dejaría un módulo con permisos de otro nombre y QC-88 acabaría pidiendo su sitio igual |
| 2026-09-11 | ¿Hasta dónde llega la ficha? | **Modelo + migración + permisos + armazón del módulo** (barril público y tipos). **Sin caso de uso, sin service, sin Server Action y sin pantalla**: mismo límite que **QC-47** y **QC-83**. Asignar y desasignar de verdad es **QC-87** |
| 2026-09-11 | Si la misma persona llega por dos caminos —suelta y en un grupo, o en dos grupos—, ¿qué recuerda el pedido? | **Un solo origen: gana el primero que la trajo.** Una fila por persona y pedido, sin deduplicar en ninguna lectura. **El precio queda escrito**: el pedido no sabrá que Ana también estaba en «Planta 2», y si se quita «Turno noche» Ana se va con él |
| 2026-09-11 | ¿Qué pasa con las personas de un grupo cuando se quita ese grupo del pedido? | **Se van con el grupo.** Quitar «Turno noche» saca a las personas marcadas con ese grupo, que es lo que espera quien lo quita. Quien tenga que quedarse se marca **suelta** |
| 2026-09-11 | ¿Se puede sacar a UNA persona que vino dentro de un grupo? | **Sí, persona a persona.** El pedido queda con el grupo aplicado pero sin ella, y la tabla tiene que poder representarlo. **La fila se borra de verdad**: excepción explícita al borrado lógico de **QC-4**, heredada de **QC-83 dec. 4**. El histórico que importa es el congelado, no el rastro de quién estuvo un rato |
| 2026-09-11 | ¿Alguien de la empresa A puede acabar asignado a un pedido con gente de la empresa B? | **No, y lo impide la BASE.** La fila lleva **`company_id`** y la base rechaza asignar a una persona de otra empresa o aplicar un grupo ajeno. Decisión 1 de **QC-83** traída entera, y por el mismo motivo: sin ella, un seed o un bug mete la fila y **QC-88 muestra pedidos ajenos sin que nada se ponga rojo**. **Aviso**: `orders` **no tiene `company_id`** hoy —el multi-empresa es la épica **QC-46**—, así que la coherencia que esta ficha puede exigir es **persona ↔ grupo ↔ fila**; el triángulo se cierra con el pedido cuando llegue QC-46 |
| 2026-09-11 | ¿Qué se congela exactamente al aplicar un grupo? | **Las personas que el grupo tenía en ese momento**, más la **marca de que vinieron de un grupo**, el **grupo** y **su nombre tal como se llamaba entonces**. Renombrar o dar de baja el grupo después **no toca** ninguna asignación ya hecha |
| 2026-09-11 | ¿Qué permisos trae el módulo y quién nace con ellos? | **`asignaciones.consultar`** («ver los pedidos que tengo asignados») y **`asignaciones.modificar`** («asignar y desasignar»), en el catálogo cerrado y en el seed. **El Operador nace con `consultar`** y **el Administrador recibe los dos** —si un permiso queda sin rol, `guard-permisos-sembrados` se pone roja—. **Al Operador no se le da `recetas.consultar`**: hoy ese permiso abre también el formulario de edición, que es justo lo que QC-63 prohíbe. Heredado de **QC-74** |
| 2026-09-11 | Una persona dada de baja, `inactive` o `blocked`, ¿sigue siendo responsable de sus pedidos? | **Sigue. Quien LEE la filtra.** Heredado de **QC-83 dec. 2**: la asignación está congelada y reactivar una cuenta no obliga a reasignar nada |
| 2026-09-11 | ¿Un pedido puede no tener responsables? | **Sí**, y es el estado de todos los pedidos que ya existen. Quedarse sin el último responsable **no** cambia el pedido |
| 2026-09-11 | ¿Qué pasa con las asignaciones si el pedido se da de baja? | **Se conservan.** El pedido tiene borrado lógico (**QC-33 dec. 19**) y su asignación es parte de su historia |
| 2026-09-11 | Identificadores de la base | **Inglés** y `snake_case`. Heredado de **QC-4**, **QC-47**, **QC-83** |
| 2026-09-11 | Marcas de tiempo | `created_at` y `updated_at` en las tablas nuevas. Heredado de **QC-4**, **QC-47**, **QC-83** |
| 2026-09-11 | RLS | **Activada y forzada** en las tablas nuevas. La frontera real sigue siendo el **service** (`docs/architecture.md > Acceso a datos y autorizacion`), no la policy. Heredado de **QC-47**, **QC-83** |
| 2026-09-11 | Migración | Con su **`down.sql`**, que revierte al **esquema exacto anterior**; si revertir obligara a perder o inventar un dato, la reversión **falla** en vez de hacerlo. Heredado de **QC-47 R25/R26** |
| 2026-09-11 | ¿Hace falta E2E? | **No hay E2E nuevo.** Ficha de modelo, sin pantalla que recorrer; los existentes tienen que **seguir verdes**. El E2E del flujo del Operador es de **QC-87**/**QC-88** |
| 2026-09-11 | ¿Librería nueva? | **Ninguna** |
