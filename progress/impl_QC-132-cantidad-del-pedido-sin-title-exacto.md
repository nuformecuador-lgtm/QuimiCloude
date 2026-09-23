# QC-132 — cantidad-del-pedido-sin-title-exacto · informe de implementación

> Implementer, 2026-09-23. Rama `feature/QC-132-cantidad-del-pedido-sin-title-exacto`. Solo frontend
> (`frontend_dev`). Tasks T1–T7 cerradas; T8 (gate rápido), T9 (gate completo) y T10 (cierre del mapa
> tras el gate) quedan para el leader. Nombre del archivo según `design.md > 5` y `tasks.md > T5`.

## Archivos tocados

Producción:
- `app/(private)/pedidos/components/order-columns.tsx` — la celda Cantidad devuelve
  `<span title={exactDecimalTitle(order.quantity)}>…</span>`; el comentario de esa celda, reescrito corto
  y sin citas.
- `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` —
  `title={exactDecimalTitle(execution.orderQuantity)}` en el `<p>` de `ORDER_EXECUTION_ORDER_QUANTITY_TESTID`.
- `app/(private)/asignacion/[id]/components/order-execution-lines.tsx` —
  `title={exactDecimalTitle(displayedQuantity)}` en el `span` de `ORDER_EXECUTION_LINE_QUANTITY_TESTID-<i>`.

Tests (solo casos añadidos):
- `tests/unit/pedidos-ui/order-columns.test.tsx`
- `tests/unit/asignaciones-ui/order-execution-screen.test.tsx`
- `tests/unit/asignaciones-ui/order-execution-lines.test.tsx`

## Mapa R<n> -> test o comprobación

| Req | Verificación |
|---|---|
| R1 | `order-columns.test.tsx` › `QC-132 R1: expone el valor exacto en el title cuando difiere del pintado` |
| R2 | `order-columns.test.tsx` › `QC-132 R2: sin title cuando el valor pintado coincide con el exacto` |
| R3 | `order-execution-screen.test.tsx` › `QC-132 R3: expone el valor exacto en el title cuando difiere del pintado` |
| R4 | `order-execution-screen.test.tsx` › `QC-132 R4: sin title cuando el valor pintado coincide con el exacto` |
| R5 | `order-execution-lines.test.tsx` › `QC-132 R5: title exacto cuando difiere del pintado, en su unidad propia` y `QC-132 R5: title exacto tambien sin unidad resoluble` |
| R6 | `order-execution-lines.test.tsx` › `QC-132 R6: sin title cuando el valor pintado coincide con el exacto` |
| R7 | Los casos R1, R3, R5, R12 afirman `textContent` con igualdad exacta (`'0.13'`, `'Pedido 0.13'`, `'0'`, `'125.5'`); los casos preexistentes de texto de los tres archivos siguen verdes sin tocar |
| R8 | Diff (T6): `lib/shared/ui/decimal-display.ts` y su test no aparecen; los tres sitios importan `exactDecimalTitle`/`formatDecimalDisplay` de ahí |
| R9 | Los 9 casos de componente de arriba afirman `toHaveAttribute('title', …)` / ausencia de `title`; diff sin nada en `e2e/` |
| R10 | Censo (T7), abajo |
| R11 | Diff (T6): `order-field.tsx` intacto; `git diff -- tests/` sin ninguna línea `-` |
| R12 | `order-execution-lines.test.tsx` › `QC-132 R12: title con el valor convertido tal cual, sin acotar` (ml→L, `'1'` → `'0'`, `title` `'0.001'`) y `QC-132 R12: sin title cuando el valor convertido ya sale exacto` (L→ml, `'0.1255'` → `'125.5'`, sin `title`) |

## Test primero (rojo antes de producción)

- R1: `toHaveAttribute` sobre el `span` inexistente → `Received has type: Null`.
- R3: `Expected the element to have attribute: title="0.1255" — Received: null`.
- R5 (×2) y R12 (primero): `title` → `Received: null`.

