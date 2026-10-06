# QC-213 — ajuste-por-total-contado · bitácora del implementer

> Worktree `.worktrees/QC-213-ajuste-por-total-contado`, rama `feature/QC-213-ajuste-por-total-contado`.
> Base propia `QuimiCloude_QC213` (copia de `qct_tpl_0524a8735d8d`, migrada y sembrada); el `.env`
> del worktree apunta a ella y el original queda en `.env.bak-QuimiCloude`. La base compartida
> `QuimiCloude` no se toca.

## Estado por task

| Task | Estado | Commit |
|---|---|---|
| T0 contrato | cerrada | `4787768e` |
| F2 historial | cerrada | `94844cc8` |
| F1 diálogo | cerrada | `48a6ce07` |
| B1 migración | cerrada | `ec0afd2c` |
| B5 lectura del historial | cerrada | `5dbec14c` |
| B2 puerto, adaptador y caso de uso | cerrada | `b5b82df5` |
| B3 tests del servidor | cerrada | `3958b4f7` |
| B4 tests de la action | cerrada | `2c66f476` |
| TI integración real y E2E | cerrada | `137ca814` |
| TZ cierre | abierta: comprobaciones hechas, falta `./init.sh` completo (leader) | — |

## Decisiones y enmiendas durante la implementación (2026-10-06)

1. **Sin prevalidación del total en la action** (humano). Un `{ status: 'error' }` literal junto a la
   captura con `instanceof` de `BatchStockChangedError` dispara la guardia del traductor único
   (`tests/guards/guard-catalogo-de-errores.test.ts:143-146`). La action pasa el valor y lo rechaza el
   esquema del caso de uso (`invalid_input`, mensaje del catálogo). Enmendados `design.md > 1.3` y
   `tasks.md > B4`. La guardia no se tocó.
2. **Desvíos de T0 aprobados**: dos sentencias de export en el barrel (una por archivo de origen,
   ninguna con `...Deps`, sin tocar líneas existentes); el puente pasa el candidato sin `delta`
   cuando la lectura no es válida, para que el permiso se compruebe primero; `catalogo.test.ts`
   sube su conteo de 70 a 72 códigos.
3. **Renombre de columna** (humano): `previous_stock`/`previousStock` → `stock_before`/`stockBefore`
   en base y Prisma, porque `tests/unit/identity/credential-policy-contract.test.ts:176` prohíbe
   «previous» en el esquema. El DTO (`previousStock`) no cambia; el adaptador traduce. Ese test no
   se toca.
4. **Cast en el CHECK** (aprobado): `"kind"::text = 'adjustment'`; sin él,
   `tests/integration/proveedores/company-scope.int.test.ts` (R10 de esa ficha) falla con
   `42883 text = "InventoryMovementKind"` al reproducir `down.sql` antiguos que recrean el enum.
5. **Añadidos de pantalla fuera de `design.md > 4`, aceptados por el leader como detalle de UI**:
   - un total parcial (`5.`) bloquea el envío con la alerta `adjust-batch-counted-error`;
   - se ignora el reset del selector que hace Base UI;
   - al reabrir el diálogo se oculta el resultado anterior.
6. **Guardia ajena con lista que se actualiza por ficha**: `tests/guards/guard-identificador-de-request.test.ts`
   gana una línea en `MIGRACIONES_ESPERADAS` (`ec0afd2c`), como pide su propio mensaje y como hizo
   QC-211. Sin cambio de lógica. Pendiente de visto bueno del leader.
7. **Timestamp compartido con QC-209**: su rama local trae `20261006120000_inventory_imports` (aún no en
   `origin`), mismo timestamp que `20261006120000_inventory_movements_adjustment_count`. Prisma aplica
   las dos (orden alfabético), pero el orden queda ambiguo para `db:rollback`. Pendiente de decisión
   del leader.
