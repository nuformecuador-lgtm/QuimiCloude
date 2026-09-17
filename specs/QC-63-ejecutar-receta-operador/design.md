# QC-63 — ejecutar-receta-operador · design.md

> Todo lo de aquí se verificó **contra el disco de esta rama** (`feature/QC-63-ejecutar-receta-operador`,
> al día con `origin/dev`), no contra lo que la ficha daba por supuesto. Lo que no se pudo verificar
> se dice como desconocido, no se rellena (regla 6 de `CLAUDE.md`).

## 0. Lo que ya existe y NO se construye aquí

| Pieza | Dónde está | Qué aporta |
| --- | --- | --- |
| Ruta `/asignacion/<id>` | `lib/shared/routes.ts` → `assignedOrderRoute(id)` | Ya publicada. El middleware ya la cubre: `PRIVATE_ROUTE_PREFIXES` compara **por segmentos** y la fila `ASSIGNED_ORDERS_ROUTE` alcanza a `/asignacion/<id>`. **No se añade fila ni literal** (R1). |
| Corte por permiso de pantalla | `lib/modules/identity/adapters/driving/require-page-permission.ts` | 404 y no 403 (R2, R3). |
| Permisos del Operador | `lib/modules/identity/domain/permissions.ts` | `SEED_ROLE_PERMISSIONS[ROLE_OPERADOR] = ['inventario.consultar', 'asignaciones.consultar']`. **No se toca** (R4). |
| Autorización del módulo | `lib/modules/asignaciones/domain/actor.ts` → `requirePermission(actor, code)` | Ya es la primera línea de los cinco casos de uso del módulo. El nuevo la reutiliza (R5). |
| Matriz de transiciones | `lib/modules/pedidos/domain/order-transitions.ts`, publicada en el barril como `assertTransition` / `isAllowedTransition` | `PENDIENTE → ['PENDIENTE','EN_CURSO','ENTREGADO']`, `EN_CURSO → ['EN_CURSO','ENTREGADO']`, `ENTREGADO`/`CANCELADO` vacías. **Única verdad** (R12). |
| Congelado de asignaciones | `lib/modules/asignaciones/domain/order-state.ts` → `assertOrderAcceptsWrites` | `ENTREGADO` → `order_delivered_frozen`, `CANCELADO` → `order_cancelled_not_assignable` (R14). |
| Asistente de pasos | `components/shared/step-reader/` (`StepReader`, `StepReaderProps`) | Recibe `steps`, `onFinish` y `title` por props. **Se monta tal cual** (R18, R19). |
| Conversión de unidades | `lib/modules/unidades/domain/convert-quantity.ts` → `convertQuantity`, `UnitConversion`, `IncompatibleUnitsError` | Publicada desde el barril de `unidades`. Esta ficha es su **primer consumidor** (R22–R25). |
| Ámbito de unidades | `companyScopeWhere(scope)` en `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts` | `OR: [{companyId}, {companyId: null}]`. Única definición de «de la empresa o de sistema»; el método nuevo del catálogo la reutiliza. |
| Catálogo de errores | `lib/modules/errores/domain/error-catalog.ts` | Ya trae `order_not_found`, `order_delivered_frozen`, `order_cancelled_not_assignable`, `invalid_transition`, `incompatible_units`. **No hace falta ningún código nuevo.** |

## 1. La forma de la solución, en una frase

Un **caso de uso nuevo en `asignaciones`**, cortado por `asignaciones.consultar`, que comprueba que
el pedido está asignado a quien pide, pregunta a `pedidos` si la transición es legal y le pide a
`pedidos` que la escriba; una página Server Component que lo llama y baja todo por props a un
componente de cliente que **monta** `StepReader`.

## 2. Modelo de datos

**Ninguna tabla nueva, ninguna columna nueva, ninguna migración, ningún `down.sql`** (R10).

Es consecuencia directa de `[D15]` y `[D9]`: la reentrada a un pedido `EN_CURSO` se permite
justamente para no tener que guardar quién está dentro, y el marcado de elementos no se registra.
El coste asumido y escrito en la decisión: **dos responsables del mismo pedido pueden estar dentro a
la vez y el sistema no lo sabrá.**

### 2.1 Aislamiento por empresa — verificado modelo a modelo

Esto se escribe aquí en vez de dejarlo implícito, porque es donde la ficha se puede equivocar en
silencio.

