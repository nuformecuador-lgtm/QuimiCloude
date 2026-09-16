# QC-60 — aislamiento-por-empresa-en-pedidos · bitácora del implementer

> Spec aprobado por el humano el 2026-09-15 (F1.4). Worktree
> `.worktrees/QC-60-aislamiento-por-empresa-en-pedidos`, rama
> `feature/QC-60-aislamiento-por-empresa-en-pedidos`, sincronizada con `origin/dev` en `48072a5`.
> Todo el trabajo lo hizo `backend_dev` en 8 tandas; `frontend_dev` no intervino (no hay pantalla).
> **T19 (gate completo `./init.sh`) no lo corre el implementer**: es del leader. Esta bitácora no
> se autoaprueba; decide el reviewer.

## Estado: 19 de 20 tasks cerradas (T0–T18). Queda T19, del leader.

Los dos abiertos de la ronda 1 (R15 y R22) **quedaron cerrados en la ronda 2** por decisión humana
del 2026-09-16: ver *Ronda 2* al final. La sección *Abiertos* se conserva como registro de lo que se
encontró.

## Commits

| Commit | Contenido |
| --- | --- |
| `2f83079` | T0–T4: migración `20260915120000_orders_company_scope` (UP + `down.sql`) y `schema.prisma` |
| `6e5089e` | T5–T7: `OrderScope`, actor con empresa, puerto, catálogo y seis casos de uso |
| `96406bb` | T8–T11: punto único, adaptador acotado, correlativo por empresa, actions, llamantes de `asignaciones`, fixtures, tests de texto de la migración |
| `8e0c8a6` | T13–T14: integración de consultas y carrera; cuatro tests obsoletos adaptados |
| `ecb07f7` | T15–T16: guardia por función y rechazo cruzado en el service |
| `6810067` | T12: integración de restricciones, backfill y reversión |
| `f3fb1cb` | T18 (docs y `///`) y dos casos de QC-87 adaptados a R27 |
| `f583f2a` | T17: E2E |
| `1f85412` | Centinela `tests/unit/pedidos/scope.test.ts` ampliado a tres specs E2E |

## Archivos

**Producción.** `db/schema.prisma`; `db/migrations/20260915120000_orders_company_scope/{migration.sql,down.sql}` (nuevos);
en `lib/modules/pedidos/`: `domain/order-scope.ts` (nuevo), `domain/actor.ts`, `domain/order-catalog.ts`,
`domain/{create,get,list,update,cancel,delete}-order.ts`, `ports/order-repository.ts`, `index.ts`,
`adapters/driven/persistence/company-scope.ts` (nuevo), `order-prisma.ts`, `order-catalog-prisma.ts`,
`adapters/driving/order-actions.ts`; en `lib/modules/asignaciones/domain/`:
`{assign-responsibles,list-order-responsibles,unassign-responsible,remove-work-group-from-order}.ts`
(una línea cada uno); `docs/architecture.md` (viñeta de deuda).
Sin tocar: `package.json`, `pnpm-lock.yaml`, `ERROR_CODES`, `recetas`.

**Tests nuevos (8).** `tests/unit/pedidos/schema/orders-company-scope-migration.test.ts`,
`tests/unit/pedidos/company-isolation-service.test.ts`, `tests/unit/pedidos/company-scope.test.ts`,
`tests/guards/guard-ambito-empresa-pedidos.test.ts`,
`tests/integration/pedidos/company-scope.int.test.ts`,
`tests/integration/pedidos/company-scope-queries.int.test.ts`,
`tests/integration/pedidos/order-sequence-race.int.test.ts`, `e2e/aislamiento-pedidos.spec.ts`.

