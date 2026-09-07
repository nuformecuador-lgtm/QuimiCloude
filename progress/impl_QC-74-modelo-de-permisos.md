# QC-74 — modelo-de-permisos · bitacora de implementacion

> Zona `backend` · complejidad `high` · rama `feature/QC-74-modelo-de-permisos`, nacida de
> `origin/dev` (`fa116cd`) · worktree `.worktrees/QC-74-modelo-de-permisos/`.
> Spec aprobado por el humano el 2026-09-07. **17 de 18 tasks en `[x]`**; T18 (gate completo
> `./init.sh`) queda para el leader, que es quien corre el gate.

## 0. Entorno del worktree

Base de datos **propia de la feature**, como manda la convencion del arnes: se creo
`QuimiCloude_QC74` en el postgres local y el `.env` del worktree (no versionado) apunta ahi
`DATABASE_URL` y `DIRECT_URL`. Ninguna migracion de esta ficha se aplico contra la base
compartida. **Al cerrar la feature (F2.5) esa base se elimina.**

Dos pasos de entorno que hicieron falta y no son codigo: `pnpm install` (el worktree nacia sin
`node_modules`) y `pnpm exec next typegen` — sin la carpeta `.next` no existe el tipo global
`LayoutProps` que `app/layout.tsx` usa, y `pnpm run typecheck` fallaba por eso y no por la ficha.

## 1. Archivos tocados

### Produccion — `identity` (el dueño del catalogo y de la regla)

| Archivo | Que le pasa |
|---|---|
| `lib/modules/identity/domain/permissions.ts` | **nuevo** — `PERMISSIONS` (los diez), `type PermissionCode` (union de literales), `SEED_ROLE_PERMISSIONS` escrito uno a uno |
| `lib/modules/identity/domain/require-permission.ts` | **nuevo** — `assertPermission(actor, permission, onDenied)`, unica implementacion |
| `lib/modules/identity/domain/require-admin.ts` | **borrado** — con el se van `assertAdminRole` y `RoleBearer` |
| `lib/modules/identity/index.ts` | publica `PERMISSIONS`, `SEED_ROLE_PERMISSIONS`, `PermissionCode`, `assertPermission`, `PermissionBearer`; retira `assertAdminRole` y `RoleBearer` |
| `lib/modules/identity/domain/seed-initial-access.ts` | paso de permisos entre roles y administrador; `SeedOutcome` gana `createdPermissions` y `createdRolePermissions` |
| `lib/modules/identity/ports/initial-access-repository.ts` | cuatro metodos nuevos, **ninguno de actualizacion** |
| `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts` | los implementa con `createMany` dentro de la transaccion del seed |
| `lib/modules/identity/ports/session-user-reader.ts` | `SessionUserRecord` gana `permissions: readonly string[]` |
| `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts` | el `select` de la MISMA `findFirst` gana `role.permissions` |
| `lib/modules/identity/domain/session-user.ts` | `SessionUser` gana `permissions`; `roleName` **se queda** (display) |
| `lib/modules/identity/domain/resolve-session-user.ts`, `resolve-session.ts` | el array viaja tal cual hasta `ResolvedSession.user` |
| `scripts/seed.ts` | la linea de resumen nombra permisos y asignaciones creados |

### Produccion — base de datos

| Archivo | Que le pasa |
|---|---|
| `db/schema.prisma` | modelos `Permission` y `RolePermission` (`/// @module identity`), `Role.permissions`; **sin columna de empresa** |
| `db/migrations/20260907183034_permissions_and_role_permissions/migration.sql` | **nuevo** — las dos tablas, FKs `Restrict`, indices, y los cuatro `ENABLE`/`FORCE ROW LEVEL SECURITY`. **Cero INSERTs**: el catalogo lo siembra el seed |
| `db/migrations/20260907183034_permissions_and_role_permissions/down.sql` | **nuevo** — `DROP TABLE "role_permissions"` y luego `"permissions"` |

> Nota del generador: `prisma migrate dev --create-only` metio 17 `DROP CONSTRAINT` y 9 `DROP INDEX`
> por drift historico (FKs escritas a mano por QC-20/24/32/33/40 y los indices GIN de
> `20260904160000_list_query_indexes`). Se borraron a mano, siguiendo el precedente ya documentado
> en la cabecera de `20260904180600_companies_and_user_company`, y queda anotado en la cabecera del
> `migration.sql` nuevo. Sin ese borrado la migracion habria desmontado media base.

