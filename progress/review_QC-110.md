# QC-110 — recorte-de-imagenes-del-pdf · review

> Revisado en el worktree `.worktrees/QC-110-recorte-de-imagenes-del-pdf`, rama
> `feature/QC-110-recorte-de-imagenes-del-pdf`, tip `41e13631`. Diff medido contra
> `origin/dev...HEAD`. El reviewer no edita codigo.

## Veredicto: **RECHAZADO**

Un bloqueante de fondo: **el gate completo sale en ROJO** y el rojo **lo introduce esta ficha**, no
es deuda ajena del baseline. Todo lo demas —los 23 requisitos, las 18 decisiones, la enmienda de la
guardia de QC-111, el aislamiento de `sharp`, las tres preguntas abiertas— esta bien y se detalla
abajo para que la vuelta sea corta.

## Checklist

### Especificacion
- [x] `requirements.md` con R1-R23 en EARS.
- [x] `design.md` con alternativas descartadas y su porque.
- [ ] `tasks.md` con **todas** las tasks `[x]` — **T17 sigue `[ ]`** (gate completo). Coherente con
      el rojo de abajo: no se puede marcar hasta que el gate este verde.

### Trazabilidad
- [x] Cada `R<n>` mapea a al menos un test que **existe, se llama como dice el mapa y su cuerpo
      comprueba el requisito**. Abiertos y leidos uno a uno.
- [x] `progress/impl_QC-110-recorte-de-imagenes-del-pdf.md` trae el mapa `R1..R23 -> test`.

### Calidad de codigo
- [x] `typecheck` pasa (dentro de `./init.sh`).
- [x] `lint` pasa.
- [ ] **`pnpm test` NO pasa**: 1 archivo en rojo, 590 verdes (8425 tests verdes, 1 rojo).
- [x] E2E no aplica: R23 lo difiere con motivo escrito.
- [x] No toca UI: la regla multiplataforma no aplica.
- [x] Dependencia nueva (`sharp`): fila en `docs/dependencias.md` con los cuatro checks y la
      aprobacion humana citada en `design.md > 8`.

### Datos y seguridad
- [x] Ninguna tabla, columna, migracion ni policy nueva (R15): el diff **no toca `db/`**.
- [x] Aislamiento por empresa: no hay fila, asi que **el aislamiento es la ruta**. `buildCropPath`
      empieza por el segmento de empresa, la empresa sale de **la fila del archivo**
      (`claimed.companyId`, nunca del mensaje de la cola) y `crop-path.test.ts` prueba
      `isPathInCompany` cierto para la suya y **falso para otra**.
- [x] Sin secretos: `SUPABASE_CROPS_BUCKET` declarada **vacia**; las tres variables se leen **en la
      invocacion** y el error las nombra sin filtrar valor.
- [x] Sin webhook nuevo; el paso no comprueba permisos por diseno (R19) con guardia de ausencia.

### Modulos hexagonales
- [x] `domain/` y `ports/` no importan `sharp`, ni framework, ni adaptadores.
- [x] El barril reexporta **solo** desde `./domain`; ni puertos ni adaptadores salen por el
      contrato, y `module-contract.test.ts` lo afirma con un control que **muerde**.
- [x] El cableado puerto -> adaptador vive **solo** en `lib/composition`, sin invocar nada y sin
      leer entorno al construir la fachada.

### Verificacion final
- [ ] **`./init.sh` NO termina en verde.**

## Hallazgos

### BLOQUEANTE 1 — el gate completo en rojo por una guardia ajena que esta ficha derogo sin enmendar

`./init.sh` corrido por mi en el worktree (508 s, base de test propia):

