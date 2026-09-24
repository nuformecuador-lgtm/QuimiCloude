# impl — QC-158 catalogo-desde-pdf

Rama `feature/QC-158-catalogo-desde-pdf`, worktree `.worktrees/QC-158-catalogo-desde-pdf`.
Implementer: coordina `backend_dev` y `frontend_dev`. Spec aprobado el 2026-09-23 (R1–R38, T0–T17).

## T0 — Medir antes de escribir (2026-09-23)

### Base propia
- `pnpm run db:test template` → plantilla reutilizada `qct_tpl_664cc76c19c8` (45 migraciones, ya
  sembrada).
- `CREATE DATABASE "QuimiCloude_QC158" TEMPLATE "qct_tpl_664cc76c19c8"` → creada.
- `.env` del worktree (no versionado): `DATABASE_URL` y `DIRECT_URL` → `…/QuimiCloude_QC158`.
- `pnpm run db:migrate` → `No pending migrations to apply.`; `pnpm run db:seed` → `nada que crear`.
- El worktree no traía `node_modules`: `pnpm install --frozen-lockfile --prefer-offline` (lockfile
  intacto, sin dependencias nuevas; `git status` limpio después) y `pnpm exec prisma generate`.

### E2E de QC-107 en `dev`
`pnpm exec playwright test e2e/documentos.spec.ts --project=chromium` → **ROJO** (1 failed, 2.2 min):

```
✘ [chromium] › e2e\documentos.spec.ts:216:7 › documentos › sube tres PDFs y ve cambiar el estado de cada uno hasta terminar (R20)
Locator:  getByTestId('document-upload-row-status-0')
Expected: "done"
Received: "error"
```

El servidor solo imprime `[process-pdf-by-strategy] estrategia=catalogo modo=images … longitud=53`
(53 = largo de `CANNED_AI_TEXT`) y no el motivo; las filas ya estaban limpias por el `afterAll` al
consultarlas. **Motivo, leído en el código**: el doble `ai-reader-canned.ts` devuelve siempre
`'texto de guion para el recorrido de extremo a extremo'`, sin `{`; el recorte
(`crop-coordinates.ts > extractCropCoordinates`) lanza `ValidationError` («no se encontro un objeto
JSON en el texto») → `invalid_input` → archivo en `error`. Confirma la hipótesis de `design.md > 0`.
Se arregla en T14 (el doble devuelve coordenadas con el prompt de recorte).

### Prefijo de la migración
Última migración de `dev` (`origin/dev`): `20260923140000_product_batch_nullable_machine`. QC-141 ocupa
`20260923150000`–`…150200` en su rama. Prefijo elegido: **`20260923180000`** (por detrás de ambas).

## T8 — Tope de 1 MB del cuerpo de la Server Action

Medido con `JSON.stringify` + `Buffer.byteLength` (UTF-8) sobre la entrada completa de la
confirmación (`supplierId`, `documentFileId`, `lines`, `newPresentationUnits: []`):

| Fila | Bytes/fila | Filas que caben en 1.048.576 B |
|---|---|---|
| Realista: nombre largo, presentación, costo, mínimo, material, medidas completas, `imagePath` | 405 | 2.582 |
| Mínima: sin imagen, medidas ni material | 161 | 6.471 |

El repo **no** tiene el catálogo de muestra de QC-129 (su spec dice que el PDF no entra al
repositorio). Estimación para 50 páginas a 15–30 filas/página: 750–1.500 filas, por debajo de 2.582
en el peor caso. **Cabe sin tocar `next.config.ts`**; no hace falta decisión humana. Queda como riesgo
declarado para catálogos de más de ~2.500 líneas.

## Paso 0 — limpieza de comentarios en preview-catalog-import.ts y catalog-import-input.ts

Quitadas todas las citas R-numero, design.md y similares de los bloques de comentario de los dos
archivos; el texto se acortó a los porqués que quedaban por debajo de las ~5 líneas de la
convención. Verificado con un grep de esas citas sobre los dos archivos: vacío. T10 tuvo que
retocar además los comentarios de paso numerado del CUERPO de preview-catalog-import.ts (los que
decían "1. ...", "2. ..." junto a cada paso del caso de uso), porque también citaban requisitos;
esa es la única superposición entre el paso 0 y T10, sin cambiar ninguna línea de código en ese
archivo.

