# QC-111 — procesamiento-de-pdf-en-cola · review

> Rama `feature/QC-111-procesamiento-de-pdf-en-cola`, diff `7372d05..HEAD` (12 commits).
> Revisado el 2026-09-18 contra `specs/QC-111-procesamiento-de-pdf-en-cola/` (requirements, design,
> tasks), `docs/architecture.md`, `docs/conventions.md`, `docs/dependencias.md`,
> `docs/verification.md` y `CHECKPOINTS.md`.
>
> **La suite completa NO la corrio el reviewer** (la corre el leader). Aqui se corrio lo necesario
> para verificar cada hallazgo: `pnpm run typecheck` (verde) y
> `pnpm exec vitest run tests/unit/documentos tests/unit/identity/schema/identity-schema.test.ts tests/guards`
> -> **75 archivos, 914 pasados, 23 saltados** (los qcXXX-alcance de otras fichas).

## Veredicto

**RECHAZADO** — **5 BLOQUEANTES y 9 menores**. Los cinco bloqueantes son de arreglo mecanico: cuatro
citas de spec en comentarios nuevos de produccion (`docs/conventions.md > Comentarios`) y el censo de
la propia fachada del modulo, que se quedo sin actualizar. **Nada del diseno ni de la implementacion
hay que rehacerlo**: trazabilidad 27 de 27, migracion, idempotencia, clasificacion de fallos,
aislamiento por empresa, dependencias y el acotamiento de la guardia ajena estan **bien**.

## Checklist

### Especificacion
- [x] `requirements.md` con R1..R27 en EARS y las 22 decisiones cerradas.
- [x] `design.md` con alternativas descartadas y su porque (seccion 11 cron, seccion 12 tabla de
      mensajes vistos).
- [~] `tasks.md`: **25 de 26 marcadas**. T20 (`./init.sh` completo antes del PR) queda sin marcar —es
      del leader y el gate esta corriendo—, pero su linea «Hecho» ya afirma verde, lo que no cuadra
      con la casilla (ver menor 7).

### Trazabilidad — **27 de 27**

Comprobado uno por uno, abriendo el test y leyendo lo que afirma. **Ningun `R<n>` huerfano y ninguno
que pase por casualidad**: los casos estaticos de `qc111-alcance.test.ts` traen su propio caso «el
detector muerde», que es justo la defensa contra el test que pasa porque no mira nada.

| R | Verificado | Nota |
|---|---|---|
| R1 | si | `qc111-alcance` (companyId en los dos modelos, FK compuesta) + `document-batch-repository-prisma` + integracion real contra Postgres |
| R2 | si | esquema y tipos: `strategy` solo en `DocumentBatch`; `enqueue-batch` la pasa una vez |
| R3 | si | `enqueue-batch`: sin permiso, **cero escrituras y cero publicaciones**; actor ausente igual |
| R4 | si | `enqueue-input` (7 casos, el tope sale de `MAX_FILES_PER_BATCH`, no de un literal) + 3 en `enqueue-batch` |
| R5 | si | `enqueue-batch` afirma el ORDEN escribir-antes-de-publicar, no solo que ambas ocurran |
| R6 | si | publicar el 2 de 3 revienta y la tanda sigue (ver menor 4: el design dice lo contrario) |
| R7 | si | `document-job-route`: 401 y cero efectos; `qc111-alcance` afirma que verify aparece antes que JSON.parse y safeParse |
| R8 | si | detector: ni el driving ni `app/api/.../route.ts` nombran sesion, cookie ni permiso |
| R9 | si | zod y JSON roto dan 400, cero efectos |
| R10 | si | ver «2. Idempotencia» abajo |
| R11 | si | el ambito de descarga se construye del claim, con `permissions: []` |
| R12 | si | 4 casos estaticos + 1 de comportamiento; no hay puerto, columna ni campo de recorte |
| R13 | si | texto guardado TAL CUAL, en dominio y en adaptador |
| R14 | si | remove solo en la rama `done`; los dos fallos afirman **NO** llamar a remove |
| R15 | si | ver «3. Clasificacion D5» abajo |
| R16 | si | idem |
| R17 | parcial-OK | se cumple **via caducidad**, como el propio design declara en su seccion 10; tests sobre expireStale y requeue. Ver menor 5 |
| R18 | si | otra empresa == inexistente, con el doble filtrando por empresa y el repo real con `where: { id, companyId }` |
| R19 | si | 4 casos, incluido «QUEDA GUARDADA»; + no hay `vercel.json` con crons y hay un solo `route.ts` en todo `app/api/` |
| R20 | si | detector de delete, deleteMany, DELETE FROM y TRUNCATE sobre las dos tablas + ausencia de `deleted_at` |
| R21 | si | ENABLE y FORCE ROW LEVEL SECURITY para las dos, `down.sql` presente, rechazo cruzado **contra Postgres real** (23503 sobre `document_files_batch_id_company_id_fkey`) |
| R22 | si | `errors.ts` sigue con las cinco clases; `guard-catalogo-de-errores` verde |
| R23 | si | 6 casos; el error nombra las que faltan y **nunca** un valor |
| R24 | si | detector de imports prohibidos en domain y ports; cableado solo en `lib/composition` |
| R25 | si | una sola dependencia nueva; fila aprobada en `docs/dependencias.md`; `@upstash/redis` fuera |
| R26 | si, con matiz | los tres casos exigidos existen y ninguno toca la red. Ver menor 3 (viven en `tests/unit/`) |
| R27 | si | el diff no trae ningun `.spec.ts` bajo `e2e/` |

