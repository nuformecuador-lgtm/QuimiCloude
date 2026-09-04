# QC-52 — separar-producto-de-catalogo-de-proveedor · bitácora de implementación

> Fase **F2** (implementer). Worktree `.worktrees/QC-52-separar-producto-de-catalogo-de-proveedor`,
> rama `feature/QC-52-separar-producto-de-catalogo-de-proveedor`. Fecha: **2026-09-04**.
>
> Spec de referencia: `specs/QC-52-separar-producto-de-catalogo-de-proveedor/`
> (`requirements.md` R1–R34, `design.md`, `tasks.md` T0–T19).

## Veredicto de una línea

**19 de 20 tareas en `[x]`** (T19 es esta bitácora), los **34 requisitos con test**, gate completo
en **1565 tests verdes** y **un solo archivo rojo, preexistente y ajeno**
(`tests/integration/identity/identity-seed.int.test.ts`), más **una salvedad de T13 que necesita
decisión humana**.

---

## 0. Montaje del worktree (no estaba hecho)

El worktree venía **sin `node_modules` y sin `.env`**: `scripts/wt.sh new` no los siembra
(`docs/worktrees.md` no lo cubre). Antes de tocar nada:

- `cp` del `.env` del worktree principal (apunta al **mismo Postgres de desarrollo**: la base es
  compartida entre worktrees, y eso tiene consecuencias — ver la sección 5.1).
- `pnpm install` (38 s).
- `pnpm exec prisma generate` — pnpm ignoró los build scripts de `prisma`/`@prisma/client`, así que
  el cliente no se generaba solo.
- `pnpm exec next typegen` — sin él, `tsc` falla con `Cannot find name 'LayoutProps'` en
  `app/layout.tsx:43`: es un tipo que Next genera en `.next/types` y que el worktree nuevo no tenía.

**Línea base medida antes de escribir una sola línea de código** (worktree limpio, `git status`
vacío): `typecheck` y `lint` verdes, y `pnpm test` da **1 archivo rojo, 8 tests**, exactamente
`tests/integration/identity/identity-seed.int.test.ts`. Ese rojo **no es de esta feature** y la
medición previa es la prueba (sección 5.1).

---

## 1. Archivos tocados

### Esquema y migración (Grupo A)
- `db/schema.prisma` — `Product` gana `imagePath` y pierde `cost`/`minPurchase`/`deliveryTime`;
  `SupplierCatalogLine` reescrita según `design.md > 2.1`.
- `db/migrations/20260904123854_split_product_and_supplier_catalog/migration.sql` **(nuevo)**
- `db/migrations/20260904123854_split_product_and_supplier_catalog/down.sql` **(nuevo)**

### Módulo `inventario` (Grupo B)
- `lib/modules/inventario/domain/product-input.ts` (`z.object` pasa a **`z.strictObject`**)
- `lib/modules/inventario/domain/product-view.ts`
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
- `lib/modules/inventario/adapters/driving/product-actions.ts`

### Pantalla de productos y E2E (Grupo C)
- `app/(private)/inventario/components/product-form.tsx`
- `app/(private)/inventario/components/product-columns.ts`
- `e2e/inventario.spec.ts`

### Módulo `proveedores` y composición (Grupo D)
- `lib/modules/proveedores/domain/catalog-line-input.ts`
- `lib/modules/proveedores/domain/catalog-line-view.ts`
- `lib/modules/proveedores/domain/create-catalog-line.ts`
- `lib/modules/proveedores/domain/update-catalog-line.ts`
- `lib/modules/proveedores/domain/delete-catalog-line.ts`
- `lib/modules/proveedores/domain/list-catalog-lines.ts`
- `lib/modules/proveedores/domain/errors.ts`
- `lib/modules/proveedores/index.ts`
- `lib/modules/proveedores/ports/supplier-catalog-repository.ts`
- `lib/modules/proveedores/ports/supplier-repository.ts`
- `lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma.ts`
- `lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts`
- `lib/modules/proveedores/adapters/driving/supplier-catalog-actions.ts`
- `lib/composition/index.ts` — quitado `products: productCatalog` de las dos factories de
  `proveedores`. **`productCatalog` se queda**: `recetas` lo usa.

### Tests
Nuevos: `tests/unit/inventario/schema/inventario-split-migration.test.ts`,
`tests/unit/proveedores/catalog-line-fk.test.ts`.

Modificados: los siete de `tests/unit/inventario/` (`authorization`, `product-actions`,
`product-input`, `product-page`, `product-prisma`, `product-route-contract`, `product-service`),
`tests/unit/inventario/schema/inventario-schema.test.ts`, los seis de `tests/unit/proveedores/`
(`authorization`, `catalog-line-input`, `catalog-service`, `module-contract`, `scope`,
`supplier-actions`), los dos de `tests/unit/proveedores/schema/` (`proveedores-migration`,
`proveedores-schema`), `tests/unit/recetas-ui/recipe-form.test.tsx`, los tres de
`tests/integration/inventario/`, los dos de `tests/integration/proveedores/`, los dos de
`tests/integration/recetas/` y `tests/integration/unidades/unidades-constraints.int.test.ts`.

`specs/QC-52-separar-producto-de-catalogo-de-proveedor/tasks.md` — tareas marcadas `[x]` y la
salvedad de T13 escrita en su sitio.

