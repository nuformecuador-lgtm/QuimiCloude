# QC-59 — aislamiento-por-empresa-en-proveedores · bitácora del implementer

> Rama `feature/QC-59-aislamiento-por-empresa-en-proveedores`, worktree
> `.worktrees/QC-59-aislamiento-por-empresa-en-proveedores`. Spec aprobado por el humano el
> 2026-09-17. Se implementa **por tandas**: cada bloque de `tasks.md` cierra con commit y el
> leader corre `./init.sh --rapido` entre tandas.

## Tanda 1 — Bloque 0 (Base de datos), T0–T5 · 2026-09-17

**Estado: los seis cerrados.** El bloque 1 no se empezó, a propósito: el bloque 0 toca una tabla
de otro módulo (`presentations`) y se para aquí para que el gate lo mire antes de seguir.

### Archivos

| Archivo | Qué |
| --- | --- |
| `db/migrations/20260917120000_suppliers_company_scope/migration.sql` | nuevo — UP entero, pasos 0–8 |
| `db/migrations/20260917120000_suppliers_company_scope/down.sql` | nuevo — DOWN con sus tres guardias |
| `db/schema.prisma` | modificado — `model Supplier`, `model SupplierCatalogLine`, `model Presentation` |
| `specs/QC-59-.../tasks.md` | T0–T5 marcadas `[x]` |

Ningún archivo de `lib/`, `app/`, `components/` ni `tests/` se tocó en esta tanda.

### Qué quedó en la base

- `suppliers.company_id` y `supplier_catalog_lines.company_id`, `UUID NOT NULL`, FK a `companies`
  `ON DELETE RESTRICT ON UPDATE CASCADE`.
- Claves candidatas `suppliers_company_id_id_key` y `presentations_company_id_id_key`,
  `UNIQUE (company_id, id)`. `presentations` no gana ninguna columna ni ningún otro índice.
- FK compuestas `supplier_catalog_lines_company_id_supplier_id_fkey` (CASCADE/CASCADE) y
  `supplier_catalog_lines_company_id_presentation_id_fkey` (RESTRICT/CASCADE). Las dos FK simples
  que ya existían se conservan.
- `suppliers_name_unique` (global, parcial) relevado por `suppliers_company_name_unique`
  `(company_id, name_normalized) WHERE deleted_at IS NULL`. **Sigue siendo parcial.**
- `supplier_catalog_lines_company_id_supplier_id_idx`. El único de la línea
  (`supplier_catalog_lines_name_presentation_unique`) no se tocó.
- RLS `ENABLE` + `FORCE` en las cuatro tablas, sin policies, igual que antes.

### Mapa `R<n> -> cómo se demostró` (esta tanda)

El mapa `R<n> -> test` definitivo de `tasks.md > § Trazabilidad` vive en los bloques 3 y 4, que son
los que escriben los tests. Lo de esta tanda son **comprobaciones ejecutadas contra Postgres real**,
todas dentro de transacciones que terminan en `ROLLBACK`: la base de desarrollo queda intacta.

| R | Cómo se demostró en esta tanda | Resultado |
| --- | --- | --- |
| R1, R2 | columnas `NOT NULL` + FK a `companies` en el catálogo; 0 filas con `company_id IS NULL` | verde |
| R3 | **falsable**: quitada la clave candidata, recrear la FK compuesta falla `42830` | verde, las dos |
| R4 | el `INSERT` y los `UPDATE` de empresa y de proveedor fallan `23503` nombrando su FK | verde |
| R5 | `INSERT` con presentación ajena falla `23503` nombrando su FK; la propia se acepta | verde |
| R7, R8 | 51 / 1 / 114 / 48 filas, idénticas al antes; backfill completo | verde |
| R9 | `relrowsecurity` y `relforcerowsecurity` `true` en las cuatro, sin policies | verde |
| R10 | `down.sql` entero en transacción: retrato de esquema idéntico al de antes del UP | verde |
| R11 | la guardia 2 y la guardia 3 abortan la reversión entera, con recuento y qué hacer | verde |
| R12 | identificadores en inglés; `created_at`/`updated_at`/`deleted_at` intactos | verde |
| R13 | `company_id` de cabeza en `suppliers_company_id_id_key` y en el índice nuevo de la línea | verde |
| R14 | dos empresas sí, la misma dos veces no, y **la baja libera el nombre** | verde |
| R15 | **los tres ángulos, cada uno puesto en rojo por su mutación** (abajo) | verde |
| R17 | el único de la línea no aparece en ninguna sentencia de la migración | verde |

