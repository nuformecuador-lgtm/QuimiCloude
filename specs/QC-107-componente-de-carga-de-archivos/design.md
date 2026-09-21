# QC-107 — componente-de-carga-de-archivos · design.md

> Diseño técnico de F1.2. Cubre `R1`–`R22` de `requirements.md`. Se apoya entero en lo que
> **QC-106**, **QC-109** y **QC-111** dejaron publicado y **no recrea nada de eso**: ni un límite,
> ni un tipo, ni un código de error, ni una Server Action.

## 0. Hallazgos que el leader tiene que ver antes de aprobar

Ninguno bloquea el spec, pero tres cosas no se descubren leyendo el alcance y conviene verlas antes
de decir «aprobado»:

1. **El montaje en fórmulas (R18) queda BLOQUEADO por la pregunta abierta 1** y por nada más. El
   componente se construye con su prop de estrategia desde el primer día, así que cuando el humano
   decida el permiso el montaje es **una línea en una pantalla**, no un rediseño. Su task está
   marcada `BLOQUEADA` en `tasks.md` y no se hace en esta tanda.
2. **El E2E de `[D4]` obliga a tener dobles del lado del SERVIDOR.** El gate corre sin red y
   Supabase **no está conectado** (`docs/verification.md`, 2026-09-18), así que ni siquiera *firmar*
   un enlace de subida funciona en el entorno del gate: el almacenamiento hay que doblarlo igual que
   la cola y la IA. La forma elegida está en `## 8` y toca `lib/composition` y `playwright.config.ts`.
   **Es la decisión de esta ficha que más superficie de producción mueve**; si el humano prefiere
   otra, se cambia aquí y no en el código.
3. **Ninguna dependencia nueva** (`## 9`). `[D2]` ya cierra que SWR no entra; el resto —selección de
   archivos, subida, sondeo— se resuelve con plataforma y con lo que el repo ya tiene.

## 1. Qué se construye, en una frase

Un componente de cliente que recibe una **estrategia** por prop, deja elegir **hasta
`MAX_FILES_PER_BATCH` PDFs**, pide sus enlaces firmados, **sube los bytes desde el navegador**,
encola la tanda y **sondea su estado** hasta que todos los archivos están en `done` o `error`,
pintando una fila por archivo. Se monta hoy en **proveedores**; el montaje en **fórmulas** está
escrito y bloqueado.

No hay tabla nueva, no hay migración, no hay Route Handler nuevo, no hay ruta navegable nueva y no
hay Server Action nueva. **Esta ficha no toca `lib/modules/documentos/domain/` ni `ports/`.**

## 2. Dónde vive el componente

```
components/shared/document-upload/
  index.ts                  # barrel: la superficie publica de la pieza
  document-upload.tsx       # 'use client' — el componente con su prop `strategy`
  document-upload-row.tsx   # 'use client' — una fila de archivo
  use-batch-status.ts       # hook del sondeo (R8)
  upload-file.ts            # el PUT del navegador al enlace firmado (R5)
  labels.ts                 # textos por estado y por `code` (R12)
```

`components/shared/` y no la carpeta de componentes de una ruta: `docs/architecture.md >
Componentes` promueve a `shared/` lo que **al menos dos features** necesitan con la misma API, y
`[D1]` fija exactamente dos montajes con la misma API (la prop de estrategia es la única
diferencia). El barril existe por consistencia con la regla de barriles del repo.

**Qué puede importar** (tabla de `docs/architecture.md > La regla de dependencias`, fila
`components/**`): el barril del módulo `documentos`, las Server Actions **por ruta exacta**,
`lib/shared/ui/**` y `@/lib/utils`. **Nunca** `lib/composition` ni un adaptador driven.

**Alternativa descartada:** dejarlo en `app/(private)/proveedores/[id]/components/` y moverlo a
`shared/` el día que fórmulas lo monte. Se descarta porque el segundo montaje no es hipotético —lo
fija `[D1]`, solo está esperando una respuesta de permiso— y porque mover un componente de cliente
entre árboles arrastra sus tests y su barril; el ahorro sería una carpeta y el coste, un commit de
mudanza en mitad de la ficha que lo desbloquee.

