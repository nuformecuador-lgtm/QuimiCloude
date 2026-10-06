# QC-204 — conversion-unidad-pedido-a-insumo · tasks.md

> `[P]` = paralelizable con las otras `[P]` de su mismo bloque. «Hecho» incluye siempre
> `./init.sh --rapido` en verde al cerrar la tanda, y `./init.sh` completo al cerrar la feature.
> Los nombres de los casos llevan `R<n>` (`docs/conventions.md > Tests`). Los comentarios de
> producción, sin citar fichas ni requisitos. Sin migración y sin dependencias nuevas (R26).
>
> Preguntas abiertas 1 y 2 **cerradas el 2026-10-05**: T9 implementa la opción B (rechazo con
> `order_unit_not_convertible`) y T13 la opción a (texto «aprox.»). Nada queda bloqueado.

## Bloque A — `unidades` (base de todo lo demás)

- [x] **T1 [P] — `convertWithApproximation`.** `lib/modules/unidades/domain/convert-with-approximation.ts`
  y export por el barrel, según `design.md > 3.1`.
  Tests en `tests/unit/unidades/convert-with-approximation.test.ts`:
  `R2 1000 g a kg da 1 exacto`; `R2 500 ml a l da 0.5 exacto`;
  `R3 2 l a kg da 2 aproximado`; `R3 500 g a ml da 500 aproximado`;
  `R3 una unidad propia derivada del mililitro de sistema cruza a kg aproximado`;
  `R4 kg a una unidad sin base comun lanza IncompatibleUnitsError`;
  `R4 sin puente masa-volumen, l a kg lanza IncompatibleUnitsError`;
  `N1 una base propia llamada gramo no cruza con el mililitro de sistema`.
  *Hecho:* verde; `convertQuantity` y sus tests sin cambios.
- [x] **T2 [P] — `findMassVolumeBridge`.** Método en `UnitCatalog` (`domain/unit-catalog.ts`),
  adaptador en `unit-catalog-prisma.ts` según `design.md > 3.2`, cableado en
  `lib/composition/index.ts` (`unitCatalog`). Factoría o parámetro de cliente para
  `findUnitRefs` y para `findMassVolumeBridge` (lo usará T7).
  Test de integración `tests/integration/unidades/mass-volume-bridge.int.test.ts`:
  `R3 devuelve los ids del mililitro y el gramo de sistema`;
  `N1 ignora un gramo propio de la empresa`.
  *Hecho:* verde contra la base de tests; `findUnitRefs` con el cliente global se comporta igual
  (sus tests existentes, verdes).
- [x] **T3 [P] — `getMassVolumeBridgeAction`.** Acción de solo lectura en
  `unidades/adapters/driving/unit-actions.ts` (`design.md > 5.2`), con el mismo control de sesión
  que `listUnitsAction`.
  Test unitario: `R13 la accion devuelve el puente del catalogo`; `R13 sin sesion se rechaza`.
  *Hecho:* verde.

## Bloque B — dominio de `pedidos` (depende de T1)

- [x] **T4 — `resolveLineNeed`.** `pedidos/domain/order-line-need.ts` + export por el barrel
  (`design.md > 4.1`).
  Tests `tests/unit/pedidos/order-line-need.test.ts`:
  `R1 la necesidad se calcula en la unidad del pedido y se convierte`;
  `R2 1000 g al 10 % sobre insumo en kg da 0.1 exacto`;
  `R3 2 l al 50 % sobre insumo en kg da 1 aproximado`;
  `R4 kg sobre insumo en unidad da no convertible`;
  `R20 pedido sin unidad da la cifra sin convertir`;
  `R21 insumo sin unidad da la cifra sin convertir`;
  `R9 unidad de pedido no resuelta da no convertible`.
  *Hecho:* verde.
- [x] **T5 [P] — Costo.** `order-cost.ts` y `resolve-ingredients-cost.ts` según `design.md > 4.2`
  (`CostInput.orderUnitId`, `bridge`, parámetro `orderUnitId` en las cinco funciones `resolve*`).
  Depende de T4 y T2. Tests en `tests/unit/pedidos/order-cost.test.ts` (ampliar):
  `R5 un pedido de 1000 kg cuesta 1000 veces uno de 1000 g`;
  `R5 un pedido en l sobre insumo en kg cuesta como la aproximacion`;
  `R6 una linea no convertible deja el costo en null`;
  `R7 en el costo del lote una linea no convertible cuenta cero`;
  `R20 un pedido sin unidad cuesta igual que antes del cambio` (mismo valor que el caso existente).
  *Hecho:* verde; los casos existentes siguen verdes pasando `orderUnitId: null`.
