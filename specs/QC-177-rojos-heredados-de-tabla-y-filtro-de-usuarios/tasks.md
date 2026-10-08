# QC-177 — tareas

> Decisiones humanas cerradas el 2026-10-08: `requirements.md > Decisiones cerradas`, D4-D7.

## T1. [P] Viewports de usuarios y unidades: aceptar el truncado (D4) — R1-R5, R15
- [x] `usuarios-viewport.test.tsx`, caso de la columna de correo (R21). Se quita la aserción
      «sin `overflow-hidden`». Se mantienen: dentro del contenedor, visible, sin `hidden` y sin
      scroll del documento. Se añaden dos aserciones: el texto de la celda es el correo completo, y
      la celda lleva `text-ellipsis`.
- [x] `unidades-viewport.test.tsx`, caso de la columna de equivalencia (R27): el mismo cambio, con
      la frase de equivalencia completa.
- [x] Ningún otro caso de los dos archivos cambia. Los comentarios de las líneas tocadas no citan
      fichas.
- **Hecho:** los dos archivos en verde en los dos viewports, con
  `pnpm exec vitest related --run` sobre ellos. `data-table-scroll.test.tsx` y `components/shared/`
  sin tocar.

## T2. [P] Inventario: «nombre · unidad» (D5) — R6, R7
- [x] Se compara la regla de `nameCell` con
      `git show a543c84d^:app/(private)/inventario/components/product-columns.tsx`.
- [x] La columna `name` usa `productDisplayName(product.name, productUnitLabel(product, units))`.
      `width` y `hideText` se quedan.
- [x] Se limpian los comentarios de las líneas tocadas.
- **Hecho:** `product-page.test.tsx` en verde sin tocarlo.

## T3. Inventario: E2E adaptados como «deuda QC-177» (D5) — R8
Depende de: T2.
- [x] `e2e/inventario.spec.ts`: R26 distingue las filas homónimas por «X · kg» / «X · L». Las
      líneas 275 y 325 localizan con nombre exacto y sufijo de unidad opcional.
- [x] `e2e/insumo-por-unidad.spec.ts:91` y `e2e/inventario-importar.spec.ts` (`inventoryRow`),
      con el mismo criterio.
- [x] Barrido de `e2e/` buscando `data-table-cell-name` sobre `/inventario`; el resultado se anota
      en `progress/impl_QC-177-*.md`.
- **Hecho:** `pnpm exec playwright test e2e/inventario.spec.ts e2e/insumo-por-unidad.spec.ts
  e2e/inventario-importar.spec.ts e2e/aislamiento-inventario.spec.ts` en verde en Chromium y WebKit.

## T4. [P] Recetas: acciones no fijables (D6) — R9, R10
- [x] `recipe-columns.tsx`: se quita `defaultPinned: 'right'` de `actions` y se mantiene
      `pinnable: false`.
- **Hecho:** `recipe-page.test.tsx` en verde sin tocarlo.

## T5. [P] Estado de cuenta: filtro con nombre desde `identity` (D7) — R11, R12, R13
- [x] `people-directory.ts` exporta `ACTIVE_ACCOUNTS_ONLY: PeopleRefFilters` (un nombre sin
      `account[_ ]?status`), y `lib/modules/identity/index.ts` lo reexporta.
- [x] `list-responsible-candidates.ts` lo usa, y ni su código ni su comentario nombran el estado de
      cuenta.
- [x] `list-responsible-candidates.test.ts` sigue afirmando que el filtro que llega al puerto es
      `{ accountStatus: ['active'] }`; se ajusta solo si importa el literal.
- [x] `account-status-scope.test.ts` sin tocar.
- **Hecho:** `account-status-scope.test.ts` y `list-responsible-candidates.test.ts` en verde, y
  `pnpm exec vitest run guard` en verde (incluido `guard-qc87-no-reimplementado`).

## T6. [P] Enmiendas de specs con fecha 2026-10-08 — R16
- [x] `specs/QC-67-pantalla-de-usuarios/design.md`: la celda de correo puede llevar truncado por
      defecto; el valor completo sigue en la celda; R21 no cambia (QC-177 D4).
- [x] `specs/QC-39-pantalla-de-unidades/design.md`: lo mismo para la celda de equivalencia, R27.
- [x] `specs/QC-55-tabla-de-datos-compartida/design.md`: el contrato de columna gana `width`,
      `hideText` (ausente o `true` = truncado) y `defaultPinned`, que entraron sin spec; el truncado
      por defecto queda aceptado.
- [x] `specs/QC-145-pedidos-terminados-en-asignacion/design.md > 3.6`: el paso 3 lo añadió
      `0dbcd68f` fuera del flujo, y la llamada usa el filtro con nombre de `identity`.
- **Hecho:** las cuatro notas fechadas, y cada una cita QC-177 y su decisión.

## T7. Baseline y cierre — R14, R15, R17
Depende de: T1-T6.
- [x] Se borran de `tests/baseline-rojos.json` las entradas de `product-page`, `recipe-page`,
      `unidades-viewport`, `usuarios-viewport` y `account-status-scope`. No se añade ninguna.
- [x] Mapa R → test en `progress/impl_QC-177-rojos-heredados-de-tabla-y-filtro-de-usuarios.md`,
      según `design.md > 7`.
- [ ] `./init.sh` en verde. Se pide el gate completo de CI.
- **Hecho:** `gate-completo` verde sin esas cinco entradas y sin `package.json` en el diff.

## Archivos esperados

- `tests/unit/configuracion-ui/usuarios-viewport.test.tsx`
- `tests/unit/configuracion-ui/unidades-viewport.test.tsx`
- `app/(private)/inventario/components/product-columns.tsx`
- `e2e/inventario.spec.ts`
- `e2e/insumo-por-unidad.spec.ts`
- `e2e/inventario-importar.spec.ts`
- `app/(private)/produccion/formulas/components/recipe-columns.tsx`
- `lib/modules/identity/domain/people-directory.ts`
- `lib/modules/identity/index.ts`
- `lib/modules/asignaciones/domain/list-responsible-candidates.ts`
- `tests/unit/asignaciones/list-responsible-candidates.test.ts`
- `tests/baseline-rojos.json`
- `specs/QC-67-pantalla-de-usuarios/design.md`
- `specs/QC-39-pantalla-de-unidades/design.md`
- `specs/QC-55-tabla-de-datos-compartida/design.md`
- `specs/QC-145-pedidos-terminados-en-asignacion/design.md`
- `specs/QC-177-rojos-heredados-de-tabla-y-filtro-de-usuarios/requirements.md`
- `specs/QC-177-rojos-heredados-de-tabla-y-filtro-de-usuarios/design.md`
- `specs/QC-177-rojos-heredados-de-tabla-y-filtro-de-usuarios/tasks.md`
- `progress/impl_QC-177-rojos-heredados-de-tabla-y-filtro-de-usuarios.md`
- `progress/features/QC-177.md`