### R15 — la parcialidad, desde tres ángulos independientes y los tres falsables

Lo que el spec exige es que **cada ángulo se ponga rojo si se quita el `WHERE`**. No se afirma: se
mutó y se comprobó que el rojo aparece.

| Ángulo | Afirmación | Mutación | ¿Rojo? |
| --- | --- | --- | --- |
| 1 — texto del SQL | el `CREATE UNIQUE INDEX` del archivo real lleva `WHERE "deleted_at" IS NULL` | copia **en memoria** del archivo sin el `WHERE` | **sí** |
| 2 — catálogo de Postgres | `pg_indexes` dice `(company_id, name_normalized) WHERE (deleted_at IS NULL)` | el mismo predicado contra un índice scratch **total** | **sí** — y verde contra uno parcial equivalente, así que no es placebo |
| 3 — comportamiento | dar de baja un proveedor libera su nombre para su empresa | el índice recreado **sin** el `WHERE` dentro de la transacción | **sí**, `23505` |

Los tres son independientes: el 1 lee el disco, el 2 el catálogo de Postgres, el 3 ejecuta
escrituras. Ninguno se apoya en otro.

### Salidas reales

`pnpm run db:migrate` — `20260917120000_suppliers_company_scope` aplicada, sin error.

`pnpm run lint` — **verde**, sin una sola salida.

`pnpm run typecheck` — **23 errores, todos esperados**: `Property 'companyId' is missing`, en
exactamente los sitios que T6–T13 y los bloques 3–4 van a tocar. Es el criterio de hecho de T0, no
un fallo:

```
15  tests/integration/proveedores/proveedores-constraints.int.test.ts
 2  tests/integration/proveedores/list-query-catalog-lines.int.test.ts
 1  tests/integration/proveedores/list-query-suppliers.int.test.ts
 1  tests/integration/proveedores/catalog-line.int.test.ts
 1  tests/integration/proveedores/supplier-crud.int.test.ts
 1  lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts
 1  lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma.ts
 1  e2e/proveedores.spec.ts
```

> Nota de entorno, no de esta feature: antes de `pnpm exec next typegen` aparecía un
> vigesimocuarto error, `app/layout.tsx: Cannot find name 'LayoutProps'`. Es el worktree recién
> montado sin los tipos de ruta de Next; `init.sh` lo avisa con esas mismas palabras.

No se corrió la suite de tests: esta tanda no escribe ni toca ningún test, y los que cierran este
bloque son T14, T21, T22 y T23, de los bloques 3 y 4. El gate lo corre el leader.

Comprobaciones contra Postgres real — 31 verdes, 0 rojos, todo en transacciones con
`ROLLBACK`:

