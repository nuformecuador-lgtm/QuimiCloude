# QC-107 — componente-de-carga-de-archivos · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **`depends_on`** `QC-106`, `QC-111` (las dos
> `done`) · **Rama** `feature/QC-107-componente-de-carga-de-archivos`
>
> **Alcance.** El componente de subida de hasta 10 PDFs por tanda, con una prop que elige la
> estrategia para **toda** la tanda, montado en **dos** sitios: la pantalla de proveedores (modo
> catálogo) y la de fórmulas (modo fórmula). Muestra el estado de cada archivo —en cola,
> procesando, listo, error con su motivo— y lo refresca por **sondeo propio** hasta que la tanda
> termina. Trae además el **primer recorrido E2E navegable** de toda la cadena de Documentos e IA.
>
> **Lo que NO entra.** La subida y la conversión → **QC-106**. La cola, los reintentos y la
> consulta de estado → **QC-111**. El tiempo real y los avisos → **QC-137**. Los prompts
> definitivos y su revisión firmada → **QC-131**. **Guardar lo que la IA devuelve → sin dueño
> hoy** (pregunta abierta 2).
>
> Sembrado por `/afinar-feature` el 2026-09-21. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Qué es «el sistema» aquí.** El **componente de subida** —una pieza de cliente con una prop que
> elige la estrategia de toda la tanda—, su **montaje** en las pantallas que `[D1]` fija, y el
> **recorrido E2E** que `[D4]` paga. Fuera de «el sistema» quedan, y **no se re-especifican**, las
> capacidades que **QC-106** y **QC-111** ya publicaron: la emisión de enlaces firmados, la subida
> directa al almacenamiento, la conversión, la lectura con IA, el encolado, el trabajo de la cola y
> la consulta de estado con su caducidad. Esta ficha las **invoca**; no reimplementa ninguna y no
> vuelve a escribir ninguno de sus límites, tipos ni códigos de error.
>
> Cada requisito cita entre corchetes la decisión cerrada que lo origina. Las **seis** decisiones
> numeradas (`[D1]`…`[D6]`) y las **siete heredadas** quedan citadas al menos una vez; el mapa
> completo está al final de esta sección.

**R1.** MIENTRAS el componente esté montado, el sistema DEBE permitir seleccionar **entre 1 y
`MAX_FILES_PER_BATCH` archivos** para una misma tanda, tomando ese tope **importado del contrato
público del módulo `documentos`**. El sistema NO DEBE escribir ese número en ningún otro sitio.
SI la selección supera el tope, ENTONCES el sistema DEBE rechazarla **entera** —nunca «los diez
primeros»— y decirlo, sin llamar a ninguna Server Action. *(heredada: diez por tanda, QC-106)*

**R2.** El sistema DEBE ofrecer la selección restringida a **PDF** y DEBE declarar cada archivo de
la tanda con el tipo de contenido que el esquema del borde del módulo admite. El sistema NO DEBE
comprobar por su cuenta el tamaño ni el número de páginas: esos topes los imponen el almacenamiento
y la conversión, no la pantalla. *(heredada: los bytes no pasan por el servidor, QC-106)*

**R3.** El sistema DEBE recibir la estrategia **por una prop del componente**, aplicarla a **toda**
la tanda y enviarla **una sola vez** al encolar. NO DEBE existir en la interfaz ningún control,
campo ni ruta por la que un archivo concreto de la tanda reciba una estrategia distinta de la de su
tanda. El valor de esa prop DEBE ser el tipo `PdfStrategy` del contrato del módulo, no un literal
escrito a mano. `[D1]` *(heredada: la estrategia es por tanda, QC-111 `[D3]`)*

**R4.** CUANDO se confirma una selección válida, el sistema DEBE pedir los enlaces de subida
invocando `issueUploadLinksAction`, importada **por su ruta exacta**
(`lib/modules/documentos/adapters/driving/document-upload-actions.ts`) y **nunca** desde el barril
del módulo.

**R5.** El sistema DEBE enviar los **bytes de cada PDF desde el navegador directamente al
almacenamiento**, con el enlace firmado que devolvió R4. El componente NO DEBE enviar el contenido
de ningún archivo a ninguna Server Action ni a ninguna ruta de la aplicación.
*(heredada: los bytes no pasan por el servidor, QC-106)*