### Produccion — los cinco modulos de negocio

En los cinco, el mismo cambio: `domain/actor.ts` pasa a `Actor = { id, permissions }` (**el nombre
del rol desaparece**, R18) y `requireAdmin` se renombra a `requirePermission(actor, codigo)`,
conservando la firma `asserts actor is Actor` y fabricando el `UnauthorizedError` **del propio
modulo**; el barrel renombra el export; el adaptador driving construye
`{ id: sessionUser.id, permissions: sessionUser.permissions }`. **Ningun bloque
`error instanceof <Modulo>Error` de los adaptadores driving cambio** (R15).

- `inventario` — `actor.ts`, los nueve casos de uso, `index.ts`, `product-actions.ts`, `presentation-actions.ts`
- `recetas` — `actor.ts`, `errors.ts` (solo JSDoc), los cinco casos de uso, `index.ts`, `recipe-actions.ts`
- `unidades` — `actor.ts`, `errors.ts` (solo JSDoc), `list-units.ts`, `index.ts`, `unit-actions.ts`
- `proveedores` — `actor.ts`, `errors.ts` (solo JSDoc), los nueve casos de uso, `index.ts`, `supplier-actions.ts`, `supplier-catalog-actions.ts`
- `pedidos` — `actor.ts`, los seis casos de uso, `index.ts`, `order-actions.ts`

Los `errors.ts` de tres modulos cambian **solo el texto del JSDoc** («actor sin rol Administrador»
a la redaccion por permiso). Las clases, su jerarquia y sus `code` no se tocan.

### Tests

Nuevos: `tests/unit/identity/permissions.test.ts`, `tests/unit/identity/require-permission.test.ts`,
`tests/guards/guard-permisos-sembrados.test.ts`,
`tests/guards/guard-autorizacion-por-permiso.test.ts`,
`tests/guards/guard-permisos-no-administrables.test.ts`.

Borrado: `tests/unit/identity/require-admin.test.ts` (se va con su implementacion).

Reescritos: los `authorization.test.ts` de `inventario`, `recetas`, `proveedores` y `pedidos`; los
tres de `unidades` (`list-units`, `list-units-query`, `unit-actions`), donde los casos que probaban
rechazo por nombre de rol **se convirtieron** en rechazo por conjunto de permisos, sin perder
cobertura.

Ampliados: `seed-initial-access.test.ts`, `identity-seed.int.test.ts`, `session-user.int.test.ts`,
`resolve-session-user.test.ts`, `resolve-session.test.ts`, `identity-facade.test.ts`.

Ajuste de fixture (solo `permissions` en el `Actor` o en el `SessionUser`, **ninguna asercion de
negocio cambiada**): el resto de tests de los cinco modulos y doce tests de UI que construian un
`SessionUser`.

Retensados: `tests/unit/recetas-ui/recipe-route-contract.test.ts` (constante `MIGRACION_QC74` con
las dos rutas de la migracion) y `tests/unit/recetas/module-contract.test.ts`.

### Lo que NO se toco, a proposito (R23)

`middleware.ts`, `lib/composition/route-role-rules.ts`,
`lib/modules/identity/domain/route-role-rules.ts`, `lib/modules/identity/domain/route-access.ts`,
`lib/modules/identity/domain/roles.ts` y `tests/guards/guard-rol-administrador-unico.test.ts`.
Comprobado con `git diff --name-only origin/dev...HEAD -- <esas rutas>`: **salida vacia**.
Tampoco se toco `app/` ni `components/`, ni entro ningun E2E nuevo (`git diff --name-only
origin/dev...HEAD -- e2e/`: **0 archivos**).

## 2. Mapa de trazabilidad `R<n> -> test`

Los 24 requisitos tienen al menos un test concreto. Ninguno queda sin cubrir.

**R1** — catalogo cerrado, codigo `<modulo>.<accion>`, español y minusculas.
`tests/unit/identity/permissions.test.ts` → `R1: cada codigo es <modulo>.<accion> en español y en
minusculas` · `R1: todo modulo declarado es un modulo del repositorio`.

**R2** — exactamente los diez permisos.
`tests/unit/identity/permissions.test.ts` → `R2: contiene exactamente los diez codigos del
requisito, ni uno mas ni uno menos` (la lista esta copiada del requisito, no derivada del catalogo)
· `R2: cada entrada trae descripcion no vacia`.

