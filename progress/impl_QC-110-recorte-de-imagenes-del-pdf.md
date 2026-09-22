# QC-110 — recorte-de-imagenes-del-pdf · bitacora de implementacion

> Rama `feature/QC-110-recorte-de-imagenes-del-pdf`, worktree
> `.worktrees/QC-110-recorte-de-imagenes-del-pdf`. Spec aprobado por el humano (F1.4) el
> 2026-09-21. Fuente de verdad: `specs/QC-110-recorte-de-imagenes-del-pdf/`.

## T0 — Lo que se HEREDA montado y NO se vuelve a crear

Leido y dado por existente, sin reimplementar nada de esto:

| Pieza | Donde | Que aporta a esta ficha |
| --- | --- | --- |
| `PdfConverter` (`countPages`, `extractText`, `renderPages`) | `lib/modules/documentos/ports/pdf-converter.ts` | contar paginas y rasterizarlas (pasos 1 y 2 del caso de uso) |
| `AiReader` (`read`) | `lib/modules/documentos/ports/ai-reader.ts` | pedir las coordenadas con partes `image` y un prompt |
| `DocumentStorage` (4 operaciones) | `lib/modules/documentos/ports/document-storage.ts` | el bucket de los PDF; **no se toca** |
| `domain/limits.ts` | `MAX_PDF_PAGES`, `PAGE_RENDER_DPI`, `AI_READ_TIMEOUT_SECONDS`, `MILLISECONDS_PER_SECOND` | todo numero que use esta ficha sale de aqui |
| `domain/document-path.ts` | `buildDocumentPath`, `isPathInCompany` | unico dueno del formato de rutas; gana `buildCropPath` |
| `domain/failure-kind.ts` | `failureKind`, `STORAGE_FAILURE_KIND` | clasifica reintentable/definitivo; **no cambia** |
| `domain/run-document-job.ts` | el trabajo que entrega la cola | gana la dependencia y el enganche condicional |
| `domain/read-pdf-with-ai.ts` | `raceAgainstTimeout`, `TimeoutRunner` | el corredor de plazo se **exporta**, no se reimplementa |
| `lib/composition/index.ts` | unico sitio que ata puerto -> adaptador | cablea los dos puertos nuevos |

**Declaracion exigida por T0:** esta ficha **NO toca el contrato de `AiReader`** (R3: la respuesta
sigue llegando como texto plano, tal cual, y quien la interpreta es esta ficha) **ni el de
`DocumentStorage`** (R13: conserva exactamente sus cuatro operaciones; los PNG del recorte van por
un puerto nuevo y propio, `CropStorage`, con una sola operacion).

## Estado de las tasks

Todas las tasks de **T0 a T16** estan cerradas y marcadas `[x]` en
`specs/QC-110-recorte-de-imagenes-del-pdf/tasks.md`. **T17 (gate completo) NO lo corre el
implementer**: es del leader, y con el va la apertura del PR.

## Archivos creados

### Produccion

| Archivo | Que es |
| --- | --- |
| `lib/modules/documentos/ports/image-cropper.ts` | Puerto `ImageCropper` + `CropRegion` (proporcion 0..1) |
| `lib/modules/documentos/ports/crop-storage.ts` | Puerto `CropStorage`, **una sola operacion** (`upload`) |
| `lib/modules/documentos/domain/crop-region.ts` | `cropRegionSchema`, `cropCoordinatesSchema`, `clampRegionToPage` |
| `lib/modules/documentos/domain/crop-coordinates.ts` | `extractCropCoordinates(text, path)`; lanza `ValidationError` (`invalid_input`) |
| `lib/modules/documentos/domain/crop-prompt.ts` | `CROP_COORDINATES_PROMPT`, provisional y funcional |
| `lib/modules/documentos/domain/crop-catalog-images.ts` | `createCropCatalogImages` — los siete pasos |
| `lib/modules/documentos/adapters/driven/image/image-cropper-sharp.ts` | `cropImage` — **unico archivo del repo que importa `sharp`** |
| `lib/modules/documentos/adapters/driven/storage/crop-storage-supabase.ts` | `uploadCrop` contra el bucket de recortes |
| `lib/modules/documentos/adapters/driven/config/crop-storage-config-env.ts` | `readCropStorageConfigFromEnv`, leida en la invocacion |

### Tests

