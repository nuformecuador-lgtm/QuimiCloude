# impl QC-217 — pestana-por-acondicionar

Spec aprobado el 2026-10-08 (1f65f2f2). Implementado en el worktree `.worktrees/QC-217-pestana-por-acondicionar`.

## Tandas

| Tanda | Tasks | Commit | Verificación |
|---|---|---|---|
| 1 backend | T1, T2, T3 | 0e0442f8 | lint 0 errores; guard 55/55 archivos; `.int` 21/21 (nuevo 5/5); tests de T2 140/140. Typecheck y 2 casos del barrido rojos hasta la tanda 2 (archivos de `app/` aún inexistentes) |
| 2 frontend | T4, T5 | 0cf04190 | typecheck limpio; lint 0 errores (7 avisos ajenos); `vitest related` 4574 pass, 3 fail (todos en `tests/baseline-rojos.json`); guard 742 pass, 11 skip |
| 2b routes | T4 (`conditioningOrderRoute`) | 0427bbcb | commit aparte y mínimo: `lib/shared/routes.ts` también lo toca QC-221 |
| 3 E2E + cierre | T6, T7, T8 | (este commit) | typecheck limpio, lint 0 errores; E2E abajo |

T6: por decisión del humano en esta sesión **no se corre `./init.sh`** (muere por memoria). Sustituto:
typecheck + lint + `vitest related` + `vitest run guard`, todo verde salvo rojos del baseline. El gate
completo lo corre CI en el PR.

Rojos de `vitest related` (todos listados en `tests/baseline-rojos.json`, no son de esta feature):
`tests/unit/recetas/scope.test.ts`, `tests/unit/recetas/module-contract.test.ts`,
`tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`.

## Archivos

Producción:
- `lib/modules/pedidos/domain/order-catalog.ts` (`conditionedBy`, tipo local `OrderSummaryFilter`), `ports/order-summary-reader.ts`, `adapters/driven/persistence/order-catalog-prisma.ts`
- `lib/modules/asignaciones/domain/`: `assignment-views.ts` (mod), nuevos `conditioning-order-view.ts`, `list-conditioning-orders.ts`, `list-conditioned-orders.ts`, `get-conditioning-order.ts`
- `lib/modules/asignaciones/index.ts`, `lib/composition/index.ts` (tres claves al final)
- `lib/shared/routes.ts` (`conditioningOrderRoute`, solo)
- `app/(private)/asignacion/page.tsx`, `components/index.ts`, `components/assignment-view-tabs.tsx` (mod)
- `app/(private)/asignacion/components/` nuevos: `order-distribution-full.tsx`, `conditioning-orders-{columns,table,list-section,empty,skeleton}.tsx`, `conditioned-orders-{columns,table,list-section}.tsx`, `conditioning-orders-href.ts`
- `app/(private)/asignacion/acondicionamiento/[id]/page.tsx`, `components/index.ts`, `components/conditioning-order-screen.tsx`

Fuera de la lista del spec:
- `app/(private)/asignacion/components/conditioning-orders-href.ts`: helpers de URL sin `'use client'`, los usan secciones de servidor y tablas de cliente.
- `tests/unit/asignaciones/conditioning-doubles.ts`: dobles compartidos.
- `tests/integration/aislamiento.json`: entrada del `.int` nuevo (la exige la guardia de aislamiento).
- `tests/unit/recetas-ui/recipe-route-contract.test.ts`: fija los exports de `routes.ts`; una línea.
- `tests/unit/shared/data-table-alcance.test.ts`: alta de `e2e/acondicionamiento.spec.ts` en su lista cerrada (treinta → treinta y uno); el E2E localiza `data-table-row-<id>` y `data-table-cell-orderNumber`. Vuelta 2 tras el review.
- `tests/guards/guard-identificador-de-request.test.ts`: alta de `acondicionamiento.spec.ts` en `E2E_ESPERADOS`, con motivo; no ejercita el identificador de petición. Vuelta 2 tras el review.

Tests nuevos: `tests/integration/pedidos/order-catalog-conditioned-by.int.test.ts`; `tests/unit/asignaciones/{list-conditioning-orders,list-conditioned-orders,get-conditioning-order}.test.ts`; `tests/unit/asignaciones-ui/{conditioning-orders-columns,conditioning-orders-list-section,conditioning-order-page,conditioning-order-screen}.test.tsx`; `e2e/acondicionamiento.spec.ts`.

