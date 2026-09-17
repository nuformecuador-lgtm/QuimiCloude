# QC-91 — existencia-por-lote · tasks.md

> **Estrategia**: aditiva primero, retirada después (`design.md > 3.8`). Cada task dice los
> archivos que espera tocar y su criterio de «hecho». `[P]` = paralelizable con la task marcada
> igual, porque no comparten archivos.
>
> **Verificación**: `./init.sh --rapido` al cerrar cada tanda; `./init.sh` completo en T13, antes
> del PR. Ninguna task se marca `[x]` sin que su criterio se haya ejecutado.
>
> **Aviso de alcance**: **T8 no deja el árbol compilando a mitad y no se puede partir.** Está
> declarado en su propia entrada, no escondido.

## Bloque 1 — la pieza pura

- [x] **T1. `sumStockByUnit` y `ProductStockByUnit`.** Función pura del dominio que agrupa filas
      `{ stock, unitId }` por unidad, suma enteros y ordena por cantidad descendente con `unitId`
      ascendente como desempate (R3, R5).
      - Archivos: `lib/modules/inventario/domain/product-stock.ts` (nuevo),
        `lib/modules/inventario/index.ts` (reexporta el tipo desde `./domain`).
      - Tests: `tests/unit/inventario/product-stock.test.ts` (nuevo) — suma dos lotes de la misma
        unidad con presentaciones distintas, separa unidades distintas, array vacío con cero filas,
        orden determinista.
      - **Hecho**: typecheck + el test nuevo en verde. El árbol compila; nadie la usa todavía.
      - Depende de: nada.

## Bloque 2 — el listado lee por unidad (aditivo)

