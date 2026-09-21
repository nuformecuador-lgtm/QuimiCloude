# QC-111 — procesamiento-de-pdf-en-cola · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** QC-106, QC-109 · **Rama**
> `feature/QC-111-procesamiento-de-pdf-en-cola`
>
> **Alcance.** Encolar en **Upstash QStash** cada PDF ya subido —hasta **10 por tanda**— y ejecutar
> su procesamiento dentro del trabajo que la cola entrega: la **conversión** que dejó montada
> **QC-106** y la **estrategia** `catalogo`/`formula` que dejó montada **QC-109**. La estrategia se
> elige **una vez por tanda**. Cada PDF gana una **fila propia** con su estado —en cola, procesando,
> listo, error con su motivo— y, cuando termina bien, **el texto que escribió la IA**, guardado tal
> cual. La ficha expone además la **consulta** de ese estado, que es lo que pintará **QC-107**. La
> ruta que llama QStash es un **Route Handler** —el primero del repo— que **valida la firma** y es
> **idempotente**.
>
> **Lo que NO entra.** La subida y la conversión → **QC-106**. La pantalla y su recorrido E2E →
> **QC-107**. La lectura con Gemini → **QC-108**. La estrategia y sus prompts → **QC-109**. **El
> recorte de imágenes → QC-110**, que engancha su paso en este trabajo cuando exista. Los textos
> definitivos de los prompts → **QC-129**. La poda de las filas de estado → ficha propia el día que
> el volumen la justifique (pregunta abierta 1).
>
> *Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> **Qué es «el sistema» aquí.** El módulo `documentos` ampliado con **cuatro piezas**: (1) la
> **operación de encolar** una tanda, que valida el permiso en el service y publica un mensaje por
> archivo; (2) el **trabajo** que la cola entrega, con su **Route Handler** por delante; (3) la
> **consulta** del estado de una tanda; y (4) las **filas** —tanda y archivo— donde esas tres
> escriben y leen. Fuera de «el sistema» quedan, y no se re-especifican, las capacidades que
> **QC-106**, **QC-108** y **QC-109** ya publicaron: la emisión de enlaces, la descarga del bucket,
> la conversión, la lectura con IA y el procesamiento por estrategia. Esta ficha las **invoca**.
>
> Cada requisito cita entre corchetes la decisión cerrada que lo origina. Las 22 decisiones
> (`[D1]`…`[D22]`) quedan citadas al menos una vez.

**R1.** El sistema DEBE persistir, por cada tanda admitida, **una fila de tanda** con su empresa y su
estrategia, y **una fila por PDF** con su empresa, su ruta dentro del bucket, su estado —en cola,
procesando, listo o error— y, cuando el estado es error, el motivo. Ningún archivo de una tanda
puede existir sin su fila, y ninguna fila de archivo puede pertenecer a una tanda de otra empresa.
`[D1]` `[D4]`

**R2.** El sistema DEBE tomar la estrategia **una sola vez por tanda** y aplicarla a todos sus
archivos. NO DEBE existir ninguna entrada, columna ni parámetro por el que un archivo concreto de la
tanda reciba una estrategia distinta de la de su tanda. `[D3]`

**R3.** CUANDO se pide encolar una tanda, el sistema DEBE comprobar **en el service, y como primera
acción**, que quien pide trae el **mismo permiso que exige la subida**, antes de validar la entrada y
antes de tocar la cola, el almacenamiento o la base. SI el permiso falta, ENTONCES el sistema DEBE
rechazar con el código de autorización del catálogo ya existente, **sin escribir ninguna fila y sin
publicar ningún mensaje**. El sistema NO DEBE añadir ningún permiso nuevo al catálogo cerrado.
`[D8]` `[D21]`

