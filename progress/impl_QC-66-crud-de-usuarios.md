# QC-66 — crud-de-usuarios · bitacora de implementacion

> Zona: `backend` · Complejidad: `medium` · Rama: `feature/QC-66-crud-de-usuarios`
> Worktree: `.worktrees/QC-66-crud-de-usuarios` · Base: `origin/dev` (`c870825`)
>
> Spec aprobado por el humano el 2026-09-10. **49 requisitos** (R1-R49), **20 tasks** (T0-T20).
> Coordina el `implementer`; implementa `backend_dev`. El gate (`./init.sh --rapido` por tanda,
> `./init.sh` completo antes del PR) lo corre el **leader**.

---

## Bloque 0 — T0: la base heredada, verificada punto por punto

Los ocho puntos de `tasks.md > T0`, con su evidencia leida en esta rama. **Nada de esto se crea
ni se modifica en esta feature.**

| # | Qué | Evidencia |
| --- | --- | --- |
| 1 | `model User` completo + `enum UserAccountStatus` | `db/schema.prisma` L159-223: `roleId` L170, `companyId` L176, `deletedAt` L179, `mustChangeCredential` L188, `accountStatus` L194, `accountStatusChangedAt` L199, `accountStatusChangedBy` L209. Enum L124-129 con `active`/`pending`/`inactive`/`blocked`. |
| 2 | Los tres indices unicos por empresa, parciales | `db/migrations/20260904180600_companies_and_user_company/migration.sql` L171-173: `users_email_unique`, `users_username_unique`, `users_document_unique`, los tres `WHERE "deleted_at" IS NULL`. **No se tocan** (R38). |
| 3 | Las constantes del dominio | `permissions.ts`: `PERMISSIONS` con **11** entradas (`grep -c 'code:'` = 11) + `SEED_ROLE_PERMISSIONS`; `roles.ts` L7 `ROLE_ADMINISTRADOR`; `require-permission.ts` L26 `assertPermission`; `account-status.ts` L33 `USER_ACCOUNT_STATUSES`; `credential-policy.ts` L69 `evaluateCredentialRules`, L86 `createCredentialPolicy`, L19 `CREDENTIAL_MIN_LENGTH = 8`; `credentials.ts` L18 `CREDENTIAL_MAX_LENGTH = 64`; `display-name.ts` L17 `buildDisplayName`. |
| 4 | El seed idempotente, derivado | `seed-initial-access.ts` L5 importa `PERMISSIONS` y `SEED_ROLE_PERMISSIONS`; L112-113 «LEER que falta y CREAR exactamente eso. Sin `upsert` y sin `delete`»; L196 y L221 derivan de las constantes. **Su algoritmo no se modifica** (design.md § 3.4). |
| 5 | El cableado ya existente de composicion | `lib/composition/index.ts` L162 `checkCredentialPolicy`, L163 `passwordHasher`, L178 `getSessionUser`, L180 `getSessionContext`. Se **reutilizan**. |
| 6 | La paginacion compartida | `lib/shared/pagination.ts` L10 `DEFAULT_PAGE_SIZE = 10`, L17 `MAX_PAGE_SIZE = 25`, L33 `toOffsetLimit`, L51 `buildPage`. |
| 7 | Las cinco copias del contrato de lista + su guardia | `lib/modules/{inventario,pedidos,proveedores,recetas,unidades}/domain/list-query.ts`; `tests/guards/guard-contrato-listados.test.ts` L53-54 `MODULOS` con los cinco y el texto «cinco» en L1, L3, L6, L10, L12, L14, L53, L213-261. Pasan a **seis** en T7. |
| 8 | Que **no** existen todavia | `lib/modules/identity/domain/errors.ts` -> no existe; `lib/modules/identity/domain/actor.ts` -> no existe. Nacen en T3 y T6. |

**Veredicto T0: los ocho verificados. No se para.**

### Montaje del worktree (no es una task, pero es condicion de todo lo demas)

El worktree venia sin `node_modules` ni `.env` (solo dos de los cinco worktrees activos los
tenian). Se monto sin tocar el worktree principal:

- `.env` copiado desde `.worktrees/QC-78-estado-de-cuenta-en-el-acceso/.env` (no desde `labs/`).
  **OJO: esto trajo su `DATABASE_URL` y fue un error, corregido en la tanda 1** — ver
  «Una base de datos equivocada». La base de esta feature es `QuimiCloude_QC66`.
- `pnpm install --prefer-offline` -> `Done in 3m 13.6s using pnpm v10.10.0`.
- `pnpm exec prisma generate` -> `Generated Prisma Client (v6.19.3)` (pnpm ignora los build
  scripts de `@prisma/client`, asi que el generate es explicito).
- `pnpm exec prisma migrate status` -> `Database schema is up to date!` (la base real responde,
  asi que los dos tests de integracion de T16/T17 son ejecutables).

### Linea base de verificacion, medida ANTES de escribir una sola linea

Para que nadie me atribuya un rojo ajeno:

- `pnpm exec eslint .` -> **limpio, sin salida**.
- `pnpm run typecheck` -> **3 archivos en rojo, ninguno de esta feature**:
  - `app/layout.tsx(43,56)`: `Cannot find name 'LayoutProps'` (tipo generado por `next build`,
    ausente en un worktree recien montado).
  - `tests/unit/recetas/recipe-lines-catalog.test.ts` y `tests/unit/recetas/recipe-service.test.ts`:
    `Property 'stock' is missing in type ... ProductRef` — es el arreglo en vuelo que el worktree
    principal tiene sin commitear en esos mismos dos archivos.

**Criterio de cierre de cada tanda: el typecheck no gana ningun archivo fuera de esos tres.**

**Ampliacion medida en la tanda 1** (el typecheck y el lint no los veian, porque son tests que
corren git): `tests/unit/recetas/module-contract.test.ts`,
`tests/unit/recetas-ui/recipe-route-contract.test.ts` y `tests/unit/unidades/modulo-intacto.test.ts`
fallan con `el rango git origin/dev...HEAD no estaba disponible`. Son tests de «modulo intacto» que
comparan contra un rango git que un worktree recien montado no tiene. **Linea base real: 5
archivos, ninguno de esta feature.**

---

## Tanda 1 — el catalogo a trece, su ripple, su migracion y la jerarquia de errores (T1-T5)

Dos `backend_dev` en paralelo, sin un solo archivo en comun: uno con T1 -> T2 -> T4 -> T5, otro con T3.

### Una base de datos equivocada, detectada y devuelta a su sitio (antes de T1)

Al montar el worktree copie el `.env` del worktree de QC-78, y con el su `DATABASE_URL`. La
convencion real del repo es **una base por feature** (`QuimiCloude_QC14`, `_QC47`, `_QC65`, `_QC70`,
`_QC74`, `_QC78`... trece en la instancia local), asi que T4 aplico la migracion del catalogo sobre
`QuimiCloude_QC78`, la base de una feature `in_progress` ajena. Corregido entero:

1. `pnpm exec tsx scripts/db-rollback.ts` sobre `QuimiCloude_QC78` ->
   `20260910120000_user_permissions_catalog revertida.`
2. Estado de `QuimiCloude_QC78` comprobado despues: `permissions` = **11**, `role_permissions` =
   **12**, filas `usuarios.*` = **0**, filas de esta migracion en `_prisma_migrations` = **0**.
   **La base de QC-78 quedo exactamente como estaba.**
3. `CREATE DATABASE "QuimiCloude_QC66"`, `.env` repuntado a ella, `prisma migrate deploy` ->
   `All migrations have been successfully applied.`, y `tsx scripts/seed.ts` ->
   `roles creados: 2 ... permisos creados: 11 ... asignaciones permiso-rol creadas: 14 ...`
4. Estado de `QuimiCloude_QC66`: `permissions` = **13**, `role_permissions` = **14**, `usuarios.*` =
   **2**, 1 usuario, 2 roles.

**Efecto lateral util, no planificado:** el paso 1 es **R44 verificado contra una base real** —el
`down.sql` devolvio el catalogo a sus once entradas y sus doce asignaciones exactas— y el paso 3
ejerce el camino «base virgen» que `design.md > 3.2` predijo: ahi el `INSERT ... SELECT` de
`role_permissions` inserta **cero** filas porque el rol `Administrador` todavia no existe, y es el
seed el que siembra las catorce asignaciones (de ahi el «asignaciones creadas: 14» frente al
«permisos creados: 11»). **Los dos caminos convergen**, como decia el diseno.

### T1 — el catalogo pasa de once a trece · R8, R9, R12

`lib/modules/identity/domain/permissions.ts` (+29/-5).

- Dos entradas al final de `PERMISSIONS`, con el estilo y el orden de las once anteriores, que
  quedan **sin ningun cambio**.
- Los dos codigos al final de `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]`, **uno a uno**. El
  `ROLE_OPERADOR` sigue siendo `['inventario.consultar']` exacto (R9).
- Cabecera: «once» -> «trece», y parrafo nuevo que empieza literalmente `**Esto enmienda QC-74 R1**`,
  al lado del de QC-38 que enmendaba su R2. Dice con esas palabras que `usuarios` **no es ninguna
  carpeta** de `lib/modules/`, que el modelo `User` es `/// @module identity`, y que el codigo vale
  igual porque lo lee una persona y `identidad.consultar` no dice QUE se consulta (R12, decision
  cerrada 2). No esta disimulada.

### T2 — el ripple del catalogo compartido, en la MISMA tanda · R48

Los **seis** archivos ajenos que `design.md > 2` habia medido, mas **dos hallazgos** que esa
medicion no tenia:

| # | Archivo | Cambio |
| --- | --- | --- |
| 1 | `tests/guards/guard-permisos-sembrados.test.ts` | titulo y mensaje de fallo a «trece», `.toBe(13)`. Ancla anti-vacuidad intacta |
| 2 | `tests/guards/guard-nav-permisos-declarados.test.ts` | `toHaveLength(13)`. **El arbol de navegacion NO se toca**: sigue con 7 enlaces, el item de usuarios es de QC-67 |
| 3 | `tests/unit/navegacion/qc75-convenciones.test.ts` | `toHaveLength(13)` y los dos codigos en `CODIGOS_QC74`; **mas el septimo caso rojo de abajo** |
| 4 | `tests/unit/identity/permissions.test.ts` | los 13 codigos en `CODIGOS_DEL_REQUISITO`, `toBe(13)`, titulos, **`'usuarios'` sumado a `MODULOS` y a `MODULOS_CON_ESCRITURA`** con el comentario de la enmienda, y **dos casos nuevos** |
| 5 | `tests/unit/identity/seed/seed-initial-access.test.ts` | «trece y catorce», `toBe(14)`, `toHaveLength(13)` |
| 6 | `tests/integration/identity/identity-seed.int.test.ts` | comentarios y titulos a trece/catorce, **y un literal que el diseno decia que no existia** |

**Los dos hallazgos que el `design.md` no tenia, cazados y arreglados aqui y no luego:**

1. **Un septimo caso rojo dentro del archivo 3.** `qc75-convenciones.test.ts` tiene un segundo caso,
   «los modulos son exactamente los cinco de negocio mas dashboard y unidades», que se pone rojo
   porque `usuarios` es un modulo nuevo. El titulo pasa a «...mas dashboard y usuarios» y `esperados`
   suma `'usuarios'` con el comentario de la enmienda. **No** se metio `usuarios` en
   `MODULOS_DE_NEGOCIO`, porque no es un modulo del ERP ni una carpeta: se suma en el punto de la
   asercion.
