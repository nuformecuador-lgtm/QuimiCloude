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

### T1 [x] — El método nuevo en el contrato de `recetas`
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

### T3 [x] — Cablear (depende de T1, T2)
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

### T5 [x] — Abrir la búsqueda en la lista blanca
- **Toca**: `lib/modules/pedidos/domain/order-queryable.ts`
- `searchable: true`. **Reescribe el bloque de cabecera**: hoy dice «es la UNICA de las siete con
  `searchable: false`» y cita `R4`, `R17`, `design.md` — las tres cosas que
  `docs/conventions.md > Comentarios` prohíbe en producción y que además dejan de ser ciertas.
- **Hecho**: `ORDER_QUERYABLE.searchable === true` (**R11**) y ningún `QC-`/`R<n>`/`design.md` en
  las líneas que toca la rama.

### T6 [x] — Firma del puerto (depende de T5)
- **Toca**: `lib/modules/pedidos/ports/order-repository.ts`
- `listAlive(query, recipeIds: readonly string[] | null, scope)`. Actualiza la prosa de `listAlive`
  y del encabezado que hoy afirma que `orders` no busca, sin citar ficha ni requisito.
- **Hecho**: `pnpm typecheck` señala `list-orders.ts` y el doble de `order-view.test.ts` — se
  cierran en T7 y T12.
- **ENMIENDA fechada 2026-09-18 (decisión del humano): `recipeIds` va ANTES de `scope`, no
  después.** La tarea decía `listAlive(query, scope, recipeIds)` y así se implementó. **No es un
  cambio de gusto: esa firma rompía una guardia de seguridad ajena a esta ficha.**
  `tests/unit/pedidos/company-isolation-service.test.ts` (QC-60 **R16**) comprueba que **los seis**
  métodos de `OrderRepository` reciben `{ companyId }` como **último** argumento, leído con
  `args[args.length - 1]`; meter `recipeIds` detrás de `scope` lo desplazaba y ponía el caso en
  rojo. Y el propio `order-repository.ts` **tiene escrito** que «los seis métodos exigen
  `scope: OrderScope` al final de la firma», convención que vigila una segunda guardia,
  `tests/guards/guard-ambito-empresa-pedidos.test.ts`. O sea: la firma de T6 **contradecía una
  convención escrita del módulo**, no solo un aserto.
  **Se descartaron las dos alternativas** —tensar la guardia para que admitiera una excepción, o
  acotar la excepción a `listAlive`— porque las dos **aflojan una guardia de aislamiento por
  empresa** para acomodar a esta ficha (**R15**). Reordenar no afloja nada: el aserto vuelve a
  verde **solo**, sin tocar el test. **Ninguno de los dos archivos de guardia se edita, y el
  comentario del puerto no se reescribe: vuelve a ser cierto.**
  **Consecuencia:** en el adaptador, `listAliveOrders` **pierde el `= null` por defecto** de
  `recipeIds` —un parámetro en medio no puede tener defecto—, así que las ~45 llamadas de dos
  argumentos de los tests de integración pasan a `(query, null, scope)`. `design.md > 3.1`
  justificaba ese defecto por no tocarlas; esa justificación **muere aquí** y queda anotada allí.
  Añadir un `null` explícito **no afloja** ninguna de esas llamadas: dicen lo mismo que decían,
  «sin búsqueda», ahora por escrito.

### T7 [x] — El paso nuevo del caso de uso (depende de T6)
- **Toca**: `lib/modules/pedidos/domain/list-orders.ts`
- Entre el log y la llamada al repositorio: si `search !== ''`, pedir
  `deps.recipes.findIdsMatchingName(search, actor.companyId)`; si no, `null`. Pasar el resultado a
  `listAlive`. **El permiso y el `scope` no se mueven de sitio** (**R12**). Reescribir el bloque
  «QC-57 R17: `orders` NO busca».
- **Hecho**: `requirePermission` sigue siendo la primera sentencia del cuerpo; la empresa sigue
  saliendo del actor; el caso de uso no importa nada nuevo fuera del barrel de `recetas`.

### T8 [x] — El `where` del adaptador (depende de T6)
- **Toca**: `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`
- `buildOrderWhere(query, scope, recipeIds)` con el término `recipeId: { in: [...] }` **como
  tercer elemento del `AND`**, junto al ámbito y a `deletedAt: null`, nunca fundido con los filtros
  (**R6**). `listAliveOrders(query, scope, recipeIds = null)` lo propaga al `findMany` **y al
  `count`, con el mismo objeto** (**R5**). Limpiar los comentarios de las líneas tocadas, incluidos
  los que afirman que `orders` «ni siquiera busca».
- **Hecho**: `pnpm typecheck` verde sin tocar ninguna de las ~30 llamadas de dos argumentos de los
  tests de integración.

