# QC-50 — aislamiento-por-empresa-en-recetas · tasks.md

> Checklist del implementer. Cada task dice **qué archivos toca**, de **qué depende** y cuál es su
> criterio de **hecho**. `[P]` = paralelizable con las otras `[P]` de su bloque.
> El mapa `R<n> -> test` completo está en `§ Trazabilidad`, al final, y se copia a
> `progress/impl_QC-50-aislamiento-por-empresa-en-recetas.md` (`CHECKPOINTS.md > Trazabilidad`).
>
> **Regla de comentarios de esta ficha** (`design.md > 13`): en el código de producción **no** se cita
> `QC-<n>`, `R<n>` ni `design.md`. El porqué se explica con sus propias palabras; la trazabilidad vive
> aquí y en los nombres de los tests.

## Bloque 0 — Base de datos

- [x] **T0 — Migración: columna, FK y paréntesis de RLS.**
  Archivos: `db/migrations/<ts>_recipes_company_scope/migration.sql` (nuevo),
  `db/schema.prisma` (`model Recipe`).
  Contenido: paréntesis `NO FORCE` / `FORCE` de RLS sobre `recipes` y `companies` (pasos 0 y 6 de
  `design.md > 7.1`); `company_id` anulable → backfill (T1, mismo archivo) → `SET NOT NULL` → FK a
  `companies` (`ON DELETE RESTRICT ON UPDATE CASCADE`). En el esquema: escalar **sin `@relation`**,
  **sin `@@unique`** y **sin `@@index` propio** (`design.md > 2.3`), y ampliación del `///` con el
  índice nuevo y el drift de la FK. **`recipe_lines` no se toca en ninguna sentencia.**
  Depende de: —.
  Hecho cuando: `pnpm run db:migrate` aplica sin error, `prisma generate` produce `companyId` y
  `pnpm run typecheck` señala exactamente los sitios que T5–T11 van a tocar.
  Cubre: R1, R2 (por ausencia), R5, R8.

- [x] **T1 — Backfill de las 5 recetas a «QuimiCloud».**
  Archivos: el mismo `migration.sql` de T0 (paso 2).
  Contenido: resolución por `name_normalized = 'quimicloud'` con el único fallback de «hay exactamente
  una empresa»; `RAISE EXCEPTION` en cualquier otro caso; `ROW_COUNT` contra el total de la tabla;
  **ningún `INSERT`, ningún `DELETE`**; incluye las filas con `deleted_at`.
  Depende de: T0 (mismo archivo, orden dentro de él).
  Hecho cuando: tras aplicar, las 5 recetas tienen la empresa de «QuimiCloud», siguen las 5 líneas, y
  `companies` conserva su recuento.
  Cubre: R3, R4.

- [x] **T2 — Relevo del índice único de nombre: global → por empresa, y sigue parcial.**
  Archivos: el mismo `migration.sql` (paso 5).
  Contenido: guardia `RAISE EXCEPTION` si dos recetas **vivas** de la misma empresa comparten
  `name_normalized`; `DROP INDEX "recipes_name_unique"`; `CREATE UNIQUE INDEX
  "recipes_company_name_unique" ON "recipes" ("company_id","name_normalized") WHERE "deleted_at" IS
  NULL`. **El `WHERE` no es opcional** (`design.md > 2.2`, alternativa D).
  Depende de: T0, T1.
  Hecho cuando: `pg_indexes` muestra el compuesto **con** su `WHERE`, el global ya no existe, y desde
  `psql` dos empresas pueden tener el mismo nombre y una empresa no puede tenerlo dos veces.
  Cubre: R9, R10.

- [x] **T3 — `down.sql` con sus tres guardias.**
  Archivos: `db/migrations/<ts>_recipes_company_scope/down.sql` (nuevo).
  Contenido, en este orden: paréntesis `NO FORCE` de RLS → **guardia 1** (empresa del UP ambigua) →
  **guardia 2** (fila de otra empresa) → **guardia 3** (dos recetas vivas de empresas distintas con el
  mismo nombre normalizado, con el recuento y qué hacer) → único por empresa fuera y **único global
  parcial restaurado** → FK fuera → columna fuera → `ENABLE` + `FORCE`. **Ningún `DELETE`.**
  Depende de: T0, T1, T2.
  Hecho cuando: `pnpm run db:rollback` deja el esquema idéntico al anterior (verificado contra
  `pg_indexes` e `information_schema` en el test de integración), no borra ninguna fila, deja
  `_prisma_migrations` coherente; y con dos empresas compartiendo nombre **aborta entero**.
  Cubre: R6, R7.

