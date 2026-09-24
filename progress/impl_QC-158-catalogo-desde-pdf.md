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

---

# T17 — Consolidación (2026-09-24)

## Sincronización con `origin/dev`

Merge `0b8af4dd` (206 commits de `dev`). Los conflictos, todos en listas cerradas o barrels, se
resolvieron como unión: `lib/composition/index.ts`, `lib/modules/inventario/index.ts`,
`lib/modules/proveedores/index.ts`, `tests/guards/guard-identificador-de-request.test.ts`
(`MIGRACIONES_ESPERADAS`) y `tests/unit/shared/data-table-alcance.test.ts` (`dev` sacó
`aislamiento-proveedores.spec.ts`, de 21 a 20; esta rama suma `catalogo-desde-pdf.spec.ts`, de 20 a 21).

- **Migración renumerada** de `20260923180000_…` a **`20260924180000_supplier_catalog_line_material_and_measurements`**,
  porque `dev` trajo `20260924120000_customers`, posterior a la nuestra. En `QuimiCloude_QC158` la
  vieja se revirtió a mano (su `down.sql` en una transacción y borrado de su fila en
  `_prisma_migrations`), porque `db:rollback` elige la última **por nombre de carpeta** y apuntaba a
  `customers`, que no estaba aplicada. Después, `db:migrate` aplicó las cuatro de `dev` más la nuestra;
  `db:rollback` dio `revertida`; `db:migrate` la reaplicó, y `db:seed` dio `nada que crear`.
- `dev` añadió `react-intersection-observer` (aprobada allí, con su fila en `docs/dependencias.md`):
  `pnpm install --frozen-lockfile`. **Esta rama no añade dependencias**: `git diff origin/dev --stat
  -- package.json pnpm-lock.yaml` sale vacío.
- Conflictos semánticos con tests nuevos de `dev`: los dobles de `PresentationCatalog` en
  `order-expiry`, `order-reservation` y `order-reservation-concurrency` (`findByNormalizedNames`), el
  fixture de `showcase-service.test.ts` (`material`/`measurements`), el mock de `supplier-actions` en
  `catalog-line-form.test.tsx`, y el caso R29 de `guard-convenciones-showcase.test.ts` (QC-140). Ese
  caso medía «la rama no añade nada bajo `db/`» en **cualquier** rama; ahora salta en voz alta fuera
  de `feature/QC-140-*`. **Para el reviewer: toca un test de otra ficha.**

## Archivos de la rama (contra `origin/dev`, sin `specs/QC-158`)

