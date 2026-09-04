# QC-47 — modelo-empresa-y-membresias · bitacora de implementacion

> Worktree: `.worktrees/QC-47-modelo-empresa-y-membresias` · Rama:
> `feature/QC-47-modelo-empresa-y-membresias` · Base propia del worktree: `QuimiCloude_QC47`
> (la compartida `QuimiCloude` no se toco en ningun momento).
>
> Las 21 tasks de `tasks.md` estan cerradas. `./init.sh` completo y el PR son del leader, tras
> el reviewer.

## Tandas y commits

| Tanda | Tasks | Commit | Que entra |
| --- | --- | --- | --- |
| A — dominio puro | T1, T2, T3 | `f76b990` | `normalizeCompanyName`, `INITIAL_COMPANY_NAME`, contrato publico |
| B — esquema | T4, T5, T6 | `8bdf5b3` | `Company` y `Membership`; `User` pierde el rol; test de esquema |
| C — migracion | T7, T8, T9, T10 | `25692d3` | `migration.sql` con backfill, `down.sql`, test sobre el texto de los dos SQL |
| D — los tres consumidores | T11-T17 | `7a45677` | login, sesion, puerto, dominio y adaptador del seed, `scripts/seed.ts` |
| E/F — constraints y cierre | T18, T19, T20, T21 | (esta tanda) | constraints contra Postgres real, barrido de huerfanos, E2E, bitacora |

## Archivos creados

- `lib/modules/identity/domain/company-name.ts` — `normalizeCompanyName`, la UNICA definicion de
  «mismo nombre de empresa» (R3).
- `lib/modules/identity/domain/companies.ts` — `INITIAL_COMPANY_NAME`, unico sitio del repo que
  escribe ese literal en TypeScript (R20).
- `db/migrations/20260904180600_companies_and_memberships/migration.sql`
- `db/migrations/20260904180600_companies_and_memberships/down.sql`
- `tests/unit/identity/company-name.test.ts`
- `tests/unit/identity/schema/companies-migration.test.ts`

## Archivos modificados

Produccion:
- `db/schema.prisma` — `Company`, `Membership`, `User` sin rol, `Role` sin `users`.
- `lib/modules/identity/index.ts` — reexporta los dos simbolos nuevos.
- `lib/modules/identity/ports/initial-access-repository.ts`
- `lib/modules/identity/domain/seed-initial-access.ts`
- `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts`
- `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`
- `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts`
- `scripts/seed.ts`

**`lib/composition/index.ts`: CERO cambios (T16).** El repositorio sale de la misma fabrica
(`withInitialAccessTransaction` -> `createInitialAccessRepository(tx)`), asi que los metodos
nuevos llegan solos y con el mismo `tx`. La atomicidad de R18 se conserva sin tocar el cableado.

Tests:
- `tests/unit/identity/schema/identity-schema.test.ts`
- `tests/unit/identity/seed/seed-initial-access.test.ts`
- `tests/unit/identity/credential-policy-contract.test.ts` (linea base del censo de `User`)
- `tests/unit/proveedores/module-contract.test.ts`, `tests/unit/proveedores/scope.test.ts`
- `tests/unit/recetas-ui/recipe-route-contract.test.ts`
- `tests/unit/inventario/schema/inventario-audit-migration.test.ts` (solo un comentario)
- `tests/integration/identity/{identity-constraints,identity-seed,login,session-user}.int.test.ts`
- `tests/integration/{inventario,pedidos,proveedores,recetas}/*.int.test.ts` (fixtures)
- `e2e/{login,session,inventario,recetas}.spec.ts` (**solo fixtures**, ver el cierre)

## Mapa `R<n> -> test`

Los 29 requisitos, sin hueco. Rutas relativas a la raiz del worktree. Abreviaturas:
`SCHEMA` = `tests/unit/identity/schema/identity-schema.test.ts`;
`MIG` = `tests/unit/identity/schema/companies-migration.test.ts`;
`CONSTR` = `tests/integration/identity/identity-constraints.int.test.ts`;
`SEED-U` = `tests/unit/identity/seed/seed-initial-access.test.ts`;
`SEED-I` = `tests/integration/identity/identity-seed.int.test.ts`;
`LOGIN-I` = `tests/integration/identity/login.int.test.ts`;
`SESION-I` = `tests/integration/identity/session-user.int.test.ts`.

