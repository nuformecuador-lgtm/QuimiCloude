# review QC-215 — estados-de-acondicionamiento

## Vuelta 1 (F2.2, 2026-10-08)

Rama `feature/QC-215-estados-de-acondicionamiento`, HEAD `ecf577cf`. Diff contra `origin/dev`
(`de39fe92`, que es también la merge-base): 110 archivos. Spec R1–R40, T1–T25, D1–D14 (vale la D14
corregida). No se usó el grafo: Grep/Read/git bastaron.

### Verificación ejecutable (corrida por el reviewer)

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | verde (`tsc --noEmit` sin errores) |
| `pnpm run lint` | `0 errors, 7 warnings` (warnings ajenos al diff) |
| `pnpm exec vitest run guard` | 55 archivos, 742 passed, 11 skipped |
| `vitest run` de los 43 unit tocados por el diff | 43/43 archivos, 1270 passed |
| `vitest related --run` sobre los 36 archivos de producción de `app/` y `lib/` | 671 passed, 3 failed (674 archivos); los 3 rojos se detallan abajo |
| `.int`: `order-conditioning`, `order-conditioning-constraints`, `order-conditioning-states-rollback`, `order-customer`, `order-finished-at` | 5/5 archivos, 41 passed |

Rojos de `vitest related`:
- `tests/unit/recetas/module-contract.test.ts` y `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`
  están en `tests/baseline-rojos.json`. Son ajenos.
- `tests/integration/proveedores/catalog-line.int.test.ts` (R32) no está en el baseline. La rama no
  tiene diff en `proveedores`, así que es ajeno, como avisó el leader. Lo anoto aparte en
  «Observaciones» porque puede poner rojo `gate-completo`.

No corrí `./init.sh` (por indicación del humano: falta de memoria) ni los E2E (la bitácora registra
30 + 8 passed).

### Checklist — `CHECKPOINTS.md`

- [x] `requirements.md` con requisitos EARS R1–R40.
- [x] `design.md` con alternativas descartadas (§ 6, § 7b y § 8 (B)).
- [x] `tasks.md`: T1–T25 marcadas `[x]`. T19 y T25 llevan la salvedad de `./init.sh` sustituido por CI.
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada de esa lista: consume el
  permiso de QC-216, no toca `lib/modules/identity/**` ni `specs/QC-202-*`, y copia el patrón de
  QC-168 y QC-138 en lugar de duplicarlo.
- [ ] Assignee y candado: no lo puedo verificar desde aquí. Es del leader.
- [x] Trazabilidad: cada R1–R40 mapea a casos concretos (ver «Trazabilidad»).
- [x] El mapa `R<n> → test` está en `progress/impl_…md`.
- [x] typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente en el PR #170 (ver «Observaciones»).
- [x] Flujo crítico: Terminar el empaque mueve inventario. Hay E2E de Playwright ajustados, sin spec
  nuevo, con su salida en la bitácora (T18: 30 passed; T24: 8 passed).
- [x] Dependencias: ni `package.json` ni `pnpm-lock.yaml` cambian contra `origin/dev` (R35).
- [x] Sin secretos ni configuración hardcodeada. No hay webhooks.
- [ ] `./init.sh` (rápido) en verde: no se corrió, por la waiver del humano. CI lo sustituye.
- [ ] El cierre de `progress/features/QC-215.md` y desmontar el worktree van después de este paso.

### Checklist — `docs/checkpoints-proyecto.md`

- [x] typecheck/lint sin errores; los E2E son de Playwright.
- [x] Multiplataforma: la UI solo cambia etiquetas, variantes de `Badge` y `disabled` de un item del
  menú. No hay CSS nuevo, ni `100vh`, ni `:hover`, ni inputs.
- [x] Sin tabla nueva. `orders` ya tiene RLS y FORCE. La columna nueva `conditioned_by` lleva una FK
  compuesta con `company_id`.
- [x] El permiso `acondicionamiento.modificar` se valida en `domain/`
  (`start-/finish-conditioning.ts`, con `requirePermission` antes de zod y de los puertos) y tiene
  test (R15, R17).
- [x] Acceso a datos solo por adaptador driven Prisma. Los dos `updateMany` nuevos y la relectura
  usan `orderCompanyScope(scope)`. El rechazo cruzado está probado en `order-conditioning.int`
  (R14, «de otra empresa es not_found»).
- [x] Migraciones M1 y M2 con `down.sql`. El DOWN de M1 aborta si hay filas en los estados nuevos y
  restaura el texto literal de antes: lo comparé con `20260904135210`, `20260923120000` y
  `20260925120000`, y ninguna migración posterior a `20261001170000` toca esas restricciones.
  Probado en `order-conditioning-states-rollback.int`.
