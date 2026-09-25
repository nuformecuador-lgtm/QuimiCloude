# QC-138 — estado-bloqueado-por-inventario-insuficiente · design.md

> F1.2, 2026-09-25. Leído contra `dev` en `51fdf5b6` (worktree de la rama de la ficha). La semilla
> es del 2026-09-21; desde entonces entraron QC-141 (reserva), QC-145 (estado solo desde planta),
> QC-147 (receta en %), QC-150 (producto terminado y contenido de presentación) y QC-151
> (cotización). Lo que eso obliga a ajustar va en `## 0` como **propuesta**, no como decisión.

## 0. Preguntas con propuesta (para F1.4)

**Aprobadas por el humano el 2026-09-25 en F1.4**, todas tal como están propuestas (filas D17-D27
de `requirements.md > Decisiones cerradas`). Las alternativas se conservan como registro.

**P1. El catálogo ya no tiene quince permisos.** **Aprobada 2026-09-25 (F1.4).** `lib/modules/identity/domain/permissions.ts`
tiene hoy **20** códigos (terminados, clientes y documentos se sumaron después de QC-123), y QC-168
lo llevará a 21. La decisión heredada sigue en pie: **no nace ningún permiso**.
*Propuesta:* leer D15 como «ningún permiso nuevo», sin cifra. R37 no nombra ningún número y su
test comprueba que no aparece ningún código nuevo, no el tamaño del catálogo, así que no choca con
QC-168.

**P2. «Alcanza» se mide contra el disponible, y el bloqueado no reserva.** **Aprobada 2026-09-25 (F1.4).** QC-141 ya expone la
medida: `syncForOrder` (adaptador `reservation-prisma.ts`) calcula el disponible de cada lote como
`existencia − apartado por otros pedidos`, lo reparte todo-o-nada con `planReservation` y, en la
edición, cuenta como disponible lo que el propio pedido tenía apartado. Hoy devuelve
`reserved | not_reserved` y colapsa en `not_reserved` tres casos: receta sin líneas, necesidad
nula y `insufficient`.
*Propuesta:*
- «No alcanza» es **exactamente** el `insufficient` del plan de QC-141, medido en la misma
  transacción y bajo el mismo bloqueo de productos (R1).
- Un `BLOQUEADO` **no aparta nada**: es la consecuencia directa del todo-o-nada de QC-141 (R10 de
  QC-141). Su `reserved_at` queda `null` (R5), así que la caducidad no lo toca (R29).
- **Al bloquear** desde un `PENDIENTE`, la edición ya libera todo por QC-141 R13; se registra con
  quien edita como autor (R11).
- **Al desbloquear**, se aparta en la misma transacción que el cambio de estado, y `reserved_at`
  pasa al instante de la revisión: los 15 días empiezan a contar ahí (R14).
- Un producto **sin lotes, y por tanto sin unidad**, ya cuenta como «no alcanza» en QC-141 (E1).
  Su existencia es cero, así que es falta de material de verdad y no un dato incompleto. Se
  propone que bloquee (R4).

**P3. La revisión falla a mitad (pregunta abierta 3 de la semilla).** **Aprobada 2026-09-25 (F1.4)**, opción (b). D6 dice «síncrono, dentro de
la operación de inventario». Hay dos lecturas:
- (a) **Misma transacción de base** que el alta o el ajuste. Si falla un pedido, se pierde también
  el lote. Además la transacción retiene el bloqueo de los productos mientras se revisan N pedidos.
- (b) **Misma petición, transacciones propias.** El movimiento de inventario se confirma primero.
  Antes de responder, se revisa cada bloqueado en su propia transacción, igual que la caducidad de
  QC-141 hace con cada pedido.
*Propuesta: (b).* La respuesta al usuario sigue esperando a la revisión, así que es síncrono en el
sentido que importa. Un fallo deja ese pedido `BLOQUEADO` y se notifica, pero no tumba el alta del
lote, que es legítima por sí misma (R23). El pedido vuelve a revisarse en la siguiente entrada de
material o en su próxima edición. Si el humano elige (a), R23 cambia a «deshace todo» y la sección
7 cambia de mecanismo: el alta tendría que abrir la transacción compartida de `pedidos`.