### T9 [P] [x] — Comprobar el recuento de consultas (depende de T7)
- **Toca**: `tests/unit/pedidos/list-orders.test.ts`
- Caso nuevo que **cuenta invocaciones de puerto** (no resultados): misma página con 1 fila y con
  25 → **2 invocaciones sin búsqueda** (`orders.listAlive` + `recipes.findRefsIncludingDeleted`) y
  **3 con búsqueda** (más `recipes.findIdsMatchingName`) (**R8**). Y: con `search` vacío el
  catálogo de búsqueda **no se llama**; con `null` del catálogo, `listAlive` recibe `null`
  (**R9**).
- **Corregido el 2026-09-17** (implementación, acordado con el leader): esta tarea decía «3
  consultas sin búsqueda y 4 con búsqueda», que son las **consultas SQL** que cuenta
  `design.md > 3` y que un doble **no puede ver** —el `findMany` y el `count` viven dentro de una
  sola invocación de `listAlive`—. Las dos cifras son ciertas y miden cosas distintas; la nota
  fechada que lo explica está en `design.md > 3`, donde el conteo de SQL **no se ha borrado**.
- **Recortado el 2026-09-18**: la corrección de arriba cerraba prometiendo que el número de
  consultas SQL lo demuestra un test de integración. Ese test no existe y no se escribe para
  salvar la frase; el número de consultas SQL no está probado por ningún test de este repo.
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

### T11 [x] — `tests/unit/shared/listas-blancas-listados.test.ts` (censo de las SIETE listas)
- Hoy: `it('pedidos es el UNICO listado que no busca')` con `expect(sinBusqueda).toEqual(['pedidos'])`
  (líneas 79-87).
- **Se tensa**: la afirmación pasa a `expect(sinBusqueda).toEqual([])` — «**ninguna** de las siete
  apaga la búsqueda». Es **más** fuerte que la de hoy: con la lista vacía, cualquier lista que
  apague la búsqueda en el futuro pone el caso en rojo, incluida pedidos. Nota fechada 2026-09-17 y
  `R11` en el nombre del caso.
- **Hecho**: el caso sigue recorriendo las siete (no se convierte en un aserto sobre pedidos solo).

### T12 [x] — `tests/unit/pedidos/order-view.test.ts:125-126`
- Hoy: `expect(ORDER_QUERYABLE.searchable).toBe(false)` con el comentario «Es la UNICA de las siete
  que no busca».
- **Se tensa**: `toBe(true)`, comentario reescrito, `R11` en el nombre del caso. **No se borra** el
  resto del caso (filtrables exactos, sin `orderNumber`).

### T13 [x] — `tests/unit/pedidos/order-input.test.ts:282-288`
- Hoy: «la busqueda por texto se OMITE y se anota: `orders` no tiene columna `name`».
- **Se tensa**: la búsqueda **sobrevive** a `sanitizeListQuery` y **no** aparece en `ignored`
  (**R11**). Se **conserva** un caso hermano con un campo **no declarado** que sí se omite y se
  anota: sin él, esta parte del contrato dejaría de estar probada en pedidos.

### T14 [x] — `tests/unit/pedidos/list-orders.test.ts:313-316`
- Hoy: «la busqueda se OMITE y se registra, y la lista vuelve igual (R17, R39)».
- **Se tensa**: el término **llega al catálogo de recetas** y los ids **llegan al repositorio**
  (**R1**, **R7**); con `null` del catálogo la lista vuelve entera (**R9**); con `[]` el
  repositorio se llama igualmente y devuelve página vacía (**R10**). El log **deja de anotar**
  `search`.

### T15 [x] — `tests/unit/pedidos-ui/order-list-params.test.ts:203-218`
- Hoy: `describe('la lista NO busca: search no se lee ni se escribe (R20)')` con
  `expect(ORDER_QUERYABLE.searchable).toBe(false)`.
- **Se tensa, y aquí está la trampa**: el aserto sobre el contrato pasa a `true`, pero los otros
  dos casos —la pantalla **nunca** lee ni emite `search`— **se conservan y se refuerzan**, porque
  su motivo cambia: ya no es «el contrato no lo admite» sino «**la caja la construye QC-122**»
  (`[D3]`, **R16**). Renombrar el `describe` a algo como «la pantalla todavía no busca, aunque el
  contrato ya lo permita» y dejar la nota fechada. **Borrar estos casos sería aflojar**: dejarían
  de vigilar que esta ficha no se lleva por delante la pantalla.

### T16 [x] — `tests/integration/pedidos/list-query-orders.int.test.ts:248-255`
- Hoy: «la busqueda NO recorta nada: `orders` no busca (R17)», comparando con y sin texto.
- **Se tensa**: pasa a ser **la prueba de integración de la búsqueda** contra la base real
  (`[D3]`): siembra pedidos de dos recetas con nombres distintos y una tercera **dada de baja**;
  comprueba que el término encuentra solo los suyos (**R1**), que encuentra el de la receta de baja
  (**R4**), que ignora acentos y mayúsculas (**R2**), que el **total de resultados** describe el
  conjunto buscado y no la página (**R5**), que un término que no casa devuelve página vacía
  (**R10**) y que buscar el número de pedido **no** encuentra nada (**R3**).

