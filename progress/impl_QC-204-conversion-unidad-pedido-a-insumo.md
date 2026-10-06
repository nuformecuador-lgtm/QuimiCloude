# QC-204 — impl (implementación completa y review OK; menores m2, m4, m6 y m7 cerrados antes del PR; merge con origin/dev)

## Estado
- Cerradas: T1–T13.
- T14: E2E escrito (71688657). El leader lo corrió con 4/4 en verde. Después se rehízo R25 para el menor m4 (pedido en
  ml), y esa versión no se ha corrido.
- T15: guardias comprobadas (abajo) y mapa completo. El gate completo y el cierre de T15 los lleva el leader.
- Review: OK sin bloqueantes (progress/review_QC-204-conversion-unidad-pedido-a-insumo.md). Menores cerrados: m2, m4, m6
  y m7. m3 no se toca por decisión humana (commit 7927d6c0). m1 y m5 los lleva el leader.
- Bloqueo T9: resuelto por el humano con la opción (a) (commit e81db6c7). Se cambió solo el dato de prueba de los casos R43.
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
- 3c19e49f chore: marca T7, T8, T10 (parado por QC-195 R43)
- e81db6c7 docs: el envase como ingrediente no tiene excepción (decisión humana)
- d8f066f5 T9 (cierre): R43 de QC-195 en una unidad convertible; la limpieza ya no deja una FK colgada
- 4e4fd8eb T12 la cotización viaja con unitId y se pide de nuevo al cambiar la unidad
- e19f9932 T11 la ejecución da la cantidad convertida y el campo need
- d7e00346 chore: marca T9, T11, T12
- 4d51732a T13 tabla de ingredientes y bloque de costo (marcas «aprox.», aviso de no convertible, bridge desde page.tsx)
- d1b8a25b T13 pantalla de ejecución (marca y aviso)
- b58e618f chore: marca T13 y pone la bitácora al día
- 71688657 T14 e2e/pedido-conversion-de-unidad.spec.ts

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
T9 (cierre): tests/integration/pedidos/finish-with-finished-goods.int.test.ts. crearFixture admite un baseUnitId opcional
y los casos R43 usan crearFixtureEnEnvases(), con la unidad derivada de «envase» y factor 1. sembrar() registra el
producto en cuanto lo crea, así la limpieza lo borra aunque el alta falle.
T11: lib/modules/asignaciones/domain/get-assigned-order-execution.ts y assigned-order-execution-view.ts
(quantity: string | null, need). Ajuste de tipos en app/(private)/asignacion/[id]/components/order-execution-lines.tsx.
Fixtures de tests/unit/asignaciones-ui/order-execution-{lines,screen}.test.tsx con need.
T12: app/(private)/pedidos/components/use-order-cost-quote.ts y order-form.tsx. Tests: tests/unit/pedidos-ui/use-order-cost-quote.test.ts
(nuevo, con docblock jsdom), order-cost-quote.test.tsx y order-form-quote.test.tsx (unitId en las expectativas; la unidad se
elige antes que la receta).
T13: components/shared/unit-conversion-marks.tsx (nuevo: ApproximateMark, NotConvertibleNotice);
app/(private)/pedidos/components/{order-ingredients-table,order-cost-quote,order-form,order-list-section,order-table,
order-columns,order-sheet}.tsx, el barrel de esa carpeta y app/(private)/pedidos/page.tsx (getMassVolumeBridgeAction en
el Promise.all; si falla, null); app/(private)/asignacion/[id]/components/order-execution-lines.tsx e index.ts.
Tests ajustados por el contrato nuevo (bridge, approximate, elegir unidad, mocks de unit-actions): unos 16 archivos de
pedidos-ui, identity/session-once-per-request-render y navegacion/pantallas-exigen-permiso (solo el mock).
Copy: marca «aprox.» (text-muted-foreground, title «Conversión aproximada: 1 ml ≈ 1 g»); bajo el importe «Incluye una
aproximación masa↔volumen (1 l ≈ 1 kg).»; aviso de no convertible «La unidad del pedido no es convertible a la del
insumo.» (text-destructive). El texto del aviso no venía fijado en el spec: lo eligió frontend_dev.
order-columns, order-list-section, order-sheet y order-table ya estaban en CRLF en el índice y se dejaron así
(git diff --check avisa de espacios al final en esas líneas).
T14: e2e/pedido-conversion-de-unidad.spec.ts (nuevo). Siembra con Prisma con el prefijo qc204_e2e_: un insumo en kg con
un lote de 1000 kg a 20/kg y una receta por caso con ese insumo al 10 %. Usa las unidades de sistema y el rol
Administrador de db:seed. Lee lo apartado con netReservedInBatch (e2e/helpers/packaging.ts). Los pedidos se guardan sin
envases.

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
- R5 (m6, comparación de unitId en review-blocked-orders): tests/unit/pedidos/review-blocked-orders.test.ts > `R5: si una edicion cambio la unidad entre la lectura y el candado, se deja para la siguiente revision sin guardar el costo de la unidad vieja`. Se comprobó que falla si se quita la comparación.
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
- R8 (cliente): tests/unit/pedidos-ui/use-order-cost-quote.test.ts > `R8 la peticion lleva unitId`, `R8 cambiar la unidad pide una cotizacion nueva`
- R16: tests/unit/asignaciones/get-assigned-order-execution.test.ts > `R16 la cantidad de la linea sale convertida a la unidad del insumo`
- R17 (servidor): get-assigned-order-execution.test.ts > `R17 una linea aproximada sale con need approximate`, `R17 una linea no convertible sale sin cantidad`
- R19 (cotización): use-order-cost-quote.test.ts > `R19 sin unidad no se cotiza y queda el guion`
- R20 (ejecución): get-assigned-order-execution.test.ts > `R20 un pedido sin unidad sale como antes`
- R13 (tabla): tests/unit/pedidos-ui/order-ingredients-table.test.tsx > `R13 la cantidad requerida y el restante salen convertidos y con la unidad del insumo`, `R13 cambiar la unidad del pedido recalcula la tabla`
- R14: order-ingredients-table.test.tsx > `R14 una linea no convertible muestra el aviso y no muestra cifras`
- R15: order-ingredients-table.test.tsx > `R15 una linea aproximada lleva la marca aprox.`
- R16 (pantalla): tests/unit/asignaciones-ui/order-execution-lines.test.tsx > `R16 el selector de unidad parte de la cantidad ya convertida y conserva la marca`
- R17 (pantalla): order-execution-lines.test.tsx > `R17 en ejecucion una linea aproximada lleva la marca y una no convertible el aviso`
- R18: tests/unit/pedidos-ui/order-form-quote.test.tsx > `R18 el bloque de costo indica la aproximacion si hay importe y alguna linea aproximada`, `R18 sin importe no se indica la aproximacion`
- R19 (tabla): order-ingredients-table.test.tsx > `R19 sin unidad elegida la tabla no muestra cifras`
- R21 (pantalla): order-ingredients-table.test.tsx > `R21 un insumo sin unidad muestra la cifra sin convertir y sin aviso`
- R24: e2e/pedido-conversion-de-unidad.spec.ts > `R24 pedido en g sobre insumo en kg: costo y cantidad apartada exactos`. Cifras: 1000 g al 10 % = 0,1 kg; costo 2,0000; apartado 0,1 kg. En verde en la corrida del leader (4/4).
- R25: e2e/pedido-conversion-de-unidad.spec.ts > `R25 pedido en ml sobre insumo en kg: costo y cantidad apartada aproximados, con la marca en la linea y en el costo` (m4). Cifras: 2000 ml al 10 % = 200 ml ≈ 0,2 kg; costo 4,0000; apartado 0,2 kg; se ven las dos marcas. Con la fórmula vieja saldrían 4000,0000 y 200, así que costo y apartado solo cuadran si se aplica la aproximación. Esta versión no se ha corrido.
- R26, sin dependencias de terceros: tests/guards/guard-dependencias-aprobadas.test.ts > `toda dependencia de package.json tiene su fila en el registro`, `el registro no lista paquetes que ya no estan instalados`. Además, package.json y pnpm-lock.yaml no tienen diff contra el merge-base 7812803e.
- R26, el borrado lógico no cambia: tests/unit/pedidos/delete-order.test.ts > `borra un pedido PENDIENTE marcandolo, con el actor y el instante (R31, R6)`, `R27: borra logicamente un BLOQUEADO, igual que un PENDIENTE` y los demás casos del archivo, en verde. El diff no toca deletedAt en lib/.
- R26, identificadores en inglés: revisados uno a uno por el reviewer (progress/review_QC-204-conversion-unidad-pedido-a-insumo.md, «Decisión sobre R26»).

