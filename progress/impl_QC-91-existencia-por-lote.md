# QC-91 — existencia-por-lote · bitácora de implementación

> En curso. Cierra la **tanda 1 (aditiva, T1–T6)**. La tanda 2 (retirada, T7–T9) y la
> tanda 3 (verificación, T10–T13) están pendientes. El mapa `R<n> -> test` completo es T12.

## Tanda 1 — aditiva (T1–T6)

Rama `feature/QC-91-existencia-por-lote`, desde `origin/dev` en `433bad2`.

| Task | Commit | Qué entró |
|---|---|---|
| T1 | `26fa388` | `sumStockByUnit` y `ProductStockByUnit`, pieza pura del dominio |
| T2 | `daa4106` | `ProductView.stockByUnit` y `BATCH_STOCK_BY_UNIT` en el adaptador |
| T4 | `4edab3c` | `ProductRef.stockByUnit` en el contrato público hacia `recetas` |
| T5 | `1788ad9` | `get-recipe` elige la existencia de la unidad de la línea |
| T3 | `0c28c46` | El listado pinta una existencia por unidad y la alerta nueva |
| T6 | `e489baf` | El pedido distingue existencia ausente de existencia cero |

### Archivos creados

- `lib/modules/inventario/domain/product-stock.ts`
- `tests/unit/inventario/product-stock.test.ts`

### Archivos modificados (producción)

- `lib/modules/inventario/index.ts`
- `lib/modules/inventario/domain/product-view.ts`
- `lib/modules/inventario/domain/product-catalog.ts`
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
- `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`
- `lib/modules/recetas/domain/get-recipe.ts`
- `lib/modules/recetas/domain/recipe-view.ts`
- `app/(private)/inventario/components/product-columns.tsx`
- `app/(private)/inventario/components/product-table.tsx`
- `app/(private)/inventario/components/product-list-section.tsx`
- `app/(private)/pedidos/components/order-form.tsx` (solo el comentario de `:380`)

### Tests tocados

`tests/unit/inventario/product-stock.test.ts` (nuevo), `product-prisma.test.ts`,
`product-catalog.test.ts`, `product-page.test.tsx`, `authorization.test.ts`,
`company-scope.test.ts`, `company-isolation-service.test.ts`, `product-service.test.ts`,
`tests/unit/recetas/recipe-service.test.ts`, `recipe-lines-catalog.test.ts`,
`tests/unit/recetas-ui/recipe-form.test.tsx`, `tests/unit/pedidos-ui/order-form.test.tsx`,
`tests/integration/inventario/list-query-products.int.test.ts`.

### Salida real de la verificación acotada (por task; el gate lo corre el leader)

- T1 — `pnpm typecheck` limpio · `pnpm lint` limpio · `vitest related`: 141 archivos, 2273 passed, 4 skipped, 0 failed.
- T2 — `pnpm typecheck` limpio · `pnpm lint` limpio · `vitest related`: 142 archivos, 2305 passed, 1 skipped, 0 failed (incluye integración contra Postgres efímero).
- T4 — `pnpm typecheck` limpio · `pnpm lint` limpio · `vitest related`: 144 archivos, 2277 passed, 1 skipped, 0 failed.
  - Guardia de riesgo declarada en `design.md > 6`: `pnpm exec vitest run tests/unit/unidades/module-contract.test.ts` → **8/8 verdes, sin tocar la guardia**.
- T5 — incluido en la corrida de T4 (mismo agente, misma tanda).
- T3 — `pnpm typecheck` limpio · `pnpm lint` limpio · `vitest related`: 5 archivos, 109 passed.
- T6 — `pnpm typecheck` limpio · `pnpm lint` limpio · `vitest related`: 24 archivos, 316 passed.

### Desviaciones declaradas (no se ajustaron en silencio)

1. **T6 no tocó `order-ingredients-table.tsx`**, que el censo (`design.md > 1.2`, fila 20)
   daba por seguro. Medido en el árbol: `line.productStock ?? MISSING_VALUE_MARK`,
   `remainingOf` devolviendo `null` solo con `productStock === null` e `isShort` para el
   negativo ya cumplían R12, R13 y R14 una vez que T5 entrega el dato ya elegido. Se
   añadieron los tres tests igualmente; no se tocó el archivo por no cambiar nada.
