# QC-80 — unidad-desde-la-presentacion · tasks.md

> Checklist de implementación. `[P]` = paralelizable con las tareas de su mismo bloque.
> Cada task dice **qué archivos toca**, su **criterio de hecho** y **qué requisitos cubre**.
> Cierre de tanda: `./init.sh --rapido`. Cierre de feature y antes del PR: `./init.sh` completo.

## Bloque 0 — desbloquear la rama

- [x] **T0 — retirar la guardia de alcance de QC-90 que prohíbe migraciones.** _(bloquea todo)_
  - Archivos: `tests/unit/inventario/schema/inventario-schema.test.ts`.
  - Se borran los **dos** casos de censo de migraciones del bloque `describe('QC-90 R29 …')` («el
    rango de la rama no agrega ningún archivo bajo db/migrations/» y «db/migrations/ no gana ninguna
    carpeta respecto del merge-base»), con sus ayudantes si quedan sin uso. **Se conserva** el caso
    «ProductBatch conserva las columnas que le dio 20260909120000_product_batches», que pasa a ser
    la guardia de **R25** y se renombra su `describe` a QC-80.
  - Hecho: el archivo ya no menciona `archivosAgregadosEnLaRama` ni `carpetasDeMigracionEn`, y
    `pnpm vitest run tests/unit/inventario/schema/inventario-schema.test.ts` pasa **con** la carpeta
    de migración nueva ya en disco (se re-verifica al cerrar T2).
  - Cubre: habilita R1-R8; conserva R25.

## Bloque 1 — base de datos

- [x] **T1 — migración `20260911120000_presentation_unit`.** _(dep: T0)_
  - Archivos nuevos: `db/migrations/20260911120000_presentation_unit/migration.sql` y `down.sql`.
  - Escrita a mano (`design.md > 2`), en este orden: `ADD COLUMN unit_id UUID` → `NO FORCE` de
    `presentations` **y** de `units` → bloque `DO $$` de relleno a `kilogramo` con `RAISE EXCEPTION`
    si la unidad no existe o si queda algún nulo → `ENABLE`+`FORCE` de las dos → `SET NOT NULL` →
    FK `presentations_unit_id_fkey` (RESTRICT/CASCADE) + índice `presentations_unit_id_idx` → drop
    de `products_unit_id_idx`, `products_unit_id_fkey` y `products.unit_id`.
  - `down.sql` revierte exactamente eso, en orden inverso.
  - Hecho: `pnpm run db:migrate` aplica sin error sobre la base local; una consulta comprueba
    **114** presentaciones con `unit_id` = id de `kilogramo` y **0** nulas; `pnpm run db:rollback`
    revierte y deja `_prisma_migrations` coherente; se vuelve a aplicar.
  - Cubre: R1, R2, R3, R4, R5, R6, R7, R8.

- [x] **T2 — `db/schema.prisma`.** _(dep: T1)_
  - Archivos: `db/schema.prisma`.
  - `Presentation` gana `unitId String @map("unit_id") @db.Uuid` y `@@index([unitId], map: "presentations_unit_id_idx")`,
    con el comentario `///` que declara **escalar sin `@relation`** y **FK drift**. `Product` pierde
    `unitId` y su `@@index`.
  - Hecho: `pnpm prisma generate` sin error y `pnpm run typecheck` señala exactamente los
    consumidores que T4-T10 arreglan (rojo esperado y acotado).
  - Cubre: R1, R7, R21.

