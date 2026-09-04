# QC-34 — crud-de-pedidos · bitacora de implementacion

> Zona: `backend` · Complejidad: `high` · Rama: `feature/QC-34-crud-de-pedidos`
> Worktree: `.worktrees/QC-34-crud-de-pedidos`. Spec aprobado por el humano el 2026-09-04 (F1.4).
> El gate (`./init.sh --rapido` y `./init.sh` completo) lo corre el **leader**, no esta bitacora.

## T0 — Lo que se hereda montado y NO se re-crea

Verificado **contra el arbol de la rama**, no contra el documento. Comando y resultado en cada fila.

| Se hereda | Comprobado en el arbol | Estado |
| --- | --- | --- |
| `Order`, `OrderStatus`, `OrderPriority` | `db/schema.prisma` lineas 372-387 (`enum OrderStatus` con 3 valores; `enum OrderPriority` con 4 en orden `BAJA, MEDIA, ALTA, CRITICA`) y 421-443 (`model Order`, 15 campos, `@@unique([orderYear, orderSequence])`, 4 `@@index`) | OK, se consume |
| Migracion de QC-33 | `db/migrations/20260903191204_orders/{migration.sql,down.sql}` presentes | OK, no se toca |
| Los cinco `CHECK` de QC-33 | En `migration.sql` de QC-33: `orders_quantity_positive` (`> 0`), `orders_unit_price_non_negative` (`>= 0`), `orders_delivered_not_deleted`, `orders_order_sequence_positive` (`> 0`), `orders_order_year_matches_created_at` (`AT TIME ZONE 'UTC'`) | OK. **Solo se toca el tercero** (R32); los otros cuatro se satisfacen, no se cambian |
| `domain/order-number.ts` | Exporta `OrderId`, `OrderNumber`, `formatOrderNumber` | OK, se consume (R14) |
| `domain/order-classification.ts` | Exporta `ORDER_STATUS_VALUES`, `OrderStatus`, `ORDER_PRIORITY_VALUES`, `OrderPriority`, `DEFAULT_ORDER_STATUS`, `DEFAULT_ORDER_PRIORITY` | Se consume; **unico cambio permitido**: anadir `CANCELADO` a `ORDER_STATUS_VALUES` (T3) |
| `domain/order-contents.ts` | Exporta `OrderContents` | OK, se consume |
| `lib/shared/pagination.ts` | Exporta `DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 25`, `toOffsetLimit`, `buildPage` | OK, se **consume** (R37), no se reimplementa |
| `UnitCatalog.findRefs` | `lib/modules/unidades/index.ts` reexporta `type { UnitCatalog, UnitId, UnitRef }`; `lib/composition/index.ts:224` ya construye `const unitCatalog: UnitCatalog = { findRefs: findUnitRefs }` | OK. `unidades` **no se amplia**; se reutiliza la constante existente (design 6.3) |
| `ROLE_ADMINISTRADOR` | `lib/modules/identity/index.ts:17` lo reexporta desde `./domain/roles` | OK. `pedidos` lo importa del **barrel**; no declara constante propia (R4) |
| Sesion real (QC-8) | `identity.getSessionUser()` cableado en `lib/composition` | OK, se consume en el driving |
| Las tres guardias | `tests/guards/guard-arquitectura-modulos.test.ts`, `guard-rls-force.test.ts`, `guard-dependencias-aprobadas.test.ts` | OK, se ejecutan; **ninguna se relaja** |
| `tests/unit/pedidos/module-contract.test.ts` | Existe (569 lineas) | Se amplia donde toque |
| `tests/unit/pedidos/schema/pedidos-migration.test.ts` | Existe (790 lineas, QC-33). Localiza su migracion **por sufijo `_orders`**, asi que la migracion nueva (`_order_cancellation`) no la confunde | Se **amplia** con el bloque de la migracion de QC-34 (T9) |
| Carpetas vacias | `lib/modules/pedidos/ports/.gitkeep`, `adapters/driven/.gitkeep`, `adapters/driving/.gitkeep` | Presentes. Se **borran** al aparecer el primer archivo real de su carpeta (R52) |

**Nada de esto se re-crea.** Ninguna tabla nueva, ninguna columna fuera de `cancellation_reason`,
ningun indice nuevo, ninguna FK nueva (R48).

### Preparacion del worktree (no es una task; queda anotado)

- `pnpm install --frozen-lockfile` (el worktree venia sin `node_modules`).
- `cp ../../.env .env` (el `.env` esta en `.gitignore` y no viaja con el checkout).
- `pnpm exec prisma generate`.
- Estado de la base local: `prisma migrate status` -> *Database schema is up to date*. **Aviso:** la
  base local es compartida con la sesion paralela de QC-52 y ya tiene aplicada
  `20260904123854_split_product_and_supplier_catalog`, que **no existe en esta rama**. `migrate
  status` la tolera y `scripts/db-rollback.ts` elige la ultima migracion **de la carpeta local**, no
  de la base, asi que un `db:rollback` de esta rama nunca puede revertir la de QC-52.

---

## Tanda 1 — Grupo A (T1–T6) + T10. Cerrada 2026-09-04

Delegada a `backend_dev` en dos hilos paralelos sin solape de archivos: uno sobre
`lib/modules/pedidos/**` + `db/schema.prisma` (T1–T6), otro sobre `lib/modules/recetas/**` (T10).

### Archivos creados

| Archivo | Task | Que aporta |
| --- | --- | --- |
| `lib/modules/pedidos/domain/actor.ts` | T1 | `Actor`, `requireAdmin`. `ROLE_ADMINISTRADOR` del **barrel** `@/lib/modules/identity`; ninguna constante de rol propia (R4). Igualdad exacta, falla cerrado (R2, R3) |
| `lib/modules/pedidos/domain/errors.ts` | T1 | `PedidosError` + las **nueve** clases con el `code` exacto de `design.md > 7.5` (R56) |
| `lib/modules/pedidos/domain/page.ts` | T1 | `Page<T>`, `PageQuery`, `pageQuerySchema`. Copia de `recetas`/`proveedores`; el defecto y el tope los aplica `lib/shared/pagination` en el adaptador (R36, R37) |
| `lib/modules/pedidos/domain/order-transitions.ts` | T4 | `ALLOWED` literal de `design.md > 5`, `isAllowedTransition` (predicado puro) y `assertTransition` (R22, R23) |
| `lib/modules/pedidos/domain/order-input.ts` | T5 | Los cuatro esquemas `zod`. `EDITABLE_STATUS_VALUES` **derivado** de `ORDER_STATUS_VALUES`, no escrito a mano. Decimales como **cadena**, nunca `number` (R9, R17, R18, R19, R24, R27, R36, R55) |
| `lib/modules/pedidos/domain/order-view.ts` | T6 | `NewOrder`, `OrderRow`, `OrderView`, `OrderSummary`, `OrderFilters`. Sin `total` (R47), sin `deletedAt` (R40) |
| `lib/modules/pedidos/ports/order-repository.ts` | T6 | Los **seis** metodos de `design.md > 7.4`. Resultados discriminados, nunca SQLSTATE |
| `tests/unit/pedidos/scope.test.ts` | T2 | R37, R52, R53, R57, R58 |
| `tests/unit/pedidos/order-transitions.test.ts` | T4 | La matriz **completa 4x4** (16 pares) |
| `tests/unit/pedidos/order-input.test.ts` | T5 | Los rechazos del borde |
| `tests/unit/pedidos/order-view.test.ts` | T6 | `@ts-expect-error` que demuestra que `NewOrder` **no puede expresar** `CANCELADO` ni `cancellationReason` |
| `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts` | T10 | Una sola `prisma.recipe.findMany({ where: { id: { in: ids } } })`, **sin** filtro de `deletedAt`, mapeando `isDeleted` (R44, R45) |
| `tests/unit/recetas/recipe-catalog.test.ts` | T10 | 13 casos con doble de Prisma: la receta de baja **vuelve** con `isDeleted: true` y su nombre |

### Archivos modificados

