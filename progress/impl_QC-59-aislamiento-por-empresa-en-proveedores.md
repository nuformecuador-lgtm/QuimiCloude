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
