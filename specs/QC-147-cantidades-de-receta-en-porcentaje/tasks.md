# QC-147 — cantidades-de-receta-en-porcentaje · tasks.md

> Una task = un commit (`feat(QC-147): …` / `test(QC-147): …`). `[P]` = se puede hacer en paralelo
> con las demás `[P]` cuyas dependencias estén cumplidas; ninguna `[P]` comparte archivos con otra.
> «Hecho» siempre incluye `./init.sh --rapido` en verde al cerrar la tanda; `./init.sh` completo en
> T12. Los archivos listados son los esperados, para cruzar conflictos con otras features en F2.0.
> No queda ninguna pregunta abierta: D13–D16 las cerraron el 2026-09-22. Los tests existentes que
> guardan una receta sin líneas —permitido por QC-26, prohibido por D14— están tabulados en
> `design.md > 12` con su tratamiento; cada uno aparece abajo en la task de su capa.

## Grafo

```
T1 ─────────────┐
T2 [P] ─┬─ T3 ──┼─ T4 ─┬─ T6 ─┐
T5 [P] ─┴───────┘      ├─ T7 ─┤
                       ├─ T8 ─┼─ T10 ─ T11 ─ T12
                       └─ T9 ─┘
```

T6, T7, T8 y T9 son `[P]` entre sí una vez hecha T4.

---

- [ ] **T1 — Migración y esquema de `recipe_lines`**
  - Depende de: —
  - Archivos: `db/migrations/<ts>_recipe_lines_percentage/migration.sql`,
    `db/migrations/<ts>_recipe_lines_percentage/down.sql`, `db/schema.prisma`,
    `tests/unit/recetas/schema/recipe-lines-percentage-migration.test.ts` (nuevo),
    `tests/integration/recetas/recipe-lines-percentage.int.test.ts` (nuevo),
    `tests/unit/recetas/schema/recetas-schema.test.ts`, `tests/unit/recetas/scope.test.ts`,
    `tests/unit/unidades/schema/unidades-schema.test.ts`,
    `tests/integration/unidades/unidades-constraints.int.test.ts`,
    `tests/integration/recetas/recetas-constraints.int.test.ts`.
  - Qué: `design.md > 2` entero: paréntesis `NO FORCE`/`FORCE`, `DELETE`, fuera `unit_id` (FK,
    índice, columna) y `quantity` (CHECK, columna), dentro `percentage DECIMAL(5,2)` +
    `recipe_lines_percentage_range`. `down.sql` inverso. Modelo Prisma sin `unitId`.
  - Hecho cuando: el test de migración comprueba sobre el SQL el `NO FORCE` antes del `DELETE`, el
    `DELETE` antes del `ADD COLUMN`, el CHECK y que `recipes` no aparece en ninguna sentencia (R8);
    el de integración, contra la base migrada, rechaza `0`, `-1` y `100.01` con `23514`, acepta
    `100.00` y relee `12.345` como `12.35` (R6), y comprueba que las recetas previas conservan
    nombre, pasos y `updated_at` con cero líneas (R8); `pnpm run db:rollback` aplicado sobre una
    base de test deja `recipe_lines` con `quantity` + `unit_id` y `_prisma_migrations` coherente,
    y se vuelve a aplicar (R9). Los tests de esquema existentes dejan de esperar `unitId`.

- [ ] **T2 [P] — Aritmética del porcentaje en el dominio de `recetas`**
  - Depende de: —
  - Archivos: `lib/modules/recetas/domain/recipe-percentage.ts` (nuevo),
    `lib/modules/recetas/index.ts`, `tests/unit/recetas/recipe-percentage.test.ts` (nuevo).
  - Qué: `design.md > 3`: `PERCENTAGE_PATTERN`, `percentageToHundredths`, `sumPercentages`,
    `consumedQuantity` y `formatPercentage`, exportados por el barrel.
  - Hecho cuando: los tests cubren 200 × 10 → 20 y 200 × 2 → 4 (R13), suma 90 + 7.5 → total
    `97.50`, diferencia `2.50`, incompleta; 92.5 + 7.5 → completa; 60 + 41 → diferencia `-1.00`
    (R10); **la lista vacía da total `0.00`, incompleta** (R3, D14); los mismos porcentajes con
    pedidos de 200 y 300 dan cantidades en proporción 2:3 (R21); `0.0001 × 0.01` es exacto;
    `formatPercentage` da «12,50» para «12.5», «10,00» para «10.00», «100,00» para «100» y
    «-1,00» para «-1.00» (R25); ningún resultado pasa por `number` ni por `Intl`. La guardia de
    arquitectura sigue verde (el barrel se importa desde cliente).

