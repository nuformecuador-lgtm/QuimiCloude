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

---

## Tanda 3 — Bloque 3: las listas cerradas (T14–T26)

Fecha: 2026-09-17. Regla que gobernó la tanda entera, fijada por el humano: **cada lista se
TENSA, nunca se afloja**. Cero `toEqual` degradados a `toContain`, cero listas de excepciones
nuevas, cero censos sustituidos por una marca más laxa. Toda alta va a mano, nombrada una a una
y con el motivo escrito; los motivos nuevos no citan `QC-<n>`, `R<n>` ni `design.md`
(`docs/conventions.md > Comentarios`), y los `R<n>` siguen viviendo solo en los **nombres** de
los tests.

### Tasks cerradas

`T14`, `T15`, `T19`, `T20`, `T21`, `T22`, `T23`, `T24`, `T26`. (`T16` ya venía cerrada de la
tanda 1.) `T18` queda **parcial**: (b), (c) y (d) hechas; (a) abierta. `T17`, `T25`, `T27` y
`T28` no se cierran — ver «Lo que no se pudo cerrar».

### Los rojos que había al empezar, y en qué quedaron

El leader contó **11**. Al medirlos uno a uno eran **13**: los dos que faltaban son
`tests/unit/identity/session-once-per-request-actions.test.ts` (el caso «TODO archivo de
`driving/` con las dos caras está en la lista», rojo desde T12 de la tanda 2 → **T24**) y
`tests/integration/inventario/list-query-indexes.int.test.ts` (el caso «los índices que ya
existían siguen todos ahí», rojo desde T4 porque `suppliers_name_unique` fue relevado → **T14**).
Los **13 están en verde**.

| Rojo | Task | Cómo quedó |
| --- | --- | --- |
| `proveedores-schema.test.ts` (4) | T20 | verde |
| `scope.test.ts` censo de campos (1) | T18 b/c | verde |
| `scope.test.ts` `MARCAS_DE_INVENTARIO` (1) | T19 | verde, y falsable |
| `module-contract.test.ts` (3) | T23 | verde |
| `proveedores-constraints.int.test.ts` (2) | T21 | verde (30/30) |
| `session-once-per-request-actions.test.ts` (1) | T24 | verde (34/34) |
| `list-query-indexes.int.test.ts` (1) | T14 | verde |

### T19 — la retensada, y su falsabilidad EJECUTADA

La marca de la palabra suelta `findRefs` se ponía roja por un vínculo que no existe: la costura
legítima del módulo es hacia `unidades`. **No se borró y no se le puso excepción**: salió
partida en dos comprobaciones **más estrictas** que la que había.

1. **Negativa, afinada**: pasa a exigir la forma real del vínculo —el receptor `products` o
   `productCatalog` seguido del método—, no la palabra suelta. La marca de tipo
   `ProductCatalog` / `ProductRef` / `ProductId` no se tocó.
2. **Positiva, nueva**: `RECEPTOR_DE_FIND_REFS = 'units'`. El caso recorre **todas** las
   apariciones de `findRefs` de `lib/modules/proveedores/**` y exige que el receptor inmediato
   sea exactamente `units`. Antes el conjunto permitido era «todo lo que no se llame así»; ahora
   es **uno y con nombre**, y un `findRefs` sin receptor también cae.

**Falsabilidad ejecutada, y salió ROJA**. Escribiendo a mano una llamada con receptor `products`
en `lib/modules/proveedores/domain/create-catalog-line.ts`, el caso cayó con **dos** hallazgos a
la vez: «resolucion de referencias contra el catalogo de articulos» (la mitad negativa) y
«findRefs con receptor 'products'; el unico admitido es 'units'» (la mitad positiva).

Prueba extra de que la positiva **no** es redundante: con un receptor `catalog`, que la marca
negativa no conoce, el caso **sigue cayendo** por la mitad positiva. Con la costura real hacia
`units`: **7/7 verde**. La sonda se revirtió con `git checkout --`; ni `lib/` ni `db/` aparecen
en `git status`.

### T14 — el relevo del único, y su falsabilidad

`suppliers_name_unique` sale de `PRE_EXISTING_INDEXES` **dejando en su sitio el comentario de
relevo**, con el mismo formato que los de presentaciones, unidades y recetas. Entra un caso
nuevo calcado del de recetas: `suppliers_company_name_unique` existe, es `UNIQUE`, lleva
`company_id` de cabeza y **es parcial exigiendo el predicado literal** `WHERE (deleted_at IS
NULL)`, no un `WHERE` genérico. La falsabilidad queda **escrita dentro del test**: recorta el
`WHERE` del `def` real en memoria y afirma que el recorte cambia el predicado y no las columnas,
de modo que la aserción mide el predicado y no otra cosa.

