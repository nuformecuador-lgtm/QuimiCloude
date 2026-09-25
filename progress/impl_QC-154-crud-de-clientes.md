# QC-154 — crud-de-clientes · bitácora de implementación (tanda: T0, T3, T17, T18)

> Solo estas cuatro tasks. El resto del árbol de tasks.md (Grupos A-D) queda para otra tanda.

## T0 — Qué se hereda montado y NO se re-crea

Verificado punto por punto contra el árbol de la rama (commit de partida `94d24109`, merge con
`origin/dev`):

- **Modelo `Customer`** en `db/schema.prisma` y migración `20260924120000_customers`: presentes,
  tal como los dejó QC-153. Sin ninguna otra migración pendiente de esta ficha salvo la del
  Grupo E (ver T17 abajo).
- **Precedente de búsqueda sin acentos**: `db/migrations/20260904160000_list_query_indexes/`
  (relleno con `translate`/`regexp_replace`, GIN `gin_trgm_ops` parcial `WHERE deleted_at IS NULL`,
  `CREATE EXTENSION IF NOT EXISTS pg_trgm` y su `down.sql` sin `DROP EXTENSION`) y
  `lib/modules/proveedores/domain/supplier-name.ts` (`normalizeSupplierName`: NFD, descarta
  `\p{Diacritic}`, minúsculas, descarta todo lo que no sea `[a-z0-9]`). Verificados leyendo el
  archivo real, no supuestos.
- **`lib/modules/clientes/domain/customer.ts`** (tipo `Customer`) y su reexport en
  `lib/modules/clientes/index.ts`: presentes, sin tocar.
- **Permisos** `clientes.consultar` y `clientes.modificar` en
  `lib/modules/identity/domain/permissions.ts` (línea 40, 149, 155, 210-211), sembrados en la
  migración de QC-153 solo al Administrador.
- **`assertPermission`, `SEED_ROLE_PERMISSIONS`, `getSessionUser`/`getSessionContext`** (identity),
  **`createErrorStateTranslator`** (errores), **`runInRequestScope`**, **`lib/shared/pagination`**,
  **`logIgnoredListQueryFields`**: no se tocaron, solo se confirmó su existencia para las tasks
  fuera de esta tanda.
- **Base `QuimiCloude_QC154`**: no existía. Se creó (`CREATE DATABASE` vía `pg` desde un script
  desechable) y se le aplicaron **todas** las migraciones de `dev` con
  `pnpm run db:migrate` (entorno con `DATABASE_URL`/`DIRECT_URL` sobrescritos a
  `postgresql://postgres:xerxes@localhost:5432/QuimiCloude_QC154?schema=public`). Salida real:

  ```
  52 migrations found in prisma/migrations
  ... (todas, hasta 20260924180000_supplier_catalog_line_material_and_measurements)
  All migrations have been successfully applied.
  ```

  Tras T17, se le aplicó también `20260924190000_customers_search_normalized` (ver abajo).

No se tocó `feature_list.json` ni `progress/current.md`.

## T3 — Enmienda al catálogo de errores (duodécima)

- `lib/modules/errores/domain/error-codes.ts`: `customer_not_found` añadido a `ERROR_CODES`, con
  la línea de cabecera «**Duodecima enmienda, el 2026-09-24**: `customer_not_found`.».
- `lib/modules/errores/domain/error-catalog.ts`: clave `customer_not_found: 'errors.customer_not_found'`
  y texto `'El cliente solicitado no existe.'` (aprobado en F1.4).
- `tests/unit/errores/catalogo.test.ts`: censo de 54 a 55 entradas, y nuevo bloque
  `R34 — customer_not_found tiene clave y texto no vacio` con sus tres casos.

**Bloqueo transitorio esperado (no corregido en esta tanda, fuera de alcance):**
`tests/guards/guard-catalogo-de-errores.test.ts > ... > el catalogo no tiene entradas huerfanas (R9)`
queda en rojo porque ninguna clase de error declara todavía `code = 'customer_not_found'` — esa
clase (`CustomerNotFoundError`) nace en **T1** (Grupo A), fuera de esta tanda. El propio
`design.md > Grupo A` documenta la dependencia inversa: «T1 depende de T3 porque sin el código en
el catálogo, `CustomerNotFoundError` no compila». Este rojo se cierra solo cuando T1 se implemente.

## T17 — Migración de búsqueda de clientes sin acentos

- `db/schema.prisma`: `Customer` gana `firstNamesNormalized`, `lastNamesNormalized`,
  `cityNormalized` (mapeadas a `first_names_normalized`, `last_names_normalized`,
  `city_normalized`), sin `@unique` ni `@@index`. Comentario `///` del modelo actualizado.
- `db/migrations/20260924190000_customers_search_normalized/{migration.sql,down.sql}`, escrita a
  mano, con los cinco pasos de `design.md > 17.2`: extensión `pg_trgm` (`IF NOT EXISTS`), tres
  columnas anulables, `UPDATE` de relleno con la lista de `translate` copiada literal de
  `20260904160000_list_query_indexes`, `SET NOT NULL`, y tres `CREATE INDEX ... USING gin (...
  gin_trgm_ops) WHERE "deleted_at" IS NULL`. `<ts>` = `20260924190000` (`git fetch origin dev` no
  trajo ninguna migración más nueva que `20260924180000` en el momento de crearla). `down.sql`
  revierte índices y columnas en orden inverso, **sin** `DROP EXTENSION`.
- `tests/guards/guard-identificador-de-request.test.ts`: fila nueva en la lista cerrada de
  migraciones para `20260924190000_customers_search_normalized`.
