# QC-150 — producto-terminado · review

Revisado sobre `feature/QC-150-producto-terminado` en `4606a113`, diff contra el merge-base con
`origin/dev` (`08935782`). Fecha: 2026-09-24.

## Veredicto: **RECHAZADO**

Hay tres bloqueantes:

- **B1:** comentarios de producción que citan fichas y requisitos.
- **B2:** falta un test de acceso cruzado en la escritura nueva del producto terminado.
- **B3:** una migración repite el prefijo de otra de `dev`.

La funcionalidad, la trazabilidad y la autorización están bien. Lo que falla es la convención de
comentarios, un test de aislamiento y el prefijo de una migración.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1-R44 (R15 derogado) + D22 -> test concreto | OK: cada R tiene al menos un caso que lo verifica de verdad (ver abajo) |
| 2 | Tasks de `tasks.md` en `[x]` | OK (T3 cancelada por D16) |
| 3 | `CHECKPOINTS.md` | Falla en «Datos y seguridad» (acceso cruzado, B2). El resto está OK o pendiente del cierre (history, desmontar el worktree) |
| 4 | Verificación ejecutable | `./init.sh` completo verde en `24203857` y E2E verdes según el leader (no lo repetí). Corrido por mí contra `QuimiCloude_QC150`: 5 archivos unit (64/64), 2 de integración del núcleo (19/19), y 3 de esquema + 2 guardias + `product-type-lock.int` (87/87) |
| 5 | Calidad y seguridad | Permiso en el service OK; sin tablas nuevas (RLS sin cambios); sin secretos; capas separadas |
| 6 | Multiplataforma | OK: input de contenido `text-base`, `min-h-11`, `inputMode="decimal"`, coma a punto; nada de `100vh` ni `:hover` como única vía |
| 7 | Dependencias | OK: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` sin cambios |
| 8 | Aislamiento por empresa | Ningún modelo nuevo. Las consultas nuevas filtran por empresa (`receiveFinishedGoods` vía `companyScopeColumns`, guardia de ámbito verde). **Falta el test de acceso cruzado** (B2) |
| 9 | Comentarios | **Falla**: 54 líneas añadidas en producción citan `QC-<n>`, `R<n>`, `D<n>` o `design.md` (B1) |
| — | Migraciones viejas intactas | OK: el diff solo **añade** `20260924120000_*` y `20260924120100_*` |
| — | `down.sql` coherentes | OK: orden inverso y guarda `23514` al principio de las dos. Reponen el `DEFAULT`, los dos `CHECK` de `inventory_movements` y el `product_batches_unit_cost_positive` original |

## Hallazgos

### B1 — BLOQUEANTE: comentarios de producción que citan fichas y requisitos

`docs/conventions.md > Comentarios`: «Nunca se cita una ficha ni un requisito en un comentario de
producción [...] Sin excepciones». Las 54 líneas las **añadió la rama** (comprobado con `git blame`:
`88bf0067`, `f065d2f2`, `cab48edd`…), y la cabecera de `tasks.md` ya lo recordaba. Formato
archivo: líneas, con la numeración de `HEAD`:

- `app/(private)/asignacion/components/assigned-order-delivered-notice.tsx`: 9
- `app/(private)/configuracion/presentaciones/components/presentation-columns.tsx`: 51,54
- `app/(private)/configuracion/presentaciones/components/presentation-form.tsx`: 460
- `app/(private)/inventario/components/product-batches-panel.tsx`: 98
- `app/(private)/inventario/components/product-form.tsx`: 597
- `db/migrations/20260924120000_finished_product_enum_values/down.sql`: 30
- `db/migrations/20260924120100_finished_products_and_content_copies/down.sql`: 20,35
- `lib/modules/asignaciones/domain/errors.ts`: 180,190
- `lib/modules/asignaciones/domain/finish-assigned-order.ts`: 40
- `lib/modules/inventario/adapters/driven/persistence/presentation-prisma.ts`: 21
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`: 112,727,863
- `lib/modules/inventario/adapters/driving/presentation-actions.ts`: 57
- `lib/modules/inventario/domain/adjust-batch-stock.ts`: 80
- `lib/modules/inventario/domain/create-product.ts`: 123
- `lib/modules/inventario/domain/finished-goods.ts`: 52,60
- `lib/modules/inventario/domain/presentation-catalog.ts`: 8
- `lib/modules/inventario/domain/presentation-input.ts`: 26
- `lib/modules/inventario/domain/presentation-view.ts`: 20,21
- `lib/modules/inventario/domain/product-input.ts`: 252,253
- `lib/modules/inventario/ports/presentation-repository.ts`: 19
- `lib/modules/inventario/ports/product-repository.ts`: 53,97,146,176,179
- `lib/modules/pedidos/domain/create-order.ts`: 113
- `lib/modules/pedidos/domain/order-catalog.ts`: 37,100,101
- `lib/modules/pedidos/domain/order-cost.ts`: 202,205
- `lib/modules/pedidos/domain/order-view.ts`: 44,84
- `lib/modules/pedidos/domain/resolve-ingredients-cost.ts`: 71
- `lib/modules/pedidos/domain/transition-order.ts`: 6,25,26,67,69,72
- `lib/modules/pedidos/domain/update-order.ts`: 106
- `lib/modules/pedidos/ports/order-unit-of-work.ts`: 9
- `lib/modules/recetas/domain/create-recipe.ts`: 58
- `lib/modules/recetas/domain/errors.ts`: 69
- `lib/modules/recetas/domain/update-recipe.ts`: 100
- `lib/shared/routes.ts`: 207

