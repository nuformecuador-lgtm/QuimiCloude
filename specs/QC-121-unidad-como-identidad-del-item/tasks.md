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
>
> **Enmienda del 2026-09-18 (QC-92 ya mergeada; `design.md > 15`).** Tasks nuevas **T14** (el
> ajuste recalcula, R29–R32) y **T15** (condicional a la pregunta abierta 2). Van numeradas al final
> para no romper referencias, pero **T14 se ejecuta justo después de T4** (lo indica su
> «Depende de»). T2, T3, T4, T10, T11, T12 y T13 llevan marcas **(Enmienda)** donde cambian.

## Bloque 1 — piezas puras y catálogo

- [x] **T1. [P] `singleUnitStock` y `productDisplayName`.** Funciones puras del dominio
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

- [x] **T2. [P] Código de error `presentation_unit_locked`.** **Novena** enmienda del catálogo
      (`design.md > 8`; **(Enmienda)** la séptima y la octava ya las ocuparon QC-92 y QC-108), con
      la redacción que fije el humano en F1.4.
      - Archivos: `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts`,
        `lib/modules/inventario/domain/errors.ts` (`PresentationUnitLockedError`),
        `lib/modules/inventario/index.ts`.
      - Tests: `tests/unit/errores/catalogo.test.ts` — `:42-44` y `:54` **49 → 50** **(Enmienda)**,
        caso nuevo con clave y texto exactos; la sexta (`:182-186`), la séptima (`:208-212`) y la
        octava (`:233-237`) siguen intactas.
      - **Hecho**: catálogo y `guard-catalogo-de-errores` en verde.
      - Depende de: nada. `[P]` con T1.

## Bloque 2 — la base

- [x] **T3. Migración y esquema: `unit_id`, `stock`, sus restricciones y los dos disparadores.**
      (`design.md > 4.2`, `> 5`, `> 6`, `> 11`.)
      - Archivos: `db/schema.prisma` (`Product.unitId String?`, `Product.stock Int @default(0)`,
        `@@index([unitId], map: "products_unit_id_idx")`, comentario del modelo reescrito),
        `db/migrations/<ts>_product_unit_and_stored_stock/migration.sql` y `down.sql`.
        **(Enmienda)** `<ts>` ya **no** es `20260918120000` (lo ocupa QC-92): primero `ls
        db/migrations/` y se elige uno estrictamente mayor que el último (propuesta
        `20260918130000`; `design.md > 11`).
      - Proceso: escribir a mano → `pnpm run db:migrate` → `pnpm run db:rollback` → `pnpm run
        db:migrate` otra vez; `_prisma_migrations` coherente; **(Enmienda)** tras el rollback,
        `inventory_movements` y sus asientos siguen ahí (R33).
      - Tests:
        - unitario del SQL (nuevo, en `tests/unit/inventario/schema/`): paréntesis `NO FORCE`/`FORCE`
          cerrado, relleno por lote más reciente sin `RAISE` por mezcla (R23), ningún disparador
          escribe `stock` (R12), `down.sql` revierte cada objeto; **(Enmienda)** el `down.sql` no
          nombra `inventory_movements` ni `InventoryMovementKind`, y el `<ts>` es mayor que
          `20260918120000` (R33);
        - `tests/unit/inventario/schema/inventario-schema.test.ts` — `:267-269`, `:437-449`,
          `:602-606`, `:610-612` (re-medidas tras QC-92) se actualizan con su porqué; el caso «el
          lote no declara unidad» no se toca;
        - integración (nuevo `tests/integration/inventario/product-unit.int.test.ts`, declarado en
          `tests/integration/aislamiento.json`): lote en otra unidad → `23514`
          `product_batches_unit_differs_from_product`; lote sobre producto sin unidad → rechazo;
          SQL directo también rechazado (R3); cambio de unidad de presentación con lotes →
          `presentations_unit_locked_by_batches`, sin lotes o misma unidad → pasa (R20, R21);
        - `tests/integration/inventario/list-query-indexes.int.test.ts` `:108-141`, `:272-285`:
          **(Enmienda)** **34 → 35** (no 33 → 34) y el caso «R2: ya no existe» se invierte.
      - **Hecho**: migración aplicada, revertida y reaplicada; los tests de arriba en verde. **Los de
        integración del alta quedan rojos hasta T4** (aviso de cabecera).
      - Depende de: nada.

## Bloque 3 — el alta escribe unidad y existencia