**R3** — modulo con escritura declara consultar y modificar; modificar cubre el borrado.
`tests/unit/identity/permissions.test.ts` → `R3: cada modulo con escritura declara consultar Y
modificar`. Que el borrado entra en `modificar` lo fija `tests/unit/inventario/authorization.test.ts`
→ `cubre los nueve casos de uso: seis de modificacion y tres de consulta`, y sus hermanos de
`recetas`, `proveedores` y `pedidos`.

**R4** — modulo sin escritura declara solo consultar.
`tests/unit/identity/permissions.test.ts` → `R4: dashboard y unidades declaran UNICAMENTE consultar`.

**R5** — ninguna via de aplicacion crea, edita ni borra permisos o asignaciones.
`tests/guards/guard-permisos-no-administrables.test.ts` → `ningun archivo de produccion escribe
sobre permissions ni role_permissions, salvo el adaptador del seed` · `el puerto del seed no declara
ningun metodo upsert, update ni delete` · `ningun barrel ni Server Action de los cinco modulos
exporta un caso de uso que mute permisos` · `la exencion sigue siendo necesaria: el adaptador del
seed es el unico que escribe, y escribe`. Refuerzo en
`tests/unit/identity/seed/seed-initial-access.test.ts` → `si el admin ya existe con hash y marca
distintos, no hay ninguna llamada de escritura ni de actualizacion`.

**R6** — el permiso cuelga del rol; sin empresa.
`tests/unit/identity/permissions.test.ts` → `R6: ninguna entrada del catalogo lleva campo de empresa`
· `R6: el seed asigna permisos SOLO a roles, sin ninguna clave de empresa`.

**R7** — catalogo y asignacion persistidos; los permisos salen de la asignacion, no del nombre del rol.
`tests/integration/identity/identity-seed.int.test.ts` → `la primera corrida deja el catalogo
completo, el Administrador con los diez permisos y el Operador solo con inventario.consultar; la
segunda no cambia ningun conteo`. `tests/integration/identity/session-user.int.test.ts` → `un
usuario activo devuelve nombres, username y el rol actual` · `un rol sin asignaciones devuelve
permissions vacio`.

**R8** — Administrador con los diez, escritos uno a uno, sin comodin.
`tests/unit/identity/permissions.test.ts` → `R8: el Administrador tiene los diez permisos, escritos
uno a uno` · `R8: no hay comodin ni regla implicita en el conjunto del Administrador`. Contra base
real, el caso de integracion citado en R7.

**R9** — Operador con exactamente `inventario.consultar`.
`tests/unit/identity/permissions.test.ts` → `R9: el Operador tiene exactamente un permiso:
inventario.consultar`. Contra base real, el caso de integracion citado en R7.

**R10** — el seed crea solo lo que falta; idempotente.
`tests/unit/identity/seed/seed-initial-access.test.ts` → `sobre una base vacia crea los diez
permisos del catalogo y las once asignaciones del seed` · `sobre una base ya sembrada la segunda
corrida no crea ningun permiso ni ninguna asignacion` · `una asignacion que ya existe no se vuelve
a crear ni se duplica: solo se crean las que faltan` · `SeedOutcome nombra exactamente los permisos
creados y cuenta exactamente las asignaciones creadas`. Integracion: el caso citado en R7.

**R11** — los permisos se resuelven en la lectura de sesion, sin consulta adicional.
`tests/integration/identity/session-user.int.test.ts` → `trae los permisos del rol sin una segunda
consulta`, con dos contadores: `user.findFirst` una sola vez y `rolePermission.findMany` cero veces
— si alguien resolviera los permisos aparte, uno de los dos delata.

**R12** — el permiso se comprueba dentro del caso de uso, antes de todo puerto y antes de validar.
`tests/unit/identity/require-permission.test.ts` → los trece casos `<quien>: lanza EXACTAMENTE el
error que devuelve onDenied`.
Por modulo: `tests/unit/inventario/authorization.test.ts` → `cada caso de uso rechaza con
UnauthorizedError, que es un InventarioError, sin tocar ningun puerto` · `rechaza por permiso ANTES
de validar la entrada, incluso con entrada invalida`.
`tests/unit/recetas/authorization.test.ts` → `R12 — con entrada invalida, el rechazo es por PERMISO
y no por validacion` · `R12 — ningun archivo de domain/ lee sesion, cookie ni cabecera por su cuenta`.
`tests/unit/proveedores/authorization.test.ts` → `R12 — el permiso se comprueba ANTES de zod: con
entrada invalida el rechazo sigue siendo por permiso` · `R12 — cada caso de uso recibe el actor por
parametro y no lee ninguna sesion`.
`tests/unit/pedidos/authorization.test.ts` → `<caso>: con entrada invalida y sin permiso, rechaza
por PERMISO y no valida` · `<archivo>: requirePermission va antes de zod y de cualquier puerto`.
`tests/unit/unidades/list-units-query.test.ts` → `rechaza al actor con permisos de otro modulo con
<caso> sin tocar el repositorio`.

