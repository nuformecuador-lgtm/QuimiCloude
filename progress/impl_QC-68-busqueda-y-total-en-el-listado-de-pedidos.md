# QC-68 — busqueda por nombre de receta en el listado de pedidos · bitacora de implementacion

> Estado: **TANDA 1 CERRADA, FEATURE BLOQUEADA A MEDIAS.** 3 de 21 tasks hechas.
> Escrito el 2026-09-17 sobre el worktree
> `.worktrees/QC-68-busqueda-y-total-en-el-listado-de-pedidos`, rama
> `feature/QC-68-busqueda-y-total-en-el-listado-de-pedidos`.
>
> **El total NO entra en esta ficha** (salio a QC-123 el 2026-09-17, `design.md > 5`). Nada de lo
> de aqui lo menciona como trabajo pendiente de QC-68.

## Preparacion del worktree

`pnpm install --frozen-lockfile`, `pnpm exec prisma generate` y **`pnpm exec next typegen`**. Sin
el typegen, `pnpm typecheck` falla con `app/layout.tsx(43,56): error TS2304: Cannot find name
'LayoutProps'` — es un tipo que genera Next en `.next/types/**`, no un error del codigo. `init.sh`
lo corre siempre (`init.sh:68`); en un worktree recien montado hay que correrlo a mano.

## Tanda 1 — tasks hechas

| Task | Estado | Commit |
| --- | --- | --- |
| T2 — `findRecipeIdsMatchingName` con ambito de empresa | `[x]` | `5b3a919` |
| T4 — tests unitarios del metodo nuevo | `[x]` | `5b3a919` |
| T10 — migracion del indice GIN total | `[x]` | `b9c47cb` |

### Archivos creados / modificados

- `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts` — **modificado**.
  `findRecipeIdsMatchingName(search, companyId)`: `normalizedSearchCondition(search,
  normalizeRecipeName)`, `null` si el termino no normaliza a nada, `RecipeScope` local +
  `recipeCompanyScope(scope)` en el `AND`, **sin** `deletedAt` en el `where`, `select: { id: true }`.
  Por ahora es una funcion exportada del adaptador y **no** un metodo de `RecipeCatalog`: T1 y T3
  estan bloqueadas (ver abajo).
- `tests/unit/recetas/recipe-catalog.test.ts` — **modificado**. Siete casos nuevos.
- `db/migrations/20260917130000_recipes_search_index_including_deleted/migration.sql` — **nuevo**.
  `CREATE INDEX "recipes_name_normalized_all_trgm_idx" ON "recipes" USING gin ("name_normalized"
  gin_trgm_ops);` sin `WHERE`.
- `db/migrations/20260917130000_recipes_search_index_including_deleted/down.sql` — **nuevo**.
  `DROP INDEX IF EXISTS`, sin `DROP EXTENSION`.

`db/schema.prisma` **no** se toca: el indice no se declara en Prisma, igual que sus seis hermanos
de QC-57.

### Mapa `R<n> -> test` (parcial: solo lo cubierto por la tanda 1)

| Req | Test |
| --- | --- |
| R2 — misma normalizacion, sin segunda definicion | `tests/unit/recetas/recipe-catalog.test.ts` › `findRecipeIdsMatchingName` (acentos y mayusculas) |
| R4 — la receta de baja entra | idem › caso «una receta dada de baja SI vuelve (R4)» |
| R6 — la busqueda no amplia lo visible (ambito de empresa) | idem › caso de otra empresa + `tests/guards/guard-ambito-empresa-recetas.test.ts` |
| R7 — se resuelve por la interfaz publica de `recetas`, sin tocar `prisma.recipe` desde pedidos | `tests/guards/guard-arquitectura-modulos.test.ts` (verde; **la mitad de la interfaz publica esta pendiente de T1/T3**) |
| R9 — termino vacio -> `null`, no `[]` | `tests/unit/recetas/recipe-catalog.test.ts` › caso `null` |
| R10 — ninguna casa -> `[]` | idem › caso `[]` |
| R13 — la migracion lleva su `down.sql` que revierte lo que crea | verificado a mano: `db:migrate` -> `db:rollback` -> `db:migrate`, las tres sin error |
| R14 — indice que sirve la busqueda incluyendo las de baja | `indexdef` leido de `pg_indexes`: `USING gin (name_normalized gin_trgm_ops)` sin `WHERE`. **Su alta en el censo (T17) esta bloqueada** |
| R1, R3, R5, R8, R11, R12, R15, R16 | **pendientes** (T5-T9, T11-T16) |

