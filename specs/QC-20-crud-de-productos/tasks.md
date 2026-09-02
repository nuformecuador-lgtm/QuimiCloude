# QC-20 — crud-de-productos · tasks.md

> Zona: `backend` · Complejidad: `high` · Rama: `feature/QC-20-crud-de-productos`
>
> El **qué** está en `requirements.md` (R1–R37); el **cómo**, en `design.md`. Aquí está el
> desglose ejecutable. `[P]` marca lo que puede ir en paralelo con otra task del mismo grupo.
> Cada task tiene su criterio de «hecho»: si no se puede comprobar, no está hecha.
>
> **Antes de empezar:** el spec tiene que estar **aprobado** por el humano (F1.4). Las cinco
> preguntas que abrió el diseño **ya están cerradas** (D19–D23, `design.md > 10`): orden
> `name ASC, id ASC`, listado con solo los ids de los autores, tope de página **25**, nombre que
> normaliza a vacío rechazado, y `ADMIN_ROLE_NAME` propia de `inventario`. No queda ninguna
> abierta.
>
> Cierra cada tanda con `./init.sh --rapido`. **Antes del PR, `./init.sh` completo, sin
> excepción** (`docs/verification.md`).

---

## Grupo A — cimientos (sin dependencias entre sí)

- [ ] **T1 [P] — Util de paginación en `lib/shared/pagination.ts`.**
      `DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 25` (D21), `toOffsetLimit`, `buildPage`
      (`design.md > 8`). No importa módulos ni `composition`.
      **Hecho cuando:** `tests/unit/pagination.test.ts` pasa —defecto 10, `offset` de la página
      3, `pageSize` 500 acotado a 25 y devuelto como 25 en el `Page`, `totalPages` = 1 con lista
      vacía— y `tests/guards/guard-arquitectura-modulos.test.ts` sigue verde.

- [ ] **T2 [P] — Migración de auditoría y unicidad.**
      `db/schema.prisma`: `createdBy`/`updatedBy` escalares en `Product` (sin `@relation`),
      `nameNormalized` + `@@unique` en `Presentation`. `migration.sql` con las dos FK a `users`
      escritas a mano, el backfill y el índice único; `down.sql` que lo revierte en orden
      inverso (`design.md > 2`). Cabecera de aviso en el `migration.sql` sobre el drift de las
      FK escritas a mano.
      **Hecho cuando:** `pnpm run db:migrate:create` no reporta drift pendiente y
      `tests/unit/inventario/schema/inventario-audit-migration.test.ts` pasa.

- [ ] **T3 [P] — Dominio base del módulo.**
      `domain/actor.ts` (`Actor`, `ADMIN_ROLE_NAME`, `requireAdmin`), `domain/errors.ts`,
      `domain/page.ts` (`Page<T>`, `PageQuery`, `pageQuerySchema`),
      `domain/presentation-name.ts` (`normalizePresentationName`). `ADMIN_ROLE_NAME` es propia de
      `inventario` (D23). Nada de framework, Prisma, `lib/shared/` ni `composition`.
      **Hecho cuando:** `tests/unit/inventario/presentation-name.test.ts` pasa con la tabla de
      ejemplos de R19 y `pnpm run typecheck` está limpio.

## Grupo B — casos de uso (depende de A)

- [ ] **T4 — Esquemas de entrada zod.** `domain/product-input.ts` y
      `domain/presentation-input.ts` (`design.md > 6`). Trim, mínimo 1, máximos 120/60,
      `deliveryTime >= 0`, `cost` como cadena decimal, y el `refine` que rechaza el nombre de
      presentación que normaliza a vacío (D22, R37).
      *Depende de:* T3. **Hecho cuando:** `tests/unit/inventario/product-input.test.ts` pasa.

- [ ] **T5 — Puertos.** `ports/product-repository.ts` y `ports/presentation-repository.ts`, con
      los resultados discriminados de `design.md > 7`.
      *Depende de:* T3, T4. **Hecho cuando:** typecheck limpio y ningún import prohibido.

- [ ] **T6 [P] — Los cinco casos de uso de producto.** `create`, `get`, `list`, `update`,
      `delete`. `requireAdmin` en la **primera línea** de cada uno.
      *Depende de:* T5. **Hecho cuando:** `tests/unit/inventario/product-service.test.ts` pasa
      con dobles de los puertos.

- [ ] **T7 [P] — Los cuatro casos de uso de presentación.** `create`, `list`, `update`,
      `delete`.
      *Depende de:* T5. **Hecho cuando:** `tests/unit/inventario/presentation-service.test.ts`
      pasa.

- [ ] **T8 — Test de autorización de los nueve casos de uso.**
      `tests/unit/inventario/authorization.test.ts`, con dobles que **fallan si los llaman**
      (`design.md > 12`, cuarto aviso).
      *Depende de:* T6, T7. **Hecho cuando:** los nueve casos cubren Operador, rol nulo, rol
      desconocido y actor ausente, y cada uno afirma `not.toHaveBeenCalled()` sobre el puerto.

