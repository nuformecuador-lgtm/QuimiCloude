# QC-68 — busqueda-y-total-en-el-listado-de-pedidos · tasks.md

> `[P]` = puede ir en paralelo con las tareas de su mismo bloque. Cada tarea dice **qué archivos
> toca** y su **criterio de hecho**.
>
> **Dos reglas que valen para todas.** (1) Los censos se **tensan con nota fechada, nunca se
> aflojan**: un censo que deja de comprobar algo es un agujero, aunque el gate salga verde.
> (2) `docs/conventions.md > Comentarios`: en producción **no se cita ficha ni requisito** y se
> limpian los comentarios de **las líneas que toca la rama**; en tests, `R<n>` va en el **nombre
> del caso**.
>
> **El total salió de esta ficha el 2026-09-17** (decisión del humano: va a **QC-123**, ver
> `design.md > 5`). Las cuatro tareas que lo construían se han retirado y el resto se ha renumerado
> corrido, sin huecos. **Los censos del bloque E se quedan los dieciséis**: los provoca abrir la
> búsqueda, no el total.

---

## Bloque A — La frontera con `recetas`

### T1 — El método nuevo en el contrato de `recetas`
- **Toca**: `lib/modules/recetas/domain/recipe-catalog.ts`
- Añade a `RecipeCatalog`: `findIdsMatchingName(search: string, companyId: string): Promise<readonly RecipeId[] | null>`.
- **Hecho**: `pnpm typecheck` falla a propósito en `lib/composition/index.ts` (el objeto ya no
  satisface la interfaz) — esa rojez es la prueba de que el contrato manda; la cierra T3.

### T2 [x] — La implementación, con ámbito de empresa
- **Toca**: `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts`
- `findRecipeIdsMatchingName(search, companyId)` según `design.md > 2.2`: normaliza con
  `normalizedSearchCondition(search, normalizeRecipeName)`, devuelve `null` si el término no
  normaliza a nada, envuelve `companyId` en un `RecipeScope` local y lo pasa a
  `recipeCompanyScope(scope)`. **Sin** `deletedAt: null` en el `where` (`[D2]`). `select: { id: true }`.
- **Hecho**: `guard-ambito-empresa-recetas` verde con el método nuevo incluido (comprueba que lo
  declara y que el ámbito **llega** al punto único), y `guard-arquitectura-modulos` verde.

### T3 — Cablear (depende de T1, T2)
- **Toca**: `lib/composition/index.ts`
- Añadir `findIdsMatchingName: findRecipeIdsMatchingName` a la constante `recipeCatalog`.
- **Hecho**: `pnpm typecheck` verde. `guard-ambito-empresa-recetas` exige que el conjunto de claves
  cableadas sea **exactamente** el de la interfaz: si falta, sale rojo solo.
- ⚠ **Archivo compartido**: es el único del PR con riesgo de colisión con QC-59/QC-91. Commit
  pequeño y aislado.

### T4 [x] — Tests del método nuevo (depende de T2)
- **Toca**: `tests/unit/recetas/recipe-catalog.test.ts`
- Casos, con `R<n>` en el nombre: casa por subcadena; ignora acentos y mayúsculas (**R2**); una
  receta **dada de baja sí vuelve** (**R4**); una receta de **otra empresa no vuelve** (**R6**);
  término que normaliza a vacío → `null`, no `[]` (**R9**); ninguna casa → `[]` (**R10**); **una
  sola consulta** y `deletedAt` **no** aparece en el `where`.
- **Hecho**: los siete casos pasan y el existente «la consulta a `prisma.recipe` vive SOLO en el
  adaptador driven de recetas» sigue verde.

---

## Bloque B — El listado de pedidos

### T5 — Abrir la búsqueda en la lista blanca
- **Toca**: `lib/modules/pedidos/domain/order-queryable.ts`
- `searchable: true`. **Reescribe el bloque de cabecera**: hoy dice «es la UNICA de las siete con
  `searchable: false`» y cita `R4`, `R17`, `design.md` — las tres cosas que
  `docs/conventions.md > Comentarios` prohíbe en producción y que además dejan de ser ciertas.
