# QC-107 — componente-de-carga-de-archivos · design.md

> Diseño técnico de F1.2. Cubre `R1`–`R25` de `requirements.md` —nació cubriendo `R1`–`R22`, y
> `R23`, `R24` y `R25` entraron por enmienda durante la implementación (`## 12`, `## 13`)—. Se apoya entero en lo que
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

### 6.2 Fórmulas — fuera de alcance, lo hace QC-142 (R18)

El montaje es `<DocumentUpload strategy="formula" />` en la pantalla de fórmulas, y **no se
implementa en esta ficha**. **La pregunta abierta 1 se cerró el 2026-09-21**, y salió el segundo de
los dos caminos que estaban sobre la mesa: **`documentos` no toma prestado `proveedores.modificar`,
tiene permiso propio**. Eso es la **cuarta enmienda al catálogo cerrado de QC-74**
—`documentos.consultar` y `documentos.modificar`, por la convención de dos permisos por módulo— y
exige **migración y seed**, porque QC-74 R5 no deja ninguna vía de aplicación que edite el catálogo.

Por tanto el trabajo vive en **QC-142 — «Permiso propio de documentos y montaje de la subida en
formulas»** (`zone: fullstack`, bloqueada por QC-107), **con el montaje dentro**: sin el permiso,
esa pantalla no puede subir nada, así que separarlos daría una pantalla que ofrece una acción que
siempre falla. Aquí no entra nada de eso: **no se añade ningún permiso al catálogo y no se presta el
de proveedores por iniciativa del spec.**

Lo que esta ficha sí deja resuelto es que el montaje sea **solo un montaje**: el modo `formula`
existe en la prop de `## 3` desde el primer día, sin ningún cambio pendiente en el componente. Es lo
que R18 exige hoy, y lo que hace que QC-142 sea una línea en una pantalla.

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

> **Nota 2026-10-09 (QC-249):** por decisión del humano, `DOCUMENTS_E2E_DOUBLES` se pone también,
> con valor, en el scope **Preview** de Vercel: en las previews no hay IA, cola ni storage de
> documentos reales. Vive en Vercel, no en un archivo versionado: ningún archivo versionado la
> activa salvo `playwright.config.ts`, y la regla de `tests/guards/guard-dobles-e2e.test.ts` sigue
> igual. Consecuencia aceptada: en preview la subida de PDF desde el navegador falla (la URL
> firmada apunta a `https://documentos-e2e.invalid` y nadie la intercepta). Detalle en
> `specs/QC-249-entorno-de-preview/design.md > 7` y `docs/architecture.md > Previews (QC-249)`.

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
| R23 | `tests/unit/documentos-ui/document-upload-errors.test.tsx` (`data: null` detiene el sondeo y el texto mostrado no distingue «no existe» de «es de otra empresa») |
| R24 | `tests/unit/documentos/pdf-converter.test.ts` (los bytes siguen enteros tras contar) y `tests/unit/documentos/process-pdf-by-strategy.test.ts` (contar y **después** leer con IA, sobre el mismo arreglo, en las dos estrategias); lo cierra en recorrido `e2e/documentos.spec.ts` |
| R25 | `e2e/documentos.spec.ts` (es el único que ejecuta la cadena **dentro** del servidor de Next, que es donde R25 exige observarla) y `tests/unit/documentos/next-config-externos.test.ts` (la configuración declara el paquete nativo como externo del servidor) |

El mapa definitivo `R<n> → test` lo escribe el implementer en
`progress/impl_QC-107-componente-de-carga-de-archivos.md` (`CHECKPOINTS.md > Trazabilidad`).

## 12. El búfer detachado: por qué ningún PDF termina bien hoy (R24)

**Añadido a esta ficha tras el hallazgo del E2E.** No es alcance que se amplía por gusto: el
recorrido de `[D4]` llega entero —login, subida, encolado, sondeo— y los tres archivos acaban en
`error` en vez de `done`. La causa es un defecto de producción, **medido y no deducido**: sobre un
PDF mínimo, el arreglo pasa de `length` 186 a `length` 0 con `buffer.detached === true` después de
llamar a `getDocumentProxy`.

**La cadena, con su archivo y su línea:**

1. `lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts:56` — `countPages` entrega el
   `Uint8Array` **tal cual** a `getDocumentProxy`, que se queda con el `ArrayBuffer` subyacente y lo
   **detacha**.
2. `lib/modules/documentos/domain/process-pdf-by-strategy.ts:116` — cuenta páginas con
   `input.bytes` y, en la **122**, entrega **ese mismo arreglo** a `readPdfWithAi`.
3. `lib/modules/documentos/domain/ai-read-input.ts:22` — el esquema del borde exige
   `bytes.length > 0` y rechaza con `invalid_input`.

**Afecta a las dos estrategias**, porque quien detacha es el conteo y el conteo es común, y **no
tiene nada que ver con los dobles del E2E**: en producción `runDocumentJob` descarga una vez y pasa
el mismo arreglo por la misma cadena. QC-109 y QC-111 cerraron verdes porque sus tests doblan cada
pieza por separado y **nunca encadenan conteo y lectura sobre el mismo arreglo**, que es
exactamente el hueco que un E2E existe para tapar.

