# QC-59 — aislamiento-por-empresa-en-proveedores · tasks.md

> Checklist del implementer. Cada task dice **qué archivos toca**, de **qué depende** y cuál es su
> criterio de **hecho**. `[P]` = paralelizable con las otras `[P]` de su bloque.
> El mapa `R<n> -> test` completo está en `§ Trazabilidad`, al final, y se copia a
> `progress/impl_QC-59-aislamiento-por-empresa-en-proveedores.md`
> (`CHECKPOINTS.md > Trazabilidad`).
>
> **Regla de comentarios de esta ficha** (`docs/conventions.md > Comentarios`, `design.md > 13`): en
> el código de producción **no** se cita `QC-<n>`, `R<n>` ni `design.md`. El porqué se explica con
> sus propias palabras; la trazabilidad vive aquí y en los **nombres de los tests**, donde `R<n>` sí
> va.

## Bloque 0 — Base de datos

- [x] **T0 — Migración: las dos columnas, el paréntesis de RLS y las dos FK a `companies`.**
  Archivos: `db/migrations/<ts>_suppliers_company_scope/migration.sql` (nuevo),
  `db/schema.prisma` (`model Supplier`, `model SupplierCatalogLine`).
  Contenido: paréntesis `NO FORCE` / `FORCE` de RLS sobre `suppliers`, `supplier_catalog_lines`,
  `presentations` y `companies` (pasos 0 y 8 de `design.md > 7.1`); `company_id` anulable en las dos
  tablas → backfills (T1) → `SET NOT NULL` → FK a `companies`
  (`ON DELETE RESTRICT ON UPDATE CASCADE`). En el esquema: escalares **sin `@relation`**, y **ningún
  `@@unique` de nombre** (`design.md > 2.4`); `///` ampliados.
  Depende de: —.
  Hecho cuando: `pnpm run db:migrate` aplica sin error, `prisma generate` produce los dos `companyId`
  y `pnpm run typecheck` señala exactamente los sitios que T6–T13 van a tocar.
  Cubre: R1, R2, R9, R12.

- [x] **T1 — Los dos backfills: proveedores a «QuimiCloud», líneas a la empresa de su proveedor.**
  Archivos: el mismo `migration.sql` de T0 (pasos 2, 3 y 4).
  Contenido: `suppliers` se resuelve por `name_normalized = 'quimicloud'` con el único fallback de
  «hay exactamente una empresa», `RAISE EXCEPTION` en cualquier otro caso; `supplier_catalog_lines`
  se rellena con **`UPDATE … FROM "suppliers"`**, nunca repitiendo la resolución por nombre —así no
  existe ni un instante con una línea cuya empresa discrepe de la de su proveedor—; `ROW_COUNT`
  contra el total de cada tabla; guardia con `RAISE EXCEPTION` si alguna línea apunta a una
  presentación de otra empresa, con el recuento y qué hacer; **ningún `INSERT`, ningún `DELETE`**;
  incluye las filas con `deleted_at`.
  Depende de: T0 (mismo archivo, orden dentro de él).
  Hecho cuando: tras aplicar, los **51 proveedores** y **la línea** tienen la empresa de «QuimiCloud»,
  `companies` y `presentations` conservan su recuento, y ninguna fila cambió más allá de la columna.
  Cubre: R7, R8.

- [x] **T2 — Las dos claves candidatas `(company_id, id)`.**
  Archivos: el mismo `migration.sql` (paso 6), `db/schema.prisma` (`model Supplier`,
  `model Presentation`).
  Contenido: `ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_id_key" UNIQUE
  ("company_id","id")` y la equivalente en `presentations`; en el esquema, `@@unique([companyId, id],
  map: …)` en los **dos** modelos —son totales y Prisma sí las modela—. **`presentations` no gana
  ninguna columna** ni ningún otro índice.
  Depende de: T0, T1.
  Hecho cuando: `pg_constraint` muestra las dos claves, `prisma validate` pasa, y un intento de crear
  la FK compuesta de T3 **sin** ellas falla con `no unique constraint matching given keys`
  (comprobado a mano una vez, para que la necesidad esté demostrada y no supuesta).
  Cubre: R3, R13.

- [x] **T3 — Las dos claves foráneas compuestas.**
  Archivos: el mismo `migration.sql` (paso 6, después de T2).
  Contenido: `supplier_catalog_lines_company_id_supplier_id_fkey` `(company_id, supplier_id)` →
  `suppliers(company_id, id)` `ON DELETE CASCADE ON UPDATE CASCADE`, y
  `supplier_catalog_lines_company_id_presentation_id_fkey` `(company_id, presentation_id)` →
  `presentations(company_id, id)` `ON DELETE RESTRICT ON UPDATE CASCADE`. **Las dos FK simples que
  ya existen se conservan**, no se sustituyen.
  Depende de: T2.
  Hecho cuando: desde `psql`, un `INSERT` de línea con empresa distinta de la de su proveedor y otro
  con presentación de otra empresa **fallan los dos**, cada uno nombrando su restricción; y la línea
  legítima sigue insertándose.
  Cubre: R4, R5.