**Ninguna dependencia nueva** (R34): `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md`
están **sin tocar**.

---

## 2. La migración: qué propuso Prisma y qué se aceptó

`pnpm run db:migrate:create` **no puede correr en este entorno**: al avisar de pérdida de datos en
las tres columnas de `products`, Prisma exige TTY y aborta con "environment is non-interactive"
(probado también con stdin redirigido). Se usó
`prisma migrate diff --from-schema-datasource --to-schema-datamodel --script`, que es **el mismo
motor y el mismo diff** que escribe `--create-only`. Queda anotado en la cabecera del
`migration.sql`.

**Prisma propuso 16 `DROP CONSTRAINT`. Se borraron 15 a mano** (R29):
`orders_created_by_fkey`, `orders_recipe_id_fkey`, `orders_unit_id_fkey`, `orders_updated_by_fkey`,
`products_created_by_fkey`, `products_unit_id_fkey`, `products_updated_by_fkey`,
`recipe_lines_product_id_fkey`, `recipe_lines_unit_id_fkey`, `recipes_created_by_fkey`,
`recipes_updated_by_fkey`, `supplier_catalog_lines_created_by_fkey`,
`supplier_catalog_lines_updated_by_fkey`, `suppliers_created_by_fkey`,
`suppliers_updated_by_fkey`.

**Se conservó 1**, el único legítimo: `supplier_catalog_lines_product_id_fkey`. Desviación menor
respecto a `design.md > 3.1`, que preveía que Prisma **no** lo generaría y habría que escribirlo a
mano: sí lo generó (el diff introspecta la base y al borrar la columna arrastra su FK). El
resultado es el mismo.

Prisma **no** emitió ningún `DROP` de `CHECK`, ni de `products.image_path` (T0 desarmó esa mina
antes de generar), ni ninguna sentencia de RLS.

Escrito a mano: la guarda de tabla vacía, las dos FK a `presentations` y `units` con
`ON DELETE RESTRICT ON UPDATE CASCADE`, y el único parcial
`supplier_catalog_lines_name_presentation_unique` sobre
`(supplier_id, name_normalized, presentation_id) WHERE deleted_at IS NULL`.

**Apply, rollback y re-apply, ejecutados de verdad:**

1. `pnpm run db:migrate` da `Applying migration 20260904123854_split_product_and_supplier_catalog`
   y `All migrations have been successfully applied.`
2. `pnpm run db:rollback` da `20260904123854_split_product_and_supplier_catalog revertida.`
3. `diff censo-antes.txt censo-tras-rollback.txt` da **sin diferencias**. El censo cubre columnas
   (tipo, nulabilidad, default, precisión y escala), índices con su `indexdef`, restricciones con su
   `pg_get_constraintdef`, flags de RLS, recuento de filas, el censo global de FK y CHECK de todo el
   esquema, y `_prisma_migrations`.
4. `pnpm run db:migrate` de nuevo aplica; `diff censo-despues-up.txt censo-reaplicado.txt` da
   **sin diferencias**.

Drift residual comprobado: exactamente **17 FK escalares sin `@relation`** (las 15 preexistentes
más las 2 nuevas de esta ficha). Cero drift de columna, de índice o de CHECK.

---

## 3. Mapa `R<n>` a test (los 34, regla 4 de `CLAUDE.md`)

Rutas relativas a la raíz del worktree. `int` = integración contra Postgres real.

