# QC-49 — aislamiento-por-empresa-en-inventario · tasks.md

> Checklist del implementer. Cada task dice **qué archivos toca**, de **qué depende** y cuál es su
> criterio de **hecho**. `[P]` = paralelizable con las otras `[P]` de su bloque.
> El mapa `R<n> -> test` completo está en `§ Trazabilidad`, al final, y se copia a
> `progress/impl_QC-49-aislamiento-por-empresa-en-inventario.md`.

## Bloque 0 — Base de datos

- [x] **T0 — Migración: columnas, FK, índices y unicidad por empresa.**
  Archivos: `db/migrations/<ts>_inventory_company_scope/migration.sql` (nuevo),
  `db/schema.prisma` (`model Product`, `model Presentation`, `model ProductBatch`).
  Contenido: `company_id` anulable en las tres → backfill (T1 va dentro del mismo archivo) →
  `SET NOT NULL` → tres FK a `companies` → `products_company_id_idx`,
  `product_batches_company_id_idx` → `DROP INDEX presentations_name_normalized_key` +
  `CREATE UNIQUE INDEX presentations_company_name_unique` → `ENABLE` + `FORCE` RLS en las tres.
  En el esquema: escalar sin `@relation`, `@@index([companyId])` en `Product` y `ProductBatch`,
  `@@unique([companyId, nameNormalized], map: "presentations_company_name_unique")` en
  `Presentation` sustituyendo al `@@unique([nameNormalized])`, y comentario `///` que avisa del drift
  de las FK escritas a mano.
  Depende de: —.
  Hecho cuando: `pnpm run db:migrate` aplica sin error contra `QuimiCloude_QC49`, `prisma generate`
  produce los tres campos y `pnpm run typecheck` señala exactamente los sitios que T4–T8 van a tocar.
  Cubre: R1, R2, R5, R8, R9, R10, R20, R21.

- [x] **T1 — Backfill de las filas vivas y borradas a «QuimiCloud».**
  Archivos: el mismo `migration.sql` de T0 (bloque 2).
  Contenido: paréntesis `NO FORCE` / `FORCE` alrededor del `UPDATE`; resolución de la empresa por
  `name_normalized = 'quimicloud'` con el único fallback de «hay exactamente una empresa»;
  `RAISE EXCEPTION` en cualquier otro caso; comprobación de `ROW_COUNT` contra el total de cada
  tabla; ningún `INSERT` y ningún `DELETE`.
  Depende de: T0 (mismo archivo, orden dentro de él).
  Hecho cuando: tras aplicar, las 23 filas de `products`, las 114 de `presentations` y la de
  `product_batches` tienen la empresa de «QuimiCloud», y `companies` sigue con 37 filas.
  Cubre: R3, R4.

- [x] **T2 — Disparadores de coherencia.**
  Archivos: el mismo `migration.sql` (bloque 5).
  Contenido: `product_batches_check_company` (empresa del lote = la de su producto y la de su
  presentación) y `presentations_check_unit_scope` (unidad de la empresa o de sistema), los dos
  `BEFORE INSERT OR UPDATE`, `ERRCODE '23514'` y mensaje propio por caso.
  Depende de: T1 (van después del backfill).
  Hecho cuando: los `INSERT` cruzados fallan con el mensaje esperado desde `psql`.
  Cubre: R22, R23. **Si el humano difiere la pregunta abierta 1, esta task pierde el segundo
  disparador y R23; nada más cambia.**

- [x] **T3 — `down.sql` con guardia de datos.**
  Archivos: `db/migrations/<ts>_inventory_company_scope/down.sql` (nuevo).
  Contenido: guardia primero (filas con empresa distinta de la del UP; presentaciones con nombre
  normalizado repetido) → disparadores y funciones → índices y FK → índice único global restaurado →
  columnas → `ENABLE` + `FORCE`.
  Depende de: T0, T1, T2.
  Hecho cuando: `pnpm run db:rollback` deja el esquema idéntico al anterior (verificado con una
  consulta a `information_schema` en el test de integración), no borra ninguna fila y
  `_prisma_migrations` queda coherente; y con una fila de otra empresa presente, aborta entera.
  Cubre: R6, R7.