- [x] **T4 — Relevo del índice único de nombre: global → por empresa, y **sigue parcial**.**
  Archivos: el mismo `migration.sql` (paso 7), `db/schema.prisma`
  (`@@index([companyId, supplierId], map: "supplier_catalog_lines_company_id_supplier_id_idx")`).
  Contenido: guardia `RAISE EXCEPTION` si dos proveedores **vivos** de la misma empresa comparten
  `name_normalized`; `DROP INDEX "suppliers_name_unique"`; `CREATE UNIQUE INDEX
  "suppliers_company_name_unique" ON "suppliers" ("company_id","name_normalized") WHERE
  "deleted_at" IS NULL`. **El `WHERE` no es opcional** (`design.md > 2.3`, alternativa D). El único
  de la línea **no se toca**.
  Depende de: T0, T1.
  Hecho cuando: `pg_indexes` muestra el compuesto **con** su `WHERE`, el global ya no existe, desde
  `psql` dos empresas pueden tener el mismo nombre y una empresa no puede tenerlo dos veces, y **dar
  de baja libera el nombre**.
  Cubre: R14, R15 (parte), R17 (por ausencia de cambio), R13.

- [x] **T5 — `down.sql` con sus tres guardias y su orden obligatorio.**
  Archivos: `db/migrations/<ts>_suppliers_company_scope/down.sql` (nuevo).
  Contenido, en este orden: paréntesis `NO FORCE` de RLS → **guardia 1** (empresa del UP ambigua) →
  **guardia 2** (fila de otra empresa en cualquiera de las dos tablas) → **guardia 3** (dos
  proveedores vivos de empresas distintas con el mismo nombre normalizado), las tres con recuento y
  con qué hacer → **FK compuestas fuera** → FK simples fuera → **claves candidatas fuera** (nunca
  antes que las FK que las referencian) → único por empresa fuera y **único global parcial
  restaurado** → índice compuesto de la línea fuera → columnas fuera → `ENABLE` + `FORCE`.
  **Ningún `DELETE`.**
  Depende de: T0–T4.
  Hecho cuando: `pnpm run db:rollback` deja el esquema idéntico al anterior (verificado contra
  `pg_indexes`, `pg_constraint` e `information_schema`), no borra ninguna fila, deja
  `_prisma_migrations` coherente; y con dos empresas compartiendo nombre **aborta entero**.
  Cubre: R10, R11.

## Bloque 1 — Dominio y puertos

- [x] **T6 — `SupplierScope` y el actor con empresa.** `[P]` con T0
  Archivos: `lib/modules/proveedores/domain/supplier-scope.ts` (nuevo),
  `lib/modules/proveedores/domain/actor.ts`, `lib/modules/proveedores/index.ts` (reexportar el tipo).
  Depende de: —.
  Hecho cuando: el barrel exporta `SupplierScope`, `actor.ts` declara `companyId`, y el barrel sigue
  siendo importable desde un componente de cliente (`guard-arquitectura-modulos` en verde).
  Cubre: R21 (parte), R23 (parte).

- [x] **T7 — Los dos puertos exigen el ámbito en su firma, y es OBLIGATORIO.**
  Archivos: `lib/modules/proveedores/ports/supplier-repository.ts`,
  `lib/modules/proveedores/ports/supplier-catalog-repository.ts`.
  Contenido: `scope: SupplierScope` **al final** de los **nueve** métodos (`design.md > 3.2`).
  **Nunca opcional** (alternativa I de `design.md > 11`). Docblocks que expliquen, con sus propias
  palabras, por qué está en la firma.
  Depende de: T6.
  Hecho cuando: `pnpm typecheck` falla en los dos adaptadores driven, en los nueve casos de uso y en
  el cableado —eso es la prueba de que el olvido en la **llamada** no compila— y queda verde al
  terminar T8–T13.
  Cubre: R23.

- [x] **T8 — Los nueve casos de uso pasan el ámbito; dos de ellos ganan el puerto de unidades.**
  Archivos: `lib/modules/proveedores/domain/{create,update,delete,get}-supplier.ts`,
  `list-suppliers.ts`, `{create,update,delete}-catalog-line.ts`, `list-catalog-lines.ts`.
  Contenido: tras `requirePermission` (que sigue siendo la primera línea), construir
  `{ companyId: actor.companyId }` y pasarlo al puerto. En `create-catalog-line.ts` y
  `update-catalog-line.ts`, además: `units: UnitCatalog` en sus `*Deps` y, **solo si la entrada trae
  unidad**, `units.findRefs([unitId], actor.companyId)`; respuesta vacía → `ValidationError`. La
  **ausencia** de unidad sigue siendo válida. Ninguna condición de consulta aquí; ningún cambio en el
  orden permiso → zod → puertos. El docblock de `create-catalog-line.ts` se **corrige** donde queda
  mintiendo: la coherencia de empresa de la presentación la pone ahora la clave foránea compuesta.
  Depende de: T7.
  Hecho cuando: los nueve compilan, ningún caso de uso menciona `company` dentro de un `where`, y
  ningún archivo del módulo importa `inventario`.
  Cubre: R18, R20, R21, R27, R28, R30, R33.

## Bloque 2 — Persistencia, costura y cableado

