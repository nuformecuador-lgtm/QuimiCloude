# QC-121 — unidad-como-identidad-del-item · tasks.md

> **Estrategia**: piezas puras y base primero, contratos **aditivos** después, cada consumidor en
> su task, y **una retirada atómica** al final (mismo patrón que QC-91, `design.md > 3.1`). `[P]` =
> paralelizable con la otra task marcada igual, porque no comparten archivos.
>
> **Verificación**: `./init.sh --rapido` al cerrar cada tanda; `./init.sh` **completo** en T13,
> antes del PR. Ninguna task se marca `[x]` sin haber ejecutado su criterio.
>
> **Avisos de alcance, declarados aquí y no escondidos**:
> - **T3 deja rojos los tests de integración del alta hasta T4**: el disparador rechaza lotes sobre
>   productos sin unidad, y el alta de hoy todavía no escribe la unidad. T3 y T4 van en la misma
>   tanda y no se hace PR entre ellas.
> - **T9 no deja el árbol compilando a mitad y no se puede partir.**
> - **`--rapido` no ve la lista de `design.md > 12.2`**: esos rojos sólo salen en el gate completo.
>   Cada task que los provoca los arregla en el mismo commit; T13 lo confirma.
> - **Comentarios**: al tocar un archivo se limpian los comentarios de las líneas tocadas, sin
>   citar fichas ni requisitos (`docs/conventions.md > Comentarios`).

## Bloque 1 — piezas puras y catálogo

- [ ] **T1. [P] `singleUnitStock` y `productDisplayName`.** Funciones puras del dominio
      (`design.md > 3.3`).
      - Archivos: `lib/modules/inventario/domain/product-stock.ts` (añade `singleUnitStock`, que
        delega en `sumStockByUnit`), `lib/modules/inventario/domain/product-display-name.ts`
        (nuevo), `lib/modules/inventario/index.ts`.
      - Tests: `tests/unit/inventario/product-stock.test.ts` — 0 filas → 0; tres lotes de 5 en kg →
        15; dos unidades → lanza (R8, R13). `tests/unit/inventario/product-display-name.test.ts`
        (nuevo) — «Hipoclorito · kg», sin etiqueta → sólo el nombre (R18).
      - **Hecho**: los tests nuevos en verde; `qc91-alcance > R1` («`sumStockByUnit` es la única que
        suma») sigue verde; el árbol compila y nadie usa todavía lo nuevo.
      - Depende de: nada. `[P]` con T2.

- [ ] **T2. [P] Código de error `presentation_unit_locked`.** Séptima enmienda del catálogo
      (`design.md > 8`), con la redacción que fije el humano en F1.4.
      - Archivos: `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts`,
        `lib/modules/inventario/domain/errors.ts` (`PresentationUnitLockedError`),
        `lib/modules/inventario/index.ts`.
      - Tests: `tests/unit/errores/catalogo.test.ts` — `:44` 46 → 47, caso nuevo con clave y texto
        exactos, la sexta enmienda sigue intacta (`:183-186`).
      - **Hecho**: catálogo y `guard-catalogo-de-errores` en verde.
      - Depende de: nada. `[P]` con T1.

## Bloque 2 — la base

- [ ] **T3. Migración y esquema: `unit_id`, `stock`, sus restricciones y los dos disparadores.**
      (`design.md > 4.2`, `> 5`, `> 6`, `> 11`.)
      - Archivos: `db/schema.prisma` (`Product.unitId String?`, `Product.stock Int @default(0)`,
        `@@index([unitId], map: "products_unit_id_idx")`, comentario del modelo reescrito),
        `db/migrations/20260918120000_product_unit_and_stored_stock/migration.sql` y `down.sql`.
      - Proceso: escribir a mano → `pnpm run db:migrate` → `pnpm run db:rollback` → `pnpm run
        db:migrate` otra vez; `_prisma_migrations` coherente.
      - Tests:
        - unitario del SQL (nuevo, en `tests/unit/inventario/schema/`): paréntesis `NO FORCE`/`FORCE`
          cerrado, relleno por lote más reciente sin `RAISE` por mezcla (R23), ningún disparador
          escribe `stock` (R12), `down.sql` revierte cada objeto;
        - `tests/unit/inventario/schema/inventario-schema.test.ts` — `:259-262`, `:429-438`, `:598`,
          `:602-603` se actualizan con su porqué; `:893-897` no se toca;
        - integración (nuevo `tests/integration/inventario/product-unit.int.test.ts`, declarado en
          `tests/integration/aislamiento.json`): lote en otra unidad → `23514`
          `product_batches_unit_differs_from_product`; lote sobre producto sin unidad → rechazo;
          SQL directo también rechazado (R3); cambio de unidad de presentación con lotes →
          `presentations_unit_locked_by_batches`, sin lotes o misma unidad → pasa (R20, R21);
        - `tests/integration/inventario/list-query-indexes.int.test.ts` `:105-112`, `:257-269`.
      - **Hecho**: migración aplicada, revertida y reaplicada; los tests de arriba en verde. **Los de
        integración del alta quedan rojos hasta T4** (aviso de cabecera).
      - Depende de: nada.

