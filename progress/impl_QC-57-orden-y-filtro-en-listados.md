# QC-57 — orden-y-filtro-en-listados · bitácora de implementación

> Worktree: `.worktrees/QC-57-orden-y-filtro-en-listados/`, rama
> `feature/QC-57-orden-y-filtro-en-listados`. Spec aprobado por el humano el 2026-09-04 (F1.4).

## Precedencia aplicada: las decisiones mandan sobre el `design.md`

Las **tres últimas filas** de `requirements.md > Decisiones cerradas (no reabrir)` se cerraron
**después** de escribirse el `design.md`, así que **lo contradicen y ganan ellas**. Queda escrito
aquí porque el `design.md` no se ha reescrito y el reviewer leerá los dos:

| # | El `design.md` dice | Manda la decisión cerrada |
| --- | --- | --- |
| 1 | §4.3 deja `pg_trgm` **sin decidir**, con vía A y vía B | **Vía A**: `CREATE EXTENSION IF NOT EXISTS pg_trgm`, índices GIN de trigramas y búsqueda por **SUBCADENA**. La vía B (prefijo) queda descartada |
| 2 | §3.3 marca el huso del `dateRange` como «posición por defecto, no decisión» | **UTC**, extremos inclusivos, **decidido** |
| 3 | §3.3 dice nulos «por defecto de Postgres, sin `NULLS FIRST/LAST` explícito» | **`NULLS LAST` SIEMPRE y EXPLÍCITO**, en `asc` y en `desc`. Afecta a `stock`, `qty_alert`, `min_purchase` y `delivery_time` |

## T0 — Precondición (`tasks.md > Grupo 0`)

Las cinco comprobaciones, verificadas y no supuestas:

1. **Rama y `dev` mergeado** — OK. `git merge dev` trajo `82c1379` (QC-47 `in_progress`); merge
   limpio, solo `feature_list.json` y `progress/current.md`.
2. **`./init.sh` en verde sobre el punto de partida** — OK, **después de provisionar el worktree**
   (ver abajo). Resultado: `Test Files 180 passed (180)`, `Tests 2058 passed (2058)`, `== init OK ==`.
3. **QC-44 cerrada** — OK: `feature_list.json` la da `done`. `lib/modules/proveedores/**` y
   `app/(private)/proveedores/**` sin cambios sin mergear que colisionen.
4. **QC-55 `done` y `data-table-types.ts` con la forma de su `design.md > 3.1`** — OK.
   `components/shared/data-table/data-table-types.ts` declara `SortDirection`, `DataTableSort`
   (`columnId` + `direction`), `DataTableFilterValue` (las **cuatro** variantes `text`,
   `numberRange`, `select`, `dateRange`, con los mismos campos) y `DataTableParams`
   (`page`, `pageSize`, `sort: DataTableSort | null`, `filters`, `search`). **Casa campo a campo
   con `design.md > 3.1`**; la única diferencia es que QC-55 exige `pageSize` y el contrato del
   dominio lo deja opcional, que es lo que ya hace `pageQuerySchema`. No hay motivo para parar.
5. **Las siete listas existen** en las rutas de `design.md > 1` — OK, las nueve comprobadas
   (siete casos de uso + `supplier-catalog-repository.ts` + los trece adaptadores driven).

### Lo que hubo que provisionar (NO es código de la feature)

El worktree venía sin montar y `./init.sh` salía rojo **antes de tocar nada**. Las cuatro causas
eran de entorno, ninguna de código, y ninguna se «arregló de paso» tocando fuentes:

| Síntoma | Causa | Qué se hizo |
| --- | --- | --- |
| 60+ `TS2305: '@prisma/client' has no exported member 'Prisma'` | cliente Prisma sin generar en el worktree | `pnpm exec prisma generate` |
| `app/layout.tsx: TS2304: Cannot find name 'LayoutProps'` | tipos de rutas de Next sin generar (`tsconfig` incluye `.next/types/**`) | `pnpm exec next typegen` |
| 19 ficheros de integración rojos con `Environment variable not found: DATABASE_URL` | el worktree no tenía `.env` (está en `.gitignore`) | copiado desde el worktree principal **y `prisma generate` OTRA VEZ**: el cliente resuelve el `.env` en tiempo de generación, así que generar antes de copiarlo no basta |
| 4 ficheros de `tests/integration/pedidos/` rojos: «la base de pruebas no tiene la funcion `next_order_sequence`» | la base compartida tenía **pendiente** `20260904135210_order_cancellation` (QC-34, ya mergeada en `dev`) | `pnpm run db:migrate` |

**Verificado que el rojo era heredado y no mío**: los mismos cuatro ficheros fallaban igual en el
worktree principal sobre `dev` antes de migrar. No se añadió nada a `tests/baseline-rojos.json`:
el rojo se debía a una base desactualizada, no a deuda de código.

**Aviso al leader (no bloquea, pero conviene arreglarlo en el arnés):** `scripts/wt.sh` monta el
worktree pero **no provisiona** `.env`, `prisma generate` ni `next typegen`, así que **todo worktree
nuevo arranca con `./init.sh` en rojo** y el implementer de turno gasta la primera tanda en esto.

**Aviso de baseline:** `./init.sh` avisa de **3 ficheros del baseline que ya pasan** y tocaría
limpiar (`tests/unit/inventario/product-page.test.tsx`,
`tests/unit/recetas-ui/recipe-route-contract.test.ts`, `tests/unit/recetas/module-contract.test.ts`).
Es deuda ajena a esta ficha y **no se toca aquí**: limpiar el baseline de otro es cambiar el gate
de otras features en vuelo.

