# Fix: dos rojos heredados (D33 y packing-steps R8) — 2026-10-07

Rama `chore/rojos-sueltos-d33-packing`. Sin cambios de producción.

## A) D33 — `tests/integration/proveedores/catalog-line.int.test.ts`, R32 (QC-52)
- **Causa:** no hay validación previa ni la trajeron QC-209/QC-213 (adaptador intacto desde QC-158, Prisma 6.19.3 igual). Con Postgres en inglés (`lc_messages = en_US.utf8`: Docker local y `postgres:17` de CI) el `P2003` trae `meta.constraint` (sondeado: `supplier_catalog_lines_presentation_id_fkey`). El adaptador traduce entonces como pide `QC-52 design.md > 6.2`: presentación/unidad → `ValidationError` (`invalid_input`), autor → crudo. El test fijaba el comportamiento degradado de un Postgres en español (`constraint: null`).
- **No contradice ningún spec:** es justo lo que pedía 6.2. No se para.
- **Cambio:** el caso espía `prisma.supplierCatalogLine.create` sin alterar su comportamiento y exige: (1) se llamó, (2) la BASE rechazó con `P2003` y la restricción de esa columna (presentación: simple o compuesta con empresa de QC-59; unidad: `unit_id_fkey`), (3) `ValidationError`/`invalid_input`; el autor sale crudo, es el mismo error de la base y nombra `created_by`/`updated_by`; cero filas.
- **Muerde (rojo comprobado):** traducción a ciegas (`classify` → `catalog_reference` siempre); sin traducción; sin `unit_id_fkey`; sin las DOS FK de presentación. Sin solo una de las dos de presentación sigue verde (la otra rechaza; correcto).
- Pendiente menor: el comentario «HALLAZGO EMPIRICO» de `supplier-catalog-line-prisma.ts` quedó desfasado.

## B) `tests/unit/recetas-ui/recipe-form-packing-steps.test.tsx`, R8 (QC-211)
- **El 5 s:** es `asyncUtilTimeout = 5000` de `tests/setup.ts` (QC-80), no `testTimeout` (30 s en el archivo, ≥15 s por proyecto).
- **Lectura del log de CI (run 37708802533):** 5068 ms en el caso, ~100 ms el resto. La validación es síncrona y el clic va en `act`: el error no faltó por lentitud, el envío no tomó el camino del error. El volcado del DOM sale truncado; la causa exacta no se pudo ver ni reproducir.
- **Cambio (los dos casos de R8, por simetría):** el paso vacío se CARGA con la fórmula (`EMPTY_STEP`) en vez de pulsar «Añadir» —fuera del recorrido el clic y el editor TipTap que nace tras el montaje; añadir ya lo cubre el caso R7 de arriba—; se afirma el nº de filas antes de enviar y, tras el clic, primero `updateRecipeAction` no llamado y luego `getBy` síncrono. Si vuelve a fallar, falla al instante y dice por dónde. El caso de envasado ahora tiene paso del operador en el mismo índice 1. Sin tocar plazos: la guardia no se toca.
- **Muerde:** cruzando `errors` de las dos secciones en `recipe-form.tsx` los dos casos se ponen rojos en 181 ms.
- **Corridas:** 10/10 verdes (R8 65–95 ms). Bajo carga (24 bucles de CPU + 3 corridas en paralelo) 9/9 verdes, R8 hasta 1196 ms.

## Archivos
- `tests/integration/proveedores/catalog-line.int.test.ts`, `tests/unit/recetas-ui/recipe-form-packing-steps.test.tsx`
- `tests/baseline-rojos.json` (borradas las dos entradas; JSON válido, 8 entradas), `progress/deudas.md` (D33 resuelta)

## Verificación
- Los dos archivos: 2 archivos, 24 tests verdes. `vitest run guard`: 53/53 archivos, 717 verdes (una primera corrida dio 3 rojos por plazo con los bucles de carga aún vivos; aisladas y repetidas, verdes).
- `tsc --noEmit`: exit 0. `pnpm lint`: 0 errores, 8 warnings preexistentes ajenos; `eslint` de los dos archivos: sin issues.

Veredicto: los dos rojos arreglados sin tocar producción; baseline 10 → 8.
