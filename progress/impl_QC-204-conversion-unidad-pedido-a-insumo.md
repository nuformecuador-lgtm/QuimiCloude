# QC-204 — impl (parcial, PARADO tras Bloque C por conflicto con QC-195 R43)

## Estado
- Cerradas: T1–T8, T10.
- Abierta: T9. Su código y sus tests están hechos y en verde, pero rompe 2 casos de QC-195 (ver «Bloqueo T9»).
- Pendientes: T11–T15.
- Bloqueo T4: resuelto por el humano (opción 2; design 4.1 enmendado en 70e32f00).

## Commits
- aad730ce feat(QC-204): convertWithApproximation cruza masa y volumen por el puente de sistema
- d53e64d3 feat(QC-204): findMassVolumeBridge en UnitCatalog con lector atado al cliente de la transaccion
- f7a2fb62 feat(QC-204): getMassVolumeBridgeAction lee el puente con el mismo control de sesion que el listado
- 7c076d16 chore(QC-204): marca T1-T3 cerradas
- b30b6484 chore: bitácora parcial (parado en T4)
- 70e32f00 docs: design 4.1 enmendado (LineNeedUnits.orderUnitId)
- 316b5e88 T4 resolveLineNeed
- ab6f622a T5 costo con necesidad convertida
- 2b7ee1f9 T6 reserva convertida antes de sumar
- 70db9810 chore: marca T4-T6
- 06fdfc85 T7 scope transaccional con products/units sobre el mismo tx
- ea4eecda T8+T9 (un solo commit: los tests de costo y de reserva comparten archivos)
- 1c201406 T10 cotización con unitId obligatorio

## Archivos
Creados: lib/modules/unidades/domain/convert-with-approximation.ts, lib/modules/unidades/domain/get-mass-volume-bridge.ts,
tests/unit/unidades/convert-with-approximation.test.ts, tests/integration/unidades/mass-volume-bridge.int.test.ts,
tests/unit/unidades/get-mass-volume-bridge-action.test.ts.
Modificados: lib/modules/unidades/index.ts, domain/unit-catalog.ts, adapters/driven/persistence/unit-catalog-prisma.ts
(findUnitRefs(ids, companyId, db = prisma), findMassVolumeBridge(db = prisma), createUnitCatalogReader(db)),
adapters/driving/unit-actions.ts, lib/composition/index.ts, tests/integration/aislamiento.json (transaccion),
tests/unit/unidades/module-contract.test.ts (+getMassVolumeBridgeAction), 24 dobles de UnitCatalog (solo findMassVolumeBridge).
Bloques B y C, producción. pedidos: domain/order-line-need.ts (nuevo), domain/order-requirement-units.ts (nuevo:
loadRequirementUnits, requireConvertibleRequirement), order-cost.ts, resolve-ingredients-cost.ts, order-requirement.ts,
create-order.ts, update-order.ts, update-order-presentation-lines.ts (resultado unit_not_convertible),
review-blocked-orders.ts (compara además unitId entre la lectura previa y la fila bloqueada), transition-order.ts,
order-packing.ts (throw inalcanzable con mensaje de invariante en la fase materials_consumed), errors.ts
(OrderUnitNotConvertibleError), order-input.ts, quote-order-cost.ts, ports/order-unit-of-work.ts,
adapters/driving/order-actions.ts, index.ts. inventario: product-catalog-prisma.ts (findProductRefs con cliente opcional).
errores: error-codes.ts, error-catalog.ts. lib/composition/index.ts.
Tests de apoyo: tests/helpers/order-unit-of-work-double.ts, tests/helpers/order-scope-readers.ts (nuevo); dobles de
scope y de UnitCatalog en unos 40 archivos; fixtures de unidad del insumo derivadas con factor 1 de la del pedido
(los importes esperados no cambian); catalogo.test.ts pasa de 67 a 68 códigos.