```
FAIL |node| tests/unit/documentos/storage-config.test.ts
  > la libreria de Storage sigue aislada (R26)
  > R26 — exactamente DOS archivos de produccion importan la libreria, y este modulo aporta el segundo
AssertionError: expected [ ...(3) ] to deeply equal [ ...(2) ]
+   "lib/modules/documentos/adapters/driven/storage/crop-storage-supabase.ts"
    "lib/modules/documentos/adapters/driven/storage/document-storage-supabase.ts"
    "lib/modules/recetas/adapters/driven/storage/recipe-image-supabase.ts"

Test Files  1 failed | 590 passed (591)
      Tests  1 failed | 8425 passed | 111 skipped (8537)
hay 1 archivo(s) de test en rojo que NO estan en el baseline
```

**No es un rojo del baseline.** Comprobado: `tests/baseline-rojos.json` no lista
`tests/unit/documentos/storage-config.test.ts` (sus seis entradas son de recetas, unidades,
configuracion-ui e inventario). Y **no es deuda ajena**: el tercer importador es el archivo nuevo
de esta ficha, `crop-storage-supabase.ts`.

Por que se colo: el implementer cerro con `./init.sh --rapido` con la tanda **sin commitear**, asi
que el selector por diff no eligio nada y solo corrieron las guardias; la seleccion a mano fue
`vitest related` sobre los quince archivos de produccion, y **`storage-config.test.ts` no es
«related»**: barre el arbol leyendo del disco, no importa el archivo nuevo, asi que el grafo no lo
relaciona. Es exactamente el agujero que la regla 5 de `CLAUDE.md` nombra.

**Que falta para cumplirlo.** Es la **misma especie** que la enmienda de QC-111 que si estaba
prevista (T13), solo que `tasks.md` no vio esta segunda guardia. La afirmacion «exactamente DOS»
dejo de ser cierta el dia que nacio el bucket propio, y ese bucket propio es `[D11]` y `[D17]`,
decisiones cerradas por el humano: el spec **autoriza** el tercer adaptador. La salida es
**enmendar** `tests/unit/documentos/storage-config.test.ts`, no desactivarlo ni meterlo en el
baseline: `IMPORTADORES_PERMITIDOS` pasa a **tres**, la cabecera del bloque explica por que son
tres —tres buckets, tres adaptadores— y el control positivo que ya tiene se conserva. Despues,
`./init.sh` completo en verde y **T17 marcada**.

### BLOQUEANTE 2 — T17 sin marcar en `tasks.md`

`CHECKPOINTS.md > Especificacion` exige **todas** las tasks `[x]`. T17 («gate completo en verde»)
sigue en `[ ]`. Es consecuencia del bloqueante 1 y se cierra con el; se anota aparte porque el
checkpoint es literal.

### menor 1 — un caso etiquetado `R17` que no prueba R17

`tests/unit/documentos/run-document-job.test.ts`:
`it('R17 — un fallo del recorte deja error/requeue y NO borra el PDF')`. El cuerpo inyecta un
recorte que devuelve `{ ok: false, code: 'invalid_input' }` —el **paso entero** fallido por texto
malformado, que es **R5**— y afirma que la fila queda en error. R17 dice lo contrario: **una
region** que falla se salta y el archivo termina en «listo». El nombre promete R17 y el cuerpo
comprueba R5.

No es bloqueante porque **R17 si tiene test que lo prueba de verdad**, en
`crop-catalog-images.test.ts`: «tres regiones, la segunda revienta al recortar» -> `uploaded: 2,
skipped: 1`, `ok: true` y solo dos rutas subidas. Lo que falta es el caso de `run-document-job` con
`{ ok: true, uploaded: 2, skipped: 1 }` que afirme que la fila **igual** queda en «listo»: hoy el
unico caso de exito prueba `skipped: 0`.

### menor 2 — R10 y R11 cruzadas en `canvas-no-empaquetado.test.ts`

R10 es «`sharp` en `serverExternalPackages` y la guardia exige los dos»; R11 es «el canvas sigue
siendo quien rasteriza». En el archivo, `R10 — incluye el rasterizador` y `R11 — incluye el
recortador` estan al reves respecto de esa numeracion. Los **cuatro** casos existen y muerden con
su control positivo, asi que los dos requisitos quedan cubiertos: lo cruzado es la etiqueta.

### menor 3 — el hueco de registro de `design.md > 4` paso 6: **CONFIRMADO**

