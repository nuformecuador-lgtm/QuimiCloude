# review QC-169: permiso-de-la-confirmacion-del-catalogo

Revisor: `reviewer`, 2026-09-25. Worktree en HEAD `98c05f42`, con `origin/dev` ya mezclado; merge-base `d661e64b`.
He revisado el diff `origin/dev...HEAD` contra el spec aprobado (R1 a R13, P1 ratificada), `docs/` y `CHECKPOINTS.md`.
No he corrido la suite completa: el leader corre `./init.sh` en paralelo.

## Verificaciones ejecutadas por mí

- 7 unitarios de `documentos` (authorization, catalog-import-actions, catalog-import-authorization,
  confirm-catalog-import, preview-catalog-import, can-upload-documents, module-contract):
  `Test Files 7 passed (7)`, `Tests 103 passed (103)`.
- `pnpm exec vitest run tests/integration/documentos/catalog-import-isolation.int.test.ts --project=integration`:
  6 pasan, 0 fallan, 6 en total. La corrida usó una base efímera copiada de `qct_tpl_87988ea6377c`.
- `git diff origin/dev -- tests/integration/documentos/catalog-import-isolation.int.test.ts` sale
  vacío (0 líneas). `git diff d661e64b HEAD` sobre ese archivo también sale vacío.
- `node scripts/comparar-baseline-rojos.mjs <reporte de la corrida anterior>` da
  `sin rojos nuevos (1 archivos ejecutados, baseline vacio)` y exit 0. `tests/baseline-rojos.json`
  es JSON válido, tiene `"archivos": {}` y conserva `_nota`.
- Grep en `lib/modules/documentos`: el literal de `proveedores.modificar` y el de
  `documentos.modificar` aparecen solo en `domain/actor.ts`. `CATALOG_IMPORT_PERMISSION` solo lo
  usan `confirm-catalog-import.ts:107` y `preview-catalog-import.ts:246`, y en los dos casos es la
  primera sentencia del caso de uso. `DOCUMENT_UPLOAD_PERMISSION` sigue en `issue-upload-links.ts:72`,
  `enqueue-batch.ts:31` y `get-batch-status.ts:30`, sin cambios.
- El barrel `lib/modules/documentos/index.ts` exporta por nombre (`canUploadDocuments`,
  `requirePermission` y el tipo `Actor`). No tiene `export *` y no reexporta `CATALOG_IMPORT_PERMISSION`.
- La comprobación de `inventario.modificar` con `assertPermission` en
  `confirm-catalog-import.ts` sigue igual, dentro del `if (newPresentationNeeds.length > 0)`.
- Busqué `QC-<n>`, `R<n>`, `design.md` y «decisión cerrada» en las líneas `+` de `lib/`: ninguna
  coincidencia.
- Prueba de mutación: no la repetí para no tocar el árbol mientras corre el gate del leader. La
  razoné sobre los tests. Si el caso de uso volviera a exigir `DOCUMENT_UPLOAD_PERMISSION`, R3 y R8
  (actor con solo `documentos.modificar`) pasarían la comprobación y dejarían de lanzar
  `UnauthorizedError`, y R4, R9 y R33 (actor con solo `proveedores.modificar`) recibirían
  `UnauthorizedError`. Coincide con los 25 rojos de 34 que anota la bitácora.

## Checklist

### Trazabilidad (R -> test que muerde)
- [x] R1 y R2: `catalog-import-authorization.test.ts`, bloque «R31». La matriz de denegados (nulo,
  ausente, vacío, sin el permiso) exige `bitacora` vacía. El positivo comprueba que la primera
  entrada de la bitácora es `readFileForReview`. Ver el menor m1 sobre «antes de validar la entrada».
- [x] R3: el mismo archivo, caso nuevo. Con solo `documentos.modificar` da `UnauthorizedError` y
  `bitacora` queda vacía.
- [x] R4: caso nuevo con solo `CATALOG_IMPORT_PERMISSION` y sin presentación nueva. Afirma el
  resumen exacto. Lo refuerza R22 de la integración.
- [x] R5 y R6: bloque «R33». El actor base pasa a `proveedores.modificar` y no lleva
  `documentos.modificar`. En el rechazo no se crea nada ni se escribe nada, y sin presentación
  nueva la confirmación sale bien. No se ha relajado nada.
- [x] R7, R8 y R9: `preview-catalog-import.test.ts`. La matriz de denegados gana
  «solo `documentos.modificar`» y, para cada puerto, comprueba que no se llamó. R9 tiene su caso
  positivo explícito.
