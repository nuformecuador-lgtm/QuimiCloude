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