**R6.** MIENTRAS los bytes de un archivo viajan al almacenamiento, el sistema DEBE mostrar que esa
subida está en curso, y esa indicación NO DEBE ser ninguno de los cuatro estados de archivo del
módulo: es una **fase propia del navegador**, anterior a que exista la tanda, que no se persiste ni
se consulta. SI la subida de un archivo falla, ENTONCES el sistema DEBE señalarlo en su fila y
**excluir ese archivo del encolado**, encolando los que sí subieron; SI no subió ninguno, ENTONCES
el sistema NO DEBE encolar nada.

**R7.** CUANDO todas las subidas de la tanda han terminado y al menos una tuvo éxito, el sistema
DEBE encolar la tanda invocando `enqueueBatchAction` —importada por su ruta exacta
(`lib/modules/documentos/adapters/driving/document-batch-actions.ts`), nunca desde el barril— con
**las rutas que devolvió R4 para los archivos subidos** y la estrategia de R3. El sistema NO DEBE
construir ninguna ruta de almacenamiento por su cuenta.

**R8.** MIENTRAS una tanda encolada tenga algún archivo en «en cola» o «procesando», el sistema
DEBE **sondear** su estado invocando `getBatchStatusAction` a intervalo regular, y DEBE **detener
el sondeo** en cuanto todos los archivos de la tanda estén en «listo» o «error». CUANDO el
componente se desmonta, el sistema DEBE detener el sondeo. El sistema NO DEBE mantener más de una
consulta en vuelo a la vez para la misma tanda. `[D2]`

**R9.** El sistema DEBE implementar el sondeo de R8 **sin añadir ninguna dependencia nueva** al
repositorio. `[D2]`

**R10.** El sistema NO DEBE declarar, leer ni aplicar ningún plazo propio para dar por fallido un
archivo, y NO DEBE decidir por su cuenta cuándo rendirse con una fila colgada: esa caducidad la
evalúa y la devuelve la consulta de estado. *(heredada: caduca a error por tiempo, QC-111 `[D11]`)*

**R11.** El sistema DEBE pintar para cada archivo **exactamente uno** de los cuatro estados que el
módulo publica —en cola, procesando, listo, error—, tomados del tipo `DocumentFileStatus` del
contrato. El sistema NO DEBE inventar, derivar ni persistir ningún estado de archivo adicional.
*(heredada: los cuatro estados, QC-111)*

**R12.** CUANDO un archivo llega en estado «error», o CUANDO una de las tres Server Actions devuelve
un estado de error, el sistema DEBE elegir el texto que muestra **por el `code`** del error y jamás
por el texto de su mensaje. DONDE la fila traiga además un motivo de texto libre, el sistema PUEDE
mostrarlo como detalle, pero NO DEBE tomar ninguna decisión de interfaz a partir de él.
*(heredada: se decide por el `code`, QC-70)*

**R13.** CUANDO un archivo termina en «listo», el sistema DEBE mostrar **solo ese estado**. El
sistema NO DEBE pintar, desplegar, copiar ni ofrecer de ninguna forma el texto que la IA extrajo, y
NO DEBE guardarlo en ninguna parte. `[D3]`

**R14.** El sistema NO DEBE comprobar ningún permiso en el componente ni en la pantalla que lo
monta: la autorización la decide el caso de uso en su primera línea. SI una de las Server Actions
devuelve el error de autorización, ENTONCES el componente DEBE mostrarlo como cualquier otro error
y NO DEBE ocultar, deshabilitar ni condicionar su propio montaje en función de permisos.
*(heredada: el permiso se comprueba en el caso de uso, QC-106 y QC-111)*

**R15.** El sistema NO DEBE abrir ninguna suscripción de tiempo real, canal ni conexión persistente
para enterarse del progreso, y NO DEBE incorporar el cliente de Supabase para ello. `[D5]`

**R16.** El sistema NO DEBE emitir ningún aviso ni notificación cuando una tanda termina o un
archivo falla, más allá de lo que la propia pantalla muestra mientras está a la vista. `[D6]`

