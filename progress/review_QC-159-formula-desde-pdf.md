# review — QC-159 formula-desde-pdf (vuelta 1)

Reviewer, 2026-09-25. Rama `feature/QC-159-formula-desde-pdf`, revisada en `ed75c9d2`. El diff va
contra el merge-base con `origin/dev` (`26b09aea`, lo que entró con el merge `02bba3e4`). Son 81
archivos. Spec: `specs/QC-159-formula-desde-pdf/` (R1–R39, D1–D11, P1–P4). Bitácora:
`progress/impl_QC-159-formula-desde-pdf.md`.

## Veredicto: **RECHAZADO**: 1 bloqueante, 9 menores

La feature está bien construida. El reparto entre módulos es el del diseño; P1–P4 están
implementadas tal como se aprobaron; la autorización está en el service y tiene tests; ningún
comentario de producción cita fichas. El único bloqueante es de trazabilidad: **la relectura del
archivo en la confirmación (R23, y R3/R33 en el camino de confirmar) no tiene ningún test que se
ponga rojo si se borra**. El que dice cubrirla pasa también sin ella. Se arregla con tests, no
hay que tocar código.

## Lo que corrí yo

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | limpio |
| `pnpm run lint` | 0 errores, 7 warnings ajenos (preexistentes) |
| vitest de los unit tocados (documentos formula-*, qc159-alcance, ai-reader-canned, module-contract, documentos-ui, recetas-ui, inventario create-raw-material / product-name-lookup / inventario-schema, recipe-catalog, documentos-facade, resolve-ingredients-cost, session-once-per-request-actions, tests/guards) | **88 files, 1254 passed, 5 skipped** |
| vitest de integración: formula-import, create-raw-material, product-name-lookup, recipe-catalog-by-name (base efímera de la plantilla `qct_tpl_a120af3d84d6`) | **4 files, 17 passed** |
| grep de citas (`QC-n`, `Rn`, `design.md`, «decisión cerrada», `Dn`/`Pn`/`Tn`) en las líneas añadidas de `lib/`, `app/` y `components/` | vacío |

No corrí `./init.sh` ni el E2E, por indicación del leader. El E2E está declarado verde (2/2, un
test en Chromium y en WebKit, sobre `ed75c9d2`).

## Checklist

### 1. Trazabilidad (R1–R39 → test que muerde)
- [x] R1: `formula-pdf-upload.test.tsx` (enlace en `done`, estrategia `formula`) + E2E.
- [x] R2: `formula-import-page.test.tsx` (dos renders iguales) + E2E (reabre por URL).
- [~] R3: en la **vista previa**, `preview-formula-import.test.ts` cubre los cuatro casos y `formula-import-page.test.tsx` el estado de error. En la **confirmación** no hay test. Ver **B1**.
- [x] R4, R5, R6, R7, R8, R9: `formula-extraction.test.ts`, `formula-step-text.test.ts`, y R8 también en `formula-import-review.test.tsx`.
- [x] R10, R11: `preview-formula-import.test.ts` (sin puertos de escritura; `one`/`none`/`several`; nunca preselecciona un terminado), `product-name-lookup.int.test.ts`, `formula-import-review.test.tsx`.
- [x] R12–R16: `review-formula-import.test.ts` (reglas puras), `formula-import-review.test.tsx` (UI), `confirm-formula-import.test.ts` (el servidor rechaza).
- [x] R17: `preview-formula-import.test.ts` (con el nombre extraído y con `name`), `recipe-catalog-by-name.int.test.ts`, `formula-import-review.test.tsx` (recomprobación al perder el foco, también la anterior a la hidratación) + E2E.
- [x] R18: `confirm-formula-import.test.ts` (nombre vivo, sin `image`), `formula-import.int.test.ts` (mismo id/nombre/`image_path`; `CHECK` forzado ⇒ la receta queda como estaba).
- [x] R19, R20, R21, R24–R29: `confirm-formula-import.test.ts` y `formula-import.int.test.ts`; R20 y R24 también en `formula-import-actions.test.ts` (salen con **su** código).
- [x] R22: basta, sin número en el nombre. La vista previa es la única llamada al servidor antes de confirmar, y `preview-formula-import.test.ts` («sin tocar ningún puerto de escritura») lo prueba. Lo complementan los rechazos con «cero escrituras» de `confirm-formula-import.test.ts`.
- [ ] **R23: incompleto.** La parte «volver a validar R15/R16 y los productos» sí está cubierta: `confirm-formula-import.test.ts` («R15, R16 — la revisión del servidor rechaza…» y «R24 — el producto elegido se relee en el servidor»). La parte «**volver a leer el archivo**» no: ningún test hace fallar la confirmación por el archivo. Ver **B1**.
- [x] R30, R31: `formula-import-authorization.test.ts` (sin `recetas.modificar` ⇒ `unauthorized` y **bitácora de puertos vacía**, en la vista previa y en la confirmación; con permiso, `readFileForReview` va primero; sin `inventario.modificar` ⇒ `unauthorized` sin escrituras, y confirma si no hay materia prima que crear); `create-raw-material.test.ts` (defensa en profundidad).
- [x] R32: `formula-import-page.test.tsx` (sin `consultar` o sin `modificar` ⇒ 404 antes de leer) + alta en `guard-pantallas-exigen-permiso.test.ts`.
- [~] R33: la **vista previa** y los **productos/recetas de la confirmación** muerden (`formula-import.int.test.ts`: receta y producto de otra empresa con entrada válida; `product-name-lookup.int.test.ts`, `recipe-catalog-by-name.int.test.ts`). Pero el caso «archivo de otra empresa» de la confirmación está vacío. Ver **B1**.
- [x] R34: basta, sin número en el nombre. `formulas-upload.test.tsx` («sin documentos.modificar no hay botón ni subida en el DOM») cubre el botón; `document-upload-convenciones.test.ts` (la página sigue llamando a `canUploadDocuments` y usa el envoltorio) cubre el montaje. El permiso de subida ya lo prueban las fichas QC-142/QC-107, que esta rama no toca.
- [x] R35, R36, R37: `qc159-alcance.test.ts` (17 casos, con rojo a mano documentado) + `confirm-formula-import.test.ts` (sin `image`).
- [~] R38: `formula-import-review.test.tsx` solo afirma `min-h-11 min-w-11` en **un** botón. Por inspección el código cumple (ver punto 6). Menor **m4**.
- [x] R39: `e2e/formula-desde-pdf.spec.ts`, verde en Chromium y WebKit según la bitácora. Los dos casos van encadenados en un solo `test` (menor **m5**).