## Bloque 1 — Dominio y puertos

- [x] **T4 — `InventoryScope` y el actor con empresa.**
  Archivos: `lib/modules/inventario/domain/inventory-scope.ts` (nuevo),
  `lib/modules/inventario/domain/actor.ts`, `lib/modules/inventario/index.ts` (reexportar el tipo).
  Depende de: —. `[P]` con T0.
  Hecho cuando: el barrel exporta `InventoryScope`, `actor.ts` declara `companyId` y el barrel sigue
  siendo importable desde un componente de cliente (la guardia de módulos y
  `module-contract.test.ts` en verde).
  Cubre: R11 (parte), R13 (parte).

- [x] **T5 — Los dos puertos exigen el ámbito.**
  Archivos: `lib/modules/inventario/ports/product-repository.ts`,
  `lib/modules/inventario/ports/presentation-repository.ts`.
  Contenido: `scope: InventoryScope` al final de las **doce** firmas, con el docblock que explica por
  qué está en la firma y no dentro del adaptador.
  Depende de: T4.
  Hecho cuando: `pnpm run typecheck` falla en el adaptador y en los casos de uso —eso es la prueba de
  que el olvido no compila— y queda verde al terminar T6 y T7.
  Cubre: R13.

- [x] **T6 — Los nueve casos de uso pasan el ámbito.**
  Archivos: `lib/modules/inventario/domain/{create,update,delete,get,list}-product.ts`,
  `.../{create,update,delete,list}-presentation.ts`.
  Contenido: tras `requirePermission` (que sigue siendo la primera línea), construir
  `{ companyId: actor.companyId }` y pasarlo al puerto. Ninguna condición SQL aquí.
  Depende de: T5.
  Hecho cuando: los nueve compilan, el orden permiso → zod → puerto no cambia, y ningún caso de uso
  menciona `company` en un `where`.
  Cubre: R11, R15, R16, R17, R18, R24.

## Bloque 2 — Persistencia

- [x] **T7 — El único punto de consulta.**
  Archivos: `lib/modules/inventario/adapters/driven/persistence/company-scope.ts` (nuevo).
  Contenido: `companyScope` privada + las tres envolturas tipadas; docblock con la regla de uso y con
  la excepción explícita de `findProductRefs` y su destino (QC-50).
  Depende de: T4.
  Hecho cuando: existe y su test afirma que las tres envolturas devuelven el mismo objeto.
  Cubre: R13.

- [x] **T8 — Adaptadores driven acotados.**
  Archivos: `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`,
  `.../presentation-prisma.ts`.
  Contenido: el ámbito compuesto con `AND` en `buildProductWhere` y `buildPresentationWhere`; en el
  `where` de `findAliveById`, `updateAlive`, `softDeleteAlive`, `findAliveIdByName`, `deleteById`,
  `replace` y el `findFirst` de `addBatchToAlive`; `companyId` escrito en `create`,
  `createWithFirstBatch`, el lote y `createPresentation`; traducción del `23514` de los dos
  disparadores. **`product-catalog-prisma.ts` no se toca** (R29), y se le añade el docblock que dice
  por qué y adónde va.
  Depende de: T5, T7.
  Hecho cuando: ninguna consulta ni escritura del archivo se ejecuta sin el ámbito, y el `count` del
  listado usa el **mismo** `where` que el `findMany`.
  Cubre: R13, R14, R15, R16, R17, R18, R19.

- [x] **T9 — Server Actions con las dos caras de la sesión.**
  Archivos: `lib/modules/inventario/adapters/driving/product-actions.ts`,
  `.../presentation-actions.ts`.
  Contenido: `currentActor` pide `getSessionUser()` **y** `getSessionContext()` en paralelo y
  devuelve `null` si falta cualquiera. Las firmas públicas no cambian.
  Depende de: T4.  `[P]` con T8.
  Hecho cuando: sin contexto de sesión ninguna action toca el repositorio, y los tests de las
  actions existentes siguen verdes sin cambiar de firma.
  Cubre: R12, R31.

## Bloque 3 — Pruebas