El paso 6 promete que la causa de una region fallida «se registra por el mismo canal que el resto
del modulo». En `crop-catalog-images.ts` el bucle es un `catch { skipped += 1; }` pelado: sin
puerto de registro, sin mensaje, sin nada. Y `run-document-job.ts` **tampoco mira `skipped`** al
cerrar la fila. Hoy **no queda ningun rastro** de los recortes perdidos, ni siquiera en el registro
de ejecucion — la «limitacion declarada» de R17 dice «nada **fuera del registro de ejecucion**» y
eso, tal como esta, es mas suave de lo que ocurre.

**No lo marco bloqueante, y digo por que:** el propio `design.md > 4` es **contradictorio consigo
mismo** —su tabla `CropCatalogImagesDeps`, tres parrafos mas arriba del paso 6, no trae ningun
puerto de registro—, y el implementer hizo lo correcto al no ampliar las dependencias por su
cuenta. El requisito R17 **si se cumple**. Lo que hay es un hueco de diseno que **pide decision del
leader o del humano**: o se anade un puerto de registro a las deps (con su test), o se corrige el
paso 6 para que diga lo que realmente pasa. Deuda **no** declarada hasta hoy; queda declarada aqui.

### menor 4 — cabeceras largas en archivos nuevos

`docs/conventions.md > Comentarios`: «un bloque de mas de ~5 lineas es senal de que ese porque
pertenece al `design.md`». Superan ese tamano las cabeceras de `crop-storage-config-env.ts` (15
lineas), `crop-catalog-images.ts` (16), `crop-storage-supabase.ts` (14), `image-cropper-sharp.ts`
(9) y el bloque nuevo de `lib/composition/index.ts`. Ninguna cita ficha ni requisito y todas
explican un porque real: es menor de bulto, no de contenido.

### menor 5 — un motivo no verificado en `next.config.ts`

La cabecera reescrita dice «que el adaptador ya **los** cargue con `await import()` NO basta», en
plural. `image-cropper-sharp.ts` importa `sharp` **estaticamente**, no con `await import()`. La
frase era cierta del canvas y se pluralizo sin comprobarla. `docs/conventions.md`: «si el motivo no
esta verificado, no se escribe».

## Lo que pediste comprobar, comprobado

### Comentarios de produccion: **a cero, con mi propio barrido**

Barrido sobre las **lineas anadidas** del diff (`git diff -U0 origin/dev...HEAD -- lib/ app/ db/
components/ scripts/ hooks/ next.config.ts`, filtrando `^+`) con el patron
`QC-[0-9]+|R[0-9]+[^a-zA-Z0-9]|design\.md|decision cerrada`: **cero coincidencias**. Patron
validado contra una linea de control fabricada —`+ // ver QC-110`, `+ // cumple R17 aqui`,
`+ // ver design.md`, `+ // decision cerrada`—: las cuatro las caza. Los nueve archivos nuevos
salen tambien a cero leidos enteros.

Las citas que **si** aparecen en `lib/composition/index.ts` son **preexistentes** y el diff no las
toca: no son hallazgo.

Observacion, no hallazgo: el bloque nuevo de `.env.example` cita «(QC-110)». `.env.example` **no
esta** en la lista de produccion de `docs/conventions.md` y los bloques vecinos del mismo archivo
ya citan QC-106 y QC-108.

### La guardia ajena de QC-111: **enmendada, no desactivada**

- **Conservado** lo que sigue vivo: `R12: db/schema.prisma no declara ninguna columna de salida
  para el recorte` y el control positivo del detector. `nombraRecorte` y `PALABRAS_DE_RECORTE`
  intactos.
- **Quitados** los dos casos que dejaron de ser ciertos, con cabecera que explica que la propia
  QC-111 `[D7]` escribio «QC-110 engancha su paso cuando exista».
- **Anadido** un caso que **muerde de verdad**: lee `ports/` del disco y exige
  `['crop-storage.ts', 'image-cropper.ts']`. Si manana desaparecen los puertos, o cambian de
  nombre, cae. Cambio de signo, no apagado.