8. `frontend_dev` arregló un `filter(` en el diálogo que hacía saltar la guardia
   `product-route-contract`; lo cubre el siguiente `--rapido`.

## Archivos tocados

T0: `lib/modules/inventario/domain/stock-adjustment.ts` (nuevo), `lib/modules/inventario/index.ts`,
`lib/modules/inventario/domain/{errors,reservation}.ts`,
`lib/modules/errores/domain/{error-codes,error-catalog}.ts`,
`lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`,
`lib/modules/inventario/adapters/driving/batch-actions.ts`, `tests/fixtures/adjust-batch-stock.ts`
(nuevo), `tests/unit/inventario/stock-adjustment.test.ts` (nuevo),
`tests/unit/inventario/{batch-actions,batch-movement-prisma,adjust-batch-stock}.test.ts`,
`tests/unit/inventario/batch-history.test.tsx`, `tests/integration/inventario/reservation.int.test.ts`,
`tests/unit/errores/catalogo.test.ts`, spec (`design.md > 1.3`, `tasks.md`).

F1: `app/(private)/inventario/components/adjust-batch-dialog.tsx`,
`tests/unit/inventario/adjust-batch-dialog.test.tsx`,
`tests/unit/inventario-ui/envase-en-inventario.test.tsx`.

F2: `app/(private)/inventario/components/batch-history.tsx`,
`tests/unit/inventario/batch-history.test.tsx`.

## Mapa R → test (R1-R30, 30/30 mapeados)

