# QC-138 — estado-bloqueado-por-inventario-insuficiente · bitácora del implementer

Rama `feature/QC-138-estado-bloqueado-por-inventario-insuficiente`, worktree
`.worktrees/QC-138-estado-bloqueado-por-inventario-insuficiente`, sobre el spec aprobado el
2026-09-25 en F1.4 (commit `74929817`, que cierra P1-P10 y la pregunta 2 de la semilla con
D17-D27).

Primera tanda: T0 a T2. Desde el 2026-10-01 se sigue con T3 a T13; T14 (E2E) y el `./init.sh`
completo de T15 los corre el leader.

## T0 — Confirmar las respuestas de F1.4 y el estado de QC-168

**Estado:** hecha.

### Lo que quedó aprobado en F1.4

P1 a P10 se aprobaron tal como estaban propuestas, y con ellas las decisiones cerradas D17 a D27
de `requirements.md`. Las preguntas 2 y 3 también quedaron respondidas y aprobadas. La
**pregunta 1 sigue abierta** y no bloquea la implementación: el trabajo de T0 a T4 no depende de
su respuesta.

### R4, R12, R16, R20, R23, R27 y R31 son firmes

Los siete requisitos que la feature sostiene para el alcance de esta tanda se aprobaron con la
propuesta tal cual, sin reservas:

- **R4** — la señal de «no alcanza» sale de la reserva de material, no del coste.
- **R12** — un pedido que ya está en `EN_CURSO` no se bloquea: se rechaza con
  `insufficient_material` sin escribir nada.
- **R16** — la revisión de bloqueados ordena por `(created_at, id)` y usa el índice parcial de la
  segunda migración.
- **R20** — el disparo de la revisión son las dos operaciones de inventario que suben existencia.
- **R23** — un fallo de la revisión no hace fallar el alta ni el ajuste que la dispararon.
- **R27** — `BLOQUEADO` es cancelable.
- **R31** — el Operador ve el bloqueado con su etiqueta y un botón de entrar deshabilitado.

### Orden del enum

`ALTER TYPE ... ADD VALUE` solo añade al final, así que el orden lo fija el diseño y no la
migración. `BLOQUEADO` va **último**, después del último valor que haya en `dev` al rebasar.

## Estado de QC-168 al arrancar

QC-168 (los estados `POR_EMPACAR` y `EN_EMPAQUE`) **ya está en `dev`**, con su PR #129 mergeado
por merge commit, no por squash:

- `6b1cb4ee` — `Merge pull request #129 from singularis-co/feature/QC-168-estado-por-empacar`.
- `18fb9d92` — el commit de cierre de la feature en `dev`; verificado con
  `git merge-base --is-ancestor 18fb9d92 origin/dev`, que sale verdadero.
- La rama de esta feature ya trae ese `dev`: `origin/dev` (`0736e1ff`) es ancestro de `HEAD`
  (`c6cb590f`), comprobado con `git merge-base --is-ancestor origin/dev HEAD`. No hace falta otro
  `merge origin/dev` antes de seguir.
- El commit `c33e14d0` de esta rama es el merge de `origin/dev` dentro de la feature, no el de
  QC-168. No figura como ancestro de `dev` porque vive solo en la rama: es lo normal.

### Enum de partida

`OrderStatus` tiene seis valores y `EN_EMPAQUE` es el último:

```
PENDIENTE, EN_CURSO, POR_EMPACAR, EN_EMPAQUE, ENTREGADO, CANCELADO
```

Al arrancar, la última migración en `dev` era `20260925120100_packing_permission`. Tras el merge
de `origin/dev` del 2026-10-01 la última es `20261001160815_platform_maestro_role`, y las dos de
esta feature se **renumeraron** para ir detrás (ver «Merge de `dev` del 2026-10-01»).

## Base de datos

- Base propia `QuimiCloude_QC138`, en el mismo servidor que `QuimiCloude` (localhost:5432, mismas
  credenciales), creada el 2026-10-01 con el cliente de Prisma (no hay `psql` en el `PATH`).
  `QuimiCloude` no se tocó.