## 3. Contrato del componente

```ts
type DocumentUploadProps = {
  /** La estrategia de TODA la tanda (R3). Tipo del contrato, no un literal. */
  readonly strategy: PdfStrategy;
};
```

Y nada más: no recibe el proveedor ni la receta. La empresa sale del actor dentro del caso de uso y
la ruta la construye el servidor (QC-106), así que **no hay ningún dato de contexto que el
componente pueda o deba pasar**. Que la prop sea una sola es lo que hace que R18 sea una línea.

Lo que importa, y de dónde:

| Símbolo | De dónde | Por qué |
| --- | --- | --- |
| `MAX_FILES_PER_BATCH`, `PdfStrategy`, `BatchStatus`, `DocumentFileStatus`, `DocumentFileStatusEntry` | `@/lib/modules/documentos` (barril) | R22: el contrato es dominio puro, importable desde cliente |
| `errorMessage`, `type ErrorCode` | `@/lib/modules/errores` (barril) | R12: el texto sale del catálogo, por `code` |
| `issueUploadLinksAction` | `@/lib/modules/documentos/adapters/driving/document-upload-actions` | R4: **ruta exacta**; lleva `'use server'` y no pasa por el barril |
| `enqueueBatchAction`, `getBatchStatusAction` | `@/lib/modules/documentos/adapters/driving/document-batch-actions` | R7, R8: mismo motivo |

El motivo de la ruta exacta está escrito en la cabecera de los dos archivos de acciones y en
`docs/architecture.md > Modulos y arquitectura hexagonal`: un `'use server'` en el cierre del barril
lo volvería inimportable desde un componente de cliente.

## 4. La máquina de fases del cliente

Un solo estado local, con cinco fases y una lista de archivos:

```
idle ──elegir──▶ selected ──confirmar──▶ issuing ──▶ uploading ──▶ enqueued ──▶ finished
                                             │            │             │
                                             └── failed ◀──┴─────────────┘
```

- **`selected`** — se ha elegido entre 1 y `MAX_FILES_PER_BATCH` archivos (R1). Por encima del tope,
  la selección se rechaza **entera** y se dice; no se recorta a los diez primeros, que es el mismo
  criterio que aplica el esquema del módulo.
- **`issuing`** — una sola llamada a `issueUploadLinksAction` con `files: [{ fileName, contentType:
  'application/pdf' }]`. La respuesta trae `uploads: SignedUpload[]`, **en el mismo orden** que los
  archivos enviados; ese orden es lo que empareja archivo ↔ ruta. No hay otro emparejamiento
  posible: la ruta la inventa el servidor y el nombre del archivo no entra en ella.
- **`uploading`** — un `PUT` por archivo al `uploadUrl` firmado, **desde el navegador** (R5). Los
  archivos van en paralelo; cada fila muestra su propia fase.
- **`enqueued`** — una llamada a `enqueueBatchAction({ strategy, paths })` con **las rutas de los
  archivos que subieron bien** (R6, R7). Si no subió ninguno, no se encola nada.
- **`finished`** — todos los archivos de la tanda en `done` o `error`.

**La fase de subida no es un estado del módulo (R6, R11).** Mientras la tanda no existe, la fila
muestra «subiendo» / «no se pudo subir», que son fases del navegador y **no** valores de
`DocumentFileStatus`; desde que la tanda existe, la fila pinta exclusivamente el estado que devuelve
la consulta. Es la frontera que evita inventar un quinto estado: uno vive en memoria y muere con la
pantalla, el otro está en Postgres.

### 4.1 El sondeo (R8, R9)

- **Intervalo fijo: 2000 ms.** Es el número que fija este diseño, como pide `[D2]`. Razonado, no
  medido: un archivo tarda decenas de segundos (conversión + IA, con `AI_READ_TIMEOUT_SECONDS` = 60),
  así que 2 s da sensación de vivo y son ~30 consultas por archivo en el peor caso. Sin *backoff*: el
  plazo de vida de una tanda está acotado por la caducidad de QC-111, así que no hay sondeo eterno
  que amortiguar, y un backoff añade una regla que después hay que explicar.