- [x] **T3 — tests de esquema y migración.** _(dep: T1, T2)_ `[P]` con T4
  - Archivos: `tests/unit/inventario/schema/inventario-schema.test.ts` (amplía) y **nuevo**
    `tests/unit/inventario/schema/presentation-unit-migration.test.ts` (lee el SQL, patrón de
    `tests/unit/unidades/schema/unidades-migration.test.ts`).
  - Casos: la columna es NOT NULL y sin default (R1); la FK está y es `RESTRICT`/`CASCADE`, y **no**
    dice `SET NULL` (R2); el índice existe (R3); el relleno busca `kilogramo` por `name_normalized`
    y lleva su `RAISE EXCEPTION` (R4); el SQL **no contiene ningún `INSERT` ni `DELETE`** sobre
    `presentations` ni `units` (R5); suelta y restituye el `FORCE` de las **dos** tablas y no crea
    ninguna policy (R6); `products` pierde columna, índice y FK (R7); `down.sql` revierte cada
    sentencia (R8); `presentations` sigue sin `deleted_at` y con sus marcas en inglés (R9);
    `products` no recupera `presentation_id` (R25); `SupplierCatalogLine.unitId` sigue opcional y
    `product_batches` conserva sus columnas y sus dos CHECK (R26, R28).
  - Hecho: los casos pasan y cada uno cita su `R<n>` en el nombre.
  - Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R25, R26, R28.

## Bloque 2 — módulo `inventario`, presentación

- [x] **T4 — contrato de entrada y de salida.** _(dep: T2)_ `[P]` con T3
  - Archivos: `lib/modules/inventario/domain/presentation-input.ts`,
    `lib/modules/inventario/domain/presentation-view.ts`, `lib/modules/inventario/index.ts` (si el
    barrel necesita publicar `PresentationData`).
  - `unitId: z.string().uuid()` obligatorio en alta y edición; `PresentationView` gana `unitId`.
  - Hecho: `tests/unit/inventario/presentation-*.test.ts` cubren aceptar un uuid, rechazar ausencia,
    cadena vacía y no-uuid señalando `unitId`.
  - Cubre: R10, R15.

- [x] **T5 — puerto y adaptador Prisma.** _(dep: T4)_
  - Archivos: `lib/modules/inventario/ports/presentation-repository.ts`,
    `lib/modules/inventario/adapters/driven/persistence/presentation-prisma.ts`.
  - `PresentationData`; `create(data)` y `rename` → **`replace(id, data)`**; los dos devuelven
    además `'invalid_unit'`. `P2003` se traduce **por función**: `'in_use'` solo al borrar,
    `'invalid_unit'` al crear y al reemplazar. `presentationSelect` gana `unitId`. Se corrige el
    comentario que aún nombra `products_presentation_id_fkey` como la única FK hacia
    `presentations`.
  - Hecho: `tests/unit/inventario/presentation-prisma.test.ts` cubre el mapeo de fila a
    `PresentationView` con `unitId` y las dos traducciones de `P2003`.
  - Cubre: R11, R12, R13, R15.

- [x] **T6 — casos de uso.** _(dep: T5)_
  - Archivos: `lib/modules/inventario/domain/create-presentation.ts`,
    `lib/modules/inventario/domain/update-presentation.ts`.
  - `requirePermission` sigue siendo la **primera** línea; la unidad viaja al puerto junto al nombre
    y su forma normalizada; `'invalid_unit'` → `ValidationError`.
  - Hecho: `tests/unit/inventario/presentation-service.test.ts` cubre alta con unidad, edición que
    reemplaza la unidad, rechazo sin unidad, rechazo de unidad inexistente distinguible del
    duplicado, y actor sin permiso **sin una sola llamada al repositorio**.
  - Cubre: R10, R11, R12, R13, R14.

- [x] **T7 — composición y Server Action.** _(dep: T6)_
  - Archivos: `lib/composition/index.ts`,
    `lib/modules/inventario/adapters/driving/presentation-actions.ts`.
  - El candidato lee `unitId` del `FormData`; la action **no decide nada** más.
  - Hecho: `tests/unit/inventario/presentation-actions.test.ts` comprueba que el `unitId` del
    `FormData` llega al caso de uso tal cual y que el error vuelve como `{ code, message }`.
  - Cubre: R10, R11, R12.

## Bloque 3 — pantalla de presentaciones