2. **`design.md > 2` fila 6 se equivoca.** Decia que en `identity-seed.int.test.ts` «los conteos ya
   se derivan de `PERMISSIONS`, asi que no hay numero literal que cambiar». **Si lo hay**:
   `expect(TOTAL_DE_ASIGNACIONES_DEL_SEED).toBe(12)`, y estaba rojo. Pasa a `14`. El resto del
   archivo si deriva.

**Ningun octavo archivo.** `tests/guards/guard-contrato-listados.test.ts` —el septimo que
`design.md > 8.1` declara— **no se toco y esta verde** con el catalogo a trece: su ancla de «cinco
modulos» es de listados, no del catalogo. Se toca en **T7**, que es su sitio.

**Prueba de que ninguna expectativa se elimino ni se debilito (R48).** El diff de `tests/` borra
exactamente **6** lineas que contienen `expect(`, y las seis son la misma asercion reemitida con el
numero nuevo (`11->13`, `12->14`). Las demas lineas borradas son titulos de `it(` reescritos. Ni un
`toEqual` degradado a `toContain`, ni un caso saltado, ni un `expect` perdido. Y
`permissions.test.ts` **gana** dos casos:

- `QC-66 R9: el Administrador tiene usuarios.consultar Y usuarios.modificar, escritos uno a uno`
- `QC-66 R9: el Operador no recibe ninguno de los dos permisos de usuarios`

### T3 — la jerarquia de errores de `identity` · R41 (mitad de dominio)

`lib/modules/identity/domain/errors.ts` (**nuevo**; `identity` no tenia ninguna clase de error) y
`tests/unit/identity/usuarios/errors.test.ts` (**nuevo**, carpeta nueva).

`export abstract class IdentityError extends Error` con `abstract readonly code: string`, y las
**nueve** subclases con los `code` exactos de `design.md > 6.4`: `unauthorized`, `not_found`,
`duplicate_email`, `duplicate_username`, `duplicate_document`, `role_not_found`, `self_operation`,
`last_administrator`, `invalid_input`.

Patron **copiado** de `lib/modules/unidades/domain/errors.ts` (identico en `proveedores`): base
abstracta con `abstract readonly code`, subclases con `readonly code = '...'` sin union ni enum,
mensaje por defecto como unico parametro opcional, `this.name = new.target.name` y
`Object.setPrototypeOf(this, new.target.prototype)` en la base, **sin `cause`** y **sin type guard**,
porque ningun modulo del repo los usa y la discriminacion del repositorio es
`error instanceof <Modulo>Error` + `error.code`. `invalid_input` es el mismo `code` que ya comparten
los otros cuatro modulos.

El test afirma el `code` **por clase**, nunca por el texto del mensaje (R41), el `instanceof` y la
unicidad de los nueve codigos. Importa por ruta profunda a proposito: el barrel es **T15**.

### T4 — la migracion de DATOS del catalogo, con su `down.sql` · R11, R43, R44

`db/migrations/20260910120000_user_permissions_catalog/{migration.sql,down.sql}` (nuevos).

El SQL es el de `design.md > 3.2` y `> 3.3`, literal, con su cabecera de comentarios. **Cero
`ALTER`, `CREATE` y `DROP`**: solo dos `INSERT`. `ON CONFLICT DO NOTHING` en las dos tablas (R11);
el rol resuelto **por nombre** con subselect, nunca un uuid a mano; `updated_at` explicito porque
`permissions` no lo tiene por defecto. El DOWN borra **primero** `role_permissions` y **despues**
`permissions`, porque la FK es `RESTRICT`, y acota por codigo.

**Decision del `backend_dev` que conviene que conste: NO uso `pnpm run db:migrate:create`.** Envuelve
`prisma migrate dev`, que ante el drift conocido de este repo (19 `DROP CONSTRAINT` + 9 `DROP INDEX`
documentados en QC-65/QC-74) puede ofrecerse a **resetear la base real**, que aqui responde. Creo la
carpeta a mano y escribio el SQL. Se aparta de la letra de T4 y esta bien: el criterio de hecho de
T4 es el SQL resultante, no la herramienta.

Verificacion real:

```
pnpm run db:migrate
  Applying migration `20260910120000_user_permissions_catalog`
  All migrations have been successfully applied.
pnpm run db:migrate  (segunda vez)
  No pending migrations to apply.
prisma db execute  (reejecutando el MISMO migration.sql, que es la idempotencia de verdad)
  Script executed successfully.
```

Estado despues: `permissions` = 13, `usuarios.*` presentes, `role_permissions` = 14, las dos
asignaciones del `Administrador` y **sin duplicar**.

### T5 — el test estatico de la migracion · R8, R11, R43, R44

`tests/unit/identity/schema/user-permissions-migration.test.ts` (nuevo), 11 casos.

Los dos codigos y sus descripciones se comparan contra `PERMISSIONS` **importado** y el nombre del
rol contra `ROLE_ADMINISTRADOR` **importado**: en el test no hay **ni un literal de codigo copiado**,
que es lo que impide que las dos escrituras del catalogo divergan. Afirma ademas que el UP no
contiene `ALTER`/`CREATE`/`DROP`, que las dos sentencias llevan `ON CONFLICT ... DO NOTHING`, y que el
`down.sql` borra las asignaciones **antes** del permiso.

**Los dos casos de sensibilidad, alterados en disco, corridos y revertidos** (no afirmados de
palabra):

```
1) quitando `ON CONFLICT ("code") DO NOTHING` de migration.sql
   x las DOS sentencias que insertan llevan ON CONFLICT ... DO NOTHING, y cae si falta una
   Test Files  1 failed | Tests  1 failed | 10 passed (11)
   revertido -> Test Files  1 passed | Tests  11 passed (11)

2) invirtiendo el orden de down.sql (permiso antes que asignaciones)
   x el orden es el inverso del UP, y cae si se invierte
   Test Files  1 failed | Tests  1 failed | 10 passed (11)
   revertido -> Test Files  1 passed | Tests  11 passed (11)
```

Mas las mutaciones **en memoria** del patron de `account-status-migration.test.ts` (QC-65):
renombrar el codigo, cambiar la descripcion, quitar el `INSERT`, `DO UPDATE` en vez de `DO NOTHING`,
renombrar el rol, meter un uuid, asignar solo uno de los dos, colar un `ALTER`/`CREATE`/`DROP`,
quitar el `WHERE` del DOWN.

### Verificacion de la tanda 1

```
pnpm run typecheck   -> la linea base exacta, ni un archivo rojo mas
                        (app/layout.tsx + los dos tests/unit/recetas/*)
pnpm exec eslint .   -> sin salida (limpio)

pnpm exec vitest related --run lib/modules/identity/domain/errors.ts tests/unit/identity/usuarios/errors.test.ts
  Test Files  1 passed (1)
       Tests  22 passed (22)

los 6 ajenos + el nuevo de T5, aislados
  Test Files  7 passed
       Tests  105

pnpm exec vitest related --run lib/modules/identity/domain/permissions.ts tests/unit/identity/schema/user-permissions-migration.test.ts
  Test Files  5 failed | 166 passed (171)
       Tests  5 failed | 2278 passed | 2 skipped (2285)
```

**Los 5 rojos de esa ultima corrida son linea base, verificada con el mismo mensaje de asercion antes
de tocar nada** (se volco `git show HEAD:...permissions.ts` sobre el archivo y se corrieron): los dos
de `tests/unit/recetas/*` por `ProductRef.stock`, y **tres que mi medicion inicial no tenia porque
solo media typecheck y lint**: `recetas/module-contract.test.ts`,
`recetas-ui/recipe-route-contract.test.ts` y `unidades/modulo-intacto.test.ts`, los tres por
`el rango git origin/dev...HEAD no estaba disponible` / `expected '' to contain 'unit-prisma.ts'`.
Son tests de «modulo intacto» que comparan contra un rango git que **en un worktree recien montado no
existe**.

**LINEA BASE AMPLIADA A 5 ARCHIVOS; ninguno es de esta feature.** Los tres nuevos son un artefacto
del worktree, no del cambio: conviene que el leader lo sepa antes de correr el gate.

Nota de flake, no de rojo: en la primera corrida conjunta `identity-seed.int.test.ts` dio 3 falsos
rojos por contencion de la base con otra suite de integracion en paralelo. Solo, pasa 13/13.

**Tasks cerradas en la tanda 1: T1, T2, T3, T4, T5.**

---

## Tanda 2 — actor, contrato de lista, esquemas y el OCTAVO archivo del ripple (T6-T8)

Dos `backend_dev` en paralelo, sin un solo archivo en comun: uno con T6 + el octavo ripple, otro
con T7 -> T8.

### El octavo archivo ajeno del ripple, que el `design.md` no habia medido · R48

`design.md > 2` midio **seis** archivos ajenos y `> 8.1` declaro un **septimo**
(`guard-contrato-listados`, que es de T7). Al commitear la tanda 1 aparecio un **octavo**, rojo por
la migracion de T4:

```
FAIL tests/unit/recetas-ui/recipe-route-contract.test.ts
     > la feature no toca lib/modules/recetas ni db/
AssertionError: ningun archivo de db/ fuera de la migracion de cancelacion de QC-34
deberia estar en el diff: expected [ ...(2) ] to deeply equal []
```

Ese caso compara `git diff --name-only origin/dev...HEAD` y exige que **toda** migracion legitima
posterior se **NOMBRE una a una**, o deja de vigilar nada. El archivo ya tiene **cinco** bloques asi
(`MIGRACION_QC34`, `MIGRACION_QC47`, `MIGRACIONES_LEGITIMAS`, `MIGRACION_QC83` y la ampliacion de
recetas de QC-74), cada uno con su comentario `RETENSADO <fecha> (<ficha>)`. Se anade el sexto,
`MIGRACION_QC66`, con el mismo criterio declarado y el porque propio: es una migracion de **DATOS**
que solo inserta dos filas en `permissions` y sus dos asignaciones, **no crea, modifica ni borra
ninguna columna, tabla, indice, restriccion ni tipo** (R43) y **no toca los tres indices unicos de
`users`** de QC-47 (R38). Mas su filtro en la cadena de `tocaDb`. **Nada mas de ese archivo se
toco**: ni `tocaRecetas`, ni ningun otro caso, ni ningun `expect`.

Las dos rutas se verificaron contra la salida real de
`git diff --name-only origin/dev...HEAD` filtrada por `db/`: son esas dos y **solo** esas dos.

Aviso que deja el `backend_dev`, y que conviene tener presente: ese caso **volvera a ponerse rojo
por su propio diseno** si esta rama gana **otro** archivo bajo `db/`. No hay ninguno previsto —el
diseno declara `db/schema.prisma` intacto y una sola carpeta de migracion—, pero si apareciera, el
bloque **se amplia, no se relaja**.

### T6 — `Actor` y `requirePermission` del modulo · R2, R3, R5

`lib/modules/identity/domain/actor.ts` (nuevo, **unico** archivo de produccion de la task).

Copia literal del `actor.ts` de `unidades` con la unica adaptacion de `design.md > 5.1`. Los **tres**
imports salen del propio `domain/` —`./permissions`, `./require-permission`, `./errors`— y ninguno
del barrel: un modulo que se importa a si mismo por su barrel crea un **ciclo**. Esta escrito en la
cabecera del archivo, con el aviso de que si alguien lo arregla cambiando esas dos lineas al barrel
lo rompe, porque es el error facil al copiar el precedente.

Cero `next/*`, cero `react*`, cero `@prisma/client`, cero `@/lib/shared/**`, cero adaptadores (R42).