- **Una consulta en vuelo a la vez.** El siguiente temporizador se arma **cuando la anterior
  responde**, no en paralelo con ella: un servidor lento no puede acumular una cola de consultas.
- **Primera consulta inmediata** al recibir el `batchId`, sin esperar los 2 s.
- **Condición de parada:** `files.every(f => f.status === 'done' || f.status === 'error')`. Es fiable
  porque QC-111 `[D11]` garantiza que ninguna fila se queda colgada — la propia consulta caduca a
  error lo que lleve demasiado tiempo (QC-111 R19). **El componente no implementa ningún plazo
  propio** (R10).
- **Parada al desmontar:** el temporizador se limpia en el `cleanup` del efecto y la respuesta que
  llegue tarde se descarta.
- **Si la consulta devuelve error:** el sondeo se **detiene** y la pantalla muestra el mensaje del
  `code` con un control para **reanudar**. Detenerse y decirlo es honesto; seguir sondeando contra un
  error repetido pinta la pantalla de rojo cada 2 s y no arregla nada. Reanudar es una acción de
  quien mira, no un reintento automático (que sería un plazo propio encubierto).
- **Sin dependencia nueva:** `useEffect` + `setTimeout` + `useState`. SWR está descartado por `[D2]`
  y además no aporta nada aquí: su valor es la caché compartida entre componentes y la
  revalidación por foco, y esto es una consulta viva de una sola pantalla que además **para sola**.

## 5. Lo que se pinta

Una fila por archivo, con el nombre que eligió quien sube (el módulo no lo guarda: vive en memoria,
emparejado por el orden de `## 4`) y su estado:

| Fase / estado | Origen | Qué se ve |
| --- | --- | --- |
| subiendo, no se pudo subir | navegador (R6) | indicación de subida en curso o su fallo |
| `queued` | `DocumentFileStatus` | en cola |
| `processing` | `DocumentFileStatus` | procesando |
| `done` | `DocumentFileStatus` | **listo, y nada más** (R13) |
| `error` | `DocumentFileStatus` | el mensaje de `errorMessage(errorCode)` y, como detalle, `errorReason` |

**El texto extraído no se pinta** (R13, `[D3]`). `DocumentFileStatusEntry.extractedText` llega en la
respuesta —el tipo lo publica el módulo y esta ficha no lo cambia— y **se ignora deliberadamente**.
La consecuencia está anotada en `[D3]`: QC-131 firma su revisión leyendo el log del servidor.
**Nada se persiste**: esta ficha no escribe en ninguna tabla (pregunta abierta 2 sigue abierta, y no
se rellena con un supuesto).

**Los textos se eligen por `code`, nunca por el texto del mensaje** (R12). Para el error de una
*fila* se usa `errorMessage(entry.errorCode)`; para el error de una *acción*, el `message` que el
`ErrorState` ya trae traducido del catálogo, y el `code` solo para decidir ramas (p. ej. distinguir
el de autorización). `errorReason` es texto libre y **no decide nada**.

**El componente no autoriza** (R14). No lee permisos, no se oculta y no deshabilita nada por rol: si
falta `proveedores.modificar`, quien rechaza es el caso de uso —`DOCUMENT_UPLOAD_PERMISSION` en
`lib/modules/documentos/domain/actor.ts`— y el componente pinta ese error como cualquier otro.

## 6. Los montajes

### 6.1 Proveedores — se hace ahora (R17)

En `app/(private)/proveedores/[id]/page.tsx`, dentro del `div` de la página y **debajo** de
`CatalogListSection`: el componente carga el catálogo de ese proveedor, y ahí es donde el dato
acabará viviendo (`[D1]`). La página ya exige `proveedores.consultar` con `requirePagePermission`;
eso decide si la pantalla **se enseña**, y el caso de uso decide si se puede **hacer**
(`docs/architecture.md > Permisos y autenticacion`). No se añade ningún corte nuevo.