**P4. La nota central de la semilla (`calculateIngredientsCost` y su `null`).** **Aprobada
2026-09-25 (F1.4)** como decisión central. Decisión en `## 2`: **no se usa el coste para decidir si
bloquea**.

**P5. Liberaciones que no disparan la revisión.** **Aprobada 2026-09-25 (F1.4).** Cancelar, caducar, borrar o editar a la baja un
pedido también dejan material disponible. D4 solo nombra el alta de lote y el ajuste al alza.
*Propuesta:* respetar D4 al pie de la letra (R20). El bloqueado se desbloquea en la siguiente
entrada de material o al editarlo. Si el humano quiere incluirlas, cancelar, borrar y editar
llamarían a la misma revisión (sección 7) y la caducidad lo haría por empresa al terminar.

**P6. Editar un `EN_CURSO` que deja de alcanzar.** **Aprobada 2026-09-25 (F1.4).** La edición de Pedidos sigue admitiendo un
`EN_CURSO` (`update-order.ts` comprueba `assertTransition(EN_CURSO, EN_CURSO)`), y hoy ese caso
libera la reserva sin más. D11 prohíbe `EN_CURSO → BLOQUEADO` y dice que un `EN_CURSO` tiene que
implicar que había material.
*Propuesta:* rechazar esa edición con `insufficient_material`, un código que ya existe (R12).
*Alternativa:* mantener el comportamiento actual, es decir, un `EN_CURSO` sin nada apartado.

**P7. Orden de la revisión.** **Aprobada 2026-09-25 (F1.4).** Si el material que entra no da para todos los bloqueados, alguno
tiene que ir primero.
*Propuesta:* del más antiguo al más nuevo por `created_at`, desempatando por `id`. Es el mismo
criterio con el que QC-141 apartó los pedidos existentes al migrar (R16).
*Alternativa:* por prioridad descendente y después por antigüedad.

**P8. Pedidos `PENDIENTE` existentes sin material apartado.** **Aprobada 2026-09-25 (F1.4).** Hoy hay pedidos que no alcanzaron y
quedaron `PENDIENTE` sin reserva.
*Propuesta:* **no se migran**. D5 dice que el inventario nunca bloquea un pedido que ya estaba
`PENDIENTE`, y convertirlos en un script sería exactamente eso. Se bloquean solo si alguien los
edita y siguen sin alcanzar.

**P9. Borrar un bloqueado.** **Aprobada 2026-09-25 (F1.4).** D10 dice «cancelable y editable, como un `PENDIENTE`», pero no habla
del borrado lógico.
*Propuesta:* se puede borrar (R27). `delete-order.ts` usa una lista de no borrables
(`ENTREGADO`, `CANCELADO`), así que el valor nuevo queda borrable sin tocar código.

**P10. Qué cambió con QC-150, y QC-130 cancelada.** **Aprobada 2026-09-25 (F1.4).**
- El Alcance y D1 citan QC-130 para «dato incompleto» y «que la presentación declare cuánto
  contiene». QC-130 está cancelada: el contenido de la presentación lo trajo QC-150. El spec no
  reescribe el Alcance. *Propuesta:* que el humano cambie esa referencia a QC-150. *(Hecho en el
  Alcance de `requirements.md` con nota fechada el 2026-09-25.)*
- **El contenido de la presentación no interviene en el bloqueo.** Solo lo usa el Finalizar, al
  que un `BLOQUEADO` no llega nunca (R28).
- **La entrada por producción (`production`) de QC-150 no dispara la revisión** (R20). Un producto
  terminado no puede ser ingrediente de receta (QC-150), así que no desbloquearía nada.
- **El Finalizar de QC-150 no cambia.** Solo se toca `transition-order.ts` si la matriz lo exige
  (sección 4).

**Preguntas 1 y 2 de la semilla:**
- **Pregunta 1, lote vencido.** Sigue abierta y no bloquea: QC-141 no descuenta vencidos, así que
  esta ficha tampoco. *Propuesta:* nada hasta que se cierre la pregunta 2 del dominio.