| R | Test concreto |
| --- | --- |
| R1 | `SCHEMA` > "Company y Membership tienen id uuid con default generado (R1)"; `MIG` > "las dos tablas nuevas" (DEFAULT gen_random_uuid) |
| R2 | `SCHEMA` > "Company declara name y nameNormalized obligatorios, en texto sin longitud (R2, R21)" |
| R3 | `tests/unit/identity/company-name.test.ts` (8 casos: acentos, mayusculas, signos, trim, digitos, idempotencia); `SCHEMA` > "Company declara name y nameNormalized obligatorios" |
| R4 | `CONSTR` > "rechaza una segunda empresa con el mismo nombre en otras mayusculas y con acentos" (SQLSTATE 23505); `MIG` > "la empresa lleva el indice unico FUNCIONAL y PARCIAL de su nombre normalizado" |
| R5 | `SCHEMA` > "Company declara deletedAt opcional (R5)" |
| R6 | `SCHEMA` > "Company y Membership registran creacion y actualizacion (R6)"; `CONSTR` > "created_at y updated_at se rellenan solos y updated_at cambia al modificar" |
| R7 | `SCHEMA` > "Membership declara sus tres referencias obligatorias en uuid (R7)" |
| R8 | `CONSTR` > "acepta que la misma persona pertenezca a dos empresas con un rol distinto en cada una" |
| R9 | `CONSTR` > "rechaza una segunda pertenencia de la misma persona a la misma empresa" (23505); `SCHEMA` > "la pareja usuario+empresa es unica, y el unico es TOTAL (R9)" |
| R10 | `CONSTR` > "rechaza una pertenencia con persona, empresa o rol inexistentes" (23503, tres casos) |
| R11 | `CONSTR` > "rechaza borrar la empresa, el rol o la persona de una pertenencia, y las filas quedan intactas" (23503, tres casos) y "rechaza borrar un rol cuya unica persona esta borrada logicamente"; `SCHEMA` > "las tres relaciones de Membership son Restrict, nunca Cascade al borrar (R11)" |
| R12 | `SCHEMA` > "Membership no tiene deletedAt (R12)" |
| R13 | `SCHEMA` > "ninguna columna de User huele a rol"; `MIG` > "no se toca ninguna FK, CHECK ni RLS de las tablas de otros modulos" (la migracion no anade columna de empresa a users, roles ni document_types); `CONSTR` > "acepta varias personas con el mismo rol en la misma empresa" (el rol es del sistema, no se separa) |
| R14 | `SCHEMA` > "User no declara roleId, ni la relacion role, ni el indice users_role_id_idx" y "Role ya no tiene campo de vuelta hacia User"; `CONSTR` > "crea un usuario con todos sus datos" (las claves del usuario no contienen roleId); `tests/unit/identity/credential-policy-contract.test.ts` (censo cerrado de campos de User); `tests/unit/proveedores/module-contract.test.ts` (relationTargets de User) |
| R15 | `SESION-I` > "el rol cambiado en la pertenencia entre dos lecturas devuelve el nuevo" y "un usuario activo devuelve nombres, username y el rol actual" |
| R16 | `LOGIN-I` > "el rol resuelto es el de la pertenencia, y cambia con ella"; `e2e/login.spec.ts` y `e2e/session.spec.ts` con el guion sin tocar (decision cerrada 14) |
| R17 | `LOGIN-I` > "un usuario vivo sin ninguna pertenencia no se encuentra ni entra"; `SESION-I` > "un usuario vivo sin ninguna pertenencia devuelve null" |
| R18 | `SEED-U` > "sobre una base vacia crea la empresa inicial y le da al administrador su pertenencia"; `SEED-I` > "la primera corrida sobre base vacia crea los dos roles y el administrador" y "mitad negativa: si run lanza, lo escrito antes del fallo NO queda commiteado" (transaccion unica) |
| R19 | `SEED-U` > "si la empresa inicial ya existe la reutiliza por nombre normalizado y no crea ninguna otra", "sobre una base que ya tiene su acceso inicial no crea empresa, ni pertenencia, ni nada" y "needsAdmin sale de countLiveUsersWithRole(Administrador)"; `SEED-I` > "tras la primera corrida devuelve 1, y una segunda corrida no crea segunda empresa, admin ni pertenencia", "una persona con DOS pertenencias de rol Administrador sigue contando UNA", "una persona viva cuya unica pertenencia es de rol Operador no cuenta como Administrador", "un administrador dado de baja NO cuenta" y "una persona viva SIN ninguna pertenencia no cuenta con ningun rol" |
| R20 | `MIG` > "el literal de la empresa sale de la UNICA definicion, y el test cae si divergen" (importa INITIAL_COMPANY_NAME y normalizeCompanyName de verdad); `tests/unit/identity/company-name.test.ts` (el nombre inicial normaliza a quimicloud) |
| R21 | `SCHEMA` > "Company declara name y nameNormalized obligatorios, en texto sin longitud (R2, R21)"; `MIG` > "las dos tablas nuevas" (identificadores en ingles y snake_case) |
| R22 | `SCHEMA` > "los dos modelos nuevos declaran su modulo propietario identity (R22)"; `tests/guards/guard-arquitectura-modulos.test.ts` bloque 10 (prohibe prisma.company / prisma.membership fuera de identity) |
| R23 | `MIG` > "companies y memberships quedan con RLS activada Y forzada" |
| R24 | `MIG` > "la pertenencia se crea con el rol LITERAL de cada usuario, bajas incluidas", "el backfill va ANTES del FORCE ROW LEVEL SECURITY, y el test cae si se mueve detras" y "el DROP COLUMN de role_id va DESPUES del backfill". Verificado ademas contra Postgres real (T8): base con 3 usuarios, uno de baja, deja 3 pertenencias con el rol que cada uno tenia y 0 usuarios con un numero de pertenencias distinto de 1 |
| R25 | `MIG` > "devuelve role_id a users OBLIGATORIA y con el rol que guardaba la pertenencia", "recrea la FK y el indice de role_id con EXACTAMENTE el texto de QC-4" (leido del migration.sql de QC-4, no copiado) y "borra las dos tablas nuevas en orden inverso a la FK y no toca pgcrypto". Verificado ademas contra Postgres real (T9): snapshot de users -columnas, indices y constraints- antes de aplicar y despues de revertir, diff sin diferencias, y _prisma_migrations sin la fila |
| R26 | `MIG` > "empieza con la guardia que aborta si alguien no tiene exactamente una pertenencia". Verificado ademas contra Postgres real (T9e): con un usuario con dos pertenencias el down.sql aborta con el mensaje de R26 y el ROLLBACK deja todo intacto |
| R27 | `MIG` > "no hay ningun DROP sobre los tres indices unicos de users que escribio QC-4" y "no se toca ninguna FK, CHECK ni RLS de las tablas de otros modulos"; `tests/unit/identity/schema/identity-migration.test.ts` sigue verde y vigila los tres indices de QC-4 |
| R28 | `e2e/login.spec.ts` y `e2e/session.spec.ts` en verde sin un solo cambio dentro de ningun test(); `tests/unit/recetas-ui/recipe-route-contract.test.ts` y `tests/unit/proveedores/scope.test.ts` (guardias de alcance: la feature no estrena ruta, pantalla ni flujo navegable) |
| R29 | `tests/guards/` en verde (12 archivos, 123 tests) y `package.json` / `pnpm-lock.yaml` sin ningun cambio en el diff de la rama |

