# QC-107 — componente-de-carga-de-archivos · bitácora de implementación

> Fase F2. Escrita por el `implementer`, que coordinó a `frontend_dev` (T1–T11) y a `backend_dev`
> (T13–T14). **Todas las tasks están cerradas salvo T17, que es del leader, y T12, que salió a
> QC-142 con permiso propio.** El recorrido de extremo a extremo pasa en los dos navegadores.
> Nada aquí se autoaprueba:
> decide el reviewer.

## Estado de las tasks

| Task | Estado | Quién |
| --- | --- | --- |
| T1–T8 — componente, subida, filas, sondeo y sus tests | cerradas | `frontend_dev` |
| T9 — montaje en proveedores | cerrada | `frontend_dev` |
| T10–T11 — asertos por ausencia y multiplataforma | cerradas | `frontend_dev` |
| T12 — montaje en fórmulas | **BLOQUEADA**, no se toca | — |
| T13–T14 — dobles del E2E y su guardia | cerradas | `backend_dev` |
| T15 — el E2E navegable | **cerrada y en verde** en Chromium y WebKit | `frontend_dev` |
| T16 — esta bitácora | cerrada | `implementer` |
| T18 — R23, la tanda desconocida | cerrada | `frontend_dev` |
| T19 — el búfer detachado (R24) | **cerrada y verificada** | `backend_dev` |
| T20 — el par nativo bajo Next (R25) | cerrada | `backend_dev` |
| T17 — gate completo antes del PR | **sin marcar**, es del leader | — |

## Archivos creados

Producción — el componente:

- `components/shared/document-upload/index.ts`
- `components/shared/document-upload/document-upload.tsx`
- `components/shared/document-upload/document-upload-row.tsx`
- `components/shared/document-upload/use-batch-status.ts`
- `components/shared/document-upload/upload-file.ts`
- `components/shared/document-upload/labels.ts`

Producción — los dobles del recorrido E2E y su bifurcación:

- `lib/modules/documentos/adapters/driven/storage/document-storage-memory.ts`
- `lib/modules/documentos/adapters/driven/queue/processing-queue-inline.ts`
- `lib/modules/documentos/adapters/driven/ai/ai-reader-canned.ts`
- `lib/modules/documentos/adapters/driven/config/e2e-doubles-env.ts`

Tests:

- `tests/unit/documentos-ui/` — `helpers.ts`, `document-upload-strategy.test.tsx`,
  `document-upload-selection.test.tsx`, `document-upload-flow.test.tsx`,
  `document-upload-rows.test.tsx`, `document-upload-errors.test.tsx`,
  `use-batch-status.test.tsx`, `supplier-detail-upload.test.tsx`,
  `document-upload-convenciones.test.ts`, `document-upload-a11y-tactil.test.tsx`
- `tests/guards/guard-dobles-e2e.test.ts`

## Archivos modificados

- `app/(private)/proveedores/[id]/page.tsx` — dos líneas: el import y el montaje en modo catálogo
  debajo del catálogo del proveedor. **Ningún corte de permiso nuevo.**
- `lib/composition/index.ts` — la bifurcación por entorno de los tres puertos, consultada **en cada
  llamada**. `runDocumentJob` sale a un `const` para que la cola en línea lo reciba por parámetro:
  sin eso, un adaptador driven tendría que importar la composición, que es la flecha prohibida. El
  censo cerrado de claves de la fachada **no cambia**.
- `.env.example` — la variable de los dobles, vacía y documentada.
- `playwright.config.ts` — sólo `webServer.env`.
- `tests/unit/composition/documentos-facade.test.ts` — dos casos nuevos de la bifurcación.
- `tests/unit/documentos/limits-and-path.test.ts` — un `10` literal que el doble introdujo y que
  esa guardia prohíbe repetir fuera de `limits.ts`.