- **`orders` SÍ tiene `company_id`** (QC-60): `db/schema.prisma`, modelo `Order`, columna
  `companyId String @map("company_id")`, con `@@unique([id, companyId])`
  (`orders_id_company_id_key`). Por tanto **la lectura del pedido va filtrada por la empresa del
  actor** (R7), y no hace falta inventar nada: `OrderCatalog.findAliveById(id, companyId)` ya tiene
  esa firma y ya documenta que `null` significa «no existe, está de baja **o no es de esa empresa**».
- **`order_assignments` SÍ tiene `company_id`**, y sus tres FK son compuestas con ella. La
  comprobación de «este pedido está asignado a quien pide» (R6) se hace con
  `OrderAssignmentRepository.listOrderIdsByUserInCompany(companyId, userId)`, que ya existe y ya
  lleva la empresa **como primer parámetro** (una llamada que la olvide no compila).
- **`recipes` y `recipe_lines` NO tienen `company_id`.** Verificado en `db/schema.prisma`: el modelo
  `Recipe` no declara la columna, y `docs/architecture.md > Dominio` lo registra como **deuda
  abierta de la épica QC-46** (recetas = QC-50, todavía en la lista). **Consecuencia para esta
  ficha, dicha en voz alta:** la lectura de la receta **no puede** filtrarse por empresa porque el
  dato no existe, y esta ficha **no lo arregla** — arreglarlo es QC-50 y traería migración, que
  `[D15]` deja fuera. Lo que sí se hace es **no abrir un agujero nuevo**: la receta **no se pide por
  identificador de la entrada**, sino por el `recipeId` del pedido **ya leído y ya filtrado por
  empresa**. Es decir, la única forma de llegar a una receta es a través de un pedido de tu empresa
  que además tienes asignado. Conocer el id de una receta ajena no da acceso a ella por esta
  pantalla.
- **`units` tiene `company_id` opcional** (QC-76): `NULL` = unidad de sistema. La lectura de
  unidades va con `companyScopeWhere`, la misma condición que ya usa el listado.

## 3. Dominio: el caso de uso nuevo

`lib/modules/asignaciones/domain/get-assigned-order-execution.ts` — **lectura**, y
`lib/modules/asignaciones/domain/start-assigned-order.ts` +
`lib/modules/asignaciones/domain/finish-assigned-order.ts` — **las dos transiciones**.

Tres archivos y no uno, porque son tres operaciones con tres momentos distintos (pintar, abrir,
finalizar) y el módulo ya tiene un archivo por caso de uso.

**El orden dentro de los tres es el mismo, y es el requisito (R5):**

1. `requirePermission(actor, 'asignaciones.consultar')` — **primera línea**, antes de `zod` y antes
   de tocar ningún `deps`. Calcado de `list-assigned-orders.ts`.
2. `zod` sobre la entrada (`orderId` como uuid).
3. `deps.assignments.listOrderIdsByUserInCompany(actor.companyId, actor.id)` → si el `orderId` no
   está en el conjunto, `OrderNotFoundError` (R6: «no es tuyo» y «no existe» son la misma respuesta).
4. `deps.orders.findAliveById(orderId, actor.companyId)` → `null` ⇒ `OrderNotFoundError` (R7).
5. Según la operación: pintar, o transicionar.

**Dependencias del caso de uso de lectura** (`GetAssignedOrderExecutionDeps`): `assignments`,
`orders`, `recipes`, `units` y **`products`**.

> **De dónde salen `numberText` y `orderQuantity` — escrito el 2026-09-17, al implementar.**
> El paso 4 usa `findAliveById`, que devuelve `OrderAssignmentTarget`, y **eso solo trae
> `{ id, status }`**: un test de `pedidos` afirma que esa proyección **no** lleva número ni cantidad,
> así que no se puede ampliar sin romperlo. Los dos datos se obtienen **componiendo** con
> `deps.orders.listAliveSummariesByIds(companyId, [orderId], [status], 1, 1)`, método **ya existente
> del mismo puerto**, y **solo después** de que `findAliveById` haya confirmado pertenencia y
> empresa — el orden importa: la composición nunca precede a la comprobación de acceso.
> **No se amplía `OrderCatalog`** por un dato de presentación ni se le pide nada nuevo a `pedidos`.

