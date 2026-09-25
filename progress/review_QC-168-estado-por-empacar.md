# QC-168 — estado-por-empacar · review (F2.2)

> Rama `feature/QC-168-estado-por-empacar`, rango `07b784ad..d399f622` (15 commits, 153 archivos).
> Spec aprobado el 2026-09-25 con los valores por defecto de P1, P2, P5 y P6 y las 5 decisiones de
> `design.md > Decisiones para F1.4`. Revisado el 2026-09-25.

## Veredicto: **RECHAZADO**: 1 bloqueante, 8 menores

El bloqueante es mecánico: hay que quitar citas de comentarios en 19 archivos de producción. No cambia
ningún comportamiento, así que no hace falta repetir los E2E. El código, la trazabilidad y las
pruebas que corrí están bien.

## Checklist

| # | Punto | Resultado |
|---|---|---|
| 1 | Trazabilidad R1..R48 → test | OK. Cada R tiene un test con contenido real (mapa en `progress/impl_…`, comprobado caso por caso en R1-R3, R8-R12, R17-R28, R32, R37, R39, R44-R48). R47 solo tiene test estático: ver el menor 5 |
| 2 | Tasks `[x]` | Parcial. T1–T15 `[x]`. **T16 y T17 `[ ]`**: menor 1 (T16 ya está verde por los E2E del leader; T17 depende del gate completo) |
| 3 | CHECKPOINTS | Ver abajo |
| 4 | Verificación ejecutable | No corrí el gate completo porque lo corre el leader. Lo que sí corrí, todo verde: `pnpm run typecheck`; eslint de los archivos posteriores a `fb9f331b` (0 errores y 1 aviso, menor 7); 30 archivos unit de dominio (581/581); 27 archivos de UI y otros (334 verdes, 5 skip); `tests/guards` (43 archivos, 562 verdes, 5 skip); integración uno a uno: `order-packing` 11/11, `order-packing-constraints` 6/6, `packing-permission-migration` 4/4, `finish-with-finished-goods` 12/12, `finished-orders` 6/6, `finished-goods-receipts` 5/5, `order-finished-at` 7/7 |
| 5 | Calidad y seguridad | OK. No hay tablas nuevas. La columna `packed_by` tiene FK compuesta con la empresa. Las dos escrituras de empaque son `updateMany` condicionales con `orderCompanyScope`, y la relectura también filtra por empresa. No hay secretos ni webhooks. Las capas están separadas |
| 6 | Multiplataforma | OK. `min-h-dvh`, sin `100vh`. Botones, enlaces y paginación con `min-h-11 min-w-11`. `hover:underline` va con `focus-visible` y no es la vía de activación. No hay inputs visibles ni librerías nuevas |
| 7 | Dependencias | OK. No toca `package.json` ni el lockfile |
| 8 | Aislamiento por empresa | OK. No hay modelo nuevo. Las consultas nuevas (`findAlivePackingStatus`, `startPackingAliveOrder`, `finishPackingAliveOrder`, `findProductionMovements`) filtran por empresa. El rechazo cruzado está probado: `order-packing.int` R24 (otra empresa ⇒ `not_found`), `order-packing-constraints.int` (FK 23503 con un usuario de otra empresa) y `finished-goods-receipts.int` (el pedido de otra empresa no aparece) |
| 9 | Comentarios | **BLOQUEANTE 1** |

### CHECKPOINTS.md

- Especificación: requirements EARS R1–R48; design con 5 alternativas descartadas; tasks con T16 y T17 abiertas (menor 1).
- Trazabilidad: el mapa está en la bitácora. OK.
- Calidad: typecheck OK; lint sin errores (1 aviso); `pnpm test` y `./init.sh` los corre el leader. E2E del flujo crítico (inventario y permisos): `e2e/empaque.spec.ts`, 20/20 según el leader. UI multiplataforma OK. Sin dependencias.
- Datos y seguridad: no hay tabla nueva. El permiso se valida en el service (`requirePermission` con `empaque.modificar` como primera línea de los cuatro casos de uso, probado en `authorization.test.ts`) y en la página (`requirePagePermission`, R40). Las dos migraciones tienen `down.sql`; el ciclo real está anotado en la bitácora. Sin secretos.
- Hexagonal: `domain/` y `ports/` sin imports de framework. Entre módulos solo se usan barrels. El cableado está en `lib/composition`. La directiva de servidor no se reexporta. La lógica vive en `domain/`.
- Permisos: las páginas validan en el servidor. Las mutaciones van por Server Actions.
- Verificación final: faltan `./init.sh`, `history.md` y el desmontaje del worktree (y borrar `QuimiCloude_QC168`). Los hace el leader.
- No se tocó `specs/QC-82-*` (lo vigila además `packing-limits.test.ts` R45) ni el modelo `Customer` de QC-154.

