# QC-63 — ejecutar-receta-operador · bitácora de implementación

> Worktree `.worktrees/QC-63-ejecutar-receta-operador`, rama
> `feature/QC-63-ejecutar-receta-operador`. Base: `bdd0700`.
> El gate (`./init.sh`) lo corre el leader. Aquí solo se anota lo que corrió el implementer
> y sus subagentes: `pnpm typecheck`, `pnpm lint` y los tests de los módulos tocados.

## Estado por tanda

| Tanda | Bloque | Tasks | Estado |
| --- | --- | --- | --- |
| 1 | A — servicios de otros módulos | T1, T2, T3 | **hecha**, pendiente de `--rapido` del leader |
| 2 | B — caso de uso y seguridad | T4–T10 | **hecha** |
| 3 | C — pantalla | T11–T16 | pendiente |
| 4 | D — enmienda a QC-88 | T17–T22 | pendiente |
| 5 | E — cierre | T23, T24 | pendiente |

---

## Tanda 1 — Bloque A (T1, T2, T3)

Implementada por `backend_dev`. Ninguna dependencia nueva. Ninguna migración, ninguna
columna, `db/schema.prisma` intacto.

### Archivos tocados

**T1 — `pedidos` mueve el estado por encargo**
- `lib/modules/pedidos/domain/order-catalog.ts` — `+ transitionAliveById(id, companyId, from, to, actorId, now): Promise<'ok'|'not_found'|'stale'>`
- `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts` — implementación.
  `assertTransition(from, to)` se llama **dentro de `pedidos`** y **antes** de tocar Prisma; el
  `updateMany` filtra `id`, `companyId`, `deletedAt: null` y `status: from`; si `count !== 1`
  relee para distinguir `'not_found'` de `'stale'`. `updatedBy = actorId`.
- `tests/unit/pedidos/order-catalog.test.ts`
- `tests/unit/pedidos/module-contract.test.ts` — la aserción de lista **exacta** de consumidores
  de `assertTransition` gana un tercer consumidor. **Se TENSA, no se afloja**: sigue siendo lista
  exacta y el consumidor nuevo queda explícito.

**T2 — `recetas` publica el contenido que se ejecuta**
- `lib/modules/recetas/domain/recipe-catalog.ts` — `+ findExecutionContentById`, `+ RecipeExecutionContent`, `+ RecipeExecutionLine`
- `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts` — la receta de baja
  vuelve con `isDeleted: true`, no se oculta. Sin `companyId` en la firma (el porqué vive en
  `design.md > 2.1`, no en un comentario del código).
- `lib/modules/recetas/index.ts`
- `tests/unit/recetas/recipe-catalog.test.ts`
- Colateral de compilación (stubs para la interfaz ampliada en T3, no ejercitados):
  `tests/unit/recetas/authorization.test.ts`, `recipe-image-lifecycle.test.ts`,
  `recipe-image-url.test.ts`, `recipe-lines-catalog.test.ts`, `recipe-service.test.ts`

**T3 — `unidades` lista las hermanas**
- `lib/modules/unidades/domain/unit-catalog.ts` — `+ findRefsSharingBaseInCompany`
- `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts` — reutiliza
  `companyScopeWhere`, sin segundo `OR` de ámbito; base efectiva `baseUnitId ?? id`.
- `tests/unit/unidades/unit-catalog.test.ts`

### Criterio → test

| Criterio | Test |
| --- | --- |
| T1(a) `PENDIENTE→EN_CURSO` y `EN_CURSO→ENTREGADO` | `tests/unit/pedidos/order-catalog.test.ts` › `transitionAliveOrder` › `T1(a) - mueve...` |
| T1(b) `ENTREGADO→EN_CURSO` lanza `InvalidTransitionError` sin escribir | ídem › `T1(b)` |
| T1(c) `'not_found'` con otra empresa | ídem › `T1(c)` |
| T1(d) `'stale'` si `from` no coincide | ídem › `T1(d)` |
| T2 receta viva con pasos y líneas | `tests/unit/recetas/recipe-catalog.test.ts` › `T2(a)` |
| T2 receta de baja con `isDeleted: true` | ídem › `T2(b)` |
| T2 id inexistente ⇒ `null` | ídem › `T2(c)` |
| T3(a) litro ⇒ litro y mililitro | `tests/unit/unidades/unit-catalog.test.ts` › `T3(a)` |
| T3(b) no devuelve kilogramo | ídem › `T3(b)` |
| T3(c) no devuelve otra empresa, sí sistema | ídem › `T3(c)` |