Bajo `tests/unit/documentos/`: `crop-region.test.ts`, `crop-coordinates.test.ts`,
`crop-path.test.ts`, `crop-prompt.test.ts`, `ports-shape.test.ts`, `image-cropper-sharp.test.ts`,
`crop-storage-config.test.ts`, `crop-catalog-images.test.ts`, `qc110-alcance.test.ts`.

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `lib/modules/documentos/domain/document-path.ts` | Gana `buildCropPath`; sigue siendo el unico dueno del formato de rutas |
| `lib/modules/documentos/domain/read-pdf-with-ai.ts` | **Solo** se exporta `raceAgainstTimeout`: el plazo no se reimplementa |
| `lib/modules/documentos/domain/run-document-job.ts` | `cropCatalogImages` en las deps; enganche condicional antes del `finish`; cabecera reescrita (la frase «Sin recorte de imagenes…» dejo de ser cierta) |
| `lib/modules/documentos/index.ts` | Reexporta `createCropCatalogImages` y sus tipos, **solo desde `./domain`** |
| `lib/composition/index.ts` | Cablea `ImageCropper` -> `cropImage` y `CropStorage` -> `uploadCrop`, construye el caso de uso y se lo pasa a `runDocumentJob`. Sin invocar nada y sin leer entorno |
| `next.config.ts` | `serverExternalPackages: ['@napi-rs/canvas', 'sharp']` |
| `package.json` | `sharp@^0.35.4` declarada |
| `docs/dependencias.md` | La fila `aprobada` de `sharp` la escribio el leader en `c6947e6e`; aqui solo se corrigio la version realmente instalada |
| `.env.example` | Bloque nuevo `SUPABASE_CROPS_BUCKET=`, declarada y **vacia** |
| `tests/unit/documentos/canvas-no-empaquetado.test.ts` | Exige **los dos** paquetes, cada uno con su control positivo |
| `tests/unit/documentos/qc111-alcance.test.ts` | Enmienda del bloque R12 (detalle mas abajo) |
| `tests/unit/documentos/run-document-job.test.ts` | Sus dobles ganan la dependencia nueva, mas tres casos |
| `tests/unit/documentos/document-job-route.test.ts` | Tambien construye `createRunDocumentJob`: sus dobles ganan la dependencia |
| `tests/unit/documentos/module-contract.test.ts` | Cuatro casos R21 del simbolo nuevo |
| `tests/guards/guard-identificador-de-request.test.ts` | `DEPENDENCIAS_ESPERADAS` de 35 a 36 (motivo en «Decisiones») |
| `tests/unit/documentos/storage-config.test.ts` | Enmienda del bloque R26: de dos importadores permitidos a **tres** (segunda vuelta, B1) |

## Mapa `R<n> -> test`

