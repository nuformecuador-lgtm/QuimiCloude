# Review — QC-171 recortes-con-url-publica (F2.2)

Fecha: 2026-10-01 · Rama: `feature/QC-171-recortes-con-url-publica` · Diff: `git diff origin/dev...HEAD` (60 archivos).
Grafo MCP: no usado (no cargado en esta sesion); exploracion con Grep/Read/git.

## Checklist

- [x] **Trazabilidad R1..R24 -> test.** Mapa en la bitacora (filas 337-351). Comprobado que cada test
  existe y aserta algo real: R4-R7 `crop-catalog-supabase.test.ts`; R2/R9/R10/R12 `preview-catalog-import.test.ts`;
  R13/R14/R16/R5 `tests/unit/proveedores/catalog-image-url.test.ts` + integracion; R15/R16/R24 tres tests de UI;
  R3 `catalog-line-sheet.test.tsx`; R8 barrido `image-url-screens.test.ts` (4 casos con aserto);
  R11 `catalog-import-review.test.tsx` («Cambiar» asigna y pinta `CROP_2.url` tal cual); R17 integracion;
  R18/R20/R21 `qc171-alcance.test.ts`; R19 `catalog-import-authorization` + `proveedores/authorization`;
  R22 `crop-catalog-memory` + composicion + E2E; R23 por diff (frontera vacia) y tests [D8] sin cambios.
- [x] **Tests dirigidos ejecutados por el reviewer:** 14 archivos, 138/138 verdes
  (documentos: crop-catalog-supabase, crop-catalog-memory, preview-catalog-import, qc171-alcance,
  catalog-import-authorization, crop-storage-config; proveedores: catalog-image-url, authorization;
  composition/proveedores-image-url; proveedores-ui: image-url-screens, showcase-line-card,
  catalog-columns, catalog-line-sheet, catalog-import-review).
- [x] **Gate completo:** medido por el leader en HEAD, verde (7 rojos en 5 archivos, todos en baseline). No repetido por memoria.
- [x] **Frontera [D8]:** ningun archivo `crop-catalog-images.ts`, `crop-pairing.ts`, `crop-storage-supabase.ts`,
  `crop-storage-memory.ts`, `crop-storage-config-env.ts`, `crop-coordinates.ts`, `crop-region.ts` ni sus tests en el diff.
- [x] **R22 enmendado:** `e2e/catalogo-desde-pdf.spec.ts` solo cambia en el paso 1 (comentario del paso + un
  `click` en `document-upload-open`), commit 8dbf0d9c; ninguna asercion ni otro paso tocado.
- [x] **Merge 450d0852 (`catalog-columns.tsx`):** se conserva `defaultPinned: 'left'` de dev; se quita el comentario
  «image_path esta vacia en todas las filas» (era falso tras esta ficha y citaba R30). Resolucion correcta.
- [x] **Baseline:** las dos entradas nuevas (`inventario/product-page`, `recetas-ui/recipe-page`) son ajenas
  (QC-171 no toca inventario ni recetas), con motivo, fecha y salida (QC-177). No son hallazgo.
- [x] **Commit 8b34d51e (`vi.stubEnv`):** solo tests; valores ficticios porque `getPublicUrl` compone sin red;
  ningun aserto compara con una URL fija ni se oculta un rojo de produccion. El caso «importar la composicion
  sin variables no lanza» sigue sin stub. Ver hallazgo M2 sobre el comportamiento real sin variables.
- [x] Calidad/seguridad: sin tablas nuevas, sin migraciones, sin webhooks, sin secretos; el error de R7 nombra
  variables sin valores. Capas: dominio de `proveedores` solo conoce el puerto `CatalogImageUrl`; la bifurcacion
  memoria/Supabase vive en `lib/composition`. Permiso antes de componer URL (R19).
- [x] Multiplataforma: la UI solo cambia el origen de `EntityImage` (`imagePath` -> `imageUrl`); nada nuevo de alto,
  hover, targets ni inputs.
- [x] Dependencias: `package.json` fuera del diff; `getPublicUrl` de `@supabase/storage-js` ya aprobada (R21 testeado).
- [x] Aislamiento por empresa: sin modelos nuevos; las consultas no cambian de filtro; la URL se deriva de la ruta
  (que ya lleva la empresa) despues de la lectura con `scope`. Nueva entrada en `tests/integration/aislamiento.json` justificada.