## Nota para el reviewer sobre `CHECKPOINTS.md > Datos y seguridad`

Esta ficha **no crea ninguna tabla de operacion**, asi que:

- la exencion de `users` / `roles` / `document_types` sigue intacta y sin tocar;
- `companies` y `memberships` **no llevan columna de empresa, y es correcto**: son ellas mismas
  la frontera. `companies` ES la empresa, y `memberships` es precisamente la fila que dice a que
  empresa pertenece alguien. Pedirles una columna de empresa seria circular. Se deja escrito
  porque es la excepcion que un reviewer va a mirar;
- separar por empresa las tablas de operacion es de **QC-49** (inventario), **QC-50** (recetas),
  **QC-51** (unidades), **QC-59** (proveedores) y **QC-60** (pedidos), y la guardia de esquema
  que lo hara cumplir es **QC-61**. Nada de eso entra aqui (R28);
- las dos tablas nuevas llevan `ENABLE` **y** `FORCE ROW LEVEL SECURITY` sin policies:
  deny-by-default para toda via que no sea Prisma (R23). Es defensa en profundidad, no la
  frontera de autorizacion, que vive en el service.

## Salida real de los tests

`pnpm test` (vitest, suite completa, con el `.env` del worktree cargado):

    Test Files  169 passed (169)
         Tests  1949 passed (1949)
      Duration  101.96s

`pnpm run typecheck` -> `tsc --noEmit`, sin salida, exit 0.
`pnpm run lint` -> `eslint`, sin salida, exit 0.
`pnpm run test:guardias` -> `Test Files 12 passed (12)`, `Tests 123 passed (123)`.

E2E (`pnpm exec playwright test e2e/login.spec.ts e2e/session.spec.ts`, chromium + webkit, sobre
la base propia ya sembrada):

    ok [chromium] login.spec.ts > entra con credenciales correctas y recibe la cookie de sesion httpOnly
    ok [webkit]   login.spec.ts > entra con credenciales correctas y recibe la cookie de sesion httpOnly
    ok [chromium] login.spec.ts > con credenciales incorrectas se queda en el login, avisa y no emite sesion
    ok [webkit]   login.spec.ts > con credenciales incorrectas se queda en el login, avisa y no emite sesion
    ok [chromium] session.spec.ts > ciclo de sesion sobre una ruta privada
    ok [webkit]   session.spec.ts > ciclo de sesion sobre una ruta privada
    6 passed (55.2s)

