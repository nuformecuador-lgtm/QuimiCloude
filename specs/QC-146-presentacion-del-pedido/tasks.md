# QC-146 — presentacion-del-pedido · tasks.md

> Desglose de `design.md`. Cada task lista los **archivos que toca** (el leader los usa para validar
> la intersección con QC-121 y QC-147), su criterio de «hecho» y sus dependencias. `[P]` = puede ir
> en paralelo con las que se indican. Un commit por task (`docs/conventions.md > Commits`).
>
> **Aviso de cabecera.** T3 hace `presentationId` obligatorio en `NewOrder` y en el esquema de alta:
> desde ese commit, todo test que construya una alta o una edición sin presentación deja de
> compilar o de pasar. Los fixtures se arreglan **en la misma task que los rompe**, no después.
> Cierre de tanda con `./init.sh --rapido`; cierre de ficha con `./init.sh` completo.

---

## Bloque 1 — base y contrato (paralelizable)

- [x] **T1. [P con T2] Migración y esquema: `orders.presentation_id` con FK compuesta.**
      (`design.md > 1`; R1–R5.)
      - Archivos: `db/schema.prisma` (modelo `Order`: `presentationId String?`, `@@index`, una línea
        en el comentario del modelo sobre la FK nueva, que es drift),
        `db/migrations/<ts>_orders_presentation/migration.sql` y `down.sql` (nuevos; `<ts>` mayor
        que el último de `db/migrations/` en el momento de crearla, propuesta `20260922120000`).
      - Tests: `tests/unit/pedidos/schema/orders-presentation-migration.test.ts` (nuevo: anulable,
        sin `DEFAULT`, sin `UPDATE`, FK compuesta `(company_id, presentation_id)` con `RESTRICT`,
        índice, `down.sql` revierte los tres objetos; R2, R5);
        `tests/integration/pedidos/pedidos-constraints.int.test.ts` (nuevo `describe` «la
        presentación del pedido»: R1, R2, R3, R4). Si algún test estático de `tests/unit/pedidos/schema/`
        enumera las columnas de `Order`, se actualiza con su porqué.
      - Proceso: escribir a mano → `pnpm run db:migrate` → `pnpm run db:rollback` →
        `pnpm run db:migrate`; `_prisma_migrations` coherente. Si `migrate dev` generara algún
        `DROP CONSTRAINT` de FK escritas a mano, se borra (aviso del comentario del modelo).
      - **Hecho**: migración aplicada, revertida y reaplicada; los tests de arriba en verde.
      - Depende de: nada.

- [x] **T2. [P con T1] Contrato `PresentationCatalog` de `inventario`.** (`design.md > 2`; R28.)
      - Archivos: `lib/modules/inventario/domain/presentation-catalog.ts` (nuevo),
        `lib/modules/inventario/index.ts` (una línea de `export type`),
        `lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma.ts` (nuevo).
      - Tests: `tests/unit/inventario/presentation-catalog.test.ts` (nuevo: ámbito compuesto con
        `presentationCompanyScope` en `AND` aparte; ids vacíos → `[]` sin consultar; R28);
        `tests/integration/inventario/company-scope-queries.int.test.ts` (caso R28: una
        presentación de B no vuelve pidiéndola desde A). Si `tests/unit/inventario/` tiene un test
        del contrato del barrel que enumere exportaciones, se actualiza.
      - **Hecho**: `guard-ambito-empresa-inventario` y `guard-arquitectura-modulos` en verde; tests
        de arriba en verde.
      - Depende de: nada.

## Bloque 2 — `pedidos`