- Tres archivos de `tests/unit/proveedores-ui/` — **sólo** los dos `vi.mock` de las acciones de
  `documentos`, que la página arrastra desde T9. Ningún aserto cambió de exigencia.

## Mapa `R<n> → test`

Todos los caminos son relativos a `tests/unit/`, salvo la guardia.

| Req | Test | Caso |
| --- | --- | --- |
| R1 | `documentos-ui/document-upload-selection.test.tsx` | `la seleccion admite hasta el tope de archivos que publica el modulo (R1)` · `una seleccion por encima del tope se rechaza entera y no llama a ninguna accion (R1)` |
| R2 | `documentos-ui/document-upload-selection.test.tsx` | `la seleccion se restringe a PDF (R2)` |
| R3 | `documentos-ui/document-upload-strategy.test.tsx` | `el componente exige la estrategia de toda la tanda por prop (R3)` |
| R4 | `documentos-ui/document-upload-flow.test.tsx` | `pide los enlaces de subida con la accion del modulo importada por su ruta exacta (R4)` |
| R5 | `documentos-ui/document-upload-flow.test.tsx` | `los bytes del PDF viajan al enlace firmado y no a ninguna Server Action (R5)` |
| R6 | `documentos-ui/document-upload-flow.test.tsx` · `documentos-ui/document-upload-rows.test.tsx` | `un archivo cuya subida falla queda senalado y no se encola (R6)` · `si no sube ningun archivo no se encola nada (R6)` · `mientras el archivo sube, la fila no muestra ningun estado del modulo (R6)` |
| R7 | `documentos-ui/document-upload-flow.test.tsx` | `encola la tanda con las rutas devueltas y la estrategia de la prop (R7)` |
| R8 | `documentos-ui/use-batch-status.test.tsx` | `sondea el estado de la tanda hasta que todos los archivos terminan (R8)` · `deja de sondear en cuanto ningun archivo sigue en cola ni procesando (R8)` · `no lanza una consulta nueva mientras la anterior sigue en vuelo (R8)` · `deja de sondear al desmontarse (R8)` |
| R9 | `documentos-ui/document-upload-convenciones.test.ts` | `no anade ninguna dependencia: el sondeo se resuelve con la plataforma (R9)` |
| R10 | `documentos-ui/use-batch-status.test.tsx` | `no declara ningun plazo propio para dar por fallido un archivo (R10)` |
| R11 | `documentos-ui/document-upload-rows.test.tsx` | `la fila pinta solo los cuatro estados que publica el modulo (R11)` |
| R12 | `documentos-ui/document-upload-errors.test.tsx` | `el texto de un archivo en error se elige por su code y no por su mensaje (R12)` · `un error de la consulta detiene el sondeo y se muestra por su code (R12)` |
| R13 | `documentos-ui/document-upload-rows.test.tsx` | `un archivo listo no muestra el texto extraido (R13)` |
| R14 | `documentos-ui/document-upload-errors.test.tsx` · `documentos-ui/supplier-detail-upload.test.tsx` | `el componente no comprueba ningun permiso y muestra el error de autorizacion como cualquier otro (R14)` · `el montaje no anade ningun corte de permiso propio a la pantalla (R14, R17)` |
| R15 | `documentos-ui/document-upload-convenciones.test.ts` | `no abre ninguna suscripcion de tiempo real ni incorpora el cliente de Supabase (R15)` |
| R16 | `documentos-ui/document-upload-convenciones.test.ts` | `no emite ningun aviso ni notificacion cuando una tanda termina (R16)` |
| R17 | `documentos-ui/supplier-detail-upload.test.tsx` | `la pantalla de detalle de proveedor monta el componente en modo catalogo (R17)` |
| R18 | `documentos-ui/document-upload-convenciones.test.ts` | `ninguna pantalla de formulas monta el componente y no aparece ningun permiso nuevo (R18)` |
| R19 | `documentos-ui/document-upload-convenciones.test.ts` | `no anade ninguna ruta, constante de ruta ni item de menu propios de documentos (R19)` |
| R20 | `composition/documentos-facade.test.ts`, `tests/guards/guard-dobles-e2e.test.ts` y **`e2e/documentos.spec.ts`** | `sin la variable de entorno, la composicion elige los adaptadores reales (R20)` · `con la variable, la composicion elige los dobles (R20)` · los cinco casos de la guardia · `sube tres PDFs y ve cambiar el estado de cada uno hasta terminar (R20)`, **en verde en Chromium y WebKit**. |
| R21 | `documentos-ui/document-upload-a11y-tactil.test.tsx` | `la subida se puede activar sin hover y con objetivos tactiles de 44px (R21)` · `ninguna parte del componente mide la pantalla con 100vh (R21)` |
| R22 | `documentos-ui/document-upload-convenciones.test.ts` | `el tope y los tipos se importan del contrato del modulo y no se reescriben (R22)` |
| R23 | `documentos-ui/use-batch-status.test.tsx` y `documentos-ui/document-upload-errors.test.tsx` | `el hook deja de sondear cuando la consulta responde que no hay tanda (R23)` · `una tanda desconocida detiene el sondeo (R23)` · `el componente avisa de tanda desconocida sin distinguir si no existe o es de otra empresa (R23)` |
| R24 | `documentos/pdf-converter.test.ts` y `documentos/process-pdf-by-strategy.test.ts` | `contar las paginas deja los bytes del PDF intactos (R24)` · `extraer el texto deja los bytes del PDF intactos (R24)` · `rasterizar deja los bytes del PDF intactos (R24)` · `la lectura con IA recibe los bytes completos despues de contar las paginas (R24)` (conversor **real**, en las dos estrategias) |
| R25 | `documentos/next-config-externos.test.ts`, `documentos/canvas-no-empaquetado.test.ts` (de QC-136) y **`e2e/documentos.spec.ts`** | `la configuracion declara el par nativo de rasterizado como externo del servidor (R25)` · el recorrido es **el único test del repo que ejecuta esta cadena dentro del servidor de Next**, que es donde R25 exige observar la garantía |

