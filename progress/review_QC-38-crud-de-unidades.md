# QC-38 — crud-de-unidades · review

> Zona `backend` · complejidad `medium` · rama `feature/QC-38-crud-de-unidades`
> Worktree `.worktrees/QC-38-crud-de-unidades/` · diff `git diff origin/dev...HEAD` (12 commits)
> Revisado el 2026-09-08 por `reviewer`. **No se edito ni una linea de codigo**: todas las
> mutaciones de esta revision se revirtieron y `git status --porcelain` quedo limpio.

## Veredicto

**APROBADO.** Cero hallazgos mayores, cinco menores. **36 de 36 requisitos verificados uno a
uno** —test leido, ejecutado y contrastado contra lo que el requisito dice—, con **8 mutaciones**
al codigo de produccion que **mordieron las 8**.

## Checklist

### Especificacion
- [x] `requirements.md` con 36 requisitos EARS numerados, cero preguntas abiertas, las 24
      decisiones cerradas con su `R<n>` en la tabla de cobertura.
- [x] `design.md` con cuatro alternativas descartadas y su porque (A: ampliar `UnitRepository`;
      B: delegar la equivalencia al disparador; C: `SELECT` previo de unicidad; D: `upsert`).
- [x] `tasks.md` con **las 13 tasks marcadas `[x]`**. T1 no existe a proposito —era la puerta de
      la pregunta abierta que el humano cerro el 2026-09-08— y el resto **no se renumero**, igual
      que `R36` va al final. Verificado: no hay hueco disfrazado.

### Trazabilidad (regla 4 de `CLAUDE.md`)
- [x] Cada `R<n>` mapea a un test que **existe, se ejecuta y afirma lo que el requisito dice**.
      Detalle en la tabla de mas abajo.
- [x] `progress/impl_QC-38-crud-de-unidades.md` contiene el mapa `R1`-`R36` a test, y **es
      exacto**: se contrasto fila por fila contra los archivos reales.
- [x] Ningun test vacio, ningun `expect` de adorno, ningun `.skip` ni `.only` en el codigo nuevo.

### Verificacion ejecutable
- [x] `pnpm typecheck` — verde, sin salida.
- [x] `pnpm lint` — verde, sin salida.
- [x] `vitest run tests/unit/unidades tests/guards tests/unit/identity tests/integration/unidades`
      — **74 archivos, 1011 tests, todos verdes**.
- [x] `vitest related --run` sobre el diff de la feature — **146 archivos, 1933 tests verdes**,
      2 saltados (los dos centinelas de QC-75, que se auto-saltan fuera de su rama).
- [x] **Suite completa**: `vitest run` da **3194 verdes de 3213**, 9 saltados, **10 rojos en 2
      archivos**: `tests/unit/proveedores-ui/supplier-page.test.tsx` y `catalog-line-sheet.test.tsx`.
      **Los dos estan en `tests/baseline-rojos.json`** desde el 2026-09-04 (flake de `userEvent`
      bajo carga, de QC-44). **Ningun rojo es de QC-38**, y con el baseline aplicado esta corrida
      deja el gate en verde.
- [x] La integracion se corrio con el `.env` cargado en el shell, como pide la nota nueva de
      `docs/verification.md`.

**Sobre el flake de saturacion:** mi corrida completa tumbo un conjunto **distinto** del de las
dos del leader (que cayeron en `identity-facade`, `pedidos-ui` y `login-form`). Eso **confirma** el
diagnostico —el conjunto rota bajo carga y por eso el baseline no lo absorbe— en vez de
contradecirlo. No se invirtio mas tiempo en re-diagnosticarlo; queda para QC-58.

### Calidad y seguridad
- [x] **Permiso validado en el SERVICE, primera linea, y con su test.** Los tres casos de uso
      abren con `requirePermission(actor, 'unidades.modificar')` **antes de zod y antes del
      puerto**. `unit-write-permissions.test.ts` prueba las **seis** formas de actor no
      autorizado por los **tres** casos de uso, con dobles que **explotan si se les llama**, y un
      caso explicito de «el permiso se comprueba ANTES que zod».