**Tests ampliados, reparados o adaptados.** Unit: `tests/unit/pedidos/{authorization,order-actions,cancel-order,delete-order,list-orders,order-service,order-catalog,order-prisma-errors,module-contract,scope}.test.ts`,
`tests/unit/pedidos/schema/{pedidos-migration,pedidos-schema}.test.ts`,
`tests/unit/asignaciones/{order-state,remove-work-group-from-order,unassign-responsible}.test.ts`.
Integración: `tests/integration/pedidos/{order-sequence,order-crud,order-repository,list-query-orders,pedidos-constraints}.int.test.ts`,
`tests/integration/asignaciones/{company-scope,batch-company-scope,order-assignment-prisma,order-assignments-constraints}.int.test.ts`,
`tests/integration/asignaciones/use-case-fixture.ts`, `tests/integration/identity/work-group-assignments.int.test.ts`,
`tests/integration/aislamiento.json`. E2E: `e2e/pedidos-responsables.spec.ts` (`companyId` en su siembra).

## Decisiones tomadas al implementar

1. **`companies` también entra en el paréntesis `NO FORCE`** del UP (y `companies` + `order_assignments` en el DOWN). §7.1 solo nombra `orders`, pero el backfill lee `companies` y bajo `FORCE` sin policy vería 0 filas y abortaría con el mensaje equivocado. Documentado en los dos SQL; RLS final idéntica (R4).
2. **`orders_id_company_id_key` es `ADD CONSTRAINT … UNIQUE`** (SQL literal de §2.2), no `CREATE UNIQUE INDEX` como `users_id_company_id_key`. Mismo efecto.
3. **`order-sequence.int.test.ts` reescrito, no retirado**: probaba la función muerta; ahora prueba el adaptador real (año nuevo empieza en 1; un alta abortada no consume número, derogación de §3.4). Pasó de `transaccion` a `commit` en el censo, con motivo.
4. **Dos casos de QC-87** (`asignaciones/company-scope.int.test.ts`) quedaban rojos por R27: «pedido de A, actor de B» ahora muere en `order_not_found` antes del repositorio. Se reescribieron para afirmar eso y que la fila sigue. La mordida sobre el `where` de `listByOrderInCompany`/`deleteOne` la conserva `order-assignment-prisma.int.test.ts`, que llama al adaptador. Con la FK compuesta esa fila cruzada ya no puede existir.
5. **`module-contract.test.ts`**: `company-scope.ts` importa el tipo `Prisma`; se separaron `DUENOS_DE_PRISMA` (2) y `DUENOS_DEL_CLIENTE` (sin cambios). La lista sigue cerrada.
6. **E2E, sustitución del id por DOM**: un re-render del diálogo reescribía el campo oculto antes del submit (la primera corrida borró el pedido de A). El helper repone el valor en un listener `submit` en captura; el test afirma que el POST lleva el id de B y tiene control positivo. `e2e/aislamiento-inventario.spec.ts` podría tener el mismo riesgo latente (no tocado).
7. **El 78 (R13) en integración** se mide sobre una empresa efímera sembrada con 37/44/77, porque la base de test es copia de plantilla sin los pedidos reales. Sobre la base de desarrollo se midió aparte: el alta real de QuimiCloud en 2026 dio 78 (y se limpió).

## Abiertos — para el reviewer y el leader

