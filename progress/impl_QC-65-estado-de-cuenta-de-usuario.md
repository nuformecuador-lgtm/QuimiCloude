# QC-65 — estado-de-cuenta-de-usuario · bitacora del implementer

> Zona `backend` · complejidad `low` · rama `feature/QC-65-estado-de-cuenta-de-usuario`
> Worktree: `.worktrees/QC-65-estado-de-cuenta-de-usuario/`
> Spec aprobado por el humano el 2026-09-08 (F1.4). Requisitos R1..R21 en
> `specs/QC-65-estado-de-cuenta-de-usuario/requirements.md`.

## Base de datos propia (antes de la primera migracion)

Van cinco features en las que el drift de la base compartida entre worktrees rompe algo, y
esta ficha trae migracion nueva sobre `users`. Asi que **antes** de escribir una sola linea de
SQL se monto base propia:

```
createdb -U postgres -h localhost -p 5432 QuimiCloude_QC65
```

- El `.env` del worktree se copio del principal cambiando **solo** el nombre de la base:
  `postgresql://postgres:***@localhost:5432/QuimiCloude_QC65?schema=public` en `DATABASE_URL`
  y en `DIRECT_URL`. El resto de variables (SESSION_SECRET, seed, storage) sin tocar.
- `pnpm install` en el worktree (node_modules propio) — **sin cambios** en `package.json` ni
  en `pnpm-lock.yaml` (R21).
- `pnpm run db:migrate` sobre la base nueva: *All migrations have been successfully applied*.
  O sea, QC-65 arranca sobre una base al dia y **vacia de drift**, no sobre la compartida.
- Ninguna otra base `QuimiCloude*` se toco.

## T3 — la respuesta de QC-47 sobre el backfill bajo `FORCE ROW LEVEL SECURITY`

No se eligio a ciegas ni se remidio: la respuesta ya estaba **escrita y medida** en
`progress/impl_QC-47-modelo-empresa-y-membresias.md > La comprobacion de RLS (T5)`. Citada:

- El rol de `DIRECT_URL` en local es `postgres`, **superusuario con `BYPASSRLS`**, asi que el
  `UPDATE` sobre `users` pasa — pero **pasa por la razon equivocada**: un superusuario salta la
  RLS pase lo que pase, `FORCE` incluido. La medicion demuestra que el backfill corre *aqui*,
  no que la RLS lo deje pasar.
- QC-47 midio ademas el caso que el superusuario oculta (dueno NO superusuario, `ENABLE`+`FORCE`,
  cero policies): el `UPDATE` **no falla, afecta a cero filas y se calla**. El peor modo de fallo.
- **Decision de QC-47, que QC-65 hereda tal cual:** el backfill se escribe sin envolverlo en
  `NO FORCE`/`FORCE`. La medicion no pide la mitigacion, y aplicarla igualmente seria inventar
  una salida que nadie midio. Queda anotado, como en QC-47, para la ficha que despliegue fuera
  de local; el leader decide si quiere la mitigacion preventiva.

La cita esta ademas en la cabecera del propio `migration.sql`, para que no haya que buscarla.

## Tandas A y B (T1..T7) — lo que quedo escrito

**Archivos creados**

- `lib/modules/identity/domain/account-status.ts` — la **unica** definicion del conjunto (R3):
  `USER_ACCOUNT_STATUSES`, el tipo `UserAccountStatus`, `INITIAL_USER_ACCOUNT_STATUS` (`pending`)
  y `SEED_ADMIN_ACCOUNT_STATUS` (`active`). Dominio puro: ni framework ni Prisma. **Sin** funcion
  de transicion ni de «puede entrar» (R14, R19).
- `db/migrations/20260908190002_user_account_status/migration.sql` (UP)
- `db/migrations/20260908190002_user_account_status/down.sql` (DOWN)
- `tests/unit/identity/schema/account-status-schema.test.ts`
- `tests/unit/identity/schema/account-status-migration.test.ts`