**R18, dicho entero.** La pregunta abierta 1 **ya está cerrada**: el humano decidió que `documentos`
tenga **permiso propio** —cuarta enmienda al catálogo cerrado de QC-74—, y eso es backend con
migración, así que el montaje en fórmulas **salió de esta ficha a QC-142**. R18 se reescribió para
exigir lo que esta ficha sí entrega y sí se puede verificar hoy. Lo cubre el caso **en negativo**, y
se comprobó que **muerde** por sus dos vías: montar el componente en la pantalla de fórmulas lo pone
rojo, y añadir un permiso al catálogo cerrado también. **No está bloqueado: está fuera de alcance**,
con destinatario.

**R20, dicho entero.** El recorrido navegable ejercita login, pantalla, selección de tres PDFs,
subida real desde el navegador al enlace firmado, encolado y sondeo vivo contra Postgres, en
Chromium y en WebKit, y **las tres filas llegan a «listo»**. Los dos defectos que lo tumbaron por el
camino —el búfer detachado (R24) y el par nativo sin externalizar (R25)— están arreglados. **R20
está cerrado**, medido tres veces: por el implementer, por el reviewer y de nuevo tras integrar
`dev`.

## Salida real de los tests

Gate rápido sobre los 28 archivos del diff contra `origin/dev`:

```
-> pnpm run typecheck
✓ typecheck paso
-> pnpm run lint
✓ lint paso
-> pnpm run test:rapido

[test:rapido] tests relacionados con 28 archivo(s) del diff vs origin/dev

 Test Files  1 failed | 159 passed (160)
      Tests  1 failed | 2366 passed | 1 skipped (2368)
   Duration  188.18s
```

El **único** rojo, y no es de esta rama:

```
FAIL |node| tests/unit/composition/documentos-facade.test.ts
  > R22, R26, R2 de QC-129 — construir la fachada con GEMINI_API_KEY, GEMINI_MODEL,
    CATALOG_PROMPT y FORMULA_PROMPT ausentes no lanza
  AssertionError: expected 'AQ.Ab8RN6...' to be undefined
  tests/unit/composition/documentos-facade.test.ts:86
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
```

**Comprobado, no supuesto.** Se volcó la versión de `origin/dev` de ese mismo archivo a un nombre
temporal y se corrió sola: **falla igual** (`Tests 1 failed | 2 passed`), con el archivo intacto y
sin una línea de esta rama. La causa es de entorno: el `.env` local de esta máquina lleva una clave
de IA real que vuelve a `process.env` después del borrado del `vi.hoisted`. Los dos casos nuevos de
la bifurcación, en ese mismo archivo, pasan.

**Ese archivo NO está en `tests/baseline-rojos.json`**, así que por la letra de
`docs/verification.md` cuenta como bloqueante. No se apaga por cuenta del implementer: queda para
el leader decidir si entra en esa lista o si se arregla.

Corridas de apoyo, verdes:

```
pnpm exec vitest --run tests/unit/documentos-ui    -> Test Files 9 passed (9) · Tests 31 passed (31)
pnpm exec vitest --run tests/unit/proveedores-ui   -> Tests 202 passed | 4 skipped (206)
```

La guardia nueva se comprobó que **muerde** por sus dos motivos, con un fixture sobre el árbol real
para cada uno: activar la variable en un archivo versionado distinto de la configuración de
Playwright, y elegir un doble sin consultarla.

## Lo que NO se cerró y por qué

1. **T12 / R18 — montaje en fórmulas: FUERA DE ALCANCE, en QC-142.** La pregunta abierta 1 se
   cerró con permiso propio para `documentos`, que es backend con migración. T12 queda sin marcar
   a propósito y la pantalla de fórmulas no se tocó.

2. **El hueco de `design.md > 8` que bloqueaba el E2E: RESUELTO.** Por decisión del humano,
   `CATALOG_PROMPT` y `FORMULA_PROMPT` se declaran con **texto ficticio** en el `webServer.env` de
   `playwright.config.ts`, con el motivo escrito allí: la IA está doblada, así que ese texto no se
   usa jamás; sólo evita que leer el prompt lance antes de llegar al adaptador. Se descartó doblar
   el puerto del prompt como cuarto adaptador y se descartó enmendar el diseño.

3. **El defecto del búfer detachado: ARREGLADO (T19, R24).** `countPages` entregaba el
   `Uint8Array` a pdf.js sin copiarlo y la librería **detachaba** el `ArrayBuffer`, dejando el
   arreglo del llamante en `length === 0`; `process-pdf-by-strategy` contaba y **después** pasaba
   ese mismo arreglo a la lectura con IA, cuyo esquema exige `bytes.length > 0`. El adaptador
   entrega ahora una copia a la librería en **las tres** funciones —`countPages`, `extractPdfText`
   y `renderPages`—, que es lo que fija `design.md > 12.1`: arreglar una y dejar dos habría dejado
   la trampa armada. **Sólo se tocó `pdf-converter-unpdf.ts`**; ni `domain/`, ni `ports/`, ni el
   esquema de entrada.

   Los tests afirman la **garantía observable**, no la copia: ninguno menciona `new Uint8Array` ni
   el detach, así que si mañana la librería dejara de detachar y la copia se quitara, seguirían
   siendo correctos. Se comprobó además que **muerden**: degradando el ayudante a devolver el
   arreglo tal cual caen exactamente los cuatro casos nuevos del conversor y el del procesamiento,
   este último con el `invalid_input` que describe el spec.

