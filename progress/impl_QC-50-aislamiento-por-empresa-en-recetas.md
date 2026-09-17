# QC-50 — aislamiento-por-empresa-en-recetas · bitácora de implementación

> Escrita por el **implementer**. Rama `feature/QC-50-aislamiento-por-empresa-en-recetas`,
> worktree `.worktrees/QC-50-aislamiento-por-empresa-en-recetas/`.
> Spec aprobado por el humano en F1.4 (2026-09-16). Base: merge `4a9258a` con `origin/dev`.

## Estado

**28 de las 29 tasks cerradas. Los 33 requisitos con test.** La que falta es **T28, el gate
completo (`./init.sh`), que corre el leader**: aquí no se da por hecha porque no la he ejecutado.

T20 estuvo bloqueada y se desbloqueó por **decisión humana del 2026-09-16**: el acceso cruzado se
prueba **por la URL del detalle**, no por DOM. Ver `## T20: por qué el molde no servía`.

## T20: por qué el molde no servía, y qué se hace en su lugar

`tasks.md` T20 y `design.md > 8.2` prescribían «se abre el diálogo de borrado de una receta
**propia** y **se sustituye por DOM** el identificador por el de la receta de B». **Ese gesto no
existe en esta UI**:

- QC-49 y QC-60 funcionan porque su diálogo lleva un **campo oculto** con el id, que viaja en el
  `FormData` (`delete-product-dialog.tsx:106`, `delete-order-dialog.tsx:128`): reescribir ese nodo
  cambia de verdad lo que recibe el servidor.
- `delete-recipe-dialog.tsx:58` hace `await deleteRecipeAction(recipe.id)` con el id tomado del
  **cierre de React**. **No hay ningún nodo del DOM que reescribir.** Añadírselo habría sido tocar
  un componente, que `design.md > 14` prohíbe.

**Lo que se hace en su lugar** (decisión humana, 2026-09-16): con sesión en A, **navegar a
`/produccion/formulas/<id de una receta de B>`**. No es un apaño: pegar un enlace que alguien te
pasó es un gesto real, y **cierra también la escritura**, porque `EditarRecetaPage` es el único
sitio que monta `RecipeForm` en modo edición con datos precargados —si `getRecipeAction` no acotara
por empresa, ahí se pintaría el formulario de B relleno y listo para enviar—.

Se enmendaron, con fecha y motivo, `design.md > 8.2` y T20 de `tasks.md`. **Ningún punto del spec
sigue afirmando que se sustituye el identificador por DOM.**

### El id ajeno se comporta EXACTAMENTE igual que el inexistente

Verificado primero en el código y después **empíricamente** en el E2E. `get-recipe.ts:35-36` hace
`findAliveById(id, scope)` —ya acotado— y, si devuelve `null`, lanza `RecipeNotFoundError`: el
mismo error, para el ajeno y para el inexistente. La página lo traduce a `recipe_not_found` y pinta
el estado `recipe-not-found`, **sin** `notFound()` ni redirección. El E2E compara los dos casos y
afirma que **el texto del mensaje y el `href` del enlace son literalmente iguales**.

Eso es lo que prueba que **no hay oráculo de existencia**: sondear identificadores no le enseña a
una empresa qué recetas tienen las demás. No hubo hallazgo que reportar.

## Archivos creados

**Base de datos**
- `db/migrations/20260916120000_recipes_company_scope/migration.sql`
- `db/migrations/20260916120000_recipes_company_scope/down.sql`

**Producción**
- `lib/modules/recetas/domain/recipe-scope.ts`
- `lib/modules/recetas/adapters/driven/persistence/company-scope.ts`

**Tests**
- `tests/guards/guard-ambito-empresa-recetas.test.ts`
- `tests/unit/recetas/schema/recipes-company-scope-migration.test.ts`
- `tests/unit/recetas/company-isolation-service.test.ts`
- `tests/unit/recetas/company-scope.test.ts`
- `tests/unit/recetas/recipe-image-scope.test.ts`
- `tests/unit/pedidos/create-order.test.ts`
- `tests/unit/pedidos/update-order.test.ts`
- `tests/integration/recetas/company-scope.int.test.ts`
- `tests/integration/recetas/company-scope-queries.int.test.ts`
- `e2e/aislamiento-recetas.spec.ts`