**R13** — pertenencia exacta, sin normalizar, sin implicacion entre permisos.
`tests/unit/identity/require-permission.test.ts` → `R13: consultar NO concede modificar (el sentido
inverso)` · `R13: el permiso de otro modulo con la misma accion no concede`, mas los casos `un
prefijo del codigo`, `solo el modulo`, `el codigo con otra caja`, `el codigo con espacios
alrededor`, `un codigo que lo CONTIENE` y `R13: modificar NO concede consultar`.
Por modulo: `inventario` → `un actor con solo inventario.consultar es rechazado en los seis casos de
escritura` · `un actor con solo inventario.modificar es rechazado en los tres casos de lectura` ·
`no hay coincidencia parcial, comodin ni normalizacion del codigo`.
`recetas` → `R13 — solo recetas.consultar NO abre ninguna de las tres escrituras` · `R13 — solo
recetas.modificar NO abre ninguna de las dos lecturas` · `R13 — un prefijo o una variante del codigo
no se cuela por coincidencia parcial`.
`proveedores` → `R13 — solo proveedores.consultar no abre ninguna de las seis escrituras` · `R13 —
solo proveedores.modificar no abre ninguna de las tres lecturas` · `R13 — ni el prefijo, ni otra
caja, ni un codigo parecido conceden nada`.
`pedidos` → `<caso>: tener solo pedidos.consultar NO abre la escritura` · `<caso>: tener solo
pedidos.modificar NO abre la lectura` · `<caso>: ni prefijo, ni sufijo, ni mayusculas, ni otro
modulo se cuelan por <codigo>` · `hay cuatro escrituras y dos lecturas: el cruzado no corre sobre
una lista vacia`.
`tests/unit/unidades/list-units.test.ts` → `con un codigo parecido que no concede: no hay
coincidencia parcial se rechaza sin leer del repositorio`.

**R14** — actor nulo, sin conjunto, vacio o sin el codigo: rechazo sin efectos.
`tests/unit/identity/require-permission.test.ts` → `sin actor (null)`, `sin actor (undefined)`, `sin
conjunto de permisos`, `permisos nulos`, `permisos que no son un array`, `conjunto vacio`, `otro
permiso cualquiera`.
Por modulo: `inventario` → `un actor ausente, sin conjunto de permisos o con el conjunto vacio es
rechazado en los nueve`. `recetas` → `R14 — actor ausente, sin conjunto o con el conjunto vacio se
rechaza en los cinco casos, sin efectos`. `proveedores` → `R14 — falla cerrado: actor ausente, sin
conjunto de permisos, vacio o de otro modulo`. `pedidos` → `<caso>: <quien> rechaza y NO toca ningun
puerto` · `un actor sin la propiedad de permisos rechaza igual, no revienta con TypeError`.
`tests/unit/unidades/list-units.test.ts` → los cinco casos `<caso> se rechaza sin leer del
repositorio`.

**R15** — el error es el `UnauthorizedError` del propio modulo, subclase de su clase raiz.
`inventario` → `cada caso de uso rechaza con UnauthorizedError, que es un InventarioError, sin tocar
ningun puerto`. `recetas` → `R15 — el rechazo lanza el UnauthorizedError de recetas, que ES un
RecetasError`. `proveedores` → el ayudante `esperarRechazoSinTocarNada` exige `instanceof
UnauthorizedError` mas `instanceof ProveedoresError` mas el codigo estable `unauthorized`, y corre
en `R14 — falla cerrado...` y en `R16, R17 — cada caso de uso avanza con EXACTAMENTE el permiso de
su fila y con nada mas`. `pedidos` → `<caso>: RECHAZA sin <codigo>, con el UnauthorizedError del
modulo y sin tocar ningun puerto`. `unidades` → `tests/unit/unidades/list-units.test.ts` → `el
rechazo lanza el UnauthorizedError del modulo, que es un UnidadesError (R15)`.
Que la **serializacion del adaptador driving no cambia** lo prueban
`tests/unit/unidades/unit-actions.test.ts` → `con sesion SIN el permiso pasa el conjunto tal cual y
traduce el rechazo del dominio` · `la action traduce el error de dominio a estado serializable sin
relanzar`, y sus equivalentes en `product-actions`, `presentation-actions`, `recipe-actions`,
`supplier-actions` y `order-actions`.