`vitest related --run lib/modules/identity/domain/actor.ts` devuelve `No test files found`, y es
**correcto**: el test de autorizacion es **T11** y nada importa todavia `actor.ts` (el barrel es T15
y los casos de uso T10). No es un hueco de trazabilidad: `tasks.md > Trazabilidad` asigna R1-R5 a
T6, T10 **y T11**.

### T7 — el contrato de lista, sexta copia, y la guardia de los «cinco modulos» · R36

`lib/modules/identity/domain/{list-query,page,user-queryable}.ts` (nuevos) y
`tests/guards/guard-contrato-listados.test.ts`.

- **`list-query.ts` es byte a byte** el de `proveedores` **salvo dos lineas**, las unicas que nombran
  el modulo (L1 y el `Contrato de consulta de lista del modulo ...` de L3). Verificado con `diff`:
  devuelve exactamente esos dos hunks. Se comprobo antes que las cinco copias preexistentes son
  identicas tras `textoComparable` (mismo md5), asi que la sexta entra sin friccion.
- **`page.ts` NO es byte a byte, y con motivo medido.** No esta cubierto por ninguna guardia y las
  cinco copias existentes **ya divergen de verdad**: `unidades` no tiene `pageQuerySchema` ni importa
  `zod`; las otras cuatro si. Se partio de **`unidades`**, que es el caso exacto de `identity`: el
  listado entra por el contrato generico (`page`/`pageSize` de `ListQuery`), asi que **no hay
  `pageQuerySchema`** y el archivo no importa nada. El `type Page<T>` es identico caracter a caracter
  en los seis.
- `user-queryable.ts` con la lista blanca de `design.md > 8.1`: seis campos ordenables,
  `accountStatus` como filtro `select` (R29), `searchable: true` (R28). **`deletedAt` no esta en
  ninguna de las dos listas** y `NEVER_QUERYABLE` lo bloquea ademas por su cuenta (R34, R39).
- La guardia pasa a **seis**: `import * as identity`, la entrada en `MODULOS`, y el numeral corregido
  en **20 ocurrencias** (cabecera L1-L14, comentario de `MODULOS`, el `describe` y los titulos de
  todos los `it` de los tres bloques). `Test Files 1 passed | Tests 20 passed`.
- El docblock de `MODULOS` se **reescribio** en vez de sustituir la palabra, porque la cita literal
  («`design.md > 1`: siete listas en cinco carpetas») era **falsa** al traducirla a seis. Ahora dice
  que QC-57 nacio con cinco y que QC-66 anade la sexta, citando `design.md > 8.1`.
- **Ninguna expectativa eliminada ni debilitada** (R48): los tres bloques siguen enteros, incluidos
  los sinteticos anti-vacuidad.

**Deuda declarada, no silenciada.** La cabecera de las **seis** copias de `list-query.ts` sigue
diciendo que el archivo esta «duplicado a proposito en los cinco modulos». Corregirlo exigiria editar
las **cinco copias ajenas** —la guardia compara texto: o las seis o ninguna—, y eso esta fuera del
alcance declarado de esta ficha. La guardia si quedo en «seis», que es donde vive el ancla. Queda
anotado aqui a proposito, no silenciado.

### T8 — los esquemas de entrada y los tipos de salida · R14, R18, R20, R31, R32

`lib/modules/identity/domain/{user-input,user-view}.ts` (nuevos) y
`tests/unit/identity/usuarios/user-input.test.ts` (nuevo). Patron del precedente
`proveedores/domain/supplier-input.ts` + su test.

Los tres esquemas son `strictObject`, que es **el requisito y no un detalle**: mandar un campo que no
esta **falla** en vez de ignorarse en silencio. Lo que NO esta, con su requisito: `companyId` (R14),
**cualquier** campo de contrasena (R15, R16), `accountStatus` en el alta (R13),
`mustChangeCredential` (R13) y los tres contadores de QC-19 (R45).

`setAccountStatusSchema` **importa** `USER_ACCOUNT_STATUSES` de QC-65: el enum no se reescribe y
admite los cuatro valores (R26).

Claves **exactas** de salida, fijadas en el test:

```
UserRow    = { id, displayName, username, email, roleName, accountStatus }            // 6
UserDetail = { id, firstNames, lastNames, birthDate, email, phone, documentTypeCode,
               documentNumber, username, roleId, roleName, accountStatus,
               accountStatusChangedAt, createdAt, updatedAt }                          // 15
```

El test las fija **y su orden** con `Record<keyof UserRow, true>` / `Record<keyof UserDetail, true>`,
asi que una clave de mas o de menos es error de **compilacion** ademas de test rojo; y comprueba que
ninguna de las dos lleva `passwordHash`, `password`, `mustChangeCredential`, `failedLoginAttempts`,
`lockLevel`, `lockedUntil`, `companyId`, `deletedAt` ni `accountStatusChangedBy` (R31, R32, R45).

**Dos decisiones de forma que el `backend_dev` deja escritas, y son correctas:**

- `documentTypeCode` en la **salida** es `string` y no la union cerrada, porque el conjunto lo manda
  la tabla `document_types`; en la **entrada** si se exige la union (`DOCUMENT_TYPE_CODES`).
- `birthDate` se valida con `z.iso.date()` y el esquema **devuelve el `YYYY-MM-DD`**, que es lo que
  emite un `<input type="date">` y lo que llega por `FormData`. El puerto de `design.md > 7` pide
  `NewUser.birthDate: Date`, asi que **la conversion es de T10**, y queda escrita como comentario en
  `user-input.ts` para que el agente de T9/T10 no la descubra por sorpresa. No se metio en el borde
  para no decidir ahi la representacion de persistencia.

### Verificacion de la tanda 2

```
pnpm run typecheck   -> la linea base exacta, cero errores en los ocho archivos nuevos
pnpm exec eslint .   -> sin salida (limpio)

pnpm exec vitest run tests/unit/recetas-ui/recipe-route-contract.test.ts
  Test Files  1 passed (1)    Tests  25 passed (25)      <- el octavo ripple, VERDE
pnpm exec vitest run tests/guards/guard-contrato-listados.test.ts
  Test Files  1 passed (1)    Tests  20 passed (20)      <- el septimo, con seis modulos
pnpm exec vitest run tests/unit/identity/usuarios/user-input.test.ts
  Test Files  1 passed (1)    Tests  12 passed (12)
pnpm exec vitest related --run lib/modules/identity/domain/{list-query,page,user-queryable,user-input,user-view}.ts
  Test Files  2 passed (2)    Tests  32 passed (32)
pnpm exec vitest run guard
  Test Files 25 passed (25)   Tests  232 passed | 4 skipped (236)   <- TODAS las guardias
```

**Tasks cerradas en la tanda 2: T6, T7, T8.**

---

## Tanda 3-6 — del puerto al cierre (T9-T19)

A partir de aqui el trabajo fue **en serie, un `backend_dev` a la vez**: la tanda con tres
subagentes en paralelo toco el limite de sesion de la API (429) y se llevo por delante a dos.
Nada se perdio —lo terminado estaba en disco— pero el cambio de modo es deliberado.

### T9 — los dos puertos (+ un tercero que el diseno no tenia) · R15, R16, R17, R33, R34, R35

`lib/modules/identity/ports/{user-admin-repository,initial-credential-factory,list-query-log}.ts`.

Tres propiedades del puerto de datos son el requisito y no un estilo:

1. **`…AliveInCompany` y `excludeUserId` obligatorios.** Los filtros `deleted_at IS NULL` (R34),
   `company_id = ?` (R33) y la exclusion del actor (R35) viven en el **puerto**, no en el dominio,
   asi que ningun caso de uso —ni uno escrito manana— puede olvidarlos. Como parametro **opcional**,
   un llamante nuevo se olvidaria y el actor reapareceria en su propio listado.
2. **No hay NINGUNA busqueda por correo, usuario ni documento, y es deliberado** (R17). La unicidad
   la garantizan solo los tres indices de QC-47. Un `SELECT` previo al `INSERT` es una carrera y no
   aporta nada que el resultado `'email' | 'username' | 'document'` no de ya: **sin metodo de
   busqueda, esa comprobacion previa ni siquiera es expresable.**
3. **`create` no lleva parametro de autor del cambio de estado** (R49, decision 18), y el comentario
   dice que no existe **para que nadie lo rellene con el actor por reflejo**. R49 deja de ser una
   promesa y pasa a ser una propiedad del tipo.

`InitialCredentialFactory.createCredentialHash()` devuelve **solo el hash**: la credencial en claro
no cruza el puerto, asi que ningun caso de uso, ningun resultado y ningun error puede filtrarla
(R15, R16). El nombre acaba en `Hash` porque `guard-password-never-plaintext` lo exige — **se adapta
el nombre, no la guardia**.

**HUECO DEL DISENO, cerrado por precedente unanime.** `design.md > 7` y `> 11` **no mencionan el
puerto del log de campos omitidos**, y hace falta: `sanitizeListQuery` devuelve `{ query, ignored }`
y **los cinco modulos con listado, sin excepcion**, tienen su `ports/list-query-log.ts` y llaman
`ignoredFields` en su caso de uso. Es **QC-57 R6**, no una decision nueva de esta ficha. Se creo
como sexta copia y se cableo a la **misma** implementacion compartida.

### T10 — los seis casos de uso · R1-R5, R13, R19, R21, R22, R25, R26, R34-R37, R39, R49

`lib/modules/identity/domain/{create-user,get-user,list-users,update-user,delete-user,set-user-account-status}.ts`.

El orden de los pasos **es** el requisito: `requirePermission` primero, antes de zod y antes de
cualquier puerto (R1); zod dentro del caso de uso (R18); las guardas; el puerto, y su resultado
discriminado traducido al error de dominio. Si validara primero, un actor **sin permiso** con una
entrada rota recibiria `invalid_input` y sabria algo del sistema sin derecho a preguntarlo.

Firmas, con el **actor primero** siguiendo `design.md > 8.1` (y apartandose del `(input, actor)` de
`proveedores`, por coherencia interna del modulo):

```
createCreateUser({ users, credentials, now? })  -> (actor, input: unknown) => Promise<{ id }>
createGetUser({ users })                        -> (actor, id) => Promise<UserDetail>
createListUsers({ users, log })                 -> (actor, input: unknown) => Promise<Page<UserRow>>
createUpdateUser({ users, now? })               -> (actor, id, input: unknown) => Promise<void>
createDeleteUser({ users, now? })               -> (actor, id) => Promise<void>
createSetUserAccountStatus({ users, now? })     -> (actor, id, input: unknown) => Promise<void>
```

`usuarios.consultar` en `getUser` y `listUsers`; `usuarios.modificar` en los cuatro de escritura.
Cero literales `'Administrador'`, cero `console.*`, cero menciones a los contadores de QC-19.

**`birthDate` sin depender de la zona horaria.** El esquema devuelve la fecha civil `YYYY-MM-DD` y
el puerto pide `Date`: `toBirthDate` la ancla en **UTC explicito** (`T00:00:00.000Z`), porque
cualquier variante con hora local daria el dia anterior al oeste de Greenwich. Vive en un solo
sitio e importada por la edicion: dos copias es como el alta y la edicion acaban guardando dias
distintos.

**DESVIO DEL DISENO, medido y aceptado.** `updateAliveInCompany` gana `'last_administrator'` en su
union de resultados, que `design.md > 7` no le pone. Motivo: **R19 es reemplazo completo** y el
`roleId` es uno de los nueve campos, asi que el cambio de rol **no es separable** de la edicion;
pedirlo por `applyGuardedChange` serian dos escrituras y dos transacciones sobre la misma fila.
Consecuencia: `GuardedChange` tiene **dos** variantes y no tres, y el tercer cambio guardado viaja
por `updateAliveInCompany` **reutilizando el mismo bloqueo, escrito en un solo sitio del
adaptador** — que es lo que el «un metodo y no tres» de `> 9.3` protege de verdad. La alternativa
—dejar la firma literal— habria dejado **R22 sin implementar en la edicion, en silencio**.