- [x] Hexagonal: el puerto y el dominio no importan framework; `asignaciones` importa solo
  `@/lib/modules/pedidos`; el cableado está en `lib/composition`. Guardias en verde.
- [x] Sin Server Action, ruta ni `page.tsx` nuevos (QC-217/QC-218).

### Checklist — `docs/perfil-agentes.md > reviewer`

- [x] 5. Calidad y seguridad: ver arriba.
- [x] 6. Multiplataforma: sin hallazgos.
- [x] 7. Dependencias: ninguna.
- [x] 8. Aislamiento por empresa: no hay modelo nuevo. Las consultas nuevas filtran por empresa y
  hay test del acceso cruzado.
- [ ] 9. Comentarios: **falla**, ver hallazgo 1.

### Trazabilidad (comprobada)

Comprobé con Grep, en su archivo, un muestreo de los casos del mapa: R4, R6, R7, R10, R15, R17,
R23, R25, R27, R31, R33, R36, R38 y R39. Todos existen y afirman lo que dicen: no hay tests vacíos.
Los archivos del mapa pasan en las corridas de arriba. Detalle por bloque:

- **R5/R6:** unit `order-packing.test.ts` más los casos de rechazo de
  `finish-with-finished-goods.int`. Estos afirman `EN_EMPAQUE` y `finishedAt` nulo en
  presentation_without_content, recipe_not_found, incompatible_units, insufficient_material y el
  rollback de finishedGoods.
- **R8–R14:** `order-conditioning.int` (11 casos, incluida la concurrencia real de R10) y los unit
  de dominio y de caso de uso.
- **R24–R27, R30:** los `.int` de constraints y rollback, más el test estático de la migración.
- **R36–R39:** `set-order-customer.test.ts` (incluida la carrera bajo `lockAliveById`),
  `order-customer.int`, `update-order.test.ts` (R38 con los catálogos explotando) y
  `order-row-actions.test.tsx` (diez estados, con y sin `canEditCustomer`).
- **R40:** `e2e/pedido-con-cliente.spec.ts` R40(c). El caso cancela el pedido y luego afirma
  `aria-disabled="true"`, que el diálogo no se abre, que la celda no cambia y que la fila en BD es
  igual.

**Cambio en `tests/unit/pedidos-ui/order-customer-dialog.test.tsx` (CANCELADO → TERMINADO): es
correcto y no pierde cobertura.**
- Lo que el caso de QC-156 R32 probaba era que la acción «Cliente» abre el diálogo aunque el pedido
  tenga la edición general cerrada. Con D14, `CANCELADO` ya no sirve para eso, porque la acción
  está deshabilitada. `TERMINADO` sí: tiene `ORDER_STATUS_IS_FINAL = true` (Editar deshabilitado) y
  `ORDER_STATUS_ACCEPTS_CUSTOMER_CHANGE = true`. La propiedad se conserva y el caso cubre además un
  estado nuevo.
- La mitad «solo se monta mientras está abierto» sigue igual.
- El comportamiento en `CANCELADO` (deshabilitada, no emite) queda cubierto en
  `order-row-actions.test.tsx` («R39: con canEditCustomer aparece deshabilitada en %s y pulsarla no
  emite», con `ENTREGADO` y `CANCELADO`) y en el E2E R40(c).

### Hallazgos

1. **BLOQUEANTE — comentarios de producción que citan `QC-<n>`, `R<n>` y `D<n>`** (regla 9 de
   `docs/perfil-agentes.md > reviewer`; `docs/conventions.md > Comentarios`). Son líneas que añadió
   el commit `eedf38e7`:
   - `lib/modules/pedidos/domain/errors.ts:296`: `/** QC-215 (R36, D14): una accion autorizada que…`
   - `lib/modules/pedidos/domain/set-order-customer.ts:33`: ` * QC-215 (R36, R37, D14): los estados en los que…`
   - `lib/modules/pedidos/domain/set-order-customer.ts:73`: `// R36: antes de comparar el cliente…`

   Hace falta quitar las referencias `QC-215`, `R36`, `R37` y `D14` y dejar solo el porqué. Por
   ejemplo, en la línea 73: «Antes de comparar el cliente y de leer el catálogo, para que un pedido
   cerrado rechace aunque la entrada no cambie nada». El resto del diff de producción está limpio:
   lo comprobé con grep sobre las líneas `+` de `app/`, `lib/` y `db/`.