## Bloque 1 — Dominio y puertos

- [x] **T4 — `RecipeScope` y el actor con empresa.** `[P]` con T0
  Archivos: `lib/modules/recetas/domain/recipe-scope.ts` (nuevo),
  `lib/modules/recetas/domain/actor.ts`, `lib/modules/recetas/index.ts` (reexportar el tipo).
  Depende de: —.
  Hecho cuando: el barrel exporta `RecipeScope`, `actor.ts` declara `companyId`, y el barrel sigue
  siendo importable desde un componente de cliente (`guard-arquitectura-modulos` en verde).
  Cubre: R12 (parte), R14 (parte).

- [x] **T5 — El puerto y las tres costuras exigen el ámbito en su firma.**
  Archivos: `lib/modules/recetas/ports/recipe-repository.ts`,
  `lib/modules/recetas/domain/recipe-catalog.ts`,
  `lib/modules/inventario/domain/product-catalog.ts`,
  `lib/modules/unidades/domain/unit-catalog.ts`.
  Contenido: `scope: RecipeScope` **al final** de los cinco métodos de `RecipeRepository`;
  `findRefsIncludingDeleted(ids, companyId: string)`; `findRefs(ids, companyId: string)` en los dos
  catálogos. Docblocks que expliquen por qué está en la firma y por qué los catálogos reciben una
  cadena y no el tipo de ámbito del otro módulo (`design.md > 6`).
  Depende de: T4.
  Hecho cuando: `pnpm typecheck` falla en el adaptador de `recetas`, en sus cinco casos de uso, en los
  dos adaptadores de catálogo y en los cuatro casos de uso de `pedidos` —eso es la prueba de que el
  olvido en la **llamada** no compila— y queda verde al terminar T6–T11.
  Cubre: R14.

- [x] **T6 — Los cinco casos de uso pasan el ámbito.**
  Archivos: `lib/modules/recetas/domain/{create,get,list,update,delete}-recipe.ts`.
  Contenido: tras `requirePermission` (que sigue siendo la primera línea), construir
  `{ companyId: actor.companyId }` y pasarlo al repositorio; y `actor.companyId` a
  `products.findRefs` y `units.findRefs`. Ninguna condición de consulta aquí. Ningún cambio en el
  orden permiso → zod → puertos.
  Depende de: T5.
  Hecho cuando: los cinco compilan y ningún caso de uso menciona `company` dentro de un `where`.
  Cubre: R12, R16, R17, R18, R21, R23, R28.

## Bloque 2 — Persistencia y costuras

- [x] **T7 — El único punto de consulta.**
  Archivos: `lib/modules/recetas/adapters/driven/persistence/company-scope.ts` (nuevo).
  Contenido: `companyScope` privada + `recipeCompanyScope` (`Prisma.RecipeWhereInput`) y
  `companyScopeColumns`; docblock con las reglas de uso de `design.md > 4`, incluida la de las líneas
  y la nota de que **no hay ninguna excepción**.
  Depende de: T4.
  Hecho cuando: existe y su test afirma que las dos envolturas devuelven el mismo objeto.
  Cubre: R14.

- [x] **T8 — Adaptador driven de `recetas` acotado.**
  Archivos: `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`.
  Contenido: el ámbito compuesto en `buildRecipeWhere` —al lado de `deletedAt: null` y **nunca**
  fundido con la búsqueda ni con los filtros— y en el `where` de `findAliveRecipeById`, del
  `updateMany` de `replaceAliveRecipe` y del `updateMany` de `softDeleteAliveRecipe`; el `count` sigue
  usando **el mismo objeto** `where` que el `findMany`; `createRecipe` escribe `companyId` desde
  `companyScopeColumns`. **Las líneas no ganan ámbito propio**: el `deleteMany` y los `upsert` siguen
  filtrando por `recipeId` **dentro de la misma transacción**, después del `updateMany` acotado que ya
  devolvió `count > 0`.
  Depende de: T0, T5, T7.
  Hecho cuando: ninguna consulta ni escritura del archivo se ejecuta sin el ámbito, ninguna salida
  pública lleva `companyId`, y `isUniqueNameViolation` sigue reconociendo el duplicado con el
  `meta.target` del índice compuesto.
  Cubre: R11, R14, R15, R16, R17, R18, R19, R20.