**R17.** El sistema DEBE montar el componente en la pantalla de **proveedores** donde vive el
catálogo del proveedor, con la estrategia de **catálogo** fijada por la prop de R3. `[D1]`

**R18.** DONDE se haya resuelto la pregunta abierta 1 —qué permiso exige subir desde fórmulas—, el
sistema DEBE montar el mismo componente en la pantalla de **fórmulas** con la estrategia de
**fórmula** fijada por la prop de R3. MIENTRAS esa pregunta siga abierta, el sistema NO DEBE montar
el componente en fórmulas, NO DEBE añadir ningún permiso nuevo al catálogo cerrado y NO DEBE
reutilizar el permiso de proveedores para esa pantalla. `[D1]`

**R19.** El sistema NO DEBE añadir ninguna ruta, página ni área de navegación propia de documentos:
el componente vive **dentro** de las pantallas de R17 y R18. `[D1]`

**R20.** El sistema DEBE contar con una prueba **de extremo a extremo** que, en un navegador,
entre a la pantalla de R17, seleccione varios PDFs, los suba, vea aparecer sus filas y vea **cambiar
su estado hasta terminar**. Esa prueba DEBE ejercitar la cola y la lectura con IA **simuladas**, y
el sistema NO DEBE requerir red, URL pública ni cuenta de ningún proveedor externo para que el gate
la ejecute. `[D4]`

**R21.** El sistema DEBE cumplir la regla multiplataforma para toda su interfaz nueva: activación
sin depender de `:hover`, objetivos táctiles de al menos 44×44 px, tipografía de al menos 16 px en
los controles de entrada y alto de pantalla sin `100vh`.

**R22.** El sistema DEBE tomar del **contrato público** del módulo `documentos` todo límite, tipo y
código que necesite —el tope de archivos, los tipos de estado de archivo y de tanda, y el tipo de
estrategia—, y NO DEBE redeclarar ninguno de ellos en la capa de interfaz.
*(heredada: el número de archivos se importa, no se reescribe, QC-106)*

**R23.** SI la consulta de estado responde que **no hay tanda** —porque no existe o porque pertenece
a otra empresa, dos casos que la consulta devuelve **exactamente igual** y que el sistema por tanto
NO DEBE distinguir, nombrar ni insinuar en lo que muestra—, ENTONCES el sistema DEBE **detener el
sondeo** de esa tanda y decir que no hay nada que seguir, sin volver a consultarla por su cuenta.
`[D2]` *(heredada: una tanda de otra empresa se rechaza igual que si no existiera, QC-111 R18)*

**R24.** CUANDO el sistema cuenta las páginas de un PDF, los bytes de ese PDF DEBEN quedar
**intactos y utilizables** para toda operación posterior que se haga sobre el mismo arreglo. SI el
procesamiento de un PDF cuenta sus páginas y **después** lo entrega a la lectura con IA, ENTONCES
esa lectura DEBE recibir los bytes completos del archivo, y el sistema NO DEBE rechazarla por
entrada inválida ni dar el archivo por fallido por esa causa. La garantía vale para **cualquier
orden y cualquier combinación** de las operaciones que abren el PDF —contar, extraer texto,
rasterizar— y para **las dos estrategias**, que comparten el conteo.

> **Ninguna decisión cerrada origina este requisito.** No es una elección de alcance: es un
> **defecto de producción** que el recorrido E2E de `[D4]` destapó y que nadie había visto porque
> QC-109 y QC-111 doblan cada pieza por separado y nunca encadenan las dos sobre el mismo arreglo.
> El humano decidió arreglarlo **dentro de esta ficha**, a sabiendas de que mete código de
> `backend` en una ficha declarada `frontend`, a cambio de cerrarla en un solo PR. El detalle
> técnico —quién detacha el búfer y dónde— está en `design.md > 12`.

**R25.** MIENTRAS el procesamiento de un PDF se ejecuta **dentro del servidor de la aplicación**, el
sistema DEBE poder convertir ese PDF a imagen. SI un PDF se procesa con la estrategia de
**catálogo** —que rasteriza siempre—, ENTONCES el sistema NO DEBE darlo por fallido por
**indisponibilidad del rasterizado**, y la pantalla NO DEBE mostrar por esa causa un archivo en
error. La garantía DEBE observarse **con el procesamiento corriendo dentro del servidor**, no
ejecutando el mismo tramo por fuera.