### Calidad de codigo
- [x] `pnpm run typecheck` verde (corrido aqui).
- [x] Unit de documentos + identity-schema + **todas** las guardias: verde (corrido aqui).
- [x] Integracion de la ficha: 6 casos; leidos, y son de verdad contra Postgres.
- [x] E2E: **ninguno, y esta bien**. D18 y R27 lo difieren a QC-107 con motivo escrito. Deuda con
      destinatario, no exencion. **No se levanta como bloqueante.**
- [x] Dependencias: solo `@upstash/qstash`, con fila en `docs/dependencias.md` y aprobacion citada en
      el design. DEPENDENCIAS_ESPERADAS de 34 a 35, actualizado con su porque.
- [n/a] Multiplataforma: el diff **no toca UI** (ni un `.tsx`, ni `components/`).

### Datos y seguridad
- [x] Las dos tablas nuevas llevan `company_id`; `guard-empresa-en-esquema` verde.
- [x] RLS activada y FORZADA para las dos.
- [x] Migracion con su `down.sql`. Ver «1. La migracion» abajo.
- [x] Permiso validado **en el service** y de primero, en las dos capacidades con actor
      (enqueueBatch, getBatchStatus), con su test.
- [x] Acceso a datos solo por Prisma; el cliente Supabase sigue confinado al Storage.
- [x] Ningun secreto en el repo: `.env.example` con las seis variables **vacias** y documentadas.
- [x] Webhook: **firma validada antes de cualquier efecto** e **idempotente**.

### Modulos hexagonales
- [x] domain y ports no importan `@upstash/qstash`, `next/*` ni `@prisma/client`.
- [x] El barrel del modulo no reexporta ningun "use server": `document-batch-actions.ts` no sale de
      `index.ts` y el propio barrel lo dice.
- [x] Ningun driving instancia su driven: todo sale de `lib/composition`.
- [x] Los dos modelos nuevos traen su marca de modulo.
- [x] La logica vive en domain; las Server Actions son borde de verdad (sesion + traduccion de error).

---

## Los cinco puntos que se pidio mirar con lupa

### 1. La migracion y su `down.sql` — **correcto**

El orden es ahora el unico posible: `CREATE UNIQUE INDEX "document_batches_id_company_id_key"`
**antes** del `ALTER TABLE "document_files" ADD CONSTRAINT "document_files_batch_id_company_id_fkey"`.
Un indice unico sirve de destino de una clave foranea; no hace falta convertirlo en UNIQUE
CONSTRAINT. El 42830 no puede volver.

Se busco la misma especie en el resto del archivo y **no hay mas**: las otras dos FK apuntan a
`companies("id")` y `users("id")`, claves primarias de tablas preexistentes; los dos CHECK solo miran
columnas de su propia tabla; ENABLE y FORCE ROW LEVEL SECURITY no referencian nada.