## Archivos modificados

**Esquema** — `db/schema.prisma`: `Recipe` gana `companyId String @map("company_id") @db.Uuid`,
**sin `@relation`**, **sin `@@unique`**, **sin `@@index`** propio; `///` ampliados en `Recipe` y
`RecipeLine`. `RecipeLine` **no cambia ningún campo**, a propósito.

**Dominio y puertos** — `recetas/domain/actor.ts` (gana `companyId`), `recetas/index.ts`,
`recetas/ports/recipe-repository.ts` (los cinco métodos ganan `scope: RecipeScope` al final),
`recetas/domain/recipe-catalog.ts`, `inventario/domain/product-catalog.ts`,
`unidades/domain/unit-catalog.ts` (los tres catálogos ganan `companyId: string`), y los cinco
casos de uso `recetas/domain/{create,get,list,update,delete}-recipe.ts`.

**Adaptadores** — `recetas/adapters/driven/persistence/recipe-prisma.ts`,
`recipe-catalog-prisma.ts`, `recetas/adapters/driving/recipe-actions.ts`,
`inventario/adapters/driven/persistence/product-catalog-prisma.ts` y su `company-scope.ts`,
`unidades/adapters/driven/persistence/unit-catalog-prisma.ts` y `unit-prisma.ts`.

**Llamantes en `pedidos`** — `domain/{create-order,update-order,get-order,list-orders}.ts`:
las cuatro llamadas pasan `actor.companyId`. Nada más cambia allí.

**Cableado** — `lib/composition/index.ts` **no necesitó edición**: las funciones ya tipan contra
las interfaces nuevas. T13 se da por cumplida por su criterio: typecheck verde en todo el repo.

**Fixtures de tests reparados** (la columna es `NOT NULL` y el puerto ganó un parámetro): 23
archivos de `tests/integration/**` y `e2e/**`, y 10 de `tests/unit/**`. Varios `afterAll`
borraban la empresa **antes** que la receta que ahora la referencia (`recipes_company_id_fkey`
es `RESTRICT`): se reordenó la limpieza en 5 de ellos.

## Las listas cerradas: el spec nombraba seis, eran **trece**

`design.md > 0.6` avisa de cinco, más la de QC-104. Al correr la verificación aparecieron
**siete más** que el spec no anticipó. Todas se **tensaron** —alta a mano, con motivo escrito—;
**ninguna se relajó**, no se convirtió ningún `toEqual` en `toContain` y no nació ninguna lista
de excepciones.

| # | Lista | Archivo | Alta |
| --- | --- | --- | --- |
| 1 | `PRE_EXISTING_INDEXES` | `tests/integration/inventario/list-query-indexes.int.test.ts` | sale `recipes_name_unique` con su comentario de relevo; entra un caso que afirma el compuesto **y su parcialidad** |
| 2 | `MIGRACIONES_ESPERADAS` | `tests/guards/guard-identificador-de-request.test.ts` | `20260916120000_recipes_company_scope` |
| 3 | `EXPECTED_RECIPE_FIELDS` | `tests/unit/recetas/scope.test.ts` | `companyId`; `EXPECTED_RECIPE_LINE_FIELDS` **intacta**, y eso es la aserción que prueba la decisión 2 |
| 4 | `ACCIONES` (QC-104) | `tests/unit/identity/session-once-per-request-actions.test.ts` | `recipe-actions.ts` / `listRecipesAction` |
| 5 | censo de aislamiento | `tests/integration/aislamiento.json` | `company-scope.int.test.ts` (`transaccion`) y `company-scope-queries.int.test.ts` (**`commit`**, con motivo y fecha) |
| 6 | **censo de FK sin `@relation`** | `tests/integration/recetas/recetas-constraints.int.test.ts` | `recipes_company_id_fkey` hacia `companies` |
| 7 | **`RECIPE_COLUMNS`** | `tests/unit/recetas/schema/recetas-schema.test.ts` | `companyId` |
| 8 | **modelos con `companyId` permitido** | `tests/unit/inventario/scope.test.ts` | `Recipe` (y `RecipeLine` **sigue vetada**, a propósito) |
| 9 | **dueños de `@prisma/client` en `recetas`** | `tests/unit/recetas/module-contract.test.ts` | **RETENSADO**: de uno a dos archivos, nombrados uno a uno (`company-scope.ts` tipa `Prisma.RecipeWhereInput`). Precedente literal: QC-60 hizo lo mismo en `tests/unit/pedidos/module-contract.test.ts:467` |
| 10 | aserción de la costura | `tests/unit/pedidos/order-service.test.ts` | exige **los dos** argumentos, el segundo `ADMIN.companyId`: más estricta, no menos |
| 11 | **`AMPLIACIONES_APROBADAS`** (contrato por diff) | `tests/unit/recetas/module-contract.test.ts` | `recipe-scope.ts`, `company-scope.ts` y `recipe-repository.ts`, uno a uno |
| 12 | **`RECETAS_PERMITIDAS`** (contrato por diff) | `tests/unit/recetas-ui/recipe-route-contract.test.ts` | los mismos tres |
| 13 | **`DB_PERMITIDAS`** | `tests/unit/recetas-ui/recipe-route-contract.test.ts` | los dos archivos de la migración |