Qué hace falta: quitar la cita (`QC-150`, `QC-141`, `QC-121`, `R<n>`, `D<n>`, `design.md > 4.2`) y
dejar solo el porqué, si lo hay. Si el comentario solo repite lo que hace el código, borrarlo
(p. ej. `lib/modules/recetas/domain/create-recipe.ts:58`, `lib/modules/inventario/domain/adjust-batch-stock.ts:80`).
Los comentarios de los `down.sql` se pueden tocar antes del merge: la migración solo está aplicada
en `QuimiCloude_QC150`.

### B2 — BLOQUEANTE: sin test de acceso cruzado en `receiveFinishedGoods`

`lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:968-1067` lee y escribe de
nuevo en `presentations`, `products` y `product_batches`. Filtra por empresa (`:989`, `:1019`), pero
ningún test prueba que se rechace el acceso cruzado. El caso de R23, `tests/integration/inventario/finished-goods.int.test.ts:387`,
usa en cada empresa su **propia** receta y su propia presentación: el índice las separa y el filtro no
llega a ejercitarse. Si alguien quitara el filtro de empresa de `:989`, ningún test se pondría rojo.

Qué hace falta: un caso de integración en el que la empresa B llame a `receiveFinishedGoods` con el
`presentationId` de la empresa A (y, si se quiere, también con su `recipeId`). Debe devolver
`presentation_without_content` sin escribir producto, lote ni asiento en ninguna de las dos
empresas. Lo exigen `CHECKPOINTS.md > Datos y seguridad` y `docs/architecture.md > Dominio` n.º 1.

### B3 — BLOQUEANTE: prefijo de migración duplicado con `dev`

`origin/dev` ya trae `db/migrations/20260924120000_customers` (QC-153, `926fd518`), y la rama añade
`db/migrations/20260924120000_finished_product_enum_values`. En cuanto se mergee `dev` quedan dos
directorios con el mismo prefijo. Hay 89 commits pendientes y el merge es obligatorio antes del PR.
`design.md > 3` lo prohíbe expresamente: «ningún par de directorios comparte prefijo».

Qué hace falta:

1. Renombrar las dos migraciones de la ficha a prefijos posteriores a la última de `dev`,
   conservando su orden entre ellas.
2. Actualizar lo que cita sus nombres: tests de esquema, `tests/integration/proveedores/company-scope.int.test.ts`
   y las listas esperadas de las guardias, si aplica.
3. Revertir y reaplicar sobre `QuimiCloude_QC150` y regenerar la plantilla.

### Menores

- **m1 — Editar un producto terminado (punto 1 del implementer).** La edición admite `name` y `qtyAlert`
  (`tests/integration/inventario/product-type-lock.int.test.ts:155`). El spec no lo prohíbe: D7 solo
  veta el alta manual, ser ingrediente y los ajustes que suman. Como la identidad va por
  `recipe_id`/`presentation_id` y no por nombre (`design.md > 7.1`), renombrar no rompe D2. Es
  aceptable, pero conviene que el humano lo confirme y quede como decisión en el spec.
