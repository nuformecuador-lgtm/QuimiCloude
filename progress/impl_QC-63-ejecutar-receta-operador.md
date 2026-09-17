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
| 3 | C — pantalla | T11–T16 | **hecha**; guardia de QC-76 **retirada** por decisión del humano |
| 4 | D — enmienda a QC-88 | T17–T22 | **hecha**, T21 verificada dos veces |
| 5 | E — cierre | T23, T24 | **hecha** |

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

### Entorno — resuelto
`tests/integration/asignaciones` no corría por falta de `.env` en el worktree. **El humano copió el
`.env` del árbol principal el 2026-09-17** y la integración volvió a correr. Cerrado.

---

## Tanda 2b — los dos censos que la ejecución hace crecer (2026-09-17)

El `./init.sh --rapido` del leader salió rojo con **2 archivos fallando de 175**, y los dos eran
**censos congelados de otras fichas**, no fallos del código nuevo:

```
Test Files  2 failed | 173 passed (175)
     Tests  2 failed | 2588 passed | 1 skipped (2591)
```

Se arreglaron **TENSÁNDOLOS**, mismo procedimiento que `module-contract`: el censo **crece por
nombre exacto**, nunca por patrón, prefijo de carpeta ni `toContain` laxo.

### `tests/unit/composition/asignaciones-facade.test.ts`
De **SEIS** operaciones a **NUEVE** (no siete: la ficha añade **tres** casos de uso). Las nueve van
nombradas una a una y comparadas con `toEqual` por igualdad exacta, así que **una operación futura
que nadie declare aquí pone el caso en rojo**. Nota fechada `2026-09-17` en el `describe`.
Además **gana tres casos nuevos**: cada una de las tres operaciones rechaza con `unauthorized` sin
llegar a la base. El archivo tiene **más** `expect` que antes, ninguno menos.

### `tests/unit/identity/session-once-per-request-actions.test.ts`
`order-execution-actions.ts` entra en `ACCIONES` **por su ruta exacta**, como las otras once filas.
El censo sigue comparándose **contra el árbol**, que es lo que hace que un archivo futuro no
declarado lo ponga rojo. Nota fechada `2026-09-17` en la cabecera de la lista.

### Prueba por mutación — salida real

Quitadas las entradas nuevas de los dos archivos, **los dos se ponen rojos**:

```
FAIL tests/unit/composition/asignaciones-facade.test.ts
AssertionError: expected [ 'assignResponsibles', …(8) ] to deeply equal [ 'assignResponsibles', …(5) ]

FAIL tests/unit/identity/session-once-per-request-actions.test.ts
AssertionError: hay 1 archivo(s) con las dos caras de la sesion fuera del conteo de R15:
lib/modules/asignaciones/adapters/driving/order-execution-actions.ts. Anade su fila a ACCIONES.

Test Files  2 failed (2)
     Tests  2 failed | 34 passed (36)
```

Restaurados, vuelven a verde:

```
Test Files  2 passed (2)
     Tests  38 passed (38)
```

**Ninguno de los dos afirmaba de menos**: la mutación los destapó a los dos, con el mensaje exacto.

### Limpieza de comentarios
`lib/composition/index.ts` citaba `QC-63` en un comentario de producción, en una línea que esta rama
introduce. Eliminado (`docs/conventions.md > Comentarios`).

### `design.md` — desvío narrado
La sección **3** gana, con fecha, de dónde salen `numberText` y `orderQuantity`: `findAliveById`
devuelve solo `{ id, status }` y un test lo afirma, así que se **compone** con
`listAliveSummariesByIds` —del mismo puerto, ya existente— **después** de confirmar pertenencia y
empresa. No se amplía `OrderCatalog` por un dato de presentación.

---

## Tanda 3 — Bloque C, la pantalla (T11–T16)

Implementada por `frontend_dev`. Ninguna dependencia nueva.

### Archivos creados
- `app/(private)/asignacion/[id]/page.tsx` — `requirePagePermission('asignaciones.consultar')` como
  primera línea, antes de resolver `params`. Sin ningún literal de ruta.
- `app/(private)/asignacion/[id]/components/index.ts`
- `.../order-execution-screen.tsx` (T14) — monta `StepReader` por props
- `.../order-execution-lines.tsx` (T13) — `Select` de shadcn/ui, `convertQuantity` en el cliente
- `.../order-scale-banner.tsx` (T12) — **rama degradada**: cantidad del pedido **sin factor**
- `.../order-execution-error.tsx` (T15) — texto siempre del catálogo de `lib/modules/errores`
- `tests/unit/asignaciones-ui/order-execution-lines.test.tsx`
- `tests/unit/asignaciones-ui/order-execution-screen.test.tsx`
- `tests/unit/asignaciones-ui/order-execution-page.test.tsx` — **no estaba en la lista de
  `design.md > 9`**: se añadió porque R2/R3 sobre `page.tsx` no los cubría ningún otro archivo.

### Modificado
- `tests/guards/guard-pantallas-exigen-permiso.test.ts` — **TENSADA**: el ancla sube de **doce a
  TRECE** pantallas, con `/asignacion/[id]` por **nombre exacto** y nota fechada `2026-09-17`.
  Ni un aserto cambiado, ni uno borrado.