## Mapa R<n> -> test (hasta ahora)
- R2: convert-with-approximation.test.ts > `R2 1000 g a kg da 1 exacto`, `R2 500 ml a l da 0.5 exacto`
- R3: convert-with-approximation.test.ts > `R3 2 l a kg da 2 aproximado`, `R3 500 g a ml da 500 aproximado`, `R3 una unidad propia derivada del mililitro de sistema cruza a kg aproximado`; mass-volume-bridge.int.test.ts > `R3 devuelve los ids del mililitro y el gramo de sistema`
- R4: convert-with-approximation.test.ts > `R4 kg a una unidad sin base comun lanza IncompatibleUnitsError`, `R4 sin puente masa-volumen, l a kg lanza IncompatibleUnitsError`
- N1: `N1 una base propia llamada gramo no cruza con el mililitro de sistema`; `N1 ignora un gramo propio de la empresa`
- R13 (accion del puente): get-mass-volume-bridge-action.test.ts > `R13 la accion devuelve el puente del catalogo`, `R13 sin sesion se rechaza`, `R13 sin unidades.consultar se rechaza sin leer el catalogo`
- R1: order-line-need.test.ts > `R1 la necesidad se calcula en la unidad del pedido y se convierte`
- R2 (además): order-line-need.test.ts > `R2 1000 g al 10 % sobre insumo en kg da 0.1 exacto`
- R3 (además): order-line-need.test.ts > `R3 2 l al 50 % sobre insumo en kg da 1 aproximado`
- R4 (además): order-line-need.test.ts > `R4 kg sobre insumo en unidad da no convertible`; order-requirement.test.ts > `R4 una linea no convertible da not_convertible con su productId`
- R5: order-cost.test.ts > `R5 un pedido de 1000 kg cuesta 1000 veces uno de 1000 g`, `R5 un pedido en l sobre insumo en kg cuesta como la aproximacion`; `R5 el alta guarda el costo con la necesidad convertida` (create-order), `R5 la edicion recalcula con la unidad editada` (update-order), `R5 cambiar la unidad desde el reparto recalcula con la unidad nueva` (update-order-presentation-lines), `R5 el desbloqueo recalcula con la unidad del pedido` (review-blocked-orders)
- R6: order-cost.test.ts > `R6 una linea no convertible deja el costo en null`; quote-order-cost.test.ts > `R6 una linea no convertible da sin costo`
- R7: order-cost.test.ts > `R7 en el costo del lote una linea no convertible cuenta cero`; order-packing > `R7 terminar el empaque costea el lote con la necesidad convertida`
- R8 (servidor): quote-order-cost.test.ts > `R8 la cotizacion usa la unidad recibida`. Cliente: T12, pendiente.
- R9: order-line-need.test.ts > `R9 unidad de pedido no resuelta da no convertible`; quote-order-cost.test.ts > `R9 sin unitId la entrada es invalida`, `R9 una unidad de otra empresa da sin costo`
- R10: order-requirement.test.ts > `R10 1000 g al 10 % sobre insumo en kg pide 0.1`, `R10 dos lineas del mismo insumo en unidades distintas se suman ya convertidas`; order-requirement-units.test.ts > `R10 loadRequirementUnits resuelve la unidad de cada insumo y la del pedido`; `R10 el alta aparta la necesidad convertida`; `R10 la edicion vuelve a apartar con la unidad nueva`; order-unit-conversion.int.test.ts > `R10 el alta de 1000 g sobre insumo en kg deja 0.1000 en reservation_movements`
- R11: `R11 finalizar sin nada apartado consume la necesidad convertida`, `R11 finalizar con una linea no convertible devuelve insufficient_material sin consumir`
- R12: `R12 el desbloqueo deja BLOQUEADO un pedido con una linea no convertible`; `R12 el alta con una linea no convertible se rechaza con order_unit_not_convertible y no escribe nada`; `R12 la edicion y el reparto con una linea no convertible se rechazan con order_unit_not_convertible` (update-order y update-order-presentation-lines); order-actions-distribution.test.ts > `R12 el reparto con una unidad no convertible se traduce a order_unit_not_convertible`
- R20: order-line-need.test.ts > `R20 pedido sin unidad da la cifra sin convertir`; order-cost.test.ts > `R20 un pedido sin unidad cuesta igual que antes del cambio`; order-requirement.test.ts > `R20 pedido sin unidad pide como antes`; order-requirement-units.test.ts > `R20 loadRequirementUnits sin unidad de pedido no lee el puente`
- R21: order-line-need.test.ts > `R21 insumo sin unidad da la cifra sin convertir`; order-requirement.test.ts > `R21 insumo sin unidad pasa la cifra sin convertir`
- R22: order-unit-conversion.int.test.ts > `R22 un pedido guardado antes del cambio conserva su costo y lo apartado al leerlo`
- R23: quote-order-cost.test.ts > `R23 sin pedidos.modificar se rechaza antes de validar y sin leer catalogos`
- Pendientes: R13 (tabla), R14–R19 (T11–T13), R24–R25 (T14), R26 (T15).