- [x] **T9 — El único punto de consulta.**
  Archivos: `lib/modules/proveedores/adapters/driven/persistence/company-scope.ts` (nuevo).
  Contenido: `companyScope` privada + `supplierCompanyScope`, `catalogLineCompanyScope` y
  `companyScopeColumns`; docblock con las reglas de uso de `design.md > 4`, incluida la de
  `isSupplierAlive` y la nota de que **no hay ninguna excepción**.
  Depende de: T6.
  Hecho cuando: existe y su test afirma que las tres envolturas devuelven el mismo objeto.
  Cubre: R23, R24.

- [x] **T10 — Adaptador driven del proveedor, acotado.**
  Archivos: `lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts`.
  Contenido: el ámbito compuesto en `buildSupplierWhere` —al lado de `deletedAt: null` y **nunca**
  fundido con la búsqueda ni con los filtros— y en el `where` de `findAliveSupplierById`, del
  `updateMany` de `updateAliveSupplier` y de **las dos** sentencias de `softDeleteAliveSupplier`; el
  `count` sigue usando **el mismo objeto** `where` que el `findMany`; `createSupplier` escribe
  `companyId` desde `companyScopeColumns`. La transacción interactiva, el `now` único y el
  cortocircuito `count !== 1` **no cambian**.
  Depende de: T0, T7, T9.
  Hecho cuando: ninguna consulta ni escritura del archivo se ejecuta sin el ámbito, ninguna salida
  pública lleva `companyId`, y `isUniqueNameViolation` sigue reconociendo el duplicado con el
  `meta.target` del índice compuesto.
  Cubre: R14 (parte), R16, R25, R27, R28, R29, R30, R31.

- [x] **T11 — Adaptador driven del catálogo, acotado — incluida `isSupplierAlive`.**
  Archivos: `lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma.ts`.
  Contenido: ámbito en `isSupplierAlive` (**el punto que más fácil se escapa**), en
  `buildCatalogLineWhere`, en el `create` —`companyId` desde `companyScopeColumns`— y en los
  `updateMany` de `replaceAliveCatalogLine` y `softDeleteAliveCatalogLine`, donde el filtro por
  relación `supplier: { … }` gana **también** el ámbito del proveedor. `CATALOG_LINE_UNIQUE_TARGETS`
  **no cambia**; `classifyForeignKeyViolation` **no cambia** y se comprueba con los nombres nuevos en
  T20.
  Depende de: T0, T7, T9.  `[P]` con T10.
  Hecho cuando: ninguna consulta ni escritura del archivo se ejecuta sin el ámbito, y listar el
  catálogo de un proveedor ajeno responde «proveedor no encontrado».
  Cubre: R26, R28, R30, R31.

- [x] **T12 — Server Actions con las dos caras de la sesión, dentro de `runInRequestScope`.**
  Archivos: `lib/modules/proveedores/adapters/driving/supplier-actions.ts` y
  `supplier-catalog-actions.ts`.
  Contenido: `currentActor()` pide `getSessionUser()` **y** `getSessionContext()` en un `Promise.all`
  envuelto en `runInRequestScope` —y **solo** ese `Promise.all`—, y devuelve `null` si falta
  cualquiera; **ninguna** firma pública cambia.
  Depende de: T6.  `[P]` con T10, T11.
  Hecho cuando: sin contexto de sesión ninguna action escribe nada, y los tests existentes de las
  actions siguen verdes sin cambiar de firma pública.
  Cubre: R22, R38.

- [x] **T13 — Cableado: el ámbito en los puertos y `unitCatalog` en las dos factories de línea.**
  Archivos: `lib/composition/index.ts` (`supplierRepository`, `supplierCatalogRepository`, la fachada
  `proveedores`).
  Contenido: `units: unitCatalog` —la constante que el archivo **ya construye**— en
  `createCreateCatalogLine` y `createUpdateCatalogLine`. **Ni `products` ni ninguna otra dependencia
  de `inventario`**; **no se reordena ni se reformatea nada** del archivo, mismo criterio que QC-60 y
  QC-50.
  Depende de: T8, T10, T11.
  Hecho cuando: `pnpm typecheck` queda verde en todo el repo y el bloque `proveedores` de la fachada
  sigue **sin** `products:`.
  Cubre: R19, R23 (parte).

## Bloque 3 — Las listas cerradas (una task cada una, a propósito)

- [x] **T14 — `PRE_EXISTING_INDEXES` de integración, y el caso del relevo.** `[P]`
  Archivos: `tests/integration/inventario/list-query-indexes.int.test.ts` (`:155`, `:182`).
  Contenido: sacar `'suppliers_name_unique'` **dejando en su sitio el comentario de relevo**, con el
  mismo formato que los de QC-49, QC-76 y QC-50; añadir un caso que afirme que
  `suppliers_company_name_unique` existe, es `UNIQUE`, lleva `company_id` de cabeza y **es parcial por
  `deleted_at IS NULL`** —exigiendo el predicado literal, no un `WHERE` genérico—.
  Depende de: T4.
  Hecho cuando: el archivo pasa, y borrar el `WHERE` de la migración lo pone rojo.
  Cubre: R13, R15 (ángulo 2).