- [x] **T9 — Costura con `inventario`: `findProductRefs` gana ámbito y muere la excepción.**
  Archivos: `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`;
  `lib/modules/inventario/adapters/driven/persistence/company-scope.ts` (borrar el párrafo de la
  excepción, `:28-33`); `tests/guards/guard-ambito-empresa-inventario.test.ts` (vaciar
  `SIN_AMBITO_POR_DECISION_APROBADA`, `:74`, y su comentario `:33` y `:65-74`).
  Contenido: la consulta compone **`productCompanyScope`**, el punto único que `inventario` ya exporta
  —no un `companyId` escrito a mano—, con `AND` contra `id: { in: ids }`.
  Depende de: T5.  `[P]` con T8, T10.
  Hecho cuando: la guardia de inventario pasa **sin** lista de excepciones, y ningún archivo del repo
  sigue anunciando que `findProductRefs` está sin ámbito.
  Cubre: R22.

- [x] **T10 — Costura con `unidades`: `findUnitRefs` gana ámbito «de la empresa o de sistema».**
  Archivos: `lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts`;
  `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts` (actualizar el docblock `:144-149`
  que anunciaba la excepción).
  Contenido: la consulta compone **`companyScopeWhere`** —la única definición del `OR` de QC-76—, con
  `AND` contra `id: { in: ids }`. **No se escribe un segundo `OR`.**
  Depende de: T5.  `[P]` con T8, T9.
  Hecho cuando: una unidad de sistema se resuelve para cualquier empresa, una de la empresa propia se
  resuelve y una de otra empresa **no vuelve**.
  Cubre: R23, R24.

- [x] **T11 — Costura con `pedidos`: el catálogo de recetas gana ámbito y se cierra el hueco de QC-60.**
  Archivos: `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts`;
  `lib/modules/pedidos/domain/{create-order,update-order,get-order,list-orders}.ts`.
  Contenido: la consulta compone `recipeCompanyScope` y **no** gana ningún filtro de vida —`isDeleted`
  sigue viajando en la referencia—. En `pedidos`, las cuatro llamadas pasan `actor.companyId`; **nada
  más cambia allí**: ni firmas públicas, ni errores, ni consultas propias.
  Depende de: T5, T7.
  Hecho cuando: crear o editar un pedido con una receta de otra empresa se rechaza con el error de
  receta inexistente que ya existe, y los tests de los cuatro casos de uso de `pedidos` siguen verdes
  sin cambiar de firma pública.
  Cubre: R25, R26.

- [x] **T12 — Server Actions con las dos caras de la sesión, dentro de `runInRequestScope`.**
  Archivos: `lib/modules/recetas/adapters/driving/recipe-actions.ts`.
  Contenido: `currentActor()` pide `getSessionUser()` **y** `getSessionContext()` en un `Promise.all`
  envuelto en `runInRequestScope` —y **solo** ese `Promise.all`—, y devuelve `null` si falta
  cualquiera; las **cinco** firmas públicas no cambian.
  Depende de: T4.  `[P]` con T8.
  Hecho cuando: sin contexto de sesión ninguna action toca el repositorio, y los tests existentes de
  las actions siguen verdes sin cambiar de firma pública.
  Cubre: R13, R32.

- [x] **T13 — Cableado.**
  Archivos: `lib/composition/index.ts` (`productCatalog`, `unitCatalog`, `recipeRepository`,
  `recipeCatalog`).
  Contenido: solo los tipos de las funciones cambian; **no se reordena ni se reformatea nada** del
  archivo, mismo criterio que QC-60.
  Depende de: T8, T9, T10, T11.
  Hecho cuando: `pnpm typecheck` queda verde en todo el repo.
  Cubre: R14 (parte).