| Archivo | Task | Cambio |
| --- | --- | --- |
| `db/schema.prisma` | T3 | `enum OrderStatus` gana `CANCELADO` (**cuarto**); `Order` gana `cancellationReason String? @map("cancellation_reason")`. **Nada mas** (R48) |
| `lib/modules/pedidos/domain/order-classification.ts` | T3 | `CANCELADO` cuarto en `ORDER_STATUS_VALUES`, **en el mismo orden** que el esquema |
| `lib/modules/pedidos/ports/.gitkeep` | T6 | **BORRADO** (`git rm`): la carpeta ya tiene archivo real (R52) |
| `tests/unit/pedidos/schema/pedidos-schema.test.ts` | T3 | `ORDER_COLUMNS` a 15; `OrderStatus` a cuatro valores; **caso nuevo**: la columna es anulable, sin `@db.VarChar(n)` y sin `@default` (el tope de 500 vive en `zod`, R27) |
| `tests/unit/pedidos/module-contract.test.ts` | T3, T4 | Tres ampliaciones, **ninguna relajacion**: (1) las tres carpetas pasan a **exclusion mutua** (vacia => solo `.gitkeep`; con codigo => ningun `.gitkeep`); (2) enum de cuatro valores; (3) el caso «la base no declara ninguna transicion» (QC-33 R19) pasa a vigilar **unicidad**: la tabla vive solo en `domain/order-transitions.ts` y el SQL de `orders` no tiene ningun `TRIGGER` (R23) |
| `tests/integration/pedidos/pedidos-constraints.int.test.ts` | T3 | `'cancellation_reason'` anadida a la lista **exacta** de columnas. Va la **primera**: el `sort()` es lexicografico y `'ca' < 'cr'` |
| `lib/modules/recetas/domain/recipe-catalog.ts` | T10 | AMPLIADO (append). `RecipeId` intacto; anade `RecipeRef` y `RecipeCatalog.findRefsIncludingDeleted` |
| `lib/modules/recetas/index.ts` | T10 | `export type { RecipeId, RecipeRef, RecipeCatalog }`. **Solo tipos**: el barrel no gana nada de servidor |
| `tests/unit/recetas/module-contract.test.ts` | T10 | El caso de QC-26 que congelaba `lib/modules/recetas/` en el diff pasa de lista **vacia** a una **allowlist de tres entradas** comentada y justificada (R32/R43/R44). Ver «Decisiones» abajo |

### Salida real de los tests (estado combinado de los dos hilos, corrida por el implementer)

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida: limpio)

$ pnpm run lint
✖ 2 problems (0 errors, 2 warnings)
  app/(private)/inventario/components/product-columns.ts:66  'formatDate' is defined but never used
  tests/unit/inventario/product-page.test.tsx:9              'EMPTY_CELL' is defined but never used
  -> los dos son PREEXISTENTES y ajenos a esta ficha.

$ pnpm exec vitest run tests/unit/pedidos tests/unit/recetas tests/guards
 Test Files  40 passed (40)
      Tests  458 passed (458)
   Duration  15.07s
