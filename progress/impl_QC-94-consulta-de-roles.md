# QC-94 — consulta-de-roles · bitacora de implementacion

> Zona: `backend` · Complejidad: `low` · depends_on: — · Rama: `feature/QC-94-consulta-de-roles`
> Worktree: `.worktrees/QC-94-consulta-de-roles` · Base: `13fc41c` (merge de QC-90 en `dev`)
>
> Spec aprobado por el humano el 2026-09-11. **21 requisitos** (R1-R21), **14 tasks** (T1-T14).
> Coordina el `implementer`; implementa `backend_dev` en dos tandas. El gate completo (`./init.sh`)
> lo corre el **leader** (T14): esta bitacora no se autoaprueba.

---

## 1. Que se construyo, y en que orden

Dos tandas, ambas cerradas en verde antes de pasar a la siguiente.

| Tanda | Tasks | Commits |
| --- | --- | --- |
| 1 — dominio, puerto y persistencia | T1-T7 | `0da459a`, `e4e1b0e`, `a906aad` |
| 2 — composicion, frontera y alcance | T8-T12 | `c18548a`, `860139e`, `915d356` |
| 3 — bitacora | T13 | este archivo |
| 4 — gate completo e historial | T14 | **pendiente, es del leader** |

## 2. Archivos

### 2.1 Produccion, nuevos (5)

| Archivo | Que es |
| --- | --- |
| `lib/modules/identity/domain/role-view.ts` | `RoleOption = { readonly id, readonly name }`. Dos claves y ninguna mas (R9). |
| `lib/modules/identity/ports/role-catalog-repository.ts` | Puerto de **solo lectura**: `listAll()` sin parametros —no hay donde colar la empresa (R11) ni una consulta (R12)— y sin ningun metodo de escritura (R17). |
| `lib/modules/identity/domain/list-roles.ts` | El caso de uso `createListRoles(deps)`. Dos lineas: `requireAnyPermission` primero, puerto despues. |
| `lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts` | `listAllRoles()`: `select` enumerado `{ id, name }` y `orderBy: { name: 'asc' }`. Unico archivo de la feature que toca la base. |
| `lib/modules/identity/adapters/driving/role-actions.ts` | `'use server'` + `listRolesAction()`: sin argumentos, actor de las dos caras de la sesion, traduccion por `code`. |

### 2.2 Produccion, modificados (4) — solo anadidos

| Archivo | Que gano |
| --- | --- |
| `lib/modules/identity/domain/require-permission.ts` | `holdsPermission` **privado** (cuerpo unico de la pertenencia, QC-74 R12) + `assertAnyPermission` con tupla no vacia. `assertPermission` conserva firma y comportamiento: solo delega. |
| `lib/modules/identity/domain/actor.ts` | `requireAnyPermission(actor, tupla): asserts actor is Actor`, con el mismo `UnauthorizedError`. |
| `lib/modules/identity/index.ts` | Bloque nuevo al final: `requireAnyPermission`, `RoleOption`, `createListRoles`, `ListRolesDeps`. **Solo de `./domain`**; `role-actions` NO se reexporta (R15). |
| `lib/composition/index.ts` | `roleCatalogRepository: RoleCatalogRepository = { listAll: listAllRoles }` y `listRoles: createListRoles({ roles: roleCatalogRepository })` como ultima clave de `identity`. 19 inserciones, 0 borrados. |

### 2.3 Tests (6)

`tests/unit/identity/require-any-permission.test.ts`,
`tests/unit/identity/roles/list-roles-authorization.test.ts`,
`tests/unit/identity/roles/list-roles.test.ts`,
`tests/unit/identity/roles/role-actions.test.ts`,
`tests/unit/identity/roles/scope.test.ts`,
`tests/integration/identity/role-catalog.int.test.ts`.

Mas **una** ampliacion aditiva de un test existente: `tests/unit/composition/identity-facade.test.ts`
gana un `describe` al final que afirma `identity.listRoles` (lo pide T8 al pie de la letra: «sigue
verde **con la clave nueva presente**»). Es la unica excepcion a «ningun test ajeno se toca», es
aditiva y no modifica ninguna afirmacion previa.

**`tests/unit/identity/require-permission.test.ts` no cambio ni una linea** y sigue verde, que es lo
que `design.md > 9.3` exige del refactor de T1.

### 2.4 Lo que NO se toco, verificado