| R | Test que lo cubre |
| --- | --- |
| **R1** | `tests/unit/inventario/product-input.test.ts` "rechaza la entrada que trae costo, compra minima o tiempo de entrega" (`unrecognized_keys`, alta y edición) · `product-service.test.ts` "QC-52 R1 — costo, compra minima o tiempo de entrega en la entrada" · `product-prisma.test.ts` "no devuelve costo, compra minima ni tiempo de entrega" · `schema/inventario-schema.test.ts` "Product declara sus datos de negocio… sin los tres que QC-52 le quito" · `schema/inventario-split-migration.test.ts` "borra exactamente las tres columnas de products, y ninguna mas" · `tests/integration/inventario/inventario-constraints.int.test.ts` "tiene exactamente las columnas que R1 y R2 dejan" |
| **R2** | `tests/integration/inventario/inventario-constraints.int.test.ts` "tiene exactamente las columnas…", "las dos columnas enteras que quedan son integer", "el borrado logico conserva la fila" · `tests/unit/inventario/product-prisma.test.ts` "mapea la existencia y la alerta de cantidad sin reinterpretarlas" · `schema/inventario-split-migration.test.ts` "no toca ninguna de las columnas que el producto conserva" |
| **R3** | `tests/integration/inventario/inventario-constraints.int.test.ts` "conserva las cuatro claves foraneas", "conserva los dos CHECK… y solo esos dos", "no queda ninguna restriccion que mencione una columna eliminada", "rechaza existencia y cantidad de alerta negativas con SQLSTATE 23514" |
| **R4** | `tests/unit/inventario/schema/inventario-schema.test.ts` "imagePath esta declarado en el modelo, es opcional y mapea a image_path" · `tests/integration/inventario/inventario-constraints.int.test.ts` "image_path sigue existiendo, es TEXT y sigue siendo anulable" · `schema/inventario-split-migration.test.ts` "no menciona image_path de products por ninguna sentencia" |
| **R5** | `tests/unit/inventario/product-actions.test.ts` "no los lee del FormData aunque vengan, ni al crear ni al editar" · `product-page.test.tsx` "la edicion precarga los valores actuales y envia el reemplazo completo" (afirma que los tres no tienen control visible ni oculto y no viajan en el `FormData`) · `product-route-contract.test.ts` "el costo, la compra minima y el tiempo de entrega no se nombran en ningun archivo de la ruta" |
| **R6** | `tests/unit/inventario/product-page.test.tsx` "el costo, la compra minima y el tiempo de entrega no aparecen en la lista por ninguna via" · `product-route-contract.test.ts` (el mismo caso, en positivo) |
| **R7** | `e2e/inventario.spec.ts`, los dos tests, verdes en **chromium y webkit** con el `webServer` real de `playwright.config.ts` (sección 4.2) · más el censo de `data-testid` del spec contra `app/(private)/inventario/`: cero huérfanos |
| **R8** | `tests/unit/proveedores/schema/proveedores-schema.test.ts` "SupplierCatalogLine es una entidad propia con nombre, presentacion y costo, y sin existencia ni alerta" · `tests/integration/proveedores/proveedores-constraints.int.test.ts` "la linea tiene EXACTAMENTE las columnas de R8, y no tiene existencia, alerta ni referencia a un articulo" |
| **R9** | `tests/unit/proveedores/catalog-line-input.test.ts` "los dos esquemas rechazan un identificador de articulo del inventario, no lo ignoran" · `catalog-service.test.ts` "rechaza el alta con un identificador de articulo del inventario sin tocar el repositorio" |
| **R10** | `tests/unit/proveedores/catalog-line-input.test.ts` "exige la presentacion y admite la linea sin unidad y sin imagen", "rechaza el costo cero y el costo negativo…", "rechaza el minimo de compra y el tiempo de entrega negativos…" · en la base: `tests/integration/proveedores/catalog-line.int.test.ts` "la FK rechaza con 23503 la presentacion y la unidad inexistentes…" y "los tres CHECK de QC-42/QC-43 siguen vigilando…" |
| **R11** | `tests/unit/proveedores/catalog-line-input.test.ts` "los importes viajan como cadena decimal y nunca como numero" · `tests/integration/proveedores/catalog-line.int.test.ts` "crea la linea con sus siete campos, deriva el nombre normalizado y sella los dos autores" |
| **R12** | `tests/unit/proveedores/schema/proveedores-schema.test.ts` "las dos tablas y sus columnas mapean a snake_case en ingles" · `schema/proveedores-migration.test.ts` "las columnas nuevas de la linea entran con el tipo y la obligatoriedad que R8 y R10 piden" · `tests/unit/inventario/schema/inventario-split-migration.test.ts` "no crea, renombra ni borra ningun identificador que no este en ingles y en snake_case" |
| **R13** | `tests/unit/proveedores/catalog-service.test.ts` "el alta manda los siete campos de negocio al puerto, con el actor y el instante inyectados" · `tests/integration/proveedores/catalog-line.int.test.ts` "renombra, cambia de presentacion, conserva created_by…" y "la fila se conserva entera con su marca de baja…" |
| **R14** | `tests/unit/proveedores/catalog-line-input.test.ts` "exige un nombre que no quede vacio al recortarlo ni al normalizarlo…" · `tests/integration/proveedores/catalog-line.int.test.ts` "crea la linea con sus siete campos, deriva el nombre normalizado…" |
| **R15** | `tests/integration/proveedores/catalog-line.int.test.ts` "el indice rechaza con 23505 la segunda linea viva…" · `proveedores-constraints.int.test.ts` "rechaza con 23505 la segunda linea VIVA con el mismo nombre normalizado y presentacion" · `tests/unit/proveedores/catalog-service.test.ts` "traduce el duplicado del puerto a error de linea repetida…" |
| **R16** | `tests/integration/proveedores/catalog-line.int.test.ts` "R16: el mismo nombre en otra presentacion, y la misma linea en otro proveedor, conviven" · `proveedores-constraints.int.test.ts` "acepta muchas lineas por proveedor, el mismo nombre en dos presentaciones…" |
| **R17** | `tests/integration/proveedores/catalog-line.int.test.ts` "R17: una linea dada de baja libera su combinacion…" · `proveedores-constraints.int.test.ts` "una linea dada de baja libera su combinacion, porque el indice es PARCIAL" |
| **R18** | `tests/unit/proveedores/scope.test.ts` "ningun archivo del modulo importa inventario ni conserva una sola marca suya (R18)" y "la composicion deja de pasar el catalogo de articulos a proveedores, pero no lo borra (R18)" · `catalog-service.test.ts` "ninguno de los cuatro casos de uso depende del modulo inventario" |
| **R19** | `tests/integration/proveedores/catalog-line.int.test.ts` "dar de baja un articulo del inventario no altera ninguna linea, y ninguna linea impide darlo de baja" |
| **R20** | `tests/integration/proveedores/catalog-line.int.test.ts` "las tres filas quedan dadas de baja con el MISMO instante…" y "si no hay proveedor vivo que dar de baja, la transaccion no escribe nada" |
| **R21** | `tests/integration/proveedores/catalog-line.int.test.ts` "la fila se conserva entera con su marca de baja, y el listado deja de verla" · `proveedores-constraints.int.test.ts` "dar de baja una linea CONSERVA su fila y marca deleted_at (R21)" · `tests/unit/proveedores/schema/proveedores-schema.test.ts` "SupplierCatalogLine declara deletedAt…" |
| **R22** | `tests/unit/proveedores/catalog-service.test.ts` "el listado no devuelve nada de un proveedor dado de baja" · `tests/integration/proveedores/catalog-line.int.test.ts` "la fila se conserva entera…" y "las tres filas quedan dadas de baja…" |
| **R23** | `tests/integration/proveedores/catalog-line.int.test.ts` "las tres filas quedan dadas de baja con el MISMO instante…" (las cuatro operaciones dan `not_found` o `supplier_not_found`, **la baja incluida**, que es P5) · `tests/unit/proveedores/catalog-service.test.ts` "la baja de la linea es logica, sella al actor y al instante, y no encuentra la de un proveedor dado de baja" |
| **R24** | `tests/unit/proveedores/catalog-line-input.test.ts` "la edicion reemplaza los siete campos de negocio y no puede cambiar el proveedor" · `catalog-service.test.ts` "la edicion reemplaza los siete campos y no puede cambiar el proveedor" · `tests/integration/proveedores/catalog-line.int.test.ts` "renombra, cambia de presentacion…" y "el renombrado que choca con otra linea viva del mismo proveedor da duplicate y no escribe nada" |
| **R25** | `tests/unit/proveedores/authorization.test.ts` (las cuatro de la línea; dobles de repositorio que afirman **cero llamadas**) · `tests/unit/inventario/authorization.test.ts` (las cinco del producto, incluido el describe nuevo "QC-52 R25 — el fixture con el que se mide el permiso es entrada valida") |
| **R26** | `tests/unit/proveedores/schema/proveedores-migration.test.ts` "no contiene ninguna sentencia de RLS (R26)" · `tests/unit/inventario/schema/inventario-split-migration.test.ts` "no contiene ninguna sentencia de RLS" · en la base: `tests/integration/proveedores/proveedores-constraints.int.test.ts` "RLS sigue HABILITADA y FORZADA en las dos tablas despues de la migracion (QC-52 R26)" y `tests/integration/inventario/inventario-constraints.int.test.ts` "RLS sigue habilitada Y forzada en products" · guardia `tests/guards/guard-rls-force.test.ts` |
| **R27** | `tests/unit/proveedores/schema/proveedores-migration.test.ts` "el UNICO DROP CONSTRAINT es el legitimo…" y "no toca ninguna tabla que no sean products y supplier_catalog_lines" · `tests/unit/inventario/schema/inventario-split-migration.test.ts` "no altera ninguna otra tabla que products y supplier_catalog_lines" |
| **R28** | `tests/unit/proveedores/schema/proveedores-migration.test.ts`, describe **"QC-52 down.sql — reversion al esquema EXACTO anterior (R28)"**, 8 casos: simetría de `ADD` y `DROP COLUMN` derivada del propio `migration.sql` y no de una lista a mano; los tipos literales (`min_purchase INTEGER NOT NULL DEFAULT 0`, **no anulable**; `cost DECIMAL(14,4)`; `delivery_time INTEGER`); los dos CHECK recreados a mano; `product_id UUID NOT NULL` con su FK `RESTRICT`, su índice y su único **TOTAL**; cero residuos; no toca otras tablas ni FK escritas a mano; la guarda `RAISE EXCEPTION`; y el caso de sensibilidad con cinco `down.sql` empobrecidos. **Además**, la reversión se ejecutó de verdad y el censo se comparó (sección 2) |
| **R29** | `tests/unit/proveedores/schema/proveedores-migration.test.ts` "no contiene ningun DROP CONSTRAINT de las quince FK que cruzan de modulo" y "la guardia cae si alguien deja entrar un DROP CONSTRAINT del generador" · `tests/unit/inventario/schema/inventario-split-migration.test.ts` "no contiene ningun DROP CONSTRAINT de las FK que cruzan de modulo" (17 nombres) y "el unico DROP CONSTRAINT que queda es el legitimo de la linea" |
| **R30** | `tests/unit/proveedores/schema/proveedores-schema.test.ts` "presentation_id, unit_id, created_by y updated_by son escalares uuid SIN @relation (R30)" · `module-contract.test.ts` "el catalogo no gana ninguna relacion Prisma hacia Product ni hacia User" (sobre el DMMF) · `schema/proveedores-migration.test.ts` "las dos FK nuevas existen…" y "cada FK nueva tiene indice en su lado hijo" · en la base: `tests/integration/proveedores/proveedores-constraints.int.test.ts` "rechaza con 23503 la presentacion, la unidad y el autor inexistentes…" y `tests/integration/unidades/unidades-constraints.int.test.ts` "la base rechaza un unit_id inexistente aunque Prisma no declare la relacion" (censo cerrado de las cuatro FK hacia `units`) |
| **R31** | `tests/unit/proveedores/supplier-actions.test.ts` "las mutaciones reciben FormData y las consultas argumentos tipados" · `scope.test.ts` "no hay ningun route handler de proveedores bajo app/api" |
| **R32** | `tests/unit/proveedores/catalog-service.test.ts` "traduce el duplicado del puerto a error de linea repetida…" (el `code` `duplicate_catalog_line` se conserva) · `supplier-actions.test.ts` "traduce cada error de dominio a status error con el code estable…" (ya no existe `product_not_found`) · `tests/unit/proveedores/catalog-line-fk.test.ts` (los tres casos) · `tests/unit/inventario/product-input.test.ts` "…traduce la entrada con costo a invalid_input" (se afirma sobre el `code`, nunca sobre el mensaje) |
| **R33** | `tests/unit/proveedores/module-contract.test.ts` (pureza de dominio y de puertos, y cableado en `lib/composition`) · guardia `tests/guards/guard-arquitectura-modulos.test.ts` |
| **R34** | Guardia `tests/guards/guard-dependencias-aprobadas.test.ts` (verde) · y `git status` y `git diff` sobre `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md`: sin un solo cambio |