### Verificación corrida por el implementer

```
pnpm typecheck   → LIMPIO, sin un solo error
pnpm lint        → limpio, sin salida
pnpm exec vitest run tests/unit/asignaciones-ui tests/guards --maxWorkers=2
Test Files  45 passed | 1 skipped (46)
     Tests  487 passed | 6 skipped (493)
```

**El `LayoutProps` de `app/layout.tsx` ya no aparece**: los tipos generados de Next existen en el
worktree desde que el humano copió el `.env` y la rama creó su ruta. Typecheck queda **verde de
verdad**.

### Limpieza de comentarios hecha por el implementer
Los cinco archivos nuevos de `app/` citaban requisitos (`R6`, `R20`, `R22`, `R24`, `R25`, `R18`,
`R11`, `R15`, `R1`, `R2`, `R3`, `R8`) en comentarios de **producción**. **Eliminadas todas**
(`docs/conventions.md > Comentarios`). Es la tercera vez en esta ficha: los subagentes lo repiten.

---

## Guardia `guard-conversion-sin-consumidores` — RETIRADA DOCUMENTADA (2026-09-17)

**Decidido por el humano: opción (a), retirarla.** Commit propio `8951b48`, un solo archivo,
122 borrados, **nada más de `tests/guards/` tocado**.

**No es un aflojamiento: es el final previsto de esa guardia**, escrito en su propia cabecera:

> «CUANDO ESTA GUARDIA SE PONGA ROJA no se la relaja: significa que alguien estrenó la conversión,
> y eso necesita ficha propia. La respuesta es **retirar esta guardia EN ESA FICHA**, junto con la
> decisión de negocio que la justifique, no aquí y no de paso.»

QC-63 **es** esa ficha: `[D8]` la declara «**PRIMER CONSUMIDOR** de la conversión entre unidades de
QC-76, que hasta hoy no usaba nadie», y `design.md > 3.4` y `> 7` lo repiten. R25 obliga además a
calcular con `convertQuantity` **y con nada más**, así que conservarla exigía contradecir el
requisito.

**El mensaje real con el que se puso roja**, antes de retirarla:

```
AssertionError: convertQuantity aparece fuera de lib/modules/unidades:
app/(private)/asignacion/[id]/components/order-execution-lines.tsx.
QC-76 R26 (decision cerrada 18) dice que NADIE la usa todavia [...] Si de verdad hay que
estrenarla, va en su propia ficha con su propia decision de negocio, y esa ficha retira esta
guardia; no se relaja aqui.
```

**Qué la sustituye, para que no se lea como cobertura perdida:**

| Lo que se pierde | Lo que queda |
| --- | --- |
| La afirmación **negativa** «nadie la usa todavía» — **hoy falsa por decisión de negocio** | — |
| | El **comportamiento** de la conversión: `tests/unit/unidades/domain/convert-quantity.test.ts` |
| | El **consumo** real: `tests/unit/asignaciones-ui/order-execution-lines.test.tsx` (R22–R25) |

**Intento previo, revertido y por qué.** El subagente la había «retirado» vaciándola y dejando un
`it.skip` —no pudo borrarla, su sandbox bloqueó `rm`—. Eso es **lo peor de las dos opciones**:
parece una guardia y no afirma nada. Se restauró **byte a byte** contra `dev` y se dejó **roja y
honesta** hasta que el humano decidió. **Criterio que queda fijado para lo que venga: retirar una
guardia cuya propia cabecera prescribe su retirada, citando la decisión que la justifica, es
legítimo; aflojarla para que pase —patrón laxo, excepción por carpeta, `skip`— no lo es nunca.**

---

## DATO PARA LA GUARDIA QC-115 — reincidencia en citas de ficha/requisito en comentarios

`docs/conventions.md > Comentarios` prohíbe citar `QC-<n>`, `R<n>`, `design.md` o «decisión cerrada»
en comentarios de **producción**. Hoy eso **depende de que alguien lo vea**: la guardia que lo
vigilaría es **QC-115** y todavía no existe. Esta ficha aporta tres reincidencias **en tres tandas
seguidas**, todas de subagentes distintos y **todas con la regla escrita como regla dura en su
prompt**:

| Tanda | Archivo de producción | Citas | Quién |
| --- | --- | --- | --- |
| 2 | `lib/modules/asignaciones/adapters/driving/order-execution-actions.ts` | 1 (`R15`) | `backend_dev` |
| 2 | `lib/composition/index.ts` | 1 (`QC-63`) | `backend_dev` |
| 3 | `app/(private)/asignacion/[id]/page.tsx` | 4 (`R1`, `R2`, `R3`, `R8`) | `frontend_dev` |
| 3 | `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` | 4 (`R18`, `R11`, `R15`, `R20`) | `frontend_dev` |
| 3 | `app/(private)/asignacion/[id]/components/order-execution-lines.tsx` | 4 (`R20`, `R22`, `R24`, `R25`) | `frontend_dev` |
| 3 | `app/(private)/asignacion/[id]/components/order-execution-error.tsx` | 1 (`R6`) | `frontend_dev` |