- [x] **T3. Dominio de `pedidos`: entrada, tipos, error y casos de uso.** (`design.md > 3.1`–`> 3.4`;
      R6–R13, R21–R23, R27.)
      - Archivos: `lib/modules/pedidos/domain/order-input.ts`, `order-view.ts`, `errors.ts`,
        `create-order.ts`, `update-order.ts`, `get-order.ts`, `list-orders.ts`,
        `order-catalog.ts` (`AssignedOrderSummary.presentationId`), `lib/modules/pedidos/index.ts`
        (exporta `PresentationNotFoundError`).
      - **No** toca: `resolve-ingredients-cost.ts`, `order-cost.ts`, `cancel-order.ts`,
        `delete-order.ts`, `order-queryable.ts`.
      - Tests (nuevos casos y fixtures arreglados en el mismo commit):
        `tests/unit/pedidos/order-input.test.ts` (R6, R7), `create-order.test.ts` (R6, R8, R13),
        `update-order.test.ts` (R7–R10), `cancel-order.test.ts` y `delete-order.test.ts` (R11),
        `authorization.test.ts` (R12), `company-isolation-service.test.ts` (R8),
        `list-orders.test.ts` (R21, R22; el conteo de invocaciones se reescribe con su porqué),
        `order-service.test.ts` (R23), `order-catalog.test.ts` (R27), `order-view.test.ts` y
        `module-contract.test.ts` si enumeran campos o exportaciones. Todo doble de deps de
        `createCreateOrder`/`createUpdateOrder`/`createGetOrder`/`createListOrders` gana
        `presentations`.
      - **Hecho**: `pnpm run typecheck` del módulo en verde (los adaptadores pueden no compilar hasta
        T4 si el tipo `NewOrder` lo exige: se hace T4 en la misma tanda); tests de arriba en verde.
      - Depende de: T2 (tipo `PresentationCatalog`).

- [x] **T4. Adaptadores driven de `pedidos`.** (`design.md > 3.5`; R1, R5, R9, R14, R27.)
      - Archivos: `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`
        (`ORDER_SELECT`, `toOrderRow`, `INSERT` del alta, `updateAliveOrder`),
        `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts` (`select` y mapeo
        del resumen).
      - Tests: `tests/integration/pedidos/order-crud.int.test.ts` (R5, R9, R14),
        `tests/integration/pedidos/order-repository.int.test.ts` (R27); fixtures de alta/edición de
        `tests/integration/pedidos/company-scope.int.test.ts`, `company-scope-queries.int.test.ts`,
        `order-ingredients-cost.int.test.ts`, `order-sequence*.int.test.ts` y
        `order-duplicate-number.int.test.ts` ganan una presentación sembrada de su empresa donde
        pasen por `NewOrder`; `tests/unit/pedidos/order-prisma-errors.test.ts` si enumera columnas.
      - **Hecho**: integración de `pedidos/` entera en verde; `guard-ambito-empresa-pedidos` en
        verde (el `scope` sigue al final de cada firma).
      - Depende de: T1, T3.

## Bloque 3 — `asignaciones` y composición

- [x] **T5. [P con T4] Dominio de `asignaciones`.** (`design.md > 5`; R24–R27.)
      - Archivos: `lib/modules/asignaciones/domain/assigned-order-view.ts`,
        `assigned-order-execution-view.ts`, `list-assigned-orders.ts`,
        `get-assigned-order-execution.ts`.
      - Tests: `tests/unit/asignaciones/list-assigned-orders.test.ts` (R24, R26),
        `get-assigned-order-execution.test.ts` (R25), `authorization.test.ts` (dobles con
        `presentations`); `tests/integration/asignaciones/use-case-fixture.ts` si construye estos
        casos de uso.
      - **Cuidado de integración**: `get-assigned-order-execution.ts` y
        `assigned-order-execution-view.ts` los toca también QC-147. Añadir el campo y la llamada
        como bloque aislado, sin reordenar lo existente.
      - **Hecho**: tests de arriba en verde.
      - Depende de: T2, T3 (`AssignedOrderSummary.presentationId`).

- [x] **T6. Composición y Server Action.** (`design.md > 3.1`, `> 7`.)
      - Archivos: `lib/composition/index.ts` (construye `presentationCatalog` y lo pasa a los seis
        casos de uso), `lib/modules/pedidos/adapters/driving/order-actions.ts`
        (`buildCreateCandidate` lee `presentationId`).
      - Tests: `tests/unit/pedidos/order-actions.test.ts` (el candidato lleva `presentationId`; la
        edición lo hereda; `presentation_not_found` se traduce con su código).
      - **Hecho**: `pnpm run typecheck` y `pnpm run lint` del repo en verde; `./init.sh --rapido` en
        verde.
      - Depende de: T2, T3, T4, T5.

## Bloque 4 — UI (paralelizable)

- [x] **T7. [P con T8] Marca compartida «Sin presentación».** (`design.md > 6.2`.)
      - Archivos: `components/shared/order-presentation-label.tsx` (nuevo).
      - Tests: `tests/unit/shared/order-presentation-label.test.tsx` (nuevo: nombre, y «Sin
        presentación» con `data-missing` cuando es `null`).
      - **Hecho**: test en verde.
      - Depende de: nada.