- **Pregunta 2, distintivo.** **Aprobada 2026-09-25 (F1.4).** *Propuesta:*
  - En la lista del Operador: etiqueta «Bloqueado» en la columna Estado.
  - En lugar del enlace «Entrar», un botón deshabilitado «Entrar» con el texto visible «Falta
    material: no se puede iniciar», con el mismo patrón que el aviso de `EN_CURSO` de
    `assigned-order-enter-trigger.tsx`.
  - En Pedidos: insignia «Bloqueado» con la variante `destructive`, que es la que ya tiene
    `CANCELADO`.
  - *Alternativa:* crear una variante propia `warning`. Es un componente nuevo y no se propone
    salvo que el humano la pida.

## 1. Resumen técnico

- **Enum.** `OrderStatus` gana `BLOQUEADO`, al final, en una migración que solo hace
  `ADD VALUE`. Un índice parcial para buscar los bloqueados va en una segunda migración, porque
  Postgres no deja usar un valor nuevo del enum en la misma transacción que lo crea.
- **Señal de «no alcanza».** `inventario.ReservationOutcome` distingue `insufficient` de
  `not_reserved` (sección 2).
- **Alta y edición.** Si no alcanza y no hay confirmación, lanzan `OrderWouldBlockError`: se
  deshace la transacción y no queda nada escrito. Con confirmación, guardan en `BLOQUEADO` mediante
  `setStatus`.
- **Revisión.** Es un caso de uso nuevo de `pedidos`, `reviewBlockedOrders`. Se invoca desde las
  dos operaciones de `inventario` que suben existencia, a través de un puerto que declara
  `inventario` y que conecta `lib/composition`.
- **Asignaciones.** Incluye `BLOQUEADO` en la lista del Operador y rechaza su arranque con
  `order_blocked`.
- **UI.** Modal de confirmación en el formulario, etiquetas, filtros y el disparador de entrar
  deshabilitado.

## 2. Decisión central: de dónde sale «no alcanza»

**Decisión: de la reserva de QC-141, no del coste.** Dentro de la transacción de alta o edición,
`syncForOrder` ya reparte la necesidad contra el disponible de cada lote, bajo `FOR NO KEY UPDATE`
de los productos implicados. Se le amplía el resultado:

```ts
// lib/modules/inventario/domain/reservation.ts
export type ReservationOutcome =
  | { readonly kind: 'reserved' }
  | { readonly kind: 'not_reserved' }            // nada que apartar: receta sin líneas o necesidad nula
  | { readonly kind: 'insufficient'; readonly productIds: readonly ProductId[] };
```

En `reservation-prisma.ts`, cuando `plan.kind === 'insufficient'`, se devuelve `insufficient`
después de liberar lo propio, igual que hoy. `create-order.ts` y `update-order.ts` ya comparan con
`=== 'reserved'` para fijar `reserved_at`, así que el cambio es compatible.

**Por qué, y no el coste:**
1. **Una sola definición de cobertura.** La reserva es la que de verdad aparta. Si el bloqueo
   usara otra cuenta, habría pedidos «cubiertos» que no apartan nada, o «bloqueados» con material
   apartado, y R5 sería falso.
2. **Concurrencia.** `resolveIngredientsCost` lee fuera de la transacción, con el cliente global y
   sin bloqueo. Dos altas simultáneas se verían cubiertas las dos, que es justo lo que QC-141
   existe para evitar. La reserva corre bajo el bloqueo de productos (QC-141 R16).
3. **Las dos cuentas miden cosas distintas.** El coste convierte de la unidad de la presentación
   del lote a la del producto y excluye los lotes sin coste o sin presentación (QC-141 R66). La
   reserva no convierte nada (QC-141 D19) y cuenta todos los lotes. Con el coste, una unidad sin
   base común daría `null` y el pedido se bloquearía: eso es justo lo que D1 prohíbe (R3).
4. **No toca contratos ajenos.** `calculateIngredientsCost` y su `null` indistinguible siguen
   sirviendo a QC-123 y QC-151 tal cual: el importe «sin importe» no cambia de significado.