`down.sql` **coherente y sin residuos**: suelta `document_files`, luego `document_batches`, luego
`DocumentFileStatus` y `DocumentStrategy`. Los dos DROP TABLE se llevan CHECK, indices y FK; **los
dos enums se sueltan explicitamente**, que es lo que un DROP TABLE no hace y es justo donde este tipo
de `down` suele dejar basura —un `CREATE TYPE` posterior fallaria con «type already exists»—. El
orden entre tablas es el correcto —`document_files` es quien guarda la FK— y su comentario ya dice lo
que el archivo hace de verdad, no lo que decia antes. El ciclo up/down/up/down esta verificado en la
bitacora sobre una copia desechable de la plantilla, con censo de objetos en los cuatro momentos, y
sin tocar la base de desarrollo.

### 2. D10, la idempotencia — **el candado aguanta**

El `claim` es un solo `UPDATE ... SET status='processing', attempts=attempts+1 ... WHERE id=$1 AND
status='queued' AND (queue_message_id IS NULL OR queue_message_id=$2) RETURNING ...`, contra el
cliente global (autocommit). Dos entregas concurrentes de la misma fila se serializan por el bloqueo
de fila de Postgres; la segunda reevalua el WHERE tras el commit de la primera, ve `processing` y no
devuelve nada. Segunda entrega despues de terminar: el estado ya es `done` o `error`, `claim` da
`null`, el caso de uso devuelve `skipped` y la ruta responde **200**, que es lo que R10 pide para que
la cola no reintente.

**El test de atomicidad mide lo que dice medir.** `document-batch-claim-concurrency.int.test.ts`
siembra una fila real, lanza dos `claim` con `Promise.all` y **dos identificadores de mensaje
distintos** —asi la condicion que decide es la del estado y no la del mensaje—, y afirma tres cosas
que solo pueden ser ciertas si el candado existe: exactamente un ganador, exactamente un `null`, y
**`attempts === 1`**, o sea que un solo UPDATE se aplico. El aislamiento **por commit y no por
transaccion** es la eleccion correcta y esta declarada: dentro de una unica transaccion de test no
hay dos conexiones compitiendo y el test no mediria nada. Tiene su entrada en
`tests/integration/aislamiento.json` con motivo y fecha, y limpia en orden de FK dentro de un
`finally`.

En el nivel de la ruta, el caso «mismo mensaje dos veces» **no dobla `runDocumentJob`**: cablea el
caso de uso REAL sobre un doble de repositorio que reproduce la semantica del `claim`, asi que «una
sola llamada a la IA», «un solo `finish`» y «200 las dos veces» son afirmaciones sobre el dominio y
no sobre un doble que ya las prometia. **El punto de `CHECKPOINTS.md > Datos y seguridad` sobre
webhooks idempotentes se cumple.**

La alternativa descartada esta bien argumentada: una tabla de mensajes vistos haria dos afirmaciones
donde hay una, y podrian discrepar —mensaje anotado y fila sin terminar—. El candado y el resultado
son la misma fila y no pueden contradecirse.

### 3. D5, reintentable contra definitivo — **la clasificacion y el HTTP coinciden**

`failure-kind.ts` mapea contra `ErrorCode` **reales** del catalogo cerrado, con un `Record` tipado que
**no compila** si uno de los tres codigos queda sin clasificar: `ai_unavailable` reintentable;
`unexpected` e `invalid_input` definitivos; cualquier codigo ajeno a los tres, definitivo. La descarga
del bucket tiene su propia constante, reintentable, porque el puerto lanza antes de producir un
codigo del modulo.

| Salida del trabajo | Resultado | HTTP | Reintenta la cola | Coincide con D5 |
|---|---|---|---|---|
| IA no disponible | requeue | **500** | si | si (R15) |
| descarga o bucket caido | requeue | **500** | si | si (R15) |
| archivo corrupto, mas de 50 pags o 20 MB (`invalid_input`) | error | **200** | no | si (R16) |
| `unexpected` | error | **200** | no | si (R16) |
| ya procesado | skipped | **200** | no | si (R10) |
| exito | done | **200** | no | si |
| firma mala | — | **401** | — | si (R7) |
| cuerpo roto o sin id de mensaje | — | **400** | no (4xx) | si (R9) |

**No se da ninguno de los dos cruces que duelen**: ningun definitivo sale con 5xx —no hay tres
reintentos para nada— y ningun reintentable sale con 2xx —nada se pierde en silencio—. El tope de
reintentos se fija **al publicar**, en la opcion `retries` de `publishJSON`, con el valor de
`ProcessingConfig.maxRetries()` y nunca como literal; su test lo afirma.

