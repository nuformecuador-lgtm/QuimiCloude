# QC-108 — lectura-de-pdf-con-gemini · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** `QC-106` · **Rama**
> `feature/QC-108-lectura-de-pdf-con-gemini`
>
> **Alcance.** Leer un PDF con **Google Gemini Flash**, detrás de un **puerto** del módulo
> `documentos`, recibiendo un **prompt personalizado** de quien llama. **Dos modos de lectura**: el
> PDF tal cual, o sus páginas ya convertidas a imagen, **reutilizando el `PdfConverter` que QC-106
> ya construyó** — la conversión no se re-implementa. Devuelve **el texto que la IA escribió, tal
> cual**. Es una **capacidad interna**: no añade pantalla, ni ruta, ni Server Action; la ejecutará
> por dentro el trabajo de la cola (**QC-111**).
>
> **Lo que NO entra.** La estrategia catálogo/fórmula y sus archivos de prompt → **QC-109**. La
> detección de coordenadas, el recorte y la subida de imágenes → **QC-110**. La cola, el estado por
> archivo y **los reintentos** → **QC-111**. La pantalla → **QC-107**.
>
> Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). **Ninguna de las tres bloquea el alcance.**

1. **QC-110 y las coordenadas.** Con D3 el retorno es texto plano, así que sacar de ahí las
   coordenadas de una imagen obliga a interpretar texto libre o a **ampliar este puerto** más
   adelante. No se decide aquí: **QC-110 ya tiene declarado abierto «formato de las coordenadas»** y
   es donde toca cerrarlo. Se escribe para que quien acote QC-110 llegue sabiendo que esta ficha le
   entrega texto y no una estructura.
2. **Nadie valida lo que la IA contesta.** Si Gemini devuelve un texto plausible pero inventado
   —un precio que no está en el catálogo—, ningún requisito de esta ficha lo detecta: el puerto
   devuelve lo que le den. Ninguna ficha de la épica QC-105 cubre hoy la verificación del contenido.
3. **El gasto no se mide.** No hay tope de llamadas ni alerta de coste, ni global ni por empresa.
   Con el límite heredado de 50 páginas por PDF y 10 PDFs por tanda, una sola tanda en modo imagen
   son hasta 500 llamadas. Queda fuera de alcance y **sin ficha**.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-18 | ¿Qué pasa si Gemini no responde o tarda? | **Plazo máximo de 60 s por lectura**, escrito en **una sola definición** del módulo. Al agotarse, la lectura falla para **ese** archivo y devuelve el fallo a quien la pidió. **Cero reintentos aquí**: los reintentos son de **QC-111**, que ya los tiene declarados como pregunta abierta suya. Motivo dicho entero: dos capas reintentando lo mismo multiplican el gasto en silencio — un catálogo de 50 páginas reintentado 3 veces en dos capas son 450 llamadas que nadie pidió |