**Alternativa descartada A: enseñar a `calculateIngredientsCost` a devolver la causa**
(`{ kind: 'insufficient' | 'no_lines' | 'incompatible_unit' | 'overflow' }`). Se descarta por los
puntos 2 y 3: seguiría midiendo fuera de la transacción y con otras reglas que la reserva. Además
obligaría a cambiar la firma que consumen QC-123, QC-151 y QC-150 (`calculateLotIngredientsCost`
comparte `calculateLineCost`).

**Alternativa descartada B: una comprobación propia de `pedidos`, previa y de solo lectura.** Se
llamaría antes de abrir la transacción para decidir si mostrar el modal. Se descarta porque sería
una tercera definición de cobertura y tiene una carrera: entre la comprobación y la escritura otro
pedido puede apartar el material. El diseño elegido pregunta a la misma operación que escribe y
deshace si hace falta confirmar (sección 6).

**Riesgo anotado: QC-164** (`pending`). Devuelve una unidad al pedido y hace que la necesidad se
convierta a la unidad del insumo. Cuando entre, la reserva sí podrá encontrar unidades sin base
común. QC-164 tendrá que devolver ese caso como `not_reserved` y no como `insufficient`, para no
romper R3. El test de R3 de esta ficha lo vigila.

## 3. Modelo de datos y migraciones

**Migración 1: `<ts>_order_status_blocked`**

```sql
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'BLOQUEADO';
```

- `db/schema.prisma`: `BLOQUEADO` se añade después de `CANCELADO`, o después del último valor que
  haya en `dev` al rebasar (sección 10).
- `order-classification.ts`: `ORDER_STATUS_VALUES` se amplía en el mismo orden. Lo vigila
  `module-contract.test.ts`.
- Sin columnas nuevas y sin cambios en los CHECK:
  - `orders_cancellation_reason_matches_status` solo exige motivo en `CANCELADO`.
  - `orders_delivered_not_deleted` solo mira `ENTREGADO`.
  - `orders_finished_at_requires_delivered` solo mira `ENTREGADO`.
  Ninguno de los tres cambia con el valor nuevo.

**`down.sql` de la migración 1.** Sigue el precedente de `20260904135210_order_cancellation`:
1. Guardia de datos: `RAISE EXCEPTION` si hay algún pedido en `BLOQUEADO` (R36). No se convierten
   a `PENDIENTE`, porque decidir el estado destino en un script sería inventar un hecho de
   negocio.
2. Se eliminan los CHECK e índices parciales que nombran valores de `status`, se recrea el tipo
   sin `BLOQUEADO` (renombrar, crear, `ALTER COLUMN ... USING status::text::"OrderStatus"`,
   default fuera y dentro) y se vuelven a crear con su definición literal actual. El implementer
   saca la lista exacta de CHECK e índices de las migraciones vigentes: los de listado de
   `list_query_indexes` y el de caducidad de QC-141.

**Migración 2: `<ts+1>_orders_blocked_index`**

```sql
CREATE INDEX "orders_blocked_company_created_idx"
  ON "orders" ("company_id", "created_at", "id")
  WHERE "status" = 'BLOQUEADO' AND "deleted_at" IS NULL;
```

Sirve la búsqueda de bloqueados de la revisión. Va aparte porque Postgres rechaza usar un valor
recién añadido al enum dentro de la transacción que lo añade (`unsafe use of new value`), el mismo
motivo por el que QC-150 separó `finished_product_enum_values`. `down.sql`:
`DROP INDEX IF EXISTS`.

**Sin tabla nueva y sin RLS nueva.** Todo cabe en `orders` y en `reservation_movements`, que ya
existen.

## 4. Matriz de transiciones (`order-transitions.ts`)

Pasa de 4×4 = 16 pares a 5×5 = 25 pares:

| desde \ a | PENDIENTE | EN_CURSO | ENTREGADO | CANCELADO | BLOQUEADO |
|---|---|---|---|---|---|
| PENDIENTE | sí | sí | sí | — (solo `cancelOrder`) | **sí** |
| EN_CURSO | — | sí | sí | — | **no** (R28) |
| ENTREGADO | — | — | — | — | — |
| CANCELADO | — | — | — | — | — |
| BLOQUEADO | **sí** | **no** | **no** | — (solo `cancelOrder`) | **sí** |