**Las tres últimas (11, 12, 13) tienen una trampa propia: comparan el DIFF contra `origin/dev`, así
que con los cambios sin commitear pasan en VERDE y solo muerden una vez hay commit.** Aparecieron
justo después del primer commit de la ficha, no antes. Queda escrito en su comentario para quien
venga detrás.

**La lista 6 es la que más cerca estuvo de pasar desapercibida**: solo la vio la corrida de
integración, y es exactamente del tipo que `design.md > 2.1` anuncia como drift deliberado. Las
**11-13** habrían emboscado al gate completo por el mismo motivo que a QC-60: no se ven hasta que
hay commit.

## La excepción que muere

`SIN_AMBITO_POR_DECISION_APROBADA` de `tests/guards/guard-ambito-empresa-inventario.test.ts`
queda **vacía**: `findProductRefs` ya exige la empresa y compone `productCompanyScope`. Se
borraron los tres párrafos que anunciaban la excepción (`product-catalog-prisma.ts`,
`inventario/.../company-scope.ts`, `unidades/.../unit-prisma.ts`). **Ningún archivo del repo
sigue diciendo que esa costura está sin ámbito.** Esta ficha **no crea ninguna excepción nueva.**

Y se **borró la maquinaria entera**: la constante, la rama que la comprobaba y el párrafo que
justificaba conservarla vacía. Con la lista vacía esa rama era **código muerto** —no se ejecutaba
nunca— y `docs/architecture.md` es explícito: «**No se prepara infraestructura "por si acaso"**».
Es **tensar, no relajar**: antes existía una puerta, aunque estuviera cerrada; ahora **no existe la
puerta**, y ninguna función sin ámbito tiene por dónde escaparse. Comprobado en vivo quitando el
`scope: InventoryScope` de una función real: la guardia se pone roja en sus dos describes, y `lib/`
quedó intacto byte a byte tras deshacerlo.

## El punto que más vigilancia pedía

El índice único del nombre es **PARCIAL** (`WHERE "deleted_at" IS NULL`), a diferencia del de
presentaciones que QC-49 usó de molde, que era **total**. Si se perdiera el `WHERE`, borrar una
receta dejaría su nombre ocupado para siempre **y ningún test lo diría**. Está afirmado en
**tres** sitios independientes, y los tres se comprobaron **falsables**:

- `recipes-company-scope-migration.test.ts` — sobre el texto del SQL, con el `WHERE` mutado en
  memoria: predicado verdadero con el archivo real, falso sin el `WHERE`.
- `list-query-indexes.int.test.ts` — contra `pg_indexes`, exigiendo el predicado
  `WHERE (deleted_at IS NULL)`, no un `WHERE` genérico. Falsabilidad comprobada con dos índices
  scratch, uno total y otro parcial.
