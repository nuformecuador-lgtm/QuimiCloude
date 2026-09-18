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

## Tanda 3 — verificación (T10–T12)

| Task | Commit | Qué entró |
|---|---|---|
| — | `67363de` | Retira el caso de alcance de QC-81 que la ficha deroga (decisión humana) |
| T10 | `c9264f0` | `qc91-alcance.test.ts`: la existencia sale de los lotes |
| T11 | `f5b4921` | E2E: el segundo lote sube la existencia del producto |
| — | `3f100c2` | Cierra el hueco de R4: el lote vencido sigue sumando |

### El caso derogado de QC-81

El caso de alcance de QC-81 que exigía que la existencia se siguiera escribiendo en el producto se
**borró**, no se invirtió, por decisión humana del 2026-09-17. Invertirlo habría creado a sabiendas
la misma trampa que esta rama sufrió tres veces: una guardia que exige un estado que la ficha
siguiente está autorizada a cambiar —y hay una ficha posterior autorizada a devolver la columna—.
El resto del archivo quedó intacto: 15 casos a 14, de `1 failed | 11 passed | 3 skipped` a
`11 passed | 3 skipped`, verde.

### T10 se acotó a propósito, y se declara

`tasks.md` describía T10 como «recorre `lib/` y `app/` y falla si reaparece `products.stock`». **Esa
forma no se escribió**: es exactamente la trampa de arriba. En su lugar la guardia afirma el estado
nuevo **en positivo**, sobre fuentes nombradas y sin una sola llamada a `git diff`: que la existencia
se **deriva** de los lotes vía `sumStockByUnit`, que los contratos publican `stockByUnit`, y que
ninguna fila de lote se borra ni se modifica. Cada detector trae su autoprueba por mutación, y un
caso fabrica los contratos anteriores a T8 para demostrar que la guardia **se pondría roja si T8 se
revirtiera**, sin revertir ningún commit. 22/22 verdes.

Afirmaciones descartadas por conflictivas, para que consten: el censo de `products.stock` sobre
`lib/` y `app/`, y «el modelo `Product` no declara `stock`». Las dos las tendría que pelear la ficha
que devuelva la columna.

### E2E (T11) — ejecutado, no declarado

`pnpm exec playwright test e2e/inventario.spec.ts e2e/aislamiento-inventario.spec.ts` da
**`14 passed (2.7m)`**, en chromium y webkit. El caso nuevo corre en los dos navegadores: da de alta
un producto con su primer lote, vuelve a abrir el panel, elige el **mismo** producto y la **misma**
presentación, deja el campo de lote **vacío** (lo afirma antes de guardar: el correlativo es del
backend) y comprueba que la celda de existencia del listado muestra la **suma**, más que en base hay
exactamente dos filas de lote. Es el flujo que QC-81 difirió.

**No hubo flujos que reescribir**: T9 ya había hecho la limpieza mecánica y ningún spec abre el panel
de edición, porque desde T7 el campo de existencia solo se pinta en el alta. El censo del `design.md`
contaba 19 apariciones de existencia editable; al medirlo quedaban 0. Se declara por si el reviewer
esperaba ver ese diff.

### El hueco de R4, encontrado al construir el mapa

**R4 no tenía ningún test.** Medido antes de escribirlo: `ProductBatch.expiryDate`
(`db/schema.prisma:303`) **no se lee en ninguna ruta de lectura de existencia** —ni en el `where` ni
en el `select` de `BATCH_STOCK_BY_UNIT`—, así que el código ya cumplía R4; lo que faltaba era la
prueba. Se cubrió con integración y no con un unitario: la función pura ni siquiera recibe la fecha,
así que solo la consulta real contra Postgres demuestra que nadie filtra por vencimiento.

## T12 — Trazabilidad `R<n> -> test` · **23 declarados / 23 mapeados**

