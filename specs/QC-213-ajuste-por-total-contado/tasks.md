# QC-213 — ajuste-por-total-contado · tasks.md

> Orden: **T0** (contrato, secuencial) → bloques **B<n>** (backend) y **F<n>** (frontend) en
> paralelo entre sí → **TI** (integración real + E2E) → **TZ** (cierre).
> `[P]` = puede ir en paralelo con las otras `[P]` de su misma fase. Ningún archivo de un bloque B
> aparece en un bloque F, y viceversa (comprobado contra la tabla de `design.md > 8`).
> Gate de cada tanda: `./init.sh --rapido`. Gate de TZ y antes del PR: `./init.sh` completo.
> Un commit por task (`feat(QC-213): ...` / `test(QC-213): ...`). Ningún comentario de producción
> cita la ficha, un `R<n>` ni el spec.

---

## [x] T0 — Publicar el contrato (bloquea todo lo demás)

Implementa `design.md > 1` tal cual, con el stub de `design.md > 1.8`.

Archivos:
- `lib/modules/inventario/domain/stock-adjustment.ts` (nuevo): `STOCK_QUANTITY_PATTERN`,
  `AdjustmentDirection`, `REASONS_BY_DIRECTION`, `StockAdjustment`, `StockAdjustmentReading`,
  `describeAdjustment`, `reasonsFor`, `isReasonAllowed`, `AdjustBatchStockResult`,
  `BatchStockAdjustment`, `AdjustBatchStockOutcome`.
- `lib/modules/inventario/index.ts`: exporta lo anterior en una sentencia propia, sin `...Deps`;
  exporta `BatchStockChangedError` y `AdjustmentReasonNotAllowedError`.
- `lib/modules/inventario/domain/errors.ts`: las dos clases.
- `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts`: `batch_stock_changed` y
  `adjustment_reason_not_allowed`, con sus textos (`design.md > 1.4`).
- `lib/modules/inventario/domain/reservation.ts`: `previousStock` y `countedStock` en `BatchHistoryEntry`.
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`: las dos funciones
  `to...HistoryEntry` devuelven `null` en los dos campos (solo eso; la lectura real es B5).
- `lib/modules/inventario/adapters/driving/batch-actions.ts`: `AdjustBatchStockFormState` nuevo;
  la action lee `batchId`, `countedStock`, `seenStock`, `reason`; traduce `BatchStockChangedError`
  a `stock_changed`; puente a `delta` mientras el caso de uso no cambie.
- `tests/fixtures/adjust-batch-stock.ts` (nuevo): `design.md > 1.7`.
- `tests/unit/inventario/stock-adjustment.test.ts` (nuevo): tabla de casos del helper — aumento,
  disminución, `'zero'` con `'12'` frente a `'12.0000'`, `'invalid'` con vacío, `'12.'`, `'-1'`,
  `'1e3'`, once enteros, cinco decimales; motivos por sentido.
- Ajustes mínimos para que compile y siga verde: `tests/unit/inventario/batch-actions.test.ts`
  (FormData con los cuatro campos nuevos), y `previousStock: null, countedStock: null` en los
  objetos de historial de `batch-movement-prisma.test.ts`, `batch-history.test.tsx`,
  `adjust-batch-stock.test.ts` y `tests/integration/inventario/reservation.int.test.ts`.

Cubre: R4 y R28 (helper), base de R13 y R15 (códigos y clases).

**Hecho cuando:** `./init.sh --rapido` en verde; el test de unicidad del catálogo de errores en
verde; `stock-adjustment.test.ts` en verde; `git grep "delta"` en `batch-actions.ts` solo aparece
dentro del puente; commit `feat(QC-213): publica el contrato del ajuste por total contado`.

---

## Bloque B — backend (`backend_dev`)

### B1 — Migración y escritura de las columnas nuevas
Depende de: T0.

Archivos:
- `db/migrations/20261006120000_inventory_movements_adjustment_count/migration.sql` y `down.sql`
  (`design.md > 2`). Comprobar antes que el timestamp no choca con otra rama viva (QC-209).
- `db/schema.prisma`: `previousStock` y `countedStock` en `InventoryMovement`.
- `lib/modules/inventario/domain/inventory-movement.ts`: los dos campos opcionales en
  `NewInventoryMovement`.
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`: **solo**
  `writeMovement` (escribe los dos campos o `null`).

**Hecho cuando:** `pnpm run db:migrate`, `pnpm run db:rollback` y de nuevo `pnpm run db:migrate`
terminan sin error y `prisma migrate status` queda limpio; el cliente Prisma regenerado compila;
`./init.sh --rapido` en verde.

### B2 — Cambio atómico de puerto, adaptador y caso de uso
Depende de: B1. Es una sola task porque cambiar la firma del puerto rompe el typecheck de todos sus
llamadores a la vez.