- [x] **T15 — `PRE_EXISTING_INDEXES` de unit, la gemela que QC-50 no nombró.** `[P]`
  Archivos: `tests/unit/inventario/schema/list-query-indexes-migration.test.ts` (`:129`, `:133`).
  Contenido: ~~la misma baja y la misma alta que T14~~, sobre el **texto** de la migración de QC-57.
  **CORREGIDO EN LA IMPLEMENTACIÓN (2026-09-17): la baja NO procede y habría aflojado la lista.**
  Esta lista no dice «estos índices existen en la base»: alimenta el caso «no recrea ni borra ningún
  índice que ya existía», que afirma que el **texto** del UP y del DOWN de QC-57 **no los nombra**.
  Eso sigue siendo cierto de `suppliers_name_unique` aunque el índice ya no exista, y es el
  precedente del propio archivo (`presentations_name_normalized_key`, `units_name_normalized_key`,
  `recipes_name_unique`, `products_unit_id_idx` y `orders_unit_id_idx` siguen ahí, ya relevados).
  Lo hecho: `suppliers_name_unique` **se queda**, y **entran tres altas** —
  `suppliers_company_name_unique`, `suppliers_company_id_id_key` y
  `supplier_catalog_lines_company_id_supplier_id_idx`—, que QC-57 tampoco puede nombrar.
  Se hace **aparte**: es un archivo distinto y una lista distinta, y dar la segunda por hecha con la
  primera es exactamente cómo se escapan.
  Depende de: T4.
  Cubre: el gate.

- [x] **T16 — `MIGRACIONES_ESPERADAS` de la guardia de QC-71.** `[P]`
  Archivos: `tests/guards/guard-identificador-de-request.test.ts` (`:137`).
  Contenido: añadir el nombre de la migración de esta ficha, con el mismo patrón que
  `20260916120000_recipes_company_scope`.
  Depende de: T0.
  Cubre: el gate.

- [x] **T17 — `E2E_ESPERADOS` de la guardia de QC-71.** `[P]` **CERRADA 2026-09-17, en cuanto T31 creó `e2e/aislamiento-proveedores.spec.ts`. «Depende de: T22» era una errata del spec; la dependencia real era T31.**
  Archivos: `tests/guards/guard-identificador-de-request.test.ts` (`:57`).
  Contenido: añadir `'aislamiento-proveedores.spec.ts'` con su comentario, con el mismo patrón que
  `aislamiento-recetas.spec.ts` (`:68-78`), diciendo qué recorrido ejercita y que **no** ejercita el
  cruce del identificador de petición, de modo que el diferimiento de QC-71 R21 siga intacto.
  Depende de: T22.
  Cubre: el gate.

- [x] **T18 — Las cuatro listas de `tests/unit/proveedores/scope.test.ts`.** `[P]` **(b), (c) y (d) HECHAS en la tanda del bloque 3; (a), el censo de E2E, CERRADA 2026-09-17 tras T31: la lista pasa a dos literales y sigue siendo `toEqual`.**
  Archivos: `tests/unit/proveedores/scope.test.ts`.
  Contenido, las cuatro **a mano y con motivo escrito**:
  (a) censo de E2E (`:232`): de `['proveedores.spec.ts']` a **dos** literales, en el orden que
  devuelve `readdirSync`, con su comentario de por qué entra y de que la lista **sigue siendo
  cerrada**;
  (b) campos de `model Supplier` (`:347`): entra `companyId` en su posición y la línea
  `@@unique([companyId, id], map: "suppliers_company_id_id_key")`;
  (c) campos de `model SupplierCatalogLine` (`:377`): entra `companyId` y el `@@index` compuesto
  nuevo. **La aserción «aquí no hay ningún `@@unique`» (`:403`) NO se toca, y eso es una aserción
  útil**: es la prueba en el gate de que la unicidad de la línea sigue siendo el índice parcial;
  (d) migraciones que tocan las dos tablas (`:444`): de **cuatro** a **cinco**, nombrada a mano.
  Depende de: T0, T2, T4, T22.
  Hecho cuando: el archivo pasa y ninguna de las cuatro listas se convirtió en `toContain`.
  Cubre: R17 (por ausencia de cambio), el gate.

- [x] **T19 — `MARCAS_DE_INVENTARIO`: la colisión con `findRefs`, RETENSADA.** `[P]`
  Archivos: `tests/unit/proveedores/scope.test.ts` (`:81-88`).
  Contenido: `design.md > 6.3`. La marca `/\bfindRefs\b/` se sustituye por
  `/\b(products|productCatalog)\s*\.\s*findRefs\b/`, y entra una marca **nueva y positiva**: el único
  receptor de `findRefs` admitido en el módulo es `units`, nombrado literalmente; cualquier otro es
  hallazgo. La marca de tipo `/\bProduct(Catalog|Ref|Id)\b/` **no se toca**. El comentario cita el
  porqué **sin** nombrar fichas ni requisitos.
  Depende de: T8.
  Hecho cuando: el archivo pasa con `units.findRefs` en el módulo **y** se pone rojo al escribir a
  mano un `products.findRefs(...)` en cualquier archivo de `lib/modules/proveedores/**` (falsabilidad
  ejecutada y anotada en la bitácora).
  Cubre: R20.

- [x] **T20 — Los tres censos de `proveedores-schema.test.ts`.** `[P]`
  Archivos: `tests/unit/proveedores/schema/proveedores-schema.test.ts` (`:126`, `:151`, `:172`).
  Contenido: `companyId → company_id` entra en `SUPPLIER_COLUMNS` y en
  `SUPPLIER_CATALOG_LINE_COLUMNS`, y **las dos** columnas de empresa entran en `CROSS_MODULE_SCALARS`
  —cruzan de módulo y por eso no llevan `@relation`—.
  Depende de: T0.
  Cubre: R1, R2 (forma en el esquema), R12.