### 2. Tasks
- [ ] T0–T13 `[x]`; **T14 `[ ]`**, a falta del `./init.sh` completo que corre el leader. No lo cuento como hallazgo del implementer, pero la feature no puede pasar a `done` sin él.

### 3. CHECKPOINTS.md
- [x] Especificación: los tres archivos; `design.md > 12` trae cinco alternativas descartadas.
- [ ] Trazabilidad: el mapa está en la bitácora, pero R23 y R33 (archivo en la confirmación) no muerden (B1).
- [x] typecheck y lint en verde. Tests dirigidos en verde. La suite completa y `./init.sh` los corre el leader.
- [x] Flujo crítico (permisos, alta de inventario) con E2E.
- [x] Multiplataforma (punto 6). Dependencias: ninguna, no toca `package.json`.
- [x] Datos: sin tablas, columnas ni migraciones (R36, con guardia). Cada permiso se valida en el service y tiene test. Acceso a datos solo por Prisma en adaptadores. Sin secretos.
- [x] Módulos: `documentos` importa `recetas` e `inventario` solo por su barrel; el cableado está solo en `lib/composition`; ningún `'use server'` sale del barrel (`module-contract.test.ts`); `ProductNameLookup` es una interfaz nueva y no toca `product-catalog.ts` ni `product-prisma.ts`; `create-product.ts` intacto.
- [x] Permisos: la página valida en el servidor, los componentes reciben datos por props y las mutaciones son Server Actions.
- [ ] Verificación final: `./init.sh`, `history.md` y desmontar el worktree quedan pendientes del leader.

### 5. Calidad y seguridad
- [x] Autorización (P2): `FORMULA_IMPORT_PERMISSION = 'recetas.modificar'` es la primera línea de la vista previa y de la confirmación. `inventario.modificar` se exige solo si hay algo que crear, y **antes** de crear (después de todos los rechazos: R27). Tiene test que cuenta llamadas a puertos.
- [x] Orden de rechazos de R27 (entrada → archivo → revisión → productos → homónimos → choque → permiso de inventario → escritura): correcto. `confirm-formula-import.test.ts` «R27 — el rechazo del producto ocurre ANTES de crear…».
- [x] Sin hardcode de contexto ni secretos.

