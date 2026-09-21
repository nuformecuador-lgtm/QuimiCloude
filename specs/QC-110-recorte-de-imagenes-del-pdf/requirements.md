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

> **Qué es «el sistema» aquí.** El módulo `documentos` ampliado con **cuatro piezas**: (1) el **caso
> de uso del recorte**, que parte de las páginas rasterizadas, pide coordenadas a la IA, recorta y
> sube; (2) **dos puertos nuevos** —recortar una región y subir un PNG a una ruta— con sus
> adaptadores driven; (3) el **enganche** de ese paso dentro del trabajo que ya entrega la cola
> (`run-document-job`); y (4) el **prompt de coordenadas**. Fuera de «el sistema» quedan, y no se
> re-especifican, las capacidades que **QC-106**, **QC-108**, **QC-109** y **QC-111** ya publicaron:
> la emisión de enlaces, la descarga del bucket, la conversión, la lectura con IA, el procesamiento
> por estrategia, la cola y las filas de estado. Esta ficha las **invoca**.
>
> **Cómo se citan las decisiones.** La tabla `## Decisiones cerradas (no reabrir)` no trae etiquetas,
> así que aquí se numeran `[D1]`…`[D18]` **en el orden en que aparecen sus filas**, sin tocarlas:
>
> `[D1]` con qué se recorta (`sharp`) · `[D2]` ya instalada, pero se declara · `[D3]` aislada en un
> solo archivo + `serverExternalPackages` · `[D4]` no sustituye a `@napi-rs/canvas` · `[D5]` la IA
> devuelve JSON dentro del texto y esta ficha lo interpreta · `[D6]` coordenadas en proporción 0..1 ·
> `[D7]` fuera de la página, se ajusta al borde · `[D8]` solo la estrategia `catalogo` · `[D9]` cómo
> se nombran y dónde van · `[D10]` no se registran en base de datos · `[D11]` puerto propio del
> recorte, `DocumentStorage` intacto · `[D12]` sin imágenes, termina bien · `[D13]` si falla uno, se
> salta y siguen los demás · `[D14]` el prompt nace aquí, provisional pero funcional · `[D15]` sin
> E2E, cobertura de integración · `[D16]` no comprueba permisos · `[D17]` el bucket (nuevo, propio) ·
> `[D18]` identificadores en inglés.
>
> Las **18 filas** quedan citadas al menos una vez.

**R1.** MIENTRAS la estrategia de la tanda sea **`catalogo`**, el sistema DEBE ejecutar el paso de
recorte dentro del trabajo que entrega la cola, después de que el procesamiento por estrategia haya
terminado bien. SI la estrategia de la tanda es **`formula`**, ENTONCES el sistema NO DEBE
rasterizar ninguna página, NO DEBE pedir coordenadas al proveedor de IA y NO DEBE subir ningún
recorte. `[D8]`

**R2.** El sistema DEBE rasterizar las páginas a la **resolución única ya declarada del módulo** y
NO DEBE declarar ninguna resolución, tope de páginas ni plazo propios: todo número que use DEBE
salir de `domain/limits.ts`, donde cada uno vive una sola vez. `[D8]` `[D4]`

**R3.** CUANDO el sistema necesite las coordenadas de las imágenes de una página, DEBE pedírselas al
proveedor de IA mandando **las páginas ya rasterizadas** y un prompt propio del recorte, **a través
del puerto de lectura con IA ya existente**. El sistema NO DEBE modificar ese puerto: la respuesta
DEBE recibirse como **texto plano, tal cual**, y quien la interpreta DEBE ser esta ficha. `[D5]`

**R4.** El sistema DEBE extraer del texto recibido el **JSON** que contiene y **validarlo** con un
esquema explícito antes de usarlo: una lista de regiones, cada una con su **número de página** y sus
cuatro medidas. El sistema NO DEBE usar ningún dato de esa respuesta sin haber pasado por esa
validación. `[D5]`

**R5.** SI el texto recibido no contiene un JSON interpretable, o el JSON no encaja con ese esquema,
ENTONCES el sistema DEBE dejar el archivo en **error con su motivo**, sin subir ningún recorte, y
DEBE identificar el fallo con un **código ya existente** del catálogo cerrado, sin añadir ninguno.
`[D5]`

**R6.** El sistema DEBE interpretar las cuatro medidas de cada región como **proporción de la página,
entre 0 y 1**, y NO DEBE aceptar, interpretar ni convertir coordenadas en píxeles. Una región cuyas
medidas no sean números dentro de ese rango —o cuyo ancho o alto no sea mayor que cero— DEBE
rechazarse por la validación de R4. `[D6]`

**R7.** SI una región validada se sale de los bordes de su página, ENTONCES el sistema DEBE
**ajustarla al borde** y seguir recortándola. El sistema NO DEBE descartar el archivo, ni la región,
por salirse. `[D7]`

**R8.** El sistema DEBE hacer el recorte de cada región **detrás de un puerto propio**, y la librería
que lo implementa DEBE vivir en **un solo archivo adaptador driven**, que DEBE ser el **único** del
repositorio que la importa. `domain/` y `ports/` NO DEBEN importarla, y el cableado puerto →
adaptador DEBE vivir **solo** en `lib/composition`. `[D1]` `[D3]`

