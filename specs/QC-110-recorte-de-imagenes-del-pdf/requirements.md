# QC-110 — recorte-de-imagenes-del-pdf · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** `QC-108`, `QC-111` (las dos
> `done`) · **Rama:** `feature/QC-110-recorte-de-imagenes-del-pdf`
>
> **Alcance.** Dentro del trabajo de la cola y **solo en la estrategia `catalogo`**, Gemini
> identifica las imágenes que contienen las páginas ya rasterizadas y devuelve sus **coordenadas**;
> `sharp` las recorta y los PNG se suben a un **bucket nuevo** de Supabase Storage, agrupados por
> el PDF del que salieron.
>
> **Lo que NO entra.** La lectura genérica con prompts (**QC-108**) y la cola que lo ejecuta
> (**QC-111**), que la bloquean y ya están hechas. Afinar el texto del prompt → **QC-131**.
> Rasterizar en `formula`. Mostrar los recortes en alguna pantalla: **hoy nadie los consume**,
> igual que QC-106 publicó la conversión sin invocarla.
>
> Sembrado por `/afinar-feature` el 2026-09-21. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **¿Hay tamaño mínimo para que un recorte valga la pena?** La IA puede devolver una región de
   3×3 píxeles que no sirve para nada. No se decidió si se descartan por debajo de algún umbral ni
   cuál sería.
2. **¿Los recortes se borran alguna vez?** El PDF temporal **sí** se borra al terminar bien
   (QC-111). Los recortes se quedan en el bucket indefinidamente, y hoy **nadie los consume**.
   Nadie decidió si caducan, quién los limpia, ni qué pasa con los de un PDF que se reprocesa.
3. **¿Hay tope de recortes por PDF?** Las páginas sí lo tienen —`MAX_PDF_PAGES = 50`—; los
   recortes no. Un PDF de 50 páginas con veinte imágenes cada una son mil subidas en un solo
   trabajo, dentro de una función con `maxDuration` acotado.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-21 | ¿Con qué se recortan las imágenes? | **`sharp`**, aprobada por el humano al acotar. **Los cuatro checks PASAN**, verificados contra el registro de npm y GitHub el 2026-09-21: sin `deprecated`; última release **v0.35.4 del 2026-08-26**; **72.211.349** descargas semanales; licencia **Apache-2.0**. La fila de `docs/dependencias.md` se escribe con estos números. |
| 2026-09-21 | ¿No hacía crecer el árbol? | **Ya está instalada** como `optionalDependency` de `next@16.3.0` —Next la usa para optimizar imágenes—, así que declararla **no añade peso** al despliegue. Pero **transitiva no basta**: se declara en `package.json`, porque el día que Next la cambie o la quite el código se rompería sin que nada avisara. |
| 2026-09-21 | ¿Cómo se aísla? | **En un solo archivo detrás de su puerto**, mismo criterio con el que entraron `unpdf`, `@google/genai`, `@upstash/qstash` y `@supabase/storage-js`. Y como es **binario nativo**, entra en `serverExternalPackages` junto a `@napi-rs/canvas`; la guardia de QC-136 pasa a exigir **las dos**. |
| 2026-09-21 | ¿Sustituye a `@napi-rs/canvas`? | **No.** El canvas **rasteriza páginas**; `sharp` **recorta regiones**. Papeles distintos y las dos se quedan. |
| 2026-09-21 | ¿Cómo devuelve la IA las coordenadas? | **JSON dentro del texto**, y esta ficha lo interpreta y lo valida. El puerto `AiReader` **no cambia**: QC-108 cerró que devuelve el texto «tal cual, sin interpretar» y eso se respeta. Si el texto no viene bien formado, el archivo queda en **error** con su motivo. |
| 2026-09-21 | ¿En qué unidad vienen? | **En proporción de la página, de 0 a 1**, nunca en píxeles. El cuarto superior izquierdo es `x:0 y:0 ancho:0.5 alto:0.5` mida lo que mida la imagen. El motivo es concreto: hoy se rasteriza a 150 DPI (`PAGE_RENDER_DPI`) y si mañana baja para acotar el tiempo de conversión, unas coordenadas en píxeles quedarían inválidas **en silencio**. |
| 2026-09-21 | ¿Y si se salen de la página? | **Se ajustan al borde y se sigue.** La IA se pasa por los bordes con frecuencia y el recorte sigue siendo útil; tirar el archivo entero por unos píxeles sería frágil. |
| 2026-09-21 | ¿Para qué estrategias corre? | **Solo `catalogo`.** Ya rasteriza las páginas para mandárselas a Gemini como imagen, así que el recorte reutiliza lo que ya hay. `formula` procesa el PDF como **texto** y nunca rasteriza: pedirle recortes la obligaría a rasterizar el documento entero —hasta 50 páginas a 150 DPI— solo para eso, que es el paso más caro del recorrido. |
| 2026-09-21 | ¿Cómo se nombran y dónde van? | **`<empresa>/<id del archivo>/<página>-<n>.png`.** Hereda el prefijo de empresa que ya usa el bucket de PDFs y que `isPathInCompany` comprueba, y agrupar por archivo permite listar o borrar los recortes de un PDF de una vez. |
| 2026-09-21 | ¿Se registran en base de datos? | **No. Viven solo en el bucket.** Sin tabla, sin migración y sin RLS nueva: el mismo criterio con el que QC-123 guardó solo el total y no qué lotes usó. |
| 2026-09-21 | ¿Se amplía el puerto de almacenamiento? | **No: nace un puerto propio del recorte, con una sola operación** —subir bytes a una ruta—. El `DocumentStorage` de QC-106 se queda **intacto**: está atado a un bucket y solo sabe **firmar** subidas para el navegador, no subir bytes desde el servidor. Dos buckets, dos adaptadores, que es lo que ya pasó con el de recetas y el de PDFs. |
| 2026-09-21 | ¿Y si el PDF no trae imágenes? | **Termina bien, con cero recortes.** No encontrar imágenes no es un error: hay catálogos que legítimamente son solo tablas y texto. |
| 2026-09-21 | ¿Y si falla el recorte de una de varias? | **Se salta y las demás siguen.** ⚠️ **Limitación declarada, decidida a sabiendas:** el archivo queda en «listo» **sin que nada diga** que se perdieron recortes por el camino. |
| 2026-09-21 | ¿Quién escribe el prompt de coordenadas? | **Nace aquí, provisional pero funcional**, declarándolo en su cabecera. Mismo criterio que QC-109, después de que la versión «con contenido vacío» resultara **incapaz de ejecutarse**: QC-108 rechaza un prompt en blanco sin llamar al proveedor. Afinar su texto es de **QC-131**. |
| 2026-09-21 | ¿Hace falta E2E? | **No, y se difiere aquí con motivo.** No tiene pantalla —corre dentro del trabajo de la cola, sin nadie delante— y uno real exigiría URL pública, cuenta de QStash y clave de Gemini, con lo que el gate dejaría de correr sin red, que es condición del repo. Mismo motivo escrito con el que QC-111 lo difirió. La cobertura es **de integración**. |
| Heredada de QC-109 y QC-111 | ¿Comprueba permisos? | **No.** Corre dentro del trabajo de la cola, donde no hay nadie delante; quien valida es **el que encola**. |
| Heredada de QC-106 | El bucket | **Supabase Storage con `@supabase/storage-js`**, ya aprobada, detrás de un puerto. El bucket es **nuevo y propio** de estos recortes; la dirección del proyecto y la credencial se comparten, porque son del proyecto y no del bucket. |
| Heredada de la spec 4 | Identificadores | Los de base de datos, **en inglés**. |