- `cancel-order.ts`: `CANCELABLES` pasa a `['PENDIENTE', 'EN_CURSO', 'BLOQUEADO']` (R25).
- `delete-order.ts`: sin cambios (P9).
- `transition-order.ts` (el puerto de planta) usa `assertTransition(from, to)`. Con la tabla,
  `BLOQUEADO → EN_CURSO/ENTREGADO` se rechaza con `invalid_transition` aunque alguien lo pidiera.

**Guardia de QC-145 que hay que respetar.** `qc145-estado-solo-planta.test.ts` exige que en
`order-prisma.ts` solo `setAliveOrderStatus` y `cancelAliveOrder` escriban `status:` en un bloque
`data:`. Por eso:
- El alta sigue insertando con el default (`PENDIENTE`) y, si hay que bloquear, llama a
  `setStatus(id, 'PENDIENTE', 'BLOQUEADO')` dentro de la misma transacción.
- La edición y la revisión también cambian el estado solo con `setStatus`.
Ninguna escritura nueva fija `status` a mano.

## 5. Contratos

**`inventario`**
- `ReservationOutcome` con `insufficient` (sección 2).
- **Puerto nuevo, declarado en `inventario/domain`**. Es el mismo patrón que `OrderNumberDirectory`
  (un hueco que implementa otro módulo sin crear ciclo):

  ```ts
  // lib/modules/inventario/domain/stock-increase-listener.ts
  export interface StockIncreaseListener {
    /** Se llama DESPUÉS de confirmar un alta de lote o un ajuste positivo. No lanza: los fallos
     *  los resuelve quien lo implementa (R23). */
    onStockIncreased(input: { readonly companyId: string; readonly now: Date }): Promise<void>;
  }
  ```

  `CreateProductDeps` y `AdjustBatchStockDeps` ganan `stockIncreases?: StockIncreaseListener`.
  Se llama en `create-product.ts` después de `createWithFirstBatch` o `addBatchToAlive`, y en
  `adjust-batch-stock.ts` solo si `delta > 0`, después de que el repositorio devuelva con éxito.
  Se exporta por `inventario/index.ts`.

**`pedidos`**
- `createOrderSchema` / `updateOrderSchema` ganan `confirmBlocked: z.boolean().default(false)`.
  La Server Action lo lee del `FormData` (`'confirmBlocked' === 'true'`). No viaja ningún
  `status`: el estado lo sigue decidiendo el caso de uso.
- Errores nuevos en `domain/errors.ts`:
  - `OrderWouldBlockError`, código `order_would_block` (R6).
  - `insufficient_material` ya existe y se reutiliza para R12.
- `OrderWriteRepository`:
  - `setStatus(..., actorId: string | null, ...)`: se admite `null` para la revisión (R22).
  - Nuevo `setIngredientsCost(id, cost: string | null, actorId: string | null, now, scope)`:
    escribe el importe, `updated_at` y `updated_by` sin tocar los datos de negocio (R15). No
    escribe `status`, así que la guardia de QC-145 no cambia.
- `OrderRepository`: nuevo `findBlockedIds(scope): Promise<readonly string[]>`. Devuelve los
  pedidos vivos en `BLOQUEADO` de la empresa, ordenados por `(created_at, id)` y con el índice de
  la migración 2 (R16, R18).
- Caso de uso nuevo `createReviewBlockedOrders(deps)` →
  `(input: { companyId, now }) => Promise<{ unblocked: number; failed: readonly { orderId: string; code: string }[] }>`.
  - **No lleva actor ni permiso**: es una consecuencia del sistema, como la caducidad. La puerta es
    el permiso `inventario.modificar` que ya exigió la operación que lo dispara (R37).
  - No se publica en la fachada que consumen las Server Actions.

**`asignaciones`**
- `OrderBlockedError`, código `order_blocked` (R32).

**`errores`**
- `error-codes.ts` y `error-catalog.ts` ganan `order_would_block` y `order_blocked`, con su texto.
  Los comentarios no citan la ficha (`docs/conventions.md`).