- [x] **T8. Pantalla `/pedidos`: panel y listado.** (`design.md > 6.1`, `> 6.3`; R16–R21.)
      - Archivos: `app/(private)/pedidos/components/order-form.tsx`, `order-columns.tsx`,
        `order-list-skeleton.tsx` (9 → 10), `index.ts` si hay que reexportar algo. `order-sheet.tsx`
        solo si no pasa ya `order` entero al formulario (verificar; no se espera cambio).
      - **No** toca `components/shared/presentation-select.tsx`.
      - Tests: `tests/unit/pedidos-ui/order-form.test.tsx` (R16–R19; mock de
        `listPresentationsAction` como en `tests/unit/shared/presentation-select-helper.test.tsx`),
        `order-columns.test.tsx` (R20, R21), `order-list-skeleton.test.tsx` (10),
        `order-sheet.test.tsx`, `order-row-wiring.test.tsx`, `read-only.test.tsx` y
        `a11y-tactil.test.tsx` si sus fixtures de `OrderSummary` o sus conteos de columnas lo exigen.
      - **Hecho**: tests de `tests/unit/pedidos-ui/` en verde; revisión multiplataforma de
        `design.md > 6.5` hecha (selector ≥ 44 px, 16 px).
      - Depende de: T3 (tipos), T6 (action), T7.

- [x] **T9. [P con T8] Pantallas `/asignacion`: lista y ejecución.** (`design.md > 6.4`; R24–R26.)
      - Archivos: `app/(private)/asignacion/components/assigned-orders-columns.tsx`,
        `assigned-orders-skeleton.tsx` (7 → 8),
        `app/(private)/asignacion/[id]/components/order-execution-screen.tsx`.
      - **Cuidado de integración**: `order-execution-screen.tsx` lo toca QC-147 (retira el banner de
        escala). La línea de presentación va como bloque propio después del nombre de la receta, sin
        mover nada.
      - Tests: `tests/unit/asignaciones-ui/assigned-orders-columns.test.tsx` (R24),
        `assigned-orders-states.test.tsx` si cuenta columnas del esqueleto,
        `order-execution-screen.test.tsx` y `order-execution-page.test.tsx` (R25, R26).
      - **Hecho**: tests de `tests/unit/asignaciones-ui/` en verde.
      - Depende de: T5, T7.

## Bloque 5 — E2E, alcance y cierre

- [x] **T10. E2E: el recorrido de pedidos elige presentación.** (`design.md > 8`; R29.)
      - Archivos: `e2e/pedidos.spec.ts` (siembra una presentación de la empresa del test, la elige
        en el panel, afirma la celda y la fila de la base; limpia pedidos antes que la
        presentación), `e2e/aislamiento-pedidos.spec.ts` (siembra y elige una presentación de A
        para que su alta por la UI siga funcionando; sin afirmaciones nuevas).
      - **Hecho**: `pnpm run e2e` de esos dos archivos en verde.
      - Depende de: T8.

- [x] **T11. Alcance, trazabilidad y gate.** (R13, R15, R30; `CHECKPOINTS.md`.)
      - Archivos: `tests/unit/pedidos/qc146-alcance.test.ts` (nuevo: el costo no nombra la
        presentación, R13; ningún permiso nuevo y el Operador conserva sus dos, R15;
        `package.json` sin dependencias nuevas, R30), `progress/impl_QC-146-presentacion-del-pedido.md`
        (mapa `R1`–`R30` → test, copiado y verificado contra `design.md > 10`).
      - **Hecho**: `./init.sh` **completo** en verde; cada `R<n>` con al menos un test que existe y
        pasa.
      - Depende de: T1–T10.

---

## Resumen de dependencias

```
T1 ─┐
    ├─ T4 ─┐
T2 ─┼─ T3 ─┤
    │      ├─ T6 ─┐
    └─ T5 ─┘      ├─ T8 ─ T10 ─┐
T7 ───────────────┤            ├─ T11
                  └─ T9 ───────┘
```

`[P]`: T1 ∥ T2 · T4 ∥ T5 · T7 ∥ cualquiera · T8 ∥ T9.