Archivos:
- `lib/modules/inventario/ports/product-repository.ts:208`: firma del `design.md > 1.5` y su doc.
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:1027`: `design.md > 3`.
- `lib/modules/inventario/domain/adjust-batch-stock.ts`: esquema y orden del `design.md > 1.2`;
  el aviso de aumento sale del sentido.
- `lib/modules/inventario/adapters/driving/batch-actions.ts`: quita el puente; pasa los cuatro campos.
- `tests/helpers/product-batch-result.ts`: `stockAdjusted` sobre `AdjustBatchStockOutcome`.
- `tests/helpers/adjust-by-delta.ts` (nuevo): `design.md > 8`, último párrafo.
- Migrar llamadores (`design.md > 8`, filas marcadas B2): `adjust-batch-stock.test.ts`,
  `adjust-batch-stock-prisma.test.ts`, `authorization.test.ts`, `list-use-cases.test.ts`,
  `create-product.test.ts`, `company-isolation-service.test.ts`, `product-service.test.ts`,
  `product-input.test.ts`, y los once archivos de `tests/integration/**` listados; revisar
  `tests/integration/aislamiento.json`.

**Hecho cuando:** typecheck limpio; siguen verdes sin tocarlas las guardias
`product-route-contract.test.ts`, `qc91-alcance.test.ts`, `qc121-alcance.test.ts`,
`guard-libro-de-inventario.test.ts` e `inventario-schema.test.ts`; `./init.sh --rapido` en verde;
los tests de integración migrados en verde contra Postgres (`pnpm test` sobre esos archivos, base
de `pnpm run db:test`).

### B3 [P] — Tests nuevos del servidor
Depende de: B2 (y de B5 para el caso `R26` de integración). En paralelo con B4 y B5.

Archivos:
- `tests/unit/inventario/adjust-batch-stock.test.ts`: casos nuevos —
  `R15` motivo de disminución en un aumento → `adjustment_reason_not_allowed` y el puerto no se llama;
  `R16` total igual a la vista (`'12'` / `'12.0000'`) → `invalid_input` sin puerto;
  `R19` total con signo, con once enteros, con cinco decimales, campo `delta` de más → `invalid_input`;
  `R13` el puerto devuelve `stock_changed` → `BatchStockChangedError` con `currentStock`;
  `R22` `batch_not_found` → `BatchNotFoundError`;
  `R23` aviso solo en aumento aplicado, nunca en disminución ni en rechazo.
- `tests/unit/inventario/adjust-batch-stock-prisma.test.ts`: `R12` diferencia = total − existencia
  bloqueada; `R13` vista distinta → `stock_changed` sin `update` ni asiento; `R13` la comparación es
  decimal; `R17` terminado + aumento; `R18` envase con total no entero; `R19` violación del `CHECK`
  → `BatchStockNegativeError`; `R24` `writeMovement` recibe `previousStock` y `countedStock`.
- `tests/integration/inventario/adjust-by-count.int.test.ts` (nuevo), contra Postgres:
  `R12`/`R24` aumento y disminución dejan el lote, el asiento y sus dos columnas cuadrando;
  `R13` vista vieja → nada escrito y existencia actual devuelta;
  `R14` dos ajustes simultáneos del mismo lote con la misma vista → uno `adjusted`, otro `stock_changed`,
  un solo asiento nuevo;
  `R25` `INSERT` crudos que violan cada uno de los tres `CHECK` se rechazan;
  `R26` `findBatchMovements` devuelve las dos columnas del ajuste nuevo y `null` en el de alta.

**Hecho cuando:** los tres archivos en verde, cada caso con su `R<n>` en el nombre;
`./init.sh --rapido` en verde.

### B4 [P] — Tests de la action
Depende de: B2. En paralelo con B3 y B5.

Archivos: `tests/unit/inventario/batch-actions.test.ts`.
Casos: `R8` la action pasa exactamente `{ batchId, countedStock, seenStock, reason }` al caso de uso;
`R13` `BatchStockChangedError` → `{ status: 'stock_changed', code, message, currentStock }` sin
pasar por el traductor; `R20` `success` con `overReserved`; total no numérico → `invalid_input`
con el mensaje del catálogo (lo rechaza el caso de uso); `adjustment_reason_not_allowed` llega como
`ErrorState`.

**Hecho cuando:** archivo en verde; `./init.sh --rapido` en verde.

### B5 [P] — Lectura de las columnas en el historial
Depende de: B1. Puede empezar en paralelo con B2 (no comparten archivo); se cierra después de B2.

Archivos:
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`: `MOVEMENT_SELECT`
  y `toInventoryHistoryEntry` (`design.md > 5`).
- `tests/unit/inventario/batch-movement-prisma.test.ts`: `R26` con columnas → `toFixed(4)`; `R27`
  sin columnas → `null`; reserva → `null`.

**Hecho cuando:** archivo en verde; `./init.sh --rapido` en verde.

---

## Bloque F — frontend (`frontend_dev`)

Trabaja contra la action mockeada y `tests/fixtures/adjust-batch-stock.ts`. No toca `lib/`.

### [x] F1 [P] — Diálogo por total contado
Depende de: T0. En paralelo con F2 y con todo el bloque B.

Archivos:
- `app/(private)/inventario/components/adjust-batch-dialog.tsx` (`design.md > 4`).
- `tests/unit/inventario/adjust-batch-dialog.test.tsx`: `R1` existencia registrada y campo de
  total sin signo; `R2` «Aumento de X» / «Disminución de X»; `R3` total igual → aviso y la action no
  se llama; `R4` opciones por sentido; `R5` selector deshabilitado sin diferencia válida; `R6`
  cambio de sentido limpia el motivo; `R8` el `FormData` enviado tiene exactamente `batchId`,
  `countedStock`, `seenStock`, `reason`; `R9` sobre-reserva abierta; `R10` `stock_changed` →
  mensaje, existencia actual, diferencia recalculada, motivo limpiado si ya no vale, una sola
  llamada a la action; `R11` la segunda confirmación envía `seenStock` = `currentStock`; `R21` sin
  `canAdjust` no hay control en el DOM.
- `tests/unit/inventario-ui/envase-en-inventario.test.tsx`: `R7` total no entero en envase → aviso y
  sin envío; total entero → envío.

**Hecho cuando:** los dos archivos en verde; `adjust-batch-finished-product-notice` conserva su
texto; el diálogo no importa ninguna lista de motivos propia (usa `reasonsFor`); `./init.sh --rapido`
en verde.

### [x] F2 [P] — Historial con existencia anterior y total contado
Depende de: T0. En paralelo con F1 y con el bloque B.

Archivos:
- `app/(private)/inventario/components/batch-history.tsx` (`design.md > 5`).
- `tests/unit/inventario/batch-history.test.tsx`: `R26` ajuste con los dos campos → se ven
  `batch-history-entry-previous-stock` y `batch-history-entry-counted-stock` con su valor; `R27`
  ajuste viejo → no existen esos dos nodos y el resto de la fila es igual que hoy.

**Hecho cuando:** archivo en verde; `./init.sh --rapido` en verde.

---

## TI — Integración real y E2E
Depende de: B2, B3, B4, B5, F1, F2.

Archivos:
- `tests/unit/inventario/stock-adjustment.test.ts`: caso `R28` que lee las fuentes de
  `adjust-batch-dialog.tsx` y `adjust-batch-stock.ts` y exige que importen
  `describeAdjustment`/`reasonsFor`/`isReasonAllowed` del módulo y no declaren su propia lista de
  motivos.
- `e2e/ajuste-de-inventario.spec.ts`: sustituye el ajuste con signo y el caso de negativo por
  `R29` — aumento (total > existencia, motivo `conteo_fisico`; en Postgres: lote, asiento con
  cantidad, `previous_stock` y `counted_stock`; en el historial se ven los dos campos); disminución
  (total < existencia, motivo `merma`); existencia cambiada (con el diálogo abierto, el test cambia la
  existencia del lote con Prisma; al confirmar se ve `adjust-batch-stock-changed`, la existencia
  nueva y la diferencia recalculada, y en Postgres no hay asiento nuevo; al confirmar de nuevo se
  aplica con la diferencia correcta). Conserva el caso del Operador (`R21`).
- Verificar `lib/composition/index.ts:900` sin cambios y `e2e/producto-terminado.spec.ts` en verde.

**Hecho cuando:** sin rastro del puente ni de `delta` en `batch-actions.ts`, `adjust-batch-stock.ts`
y `adjust-batch-dialog.tsx`; `pnpm exec playwright test e2e/ajuste-de-inventario.spec.ts
e2e/producto-terminado.spec.ts` en verde en Chromium y WebKit, con el resultado anotado en
`progress/impl_QC-213-ajuste-por-total-contado.md`; `./init.sh --rapido` en verde.

---

## TZ — Cierre
Depende de: TI.

- `./init.sh` completo en verde.
- `progress/impl_QC-213-ajuste-por-total-contado.md`: mapa `R1`–`R30` → test concreto (el de
  `design.md > 9`, corregido con los nombres reales), y el resultado del E2E.
- `R30`: `git diff dev -- package.json pnpm-lock.yaml` vacío; `guard-dependencias-aprobadas` en verde.
- Comentarios: en las líneas que toca la rama, ninguno cita `QC-`, `R<n>`, `D<n>` ni el spec.

**Hecho cuando:** todo lo anterior se cumple y la feature queda lista para `reviewer`.
