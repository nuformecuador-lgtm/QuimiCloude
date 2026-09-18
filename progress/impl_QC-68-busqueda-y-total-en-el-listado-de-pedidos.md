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

## Lo que quedaba tras la tanda del 2026-09-17 (historico, ya cerrado)

Todo lo de esta lista dependia de `lib/composition/index.ts`, en manos de QC-59. **QC-59 mergeo el
2026-09-18 y se cerro entero**; el detalle de como esta al final de este archivo, en la seccion
fechada de ese dia.

1. T1 + T3 + T5 + T6 + T7 en una sola tanda. 2. T9 y T14. 3. T11, T12, T13, T15. 4. T17.
5. T18, T19, T20. 6. T21.

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

---

# Tanda del 2026-09-18 — reanudada tras el merge de QC-59

> Los dos archivos que QC-59 bloqueaba (`lib/composition/index.ts` y
> `tests/integration/inventario/list-query-indexes.int.test.ts`) quedaron **libres** al mergear
> QC-59 (PR #84). El worktree ya venia sincronizado con `origin/dev` (merge `07a8d17`) y con la
> tanda **T1+T3+T5+T6+T7 commiteada pero SIN REGISTRAR**: `tasks.md` las tenia sin marcar y la
> seccion «Lo que queda» de arriba las daba por pendientes. **Registradas ahora.**

## El censo DIECINUEVE, y por que no es un censo mas

`tests/unit/pedidos/company-isolation-service.test.ts` (QC-60 **R16**) exige que **los seis**
metodos de `OrderRepository` reciban `{ companyId }` como **ultimo** argumento, leido con
`args[args.length - 1]`. **T6 metio `recipeIds` DESPUES de `scope`**, asi que lo desplazaba.

**No es un censo de comentario como los dieciocho anteriores: es la guardia del aislamiento por
empresa.** Y ademas el propio `lib/modules/pedidos/ports/order-repository.ts` **tiene escrito** que
«los seis metodos exigen `scope: OrderScope` al final de la firma», convencion que vigila una
**segunda** guardia, `tests/guards/guard-ambito-empresa-pedidos.test.ts`. La firma que eligio T6
**contradecia una convencion escrita del modulo**, no solo un aserto.

**Decision del humano (2026-09-18): reordenar a `listAlive(query, recipeIds, scope)`.** Se
descartaron «tensar la guardia» y «excepcion acotada a `listAlive`», las dos porque aflojan una
guardia de seguridad **ajena a esta ficha** (**R15**). La enmienda esta escrita, con su fecha y su
motivo, en `tasks.md > T6` y en `design.md > 3.1`.

### PERO la premisa de esa decision resulto FALSA en un punto, y ahi esta el bloqueo

La condicion era: **`company-isolation-service.test.ts` no se toca y vuelve a verde solo, por el
reordenamiento**. **No vuelve.** El motivo esta en la linea 125 de ese archivo:

```ts
listAlive: vi.fn(async (_query: unknown, scope: OrderScope) => {
  const items = [...filas.values()]
    .filter((g) => !g.deleted && g.companyId === scope.companyId)
```

Ese doble **no es un espia: es un doble FUNCIONAL** que ejecuta el filtrado por empresa de verdad,
y lee el ambito **por POSICION**, de su segundo parametro declarado. Con la firma vieja la posicion
2 era el `scope` y funcionaba. Con la firma nueva la posicion 2 es `recipeIds` —`null` en ese
flujo, porque la consulta no trae termino—, y `scope.companyId` revienta con
`TypeError: Cannot read properties of null (reading 'companyId')`.

El razonamiento del encargo —«con dos parametros declarados y tres pasados, `args[args.length-1]`
ve los TRES argumentos reales»— **es cierto para el aserto**, que lee `mock.calls`. Lo que no
cubria es que **ese mismo doble se usa ademas como implementacion** dentro de `almacen()`, y ahi la
posicion declarada si importa. Por eso caen **dos** casos: uno porque la excepcion revienta antes
de llegar al aserto de argumentos, y otro porque el filtrado por empresa deja de funcionar.

**No se ha tocado el archivo.** La instruccion era parar y avisar, y es lo que se hace: **la
decision de si se ajusta la aridad de ese doble es del humano.**

**El arreglo minimo, si el humano lo aprueba**, es una linea: que el doble declare
`(_query: unknown, _recipeIds: readonly string[] | null, scope: OrderScope)`. **No afloja nada**:
el aserto `args[args.length - 1]` se queda intacto, la logica de filtrado se queda intacta, y lo
unico que cambia es que el doble vuelve a declarar la aridad real del puerto — que es exactamente
lo que el propio encargo pedia hacer con «los dobles de test que asuman la firma vieja». La
tension del encargo es real: una clausula manda ajustar los dobles con la firma vieja, otra veda
este archivo, y este archivo **contiene** un doble con la firma vieja.

## Archivos tocados en esta tanda

### Produccion
| Archivo | Que |
| --- | --- |
| `lib/modules/pedidos/ports/order-repository.ts` | `listAlive(query, recipeIds, scope)` — ambito al final |
| `lib/modules/pedidos/domain/list-orders.ts` | la llamada pasa a `(podada.query, searchRecipeIds, scope)` |
| `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` | `listAliveOrders(query, recipeIds, scope)` y `buildOrderWhere(query, recipeIds, scope)`; **`recipeIds` pierde el `= null`** (un parametro en medio no puede tener defecto) y el docblock que justificaba ese defecto se corrige en vez de quedarse mintiendo |
| `lib/modules/pedidos/adapters/driven/persistence/list-query-sql.ts` | **solo comentario** (T18): la razon escrita era «`ORDER_QUERYABLE.searchable === false`», que ya es falsa |
| `app/(private)/pedidos/components/order-list-params.ts` | **solo comentario** (T18) |
| `app/(private)/pedidos/components/order-table.tsx` | **solo comentario** (T18); `searchable={false}` del JSX **no se toca** |

### Tests
| Archivo | Que |
| --- | --- |
| `tests/unit/pedidos/list-orders.test.ts` | **T14** (tensado y partido en cuatro casos) y **T9** (bloque nuevo de invocaciones de puerto); `dobles()` gana `findIdsMatchingName` |
| `tests/unit/shared/listas-blancas-listados.test.ts` | **T11**: `toEqual(['pedidos'])` pasa a `toEqual([])` |
| `tests/unit/pedidos/order-view.test.ts` | **T12**: `searchable` a `true` |
| `tests/unit/pedidos/order-input.test.ts` | **T13**: la busqueda SOBREVIVE; el caso de `orderNumber` se conserva, partido en dos |
| `tests/unit/pedidos-ui/order-list-params.test.ts` | **T15**: contrato a `true`, **los dos casos de «la pantalla no busca» conservados** con motivo nuevo |
| `tests/integration/inventario/list-query-indexes.int.test.ts` | **T17**: `SEARCH_INDEXES` 6 a 7, bucket `TOTAL_POR_DECISION`, conteo **33 a 34** |
| `tests/unit/recetas/schema/recipes-search-index-migration.test.ts` | **NUEVO**: cierra **R13** con un test ejecutable |
| `tests/integration/pedidos/order-repository.int.test.ts` | **T20** (comentario) + las llamadas pasan a `(consulta, null, scope)` |
| `tests/integration/pedidos/list-query-orders.int.test.ts` | reorden de argumentos |
| `tests/integration/pedidos/company-scope-queries.int.test.ts` | reorden de argumentos |
| `e2e/pedidos.spec.ts` | **T19**: solo el comentario de `findOrderRow`. **Ni un caso E2E nuevo** |

## El conteo de indices de T17 estaba caducado

`tasks.md > T17` mandaba subir el censo de **34 a 35**. En disco valia **33**: `products_stock_idx`
cayo con su columna en QC-91 y `orders_unit_price_idx` con la suya en QC-35bis, las dos **despues**
de escribirse la tarea. Se **conto en disco** en vez de fiarse del spec (`PARTIAL_INDEXES` 24 +
`FULL_INDEXES` 9 = 33; con el bucket nuevo `TOTAL_POR_DECISION`, **34**). Lo que la tarea pedia de
verdad —**subir el censo en uno**— se cumple; el numero absoluto era el dato perecedero. La
correccion, fechada, esta en `tasks.md > T17`, y la cronologia completa en el propio caso del test.
**El cambio de QC-59 en ese archivo sigue intacto**: el unico global de nombre de proveedor sigue
FUERA del censo y su sustituto por empresa sigue DENTRO, con su caso propio.

## R13 dejaba de estar trazado, y ahora lo esta

La tanda anterior mapeaba **R13** a «verificado a mano: `db:migrate` -> `db:rollback` ->
`db:migrate`». **Una comprobacion manual no es un test**, y `CHECKPOINTS.md > Trazabilidad` exige
un test concreto por requisito. Se cierra con
`tests/unit/recetas/schema/recipes-search-index-migration.test.ts`, cuatro casos que leen el disco:
la carpeta trae los dos ficheros; el `migration.sql` crea el GIN de trigramas **sin `WHERE`**; el
`down.sql` tira **exactamente** el indice que crea el `up` —el nombre **se extrae** del `CREATE`, no
se copia a mano, asi que renombrar en el `up` y olvidar el `down` lo pone rojo—; y el `down.sql`
**no** hace `DROP EXTENSION`.

## Mapa de trazabilidad R1-R16 (T21)

| Req | Test concreto | Estado |
| --- | --- | --- |
| R1 | `list-query-orders.int.test.ts` > `R1: el termino devuelve solo los pedidos de la receta que casa, y ninguno mas` · `list-orders.test.ts` > `el termino de busqueda llega al catalogo de recetas y sus ids llegan al repositorio (R1, R7)` | cubierto |
| R2 | `list-query-orders.int.test.ts` > `R2: ignora acentos y mayusculas` · `recipe-catalog.test.ts` > `ignora acentos y mayusculas al normalizar el termino (R2)` | cubierto |
| R3 | `list-query-orders.int.test.ts` > `R3: buscar el numero de pedido no encuentra nada` | cubierto |
| R4 | `list-query-orders.int.test.ts` > `R4: el pedido cuya receta esta de baja SI aparece al buscar su nombre` · `recipe-catalog.test.ts` > `una receta dada de baja SI vuelve (R4)` | cubierto |
| R5 | `list-query-orders.int.test.ts` > `R5: el total describe el conjunto buscado y no la pagina` | cubierto |
| R6 | `recipe-catalog.test.ts` > `una receta de otra empresa NO vuelve (R6)` (mitad de la empresa) · `list-orders.test.ts` > caso `(R1, R7)`, que afirma que el `companyId` que viaja es el del actor · `list-query-orders.int.test.ts` > `un pedido CANCELADO SI se consulta; uno BORRADO no sale nunca (R25, R7)` (mitad del borrado) · `buildOrderWhere` compone los tres en un `AND` explicito | cubierto **por partes**, ver la deuda de abajo |
| R7 | `list-orders.test.ts` > `(R1, R7)` · `tests/guards/guard-arquitectura-modulos.test.ts` · `tests/unit/pedidos/scope.test.ts` (pedidos no consulta `prisma.recipe`) | cubierto |
| R8 | `list-orders.test.ts` > `sin busqueda: DOS invocaciones de puerto, tenga la pagina 1 fila o 25 (R8)` y `con busqueda: TRES invocaciones de puerto, tenga la pagina 1 fila o 25 (R8)` | cubierto |
| R9 | `recipe-catalog.test.ts` > `un termino que normaliza a vacio devuelve null, no [] (R9)` · `list-orders.test.ts` > `con null del catalogo (el termino no es una busqueda) la lista vuelve entera y listAlive recibe null (R9)` | cubierto |
| R10 | `list-query-orders.int.test.ts` > `R10: un termino que no casa con ninguna receta devuelve pagina vacia, total 0 y sin error` · `recipe-catalog.test.ts` > `ningun nombre casa: devuelve [] (R10)` · `list-orders.test.ts` > `con [] del catalogo (ninguna receta casa) el repositorio se llama igual y devuelve pagina vacia (R10)` | cubierto |
| R11 | `listas-blancas-listados.test.ts` > `ninguna de las siete apaga la busqueda (R11)` · `order-view.test.ts` > `los filtros del listado son solo estado, prioridad y fecha, y la busqueda ya se abrio (R11)` · `order-input.test.ts` > `la busqueda por texto SOBREVIVE a sanitizeListQuery (R11)` · `order-list-params.test.ts` > `el contrato de pedidos ya declara searchable: true (R11)` | cubierto |
| R12 | `tests/unit/pedidos/authorization.test.ts` (el permiso es la primera accion y ningun puerto se toca sin el) · `company-isolation-service.test.ts` > `cada llamada al puerto de los seis lleva exactamente {companyId} como ultimo argumento` | cubierto — **pero ese segundo test esta HOY EN ROJO por el bloqueo de arriba** |
| R13 | `recipes-search-index-migration.test.ts` > los cuatro casos `(R13)` | cubierto (**nuevo**: antes era manual) |
| R14 | `list-query-indexes.int.test.ts` > `los siete de busqueda son GIN de trigramas sobre name_normalized`, que ademas comprueba que el nuevo **no** lleva `WHERE`; y `los 34 indices nuevos existen, cada uno con su nombre exacto` | cubierto |
| R15 | `list-query-orders.int.test.ts` > `R15: sin termino de busqueda, la lista vuelve exactamente igual que antes de esta feature`; y el hecho de que **ningun test que hoy pasa se ha borrado ni aflojado** | cubierto |
| R16 | `order-list-params.test.ts` > `un search en la URL se IGNORA: la consulta sale siempre con busqueda vacia (R16)` y `buildOrderListQuery NUNCA emite un parametro search, ni siquiera vacio (R16)` | cubierto |

### Deuda de trazabilidad que el spec no vio, dicha en voz alta

**R6 no tiene un caso de integracion propio.** Dice dos cosas —buscar el nombre exacto de la receta
de un pedido **de otra empresa**, o de un pedido **borrado**, devuelve cero— y hoy se demuestra
**por partes**: la mitad de la empresa en el unitario del catalogo de recetas, la mitad del borrado
en un caso de integracion que **no busca**, y la conjuncion **por construccion** en el `AND` de
`buildOrderWhere`. Es defendible, pero es la casilla mas debil del mapa: **nadie ejercita hoy una
busqueda cuyo termino case con un pedido ajeno o borrado**. Un caso de integracion en el `describe`
de la busqueda lo cerraria. **No se ha escrito porque esta tanda no puede correr integracion**
(el encargo lo prohibe y el gate lo corre el leader), y **un test que no se ha visto pasar no se
entrega**. Queda como decision del leader.

## Salida real de la verificacion

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida - verde)