## T0.1 — `pg_trgm`: vía elegida

**VÍA A. Búsqueda por SUBCADENA, con `CREATE EXTENSION IF NOT EXISTS pg_trgm` e índices
`GIN (name_normalized gin_trgm_ops)`.**

- **Quién la aprobó:** el humano, el 2026-09-04, **antes** de aprobar el spec. Es la
  antepenúltima fila de `requirements.md > Decisiones cerradas (no reabrir)`.
- **Comprobado contra el servidor real de este worktree, no supuesto:**
  `select ... from pg_available_extensions where name='pg_trgm'` devuelve
  `default_version 1.6`, `installed_version null` — **disponible y sin instalar**, tal como decía
  la decisión. Y `select count(*) from products where deleted_at is null` devuelve **6**.
- **Riesgo aceptado y anotado** (está en la propia decisión): es una dependencia de
  **infraestructura** que **ninguna guardia vigila** —no es un paquete de npm, así que
  `guard-dependencias-aprobadas` no la ve—. Si la base se mudara a un Postgres sin `pg_trgm`, la
  migración fallaría. `down.sql` **no** hace `DROP EXTENSION` (`design.md > 10.4`).

## Grupo 1 — el contrato en el dominio (T1, T2, T3, T3.1) · commit `b1181bd`

**Archivos nuevos.** Los cinco `list-query.ts` —`lib/modules/{inventario,recetas,proveedores,unidades,pedidos}/domain/list-query.ts`— son **copias literales**, idénticas salvo el nombre del módulo en la cabecera. Exportan `SortDirection`, `ListSort`, `ListFilterValue`, `ListFilterKind`, `ListQuery`, `ListQueryable`, `createListQuerySchema()`, `SanitizedListQuery` y `sanitizeListQuery(query, queryable)`. **Único import: `zod`.**

Las siete listas blancas, con los campos de `design.md > 5`:
`lib/modules/inventario/domain/product-queryable.ts` · `.../presentation-queryable.ts` ·
`lib/modules/recetas/domain/recipe-queryable.ts` ·
`lib/modules/proveedores/domain/supplier-queryable.ts` · `.../supplier-catalog-line-queryable.ts` ·
`lib/modules/unidades/domain/unit-queryable.ts` ·
`lib/modules/pedidos/domain/order-queryable.ts` (el único con `searchable: false`, R17).

**`deletedAt` es defensa DOBLE**, no solo ausencia: no está en ninguna lista blanca, y además `sanitizeListQuery` lo omite por su cuenta aunque alguien lo declarase (`NEVER_QUERYABLE`). Un test lo afirma en los dos caminos.

**La guardia de equivalencia** `tests/guards/guard-contrato-listados.test.ts` (19 casos) somete a los cinco esquemas la misma batería canónica y exige el mismo veredicto y la misma salida saneada, y comprueba que ninguno importa `lib/shared`, Prisma, `next` ni `components` (R31, R32). **Se verificó que FALLA de verdad**: se introdujo a mano una divergencia en `recetas` (tope de búsqueda 120 a 200 y `page.min(1)` a `min(0)`), se pusieron **3 casos rojos**, y se revirtió. A raíz de eso se **amplió** la batería con el caso del tope de 120, porque ese cambio solo lo cazaba la comparación textual y no la de comportamiento — la guardia quedó más fuerte que antes del experimento.

**Test heredado tocado:** `tests/unit/proveedores/authorization.test.ts` lista los casos de uso barriendo `domain/` por el prefijo `create|update|delete|get|list`, y `list-query.ts` empieza por `list-`. Se excluyó **por nombre**, **sin relajar el patrón ni el `toHaveLength(9)`**: un caso de uso nuevo de verdad lo sigue poniendo rojo. `list-query.ts` no es un caso de uso — no recibe actor y no toca ningún puerto.

## Grupo 2 — base de datos (T4, T5, T6) · commit `8b025bc`

**`db/migrations/20260904160000_list_query_indexes/{migration.sql,down.sql}`**, escrita **A MANO**.

**La mina de `design.md > 10.3`, desarmada.** No se generó con `prisma migrate dev --create-only` precisamente para que no emitiera `DROP CONSTRAINT` de drift sobre las FK escalares, CHECK y RLS que Prisma no conoce en `products`, `recipes`, `supplier_catalog_lines` y `orders`. **El `migration.sql` no contiene ni un solo `DROP`** — la única aparición de la palabra está dentro de un comentario que explica esto mismo, verificado con `grep -i drop`.

**Censo comparado antes/después** (`pg_constraint` + `pg_indexes` + `pg_policies` + `relrowsecurity`/`relforcerowsecurity` + `information_schema.columns` de las siete tablas):

- **Líneas eliminadas: 0.** Ni una constraint, ni un índice, ni una política, ni RLS, ni una columna.
- **Líneas añadidas: 37** = 35 `CREATE INDEX` + `products.name_normalized text NOT NULL` + `pg_trgm 1.6`.
- Sobreviven las **28** restricciones escritas a mano y los 12 índices previos. RLS sigue `enabled=true forced=true` en las siete.