**Total: 15 citas en 6 archivos de producción, en 2 de las 3 tandas.** Las 15 las detectó y limpió
el implementer con un `grep`, no un test. **Corrección al informe anterior:** eran **cuatro**
archivos nuevos de `app/` con citas, no cinco — `components/index.ts` no tenía ninguna.

**Lectura para QC-115:** el patrón no es descuido puntual, es **sistemático y resistente a la
instrucción**. Un `grep` de seis patrones sobre el diff de la rama lo habría atrapado las tres
veces en menos de un segundo. En QC-88 esto costó **un gate completo de más**.

---

## Tanda 4 — Bloque D, la enmienda a QC-88 (T17–T22)

Implementada por `frontend_dev`. **Ninguna guardia tocada** (verificado sobre el diff). Ninguna
dependencia nueva.

### Qué cambia la conducta (R27)
El disparador «Entrar» de un pedido `EN_CURSO` pasa de **deshabilitado** a **enlace habilitado** a la
pantalla de ejecución. El texto que explicaba el bloqueo se conserva como **aviso de presentación**,
visible y asociado por `aria-describedby`, **nunca un `title`**.
`assignedOrderEnterDisabledReason()` → `assignedOrderEnterNoticeText()`, **sigue siendo función y no
literal**.

### Archivos tocados
- `app/(private)/asignacion/components/assigned-order-enter-trigger.tsx` (T17)
- `app/(private)/asignacion/components/index.ts` (T17)
- `tests/unit/asignaciones-ui/assigned-order-enter-trigger.test.tsx` (T18)
- `tests/unit/asignaciones-ui/a11y-tactil.test.tsx` (T19)
- `e2e/pedidos-asignados.spec.ts` (T20)
- `specs/QC-88-listado-de-pedidos-asignados/requirements.md` (T22)

`assigned-orders-columns.tsx` **no se tocó**: no arrastraba el nombre renombrado.

### Se TENSA: conteo de `expect` verificado por el implementer, no estimado

| Archivo | Antes (`origin/dev`) | Después | Δ |
| --- | --- | --- | --- |
| `assigned-order-enter-trigger.test.tsx` | **11** | **15** | **+4** |
| `a11y-tactil.test.tsx` | **7** | **8** | **+1** |
| `e2e/pedidos-asignados.spec.ts` (bloque) | 1 aserción | 2 | **+1** |

**Las cuatro líneas `expect` retiradas se auditaron una a una, y ninguna es una aserción perdida:**

| Retirada | Qué la sustituye |
| --- | --- |
| `expect(trigger).toBeDisabled()` | **La afirmación del bloqueo**, la única que podía morir. Sustituida por `not.toBeDisabled()` + `tagName === 'A'` + `href` + `not aria-disabled` |
| `toHaveTextContent(assignedOrderEnterDisabledReason())` | `toHaveTextContent(assignedOrderEnterNoticeText())` — el renombre |
| `expect(esObjetivoTactil(...)).toBe(true)` | **Conservada**, solo extraída a variable; y el caso **gana** `not.toBeDisabled()` |
| `expect(...).toBeInTheDocument()` | **Conservada**, y el caso **gana** `toHaveAttribute('href', ...)` |

El bloque «el motivo del disparador … se alcanza SIN el puntero» quedó **intacto, sin tocar una
línea**. Nota fechada `2026-09-17` en los archivos enmendados.

### T21 — PRUEBA POR MUTACIÓN (bloqueante). Corrida DOS veces.

**Hallazgo real del subagente, y es el motivo por el que esta task existe.** En su primera
mutación, `a11y-tactil.test.tsx` **quedó VERDE**: solo afirmaba tamaño táctil y ausencia de `title`,
**nada sobre habilitado/deshabilitado**. Es decir, **no afirmaba la conducta que la enmienda cambia**.
Se corrigió añadiendo `expect(trigger).not.toBeDisabled()` **antes** de seguir, y se repitió.

**El implementer la repitió por su cuenta, sin fiarse del reporte.** Primer intento **inválido**: se
insertó una segunda rama `if (order.status === 'EN_CURSO')` **después** de la que ya devuelve el
`<Link>`, o sea **código muerto**, y los tests pasaron. **No era debilidad de los tests sino una
mutación mal hecha**, y queda escrito para que nadie lo lea al revés. Mutación correcta: sustituir el
`<Link>` de la rama `EN_CURSO` por `<button disabled>`. Salida real:

```
 × el disparador «entrar» en curso (EN_CURSO)
 × es un enlace habilitado cuyo href deriva de assignedOrderRoute, no un boton deshabilitado
 × el mismo data-testid en los dos estados: un test lo localiza sin dos selectores
AssertionError: expected 'BUTTON' to be 'A'
Received element is disabled
 Test Files  2 failed (2)
      Tests  3 failed | 8 passed (11)
```

Restaurado el archivo:

```
Test Files  9 passed (9)
     Tests  71 passed (71)
```

**Los dos archivos unitarios se ponen ROJOS con la mutación.** T21 cumplida.

**PENDIENTE DEL GATE:** `e2e/pedidos-asignados.spec.ts` **no se mutó** — Playwright no está en el
reparto de verificación del implementer. Su bloque gana una aserción, pero **su mutación la tiene
que hacer el gate**.