## Salida de tests
- T1 8/8, T2 2/2 (base efimera de scripts/test-db.ts), T3 3/3.
- ./init.sh --rapido (tras Bloque A): typecheck OK, lint OK (0 errores, 8 avisos preexistentes);
  Test Files 5 failed | 335 passed (340); Tests 7 failed | 5142 passed | 4 skipped.
  Los 5 rojos estan en tests/baseline-rojos.json (unidades-viewport, usuarios-viewport, product-page,
  pantallas-exigen-permiso, recipe-page). Sin rojos nuevos.
- ./init.sh --rapido (tras Bloque B): typecheck OK, lint OK; Test Files 5 failed | 338 passed (343);
  Tests 7 failed | 5182 passed | 4 skipped. Son los mismos 5 archivos del baseline.
- Bloque C (corridas del subagente; el gate rápido no se corrió porque se sabe que sale rojo):
  typecheck 0 errores; lint 0 errores (8 avisos preexistentes). Unitarios de pedidos, asignaciones, errores y guardias en verde.
  Integración (pedidos, asignaciones, unidades, inventario, documentos/formula-import): 88 de 90 archivos en verde;
  tras rehacer la cotización, 33 de 33 en verde. Rojos conocidos:
  (a) finish-with-finished-goods.int.test.ts: 2 casos `R43:` del bloque «QC-195 — un envase que es tambien
      ingrediente no se consume dos veces» (ver Bloqueo T9). Su limpieza falla por FK y arrastra a
      inventario/company-scope.int.test.ts en la corrida conjunta; corrido solo pasa 13/13.
  (b) 24 casos de pedidos-ui (order-cost-quote.test.tsx, order-form-quote.test.tsx): `canQuote` ya no valida sin
      unitId. Es lo esperado hasta T12.
  (c) unidades-viewport y usuarios-viewport: están en el baseline.

## Bloqueo T9 — conflicto con QC-195 R43 (abierto)
Los dos casos R43 de QC-195 siembran una receta antigua con el envase como ingrediente. El envase está en la unidad de
sistema «envase» y el pedido en una unidad propia sin base común con ella. Según R4/R12 de QC-204, esa línea no es
convertible y el alta se rechaza con order_unit_not_convertible. Ni N3 ni R21 contemplan este caso. Opciones:
(a) Ajustar solo el fixture de QC-195 a una combinación convertible; el rechazo queda como comportamiento correcto
    para datos antiguos de ese tipo.
(b) Enmendar el spec para que esas líneas (insumo que es envase, o en la unidad «envase») se traten como `unconverted`.

## Bloqueo T4 (resuelto: opción 2)
design §4.1: `LineNeedUnits.orderUnit: UnitConversion | null` usa null tanto para "pedido sin unidad"
(R20 -> unconverted) como para "unidad de pedido no resuelta" (R9 / §4.1 -> not_convertible), y T4 exige
el test `R9 unidad de pedido no resuelta da no convertible` sobre resolveLineNeed. Opciones:
1. orderUnit: {kind:'none'} | {kind:'unresolved'} | {kind:'resolved', unit}.
2. LineNeedUnits gana `orderUnitId: string | null` (id sin unidad resuelta => not_convertible). Recomendada: minimo cambio, alinea con CostInput.orderUnitId y loadRequirementUnits(…, orderUnitId, …).
3. Mantener firma y mover el test R9 a los llamantes (repite la regla).