| R | Archivo | Caso |
| --- | --- | --- |
| R1 | `run-document-job.test.ts` | `R1 — con formula el doble del recorte NO se invoca; con catalogo SI` |
| R2 | `crop-catalog-images.test.ts` | `R2 — renderPages recibe PAGE_RENDER_DPI; mas de MAX_PDF_PAGES es invalid_input SIN haber renderizado` · `R2 — con un PDF dentro del tope, renderPages se llama con la resolucion unica del modulo` |
| R3 | `crop-catalog-images.test.ts` | `R3 — la IA recibe partes image y el prompt del recorte, y devuelve texto plano` |
| R4 | `crop-region.test.ts` | `R4 — una region dentro de la pagina se acepta` · `R4 — page en 0 o decimal se rechaza` |
| R4 | `crop-coordinates.test.ts` | `R4 — un JSON valido, sin nada alrededor, se extrae y valida` · `R4 — con PROSA alrededor del JSON, se extrae igual` · `R4 — con VALLA de codigo json, se extrae igual` · `R4 — cero regiones tambien se extrae y valida` |
| R5 | `crop-coordinates.test.ts` | `R5 — sin JSON -> ValidationError con codigo invalid_input` · `R5 — JSON roto -> ...` · `R5 — JSON que no encaja con el esquema -> ...` · `R5 — JSON sin la clave images -> ...` · `R5 — el motivo dice que fallo y sobre que ruta, y NO contiene el texto entero de entrada` |
| R5 | `crop-catalog-images.test.ts` | `R5 — texto sin JSON interpretable deja invalid_input y CERO subidas` · `R5 — un plazo agotado en la lectura de coordenadas es ai_unavailable, no invalid_input` |
| R5 | `run-document-job.test.ts` | `R5 — un fallo del paso de recorte deja error/requeue y NO borra el PDF` |
| R6 | `crop-region.test.ts` | `R6 — los bordes 0 y 1 son validos para x/y, y un ancho o alto de 1 tambien` · `R6 — x, y, width o height fuera de [0,1] se rechazan` · `R6 — un ancho o alto de cero se rechaza: tienen que ser ESTRICTAMENTE mayores que cero` · `R6 — un valor no numerico o no finito se rechaza` |
| R7 | `crop-region.test.ts` | `R7 — desbordada por la DERECHA: el ancho se recorta hasta el borde, x no se mueve` · `R7 — desbordada por ABAJO: el alto se recorta hasta el borde, y no se mueve` · `R7 — desbordada por la IZQUIERDA: x se lleva a 0` · `R7 — desbordada por ARRIBA: y se lleva a 0` · `R7 — una region que queda con ancho o alto CERO tras el ajuste no se rechaza aqui` |
| R7 | `crop-catalog-images.test.ts` | `R7 — una region desbordada se ajusta al borde y SIGUE recortandose` |
| R8 | `image-cropper-sharp.test.ts` | `R8 — recorta y el resultado tiene el tamano esperado en pixeles, con redondeo` · `R8 — una region que por redondeo se pasaria del borde se recorta a los limites reales` · `R8 — una region minuscula da al menos 1x1 y no lanza` · `R8 — un input que no es un PNG hace que el error nombre la operacion que fallo` |
| R8 | `qc110-alcance.test.ts` | `R8: en todo lib/, app/, components/, hooks/, scripts/ y db/, sharp se importa en un unico archivo` · `R8: domain/ y ports/ del modulo documentos no nombran sharp` · `R8: el cableado puerto -> adaptador de la imagen solo aparece en lib/composition`, mas sus dos controles positivos |
| R9 | `qc110-alcance.test.ts` | `R9: la unica dependencia nueva respecto de dev es sharp` · `R9: docs/dependencias.md trae la fila de sharp aprobada` · `R9: el detector de dependencias nuevas muerde con una tercera y no con un cambio de version` |
| R10 | `canvas-no-empaquetado.test.ts` | `R10 — incluye el rasterizador, sin el cual next build no termina` · `R10 — y la comprobacion MUERDE ante una lista a la que le falta el rasterizador` · `R10 — incluye el recortador, tan binario nativo como el rasterizador` · `R10 — y la comprobacion MUERDE ante una lista a la que le falta el recortador` |
| R11 | `canvas-no-empaquetado.test.ts` | `R11 — el rasterizador SIGUE siendo quien carga el par nativo de rasterizado` · `R11 — y la comprobacion MUERDE ante un archivo que no lo cite` |
| R12 | `crop-path.test.ts` | `R12 — la forma exacta es <empresa>/<id del archivo>/<pagina>-<n>.png` · `R12 — <n> empieza en 1 y numera dentro de su pagina` · `R12 — isPathInCompany es cierto para la empresa del archivo y falso para otra` |
| R13 | `ports-shape.test.ts` | `R13 — DocumentStorage conserva EXACTAMENTE sus cuatro operaciones` · `R13 — CropStorage declara UNA sola operacion` · control positivo: `el detector cuenta las operaciones de una interfaz inventada, incluida una infractora` |
| R14 | `crop-storage-config.test.ts` | `R14 — importar el adaptador con las tres variables vacias no lanza` · `R14 — falta SUPABASE_CROPS_BUCKET: el error la nombra y no filtra ningun valor` · `R14 — con las tres presentes devuelve las tres` |
| R15 | `qc110-alcance.test.ts` | `R15/R20: el diff contra dev no trae ningun archivo bajo db/` · `R15/R20: db/schema.prisma en la rama es identico al de la base de fusion`, mas su control positivo |
| R15 | `qc111-alcance.test.ts` | `R12: db/schema.prisma no declara ninguna columna de salida para el recorte` (conservado de la ficha anterior: sigue vivo y es exactamente lo que R15 pide) |
| R16 | `crop-catalog-images.test.ts` | `R16 — {"images": []} termina bien con cero subidas` |
| R16 | `run-document-job.test.ts` | `R16 — cero recortes deja la fila en listo y borra el PDF` |
| R17 | `crop-catalog-images.test.ts` | `R17 — tres regiones, la segunda revienta al recortar: la primera y la tercera se suben, skipped: 1` · `R17 — una region que apunta a una pagina inexistente se salta sin abortar las demas` · `R17 — la region que revienta al recortar deja su causa en el registro, y las otras dos se suben igual` |
| R17 | `run-document-job.test.ts` | `R17 — una region perdida (skipped > 0) igual deja la fila en listo y borra el PDF` |
| R18 | `crop-prompt.test.ts` | `R18 — el texto no esta vacio ni en blanco` · `R18 — la cabecera del archivo declara que el texto es provisional` |
| R19 | `qc110-alcance.test.ts` | `R19: ningun archivo .ts nuevo bajo lib/modules/documentos nombra un simbolo de sesion`, mas su control positivo |
| R20 | `qc110-alcance.test.ts` | `R15/R20: el diff contra dev no trae ningun archivo bajo db/` · `R15/R20: el detector de migraciones nuevas muerde con una carpeta bajo db/migrations/ y no con un archivo ajeno` |
| R21 | `module-contract.test.ts` | `R21 — el barril publica la factory del recorte` · `R21 — el cierre real del barril no arrastra sharp ni el SDK del almacenamiento` · `R21 — el puerto ImageCropper, el puerto CropStorage y sus adaptadores NO salen por el contrato publico` · `R21 — la regla MUERDE si alguien cuelga el adaptador de sharp del barril, aunque el archivo no exista todavia`. Ademas `tests/guards/guard-arquitectura-modulos.test.ts`, verde |
| R22 | `qc110-alcance.test.ts` | `R22: ningun archivo .test.ts nuevo bajo tests/unit/documentos invoca la red ni importa sharp fuera de su adaptador`, mas su control positivo |
| R23 | `qc110-alcance.test.ts` | `R23: el diff de la rama no trae ningun .spec.ts nuevo bajo e2e/`, mas su control positivo |