- **Sin `skip`**, sin borrado y **sin entrada en `tests/baseline-rojos.json`**. El unico `ctx.skip`
  del archivo es el centinela de rama que ya existia.

### `sharp` aislada: **si**

- Importada en **un solo archivo** de produccion, `image-cropper-sharp.ts`, verificado por barrido
  propio del arbol y por la guardia nueva (que prueba su detector con `require('sharp')` y con un
  `sharp-utils` que **no** debe contar).
- `domain/` y `ports/` no la nombran; el cableado esta solo en `lib/composition`.
- `next.config.ts`: `serverExternalPackages: ['@napi-rs/canvas', 'sharp']`, y la guardia de QC-136
  exige **las dos** con control positivo por cada una.
- El unico otro archivo del repo que la importa es **su propio test**, que es lo que `design.md > 9`
  y R22 previeron («fuera del test del adaptador»). No es infraccion de R8.

### Las tres preguntas abiertas: **siguen abiertas**

Ninguna se cerro con un supuesto, verificado en el codigo y no solo en la bitacora:
1. *Tamano minimo*: no hay umbral. El `Math.max(1, ...)` del adaptador es minimo **tecnico** y **no
   descarta nada**; su comentario lo dice sin inventar politica.
2. *Caducidad*: nada borra recortes. El adaptador sube con `upsert: true`, asi que un reproceso
   **sobrescribe** y deja huerfanos los que la IA ya no identifique.
3. *Tope por PDF*: no existe. El unico tope es `MAX_PDF_PAGES` sobre las paginas.

### Las cuatro afirmaciones del implementer

1. **`sharp` no resoluble — CONFIRMADO A MEDIAS, con un matiz que importa.** `package.json` declara
   `"sharp": "^0.35.4"` y el lockfile gana la entrada directa. Pero `sharp` **si estaba en el
   lockfile de `dev`** como transitiva en `0.35.3`: el diff de `pnpm-lock.yaml` la **sube** a
   `0.35.4` junto con todos los `@img/sharp-*` y `@img/sharp-libvips-*` (1.3.2 -> 1.3.3). O sea que
   `[D2]` **no era falsa**; lo que fallaba era la **resolucion** en el arbol, porque pnpm no eleva
   transitivas al `node_modules` raiz. El lockfile no trae ni un cambio ajeno a `sharp` (247
   lineas, todas de ella y sus binarios). La premisa «no anade peso» sigue sin verificarse en
   despliegue.
2. **Precedente de `guard-identificador-de-request.test.ts` — CONFIRMADO.** Esta escrito **en la
   propia guardia**, justo encima de la constante: documenta los saltos previos («de 34 a 35 con
   esa misma aprobacion») y avisa de que «lo rompe cualquier feature posterior que anada una
   legitima». El cambio es **el minimo**: la constante 35 -> 36 y tres lineas de comentario con el
   mismo formato. `DEV_DEPENDENCIAS_ESPERADAS` no se toca. No entro en el baseline.
3. **Hueco de registro — CONFIRMADO.** Ver `menor 3`.
4. **Doble rasterizado — CONFIRMADO.** `crop-catalog-images.ts` llama `converter.renderPages(bytes,
   PAGE_RENDER_DPI)` por su cuenta; `AiReadResult` solo lleva texto y las paginas de
   `read-pdf-with-ai.ts` mueren dentro del cierre de `buildImageParts()`. No hay salida sin tocar
   `AiReadResult` o `StrategyRunResult`, que `design.md > 12.2` prohibe en esta ficha. Es **deuda
   declarada y aceptada** (`design.md > 0.2`), no defecto.

## Las 18 decisiones cerradas, una a una