## Lo que el leader pidió juzgar

- **A-1 (`6c5a6967`). Bien hecho.** `assertFinishable` hace esto: si el pedido está `EN_CURSO`, sigue;
  si no, `assertOrderAcceptsWrites` lanza el error propio de `POR_EMPACAR`, `EN_EMPAQUE`, `ENTREGADO` o
  `CANCELADO`; lo que queda, que es `PENDIENTE`, lanza `InvalidTransitionError` de `asignaciones` con
  code `invalid_transition`, un código que ya estaba en el catálogo. Se aplica también a la relectura
  tras `stale`. El test `finish-assigned-order.test.ts:264` comprueba la clase y que
  `transitionAliveById` no se llama. `design.md > 2` recoge la decisión. Solo quedan restos: el título
  de la bitácora sigue diciendo «responde `order_not_found`» (menor 1) y el test importa
  `OrderNotFoundError` sin usarlo (menor 7).
- **D-1 `packedById` en `PackingOrderRow`. Aceptable.** R17 solo se puede decidir por identidad, y
  comparar por nombre sería frágil. El id ya viajaba en `AssignedOrderSummary.packedBy`, que el
  design sí declara, y solo baja al cliente de la propia empresa en una pantalla que exige el
  permiso. No lo cuento como hallazgo.
- **A-2 Comenzar revalida y no redirige. Aceptable.** El spec solo fija el destino de Terminar (R26).
  Al quedarse en la pantalla, se vuelve a pintar con **Terminar** (R17), y el E2E recorre ese camino.
- **«Todos» sin filtro con `ORDER_STATUS_FLOW`. Inocuo, pero el comentario no es cierto.** El array
  viaja a un `IN` y `resolveOrdering` solo mira si es exactamente `[ENTREGADO]`, así que el orden no
  cambia nada. El comentario dice que «es el que pinta el filtro de Todos», y eso no pasa por aquí
  (menor 3).
- **`session-once-per-request-render.test.tsx`. Flake por carga, no es de la rama.** Aislado pasa
  **7/7 tres veces seguidas**. La rama no toca ese archivo ni `identity`. No está en
  `tests/baseline-rojos.json`; si vuelve a vencer en el gate completo, trátalo como intermitente
  ajeno, igual que `user-table.test.tsx` en el `--rapido` #3.
- `catalog-import-isolation`: está en el baseline, así que no es hallazgo.

## Hallazgos

### BLOQUEANTE