`db/schema.prisma` (cero diff), `db/migrations/` (ninguna carpeta nueva), `package.json` y
`pnpm-lock.yaml` (fuera del diff), `app/`, `components/`, `e2e/`, `middleware.ts`, `lib/shared/**` y
`lib/modules/<otro>/**`. `tests/unit/identity/roles/scope.test.ts` lo **verifica contra el diff real
de la rama**, no de palabra.

`git diff --stat 13fc41c..HEAD`: **16 archivos, 1773 inserciones, 2 borrados**. Las dos unicas
borradas son las dos lineas del cuerpo viejo de `assertPermission`, que pasaron a `holdsPermission`.

---

## 3. Mapa `R<n> -> test` (real)

Los 21 requisitos, cada uno con su archivo y su caso. Ninguno queda sin test.

| R | Que exige | Test que lo demuestra |
| --- | --- | --- |
| R1 | Permiso como **primera linea**, antes de tocar el puerto | `tests/unit/identity/roles/list-roles-authorization.test.ts` — los casos de rechazo usan un doble del puerto que **lanza si lo llaman**, y ademas afirman `not.toHaveBeenCalled()` |
| R2 | Falla **cerrado**, pertenencia exacta, sin lectura por el puerto | `list-roles-authorization.test.ts` — «rechaza con `UnauthorizedError` y no lee nada» para actor ausente, sin conjunto, conjunto vacio, conjunto que no es lista y permiso ajeno (`inventario.consultar`); + `tests/unit/identity/require-any-permission.test.ts` — sin normalizacion (`'USUARIOS.CONSULTAR'`) y sin coincidencia parcial (`'usuarios.'`, `'usuarios.consultarlo'`) |
| R3 | Basta **uno** de los dos, no se exigen los dos | `list-roles-authorization.test.ts` — «resuelve y devuelve el catalogo completo» con **solo** `usuarios.consultar` y con **solo** `usuarios.modificar`, y «no exige los DOS a la vez»; + `require-any-permission.test.ts` — «no exige los DOS: con uno solo basta» |
| R4 | La decision **no** depende del rol del actor | `tests/unit/identity/roles/scope.test.ts` — «R4 — ningun archivo nuevo escribe a mano el nombre de un rol»; + `list-roles-authorization.test.ts`, donde ningun caso pasa rol (el `Actor` de QC-66 no tiene campo de rol) |
| R5 | El actor entra **por parametro**; el dominio no lee sesion | `tests/unit/identity/roles/list-roles.test.ts` — «la consulta declara UN solo parametro, el actor, y con el se resuelve» |
| R6 | El adaptador driving saca el actor de la sesion via `@/lib/composition`; falla cerrado a `null` | `tests/unit/identity/roles/role-actions.test.ts` — «las dos caras de la sesion se consultan una vez por invocacion», «responde `unauthorized` con actor `null` y sin tocar el puerto» (falta `getSessionUser`), e idem faltando `getSessionContext` «aunque la consulta no use la empresa» |
| R7 | Ninguna policy de RLS nueva, y no se apoya en ninguna | `scope.test.ts` — «R7 — ningun archivo nuevo declara ni se apoya en una policy de RLS» y «la rama no anade NINGUNA carpeta de `db/migrations/`»; + guardia existente `tests/guards/guard-rls-force.test.ts` |
| R8 | Devuelve **todos** los roles, sin limite | `list-roles.test.ts` — «no recorta, no reordena y no pagina» y «un catalogo vacio es una lista vacia, no un error»; + `tests/integration/identity/role-catalog.int.test.ts` — «no omite ninguna fila de la tabla» (contado contra la tabla real) |
| R9 | **Exactamente** `id` y `name` | `list-roles.test.ts` — «las claves son `['id','name']`» por `Object.keys(...).sort()`, y «el caso de uso no anade ni quita claves»; + `role-catalog.int.test.ts` — «los dos roles del seed estan, cada uno con su identificador», con las dos claves exactas contra Postgres |
| R10 | Orden por **nombre ascendente**, determinista | `role-catalog.int.test.ts` — «la secuencia completa coincide con el orden de la base», «el orden es determinista: dos invocaciones devuelven la misma secuencia» y «el `Administrador` del seed va antes que el `Operador`» |
| R11 | **No** se acota por empresa | `list-roles.test.ts` — «dos actores de empresas distintas reciben el MISMO conjunto con el mismo doble» y «llama al puerto SIN ningun argumento»; el propio puerto no tiene donde recibir la empresa |
| R12 | Ni pagina, ni busqueda, ni orden pedido; sin el contrato de QC-57 | `list-roles.test.ts` — «llama al puerto SIN ningun argumento (R11, R12)» y la firma de un solo parametro; + `scope.test.ts` — «R12 — ningun archivo nuevo usa el contrato de listado de QC-57 ni declara `ROLE_QUERYABLE`» |
| R13 | **Server Action** con argumento tipado, sin `FormData`, sin route handler | `role-actions.test.ts` — «su aridad declarada es 0», «se invoca SIN argumentos y devuelve el catalogo tal cual», «al caso de uso le llega el actor y SOLO el actor», y el caso del `FormData` |
| R14 | Error por **`code` estable**, con el traductor unico de `errores` | `role-actions.test.ts` — «`UnauthorizedError` sale como `{ status: error, code: unauthorized }`», «y sale igual con el TEXTO del mensaje cambiado: decide el codigo, no la frase», «un error que NO es de dominio sale como `unexpected`» |
| R15 | La action **no** se reexporta desde `index.ts` | `scope.test.ts` — «R15 — el contrato del modulo NO reexporta la Server Action de esta ficha»; + guardia existente `tests/guards/guard-arquitectura-modulos.test.ts` (bloque del contrato: nada de `'use server'`, `@prisma/client` ni `next/*` en el cierre transitivo) |
| R16 | Caso de uso en `domain/`, puerto en `ports/`, cableado **solo** en `lib/composition/` | Guardia existente `tests/guards/guard-arquitectura-modulos.test.ts` (regla de dependencias); + `tests/unit/composition/identity-facade.test.ts` — «expone `listRoles` y es una funcion» |
| R17 | **Ninguna escritura** sobre roles | `scope.test.ts` — «R17 — ningun archivo nuevo escribe sobre `role`/`role_permissions`», con los detectores probados en positivo (`prisma.role.create`, `rolePermission.deleteMany`, `INSERT INTO`) y en negativo (`findMany({ select })`, `SELECT id, name FROM`); el puerto no declara ningun metodo de escritura |
| R18 | Ninguna pantalla, pagina, componente ni ruta | `scope.test.ts` — «R18 — la rama no anade nada bajo `app/`, `components/` ni `e2e/`», contra el diff real de la rama |
| R19 | Ninguna migracion, cero diff en `db/schema.prisma` | `scope.test.ts` — «R19 — `db/schema.prisma` no esta en el diff de la rama: CERO diff» y «R19, R7 — la rama no anade NINGUNA carpeta de `db/migrations/`» |
| R20 | Ninguna dependencia nueva | `scope.test.ts` — «R20 — `package.json` ni `pnpm-lock.yaml` estan en el diff de la rama»; + guardia existente `tests/guards/guard-dependencias-aprobadas.test.ts` |
| R21 | El catalogo de permisos sigue en **trece** entradas | `scope.test.ts` — «R21 — el catalogo de permisos sigue teniendo TRECE entradas y ninguna de roles» |