2. **T3 tocó `product-table.tsx`**, que no está en el censo. Hizo falta para bajar `units`
   desde `product-list-section.tsx` hasta `buildProductColumns`; el censo saltó ese
   eslabón intermedio. Sin cambio de comportamiento.
3. **T2 cambió una aserción de `product-prisma.test.ts`**: `PRODUCT_SELECT.batches.take === 1`
   pasó a `expect(PRODUCT_SELECT.batches).not.toHaveProperty('take')`. `take` dejó de existir
   en el tipo al ampliar la lectura a todos los lotes; la aserción afirma lo mismo en la
   forma que compila.
4. **T3 invirtió un caso de `product-page.test.tsx`**: el viejo esperaba que un producto sin
   existencia NO alertara. R17 (decisión humana del 2026-09-17) exige lo contrario.
5. Ningún subagente traía `node_modules` en el worktree; el primero corrió
   `pnpm install --frozen-lockfile`, `prisma generate` y `next typegen`. Sin dependencias
   nuevas: `package.json` y el lockfile intactos.

## Arreglo fuera de las tasks — la guardia de recetas-ui

`dfe1a9a` · `fix(QC-91): acota la guardia de recetas-ui a su propia rama`

El gate rápido de la tanda 1 dio **un rojo**: `tests/unit/recetas-ui/recipe-route-contract.test.ts`,
caso «la feature no toca lib/modules/recetas ni db/». Afirmaba «MI ficha no toca recetas» pero lo
implementaba corriendo `git diff --name-only origin/dev...HEAD` sobre **la rama que lo ejecute**, así
que vigilaba a todas las fichas posteriores. Es el patrón fichado como **QC-99**, tercer bullet.

Por **decisión humana del 2026-09-17** se acotó el caso a su propia rama, siguiendo la forma del
precedente `8bf3dd5` (QC-25). Se descartaron expresamente aflojar `RECETAS_PERMITIDAS` y parar la
feature. El caso ahora solo afirma si el diff toca la carpeta de la ruta que protege; distingue
«rango no disponible» (sigue rojo) de «rama ajena» (no aplica). `RECETAS_PERMITIDAS`, `DB_PERMITIDAS`
y `fueraDelAlcanceDeLaRama` quedaron **intactas**.

**Prueba por mutación**, exigida y ejecutada:

- Estado normal de la rama → `1 passed (1)`, `26 passed (26)`: el caso no aplica.
- Con un commit WIP que toca la carpeta protegida → el caso **vuelve a rojo** señalando el archivo:
  `AssertionError: ... expected [ Array(1) ] to deeply equal []` / `+ "lib/modules/recetas/domain/recipe-view.ts"`,
  `Tests 1 failed | 25 passed (26)`.
- WIP deshecho con `git reset --hard` al SHA anotado (no se usó `git stash`); árbol verificado limpio.

## Tanda 2 — la retirada (T7–T9)

| Task | Commit | Qué entró |
|---|---|---|
| T7 (lib) | `2a52601` | `productFieldsShape` queda `{ name, qtyAlert }`; el alta declara su `stock` |
| T7 (UI) | `99220d7` | El formulario pide la existencia solo en el alta |
| T8 | `9c5c8c4` | **Atómica**: `products.stock` sale de contratos, dominio, adaptadores y listado |
| T9 | `1d08684` | La migración quita la columna, su CHECK y su índice, con `down.sql` |

**T8 se ejecutó como estaba declarada: atómica.** Entró como un WIP de la parte de `lib/` y se cerró
por enmienda (`git commit --amend`) con la parte de `app/`, de modo que el historial tiene **un solo
commit** de T8. El árbol **no compiló entre medias**, por diseño y con visto bueno previo del leader:
los cuatro errores intermedios se midieron y todos venían de `app/` (`product-columns.tsx` y tres
fixtures de test que declaraban `ProductView.stock`). No se trocéo para fingir verdes.

### Verificación de la tanda 2

