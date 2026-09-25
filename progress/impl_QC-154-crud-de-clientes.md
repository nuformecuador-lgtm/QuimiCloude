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

## T3 — Enmienda al catálogo de errores (decimotercera)

- `lib/modules/errores/domain/error-codes.ts`: `customer_not_found` añadido a `ERROR_CODES`, con
  la línea de cabecera «**Decimotercera enmienda, 2026-09-24**: `customer_not_found`.».
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

## T11 — Contrato y composición

- `lib/modules/clientes/index.ts`: reexporta tipos, esquemas, constantes de largo, errores,
  `CUSTOMER_QUERYABLE` y las cinco factories con sus `*Deps` — **solo** de `./domain`,
  conservando el reexport de `Customer` desde `./domain/customer` que exige `scope.test.ts`.
- `lib/composition/index.ts`: bloque `clientes` **al final** del archivo (tras el bloque
  `documentos`), con sus imports al final del bloque de imports existente; no se reordena ni
  reformatea ninguna línea de lo que había.

### Verificación de T11

```
$ pnpm exec next typegen && pnpm run typecheck
✓ Types generated successfully
> tsc --noEmit
(sin salida — 0 errores)

$ pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts tests/guards/guard-ambito-empresa-clientes.test.ts
 Test Files  2 passed (2)
      Tests  80 passed (80)
  → guard-ambito-empresa-clientes ya no falla por «lib/composition no ata customerRepository»:
    el cableado existe desde este commit.
```

## T12 — Server Actions

- `lib/modules/clientes/adapters/driving/customer-actions.ts`: cinco Server Actions
  (`createCustomerAction`, `updateCustomerAction`, `deleteCustomerAction`, `getCustomerAction`,
  `listCustomersAction`), calcadas de `supplier-actions.ts`. `currentActor()` resuelve las dos
  caras de la sesión con un único `runInRequestScope(() => Promise.all([...]))`. La baja rechaza
  un `id` vacío del `FormData` con `invalid_input` **sin** llamar al caso de uso. El traductor
  único es `createErrorStateTranslator(ClientesError, observabilidad.readRequestIdHeader)`. La
  action no repite ninguna comprobación de permiso ni ninguna regla de negocio.
- En el mismo commit: fila `listCustomersAction` en `ACCIONES` de
  `tests/unit/identity/session-once-per-request-actions.test.ts`; `'clientes'` en
  `BUSINESS_MODULES` de `tests/guards/guard-permisos-no-administrables.test.ts`; `'clientes'` en
  `MODULOS_DE_NEGOCIO` de `tests/guards/guard-identificador-de-request.test.ts`.
- `tests/unit/clientes/customer-actions.test.ts` (nuevo): R7, R32, R33, más el caso R22 (QC-59)
  heredado del patrón de `proveedores` (falta de cualquiera de las dos caras de sesión).
- Los dos rojos esperados de `tests/unit/clientes/scope.test.ts` (lista cerrada de archivos y
  `adapters/driving/` exacto) quedan **verdes** sin relajar ningún test: `customer-actions.ts` es
  ahora exactamente el único archivo de `adapters/driving/`.

### Verificación de T12

```
$ pnpm exec next typegen && pnpm run typecheck
✓ Types generated successfully
> tsc --noEmit
(sin salida — 0 errores)

$ pnpm run lint
✖ 7 problems (0 errors, 7 warnings)   ← preexistentes, ajenos a esta tanda
  (tests/unit/documentos/confirm-catalog-import.test.ts, tests/unit/pedidos/order-service.test.ts)

$ pnpm exec vitest run tests/unit/clientes/customer-actions.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)

$ pnpm exec vitest run tests/unit/clientes/scope.test.ts tests/guards/guard-ambito-empresa-clientes.test.ts \
  tests/guards/guard-permisos-no-administrables.test.ts tests/guards/guard-identificador-de-request.test.ts \
  tests/unit/identity/session-once-per-request-actions.test.ts
 Test Files  5 passed (5)
      Tests  121 passed (121)
  → una corrida aislada dio un rojo transitorio en guard-permisos-no-administrables: un ENOENT al
    leer lib/modules/clientes/__sensibilidad_literal__.ts, el fabricado que scope.test.ts crea y
    borra en su propio caso. Es una condicion de carrera entre workers de vitest leyendo el mismo
    arbol de archivos a la vez (no una regresion de esta tanda): repetido tres veces mas y en
    solitario, siempre 121/121 en verde.

$ pnpm exec vitest run tests/guards/guard-catalogo-de-errores.test.ts tests/guards/guard-autorizacion-por-permiso.test.ts \
  tests/guards/guard-contrato-listados.test.ts tests/guards/guard-arquitectura-modulos.test.ts
 Test Files  4 passed (4)
      Tests  129 passed (129)

$ pnpm exec vitest run tests/unit/clientes
 Test Files  10 passed (10)
      Tests  84 passed (84)
  → los dos rojos de T4/T9 (lista cerrada de archivos, adapters/driving/ exacto) quedan verdes.
```

## Veredicto (tanda T9/T10/T11/T12)

T9, T10, T11 y T12 cerradas y verificadas con evidencia real, cada una en su propio commit.
Ningún rojo pendiente propio de esta tanda; el único rojo observado (`guard-permisos-no-
administrables` leyendo el fabricado temporal de `scope.test.ts`) es un flake de concurrencia
entre workers, reproducido y descartado corriendo la misma batería en solitario tres veces.

---

# Tanda T13, T14, T15 (Grupo D)

## Sincronizacion con `origin/dev` antes de empezar

`git fetch origin dev` trajo dos commits por encima del punto de partida de esta rama
(`9ce363e5`): `ffbb4633` (QC-169, solo `feature_list.json`) y `7c30a294` (QC-150, solo
`progress/current.md`). Ninguno de los dos toca `db/schema.prisma`, `db/migrations/` ni
`tests/guards/guard-identificador-de-request.test.ts`: no hay ninguna migracion de QC-150 con
timestamp posterior a `20260924190000`, asi que no hizo falta renumerar nada. Se hizo
`git merge origin/dev --no-edit` (merge, no rebase), sin conflictos.

## T13 — Integracion: CRUD y aislamiento

- `tests/integration/clientes/customer-repository.int.test.ts` (nuevo), contra
  `QuimiCloude_QC154` (`DATABASE_URL`/`DIRECT_URL` sobrescritos en el entorno del comando, nunca
  la compartida del `.env`). Cada caso fabrica su propia empresa efimera (documento, rol,
  usuario, empresa) con `randomUUID`; el `afterAll` cuenta que no quedo ninguna fila de
  `customers` de esas empresas antes de borrarlas, en el orden de las FK (`customers` -> usuarios
  -> rol y tipo de documento -> empresa).