1. **R15 no se cumple contra Postgres real.** `isDuplicateOrderNumber` busca el nombre `orders_company_year_sequence_key` en la carga del error, como pide `design.md > 3.3`. Medido con Prisma 6.19.3 y Postgres en español dentro de `$transaction` + `$queryRaw`: el error es `P2010` con `meta.code = 23505` y `meta.message = Ya existe la llave (company_id, order_year, order_sequence)=(…)`, **sin nombre de índice**. Consecuencia: el reintento nunca ocurre, `duplicate_number` nunca se devuelve y un choque real llegaría crudo al dominio. Hoy no se nota porque el lock evita el choque (T14 lo prueba y muerde), y `order-prisma-errors.test.ts` pasa porque fabrica un error que sí trae el nombre. El design afirma que esa técnica sigue siendo la correcta aquí; la medición lo contradice. Elegir otra señal (p. ej. SQLSTATE + lista de columnas, como QC-81 resolvió por columnas) es reabrir §3.3, y no se improvisó.
2. **R22 solo a medias.** R22 exige que una `companyId` en la entrada del alta se rechace por campo desconocido. `createOrderSchema`/`updateOrderSchema` son `z.object`, que descarta la clave sin error, y `tests/unit/pedidos/order-input.test.ts` (QC-35bis) fija ese descarte para `unitId`/`unitPrice`. Se cumple la parte de seguridad (la empresa de la entrada nunca se escribe ni llega al puerto), no el rechazo. Cerrarlo pide cambiar `lib/` (rechazar `companyId` expresamente, o `strictObject`, que rompería el test de QC-35bis).
3. **R17 / T10 / T16, redacción**: «sin contexto, la action no llama al caso de uso» no es literal: la action llama al caso de uso con actor `null` y éste rechaza en su primera línea sin tocar ningún puerto (un test de QC-34 exige que la action no repita `requirePermission`). Lo que R17 pide —rechazar sin consultar el repositorio— se cumple y está probado con la cadena real.
4. **Errata del design**: `design.md` (§0.3, §1, §7) y `tasks.md > T11` hablan de seis `CHECK` en `orders`; hay cinco (`orders_unit_price_non_negative` cayó en `20260907120000_orders_drop_unit_and_unit_price`). El test calcula el número real. La cabecera de `migration.sql:11` también descuadra. Sin efecto funcional.
5. **Errata de trazabilidad**: `tasks.md` cita `tests/unit/pedidos/order-prisma.test.ts` para R15; el archivo real es `order-prisma-errors.test.ts`.

## Trazabilidad — `R<n> -> test`