### 6. Multiplataforma
- [x] Sin `100vh`/`h-screen` ni `hover:` en `formulas/importar/**`. Botones y campos con `min-h-11 min-w-11`. `Input`/`Textarea` con `text-base` (16 px por debajo de `md`, el mismo patrón base del repo). `inputMode="decimal"` en el porcentaje. Lista de tarjetas, no tabla. `RecipeStepsField` y `ProductPicker` reutilizados tal cual.

### 7. Dependencias
- [x] Ninguna nueva.

### 8. Aislamiento por empresa
- [x] Sin modelos nuevos. `findAliveByNormalizedName` y `findAliveByNormalizedNames` filtran por `companyId` y tienen test de integración con otra empresa. `readFileForReview` es preexistente (QC-158) y ya está acotado. **Pero** que la confirmación **use** ese rechazo no tiene test (B1).

### 9. Comentarios
- [x] Ninguna línea añadida en `lib/`, `app/` o `components/` cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». Menores m8 y m9.

## Los siete puntos que pidió el leader

1. **Arreglo de WebKit (`42dbe083`). Es correcto y acotado, y no tapa otra cosa.** La causa (Playwright
   escribe antes de que React hidrate la página que llega pintada del servidor) es real y
   no es exclusiva de WebKit: WebKit solo hidrata más tarde en el E2E. En React 19, el siguiente commit
   de un input controlado reescribe `node.value` con el estado. Lo tecleado antes de hidratar se
   **pierde de forma visible**: el campo vuelve al valor del estado, y el servidor recibe lo mismo
   que se ve. No hay divergencia silenciosa entre lo que se ve y lo que se envía. El arreglo
   sincroniza el estado desde el DOM al perder el foco y recomprueba con ese valor, reutilizando
   `createRecipeSchema.shape.name` (la misma regla que `reviewFormulaImport`). Tiene dos tests
   unitarios. Los demás campos controlados (descripción, porcentaje, nombre de materia prima y
   editor de pasos) **tienen la misma exposición**. Tampoco el nombre queda cubierto del todo: si
   el usuario escribe y sale del campo antes de hidratar, el `blur` tampoco llega. **No rompe
   ningún R**: R13 y R12 exigen poder corregir, y se puede en cuanto la página hidrata, sin datos
   corruptos. Es el comportamiento de todas las pantallas SSR del repo. Menor **m1**.
2. **P1 se cumple.** `createCreateRawMaterial` (`inventario/domain/create-raw-material.ts`) crea un
   `PRODUCT` sin lote por `products.create`, con `requirePermission` como primera línea.
   `create-product.ts` no se tocó y `product-input.ts` solo **exporta** `productNameSchema` y
   `PRODUCT_NAME_MAX_LENGTH`, sin cambiar la regla. El alta manual sigue creando su lote, y sus
   tests pasan sin editarlos. Hoy el único llamante es `formulaImportDeps` en
   `lib/composition/index.ts:1563`. **Pero nada impide llamarla desde otro sitio**: el diseño
   aprobado la publica en el barrel y en la fachada `inventario.createRawMaterial`, y ninguna
   guardia fija que su único consumidor sea la revisión de fórmula. Menor **m2**.
3. **Autorización en el service**: correcta y probada (punto 5).
4. **R22, R23 y R34.** Para R22 y R34 basta, por lo dicho en el checklist. **R23 no basta**: → B1.
5. **Tests tocados fuera de la lista**: **ninguna aserción se relajó**.
   - Once dobles o cableados de `RecipeCatalog` (pedidos/asignaciones/`resolve-ingredients-cost`):
     solo añaden el método nuevo. En los tests que no deben usarlo, el método lanza (`noLlamar`,
     `throw`), así que también **endurecen**.
   - `recipe-form.test.tsx`: solo añade `observabilidad` al doble de `@/lib/composition`.
   - `inventario-schema.test.ts` y `documentos-facade.test.ts`: altas en censos cerrados que siguen
     cerrados.
   - `document-upload-convenciones.test.ts`: **se endurece**. El montaje permitido pasa al
     envoltorio y se añade que `page.tsx` no nombre `DocumentUpload` y sí `FormulaPdfUpload`.
   - `recipe-route-contract.test.ts`: saca `formulas/importar/**` de **dos** asertos, el reexport
     por barrel y la lista cerrada de acciones. Está justificado, porque la subruta tiene su barrel
     propio, y el resto de comprobaciones sigue barriendo sus archivos. Pero la subruta se queda
     **sin lista cerrada de acciones** en ninguna guardia. Menor **m3**.