**R16** — cada caso de uso exige exactamente el permiso de la tabla.
`inventario` → `cubre los nueve casos de uso: seis de modificacion y tres de consulta` · `los dos
codigos exigidos existen en el catalogo real de identity`.
`recetas` → `R16 — la tabla cubre los cinco casos de uso de recetas, cada uno con su codigo` · `R16
— sin el codigo exigido se rechaza, aunque tenga los de otros modulos`.
`proveedores` → `los nueve casos de uso estan cubiertos por esta tabla` · `R16, R17 — cada caso de
uso avanza con EXACTAMENTE el permiso de su fila y con nada mas` (concede con su codigo y rechaza
con los otros nueve del catalogo real).
`pedidos` → `la tabla cubre los seis nombres con su codigo: no se queda corta por un renombrado` ·
`<archivo>: requirePermission va antes de zod y de cualquier puerto`, que ademas comprueba el
literal exacto del codigo dentro de cada archivo de dominio.
`unidades` → `con el permiso unidades.consultar se concede y se lee del repositorio`.

La tabla implementada, para que el reviewer la contraste con R16 sin abrir nueve archivos:

| Modulo | Casos de uso | Permiso |
|---|---|---|
| `inventario` | `getProduct`, `listProducts`, `listPresentations` | `inventario.consultar` |
| `inventario` | `createProduct`, `updateProduct`, `deleteProduct`, `createPresentation`, `updatePresentation`, `deletePresentation` | `inventario.modificar` |
| `recetas` | `getRecipe`, `listRecipes` | `recetas.consultar` |
| `recetas` | `createRecipe`, `updateRecipe`, `deleteRecipe` | `recetas.modificar` |
| `unidades` | `listUnits` | `unidades.consultar` |
| `proveedores` | `getSupplier`, `listSuppliers`, `listCatalogLines` | `proveedores.consultar` |
| `proveedores` | `createSupplier`, `updateSupplier`, `deleteSupplier`, `createCatalogLine`, `updateCatalogLine`, `deleteCatalogLine` | `proveedores.modificar` |
| `pedidos` | `getOrder`, `listOrders` | `pedidos.consultar` |
| `pedidos` | `createOrder`, `updateOrder`, `cancelOrder`, `deleteOrder` | `pedidos.modificar` |

**R17** — concede quien tiene el codigo, sea cual sea su rol.
`inventario` → `cada caso de uso concede al actor cuyo conjunto contiene su codigo exacto` ·
`concede sea cual sea el nombre del rol: solo cuenta el conjunto de permisos`.
`recetas` → `R17 — con el codigo exacto en su conjunto, el caso de uso CONCEDE` · `R17 — concede sea
cual sea el resto del conjunto: el rol ya no interviene (R18)`.
`proveedores` → `R16, R17 — cada caso de uso avanza con EXACTAMENTE el permiso de su fila y con nada
mas`, mas el caso del Operador sembrado dentro de `R14 — falla cerrado...`, que comprueba que
`inventario.consultar` no abre nada de `proveedores`.
`pedidos` → `<caso>: CONCEDE con <codigo> y llega hasta el puerto`.
`unidades` → `con el permiso unidades.consultar se concede y se lee del repositorio`, contrastado
con `con un permiso de otro modulo se rechaza sin leer del repositorio`.
El lado del Operador —consulta el catalogo de producto y nada mas— lo cierran ademas
`tests/unit/identity/require-permission.test.ts` → `otro permiso cualquiera` y `concede tambien
cuando el codigo viene acompañado de otros permisos`.