> El mapa `R<n> → test` completo de los 31 requisitos es **T24** y se escribe al cierre.
> Bloque A no mapea requisitos directamente: son los servicios que R12/R13/R22 necesitan.

### Salida real

`pnpm exec vitest run tests/unit/pedidos tests/unit/recetas tests/unit/unidades --maxWorkers=2`

```
Test Files  97 passed (97)
     Tests  1421 passed | 9 skipped (1430)
```

`pnpm lint` — verde, sin salida.

`pnpm typecheck` — **rojo, y es lo esperado hasta T9.** Al ampliar las tres interfaces,
`lib/composition/index.ts` todavía no cablea los métodos nuevos. Archivos en rojo:
`lib/composition/index.ts`, `tests/integration/asignaciones/use-case-fixture.ts`,
`tests/unit/asignaciones/assign-responsibles.test.ts`,
`tests/unit/asignaciones/list-assigned-orders.test.ts` (todos Bloque B, T9) y
`app/layout.tsx` (**preexistente en la rama, no lo toca esta ficha**).
Ningún archivo de `pedidos`, `recetas` ni `unidades` da error.

`pnpm exec vitest run guard` (corrido de más, para no dejar sorpresas): 42/43 archivos verdes.
El único rojo es `tests/guards/guard-ambito-empresa-pedidos.test.ts` (2 fallos), por el mismo
cableado pendiente de T9. `guard-arquitectura-modulos.test.ts`: 61/61 verde.

### Nota de entorno
El worktree no traía `node_modules` ni cliente Prisma generado. Se corrió
`pnpm install --frozen-lockfile` y `pnpm exec prisma generate`. **No se cambió ninguna
dependencia ni `package.json`.**

---

## PREGUNTA CERRADA el 2026-09-17 — `productName`

**Verificado en disco, no supuesto.** `RecipeExecutionContent.lines[].productName` sale
**siempre `null`** desde `recetas`: el catálogo no puede resolver el nombre de un producto,
que es dato de `inventario`. Comprobado en `lib/modules/recetas/domain/get-recipe.ts`: hoy ese
nombre se resuelve con `deps.products.findRefs(...)`, con `ProductCatalog` importado de
`@/lib/modules/inventario`.

El choque con el spec:
- `design.md > 3.2` tipa `ExecutionLineView.productName: string | null` **sin decir quién lo
  resuelve**, y la lista de dependencias del caso de uso (`design.md > 3`) nombra solo
  `assignments`, `orders`, `recipes` y `units` — **no `products`**.
- `design.md > 9` afirma, en el cruce de solapes con **QC-91**, que esta ficha **«no usa ni
  toca»** `ProductCatalog`. Añadirle `products: ProductCatalog` a T5 contradiría ese análisis
  y metería a la ficha en la zona de QC-91.

Las dos salidas son decisión humana, no del implementer:
- **(a) rama degradada**: `productName` se queda `null` y la pantalla pinta el identificador o un
  marcador. Respeta `design.md > 9` y no toca `inventario`.
- **(b) enriquecer**: T5 gana `products: ProductCatalog`, como `get-recipe.ts`. Da el nombre real,
  pero **invalida el análisis de solape con QC-91** y hay que rehacerlo.

**RESUELTA por el humano: opción (b), enriquecer.** T5 gana `products: ProductCatalog` y resuelve
el nombre de verdad con `deps.products.findRefs`, como `get-recipe.ts`. Motivo: la rama degradada
dejaría al operario delante del reactor leyendo un identificador en vez del nombre del producto que
tiene que cargar — eso es la pantalla entera, no un adorno como el factor.

El solape con QC-91 lo rehízo el humano contra el **diff real de la rama viva** de QC-91, no contra
su spec: **no existe**. QC-91 no toca `lib/composition/index.ts`; consumir `ProductCatalog` es
**importarlo, no editarlo**; y aquí se lee **solo `name`**, nunca un campo de existencia, así que el
cambio `stock` → `stockByUnit` no roza. `design.md` quedó corregido en sus secciones **3**, **3.2**
y **9**, con la fecha y **sin borrar** el análisis viejo.