**Archivos modificados**

- `lib/modules/identity/index.ts` — reexport de los tres simbolos en el contrato del modulo.
- `db/schema.prisma` — `enum UserAccountStatus` (cuatro valores en ingles y minuscula, en el
  orden de la decision cerrada 1) y las tres columnas de `model User` con sus `@map`, sus
  defaults y `@@index([accountStatusChangedBy])`. `accountStatusChangedBy` va **escalar, sin
  `@relation`**, con el comentario `OJO` que avisa del drift (`design.md > 1.3`).
- `tests/unit/identity/credential-policy-contract.test.ts` y
  `tests/unit/identity/schema/identity-schema.test.ts` — las dos guardias ajenas, retensadas
  (ver seccion propia mas abajo).
- `specs/QC-65-estado-de-cuenta-de-usuario/tasks.md` — T1..T7 marcadas.

**Lo que NO se toco, y se comprobo:** `package.json` y `pnpm-lock.yaml` (diff vacio, R21),
`tests/unit/proveedores/module-contract.test.ts`, `verify-credentials.ts`, `account-lock.ts`,
`middleware.ts`, `deleted_at`, los tres indices unicos, el RLS y toda la UI.

### La migracion, verificada contra Postgres y no leida

- **El backfill (R6), medido:** antes de aplicar se crearon a mano en `QuimiCloude_QC65` una
  empresa, un rol y **dos usuarios**: uno vivo y otro con `deleted_at` no nulo. Tras
  `pnpm run db:migrate`, **las dos** filas quedaron `account_status = 'active'`, con
  `account_status_changed_by` NULL y `account_status_changed_at` relleno — incluida la dada de
  baja, que es justo lo que el `UPDATE` sin `WHERE` promete. En una transaccion con `ROLLBACK`
  se comprobo ademas que un alta sin estado nace `pending` con instante relleno (R5, R9). Las
  filas de prueba se borraron despues: `users`, `companies` y `roles` vuelven a cero.
- **El DOWN (R17), medido:** snapshot de `users` (columnas, indices, constraints, RLS) + el
  catalogo de tipos de `public` + `_prisma_migrations` **antes** de aplicar; `pnpm run db:rollback`;
  el mismo snapshot **despues**. `diff` de los dos: **sin una sola diferencia**, y sin rastro de
  `UserAccountStatus` ni de la fila en `_prisma_migrations`. Luego se reaplico en verde.
- **El drift de Prisma, cortado a mano:** `prisma migrate dev --create-only` emitio diecinueve
  `DROP CONSTRAINT` y nueve `DROP INDEX` sobre `orders`, `products`, `recipe_lines`, `recipes`,
  `supplier_catalog_lines`, `suppliers`, `units` y `presentations` — las FK e indices escritos a
  mano por QC-20, QC-24, QC-32, QC-33, QC-40 y QC-45, que Prisma no conoce. **Se borraron todos.**
  Que no vuelvan lo vigila `account-status-migration.test.ts`, que afirma que el UP no hace DDL
  sobre ninguna tabla que no sea `users`.

### Las dos guardias ajenas retensadas (T7) — para mirar una a una

Tocar la guardia de otra feature merece un segundo par de ojos, asi que aqui va el cambio exacto:

| Archivo | Caso | Cambio |
|---|---|---|
| `tests/unit/identity/credential-policy-contract.test.ts` | *esta feature no anade migraciones ni columnas* (R21 de QC-19) | dentro del `toEqual([...].sort())` se insertaron **tres** entradas —`accountStatus`, `accountStatusChangedAt`, `accountStatusChangedBy`— entre `mustChangeCredential` y `documentType`, con el comentario de por que entraron. **Sigue siendo `toEqual`** sobre la lista completa; no se quito ningun campo y los tres de QC-19 (`failedLoginAttempts`, `lockLevel`, `lockedUntil`) siguen intactos. |
| `tests/unit/identity/schema/identity-schema.test.ts` | *el modelo User declara los nueve datos del usuario* | bloque nuevo `ACCOUNT_STATUS_FIELDS` (3 pares campo/columna) declarado junto a `LOCKOUT_FIELDS`/`SEED_FIELDS`, y **una sola linea** anadida a la lista esperada del `toEqual`. `BUSINESS_FIELDS`, `LOCKOUT_FIELDS` y `SEED_FIELDS` no cambian, ni sus `toHaveLength`. |