Los 23 requisitos tienen al menos un caso concreto, que existe y se llama asi.

## La enmienda de la guardia ajena (T13)

`tests/unit/documentos/qc111-alcance.test.ts`, bloque «R12 — SIN RECORTE DE IMAGENES». Antes de
tocarlo se midio el rojo: **1 caso rojo, 32 verdes, 2 saltados**, exactamente el que
`design.md > 0.1` predijo.

- **Quitados**, porque su ausencia dejo de ser cierta el dia que el paso existio:
  `R12: ningun nombre de archivo bajo ports/ del modulo nombra el recorte` y
  `R12: run-document-job.ts no nombra el recorte de imagenes fuera de un comentario`.
- **Conservados**, porque siguen vivos:
  `R12: db/schema.prisma no declara ninguna columna de salida para el recorte` y
  `R12: el detector muerde con cada palabra de recorte y no con un texto ajeno`.
  El detector `nombraRecorte` y la lista `PALABRAS_DE_RECORTE` no se tocaron.
- **Anadido**: `R12: el detector sigue mordiendo ahora que el recorte existe: los dos puertos nuevos
  lo nombran`. El detector no se desactivo: cambio de signo.
- **No** se desactivo nada con `skip`, **no** se borro el archivo y **no** entro en
  `tests/baseline-rojos.json`. Ningun otro bloque del archivo se toco.

## Salida real de la verificacion

`./init.sh --rapido` desde el worktree:

```
✓ base de desarrollo «QuimiCloude» al dia: 38 migracion(es) aplicada(s)
✓ typecheck paso
✓ lint paso
[test:rapido] el diff vs origin/dev no toca codigo con tests: nada que relacionar.
[test:rapido] todas las guardias -> vitest run guard --passWithNoTests
 Test Files  47 passed (47)
      Tests  588 passed | 9 skipped (597)
✓ test:rapido paso
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

**Ojo con la linea «nada que relacionar».** El selector por diff de `scripts/test-rapido.mjs`
compara `origin/dev...HEAD`, o sea **solo commits**, y esta tanda esta **sin commitear**: por eso no
selecciono ningun archivo y el modo rapido corrio unicamente las guardias. La seleccion por grafo se
corrio entonces a mano, sobre los quince archivos de produccion tocados:

```
pnpm exec vitest related --run <los 15 archivos de produccion de la ficha>
 Test Files  166 passed (166)
      Tests  2483 passed | 1 skipped (2484)
   Duration  326.03s
```

Y los quince archivos de test de la ficha, juntos:

```
 Test Files  15 passed (15)
      Tests  146 passed | 2 skipped (148)
