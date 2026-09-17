# QC-50 — aislamiento-por-empresa-en-recetas · bitácora de implementación

> Escrita por el **implementer**. Rama `feature/QC-50-aislamiento-por-empresa-en-recetas`,
> worktree `.worktrees/QC-50-aislamiento-por-empresa-en-recetas/`.
> Spec aprobado por el humano en F1.4 (2026-09-16). Base: merge `4a9258a` con `origin/dev`.

## Estado

**24 de las 29 tasks cerradas. T20 (E2E) BLOQUEADA** por una contradicción entre el
`design.md` y la UI real — ver `## El bloqueo de T20`. En consecuencia quedan también
abiertas **T16** y **T18** —su parte (b), el censo de `aislamiento.json`, sí está hecha; falta
(a), el censo de specs—, el cierre documental de
**T27** y el gate completo **T28**.

**32 de los 33 requisitos tienen test.** El único sin test es **R31**, que *es* el E2E.

## El bloqueo de T20 — para decisión del leader

`tasks.md` T20 y `design.md > 8.2` prescriben el recorrido: «se abre el diálogo de borrado de
una receta **propia** y **se sustituye por DOM** el identificador por el de la receta de B».
Ese gesto es **imposible en la UI actual de recetas**, y no por un descuido del E2E:

- El molde funciona en inventario y pedidos porque **su diálogo lleva un campo oculto** con el
  id, que viaja en el `FormData`:
  `app/(private)/inventario/components/delete-product-dialog.tsx:106` y el equivalente de
  pedidos (`delete-order-dialog.tsx:128`, `type="hidden"`).
- `app/(private)/produccion/formulas/components/delete-recipe-dialog.tsx:58` hace
  `await deleteRecipeAction(recipe.id)`: el id sale del **cierre de React**, no del DOM. **No
  existe ningún nodo cuyo `value` reescribir** para que el cambio llegue al servidor.

Las salidas posibles, ninguna elegible por el implementer:

1. **Dar al diálogo de recetas el campo oculto** que ya tienen inventario y pedidos. Choca de
   frente con `design.md > 14` («No se toca ningún componente (R32)»).
2. **Invocar la Server Action con el id de B** desde el test. Cubre R31 al pie de la letra
   («conociendo su identificador») y modela mejor la amenaza real, pero **deja de ser el gesto
   sobre la UI** que el design pide.
3. **Redefinir el recorrido** del paso 3 a algo fiel a esta UI y documentar por qué difiere del
   molde.

No se eligió ninguna por cuenta propia: el `design.md` está aprobado y esto lo decide el leader
o el humano. Los pasos 1, 2 y 4 del recorrido (listado que no muestra la receta de B; alta en A
con el mismo nombre que una de B) **sí** son viables tal cual.

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

## Las listas cerradas: el spec nombraba seis, eran **diez**

`design.md > 0.6` avisa de cinco, más la de QC-104. Al correr la verificación aparecieron
**cuatro más** que el spec no anticipó. Todas se **tensaron** —alta a mano, con motivo escrito—;
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

**La lista 6 es la que más cerca estuvo de pasar desapercibida**: solo la vio la corrida de
integración, y es exactamente del tipo que `design.md > 2.1` anuncia como drift deliberado.

## La excepción que muere

`SIN_AMBITO_POR_DECISION_APROBADA` de `tests/guards/guard-ambito-empresa-inventario.test.ts`
queda **vacía**: `findProductRefs` ya exige la empresa y compone `productCompanyScope`. Se
borraron los tres párrafos que anunciaban la excepción (`product-catalog-prisma.ts`,
`inventario/.../company-scope.ts`, `unidades/.../unit-prisma.ts`). **Ningún archivo del repo
sigue diciendo que esa costura está sin ámbito.** Esta ficha **no crea ninguna excepción nueva.**

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
| **R31** | **`e2e/aislamiento-recetas.spec.ts`** | **E2E** | **PENDIENTE — T20 bloqueada** |
| R32 | `recipes-company-scope-migration.test.ts` (la migración no toca otras tablas) + `recipe-actions.test.ts` y `list-recipes.test.ts` (firmas y forma de salida intactas) | unit | verde |
| R33 | `tests/guards/guard-dependencias-aprobadas.test.ts` (`package.json` y `pnpm-lock.yaml` sin tocar) | guardia | verde |

**32/33 con test.** R31 depende de T20.

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

$ pnpm exec vitest run tests/guards tests/unit/recetas tests/unit/pedidos \
    tests/unit/inventario tests/unit/unidades tests/unit/identity
 Test Files  268 passed (268)
      Tests  4118 passed | 48 skipped (4166)
   Duration  151.14s

$ pnpm exec vitest run --project=integration
test-db: plantilla reutilizada: qct_tpl_ba111e8df7b5 (las migraciones no han cambiado)
test-db: la corrida de integracion va contra qct_qc50_823f45a6_mu4xf7gt_qqw
 Test Files  63 passed (63)
      Tests  822 passed (822)
   Duration  141.69s
test-db: borrada la base de la corrida: qct_qc50_823f45a6_mu4xf7gt_qqw.
```

**E2E: no corrido.** `e2e/aislamiento-recetas.spec.ts` no existe todavía (T20 bloqueada); los
demás specs quedaron **compilando** pero no se ejecutaron — los lanza el gate.

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
2. **Falso positivo corregido en `scope.test.ts`** — el caso «ningún test importa
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

## Pendiente al cerrar T20

- **T16** — `E2E_ESPERADOS` en `guard-identificador-de-request.test.ts`: dar de alta
  `aislamiento-recetas.spec.ts` con su motivo y dejando escrito que **no** ejercita el cruce del
  identificador de petición, para que el diferimiento de QC-71 R21 siga intacto.
- **T18(a)** — el censo de specs de recetas en `tests/unit/recetas/scope.test.ts` pasa de **dos**
  a **tres** literales. Ojo al orden: es el de `readdirSync`, y `aislamiento-recetas.spec.ts` va
  **primero**.
- **T27** — quitar `recetas (QC-50)` de la lista de deuda de `docs/architecture.md:34`, dejando
  `unidades` y `proveedores`. No se hizo todavía para no declarar saldada una deuda cuyo E2E
  falta.
- **T28** — `./init.sh` completo, que corre el leader.