```tsx
<DocumentUpload strategy="catalogo" />
```

### 6.2 Fórmulas — BLOQUEADO (R18)

El montaje sería `<DocumentUpload strategy="formula" />` en la pantalla de fórmulas, y **no se
implementa en esta ficha**: la pregunta abierta 1 decide si se acepta el préstamo de
`proveedores.modificar` o si `documentos` necesita permiso propio —lo segundo es una enmienda al
catálogo de QC-74, que esta ficha no decide—. **No se inventa ningún permiso nuevo y no se presta el
de proveedores por iniciativa del spec.**

### 6.3 Ninguna pantalla propia (R19)

No se declara ninguna constante de ruta nueva en `lib/shared/routes.ts`, no se toca
`PRIVATE_ROUTE_PREFIXES` y no entra ningún item de menú. `[D1]` descartó la pantalla propia bajo el
área privada.

## 7. Modelo de datos, migraciones y endpoints

**Ninguno.** No hay tabla nueva, así que no hay columna de empresa, ni RLS, ni `FORCE ROW LEVEL
SECURITY`, ni migración, ni `down.sql` que escribir. No hay Route Handler nuevo: las dos mutaciones
son **Server Actions ya existentes**, que es lo que `docs/architecture.md > Server Actions vs Route
Handlers` pide para una mutación de un componente propio.

Contratos de entrada/salida que esta ficha **consume** (no define):

| Llamada | Entrada | Salida |
| --- | --- | --- |
| `issueUploadLinksAction` | `{ files: [{ fileName, contentType: 'application/pdf' }] }` | `{ status: 'success', data: { uploads: SignedUpload[] } }` \| `ErrorState` |
| `PUT <uploadUrl>` | los bytes del PDF, desde el navegador | 2xx / error del almacenamiento |
| `enqueueBatchAction` | `{ strategy, paths }` | `{ status: 'success', data: EnqueuedBatch }` \| `ErrorState` |
| `getBatchStatusAction` | `batchId: string` | `{ status: 'success', data: BatchStatus \| null }` \| `ErrorState` |

`data: null` en la consulta significa «no existe o es de otra empresa, sin distinguirlo» (QC-111
R18): la pantalla lo trata como tanda desconocida y **detiene el sondeo**.

## 8. El E2E, y cómo corre sin red (R20, `[D4]`)

`e2e/documentos.spec.ts`, nuevo, en los dos proyectos de Playwright (Chromium y WebKit: WebKit es el
motor de iOS y la regla multiplataforma pide ejercitarlo). Recorrido, exactamente el de `[D4]`:
login → pantalla de detalle de proveedor → elegir **tres** PDFs → subir → ver tres filas → verlas
pasar a `done`. Sigue el patrón de `e2e/proveedores.spec.ts`: rutas desde `lib/shared/routes`,
asertos sobre `data-testid` y roles accesibles —nunca sobre literales de copy—, fixtures con prefijo
propio y `afterAll` que borra por nombre exacto aunque el test reviente.

**Tres cosas hay que doblar, y por motivos distintos:**

| Puerto | Por qué no puede ser el real en el gate |
| --- | --- |
| `DocumentStorage` | Supabase no está conectado; firmar una subida ya sale a la red |
| `ProcessingQueue` | QStash exige URL pública y credenciales vivas |
| `AiReader` | Gemini exige cuenta y cuota |

**La forma elegida: dobles en `adapters/driven/**`, elegidos en `lib/composition` por una variable
de entorno que solo pone el `webServer` de Playwright.**

```
lib/modules/documentos/adapters/driven/storage/document-storage-memory.ts
lib/modules/documentos/adapters/driven/queue/processing-queue-inline.ts
lib/modules/documentos/adapters/driven/ai/ai-reader-canned.ts
```

- La variable es `DOCUMENTS_E2E_DOUBLES`, se declara **vacía y documentada** en `.env.example`, se
  lee **en el momento de la invocación** (nunca al importar) y su ausencia significa «los reales».
  Es el mismo criterio que QC-111 R23 aplicó a sus variables.