- `company-scope.int.test.ts` — el comportamiento: dar de baja **libera** el nombre para su
  empresa.

## Mapa `R<n> -> test`

| R | Test | Nivel | Estado |
| --- | --- | --- | --- |
| R1 | `tests/integration/recetas/company-scope.int.test.ts` (sin empresa 23502; empresa inexistente 23503) | integración | verde |
| R2 | `tests/unit/recetas/scope.test.ts` (`EXPECTED_RECIPE_LINE_FIELDS` intacta) + `company-scope.int.test.ts` (no hay columna de empresa en `recipe_lines`; la línea cae con su receta) | unit + integración | verde |
| R3 | `company-scope.int.test.ts` (backfill, incluidas las de borrado lógico) | integración | verde |
| R4 | `company-scope.int.test.ts` (recuentos antes/después) + `recipes-company-scope-migration.test.ts` | integración + unit | verde |
| R5 | `tests/guards/guard-rls-force.test.ts` + `recipes-company-scope-migration.test.ts` | guardia + unit | verde |
| R6 | `recipes-company-scope-migration.test.ts` + `company-scope.int.test.ts` (reversión) | unit + integración | verde |
| R7 | `company-scope.int.test.ts` (las dos reversiones abortadas, **más** un control de que el aborto no es un placebo) | integración | verde |
| R8 | `recipes-company-scope-migration.test.ts` (identificadores en inglés, marcas de tiempo, régimen de borrado) | unit | verde |
| R9 | `list-query-indexes.int.test.ts` (`company_id` de cabeza) | integración | verde |
| R10 | `list-query-indexes.int.test.ts` (es parcial) + `company-scope.int.test.ts` (dos empresas sí; una dos veces no; el borrado **libera**) | integración | verde |
| R11 | `company-scope-queries.int.test.ts` (`meta.target` real `company_id,name_normalized`; el único de línea **nunca** se traduce) | integración | verde |
| R12 | `tests/unit/recetas/company-isolation-service.test.ts` | unit | verde |
| R13 | `tests/unit/recetas/recipe-actions.test.ts` + `tests/unit/identity/session-once-per-request-actions.test.ts` | unit | verde |
| R14 | `tests/guards/guard-ambito-empresa-recetas.test.ts` + `tests/unit/recetas/company-scope.test.ts` + `company-scope-queries.int.test.ts` | guardia + unit + integración | verde |
| R15 | `company-scope-queries.int.test.ts` (listado y `total`; búsqueda y filtros no ensanchan) | integración | verde |
| R16 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración | verde |
| R17 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración | verde |
| R18 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración | verde |
| R19 | `tests/unit/recetas/company-scope.test.ts` (forma de la salida pública) | unit | verde |
| R20 | `company-scope-queries.int.test.ts` (edición ajena: ninguna línea tocada) | integración | verde |
| R21 | `company-isolation-service.test.ts` (producto ajeno, entrada inválida, alta y edición) | unit | verde |
| R22 | `company-scope-queries.int.test.ts` + `tests/unit/inventario/product-catalog.test.ts` (reescrito) + `tests/guards/guard-ambito-empresa-inventario.test.ts` (**sin excepciones**) | integración + unit + guardia | verde |
| R23 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` (sistema sí, propia sí, ajena no) | unit + integración | verde |
| R24 | `company-scope-queries.int.test.ts` + `tests/unit/unidades/unit-catalog.test.ts` (reutiliza `companyScopeWhere`, **un solo `OR`**) | integración + unit | verde |
| R25 | `company-scope-queries.int.test.ts` (catálogo acotado, `isDeleted` intacto) | integración | verde |
| R26 | `tests/unit/pedidos/create-order.test.ts` y `update-order.test.ts` (receta ajena, receta inexistente) + `order-service.test.ts` | unit | verde |
| R27 | `tests/unit/recetas/recipe-image-scope.test.ts` | unit | verde |
| R28 | `tests/unit/recetas/authorization.test.ts` + `company-isolation-service.test.ts` (dobles **explosivos**: el permiso se exige antes de tocar ningún puerto) | unit | verde |
| R29 | `company-scope.int.test.ts` (empresa de baja conserva recetas y líneas) | integración | verde |
| R30 | `company-scope-queries.int.test.ts` (sin `FORCE`, mismo retrato) | integración | verde |
| **R31** | **`e2e/aislamiento-recetas.spec.ts`** (listado sin la receta ajena; URL del detalle ajeno indistinguible del id inexistente; la receta de B intacta; alta con el mismo nombre en A sin error) | **E2E** | **verde en Chromium y WebKit** |
| R32 | `recipes-company-scope-migration.test.ts` (la migración no toca otras tablas) + `recipe-actions.test.ts` y `list-recipes.test.ts` (firmas y forma de salida intactas) | unit | verde |
| R33 | `tests/guards/guard-dependencias-aprobadas.test.ts` (`package.json` y `pnpm-lock.yaml` sin tocar) | guardia | verde |

**33/33 con test.**

## Verificación ejecutada

El gate lo corre el leader (`./init.sh --rapido` por tanda, `./init.sh` completo antes del PR).
Aquí solo lo que la regla del gate deja al implementer: typecheck, lint y los tests de los
archivos tocados.

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida — cero errores)

$ pnpm run lint
> eslint
(sin salida — cero errores)

$ pnpm exec vitest run tests/guards tests/unit    # corrida final, arbol committeado
 Test Files  3 failed | 435 passed (438)
      Tests  5 failed | 6468 passed | 95 skipped (6568)
#  ^ los 5 rojos son AJENOS y flaky: ver la seccion de arriba.
#    Pasan en aislamiento: 139/139 sobre esos mismos tres archivos.

$ pnpm exec vitest run --project=integration
test-db: plantilla reutilizada: qct_tpl_ba111e8df7b5 (las migraciones no han cambiado)
test-db: la corrida de integracion va contra qct_qc50_823f45a6_mu4xf7gt_qqw
 Test Files  63 passed (63)
      Tests  822 passed (822)
   Duration  141.69s
test-db: borrada la base de la corrida: qct_qc50_823f45a6_mu4xf7gt_qqw.
```

