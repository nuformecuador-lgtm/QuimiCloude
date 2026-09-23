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