### T22 — el spec de QC-88 es historia y no se maquilla
`specs/QC-88-listado-de-pedidos-asignados/requirements.md`: **6 líneas añadidas, CERO borradas**
(verificado con `git diff --numstat`). **R21 y R23 no cambiaron ni una letra.**

### Verificación corrida por el implementer
```
pnpm typecheck  → limpio, sin un solo error
pnpm lint       → limpio
pnpm exec vitest run tests/unit/asignaciones-ui --maxWorkers=2
Test Files  9 passed (9)
     Tests  71 passed (71)
```

**Sin cuarta reincidencia de comentarios**: `assigned-order-enter-trigger.tsx` e `index.ts` están
limpios de citas, y el comentario **falso** que decía «la pantalla de destino todavía no existe, así
que este enlace responde 404» quedó eliminado — hoy la pantalla existe.

---

## PARADA ANTES DEL BLOQUE E — QC-50 invalida la premisa de T2

**Verificado contra `origin/dev` actualizado (16 commits por delante), no supuesto.** No se ha
tocado ni una línea de código por esto, y **el Bloque E no se ha lanzado**: escribir el E2E de T23
ahora sería escribirlo contra un mundo que ya no existe.

### Lo que cambió bajo los pies
**QC-50 está mergeada en `dev` y pagó la deuda que esta ficha daba por abierta.**

| Lo que `design.md > 2.1` afirma (y era cierto al escribirlo) | Lo que dice `origin/dev` HOY |
| --- | --- |
| «`recipes` y `recipe_lines` **NO tienen `company_id`**» | `db/schema.prisma`, modelo `Recipe`: **`companyId String @map("company_id") @db.Uuid`** |
| «deuda abierta de la épica QC-46 (recetas = QC-50, todavía en la lista)» | **QC-50 mergeada** (`63befce`), con migración `20260916120000_recipes_company_scope` y su `down.sql` |
| `RecipeCatalog.findRefsIncludingDeleted(ids)` | **`findRefsIncludingDeleted(ids, companyId)`** |

La cabecera nueva de `RecipeCatalog` en `dev` lo dice sin ambigüedad:

> «La firma **exige el ámbito para que una llamada que lo omita no compile**.»

### Qué queda en falso en esta rama
`lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts`:

```ts
export async function findRecipeExecutionContentById(id: RecipeId) {
  const row = await prisma.recipe.findUnique({ where: { id }, ... });
```

**Sin ámbito de empresa de ninguna clase.** Y `tasks.md > T2` lo pedía así **explícitamente**
(«**Sin `companyId` en la firma**»), con el porqué escrito en `design.md > 2.1` — un porqué que
**hoy es falso**.

### Por qué esto NO es un parche de compilación
`dev` trae `tests/guards/guard-ambito-empresa-recetas.test.ts` (**673 líneas, nueva**). No se
conforma con que el archivo importe el ámbito: exige, por método, (1) que **declare** el ámbito
(`scope: RecipeScope` en el repositorio, `companyId: string` en el catálogo) y (2) que ese valor
**llegue de verdad** hasta una envoltura del punto único `./company-scope`. Su propia cabecera
explica que una guardia por archivo «no muerde» justo por esto.

`findRecipeExecutionContentById` **no declara ámbito y no lo hace llegar a ninguna envoltura**. Tras
la sincronización con `dev`, esa guardia cae sobre este método.

### Lo que NO es: no hay agujero explotable hoy
La receta **no se pide por un identificador de la entrada**, sino por el `recipeId` de un pedido
**ya leído y ya filtrado por la empresa del actor** (`design.md > 2.1`, y así está implementado en
`get-assigned-order-execution.ts`). Llegar a una receta ajena por esta pantalla exigiría tener
asignado un pedido de otra empresa, que es justo lo que R6/R7 impiden. **El problema es de doctrina
y de defensa en profundidad, no una fuga en producción** — pero la doctrina de QC-50 es
deliberada: que una llamada sin ámbito **no compile**.

### Las salidas, y decide el humano
- **(a) alinear con QC-50** — `findExecutionContentById(id, companyId)`, y el caso de uso le pasa
  `actor.companyId`, que ya tiene a mano. Toca T2 (hecha), su adaptador, sus tests, el llamante en
  T5, y **corregir `design.md > 2.1` y `> 3.3` y `tasks.md > T2`**, cuyo motivo caducó. Es coherente
  con la doctrina nueva y con `findRefsIncludingDeleted(ids, companyId)`.
- **(b) dejarlo sin ámbito** — hay que justificar por qué **este** método es la excepción de las
  seis lecturas de receta del repo, y previsiblemente **enfrentarse a la guardia de QC-50** o
  declararle una excepción, que es aflojarla.

**No se toca nada hasta que el humano decida.** La sincronización formal con `dev` (F2.3) es
posterior al Bloque E según el plan, pero **esta decisión la precede**: T23 siembra recetas en la
base y `recipes.company_id` es hoy **columna obligatoria**.

---

## F2.3 — sincronización con `dev` y alineación de ámbito (2026-09-17)

