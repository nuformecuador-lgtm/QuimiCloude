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

> Cada requisito cita entre corchetes la decisión cerrada que lo origina. Las 13 decisiones
> (`[D1]`…`[D13]`) quedan citadas al menos una vez.
>
> Los requisitos se parten en dos familias, y el motivo está en `[D5]`: los del **mecanismo**
> (R1–R9, R18, R19) se comprueban con tests unitarios normales; los de la **calidad del texto**
> (R10–R14) no se pueden comprobar sin llamar al proveedor, y por eso su verificación es una **fila
> firmada del registro de revisión humana** (R15–R17). `design.md > 8` lo declara para que no se lea
> como un hueco de trazabilidad.

### El mecanismo: de dónde sale el texto

**R1.** El sistema DEBE obtener el texto del prompt de cada estrategia de una **variable de entorno
propia**: `CATALOG_PROMPT` para `catalogo` y `FORMULA_PROMPT` para `formula`. NO DEBE existir una
sola variable que transporte los dos textos, ni una que sirva de repuesto de la otra. `[D7]` `[D8]`

**R2.** El sistema DEBE leer esa variable **en el momento de procesar el PDF**, dentro de la
invocación. CUANDO se importa cualquier archivo del módulo `documentos` o se construye la fachada de
`lib/composition`, el sistema NO DEBE leer ninguna de las dos variables ni fallar por su ausencia.
`[D10]`

**R3.** El sistema DEBE tratar una variable **ausente, vacía o compuesta solo de espacios** como
ausente, con el mismo criterio que ya aplica la configuración de la IA del módulo. `[D9]`

**R4.** SI la variable de la estrategia en curso está ausente, ENTONCES el sistema DEBE terminar el
procesamiento con un fallo cuyo motivo **nombra esa variable**, y NO DEBE llamar a la lectura con IA
ni al proveedor. `[D8]` `[D9]`

**R5.** El sistema NO DEBE aportar ningún texto de prompt por defecto, de repuesto, heredado de la
otra estrategia ni escrito en el código: si no hay variable, no hay texto. `[D9]` `[D11]`

**R6.** CUANDO el procesamiento falla por una variable ausente, el sistema DEBE entregar al registro
el mismo resumen de una sola línea que entrega en cualquier otra ejecución —una vez, con la
estrategia y la ruta—, sin incluir el texto del prompt. `[D9]` `[D13]`

**R7.** El sistema NO DEBE incluir el texto del prompt —ni entero, ni recortado, ni resumido— en
ningún mensaje de error, motivo de fallo o línea de registro. `[D13]`

### La desaparición de los textos del repositorio

**R8.** Los archivos `lib/modules/documentos/domain/prompts/catalogo.json`,
`.../formula.json` y `.../index.ts` con su mapa `PROMPT_BY_STRATEGY` DEBEN **dejar de existir** en el
repositorio, y ningún archivo DEBE importarlos ni nombrarlos. `[D11]`

**R9.** Ningún archivo versionado del repositorio —código, test, documento o especificación— DEBE
contener el texto de un prompt de estrategia, ni completo ni en fragmento reconocible. `[D11]`
`[D13]`

### Lo que los dos textos tienen que pedir

**R10.** El prompt de `catalogo` DEBE pedir, para cada línea del catálogo, exactamente estos seis
datos: **nombre, presentación, unidad, precio, compra mínima y tiempo de entrega**. NO DEBE pedir
moneda, vigencia ni referencia del proveedor. `[D1]`

**R11.** El prompt de `formula` DEBE pedir el **nombre** de la fórmula, su **descripción**, cada
**materia prima con su cantidad y su unidad**, y los **pasos** de preparación **en su orden**.
`[D2]`

**R12.** Los dos prompts DEBEN exigir que la IA conteste en **JSON**, y DEBEN declarar la forma
exacta de ese JSON **dentro del propio texto del prompt**. El módulo NO DEBE interpretar, validar ni
transformar esa respuesta: sigue devolviéndola tal cual. `[D3]`

**R13.** Los dos prompts DEBEN ordenar que un dato que el PDF **no trae** se devuelva **vacío
(`null`)**, y DEBEN prohibir explícitamente inventarlo o deducirlo del contexto. `[D4]`

