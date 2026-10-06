# QC-204 — review (vuelta 1, completa)

Rango revisado: `7812803e..9fbe2dda` (merge-base con `origin/dev` .. HEAD). Revisor: reviewer.
MCP del grafo no usado; la revisión se hizo con git diff, Grep y Read.

## Veredicto: **OK**

Ningún bloqueante. 7 menores, todos no bloqueantes. Condición de cierre para el leader: marcar
T15 cuando confirme `./init.sh` completo tras dbcffad9 (m1).

## Verificación ejecutada por el reviewer

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | OK, 0 errores |
| `pnpm run lint` | 0 errores, 8 avisos preexistentes (ninguno en archivos de producción del diff) |
| `pnpm run test:guardias` | 51 archivos / 681 tests en verde, 11 saltados |
| `vitest related --project ui --project node` sobre los 44 archivos de `lib/ app/ components/` del diff | 472 archivos en verde, 6 en rojo, 8 tests. Los 6 archivos están en `tests/baseline-rojos.json`: unidades-viewport, usuarios-viewport, pantallas-exigen-permiso, product-page, recipe-page y recetas/module-contract. En pantallas-exigen-permiso el `TypeError ... reading "status"` en `loadFormCatalogs` es el mismo motivo que da el baseline (falta el mock de `listRecipesAction`). Ningún rojo nuevo |
| integración `tests/integration/{pedidos,unidades,asignaciones}` (base efímera) | 53/53 archivos, 499/499 tests |
| integración `tests/integration/inventario` (`findProductRefs` cambió) | 36/36 archivos, 313/313 tests |
| `git diff 7812803e..HEAD -- package.json pnpm-lock.yaml db prisma supabase` | vacío |

No se corrieron ni el gate completo ni el E2E: los corre el leader (E2E 4/4 según el leader).

## Checklist

### Especificación
- [x] requirements.md con R1–R26 en EARS.
- [x] design.md con alternativas descartadas (§9) y su porqué.
- [ ] tasks.md todas `[x]`: **T15 sigue `[ ]`** (tasks.md:159). Su «hecho» es `./init.sh` completo en verde, que corre el leader → m1.

### Trazabilidad (R<n> → test que lo verifica de verdad)
| R | Test(s) | ¿Verifica? |
|---|---|---|
| R1 | order-line-need.test.ts `R1 la necesidad se calcula en la unidad del pedido y se convierte` | sí |
| R2 | convert-with-approximation.test.ts `R2 1000 g a kg…`, `R2 500 ml a l…`; order-line-need `R2 1000 g al 10 %…` | sí |
| R3 | convert-with-approximation `R3 2 l a kg…`, `R3 500 g a ml…`, `R3 una unidad propia derivada…`; mass-volume-bridge.int `R3 devuelve los ids…`; order-line-need `R3 2 l al 50 %…` | sí |
| R4 | convert-with-approximation `R4 …lanza IncompatibleUnitsError` (2); order-line-need `R4 kg sobre insumo en unidad…`; order-requirement `R4 una linea no convertible…` | sí |
| R5 | order-cost `R5 …1000 veces…`, `R5 …en l…`; create-order, update-order, update-order-presentation-lines y review-blocked-orders `R5 …` | sí |
| R6 | order-cost `R6 …null`; quote-order-cost `R6 una linea no convertible da sin costo` | sí |
| R7 | order-cost `R7 en el costo del lote…cuenta cero`; order-packing `R7 terminar el empaque…` | sí |
| R8 | quote-order-cost `R8 la cotizacion usa la unidad recibida`; use-order-cost-quote `R8 la peticion lleva unitId`, `R8 cambiar la unidad pide una cotizacion nueva`. El cableado `PresentationUnitSelect` → `onUnitChange` (order-form.tsx:806-809) lo cubre el E2E: elige la unidad la última y afirma el importe | sí |
| R9 | order-line-need `R9 unidad de pedido no resuelta…`; quote-order-cost `R9 sin unitId…` (sin leer catálogos), `R9 una unidad de otra empresa da sin costo` | sí |
| R10 | order-requirement `R10 …0.1`, `R10 dos lineas…ya convertidas`; order-requirement-units `R10 …`; create-order y update-order `R10 …`; order-unit-conversion.int `R10 …0.1000 en reservation_movements` | sí |
| R11 | transition-order `R11 finalizar sin nada apartado…`, `R11 …no convertible…insufficient_material` | sí |
| R12 | create-order `R12 el alta…no escribe nada` (create/sync/setReservedAt no llamados, diagnóstico con productId); update-order y update-order-presentation-lines `R12 …`; order-actions-distribution `R12 …se traduce…`; review-blocked-orders `R12 el desbloqueo deja BLOQUEADO…` | sí |
| R13 | order-ingredients-table `R13 …convertidos…`, `R13 cambiar la unidad…recalcula` | sí |
| R14 | order-ingredients-table `R14 …aviso y no muestra cifras` | sí |
| R15 | order-ingredients-table `R15 …aprox.` | sí |
| R16 | get-assigned-order-execution `R16 …convertida…`; order-execution-lines `R16 el selector…parte de la cantidad ya convertida…` | sí |
| R17 | get-assigned-order-execution `R17 …approximate`, `R17 …sin cantidad`; order-execution-lines `R17 …marca…aviso` | sí |
| R18 | order-form-quote `R18 …indica la aproximacion…`, `R18 sin importe no se indica…` | sí |
| R19 | order-ingredients-table `R19 sin unidad elegida…`; use-order-cost-quote `R19 sin unidad no se cotiza y queda el guion` | sí (ver m3) |
| R20 | order-line-need, order-cost, order-requirement, order-requirement-units y get-assigned-order-execution `R20 …` | sí |
| R21 | order-line-need, order-requirement y order-ingredients-table `R21 …` | sí |
| R22 | order-unit-conversion.int `R22 un pedido guardado antes del cambio conserva su costo y lo apartado al leerlo` | sí |
| R23 | quote-order-cost `R23 sin pedidos.modificar se rechaza antes de validar y sin leer catalogos`: entrada inválida + permiso ausente → `UnauthorizedError`, ningún catálogo leído | sí |
| R24 | e2e/pedido-conversion-de-unidad.spec.ts `R24 …` | sí (corrido por el leader) |
| R25 | e2e `R25 …` | sí, con reserva (m4) |
| R26 | sin caso propio; ver decisión abajo | basta (m2) |