**Resuelta el 2026-09-17** (corrección de `design.md > 3` y `> 9` fechada ese mismo día, ficha
QC-120 nacida aparte para el rendimiento de la receta): la lista de dependencias de T5 gana
`products: ProductCatalog`, y `productName` se resuelve exactamente como aquí se documentó en
la opción (b) — igual que `get-recipe.ts`. El "no usa ni toca" de `design.md > 9` se corrigió a
"usa el contrato público, no toca ningún archivo de `lib/modules/inventario/**`", que es lo que
implementa la Tanda 2.

---

## Tanda 2 — Bloque B (T4–T10)

Implementada por `backend_dev`. Ninguna dependencia nueva. Ninguna migración, ninguna columna.

### Archivos nuevos

- `lib/modules/asignaciones/domain/assigned-order-execution-view.ts` (T4) — `AssignedOrderExecutionView` y `ExecutionLineView`, cerrados: sin autoría, sin marcas de tiempo, sin existencia de producto.
- `lib/modules/asignaciones/domain/get-assigned-order-execution.ts` (T5) — lectura. Orden exacto: `requirePermission` → `zod` → `listOrderIdsByUserInCompany` → `findAliveById` → contenido.
- `lib/modules/asignaciones/domain/start-assigned-order.ts` (T6) — `PENDIENTE ⇒ EN_CURSO`; `EN_CURSO` no escribe; `ENTREGADO`/`CANCELADO` ⇒ `assertOrderAcceptsWrites`; `'stale'` relee y sigue.
- `lib/modules/asignaciones/domain/finish-assigned-order.ts` (T7) — `→ ENTREGADO`; misma política de `'stale'`; la firma no admite ningún dato de marcado.
- `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts` (T10) — `startAssignedOrderAction`, `finishAssignedOrderAction`.
- `tests/unit/asignaciones/get-assigned-order-execution.test.ts` (T5) — R5, R6, R7, R22.
- `tests/unit/asignaciones/start-assigned-order.test.ts` (T6) — R5, R8, R9, R12, R14, `stale`.
- `tests/unit/asignaciones/finish-assigned-order.test.ts` (T7) — R5, R6, R11, R14, R16, `stale`.

### Archivos modificados

- `lib/modules/asignaciones/index.ts` (T8) — bloque nuevo al final: las tres factories, sus `*Deps` y los dos tipos de la vista. Ninguna Server Action.
- `lib/composition/index.ts` (T9) — cablea `orderCatalog.transitionAliveById`, `recipeCatalog.findExecutionContentById`, `unitCatalog.findRefsSharingBaseInCompany` (los tres huecos que dejaban T1–T3 en rojo) y las tres factories nuevas de `asignaciones`, reutilizando `orderAssignmentRepository`, `orderCatalog`, `recipeCatalog`, `unitCatalog` y `productCatalog` ya existentes. Ningún adaptador nuevo, ningún reordenamiento de lo de arriba.
- `tests/integration/asignaciones/use-case-fixture.ts`, `tests/unit/asignaciones/assign-responsibles.test.ts` — el doble de `OrderCatalog` gana `transitionAliveById` (estaba incompleto desde T1 y ponía el `tsc` en rojo).
- `tests/unit/asignaciones/list-assigned-orders.test.ts` — el cast del doble de `RecipeCatalog` pasa a `as unknown as RecipeCatalog` (mismo motivo: `findExecutionContentById` es obligatorio desde T2).
- `tests/unit/asignaciones/module-contract.test.ts` — la lista `CONSUMO_LEGITIMO` de la enmienda R29 gana los tres archivos nuevos que exigen `asignaciones.consultar` (`get-assigned-order-execution.ts`, `start-assigned-order.ts`, `finish-assigned-order.ts`), por archivo exacto y no por carpeta — igual criterio que ya usaba `list-assigned-orders.ts`.

### Una decisión de implementación no escrita literalmente en `design.md`