**Qué crea:** la extensión → la columna → backfill con `regexp_replace(lower(translate(...)))` → `SET NOT NULL` → **6 índices GIN `gin_trgm_ops`** sobre `name_normalized` (las seis buscables; `orders` no, R17) → **29 btree** de orden y filtro. **Parciales `WHERE deleted_at IS NULL`** en `products`, `recipes`, `suppliers`, `supplier_catalog_lines` y `orders`; **totales** en `presentations` y `units`, que **no tienen `deleted_at`** (verificado contra el esquema, no supuesto). `deleted_at` aparece **solo como predicado** del índice parcial, nunca como campo consultable (R7). Ningún índice único sobre `products.name_normalized`: el nombre de producto **no** es único (decisión cerrada 6 de QC-14).

**`down.sql`** borra esos 35 índices y la columna, y **no** hace `DROP EXTENSION`, con el porqué escrito en la cabecera y no en silencio (`design.md > 10.4`).

**Ciclo real ejecutado**, no supuesto: `db:migrate` → `db:rollback` → `migrate status` (coherente, la da por no aplicada) → `db:migrate` de nuevo → censo idéntico al de la primera aplicación (diff vacío). Backfill contra los 6 productos vivos: **6/6** coinciden con `normalizeProductName`.

**T5.** `lib/modules/inventario/domain/product-name.ts` (`normalizeProductName`, gemela literal de `normalizeUnitName`), escrita en `createProduct` y `updateAliveProduct` de `product-prisma.ts` con el patrón copiado de `recipe-prisma.ts`.

**T6.** Partido en dos siguiendo el estilo real de la casa (`inventario-split-migration.test.ts` es un test de **texto** sobre el SQL): lo estático en `tests/unit/inventario/schema/list-query-indexes-migration.test.ts`, y lo que solo Postgres sabe (`pg_indexes`, `pg_extension`, backfill, escritura de la columna) en `tests/integration/inventario/list-query-indexes.int.test.ts`.

### Asertos heredados tocados, con su motivo (ninguno relajado gratis)

1. **Censos de columnas de `products`** (`tests/unit/inventario/schema/inventario-schema.test.ts`, `tests/integration/inventario/inventario-constraints.int.test.ts`): son igualdad **exacta**; se añadió `nameNormalized`/`name_normalized` a lo esperado. **Siguen siendo igualdad exacta.**
2. **`tests/integration/unidades/unidades-constraints.int.test.ts`, el caso de dos unidades con el mismo símbolo**, afirmaba que **ningún** índice de `units` menciona `symbol`. El `units_symbol_idx` que R21 exige lo rompía. Se acotó a «ningún índice **ÚNICO** menciona `symbol`», que es literalmente lo que R7 de QC-32 protege —la identidad de la unidad es su nombre—: un `@unique` sobre `symbol` lo sigue poniendo rojo y las dos filas con el mismo símbolo siguen probando lo mismo.
3. **`tests/unit/proveedores/scope.test.ts`**: guardia de alcance de QC-43 que fija qué migraciones pueden tocar `suppliers`/`supplier_catalog_lines`. Se añadió la de QC-57 por nombre (precedente: QC-52 ya era la tercera). El censo de campos de esa guardia **sigue intacto**.
4. Los helpers de `INSERT ... INTO products` en crudo de tres tests de integración ahora escriben `name_normalized`: sin eso el rechazo que cada caso busca llegaba antes como `23502` y **el test dejaba de probar la FK que dice probar**.

### Falsa alarma resuelta sin tocar nada: la guardia de QC-44

Los dos subagentes reportaron `tests/unit/proveedores-ui/guard-convenciones-proveedores.test.ts` en rojo. Esa guardia atribuye a QC-44 «lo que tocó la feature» con `git log --grep=QC-44 origin/dev..HEAD`, y **`--grep` mira el mensaje entero**, así que enganchaba un commit de QC-57 cuyo *cuerpo* menciona QC-44 (la decisión cerrada 14, que T0 obliga a verificar); al no salir el rango vacío, la guardia no se saltaba y le atribuía a QC-44 todo el árbol de trabajo de QC-57.

**Ya no aplica y no se tocó ni una línea de ese archivo**: el commit en cuestión (`0b7d68f`) está **dentro de `origin/dev`**, así que no cae en el rango `origin/dev..HEAD`; con el rango vacío la guardia **se salta** los tres casos de diff, que es su comportamiento diseñado. Verificado: `4 passed | 3 skipped`.

**Queda anotado como fragilidad del arnés, para el leader:** la heurística es sensible a que un commit de OTRA feature mencione la marca en el cuerpo. Filtrar por el **asunto**, donde vive la convención `tipo(QC-44): …`, la haría exacta sin perder ni un aserto. **No se cambia aquí**: es un archivo de otra feature y la decisión no es de esta ficha.

## Grupo 3/4 — el log y el vertical de `inventario` (T7, T8, T9, T14, T15) · commit `1575190`

**T7 — el log del campo omitido (R6).** `ports/list-query-log.ts` en los **cinco** módulos (misma duplicación deliberada que `list-query.ts`) y **una sola** implementación en `lib/shared/observability/list-query-log.ts`, cableada en `lib/composition/index.ts` con edición quirúrgica y sin reordenar nada.

Dos propiedades que no son casualidad:
- **La PII no puede colarse aunque alguien quiera**: la firma `ignoredFields(listName, fields)` **no admite el valor**, así que ni el texto buscado ni el contenido del filtro tienen por dónde entrar. No es una convención confiada al que escriba el `console.warn`, es el tipo.
- **No emite nada si `fields` viene vacío**: un log por cada consulta limpia es ruido, y el ruido es lo que hace que nadie lea el log — que es justo lo que la decisión cerrada 7 quiere evitar.