Nota honesta: la prueba «de verdad» —borrar el `WHERE` en `migration.sql`, correr y revertir— no
se ejecutó porque el clasificador del entorno bloqueó la edición in-place del SQL. Se cubrió
simulando el `def` que produciría la migración sin `WHERE`, que da rojo con el mensaje esperado.

### T15 — CONTRADICCIÓN CON EL SPEC, resuelta hacia el lado que tensa

`tasks.md` T15 pedía «la misma baja y la misma alta que T14, pero sobre el texto». **La baja
habría aflojado la lista.** Esta `PRE_EXISTING_INDEXES` no dice que los índices existan: alimenta
el caso «no recrea ni borra ningún índice que ya existía», que afirma que el **texto** del UP y
del DOWN de la migración de QC-57 **no los nombra**. De `suppliers_name_unique` eso sigue siendo
cierto, y es el precedente del propio archivo: `presentations_name_normalized_key`,
`units_name_normalized_key`, `recipes_name_unique`, `products_unit_id_idx` y `orders_unit_id_idx`
siguen en la lista con sus índices ya relevados.

Lo hecho: `suppliers_name_unique` **se queda**, y **entran tres** altas nombradas una a una —
`suppliers_company_name_unique`, `suppliers_company_id_id_key` y
`supplier_catalog_lines_company_id_supplier_id_idx`—, que la migración de QC-57 tampoco puede
nombrar. Docblock reescrito para que la lista diga lo que de verdad afirma; esa descripción
equivocada es justo lo que indujo la instrucción del spec. **`tasks.md` queda anotado con la
corrección.**

### Los puntos de anclaje tocados: 22, y 7 que el spec no nombraba

El spec anticipó catorce (`design.md > 0.10`). En esta tanda se tocaron **22** puntos de anclaje
—18 listas propiamente dichas más cuatro aserciones y docblocks que la tanda habría dejado
mintiendo—, de los cuales **siete no estaban previstos**. Ninguno se tapó ni entró de rondón:
todos quedan cerrados y con motivo escrito.

| # | Lista | Archivo | ¿La nombraba el spec? |
| --- | --- | --- | --- |
| 1 | `PRE_EXISTING_INDEXES` (integración) | `tests/integration/inventario/list-query-indexes.int.test.ts` | sí (1) |
| 2 | `PRE_EXISTING_INDEXES` (unit) | `tests/unit/inventario/schema/list-query-indexes-migration.test.ts` | sí (2), con la letra corregida |
| 3 | campos de `model Supplier` | `tests/unit/proveedores/scope.test.ts` | sí (6) |
| 4 | campos de `model SupplierCatalogLine` | `tests/unit/proveedores/scope.test.ts` | sí (7) |
| 5 | migraciones que tocan las dos tablas | `tests/unit/proveedores/scope.test.ts` | sí (8) |
| 6 | `MARCAS_DE_INVENTARIO` | `tests/unit/proveedores/scope.test.ts` | sí (9) |
| 7 | `SUPPLIER_COLUMNS` | `tests/unit/proveedores/schema/proveedores-schema.test.ts` | sí (10) |
| 8 | `SUPPLIER_CATALOG_LINE_COLUMNS` | idem | sí (10) |
| 9 | `CROSS_MODULE_SCALARS` | idem | sí (10) |
| 10 | censo de columnas de la línea | `tests/integration/proveedores/proveedores-constraints.int.test.ts` | sí (11) |
| 11 | censo de `CHECK` (no cambia, y se afirma) | idem | sí (11) |
| 12 | censo de FK de las dos tablas | idem | sí (11) |
| 13 | `MODELOS_YA_AISLADOS_POR_SU_MIGRACION` | `tests/unit/inventario/scope.test.ts` | sí (12) |
| 14 | `ADAPTADORES_CON_ORM` | `tests/unit/proveedores/module-contract.test.ts` | sí (13) |
| 15 | `ACCIONES` | `tests/unit/identity/session-once-per-request-actions.test.ts` | sí (14) |
| **16** | aserción «`Supplier` no tiene ningún `@@unique`» | `tests/unit/proveedores/schema/proveedores-schema.test.ts:257` | **NO** |
| **17** | censo `indexMaps` de las dos tablas | idem, `:616` | **NO** |
| **18** | censo de `adapters/driven/` | `tests/unit/proveedores/module-contract.test.ts:274` | **NO** |
| **19** | censo de campos de la línea por `Prisma.dmmf` | idem, `:578` | **NO** |
| **20** | censo de columnas de `suppliers` | `proveedores-constraints.int.test.ts` | **NO** — *no existía*, se creó cerrado |
| **21** | censo de índices de las dos tablas | idem | **NO** — *no existía como lista cerrada*, se cerró |
| **22** | docblock de `PRE_EXISTING_INDEXES` (unit) | `list-query-indexes-migration.test.ts` | **NO** |

