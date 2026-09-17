# QC-63 — ejecutar-receta-operador · bitácora de implementación

> Worktree `.worktrees/QC-63-ejecutar-receta-operador`, rama
> `feature/QC-63-ejecutar-receta-operador`. Base: `bdd0700`.
> El gate (`./init.sh`) lo corre el leader. Aquí solo se anota lo que corrió el implementer
> y sus subagentes: `pnpm typecheck`, `pnpm lint` y los tests de los módulos tocados.

## Estado por tanda

| Tanda | Bloque | Tasks | Estado |
| --- | --- | --- | --- |
| 1 | A — servicios de otros módulos | T1, T2, T3 | **hecha**, pendiente de `--rapido` del leader |
| 2 | B — caso de uso y seguridad | T4–T10 | **bloqueada**: pregunta abierta sobre `productName` (ver abajo) |
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

## PREGUNTA ABIERTA que bloquea la Tanda 2 — `productName`

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

**No se rellena con un supuesto.** T4 define la proyección y T5 la compone: las dos necesitan
esta respuesta antes de escribirse.