> **Corregido el 2026-09-17.** La lista original omitía `products`, y era falsa contra el disco:
> `recetas` no puede resolver el nombre de un producto —ese dato es de `inventario`— así que
> `RecipeExecutionContent.lines[].productName` sale **siempre `null`** de `findExecutionContentById`.
> El caso de uso lo completa con `deps.products.findRefs(...)`, exactamente como ya hace
> `lib/modules/recetas/domain/get-recipe.ts`. Decidido por el humano: la rama degradada dejaría al
> operario leyendo un identificador en vez del nombre del producto que tiene que cargar, y eso es la
> pantalla entera, no un adorno como el factor.

### 3.1 Las dos transiciones (R8, R11, R12, R13, R14)

```
start:   estado actual PENDIENTE  → EN_CURSO
         estado actual EN_CURSO   → NO SE ESCRIBE NADA, se sigue (R9)
         ENTREGADO / CANCELADO    → error de order-state.ts (R14)
finish:  estado actual EN_CURSO   → ENTREGADO
         ENTREGADO / CANCELADO    → error de order-state.ts (R14)
```

- **Quién decide que es legal**: `isAllowedTransition(from, to)` / `assertTransition(from, to)` del
  **contrato público de `pedidos`**, ya exportados. `asignaciones` no escribe ninguna segunda tabla
  de estados (R12). Nota: `order-state.ts` de este módulo **no** es una segunda matriz de
  transiciones; responde otra pregunta («¿admite este estado escrituras de asignación?») y su propia
  cabecera lo dice. Se usa para R14 y **solo** para eso.
- **Quién escribe la columna**: `pedidos`, nunca `asignaciones` (R13). La guardia
  `tests/guards/guard-arquitectura-modulos.test.ts` prohíbe `prisma.order` fuera del módulo
  propietario, así que esto no es una preferencia: es lo único que compila y pasa el gate.

**Cómo se lo pedimos a `pedidos`.** `OrderCatalog` (`lib/modules/pedidos/domain/order-catalog.ts`)
gana **un método de escritura**, el único de su historia:

```ts
// lib/modules/pedidos/domain/order-catalog.ts  (AMPLIACIÓN)
export interface OrderCatalog {
  findAliveById(id: string, companyId: string): Promise<OrderAssignmentTarget | null>;
  listAliveSummariesByIds(...): Promise<Page<AssignedOrderSummary>>;

  /** Mueve el estado de un pedido vivo de esa empresa, SOLO si `assertTransition(from, to)`
   *  lo permite. `from` viaja para que la comprobación caiga sobre el estado leído y el
   *  UPDATE filtre por él: dos entradas simultáneas no pueden escribir dos veces. */
  transitionAliveById(
    id: string,
    companyId: string,
    from: OrderStatus,
    to: OrderStatus,
    actorId: string,
    now: Date,
  ): Promise<'ok' | 'not_found' | 'stale'>;
}
```

Cuatro propiedades que son requisito y no estilo:

1. **La legalidad la comprueba `pedidos` dentro del método**, con su propio `assertTransition`. Que
   `asignaciones` la consulte antes con `isAllowedTransition` es para **pintar** (decidir si hay
   algo que escribir), no para autorizar; el corte real está en `pedidos`. Anticipar no es
   autorizar, exactamente como `canModifyAssignments` documenta para el permiso.
2. **`companyId` es obligatorio en la firma** y el `UPDATE` filtra por él y por `deleted_at IS NULL`.
3. **`from` en el `WHERE`**: `'stale'` significa «alguien lo movió entre el `SELECT` y el `UPDATE`».
   Se traduce a *volver a leer y seguir*, no a un error visible: en R9 dos responsables entrando a la
   vez es un caso **esperado**, no una anomalía.
4. **No hay `updateStatus(id, to)` suelto.** Sin `from`, este método sería un camino para mover un
   pedido a cualquier estado sin pasar por la matriz, y `updateOrder` dejaría de ser la única puerta
   controlada.

La implementación va en el adaptador driven **de `pedidos`**
(`lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts`), que es el único que
puede tocar `prisma.order`. `lib/composition` lo cablea, como ya hace para `list-assigned-orders`.

**Lo que esto NO es:** no se le da `pedidos.modificar` al Operador y no se reutiliza `updateOrder`
(`lib/modules/pedidos/domain/update-order.ts`), que exige ese permiso y además hace **reemplazo
completo** del pedido. Ver `## 8. Alternativas descartadas`.

### 3.2 Lo que la pantalla necesita leer