```

`tests/unit/composition/documentos-facade.test.ts` salio **verde**: la deuda ajena de QC-134 no se
manifesto y no hizo falta tocar el `.env` del worktree.

---

# Segunda vuelta — correcciones del rechazo del reviewer

El `reviewer` **rechazo** la ficha; su informe esta en `progress/review_QC-110.md`. Esta vuelta
aplica el bloqueante y cuatro de los cinco menores, sobre el tip `41e13631`.

## B1 (BLOQUEANTE) — la guardia `R26` de `storage-config.test.ts`, enmendada

El gate **completo** salia rojo y el rojo era de esta ficha:
`tests/unit/documentos/storage-config.test.ts`, bloque «la libreria de Storage sigue aislada (R26)»,
exigia **exactamente dos** importadores de `@supabase/storage-js` y `crop-storage-supabase.ts` es el
**tercero**.

**Decision del humano: se enmienda a tres, con su motivo.** Aplicado asi:

- `IMPORTADORES_PERMITIDOS` pasa de dos a **tres**, en orden alfabetico porque la afirmacion compara
  contra la lista ya ordenada: `crop-storage-supabase.ts`, `document-storage-supabase.ts`,
  `recipe-image-supabase.ts`.
- El caso se renombra a `R26 — exactamente TRES archivos de produccion importan la libreria, y este
  modulo aporta el tercero`.
- La cabecera del `const` explica **por que son tres**: tres buckets, tres adaptadores —recetas, los
  PDF y el **propio de los recortes**, que nace nuevo y propio por `[D11]` y `[D17]`—.
- **Conservados intactos** el control positivo (`R26 — el detector dispara…`), el centinela
  anti-vacuidad (`R26 — el barrido recorre de verdad el arbol de produccion`) y el caso `R31`.
- **Ni `skip`, ni borrado, ni `tests/baseline-rojos.json`.** Mismo criterio con el que esta ficha ya
  enmendo la guardia R12 de QC-111 y el conteo `DEPENDENCIAS_ESPERADAS` de 35 a 36.

**Por que `--rapido` no lo vio, que es lo que conviene recordar:** el selector por diff de
`scripts/test-rapido.mjs` mira `origin/dev...HEAD`, o sea **solo commits**, y la tanda estaba sin
commitear; y `vitest related` **tampoco** lo habria cazado, porque esa guardia **lee del disco** en
vez de importar lo que vigila, asi que ningun grafo de imports la selecciona. Solo la ve el gate
completo, o `vitest run guard` — y `storage-config.test.ts` no lleva `guard` en el nombre.

## Menores corregidos

1. **Un test mentia sobre lo que prueba.** En `run-document-job.test.ts`, el caso etiquetado `R17`
   inyectaba el **paso entero** fallido (`{ ok: false, code: 'invalid_input' }`), que es **R5**.
   - Renombrado a `R5 — un fallo del paso de recorte deja error/requeue y NO borra el PDF`, con el
     cuerpo intacto.
   - **Anadido el caso que faltaba para R17**: `R17 — una region perdida (skipped > 0) igual deja la
     fila en listo y borra el PDF`, que inyecta `{ ok: true, uploaded: 2, skipped: 1 }` y afirma
     `{ kind: 'done' }`, el `finish` en «listo» y el `remove` del PDF. El unico caso de exito que
     habia usaba `skipped: 0`.
2. **Etiquetas `R10`/`R11` descruzadas** en `canvas-no-empaquetado.test.ts`. Ahora **R10** son los
   cuatro casos de que `serverExternalPackages` exige **los dos** paquetes (con sus dos controles
   positivos) y **R11** los dos de que el canvas **sigue** siendo quien rasteriza en
   `pdf-converter-unpdf.ts`. Ningun cuerpo se toco: solo la etiqueta estaba al reves.
3. **Cabeceras recortadas** a ~5 lineas (`docs/conventions.md > Comentarios`), sin perder ningun
   porque verificado: `crop-storage-config-env.ts` 15 -> 5, `crop-catalog-images.ts` 16 -> 8,
   `crop-storage-supabase.ts` 14 -> 6, `image-cropper-sharp.ts` 9 -> 6, y el bloque nuevo de
   `lib/composition/index.ts` (solo ese bloque). Siguen dichos: la configuracion resuelta en cada
   llamada y por que, el puerto hablando en proporciones, el minimo de 1 pixel como **tecnico y no
   umbral de negocio**, y el segundo render aceptado a sabiendas.
4. **Comentario factualmente falso corregido** en `next.config.ts`. Decia «que el adaptador ya
   **los** cargue con `await import()` NO basta», en plural, y es falso: `image-cropper-sharp.ts`
   hace `import sharp from 'sharp'`, **estatico**. Verificado abriendo el archivo. Ahora la frase
   dice que el argumento del `await import()` vale para el canvas —cuyo adaptador si lo usa— y que
   `sharp` ni siquiera entra por ahi, asi que su entrada en la lista es la unica defensa que tiene.

## Lo que NO se toco en esta vuelta

- **El hueco de registro** (`catch { skipped += 1 }` sin rastro, `menor 3` del informe). El reviewer
  lo confirmo y **no vuelve al implementer**: espera decision del humano entre anadir un puerto de
  registro a las deps del caso de uso o corregir el paso 6 de `design.md > 4`, que hoy se contradice
  con su propia tabla de `Deps`.
- **T17** sigue sin marcar: es del leader.

## Gate COMPLETO — verde

`./init.sh` (sin flags) desde el worktree:

```
 Test Files  591 passed (591)
      Tests  8427 passed | 111 skipped (8538)
   Duration  283.42s