> **Tampoco lo origina ninguna decisión cerrada**, y sale del mismo sitio que R24: el recorrido E2E
> de `[D4]`, que fue lo primero que ejecutó esta cadena **dentro de Next**. Y no es un hallazgo
> nuevo, sino una **pregunta abierta que nadie cerró**: QC-106 dejó por escrito que
> `@napi-rs/canvas` era **DESCONOCIDO** y que se cerraría antes de que QC-111 lo consumiera. No se
> cerró. Detalle, evidencia y lo que este requisito **no** cierra: `design.md > 13`.

### Mapa de decisiones a requisitos

| Decisión (tabla, en orden) | Requisito(s) |
| --- | --- |
| `[D1]` Dos montajes, ninguna pantalla propia | R3, R17, R18, R19 |
| `[D2]` Sondeo propio, con parada y sin dependencia nueva | R8, R9, R23 |
| `[D5]` El tiempo real no entra: lo decide QC-137 | R15 |
| `[D3]` Solo el estado; el texto extraído no se pinta | R13 |
| `[D4]` E2E acotado a lo navegable, con cola e IA simuladas | R20 |
| `[D6]` El aviso de fin es encargo de QC-137 | R16 |
| Heredada: la estrategia es por tanda (QC-111 `[D3]`) | R3 |
| Heredada: diez archivos por tanda, importados (QC-106) | R1, R22 |
| Heredada: los cuatro estados de archivo (QC-111) | R11 |
| Heredada: caduca a error por tiempo, sin plazo propio (QC-111 `[D11]`) | R10 |
| Heredada: los bytes no pasan por el servidor (QC-106) | R2, R5 |
| Heredada: el permiso se comprueba en el caso de uso (QC-106, QC-111) | R14 |
| Heredada: el mensaje se decide por el `code` (QC-70) | R12 |

## Preguntas abiertas

1. **El permiso, y bloquea uno de los dos montajes.** Subir exige `proveedores.modificar`, que es
   lo que el módulo ya declara en `lib/modules/documentos/domain/actor.ts:42`
   (`DOCUMENT_UPLOAD_PERMISSION`). Montado en **proveedores** encaja solo; montado en
   **fórmulas**, quien trabaja recetas necesitaría un permiso del módulo de proveedores para
   poder subir. O se acepta ese préstamo, o `documentos` necesita permiso propio — y eso sería
   una **enmienda al catálogo de permisos de QC-74**, que no la decide esta ficha. **Bloquea el
   montaje en fórmulas; el de proveedores puede avanzar sin esperar.**
2. **El texto extraído no va a ninguna parte, y hay que decirlo antes de construir.** La pantalla
   dirá «listo», pero lo que la IA devolvió **no se persiste**: QC-109 lo devuelve y lo registra
   por consola, y ninguna ficha lo guarda todavía. ¿Se acepta como estado transitorio hasta que
   exista la ficha que lo persista —el catálogo leído hacia productos del proveedor, la fórmula
   leída hacia una receta—, o esa ficha hace falta ya? Mientras siga abierta, **QC-131 firma su
   revisión leyendo el log del servidor**, que es lo decidido en `[D3]`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-21 | ¿Dónde se monta el componente? | **Dos montajes, y ninguna pantalla propia de documentos**: en modo **catálogo** dentro de **proveedores**, en modo **fórmula** dentro de **fórmulas**. Se descartó una pantalla propia bajo el área privada, que habría dado la ruta navegable antes pero deja el componente lejos de donde el dato acaba viviendo. `[D1]` |