- [x] **T10 — Test de esquema y de texto de la migración.** `[P]`
  Archivos: `tests/unit/inventario/schema/inventory-company-scope-migration.test.ts` (nuevo).
  Contenido: el UP declara las tres columnas, las tres FK, los índices, el intercambio del único, los
  dos disparadores y el `ENABLE`+`FORCE`; **no contiene ningún `DELETE` ni `INSERT`**; el `down.sql`
  revierte cada objeto y abre con su guardia; identificadores en inglés.
  Depende de: T3.
  Cubre: R4 (parte), R5, R6 (parte), R8, R9, R10.

- [x] **T11 — Integración: constraints, disparadores y backfill.** `[P]`
  Archivos: `tests/integration/inventario/company-scope.int.test.ts` (nuevo).
  Contenido: `INSERT` sin empresa y con empresa inexistente → rechazo; lote sin empresa aunque su
  producto la tenga; lote con empresa distinta de la de su producto / de su presentación; presentación
  con unidad de otra empresa; dos presentaciones con el mismo nombre en empresas distintas → se
  aceptan; dos en la misma → `23505`; dos productos con el mismo nombre en la misma empresa → se
  aceptan; reversión con datos ajenos → aborta.
  Depende de: T3.
  Cubre: R1, R2, R7, R20, R21, R22, R23.

- [x] **T12 — Service: el rechazo cruzado, con dobles.** `[P]`
  Archivos: `tests/unit/inventario/company-isolation-service.test.ts` (nuevo).
  Contenido: los nueve casos de uso reciben el ámbito del actor y no de la entrada; ficha/edición/
  borrado/lote de un producto ajeno → `ProductNotFoundError` (**nunca** `UnauthorizedError`);
  edición/borrado de presentación ajena → `PresentationNotFoundError`; el permiso se exige **antes**
  del ámbito (actor sin permiso y de otra empresa → error de autorización, sin tocar el puerto); una
  `companyId` en la entrada → `invalid_input`; el alta con homónimo de otra empresa crea uno nuevo.
  Depende de: T6.
  Cubre: R11, R15, R16, R17, R18, R24.

- [x] **T13 — Integración: los listados y las escrituras ven solo su empresa.** `[P]`
  Archivos: `tests/integration/inventario/company-scope-queries.int.test.ts` (nuevo).
  Contenido: con filas de dos empresas sembradas, el listado de productos y el de presentaciones
  devuelven solo las suyas **y el `total` también**; la búsqueda y los filtros no ensanchan lo
  visible; `updateAlive`/`softDeleteAlive`/`deleteById` con un id ajeno devuelven «no existe» y
  **dejan la fila ajena intacta**; el alta escribe la empresa del ámbito; quitar `FORCE ROW LEVEL
  SECURITY` no cambia ningún resultado (R26).
  Depende de: T8.
  Cubre: R13, R14, R16, R17, R19, R25, R26.

- [x] **T14 — Unit: el punto único y las Server Actions.** `[P]`
  Archivos: `tests/unit/inventario/company-scope.test.ts` (nuevo),
  `tests/unit/inventario/product-actions.test.ts` y `.../presentation-actions.test.ts` (se amplían).
  Contenido: las tres envolturas producen la misma condición; falta el contexto de sesión → la action
  no llama al caso de uso; la empresa sale de `getSessionContext()` y nunca del `FormData`; ninguna
  salida pública lleva `companyId`.
  Depende de: T7, T9.
  Cubre: R12, R13, R19, R31.

- [x] **T15 — E2E de aislamiento.** **(E2E — Playwright)**
  Archivos: `e2e/aislamiento-inventario.spec.ts` (nuevo).
  Contenido: el recorrido de `design.md > 8` — fixture de dos empresas, login real en A, listas sin
  filas de B, borrado con el identificador de B manipulando el campo oculto, fila de B intacta, y
  alta en A de una presentación con el nombre de la de B.
  Depende de: T8, T9.
  Hecho cuando: pasa en Chromium **y** en WebKit y el fixture deja la base como la encontró.
  Cubre: R27, y ejercita R14, R15, R16, R20 de extremo a extremo.

## Bloque 4 — Cierre