## Bloque 3 — Las listas cerradas (una task cada una, a propósito)

- [x] **T14 — `PRE_EXISTING_INDEXES` y el caso del relevo.** `[P]`
  Archivos: `tests/integration/inventario/list-query-indexes.int.test.ts`.
  Contenido: sacar `'recipes_name_unique'` (`:174`) **dejando en su sitio el comentario de relevo**,
  con el mismo formato que los de QC-49 (`:156-164`) y QC-76 (`:165-173`); y añadir un caso que afirme
  que `recipes_company_name_unique` existe, es `UNIQUE`, lleva `company_id` de cabeza y **es parcial
  por `deleted_at IS NULL`** —calcado del caso de presentaciones (`:296-302`)—.
  Depende de: T2.
  Hecho cuando: el archivo pasa, y borrar el `WHERE` de la migración lo pone rojo.
  Cubre: R9, R10 (parte).

- [x] **T15 — `MIGRACIONES_ESPERADAS` de la guardia de QC-71.** `[P]`
  Archivos: `tests/guards/guard-identificador-de-request.test.ts` (`:151-158`).
  Contenido: añadir el nombre de la migración de esta ficha con su motivo, con el mismo patrón que
  `20260915120000_orders_company_scope`.
  Depende de: T0.
  Cubre: el gate; sin esto la guardia da rojo.

- [x] **T16 — `E2E_ESPERADOS` de la guardia de QC-71.** `[P]`
  Archivos: `tests/guards/guard-identificador-de-request.test.ts` (`:57-94`).
  Contenido: añadir `'aislamiento-recetas.spec.ts'` con su comentario, con el mismo patrón que
  `aislamiento-pedidos.spec.ts` (`:59-67`), diciendo qué recorrido ejercita y que **no** ejercita el
  cruce del identificador de petición, de modo que el diferimiento de QC-71 R21 siga intacto.
  Depende de: T20.
  Cubre: el gate.

- [x] **T17 — `EXPECTED_RECIPE_FIELDS` del alcance de recetas.** `[P]`
  Archivos: `tests/unit/recetas/scope.test.ts` (`:331-347`).
  Contenido: añadir `companyId` en la posición que ocupe en el modelo, con un comentario que explique
  que la columna entra por esta ficha. `EXPECTED_RECIPE_LINE_FIELDS` **no cambia**, y eso es una
  aserción útil: es la prueba en el gate de que la decisión 2 se respetó.
  Depende de: T0.
  Cubre: R2 (por ausencia de cambio en las líneas).

- [x] **T18 — El censo de E2E de recetas, que es la lista que QC-60 no tuvo que mirar.** `[P]`
  Archivos: `tests/unit/recetas/scope.test.ts` (`:200-203`), y
  `tests/integration/aislamiento.json`.
  Contenido: (a) el `toEqual` cerrado de specs de recetas pasa de dos a **tres** literales —
  `aislamiento-recetas.spec.ts` casa con `/recet|recipe/i` y lo rompe—, en el orden que devuelve
  `readdirSync`, con su comentario de por qué entra y por qué la lista **sigue siendo cerrada**.
  (b) declarar los archivos nuevos de `tests/integration/recetas/**` con su forma de aislamiento.
  Depende de: T20, T22.
  Hecho cuando: `guard-aislamiento-integracion` pasa y el censo de specs es exacto.
  Cubre: el gate.

- [x] **T19 — `ACCIONES` de QC-104.** `[P]`
  Archivos: `tests/unit/identity/session-once-per-request-actions.test.ts` (`:156`).
  Contenido: añadir la fila de `lib/modules/recetas/adapters/driving/recipe-actions.ts` con una acción
  cuya entrada llegue hasta `currentActor()` (p. ej. `listRecipesAction({ page: 1 })`). Los dos casos
  que leen el árbol lo exigen en cuanto T12 esté hecha; no se espera al gate para descubrirlo.
  Depende de: T12.
  Cubre: R13.

## Bloque 4 — Pruebas