**Por qué puerto y no un `console.warn` suelto en el dominio** (`design.md > 8`): el dominio no conoce el mundo exterior, y —más práctico— **R6 solo es testeable si el test puede espiar la llamada**; un `console.warn` suelto obliga a parchear la consola global y ensucia el resto de la suite.

**T8/T9 — los dos casos de uso**, en los cinco pasos del `design.md > 1`: `requireAdmin` (primera línea, siempre) → `createListQuerySchema().safeParse` → `sanitizeListQuery` → `log.ignoredFields` → repositorio con la consulta **ya saneada**.

**`productQuerySchema` y `ProductQuery` DESAPARECEN de `page.ts`** (R24): productos deja de tener forma propia. `pageQuerySchema` y `Page<T>` **se quedan**, que los usan los demás listados.

**T14/T15 — los dos adaptadores.** `orderBy` dinámico con desempate por `id`; `where` con los cuatro filtros en conjunción; **el mismo `where` para el `findMany` y para el `count`**. `presentations` no lleva filtro de vida porque **no tiene `deleted_at`**. La búsqueda es `nameNormalized: { contains: normalizeProductName(search) }` **sin `mode: 'insensitive'`**: la columna ya está normalizada, y normalizar el término con la MISMA función que escribe la columna es lo que hace que buscar y comparar dejen de discrepar (R19).

### Las dos decisiones tardías, con la forma exacta que se usó

- **Nulos al final**: `orderBy: [{ stock: { sort: dir, nulls: 'last' } }, { id: 'asc' }]`, igual para `qtyAlert`, **en `asc` y en `desc`**. **Comprobado contra la Prisma 6.19.3 del repo antes de darlo por bueno**, no supuesto: el cliente generado declara `SortOrderInput = { sort: SortOrder; nulls?: NullsOrder }` y `ProductOrderByWithRelationInput` lo acepta **solo en las columnas anulables**. En `presentations` no hay ninguna columna ordenable anulable, así que allí no se declara nada — no hay nulos que colocar.
- **`dateRange` en UTC**: `{ gte: <día>T00:00:00.000Z, lt: <día siguiente>T00:00:00.000Z }`. Se eligió `lt` del día siguiente en vez de `<= 23:59:59.999Z` **y está comentado en el código**: Postgres guarda `timestamptz` con precisión de microsegundo, así que `23:59:59.9995Z` existe y el `<=` la perdería. Una fecha ilegible se trata como «sin cota por ese lado» y no puede reventar la consulta.

### Tests heredados tocados, con su motivo

1. `tests/unit/inventario/authorization.test.ts` — las dos factorías reciben ahora `log`. Se añadió un doble del puerto **que también explota** y un aserto **nuevo**: el log **no** se llama cuando la autorización falla. **R34 sale reforzado, no aflojado.**
2. `tests/unit/inventario/product-service.test.ts` y `presentation-service.test.ts` — el `toHaveBeenCalledWith({ page: 2 })` pasa a la consulta **ya saneada** `{ page: 2, sort: null, filters: {}, search: '' }`. Es el cambio de contrato de R24; **el aserto sigue siendo exacto**.
3. `tests/integration/inventario/product-crud.int.test.ts` — solo el helper `collectAllPages` construye un `ListQuery` completo. **Ningún aserto tocado.**
4. `tests/unit/proveedores/module-contract.test.ts` y `tests/unit/unidades/module-contract.test.ts` — afirman la lista **exacta** de `ports/`; el puerto de T7 la cambia. Se añadió `list-query-log.ts` a lo esperado: **siguen siendo `toEqual` exactos**, y un puerto de más sigue cayendo ahí.

**Ni `app/` ni `components/` se tocaron, y no hizo falta**: el esquema nuevo acepta tal cual `{page, pageSize}` y `{page, pageSize, search}`, que es exactamente lo que emiten hoy `product-list-section.tsx` y `product-picker.tsx`. Eso adelanta buena parte de T21.

## Grupos 3 y 4 — los cuatro módulos restantes (T10–T13, T16–T20) · commit `e4f1f72`

### Unidades: la página opcional (`design.md > 7`, R27, R28) — lo más delicado de la ficha

`listUnits(input, actor)` con `input` **opcional**, y **un solo caso de uso**, no dos métodos: dos métodos obligarían a QC-39 a elegir cuál llamar según lo que traiga la URL, que es justo la decisión que este contrato quita de encima de las pantallas.

La discriminación va en dos planos:
- **En compilación**, con dos firmas sobrecargadas: quien llama **sin** consulta recibe `readonly UnitRef[]` **sin unión que estrechar**. Por eso `listUnitsAction()` y sus tres llamantes en `app/` —el selector de unidad del formulario de recetas y la ficha de proveedor— **no se tocaron**, que es literalmente el criterio de hecho de T12.
- **En ejecución**, `requestsPagination(input)` mira la entrada **CRUDA, antes del `parse`**. Es la sutileza que hace que esto funcione: el esquema pone `page: 1` por defecto, así que **después** de validar ya no se distingue «no pidió página» de «pidió la primera».

El puerto sí tiene dos métodos (`listAll(limit, query)` / `listPage(query)`): son dos consultas SQL distintas y eso es detalle de persistencia, escrito en el propio puerto.

### Recetas: conservar la inyección de la aritmética