## Bloque 3 — el alta escribe unidad y existencia

- [ ] **T4. Alta por nombre y unidad, y recálculo en la misma transacción.** (`design.md > 4`,
      `> 5`.)
      - Archivos: `lib/modules/inventario/ports/product-repository.ts`
        (`findAliveIdByName` → `findAliveIdByNameInPresentationUnit`),
        `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` (búsqueda nueva,
        `createWithFirstBatch` con unidad, `recalculateProductStock` en los dos escritores,
        traducción del `23514` de unidad), `lib/modules/inventario/domain/create-product.ts`,
        `lib/composition/index.ts:627-639`.
      - **Cuidado**: `recalculateProductStock` y la lectura de la unidad de la presentación declaran
        `scope: InventoryScope` y lo llevan a `./company-scope`, o `guard-ambito-empresa-inventario`
        da rojo. Nada de `SUM(`, `_sum`, `increment:` ni nombres con «adjust»/«consume» en el módulo
        (`qc81-alcance > R31`). La escritura de `stock` es SQL crudo para no tocar `updated_at` (R11).
      - Fixtures a arreglar en el mismo commit (el producto del fixture gana la unidad de su
        presentación): los de `design.md > 12.2`, fila «Integración con lotes insertados a mano».
      - Tests: `tests/unit/inventario/create-product.test.ts` (R5, R6, R7, R3 → `invalid_input`);
        `product-prisma.test.ts` (recálculo llamado por los dos escritores; `addBatchToAlive` no
        escribe `unit_id`/`name`/`qty_alert`/`updated_at`, R2, R11; abortar si el recálculo lanza,
        R9); integración nueva `tests/integration/inventario/product-stock.int.test.ts` (tres lotes
        de 5 → 15; mismo nombre en kg y L → dos productos; dos altas concurrentes sobre el mismo
        producto → suma completa, R8, R10) declarada en `aislamiento.json`;
        `authorization.test.ts` (`inventario.modificar` en el alta, R24).
      - **Hecho**: `./init.sh --rapido` en verde **y** la integración de `inventario/` entera en
        verde (cierra el aviso de T3).
      - Depende de: T1, T3.

## Bloque 4 — lectura (aditivo)

- [ ] **T5. `ProductView` gana `stock` y `unitId`; `ProductRef` lee de columnas.** Sin quitar
      todavía `stockByUnit` ni `latestBatchUnitId` de `ProductView`.
      - Archivos: `lib/modules/inventario/domain/product-view.ts`, `product-prisma.ts`
        (`PRODUCT_SELECT` con `stock` y `unitId`; `toProductView`),
        `…/product-catalog-prisma.ts` (`stockByUnit` = 0 o 1 valor desde `stock`/`unitId`; deja de
        traer lotes).
      - Tests: `product-prisma.test.ts`, `product-catalog.test.ts` (R14: un valor en la unidad del
        producto; vacío sin unidad), `tests/unit/recetas/recipe-service.test.ts` (R19: 0 / cantidad
        / `null`, sin tocar `get-recipe.ts`).
      - **Hecho**: typecheck verde; los campos viejos y nuevos conviven.
      - Depende de: T4.

- [ ] **T6. [P] Listado: nombre con unidad, existencia guardada, alerta, orden y filtro.**
      (`design.md > 7`; R4, R15, R16, R17, R18.)
      - Archivos: `lib/modules/inventario/domain/product-queryable.ts`, `product-prisma.ts`
        (`productOrderBy`, `productFilterWhere`), `app/(private)/inventario/components/`
        `product-columns.tsx`, `product-list-params.ts`, `index.ts`.
      - Recuperar los nombres de parámetros y de columna de `git show 9c5c8c43^:<ruta>` (no
        reinventarlos; `design.md > 2`).
      - Tests: `tests/unit/inventario/list-query.test.ts` (`:179-196` se invierte: `stock` ordena y
        filtra), `product-list-params.test.ts` (ida y vuelta con el rango), `product-page.test.tsx`
        («Hipoclorito · kg», «15 kg», «0» sin unidad, alerta con y sin `qtyAlert`, sin catálogo →
        sólo el nombre), `list-use-cases.test.ts`, `tests/integration/inventario/`
        `list-query-products.int.test.ts` (orden y filtro sobre la base; reescribir el caso de dos
        unidades en un producto como dos productos).
      - **Hecho**: los casos en verde y el árbol compila.
      - Depende de: T1, T5. `[P]` con T7 y T8.

- [ ] **T7. [P] Receta: el selector usa la unidad guardada y pinta «nombre · unidad».** (R4, R18.)
      - Archivos: `app/(private)/produccion/formulas/components/product-picker.tsx`,
        `recipe-lines-field.tsx` (pasa `units`), `unit-group.ts` (sólo comentario),
        `nueva/page.tsx:76`, `[id]/page.tsx:120` (`unitId: item.unitId`).
      - **No toca** la regla de la unidad de la línea (`unitsOfGroup`, `resolveLineUnitId`): la
        pregunta abierta 1 sigue abierta.
      - Tests: `tests/unit/recetas-ui/recipe-form.test.tsx`, `recipe-line-unit-group.test.tsx`,
        `unit-group.test.ts` (sin cambios de lógica).
      - **Hecho**: opciones «nombre · unidad»; un producto sin unidad sale sólo con nombre.
      - Depende de: T1, T5. `[P]` con T6 y T8.