**E2E de esta ficha, corrido en los dos navegadores** (los demás specs quedaron compilando pero no
se ejecutaron — los lanza el gate):

```
$ npx playwright test e2e/aislamiento-recetas.spec.ts --project=chromium
  ✓  1 [chromium] › e2e/aislamiento-recetas.spec.ts:203:7 › ... (R31) (50.0s)
  1 passed (1.9m)

$ npx playwright test e2e/aislamiento-recetas.spec.ts --project=webkit
  ✓  1 [webkit] › e2e/aislamiento-recetas.spec.ts:203:7 › ... (R31) (30.0s)
  1 passed (55.8s)
```

El fixture deja la base como la encontró: tras cada corrida, cero `recipes`/`companies`/`users`
con el prefijo `qc50_e2e_`. La limpieza respeta el orden de las FK (`recipes_company_id_fkey` es
**RESTRICT**: la receta cae antes que su empresa).

### La migración, comprobada contra la base real

`pnpm run db:migrate` aplica sin error (31 migraciones). Tras el UP: **5 recetas**, todas con la
empresa de «QuimiCloud»; **5 líneas** intactas; `companies` conserva sus 48 filas; `pg_indexes`
muestra `recipes_company_name_unique` sobre `(company_id, name_normalized)` **con su**
`WHERE (deleted_at IS NULL)`, y **ya no** muestra `recipes_name_unique`. `pnpm run db:rollback`
deja el esquema idéntico al anterior —columna fuera, `recipes_name_unique` global y parcial
restaurado, `ENABLE`+`FORCE` en las dos tablas, `_prisma_migrations` coherente— y la
reaplicación vuelve al estado final.

## Desviaciones y hallazgos, declarados