- [x] **T21 — Los censos de catálogo de `proveedores-constraints.int.test.ts`.** `[P]`
  Archivos: `tests/integration/proveedores/proveedores-constraints.int.test.ts`
  (`:651`, `:906`, `:1319`, `:1414`, `:1441`).
  Contenido: columnas de las dos tablas, censo de `CHECK` (**no cambia**, y eso se afirma), censo de
  FK —entran `suppliers_company_id_fkey`, `supplier_catalog_lines_company_id_fkey` y **las dos
  compuestas**, con su tabla de destino y su regla de borrado— y censo de índices —entran
  `suppliers_company_id_id_key`, `suppliers_company_name_unique` y el `@@index` compuesto; sale
  `suppliers_name_unique`—.
  Depende de: T3, T4.
  Hecho cuando: los `toEqual` siguen siendo exactos y ninguno pasó a `toContain`.
  Cubre: R1, R2, R3, R4, R5, R9.

- [x] **T22 — `MODELOS_YA_AISLADOS_POR_SU_MIGRACION` de `inventario`.** `[P]`
  Archivos: `tests/unit/inventario/scope.test.ts` (`:391`).
  Contenido: entran **`Supplier` y `SupplierCatalogLine`**, con la misma forma con que entraron
  `Order` y `Recipe`: su propia migración les da la empresa, no la de QC-49, así que siguen vetadas
  en el UP y el DOWN de aquélla y en el esquema se exige lo contrario. **Las dos**, a diferencia de
  QC-50, porque aquí la línea **sí** tiene empresa propia.
  Depende de: T0.
  Cubre: el gate.

- [x] **T23 — `ADAPTADORES_CON_ORM`, retensado de dos a tres.** `[P]`
  Archivos: `tests/unit/proveedores/module-contract.test.ts` (`:209`).
  Contenido: añadir `company-scope.ts` nombrado uno a uno —tipa `Prisma.SupplierWhereInput`—. La
  lista sigue siendo **exacta**: un cuarto archivo con Prisma sigue cayendo.
  Depende de: T9.
  Cubre: el gate.

- [x] **T24 — `ACCIONES` de QC-104.** `[P]`
  Archivos: `tests/unit/identity/session-once-per-request-actions.test.ts`.
  Contenido: añadir la fila de **los dos** archivos de Server Actions del módulo, cada uno con una
  acción cuya entrada llegue hasta `currentActor()`. Los casos que leen el árbol lo exigen en cuanto
  T12 esté hecha; no se espera al gate para descubrirlo.
  Depende de: T12.
  Cubre: R22.

- [x] **T25 — Censo de aislamiento de integración.** `[P]` **CERRADA 2026-09-17 tras T29 y T30: `company-scope.int.test.ts` entra como `transaccion` y `company-scope-queries.int.test.ts` como `commit`, con motivo y `desde`.**
  Archivos: `tests/integration/aislamiento.json`.
  Contenido: declarar los archivos nuevos de `tests/integration/proveedores/**` con su forma de
  aislamiento; si alguno fuese `commit`, con **motivo y desde**, que es lo que el propio censo exige.
  Depende de: T29, T30.
  Hecho cuando: `guard-aislamiento-integracion` pasa.
  Cubre: el gate.

- [x] **T26 — Barrido de anotaciones que esta ficha deja mintiendo.** `[P]`
  Archivos: los que aparezcan; como mínimo
  `db/migrations/20260911130000_inventory_company_scope/migration.sql:35`,
  `tests/unit/inventario/scope.test.ts:360` y
  `tests/unit/inventario/schema/inventory-company-scope-migration.test.ts:483`, que anuncian
  `suppliers`/`supplier_catalog_lines` como pendientes.
  Contenido: buscar en el repo toda anotación que siga afirmando que estas dos tablas están sin
  ámbito y **corregirla**, no borrar el comentario entero. **Las migraciones ya aplicadas no se
  editan**: si la anotación vive en una, se corrige la del test que la refleja y se deja constancia
  en la bitácora.
  Depende de: T0.
  Hecho cuando: ningún archivo vivo del repo sigue diciendo que `proveedores` está pendiente de
  ámbito.
  Cubre: R36.

- [ ] **T27 — Las listas que comparan el DIFF contra `origin/dev`: correr DESPUÉS del primer commit.**
  Archivos: ninguno, salvo que muerdan.
  Contenido: `design.md > 0.11`. Tras el **primer commit** de la rama, correr
  `tests/unit/proveedores-ui/guard-convenciones-proveedores.test.ts`,
  `tests/unit/proveedores-ui/guard-herencia-armazon-privado.test.ts`,
  `tests/unit/unidades/consumidores-catalogo.test.tsx`, `tests/guards/guard-qc95-alcance-del-pr-70.test.ts`,
  `tests/guards/guard-qc102-limites-de-la-ficha.test.ts` y
  `tests/guards/guard-pantalla-pedidos-se-amplia.test.ts`. **Regla de higiene**: ningún mensaje de
  commit de esta rama puede contener la cadena `QC-44`, porque esos dos guards filtran por ella y se
  atribuirían el árbol de trabajo entero.
  Depende de: el primer commit de la rama.
  Hecho cuando: las seis pasan **con el árbol committeado**, no con el árbol sucio.
  Cubre: el gate.