- [ ] **T8. [P] Presentación con lotes: la unidad no cambia.** (`design.md > 6`; R20, R21, R22.)
      - Archivos: `lib/modules/inventario/ports/presentation-repository.ts` (`'unit_locked'`),
        `…/presentation-prisma.ts` (`replacePresentation` traduce el `23514` por SQLSTATE y
        nombre), `lib/modules/inventario/domain/update-presentation.ts`,
        `app/(private)/configuracion/presentaciones/components/presentation-form.tsx`
        (`CODE_TO_FIELD`).
      - Tests: `presentation-actions.test.ts` / test del caso de uso (código propio, nada escrito,
        `inventario.modificar`, R24), test del formulario en `tests/unit/configuracion-ui/`
        (mensaje junto a la unidad, formulario abierto y con lo escrito),
        `tests/integration/inventario/presentation-unit.int.test.ts`.
      - **Hecho**: los tres niveles en verde.
      - Depende de: T2, T3. `[P]` con T6 y T7.

## Bloque 5 — la retirada

- [ ] **T9. LA RETIRADA — fuera `latestBatchUnitId` y `ProductView.stockByUnit`. ATÓMICA.**
      Quitar los dos campos rompe a la vez el adaptador, las columnas, el selector y las páginas de
      fórmulas; se abre y se cierra de una vez.
      - Archivos: `lib/modules/inventario/domain/product-view.ts`, `product-prisma.ts`
        (`BATCH_STOCK_BY_UNIT` fuera), `product-input.ts:29` y `product-form.tsx:539-549`
        (comentarios), `product-columns.tsx` (`HiddenProductField`).
      - Tests que caen con ella y se actualizan **en el mismo commit**, cada uno con su porqué:
        `tests/unit/inventario/qc91-alcance.test.ts` (`:200-221`, `:260-304`; los de `R21` se
        quedan), `tests/unit/unidades/module-contract.test.ts:623-624`,
        `tests/unit/inventario/product-route-contract.test.ts:376-381`, y los de
        `design.md > 12.1` que aún nombren los campos viejos.
      - **Hecho**: `pnpm run typecheck`, `pnpm run lint` y `./init.sh --rapido` en verde; ni
        `latestBatchUnitId` ni `ProductView.stockByUnit` en `lib/` ni `app/`.
      - Depende de: T6, T7, T8.

## Bloque 6 — verificación

- [ ] **T10. [P] Test de alcance de la ficha.** `tests/unit/inventario/qc121-alcance.test.ts`
      (nuevo), al estilo de `qc91-alcance`, con cada detector probado sobre fuentes fabricadas:
      - toda función de `product-prisma.ts` que llama a `tx.productBatch.create` llama también a
        `recalculateProductStock` (mitigación de D4, `design.md > 5`);
      - ninguna migración crea disparador ni columna generada que escriba `products.stock` (R12);
      - `NewProduct` no declara unidad ni existencia (R2);
      - ningún `DELETE` de productos ni de lotes en el módulo, e identificadores nuevos en inglés
        (R25).
      - **Hecho**: rojo al quitar el recálculo de cualquiera de los dos escritores; verde con el
        código de T4.
      - Depende de: T9. `[P]` con T11.

- [ ] **T11. [P] E2E: el mismo nombre en dos unidades son dos filas.** (R26.) En
      `e2e/inventario.spec.ts`: alta «X» con presentación en kg → alta «X» con presentación en L →
      el listado muestra **dos filas** «X · kg» y «X · L», cada una con su existencia; y un segundo
      lote en kg sube sólo la fila en kg. Se revisan los flujos existentes que asuman existencia
      por unidad («10 kg · 20 L») y `e2e/aislamiento-inventario.spec.ts` (fixture con unidad).
      - **Hecho**: el E2E nuevo pasa y ninguno viejo depende de lotes en dos unidades.
      - Depende de: T9. `[P]` con T10.

- [ ] **T12. Trazabilidad `R<n> -> test`.** Mapa de los 28 requisitos a tests concretos
      (`design.md > 14` es el punto de partida), con la nota de que `package.json` no se tocó (R28).
      - Archivos: `progress/impl_QC-121-unidad-como-identidad-del-item.md`.
      - **Hecho**: los 28 tienen al menos un test nombrado; ninguno «pendiente».
      - Depende de: T10, T11.

- [ ] **T13. Gate completo y cierre.** `./init.sh` entero en verde antes del PR, sin excepción
      (R27). Confirma en particular la lista de `design.md > 12.2`, que `--rapido` no ve.
      - **Hecho**: `./init.sh` verde y todas las tasks marcadas `[x]`.
      - Depende de: T12.