- **m2 — R42, «ingrediente sin coste cuenta 0» (punto 2).** Lo verifican tests unit:
  `tests/unit/pedidos/order-cost.test.ts`, `tests/unit/pedidos/resolve-ingredients-cost.test.ts` y
  `tests/unit/pedidos/transition-order.test.ts:222`. En integración sí se puede llegar: un
  ingrediente `MACHINE` con lotes de `unit_cost` nulo tiene material pero no tiene coste.
  Recomendable añadir ese caso a `finish-with-finished-goods.int.test.ts`. No bloquea, porque el
  requisito ya tiene un test que lo verifica.
- **m3 — «R25» con dos significados.** En `tests/unit/inventario/product-batches-panel.test.tsx:241` y
  `tests/unit/inventario/adjust-batch-dialog.test.tsx:327`, «R25» es de otra ficha (objetivo táctil) y
  convive con el R25 de esta. La ambigüedad de trazabilidad viene de antes.
- **m4 — «QC-150» en nombres de test.** Hay 8 casos que lo llevan además de `R<n>`, p. ej.
  `tests/unit/inventario/product-service.test.ts:268` y `tests/unit/inventario/adjust-batch-dialog.test.tsx:301`.
  La convención solo pide `R<n>`. Es inofensivo.
- **m5 — Citas en comentarios de tests.** La convención aplica la misma regla a `tests/` y `e2e/`, y
  la rama añade unas 60 líneas así: 17 en `e2e/producto-terminado.spec.ts` y 5 en
  `tests/integration/pedidos/finish-with-finished-goods.int.test.ts` (p. ej. `:570-571`, `:590`),
  entre otras. Quitarlas en la misma vuelta que B1.
- **m6 — C2, el `CHECK` de coste relajado (punto 5).** Relajar `product_batches_unit_cost_positive` para
  admitir coste 0 solo con `package_content` está justificado en `design.md > 10`. `package_content`
  solo lo escribe `receiveFinishedGoods`, y el `down.sql` repone el `CHECK` original tras la guarda.
  Aceptado. Riesgo residual: nada en la base impide que un escritor futuro ponga `package_content`
  para colar un coste 0.
- **m7 — Censos ampliados (punto 6).** Las 4 listas mantienen la igualdad exacta y dicen su motivo, y
  la limpieza de los 3 E2E sigue el orden de las FK. Aceptado.
- **m8 — El `reset --hard` (punto 7).** Comprobado: `55575d4a` (T9) y `2bbdf3e8` son ancestros de
  `HEAD`, y lo de T9 que arrastraba `5790736e` está en `55575d4a`. No se perdió nada.
- **m9 — Receta de otra empresa.** `receiveFinishedGoods` no comprueba que el `recipeId` sea de la
  empresa, porque la FK `products_recipe_id_fkey` es simple. Por diseño lo cubre el único llamante,
  que toma la receta del pedido bloqueado por empresa (`design.md > 2.3`). Queda anotado; el test de
  B2 puede fijarlo.

## Trazabilidad verificada (lo leído)

| R | Test |
|---|---|
| R10, R41 | `finish-with-finished-goods.int.test.ts:261` |
| R11, R13, R16, R17, R41, R43 | `finished-goods.int.test.ts:178`: tipo, nombre, unidad, lote, fecha UTC, sin vencimiento, autor, asiento y existencia |
| R12, R14, R19 | `finished-goods.test.ts:12-44` |
| R18, R20 | `finish-with-finished-goods.int.test.ts:311` y `:393` |
| R21 | `finish-with-finished-goods.int.test.ts:443-466` y `finished-goods.int.test.ts:288` |
| R22 | `finished-goods.int.test.ts:330` (dos conexiones) |
| R23 | `finished-goods.int.test.ts:387` |
| R24 | `finish-with-finished-goods.int.test.ts:494` y `assigned-orders-delivered-notice.test.tsx:111` |
| R25 | `product-batches-panel.test.tsx:203-233` |
| R26 | `finish-with-finished-goods.int.test.ts:513`: el permiso se comprueba antes de leer; `requirePermission` es la primera línea de `finishAssignedOrder` |
| R27 | `finish-with-finished-goods.int.test.ts:343` |
| R28, R31, R32 | `finished-product-prohibitions.int.test.ts` |
| R29 | `recipe-service.test.ts:230` |
| R30 | `recipe-lines-no-finished-product.test.tsx:38` |
| R33 | `adjust-batch-dialog.test.tsx:301` |
| R35 | `finished-goods.int.test.ts:449` |
| R37 | `e2e/producto-terminado.spec.ts:511` |
| R42, R43 | `finish-with-finished-goods.int.test.ts:535-595` |
| R44 | `finished-goods.int.test.ts:507-540` |
| D22 | `finished-goods.int.test.ts:574`, `product-input.test.ts`, `product-batch-write.int.test.ts` |