`design.md > 3` dice que el paso 4 es `deps.orders.findAliveById(orderId, actor.companyId)` y
que el paso 5 "pinta". Pero `OrderAssignmentTarget` (lo que devuelve `findAliveById`, fijado por
T1 y protegido por un test que afirma que **no** lleva `recipeId`/`quantity`/`número`) solo trae
`{ id, status }`. La vista (T4) necesita `numberText`, `recipeId` (para pedir el contenido de la
receta) y `orderQuantity`. Se resolvió componiendo con el método que **ya existe** en el mismo
puerto para ese propósito: `deps.orders.listAliveSummariesByIds(companyId, [orderId], [status], 1,
1)`, pidiendo la página de un solo pedido una vez que `findAliveById` ya confirmó pertenencia y
empresa. No se tocó `OrderCatalog` ni se le pidió a `pedidos` ningún método nuevo: es una
composición de dos métodos ya committeados en T1. Se documenta aquí porque no es lo que
`design.md` narra paso a paso, y es la clase de desvío que esta ficha pide señalar explícitamente
en vez de darlo por rellenado con un supuesto.

### Mapa `R<n>` → test (los de esta tanda; la tabla completa de 31 es T24)

| Requisito | Archivo · caso |
| --- | --- |
| R5 | `tests/unit/asignaciones/get-assigned-order-execution.test.ts` › describe *"getAssignedOrderExecution — autorizacion"* › *"R5: exige `asignaciones.consultar` ANTES de tocar ningun puerto"* (y su gemela en `start-assigned-order.test.ts` / `finish-assigned-order.test.ts`) |
| R6 | `get-assigned-order-execution.test.ts` › describe *"getAssignedOrderExecution — R6: no es tuyo"* › *"pedido existente pero no asignado a quien lo pide devuelve `order_not_found`"*; también `finish-assigned-order.test.ts` › describe *"finishAssignedOrder — R6: no es tuyo"* |
| R7 | `get-assigned-order-execution.test.ts` › describe *"getAssignedOrderExecution — R7: la empresa"* › *"pedido de otra empresa (no vivo para el actor) devuelve el mismo `order_not_found`"* |
| R8 | `start-assigned-order.test.ts` › describe *"startAssignedOrder — R8: PENDIENTE abre el pedido"* › *"transiciona PENDIENTE a EN_CURSO"* |
| R9 | `start-assigned-order.test.ts` › describe *"startAssignedOrder — R9: EN_CURSO no escribe nada"* › *"con el pedido ya EN_CURSO, `transitionAliveById` no se llama ni una vez"* |
| R11 | `finish-assigned-order.test.ts` › describe *"finishAssignedOrder — R11: EN_CURSO transiciona a ENTREGADO"* › *"llama a `transitionAliveById` con el estado leido y `ENTREGADO`"* |
| R12 | `start-assigned-order.test.ts` › describe *"startAssignedOrder — R12: la legalidad la decide `pedidos`, no una segunda tabla"* › *"el archivo no declara ninguna lista de estados propia"* |
| R13 | cubierto por la guardia `tests/guards/guard-arquitectura-modulos.test.ts` (ningún adaptador de `asignaciones` toca `prisma.order`) |
| R14 | `start-assigned-order.test.ts` y `finish-assigned-order.test.ts` › describe *"— R14: ENTREGADO y CANCELADO no admiten..."* › casos *"ENTREGADO rechaza con `order_delivered_frozen` sin escribir"* / *"CANCELADO rechaza con `order_cancelled_not_assignable` sin escribir"* |
| R16 | `finish-assigned-order.test.ts` › describe *"finishAssignedOrder — R16: no admite ningun dato de marcado"* › *"la firma solo acepta el actor y el identificador del pedido: sin un tercer parametro"* y *"un `input` con datos de marcado no cambia el resultado: el esquema estricto los rechaza"* |
| R20 | cubierto por la proyección cerrada de T4 (ningún campo de escritura en `AssignedOrderExecutionView`); verificado por `tsc --noEmit` |
| R22 | `get-assigned-order-execution.test.ts` › describe *"getAssignedOrderExecution — R22: unidades alternativas"* › *"solo vuelven unidades de la misma base efectiva, sin la propia"* |
| R23 | cubierto en T13 (UI), fuera de esta tanda |
| R25 | cubierto en T13 (UI), fuera de esta tanda |

### Salida real

`pnpm typecheck` — verde salvo `app/layout.tsx(43,56): error TS2304: Cannot find name
'LayoutProps'` (preexistente en la rama, no es de esta ficha).

`pnpm lint` — verde, sin salida.