✓ los tres proyectos corrieron (ui, node, integration)
✓ tests: sin rojos nuevos (0 rojos, todos en el baseline de 6); 6 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

Typecheck y lint pasaron —el gate aborta en el primer paso que falle y llego a `== init OK ==`—.
**Cero rojos**, incluidos los seis del baseline.

**Aviso del gate que le toca al leader, no a esta ficha:** «6 archivo(s) del baseline ya pasan; toca
limpiarlos» — `product-crud.int.test.ts`, `configuracion-convenciones.test.ts`,
`unidades-convenciones.test.ts`, `recipe-route-contract.test.ts`, `recetas/module-contract.test.ts` y
`unidades/modulo-intacto.test.ts`. Es deuda ajena y es un aviso, no un rojo.

---

# Tercera vuelta — el hueco de registro, cerrado por arriba

**Decision del humano:** se **anade** el puerto de registro, no se rebaja el diseno. Con esto, el
paso 6 de `design.md > 4` —«la causa se registra por el mismo canal que el resto del modulo»— pasa
a ser cierto en el codigo.

## ¿Encajaba el canal que ya existia? **No, y este es el motivo**

Lo primero fue mirar `StrategyRunLog`, que es el canal de registro que el modulo ya tiene cableado
en `lib/composition/index.ts`. **No encaja**, y no por gusto: su `StrategyRunSummary` es
`{ strategy, mode, path, pages, textLength }`, y de esos cinco campos **tres no existen** en una
region de recorte. `strategy` y `mode` son conceptos del procesamiento por estrategia, no del
recorte; `textLength` y `pages` no significan nada para un rectangulo que no se pudo recortar.
Meter una region en ese molde obligaria a **inventar** un `PdfStrategy` o a fingir un `null` solo
para rellenar huecos, que es exactamente la clase de dato falso que un registro no debe llevar.

Asi que se uso **lo minimo que sirve**, y **calcado al patron del vecino** —que es lo que «el mismo
canal» significa en la practica—: mismo sitio (`ports/` + `adapters/driven/observability/`), mismo
prefijo fijo localizable, y el mismo `escribir` inyectable con `console.log` por defecto para que un
test lo espie **sin parchear la consola global**.

## Lo que entro

| Archivo | Que es |
| --- | --- |
| `lib/modules/documentos/ports/crop-region-log.ts` | **Nuevo.** `CropRegionLog` con una sola operacion, `skip(summary)`, y `CropRegionSkipSummary = { path, page, index, cause }` |
| `lib/modules/documentos/adapters/driven/observability/crop-region-log-console.ts` | **Nuevo.** `createCropRegionLogConsole(escribir = console.log)`, linea `[crop-catalog-images] ruta='…' pagina=… indice=… causa=…` |
| `lib/modules/documentos/domain/crop-catalog-images.ts` | `CropCatalogImagesDeps` gana `readonly log: CropRegionLog`, **requerida** —igual que `log` en `ProcessPdfByStrategyDeps`—: opcional significaria que alguien puede cablear el caso de uso sin registro y volver al agujero de hoy |
| `lib/composition/index.ts` | Cablea `createCropRegionLogConsole()` y se lo pasa al caso de uso. Se **referencia**, no se invoca: construir la fachada no escribe nada |
| `tests/unit/documentos/crop-catalog-images.test.ts` | `dobleDeRegistro()` que espia `skip`; los ocho `createCropCatalogImages` ganan el doble; un caso nuevo |
| `tests/unit/documentos/qc111-alcance.test.ts` | El caso enmendado esperaba **dos** puertos con nombre de recorte; ahora son **tres** (ver «El rojo que me hice») |
| `specs/QC-110-recorte-de-imagenes-del-pdf/design.md` | **Unico cambio del spec:** la tabla `CropCatalogImagesDeps` de §4 gana `log` |
| `next.config.ts` | Cabecera recortada de 18 a 6 lineas |