Detalle de los que no estaban previstos:

- **La aserción «`Supplier` no tiene ningún `@@unique`»** dejó de sostenerse al ganar el modelo
  su clave candidata. **No se borró ni se relajó: se tensó** a un censo `toEqual` de los
  `@@unique` del cuerpo —exactamente uno, la pareja `(companyId, id)`— más las dos aserciones
  explícitas de que no hay `@unique` sobre `name` ni sobre `nameNormalized`, que era lo que el
  caso protegía. La gemela de `SupplierCatalogLine` **quedó intacta**, y eso es la prueba en el
  gate de que la unicidad de la línea sigue siendo el índice parcial.
- **`indexMaps`**, **censo de `adapters/driven/`** y **censo por `Prisma.dmmf`** — altas a mano
  con motivo, `toEqual` intacto.
- **Censo de columnas de `suppliers`** — `proveedores-constraints.int.test.ts` **no tenía**
  censo cerrado de esa tabla, solo un subconjunto de dos columnas. Se creó cerrado (11 columnas,
  con `company_id` y su `uuid`/`NOT NULL`) en vez de dejar la columna nueva sin vigilancia.
- **Censo de índices** — tampoco existía como lista cerrada: eran tres `toContain` y dos
  `not.toContain` sobre una sola tabla. Se cerró a `toEqual` sobre las **dos** (23 nombres
  verificados contra `pg_indexes`), con los tres nuevos comentados uno a uno y el comentario de
  relevo de `suppliers_name_unique` explicando por qué no aparece. Los `toContain` viejos se
  conservan: dicen *por qué* esos tres tienen que estar.

### T26 — el barrido

Corregidas (reescrita la frase, no borrado el comentario):
`tests/unit/inventario/scope.test.ts` (bloque «AMPLIACION … EL ALCANCE DE LA MIGRACION» y el
docblock de `TABLAS_FUERA_DE_ALCANCE`) y
`tests/unit/inventario/schema/inventory-company-scope-migration.test.ts` (docblock de
`touchesNoOtherModuleTable`). Las dos ahora dicen que la ficha anotada es una **frontera**, no un
«todavía sin empresa», y que `suppliers`/`supplier_catalog_lines` ya la tienen desde su propia
migración. Lo que esas listas **miden** —que la migración de inventario no toca esas tablas—
sigue intacto y no se aflojó.

**No editado, a propósito**: `db/migrations/20260911130000_inventory_company_scope/migration.sql:35`
sigue anunciando esas dos tablas como trabajo de otra ficha. Es una **migración ya aplicada** y
no se edita; se corrigió el test que la refleja y queda constancia aquí.
Barrido ampliado al resto del repo (fuera de `specs/`, `progress/`, `node_modules/`): sin más
hallazgos. `docs/architecture.md:34` **no se tocó** — es T28.

### Lo que no se pudo cerrar, y por qué

- **T17 (`E2E_ESPERADOS`)** y **T18 (a) (censo de E2E de `scope.test.ts`)**: las dos listas se
  comparan **contra el disco**. Dar de alta `aislamiento-proveedores.spec.ts` antes de que el
  archivo exista las pondría **rojas**. El archivo lo crea **T31 (bloque 4)**. El spec dice
  «Depende de: T22» en las dos; es una **errata**: T22 es `MODELOS_YA_AISLADOS`, y la
  dependencia real es T31.
- **T25 (`tests/integration/aislamiento.json`)**: no hay todavía ningún archivo nuevo bajo
  `tests/integration/proveedores/**` que declarar. Los crean **T29 y T30 (bloque 4)**.
- **T27** y **T28**: fuera del encargo de esta tanda.

### Salidas reales