`getAssignedOrderExecution(actor, { orderId })` devuelve una proyección cerrada. Lo que no está en
el tipo no se puede filtrar por descuido (mismo criterio que `AssignedOrderView`):

```ts
export type AssignedOrderExecutionView = {
  readonly orderId: string;
  readonly numberText: string;          // formatOrderNumber, ya publicado por `pedidos`
  readonly status: 'PENDIENTE' | 'EN_CURSO';
  readonly recipeName: string | null;   // null = receta dada de baja
  readonly orderQuantity: string;       // decimal como TEXTO, nunca number
  readonly recipeBaseQuantity: string | null;
  readonly scaleFactorText: string | null;   // «×2,5» ya formateado, o null
  readonly steps: readonly RecipeStepView[];
  readonly lines: readonly ExecutionLineView[];
};

export type ExecutionLineView = {
  readonly productName: string | null;   // lo resuelve el caso de uso con `deps.products.findRefs`
  readonly quantity: string;            // TAL CUAL está escrita, sin escalar (R21)
  readonly unit: UnitRef;               // la unidad de la línea
  readonly alternativeUnits: readonly UnitRef[];  // misma base efectiva, sin la propia (R22)
};
```

**El factor (R21).** Se muestra, y no se aplica. `[D7]` es explícita sobre por qué: los pasos de
QC-62 son texto libre y escalar solo las líneas produciría `225 L` en la lista y `90 L` en el
párrafo que el operario está leyendo.

> ### PREGUNTA ABIERTA — bloquea la mitad de R21
>
> **De dónde sale `recipeBaseQuantity`**, la cantidad para la que está escrita la receta. Verificado en disco: el
> modelo `Recipe` **no tiene** ninguna columna de cantidad base ni de rendimiento, y `RecipeDetail`
> no publica ninguna. Sin ese dato, «receta para 100 L · ×2,5» **no se puede calcular**. Los dos
> campos van tipados como `| null` y la pantalla, cuando son `null`, muestra la cantidad del pedido
> **sin factor**. No se inventa la columna: sería tabla, migración y ficha propia.

### 3.3 De dónde salen los pasos y las líneas sin `recetas.consultar`

`createGetRecipe` **no sirve**: su primera línea es `requirePermission(actor, 'recetas.consultar')`,
que el Operador no tiene (verificado en `lib/modules/recetas/domain/get-recipe.ts`). Usarlo
devolvería `unauthorized` a todo Operador — el mismo tropiezo que `list-assigned-orders.ts` ya
documenta con `listResponsiblesForOrders`.

`RecipeCatalog` gana un método de lectura, con el patrón «servicio vía interfaz» que la arquitectura
exige entre módulos:

```ts
// lib/modules/recetas/domain/recipe-catalog.ts  (AMPLIACIÓN)
findExecutionContentById(id: RecipeId): Promise<RecipeExecutionContent | null>;

export type RecipeExecutionContent = {
  readonly id: RecipeId;
  readonly name: string;
  readonly isDeleted: boolean;
  readonly steps: readonly RecipeStepView[];
  readonly lines: readonly { productId: string; productName: string | null;
                             quantity: string; unitId: UnitId }[];
};
```

- **Sin `companyId` en la firma**, y el porqué está en `## 2.1`: `recipes` no tiene esa columna
  todavía. Se documenta como deuda de QC-50 en vez de fingir un filtro que no existe.
- **No devuelve `imageUrl`, ni autores, ni marcas de tiempo**: la pantalla no los pinta.
- **Una receta dada de baja vuelve igual, con `isDeleted: true`**, mismo criterio que
  `findRefsIncludingDeleted`: un pedido viejo con receta retirada sigue teniendo que poder
  prepararse. La pantalla lo avisa; no lo bloquea.

### 3.4 Unidades alternativas (R22, R23, R25)

`UnitRef` **ya trae `baseUnitId` y `factor`** (verificado en
`lib/modules/unidades/domain/unit-catalog.ts`, ampliado por QC-76): con eso se calcula la base
efectiva `baseUnitId ?? id` sin repetir el criterio. Lo que falta es poder **listar las hermanas**.
`UnitCatalog` gana:

```ts
findRefsSharingBaseInCompany(
  companyId: string,
  unitIds: readonly UnitId[],
): Promise<readonly UnitRef[]>;
```

