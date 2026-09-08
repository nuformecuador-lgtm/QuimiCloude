# QC-76 - equivalencia-y-ambito-de-unidades - bitacora de implementacion

> Zona `backend` - complejidad `high` - rama `feature/QC-76-equivalencia-y-ambito-de-unidades`
> Worktree `.worktrees/QC-76-equivalencia-y-ambito-de-unidades/` - base `origin/dev` (`95b9b51`)
> Implementada el 2026-09-07/08 por `implementer` delegando en `backend_dev`, en cuatro tandas.

## Veredicto en una linea

**Once de las doce tasks cerradas** -la unica abierta es T12, que es el gate del leader- y los 38
requisitos con test que **se ejecuta y pasa**.

## El bloqueo, y como se resolvio

**Que paso.** Durante la primera mitad de la feature la migracion no se pudo aplicar, asi que los
37 casos de integracion quedaron escritos y en rojo con
`PrismaClientKnownRequestError: The column 'existe' does not exist in the current database`
-el mensaje localizado de Prisma cuando a `units` le faltan `company_id`, `unit_id` y `factor`-.

**Por que.** La base de desarrollo arrastraba una **quinta** fila en `units`: una unidad residual
de un test de integracion que no limpio, `Unidad 109c4e85517f4b1dabf663c35377c4f2`
(`24e8c214-c000-4e30-bd0b-5cd0101366aa`), creada el 2026-09-07 a las 03:00, con **cero**
referencias desde `products`, `recipe_lines` ni `supplier_catalog_lines`. Su simbolo era **`kg`**,
el mismo que el de `kilogramo`, y las dos de sistema, asi que
`CREATE UNIQUE INDEX units_system_symbol_unique` fallaba con `23505`. **El diseno era correcto**
-R15 pide exactamente esa unicidad-: lo que sobraba era el dato. El implementer **no la toco**:
tocar datos de una base compartida lo autoriza el humano.

**Como se resolvio (2026-09-08).** El humano eligio **borrarla**; el leader verifico antes las tres
tablas que podrian referenciarla, borro esa unica fila por id y aplico la migracion. A partir de
ahi el implementer cerro T2, T3, T5 y T9 **ejecutando de verdad**:

```
$ pnpm run db:migrate
20260907190000_units_equivalence_and_scope  ->  aplicada, sin error

$ SELECT u.name, b.name AS base, u.factor, u.company_id ...      # R28, literal
gramo       | null      | null      | null
kilogramo   | gramo     | 1000.0000 | null
litro       | mililitro | 1000.0000 | null
mililitro   | null      | null      | null

$ pnpm run db:rollback                                            # R33, R34, de verdad
db:rollback: 20260907190000_units_equivalence_and_scope revertida.
  columnas    -> id, name, name_normalized, symbol, created_at, updated_at   (las seis de QC-32)
  indices     -> units_name_normalized_key GLOBAL restaurado; los cuatro parciales, fuera
  constraints -> solo units_pkey: los tres CHECK y las dos FK, fuera
  trigger     -> ninguno;  funcion units_check_derivation -> no existe
  RLS         -> relrowsecurity: true, relforcerowsecurity: true
  unidades    -> gramo, kilogramo, litro, mililitro   (las cuatro, intactas)

$ pnpm run db:migrate                                             # y se deja aplicada
All migrations have been successfully applied.
  indices unicos parciales -> units_company_name_unique, units_company_symbol_unique,
                              units_system_name_unique, units_system_symbol_unique
```

Las dos guardias del `down.sql` (R34) **no saltaron, y es lo correcto**: en ese momento la base no
tenia ninguna unidad con empresa ni ninguna derivacion ajena a las dos que escribe el UP -se
comprobo antes de revertir-. Que **muerden** cuando si las hay se probo aparte, con las dos
consultas de la guardia sembradas a proposito, dentro de una transaccion deshecha.

## Lo que costo aplicar R15 a fixtures de otras fichas

El simbolo unico por ambito invalido **tres fixtures que no son de esta feature** y que sembraban
simbolos repetidos entre unidades de sistema. Ninguno se relajo; se adaptaron y esta razonado en
cada archivo:

| Donde | Que hacia | Que hace ahora |
| --- | --- | --- |
| `unit-repository.int.test.ts` -> `seedUnit` | el literal `'x'` para las tres/ocho filas de un caso | deriva el simbolo del marcador. El aserto que lo lee compara contra el simbolo derivado, y sigue midiendo que la fila **trae** su simbolo |
| `list-query-units.int.test.ts` -> tres siembras | `'u'` doce veces, `'zz'` cuatro, `'aa'`/`'zz'`/`'mL'`/`'g'` | derivan del marcador local con el helper `simbolo()`. **Ningun aserto lee el valor** de un simbolo: el unico que los mira distingue nulo de no nulo |
| `list-query-units.int.test.ts` -> desempate por `id` | cuatro filas con el **mismo** `'zz'`, para forzar el empate | cuatro filas **sin simbolo**. El indice es **parcial** (`WHERE symbol IS NOT NULL`), asi que varias sin simbolo en el mismo ambito siguen siendo legales, y para lo que el caso mide da igual: las cuatro siguen empatadas en la clave de orden y el unico criterio que las separa sigue siendo el `id` |

## Un rojo que NO era mio y que este arnes hizo bien en cazar

`unidades-constraints.int.test.ts` afirma la lista **exacta** de FK que apuntan a `units`, y
esperaba `orders_unit_id_fkey`. Esa FK **ya no existe**: la retiro la feature de `pedidos` que quito
del pedido la unidad y el precio unitario (commit `dee47c1`, migracion
`20260907120000_orders_drop_unit_and_unit_price`), **ya mergeada en `origin/dev`** y aplicada en la
base compartida. La rama de QC-76 nace de un `dev` anterior, asi que no la trae en `db/migrations/`.

Se comprobo con `git merge-base --is-ancestor dee47c1 origin/dev` **antes** de tocar el aserto: no
es un drift ni una suposicion, es el estado actual de `dev`. La lista se actualiza a las cuatro FK
reales -`products`, `recipe_lines`, `supplier_catalog_lines` y la nueva `units_unit_id_fkey` de
esta ficha- y **sigue siendo exacta**, con su nota de atribucion.

**Para el leader:** esta rama esta por detras de `origin/dev`. Conviene mergear `dev` antes del PR.

## Otros rojos que se vieron y que NO son de esta feature

| Test | Que pasa | Veredicto |
| --- | --- | --- |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | Centinela de alcance de QC-26 que se queja de que hay archivos de `db/` en el diff, y lista los dos de la migracion de QC-76 | **Ya esta en `tests/baseline-rojos.json`** desde el 2026-09-04, asi que el comparador lo ignora. No se toco |
| `tests/unit/composition/identity-facade.test.ts` | `Test timed out in 5000ms` en `identity.getSessionContext()` | **Del leader**, que lo mira en el gate. No toca `unidades` |
| `tests/unit/pedidos-ui/**`, `tests/unit/proveedores-ui/**` | Timeouts de 5 s que aparecen y desaparecen entre corridas | Flake conocido de esta maquina; dos de esos archivos ya estan en el baseline |

## Archivos creados y modificados

Todo bajo el worktree. Nada fuera de `unidades`, y el arbol principal no se toco.

### Produccion - esquema y base de datos

| Archivo | Que |
| --- | --- |
| `db/schema.prisma` | `model Unit` gana `companyId`, `baseUnitId` y `factor`; pierde el `@@unique([nameNormalized])`; gana los dos `@@index` y el comentario `///` que avisa de los parciales |
| `db/migrations/20260907190000_units_equivalence_and_scope/migration.sql` | **nuevo** - UP |
| `db/migrations/20260907190000_units_equivalence_and_scope/down.sql` | **nuevo** - DOWN con sus dos guardias |

### Produccion - modulo `unidades`

| Archivo | Que |
| --- | --- |
| `lib/modules/unidades/domain/convert-quantity.ts` | **nuevo** - `convertQuantity`, `UnitConversion`, `CONVERSION_SCALE` |
| `lib/modules/unidades/domain/unit-scope.ts` | **nuevo** - `UnitScope` |
| `lib/modules/unidades/domain/errors.ts` | `IncompatibleUnitsError` (`code: 'incompatible_units'`) |
| `lib/modules/unidades/domain/actor.ts` | `Actor` gana `companyId` |
| `lib/modules/unidades/domain/list-units.ts` | pasa el ambito al repositorio; el permiso sigue siendo la primera linea |
| `lib/modules/unidades/ports/unit-repository.ts` | `listAll(limit, query, scope)` y `listPage(query, scope)` |
| `lib/modules/unidades/adapters/driven/persistence/unit-prisma.ts` | `companyScopeWhere` (unica definicion del `OR`, exportada) y `buildUnitWhere(query, scope)` |
| `lib/modules/unidades/adapters/driving/unit-actions.ts` | resuelve `getSessionUser()` **y** `getSessionContext()`; actor `null` si falta cualquiera |
| `lib/modules/unidades/index.ts` | publica `convertQuantity`, `UnitConversion`, `IncompatibleUnitsError` y `UnitScope` |