### 4. La guardia ajena acotada — **el acotamiento es legitimo, no desarma la regla**

`expectDocumentTypeIsNotAnEnum` hace **dos** comprobaciones, y solo se toco una:

- **Por contenido** (la proteccion real): por cada enum del esquema, ningun valor puede coincidir con
  un codigo de `DOCUMENT_TYPE_CODES`. **Intacta, ni una linea.** Es la que impediria que un enum
  fuera el tipo de documento de identidad **se llame como se llame**, que es de lo que la regla
  protege de verdad.
- **Por nombre**: de `/documen|tipodoc/i` a `/documen(?!tstrategy|tfilestatus)|tipodoc/i`.

La excepcion es un lookahead negativo **anclado a un prefijo concreto**, no un `skip` del caso ni una
lista de enums exentos ni un ensanchamiento del patron. Verificado a mano que sigue mordiendo:
`DocumentType`, `TipoDocumento`, `DocumentTypeCode`, y tambien un hipotetico
`DocumentStrategyDocumentType` —la segunda ocurrencia de «documen» no lleva detras ninguno de los dos
prefijos—. Los dos enums exceptuados son `DocumentStrategy` (catalogo, formula) y `DocumentFileStatus`
(queued, processing, done, error): ninguno de sus valores se parece a un codigo de documento de
identidad, y por eso la comprobacion por contenido los deja pasar sola.

Hay precedente exacto: QC-33 acoto esta misma funcion el 2026-09-03 por el mismo motivo. El cambio
viene acompanado de un caso nuevo que demuestra que la regla sigue mordiendo, y de una nota en el
docstring con fecha, ficha y motivo.

**Veredicto: acotamiento legitimo.** Se le ponen dos peros menores, ninguno bloqueante (menor 1 y
menor 2).

### 5. La regla de comentarios — **aqui estan cuatro de los cinco bloqueantes**

Se revisaron **solo las lineas que la rama anade o modifica** en produccion (`app/`, `lib/`, `db/`;
`.env.example` no es produccion y su bloque puede citar la ficha). Los comentarios **preexistentes**
de `lib/composition/index.ts` —que son decenas y citan fichas y requisitos— **no son hallazgo**: se
limpian por modulo, en fichas del board.

---

## Hallazgos BLOQUEANTES (5)

### BLOQUEANTE 1 — `lib/composition/index.ts:1193` cita `R8` en una linea nueva

    // permiso ni empresa, es la unica autorizacion del Route Handler (R8), asi que se publica tal cual

`docs/conventions.md > Comentarios`: «Nunca se cita una ficha ni un requisito en un comentario de
produccion: ni QC-n, ni Rn, ni design.md, ni decision cerrada. Sin excepciones.»
**Que falta:** borrar «(R8)». La frase ya dice el porque entera sin el.

### BLOQUEANTE 2 — `lib/composition/index.ts:1226` cita `R8` en una linea nueva

    * `runDocumentJob` tampoco recibe actor: no hay usuario delante (R8), y su ambito de empresa sale

Mismo caso. **Que falta:** borrar «(R8)»; el resto se sostiene solo.

### BLOQUEANTE 3 — `lib/composition/index.ts:1252` cita `R8` en una linea nueva

    // ninguna: `runDocumentJob` por R8, `queueSignature` porque verificar una firma no es un caso de

Mismo caso. **Que falta:** sustituir «por R8» por el motivo: «porque no hay usuario delante».

### BLOQUEANTE 4 — `lib/modules/documentos/domain/run-document-job.ts:23` cita `design.md`

    /** Lo que el driving necesita para elegir el codigo HTTP de la tabla de `design.md > 5`. */

Archivo nuevo, linea nueva, cita explicita del spec. **Que falta:** «Lo que el driving necesita para
elegir el codigo HTTP de la respuesta a la cola», sin el puntero.

> El propio `design.md > 9` afirmaba que **ninguna** linea de produccion de esta ficha citaria QC-n,
> Rn, design.md ni «decision cerrada». Cuatro se colaron. La limpieza va en su propio commit
> (`chore(QC-111): limpia comentarios de <archivo>`), solo comentarios y sin tocar codigo, como pide
> `docs/conventions.md`.

### BLOQUEANTE 5 — el censo de la propia fachada de `documentos` se quedo sin actualizar