```
pnpm run typecheck   -> VERDE, 0 errores
pnpm run lint        -> VERDE, 0 errores

npx vitest run tests/unit/proveedores/ tests/unit/inventario/
               tests/unit/identity/session-once-per-request-actions.test.ts
  -> Test Files 51 passed (51) | Tests 779 passed | 3 skipped (782)

npx vitest run tests/integration/proveedores/ tests/integration/inventario/
  -> Test Files 16 passed (16) | Tests 224 passed (224)

pnpm run test:guardias
  -> Test Files 44 passed (44) | Tests 504 passed | 9 skipped (513)
```

No se corrió la suite completa: el gate lo corre el leader.

### Nada que contradiga una decisión cerrada

La tabla de 19 decisiones no se tocó. No entró ninguna dependencia de terceros. Ningún archivo de
producción se modificó en esta tanda (las dos sondas de falsabilidad se revirtieron). Ningún
mensaje de commit de esta rama contiene la marca que las dos guardias del diff filtran, así que
T27 sigue viva. La única contradicción con el spec es la de **T15**, resuelta hacia el lado que
tensa y anotada en `tasks.md`.

---

## Tanda 4 — Bloque 4 completo (T29–T35) más las tres tasks que lo esperaban (T17, T18(a), T25) · 2026-09-17

**Encargo**: el bloque 4 entero, incluido el E2E, y el cierre de las tres listas que la tanda 3
dejó abiertas a propósito porque declaraban archivos que este bloque crea. Nada del bloque 5.

**Ningún archivo de producción se tocó en esta tanda.** `git status` solo muestra `tests/`, `e2e/`
y los dos `.md` del arnés. Ninguna dependencia de terceros entró: `package.json` y
`pnpm-lock.yaml` quedan sin tocar.

### La comprobación previa que el encargo exigía: el diálogo de borrado SÍ es ejercitable

En QC-50 el intento de borrado cruzado resultó **no ejercitable**: el diálogo de recetas toma el id
del cierre de React y no hay nodo del DOM que reescribir, y hubo que enmendar el requisito con
aprobación humana. **Aquí no hace falta**: se leyó el código antes de escribir una sola línea de
test y `app/(private)/proveedores/components/delete-supplier-dialog.tsx` lleva un
`input type="hidden" name="id" defaultValue={supplier.id} data-testid="delete-supplier-id"`
dentro de su `form action={formAction}`, igual que `delete-product-dialog.tsx` y
`delete-order-dialog.tsx`. El gesto del paso 3 de `design.md > 8.3` es real y se hizo.
**No se enmendó nada del spec y no se pidió excepción.**

### T29 — `tests/integration/proveedores/company-scope.int.test.ts` (nuevo, 24 casos)

Calcado de `tests/integration/recetas/company-scope.int.test.ts`. Cubre R1, R2, R3, R4, R5, R7, R8,
R10, R11, R14, R15 (ángulo 3), R34.

- R4 nombra `supplier_catalog_lines_company_id_supplier_id_fkey`, y no solo en el `INSERT`: también
  en **los dos caminos por `UPDATE`** (cambiar la empresa de la línea y cambiar su proveedor), que
  es lo que R4 exige al decir «no debe existir ningún camino».
- R5 nombra `supplier_catalog_lines_company_id_presentation_id_fkey`, con la presentación propia
  **aceptada** como control positivo.
- **R15 ángulo 3 quedó aislado a propósito**: el caso «dar de baja libera el nombre» no lee
  `pg_indexes` ni el texto del SQL, y lo dice en un comentario. Los otros dos ángulos siguen en
  `list-query-indexes.int.test.ts` (predicado) y en el test de esquema (texto). Si uno se apoyara en
  otro, la trampa del `WHERE` volvería a poder colarse sin un test en rojo.
- R7/R8: los dos backfills se ejecutan **leídos del disco**. El de líneas se prueba con un proveedor
  que **no** es «QuimiCloud»: si derivara la empresa por nombre en vez de del proveedor, la FK
  compuesta lo cazaría. Recuentos de las cuatro tablas idénticos antes/después.
- R11: la reversión aborta por **cada una** de sus causas (guardia 1; guardia 2 en sus dos mitades,
  aisladas mutando la otra en memoria; guardia 3), **más dos controles anti-placebo**: el bloque real
  no aborta sobre una base sin dato que estorbe, y con las guardias 2 y 3 desactivadas el mismo dato
  pasa. Sin eso, un «abortó» podría ser un `RAISE` incondicional.