```
M app/(private)/proveedores/[id]/components/catalog-columns.tsx
M app/(private)/proveedores/[id]/components/catalog-columns-skeleton.ts
M app/(private)/proveedores/[id]/components/catalog-line-form.tsx
A app/(private)/proveedores/[id]/components/catalog-pdf-upload.tsx
M app/(private)/proveedores/[id]/components/index.ts
A app/(private)/proveedores/[id]/importar/[documentoId]/components/catalog-import-review.tsx
A app/(private)/proveedores/[id]/importar/[documentoId]/components/catalog-import-row.tsx
A app/(private)/proveedores/[id]/importar/[documentoId]/components/catalog-import-summary.tsx
A app/(private)/proveedores/[id]/importar/[documentoId]/components/crop-picker.tsx
A app/(private)/proveedores/[id]/importar/[documentoId]/components/index.ts
A app/(private)/proveedores/[id]/importar/[documentoId]/components/new-presentation-units.tsx
A app/(private)/proveedores/[id]/importar/[documentoId]/page.tsx
M app/(private)/proveedores/[id]/page.tsx
M components/shared/document-upload/document-upload.tsx
M components/shared/document-upload/document-upload-row.tsx
M components/shared/document-upload/index.ts
M components/shared/document-upload/labels.ts
A db/migrations/20260924180000_supplier_catalog_line_material_and_measurements/down.sql
A db/migrations/20260924180000_supplier_catalog_line_material_and_measurements/migration.sql
M db/schema.prisma
A e2e/catalogo-desde-pdf.spec.ts
M lib/composition/index.ts
M lib/modules/documentos/adapters/driven/ai/ai-reader-canned.ts
M lib/modules/documentos/adapters/driven/persistence/document-batch-repository-prisma.ts
A lib/modules/documentos/adapters/driven/storage/crop-catalog-memory.ts
A lib/modules/documentos/adapters/driven/storage/crop-catalog-supabase.ts
A lib/modules/documentos/adapters/driven/storage/crop-storage-memory.ts
A lib/modules/documentos/adapters/driving/catalog-import-actions.ts
A lib/modules/documentos/domain/catalog-extraction.ts
A lib/modules/documentos/domain/catalog-import-input.ts
A lib/modules/documentos/domain/classify-catalog-import.ts
A lib/modules/documentos/domain/confirm-catalog-import.ts
M lib/modules/documentos/domain/crop-coordinates.ts
A lib/modules/documentos/domain/crop-pairing.ts
M lib/modules/documentos/domain/document-path.ts
A lib/modules/documentos/domain/json-in-text.ts
A lib/modules/documentos/domain/preview-catalog-import.ts
A lib/modules/documentos/domain/suggest-unit.ts
M lib/modules/documentos/index.ts
A lib/modules/documentos/ports/crop-catalog.ts
M lib/modules/documentos/ports/document-batch-repository.ts
M lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma.ts
M lib/modules/inventario/domain/presentation-catalog.ts
M lib/modules/inventario/index.ts
A lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-import-prisma.ts
M lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma.ts
M lib/modules/proveedores/adapters/driving/supplier-catalog-actions.ts
M lib/modules/proveedores/domain/catalog-line-input.ts
M lib/modules/proveedores/domain/catalog-line-view.ts
M lib/modules/proveedores/domain/create-catalog-line.ts
A lib/modules/proveedores/domain/find-catalog-lines-by-identity.ts
A lib/modules/proveedores/domain/import-catalog-lines.ts
M lib/modules/proveedores/domain/update-catalog-line.ts
M lib/modules/proveedores/index.ts
A lib/modules/proveedores/ports/supplier-catalog-import-repository.ts
M lib/shared/routes.ts
M specs/QC-129-textos-definitivos-de-los-prompts/requirements.md
M tests/guards/guard-dobles-e2e.test.ts
M tests/guards/guard-identificador-de-request.test.ts
M tests/guards/guard-pantallas-exigen-permiso.test.ts
M tests/integration/aislamiento.json
M tests/integration/asignaciones/assigned-orders.int.test.ts
M tests/integration/asignaciones/company-orders.int.test.ts
M tests/integration/asignaciones/finished-orders.int.test.ts
A tests/integration/documentos/catalog-import-isolation.int.test.ts
A tests/integration/inventario/presentation-catalog-by-name.int.test.ts
M tests/integration/pedidos/order-cost-quote.int.test.ts
M tests/integration/pedidos/order-expiry.int.test.ts
M tests/integration/pedidos/order-ingredients-cost.int.test.ts
M tests/integration/pedidos/order-reservation.int.test.ts
M tests/integration/pedidos/order-reservation-concurrency.int.test.ts
A tests/integration/proveedores/catalog-import-upsert.int.test.ts
M tests/integration/proveedores/catalog-line.int.test.ts
M tests/integration/proveedores/company-scope-queries.int.test.ts
A tests/integration/proveedores/material-measurements-migration.int.test.ts
A tests/unit/documentos/ai-reader-canned.test.ts
A tests/unit/documentos/catalog-extraction.test.ts
A tests/unit/documentos/catalog-import-actions.test.ts
A tests/unit/documentos/catalog-import-authorization.test.ts
A tests/unit/documentos/classify-catalog-import.test.ts
A tests/unit/documentos/confirm-catalog-import.test.ts
A tests/unit/documentos/crop-catalog-supabase.test.ts
A tests/unit/documentos/crop-pairing.test.ts
M tests/unit/documentos/crop-path.test.ts
M tests/unit/documentos/document-batch-repository-prisma.test.ts
M tests/unit/documentos/document-job-route.test.ts
M tests/unit/documentos/enqueue-batch.test.ts
M tests/unit/documentos/get-batch-status.test.ts
A tests/unit/documentos/json-in-text.test.ts
M tests/unit/documentos/module-contract.test.ts
M tests/unit/documentos/ports-shape.test.ts
A tests/unit/documentos/preview-catalog-import.test.ts
M tests/unit/documentos/qc111-alcance.test.ts
A tests/unit/documentos/qc158-alcance.test.ts
M tests/unit/documentos/run-document-job.test.ts
M tests/unit/documentos/storage-config.test.ts
A tests/unit/documentos/suggest-unit.test.ts
M tests/unit/documentos-ui/document-upload-convenciones.test.ts
A tests/unit/documentos-ui/document-upload-review-link.test.tsx
M tests/unit/documentos-ui/supplier-detail-upload.test.tsx
M tests/unit/identity/session-once-per-request-actions.test.ts
M tests/unit/pedidos/quote-order-cost.test.ts
M tests/unit/proveedores/catalog-line-image-scope.test.ts
M tests/unit/proveedores/catalog-line-input.test.ts
M tests/unit/proveedores/catalog-service.test.ts
M tests/unit/proveedores/company-isolation-service.test.ts
A tests/unit/proveedores/import-catalog-lines.test.ts
M tests/unit/proveedores/module-contract.test.ts
A tests/unit/proveedores/schema/material-measurements-migration.test.ts
M tests/unit/proveedores/schema/proveedores-schema.test.ts
M tests/unit/proveedores/schema/suppliers-company-scope-migration.test.ts
M tests/unit/proveedores/scope.test.ts
M tests/unit/proveedores/showcase-service.test.ts
M tests/unit/proveedores/supplier-actions.test.ts
A tests/unit/proveedores-ui/catalog-import-page.test.tsx
A tests/unit/proveedores-ui/catalog-import-review.test.tsx
A tests/unit/proveedores-ui/catalog-line-form.test.tsx
M tests/unit/proveedores-ui/catalog-line-sheet.test.tsx
A tests/unit/proveedores-ui/catalog-pdf-upload.test.tsx
M tests/unit/proveedores-ui/delete-catalog-line-dialog.test.tsx
M tests/unit/proveedores-ui/guard-convenciones-showcase.test.ts
M tests/unit/proveedores-ui/supplier-detail-page.test.tsx
M tests/unit/shared/data-table-alcance.test.ts
```