`tests/unit/composition/documentos-facade.test.ts:31` afirma que la fachada expone EXACTAMENTE seis
claves. Hoy expone diez. Corrido aqui: **1 fallado, 2 pasados**; el diff que imprime es exactamente
`+ enqueueBatch`, `+ getBatchStatus`, `+ queueSignature`, `+ runDocumentJob`.

Este **si es trabajo de QC-111**, y de la misma especie que los tres censos que el implementer si
actualizo (`MIGRACIONES_ESPERADAS`, `DEPENDENCIAS_ESPERADAS`, `aislamiento.json`): es el censo del
**propio modulo** que la ficha amplia, no una guardia ajena. Se le escapo porque la tanda de
verificacion corrio `tests/unit/documentos` y este archivo vive bajo `tests/unit/composition`.

**Aviso para quien lo arregle, que es la parte que muerde dos veces:** el mismo `it` termina con
`for (const clave of Object.keys(documentos)) expect(typeof documentos[clave]).toBe('function')`.
**`queueSignature` NO es una funcion**: es un objeto con `verify` y `messageIdOf`, publicado a
proposito tal cual (el puerto no envuelve ningun caso de uso). Anadir las cuatro claves a la lista y
dejar el bucle como esta cambia un rojo por otro. El bucle tiene que exceptuar `queueSignature` —y
afirmar, en su lugar, que sus dos miembros si son funciones—, o decirlo por clave. Eso no es
desarmar el censo: es escribirlo sobre lo que la fachada publica de verdad.

## Hallazgos menores (9)

### menor 1 — el lookahead exime prefijos, no los dos nombres exactos que la nota promete

`/documen(?!tstrategy|tfilestatus)|tipodoc/i` deja pasar tambien `DocumentStrategyLoQueSea` o
`DocumentFileStatuses`, no solo los dos nombres exactos que el docstring dice exceptuar. La
comprobacion por contenido sigue cubriendo ese hueco, por eso es menor. Un `(?!tstrategy\b|
tfilestatus\b)` pondria el codigo de acuerdo con su propia nota.

### menor 2 — el caso que demuestra el acotamiento reescribe la expresion en vez de usar la funcion

El `it` nuevo declara `const nombreDelTipoDeDocumento = /documen(?!...)/i` **copiada** dentro del
caso. Si manana alguien ensancha el lookahead dentro de `expectDocumentTypeIsNotAnEnum`, este caso
sigue verde: no vigila el codigo que dice vigilar. Es lo unico de todo el acotamiento que se parece a
un test que pasa por casualidad. Se arregla exportando la expresion desde un solo sitio y usandola en
los dos.

### menor 3 — R26 pide «tests de integracion sobre la ruta» y viven en `tests/unit/`

`tests/unit/documentos/document-job-route.test.ts` cubre **los tres casos exigidos** —firma invalida,
firma valida, mensaje repetido— sin tocar la red, y el design los llama «tests de integracion sobre la
ruta» aunque esten bajo `tests/unit/`. Es coherente con el repo —`tests/integration/` es el proyecto
que necesita `DATABASE_URL` y estos no la necesitan—, pero el nombre del requisito y la ubicacion no
coinciden, y eso se nota cuando alguien va a buscarlos. Cobertura: OK. Nomenclatura: a corregir en el
texto del spec, no moviendo archivos.

### menor 4 — el design y el codigo discrepan sobre que pasa tras un fallo al publicar

`design.md > 6.1` dice que si revienta la publicacion del archivo 3 de 10, «los ocho restantes se
quedan en queued». El codigo **no aborta**: el try/catch es **por archivo** dentro del bucle, asi que
del 4 al 10 si se publican, y el test lo afirma. La implementacion **cumple R6** —«dejar ESA fila en
cola, sin inventar otro camino de recuperacion»— y ademas es la conducta preferible. Lo que falta es
que la bitacora lo declare como desviacion consciente del diseno, igual que se hizo con el orden de la
migracion.

### menor 5 — la caducidad puede adelantarse a un reintento en vuelo