## 6. Alta y edición (flujo)

```
createOrder(input, actor):
  requirePermission; parse (incluye confirmBlocked); receta viva; presentación
  cost = resolveIngredientsCost(...)                 // igual que hoy
  unitOfWork.run(tx):
    order = tx.orders.create(... status por defecto PENDIENTE ...)
    outcome = tx.reservations.syncForOrder(...)
    if outcome.kind === 'insufficient':
      if !confirmBlocked: throw OrderWouldBlockError  // deshace el INSERT: nada escrito (R6)
      tx.orders.setStatus(order.id, 'PENDIENTE', 'BLOQUEADO', actor.id, now)
    tx.orders.setReservedAt(order.id, outcome.kind === 'reserved' ? now : null)
```

- El choque de correlativo reintenta la unidad entera, como hoy. `OrderWouldBlockError` no es un
  choque de correlativo y sube sin reintentar.
- `updateOrder` sigue el mismo patrón sobre la fila bloqueada (`lockAliveById`):
  - Estado `PENDIENTE` o `BLOQUEADO`:
    - `insufficient` sin confirmación → `OrderWouldBlockError`.
    - `insufficient` con confirmación → `setStatus(locked.status, 'BLOQUEADO')` si hace falta.
      `syncForOrder` ya liberó lo propio, con el actor como autor (R11).
    - Cualquier otro resultado desde `BLOQUEADO` → `setStatus('BLOQUEADO', 'PENDIENTE')` (R10).
  - Estado `EN_CURSO` e `insufficient` → `InsufficientMaterialError` (R12, P6).
- **Por qué lanzar dentro de la transacción y no preguntar antes:** así el modal solo aparece si
  en el instante de escribir no alcanza, y el segundo envío vuelve a decidir con datos frescos (R8).
  Sin carrera y sin una segunda definición de cobertura.

## 7. Revisión automática

**Cableado.** `lib/composition/index.ts` construye `reviewBlockedOrders` con
`orderRepository.findBlockedIds`, `orderUnitOfWork`, los catálogos de `recetas`, `inventario` y
`unidades`, y el reloj. Lo envuelve en un `StockIncreaseListener`:

```ts
const stockIncreaseListener: StockIncreaseListener = {
  async onStockIncreased({ companyId, now }) {
    const result = await reviewBlockedOrders({ companyId, now });
    if (result.failed.length > 0) console.error('blocked_orders_review_failed', { companyId, failed: result.failed });
  },
};
```

- El canal es el mismo registro del servidor que usa la caducidad (`order-expiry-cron-route.ts`).
  El canal definitivo sigue siendo la pregunta 3 abierta de QC-141.
- **Orden de declaración:** el `const inventario = {...}` está antes que el bloque de `pedidos`, y
  un `const` no existe antes de su línea. El listener se declara antes de la fachada de
  `inventario`, junto a `orderNumberDirectory`, y referencia funciones de módulo que ya están
  importadas: `orderUnitOfWork` y los catálogos se suben de sitio o se envuelven en una función
  perezosa. Lo resuelve el implementer y lo prueba el test de cableado.

**Por pedido, en su propia transacción** (P3 opción b):

```
ids = orders.findBlockedIds({ companyId })               // solo BLOQUEADO, vivos, (created_at, id)
for id in ids:
  try:
    row = orders.findAliveById(id)                       // para receta y cantidad
    cost = resolveIngredientsCost(..., row.recipeId, row.quantity, companyId, { orderId: id })
    unitOfWork.run(tx):
      locked = tx.orders.lockAliveById(id)
      if locked === null || locked.status !== 'BLOQUEADO': return   // R24
      requirement = buildRequirement(tx.recipes.findExecutionContentById(...).lines, locked.quantity)
      outcome = tx.reservations.syncForOrder({ ..., actorId: null, now })
      if outcome.kind === 'insufficient': return          // sin escrituras (R17)
      tx.orders.setStatus(id, 'BLOQUEADO', 'PENDIENTE', null, now)
      tx.orders.setIngredientsCost(id, cost, null, now)
      tx.orders.setReservedAt(id, outcome.kind === 'reserved' ? now : null)
  catch e: failed.push({ orderId: id, code: codeOf(e) })  // sigue con el siguiente (R23)
```

