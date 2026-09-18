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

---

# Tanda 2 (2026-09-17) — censos 17 y 18, T8 y T16. **La rama queda APARCADA aqui.**

Decidida por el leader tras la tanda 1: tensar el censo diecisiete ahora (el cambio es **aditivo**,
no espera a QC-59), soltar T16 del bloque bloqueado, y dejar escrita la discrepancia de conteo de
T9. **5 de 21 tasks hechas.**

## Tasks y trabajos cerrados

| Trabajo | Estado | Commit |
| --- | --- | --- |
| Censo **17** — `tests/unit/recetas-ui/recipe-route-contract.test.ts` | hecho | `8404659` |
| Nota fechada del conteo de consultas (T9) en `design.md` y `tasks.md` | hecho | `30752fe` |
| **T8** — `buildOrderWhere` / `listAliveOrders` aceptan `recipeIds` | hecho | `d25f5af` + `141c26e` |
| **T16** — prueba de integracion de la busqueda contra Postgres | hecho | `5fa44b4` + `5316e2b` |
| Censo **18** — `tests/guards/guard-identificador-de-request.test.ts` | hecho | `32f01c9` |

### Archivos creados o modificados en esta tanda

- `tests/unit/recetas-ui/recipe-route-contract.test.ts` — bloque `MIGRACION_QC68` con **las dos
  rutas por nombre exacto** y nota fechada, sumado a `DB_PERMITIDAS`. Ninguna otra entrada tocada,
  ningun patron.
- `tests/guards/guard-identificador-de-request.test.ts` — alta de
  `20260917130000_recipes_search_index_including_deleted` en `MIGRACIONES_ESPERADAS`, con el mismo
  comentario literal que las dos altas anteriores. La lista sigue **cerrada**.
- `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` — `buildOrderWhere(query,
  scope, recipeIds)` con `recipeId: { in: [...] }` como **tercer termino del AND**, entre
  `deletedAt: null` y los filtros, nunca fundido con ellos; `listAliveOrders(..., recipeIds = null)`
  propaga **el mismo objeto where** al `findMany` y al `count`. Ninguna de las ~30 llamadas de dos
  argumentos se toco.
- `tests/integration/pedidos/list-query-orders.int.test.ts` — el caso «la busqueda NO recorta
  nada» se **tensa** a un bloque que demuestra la busqueda real contra Postgres.
- `specs/.../design.md` y `specs/.../tasks.md` — nota fechada del conteo de consultas.

## Mapa `R<n> -> test` — actualizado

| Req | Test | Estado |
| --- | --- | --- |
| R1 | `list-query-orders.int.test.ts` › caso R1 (solo los pedidos de la receta que casa) | cubierto |
| R2 | idem › caso R2 (acentos y mayusculas) + `tests/unit/recetas/recipe-catalog.test.ts` | cubierto |
| R3 | idem › caso R3 (buscar el numero de pedido no encuentra nada) | cubierto |
| R4 | idem › caso R4 (la receta de baja si aparece) + `recipe-catalog.test.ts` | cubierto |
| R5 | idem › caso R5 (el total describe el conjunto buscado y no la pagina) | cubierto |
| R6 | `recipe-catalog.test.ts` (otra empresa) + `tests/guards/guard-ambito-empresa-recetas.test.ts` + el AND de `buildOrderWhere` | cubierto en su mitad de datos; el caso del pedido borrado entra con T14 |
| R7 | `tests/guards/guard-arquitectura-modulos.test.ts`, `tests/unit/pedidos/scope.test.ts` | parcial: el metodo aun no esta en la interfaz (T1, T3) |
| R8 | pendiente (T9) | pendiente |
| R9 | `recipe-catalog.test.ts` (`null`, no `[]`) + caso R15 del test de integracion | cubierto en el adaptador; falta el caso de uso (T14) |
| R10 | `list-query-orders.int.test.ts` › caso R10 (pagina vacia, total 0, sin error) | cubierto |
| R11 | pendiente (T5, T11, T12, T13) | pendiente |
| R12 | pendiente (T7, T14) | pendiente |
| R13 | verificado a mano: `db:migrate` -> `db:rollback` -> `db:migrate` | cubierto |
| R14 | `indexdef` leido de `pg_indexes`, sin `WHERE`; su alta en el censo de indices (T17) sigue bloqueada | parcial |
| R15 | `list-query-orders.int.test.ts` › caso R15 (sin termino, la lista vuelve igual) | cubierto |
| R16 | pendiente (T15, T18) | pendiente |