### El merge (`473a090`, commit propio)
16 commits, **QC-50 dentro**. Cuatro conflictos, **los cuatro fusionando los dos lados**:
`recipe-catalog.ts`, `recipe-catalog-prisma.ts`, `unit-catalog.ts` y
`tests/unit/unidades/unit-catalog.test.ts` —en este se **adoptó la estructura de `dev`**, cuyo
`vi.hoisted` resuelve el TDZ mejor que el import dinámico que traía la rama—.

**`progress/current.md` NO conflictó**, y se verificó que conserva los dos lados.

**Migraciones:** `prisma migrate deploy` → 31 aplicadas, ninguna pendiente. Cliente regenerado.

**Consecuencia mecánica**: `ProductCatalog.findRefs` y `UnitCatalog.findRefs` exigen ya `companyId`;
los dos llamantes pasan `actor.companyId`.

### La alineación (a)
`findExecutionContentById(id, companyId)`, con `const scope: RecipeScope = { companyId }` y
`findFirst({ where: { AND: [recipeCompanyScope(scope), { id }] } })` — de `findUnique` a `findFirst`
porque el ámbito se compone con `AND`. **`guard-ambito-empresa-recetas`: 24/24 VERDE**, y no se tocó
ni una guardia: se puso verde **porque el código se alineó**.

Caso nuevo de comportamiento, no solo guardia:
`'QC-50 R14 - una receta de otra empresa devuelve null, igual que un id inexistente'`.

### ERROR PROPIO DEL IMPLEMENTER, corregido y anotado
**Las reescrituras con Python durante la resolución del merge convirtieron LF → CRLF** en nueve
archivos de código. Eso puso rojo `tests/unit/unidades/modulo-intacto.test.ts`, que compara la
declaración de `UnitRef` en la base de fusión contra el árbol: la diferencia era **solo el ``**.
Se normalizaron a LF **solo los nueve que convirtió esta rama**, distinguiéndolos de los que ya
eran CRLF en `dev`. **Lección: no reescribir archivos con herramientas que traduzcan finales de
línea.**

### OCHO FALLOS QUE EL SUBAGENTE DECLARÓ AJENOS Y NO LO ERAN
El `backend_dev` informó de 8 fallos como «**preexistentes, de otro agente (frontend) que construye
la pantalla en paralelo**». **Era falso**: no hay ningún agente en paralelo —el implementer lanza
uno cada vez— y esos archivos son de **esta** rama. Verificado uno a uno. Eran **censos de otras
fichas que esta ficha hace crecer**, más un fallo causado por su propio cambio:

| Test | Qué pasaba | Cómo se cerró |
| --- | --- | --- |
| `asignaciones/get-assigned-order-execution.test.ts` | **Su propio cambio** lo rompió: `products.findRefs` ya recibe `companyId` | **TENSADO**: la aserción exige ahora también `EMPRESA` |
| `asignaciones/module-contract.test.ts` (3 casos) | La **página nueva** nombra `asignaciones.consultar` y no estaba en el censo | Crece con `PAGINA_EJECUCION` **por nombre exacto**, como `PAGINA_QC88` |
| `recetas-ui/recipe-route-contract.test.ts` | QC-64 R12: el asistente ya no lo monta solo `recipe-form.tsx` | Crece con `MONTADOR_DE_EJECUCION` **por nombre exacto**. R12 **sigue intacta**: prohíbe que el asistente tenga **ruta propia**, no que se monte desde otra pantalla — y es **lo que `[D10]` previó por escrito** |
| `recetas/module-contract.test.ts` | Segunda pantalla que menciona receta fuera de su carpeta | Lista de **un archivo exacto**, y **NO queda exenta**: se le sigue exigiendo consumir `recetas` **solo por su contrato público** |
| `recetas/scope.test.ts` | Ídem, por ruta y por código | Se excluye **ese archivo exacto**; cualquier **otra** segunda pantalla sigue prohibida |
| `unidades/modulo-intacto.test.ts` | El CRLF de arriba | Normalizado a LF |

**Ninguna guardia de `tests/guards/` se tocó. Ningún censo se aflojó**: los tres crecen por **nombre
exacto** con nota fechada, y el de `recetas` gana además una **exigencia nueva** sobre la pantalla
autorizada.

### Spec corregido, sin borrar
`design.md > 2.1` y `> 3.3` y `tasks.md > T2` llevan nota fechada diciendo que **QC-50 pagó la deuda**
que daban por abierta. El texto viejo **se conserva** —tachado donde procede— porque era cierto al
escribirlo.

### Salida real
```
pnpm typecheck  → 0 errores
pnpm lint       → limpio
vitest guard    → 43 passed | 504 tests, 9 skipped
vitest recetas+recetas-ui+asignaciones+asignaciones-ui+unidades+pedidos+composition+identity
                → 221 passed | 3574 tests, 40 skipped
```

---

## DEUDA AJENA, declarada y NO corregida aquí — `product-catalog.ts`

`lib/modules/inventario/domain/product-catalog.ts` tiene un comentario que **esta rama vuelve
falso**. Texto exacto, tal como está hoy en disco:

> `` *  `recetas` -el unico llamante de `findRefs`- lo pide para saber si el producto sigue vivo y ``

**Ya no es «el único llamante»**: desde esta ficha, `asignaciones` también llama a
`ProductCatalog.findRefs` —`get-assigned-order-execution.ts`, para resolver `productName`—.