**Las tres regiones que se saltan dejan rastro ahora, no solo la que revienta:** la que apunta a una
**pagina inexistente**, la que queda **sin area tras el ajuste al borde**, y la que **falla al
recortar o al subir**. Cada una con su causa propia. **Nada mas del comportamiento cambia**: sigue
devolviendo `{ ok: true, uploaded, skipped }` y una region perdida sigue sin tumbar el archivo.

**Lo que NO se registra**, por el mismo criterio con el que `StrategyRunLog` prohibe el texto de la
IA: ni el texto del modelo ni los bytes. Solo la ruta, la pagina, el indice y la causa.

Caso de test nuevo (con doble, sin consola real):
`R17 — la region que revienta al recortar deja su causa en el registro, y las otras dos se suben igual`,
que afirma que `skip` se llamo **una** vez con esa region concreta y su causa, y que las otras dos
**igual** se subieron (`uploaded: 2, skipped: 1`, `ok: true`). El caso de la pagina inexistente
tambien gana su asercion de registro.

## El `design.md`, corregido por arriba

La tabla de `Deps` de §4 gana `readonly log: CropRegionLog;` y la seccion lleva ahora esta linea:

> Tabla corregida el 2026-09-21 por decisión humana tras el rechazo del reviewer: faltaba `log`, que
> el paso 6 ya exigía.

Es **lo unico** que se toco del spec. `requirements.md` y `tasks.md`, intactos.

## Sobre R17: **no queda desfasado — queda por fin cierto**

Conviene decirlo con precision, porque es lo contrario de lo que parecia. R17 dice:
«nada **fuera del registro de ejecucion** dice que se perdieron recortes por el camino». Esa
redaccion **ya presuponia que el registro de ejecucion si lo diria** — y hasta hoy no lo decia,
porque el `catch` era pelado. O sea que el texto del humano estaba bien y **el codigo era el que
iba por detras**. Con el puerto dentro, R17 pasa a describir exactamente lo que ocurre: en pantalla
sigue sin distinguirse un archivo con recortes perdidos de uno limpio, y el rastro vive en el
registro del servidor. **No hace falta reescribir R17**, y no se ha tocado.

## El rojo que me hice, y como lo vi

El primer `./init.sh` completo de esta vuelta salio **rojo, y era mio**:
`tests/unit/documentos/qc111-alcance.test.ts`. El caso que enmende en la vuelta anterior afirma la
lista **exacta** de nombres bajo `ports/` que el detector `nombraRecorte` muerde, y esperaba dos;
`crop-region-log.ts` lleva «crop» en el nombre y es el **tercero**. Corregido a
`['crop-region-log.ts', 'crop-storage.ts', 'image-cropper.ts']`, con el nombre del caso y la
cabecera del bloque al dia. El detector **sigue sin desactivarse**: sigue afirmando que los puertos
del recorte existen y se llaman como se espera.

Es el mismo tipo de guardia de lista exacta que B1, y **solo la ve el gate completo**: es otra
guardia que lee del disco en vez de importar lo que vigila.

## Gate COMPLETO — verde

`./init.sh` (sin flags), segunda corrida de esta vuelta:

```
 Test Files  591 passed (591)
      Tests  8428 passed | 111 skipped (8539)
   Duration  289.08s
✓ los tres proyectos corrieron (ui, node, integration)
✓ tests: sin rojos nuevos (0 rojos, todos en el baseline de 6); 6 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

Sigue el aviso de que los **6 archivos del baseline ya pasan** y toca limpiarlos: deuda ajena, es
aviso y no rojo.

## Las tres preguntas abiertas: **siguen abiertas**

El registro **no** cierra ninguna de las tres. No se anadio ningun umbral minimo de recorte, ni
caducidad, ni tope por PDF; ningun numero nuevo vive fuera de `domain/limits.ts`. Lo unico que
cambia es que ahora **queda rastro** de las regiones que se pierden, que no es lo mismo que
acotarlas.

## Decisiones tomadas durante la implementacion

1. **`extractCropCoordinates` lanza `ValidationError`** en vez de devolver un resultado
   discriminado. Es el patron que ya usa `enqueue-batch.ts` para el mismo `code`, y
   `crop-catalog-images.ts` lo traduce con el mismo `fallo()` que `read-pdf-with-ai.ts`: un solo
   canal de error en vez de dos.
2. **`DEPENDENCIAS_ESPERADAS` de `tests/guards/guard-identificador-de-request.test.ts` sube de 35 a
   36.** Ese conteo es un **absoluto del repositorio**, y su propio comentario dice que «lo rompe
   cualquier feature posterior que anada una legitima» y que el numero «se subio con esa
   aprobacion» — lo hicieron asi `unpdf`, `@napi-rs/canvas`, `@google/genai` y `@upstash/qstash`.
   `sharp` esta aprobada por el humano en F1.4 y tiene su fila, asi que se siguio el precedente
   escrito en la propia guardia y se le anadio su parrafo al comentario. El archivo **no** entro en
   el baseline.
3. **La version instalada de `sharp` es `0.35.4`, no `0.35.3`**, y la fila de `docs/dependencias.md`
   se corrigio en ese unico dato.

## Hallazgos para el leader

1. **`sharp` NO estaba realmente disponible en el arbol.** La decision cerrada `[D2]` dice que «ya
   esta instalada como `optionalDependency` de `next@16.3.0`». En el arbol de trabajo eso **no era
   asi**: `require.resolve('sharp')` fallaba, porque pnpm no eleva las transitivas al
   `node_modules` raiz. Hubo que correr `pnpm add sharp`, que instalo `0.35.4` **y sus binarios
   `@img/*` de plataforma**. La decision `[D2]` **no se reabre** —declararla sigue siendo lo
   correcto y el humano ya la aprobo—, pero su premisa de «no anade peso» no se pudo confirmar
   desde aqui y conviene mirarla antes de darla por cierta en el despliegue.
2. **El doble render se mantiene, como manda `design.md > 0.2`.** Se busco una salida que no tocara
   `AiReadResult` ni `StrategyRunResult` y **no la hay**: las paginas rasterizadas solo viven dentro
   del cierre de `buildImageParts()` en `read-pdf-with-ai.ts` y no salen por ningun canal. Las dos
   unicas vias serian (a) ampliar uno de esos dos contratos publicados, que el diseno prohibe en
   esta ficha, o (b) montar una cache compartida entre `processPdfByStrategy` y `cropCatalogImages`
   dentro de `run-document-job.ts`, que no es «evitarlo sin tocar esos tipos» sino una estructura
   nueva no prevista en `design.md > 7`. Se reporta, no se aplica.
3. **`design.md > 4` paso 6 dice que la causa de una region fallida «se registra por el mismo canal
   que el resto del modulo», pero `CropCatalogImagesDeps` de ese mismo apartado NO trae ningun
   puerto de registro.** La implementacion cuenta el fallo en `skipped` y **no lo registra en
   ningun sitio**: anadir un `StrategyRunLog` a las dependencias habria sido ampliar el diseno por
   cuenta propia. Consecuencia: la «limitacion declarada» de R17 es hoy mas fuerte de lo que su
   texto sugiere — no hay **ningun** rastro de los recortes perdidos, ni siquiera en el registro de
   ejecucion, porque `run-document-job` tampoco mira el `skipped` que devuelve el resultado.
   **Decision del leader.**
4. **Que `sharp` cargue en el runtime de Vercel sigue siendo un DESCONOCIDO.** No se afirma en
   ningun comentario de produccion ni aqui. Lo unico medido es que carga y recorta **en la maquina
   local** (Windows, libvips 8.18.6) y que typecheck, lint y las guardias pasan.
5. **Nadie consume todavia los recortes**, igual que declara el Alcance: el paso corre y sube al
   bucket, y ninguna pantalla los lee.

## Las tres preguntas abiertas: **siguen abiertas**

Ninguna se cerro en la implementacion, y ningun numero nuevo vive fuera de `domain/limits.ts`.

1. **¿Hay tamano minimo para que un recorte valga la pena?** **ABIERTA.** No se implemento ningun
   umbral: una region de 3x3 pixeles se recorta y se sube. Lo unico que hay es el **minimo tecnico
   de 1 pixel** del adaptador, que existe para que la libreria no reviente con un rectangulo vacio
   y **no descarta nada**. No es un umbral de negocio.
2. **¿Los recortes se borran alguna vez?** **ABIERTA.** Nada los borra: no hay poda, ni cron, ni
   limpieza al reprocesar. Un PDF reprocesado **sobrescribe** los recortes de la misma ruta —el
   adaptador sube con `upsert`— y deja **huerfanos** los que la IA ya no identifique.
3. **¿Hay tope de recortes por PDF?** **ABIERTA.** No hay ninguno. Las paginas si lo tienen
   (`MAX_PDF_PAGES = 50`); los recortes no. Un PDF de 50 paginas con veinte regiones cada una son
   mil recortes y mil subidas en un solo trabajo, dentro de una funcion con `maxDuration` acotado.
   El riesgo que la pregunta nombra es real y esta ficha **no lo mitiga**.