| | Decision | Veredicto |
|---|---|---|
| D1 | recortar con `sharp` | **respetada** |
| D2 | ya instalada, pero se declara | **respetada** (declarada; matiz del lockfile arriba) |
| D3 | un solo archivo + `serverExternalPackages` | **respetada**, con guardia y control positivo |
| D4 | no sustituye a `@napi-rs/canvas` | **respetada**: el canvas sigue rasterizando y un caso lo afirma sobre `pdf-converter-unpdf.ts` |
| D5 | JSON dentro del texto, esta ficha lo interpreta | **respetada**: `ports/ai-reader.ts` **no aparece en el diff**; la extraccion vive en `crop-coordinates.ts` |
| D6 | **coordenadas en proporcion 0..1, nunca pixeles** | **respetada**: el esquema zod exige `[0,1]` y rechaza fuera de rango, cero, no numerico y no finito; la conversion a pixeles ocurre **solo** dentro del adaptador |
| D7 | **fuera de la pagina, se ajusta al borde y sigue** | **respetada**: `clampRegionToPage` recorta ancho/alto contra lo que queda tras mover `x`/`y`; probado por los cuatro lados y de punta a punta |
| D8 | **solo `catalogo`** | **respetada**: `batch.strategy === 'catalogo'`, y con `formula` el doble **no se invoca** |
| D9 | **`<empresa>/<id>/<pagina>-<n>.png`** | **respetada**: `buildCropPath` en `document-path.ts`, unico dueno del formato; `<n>` empieza en 1 y numera dentro de su pagina |
| D10 | **nada en base de datos** | **respetada**: el diff no toca `db/` |
| D11 | **puerto propio, `DocumentStorage` intacto** | **respetada**: `CropStorage` declara **una** operacion y un test afirma que `DocumentStorage` conserva **exactamente** sus cuatro |
| D12 | **sin imagenes, termina bien** | **respetada** |
| D13 | **un recorte fallido se salta** | **respetada** en el comportamiento; ver `menor 3` por el rastro que no queda |
| D14 | prompt provisional pero funcional | **respetada** |
| D15 | sin E2E, cobertura de integracion | **respetada**, con el motivo escrito |
| D16 | no comprueba permisos | **respetada**, con guardia de ausencia |
| D17 | bucket nuevo y propio, URL y credencial reutilizadas | **respetada**: solo `SUPABASE_CROPS_BUCKET` es nueva |
| D18 | identificadores en ingles | **respetada** |

## Trazabilidad verificada (cuerpos leidos, no solo nombres)

R1 `run-document-job.test.ts` (formula no invoca / catalogo si, con los cuatro campos del input) ·
R2 `crop-catalog-images.test.ts` (tope **sin** renderizar ni llamar a la IA; `PAGE_RENDER_DPI`
afirmado) · R3 idem (partes `image` y prompt exacto) · R4 `crop-region.test.ts` +
`crop-coordinates.test.ts` (prosa, valla, cero regiones) · R5 `crop-coordinates.test.ts` (los
cuatro fallos dan `invalid_input` y el motivo **no** vuelca el texto) + `crop-catalog-images` (cero
subidas; plazo agotado -> `ai_unavailable`) · R6 `crop-region.test.ts` · R7 `crop-region` + extremo
a extremo en `crop-catalog-images` · R8 `image-cropper-sharp.test.ts` (redondeo exacto 62x33,
limites reales, minimo 1x1, mensaje del fallo) + guardia · R9 guardia (unica dependencia nueva,
fila `aprobada`, detector probado con una tercera y con un cambio de version) · R10/R11
`canvas-no-empaquetado.test.ts` (etiquetas cruzadas, `menor 2`) · R12 `crop-path.test.ts` · R13
`ports-shape.test.ts` · R14 `crop-storage-config.test.ts` · R15/R20 guardia (diff sin `db/`,
`schema.prisma` identico a la base) + el caso conservado de QC-111 · R16 `crop-catalog-images` +
`run-document-job` · R17 `crop-catalog-images` (**este es el que vale**) · R18
`crop-prompt.test.ts` · R19, R22, R23 guardia con control positivo por detector · R21
`module-contract.test.ts` (cuatro casos, uno **muerde** con un barril inventado) +
`guard-arquitectura-modulos` verde.