2. **menor — la bitácora está desfasada.** En `progress/impl_QC-215-…md`:
   - `## Pendiente` aún lista «Cerrar el gate de A2+A3» y «T19», y las dos están cerradas o
     sustituidas por CI.
   - Bajo el mapa consolidado dice «Los e2e de R34 siguen sin ejecutar», que contradice «T18 — E2E»
     (30 passed).

   Hay que alinear esas dos frases con el estado real.

3. **menor — el mapa de R6 nombra solo el unit.** La fila R6 del mapa consolidado cita solo
   `order-packing.test.ts`, un caso sintético de matriz. Lo que de verdad prueba R6 (estado previo,
   sin `finishedAt`, sin consumo y sin lotes) son los casos de rechazo de
   `finish-with-finished-goods.int.test.ts`, que la tanda C1 sí menciona. Conviene añadirlos a la
   fila.

4. **menor — un JSDoc impreciso en `app/(private)/pedidos/components/order-row-actions.tsx`.**
   Dice «cualquiera de los estados de acondicionamiento (`POR_ACONDICIONAR`,
   `EN_ACONDICIONAMIENTO`, `TERMINADO`)». Según el vocabulario de requirements.md, `TERMINADO` no es
   un estado de acondicionamiento. Además, la línea siguiente pasa de 120 columnas.

### Observaciones (no son hallazgos de esta rama)

- `tests/integration/proveedores/catalog-line.int.test.ts` (R32) sale rojo en local y no está en
  `tests/baseline-rojos.json`; según la bitácora, dev lo sacó en `f2be3eb8`. La rama no toca
  `proveedores`. Si también sale rojo en CI, `gate-completo` lo marcará igual. Decide el leader, no
  esta rama.
- QC-156 (R14, R32 y E2E R40(c)) queda enmendada por D14 y QC-202 queda absorbida. Marcar sus specs
  es tarea del leader (design § 7b y § 8).

### Veredicto

**RECHAZADO.** Un bloqueante (hallazgo 1) y tres menores.

Para pasar falta quitar las referencias `QC-215`/`R36`/`R37`/`D14` de los tres comentarios de
producción del hallazgo 1. Con eso, y con `gate-completo` en verde en CI, no veo otro impedimento.
Los menores 2–4 conviene arreglarlos en la misma vuelta.

## Vuelta 2 (acotada a ecf577cf..9a772373)

Commit `9a772373`. Toca 4 archivos: `order-row-actions.tsx`, `pedidos/domain/errors.ts`,
`set-order-customer.ts` y la bitácora. Todos los cambios son de comentarios o de texto; ninguna línea
de código cambia.

### Hallazgos de la vuelta 1

| # | Estado | Comprobación |
|---|---|---|
| 1 BLOQUEANTE (citas en comentarios) | **resuelto** | Los tres comentarios ya no citan `QC-215`/`R36`/`R37`/`D14` y conservan el porqué. Un grep de `QC-<n>`, `R<n>`, `D13`/`D14`, `design.md` y «decisión cerrada» sobre las líneas `+` de `origin/dev...9a772373` en `app/`, `lib/` y `db/` no encuentra nada |
| 2 menor (bitácora desfasada) | **resuelto** | «Pendiente» refleja la waiver y el CI; la nota de R34 cita T18 (30 passed) |
| 3 menor (fila R6) | **resuelto** | Fila nueva con los cuatro casos de rechazo de `finish-with-finished-goods.int` |
| 4 menor (JSDoc de `order-row-actions.tsx`) | **resuelto** | `TERMINADO` aparece separado de los estados de acondicionamiento; ninguna línea del archivo pasa de 120 columnas |

### Verificación

- `pnpm run typecheck`: verde.
- `pnpm run lint`: 0 errores (7 warnings ajenos).
- `vitest related --run` sobre los tres archivos de producción tocados: 359 passed, 2 failed (361 archivos):
  - `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` está en el baseline.
  - `tests/unit/inventario/adjust-batch-dialog.test.tsx` («R9 — con el lote sobre-reservado…»)
    no está en el baseline. Corrido solo pasa 30/30, y la rama no toca `inventario`. Lo trato como
    inestable bajo carga y ajeno.
- CI: según el leader, `gate-completo` pasó en el PR #170 sobre `ecf577cf`, y `catalog-line.int`
  no falló allí. Queda resuelta la observación de la vuelta 1. Como 9a772373 solo cambia
  comentarios, no espero cambios en CI, pero el check debe volver a salir verde sobre el commit
  nuevo antes del merge.

### Regresiones

Ninguna.

### Hallazgos nuevos

Ninguno.

### Veredicto

**OK.** 0 bloqueantes y 0 menores abiertos.