## La discrepancia de conteo de T9, dejada por escrito

`design.md > 3` cuenta **consultas SQL**: 3 sin busqueda (`findMany` + `count` + catalogo de
nombres) y 4 con ella. Un test unitario con **dobles** no puede ver eso: el `findMany` y el `count`
viven dentro de **una sola** invocacion de `listAlive`. T9 contara **invocaciones de puerto**: **2
sin busqueda y 3 con ella**. Las dos cifras son ciertas y miden cosas distintas; **el conteo de SQL
no se ha borrado** y lleva su nota fechada al lado, y `tasks.md > T9` lleva la correccion con su
fecha. Quien demuestra el numero real de consultas contra la base es el test de integracion.

## Pruebas por mutacion (salida real)

**Censo 17** — quitada la ruta de `down.sql` del bloque `MIGRACION_QC68`:

```
AssertionError: ningun archivo de db/ fuera de las migraciones nombradas deberia estar en el diff: expected [ Array(1) ] to deeply equal []
- []
+ [ "db/migrations/20260917130000_recipes_search_index_including_deleted/down.sql" ]
```

Restaurada: `Test Files 1 passed (1)` · `Tests 26 passed (26)`.

**Censo 18** — quitada la entrada de `MIGRACIONES_ESPERADAS`:

```
AssertionError: expected [ Array(1) ] to deeply equal []
+ [ "db/migrations/20260917130000_recipes_search_index_including_deleted: migracion nueva. QC-71 no persiste el identificador y no toca db/ (R19). Si esta migracion es de otra ficha, esa ficha actualiza esta lista." ]
```

Restaurada: `Test Files 1 passed (1)` · `Tests 23 passed (23)`.

**Caso R3 del test de integracion** — sustituido el correlativo por el nombre real de una receta
del fixture:

```
FAIL ... > R3: buscar el numero de pedido no encuentra nada
AssertionError: expected [ { ...(11) } ] to deeply equal []
 Test Files  1 failed (1) · Tests  1 failed | 18 passed (19)
```

Restaurado: `Test Files 1 passed (1)` · `Tests 19 passed (19)`, y dos corridas seguidas verdes con
marcadores aleatorios distintos.

## Dos correcciones de revision, dichas para que no se repitan

1. **Un comentario de produccion afirmaba algo falso.** El bloque de `listAliveOrders` decia que
   «el puerto lo declara obligatorio»: **no lo declara**, T6 esta bloqueada y el puerto sigue con
   dos parametros. Corregido en `141c26e`, junto con las citas de requisito que quedaban en lineas
   que la rama habia modificado. Es exactamente el fallo que esta ficha persigue —una razon
   escrita que deja de ser cierta— cometido dentro de la propia ficha.
2. **El caso R3 pasaba por suerte.** Buscaba el correlativo del pedido —digitos— mientras las
   recetas del fixture se nombraban con un token **hexadecimal**, que contiene digitos: bastaba con
   que el correlativo apareciera como subcadena en cualquier nombre para volverlo rojo. Corregido
   en `5316e2b` con un marcador de **solo letras** y nombres sin numero. Un test que pasa por
   casualidad no prueba nada.

## Salida real de la verificacion (cierre de la tanda)