Ningun caso vacio, ninguno que afirme sobre una constante local en vez de sobre el codigo real, y
los detectores de las guardias vienen todos con su entrada infractora.

## Para la vuelta al implementer, en corto

1. **Enmendar** `tests/unit/documentos/storage-config.test.ts` (bloque R26): tres importadores
   permitidos, cabecera que explique por que son tres —tres buckets, tres adaptadores, `[D11]` y
   `[D17]`—, control positivo conservado. Ni `skip`, ni baseline.
2. Corregir la etiqueta del caso `R17` de `run-document-job.test.ts` y anadir el caso que falta:
   recorte `ok` con `skipped > 0` -> fila en «listo».
3. Descruzar `R10`/`R11` en `canvas-no-empaquetado.test.ts`.
4. Quitar el plural no verificado de la cabecera de `next.config.ts`.
5. `./init.sh` **completo** en verde y **T17 marcada** en `tasks.md`.

El `menor 3` (hueco de registro) **no** vuelve al implementer: pide decision del leader o del
humano sobre `design.md > 4`.

---

# Segunda vuelta — revision de `41e13631..8faf8f37`

> Un solo commit: `8faf8f37 fix(QC-110): cierra el rechazo del reviewer y el hueco de registro`.
> Revisado el delta **y** comprobado que lo aprobado en la primera vuelta sigue en pie.

## Veredicto: **OK**

Los dos bloqueantes y los cinco menores estan cerrados. Queda **una accion mecanica del leader**
—marcar T17— y **un menor nuevo** de cobertura, ninguno de los dos motivo de rechazo.

## El gate, corrido por mi

`./init.sh` completo en el worktree, no me fie del reporte:

```
Test Files  591 passed (591)
     Tests  8428 passed | 111 skipped (8539)
  Duration  283.95s
los tres proyectos corrieron (ui, node, integration)
tests: sin rojos nuevos (0 rojos, todos en el baseline de 6); 6 por limpiar
== init OK ==
```

Coincide con lo reportado. **Aviso, no rojo, y es del leader:** los **seis** archivos del baseline
ya pasan y toca limpiarlos (`tests/baseline-rojos.json`). Es deuda ajena, anterior a esta ficha.

## Los hallazgos de la primera vuelta, uno a uno

- **B1 — CERRADO.** `storage-config.test.ts`: `IMPORTADORES_PERMITIDOS` a **tres**, en orden
  alfabetico (que es como se compara), caso renombrado a «exactamente TRES… y este modulo aporta el
  tercero», cabecera que explica **por que** son tres. **Conservados** el control positivo
  («el detector dispara») y el centinela anti-vacuidad («el barrido recorre de verdad el arbol»,
  >100 archivos). Sin `skip`, sin borrado y **sin entrada en el baseline** (comprobado).
- **B2 — ABIERTO, y es del leader.** `tasks.md` **T17 sigue `[ ]`**. Ahora si es solo una casilla: el
  gate verde ya esta medido, por el y por mi. No es defecto de implementacion, pero
  `CHECKPOINTS.md > Especificacion` lo pide literal y sin marcarlo la ficha no puede pasar a `done`.
- **menor 1 — CERRADO, y bien.** El caso que mentia pasa a «R5 — un fallo del paso de recorte deja
  error/requeue y NO borra el PDF» con el **cuerpo intacto**, y **nace el R17 de verdad**:
  `{ ok: true, uploaded: 2, skipped: 1 }` -> `{ kind: 'done' }`, `finish` en «listo» y `remove` del
  PDF. Es exactamente el caso que faltaba.
- **menor 2 — CERRADO.** R10/R11 descruzadas, **ningun cuerpo tocado**: R10 son ahora los cuatro
  casos de `serverExternalPackages` con sus dos controles positivos, R11 los dos de que el canvas
  sigue rasterizando. Contrastado con el texto de R10 y R11 en `requirements.md`.
