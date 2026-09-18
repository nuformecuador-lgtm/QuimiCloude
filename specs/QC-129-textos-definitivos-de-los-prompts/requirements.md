# QC-129 — textos-definitivos-de-los-prompts · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** QC-109 ·
> **Rama** `feature/QC-129-textos-definitivos-de-los-prompts`
>
> **Alcance.** Dar a las dos estrategias su prompt **definitivo**, y hacerlo **fuera del
> repositorio**: el texto de cada una llega por su propia **variable de entorno**, se lee en el
> momento de procesar y, si falta, el procesamiento falla nombrándola sin llamar a Gemini. Los dos
> `.json` provisionales que QC-109 dejó montados **desaparecen**. El criterio de que un prompt es
> bueno es una **revisión humana registrada** en `docs/`, sobre PDFs reales aportados por el humano.
>
> **Lo que NO entra.** El enum, el mapeo de estrategia a modo y el cableado de la capacidad →
> siguen siendo de **QC-109**. Guardar o interpretar lo que responde la IA → **QC-111**. Recortar
> las imágenes del PDF → **QC-110**.
>
> **Esta ficha NO la puede cerrar un agente sola.** Escribir los dos textos en Vercel y firmar la
> revisión los hace una persona. El arnés pone el mecanismo, el protocolo y la plantilla del
> registro.
>
> *Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Quién pone las dos variables y en qué entornos.** Producción es claro; **preview** no: hoy no
   consta quién administra ese entorno en Vercel ni si tendrá los textos. Con `[D9]` —sin texto de
   repuesto— un preview sin variables no puede procesar ningún PDF.
2. **Cómo las reciben los tests y el desarrollo local.** La suite corre hoy **sin claves
   configuradas** a propósito, y `ai-config-env.ts` lo declara en su cabecera como el motivo de leer
   dentro de la función y no al importar. Con los textos fuera del repositorio está sin decidir si
   los tests de la estrategia inyectan un texto de mentira por la misma fábrica o si esas pruebas se
   saltan cuando la variable no está.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-18 | En un catálogo de proveedor, ¿qué campos se le piden a la IA? | Los que el modelo **ya sabe guardar** en `supplier_catalog_lines`: nombre, presentación, unidad, precio, compra mínima y tiempo de entrega. Ni moneda ni vigencia ni referencia del proveedor: hoy no tienen columna, y la moneda es la **pregunta abierta 5 del dominio** (`docs/architecture.md`), sin decidir. `[D1]` |
| 2026-09-18 | En una fórmula, ¿qué partes del documento importan? | Las que guardan `recipes` y `recipe_lines`: nombre, descripción, cada materia prima con su **cantidad** y su **unidad**, y los **pasos** de preparación en su orden. `[D2]` |
| 2026-09-18 | ¿En qué forma contesta la IA? | **JSON**, con la forma declarada dentro del propio texto del prompt. Este módulo **sigue sin interpretarla** —eso no se toca, es `[D10]` de QC-109—; quien la parsea será QC-111, y por eso la forma se fija ahora y no se reescribe el prompt entonces. `[D3]` |
| 2026-09-18 | ¿Qué hace la IA con un campo que el PDF no trae? | Lo devuelve **vacío (`null`)** y **nunca lo inventa ni lo deduce** del contexto. Un tiempo de entrega inventado en un catálogo de proveedor es un dato falso con el que después alguien compra. `[D4]` |
| 2026-09-18 | ¿Cómo se comprueba que un prompt es BUENO? | **Revisión humana registrada** en `docs/`: se pasan los PDFs de muestra una vez y una persona firma, campo por campo, si salió bien, mal o no estaba. **Ningún test llama a Gemini**: el gate corre sin red y sin gastar. Mismo patrón que la pasada en iPhone de QC-114. `[D5]` |
| 2026-09-18 | ¿Hay PDFs de muestra? | **Sí, los aporta el humano** (un catálogo de proveedor y una fórmula reales). La tarea de revisión **no nace bloqueada**. `[D6]` |
| 2026-09-18 | ¿Dónde vive el texto de cada prompt? | **Fuera del repositorio, en una variable de entorno.** **DEROGA `[D6]` y `[D15]` de QC-109 y su R4**, que lo fijaban dentro del módulo y en tiempo de compilación. Sigue sin leerse **disco ni red** en ejecución: una variable de entorno no es ninguna de las dos, así que el motivo original de aquella decisión —lo que no entra en el paquete de despliegue no existe en ejecución— sigue respetado. `[D7]` |
| 2026-09-18 | ¿Una variable o dos? | **Dos**, una por estrategia: `CATALOG_PROMPT` y `FORMULA_PROMPT`. Se cambia el prompt del catálogo sin tocar el de la fórmula, y si falta una el error dice cuál. `[D8]` |
| 2026-09-18 | ¿Y si la variable no está? | **El procesamiento falla nombrándola y NO llama a Gemini.** Sin texto de repuesto y sin valor por defecto. Es el criterio ya escrito para `GEMINI_MODEL` en `ai-config-env.ts`: un valor por defecto escrito a mano se descubre en producción, no en un test. `[D9]` |
| 2026-09-18 | ¿Cuándo se leen? | **En el momento de la invocación**, nunca al importar el módulo. *Heredado de `ai-config-env.ts`*, y es lo que permite que `lib/composition` construya la fachada y que la suite entera corra sin claves configuradas. `[D10]` |
| 2026-09-18 | ¿Qué pasa con los dos `.json` provisionales? | **Desaparecen**, y con ellos el mapa de textos `PROMPT_BY_STRATEGY` tal como existe hoy. Ya no hay ningún texto de prompt en el repositorio. `[D11]` |
| 2026-09-18 | Quitar la marca de provisional pone rojo un test de QC-109. ¿Qué se hace? | **QC-129 actualiza `tests/unit/documentos/qc109-alcance.test.ts`** —R4, R6 y las afirmaciones sobre `PROMPT_BY_STRATEGY`— y añade una **nota fechada** al `requirements.md` de QC-109 diciendo qué se derogó y por qué. Precedente: la **T3 de QC-81**, que actualizó un test que se ponía rojo por hacer justo lo que la ficha pedía. `[D12]` |
| 2026-09-18 | ¿Se versionan los textos? | **No queda ningún rastro del texto vigente en el repositorio.** El registro de revisión de `docs/` existe, con fecha y veredicto por campo, pero **no copia el prompt**. Consecuencia aceptada y escrita: un veredicto **no se puede volver a comprobar** contra el texto al que se refería. `[D13]` |