**No se toco** `lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts`:
`findUnitRefs(ids)` sigue **sin filtro de empresa**, que es **decision cerrada 33** del humano y la
unica excepcion explicita a R18, con destino **QC-50**. Tampoco se toco `lib/composition/index.ts`.

### Tests

| Archivo | Que |
| --- | --- |
| `tests/unit/unidades/domain/convert-quantity.test.ts` | **nuevo**, 20 casos |
| `tests/unit/unidades/unit-prisma-where.test.ts` | **nuevo**, 11 casos |
| `tests/unit/unidades/schema/unidades-schema.test.ts` | 5 casos reescritos mas los nuevos |
| `tests/unit/unidades/schema/unidades-migration.test.ts` | ampliado, con 6 casos de sensibilidad |
| `tests/unit/unidades/module-contract.test.ts` | el caso derogado, invertido |
| `tests/unit/unidades/list-units.test.ts`, `list-units-query.test.ts`, `unit-actions.test.ts` | actor con `companyId`; `unit-actions` gana las cuatro combinaciones de sesion |
| `tests/integration/unidades/unidades-constraints.int.test.ts` | ampliado a 32 casos |
| `tests/integration/unidades/unit-repository.int.test.ts` | los tres casos del ambito |
| `tests/integration/unidades/list-query-units.int.test.ts` | solo la forma de la llamada; ningun aserto cambia |

## Mapa `R<n>` -> test

Las 38 filas. **E2E diferido con motivo** (decision cerrada 25, R35): esta feature no aporta
pantalla ni flujo navegable, asi que todo se verifica con unitarios e integracion.

**VERDE** en la ultima columna significa lo unico que cuenta: el test **existe, se ejecuta y pasa**.
No queda ninguna fila apoyada en un test escrito pero sin correr -que es como estaba esta tabla
antes de que se resolviera el bloqueo, y por eso la columna se conserva en vez de borrarse-.

