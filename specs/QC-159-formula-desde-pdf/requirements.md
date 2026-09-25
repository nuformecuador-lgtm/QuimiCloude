# QC-159 — formula-desde-pdf · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** `QC-142` ·
> **Rama:** `feature/QC-159-formula-desde-pdf`
>
> **Alcance.** Lo que la IA lee de un PDF de fórmula (estrategia `formula`, por texto, subido desde
> el listado /produccion/formulas con el botón de QC-160) se convierte en una RECETA —nombre,
> descripción, ingredientes en porcentaje y pasos— tras una revisión humana en una pantalla propia.
> Cada ingrediente se asigna a un producto existente o se crea como materia prima; si la receta ya
> existe, el revisor elige entre reemplazarla o crear una nueva con otro nombre.
>
> **Lo que NO entra.** El texto del prompt de fórmula en Vercel y su revisión firmada → **QC-157**
> (ficha humana; no bloquea esta, el E2E simula la IA). La subida y el botón → **QC-107/QC-160**,
> ya en dev. Catálogo desde PDF → **QC-158**. Imagen de la receta: la estrategia de fórmula no
> recorta imágenes.
>
> Sembrado por `/afinar-feature` el 2026-09-25. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Directo o revisado? | **Revisión antes de guardar** (decidido al nacer, con QC-158). |
| 2026-09-25 | ¿Dónde se revisa? | **Pantalla propia** `/produccion/formulas/importar/[documentoId]`, sin lista de pendientes. Heredado de QC-158 [F5]. |
| 2026-09-25 | Ingredientes | **En porcentaje**, hasta 2 decimales, > 0, suma **exactamente 100,00 %**; la revisión muestra la suma y **no confirma** si no cuadra; sin líneas no se confirma. Heredado de QC-147 (D4, D5, D14, D15). Un % que la IA no trae llega vacío y lo rellena el revisor. |
| 2026-09-25 | ¿Ingrediente que no existe como producto? | **Elegir o crear.** Se preselecciona el producto si el nombre normalizado coincide; si no, el revisor elige uno existente o lo **crea ahí mismo como materia prima** con el nombre leído (editable). Sin producto asignado la línea no se confirma. |
| 2026-09-25 | ¿Qué productos pueden ser ingrediente? | Nunca un **producto terminado** (heredado de QC-150 R30). |
| 2026-09-25 | ¿Receta con el mismo nombre ya existe? | **El revisor elige**: *reemplazar* sus ingredientes, pasos y descripción por lo leído, o *cambiar el nombre* y crear una receta nueva. La revisión avisa del choque antes de confirmar. |
| 2026-09-25 | ¿Pasos? | **Editables del todo**: corregir, borrar, añadir y reordenar. Una receta sin pasos se puede guardar, como hoy. |
| 2026-09-25 | ¿Imagen? | **No**: la fórmula se procesa por texto. |
| 2026-09-25 | ¿Permiso? | Confirmar exige **`recetas.modificar`** (QC-86); crear un producto desde la revisión exige **también `inventario.modificar`** (análogo a QC-158 [F6]). Validado en el service. Subir sigue con `documentos.modificar` (QC-142). |
| 2026-09-25 | ¿E2E? | **Sí**, con la IA y la cola **simuladas** (patrón de QC-107/QC-158). |
| Heredada de la spec 4 | Borrado e identificadores | Borrado **lógico** e identificadores de base de datos **en inglés**. |