El resto de requisitos lo comprobé por nombre de caso contra el mapa final de
`progress/impl_QC-150-producto-terminado.md`.

## Qué tiene que volver del implementer

1. B1 y m5: quitar las citas de los comentarios añadidos, en producción y en tests.
2. B2: el test de integración de acceso cruzado en `receiveFinishedGoods`.
3. B3: renombrar las dos migraciones a prefijos posteriores a los de `dev`; después, `db:rollback` y
   `db:migrate` sobre `QuimiCloude_QC150` y regenerar la plantilla.
4. Mergear `origin/dev` y correr `./init.sh --rapido`. Antes del PR, `./init.sh` completo.

---

## Vuelta 2 (2026-09-24) — `6576626a..35ec4371`

Diff contra el nuevo merge-base con `origin/dev` (`cdfc6bba`; a `dev` solo le falta `33fab2a6`, de
bitácora). Los tests se corrieron en serie contra `QuimiCloude_QC150`, todos verdes:

- `transition-order`, `finished-goods-prisma`, `guard-convenciones-showcase`,
  `guard-arquitectura-modulos` y `guard-ambito-empresa-inventario`: 117/117.
- `finished-goods.int`, `product-type-lock.int` y `finish-with-finished-goods.int`: 26/26.

`./init.sh` completo y E2E, según el leader.

### Veredicto vuelta 2: **RECHAZADO** (B1-B3 cerrados; un bloqueante nuevo, B4, introducido por el arreglo de m9/D24)

| Hallazgo | Estado |
|---|---|
| B1 comentarios de producción con cita | **Cerrado.** 0 líneas añadidas en `app/`, `lib/` o `db/` citan `QC-`, `R<n>`, `D<n>` o `design.md` |
| B2 acceso cruzado | **Cerrado.** `tests/integration/inventario/finished-goods.int.test.ts:449`: B con la presentación de A da `presentation_without_content`, y los conteos de las dos empresas no cambian |
| B3 prefijo duplicado | **Cerrado.** Las migraciones pasan a `20260924130000_*` y `20260924130100_*`, posteriores a `20260924120000_customers`. Ninguna referencia al nombre viejo; no se tocó ninguna migración ajena; sin dependencias nuevas (`react-intersection-observer` viene aprobada de `dev`) |
| m1 → D23 | Cerrado: `product-type-lock.int.test.ts:211,236` |
| m2 | Cerrado: R42 en integración con `MACHINE` a `unit_cost` nulo |
| m3 | Aceptada la explicación: los «R25» son de QC-92 y ya estaban en `dev` |
| m9 → D24 | Cerrado en comportamiento (`finished-goods.int.test.ts:495`), pero **abre B4** |

### B4 — BLOQUEANTE: `inventario` consulta la tabla `recipes`, que es de `recetas`

`lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:989-993` hace
`SELECT "id" FROM "recipes" WHERE ... "company_id" = ...` con SQL crudo. `Recipe` es
`/// @module recetas` (`db/schema.prisma:433`).

- **Qué incumple.** `CHECKPOINTS.md > Módulos hexagonales`: «ningún módulo consulta un modelo
  ajeno». `docs/architecture.md`: «Solo los adaptadores driven del módulo propietario pueden
  consultar ese modelo». La guardia no lo detecta porque solo busca `prisma.<modelo>`, y el SQL
  crudo se le escapa. Es el **único** acceso crudo a una tabla de otro módulo en todo `lib/modules`.
- **El comentario de `:985-988` es falso.** Justifica la consulta con «la misma consulta cruda que
  usa el resto del archivo para leer tablas ajenas por id», y no existe ningún otro caso.