- R10: el `down.sql` se ejecuta **entero**, con una comprobación de que el troceador no perdió
  ninguna de las diez sentencias clave ni partió el bloque `DO`, y los dos retratos se comparan
  contra `information_schema.columns`, `pg_indexes` (con el `indexdef` literal) y `pg_constraint`
  (con `pg_get_constraintdef`).

**Un punto donde no se pudo nombrar UNA restricción exacta**, y queda dicho en vez de disimulado:
la línea con **empresa inexistente** incumple a la vez la FK simple a `companies` y las dos
compuestas, y cuál de los tres salta primero lo decide el catálogo, no el test. Se dejó como
conjunto **cerrado y explícito de tres nombres** —el rechazo tiene que venir de una de las tres
restricciones de empresa de esa tabla y de ninguna otra— con el porqué escrito. No es una lista
aflojada: no existía antes, y los dos casos deterministas (R4 y R5) sí nombran su FK exacta porque
el dato está montado para que solo una sea violable.

### T30 — `tests/integration/proveedores/company-scope-queries.int.test.ts` (nuevo, 28 casos)

Cubre R16, R19, R25, R26, R27, R28, R29, R30, R31, R35. Los dos listados y sus `total`; búsqueda y
filtros que no ensanchan, con control positivo desde la otra empresa; `findAliveById`, `updateAlive`
y `softDeleteAlive` ajenos devuelven «no existe» con la fila ajena releída entera **con sus
líneas**; `listBySupplierAlive` ajeno devuelve `'supplier_not_found'` **idéntico al de un id
inexistente**; la baja arrastra **solo** las líneas de su empresa, con el **mismo `deleted_at`**
comparado por `getTime()`; `findUnitRefs` acotada (sistema sí, propia sí, ajena no); y el retrato
con y sin `FORCE ROW LEVEL SECURITY` sobre las dos tablas, restaurado en `finally`.

**Dato medido que `design.md > 0.8` daba por deducción**: el `meta.target` real del `23505` del
índice compuesto es `['company_id', 'name_normalized']`. El test lo afirma por los dos literales y
además que `isUniqueNameViolation(error)` sigue devolviendo `true`. Ya no es una deducción.

### T31 — `e2e/aislamiento-proveedores.spec.ts` (nuevo) · **EL REQUISITO, NO UN EXTRA**

La decisión 16 lo exige porque un fallo aquí es una **fuga de datos entre clientes**. Un solo test
encadenado con los cuatro pasos de `design.md > 8.3`, cada negativo con su control positivo —sin
ellos, un aislamiento roto por exceso (una lista siempre vacía, un borrado que nunca funciona) daría
verde—. Molde de `e2e/aislamiento-pedidos.spec.ts`: prefijo por worker, limpieza defensiva de
huérfanos con una hora de antigüedad mínima, **una sola sesión real** (la de A, con hash bcrypt de
verdad), los datos de B sembrados con Prisma, y el aterrizaje del login por el helper único
`e2e/helpers/landing.ts`. **Ningún componente se tocó.**

1. **Listado**: se filtra por un token que casa con las filas de A **y** de B, así que la ausencia no
   puede venir del filtro. Se afirma contra el HTML servido y contra el DOM, con el proveedor de A
   presente como control positivo.
2. **Detalle**: se recoge el estado, el texto del alert, el enlace y el `data-code` para el id de B
   y para un UUID que no existe en ninguna empresa, y se comparan con `toEqual`. **No hay ni un
   literal de copy en el test**: la indistinguibilidad se prueba contra la pantalla real del
   inexistente.
3. **Baja cruzada**: se abre el diálogo de un proveedor **propio de A**, se afirma que el campo
   oculto trae de serie el id de A, y se sustituye por DOM por el de B. La sustitución se **repite en
   la fase de captura del `submit`** —React reescribe `defaultValue` en cada re-render, y sin eso el
   `POST` sale con el id propio y el verde es falso— y se **espera la petición** comprobando que el
   identificador ajeno viajó de verdad. Rechazo; y con Prisma, foto antes/después campo a campo: el
   proveedor de B y su línea idénticos y con `deleted_at` nulo, y el de A tampoco dado de baja.
   Control positivo: la misma sustitución con el id propio **sí** da de baja y arrastra su línea.
4. **Alta con el nombre de B**: por la UI, sin error, y en base exactamente un proveedor vivo en A
   con ese nombre y con id distinto del de B.