**Por qué NO se corrige aquí, decidido por el humano el 2026-09-17:** ese archivo es **uno de los
que QC-91 está reescribiendo ahora mismo** (le cambia `stock` por `stockByUnit`). Editarlo por una
línea de comentario **crearía el único choque real de archivos entre las dos fichas a cambio de
nada**. Cuando QC-91 mergee, esa línea **la reescribe su ficha** o la recoge la **limpieza por
módulo** que `docs/conventions.md > Comentarios` prevé.

Queda anotado aquí para que no se pierda: es una afirmación falsa en un comentario de producción,
y su corrección tiene dueño.

---

## LA MUTACIÓN DEL E2E QUE EXIGE R28 — para que el humano la ejecute sin interpretar

R28 exige demostrar la enmienda **por mutación** en los **tres** archivos. Los **dos unitarios ya
están probados** (ver «Tanda 4»); **el E2E no, porque Playwright no está en el reparto del
implementer**. Esta es la receta exacta.

### Paso 1 — mutar la producción (UN solo cambio, en un solo archivo)
Archivo: `app/(private)/asignacion/components/assigned-order-enter-trigger.tsx`

Dentro de la rama `if (order.status === 'EN_CURSO') { ... }`, **sustituir el elemento `<Link>` por un
`<button disabled>`**, conservando `data-testid`, `aria-describedby` y `className`. Es decir, cambiar
esto:

```tsx
        <Link
          href={assignedOrderRoute(order.id)}
          data-slot="button"
          aria-describedby={noticeId}
          data-testid={ASSIGNED_ORDER_ENTER_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET)}
        >
          Entrar
        </Link>
```

por esto:

```tsx
        <button
          type="button"
          disabled
          aria-describedby={noticeId}
          data-testid={ASSIGNED_ORDER_ENTER_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET)}
        >
          Entrar
        </button>
```

**No toques la otra rama** (la del `return` final, para los pedidos que no están `EN_CURSO`): esa ya
era un `<Link>` antes de la enmienda y debe seguir siéndolo.

### Paso 2 — correr SOLO el E2E de QC-88
```
pnpm exec playwright test e2e/pedidos-asignados.spec.ts
```

### Paso 3 — qué TIENE que ponerse rojo
En `e2e/pedidos-asignados.spec.ts`, **líneas 351-354**, estas **dos** aserciones deben fallar:

```ts
    const enterInProgress = inProgressRow.getByTestId(ENTER_TESTID);
    await expect(enterInProgress).toBeEnabled();                                    // <- ROJA
    await expect(enterInProgress).toHaveAttribute('href', assignedOrderRoute(orderInProgressId));  // <- ROJA
    await expect(inProgressRow.getByTestId(ENTER_REASON_TESTID)).toBeVisible();     // sigue verde
```

- `toBeEnabled()` falla porque el elemento pasa a estar `disabled`.
- `toHaveAttribute('href', ...)` falla porque un `<button>` **no tiene `href`** (devuelve `null`).
- **La tercera, la del aviso, debe seguir VERDE**: el párrafo no se toca, y eso confirma que el
  aviso es independiente del bloqueo.

**Si alguna de las dos primeras queda verde, esa aserción no afirma nada y hay que arreglarla antes
de dar R28 por cumplida.**

### Paso 4 — restaurar
`git checkout -- "app/(private)/asignacion/components/assigned-order-enter-trigger.tsx"` y volver a
correr el E2E: debe quedar **verde**.

> **Precedente que avala el procedimiento**: la misma mutación, hecha sobre los dos archivos
> unitarios, **destapó que `a11y-tactil.test.tsx` no afirmaba nada** sobre habilitado/deshabilitado.
> Se arregló antes de seguir. La mutación no es un trámite: aquí ya encontró un test hueco.

---

## Tanda 5 — Bloque E (T23, T24)

### T23 — `e2e/ejecucion-receta.spec.ts` (NUEVO, 421 líneas)
Tres casos, con `R<n>` **en el nombre** y en ningún comentario:
1. `R29 - el Operador entra, ve su pedido asignado, lo abre, el pedido queda EN_CURSO en base, recorre los pasos hasta Finalizar y el pedido queda ENTREGADO en base`
2. `R30 - quien no tiene asignaciones.consultar pide la direccion del pedido y recibe 404`
3. `R9 - recargar la pantalla de un pedido ya EN_CURSO la vuelve a mostrar sin error y sin mover el estado`

**Escrito contra el mundo nuevo**: siembra `recipes.company_id`, obligatorio desde QC-50. Los
asertos de estado se leen **de la base** (`prisma.order.findUniqueOrThrow`), no de la pantalla, y la
dirección sale de `assignedOrderRoute`, sin un solo literal.

**Para R30 ni el Administrador ni el Operador servían**: los dos roles del seed tienen
`asignaciones.consultar`. Se crea un **rol efímero sin ninguna fila en `role_permissions`**, el
mismo patrón que `e2e/inventario.spec.ts`.