- [x] **T4. Alta por nombre y unidad, y recálculo en la misma transacción.** (`design.md > 4`,
      `> 5`.)
      - Archivos: `lib/modules/inventario/ports/product-repository.ts`
        (`findAliveIdByName` → `findAliveIdByNameInPresentationUnit`),
        `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` (búsqueda nueva,
        `createWithFirstBatch` con unidad, `recalculateProductStock` en los dos escritores,
        traducción del `23514` de unidad), `lib/modules/inventario/domain/create-product.ts`,
        `lib/composition/index.ts:637-652` (`:646`). **(Enmienda)** El comentario del puerto
        `product-repository.ts:84-85` («el producto no tiene columna propia») se reescribe.
      - **Cuidado**: `recalculateProductStock` y la lectura de la unidad de la presentación declaran
        `scope: InventoryScope` y lo llevan a `./company-scope` (lotes por `batchCompanyScope`, que
        ya existe desde QC-92), o `guard-ambito-empresa-inventario` da rojo. Nada de `SUM(` ni
        `_sum`: la suma es `singleUnitStock` (`qc91-alcance > R1`). **(Enmienda)** La prohibición de
        `increment:` y de nombres con «adjust» de `qc81-alcance > R31` está acotada a la rama de
        QC-81 y aquí no muerde. La escritura de `stock` es SQL crudo para no tocar `updated_at`
        (R11). **(Enmienda)** `recalculateProductStock` **no se exporta** y **no escribe
        `product_batches`**, y la llamada va **después** del `writeMovement` de cada alta: así
        `guard-libro-de-inventario` sigue viendo los mismos tres caminos con su asiento.
      - Fixtures a arreglar en el mismo commit (el producto del fixture gana la unidad de su
        presentación): los de `design.md > 12.2`, fila «Integración con lotes insertados a mano»,
        **y (Enmienda) los tres de QC-92**: `inventory-movements-constraints.int.test.ts`
        (`createProduct` `:111-121`), `ledger-cuadre.int.test.ts` (caso R30, `:299-331`) y la
        siembra de `e2e/ajuste-de-inventario.spec.ts:243-267` (producto con `unitId` y `stock: 12`).
      - Tests: `tests/unit/inventario/create-product.test.ts` (R5, R6, R7, R3 → `invalid_input`);
        `product-prisma.test.ts` (recálculo llamado por los dos escritores; `addBatchToAlive` no
        escribe `unit_id`/`name`/`qty_alert`/`updated_at`, R2, R11; abortar si el recálculo lanza,
        R9); integración nueva `tests/integration/inventario/product-stock.int.test.ts` (tres lotes
        de 5 → 15; mismo nombre en kg y L → dos productos; dos altas concurrentes sobre el mismo
        producto → suma completa, R8, R10) declarada en `aislamiento.json` **en `commit`** con
        `motivo` y `desde` **(Enmienda**: llama a los adaptadores reales con su propia
        transacción, como `ledger-cuadre`**)**; `authorization.test.ts` (`inventario.modificar` en
        el alta, R24).
      - **Hecho**: `./init.sh --rapido` en verde **y** la integración de `inventario/` entera en
        verde (cierra el aviso de T3), incluido `ledger-cuadre` con su fixture arreglado: el cuadre
        del libro no mira `products.stock`, así que sus casos de ajuste pasan aunque el ajuste aún no
        recalcule (eso llega en T14).
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
      - Depende de: T4, **T14** (Enmienda: los dos tocan `product-prisma.ts`; T14 va antes).

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
      - **(Enmienda)** toda función exportada bajo `lib/` que escriba `product_batches` —mismo
        patrón que `guard-libro-de-inventario.test.ts:182-186`: `create`, `createMany`, `update`,
        `updateMany`, `upsert`— llama también a `recalculateProductStock` en su cuerpo; hoy son
        `createWithFirstBatch`, `addBatchToAlive` **y `adjustBatchStock`** (mitigación de D4,
        `design.md > 5`; R29);
      - ninguna migración crea disparador ni columna generada que escriba `products.stock` (R12);
      - `NewProduct` no declara unidad ni existencia (R2);
      - ningún `DELETE` de productos ni de lotes en el módulo, e identificadores nuevos en inglés
        (R25).
      - **Hecho**: rojo al quitar el recálculo de cualquiera de los **tres** caminos; rojo con un
        cuarto camino fabricado sin recálculo; verde con el código de T4 y T14.
      - Depende de: T9, **T14**. `[P]` con T11.

- [ ] **T11. [P] E2E: el mismo nombre en dos unidades son dos filas.** (R26.) En
      `e2e/inventario.spec.ts`: alta «X» con presentación en kg → alta «X» con presentación en L →
      el listado muestra **dos filas** «X · kg» y «X · L», cada una con su existencia; y un segundo
      lote en kg sube sólo la fila en kg. Se revisan los flujos existentes que asuman existencia
      por unidad («10 kg · 20 L») y `e2e/aislamiento-inventario.spec.ts` (fixture con unidad).
      - **(Enmienda, R34)** En `e2e/ajuste-de-inventario.spec.ts`, primer caso: tras el ajuste feliz
        y el cierre del diálogo, la celda `product-stock` de la fila del producto muestra
        `INITIAL_STOCK + HAPPY_DELTA` con su unidad, y contra Postgres `products.stock` vale lo
        mismo. Se corre a mano (`init.sh` no corre Playwright) y el resultado se anota en
        `progress/impl_QC-121-…md`.
      - **Hecho**: el E2E nuevo pasa, **el del ajuste pasa con la aserción de R34**, y ninguno viejo
        depende de lotes en dos unidades.
      - Depende de: T9, **T14**. `[P]` con T10.