### Los asserts muerden — comprobado a mano, no supuesto

- **Migración (R26, R27, R29, R4):** se inyectó en el `migration.sql` real un
  `DROP CONSTRAINT "products_created_by_fkey"`, un `ENABLE ROW LEVEL SECURITY`, un
  `DROP COLUMN "image_path"` y un `ALTER TABLE "recipes"`. **7 de 8 casos se pusieron rojos.**
  Restaurado con `cp` desde una copia previa (nunca `git checkout`); `git status db/` limpio.
- **`down.sql` (R28):** siete rondas de degradación del archivo real — `min_purchase` anulable, sin
  los dos CHECK, `cost` como `DOUBLE PRECISION`, `product_id` anulable, el único total convertido en
  parcial, sin los bloques de guarda, sin el `DROP COLUMN image_path` — **todas rojas**, con el caso
  concreto identificado en cada una. Restaurado con `cp`; `diff` con la copia: idéntico.
- **Contrato de ruta (R5, R6):** añadir `const cost = 1;` a `product-table.tsx` pone rojo el caso,
  con `AssertionError: app/(private)/inventario/components/product-table.tsx no debe contener cost`.

---

## 4. Salida real de la verificación

### 4.1 Gate completo, `./init.sh` (2026-09-04, 08:59)

