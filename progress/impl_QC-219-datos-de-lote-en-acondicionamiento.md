# QC-219 · datos-de-lote-en-acondicionamiento · bitácora de implementación

Rama `feature/QC-219-datos-de-lote-en-acondicionamiento`, 2026-10-09. T1–T17 hechas; T18 es del leader.

## Commits por tanda

| Tanda | Commit | Qué | ¿Compila aislado? |
|---|---|---|---|
| T15 | `f96911a8` | vencimiento en el panel de lotes de `/inventario` | sí |
| T1–T5 (no compartido) | `817806a4` | migración, contrato `FinishedBatchLabels`, adaptador, `typedLotSchema`/`civilDateSchema`, 5 clases de error | **no**: faltan schema, `inventario/index.ts`, `product-prisma.ts` y catálogo |
| T6–T12 (no compartido) | `65577195` | guardar, Terminar exige datos, detalle con `batchData`, «Entregados», action, seed-demo | **no**: falta lo compartido y la composición |
| T13, T14, T16 | `d2b0b73e` | formulario, Terminar bloqueado, detalle de `ENTREGADO`, pestaña «Entregados» | **no** (igual que arriba) |
| compartido QC-223 | `7a049e55` | `db/schema.prisma`, `inventario-schema.test.ts`, migración en `MIGRACIONES_ESPERADAS` | **no** |
| compartido QC-223 | `8a43e0ac` | `error-codes.ts`, `error-catalog.ts` | **no** |
| compartido QC-223 | `e773a19f` | `inventario/index.ts`, `product-prisma.ts` (`writeFinishedBatchLabels`), `guard-libro-de-inventario`, `qc91-alcance` | **no**: falta la composición |
| compartido QC-223 | `ae93047b` | `lib/composition/index.ts`, `tests/integration/aislamiento.json` | **sí**: desde aquí el árbol compila |
| T17 | `46236c42` | `e2e/datos-de-lote-en-acondicionamiento.spec.ts` | sí |
| listas cerradas | `aa8fdc14` | E2E nuevo en `data-table-alcance` | sí |
| compartido QC-223 | `a1ac1073` | E2E nuevo en `E2E_ESPERADOS` | sí |

En los archivos compartidos con QC-223 solo hay añadidos, salvo:
- `guard-libro-de-inventario.test.ts`: `CENSO_ESPERADO` une `CAMINOS_ESPERADOS` y `CAMINOS_SIN_ASIENTO`, y cambia el título del caso del censo (2 líneas);
- `qc91-alcance.test.ts`: el caso R21 admite `update` en `adjustBatchStock` y en `writeFinishedBatchLabels` (2 líneas);
- `aislamiento.json`: el `}` previo pasa a `},`.

## Archivos fuera de «Archivos esperados»

| Archivo | Motivo |
|---|---|
| `tests/unit/errores/catalogo.test.ts` | cuenta literal de códigos: 76 → 79 |
| `tests/unit/errores/conditioning-batch-data-codes.test.ts` (nuevo) | códigos y `batchId` de las 5 clases, aparte para no tocar los imports de `catalogo.test.ts` |
| `tests/unit/inventario/qc121-alcance.test.ts` | exige recalcular `products.stock` en toda escritura de lote; `writeFinishedBatchLabels` entra como excepción nombrada con nota fechada |
| `tests/unit/asignaciones/acondicionamiento-authorization.test.ts` | R2 de QC-217 pasa a 3 vistas |
| `tests/integration/asignaciones/finished-orders.int.test.ts` | termina un pedido con línea pero sin lote; se le da un doble de `listOfOrder` con datos |
| `tests/unit/asignaciones-ui/asignacion-page.test.tsx` | lista de vistas esperada pasa a 3 |
| `app/(private)/asignacion/components/assignment-view-tabs.tsx` | el tipo de vistas es exhaustivo: etiqueta y testid de «Entregados» |
| `app/(private)/asignacion/components/conditioned-orders-table.tsx` | prop opcional `view` (por defecto `acondicionados`) para que la paginación de «Entregados» no caiga en «Terminados» |
| `scripts/seed-demo/gateway.ts` | Terminar exige datos: antes de terminar guarda lote `DEMO-PT-<provisional>`, producción = hoy UTC, vencimiento = hoy + 2 años, solo en líneas sin datos |
| `tests/unit/shared/data-table-alcance.test.ts` | lista cerrada de E2E que referencian `data-table`: 32 → 33 |

