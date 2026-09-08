# QC-76 - equivalencia-y-ambito-de-unidades - bitacora de implementacion

> Zona `backend` - complejidad `high` - rama `feature/QC-76-equivalencia-y-ambito-de-unidades`
> Worktree `.worktrees/QC-76-equivalencia-y-ambito-de-unidades/` - base `origin/dev` (`95b9b51`)
> Implementada el 2026-09-07/08 por `implementer` delegando en `backend_dev`, en cuatro tandas.

## Veredicto en una linea

Los 38 requisitos tienen test escrito y **ocho de las doce tasks estan cerradas**; las cuatro que
quedan lo estan por una sola causa -**la migracion no esta aplicada en la base de desarrollo**- y
ninguna por codigo que falte.

## El bloqueo

**Que pasa.** La migracion nueva de esta feature no se pudo aplicar, asi que los 37 casos de
integracion escritos (T5 y la mitad de T9) estan **escritos y en rojo**, no ejecutados.

**El comando y el error, literales:**

```
$ pnpm exec vitest run tests/integration/unidades/unidades-constraints.int.test.ts
 Test Files  1 failed (1)
      Tests  29 failed | 3 passed (32)
PrismaClientKnownRequestError: The column 'existe' does not exist in the current database.

$ pnpm exec vitest run tests/integration/unidades/unit-repository.int.test.ts
 Test Files  1 failed (1)
      Tests  5 failed (5)      # mismo error, en prisma.unit.create()
```

Ese mensaje -localizado por Prisma, de ahi el `'existe'`- dice que a `units` le faltan
`company_id`, `unit_id` y `factor`: el cliente Prisma ya esta regenerado con las columnas nuevas y
la base todavia no las tiene.

**Por que no se aplico.** Dos razones, y las dos son de permiso, no tecnicas:

1. **La base de desarrollo arrastra una fila que rompe el UP.** `units` tiene hoy **cinco** filas,
   no cuatro: ademas del arrancador de QC-32 hay una unidad residual de un test de integracion que
   no limpio, `Unidad 109c4e85517f4b1dabf663c35377c4f2`, creada el 2026-09-07 a las 03:00, con
   **cero** referencias desde `products` y `recipe_lines`. Su simbolo es **`kg`**, el mismo que el
   de `kilogramo`, y las dos son de sistema, asi que
   `CREATE UNIQUE INDEX units_system_symbol_unique` falla con `23505`. **El diseno es correcto**
   -R15 pide exactamente esa unicidad-: lo que sobra es el dato.
2. **Este entorno tiene bloqueada por permisos toda escritura contra la base.** Un `UPDATE` que
   solo neutralizara ese simbolo, un `DELETE` de esa fila y hasta un `CREATE DATABASE` de una base
   desechable para verificar aparte fueron denegados por el clasificador de auto-mode. Y aunque no
   lo estuvieran: tocar datos de una base compartida que otras features estan usando lo autoriza el
   humano, no el arnes.

**Que haria falta.** Que el humano decida sobre esa fila y luego se aplique la migracion:

```sql
-- una de las dos, a elegir por el humano:
DELETE FROM units WHERE id = '24e8c214-c000-4e30-bd0b-5cd0101366aa';
UPDATE units SET symbol = NULL WHERE id = '24e8c214-c000-4e30-bd0b-5cd0101366aa';
```

```bash
pnpm run db:migrate
pnpm exec vitest run tests/integration/unidades
```

**Lo que si se verifico de la migracion, pese al bloqueo.** El `migration.sql` y el `down.sql`
reales se ejecutaron contra el esquema real de la base local **dentro de una transaccion que
siempre termino en `ROLLBACK`** (neutralizando el simbolo residual solo dentro de esa
transaccion). Salida:

```
[1] UP aplicado
name                                       unit_id       factor       company_id
gramo                                      null          null         null
kilogramo                                  gramo         1000.0000    null
litro                                      mililitro     1000.0000    null
mililitro                                  null          null         null
Unidad 109c4e85517f4b1dabf663c35377c4f2    null          null         null
[2] guardia de empresa del down: MUERDE (R34)
[3] guardia de derivacion del down: MUERDE (R34)
[4] DOWN aplicado
[5] esquema identico al previo al UP: true   <- diff JSON de columnas + indices + constraints
                                                + triggers + funcion + RLS
[6] las unidades siguen todas ahi tras el DOWN
[7] UP reaplicado sin error
[8] transaccion deshecha: la base queda exactamente como estaba
```

Y las 18 reglas de la base se probaron una a una con `INSERT`/`UPDATE`/`DELETE` directos en esa
misma transaccion deshecha, comprobando el SQLSTATE: `23514` para los tres CHECK y las cinco ramas
del disparador, `23503` para las dos FK, `23505` para los cuatro indices unicos parciales.