**Nota sobre los cuatro casos de `scope.test.ts` que leen el diff de la rama** (R18, R19, R20 y el de
migraciones): el propio archivo trae cinco casos que verifican **al verificador** —«reconoce la rama
de QC-94 por sus DOS senales», «con el diff VACIO los casos de rama se SALTAN, no fallan», «los cuatro
detectores de rama MUERDEN con listas sinteticas», «y ninguno muerde con el alcance legitimo de esta
ficha», «el detector de interfaz NO acusa a la Server Action de esta ficha»—. En esta rama los cuatro
**corren de verdad y no se saltan**: `pnpm exec vitest run tests/unit/identity/roles` da 0 saltados.

---

## 4. Verificacion (salida real, medida por el implementer en el worktree)

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida, exit 0)

$ pnpm run lint
> eslint
(sin salida, exit 0)

$ pnpm exec vitest run guard
 Test Files  27 passed (27)
      Tests  277 passed | 4 skipped (281)

$ pnpm exec vitest run tests/unit/identity/roles \
    tests/unit/identity/require-any-permission.test.ts \
    tests/unit/identity/require-permission.test.ts tests/unit/composition
 Test Files  7 passed (7)
      Tests  105 passed (105)

$ set -a; . ./.env; set +a
$ pnpm exec vitest run tests/integration/identity/role-catalog.int.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ pnpm exec vitest run tests/unit/identity tests/unit/composition tests/guards \
    tests/integration/identity/role-catalog.int.test.ts
 Test Files  78 passed (78)
      Tests  1155 passed | 12 skipped (1167)