Archivos esperados no tocados: `lib/shared/routes.ts` (no hizo falta).

## Mapa R → test

| R | Test |
|---|---|
| R1 | `asignaciones-ui/conditioning-batch-data-form.test.tsx` «R1: …»; `conditioning-order-screen.test.tsx` «R1 R18 R21: …»; `asignaciones/get-conditioning-order.test.ts` bloque «los datos de lote del detalle» |
| R2 | `conditioning-batch-data-form.test.tsx` «R2: una línea con datos…», «R2: una línea sin datos…» |
| R3 | `conditioning-order-screen.test.tsx` «R3: …» (2); `get-conditioning-order.test.ts` |
| R4 | `conditioning-order-screen.test.tsx` «R4: …» (3); `conditioning-order-page.test.tsx` «R4: …» (2); `conditioning-batch-data.test.ts` |
| R5 | `conditioning-batch-data-form.test.tsx` «R5: …» (4); `order-conditioning-actions.test.ts` (`batchId` en el error); `errores/conditioning-batch-data-codes.test.ts` |
| R6 | `integration/inventario/finished-batch-labels.int.test.ts`; `save-conditioning-batch-data.test.ts` |
| R7 | `save-conditioning-batch-data.test.ts`; `order-conditioning-actions.test.ts` (omisión de líneas vacías) |
| R8 | `save-conditioning-batch-data.test.ts`; E2E paso «R8 - …» |
| R9 | `save-conditioning-batch-data.test.ts`; E2E paso «R9 - …» |
| R10 | `finished-batch-labels.int.test.ts` (otro pedido, mismo pedido, intercambio, sin choque consigo ni con otra empresa); `save-conditioning-batch-data.test.ts`; E2E paso «R10 - …» |
| R11 | `finished-batch-labels.int.test.ts` (carrera con `Promise.all` y determinista con `pg.Client`); traducción en `save-conditioning-batch-data.test.ts` |
| R12 | `finished-batch-labels.int.test.ts` (otro pedido, otra empresa, sin asiento `production`, inexistente); `save-conditioning-batch-data.test.ts` |
| R13 | `save-conditioning-batch-data.test.ts` |
| R14 | `save-conditioning-batch-data.test.ts` |
| R15 | `finish-conditioning.test.ts`; `conditioning-batch-data.test.ts`; `integration/asignaciones/finish-conditioning-batch-data.int.test.ts` |
| R16 | `finish-conditioning.test.ts`; `finish-conditioning-batch-data.int.test.ts` |
| R17 | `conditioning-batch-data.test.ts`; `finish-conditioning.test.ts`; `finish-conditioning-batch-data.int.test.ts` |
| R18 | `save-conditioning-batch-data.test.ts`; `conditioning-order-page.test.tsx` «R18: …»; `finish-conditioning-batch-data.int.test.ts` |
| R19 | `finished-batch-labels.int.test.ts` (el registro del lote sigue siendo el mismo) |
| R20 | `assignment-views.test.ts`; `list-delivered-conditioned-orders.test.ts`; `delivered-conditioned-orders-list-section.test.tsx` (5); `asignacion-page.test.tsx` (4) |
| R21 | `conditioning-order-screen.test.tsx` «R21: …»; `conditioning-order-page.test.tsx` «R21: …» (2); `get-conditioning-order.test.ts` |
| R22 | `inventario/product-batches-panel.test.tsx` «R22 — …» (2); E2E paso «R22 - …» |
| R23 | `inventario/schema/inventario-schema.test.ts` |
| R24 | `inventario/schema/product-batch-production-date-migration.test.ts`; `integration/inventario/product-batch-production-date-migration.int.test.ts`; `inventario-schema.test.ts` |
| R25 | `finish-conditioning-batch-data.int.test.ts` |
| R26 | `identity/roles/acondicionamiento-rol.test.ts`; `composition/asignaciones-facade.test.ts`; `list-delivered-conditioned-orders.test.ts` |
| R27 | `guards/guard-libro-de-inventario.test.ts` y `inventario/qc91-alcance.test.ts` (bloques nuevos con mutación); `inventario/qc121-alcance.test.ts` |
| R28 | `e2e/datos-de-lote-en-acondicionamiento.spec.ts` |
| R29 | `e2e/acondicionar-con-equipo.spec.ts` verde; `e2e/acondicionamiento.spec.ts` **rojo en `:388`** (ver Bloqueo) |
| R30 | sin cambios en `package.json` |