**Ningun `toEqual` se degrado a `toContain`.** `tests/unit/proveedores/module-contract.test.ts`
**no se toco** —es justo el que se protege eligiendo el escalar (`design.md > 1.3`)— y sigue
verde; ademas `account-status-schema.test.ts` replica su afirmacion
(`relationTargets('User')` sigue siendo `['Company','DocumentType','Role']`).

## Tandas C y D (T9..T16) — el seed, los constraints reales y el alcance

**Archivos modificados**

- `lib/modules/identity/ports/initial-access-repository.ts` — `createInitialAdmin` gana
  `accountStatus: UserAccountStatus` **obligatorio** en su entrada. Firma final:

  ```ts
  createInitialAdmin(input: {
    roleId: string;
    companyId: string;
    accountStatus: UserAccountStatus;
    username: string;
    email: string;
    passwordHash: string;
    firstNames: string;
    lastNames: string;
    birthDate: Date;
    phone: string;
    documentTypeCode: DocumentTypeCode;
    documentNumber: string;
  }): Promise<{ id: string }>;
  ```

  `accountStatusChangedBy` **no esta** en la firma: se deja sin escribir (NULL = el sistema, R10).
- `lib/modules/identity/domain/seed-initial-access.ts` — pasa `SEED_ADMIN_ACCOUNT_STATUS`.
- `.../adapters/driven/persistence/initial-access-repository-prisma.ts` — lo escribe como una
  columna mas del **mismo `user.create`**, misma sentencia y misma transaccion. No hay ningun
  instante en el que la fila exista sin estado.
- `tests/unit/identity/seed/seed-initial-access.test.ts`,
  `tests/integration/identity/identity-constraints.int.test.ts`,
  `tests/integration/identity/identity-seed.int.test.ts` (casos nuevos).

**Archivo creado:** `tests/unit/identity/account-status-scope.test.ts` — la guardia de alcance.

**`scripts/seed.ts` NO se toco (T11).** `git diff origin/dev -- scripts/seed.ts` da **cero
lineas** y `SeedOutcome` queda integro. Medido, no razonado: dos corridas seguidas de
`pnpm run db:seed` contra `QuimiCloude_QC65` dejan **un solo** administrador —`admin`,
`account_status = active`, `account_status_changed_by` NULL, `account_status_changed_at` igual a
`created_at`, `deleted_at` NULL— y la segunda imprime *db:seed: nada que crear*.

**Fixtures (T15): ninguno necesito reordenarse.** Se revisaron los `beforeAll`/`afterAll` de
`tests/integration/identity/**` y de `e2e/**`, mas el helper `resetIdentityToEmptyState`. La FK
auto-referencial `RESTRICT` (riesgo 5 del design) **no puede morder** porque nada de produccion
ni de fixture escribe `account_status_changed_by`: solo lo escriben los casos nuevos de T13, y
cada uno dentro de su propio `ROLLBACK`. Comprobado corriendo: 85/85 de integracion y 8/8 E2E.
El `git diff` de `e2e/` esta **vacio** y ningun `test(...)` cambio de contenido (R5: los fixtures
siguen creando usuarios sin estado, que nacen `pending`, y eso es correcto — tocarlos seria
anticipar QC-78).

**E2E (T16): 8 pasados**, 4 en chromium y 4 en webkit (3 de `login.spec.ts` + 1 de
`session.spec.ts` en cada navegador). **Cero E2E anadidos**: esta ficha no cambia el
comportamiento del login.

### Los casos se demostraron falsables mutando, no razonando