| 2026-09-18 | ¿Cómo se llama ese fallo? | **Código de error NUEVO `ai_unavailable`**, que sería la **OCTAVA enmienda** al catálogo cerrado de `lib/modules/errores` (QC-92 está pidiendo la séptima). Permite que la pantalla de QC-107 diga «la lectura automática no está disponible» en vez del mensaje neutro de un bug, y que el log distinga un corte del proveedor de un fallo nuestro. **La aprueba el humano en F1.4**, y el `design.md` debe llevar el **plan B escrito**: si no se aprueba, el fallo cae a `unexpected` y la pantalla pierde ese matiz |
| 2026-09-18 | ¿En qué forma devuelve lo que Gemini contesta? | **Texto plano**, tal cual lo escribió la IA. Interpretarlo es de quien lo pide. Es lo único que **QC-109** necesita hoy: su ficha dice que «el retorno, por ahora, es solo un `console.log` con el resultado». Se descartó a sabiendas admitir respuesta estructurada; la consecuencia está escrita en la pregunta abierta 1 |
| 2026-09-18 | ¿Dónde vive la clave de Gemini? | **UNA SOLA clave del despliegue**, por variable de entorno. **Declarada vacía y documentada** en `.env.example`, y **leída en el momento de la invocación**, nunca al importar el módulo — de modo que importar el adaptador sin invocarlo no falle. Heredado de **QC-106 D15**. **No hay clave por empresa**: eso exigiría tabla nueva con columna de empresa, cifrado de la clave guardada y pantalla para cargarla, y nada de eso está en la épica hoy |
| 2026-09-18 | ¿Quién puede disparar una lectura? | **Capacidad interna.** Sin Server Action, sin Route Handler, sin ruta y sin pantalla: la ejecuta el trabajo de la cola (**QC-111**) por dentro, igual que la conversión de QC-106. **El permiso lo corta quien sube el PDF**, donde QC-106 ya valida Administrador en el service; esta ficha no vuelve a cortarlo ni añade permiso al catálogo cerrado de quince. **Consecuencia aceptada: E2E diferido con motivo** — no añade ningún recorrido navegable que un test pueda visitar, así que la verificación es unitaria. Mismo criterio que **QC-106 D17** |
| 2026-09-18 | «Gemini Flash» es una familia, no una versión. ¿Cuál se usa? | **El nombre del modelo vive en una VARIABLE DE ENTORNO**, no escrito en el código. **Es obligatoria**: si falta, la lectura **falla con un error explícito** y **NO cae a un modelo por defecto**. Decisión textual del humano («via .env»), y el fallo cerrado sigue el precedente de `SESSION_SECRET`, que no se degrada cuando falta. El arnés ya pagó caro lo contrario: un id de modelo escrito a mano dejó de existir y mató a un `backend_dev` al arrancar, en silencio (`AGENTS.md > Modelos`) |
| 2026-09-18 | ¿Qué librería habla con Gemini? | **`@google/genai`**. **Los cuatro checks, corridos contra npm el 2026-09-18 y los cuatro limpios**: sin `deprecated`; **2.23.0** publicada el **2026-09-16**; licencia **Apache-2.0**; **22.124.413** descargas semanales. **La fila en `docs/dependencias.md` y la aprobación humana van en F1.4**, como QC-25, QC-28 y QC-106: **nada se instala antes** (regla 7 de `CLAUDE.md`) |
| 2026-09-18 | ¿Dónde vive este código? | Módulo **`documentos`**, que **ya existe** desde QC-106. **Puerto nuevo + adaptador driven**; el `domain/` y los `ports/` **no** importan `@google/genai`, `next/*` ni `@prisma/client`; el cableado puerto → adaptador vive **solo** en `lib/composition`. Heredado de **QC-106 D13 y D14** |
| 2026-09-18 | ¿Se puede verificar sin red? | **Sí, y es obligatorio.** El puerto se sustituye por un doble en los tests; **ningún test llama a Gemini ni a la red**, ni depende de que las variables de entorno tengan valor. Es condición para que `./init.sh` siga corriendo sin red. Heredado de **QC-106 D14** y de `docs/verification.md` |
| 2026-09-18 | ¿Deja alguna fila en la base? | **No, ninguna.** Sin modelo en `db/schema.prisma`, sin migración y sin `down.sql`. El estado por archivo es de **QC-111**. Heredado de **QC-106 D5** |
| 2026-09-18 | ¿Se re-implementa la conversión a imagen? | **No.** El modo imagen **reutiliza el `PdfConverter` que QC-106 ya dejó montado** —`countPages`, `extractText`, `renderPages(pdf, dpi)`, con PNG a 150 DPI—, y con él sus límites heredados de 20 MB y 50 páginas por PDF. Esta ficha **no toca** ese puerto ni su adaptador |
| 2026-09-18 | Capas, borde e identificadores | Validación de entrada con **zod** en el borde (`docs/conventions.md`). Identificadores en **inglés** (**QC-4**). Heredado de **QC-106 D18** |