```
-> pnpm run typecheck
✓ typecheck paso
-> pnpm run lint
✓ lint paso
-> pnpm run test:json

 Test Files  1 failed | 140 passed (141)
      Tests  8 failed | 1565 passed (1573)
   Duration  54.84s

hay 1 archivo(s) de test en rojo que NO estan en el baseline:
  tests/integration/identity/identity-seed.int.test.ts
✗ hay rojos NUEVOS respecto del baseline
```

**El único archivo rojo es preexistente y ajeno** (sección 5.1). Los 8 fallos son sus 8 casos, todos
por la misma causa. **Todo lo demás está en verde: 140 archivos, 1565 tests.**

Progresión de las corridas, para que se vea qué se arregló y qué no:

| Corrida | Archivos rojos | Qué eran |
| --- | --- | --- |
| Baseline (worktree limpio, antes de tocar código) | `identity-seed.int.test.ts` | ajeno, preexistente |
| Gate 1 | `identity-seed` y `unidades-constraints.int.test.ts` | el segundo, **mío**: el censo cerrado de FK hacia `units` no conocía la FK nueva de la línea. Arreglado ampliando el censo a cuatro, sin aflojar el `toEqual` |
| Gate 2 y 3 | `identity-seed` y `product-page.test.tsx` | el segundo, **mío**: timeout de 5 s bajo saturación de la suite. Arreglado (sección 5.2) |
| **Gate 4, el final** | **solo `identity-seed`** | ajeno |

### 4.2 E2E, `pnpm run e2e`, con el `webServer` real de `playwright.config.ts` (puerto 3117)

```
✓  5 [chromium] › e2e\inventario.spec.ts:204:7 › catalogo de productos › el Administrador entra, da de alta un producto con una presentacion nueva y lo ve en la lista (1.5m)
✓  6 [chromium] › e2e\inventario.spec.ts:263:7 › catalogo de productos › un usuario que no es Administrador acaba fuera y no ve el catalogo (53.7s)
✓ 23 [webkit]   › e2e\inventario.spec.ts:204:7 › ... (36.1s)
✓ 29 [webkit]   › e2e\inventario.spec.ts:263:7 › ... (25.0s)

31 passed, 1 failed (3.5m)
```

El único fallo de la corrida es **`e2e/theme.spec.ts` en chromium**, ajeno a esta feature y **flake
confirmado**: `Protocol error (Target.disposeBrowserContext): Failed to find context with id …` al
cerrar un `BrowserContext` con 4 workers y dos proyectos a la vez. Re-corrido solo
(`playwright test e2e/theme.spec.ts --project=chromium`) da **4 passed**.

**Los cuatro tests de `inventario.spec.ts` pasan en Chromium y en WebKit** (R7).

### 4.3 Guardias

`pnpm run test:guardias` da `12 archivos / 123 tests`, todos verdes, en cada tanda.

---

## 5. Lo que queda abierto, y por qué

### 5.1 BLOQUEA EL GATE Y NO ES DE ESTA FEATURE: `identity-seed.int.test.ts`