4. **T15 / R20 — CERRADA. El recorrido pasa en los dos navegadores.** El segundo hallazgo del
   mismo E2E era que el rasterizado no encontraba su binario nativo **dentro del servidor de
   Next**: `renderPages` falla y, como `catalogo` se lee en modo imagen, los tres archivos morían
   en `error` con `unexpected` y un motivo que nombraba la causa. Se leyó literal de
   `document_files` durante una corrida, y se descartó «falta el paquete» ejecutando el mismo
   tramo **fuera** de Next, donde devolvía el texto completo.

   Lo arregló **T20 (R25)**: `next.config.ts` declara el par nativo como **externo del servidor**,
   así que Next deja de empaquetarlo y su binario se resuelve en ejecución. **No se tocó el
   adaptador**: `resolveRasterizer` y su mensaje siguen siendo correctos el día que el par falte
   de verdad.

   Resultado real, tras el arreglo:

   ```
   ✓ 1 [chromium] › documentos › sube tres PDFs y ve cambiar el estado de cada uno hasta terminar (R20) (11.9s)
   ✓ 2 [webkit]   › documentos › sube tres PDFs y ve cambiar el estado de cada uno hasta terminar (R20) (11.5s)
     2 passed (21.8s)
   ```

   Y las seis líneas del registro por estrategia —tres archivos por cada navegador— pasaron de
   `longitud=0` a **`paginas=1 longitud=53`**: la lectura entrega el texto completo. **R20 queda
   cerrado.**

5. **T17 — el gate completo y el PR.** Son del leader. No se abrió ningún PR.

## Decisiones que conviene que el reviewer mire

- Los nombres de los casos van **sin acentos**, como el resto de `tests/` del repo; `tasks.md` los
  cita con tilde. El `R<n>`, que es lo que hace la trazabilidad, está intacto en todos.
- Un error de fila sin código de error cae en `errorMessage(UNEXPECTED_ERROR_CODE)`. El tipo lo
  permite y el spec no lo fija; se eligió eso antes que escribir un literal de mensaje a mano.
- El caso de la tanda desconocida se etiquetó `(R8)` y no encajaba limpio en ningún requisito. El
  spec se enmendó con **R23** y T18 lo reetiquetó: el caso del hook y los dos del componente citan
  ya `(R23)`. **No cambió ninguna línea de producción.**
- El disparador de selección es un `<label>` con `buttonVariants`, no un `<Button asChild>`: la
  primitiva de este repo es de Base UI y no acepta `asChild`.
- Entró un cuarto archivo no listado en T13, `adapters/driven/config/e2e-doubles-env.ts`, porque
  `lib/composition/index.ts` no lee `process.env` ni una sola vez en todo el repo y meter uno ahí
  habría roto esa convención.

## Deuda que esta ficha NO cierra, y tiene destinatario

**Si el par nativo de rasterizado sobrevive al runtime de Vercel sigue siendo DESCONOCIDO.**

T20 resuelve el **empaquetado bajo Next**, que es lo que rompía aquí y ahora —en local y en el
gate—: el paquete deja de empaquetarse y su binario se resuelve en ejecución. **Eso, y sólo eso.**
Que además cargue en el runtime de Vercel **no está verificado**, no se puede verificar sin un
despliegue real, y sin red el gate no puede afirmarlo. Por la regla 6 de `CLAUDE.md`, lo no
verificado es un desconocido, no un sí.

**No es un hallazgo nuevo: es la pregunta abierta 3 de QC-106, viva desde el 2026-09-16.** Su
`design.md > 9` se titula literalmente «¿`@napi-rs/canvas` corre en el runtime de Vercel?», y
`docs/dependencias.md` registró la respuesta como **DESCONOCIDO**, con el compromiso escrito de
cerrarla **antes** de que QC-111 lo consumiera. QC-111 lo consumió. La pregunta siguió abierta.
QC-111 la volvió a anotar como hallazgo no bloqueante y la difirió. **Cinco fichas después, la
primera ejecución real la encontró** — y costó esta tarde entera de diagnóstico.