- [x] **`unidades.consultar` NO implica `unidades.modificar`**: hay un caso dedicado.
- [x] Ninguna comparacion por nombre de rol en `lib/modules/unidades/**`, con guardia y su caso
      de «MUERDE».
- [x] Aislamiento por empresa: `createUnit` toma la empresa **del actor** —`create(companyId, row)`,
      empresa como argumento propio, y `UnitWriteRow` **no la lleva**, probado con
      `@ts-expect-error`—; `updateUnit`/`deleteUnit` rechazan la unidad de otra empresa con
      `NotFoundError` —no con `unauthorized`, para no dar un oraculo de existencia— y tienen test
      del rechazo cruzado. Ninguna migracion, ningun modelo nuevo en `db/schema.prisma`.
- [x] RLS: no hay tabla nueva. `units` ya venia con `ENABLE` + `FORCE ROW LEVEL SECURITY` de
      QC-76, y esta ficha no lo toca.
- [x] Capas separadas: `domain/` y `ports/` no importan framework ni Prisma; el unico archivo del
      modulo que gana un import de `@prisma/client` es el adaptador driven; el driving pide todo a
      `lib/composition`; el barrel **no** reexporta ninguna action y ningun archivo alcanzable
      desde el declara `'use server'` (guardia con su «MUERDE»).
- [x] Sin secretos, sin hardcode de contexto: la empresa sale de `getSessionContext()`, nunca de
      la entrada del llamante.
- [x] Errores de dominio con `code` estable; lo que no es de dominio **se relanza** (test con
      `TypeError` en las tres actions).

### Multiplataforma
- [x] **No aplica**: la feature no toca UI. `unidades-convenciones.test.ts` lo verifica de forma
      activa —ninguna pantalla bajo `app/(private)/`, ningun item de menu, ningun `.spec.ts`
      nuevo bajo `e2e/`—, asi que R34 no es una promesa sino una guardia.

### Dependencias
- [x] `package.json` **identico a `origin/dev`** en `dependencies` y `devDependencies`,
      comprobado por guardia contra el `package.json` de `origin/dev`, ademas de
      `guard-dependencias-aprobadas`. Nada que anadir a `docs/dependencias.md`.
- [x] Ninguna utilidad escrita a mano que ya resuelva una libreria del stack: la validacion es
      **zod**, ya aprobada.

## Los cinco puntos que el leader pidio mirar

### 1. La enmienda a QC-74 R2 esta EN EL CODIGO, y la guardia sigue mordiendo