- **Hecho**: `ORDER_QUERYABLE.searchable === true` (**R11**) y ningún `QC-`/`R<n>`/`design.md` en
  las líneas que toca la rama.

### T6 — Firma del puerto (depende de T5)
- **Toca**: `lib/modules/pedidos/ports/order-repository.ts`
- `listAlive(query, scope, recipeIds: readonly string[] | null)`. Actualiza la prosa de `listAlive`
  y del encabezado que hoy afirma que `orders` no busca, sin citar ficha ni requisito.
- **Hecho**: `pnpm typecheck` señala `list-orders.ts` y el doble de `order-view.test.ts` — se
  cierran en T7 y T12.

### T7 — El paso nuevo del caso de uso (depende de T6)
- **Toca**: `lib/modules/pedidos/domain/list-orders.ts`
- Entre el log y la llamada al repositorio: si `search !== ''`, pedir
  `deps.recipes.findIdsMatchingName(search, actor.companyId)`; si no, `null`. Pasar el resultado a
  `listAlive`. **El permiso y el `scope` no se mueven de sitio** (**R12**). Reescribir el bloque
  «QC-57 R17: `orders` NO busca».
- **Hecho**: `requirePermission` sigue siendo la primera sentencia del cuerpo; la empresa sigue
  saliendo del actor; el caso de uso no importa nada nuevo fuera del barrel de `recetas`.

### T8 — El `where` del adaptador (depende de T6)
- **Toca**: `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`
- `buildOrderWhere(query, scope, recipeIds)` con el término `recipeId: { in: [...] }` **como
  tercer elemento del `AND`**, junto al ámbito y a `deletedAt: null`, nunca fundido con los filtros
  (**R6**). `listAliveOrders(query, scope, recipeIds = null)` lo propaga al `findMany` **y al
  `count`, con el mismo objeto** (**R5**). Limpiar los comentarios de las líneas tocadas, incluidos
  los que afirman que `orders` «ni siquiera busca».
- **Hecho**: `pnpm typecheck` verde sin tocar ninguna de las ~30 llamadas de dos argumentos de los
  tests de integración.

### T9 [P] — Comprobar el recuento de consultas (depende de T7)
- **Toca**: `tests/unit/pedidos/list-orders.test.ts`
- Caso nuevo que **cuenta invocaciones** (no resultados): misma página con 1 fila y con 25 →
  **3 consultas sin búsqueda y 4 con búsqueda** (**R8**). Y: con `search` vacío el catálogo de
  búsqueda **no se llama**; con `null` del catálogo, `listAlive` recibe `null` (**R9**).
- **Hecho**: el caso se pone rojo si alguien mete la resolución de ids dentro de un bucle por fila.

---

## Bloque C — La migración

### T10 [x] — Índice de búsqueda que ve las recetas de baja
- **Toca**: `db/migrations/<ts>_recipes_search_index_including_deleted/migration.sql` y `down.sql`
- `CREATE INDEX "recipes_name_normalized_all_trgm_idx" ON "recipes" USING gin ("name_normalized" gin_trgm_ops);`
  (**sin** `WHERE`, **R14**). `down.sql` con su `DROP INDEX IF EXISTS` y **sin** `DROP EXTENSION`
  (**R13**). Crear con `pnpm run db:migrate:create`, escribir el `down` a mano, aplicar con
  `pnpm run db:migrate`.
- **Hecho**: `pnpm run db:rollback` la deshace y `pnpm run db:migrate` la vuelve a aplicar, las dos
  sin error. El índice **no** se declara en `db/schema.prisma` (igual que sus seis hermanos).

---

## Bloque D — Los censos que hay que tensar, archivo por archivo

> Ninguno de estos se descubre solo al correr el gate en el orden equivocado: **son la lista que
> QC-63 no tuvo**. Cada uno lleva su nota fechada explicando **por qué cambia la afirmación**, no
> solo el valor.
>
> **Los dieciséis siguen en pie tras sacar el total a QC-123** (2026-09-17): todos los provoca
> abrir la búsqueda —`ORDER_QUERYABLE.searchable` pasando a `true`, o el índice nuevo—, ninguno el
> total. Revisados uno por uno.