- `.env` del worktree (git-ignorado): `DATABASE_URL` y `DIRECT_URL` nombran `QuimiCloude_QC138`;
  `grep -cE '^(DATABASE_URL|DIRECT_URL)=.*QuimiCloude_QC138' .env` = 2 antes de cada `db:*`.
  Se añadieron las `SEED_MAESTRO_*` que pide el seed desde el rol Maestro.
- `pnpm run db:migrate`: 59 migraciones aplicadas, la última `20261001170100_orders_blocked_index`.
- `pnpm run db:seed`: ok (empresa inicial, usuario inicial y usuario maestro creados).
- Hay que borrar `QuimiCloude_QC138` al cerrar la feature.

## Merge de `dev` del 2026-10-01

- `origin/dev` mergeado (88 commits). Un conflicto, en
  `tests/guards/guard-identificador-de-request.test.ts`, en la lista de migraciones conocidas: se
  quedan las de los dos lados, la del Maestro primero. El conteo de dependencias (38, por `pino`)
  entró sin conflicto con el valor de `dev`; esta rama no añade dependencias.
- Migraciones renumeradas (`git mv`, contenido intacto):
  - `20260926120000_order_status_blocked` → `20261001170000_order_status_blocked`
  - `20260926120100_orders_blocked_index` → `20261001170100_orders_blocked_index`
  Los tests de esquema las buscan por sufijo y `design.md`/`tasks.md` usan `<ts>`/`<ts+1>`: el
  único nombre literal estaba en la guardia de arriba.
- Re-medición del spec contra `dev`: ver la sección del mismo nombre más abajo.

## Tareas y commits

| Task | Estado | Commit |
|---|---|---|
| T0 decisiones de F1.4 y estado de QC-168 | [x] | `2bf0e467` |
| T1 enum `BLOQUEADO`, mapas, cancelación, borrado, asignación, UI | [x] | `e71ffac3`, `339b1c68` |
| T2 índice parcial de bloqueados | [x] | `377d8272` |
| T3 `ReservationOutcome` distingue `insufficient` | [x] | tanda A |
| T4 errores nuevos del catálogo | [x] | tanda A |
| T5 puertos de escritura y lectura de `pedidos` | [x] | tanda A |
| T6 alta y edición bloquean con confirmación | [x] | tanda B |
| T7 caso de uso `reviewBlockedOrders` | [x] | tanda B |
| T8 disparo desde inventario y cableado | [x] | tanda B |
| T9 asignaciones: el Operador ve el bloqueado y no lo arranca | [x] | tanda A |
| T10 proceso diario ignora los bloqueados | [x] | tanda B |
| T11 UI de Pedidos | [ ] | |
| T12 UI de Asignación | [x] | tanda A |
| T13 transversales | [x] | tanda B |
| T14 E2E | [ ] | lo corre el leader |
| T15 cierre | [ ] | `./init.sh` completo lo corre el leader |

`tasks.md` de esta feature no usa casillas de verificación: sus tareas son listas de
`**Depende de**`, `**Archivos**` y `**Hecho**`, igual que el de QC-168. El estado por tarea se
anota en esta tabla, que es donde se lleva el estado en el resto del repo.

## Desviaciones respecto de `tasks.md`, y por qué

1. **Matriz de transiciones: 7×7, no 5×5.** `tasks.md > T1 > Hecho` dice «la matriz 5×5 probada
   par a par: 25 casos», y `design.md > 4` titulara la matriz 5×5. Las dos están desfasadas: se
   escribieron antes de que QC-168 añadiera `POR_EMPACAR` y `EN_EMPAQUE`. Con el estado nuevo, la
   matriz es de siete estados por siete, o sea 49 pares. Se implementa y se prueba la de 49.