- [x] **T20 — E2E de aislamiento.** **(E2E — Playwright)**
  Archivos: `e2e/aislamiento-recetas.spec.ts` (nuevo), con el patrón de
  `e2e/aislamiento-inventario.spec.ts` y `e2e/aislamiento-pedidos.spec.ts`: fixture propio, prefijo por
  worker, limpieza defensiva, **una sola sesión real** (la de A) y los datos de B sembrados con Prisma;
  el aterrizaje del login sale del helper único de QC-93, nunca de una ruta escrita a mano.
  Contenido: login por la UI como usuario de A; la pantalla de recetas no contiene la receta de B
  (aserción sobre el HTML servido); **se navega a la URL del detalle de una receta de B**
  (`/produccion/formulas/<id ajeno>`) y se afirma que no se ve —sale el estado `recipe-not-found`, el
  formulario de edición no se pinta y el nombre de la receta de B no aparece en el HTML—, que el
  resultado es **idéntico** al de un identificador inexistente, y se comprueba con Prisma que la
  receta de B sigue con `deleted_at` nulo; y un alta en A con el **mismo nombre** que la receta de B
  se completa sin error.

  > **Enmienda — 2026-09-16, decisión humana.** Este paso decía «se abre el diálogo de borrado de una
  > receta **propia** y se sustituye por DOM el identificador por el de la receta **de B**». Eso es
  > **imposible** en esta UI y por eso se cambió: el diálogo de recetas pasa `recipe.id` desde el
  > **cierre de React** (`delete-recipe-dialog.tsx:58`), no desde un **campo oculto** como los de
  > QC-49 y QC-60 (`delete-product-dialog.tsx:106`, `delete-order-dialog.tsx:128`), así que no hay
  > ningún nodo del DOM que reescribir. Añadírselo habría sido tocar un componente, que
  > `design.md > 14` prohíbe. El detalle del porqué, en `design.md > 8.2`.
  Depende de: T8, T12.
  Hecho cuando: pasa en Chromium **y** en WebKit, y el fixture deja la base como la encontró.
  Cubre: R31, y ejercita R10, R15, R16, R17 de extremo a extremo.

- [x] **T21 — Test de esquema y de texto de la migración.** `[P]`
  Archivos: `tests/unit/recetas/schema/recipes-company-scope-migration.test.ts` (nuevo).
  Contenido: el UP declara la columna, la FK, el paréntesis de RLS y el relevo del único **con su
  `WHERE`**; **no contiene ningún `DELETE` ni `INSERT`**, **ninguna sentencia sobre `recipe_lines`** y
  **ningún `DROP CONSTRAINT` de más**; el `down.sql` abre con sus tres guardias y restaura el único
  global parcial; identificadores en inglés; el `CHECK` y las FK previas siguen escritos; la migración
  no toca `orders`, `products`, `units` ni `companies` más allá del paréntesis de RLS y la lectura del
  backfill.
  Depende de: T3.
  Cubre: R4 (parte), R5, R6, R8, R32 (parte).

- [x] **T22 — Integración: restricciones, unicidad, backfill y reversión.** `[P]`
  Archivos: `tests/integration/recetas/company-scope.int.test.ts` (nuevo).
  Contenido: `INSERT` de receta sin empresa y con empresa inexistente → rechazo; dos recetas vivas de
  empresas **distintas** con el mismo nombre → se aceptan; dos de la **misma** → `23505`; borrar
  lógicamente una **libera** el nombre para esa empresa; una línea sigue cayendo con su receta
  (`CASCADE`) y `recipe_lines` **no tiene** columna de empresa; el backfill; la reversión abortada por
  fila de otra empresa y por nombre compartido; una empresa marcada como borrada conserva sus recetas y
  sus líneas.
  Depende de: T3.
  Cubre: R1, R2, R3, R4, R7, R10, R29.