- [x] **T8 — selector de unidad.** _(dep: T4)_ `[P]` con T5-T7
  - Archivo nuevo: `app/(private)/configuracion/presentaciones/components/presentation-unit-select.tsx`
    (+ export en `components/index.ts`).
  - No controlado, `name="unitId"`, sin opción «sin unidad», etiqueta `symbol ?? name`,
    `min-h-11 min-w-11` y `text-base md:text-base`.
  - Hecho: **nuevo** `tests/unit/configuracion-ui/presentation-unit-select.test.tsx`: pinta todas
    las unidades recibidas, **no** ofrece ninguna opción vacía, y el disparador cumple el objetivo
    táctil mínimo.
  - Cubre: R16, R17, R20.

- [x] **T9 — formulario, panel y sección.** _(dep: T7, T8)_
  - Archivos: `presentation-form.tsx`, `presentation-sheet.tsx`, `presentation-list-section.tsx`,
    `presentation-table.tsx`, `presentation-row-actions.tsx`, `presentation-list-empty.tsx`,
    `components/index.ts` (todos bajo `app/(private)/configuracion/presentaciones/`).
  - `units` se piden con `listUnitsAction()` en la sección, en `Promise.all` con el listado, y bajan
    por props; `PRESENTATION_BUSINESS_FIELDS` gana `unitId`; `PresentationSheetTarget` pasa a
    `Pick<PresentationView, 'id' | 'name' | 'unitId'>`; si las unidades fallan, se pinta el error y
    **no se monta ningún panel**.
  - Hecho: `tests/unit/configuracion-ui/presentation-sheet.test.tsx` y
    `tests/unit/configuracion-ui/presentation-page.test.tsx` cubren: el alta exige unidad y no envía
    sin ella pintando el error junto al campo (R17); la edición precarga la unidad de la
    presentación (R15); tras un rechazo del servidor el panel sigue abierto con nombre **y** unidad
    (R18); con el catálogo de unidades en error no hay disparador de alta ni de edición (R19).
  - Cubre: R15, R16, R17, R18, R19.

## Bloque 4 — el producto y la línea de receta

- [x] **T10 — quitar la unidad del producto.** _(dep: T2)_ `[P]` con el bloque 3
  - Archivos: `lib/modules/inventario/domain/product-input.ts`, `domain/product-view.ts`,
    `domain/product-catalog.ts`, `domain/product-queryable.ts`,
    `adapters/driven/persistence/product-prisma.ts`, `adapters/driven/persistence/product-catalog-prisma.ts`,
    `adapters/driving/product-actions.ts`,
    `app/(private)/inventario/components/product-columns.tsx`, `app/(private)/inventario/components/product-form.tsx`
    (solo comentarios que nombran la columna).
  - Hecho: `tests/unit/inventario/product-input.test.ts`, `product-actions.test.ts`,
    `product-catalog.test.ts`, `product-prisma.test.ts`, `product-page.test.tsx`,
    `list-query.test.ts` y `tests/guards/guard-contrato-listados.test.ts` en verde, con un caso
    explícito de que el alta **no** envía ni acepta `unitId` y de que el listado ya no lo ofrece
    como filtro.
  - Cubre: R21.

- [x] **T11 — la unidad derivada del lote más reciente.** _(dep: T10)_
  - Archivos: `lib/modules/inventario/domain/product-view.ts` (`latestBatchUnitId`),
    `adapters/driven/persistence/product-prisma.ts` (`LATEST_BATCH_UNIT`, `PRODUCT_SELECT`,
    `toProductView`), `app/(private)/produccion/formulas/components/product-picker.tsx` (mapeo y
    comentario).
  - Hecho: `tests/unit/inventario/product-prisma.test.ts` cubre `toProductView` con un lote
    (devuelve la unidad de su presentación), con varios (el más reciente gana, desempate por `id`
    descendente) y **sin ninguno** (`null`); el `orderBy`/`take: 1` del select se afirma como dato,
    no como texto.
  - Cubre: R22, R23.