- [ ] **T28 — La deuda que queda vacía se borra entera.**
  Archivos: `docs/architecture.md` (la viñeta «Lo ya construido todavía no lo está», `:33-36`).
  Contenido: sacar `proveedores` de la lista. Si al hacerlo la lista **queda vacía** —`unidades` la
  cerró QC-76—, **borrar la viñeta entera**, con su frase y su referencia, que es lo que ella misma
  manda («cuando la lista quede vacía, esta viñeta se borra») y lo que
  `docs/architecture.md` exige al prohibir preparar infraestructura «por si acaso». Lo que la
  sustituye ya tiene nombre: **QC-61**, que esta ficha desbloquea y **no** implementa.
  Depende de: T31.
  Hecho cuando: ninguna viñeta de deuda nombra `proveedores`, y si quedó vacía, no queda viñeta.
  Cubre: R24, R38.

## Bloque 4 — Pruebas

- [x] **T29 — Integración: restricciones, unicidad, backfill y reversión.** `[P]`
  Archivos: `tests/integration/proveedores/company-scope.int.test.ts` (nuevo).
  Contenido: `INSERT` de proveedor y de línea sin empresa y con empresa inexistente → rechazo; línea
  con empresa distinta de la de su proveedor → rechazo por la **FK compuesta**, nombrándola; línea
  con presentación de otra empresa → rechazo por la **otra FK compuesta**, nombrándola, y
  **aceptación** de la de la propia empresa; dos proveedores vivos de empresas **distintas** con el
  mismo nombre → se aceptan, dos de la **misma** → `23505`; **dar de baja libera el nombre** (ángulo
  3 de R15); la línea sigue cayendo con el borrado físico de su proveedor; los dos backfills; la
  reversión abortada por **cada una** de sus causas, con un control que demuestre que el aborto no es
  un placebo; el `down.sql` ejecutado **entero** y los dos retratos de esquema comparados contra
  `pg_indexes`, `pg_constraint` e `information_schema`; una empresa marcada como borrada conserva sus
  proveedores y sus líneas.
  Depende de: T5.
  Cubre: R1, R2, R3, R4, R5, R7, R8, R10, R11, R14, R15, R34.

- [x] **T30 — Integración: listados, escrituras y la costura de unidades.** `[P]`
  Archivos: `tests/integration/proveedores/company-scope-queries.int.test.ts` (nuevo).
  Contenido: con proveedores y líneas de dos empresas sembrados, los **dos** listados devuelven solo
  los suyos **y el `total` también**; la búsqueda y los filtros **no ensanchan** lo visible;
  `findAliveById`, `updateAlive` y `softDeleteAlive` con un id ajeno devuelven «no existe» y **dejan
  la fila ajena intacta, líneas incluidas**; `listBySupplierAlive` y `create` sobre un proveedor
  ajeno devuelven `'supplier_not_found'`; `replaceAlive`/`softDeleteAlive` de línea ajena devuelven
  «no encontrado»; las dos altas escriben la empresa del ámbito; la baja del proveedor arrastra
  **solo** las líneas de su empresa, con el mismo `deleted_at`; el duplicado de nombre llega al
  adaptador como `'duplicate'` con el `meta.target` real del índice compuesto; `findUnitRefs` acotada
  (sistema sí, propia sí, ajena no); quitar `FORCE ROW LEVEL SECURITY` **no cambia ningún
  resultado**.
  Depende de: T10, T11, T13.
  Cubre: R16, R19, R25, R26, R27, R28, R29, R30, R31, R35.

- [x] **T31 — E2E de aislamiento.** **(E2E — Playwright)**
  Archivos: `e2e/aislamiento-proveedores.spec.ts` (nuevo), con el patrón de
  `e2e/aislamiento-inventario.spec.ts` y `e2e/aislamiento-pedidos.spec.ts`: fixture propio, prefijo
  por worker, limpieza defensiva en el orden que respetan las FK, **una sola sesión real** (la de A)
  y los datos de B sembrados con Prisma; el aterrizaje del login sale del helper único de QC-93.
  Contenido: los cuatro pasos de `design.md > 8.3` — listado sin el proveedor de B; URL del detalle
  de B **indistinguible** de un id inexistente; **sustitución por DOM del campo oculto** del diálogo
  de borrado por el id de B, rechazo, y el proveedor de B intacto con su línea intacta (comprobado
  con Prisma); alta en A con el **mismo nombre** que un proveedor de B, sin error. **No se toca
  ningún componente.**
  Depende de: T10, T11, T12.
  Hecho cuando: pasa en Chromium **y** en WebKit, y el fixture deja la base como la encontró.
  Cubre: R37, y ejercita R14, R25, R27, R28 de extremo a extremo.