```

**Ningun subagente corrio la suite completa**, por diseno (`docs/verification.md`). El gate —
`./init.sh` completo, T14 — es del leader y **queda pendiente**.

### 4.1 Dos avisos de entorno para el leader, que no son de esta feature

1. **El worktree venia sin `.env`.** Sin el, `pnpm exec vitest run tests/integration` da **33
   archivos rojos** con `PrismaClientInitializationError: Environment variable not found:
   DATABASE_URL` — la suite entera, no un rojo de QC-94. Se copio `.env` desde el arbol principal
   (`.env*` esta en `.gitignore:38`, asi que **no entra en ningun commit**), y con el cargado el test
   de integracion de esta ficha pasa. **Ojo: ese `.env` apunta a la base del arbol principal**, no a
   una propia de la feature como hizo QC-66. Para el test de QC-94 da igual —solo LEE—, pero el
   leader deberia decidir a que base apunta antes de correr la integracion completa.
2. **Deriva preexistente de la base local**, medida en la tanda 1 y ajena a esta ficha: 9 archivos de
   integracion de `proveedores`, `unidades` y `recetas` fallan con
   `PrismaClientKnownRequestError: The column 'existe' does not exist in the current database` en
   `prisma.product.create()`. La base local esta por detras de migraciones ya mergeadas (p. ej.
   QC-90). **Ningun archivo de QC-94 toca `products`.** Se reporta, no se arregla: arreglarlo seria
   trabajo de otra ficha.

---

## 5. Diferencias con `design.md`

**Una sola, y es un endurecimiento**, no un aflojamiento:

- **`design.md > 9.2`** sugeria comprobar el orden del test de integracion con `names` igual a
  `[...names].sort()`. **No se hizo asi.** `Array.prototype.sort()` compara por unidades de codigo
  UTF-16 y la collation de Postgres no — es exactamente el desacuerdo (acentos y mayusculas) que el
  propio `design.md > 8.2` usa para descartar `localeCompare` en el dominio. Con los roles efimeros
  de `e2e/login.spec.ts` (`qc9_e2e_rol_*`, en minusculas) ese `sort()` podria discrepar de la base y
  pintar rojo **sin defecto**. En su lugar el orden esperado se le pregunta **a la propia base** con
  SQL crudo (`SELECT name FROM roles ORDER BY name ASC`), mas tres afirmaciones que no dependen de la
  collation: los del seed estan, dos invocaciones dan la misma secuencia, y `Administrador` va antes
  que `Operador`. La intencion de R10 —ordena la base, el adaptador no reordena— queda verificada
  igual, y el test no se puede poner rojo por culpa de otra suite (que era el aviso explicito de
  `design.md > 9.2`).

En produccion, **cero desviaciones**: los cinco archivos nuevos y los cuatro anadidos son literalmente
lo que describen `design.md > 3, 4, 5, 6`.

## 6. Deudas anotadas (ninguna es trabajo de esta ficha)

Las dos que ya dejaba `design.md > 11`, sin novedad:

1. `currentActor()` va por su **segunda** copia (`user-actions.ts` y `role-actions.ts`), deliberada y
   justificada en `design.md > 8.3`. **A la tercera se extrae**, a
   `lib/modules/identity/adapters/driving/current-actor.ts`.
2. Si algun dia el catalogo de roles deja de ser cerrado y corto, `listRoles(actor)` gana un argumento
   de consulta **de forma aditiva** y sin romper a QC-67 (`design.md > 8.1`).

---

## 7. Estado de las tasks

**T1-T13 cerradas** y marcadas `[x]` en `specs/QC-94-consulta-de-roles/tasks.md`.
**T14 pendiente: es del leader** — `./init.sh` completo en verde y la entrada en
`progress/history.md`. El `reviewer` decide despues; esta bitacora **no se autoaprueba**.

---

## 8. F2.3 — sincronizacion con `dev` (despues del gate y del reviewer APROBADO)

`dev` habia avanzado 12 commits desde la base `13fc41c`: es **QC-71, identificador-de-request**
(PR #55), 91 archivos y +6615 lineas.

### 8.1 Conflictos textuales: NINGUNO

`git merge origin/dev` entro limpio (`dbaa79e`). El unico archivo que las dos ramas tocan es
`lib/composition/index.ts`, y no colisionan: QC-71 escribe en los imports de la linea ~158 y anade
su bloque `observabilidad` **al final**; QC-94 escribe sus imports en la ~186 y su `listRoles`
dentro del objeto `identity`. Las dos fichas siguieron la misma regla —anadir al final, no
reordenar— y por eso el merge no tuvo nada que decidir.

### 8.2 El conflicto REAL era semantico, y el typecheck lo caza

Cero conflictos de merge no es cero trabajo. QC-71 cambio la firma del traductor unico:

```
lib/modules/identity/adapters/driving/role-actions.ts(48,22):
  error TS2554: Expected 2-3 arguments, but got 1.