$ pnpm run lint
> eslint
(sin salida - verde)

$ pnpm exec vitest run tests/unit/ tests/guards/ --maxWorkers=2
 Test Files  1 failed | 461 passed (462)
      Tests  2 failed | 6887 passed | 92 skipped (6981)
   Duration  430.84s
```

Los **dos** rojos son los del bloqueo, los dos en `tests/unit/pedidos/company-isolation-service.test.ts`
y los dos con la **misma** causa raiz:

```
FAIL tests/unit/pedidos/company-isolation-service.test.ts
  > QC-60 R16 > cada llamada al puerto de los seis lleva exactamente { companyId } como ultimo argumento
  > QC-60 R20, R21 > R19 (lado service): el listado de A no trae el pedido de B
TypeError: Cannot read properties of null (reading 'companyId')
 tests/unit/pedidos/company-isolation-service.test.ts:127:60
   125|     listAlive: vi.fn(async (_query: unknown, scope: OrderScope) => {
   126|       const items = [...filas.values()]
   127|         .filter((g) => !g.deleted && g.companyId === scope.companyId)
 Object.listOrders lib/modules/pedidos/domain/list-orders.ts:148:36
```

Barrido posterior con el archivo nuevo de R13 ya en disco, para comprobar que **ningun censo de los
que muerden por el diff** se despierta con el:

```
$ pnpm exec vitest run tests/guards/ tests/unit/recetas/ tests/unit/recetas-ui/ tests/unit/documentos/ --maxWorkers=2
 Test Files  85 passed (85)
      Tests  1151 passed | 13 skipped (1164)
```

**No se corrio la suite completa ni Playwright ni integracion**: el gate lo corre el leader. Los
cuatro archivos de integracion tocados (`list-query-indexes`, `list-query-orders`,
`order-repository`, `company-scope-queries`) **no se han visto pasar en esta tanda** — solo los
cubre el typecheck.

## Pruebas por mutacion de esta tanda

**T9** — duplicada la llamada a `findIdsMatchingName` en `list-orders.ts`:

```
 tests/unit/pedidos/list-orders.test.ts (28 tests | 2 failed)
     x con busqueda: TRES invocaciones de puerto, tenga la pagina 1 fila o 25 (R8)
     x con `null` del catalogo, `listAlive` recibe `null` (R9)
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
```

Restaurado: `Test Files 4 passed (4)` · `Tests 62 passed (62)`.

**R13** — renombrado el indice en el `down.sql`:

```
 tests/unit/recetas/schema/recipes-search-index-migration.test.ts (4 tests | 2 failed)
AssertionError: expected 'recipes_name_normalized_all_trgm_idx_wrong' to be 'recipes_name_normalized_all_trgm_idx'
```

Restaurado: `Test Files 1 passed (1)` · `Tests 4 passed (4)`, con `git diff -- db/` vacio.

## Lo que queda

1. **BLOQUEANTE — el doble de `company-isolation-service.test.ts`.** Decision del humano: o se
   ajusta la aridad declarada de ese doble (una linea, sin aflojar nada), o se elige otra salida.
   **Hasta entonces la rama tiene 2 rojos** y no puede ir a PR.
2. **El gate**: `./init.sh --rapido` para cerrar la tanda y **`./init.sh` completo antes del PR**,
   que es lo unico que ejercita los cuatro archivos de integracion tocados contra la base real.
3. **Opcional, recomendado**: el caso de integracion de **R6** descrito arriba.

## Deuda del arnes, la quinta

**Una decision humana puede apoyarse en una premisa falsa, y el encargo no tiene donde decirlo.**
La decision de reordenar la firma era **correcta** —y se mantiene—, pero venia con una condicion
que resulto imposible: «ese archivo vuelve a verde solo». Nadie habia leido que el doble de
`listAlive` de ese archivo **no es un espia sino una implementacion**, y que por eso lee el ambito
por posicion. El encargo ademas se contradecia: mandaba ajustar «los dobles que asuman la firma
vieja» y a la vez vedaba el unico archivo que contiene uno. **Se paro y se pregunto en vez de
elegir en silencio**, que es lo que manda la regla 6, pero costo una tanda entera descubrirlo.
Un encargo que veda un archivo deberia decir **que se espera que pase con el**, no solo que no se
toque.