2. **Los tests de esquema van en un archivo nuevo.** `tasks.md > T1` y `> T2` nombran
   `tests/unit/pedidos/schema/pedidos-migration.test.ts`. Ese archivo es historia de QC-33, QC-34 y
   QC-60, y una parte lleva la marca de no tocarse. QC-168 resolvió exactamente este problema
   creando `tests/unit/pedidos/schema/order-packing-states-migration.test.ts`, su propio archivo
   para su propia migración. Se sigue ese precedente:
   `tests/unit/pedidos/schema/order-status-blocked-migration.test.ts` para las dos migraciones de
   esta feature, y `pedidos-migration.test.ts` queda intacto.

3. **`order-row-actions.tsx` y `company-orders-columns.tsx` se tocan solo si hace falta.** El
   diseño deja `delete-order.ts` sin cambios y trata los bloqueados como cancelables y borrables, lo
   que en varios de esos archivos no requiere edición. Se anotará archivo por archivo qué se tocó
   de verdad.

## Verificación

Por instrucción explícita, esta tanda **no** corre la suite completa ni `./init.sh`. Lo que se
corre, y lo que hay que dejar en verde antes de dar cada task por hecha:

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm exec vitest related --run <archivos tocados>`

Después de tocar `db/schema.prisma`, los artefactos se regeneran con `pnpm exec prisma generate` y
`pnpm exec next typegen`.

## Re-medición del spec contra `dev` (2026-10-01)

Cruce de los archivos de T3-T13 con lo que cambió en `dev` desde la base anterior, más una
búsqueda de cada identificador de `design.md` en el código. Nada contradice el spec:

- **QC-161 (rol Maestro).** `empresas.consultar`/`empresas.modificar` y
  `ADMIN_EXCLUDED_PERMISSIONS`. El spec no añade permisos (R37, T13 compara sin fijar número), así
  que no le afecta. `companyId` de usuario pasa a anulable solo para el Maestro, que no tiene
  permisos de `inventario` ni `pedidos`; `create-product.ts` y `adjust-batch-stock.ts` siguen
  pasando `actor.companyId` como hasta ahora.
- **`auto-assign-empacador` (#130).** Toca `finish-assigned-order.ts`, que el diseño deja sin
  cambios (un `BLOQUEADO` nunca está `EN_CURSO`). Sigue valiendo.
- **Tabla compartida (#131).** Cambios de fijado y alineación de columnas en
  `order-columns.tsx`, `company-orders-columns.tsx` y `assigned-orders-columns.tsx`. El diseño solo
  añade etiquetas, valores de filtro y el disparador deshabilitado: compatible.
- **QC-171.** No toca archivos de esta feature.
- **Logger (`lib/shared/observability/logger.ts`, `pino`).** `design.md > 7` registra el fallo de
  la revisión con `console.error`, «el mismo canal que la caducidad»; `order-expiry-cron-route.ts`
  sigue usando `console.error` en `dev` y no hay guardia que lo prohíba. Se implementa tal cual el
  diseño; queda anotado como pregunta para el leader por si prefiere el logger nuevo.
- `tests/integration/inventario/reservation.int.test.ts` ganó en `dev` una línea por el
  `companyId` anulable; T3 la respeta.
- Identificadores de `design.md` que no existen aún en el código: solo los que esta feature crea
  (`order_would_block`, `order_blocked`, `OrderWouldBlockError`, `OrderBlockedError`,
  `reviewBlockedOrders`, `StockIncreaseListener`) y los que el diseño cita como contexto o
  alternativa descartada (`finished_product_enum_values`, `is_blocked`).

Verificación del merge: `pnpm run typecheck` verde; `vitest run` de la guardia de
identificador de request y de los dos tests de esquema/rollback de esta feature: 3 archivos,
41 tests pasados.

## Tanda A (2026-10-01): T3, T4, T5, T9 y T12

**Archivos**
- T3: `lib/modules/inventario/domain/reservation.ts` (`insufficient` con `productIds`),
  `adapters/driven/persistence/reservation-prisma.ts`; `tests/integration/inventario/reservation.int.test.ts`.
- T4: `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts`; `pedidos/domain/errors.ts`
  (`OrderWouldBlockError`), `asignaciones/domain/errors.ts` (`OrderBlockedError`), exportados en los
  `index.ts` de los dos módulos; `tests/unit/errores/catalogo.test.ts` (60 → 62 códigos).
- T5: `pedidos/ports/order-write-repository.ts` (`setStatus` con `actorId` anulable,
  `setIngredientsCost`), `ports/order-repository.ts` (`findBlockedIds`), `order-prisma.ts`,
  `lib/composition/index.ts`; `tests/helpers/order-unit-of-work-double.ts`,
  `tests/integration/pedidos/order-repository.int.test.ts`.
- T9: `asignaciones/domain/assigned-order-view.ts`, `list-assigned-orders.ts`,
  `get-assigned-order-execution.ts`, `start-assigned-order.ts`; tests unitarios de los tres casos de
  uso y `tests/integration/asignaciones/batch-states.int.test.ts`.
- T12: `app/(private)/asignacion/components/assigned-orders-columns.tsx`,
  `assigned-order-enter-trigger.tsx` (botón deshabilitado de 44 px, sin enlace, motivo visible con
  `aria-describedby`), `index.ts`; tests en `tests/unit/asignaciones-ui/`
  (`assigned-order-enter-trigger`, `a11y-tactil`, `company-orders-columns`,
  `assignment-view-params`, `assigned-orders-columns`). `company-orders-columns.tsx` y
  `assignment-view-params.ts` ya traían `BLOQUEADO` desde T1.
- Censo: `tests/integration/aislamiento.json` gana `pedidos/order-status-blocked-rollback.int.test.ts`
  en `transaccion` (faltaba desde T1; cada caso corre en `inRolledBackTransaction`).

**Desviaciones**
1. El caso «R13 — si tras editar ya no cubre...» de `reservation.int.test.ts` esperaba
   `not_reserved`; ahora espera `insufficient` con su producto, que es lo que pide T3. Los asientos
   que comprueba no cambian.
2. Para que compile el puerto nuevo, 6 tests de integración de pedidos que construyen un
   `OrderRepository` a mano ganan `findBlockedIds` (`finish-with-finished-goods`,
   `order-content-copy`, `order-cost-quote`, `order-ingredients-cost`,
   `order-reservation-concurrency`, `order-reservation`) y `tests/unit/pedidos/order-view.test.ts`
   gana la clave en su lista cerrada.
3. `assigned-orders-columns.test.tsx` no estaba en la lista de T12; se amplió por la etiqueta nueva.

**Mapa R → test (tanda A)**
- R1: `reservation.int.test.ts` «R1, R5 — disponible insuficiente: insufficient con los productos que
  faltan, sin apartar nada», «R1 — mide contra el disponible...», «R1 — en la edicion, lo apartado por
  el propio pedido cuenta como disponible».
- R2: `reservation.int.test.ts` «R2 — una receta sin lineas devuelve not_reserved y no escribe nada».
- R4: `reservation.int.test.ts` «R4 — un producto sin lotes, y por tanto sin unidad, cuenta como insufficient».
- R5: `reservation.int.test.ts` «R5 — un pedido con material apartado que deja de alcanzar lo libera todo».
- R6, R32 (catálogo): `catalogo.test.ts` «R6, R32 — los dos codigos estan en el catalogo...» y
  «R6, R32 — se distinguen entre si y de insufficient_material e invalid_transition».
- R15: `order-repository.int.test.ts` «R15 — setIngredientsCost sustituye el importe, tambien por null...».
- R16, R18: `order-repository.int.test.ts` «R16, R18 — solo BLOQUEADO vivos de la empresa, en orden (created_at, id)».
- R22: `order-repository.int.test.ts` «R22 — setStatus admite actorId null y deja updated_by vacio».
- R28, R32: `start-assigned-order.test.ts` «R28, R32 — arrancar un BLOQUEADO rechaza con `order_blocked`
  sin escribir», «R32 — bloqueado por una edicion entre la lectura y la transicion...»;
  `get-assigned-order-execution.test.ts` «R32 — abrir la ejecucion de un BLOQUEADO...»;
  `batch-states.int.test.ts` «R28, R32 — arrancar un BLOQUEADO rechaza con order_blocked y el estado no cambia».
- R30: `list-assigned-orders.test.ts` y `batch-states.int.test.ts` «R30 — la lista incluye el BLOQUEADO asignado...».
- R31: `assigned-order-enter-trigger.test.tsx` bloque «R31 - BLOQUEADO: el disparador esta
  deshabilitado y explica por que» (3 casos); `a11y-tactil.test.tsx` «R31 - el disparador
  deshabilitado de un BLOQUEADO conserva el objetivo tactil».
- R34 (Asignación): `company-orders-columns.test.tsx` «R34 - «Todos» muestra y filtra BLOQUEADO»;
  `assignment-view-params.test.ts` «R34 - el filtro de estado de «Todos» admite BLOQUEADO»;
  `assigned-orders-columns.test.tsx` «R31, R34 - un pedido BLOQUEADO se marca en la lista del Operador».

**Gate `./init.sh --rapido`** (salida real): typecheck ok, lint ok (8 avisos ajenos), tests
`4 failed | 282 passed (286)` archivos, `6 failed | 4179 passed | 1 skipped (4186)`. Los 6 rojos son
de los 4 archivos de `tests/baseline-rojos.json`: `unidades-viewport` (2), `usuarios-viewport` (2),
`product-page` R18 y `recipe-page` R21. Ningún rojo propio.

**Pendiente de limpieza (no bloquea):** los JSDoc de `company-orders-columns.tsx` y de
`isExactlyDelivered` en `assignment-view-params.ts` siguen hablando de «los cuatro estados».

## Tanda B (2026-10-02): T6, T7, T8, T10 y T13

Retomada desde el WIP `12a6d911` (resguardado tras cortes 502 de la API). Auditoría contra
`tasks.md > Hecho`: el código y las baterías de T6, T7, T8, T10 y T13 estaban completos, con
typecheck en verde y los 11 archivos unitarios (415 tests) y los 3 de integración nuevos (51 tests)
en verde. Faltaba cerrar 7 casos de integración **anteriores** a la ficha que asumían el contrato
viejo de alta y edición, y un rojo de guardia causado por finales de línea (ver Desviaciones).

**Archivos**
- T6: `pedidos/domain/order-input.ts` (`confirmBlocked`), `create-order.ts`, `update-order.ts`,
  `adapters/driving/order-actions.ts`; tests `create-order`, `update-order`, `order-input`,
  `order-actions`, `authorization`, `company-isolation-service` (unit) y `order-crud.int.test.ts`.
- T7: `pedidos/domain/review-blocked-orders.ts` (nuevo), `pedidos/index.ts`;
  `tests/unit/pedidos/review-blocked-orders.test.ts` y
  `tests/integration/pedidos/review-blocked-orders.int.test.ts` (nuevos).
- T8: `inventario/domain/stock-increase-listener.ts` (nuevo), `inventario/index.ts`,
  `create-product.ts`, `adjust-batch-stock.ts`, `lib/composition/index.ts` (listener que nunca
  lanza y registra con `console.error('blocked_orders_review_failed', ...)`, como pide
  `design.md > 7`); tests `create-product`, `adjust-batch-stock` (unit) y el bloque «la fachada de
  inventario dispara la revision» de `review-blocked-orders.int.test.ts`. La guardia de
  arquitectura sigue verde sin editarse.
- T10: `tests/integration/pedidos/order-expiry.int.test.ts`. Sin cambio de código.
- T13: `tests/unit/pedidos/qc138-transversales.test.ts` (nuevo).
- Censo: `tests/integration/aislamiento.json` gana `pedidos/review-blocked-orders.int.test.ts`.
- Adaptación al contrato de T6 (backend_dev): `order-cost-quote.int.test.ts`,
  `order-ingredients-cost.int.test.ts`, `order-reservation.int.test.ts`,
  `order-reservation-concurrency.int.test.ts`.

**Desviaciones**
1. **7 casos de integración previos se adaptan a R6, R8 y R11.** Antes, un alta o edición sin
   material quedaba `PENDIENTE` sin apartar; ahora rechaza con `order_would_block` salvo
   confirmación. Cada caso conserva lo que vigilaba:
   - `order-cost-quote` «sin existencia suficiente, la cotizacion y el alta dan las dos null (R62)»:
     alta con `confirmBlocked`, importe nulo igual que la cotización, y además `BLOQUEADO`.
   - `order-ingredients-cost` «la edicion lo reescribe, incluso a nulo (R11)» y «disponible
     insuficiente aunque la existencia TOTAL alcance... (R61)»: con `confirmBlocked`; importe NULL
     y además `BLOQUEADO`.
   - `order-reservation-concurrency` «R16 — dos altas simultaneas...»: `Promise.allSettled`; una
     apartada y la otra rechazada con `order_would_block` sin escribir nada (QC-138 R6). «una merma
     simultanea a un apartado...»: si gana la merma, el alta rechaza con `order_would_block` sin
     filas; el lote queda en cero en ambos órdenes.
   - `order-reservation` «R13 — editar que ya no cabe...» y «una edicion nunca escribe
     `consumption`...»: edición con `confirmBlocked`; mismos asientos, estado esperado `BLOQUEADO`
     (QC-138 R11).
2. **Finales de línea.** La copia de trabajo del WIP tenía CRLF en los fuentes tocados (los blobs
   ya eran LF). La guardia de `module-contract.test.ts` despoja comentarios con `//.*$` y, con `\r`,
   leía como código el comentario de `lib/composition/index.ts` que menciona `prisma.order`. Se
   normalizó la copia a LF; ningún blob cambia por esto.