- [x] **T16 — Documentación de la deuda saldada.**
  Archivos: `docs/architecture.md > Dominio` (quitar `inventario (QC-49)` de la lista de deuda
  registrada, dejando el resto intacto), `progress/impl_QC-49-…​.md` con el mapa `R<n> -> test`.
  Depende de: T15.
  Hecho cuando: la viñeta ya no nombra inventario y el mapa de trazabilidad está escrito.
  Cubre: el checkpoint de trazabilidad de `CHECKPOINTS.md`.

- [ ] **T17 — Gate completo.**
  `./init.sh` en verde (no `--rapido`: es lo que exige cerrar la feature y todo PR).
  Depende de: T16.
  Hecho cuando: typecheck, lint, unit, integración, guardias y E2E pasan; en particular
  `guard-rls-force`, `guard-arquitectura-modulos`, `guard-dependencias-aprobadas` y la guardia del
  catálogo de errores.
  Cubre: R28, R29, R30, R32 (por ausencia: ningún archivo de otro módulo cambia, `ERROR_CODES` no
  crece y `package.json` no se toca).

## Trazabilidad — `R<n> -> test`

| R | Test | Nivel |
| --- | --- | --- |
| R1 | `tests/integration/inventario/company-scope.int.test.ts` | integración |
| R2 | `tests/integration/inventario/company-scope.int.test.ts` | integración |
| R3 | `tests/integration/inventario/company-scope.int.test.ts` (backfill) | integración |
| R4 | `tests/unit/inventario/schema/inventory-company-scope-migration.test.ts` | unit |
| R5 | `tests/guards/guard-rls-force.test.ts` + test de esquema de T10 | guardia + unit |
| R6 | `tests/unit/inventario/schema/inventory-company-scope-migration.test.ts` | unit |
| R7 | `tests/integration/inventario/company-scope.int.test.ts` (reversión abortada) | integración |
| R8 | test de esquema de T10 | unit |
| R9 | test de esquema de T10 | unit |
| R10 | test de esquema de T10 | unit |
| R11 | `tests/unit/inventario/company-isolation-service.test.ts` | unit |
| R12 | `tests/unit/inventario/product-actions.test.ts`, `presentation-actions.test.ts` | unit |
| R13 | `tests/unit/inventario/company-scope.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R14 | `tests/integration/inventario/company-scope-queries.int.test.ts` | integración |
| R15 | `tests/unit/inventario/company-isolation-service.test.ts` | unit |
| R16 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R17 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R18 | `tests/unit/inventario/company-isolation-service.test.ts` | unit |
| R19 | `tests/unit/inventario/company-scope.test.ts` (forma de la salida pública) | unit |
| R20 | `tests/integration/inventario/company-scope.int.test.ts` | integración |
| R21 | `tests/integration/inventario/company-scope.int.test.ts` | integración |
| R22 | `tests/integration/inventario/company-scope.int.test.ts` (disparador) | integración |
| R23 | `tests/integration/inventario/company-scope.int.test.ts` (disparador) | integración |
| R24 | `tests/unit/inventario/authorization.test.ts` (se amplía) + `company-isolation-service.test.ts` | unit |
| R25 | `tests/integration/inventario/company-scope-queries.int.test.ts` (empresa de baja) | integración |
| R26 | `tests/integration/inventario/company-scope-queries.int.test.ts` (sin `FORCE`, mismo resultado) | integración |
| **R27** | **`e2e/aislamiento-inventario.spec.ts`** | **E2E** |
| R28 | `tests/unit/inventario/scope.test.ts` (se amplía: ninguna otra tabla gana empresa en esta migración) | unit |
| R29 | `tests/unit/inventario/product-catalog.test.ts` (se amplía: `findRefs` sin ámbito, con el motivo citado) | unit |
| R30 | test de esquema de T10 (la migración no crea guardia, no borra residuo, no añade correlativo) | unit |
| R31 | `tests/unit/inventario/list-use-cases.test.ts` y `product-actions.test.ts` (firmas y forma de salida intactas) | unit |
| R32 | `tests/guards/guard-dependencias-aprobadas.test.ts` | guardia |

**E2E**: solo **T15 / R27**. Todo lo demás es unit, integración o guardia.