- **Coste antes de apartar.** Se calcula con `{ orderId }`, fuera de la transacción: es la misma
  foto que ve una edición en ese instante (QC-141 R65). El pedido no tiene nada apartado, así que
  es el disponible general de ese momento. El coste es «con los lotes de ese día» (D3), no una
  garantía de que coincida con los lotes que acaba apartando, igual que en QC-123 y QC-141.
- **Receta sin líneas.** Si la receta del pedido se quedó sin líneas mientras estaba bloqueado,
  ya no falta material: `not_reserved` desbloquea sin apartar (R2).
- **Autor `null`** en el cambio de estado, el importe y los apartados: lo hizo el sistema (R22).
- **Coste acotado.** Recorre solo bloqueados, que el humano dijo que serán pocos (D6). Son N
  transacciones cortas y ninguna retiene el bloqueo del producto mientras se revisa otro pedido.

**Alternativa descartada C: la Server Action de inventario llama a la revisión.** Es más sencillo
de cablear, pero cualquier otro camino que suba existencia —otra action, un script, una futura
importación— se saltaría la regla. El puerto la ata al caso de uso, que es donde vive la
autorización y el negocio.

## 8. Asignaciones

- `list-assigned-orders.ts`: `ESTADOS_DE_TRABAJO = ['PENDIENTE', 'EN_CURSO', 'BLOQUEADO']`. El
  estrechamiento `toWorkingStatus` y el tipo `status` de `assigned-order-view.ts` se amplían a la
  unión de tres (R30).
- `assigned-order-execution-view.ts` **no** se amplía: la ejecución nunca se abre para un
  bloqueado.
- `get-assigned-order-execution.ts`: si `target.status === 'BLOQUEADO'` → `OrderBlockedError`,
  antes del rechazo genérico (R32).
- `start-assigned-order.ts`: después del bucle de reintento, si `order.status === 'BLOQUEADO'` →
  `OrderBlockedError`. Cubre también el caso de que una edición lo bloquee entre la lectura y la
  transición: el `stale` relee y sale del bucle.
- `order-state.ts`: `ERROR_POR_ESTADO.BLOQUEADO = null`. Admite asignar, quitar grupo y
  desasignar (R33). El mapa es `satisfies Record<OrderStatus, ...>`, así que no compila hasta
  añadirlo.
- `finish-assigned-order.ts`: sin cambios de código. Un bloqueado no puede estar `EN_CURSO`, y la
  matriz rechaza `BLOQUEADO → ENTREGADO`.

## 9. UI

**Pedidos: formulario (`order-form.tsx`)**
- Si el resultado es `code === 'order_would_block'`, se abre un `AlertDialog` de shadcn/ui, que ya
  está en `components/ui/alert-dialog.tsx`.
- **«Guardar bloqueado»** reenvía el último `FormData` con `confirmBlocked=true`.
- **«Volver»** cierra el modal y conserva los valores (R7-R9).
- El modal va en un componente de ruta propio, `blocked-order-dialog.tsx`, exportado por el barrel
  `components/index.ts`.
- Botones de al menos 44×44 px. Sin `:hover` como única vía. `AlertDialog` es Radix y ya se usa en
  la app.

**Pedidos: estado y filtros**
- `order-status-badge.tsx`: `BLOQUEADO: 'Bloqueado'` y su variante (pregunta 2). El filtro de
  estado se deriva de `ORDER_STATUS_VALUES` y se amplía solo.
- `order-row-actions.tsx`: su mapa de «deshabilitado por estado» gana `BLOQUEADO: false`, porque
  se puede editar y cancelar.

**Asignación**
- `assigned-orders-columns.tsx`: `ASSIGNED_ORDER_STATUS_LABELS` gana `BLOQUEADO`.
- `assigned-order-enter-trigger.tsx`: para `BLOQUEADO` pinta un botón deshabilitado con el aviso
  visible (pregunta 2).