Nota del reviewer, anotada por T11: `design.md > 9.3` dice que el nombre del rol «viaja al adaptador
como argumento», y eso se cumple en `applyGuardedChange` pero **no** en `updateAliveInCompany`,
cuya firma quedo con cuatro argumentos; ahi el adaptador importa `ROLE_ADMINISTRADOR`. **R24 se
sigue cumpliendo** (constante importada, cero literales), pero el test de R24 solo puede afirmar la
constante en una de las dos rutas.

### T11 — los tres tests de dominio · 44 casos

`tests/unit/identity/usuarios/{authorization,user-service,admin-guards}.test.ts`.

Lo que hace que el archivo de autorizacion valga: los dobles de los **tres** puertos **lanzan si los
llaman** **y ademas** se afirma `not.toHaveBeenCalled()` sobre **cada** metodo en **los seis** casos
de uso. Un doble permisivo dejaria pasar una autorizacion puesta **despues** de la consulta, que es
exactamente el defecto que ese archivo existe para cazar. Y un caso que es la diferencia entre
autorizar de verdad y un `if` decorativo: actor sin permiso **mas** entrada basura da
`unauthorized`, no `invalid_input`; y con permiso, esa misma basura **si** da `invalid_input`.

R49 se afirma de **tres** formas a la vez: longitud exacta de cinco argumentos, busqueda recursiva
de `actor.id` en cada uno, y la firma del puerto sin campo de autor. Mas el simetrico: mover el
estado **si** escribe `changedBy: actor.id`.

### T12 — la fabrica de credencial inicial · R15, R16, R47

`lib/modules/identity/adapters/driven/security/initial-credential-factory-crypto.ts` y su test.

`createRandomCredentialHash({ hasher, checkCredentialPolicy })`, `INITIAL_CREDENTIAL_LENGTH = 24`,
`MAX_CREDENTIAL_ATTEMPTS = 8`. `randomInt` de `node:crypto` —runtime, **no dependencia**— que da
enteros **sin sesgo de modulo**, cuatro alfabetos con al menos uno de cada, y **mezcla
Fisher-Yates**: sin la mezcla la posicion del simbolo seria predecible. `CREDENTIAL_MIN_LENGTH` y
`CREDENTIAL_MAX_LENGTH` se **importan**, y hay un invariante que lanza si 24 se saliera del rango.

**El problema difícil de esta task era probar 1.000 candidatas contra la politica sin que la
credencial salga del adaptador**, y se resolvio bien: un doble del `PasswordHasher` que **captura**
lo que recibe. El adaptador ya le entrega la candidata al hasher en produccion —no puede hashear sin
ella—, asi que el test observa un punto que **ya existia** y **no se expuso nada «solo para el
test»** (`buildCandidate` y `pickCharacter` no se exportan). Sobre las 1.000 capturadas se aplica la
funcion **real** del dominio, `evaluateCredentialRules`, con ancla anti-vacuidad `toHaveLength(1000)`.

**Sensibilidad verificada de verdad**: se comento `shuffleInPlace` y **solo** el caso de la mezcla se
puso rojo. El error de agotamiento va **sin `cause`** a proposito, porque lo unico que habria que
adjuntar ahi es la credencial; nombra las **reglas** incumplidas y se afirma que ninguna de las 8
candidatas rechazadas aparece ni en el `message` ni en `{message, stack, cause}` serializado.

### T13 — el adaptador Prisma, con la transaccion de la guarda · R17, R22, R23, R27-R31, R33, R34, R37

`lib/modules/identity/adapters/driven/persistence/{user-admin-prisma,list-query-sql}.ts`. El segundo
**si hizo falta**, como en `proveedores` y `unidades`, y es una replica minima: solo `selectCondition`
e `insensitiveContainsCondition`. No se replicaron los de rango porque `USER_QUERYABLE` no declara
ninguna columna de rango y serian codigo muerto.

#### EL HALLAZGO DE LA FEATURE: `design.md > 6.4` esta MAL, y el codigo implementa lo que dice la base

Medido contra `QuimiCloude_QC66` con `@prisma/client@6.19.3`:

| Indice | `error.meta.target` real |
| --- | --- |
| `users_email_unique` | `["company_id","lower(email)"]` |
| `users_username_unique` | `["company_id","lower(username)"]` |
| `users_document_unique` | `["company_id","document_type_code","document_number"]` |

Los dos indices **funcionales** anuncian la **EXPRESION**, no el nombre pelado de la columna. El
diseno dice «trae las columnas afectadas»: acierta para el documento y **falla para los otros dos**.
Una comparacion por igualdad contra `'email'` **no habria hecho match jamas**, y el alta habria
devuelto un error sin traducir en vez de `duplicate_email`. **Es el mismo defecto que QC-38 encontro
solo con integracion, una vuelta de tuerca mas adelante.** La traduccion compara por **subcadena**
con marcas disjuntas (`'email'`, `'username'`, `'document_number'`), verificada por la via del
`INSERT` **y** del `UPDATE`; un `target` que no encaje con ninguna **se relanza**, nunca se disfraza.

**Segundo hallazgo, que limita lo que esta ficha puede prometer:** `P2003` llega con
`meta = { modelName: 'User', constraint: null }` — **el nombre de la restriccion no viene**, asi que
«rol inexistente» y «tipo de documento inexistente» son **indistinguibles** en este motor. Las dos se
funden en `'role_not_found'`, que cumple R18 (rechazar sin escribir ninguna fila), pero si QC-67
quisiera mensajes distintos **hay que reabrir el puerto**. Anotado en el codigo.

#### La transaccion de la guarda (R22, R23)

El `SELECT … FOR UPDATE` vive en **un solo sitio**, `lockActiveAdministratorIds`, y lo reutilizan
`applyGuardedChange` **y** `updateAliveInCompany`:

```sql
SELECT "id" FROM "users"
WHERE "company_id" = $1::uuid
  AND "role_id" = (SELECT "id" FROM "roles" WHERE "name" = $2)
  AND "account_status" = $3::"UserAccountStatus"
  AND "deleted_at" IS NULL
FOR UPDATE
```

En `$queryRaw` dentro del `$transaction` interactivo (Prisma no expresa `FOR UPDATE`), aislamiento
**READ COMMITTED**, sin `SERIALIZABLE` y sin bucle de reintentos por `40001`.

Dos casos que el diseno no explicita y el adaptador decide bien: si el objetivo **no esta** en el
conjunto, la escritura solo puede ampliarlo, asi que se sigue (y el `count === 0` da el
`not_found`); y si el conjunto **ya estaba vacio**, **no se aborta** — R22 protege «que el ultimo no
deje de serlo», no «que aparezca uno», y abortar dejaria congelada toda operacion en una empresa sin
administrador activo.

#### El listado
Orden por defecto `last_names, first_names, id`; con `sort` del cliente, la columna pedida **mas
`id ASC` como ultimo desempate**, y el `default` del `switch` cae al orden por defecto (no se confia
en que el llamante saneara). Busqueda `ILIKE` sobre **cuatro** columnas. Filtro de estado multivalor
y **acotado al conjunto cerrado de QC-65** — esto **no es prudencia**: `sanitizeListQuery` valida la
forma pero **no los valores**, y un `in: ['bogus']` contra la columna enum lanza
`PrismaClientValidationError`, medido. Lo que no es un estado se descarta; si no queda ninguno el
filtro se **omite** y salen los cuatro. Tres lecturas, las tres con `select` **enumerado**.

### T14 — las seis Server Actions · R6, R16, R40, R41

`lib/modules/identity/adapters/driving/user-actions.ts` y su test (79 casos).

`FormData` en las cuatro mutaciones, argumentos tipados en las dos consultas. Lo mejor de su diseno
es lo que **no** hace: los campos viajan **tal cual** los entrega `FormData` —ni un `trim`, ni una
conversion, ni un valor por defecto—, porque cada uno seria **una regla de negocio escrita por
segunda vez en el borde**; quien rechaza un `null` o una cadena en blanco es `createUserSchema`.

El actor sale de las **dos caras** de la sesion resueltas en paralelo, y **falla cerrado**: si falta
cualquiera de las dos el actor es `null` y `requirePermission` rechaza en la primera linea del caso
de uso. No se adivina, no se rellena y no se lanza un error distinto desde el borde.

Los errores se traducen por el **`code` estable** de la clase, nunca por el texto, y lo que no es un
`IdentityError` se **relanza**. Sin `revalidatePath`, con el motivo escrito: esta ficha no crea
ninguna ruta (R46), asi que no hay nada que revalidar y escribir la de QC-67 seria inventarla. Las
seis actions **no** se reexportan del barrel: un `'use server'` en su cierre transitivo romperia a
cualquier componente de cliente que lo importe.

No exporto ninguna constante de estado inicial porque un `'use server'` **solo puede exportar
funciones async**; QC-67 construira su `{ status: 'idle' }`.

### T15 — el contrato del modulo y el punto unico de composicion · R42

`lib/modules/identity/index.ts`, `lib/composition/index.ts`,
`tests/unit/composition/identity-facade.test.ts`. **192 inserciones y CERO deleciones** en los tres
—verificado con `git diff --numstat`—, que era la condicion de tocar los dos ultimos con **QC-78
`in_progress`**: nada preexistente se reordeno ni se reformateo.

El barrel reexporta **solo de `./domain/`**: ni `ports/`, ni `adapters/`, ni driving. Sigue
importable desde un componente de cliente y `guard-arquitectura-modulos` lo verifica
transitivamente.

`passwordHasher` y `checkCredentialPolicy` se **reutilizan**: dos cableados del hasher serian dos
costes de bcrypt que pueden divergir. El `ListQueryLog` se ata a la **misma** implementacion
compartida que los otros cinco modulos.

**Un detalle que habria sido un fallo en ejecucion y no en compilacion:** las constantes del
cableado van **antes** de `export const identity`, no en un bloque al final como hacen `recetas` y
`pedidos`. Ese `export` se evalua en su linea, asi que declararlas despues las dejaria en **zona
muerta** y daria `ReferenceError` al importar la composicion. Entraron completas entre dos bloques
existentes, sin mover nada.

### T16 — el CRUD contra Postgres real · 36 casos

`tests/integration/identity/user-crud.int.test.ts`. Ejercita los **cinco** metodos del adaptador
directamente, no la fachada.

Tres decisiones que hacen que el archivo pruebe algo:

- **R49 se lee de la FILA CRUDA** con `$queryRaw` sobre `account_status_changed_by`. Mirar la ficha
  habria sido **verde por vacuidad**, porque esa columna **no existe** en `UserDetail`. Y lleva su
  **contraste**: al **mover** el estado si se escribe el autor, asi que el nulo del alta no significa
  que esa columna no se escriba nunca.
- **R17 trae el caso que lo hace valioso**: los mismos correo, usuario y documento **en otra empresa
  SI se crean**. Eso es lo que demuestra que los tres indices de QC-47 son **por empresa** y no
  globales — sin el, el test pasaria igual con indices globales. Mas los casos insensibles a
  mayusculas, porque los indices comparan `lower(...)`.
- **R30 recorre TODAS las paginas** con `pageSize` pequeno y dos homonimos, y afirma que la union es
  **exactamente** el conjunto y **sin repetidos**. Comprobar solo la primera pagina no habria
  probado el desempate.