1. **T20 bloqueada** — ver arriba. Es lo único que impide cerrar la ficha.
2. **Falso positivo corregido en `scope.test.ts`** — **validado por el leader el 2026-09-16:**
   *pasar de substring pelado a forma de import es **tensar, no relajar**, y se comprobó que sigue
   cazando un import real.* — el caso «ningún test importa
   `@supabase/storage-js` ni el adaptador de Storage» comprobaba el adaptador con un **substring
   pelado**, mientras su comprobación hermana de `@supabase/storage-js` siempre exigió **forma de
   import**. El test de R27 lee el adaptador como **texto** (`readFileSync`) y cita su nombre de
   archivo sin importarlo, así que el substring mordía sin que hubiera dependencia real. Se
   alineó la segunda comprobación con la primera. **No es una relajación**: un import real se
   sigue cazando —comprobado creando uno temporal y viendo la guardia en rojo— y el propio caso
   ya había sido acotado una vez por esta misma clase de falso positivo. Se renombró además su
   título vecino, que había quedado mintiendo.
3. **R13, matiz sobre «sin consultar el repositorio»** — las cinco actions llaman siempre al caso
   de uso con actor nulo, y es éste quien rechaza en `requirePermission` antes de tocar ningún
   puerto. El test sigue el precedente ya aprobado de
   `tests/unit/inventario/product-actions.test.ts` (QC-49 R12) en vez de exigir un cortocircuito
   que la producción no tiene. La garantía de «sin tocar ningún puerto» la cierra
   `authorization.test.ts` con puertos que explotan si se les llama.
4. **`tests/unit/pedidos/create-order.test.ts` y `update-order.test.ts` son NUEVOS**, no
   ampliaciones: `tasks.md` los daba por existentes, pero los casos de `createOrder`/`updateOrder`
   viven en `order-service.test.ts`. Se crearon acotados a R26 y no se tocó `order-service.test.ts`
   más allá de la aserción de la costura (lista 10).
5. **Dependencia lógica entre las dos guardias del `down.sql`** — con los datos que describe la
   ficha, la causa (b) (dos recetas vivas de empresas distintas con el mismo nombre) **siempre**
   implica la (a) (fila de otra empresa), y Postgres ejecuta el bloque en orden, así que la
   guardia 2 atrapa el caso antes de que hable la 3. El test ejercita (a) contra el SQL **real** y
   (b) contra una mutación **en memoria** que desactiva la guardia 2, más un control que demuestra
   que sin las guardias 2 y 3 el dato pasa. El `down.sql` **no se tocó**; se reporta como
   observación.
6. **T13 sin edición** — `lib/composition/index.ts` no necesitó cambios: las funciones del
   adaptador ya satisfacen las interfaces nuevas. Se respeta el criterio de la task («no se
   reordena ni se reformatea nada»).

## Un rojo AJENO que NO metí al baseline ni apagué

En la corrida completa de `tests/guards tests/unit` quedan **5 tests rojos en 3 archivos**:

- `tests/unit/inventario/product-page.test.tsx` (3 casos de guardado del panel de alta/edición)
- `tests/unit/proveedores-ui/supplier-page.test.tsx` — *«R9: elegir a mano en el calendario un día
  de inicio y otro de fin navega con ese rango en YYYY-MM-DD»*
- `tests/unit/recetas-ui/recipe-page.test.tsx` — el **mismo** caso R9 del calendario

**No son de esta ficha, y hay tres razones para afirmarlo:**

1. **Ninguno de los tres archivos está en el diff de QC-50** (`git diff --name-only origin/dev...HEAD`
   no los devuelve). De `recetas-ui` esta ficha solo tocó `recipe-route-contract.test.ts`.
2. **Los tres pasan en aislamiento**: `vitest run` sobre esos tres archivos da **139/139 verdes**.
3. **El conjunto que falla cambia de corrida en corrida** con el mismo árbol committeado —se
   observaron tandas de 4, 5, 6 y 8 fallos, y algunas con archivos que ni siquiera llegaban a
   colectarse—, lo que apunta a **flakiness bajo carga/paralelismo**, no a un fallo determinista.
   Dos de los cinco son casos de **calendario sensibles a la fecha**, y la fecha cambió de
   2026-09-16 a 2026-09-17 en mitad de la sesión.

**No se tocó ninguno de los tres, no se marcó nada como `skip` y no se añadió nada a
`tests/baseline-rojos.json`.** Queda anotado aquí para que el leader lo verifique contra `dev` en el
gate completo: si también falla allí, es anterior a esta ficha; si solo falla en tandas cargadas, es
flakiness que merece su propia ficha. **No es mío darlo por bueno.**