- **menor 4 — CERRADO.** Cabeceras recortadas sin perder ningun porque verificado: siguen dichos la
  configuracion resuelta en cada llamada, el puerto en proporciones, el minimo de 1 pixel **como
  tecnico y no umbral de negocio** y el segundo render aceptado a sabiendas.
- **menor 5 — CERRADO.** `next.config.ts` ya no afirma en falso: dice que el argumento del
  `await import()` vale para el canvas y que a `sharp`, de import estatico, **ni le aplica**.
  Contrastado con `image-cropper-sharp.ts`, que efectivamente hace un import estatico.
- **menor 3 (hueco de registro) — CERRADO POR ARRIBA**, por decision humana. Detalle abajo.

## Las cuatro comprobaciones que pediste

### 1. ¿El registro registra de verdad? **Si en el codigo; los tests cubren DOS de las TRES rutas**

- El test **afirma sobre un doble** (`dobleDeRegistro()` con `vi.fn`), **nunca sobre la consola
  real**. El adaptador recibe `escribir` por parametro con `console.log` por defecto, calcado de
  `strategy-run-log-console.ts`. Ningun test parchea la consola global.
- El caso nuevo es estricto de verdad: `skip` llamado **una** vez y **con el objeto exacto**
  —ruta, `page: 1`, `index: 2` y la causa literal del error—, y las otras dos regiones subidas igual.
- En el **codigo**, las tres rutas de salto registran: pagina inexistente
  (`CAUSA_PAGINA_INEXISTENTE`), region sin area tras el ajuste (`CAUSA_REGION_VACIA`) y fallo al
  recortar o subir (la causa real del error). El `if` unico se partio en dos precisamente para poder
  dar causa propia a cada uno.
- **Pero en los tests solo dos**: ver `menor 6`.

### 2. ¿`StrategyRunLog` de verdad no encajaba? **Confirmado: no encajaba**

Lo comprobe abriendo `ports/strategy-run-log.ts`, no por la explicacion del implementer. Su
`StrategyRunSummary` es `{ strategy, mode, path, pages, textLength }`, y dos cosas lo cierran:

1. **`textLength` es requerido y no nullable** (`mode` y `pages` si admiten `null`, el no). Una
   region que no se pudo recortar tendria que inventarse un cero que no significa nada — justo el
   tipo de dato falso que ese puerto evita al prohibir el texto de la IA.
2. La operacion se llama `run` y su semantica es **una ejecucion por estrategia**. Registrar por ahi
   un rectangulo saltado seria mentir sobre lo que la linea describe, ademas de obligar a inventar
   un `PdfStrategy` y un `AiReadMode` que en una region no existen.

Y **no es un canal paralelo**: mismo `ports/`, mismo `adapters/driven/observability/`, mismo patron
de prefijo fijo localizable, mismo `escribir` inyectable, cableado en el **unico** sitio que ata
puerto -> adaptador. Es el patron del vecino aplicado, no un segundo mecanismo.

### 3. ¿`log` es requerida? **Si**

`readonly log: CropRegionLog;` — **sin `?`**, y sin valor por defecto en la fabrica, a diferencia de
`prompt` y `timeout`, que si lo tienen. O sea que el typecheck impide construir el caso de uso sin
registro: los nueve sitios de construccion —los ocho del test y el de `lib/composition`— tuvieron
que pasarlo. El agujero no se puede volver a abrir por omision.

### 4. ¿`requirements.md` y `tasks.md` intactos? **Si, confirmado por mi cuenta**

`git diff 41e13631..8faf8f37` sobre los dos archivos -> **vacio**. El unico cambio del spec es la
fila `log` en la tabla `Deps` de `design.md > 4`, con su nota fechada de decision humana. Correcto:
era esa tabla la que se contradecia con su propio paso 6.

## Sobre R17: **lo leo igual que el implementer**

El texto literal dice «nada **fuera del registro de ejecucion** dice que se perdieron recortes por
el camino». Esa redaccion **presupone** que el registro de ejecucion si lo dice; lo que faltaba no
era el requisito sino el codigo, que llevaba un `catch` pelado. Con el puerto dentro, R17 pasa a
describir lo que de verdad ocurre: en pantalla sigue sin distinguirse un archivo con recortes
perdidos de uno limpio, y el rastro vive en el registro del servidor. **R17 no queda desfasado y no
habia que reescribirlo.** Bien hecho no tocarlo.