Mas R38 con su contraste —los tres identificadores estan OCUPADOS mientras vive y LIBRES en cuanto
se borra— y el caso sutil que pidio T13: un **duplicado capturado dentro del `$transaction` de
`updateAliveInCompany`** no escapa como error y deja la fila intacta.

**El aislamiento se eligio con un motivo tecnico, no por inercia**: **no** `$transaction` +
rollback, porque las cinco funciones hablan con el cliente Prisma **global**, asi que una llamada
dentro de una transaccion del test correria en **otra conexion del pool** —aislamiento ilusorio— y
los dos metodos que abren su propia transaccion con `SELECT … FOR UPDATE` se quedarian **esperando
el bloqueo del propio test**. Construccion y limpieza propias, con `afterAll` que afirma que no
quedo ninguna empresa creada.

### T17 — la carrera del ultimo administrador · R22, R23, R24 · 16 casos

`tests/integration/identity/last-administrator.int.test.ts`. **El riesgo real de la feature.**

**Demuestra las dos conexiones en vez de afirmarlas**: dos `PrismaClient`, dos instancias distintas
del adaptador de produccion, y dos transacciones que **se solapan con una barrera** y comparan su
`pg_backend_pid()`. Si compartieran una sola conexion la segunda no podria ni empezar y el caso
**moriria en el plazo** en lugar de comparar dos numeros — que es exactamente la trampa de un
`Promise.all` sobre el mismo pool, y por la que un test de concurrencia sale verde sin haber probado
nada.

R23 en **tres corridas seguidas**, porque una carrera que pasa una vez de tres no esta cerrada: dos
conexiones apagan dos administradores activos distintos a la vez, al menos una responde
`last_administrator`, y la empresa conserva >= 1 administrador en `active` **leido de la base**.

El caso **simetrico**, sin el cual un adaptador que rechazase **siempre** pasaria el anterior: con
**tres** administradores activos, los dos apagados simultaneos terminan **los dos** en `ok`.

Mas R22 operacion por operacion sobre el unico administrador activo —los tres estados de destino, el
cambio de rol y el borrado—, los tres simetricos con dos administradores, y los dos casos que **no**
deben rechazarse porque no sacan a nadie del conjunto: de `active` a `active`, y el rol **al mismo**
rol administrador.

**Ningun deadlock y ningun timeout** en las tres corridas. `adminRoleName` sale de
`ROLE_ADMINISTRADOR` importado (R24) y `guard-rol-administrador-unico` sigue verde.

### T18 — el alcance, con sensibilidad demostrada, y el NOVENO ripple · R16, R24, R38, R43, R45-R48

`tests/unit/identity/usuarios/scope.test.ts` (nuevo, 8 casos) y
`tests/unit/identity/account-status-scope.test.ts` (+64/-7).

**Las 8 aserciones tienen sensibilidad DEMOSTRADA, no afirmada**: 10 sondas que alteran produccion a
mano, se ponen rojas **con su mensaje propio**, y se revierten en el mismo paso. **Ninguna quedo sin
poder ponerse roja.** Una incluye crear una **segunda** carpeta de migracion, y otra comprueba la
mitad de `lib/composition/index.ts` **solo sobre las lineas que esta rama anade**, porque el archivo
es compartido y mirarlo entero acusaria en falso.

El ancla de no-vacuidad afirma que **esta rama cambia algo**, nunca que un archivo de **otra** ficha
este en el diff. Es la diferencia exacta con los dos de `unidades` que estan rojos en toda rama que
no sea la suya. **Riesgo residual conocido, el mismo de los cinco retensados de
`recipe-route-contract.test.ts`**: una vez mergeada a `dev` con arbol limpio, el diff es vacio y
estos casos se ponen rojos. Es el patron que el repo ya usa; queda dicho.

**El noveno archivo ajeno del ripple.** `account-status-scope.test.ts` es la guarda de **QC-65** cuyo
caso se llamaba «R19 — nadie lee todavia el estado de cuenta», con `toEqual` contra cinco sitios
permitidos. **QC-66 es precisamente la ficha que empieza a leerlo y escribirlo**, asi que esa
premisa **caduca aqui por diseno**. Se **retensa, no se afloja**: los **diez** sitios nuevos
nombrados uno a uno en un bloque rotulado `RETENSADO 2026-09-10 (QC-66)` y agrupados por motivo —el
contrato de los seis casos de uso; los dos que escriben y filtran la columna; el driving que traduce
la mutacion; y `lib/composition/index.ts`, **sin alternativa**, porque la clave se llama
`setUserAccountStatus` y el nombre lo fija `design.md > 11`—. El `toEqual` sigue siendo **igualdad
exacta**; las 7 lineas borradas son el parrafo caduco y dos titulos que ya mentian: **ni un
`expect` perdido** (R48).

El `backend_dev` se vio obligado a retensar **un tercer caso** del mismo archivo —«el modulo
identity no gana ningun archivo driving que nombre el estado»—, porque **deriva** de
`SITIOS_PERMITIDOS` y anadir el driving lo ponia rojo por construccion. Se retenso con el mismo
criterio: excepcion nombrada una a una, igualdad exacta intacta. Los otros **cinco** casos y los
**tres** saltados quedan como estaban. **Bloque aditivo y separado a proposito**, para que lo de
QC-78 entre al lado y no como conflicto en la misma linea.

### T19 — el ciclo real de migracion · R44

`prisma migrate deploy` -> `tsx scripts/db-rollback.ts` -> `prisma migrate deploy`, contra
`QuimiCloude_QC66`. Salida real:

```
1. ESTADO INICIAL
   permissions=13 usuarios.*=2 role_permissions=14 asign_admin_usuarios=2
   migr_qc66=1 migr_total=23 migr_fallidas=0

2. ROLLBACK
   db:rollback: aplicando down.sql de 20260910120000_user_permissions_catalog y borrando su
                fila de _prisma_migrations
   db:rollback: 20260910120000_user_permissions_catalog revertida.

3. ESTADO TRAS ROLLBACK
   permissions=11 usuarios.*=0 role_permissions=12 asign_admin_usuarios=0
   migr_qc66=0 migr_total=22 migr_fallidas=0

4. MIGRATE DE NUEVO
   The following migration(s) have been applied:
     20260910120000_user_permissions_catalog/migration.sql
   All migrations have been successfully applied.

5. ESTADO FINAL
   permissions=13 usuarios.*=2 role_permissions=14 asign_admin_usuarios=2
   migr_qc66=1 migr_total=23 migr_fallidas=0

prisma migrate status -> 23 migrations found / Database schema is up to date!
```

**El catalogo vuelve a ONCE entradas y las dos asignaciones del `Administrador` desaparecen**, sin
tocar ninguna otra fila: R44 verificado en su forma real, no con un test que lee texto.
`_prisma_migrations` queda coherente (22 -> 23, cero fallidas).

**Y este ciclo da el dato que el alta en base virgen NO podia dar.** Al re-aplicar, el rol
`Administrador` **ya existe**, asi que el `INSERT … SELECT` de `role_permissions` **si inserta sus
dos filas** (12 -> 14). El camino de base virgen inserta cero ahi y las siembra el seed; este es el
camino de **una instalacion ya en marcha**, que es exactamente el que justifica que esta migracion
exista (`design.md > 3.1`). **Los dos caminos quedan ejercitados.**

Despues del ciclo, los siete archivos de integracion de `identity`: `161 passed`.

---

## Mapa de trazabilidad `R<n> -> test`

`CHECKPOINTS.md > Trazabilidad`: **cada uno de los 49 requisitos** con el test concreto que lo
cubre. Los requisitos de alcance **R38-R48 tambien van con su guardia**, porque son requisitos de
pleno derecho y no comentarios (`requirements.md`, cabecera de la seccion de alcance).

Rutas abreviadas: `U/` = `tests/unit/`, `U/iu/` = `tests/unit/identity/usuarios/`,
`I/` = `tests/integration/identity/`, `G/` = `tests/guards/`.

### Autorizacion y actor (R1-R7)

| R | Test |
| --- | --- |
| R1 | `U/iu/authorization.test.ts > R1 — cada caso de uso avanza con EXACTAMENTE el codigo de su fila y con ningun otro` **y** `> R1 — el permiso se comprueba ANTES de zod: con entrada invalida el rechazo sigue siendo unauthorized` |
| R2 | `U/iu/authorization.test.ts > R2 — falla cerrado: actor ausente, sin conjunto, con el conjunto vacio y con un conjunto que no es una lista` (6 actores x 6 casos de uso) **y** `> R2 — la pertenencia es EXACTA: ni el prefijo, ni otra caja, ni un codigo parecido conceden nada` |
| R3 | `U/iu/authorization.test.ts > R3 — solo usuarios.modificar no abre la ficha ni el listado, igual que no traer ninguno` **y** `> R3 — solo usuarios.consultar no abre ninguna de las cuatro escrituras` |
| R4 | `U/iu/authorization.test.ts > R4 — el rol del actor no participa: un Actor sin ningun campo de rol autoriza igual` **y** `> R4 — ningun archivo nuevo de la feature incrusta el literal del rol administrador`; ademas `U/iu/scope.test.ts > R24 — ningun archivo nuevo de la feature escribe a mano el nombre del rol administrador` |
| R5 | `U/iu/authorization.test.ts > R5 — el actor entra por parametro y el dominio no lee sesion, cookie ni cabecera` |
| R6 | `U/iu/user-actions.test.ts` — los seis caminos con la fachada doblada, y los **dos** casos de sesion incompleta (sin `getSessionUser` y sin `getSessionContext`, por separado) que dan `unauthorized` sin tocar el caso de uso |
| R7 | `G/guard-rls-force.test.ts` (guardia existente, verificada intacta en T18). **Un test de RLS escrito con Prisma saldria verde pase lo que pase** —se conecta como dueno de las tablas—, asi que R7 lo cierra la guardia estatica y **no** se escribe un test que mentiria (`design.md > 14`) |

### El catalogo de permisos (R8-R12)

| R | Test |
| --- | --- |
| R8 | `U/identity/permissions.test.ts > R2: contiene exactamente los trece codigos del requisito, ni uno mas ni uno menos` **y** `U/identity/schema/user-permissions-migration.test.ts` (los dos codigos y sus descripciones comparados contra `PERMISSIONS` **importado**) |
| R9 | `U/identity/permissions.test.ts > QC-66 R9: el Administrador tiene usuarios.consultar Y usuarios.modificar, escritos uno a uno` **y** `> QC-66 R9: el Operador no recibe ninguno de los dos permisos de usuarios`; ademas `G/guard-permisos-sembrados.test.ts` |
| R10 | `U/identity/seed/seed-initial-access.test.ts` (la segunda corrida no cambia ningun conteo) **y** `I/identity-seed.int.test.ts` (idempotencia contra Postgres real) |
| R11 | `U/identity/schema/user-permissions-migration.test.ts > las DOS sentencias que insertan llevan ON CONFLICT ... DO NOTHING, y cae si falta una` (con **sensibilidad verificada en disco**) **y** T19, que reaplica la migracion sin fallar |
| R12 | `U/identity/permissions.test.ts > R1` con `'usuarios'` sumado a `MODULOS` y a `MODULOS_CON_ESCRITURA`, **y** `U/navegacion/qc75-convenciones.test.ts > los modulos son exactamente los cinco de negocio mas dashboard y usuarios`. La enmienda a **QC-74 R1** esta escrita con esas palabras en `lib/modules/identity/domain/permissions.ts` |

### Alta (R13-R18)