- [x] **T6 [P] — Necesidad de reserva.** `order-requirement.ts` según `design.md > 4.3`
  (`RequirementUnits`, `RecipeRequirement`). Depende de T4.
  Tests `tests/unit/pedidos/order-requirement.test.ts` (ampliar):
  `R10 1000 g al 10 % sobre insumo en kg pide 0.1`;
  `R10 dos lineas del mismo insumo en unidades distintas se suman ya convertidas`;
  `R4 una linea no convertible da not_convertible con su productId`;
  `R20 pedido sin unidad pide como antes`;
  `R21 insumo sin unidad pasa la cifra sin convertir`.
  *Hecho:* verde.

## Bloque C — transacción y llamantes (depende de B)

- [x] **T7 — Scope transaccional con productos y unidades.** `ports/order-unit-of-work.ts`
  (`products`, `units`), cableado en `lib/composition/index.ts > orderUnitOfWork` con el mismo `tx`;
  cliente opcional en `findProductRefs` (inventario) igual que en T2; helper
  `pedidos/domain/order-requirement-units.ts > loadRequirementUnits` (`design.md > 4.3`).
  Actualizar los dobles de `OrderTransactionScope` de los tests existentes.
  Tests: `R20 loadRequirementUnits sin unidad de pedido no lee el puente`;
  `R10 loadRequirementUnits resuelve la unidad de cada insumo y la del pedido`.
  *Hecho:* `tsc` y suites existentes verdes.
- [x] **T8 — Llamantes de costo.** Pasar `orderUnitId` en `create-order.ts`, `update-order.ts`,
  `update-order-presentation-lines.ts` (la unidad **nueva**), `review-blocked-orders.ts`,
  `order-packing.ts`. Depende de T5.
  Tests unitarios por caso de uso (ampliar los existentes):
  `R5 el alta guarda el costo con la necesidad convertida`;
  `R5 la edicion recalcula con la unidad editada`;
  `R5 cambiar la unidad desde el reparto recalcula con la unidad nueva`;
  `R5 el desbloqueo recalcula con la unidad del pedido`;
  `R7 terminar el empaque costea el lote con la necesidad convertida`.
  *Hecho:* verde.
- [x] **T9 — Llamantes de reserva y consumo.** `create-order.ts`, `update-order.ts`,
  `update-order-presentation-lines.ts`, `review-blocked-orders.ts`, `transition-order.ts` usan
  `loadRequirementUnits` + `buildOrderRequirement`/`buildRequirement`. **Pregunta 1 cerrada:
  opción B** para el tratamiento de `not_convertible` en alta, edición y reparto
  (`design.md > 8`): añade `OrderUnitNotConvertibleError` + código y mensaje en el
  catálogo de errores + traducción en `order-actions.ts`. Depende de T6 y T7.
  Tests:
  `R10 el alta aparta la necesidad convertida`;
  `R10 la edicion vuelve a apartar con la unidad nueva`;
  `R11 finalizar sin nada apartado consume la necesidad convertida`;
  `R11 finalizar con una linea no convertible devuelve insufficient_material sin consumir`;
  `R12 el desbloqueo deja BLOQUEADO un pedido con una linea no convertible`;
  `R12 el alta con una linea no convertible se rechaza con order_unit_not_convertible y no escribe nada`;
  `R12 la edicion y el reparto con una linea no convertible se rechazan con order_unit_not_convertible`.
  Integración `tests/integration/pedidos/order-unit-conversion.int.test.ts`:
  `R10 el alta de 1000 g sobre insumo en kg deja 0.1000 en reservation_movements`;
  `R22 un pedido guardado antes del cambio conserva su costo y lo apartado al leerlo`.
  *Hecho:* verde.