### 12.1 El arreglo

**El adaptador entrega una copia a la librería, en sus tres funciones** —`countPages`,
`extractPdfText` y `renderPages`—, no solo en la que hoy rompe el recorrido:

```ts
await getDocumentProxy(new Uint8Array(pdf));   // countPages, renderPages
await extractText(new Uint8Array(pdf), { mergePages: true });  // extractPdfText
```

**Por qué las tres y no solo `countPages`.** Las otras dos detachan igual: `renderPages` llama a
`getDocumentProxy` por su cuenta (línea 91) y `extractText` lo hace por dentro. Que hoy no rompan
nada es circunstancia —nadie las encadena todavía—, no propiedad: el día que alguien extraiga texto
y después lea con IA sobre el mismo arreglo, el mismo defecto reaparece con otro síntoma y otra
tarde de diagnóstico. Arreglar una y dejar dos es dejar la trampa armada.

**Por qué en el adaptador y no en el dominio.** Quien tiene la restricción externa es la librería, y
el adaptador es el único sitio del repositorio que la conoce (lo dice su propia cabecera: es el
único archivo que la importa). Copiar en `process-pdf-by-strategy` repartiría por el dominio una
defensa contra un detalle de `unpdf`, y el día que se cambie de librería nadie sabría por qué esa
copia estaba ahí. El puerto seguirá prometiendo lo mismo que promete hoy —bytes que entran, bytes
que siguen sirviendo— y ahora lo cumplirá.

**Coste aceptado y dicho:** una copia del PDF en memoria por operación, con el tope de
`MAX_PDF_BYTES` (20 MB) como cota. Se paga sin discusión frente a la alternativa.

**Alternativa descartada — que el dominio vuelva a descargar los bytes** (o los clone) antes de
llamar a la IA. Se descarta por dos motivos: mete en `domain/` una compensación de un detalle de
librería que el dominio no puede ni debe conocer, y en la variante de volver a descargar añade una
segunda bajada del bucket por archivo, con su latencia y su ventana para que el archivo ya no esté.

### 12.2 Cómo se prueba sin tratar la copia como el requisito

R24 está escrito como **garantía observable**, así que el test afirma sobre el recorrido:

- `tests/unit/documentos/pdf-converter.test.ts` — tras `countPages`, el arreglo que se pasó sigue
  teniendo su longitud y su búfer **sin detachar**; lo mismo para `extractPdfText` y `renderPages`.
- `tests/unit/documentos/process-pdf-by-strategy.test.ts` — con el conversor **real** y la IA
  doblada, contar y después leer sobre el mismo arreglo entrega a la IA los bytes completos, y no
  se produce `invalid_input`. En **las dos estrategias**.
- `e2e/documentos.spec.ts` (T15) — el cierre de verdad: las tres filas llegan a `done`.

Ninguno de los tres menciona la copia: si mañana la librería deja de detachar y la copia se quita,
los tres siguen siendo correctos.

## 13. El par nativo que Next no empaqueta (R25)

**El segundo hallazgo del mismo recorrido.** Con el búfer ya arreglado, el E2E seguía rojo. La
salida del servidor y la lectura en caliente de `document_files` dieron el motivo exacto: los tres
archivos con `errorCode: unexpected` y un `errorReason` que dice que **`renderPages` falló porque el
par nativo de rasterizado no está disponible** (`Cannot find native binding`).

**La causa, con archivo y línea:**
`lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts:93` hace
`await resolveRasterizer(() => import('@napi-rs/canvas'))`, y **`next.config.ts` no declaraba ese
paquete como externo del servidor** —cuando esto se escribió traía el comentario de plantilla de
`create-next-app` y nada más—. Next intenta empaquetar el paquete para el servidor y su binario
`.node` se queda fuera del bundle.

**La evidencia, y es lo que descarta «el paquete no está instalado»:** el **mismo tramo ejecutado
fuera de Next** da `ok: true` en las **dos** estrategias. El paquete está instalado y funciona; lo
que falla es el **empaquetado del servidor de Next**, y por eso el mensaje que el módulo emite
—escrito por `resolveRasterizer` para nombrar la causa— apunta al entorno y no al archivo.

**Esto rompe producción, no solo el E2E.** La estrategia `catalogo` se lee en modo `images`, así que
pasa por `renderPages` **siempre**, y `runDocumentJob` corre dentro de Next por su Route Handler.
Sin esto, ningún PDF de catálogo puede terminar bien en el despliegue.

### 13.1 El arreglo, y quién lo mergeó primero