- [ ] **T12. Trazabilidad `R<n> -> test`.** Mapa de los **34** requisitos **(Enmienda**: 28 + R29–R34**)**
      a tests concretos (`design.md > 14` es el punto de partida), con la nota de que `package.json`
      no se tocó (R28).
      - Archivos: `progress/impl_QC-121-unidad-como-identidad-del-item.md`.
      - **Hecho**: los 34 tienen al menos un test nombrado; ninguno «pendiente».
      - Depende de: T10, T11.

- [ ] **T13. Gate completo y cierre.** `./init.sh` entero en verde antes del PR, sin excepción
      (R27). Confirma en particular la lista de `design.md > 12.2`, que `--rapido` no ve.
      - **Hecho**: `./init.sh` verde y todas las tasks marcadas `[x]` (T15 cuenta como hecha si el
        humano respondió «no» a la pregunta abierta 2).
      - Depende de: T12, **T15**.

## Bloque 7 — enmienda del 2026-09-18 (QC-92 ya mergeada)

- [x] **T14. El ajuste de lote recalcula `products.stock`.** (`design.md > 5.1`; R29, R30, R31,
      R32.) **Se ejecuta justo después de T4**, en la misma tanda o la siguiente, antes de T5.
      - Archivos: `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
        (`adjustBatchStock`, `:638-665`): paso 1 nuevo `SELECT p."id" … JOIN "product_batches" …
        FOR NO KEY UPDATE OF p` con la empresa por `companyScopeColumns(scope)` (0 filas → `null`);
        pasos 2 y 3 como hoy; paso 4 `recalculateProductStock(tx, productId, scope)`.
        `lib/modules/inventario/ports/product-repository.ts:123-141` (comentario: el ajuste también
        deja la existencia del producto al día).
      - **No se toca**: `adjust-batch-stock.ts`, `batch-actions.ts`, el diálogo,
        `batch-movement-prisma.ts`, el resultado `{ stock }` (sigue siendo la existencia del
        **lote**), el `increment:` del paso 2, el `P2025` y la traducción del negativo.
      - Tests:
        - unitarios del adaptador en `tests/unit/inventario/` (los de `adjustBatchStock` de QC-92;
          nombre del archivo a medir): la `tx` simulada gana el `SELECT` y el recálculo; 0 filas en
          el paso 1 → `null` sin `UPDATE`; recálculo que lanza → no hay asiento (R29);
        - `tests/integration/inventario/product-stock.int.test.ts` (el de T4, ampliado): producto
          con tres lotes, ajuste +6 y −9 → `stock` = suma (R29); ajuste a negativo →
          `BatchStockNegativeError` y `stock` igual; lote de otra empresa → `null` y los dos `stock`
          iguales (R30); dos ajustes simultáneos sobre dos lotes del mismo producto, y un ajuste y un
          `addBatchToAlive` simultáneos → `stock` = suma de lotes (R31); tras el ajuste, `name`,
          `qty_alert`, `unit_id` y `updated_at` del producto iguales (R32);
        - `tests/integration/inventario/ledger-cuadre.int.test.ts` sigue verde sin tocar sus casos
          de ajuste; `tests/guards/guard-libro-de-inventario.test.ts` sigue verde sin tocarlo.
      - **Hecho**: los tests de arriba en verde, `./init.sh --rapido` en verde, y la integración de
        `inventario/` entera en verde.
      - Depende de: T4. Bloquea: T10, T11. `[P]` con T5 **no** (los dos tocan `product-prisma.ts`).

- [ ] **T15. [Aprobada el 2026-09-18] Panel de lotes titulado «nombre · unidad».** **Sólo si el humano
      responde «sí» a la pregunta abierta 2** de `requirements.md`; si responde «no» o no responde,
      se marca `[x]` con la nota «no aplica» y no se toca nada.
      - Archivos: `app/(private)/inventario/components/product-table.tsx:72` (`aria-label`) y `:81`
        (`SheetTitle`) con `productDisplayName` y la etiqueta de unidad del catálogo que ya recibe.
      - Tests: el test de componente del panel/tabla en `tests/unit/inventario/` (nombre a medir):
        título «X · kg»; sin catálogo, sólo el nombre. Si se aprueba, el humano dirá qué `R<n>` lo
        cubre (hoy ninguno: no se inventa uno sin decisión).
      - **Hecho**: según la respuesta del humano.
      - Depende de: T1, T9. `[P]` con T10 y T11.