`pnpm exec vitest run tests/unit/asignaciones tests/unit/pedidos tests/unit/recetas tests/unit/unidades --maxWorkers=2`
(con los tres archivos de test nuevos ya dentro):
```
Test Files  119 passed (119)
     Tests  1819 passed | 9 skipped (1828)
```

`pnpm exec vitest run tests/integration/asignaciones` — no se pudo ejecutar en este entorno: falta
`DATABASE_URL`/`.env` (mensaje `test-db: falta DATABASE_URL...`). Es un problema de entorno del
worktree, no de código; el leader lo corre donde sí hay base de test.

`pnpm exec vitest run guard --maxWorkers=2`:
```
Test Files  43 passed (43)
     Tests  482 passed | 9 skipped (491)
```
Las dos guardias que venían rojas por el cableado pendiente
(`tests/guards/guard-ambito-empresa-pedidos.test.ts`) quedaron verdes con T9.

---

## Verificación de la Tanda 2 corrida por el implementer (no delegada)

No se dio por buena la salida del subagente: se volvió a correr entera.

```
pnpm typecheck
app/layout.tsx(43,56): error TS2304: Cannot find name 'LayoutProps'.
```

**Ese rojo NO es de esta ficha y está probado:** `git diff origin/dev --name-only` no incluye
`app/layout.tsx`, y `git show origin/dev:app/layout.tsx` ya trae `LayoutProps<"/">`. Es un tipo
**global que genera Next** (`.next/types`), que no existe en un worktree recién montado donde nunca
corrió `next build`. **Todo lo demás está verde**: los cuatro archivos que T1–T3 dejaron rojos los
cerró T9.

```
pnpm lint
(verde, sin salida)

pnpm exec vitest run tests/unit/asignaciones tests/unit/pedidos tests/unit/recetas tests/unit/unidades --maxWorkers=2
Test Files  119 passed (119)
     Tests  1819 passed | 9 skipped (1828)

pnpm exec vitest run guard --maxWorkers=2
Test Files  43 passed (43)
     Tests  482 passed | 9 skipped (491)
```

Las **dos guardias que la Tanda 1 dejó rojas** (`guard-ambito-empresa-pedidos`) quedaron **verdes**
con el cableado de T9. Ninguna guardia fue modificada: `git status` no muestra ni un archivo de
`tests/guards/` en el diff.

### Auditoría del implementer sobre lo que entregó el subagente

- **Ninguna guardia tocada.** Verificado sobre el diff, no sobre el reporte.
- `tests/unit/asignaciones/module-contract.test.ts`: la puerta de `asignaciones.consultar` gana los
  **tres archivos exactos**, nunca la carpeta. `list-order-responsibles.ts` sigue sin poder exigirlo.
  **Se tensa, no se afloja.**
- **Orden de R5 verificado en los tres casos de uso**: `requirePermission` en la primera línea del
  cuerpo, después `safeParse`, después el primer `deps.`.
- **`productName` lee solo `ref.name`**, sin rozar ningún campo de existencia, así que el cambio
  `stock` → `stockByUnit` de QC-91 no afecta. **Ningún archivo de `lib/modules/inventario/**` está
  en el diff.**
- **Corregido por el implementer:** `order-execution-actions.ts` citaba `(R15)` en un comentario de
  producción. Eliminado — `docs/conventions.md > Comentarios`. El resto de la producción nueva está
  limpia de citas.

### Desvío frente a `design.md`, anotado y no escondido
`design.md > 3` no dice de dónde salen `numberText` y `orderQuantity`: `findAliveById` devuelve
`OrderAssignmentTarget`, que solo trae `{id, status}` y tiene un test que afirma que **no** lleva
esos campos. Se resolvió **componiendo** con `listAliveSummariesByIds`, método ya existente del
mismo puerto, **después** de que `findAliveById` confirma pertenencia y empresa. No se amplió
`OrderCatalog` ni se pidió nada nuevo a `pedidos`.

### Pendiente de entorno, no de código
`tests/integration/asignaciones` **no se pudo correr**: el `global-setup` aborta con
`test-db: falta DATABASE_URL`. No hay `.env` en este worktree. Ningún archivo de integración se
tocó salvo un stub de tipo en `use-case-fixture.ts` para que compile. **Queda por confirmar donde
haya base de test.**
