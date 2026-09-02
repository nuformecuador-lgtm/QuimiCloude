# QC-14 — modelo-producto · bitacora de implementacion

> Rama `feature/QC-14-modelo-producto`, worktree `.worktrees/QC-14-modelo-producto/`.
> Spec congelado en `specs/QC-14-modelo-producto/` (commit `c2a4f43`). Zona `backend`,
> sin nada de UI: toda la implementacion la hizo `backend_dev`; `frontend_dev` no se uso.

## Estado

**Parcial y bloqueada.** T0–T5 cerradas y en verde. **T6 y T7 NO se pudieron ejecutar**
por dos causas independientes, las dos externas a esta feature (ver `## Bloqueos`). Sin
T6/T7 quedan sin cerrar los requisitos que solo se demuestran contra base real.

| Task | Estado |
| --- | --- |
| T0 `.env` disponible en el worktree | `[x]` |
| T1 modelos `Presentation` y `Product` en `db/schema.prisma` | `[x]` |
| T2 `migration.sql` (UP) completado a mano | `[x]` |
| T3 `down.sql` (DOWN) | `[x]` |
| T4 contrato estatico del esquema | `[x]` |
| T5 contrato estatico del SQL | `[x]` |
| T6 ciclo apply -> rollback -> apply | `[ ]` **bloqueada** |
| T7 tests de integracion contra Postgres real | `[ ]` **bloqueada** (depende de T6) |
| T8 merge con `dev` + `./init.sh` completo | `[ ]` — la corre el **leader** |
| T9 mapa `R<n>` -> test con salida real | parcial: este archivo, sin la columna **I** |

## Archivos creados y modificados

| Archivo | Que se hizo |
| --- | --- |
| `db/schema.prisma` | **modificado**: se anaden `Presentation` y `Product` al final, con sus bloques `///` y `/// @module inventario`. No se toca `DocumentType`, `Role` ni `User`. |
| `db/migrations/20260902005510_products_and_presentations/migration.sql` | **nuevo**. UP: `pgcrypto` -> `presentations` -> `products` -> FK `products_presentation_id_fkey` `ON DELETE RESTRICT` -> indice `products_presentation_id_idx` -> los cuatro `CHECK` -> los cuatro `ALTER` de RLS. |
| `db/migrations/20260902005510_products_and_presentations/down.sql` | **nuevo**. Exactamente dos `DROP TABLE IF EXISTS`, en orden inverso. No toca `pgcrypto`. |
| `tests/unit/inventario/schema/inventario-schema.test.ts` | **nuevo**. 19 casos. |
| `tests/unit/inventario/schema/inventario-migration.test.ts` | **nuevo**. 14 casos, con predicados de sensibilidad. |
| `progress/impl_QC-14-modelo-producto.md` | **nuevo**: este archivo. |
| `specs/QC-14-modelo-producto/tasks.md` | **modificado**: solo las casillas `[x]`. |

`lib/` **no se toco**: `lib/modules/inventario/index.ts` sigue siendo `export {}`
(`design.md > 1` y `> 5`). Ninguna dependencia nueva: `package.json` y `pnpm-lock.yaml`
intactos (R24).

## Salida real de los comandos

Todo desde `.worktrees/QC-14-modelo-producto/`. **No se corrio la suite completa ni
`./init.sh`**: es la regla del gate para subagentes (`AGENTS.md > Regla del gate`); el gate
completo lo corre el leader en T8.

### `pnpm typecheck`

```
> quimicloude@0.1.0 typecheck
> tsc --noEmit

TYPECHECK_EXIT=0
```

### `pnpm lint`

```
> quimicloude@0.1.0 lint
> eslint

LINT_EXIT=0
```

### Tests estaticos de la feature

```
$ pnpm exec vitest run tests/unit/inventario/schema/
 RUN  v4.1.10 C:/Users/Cristian/Documents/trabajo/arc/labs/.worktrees/QC-14-modelo-producto

 Test Files  2 passed (2)
      Tests  33 passed (33)
   Duration  668ms
```

19 de `inventario-schema.test.ts` + 14 de `inventario-migration.test.ts`.

### Las tres guardias que cubren R20, R21 y R24

```
$ pnpm exec vitest run tests/guards/guard-rls-force.test.ts tests/guards/guard-arquitectura-modulos.test.ts tests/guards/guard-dependencias-aprobadas.test.ts

 Test Files  3 passed (3)
      Tests  55 passed (55)
   Duration  1.18s
```

### T6 — ciclo apply -> rollback -> apply: NO EJECUTADO

`tasks.md > T6` pide pegar aqui la salida del ciclo. **No hay salida que pegar**: los dos
comandos que lo componen no llegaron a correr. Evidencia de lo unico que si se ejecuto,
que es la lectura de estado:

```
$ pnpm exec prisma migrate status
Datasource "db": PostgreSQL database "QuimiCloude", schema "public" at "localhost:5432"

2 migrations found in prisma/migrations
Your local migration history and the migrations table from your database are different:

The last common migration is: 20260806122638_users_and_roles

The migration have not yet been applied:
20260902005510_products_and_presentations

The migration from the database are not found locally in prisma/migrations:
20260901220609_user_login_lockout
```

```
$ pnpm run db:migrate
Permission for this action was denied by the Claude Code auto mode classifier.

$ pnpm exec prisma migrate deploy
Permission for this action was denied by the Claude Code auto mode classifier.
```

La base quedo **sin tocar** por esta feature: `products` y `presentations` **no existen**
todavia en la base compartida, y no se borro ni modifico ninguna fila de nadie.

## Mapa `R<n>` -> test

Abreviaturas iguales que en `tasks.md`:
**S** = `tests/unit/inventario/schema/inventario-schema.test.ts` ·
**M** = `tests/unit/inventario/schema/inventario-migration.test.ts` ·
**I** = `tests/integration/inventario/inventario-constraints.int.test.ts` (**no escrito**, T7) ·
**G1/G2/G3** = las tres guardias · **T6** = el ciclo apply -> rollback -> apply.

Columna «Estado»: **verde** = test escrito Y ejecutado en verde; **pendiente** = no existe.

| R | Test | Estado |
| --- | --- | --- |
| R1 | S · «Presentation declara id uuid propio y name obligatorio» | verde |
| R2 | I · «rechaza una presentacion sin nombre» | **pendiente (T7)** — R2 solo se cierra contra base real |
| R3 | S · «el esquema declara exactamente dos modelos nuevos: Presentation y Product» · S · «Product declara los ocho datos del producto en una sola tabla» | verde |
| R4 | S · «name y presentationId son obligatorios y sin default» | verde (falta el refuerzo I) |
| R5 | S · «stock, cost, deliveryTime, qtyAlert y unit son opcionales» | verde (falta el refuerzo I) |
| R6 | S · «minPurchase no es opcional y declara default 0» · M · «min_purchase es INTEGER NOT NULL DEFAULT 0» | verde (falta el refuerzo I) |
| R7 | S · «stock, minPurchase, qtyAlert y deliveryTime son Int» · M · «las cuatro columnas enteras se declaran INTEGER» | verde (falta el refuerzo I) |
| R8 | S · «cost es Decimal(14,4) y en el esquema no hay ningun Float» · M · «cost se declara DECIMAL(14,4) y el test cae si alguien lo cambia a double precision» | verde (falta el refuerzo I) |
| R9 | M · «las cuatro columnas numericas llevan CHECK de no negatividad, y el test cae si se relaja el >= 0» | verde en el texto del SQL; **el rechazo real (SQLSTATE 23514) sigue sin demostrarse** |
| R10 | S · «unit es String opcional y el esquema no declara ningun enum» | verde (falta el refuerzo I) |
| R11 | S · «no hay ninguna columna derivada de bajo de existencias ni relacion entre qtyAlert y stock» | verde (falta el refuerzo I) |
| R12 | S · «la relacion Product-Presentation es obligatoria» · M · «la FK de presentacion existe y es ON DELETE RESTRICT» | verde (falta el refuerzo I) |
| R13 | S · «presentationId no tiene restriccion de unicidad» | verde (falta el refuerzo I) |
| R14 | S · «la relacion Product-Presentation declara onDelete Restrict» · M · «la FK de presentacion es ON DELETE RESTRICT» | verde en la declaracion; **el caso fino (presentacion con un unico producto borrado logicamente) sigue sin demostrarse** |
| R15 | I · «permite borrar una presentacion sin productos asignados» | **pendiente (T7)** — R15 solo se cierra contra base real |
| R16 | S · «products.name no tiene @unique ni @@unique» · M · «la migracion no crea ningun indice unico sobre products» | verde (falta el refuerzo I) |
| R17 | S · «Product declara deletedAt opcional» | verde (falta el refuerzo I) |
| R18 | S · «Product y Presentation declaran createdAt y updatedAt» | verde (falta el refuerzo I) |
| R19 | S · «las dos tablas mapean a snake_case en ingles» · M · «todos los identificadores creados por la migracion estan en ingles» | **cerrado** |
| R20 | S · «los dos modelos declaran /// @module inventario» · G2 | **cerrado** |
| R21 | M · «las dos tablas quedan con RLS activado y forzado» · G1 | **cerrado** |
| R22 | M · «down.sql revierte exactamente lo que crea migration.sql y no toca pgcrypto» | verde en el texto; **T6 pendiente**, asi que R22 NO esta cerrado en su forma real |
| R23 | S · «la feature no anade adaptadores driving, rutas ni contrato de dominio en el modulo inventario» | **cerrado** |
| R24 | G3 · «toda dependencia de package.json tiene su fila en el registro» | **cerrado** |