- `playwright.config.ts` la pone en `webServer.env`. Ningún archivo versionado la activa.
- **El almacenamiento en memoria** guarda las rutas que firma y devuelve, para `download`, un PDF
  mínimo fijo; `remove` borra de su mapa. El `uploadUrl` que firma es una URL a la que el navegador
  hará `PUT` y que **el test intercepta con `page.route()`** respondiendo 200: así el recorrido
  incluye de verdad la subida desde el navegador (R5) sin que ningún byte salga a la red.
- **La cola en línea** no publica nada: ejecuta el trabajo del archivo en el mismo proceso, con un
  pequeño retardo por archivo, de modo que el sondeo vea `queued → processing → done` y el E2E
  pruebe lo que vino a probar (que las filas **cambian**), no un salto instantáneo.
- **La IA de guion** devuelve un texto fijo. Que ese texto no se pinte es justo `[D3]`, así que el
  E2E afirma sobre el **estado**, no sobre el contenido.
- **Guardia:** `tests/guards/guard-dobles-e2e.test.ts` se pone roja si la variable aparece activada
  en cualquier archivo versionado que no sea `playwright.config.ts`, y si `lib/composition` elige un
  doble sin consultarla. Vive en las guardias porque ningún grafo de imports seleccionaría ni la
  configuración ni un `.env.example`.

**Alternativa descartada 1 — interceptar también las Server Actions con `page.route()`.** Dejaría
producción intacta, que es su atractivo. Se descarta porque la respuesta de una Server Action es el
*payload* de RSC: falsificarlo ata el E2E al formato interno de Next, se rompe en cada actualización
del framework y, sobre todo, **dejaría de ejercitar el servidor**, que es la única cosa que un E2E
aporta sobre un test de componente. El recorrido de `[D4]` pide navegar de verdad.

**Alternativa descartada 2 — sembrar la tanda y sus filas directamente en Postgres y visitar la
pantalla.** Es lo más barato y no toca nada de producción. Se descarta porque cubre solo la mitad
derecha del recorrido: no habría selección de archivos, ni emisión de enlaces, ni subida desde el
navegador, ni encolado — es decir, se saltaría casi todo lo que `[D4]` enumera y las cuatro fichas
que difirieron su E2E seguirían sin recorrido.

**Alternativa descartada 3 — QStash y Gemini reales.** Ya la descartó `[D4]` con su motivo escrito
(URL pública, cuentas vivas, el gate dejaría de correr sin red). Se anota aquí para que no vuelva.

**Coste aceptado y dicho:** entran tres adaptadores que existen para el E2E y una bifurcación por
entorno en `lib/composition`. A cambio, el gate mantiene la propiedad que el repo exige —corre sin
red— y cuatro fichas pagan su deuda de recorrido. La bifurcación es **una** y está vigilada por
guardia; si se multiplicara, sería momento de una ficha de arnés, no de más `if`.

## 9. Dependencias

**Ninguna nueva.** No se toca `package.json` y `tests/guards/guard-dependencias-aprobadas.test.ts`
debe seguir verde sin cambios en `docs/dependencias.md`.

Lo que se consideró y por qué no entra, que es lo que `docs/architecture.md > Dependencias de
terceros` pide decir antes de escribir algo a mano:

- **SWR** para el sondeo: **descartada por `[D2]`**, que es decisión cerrada. Además está en el
  stack para *queries públicas*, y esta consulta es privada y termina sola.
- **Una librería de *drag & drop*** (`react-dropzone` y compañía): no entra porque **no hay
  *drag & drop*** en esta ficha. La entrada es `<input type="file" multiple accept="application/pdf">`,
  que funciona igual en escritorio, en Safari/WebKit de iOS y en Chrome Android; arrastrar es un
  gesto de ratón y `docs/architecture.md > multiplataforma` prohíbe que sea la única vía. Si algún
  día se añade como **atajo** además del selector, se evaluará entonces con los cuatro checks.