**El fixture deja la base como la encontró.** El `afterAll` borra por el token de **este** worker
—nunca por el prefijo pelado, que se llevaría filas de la ejecución viva del otro navegador— en el
orden que exigen las FK, **que ahora incluye las dos compuestas nuevas**: líneas → proveedores →
presentaciones → unidades → usuario → empresas; acumula el primer fallo y **afirma** que el recuento
de sobrantes en las seis tablas es 0 antes de relanzarlo. Comprobado además desde fuera tras las dos
ejecuciones: los seis recuentos a cero.

### T32–T35

- **T32** `tests/unit/proveedores/schema/suppliers-company-scope-migration.test.ts` (nuevo, 15
  casos). **R15 ángulo 1 ejecutado**: el predicado se evalúa sobre el archivo real (**verdadero**) y
  sobre una copia **en memoria** sin el `WHERE "deleted_at" IS NULL` (**falso**), con
  `expect(mutado).not.toBe(original)` para que una mutación que no se aplicara no pasara por buena.
  Mismo patrón para una veintena más de mutaciones (único no relevado, empresa en la cola, `DEFAULT`,
  `CASCADE`, `ENABLE` sin `FORCE`, policy, identificador en castellano, `presentations` tocada de
  más, `DELETE`/`INSERT`/`TRUNCATE`, candidatas antes o después de las FK).
- **T33** `tests/guards/guard-ambito-empresa-proveedores.test.ts` (nuevo, 29 casos), calcada de la de
  recetas: método a método de los dos puertos y **función a función** de todo
  `adapters/driven/persistence/`, con caso explícito para `isSupplierAlive`, **sin lista de
  excepciones** y con un caso que afirma que no existe ninguna (R24).
- **T34** `company-isolation-service.test.ts` (nuevo, 52 casos) y `company-scope.test.ts` (nuevo, 10
  casos), más la ampliación de seis archivos existentes (`authorization`, `supplier-service`,
  `catalog-service`, `list-use-cases`, `supplier-actions`, `catalog-line-fk`). Solo altas: nada
  removido, ningún `toEqual` degradado.
- **T35** `catalog-line-image-scope.test.ts` (nuevo, 7 casos): la ruta no lleva la empresa, el enlace
  sigue siendo público, y la ruta llega al puerto byte a byte igual a la que entró.

### La falsabilidad de T33, EJECUTADA

Se quitó a mano `scope: SupplierScope` y la composición con `supplierCompanyScope(scope)` de
`findAliveSupplierById` en `supplier-prisma.ts`. La guardia cayó con **dos** fallos —el caso por
método y el barrido por archivo—. **Sonda revertida** con `git checkout --` del archivo; `git status`
no muestra nada bajo `lib/` y la guardia vuelve a 29/29 en verde.

**La falsabilidad de T30 NO se pudo ejecutar**, y se dice en vez de darse por hecha: la sonda
requería mutar `supplierCompanyScope` (producción) y el clasificador del entorno bloqueó la edición,
igual que en la tanda 3 con el SQL. Lo que el archivo sí tiene por construcción es falsabilidad
cruzada: «A ve sus tres y ninguno de B» y «B ve sus dos y ninguno de A» no pueden estar las dos
verdes si el ámbito se ignorara —los dos listados darían cinco—, y lo mismo con cada par
negativo/control positivo de las escrituras.

### T17, T18(a) y T25 — las tres que esperaban a este bloque

- **T17** `tests/guards/guard-identificador-de-request.test.ts`: alta de
  `'aislamiento-proveedores.spec.ts'` en `E2E_ESPERADOS`, a mano y en su sitio alfabético, con
  comentario propio: qué recorrido ejercita y que **no** ejercita el cruce borde → acción del
  identificador de petición, de modo que ese diferimiento sigue intacto. La afirmación no es de
  palabra: un `grep` de `request-id`, `requestId` y `reference` sobre el spec nuevo no devuelve nada.
- **T18(a)** `tests/unit/proveedores/scope.test.ts:232`: el censo de E2E pasa de un literal a
  **dos**, en el orden que devuelve el recorrido, y **sigue siendo `toEqual`**. (b), (c) y (d) no se
  tocaron. La aserción «aquí no hay ningún `@@unique`» sigue en pie.
- **T25** `tests/integration/aislamiento.json`: `proveedores/company-scope.int.test.ts` como
  **`transaccion`** y `proveedores/company-scope-queries.int.test.ts` como **`commit`** con motivo y
  `desde: "2026-09-17"`. La clasificación **se verificó leyendo los dos archivos**, no se dio por
  buena: el primero corre cada caso en una transacción interactiva que termina en ROLLBACK y su
  único `afterAll` es el `$disconnect`; el segundo importa los adaptadores driven por ruta profunda,
  que usan el cliente Prisma **global** —una transacción del test sería un aislamiento de mentira,
  correría en otra conexión del pool—, y limpia por id exacto afirmando con tres `count()` a cero.

