# Review — QC-141 reserva-de-material-del-pedido (F2.2)

> Rama `feature/QC-141-reserva-de-material-del-pedido`, HEAD `9a5cbe6c`, contra el merge-base con
> `origin/dev` `0093acf9`. Revisado el 2026-09-23. El reviewer no editó código.

## Veredicto: **RECHAZADO**

Hay 4 hallazgos bloqueantes (B1–B4). Lo demás está bien hecho: la transacción entre módulos respeta
la regla de dependencias, todos los R1–R50 tienen un test que existe y pasa, y los tests nuevos de
integración pasan contra Postgres real.

---

## Lo que corrió el reviewer

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | sin errores |
| `pnpm run lint` | sin salida |
| `vitest run tests/guards` | 42 archivos, 541 pasan, 5 saltados, 0 fallan |
| `vitest run` sobre los unit de `pedidos`, `inventario`, `pedidos-ui`, `asignaciones`, `errores`, más `qc111-alcance`, `identity/credencial/scope` y `data-table-alcance` | 154 archivos, 2412 pasan, 9 saltados, 0 fallan |
| `vitest run` sobre `order-expiry`, `order-reservation`, `order-unit-of-work`, `order-reservation-concurrency`, `reservation`, `reserve-existing-orders-migration` y `reservations-and-decimal-stock-migration` (`.int`) | 7 archivos, 49 pasan, 0 fallan (base efímera) |
| `./init.sh` completo y E2E | **no se repitieron.** El implementer los declara verdes en `a6f3d073`; los commits posteriores solo tocan `progress/` y `specs/`. Pero ver **B4**: ese gate verde no cubre lo que se mergearía |

`tests/baseline-rojos.json` está vacío, así que no hay rojos heredados que descontar.

## Checklist

### Especificación y trazabilidad
- [x] `requirements.md` con R1–R50 en EARS; `design.md` con alternativas descartadas (§13.1–13.7).
- [x] `tasks.md`: las 19 tasks (T0–T17 y TM) están en `[x]`.
- [x] Mapa R→test en `progress/impl_…md` («mapa completo R1–R50»). Revisé los nombres de los casos
      en el código y ejecuté los archivos de unit e integración. Cada R tiene al menos un caso
      que prueba de verdad lo que pide. R47 lo cubre `guard-dependencias-aprobadas`: el diff no
      toca `package.json`, `pnpm-lock.yaml` ni `docs/dependencias.md`.
- [ ] `requirements.md` sigue diciendo que E1 y E2 «esperan aprobación» y marca R9, R49 y R50 como
      «provisional». La aprobación consta en `progress/current.md` (`2497cf07`) → m1.

### Calidad y checkpoints
- [x] typecheck, lint, guardias y unit en verde (medido por el reviewer).
- [x] Hay E2E para un flujo crítico (movimiento de inventario): `e2e/reserva-de-material.spec.ts`
      (R48). El implementer lo declara verde; el reviewer no lo reejecutó.
- [x] Multiplataforma: los campos decimales son `type="text"` + `inputMode="decimal"` + `text-base`
      (`FIELD_TEXT`); el `title` siempre va con un `aria-label` que lleva la cifra completa (no
      depende de `:hover`). Sin `100vh`. Sin librería nueva.
- [x] Sin dependencias nuevas.
- [x] Tabla nueva `reservation_movements`: `company_id NOT NULL`, FK compuestas contra
      `orders(id, company_id)` y `product_batches(id, company_id)`, `ENABLE` + `FORCE` RLS,
      append-only. `/// @module inventario`.
- [x] Aislamiento: cada consulta nueva filtra por empresa. El acceso cruzado se rechaza con
      tests: R17 (FK), R42 (lote ajeno = inexistente) y `order-expiry.int` («R17, R21 —
      aislamiento por empresa»).
- [x] Permisos en el service (R40, R41), con tests de «el permiso antes de abrir la unidad».
- [x] Cada migración trae su `down.sql`, y el leader probó el rollback de las tres (TM).
- [x] Sin secretos: `CRON_SECRET` se lee del entorno al invocar y está documentado en `.env.example`.
- [ ] Comentarios de producción (`docs/conventions.md > Comentarios`) → **B1**.
- [ ] Integración con el `dev` actual → **B4**.
- [ ] `progress/review_…` con OK → no (este documento).

---