**R4.** El sistema DEBE validar la entrada de la operación de encolar con **zod**: la estrategia debe
ser uno de los dos valores del enum cerrado, las rutas deben ser **entre 1 y 10**, y **cada ruta debe
caer bajo la empresa de quien pide**. SI cualquiera de las tres condiciones falla, ENTONCES el
sistema DEBE rechazar la tanda **entera** con el código de entrada inválida, sin escribir ninguna
fila y sin publicar ningún mensaje. `[D22]` `[D15]`

**R5.** CUANDO una tanda supera la validación, el sistema DEBE **escribir primero** la fila de tanda
y las filas de archivo en estado «en cola», y **solo después** publicar en la cola **un mensaje por
archivo**. El sistema NO DEBE publicar ningún mensaje que apunte a una fila que todavía no existe.
`[D4]`

**R6.** SI la publicación de un mensaje falla, ENTONCES el sistema DEBE dejar esa fila en «en cola» y
NO DEBE inventar ningún otro camino de recuperación: esa fila terminará en error **por caducidad**
(R19). `[D11]`

**R7.** El sistema DEBE exponer el trabajo como un **Route Handler** bajo `app/api/`, y DEBE
**verificar la firma** del mensaje **antes** de interpretar el cuerpo y antes de producir cualquier
efecto. SI la firma falta, no es válida o no corresponde al cuerpo recibido, ENTONCES el sistema DEBE
responder **401** y NO DEBE leer ni escribir ninguna fila, descargar ningún archivo ni llamar a la
IA. `[D9]`

**R8.** El Route Handler NO DEBE comprobar permiso de usuario, leer la cookie de sesión ni resolver
un actor de sesión: no hay usuario delante. El único control de entrada es la firma de R7. `[D9]`

**R9.** El sistema DEBE validar con **zod** el cuerpo del mensaje entregado por la cola, ya con la
firma verificada. SI el cuerpo no encaja con el esquema, ENTONCES el sistema DEBE responder con un
resultado que la cola entienda como **definitivo** —un cuerpo roto no mejora reintentándolo— y NO
DEBE procesar nada. `[D22]`

**R10.** CUANDO la cola entrega **dos veces el mismo mensaje**, el sistema DEBE procesarlo **una sola
vez**: la segunda entrega NO DEBE llamar a la IA, NO DEBE crear ninguna fila nueva y NO DEBE
sobrescribir un resultado ya guardado ni un error ya registrado. El sistema DEBE responder a esa
segunda entrega como éxito, para que la cola no la reintente. `[D10]`

**R11.** MIENTRAS ejecuta un trabajo, el sistema DEBE resolver la empresa **de la fila del archivo**
—nunca del cuerpo del mensaje— y DEBE descargar los bytes del bucket a través de la operación que ya
comprueba que la ruta cae bajo esa empresa. SI la ruta del archivo no cae bajo la empresa de su fila,
ENTONCES el sistema DEBE rechazarla sin descargar nada. `[D15]`

**R12.** El trabajo DEBE ejecutar **exactamente** la conversión y la estrategia ya publicadas, y
terminar. El sistema NO DEBE ejecutar, invocar ni preparar ningún paso de **recorte de imágenes**, y
NO DEBE declarar ningún puerto, columna ni campo de salida para él. `[D7]`

**R13.** CUANDO el procesamiento de un PDF termina bien, el sistema DEBE guardar en la fila de ese
archivo el **texto que escribió la IA, tal cual y como texto plano** —sin recortarlo, resumirlo,
reordenarlo ni convertirlo en ninguna estructura— y DEBE dejar la fila en estado «listo». `[D2]`

**R14.** CUANDO un PDF termina **bien**, el sistema DEBE borrar ese archivo del bucket privado.
MIENTRAS una fila esté en cualquier otro estado —en cola, procesando o **error**—, el sistema NO DEBE
borrar su archivo. `[D6]`

**R15.** SI el fallo de un trabajo proviene del **proveedor de IA o del almacenamiento** —caído,
lento, sin cuota—, ENTONCES el sistema DEBE dejar la fila en un estado que admita otro intento y DEBE
responder a la cola de forma que **la cola reintente** el mensaje, hasta un **tope que sale de
configuración**. `[D5]` `[D17]`