```

--- T2 - sin la clave candidata la FK compuesta NO se crea ---
  VERDE  sin suppliers_company_id_id_key la FK compuesta falla 42830
        > 42830: no hay restricción unique que coincida con las columnas dadas en la tabla referida «suppliers»
  VERDE  sin presentations_company_id_id_key la FK compuesta falla 42830
        > 42830: no hay restricción unique que coincida con las columnas dadas en la tabla referida «presentations»

--- T3 - las dos FK compuestas rechazan de verdad ---
  VERDE  la linea legitima SI se inserta
  VERDE  INSERT con empresa != la del proveedor falla nombrando su FK compuesta
        > 23503 supplier_catalog_lines_company_id_supplier_id_fkey
  VERDE  INSERT con presentacion de otra empresa falla nombrando su FK compuesta
        > 23503 supplier_catalog_lines_company_id_presentation_id_fkey
  VERDE  UPDATE de la empresa de la linea tampoco la descuelga
  VERDE  UPDATE del proveedor a uno de otra empresa tampoco
  VERDE  UPDATE de la presentacion a una de otra empresa tampoco

--- T4 / R14 - unico por empresa y la baja LIBERA el nombre ---
  VERDE  dos empresas distintas SI pueden tener el mismo nombre
  VERDE  la misma empresa NO puede tenerlo dos veces
  VERDE  ANGULO 3 (comportamiento): dar de baja LIBERA el nombre

--- R15 ANGULO 3 falsable: con el indice TOTAL el escenario se pone ROJO ---
  VERDE  MUTADO (sin WHERE): el angulo 3 se pone ROJO
        > mutado, reintento tras la baja: 23505

--- R15 ANGULO 1 (texto del SQL) ---
  VERDE  ANGULO 1: el archivo real afirma el WHERE
  VERDE  la mutacion en memoria encontro su texto
  VERDE  ANGULO 1 falsable: sobre la copia mutada el predicado se pone ROJO

--- R15 ANGULO 2 (predicado exacto de pg_indexes) ---
        > CREATE UNIQUE INDEX suppliers_company_name_unique ON public.suppliers USING btree (company_id, name_normalized) WHERE (deleted_at IS NULL)
  VERDE  ANGULO 2: el catalogo dice WHERE (deleted_at IS NULL) literal
  VERDE  ANGULO 2 falsable: ROJO sobre un indice TOTAL
  VERDE  ANGULO 2 no es placebo: VERDE sobre un parcial equivalente

--- T5 - el down.sql ENTERO, en transaccion, contra el retrato de antes del UP ---
        > 24 sentencias, 1 bloque(s) DO
  VERDE  el troceador conserva el bloque de guardias en UNA pieza
  VERDE  el troceador no perdio: ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier
  VERDE  el troceador no perdio: ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier
  VERDE  el troceador no perdio: DROP INDEX "suppliers_company_name_unique"
  VERDE  el troceador no perdio: CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("na
  VERDE  el down.sql no tiene ni un DELETE ni un INSERT
  VERDE  el retrato tras el DOWN es IDENTICO al de antes del UP
  VERDE  el DOWN no pierde ni una fila de las cuatro tablas
  VERDE  control anti-placebo: con el UP aplicado el retrato SI difiere

--- T5 - el DOWN ABORTA ante dato que no podria revertir ---
  VERDE  GUARDIA 2: un proveedor de otra empresa aborta el DOWN
        > suppliers_company_scope down: hay 1 proveedor(es) que pertenecen a una empresa distinta de la que escribio el UP (0d1e300c-9e02-4d35-b038-1a407b837873
  VERDE  la mutacion desactivo las dos ramas de la guardia 2
  VERDE  GUARDIA 3: mismo nombre vivo en dos empresas aborta el DOWN
        > suppliers_company_scope down: hay 1 nombre(s) normalizado(s) compartido(s) por proveedores VIVOS de mas de una empresa, repartidos en 2 fila(s) de `su
  VERDE  anti-placebo: sin nombre duplicado el DOWN mutado NO aborta