No basta con que un test pase; tiene que poder caer. Se muto de verdad contra
`QuimiCloude_QC65` y se restauro despues (indice y constraint verificados con `pg_indexes` y
`pg_constraint`):

- Se metio `account_status` en `users_email_unique` y se anadio un CHECK que prohibia `blocked`:
  **cayeron 4 casos**, entre ellos el de R15 y el de R14 — que es exactamente el criterio que
  pide `tasks.md > T13`. Restaurado: 47/47 verdes.
- Se cambio `SEED_ADMIN_ACCOUNT_STATUS` a `inactive`: **cayo** el caso del seed, o sea el valor
  sale de la constante del dominio y no de un literal repetido en el test (R7). Restaurado.
- Se creo un archivo `lib/shared/tmp-fuga-qc65.ts` que leia `accountStatus`: **cayo** la igualdad
  cerrada de la guardia de alcance, o sea R19 detecta una lectura nueva en cualquier archivo.
  Borrado.

## Mapa de trazabilidad `R<n> -> test` (los 21, sin hueco)

Abreviaturas: **[S]** `tests/unit/identity/schema/account-status-schema.test.ts` ·
**[M]** `tests/unit/identity/schema/account-status-migration.test.ts` ·
**[A]** `tests/unit/identity/account-status-scope.test.ts` ·
**[C]** `tests/integration/identity/identity-constraints.int.test.ts` ·
**[SU]** `tests/unit/identity/seed/seed-initial-access.test.ts` ·
**[SI]** `tests/integration/identity/identity-seed.int.test.ts`