- [x] **T32 — Test de esquema y de texto de la migración.** `[P]`
  Archivos: `tests/unit/proveedores/schema/suppliers-company-scope-migration.test.ts` (nuevo).
  Contenido: el UP declara las dos columnas, las dos FK simples, las **dos claves candidatas**, las
  **dos FK compuestas**, el paréntesis de RLS y el relevo del único **con su `WHERE`** —evaluado
  también sobre una copia **en memoria** sin el `WHERE`, que tiene que dar falso: es el **ángulo 1**
  de R15—; **no contiene ningún `DELETE` ni `INSERT`**, no toca `presentations` más allá de su clave
  candidata y del paréntesis de RLS, y no toca ninguna otra tabla; el `down.sql` abre con sus tres
  guardias, quita las FK **antes** que las claves candidatas y restaura el único global parcial;
  identificadores en inglés; los cuatro `CHECK` y las FK previas siguen escritos.
  Depende de: T5.
  Cubre: R8 (parte), R9, R10, R12, R15 (ángulo 1), R38 (parte).

- [x] **T33 — Guardia estática por función.** `[P]`
  Archivos: `tests/guards/guard-ambito-empresa-proveedores.test.ts` (nuevo), calcado de
  `guard-ambito-empresa-recetas.test.ts`.
  Contenido: **método a método** de los dos puertos, y **función a función** de todo
  `proveedores/adapters/driven/persistence/`, que la implementación declara el ámbito y que ese valor
  llega hasta una envoltura de `./company-scope`; con un caso **explícito** para `isSupplierAlive`,
  que no es método de ningún puerto. **Sin lista de excepciones**, y un caso que afirme que no existe
  ninguna.
  Depende de: T9, T10, T11.
  Hecho cuando: pasa, y se pone roja al quitar a mano el `scope` de una función real (falsabilidad
  ejecutada y anotada).
  Cubre: R23, R24.

- [x] **T34 — Service: el rechazo cruzado y la unidad, con dobles.** `[P]`
  Archivos: `tests/unit/proveedores/company-isolation-service.test.ts` (nuevo);
  `tests/unit/proveedores/company-scope.test.ts` (nuevo: las tres envolturas y la forma de la salida
  pública); `tests/unit/proveedores/authorization.test.ts`, `supplier-service.test.ts`,
  `catalog-service.test.ts`, `list-use-cases.test.ts` y `supplier-actions.test.ts` (se amplían);
  `tests/unit/proveedores/catalog-line-fk.test.ts` (se amplía con los **nombres nuevos** de las dos
  restricciones compuestas contra `classifyForeignKeyViolation`).
  Contenido: los nueve casos de uso reciben el ámbito **del actor** y no de la entrada; lo ajeno →
  error de «no existe» y **nunca** `UnauthorizedError`; el permiso se exige **antes** del ámbito
  (puertos **explosivos**: actor sin permiso → error de autorización sin tocar ningún puerto); unidad
  ajena → entrada inválida sin escribir nada, unidad de sistema y unidad propia → aceptadas, unidad
  ausente → aceptada; una `companyId` en la entrada se descarta; falta el contexto de sesión → la
  action no llama al caso de uso; ninguna salida pública lleva `companyId`.
  Depende de: T8, T12.
  Cubre: R18, R21, R22, R27, R28, R30, R31, R33.

- [x] **T35 — Que las imágenes no se movieron.** `[P]`
  Archivos: `tests/unit/proveedores/catalog-line-image-scope.test.ts` (nuevo) o ampliación del test
  de imagen existente.
  Contenido: la ruta que compone el adaptador de almacenamiento **no** contiene el identificador de
  empresa, la URL se sigue obteniendo con el enlace público y ninguna firma del puerto de
  almacenamiento gana la empresa.
  Depende de: —.  `[P]` con todo el bloque.
  Cubre: R32.

## Bloque 5 — Cierre

- [ ] **T36 — Documentación de la deuda saldada y bitácora.**
  Archivos: `db/schema.prisma` (`///` de `Supplier`, `SupplierCatalogLine` y `Presentation`: la
  empresa, las claves candidatas, las FK compuestas, el único por empresa y el drift);
  `progress/impl_QC-59-aislamiento-por-empresa-en-proveedores.md` con el mapa `R<n> -> test`.
  Depende de: T31, T28.
  Hecho cuando: los `///` describen el estado real y el mapa de trazabilidad está escrito.
  Cubre: el checkpoint de trazabilidad de `CHECKPOINTS.md`.

- [ ] **T37 — Gate completo.**
  `./init.sh` en verde (no `--rapido`: es lo que exige cerrar la feature y todo PR).
  Depende de: T36.
  Hecho cuando: typecheck, lint, unit, integración, guardias y E2E pasan; en particular
  `guard-rls-force`, `guard-arquitectura-modulos`, `guard-dependencias-aprobadas`,
  `guard-aislamiento-integracion`, `guard-identificador-de-request`, `guard-e2e-landing`, la guardia
  del catálogo de errores y las seis de T27, **con el árbol committeado**.
  Cubre: R38, R39 (por ausencia: `ERROR_CODES` no crece, ninguna empresa se borra, `package.json` no
  se toca).

## Trazabilidad — `R<n> -> test`