- **Una librería de subida con progreso**: la barra de progreso real por archivo exigiría `XHR` o
  *streams*; aquí basta «subiendo / subido / falló», que se resuelve con `fetch`. No se escribe a
  mano nada que una librería resuelva: no hay nada que resolver.

## 10. Multiplataforma (R21)

Obligación de toda pantalla nueva, y esta no pide excepción:

- El disparador de selección es un `<label>`/botón sobre el `<input type="file">`, activable con
  toque y con teclado; **`:hover` no descubre ni activa nada**.
- Objetivos táctiles de **44×44 px** mínimo en el disparador, en el botón de quitar un archivo de la
  selección y en el control de reanudar el sondeo.
- `font-size` ≥ 16 px en cualquier control de entrada, para que iOS no haga zoom al enfocar.
- Nada de `100vh`; la lista de filas crece con el contenido y no abre scroll anidado.
- Se ejercita en **Chromium y WebKit**, los dos proyectos de Playwright.

## 11. Dónde vive el test de cada requisito

Unit de componente con Testing Library (proyecto `ui`), tecleando con `setupUser()` de
`tests/helpers/user-event.ts`. Los nombres de los casos citan `R<n>` —es el enlace de trazabilidad y
en `tests/` sí se cita—; **en el código de producción no se cita ninguna ficha ni ningún requisito**
(`docs/conventions.md > Comentarios`).

| Requisito | Test |
| --- | --- |
| R1 | `tests/unit/documentos-ui/document-upload-selection.test.tsx` |
| R2 | `tests/unit/documentos-ui/document-upload-selection.test.tsx` |
| R3 | `tests/unit/documentos-ui/document-upload-strategy.test.tsx` |
| R4 | `tests/unit/documentos-ui/document-upload-flow.test.tsx` |
| R5 | `tests/unit/documentos-ui/document-upload-flow.test.tsx` (el doble de `fetch` recibe los bytes; ninguna acción los ve) |
| R6 | `tests/unit/documentos-ui/document-upload-flow.test.tsx` |
| R7 | `tests/unit/documentos-ui/document-upload-flow.test.tsx` |
| R8 | `tests/unit/documentos-ui/use-batch-status.test.tsx` (temporizadores falsos) |
| R9 | `tests/unit/documentos-ui/document-upload-convenciones.test.ts` (lee los imports del componente; ninguna dependencia fuera de lo aprobado) |
| R10 | `tests/unit/documentos-ui/use-batch-status.test.tsx` |
| R11 | `tests/unit/documentos-ui/document-upload-rows.test.tsx` |
| R12 | `tests/unit/documentos-ui/document-upload-errors.test.tsx` |
| R13 | `tests/unit/documentos-ui/document-upload-rows.test.tsx` |
| R14 | `tests/unit/documentos-ui/document-upload-errors.test.tsx` |
| R15 | `tests/unit/documentos-ui/document-upload-convenciones.test.ts` |
| R16 | `tests/unit/documentos-ui/document-upload-convenciones.test.ts` |
| R17 | `tests/unit/documentos-ui/supplier-detail-upload.test.tsx` |
| R18 | **sin test hasta que se desbloquee**: hoy lo cubre en negativo `document-upload-convenciones.test.ts`, que afirma que **ninguna** pantalla de fórmulas monta el componente y que no aparece ningún permiso nuevo |
| R19 | `tests/unit/documentos-ui/document-upload-convenciones.test.ts` (ninguna constante de ruta nueva, ningún item de menú) |
| R20 | `e2e/documentos.spec.ts` |
| R21 | `tests/unit/documentos-ui/document-upload-a11y-tactil.test.tsx`, más los dos proyectos del E2E |
| R22 | `tests/unit/documentos-ui/document-upload-convenciones.test.ts` (el tope y los tipos se importan; ningún literal) |

El mapa definitivo `R<n> → test` lo escribe el implementer en
`progress/impl_QC-107-componente-de-carga-de-archivos.md` (`CHECKPOINTS.md > Trazabilidad`).