**Decisión sobre R26 (punto 2 del implementer): basta.** Las tres partes de R26 son negativas y
quedan cubiertas por lo que ya existe o se comprobó a mano:
- Dependencias: `tests/guards/guard-dependencias-aprobadas.test.ts` (en verde) y diff vacío en `package.json`/`pnpm-lock.yaml`.
- Borrado lógico: el diff no toca `deletedAt` en `lib/`, y los tests de borrado de pedidos que ya existían (`tests/unit/pedidos/delete-order.test.ts` y los de `order-catalog`/`list-orders`) siguen en verde dentro del `related`.
- Identificadores en inglés: revisados uno a uno (`convertWithApproximation`, `MassVolumeBridge`, `ConvertedQuantity`, `findMassVolumeBridge`, `createUnitCatalogReader`, `getMassVolumeBridgeAction`, `resolveLineNeed`, `OrderLineNeed`, `LineNeedUnits`, `RequirementUnits`, `RecipeRequirement`, `loadRequirementUnits`, `requireConvertibleRequirement`, `OrderUnitNotConvertibleError`, `order_unit_not_convertible`, `unit_not_convertible`, `ingredientNeedOf`, `ApproximateMark`, `NotConvertibleNotice`, `need`, los testids). Todos en inglés.

### Calidad de código
- [x] typecheck y lint (arriba).
- [x] tests unit/integración relacionados en verde, salvo los rojos del baseline.
- [x] Flujo crítico (importes y movimientos de reserva) con E2E: R24/R25.
- [x] Multiplataforma: el diff de UI no añade `100vh`, `:hover` como única activación, inputs nuevos ni librerías. Las marcas son texto visible, no tooltip: el `title` es un extra. El aviso usa `whitespace-normal` en la celda y en ejecución usa el `text-base` de la fila, que ya tiene `TOUCH_TARGET`. El selector de unidad se oculta en las líneas no convertibles.
- [x] Dependencias: ninguna añadida.

### Datos y seguridad
- [x] Sin tablas ni migraciones nuevas (diff vacío en `db/`, `prisma/`, `supabase/`).
- [x] Permisos en el service: la cotización mantiene `pedidos.modificar` como primera línea (R23 con test). `getMassVolumeBridge` exige `unidades.consultar` (test `R13 sin unidades.consultar se rechaza sin leer el catalogo`).
- [x] Acceso solo por Prisma. Sin secretos. Sin webhooks.
- [x] Aislamiento por empresa: `findUnitRefs` y `findProductRefs` siguen filtrando por `companyId`, también con el cliente `tx`. `findMassVolumeBridge` solo lee filas de sistema (`company_id IS NULL`), así que no hay dato de operación cruzable. El rechazo cruzado está probado en quote-order-cost `R9 una unidad de otra empresa da sin costo`.

### Módulos hexagonales
- [x] `domain/` no importa framework ni adaptadores. `order-requirement-units.ts` importa solo el tipo del puerto propio.
- [x] De otros módulos se importa solo el barrel (`@/lib/modules/unidades`, `@/lib/modules/pedidos`, `@/lib/modules/inventario`, `@/lib/modules/recetas`).
- [x] Los adaptadores driven se cablean en `lib/composition`: `createUnitCatalogReader(tx)` y `findProductRefs(…, tx)` atados al mismo `tx` en `orderUnitOfWork`.
- [x] Las guardias de módulos están en verde.