R17 se cumple **por la via de la caducidad**, como el propio design declara en su seccion 10, no por
un mecanismo que sepa que la cola agoto su tope. Con el plazo por defecto de 900 s y 3 reintentos con
espera creciente, una fila puede pasar a `error` por tiempo **mientras** un reintento sigue vivo;
cuando ese reintento llegue, `claim` vera `status='error'`, devolvera `null` y la ruta respondera 200.
No corrompe nada ni duplica trabajo —el candado impide las dos cosas—, pero el archivo queda en error
aunque el reintento pendiente pudiera haber terminado bien. Merece una linea en el design, o una nota
para QC-107, que es quien lo pinta.

### menor 6 — el DESCONOCIDO del nombre de la cabecera del id de mensaje desaparecio de la bitacora

T8 mandaba verificar contra el paquete instalado el nombre exacto de la cabecera del identificador de
mensaje y **anotarlo en la bitacora**. El commit `27a7b525` lo anoto y lo declaro **ABIERTO** —«no
aparece en el paquete: el SDK nunca lee esa cabecera»—, pero esa seccion **ya no esta** en el archivo
actual: solo sobrevive como comentario en `queue-signature-qstash.ts`. Importa mas de lo que parece:
si el nombre no fuera `upstash-message-id`, `messageIdOf` devolveria `null` **en toda entrega**, la
ruta responderia 400 siempre y **nada se procesaria nunca**; y ningun test lo veria, porque todos
doblan esa cabecera. No se invento nada, que es lo correcto, pero el desconocido tiene que volver a la
bitacora y subir al leader como pregunta abierta con dueno, junto a la de `@napi-rs/canvas`.

### menor 7 — T20 sin marcar, con su linea «Hecho» ya escrita

`tasks.md:248` sigue sin marcar y justo debajo afirma que `./init.sh` termina en verde. O la casilla
se marca cuando el gate lo confirme, o la linea «Hecho» no se escribe antes. `CHECKPOINTS.md >
Especificacion` pide todas las tasks marcadas.

### menor 8 — catch vacio al publicar, sin ninguna traza

`enqueue-batch.ts` traga la excepcion de `queue.publish` con un comentario y nada mas.
`docs/conventions.md > Manejo de errores` dice «nada de catch vacios: un error o se maneja o se
propaga con contexto». Aqui **esta manejado por diseno** —R6 prohibe otro camino de recuperacion—,
pero la consecuencia es que un fallo sistematico de la cola (un token caducado, por ejemplo) no deja
ni una linea en ningun sitio: se descubre quince minutos despues, en forma de diez filas caducadas.
Registrar por el modulo `observabilidad` no viola R6.

### menor 9 — se borro un caso de otra ficha en vez de enmendar su spec

`tests/unit/documentos/storage-config.test.ts` perdio el caso «R32 — el puerto NO expresa ninguna
operacion de borrado», que era de **QC-106**. La sustitucion es legitima —D6 de esta ficha levanta esa
prohibicion a proposito, y el caso nuevo afirma que `removeDocument` existe— y esta declarada en la
bitacora, pero el `requirements.md` de QC-106 sigue diciendo lo contrario en su R32. Una nota alli
evita que la proxima review de aquel modulo lo lea como una regresion.

---

## Los rojos de la suite completa: 4 de 574, y cual es de quien

El leader midio los cuatro. Uno es de QC-111 (BLOQUEANTE 5, arriba). Los otros tres son **ajenos** y
**no se levantan como bloqueantes de esta ficha**. Los cuatro son, sin embargo, **la misma especie**:
guardias de alcance de fichas ya cerradas, escritas como **afirmaciones absolutas sobre TODO el
repo**, que muerden a cualquier ficha futura que haga lo legitimo. Va aqui el juicio tecnico que se
pidio.

### El diagnostico comun

Una guardia de alcance responde a la pregunta «esta ficha no se salio de su sitio». Esa pregunta es
**sobre el cambio**, no sobre el arbol. Cuando se escribe como «en todo el repo no existe X», deja de
medir el alcance de su ficha y pasa a **legislar sobre el repo entero desde el spec de una feature que
ya cerro** — sin que nadie haya decidido esa regla global, y sin que el autor de la regla este
delante para juzgar la excepcion. El sintoma es siempre el mismo: la guardia se pone roja **el dia que
otro hace algo aprobado**.

Dos de las tres (la 2 y la 4) ya **saben** que deberian mirar el diff: comparan contra `origin/dev` y
se saltan con un skip explicito cuando el rango no esta disponible. El problema no es que miren el
diff: es que su afirmacion es **«cero»** en vez de **«nada que su ficha no justifique»**, y «cero»
caduca.