- `tests/unit/clientes/schema/customers-schema.test.ts` (QC-153): `CUSTOMER_COLUMNS` gana las tres
  columnas normalizadas (censo 13 → 16); el caso de censo lleva
  `R4 (QC-153), R42 (QC-154)` en el nombre; el caso que compara el tipo `Customer` del armazón
  contra los campos del modelo se amendó para excluir las tres normalizadas (derivadas, el tipo
  `Customer` no las lleva a propósito) y se añadió una sensibilidad que prueba que el filtro no
  vacía la comparación.
- `tests/integration/clientes/customers-constraints.int.test.ts` (QC-153): todos los
  `tx.customer.create(...)` y los `rawInsertCustomer(...)` pasan ahora las tres formas
  normalizadas (con un helper local `normalizeForTest`, misma forma que `normalizeSupplierName`,
  para no importar entre módulos); el censo de columnas en `snake_case` de
  `'la tabla y sus columnas estan en snake_case ingles'` gana las tres.
- `pnpm run db:migrate` con `DATABASE_URL`/`DIRECT_URL` sobrescritos a `QuimiCloude_QC154`: aplicó
  `20260924190000_customers_search_normalized` sin error («All migrations have been successfully
  applied»). `pnpm exec prisma generate` corrido tras el cambio de esquema.

**T21 (ciclo real `db:migrate` → `db:rollback` → `db:migrate`) NO está en el alcance de esta
tanda** (el encargo solo pedía T0, T3, T17, T18); queda para quien tome el Grupo E completo.

## T18 — Normalización (`normalizeCustomerText`)

- `lib/modules/clientes/domain/customer-text.ts`: `normalizeCustomerText`, copiada de
  `normalizeSupplierName` (misma forma: NFD, descarta diacríticos, minúsculas, descarta todo lo
  que no sea `[a-z0-9]`). No se importa de `proveedores` (ruta profunda entre módulos prohibida).
- `tests/unit/clientes/customer-text.test.ts`: batería de acentos, mayúsculas, signos, cadena
  vacía/idempotencia, y el caso `R41 — normaliza sin acentos, en minusculas y sin simbolos, igual
  que normalizeSupplierName`, que compara `normalizeCustomerText` con `normalizeSupplierName`
  (importada del contrato de `proveedores`) sobre la misma muestra.

## Verificación — salida real