| 2026-09-21 | ¿Cómo se entera la pantalla de que un archivo terminó? | **Sondeo propio desde el cliente** sobre `getBatchStatusAction`, que QC-111 ya publica, y **para en cuanto los archivos están todos en `done` o `error`**. La condición de parada es fiable porque `[D11]` de QC-111 garantiza que ningún archivo se queda colgado: caduca a error por tiempo. **Sin dependencia nueva**: no entra SWR. El intervalo lo fija `design.md`. `[D2]` |
| 2026-09-21 | ¿Y el tiempo real, que es lo que esto pide a gritos? | **No entra aquí. Lo decide `QC-137`**, la ficha de notificaciones, que nace de esta acotación. Motivo escrito: Realtime por *Postgres Changes* con la anon key **no puede acotar por empresa** —`docs/architecture.md:372` dice que la RLS no filtra ninguna query de esta aplicación, y la sesión es la cookie de `identity`, no Supabase Auth—, así que la vía real es **Broadcast con canal privado y token firmado por nosotros**, con dependencia nueva (`@supabase/supabase-js`, hoy ausente **a propósito**, `docs/dependencias.md:32`) y enmienda a `docs/architecture.md` por `/afinar-regla`. Eso es arquitectura de todo el repo y no cabe en una ficha de pantalla. **Esta pantalla se engancha a ese canal después, en ficha corta.** `[D5]` |
| 2026-09-21 | Cuando un archivo termina bien, ¿qué se ve? | **Solo el estado. El texto extraído NO se pinta.** Sigue saliendo por consola como lo dejó QC-109, y **QC-131 lo lee de ahí** para firmar su revisión campo por campo. Se descartó mostrarlo desplegable, que habría hecho esa revisión más cómoda, a cambio de una pantalla más simple. Consecuencia anotada, no descubierta a mitad de camino. `[D3]` |
| 2026-09-21 | ¿Hace falta E2E? | **Sí, y aquí se paga la deuda de CUATRO fichas.** QC-106 `[D17]`, QC-108, QC-109 `[D14]` y QC-111 `[D18]` difirieron su E2E a ésta con el mismo motivo escrito: ninguna añadía pantalla que visitar. Ésta sí. **Acotado a lo navegable** —entrar, seleccionar varios PDFs, subirlos, ver las filas cambiar de estado— **con la cola y la IA simuladas**: se descartó el E2E de extremo a extremo con QStash y Gemini reales porque exigiría URL pública y cuentas vivas, y **el gate dejaría de correr sin red**, que es condición del repo. `[D4]` |
| 2026-09-21 | ¿El fin del procesamiento genera un aviso? | **Sí**, y es **encargo de `QC-137`**, no de esta ficha: que una tanda termine —o que un archivo falle— es uno de los eventos que notifican, con QC-107 citada allí como su primer consumidor real. `[D6]` |
| 2026-09-18 | ¿La estrategia se elige por tanda o por archivo? | **Heredado de QC-111 `[D3]`: por tanda.** Quien sube elige una vez y los hasta 10 PDFs van con ella. Es justo lo que la prop de esta ficha asume. No se reabre |
| 2026-09-16 | ¿Cuántos archivos por tanda? | **Heredado de QC-106: diez**, en su única definición, `MAX_FILES_PER_BATCH`. La pantalla lo **importa** del contrato del módulo; no vuelve a escribir el número |
| 2026-09-18 | ¿Qué estados puede tener un archivo? | **Heredado de QC-111**: `queued`, `processing`, `done`, `error`, ya tipados en `domain/batch-status.ts`, con `errorCode` del catálogo y `errorReason` de texto libre. La pantalla **no inventa** un estado más |
| 2026-09-18 | ¿Y si un archivo se queda colgado para siempre? | **Heredado de QC-111 `[D11]`: caduca solo a error por tiempo**, con el plazo en variable de entorno. **La pantalla no implementa ningún plazo propio** y no tiene que decidir cuándo rendirse |
| 2026-09-16 | ¿Los bytes del PDF pasan por el servidor? | **Heredado de QC-106: no.** El navegador sube directo al almacenamiento con un enlace firmado. El componente **no envía el archivo a ninguna Server Action** |
| 2026-09-16 | ¿Dónde se comprueba el permiso? | **Heredado de QC-106 y QC-111: en la primera línea del caso de uso**, nunca en la pantalla ni en la Server Action, que sería una segunda definición de la autorización (`docs/architecture.md > Acceso a datos y autorizacion`). La pantalla **muestra** el resultado, no autoriza |
| 2026-09-12 | ¿Cómo se decide qué mensaje se muestra ante un error? | **Heredado de QC-70: por el `code` del error, jamás por el texto del mensaje.** El mensaje puede cambiar de idioma sin romper a quien lo pinta |