## T10 — Caso de uso de confirmación

### Archivos
- lib/modules/documentos/domain/confirm-catalog-import.ts (nuevo).
- lib/modules/documentos/index.ts (barrel: createConfirmCatalogImport, CatalogImportSummary).
- lib/modules/documentos/domain/preview-catalog-import.ts (limpieza de comentarios, ver arriba).
- lib/modules/documentos/domain/catalog-import-input.ts (limpieza de comentarios, ver arriba).
- tests/unit/documentos/module-contract.test.ts (listas congeladas: mas createConfirmCatalogImport,
  mas CatalogImportSummary).
- tests/unit/documentos/confirm-catalog-import.test.ts (nuevo).
- tests/unit/documentos/catalog-import-authorization.test.ts (nuevo).
- tests/integration/documentos/catalog-import-isolation.int.test.ts (nuevo).
- tests/integration/aislamiento.json (entrada commit para el archivo de integración de arriba).

No se tocó lib/composition/index.ts, app/, components/, feature_list.json, progress/current.md ni
tasks.md. No se añadió ninguna dependencia.

### Forma exacta de CatalogImportSummary

```
type CatalogImportSummary = {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly presentationsCreated: number;
};
```

### Errores por fila — decisión y por qué

confirm-catalog-import.ts rechaza la confirmación entera lanzando el ValidationError (invalid_input)
que ya existía, con un diagnostic que lista, por fila (numerada desde 1), el motivo: "incompleta
(<campos>)", "duplicada", "imagen ajena a este archivo", "presentacion nueva sin unidad" o "unidad
no visible para la empresa". No añadí una clase de error nueva ni un campo público con la lista
estructurada: el diagnostic de DocumentosError es explícitamente de solo servidor (según su propio
comentario: va al registro del servidor y nunca al navegador), y el encargo pedía no tocar ningún
código nuevo del catálogo de errores. Esto es algo que el frontend_dev necesita saber: hoy el motivo
por fila NO llega estructurado al navegador vía la respuesta de confirmCatalogImportAction. Lo que
sí puede pintar: previewCatalogImportAction ya devuelve, por fila, kind e invalidFields para
"incompleta"/"duplicada", así que reclasificar con las filas actuales tras un rechazo de la
confirmación cubre esos dos motivos. Los otros tres (imagen ajena, presentación sin unidad, unidad
no visible) no los cubre la vista previa hoy, porque son validaciones propias de la confirmación que
la vista previa no hace. Si T12 necesita mostrarlos por fila, hace falta una decisión explícita: o
la vista previa se amplía para señalarlos también, o ValidationError gana un campo público
estructurado (cambio de contrato de errores que debería aprobar un humano). Lo señalo en vez de
decidirlo por mi cuenta.

### Diseño del caso de uso

Orden exacto:
1. requirePermission(actor, DOCUMENT_UPLOAD_PERMISSION) — primera línea.
2. confirmCatalogImportInputSchema.safeParse — ValidationError si no encaja.
3. repository.readFileForReview — mismo ValidationError que la vista previa si el archivo no
   existe, no está en done o su tanda no es catalogo (la confirmación no interpreta el texto, pero
   exige este paso).
4. Resuelve presentaciones por nombre normalizado, líneas vivas por identidad (propaga
   supplier_not_found) y lista los recortes del archivo.
5. Clasifica con lo resuelto en el paso 4 unicamente: la fila que manda el cliente no lleva ninguna
   clase (el esquema de entrada no tiene un campo kind), así que ignorar la clasificación del
   cliente se cumple por construcción del borde.
6. Recoge TODOS los motivos de rechazo antes de lanzar nada: filas incompletas/duplicadas, imágenes
   que no son un recorte real de ese archivo y esa empresa, y presentaciones nuevas sin unidad
   elegida o con una unidad que no es visible para la empresa. Si hay algún motivo, ValidationError
   con todos juntos y ningún puerto de escritura se toca.