### Guardias de T15 (comprobadas a mano contra el merge-base 7812803e)
- package.json y pnpm-lock.yaml: sin diff. Ninguna dependencia nueva.
- prisma/, db/ y supabase/: sin diff. Ninguna migración nueva (R22, R26).
- Diff de lib/ sin líneas de deletedAt/deleted_at.

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

- ./init.sh --rapido (tras T9 + T11 + T12): typecheck OK, lint OK; Test Files 6 failed | 603 passed (609);
  Tests 8 failed | 8959 passed | 30 skipped. Los 6 archivos están en el baseline (los 5 de antes y
  recetas/module-contract). Desaparecen los rojos (a) y (b) de arriba.
  Subagentes: tests/integration/pedidos + inventario/company-scope 346/346; tests/integration/asignaciones 102/102;
  tests/unit/pedidos-ui 582 pasan y 3 se saltan; asignaciones + asignaciones-ui 288/288; guardias 681.

- ./init.sh --rapido (tras T13): typecheck OK, lint OK; Test Files 6 failed | 603 passed (609);
  Tests 8 failed | 8969 passed | 30 skipped. Los 6 archivos están en el baseline: recetas/module-contract,
  unidades-viewport, usuarios-viewport, product-page, pantallas-exigen-permiso, recipe-page.
- E2E (T14): `playwright test --list` da 4 tests en 1 archivo. No ejecutado.
- ./init.sh completo (lo corrió el leader): un rojo nuevo, tests/guards/guard-identificador-de-request.test.ts
  («no hay ningun archivo nuevo en e2e/ y existe el test que lo sustituye (R21)»). Faltaba
  pedido-conversion-de-unidad.spec.ts en la lista cerrada E2E_ESPERADOS. Se dio de alta con el comentario de siempre: el
  recorrido que hace y que no lee ni afirma nada del identificador de petición. El resto de rojos del gate completo son
  del baseline (según el leader).
  Tras el arreglo: la guardia sola da 23/23. ./init.sh --rapido: typecheck OK, lint OK; Test Files 6 failed | 603 passed
  (609); Tests 8 failed | 8969 passed | 30 skipped. Los mismos 6 archivos del baseline.
- E2E (corrido por el leader): 4/4 en verde (R24 y R25 en chromium y webkit).

## Bloqueo T9 — conflicto con QC-195 R43 (resuelto: opción a)
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