## Puntos que el leader dejó expresamente al reviewer

1. **Transacción entre módulos vía `lib/composition`: CUMPLE la regla de dependencias.**
   - El puerto `pedidos/ports/order-unit-of-work.ts` importa solo el **tipo** `MaterialReservations`
     del barril de `inventario`.
   - `order-unit-of-work-prisma.ts` (driven de `pedidos`) importa solo `@prisma/client` (tipo), el
     cliente compartido y otro driven de su **mismo** módulo.
   - `reservation-prisma.ts` (driven de `inventario`) llama a `product-prisma.ts`, que es del mismo
     módulo.
   - La composición ata los dos repositorios con el mismo `tx` sin nombrar Prisma.
   - `inventario` no importa `pedidos`: `OrderNumberDirectory` es un puerto que declara
     `inventario` y que la composición cablea.
   - Queda sin ciclo, y `guard-arquitectura-modulos` está verde.
2. **`guard-ambito-empresa-pedidos`.**
   - El alias `sharedPrismaClient` **esquiva** la guardia → **B3**.
   - `insertAliveOrder` duplica el `INSERT` de `createOrder`. No escapa a la guardia: el barrido
     de SQL crudo recorre **todas** las funciones del directorio, e `insertAliveOrder` pasa la
     comprobación de `company_id`. Pero `createOrder` queda como código muerto de producción → m2.
   - La ampliación de `cableadoDe` (`METODOS_DELEGADOS_EN_DOMINIO`) es aceptable: fija la
     llamada exacta con una regex y exige que el adaptador crudo ya no declare
     `transitionAliveById`. `lockAliveById` y `setStatus` siguen dentro del barrido sin
     excepciones.
3. **Guardias de fichas cerradas.**
   - `qc91-alcance`: el `updateMany` pasa a estar permitido solo dentro de `consumeBatchStock`,
     y lo prueban tests que fabrican fuentes en rojo y en verde. Aceptable.
   - `qc121-alcance`: la excepción `EXCEPCIONES_SIN_RECALCULO` saca `consumeBatchStock` de la
     garantía «toda escritura de lotes recalcula». Hoy los tres llamantes sí recalculan, pero la
     guardia ya no lo vigila → m3.
   - `pedidos/scope`, `module-contract`, `qc111-alcance` y `credencial/scope`: exclusiones
     nombradas por ruta o import exacto, estrechas y con motivo. QC-111 R19 se reformula
     («ningún cron de `documentos`»), lo que es coherente con D8. Aceptables. Conviene decirlo
     en el PR, porque cambian lo que afirmaban fichas cerradas.
4. **`listActiveCompanyIds` (`identity`).** Es aceptable. Lee solo los `id` de `companies`
   vivas. `companies` es una tabla exenta de columna de empresa y su dueño es `identity`. Es
   inherente a la decisión «empresa por empresa». No lee pedidos de varias empresas.
5. **Primer cron.**
   - Autenticación correcta: Bearer comparado con `timingSafeEqual` y la variable leída al
     invocar. Responde 401 o 500 sin leer nada, con tests que usan dobles que fallan si los
     llaman.
   - `vercel.json` válido, y `route.ts` declara las constantes de segmento con literales.
   - La idempotencia frente a ejecuciones repetidas o solapadas está probada en integración.
   - **Pero** falta la recomprobación de `reserved_at` bajo el candado → **B2**.
   - Tratamiento de errores (log + 500) según la pregunta 3, con huecos menores → m4.
6. **Migración PL/pgSQL y los `down`.**
   - La fórmula `ceil(q×%×100)/10000` es equivalente a `ceilToScale4(consumedQuantity)`.
   - Todo-o-nada, E1 y E2 bien, con test de paridad contra `planReservation`.
   - El desempate de lotes **no es idéntico** al comparador de TS cuando en la misma fecha se
     mezclan lotes numéricos y no numéricos, o lotes que solo difieren en mayúsculas → m5.
   - Los tres `down` son correctos: el de `…120100` falla si hay decimales (R45) y el de
     `…120000` si hay asientos `consumption`.
   - El de `…120200` borra físicamente; el design lo permite. Si se ejecuta **solo** después
     de que la app haya operado, deja el libro incoherente → m6.