### Rojo 2 — `tests/unit/navegacion/qc75-convenciones.test.ts` (QC-75 R22)

«`package.json` no gano dependencias respecto al merge-base». Muerde por `@upstash/qstash`, aprobada
por el humano en F1.4, con sus cuatro checks y su fila.

**Acotarla es legitimo**, y la forma correcta **no** es una excepcion literal por nombre de paquete:
eso convierte la guardia en una lista que hay que tocar en cada ficha y que no dice nada de por que.
La forma correcta es **cambiar el sujeto de la afirmacion**: de «esta rama no anade dependencias» a
«las dependencias que esta rama anade tienen su fila en `docs/dependencias.md`» — que es exactamente
lo que `tests/guards/guard-dependencias-aprobadas.test.ts` ya responde, y el propio archivo lo dice en
su cabecera: van juntos y ninguno sustituye al otro.

**Que proteccion se perderia:** ninguna real. La regla que QC-75 queria era «esta ficha de navegacion
no mete librerias», y esa ficha esta cerrada: su diff ya no cambia. Lo que hoy protege el absoluto es
otra pregunta —«entro una dependencia sin aprobar»— que **ya tiene dueno** y lo responde mejor.

### Rojo 4 — `tests/unit/unidades/unidades-convenciones.test.ts` (QC-76 R35)

«Las dependencias y devDependencies son EXACTAMENTE las de `origin/dev`». Identico al 2, con una
diferencia que lo empeora: compara contra la **punta** de `origin/dev`, no contra el merge-base, asi
que **cualquier avance de `dev`** puede ponerla roja o verde sin que nadie toque este codigo.

**Acotamiento legitimo:** el mismo remedio que el 2, y ademas pasar a `origin/dev...HEAD` —tres
puntos, el merge-base— si se decide conservarla como pregunta sobre el diff.

**Que proteccion se perderia:** ninguna que no cubra ya `guard-dependencias-aprobadas`. Merece decirse
que `tests/guards/guard-identificador-de-request.test.ts` **admite por escrito** este mismo defecto
sobre su propio conteo absoluto: «que este conteo sea un absoluto es fragil y conviene saberlo... lo
robusto aqui seria comparar contra el merge-base de la propia rama en vez de contar absolutos». El
repo ya tiene el diagnostico escrito; lo que falta es aplicarlo.

### Rojo 3 — `tests/unit/pedidos-ui/pedidos-convenciones.test.ts` — **el que hay que tocar con pinzas**

Este es distinto de los otros dos, y la preocupacion del leader esta justificada. El caso «la feature
no crea ningun route handler» contiene **dos afirmaciones dentro del mismo it**:

- una **acotada**: ningun archivo de `FUENTES_DE_LA_RUTA` —los de la ruta de pedidos— termina en
  `route.ts`;
- una **absoluta**: ningun archivo bajo `app/` en todo el repo termina en `route.ts`.

La primera es la regla de arquitectura de verdad —«una pantalla no se fabrica rutas propias»,
`docs/architecture.md > Server Actions vs Route Handlers`, hermanada con el caso del fetch a ruta
propia que el mismo archivo vigila dos casos mas abajo— y **sigue verde con QC-111**:
`app/api/documentos/trabajos/route.ts` no esta bajo la ruta de pedidos.

La segunda es la que muerde, y es la que nunca debio escribirse asi: convierte «pedidos no crea route
handlers» en «**el repo no tiene route handlers**», que es una regla que nadie decidio y que
`docs/architecture.md` **contradice explicitamente** — un Route Handler es la via correcta para un
webhook de un tercero, que es justo lo que D9 manda construir aqui.

**Como acotarla sin perder nada:** **borrar la asercion absoluta y dejar la acotada**, partiendo el
caso en dos con nombres honestos. No hace falta excepcion literal, ni lista de rutas permitidas, ni
lookahead: la proteccion real **ya esta** en la asercion acotada, y la absoluta no anade ni una regla
mas sobre pedidos.

**Que proteccion se perderia: cero sobre pedidos.** Lo unico que desaparece es una afirmacion global
que era falsa como regla y que ninguna ficha adopto. Si alguien quiere de verdad la pregunta «los
Route Handlers del repo estan justificados», esa es una **guardia propia en `tests/guards/`** con su
criterio escrito, no un renglon dentro del test de convenciones de una pantalla.

