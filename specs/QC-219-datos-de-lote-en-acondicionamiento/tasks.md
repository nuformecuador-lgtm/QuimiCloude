# QC-219 — datos-de-lote-en-acondicionamiento · tasks.md

> Desglose de `design.md`. `[P]` = paralelizable con las demás `[P]` de su bloque, una vez cumplidas
> sus dependencias. Spec aprobado el 2026-10-09 con D13–D16: la pestaña «Entregados» (D13) entra
> entera (T10, T16).
>
> Comandos de una tanda: `pnpm run typecheck`, `pnpm run lint`,
> `pnpm exec vitest related --run <archivos>`, `pnpm exec vitest run guard`.

## Base de datos

- [ ] **T1 — Migración del día de producción** (backend). Depende de: nada.
  - Columna `productionDate` en `ProductBatch` de `db/schema.prisma`.
  - `db/migrations/20261009120000_product_batches_production_date/` con su `migration.sql` y su
    `down.sql` (design § 1.2).
  - El nombre, en `tests/guards/guard-identificador-de-request.test.ts`.
  - **Hecho:**
    - test estático de la migración: columna anulable, `CHECK`, `down` que la revierte;
    - `inventario-schema.test.ts` actualizado;
    - integración que aplica, comprueba que ninguna fila cambió y que la base rechaza producción sin
      vencimiento, y hace rollback (R24).

## `inventario`

- [ ] **T2 — Contrato `FinishedBatchLabels`** (backend). Depende de: nada. `[P]` con T1.
  - `domain/finished-batch-labels.ts` con los tipos de design § 2.1.
  - Exportar en `index.ts` el contrato, `typedLotSchema` y `civilDateSchema`, sacados de
    `product-batch-input.ts` sin cambiar su comportamiento.
  - **Hecho:**
    - typecheck verde;
    - los tests de `product-batch-input.test.ts` siguen verdes sin tocar ninguna aserción.

- [ ] **T3 — Adaptador y escritura** (backend). Depende de: T1, T2.
  - `writeFinishedBatchLabels` en `product-prisma.ts`.
  - `finished-batch-labels-prisma.ts` con `listOfOrder` y `writeForOrder` (design § 2.2).
  - **Hecho:** integración contra base real de:
    - escritura de las tres columnas sin tocar stock, coste, fecha de compra ni asientos (R6, R19);
    - `batch_not_found` para lote de otro pedido, de otra empresa o sin asiento `production` (R12);
    - choque con otro lote de la empresa y con un lote del mismo pedido, sin choque consigo mismo ni
      con otra empresa (R10);
    - dos escrituras simultáneas del mismo lote: una gana y la otra no escribe nada (R11);
    - `listOfOrder` con ámbito de empresa.

- [ ] **T4 — Guardias del inventario** (backend). Depende de: T3.
  - `guard-libro-de-inventario.test.ts` y `qc91-alcance.test.ts` admiten `writeFinishedBatchLabels`
    por su nombre, con nota fechada y la aserción «no escribe `stock`».
  - **Hecho:**
    - `pnpm exec vitest run guard` verde;
    - prueba por mutación: un `update` igual en otra función da rojo, y uno con `stock:` dentro de
      `writeFinishedBatchLabels` da rojo (R27).

## `asignaciones`: dominio

- [ ] **T5 — Errores y catálogo** (backend). Depende de: nada. `[P]` con T1–T2.
  - Tres códigos nuevos en `error-codes.ts` y `error-catalog.ts`.
  - Cinco clases en `asignaciones/domain/errors.ts`, con `batchId` de diagnóstico (design § 3.5).
  - **Hecho:**
    - typecheck verde;
    - los tests del catálogo verdes.

- [ ] **T6 — `conditioning-batch-data.ts`** (backend, puro). Depende de: T2. `[P]` con T3.
  - `missingBatchDataLines`, con la clave `presentationId`.
  - **Hecho:** unit:
    - línea sin lote, línea sin datos y línea con datos;
    - pedido sin líneas = 0 (R17).

- [ ] **T7 — Caso de uso de guardar** (backend). Depende de: T2, T5.
  - `save-conditioning-batch-data.ts` (design § 3.1).
  - **Hecho:** unit con puertos simulados, uno por regla:
    - permiso antes de todo (R13);
    - entrada inválida sin puertos (R7);
    - errores del pedido en su orden (R14);
    - vencimiento de hoy (R8);
    - producción de mañana (R9);
    - lote repetido en la entrada (R10);
    - traducción de `batch_not_found` y `duplicate_lot`;
    - éxito en `EN_ACONDICIONAMIENTO` y en `TERMINADO` (R18);
    - en `ENTREGADO` (D13).