- [ ] **T3 — Contrato de entrada de receta**
  - Depende de: T2
  - Archivos: `lib/modules/recetas/domain/recipe-input.ts`, `tests/unit/recetas/recipe-input.test.ts`.
  - Qué: `design.md > 4.1`: `percentageSchema`, `recipeLineSchema` estricto sin `unitId`,
    `superRefine` de suma **sin guarda para la lista vacía** (D14).
  - Hecho cuando: los tests rechazan `'0'`, `'-1'`, `'100.01'`, `'12.345'`, `'abc'` con el issue en
    `['lines', i, 'percentage']` (R2); rechazan una línea con `unitId` (R5); rechazan 97,50 % con
    el issue en `['lines']` (R3); **rechazan `lines: []` y la ausencia de la clave `lines`, en alta
    y en edición, con el mismo issue en `['lines']`** (R3, R23); aceptan 97.5 + 2.5 (R4). Los casos
    de `recipe-input.test.ts` que hoy aceptan una entrada sin líneas se invierten o pasan a una
    línea al 100 %.

- [ ] **T4 — Servicio, puertos y persistencia de `recetas`**
  - Depende de: T1, T3, T5
  - Archivos: `lib/modules/recetas/domain/create-recipe.ts`, `update-recipe.ts`, `get-recipe.ts`,
    `recipe-view.ts`, `recipe-catalog.ts`, `lib/modules/recetas/ports/recipe-repository.ts`,
    `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`,
    `recipe-catalog-prisma.ts`, `lib/composition/index.ts` (solo el cableado de
    `createRecipe`/`updateRecipe`), `tests/unit/recetas/recipe-service.test.ts`,
    `recipe-lines-catalog.test.ts`, `recipe-catalog.test.ts`, `recipe-actions.test.ts`,
    `tests/unit/recetas/authorization.test.ts`, `company-isolation-service.test.ts`,
    `company-scope.test.ts`, `recipe-image-url.test.ts`, `recipe-image-lifecycle.test.ts`,
    `tests/integration/recetas/recipe-lines.int.test.ts`, `recipe-crud.int.test.ts`,
    `company-scope.int.test.ts`, `company-scope-queries.int.test.ts`.
  - Qué: `design.md > 4.2` y `> 6`: fuera `UnitCatalog` de alta y edición, `percentage` en puertos
    y adaptadores (`toFixed(2)`), `RecipeLineView` con `percentage`, `productUnitId` y existencia
    en la unidad del producto; `RecipeExecutionLine` con `percentage`. Tratamiento de los tests que
    hoy guardan sin líneas, según la tabla de `design.md > 12`.
  - Hecho cuando: un actor sin `recetas.modificar` que envía una receta al 97,50 % —y otro que la
    envía sin líneas— recibe el error de permiso y el repositorio no se llama (R7); el service
    rechaza 97,50 % y la receta sin líneas sin llamar al repositorio aunque la entrada no venga del
    formulario (R3); **editar una receta sembrada sin líneas cambiando solo el nombre se rechaza y
    el nombre no cambia** (R23, unitario e integración); guarda y relee 97.50 + 2.50 (R4,
    integración); **guarda una receta cuyo insumo no tiene lotes** (R24); el detalle devuelve
    `productUnitId` y la existencia en esa unidad, `null` de unidad para un insumo sin lotes y para
    uno de baja (R14, R24); ninguna vista de receta tiene clave `unitId` (R1). En
    `authorization.test.ts`, `company-isolation-service.test.ts`, `company-scope.test.ts`,
    `recipe-image-url.test.ts` y `recipe-image-lifecycle.test.ts` ninguna entrada que deba
    **guardarse** va sin líneas; en los tres de integración, cada caso que pasa por el servicio
    lleva una línea al 100 %.