**Lo que NO vale hacer aqui:** anadir `app/api/documentos/trabajos/route.ts` a una lista de exentos
dentro del archivo de pedidos. Eso deja la afirmacion falsa en pie y obliga a la siguiente ficha a
pedirle permiso al spec de pedidos para hacer algo que la arquitectura ya autoriza.

### Si esto merece ficha propia: **si, y merece ficha propia en el board**

No son tres parches: es un patron. Razones, para que el leader las pueda llevar tal cual:

1. **Al menos cinco casos conocidos, no tres**: los tres de arriba, mas `DEPENDENCIAS_ESPERADAS` de
   `guard-identificador-de-request` —que ya lleva su propia autocritica escrita en un comentario—,
   mas la funcion de `identity-schema` que **va por su segundo acotamiento**: QC-33 el 2026-09-03 y
   QC-111 hoy. Cada ficha futura que anada una dependencia aprobada, una tabla o un route handler
   legitimo va a volver a pagarlo.
2. **El coste de no hacerlo es recurrente y silencioso**: cada vez cuesta una vuelta de review para
   decidir si el rojo es propio o ajeno. Es exactamente lo que `docs/verification.md > Rojos
   heredados` intenta evitar, y es lo que ha consumido tiempo del leader hoy.
3. **La decision no es del implementer ni del reviewer.** Acotar la guardia de otra ficha cambia lo
   que esa ficha prometio; hacerlo de a uno, desde dentro de una feature ajena y con prisa, es justo
   como se desarman las reglas sin querer. Una ficha con su spec obliga a escribir **que pregunta
   responde cada guardia** antes de tocarla.
4. **El criterio general cabe en una linea** y arregla los cinco de golpe: *una guardia de alcance
   afirma sobre el DIFF de su rama; y cuando afirma sobre el arbol, su sujeto es su propia ficha,
   nunca el repo entero.*

Alcance sugerido para esa ficha: censar las guardias que afirman en absoluto —barridos de todo el
arbol contra lista vacia, conteos totales de `package.json`, comparaciones contra la punta de
`origin/dev`—, reescribir cada una sobre el diff o sobre su propio ambito, y dejar el criterio en
`docs/verification.md` para que la proxima se escriba bien a la primera. **QC-115** —la guardia de
comentarios sobre el diff, que hoy no existe y por eso los cuatro primeros bloqueantes de esta review
dependen de que el reviewer los vea a ojo— es de la misma familia: puede compartir ficha o ir al lado.

---

## Que hace falta para que esto sea OK

1. Quitar las cuatro citas de spec de las lineas nuevas de produccion (BLOQUEANTES 1 a 4), en un
   commit de solo comentarios.
2. Actualizar el censo de la propia fachada (BLOQUEANTE 5), **con el matiz de `queueSignature`**, que
   no es una funcion y rompe el bucle del mismo caso si se anade sin mas.

Nada mas es condicion. Los nueve menores no bloquean el merge; el **menor 6** conviene subirlo al
leader antes de desplegar, porque es lo unico de la lista que puede impedir que la ficha funcione en
produccion sin que ningun test lo note.

## Lo que NO es hallazgo de esta review

- **Los rojos 2, 3 y 4 de la suite**: guardias de alcance ajenas, en manos del humano. Juicio tecnico
  arriba, a peticion del leader.
- **`@napi-rs/canvas` en el runtime de Vercel**: pregunta abierta 2, con dueno, declarada desde QC-106
  y no rellenada con un supuesto. Bien hecho: la bitacora mide lo unico medible —que carga en Node
  local— y dice explicitamente que eso **no** responde la pregunta.
- **La ausencia de E2E**: decidida en D18 y R27, diferida a QC-107 con motivo escrito. **La decision
  esta bien tomada**: un E2E real aqui exigiria una URL publica y una cuenta, y el gate dejaria de
  correr sin red, que es condicion del repo. Ni bloqueante ni menor.
- **`crypto-js` marcada deprecated en npm**: transitiva de `@upstash/qstash`; los cuatro checks corren
  sobre la directa, que esta limpia, y el repo ya sigue ese criterio con otras transitivas. Se anota
  por honestidad, como hizo el implementer, y no se bloquea.
- **QC-126 (`user-table.test.tsx`) y QC-127 (`order-form.test.tsx`)**: verdes en esta rama.
