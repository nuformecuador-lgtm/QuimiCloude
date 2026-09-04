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