**Mapa R → test (tanda B)**
- R1, R6: `create-order.test.ts` «R1, R6: no alcanza y sin confirmacion -> order_would_block...»;
  `order-crud.int.test.ts` «R1, R6: alta que no alcanza sin confirmacion -> order_would_block y
  ninguna fila, ni pedido ni movimiento»; `update-order.test.ts` «R6: PENDIENTE que deja de alcanzar
  sin confirmacion...»; `order-actions.test.ts` «R6: order_would_block vuelve con su codigo estable...».
- R2: `create-order.test.ts` «R2: receta sin lineas (not_reserved) -> PENDIENTE...»;
  `order-crud.int.test.ts` «R2: receta sin lineas -> PENDIENTE sin pedir confirmacion»;
  `review-blocked-orders.int.test.ts` «R2: un BLOQUEADO cuya receta se quedo sin lineas se
  desbloquea sin apartar».
- R3: `create-order.test.ts` «R3: importe nulo por una unidad sin base comun, con la reserva
  cubierta -> PENDIENTE».
- R5, R8: `order-crud.int.test.ts` «R5, R8: alta confirmada que no alcanza -> BLOQUEADO, sin
  apartado, reserved_at nulo y sin importe»; `create-order.test.ts` «R5: con confirmacion, un
  importe calculado antes de bloquear se borra».