| R | Test | Nivel |
| --- | --- | --- |
| R1 | `tests/integration/pedidos/company-scope.int.test.ts` (sin empresa `23502`; inexistente `23503`; sin fila) | integración |
| R2 | `tests/integration/pedidos/company-scope.int.test.ts` (backfill de viva, cancelada y borrada; aborto sin «quimicloud» sin dejar nada a medias) | integración |
| R3 | `tests/unit/pedidos/schema/orders-company-scope-migration.test.ts` (ni `INSERT` ni `DELETE`) + `company-scope.int.test.ts` (conteos iguales) | unit + integración |
| R4 | `tests/guards/guard-rls-force.test.ts` + `orders-company-scope-migration.test.ts` (`ENABLE`+`FORCE`, sin policy) + `company-scope.int.test.ts` | guardia + unit + integración |
| R5 | `orders-company-scope-migration.test.ts` + `tests/unit/pedidos/schema/pedidos-migration.test.ts` (función recreada idéntica) + `company-scope.int.test.ts` (DOWN restaura único global, FK simple, función y RLS; ninguna fila perdida) | unit + integración |
| R6 | `tests/integration/pedidos/company-scope.int.test.ts` (guardias 1 y 2 abortan entero) + `orders-company-scope-migration.test.ts` (tres guardias antes de restaurar) | integración + unit |
| R7 | `tests/integration/pedidos/company-scope.int.test.ts` (`setval` al máximo; reinsertar da `23505`) | integración |
| R8 | `orders-company-scope-migration.test.ts` (identificadores en inglés; marcas conservadas) | unit |
| R9 | `orders-company-scope-migration.test.ts` (no añade ni quita `deleted_at`) | unit |
| R10 | `orders-company-scope-migration.test.ts` (`company_id` de cabeza en el único) | unit |
| R11 | `tests/integration/pedidos/company-scope.int.test.ts` + `e2e/aislamiento-pedidos.spec.ts` (misma posición en A y B) | integración + E2E |
| R12 | `tests/integration/pedidos/company-scope-queries.int.test.ts` (primera = 1; borrado y cancelado no liberan) + `tests/integration/pedidos/order-sequence.int.test.ts` | integración |
| R13 | `company-scope.int.test.ts` (backfill conserva 37/44/77) + `company-scope-queries.int.test.ts` (siguiente = 78) | integración |
| R14 | `tests/integration/pedidos/order-sequence-race.int.test.ts` (3×8 altas simultáneas, distintas y consecutivas, cero reintentos; empresas distintas no se esperan; muerde sin el lock) | integración |
| R15 | `tests/integration/pedidos/order-duplicate-number.int.test.ts` (23505 auténtico → `duplicate_number`, 3 transacciones, sin error de Prisma; **rojo antes del arreglo**) + `order-sequence-race.int.test.ts` + `tests/unit/pedidos/order-prisma-errors.test.ts` (forma real `P2010`/`meta.code`) | integración + unit |
| R16 | `tests/unit/pedidos/company-isolation-service.test.ts` | unit |
| R17 | `tests/unit/pedidos/order-actions.test.ts` (sin contexto o sin usuario → `unauthorized` sin tocar puertos) | unit |
| R18 | `tests/guards/guard-ambito-empresa-pedidos.test.ts` (por función, sin excepciones; 4 mutaciones probadas) + `tests/unit/pedidos/company-scope.test.ts` + `company-scope-queries.int.test.ts` | guardia + unit + integración |
| R19 | `company-scope-queries.int.test.ts` (listado y `total`, filtros y orden) + `e2e/aislamiento-pedidos.spec.ts` | integración + E2E |
| R20 | `company-isolation-service.test.ts` (ficha ajena = inexistente, nunca `unauthorized`) + E2E | unit + E2E |
| R21 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` (fila ajena intacta) + E2E (borrado cruzado) | unit + integración + E2E |
| R22 (enmendado 2026-09-16) | `company-isolation-service.test.ts` (entrada con empresa B y actor de A: el alta resuelve, el puerto recibe `{ companyId: A }` y datos sin empresa) + `company-scope-queries.int.test.ts` (la fila se escribe con la empresa del ámbito) | unit + integración |
| R23 | `tests/unit/pedidos/company-scope.test.ts` + `company-scope-queries.int.test.ts` | unit + integración |
| R24 | `company-scope-queries.int.test.ts` (B recibe 7, no 79) + guardia (subselect desde `companyScopeColumns`) | integración + guardia |
| R25 | `tests/integration/pedidos/company-scope.int.test.ts` (`23503` en `order_assignments_order_id_company_id_fkey`) | integración |
| R26 | `orders-company-scope-migration.test.ts` (un solo `DROP CONSTRAINT`, sin `MATCH FULL`) + `company-scope.int.test.ts` (asignación suelta; `confmatchtype = 's'`) | unit + integración |
| R27 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` (catálogo) + `tests/unit/asignaciones/{order-state,remove-work-group-from-order,unassign-responsible}.test.ts` + `tests/integration/asignaciones/company-scope.int.test.ts` | unit + integración |
| R28 | `tests/unit/pedidos/authorization.test.ts` + `company-isolation-service.test.ts` | unit |
| R29 | `company-scope-queries.int.test.ts` (empresa de baja) | integración |
| R30 | `company-scope-queries.int.test.ts` (sin `FORCE`, mismos resultados) | integración |
| **R31** | **`e2e/aislamiento-pedidos.spec.ts`** (Chromium y WebKit) | **E2E** |
| R32 | `orders-company-scope-migration.test.ts` (no nombra `recipes` ni `recipe_lines`) | unit |
| R33 | `orders-company-scope-migration.test.ts` (ni guardia nueva, ni empresas borradas, ni tablas de otras fichas) | unit |
| R34 | `tests/unit/pedidos/order-actions.test.ts` (6 actions, misma aridad) + `tests/unit/pedidos/list-orders.test.ts` | unit |
| R35 | `tests/guards/guard-dependencias-aprobadas.test.ts` (`package.json` sin tocar) | guardia |

35 de 35 con test y cumplidos (R15 y R22 al día tras la ronda 2).

## Salida real de lo que se corrió (por subagente, nunca la suite)