## Hallazgos nuevos de esta vuelta

### menor 6 — la tercera ruta de salto no tiene test

`crop-catalog-images.ts` registra tres causas distintas, pero los tests del caso de uso solo
ejercitan dos: el fallo al recortar (con el objeto exacto) y la pagina inexistente. La tercera
—`isEmptyAfterClamp` -> `CAUSA_REGION_VACIA`, la region que el ajuste al borde deja sin area
(`design.md > 5.4`)— **no la ejercita ningun caso**, ni antes ni ahora: `crop-region.test.ts` solo
prueba que el ajuste devuelve cero, y ahi se acaba. Si alguien quitara ese `continue`, el caso de
uso llamaria a la libreria con un rectangulo vacio y **ninguna prueba caeria**.

Falta un caso con `x: 1` (o `y: 1`), que el esquema acepta y el ajuste deja en ancho cero: afirmar
`skipped: 1`, cero subidas y `skip` llamado con la causa de region vacia. No es bloqueante —el
comportamiento esta implementado y es el mismo `continue` de siempre—, pero la frase de la bitacora
«las tres regiones que se saltan dejan rastro» es cierta **en el codigo** y solo **dos tercios** en
la verificacion.

### observacion — el caso de la pagina inexistente afirma menos que su hermano

Usa `expect.objectContaining({ path, page: 2, index: 1 })`, sin comprobar la causa. El otro caso
afirma el objeto completo. Con `CAUSA_PAGINA_INEXISTENTE` siendo una constante del modulo, afirmarla
es gratis y cierra el unico hueco que deja ese `objectContaining`.

### observacion — cita de decisiones en un comentario de test

La cabecera nueva de `IMPORTADORES_PERMITIDOS` en `storage-config.test.ts` cita las decisiones D11 y
D17. En tests, `docs/conventions.md > Comentarios` mantiene la misma regla y solo exceptua `R<n>`
**en el nombre del caso**. No lo elevo a hallazgo por consistencia con la primera vuelta: las
guardias de alcance del repo citan fichas en sus cabeceras como practica establecida, y esta
cabecera explica precisamente **por que** la lista crecio. Queda anotado para cuando QC-115 decida
si la guardia mira tambien `tests/`.

## Lo aprobado en la primera vuelta, sigue en pie

- **Comentarios**: barrido propio sobre las lineas **anadidas** del delta en `lib/`, `app/`, `db/`,
  `components/`, `hooks/` y `next.config.ts`, con el mismo patron ya validado -> **cero citas**.
- **Guardia de QC-111**: el caso enmendado se actualizo a **tres** puertos
  (`crop-region-log.ts`, `crop-storage.ts`, `image-cropper.ts`) porque el puerto nuevo lleva «crop»
  en el nombre. **Sigue afirmando**, no desactivando; detector y palabras intactos; sin `skip` ni
  baseline. El implementer lo encontro con su propio gate completo y lo dice.
- **`sharp`**: sigue en un solo archivo, fuera de `domain/` y `ports/`, en `serverExternalPackages`,
  con la guardia exigiendo las dos. El adaptador nuevo de registro no la toca.
- **Contrato del modulo**: el barril **no** publica `CropRegionLog` ni su adaptador; las listas de
  `module-contract.test.ts` no cambian y siguen verdes. R21 intacto.
- **Las 18 decisiones y las tres preguntas abiertas**: sin cambios. El registro **no** cierra
  ninguna de las tres —no hay umbral, ni caducidad, ni tope—, solo deja rastro de lo que se pierde.

## Lo que queda para cerrar

1. **Marcar T17 `[x]`** en `tasks.md` (leader). El verde ya esta medido dos veces.
2. `menor 6` y las dos observaciones: opcionales, decide el leader si entran ahora o como ficha.