## Salida de la verificación (árbol completo, tras el último commit)

- `pnpm run typecheck` → exit 0.
- `pnpm run lint` → `✖ 7 problems (0 errors, 7 warnings)`, todos en `tests/unit/documentos/confirm-catalog-import.test.ts` y `tests/unit/pedidos/order-service.test.ts` (ajenos, sin tocar).
- `pnpm exec vitest run tests/guards tests/unit/asignaciones tests/unit/asignaciones-ui tests/unit/inventario tests/unit/shared tests/unit/recetas-ui tests/unit/identity tests/unit/composition tests/unit/errores tests/unit/scripts` → `Test Files 416 passed (416)` · `Tests 7167 passed | 47 skipped (7214)`.
  Incluye las listas cerradas: `data-table-alcance`, `guard-identificador-de-request` (E2E_ESPERADOS y MIGRACIONES_ESPERADAS), `recipe-route-contract`, `session-once-per-request-*`, catálogo de errores, `guard-piezas-base`, `guard-libro-de-inventario`, `qc91-alcance`.
  Antes de dar de alta el E2E nuevo, `data-table-alcance` y `guard-identificador-de-request` salían rojos (esperaban la lista sin él); se corrigió en `aa8fdc14` y `a1ac1073`.
- Con `.env` de la raíz exportado: `pnpm exec vitest run tests/integration/inventario/finished-batch-labels.int.test.ts tests/integration/inventario/product-batch-production-date-migration.int.test.ts tests/integration/asignaciones tests/integration/inventario/order-batches.int.test.ts tests/integration/scripts` → `Test Files 28 passed (28)` · `Tests 179 passed (179)`.
- Migración en la base local `QuimiCloude`: `db:migrate` aplicada → `db:rollback` «aplicando down.sql de 20261009120000_product_batches_production_date … revertida» (columna y CHECK desaparecen) → `db:migrate` de nuevo. Queda aplicada.
- No se corrió `./init.sh` ni `vitest related` (OOM / cuelgue en local; el gate lo corre CI).

## E2E (uno por uno, base local)

- `pnpm exec playwright test e2e/datos-de-lote-en-acondicionamiento.spec.ts` → `2 passed (50.5s)` (chromium, webkit).
- `pnpm exec playwright test e2e/acondicionar-con-equipo.spec.ts` → `2 passed (31.6s)`.
- `pnpm exec playwright test e2e/acondicionamiento.spec.ts` → `2 failed · 6 passed (48.5s)`: el caso R22 (`:375`) en los dos navegadores, en
  `:388 expect(tabs).toHaveCount(2)` → `Received: 3`.

## Bloqueo (decisión humana)

**Choque R20/D13 contra R29.** R20 añade la tercera pestaña «Entregados»; R29 prohíbe cambiar aserciones de
`e2e/acondicionamiento.spec.ts`, cuyo `:388` exige exactamente dos pestañas. No se ha tocado el archivo. Opciones:
(a) enmendar R29 y pasar `:388` a tres pestañas (más la aserción de la tercera), o (b) otra decisión del humano.
CI (E2E en el PR a producción) lo dará rojo hasta entonces.

## Decisiones menores a revisar

- La paginación de «Entregados» usa `deliveredConditionedOrdersHref`, que delega en el `listHref` ya existente de
  `conditioning-orders-href.ts` (mismo patrón que `conditionedOrdersHref`, sin nuevo código de `?vista=`); pestañas y
  vuelta usan `assignmentViewHref`.
- «Entregados» reutiliza `ConditioningOrdersSkeleton list="acondicionados"`: su texto sr-only dice «Cargando pedidos terminados…».
- Línea sin lote de producción (`batchId: null`): `<fieldset disabled>`, sin texto explicativo (el spec no lo define).
- En `ENTREGADO` la pantalla muestra el estado «Entregado» (texto no listado en design § 6).
- E2E: `waitForFormHydration` espera la hidratación antes de teclear (en WebKit lo tecleado antes se perdía).