**R18** — ningun `Actor` de los cinco modulos tiene campo de nombre de rol.
`inventario` → `ningun archivo de domain/ lee sesion, cookie, cabecera ni nombre de rol` · `el
resultado depende UNICAMENTE del actor que se pasa por parametro`.
`recetas` → `R18 — ni el tipo ni el adaptador driving nombran el rol del actor`.
`proveedores` → `R18 — el Actor del modulo no tiene nombre de rol y ningun archivo lo lee`.
`pedidos` → `domain/actor.ts declara id y permissions, y ningun campo de rol`.
`unidades` → `tests/unit/unidades/unit-actions.test.ts` → `resuelve el actor con
identity.getSessionUser y responde success con el catalogo del caso de uso`, con igualdad estricta
contra el objeto `{ id, permissions }`: un `roleName` que vuelva lo pone en rojo.
Global: `tests/guards/guard-autorizacion-por-permiso.test.ts` → `ningun archivo de los cinco modulos
de negocio usa el rol para autorizar`.

**R19** — guardia: permiso declarado sin rol asignado, rojo nombrandolo.
`tests/guards/guard-permisos-sembrados.test.ts` → `todo permiso del catalogo esta asignado a al
menos un rol del seed` · `toda asignacion del seed apunta a un permiso que el catalogo declara` ·
`el catalogo real no esta vacio y tiene exactamente diez permisos` · `el seed nombra exactamente los
roles de SEED_ROLES, y ninguno se queda sin permisos`.

**R20** — guardia: archivo de negocio que autoriza por nombre de rol, rojo nombrandolo.
`tests/guards/guard-autorizacion-por-permiso.test.ts` → `ningun archivo de los cinco modulos de
negocio usa el rol para autorizar` (barrio 124 archivos `.ts`) · `el barrido encuentra los cinco
modulos y una cantidad razonable de archivos` · `las exenciones son las declaradas: identity y el
corte de rutas por rol siguen usando el rol`.

**R21** — las guardias derivan del dato real y demuestran que disparan y que no.
`tests/guards/guard-permisos-sembrados.test.ts` → `la regla dispara con un catalogo sintetico que
declara un permiso sin asignar` · `la regla NO dispara con el caso correcto simetrico: el mismo
catalogo con el permiso sembrado` · `la simetrica dispara con un seed que asigna un codigo fuera del
catalogo, nombrando el rol` · `la simetrica NO dispara con el caso correcto: todo lo sembrado esta
en el catalogo` · `las dos direcciones son independientes: un catalogo vacio con seed lleno solo
dispara la simetrica`.
`tests/guards/guard-autorizacion-por-permiso.test.ts` → `dispara con un actor.ts sintetico que
vuelve a poner roleName en el Actor` · `dispara con un actor.ts sintetico que compara el literal del
rol, con cualquiera de las tres comillas` · `dispara con la comprobacion «es Administrador» heredada
de QC-54, importada o envuelta` · `NO dispara con el actor.ts REAL de cada modulo, que autoriza por
permiso` · `NO dispara con un comentario —de linea o de bloque— que mencione el rol` · `no se ciega:
un comentario de linea con un comodin app/ mas dos asteriscos NO esconde la infraccion que va
debajo` · `los patrones se derivan de los roles reales de identity, que siguen siendo Administrador
y Operador`.
`tests/guards/guard-permisos-no-administrables.test.ts` aporta los suyos: `dispara con un
permission-actions.ts sintetico que crea una asignacion permiso-rol` · `dispara con un
permission-actions.ts sintetico que borra permisos del catalogo` · `NO dispara con un fuente que
solo LEE el catalogo de permisos` · `los modelos y los verbos se derivan de constantes documentadas
que siguen existiendo`.

**R22** — migracion versionada con `down.sql`, RLS forzada, y `db:rollback` la revierte.
`tests/guards/guard-rls-force.test.ts` barre **todos** los `migration.sql` de `db/migrations/**`,
incluida la nueva, exigiendo `ENABLE` mas `FORCE ROW LEVEL SECURITY` por tabla creada. El ciclo
`migrate` → `rollback` → `migrate` contra `QuimiCloude_QC74` esta ejecutado, con su salida literal y
la comprobacion de `pg_class` y `_prisma_migrations` en §3.1.

**R23** — el corte de rutas por rol del middleware no cambia.
`tests/unit/identity/route-role-rules.test.ts`, `tests/unit/identity/route-access.test.ts`,
`tests/unit/identity/route-guard-middleware.test.ts`,
`tests/unit/pedidos-ui/route-role-pedidos.test.ts` y
`tests/guards/guard-rol-administrador-unico.test.ts`, todos verdes y **sin tocarse**. Ademas
`git diff --name-only origin/dev...HEAD` sobre `middleware.ts`,
`lib/composition/route-role-rules.ts`, `lib/modules/identity/domain/route-role-rules.ts` y
`lib/modules/identity/domain/route-access.ts` devuelve **salida vacia**.