Los 8 casos fallan en el mismo sitio: `resetIdentityToEmptyState` llama a
`tx.user.deleteMany({})` y recibe `Foreign key constraint violated`.

**Causa, diagnosticada contra la base:** la base de desarrollo **compartida** tiene **1 fila de
`products` y 1 de `recipes` con autor**, y las diez FK hacia `users` son `ON DELETE RESTRICT`. El
test asume que puede borrar todos los usuarios dentro de su transacción con rollback; con cualquier
fila de negocio que tenga autor, no puede.

**Prueba de que no es de QC-52:** se midió con `pnpm test` sobre el worktree **limpio**, con
`git status` vacío, **antes de la primera edición**: mismo archivo, mismos 8 fallos. Y las diez FK
hacia `users` siguen intactas después de la migración (censo verificado), incluidas las dos de
`supplier_catalog_lines`, que es justo lo que R29 exige.

**No lo he resuelto y no debo hacerlo yo:** las dos salidas que `docs/verification.md` contempla
—limpiar las filas de la base de desarrollo, o añadir el archivo a `tests/baseline-rojos.json` con
su `motivo` y su `desde`— **son decisión del leader o del humano**. Añadirlo al baseline afloja el
gate, y el baseline está hoy vacío a propósito. Lo dejo escrito y no lo toco.

### 5.2 Dos rojos propios que sí se arreglaron

- **`tests/integration/unidades/unidades-constraints.int.test.ts`**: su censo **cerrado** de FK hacia
  `units` esperaba tres y la base devuelve cuatro. La cuarta es
  `supplier_catalog_lines_unit_id_fkey`, que añade esta ficha. Se **amplió el censo a cuatro**
  manteniendo el `toEqual` con la lista completa (no se aflojó a `toContain`) y se actualizó su
  comentario. 13 de 13 en verde.
- **`tests/unit/inventario/product-page.test.tsx`**: pasaba en aislamiento (27 tests, 20 s) y fallaba
  **de forma reproducible** con la suite entera, por `Test timed out in 5000ms`. Diagnóstico
  confirmado: son 27 casos de `user-event` sobre jsdom, los más pesados van de 3,5 a 4,4 s y bajo
  saturación se pasan del límite; el segundo fallo era **contaminación de tecleo** —las pulsaciones
  pendientes del caso cortado caían en el input del siguiente, con la firma inconfundible
  `xxxxxÁxcxixdxox xcxíxtxrxixcxoxx`—, no lógica del formulario. Se resolvió con
  `vi.setConfig({ testTimeout: 20_000 })` **a nivel de archivo**, no en el proyecto `ui` de
  `vitest.config.mts`, para no regalarle margen al resto de la UI, y con el porqué escrito en el
  código. **Ningún assert debilitado, ningún caso borrado, ningún `skip`.** Verificado con dos
  corridas completas de `vitest run tests/unit`: 112 archivos y 1235 tests en verde.

### 5.3 NECESITA DECISIÓN HUMANA: T13 no se puede cumplir como está escrito

`design.md > 6.2` y T13 piden traducir el `P2003` de `presentation_id` y `unit_id` a `invalid_input`
**decidiendo por `meta.field_name`**. Con **Prisma 6.19.3 el conector no lo entrega**: todo `P2003`
llega con `meta = { modelName: 'SupplierCatalogLine', constraint: null }` y el mensaje
`Foreign key constraint violated on the (not available)`, y da igual que la FK esté declarada con
`@relation` o sea un escalar. **La decisión es hoy indecidible.** Consecuencia adicional: el
precedente que la ficha manda copiar —`classifyForeignKeyViolation` de
`lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`— **ya estaba muerto por lo
mismo**, así que `products` tampoco traduce el `P2003` de la presentación.

**Qué se hizo, sin inventar política:** el clasificador queda escrito **exactamente como pide el
diseño** —lee `field_name` y `constraint`, y empezaría a traducir solo si el conector alguna vez los
entregara—, probado en unitario con los nombres reales de restricción
(`tests/unit/proveedores/catalog-line-fk.test.ts`), y el test de integración afirma **lo que de
verdad ocurre hoy**: la base rechaza con `23503` y el adaptador **relanza el `P2003` crudo** en los
cuatro casos. Lo que **no** se hizo es traducir a ciegas —asumir que todo `P2003` de esa tabla es la
presentación—: le diría `invalid_input` al usuario cuando el fallo fuera del autor, que es la misma
mentira que `design.md > 6.2` prohíbe en el otro sentido.

**Las tres salidas, para el humano:** (a) aceptar el estado actual y reescribir el "hecho cuando" de
T13; (b) mover de versión de Prisma; (c) aceptar un pre-`SELECT` de existencia de presentación y
unidad, que reabre justo la dependencia que esta ficha viene a cortar y que `design.md > 6.2`
descarta con tres razones. **No se elige ninguna aquí.**

### 5.4 Desviaciones menores, todas escritas también donde se leen

- **`db:migrate:create` no corre en este entorno** (exige TTY al avisar de pérdida de datos). Se usó
  `prisma migrate diff`, mismo motor y mismo diff. Anotado en la cabecera del `migration.sql`.