| R | Que exige | Test que lo cubre |
|---|---|---|
| **R1** | estado de un conjunto cerrado, nunca ausente | [S] *accountStatus es el enum, obligatorio, con el default del dominio y su @map (R1, R5)* · [C] *acepta los cuatro valores del conjunto y rechaza cualquier otro sin dejar la fila* |
| **R2** | valor fuera del conjunto lo rechaza **la base** | [C] *acepta los cuatro valores del conjunto y rechaza cualquier otro sin dejar la fila* (`22P02` real) · [M] *el CREATE TYPE declara EXACTAMENTE los cuatro valores del dominio, y cae si divergen* |
| **R3** | **una sola** definicion del conjunto, y las otras dos coinciden | [S] *el enum del esquema es EXACTAMENTE la lista del dominio, y cae si divergen* · [M] *el CREATE TYPE declara EXACTAMENTE los cuatro valores del dominio, y cae si divergen* (los dos **importan** `USER_ACCOUNT_STATUSES`) |
| **R4** | ingles y `snake_case` | [S] *los cuatro valores van en ingles y en minuscula (R4)* · [S] *las tres columnas van en ingles y snake_case (R4)* · [M] *las tres columnas van en ingles y snake_case (R4)* |
| **R5** | alta sin estado deja `pending` | [C] *un alta que no dice nada del estado nace en el estado inicial y con el instante del alta* · [S] *accountStatus es el enum, obligatorio, con el default del dominio y su @map (R1, R5)* |
| **R6** | al migrar, **todas** las filas a `active`, tambien las de baja | [M] *actualiza TODAS las filas, sin WHERE, y cae si alguien acota el barrido* + la medicion contra Postgres (dos filas preexistentes, una con `deleted_at`, las dos `active`) |
| **R7** | el seed deja el admin `active` **explicito** | [SU] *el administrador inicial se crea con el estado de cuenta del seed, explicito y distinto del que nace por defecto* · [SI] *el administrador que crea el seed queda en la base con el estado del seed y sin autor del cambio* |
| **R8** | instante del ultimo cambio, nunca ausente | [S] *accountStatusChangedAt es un instante obligatorio, timestamptz(6), con default now() (R8, R9)* · [C] *un alta que no dice nada del estado nace en el estado inicial y con el instante del alta* |
| **R9** | se rellena solo al crear y al migrar | [C] *un alta que no dice nada del estado nace en el estado inicial y con el instante del alta* · [M] *las anade en un solo ALTER TABLE, con sus defaults y su opcionalidad* (`DEFAULT CURRENT_TIMESTAMP`) |
| **R10** | autor **opcional**; NULL = lo hizo el sistema | [S] *accountStatusChangedBy es un uuid OPCIONAL con su @map (R10)* · [SI] *el administrador que crea el seed queda en la base con el estado del seed y sin autor del cambio* |
| **R11** | autor inexistente se rechaza | [C] *rechaza un autor del cambio que no existe y solo acepta el id de un usuario real* (`23503`) · [M] *la FK auto-referencial va con RESTRICT, y cae si alguien la afloja* |
| **R12** | no se puede borrar **fisicamente** a quien figura como autor | [C] *impide el borrado FISICO de un usuario que figura como autor del ultimo cambio de estado* (`23503`) · [M] *la FK auto-referencial va con RESTRICT, y cae si alguien la afloja* |
| **R13** | solo el **ultimo** cambio, sin historial | [C] *solo guarda el ULTIMO cambio: escribir un estado nuevo sustituye el rastro anterior* · [S] *no hay tabla ni columna de cambios anteriores de estado, y el test cae si aparece* · [M] *no crea ninguna tabla: no hay historial de cambios de estado (R13)* |
| **R14** | cualquier valor sigue a cualquier otro; sin maquina de estados | [C] *admite cualquiera de los cuatro valores como siguiente de cualquier otro, blocked a active incluido* — cae si alguien anade un CHECK o un disparador de transicion (**demostrado mutando**) |
| **R15** | las tres unicidades no cambian; `inactive` sigue ocupando su hueco | [C] *una cuenta inactive sigue ocupando su correo, su nombre de usuario y su documento en su empresa* (`23505`, y libre en otra empresa) — cae si alguien mete `account_status` en un unico (**demostrado mutando**) |
| **R16** | estado y borrado logico, independientes | [C] *el estado de cuenta y el borrado logico son independientes: ninguno mueve al otro* · [M] *ni el UP ni el DOWN tocan el borrado logico, el bloqueo de QC-19, los unicos ni el RLS* |
| **R17** | migracion aditiva y reversible | [M] *la migracion es ADITIVA: no hay un solo DROP en todo el UP (R17)* · *quita indice, FK, las tres columnas y el tipo EL ULTIMO, y cae si se reordena* · *no deja el tipo huerfano ni recrea nada que el UP no hubiera creado* + el **rollback real** con snapshots identicos |
| **R18** | no se toca el bloqueo por intentos fallidos de QC-19 | [A] *ni verify-credentials ni account-lock mencionan el estado de cuenta* · [A] *el diff de la rama no toca ninguno de los dos archivos* · [M] *ni el UP ni el DOWN tocan el borrado logico, el bloqueo de QC-19, los unicos ni el RLS* |
| **R19** | **nadie lee** el estado para decidir nada | [A] *los archivos de produccion que nombran el estado son EXACTAMENTE los cinco permitidos* (igualdad cerrada, **demostrado mutando**) · [A] *ni el login, ni la sesion, ni el middleware, ni la UI lo nombran* · [A] *el esquema y la migracion, que son los otros dos sitios permitidos, si lo nombran* · [S] y [M] *NINGUN indice sobre el estado (R19)* |
| **R20** | ningun caso de uso, adaptador driving, ruta, Server Action ni pantalla | [A] *el diff de la rama no toca app/, components/ ni hooks/, y no anade ningun adaptador driving* · [A] *el modulo identity no gana ningun archivo driving que nombre el estado* |
| **R21** | cero dependencias nuevas | [A] *el diff de la rama no toca package.json ni pnpm-lock.yaml* |

