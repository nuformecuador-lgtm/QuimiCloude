# Bitácora — auto-asignar empacador al finalizar

Ficha nacida del chat el 2026-09-27 (sin issue: vive solo en disco). Rama
`feature/auto-assign-empacador` en `.worktrees/auto-assign-empacador/`, desde `origin/dev`.
`zone: backend`, `complexity: medium`. No entra en `feature_list.json` (es la copia del board y no
hay issue que importar; se documenta aquí y en el spec).

## Archivos tocados

- `lib/modules/asignaciones/domain/finish-assigned-order.ts` — `people` + `groups` en deps;
  `ensurePackerAssignments` antes de transicionar; `compensatePackerAssignments` si falla.
- `lib/composition/index.ts` — ata los dos directorios ya existentes en `finishAssignedOrder`.
- `tests/unit/asignaciones/finish-assigned-order.test.ts` — dobles nuevos + 12 casos.
- `tests/integration/asignaciones/finish-auto-assign-packers.int.test.ts` — nuevo (3 casos).
- `tests/integration/aislamiento.json` — censo (`transaccion`).
- `tests/integration/asignaciones/responsible-eligibility.int.test.ts`,
  `tests/integration/asignaciones/finished-orders.int.test.ts`,
  `tests/integration/pedidos/finish-with-finished-goods.int.test.ts` — cablean `people`/`groups`.
- `e2e/empaque.spec.ts` — fixture con equipo vinculado + aserción de la fila (sin ejecutar aquí).
- `specs/auto-assign-empacador-al-finalizar/` — requirements (R1-R10), design, tasks.

## Mapa R -> test

| R | unit | integración |
|---|---|---|
| R1 todos los encontrados, origen grupo | grupo+operario; a-todos | empacador-tras-asignar |
| R2 sin candidatos no escribe | sin-empacadores; sin-responsables | sin-empacadores |
| R3 por permiso, activos | nombre-de-rol; inactivo | (permiso real del seed/rol efímero) |
| R4 nombre vivo | nombre-congelado-vivo | fila con `workGroupName` del grupo |
| R5 idempotente, no borra | ya-asignado-no-reinserta | conserva-origen-no-duplica |
| R6 compensa + error original | compensa; sin-nada-no-compensa | — (unit) |
| R7 una vez, fuera del `stale` | stale-no-repite | — |
| R8 rechazo previo no toca nada | pendiente | — |
| R9 sin esquema/permisos/R12 | typecheck + guardias verdes | — |

## Salidas

- unit `finish-assigned-order`: 33/33.
- `tests/unit/asignaciones` + `tests/unit/composition`: 52 archivos, 769 tests.
- int nueva: 3/3 (Postgres real, plantilla reutilizada).
- int vecinas: `responsible-eligibility` + `finished-orders` 10/10; `finish-with-finished-goods` 12/12.
- `tsc --noEmit`: verde. `eslint` de los 8 archivos: limpio.
- E2E: escrito, tipos verdes; ejecución pendiente (sin Playwright en esta máquina).

## Decisiones (del chat + defectos aplicados)

Origen vinculado al pedido; efecto fila en responsables; múltiples → todos. R12 sin tocar
(`POR_EMPACAR` sigue fuera de Mis asignados; el empacador trabaja en «Por empacar»). Inserción
antes de transicionar con compensación best-effort.

## Cruce

QC-82 (`spec_ready`, con worktree) enmendará este mismo caso de uso: al llegar a F2.0 rebasa
sobre esta rama.