7. **`batch-history.tsx`.** Correcto.
   - `data-testid="batch-history-entry-${id}"` sigue intacto (el contrato de QC-92).
   - La clave `${kind}-${id}` es única porque los `kind` de los dos libros son disjuntos y los
     ids son UUID.
   - «Sistema» cuando no hay autor, y la cantidad con `aria-label`.

---

## Hallazgos

### BLOQUEANTES

**B1 — Comentarios de producción añadidos por el diff que citan requisitos o `design.md`**
(`docs/conventions.md > Comentarios`, punto 9 del checklist del reviewer):
- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts:772` —
  `Candidatos a caducar de UNA empresa (proceso diario, R21-R26)`.
- `lib/composition/index.ts:997` — `El proceso diario (T12, design.md > 9)`.
Qué falta: quitar la cita de las dos líneas y dejar solo el motivo. Llegaron en la tanda 3, después
de la limpieza de comentarios de la rama.

**B2 — El proceso diario no vuelve a comprobar `reserved_at` bajo el candado** (`design.md > 9.2`:
«si fila == null o status != PENDIENTE **o reserved_at > threshold** -> nada»; R20, R22).
`expireOne` (`lib/modules/pedidos/domain/expire-stale-orders.ts:108-131`) solo mira `status`.
`OrderRow` ni siquiera expone `reservedAt`. Supongamos que una edición entra entre la lectura del
lote de candidatos (`findExpirableOrders`) y el `lockAliveById`:
- si la edición reinicia el plazo (`reserved_at = now`), el cron cancela igual un pedido recién
  editado, y eso viola R20;
- si la edición deja el pedido sin apartar (`reserved_at = NULL`), el cron cancela un `PENDIENTE`
  sin material apartado, y eso viola R22.
La ventana dura lo que tarda en procesarse un lote de hasta 100 pedidos, cada uno en su propia
transacción. Cancelar no tiene vuelta atrás.
Qué falta:
- que la fila bloqueada traiga `reserved_at`;
- que `expireOne` no haga nada si es `null` o posterior al umbral;
- un unit y, a ser posible, un caso de integración con una edición intercalada.

**B3 — `order-unit-of-work-prisma.ts` esquiva `guard-ambito-empresa-pedidos` renombrando el
cliente.** `import { prisma as sharedPrismaClient }` existe **solo** para que `TOCA_LA_BASE`
(`/\b(?:prisma|tx)\s*\./`) no vea el `$transaction`. La propia bitácora lo reconoce. La cabecera de
la guardia es explícita: una excepción a la regla de ámbito «la aprueba un humano en un spec… no la
añade quien escribe el adaptador para poner esto en verde». Un alias es una excepción sin nombre ni
motivo en la guardia, y deja un patrón copiable: cualquier consulta sin ámbito en `pedidos` pasaría
con el mismo truco. La consulta de hoy es inofensiva (`$transaction` no lee tablas); el problema es
el agujero que abre.
Qué falta, a elegir por el humano:
- (a) que la guardia reconozca cualquier nombre local del import de `@/lib/shared/db/prisma` (así
  el alias deja de funcionar) y trate `$transaction` como no-consulta, con su motivo escrito en la
  guardia y aprobado; o
- (b) una excepción con nombre aprobada en el spec.
En los dos casos se vuelve a importar como `prisma`.

**B4 — La rama no está integrada con el `dev` actual, así que el gate verde no vale para el PR.**
Desde el merge-base, `origin/dev` ha ganado QC-145 (PR #112) y `a01c90cb`:
- **choque de prefijo de migración**: `dev` tiene `20260923120000_orders_finished_at`, con el mismo
  prefijo que nuestra `20260923120000_inventory_movement_kind_consumption`. Además
  `20260923140000_product_batch_nullable_machine` va **por detrás** de las tres nuestras, lo que
  incumple `design.md > 4.0` («siempre por detrás de la última migración de `dev` en el momento del
  merge»);
- QC-145 añade `orders.finished_at` con el `CHECK orders_finished_at_requires_delivered` y cambia
  quién mueve el estado. Nuestra `setAliveOrderStatus` sustituye a `transitionAliveOrder` en el
  Finalizar, y hay que llevarle `finished_at`;
- QC-145 es la ficha que retira la entrega por la edición en Pedidos. Hay que decidir qué pasa con
  R27 y R29 en ese camino, con enmienda del spec si hace falta;
- `a01c90cb` hace anulables `presentation_id` y `unit_cost` de `product_batches` y toca
  `product-prisma`, `product-form` y los esquemas que esta rama reescribió.
Qué falta:
- mergear `origin/dev`;
- renumerar las tres migraciones para que queden por detrás de `20260923140000`;
- adaptar el Finalizar y la edición a QC-145;
- volver a pasar `./init.sh` completo y los E2E (`reserva-de-material`, `ejecucion-receta`,
  `ajuste-de-inventario`) sobre el resultado.

### Menores

- **m1** — `requirements.md` todavía dice que E1 y E2 esperan aprobación y marca R9, R49 y R50
  como «(provisional…)». La aprobación del 2026-09-23 consta en `progress/current.md`. Falta
  reflejarla en el spec, como una fila de decisión o una nota.
- **m2** — Quedan en producción caminos de escritura muertos: `createOrder` (`order-prisma.ts`),
  que solo mantiene vivo `order-sequence.int.test.ts`, y `transitionAliveOrder`
  (`order-catalog-prisma.ts`), que según `module-contract` no tiene llamantes. Este último es
  delicado: si alguien volviera a cablearlo, entregaría **sin consumir**. `design.md > 5.3` pedía
  retirar los métodos de escritura viejos «para no dejar dos caminos de escritura». Además el
  `INSERT` del correlativo está escrito dos veces. Propuesta: que `order-sequence.int` ejercite
  `withOrderTransaction` + `createOrderWriteRepository`, que el anti-placebo de la guardia apunte
  a `insertAliveOrder`, y borrar los dos caminos.
- **m3** — La excepción `consumeBatchStock` de `qc121-alcance` traslada la garantía «recalcula
  `products.stock`» a sus llamantes, y ninguna guardia la vigila. Hoy los tres llamantes de
  `reservation-prisma.ts` sí recalculan (R28 en integración). Convendría una comprobación de que
  todo llamante de `consumeBatchStock` llama también a `recalculateProductStock`.
- **m4** — Errores del cron:
  - si fallan `listCompanyIds` o `findExpirable`, la excepción sube sin el evento
    `order_expiry_failed`;
  - el docblock de `expire-stale-orders.ts:54` («ni una empresa que falla detiene a las
    siguientes») afirma algo que el código no hace;
  - el test `expire-stale-orders.test.ts:156` («una empresa que falla al listar sus candidatos…»)
    en realidad prueba una empresa **sin** candidatos, así que su nombre describe algo que el
    test no comprueba;
  - `failed` no lleva el código de error que pedía `design.md > 9.2` (`{ id, companyId, code }`),
    y sin él un fallo no se puede diagnosticar;
  - con 100 o más pedidos que fallan siempre en una misma empresa, el bucle vuelve a pedir el
    mismo lote hasta agotar los 240 s: repite entradas en `failed` y deja sin procesar a las
    empresas siguientes.
- **m5** — Paridad del orden de lotes entre SQL y TS (N8). El SQL pone primero los lotes numéricos
  y después el resto, por la collation de Postgres. TS compara como texto por unidad de código en
  cuanto uno de los dos no es numérico. Divergen en la misma fecha de compra con, por ejemplo,
  `'-X'` y `'5'`, o con `'a'` y `'B'`. El test de paridad solo cubre lotes numéricos. Corre una
  sola vez y el caso es raro, pero R43 pide «el mismo orden de lotes».
- **m6** — `…120200/down.sql` borra los `reserve` sin autor del último instante y anula
  `reserved_at`. Si se ejecuta solo (sin el `down` de `…120100`) después de que la app haya
  operado:
  - deja `release` o `consume` sin su `reserve` (saldo negativo en el libro);
  - anula `reserved_at` de pedidos que una edición volvió a apartar.
  Aceptado por el design («en la práctica revertir 4.2 elimina la tabla»). Convendría que ese
  `down` fallara si hay movimientos posteriores sobre esos pedidos.
- **m7** — `create-order.ts` y `transition-order.ts` leen la receta con el cliente global
  **dentro** de `unitOfWork.run`, así que piden una segunda conexión mientras la transacción
  tiene la suya. Con un pool pequeño (pooler de Supabase) eso es espera o P2024 bajo carga.
  `update-order.ts` ya la lee antes de abrir la transacción: conviene hacer lo mismo en alta, y
  en el Finalizar leer el `recipeId` antes o pasar el lector por `tx`.

---
---

# Vuelta 2 (F2.2): 2026-09-23

> HEAD `c13add6a`, contra el merge-base con `origin/dev` `899c3d22`. El reviewer no editó código
> ni hizo commit. No corrió la suite completa ni los E2E: el leader estaba corriendo `./init.sh`
> completo en este worktree. Los E2E (Chromium y WebKit) y el rollback de las tres migraciones se
> toman de la bitácora y de los logs `progress/e2e_QC-141_vuelta2*.log`.

## Veredicto: **RECHAZADO**

Hay 4 bloqueantes (V2-B1 a V2-B4). Los bloqueantes B2, B3 y B4 de la vuelta 1 están resueltos
como decidió el humano. B1 está resuelto en las dos líneas señaladas, pero la vuelta 2 metió
ocho citas nuevas (V2-B1). La trazabilidad R1–R58 está completa, con R29 retirado. Dos de las
adaptaciones de tests de Tm2 no están bien (V2-B2 y V2-B3). Además, `origin/dev` avanzó otra vez
y ahora choca con la rama (V2-B4).

## Lo que corrió el reviewer

| Comando | Resultado |
|---|---|
| `vitest run` sobre `guard-ambito-empresa-pedidos`, `qc121-alcance`, `qc145-estado-solo-planta`, `transition-order`, `update-order`, `expire-stale-orders`, `order-expiry-cron-route`, `order-catalog`, `pedidos/module-contract`, `create-order`, `asignaciones/finish-assigned-order` y `guard-catalogo-de-errores` | 12 archivos, 221 pasan, 0 fallan |
| `vitest run` (`.int`, base efímera) sobre `reserve-existing-orders-migration`, `order-expiry`, `order-reservation`, `order-duplicate-number`, `order-finished-at` y `asignaciones/finished-orders` | 6 archivos, 39 pasan, 0 fallan |
| `vitest run` sobre `guard-ambito-empresa-recetas`, `guard-ambito-empresa-inventario`, `guard-arquitectura-modulos`, `qc91-alcance` y `pedidos/scope` | 155 pasan y 1 falla: `guard-arquitectura-modulos` (bloque 13, import profundo de `product-type`). Es el rojo heredado que ya está en `tests/baseline-rojos.json`, **no es hallazgo**, y `dev` ya lo arregla en `daa400c5` |
| `git merge-tree --write-tree HEAD origin/dev` | **10 archivos en conflicto** → V2-B4 |
| Barrido de comentarios en las líneas `+` de `git diff 899c3d22 HEAD -- lib app db components` | 8 citas → V2-B1 |

## 1. Hallazgos de la vuelta 1 contra lo que decidió el humano

| Hallazgo | Decisión (D21 / `02c5eda3`) | Estado |
|---|---|---|
| B1 | Quitar las citas | Las dos líneas señaladas están limpias. **Pero la vuelta 2 añade ocho citas nuevas** → V2-B1 |
| B2 | Recomprobar `reserved_at` bajo el candado | **Resuelto.** `lockAliveOrderById` trae `reserved_at` en el mismo `SELECT … FOR UPDATE`. `expireOne` no hace nada si el valor es `null` o es posterior al umbral. Lo cubren el unit R53 y la integración R53, con la edición hecha desde otra conexión |
| B3 | Excepción con nombre de archivo, más los dos refuerzos de §5.2.1 | **Resuelto como se decidió.** Se importa `prisma` sin alias. `EXENTOS_DEL_AMBITO` tiene una sola entrada, con el motivo que cita D21. El archivo exento solo admite `prisma.$transaction`. Se prohíbe el alias. Hay tres anti-placebos. No se implementó la opción (a) descartada. Detalles de alcance → m-V2-3 |
| B4 | Solo el Finalizar consume y escribe `finished_at` en la misma transacción. Mergear `dev`. Renumerar | **Resuelto para el `dev` de `899c3d22`.** Las migraciones `…150000/150100/150200` quedan por detrás de `…140000` y no hay prefijos repetidos. `update-order.ts` ya no tiene la rama `ENTREGADO`. `createTransitionOrder` hace consumo → `setStatus` (con `finishedAt`) → `setReservedAt(null)` dentro de una sola `unitOfWork.run`. Pero `dev` volvió a avanzar → V2-B4 |
| m1 | Reflejar la aprobación de E1/E2 | Resuelto en R9, R49 y R50 y en la cabecera. Queda una contradicción en «Preguntas abiertas» → m-V2-4 |
| m2 | Retirar `createOrder` y `transitionAliveOrder` | Resuelto en `lib/**`: hay un solo `INSERT INTO "orders"` (`insertAliveOrder`) y el anti-placebo de la guardia apunta a él. Efecto colateral → V2-B3. Comentarios huérfanos → m-V2-1 |
| m3 | Guardia «quien consume recalcula» | **Resuelto.** `qc121-alcance` tiene «QC-121 R28 — quien llama a consumeBatchStock recalcula», con un caso rojo y otro verde fabricados y el barrido real de `lib/` |
| m4 | Errores del cron | **Resuelto.** Se registran `stage`, `companyId` y `code` (`codeOf`). El cursor `(reserved_at, id)` evita repetir pedidos. Un fallo al listar empresas o candidatos queda en `failed` y la ejecución sigue. El handler registra y responde 500. El docblock describe lo que hace el código. Cubierto por los tests R26, R54 y R55 |
| m5 | Paridad del orden de lotes, aceptando el límite (pregunta 7) | **Resuelto como se decidió.** El comparador de TS no se tocó. R56 cubre `'-X'/'5'`, `'a'/'B'` y la mezcla de cuatro lotes sin ciclo |
| m6 | `down` coherente después de usar la app | **Resuelto.** `…150200/down.sql` falla si hay otro asiento o si `reserved_at` cambió. R57 va en dos casos, que pasan |
| m7 | La receta se lee por `tx` | **Resuelto.** `OrderTransactionScope.recipes` usa `createRecipeExecutionReader(tx)`. Crear, editar y finalizar la leen dentro de `run` |

## 2. Trazabilidad R1–R58

- [x] R1–R50 como en la vuelta 1, reverificados en los archivos que se volvieron a ejecutar.
- [x] R29 **retirado** (D21). Ningún test de QC-141 lo cita. Los `R29` que aparecen en
      `qc145-estado-solo-planta`, `order-service` y `cancel-order` son de **otras** fichas.
- [x] R51: `transition-order.test.ts` (tres casos) y `order-reservation.int` (tres casos, que
      miran `finished_at`, el lote, el libro y el estado).
- [x] R52: `update-order.test.ts` y `order-reservation.int` (dos `describe`).
- [x] R53: unit e integración, con la edición intercalada.
- [x] R54 y R55: `expire-stale-orders.test.ts` y `order-expiry-cron-route.test.ts`.
- [x] R56 y R57: `reserve-existing-orders-migration.int`.
- [x] R58: `guard-ambito-empresa-pedidos` (tres casos R58 y tres anti-placebos).

## 3. Tm2: ¿se debilitó lo que afirmaban los tests adaptados?

| Archivo | Juicio |
|---|---|
| `asignaciones/company-orders.int` | Sin pérdida. El caso nunca transiciona, y el doble lanza si se le llama |
| `asignaciones/finished-orders.int`, `responsible-eligibility.int` | Sin pérdida. `assertTransition` + `setStatus` reales, igual que hacía la función retirada, que tampoco consumía |
| `order-finished-at.int` (QC-145 R3) | Sin pérdida. El mismo `UPDATE` condicional, ahora en `setAliveOrderStatus` |
| `order-catalog.test.ts` | Sin pérdida. T1(b) (transición ilegal sin escribir) lo cubre `transition-order.test.ts:56`, que pasa |
| `order-sequence.int`, `order-sequence-race.int` | Sin pérdida. Sobre `withOrderTransaction` + `createOrderWriteRepository`. El conteo de transacciones se mantiene |
| `pedidos/module-contract.test.ts` | Aceptable. Exclusiones nombradas por archivo |
| `qc145-estado-solo-planta.test.ts` R5 | Sin pérdida neta. La unicidad del bloque `finishedAt` pasa a `order-prisma.ts` |
| `qc145-estado-solo-planta.test.ts` R10 | Algo más laxo: «un solo `status:` en el archivo» pasa a «un solo `status: to`» → m-V2-5 |
| `qc145-estado-solo-planta.test.ts` R29 (esquema) | **Roto a futuro** → V2-B2 |
| `order-duplicate-number.int` | **Cambia lo que afirma y da por buena una regresión** → V2-B3 |

## 4. QC-145 después del merge

- [x] `finished_at` se escribe en el mismo `UPDATE` que el estado (`order-prisma.ts:634-642`),
      dentro de la misma `unitOfWork.run` que el consumo (`transition-order.ts:36-70`). Si el
      consumo falla, no se escribe ni el estado ni `finished_at`: lo comprueban los tests de
      integración R51, R30/R31 y R50. `finish-assigned-order.ts` traduce los dos resultados
      nuevos.
- [x] La edición ya no mueve el estado (`updateOrderSchema` sin `status`, más
      `assertTransition(row.status, row.status)`).

## 5. Comentarios

- [ ] Hay 8 citas nuevas en producción → V2-B1.

---

## Hallazgos de la vuelta 2

### BLOQUEANTES

**V2-B1: la vuelta 2 añade ocho comentarios de producción que citan `design.md` y etiquetas de
review** (`docs/conventions.md > Comentarios`). Todos entraron con Tm7 o Tm2, después del barrido
de TB1:
- `lib/composition/index.ts:983`: «(`design.md > 5.2.2`, m7)»
- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts:543`: «(`design.md > 5.3`, m2)»
- `lib/modules/pedidos/domain/create-order.ts:142`: «`design.md > 5.2.2` evita»
- `lib/modules/pedidos/domain/transition-order.ts:47`: «`design.md > 5.2.2` evita»
- `lib/modules/pedidos/domain/update-order.ts:132`: «(`design.md > 5.2.2`)»
- `lib/modules/pedidos/ports/order-unit-of-work.ts:10`: «(`design.md > 5.2.2`)»
- `lib/modules/recetas/adapters/driven/persistence/company-scope.ts:5`: «(`design.md > 5.2.2`, m7)»
- `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts:161`: «(`design.md > 5.2.2`, m7)»

Qué falta: quitar las citas y dejar el motivo. Después, repetir el barrido de TB1 **al final** de
la vuelta, no a mitad.

**V2-B2: `qc145-estado-solo-planta.test.ts` (R29 de QC-145, esquema) quedará en rojo en `dev` en
cuanto se mergee QC-141.** En la línea 363-366 el test suma a mano
`ESPERADOS_DE_ESTA_RAMA = ['ReservationMovement']` a los modelos de `git merge-base origin/dev
HEAD`. Tras el merge, ese merge-base ya contiene `ReservationMovement`: el esperado lo tendrá dos
veces y el real una, así que el test fallará en `dev` y en todas las ramas que salgan de él. Hoy
pasa solo porque `origin/dev` todavía no tiene la tabla. Qué falta: que el esperado sea la
**unión** (sin duplicar), o bien sacar ese caso del alcance de la rama con motivo. Además, un
caso que demuestre que sigue verde cuando la base ya contiene el modelo.

**V2-B3: el alta ya no devuelve `duplicate_number`, y `order-duplicate-number.int` se reescribió
para dar eso por bueno.** En `dev` (`899c3d22`), cuando se agotan los tres intentos del
correlativo, el resultado era `'duplicate_number'` y después `DuplicateOrderNumberError`
(`create-order.ts:137`, que en pantalla muestra «Ya existe un pedido con ese numero
correlativo.»). En la rama, `withOrderTransaction` relanza el `23505` crudo y nada lanza ya
`DuplicateOrderNumberError`: la clase sigue exportada, y `order-actions.test.ts:416` y el catálogo
la siguen dando por viva, pero en producción no existe ese camino. El usuario recibe un error
inesperado en vez del código del catálogo. El test de integración pasó de afirmar «se traduce a
`duplicate_number`» a afirmar «sube el `23505` sin traducir». Es justo lo que Tm2 prometía no
hacer («sin debilitar lo que afirman»). La regresión venía ya de la vuelta 1 y el reviewer no la
vio entonces; Tm2 la hizo explícita. Qué falta: que el camino de alta vuelva a producir
`DuplicateOrderNumberError` cuando se agotan los intentos (por ejemplo, que el adaptador lo
traduzca en `withOrderTransaction` o que `create-order.ts` lo haga sobre un resultado tipado), y
que `order-duplicate-number.int` vuelva a afirmar `duplicate_number` / `DuplicateOrderNumberError`
tras 3 transacciones y sin fila duplicada.

**V2-B4: `origin/dev` avanzó después del merge y la rama ya no se integra limpia.** Desde
`899c3d22` han entrado QC-122 (PR #113), QC-151 (PR #115, cotización del coste en el pedido) y
`daa400c5`. `git merge-tree` da **10 conflictos**:
- `order-form.tsx` y `order-table.tsx`
- `lib/composition/index.ts`
- `order-actions.ts` y `pedidos/index.ts`
- `tests/integration/aislamiento.json`
- `order-form.test.tsx`, `order-sheet.test.tsx`, `pedidos-viewport.test.tsx`,
  `order-actions.test.ts` y `data-table-alcance.test.ts`

QC-151 cotiza el coste de los lotes en el formulario del pedido, y eso toca de lleno la existencia
decimal y el disponible de esta rama. No hay migraciones nuevas en `dev`. El `./init.sh` que está
corriendo sobre `c13add6a` no cubre lo que se mergearía. Qué falta:
- mergear `origin/dev`;
- decidir cómo usa la cotización de QC-151 el disponible y los decimales de la reserva (si
  cambia el comportamiento, con una enmienda del spec);
- repetir `./init.sh` completo y los E2E (`reserva-de-material`, `ejecucion-receta`,
  `ajuste-de-inventario`, `pedidos`, `pedidos-terminados`, y los nuevos `pedidos-busqueda` y
  `pedidos-cotizacion`) sobre el resultado.

Con `daa400c5` desaparece también el rojo heredado de `guard-arquitectura-modulos`.

### Menores

- **m-V2-1**: comentarios que el diff añade y que ya no son verdad:
  - `order-prisma.ts:615-621`: describe `setAliveOrderStatus` por comparación con
    `transitionAliveOrder`, que ya no existe;
  - `order-unit-of-work-prisma.ts:12`: dice «mismo tope que `createOrder`», que también se
    retiró;
  - `asignaciones/domain/errors.ts:159-160`: dice «la entregue desde la edicion o desde la
    planta», pero desde TB4 la edición ya no entrega.
- **m-V2-2**: `transition-order.ts:62-63`. Si `setStatus` devuelve algo distinto de «ok»
  **después** de consumir, el código hace `return result` sin lanzar, así que la transacción
  confirmaría el consumo sin el cambio de estado. Eso contradice `design.md > 5.4` («Ningún
  resultado distinto de ok deja escrito... el inventario») y la letra de R51. Hoy no puede
  ocurrir, porque la fila está bloqueada con `FOR UPDATE` y se comprobó `status === from`. Aun
  así, conviene lanzar para deshacer la unidad y añadir un unit con `setStatus` que devuelva
  stale.
- **m-V2-3**: el alcance de los refuerzos de B3.
  - `aliasDePrisma` solo reconoce `import { prisma as X }` con un único especificador y comillas
    simples. No detecta `import { foo, prisma as X }`, las comillas dobles ni
    `import * as db` del módulo `@/lib/shared/db/prisma`.
  - En el archivo exento, los accesos `tx.` dentro del callback de `$transaction` no se miran.
  - Es lo que fijó §5.2.1, así que no bloquea, pero el agujero que quería cerrar B3 sigue
    abierto por esas variantes.
- **m-V2-4**: el spec no está al día:
  - `requirements.md:321` dice «La 7 es nueva y sigue abierta», y la línea 337 la da por
    RESUELTA;
  - `tasks.md:359` sigue titulado «PENDIENTE»;
  - Tm1 está `[ ]` aunque la bitácora lo da por hecho;
  - TC está `[ ]`. Es legítimo mientras no termine `./init.sh`, pero hay que marcarlo al
    cerrar.
- **m-V2-5**: `qc145-estado-solo-planta.test.ts` R10 (el segundo caso) pasó de «un solo bloque
  `data:` con `status:`» a «un solo bloque con `status: to`» en `order-prisma.ts`. Tiene que ser
  así, porque `cancelAlive` escribe su propio estado. Pero ahora un `status: <variable>` nuevo en
  otra escritura de `order-prisma.ts` no lo detecta ningún test, salvo que sea `updateAlive` o un
  literal `EN_CURSO`/`ENTREGADO`. Convendría fijar la lista exacta de bloques con `status:`.

### Qué hace falta para OK

Resolver V2-B1 a V2-B4, volver a correr `./init.sh --rapido` después de cada una, y al final
`./init.sh` completo y los E2E sobre la rama ya mergeada con el `origin/dev` actual. Marcar Tm1 y
TC.