El puerto pasa a `listAlive(offset, limit, query)` y **no** a `listAlive(query)`. El motivo está escrito y tiene un test que lo fija: si el adaptador dedujera el `offset`, la aritmética de paginación se habría mudado a `lib/shared/pagination` **por la puerta de atrás** y la inyección de `toOffsetLimit`/`buildPage` —que existe porque `recetas` no puede importar `lib/shared/**`— habría quedado de adorno.

### Pedidos: el único cambio de comportamiento deliberado de la ficha

`status` y `priority` dejan de ser parámetros propios y pasan a filtros `select` (R25); `listOrdersSchema` y el tipo `OrderFilters` **desaparecen**.

**Regresión aceptada y exigida por el spec, anotada en el propio test:** un `status` o `priority` **fuera del conjunto cerrado ya no lanza `invalid_input`** —como hacía QC-34—; **se omite, se anota en el log y la consulta no falla** (R5). Es el precio de que el contrato sea uno solo: un campo inválido nunca tumba una lista. La poda vive en el dominio, que es quien conoce los valores y quien tiene el log; una lista mixta conserva los válidos, y si no queda ninguno el filtro desaparece.

Lo que **no** cambió y sigue con su test: un pedido `CANCELADO` **sí** se consulta; `priority` ordena por el **orden de declaración del enum** (`BAJA < MEDIA < ALTA < CRITICA`) y no por el alfabético — el test afirma las dos cosas, que ordena por prioridad **y** que eso no es el descendente alfabético; y las **tres consultas por página** con los ids deduplicados (R45 de QC-34), con su test que las **cuenta**.

`orderNumber` es la **única traducción uno-a-dos** del contrato y se resuelve **solo en el adaptador**: `[{ orderYear: dir }, { orderSequence: dir }, desempate]`. El dominio lo trata como un `columnId` cualquiera.

### `Decimal`: el dominio nunca ve uno

`cost`, `minPurchase`, `quantity` y `unitPrice` son `Decimal(14,4)` y el `numberRange` del contrato emite `number`. La conversión a `Prisma.Decimal` vive en el **adaptador** (`docs/architecture.md > Anti-patrones`: nada de comparar importes en coma flotante). Hay test de borde: un tope de `19.99` incluye `19.9900` y **excluye** `19.9901`.

### Dónde las decisiones tardías no tienen materia, dicho y no fingido

Los tres campos ordenables de `recetas` (`name`, `createdAt`, `updatedAt`) **no son anulables**, así que allí no se declara ningún `NULLS LAST`: no hay nulos que colocar. La decisión tiene materia en `products` (`stock`, `qtyAlert`), en `supplier_catalog_lines` (`minPurchase`, `deliveryTime`) y en `units.symbol`, y en los tres está explícita **en las dos direcciones** con su test. `UNIT_QUERYABLE.filterable` está vacío, así que **R15 no se puede demostrar en unidades**; se cierra en `recetas` combinando `createdAt` + `updatedAt`.

### Incidente de finales de línea, detectado y corregido

Una edición hecha con python reescribió archivos enteros convirtiendo **CRLF → LF**. Importa porque **varias guardias leen el fuente en crudo** y no despegan comentarios en CRLF: una conversión silenciosa las rompe. El agente restauró `lib/composition/index.ts` (diff real: 37 inserciones / 5 borrados, con los bloques de los otros módulos intactos), pero **se le escapó `tests/unit/proveedores/module-contract.test.ts`**, que quedó con un diff de **1192 líneas** de puro ruido.

**Detectado y corregido aquí** comparando `file` de cada archivo del diff contra su versión en `HEAD`. Tras restaurar CRLF, el cambio real de ese archivo son **7 líneas**: `list-query-sql.ts` añadido a la lista **exacta** de `adapters/driven/`. Ningún otro archivo quedó afectado.

## Grupo 5 — llamantes (T21, T22)

**Ni una línea de código ejecutable cambió en `app/`.** El contrato nuevo acepta tal cual lo que las pantallas ya emiten —`{page, pageSize}` y `{page, pageSize, search}`— porque `sort`, `filters` y `search` tienen defecto en el esquema. Eso es lo que hace que **T21 no sea una migración de llamantes sino una de documentación**, y que el selector de unidad del formulario de recetas siga verde **sin tocarlo**, que es el criterio de hecho de T12.

Lo que sí había que arreglar, y no es cosmético: **once archivos afirmaban por escrito cosas falsas**. En este repo los comentarios de cabecera son contrato documentado; varios mandaban al lector a buscar `productQuerySchema` y `listOrdersSchema`, **símbolos que esta ficha borró**.

Lo más importante que ahora queda escrito: **la búsqueda de productos ignora ACENTOS**. Antes era `contains` + `mode: 'insensitive'` (solo mayúsculas); ahora compara contra `name_normalized` servida por el GIN de trigramas, así que **buscar «solucion» encuentra «Solución Buffer pH 7», que antes NO encontraba**. Es una mejora **visible para el usuario**, y justo la clase de cambio que si no se documenta nadie sabe que puede usar.

En `supplier-list-toolbar.tsx` el porqué cambió de raíz: la decisión de no poner un buscador de cliente **sigue siendo correcta**, pero ya no porque el dominio no sepa buscar —ahora sabe—, sino porque **esa pantalla todavía no emite el contrato**, que es de QC-44/QC-45. Se reescribió con esa honestidad en vez de dejar una justificación que había dejado de ser cierta.