**R24** — concesion y rechazo probados en los cinco servicios; ningun E2E nuevo.
Los cuatro `authorization.test.ts` de `inventario` (9 casos de uso), `recetas` (5), `proveedores`
(9) y `pedidos` (6), mas los tres de `unidades`, cada caso de uso con su par concesion/rechazo — ver
R16 y R17. Ningun E2E: `git diff --name-only origin/dev...HEAD -- e2e/` devuelve **0 archivos**.
Desviacion declarada y aprobada en `design.md > 10` por la decision 12 del humano.

## 3. Comandos y salida real

### 3.1 Ciclo de base de datos (R22), contra `QuimiCloude_QC74`

```
$ pnpm run db:migrate
17 migrations found in prisma/migrations
Applying migration `20260907183034_permissions_and_role_permissions`
The following migration(s) have been applied:
migrations/
  └─ 20260907183034_permissions_and_role_permissions/
    └─ migration.sql
All migrations have been successfully applied.
```

Comprobacion directa sobre `pg_class` y `_prisma_migrations` (script temporal con `pg`, ya borrado):

```
tablas + RLS: [{"relname":"permissions","relrowsecurity":true,"relforcerowsecurity":true},
               {"relname":"role_permissions","relrowsecurity":true,"relforcerowsecurity":true}]
_prisma_migrations: [{"migration_name":"20260907183034_permissions_and_role_permissions",
                      "aplicada":true,"rolled_back_at":null}]
fks role_permissions: [{"conname":"role_permissions_permission_code_fkey","confdeltype":"r","confupdtype":"c"},
                       {"conname":"role_permissions_role_id_fkey","confdeltype":"r","confupdtype":"c"}]
columnas: permissions.code, permissions.module, permissions.action, permissions.description,
          permissions.created_at, permissions.updated_at,
          role_permissions.role_id, role_permissions.permission_code, role_permissions.created_at
filas: [{"permisos":"0","asignaciones":"0"}]
```

`confdeltype: r` es RESTRICT y `confupdtype: c` es CASCADE. Ninguna columna de empresa. Cero filas:
la migracion no siembra.

```
$ pnpm run db:rollback
db:rollback: aplicando down.sql de 20260907183034_permissions_and_role_permissions y borrando su fila de _prisma_migrations
db:rollback: 20260907183034_permissions_and_role_permissions revertida.
----- exit=0
tablas + RLS: []
_prisma_migrations: []

$ pnpm run db:migrate     # segunda aplicacion, limpia
(identica a la primera; la comprobacion vuelve a dar las dos tablas con RLS forzada
 y la fila aplicada sin rolled_back_at)
```

### 3.2 Seed contra base real (R8, R9, R10)

```
$ pnpm run db:seed
db:seed: roles creados: 2 (Administrador, Operador) - permisos creados: 10 (dashboard.consultar,
inventario.consultar, inventario.modificar, recetas.consultar, recetas.modificar,
unidades.consultar, proveedores.consultar, proveedores.modificar, pedidos.consultar,
pedidos.modificar) - asignaciones permiso-rol creadas: 11 - empresa inicial: creada (QuimiCloud)
- usuario inicial: creado

$ pnpm run db:seed        # segunda corrida
db:seed: nada que crear
```

Once asignaciones son los diez del Administrador mas `inventario.consultar` del Operador. La segunda
corrida no crea nada: idempotencia demostrada tambien fuera del test.

### 3.3 Typecheck y lint

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida — verde)

$ pnpm run lint
> eslint
(sin salida — verde)
```

### 3.4 Guardias

```
$ pnpm exec vitest run tests/guards
 Test Files  17 passed (17)
      Tests  174 passed (174)
   Duration  2.04s
```

Las diecisiete incluyen las tres nuevas de esta ficha (`guard-permisos-sembrados`,
`guard-autorizacion-por-permiso`, `guard-permisos-no-administrables`) y
`guard-rol-administrador-unico`, que sigue verde con sus dos anclas (R23), y `guard-rls-force`, que
es quien cubre R22 sobre la migracion nueva.

### 3.5 Tanda relacionada (regla del gate: no se corrio la suite completa)

```
$ pnpm exec vitest run tests/guards tests/unit/identity tests/integration/identity \
    tests/unit/inventario tests/unit/recetas tests/unit/unidades tests/unit/proveedores \
    tests/unit/pedidos tests/unit/composition
 Test Files  169 passed (169)
      Tests  2149 passed | 7 skipped (2156)
   Duration  75.62s
