# QC-146 — presentacion-del-pedido · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** — · **Rama:** `feature/QC-146-presentacion-del-pedido`
>
> **Alcance.** Cada pedido declara en qué presentación se entrega lo fabricado, elegida del
> catálogo de presentaciones de su empresa (el mismo que usan los lotes). Es obligatoria al crear
> y al editar; los pedidos ya cargados quedan «sin presentación». Solo informa: no cambia la
> cantidad, ni el importe, ni el inventario. Se elige en el alta/edición de `/pedidos`, se muestra
> en su listado y en `/asignacion` (lista y pantalla de ejecución del Operador).
>
> **Lo que NO entra.** Mostrarla en la lista de terminados del Empacador → **QC-145** (queda
> bloqueada por esta). Contar la cantidad en envases o convertir envases a litros → **QC-130**.
> Descontar envases vacíos del inventario o reservarlos → fuera de alcance, sin ficha (QC-141 no
> los cubre). Filtrar u ordenar el listado por presentación → no se hace.
>
> Sembrado por `/afinar-feature` el 2026-09-22. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-22 | ¿Qué es «la presentación del pedido»? | El **envase en que se entrega lo fabricado** (bidón, tambor, saco). No es la unidad de la cantidad |
| 2026-09-22 | ¿De qué catálogo sale? | **El catálogo existente** `presentations` (Configuración › Presentaciones, QC-20/QC-45), el mismo de los lotes. No nace catálogo propio. Solo se elige de las existentes: el selector no crea (heredado del selector de unidad de QC-35) |
| 2026-09-22 | ¿Es obligatoria? | **Sí, al crear y al editar.** Los pedidos que ya existen quedan **sin presentación** —en la base la columna admite vacío por ellos— y no se rellenan con una por defecto (regla 6). Al editar uno de esos hay que elegirla para guardar |
| 2026-09-22 | ¿Afecta a cantidad, importe o inventario? | **No: solo informa.** La cantidad sigue en unidades de la receta, `ingredients_cost` (QC-123) no cambia y no se descuentan envases del inventario |
| 2026-09-22 | ¿Presentación de otra empresa? | **Imposible por construcción**: FK compuesta con `company_id`, como las del pedido desde QC-60 |
| 2026-09-22 | ¿Y si se intenta borrar una presentación usada por un pedido? | **Se rechaza** por la FK (`ON DELETE RESTRICT`); el borrado de presentaciones ya es físico y bloqueado por FK. *Heredado de QC-20 D6 y QC-45* |
| 2026-09-22 | ¿Se puede cambiar? | **Sí, mientras el pedido sea editable** (`PENDIENTE`/`EN_CURSO`); `ENTREGADO` y `CANCELADO` no admiten edición. *Heredado de QC-34 D8* |
| 2026-09-22 | ¿Quién la escribe y quién la ve? | La escribe quien crea/edita pedidos: **solo el Administrador** (QC-34 D1). La ven también quienes llegan por `asignaciones` (Operador), porque quien prepara necesita saber el envase. **No nace permiso nuevo** |
| 2026-09-22 | ¿Dónde se ve? | **Alta y edición** (panel lateral de `/pedidos`), **listado de pedidos** (columna, solo se muestra, sin filtro ni orden —mismo criterio que el importe, QC-123/QC-68—) y **`/asignacion`**: su lista y la pantalla de ejecución. Los pedidos viejos se muestran «sin presentación» |
| 2026-09-22 | ¿Y en los terminados del Empacador? | **Sí, pero lo pinta QC-145**, que aún no existe; queda bloqueada por esta (issue link escrito en el board el 2026-09-22) |
| 2026-09-22 | ¿E2E? | **Sí, ampliando el recorrido de pedidos de QC-35**: crear con presentación → verla en la lista. Es barato porque Playwright y el recorrido ya existen |
| 2026-09-01 | Forma de la tabla | Borrado **lógico** de pedidos intacto e **identificadores en inglés**. *Heredado de QC-4/QC-33* |
| 2026-09-22 | ¿Dependencias nuevas? | **Ninguna** |