- [x] **T10 — Cotización.** `quoteOrderCostSchema` con `unitId` obligatorio y `quote-order-cost.ts`
  (`design.md > 6`). Depende de T5.
  Tests `tests/unit/pedidos/quote-order-cost.test.ts` (ampliar):
  `R8 la cotizacion usa la unidad recibida`;
  `R9 sin unitId la entrada es invalida`;
  `R9 una unidad de otra empresa da sin costo`;
  `R6 una linea no convertible da sin costo`;
  `R23 sin pedidos.modificar se rechaza antes de validar y sin leer catalogos`.
  *Hecho:* verde.

## Bloque D — presentación (D depende de B)

- [x] **T11 [P] — Ejecución.** `get-assigned-order-execution.ts` y `ExecutionLineView`
  (`design.md > 5.1`). Depende de T4 y T2.
  Tests `tests/unit/asignaciones/get-assigned-order-execution.test.ts` (ampliar):
  `R16 la cantidad de la linea sale convertida a la unidad del insumo`;
  `R17 una linea aproximada sale con need approximate`;
  `R17 una linea no convertible sale sin cantidad`;
  `R20 un pedido sin unidad sale como antes`.
  *Hecho:* verde.
- [x] **T12 [P] — Cotización en el cliente.** `use-order-cost-quote.ts` (`unitId` en los
  manejadores, `onUnitChange`) y `order-form.tsx` (conectar `PresentationUnitSelect`). Depende de T10.
  Tests `tests/unit/pedidos-ui/use-order-cost-quote.test.ts` (ampliar):
  `R8 la peticion lleva unitId`; `R8 cambiar la unidad pide una cotizacion nueva`;
  `R19 sin unidad no se cotiza y queda el guion`.
  *Hecho:* verde.
- [x] **T13 — Marcas y avisos en pantalla.** `order-ingredients-table.tsx` (props `orderUnitId`,
  `bridge`), `order-cost-quote.tsx` (`approximate`), `order-form.tsx` (cálculo de `approximate`,
  bajar `bridge` desde `page.tsx` por `OrderSheet`/`OrderListSection`), `order-execution-lines.tsx`.
  **Copy de la opción a** (Pregunta 2 cerrada): texto «aprox.» y línea bajo el importe. Depende de T3, T4, T11, T12.
  Tests (Testing Library, por `data-testid`):
  `R13 la cantidad requerida y el restante salen convertidos y con la unidad del insumo`;
  `R13 cambiar la unidad del pedido recalcula la tabla`;
  `R14 una linea no convertible muestra el aviso y no muestra cifras`;
  `R15 una linea aproximada lleva la marca aprox.`;
  `R17 en ejecucion una linea aproximada lleva la marca y una no convertible el aviso`;
  `R18 el bloque de costo indica la aproximacion si hay importe y alguna linea aproximada`;
  `R18 sin importe no se indica la aproximacion`;
  `R19 sin unidad elegida la tabla no muestra cifras`;
  `R21 un insumo sin unidad muestra la cifra sin convertir y sin aviso`.
  *Hecho:* verde.

## Bloque E — extremo a extremo y cierre

- [x] **T14 — E2E.** Ampliar `e2e/pedidos-cotizacion.spec.ts` o crear
  `e2e/pedido-conversion-de-unidad.spec.ts`, con datos propios sembrados por el helper que ya use
  la suite (insumo en kg con lotes de costo conocido). Depende de T9, T12, T13.
  Casos:
  `R24 pedido en g sobre insumo en kg: costo y cantidad apartada exactos`;
  `R25 pedido en l sobre insumo en kg: costo y cantidad apartada aproximados, con la marca en la linea y en el costo`.
  *Hecho:* verde en local con `pnpm e2e` (o el comando de `docs/verification.md`).
- [x] **T15 — Guardias y trazabilidad.** Comprobar que `package.json`/lockfile no cambian y que no
  hay migración nueva (R26, R22); mapa `R1–R26 → test` en
  `progress/impl_QC-204-conversion-unidad-pedido-a-insumo.md`. Depende de todas.
  *Hecho:* `./init.sh` completo en verde; ningún `R<n>` sin test.

## Dependencias

```
T1 ─┬─ T4 ─┬─ T5 ─┬─ T8
T2 ─┤      │      └─ T10 ─ T12 ─┐
    │      ├─ T6 ─┐             │
    │      │      T7 ─ T9 ──────┤
    │      └─ T11 ──────────────┤
T3 ─┴───────────────────────────┴─ T13 ─ T14 ─ T15
(Preguntas 1 y 2 cerradas el 2026-10-05)
```