- R8 (servidor), R10: `order-crud.int.test.ts` «R8, R10: alta confirmada que si alcanza ->
  PENDIENTE...»; `update-order.test.ts` «R8: con confirmacion pero alcanzando, un PENDIENTE sigue
  PENDIENTE»; `order-actions.test.ts` «R8: confirmBlocked=true llega al alta y a la edicion...».
- R10, R26: `order-crud.int.test.ts` «R10, R26: editar un BLOQUEADO hasta que alcanza lo desbloquea
  y aparta»; `update-order.test.ts` «R26: BLOQUEADO que sigue sin alcanzar con confirmacion se guarda
  sin mover el estado».
- R11: `order-crud.int.test.ts` «R11: un PENDIENTE que pasa a BLOQUEADO libera todo lo apartado con
  quien edita como autor».
- R12: `order-crud.int.test.ts` «R12: un EN_CURSO que deja de alcanzar -> insufficient_material sin
  escribir nada».
- R13: `review-blocked-orders.int.test.ts` «R13, R37, R38: un lote adicional en A, con solo
  inventario.modificar, desbloquea A y no toca B», «R13: el primer lote de un producto nuevo tambien
  dispara la revision», «R13: un ajuste positivo desbloquea»; `create-product.test.ts` y
  `adjust-batch-stock.test.ts` «R13: ... avisa una vez, despues de ...».