- **`supplier_catalog_lines_product_id_fkey` sí lo generó Prisma**, al contrario de lo que preveía
  `design.md > 3.1`. Se conservó tal cual, explícito antes del `DROP COLUMN`.
- **Rechazo del nombre que normaliza a vacío**: T11 decía "va en el caso de uso, como en
  `create-supplier.ts`", pero el precedente real vive en el **esquema** (`supplierNameSchema`, con un
  `.refine`). Se siguió el precedente real: comportamiento observable idéntico
  (`ValidationError` y `invalid_input`), con test, y sin duplicarlo en dos casos de uso.
- **`qtyAlert` en el E2E**: quitada la línea de `product-field-cost`, el recorrido **seguía rojo**
  porque `qtyAlert` se renderiza con `required` (`product-field.tsx:105`) y el spec **nunca lo
  rellenaba**: la validación nativa del navegador bloqueaba el envío y la Server Action ni se
  llamaba. **Es un segundo fallo preexistente del E2E, distinto del de la línea 209.** Se añadió su
  `fill`, con el porqué escrito en el spec. Si se prefiere tratarlo como bug aparte, se revierte en
  una línea.
- **Pérdida de datos real en `products` del entorno de desarrollo**, inherente a la ficha y avisada
  por Prisma antes de aplicar: `cost` (1 valor no nulo), `delivery_time` (1) y `min_purchase` (6) se
  fueron con las columnas. El `down.sql` restaura las columnas pero **no** los valores, y así está
  escrito en su cabecera.
- **Esquema `public_shadow_qc52` creado y borrado**: una primera invocación de `prisma migrate diff`
  con `--shadow-database-url` mal formada dejó un esquema copia de 11 tablas en el Postgres de
  desarrollo. Se detectó en el censo y se borró con `DROP SCHEMA ... CASCADE`. La base quedó con
  `public` como único esquema y **ninguna fila de negocio tocada**.
- **`next dev` huérfano en el puerto 3000**: lo dejó un subagente durante la tanda de frontend y
  **impedía correr el E2E real** (Next 16 no permite un segundo dev server para el mismo directorio,
  ni siquiera en otro puerto). Se paró con `taskkill /PID 40184 /F`, que es lo que el propio Next
  indica en su mensaje, y el E2E se corrió después con el `webServer` de la config. **Ese proceso ya
  no está levantado**: si hacía falta, se vuelve a arrancar con `pnpm run dev`.

### 5.5 Lo que la ficha deja abierto a propósito, y no es deuda de la implementación

**P1** (quién sube la imagen, dónde se guarda y qué pasa al dar de baja una línea con imagen),
**P2** (el nombre de la línea y el del producto no se relacionan de ninguna manera) y **P3** (en qué
se mide el mínimo de compra) siguen abiertas por decisión de la spec. La columna `image_path` vale
`NULL` en toda fila y ningún requisito la lee.

---

## 6. Estado de `tasks.md`

**19 de 20 en `[x]`.** T19 es esta bitácora. T13 está marcada **`[x, CON SALVEDAD]`** con el detalle
de la sección 5.3 escrito en su propio bloque de `tasks.md`, para que no se lea como cerrada sin
más.

## 7. Qué tiene que decidir el humano antes del PR

1. **`identity-seed.int.test.ts`** (sección 5.1): limpiar la base de desarrollo o entrar al baseline.
   Mientras tanto `./init.sh` termina en rojo por un archivo que no es de esta feature.
2. **T13** (sección 5.3): cuál de las tres salidas.
3. **El `fill` de `qtyAlert` en el E2E** (sección 5.4): se queda o se saca a ficha propia.

---

# Apéndice A — F2.3: sincronización con `dev` y base de datos propia (2026-09-04)

Todo lo de arriba está commiteado como `5a22663`. Este apéndice cubre lo que vino después.

## A.1 El punto bloqueante 1 está cerrado, y no como yo proponía

`dev` avanzó mientras se implementaba y trae `b2ffa09 fix(gate): sanear el reset del seed de
identity y sembrar el baseline de rojos`, que **reescribe `resetIdentityToEmptyState`** para que lea
del catálogo de Postgres las tablas que dependen de `users` y las vacíe en orden antes de borrar
usuarios. **Mi diagnóstico de la causa era correcto** (sección 5.1: filas de negocio con autor y FK
`RESTRICT`); lo que no sabía es que la cura ya estaba escrita en otra sesión. **No hizo falta ni
tocar la base compartida ni aflojar el gate**, que eran las dos salidas que yo dejaba a decisión
humana.

Verificado tras el merge: `tests/integration` entero pasa **16 archivos / 221 tests**,
`identity-seed.int.test.ts` incluido. **El punto 1 de la sección 5.1 queda cerrado.**

## A.2 Merge de `origin/dev` — los dos conflictos

Commit del merge: **`624ced1`**. `dev` aportaba `b2ffa09` y
`a581782 fix(gate): acotar al esquema public las consultas a pg_constraint de 4 tests`.

**`tests/integration/inventario/presentation-uniqueness.int.test.ts` — conflicto de archivo
entero, y la causa no era semántica.** Comparando las tres versiones (`:1` base, `:2` mía, `:3`
`dev`) con `diff --strip-trailing-cr`, el diff real de QC-52 sobre ese archivo es **UNA línea**:
quitar `minPurchase: 0` del fixture de producto, que ya no existe en `Product`. El conflicto de 686
líneas lo provocó que un subagente reescribió el archivo con **CRLF**. Resolución: se toma la
versión de `dev` **intacta** —con sus dos JOIN a `pg_namespace`— y se le aplica esa única línea. El
archivo vuelve a quedar en LF.

