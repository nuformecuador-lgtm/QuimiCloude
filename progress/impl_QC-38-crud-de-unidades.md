# QC-38 — crud-de-unidades — bitacora de implementacion

> Zona `backend` · complejidad `medium` · rama `feature/QC-38-crud-de-unidades`
> Worktree `.worktrees/QC-38-crud-de-unidades/` · base `origin/dev` con **QC-76 ya mergeado**
> (PR #45, `5ee52fe`), mas QC-74 y QC-54.
> Implementada el 2026-09-08 por `implementer` delegando en `backend_dev`, en **cinco tandas**.

## Veredicto en una linea

**Las 13 tasks cerradas** —T1 no existe a proposito— y **los 36 requisitos con un test que
existe, se ejecuta y pasa**; `tests/integration` queda **entero en verde (28 archivos, 400 tests)**.

## Lo que esta ficha aporta

El **alta, la edicion y el borrado** de unidades sobre el catalogo de QC-32 y el modelo de QC-76,
con su superficie de Server Actions, autorizando **por permiso** (QC-74). **Sin migracion** (R32),
**sin pantalla** (R34) y **sin ninguna dependencia nueva** (R35). La consulta **no se toca** (R33).

## Las dos decisiones que el humano cerro el 2026-09-08

**1. Se crea `unidades.modificar`; el catalogo pasa a ONCE.** Se siembra al `Administrador`
**junto con** `unidades.consultar`, escritos uno a uno: tener `modificar` **no** implica poder
consultar. El `Operador` no recibe ninguno de los dos y sigue con exactamente
`inventario.consultar`.

**Esto enmienda QC-74 R2** («exactamente estos diez permisos, ni uno mas ni uno menos»), y la
enmienda **quedo escrita en el codigo**, no solo en el spec: vive en la cabecera de
`lib/modules/identity/domain/permissions.ts`, con su motivo —QC-74 R4 dejo a `unidades` sin
escritura justificandolo con «no tiene escritura», y esta ficha es justamente la que se la da, asi
que la premisa dejo de ser cierta— y la habilitacion de QC-76 (decision cerrada 24).

**2. El simbolo vacio o en blanco se RECHAZA** (R36), con `invalid_input`. No se convierte en
`NULL` ni en «sin simbolo». **No mandar simbolo sigue siendo legal** (R10). La distincion entre
clave **ausente** y clave **vacia** se hace con `formData.has('symbol')` en la action, nunca por el
valor: sin eso, un simbolo que el formulario no manda y uno que manda vacio llegarian iguales y
**R36 se comeria a R10**. Tiene test en los tres niveles: esquema, caso de uso y borde `FormData`.

## El ripple del catalogo compartido, atendido en la MISMA tanda

Pasar de diez a once permisos ponia en rojo **seis archivos de test ajenos** que afirmaban «diez»,
contados uno a uno en `design.md > 2`. **Se actualizaron en la misma tanda que el cambio (T2+T3),
no al final** — es la leccion de QC-76, y era la instruccion explicita.

Se ajustaron **solo el conteo, el texto y la pertenencia a una lista**. **Ninguna expectativa se
relajo**, y se puede comprobar con el diff: ningun `expect` borrado, ningun `toEqual` degradado a
`toContain`, ningun caso saltado. `tests/unit/identity/permissions.test.ts` **gano** dos casos
explicitos de R4 (el `Administrador` con los dos codigos de unidades; el `Operador` con ninguno).

Se corrio ademas `vitest related` sobre el catalogo (137 archivos) para cazar un posible **septimo**
archivo afectado: **no aparecio ninguno**.

## El hallazgo importante: un defecto real que solo la integracion podia ver

**`design.md > 7.1` describia un mecanismo que es falso contra Postgres real.** Mandaba traducir el
`P2002` comparando `error.meta.target` contra el **NOMBRE del indice**
(`'units_company_name_unique'`...). Con `@prisma/client@6.19.3`, `meta.target` trae las **COLUMNAS**
afectadas (`["company_id","name_normalized"]`), **nunca** el nombre del indice.

**Consecuencia:** los dos conjuntos de nombres no hacian match jamas, el `P2002` se relanzaba sin
traducir, y un nombre o un simbolo duplicado terminaban lanzando `PrismaClientKnownRequestError` en
vez de `DuplicateNameError` / `DuplicateSymbolError`. **R11 y R12 estaban rotos**, y **ningun test
unitario con dobles podia verlo**: solo lo vio el test de integracion contra base real.

**Como se resolvio.** Se discrimina por **columna** (`name_normalized` da `duplicate_name`,
`symbol` da `duplicate_symbol`), que es el patron que la casa **ya tenia documentado para este
mismo motor y version** desde QC-25 en `recipe-prisma.ts` (`RECIPE_NAME_UNIQUE_COLUMN`,
`isUniqueNameViolation`) y que tambien sigue `supplier-prisma.ts`. **La intencion de
`design.md > 7.1` se conserva entera**, incluida la parte que si acertaba y que es deliberada: un
`target` **desconocido o ausente se RELANZA**, nunca se disfraza de «ya existe ese nombre», que
seria mentira y no dejaria rastro. Queda escrito en el codigo, citando el precedente.

**Ningun test se toco para que pasara**: los dos casos estuvieron rojos hasta que el adaptador se
arreglo.

> **Para el leader / el humano:** conviene **corregir `design.md > 7.1`**, que hoy describe un
> mecanismo que no funciona. El codigo ya lleva la nota, pero el spec sigue diciendo lo contrario.

## Los centinelas de alcance, retensados y no aflojados

`tests/unit/unidades/module-contract.test.ts` tenia **tres casos rojos** que **no eran un fallo**:
son limites de alcance de la epoca QC-26/QC-32, escritos cuando `unidades` **todavia no tenia
escritura**, y que decian literalmente «esto lo hara QC-38». Esta ficha **es** QC-38.

Se retensaron en T10, con su parrafo de cabecera fechado («ronda 6, QC-38»), como el archivo ya
hizo en sus rondas 4 y 5. **Retensar no es aflojar, y el diff lo demuestra**: las listas siguen
siendo **exactas** (`toEqual` sobre listas cerradas) y **no se introdujo ni un `toContain`, ni un
`.skip`, ni un `.only`**. Los `expect` pasaron de 7 retirados a **14 anadidos**.

| Centinela | Antes | Ahora | Por que no es aflojar |
| --- | --- | --- | --- |
| Fuentes de `ports/` | exactamente 2 | exactamente 3, mas `unit-write-repository.ts` | sigue `toEqual` de lista cerrada; un cuarto puerto la rompe |
| Adaptadores que consultan `prisma.unit` | exactamente 2 | exactamente 3, mas `unit-write-prisma.ts` | idem, y verificado tambien contra dos entradas sinteticas |
| Funciones de `unit-actions.ts` | exactamente `['listUnitsAction']` | exactamente las cuatro | idem |
| Los identificadores de escritura en el modulo | **prohibidos en todos** | **obligatorios** cada uno en su caso de uso y en `unit-actions.ts`, y **prohibidos en cualquier otro** | la prohibicion se **invierte y se acota por archivo**: es mas estricta, no menos |
| Escritura a `prisma.unit` | prohibida en todos | **obligatoria en EXACTAMENTE** `unit-write-prisma.ts` y prohibida en el resto | idem |
| `lib/composition` | no podia nombrar escritura de unidades | **debe** cablear las tres claves | idem |

`renameUnit` **sigue prohibido** en todo el modulo, y `index.ts` sigue sin exportar ninguna action.

## Archivos creados y modificados

Todo bajo el worktree. El arbol principal **no se toco**.

### Produccion

| Archivo | Que |
| --- | --- |
| `lib/modules/identity/domain/permissions.ts` | `unidades.modificar` en `PERMISSIONS` (once) y en el seed del `Administrador`; la enmienda a QC-74 R2 escrita en la cabecera |
| `lib/modules/unidades/domain/errors.ts` | las **seis** clases nuevas con su `code` estable |
| `lib/modules/unidades/domain/unit-input.ts` | **nuevo** — el esquema zod UNICO de alta y edicion |
| `lib/modules/unidades/domain/create-unit.ts` | **nuevo** — `createCreateUnit` y `assertValidDerivation`, la equivalencia compartida |
| `lib/modules/unidades/domain/update-unit.ts` | **nuevo** — `createUpdateUnit` |
| `lib/modules/unidades/domain/delete-unit.ts` | **nuevo** — `createDeleteUnit` |
| `lib/modules/unidades/ports/unit-write-repository.ts` | **nuevo** — el puerto de escritura |
| `lib/modules/unidades/adapters/driven/persistence/unit-write-prisma.ts` | **nuevo** — los cinco metodos y la traduccion de `P2002`/`P2003` |
| `lib/modules/unidades/adapters/driving/unit-actions.ts` | tres actions y dos tipos de estado nuevos; `listUnitsAction`, `currentActor` y `toErrorState` intactos |
| `lib/modules/unidades/index.ts` | reexporta los seis errores y las tres fabricas; **ninguna action** |
| `lib/composition/index.ts` | el bloque `unidades` ampliado, sin reordenar nada de lo de arriba |

**No se tocaron**, a proposito: `ports/unit-repository.ts`, `unit-prisma.ts`,
`unit-catalog-prisma.ts` (R33), `db/schema.prisma` ni `db/migrations/` (R32).

### Tests

| Archivo | Que |
| --- | --- |
| `tests/unit/unidades/errors.test.ts` | **nuevo**, 2 casos |
| `tests/unit/unidades/unit-input.test.ts` | **nuevo**, 15 casos |
| `tests/unit/unidades/unit-write-port.test.ts` | **nuevo**, 2 casos, uno en tiempo de tipos |
| `tests/unit/unidades/unit-write-permissions.test.ts` | **nuevo**, los tres casos de uso por seis formas de actor |
| `tests/unit/unidades/create-unit.test.ts` | **nuevo**, 19 casos |
| `tests/unit/unidades/update-unit.test.ts` | **nuevo**, 21 casos |
| `tests/unit/unidades/delete-unit.test.ts` | **nuevo**, 6 casos |
| `tests/unit/unidades/unidades-convenciones.test.ts` | **nuevo**, 16 casos, cada guardia con su caso de «MUERDE» |
| `tests/unit/unidades/unit-actions.test.ts` | ampliado; los casos de QC-76 intactos |
| `tests/unit/unidades/module-contract.test.ts` | los tres centinelas retensados |
| `tests/integration/unidades/unit-write.int.test.ts` | **nuevo**, 16 casos contra base real |
| los **seis** ajenos del ripple | solo conteo y texto: `guard-permisos-sembrados`, `guard-nav-permisos-declarados`, `qc75-convenciones`, `identity/permissions`, `seed-initial-access`, `identity-seed.int` |

## Mapa `R<n>` a test

**VERDE** significa lo unico que cuenta: el test **existe, se ejecuta y pasa**. Las 36 filas, sin
hueco (regla 4 de `CLAUDE.md`). Abreviaturas: `cu` = `create-unit.test.ts`,
`uu` = `update-unit.test.ts`, `du` = `delete-unit.test.ts`,
`wp` = `unit-write-permissions.test.ts`, `ui` = `unit-input.test.ts`,
`ua` = `unit-actions.test.ts`, `mc` = `module-contract.test.ts`,
`conv` = `unidades-convenciones.test.ts`, `int` = `unit-write.int.test.ts`.

| R | Test concreto | Estado |
| --- | --- | --- |
| R1 | `mc`: los tres casos de uso de escritura existen, cada uno en su archivo, y no hay ninguno de consulta nuevo | VERDE |
| R2 | `wp`: los tres exigen `'unidades.modificar'`. `conv`: ninguna comparacion por nombre de rol en `lib/modules/unidades/**`, con su caso de «MUERDE» | VERDE |
| R3 | `wp`: actor `null`/`undefined`, sin conjunto, conjunto vacio, `'unidades.'` y `'unidades.consultar'` dan `UnauthorizedError` y **cero** llamadas al puerto; mas «el permiso se comprueba ANTES que zod» | VERDE |
| R4 | `identity/permissions.test.ts`: `QC-38 R4: el Operador sigue teniendo exactamente inventario.consultar, ninguno de unidades`, y `R8: el Administrador tiene los once permisos, escritos uno a uno` | VERDE |
| R5 | `guard-permisos-sembrados.test.ts`: `el catalogo real no esta vacio y tiene exactamente once permisos`. `identity-seed.int.test.ts`: la doble corrida no cambia ningun conteo | VERDE |
| R6 | `cu`: `R6: entrada valida crea una fila y devuelve su id`. `int`: `crea una fila con la empresa del actor, con simbolo y con derivacion` | VERDE |
| R7 | `cu`: `R7: la fila creada lleva actor.companyId, no la empresa de la entrada`. `unit-write-port`: un `UnitWriteRow` con `companyId` **no compila**. `int`: las dos altas | VERDE |
| R8 | `ui`: `rechaza vacio, solo espacios y un nombre que normaliza a la cadena vacia` y `recorta los espacios de los extremos antes de guardar`. `cu`: el caso de `'  kilo  '` | VERDE |
| R9 | `ui` y `cu`: `acepta 60 caracteres y rechaza 61`. `unidades-schema.test.ts`: la columna no gana ninguna restriccion | VERDE |
| R10 | `ui`: `la clave ausente acepta, y symbol NO aparece en la salida` y `acepta 10 caracteres y rechaza 11`. `cu`: `acepta una unidad sin simbolo` | VERDE |
| R11 | `int`: `rechaza el mismo nombre normalizado en la MISMA empresa con DuplicateNameError` y `acepta el mismo nombre normalizado en OTRA empresa y frente a una unidad DE SISTEMA` | VERDE |
| R12 | `int`: `rechaza el mismo simbolo en la MISMA empresa con DuplicateSymbolError` y `acepta DOS unidades sin simbolo en la MISMA empresa: el indice es parcial` | VERDE |
| R13 | `ui`: `rechaza solo baseUnitId`, `rechaza solo factor`, `acepta ninguno de los dos (unidad base)`. `cu`: los tres equivalentes | VERDE |
| R14 | `ui`: `acepta 0.5`, `rechaza 0`, `rechaza negativo`, `rechaza un quinto decimal`, `rechaza un valor que no es un decimal valido`. `int`: `guarda '0.5' y lo relee como 0.5000` | VERDE |
| R15 | `uu`: `la base declarada a su vez deriva de otra (mas de un nivel)`, `auto-referencia (baseUnitId === id)` y `«ya soy base de alguien» (hasDerivedUnits), sin consultar la base declarada` | VERDE |
| R16 | `uu`: `la base declarada pertenece a otra empresa` y `la base declarada no existe` rechazan; `acepta una base de la PROPIA empresa` y `acepta una base DE SISTEMA`. `int`: los dos casos contra base real | VERDE |
| R17 | `uu`: `sin simbolo BORRA el simbolo (null)` y `sin base ni factor deja la unidad BASE`. `int`: `una edicion que borra el simbolo y la derivacion deja la unidad BASE` | VERDE |
| R18 | `uu`: la tabla de R8 a R16 ejecutada tambien contra `updateUnit` (`rechaza un nombre de 61`, `rechaza un simbolo de 11`, `base sin factor`), con el **mismo** esquema | VERDE |
| R19 | `unit-write-port`: `UnitWriteRow` no lleva `companyId`, con `@ts-expect-error`. `int`: `la fila conserva su company_id despues de editar` | VERDE |
| R20 | `int`: `un producto y una linea de receta siguen intactos tras cambiar la base y el factor` | VERDE |
| R21 | `uu`: `R21: unidad de sistema -> SystemUnitError, y update NO se llama` | VERDE |
| R22 | `uu`: `R22: unidad inexistente -> NotFoundError` y `R22: unidad de otra empresa -> NotFoundError` | VERDE |
| R23 | `int`: `tras borrar, la unidad ya no existe`. `conv`: `units` sigue sin `deleted_at`. `unidades-schema.test.ts` | VERDE |
| R24 | `int`: los tres bloqueos, `por un PRODUCTO`, `por una LINEA DE RECETA` y `que es BASE de otra`, dan `UnitInUseError` con las filas intactas. `du`: `hasDerivedUnits` **no se llama**, ninguna consulta de uso previa | VERDE |
| R25 | `du`: `R25: unidad de sistema -> SystemUnitError, sin llamar a deleteById` | VERDE |
| R26 | `du`: `R26: unidad inexistente -> NotFoundError` y `R26: unidad de otra empresa -> NotFoundError` | VERDE |
| R27 | `mc`: las cuatro actions viven en `adapters/driving/unit-actions.ts`. `conv`: ningun `route.ts` ni endpoint HTTP nuevo, con su caso de «MUERDE» | VERDE |
| R28 | `cu`: `R28: entrada con forma invalida -> ValidationError, y el puerto no se llama` | VERDE |
| R29 | `ua`: sesion ausente y contexto ausente, sin tocar el repositorio | VERDE |
| R30 | `errors`: los nueve codigos son distintos entre si. `ua`: cada error de dominio a su `code`, y un `TypeError` **se relanza** | VERDE |
| R31 | `mc`: `index.ts` no exporta ninguna action y su cierre de imports no contiene `'use server'`. `conv`: lo mismo, con su caso de «MUERDE» | VERDE |
| R32 | `conv`: `db/schema.prisma` sin cambios y ninguna carpeta de migracion nueva en el diff contra `origin/dev`. `unidades-migration.test.ts` | VERDE |
| R33 | `list-units.test.ts`, `list-units-query.test.ts`, `unit-prisma-where.test.ts` y `unit-repository.int.test.ts`, **verdes sin tocarlos** | VERDE |
| R34 | `conv`: ninguna ruta, pantalla ni item de menu de unidades, y ningun `.spec.ts` nuevo en `e2e/`. `qc75-convenciones.test.ts` | VERDE |
| R35 | `conv`: `package.json` sin dependencias nuevas. `guard-dependencias-aprobadas.test.ts` | VERDE |
| R36 | `ui`: `rechaza vacio y solo espacios, y NO los convierte en null ni en undefined`. `cu` y `uu`: en alta y en edicion. `ua`: `FormData` **sin** clave `symbol` pasa, frente a **con** `symbol` vacio que da `invalid_input` | VERDE |

## Verificacion — salida real

```
$ pnpm typecheck
> tsc --noEmit
(sin salida — verde)

$ pnpm lint
> eslint
(sin salida — verde)

$ pnpm exec vitest run tests/unit/unidades tests/guards tests/unit/identity tests/unit/composition
 Test Files  71 passed (71)
      Tests  952 passed (952)

$ set -a && . ./.env && set +a && pnpm exec vitest run tests/integration      # T11, ENTERO
 Test Files  28 passed (28)
      Tests  400 passed (400)
   Duration  24.46s
```

**`tests/integration` queda ENTERO en verde**, no solo `tests/integration/unidades`. Es la
exigencia explicita de T11 por el bloqueante de QC-76 —donde una restriccion nueva sobre `units`
dejo once archivos ajenos en rojo hasta el final—. Esta ficha **no anade ninguna restriccion**
(R32), y esta corrida es lo que **lo demuestra** en vez de afirmarlo.

> **Nota operativa:** los tests de integracion necesitan el `.env` cargado en el shell
> (`set -a && . ./.env && set +a`). Sin eso Prisma falla con
> `Environment variable not found: DATABASE_URL` y **todo** `tests/integration` sale rojo por
> conexion, no por codigo. El `.env` no esta versionado; se copio del arbol principal al montar
> el worktree, junto con `pnpm install`, `prisma generate` y `next typegen`.

## Rojos que NO son de esta feature

| Test | Que pasa | Veredicto |
| --- | --- | --- |
| `tests/unit/navegacion/qc75-convenciones.test.ts`, caso `el rango de la rama trae archivos y contiene el trabajo de QC-75` | Centinela **anti-vacuidad de QC-75** que exige que `git diff origin/dev...HEAD` contenga `lib/shared/navigation/private-nav.ts`. En la rama de QC-38 ese rango trae los commits de QC-38, no los de QC-75, asi que **es estructuralmente imposible** que pase aqui | **Ajeno y estructural.** Mismo patron que las dos entradas de `recetas` que ya estan en `tests/baseline-rojos.json` por esta misma razon, pero **este archivo NO esta en el baseline**. **Lo decide el leader o el humano**: o se anade con su motivo, o el caso se auto-salta cuando el rango no lo incluye. **No lo toque**: anadir una entrada al baseline afloja el gate y no me corresponde |
| `tests/unit/proveedores-ui/supplier-page.test.tsx`, `catalog-line-sheet.test.tsx`, `tests/unit/inventario/product-page.test.tsx` | Flake de `userEvent` bajo carga | **Ya en `tests/baseline-rojos.json`.** Verificado: en aislado pasan 50/50 |
| `tests/integration/identity/identity-seed.int.test.ts`, en una corrida intermedia | Deadlock `40P01` por otra sesion contra la misma base | **Contencion transitoria.** En la corrida final quedo verde, 400/400 |

## E2E — diferido, con motivo (T13, R34)

**No se escribio ningun `.spec.ts`, y `e2e/` no gano ningun archivo.** El motivo es el de la
**decision cerrada 21**: esta ficha **no tiene pantalla ni flujo navegable que un test E2E pueda
visitar** —son casos de uso y su superficie de servidor—. Quien abra ese flujo es **QC-39**, la
ficha de la pantalla de unidades, y es ahi donde el E2E tiene sentido. Mismo criterio que QC-32 y
que QC-20 D4. La guardia de convenciones vigila que siga siendo cierto.

## Estado de las tasks

Las **13** cerradas: T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13. **T1 no existe** —era la
puerta de la pregunta abierta que el humano cerro el 2026-09-08— y **el resto no se renumero** a
proposito, igual que `R36` va al final por el mismo motivo.

El gate de T12 (`./init.sh --rapido` y `./init.sh` completo) **lo corre el leader**: no me
autoapruebo.

## Lo que el leader tiene que mirar

1. **`design.md > 7.1` describe un mecanismo falso**, los nombres de indice en `meta.target`. El
   codigo ya esta corregido y anotado, pero **el spec sigue diciendo lo contrario** y conviene
   corregirlo antes de cerrar la ficha.
2. **`tests/unit/navegacion/qc75-convenciones.test.ts` tiene un rojo estructural ajeno** que no
   esta en el baseline y que **hara fallar `./init.sh` completo** en esta rama. Hay que decidir
   que se hace con el; no lo toque por mi cuenta.
3. La rama lleva **seis commits** de implementacion. **No se pusheo, no se abrio PR y no se
   mergeo**, como se pidio.