**Ninguna lista se aflojó en toda la tanda**: ningún `toContain` sustituyendo a un `toEqual`, ningún
`skip`, ninguna alta al baseline de rojos. Los comentarios de las altas nuevas no citan `QC-<n>`,
`R<n>` ni `design.md`, como en el bloque 3.

### Salidas reales

**El E2E, en los DOS navegadores** (`npx playwright test e2e/aislamiento-proveedores.spec.ts`):

```
--project=chromium --reporter=list
Running 1 test using 1 worker

  OK  1 [chromium] > e2e\aislamiento-proveedores.spec.ts:419:7 > aislamiento por empresa de
      proveedores > con sesion en la empresa A: la lista no trae proveedores de B, el detalle de
      uno de B es indistinguible de uno inexistente, darlo de baja conociendo su identificador se
      rechaza y lo deja intacto con su linea, y el nombre de un proveedor de B se puede usar en A
      (R37; R14, R25, R27, R28) (19.8s)

  1 passed (30.6s)
```

```
--project=webkit --reporter=list
Running 1 test using 1 worker

  OK  1 [webkit] > e2e\aislamiento-proveedores.spec.ts:419:7 > aislamiento por empresa de
      proveedores > con sesion en la empresa A: la lista no trae proveedores de B, el detalle de
      uno de B es indistinguible de uno inexistente, darlo de baja conociendo su identificador se
      rechaza y lo deja intacto con su linea, y el nombre de un proveedor de B se puede usar en A
      (R37; R14, R25, R27, R28) (19.7s)

  1 passed (25.9s)
```

El resto, corrido por el implementer sobre el árbol final:

```
pnpm run typecheck   -> VERDE, sin una sola línea de salida
pnpm run lint        -> VERDE, sin una sola línea de salida

npx vitest run tests/unit/proveedores/ tests/unit/inventario/
               tests/unit/identity/session-once-per-request-actions.test.ts
  -> Test Files 55 passed (55) | Tests 874 passed | 3 skipped (877)

npx vitest run tests/integration/proveedores/ tests/integration/inventario/
  -> Test Files 18 passed (18) | Tests 276 passed (276)

pnpm run test:guardias
  -> Test Files 45 passed (45) | Tests 533 passed | 9 skipped (542)
```

Los 3 y 9 `skipped` son preexistentes y no se tocaron. **No se corrió la suite completa**: el gate
entero es T37 y lo corre el leader. No apareció ningún `Test timed out`.

### Mapa `R<n> -> test` que esta tanda deja cerrado

| R | Test que lo cierra | Nivel |
| --- | --- | --- |
| R1, R2 | `proveedores/company-scope.int.test.ts` (+ los censos ya existentes) | integración |
| R3 | `company-scope.int.test.ts` + `suppliers-company-scope-migration.test.ts` | int + unit |
| R4 | `company-scope.int.test.ts` (`INSERT` y los **dos** `UPDATE`, nombrando la FK compuesta) | integración |
| R5, R6 | `company-scope.int.test.ts` + `catalog-line-fk.test.ts` (ningún código nuevo) | int + unit |
| R7, R8 | `company-scope.int.test.ts` (backfills y recuentos) + `suppliers-company-scope-migration.test.ts` | int + unit |
| R9 | `suppliers-company-scope-migration.test.ts` + `guard-rls-force` + censos de integración | unit + guardia |
| R10 | `suppliers-company-scope-migration.test.ts` + `company-scope.int.test.ts` (el `down` entero y los dos retratos) | unit + int |
| R11 | `company-scope.int.test.ts` (cada causa + dos controles anti-placebo) | integración |
| R12 | `suppliers-company-scope-migration.test.ts` + `proveedores-schema.test.ts` | unit |
| R14 | `company-scope.int.test.ts` + `list-query-indexes.int.test.ts` + el E2E (paso 4) | int + E2E |
| **R15** | **tres ángulos independientes**: texto (`suppliers-company-scope-migration.test.ts`), predicado (`list-query-indexes.int.test.ts`), comportamiento (`company-scope.int.test.ts`) | unit + int |
| R16 | `company-scope-queries.int.test.ts` (`meta.target` real medido) | integración |
| R18, R21, R33 | `company-isolation-service.test.ts` + `authorization.test.ts` | unit |
| R19 | `company-scope-queries.int.test.ts` (`findUnitRefs` acotada) | integración |
| R22 | `supplier-actions.test.ts` + `session-once-per-request-actions.test.ts` | unit |
| R23, R24 | `guard-ambito-empresa-proveedores.test.ts` + `company-scope.test.ts` + `company-scope-queries.int.test.ts` | guardia + unit + int |
| R25, R26, R29 | `company-scope-queries.int.test.ts` (+ el E2E, paso 1, para R25) | int + E2E |
| R27, R28, R30 | `company-isolation-service.test.ts` + `company-scope-queries.int.test.ts` (+ el E2E, pasos 2 y 3) | unit + int + E2E |
| R31 | `company-scope.test.ts` (los dos `SELECT` y los dos mapeadores) | unit |
| R32 | `catalog-line-image-scope.test.ts` | unit |
| R34 | `company-scope.int.test.ts` (empresa de baja) | integración |
| R35 | `company-scope-queries.int.test.ts` (sin `FORCE`, mismo retrato) | integración |
| **R37** | **`e2e/aislamiento-proveedores.spec.ts`, verde en Chromium y en WebKit** | **E2E** |
| R38 (parte) | `suppliers-company-scope-migration.test.ts`, `supplier-actions.test.ts`, `list-use-cases.test.ts` | unit |