**T22 no tenía llamantes de producción que adaptar**: el listado de pedidos **no tiene pantalla** (QC-35 sigue `pending`), así que sus únicos consumidores eran tests, ya adaptados con el cambio de contrato.

## Dos hallazgos para el reviewer (ninguno se resolvió aquí, y es deliberado)

1. **`pageQuerySchema` quedó HUÉRFANO en producción.** Grep exhaustivo sobre `lib/` y `app/`: ningún archivo de producción lo importa ni lo llama. Solo sobrevive definido en cuatro `domain/page.ts`, reexportado por sus barrels, y usado por cuatro tests de contrato. Su forma de `page`/`pageSize` está replicada literalmente dentro de `createListQuerySchema()`, así que **borrarlo no perdería ninguna garantía** — pero eso es una decisión de contrato que ninguna task de esta ficha pide, y **retirar un símbolo público del barrel de cuatro módulos no se hace de paso**.
2. **`createListQuerySchema()` usa `z.strictObject`**, así que una clave **de primer nivel** desconocida **sí** hace fallar la consulta con `ValidationError`. **No contradice R5**: la tolerancia de R5 es para *campos no declarados* dentro de `sort` y `filters`, que es donde vive la lista blanca, y la forma del contrato es fija por R1 y R3. Se anota porque la distinción es fina y el reviewer la va a mirar: `{page: 1, foo: 2}` se rechaza; `{page: 1, sort: {columnId: 'foo', direction: 'asc'}}` se **omite y se registra**.

## Mapa de trazabilidad `R1..R35 -> test` (`CHECKPOINTS.md > Trazabilidad`)

Abreviaturas: **LQ** `tests/unit/inventario/list-query.test.ts` · **LB** `tests/unit/shared/listas-blancas-listados.test.ts` · **GC** `tests/guards/guard-contrato-listados.test.ts` · **LOG** `tests/unit/shared/list-query-log.test.ts` · **UI-inv** `tests/unit/inventario/list-use-cases.test.ts` · **UI-prov** `tests/unit/proveedores/list-use-cases.test.ts` · **LR** `tests/unit/recetas/list-recipes.test.ts` · **LU** `tests/unit/unidades/list-units-query.test.ts` · **LO** `tests/unit/pedidos/list-orders.test.ts` · **MIG** `tests/unit/inventario/schema/list-query-indexes-migration.test.ts` · **INT-x** los `tests/integration/**/list-query-*.int.test.ts` de cada listado.