### Comentarios (líneas añadidas en producción)
- [x] Ninguna línea añadida en `app/`, `components/` o `lib/` cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada» (grep sobre `git diff -U0`).
- [x] Sin bloques largos nuevos. Los comentarios añadidos dan un porqué (transacción y conexión del pool, cálculo fuera de la cotización para la edición, texto visible por pantallas táctiles).

### Verificación final (la cierra el leader)
- [ ] `./init.sh` completo en verde tras dbcffad9: lo confirma el leader.
- [x] Este archivo con veredicto OK.
- [ ] `progress/history.md` y desmontar el worktree: los hace el leader.

## Respuesta a los puntos que marcó el implementer
1. **Texto del aviso no convertible** («La unidad del pedido no es convertible a la del insumo.»). Sigue al pie de la letra la redacción de R14, y los tests van por `data-testid`. No es hallazgo.
2. **R26.** Basta: ver la decisión arriba y m2.
3. **`getMassVolumeBridgeAction` exige `unidades.consultar`**, y si falla `page.tsx` pasa `bridge: null`. Es coherente: `listUnitsAction` exige el mismo permiso, y sin él `units` llega vacío y el formulario no deja elegir unidad. No puede darse una tabla que diga «no convertible» mientras el servidor costea con el puente. No es hallazgo.
4. **CRLF.** Los cuatro archivos de `app/(private)/pedidos/components` (y `order-sheet.test.tsx`/`pedidos-viewport.test.tsx`) ya eran CRLF en el merge-base: todas sus líneas en base y en HEAD. El aviso de `git diff --check` es el retorno de carro de las líneas añadidas, no un espacio real. Normalizarlos agrandaría el diff sin motivo. No es hallazgo.
5. **T8+T9 en un solo commit** (ea4eecda): m5.
6. **`review-blocked-orders` compara también `unitId`.** Es correcto y necesario: sin esa comparación, una edición de la unidad entre la lectura y el candado haría que el importe (calculado con `row.unitId`) y la reserva (con `locked.unitId`) usaran unidades distintas. Sin test propio: m6.

## Hallazgos

### Bloqueantes
Ninguno.

### Menores
- **m1** — `specs/QC-204-conversion-unidad-pedido-a-insumo/tasks.md:159`: T15 sigue `[ ]`, y CHECKPOINTS exige todas las tasks en `[x]`. Lo que falta es solo la condición del leader (`./init.sh` completo en verde tras dbcffad9). El leader marca la casilla al confirmarlo. No vuelve al implementer.
- **m2** — `progress/impl_QC-204-conversion-unidad-pedido-a-insumo.md:116`: el mapa de R26 dice «sin test propio». Debería citar los casos concretos que lo cubren: `tests/guards/guard-dependencias-aprobadas.test.ts` y `tests/unit/pedidos/delete-order.test.ts`. CHECKPOINTS pide que cada R mapee a un test, y hoy hay que deducirlo.
- **m3** — `app/(private)/pedidos/components/order-form.tsx:464,468`: al editar un pedido antiguo con `unit_id` NULL, el formulario abre con `unitId` vacío (la tabla pinta guiones), pero el bloque de costo muestra el importe guardado (`useOrderCostQuote(order?.ingredientsCost …)`), no el guion que pide R19. R20/R22 justifican mantener el importe guardado, así que es una ambigüedad del spec más que un fallo. Conviene que el humano decida si R19 aplica también a ese estado inicial de la edición. Ningún test lo cubre.
- **m4** — `e2e/pedido-conversion-de-unidad.spec.ts:66-70`: en R25 (2 l al 10 % sobre insumo en kg) las cifras de costo (4,0000) y de reserva (0,2 kg) coinciden con las que daba la fórmula vieja sin convertir, como reconoce la bitácora. Solo las marcas distinguen la aproximación. Un pedido en ml (p. ej. 2000 ml → 0,2 kg) haría que el importe y lo apartado también fueran discriminantes. La conversión en sí está probada en unit e integración, por eso es menor.
- **m5** — commit ea4eecda: T8 y T9 en un solo commit, contra `docs/conventions.md:68` («Un commit por task lógica»). Está justificado en la bitácora: los tests comparten archivos. Se anota y no se pide rehacer el historial.
- **m6** — `lib/modules/pedidos/domain/review-blocked-orders.ts:121`: la nueva comparación de `unitId` entre la lectura y la fila bloqueada no tiene un caso que la ejercite. El análogo de cantidad sí lo tiene: «R15, R24: si una edicion cambio la cantidad entre la lectura y el candado…».
- **m7** — `lib/modules/errores/domain/error-catalog.ts:185-186`: el mensaje nuevo dice «algun» sin tilde. Es copy de usuario, y las entradas recientes del catálogo sí llevan tilde («versión», «ajústala»). La bitácora (`progress/impl_…md:1`) también tiene el encabezado desfasado («faltan el E2E y el gate completo»).