- R14, R15, R22: `review-blocked-orders.int.test.ts` «R14, R15, R22: el que alcanza aparta sin autor,
  pasa a PENDIENTE, reserved_at al instante de la revision y recalcula el importe»; «R15: el importe
  se sustituye tambien cuando sale sin calcular».
- R16: `review-blocked-orders.int.test.ts` «R16: con material para uno solo, se desbloquea el mas
  antiguo aunque se haya creado despues en la tabla».
- R17: `review-blocked-orders.int.test.ts` «R17: el que sigue sin alcanzar queda intacto, ni estado
  ni importe ni updated_at».
- R18, R38: `review-blocked-orders.int.test.ts` «R18, R38: no toca un PENDIENTE de la empresa ni un
  BLOQUEADO de otra empresa»; `company-isolation-service.test.ts` «R38: editar con confirmacion un
  pedido de OTRA empresa -> order_not_found y no se bloquea».
- R19: `review-blocked-orders.int.test.ts` «R19: un ajuste negativo que deja sin cubrir a un
  PENDIENTE no lo bloquea».
- R20: `review-blocked-orders.int.test.ts` «R20: un ajuste negativo no dispara la revision aunque el
  bloqueado ya alcance»; `adjust-batch-stock.test.ts` «R19, R20: un ajuste negativo no avisa».