**R16.** SI el fallo de un trabajo proviene del **propio archivo** —cifrado, corrupto, por encima del
tope de páginas o de tamaño— o de la estrategia guardada, ENTONCES el sistema DEBE dejar la fila en
**error a la primera**, con su motivo, y DEBE responder a la cola de forma que **no la reintente**.
`[D5]`

**R17.** CUANDO se agota el tope de reintentos sin que el trabajo termine bien, el sistema DEBE dejar
la fila en **error** con su motivo, y NO DEBE dejarla indefinidamente en «en cola» ni en
«procesando». `[D5]` `[D11]`

**R18.** El sistema DEBE ofrecer la **consulta del estado de una tanda**, que devuelve el estado de
cada uno de sus archivos con su motivo de error cuando lo haya. Esa consulta DEBE exigir el permiso
**en el service** y DEBE filtrar por la empresa de quien pide; NO DEBE cortar por quién subió la
tanda. SI la tanda pedida pertenece a otra empresa, ENTONCES el sistema DEBE rechazarla **igual que
si no existiera**, sin revelar la diferencia. `[D13]` `[D15]`

**R19.** CUANDO se consulta el estado de una tanda, el sistema DEBE evaluar la **caducidad**: toda
fila que lleve en «en cola» o «procesando» más del plazo configurado pasa a **error con el motivo de
que se agotó el tiempo**, y así se devuelve y así queda guardada. El plazo DEBE salir de **variable
de entorno**. El sistema NO DEBE montar ningún cron, tarea programada ni segundo Route Handler para
esto. `[D11]` `[D12]`

**R20.** El sistema DEBE **conservar** las filas de tanda y de archivo sin plazo. NO DEBE borrarlas,
podarlas ni programar su borrado, y ninguna de sus operaciones DEBE ejecutar un borrado físico sobre
ellas. `[D14]` `[D22]`

**R21.** Las dos tablas nuevas DEBEN declarar su **columna de empresa**, tener **`RLS` activado y
`FORCE ROW LEVEL SECURITY`**, y llegar en una **migración con su `down.sql`** que la revierte
exactamente. Toda consulta del sistema sobre ellas DEBE filtrar por la empresa de quien pide, con
**test del rechazo cruzado**. `[D15]`

**R22.** El sistema NO DEBE añadir ningún código de error al catálogo cerrado: todo fallo que salga
de él DEBE identificarse con un código **ya existente**, incluido el de proveedor de IA no
disponible. `[D21]`

**R23.** El sistema DEBE resolver por **variable de entorno** todo lo que cambie entre entornos
—credenciales de la cola, su dirección de destino y el plazo de caducidad—, DEBE declararlas
**vacías y documentadas** en `.env.example`, y NO DEBE incluir ningún secreto en el repositorio. Las
variables DEBEN leerse **en el momento de la invocación**, nunca al importar el módulo. `[D17]`

**R24.** Todo el código nuevo DEBE vivir en el módulo `documentos`, con **puertos nuevos y sus
adaptadores driven**. `domain/` y `ports/` NO DEBEN importar el cliente de la cola, `next/*` ni
`@prisma/client`, y el cableado puerto → adaptador DEBE vivir **solo** en `lib/composition`. `[D20]`

**R25.** El sistema NO DEBE incorporar más dependencia nueva que **`@upstash/qstash`**, y esa no DEBE
instalarse antes de su **aprobación humana** y de su fila en `docs/dependencias.md` con los cuatro
checks. `[D16]`

**R26.** La verificación DEBE incluir **tests de integración sobre la ruta** que cubran **firma
inválida**, **firma válida** y **mensaje repetido**. Ningún test DEBE llamar a la red ni depender de
que las variables de entorno tengan valor: la cola, el almacenamiento y la IA se sustituyen por
**dobles**. `[D18]` `[D19]`