```
$ pnpm exec next typegen && pnpm run typecheck
✓ Types generated successfully
> tsc --noEmit
(sin salida — 0 errores)

$ pnpm run lint
✖ 7 problems (0 errors, 7 warnings)   ← preexistentes, ajenos a esta tanda
  (tests/unit/documentos/confirm-catalog-import.test.ts, tests/unit/pedidos/order-service.test.ts)

$ pnpm exec vitest run tests/unit/errores/catalogo.test.ts tests/guards/guard-catalogo-de-errores.test.ts
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 69 passed (70)
  → el unico rojo es el orfanato esperado de T3 (ver arriba), no un regresion de esta tanda.

$ pnpm exec vitest run tests/unit/clientes/schema/customers-schema.test.ts tests/guards/guard-identificador-de-request.test.ts
 Test Files  2 passed (2)
      Tests  33 passed (33)

$ DATABASE_URL=...QuimiCloude_QC154 DIRECT_URL=...QuimiCloude_QC154 \
  pnpm exec vitest run tests/integration/clientes/customers-constraints.int.test.ts
 Test Files  1 passed (1)
      Tests  17 passed (17)
  (corrida contra una base efimera propia, plantilla construida desde el servidor de
  QuimiCloude_QC154; la base de desarrollo compartida no se tocó)

$ pnpm exec vitest run tests/unit/clientes/customer-text.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

No se corrió `pnpm test` ni `./init.sh` (fuera del encargo de esta tanda). Un `vitest related`
lanzado sobre `error-codes.ts`/`error-catalog.ts` (muy importados) arrastró sin querer 457
archivos / 6583 tests: confirma que no hay ninguna otra regresión aparte del rojo esperado de
arriba — los otros dos rojos de esa corrida (`catalog-import-isolation.int.test.ts`, timeout de
20s y un `UnauthorizedError` no manejado) son de `documentos`, un módulo que esta tanda no toca, y
tienen la firma de los flakes de saturación que documenta `docs/verification.md`.

## Mapa `R<n> → test` (solo lo que cubre esta tanda)

| R | Test |
| --- | --- |
| R34 | `tests/unit/errores/catalogo.test.ts` → `las 55 entradas estan...` + `R34 — customer_not_found tiene clave y texto no vacio` |
| R41 | `tests/unit/clientes/customer-text.test.ts` → `R41 — normaliza sin acentos, en minusculas y sin simbolos, igual que normalizeSupplierName` |
| R42 (parcial, esquema y persistencia cruda) | `tests/unit/clientes/schema/customers-schema.test.ts` (censo) + `tests/integration/clientes/customers-constraints.int.test.ts` (create/INSERT con las tres formas) |
| R43, R44, R45, R46 | Cubiertos por T19/T20/T21, **fuera de esta tanda** — la migración de T17 los deja aplicables pero no lleva sus tests. |

## Archivos tocados

- `lib/modules/errores/domain/error-codes.ts`
- `lib/modules/errores/domain/error-catalog.ts`
- `tests/unit/errores/catalogo.test.ts`
- `db/schema.prisma`
- `db/migrations/20260924190000_customers_search_normalized/migration.sql` (nuevo)
- `db/migrations/20260924190000_customers_search_normalized/down.sql` (nuevo)
- `tests/guards/guard-identificador-de-request.test.ts`
- `tests/unit/clientes/schema/customers-schema.test.ts`
- `tests/integration/clientes/customers-constraints.int.test.ts`
- `lib/modules/clientes/domain/customer-text.ts` (nuevo)
- `tests/unit/clientes/customer-text.test.ts` (nuevo)

## Veredicto (tanda T0/T3/T17/T18)

T0, T3, T17 y T18 cerradas y verificadas con evidencia real; el único rojo es el esperado por el
orden de dependencia T3→T1 (documentado en `design.md`, no corregible sin salirse del alcance
encargado).

---

# Tanda T1, T2, T4, T19, T20, T21

## T1 — Dominio base

- `lib/modules/clientes/domain/actor.ts` (`Actor`, `requirePermission`, copia de `proveedores` con
  `UnauthorizedError` propio), `domain/customer-scope.ts` (`CustomerScope`), `domain/errors.ts`
  (`ClientesError`, `UnauthorizedError`, `CustomerNotFoundError` con `code = 'customer_not_found'`,
  `ValidationError`), `domain/page.ts` (`Page<T>`), `domain/customer-id.ts` (`isCustomerId`, `zod`
  `.uuid()`).
- Cierra el rojo esperado de T3: `CustomerNotFoundError` declara `customer_not_found`, y
  `tests/guards/guard-catalogo-de-errores.test.ts > ... > el catalogo no tiene entradas huerfanas
  (R9)` vuelve a verde (comprobado: 70/70 en la corrida de abajo).
- `domain/` de `clientes` solo importa `zod`, `./` y los barrels de `identity` (`assertPermission`,
  `PermissionCode`) y `errores` (`errorMessage`, `ErrorCode`), tal como exige el «Hecho cuando».

## T2 — Contrato de listados: copia y guardia

- `lib/modules/clientes/domain/list-query.ts`: copia **carácter a carácter** de
  `proveedores/domain/list-query.ts`, cambiando solo las dos líneas que nombran el módulo (ruta de
  la cabecera y «modulo `clientes`»).
- `lib/modules/clientes/ports/list-query-log.ts`: copia idéntica de la forma del puerto.
- `tests/guards/guard-contrato-listados.test.ts`: `clientes` entra como **séptimo** módulo de
  `MODULOS` (import + fila). Se aprovechó para corregir la prosa «seis modulos» → «siete modulos»
  en comentarios y nombres de `describe`/`it` de ese archivo (el propio contrato, no una copia
  duplicada como `list-query.ts`, así que no aplica la regla de «no corregir el five/seven» de
  `design.md > 6.1`).
- **Fabricado y rojo real, revertido:** se movió `SEARCH_MAX_LENGTH` de 120 a 200 en
  `lib/modules/clientes/domain/list-query.ts` → `guard-contrato-listados.test.ts` cayó en
  `bloque 2 — coinciden caracter a caracter salvo el nombre del modulo` (`expected [ 'clientes' ]
  to deeply equal []`). Se revirtió y la guardia volvió a verde (20/20).

## T4 — Alcance adelantado: `tests/unit/clientes/scope.test.ts`

Cambios uno a uno, exactamente los que `design.md > 11` enumera:

- **Lista cerrada de archivos del módulo tras QC-154** (nuevo test
  `R20 (QC-153), R35 (QC-154) — lista cerrada de archivos del modulo tras QC-154`), que sustituye
  a los dos casos de QC-153 que asumían el módulo vacío (`ports y adapters vacios...` y `domain
  solo tiene customer.ts`). Sin ningún `.gitkeep` en la lista esperada.
- **`'use server'` acotado a fuera de `adapters/driving/`** (mismo nombre `R20 (QC-153), R35
  (QC-154) — ...`).
- **Literal de permiso relajado** a `permissions.ts` **y** `lib/modules/clientes/domain/**`
  (`R26 (QC-153) — el literal de los dos permisos solo aparece en permissions.ts o en
  lib/modules/clientes/domain`), con el fabricado simétrico **dentro** de `domain/` que **no**
  dispara (`el caso simetrico: el mismo literal DENTRO de domain/ no dispara`), además del
  fabricado ya existente **fuera** de `domain/` que sigue disparando.
- **`adapters/driving/` = exactamente `customer-actions.ts`**
  (`R26 (QC-153) — adapters/driving/ contiene exactamente customer-actions.ts`), que sustituye al
  viejo «`adapters/driving/` esta vacio».
- **Casos propios nuevos:** `R36` (sin aritmética de paginación propia, copiado del detector de
  `tests/unit/proveedores/scope.test.ts`), `R37` (una sola migración nueva que toca `customers`, y
  `schema.prisma` solo gana los tres campos normalizados de `Customer`, con censo exacto de campos
  y conteo de migraciones que tocan `customers`), `R38` (nada bajo `app/` que nombre clientes,
  mismo patrón que el R28 de QC-153 sobre `e2e/`), `R40` (ni `clientes` importa `pedidos` ni
  `pedidos` importa `clientes`, por especificador `@/lib/modules/<x>`, no por texto suelto: el
  propio `list-query.ts` copiado menciona «pedidos» en un comentario legítimo y un detector por
  palabra suelta habría dado un falso positivo).
- Los casos de **R28 y R29 de QC-153 quedan intactos** (sin tocar una línea).

**Rojo esperado de esta tanda, documentado y NO relajado** (el módulo aún no está lleno; se cierra
en T12/T15):

- `R20 (QC-153), R35 (QC-154) — lista cerrada de archivos del modulo tras QC-154`: hoy el módulo
  solo tiene 9 de los 23 archivos esperados (faltan `customer-input.ts`, `customer-view.ts`,
  `customer-queryable.ts`, los cinco casos de uso, `customer-repository.ts`, y todo `adapters/`).
- `R26 (QC-153) — adapters/driving/ contiene exactamente customer-actions.ts`: hoy
  `adapters/driving/` está vacío (nace en T12).

**Fabricados comprobados en rojo y revertidos** (sin tocar disco fuera del propio `try/finally` de
cada caso):
- Literal de permiso fuera de `domain/` → detectado (test ya existente, sigue en verde).
- Literal de permiso dentro de `domain/` → **no** detectado (caso simétrico nuevo).
- `(page - 1) * pageSize` en un archivo fabricado de `domain/` → detectado por R36 (con la
  corrección de comparar contra la ruta absoluta que usa `filesIn`, no la relativa).
- Import de `@/lib/modules/pedidos` desde un archivo fabricado de `lib/modules/clientes/domain/`
  → detectado por R40.
- Ruta `/clientes` en una pantalla fabricada bajo `app/` → detectado por R38.

## T19 — Test estático de la migración de búsqueda sin acentos

- `tests/unit/clientes/schema/customers-search-migration.test.ts`: extensión `pg_trgm` sin
  `DROP EXTENSION`; las tres columnas se añaden anulables y se rellenan **antes** del
  `SET NOT NULL` (predicado `rellenaAntesDeNotNull`); el relleno usa la **misma** pareja de
  `translate(...)` que `20260904160000_list_query_indexes` (leída de su archivo, no copiada a
  mano); `SET NOT NULL` para las tres columnas y ningún `UNIQUE`; los tres índices son
  `gin_trgm_ops` con `WHERE deleted_at IS NULL` y ninguna otra tabla se toca; el `down.sql` revierte
  los tres índices y las tres columnas, en orden inverso, sin `DROP EXTENSION`.
- **Las seis mutaciones exigidas por `tasks.md`, comprobadas en rojo y revertidas** (todas en
  memoria, el archivo en disco no se tocó):
  1. `SET NOT NULL` antes del `UPDATE` → `rellenaAntesDeNotNull` da `false` sobre el texto
     sintético con el orden invertido.
  2. Un índice sin `WHERE deleted_at IS NULL` → el mismo patrón que exige el caso real deja de
     casar contra la versión sin el `WHERE`.
  3. Un `UNIQUE` fabricado → aparece en el texto sin comentarios (mientras que el real, limpio de
     comentarios, no lo tiene).
  4. Un `ALTER TABLE "orders"` fabricado → aparece en la lista de alteres ajenos (que en el real
     está vacía).
  5. Un `DROP EXTENSION` fabricado en el down → aparece (mientras que el down real, limpio de
     comentarios, no lo tiene: la cabecera SÍ menciona «DROP» en prosa, por eso se limpian
     comentarios antes de esas dos aserciones).
  6. Un down que se olvida una columna → el conteo de `DROP COLUMN` baja de 3 a 2.

## T20 — Integración de la migración de búsqueda sin acentos

- `tests/integration/clientes/customers-search-migration.int.test.ts`, declarado en `transaccion`
  de `tests/integration/aislamiento.json` (mismo patrón que
  `clientes/customers-migration.int.test.ts`: transacción interactiva con `RollbackSignal`).
- **R43**: dentro de la transacción se aplica el `down.sql` de esta migración (vuelve al esquema de
  QC-153), se insertan por SQL crudo un cliente vivo y uno dado de baja con acentos (`María José`,
  `Pérez Muñoz`, `Bogotá`; `Andrés`, `Niño Peña`, `Medellín`), se aplica el `migration.sql`, y se
  compara cada columna `*Normalized` con `normalizeCustomerText` importada de
  `lib/modules/clientes/domain/customer-text.ts` (ruta profunda permitida en tests).
- **R44**: `INSERT` crudo que omite `first_names_normalized` → `23502` real, con `SAVEPOINT`/
  `ROLLBACK TO SAVEPOINT` (mismo patrón que `customers-constraints.int.test.ts`).
- **R45**: `pg_indexes` devuelve los tres índices `*_trgm_idx`, cada uno con `gin_trgm_ops` y
  `deleted_at IS NULL` en su `indexdef`.
- Corrida real contra una base efímera plantillada desde `QuimiCloude_QC154` (`DATABASE_URL`/
  `DIRECT_URL` sobrescritos en el entorno del comando, nunca la compartida del `.env`):
  ```
  test-db: plantilla reutilizada: qct_tpl_28550f7af953 (las migraciones no han cambiado)
  test-db: la corrida de integracion va contra qct_qc154_682c05c8_mug8qblt_9ss (copia de qct_tpl_28550f7af953).
  Test Files  1 passed (1)
       Tests  3 passed (3)
  test-db: borrada la base de la corrida: qct_qc154_682c05c8_mug8qblt_9ss.
  ```
- Se corrió también toda la carpeta `tests/integration/clientes` contra la misma base propia:
  3 archivos, 25 tests, todos verdes; sin regresión sobre `customers-constraints.int.test.ts` ni
  `customers-migration.int.test.ts`.

## T21 — Ciclo real de la migración (`db:migrate` → `db:rollback` → `db:migrate`)

Contra `QuimiCloude_QC154`, con `DATABASE_URL`/`DIRECT_URL` sobrescritos en el entorno del comando.

**1) `pnpm run db:migrate`** (partía con la migración ya aplicada desde T17/T0):
```
52 migrations found in prisma/migrations
No pending migrations to apply.
```

**2) `pnpm run db:rollback`**:
```
db:rollback: aplicando down.sql de 20260924190000_customers_search_normalized y borrando su fila de _prisma_migrations
db:rollback: 20260924190000_customers_search_normalized revertida.
```

Estado de `customers` tras el rollback (consultado con un script `tsx` desechable vía
`information_schema.columns`, `pg_indexes` y `pg_extension`, borrado al terminar):
- Columnas: `address, city, company_id, created_at, created_by, deleted_at, email, first_names,
  id, last_names, phone, updated_at, updated_by` — **sin** las tres `*_normalized` (13, las de
  QC-153).
- Índices: `customers_company_id_id_key, customers_created_by_idx, customers_pkey,
  customers_updated_by_idx` — **sin** los tres `*_trgm_idx`.
- `pg_trgm` **sigue instalada** (`SELECT extname FROM pg_extension` la devuelve).
- `_prisma_migrations`: la fila de `20260924190000_customers_search_normalized` ya no aparece
  entre las últimas aplicadas (queda `20260924180000_supplier_catalog_line_material_and_measurements`
  como la más reciente de esta zona).

**3) `pnpm run db:migrate`** (segunda vez, reaplica):
```
Applying migration `20260924190000_customers_search_normalized`
The following migration(s) have been applied:
migrations/
  └─ 20260924190000_customers_search_normalized/
    └─ migration.sql
All migrations have been successfully applied.
```

Estado de `customers` tras la segunda aplicación: las 16 columnas (las 13 de QC-153 + las tres
`*_normalized`), los tres índices `*_trgm_idx` de vuelta, `pg_trgm` instalada, y
`_prisma_migrations` con `20260924190000_customers_search_normalized` como la más reciente. R46
verificado con el ciclo real, no solo con el `down.sql` leído en el test estático de T19.

## Verificación — salida real (tanda T1/T2/T4/T19/T20/T21)

```
$ pnpm exec next typegen && pnpm run typecheck
✓ Types generated successfully
> tsc --noEmit
(sin salida — 0 errores)

$ pnpm run lint
✖ 7 problems (0 errors, 7 warnings)   ← preexistentes, ajenos a esta tanda

$ pnpm exec vitest run tests/guards/guard-catalogo-de-errores.test.ts tests/unit/errores/catalogo.test.ts
 Test Files  2 passed (2)
      Tests  70 passed (70)          ← el rojo de T3 ya no existe

$ pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts
 Test Files  1 passed (1)
      Tests  62 passed (62)

$ pnpm exec vitest run tests/guards/guard-contrato-listados.test.ts
 Test Files  1 passed (1)
      Tests  20 passed (20)

$ pnpm exec vitest run tests/unit/clientes/scope.test.ts
 Test Files  1 failed (1)
      Tests  2 failed | 19 passed (21)   ← los dos rojos esperados de T4 (ver arriba)

$ pnpm exec vitest run tests/unit/clientes/schema/customers-search-migration.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)

$ pnpm exec vitest run tests/guards/guard-aislamiento-integracion.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ DATABASE_URL=...QuimiCloude_QC154 DIRECT_URL=...QuimiCloude_QC154 \
  pnpm exec vitest run tests/integration/clientes
 Test Files  3 passed (3)
      Tests  25 passed (25)
```

No se corrió `pnpm test` ni `./init.sh` (fuera del encargo de esta tanda; los explícitamente
permitidos eran `typecheck`, `lint`, `vitest related`/archivos concretos, las guardias tocadas y
los tests de integración propios).

## Mapa `R<n> → test` (lo que cubre esta tanda)

| R | Test |
| --- | --- |
| R27 (parte) | `tests/guards/guard-contrato-listados.test.ts` → séptimo módulo `clientes` |
| R31 (parte) | `tests/guards/guard-contrato-listados.test.ts` → bloque 3, pureza del dominio de `clientes` |
| R32 (parte) | `tests/guards/guard-catalogo-de-errores.test.ts` → `CustomerNotFoundError` cierra el orfanato |
| R36 | `tests/unit/clientes/scope.test.ts` → `R36 — lib/modules/clientes/** no reimplementa la aritmetica de paginacion` |
| R37 (enmendado) | `tests/unit/clientes/scope.test.ts` → `model Customer solo gano los tres campos normalizados...` + `solo dos migraciones del repo tocan la tabla customers...` |
| R38 | `tests/unit/clientes/scope.test.ts` → `R38 — nada bajo app/ que nombre clientes` |
| R40 | `tests/unit/clientes/scope.test.ts` → `R40 — clientes no nombra pedidos ni pedidos nombra clientes` |
| R35 (parte) | `tests/unit/clientes/scope.test.ts` → `R20 (QC-153), R35 (QC-154) — ...` (dos casos; **dos siguen en rojo esperado**, ver arriba) |
| R43 | `tests/unit/clientes/schema/customers-search-migration.test.ts` (relleno antes del NOT NULL, misma pareja de `translate`) + `tests/integration/clientes/customers-search-migration.int.test.ts` (`R43 — ...`) |
| R44 | `tests/unit/clientes/schema/customers-search-migration.test.ts` (NOT NULL, sin UNIQUE) + `tests/integration/clientes/customers-search-migration.int.test.ts` (`R44 — ...`) |
| R45 | `tests/unit/clientes/schema/customers-search-migration.test.ts` (tres GIN parciales, ninguna otra tabla) + `tests/integration/clientes/customers-search-migration.int.test.ts` (`R45 — ...`) |
| R46 | `tests/unit/clientes/schema/customers-search-migration.test.ts` (down sin DROP EXTENSION, down que olvida columna) + **T21**, ciclo real `db:migrate` → `db:rollback` → `db:migrate` |

## Archivos tocados (tanda T1/T2/T4/T19/T20/T21)

- `lib/modules/clientes/domain/actor.ts` (nuevo)
- `lib/modules/clientes/domain/customer-scope.ts` (nuevo)
- `lib/modules/clientes/domain/errors.ts` (nuevo)
- `lib/modules/clientes/domain/page.ts` (nuevo)
- `lib/modules/clientes/domain/customer-id.ts` (nuevo)
- `lib/modules/clientes/domain/list-query.ts` (nuevo)
- `lib/modules/clientes/ports/list-query-log.ts` (nuevo)
- `tests/guards/guard-contrato-listados.test.ts`
- `tests/unit/clientes/scope.test.ts`
- `tests/unit/clientes/schema/customers-search-migration.test.ts` (nuevo)
- `tests/integration/clientes/customers-search-migration.int.test.ts` (nuevo)
- `tests/integration/aislamiento.json`
- `specs/QC-154-crud-de-clientes/tasks.md` (checkboxes T1, T2, T4, T19, T20, T21)

## Veredicto (tanda T1/T2/T4/T19/T20/T21)

T1, T2, T4, T19, T20 y T21 cerradas y verificadas con evidencia real (incluido el ciclo real de
migración contra `QuimiCloude_QC154`). Los únicos rojos son los dos esperados y documentados de T4
(lista cerrada de archivos y `adapters/driving/` exacto), que se cierran en T12/T15 cuando el resto
del módulo se llene; no se relajó ninguna regla para ocultarlos.

---

# Tanda T5, T6, T7, T8 (Grupo B)

## T5 — Esquemas de entrada

- `lib/modules/clientes/domain/customer-input.ts`: los seis largos máximos (`design.md > 6.3`),
  `blankToNull` copiado (tres líneas, sin importarlo de `proveedores`), y `createCustomerSchema`
  (`z.object`, no `strictObject`: las claves de más se descartan) con `trim()` antes de `min`/`max`
  y `transform` que aplica `blankToNull` a los tres opcionales. `updateCustomerSchema =
  createCustomerSchema` (reemplazo completo, R20). Sin `refine` cruzado (no hay regla «al menos
  uno de» en clientes, a diferencia de proveedores).
- `tests/unit/clientes/customer-input.test.ts`: R14 (ausente/vacío/blanco de los tres
  obligatorios, con recorte), R15 (las 5³ combinaciones de ausencia de los tres opcionales, más
  contenido con recorte), R16 (máximo exacto acepta, máximo+1 rechaza, para los seis campos), R17
  (sin formato de correo ni teléfono) y R18 (claves ajenas —`companyId`, `createdBy`, `deletedAt`,
  `nit`— sin efecto en lo que llega al puerto).

## T6 — Tipos de salida, lista blanca y puerto

- `lib/modules/clientes/domain/customer-view.ts`: `NewCustomer` (`Pick` de `Customer` más las tres
  formas normalizadas, R42) y `CustomerView` (`Omit<Customer, 'companyId' | 'deletedAt'>`, R22).
- `lib/modules/clientes/domain/customer-queryable.ts`: `CUSTOMER_QUERYABLE` con `sortable`
  (nombres, apellidos, ciudad, las dos fechas), `filterable` (ciudad texto, fecha de alta rango) y
  `searchable: true` (R28).
- `lib/modules/clientes/ports/customer-repository.ts`: los cinco métodos con `scope:
  CustomerScope` como último parámetro obligatorio, sin resultado `'duplicate'` (R19).
- Borrado `lib/modules/clientes/ports/.gitkeep`.
- Sin test propio (T6 no lo pide); el typecheck limpio es su criterio de «hecho» y T7 los ejercita
  con dobles.

## T7 — Los cinco casos de uso

- `lib/modules/clientes/domain/{create,update,delete,get,list}-customer.ts`: `requirePermission`
  en la primera línea de los cinco; `isCustomerId(id)` en `get`/`update`/`delete`, después del
  permiso y antes del puerto (P5); el alta y la edición calculan las tres formas normalizadas con
  `normalizeCustomerText` (T18) y las pasan al puerto emparejadas con su dato (R42); reloj
  inyectable `now?: () => Date`.
- `tests/unit/clientes/customer-service.test.ts`: R9 (empresa del actor, no la de la entrada),
  R13 (alta devuelve el id), R18 (censo exacto de lo que llega al puerto), R19 (duplicados sin
  error), R20 (reemplazo completo, opcional ausente), R21 (autoría), R22 (censo de la ficha), R23
  (inexistente/dado de baja/id sin forma → `customer_not_found`, sin tocar el puerto con el id sin
  forma), R25 (censo exacto del puerto, sin restaurar), R42 (formas normalizadas emparejadas, con
  acentos reales) y R47 (ficha y listado sin las tres formas normalizadas).
- `tests/unit/clientes/list-customers.test.ts`: R26 (rechazo sin leer del repositorio, con el
  defecto de página aplicado), R27 (campo omitido no rompe y el log recibe solo el nombre, nunca
  el texto buscado ni el valor del filtro) y R28 (censo de `CUSTOMER_QUERYABLE` y que `deletedAt`/
  `companyId` no llegan al puerto aunque se pidan).

## T8 — Autorización

- `tests/unit/clientes/authorization.test.ts`: dobles del puerto y del log que **explotan si se
  llaman** (mismo patrón que `tests/unit/proveedores/authorization.test.ts`). R1 (el actor es
  parámetro, ningún archivo de `domain/` lee sesión ni cabecera), R2 (lectura sin
  `clientes.consultar`), R3 (escritura sin `clientes.modificar`), R4 (actor ausente, vacío, o solo
  el permiso contrario), R5 (sin permiso y con entrada inválida responde `unauthorized`, no
  `invalid_input`; se comprueba que el permiso se evalúa antes que `isCustomerId`/`zod`) y R8 (los
  tres conjuntos reales de `SEED_ROLE_PERMISSIONS`: Administrador autoriza las cinco, Operador y
  Empacador las rechazan las cinco).
- `tests/guards/guard-autorizacion-por-permiso.test.ts`: `'clientes'` añadido a `BUSINESS_MODULES`
  (séptimo módulo de negocio). La guardia sigue en verde: `actor.ts` de `clientes` autoriza por
  permiso, sin `roleName` ni literal de rol (R6).

## Verificación — salida real (tanda T5/T6/T7/T8)

```
$ pnpm exec next typegen && pnpm run typecheck
✓ Types generated successfully
> tsc --noEmit
(sin salida — 0 errores)

$ pnpm run lint
✖ 7 problems (0 errors, 7 warnings)   ← preexistentes, ajenos a esta tanda
  (tests/unit/documentos/confirm-catalog-import.test.ts, tests/unit/pedidos/order-service.test.ts)

$ pnpm exec vitest run tests/unit/clientes/customer-input.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)

$ pnpm exec vitest run tests/unit/clientes/customer-service.test.ts tests/unit/clientes/list-customers.test.ts
 Test Files  2 passed (2)
      Tests  14 passed (14)

$ pnpm exec vitest run tests/unit/clientes/authorization.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ pnpm exec vitest run tests/guards/guard-autorizacion-por-permiso.test.ts
 Test Files  1 passed (1)
      Tests  13 passed (13)

$ pnpm exec vitest run tests/unit/clientes
 Test Files  1 failed | 7 passed (8)
      Tests  2 failed | 72 passed (74)
  → los dos rojos son los mismos dos esperados de T4 (lista cerrada de archivos del módulo y
    adapters/driving/ exacto), sin cambio; se cierran en T12/T15.

$ pnpm exec vitest related --run lib/modules/clientes/domain/create-customer.ts \
  lib/modules/clientes/domain/update-customer.ts lib/modules/clientes/domain/delete-customer.ts \
  lib/modules/clientes/domain/get-customer.ts lib/modules/clientes/domain/list-customers.ts \
  lib/modules/clientes/domain/customer-input.ts lib/modules/clientes/domain/customer-view.ts \
  lib/modules/clientes/domain/customer-queryable.ts lib/modules/clientes/ports/customer-repository.ts \
  tests/guards/guard-autorizacion-por-permiso.test.ts
 Test Files  5 passed (5)
      Tests  38 passed (38)
```

No se corrió `pnpm test` ni `./init.sh` (fuera del encargo de esta tanda; el encargo pedía
`typecheck`, `lint`, y `vitest run`/`related` acotado a los archivos y guardias tocados).

## Mapa `R<n> → test` (lo que cubre esta tanda)

| R | Test |
| --- | --- |
| R14 | `tests/unit/clientes/customer-input.test.ts` → `R14 — ...` |
| R15 | `tests/unit/clientes/customer-input.test.ts` → `R15 — ...` |
| R16 | `tests/unit/clientes/customer-input.test.ts` → `R16 — ...` |
| R17 | `tests/unit/clientes/customer-input.test.ts` → `R17 — ...` |
| R18 | `tests/unit/clientes/customer-input.test.ts` → `R18 — ...` + `tests/unit/clientes/customer-service.test.ts` → `R18 — ...` |
| R19 | `tests/unit/clientes/customer-service.test.ts` → `R19 — ...` |
| R9 | `tests/unit/clientes/customer-service.test.ts` → `R9 — ...` |
| R13 | `tests/unit/clientes/customer-service.test.ts` → `R13 — ...` |
| R20 | `tests/unit/clientes/customer-service.test.ts` → `R20 — ...` |
| R21 | `tests/unit/clientes/customer-service.test.ts` → `R21 — ...` |
| R22 | `tests/unit/clientes/customer-service.test.ts` → `R22 — ...` |
| R23 | `tests/unit/clientes/customer-service.test.ts` → `R23 — ...` |
| R25 | `tests/unit/clientes/customer-service.test.ts` → `R25 — ...` |
| R42 | `tests/unit/clientes/customer-service.test.ts` → `R42 — ...` |
| R47 | `tests/unit/clientes/customer-service.test.ts` → `R47 — ...` |
| R26 | `tests/unit/clientes/list-customers.test.ts` → `R26 — ...` |
| R27 | `tests/unit/clientes/list-customers.test.ts` → `R27 — ...` |
| R28 | `tests/unit/clientes/list-customers.test.ts` → `R28 — ...` |
| R1 | `tests/unit/clientes/authorization.test.ts` → `R1 — ...` |
| R2 | `tests/unit/clientes/authorization.test.ts` → `R2 — ...` |
| R3 | `tests/unit/clientes/authorization.test.ts` → `R3 — ...` |
| R4 | `tests/unit/clientes/authorization.test.ts` → `R4 — ...` |
| R5 | `tests/unit/clientes/authorization.test.ts` → `R5 — ...` |
| R6 | `tests/guards/guard-autorizacion-por-permiso.test.ts` → `BUSINESS_MODULES` incluye `clientes` |
| R8 | `tests/unit/clientes/authorization.test.ts` → `R8 — ...` |

## Archivos tocados (tanda T5/T6/T7/T8)

- `lib/modules/clientes/domain/customer-input.ts` (nuevo)
- `lib/modules/clientes/domain/customer-view.ts` (nuevo)
- `lib/modules/clientes/domain/customer-queryable.ts` (nuevo)
- `lib/modules/clientes/ports/customer-repository.ts` (nuevo)
- `lib/modules/clientes/ports/.gitkeep` (borrado)
- `lib/modules/clientes/domain/create-customer.ts` (nuevo)
- `lib/modules/clientes/domain/update-customer.ts` (nuevo)
- `lib/modules/clientes/domain/delete-customer.ts` (nuevo)
- `lib/modules/clientes/domain/get-customer.ts` (nuevo)
- `lib/modules/clientes/domain/list-customers.ts` (nuevo)
- `tests/unit/clientes/customer-input.test.ts` (nuevo)
- `tests/unit/clientes/customer-service.test.ts` (nuevo)
- `tests/unit/clientes/list-customers.test.ts` (nuevo)
- `tests/unit/clientes/authorization.test.ts` (nuevo)
- `tests/guards/guard-autorizacion-por-permiso.test.ts`
- `specs/QC-154-crud-de-clientes/tasks.md` (checkboxes T5, T6, T7, T8)

## Veredicto (tanda T5/T6/T7/T8)

T5, T6, T7 y T8 cerradas y verificadas con evidencia real. Los archivos nuevos de esta tanda son
exactamente los que la lista cerrada de `tests/unit/clientes/scope.test.ts` espera (verificado
antes de escribir cada uno); los dos rojos que quedan en ese archivo son los mismos dos ya
documentados en la tanda de T4 (adaptadores y Server Action, Grupo C), sin ningún rojo nuevo. No
se tocó `feature_list.json` ni `progress/current.md`.

---

# Tanda T9, T10, T11, T12 (Grupo C)

## T9 — Adaptador driven

- `lib/modules/clientes/adapters/driven/persistence/company-scope.ts`: copia del patrón de
  `proveedores` (`companyScope` privada + dos envolturas, `customerCompanyScope` y
  `companyScopeColumns`).
- `lib/modules/clientes/adapters/driven/persistence/list-query-sql.ts`: **solo**
  `textCondition` y `dateRangeCondition`, copiados de `proveedores` (no el archivo entero:
  `numberRangeCondition`, `selectCondition` y `normalizedSearchCondition` no los usa este
  módulo). `textCondition` queda exportado y sin consumidor en `customer-prisma.ts` porque el
  filtro de ciudad (R47, `design.md > 17.3`) va contra `cityNormalized`, no contra la columna en
  crudo: importarlo sin usarlo hubiera sido un `unused import` de lint, así que no se importa.
- `lib/modules/clientes/adapters/driven/persistence/customer-prisma.ts`: los cinco métodos de
  `CustomerRepository`. `create` y `updateAlive` escriben las tres formas normalizadas que ya
  traen (sin volver a normalizar nada); `updateAlive` y `softDeleteAlive` son `updateMany` con
  `{ id, deletedAt: null, ...customerCompanyScope(scope) }`; `softDeleteAlive` sin transacción
  (el cliente no arrastra tabla hija, a diferencia del proveedor); orden por defecto
  `lastNames ASC, firstNames ASC, id ASC` con `TIE_BREAKER`; `listAliveCustomers` usa
  `toOffsetLimit`/`buildPage` y un único objeto `where` para `findMany` y `count`. La búsqueda
  (`searchCondition`) parte el término por espacios, normaliza cada palabra con
  `normalizeCustomerText` y descarta las vacías, contra las tres columnas `*Normalized` sin
  `mode: 'insensitive'` (R30, R41). El filtro de ciudad normaliza el valor contra
  `cityNormalized` (R47). `select` explícito sin `companyId`, `deletedAt` ni las tres formas
  normalizadas.
- Borrado `lib/modules/clientes/adapters/.gitkeep`.
- **Comprobado**: es el único archivo del módulo (junto con `company-scope.ts`) que importa
  `@prisma/client`; ninguna consulta nombra otro modelo que `customer`.

### Verificación de T9

```
$ pnpm exec next typegen && pnpm run typecheck
✓ Types generated successfully
> tsc --noEmit
(sin salida — 0 errores)

$ pnpm exec vitest run tests/unit/clientes/scope.test.ts
 Test Files  1 failed (1)
      Tests  2 failed | 99 passed (101)
  → los dos rojos esperados (lista cerrada de archivos, adapters/driving/ exacto), sin cambio.
```

## T10 — Guardia del ámbito de empresa

- `tests/guards/guard-ambito-empresa-clientes.test.ts`, calcada de
  `guard-ambito-empresa-proveedores.test.ts` pero recortada a un solo puerto
  (`CustomerRepository`, 5 métodos) y sin el caso de `isSupplierAlive`/arrastre transaccional,
  que no existen en `clientes`.
- **Los dos fabricados exigidos, comprobados en rojo real y revertidos** (append temporal al
  final de `customer-prisma.ts`, corrida de la guardia, y borrado exacto del texto añadido):
  1. Una función nueva (`findAnyCustomerById(id)`) que toca `prisma.customer.findFirst` **sin**
     declarar `scope: CustomerScope` → rojo real: *"consulta la base SIN declarar
     `scope: CustomerScope`"*.
  2. La misma función, ahora **declarando** `scope: CustomerScope` pero sin componerlo en el
     `where` (`void scope;`) → rojo real, distinto del anterior: *"declara el ámbito pero no lo
     lleva hasta las envolturas de `./company-scope`"*.
  3. Revertido (el archivo en disco vuelve a ser exactamente el de T9) y la guardia vuelve a
     18/18 en verde.

### Verificación de T10

```
$ pnpm exec vitest run tests/guards/guard-ambito-empresa-clientes.test.ts
 Test Files  1 passed (1)
      Tests  18 passed (18)
```