**Dicho sin maquillar: el arreglo no lo escribió esta ficha.** Mientras se implementaba, otra sesión
mergeó **QC-136** (PR #101, commit `d3e13aaf`), nacida del **build roto** —el mismo defecto visto
por su otra cara—, y su `next.config.ts` es el que sobrevive al merge con `dev`:

```ts
serverExternalPackages: ['@napi-rs/canvas'],
```

Su comentario es **mejor que el que habríamos escrito**, y por eso no se tocó: explica que
`@napi-rs/canvas` no es JavaScript sino un envoltorio sobre un binario que su `js-binding.js` elige
por plataforma **en ejecución**, que Turbopack no puede meter un `.node` en un chunk ESM —«no
ecmascript placeable asset»—, que **el `await import()` del adaptador NO basta** porque un
especificador literal sigue siendo analizable y el bundler lo mete en el grafo igual, y trae la
medición: sin la línea `next build` sale con **exit 1**; con ella, **exit 0**.

**Qué aporta entonces esta ficha, que no es poco:**

1. **El hallazgo en ejecución.** El build roto y el PDF en error son el mismo defecto; QC-136 vio el
   primero, el recorrido E2E de `[D4]` vio el segundo, que es el que le importa a quien usa la
   aplicación.
2. **`R25` como garantía.** QC-136 arregló la configuración; nadie había escrito **qué tiene que
   seguir siendo cierto**. R25 lo dice en términos observables, así que el día que alguien cambie de
   rasterizador o de bundler hay un requisito que consultar y no solo una línea heredada.
3. **Un segundo test, y conviven a propósito.** El de QC-136
   (`tests/unit/documentos/canvas-no-empaquetado.test.ts`) mira **ese paquete por su nombre**; el
   nuestro (`tests/unit/documentos/next-config-externos.test.ts`) ancla el invariante a la
   **propiedad**: todo paquete nativo que el servidor cargue tiene que estar declarado externo.
   **Está medido, no razonado**: el implementer inyectó un segundo paquete nativo sin declarar, y el
   test de QC-136 **siguió verde** —no lo ve— mientras el nuestro se puso **rojo**. Esa es la razón
   de que sean dos y de que el de QC-136 no se haya tocado.

En los dos casos el arreglo es **configuración del framework, no código del módulo**: **el adaptador
no cambia** y `resolveRasterizer` sigue exactamente igual —su mensaje sobre el par ausente sigue
siendo el correcto el día que de verdad falte—.

### 13.2 La pregunta que llevaba abierta desde el 2026-09-16, y lo que este arreglo NO cierra

Esto **no es un hallazgo nuevo**: es una pregunta abierta que nadie cerró, y conviene que quede
escrito porque es la lección más cara de toda la cadena de Documentos.
`specs/QC-106-endpoint-de-carga-de-pdf/design.md > 9` se titula literalmente «¿`@napi-rs/canvas`
corre en el runtime de Vercel?», y `docs/dependencias.md` registró la respuesta como **DESCONOCIDO,
no como «sí»**, con el compromiso escrito de **cerrarla antes de que QC-111 lo consumiera**. QC-111
lo consumió. La pregunta siguió abierta. QC-111 `design.md > 0` la volvió a anotar como hallazgo no
bloqueante y la dejó para «T14». Cinco fichas después, la primera ejecución real la encontró.

**Este arreglo NO cierra esa pregunta, y decir lo contrario sería el mismo error otra vez. Que lo
mergeara antes QC-136 no cambia nada de esto**: resuelve el mismo empaquetado y deja viva la misma
deuda. Lo que se resuelve es el **empaquetado bajo Next**, que es lo que rompe aquí y ahora, en
local y en el gate.
**Si además el binario sobrevive al runtime de Vercel sigue siendo DESCONOCIDO**: no se puede
verificar sin un despliegue real, y sin red el gate no puede afirmarlo. Queda como **deuda con
destinatario** —la pregunta abierta 3 de QC-106, que sigue viva y ahora con un consumidor en
producción—, no como resuelto. Regla 6 de `CLAUDE.md`: lo no verificado es un desconocido, no un sí.

**Qué pasa si el runtime de Vercel tampoco lo carga:** no hay sorpresa silenciosa. Cae la estrategia
`catalogo` **en ejecución**, con su fila en error y el motivo que nombra la causa, por el camino que
QC-111 `[D5]`/R16 ya dejó montado. Es feo y es visible, que es lo que se pedía.

### 13.3 Cómo se prueba

- `e2e/documentos.spec.ts` (T15) — **el único test del repo que ejecuta esta cadena dentro del
  servidor de Next**, que es justo donde R25 exige observar la garantía. Las tres filas en «listo»
  es su aserto.
- `tests/unit/documentos/next-config-externos.test.ts` — afirma sobre la **configuración resuelta**,
  no sobre el texto del archivo, con el mismo criterio que `guard-teclear-y-plazo.test.ts`: un valor
  escrito en un comentario satisface a un regex y no cambia nada. Y afirma por **propiedad**, no por
  nombre, que es lo que lo hace distinto del de QC-136 (`13.1`, punto 3).

Ninguno de los dos afirma «el adaptador importa tal paquete»: si mañana se cambia de rasterizador,
R25 sigue diciendo lo que hay que garantizar.