- **T0–T4, contra la base de desarrollo:** `pnpm run db:migrate` → `Applying migration 20260915120000_orders_company_scope … All migrations have been successfully applied.` Estado: 3 pedidos de QuimiCloud en 37/44/77 de 2026; `companies` 48; `order_assignments` 0; `next_order_sequence` fuera de `pg_proc`; `orders_sequence_2026` viva. Restricciones: misma pareja en dos empresas aceptada, misma empresa `23505`, sin empresa `23502`, empresa inexistente `23503`, asignación cruzada `23503`. `db:rollback` abortó entero con la guardia 1 y con la guardia 2; la reversión limpia restauró todo sin perder filas; UP reaplicado. El implementer lo reverificó contra la base (3 filas en 37/44/77, 48 empresas, 0 asignaciones, función fuera, `orders_sequence_2026.last_value = 77`).
- **T11:** los 2 tests de esquema → `Test Files 2 passed (2) · Tests 58 passed (58)`.
- **T8–T10:** `pnpm lint` verde; unit de `pedidos` + `asignaciones` → `579 passed | 3 failed` (los 3 en `pedidos-schema.test.ts`, reparado en T16). Alta real de QuimiCloud → secuencia 78, salida sin `companyId`, base limpia.
- **T13–T14 y obsoletos:** 6 archivos de integración + `guard-aislamiento-integracion` → `Test Files 7 passed (7) · Tests 108 passed (108)`, dos corridas. Con el lock quitado: `× 3 rondas de 8 altas … Raw query failed. Code: 23505` y `× … el alta de A no espero al lock de su propia empresa`; archivo restaurado (sha1 igual).
- **T15–T16:** 6 archivos → `Test Files 6 passed (6) · Tests 154 passed (154)`. Guardia con mutaciones M1–M4 → 2, 1, 4 y 2 fallos; restaurada → 22 passed.
- **T12:** `company-scope.int.test.ts` + `guard-aislamiento-integracion` → `Test Files 2 passed (2) · Tests 17 passed (17)`, dos corridas; `pnpm typecheck` exit 0.
- **QC-87 y T18:** antes `Tests 2 failed | 4 passed (6)`; después `Tests 6 passed (6)`. Tests que leen `schema.prisma`/`architecture.md` + guardias → `505 passed, 4 skipped, 1 failed` (el centinela de `scope.test.ts`, reparado después). `prisma validate` OK; el diff de `schema.prisma` solo toca líneas `///`.
- **Centinela E2E:** `tests/unit/pedidos/scope.test.ts` → `Test Files 1 passed (1) · Tests 10 passed (10)`.
- **T17:** `[chromium] 2 passed (20.3s)` y `[webkit] 2 passed (28.1s)` (`aislamiento-pedidos.spec.ts` + `pedidos-responsables.spec.ts`). `pnpm typecheck` y `pnpm lint` verdes.

No se corrió `pnpm test`, `./init.sh` ni la suite E2E completa: el gate es del leader.

## Ronda 2 — 2026-09-16

Cinco correcciones pedidas por el leader; R15 y R22 decididas por el humano.

1. **R15, reconocimiento por código** (`3f9b340`). `isDuplicateOrderNumber` es ahora `sqlStateOf(error) === '23505'`, sin leer ningún texto; su comentario explica que es seguro solo porque está acotado al `INSERT` del alta, que no escribe `id`. Desaparece `ORDER_NUMBER_UNIQUE_INDEX`. `sqlStateOf` se redujo a leer `meta.code` de `PrismaClientKnownRequestError`: se quitó la rama que sacaba el código del mensaje de un `PrismaClientUnknownRequestError` con una regex (era leer texto); un error por esa vía ahora se relanza sin traducir, algo que no se ha visto en ninguna medición.
   - **Test nuevo** `tests/integration/pedidos/order-duplicate-number.int.test.ts` (declarado `commit` en `aislamiento.json`, con motivo): tras un alta que ocupa el 1, un trigger `BEFORE INSERT` temporal, limitado a la empresa efímera, fuerza `order_sequence = 1`; el test comprueba primero con `pg` que el trigger produce un `23505` real sobre `orders_company_year_sequence_key`, y luego que `createOrder` devuelve `'duplicate_number'`, abre exactamente 3 transacciones y deja 1 sola fila. Limpieza en `finally`.
   - **Comprobado rojo con el código anterior:** `× con el correlativo ocupado en los tres intentos devuelve duplicate_number, sin lanzar, tras 3 transacciones` → `PrismaClientKnownRequestError … Raw query failed. Code: 23505. Message: Ya existe la llave (company_id, order_year, order_sequence)=(…, 2026, 1).` (`Tests 1 failed (1)`). Tras el arreglo: `Tests 1 passed (1)`.
   - `tests/unit/pedidos/order-prisma-errors.test.ts` reescrito con la forma real medida (`P2010`, `meta.code`, mensaje sin nombre de índice): se reconoce; `23503`, `23514`, `P2002` sin `meta.code`, un `Unknown` con el código solo en el texto y lo que no es error de Prisma, no. Se retiró el caso «23505 de `orders_pkey` no se reconoce»: la garantía la da el acotamiento al `INSERT`, no el código.
   - `design.md > 3.3` con **enmienda fechada** (`5b882ef`).
   - Corridas: `order-prisma-errors` + `guard-ambito-empresa-pedidos` + `guard-aislamiento-integracion` → `3 passed, 35 tests`; `order-sequence-race.int.test.ts` → `2 passed`.