| R | Test |
|---|---|
| R1 | `adjust-batch-dialog.test.tsx` «R1 — muestra la existencia registrada y un unico campo de total contado, sin campo con signo», «R1 — el campo de total no admite signo…», «R1 — la existencia registrada se pinta redondeada…» |
| R2 | `adjust-batch-dialog.test.tsx` «R2 — un total mayor muestra «Aumento de X» y uno menor «Disminucion de X»…», «R2 — la diferencia es exacta…», «R2, R5 — sin total, con un total parcial o igual…» |
| R3 | `adjust-batch-dialog.test.tsx` «R3 — confirmar un total igual a la existencia registrada avisa y NO invoca la action» |
| R4 | `adjust-batch-dialog.test.tsx` «R4 — en un aumento solo se ofrecen conteo fisico y error de carga», «R4 — en una disminucion se ofrecen los cuatro motivos»; `stock-adjustment.test.ts` «R4 — un aumento solo admite…», «R4 — una disminucion admite los cuatro motivos», «R4 R28 — reasonsFor devuelve la misma lista…» |
| R5 | `adjust-batch-dialog.test.tsx` «R5 — el selector esta deshabilitado sin total, con un total parcial o igual a la existencia» |
| R6 | `adjust-batch-dialog.test.tsx` «R6 — pasar de disminucion a aumento deja sin elegir un motivo que el aumento no admite», «R6 — un motivo valido para los dos sentidos se conserva…» |
| R7 | `envase-en-inventario.test.tsx` «R7: el ajuste de un lote de envase no acepta un total contado no entero y no envia nada», «R7: el ajuste de un lote de envase con un total entero se envia», «R7: el total contado de un lote de envase usa teclado numerico y no admite signo» |
| R8 | `adjust-batch-dialog.test.tsx` «R8 — el FormData lleva exactamente batchId, countedStock, seenStock y reason, sin diferencia», «R8 — un aumento tambien viaja como total…» |
| R9 | `adjust-batch-dialog.test.tsx` «R9 — con el lote sobre-reservado, muestra el aviso y el dialogo sigue abierto» |
| R10 | `adjust-batch-dialog.test.tsx` «R10 — muestra el mensaje, la existencia actual, la diferencia recalculada y limpia el motivo que ya no vale, sin reenviar», «R10 — si el sentido recalculado admite el motivo elegido, se conserva», «R10 — al cerrar y reabrir vuelve a la existencia del lote…» |
| R11 | `adjust-batch-dialog.test.tsx` «R11 — la siguiente confirmacion envia como existencia vista la existencia actual recibida» |
| R12 | `adjust-batch-stock-prisma.test.ts` «R12: la diferencia es el total menos la existencia bloqueada, y es la que mueve el lote y el asiento»; `adjust-by-count.int.test.ts` «R12, R24: un aumento y una disminucion dejan el lote en el total y el asiento cuadrando con sus dos columnas» |
| R13 | `adjust-batch-stock-prisma.test.ts` «R13: con una existencia bloqueada distinta de la vista devuelve stock_changed sin update, asiento ni recalculo», «R13: la comparacion con la vista es decimal, no de cadenas», «R13: la existencia cambiada se mira antes que la regla de producto terminado»; `adjust-batch-stock.test.ts` «R13: el puerto devuelve stock_changed y el caso de uso lanza BatchStockChangedError con la existencia actual»; `batch-actions.test.ts` «R13: BatchStockChangedError llega como stock_changed con la existencia actual, sin pasar por el traductor»; `adjust-by-count.int.test.ts` «R13: con una existencia vista vieja no escribe nada y devuelve la existencia actual» |
| R14 | `adjust-by-count.int.test.ts` «R14: dos ajustes simultaneos del mismo lote con la misma vista aplican uno y rechazan el otro» |
| R15 | `adjust-batch-stock.test.ts` «R15: un aumento con el motivo de disminucion merma/rotura lanza AdjustmentReasonNotAllowedError sin tocar el puerto», «R15: los dos motivos de aumento si pasan en un aumento»; `batch-actions.test.ts` «R15: adjustment_reason_not_allowed llega como ErrorState con el texto del catalogo» |
| R16 | `adjust-batch-stock.test.ts` «R16: un total 12 / 12.0000 igual a la existencia vista … es invalid_input sin tocar el puerto» (3 casos) |
| R17 | `adjust-batch-stock-prisma.test.ts` «R17: un aumento sobre un producto terminado devuelve increase_not_allowed sin escribir» |
| R18 | `adjust-batch-stock-prisma.test.ts` «R18: un envase con presentacion fija y un total no entero lanza ValidationError sin escribir», «R18: un envase con presentacion fija y un total entero se aplica» |
| R19 | `adjust-batch-stock.test.ts` «R19: un total con signo menos / con signo mas / una existencia vista con signo / con once enteros / con cinco decimales / un campo delta de mas es invalid_input sin tocar el puerto», «R19: diez enteros y cuatro decimales es el limite que si pasa»; `adjust-batch-stock-prisma.test.ts` «R19: la violacion del CHECK de existencia negativa se traduce a BatchStockNegativeError»; `batch-actions.test.ts` «R19: un total no numerico lo rechaza el caso de uso con invalid_input y el mensaje del catalogo» |
| R20 | `batch-actions.test.ts` «R20: un ajuste que deja el lote sobre-reservado vuelve como success con overReserved» |
| R22 | `adjust-batch-stock.test.ts` «R22: el puerto devuelve batch_not_found y el caso de uso lanza BatchNotFoundError» |
| R23 | `adjust-batch-stock.test.ts` «R23: un aumento aplicado avisa una vez», «R23: una disminucion aplicada no avisa», «R23: un aumento rechazado no avisa, sea por la existencia cambiada, el producto terminado o el motivo» |
| R24 | `adjust-batch-stock-prisma.test.ts` «R24: writeMovement recibe la existencia bloqueada como previousStock y el total contado»; `batch-movement-prisma.test.ts` «R24: un ajuste por total escribe la existencia de antes en stockBefore y el total en countedStock»; `adjust-by-count.int.test.ts` (caso R12, R24) |
| R25 | `adjust-by-count.int.test.ts` «R25: rechaza … con inventory_movements_count_pair / count_only_adjustment / count_balances» (5 casos), «R25: control positivo -un ajuste que cuadra con las dos columnas se acepta-» |
| R21 | DOM: `adjust-batch-dialog.test.tsx` «R21 — sin canAdjust el panel se ve pero el disparador del ajuste no existe en el DOM», «R21 — con canAdjust el control SI esta…»; servidor: `tests/unit/inventario/authorization.test.ts` «cada caso de uso rechaza con UnauthorizedError, que es un InventarioError, sin tocar ningun puerto», «rechaza por permiso ANTES de validar la entrada, incluso con entrada invalida» (barren los catorce casos de uso, `adjustBatchStock` incluido); `product-route-contract.test.ts:484` (permiso como primera sentencia de `adjustBatchStock`); E2E «R21 — quien solo tiene inventario.consultar ve el panel y el historial, pero el control de ajuste no existe en el DOM» |
| R26 | `batch-history.test.tsx` «R26 — un ajuste con existencia anterior y total contado guardados los muestra junto a la cantidad», «R26 — la fixture de ajuste con conteo pinta sus dos valores sin ceros de relleno»; adaptador: `batch-movement-prisma.test.ts` «R26: un ajuste con existencia de antes y total contado los devuelve a cuatro decimales», «R26: un asiento de reserva nunca trae existencia de antes ni total contado»; Postgres: `adjust-by-count.int.test.ts` «R26: findBatchMovements devuelve las dos columnas del ajuste nuevo y null en el asiento de alta» |
| R27 | `batch-history.test.tsx` «R27 — un ajuste sin existencia anterior ni total contado se pinta como antes…», «R27 — los asientos que no son ajustes tampoco muestran los dos campos»; adaptador: `batch-movement-prisma.test.ts` «R27: un ajuste sin las dos columnas (anterior a ellas) las devuelve null» |
| R28 | `stock-adjustment.test.ts` (tabla «R28 — …»); «R28 — $name decide sentido y motivos con las funciones de stock-adjustment, sin lista de motivos propia» (`el dialogo`, `el caso de uso`) |
| R29 | `e2e/ajuste-de-inventario.spec.ts` «R29 — un total contado mayor que la existencia asienta el aumento con existencia anterior y total contado, en Postgres y en el historial», «R29 — un total contado menor que la existencia asienta la disminucion con motivo merma, en Postgres y en la lista», «R29 — si la existencia cambia con el dialogo abierto, el ajuste se rechaza sin asiento y al reconfirmar se aplica la diferencia recalculada» |
| R30 | `tests/guards/guard-dependencias-aprobadas.test.ts` (2/2 verde); `git diff dev -- package.json pnpm-lock.yaml` vacío |