## Cierre

- **T27** hecho: `recetas` sale de la lista de deuda de `docs/architecture.md` —quedan `unidades` y
  `proveedores`—, y los `///` de `Recipe` y `RecipeLine` ya lo dicen desde el bloque 0.
- **T16** y **T18** cerradas: `aislamiento-recetas.spec.ts` dado de alta en `E2E_ESPERADOS` (con la
  frase que deja **intacto** el diferimiento de QC-71 R21) y en el censo de specs de recetas, que
  pasa de dos a tres literales.
- **T28** es del leader: `./init.sh` completo. Aquí no se corrió la suite.

## Cierre de la review F2.2 — menor-2 y menor-3 (2026-09-17)

Alcance cerrado: **solo** los dos hallazgos menores del informe del reviewer. No se tocó
producción (`lib/`, `db/`, `app/`) ni el `down.sql`; el diff son **dos archivos de test**.

### menor-2 — la etiqueta de requisito, corregida

Verificado contra `requirements.md` antes de tocar nada: **R9** es «dejar **indexada** la columna
de empresa de `recipes`», **R10** es «el nombre normalizado es único **por empresa**, sobre recetas
vivas», y **R20** es la **conciliación de líneas** al editar. La etiqueta estaba mal.

En `tests/integration/inventario/list-query-indexes.int.test.ts`:

- **Título del caso**: «...es POR EMPRESA y PARCIAL, y el global ya no esta **(QC-50 R9, R10)**».
  Ahí `R<n>` **sí** va: `docs/conventions.md > Comentarios` lo exige como enlace de trazabilidad en
  el nombre del caso.
- **Comentario de `PRE_EXISTING_INDEXES`**: la cita se **borra**, no se corrige. La misma regla
  prohíbe citar `QC-<n>`, `R<n>` o «decisión cerrada» en un comentario, también en `tests/`. La
  frase queda diciendo el porqué («dos empresas pueden tener cada una su misma receta») sin la
  etiqueta. Las otras citas de esa lista son **de QC-49 y QC-76, preexistentes**, y no se tocan:
  la regla limpia las líneas que la rama toca, no las de alrededor.

### menor-3 — R6 deja de afirmarse sobre el TEXTO: el `down.sql` se ejecuta ENTERO

En `tests/integration/recetas/company-scope.int.test.ts`, describe nuevo
**`R6 — ejecutar el down.sql entero devuelve el esquema al estado anterior al UP`**, con tres casos.
Reutiliza el andamiaje que ya tenía el archivo (`leerSql` del disco + `inRolledBackTransaction`):
lo único nuevo es el troceador de sentencias y las dos funciones de retrato.

- **`sentenciasSql`** parte el archivo por los `;` de nivel superior, respetando los `$$ ... $$`,
  las cadenas y los comentarios `--`. El troceador **también se afirma**: exactamente un bloque
  `DO $$` en una sola pieza, y las seis sentencias que este archivo comprueba presentes una a una.
  Si se comiera una, «ejecutar el DOWN entero» dejaría de significar nada.
- **`retratoDeEsquema`** lee el esquema del catálogo, nunca del SQL: `information_schema.columns`
  (nombre, tipo y nulabilidad, en orden ordinal), `pg_indexes` (`indexname` + `indexdef` completo),
  `pg_constraint`, `pg_class.relrowsecurity`/`relforcerowsecurity` y `pg_policies`, sobre
  `recipes`, `recipe_lines` y `companies`.

**Caso 1 — los dos retratos.** Se toma el retrato, se ejecuta el `down.sql` entero dentro de la
transacción, se toma el segundo y se comparan fuera de ella. Afirma, todo contra el catálogo:

- **columna fuera**: no queda ninguna `company_id`, y el retrato de después es **exactamente** el
  de antes menos esa línea — así ninguna otra columna puede cambiar de tipo, de nulabilidad ni de
  posición sin que el caso lo diga;