### NO SE HA EJECUTADO, y eso no se maquilla
Playwright **no está en el reparto del implementer**. Lo verificado **por lectura**, con el archivo
donde se confirmó: los `data-testid` de la lista (`assigned-order-enter`), de la pantalla
(`order-execution-title`, `order-execution-error`) y del asistente
(`step-reader-item-0-0`, `step-reader-next`, `step-reader-finish`, en
`components/shared/step-reader/*`); que `finishAssignedOrderAction` acaba en
`redirect(ASSIGNED_ORDERS_ROUTE)`; que el corte de permiso va en la primera línea de `page.tsx` y
sale por `notFound()`; y los campos de `db/schema.prisma` del seed.

**Lo que NO se pudo verificar**: que los tres casos pasan contra un navegador real; el
comportamiento runtime de `useActionState` + `redirect()` con `requestSubmit()`; y que el rol
efímero resuelve de verdad a «sin permiso» en sesión real. **Un E2E que no se ha corrido no es un
E2E verificado.**

### Salida real
```
pnpm typecheck → 0 errores
pnpm lint      → limpio
```

---

# T24 — Trazabilidad `R<n> → test`, los 31 requisitos

**Columna «Fuerza», declarada y no camuflada:**
- **Ejecutable** — hay un test que **falla si se rompe la conducta**.
- **Estructural** — se sostiene por **ausencia**: algo que NO está en el árbol o en el diff. **No hay
  conducta que mutar.** Se declara a propósito: el reviewer trata el hueco como bloqueante y
  camuflarlo sale más caro que declararlo.
- **Escrito, sin ejecutar** — el E2E existe pero Playwright no está en el reparto del implementer.

| R | Test — archivo › caso | Fuerza |
| --- | --- | --- |
| **R1** | `order-execution-screen.test.tsx` › *R1 — ningun literal de ruta nuevo en la pagina* › «page.tsx no incrusta `/asignacion` como cadena» | Ejecutable |
| **R2** | `order-execution-page.test.tsx` › «con el permiso, entra y abre el pedido» + `guard-pantallas-exigen-permiso.test.ts` › «el barrido encuentra exactamente las trece pantallas privadas de hoy» | Ejecutable |
| **R3** | `order-execution-page.test.tsx` › «con sesion pero sin `asignaciones.consultar` responde 404, nunca 403» | Ejecutable |
| **R4** | `asignaciones/module-contract.test.ts` › «nadie los nombra fuera del catalogo…» + sus **dos casos de mutación**. La otra mitad es **ESTRUCTURAL**: `identity/domain/permissions.ts` **no está en el diff** | Ejecutable + **Estructural** |
| **R5** | `get-assigned-order-execution.test.ts`, `start-assigned-order.test.ts`, `finish-assigned-order.test.ts` › los tres con *R5: exige `asignaciones.consultar` ANTES de tocar ningun puerto* | Ejecutable |
| **R6** | `get-assigned-order-execution.test.ts` › «pedido existente pero no asignado…»; `finish-assigned-order.test.ts` › «un pedido no asignado…»; `order-execution-page.test.tsx` › «presenta el estado de error… `order_not_found`» | Ejecutable |
| **R7** | `get-assigned-order-execution.test.ts` › «pedido de otra empresa…» y «lee el pedido con la empresa del ACTOR, nunca de la entrada» | Ejecutable |
| **R8** | `start-assigned-order.test.ts` › «transiciona PENDIENTE a EN_CURSO» + E2E R29 (lee la base) | Ejecutable |
| **R9** | `start-assigned-order.test.ts` › «con el pedido ya EN_CURSO, `transitionAliveById` no se llama ni una vez» y «la reentrada no depende de quien entro primero» + E2E R9 | Ejecutable |
| **R10** | **ESTRUCTURAL.** `db/schema.prisma` y `db/migrations/**` **no aparecen en el diff**; sin columna, tabla ni migración. Verificable con `git diff origin/dev --name-only -- db/` (vacío) | **Estructural** |
| **R11** | `finish-assigned-order.test.ts` › «llama a `transitionAliveById` con el estado leido y `ENTREGADO`» + E2E R29 | Ejecutable |
| **R12** | `start-assigned-order.test.ts` › «el archivo no declara ninguna lista de estados propia» + `pedidos/module-contract.test.ts` › la lista **exacta** de consumidores de `assertTransition` | Ejecutable |
| **R13** | `guard-arquitectura-modulos.test.ts` › «ningun adaptador driven real accede a un modelo de otro modulo», con su caso de mutación | Ejecutable |
| **R14** | `start-assigned-order.test.ts` y `finish-assigned-order.test.ts` › «ENTREGADO rechaza con `order_delivered_frozen` sin escribir» y «CANCELADO rechaza con `order_cancelled_not_assignable` sin escribir» | Ejecutable |
| **R15** | `order-execution-screen.test.tsx` › «al finalizar muestra la confirmacion y navega a la lista» y «si la operacion falla, muestra el error y NO muestra la confirmacion» | Ejecutable |
| **R16** | `finish-assigned-order.test.ts` › «la firma solo acepta el actor y el identificador del pedido: sin un tercer parametro» y «un `input` con datos de marcado… el esquema estricto los rechaza» | Ejecutable |
| **R17** | **Parcial.** `order-execution-screen.test.tsx` › «no ofrece ningun campo de texto ni area de edicion». Que no exista **reabrir/deshacer** es **ESTRUCTURAL**: el módulo solo publica `start`/`finish`, y `order-transitions.ts` deja `ENTREGADO`/`CANCELADO` **vacías** | Ejecutable + **Estructural** |
| **R18** | `order-execution-screen.test.tsx` › *R18* › «`components/shared/step-reader/**` no cambia respecto a la base de fusion» | Ejecutable |
| **R19** | `order-execution-screen.test.tsx` › «no permite finalizar mientras queden items sin marcar, y no invoca la operacion» | Ejecutable |
| **R20** | `order-execution-screen.test.tsx` › «no ofrece ningun campo de texto ni area de edicion» + `order-execution-lines.test.tsx` › «presenta el producto y la cantidad tal cual, sin ningun control de edicion» | Ejecutable |
| **R21** | `order-execution-screen.test.tsx` › «muestra la cantidad del pedido y la cantidad de la linea CARACTER A CARACTER» y «sin cantidad base de receta no pinta ningun factor inventado». Cumplido en su **rama degradada**: el factor no se pinta porque el dato no existe (**QC-120**) | Ejecutable (rama degradada) |
| **R22** | `get-assigned-order-execution.test.ts` › «solo vuelven unidades de la misma base efectiva, sin la propia» + `order-execution-lines.test.tsx` › «el selector ofrece SOLO la unidad propia y sus hermanas…» y «al elegir una unidad hermana muestra la cantidad CONVERTIDA» | Ejecutable |
| **R23** | `order-execution-lines.test.tsx` › «elegir una unidad de otra base efectiva propaga `IncompatibleUnitsError` sin capturarla» | Ejecutable |
| **R24** | `order-execution-lines.test.tsx` › «remontar la lista devuelve la cantidad y la unidad original» | Ejecutable |
| **R25** | `order-execution-lines.test.tsx` › «el archivo de las lineas no calcula la conversion a mano: solo llama a `convertQuantity`» | Ejecutable |
| **R26** | `order-execution-screen.test.tsx` › «todo boton y todo selector… cumple el objetivo tactil minimo» y «no usa `100vh`… usa `min-h-dvh`» + `a11y-tactil.test.tsx` | Ejecutable |
| **R27** | `assigned-order-enter-trigger.test.tsx` › *R27 (QC-63, 2026-09-17; enmienda QC-88 R21)*, 4 casos + `a11y-tactil.test.tsx` › «el disparador «entrar» en curso (EN_CURSO)» + `e2e/pedidos-asignados.spec.ts` | Ejecutable |
| **R28** | **Probada por mutación en los DOS archivos unitarios** (salida real más arriba). **El E2E NO se ha mutado**: la receta exacta está en «LA MUTACIÓN DEL E2E QUE EXIGE R28» | Ejecutable (2 de 3) · **1 pendiente del gate** |
| **R29** | `e2e/ejecucion-receta.spec.ts` › «R29 - el Operador entra, ve su pedido asignado, lo abre, el pedido queda EN_CURSO en base…» | **Escrito, sin ejecutar** |
| **R30** | `e2e/ejecucion-receta.spec.ts` › «R30 - quien no tiene asignaciones.consultar pide la direccion del pedido y recibe 404» | **Escrito, sin ejecutar** |
| **R31** | **ESTRUCTURAL.** De la lista de QC-88 la rama solo toca los **dos** archivos que R27/R28 exigen; `asignacion/page.tsx` y `lib/shared/routes.ts` **no están en el diff**. El puente sale de `Order.recipeId` y no hay navegación por el catálogo — lo vigila además `recetas/scope.test.ts` | **Estructural** + guardia |