**R27.** El sistema NO DEBE añadir ningún recorrido **E2E** en esta ficha, porque no aporta ninguna
pantalla que un navegador pueda visitar; ese recorrido queda **diferido a QC-107**, con el motivo
escrito. `[D18]`

## Preguntas abiertas

1. **Cuándo se podan las filas de estado.** La decisión `[D14]` las conserva sin plazo. Hoy no hay
   volumen que justifique un barrido y **no se crea ficha** por algo que aún no duele; el día que
   duela, la poda es ficha propia con su plazo y su mecanismo, como se hizo en **QC-124** para el
   registro de ejecución de receta.
2. **Si `@napi-rs/canvas` corre en el runtime de Vercel sigue siendo DESCONOCIDO.** Lo declaró así
   `specs/QC-106-endpoint-de-carga-de-pdf/design.md > 9`, y su fila de `docs/dependencias.md` dice
   que «se cierra antes de que QC-111 lo consuma». **Esta ficha es quien lo consume de verdad**: es
   la primera que ejecuta la conversión a imagen en el despliegue, así que es aquí donde se
   descubre. No se rellena con un supuesto; si falla, la estrategia `catalogo` —que lee el PDF como
   imagen— no funciona en Vercel, y eso es un hallazgo de esta ficha.
3. **Los valores numéricos** del plazo de caducidad de `[D11]` y del tope de reintentos de `[D5]`.
   Las dos decisiones fijan que salen de **variable de entorno**; cuál es el valor por defecto lo
   propone el `design.md` con su motivo.
4. **Qué hace el trabajo si el PDF ya no está en el bucket** cuando va a buscarlo. `[D6]` solo borra
   tras terminar bien, así que no debería pasar por nuestro camino; queda como caso de borde del
   `design.md` y no como supuesto.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-18 | ¿Dónde vive el estado de cada PDF? | **Tabla nueva en Postgres, por Prisma**, una fila por PDF, con su empresa, su ruta, su estrategia, su estado y el motivo del error. **QC-106 D5 dejó esta decisión aquí a propósito** —«así no hay dos fichas decidiendo la misma tabla»—, así que esto no reabre nada: lo cierra. `[D1]` |
