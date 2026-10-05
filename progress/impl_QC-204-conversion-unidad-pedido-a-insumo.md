# QC-204 — impl (parcial, PARADO en T4)

## Estado
- Cerradas: T1, T2, T3 (Bloque A).
- Pendientes: T4–T15. T4 bloqueada por ambigüedad del design §4.1 (ver abajo); T5–T15 dependen de ella.

## Commits
- aad730ce feat(QC-204): convertWithApproximation cruza masa y volumen por el puente de sistema
- d53e64d3 feat(QC-204): findMassVolumeBridge en UnitCatalog con lector atado al cliente de la transaccion
- f7a2fb62 feat(QC-204): getMassVolumeBridgeAction lee el puente con el mismo control de sesion que el listado
- 7c076d16 chore(QC-204): marca T1-T3 cerradas

## Archivos
Creados: lib/modules/unidades/domain/convert-with-approximation.ts, lib/modules/unidades/domain/get-mass-volume-bridge.ts,
tests/unit/unidades/convert-with-approximation.test.ts, tests/integration/unidades/mass-volume-bridge.int.test.ts,
tests/unit/unidades/get-mass-volume-bridge-action.test.ts.
Modificados: lib/modules/unidades/index.ts, domain/unit-catalog.ts, adapters/driven/persistence/unit-catalog-prisma.ts
(findUnitRefs(ids, companyId, db = prisma), findMassVolumeBridge(db = prisma), createUnitCatalogReader(db)),
adapters/driving/unit-actions.ts, lib/composition/index.ts, tests/integration/aislamiento.json (transaccion),
tests/unit/unidades/module-contract.test.ts (+getMassVolumeBridgeAction), 24 dobles de UnitCatalog (solo findMassVolumeBridge).

## Mapa R<n> -> test (hasta ahora)
- R2: convert-with-approximation.test.ts > `R2 1000 g a kg da 1 exacto`, `R2 500 ml a l da 0.5 exacto`
- R3: convert-with-approximation.test.ts > `R3 2 l a kg da 2 aproximado`, `R3 500 g a ml da 500 aproximado`, `R3 una unidad propia derivada del mililitro de sistema cruza a kg aproximado`; mass-volume-bridge.int.test.ts > `R3 devuelve los ids del mililitro y el gramo de sistema`
- R4: convert-with-approximation.test.ts > `R4 kg a una unidad sin base comun lanza IncompatibleUnitsError`, `R4 sin puente masa-volumen, l a kg lanza IncompatibleUnitsError`
- N1: `N1 una base propia llamada gramo no cruza con el mililitro de sistema`; `N1 ignora un gramo propio de la empresa`
- R13 (accion del puente): get-mass-volume-bridge-action.test.ts > `R13 la accion devuelve el puente del catalogo`, `R13 sin sesion se rechaza`, `R13 sin unidades.consultar se rechaza sin leer el catalogo`
- Resto de R<n>: pendiente.

## Salida de tests
- T1 8/8, T2 2/2 (base efimera de scripts/test-db.ts), T3 3/3.
- ./init.sh --rapido (tras Bloque A): typecheck OK, lint OK (0 errores, 8 avisos preexistentes);
  Test Files 5 failed | 335 passed (340); Tests 7 failed | 5142 passed | 4 skipped.
  Los 5 rojos estan en tests/baseline-rojos.json (unidades-viewport, usuarios-viewport, product-page,
  pantallas-exigen-permiso, recipe-page). Sin rojos nuevos.

## Bloqueo T4
design §4.1: `LineNeedUnits.orderUnit: UnitConversion | null` usa null tanto para "pedido sin unidad"
(R20 -> unconverted) como para "unidad de pedido no resuelta" (R9 / §4.1 -> not_convertible), y T4 exige
el test `R9 unidad de pedido no resuelta da no convertible` sobre resolveLineNeed. Opciones:
1. orderUnit: {kind:'none'} | {kind:'unresolved'} | {kind:'resolved', unit}.
2. LineNeedUnits gana `orderUnitId: string | null` (id sin unidad resuelta => not_convertible). Recomendada: minimo cambio, alinea con CostInput.orderUnitId y loadRequirementUnits(…, orderUnitId, …).
3. Mantener firma y mover el test R9 a los llamantes (repite la regla).
