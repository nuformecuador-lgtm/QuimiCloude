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