**R9.** El sistema NO DEBE incorporar más dependencia nueva que **`sharp`**, DEBE **declararla en
`package.json`** —aunque hoy llegue como dependencia opcional de otro paquete— y DEBE añadir su fila
en `docs/dependencias.md` con los cuatro checks y la aprobación humana citadas. `[D1]` `[D2]`

**R10.** El sistema DEBE declarar **`sharp`** en `serverExternalPackages` de `next.config.ts`, **junto
a `@napi-rs/canvas`**, y la guardia que hoy exige uno DEBE pasar a exigir **los dos**, con su control
positivo. `[D3]`

**R11.** El sistema DEBE seguir rasterizando las páginas con el **par nativo de rasterizado ya
existente** y NO DEBE sustituirlo, retirarlo ni duplicar su papel con la librería de recorte: una
rasteriza páginas, la otra recorta regiones. `[D4]`

**R12.** CUANDO un recorte se produce, el sistema DEBE subirlo como **PNG** a la ruta
`<empresa>/<id del archivo>/<página>-<n>.png` dentro del bucket de recortes, donde `<empresa>` es la
empresa **de la fila del archivo**. El sistema NO DEBE construir ninguna ruta que no empiece por el
segmento de esa empresa, ni que contenga un segmento de travesía de directorios. `[D9]` `[D17]`

**R13.** La subida DEBE hacerse a través de un **puerto NUEVO, propio del recorte, con una sola
operación** —subir bytes a una ruta—. El sistema NO DEBE ampliar el puerto `DocumentStorage` ya
existente, NO DEBE añadirle operaciones y NO DEBE reutilizarlo para estos PNG. `[D11]`

**R14.** El adaptador de ese puerto DEBE hablar con **Supabase Storage** contra un bucket **nuevo y
propio**, cuyo nombre DEBE salir de una **variable de entorno propia**, mientras que la dirección del
proyecto y la credencial DEBEN **reutilizar** las ya declaradas. Las variables DEBEN leerse **en el
momento de la invocación**, nunca al importar el módulo, DEBEN quedar **declaradas y vacías** en
`.env.example`, y ningún secreto DEBE entrar al repositorio. `[D17]`

**R15.** El sistema NO DEBE crear ninguna **tabla, columna, migración, policy ni índice** para los
recortes, y NO DEBE escribir ni leer ninguna fila sobre ellos: los recortes viven **solo en el
bucket**. `[D10]`

**R16.** CUANDO la respuesta validada de la IA no traiga **ninguna región**, el sistema DEBE terminar
el trabajo **bien, con cero recortes**, y dejar la fila del archivo en «listo». No encontrar imágenes
NO DEBE tratarse como un fallo. `[D12]`

**R17.** SI el recorte o la subida de **una** región falla, ENTONCES el sistema DEBE **saltarla y
continuar con las demás**, y el archivo DEBE terminar en «listo» igualmente. El sistema NO DEBE
abortar el resto de recortes por uno fallido ni marcar el archivo en error por ese motivo.
**Limitación declarada y aceptada:** nada fuera del registro de ejecución dice que se perdieron
recortes por el camino. `[D13]`

**R18.** El sistema DEBE incluir un **prompt propio del recorte** con **texto funcional —nunca
vacío—**, que DEBE declarar **en su propia cabecera** que es provisional. El sistema NO DEBE
reutilizar el prompt de la estrategia, NO DEBE mezclar los dos textos y NO DEBE fallar por un prompt
en blanco. `[D14]`

**R19.** El paso de recorte NO DEBE comprobar ningún permiso, NO DEBE leer cookie ni sesión y NO DEBE
resolver ningún actor de sesión: corre dentro del trabajo de la cola, donde no hay nadie delante, y
quien valida es quien encola. `[D16]`

**R20.** El sistema DEBE escribir en **inglés** los identificadores nuevos —puertos, tipos,
variables de entorno y segmentos de ruta— y NO DEBE introducir ningún identificador de base de datos,
porque no nace ninguna tabla ni columna. `[D18]` `[D10]`

**R21.** Todo el código nuevo DEBE vivir en el módulo `documentos`, respetando la regla de
dependencias: `domain/` y `ports/` NO DEBEN importar `next/*`, `@prisma/client`, `lib/shared/**` ni
ningún adaptador, y el contrato del módulo (`index.ts`) DEBE seguir reexportando **solo** de
`./domain`. `[D3]` `[D11]`

**R22.** La verificación DEBE ser de **unidad e integración**, con **dobles** para la IA, el
almacenamiento y el recorte, y **ningún test DEBE llamar a la red** ni depender de que las variables
de entorno tengan valor. DEBE cubrir al menos: estrategia `formula` sin recorte, texto malformado,
región fuera de borde, cero regiones, un recorte que falla entre varios, y la ruta construida.
`[D15]`

**R23.** El sistema NO DEBE añadir ningún recorrido **E2E** en esta ficha, y ese diferimiento DEBE
quedar escrito con su motivo: el paso no tiene pantalla —corre dentro del trabajo de la cola— y un
E2E real exigiría URL pública, cuenta de cola y clave del proveedor de IA, con lo que el gate dejaría
de correr sin red. `[D15]`

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