- [x] **T23 — Integración: listado, escrituras y costuras.** `[P]`
  Archivos: `tests/integration/recetas/company-scope-queries.int.test.ts` (nuevo).
  Contenido: con recetas de dos empresas sembradas, el listado devuelve solo las suyas **y el `total`
  también**; la búsqueda y los filtros **no ensanchan** lo visible; `findAliveById`, `replaceAlive` y
  `softDeleteAlive` con un id ajeno devuelven «no existe» y **dejan la fila ajena intacta, líneas
  incluidas**; el alta escribe la empresa del ámbito; `findProductRefs`, `findUnitRefs` (sistema, propia
  y ajena) y `findRefsIncludingDeleted` acotados, con su control positivo y con la baja lógica que
  sigue viajando en la referencia; el duplicado de nombre llega al adaptador como `'duplicate'` con el
  `meta.target` real del índice compuesto; quitar `FORCE ROW LEVEL SECURITY` no cambia ningún resultado.
  Depende de: T8, T9, T10, T11.
  Cubre: R11, R15, R16, R17, R18, R20, R22, R24, R25, R30.

- [x] **T24 — Guardia estática por función.** `[P]`
  Archivos: `tests/guards/guard-ambito-empresa-recetas.test.ts` (nuevo), calcado de
  `guard-ambito-empresa-pedidos.test.ts`.
  Contenido: **método a método** de `RecipeRepository` y de `RecipeCatalog`, y función a función de todo
  `recetas/adapters/driven/persistence/`, que la implementación declara el ámbito y que ese valor llega
  hasta una envoltura de `./company-scope`; y que ninguna consulta a `prisma.recipeLine` se ejecuta
  fuera de la transacción que ya verificó la receta. **Sin lista de excepciones.**
  Depende de: T7, T8.
  Cubre: R14.

- [x] **T25 — Service: el rechazo cruzado, con dobles.** `[P]`
  Archivos: `tests/unit/recetas/company-isolation-service.test.ts` (nuevo);
  `tests/unit/recetas/company-scope.test.ts` (nuevo: las dos envolturas y la forma de la salida
  pública); `tests/unit/recetas/authorization.test.ts` y `.../recipe-actions.test.ts` (se amplían).
  Contenido: los cinco casos de uso reciben el ámbito **del actor** y no de la entrada; ficha / edición
  / borrado de una receta ajena → error de receta inexistente y **nunca** `UnauthorizedError`; el
  permiso se exige **antes** del ámbito (actor sin permiso y de otra empresa → error de autorización
  sin tocar ningún puerto); un producto ajeno y una unidad ajena → entrada inválida, sin escribir nada;
  una `companyId` en la entrada se descarta y la fila se escribe con la empresa del actor; falta el
  contexto de sesión → la action no llama al caso de uso; ninguna salida pública lleva `companyId`.
  Depende de: T6, T12.
  Cubre: R12, R13, R18, R19, R21, R23, R28.

- [x] **T26 — Que las fotos no se movieron.** `[P]`
  Archivos: `tests/unit/recetas/recipe-image-scope.test.ts` (nuevo) o ampliación del test de imagen ya
  existente.
  Contenido: la ruta que compone el adaptador de almacenamiento **no** contiene el identificador de
  empresa, la URL se sigue obteniendo con `getPublicUrl` y ninguna firma del puerto de almacenamiento
  gana la empresa.
  Depende de: —.  `[P]` con todo el bloque.
  Cubre: R27.

## Bloque 5 — Cierre

- [x] **T27 — Documentación de la deuda saldada.**
  Archivos: `docs/architecture.md > Dominio` (quitar `recetas` de la lista de deuda registrada, si
  figura, dejando el resto intacto); `db/schema.prisma` (`///` de `Recipe` y de `RecipeLine`: el índice
  único es por empresa, la FK nueva es drift, y la línea **no** lleva empresa a propósito);
  `progress/impl_QC-50-…​.md` con el mapa `R<n> -> test`.
  Depende de: T20.
  Hecho cuando: ninguna viñeta de deuda nombra recetas y el mapa de trazabilidad está escrito.
  Cubre: el checkpoint de trazabilidad de `CHECKPOINTS.md`.

- [ ] **T28 — Gate completo.**
  `./init.sh` en verde (no `--rapido`: es lo que exige cerrar la feature y todo PR).
  Depende de: T27.
  Hecho cuando: typecheck, lint, unit, integración, guardias y E2E pasan; en particular
  `guard-rls-force`, `guard-arquitectura-modulos`, `guard-dependencias-aprobadas`,
  `guard-aislamiento-integracion`, `guard-identificador-de-request`, `guard-e2e-landing`,
  `guard-ambito-empresa-inventario` (ya **sin** excepciones) y la guardia del catálogo de errores.
  Cubre: R32, R33 (por ausencia: `ERROR_CODES` no crece, ninguna empresa se borra, `package.json` no se
  toca).