- [x] **T2. `ProductView` gana `stockByUnit` (sin perder `stock`).**
      - Archivos: `lib/modules/inventario/domain/product-view.ts`,
        `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
        (`PRODUCT_SELECT` → `BATCH_STOCK_BY_UNIT`, `toProductView`).
      - **Cuidado**: el `orderBy [createdAt desc, id desc]` no cambia; `latestBatchUnitId` sigue
        saliendo de la primera fila (QC-80 R22) y su test existente debe seguir verde sin tocarlo.
      - Tests: `tests/unit/inventario/product-prisma.test.ts` (casos nuevos),
        `tests/integration/inventario/list-query-products.int.test.ts` (dos lotes, dos unidades).
      - **Hecho**: typecheck en verde, `stock` y `stockByUnit` conviven, los tests de QC-80 intactos.
      - Depende de: T1.

- [x] **T3. [P] Listado: existencia por unidad y alerta nueva.** La celda pinta una existencia por
      unidad con su etiqueta, resolviendo el símbolo con el catálogo que la página ya pide
      (R6); `isBelowAlert` compara contra la existencia de `latestBatchUnitId`, con 0 cuando no hay
      lotes, y no marca si no hay `qtyAlert` (R16, R17, R18).
      - Archivos: `app/(private)/inventario/components/product-columns.tsx`,
        `app/(private)/inventario/components/product-list-section.tsx` (baja `units` a las
        columnas), `app/(private)/inventario/components/index.ts` si cambia alguna firma.
      - **Decidir y dejar escrito en el PR**: si la lectura del catálogo de unidades falla
        (`units === undefined`, caso ya contemplado en `page.tsx:65-68`), la celda pinta la cantidad
        **sin etiqueta** en vez de ocultarla. La pantalla sigue en pie, como ya hace hoy.
      - Tests: `tests/unit/inventario/product-page.test.tsx` — «10 kg · 20 L», producto sin lotes
        muestra 0, alerta con y sin `qtyAlert`, alerta que ignora la existencia de otra unidad.
      - **Hecho**: los cuatro casos en verde; el árbol compila.
      - Depende de: T2. `[P]` con T4.

## Bloque 3 — receta y pedido leen por unidad (aditivo)

- [x] **T4. [P] `ProductRef` gana `stockByUnit` (sin perder `stock`).**
      - Archivos: `lib/modules/inventario/domain/product-catalog.ts`,
        `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`.
      - **No se toca el ámbito de empresa**: `findProductRefs` sigue sin él, con su excepción
        declarada (QC-49 R29, destino QC-50). Cambia el campo, no el alcance.
      - Tests: `tests/unit/inventario/product-catalog.test.ts`.
      - **Hecho**: typecheck en verde; el contrato público exporta el tipo nuevo.
      - Depende de: T1. `[P]` con T3.

- [x] **T5. Detalle de receta: la existencia de la unidad de la línea.** `get-recipe` elige del
      agregado con las cuatro reglas de la tabla de `design.md > 3.3` (R12, R13, R14, R15).
      - Archivos: `lib/modules/recetas/domain/get-recipe.ts`,
        `lib/modules/recetas/domain/recipe-view.ts` (documentación de `productStock`).
      - Tests: `tests/unit/recetas/recipe-service.test.ts` — producto de baja → `null`, sin lotes →
        `0`, con la unidad → su cantidad, con lotes pero sin esa unidad → `null`.
        `recetas.consultar` sigue exigiéndose en el service (R19).
      - **Hecho**: los cuatro casos en verde.
      - Depende de: T4.

- [x] **T6. Pedido: restante, marcador y faltante.** La tabla de ingredientes muestra «—» cuando la
      existencia es `null` (R13), 0 y el restante negativo en rojo cuando no hay lotes (R14).
      - Archivos: `app/(private)/pedidos/components/order-ingredients-table.tsx`,
        `app/(private)/pedidos/components/order-form.tsx` (sólo el comentario de `:380`).
      - **No toca** `lib/modules/pedidos/` ni `lib/modules/asignaciones/` (para el cruce con QC-88
        en F1.4).
      - Tests: `tests/unit/pedidos-ui/order-form.test.tsx`.
      - **Hecho**: los tres casos en verde; el árbol compila.
      - Depende de: T5.

## Bloque 4 — la retirada

- [x] **T7. Alta y edición dejan de compartir la existencia.** `productFieldsShape` queda
      `{ name, qtyAlert }`; el esquema del alta declara `stock` propio; el formulario lo pinta sólo
      en el alta; la action lo lee sólo en el alta (R9, R10).
      - Archivos: `lib/modules/inventario/domain/product-input.ts`,
        `lib/modules/inventario/domain/product-batch-input.ts`,
        `lib/modules/inventario/adapters/driving/product-actions.ts`,
        `app/(private)/inventario/components/product-form.tsx`.
      - Tests: `tests/unit/inventario/product-input.test.ts` (editar enviando `stock` →
        `invalid_input`), `product-batch-input.test.ts` (el alta lo sigue aceptando y las reglas de
        costo derivado no cambian), `product-actions.test.ts`, `product-field.test.tsx`.
      - **Hecho**: el alta sigue escribiendo la existencia en el lote; la edición la rechaza.
      - Depende de: T3, T6.

- [x] **T8. LA RETIRADA — `stock` sale de los contratos, del dominio y del listado. ATÓMICA.**
      **Esta task no deja el árbol compilando a mitad y no se puede partir**: al quitar
      `NewProduct.stock` y `ProductView.stock` rompen a la vez el adaptador, el caso de uso de alta,
      el de edición, la columna del listado y el filtro de la URL. Se abre y se cierra de una vez
      (R11).
      - Archivos: `lib/modules/inventario/domain/product-view.ts` (`stock` fuera de `NewProduct` y
        de `ProductView`), `lib/modules/inventario/domain/product-catalog.ts` (`ProductRef.stock`
        fuera), `lib/modules/inventario/domain/product-queryable.ts` (fuera de `sortable` y de
        `filterable`), `lib/modules/inventario/domain/create-product.ts:126`,
        `lib/modules/inventario/domain/update-product.ts` (comentario),
        `lib/modules/inventario/ports/product-repository.ts` (comentarios `:81`, `:99`),
        `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` (`PRODUCT_SELECT`,
        `createProduct`, `updateAliveProduct`, `createWithFirstBatch`, `productOrderBy`,
        `productFilterWhere`),
        `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`,
        `app/(private)/inventario/components/product-list-params.ts` (`stockMin`/`stockMax`,
        `STOCK_COLUMN_ID`), `app/(private)/inventario/components/index.ts`,
        `app/(private)/inventario/components/product-columns.tsx` (`sortable`/`filter` fuera).
      - Tests que hay que actualizar en la misma task, porque caen con ella:
        `tests/unit/inventario/list-query.test.ts`, `list-use-cases.test.ts`,
        `product-list-params.test.ts`, `product-page.test.tsx`, `product-service.test.ts`,
        `create-product.test.ts`, `company-scope.test.ts`, `authorization.test.ts`,
        `company-isolation-service.test.ts`, `tests/unit/recetas/recipe-lines-catalog.test.ts`,
        `tests/unit/recetas-ui/recipe-form.test.tsx`, `tests/integration/inventario/*`.
      - Comprobar aquí: `tests/unit/unidades/module-contract.test.ts:617` y `:624`
        (`design.md > 6`) — se espera que sigan verdes; si no, se actualizan con el argumento
        escrito, nunca en silencio.
      - **Hecho**: `pnpm run typecheck`, `pnpm run lint` y `./init.sh --rapido` en verde, y ningún
        `products.stock` en `lib/` ni en `app/`.
      - Depende de: T7.

- [ ] **T9. Migración: se quita la columna.** `DROP INDEX products_stock_idx`, `DROP CONSTRAINT
      products_stock_non_negative`, `DROP COLUMN stock`, con su `down.sql` que restaura los tres
      vacíos de datos (R2).
      - Archivos: `db/schema.prisma` (`Product.stock` fuera),
        `db/migrations/<timestamp>_drop_product_stock/migration.sql`,
        `db/migrations/<timestamp>_drop_product_stock/down.sql`.
      - Proceso: `pnpm run db:migrate:create` → escribir el `down.sql` a mano → `pnpm run
        db:migrate` → probar `pnpm run db:rollback` y volver a aplicar.
      - Tests: `tests/unit/inventario/schema/inventario-schema.test.ts`,
        `schema/inventario-migration.test.ts`,
        `schema/list-query-indexes-migration.test.ts`,
        `tests/integration/inventario/inventario-constraints.int.test.ts`,
        `list-query-indexes.int.test.ts`.
      - **Hecho**: migración aplicada y revertida una vez, `_prisma_migrations` coherente, y el
        test de esquema afirma que la columna **no existe**.
      - Depende de: T8 (antes de T8 el código todavía la usa y no compilaría sin ella).

## Bloque 5 — verificación

- [ ] **T10. [P] Test de alcance de la ficha (R11).** Al estilo de
      `tests/unit/inventario/qc81-alcance.test.ts`: recorre `lib/` y `app/` y falla si reaparece
      una lectura o escritura de `products.stock`, y comprueba que `product_batches.stock` sigue
      intacto donde debe (R21: ningún borrado ni modificación de lotes).
      - Archivos: `tests/unit/inventario/qc91-alcance.test.ts` (nuevo).
      - **Hecho**: rojo si se revierte T8, verde con T8 aplicada.
      - Depende de: T9. `[P]` con T11.

- [ ] **T11. [P] E2E: segundo lote sube la existencia (R22, R20).** Playwright: producto ya
      existente con un lote → alta que agrega un **segundo lote** al mismo producto, **sin escribir
      el lote a mano** (correlativo del backend, QC-81) → el listado muestra la existencia sumada.
      Además se reescriben los flujos de `e2e/inventario.spec.ts` que hoy editan la existencia del
      producto (19 apariciones) y los de `e2e/aislamiento-inventario.spec.ts`.
      - Archivos: `e2e/inventario.spec.ts`, `e2e/aislamiento-inventario.spec.ts`.
      - **Hecho**: el E2E nuevo pasa y ninguno de los viejos queda editando existencia de producto.
      - Depende de: T9. `[P]` con T10.

- [ ] **T12. Trazabilidad `R<n> -> test`.** El mapa de los 23 requisitos a tests concretos, más la
      nota de que `package.json` no se tocó (R23, lo afirma
      `tests/guards/guard-dependencias-aprobadas.test.ts`).
      - Archivos: `progress/impl_QC-91-existencia-por-lote.md`.
      - **Hecho**: los 23 requisitos tienen al menos un test nombrado; ninguno dice «pendiente».
      - Depende de: T10, T11.

- [ ] **T13. Gate completo y cierre.** `./init.sh` entero en verde antes del PR, sin excepción.
      - Archivos: ninguno de producción.
      - **Hecho**: `./init.sh` verde y todas las tasks de arriba marcadas `[x]`.
      - Depende de: T12.