**Las decisiones cerradas, todas con su `R<n>`:** 1 y 2 con R1/R3/R4 · 3 con R5 · 4 con R6/R7 ·
5 con R8/R10/R13 · 6 (`blocked` es lo mismo que QC-19, pero no se unifica aqui) con R18 ·
7 (que estados entran al login) con R19 —nadie lo lee todavia; el corte llega en QC-78— ·
8 (sacar de `blocked`) con R14 · 9 (deshabilitar no libera correo/username/documento) con R15 ·
10 (relacion con `deleted_at`) con R16 · 11 (idioma) con R4 · 12 (quien lee) con R19.

## Verificacion — la salida real, corrida por el implementer

```
> quimicloude@0.1.0 typecheck
> tsc --noEmit
(sin una sola linea de error)

> quimicloude@0.1.0 lint
> eslint
(sin una sola linea de error)

pnpm exec vitest run tests/unit/identity tests/integration/identity
 Test Files  38 passed (38)
      Tests  581 passed (581)
   Duration  25.72s
```

Complementos corridos por `backend_dev` durante las tandas:

```
pnpm exec vitest run tests/integration/identity/identity-constraints.int.test.ts
 Tests  47 passed (47)          # 39 antes + 8 nuevos
pnpm exec vitest run tests/integration/identity/identity-seed.int.test.ts
 Tests  13 passed (13)          # 12 antes + 1 nuevo
pnpm exec vitest run tests/unit/identity/seed/seed-initial-access.test.ts
 Tests  20 passed (20)          # 19 antes + 1 nuevo
pnpm exec vitest run tests/unit/identity/account-status-scope.test.ts
 Tests  9 passed (9)
pnpm exec vitest run guard
 Test Files  24 passed (24) | Tests 227 passed | 4 skipped
pnpm exec playwright test e2e/login.spec.ts e2e/session.spec.ts
 8 passed (3.1m)                # 4 chromium + 4 webkit
```

Del gate (`AGENTS.md > quien corre que`): **el implementer NO corre la suite completa**. El
`./init.sh --rapido` de cada tanda y el `./init.sh` completo antes del PR (T18) son del leader.

## Para el leader y el reviewer — lo que hay que mirar

1. **Rojos ajenos y PREEXISTENTES, que no son de esta ficha.** El `./init.sh` completo se pondra
   rojo por ellos, y conviene saberlo antes de mirar el diff:
   - `tests/unit/navegacion/private-layout-menu.test.tsx` (2 casos): **falla ya en `dev`**
     mergeado en esta rama, sin ningun cambio de QC-65. Comprobado con el arbol limpio
     (`git stash -u`), no razonado.
   - `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`, `.../supplier-page.test.tsx` y
     `tests/ui/login-form-uncontrolled-warning.test.tsx`: **flaky bajo carga paralela**
     (timeouts de 5 s). Corridos en solitario, los tres pasan (54 casos verdes).
   Ninguno importa nada del estado de cuenta. **No se tocaron**: arreglar la deuda de otro dentro
   de esta rama seria ensuciar el diff, y es decision del leader.
2. **Las dos guardias ajenas retensadas** (seccion propia mas arriba): merecen el segundo par de
   ojos que pide el design. Ninguna se relajo; ningun `toEqual` paso a `toContain`.
3. **Dos ajustes tecnicos dentro de los casos nuevos**, que no cambian lo que el spec mide:
   - **R12 usa `DELETE` crudo** en vez de `tx.user.delete`: el cliente Prisma envuelve el error
     en `P2003` y el caso dejaria de afirmar sobre el SQLSTATE. Con `$executeRaw` llega el
     `23503` literal, que es el criterio de `tasks.md`. Es el mismo motivo por el que ese archivo
     ya usaba SQL crudo para las altas que se espera que fallen.
   - **La cota temporal de R9** se mide contra el reloj de Node con 60 s de holgura, porque hoy
     quien rellena `account_status_changed_at` en un alta es el cliente Prisma
     (`@default(now())`) y no el `CURRENT_TIMESTAMP` de la transaccion; compararlo contra el
     reloj del servidor daba un rojo determinista. Lo que el caso afirma **sin holgura** es lo
     que importa: que el instante no esta ausente y que es exactamente `createdAt`.