| R | Test |
| --- | --- |
| R13 | `U/iu/user-service.test.ts > R13 — persiste con el rol indicado, el estado pending y el instante, y devuelve el identificador` **y** `> R13 — la marca de cambio de credencial es INVARIANTE del puerto, no un argumento que el dominio elija`; contra base real en `I/user-crud.int.test.ts > R13 — la fila nace con la empresa del argumento, el rol pedido, pending, must_change_credential en verdadero y el instante del cambio de estado` |
| R14 | `U/iu/user-service.test.ts > R14 — la empresa sale del actor: el esquema RECHAZA un companyId en la entrada` **y** `> R14 — la empresa que llega al puerto es la del actor y de ningun otro sitio`; ademas `U/iu/user-input.test.ts` |
| R15 | `U/iu/credential-factory.test.ts` (1.000 candidatas cumplen `evaluateCredentialRules`, el largo es 24 y esta entre los dos limites **importados**) **y** `U/iu/user-service.test.ts > R15, R16 — el hash es el que devolvio la fabrica, y el resultado no trae NADA mas que el identificador` |
| R16 | `U/iu/credential-factory.test.ts` (el devuelto es un hash bcrypt y **no** la candidata; el error de agotamiento **no** la contiene ni en `message` ni en `{message, stack, cause}`; cero `console.*` en el adaptador) **+** `U/iu/user-service.test.ts > R15, R16 ...` (claves exactas del resultado) **+** `U/iu/user-actions.test.ts` (el estado serializado no lleva credencial ni hash) **+** `U/iu/scope.test.ts > R16 — ni el adaptador de credencial, ni los seis casos de uso, ni las Server Actions escriben en consola` **+** `G/guard-password-never-plaintext.test.ts` |
| R17 | `U/iu/user-service.test.ts > R17 — los tres duplicados del puerto se traducen a su error y no se crea ninguna fila` **y** `> R17 — el puerto no expone NINGUNA busqueda previa por correo, usuario o documento`; contra base real, los **siete** casos de `I/user-crud.int.test.ts > R17 — correo, nombre de usuario y pareja tipo+numero de documento son unicos DENTRO de la empresa`, incluido `EL CASO QUE LO HACE VALIOSO — los MISMOS correo, nombre de usuario y documento en OTRA empresa SI se crean`, mas los **cuatro** de `> R17 en la EDICION — el duplicado capturado dentro del $transaction de updateAliveInCompany no escapa como error y deja la fila intacta` |
| R18 | `U/iu/user-input.test.ts` (los tres esquemas `strictObject`) **y** `U/iu/user-service.test.ts > R18 — una entrada invalida se rechaza con invalid_input sin tocar el puerto` **y** `> R18 — un rol inexistente se rechaza con role_not_found sin escribir ninguna fila` |

### Edicion (R19-R20)

| R | Test |
| --- | --- |
| R19 | `U/iu/user-service.test.ts > R19 — la edicion manda los NUEVE campos al puerto: reemplazo completo` **y** `> R19 — una entrada PARCIAL no vale: no existe edicion campo a campo` |
| R20 | `U/iu/user-service.test.ts > R20 — el esquema de edicion no admite empresa, estado, hash, marca de credencial ni contadores` (9 campos prohibidos) **y** `U/iu/user-input.test.ts` |

### Las dos guardas del administrador (R21-R24)

| R | Test |
| --- | --- |
| R21 | `U/iu/admin-guards.test.ts > R21 — rechaza mover su propio estado de cuenta con self_operation y no modifica ninguna fila`, `> R21 — rechaza editarse a si mismo, lo que incluye escribirse el propio rol con self_operation y no modifica ninguna fila`, `> R21 — rechaza borrarse a si mismo con self_operation y no modifica ninguna fila`, **y el contraste** `> R21 — la misma operacion sobre OTRO identificador si llega al puerto` |
| R22 | `U/iu/admin-guards.test.ts > R22 —` los **tres** casos (mover el estado, cambiar el rol, borrar) traducen `'last_administrator'`; contra base real, `I/last-administrator.int.test.ts > R22 — el UNICO administrador activo de la empresa no puede dejar de serlo` (los tres estados de destino, el cambio de rol y el borrado) **mas los simetricos** `> R22 (simetrico) — con DOS administradores activos las tres operaciones pasan` y los dos casos que **no** deben rechazarse |
| **R23** | **`I/last-administrator.int.test.ts > R23 — corrida 1/2/3: dos conexiones apagando dos administradores distintos a la vez, al menos una falla con last_administrator y la empresa conserva >= 1 administrador en active`**, con `> R23 — las dos conexiones son reales y distintas: dos pg_backend_pid() solapados y dos instancias del adaptador` que **lo demuestra**, y `> R23 (simetrico) — con TRES administradores activos, dos apagados simultaneos terminan LOS DOS en ok` que impide el verde por rechazar siempre. **Un test con dobles no tiene la carrera y no se acepto como prueba** (`design.md > 9.3`) |
| R24 | `U/iu/admin-guards.test.ts > R24 — el nombre que viaja al puerto es EXACTAMENTE la constante importada de domain/roles` **y** `> R24 — ningun archivo nuevo de la feature escribe el literal del rol a mano`; ademas `I/last-administrator.int.test.ts > R24 — ...`, `U/iu/scope.test.ts > R24 — ...` y `G/guard-rol-administrador-unico.test.ts` |

### Estado de cuenta (R25-R26)

| R | Test |
| --- | --- |
| R25 | `U/iu/user-service.test.ts > R25, R26 — mover el estado escribe el nuevo valor, el instante y el actor como autor, para los CUATRO valores`; contra base real, `I/user-crud.int.test.ts > R49 (contraste) — al MOVER el estado si se escribe el autor, asi que el NULO del alta no es que la columna no se escriba nunca` |
| R26 | `U/iu/user-service.test.ts > R25, R26 — ... para los CUATRO valores` **y** `> R26 — un estado fuera del conjunto cerrado se rechaza con invalid_input sin tocar el puerto`; ademas `I/last-administrator.int.test.ts` recorre `pending`, `inactive` y `blocked` como destinos |

### Consulta (R27-R36)

| R | Test |
| --- | --- |
| R27 | `I/user-crud.int.test.ts > R27 — el tamano de pagina efectivo: defecto 10, tope 25, y el total describe el conjunto ya filtrado` (tres casos, incluido `pedir 100 devuelve pageSize 25 y NO un error: el tope se ACOTA`); en dominio, `U/iu/user-service.test.ts > R27 — devuelve la pagina del puerto tal cual: el defecto de 10 y el tope de 25 son del adaptador` y `> R27 — los pasos suenan en orden: primero el log de lo omitido, despues el puerto con la consulta saneada`; mas `U/pagination.test.ts` (existente) |
| R28 | `I/user-crud.int.test.ts > R28 — encuentra por nombres, por apellidos, por correo y por nombre de usuario; y sin texto devuelve todo el ambito` **y** `> R28 — es INSENSIBLE a mayusculas en las cuatro columnas`; en dominio, `U/iu/user-service.test.ts > R28, R29 — la busqueda y el filtro por estado declarados llegan al puerto sin tocarse` |
| R29 | `I/user-crud.int.test.ts > R29 — cuando se indica, devuelve solo los estados pedidos; cuando NO se indica, salen los cuatro` |
| R30 | `I/user-crud.int.test.ts > R30 — con DOS homonimos en la misma empresa, la union de todas las paginas es EXACTAMENTE el conjunto esperado y sin repetidos` **y** `> R30 — el recorrido es igual de completo cuando el orden lo pide el cliente: id ASC se conserva como ultimo desempate` |
| R31 | `I/user-crud.int.test.ts > R31 — la fila del listado tiene EXACTAMENTE las seis claves de UserRow` (con `Object.keys(...).sort()` exacto **y** la lista nombrada de claves prohibidas) |
| R32 | `I/user-crud.int.test.ts > R31 — la ficha por identificador tiene EXACTAMENTE las quince claves de UserDetail`; ademas `U/iu/user-input.test.ts` fija las claves de los dos tipos con `Record<keyof T, true>`, asi que una clave de mas o de menos es **error de compilacion** |
| R33 | `I/user-crud.int.test.ts > R33 — todo esta acotado a la empresa: un identificador ajeno responde «no encontrado» y no se modifica ninguna fila` (cinco casos, cada uno comparando la fila cruda antes y despues); en dominio, `U/iu/user-service.test.ts > R33 — la empresa del actor viaja a las CINCO operaciones del puerto que la reciben` |
| R34 | `I/user-crud.int.test.ts > R34 — un usuario borrado no sale en el listado y su ficha es null` **y** `> R34 — editarlo, borrarlo otra vez y moverle el estado responden not_found SIN modificar ninguna fila`; en dominio, `U/iu/user-service.test.ts > R33, R34 — el usuario de otra empresa o ya borrado responde not_found en las cuatro operaciones por identificador` |
| R35 | `I/user-crud.int.test.ts > R35 — excludeUserId saca al actor de su propia consulta, en la primera pagina y en todas` **y** `> R35 — tambien queda fuera del total, no solo de la pagina`; en dominio, `U/iu/user-service.test.ts > R35 — el listado excluye al propio actor y la ficha de su propio identificador no llega al puerto` |
| R36 | `G/guard-contrato-listados.test.ts`, ahora con **seis** modulos y sus dos bloques de equivalencia —de comportamiento y de texto—: es lo que garantiza que declarar un campo consultable mas **no cambia la forma de la consulta** y que QC-67 no tenga que reabrirla |

### Borrado logico (R37-R39)

| R | Test |
| --- | --- |
| R37 | `I/user-crud.int.test.ts > R37 — borrar conserva la fila COMPLETA y solo marca deleted_at (leido de la fila cruda)`; en dominio, `U/iu/user-service.test.ts > R37 — borrar pide un cambio guardado de tipo delete, y el puerto no tiene ningun borrado fisico` |
| R38 | `I/user-crud.int.test.ts > R38 — los tres estan OCUPADOS mientras vive y LIBRES en cuanto se borra: es lo que justifica que los indices de QC-47 sean parciales` **y** `U/iu/scope.test.ts > R38 — ninguna migracion de esta feature nombra los tres indices unicos de QC-47 ni toca ningun indice` (con sensibilidad: un `DROP INDEX "users_email_unique"` la pone roja) |
| R39 | `U/iu/user-service.test.ts > R39 — no hay recuperacion ni listado de borrados, ni por el puerto ni por la puerta del filtro` (claves del puerto **y** `USER_QUERYABLE` sin `deletedAt` en `sortable` ni en `filterable`) |

### Frontera, modulo y errores (R40-R42)

| R | Test |
| --- | --- |
| R40 | `U/iu/user-actions.test.ts` — `FormData` **de verdad** en las cuatro mutaciones y argumentos tipados en las dos consultas; ademas `U/iu/scope.test.ts > R46 — ...` confirma que no hay ningun route handler bajo `app/` |
| R41 | `U/iu/errors.test.ts` (los nueve `code` afirmados **por clase**, nunca por el texto, y todas derivando de `IdentityError`) **y** `U/iu/user-actions.test.ts` (la traduccion a `{ status: 'error', code, message }` por el `code`, y que lo que no es de dominio se relanza) |
| R42 | `G/guard-arquitectura-modulos.test.ts` (verifica transitivamente que el barrel no arrastra `'use server'`, `next/*` ni `@prisma/client`) **y** `U/composition/identity-facade.test.ts` (las seis claves cableadas en el **unico** punto de composicion) |

### Alcance — R38-R48 son requisitos de pleno derecho, y cada uno lleva su guardia