- [x] **T12 — la línea de receta, sin cambiar ninguna regla.** _(dep: T11)_
  - Archivos: `app/(private)/produccion/formulas/components/recipe-lines-field.tsx` y
    `unit-group.ts` (**solo comentarios**: la lógica no cambia).
  - Hecho: `tests/unit/recetas-ui/recipe-line-unit-group.test.tsx` y
    `tests/unit/recetas-ui/recipe-form.test.tsx` cubren: ingrediente con unidad derivada → el
    selector ofrece solo su grupo y preselecciona la más pequeña salvo que la elegida ya sea del
    grupo (R24); ingrediente **sin lotes** → el selector ofrece el catálogo entero, queda
    habilitado y la receta se puede guardar (R23).
  - Cubre: R23, R24.

## Bloque 5 — integración y cierre

- [x] **T13 — integración contra la base.** _(dep: T9, T11)_
  - Archivos: **nuevo** `tests/integration/inventario/presentation-unit.int.test.ts`; amplía
    `tests/integration/inventario/inventario-constraints.int.test.ts` y
    `tests/integration/inventario/list-query-products.int.test.ts`.
  - Casos: un `INSERT` de presentación sin `unit_id` falla (R1); borrar una unidad referenciada
    falla con `23503` y la presentación sigue ahí (R2); el alta por el caso de uso con una unidad
    inexistente devuelve `invalid_input` y no escribe fila (R13); la edición reemplaza la unidad
    (R12); un producto con dos lotes de presentaciones distintas devuelve la unidad del más reciente
    y uno sin lotes devuelve `null` (R22, R23); ni el alta ni la edición de presentación escriben en
    `product_batches` (R28).
  - Hecho: `pnpm run test:int` en verde.
  - Cubre: R1, R2, R12, R13, R22, R23, R28.

- [x] **T14 — trazabilidad y gate.** _(dep: todas)_
  - Archivos: `progress/impl_QC-80-unidad-desde-la-presentacion.md`, `progress/current.md`.
  - El mapa `R1…R28 -> archivo::caso de test` queda escrito, con **los 28 requisitos presentes** y
    ninguno sin test (`CHECKPOINTS.md > Trazabilidad`).
  - Hecho: `./init.sh` completo en verde y el mapa revisado contra este archivo.
  - Cubre: la regla 4 de `CLAUDE.md`.

## Mapa rápido requisito → test

| Requisitos | Dónde se prueban |
|---|---|
| R1-R9, R25, R26, R28 | `tests/unit/inventario/schema/inventario-schema.test.ts`, `tests/unit/inventario/schema/presentation-unit-migration.test.ts` |
| R1, R2, R12, R13, R22, R23, R28 | `tests/integration/inventario/presentation-unit.int.test.ts`, `inventario-constraints.int.test.ts`, `list-query-products.int.test.ts` |
| R10, R11, R12, R13, R14 | `tests/unit/inventario/presentation-service.test.ts`, `presentation-input` (en `presentation-name.test.ts`/nuevo), `presentation-prisma.test.ts`, `presentation-actions.test.ts` |
| R15-R19 | `tests/unit/configuracion-ui/presentation-sheet.test.tsx`, `presentation-page.test.tsx` |
| R16, R17, R20 | `tests/unit/configuracion-ui/presentation-unit-select.test.tsx` |
| R21 | `tests/unit/inventario/product-input.test.ts`, `product-actions.test.ts`, `product-catalog.test.ts`, `product-page.test.tsx`, `tests/guards/guard-contrato-listados.test.ts` |
| R22, R23 | `tests/unit/inventario/product-prisma.test.ts` |
| R23, R24 | `tests/unit/recetas-ui/recipe-line-unit-group.test.tsx`, `recipe-form.test.tsx` |