| R | Qué exige | Test (archivo:línea) |
|---|---|---|
| R1 | La existencia se calcula al consultar, no se guarda | `tests/unit/inventario/qc91-alcance.test.ts:201`, `:208`, `:214`, `:223` |
| R2 | La migración quita columna, CHECK e índice; el down los restaura vacíos | `tests/unit/inventario/schema/inventario-migration.test.ts:381`, `:394`; `tests/unit/inventario/schema/inventario-schema.test.ts:259` |
| R3 | La existencia del lote es entera, en la unidad de su presentación | `tests/unit/inventario/product-prisma.test.ts:114`; `tests/unit/inventario/product-stock.test.ts:4` |
| R4 | Un lote vencido suma igual | `tests/integration/inventario/list-query-products.int.test.ts:440` |
| R5 | Agrupa por unidad, sin convertir | `tests/unit/inventario/product-stock.test.ts:4`, `:13`, `:29` |
| R6 | El listado muestra una existencia por unidad, con su etiqueta | `tests/unit/inventario/product-page.test.tsx:723` |
| R7 | Producto sin lotes: existencia 0 | `tests/unit/inventario/product-stock.test.ts:25`; `tests/unit/inventario/product-page.test.tsx:743` |
| R8 | Ni orden ni filtro por existencia; si llegan, se ignoran sin fallar | `tests/unit/inventario/list-query.test.ts:178`; `tests/unit/inventario/list-use-cases.test.ts:172`; `tests/unit/inventario/product-list-params.test.ts:176` |
| R9 | La edición no muestra la existencia y la rechaza si llega | `tests/unit/inventario/product-input.test.ts:243`; `tests/unit/inventario/product-actions.test.ts:462`; `tests/unit/inventario/product-field.test.tsx:77`; `tests/unit/inventario/product-page.test.tsx:1057` |
| R10 | El alta escribe la existencia solo en el lote | `tests/unit/inventario/product-batch-input.test.ts:335`; `tests/unit/inventario/product-field.test.tsx:77` |
| R11 | No queda lectura ni escritura de la existencia del producto; entrega en una unidad | `tests/unit/inventario/qc91-alcance.test.ts:261`, `:268`, `:274`, `:290`, `:297`, `:315`; `tests/unit/inventario/product-prisma.test.ts:73`; `tests/unit/inventario/product-catalog.test.ts:39` |
| R12 | El restante resta sobre la existencia de la unidad de la línea | `tests/unit/recetas/recipe-service.test.ts:392`; `tests/unit/pedidos-ui/order-form.test.tsx:728` |
| R13 | Con lotes pero ninguno en esa unidad: marcador en existencia y restante | `tests/unit/recetas/recipe-service.test.ts:403`; `tests/unit/pedidos-ui/order-form.test.tsx:743` |
| R14 | Sin lotes: existencia 0, restante calculado y en rojo si es negativo | `tests/unit/recetas/recipe-service.test.ts:414`; `tests/unit/pedidos-ui/order-form.test.tsx:758`; `tests/unit/inventario/product-prisma.test.ts:109` |
| R15 | El detalle de receta expone la existencia de la unidad de la línea | `tests/unit/recetas/recipe-service.test.ts:425` (con `:392`, `:403`, `:414`) |
| R16 | La alerta compara contra la existencia del lote más reciente | `tests/unit/inventario/product-page.test.tsx:629`, `:703` |
| R17 | Sin lotes y con alerta configurada: se marca | `tests/unit/inventario/product-page.test.tsx:670` |
| R18 | Sin alerta configurada: no se marca | `tests/unit/inventario/product-page.test.tsx:682` |
| R19 | Los dos permisos de consulta, validados en el service | `tests/unit/inventario/authorization.test.ts:485`; `tests/unit/recetas/recipe-service.test.ts:433` |
| R20 | Se calcula sobre el esquema de lote de QC-81, con correlativo del backend | `e2e/inventario.spec.ts:636` |
| R21 | No se borra ni modifica ninguna fila de lote | `tests/unit/inventario/qc91-alcance.test.ts:355`, `:361`, `:365`, `:369` |
| R22 | Un segundo lote sube la existencia del listado, con E2E | `e2e/inventario.spec.ts:636` |
| R23 | Ninguna dependencia nueva; el manifiesto sin cambios | `tests/guards/guard-dependencias-aprobadas.test.ts:63` |