| 2026-09-18 | ¿Se guarda lo que leyó la IA? | **Sí, en esa misma fila, tal cual y como texto plano.** No se interpreta, no se recorta y no se convierte en ninguna estructura: eso sigue heredado de **QC-108** y **QC-109 D10**. Motivo: hoy el texto solo deja su **longitud** en el registro (**QC-109 D16**), así que sin esto un catálogo de 40 páginas ya pagado a Gemini se pierde. Era, además, lo que **QC-109** mandó explícitamente a esta ficha. `[D2]` |
| 2026-09-18 | ¿La estrategia se elige por tanda o por archivo? | **Por tanda.** Quien sube elige una vez y los hasta 10 PDFs van con ella. Es lo que ya asume **QC-107**, cuya ficha dice que «una PROP decide el modo de conversión» para todo el componente. `[D3]` |
| 2026-09-18 | ¿La tanda existe como algo, o son diez archivos sueltos? | **Existe y tiene identidad propia.** Es consecuencia directa de `[D3]` —la estrategia cuelga de ella— y de que **QC-107 consulta el estado de la tanda entera de una vez**, no archivo por archivo. Hoy la tanda no existe: **QC-106 D5** cerró que la subida no deja ninguna fila y devuelve solo rutas. `[D4]` |
| 2026-09-18 | Un PDF falla. ¿Se reintenta? | **Solo lo que puede mejorar reintentando.** Si el fallo es del proveedor de IA o del almacenamiento —caído, lento, sin cuota— el trabajo vuelve a la cola y **QStash** lo reintenta hasta un tope que sale de configuración. Si el fallo es **del propio archivo** —cifrado, corrupto, por encima del tope de 50 páginas o 20 MB— queda en error **a la primera**: reintentarlo da tres veces el mismo error y cuesta tres conversiones. **Los reintentos son de esta ficha y solo de esta**: **QC-108** cerró cero a propósito para que dos capas no multiplicaran el gasto en silencio. `[D5]` |
| 2026-09-18 | ¿Cuándo se borra el PDF temporal del bucket privado? | **Al terminar bien.** Procesado con éxito, lo que importaba es el texto leído. **Si terminó en error se conserva**, que es justo cuando alguien va a querer abrirlo para ver qué pasó o reintentarlo sin pedirle al proveedor que lo vuelva a mandar. `[D6]` |
| 2026-09-18 | ¿El trabajo ejecuta el recorte de imágenes? | **No.** Hace conversión + estrategia y termina. **QC-110 no existe todavía y está bloqueada por esta ficha**, así que engancha su paso cuando exista. Mismo patrón con el que **QC-106** publicó la conversión sin invocarla y **QC-108** la lectura sin dispararla: nadie construye el hueco de otro, y el formato de coordenadas que QC-110 declara abierto no se diseña a ciegas. **La `description` del board se corrigió antes de sembrar.** `[D7]` |
| 2026-09-18 | ¿Quién encola, y dónde se comprueba el permiso? | **Una operación del módulo que valida el permiso en el SERVICE**, invocada desde la pantalla cuando los bytes ya están en el bucket. Es exactamente el «**valida quien encola**» que cerró **QC-109 D7**, y el permiso es **el mismo de la subida** de **QC-106 D4**: solo Administrador, **sin ampliar el catálogo cerrado de quince** —no nace ningún `documentos.*`, no hay migración ni seed de permisos—. `[D8]` |
| 2026-09-18 | ¿Y la ruta que llama QStash? | **Route Handler**, el primero del repo: hoy `app/api/` no existe. **No comprueba permiso de usuario porque no hay usuario delante**: comprueba **la firma de QStash**, y quien no la traiga no entra. Es lo que manda `docs/architecture.md > Server Actions vs Route Handlers` para un webhook de un tercero. `[D9]` |
| 2026-09-18 | ¿Qué significa «idempotente» aquí? | Que **el mismo mensaje entregado dos veces no procesa dos veces**: no llama a Gemini dos veces, no duplica filas y no pisa con uno nuevo un resultado ya guardado. Lo exige `CHECKPOINTS.md > Datos y seguridad` para todo webhook, y con `[D5]` reintentando de verdad deja de ser teórico. `[D10]` |
| 2026-09-18 | Un PDF se sube y su trabajo nunca llega. ¿Qué ve el usuario? | **Caduca a error por tiempo.** Un archivo que lleva más del plazo en «en cola» o «procesando» pasa a error con el motivo de que se agotó el tiempo. El plazo sale de **variable de entorno**. Sin esto, la pantalla de **QC-107** muestra una rueda girando para siempre y nadie sabe si seguir esperando. `[D11]` |
| 2026-09-18 | ¿Quién declara esa caducidad? | **Se evalúa AL CONSULTAR el estado, y no hay cron.** Quien mira ve siempre la verdad, y si nadie mira, nadie necesita saberlo. Se descartó a sabiendas el barrido programado: sería **un segundo Route Handler con su propio calendario** en la ficha que ya monta el primero del repo. `[D12]` |
| 2026-09-18 | ¿Quién puede consultar el estado de una tanda? | **Cualquier Administrador de la empresa**, filtrado por empresa como todo lo demás. No se corta por autoría: si quien subió diez catálogos se va a casa, otro administrador tiene que poder ver cómo acabaron, y una tanda no puede quedar huérfana porque esa cuenta se bloquee. Ningún listado del repo corta hoy por autor. `[D13]` |
| 2026-09-18 | ¿Se conservan las filas de estado? | **Sí, sin plazo.** Quedan como historial de qué se procesó, cuándo y con qué resultado. Nada las borra en esta ficha; la poda es ficha propia el día que el volumen la justifique (pregunta abierta 1). `[D14]` |
| 2026-09-18 | La tabla es nueva: ¿aislamiento por empresa? | **Sí, y es obligatorio**: columna de empresa, toda consulta filtrando por la empresa de quien pide **con test del rechazo cruzado**, `RLS` con `FORCE ROW LEVEL SECURITY` y migración con su `down.sql`. Lo hace cumplir `tests/guards/guard-empresa-en-esquema.test.ts` y lo exige `CHECKPOINTS.md > Datos y seguridad`. **Aquí sí hay fila**, así que el aislamiento ya no es solo la ruta como en **QC-106 D6**: son las dos cosas. `[D15]` |
| 2026-09-18 | ¿Dependencia nueva? | **`@upstash/qstash`, y solo esa.** **Los cuatro checks, corridos contra el registro de npm el 2026-09-18 y los cuatro limpios**: sin `deprecated`; **`2.11.3` del 2026-07-22**; **561.073** descargas semanales; licencia **MIT**. **Arrastra tres transitivas** —`jose`, `crypto-js` y `neverthrow`—, ninguna presente hoy en `package.json`. **`@upstash/redis` NO entra** por decisión de la ficha, y **la aprobación en suspenso de QC-28 no se toca**. La fila en `docs/dependencias.md` y la **aprobación humana van en F1.4**, como QC-25, QC-28, QC-106 y QC-108: **nada se instala antes** (regla 7 de `CLAUDE.md`). `[D16]` |
| 2026-09-18 | Configuración | Las variables que necesiten QStash y el plazo de caducidad quedan **declaradas y vacías** en `.env.example` y documentadas. **Ningún secreto en el repositorio** (`CHECKPOINTS.md > Configuracion`). Heredado de **QC-106 D15** y **QC-108**. `[D17]` |
| 2026-09-18 | ¿Cómo se verifica, siendo un webhook? | **Tests de integración aquí** sobre la ruta: **firma inválida**, **firma válida** y **mensaje repetido** (idempotencia). **E2E diferido a QC-107 con motivo escrito**: esta ficha no añade ninguna pantalla que un navegador pueda visitar. Es **deuda con destinatario, no exención**, y sigue el criterio de **QC-106 D17**, **QC-108** y **QC-109 D14**. Se descartó el E2E completo aquí: exigiría una URL pública que QStash pueda llamar y una cuenta real, y **el gate dejaría de correr sin red**, que es condición del repo. `[D18]` |
| 2026-09-18 | ¿Se puede verificar sin red? | **Sí, y es obligatorio.** QStash, el almacenamiento y la IA se sustituyen por dobles; **ningún test llama a la red** ni depende de que las variables de entorno tengan valor. Heredado de **QC-106 D14** y **QC-108**. `[D19]` |
| 2026-09-18 | ¿Dónde vive este código? | Módulo **`documentos`**, que ya existe desde **QC-106**. **Puertos nuevos + adaptadores driven**; `domain/` y `ports/` no importan `@upstash/qstash`, `next/*` ni `@prisma/client`, y el cableado puerto → adaptador vive **solo** en `lib/composition`. Heredado de **QC-106 D13 y D14**. `[D20]` |
| 2026-09-18 | ¿Códigos de error nuevos? | **Ninguno.** Se reutiliza el catálogo cerrado, incluido el `ai_unavailable` que **QC-108** ya añadió. **No se enmienda** otra vez. Heredado de **QC-106 D16**. `[D21]` |
| 2026-09-18 | Capas, borde e identificadores | Validación de entrada con **zod** en el borde, incluida la del cuerpo que manda QStash (`docs/conventions.md`). Identificadores de la base en **inglés** (**QC-4**). Borrado **lógico** donde aplique (**QC-4**). Heredado de **QC-106 D18** y **QC-109 D11**. `[D22]` |