6. **Cadena de traductores y `MAX_RECIPE_STEPS`: bien las dos.** `formula-import-error-translator.ts`
   no construye estados: prueba `DocumentosError` → `RecetasError` → `InventarioError` y cae al de
   `documentos` (`unexpected_error`). Es lo que pide `design.md > 6.2`. Que viva en un archivo
   auxiliar es una desviación de forma, declarada y razonable (el estado se sigue construyendo en
   el traductor único). `formula-import-actions.test.ts` prueba que cada error sale con su código.
   `MAX_RECIPE_STEPS = 50` lo publica `recetas`, su propio esquema lo usa
   (`recipeStepsSchema.max(MAX_RECIPE_STEPS)`, misma regla) y `documentos` lo importa del barrel.
   Así sustituye al `100 / 2` que esquivaba la guardia. Menor **m8**: el bloque que explica la
   cadena está duplicado en la acción y en el traductor.
7. **Comentarios**: limpios (punto 9).

## Hallazgos

### B1 — BLOQUEANTE: la relectura del archivo al confirmar no tiene test que muerda (R23; R3 y R33 en la confirmación)

`confirm-formula-import.ts:86-89` vuelve a leer el archivo y rechaza con `invalid_input` si es
`null`, no está en `done` o su tanda no es `formula`. Es la mitad de R23 («volver a leer el
archivo… con lo que hay en ese momento») y la cara de confirmación de R3/R33. **Si se borran esas
cuatro líneas, ningún test se pone rojo:**
- `confirm-formula-import.test.ts`: `dobleDeRepositorio(bitacora, archivo = ARCHIVO_LISTO)` solo se
  llama con el valor por defecto (línea 135). Ningún caso pasa `null`, un estado distinto de `done`
  ni la tanda `catalogo`.
- `formula-import-authorization.test.ts` («con permiso, el archivo se lee ANTES que cualquier otro
  puerto») prueba que se **lee**, no que se **rechace**.
- `formula-import.int.test.ts:539` («archivo de otra empresa: invalid_input, nada escrito») está
  **vacío**. Manda `lines: []`, que `reviewFormulaImport` rechaza igual (`noLines`), y afirma
  `.rejects.toThrow()` sin código. Pasa con o sin la comprobación del archivo. Su vecino de la
  línea 560 sí construye una entrada válida a propósito; este no.

**Para cumplir:**
1. En `confirm-formula-import.test.ts`, casos con una **entrada válida**: archivo `null`, estado
   `processing` (o `error`) y tanda `catalogo`, con el mismo `invalid_input` en los tres. Los tres
   con cero llamadas a `findRefs`, `findAliveByNormalizedName`, `findAliveByNormalizedNames`,
   `createRawMaterial`, `createRecipe` y `updateRecipe`.
2. En `formula-import.int.test.ts:539`, entrada válida (línea completa al 100,00 %, producto
   propio, nombre sin choque) y aserción del **código** (`invalid_input`), no `toThrow()` a secas.
   Lo mismo, de paso, en los otros dos casos de R33 (560 y 588): afirmar el rechazo concreto
   (`recipe_not_found` e `invalid_input`).
3. Añadir esos casos al mapa R→test de la bitácora, en las filas R3, R23 y R33.

### Menores

- **m1** (punto 1): el arreglo de hidratación cubre solo el nombre y solo si el `blur` llega
  hidratado. Descripción, porcentajes, nombre de materia prima y pasos siguen perdiendo, de forma
  visible, lo tecleado antes de hidratar. Es un patrón de todo el repo. Propuesta de ficha: un
  helper de E2E que espere a la hidratación, o una política común para los campos controlados de
  las pantallas SSR. No para esta vuelta.
- **m2** (punto 2): la excepción P1 está acotada por convención, no por guardia.
  `inventario.createRawMaterial` está en la fachada pública y `createCreateRawMaterial` en el
  barrel, como prescribe el diseño. Una guardia barata (el identificador solo aparece en
  `lib/composition/index.ts` dentro de `formulaImportDeps` y en `documentos/domain`) haría cumplir
  «limitada a esta revisión».
- **m3** (punto 5): `formulas/importar/**` queda fuera de la lista cerrada de acciones de
  `recipe-route-contract.test.ts` y no tiene otra propia. Hoy usa `previewFormulaImportAction`,
  `confirmFormulaImportAction`, `listUnitsAction` y `listProductsAction`. Nada impediría que se
  colara otra.
- **m4**: el test de R38 afirma `min-h-11 min-w-11` en un único botón. No mira `text-base` en
  `Input`/`Textarea` ni la ausencia de `hover:`. El código cumple por inspección.