- [x] R10: `authorization.test.ts`, bloque nuevo. `issueUploadLinks`, `enqueueBatch` y
  `getBatchStatus` rechazan a un actor con solo `proveedores.modificar` sin llamar a ningún doble.
  El predicado queda cubierto por `can-upload-documents.test.ts` («con proveedores.modificar
  devuelve false»).
- [x] R11: `authorization.test.ts`, caso gemelo. El literal aparece en un solo fuente, que es
  `actor.ts`, y es distinto de `DOCUMENT_UPLOAD_PERMISSION`. El caso original de
  `documentos.modificar` sigue en pie.
- [x] R12: la integración da 6/6 y su diff sale vacío (lo verifiqué yo).
- [x] R13: la entrada ya no está y el comparador dice «baseline vacio» (lo verifiqué yo sobre
  una corrida parcial). Falta la confirmación final del gate completo del leader.

### Tasks
- [x] T1 a T6 marcadas.
- [ ] T7: `./init.sh --rapido` y `./init.sh` completo siguen sin marcar. Los corre el leader en
  paralelo. **Condición del OK** (ver el veredicto).

### Checkpoints
- [x] Especificación: los 3 archivos existen, los requisitos van en EARS y el design tiene 4
  alternativas descartadas.
- [x] Trazabilidad: el mapa R -> test está en `progress/impl_QC-169-permiso-de-la-confirmacion-del-catalogo.md`.
- [~] Calidad: typecheck, lint y tests. La bitácora da typecheck limpio, lint con 0 errores
  (7 warnings previos, fuera de las líneas tocadas) y `vitest related` con 201/201. Yo corrí los
  unitarios afectados y la integración. Falta el gate completo del leader.
- [x] E2E de flujo crítico: `e2e/catalogo-desde-pdf.spec.ts` ya recorre subida, revisión y
  confirmación con admin, y no se tocó. `docs/verification.md > Datos` pide que el rechazo se
  pruebe en el service, y eso ya lo cubren los unitarios. No hay UI nueva.
- [x] Multiplataforma: no aplica, porque no hay UI.
- [x] Dependencias: no se toca `package.json`.
- [x] Datos y seguridad: no hay tablas nuevas, migraciones ni webhooks. El permiso se valida en el
  SERVICE y tiene test. No hay secretos ni contexto hardcodeado.
- [x] Aislamiento por empresa: no cambia `db/schema.prisma` ni ninguna consulta. El aislamiento
  cruzado (R21, R22 y R34 de QC-158) vuelve a verde.
- [x] Módulos hexagonales: la constante vive en `domain/actor.ts` y usa solo el tipo del barrel de
  `identity`. No hay rutas profundas nuevas en producción.
- [x] Comentarios: el JSDoc nuevo explica el porqué y no cita fichas, requisitos ni design.
- [ ] Verificación final: `./init.sh` verde, entrada en `progress/history.md` y desmontar el
  worktree. Son pasos del leader después de esta revisión.

## Hallazgos

Bloqueantes: ninguno.

- **m1 (menor).** Ningún test hace cumplir la parte «antes de validar la entrada» de R1 y R7. Todos
  los denegados usan una entrada válida. Si alguien moviera el `safeParse` por delante de
  `requirePermission`, los tests seguirían en verde, porque la bitácora quedaría vacía igual. Hoy el
  código es correcto: `requirePermission` es la primera sentencia en los dos casos de uso. El orden
  viene de QC-158 y esta ficha no lo cambia. Arreglo propuesto: un caso por caso de uso con un
  actor denegado y una entrada basura (un objeto vacío) que espere `UnauthorizedError` y no
  `ValidationError`.
- **m2 (menor).** `module-contract.test.ts:276` comprueba que el barrel no reexporta
  `DOCUMENT_UPLOAD_PERMISSION`, pero no tiene un gemelo para `CATALOG_IMPORT_PERMISSION`, que el
  design 2.1 declara privado. Hoy se cumple porque el barrel exporta por nombre, pero ningún test
  lo protege.
- **m3 (menor).** El describe de `catalog-import-authorization.test.ts` sigue titulado «R31 — el
  permiso de documentos se exige primero». Ahora ese permiso es el de proveedores, así que el título
  confunde al leer un rojo. Es un archivo de test, no de producción.

## Veredicto

**OK**, condicionado a que el `./init.sh` completo que corre el leader (T7) salga en verde, con
«baseline vacio» y sin avisos «por limpiar». Hay 0 bloqueantes y 3 menores. Los menores no bloquean
y pueden ir a una ficha de seguimiento o a esta misma rama si el leader lo prefiere.