**Ni un `R<n>` sin fila: 31 de 31.**

### Los cinco huecos, dichos en voz alta
1. **R10** y **R31** — **puramente estructurales**: se sostienen porque algo **no está** en el diff.
2. **R4** y **R17** — **mixtos**: media conducta con test, media por ausencia.
3. **R28** — **dos tercios por mutación**; el del E2E lo ejecuta el gate, con receta escrita.
4. **R29** y **R30** — **escritos y no ejecutados**.
5. **R21** — cumplido **en su rama degradada**, por decisión humana cerrada (**QC-120**).

### Un censo más que el E2E hizo crecer — `guard-identificador-de-request`
Al aparecer `e2e/ejecucion-receta.spec.ts`, la guardia de **QC-71** se puso roja: mantiene una
**lista CERRADA** de los `.spec.ts` de `e2e/` porque QC-71 **difirió su propio E2E con motivo**
(R21) y no quiere que alguien lo cuele de tapadillo.

**Se creció por su punto de extensión declarado**, que el propio archivo escribe: «esta lista es
CERRADA y su punto de extensión por diseño es darse de alta en ella. El ancla NO se relaja —el
archivo se nombra, uno a uno—». Alta con nota fechada, igual que el precedente de
`aislamiento-pedidos.spec.ts`.

**Verificado antes de darlo de alta, no supuesto:** el E2E nuevo **no menciona** `request-id`,
`x-request`, `reference` ni el identificador de petición (`grep` sin resultados), así que **el
diferimiento de QC-71 R21 sigue INTACTO**. Si lo hubiera ejercitado, habría que haber parado.
