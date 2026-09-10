# QC-63 — ejecutar-receta-operador · requirements.md

> **Zona** `fullstack` · **Complejidad** `medium` · **depends_on** QC-62, QC-64, **QC-88** ·
> **Rama** `feature/QC-63-ejecutar-receta-operador`
>
> **Alcance.** La pantalla con la que un **Operador ejecuta la receta de un pedido que tiene
> asignado**: entra desde su lista de pedidos asignados, recorre los pasos de uno en uno marcando
> los elementos, y termina. **Abrirla pone el pedido `EN_CURSO`; Finalizar lo pone `ENTREGADO`**,
> mostrando una confirmación visible antes de volver a la lista. La pantalla tiene **dirección
> propia, enlazable y recargable**, no permite modificar nada, y deja **cambiar la unidad en que se
> ven las cantidades** —la misma línea en litros o en mililitros—.
>
> **Lo que NO entra.** Los grupos de trabajo → **QC-83**, **QC-84**, **QC-85**. La tabla de
> asignación y el asignar desde el pedido → **QC-86**, **QC-87**. La lista de pedidos asignados,
> incluido el bloqueo de un pedido que otro responsable ya está preparando → **QC-88**: esta ficha
> **empieza** en la pantalla de ejecución. El asistente de pasos → **QC-64**, que se **monta** y no
> se reescribe. Registrar **quién marcó qué y cuándo** → sigue **fuera de alcance** y esta acotación
> no le crea ficha.
>
> *Sembrado por `/afinar-feature` el 2026-09-08, y la ficha del board **reescrita entera** ese
> mismo día: su versión anterior daba por hecho que el Operador navegaría el catálogo de recetas.
> El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec.
> `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-08 | ¿Con qué permiso entra el Operador a la pantalla? | **No con `recetas.*`.** El permiso es del **módulo nuevo de asignación** (QC-86), con `asignaciones.consultar` y `asignaciones.modificar` — el patrón de **dos permisos por módulo** que fijó **QC-74**, sin inventar un tercero. El Operador nace con `inventario.consultar` + `asignaciones.consultar`. **No recibe `recetas.consultar`**: hoy ese permiso corta **las dos** pantallas de recetas —`formulas/page.tsx` y `formulas/[id]/page.tsx`, que es el **formulario de edición**—, así que dárselo le abriría justo lo que esta ficha dice que no debe ver |
| 2026-09-08 | ¿Cómo llega el Operador a la receta? | **Desde un pedido que tiene asignado**, no navegando el catálogo. `Order.recipeId` ya existe (QC-33), así que el puente pedido→receta no se inventa aquí. La lista de trabajo la construye **QC-88**; esta ficha empieza donde esa lista termina |
| 2026-09-08 | Con esa cadena por delante, ¿QC-63 se reduce o absorbe el listado? | **Se reduce y queda bloqueada.** Pasa a ser solo «ejecutar la receta de un pedido asignado», con `depends_on` hacia **QC-88**. No arranca hasta que la cadena exista. Cuando le toque, es una ficha pequeña de verdad |
| 2026-09-08 | ¿El bloqueo de *Siguiente* necesita una vía de escape con motivo escrito? | **No: bloquea sin excepción**, heredado tal cual de **QC-64 decisión 4**. Es lo que ya está construido y probado, y no arrastra dónde guardar un motivo —que hoy no tiene ficha ni tabla, y que sin el registro del marcado quedaría sin contexto—. **Esto cierra la pregunta abierta 1 de QC-64**, que estaba escrita esperando explícitamente a esta ficha. Si en planta duele, es ficha nueva con el caso real medido |
| 2026-09-08 | ¿Qué hace Finalizar? | **Confirmación visible en pantalla y vuelta a la lista** de pedidos asignados. Cierra el recorrido de forma visible **sin guardar nada de lo marcado**, que es lo que la ficha ya declaró fuera de alcance |
| 2026-09-08 | ¿Ejecutar mueve el estado del pedido? | **Sí: abrir → `EN_CURSO`, Finalizar → `ENTREGADO`.** El operario que prepara la mezcla es la señal más fiable de cuándo arrancó y cuándo está lista, y el Administrador deja de mover a mano dos estados que otro conoce mejor. **A través del caso de uso de transición de `pedidos` (QC-34)**: esta ficha **no escribe la columna por su cuenta** ni redefine las transiciones. Consecuencia asumida: esta pantalla **escribe**, no es solo de lectura |
| 2026-09-08 | ¿Se escalan las cantidades a la cantidad del pedido? | **No se escala nada.** La pantalla muestra el **factor bien visible y fijo** —«Pedido 250 L · receta para 100 L · ×2,5»— y las líneas y los pasos **tal como están escritos**. Escalar solo las líneas sería **peor** que no escalar: los pasos de **QC-62** son texto libre, y si el autor escribió «cargar el reactor con **90 L** de agua» dentro de un párrafo, ese número no se puede escalar sin adivinar — la pantalla mostraría `225 L` en la lista y `90 L` en el paso que el operario está leyendo, y eso en planta es un lote perdido. Ninguna cifra de esta pantalla se contradice con otra **porque ninguna se toca** |
| 2026-09-08 | ¿Se puede ver una cantidad en otra unidad? | **Sí**: la misma línea en **litros o en mililitros**, para no obligar a nadie a convertir de cabeza en planta. Cambia **solo cómo se ve**; no altera la receta ni el pedido, y no persiste nada. **Esta ficha es el PRIMER CONSUMIDOR de la conversión entre unidades de QC-76**, que hasta hoy no usaba nadie —`docs/architecture.md > Preguntas abiertas del dominio > 1` decía que quien la estrenara iría en su propia ficha, y la estrena esta—. Solo se ofrecen unidades que **comparten base efectiva**: ofrecer una conversión imposible es un **error**, no un resultado raro |
| 2026-09-08 | ¿Se registra quién marcó qué y cuándo? | **No. Fuera de alcance**, ya escrito en la ficha del board y reafirmado en **QC-62**. Esta acotación **no le crea ficha** |
| 2026-09-08 | ¿Qué se hereda montado y no se re-crea? | El asistente **`StepReader`** de **QC-64** (`components/shared/step-reader/`), que **recibe todo por props** y cuya propia cabecera dice que «QC-63 podrá montarlo pasándole otro `onFinish` sin tocar una línea de aquí» — no lee datos, no importa `lib/composition`, ni Server Actions, ni `next/navigation`, y un **test de fuente** lo afirma. Más el corte por permiso de pantalla de **QC-75** (`requirePagePermission`, **404 y no 403**) y la autorización **en el service** antes del repositorio |
| 2026-09-08 | ¿Hace falta E2E? | **Sí.** `CHECKPOINTS.md` la exige para flujos de permisos y este lo es: **Operador entra, ve su pedido asignado, lo abre, el pedido queda `EN_CURSO`, recorre los pasos hasta Finalizar y el pedido queda `ENTREGADO`**. Y el camino negativo: quien no tiene `asignaciones.consultar` recibe **404** |
| 2026-09-08 | ¿Multiplataforma? | **Sin excepción**, heredado de **QC-26 R19, R34, R50** y reafirmado en QC-64: objetivos táctiles de **44×44 px**, **nada detrás de `:hover`**, y la pantalla operable por teclado. Es la ficha donde más pesa: se usa en planta, en un móvil o una tablet, posiblemente con guantes |