- T7 (lib) — typecheck exit 0 · lint exit 0 · 118/118 en sus archivos. `vitest related`: 2385 passed, 3 failed — los 3 rojos **avisados**, todos de la UI pendiente.
- T7 (UI) — typecheck exit 0 · lint exit 0 · `product-page.test.tsx` 59/59 · `product-field.test.tsx` 3/3 · `related` 111/111.
- T8 — typecheck **exit 0** (criterio de cierre) · lint limpio · `related` 143/143 en 6 archivos.
- T9 — typecheck limpio · lint limpio · esquema 65/65 unitarios y 36/36 de integración · colateral 57/57 · `vitest run guard` **480 passed, 9 skipped, 0 failed**.
- Guardia de riesgo del spec (`module-contract.test.ts` `:617`/`:624`): corrida en T4 y otra vez en T8 → **8/8 verde las dos veces, sin tocarla**.

### Migración (T9)

`db/migrations/20260917120000_drop_product_stock/` con `migration.sql` y `down.sql`, contenido
literal del `design.md > 3.1`. Probada **ida → vuelta → ida**:

- `db:migrate` → `Applying migration '20260917120000_drop_product_stock'` / `All migrations have been successfully applied.`
- `db:rollback` → `20260917120000_drop_product_stock revertida.`
- reaplicación → `All migrations have been successfully applied.`
- `_prisma_migrations` coherente: `stock column rows: []`, fila con `finished_at` puesto y `rolled_back_at` nulo.

El `down.sql` restaura **la forma, no los datos**: es el riesgo que D11 aceptó por escrito.

### Desviaciones de la tanda 2 (declaradas, no ajustadas en silencio)

6. **`pnpm run db:migrate:create` no sirvió**: `prisma migrate dev --create-only` aborta con **P3006**
   porque la base sombra revive toda la historia y `20260911130000_inventory_company_scope` lanza
   `RAISE EXCEPTION` a propósito si no hay ninguna empresa. Se siguió el precedente ya escrito por las
   tres migraciones posteriores sobre estas tablas: SQL a mano y `prisma migrate deploy`. El resultado
   es el mismo que pedía la task; se declara por si el humano quiere revisarlo.
7. **T9 limpió 6 archivos de test fuera de su lista** (`product-crud`, `product-batch-write`,
   `company-scope-queries`, `list-query-products`, `e2e/inventario.spec.ts`,
   `e2e/aislamiento-inventario.spec.ts`): bloqueaban el typecheck al caer la columna. Ediciones
   mecánicas de `products`, nunca de `product_batches`.
8. **T9 sumó la migración a `MIGRACIONES_ESPERADAS`** de `tests/guards/guard-identificador-de-request.test.ts`:
   esa guardia exige declarar a mano cada migración nueva.
9. **T8 reapoyó varios casos de integración en `qtyAlert`/`createdAt`**: usaban `stock` como campo
   declarado para probar aislamiento por empresa, desempate y nulos-al-final, y al caer de las listas
   blancas (R8) hacía falta otro vehículo. Lo que afirman no cambió.
10. **T7 reescribió el describe «R13 — existencia recibida al editar»** de `product-service.test.ts`:
   probaba justo lo que R9 ahora prohíbe. Pasó a «R9 — la edición rechaza la existencia».

### BLOQUEO ABIERTO — decisión humana pendiente

`tests/unit/inventario/qc81-alcance.test.ts`, caso
**`'R31: products.stock se sigue escribiendo como lo dejo QC-90'`** está **en rojo**. Lee el código de
`product-prisma.ts` y exige que `createWithFirstBatch` siga escribiendo `stock` en el producto —
exactamente lo que R11 de esta ficha manda retirar. El mensaje del propio caso ya nombraba esta
eventualidad («la existencia por lote es QC-91»).

**Ningún subagente lo tocó**, siguiendo el criterio del spec y el precedente de QC-103: enmendar la
guardia de otra ficha es decisión del humano. Queda declarado aquí y escalado al leader. Es el mismo
patrón de **QC-99**, aunque por otra vía: esta guardia no mira el diff de rama, afirma sobre el código
un estado que la ficha siguiente está autorizada a cambiar.