| R | Test | Nivel |
| --- | --- | --- |
| R1 | `tests/integration/proveedores/company-scope.int.test.ts` + `proveedores-constraints.int.test.ts` (censo de columnas y de FK) | integración |
| R2 | `company-scope.int.test.ts` + `proveedores-constraints.int.test.ts` + `tests/unit/proveedores/schema/proveedores-schema.test.ts` | integración + unit |
| R3 | `proveedores-constraints.int.test.ts` (las dos claves candidatas) + `suppliers-company-scope-migration.test.ts` | integración + unit |
| R4 | `company-scope.int.test.ts` (línea con empresa distinta de la de su proveedor → rechazo nombrando la FK compuesta) | integración |
| R5 | `company-scope.int.test.ts` (presentación ajena → rechazo; propia → aceptada) | integración |
| R6 | `company-scope.int.test.ts` (ninguna fila escrita) + `tests/unit/proveedores/catalog-line-fk.test.ts` (ningún código nuevo) | integración + unit |
| R7 | `company-scope.int.test.ts` (los dos backfills, incluidas las filas con `deleted_at`) | integración |
| R8 | `company-scope.int.test.ts` (recuentos antes/después) + `suppliers-company-scope-migration.test.ts` | integración + unit |
| R9 | `tests/guards/guard-rls-force.test.ts` + `suppliers-company-scope-migration.test.ts` + `proveedores-constraints.int.test.ts` | guardia + unit + integración |
| R10 | `suppliers-company-scope-migration.test.ts` + `company-scope.int.test.ts` (el `down.sql` entero y los dos retratos) | unit + integración |
| R11 | `company-scope.int.test.ts` (las reversiones abortadas, con su control anti-placebo) | integración |
| R12 | `suppliers-company-scope-migration.test.ts` + `proveedores-schema.test.ts` | unit |
| R13 | `tests/integration/inventario/list-query-indexes.int.test.ts` (`company_id` de cabeza en las dos tablas) | integración |
| R14 | `list-query-indexes.int.test.ts` + `company-scope.int.test.ts` (dos empresas sí, una dos veces no, el borrado **libera**) | integración |
| **R15** | **los tres ángulos, independientes y falsables**: `suppliers-company-scope-migration.test.ts` (texto), `list-query-indexes.int.test.ts` (predicado en `pg_indexes`), `company-scope.int.test.ts` (comportamiento) | unit + integración |
| R16 | `company-scope-queries.int.test.ts` (`meta.target` real → `'duplicate'`; el único de línea **nunca** se traduce a nombre de proveedor) | integración |
| R17 | `tests/unit/proveedores/scope.test.ts` (no hay `@@unique` en el modelo) + `proveedores-constraints.int.test.ts` (el índice parcial sigue igual) | unit + integración |
| R18 | `tests/unit/proveedores/company-isolation-service.test.ts` (sistema sí, propia sí, ajena no, ausente sí) | unit |
| R19 | `company-scope-queries.int.test.ts` (`findUnitRefs` acotada) + `tests/unit/unidades/unit-catalog.test.ts` (sigue reutilizando `companyScopeWhere`, **un solo `OR`**) | integración + unit |
| R20 | `tests/unit/proveedores/scope.test.ts` (`MARCAS_DE_INVENTARIO` **retensada**) + `module-contract.test.ts` | unit |
| R21 | `company-isolation-service.test.ts` + `tests/unit/proveedores/authorization.test.ts` | unit |
| R22 | `tests/unit/proveedores/supplier-actions.test.ts` + `tests/unit/identity/session-once-per-request-actions.test.ts` | unit |
| R23 | `tests/guards/guard-ambito-empresa-proveedores.test.ts` + `tests/unit/proveedores/company-scope.test.ts` + `company-scope-queries.int.test.ts` | guardia + unit + integración |
| R24 | `guard-ambito-empresa-proveedores.test.ts` (no existe ninguna lista de excepciones) + revisión de `docs/architecture.md` en T28 | guardia |
| R25 | `company-scope-queries.int.test.ts` (listado y `total`; búsqueda y filtros no ensanchan) | integración |
| R26 | `company-scope-queries.int.test.ts` (catálogo de proveedor ajeno → `'supplier_not_found'`) | integración |
| R27 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R28 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R29 | `company-scope-queries.int.test.ts` (baja ajena: ninguna línea tocada; baja propia: mismo `deleted_at`) | integración |
| R30 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R31 | `tests/unit/proveedores/company-scope.test.ts` (forma de la salida pública) | unit |
| R32 | `tests/unit/proveedores/catalog-line-image-scope.test.ts` | unit |
| R33 | `tests/unit/proveedores/authorization.test.ts` (se amplía, dobles explosivos) + `company-isolation-service.test.ts` | unit |
| R34 | `company-scope.int.test.ts` (empresa de baja conserva proveedores y líneas) | integración |
| R35 | `company-scope-queries.int.test.ts` (sin `FORCE`, mismo retrato) | integración |
| R36 | `tests/unit/proveedores/module-contract.test.ts` + el barrido de T26 | unit |
| **R37** | **`e2e/aislamiento-proveedores.spec.ts`** | **E2E** |
| R38 | `suppliers-company-scope-migration.test.ts` (la migración no toca otras tablas) + `supplier-actions.test.ts` y `list-use-cases.test.ts` (firmas y forma de salida intactas) | unit |
| R39 | `tests/guards/guard-dependencias-aprobadas.test.ts` | guardia |

**E2E**: solo **T31 / R37**. Todo lo demás es unit, integración o guardia.