## Mapa R1–R38 → test

| R | Test |
|---|---|
| R1 | `tests/unit/documentos-ui/document-upload-review-link.test.tsx` (describe «…solo cuando le llega la prop (R1)»); `tests/unit/proveedores-ui/catalog-pdf-upload.test.tsx`; E2E `e2e/catalogo-desde-pdf.spec.ts` (pulsa «Revisar») |
| R2 | `document-upload-review-link.test.tsx` («con estrategia formula y sin reviewHrefFor… (R2)»); `catalog-pdf-upload.test.tsx` («…(R1, R2)») |
| R3 | `tests/unit/documentos/preview-catalog-import.test.ts` (describe R3, cuatro casos con el mismo error); `tests/unit/documentos/document-batch-repository-prisma.test.ts` (`readFileForReview` devuelve null en otra empresa); `tests/unit/proveedores-ui/catalog-import-page.test.tsx` |
| R4 | `preview-catalog-import.test.ts` (R4); `tests/integration/proveedores/catalog-import-upsert.int.test.ts` («R4, R34 — …otra empresa / dado de baja»); `catalog-import-page.test.tsx` |
| R5 | `tests/unit/documentos/catalog-extraction.test.ts` (describe R5, 8 casos); `tests/unit/documentos/json-in-text.test.ts` |
| R6 | `catalog-extraction.test.ts` (describe R6, 3 casos); `catalog-import-page.test.tsx` |
| R7 | `catalog-extraction.test.ts` (describe R7, función pura) |
| R8 | `preview-catalog-import.test.ts` (R8, dobles de escritura que lanzan si se les llama); `tests/unit/proveedores-ui/catalog-import-review.test.tsx` (R8) |
| R9 | `tests/unit/documentos/classify-catalog-import.test.ts` (cinco clases; `12.5` = `12.5000`); `catalog-import-review.test.tsx` (etiquetas y costo actual/nuevo); E2E |
| R10 | `preview-catalog-import.test.ts` (R10, reclasifica con `lines`); `catalog-import-review.test.tsx` (Confirmar deshabilitado mientras reclasifica) |
| R11 | `catalog-import-review.test.tsx` (incluir/excluir, exclusión por defecto) |
| R12 | `catalog-import-review.test.tsx` (solo el costo es editable en «cambia»/«sin cambios») |
| R13 | `tests/unit/documentos/confirm-catalog-import.test.ts` («sin confirmar no se escribe…») |
| R14 | `confirm-catalog-import.test.ts` («ignora la clasificacion del cliente…») |
| R15 | `catalog-import-upsert.int.test.ts` (solo cambian `cost`/`updated_by`/`updated_at`; el mismo costo no escribe); E2E (costo actualizado en base y en pantalla) |
| R16 | `catalog-import-upsert.int.test.ts` (R16); E2E (línea nueva) |
| R17 | `confirm-catalog-import.test.ts` (una presentación para tres filas; `PresentationDuplicateNameError` ⇒ la reutiliza); E2E (presentación creada) |
| R18 | `confirm-catalog-import.test.ts` (sin unidad; unidad no visible); `catalog-import-review.test.tsx` (motivos por fila) |
| R19 | `tests/unit/documentos/suggest-unit.test.ts` (0, 1 y 2 coincidencias); `catalog-import-review.test.tsx` (preselección); E2E (elección manual) |
| R20 | `confirm-catalog-import.test.ts` (fila incompleta; identidad repetida); `catalog-import-review.test.tsx` (motivos por fila) |
| R21 | `catalog-import-upsert.int.test.ts` (fallo en la fila 3 de 5); `tests/integration/documentos/catalog-import-isolation.int.test.ts` (la presentación creada queda; la segunda confirmación la reutiliza) |
| R22 | `catalog-import-upsert.int.test.ts` (dos confirmaciones simultáneas); `catalog-import-isolation.int.test.ts` (confirmar dos veces) |
| R23 | `catalog-import-review.test.tsx` (resumen y vuelta al detalle); E2E (resumen 1/1/0/1) |
| R24 | `catalog-import-review.test.tsx` (quitar y cambiar recorte); E2E (quita una imagen; la nueva conserva la suya) |
| R25 | `tests/unit/documentos/crop-pairing.test.ts` |
| R26 | `tests/unit/documentos/crop-path.test.ts` (`isCropPathOf`); `confirm-catalog-import.test.ts` (imagen ajena; imagen que ya no está en la lista) |
| R27 | `tests/unit/proveedores/catalog-line-input.test.ts`; `tests/integration/proveedores/material-measurements-migration.int.test.ts` |
| R28 | `tests/unit/proveedores-ui/catalog-line-form.test.tsx` (describe R28); `tests/unit/proveedores/supplier-actions.test.ts` (R28) |
| R29 | `catalog-line-form.test.tsx` (describe R29); `supplier-actions.test.ts` (R29) |
| R30 | `tests/unit/proveedores/schema/material-measurements-migration.test.ts`; migrate → rollback → migrate sobre `QuimiCloude_QC158` (arriba) |
| R31 | `tests/unit/documentos/catalog-import-authorization.test.ts` (R31); `preview-catalog-import.test.ts` (R31, 5 casos); `tests/unit/proveedores/import-catalog-lines.test.ts` |
| R32 | `catalog-import-page.test.tsx` (404 si falta cualquiera de los dos permisos); `tests/guards/guard-pantallas-exigen-permiso.test.ts` (de 13 a 14 pantallas) |
| R33 | `catalog-import-authorization.test.ts` (R33) |
| R34 | `catalog-import-isolation.int.test.ts` (describe R34: archivo, proveedor, unidad y recorte de otra empresa); `tests/integration/inventario/presentation-catalog-by-name.int.test.ts`; `catalog-import-upsert.int.test.ts` |
| R35 | `catalog-extraction.test.ts` (describe R35); `catalog-line-input.test.ts` |
| R36 | `tests/unit/documentos/qc158-alcance.test.ts` (R36a/b/c); `tests/unit/documentos/ai-reader-canned.test.ts` (los dos textos de guion son JSON puro) |
| R37 | `catalog-import-review.test.tsx` (R37); `catalog-line-form.test.tsx` (R37); la pasada manual en un móvil real **no se ha hecho**: solo el E2E en WebKit |
| R38 | `e2e/catalogo-desde-pdf.spec.ts` (Chromium y WebKit) |