7. Solo si hace falta crear alguna presentación nueva: se exige el permiso de inventario del barrel
   de identity, ANTES de crear nada. Sin presentación nueva, no se comprueba este permiso.
8. Crea cada presentación nueva UNA vez (agrupadas por nombre normalizado, aunque las nombren varias
   filas), reutilizando la existente si una alta concurrente la creó primero.
9. Escribe todas las líneas incluidas en una sola llamada al puerto de escritura por identidad
   (existente de T4) y devuelve el resumen con presentationsCreated.

### Mapa R -> test

- R13: confirm-catalog-import.test.ts, "sin confirmar no se escribe...".
- R14: confirm-catalog-import.test.ts, "ignora la clasificacion del cliente...".
- R17: confirm-catalog-import.test.ts, "una presentacion nueva nombrada por tres filas..." y
  "PresentationDuplicateNameError concurrente se reutiliza...".
- R18: confirm-catalog-import.test.ts, "sin unidad elegida..." y "unidad elegida pero no
  visible...".
- R20: confirm-catalog-import.test.ts, "fila incompleta..." y "dos filas incluidas con la misma
  identidad...".
- R26: confirm-catalog-import.test.ts, "imagen que no es recorte de ESE archivo..." y "...ya no
  esta en la lista vigente de recortes...".
- R31: catalog-import-authorization.test.ts, describe "R31" (cuatro actores denegados y orden de
  llamadas).
- R33: catalog-import-authorization.test.ts, describe "R33" (rechaza antes de escribir; sin
  presentación nueva, confirma).
- R21: catalog-import-isolation.int.test.ts, "la presentacion creada QUEDA...".
- R22: catalog-import-isolation.int.test.ts, "confirmar dos veces el mismo contenido...".
- R34: catalog-import-isolation.int.test.ts, describe "R34" (archivo, proveedor, unidad, recorte de
  otra empresa).

### Conteos
- Unit: confirm-catalog-import.test.ts, 11 casos; catalog-import-authorization.test.ts, 7 casos.
- Integración: catalog-import-isolation.int.test.ts, 6 casos, contra la base propia del worktree
  (plantilla y copia efímera del arnés de test-db), commitea y limpia en afterAll.

### Verificación
- pnpm run typecheck -> limpio.
- pnpm run lint -> 0 errores, 5 warnings no-unused-vars en parámetros descartados de dobles tipados
  de confirm-catalog-import.test.ts (no bloquean el gate).
- pnpm exec vitest run de los tests unit de documentos, los dos guards pedidos y el nuevo test de
  integración -> 60 test files passed, 631 tests passed, 26 skipped.

### Cosas para revisar antes de cablear en lib/composition (siguiente paso)
- CatalogImportDeps.catalog.findAliveByIdentity / .importLines se cablean con
  createFindCatalogLinesByIdentity / createImportCatalogLines de proveedores sobre
  findAliveCatalogLinesByIdentities / upsertCatalogLinesByIdentity (adaptador de T4, ya existente).
- CatalogImportDeps.presentations = { findRefs: findPresentationRefs, findByNormalizedNames:
  findPresentationsByNormalizedNames } (T7, ya existente).
- CatalogImportDeps.createPresentation = createCreatePresentation({ presentations:
  presentationRepository }), el MISMO objeto que ya cablea inventario en lib/composition.
- CatalogImportDeps.units = { findRefs: findUnitRefs, findRefsSharingBaseInCompany:
  findUnitRefsSharingBaseInCompany } (ya existente en unidades).
- CatalogImportDeps.repository = documentBatchRepositoryPrisma (ya existente).
- CatalogImportDeps.crops = el adaptador CropCatalog real (produccion: crop-catalog-supabase.ts; en
  E2E, el doble crop-catalog-memory.ts).

## Veredicto
T10 completo: caso de uso de confirmación, sus dos suites unit y su integración de aislamiento en
verde; paso 0 de limpieza de comentarios hecho en los dos archivos pedidos. Un punto abierto para
T12 (frontend): el motivo por fila de un rechazo de la confirmación (mas allá de
incompleta/duplicada) no llega estructurado al navegador con el diseño actual de errores; necesita
una decisión explícita, no la tomé por mi cuenta.