4. **El literal `active` del backfill** se vigila en [M] contra `SEED_ADMIN_ACCOUNT_STATUS` y
   contra «no es `INITIAL_USER_ACCOUNT_STATUS`», en vez de escribirlo a mano en el test. El
   design no nombra una constante propia para «el estado de las filas preexistentes»; si el
   reviewer la quiere, es cambio de contrato y por eso no se hizo por cuenta propia.
5. **Deuda anotada, heredada de QC-47:** el backfill corre en local porque el rol es superusuario
   con `BYPASSRLS`, no porque la RLS lo permita. Con un dueno NO superusuario el `UPDATE`
   afectaria a cero filas **en silencio**. Aqui, ademas, **no hay `SET NOT NULL` posterior que lo
   delate** —la columna nace `NOT NULL DEFAULT`—, asi que el fallo seria callado. Queda escrito
   para la ficha que despliegue fuera de local; la mitigacion preventiva la decide el leader.

## Estado de las tasks

T1..T7, T9..T11 y T13..T16 estan **hechas y marcadas** en `tasks.md`. T8 y T12 (cierres de tanda
con `./init.sh --rapido`) y T18 (`./init.sh` completo antes del PR) son del leader, por el
reparto del gate. T17 es esta bitacora.

## Ajuste posterior a la review — menor 4 (bomba de relojeria de la guardia de alcance)

`tests/unit/identity/account-status-scope.test.ts` calculaba lo tocado como
`git diff --name-only dev...HEAD` unido a `git status --porcelain`, y **tres** de sus casos
—R18 *el diff de la rama no toca ninguno de los dos archivos*, R20 y R21— abrian con
`expect(tocados.length).toBeGreaterThan(0)`. En cuanto la ficha se mergee, sobre `dev` con el
arbol limpio ese conjunto es **vacio** y los tres caerian: un rojo permanente en `dev` que ademas
enmascara los rojos de verdad. **Eran tres, no cuatro:** el cuarto caso que llama a
`archivosTocados()` es el del rango git, que solo afirma `not.toThrow()` y sobrevive intacto al
conjunto vacio; no se toco.

**Que se cambio:** una funcion `tocadosOMudo(ctx)` que, cuando el conjunto esta vacio, declara el
caso `skipped` con `ctx.skip()` en vez de dejarlo verde. Se eligio `skip` y no un `return`
temprano a proposito: un verde afirmaria «he revisado el diff y no cruza ninguna frontera», que
seria falso; `skipped` dice lo unico cierto — **no habia nada que revisar**. La distincion queda
escrita junto al codigo, porque **no contradice** la cabecera del archivo: «no PUEDO mirar» (el
rango git no resuelve) sigue siendo **rojo**; «he mirado y no habia nada que mirar» es lo unico
que queda mudo.

**Nada se relajo:** en rama con cambios reales los tres vigilan exactamente igual —mismas listas
cerradas, mismas igualdades, ningun `toEqual` degradado a `toContain`, ningun `expect` retirado
mas alla del `toBeGreaterThan(0)` que la rama nueva ya cubre—. Verificado en tres escenarios:
(a) aqui, rama sucia: **9 passed, 0 skipped**; (b) post-merge simulado (rango vacio y arbol
limpio via commit temporal, revertido despues): **6 passed | 3 skipped**, y los tres skipped son
exactamente los del diff; (c) la guardia **sigue mordiendo**: un archivo temporal en `lib/` que
leyera `accountStatus` puso en rojo la lista cerrada de R19. `pnpm typecheck`, `pnpm lint` y
`pnpm exec vitest related --run` sobre ese archivo, en verde (9/9).

**Solo ese archivo.** `tests/unit/configuracion-ui/data-table-intacta.test.ts` de QC-45 lleva la
misma bomba y **NO se toco**: es de otra ficha y queda anotada como deuda del arnes.
