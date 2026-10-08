# review QC-217 — pestana-por-acondicionar

Revisado el 2026-10-08 sobre `1f65f2f2..71850a00` (0e0442f8, 0cf04190, 0427bbcb, 71850a00).
`./init.sh` no se corrió (decisión del humano: OOM local; el gate lo corre CI). El MCP del grafo no
se usó; la revisión es por Grep/Read y ejecución.

## Verificación ejecutada

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | verde |
| `pnpm lint` | 0 errores (7 avisos ajenos en tests no tocados) |
| `vitest related --run --project ui --project node <archivos de app/ lib/ tests/ del diff>` | 4976 pass, **4 fail**: 3 en `tests/baseline-rojos.json` (`recetas/scope`, `recetas/module-contract`, `navegacion/pantallas-exigen-permiso`) y **1 nuevo**: `tests/unit/shared/data-table-alcance.test.ts` |
| `vitest run --project node --project ui guard` | 741 pass, **1 fail nuevo**: `tests/guards/guard-identificador-de-request.test.ts` |
| `vitest run --project integration tests/integration/pedidos/order-catalog-conditioned-by.int.test.ts` (con el `.env` del repo principal) | 5/5 verde |

## Checklist

### CHECKPOINTS.md
- [x] requirements.md con EARS R1–R24.
- [x] design.md con alternativas descartadas (§8, siete).
- [x] tasks.md T1–T8 marcadas `[x]`. (T6 dice «`./init.sh` en verde»: sustituido por decisión del humano; ver hallazgo 1, el sustituto no fue completo.)
- [x] design.md abre con `## Lo que ya existe`, con búsqueda y tabla; el diff no re-crea nada de la lista (`OrderDistributionFull` es nuevo y justificado frente a `OrderDistributionLabel`, §8.3).
- [x] Mapa R → test en `progress/impl_…md`.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` verde: **no lo estará** con los dos rojos nuevos (hallazgo 1).
- [x] Flujo crítico (permisos) con E2E Playwright y su salida local en la bitácora.
- [x] Sin dependencias nuevas (`package.json`, `pnpm-lock.yaml`, `db/` intactos en el diff).
- [x] Sin secretos ni configuración hardcodeada; sin webhooks.
- [ ] Verificación final: pendiente de CI y de este veredicto.

### docs/checkpoints-proyecto.md
- [x] Sin tablas ni migraciones nuevas; las consultas filtran por `actor.companyId` y el `.int` prueba que el filtro no cruza empresas.
- [x] Permiso validado en los tres casos de uso (`requirePermission` primera línea), con tests que afirman que ningún puerto se invoca.
- [x] Acceso a datos solo por el adaptador driven Prisma.
- [x] `domain/` solo importa `zod` y el contrato `@/lib/modules/pedidos`; `lib/shared/routes.ts` sigue siendo hoja.
- [x] Página del detalle valida permiso en servidor (`requirePagePermission`) antes de leer; secciones con datos por props.
- [x] Multiplataforma: `min-h-dvh`, enlaces y pestañas `min-h-11 min-w-11`, textos de 16 px en el detalle, sin inputs nuevos; `hover:underline` va con `focus-visible:underline`, no es la única vía.

### docs/perfil-agentes.md > reviewer
- [x] 5 Calidad y seguridad: capas separadas, sin hardcode de contexto.
- [x] 6 Multiplataforma: ver arriba.
- [x] 7 Dependencias: ninguna.
- [x] 8 Aislamiento por empresa: sin modelo nuevo; consultas por empresa con test de cruce (`.int` R11, «el filtro no cruza empresas»).
- [x] 9 Comentarios: ninguna línea añadida en `app/` ni `lib/` cita `QC-…`, `R<n>`, `D<n>`, `design.md` ni «decisión cerrada» (grep sobre el diff).

### Trazabilidad R1–R24
Todos los R tienen al menos un caso con `R<n>` en el nombre y aserciones reales (revisados a mano R4, R11, R15, R17, R19, R20):
R1–R3 `assignment-views` / `acondicionamiento-authorization` / `asignacion-page`; R4–R5 `asignacion-page`; R6–R7 `list-conditioning-orders` + `.int`; R8, R12–R14 `conditioning-orders-columns`; R9–R10 `conditioning-orders-list-section`; R11 `list-conditioned-orders` + `.int`; R15–R16 `get-conditioning-order` / `conditioning-order-screen`; R17–R18 `get-conditioning-order` / `conditioning-order-page` / `require-page-permission`; R19–R20 los tres casos de uso + `asignaciones-facade`; R21 `acondicionamiento-rol`; R22–R23 `e2e/acondicionamiento.spec.ts`; R24 por revisión del diff (sin `package.json`, `db/schema.prisma` ni `db/migrations/`).

### Puntos pedidos por el leader
- [x] `lib/shared/routes.ts`: cambio mínimo (+5 líneas, solo `conditioningOrderRoute`) y en commit aparte (0427bbcb, un único archivo).
- [x] Archivos fuera de «Archivos esperados»: las cuatro justificaciones valen.
  - `conditioning-orders-href.ts`: helpers sin `'use client'` para usarlos desde secciones de servidor y tablas de cliente.
  - `conditioning-doubles.ts`: dobles de test compartidos.
  - `aislamiento.json`: la exige la guardia de aislamiento para el `.int` nuevo.
  - `recipe-route-contract.test.ts`: fija la lista cerrada de exports de `routes.ts`.

## Hallazgos

1. **BLOQUEANTE — el E2E nuevo pone rojas dos listas cerradas, fuera del baseline.** `e2e/acondicionamiento.spec.ts` (commit 71850a00) rompe:
   - `tests/unit/shared/data-table-alcance.test.ts` › «la lista de specs E2E que referencian data-table es cerrada, y son estos treinta». Recibe 31: el spec nuevo referencia `data-table-row-` y `data-table-cell-orderNumber` (líneas 119–120).
   - `tests/guards/guard-identificador-de-request.test.ts` › «no hay ningun archivo nuevo en e2e/…»: `e2e/acondicionamiento.spec.ts` no está en `E2E_ESPERADOS`.

   Ninguno de los dos está en `tests/baseline-rojos.json`, así que `gate-completo` saldrá rojo. La bitácora da «guard 742 pass» y un `vitest related` limpio, pero los midió en la tanda 2, antes de crear el E2E. **Qué falta:** dar de alta `e2e/acondicionamiento.spec.ts` en las dos listas cerradas, como hicieron los E2E anteriores (empaque, etc.), con su motivo. Después, volver a correr las guardias y `vitest related` con el E2E ya en el árbol. Son dos archivos más fuera de «Archivos esperados», y hay que anotarlos en la bitácora.

2. **menor — el commit 0cf04190 no compila solo.** `conditioning-orders-columns.tsx` usa `conditioningOrderRoute` y la ruta no llega hasta 0427bbcb, el commit siguiente. Es el precio de aislar `routes.ts` para el choque con QC-221. No rompe nada en el PR, pero ese commit no sirve para `git bisect`. La próxima vez, el commit de `routes.ts` va antes del que lo consume.

3. **menor — la pantalla de detalle duplica las etiquetas de estado.** `conditioning-order-screen.tsx › statusLabel` repite «Por acondicionar», «En acondicionamiento» y «Terminado», en vez de reutilizar `COMPANY_ORDER_STATUS_LABELS` como pide design §3/§4.2. El comentario lo justifica: esas etiquetas viven en un módulo `'use client'`. El motivo es razonable, pero queda una segunda fuente de verdad.

4. **menor — T6 no se cerró.** El texto de T6 dice «`./init.sh` en verde», y la task está marcada `[x]` con un sustituto parcial, que además no detectó el hallazgo 1. Con la decisión del humano la marca vale, siempre que CI cubra el gate.

## Veredicto

**RECHAZADO** por el hallazgo 1, con dos rojos nuevos fuera del baseline. El resto está bien: trazabilidad R1–R24 completa, regla 9 limpia, `routes.ts` mínimo y aislado. Cuando el implementer dé de alta el E2E en las dos listas cerradas, la vuelta 2 puede acotarse a ese diff.