## Salida de tests

### T0 (`4787768e`)
- `pnpm run typecheck`: limpio. `pnpm run lint`: 0 errores, 8 avisos ajenos.
- `vitest related --run <archivos T0>`: 615 archivos, 9135 pasan, 8 fallan, 30 omitidos. Los 8 están
  en `tests/baseline-rojos.json`: `unidades-viewport` (1280 y 375 px), `usuarios-viewport` (1280 y
  375 px), `product-page` R18, `recipe-page` R21, `pantallas-exigen-permiso` `/pedidos`,
  `recetas/module-contract`.
- `guard-catalogo-de-errores.test.ts`: verde. `./init.sh --rapido`: «init OK», 51 guardias verdes
  (su paso de tests relacionados no seleccionó ninguno).

### F1/F2 (`48a6ce07`, `94844cc8`)
- Cerradas por `frontend_dev`; su `--rapido` final queda cubierto por el de B1.

### B1-B5 (`ec0afd2c`, `5dbec14c`, `b5b82df5`, `3958b4f7`, `2c66f476`)
- Migración en `QuimiCloude_QC213`: rollback de la versión vieja, luego migrate → rollback → migrate con
  la final; `prisma migrate status` «Database schema is up to date!».
- Rollback en base efímera `QuimiCloude_QC213_rb` (desde `qct_tpl_0524a8735d8d`), versión final:
  migrate (2 columnas, 3 constraints) → rollback (0 columnas, 0 constraints, sin fila en
  `_prisma_migrations`) → migrate (2 y 3, status limpio). Base borrada.