```

Esa corrida es anterior a que entrara `guard-permisos-no-administrables`; el bloque 3.4, posterior,
ya la incluye.

## 4. Desviaciones y cosas que el reviewer debe mirar con calma

1. **Ningun E2E nuevo (R24).** Desviacion **declarada y aprobada con el spec** (`design.md > 10`,
   decision 12 del humano del 2026-09-07): aqui no hay pantalla que abrir, y el E2E de permisos es
   de QC-75. `CHECKPOINTS.md` pide E2E cuando la feature toca permisos; esto se anota como excepcion
   consciente, no como olvido.
2. **`createMany({ skipDuplicates: true })` en el adaptador del seed.** No es un `upsert` —ninguna
   columna existente se reescribe— y cubre la misma carrera entre despliegues simultaneos que el
   `catch` P2002 de `createRole`. Esta comentado en el adaptador. El puerto sigue sin exponer
   `update`, `upsert` ni `delete`, y la guardia de R5 lo verifica leyendo el fuente del puerto.
3. **`resolve-session.ts` se toco, y no estaba en la lista de archivos de T8.** Desde QC-48 el
   `SessionUser` literal no se construye en `resolve-session-user.ts` sino ahi; sin esa linea los
   permisos no llegaban a `ResolvedSession.user`. Es una linea, y se anota para que no parezca
   alcance colado.
4. **Los `errors.ts` de `recetas`, `unidades` y `proveedores` aparecen en el diff.** Solo cambia el
   texto del JSDoc, que citaba el rol Administrador. Las clases, la jerarquia y los `code` no se
   tocan — condicion de R15.
5. **`guard-permisos-no-administrables.test.ts` no estaba en `tasks.md`.** Se añadio al cerrar la
   ficha porque **R5 se habria quedado sin test propio**, y eso es motivo de rechazo. Es test, no
   produccion. Un detalle util: la unica escritura real del repo no se escribe como
   `prisma.permission.…` sino como `db.permission.createMany` dentro de la transaccion del seed, asi
   que el patron de la guardia deja libre el receptor y deriva el accessor de los modelos de
   `db/schema.prisma`. Un patron anclado a `prisma.` habria pasado en verde sin ver ni la unica
   escritura que existe.
6. **La guardia de R20 no usa lista de perdones: acota el barrido a los cinco modulos de negocio.**
   `design.md > 6.2` describe el mismo efecto en forma de exenciones; se implemento eligiendo el
   alcance, porque una lista de perdones se vuelve colador. Las exenciones quedan igualmente
   ancladas con aserciones (`las exenciones son las declaradas...`), incluida la de R23.
7. **`prisma migrate dev --create-only` genero 17 `DROP CONSTRAINT` y 9 `DROP INDEX` por drift
   historico**, borrados a mano siguiendo el precedente de
   `20260904180600_companies_and_user_company`. Merece una mirada del reviewer sobre el
   `migration.sql` final.
8. **Tests de UI con timeouts intermitentes**, ajenos a esta ficha y reproducibles sin ella:
   `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx` y algun caso de
   `tests/unit/pedidos-ui/order-form.test.tsx` y `order-sheet.test.tsx` caen por
   `Test timed out in 5000ms` bajo carga y pasan al reejecutarlos aislados. No tocan permisos.
9. **Preguntas abiertas del spec, sin tocar.** La 1 (invalidacion del cache de sesion de QC-28) se
   decide al acotar QC-28; la 2 (el tercer rol) sigue sin respuesta y no bloquea, con la receta de
   `design.md > 8` escrita para el dia que llegue.

## 5. Estado de las tasks

T1 a T17 en `[x]` — **17 de 18**. **T18 (`./init.sh` completo) la corre el leader**, que es quien
tiene el gate; este documento se cierra con su resultado.

Commits de la rama, en orden:

- `68bdaed` — catalogo de permisos, `assertPermission` y las dos tablas (T1-T4)
- `35cf529` — seed de permisos, la sesion los trae y la guardia R19 (T5-T8, T15)
- `812ea4c` — los cinco modulos autorizan por permiso, no por rol (T9-T13)
- `f157869` — retirada de `assertAdminRole` y guardia contra autorizar por rol (T14, T16)