```

Corridas de los subagentes, para el registro: `vitest run tests/unit/pedidos` -> 8 archivos / 119
tests / 0 fallos; `vitest run tests/unit/recetas` -> 21 archivos / 228 tests / 0 fallos (baseline
QC-25 antes de tocar nada: 20 / 215; +13, ninguno caido); `vitest run guard` -> 12 archivos / 123
tests / 0 fallos; `vitest run tests/unit` entero -> 115 archivos / 1276 tests / 0 fallos.

**No se corrio la suite completa ni `./init.sh`**: eso es del leader (`AGENTS.md > Regla del gate`).
Integracion no se corrio en esta tanda (es T16/T17). La deuda conocida de
`tests/integration/identity/identity-seed.int.test.ts` —8 casos rojos por una FK al borrar
usuarios, con datos hechos a mano en la base local— **no se toco**: es decision del humano.

### Decisiones tomadas en esta tanda, declaradas

1. **`OrderRow` es una adicion al design, minima.** `design.md > 7.4` usa `OrderRow` en las firmas
   del puerto pero `> 7.3` no lo define. Se declara en `order-view.ts` como la **fila cruda** del
   puerto: sin `recipeName`/`unitName` —los resuelve el caso de uso con una consulta por pagina
   (R43, R45)— y sin `deletedAt` (R40). Sin ese tipo los seis metodos del puerto no se pueden
   escribir tal como estan en `> 7.4`.
2. **`tests/unit/recetas/module-contract.test.ts` se RETENSA, no se afloja.** Tenia un caso de
   QC-26 que exigia que **ningun** archivo de `lib/modules/recetas/` apareciera en
   `git diff origin/dev...HEAD`. Esa era la frontera de alcance de QC-26 («es una feature de
   presentacion»), no una invariante permanente: QC-34 R44 obliga a que `recetas` **amplie su
   contrato publico**, que es exactamente la salida que QC-33 R32 preve. La lista permitida pasa de
   vacia a **tres entradas nombradas una a una** (`index.ts`, `domain/recipe-catalog.ts`,
   `adapters/driven/persistence/recipe-catalog-prisma.ts`); todo lo demas de `recetas` —repositorio,
   casos de uso, Server Action, almacenamiento— **sigue congelado**. Que el cambio sea **aditivo**
   lo demuestra `tests/unit/recetas/recipe-catalog.test.ts`, no el diff. **Queda a criterio del
   reviewer.**

### BLOQUEO abierto para el leader: `listAlive` no encaja consigo mismo (afecta a T11 y T13)

`design.md` dice **dos cosas incompatibles** sobre quien traduce pagina -> `offset`/`limit`, y la
tanda siguiente (T11, casos de uso) no se puede escribir sin resolverlo. **No se improvisa.**

- **`design.md > 7.4`** fija la firma del puerto como
  `listAlive(filters, offset, limit): Promise<{ rows, total }>`, y **`> 6.4` paso 3** repite que el
  caso de uso llama `listAlive(filters, offset, limit)`. Es decir: **el caso de uso** entrega
  `offset` y `limit`.
- **`design.md > 10`** dice lo contrario, y con su motivo escrito: «Se consume
  `lib/shared/pagination.ts` tal cual... **Quien los llama es el adaptador driven** —`domain/` no
  puede importar `lib/shared/**`—; el caso de uso valida la consulta con `pageQuerySchema` y
  delega». **`> 10` es el reparto de QC-20 y QC-43**, y lo cita como tal.
- La segunda es la unica que se sostiene: `toOffsetLimit` vive en `lib/shared/pagination.ts` y
  `domain/` **no puede importarlo** —lo prohibe `docs/architecture.md > La regla de dependencias` y
  lo vigila `guard-arquitectura-modulos` (bloque 4)—. Con la firma de `> 7.4` tal cual, el caso de
  uso tendria que calcular el `offset` a mano, que es **exactamente** la reimplementacion de la
  aritmetica de paginacion que R37 prohibe y que `tests/unit/pedidos/scope.test.ts` (T2, ya escrito)
  pondria en rojo.

**Propuesta del implementer, NO aplicada, a la espera del leader.** Alinear `> 7.4` con `> 10` y con
el precedente literal `lib/modules/proveedores/ports/supplier-repository.ts`
(`listAlive(query: PageQuery): Promise<Page<SupplierView>>`):

```
listAlive(filters: OrderFilters, query: PageQuery): Promise<Page<OrderRow>>
```

El adaptador driven aplica `toOffsetLimit`/`buildPage` (R35, R37) y el caso de uso mapea
`Page<OrderRow>` a `Page<OrderSummary>` anadiendo los nombres, conservando `total`, `page`,
`pageSize` y `totalPages`. **No cambia ningun requisito**: sigue habiendo una sola llamada al
repositorio y una a cada catalogo por pagina (R45), el orden y el filtro siguen en el adaptador
(R38, R40, R41), y el defecto de 10 / tope de 25 siguen siendo de `lib/shared/pagination` (R35).
Lo unico que cambia es **la firma escrita en `> 7.4`**, que es lo que hoy se contradice con `> 10`.

Alternativa descartada por el implementer: mover `toOffsetLimit` al caso de uso importando
`lib/shared/pagination` desde `domain/`. Rompe la regla de dependencias y la guardia, y R37 no lo
permite.

`ports/order-repository.ts` esta hoy escrito con la firma **literal de `> 7.4`**
(`offset`, `limit`), que es lo que pedia T6. Si el leader acepta la propuesta, es un cambio de tres
lineas en ese archivo antes de T11.

> **Cerrado el 2026-09-04 por el leader.** Gana la seccion 10, que es lo que hace todo el repo.
> `design.md > 7.4` y `> 6.4` quedaron corregidos y llevan una **nota fechada** que explica la
> contradiccion y como se resolvio, para que el reviewer pueda verla. `ports/order-repository.ts`
> pasa a `listAlive(filters: OrderFilters, query: PageQuery): Promise<Page<OrderRow>>`.

---

## Tanda 2 — Grupo B (T7-T9) + Grupo D (T11, T12). Cerrada 2026-09-04

Dos hilos de `backend_dev` en paralelo, sin solape de archivos: uno sobre `db/migrations/**`,
`tests/unit/pedidos/schema/**` y `tests/integration/**`; otro sobre `lib/modules/pedidos/domain/**`
y los tests de servicio.

### Cambio de entorno (lo hizo el leader, y cambia el diagnostico de los rojos)

La base **compartida** dejo de servir: la sesion paralela de QC-52 le aplico su migracion. Este
worktree pasa a tener **base propia `QuimiCloude_QC34`**, con el `.env` del worktree apuntando ahi
y `prisma migrate deploy` al dia. Es el precedente de QC-20, QC-25 y QC-26.

**La trampa, y hay que escribirla:** ni `init.sh` ni Vitest ni `tsx` cargan ese `.env`. Todo comando
de esta ficha va con `set -a && . ./.env && set +a && <comando>`. Si se olvida, se pega contra la
base compartida y se leen rojos ajenos. **Con la base propia, la deuda de
`tests/integration/identity/identity-seed.int.test.ts` desaparece**: era de los datos hechos a mano
de la base compartida, no del codigo.

### T7 — `db/migrations/20260904135210_order_cancellation/migration.sql`

Escrita entera a mano, con la cabecera de aviso de drift de QC-33 y la nota de `design.md > 4.4`
sobre `setval` e importaciones. Los cinco pasos en orden: `ADD VALUE` -> `ADD COLUMN` -> `CHECK` del
motivo -> `DROP`/`ADD` del `CHECK` de borrado -> la funcion `next_order_sequence`.

**El `::text` de los dos `CHECK` no es cosmetico**: sin el, Postgres tira `55P04 unsafe use of new
value` por usar un valor de enum recien anadido en la misma transaccion. No se simplifica.

Salida real:

    Applying migration `20260904135210_order_cancellation`
    All migrations have been successfully applied.

Inspeccion del catalogo tras el UP — **los seis** `CHECK`, la columna, la funcion, el enum de cuatro
valores, y las cuatro FK y el RLS de QC-33 **intactos** (R48):

    orders_cancellation_reason_matches_status | CHECK ((((status)::text = 'CANCELADO'::text) = (cancellation_reason IS NOT NULL)))
    orders_delivered_not_deleted              | CHECK (((deleted_at IS NULL) OR ((status)::text <> ALL (ARRAY['ENTREGADO'::text, 'CANCELADO'::text]))))
    orders_order_sequence_positive            | CHECK ((order_sequence > 0))
    orders_order_year_matches_created_at      | CHECK ((order_year = (EXTRACT(year FROM (created_at AT TIME ZONE 'UTC'::text)))::integer))
    orders_quantity_positive                  | CHECK ((quantity > (0)::numeric))
    orders_unit_price_non_negative            | CHECK ((unit_price >= (0)::numeric))
    cancellation_reason | text | is_nullable: YES
    OrderStatus: PENDIENTE(1) EN_CURSO(2) ENTREGADO(3) CANCELADO(4)
    next_order_sequence(p_year integer)
    FK: orders_created_by_fkey, orders_recipe_id_fkey, orders_unit_id_fkey, orders_updated_by_fkey
    RLS: relrowsecurity=true, relforcerowsecurity=true

### T8 — `down.sql`, y el ciclo real (R49, R50)

Los cinco pasos de `design.md > 3.5`, con la guardia de datos del paso 0 y la **recreacion del
tipo**. **Nunca `ALTER TYPE ... DROP VALUE`: no existe en Postgres, en ninguna version.**

**(a) y (b) — `db:migrate` -> `db:rollback` -> `db:migrate`**, con el esquema intermedio comparado
contra el catalogo capturado **antes** de aplicar (estado QC-33):

    db:rollback: aplicando down.sql de 20260904135210_order_cancellation y borrando su fila de _prisma_migrations
    db:rollback: 20260904135210_order_cancellation revertida.
    === DIFF baseline QC-33 vs intermedio ===
    IDENTICO
    Applying migration `20260904135210_order_cancellation`
    All migrations have been successfully applied.

El `diff` compara `pg_get_constraintdef`, la columna en `information_schema`, los labels de
`pg_enum`, `pg_proc`, `pg_class relkind='S'`, el default de `status`, las FK y el RLS. El intermedio
trae el `CHECK` de QC-33 **literal**, **sin** `cancellation_reason`, enum de **tres** valores, sin
funcion ni secuencias y sin ningun `OrderStatus_old` huerfano.

**(c) — rollback con un pedido `CANCELADO` en la tabla.** La fila se inserto con
`next_order_sequence(2026)`, que **creo la secuencia al vuelo y devolvio 1** — o sea R11/R12
ejercitadas de verdad, no razonadas:

    insertado: {"order_year":2026,"order_sequence":1,"status":"CANCELADO","cancellation_reason":"prueba de la guardia de datos del down.sql (T8)"}
    === count antes ===  {"total":1}
    === rollback (debe abortar) ===
    db:rollback: la reversion de 20260904135210_order_cancellation fallo y no se aplico nada (transaccion deshecha):
    ROLLBACK ABORTADO: hay 1 pedido(s) en estado CANCELADO. Revertir esta migracion los dejaria sin
    estado valido. Decide que hacer con ellos (borrarlos fisicamente o moverlos a mano) y vuelve a intentarlo.
    === estado despues ===
    SIN CAMBIOS: esquema y filas identicos

### T9 — `tests/unit/pedidos/schema/pedidos-migration.test.ts`, ampliado

**+618 lineas, 0 borradas**: el bloque de QC-33 queda literalmente intacto. Localiza su carpeta por
sufijo `_order_cancellation`, trocea el SQL con un partidor **consciente de `$$`** —el de QC-33
parte por `;` a secas y despedazaria el cuerpo de la funcion y los dos bloques `DO`— y usa un
vocabulario ingles **propio**, sin ampliar la lista cerrada de QC-33: ampliarla habria aflojado una
guardia ajena. **Las seis mutaciones obligatorias estan y el predicado cae en las seis**,
comprobado una a una.

### T11, T12 — Los seis casos de uso y sus tests

Los seis en `domain/`, factories `createXxx(deps)`, con `requireAdmin` en la **primera linea** de
las seis. `get-order.ts` exporta `toOrderView`, que consume `list-orders.ts` para que **ficha y
listado no puedan diverger**. `create-order.ts` estrecha `DEFAULT_ORDER_STATUS` a
`EditableOrderStatus` con una **comprobacion real en carga de modulo**, no con un `as`: si alguien
pusiera `CANCELADO` de defecto, revienta al cargar en vez de abrir un segundo camino hacia una
cancelacion sin motivo.

Cinco archivos de test con dobles del puerto y de los dos catalogos. Lo que demuestran, y no es
decorativo: los seis casos de uso rechazan **siete** actores distintos —Operador, `null`,
`undefined`, rol nulo, vacio, desconocido y `'Administradores externos'`— con dobles que **lanzan si
los llaman** y `not.toHaveBeenCalled()` sobre los ocho metodos; ademas se comprueba
estructuralmente que `requireAdmin` va **antes** de `safeParse` y de cualquier `deps.*` en los seis
archivos. `list-orders` cuenta invocaciones y obtiene `[1, 1, 1]` con ids deduplicados, y el numero
de consultas **no crece** con 1, 10 ni 25 filas (R45).

### Salida real de los tests

    $ pnpm run typecheck                    -> limpio, sin salida
    $ pnpm run lint                         -> 0 errors, 2 warnings (preexistentes y ajenos)
    $ vitest run tests/unit/pedidos         -> 13 archivos, 201 tests, 0 fallos
    $ vitest run tests/integration/pedidos  -> 1 archivo,   27 tests, 0 fallos
    $ vitest run guard                      -> 12 archivos, 123 tests, 0 fallos

### Tres ajustes a tests existentes, declarados para el reviewer

1. **`tests/integration/pedidos/pedidos-constraints.int.test.ts`** — el caso «rechaza un estado
   fuera del enum con `22P02`» usaba `CAST('CANCELADO' AS "OrderStatus")` **como ejemplo de valor
   inexistente**, y T7 acaba de meter `CANCELADO` en el enum: hoy es valido como enum y muere en el
   `CHECK` de R30 con `23514`. El ejemplo pasa a `'DEVUELTO'`, que sigue sin existir en el tipo.
   **No es una relajacion**: mismo SQLSTATE, misma fuerza, y el comentario original ya lo
   anticipaba («anadir un valor manana es una migracion del tipo»).
2. **`tests/unit/pedidos/module-contract.test.ts`** — el caso «la regla de transiciones vive en un
   solo archivo» prohibia que **cualquier** otro archivo del modulo nombrase `assertTransition`, lo
   que hace **imposible** lo que el design exige: `updateOrder` **tiene** que llamar a la guardia
   (`design.md > 8`, capa 3; es lo que hace testeables R21 y R22). El predicado no distinguia
   **declarar** la tabla de **consumirla** — marcaba hasta el `import`. Se ajusta conservando los
   dientes: `DECLARA_LA_TABLA` exige `export function`/`ALLOWED`, se descuentan las dos formas
   legitimas de consumir, y **se afirma el conjunto exacto de consumidores**
   (`order-transitions.ts` + `update-order.ts`), de modo que uno nuevo sea una decision y no un
   descuido. Con tres aserciones de mutacion que demuestran que el criterio todavia puede fallar.
3. **`tests/unit/pedidos/order-view.test.ts`** — el doble del puerto devolvia
   `{ rows: [], total: 0 }`, la firma vieja de `listAlive`. Una linea, al `Page` completo.

**Ninguna dependencia nueva.** No se corrio la suite completa ni `./init.sh`: es del leader.

---

## Tanda 3 — Grupo E (T13, T14, T15). Cerrada 2026-09-04

### Archivos

Creados: `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` (T13),
`lib/modules/pedidos/adapters/driving/order-actions.ts` (T15),
`tests/unit/pedidos/order-actions.test.ts` (T15).

Modificados: `lib/modules/pedidos/index.ts` (T14, las seis factories y los tipos, **solo de
`./domain`**), `lib/composition/index.ts` (T14, **bloque nuevo al final**, reutilizando el
`unitCatalog` que ya existia y sin reordenar nada de arriba),
`tests/unit/recetas-ui/recipe-route-contract.test.ts` y `tests/unit/pedidos/module-contract.test.ts`.

**Borrados los dos `.gitkeep` que quedaban** (`adapters/driven/`, `adapters/driving/`). **Ya no queda
ninguno en `lib/modules/pedidos/`** (R52), comprobado sobre el arbol.

### Desviacion del design, minima y declarada

`design.md > 4.2` escribe el `INSERT` con el literal `'PENDIENTE'` en `status`. Se parametriza como
`${data.status}::"OrderStatus"`. Motivo: el puerto recibe `NewOrder.status`, de tipo
`EditableOrderStatus` —que **no puede expresar** la cancelacion—, y dejar el literal haria que el
adaptador **ignorara en silencio** lo que el caso de uso decide (R9). Queda comentado en el archivo.
El resto del `INSERT` es literal, con `next_order_sequence($year)` **dentro** y **un solo reloj**
para `created_at` y `order_year` (R10).

### Prueba de humo contra el Postgres real

Ademas de los tests, el adaptador se ejercito contra `QuimiCloude_QC34` con un script temporal (ya
borrado): correlativos `2026-1` y `2026-2` desde la secuencia **creada al vuelo**, decimales de
vuelta como `12.5000` y `0.0000`, `ORDER BY priority DESC` dando `ALTA` antes que `BAJA`, filtros
combinados, `updateAlive` -> `ok`/`not_found`, `cancelAlive` escribiendo estado y motivo **juntos**,
la base **rechazando** borrar el cancelado, y el borrado logico de un `PENDIENTE` sacandolo de
`findAliveById`. La base quedo **exactamente** como estaba: sin filas y sin `orders_sequence_2026`.

### CINCO retensados de tests, y el reviewer tiene que mirarlos uno a uno

Todos con **allowlist nombrada, comentada y fechada (2026-09-04)**, y en los cinco se pasa de «cero»
a «un dueno nombrado» — nunca a «cualquiera». La causa es la misma en todos: **QC-33 congelo el
armazon vacio de `pedidos` y esta ficha es, por definicion, la que lo llena**; varias premisas de
QC-33 caen por requisitos que la propia QC-33 anuncio que resolveria QC-34.

1. **`tests/unit/recetas-ui/recipe-route-contract.test.ts`** (era el unico rojo real de la tanda):
   `AMPLIACION_RECETAS_QC34` con los tres archivos de `recetas` (R43/R44 + QC-33 R32) y
   `MIGRACION_QC34` con `db/schema.prisma` y los dos `.sql` de la migracion, **nombrados uno a uno**.
   Todo lo demas de `recetas` y de `db/` sigue congelado.
2. **Cierre transitivo del barrel**: prohibia `adapters/` **y** `ports/`. El barrel publica ahora las
   seis factories, y una factory tipa su repositorio con el puerto -> `ports/` es alcanzable **por
   fuerza**. `adapters/` **sigue prohibido**, y las siete aserciones de «nada de servidor» se aplican
   a todo lo alcanzable, el puerto incluido.
3. **`prisma.order`**: de lista vacia a exactamente `order-prisma.ts`, sobre todo el repo (R53).
4. **`@prisma/client` dentro de `pedidos`**: mismo dueno unico.
5. **`driving/` vacia + «ningun `'use server'`» + «composicion no nombra pedidos»**: pasa a «un solo
   archivo driving», «`'use server'` solo ahi» y **exclusividad** de `lib/composition` (nadie mas
   importa `order-prisma`).

### Salida real

    $ pnpm run typecheck  -> limpio, sin salida
    $ pnpm run lint       -> 0 errors, 2 warnings (preexistentes y ajenos)
    $ vitest run tests/unit/pedidos/ tests/unit/recetas/ tests/unit/recetas-ui/ tests/integration/pedidos/ guard
      -> 48 archivos, 583 tests, 0 fallos

---

## Tanda 4 — Grupo F (T16, T17). Cerrada 2026-09-04

Creados `tests/integration/pedidos/order-crud.int.test.ts` (**16 casos**) y
`tests/integration/pedidos/order-sequence.int.test.ts` (**5 casos**).

**T16** (R8, R10, R30, R32, R40, R41): el alta con **la sentencia real del adaptador**
(`next_order_sequence` dentro del `INSERT`, `RETURNING` id + correlativo) y su relectura; la frontera
del **31/12/2026 a las 20:00 en Ecuador** (`order_year` 2026 -> `23514`; 2027 aceptado, y
`created_at` releido como `2027-01-01T01:00:00.000Z`); los **cuatro** casos del `CHECK` del motivo
—cancelado con motivo pasa, cancelado sin motivo `23514`, no-cancelado con motivo `23514` **en los
tres estados vivos**, no-cancelado sin motivo pasa en los tres—; los **seis** del `CHECK` de borrado
—`PENDIENTE` si, `EN_CURSO` si, `ENTREGADO` no, `CANCELADO` no, poner `ENTREGADO` a uno borrado no,
poner `CANCELADO` a uno borrado no—; `priority DESC` dando `CRITICA, ALTA, MEDIA, BAJA` con las filas
**sembradas en desorden**, y el desempate por `(order_year, order_sequence)` con `created_at`
**identico al milisegundo**; y que el borrado no vuelve en ficha ni listado —con la fila intacta—
mientras el cancelado si vuelve con su motivo.

**T17** (R11, R12, R13): primera alta de un ano **comprobando en `pg_class` que la secuencia no
existia**, sale 1, y despues existe; dos altas del mismo ano -> 1 y 2; el **hueco** (una cantidad
cero viola `orders_quantity_positive` **despues** de consumir el numero: la siguiente sale 3 y el 2
queda vacio para siempre); un ano nuevo arranca en 1 sin mover el anterior; y la **concurrencia con
dos `pg.Client` reales**: A crea la secuencia dentro de su transaccion, B queda **bloqueada** —y eso
se comprueba mirando `pg_locks` con `NOT granted AND pid = <pid de B>`, **no con un `setTimeout` a
ojo**, afirmando ademas que su promesa no ha resuelto—, A confirma y B obtiene 2. Las dos acaban
bien, con posiciones distintas.

### Tres decisiones de los tests de integracion, documentadas en la cabecera de cada archivo

1. **No se llaman las funciones del adaptador** (`createOrder`, etc.): hablan con el cliente Prisma
   **global**, asi que dentro de `prisma.$transaction` correrian en **otra conexion del pool** y
   harian `COMMIT` en la base. Se ejecuta **la misma sentencia** por `tx.$queryRaw`, que es lo que
   de verdad ejercita `next_order_sequence` dentro del `INSERT`.
2. **El caso concurrente no inserta pedidos**, solo llama a la funcion con dos conexiones: para que
   B vea la secuencia, A tiene que **confirmar**, y una transaccion no ve las FK que otra no ha
   confirmado; un alta completa concurrente exigiria **commitear fixtures** en una base que los
   demas archivos comparten. La unica huella es la secuencia, y se borra en el `finally`, en
   `afterAll` **y** en `beforeAll` —por si una corrida se interrumpio—.
3. El sexto caso del `CHECK` de borrado escribe estado **y** motivo en la misma sentencia **a
   proposito**: sin el motivo saltaria el `CHECK` de la seccion 3.3 y el test dejaria de demostrar
   el de la 3.4.

### Higiene de la base, verificada tras las corridas

`orders = 0`, secuencias `orders_sequence_% = 0`, `users = 0`, `roles = 0`, `recipes = 0`,
`document_types = 1` (solo `CC`, del seed) y `units = 4` (solo el catalogo arrancador). **Cero
residuos.** Los 48 casos de `tests/integration/pedidos/` se corrieron **dos veces seguidas** con el
mismo resultado: no dependen del orden.

---

## T18 — Trazabilidad `R<n> -> test`. Los 58 requisitos, ninguno sin test

Todas las rutas verificadas **contra el arbol de la rama**, no contra el spec. Las de
`tests/unit/pedidos/` van sin prefijo.

| R | Que exige | Test que lo cierra |
| --- | --- | --- |
| R1 | El actor entra **por parametro**; `domain/` y `ports/` no leen sesion | `authorization.test.ts` + `scope.test.ts` |
| R2 | No-Administrador rechazado **sin tocar ningun puerto** | `authorization.test.ts` (dobles que **lanzan** si los llaman) |
| R3 | Falla cerrado: sin actor, rol nulo/vacio/desconocido | `authorization.test.ts` (siete actores) |
| R4 | El rol sale de **una sola constante importada** | `authorization.test.ts` + `module-contract.test.ts` |
| R5 | El driving toma el actor de `identity.getSessionUser()` | `order-actions.test.ts` |
| R6 | Los dos autores salen del actor, **nunca** de la entrada | `order-service.test.ts` |
| R7 | RLS activada **y forzada** tras la migracion | `tests/guards/guard-rls-force.test.ts` |
| R8 | El alta persiste y devuelve id + correlativo | `order-service.test.ts` (dominio) + `integration/pedidos/order-crud.int.test.ts` (SQL) + **`order-repository.int.test.ts`** (el **adaptador real**: `toEqual` entre alta y ficha, decimales fuera de escala con `.toFixed(4)`; muere con la mutacion G) |
| R9 | Nace `PENDIENTE`/`BAJA`; no acepta estado, motivo, correlativo ni autores | `order-input.test.ts` + `order-service.test.ts` |
| R10 | El ano del correlativo y `created_at`, **del mismo instante UTC** | `order-crud.int.test.ts` (frontera 31/12 20:00 Ecuador) |
| R11 | La posicion sale de una **secuencia de la base** por ano | `order-sequence.int.test.ts` |
| R12 | La primera alta del ano **crea** la secuencia y arranca en 1; dos simultaneas acaban las dos | `order-sequence.int.test.ts` (dos `pg.Client` reales) |
| R13 | No se reutiliza una posicion consumida; se aceptan huecos | `order-sequence.int.test.ts` (el hueco, en positivo) + **`order-prisma-errors.test.ts`** (la **traduccion** del `23505` del correlativo: `isDuplicateOrderNumber` traduce con el nombre del indice y **relanza** sin el; muere con la mutacion F) |
| R14 | El numero visible se compone con la **unica** definicion publicada | `domain/order-number.test.ts` + `order-service.test.ts` |
| R15 | Receta ausente/inexistente/de baja: rechazo **antes** del repositorio | `order-service.test.ts` |
| R16 | Unidad ausente/inexistente: rechazo antes del repositorio | `order-service.test.ts` |
| R17 | Cantidad ausente, cero o negativa | `order-input.test.ts` + `order-service.test.ts` |
| R18 | Precio ausente o negativo; **el cero vale** | `order-input.test.ts` |
| R19 | Prioridad/estado fuera del conjunto cerrado, **en el borde** | `order-input.test.ts` |
| R20 | Edicion como **reemplazo completo** | `order-service.test.ts` |
| R21 | `ENTREGADO`/`CANCELADO` no admiten **ninguna** edicion | `order-service.test.ts` + `order-transitions.test.ts` |
| R22 | Las transiciones permitidas, y solo esas | `order-transitions.test.ts` (matriz **4x4 completa**) |
| R23 | La restriccion **no** baja a la base | `order-transitions.test.ts` + `module-contract.test.ts` (ningun `TRIGGER`) |
| R24 | La edicion **no** puede escribir `CANCELADO` ni motivo | `order-input.test.ts` + `order-transitions.test.ts` + `order-view.test.ts` |
| R25 | Receta de baja: se acepta si **no cambia**, se rechaza si cambia | `order-service.test.ts` |
| R26 | Cancelar es caso de uso propio y **unico** camino a `CANCELADO` | `cancel-order.test.ts` + `order-service.test.ts` |
| R27 | Motivo ausente, vacio, de espacios o de 501 caracteres | `order-input.test.ts` + `cancel-order.test.ts` |
| R28 | Se cancela desde `PENDIENTE`/`EN_CURSO`, nunca desde los finales | `cancel-order.test.ts` |
| R29 | El motivo se conserva integro y vuelve en ficha y listado | `cancel-order.test.ts` + `order-service.test.ts` + `list-orders.test.ts` |
| R30 | Motivo **si y solo si** cancelado, **en la propia base** | `order-crud.int.test.ts` (los **cuatro** casos) + `schema/pedidos-migration.test.ts` |
| R31 | Borrado logico, sin restaurar ni listar borrados | `delete-order.test.ts` |
| R32 | No se borra `ENTREGADO` ni `CANCELADO`: aplicacion **y** base | `delete-order.test.ts` + `order-crud.int.test.ts` (los **seis** casos) |
| R33 | «No encontrado» en consulta, edicion, cancelacion y borrado | `order-service.test.ts`, `cancel-order.test.ts`, `delete-order.test.ts` |
| R34 | Tamano de pagina efectivo + total | `list-orders.test.ts` (el dominio conserva la `Page`) + **`order-repository.int.test.ts`** (el `total` se cruza contra `prisma.order.count` con el **mismo `where`**, nunca escrito a mano; muere con la mutacion C) |
| R35 | Por defecto 10, tope 25, **y ninguna consulta sin limite superior** | **`integration/pedidos/order-repository.int.test.ts`** — el **unico** que lo verifica: siembra `MAX_PAGE_SIZE + 1` vivos y comprueba `pageSize` omitido -> 10, `pageSize` 100 -> **25 elementos y `pageSize` 25 en la `Page`**, con `totalPages` distinto de `ceil(total/100)`. Muere con la mutacion A |
| R36 | Pagina/tamano no enteros o menores que 1: rechazo **sin leer** | `order-input.test.ts` + `list-orders.test.ts` |
| R37 | La aritmetica de paginacion **no** se reimplementa | `scope.test.ts` + `list-orders.test.ts` |
| R38 | Filtros por estado y prioridad, opcionales y combinables | `list-orders.test.ts` (dominio) + **`order-repository.int.test.ts`** (los dos sueltos y **combinados** contra la base: el `and`, no el `or`; muere con la mutacion I) |
| R39 | Sin busqueda por texto ni filtro por numero | `list-orders.test.ts` |
| R40 | Borrados nunca; cancelados si | `list-orders.test.ts` + `order-service.test.ts` + `order-crud.int.test.ts` + **`order-repository.int.test.ts`** (los `deletedAt: null` **del adaptador**, en los dos sentidos: el borrado sale de ficha y listado pero **la fila sigue existiendo**; muere con las mutaciones E y H) |
| R41 | Prioridad DESC, antiguedad ASC, desempate por correlativo | `list-orders.test.ts` + `order-crud.int.test.ts` (con el enum real) + **`order-repository.int.test.ts`** (el `ORDER BY` **del adaptador**, ocho filas en desorden y dos `CRITICA` con el mismo `created_at` **al milisegundo**; muere con la mutacion D) |
| R42 | La ficha devuelve los campos del pedido | `order-service.test.ts` (campo a campo) |
| R43 | Nombres de receta y unidad **por contrato publico** | `order-service.test.ts` + `list-orders.test.ts` + `scope.test.ts` |
| R44 | La receta de baja **devuelve su nombre igual** | `list-orders.test.ts` + `tests/unit/recetas/recipe-catalog.test.ts` |
| R45 | **Una** consulta a cada catalogo por pagina | `list-orders.test.ts` (**contador de invocaciones**, ids deduplicados, 1/10/25 filas) |
| R46 | Los autores salen como **ids** | `order-service.test.ts` + `list-orders.test.ts` |
| R47 | El total **no** se persiste ni se anade columna | `order-view.test.ts` + `schema/pedidos-schema.test.ts` + `pedidos-constraints.int.test.ts` |
| R48 | La migracion se limita a lo declarado | `schema/pedidos-migration.test.ts` (los cuatro `ALTER TABLE` exactos **y nada mas**) |
| R49 | Revertir deja el esquema **exacto** de QC-33, recreando el tipo | `schema/pedidos-migration.test.ts` + **T8, ciclo real ejecutado** |
| R50 | Con un `CANCELADO`, la reversion **aborta** sin tocar filas | `schema/pedidos-migration.test.ts` + **T8 (c), ejecutado** |
| R51 | Identificadores de base **en ingles** | `schema/pedidos-migration.test.ts` (vocabulario propio de QC-34) |
| R52 | Forma del modulo, contrato solo de `./domain`, sin `.gitkeep` sobrantes | `scope.test.ts` + `module-contract.test.ts` + `guard-arquitectura-modulos` |
| R53 | `pedidos` no consulta receta/unidad/usuario con Prisma | `scope.test.ts` + `module-contract.test.ts` + `guard-arquitectura-modulos` |
| R54 | Server Actions: `FormData` en mutaciones, tipado en consultas; sin route handler | `order-actions.test.ts` + `scope.test.ts` |
| R55 | Toda entrada externa validada con esquema en el borde | `order-input.test.ts` + `order-actions.test.ts` |
| R56 | Errores con `code` estable, traducidos **por el `code`, nunca el texto** | `order-actions.test.ts` + los cinco tests de servicio |
| R57 | Ninguna pantalla, pagina, ruta ni E2E en esta ficha | `scope.test.ts` |
| R58 | Ninguna dependencia de terceros nueva | `scope.test.ts` + `tests/guards/guard-dependencias-aprobadas.test.ts` |

**58 de 58 con test.** Ninguno queda sin cerrar, y `CHECKPOINTS.md > Trazabilidad` se puede marcar.

### Estado final que verifica el implementer (no la suite entera: esa es del leader)

    $ pnpm run typecheck   -> limpio, sin salida
    $ pnpm run lint        -> 0 errors, 2 warnings (preexistentes y ajenos a esta ficha)
    $ vitest run tests/unit/pedidos tests/unit/recetas tests/unit/recetas-ui tests/integration/pedidos tests/guards
      -> 49 archivos, 592 tests, 0 fallos

Los tres `.gitkeep` de `lib/modules/pedidos/` estan **borrados**, comprobado sobre el arbol (R52).

**Lo que falta para cerrar T18 es el `./init.sh` completo, que corre el leader**: esta ficha acopla
SQL, tipos enumerados y forma del arbol de modulos, y **el grafo de imports no lo ve**. **F2.3 y F2.4
no se han hecho**: ni sincronizacion con `dev` ni PR, por instruccion expresa.

---

## Tanda 5 — respuesta al RECHAZO del reviewer (B1, M1, M4). Cerrada 2026-09-04

`progress/review_QC-34-crud-de-pedidos.md` rechazo la ficha por **un bloqueante**. Se arreglan B1,
M1 y M4. **M2, M3 y M5 no se tocan**: los dos primeros son del leader y M5 es un limite conocido
aceptado. **El codigo de produccion NO cambia** —`git status lib/ db/` limpio—: B1 era una carencia
de tests, no un bug.

### B1 (bloqueante) — el adaptador driven no lo ejecutaba ningun test

El diagnostico del reviewer era correcto y la consecuencia seria: los tests de integracion
ejecutaban **una copia a mano** del SQL del adaptador dentro de una transaccion revertida, y **una
copia no vigila a su original**. Con eso **R35 no lo comprobaba nada** —ni el defecto de 10, ni el
tope de 25, ni que `buildPage` reciba el `limit` **acotado**—, y R8, R13, R34, R40 y R41 se quedaban
sin su capa de adaptador.

Se arregla por la **opcion 1** de la review, que es lo que ya hacen `recipe-crud.int.test.ts` y
`supplier-crud.int.test.ts`: **llamar al adaptador real** con el cliente global y limpiar al final.
**No** se conserva el patron de transaccion revertida para esto, y **no** se usa la opcion 3 (leer el
`ORDER BY` del fuente), que la propia review califica de mas debil.

**Nuevo `tests/integration/pedidos/order-repository.int.test.ts` (7 casos).** Importa y llama las
**seis** funciones reales (`createOrder`, `findAliveOrderById`, `listAliveOrders`, `updateAliveOrder`,
`cancelAliveOrder`, `softDeleteAliveOrder`) y toma `MAX_PAGE_SIZE`/`DEFAULT_PAGE_SIZE`/`toOffsetLimit`
de `@/lib/shared/pagination` en vez de escribir 25 y 10 a mano. Cubre R8, **R35**, R41, R40, R34/R38
y los discriminantes `ok`/`not_found` sobre inexistente **y** sobre ya borrado.

**El caso que no existia en ningun sitio (R35):** con 26 pedidos vivos sembrados, `pageSize: 100`
devuelve **25 elementos y `pageSize: 25` en la `Page`**, y se afirma ademas que `totalPages` **no** es
`ceil(total/100)`. Eso es lo que demuestra que `buildPage` recibe el `limit` acotado y no el pedido
—el error contra el que avisa el comentario del propio adaptador, que dejaria un `totalPages`
mentiroso—.

**Nuevo `tests/unit/pedidos/order-prisma-errors.test.ts` (7 casos)** para `isDuplicateOrderNumber`
(R13): un `PrismaClientKnownRequestError` con `meta.code` `23505` **y** el nombre del indice ->
`true`; con `23505` **sin** ese nombre -> `false`, para demostrar que **relanza** en vez de traducir
mal.

**Aislamiento:** cada caso siembra lo suyo y lo borra **por id exacto** en un `finally`, sin ninguna
afirmacion global; usa anos de prueba 2881-2886 —distintos de los 287x de `order-sequence`— para que
el correlativo salga de una secuencia de prueba y no de la del ano real, y `beforeAll`/`afterAll` las
borran.

### M1 — R4 se comprobaba sobre 7 de los ~15 archivos del modulo

`authorization.test.ts` barria una lista escrita a mano. Ahora recorre **el arbol entero** de
`lib/modules/pedidos/**` (con un suelo de **19** archivos, para que la lista no pueda vaciarse en
silencio), que es lo que R4 pide de verdad: «**ningun** archivo de `lib/modules/pedidos/**`».

### M4 — nota fechada que faltaba

`design.md > 4.2` ya lleva su nota del 2026-09-04 sobre la parametrizacion del `status` en el
`INSERT`, con la misma forma que la de paginacion de `> 7.4`. Cita el hallazgo **M4** y que el
reviewer califico la desviacion de «CORRECTA» (review, punto 3). **No** se le atribuye al leader una
aprobacion que no consta en disco (regla 6 de `CLAUDE.md`).

### Las dos correcciones se verificaron POR MUTACION, no solo corriendolas

No basta con que el test nuevo pase; hay que demostrar que **puede caer**. Mutando el codigo real y
revirtiendolo despues (`git status lib/` limpio en las dos):

| Mutacion | Resultado |
| --- | --- |
| `buildPage(..., query.pageSize ?? limit)` en `order-prisma.ts` | **ROJO**: `AssertionError: expected 100 to be 25` — exactamente el `totalPages` mentiroso |
| `export const MUTACION_TEMPORAL = 'Administrador'` en `domain/order-input.ts` (archivo que **antes no se miraba**) | **ROJO**: `expected ... not to contain ''Administrador''` |

La segunda se probo primero **dentro de un comentario** y salio verde, que es lo correcto: el
predicado descuenta comentarios. Solo cuenta como codigo.

### Salida real

    $ pnpm run typecheck  -> limpio, sin salida
    $ pnpm run lint       -> 0 errors, 2 warnings (preexistentes y ajenos)
    $ vitest run tests/unit/pedidos tests/unit/recetas tests/unit/recetas-ui tests/integration/pedidos tests/guards
      -> 51 archivos, 606 tests, 0 fallos   (antes 49 / 592: +2 archivos, +14 casos)
    $ vitest run tests/integration/pedidos  -> 4 archivos, 55 tests, verdes, DOS corridas seguidas
      (55 = los 48 aprobados + los 7 nuevos; no dependen del orden)

**Base sin residuos** tras la doble corrida: `orders 0`, `recipes 0`, `users 0`, `roles 0`, ninguna
secuencia `orders_sequence_%`. Solo quedan las filas de catalogo de las migraciones (`units` 4,
`documentTypes` 1), verificadas por nombre.

### Trazabilidad, actualizada

R35 pasa de «citado pero no verificado» a **verificado contra Postgres real** por
`order-repository.int.test.ts`. R8, R34, R40 y R41 ganan su **capa de adaptador** en el mismo
archivo, y R13 su unitario en `order-prisma-errors.test.ts`. Las filas de la tabla de T18 siguen
siendo validas; estos tests **se anaden** a ellas, no las sustituyen.

---

## Tanda 6 — segunda ronda del reviewer (M6, M7). Cerrada 2026-09-04

La segunda ronda dio **OK**: **B1, M1 y M4 cerrados**, 0 bloqueantes. El reviewer no se fio de mis
dos mutaciones y corrio **nueve** sobre el codigo real —`take: limit`, el `ORDER BY`, los dos
`deletedAt: null`, `toFixed(4)`, el filtro de prioridad e `isDuplicateOrderNumber`, mas las dos
mias—: **murieron las nueve**. Quedaban dos menores, los dos mios.

### M6 — la tabla `R<n> -> test` de T18 apuntaba a los tests viejos

**Corregido, y no era cosmetica.** La prosa de la tanda 5 explicaba lo que se anadio, pero **las
filas de la tabla seguian intactas**: R35 citaba `list-orders.test.ts` + `tests/unit/pagination.test.ts`,
que es **exactamente la cita que el reviewer rechazo en la primera ronda** por no verificar el
requisito. La trazabilidad es la **regla 4 de `CLAUDE.md`**, y una tabla que apunta al test
equivocado **es peor que no tenerla**: el proximo que la lea —QC-35, o el siguiente reviewer— creera
que esta cubierto y no lo esta.

Actualizadas las **siete** filas (R8, R13, R34, R35, R38, R40, R41). Cada una nombra ahora los
archivos nuevos, dice **que capa** cubre cada test —dominio, SQL crudo o **adaptador real**— y cita
**la mutacion que la mata**, para que la fila no sea una promesa sino una comprobacion. R35 pasa de
citar dos tests que no lo verificaban a nombrar el **unico** que si lo hace.

### M7 — el predicado de R4 solo cazaba el literal entre comillas simples

`expect(codigo).not.toContain("'Administrador'")` no ve `"Administrador"`. El reviewer lo demostro:
con el literal en comillas dobles en `domain/order-input.ts`, `authorization.test.ts` salia **verde
15/15** y `pnpm run lint` daba **0 errors** —no hay regla de comillas que lo impida—, asi que la
puerta estaba abierta de verdad, no en teoria. El ensanchamiento a todo el arbol que cerro M1 estaba
bien; lo corto era el **predicado**.

Corregido y **verificado por mutacion en las tres formas de escribir el literal en TypeScript**
(comilla simple, doble y backtick), mas la comprobacion de que el **descuento de comentarios sigue
vivo** —que es lo que impide un falso rojo cuando el modulo habla del rol en prosa—. Detalle y
salidas, abajo.

**Por que se muta tambien el caso que debe salir VERDE:** en la tanda 5 mi primera mutacion de M1
cayo **dentro de un comentario** y salio verde; parecia que el test no mordia, y en realidad estaba
haciendo lo correcto. Un falso verde y un falso rojo se parecen mucho desde fuera, y la unica forma
de distinguirlos es mutar las dos direcciones.

**Criterio elegido para M7, y por que no se hizo lo minimo.** El literal escrito a mano
(`"'Administrador'"`) tenia **dos** agujeros, no uno: (a) solo veia la comilla **simple**, y ninguna
regla de lint obliga a una comilla concreta —el reviewer lo demostro con `lint` en 0 errores—; y
(b) si `identity` **renombrara** el rol, el barrido seguiria vigilando un nombre que ya no existe y
quedaria **verde por vacuidad** — el mismo tipo de falso verde que M1 acababa de cerrar por el lado
de la lista de archivos. Admitir solo las comillas arregla (a) y deja (b) vivo. Asi que el patron se
**deriva del valor** `ROLE_ADMINISTRADOR` (escapado, aunque hoy no tenga metacaracteres) **y** admite
las **tres** formas de escribir una cadena en TypeScript:

    const nombreDelRol = ROLE_ADMINISTRADOR.replace(/[.*+?^${}()|[\]\]/g, '\$&')
    const literalDelRol = new RegExp('[\'"`]' + nombreDelRol + '[\'"`]')

Se conserva `expect(ROLE_ADMINISTRADOR).toBe('Administrador')` como **ancla**: si el valor cambiara,
el caso lo **anuncia** en vez de callarse. `soloCodigo()` y el barrido de M1 —`sourcesIn(pedidosDir)`,
el suelo de 19 archivos y la lista de rutas esperadas— quedan **intactos**.

### Verificacion por mutacion de M7, corrida por el implementer sobre el codigo real

Cuatro mutaciones en `lib/modules/pedidos/domain/order-input.ts`, revertidas todas
(`git status lib/` -> 0 al final de cada una):

| Mutacion | Esperado | Resultado |
| --- | --- | --- |
| `export const MUT = 'Administrador';` | ROJO | **`Tests 1 failed`** |
| `export const MUT = "Administrador";` — **la que salia verde antes** | ROJO | **`Tests 1 failed`** |
| ``export const MUT = `Administrador`;`` | ROJO | **`Tests 1 failed`** |
| El literal **entre las tres comillas** dentro de comentario de linea **y** de bloque | VERDE | **`Tests 15 passed`** |

Las cuatro direcciones importan: las tres primeras demuestran que el agujero esta cerrado; la cuarta,
que **no se cerro de mas** rompiendo el descuento de comentarios. El `backend_dev` reporto que su
primer intento de la cuarta fue un **falso verde** —puso el literal en prosa **sin comillas**, que el
regex no cazaria ni con el descuento roto— y la repitio bien. Es la segunda vez en esta ficha que una
mutacion mal construida da un verde que no significa nada.

### Salida real de la tanda

    $ pnpm run typecheck  -> limpio, sin salida
    $ pnpm run lint       -> 0 errors, 2 warnings (preexistentes y ajenos)
    $ vitest run tests/unit/pedidos tests/unit/recetas tests/unit/recetas-ui tests/integration/pedidos tests/guards
      -> 51 archivos, 606 tests, 0 fallos

**El codigo de produccion no cambia en esta tanda**: `git status lib/ db/` limpio. M6 es bitacora y
M7 es un predicado de test.

### Rojo ajeno, para que conste y no se me cuente

`tests/unit/inventario/product-page.test.tsx` es un **flake de `userEvent` bajo carga** de QC-22,
rojo en `dev` **antes** de esta rama, que no toca inventario ni UI. Por decision del humano esta en
`tests/baseline-rojos.json` con motivo y fecha (commit `27f23ae` del leader) y tiene ficha propia,
**QC-58**. No se arregla aqui y no es deuda de QC-34.

---

## F2.3 — Sincronizacion con `dev`. 2026-09-04

`./init.sh` completo cerro en `== init OK ==` y el reviewer aprobo M6 y M7, asi que toca merge.
`origin/dev` se habia movido **13 commits**; la rama iba **8 por delante**. Merge contra
**`origin/dev`**, no contra el `dev` local, que estaba por detras del remoto.

Lo que llegaba: **PR #32 (QC-52)**, que quita `cost`, `min_purchase` y `delivery_time` de
`products`, rehace `supplier_catalog_lines` con cinco columnas y sus FK y trae su migracion
`20260904123854_split_product_and_supplier_catalog`; el **PR #31** de arreglos de gate; y la
**normalizacion a LF** de 15 archivos que un subagente habia pasado a CRLF.

### Antes de mergear: donde podia doler

Se cruzaron las dos listas de archivos tocados (`c0c16af..origin/dev` contra `c0c16af..HEAD`) y el
solape eran **cuatro** archivos: `db/schema.prisma`, `feature_list.json`, `lib/composition/index.ts`
y `tests/baseline-rojos.json`. Mirarlo antes vale la pena: convierte «a ver que pasa» en «se donde
mirar».

### Conflictos: uno solo, y su resolucion es una UNION

**`tests/baseline-rojos.json`.** Las dos ramas anadieron entradas **distintas** a un archivo que
hasta ayer estaba **vacio**, asi que la resolucion **no es elegir una version**: es quedarse con las
**tres**.

| Entrada | De donde | Por que |
| --- | --- | --- |
| `tests/unit/inventario/product-page.test.tsx` | mia | Flake de `userEvent` bajo carga (QC-22), ficha propia **QC-58** |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | de `dev` | Rojo **estructural** en `dev`: su guardia se apoya en `git diff origin/dev...HEAD`, rango vacio estando **en** `dev` |
| `tests/unit/recetas/module-contract.test.ts` | de `dev` | Lo mismo |

Se conserva el **`_nota` de `dev`**, no el mio: el mio decia «**Vacio** … significa que CUALQUIER
archivo rojo es bloqueante», y eso **ya es falso** porque la lista dejo de estar vacia. Quedarse con
el propio por inercia habria dejado el archivo describiendose mal a si mismo.

El JSON resultante se genero **programaticamente** desde las dos versiones en vez de transcribir a
mano los `motivo`, que son parrafos largos, y se valido (`json.load` OK, sin marcas de conflicto,
**LF**).

**Detalle que conviene saber:** las dos entradas que trae `dev` son de los **mismos dos archivos que
esta ficha retenso** en la tanda 1. En `dev` estan rojos por definicion; **en esta rama estan
verdes**, porque aqui el rango `origin/dev...HEAD` si trae diff. No hay contradiccion: el baseline
los ignora en las dos ramas, y aqui ademas pasan.

### Lo que auto-mergeo — verificado a mano, no dado por bueno

- **`db/schema.prisma`** — es **concatenacion, no eleccion**: cada rama toco modelos distintos.
  Comprobado tras el merge: `enum OrderStatus` con sus **cuatro** valores y `CANCELADO` el ultimo,
  `Order.cancellationReason` presente, `Product` **sin** las tres columnas y `SupplierCatalogLine`
  **con** ellas.
- **`db/migrations/`** — las dos migraciones son independientes y **coexisten**. La mia
  (`...135210_order_cancellation`) sigue ordenando **despues** de la de QC-52 (`...123854`), asi que
  **no se renumera ni se renombra** —hacerlo habria roto el `_prisma_migrations` de cualquier base
  que ya tuviera la mia aplicada, que es justo el caso de este worktree—.
- **`lib/composition/index.ts`** — mi bloque de `pedidos` sigue **al final** e intacto; QC-52 tocaba
  el cableado de `inventario` y `proveedores`, mas arriba.
- **`feature_list.json`** — auto-mergeo sin roce.

Ningun marcador de conflicto residual en todo el arbol (`grep -rn '^<<<<<<< '`).

### Despues del merge

1. `pnpm install --frozen-lockfile` y **`pnpm exec prisma generate`**. Es el sintoma documentado del
   repo: tras un merge el cliente queda por detras y `typecheck` revienta con campos inexistentes que
   **no son un error de codigo**. Se regenera, no se tocan tipos.
2. **La migracion de QC-52 aplicada a la base propia `QuimiCloude_QC34`**, que no la tenia:

       Applying migration `20260904123854_split_product_and_supplier_catalog`
       All migrations have been successfully applied.
       ...
       13 migrations found in prisma/migrations
       Database schema is up to date!

   Aplico **limpia**. Y se comprobo que **no se llevo por delante nada mio**, leyendo el catalogo:
   `OrderStatus` = `PENDIENTE,EN_CURSO,ENTREGADO,CANCELADO`; `cancellation_reason` presente; **seis**
   `CHECK` en `orders`; `next_order_sequence` viva; y `products` ya **sin** `cost`.

### Estado tras la sincronizacion

    $ pnpm run typecheck  -> limpio, sin salida
    $ pnpm run lint       -> LIMPIO, 0 errores y 0 warnings
    $ vitest run tests/unit/pedidos tests/unit/recetas tests/unit/recetas-ui tests/integration/pedidos tests/guards
      -> 51 archivos, 606 tests, 0 fallos
    $ vitest run tests/integration tests/unit/inventario tests/unit/proveedores
      -> 49 archivos, 593 tests, 0 fallos

**Los dos warnings de lint desaparecieron**, y no los arregle yo: eran de
`app/(private)/inventario/components/product-columns.ts` y `tests/unit/inventario/product-page.test.tsx`,
y **los limpio QC-52** al tocar esos archivos. Es la primera vez en la ficha que `lint` sale
completamente en blanco.

**No se corrio la suite completa ni `./init.sh`**: es del leader, ahora sobre el arbol ya
sincronizado. **F2.4 (el PR) no se ha hecho**, por instruccion expresa.