### T17 [x] — `tests/integration/inventario/list-query-indexes.int.test.ts` (censo de índices, **tres a la vez**)
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
- **CORRECCIÓN fechada 2026-09-18: el conteo no es 34 → 35, es 33 → 34.** La cifra de esta tarea
  se escribió el 2026-09-17 y **caducó antes de ejecutarse**: `products_stock_idx` cayó con su
  columna en QC-91 y `orders_unit_price_idx` con la suya en QC-35bis, así que `ALL_INDEXES` ya
  valía **33** al retomar la ficha. Se contó en disco en vez de fiarse del spec
  (`PARTIAL_INDEXES` 24 + `FULL_INDEXES` 9 = 33; con `TOTAL_POR_DECISION`, 34). Lo que la tarea
  pedía de verdad —**subir el censo en uno**— se cumple; el número absoluto era el dato
  perecedero. La cronología completa queda escrita en el propio caso del test.

### T18 [P] [x] — Comentarios de producción cuya **razón escrita** deja de ser cierta
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

### T19 [P] [x] — `e2e/pedidos.spec.ts:195-200`
- **Solo el comentario** de `findOrderRow`: justifica recorrer páginas «porque la pantalla NO tiene
  búsqueda (R20, `ORDER_QUERYABLE.searchable` es `false`)». La mitad del paréntesis deja de ser
  cierta; el hecho (la pantalla no tiene caja) sigue siéndolo.
- **No se añade ni un caso E2E** (`[D3]`): la lista de specs E2E de pedidos es un censo cerrado de
  tres en `tests/unit/pedidos/scope.test.ts:402-406` y un cuarto la pondría en rojo.

### T20 [x] — `tests/integration/pedidos/order-repository.int.test.ts:259-260`
- El comentario del ayudante `consulta()` dice «sin orden y sin búsqueda: es exactamente la lista
  de siempre (R11, R17)». Sigue siendo verdad **como estado**, pero su razón cambia: ya no es que
  `orders` no pueda buscar. Ajustar la prosa; las llamadas de dos argumentos **no cambian**
  (`design.md > 3.1`).

---

### Censos 17 y 18 [x] — descubiertos al implementar, no estaban en esta lista (2026-09-17)

> Los dos comparan `git diff ... origin/dev` contra una lista por **nombre exacto** y solo muerden
> **despues** de commitear la migracion de T10, asi que no se ven al planificar. Los dos se han
> **tensado con alta por nombre exacto y nota fechada**, nunca con un patron, y los dos llevan su
> prueba por mutacion en la bitacora.
>
> - `tests/unit/recetas-ui/recipe-route-contract.test.ts` — bloque `MIGRACION_QC68` en
>   `DB_PERMITIDAS` (commit `8404659`).
> - `tests/guards/guard-identificador-de-request.test.ts` — alta en `MIGRACIONES_ESPERADAS`
>   (commit `32f01c9`). **QC-59 tambien toca este archivo**: se espera un conflicto trivial de una
>   linea al mergear.

---

## Bloque E — Cierre

### T21 [x] — Trazabilidad y gate (depende de todo)
- **Toca**: `progress/impl_QC-68-busqueda-y-total-en-el-listado-de-pedidos.md`
- Mapa **`R<n> -> test concreto`** para **R1–R16, los dieciséis**, sin ninguno pendiente: como
  exige `CHECKPOINTS.md > Trazabilidad`.
- **Hecho**: `./init.sh --rapido` verde al cerrar cada tanda y **`./init.sh` completo** verde antes
  del PR, sin excepción. Ningún test que hoy pasa queda borrado ni aflojado (**R15**).

- **Cerrada el 2026-09-18, y la salvedad se escribe en vez de maquillarse.** El mapa R1–R16 está
  completo y sin casilla pendiente, verificado por el `reviewer` caso por caso y con mutaciones
  propias. Pero **`./init.sh` completo NO termina en verde**, así que el «sin excepción» de arriba
  no se cumple al pie de la letra: quedan **dos rojos, los dos AJENOS y los dos con ficha propia**,
  y ninguno lo toca esta rama.
  - `tests/unit/configuracion-ui/user-table.test.tsx` (**QC-126**): intermitente — cayó en una
    corrida completa y no en la siguiente, y aislado pasa 27/27. Error de jsdom
    (`Not implemented: navigation to another Document`), **no** una expiración: no es la especie
    de QC-58 y subir el margen de tiempo no puede arreglarlo.
  - `tests/unit/pedidos-ui/order-form.test.tsx` (**QC-127**): **no es flake** —falla aislado, 1 de
    33, determinista—. Llegó con el merge del PR #85, que cambió la pantalla a dos decimales,
    actualizó los casos vecinos y olvidó éste. Verificado sobre `origin/dev` limpio.
  - **Ninguno de los dos se dio de alta en `tests/baseline-rojos.json`**, por decisión humana del
    2026-09-18: listarlos apagaría los dos archivos ENTEROS para el comparador (27 y 33 casos) y se
    prefiere que el rojo siga a la vista con dueño. Los dos se declaran en el PR.
  - Lo que sí quedó verde y es lo que esta rama controla: typecheck, lint, las **108** fichas del
    board, las guardias, y `532 archivos / 7833 tests` en verde sobre 533.
