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

> Cada requisito cita entre corchetes la decisión cerrada que lo origina. Las 16 decisiones
> (`[D1]`…`[D16]`) quedan citadas al menos una vez.

**R1.** El sistema DEBE aceptar como estrategia exactamente dos valores, `catalogo` y `formula`,
validados en el borde con una unión de literales de zod. SI la estrategia recibida es cualquier
otro valor, ENTONCES el sistema DEBE rechazar la entrada con el código de entrada inválida y NO
DEBE llamar a la lectura con IA. `[D1]` `[D13]`

**R2.** CUANDO la estrategia es `catalogo`, el sistema DEBE pedir la lectura con IA en el modo que
manda las **páginas rasterizadas** del PDF, que es el literal `images` de `AiReadMode`. `[D1]`

**R3.** CUANDO la estrategia es `formula`, el sistema DEBE pedir la lectura con IA en el modo que
manda el **PDF entero** para que la IA lo lea como texto, que es el literal `pdf` de `AiReadMode`.
`[D1]`

**R4.** El sistema DEBE tomar el texto del prompt de un archivo **`.json`** propio de cada
estrategia, importado como módulo y por tanto incluido en el paquete **en tiempo de compilación**.
El sistema NO DEBE leer el sistema de archivos ni la red en tiempo de ejecución para obtener un
prompt. `[D6]` `[D15]`

**R5.** El sistema DEBE partir con un texto de prompt **no vacío** para cada una de las dos
estrategias, de modo que la entrada construida por cada estrategia satisfaga
`aiReadInputSchema` (`prompt: z.string().trim().min(1)`) sin que quien llama tenga que aportar
texto alguno. `[D3]` `[D15]`

**R6.** Cada archivo de prompt DEBE declarar que su texto es **provisional**, y cuál es la ficha que
escribirá el definitivo, **en campos de datos del propio `.json`** (`provisional` y `loDefine`), no
en un comentario. `[D4]` `[D15]`

**R7.** CUANDO la lectura con IA termina bien, el sistema DEBE devolver a quien llamó el texto que
escribió la IA **tal cual**, sin recortarlo, reordenarlo, resumirlo ni convertirlo en ninguna
estructura, junto con la estrategia usada. `[D5]` `[D10]`

**R8.** El sistema DEBE entregar un **resumen** de cada ejecución al **registro**, exactamente una
vez por ejecución —tanto en éxito como en fallo—, a través de una dependencia inyectable que un test
pueda espiar. Ese resumen DEBE llevar la estrategia, el modo, la ruta del PDF, el número de páginas
y la **longitud** del texto devuelto. `[D5]` `[D16]`

**R9.** El sistema NO DEBE registrar el texto devuelto por la IA, ni entero ni recortado: al
registro solo llega su longitud. Quien necesite el texto lo tiene en el valor de retorno. `[D16]`

**R10.** SI la lectura con IA falla —entrada inválida, tope de páginas superado, proveedor caído o
plazo agotado—, ENTONCES el sistema DEBE devolver ese fallo con su `code` y su `reason`, sin
lanzar excepción y sin inventar un texto de resultado. `[D5]` `[D10]`

**R11.** El sistema NO DEBE declarar ningún límite propio: el tope de páginas, el tope de tamaño, la
resolución de rasterizado y el plazo de 60 s se importan de la definición única del módulo
(`domain/limits.ts`). Ningún archivo nuevo de esta ficha DEBE contener esos valores escritos a mano.
`[D9]`

**R12.** El sistema NO DEBE exigir ningún permiso ni recibir un actor para procesar un PDF por
estrategia: la comprobación la hace quien encola. La firma pública de la capacidad NO DEBE incluir
un actor. `[D7]`

**R13.** El sistema DEBE publicar la capacidad en el contrato del módulo como **fábrica**, que
recibe sus dependencias por parámetro, del mismo modo que las capacidades que ya publica el módulo.
Ningún archivo de `app/`, ni ningún adaptador driving, ni ningún cron DEBE invocarla en esta ficha:
quien la dispara es la cola (QC-111). `[D2]` `[D8]`

**R14.** El sistema DEBE resolver esta capacidad en el **dominio**, contra los puertos existentes, y
NO DEBE nombrar la librería de IA, el proveedor ni ningún adaptador driven en ningún archivo de
`domain/` o `ports/`. `[D8]`

**R15.** Todos los identificadores públicos que introduzca esta ficha —tipos, funciones, campos y
los dos literales de la estrategia— DEBEN estar en **inglés**. `[D11]`

**R16.** El sistema DEBE implementarse **sin añadir ninguna dependencia** a `package.json`: los
archivos nuevos solo pueden importar `zod` y código del propio módulo. `[D12]` `[D15]`

> **Nota fechada — 2026-09-18.** «Código del propio módulo» incluye el **contrato público de otro
> módulo de este mismo repositorio**, y en concreto `@/lib/modules/errores`, del que sale el tipo
> `ErrorCode`. Un import así **no es una dependencia de terceros**: no añade una línea a
> `package.json`, no pasa por los cuatro checks de salud y no necesita fila en
> `docs/dependencias.md` — que es de lo que habla `[D12]` y lo que esta regla existe para impedir.
> Es además el **precedente ya establecido** del módulo: `domain/read-pdf-with-ai.ts:18` importa
> exactamente ese mismo tipo desde el mismo sitio.
>
> Se escribe porque la letra de R16 no lo contemplaba y el test de forma sí lo admite —correctamente—:
> la nota alinea el enunciado con lo que la regla siempre quiso decir. **La sustancia de R16 no se
> relaja**: los archivos nuevos siguen sin poder importar nada de fuera del repositorio, y lo que
> se importa de otro módulo es **solo su contrato público**, nunca su `domain/`, sus `ports/` ni sus
> adaptadores.

**R17.** Esta ficha NO DEBE añadir ninguna especificación en `e2e/`: no hay pantalla ni recorrido de
usuario que ejercitar, y el E2E de la cadena lo aporta QC-107. La cobertura de R1–R16 DEBE quedar
en tests unitarios del dominio. `[D14]`

## Preguntas abiertas

**Ninguna.** La que quedaba —qué se registra y con qué recorte— la cerró el humano el 2026-09-18 y
está en la tabla como `[D16]`.

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
| 2026-09-18 | ¿En qué formato viven los archivos de prompt? | **Un `.json` por estrategia**, con la forma `{ "provisional": true, "loDefine": "QC-129", "prompt": "..." }`. Una constante en TypeScript se descartó al acotar: `[D6]` se eligió para que el texto se editara **como documento, sin tocar código**. Motivo de que el `.json` sea viable sin tocar el build: **`resolveJsonModule` ya está activo** (`tsconfig.json:12`), así que el archivo entra en el paquete de despliegue como un import más, sin loaders ni configuración nueva. Efecto secundario: la marca de provisional deja de ser un comentario que cita una ficha y pasa a ser un **campo de datos**, así que ya no roza `docs/conventions.md`. `[D15]` |
| 2026-09-18 | ¿Qué se registra exactamente, y con qué recorte? | **Un resumen, SIN el texto**: estrategia, modo, ruta del PDF, número de páginas y **longitud** del texto devuelto. El texto completo no va al registro —puede ser enorme y puede traer datos de terceros—; quien lo necesite lo tiene en el valor de retorno, que es lo que `[D5]` ya fija. Cierra la única pregunta abierta que tenía la ficha. `[D16]` |