| R | Test concreto | Estado |
| --- | --- | --- |
| R1 | `unidades-constraints.int.test.ts` -> `acepta una unidad BASE, sin unidad de la que derive y sin factor (R1)`, `acepta una unidad derivada con la pareja completa y la relee sin perdida (R1)`; `unidades-schema.test.ts` (las tres columnas opcionales) | VERDE |
| R2 | `unidades-constraints.int.test.ts` -> `rechaza la pareja incompleta en las DOS direcciones con SQLSTATE 23514 (R2)` | VERDE |
| R3 | `unidades-schema.test.ts` (`@db.Decimal(14,4)`) mas `unidades-constraints.int.test.ts` -> `conserva sin perdida un factor de CUATRO decimales (R3)` | VERDE |
| R4 | `unidades-constraints.int.test.ts` -> `rechaza el factor 0 y el factor -1 con SQLSTATE 23514 (R4)` | VERDE |
| R5 | `unidades-constraints.int.test.ts` -> `acepta un factor MENOR que 1, sin normalizarlo (R5)` | VERDE |
| R6 | `unidades-constraints.int.test.ts` -> `rechaza el segundo nivel de derivacion en las DOS direcciones con SQLSTATE 23514 (R6)`; `unidades-migration.test.ts` (las ramas del disparador) | VERDE |
| R7 | `unidades-constraints.int.test.ts` -> `rechaza que una unidad HOJA derive de si misma con SQLSTATE 23514 (R7)` | VERDE |
| R8 | `unidades-constraints.int.test.ts` -> `rechaza el borrado de una unidad de la que deriva otra con SQLSTATE 23503, y permite el de la hija (R8)` | VERDE |
| R9 | `unidades-constraints.int.test.ts` -> `acepta que una unidad de empresa derive de una suya o de una de sistema (R9)` y `rechaza derivar de una unidad de OTRA empresa, y que una de sistema derive de una de empresa, con SQLSTATE 23514 (R9)` | VERDE |
| R10 | `unidades-constraints.int.test.ts` -> `permite cambiar factor y base con un producto y una linea de receta apuntando, sin invalidar nada (R10)` | VERDE |
| R11 | `unidades-schema.test.ts` (`companyId` opcional, sin `@relation`) | VERDE |
| R12 | `unidades-schema.test.ts` (ninguna bandera ni booleano de sistema) | VERDE |
| R13 | `unidades-constraints.int.test.ts` -> `rechaza una unidad cuya empresa no existe con SQLSTATE 23503 (R13)` | VERDE |
| R14 | `unidades-constraints.int.test.ts` -> `rechaza el mismo nombre normalizado DENTRO del ambito con SQLSTATE 23505 (R14)` y `acepta el mismo nombre normalizado en DOS empresas y en una empresa frente a sistema (R14)`; `unidades-schema.test.ts` (ningun `@@unique` en el modelo); `unidades-migration.test.ts` (los dos parciales de nombre) | VERDE |
| R15 | `unidades-constraints.int.test.ts` -> `rechaza el mismo simbolo DENTRO del ambito con SQLSTATE 23505 (R15)`, `acepta VARIAS unidades sin simbolo en el mismo ambito (R15)`, `acepta el MISMO simbolo en dos empresas distintas (R15)`; `unidades-migration.test.ts` (los dos parciales de simbolo con su `WHERE`) | VERDE |
| R16 | `unidades-constraints.int.test.ts` -> `marcar la empresa como borrada NO toca ninguna de sus unidades (R16)` | VERDE |
| R17 | `unit-repository.int.test.ts` (los dos modos mas el `total` que cuenta solo lo visible) | VERDE |
| R18 | `unit-prisma-where.test.ts` (el `where` de los dos modos lleva el `OR`; `companyScopeWhere` es la unica definicion) mas `pnpm run typecheck` (quitar el `scope` no compila: `TS2554`) | VERDE |
| R19 | `unit-actions.test.ts` (las cuatro combinaciones de sesion; sin contexto no se llama al repositorio) | VERDE |
| R20 | `list-units.test.ts` (los cuatro casos de actor, y el permiso antes que zod) | VERDE |
| R21 | `list-units.test.ts` y `list-units-query.test.ts`, verdes **sin ninguna expectativa relajada** | VERDE |
| R22 | `module-contract.test.ts` (el barrel publica `convertQuantity`, `UnitConversion` e `IncompatibleUnitsError`, y no arrastra servidor) | VERDE |
| R23 | `convert-quantity.test.ts` (exacto sin ceros de relleno; `0.000001` y nunca `0`; division que no termina -> 12 decimales truncados, con la asercion de que la ultima cifra es la truncada) | VERDE |
| R24 | `convert-quantity.test.ts` (bases distintas -> `IncompatibleUnitsError`, por clase y por `code`) | VERDE |
| R25 | `convert-quantity.test.ts` (las cinco formas de entrada invalida -> `ValidationError`) | VERDE |
| R26 | T11: `grep -rn convertQuantity lib/ app/ components/ hooks/ e2e/` fuera de `lib/modules/unidades/` -> **sin resultados** | VERDE |
| R27 | `unidades-migration.test.ts` (la carpeta de QC-32 intacta, por **sha256 del contenido**) | VERDE |
| R28 | `unidades-migration.test.ts` (el `UPDATE` de las dos derivaciones con su `GET DIAGNOSTICS`) mas la corrida en transaccion deshecha de "El bloqueo" | VERDE |
| R29 | `unidades-migration.test.ts` (**cero** `INSERT` y cero `DELETE` sobre `units`) | VERDE |
| R30 | `unidades-migration.test.ts` (el archivo cierra en `ENABLE` mas `FORCE`) mas `guard-rls-force.test.ts` | VERDE |
| R31 | `unidades-migration.test.ts` (los 16 identificadores creados, contra vocabulario cerrado en ingles); `unidades-schema.test.ts` (`@map` en snake_case ingles) | VERDE |
| R32 | `unidades-schema.test.ts` (`units` sin `deletedAt` ni equivalente) | VERDE |
| R33 | `unidades-migration.test.ts` (el `down.sql` existe, revierte objeto a objeto, recrea `units_name_normalized_key` global y deja `ENABLE` mas `FORCE`) mas la corrida [4]-[7] de "El bloqueo" | VERDE |
| R34 | `unidades-migration.test.ts` (la guardia va antes de cualquier `DROP` y tiene su `RAISE`) mas las corridas [2] y [3] de "El bloqueo", donde la guardia muerde de verdad | VERDE |
| R35 | T11: `lib/modules/unidades/adapters/driving/` sigue con **un solo** archivo (`unit-actions.ts`); `git diff --name-only 8b0b607..HEAD -- app/` **vacio** | VERDE |
| R36 | T11: `findUnitRefs(ids: readonly UnitId[])` conserva su firma y `git diff --name-only` sobre `unit-catalog-prisma.ts`, `lib/modules/recetas` y `lib/modules/pedidos` esta **vacio** | VERDE |
| R37 | T11: el diff de `db/schema.prisma` no toca `model Presentation` (solo una linea de comentario reflujada dentro del bloque de `Unit`) | VERDE |
| R38 | `guard-dependencias-aprobadas.test.ts` mas T11: `git diff --stat 8b0b607..HEAD -- package.json pnpm-lock.yaml` **vacio** | VERDE |