- R23: `review-blocked-orders.int.test.ts` «R23: si la revision falla, el alta del lote no falla, el
  lote queda escrito y el fallo se registra»; `review-blocked-orders.test.ts` «R23: un fallo en un
  pedido no impide los demas y aparece en failed con su codigo».
- R24: `review-blocked-orders.int.test.ts` «R24: dos revisiones concurrentes, cada una en su
  transaccion, desbloquean una sola vez», «R24: una cancelacion que tiene la fila bloqueada cuando
  llega la revision gana, y el pedido no se desbloquea».
- R29: `order-expiry.int.test.ts` «R29: un BLOQUEADO creado hace mas de 15 dias sigue BLOQUEADO, sin
  motivo ni movimientos».
- R37: `authorization.test.ts` «R37: ... con confirmBlocked y solo inventario.modificar rechaza sin
  tocar ningun puerto»; `qc138-transversales.test.ts` «R37: todo codigo del catalogo actual ya estaba
  en el catalogo del padre de la rama».
- R39: `qc138-transversales.test.ts` bloques «R39 — package.json no gana dependencias», «R39 — nada
  borra fisicamente pedidos ni reservas» y «R39 — los identificadores nuevos de base van en ingles».

**Gate `./init.sh --rapido`** (salida real, corrida final limpia): typecheck ok, lint ok
(`0 errors, 8 warnings`, ajenos), tests `4 failed | 533 passed (537)` archivos,
`6 failed | 7774 passed | 30 skipped (7810)`. Los 6 rojos son de los 4 archivos de
`tests/baseline-rojos.json`: `unidades-viewport` (2), `usuarios-viewport` (2), `product-page` y
`recipe-page`. Ningún rojo propio. En una corrida intermedia `session-once-per-request-render` cayó
por `Hook timed out in 60000ms` al importar `lib/composition` bajo carga; aislado pasa 9/9 y en la
corrida final no apareció.

**Pendiente:** T11 (UI de Pedidos: modal «Guardar bloqueado»), T14 (E2E, lo corre el leader) y T15.