- R10 se demuestra releyendo la fila ajena: tras que la empresa A intenta leer/editar/dar de baja
  un cliente de la empresa B (null/'not_found'/false), se relee la fila con el scope de la
  empresa B y se comprueba que sigue con sus datos originales y su `updatedBy` intacto, ademas de
  mirar la fila cruda de Prisma.
- Cobertura exacta pedida por `tasks.md`: R9, R10, R11, R13, R15, R19, R21, R23, R24, R25.
- Entrada nueva en `commit` de `tests/integration/aislamiento.json`, con motivo y `desde`
  (2026-09-24): el adaptador usa el cliente Prisma global, asi que una transaccion de test con
  ROLLBACK no lo envolveria.
- Los nombres de `it()` se corrigieron en un commit de seguimiento para llevar el prefijo
  `R<n> — ...` exacto de la tabla de Trazabilidad de `tasks.md` (el primer commit los tenia en el
  `describe()` pero no en el `it()`).

## T14 — Integracion: listado

- `tests/integration/clientes/list-query-customers.int.test.ts` (nuevo), misma base y misma
  declaracion en `aislamiento.json`. Cada caso siembra sus propios clientes con un marcador
  irrepetible (`MARCA` + un sufijo por caso) para no depender del estado del catalogo de la
  empresa.
- Cobertura exacta: R26 (100 a 25, con `total`), R29 (recorrido de paginas sin repetir ni omitir
  por apellidos/nombres, con un caso de empate real de 4 filas resuelto por el desempate en
  `id`), R30 (dos palabras en columnas distintas + termino en blanco comparado contra
  `search: ''` con el mismo filtro de ciudad), R31 (total del conjunto filtrado, no de la
  pagina), R11 con busqueda (una busqueda que casa con clientes de otra empresa no los trae).
- F1.4: R41 (mayusculas/acentos + termino de solo simbolos comparado contra `search: ''`, que
  sustituye el viejo caso «`%` no devuelve a todos») y R47 (filtrar por «bogota» encuentra
  «Bogota» y no «Medellin»).

### Verificacion real de T13/T14