- [ ] **T5 [P] — `ProductRef.unitId` en el contrato de `inventario`**
  - Depende de: —
  - Archivos: `lib/modules/inventario/domain/product-catalog.ts`,
    `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`,
    `tests/unit/inventario/product-catalog.test.ts`.
  - Qué: `design.md > 5`.
  - Hecho cuando: `findRefs` devuelve `unitId` igual a `products.unit_id`, y `null` para un producto
    sin lotes (R14); el test de claves exactas incluye `unitId`; los tests de QC-91 sobre
    `stockByUnit` siguen verdes sin tocarlos.
  - Ojo F2.0: son los archivos con más riesgo de cruce con QC-121 (`design.md > 10`).

- [ ] **T6 [P] — Costo de ingredientes con porcentaje**
  - Depende de: T2, T4, T5
  - Archivos: `lib/modules/pedidos/domain/order-cost.ts`,
    `lib/modules/pedidos/domain/resolve-ingredients-cost.ts`,
    `tests/unit/pedidos/order-cost.test.ts`,
    `tests/unit/pedidos/resolve-ingredients-cost.test.ts` (nuevo o ampliado si ya existe con otro
    nombre).
  - Qué: `design.md > 9`.
  - Hecho cuando: pedido 200, 10 % de un insumo en L con un lote de 50 L a 2,0000 → `40.0000`
    (R13, R15); la receta sin líneas y la existencia insuficiente dan `null` (R16); una línea con
    unidad desconocida da `null`; los lotes en una unidad hermana se siguen convirtiendo; el
    número de llamadas a cada catálogo no crece con el número de líneas; las pruebas de orden de
    lotes, promedio y redondeo previas siguen verdes con fixtures en porcentaje.

- [ ] **T7 [P] — Tabla de ingredientes de Pedidos**
  - Depende de: T2, T4
  - Archivos: `app/(private)/pedidos/components/order-ingredients-table.tsx`,
    `tests/unit/pedidos-ui/order-ingredients-table.test.tsx` (nuevo), y las fixtures de
    `RecipeLineView` en `tests/unit/pedidos-ui/order-form.test.tsx`, `order-sheet.test.tsx`,
    `order-sheet-responsibles.test.tsx`, `order-row-wiring.test.tsx`, `order-list-section.test.tsx`,
    `order-table.test.tsx`, `read-only.test.tsx`, `pedidos-viewport.test.tsx`.
  - Qué: `design.md > 8.2`.
  - Hecho cuando: con cantidad 200 y una línea al 10 % en L con existencia 15, la fila muestra
    porcentaje «10,00 %» (R25), unidad L, requerida 20 y restante −5 resaltado; sin cantidad
    escrita, requerida 0 (R17); la unidad sale de `productUnitId` y con `null` se pinta el marcador
    mientras porcentaje y requerida se siguen mostrando (R24).

- [ ] **T8 [P] — Pantalla de ejecución del Operario**
  - Depende de: T2, T4, T5
  - Archivos: `lib/modules/asignaciones/domain/assigned-order-execution-view.ts`,
    `get-assigned-order-execution.ts`,
    `app/(private)/asignacion/[id]/components/order-execution-lines.tsx`,
    `order-execution-screen.tsx`, `order-scale-banner.tsx` (se borra),
    `tests/unit/asignaciones/get-assigned-order-execution.test.ts`,
    `tests/unit/asignaciones-ui/order-execution-lines.test.tsx`,
    `order-execution-screen.test.tsx`, `order-execution-page.test.tsx`,
    `tests/unit/composition/asignaciones-facade.test.ts`.
  - Qué: `design.md > 7`.
  - Hecho cuando: pedido 200 y línea al 10 % en L → la fila dice «Hipoclorito · 10,00 % · 20 L»
    (R18, R25); la vista no tiene las claves `recipeBaseQuantity` ni `scaleFactorText` y la pantalla
    no monta ningún factor (R19); con unidades hermanas, elegir mL muestra 20000 y el «10,00 %» no
    cambia (R20); una línea con unidad desconocida muestra porcentaje y cantidad sin selector ni
    símbolo (R24); «Pedido 200» se pinta en un elemento propio con
    `data-testid="order-execution-order-quantity"`, fuera de la lista de líneas (R26).