2. **R22 enmendado** (`5b882ef`, `2cdbdb7`). `requirements.md` sin la cláusula de rechazo y con nota de enmienda; `tasks.md > T16` al día. `company-isolation-service.test.ts`: entrada del alta con `companyId`/`company_id` de B y actor de A → resuelve, `create` recibe `{ companyId: A }`, los datos no llevan empresa, B no aparece en ningún argumento. La edición con empresa en la entrada también resuelve. El **listado** con `filters.companyId` sí da `ValidationError` hoy (no es un filtro ofrecido) y el test lo admite solo para el listado.
3. **Listas cerradas** (`7a44560`). Cinco rojos, no dos:
   - `tests/guards/guard-identificador-de-request.test.ts`: `aislamiento-pedidos.spec.ts` en `E2E_ESPERADOS` y `20260915120000_orders_company_scope` en `MIGRACIONES_ESPERADAS`, patrón de `1012f97`.
   - `tests/unit/shared/data-table-alcance.test.ts`: el E2E usa `data-table-row-<id>`; centinela de doce a trece.
   - `tests/unit/recetas-ui/recipe-route-contract.test.ts`: `MIGRACION_QC60` en `DB_PERMITIDAS`, como QC-49 y QC-81.
   - `tests/unit/inventario/scope.test.ts`: `Order` ya declara `companyId`; nueva lista cerrada `MODELOS_YA_AISLADOS_POR_SU_MIGRACION = ['Order']` que exige presencia para esos y ausencia para el resto.
   - Miradas que no aplican: `qc81-alcance.test.ts` (solo mide en la rama de QC-81), `E2E_DE_AISLAMIENTO` de inventario (su patrón no casa), `aviso-base-atrasada.test.ts`, `EXPECTED_FAILING_MIGRATION` y los tests de migración de inventario (miran la suya).
   - Corrida de los 5 archivos: `Test Files 5 passed (5) · Tests 91 passed | 2 skipped (93)` (antes, 5 fallos).
4. **Erratas** (`5b882ef`): «seis `CHECK`» → cinco en `design.md` §0.3, §1 y §7 (con nota de errata) y en `tasks.md > T11`; la fila R15 de `tasks.md` apunta a `order-prisma-errors.test.ts` y al test de integración nuevo.
5. `pnpm typecheck` y `pnpm lint` limpios sobre HEAD.

**Avisos, sin tocar:** `docs/conventions.md` de este worktree no tiene sección «Comentarios» (la regla se aplicó tal como la dio el leader; puede estar solo en `dev`). `lib/modules/inventario/adapters/driven/persistence/presentation-prisma.ts:123` cita que `isDuplicateOrderNumber` reconoce «con el nombre de su indice», ya falso; fuera del módulo, no se tocó. El posible fallo latente de `e2e/aislamiento-inventario.spec.ts` lo anota el leader en *Deudas*.