- **`recipes_name_unique` restaurado, global Y PARCIAL**: su `indexdef` trae `CREATE UNIQUE INDEX`,
  `(name_normalized)` y `WHERE (deleted_at IS NULL)`; `recipes_company_name_unique` ya no está, y
  **el resto de índices queda intacto definición a definición**;
- **constraint fuera**: el retrato de restricciones es el de antes menos `recipes_company_id_fkey`,
  y no queda ninguna que mencione la empresa;
- **`ENABLE` + `FORCE` en las dos tablas** (más `companies`, que el DOWN desfuerza temporalmente):
  `['companies | true | true', 'recipe_lines | true | true', 'recipes | true | true']`, idéntico al
  de antes, y **cero policies** en los dos retratos.

**Caso 2 — el DDL es transaccional y el ROLLBACK no deja basura.** Retrato con `prisma` **antes** de
abrir la transacción, se ejecuta el DOWN dentro, se comprueba que **dentro** el esquema sí cambió
—si no, el caso pasaría con un DOWN que no hiciera nada— y, tras el ROLLBACK, el retrato vuelve a
leerse con `prisma` y se exige `toEqual` con el de partida. Si un `expect` fallara a mitad, el error
sale de la transacción y ésta también revierte: no hay camino que deje esquema tocado.

**Caso 3 — anti-placebo permanente.** Con el `CREATE UNIQUE INDEX` quitado del texto **en memoria**
(nunca del archivo), el DOWN deja la tabla sin `recipes_name_unique` **y** sin
`recipes_company_name_unique`: sin ninguna garantía de unicidad de nombre.

#### La prueba de falsabilidad, ejecutada

El caso 1 se mutó **dos veces** apuntándolo a un `down.sql` roto en memoria, y se puso **ROJO** las
dos. Después se restauró el archivo y se volvió a correr en verde.

```
# mutacion A — el DOWN no restaura el indice global
AssertionError: el DOWN no restauro recipes_name_unique: expected undefined to be defined
 ❯ tests/integration/recetas/company-scope.int.test.ts:850
      Tests  1 failed | 14 passed (15)

# mutacion B — el DOWN no quita la columna
AssertionError: expected [ 'company_id | uuid | NO' ] to have a length of +0 but got 1
      Tests  1 failed | 14 passed (15)
```

### Verificación de esta tanda

El gate completo sigue siendo del leader (**T28**, la única task abierta). Aquí, lo que la regla
deja al implementer:

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida — cero errores)

$ pnpm run lint
> eslint
(sin salida — cero errores)

$ pnpm exec vitest run --project=integration \
    tests/integration/recetas/company-scope.int.test.ts \
    tests/integration/inventario/list-query-indexes.int.test.ts
 Test Files  2 passed (2)
      Tests  32 passed (32)

$ pnpm exec vitest related --run <los dos archivos>
 Test Files  2 passed (2)
      Tests  32 passed (32)

$ pnpm exec vitest run tests/guards/guard-aislamiento-integracion.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

`company-scope.int.test.ts` pasa de 12 a **15 casos**; el censo de `tests/integration/aislamiento.json`
no cambia: el archivo sigue siendo de aislamiento por **transacción**.

**Los 5 rojos ajenos** de `product-page.test.tsx`, `supplier-page.test.tsx` y `recipe-page.test.tsx`
siguen sin tocarse, sin `skip` y fuera de `tests/baseline-rojos.json`.

### El mapa `R<n> -> test`, en las filas que cambian

- **R6** — `recipes-company-scope-migration.test.ts` (texto del SQL) **+
  `company-scope.int.test.ts`, describe «R6 — ejecutar el down.sql entero»**: el `down.sql`
  ejecutado entero contra Postgres y los dos retratos comparados contra `pg_indexes` e
  `information_schema`. El criterio de hecho de T3 («esquema idéntico verificado contra `pg_indexes`
  e `information_schema`») pasa de cubrirlo una corrida **manual** a cubrirlo un **test**.
- **R9, R10** — `list-query-indexes.int.test.ts`: el caso ya existía y mordía; ahora lo dice su
  título.

**T28 (`./init.sh` completo, del leader) es lo único abierto.**