- [ ] **Comentarios de produccion** (`docs/conventions.md > Comentarios`): FALLA, ver B1.
- [ ] **Tasks todas `[x]`:** T7 y T8 en `[ ]`. Ver M1.

## Hallazgos

### BLOQUEANTE

- **B1 — Citas de ficha/requisito/design.md en comentarios AÑADIDOS por el diff en produccion.** Prohibido sin
  excepciones (`docs/conventions.md > Comentarios`). Lineas:
  - `lib/composition/index.ts` (bloque sobre `catalogImageUrl`): «QC-171 (`design.md > 4.3`)…».
  - `lib/modules/proveedores/domain/catalog-image-url.ts`: «…sin tocar el puerto (R16)…».
  - `lib/modules/proveedores/domain/catalog-line-view.ts` (`CatalogLineListItem`): «(`design.md > 4.2`)» y «(R3)».
  - `lib/modules/proveedores/domain/list-supplier-showcase.ts` (JSDoc ampliado): «…despues del puerto (R19)…».
  - `lib/modules/proveedores/domain/supplier-showcase.ts` (`ShowcaseLineRecord`): «(`design.md > 4.2`)».
  - `lib/modules/proveedores/ports/catalog-image-url.ts`: «(`design.md > 4.1`)» y «(R5)».
  Para cumplir: quitar las citas (dejar, si acaso, el porque en una frase). Solo comentarios; sin tocar codigo.

### menor

- **M1 — T7 sin marcar en `tasks.md`.** Sus criterios estan cumplidos (gate verde y E2E 1/1 medidos por el leader,
  mapa en bitacora, frontera [D8] vacia). Ademas su texto aun dice «`pnpm run e2e` … **sin modificar** el spec»,
  que contradice R22 enmendado (la linea «Hecho cuando» si esta enmendada). Marcar `[x]` y alinear la vineta.
  T8 es humana y el propio tasks.md declara que no bloquea el merge.
- **M2 — Sin `SUPABASE_*` de recortes la vitrina y la tabla del catalogo lanzan en vez de degradar al marcador.**
  `cropPublicUrl` -> `bucketApi()` -> `readCropStorageConfigFromEnv()` lanza si falta una variable; ese throw
  sube por `listSupplierShowcase` / `listShowcaseLines` / `listCatalogLines` y rompe la pantalla entera (antes de
  esta ficha esas dos pantallas no dependian de esa configuracion). Lo acota que `toImageUrl` no llama al puerto
  si la linea no tiene ruta, asi que solo afecta a entornos con lineas importadas y sin la configuracion — y
  importar ya exige esa configuracion (subida y listado de recortes). Es el comportamiento que el spec PIDE (R7:
  «fallar con un error que nombre las variables»); R24 solo cubre la imagen que no carga, no la configuracion
  ausente. No es un fallo enmascarado por los stubs de 8b34d51e. Riesgo real bajo, pero conviene que el humano
  sepa que un despliegue (p. ej. preview) con lineas importadas y sin esas tres variables pierde la vitrina, no
  solo las imagenes. Si se quiere degradacion, es cambio de spec, no de este review.
- **M3 — Orden de despliegue (T8).** Hasta que el humano pase el bucket a publico, la revision —que hoy se veia con
  enlace firmado— sale en marcador. Documentado en tasks.md T8 / design.md 9; se repite aqui para el PR.
- **M4 — Comentario de `ShowcaseLineRecord` afirma «Lo que el repositorio devuelve de verdad»**: correcto, pero
  ademas de la cita (B1) es algo largo para lo que dice el tipo. Sin accion obligatoria.

## Veredicto

**RECHAZADO** — unico bloqueante B1 (citas `QC-171`, `R<n>` y `design.md` en comentarios nuevos de produccion,
6 archivos). Funcionalmente la ficha cumple R1..R24 y los puntos pedidos (frontera [D8], R22, merge, stubEnv,
baseline) estan bien. Vuelve al implementer solo para limpiar esos comentarios (y marcar T7, M1); tras eso, OK.