- [ ] **T8 — Terminar exige los datos** (backend). Depende de: T5, T6.
  - `finish-conditioning.ts` gana `batches` (design § 3.2).
  - **Hecho:** unit:
    - faltan datos → `conditioning_batch_data_missing` sin llamar a la transición (R15);
    - orden de errores (R16);
    - el ajeno recibe `order_conditioning_taken` aunque falten datos.

    Integración: el pedido queda `EN_ACONDICIONAMIENTO`, sin `finishedAt` y con su equipo.

- [ ] **T9 — Detalle con `batchData`** (backend). Depende de: T6.
  - `get-conditioning-order.ts` y `conditioning-order-view.ts` (design § 3.3).
  - **Hecho:** unit:
    - `batchData` `null` en `POR_ACONDICIONAR` y para un acondicionador ajeno (R3);
    - con líneas y `missingCount` en `EN_ACONDICIONAMIENTO` y `TERMINADO`;
    - `ENTREGADO` propio sí, y el ajeno `order_not_found` (D13).

- [ ] **T10 — «Entregados» (D13)** (backend). Depende de: nada. `[P]` con T5–T9.
  - `list-delivered-conditioned-orders.ts` y la vista en `assignment-views.ts` (design § 3.4).
  - **Hecho:**
    - unit del listado: solo `ENTREGADO` propios, orden, permiso;
    - `assignment-views.test.ts` con las tres vistas (R20).

- [ ] **T11 — Composición** (backend). Depende de: T3, T7, T8, T9 (y T10).
  - `lib/composition/index.ts` cablea `createFinishedBatchLabels()` en guardar, terminar y detalle,
    más el listado de «Entregados».
  - **Hecho:**
    - `asignaciones-facade.test.ts` verde con las claves nuevas;
    - `acondicionamiento-rol.test.ts` con las rutas nuevas que nombran el permiso (R26).

## Server Action y pantalla

- [ ] **T12 — Server Action de guardar** (backend). Depende de: T11.
  - `saveConditioningBatchDataAction` en `order-conditioning-actions.ts` (design § 4).
  - **Hecho:** unit:
    - emparejado por posición y omisión de líneas vacías;
    - `revalidatePath` en el éxito;
    - `ErrorState` con `batchId` en el error.

- [ ] **T13 — Formulario «Datos de lote»** (frontend). Depende de: T12 (contra la action simulada
  puede empezar tras T9). `[P]` con T14.
  - `conditioning-batch-data-form.tsx` y su entrada en el barrel (design § 5.2).
  - **Hecho:** test de componente con:
    - bloques en orden;
    - campos rellenos o vacíos con «Lote provisional» (R2);
    - etiquetas, `text-base`, `min-h-11`, `type="date"` (R5);
    - error en `role="alert"` con `aria-invalid` en la línea culpable y lo escrito conservado (R5).

- [ ] **T14 — Pantalla y Terminar bloqueado** (frontend). Depende de: T9. `[P]` con T13.
  - `conditioning-order-screen.tsx`, `conditioning-actions.tsx` y `page.tsx`.
  - **Hecho:** tests de pantalla y página:
    - sección presente o ausente según R1 y R3;
    - aviso de líneas que faltan;
    - «Terminar» `disabled` mientras falten (R4);
    - `ENTREGADO` sin acciones y con su enlace de vuelta (R21).

- [ ] **T15 — Vencimiento en `/inventario`** (frontend). Depende de: nada. `[P]` con T13–T14.
  - `product-batches-panel.tsx` (design § 5.3).
  - **Hecho:** `product-batches-panel.test.tsx`: con vencimiento se pinta «Vencimiento», y sin él
    no se pinta (R22).

- [ ] **T16 — Pestaña «Entregados» (D13)** (frontend). Depende de: T10, T11.
  - `/asignacion/page.tsx`, la sección nueva, `conditioning-orders-href.ts` y el barrel.
  - **Hecho:** tests de la sección y de las pestañas: tres pestañas, vacío y enlace al detalle (R20).

## Verificación

- [ ] **T17 — E2E** (frontend). Depende de: T1–T16.
  - `e2e/datos-de-lote-en-acondicionamiento.spec.ts` (R28). Fixture con prisma:
    - un pedido `EN_ACONDICIONAMIENTO` del acondicionador 1, con dos líneas, sus dos lotes y sus
      asientos `production`;
    - un lote ajeno de la empresa con un código conocido, para el choque.

    «Hoy» y «mañana» se calculan en UTC (D16). Al final, el Administrador sembrado comprueba lote y
    vencimiento en `/inventario`.
  - **Hecho:**
    - `pnpm exec playwright test e2e/datos-de-lote-en-acondicionamiento.spec.ts` verde;
    - `e2e/acondicionamiento.spec.ts` y `e2e/acondicionar-con-equipo.spec.ts` verdes sin tocarlos
      (R29).