- **m5**: R39 pide «dos casos» y el spec los encadena en **un** `test` («2 passed» = 1 test × 2
  navegadores). El contenido de los dos está. Un fallo en «reemplazar» oculta «renombrar».
- **m6**: `review-formula-import.ts > isValidNewName` repite a mano el recorte y los límites 1..200
  en vez de usar `productNameSchema.safeParse` (que ahora sí está publicado). El tope es el mismo
  porque usa `PRODUCT_NAME_MAX_LENGTH`, pero la regla está escrita dos veces.
- **m7**: `recipe-input.ts`: el comentario nuevo «Tope de pasos por receta.» solo repite el nombre
  de `MAX_RECIPE_STEPS`. Además, el mismo commit (`174ef725`) quita el comentario anterior (que
  citaba R13/QC-24/QC-25) a la vez que cambia código, así que mezcla limpieza de comentarios con
  cambio de código.
- **m8**: el bloque que explica la cadena de tres traductores está duplicado casi literal en
  `formula-import-actions.ts:10-14` y en `formula-import-error-translator.ts:1-10`. Basta con uno.
- **m9**: el comentario del E2E (`formula-desde-pdf.spec.ts`, antes del `fill` del nombre) dice
  que `blur()` puede correr «antes de que React confirme el estado (WebKit)». La causa medida es
  la hidratación, y `Tab` pasa porque el arreglo lee el DOM, no porque espere a React. El
  comentario despista a quien lo mantenga.

## Qué falta para OK

Solo B1: tests de la relectura del archivo en la confirmación (unit, tres estados) y el caso de
integración «archivo de otra empresa» con entrada válida y código afirmado. Después, el leader
corre `./init.sh` completo y cierra T14.

## Vuelta 2 (2026-09-25, sobre `efbb0c92`)

Alcance: solo los commits `d6a7976c`..`efbb0c92`. Por decisión del leader, m1, m3, m5 y m6 quedan
como deuda anotada en la bitácora.

### Veredicto vuelta 2: **OK**: B1 cerrado, sin bloqueantes

### B1: cerrado, comprobado con mutación
- Tests nuevos en `confirm-formula-import.test.ts`: tres casos con una **entrada válida**
  (`entradaBase()`): archivo `null`, `status: 'processing'` y tanda `catalogo`. Cada uno afirma
  `invalid_input` por código, y que no se llamó a `findRefs`, `findAliveByNormalizedName`,
  `findAliveByNormalizedNames`, `createRawMaterial`, `createRecipe` ni `updateRecipe`. Esas «no
  llamadas» son las que muerden: sin la comprobación del archivo, el flujo sigue hasta `findRefs`.
- `formula-import.int.test.ts:539`: ahora con línea completa al 100,00 % de un producto propio y
  `rejects.toMatchObject({ code: 'invalid_input' })`. Los casos 560 y 588 afirman también su código
  (`recipe_not_found` e `invalid_input`).
- **Mutación hecha por mí:** la condición de `confirm-formula-import.ts:87` se envolvió en
  `false && (…)`. Resultado: **3 rojos** en el unit (los tres casos nuevos) y **1 rojo** en la
  integración («archivo de otra empresa»). Archivo restaurado con `git checkout --` y árbol limpio
  comprobado. Tras restaurar: unit dirigido (`confirm-formula-import`, `create-raw-material-alcance`,
  `formula-import-review`, `formula-import-actions`, `tests/guards`) con 48 archivos, 652 verdes y
  5 saltados; integración `formula-import.int.test.ts` con 8/8.

### Menores corregidos
- m2: `tests/unit/inventario/create-raw-material-alcance.test.ts` limita `createRawMaterial` y
  `createCreateRawMaterial` a sus rutas permitidas, y dentro de `lib/composition/index.ts` a la
  fachada de `inventario` y `formulaImportDeps`. Cada detector tiene su caso con una infracción
  fabricada, así que no es vacuo.
- m4: R38 afirma ahora `min-h-11 min-w-11` en todos los controles de la revisión (nombre,
  descripción, añadir, confirmar, choque y los de cada fila), `text-base` en los campos de texto y
  ningún `hover:` en la revisión.
- m7: se quitó el comentario redundante de `MAX_RECIPE_STEPS`.
- m8: `formula-import-actions.ts` ya no duplica la explicación; remite al traductor.
- m9: el comentario del E2E nombra la causa real (la hidratación y la relectura del DOM). Solo
  cambia el comentario, no la lógica del test.
- Las líneas de producción añadidas en esta vuelta no citan fichas ni requisitos.