## Grupo C — adaptadores y cableado (depende de B)

- [ ] **T9 [P] — Adaptador driven de producto.** `adapters/driven/persistence/product-prisma.ts`:
      filtro `deleted_at IS NULL`, escritura de `created_by`/`updated_by`, conversión
      `string ↔ Prisma.Decimal`, orden `name ASC, id ASC` (D19, R35), salida con los autores como
      **ids** y sin resolver ningún nombre (D20), uso de `lib/shared/pagination`, traducción de
      SQLSTATE.
      *Depende de:* T1, T2, T5. **Hecho cuando:** typecheck limpio y es el único archivo del
      módulo que importa `@prisma/client`.

- [ ] **T10 [P] — Adaptador driven de presentación.** Igual, más la traducción `23505 →
      'duplicate'` y `23503 → 'in_use'`.
      *Depende de:* T1, T2, T5. **Hecho cuando:** ídem T9.

- [ ] **T11 — Contrato y punto de composición.** `lib/modules/inventario/index.ts` deja de ser
      `export {}` y reexporta **solo** de `./domain`; `lib/composition/index.ts` gana la fachada
      `inventario` sin tocar la de `identity`.
      *Depende de:* T6, T7, T9, T10. **Hecho cuando:** la guardia de módulos pasa y el contrato
      no arrastra `'use server'`, Prisma ni `next/*` en su cierre transitivo.

- [ ] **T12 — Server Actions.** `adapters/driving/product-actions.ts` y
      `presentation-actions.ts`: `'use server'`, actor desde `identity.getSessionUser()` vía
      `@/lib/composition` (`design.md > 5`), errores traducidos a estado serializable. Comentario
      explícito de que el proveedor de sesión es el stub hasta QC-8.
      *Depende de:* T11. **Hecho cuando:** `tests/unit/inventario/product-actions.test.ts` pasa
      y no existe ningún route handler nuevo.

## Grupo D — verificación contra la base y cierre

- [ ] **T13 — Ciclo real de migración.** `pnpm run db:migrate` → `pnpm run db:rollback` →
      `pnpm run db:migrate`.
      *Depende de:* T2. **Hecho cuando:** el rollback deja el esquema exactamente como estaba,
      `_prisma_migrations` coherente, y la salida queda pegada en `progress/impl_QC-20-*.md`.

- [ ] **T14 [P] — Tests de integración.**
      `tests/integration/inventario/product-crud.int.test.ts` y
      `presentation-uniqueness.int.test.ts`, con `beforeAll` que falla claro si faltan las
      columnas, cada caso en `$transaction` con `ROLLBACK` y afirmaciones sobre **SQLSTATE**.
      *Depende de:* T9, T10, T13. **Hecho cuando:** ambos pasan contra Postgres real.

- [ ] **T15 [P] — Test de alcance.** `tests/unit/inventario/scope.test.ts`: no hay ninguna ruta,
      página ni componente de productos bajo `app/`, ni route handler del catálogo bajo
      `app/api/`, ni spec nuevo en `e2e/` (R29, R34).
      *Depende de:* T12. **Hecho cuando:** pasa y falla si se añade cualquiera de esas tres cosas.

- [ ] **T16 — Cierre.** `./init.sh` completo en verde, `progress/impl_QC-20-crud-de-productos.md`
      con la salida real de los tests y el mapa `R<n> → test` de abajo, y todas las tasks marcadas
      `[x]`.
      *Depende de:* todas. **Hecho cuando:** `CHECKPOINTS.md` se cumple entero.

---

## Trazabilidad `R<n> → test`

Cada requisito con el archivo **y el nombre** del test que lo cierra. El reviewer rechaza si
falta uno (`CHECKPOINTS.md > Trazabilidad`).