### T11 — `tests/unit/shared/listas-blancas-listados.test.ts` (censo de las SIETE listas)
- Hoy: `it('pedidos es el UNICO listado que no busca')` con `expect(sinBusqueda).toEqual(['pedidos'])`
  (líneas 79-87).
- **Se tensa**: la afirmación pasa a `expect(sinBusqueda).toEqual([])` — «**ninguna** de las siete
  apaga la búsqueda». Es **más** fuerte que la de hoy: con la lista vacía, cualquier lista que
  apague la búsqueda en el futuro pone el caso en rojo, incluida pedidos. Nota fechada 2026-09-17 y
  `R11` en el nombre del caso.
- **Hecho**: el caso sigue recorriendo las siete (no se convierte en un aserto sobre pedidos solo).

### T12 — `tests/unit/pedidos/order-view.test.ts:125-126`
- Hoy: `expect(ORDER_QUERYABLE.searchable).toBe(false)` con el comentario «Es la UNICA de las siete
  que no busca».
- **Se tensa**: `toBe(true)`, comentario reescrito, `R11` en el nombre del caso. **No se borra** el
  resto del caso (filtrables exactos, sin `orderNumber`).

### T13 — `tests/unit/pedidos/order-input.test.ts:282-288`
- Hoy: «la busqueda por texto se OMITE y se anota: `orders` no tiene columna `name`».
- **Se tensa**: la búsqueda **sobrevive** a `sanitizeListQuery` y **no** aparece en `ignored`
  (**R11**). Se **conserva** un caso hermano con un campo **no declarado** que sí se omite y se
  anota: sin él, esta parte del contrato dejaría de estar probada en pedidos.

### T14 — `tests/unit/pedidos/list-orders.test.ts:313-316`
- Hoy: «la busqueda se OMITE y se registra, y la lista vuelve igual (R17, R39)».
- **Se tensa**: el término **llega al catálogo de recetas** y los ids **llegan al repositorio**
  (**R1**, **R7**); con `null` del catálogo la lista vuelve entera (**R9**); con `[]` el
  repositorio se llama igualmente y devuelve página vacía (**R10**). El log **deja de anotar**
  `search`.

### T15 — `tests/unit/pedidos-ui/order-list-params.test.ts:203-218`
- Hoy: `describe('la lista NO busca: search no se lee ni se escribe (R20)')` con
  `expect(ORDER_QUERYABLE.searchable).toBe(false)`.
- **Se tensa, y aquí está la trampa**: el aserto sobre el contrato pasa a `true`, pero los otros
  dos casos —la pantalla **nunca** lee ni emite `search`— **se conservan y se refuerzan**, porque
  su motivo cambia: ya no es «el contrato no lo admite» sino «**la caja la construye QC-122**»
  (`[D3]`, **R16**). Renombrar el `describe` a algo como «la pantalla todavía no busca, aunque el
  contrato ya lo permita» y dejar la nota fechada. **Borrar estos casos sería aflojar**: dejarían
  de vigilar que esta ficha no se lleva por delante la pantalla.

### T16 — `tests/integration/pedidos/list-query-orders.int.test.ts:248-255`
- Hoy: «la busqueda NO recorta nada: `orders` no busca (R17)», comparando con y sin texto.
- **Se tensa**: pasa a ser **la prueba de integración de la búsqueda** contra la base real
  (`[D3]`): siembra pedidos de dos recetas con nombres distintos y una tercera **dada de baja**;
  comprueba que el término encuentra solo los suyos (**R1**), que encuentra el de la receta de baja
  (**R4**), que ignora acentos y mayúsculas (**R2**), que el **total de resultados** describe el
  conjunto buscado y no la página (**R5**), que un término que no casa devuelve página vacía
  (**R10**) y que buscar el número de pedido **no** encuentra nada (**R3**).

### T17 — `tests/integration/inventario/list-query-indexes.int.test.ts` (censo de índices, **tres a la vez**)
- Hoy: `SEARCH_INDEXES` con **seis** entradas (94-101), `PARTIAL_INDEXES`/`FULL_INDEXES` y
  `expect(ALL_INDEXES).toHaveLength(34)` (247-253).