## T5 — que muerde

| Sitio | Mutación | Rojo obtenido | Revertida |
|---|---|---|---|
| `order-columns.tsx` | quitar `title` del `span` | `QC-132 R1`: `toHaveAttribute('title','0.1255')` recibe `null` | sí |
| `order-execution-screen.tsx` | quitar `title` del `<p>` | `QC-132 R3`: recibe `null` | sí |
| `order-execution-lines.tsx` | quitar `title` del `span` | `QC-132 R5` (×2) y `QC-132 R12` (valor largo): reciben `null` | sí |

El diff final de producción es exactamente el de T1–T3 (revisado por el implementer).

## T6 — requisitos negativos por diff

`git diff --stat` contra la base: solo los 6 archivos listados (110 inserciones, 10 borrados, todos los
borrados en producción). No aparecen `lib/shared/ui/decimal-display.ts`, su test, `order-field.tsx`,
`components/shared/data-table/**`, `e2e/`, `package.json` ni el lockfile. `git diff -- tests/ | grep '^-[^-]'`
no devuelve nada: los tests solo añaden.

## T7 — censo de `formatDecimalDisplay(` en `app/`

| Aparición | `title` |
|---|---|
| `asignacion/[id]/components/order-execution-lines.tsx:82` | `exactDecimalTitle(displayedQuantity)` en el mismo `span` |
| `asignacion/[id]/components/order-execution-screen.tsx:72` | `exactDecimalTitle(execution.orderQuantity)` en el `<p>` |
| `pedidos/components/order-columns.tsx:202` | `exactDecimalTitle(order.quantity)` en el `span` |
| `pedidos/components/order-ingredients-table.tsx:187` | `exactDecimalTitle(line.productStock…)` en el `TableCell` |
| `pedidos/components/order-ingredients-table.tsx:194` | `exactDecimalTitle(required)` en el `TableCell` |
| `pedidos/components/order-ingredients-table.tsx:211` | `exactDecimalTitle(remaining)` en el `TableCell` padre |
| `proveedores/[id]/components/catalog-columns.tsx:198` | `exactDecimalTitle(line.cost)` |
| `proveedores/[id]/components/catalog-columns.tsx:211` | `exactDecimalTitle(line.minPurchase)` |
| `pedidos/components/order-field.tsx:68` | sin `title` — única excepción admitida (campo editable, fuera de alcance) |

## Salida real de la verificación acotada

- `pnpm run typecheck` (`tsc --noEmit`): sin errores. (En el worktree hizo falta una vez
  `pnpm exec next typegen`; entorno, no código.)
- `pnpm run lint` (`eslint`): sin salida.
- `pnpm exec vitest related --run` sobre los tres archivos de producción (frontend_dev):
  `Test Files 29 passed (29)`, `Tests 389 passed (389)`.
- `pnpm exec vitest run` de los tres archivos de test (implementer):
  `Test Files 3 passed (3)`, `Tests 66 passed (66)`.

Sin E2E (R9). Gate rápido y completo: pendientes, los corre el leader.

## Arreglo tras la revisión (2026-09-23)

Menores de `progress/review_QC-132-cantidad-del-pedido-sin-title-exacto.md`, solo tests (producción intacta):
- En los casos QC-132 de `order-execution-lines.test.tsx` (R5 ×2, R12 ×2) y `order-execution-screen.test.tsx` (R3),
  `toHaveTextContent(...)`, que compara por subcadena, pasa a igualdad exacta `expect(el.textContent).toBe(...)`,
  como promete `design.md > 5`. El más sensible era R12 (`'0'`, que también casaría con `'0.001'`).
- R6 afirma además el texto pintado: `textContent` `'20'`.

Salida: `pnpm exec vitest related --run` sobre los dos archivos -> `Test Files 2 passed (2)`, `Tests 37 passed (37)`;
`pnpm run typecheck` y `pnpm run lint` sin errores.