Devuelve las unidades **visibles para esa empresa** (`companyScopeWhere`: propias o de sistema) cuya
base efectiva coincide con la de alguna de las pedidas. El caso de uso agrupa en memoria y descarta
la propia unidad de cada línea.

La conversión se hace con **`convertQuantity`** y con nada más (R25). Y `[D8]` es tajante: una
conversión imposible es **error**, no un resultado raro — `convertQuantity` ya lanza
`IncompatibleUnitsError` (`incompatible_units`), y R23 se cumple **no capturándolo y no
sustituyéndolo por un guion**.

**Dónde se convierte.** En el **cliente**, sin ida y vuelta al servidor: `convertQuantity` es dominio
puro y el barril de `unidades` es importable desde un componente de cliente (lo promete su primera
línea y lo vigila la guardia de arquitectura). Así el cambio de unidad es instantáneo en planta y
**no persiste nada** (R24), que es justo lo que pide la decisión.

## 4. Rutas, páginas y contratos de entrada/salida

```
app/(private)/asignacion/[id]/
  page.tsx                       # Server Component. requirePagePermission + lectura + props
  components/
    index.ts                     # barrel de la ruta (obligatorio, docs/architecture.md)
    order-execution-screen.tsx   # 'use client'. Monta StepReader, maneja Finalizar
    order-execution-lines.tsx    # 'use client'. Líneas + selector de unidad
    order-scale-banner.tsx       # el factor, visible y fijo (R21)
    order-execution-error.tsx    # el pedido no existe / no es tuyo / está entregado
```

`page.tsx`, en este orden exacto:

1. `await requirePagePermission('asignaciones.consultar')` — **antes** de resolver `params` (R2, R3).
2. Server Action de lectura + apertura → `EN_CURSO` (R8).
3. Pinta pasando **todo por props**. Ningún componente de cliente importa `lib/composition`.

**Server Actions**, en `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts`
(archivo nuevo, no se toca `order-assignment-actions.ts`). Se importan **por ruta exacta**, nunca
por el barril: un `'use server'` en el cierre del contrato lo volvería inimportable desde cliente.

| Acción | Entrada | Salida |
| --- | --- | --- |
| `startAssignedOrderAction` | `{ orderId: string }` tipado | `{ status:'success', data: AssignedOrderExecutionView } \| ErrorState` |
| `finishAssignedOrderAction` | `FormData` con `orderId` | `{ status:'success' } \| ErrorState` |

La capa driving **no decide nada**: resuelve el actor de las dos caras de la sesión vía
`@/lib/composition` dentro de `runInRequestScope`, traduce por `code` con
`createErrorStateTranslator(AsignacionesError, ...)` y nada más. Copiado de
`order-assignment-actions.ts`.

**Una sola lectura de sesión por petición** (QC-104): la página y la acción comparten la lectura vía
`runInRequestScope`. Los dos tests de conteo del gate leen el disco y descubrirán la acción nueva
sola; **hay que dejarla con su ámbito o se ponen rojos**.

`finishAssignedOrderAction` termina con `redirect(ASSIGNED_ORDERS_ROUTE)` y `revalidatePath` de esa
ruta (R15): la lista debe volver **sin** el pedido, porque QC-88 R11 solo trae `PENDIENTE` y
`EN_CURSO` (R17). La confirmación visible se muestra **antes** de volver, en la propia pantalla.

## 5. La enmienda a QC-88 (R27, R28)

**Archivo por archivo, y ninguna guardia se afloja.** Lo que hoy afirma el bloqueo, localizado en el
disco:

| Archivo | Qué afirma hoy | Qué pasa a afirmar |
| --- | --- | --- |
| `app/(private)/asignacion/components/assigned-order-enter-trigger.tsx` | `status === 'EN_CURSO'` ⇒ `<button disabled>` + motivo | **Siempre `<Link>` habilitado.** El párrafo se conserva como **aviso** («Este pedido ya está en curso.») y sigue asociado por `aria-describedby`. `assignedOrderEnterDisabledReason()` se renombra a `assignedOrderEnterNoticeText()`; sigue siendo **función y no literal**, para que ningún test compare contra una copia. |
| `tests/unit/asignaciones-ui/assigned-order-enter-trigger.test.tsx` | Bloque `describe('R21 - EN_CURSO: el disparador esta deshabilitado...')`: 4 casos | Se **tensa**: en `EN_CURSO` el disparador es un enlace con `href === assignedOrderRoute(id)`, **no** está `disabled`, **no** tiene `aria-disabled="true"`, **y además** el aviso sigue visible y sigue asociado por `aria-describedby`. Son **más** aserciones que hoy, no menos. Nota fechada `2026-09-17 (QC-63 R27)` encima del `describe`. |
| `tests/unit/asignaciones-ui/a11y-tactil.test.tsx` | Caso «el disparador «entrar» deshabilitado (EN_CURSO)» + el bloque del motivo sin puntero | El objetivo táctil de 44×44 se **mantiene** en los dos estados (solo cambia el nombre del caso) y el bloque «el motivo se alcanza SIN el puntero» **se conserva entero**: el aviso sigue siendo texto en el DOM y nunca un `title`. **Ninguna aserción se borra.** |
| `e2e/pedidos-asignados.spec.ts` (líneas ~349-354) | `await expect(enterInProgress).toBeDisabled()` | `await expect(enterInProgress).toBeEnabled()` **y** `toHaveAttribute('href', ...)` **y** el aviso sigue `toBeVisible()`. Se gana una aserción. |
| `specs/QC-88-.../requirements.md` | R21 y R23 | **No se reescriben.** Se añade una nota fechada al pie que dice que **QC-63 R27 las enmienda** y que QC-63 `[D16]` es la decisión que lo autoriza. El spec de QC-88 es historia; no se maquilla. |

**Prueba por mutación, obligatoria** (R28, mismo procedimiento que QC-88 usó con la guardia de
QC-102): revertir a mano `assigned-order-enter-trigger.tsx` a la rama `disabled` debe poner **rojos**
los tres archivos de test de arriba. Si alguno queda verde, ese test no estaba afirmando nada y hay
que arreglarlo antes de seguir.

**Ninguna guardia de `tests/guards/` se toca.** Se comprobó: los diez archivos de `tests/guards/`
que mencionan `asignaciones` vigilan permisos, arquitectura de módulos, ámbito de empresa y pantallas
que exigen permiso — ninguno afirma nada sobre el disparador. Lo que sí hay que hacer es **dejarlas
todas verdes**, en particular `guard-pantallas-exigen-permiso` (la ruta nueva debe abrir con
`requirePagePermission`) y `guard-arquitectura-modulos` (nada de `prisma.order` en `asignaciones`).

## 6. Multiplataforma (R26)

- `StepReader` ya trae `min-h-11 min-w-11` y su motivo de bloqueo como texto visible: se hereda.
- El **selector de unidad** es lo único nuevo que se toca con guantes. `Select` de shadcn/ui (Radix),
  ya en el repo, con `min-h-11 min-w-11`. **Ninguna dependencia nueva.**
- El aviso de R27 y la confirmación de R15 son **texto en el DOM**, nunca `title` ni tooltip por
  `:hover`.
- Alto con `min-h-dvh`, nunca `100vh`. Ninguna excepción de escritorio se declara: esta pantalla se
  usa en planta, en móvil o tablet.

## 7. Dependencias de terceros

**Ninguna.** Se revisó pieza a pieza: el selector lo cubre shadcn/ui (ya instalado), la conversión
decimal la resuelve `convertQuantity` con `BigInt` y sin dependencias (QC-76 R38), la validación es
`zod` (ya instalado) y el asistente de pasos ya está escrito.

Por tanto **no se abre ninguna propuesta de dependencia** y `docs/dependencias.md` no cambia. Si al
implementar apareciera una necesidad real, **no se instala**: se para, se escriben los cuatro checks
de `docs/architecture.md > Dependencias de terceros` en este archivo y lo aprueba el humano.

## 8. Alternativas descartadas

**8.1 — Darle `pedidos.modificar` al Operador y llamar a `updateOrder`. DESCARTADA.**
Es lo que `[D1]` insinuaba y lo que `[D13]` corrige contra el disco. Dos motivos, los dos
verificados: (a) `updateOrder` exige `pedidos.modificar`, que hoy abre **editar, anular y borrar
cualquier pedido de la empresa** — se le daría al Operador el ERP entero de pedidos para que pudiera
pulsar «Finalizar»; (b) `updateOrder` hace **reemplazo completo** del conjunto de datos de negocio,
así que «mover el estado» pasaría por reenviar cantidad, prioridad y receta, y un fallo de esa
pantalla podría reescribir el pedido. Misma clase de agujero que QC-88 H1 evitó a conciencia.

