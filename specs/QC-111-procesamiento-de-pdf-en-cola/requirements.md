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

_Pendiente: los escribe spec_author (F1.2)._

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