## Trazabilidad — `R<n> -> test`

| R | Test | Nivel |
| --- | --- | --- |
| R1 | `tests/integration/recetas/company-scope.int.test.ts` | integración |
| R2 | `tests/unit/recetas/scope.test.ts` (`EXPECTED_RECIPE_LINE_FIELDS` intacta) + `company-scope.int.test.ts` (la línea no tiene columna de empresa y cae con su receta) | unit + integración |
| R3 | `tests/integration/recetas/company-scope.int.test.ts` (backfill) | integración |
| R4 | `company-scope.int.test.ts` (recuentos) + test de esquema de T21 | integración + unit |
| R5 | `tests/guards/guard-rls-force.test.ts` + test de esquema de T21 | guardia + unit |
| R6 | test de esquema de T21 + `company-scope.int.test.ts` (reversión) | unit + integración |
| R7 | `company-scope.int.test.ts` (las dos reversiones abortadas) | integración |
| R8 | test de esquema de T21 | unit |
| R9 | `tests/integration/inventario/list-query-indexes.int.test.ts` (el único lleva `company_id` de cabeza) | integración |
| R10 | `list-query-indexes.int.test.ts` (es parcial) + `company-scope.int.test.ts` (dos empresas sí, una dos veces no, el borrado libera) | integración |
| R11 | `tests/integration/recetas/company-scope-queries.int.test.ts` (`meta.target` real → `'duplicate'`, y el único de línea nunca) | integración |
| R12 | `tests/unit/recetas/company-isolation-service.test.ts` | unit |
| R13 | `tests/unit/recetas/recipe-actions.test.ts` + `tests/unit/identity/session-once-per-request-actions.test.ts` | unit |
| R14 | `tests/guards/guard-ambito-empresa-recetas.test.ts` + `tests/unit/recetas/company-scope.test.ts` + `company-scope-queries.int.test.ts` | guardia + unit + integración |
| R15 | `tests/integration/recetas/company-scope-queries.int.test.ts` | integración |
| R16 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R17 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R18 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R19 | `tests/unit/recetas/company-scope.test.ts` (forma de la salida pública) | unit |
| R20 | `tests/integration/recetas/company-scope-queries.int.test.ts` (edición ajena: ninguna línea tocada) | integración |
| R21 | `tests/unit/recetas/company-isolation-service.test.ts` (producto ajeno → entrada inválida) | unit |
| R22 | `company-scope-queries.int.test.ts` + `tests/guards/guard-ambito-empresa-inventario.test.ts` (sin excepciones) | integración + guardia |
| R23 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` (sistema sí, propia sí, ajena no) | unit + integración |
| R24 | `company-scope-queries.int.test.ts` + `tests/unit/unidades/unit-catalog.test.ts` (se amplía: reutiliza `companyScopeWhere`) | integración + unit |
| R25 | `company-scope-queries.int.test.ts` (catálogo acotado, `isDeleted` intacto) | integración |
| R26 | `tests/unit/pedidos/create-order.test.ts` y `update-order.test.ts` (se amplían: receta ajena → receta inexistente) | unit |
| R27 | `tests/unit/recetas/recipe-image-scope.test.ts` | unit |
| R28 | `tests/unit/recetas/authorization.test.ts` (se amplía) + `company-isolation-service.test.ts` | unit |
| R29 | `tests/integration/recetas/company-scope.int.test.ts` (empresa de baja) | integración |
| R30 | `company-scope-queries.int.test.ts` (sin `FORCE`, mismo resultado) | integración |
| **R31** | **`e2e/aislamiento-recetas.spec.ts`** | **E2E** |
| R32 | test de esquema de T21 (la migración no toca otras tablas) + `tests/unit/recetas/recipe-actions.test.ts` y `list-recipes.test.ts` (firmas y forma de salida intactas) | unit |
| R33 | `tests/guards/guard-dependencias-aprobadas.test.ts` | guardia |

**E2E**: solo **T20 / R31**. Todo lo demás es unit, integración o guardia.
