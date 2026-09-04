# QC-62 — pasos-de-receta-enriquecidos · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** — ·
> **Rama** `feature/QC-62-pasos-de-receta-enriquecidos`
>
> **Alcance.** El contenido de un paso de receta deja de ser una cadena y pasa a ser un
> **documento de estructura cerrada** —párrafo, marca de negrilla, marca de cursiva y lista de
> verificación, y nada más—, de modo que un mismo paso pueda mezclar texto y elementos marcables y
> conservar los saltos de línea. Esta ficha es **solo el contrato y el dominio**: el esquema que
> valida el documento en el borde, la desaparición del campo `type`, el tope por número de
> elementos, y el borrado de los pasos ya guardados. Los pasos se siguen guardando como **un único
> documento JSON en una sola columna** (QC-24 R4).
>
> **Lo que NO entra.** El editor enriquecido, el componente de lectura por pasos y el modal de
> vista previa: **QC-64 — editor-y-lectura-de-pasos**, que esta ficha bloquea. El acceso del
> Operador: **QC-63 — ejecutar-receta-operador**. Registrar quién marcó qué y cuándo: **no tiene
> ficha y esta acotación no la crea**. Y nada de esquema de base de datos: **no se abre
> `db/schema.prisma`** ni se crea tabla de paso.
>
> Sembrado por `/afinar-feature` el 2026-09-04 y **partido en dos el 2026-09-04** por la regla de
> partición de `fullstack` de `AGENTS.md > F1.0`. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

Ninguna: la única que había —cuántos elementos admite un paso— la cerró el humano al aprobar
el spec el 2026-09-04. Ver la última fila de la tabla de abajo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | ¿Qué forma tiene el contenido de un paso? | Un **documento de estructura cerrada**: párrafo, marca de negrilla, marca de cursiva y lista de verificación. **Nada más** —ni encabezados, ni enlaces, ni imágenes, ni tablas—. Un paso puede mezclar párrafos y elementos marcables en cualquier orden. |
| 2026-09-04 | ¿Qué pasa con el campo `type` (`'texto'` \| `'checklist'`)? | **Desaparece** del contrato. El documento del paso es la única fuente: si lleva lista de verificación, es un paso con checks. Un dato derivado que puede contradecir a su origen no se guarda —mismo criterio que el total del pedido en QC-33—. |
| 2026-09-04 | ¿Cómo se acota el tamaño de un paso? | **Sin tope de caracteres.** Se limita el **número de elementos** (párrafos e ítems) por paso; el número exacto lo fija la última fila de esta tabla. El tope de **50 pasos por receta se mantiene** (QC-24, QC-25). |
| 2026-09-04 | ¿Un paso puede quedar vacío? | **No**, heredado del contrato actual: un paso sin contenido se rechaza en el borde, igual que hoy se rechaza el paso de texto vacío. |
| 2026-09-04 | ¿Se convierten los pasos ya guardados? | **No: se BORRAN.** El humano confirma que no hay nada que preservar. Las recetas existentes quedan **sin pasos**, y **es irreversible**. No se escribe conversión de texto plano a documento. |
| 2026-09-04 | ¿Dónde se guardan los pasos? | **Sin cambios**: un único documento JSON en una sola columna, sin entidad ni tabla de paso, sin columna de orden derivada (**QC-24 R4**). Esta ficha **no toca `db/schema.prisma`**. |
| 2026-09-04 | ¿Cambian los permisos? | **No.** Las cinco operaciones de receta siguen siendo de **Administrador**, con el actor por parámetro y la autorización en el service (**QC-25 R1–R3**). Esta ficha no abre lectura a nadie. |
| 2026-09-04 | ¿Quién valida el documento? | El **borde**, con el esquema del módulo `recetas`: nada sin tipar ni sin validar cruza hacia el dominio (R38 de QC-25). El documento se valida por su **forma**, no por su contenido. |
| 2026-09-04 | ¿Cuántos elementos admite un paso? | **30** (`MAX_STEP_ELEMENTS`). Cerrada por el humano al aprobar el spec en F1.4, sobre la propuesta razonada de `design.md > 3`: con los 50 pasos vigentes el techo por receta queda en 1.500 elementos, y la asimetría manda —subir el tope después solo relaja validación, bajarlo deja recetas ya guardadas que su propio esquema rechaza al reeditarlas—. **Riesgo aceptado a la vez**: sin tope de caracteres, 30 elementos pueden ser un JSON grande, y el único freno hoy es el límite de cuerpo por defecto de las Server Actions, que da un error genérico y no de validación. |