### Lo que contradice o matiza el spec, y no se resolvió por cuenta propia

1. **`tasks.md` T34 pide «falta el contexto de sesión, la action no llama al caso de uso». La
   producción NO hace eso**: `currentActor()` devuelve `null` y la action **sí** invoca el caso de
   uso con actor `null`; quien rechaza es `requirePermission` en su primera línea. Es el diseño
   «falla cerrado» que ya estaba antes de esta ficha y que `supplier-actions.test.ts` documentaba
   para `getSessionUser`. **No se cambió producción y no se aflojó el test**: el caso nuevo afirma lo
   que de verdad pasa —actor `null`, la empresa de sesión no viaja, el estado es `unauthorized`— y la
   mitad «sin tocar ningún puerto» queda probada con dobles explosivos. **Decide el reviewer** si
   procede matizar la redacción de la task.
2. **`design.md > 8.3` habla de «mismo `data-code` si lo hay». No lo hay.** Ni
   `delete-supplier-error` ni `supplier-not-found` llevan `data-code` (a diferencia de
   `delete-order-dialog`). Como no se puede tocar ningún componente ni asertar copy, la prueba de
   «nunca `unauthorized`, siempre el no-existe» se hace comparando el desenlace del intento cruzado
   contra el del UUID inexistente, más la ausencia del aviso de error **inesperado**. Es más fuerte
   que un `data-code` literal —no depende de que alguien escriba el código correcto en el test— y el
   `toEqual` incluye el atributo, así que si algún día aparece, la comparación lo cubre sola.
3. **T34, R31: en `proveedores` los casos de uso devuelven la vista del puerto tal cual**, sin
   re-mapear (a diferencia de `pedidos` y `recetas`). La frontera real es el `select` más el
   mapeador del adaptador, así que `company-scope.test.ts` afirma **las dos cosas** y alimenta los
   casos de uso con lo que el adaptador real produce. No es un defecto; queda escrito para el
   reviewer.
4. **T35: `proveedores` no tiene puerto de almacenamiento** (a diferencia de `recetas`): `imagePath`
   es texto y se pinta con `components/shared/entity-image.tsx`. «Ninguna firma del puerto de
   almacenamiento gana la empresa» se comprueba de la única forma comprobable: censo **cerrado** de
   `ports/` (tres archivos, ninguno de imágenes), ninguna línea del módulo que junte `imagePath` con
   `companyId`, y cero `createSignedUrl` en el módulo y en la pantalla.
5. **T17 decía «Depende de: T22»; la dependencia real era T31**, como la tanda 3 ya había anotado.
   Confirmado tras el hecho.

### Lo que queda abierto, y por qué

- **T27** (las listas que comparan el diff contra `origin/dev`) y **T28** (la deuda de
  `docs/architecture.md`): fuera del encargo de esta tanda. T28 dependía de T31, que ya está hecha,
  así que ya no está bloqueada.
- **T36** y **T37**: bloque 5, fuera del encargo.

Ningún mensaje de commit de esta rama contiene la cadena que las dos guardias del diff filtran, así
que T27 sigue viva. La tabla de 19 decisiones no se tocó ni se reabrió.