Tests ampliados: `assignment-views`, `acondicionamiento-authorization`, `asignaciones-facade`, `acondicionamiento-rol`, `order-catalog` (casos nuevos), `asignacion-page`, `session-once-per-request-render`, `require-page-permission`, `order-route-contract`, `recipe-route-contract`, `guard-pantallas-exigen-permiso` (veinte → veintiuna). Fixtures con `conditionedBy: null` sin tocar aserciones: los siete de `tests/unit/asignaciones/` listados en tasks.md.

## Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/unit/asignaciones/assignment-views.test.ts` › «R1 — el permiso del acondicionador anade…» (4 casos) |
| R2 | `tests/unit/asignaciones/acondicionamiento-authorization.test.ts` › «R2: resolveAssignmentViews con los permisos del rol…», «R2: la vista por defecto del rol es `por_acondicionar`»; `tests/unit/asignaciones-ui/asignacion-page.test.tsx` › «R2: el rol sembrado ve exactamente…» |
| R3 | `assignment-views.test.ts` › «R3 — sin el permiso…» (Administrador, Operador, Empacador) |
| R4 | `asignacion-page.test.tsx` › «R4: %s pidiendo `?vista=por_acondicionar` o `?vista=acondicionados` cae a su vista por defecto» |
| R5 | `asignacion-page.test.tsx` › «R5: `?vista=acondicionados` marca «Terminados»…», «R5: las dos pestañas se rotulan…, 44x44» |
| R6 | `tests/unit/asignaciones/list-conditioning-orders.test.ts` › «R6: consulta la empresa del actor con POR_ACONDICIONAR y EN_ACONDICIONAMIENTO…», «R6: el total y la paginacion…» |
| R7 | `list-conditioning-orders.test.ts` › 5 casos R7; `tests/unit/pedidos/order-catalog.test.ts` › «R7: copia conditionedBy…»; `.int` › «R7: `conditionedBy` viaja en el resumen» |
| R8 | `tests/unit/asignaciones-ui/conditioning-orders-columns.test.tsx` › 8 casos R8 («12 × 500 g / 4 × 1 kg», «Sin presentación», «—») |
| R9 | `tests/unit/asignaciones-ui/conditioning-orders-list-section.test.tsx` › «R9: sin pedidos dice…», «R9: una página pasada del total…» |
| R10 | `conditioning-orders-list-section.test.tsx` › «R10: pasar de página conserva ?vista=…» |
| R11 | `tests/unit/asignaciones/list-conditioned-orders.test.ts` › 5 casos R11 (ENTREGADO fuera); `.int` `order-catalog-conditioned-by` › 4 casos R11 |
| R12 | `conditioning-orders-columns.test.tsx` › «R12: mismos ids, rótulos…», «R12: solo la celda del número cambia…»; `conditioning-orders-list-section.test.tsx` › «R12: vacía dice…» |
| R13 | `list-conditioned-orders.test.ts` › 4 casos R13; `conditioning-orders-columns.test.tsx` › «R13: las columnas del Empacador siguen sin ningún enlace» |
| R14 | `conditioning-orders-columns.test.tsx` › «R14:» (enlace y 44 px); `tests/unit/pedidos-ui/order-route-contract.test.ts` › «R14: conditioningOrderRoute cuelga de /asignacion…» |
| R15 | `tests/unit/asignaciones/get-conditioning-order.test.ts` › «R15: consulta ese pedido…», «R15: %s abre con los mismos valores que su fila»; `tests/unit/asignaciones-ui/conditioning-order-screen.test.tsx` › «R15:» ×3 |
| R16 | `conditioning-order-screen.test.tsx` › «R16:» sin `button` ni `form`, enlace de vuelta según estado |
| R17 | `get-conditioning-order.test.ts` › 5 casos R17 (ENTREGADO incluido, mismo error); `tests/unit/asignaciones-ui/conditioning-order-page.test.tsx` › «R17: con OrderNotFoundError…», «R17: un id que no es uuid…» |
| R18 | `conditioning-order-page.test.tsx` › «R18:» por rol, sin llamar a la fachada; `tests/unit/identity/require-page-permission.test.ts` › «R18:» |
| R19 | it.each R19 en `list-conditioning-orders`, `list-conditioned-orders`, `get-conditioning-order` (ningún puerto invocado); `tests/unit/composition/asignaciones-facade.test.ts` › 3 casos R19 |
| R20 | it.each R20 en los mismos tres archivos (`invalid_input` sin tocar puertos) |
| R21 | `tests/unit/identity/roles/acondicionamiento-rol.test.ts` › «R21: son ocho rutas exactas…», «R21: la pagina del detalle lo exige con requirePagePermission», «R21: una ruta sintetica… sale como inesperada». Comprobado a mano: quitar cada ruta lo pone rojo |
| R22 | `e2e/acondicionamiento.spec.ts` › «R22 - el acondicionador aterriza…» |
| R23 | `e2e/acondicionamiento.spec.ts` › «R23 - <rol> no ve «Por acondicionar»…» ×3 (Administrador, Operador, Empacador) |
| R24 | revisión del diff (sin `package.json`, `db/schema.prisma` ni `db/migrations/`) + `guard-dependencias-aprobadas` verde |