- `credential-policy-contract.test.ts` 7/7; `proveedores/company-scope.int.test.ts` 29/29.
- Typecheck 0 errores; lint 0 errores (8 avisos ajenos).
- Guardias de B2 sin tocar + unitarios de inventario: 14 archivos, 357/357.
- Integración migrada (11 archivos): 142/142. `adjust-by-count.int.test.ts`: 10/10 (R14 verde en dos corridas).
- B3/B4 unitarios: 82/82 y 26/26.
- `./init.sh --rapido` (tras B3+B4): 9221 pasan, 8 fallan, los 8 del baseline. Como cortan
  `test:rapido` antes de las guardias, guardias aparte: 51/51 archivos, 682 casos verdes.

### TI (`137ca814`)
- Sin cambios de producción. `git grep -n "delta"` en `batch-actions.ts`, `adjust-batch-stock.ts` y
  `adjust-batch-dialog.tsx`: sin resultados. `git diff dev -- lib/composition/index.ts`: vacío.
- E2E contra `QuimiCloude_QC213` (puerto 3117), `pnpm exec playwright test e2e/ajuste-de-inventario.spec.ts
  e2e/producto-terminado.spec.ts`: **10/10 en 2,1 min, Chromium y WebKit**.

  | Caso | Chromium | WebKit |
  |---|---|---|
  | R29 aumento | 50,8 s | 1,0 min |
  | R29 disminución (`merma`) | 50,7 s | 25,0 s |
  | R29 existencia cambiada y reconfirmación | 50,5 s | 23,2 s |
  | R21 Operador sin control en el DOM | 47,5 s | 19,9 s |
  | `producto-terminado.spec.ts` R37 (aviso `adjust-batch-finished-product-notice`) | 1,6 min | 59,3 s |

  Cada caso siembra su propio producto y lote (`fullyParallel` mezclaba asientos entre casos); se
  conserva el prefijo `qc92_e2e_` para la limpieza de huérfanos.
- Typecheck limpio; lint 0 errores (8 avisos ajenos); `vitest related` + `stock-adjustment.test.ts` 36/36.
- `./init.sh --rapido`: typecheck y lint verdes; `test:rapido` 8 fallos en 6 archivos, los 8 del
  baseline. Guardias aparte (`vitest run tests/guards`): 44 archivos, 612 pasan, 5 omitidos. (La cifra
  de B, 51 archivos/682, salió del recuento de `init.sh`, que incluye guardias fuera de `tests/guards`.)

### TZ
- R30: `git diff dev -- package.json pnpm-lock.yaml` vacío; `guard-dependencias-aprobadas` 2/2.
- Comentarios: en las líneas añadidas por la rama bajo `app/`, `lib/`, `db/` ningún comentario cita
  `QC-`, `R<n>`, `D<n>` ni el spec; en `tests/`/`e2e/` tampoco en comentarios (los `R<n>` van en los
  nombres de caso).
- **`./init.sh` completo NO corrido aquí**: por la regla del gate lo corre el leader antes del PR.

## Pendientes para el leader
1. Visto bueno a la línea añadida en `MIGRACIONES_ESPERADAS` de `guard-identificador-de-request`.
2. Decidir el timestamp compartido `20261006120000` con QC-209 (renombrar una de las dos).
3. `tasks.md > B1` aún nombra el campo Prisma como `previousStock` (es `stockBefore`); no se tocó por
   no salir de las enmiendas autorizadas.
4. `./init.sh` completo antes del PR.
5. Al cerrar la feature: borrar la base `QuimiCloude_QC213` y restaurar `.env` desde `.env.bak-QuimiCloude`.