- [ ] **T9 [P] — Formulario de recetas en porcentaje**
  - Depende de: T2, T3, T4
  - Archivos: `app/(private)/produccion/formulas/components/recipe-lines-field.tsx`,
    `recipe-form-state.ts`, `recipe-form.tsx`, `index.ts`, `unit-picker.tsx` (se borra),
    `unit-group.ts` (se borra), `app/(private)/produccion/formulas/[id]/page.tsx` y
    `nueva/page.tsx` (solo si la precarga cambia de forma), `tests/unit/recetas-ui/recipe-form.test.tsx`,
    `recipe-form-payload.test.ts`, `recipe-lines-unavailable.test.tsx`, `recipe-page.test.tsx`,
    `recipe-route-contract.test.ts`, `recipe-lines-sum.test.tsx` (nuevo),
    `unit-group.test.ts` y `recipe-line-unit-group.test.tsx` (se borran),
    `tests/unit/unidades/consumidores-catalogo.test.tsx`.
  - Qué: `design.md > 8.1`: campo `type="text"` + `inputMode="decimal"` que acepta coma,
    sustitución `,` → `.` en `buildRecipePayload`, precarga con `formatPercentage`, indicador de
    suma, Guardar deshabilitado también con cero líneas.
  - Hecho cuando: no hay ningún selector de unidad en las líneas y el campo se rotula como
    porcentaje; el ingrediente elegido y el precargado en edición se ven con su unidad (R12); al
    escribir «90» y «7,5» el indicador dice «Suma: 97,50 % — faltan 2,50 %» con
    `data-complete="false"` y cambia en cada pulsación sin llamar a ninguna acción (R10, R25);
    Guardar está deshabilitado y Enter en un campo no llama a la acción; con «92,5» + «7,5» se
    habilita y envía `{ productId, percentage: '92.5' }` sin `unitId` (R11, R1, R25); **sin ninguna
    línea el indicador dice «Suma: 0,00 % — faltan 100,00 %», Guardar está deshabilitado y la acción
    no se llama** (R11, R23); al precargar una receta con `12.5` el campo muestra «12,50» (R25); un
    rechazo del servidor por suma se pinta en el bloque de líneas (R3); un insumo sin unidad se
    puede elegir y la receta se guarda (R24).
  - Tests de QC-26 que cambian por D14: el `describe('R27 — … una receta sin ninguna se guarda')`
    de `recipe-form.test.tsx:753-765` **se invierte** a «sin líneas no se guarda»;
    `recipe-form-payload.test.ts:72` se queda si solo arma el payload, y se corrige si afirma que es
    válido; el resto de casos de `recipe-form.test.tsx` que pulsan Guardar sin líneas pasan a una
    línea al 100 %.

- [ ] **T10 — E2E**
  - Depende de: T1, T4, T6, T8, T9
  - Archivos: `e2e/recetas-porcentaje.spec.ts` (nuevo), `e2e/recetas.spec.ts`,
    `e2e/recetas-pasos.spec.ts`.
  - Qué: `design.md > 13`.
  - Hecho cuando: los cuatro escenarios de `design.md > 13` pasan en Chromium y WebKit contra la
    base de test (R22, y de extremo a extremo R3, R4, R15, R18, R23, R25, R26); los dos specs
    existentes rellenan una línea al 100 % sin elegir unidad y siguen verdes; la receta que
    `e2e/recetas.spec.ts` siembra sin líneas (`:280`) no se guarda en ningún paso del spec sin
    cargarle antes líneas que sumen 100 %, y ningún otro guardado por la UI en esos dos specs va sin
    líneas.

- [ ] **T11 — Documentación y guardias**
  - Depende de: T1–T10
  - Archivos: `docs/architecture.md` (Dominio, punto 1: la línea de receta ya no apunta a
    unidades), cualquier guardia de `tests/guards/` que inventaríe FK o índices del esquema final.
  - Hecho cuando: `docs/architecture.md` no afirma que la línea de receta lleva unidad; todas las
    guardias en verde; ningún comentario de producción tocado cita fichas ni requisitos
    (`docs/conventions.md`).

- [ ] **T12 — Gate y trazabilidad**
  - Depende de: T11
  - Archivos: `progress/impl_QC-147-cantidades-de-receta-en-porcentaje.md`.
  - Hecho cuando: `./init.sh` completo termina en verde; la bitácora tiene el mapa `R1`–`R26` →
    test concreto, sin ningún requisito huérfano, y lista los tests de QC-26 que se invirtieron o
    se ajustaron por D14.