- **Se tensa**: `recipes_name_normalized_all_trgm_idx` entra en `SEARCH_INDEXES` (pasa a **siete**)
  y en `ALL_INDEXES` (**34 → 35**). Necesita **bucket propio**: está sobre una tabla **con**
  `deleted_at` pero es **total a propósito**, así que no cabe en `PARTIAL_INDEXES` (su caso exige
  `WHERE (deleted_at IS NULL)`) ni en el `FULL_INDEXES` de hoy, cuyo motivo escrito es «esas tablas
  no tienen `deleted_at`». Crear `TOTAL_POR_DECISION` con su **nota fechada**: es total porque la
  búsqueda de pedidos tiene que ver las recetas de baja (`[D2]`), y meterlo en `PARTIAL_INDEXES`
  sin más lo pondría rojo por el motivo equivocado.
- **Hecho**: el caso «los seis de búsqueda son GIN de trigramas» pasa a decir siete y comprueba la
  **definición** (`USING gin`, `gin_trgm_ops`, `name_normalized`) del nuevo; el conteo total dice
  35; y `recipes_name_normalized_trgm_idx` (el parcial) **sigue** en `PARTIAL_INDEXES`: los dos
  conviven (`design.md > 1.1`).

### T18 [P] — Comentarios de producción cuya **razón escrita** deja de ser cierta
- **Toca** (uno por uno, solo comentario):
  - `lib/modules/pedidos/adapters/driven/persistence/list-query-sql.ts:12-14` — dice que
    `normalizedSearchCondition` se conserva sin usar «porque `ORDER_QUERYABLE.searchable === false`».
    El motivo real pasa a ser: las tres copias son la misma y `orders` no tiene columna de nombre.
  - `app/(private)/pedidos/components/order-list-params.ts:31-34` — «`search` no se lee ni se
    escribe **porque** `searchable` es `false`». El motivo real pasa a ser: la pantalla todavía no
    tiene caja de búsqueda.
  - `app/(private)/pedidos/components/order-table.tsx:33-37` y `:63` — ídem con `searchable={false}`.
- **Hecho**: ninguno cita `QC-<n>`, `R<n>` ni `design.md`
  (`docs/conventions.md > Comentarios`), y ninguno afirma algo falso. **Ningún cambio de código**
  en estos tres archivos: la pantalla sigue emitiendo búsqueda vacía (**R16**).

### T19 [P] — `e2e/pedidos.spec.ts:195-200`
- **Solo el comentario** de `findOrderRow`: justifica recorrer páginas «porque la pantalla NO tiene
  búsqueda (R20, `ORDER_QUERYABLE.searchable` es `false`)». La mitad del paréntesis deja de ser
  cierta; el hecho (la pantalla no tiene caja) sigue siéndolo.
- **No se añade ni un caso E2E** (`[D3]`): la lista de specs E2E de pedidos es un censo cerrado de
  tres en `tests/unit/pedidos/scope.test.ts:402-406` y un cuarto la pondría en rojo.

### T20 — `tests/integration/pedidos/order-repository.int.test.ts:259-260`
- El comentario del ayudante `consulta()` dice «sin orden y sin búsqueda: es exactamente la lista
  de siempre (R11, R17)». Sigue siendo verdad **como estado**, pero su razón cambia: ya no es que
  `orders` no pueda buscar. Ajustar la prosa; las llamadas de dos argumentos **no cambian**
  (`design.md > 3.1`).

---

## Bloque E — Cierre

### T21 — Trazabilidad y gate (depende de todo)
- **Toca**: `progress/impl_QC-68-busqueda-y-total-en-el-listado-de-pedidos.md`
- Mapa **`R<n> -> test concreto`** para **R1–R16, los dieciséis**, sin ninguno pendiente: como
  exige `CHECKPOINTS.md > Trazabilidad`.
- **Hecho**: `./init.sh --rapido` verde al cerrar cada tanda y **`./init.sh` completo** verde antes
  del PR, sin excepción. Ningún test que hoy pasa queda borrado ni aflojado (**R15**).