**8.2 — Darle `asignaciones.modificar`. DESCARTADA.**
Ese permiso corta hoy **asignar y desasignar responsables** (`assign-responsibles.ts`,
`unassign-responsible.ts`, `remove-work-group-from-order.ts`). Un Operador con él podría
**repartirse pedidos a sí mismo**. Además, `SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]` no lo trae: exigir
los dos permisos, como pedía `[D1]`, dejaría al Operador **fuera de su propia pantalla**.

**8.3 — Copiar la matriz de transiciones dentro de `asignaciones`. DESCARTADA.**
Sería la tercera copia de la misma tabla. El motivo está escrito en los dos archivos que ya la
rozan: `order-transitions.ts` y `order-state.ts` dicen, cada uno por su lado, que dos copias
**divergen en silencio** el día que el catálogo de estados crezca. `[D14]` lo cierra.

**8.4 — Bloquear la entrada a un pedido `EN_CURSO` (lo que QC-88 R21 hace hoy). DESCARTADA
por `[D15]`.** La alternativa dejaba el trabajo bloqueado hasta que alguien de oficina devolviera el
pedido a `PENDIENTE`; y el caso real de planta —se apaga la tablet, se recarga la pantalla— es
frecuente. Se aceptó a cambio el coste escrito: dos responsables dentro a la vez, invisibles para el
sistema.

**8.5 — Un `lock` con columna «quién está dentro» para evitar 8.4. DESCARTADA.**
Resuelve el coste de 8.4, pero cuesta columna, migración y registro de quién hizo qué, que `[D9]`
deja **fuera de alcance** y `[D15]` prohíbe explícitamente («sin dato nuevo, sin columna y sin
migración»). Si en planta duele, es ficha nueva con el caso real medido.

**8.6 — Escalar las líneas a la cantidad del pedido. DESCARTADA por `[D7]`.**
Escalar solo las líneas es **peor** que no escalar: los pasos de QC-62 son texto libre y un «cargar
el reactor con 90 L de agua» dentro de un párrafo no se puede escalar sin adivinar; la pantalla
diría `225 L` en la lista y `90 L` en el paso que el operario está leyendo, y eso en planta es un
lote perdido.

**8.7 — Reescribir `StepReader` para que leyera sus datos. DESCARTADA por `[D10]`.**
Su cabecera ya promete que «QC-63 podrá montarlo pasándole otro `onFinish` sin tocar una línea de
aquí», y un **test de fuente** afirma que no importa `lib/composition`, Server Actions ni
`next/navigation`. Romperlo pondría rojo ese test y volvería a escribir un asistente que ya existe.

**8.8 — Convertir unidades en el servidor, con una Server Action por cambio. DESCARTADA.**
`convertQuantity` es dominio puro e importable desde cliente; una ida y vuelta por cada cambio de
unidad añade latencia en una tablet de planta y tienta a **persistir** la preferencia, que `[D8]`
prohíbe. Se descarta también mostrar «—» o la cantidad original ante unidades incompatibles: `[D8]`
dice que es un **error**, no un resultado raro.

## 9. Archivos que la feature va a tocar

> **Para F1.4**: esta es la lista que el leader cruza con **QC-91**, que corre en la misma zona.
> QC-91 es «la existencia pasa a ser la suma de los lotes» (`products.stock` fuera), o sea
> `inventario` + `products`/`product_batches`. **Solape esperado: ninguno.** El único punto de roce
> teórico sería `RecipeLineView.productStock`, que sale de `ProductCatalog.findRefs` — y esta ficha
> **no lo usa ni lo toca**: su proyección de línea (`ExecutionLineView`, `## 3.2`) no lleva
> existencia. Si QC-91 cambia la firma de `ProductCatalog`, esta ficha no se entera.
>
> **Corregido el 2026-09-17, sin borrar lo de arriba.** Esta ficha **SÍ usa `ProductCatalog`**, por
> su contrato público y solo para leer `name` (ver `## 3`): lo **USA, no lo toca**. **Ningún archivo
> de `lib/modules/inventario/**` entra en el diff de esta rama** — si alguna task se viera obligada a
> **editar** uno, se **para** y se rehace este análisis, porque entonces sí habría solape.
> **El solape se volvió a verificar contra el diff real de la rama viva de QC-91, no contra su spec:
> QC-91 no toca `lib/composition/index.ts`.** Lo único que QC-91 cambia de ese contrato es
> `stock: number | null` → `stockByUnit`; como aquí **solo se lee `name`** y no se depende de ningún
> campo de existencia, el merge de QC-91 no roza a esta ficha. **Solape: sigue siendo ninguno.**