**R14.** Los dos textos DEBEN escribirse **en el entorno de despliegue** (variables de Vercel) y no
en el repositorio. Quién los pone en **preview** y con qué valores **no está decidido**: es la
**pregunta abierta 1**, y hasta que se cierre este requisito solo está garantizado para producción.
`[D7]` `[D9]`

### Cómo se comprueba que un prompt es bueno

**R15.** El sistema DEBE incluir en `docs/` un **registro de revisión de prompts** con una
**plantilla fija**: una fila por **campo esperado** de cada estrategia y, por columna, el
**veredicto** de esa pasada con exactamente tres valores posibles —**bien**, **mal**, **no
estaba**—, más la fecha, la estrategia, el PDF de muestra y quién firma. `[D5]`

**R16.** El registro NO DEBE copiar el texto del prompt revisado ni ninguna huella de él. El propio
documento DEBE dejar escrita la consecuencia aceptada: un veredicto **no se puede volver a
comprobar** contra el texto al que se refería. `[D13]`

**R17.** La revisión DEBE hacerse sobre **PDFs reales aportados por el humano** —al menos un
catálogo de proveedor y una fórmula—, en **una pasada** por estrategia, y DEBE quedar **firmada por
una persona**. Ningún agente DEBE poder darla por hecha. `[D5]` `[D6]`

**R18.** Ningún test automatizado DEBE llamar al proveedor de IA, exigir red ni exigir claves
configuradas para pasar. Los tests de la estrategia DEBEN poder ejercitarse con el texto de prompt
**inyectado por sus dependencias**; **cómo llega ese texto al desarrollo local y a la suite es la
pregunta abierta 2** y este requisito no la cierra: solo fija que el gate sigue corriendo sin red y
sin claves. `[D5]` `[D10]`

### El contrato del módulo

**R19.** El contrato público del módulo (`lib/modules/documentos/index.ts`) NO DEBE exportar ningún
texto de prompt, ningún mapa de prompts ni el puerto por el que llegue: el prompt sigue siendo
detalle interno de la estrategia y solo `lib/composition` ata su implementación. `[D10]` `[D11]`

### La derogación de QC-109

**R20.** Esta ficha DEBE actualizar `tests/unit/documentos/qc109-alcance.test.ts` —los casos de
**R4**, de **R6** y las afirmaciones sobre `PROMPT_BY_STRATEGY`— de modo que la suite quede verde
**sin desactivar** ninguna de las guardias de QC-109 que siguen vigentes (R11, R13, R14, R15, R16 y
R17). `[D12]`

**R21.** Esta ficha DEBE añadir una **nota fechada** a
`specs/QC-109-procesamiento-de-pdf-por-estrategia/requirements.md` que diga **qué queda derogado**
—su R4, su R6 y sus decisiones **`[D6]` y `[D15]` DE QC-109**— **por qué** y **qué lo sustituye**,
sin borrar ni reescribir el texto original. `[D12]`

> **Nota de notación.** Las dos citas de la línea de arriba son las decisiones **de QC-109**, no las
> de esta ficha, que tiene su propia `[D6]` —los PDFs de muestra los aporta el humano—. En todo el
> resto del archivo, `[Dn]` sin más se refiere **siempre** a la tabla de decisiones de QC-129.

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

### Nota fechada — 2026-09-23, enmienda de R10 por QC-158

**QC-158** (`catalogo-desde-pdf`) convierte lo que devuelve el prompt de `catalogo` en líneas del
catálogo del proveedor, y para eso fija la forma del JSON que acepta (`specs/QC-158-catalogo-desde-pdf/design.md > 3`,
decisión `[F4]` de su F1.4). **R10 pasa de seis a ocho datos por línea, más `page`**: a nombre,
presentación, unidad, precio (`cost`), compra mínima y tiempo de entrega se suman **`material`** y
**`measurements`** (diámetro y alto con unidad `mm|cm`, boca como texto libre), y **`page`** (página
del PDF donde está la línea, para emparejarla con su recorte). `{"lines": null}` sigue siendo «sin
líneas». Un costo, una compra mínima o un valor de medida **numérico** se tratan como vacíos: viajan
como cadena decimal. El texto de R10 de arriba **no se reescribe**; esta nota lo enmienda. El texto
del prompt sigue **fuera del repositorio** (R9, `[D13]`): el humano ajusta el borrador de QC-131 a
esta forma. Precedente: la nota fechada que QC-129 dejó en el `requirements.md` de QC-109.