| R | Qué exige | Test que lo cierra |
| --- | --- | --- |
| R1 | un solo contrato, misma forma | LQ acepta una consulta completa y devuelve la misma forma para cualquier listado / sin nada aplica los defectos · GC aplica los mismos defectos en los cinco |
| R2 | los SIETE listados lo aceptan | LB son SIETE, una por listado de R2 + los casos de uso de los siete (UI-inv x2, UI-prov x2, LR, LU, LO) |
| R3 | campo por nombre de la base; añadir uno no cambia la forma | LQ deja intacta una consulta que solo pide campos declarados / anadir un campo consultable no cambia la forma de la consulta |
| R4 | cada listado declara su lista blanca | LB cada una declara al menos un campo ordenable y ninguno repetido / son SIETE |
| R5 | campo no declarado: se omite, NO falla | LQ omite el orden por un campo no declarado y NO falla / omite un filtro por un campo no declarado · GC · LO un estado o una prioridad fuera del conjunto cerrado se OMITEN y se anotan |
| R6 | se anota en el log del servidor | LOG (3 casos) · UI-inv, UI-prov, LR, LU, LO el log recibe NOMBRES de campo y nunca el valor buscado ni el del filtro |
| R7 | `deletedAt` nunca consultable; nada borrado sale | LQ omite deletedAt como orden y como filtro / omite deletedAt AUNQUE una lista blanca lo declarase · LB ninguna declara deletedAt ni nameNormalized · GC · INT de products, recipes, suppliers, catalog-lines y orders una fila borrada que cumple el filtro sigue sin aparecer y no cuenta en el total |
| R8 | forma de filtro equivocada: se omite | LQ omite un filtro cuya FORMA no es la que el campo declara / un campo ordenable no se vuelve filtrable · GC · UI-inv, UI-prov, LR, LU, LO un filtro con la forma equivocada se omite y se anota, sin fallar |
| R9 | como mucho UN campo de orden | LQ rechaza una LISTA de ordenes / rechaza una direccion que no sea asc o desc · GC rechaza en los cinco: una LISTA de ordenes |
| R10 | orden aplicado + desempate estable por id | INT-products cuatro homonimos con el mismo valor de orden no se repiten ni se pierden entre paginas, y sus gemelos en presentations, recipes, units, suppliers, catalog-lines y orders · INT-orders orderNumber ordena por el par (ano, correlativo) |
| R11 | sin orden, el orden de HOY | UI-inv, LR, LU sin orden la consulta llega con sort nulo · INT de los 7 sin orden explicito el orden es el de HOY (catálogo `created_at ASC` y NO `name ASC`; pedidos `priority DESC` primero) |
| R12 | exactamente CUATRO formas de filtro | LQ acepta las CUATRO formas de filtro y ninguna mas / rechaza un QUINTO kind · LB todo campo filtrable declara una de las cuatro formas · GC |
| R13 | todo sobre el conjunto completo, ANTES de paginar | INT de los 7: la fila que en el orden de hoy esta en la pagina 3 aparece en la 1 al ordenar al reves |
| R14 | `total` y `totalPages` describen lo ya filtrado | INT de los 7: el total describe el conjunto YA FILTRADO |
| R15 | varios filtros a la vez, en conjunción | INT-products dos filtros a la vez: una fila sale solo si cumple LOS DOS · INT-catalog-lines presentacion, rango de costo y rango de entrega en conjuncion · INT-orders estado, prioridad y los dos a la vez · INT-recipes rango de creacion Y rango de edicion |
| R16 | búsqueda: una propiedad, contra `name` | INT de products, presentations, recipes, suppliers, catalog-lines y units: la busqueda es por SUBCADENA · UI-inv la busqueda del contrato llega al repositorio |
| R17 | pedidos no busca: se omite y se registra | LO la busqueda se OMITE y se registra, y la lista vuelve igual · `tests/unit/pedidos/order-input.test.ts` la busqueda por texto se OMITE y se anota · LB pedidos es el UNICO listado que no busca · GC · INT-orders la busqueda NO recorta nada |
| R18 | ignora acentos y mayúsculas | INT-products buscar «solucion» encuentra «Solución Buffer pH 7», y sus gemelos en presentations, recipes, suppliers, catalog-lines y units |
| R19 | misma forma normalizada que la unicidad | `tests/unit/inventario/product-name.test.ts` (8 casos) · `list-query-indexes.int.test.ts` el adaptador escribe name_normalized en toda alta y edicion · los INT de búsqueda, que comparan contra la MISMA función del dominio |
| R20 | búsqueda vacía o de espacios, sin búsqueda | LQ trata una busqueda de solo espacios como ausencia de busqueda / corta una busqueda absurdamente larga · GC · UI-inv, UI-prov, LR, LU |
| R21 | índice para todo campo ordenable o buscable | MIG crea los 35 indices declarados / no crea ningun indice de mas / los seis de busqueda son GIN · `list-query-indexes.int.test.ts` los 35 indices nuevos existen / la extension pg_trgm esta instalada / los indices que ya existian siguen todos ahi |
| R22 | migración versionada con su `down.sql` | MIG down.sql revierte exactamente el up (4 casos, incluido NO hace DROP EXTENSION y lo dice por escrito) + el ciclo real `db:migrate` → `db:rollback` → `migrate status` → `db:migrate` |
| R23 | columna normalizada poblada para las filas YA existentes | MIG la anade, la rellena y solo despues la pone NOT NULL · `list-query-indexes.int.test.ts` el backfill dejo la columna igual a lo que devuelve normalizeProductName / products.name_normalized existe, es texto y es NOT NULL |
| R24 | productos pierde su búsqueda propia; el selector sigue encontrando | UI-inv el selector de ingredientes encuentra por nombre A TRAVES DEL CONTRATO · `tests/unit/recetas-ui/recipe-form.test.tsx` (heredado, verde) · el borrado de `productQuerySchema` lo fija el typecheck |
| R25 | pedidos pierde estado y prioridad propios; CANCELADO se consulta | LO estado y prioridad son filtros select, opcionales y COMBINABLES · `order-view.test.ts` los filtros del listado son solo estado, prioridad y fecha · INT-orders un pedido CANCELADO SI se consulta; uno BORRADO no sale nunca |
| R26 | lo que hoy verifican productos y pedidos sigue verificándose | la suite heredada entera, adaptada y verde: `product-crud.int`, `product-service`, `presentation-service`, `order-repository.int`, `order-input`, `order-view` y los `authorization` de los cinco módulos |
| R27 | unidades acepta orden, filtro y búsqueda | LU el orden, el filtro y la busqueda se aplican TAMBIEN en el modo catalogo / con page devuelve una Page de UnitRef · INT-units |
| R28 | unidades sin parámetros, catálogo entero sin paginar | LU SIN PARAMETROS devuelve el catalogo entero / con una consulta SIN page ni pageSize sigue siendo el catalogo entero · `unit-actions.test.ts` (heredado) |
| R29 | 10 por defecto, 25 de tope, ACOTANDO | INT de los 7: pedir 100 por pagina se ACOTA a 25, no se rechaza · LU con pageSize a solas tambien devuelve una pagina |
| R30 | zod DENTRO del caso de uso | UI-inv, UI-prov, LR, LU, LO la entrada que no cumple la FORMA se rechaza antes de tocar el repositorio · todo el bloque del esquema del contrato de lista en LQ |
| R31 | el esquema vive en su módulo; el dominio no depende de fuera | GC ninguno de los cinco importa lib/shared, Prisma, next ni components / los cinco importan zod y nada mas / dispara con un fuente sintetico que importa lo prohibido / no se ciega por un comentario que nombre una ruta prohibida |
| R32 | los cinco esquemas aceptan y rechazan LO MISMO | GC, bloques 1 y 2 completos (19 casos), y **se comprobó que falla** al divergir uno |
| R33 | autorización en el caso de uso, sin cambiar quién ve qué | los `authorization.test.ts` de los cinco módulos + UI-inv, UI-prov, LR, LU, LO autorizacion antes que todo |
| R34 | sin autorización falla SIN tocar el repositorio | UI-inv, UI-prov, LR, LU, LO rechaza al Operador y al actor ausente, con consulta valida Y con consulta con campos no declarados, sin tocar el repositorio — **contando invocaciones del mock**, y afirmando además que **el log tampoco se llama** |
| R35 | unitarios e integración, y NINGÚN E2E nuevo | **Verificado, no afirmado**: `git diff --name-status origin/dev...HEAD -- e2e/` devuelve **una sola `M`** (`e2e/recetas.spec.ts`, adaptado a la columna NOT NULL) y **ninguna `A`**. Cero E2E añadidos. **Motivo** (`design.md > 12`, decisión cerrada 19): es backend sin pantalla, no hay camino de usuario que recorrer; la cobertura E2E se difiere a las fichas que consuman el contrato (QC-56, QC-35, QC-39, QC-45). **Precedente: QC-20, QC-25 y QC-34**, que cerraron con el mismo criterio |