**R23, comprobado además sobre el diff de la rama**:
`git diff --name-only origin/dev...HEAD -- package.json pnpm-lock.yaml` devuelve **vacío**. Ni el
manifiesto ni el lock se tocaron.

### Salida real de la verificación de la tanda 3

- `qc91-alcance.test.ts` da `Test Files 1 passed (1)` y `Tests 22 passed (22)`.
- `qc81-alcance.test.ts`, tras el borrado, da `Test Files 1 passed (1)` y `Tests 11 passed | 3 skipped (14)`.
- E2E: `14 passed (2.7m)`, chromium y webkit.
- R4: `Test Files 2 passed (2)` y `Tests 29 passed (29)`.
- `pnpm typecheck` y `pnpm lint` limpios tras cada commit de la tanda.

### Desviaciones de la tanda 3 (declaradas)

11. **T10 no es el censo que describía `tasks.md`**, por la razón de arriba. Es la desviación más
    grande de la ficha y va declarada, no ajustada en silencio.
12. **T11 no reescribió ningún flujo**: al medirlo no quedaba ninguno editando existencia de producto.
13. **R4 no tenía test** y se cubrió fuera de las tasks; el código ya lo cumplía.
14. `qc91-alcance.test.ts` **copia** la función pura `stripComments` en vez de importarla del archivo
    de alcance de la ficha anterior: importar ese módulo re-ejecutaba su suite entera dentro del
    archivo nuevo (36 tests en vez de 22, medido). El original no se tocó.

**T13, el gate completo, es del leader.** Esta bitácora no se autoaprueba: decide el reviewer.

## Ronda de review — el bloqueante de comentarios

`6a8667d` · `chore(QC-91): limpia comentarios de dominio y adaptador de inventario`

La review rechazó la ficha por **9 comentarios de producción que citaban ficha o requisito**, todos
en líneas que esta rama añade. Es el mismo bloqueante que costó dos rechazos en QC-103. Las nueve se
reescribieron **conservando el porqué y quitando la cita**; ninguna quedó vacía al hacerlo, así que
no hubo que borrar ninguna entera. Cinco archivos, **19+/19−, solo comentarios**:
`product-view.ts`, `product-input.ts`, `update-product.ts`, `product-queryable.ts`,
`product-catalog-prisma.ts`.

**Conteo final, literal:**

```
git diff origin/dev...HEAD -- lib/ app/ components/ hooks/ db/ middleware.ts \
  | grep "^+" | grep -v "^+++" | grep -E "QC-[0-9]+|\bR[0-9]+\b|design\.md|decision cerrada|§"
```

Salida **vacía** (exit 1, sin coincidencias): **0 citas en producción**.

### El comentario con el motivo equivocado

`product-view.ts:48` decía «sumando todos los lotes **vivos** del producto». Medido en disco: el
modelo `ProductBatch` **no tiene `deletedAt`** —no hay borrado lógico de lotes— y `sumStockByUnit`
suma sin ningún filtro. Era un motivo no verificado, justo lo que la regla prohíbe y lo que explotó
en QC-103 con el `.nullish()`. Quedó: «Existencia agregada por unidad: suma el stock de todos los
lotes del producto.»

### Verificación de la ronda

- `pnpm typecheck` limpio · `pnpm exec eslint` sobre los cinco archivos, sin salida.
- `pnpm exec vitest related --run` sobre los cinco → `Test Files 150 passed (150)` ·
  `Tests 2453 passed | 4 skipped (2457)`.

**T13 marcada**: el gate completo salió verde (497 archivos, 7249 passed, 0 rojos). Las 13 tasks
quedan `[x]`.