`lib/modules/identity/domain/permissions.ts` gana la entrada `unidades.modificar` y, en la
cabecera, la enmienda **escrita con esas palabras**: «Esto enmienda QC-74 R2 ("exactamente diez
permisos, ni uno mas ni uno menos"). QC-74 R4 dejo a `unidades` sin escritura justificandolo con
"no tiene escritura"; QC-38 es justamente la ficha que se la da», mas la habilitacion de QC-76
decision 24. El `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]` **suma** el codigo nuevo **junto a**
`unidades.consultar`, que sigue ahi; el `Operador` no recibe ninguno de los dos.

**La guardia sigue vigente y sigue mordiendo, ahora con once.** Mutacion: se borro la entrada del
catalogo y **cayeron 17 casos en los seis archivos**, incluidos los `toEqual` de lista cerrada de
`permissions.test.ts`, el conteo exacto de `guard-permisos-sembrados` y la doble corrida del seed
contra base real. La invariante «ni uno mas ni uno menos» no se relajo: se reancla en 11.

### 2. Los seis tests ajenos: solo conteo y texto, comprobado con el diff

Leido el diff de los seis archivos, linea a linea. **No se borro ni un `expect`, no se degrado
ningun `toEqual` a `toContain`, no se salto ningun caso.** Lo que cambia son numeros (10 a 11,
11 a 12 asignaciones), comentarios, y la pertenencia de `unidades` a `MODULOS_CON_ESCRITURA` en
vez de `MODULOS_SIN_ESCRITURA` —que es lo que la ficha hace de verdad—.
`permissions.test.ts` ademas **gana** dos casos de R4. Los `toEqual` sobre listas cerradas siguen
siendo listas cerradas.

Mismo veredicto para el «retensado» de `module-contract.test.ts`: las tres listas exactas siguen
siendo `toEqual`, la prohibicion de nombrar escrituras **se invirtio y se acoto por archivo**
—mas estricta, no menos—, `renameUnit` sigue prohibido en todo el modulo, y `lib/composition`
pasa de «no puede nombrar escritura» a «**debe** cablear las tres claves». Cero `toContain`,
cero `.skip`, cero `.only` en el diff.

### 3. El P2002: codigo y spec dicen ya lo mismo, y R11/R12 se verifican en integracion

`unit-write-prisma.ts` discrimina **por COLUMNA** —`name_normalized` da `duplicate_name`,
`symbol` da `duplicate_symbol`—, citando el precedente de QC-25 en `recipe-prisma.ts`, y
**relanza** la columna desconocida o el `target` ausente. `design.md > 7.1`, corregido en
`f10a20e`, dice exactamente eso, incluido el recuadro que explica por que ningun test con dobles
podia cazarlo. **Codigo y spec coinciden.**

**Comprobado con la mutacion mas importante de esta revision:** se revirtieron las dos constantes
a los NOMBRES de indice, tal como lo mandaba la version vieja del design, y
`tests/integration/unidades/unit-write.int.test.ts` se puso **rojo en los dos casos exactos**:

```
FAIL ... R11 > rechaza el mismo nombre normalizado en la MISMA empresa con DuplicateNameError
     AssertionError: expected PrismaClientKnownRequestError to be an instance of DuplicateNameError
FAIL ... R12 > rechaza el mismo simbolo en la MISMA empresa con DuplicateSymbolError
     AssertionError: expected PrismaClientKnownRequestError to be an instance of DuplicateSymbolError
```

O sea: el defecto era real, R11 y R12 **estaban rotos en produccion** con el mecanismo del design
original, y el unico nivel capaz de verlo —la integracion contra Postgres real— es donde estan.
El hallazgo del implementer se confirma entero.

### 4. R36 y R10 no se pisan

Tres niveles, y los tres muerden. Mutacion: `symbolSchema` de `.min(1)` a `.min(0)` deja **5 casos
rojos** en `unit-input`, `create-unit` y `update-unit`. La clave **ausente** sigue aceptandose
—`.optional()` del objeto, con su caso que afirma `symbol` `undefined` en la salida—; la clave
**presente y vacia** se rechaza con `invalid_input` y **no produce `data`**: el test lo afirma con
`expect('data' in vacio).toBe(false)`, que es exactamente «no se convirtio en null ni en ausente».
En el borde, `candidateFromFormData` usa `formData.has(key)` y hay un par de casos en
`unit-actions.test.ts` que prueban los dos lados: sin clave, `symbol: undefined` pasa; con clave
vacia, `symbol: ''` y `invalid_input`. R10 y R36 quedan separados donde tenian que quedarlo.

### 5. Cero regresion en `unidades`

El diff de `lib/modules/unidades` confirma que **no se tocaron** `ports/unit-repository.ts`,
`domain/list-units.ts`, `domain/unit-scope.ts`, `adapters/driven/persistence/unit-prisma.ts`
—donde vive `companyScopeWhere`, el filtro empresa-o-sistema de QC-76— ni `unit-catalog-prisma.ts`.
`convert-quantity` tampoco. Los tests de lectura de QC-76 —`list-units`, `list-units-query`,
`unit-prisma-where`, `unit-repository.int`, `list-query-units.int`, `unidades-constraints.int`,
`convert-quantity`— pasan **sin haberlos tocado**. `listUnitsAction` conserva firma y
comportamiento; las tres actions nuevas se le suman sin reescribir `currentActor` ni
`toErrorState`.

## Trazabilidad: los 36, verificados uno a uno

Se leyo el cuerpo de cada test citado y se contrasto contra la letra del requisito. `MUT` marca
los cubiertos ademas por una mutacion que puso el test en rojo.

| R | Como se verifico | |
| --- | --- | --- |
| R1 | `module-contract`: tres casos de uso de escritura, cada uno en su archivo; ninguno de consulta nuevo; listas `toEqual` cerradas | OK |
| R2 | `unit-write-permissions` (los tres exigen el codigo exacto) + `unidades-convenciones` (cero comparacion por rol, con «MUERDE») | OK · **MUT** |
| R3 | `unit-write-permissions`: 6 formas de actor por 3 casos de uso, con dobles que explotan si se les llama, mas «el permiso va ANTES que zod» | OK · **MUT** |
| R4 | `identity/permissions.test.ts`: dos casos QC-38 explicitos (Administrador con los dos codigos; Operador con ninguno) | OK · **MUT** |
| R5 | `guard-permisos-sembrados` (exactamente once) + `identity-seed.int` (doble corrida, conteos estables) | OK · **MUT** |
| R6 | `create-unit` (id devuelto) + `unit-write.int` (fila real en la base) | OK |
| R7 | `create-unit` (empresa del actor aunque la entrada traiga otra) + `unit-write-port` (`@ts-expect-error`) + `unit-write.int` (dos altas, `company_id` real) | OK |
| R8 | `unit-input` (vacio, solo espacios, `---`, y `'  kilo  '` que sale `'kilo'`) + `create-unit` | OK · **MUT** |
| R9 | `unit-input` y `create-unit` (60 acepta, 61 rechaza) + `schema/unidades-schema` (`name` sigue TEXT sin limite) | OK |
| R10 | `unit-input` (clave ausente acepta; 10 si, 11 no) + `create-unit` + `unit-write.int` (`symbol` null, no cadena vacia) | OK |
| R11 | `unit-write.int`, **en integracion**: misma empresa rechaza y no escribe fila; otra empresa y unidad de sistema aceptan | OK · **MUT** |
| R12 | `unit-write.int`, **en integracion**: `DuplicateSymbolError` y **no** `DuplicateNameError`; dos sin simbolo conviven | OK · **MUT** |
| R13 | `unit-input` (solo base, solo factor, ninguno) + `create-unit` | OK |
| R14 | `unit-input` (0, 0.0000, -1, abc, 1.00001, 0.5) + `unit-write.int` (0.5 se relee 0.5000 por SQL crudo, sin el `toString()` que comeria los ceros) | OK · **MUT** |
| R15 | `update-unit`: los tres casos —base que deriva, auto-referencia, «ya soy base de alguien» con `findOwnership` llamado **una sola vez**— | OK · **MUT** |
| R16 | `update-unit` (otra empresa, inexistente, propia, de sistema) + `unit-write.int` contra base real | OK |
| R17 | `update-unit` (sin simbolo lo pone a null; sin base ni factor deja base) + `unit-write.int` | OK |
| R18 | `update-unit`: la tabla de R8-R16 reejecutada contra `updateUnit`, y el esquema es literalmente **el mismo objeto** que el del alta | OK |
| R19 | `unit-write-port` (`companyId` no asignable a `UnitWriteRow`) + `unit-write.int` (`company_id` intacto tras editar) | OK |
| R20 | `unit-write.int`: producto y linea de receta intactos, con `quantity` verificada, tras cambiar base y factor | OK |
| R21 | `update-unit`: unidad de sistema da `SystemUnitError` y `update` **no** se llama | OK · **MUT** |
| R22 | `update-unit`: inexistente y de otra empresa dan `NotFoundError`, `update` no se llama | OK |
| R23 | `unit-write.int` (cero filas tras borrar) + `unidades-convenciones` y `schema/unidades-schema` (`Unit` sin `deletedAt`) | OK |
| R24 | `unit-write.int`: los tres bloqueos —producto, linea, unidad derivada— con filas intactas + `delete-unit` (`hasDerivedUnits` **no** se llama: ninguna consulta de uso previa) | OK · **MUT** |
| R25 | `delete-unit`: de sistema da `SystemUnitError` sin llamar a `deleteById` | OK |
| R26 | `delete-unit`: inexistente y de otra empresa dan `NotFoundError` | OK |
| R27 | `module-contract` (las cuatro actions viven en `unit-actions.ts`) + `unidades-convenciones` (ningun `route.ts`, con «MUERDE») | OK |
| R28 | `create-unit`: forma invalida da `ValidationError` y el puerto no se llama | OK |
| R29 | `unit-actions`: sin sesion y sin contexto, el actor llega `null` a las tres | OK |
| R30 | `errors.test.ts` (los nueve `code` distintos) + `unit-actions` (8 clases por 3 actions con su `code`; `TypeError` **relanzado**) | OK |
| R31 | `module-contract` + `unidades-convenciones`: el barrel no nombra ninguna action y nada alcanzable declara `'use server'`, con «MUERDE» | OK |
| R32 | `unidades-convenciones`: `db/schema.prisma` fuera del diff y cero carpetas nuevas en `db/migrations/`, con «MUERDE» sobre listas sinteticas | OK |
| R33 | Los archivos de lectura de QC-76 pasan **sin tocarse**, y el diff confirma que sus fuentes tampoco | OK |
| R34 | `unidades-convenciones`: ninguna pantalla, ningun item de menu, ningun `.spec.ts` nuevo | OK |
| R35 | `unidades-convenciones` (`package.json` identico a `origin/dev`) + `guard-dependencias-aprobadas` | OK |
| R36 | `unit-input`, `create-unit`, `update-unit` y `unit-actions`: esquema, alta, edicion y borde `FormData` | OK · **MUT** |

### Las 8 mutaciones

| # | Mutacion | Resultado |
| --- | --- | --- |
| 1 | P2002 discriminado por NOMBRE de indice (la version vieja del design) | **2 rojos** en integracion: R11 y R12 |
| 2 | `symbolSchema`: `.min(1)` pasa a `.min(0)` | **5 rojos**: R36 en los tres niveles |
| 3 | `createUnit` exige `unidades.consultar` en vez de `unidades.modificar` | **1 rojo**: el caso «consultar no implica modificar» |
| 4 | `updateUnit` sin la rama `companyId === null` que da `SystemUnitError` | **1 rojo**: R21 |
| 5 | `updateUnit` sin la comprobacion `hasDerivedUnits` | **1 rojo**: R15 |
| 6 | `unidades.modificar` fuera de `PERMISSIONS` | **17 rojos** en los seis archivos ajenos |
| 7 | Regex del factor con signo y 8 decimales, y `nameSchema` sin `.trim()` | **8 rojos**: R8 y R14 |
| 8 | `deleteById` sin traducir P2003 a `'in_use'` | **3 rojos** en integracion: R24 |

**8 de 8 mordieron.** Ninguna mutacion paso desapercibida. Todas revertidas; arbol limpio.

## Hallazgos

### Mayores

**Ninguno.**

### Menores

**m1 — Un `id` malformado en `updateUnitAction`/`deleteUnitAction` escapa como error de Prisma,
no como `NotFoundError`.**
`deleteUnitAction` lee el `id` de `FormData` y lo pasa tal cual; `updateUnitAction` lo recibe por
parametro. Ninguno de los dos lo valida, y el `id` no pasa por `unitInputSchema` —que si valida
`baseUnitId` con `z.string().uuid()`—. Verificado contra base real con una sonda desechable:
`unidades.deleteUnit('no-es-uuid', actor)` lanza `PrismaClientKnownRequestError` (P2023,
«Inconsistent column data») desde `findOwnership`, y `toErrorState` **lo relanza** —correctamente,
porque no es un error de dominio—, asi que el llamante recibe una excepcion en vez de
`{ code: 'not_found' }`. **No hay impacto de seguridad**: no se lee, escribe ni borra ninguna fila,
y no hay fuga entre empresas. R22 y R26 estan verificados con ids **bien formados** e inexistentes,
que es lo que la letra del requisito pide. Pero un llamante con un id manipulado veria un 500 en
vez del error de negocio. **Para QC-39**: o se valida el `id` con `z.string().uuid()` en la action,
o el adaptador traduce P2023 a `'not_found'`. No bloquea esta ficha porque sin pantalla no hay
forma de alcanzarlo.
Archivos: `lib/modules/unidades/adapters/driving/unit-actions.ts` (`updateUnitAction`,
`deleteUnitAction`) y `lib/modules/unidades/adapters/driven/persistence/unit-write-prisma.ts`
(`findOwnership`).

**m2 — La bitacora cita dos archivos por un nombre que no es su ruta.**
El mapa de `progress/impl_QC-38-crud-de-unidades.md` cita `unidades-schema.test.ts` y
`unidades-migration.test.ts` para R9, R23 y R32; viven en `tests/unit/unidades/schema/` y **son de
QC-76, no nuevos de esta ficha**. Comprobado: los dos existen y afirman de verdad lo que se les
atribuye —`name` y `symbol` TEXT sin limite; `Unit` sin `deletedAt`; identificadores en ingles—.
Es un detalle de redaccion, no un requisito sin test: cada uno tiene ademas su caso en
`unidades-convenciones.test.ts`, que si es nuevo.

**m3 — El commit `7cd478b` mete trabajo de arnes que no esta en `tasks.md` de QC-38.**
`init.sh` (carga del `.env`), `docs/verification.md` (su nota) y el `ctx.skip` de
`tests/unit/navegacion/qc75-convenciones.test.ts` no son de esta ficha: son el arreglo del leader
al rojo estructural que el implementer levanto. Los tres cambios estan bien argumentados por
escrito y **el del centinela no afloja nada en la rama de QC-75** —solo se salta donde
`private-nav.ts` no esta en el rango, que es donde la guardia no podia significar nada—, pero
**viajan en el diff de QC-38 y aterrizaran en su PR**. Que el cuerpo del PR lo diga; no debe
leerse como si QC-38 hubiera tocado el gate por su cuenta.

**m4 — E2E diferido, con motivo, contra la letra de `CHECKPOINTS.md > Calidad de codigo`.**
El checkpoint pide un E2E cuando la feature toca permisos, y esta crea uno. La **decision cerrada
21** lo difiere con motivo escrito —no hay pantalla ni flujo navegable que visitar— y lo asigna a
QC-39, con precedente en QC-32 y QC-20 D4. Se acepta como excepcion declarada, no como olvido:
`unidades-convenciones.test.ts` ademas **vigila que siga siendo cierto** que no hay flujo. Queda
anotado para que QC-39 no lo herede en silencio.

**m5 — `assertValidDerivation` vive en `create-unit.ts` y `update-unit.ts` la importa.**
Compartirla es lo correcto —duplicarla seria peor, y R18 exige un solo juego de reglas—, pero un
caso de uso importando de otro caso de uso es un olor leve de capas; un `domain/derivation.ts`
propio dejaria el grafo mas plano. No incumple ninguna regla de `docs/architecture.md` y no se
pide cambiarlo aqui.

## Cierre

`./init.sh` completo antes del PR sigue siendo obligatorio (regla 5), y el humano ya decidio
esperar a **QC-58** por el flake de saturacion. Con el baseline vigente, la corrida completa de
esta revision deja el gate en verde y **ningun rojo es atribuible a QC-38**.

**Veredicto final: OK (APROBADO).** Sin bloqueantes. Vuelve al leader para el PR, no al
implementer.