### Salida real de la verificacion

```
$ pnpm typecheck
> tsc --noEmit
(sin errores)

$ pnpm lint
> eslint
(sin errores)

$ pnpm exec vitest run tests/integration/inventario/list-query-indexes.int.test.ts tests/unit/recetas/ --maxWorkers=2
 Test Files  25 passed (25)
      Tests  284 passed (284)
   Duration  19.96s

$ pnpm exec vitest run tests/unit/recetas/ tests/guards/guard-ambito-empresa-recetas.test.ts tests/guards/guard-arquitectura-modulos.test.ts --maxWorkers=2
 Test Files  26 passed (26)
      Tests  352 passed (352)
```

No se ha corrido la suite completa ni Playwright: el gate lo corre el leader.

## Lo que queda, y por que esta parado

### Bloqueadas por archivo prohibido (QC-59 los tiene tocados)

- **T3** — `lib/composition/index.ts`: cablear `findIdsMatchingName` en `recipeCatalog`.
- **T17** — `tests/integration/inventario/list-query-indexes.int.test.ts`: alta de
  `recipes_name_normalized_all_trgm_idx` en `SEARCH_INDEXES` (6 -> 7), bucket nuevo
  `TOTAL_POR_DECISION` y conteo 34 -> 35.

### Bloqueadas *en cadena* por T3

- **T1** — el metodo en la interfaz `RecipeCatalog`. Anadirlo pone `pnpm typecheck` en **rojo**
  (`const recipeCatalog: RecipeCatalog = {...}` en `lib/composition/index.ts:881` deja de
  satisfacer la interfaz) y ademas pone en rojo `guard-ambito-empresa-recetas`, que exige que el
  conjunto de claves cableadas sea **exactamente** el de la interfaz. No se puede cerrar sin T3.
- **T7, T9, T14** — el caso de uso y sus tests: necesitan `deps.recipes.findIdsMatchingName`, o
  sea T1.
- **T5** — `searchable: true`. No se adelanta a proposito: con la lista blanca abierta y el caso
  de uso sin T7, el termino sobrevive al saneo, **deja de anotarse en el log y no filtra nada** —
  una busqueda silenciosamente ignorada. Y pondria en rojo T11/T12/T13/T15 sin poder cerrar T14.
- **T11, T12, T13, T15, T18, T19, T20** — censos y comentarios cuya afirmacion solo cambia cuando
  T5 entra.
- **T16** — la prueba de integracion de la busqueda; se puede escribir contra el adaptador sin
  esperar a T3, pero se deja con su bloque para no partirla en dos.
- **T21** — cierre.

### Censo numero DIECISIETE, no listado en `tasks.md`

`tests/unit/recetas-ui/recipe-route-contract.test.ts` (mergeado en `dev` con QC-91) tiene el caso
`la feature no toca lib/modules/recetas ni db/`, que compara `git diff --name-only
origin/dev...HEAD` contra `RECETAS_PERMITIDAS` y `DB_PERMITIDAS`, dos listas por **nombre exacto**.
`recipe-catalog-prisma.ts` **ya esta** en la lista de recetas (bloque de QC-34), pero la migracion
nueva no, y el caso sale **rojo** desde el commit `b9c47cb`:

```
AssertionError: ningun archivo de db/ fuera de las migraciones nombradas deberia estar en el diff
+ [
+   "db/migrations/20260917130000_recipes_search_index_including_deleted/down.sql",
+   "db/migrations/20260917130000_recipes_search_index_including_deleted/migration.sql",
+ ]
```

**No se ha tocado**, a la espera de decision del leader: el arreglo correcto es **tensarlo** con un
bloque `MIGRACION_QC68` de dos rutas por nombre exacto y su nota fechada —nunca un patron—, pero
**QC-59 va a necesitar el mismo bloque** para su
`db/migrations/20260917120000_suppliers_company_scope` (hoy tampoco esta en la lista), asi que es un
tercer punto de colision con esa ficha.
