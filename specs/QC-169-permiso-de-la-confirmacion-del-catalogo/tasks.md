# QC-169 — permiso-de-la-confirmacion-del-catalogo · tasks.md

> Orden: T1 → (T2 [P] T3) → T4 → T5 [P] T6 → T7. Ningún paso toca
> `tests/integration/documentos/catalog-import-isolation.int.test.ts` (D3).

### T1 — Constante del permiso de importación
- [ ] `CATALOG_IMPORT_PERMISSION: PermissionCode = 'proveedores.modificar'` en
  `lib/modules/documentos/domain/actor.ts`, con JSDoc (design 2.1). No va al barrel.
- **Hecho cuando:** `pnpm run typecheck` pasa y `DOCUMENT_UPLOAD_PERMISSION` sigue valiendo
  `'documentos.modificar'`.
- **Depende de:** —

### T2 [P] — La confirmación exige el permiso de importación
- [ ] `confirm-catalog-import.ts:107` pasa a usar `requirePermission(actor, CATALOG_IMPORT_PERMISSION)`.
  La línea 177 (`inventario.modificar`) queda intacta.
- [ ] `tests/unit/documentos/catalog-import-authorization.test.ts`: el actor positivo y el de R33
  pasan a `proveedores.modificar`. Se añaden dos casos: «solo `documentos.modificar`» debe dar
  unauthorized con la bitácora vacía (R3), y «solo `proveedores.modificar`» debe devolver el resumen
  (R4).
- [ ] `tests/unit/documentos/confirm-catalog-import.test.ts:24`: el actor base pasa a
  `['proveedores.modificar', 'inventario.modificar']`.
- **Hecho cuando:** los dos archivos están en verde y cubren R1 a R6. Además, al mutar la
  constante de vuelta a `DOCUMENT_UPLOAD_PERMISSION`, los casos de R3 y R4 se ponen en rojo.
- **Depende de:** T1

### T3 [P] — La vista previa exige el permiso de importación (P1)
- [ ] `preview-catalog-import.ts:246` pasa a usar `requirePermission(actor, CATALOG_IMPORT_PERMISSION)`.
- [ ] `tests/unit/documentos/preview-catalog-import.test.ts`: el actor base (línea 25) pasa a
  `proveedores.modificar`. En el bloque de autorización se añade el denegado «solo
  `documentos.modificar`» (R8) y un caso explícito de R9.
- **Hecho cuando:** el archivo está en verde y cubre R7 a R9, con la misma prueba de mutación que
  en T2.
- **Depende de:** T1

### T4 — La subida no cambia y el literal se escribe una sola vez
- [ ] `tests/unit/documentos/authorization.test.ts`: un caso gemelo de «R4 — el codigo del permiso
  se escribe UNA sola vez», aplicado a `CATALOG_IMPORT_PERMISSION`. Debe afirmar que aparece en un
  solo fuente (`actor.ts`) y que es distinto de `DOCUMENT_UPLOAD_PERMISSION` (R11).
- [ ] Un caso con un actor que solo tiene `proveedores.modificar`: debe recibir unauthorized en
  `issueUploadLinks`, `enqueueBatch` y `getBatchStatus` (R10).
- [ ] `tests/unit/documentos/catalog-import-actions.test.ts:58,66`: el actor pasa a
  `proveedores.modificar`. Es solo coherencia (P2).
- **Hecho cuando:** los tres archivos están en verde.
- **Depende de:** T2, T3

### T5 [P] — Baseline limpio
- [ ] Borrar de `tests/baseline-rojos.json` la clave
  `tests/integration/documentos/catalog-import-isolation.int.test.ts`. Queda `"archivos": {}` y la
  clave `_nota` se conserva (R13).
- **Hecho cuando:** el JSON es válido y no contiene esa ruta.
- **Depende de:** T2, T3

### T6 [P] — El rojo de dev en verde, sin tocar el test
- [ ] Correr `pnpm exec vitest run tests/integration/documentos/catalog-import-isolation.int.test.ts --project=integration`.
- [ ] Comprobar que `git diff dev -- tests/integration/documentos/catalog-import-isolation.int.test.ts`
  sale vacío (R12).
- **Hecho cuando:** la corrida da 6/6 y el diff sale vacío. Las dos salidas se pegan en
  `progress/impl_QC-169-permiso-de-la-confirmacion-del-catalogo.md`.
- **Depende de:** T2, T3

### T7 — Gate y trazabilidad
- [ ] `./init.sh --rapido` para cerrar la tanda.
- [ ] `./init.sh` completo antes del PR. El comparador debe decir «sin rojos nuevos … baseline
  vacio» y no mostrar ningún aviso «por limpiar».
- [ ] Mapa `R1..R13 -> test` en `progress/impl_QC-169-...md` (design 2.4).
- **Hecho cuando:** el gate completo está en verde y el mapa está completo.
- **Depende de:** T4, T5, T6