- `company-orders-columns.tsx` y `assignment-view-params.ts`: la etiqueta y el valor en
  `ROUTE_ORDER_STATUS_VALUES` (R34).

**Multiplataforma.** Sin excepciones de escritorio.

## 10. Convivencia con QC-168

QC-168 (`POR_EMPACAR`, `EN_EMPAQUE`) se especifica a la vez y **añade dos valores al mismo enum**.
No se tocan sus archivos.

**Archivos que previsiblemente tocan las dos fichas:**
- `db/schema.prisma` (enum `OrderStatus`).
- `lib/modules/pedidos/domain/order-classification.ts`.
- `lib/modules/pedidos/domain/order-transitions.ts`.
- `lib/modules/pedidos/domain/cancel-order.ts`.
- `lib/modules/pedidos/domain/transition-order.ts` (QC-168 cambia el destino del Finalizar; aquí
  solo si el typecheck lo exige).
- `lib/modules/asignaciones/domain/order-state.ts`.
- `lib/modules/asignaciones/domain/start-assigned-order.ts`.
- `lib/modules/asignaciones/domain/list-assigned-orders.ts` y `assigned-order-view.ts` (si QC-168
  amplía la unión).
- `lib/modules/errores/domain/error-codes.ts` y `error-catalog.ts`.
- `app/(private)/pedidos/components/order-status-badge.tsx` y `order-row-actions.tsx`.
- `app/(private)/asignacion/components/company-orders-columns.tsx`,
  `assignment-view-params.ts` y `assigned-orders-columns.tsx`.
- Tests: `tests/unit/pedidos/module-contract.test.ts`, `order-transitions.test.ts` y
  `tests/unit/asignaciones/order-state.test.ts`.
- `lib/composition/index.ts`: probable, ya que las dos cablean casos de uso.

**Regla de rebase si QC-168 llega antes a `dev`:**
1. **Orden del enum.** `ALTER TYPE ... ADD VALUE` solo añade al final, así que el orden lo fija
   quien mergea primero. `BLOQUEADO` va **después** de `POR_EMPACAR` y `EN_EMPAQUE`, tanto en
   `schema.prisma` como en `ORDER_STATUS_VALUES`, y `module-contract.test.ts` lo comprueba. En
   este enum el orden no tiene significado de negocio (D14).
2. **Timestamp de la migración.** Se regenera para que las dos migraciones de esta ficha queden
   **después** de la de QC-168. Prisma aplica por orden de carpeta, y una migración anterior en
   nombre pero posterior en `dev` sería drift.
3. **`down.sql`.** Recrea el tipo con **todos** los valores que queden por debajo, incluidos los
   de QC-168, y recrea los CHECK e índices que QC-168 haya añadido sobre `status`.
4. **Mapas exhaustivos** (`Record<OrderStatus, ...>`, `satisfies`, la matriz): el conflicto es
   aditivo. Se conservan las claves de las dos fichas.
5. **Matriz.** Con los dos estados de QC-168 la tabla pasa a 7×7. `BLOQUEADO` no conecta con
   `POR_EMPACAR` ni con `EN_EMPAQUE` en ninguna dirección.
6. **Códigos de error.** Son listas aditivas. Hay que vigilar que no se repitan nombres.

**Si esta ficha llega antes,** QC-168 aplica lo mismo en espejo. El reparto de archivos por tarea
de `tasks.md` es el que se usa en la validación de conflictos de F2.0.

## 11. Dependencias

**Ninguna librería nueva.** `AlertDialog` ya está en `components/ui/`.

## 12. Alternativas descartadas (resumen)

- **A.** Distinguir la causa dentro de `calculateIngredientsCost` (sección 2).
- **B.** Una comprobación previa de solo lectura para el modal (sección 2).
- **C.** Llamar a la revisión desde la Server Action de inventario (sección 7).
- **D.** Una tabla de estados en vez del enum. Descartada por la decisión heredada de QC-33.
- **E.** Un flag `is_blocked` junto a `PENDIENTE` en vez de un estado. Contradice D13, que pide un
  quinto estado. Además rompería los filtros y los mapas exhaustivos, que son justo lo que obliga
  a cada pantalla a decidir qué hace con el caso nuevo.