- **Qué hace falta.** Mover la comprobación de D24 a quien ya tiene el contrato de `recetas`.
  `pedidos/domain/transition-order.ts:112` ya llama a
  `deps.recipes.findRefsIncludingDeleted([locked.recipeId], companyId)`, acotado por empresa, y hoy
  sigue adelante con `recipeRef?.name ?? ''`. Basta con lanzar `RecipeNotFoundError` si `recipeRef`
  es `undefined` y quitar la consulta de `inventario`. Si se prefiere que `inventario` se defienda
  solo, la alternativa es un puerto propio cableado en `lib/composition` con el contrato de
  `recetas`, nunca SQL sobre su tabla.
- **Qué pasa con el test de D24.** Si la comprobación sale de `inventario`, el test tiene que subir
  al nivel del Finalizar, o fijar el rechazo del puerto.
- **D24 no obliga a este diseño.** Dice «se comprueba en el código», no «en `inventario` leyendo
  `recipes`».

### Menores de la vuelta 2

- **n1 — m5 no quedó a 0.** La bitácora dice «49 → 0», pero siguen unas 30 líneas de comentario de
  tests añadidas por la rama que citan fichas o requisitos. Ejemplos:
  - `tests/integration/inventario/finished-goods.int.test.ts:2,8,9`
  - `tests/integration/inventario/presentation-content.int.test.ts:2,4,84,108`
  - `tests/integration/inventario/product-type-lock.int.test.ts:2`
  - `tests/integration/inventario/finished-product-prohibitions.int.test.ts:2`
  - `tests/integration/pedidos/finish-with-finished-goods.int.test.ts:2,5`
  - `tests/integration/pedidos/order-content-copy.int.test.ts:2`
  - `tests/unit/pedidos/create-order.test.ts:124`, `tests/unit/pedidos/update-order.test.ts:121`,
    `tests/unit/pedidos/transition-order.test.ts:23`
  - `tests/unit/inventario/presentation-service.test.ts:53,55`
  - `tests/unit/asignaciones/finish-assigned-order.test.ts:35`
  - `tests/helpers/order-unit-of-work-double.ts:70`
  - `tests/unit/recetas-ui/recipe-lines-no-finished-product.test.tsx:9`

  El filtro que usaron debió de mirar solo las líneas que empiezan por `//` o `*`, no las que
  abren con `/**`.
- **n2 — `guard-convenciones-showcase.test.ts`.** El salto es **aceptable** y no debilita la
  guardia. R29 y D20 protegen el alcance del diff de QC-140, que ya está en `dev`: fuera de su rama no
  tienen nada que mirar, y `ctx.skip` con motivo es más honesto que un verde vacío. Sigue el mismo
  patrón que `guard-convenciones-proveedores.test.ts`. Un defecto: `--grep=QC-140` casa con
  **cualquier** mensaje que nombre la ficha, no solo con los commits firmados `tipo(QC-140)`. En esta
  rama casa con `ae5597ce fix(QC-150): R29/D20 de QC-140 ...`, así que los casos corren en vez de
  saltarse (en mi corrida, 0 skipped). Hoy es inocuo porque ese commit solo toca el propio test,
  pero un commit de otra ficha que mencione QC-140 y añada una migración lo pondría rojo.
  Recomendado anclar el patrón, p. ej. `--grep=^[a-z]+\(QC-140\)` con `-E`. Además, el archivo gana
  comentarios que citan QC-140, y es un test de otra ficha tocado desde esta: decirlo en el PR, como
  ya prevé la bitácora.
- **n3 — Traducción de `recipe_not_found` sin test unit.** `finish-assigned-order.ts:107` traduce
  `'recipe_not_found'` a `RecipeNotFoundError`, pero ningún caso de
  `tests/unit/asignaciones/finish-assigned-order.test.ts` lo prueba. El D24 de `transition-order`
  cubre el rollback, no esa traducción.

### Qué tiene que volver del implementer

1. B4: quitar la lectura de `recipes` de `inventario` y hacer la comprobación de D24 por el
   contrato de `recetas` (lo natural es en `transition-order.ts`), ajustando su test.
2. n1: terminar la limpieza de citas en comentarios de tests.
3. n2 y n3: opcionales, recomendados.