**Nuevos**

| Archivo | Qué |
| --- | --- |
| `app/(private)/asignacion/[id]/page.tsx` | Pantalla (Server Component) |
| `app/(private)/asignacion/[id]/components/index.ts` | Barrel de la ruta |
| `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` | Monta `StepReader` |
| `app/(private)/asignacion/[id]/components/order-execution-lines.tsx` | Líneas + selector de unidad |
| `app/(private)/asignacion/[id]/components/order-scale-banner.tsx` | El factor visible y fijo |
| `app/(private)/asignacion/[id]/components/order-execution-error.tsx` | Estados de error |
| `lib/modules/asignaciones/domain/get-assigned-order-execution.ts` | Caso de uso de lectura |
| `lib/modules/asignaciones/domain/start-assigned-order.ts` | Transición a `EN_CURSO` |
| `lib/modules/asignaciones/domain/finish-assigned-order.ts` | Transición a `ENTREGADO` |
| `lib/modules/asignaciones/domain/assigned-order-execution-view.ts` | Proyección de salida |
| `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts` | Server Actions |
| `tests/unit/asignaciones/get-assigned-order-execution.test.ts` | R5–R7, R20–R25 |
| `tests/unit/asignaciones/start-assigned-order.test.ts` | R8, R9, R12–R14 |
| `tests/unit/asignaciones/finish-assigned-order.test.ts` | R11–R14, R16 |
| `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` | R15, R18, R19, R21, R26 |
| `tests/unit/asignaciones-ui/order-execution-lines.test.tsx` | R22–R25 |
| `e2e/ejecucion-receta.spec.ts` | R29, R30 |

**Modificados**

| Archivo | Qué cambia | Riesgo |
| --- | --- | --- |
| `lib/modules/pedidos/domain/order-catalog.ts` | `+ transitionAliveById` | Bajo: método nuevo |
| `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts` | Implementación | Bajo |
| `lib/modules/pedidos/index.ts` | Sin cambios de símbolo (`OrderCatalog` ya se exporta) | — |
| `lib/modules/recetas/domain/recipe-catalog.ts` | `+ findExecutionContentById`, `+ RecipeExecutionContent` | Bajo |
| `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts` | Implementación | Bajo |
| `lib/modules/recetas/index.ts` | `+ type RecipeExecutionContent` | Bajo |
| `lib/modules/unidades/domain/unit-catalog.ts` | `+ findRefsSharingBaseInCompany` | Bajo |
| `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts` | Implementación con `companyScopeWhere` | Bajo |
| `lib/modules/asignaciones/index.ts` | `+` las tres factories, sus `*Deps` y la vista | Bajo: bloque nuevo al final |
| `lib/composition/index.ts` | Cablea los tres casos de uso nuevos | **Medio: archivo caliente**, muchas features lo tocan |
| `app/(private)/asignacion/components/assigned-order-enter-trigger.tsx` | R27 | **Medio: es de QC-88** |
| `app/(private)/asignacion/components/index.ts` | Renombre del export del texto | Bajo |
| `app/(private)/asignacion/components/assigned-orders-columns.tsx` | Solo si arrastra el nombre renombrado | Bajo |
| `tests/unit/asignaciones-ui/assigned-order-enter-trigger.test.tsx` | R28, tensado | **Medio: es de QC-88** |
| `tests/unit/asignaciones-ui/a11y-tactil.test.tsx` | R28, se conserva y se renombra un caso | Bajo |
| `e2e/pedidos-asignados.spec.ts` | R28, tensado | **Medio: es de QC-88** |
| `specs/QC-88-.../requirements.md` | Nota fechada al pie (no se reescriben R21/R23) | Bajo |

**Sin tocar, y a propósito:** `components/shared/step-reader/**` (R18),
`lib/modules/identity/domain/permissions.ts` (R4), `lib/shared/routes.ts` (R1),
`lib/modules/pedidos/domain/order-transitions.ts` (R12),
`lib/modules/asignaciones/domain/order-state.ts`, `db/schema.prisma` y `db/migrations/**` (R10).