| R | Test |
| --- | --- |
| R43 | `U/iu/scope.test.ts > R43 — el diff de la rama no toca db/schema.prisma` **y** `> R43 — la unica migracion de la rama es la del catalogo, y no lleva ni un ALTER, CREATE ni DROP`. **Sensibilidad demostrada**: un comentario en `db/schema.prisma`, un `ALTER TABLE` en el UP, y una **segunda** carpeta de migracion ponen cada caso rojo. Ademas `U/identity/schema/user-permissions-migration.test.ts` afirma la ausencia de sentencias de esquema por lectura del SQL |
| R44 | `U/identity/schema/user-permissions-migration.test.ts > el orden es el inverso del UP, y cae si se invierte` (**sensibilidad verificada en disco**) **y, sobre todo, T19**: el ciclo real `migrate -> rollback -> migrate`, con el catalogo volviendo a **once** entradas y **doce** asignaciones, y `_prisma_migrations` coherente. La salida esta pegada arriba |
| R45 | `U/iu/scope.test.ts > R45 — ningun archivo de produccion de la feature lee ni escribe los tres contadores de bloqueo de QC-19`. **Sensibilidad demostrada** con `lockLevel` en el adaptador Prisma **y** con `lockedUntil` en una **linea nueva** de `lib/composition/index.ts` (el archivo es compartido, asi que solo se miran las lineas que esta rama anade) |
| R46 | `U/iu/scope.test.ts > R46 — la rama no anade nada bajo app/, components/ ni e2e/, ni ningun adaptador de navegacion`. **Sensibilidad demostrada** creando `app/__sensibilidad-t18.ts`. El E2E se difiere a **QC-67 con motivo** y **declarado en el diseno, no al final** (`design.md > 14`, decision 17) |
| R47 | `U/iu/scope.test.ts > R47 — la rama no toca package.json ni pnpm-lock.yaml` (**sensibilidad demostrada** con un solo `\n` en `package.json`) **y** `G/guard-dependencias-aprobadas.test.ts` |
| R48 | Los **nueve** archivos ajenos actualizados **en la misma tanda que su cambio**, todos verdes y **sin que ninguna expectativa se elimine ni se debilite**: `G/guard-permisos-sembrados.test.ts`, `G/guard-nav-permisos-declarados.test.ts`, `U/navegacion/qc75-convenciones.test.ts`, `U/identity/permissions.test.ts`, `U/identity/seed/seed-initial-access.test.ts`, `I/identity-seed.int.test.ts`, `G/guard-contrato-listados.test.ts`, `U/recetas-ui/recipe-route-contract.test.ts` y `U/identity/account-status-scope.test.ts`. **La prueba de que no se debilito nada**: en la tanda 1 el diff de `tests/` borra exactamente **6** lineas con `expect(`, y las seis son la misma asercion con el numero nuevo; en T18, las 7 lineas borradas son un parrafo caduco y dos titulos que mentian. Y dos archivos **ganan** casos: `permissions.test.ts` (+2) y el propio `scope.test.ts` (+8) |

### El autor del estado con el que nace la cuenta

| R | Test |
| --- | --- |
| **R49** | `I/user-crud.int.test.ts > R49 — account_status_changed_by queda NULO en la fila: el pending inicial no se atribuye a ninguna persona`, **leido de la FILA CRUDA** con `$queryRaw` —mirar `UserDetail` habria sido verde por vacuidad, porque esa columna no existe ahi—, **con su contraste** `> R49 (contraste) — al MOVER el estado si se escribe el autor, asi que el NULO del alta no es que la columna no se escriba nunca`. En dominio, `U/iu/user-service.test.ts > R49 — el alta NO pasa ningun autor del cambio de estado: cinco argumentos y ninguno es el actor`, que lo afirma de **tres** formas: longitud exacta de cinco argumentos, busqueda **recursiva** de `actor.id` en cada uno, y la firma del puerto sin campo de autor. Y la garantia estructural: **`create` no tiene parametro de autor**, asi que R49 es una propiedad del tipo y no una promesa |

**Los 49 requisitos tienen test nombrado. Ninguno queda sin cubrir.**

---

## Preguntas abiertas al cerrar la implementacion

**P1 — nadie le dice a la persona que tiene cuenta. SIGUE ABIERTA.** No se cerro implementando y no
cambia ningun archivo de esta feature: es orden de trabajo entre fichas (hacer **QC-79**
inmediatamente detras) o un requisito nuevo, y eso lo decide el humano (regla 6 de `CLAUDE.md`). La
consecuencia esta aceptada y escrita en el board: esta ficha crea la cuenta y **nadie puede entrar**.

**P2 — qué pasa con una sesion abierta cuando cambia el rol o el nombre de usuario. SIGUE ABIERTA.**
Tampoco la toca nada de lo implementado: la invalidacion de sesiones vive en **QC-23** y el estado de
cuenta en el acceso en **QC-78**, y **ninguna de las dos habla del rol**. Hoy una sesion viva podria
seguir operando con los permisos del rol anterior hasta que caduque.

**P3 — ¿puede el actor editar sus propios datos que no son el rol? SIGUE ABIERTA, y hay que leer
esto.** `update-user.ts` **rechaza** con `SelfOperationError` cuando el objetivo es el propio actor.
El motivo escrito en el archivo es **solo R21**: la edicion es **reemplazo completo** y el `roleId` es
uno de los nueve campos, asi que editar la propia fila **es**, inevitablemente, escribirse el propio
rol — no hay forma de pedir «los otros ocho».

**No existe una opcion neutra**: permitirlo habria sido decidir P3 en el otro sentido. Se eligio la
lectura que el **texto de R21 sostiene**, y el archivo lo dice con todas las letras, con el coste del
cambio escrito: si el humano cierra P3 en «tampoco se edita a si mismo», es **una clausula mas en ese
mismo sitio**; si la cierra en «puede editarse todo menos el rol», cambia **esa linea** —habria que
comparar el rol pedido contra el actual— y su caso de test. Mientras siga abierta, el actor tampoco
puede **llegar** a su propia ficha, y eso es consecuencia de **R35**, no una decision sobre P3.

**P4 — CERRADA** el 2026-09-10 al aprobar el spec. Es la decision 18 y la escribe **R49**, cubierta
arriba.

---

## Lo que el reviewer tiene que mirar de frente

### 1. El `design.md` quedo desactualizado en cuatro puntos, y el codigo implementa lo correcto

Ninguno se arreglo en el spec —esta aprobado y no se reabre—, pero **los cuatro quedan escritos aqui
y en el codigo**:

1. **`> 6.4` dice que `meta.target` trae «las columnas afectadas».** Falso para los dos indices
   **funcionales**: traen la **expresion** (`lower(email)`, `lower(username)`). Una comparacion por
   igualdad no habria hecho match jamas. Medido contra la base; el adaptador lo corrige y lo explica.
2. **`> 2` fila 6 dice que en `identity-seed.int.test.ts` «no hay numero literal que cambiar».** Si lo
   habia: `expect(TOTAL_DE_ASIGNACIONES_DEL_SEED).toBe(12)`, y estaba rojo.
3. **`> 2` midio SEIS archivos ajenos y `> 8.1` declaro un septimo. Fueron NUEVE**, mas un septimo
   caso rojo dentro del tercero. Los dos que faltaban: `recipe-route-contract.test.ts` (exige nombrar
   cada migracion nueva de `db/`) y `account-status-scope.test.ts` (la guarda de QC-65 cuya premisa
   caduca con esta ficha).
4. **`> 7` y `> 11` no mencionan el puerto del log de campos omitidos**, que los cinco modulos con
   listado tienen sin excepcion (QC-57 R6). Y **`> 1` dice tres archivos nuevos en `adapters/`: son
   cuatro** (`list-query-sql.ts` entro con el contrato de lista).

### 2. Dos desvios del diseno, medidos y con su motivo

- **`updateAliveInCompany` gana `'last_administrator'`** (`> 7` no se lo pone). R19 es reemplazo
  completo, asi que el cambio de rol no es separable de la edicion; dejar la firma literal habria
  dejado **R22 sin implementar en la edicion, en silencio**. El bloqueo sigue en **un solo sitio**.
  Consecuencia: `GuardedChange` tiene **dos** variantes y no tres.
- **`page.ts` no es byte a byte** ninguna de las cinco copias, porque **las cinco ya divergen de
  verdad**; se partio de `unidades`, que es el caso exacto de `identity`. El `type Page<T>` si es
  identico caracter a caracter en los seis.

### 3. La declaracion de archivos compartidos del spec esta INCOMPLETA

`tasks.md` declara **un** solape de tests con QC-78: `tests/unit/composition/identity-facade.test.ts`.
**Son dos**: tambien `tests/unit/identity/account-status-scope.test.ts`, que QC-78 va a tocar porque
su ficha es «el estado de cuenta en el acceso». Los dos se escribieron **de forma aditiva y
rotulada** —cero deleciones en el primero; bloque separado en el segundo— para que el merge de QC-78
entre al lado y no como conflicto en la misma linea. **De produccion no hay ningun archivo en comun.**

### 4. Rojos ajenos que NO son de esta feature, medidos antes de escribir una linea

El gate completo los va a ver. **Ninguno lo causa QC-66:**

| Rojo | Por qué, y por qué no es mio |
| --- | --- |
| `app/layout.tsx(43,56) TS2304 LayoutProps` | tipo que genera `next build`; ausente en un worktree recien montado |
| `U/recetas/recipe-lines-catalog.test.ts`, `U/recetas/recipe-service.test.ts` (`ProductRef.stock`) | es el arreglo en vuelo que el worktree principal tiene **sin commitear** en esos mismos dos archivos |
| `U/unidades/modulo-intacto.test.ts` | exige que `unit-prisma.ts` este en el diff contra `origin/dev`: **solo cierto en la rama de QC-39**. Rojo en `dev` y en toda rama de feature |
| `U/unidades/unidades-convenciones.test.ts` | exige un `e2e/unidades.spec.ts` nuevo: **solo cierto en la rama de QC-76/QC-38** |

Los dos ultimos son un **hallazgo del arnes**, no de esta ficha: son anclas de no-vacuidad que
afirman sobre el diff de **su propia** feature, asi que no pueden estar verdes en ninguna otra rama.
Se dejaron **intactos** a proposito (regla 6: no se arregla por supuesto lo que no es de esta ficha).
El `scope.test.ts` de T18 **no** repite ese error: su ancla afirma que **esta** rama cambia algo.

### 5. Deuda declarada, no silenciada

- La cabecera de las **seis** copias de `list-query.ts` sigue diciendo «duplicado a proposito en los
  cinco modulos». Corregirlo obliga a editar las **cinco copias ajenas** (la guardia compara texto: o
  las seis o ninguna), fuera del alcance de esta ficha. **La guardia si quedo en «seis»**, que es
  donde vive el ancla.
- **`P2003` llega con `constraint: null`**, asi que «rol inexistente» y «tipo de documento
  inexistente» son **indistinguibles** en este motor y se funden en `role_not_found`. Cumple R18,
  pero si QC-67 quiere mensajes distintos **hay que reabrir el puerto**.
- `toBirthDate` vive exportada desde `create-user.ts`; su sitio natural seria un `domain/birth-date.ts`
  que `tasks.md` no declara.
- **Riesgo conocido del patron de anclas contra el diff**: una vez esta rama este en `dev` con arbol
  limpio, los casos de `scope.test.ts` que miran el diff veran un diff vacio y se pondran rojos. Es
  el **mismo** riesgo que ya tienen los cinco retensados de `recipe-route-contract.test.ts`; se sigue
  el patron del repo, y queda dicho en vez de descubierto.

### 6. Montaje del entorno, para quien repita esto