## E2E (base local `QuimiCloude`, sin migraciones pendientes: `prisma migrate status` al día)

El worktree no tiene `.env`: se corrió cargando el del repo principal (`set -a && . ./.env`).

`pnpm exec playwright test e2e/acondicionamiento.spec.ts`:
- corrida 1: `8 passed (3.1m)`
- corrida 2: `1 failed, 7 passed (2.7m)` — `[webkit] R23 - Administrador`: `TimeoutError: page.waitForURL` en `e2e/helpers/landing.ts:79` (`loginAndLand`), con `next dev` aún compilando (`POST /login` ~26 s). Fallo del login compartido, antes de las aserciones del spec.
- corrida 3: `8 passed (49.3s)`

`pnpm exec playwright test e2e/empaque.spec.ts`: `2 passed (47.3s)`

Decisiones del E2E que el spec no fijaba:
- R23 no afirma que falte la fila de A: el Administrador cae en «Todos», que lista legítimamente todos los pedidos.
- «Sin botones» se mira dentro de `conditioning-order-screen`; el layout privado tiene botones de navegación.

## Integración con `origin/dev` (57fa8326, 2026-10-08)

`git merge origin/dev`. Siete conflictos, todos de unión (ninguno decide comportamiento):

- `lib/modules/pedidos/domain/order-catalog.ts`: se conservan los dos tipos nuevos, `OrderSummaryFilter` (con `conditionedBy`) y `OrderHistorySummary`.
- `lib/modules/pedidos/ports/order-summary-reader.ts`: el import trae `OrderHistorySummary`, `OrderSummaryFilter` y `OrderNumber`.
- `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`: el import trae los dos tipos; el filtro por `conditionedBy` queda intacto.
- `lib/shared/routes.ts`: conviven `conditioningOrderRoute` y `executionTraceRoute`.
- `tests/guards/guard-pantallas-exigen-permiso.test.ts`: la lista ya tenía las dos rutas; nota de dev + nota propia, contador de veintiuna a VEINTIDOS.
- `tests/unit/composition/asignaciones-facade.test.ts`: censo con las dos de dev (`getExecutionTrace`, `listExecutionTraces`) y las tres propias.
- `tests/unit/shared/data-table-alcance.test.ts`: entran `recorrido-ejecucion` y `acondicionamiento`; centinela de treinta y uno a TREINTA Y DOS (32 specs de `e2e/` referencian `data-table`).

Sin cambios en `pnpm-lock.yaml`. El merge trae `db/migrations/20261008120843_integrations_permission` (solo datos); `prisma migrate status` sobre la base local: «Database schema is up to date!».

Verificación (con `DATABASE_URL` del `.env` del repo principal):
- `pnpm typecheck`: sin errores.
- `pnpm lint`: `0 errors, 7 warnings` (warnings preexistentes en tests ajenos).
- `pnpm exec vitest run tests/guards tests/unit/shared/data-table-alcance.test.ts tests/unit/composition/asignaciones-facade.test.ts`: `Test Files 51 passed (51)`, `Tests 710 passed | 7 skipped (717)`.
- `pnpm exec vitest related --run` sobre los cuatro fuentes en conflicto: `Test Files 3 failed | 344 passed (347)`, `Tests 3 failed | 5087 passed | 45 skipped`. Los tres rojos están en `tests/baseline-rojos.json`: `tests/unit/recetas/scope.test.ts`, `tests/unit/recetas/module-contract.test.ts`, `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`.