**Ningún `R<n>` de R1 a R35 queda sin test.**

### El test en negativo que `design.md > 12` exige, y dónde está

«Pedir orden por `deletedAt` y comprobar **las tres cosas a la vez** — que responde, que el orden aplicado es el de por defecto, y que el log recibió el campo. Comprobar solo la primera pasa en verde con un `catch` vacío.»

Está en los **cinco** módulos, con ese nombre: UI-inv, UI-prov, LR, LU y LO, caso `ordenar por deletedAt: no falla, aplica el orden por defecto Y el log recibe el campo`.

## T23 — el gate completo, y el único punto que NO cierro yo

`./init.sh` **completo**, última ejecución:

```
✓ regla max-2-por-zona respetada (in_progress=1)
✓ specs presentes para features sdd en vuelo
-> pnpm run typecheck   → tsc --noEmit, sin salida (verde)
-> pnpm run lint        → eslint, sin salida (verde)

 Test Files  3 failed | 195 passed (198)
      Tests  4 failed | 2293 passed | 4 skipped (2301)

hay 1 archivo(s) de test en rojo que NO estan en el baseline:
  tests/unit/proveedores-ui/catalog-line-sheet.test.tsx
✗ hay rojos NUEVOS respecto del baseline
```

De partida eran **180 archivos / 2058 tests**; ahora **198 / 2301**: la ficha añade **18 archivos de test y 243 tests**.

### Los 3 archivos rojos, uno por uno

**Dos están en `tests/baseline-rojos.json` y el gate los tolera** — `tests/unit/recetas/module-contract.test.ts` y `tests/unit/recetas-ui/recipe-route-contract.test.ts`. Son guardias de alcance de QC-26/QC-34 que afirman «esta feature no toca `lib/modules/recetas`». QC-57 **sí** lo toca, legítimamente y por spec (recetas es uno de los siete listados). Es el mismo patrón estructural de la guardia de proveedores: una guardia que pregunta por el diff de la rama se rompe con **cualquier** ficha posterior que toque su módulo. **No se tocaron**: son de otras fichas y decidir si se actualizan o se retiran del baseline no es de esta ficha.

**El tercero es el que deja el gate en rojo, y NO es una regresión de esta ficha:**
`tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`, `Error: Test timed out in 5000ms`.

**Diagnóstico medido, no supuesto** — cuatro observaciones:

1. **En aislado pasa**: `Test Files 1 passed / Tests 20 passed`, pero tarda **30,8 s** para 20 tests.
2. **El rojo se MUEVE de archivo entre corridas**: una vez fue `catalog-line-sheet`, otra `catalog-line-sheet` + `supplier-page`. Es la firma de un flake de saturación, no de un fallo determinista.
3. **Corriendo SOLO el proyecto `ui`** (36 archivos, 439 tests, **sin un solo test de integración de esta ficha**) **sigue fallando** uno por timeout. Es decir: **la causa no es la carga que añade QC-57**, es que la suite jsdom va justa contra el timeout por defecto de 5 s de Vitest.
4. **Con `--testTimeout=20000` todo se pone verde**: el proyecto `ui` solo → `36 passed / 439 passed`; y la suite entera → solo quedan los **2 rojos de baseline**.

**Esta ficha no toca `app/` ni `components/` de proveedores, ni una línea de código ejecutable de UI.**

### Lo que hace falta decidir, y por qué NO lo he hecho yo

La corrección obvia es **declarar un `testTimeout` explícito para el proyecto `ui` en `vitest.config.mts`** (hoy no hay ninguno: se hereda el defecto implícito de 5 s de Vitest). **No es relajar ningún aserto** —no cambia ni una afirmación—, es poner un valor explícito donde había uno implícito y demasiado justo para jsdom + `userEvent`.

**No lo he aplicado por cuenta propia** porque `vitest.config.mts` es **el gate de TODAS las features**, no solo de esta: cambiarlo altera el veredicto de las fichas que corren en paralelo, y eso es una decisión del leader y del humano, no de un implementer cerrando su tanda.

**Las dos salidas, para quien decida:**

- **Recomendada:** `testTimeout: 20000` en el proyecto `ui` de `vitest.config.mts`, con el comentario de por qué. Una línea, y el gate vuelve a responder lo único que debe responder.
- **Descartable pero posible:** meter los archivos en `tests/baseline-rojos.json`. **Es peor**, y `docs/verification.md` lo dice casi con estas palabras: el baseline es «el sitio donde cualquiera mete lo que le estorba», y además **no funcionaría** — el flake **cambia de archivo**, así que habría que listar toda la carpeta de UI y el gate dejaría de morder ahí para siempre.

**Nada de esta ficha depende de esa decisión**: typecheck, lint, las 15 guardias, los 2301 tests menos el flake, y el ciclo real de migración y rollback están verdes.