El worktree venia **sin `node_modules` y sin `.env`** (solo dos de los cinco activos los tenian).
Ademas, **la convencion real es una base por feature** (`QuimiCloude_QC<n>`): copiar el `.env` de otro
worktree trae su `DATABASE_URL`, y eso hizo que la migracion se aplicara sobre la base de **QC-78**
antes de detectarlo. Revertido entero y verificado (11 permisos, 12 asignaciones, cero rastro en
`_prisma_migrations`); la base de esta feature es **`QuimiCloude_QC66`**.

---

## Estado final

| | |
| --- | --- |
| Tasks cerradas | **20 de 20** (T0-T20) |
| Requisitos con test nombrado | **49 de 49** |
| Commits | 9, uno por tanda o task logica |
| Archivos ajenos del ripple | **9**, todos verdes y sin ninguna expectativa debilitada (R48) |
| Dependencias nuevas | **0** (R47) |
| Preguntas abiertas | **P1, P2 y P3 siguen abiertas**; P4 cerrada por el humano y escrita por R49 |
| E2E | **diferida a QC-67 con motivo**, declarado en el diseno y no al final (R46) |

`typecheck` y `eslint` en la linea base exacta, sin ganar ni un archivo rojo. Las **26 guardias**
verdes. `tests/unit/identity/` **721 passed | 3 skipped**. `tests/integration/identity/`
**161 passed**.

**El gate (`./init.sh --rapido` por tanda y `./init.sh` completo antes del PR) lo corre el leader: no
me autoapruebo, y la suite completa no se corrio desde aqui a proposito** (regla del gate de
`AGENTS.md`). Quedan para el leader la sincronizacion con `origin/dev` (**F2.3** — `origin/dev` se
movio a `192842a` mientras esto se escribia) y el PR (**F2.4**).

---

## F2.3 — sincronizacion con `origin/dev` (2026-09-10)

`git fetch origin dev` + `git merge origin/dev` sobre `feature/QC-66-crud-de-usuarios`.
Base: `c870825` -> `origin/dev` en **`192842a`** (entro **QC-70, errores centralizados**).
**116 archivos, +5217/-657.**

### Conflictos: NINGUNO

Git mezclo solo. Los **dos** archivos que estaban en las dos ramas se auto-resolvieron por zonas
disjuntas, y **ese resultado es consecuencia directa de haberlos escrito de forma aditiva**:

| Archivo | Lo que traia `dev` | Lo que traia esta rama | Resultado |
| --- | --- | --- | --- |
| `tests/unit/identity/account-status-scope.test.ts` | QC-70 extrae `infraccionesDeAlcance` como funcion pura y exporta `esLaRamaDeQC65`, y anade tres casos sinteticos al final para que el centinela siga mordiendo en su propia rama | el bloque `RETENSADO 2026-09-10 (QC-66)` con los diez sitios nuevos en `SITIOS_PERMITIDOS`, y dos titulos corregidos | auto-merge limpio: las zonas no se tocan |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | `RENOMBRADO_DE_COMENTARIOS_QC70` y su filtro en `tocaRecetas` | `MIGRACION_QC66` y su filtro en `tocaDb` | auto-merge limpio: **cada uno anadio su bloque y su filtro a una cadena distinta** |

Los dos pasan despues del merge. No se reescribio **nada** de lo que trajo `dev`.

### Los cuatro rojos ajenos: TRES APAGADOS, uno queda y no lo apaga ningun merge

| Rojo | Despues del merge |
| --- | --- |
| `tests/unit/recetas/recipe-lines-catalog.test.ts` (`ProductRef.stock`, 2 diagnosticos) | **APAGADO.** `dev` traia el arreglo |
| `tests/unit/recetas/recipe-service.test.ts` (`ProductRef.stock`) | **APAGADO** |
| `app/layout.tsx(43,56) TS2304 LayoutProps` | **SIGUE**, y **no es arreglable por merge**: `LayoutProps` es un tipo que **genera `next build`** en `.next/types`, y un worktree recien montado no lo tiene. Se apaga corriendo `next build` (o `next dev`) una vez, no con codigo |

Y los dos que estaban rojos **por su propio diseno** en toda rama que no fuese la suya:

| | Despues del merge |
| --- | --- |
| `tests/unit/unidades/modulo-intacto.test.ts` | **VERDE.** `dev` lo arreglo (+109 lineas) con el mismo patron que QC-70 aplico al centinela de QC-65: **mudo fuera de su rama**, nunca verde, y con casos sinteticos para que siga mordiendo dentro |
| `tests/unit/unidades/unidades-convenciones.test.ts` | **VERDE**, por el mismo arreglo (+72) |

O sea: **el hallazgo del arnes que anote en T18 ya estaba visto y arreglado en `dev`**, y por el mismo
camino que yo describi. Queda como confirmacion, no como deuda.

### Medicion despues del merge

```
pnpm run typecheck  -> 1 solo error: app/layout.tsx(43,56) LayoutProps   (de 4 archivos a 1)
pnpm exec eslint .  -> sin salida (limpio)

tests/unit/identity/ + tests/unit/composition/ + recipe-route-contract
+ unidades/modulo-intacto + unidades/unidades-convenciones
  -> Test Files  49 passed (49)   |  Tests  778 passed | 8 skipped (786)

tests/unit/recetas/ + tests/integration/identity/
  -> Test Files  27 passed (27)   |  Tests  361 passed (361)

pnpm exec vitest run guard
  -> Test Files  1 failed | 26 passed (27)  |  Tests  3 failed | 269 passed | 4 skipped
```

La suite completa **no** se corrio: el gate lo corre el leader (F2.4).

### HALLAZGO QUE BLOQUEA EL GATE Y QUE NO DECIDO YO: QC-70 invalida la capa de errores de esta ficha

El merge **compila y no rompe ningun test**, pero deja **tres casos rojos** en una guardia **nueva**
que `dev` acaba de traer: `tests/guards/guard-catalogo-de-errores.test.ts`. No es ruido: es QC-70
diciendo que la forma en que esta ficha hace los errores **ya no es la del repositorio**.

QC-70 creo `lib/modules/errores/` —`error-catalog.ts`, `error-codes.ts`, `error-message.ts`,
`error-state.ts`— y **migro los cinco modulos** a un catalogo unico. `identity` seria el sexto, y
esta ficha escribio su jerarquia de errores **copiando el patron de `unidades` ANTES de esa
migracion** (T3, el 2026-09-10 por la manana). Lo tres casos rojos, con su texto literal:

**1. R22 — siete codigos fuera del catalogo unico:**
```
lib/modules/identity/domain/errors.ts: el codigo 'not_found' no esta en el catalogo (R22)
lib/modules/identity/domain/errors.ts: el codigo 'duplicate_email' no esta en el catalogo (R22)
lib/modules/identity/domain/errors.ts: el codigo 'duplicate_username' no esta en el catalogo (R22)
lib/modules/identity/domain/errors.ts: el codigo 'duplicate_document' no esta en el catalogo (R22)
lib/modules/identity/domain/errors.ts: el codigo 'role_not_found' no esta en el catalogo (R22)
lib/modules/identity/domain/errors.ts: el codigo 'self_operation' no esta en el catalogo (R22)
lib/modules/identity/domain/errors.ts: el codigo 'last_administrator' no esta en el catalogo (R22)
```
Los otros **dos** —`unauthorized` e `invalid_input`— **si** estan en el catalogo y ya cumplen.

**2. R23 — la traduccion propia del driving:**
```
lib/modules/identity/adapters/driving/user-actions.ts: vuelve a declarar 'toErrorState' como
  funcion propia (R23)
lib/modules/identity/adapters/driving/user-actions.ts: traduce un error a
  { status: 'error', ... } por su cuenta (R23)
```
QC-70 tiene **un** traductor unico y prohibe que cada modulo escriba el suyo.

**3. R24 — los diez constructores admiten un mensaje.** El patron nuevo es
`constructor(code: ErrorCode, diagnostic?: string)` con `super(errorMessage(code))`: **el mensaje
sale del catalogo y nadie puede pasar un texto**, porque si pudiera la frase volveria a vivir en
seis archivos, que es justo lo que QC-70 quita. Ademas el patron nuevo anade `diagnostic`, que va
**solo al registro del servidor** y que el traductor unico **no** copia al estado que cruza al
navegador (QC-70 R28, R29).

#### Por qué NO lo migro por mi cuenta

Porque **no es un arreglo mecanico: cambia los `code` que el spec aprobado fija**.
**QC-70 R16 prohibe expresamente el codigo generico `not_found`** y exige uno por caso concreto —de
ahi `product_not_found`, `supplier_not_found`, `unit_not_found`…—. Asi que conformarse **obliga a
renombrar** al menos `not_found` (a algo como `user_not_found`), y probablemente los tres duplicados,
para seguir la convencion del catalogo. Y esos literales **estan escritos en `design.md > 6.4`**, que
esta **aprobado por el humano y no se reabre**, y son **el contrato que QC-67 va a consumir** para
decidir qué mensaje muestra. Elegir los nombres nuevos por mi cuenta seria decidir por el humano
(regla 6 de `CLAUDE.md`) y cambiar un contrato entre dos fichas sin que nadie lo apruebe.

#### Lo que costaria, medido, para que se decida rapido

| Qué | Archivos |
| --- | --- |
| Anadir los 7 codigos **y sus mensajes** al catalogo unico | `lib/modules/errores/domain/error-catalog.ts` (+ `error-codes.ts` si la union es explicita) — **es un archivo de OTRA ficha** |
| Reescribir la jerarquia al patron nuevo (`ErrorCode`, `errorMessage(code)`, `diagnostic`, sin parametro de mensaje) | `lib/modules/identity/domain/errors.ts` |
| Quitar el traductor propio y usar el unico de QC-70 | `lib/modules/identity/adapters/driving/user-actions.ts` |
| Ajustar los tests que afirman los `code` y la traduccion | `tests/unit/identity/usuarios/errors.test.ts`, `tests/unit/identity/usuarios/user-actions.test.ts` |
| Si se renombran codigos, actualizar el mapa de trazabilidad | este archivo |

**Nada de eso toca el dominio, los puertos, el adaptador Prisma ni las migraciones**: los seis casos
de uso lanzan las **clases**, no los literales, asi que R1-R5, R13-R39 y R49 no se mueven. El golpe
es **la capa de errores y su traduccion**, que es R41 y su mitad de R40.

#### Tres salidas, y la eleccion no es mia

1. **Migrar dentro de esta ficha**, con el humano decidiendo los nombres nuevos (`user_not_found`,
   `user_duplicate_email`…). El gate queda verde y QC-67 recibe el contrato definitivo.
2. **Una ficha propia de migracion** (`identity` al catalogo de QC-70), como QC-70 hizo con los cinco.
   Deja el gate **rojo** mientras exista, y el gate completo es obligatorio antes de cada PR (regla 5),
   asi que esto **bloquearia el cierre de todo el repo** — el mismo problema que QC-70 describe en el
   comentario del centinela de QC-65.
3. **Que la guardia excluya `identity` temporalmente.** **No lo recomiendo y no lo haria sin orden
   explicita**: es debilitar una guardia recien puesta, que es exactamente lo que R48 prohibe en el
   sentido contrario.

**Mi lectura, para que sirva de insumo y no de decision: la (1).** El coste medido son cinco archivos
y ningun cambio de dominio, y es lo unico que deja el gate verde sin aflojar nada. Pero **los nombres
de los codigos los tiene que decir el humano**, porque son el contrato de QC-67 y estan escritos en un
spec aprobado.

**Estado de la rama: sincronizada y empujada, pero NO verde en el gate completo** por estos tres
casos. No me autoapruebo y no abro el PR (F2.4 es del leader).