```

`createErrorStateTranslator(base)` paso a `createErrorStateTranslator(base, readRequestIdHeader)`,
y `ErrorState` gano un `reference` en la rama del error inesperado. QC-71 migro los **ocho**
adaptadores driving que existian cuando se escribio; `role-actions.ts` nacio despues, en una rama
paralela, asi que no estaba en esa lista. **Es el modo de fallo clasico del paralelismo, y no lo ve
ningun merge: lo ve el typecheck.**

Arreglado en `f642b99`, copiando la forma de los ocho, sin inventar una novena:

```ts
import { identity, observabilidad } from '@/lib/composition';
const toErrorState = createErrorStateTranslator(IdentityError, observabilidad.readRequestIdHeader);
```

`tests/unit/identity/roles/role-actions.test.ts` se ajusta con el patron de
`tests/unit/identity/usuarios/user-actions.test.ts` (el `vi.hoisted` del lector de cabecera). **Los
10 casos conservan su intencion**: los dos de `unauthorized` siguen afirmando `toEqual` **sin**
`reference` —que es lo que fija R15 de QC-71: el identificador solo viaja en el error inesperado—, y
el caso del `unexpected` ahora lo exige. R6, R13 y R14 de QC-94 quedan igual de vigilados, incluido
«decide el codigo, nunca el texto del mensaje».

`tests/unit/identity/roles/scope.test.ts` **no necesito ni una linea**: sus detectores comparan
contra `git merge-base origin/dev HEAD`, asi que tras el merge los 91 archivos de QC-71 caen fuera
del diff por construccion. Los cuatro casos de rama **corren y pasan, no se saltan**.

### 8.3 Correccion a la seccion 4.1: me equivoque en el diagnostico

Lo que esta bitacora llamo «deriva preexistente de la base local» **no era la base atrasada**. Lo
diagnostico el leader: la base compartida tenia aplicada `20260911120000_presentation_unit`, una
migracion de la rama **QC-80** de otra sesion **que no esta en `dev`** y que quita
`products.unit_id`. O sea: no iba por detras, iba por **delante y por una rama ajena**. Esa era la
causa de los rojos de `proveedores`, `unidades` y `recetas`.

Se resolvio dandole a este worktree **su propia base, `QuimiCloude_QC94`**, con las 23 migraciones de
la rama y el seed; el `.env` del worktree apunta ahi y no se commitea. Queda escrito porque el error
de diagnostico es la parte util: **una base compartida entre worktrees hace que el veredicto de una
feature dependa de las migraciones de otra**, y eso no es un rojo de nadie, es un gate que no
informa.

### 8.4 Verificacion sobre el arbol ya sincronizado

```
$ pnpm run typecheck            -> tsc --noEmit   (sin salida, verde)
$ pnpm run lint                 -> eslint         (sin salida, verde)

$ pnpm exec vitest run tests/unit/identity tests/unit/composition tests/guards \
    tests/unit/observabilidad tests/unit/errores tests/integration/identity
 Test Files  92 passed (92)
      Tests  1409 passed | 12 skipped (1421)
```
(`DATABASE_URL` -> `QuimiCloude_QC94`, la base propia del worktree.)

**El `./init.sh` completo sobre el arbol sincronizado lo corre el leader**, y es condicion del PR:
el merge trae 91 archivos de codigo ajeno que el gate anterior no vio. El PR **no se abre** hasta que
ese gate este verde.
