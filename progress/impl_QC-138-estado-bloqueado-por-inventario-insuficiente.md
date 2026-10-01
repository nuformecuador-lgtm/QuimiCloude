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
| T6 alta y edición bloquean con confirmación | [ ] | |
| T7 caso de uso `reviewBlockedOrders` | [ ] | |
| T8 disparo desde inventario y cableado | [ ] | |
| T9 asignaciones: el Operador ve el bloqueado y no lo arranca | [x] | tanda A |
| T10 proceso diario ignora los bloqueados | [ ] | |
| T11 UI de Pedidos | [ ] | |
| T12 UI de Asignación | [x] | tanda A |
| T13 transversales | [ ] | |
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