- [ ] **T18 — Cierre** (leader). Depende de: T17.
  - Mapa `R<n> → test` en `progress/impl_QC-219.md`.
  - `docs/architecture.md`, pregunta 2 del dominio, al día (design § 9).
  - `./init.sh` verde. Sin cambios en `package.json` (R30).
  - **Hecho:** cada R1–R30 tiene un test nombrado, y el gate local está verde.

## Archivos esperados

Producción:
- `db/schema.prisma`
- `db/migrations/20261009120000_product_batches_production_date/migration.sql`
- `db/migrations/20261009120000_product_batches_production_date/down.sql`
- `lib/modules/inventario/domain/finished-batch-labels.ts`
- `lib/modules/inventario/domain/product-batch-input.ts`
- `lib/modules/inventario/index.ts`
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
- `lib/modules/inventario/adapters/driven/persistence/finished-batch-labels-prisma.ts`
- `lib/modules/asignaciones/domain/conditioning-batch-data.ts`
- `lib/modules/asignaciones/domain/save-conditioning-batch-data.ts`
- `lib/modules/asignaciones/domain/finish-conditioning.ts`
- `lib/modules/asignaciones/domain/get-conditioning-order.ts`
- `lib/modules/asignaciones/domain/conditioning-order-view.ts`
- `lib/modules/asignaciones/domain/errors.ts`
- `lib/modules/asignaciones/domain/list-delivered-conditioned-orders.ts`
- `lib/modules/asignaciones/domain/assignment-views.ts`
- `lib/modules/asignaciones/index.ts`
- `lib/modules/asignaciones/adapters/driving/order-conditioning-actions.ts`
- `lib/modules/errores/domain/error-codes.ts`
- `lib/modules/errores/domain/error-catalog.ts`
- `lib/composition/index.ts`
- `lib/shared/routes.ts`
- `app/(private)/asignacion/acondicionamiento/[id]/page.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/index.ts`
- `app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-batch-data-form.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-order-screen.tsx`
- `app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-actions.tsx`
- `app/(private)/asignacion/page.tsx`
- `app/(private)/asignacion/components/index.ts`
- `app/(private)/asignacion/components/conditioning-orders-href.ts`
- `app/(private)/asignacion/components/delivered-conditioned-orders-list-section.tsx`
- `app/(private)/inventario/components/product-batches-panel.tsx`
- `docs/architecture.md`

Tests, guardias y E2E:
- `tests/unit/inventario/schema/product-batch-production-date-migration.test.ts`
- `tests/unit/inventario/schema/inventario-schema.test.ts`
- `tests/unit/inventario/product-batch-input.test.ts`
- `tests/unit/inventario/product-batches-panel.test.tsx`
- `tests/unit/inventario/qc91-alcance.test.ts`
- `tests/unit/asignaciones/conditioning-batch-data.test.ts`
- `tests/unit/asignaciones/save-conditioning-batch-data.test.ts`
- `tests/unit/asignaciones/finish-conditioning.test.ts`
- `tests/unit/asignaciones/get-conditioning-order.test.ts`
- `tests/unit/asignaciones/list-delivered-conditioned-orders.test.ts`
- `tests/unit/asignaciones/assignment-views.test.ts`
- `tests/unit/asignaciones/order-conditioning-actions.test.ts`
- `tests/unit/asignaciones/conditioning-doubles.ts`
- `tests/unit/asignaciones-ui/conditioning-batch-data-form.test.tsx`
- `tests/unit/asignaciones-ui/conditioning-order-screen.test.tsx`
- `tests/unit/asignaciones-ui/conditioning-order-page.test.tsx`
- `tests/unit/asignaciones-ui/delivered-conditioned-orders-list-section.test.tsx`
- `tests/unit/composition/asignaciones-facade.test.ts`
- `tests/unit/identity/roles/acondicionamiento-rol.test.ts`
- `tests/guards/guard-libro-de-inventario.test.ts`
- `tests/guards/guard-identificador-de-request.test.ts`
- `tests/integration/aislamiento.json`
- `tests/integration/inventario/finished-batch-labels.int.test.ts`
- `tests/integration/inventario/product-batch-production-date-migration.int.test.ts`
- `tests/integration/asignaciones/finish-conditioning-batch-data.int.test.ts`
- `e2e/datos-de-lote-en-acondicionamiento.spec.ts`