Se anota aquí, entonces, con su destinatario y sin disfrazarla de resuelta: **sigue abierta, y ahora
con un consumidor en producción**. Sólo un despliegue real puede responderla.

**Qué pasa si el runtime de Vercel tampoco lo carga**, dicho para que no sea una sorpresa silenciosa:
cae la estrategia `catalogo` **en ejecución**, con su fila en error y un motivo que nombra la causa,
por el camino que QC-111 ya dejó montado. Es feo y es **visible**, que es lo que se pedía.

## F2.3 — integración con `dev`, y los dos tests de R25

`dev` avanzó **15 commits** mientras esta ficha estaba en vuelo, y uno de ellos hace lo mismo que
T20: **`d3e13aaf`, `fix(QC-136)`, mergeado por el PR #101 el 2026-09-21**, que ya declaraba el par
nativo en `serverExternalPackages`. Nuestro arreglo es correcto y **llegó segundo**. Conviene
decirlo sin adornos: el diagnóstico se pagó dos veces porque nadie miró `dev` antes de la tercera
enmienda.

**`next.config.ts`: gana `dev`, tal cual.** Su comentario es mejor que el nuestro y explica cosas
que el nuestro no decía: que Turbopack no puede meter un `.node` en un chunk ESM —no tiene module
id—, que `await import()` **no basta** porque un especificador literal sigue siendo analizable, y
trae la medición (`next build` sale con exit 1 sin la línea, exit 0 con ella). No se mezcló ni se
reescribió.

**Los dos tests se quedan, y no es por cortesía: NO se solapan.** Comprobado ejecutando, no
razonando: se inyectó en el adaptador un **segundo** paquete nativo con `import()` diferido y sin
declarar como externo.

| Test | Qué prueba | Con un segundo nativo sin declarar |
| --- | --- | --- |
| `canvas-no-empaquetado.test.ts` (QC-136) | que **ese** paquete, nombrado, está declarado externo — anclado al nombre, con la medición de `next build` detrás | **verde**: no lo ve |
| `next-config-externos.test.ts` (esta ficha) | que **todo** paquete que el adaptador carga en diferido está declarado externo — lo **deriva** del adaptador y no lo nombra | **rojo**, que es lo correcto |

El de QC-136 ancla el invariante al paquete que hoy rompe el build; el nuestro lo ancla a la
**propiedad** —lo que se carga en ejecución tiene que estar fuera del empaquetado—, así que caza la
regresión del día que entre otro nativo, que es exactamente la clase de fallo de la que nació
QC-136. Borrar el de QC-136 no era opción: es trabajo ajeno.

**`feature_list.json`** se reconcilió por unión: entran las **nueve** fichas que traía `dev`
(QC-132…QC-136, QC-138…QC-141), se conserva **QC-142**, que sólo existía aquí, y la descripción de
QC-107 se queda con la nuestra, que es la del afinado y ya dice que el montaje en fórmulas salió a
QC-142. `scripts/validate-features.mjs` en verde con 129 fichas.

**Otros dos conflictos, y ninguno trivial de más:** `tests/unit/composition/documentos-facade.test.ts`
—`dev` quitó ahí las aserciones sobre las cuatro variables de entorno, que es el rojo que esta ficha
había diagnosticado como de entorno; se conserva **su** explicación y **nuestros** dos dobles de la
bifurcación— y `progress/current.md`, donde `dev` ya retiró las filas de QC-111 y QC-123 y sólo
sobrevive la de QC-107. **Ninguna migración** que aplicar.

Los dos renombrados de interfaz que venían en `dev` —«Producción» → «Fórmulas» y «Usuarios» a
«Operación»— **no tocan nada de esta ficha**: se comprobó que ni el E2E ni los tests del componente
nombran esas etiquetas, y la constante de ruta de fórmulas no cambió.