```
$ pnpm typecheck        -> tsc --noEmit, sin errores
$ pnpm lint             -> eslint, sin errores
$ pnpm exec vitest run tests/guards/ tests/unit/recetas/ \
    tests/unit/recetas-ui/recipe-route-contract.test.ts tests/unit/pedidos/ \
    tests/integration/pedidos/ tests/integration/inventario/list-query-indexes.int.test.ts \
    --maxWorkers=2
 Test Files  93 passed (93)
      Tests  1211 passed | 5 skipped (1216)
   Duration  30.18s
```

Ningun test que hoy pasa quedo borrado ni aflojado (**R15**). No se corrio la suite completa ni
Playwright: el gate lo corre el leader.

## Lo que queda, en el orden en que hay que hacerlo

**Todo lo pendiente cuelga de `lib/composition/index.ts`**, que sigue en manos de QC-59.

1. **T1 + T3 + T5 + T6 + T7 juntos, en una sola tanda.** Es el **unico corte que deja el arbol
   verde**: T1 (metodo en la interfaz `RecipeCatalog`) rompe el typecheck y
   `guard-ambito-empresa-recetas` hasta que T3 cablea; T5 (`searchable: true`) sin T7 deja una
   **busqueda silenciosamente ignorada**; T6 (puerto con el tercer parametro obligatorio) obliga a
   que T7 pase el valor.
2. **T9 y T14** — los unitarios del caso de uso, contando **invocaciones de puerto** (2 y 3).
3. **T11, T12, T13, T15** — los censos que cambian al abrir la lista blanca.
4. **T17** — el censo de indices (`tests/integration/inventario/list-query-indexes.int.test.ts`,
   el segundo archivo bloqueado): `SEARCH_INDEXES` 6 -> 7, bucket nuevo `TOTAL_POR_DECISION` con
   nota fechada, conteo 34 -> 35.
5. **T18, T19, T20** — los comentarios cuya razon escrita deja de ser cierta.
6. **T21** — cierre: mapa completo R1-R16 y gate.

## Deuda del arnes detectada por esta ficha

1. **`next typegen` es obligatorio en un worktree recien montado.** Sin el, `pnpm typecheck` falla
   con `app/layout.tsx(43,56): TS2304: Cannot find name 'LayoutProps'` — un tipo que Next genera
   en `.next/types/**`, no un error de codigo. `init.sh:68` lo corre siempre, pero quien trabaje en
   un worktree sin pasar por `init.sh` lo va a leer como un error real. Merece estar escrito en
   `docs/worktrees.md`.
2. **La Postgres local esta compartida entre sesiones.** Su `_prisma_migrations` traia migraciones
   de otros worktrees (`20260917120000_drop_product_stock`,
   `20260917120000_suppliers_company_scope`) que no existen en este arbol, y por eso
   `pnpm run db:migrate:create` pide un **reset destructivo**. **No se ejecuto**: la carpeta se
   creo a mano con el mismo formato de timestamp y se aplico con `prisma migrate deploy`. Con
   features en paralelo, `db:migrate:create` no es seguro tal cual.
3. **Los censos que muerden por el diff no estan inventariados en ningun sitio.** `tasks.md`
   listaba dieciseis; aparecieron **dos mas** (17 y 18) que solo se descubren corriendo la guardia
   **despues** de commitear la migracion, porque comparan contra `origin/dev`. Los dos exigen alta
   por nombre exacto de **cada ficha que anade una migracion**. Una lista de «censos que reaccionan
   al diff» ahorraria descubrirlos de uno en uno.
4. **Nunca hacer `git add`/`git commit` mientras un subagente trabaja en el mismo worktree.** El
   indice de git es compartido: un `git add specs/` de esta sesion se llevo por delante un archivo
   que el subagente tenia **ya preparado** y lo metio en un commit con el mensaje equivocado. Se
   corrigio partiendo el commit en dos (`8404659` y `30752fe`) y comprobando que el arbol final es
   **identico** al de antes del corte (`git diff` vacio contra la etiqueta de respaldo). La rama no
   estaba publicada, asi que reescribir ahi era seguro; con la rama ya publicada no lo habria sido.