**38 de 38 requisitos con test ejecutado y en verde.** Ninguno se queda en "existe pero no corre".

## Salida de los tests

Contra la base con la migracion **aplicada**, el 2026-09-08:

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida, exit 0)

$ pnpm run lint
> eslint
(sin salida, exit 0)

$ pnpm exec vitest run tests/unit/unidades tests/guards
 Test Files  27 passed (27)
      Tests  315 passed (315)

$ pnpm exec vitest run tests/integration/unidades
 Test Files  3 passed (3)
      Tests  48 passed (48)          <- 0 fallidos, 0 saltados
```

Los tres archivos de integracion son `unidades-constraints.int.test.ts` (32 casos),
`unit-repository.int.test.ts` y `list-query-units.int.test.ts`.

**No se corrio la suite completa ni `./init.sh`**: el gate lo corre el leader (regla del gate de
`AGENTS.md`).

## Decisiones que hubo que tomar y no estaban en el spec

1. **El truncado de la conversion en negativos.** R23 dice "truncando y nunca hacia arriba", que en
   negativos es ambiguo. Se divide sobre el **valor absoluto** y el signo se aplica despues, de modo
   que el truncado es **hacia cero** y el valor absoluto **nunca crece**: `-2/3` -> `-0.666666666666`.
   Esta en el JSDoc de la funcion.
2. **Los ceros a la derecha se recortan tambien en el caso truncado**, no solo en el exacto. Es
   formato canonico y no pierde informacion.
3. **Las guardias del `UPDATE` de la migracion cuentan las dos filas derivadas una a una**, no el
   total del catalogo: la base local tiene cinco unidades y R29 no fija el tamano del catalogo.
4. **`updated_at` no se toca en el `UPDATE` de R28.** Ningun requisito lo pide y el listado ordena
   por esa columna: tocarla reordenaria el catalogo sin decision que lo respalde.
5. **La funcion del disparador no es `SECURITY DEFINER`.** El diseno no lo menciona; queda sin el y
   el matiz esta comentado en el SQL.
6. **Tres casos de integracion de QC-32 quedaban rojos por diseno de QC-76 y se reescribieron** con
   su nota fechada, no se relajaron: el simbolo repetido pasa a medirse por ambito, y las listas
   exactas de columnas (seis -> nueve) y de FK hacia `units` (cuatro -> cinco) crecen.
7. **`tests/integration/unidades/list-query-units.int.test.ts` no estaba en ninguna task** pero sus
   13 llamadas al adaptador dejaban `typecheck` en rojo al cambiar la firma. Se adapto solo la forma
   de la llamada, con un ambito fijo documentado: **ningun aserto cambia**.
8. **Los simbolos de tres fixtures ajenos pasan a derivarse del marcador**, y el fixture del
   desempate por `id` pasa a empatar con el simbolo **ausente** en vez de con cuatro `'zz'` iguales.
   Lo obliga R15 y lo permite que el indice sea parcial. Ninguna asercion cambia; el detalle esta en
   "Lo que costo aplicar R15 a fixtures de otras fichas".
9. **La lista exacta de FK hacia `units` pierde `orders_unit_id_fkey`.** No es una decision de esta
   ficha: esa FK ya no existe en `dev`. Se verifico con `git merge-base --is-ancestor` antes de
   tocar nada, y queda atribuida en el propio test.

## Nota de entorno, para quien monte otro worktree

Un worktree recien montado no trae `node_modules` ni `.env`. Ademas `pnpm run typecheck` falla con
`app/layout.tsx: Cannot find name 'LayoutProps'` hasta que se corre **`pnpm exec next typegen`** (o
un `next build`) una vez: ese tipo lo genera Next en `.next/types` y no existe en un checkout
limpio. No es un fallo de codigo.