Seed contra la base propia, dos corridas seguidas (R18, R19):

    db:seed: roles creados: 2 (Administrador, Operador) - empresa inicial: creada (QuimiCloud) - usuario inicial: creado
    db:seed: nada que crear
    despues: roles=2, users=1, companies=1, memberships=1

## Como se demostro el riesgo 1 del `design.md > 9`

Era una exigencia explicita: un test que lo demuestre, no una lectura.
`countLiveUsersWithRole` se muto tres veces en el adaptador y se corrio el test de integracion:

| Mutacion | Resultado |
| --- | --- |
| `memberships: { some: {} }` (pierde el rol) | ROJO — "una persona viva cuya unica pertenencia es de rol Operador no cuenta como Administrador" |
| quitar `deletedAt: null` | ROJO — "un administrador dado de baja NO cuenta..." |
| `db.membership.count(...)` en vez de `db.user.count(...)` | ROJO — "una persona con DOS pertenencias de rol Administrador sigue contando UNA..." |

El `where` que quedo es
`{ deletedAt: null, memberships: { some: { role: { name: roleName } } } }`, y la misma traduccion
se aplico al `catch (P2002)` de `createInitialAdmin`, que era el segundo sitio con el mismo patron.

Riesgo 2 (literal duplicado), tambien demostrado mutando: cambiar el literal del `INSERT` a otro
nombre -> ROJO; mover los cuatro `ALTER ... ROW LEVEL SECURITY` delante del `DO $$` -> ROJO.

## Barrido de lectores huerfanos del rol (T19)

`rg 'role_id|roleId'` sobre `lib/`, `app/`, `components/`, `scripts/`, `tests/`, `db/` y `e2e/`
solo devuelve aciertos legitimos: el `roleId` propio de `Membership`, el `down.sql` y la migracion
de QC-4, comentarios que narran la mudanza, y variables de fixture que sirven para construir una
pertenencia. **Ninguna lectura del rol desde `users`** (R14).

## Dos cosas que el leader tiene que decidir

1. **Los fixtures de los E2E de QC-7 se tocaron; el guion NO.** `e2e/login.spec.ts` y
   `e2e/session.spec.ts` siembran su propio usuario, y hasta hoy lo hacian con `roleId` —columna
   que R14 borro—, ademas de que un usuario sin pertenencia ya no puede entrar (R17). El cambio
   era forzoso y de valor unico. Todos los hunks caen en la cabecera, los imports, las constantes
   de modulo, `createTestUser`, `beforeAll` y `afterAll`: ni una asercion, ni un selector, ni un
   `expect`, ni una linea dentro de ningun `test(...)`. T20 pedia "el archivo sin cambios en git",
   y eso no se pudo cumplir literalmente; el espiritu de la decision cerrada 14 —que nada cambio
   hacia fuera— si, y los seis tests pasan.
   El mismo cambio de fixture se aplico a `e2e/inventario.spec.ts`, `e2e/recetas.spec.ts` y a diez
   tests de integracion de `inventario`, `pedidos`, `proveedores` y `recetas`. Ese trabajo no
   estaba nombrado en ninguna task del `tasks.md`.
2. **Cuatro guardias de alcance de otras features llevaban congelada una foto del esquema** y
   quedaron rojas al aplicar la feature: `credential-policy-contract.test.ts` (censo de campos de
   `User`), `proveedores/module-contract.test.ts` (relationTargets de `User`),
   `proveedores/scope.test.ts` (censo de migraciones que nombran `suppliers`) y
   `recetas-ui/recipe-route-contract.test.ts` (allowlist de `db/`). Se **retensaron a la verdad de
   hoy sin relajarlas**; en `scope.test.ts` quedo mas apretada, porque se anadio una asercion de
   que la migracion de QC-47 no ejecuta ningun DDL sobre `suppliers` y solo la menciona en
   comentarios. Conviene que el reviewer las mire una a una: tocar la guardia de otra feature
   siempre merece un segundo par de ojos.

## Aviso operativo, ajeno a esta feature

`./init.sh --rapido` no llega a correr en este worktree: se corta antes, en
`scripts/validate-features.mjs`, con `faltan specs para features sdd en vuelo: QC-44`. Es estado
compartido de `feature_list.json`, no de esta rama, y hay que resolverlo antes del gate completo.