## Salida real de las corridas (2026-09-24, tras el merge)

- `pnpm run typecheck`: limpio.
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)` (5 `_args` sin usar en
  `confirm-catalog-import.test.ts` y 2 ajenos).
- `pnpm exec vitest run tests/guards/ tests/unit/proveedores/ tests/unit/proveedores-ui/ tests/unit/documentos/ tests/unit/documentos-ui/ tests/unit/shared/data-table-alcance.test.ts tests/unit/identity/session-once-per-request-actions.test.ts`:
  primera pasada `5 failed | 154 passed (159)` / `32 failed | 1771 passed | 37 skipped`, todo por el
  merge (`react-intersection-observer` sin instalar, un mock incompleto y el caso R29 de QC-140).
  Arreglado eso, los 5 archivos rojos pasan a verde (`catalog-line-form` 8/8; showcase 38/38;
  `guard-convenciones-showcase` 4 passed y 2 skipped).
- Integración (`material-measurements-migration`, `catalog-import-upsert`,
  `catalog-import-isolation`, `presentation-catalog-by-name`, `catalog-line`, `order-expiry`,
  `order-reservation`, `order-reservation-concurrency` + `showcase-service`): `Test Files 9 passed
  (9)`, `Tests 78 passed (78)`.
- E2E, una a la vez, con el puerto 3117 libre y el `.env` apuntando a `QuimiCloude_QC158`:
  - Chromium: `catalogo-desde-pdf.spec.ts` ✓ (11.9s), `documentos.spec.ts` ✓ (4.8s) — `2 passed (33.8s)`.
  - WebKit: `catalogo-desde-pdf.spec.ts` ✓ (16.7s), `documentos.spec.ts` ✓ (6.2s) — `2 passed (30.0s)`.
- Barrido de citas (`QC-`, `R<n>`, `T<n>`, `[D/F<n>]`, `design.md`) contra `origin/dev`: 0 en las
  líneas añadidas de `lib app components db` y 0 en los comentarios añadidos de `tests e2e`.
- **No** se corrió la suite completa ni `./init.sh`: los corre el leader.

## Decisiones tomadas al implementar (para el reviewer)

1. **Motivo por fila del rechazo (R18, R20).** El servidor rechaza con un `invalid_input` genérico y
   el motivo por fila se queda en el diagnóstico de solo servidor: no se cambió el contrato de
   errores. La pantalla **prevalida en el cliente** y nombra las filas (incompleta/duplicada,
   identidad repetida, presentación nueva sin unidad), con «Confirmar» deshabilitado; si aun así el
   servidor rechaza, muestra el mensaje y vuelve a pedir la vista previa. La imagen ajena (R26) solo se
   alcanza manipulando la petición: la UI solo ofrece recortes del archivo.
2. **Sugerencia de unidad (R19).** Se calcula en la página (Server Component) con `suggestUnitId`
   del barrel de `documentos` y la lista de `listUnitsAction()`, no en la vista previa: `UnitCatalog`
   no sabe listar las unidades visibles sin sus ids, y `design.md > 5.5` dice «sin cambios» para
   `unidades`.
3. **Acciones: el esquema se valida antes que el actor.** `catalog-import-actions.ts` valida la
   entrada antes de resolver la sesión (patrón de `recipe-actions`/`order-actions`), no con el de
   `document-batch-actions` que cita `design.md > 6.2`. Un anónimo con la entrada rota recibe
   `invalid_input`, no `unauthorized`; R31 se sigue cumpliendo en el caso de uso (el permiso va antes
   de leer nada).
4. **Esquema del borde permisivo.** `reviewedLineInputSchema` acepta cadenas crudas; la validez de
   negocio la decide la clasificación, para poder decir qué campo está mal.
5. **`Prisma.DbNull`** para un `measurements` ausente: `Prisma.JsonNull` escribe el JSON `null` y el
   CHECK lo rechaza.
6. **Tope de 1 MB** de la Server Action: cabe (ver T8); no se toca `next.config.ts`.
7. **Prefijo del texto de guion E2E**: `guion-e2e` (era `qc158-canned`), para no dejar un
   identificador de ficha en `lib/`.

## Abierto / para el humano

- Ajustar el borrador de **QC-131** (fuera de git) a la forma de `design.md > 3`: ocho datos más
  `page`. Nota fechada añadida en `specs/QC-129-…/requirements.md` (commit `058e2768`).
- **R37**: falta la pasada manual en un iPhone o Android real; solo hay E2E en WebKit.
- `new-presentation-units.tsx` usa el mismo `data-testid` para todas las opciones de unidad de un
  grupo, y el E2E usa `.first()`. Es menor y no bloquea.
- `db:rollback` elige la última migración por nombre de carpeta, no la última aplicada: tras un merge
  que trae migraciones posteriores sin aplicar, apunta a la equivocada (aquí falló limpio, dentro de
  una transacción). Deuda del arnés.