Resumen honesto: **2 requisitos (R2, R15) sin ningun test ejecutado**, y **R9, R14 y R22 con
cobertura solo estatica** cuando el spec exige tambien la real. `CHECKPOINTS.md > Trazabilidad`
no se cumple todavia.

## Tests de sensibilidad

`tasks.md > T5` los exige, y estan: `declaresExactDecimalCost` cae con `DECIMAL(14,4)` ->
`DOUBLE PRECISION` y con `DECIMAL(10,2)`; `isNonNegativeCheck` cae con `>= 0` -> `> -1`;
`isRestrictOnDelete` cae con `CASCADE`, `SET NULL`, `SET DEFAULT` y `NO ACTION`;
`hasRlsEnabledAndForced` cae al quitar el `FORCE`; `isEnglishSnakeCase` cae con
identificadores en espanol o con acentos y sigue aceptando los reales.

## Bloqueos

### 1. El permiso para aplicar migraciones esta denegado

`pnpm run db:migrate` y `pnpm exec prisma migrate deploy` los rechaza el clasificador de
permisos de la sesion. **Es lo que impide T6, y T7 depende de T6.** Lo decide el humano:
sin ese permiso, esta feature no puede cerrar R2, R9 (real), R14 (caso fino), R15 ni R22.

### 2. Drift en la base COMPARTIDA por la feature QC-7, en vuelo desde otra sesion

La base de `DATABASE_URL` tiene aplicada la migracion `20260901220609_user_login_lockout`,
que **no existe** en `db/migrations/` de este worktree. Consecuencias:

- `pnpm run db:migrate:create` (`prisma migrate dev --create-only`) **aborta pidiendo
  resetear el esquema publico**. Se le contesto que **no** (stdin cerrado, salida 130): no se
  aplico nada, no se reseteo nada, no se borro ninguna tabla ni fila de nadie. El
  `migration.sql` se genero con `prisma migrate diff --from-schema-datamodel <HEAD>
  --to-schema-datamodel db/schema.prisma --script`, que **no toca la base**, y produce el
  mismo SQL.
- `prisma migrate deploy` **si** funcionaria pese al drift (no lo comprueba), pero esta
  bloqueado por el punto 1.
- Se destraba mergeando `dev` cuando QC-7 aterrice (que es lo que hace T8), **no**
  reseteando la base compartida.

El timestamp de esta migracion (`20260902005510`) es **posterior** al de QC-7
(`20260901220609`), asi que el orden de la cadena es correcto y el merge no reordena nada.
`db:rollback` revierte la **ultima carpeta de `db/migrations/` del worktree**, que es la de
esta feature, asi que el ciclo de T6 no puede tocar la migracion de QC-7 por accidente.

### 3. Rojo heredado en `identity`, ajeno a esta feature

`tests/integration/identity/identity-constraints.int.test.ts` esta en rojo en `dev`
(9 tests) por los fixtures `qc7_e2e_*` que QC-7 deja sin limpiar en la base compartida.
**No es de esta feature y no se toco**: ni los fixtures (son estado en vuelo de otra sesion)
ni el test. Tampoco se anadio a `tests/baseline-rojos.json`, que sigue vacio: darlo de alta
ahi es decision del leader o del humano, no del implementer. Se avisa porque hara fallar el
`./init.sh` completo de T8 por una causa que no es QC-14.

## Deuda que deja el implementer

Cuando se desbloquee, falta escribir
`tests/integration/inventario/inventario-constraints.int.test.ts` (columna **I** de la
trazabilidad) con el aislamiento que exige `tasks.md > T7`: cada caso en
`prisma.$transaction` que termina en `ROLLBACK`, `SAVEPOINT` para lo que debe fallar, y
asercion sobre **SQLSTATE** (`23502`, `23503`, `23514`) y nunca sobre el texto del mensaje.
Y **limpiando sus propios fixtures**, sin ninguna asercion del tipo «la tabla esta vacia»:
es exactamente el defecto que hoy tiene rota la suite de `identity`.

## Nota sobre `.env` (T0)

El `.env` del worktree tenia `DATABASE_URL` pero **no** `DIRECT_URL`, y `prisma validate`
fallaba con `P1012`. La base es Postgres **local en `localhost:5432`**, o sea ya es conexion
directa y no hay pooler, asi que se anadio `DIRECT_URL` con el mismo valor que
`DATABASE_URL` —que es justo el fallback que documenta `scripts/db-rollback.ts`— **solo en
el `.env` local del worktree**, que esta git-ignorado (`.gitignore:38`). No se invento
ninguna credencial nueva, no se versiono nada y no se pego ninguna cadena de conexion en
ningun archivo del repo ni en el chat. El `.env` del worktree principal **no se modifico**.