== 31 verdes, 0 rojos ==
```

El retrato de esquema se tomó **antes** de aplicar la migración y se comparó contra el que deja el
`down.sql` ejecutado entero: columnas, índices con su `indexdef` literal, restricciones con su
`pg_get_constraintdef`, RLS y policies de las cuatro tablas. El molde —troceador de sentencias,
retrato, mutación en memoria— es el de `tests/integration/recetas/company-scope.int.test.ts`
(el describe de R6), reutilizado tal cual.

### Un hallazgo sobre las guardias del DOWN, para el reviewer

**La guardia 3 es inalcanzable mientras la guardia 2 esté delante.** Cualquier dato que dispare la
3 —dos proveedores vivos de empresas distintas con el mismo nombre— implica que hay un proveedor de
otra empresa, que es exactamente lo que la 2 detecta primero. Para probar la 3 por separado hubo
que **desactivar la 2 en memoria**, nunca en el archivo.

No es un defecto y no se corrige: es lo mismo que pasa en el `down.sql` de QC-50, cuyo test hace la
misma mutación (`GUARDIA_2_DESACTIVADA`, `GUARDIA_2_Y_3_DESACTIVADAS`), y el orden de las tres lo
fija el spec. Se deja escrito porque el test de integración del bloque 4 (T23) tiene que replicar
esa mutación o la guardia 3 quedará cubierta solo en apariencia.

### Higiene de commits

Ningún mensaje de commit de esta rama contiene la cadena `QC-44`: las dos guardias que filtran por
esa marca (`guard-convenciones-proveedores`, `guard-herencia-armazon-privado`) se atribuirían el
árbol de trabajo entero si lo hiciera. Es la task T27 y sigue viva.

### Lo que NO se hizo, y queda para las tandas siguientes

- Los bloques 1–5 enteros (T6–T38): dominio, puertos, persistencia, listas cerradas, tests y E2E.
- Los tests que cierran formalmente el mapa `R<n> -> test` de este bloque
  —`suppliers-company-scope-migration.test.ts`, `proveedores-constraints.int.test.ts`,
  `company-scope.int.test.ts`, `list-query-indexes.int.test.ts`— son T21, T22, T23 y T14. Lo de
  esta tanda los **anticipa**, no los sustituye.
- El gate: lo corre el leader.

## Tanda 2 — Bloques 1 y 2 completos, más T16 · 2026-09-17

**Estado: T6, T7, T8, T9, T10, T11, T12, T13 y T16 cerradas.** Se para aquí por encargo: nada
del resto del bloque 3, nada del 4, nada del 5.

El criterio del corte era que el árbol volviera a compilar y las guardias volvieran a verde.
**Los dos se cumplen**: `typecheck` verde, `lint` verde, y los 38 archivos de `tests/guards/`
verdes (440 tests), incluido el censo `MIGRACIONES_ESPERADAS` que T16 cierra.

### Archivos

| Archivo | Task | Qué |
| --- | --- | --- |
| `lib/modules/proveedores/domain/supplier-scope.ts` | T6 | **nuevo** — el tipo del ámbito, dominio puro |
| `lib/modules/proveedores/domain/actor.ts` | T6 | `Actor` gana `companyId`. Sin imports nuevos |
| `lib/modules/proveedores/index.ts` | T6 | reexporta `SupplierScope` |
| `lib/modules/proveedores/ports/supplier-repository.ts` | T7 | los **5** métodos exigen `scope` al final |
| `lib/modules/proveedores/ports/supplier-catalog-repository.ts` | T7 | los **4** métodos exigen `scope` al final |
| `lib/modules/proveedores/domain/*-supplier.ts` y `list-suppliers.ts` | T8 | construyen el ámbito tras `requirePermission` y lo pasan al puerto |
| `lib/modules/proveedores/domain/create-catalog-line.ts`, `update-catalog-line.ts` | T8 | además: `units: UnitCatalog` en sus `*Deps` y la resolución de la unidad |
| `lib/modules/proveedores/domain/delete-catalog-line.ts`, `list-catalog-lines.ts` | T8 | pasan el ámbito, sin dependencia nueva |
| `.../driven/persistence/company-scope.ts` | T9 | **nuevo** — el único punto de consulta |
| `.../driven/persistence/supplier-prisma.ts` | T10 | las cinco operaciones acotadas |
| `.../driven/persistence/supplier-catalog-line-prisma.ts` | T11 | las seis acotadas, **incluida `isSupplierAlive`** |
| `.../driving/supplier-actions.ts`, `supplier-catalog-actions.ts` | T12 | `currentActor()` con las dos caras de la sesión dentro de `runInRequestScope` |
| `lib/composition/index.ts` | T13 | `units: unitCatalog` en las dos factories de línea |
| `tests/guards/guard-identificador-de-request.test.ts` | T16 | la migración de esta ficha entra en `MIGRACIONES_ESPERADAS` |
| cinco tests unitarios de `tests/unit/proveedores/` | — | reparación **mecánica** para que compilen |
| cinco tests de `tests/integration/proveedores/` | — | reparación **mecánica** |
| `e2e/proveedores.spec.ts` | — | `companyId` en el seed de Prisma |

`lib/modules/unidades/**` **no se tocó**: `UnitCatalog.findRefs` ya llegaba acotada. Ningún
componente de `app/` se tocó. Ningún archivo de `db/` se tocó en esta tanda.

### Los cinco puntos que el encargo exigía dejar bien, y cómo quedaron

1. **El ámbito es OBLIGATORIO en los nueve métodos.** Un barrido buscando el ámbito declarado
   como opcional sobre los dos puertos no devuelve nada: ni opcional, ni con valor por defecto.
   Va **al final** de la firma en los nueve, así que ninguna llamada existente cambió de orden
   de argumentos. La red del compilador sigue en pie: una llamada que lo omita no compila.
2. **`isSupplierAlive` está acotada**, que era el punto que más fácil se escapaba por no ser
   método de ningún puerto: su `where` compone `supplierCompanyScope(scope)` junto a
   `deletedAt: null`. Sus dos llamantes —el alta de línea y el listado del catálogo— le pasan
   el ámbito.
3. **La costura hacia `unidades` es la única nueva.** Un barrido por `findRefs` en
   `lib/modules/proveedores/` devuelve exactamente dos líneas, en `create-catalog-line.ts` y
   `update-catalog-line.ts`, las dos contra `deps.units` con `actor.companyId` y las dos
   **solo cuando la entrada trae unidad**. La ausencia de unidad sigue siendo válida. La
   semántica «de sistema o de la empresa» no se reescribe aquí: la pone `unidades`.
4. **No nace ningún puerto ni import hacia `inventario`.** Un barrido por el prefijo de import
   de `inventario` en `lib/modules/proveedores/` devuelve **vacío**. Tampoco hay ninguna
   consulta. La presentación la sigue acotando la FK compuesta de la base.
5. **El filtro vive en UN ÚNICO punto.** `company-scope.ts` tiene una función privada
   `companyScope` y tres envolturas que **delegan todas en ella** —existen solo para tipar—.
   Un barrido por `companyId` sobre los dos adaptadores driven no devuelve ni una ocurrencia
   fuera de esas envolturas: ninguna consulta ni escritura escribe la condición a mano. **Sin
   lista de excepciones**, y no se creó ninguna.

### La convención de comentarios, corregida antes de commitear

La primera pasada de los docblocks **amplió conjuntos de citas de requisito preexistentes** en
siete archivos de producción: donde la cita nombraba un requisito, pasó a nombrar tres. Eso
incumple `docs/conventions.md > Comentarios`, que prohíbe citarlos en el código que esta ficha
escriba o modifique. Se revirtió cada conjunto a lo que decía antes de esta rama y el sentido
nuevo quedó **expresado con palabras**. Las citas que ya existían y que esta ficha solo arrastró
al reflujar un párrafo se conservan literalmente: `design.md > 13` dice expresamente que no se
reescriben en masa. Los **dos archivos nuevos** no contienen ninguna cita.

### Salidas reales

```
pnpm run typecheck   -> VERDE, sin una sola salida (venia de 23 errores + 31 mas que abrio T6-T8)
pnpm run lint        -> VERDE, sin una sola salida
pnpm test tests/guards/guard-identificador-de-request.test.ts
                     -> Test Files 1 passed (1) | Tests 23 passed (23)
pnpm test tests/guards/
                     -> Test Files 38 passed (38) | Tests 440 passed | 5 skipped (445)
pnpm test tests/unit/proveedores/
                     -> Test Files 3 failed | 11 passed (14) | Tests 9 failed | 162 passed (171)
pnpm test tests/integration/proveedores/
                     -> Test Files 1 failed | 4 passed (5) | Tests 2 failed | 78 passed (80)
```

No se corrió la suite completa: el gate lo corre el leader.

### Los 11 rojos que quedan, todos del bloque 3 y ninguno tapado

Ninguno está en `tests/guards/`. Son **listas cerradas** de `design.md > 0.10`, cada una con su
task explícita en el bloque 3, que esta tanda no debía tocar:

| Rojo | Lista | Task | Desde cuándo |
| --- | --- | --- | --- |
| `proveedores-schema.test.ts` (4) | `SUPPLIER_COLUMNS`, `SUPPLIER_CATALOG_LINE_COLUMNS`, `CROSS_MODULE_SCALARS` | **T20** | bloque 0: `companyId` entró en los dos modelos |
| `scope.test.ts` censo de campos (1) | campos de `model Supplier` y de `model SupplierCatalogLine` | **T18** | bloque 0, mismo motivo |
| `scope.test.ts` marcas (1) | `MARCAS_DE_INVENTARIO` | **T19** | **esta tanda**, y estaba **previsto**: es el falso positivo que `design.md > 6.3` anticipó al detalle — la marca por la palabra suelta `findRefs` es genérica y se pone roja por la costura legítima hacia `unidades`. Se **retensa**, no se relaja |
| `module-contract.test.ts` (3) | `ADAPTADORES_CON_ORM` | **T23** | **esta tanda**: `company-scope.ts` es el tercer archivo del módulo que tipa un `WhereInput` de Prisma. También previsto (`design.md > 0.10`, fila 13: «de dos a tres archivos») |
| `proveedores-constraints.int.test.ts` (2) | censo de columnas y censo de FK de las dos tablas | **T21** | bloque 0: las columnas y las cuatro FK nuevas |

Los cuatro rojos **nuevos** de esta tanda los predijo el spec nombre por nombre antes de
escribirse una línea. No se ha relajado ninguna lista ni se ha añadido ninguna excepción: se dan
de alta a mano en el bloque 3, que es donde el spec las pone.

### Dos matices de los arreglos mecánicos de tests, para el reviewer

1. **`rawInsert` de `proveedores-constraints.int.test.ts` inyecta la columna de empresa** cuando
   la llamada no la trae, en vez de repetirla en unas catorce llamadas sueltas. Es una función
   de apoyo del test, no de producción, y ningún caso de ese archivo ejercita la ausencia de esa
   columna —eso vive en `company-scope.int.test.ts`, que es T29/T30 y no existe todavía—.
2. **`rawInsertLine` de `catalog-line.int.test.ts` pasó a ser `async`**: resuelve la empresa de
   la línea a partir del proveedor real en vez de asumir una empresa fija, para que la FK
   compuesta nueva no rechace inserts que antes de esta ficha eran válidos.

### Nada que contradiga el spec

No hay ningún hallazgo que obligue a contradecir una decisión cerrada. La tabla de 19 decisiones
no se tocó. No entró ninguna dependencia de terceros. Ningún mensaje de commit de esta rama
contiene la marca que las dos guardias del diff filtran (T27 sigue viva).

### Lo que NO se hizo

- El resto del bloque 3 (T14, T15, T17-T25), el bloque 4 y el bloque 5 enteros. En particular el
  E2E `aislamiento-proveedores.spec.ts` (T31) y los tests que cierran formalmente el mapa
  `R<n> -> test` de los bloques 1 y 2.
- El gate: lo corre el leader.
