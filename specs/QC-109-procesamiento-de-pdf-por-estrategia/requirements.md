# QC-109 — procesamiento-de-pdf-por-estrategia · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** QC-106, QC-108 ·
> **Rama** `feature/QC-109-procesamiento-de-pdf-por-estrategia`
>
> **Alcance.** Procesar un PDF según una **estrategia** elegida por un enum cerrado de dos
> valores: `catalogo`, que lo lee como **imagen**, y `formula`, que lo lee como **texto**. Cada
> estrategia aporta su propio texto de prompt desde un archivo del módulo, y las dos llaman a la
> lectura con IA que **QC-108** ya dejó publicada. Devuelve el texto que escribió la IA, tal cual,
> y además lo registra mientras no haya nada que lo guarde.
>
> **Lo que NO entra.** La cola que la ejecuta → **QC-111**. Guardar o devolver el resultado de
> forma **estructurada** → **QC-111**. El recorte de imágenes del PDF → **QC-110**. Los textos
> **definitivos** de los prompts → **QC-129**.
>
> *Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

**Qué se registra exactamente, y con qué recorte.** `[D5]` cierra que la estrategia saca el
resultado por consola mientras nada lo guarde, pero **no cuánto**. El texto de un catálogo entero
puede ser muy largo, y un PDF de proveedor puede traer datos que no conviene volcar en los
registros de la aplicación. Queda abierto si se registra completo, recortado a un tope, o solo un
resumen (por ejemplo, la estrategia, el número de páginas y el tamaño del texto). **No se rellena
con un supuesto.**

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-14 | ¿Cuántas estrategias y qué hace cada una? | Dos, en un enum cerrado: `catalogo` lee el PDF **como imagen**, `formula` lo lee **como texto**. Ningún tercer valor. `[D1]` |
| 2026-09-14 | ¿Se invoca directamente? | No. Se ejecuta **dentro del trabajo de la cola** (QC-111). Esta ficha publica la capacidad; no la dispara nadie todavía. `[D2]` |
| 2026-09-18 | Los prompts nacían vacíos, pero QC-108 rechaza un prompt en blanco. ¿Qué hace una estrategia sin prompt escrito? | **Los archivos nacen con un texto provisional que SÍ funciona.** Deroga «contenido vacío» del 2026-09-14, que no podía funcionar: `ai-read-input.ts:19` exige `z.string().trim().min(1)`, así que con prompts vacíos las dos estrategias nacían incapaces de ejecutarse. `[D3]` |
| 2026-09-18 | ¿Cómo se evita que el texto provisional pase por definitivo? | Cada archivo de prompt **declara en su cabecera que es provisional** y remite a **QC-129**, que es quien escribe los definitivos y quita esa cabecera. `[D4]` |
| 2026-09-18 | ¿Qué devuelve? La ficha decía «solo un `console.log`». | **Devuelve el texto** tal cual lo escribió la IA **y además lo registra** mientras nada lo guarde. Motivo: QC-111 es quien la va a invocar, y una función que no devuelve nada la obliga a rehacerse. `[D5]` |
| 2026-09-18 | ¿Dónde viven los textos de prompt y cómo llegan al código? | **Archivos dentro del módulo**, traídos **en tiempo de compilación**. No se lee disco en ejecución: la app corre en Vercel y lo que no entra en el paquete de despliegue no existe en tiempo de ejecución. `[D6]` |
| 2026-09-18 | ¿Quién puede dispararlo y dónde se comprueba? | **Sin permiso propio.** Corre dentro del trabajo de la cola, donde no hay nadie delante; valida **quien encola**. No se duplica la comprobación ni se inventa un actor. `[D7]` |
| 2026-09-18 | ¿Cómo se expone la capacidad? | **Puerto + adaptador driven**; el dominio no conoce la librería ni el nombre del proveedor. *Heredado de QC-108 `[D8]`.* `[D8]` |
| 2026-09-18 | ¿Se vuelven a declarar los límites? | No. El tope de páginas, el de tamaño, la resolución y el plazo de 60 s **se importan de `limits.ts`** y no se reescriben en ningún archivo nuevo. *Heredado de QC-108 R5 y R7.* `[D9]` |
| 2026-09-18 | ¿Se interpreta lo que responde la IA? | No. El texto vuelve **tal cual**, sin recortarlo, reordenarlo ni convertirlo en ninguna estructura. Eso es QC-111. *Heredado de QC-108 R6.* `[D10]` |
| 2026-09-18 | ¿Idioma de los identificadores? | **Inglés.** *Heredado de la spec 4.* `[D11]` |
| 2026-09-18 | ¿Hace falta alguna librería nueva? | **Ninguna.** `@google/genai` ya entró con QC-108, con los cuatro checks, aprobación humana y su fila en `docs/dependencias.md`. Si el diseño propone una, es señal de que algo se torció. `[D12]` |
| 2026-09-18 | ¿Cómo se valida el enum? | Unión de literales con zod, igual que el `mode` de QC-108. No es tabla ni enum de Prisma: aquí no se persiste nada. *Heredado de QC-108.* `[D13]` |
| 2026-09-18 | ¿Hace falta E2E? | **Diferido, con motivo escrito**: no hay pantalla ni recorrido de usuario que ejercitar — esta ficha no la invoca nadie todavía. El E2E lo tendrá **QC-107**, que es quien pone la interfaz. `[D14]` |