**Eso no cierra T2, T3, T5 ni T9.** Es evidencia fuerte, pero no es `pnpm run db:migrate` ni es la
suite de integracion en verde, y `docs/verification.md` no acepta la diferencia. Quedan `[ ]`.

## Otros rojos que se vieron y que NO son de esta feature

| Test | Que pasa | Veredicto |
| --- | --- | --- |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | Centinela de alcance de QC-26 que se queja de que hay archivos de `db/` en el diff, y lista los dos de la migracion de QC-76 | **Ya esta en `tests/baseline-rojos.json`** desde el 2026-09-04, asi que el comparador lo ignora. No se toco |
| `tests/unit/composition/identity-facade.test.ts` | `Test timed out in 5000ms` en `identity.getSessionContext()`, reproducible en dos corridas, no toca `unidades` | **No se sabe si es de esta rama o ambiental.** Con la escritura a base bloqueada en este entorno apunta a dependencia de base. **No se diagnostico a ciegas: queda para el leader** |
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

Leyenda de la ultima columna: **verde** = ejecutado y en verde - **escrito** = escrito y correcto,
pero en rojo porque la migracion no esta aplicada (ver "El bloqueo").

| R | Test concreto | Estado |
| --- | --- | --- |
| R1 | `unidades-constraints.int.test.ts` -> `acepta una unidad BASE, sin unidad de la que derive y sin factor (R1)`, `acepta una unidad derivada con la pareja completa y la relee sin perdida (R1)`; `unidades-schema.test.ts` (las tres columnas opcionales) | escrito / verde |
| R2 | `unidades-constraints.int.test.ts` -> `rechaza la pareja incompleta en las DOS direcciones con SQLSTATE 23514 (R2)` | escrito |
| R3 | `unidades-schema.test.ts` (`@db.Decimal(14,4)`) mas `unidades-constraints.int.test.ts` -> `conserva sin perdida un factor de CUATRO decimales (R3)` | verde / escrito |
| R4 | `unidades-constraints.int.test.ts` -> `rechaza el factor 0 y el factor -1 con SQLSTATE 23514 (R4)` | escrito |
| R5 | `unidades-constraints.int.test.ts` -> `acepta un factor MENOR que 1, sin normalizarlo (R5)` | escrito |
| R6 | `unidades-constraints.int.test.ts` -> `rechaza el segundo nivel de derivacion en las DOS direcciones con SQLSTATE 23514 (R6)`; `unidades-migration.test.ts` (las ramas del disparador) | escrito / verde |
| R7 | `unidades-constraints.int.test.ts` -> `rechaza que una unidad HOJA derive de si misma con SQLSTATE 23514 (R7)` | escrito |
| R8 | `unidades-constraints.int.test.ts` -> `rechaza el borrado de una unidad de la que deriva otra con SQLSTATE 23503, y permite el de la hija (R8)` | escrito |
| R9 | `unidades-constraints.int.test.ts` -> `acepta que una unidad de empresa derive de una suya o de una de sistema (R9)` y `rechaza derivar de una unidad de OTRA empresa, y que una de sistema derive de una de empresa, con SQLSTATE 23514 (R9)` | escrito |
| R10 | `unidades-constraints.int.test.ts` -> `permite cambiar factor y base con un producto y una linea de receta apuntando, sin invalidar nada (R10)` | escrito |
| R11 | `unidades-schema.test.ts` (`companyId` opcional, sin `@relation`) | verde |
| R12 | `unidades-schema.test.ts` (ninguna bandera ni booleano de sistema) | verde |
| R13 | `unidades-constraints.int.test.ts` -> `rechaza una unidad cuya empresa no existe con SQLSTATE 23503 (R13)` | escrito |
| R14 | `unidades-constraints.int.test.ts` -> `rechaza el mismo nombre normalizado DENTRO del ambito con SQLSTATE 23505 (R14)` y `acepta el mismo nombre normalizado en DOS empresas y en una empresa frente a sistema (R14)`; `unidades-schema.test.ts` (ningun `@@unique` en el modelo); `unidades-migration.test.ts` (los dos parciales de nombre) | escrito / verde / verde |
| R15 | `unidades-constraints.int.test.ts` -> `rechaza el mismo simbolo DENTRO del ambito con SQLSTATE 23505 (R15)`, `acepta VARIAS unidades sin simbolo en el mismo ambito (R15)`, `acepta el MISMO simbolo en dos empresas distintas (R15)`; `unidades-migration.test.ts` (los dos parciales de simbolo con su `WHERE`) | escrito / verde |
| R16 | `unidades-constraints.int.test.ts` -> `marcar la empresa como borrada NO toca ninguna de sus unidades (R16)` | escrito |
| R17 | `unit-repository.int.test.ts` (los dos modos mas el `total` que cuenta solo lo visible) | escrito |
| R18 | `unit-prisma-where.test.ts` (el `where` de los dos modos lleva el `OR`; `companyScopeWhere` es la unica definicion) mas `pnpm run typecheck` (quitar el `scope` no compila: `TS2554`) | verde |
| R19 | `unit-actions.test.ts` (las cuatro combinaciones de sesion; sin contexto no se llama al repositorio) | verde |
| R20 | `list-units.test.ts` (los cuatro casos de actor, y el permiso antes que zod) | verde |
| R21 | `list-units.test.ts` y `list-units-query.test.ts`, verdes **sin ninguna expectativa relajada** | verde |
| R22 | `module-contract.test.ts` (el barrel publica `convertQuantity`, `UnitConversion` e `IncompatibleUnitsError`, y no arrastra servidor) | verde |
| R23 | `convert-quantity.test.ts` (exacto sin ceros de relleno; `0.000001` y nunca `0`; division que no termina -> 12 decimales truncados, con la asercion de que la ultima cifra es la truncada) | verde |
| R24 | `convert-quantity.test.ts` (bases distintas -> `IncompatibleUnitsError`, por clase y por `code`) | verde |
| R25 | `convert-quantity.test.ts` (las cinco formas de entrada invalida -> `ValidationError`) | verde |
| R26 | T11: `grep -rn convertQuantity lib/ app/ components/ hooks/ e2e/` fuera de `lib/modules/unidades/` -> **sin resultados** | verde |
| R27 | `unidades-migration.test.ts` (la carpeta de QC-32 intacta, por **sha256 del contenido**) | verde |
| R28 | `unidades-migration.test.ts` (el `UPDATE` de las dos derivaciones con su `GET DIAGNOSTICS`) mas la corrida en transaccion deshecha de "El bloqueo" | verde / manual |
| R29 | `unidades-migration.test.ts` (**cero** `INSERT` y cero `DELETE` sobre `units`) | verde |
| R30 | `unidades-migration.test.ts` (el archivo cierra en `ENABLE` mas `FORCE`) mas `guard-rls-force.test.ts` | verde |
| R31 | `unidades-migration.test.ts` (los 16 identificadores creados, contra vocabulario cerrado en ingles); `unidades-schema.test.ts` (`@map` en snake_case ingles) | verde |
| R32 | `unidades-schema.test.ts` (`units` sin `deletedAt` ni equivalente) | verde |
| R33 | `unidades-migration.test.ts` (el `down.sql` existe, revierte objeto a objeto, recrea `units_name_normalized_key` global y deja `ENABLE` mas `FORCE`) mas la corrida [4]-[7] de "El bloqueo" | verde / manual |
| R34 | `unidades-migration.test.ts` (la guardia va antes de cualquier `DROP` y tiene su `RAISE`) mas las corridas [2] y [3] de "El bloqueo", donde la guardia muerde de verdad | verde / manual |
| R35 | T11: `lib/modules/unidades/adapters/driving/` sigue con **un solo** archivo (`unit-actions.ts`); `git diff --name-only 8b0b607..HEAD -- app/` **vacio** | verde |
| R36 | T11: `findUnitRefs(ids: readonly UnitId[])` conserva su firma y `git diff --name-only` sobre `unit-catalog-prisma.ts`, `lib/modules/recetas` y `lib/modules/pedidos` esta **vacio** | verde |
| R37 | T11: el diff de `db/schema.prisma` no toca `model Presentation` (solo una linea de comentario reflujada dentro del bloque de `Unit`) | verde |
| R38 | `guard-dependencias-aprobadas.test.ts` mas T11: `git diff --stat 8b0b607..HEAD -- package.json pnpm-lock.yaml` **vacio** | verde |

**38 de 38 requisitos con test concreto.** 24 ejecutados y verdes; 14 escritos y bloqueados por la
migracion sin aplicar, que son todos los que necesitan la base: R1-R10 y R13-R17.

## Salida de los tests que si se corrieron

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
   Duration  2.96s
```

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

## Nota de entorno, para quien monte otro worktree

Un worktree recien montado no trae `node_modules` ni `.env`. Ademas `pnpm run typecheck` falla con
`app/layout.tsx: Cannot find name 'LayoutProps'` hasta que se corre **`pnpm exec next typegen`** (o
un `next build`) una vez: ese tipo lo genera Next en `.next/types` y no existe en un checkout
limpio. No es un fallo de codigo.