| R | Archivo de test | Nombre del test |
| --- | --- | --- |
| R1 | `tests/unit/inventario/authorization.test.ts` | `cada caso de uso recibe el actor por parametro y no lee ninguna sesion` |
| R2 | `tests/unit/inventario/authorization.test.ts` | `un actor con rol Operador es rechazado en los nueve casos de uso sin llamar al repositorio` |
| R3 | `tests/unit/inventario/authorization.test.ts` | `un actor ausente, con rol nulo o con rol desconocido es rechazado igual que el Operador` |
| R4 | `tests/guards/guard-rls-force.test.ts` | `toda tabla creada en las migraciones tiene ENABLE y FORCE ROW LEVEL SECURITY` (ya existente; la migración de QC-20 no la desactiva) |
| R5 | `tests/unit/inventario/product-service.test.ts` | `crea el producto y devuelve su identificador cuando el actor es Administrador` |
| R6 | `tests/unit/inventario/product-service.test.ts` | `guarda al actor como autor de creacion y de modificacion al crear, y solo como autor de modificacion al editar y al borrar` |
| R7 | `tests/integration/inventario/product-crud.int.test.ts` | `rechaza con SQLSTATE 23503 el producto cuyo autor no es un usuario existente` |
| R8 | `tests/guards/guard-arquitectura-modulos.test.ts` | `ningun modulo consulta un modelo ajeno con Prisma` + `de otro modulo solo se importa su contrato` (ya existente), más `tests/integration/inventario/product-crud.int.test.ts` › `la lista devuelve los autores como identificadores, sin resolver ningun nombre` (D20) |
| R9 | `tests/unit/inventario/product-input.test.ts` | `rechaza el nombre vacio o de solo espacios y recorta los extremos del nombre valido` |
| R10 | `tests/unit/inventario/product-input.test.ts` | `rechaza un tiempo de entrega negativo` |
| R11 | `tests/unit/inventario/product-input.test.ts` | `rechaza el nombre de producto de mas de 120 caracteres y el de presentacion de mas de 60` |
| R12 | `tests/unit/inventario/product-service.test.ts` | `acepta dos productos con el mismo nombre` |
| R13 | `tests/unit/inventario/product-service.test.ts` | `guarda la existencia recibida al editar, sin recalcularla` |
| R14 | `tests/unit/inventario/product-service.test.ts` | `devuelve no encontrado al editar o borrar un producto inexistente o ya borrado` |
| R15 | `tests/integration/inventario/product-crud.int.test.ts` | `al borrar conserva la fila y marca deleted_at` |
| R16 | `tests/integration/inventario/product-crud.int.test.ts` | `la lista paginada y la ficha excluyen los productos borrados` |
| R17 | `tests/unit/inventario/presentation-service.test.ts` | `persiste el nombre normalizado junto al nombre al crear y al renombrar` |
| R18 | `tests/unit/inventario/presentation-service.test.ts` | `rechaza la presentacion cuyo nombre normalizado ya existe` |
| R19 | `tests/unit/inventario/presentation-name.test.ts` | `normaliza «Bidon 20 L», «bidon 20 l» y «BIDON-20L» al mismo valor` |
| R20 | `tests/integration/inventario/presentation-uniqueness.int.test.ts` | `el indice unico rechaza con SQLSTATE 23505 la segunda insercion del mismo nombre normalizado` |
| R21 | `tests/integration/inventario/presentation-uniqueness.int.test.ts` | `rechaza con SQLSTATE 23503 borrar una presentacion con productos asignados, incluidos los borrados logicamente` |
| R22 | `tests/integration/inventario/presentation-uniqueness.int.test.ts` | `borra fisicamente la presentacion sin productos asignados` |
| R23 | `tests/unit/pagination.test.ts` | `devuelve como maximo el tamano de pagina y el total de elementos` |
| R24 | `tests/unit/pagination.test.ts` | `usa 10 elementos por pagina cuando no se indica tamano` |
| R25 | `tests/unit/inventario/product-input.test.ts` | `rechaza un numero o un tamano de pagina que no sea entero mayor o igual a 1` |
| R26 | `tests/integration/inventario/product-crud.int.test.ts` | `recorre las paginas sin repetir ni omitir productos homonimos` |
| R27 | `tests/guards/guard-arquitectura-modulos.test.ts` | `lib/shared no importa modulos ni composition` (ya existente) + `tests/unit/pagination.test.ts` › `calcula desplazamiento y total de paginas` |
| R28 | `tests/unit/inventario/product-actions.test.ts` | `la Server Action rechaza la entrada invalida antes de llamar al caso de uso` |
| R29 | `tests/unit/inventario/scope.test.ts` | `las mutaciones del catalogo son Server Actions y no hay ningun route handler bajo app/api` |
| R30 | `tests/unit/inventario/schema/inventario-audit-migration.test.ts` | `nombra en ingles las columnas, la FK y el indice unico que anade la migracion` |
| R31 | `tests/guards/guard-arquitectura-modulos.test.ts` | `domain y ports no importan framework, base de datos, shared ni adaptadores` + `el contrato solo reexporta de ./domain` (ya existente) |
| R32 | `tests/unit/inventario/schema/inventario-audit-migration.test.ts` | `el down.sql revierte exactamente lo que anade el migration.sql y nada mas` (más el ciclo real de T13) |
| R33 | `tests/guards/guard-dependencias-aprobadas.test.ts` | `toda dependencia de package.json esta en docs/dependencias.md` (ya existente) |
| R34 | `tests/unit/inventario/scope.test.ts` | `no existe ninguna pantalla, pagina ni componente de productos, ni spec E2E nuevo` |
| R35 | `tests/integration/inventario/product-crud.int.test.ts` | `ordena por nombre ascendente y desempata por identificador ascendente` |
| R36 | `tests/unit/pagination.test.ts` | `acota a 25 el tamano de pagina mayor que el maximo y devuelve ese mismo tamano en la pagina` |
| R37 | `tests/unit/inventario/product-input.test.ts` | `rechaza como nombre invalido la presentacion cuyo nombre normalizado queda vacio` |

**Guardias que no hay que escribir:** R4, R8, R27 (parte), R31 y R33 los cierran guardias que ya
existen en `tests/guards/`. Se citan porque un requisito sin test es un fallo de la feature, no
porque haya que tocarlas.