```
$ pnpm exec next typegen && pnpm run typecheck
✓ Types generated successfully
> tsc --noEmit
(sin salida — 0 errores)

$ pnpm run lint
✖ 7 problems (0 errors, 7 warnings)   ← preexistentes, ajenos a esta tanda

$ DATABASE_URL=...QuimiCloude_QC154 DIRECT_URL=...QuimiCloude_QC154 \
  pnpm exec vitest run tests/integration/clientes/customer-repository.int.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)

$ DATABASE_URL=...QuimiCloude_QC154 DIRECT_URL=...QuimiCloude_QC154 \
  pnpm exec vitest run tests/integration/clientes/list-query-customers.int.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)

$ DATABASE_URL=...QuimiCloude_QC154 DIRECT_URL=...QuimiCloude_QC154 \
  pnpm exec vitest run tests/integration/clientes
 Test Files  5 passed (5)
      Tests  44 passed (44)

$ pnpm exec vitest run tests/guards/guard-aislamiento-integracion.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

## T15 — Cierre del alcance

`tests/unit/clientes/scope.test.ts` releido con el modulo ya lleno (21 casos, todos verdes en
una corrida limpia). Cada regla que `design.md > 11` declara se comprobo en rojo real contra el
arbol de disco, con el fabricado indicado, y se revirtio:

| Regla | Fabricado usado | Resultado |
| --- | --- | --- |
| R20/R35 — lista cerrada de archivos del modulo | `domain/__fabricado_extra__.ts` de mas | Rojo real: `archivosReales` trae 24 en vez de 23. Revertido, vuelve a 21/21 verde. |
| R20/R35 — 'use server' fuera de `adapters/driving/` | Se antepuso 'use server' a `customer-scope.ts` | Rojo real: `customer-scope.ts no puede declarar 'use server' fuera de adapters/driving/`. Revertido con `git checkout`. |
| R26 — `adapters/driving/` = exactamente `customer-actions.ts` | `adapters/driving/__fabricado_extra__.ts` | Rojo real: `['customer-actions.ts', '__fabricado_extra__.ts']` distinto de `['customer-actions.ts']`. Borrado, vuelve a verde. |
| R26 — literal de permiso fuera de `domain/` | Caso ya en el archivo (`lib/modules/clientes/__sensibilidad_literal__.ts`) | Ya en verde: dispara. |
| R26 — literal DENTRO de `domain/` no dispara | Caso ya en el archivo (`domain/__sensibilidad_literal__.ts`) | Ya en verde: NO dispara (caso simetrico exigido). |
| R28 — sin E2E de clientes | Sin cambio (decision 7, `design.md > 11` dice "Ninguno") | No aplica fabricado nuevo: QC-153 ya lo cubre e intacto. |
| R29 — sin dependencias nuevas | Caso ya en el archivo (datos sinteticos) | Ya en verde. |
| R36 — sin aritmetica de paginacion propia | Caso ya en el archivo (`domain/__sensibilidad_paginacion__.ts`) | Ya en verde: dispara. |
| R37 — schema.prisma solo gana los tres campos normalizados | Campo `fabricadoDeMas` insertado a mano en `model Customer` | Rojo real: aparece en el censo de campos. Revertido con `git checkout`. |
| R37 — una sola migracion nueva toca `customers` | Carpeta `db/migrations/99999999999999_fabricado_customers/migration.sql` con `ALTER TABLE "customers"` | Rojo real: lista con una migracion de mas. Carpeta borrada, vuelve a verde. |
| R38 — nada bajo `app/` que nombre clientes | Caso ya en el archivo (`app/__sensibilidad_clientes__/page.tsx`) | Ya en verde: dispara. |
| R40 — sin acoplamiento con `pedidos` | Caso ya en el archivo (`domain/__sensibilidad_pedidos__.ts`) | Ya en verde: dispara. |

**Que se relajo (solo lo que `design.md > 11` declara, nada mas):**

1. `ports y adapters estan vacios salvo su .gitkeep` + `domain solo tiene customer.ts` pasa a ser
   una lista cerrada de 23 archivos (sin ningun `.gitkeep`).
2. `ningun archivo alcanzable desde el contrato declara 'use server'`, antes barria todo el
   modulo, ahora se acota a excluir `adapters/driving/**`.
3. `el literal de los dos permisos solo aparece en permissions.ts` se relaja a `permissions.ts`
   y `lib/modules/clientes/domain/**`.
4. `adapters/driving/ esta vacio` pasa a `adapters/driving/` contiene exactamente
   `customer-actions.ts`.

Nada mas se toco: los casos de R28 y R29 de QC-153 siguen intactos, sin una linea cambiada
(confirmado leyendo el archivo: no llevan ningun `R<n> (QC-154)` en el nombre).

**Que se amplio (`design.md > 12`, ninguno relajado):** `guard-contrato-listados` (septimo
modulo `clientes`), `guard-autorizacion-por-permiso` ('clientes' en `BUSINESS_MODULES`),
`guard-permisos-no-administrables` (idem), `guard-identificador-de-request` ('clientes' en
`MODULOS_DE_NEGOCIO` mas la migracion `20260924190000_customers_search_normalized` en su lista
cerrada), `tests/unit/identity/session-once-per-request-actions.test.ts` (fila
`listCustomersAction`), `tests/unit/errores/catalogo.test.ts` (54 a 55),
`tests/integration/aislamiento.json` (dos entradas nuevas en `commit`, T13 y T14),
`tests/unit/clientes/schema/customers-schema.test.ts` y
`tests/integration/clientes/customers-constraints.int.test.ts` (F1.4, tanda anterior). Ninguna
guardia existente perdio un caso ni un aserto.

### Riesgo observado: ENOENT transitorio por concurrencia de workers

`scope.test.ts` fabrica y borra, dentro del mismo `it()` (con `try`/`finally`), archivos reales
bajo `lib/modules/clientes/**` y `app/__sensibilidad_clientes__/page.tsx`. El diseno lo exige
(la sensibilidad tiene que probarse contra el arbol real, no contra un array en memoria) y no se
cambio. El riesgo se reprodujo en esta tanda, no solo se cito de la anterior. Corrida de:
`tests/unit/clientes`, `guard-ambito-empresa-clientes`, `guard-contrato-listados`,
`guard-autorizacion-por-permiso`, `guard-arquitectura-modulos`, `guard-catalogo-de-errores`,
`guard-permisos-no-administrables`, `guard-identificador-de-request`,
`guard-aislamiento-integracion`, `session-once-per-request-actions`, `catalogo`, repetida tres
veces:

- Corrida 1: 20 archivos, 355 tests, todos verdes.
- Corrida 2: `guard-catalogo-de-errores.test.ts` falla con `ENOENT: no such file or directory,
  open '...\lib\modules\clientes\__sensibilidad_literal__.ts'` al leer todos los archivos de
  `lib/modules/**` de una vez (otro worker borro el fabricado de `scope.test.ts` entre el listado
  y la lectura). 2 tests de 355 fallaron esa corrida.
- Corrida 3: 20 archivos, 355 tests, todos verdes de nuevo.

Cada archivo, corrido EN SOLITARIO (`scope.test.ts`, `guard-catalogo-de-errores.test.ts`,
`guard-permisos-no-administrables.test.ts`, `guard-arquitectura-modulos.test.ts`), sale siempre
verde: confirma que es una condicion de carrera entre workers de Vitest leyendo el mismo arbol de
archivos a la vez, no una regresion de esta ni de una tanda anterior.

**Guardias en riesgo** (recorren `lib/modules/**` y/o `app/**` con `readdirSync`, y por tanto
pueden ver un fabricado a medio escribir/borrar de `scope.test.ts` si corren en el mismo lote de
workers): `guard-arquitectura-modulos`, `guard-autorizacion-por-permiso`,
`guard-catalogo-de-errores`, `guard-permisos-no-administrables`, `guard-identificador-de-request`,
las cinco `guard-ambito-empresa-*`, `guard-pantallas-exigen-permiso`,
`guard-rutas-privadas-cubiertas`, y cualquier otra guardia que recorra esas raices con
`readdirSync`.

**Que significa para el gate completo.** `./init.sh` corre Vitest con mas de un worker; un rojo
en una de esas guardias que solo aparece ahi y desaparece al reintentar la MISMA corrida (sin
tocar codigo) es este flake, no una regresion, igual que ya documento la bitacora de T9-T12. No
se cambia el patron de `scope.test.ts` (el diseno lo prescribe) ni se afina la configuracion de
Vitest: es una decision de arnes, no de esta ficha. Se deja la observacion escrita para quien
corra el gate completo (T16, fuera de esta tanda).

### Verificacion final de T15

```
$ pnpm exec vitest run tests/unit/clientes/scope.test.ts
 Test Files  1 passed (1)
      Tests  21 passed (21)

$ git status --short
(vacio: todos los fabricados de esta verificacion se revirtieron)
```

## Mapa `R<n> → test`, R1 a R47, verificado con grep contra los nombres reales

| R | Archivo(s) | Nombre real del test (grep) |
| --- | --- | --- |
| R1 | `tests/unit/clientes/authorization.test.ts` | `R1 — cada operacion recibe el actor por parametro y no lee ninguna sesion` |
| R2 | `tests/unit/clientes/authorization.test.ts` | `R2 — sin clientes.consultar la ficha y el listado se rechazan sin llamar al puerto` |
| R3 | `tests/unit/clientes/authorization.test.ts` | `R3 — sin clientes.modificar el alta, la edicion y la baja se rechazan sin llamar al puerto` |
| R4 | `tests/unit/clientes/authorization.test.ts` | `R4 — actor ausente, sin permisos o con el permiso contrario se rechaza igual` |
| R5 | `tests/unit/clientes/authorization.test.ts` | `R5 — sin permiso y con entrada invalida responde unauthorized, no invalid_input` |
| R6 | `tests/guards/guard-autorizacion-por-permiso.test.ts` | `BUSINESS_MODULES` incluye `'clientes'` (guardia ampliada, verde) |
| R7 | `tests/unit/clientes/customer-actions.test.ts` + `tests/unit/identity/session-once-per-request-actions.test.ts` | `R7 — la accion toma usuario y empresa de la sesion y no vuelve a comprobar el permiso` + fila `listCustomersAction` |
| R8 | `tests/unit/clientes/authorization.test.ts` | `R8 — con los permisos sembrados del Administrador se autorizan las cinco y con los del Operador o el Empacador se rechazan` |
| R9 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R9 — el alta usa la empresa del actor aunque la entrada traiga otra` + `R9 — el cliente creado queda en la empresa del actor` |
| R10 | `tests/integration/clientes/customer-repository.int.test.ts` | `R10 — la ficha, la edicion y la baja de un cliente de otra empresa responden customer_not_found y la fila ajena queda intacta` |
| R11 | `tests/integration/clientes/customer-repository.int.test.ts` + `tests/integration/clientes/list-query-customers.int.test.ts` | `R11 — el listado y su total solo cuentan la empresa del actor` + `R11 — una busqueda que casa con clientes de otra empresa no los devuelve` |
| R12 | `tests/guards/guard-ambito-empresa-clientes.test.ts` | `R12 — cada metodo del puerto declara Y consume el ambito de empresa` (mas otros tres casos R12) |
| R13 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R13 — el alta con datos validos devuelve el identificador del puerto` + `R13 — crea el cliente con datos validos y devuelve su identificador` |
| R14 | `tests/unit/clientes/customer-input.test.ts` | `R14 — rechaza nombres, apellidos o ciudad ausentes, vacios o en blanco, y recorta los validos` |
| R15 | `tests/unit/clientes/customer-input.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R15 — acepta cualquier combinacion de opcionales ausentes y convierte el blanco en ausencia` + `R15 — el opcional en blanco se guarda como NULL` |
| R16 | `tests/unit/clientes/customer-input.test.ts` | `R16 — acepta cada dato en su largo maximo y rechaza uno mas` |
| R17 | `tests/unit/clientes/customer-input.test.ts` | `R17 — acepta como correo y telefono cualquier texto dentro del largo` |
| R18 | `tests/unit/clientes/customer-input.test.ts` + `tests/unit/clientes/customer-service.test.ts` | `R18 — las claves ajenas a los seis datos no salen del esquema` + `R18 — al puerto solo llegan los seis datos de negocio (mas sus tres formas normalizadas)` |
| R19 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R19 — dos clientes vivos con los mismos seis datos se crean los dos, sin error de duplicado` + `R19 — dos clientes vivos con los mismos seis datos se crean los dos` |
| R20 | `tests/unit/clientes/customer-service.test.ts` | `R20 — la edicion reemplaza los seis datos y el opcional ausente queda como ausencia` |
| R21 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R21 — el actor queda como autor de creacion y modificacion al crear, y solo de modificacion al editar y dar de baja` + `R21 — editar y dar de baja no pisan created_by ni created_at` |
| R22 | `tests/unit/clientes/customer-service.test.ts` | `R22 — la ficha devuelve id, seis datos, instantes y autores, sin empresa ni marca de baja` |
| R23 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R23 — inexistente, dado de baja o id sin forma responden customer_not_found; el id sin forma no llega al puerto` + `R23 — editar o dar de baja un cliente ya dado de baja no cambia ninguna fila` |
| R24 | `tests/integration/clientes/customer-repository.int.test.ts` | `R24 — la baja conserva la fila completa y marca deleted_at` |
| R25 | `tests/unit/clientes/customer-service.test.ts` + `tests/integration/clientes/customer-repository.int.test.ts` | `R25 — no existe ninguna operacion de restaurar ni de listar dados de baja` + `R25 — la ficha y el listado excluyen los dados de baja` |
| R26 | `tests/unit/clientes/list-customers.test.ts` + `tests/integration/clientes/list-query-customers.int.test.ts` | `R26 — rechaza pagina o tamano no enteros o menores que 1 sin leer del repositorio` + `R26 — usa 10 por defecto y devuelve 25 como maximo cuando se piden 100, con el total` |
| R27 | `tests/unit/clientes/list-customers.test.ts` + `tests/guards/guard-contrato-listados.test.ts` | `R27 — omite el campo no declarado sin fallar y registra solo su nombre` + `clientes` como septimo modulo (`MODULOS`) |
| R28 | `tests/unit/clientes/list-customers.test.ts` | `R28 — solo son ordenables y filtrables los campos declarados, nunca deletedAt ni companyId` |
| R29 | `tests/integration/clientes/list-query-customers.int.test.ts` | `R29 — sin orden pedido ordena por apellidos y nombres y recorre las paginas sin repetir ni omitir` |
| R30 | `tests/integration/clientes/list-query-customers.int.test.ts` | `R30 — cada palabra debe aparecer en nombres, apellidos o ciudad` |
| R31 | `tests/integration/clientes/list-query-customers.int.test.ts` | `R31 — el total describe el conjunto filtrado y el filtro se aplica antes de paginar` |
| R32 | `tests/unit/clientes/customer-actions.test.ts` | `R32 — las mutaciones reciben FormData y las consultas argumentos tipados`. Hallazgo: el segundo test que la tabla de `tasks.md` cita para R32 (`scope.test.ts` con «R32 — no hay ningun route handler de clientes») no existe con ese nombre literal; la propiedad la sigue cerrando `R38 — nada bajo app/ que nombre clientes` (barre `app/` entero, route handlers incluidos) desde una tanda anterior (T4). No se creo un test nuevo con ese nombre para no inventar uno fuera del alcance de T13-T15; se deja anotado. |
| R33 | `tests/unit/clientes/customer-actions.test.ts` + `tests/guards/guard-catalogo-de-errores.test.ts` | `R33 — traduce cada error de dominio por su code estable, nunca por el texto` + guardia existente (verde) |
| R34 | `tests/unit/errores/catalogo.test.ts` | `las 55 entradas estan...` + `R34 — customer_not_found tiene clave y texto no vacio` |
| R35 | `tests/guards/guard-arquitectura-modulos.test.ts` + `tests/unit/clientes/scope.test.ts` | guardia existente (verde) + `R20 (QC-153), R35 (QC-154) — lista cerrada de archivos del modulo` + `... — ningun archivo alcanzable desde el contrato declara 'use server'` |
| R36 | `tests/unit/clientes/scope.test.ts` + `tests/unit/pagination.test.ts` | `R36 — lib/modules/clientes/** no reimplementa la aritmetica de paginacion` + tests existentes de 10/25 |
| R37 | `tests/unit/clientes/scope.test.ts` | `model Customer solo gano los tres campos normalizados respecto a QC-153` + `solo dos migraciones del repo tocan la tabla customers: la de QC-153 y la de esta ficha` |
| R38 | `tests/unit/clientes/scope.test.ts` | `ningun archivo de app/ nombra ni el nombre, ni la tabla, ni el permiso ni la ruta de clientes` (describe `R38`) + los dos casos `R28 — sin ningun test E2E de clientes` de QC-153, intactos |
| R39 | `tests/guards/guard-dependencias-aprobadas.test.ts` | guardia existente (verde) |
| R40 | `tests/unit/clientes/scope.test.ts` | `ningun archivo de clientes importa pedidos, y ninguno de pedidos importa clientes` (describe `R40`) |
| R41 | `tests/integration/clientes/list-query-customers.int.test.ts` + `tests/unit/clientes/customer-text.test.ts` | `R41 — la busqueda ignora acentos y mayusculas y un termino solo de simbolos equivale a no buscar` + `R41 — normaliza sin acentos, en minusculas y sin simbolos, igual que normalizeSupplierName` |
| R42 | `tests/unit/clientes/customer-service.test.ts` + `tests/unit/clientes/schema/customers-schema.test.ts` | `R42 — el alta y la edicion pasan cada forma normalizada emparejada con su dato` + censo de columnas (`R1, R4 (QC-153), R42 (QC-154)`) |
| R43 | `tests/integration/clientes/customers-search-migration.int.test.ts` + `tests/unit/clientes/schema/customers-search-migration.test.ts` | `R43 — ...` (T20) + relleno antes del NOT NULL (T19) |
| R44 | `tests/integration/clientes/customers-search-migration.int.test.ts` + `tests/unit/clientes/schema/customers-search-migration.test.ts` | `R44 — ...` (T20) + NOT NULL sin UNIQUE (T19) |
| R45 | `tests/integration/clientes/customers-search-migration.int.test.ts` + `tests/unit/clientes/schema/customers-search-migration.test.ts` | `R45 — ...` (T20) + tres GIN parciales (T19) |
| R46 | `tests/unit/clientes/schema/customers-search-migration.test.ts` + tarea T21 | down sin DROP EXTENSION (T19) + ciclo real `db:migrate` → `db:rollback` → `db:migrate` (T21, arriba en esta bitacora) |
| R47 | `tests/integration/clientes/list-query-customers.int.test.ts` + `tests/unit/clientes/customer-service.test.ts` | `R47 — filtrar por bogota devuelve Bogota con tilde` + `R47 — ni la ficha ni el listado devuelven formas normalizadas` |

Todos los R1 a R47 tienen al menos un test real verificado por grep. El unico hallazgo es el de
R32 anotado arriba: es una discrepancia de nombre literal contra la tabla de `tasks.md`, no un
requisito sin cubrir (la propiedad si la cierra R38 de `scope.test.ts`).

## Archivos tocados (tanda T13/T14/T15)

- `tests/integration/clientes/customer-repository.int.test.ts` (nuevo)
- `tests/integration/clientes/list-query-customers.int.test.ts` (nuevo)
- `tests/integration/aislamiento.json` (dos entradas nuevas en `commit`)
- `specs/QC-154-crud-de-clientes/tasks.md` (checkboxes T13, T14, T15)
- `progress/impl_QC-154-crud-de-clientes.md` (esta seccion)

Nada bajo `feature_list.json` ni fuera de esta lista. Ninguna dependencia nueva.

## Veredicto (tanda T13/T14/T15)

T13 y T14 cerradas con evidencia real contra `QuimiCloude_QC154` (44/44 en
`tests/integration/clientes`, `guard-aislamiento-integracion` en verde) y con los nombres de test
exactos de la tabla de Trazabilidad. T15 releyo `scope.test.ts` con el modulo lleno (21/21 en
verde), confirmo en rojo real cada regla de alcance con su fabricado (revertido en todos los
casos, `git status` limpio al terminar), documento que solo se relajo lo que `design.md > 11`
declara y amplio exactamente lo de `design.md > 12`, y dejo escrito el riesgo de ENOENT
transitorio por concurrencia de workers -reproducido esta vez, no solo citado-, sin tocar el
patron de `scope.test.ts` que el diseno exige. Un solo hallazgo de nomenclatura (R32, ver tabla),
sin ningun requisito sin cubrir. T16 (gate completo) queda para el leader.

## Anexo (cierre del hallazgo de R32)

Se releyo el hallazgo de la fila 964 (segundo test de R32 inexistente con ese nombre literal en
`scope.test.ts`) contra `design.md`. `design.md > 13` («Como se verifica») atribuye R32
explicitamente a `tests/unit/clientes/customer-actions.test.ts` (fila `R7, R32, R33`) y a
`tests/unit/clientes/scope.test.ts` **solo** `R35 (parte), R36, R37, R38, R40` -sin R32-, la misma
lista que enumera `design.md > 11` para lo que esta ficha anade a `scope.test.ts`. `design.md`
dice explicitamente que otro test (`customer-actions.test.ts`) cubre R32, asi que no se anadio el
caso a `scope.test.ts`: se habria estado testeando una propiedad ya cubierta con un nombre que el
propio diseno no pide ahi. Se corrigio la tabla de Trazabilidad de `tasks.md` (fila R32): ahora
cita solo `tests/unit/clientes/customer-actions.test.ts` y su caso real
(`R32 — las mutaciones reciben FormData y las consultas argumentos tipados`, que en su punto 3
verifica que no exista `app/api/clientes` ni `app/api/customers` y que ninguna accion llame por
`fetch`).

Verificacion (sin tocar `scope.test.ts` ni ningun otro test):

- `pnpm exec vitest run tests/unit/clientes/scope.test.ts` → 1 archivo, 21/21 en verde (sin
  cambios).
- `pnpm run typecheck` → sin salida, sin errores.
- `pnpm run lint` → 0 errores, 7 warnings preexistentes en
  `tests/unit/documentos/confirm-catalog-import.test.ts` y `tests/unit/pedidos/order-service.test.ts`
  (archivos no tocados por este anexo).

Archivos tocados en este anexo: `specs/QC-154-crud-de-clientes/tasks.md` (fila R32 de la tabla de
Trazabilidad) y `progress/impl_QC-154-crud-de-clientes.md` (este anexo). Nada en
`feature_list.json`, `progress/current.md` ni en ningun test.

## Correcciones tras review (RECHAZADO, `progress/review_QC-154-crud-de-clientes.md`)

Solo se toco `tests/unit/clientes/scope.test.ts`. Nada en `lib/`, `app/`, `db/`, otros tests,
`feature_list.json` ni `progress/current.md`.

### B2 — `scope.test.ts` fabricaba archivos en el arbol real

Los cinco casos de sensibilidad (`R26` x2, `R36`, `R38`, `R40`) escribian con `writeFileSync`
dentro de `lib/modules/clientes/**` o `app/__sensibilidad_clientes__/`, real, y borraban en
`finally`. Con el proyecto `node` de vitest en paralelo, cualquier guardia que barriera esas
raices podia toparse con el fabricado a medio vivir o ya borrado (ENOENT intermitente).

Arreglo: los cinco detectores quedaron parametrizados por raiz/directorio, con el arbol real
como valor por defecto —`fuentesDeProduccion(raiz = repoRoot)`,
`detectarLiteralesDePermiso(raiz = repoRoot)`, `hallazgosDePaginacion(dir = moduloDir)`,
`coincidenciasEnApp(appDir = join(repoRoot, 'app'))`, `hallazgosDeAcoplamiento(modDir = moduloDir,
pedidosDir = PEDIDOS_DIR)`—. Cada caso de sensibilidad fabrica ahora en su propio
`mkdtempSync(join(tmpdir(), 'qc154-scope-'))`, replica solo la estructura relativa necesaria
(`domain/...`, `lib/modules/clientes/...` o el directorio de `app` completo segun el parametro que
sustituye) y borra con `rmSync(..., { recursive: true, force: true })` en el `finally`. Se anadio
un caso barato que sella la regresion: el propio archivo no puede tener un `writeFileSync` o
`mkdirSync` que apunte a `repoRoot`/`moduloDir` sin pasar por un `mkdtempSync`.

Los nombres de los casos existentes no cambiaron. Cada uno de los cinco se verifico con una
mutacion manual (romper el detector o ignorar el parametro de raiz/dir) que lo puso rojo, y se
revirtio; el diff final quedo identico al que habia antes de mutar (comprobado con `diff` byte a
byte). El caso sello tambien se verifico igual.

### m6 — la sensibilidad de R37 no probaba nada de verdad

`'el censo de campos dispara con un campo fabricado de mas'` rehacia el mapeo de campos en linea
sin llamar a `camposDe`: no ejercia el predicado real. `cuerpoDeModelo`/`camposDe` ganaron un
parametro `schemaTexto` (el schema real de `db/schema.prisma` por defecto), y el caso pasa ahora
un `model Customer { ... }` fabricado **en memoria** (nunca escrito a disco) a la misma funcion
que usa el caso real, comprobando que el censo resultante incluye el campo de mas y difiere del
censo del schema real. Verificado con una mutacion (el filtro de `camposDe` ignorando el campo
fabricado) que puso el caso rojo, y revertida.

### m7 — R40 solo miraba el especificador de import

`hallazgosDeAcoplamiento` solo detectaba `@/lib/modules/<x>`; un `prisma.customer`/`customers`
crudo dentro de `pedidos`, o un `prisma.order`/`orders` dentro de `clientes`, no disparaba nada.
Se anadio `nombraModeloOTabla(fuente, modelo, tabla)` (mira `prisma.<modelo>\b` o `\b<tabla>\b`) y
se aplica en ambas direcciones dentro de `hallazgosDeAcoplamiento`. Se confirmo con `grep` contra
el arbol real (`lib/modules/pedidos` sin `customer`/`customers`/`prisma.customer`;
`lib/modules/clientes` sin `order`/`orders`/`prisma.order`) que no hay falsos positivos. Se anadio
un caso nuevo que fabrica en dos `mkdtempSync` independientes (uno emulando `clientes` con
`prisma.order.findMany()`, otro emulando `pedidos` con la tabla `'customers'`) y comprueba que
ambos aparecen en los hallazgos. Verificado con una mutacion (anular `nombraModeloOTabla`) que
puso el caso rojo, y revertida.

### Verificacion (repetida tres veces sobre el HEAD final, `63925abd`)

```
pnpm run typecheck   → tsc --noEmit, sin salida, sin errores (las 3 veces)
pnpm run lint        → 0 errores, 7 warnings preexistentes ajenos
                        (tests/unit/documentos/confirm-catalog-import.test.ts,
                        tests/unit/pedidos/order-service.test.ts; archivos no tocados)

pnpm exec vitest run tests/unit/clientes tests/guards
  RUN 1 → Test Files 54 passed (54) · Tests 662 passed | 5 skipped (667)
  RUN 2 → Test Files 54 passed (54) · Tests 662 passed | 5 skipped (667)
  RUN 3 → Test Files 54 passed (54) · Tests 662 passed | 5 skipped (667)
```

`git status` tras las tres corridas: `nothing to commit, working tree clean` — ningun fabricado
quedo en el arbol.

Tres commits, uno por hallazgo: `54eb838e` (B2), `97c5393c` (m6), `63925abd` (m7). Los tres
empujados a `origin/feature/QC-154-crud-de-clientes`.

Archivo tocado: solo `tests/unit/clientes/scope.test.ts`.

## Correcciones tras review, tanda 2 (B1, m2, m3, m10, m1)

Retoma una sesion cortada a mitad de B1: 18 archivos sin commitear (migracion
`20260924190000_customers_search_normalized` up/down, `lib/composition/index.ts`,
`lib/modules/clientes/**`) que solo tocaban comentarios.

### B1 — limpieza de citas de trazabilidad en comentarios de produccion

El diff sin commitear ya solo tocaba comentarios (confirmado linea por linea). Se completo el
barrido con `git diff origin/dev -- lib db app` (dev + working tree juntos) buscando
`R[0-9]+|QC-[0-9]+|design\.md|\bP[0-9]\b|\bT[0-9]+\b|decisi[oó]n cerrada` en las lineas anadidas,
excluyendo `lib/modules/clientes/domain/list-query.ts` (m1, copia literal vigilada por
`guard-contrato-listados`, sin tocar). Grep final sobre esas lineas:

```
$ awk '/^diff --git/{f=$0} /^\+/ && !/^\+\+\+/{print f"::"$0}' <(git diff origin/dev -- lib db app) \
  | grep -iE 'R[0-9]+|QC-[0-9]+|design\.md|\bP[0-9]\b|\bT[0-9]+\b|decisi[oó]n cerrada' \
  | grep -v 'domain/list-query\.ts'
diff --git a/lib/modules/clientes/adapters/driven/persistence/list-query-sql.ts b/...::+const MIDNIGHT_UTC = 'T00:00:00.000Z';
```

El unico resultado es un falso positivo (`\bT[0-9]+\b` casando con el literal de hora
`T00:00:00.000Z`, no una cita de tarea). `db/schema.prisma` (el `///` del modelo `Customer`
que toco QC-154) tambien se reviso aparte: limpio, sin citas.

`migration.sql`/`down.sql` cambiaron (solo comentarios). Contra la base propia
`QuimiCloude_QC154` (`DATABASE_URL`/`DIRECT_URL` sobrescritos en el entorno del comando, nunca la
compartida):

```
$ DATABASE_URL=...QuimiCloude_QC154 DIRECT_URL=...QuimiCloude_QC154 pnpm exec prisma migrate status
Datasource "db": PostgreSQL database "QuimiCloude_QC154", schema "public" at "localhost:5432"
52 migrations found in prisma/migrations
Database schema is up to date!
```

Sin drift de checksum: no hizo falta `db:rollback`/`db:migrate`.

Commit `0d75f635`, 18 archivos.

### m2 — `textCondition`/`TextCondition` muertos en `list-query-sql.ts`

Ninguno de los dos se importaba en ningun lado de `clientes` (verificado con grep en
`lib/modules/clientes` y en `tests/`). Se borraron junto con la cabecera, que decia «se copian
las DOS funciones que este modulo usa» cuando solo usa `dateRangeCondition`; ahora dice «se copia
SOLO la funcion» y nombra `textCondition` entre las que quedan fuera. Commit `7afb16ce`.

### m3 — el guard de cabecera de migracion no vigilaba `QC-<n>` ni `design.md`

`tests/unit/clientes/schema/customers-search-migration.test.ts`, caso «la cabecera no cita»:
solo probaba `R\d+` y «decision cerrada». Se le sumaron `\bQC-\d+\b` y `design\.md`, con su propia
sensibilidad (una cita fabricada de cada patron tiene que tumbar el predicado). Verificacion
manual: se inserto `-- QC-999 cita fabricada de prueba` como primera linea de `migration.sql`, la
corrida marco el caso en rojo (`expect(fuente).not.toMatch(/\bQC-\d+\b/)` fallando), y se
revirtio con `cp` desde una copia de respaldo (`git diff` vacio despues de revertir). Vuelto a
correr: verde, 8/8. Commit `f0286205`.

### m10 — comentario de primera linea con la ruta del archivo

Los seis archivos senalados (`customer-input.ts`, `customer-queryable.ts`, `customer-text.ts`,
`customer-view.ts`, `list-query-sql.ts`, `list-query-log.ts`) ya no tenian ese comentario: B1 lo
resolvio en los cuatro de `domain/` y en `list-query-log.ts` (que no es copia literal vigilada por
`guard-contrato-listados`, solo `domain/list-query.ts` lo es), y m2 lo resolvio en
`list-query-sql.ts` al reescribir su cabecera. Verificado con `head -1` sobre los seis: ninguno
empieza con `// lib/modules/...`. Sin commit propio (nada que cambiar).

### m1 — deuda declarada, no tocada

`lib/modules/clientes/domain/list-query.ts` sigue siendo una de las siete copias literales del
contrato de listado, vigiladas por `tests/guards/guard-contrato-listados.test.ts` (bloque 2:
"coinciden caracter a caracter salvo el nombre del modulo"). Limpiar sus comentarios en solitario
rompe esa igualdad textual contra las otras seis. Queda como deuda para una ficha aparte que
limpie las **siete** copias (`inventario`, `recetas`, `proveedores`, `unidades`, `pedidos`,
`identity`, `clientes`) a la vez, no como parte de QC-154.

### Verificacion final

```
pnpm run typecheck
  → tsc --noEmit, sin salida, sin errores

pnpm run lint
  → eslint: 0 errores, 7 warnings preexistentes ajenos
    (tests/unit/documentos/confirm-catalog-import.test.ts,
    tests/unit/pedidos/order-service.test.ts; archivos no tocados)

DATABASE_URL/DIRECT_URL -> QuimiCloude_QC154
pnpm exec vitest run tests/unit/clientes tests/guards tests/integration/clientes
  → Test Files 59 passed (59) · Tests 706 passed | 5 skipped (711)
```

`git status` tras la corrida: `nothing to commit, working tree clean`.

Tres commits de codigo/tests, uno por hallazgo: `0d75f635` (B1), `7afb16ce` (m2), `f0286205`
(m3). m10 no genero commit (ya resuelto por B1/m2) y m1 queda anotado como deuda, sin tocar.
Todos empujados a `origin/feature/QC-154-crud-de-clientes`.

## Correcciones tras review, tanda 3 y merge con dev

### B3 — claves exactas de `findAliveCustomerById` y `listAliveCustomers` (`28bbddb5`)

`customer-repository.int.test.ts` afirmaba el contenido de la ficha y del listado, pero no que
`Object.keys(...)` fuera exactamente las 11 claves de `CustomerView`: un `select` con `companyId`,
`deletedAt` o alguna forma `*Normalized` de mas habria pasado en silencio. Dos casos nuevos,
`R22 — findAliveCustomerById devuelve exactamente las 11 claves, sin companyId ni deletedAt` y
`R47 — cada item de listAliveCustomers devuelve exactamente las 11 claves, sin ninguna forma
normalizada`, comparan `Object.keys(fila).sort()` contra el array literal de las 11 claves. Las
filas R22 y R47 de `tasks.md` se actualizaron para citarlos.

### m5 — `R10` no probaba que la fila ajena quedara intacta en sus tres columnas de auditoria (`e672005a`)

El caso ya afirmaba `customer_not_found`; le faltaba comprobar que `updated_at`, `updated_by` y
`deleted_at` de la fila de la otra empresa no cambiaran tras el intento de editarla o darla de
baja. Se le sumaron esas tres aserciones sobre la fila leida de nuevo despues del intento.

### m4 — cita `guard-ambito-empresa-clientes` en el caso de R25 que mira el doble de metodos (`d2ea93e3`)

`customer-service.test.ts` ya afirmaba que el puerto solo tiene los cinco metodos esperados con un
doble de prueba, pero un doble de TypeScript no puede reflejar que el TIPO del puerto este cerrado
en tiempo de ejecucion; eso lo sostiene `metodosEsperados: 5` en la propia guardia. Se agrego un
comentario que lo dice y se actualizo el nombre del caso para citar la guardia; la fila R25 de
`tasks.md` ya la citaba.

### m11 — `R4` no cubria un actor con la clave `permissions` ausente (`7cf24a16`)

`authorization.test.ts` probaba `null`, `undefined` y `[]`, pero no un objeto actor sin la clave
`permissions` en absoluto (frente a `assertPermission`, que hace `actor.permissions ?? []`). Se
sumo un cuarto caso al mismo test que fabrica un actor sin esa clave y comprueba que se rechaza
igual.

### m8 — nombres de la tabla de trazabilidad desfasados de los tests reales (`297bf238`)

Verificado con `grep` contra cada archivo citado: R12 citaba una frase que no existia (la real es
`${archivo}: toda funcion que toca la base declara y consume el ambito`, parametrizada por archivo
de persistencia); R36-R38 y R43-R46 citaban paráfrasis en vez del texto exacto de sus `it`/
`describe`; R34 seguia en 55 tras el merge con dev, cuando ahora son 57; y los dos casos `R26
(QC-153)` de `scope.test.ts` que `design.md > 11` pedia etiquetar tambien con `(QC-154)` (bajo
R35, la guardia de arquitectura hexagonal) no llevaban esa segunda etiqueta. Se corrigieron las
filas R12, R35, R36, R37, R38, R43, R44, R45 y R46 de `tasks.md` para citar el texto exacto, y se
les agrego `R35 (QC-154)` a los dos `it` de `scope.test.ts` sobre el literal de permisos y sobre
`adapters/driving/`.

### El merge con `origin/dev` (`eb0c2a52`)

`origin/dev` traia 150 commits por delante, entre ellos QC-150 (producto terminado) con dos
migraciones del **mismo timestamp** que la nuestra
(`20260924190000_finished_product_enum_values` y `20260924190100_finished_products_and_content_copies`,
contra nuestra `20260924190000_customers_search_normalized`). Antes del merge, `db:rollback` quito
nuestra migracion de `QuimiCloude_QC154` y `prisma migrate status` confirmo que solo quedaba
pendiente esa, sin nada de dev todavia (la base era nueva para la rama).

`git merge origin/dev` dejo cuatro conflictos, todos en listas cerradas que las dos ramas ampliaron
en el mismo punto:

- `lib/modules/errores/domain/error-catalog.ts` y `error-codes.ts`: `customer_not_found` (nuestro)
  contra `presentation_without_content` y `no_whole_package` (QC-150). Se conservaron los tres
  codigos, sus claves y sus textos; la cabecera de `error-codes.ts` paso a tener una
  "Decimotercera enmienda" para los dos codigos de QC-150 (la nuestra ya era la duodecima; el
  leader corrigio despues el orden: QC-150 entro antes en dev, asi que su enmienda es la
  duodecima y la nuestra la decimotercera).
- `tests/unit/errores/catalogo.test.ts`: el censo literal de `ERROR_CODES.length` decia 55 en
  nuestro lado (54 + `customer_not_found`) y 56 en el de dev (54 + los dos de QC-150). El total
  correcto es 57 (54 + 1 + 2); se fusionaron los dos `describe` de verificacion de codigo (uno por
  ficha) y se corrigio el conteo y su comentario.
- `tests/guards/guard-identificador-de-request.test.ts`: la lista cerrada de migraciones que no
  tocan el identificador de peticion tenia una entrada nuestra y dos de dev con el mismo prefijo de
  timestamp. Se conservaron las tres, con las de dev primero (cronologicamente ya en dev) y la
  nuestra al final, ya con el nombre `20260924200000_customers_search_normalized` que le tocaria
  tras renumerar.

`db/schema.prisma`, `lib/composition/index.ts`, `tests/integration/aislamiento.json`,
`feature_list.json` y `progress/current.md` no llegaron a conflicto: git los fusiono solos, y se
verifico con `git grep` que ninguno quedo con marcadores `<<<<<<<`/`=======`/`>>>>>>>` y que el
modelo `Customer` y los modulos de QC-150 seguian ambos en `schema.prisma`.

### Renumeracion de la migracion (`c9bfa6df`)

Con dos migraciones de dev en `20260924190000` y `20260924190100`, la nuestra se movio con
`git mv` a `20260924200000_customers_search_normalized` para quedar ultima del directorio.
Referencias actualizadas (verificadas con `git grep '20260924190000_customers'`, que solo deja
resultados en `progress/impl_...md` e historicos de `progress/review_...md`, sin tocar):
`db/migrations/20260924200000_customers_search_normalized/down.sql` (su propio comentario de
cabecera), `tests/guards/guard-identificador-de-request.test.ts` (ya con el nombre nuevo desde el
commit del merge), `tests/integration/clientes/customer-repository.int.test.ts`,
`tests/integration/clientes/customers-search-migration.int.test.ts`,
`tests/unit/clientes/schema/customers-search-migration.test.ts` y
`tests/unit/clientes/scope.test.ts`.

`pnpm exec prisma generate` regenero el cliente sin avisos. No existe script `next typegen` en
`package.json` (solo `db:migrate:create`, `db:migrate`, `db:rollback`, `db:seed`, `db:test`), asi
que no aplica. Contra `QuimiCloude_QC154` (`DATABASE_URL`/`DIRECT_URL` sobrescritos en el entorno
del comando, nunca la compartida):

```
$ pnpm run db:migrate
54 migrations found in prisma/migrations
Applying migration `20260924190000_finished_product_enum_values`
Applying migration `20260924190100_finished_products_and_content_copies`
Applying migration `20260924200000_customers_search_normalized`
All migrations have been successfully applied.
```

Ciclo `db:rollback` -> `db:migrate` repetido para confirmar que el nombre nuevo funciona en las dos
direcciones: el rollback deshizo solo `20260924200000_customers_search_normalized` (su fila salio
de `_prisma_migrations`, `db:migrate` la volvio a aplicar sola) y `prisma migrate status` termino en
`Database schema is up to date!`.

### Verificacion final (tanda 3 + merge)

```
pnpm run typecheck
  → tsc --noEmit, sin salida, sin errores

pnpm run lint
  → eslint: 0 errores, 7 warnings preexistentes ajenos
    (tests/unit/documentos/confirm-catalog-import.test.ts,
    tests/unit/pedidos/order-service.test.ts; archivos no tocados por esta ficha)

pnpm exec vitest run tests/unit/clientes tests/guards
  → 3 corridas seguidas, cada una: Test Files 54 passed (54) ·
    Tests 664 passed | 5 skipped (669). Sin ENOENT en ninguna.

pnpm exec vitest run tests/unit/errores
  → Test Files 2 passed (2) · Tests 48 passed (48)

DATABASE_URL/DIRECT_URL -> QuimiCloude_QC154
pnpm exec vitest run tests/integration/clientes
  → Test Files 5 passed (5) · Tests 46 passed (46)
    (corrida contra una base efimera clonada de la plantilla `qct_tpl_a120af3d84d6`,
    construida sobre QuimiCloude_QC154 y borrada al terminar, como hace
    tests/helpers/test-database.ts en toda corrida de integracion)
```

`tests/baseline-rojos.json` trae una entrada ajena a `clientes`
(`tests/integration/documentos/catalog-import-isolation.int.test.ts`, rojo de dev desde el
2026-09-24 por QC-158/QC-142, a resolver en QC-169): no se corrio ni se toco, es deuda de otra
ficha. No se ejecuto `pnpm test` ni `./init.sh` completo (fuera del alcance de esta tanda) y T16
no se marco.

Cinco commits en esta tanda: `28bbddb5` (B3), `e672005a` (m5), `d2ea93e3` (m4), `7cf24a16` (m11),
`297bf238` (m8), mas `eb0c2a52` (merge de `origin/dev`) y `c9bfa6df` (renumeracion). Todos
empujados a `origin/feature/QC-154-crud-de-clientes`.

## Renumeracion tras QC-150 (leader): decision "quien entro antes en dev"

QC-150 se fusiono en `dev` antes que QC-154, asi que su enmienda (`presentation_without_content`,
`no_whole_package`) es la duodecima y la nuestra (`customer_not_found`) pasa a ser la
decimotercera, detras. Se restauro en `lib/modules/errores/domain/error-codes.ts` la linea de
`presentation_without_content`/`no_whole_package` exactamente como esta en `origin/dev`
(cabecera y orden dentro de `ERROR_CODES`), y se puso `customer_not_found` como "Decimotercera
enmienda" a continuacion. Se ajustaron los dos bloques de `tests/unit/errores/catalogo.test.ts`
que citaban el numero de enmienda por nombre, y las tres referencias en
`specs/QC-154-crud-de-clientes/{design,requirements,tasks}.md`. Luego `git fetch origin dev` +
`git merge origin/dev` (trae `d661e64b`, solo `feature_list.json` y `progress/current.md`, sin
conflicto).

- `pnpm run typecheck` → exit code 0.
- `pnpm exec vitest run tests/unit/errores tests/guards/guard-catalogo-de-errores.test.ts` →
  3 test files, 82 tests, todos verdes.