**`tests/integration/proveedores/proveedores-constraints.int.test.ts` — conflicto pequeño (líneas
1330–1351).** Chocaban el comentario y la **proyección** del censo de FK. Gana la proyección de
QC-52 (`c.confdeltype AS regla`), porque es la que el `toEqual` de más abajo —parte común, no en
conflicto— necesita para afirmar la regla `ON DELETE` de cada FK; con la de `dev` el test no
compilaría su propia aserción. Y se conserva el comentario de `dev` que explica por qué el JOIN con
`pg_namespace` no es adorno. **El filtro por esquema ya estaba en las dos versiones**, así que ahí
no había nada que elegir.

**`tests/integration/unidades/unidades-constraints.int.test.ts` fusionó solo** y se comprobó a mano
que conserva las dos intenciones: el censo cerrado de **cuatro** FK hacia `units` de QC-52 y el
filtro por esquema de `dev`.

**Nada quedó ambiguo.** En los dos casos había un criterio objetivo —la línea real del diff en uno,
el `toEqual` que consume la proyección en el otro— y no hubo que elegir a ojo.

## A.3 Base de datos propia: `QuimiCloude_QC52`

Aplicar la migración de esta ficha a la base **compartida** rompió los tests de integración de la
sesión paralela de QC-34 con un `P2022` en cualquier lectura de `orders`. **Es culpa de esta
sesión.** QC-52 se pasa al patrón que ya siguieron QC-20, QC-25, QC-26 y QC-34:

- `CREATE DATABASE "QuimiCloude_QC52"` en el mismo servidor (`localhost:5432`).
- `DATABASE_URL` y `DIRECT_URL` del `.env` **de este worktree** apuntando ahí. **El `.env` del
  worktree principal no se tocó.**
- `prisma migrate deploy` — las 12 migraciones aplicadas, la de QC-52 incluida.
- `pnpm run db:seed` — `roles creados: 2 (Administrador, Operador) - usuario inicial: creado`.

**No se borró ni modificó ninguna fila de la base compartida**, cuyos datos hechos a mano se
conservan por decisión del humano.

### A.3.1 La trampa del `.env`, medida en vez de supuesta

El aviso recibido era que ni `init.sh` ni Vitest cargan el `.env`, y que sin
`set -a && . ./.env && set +a` delante el gate pegaría contra la compartida. **Lo comprobé, y en
este repo no es así.** Sonda temporal (`current_database()`) forzada a fallar para leer el nombre,
corrida **sin** sourcear nada:

```
Expected: "__FUERZO_EL_FALLO_PARA_VER_EL_NOMBRE__"
Received: "QuimiCloude_QC52"
```

El motivo: `vitest.config.mts` no carga `.env` —confirmado, no hay `dotenv` ni `loadEnvFile` en la
config ni en `tests/setup.ts`— pero **el cliente Prisma generado sí lee el `.env` de la raíz al
importarse**, y `lib/shared/db/prisma.ts` es la única instancia del proyecto. Por el lado del CLI,
`prisma.config.ts` llama a `process.loadEnvFile()` explícitamente, así que `db:migrate`, `db:seed` y
`db:rollback` también leen el archivo.

**Aun así, sourcear el `.env` es lo correcto y es lo que se hizo** en `migrate deploy` y en `db:seed`:
cuesta nada, deja la intención escrita y no depende de un comportamiento implícito del cliente
generado que puede cambiar de versión. En `process.env` gana la variable exportada, así que el
resultado es el mismo.

```bash
cd .worktrees/QC-52-separar-producto-de-catalogo-de-proveedor
set -a && . ./.env && set +a && ./init.sh
```

## A.4 Verificación después del merge y del cambio de base

```
> pnpm run typecheck
(sin salida)

> pnpm run lint
(sin salida)

> pnpm exec vitest related --run tests/integration/inventario/presentation-uniqueness.int.test.ts tests/integration/proveedores/proveedores-constraints.int.test.ts
 Test Files  2 passed (2)
      Tests  34 passed (34)

> pnpm exec vitest run tests/integration
 Test Files  16 passed (16)
      Tests  221 passed (221)
   Duration  13.30s
```

`./init.sh` completo **no se corrió**: lo corre el leader.

## A.5 Estado de los tres puntos que esperaban decisión humana

1. **`identity-seed.int.test.ts`** — **CERRADO** por `b2ffa09` de `dev` más la base propia (A.1).
2. **T13, `meta.field_name` en Prisma 6.19.3** (sección 5.3) — **sigue esperando**. Sin tocar.
3. **El `fill` de `qtyAlert` en el E2E** (sección 5.4) — **sigue esperando**. Sin tocar.

> **Aviso para quien corra el E2E:** `playwright.config.ts` levanta su propio `next dev` en el 3117,
> que leerá este `.env` y por tanto **la base `QuimiCloude_QC52`**, ya sembrada. Las corridas de la
> sección 4.2 se hicieron contra la compartida, antes del cambio.