1. **Citas de requisito, ficha o `design.md` en comentarios añadidos a producción**
   (`docs/conventions.md > Comentarios`). Son líneas nuevas de la rama, no preexistentes. Archivos
   (salen con `git diff -U0 07b784ad..d399f622 -- app lib db`, filtrando las líneas `+` por
   `QC-<n>`, `R<n>` o `design.md`):
   - `app/(private)/asignacion/empaque/[id]/components/packing-order-screen.tsx` (R17, R43, `design.md > 6`)
   - `app/(private)/asignacion/empaque/[id]/page.tsx` (R17, R40, `design.md > 6`)
   - `lib/composition/index.ts` (R25; «QC-168 T10», `design.md > 3`)
   - `lib/modules/asignaciones/adapters/driving/order-packing-actions.ts` (R26)
   - `lib/modules/asignaciones/domain/assignment-views.ts` (R39)
   - `lib/modules/asignaciones/domain/finish-assigned-order.ts` (R10; además «A-1»)
   - `lib/modules/asignaciones/domain/finish-packing.ts` (R13, R21, R25, D2)
   - `lib/modules/asignaciones/domain/get-packing-order.ts` (R13, D2)
   - `lib/modules/asignaciones/domain/list-company-orders.ts` (`design.md > 1.1`)
   - `lib/modules/asignaciones/domain/list-packing-orders.ts` (R13, R16, D2)
   - `lib/modules/asignaciones/domain/order-state.ts` (R33, en las filas nuevas de la tabla y en el comentario de `ERROR_POR_ESTADO`)
   - `lib/modules/asignaciones/domain/start-packing.ts` (R13, R18, R20, R25, D2)
   - `lib/modules/asignaciones/index.ts` («QC-168 T10», `design.md > 3`)
   - `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` (R10, «D2 de `design.md`»)
   - `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (`design.md > 3` x2, R21)
   - `lib/modules/pedidos/domain/order-packing.ts` (R25)
   - `lib/modules/pedidos/index.ts` (R25)
   - `lib/modules/pedidos/ports/order-packing-repository.ts` (R25)
   - `lib/shared/routes.ts` («QC-168», `design.md > 6`)

   **Qué falta:** quitar la cita y dejar el porqué, en un commit `chore(QC-168): limpia citas de
   comentarios` que no toque código. Los `D<n>` son citas de «decisiones cerradas» y caen por la
   misma regla. Las citas de las líneas preexistentes que la rama no toca quedan fuera. Luego
   `./init.sh --rapido`. No hace falta repetir los E2E.

### menor

1. **Estado en disco atrasado.** `tasks.md`: T16 sigue `[ ]` aunque los E2E ya salieron 20/20, y T17 depende del gate. La bitácora sigue diciendo «E2E sin correr» (tabla y «Salida real») y el título de A-1 aún dice «responde `order_not_found`». Lo cierra el leader tras el gate.
2. **Comentarios que dicen algo falso sobre `packed_by`.** `db/schema.prisma` («NULL fuera de EN_EMPAQUE») y `AssignedOrderSummary.packedBy` en `order-catalog.ts` («`null` fuera de `EN_EMPAQUE`»): un `ENTREGADO` nuevo conserva quién empaca, porque así lo permite el CHECK y Terminar no lo borra. En `migration.sql`, «existe si y solo si el pedido está EN_EMPAQUE» contradice la frase siguiente del mismo comentario. Conviene arreglarlo en la misma pasada del bloqueante.
3. **`list-company-orders.ts`:** el paso a `ORDER_STATUS_FLOW` no tiene efecto y su comentario da un motivo que no se cumple (ver arriba).
4. **`findFinishedGoodsReceipts` lanza** si un asiento `production` no tiene `packageContent` en su lote. Así tumba la lista «Por empacar» entera por una sola fila, cuando `PackingOrderRow.packages` está documentado como `null` tolerado («la fila sigue saliendo»). Hoy no pasa porque QC-150 R41 siempre guarda el contenido, pero las dos piezas se contradicen.
5. **R47 (la reversión falla entera si hay filas en los estados nuevos) solo tiene test estático:** comprueba que el `RAISE` va antes de cualquier DDL. El ciclo real de la bitácora corrió sin filas en esos estados, así que la rama de abortar nunca se ejecutó contra Postgres.
6. **`session-once-per-request-render.test.tsx` no cuenta la pantalla nueva** `/asignacion/empaque/[id]` ni la sección `por_empacar`. Cada una arma su `currentActor` con `runInRequestScope`, así que lo más probable es que cumplan, pero ningún test lo prueba. `design.md > 10` solo pidió el test de acciones, y ese sí se actualizó.
7. **Aviso de lint:** `tests/unit/asignaciones/finish-assigned-order.test.ts:15` importa `OrderNotFoundError` y no lo usa (resto del cambio A-1).
8. **Limpieza de comentarios preexistentes en los mismos commits que el código:** `cancel-order.ts` (sin cambio de código), `order-transitions.ts`, `order-classification.ts` y `delete-order.ts`, en `43b509d6` y `3656a699`. Son líneas que la rama toca, así que la limpieza procede, pero la convención pide separarla cuando abulta.

## Decisión humana

No hace falta ninguna.
