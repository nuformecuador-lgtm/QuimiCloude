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

## Veredicto

T0, T3, T17 y T18 cerradas y verificadas con evidencia real; el único rojo es el esperado por el
orden de dependencia T3→T1 (documentado en `design.md`, no corregible sin salirse del alcance
encargado).
