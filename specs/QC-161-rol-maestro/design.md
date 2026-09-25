# QC-161 — rol-maestro · design.md

> El QUÉ está en `requirements.md` (R1–R44) y el alcance lo cerró el humano (D1–D12 antes del spec,
> D13–D20 en la revisión del 2026-09-25). Aquí va el CÓMO: **un** rol más, **dos** permisos más,
> **una** migración con su `down.sql`, el seed que crea al primer Maestro, **el nombre de usuario
> único en todo el sistema** (D13) y, lo que más pesa, **la sesión sin empresa**: hoy todo el camino
> del login da por hecho que cada persona tiene empresa y un Maestro sin ella no podría entrar.
>
> Precedentes que se siguen en lugar de reinventarse: **QC-144** (rol Empacador: migración que
> inserta rol, permiso y asignaciones, guardias y tests que se ponen rojos), **QC-6** (el seed que
> lee qué falta y crea solo eso, credenciales desde el entorno), **QC-48** (la empresa en la
> sesión y sus cortes), **QC-94 + fix del PR #106** (el catálogo asignable excluye al
> Administrador en dos capas) y los disparadores de empresa de **QC-49/QC-92**
> (`inventory_movements_check_company`).

---

## 0. Hallazgos al medir el código (sobre `origin/dev` del 2026-09-24, re-medidos el 2026-09-25)

> **Re-medición del 2026-09-25.** Sin shell, `dev` se lee en el árbol principal
> (`C:/Users/Cristian/Documents/trabajo/arc/labs/`, rama `dev`), que puede ir por detrás de
> `origin/dev` si nadie ha hecho `pull`. Lo que sigue es lo que hay en ese árbol; el implementer lo
> repite contra `origin/dev` en T0. Los hallazgos 1, 2, 6 y 7 se reescriben; del 14 al 21 son nuevos.

1. **El catálogo ya tiene 20 permisos, y `dev` ya no fija su total en ningún sitio.** Entraron
   `clientes.*` (QC-153, quinta enmienda escrita) y `documentos.*` (QC-142, ya `done`), cuyo párrafo
   del JSDoc de `lib/modules/identity/domain/permissions.ts:45-46` **no lleva ordinal**. La frase del
   recuento **ya no tiene número** (`permissions.ts:8`): la propuesta del spec anterior (§2.2) ya la
   aplicó otra ficha. QC-142 dejó además la guardia `tests/unit/identity/catalogo-sin-total-fijo.test.ts`,
   que barre `tests/` y `e2e/` y rompe ante cualquier total literal del catálogo o del seed. El
   ordinal de esta enmienda, contando el párrafo de `documentos` como sexta, sería **séptima**; se
   escribe al implementar contra `dev` (D3), porque **QC-168** y **QC-169** siguen `in_progress` y
   pueden entrar antes.
2. **Hoy el Administrador tiene el catálogo entero, y muchos tests lo dicen así.** Con D4
   («Administrador sin cambios») esa igualdad deja de ser cierta: tiene todo **menos** `empresas.*`.
   Sitios que la afirman en `dev` (todos a reescribir en §10.1):
   `tests/unit/identity/permissions.test.ts:381-382, 459-461, 464-467, 496-507` (`toEqual(CODIGOS_DEL_REQUISITO)`),
   `tests/unit/identity/seed/seed-initial-access.test.ts:752-756` (Administrador = `PERMISSIONS`),
   `tests/integration/identity/identity-seed.int.test.ts:795-798, 835, 872, 1038`
   (Administrador = `CODIGOS_DEL_CATALOGO`, derivado de `PERMISSIONS` en `:286`).
3. **El seed es genérico para roles y permisos, no para usuarios.** Recorre `SEED_ROLES` y
   `SEED_ROLE_PERMISSIONS` sin nombrar ninguno (`seed-initial-access.ts:99-124`), así que el rol y sus
   dos asignaciones salen solos. El **usuario** inicial, en cambio, está escrito para el
   Administrador (`:69-175`) y siempre con empresa (`createInitialAdmin` exige `companyId: string`,
   `ports/initial-access-repository.ts:90-103`).
4. **El seed corre en cada despliegue.** `package.json:7` es
   `prisma migrate deploy && tsx scripts/seed.ts && next build`. El primer despliegue tras el merge
   no encontrará ningún Maestro y exigirá sus variables; sin ellas el `build` falla. D17: las da de
   alta el humano en Vercel y en el `.env` antes del merge, como condición del PR.
   Lo mismo en local: la plantilla de integración corre `db:seed` (`tests/helpers/test-database.ts:568-572`)
   y su huella incluye `seed-initial-access.ts` (`:180-186`), así que se reconstruye con esta rama.
5. **`users.company_id` es `NOT NULL` en la base y en Prisma** (`db/schema.prisma:105`,
   `company Company` en `:131`). Lo vigilan `tests/unit/identity/schema/identity-schema.test.ts:552-555`
   (`isOptional` falso) y `tests/integration/identity/identity-constraints.int.test.ts:1194-1211`
   (insertar sin empresa da `23502`).
6. **La unicidad de QC-47 es por empresa y no cubre filas sin empresa.** Los tres índices
   (`20260904180600_companies_and_user_company/migration.sql:171-173`) llevan `company_id` delante, y
   dos `NULL` no chocan en un índice único de Postgres. Con D13–D15 cambian así:
   - **nombre de usuario** (`users_username_unique`): deja de llevar `company_id` y pasa a ser
     **global**, `(lower("username")) WHERE "deleted_at" IS NULL`, que es exactamente el texto de
     QC-4 (`20260806122638_users_and_roles/migration.sql:76`). Cubre también al Maestro (R36);
   - **correo** y **documento**: los índices por empresa se quedan tal cual (R37) y se añaden dos
     índices parciales para las filas sin empresa (R28). El tercer índice parcial que proponía el
     spec anterior, el del nombre de usuario sin empresa, **desaparece**: lo cubre el global.
   El UP de QC-47 decía «no puede fallar por colisión» porque venía de claves globales. El UP de
   esta ficha va al revés —de por empresa a global— y **sí puede** fallar si la base ya tiene el
   mismo nombre en dos empresas (R39, pregunta abierta 1). Precedente directo: la guardia del
   `down.sql` de QC-47 (`:45-69`), que cuenta esos mismos duplicados antes de recrear los índices
   globales y aborta sin tocar filas.
7. **El login busca el usuario sin mirar la empresa y con `JOIN companies`**
   (`user-credentials-prisma.ts:76-87`): `INNER JOIN companies c ON c.id = u.company_id`. Con la
   empresa vacía el Maestro **no se encontraría** y el login respondería «credenciales incorrectas».
   La búsqueda es `lower(u.username) = lower($1) AND u.deleted_at IS NULL LIMIT 1`, sin empresa:
   hasta hoy, con dos empresas con el mismo nombre de usuario, elegía una fila cualquiera. **D13
   cierra esa ambigüedad** (antes pregunta 4): con el índice global, esa condición devuelve a lo sumo
   una fila, el `LIMIT 1` queda como mera defensa y el índice vuelve a servir de búsqueda directa
   para el login, cosa que QC-47 había perdido al poner `company_id` delante
   (`progress/review_QC-47-modelo-empresa-y-membresias.md:328`). R44.
8. **La sesión exige empresa en cuatro sitios**:
   - `domain/session.ts:29,64-70` — `SessionTicket.companyId: string`.
   - `domain/session-claims.ts:34` — `cid: z.string().uuid()`; `tests/unit/identity/session-claims.test.ts:87`
     afirma que `cid: null` invalida la sesión.
   - `adapters/driven/persistence/session-user-prisma.ts:86-87,108-110` — `company.deletedAt` sin
     opcional.
   - `domain/resolve-session.ts:162-170` — el `SessionContext` sale siempre, con `companyId: string`.
   El middleware (`route-guard-middleware.ts:102-107`) solo usa `parseSessionClaims` y
   `isSessionExpired`: cambia con el esquema, sin tocar su código.
9. **El actor sin empresa ya falla cerrado.** Las nueve copias de `currentActor()` en los adaptadores
   driving (p. ej. `unidades/adapters/driving/unit-actions.ts:66-78`,
   `identity/adapters/driving/session-actions.ts:79-96`) devuelven `null` si `getSessionContext()` es
   `null`, y con actor `null` el caso de uso rechaza en su primera línea. **Basta con que la sesión
   del Maestro no tenga contexto de empresa** para que R29 se cumpla sin tocar ningún módulo de
   negocio.
10. **El selector ya excluye un rol, en dos capas.** `role-catalog-prisma.ts:41`
    (`name: { not: ROLE_ADMINISTRADOR }`) y `user-admin-prisma.ts:295-299` (alta) y `:680-689`
    (edición) responden `'action_not_allowed'` si el `roleId` es el del Administrador. El Maestro se
    añade a las mismas dos capas. **Enmienda a D10, dicha tal cual:** la tabla dice «todo rol
    aparecía en el selector», pero desde el fix del 2026-09-22 el Administrador ya no aparece. No
    cambia nada de lo decidido: el Maestro tampoco aparecerá.
11. **Un Administrador no puede alcanzar al Maestro.** Lista, edición, baja y estado de cuenta
    filtran por `companyId` del actor (`user-admin-prisma.ts:808`, `updateAliveInCompany`); con la
    empresa del Maestro vacía, ningún filtro por empresa lo encuentra. R1 es un test, no código.
12. **El aterrizaje ya es por permiso.** `login-action.ts:122-128` aterriza en el primer enlace del
    menú filtrado o, si no queda ninguno, en `DASHBOARD_ROUTE`, que responde el 404 dentro del layout
    privado (QC-93 R14–R17). El layout (`app/(private)/layout.tsx:59-75`) solo usa `getSessionUser()`.
    R33 y R34 no necesitan código; QC-166 solo tendrá que añadir un enlace protegido por
    `empresas.consultar`.
13. **Nadie ramifica por el nombre del Maestro**, porque todavía no existe. La guardia
    `tests/guards/guard-autorizacion-por-permiso.test.ts:182-190` deriva sus patrones de las
    constantes importadas: se amplía con `ROLE_MAESTRO`.
14. **Ni el alta ni la edición de usuarios comprueban el nombre de usuario por su cuenta.** No hay
    consulta previa: la garantía es el índice. `user-admin-prisma.ts:203-211` traduce el `P2002` a
    `'username'` buscando la **subcadena** `username` en `meta.target`, no el nombre del índice ni
    la columna `company_id`; el dominio (`create-user.ts:91`, y la edición por el mismo camino) lanza
    `DuplicateUsernameError` y la pantalla señala el campo (`user-form.tsx:151`). Con el índice
    global, el `target` pasará a ser algo como `["lower(username)"]`: la subcadena sigue acertando,
    pero el valor **se mide de nuevo** contra Postgres, como hizo QC-66, y se escribe en el JSDoc de
    `:152-176`, que hoy documenta `["company_id","lower(username)"]`. Los dos índices sin empresa
    llevan `lower(email)` y `document_number` en su `target`: caen en las mismas marcas.
15. **El mensaje sí dice «en la empresa».** `lib/modules/errores/domain/error-catalog.ts:103`:
    «Ya existe un usuario con ese nombre de usuario en la empresa.» Con D13 es falso cuando el choque
    es con otra empresa o con el Maestro: pasa a «Ya existe un usuario con ese nombre de usuario.»
    (R41). Los de correo (`:102`) y documento (`:104`) no cambian (D14). Ningún test de `dev` fija el
    texto de `:103`.
16. **Consecuencia aceptada de D13.** El Administrador de una empresa que da de alta un usuario con
    un nombre ya usado en otra empresa recibe «ya existe»: sabe que ese nombre existe en la
    plataforma, pero no sabe en qué empresa ni ningún otro dato (R40). Es el precio de un nombre de
    usuario global y no se reabre; se deja escrito para que el reviewer no lo lea como fuga.
17. **Tests de `dev` que afirman lo contrario de D13** (se reescriben en §10.1, no se relajan):
    - `tests/integration/identity/identity-constraints.int.test.ts:1433-1481` —«rechaza el mismo
      nombre de usuario en la misma empresa y lo acepta en otra»—, con `username: 'admin'` en dos
      empresas. Además choca con el Administrador de la instalación si su `SEED_ADMIN_USERNAME` es
      `admin`, como sugiere el comentario de `:1472-1473`; el valor real vive en un `.env` sin
      versionar y el spec no lo conoce.
    - `tests/integration/identity/user-crud.int.test.ts:509-523` y `:525-542` —los **mismos** correo,
      nombre de usuario y documento en otra empresa sí se crean—.
    - El resto de fixtures de integración y E2E generan nombres únicos (`ana.${marca}`,
      `qc66.t16.${tag}`, `${SHARED_TOKEN}_admin`, `${FIXTURE_PREFIX}…${RUN_ID}`): medidos, no chocan
      entre sí. `identity-constraints.int.test.ts` reutiliza `anaperez` en muchos casos, pero cada
      uno en su propia transacción revertida y con un solo usuario vivo.
18. **La reversión de QC-47 se queda como está.** Su guardia (`down.sql:45-69`) ya vuelve a los
    índices globales; con esta ficha aplicada, esa reversión solo corre después de revertir esta
    (orden de `db:rollback`), así que no hay que tocarla.
19. **El seed del Administrador y el nombre global.** Si `needsAdmin` y un usuario vivo de otra
    empresa o el Maestro ya tiene `SEED_ADMIN_USERNAME`, `createInitialAdmin` recibe un `P2002`, su
    `catch` (`initial-access-repository-prisma.ts:154-164`) busca un Administrador vivo que no existe
    y `findFirstOrThrow` lanza: la transacción entera se deshace, pero con un error poco claro. D16
    solo pide el error claro para el Maestro; el camino del Administrador **no se toca** y queda
    anotado como límite conocido. El caso de la misma corrida (los dos usuarios nuevos con el mismo
    nombre) sí lo cubre R42.
20. **Última migración en `dev`**: `20260924190100_finished_products_and_content_copies`. El `<ts>`
    de esta ficha va después de la última que haya al implementar.
21. **Nada de esto toca los scopes congelados de fichas anteriores.** `tests/unit/identity/usuarios/scope.test.ts:707-742`
    (QC-66 R38, «ninguna migración de esta feature nombra los tres índices») solo lee la migración
    de QC-66 y la de QC-47; las guardias de índices de `account-status-migration`,
    `user-permissions-migration`, `credential-setup-migration` y `session-revocation-migration` leen
    solo su propio SQL. Ninguna se pone roja por la migración nueva.

---

## 1. Qué cambia (resumen)

| Archivo | Cambio | Requisitos |
|---|---|---|
| `lib/modules/identity/domain/roles.ts` | `ROLE_MAESTRO = 'Maestro'` y su fila **al final** de `SEED_ROLES`; la cabecera pasa de «tres literales» a «cuatro» | R2, R3, R4 |
| `lib/modules/identity/index.ts` | reexporta `ROLE_MAESTRO` | R3 |
| `lib/modules/identity/domain/permissions.ts` | dos entradas al final de `PERMISSIONS`, párrafo de enmienda, frase del recuento, clave `[ROLE_MAESTRO]` en `SEED_ROLE_PERMISSIONS`, una frase en su JSDoc | R5–R9 |
| `lib/modules/identity/domain/seed-initial-access.ts` | decide y crea el Maestro inicial; comprueba sus choques antes de escribir (§5) | R10–R15, R42, R43 |
| `lib/modules/identity/domain/account-status.ts` | solo si hace falta una constante hermana de `SEED_ADMIN_ACCOUNT_STATUS` (§5.2) | R10 |
| `lib/modules/identity/ports/initial-access-repository.ts` | métodos `createInitialMaestro` (sin empresa), `countLiveUsersWithUsername` y `countLiveUsersWithoutCompanyWithEmail` | R10, R15, R42, R43 |
| `lib/modules/identity/ports/initial-access-credentials.ts` | proveedor de credenciales del Maestro | R10–R12 |
| `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts` | implementa los tres métodos | R10, R42, R43 |
| `lib/modules/errores/domain/error-catalog.ts` | `errors.duplicate_username` sin «en la empresa» | R41 |
| `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` (JSDoc `:152-176`) | el `target` medido del índice global y de los dos sin empresa; la lógica de marcas no cambia | R36, R40 |
| `lib/modules/identity/adapters/driven/config/initial-access-credentials-env.ts` | segunda función con sus tres nombres de variable | R10–R12 |
| `lib/composition/index.ts` | cablea el proveedor del Maestro en `seedInitialAccess` | R10 |
| `scripts/seed.ts` | la línea de resumen dice si creó el Maestro | R10, R11 |
| `.env.example` | las tres variables del Maestro, sin valor | R14 |
| `db/schema.prisma` | `User.companyId String?`, `company Company?`, comentario del porqué; el comentario de `:86-89` pasa a decir que el nombre de usuario es global y correo y documento por empresa más sin empresa | R26, R27, R28, R36 |
| `db/migrations/<ts>_platform_maestro_role/migration.sql` + `down.sql` | §4 | R20–R22, R26–R28, R36–R39 |
| `lib/modules/identity/domain/session.ts` | `SessionTicket.companyId: string \| null` | R30 |
| `lib/modules/identity/domain/session-claims.ts` | `cid` admite `null` explícito | R31, R32 |
| `lib/modules/identity/adapters/driven/session/session-token.ts` | tipo del payload `cid: string \| null` (sin subir versión) | R30, R31 |
| `lib/modules/identity/ports/user-credentials-reader.ts` | `AuthenticatableUser.companyId: string \| null` | R30 |
| `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts` | `LEFT JOIN companies`, fila con `company_id` anulable; el JSDoc deja de decir que el `INNER JOIN` es obligatorio y dice que el nombre de usuario es único en todo el sistema | R30, R44 |
| `lib/modules/identity/ports/session-user-reader.ts` | `SessionUserRecord.companyId: string \| null` | R31 |
| `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts` | `company?.deletedAt ?? null` | R31 |
| `lib/modules/identity/domain/resolve-session.ts` | `context: null` cuando la ficha no tiene empresa | R29, R31, R32 |
| `lib/modules/identity/ports/session-provider.ts` | contrato de `getSessionContext` enmendado (§6.4) | R29, R31 |
| `lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts` | excluye también `ROLE_MAESTRO` | R23 |
| `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` | alta y edición rechazan también el `roleId` del Maestro (misma fila que el JSDoc de arriba: un solo archivo) | R24, R25 |
| `docs/architecture.md` | `## Dominio` n.º 1: «`users.company_id`, obligatoria» pasa a «obligatoria salvo para el Maestro» | R26, R27 |

`<ts>` es un timestamp **posterior a la última migración de `dev` al implementar** (hoy
`20260924190100_finished_products_and_content_copies`). No se fija aquí: QC-168 y QC-169 también
pueden traer migración.

**No se tocan:** `app/**` (tampoco `user-form.tsx`: el código `duplicate_username` y su campo no
cambian), `components/**`, `middleware.ts`, `route-guard-middleware.ts`,
`login-action.ts`, `lib/shared/navigation/**`, ningún módulo de negocio
(`inventario`, `recetas`, `unidades`, `proveedores`, `pedidos`, `asignaciones`, `documentos`,
`clientes`), `e2e/**` (R19), `package.json` (R20).

---

## 2. El catálogo de permisos

### 2.1 Las dos entradas

Al final de `PERMISSIONS`:

```ts
{ code: 'empresas.consultar', module: 'empresas', action: 'consultar',
  description: 'Consultar las empresas de la plataforma.' },
{ code: 'empresas.modificar', module: 'empresas', action: 'modificar',
  description: 'Dar de alta, editar y dar de baja empresas de la plataforma.' },
```

Las descripciones son propuesta de este spec (D3 fija los códigos y el alcance de `modificar`, no el
texto) y se aprueban con él. Cumplen las reglas vigiladas: `^[a-z]+\.[a-z]+$`, acción en
`{consultar, modificar}`, un módulo con escritura declara exactamente las dos
(`permissions.test.ts:88-119`), y `@@unique([module, action])` no choca.

### 2.2 La enmienda, dicha en el código (R7)

`empresas` **no** es una carpeta de `lib/modules/` —las empresas viven en `identity`—, igual que
`usuarios` y `terminados`. Párrafo nuevo al final del JSDoc de `PERMISSIONS`, sin citas (máximo
cinco líneas, `docs/conventions.md > Comentarios`):

```ts
 * **<Ordinal> enmienda al catalogo cerrado**: suma `empresas.consultar` y `empresas.modificar`,
 * ver y mantener las empresas de la plataforma. Cambia el recuento; como `usuarios`, su modulo no
 * es una carpeta de `lib/modules/`. Solo los recibe el Maestro: ningun rol de empresa los tiene.
```

La frase del recuento (`permissions.ts:8`) **ya no lleva número en `dev`** (hallazgo 1): esta ficha
no la toca. El ordinal del párrafo se escribe contra `dev` al implementar —hoy sería «Séptima»,
contando como sexta el párrafo sin ordinal de `documentos`—; si QC-168 o QC-169 enmiendan antes el
catálogo, se sube.

### 2.3 Quién los recibe

```ts
[ROLE_ADMINISTRADOR]: [ /* sin cambios */ ],
[ROLE_OPERADOR]:      [ /* sin cambios */ ],
[ROLE_EMPACADOR]:     [ /* sin cambios */ ],
[ROLE_MAESTRO]:       ['empresas.consultar', 'empresas.modificar'],
```

Una frase en el JSDoc de `SEED_ROLE_PERMISSIONS`: el Maestro nace con exactamente esos dos y ningún
rol de empresa los recibe.

### 2.4 Sitios que listan el catálogo a mano o igualan al Administrador con él

**Lo que el spec del 2026-09-24 proponía ya está hecho en `dev`** (hallazgo 1): QC-142 convirtió los
totales sueltos en derivaciones y dejó la guardia `catalogo-sin-total-fijo.test.ts`. La tabla
anterior de «números sueltos» queda **obsoleta** y se retira. Lo que sigue rojo con esta ficha, en
`dev` del 2026-09-25, son listas a mano (que tienen que ganar los dos códigos) y los sitios donde
«Administrador = catálogo entero» (que con D4 deja de ser cierto):

| Archivo:línea | Qué fija hoy | Arreglo |
|---|---|---|
| `tests/unit/identity/permissions.test.ts:20-…` | `CODIGOS_DEL_REQUISITO`, lista a mano | suma los dos al final |
| `tests/unit/identity/permissions.test.ts:160-186` | `MODULOS`, `MODULOS_CON_ESCRITURA` | suman `empresas` |
| `tests/unit/identity/permissions.test.ts:296-312` | «el previo más `clientes.*` más `documentos.*`», con esos cuatro al final | filtra también `empresas.*` del previo y lo añade en su posición |
| `tests/unit/identity/permissions.test.ts:381-382, 459-461, 464-467, 496-507` | Administrador `toEqual(CODIGOS_DEL_REQUISITO)` | Administrador = catálogo **sin** `empresas.*` (lista derivada filtrando el módulo, más un caso que afirma que no tiene ninguno de los dos) |
| `tests/unit/navegacion/qc75-convenciones.test.ts:53-74, 143-150` | `CODIGOS_QC74` a mano; módulos esperados = negocio + `dashboard`, `usuarios`, `terminados` | suma los dos códigos; `empresas` entra con `usuarios` y `terminados` (no es carpeta de `lib/modules/`) |
| `tests/unit/asignaciones/schema/order-assignments-migration.test.ts:869-875` | `CODIGOS_DE_FICHAS_POSTERIORES` | suma los dos |
| `tests/unit/identity/seed/seed-initial-access.test.ts:752-756` | Administrador = `PERMISSIONS` | Administrador = `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]`, y un caso que dice que ese conjunto no tiene `empresas.*` |
| `tests/integration/identity/identity-seed.int.test.ts:795-798, 835, 872, 1038` | Administrador = `CODIGOS_DEL_CATALOGO` | Administrador = `codigosSembradosDe(ROLE_ADMINISTRADOR)`, sin `empresas.*` |

**Los tests nuevos y reescritos de esta ficha no afirman ningún total**: la guardia de QC-142 los
rompería. Afirman `toContain` de los dos códigos, la ausencia de cualquier otro `empresas.*` y la
igualdad de cada rol con su lista en el dominio. Si QC-168 o QC-169 añaden códigos antes del merge,
el conflicto en las listas a mano es una unión de líneas.

---

## 3. El rol

```ts
export const ROLE_MAESTRO = 'Maestro'
// …
{ name: ROLE_MAESTRO, description: 'Dueno de la plataforma: gestiona las empresas.' },
```

Al final de `SEED_ROLES`, por el mismo motivo que el Empacador: los ids sintéticos `rol-<i>` de los
tests del seed se derivan del índice y los tres existentes no cambian. La descripción es propuesta
del spec (sin tildes, como las otras tres) y se aprueba con él.

---

## 4. La migración `db/migrations/<ts>_platform_maestro_role/`

Se crea con `pnpm run db:migrate:create` (`prisma migrate dev --create-only`) **después** de cambiar
`db/schema.prisma`, para que Prisma genere el `DROP NOT NULL` y confirme que no hay más drift. Si
emite los `DROP CONSTRAINT` de las FK escritas a mano (aviso conocido de QC-66/QC-86/QC-144), se
borran y se dice en la cabecera.

### 4.1 `migration.sql` (UP), en este orden

```sql
-- 0. GUARDIA (R39, propuesta pendiente de confirmar): va la PRIMERA, antes de tocar nada. Si dos
--    usuarios vivos comparten nombre de usuario, el indice global del paso 6 no se puede crear.
--    Se falla con la lista, sin renombrar ni dar de baja a nadie. Prisma corre el archivo en una
--    transaccion: no queda nada aplicado.
DO $$
DECLARE
  repetidos TEXT;
BEGIN
  SELECT string_agg(format('%s (%s usuarios)', nombre, total), ', ' ORDER BY nombre)
    INTO repetidos
    FROM (
      SELECT lower("username") AS nombre, count(*) AS total
        FROM "users" WHERE "deleted_at" IS NULL
       GROUP BY lower("username") HAVING count(*) > 1
    ) AS d;
  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'users_username_global: nombres de usuario repetidos entre usuarios vivos: %. '
      'Resuelvelos a mano antes de aplicar esta migracion.', repetidos
      USING ERRCODE = '23505';
  END IF;
END $$;

-- 1. La empresa deja de ser obligatoria en la columna; el disparador del paso 5 la vuelve a exigir
--    para todo rol que no sea el Maestro.
ALTER TABLE "users" ALTER COLUMN "company_id" DROP NOT NULL;

-- 2. El rol (forma de la migracion del Empacador).
INSERT INTO "roles" ("name", "description", "updated_at") VALUES
  ('Maestro', '<descripcion de SEED_ROLES>', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- 3. Los dos permisos.
INSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES
  ('empresas.consultar', 'empresas', 'consultar', '<descripcion>', CURRENT_TIMESTAMP),
  ('empresas.modificar', 'empresas', 'modificar', '<descripcion>', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 4. El Maestro: exactamente sus dos. Ninguna sentencia nombra a otro rol.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT "r"."id", "p"."code" FROM "roles" AS "r"
CROSS JOIN (VALUES ('empresas.consultar'), ('empresas.modificar')) AS "p"("code")
WHERE "r"."name" = 'Maestro'
ON CONFLICT ("role_id", "permission_code") DO NOTHING;

-- 5. Empresa segun rol: el Maestro sin empresa, cualquier otro con ella.
CREATE OR REPLACE FUNCTION users_check_company_by_role()
  RETURNS TRIGGER AS $users_check_company_by_role$
DECLARE
  role_name TEXT;
BEGIN
  SELECT r."name" INTO role_name FROM "roles" AS r WHERE r."id" = NEW."role_id";
  -- Rol inexistente: lo rechaza "users_role_id_fkey" con su 23503.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF role_name = 'Maestro' AND NEW."company_id" IS NOT NULL THEN
    RAISE EXCEPTION 'users_platform_role_without_company: ...' USING ERRCODE = '23514';
  END IF;
  IF role_name <> 'Maestro' AND NEW."company_id" IS NULL THEN
    RAISE EXCEPTION 'users_company_required: ...' USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END;
$users_check_company_by_role$ LANGUAGE plpgsql;

CREATE TRIGGER "users_check_company_by_role_trigger"
  BEFORE INSERT OR UPDATE OF "company_id", "role_id" ON "users"
  FOR EACH ROW EXECUTE FUNCTION users_check_company_by_role();

-- 6. El nombre de usuario, unico en todo el sistema (R36): mismo nombre de indice, sin company_id.
--    Es el texto literal de la migracion de usuarios y roles.
DROP INDEX "users_username_unique";
CREATE UNIQUE INDEX "users_username_unique" ON "users" (lower("username")) WHERE "deleted_at" IS NULL;

-- 7. Correo y documento entre usuarios sin empresa (R28). Los de empresa siguen con los indices
--    por empresa, que no se tocan (R37).
CREATE UNIQUE INDEX "users_email_without_company_unique"
  ON "users" (lower("email")) WHERE "company_id" IS NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_document_without_company_unique"
  ON "users" ("document_type_code", "document_number") WHERE "company_id" IS NULL AND "deleted_at" IS NULL;
```

- **La guardia del paso 0** es la de `20260904180600_companies_and_user_company/down.sql:45-69` con
  dos cambios: solo mira el nombre de usuario (correo y documento siguen por empresa) y **nombra**
  los repetidos en vez de contarlos. El mensaje lleva cada nombre en minúsculas y su número de
  usuarios vivos, nada más: ni ids, ni correos, ni empresas. Si el humano no acepta nombres en el
  log del `build` (pregunta abierta 1, punto b), se cambia `string_agg(...)` por `count(*)` y el
  mensaje da solo el número. `23505` porque es lo que daría el `CREATE UNIQUE INDEX` si la guardia no
  estuviera; el texto es lo que la hace útil.
- **Mismo nombre de índice, `users_username_unique`**: los comentarios y tests que ya lo nombran
  (hallazgo 14 y los de `identity-migration.test.ts`, `companies-migration.test.ts`) siguen
  apuntando al índice que manda. El nuevo es el texto literal de QC-4, así que QC-47 lo reconocerá
  si alguna vez se revierte hasta ahí.
- **El índice parcial del nombre de usuario sin empresa del spec anterior desaparece**: el global ya
  cubre a los usuarios sin empresa.

- **`23502` para «falta la empresa» a propósito.** Es el mismo código que daba el `NOT NULL`
  (`identity-constraints.int.test.ts:1211` sigue verde con un rol que no es Maestro), así que
  cualquier lector que hoy lo traduzca como «falta un obligatorio» sigue acertando. `23514` para el
  Maestro con empresa, como los demás disparadores de ámbito del repo.
- **`UPDATE OF "company_id", "role_id"`**: el caso que importa es cambiar de rol (un Administrador
  convertido en Maestro por SQL a mano, o un Maestro al que se asigna empresa). Las escrituras que no
  tocan esas columnas (bloqueo, estado de cuenta, sello de sesiones) no pagan la consulta a `roles`.
- **Las filas existentes cumplen al crear el disparador**: todas tienen empresa y ninguna es Maestro.
  El disparador no revisa filas viejas y no hace falta.
- **El literal `'Maestro'` se duplica en SQL** porque una migración no importa TypeScript. `db/` queda
  fuera del barrido de R3, igual que `'Administrador'` y `'Empacador'` en sus migraciones. El test
  estático compara los literales del SQL con `ROLE_MAESTRO`, `SEED_ROLES`, `PERMISSIONS` y
  `SEED_ROLE_PERMISSIONS` **importados**, para que divergir sea rojo.
- **Renombrar el rol Maestro** dejaría el disparador comparando contra un nombre inexistente. Los roles
  solo cambian por migración y seed (`guard-permisos-no-administrables`, ampliada a `Role` por
  QC-144), así que una migración que lo renombre tendría que rehacer esta función. Se deja dicho en
  la cabecera del SQL.
- RLS: `users`, `roles`, `permissions` y `role_permissions` ya tienen `FORCE ROW LEVEL SECURITY`; no
  se toca ninguna policy.

### 4.2 `down.sql`, en orden inverso

```sql
DROP INDEX "users_document_without_company_unique";
DROP INDEX "users_email_without_company_unique";
-- El nombre de usuario vuelve a ser por empresa, con el texto literal de QC-47. No puede fallar
-- por colision: lo que era unico en todo el sistema lo es dentro de cada empresa.
DROP INDEX "users_username_unique";
CREATE UNIQUE INDEX "users_username_unique" ON "users" ("company_id", lower("username")) WHERE "deleted_at" IS NULL;
DROP TRIGGER "users_check_company_by_role_trigger" ON "users";
DROP FUNCTION users_check_company_by_role();
-- Falla con 23502 si queda algun usuario sin empresa (el Maestro): la reversion entera se deshace.
ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL;
DELETE FROM "role_permissions" WHERE "permission_code" IN ('empresas.consultar', 'empresas.modificar');
DELETE FROM "role_permissions" WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Maestro');
DELETE FROM "permissions" WHERE "code" IN ('empresas.consultar', 'empresas.modificar');
DELETE FROM "roles" WHERE "name" = 'Maestro';
```

- **El `SET NOT NULL` va antes de cualquier `DELETE`** para que, con un Maestro vivo o dado de baja,
  la reversión falle **antes** de tocar datos. `scripts/db-rollback.ts` aplica el `down.sql` y borra
  la fila de `_prisma_migrations` en la misma transacción, así que todo se deshace (R22). Reasignar
  o borrar al Maestro sería inventar un dato.
- Sin `CASCADE`, sin `UPDATE`, sin `INSERT`.
- El test estático compara el `CREATE UNIQUE INDEX "users_username_unique"` del DOWN con el texto
  **leído** de `20260904180600_companies_and_user_company/migration.sql:172`, y el del UP con el de
  `20260806122638_users_and_roles/migration.sql:76`, igual que `companies-migration.test.ts` hace con
  QC-4: si divergen, rojo.

### 4.3 `db/schema.prisma`

```prisma
/// Vacia solo para el Maestro: lo exige el disparador "users_check_company_by_role".
companyId        String?   @map("company_id") @db.Uuid
…
company          Company?  @relation(fields: [companyId], references: [id], onDelete: Restrict, onUpdate: Cascade)
```

`@@unique([id, companyId])` se queda: sigue siendo destino de las FK compuestas de grupos de trabajo.
Una fila con `company_id` nulo no puede ser miembro de un grupo de empresa (esas FK no admiten
`NULL` en el hijo), que es lo correcto. El comentario de cabecera del modelo (`:86-89`, «con
`company_id` delante») se reescribe: el nombre de usuario es único en todo el sistema; correo y
documento, por empresa, más dos índices parciales para las filas sin empresa.

---

## 5. El seed del primer Maestro

### 5.1 Variables de entorno

`SEED_MAESTRO_USERNAME`, `SEED_MAESTRO_PASSWORD`, `SEED_MAESTRO_EMAIL` (D17). Viven **solo** como elementos de un arreglo en `initial-access-credentials-env.ts`, igual que las
`SEED_ADMIN_*` (`:17`), por `guard-password-never-plaintext`. Nueva función exportada
`readInitialMaestroCredentialsFromEnv`, que reutiliza `readRequiredEnv` y el mismo formato de error
(«faltan las variables de entorno: …», sin valores). `.env.example` gana un bloque hermano del de
`SEED_ADMIN_*` (`:19-24`).

### 5.2 El algoritmo (`seed-initial-access.ts`)

Mismo patrón que hoy, con el Maestro en paralelo al Administrador:

1. Leer roles existentes, **y** `countLiveUsersWithRole(ROLE_ADMINISTRADOR)` **y**
   `countLiveUsersWithRole(ROLE_MAESTRO)` (el método del puerto ya existe y es genérico).
2. `needsAdmin`, `needsMaestro`.
3. **Antes de escribir nada**: si `needsAdmin`, credenciales + política + hash del Administrador
   (sin cambios); si `needsMaestro`, lo mismo para el Maestro. Si cualquiera de las dos falla, el
   seed lanza y **no escribe nada** (R12, R13). Si `needsMaestro` es falso, el proveedor del Maestro
   **no se invoca** (R11).
3b. **Choques del Maestro, también antes de escribir** (R42, R43), solo si `needsMaestro`:
   - `repository.countLiveUsersWithUsername(username) > 0` → lanza «el nombre de usuario del
     maestro inicial ya esta en uso» (sin el valor). Compara `lower(username)` entre usuarios vivos,
     con o sin empresa: la misma condición del índice global.
   - si además `needsAdmin` y los dos nombres coinciden sin distinguir mayúsculas → el mismo error.
     Es el caso que la base aún no puede ver porque ninguno de los dos está escrito.
   - `repository.countLiveUsersWithoutCompanyWithEmail(email) > 0` → lanza «el correo del maestro
     inicial ya esta en uso» (sin el valor). Coincidir con el correo del Administrador inicial o de
     cualquier usuario de empresa **no** es choque (D14, R43).
   Los mensajes no llevan el valor por la misma razón que R12: acaban en el log del `build`.
   **Honestidad sobre R43:** con `needsMaestro` verdadero no hay ningún Maestro vivo, y el
   disparador impide que haya otro usuario vivo sin empresa, así que el choque de correo solo se da en
   una carrera entre dos despliegues. Se escribe igual porque D16 lo pide y porque el día que haya
   otra vía para crear Maestros (QC-162/QC-166) la comprobación ya estará. Su test unitario usa un
   doble que responde `1`; en integración la garantía la prueba el índice (§10.2).
   Todo esto corre dentro de `withInitialAccessTransaction`: aunque el choque llegara tarde, como
   `P2002` de `createInitialMaestro`, la transacción entera se deshace y no queda nada escrito.
4. Roles que falten (el Maestro sale solo de `SEED_ROLES`).
5. Permisos y asignaciones que falten (salen solos de `PERMISSIONS` y `SEED_ROLE_PERMISSIONS`).
6. Administrador inicial y empresa inicial: **sin cambios** (R15).
7. Si `needsMaestro`: `repository.createInitialMaestro({ roleId, accountStatus, username, email,
   passwordHash, firstNames, lastNames, birthDate, phone, documentTypeCode, documentNumber })` —
   **sin** `companyId`— con estado `active` explícito (una constante del dominio hermana de
   `SEED_ADMIN_ACCOUNT_STATUS`, o esa misma si el implementador la renombra a algo neutro; nunca el
   `@default(pending)` de la columna) y los marcadores de instalación (D20: nombres
   «Plataforma»/«Inicial», fecha, teléfono y documento iguales a los del Administrador; el documento
   no choca porque los índices de empresa y el nuevo sin empresa son disjuntos). El `catch` de
   `P2002` de `createInitialMaestro` **no** imita el de `createInitialAdmin` (releer y devolver el
   existente): relanza, porque con la comprobación del paso 3b un `P2002` aquí es una carrera o un
   choque, nunca «ya estaba».
8. `SeedOutcome` gana `createdMaestro: boolean`; `scripts/seed.ts` suma «usuario maestro:
   creado / ya existia» a su línea.

`SeedInitialAccessDeps` gana `maestroCredentials` (el proveedor). La composición lo cablea con
`readInitialMaestroCredentialsFromEnv`. `InitialAccessRepository` gana `createInitialMaestro`,
`countLiveUsersWithUsername(username)` y `countLiveUsersWithoutCompanyWithEmail(email)`; el
adaptador Prisma los implementa con `$queryRaw` sobre `lower(...)` y `deleted_at IS NULL` (la
condición exacta de los índices; la API tipada con `mode: 'insensitive'` generaría `ILIKE`, que no
usa el índice funcional —mismo motivo que `user-credentials-prisma.ts:29-33`—).

**Por qué la comprobación en el dominio y no solo el índice**: el índice garantiza, pero su error
llega como `P2002` genérico en mitad de la transacción y el operador de un despliegue fallido no
sabría qué variable cambiar. D16 pide un error claro.

**Por qué un método nuevo en el puerto y no `companyId: string | null` en `createInitialAdmin`**: la
firma actual hace imposible crear al Administrador sin empresa por un descuido; abrirla a `null` la
convertiría en una puerta a lo que la base ya rechaza. Dos métodos, cada uno con su invariante de
tipo.

### 5.3 Precondición de despliegue (operación, no código)

Antes de mergear a `dev` (y a `master`): las tres variables tienen que existir en Vercel para
**producción y preview**, y en el `.env` local de quien corra la integración o el seed. D17: las da
de alta el humano y es **condición del PR**. El `progress/impl_…` lo deja escrito como paso de
despliegue y el leader lo confirma con el humano antes de abrir el PR.

**El valor de `SEED_MAESTRO_USERNAME` importa** (R42): no puede coincidir con el de ningún usuario
vivo de la base de destino ni con `SEED_ADMIN_USERNAME`. En el `.env` de los worktrees, además, no
puede coincidir con ningún nombre fijo de los fixtures (`admin`, `anaperez`, `ana.a`, `ana.b`,
`otra.a`, `sinempresa`…), porque la plantilla de integración lleva al Maestro sembrado y un fixture
con su nombre chocaría con el índice global. Propuesta para local: `plataforma.inicial`.

**Segunda precondición, solo si la pregunta abierta 1 se confirma**: antes del merge, alguien con
acceso comprueba en las bases de preview y producción que no hay nombres de usuario repetidos entre
usuarios vivos (la consulta del paso 0 de §4.1). Si los hay, la migración fallará en el `build`.

---

## 6. La sesión sin empresa

### 6.1 Qué significa «sin empresa» en el contenido firmado

`cid` pasa de `z.string().uuid()` a `z.string().uuid().nullable()`: **`null` explícito** significa
«esta persona no tiene empresa». Ausente, vacío, número o texto sin forma de UUID siguen invalidando
la sesión (R32). **No se sube la versión** (`v4` se queda): toda cookie `v4` emitida hasta hoy lleva
un UUID y sigue siendo válida, y el único emisor de `null` es el login de alguien cuya ficha no tiene
empresa.

**Respuesta a la objeción de QC-48** (`session-token.ts:49-51`: «una empresa opcional obligaría a
decidir qué hacer con una sesión sin empresa en cada punto de uso»): el punto de uso es **uno**,
`resolve-session.ts`, que la traduce a «sin contexto de empresa» (§6.3), y todos los consumidores de
ese contexto ya fallan cerrado ante `null` (hallazgo 9). Nadie más recibe la empresa firmada: el
middleware no la lee y la autorización usa la de la base.

### 6.2 Login

- `AuthenticatableUser.companyId: string | null`, `SessionTicket.companyId: string | null`,
  `createSessionTicket(userId, roleName, companyId: string | null, …)`: `strict` marca los sitios de
  llamada.
- `user-credentials-prisma.ts`: `JOIN companies` pasa a **`LEFT JOIN`**, con `company_id` y
  `company_deleted_at` anulables. Sin empresa, `companyDeletedAt` es `null` y el corte «empresa dada
  de baja» (`verify-credentials.ts:227`) no dispara. **Ningún otro corte cambia**: señuelo, un solo
  `verify` de hash, estado de cuenta, contador y bloqueo (R30). `verify-credentials.ts` no cambia
  más que el tipo que pasa a `createSessionTicket`.
- Un usuario de empresa **no** puede llegar aquí con la empresa vacía: lo impide la base (R26). Por
  eso el `LEFT JOIN` no abre ninguna puerta.
- **La búsqueda no cambia de condición** (`lower(u.username) = lower($1) AND u.deleted_at IS NULL`):
  con el índice global de §4.1 paso 6 esa condición es exactamente la del índice, así que devuelve a
  lo sumo una fila, sea de una empresa o el Maestro (R44), y Postgres vuelve a poder usar el índice
  como búsqueda directa. El `LIMIT 1` se queda como defensa. El JSDoc de
  `user-credentials-prisma.ts:26-65` se corrige en las líneas que toca la rama: el párrafo del
  `INNER JOIN` («todo usuario vivo tiene empresa») y la frase del índice.
- **No se pide la empresa en el formulario de login** ni se añade ningún campo: con D13 no hace falta
  (antes pregunta 4, cerrada).

### 6.3 Resolución de la sesión

- `SessionUserRecord.companyId: string | null`; `session-user-prisma.ts` devuelve
  `companyDeletedAt: usuario.company?.deletedAt ?? null`. **Ni una consulta más**: la relación ya
  estaba en el `select`.
- `resolve-session.ts`:
  - Corte 4 (`record.companyId !== claims.companyId`) **no cambia de texto**: con valores anulables
    compara igual, y «firmada vacía / ficha con empresa» o al revés sale por `null` (R32).
  - Corte 5 no cambia: sin empresa, la marca de baja es `null`.
  - La composición final devuelve `context: record.companyId === null ? null : { userId, companyId,
    roleName }`. `ResolvedSession.context` pasa a `SessionContext | null`. `SessionContext` **no
    cambia** (`companyId: string` sigue siendo cierto para todo contexto que exista).
- `getSessionContext` en `lib/composition/index.ts:434` ya es `?.context ?? null`: no cambia.

### 6.4 Enmienda al contrato de `SessionProvider` (QC-48 R19)

`ports/session-provider.ts:6-14` dice que `getSessionContext` devuelve `null` «EXACTAMENTE en los
mismos casos» que `getSessionUser`. Deja de ser cierto en un caso, y se dice así en el JSDoc (sin
citas): además de sin sesión, devuelve `null` cuando la sesión es de alguien sin empresa, y entonces
toda operación con ámbito de empresa falla cerrado. Es lo que implementa R29.

### 6.5 Borde, layout, aterrizaje, cierre

- **Middleware**: sin cambios de código. `parseSessionClaims` acepta el `cid: null`, así que la
  sesión del Maestro es `authenticated` (R31).
- **Layout privado**: usa solo `getSessionUser()`; el menú filtrado sale vacío (R31, R33).
- **Aterrizaje**: `login-action.ts` sin cambios; hoy acaba en `/dashboard` → 404 dentro del layout
  (R33, D18: aceptado hasta QC-166).
- **Pantallas**: `requirePagePermission` compara permisos; sin ellos, 404 (R34).
- **Cierre de sesión**: `endSession` lee el `sid` con el mismo `parseSessionClaims`, registra el
  cierre y borra la cookie; nada suyo depende de la empresa (R35). `revoked_sessions` no tiene
  columna de empresa y sigue exenta (`guard-empresa-en-esquema`); su motivo en la guardia dice
  «cuelgan de un usuario que ya tiene empresa», que para el Maestro deja de ser literal: se ajusta
  la redacción del motivo, sin cambiar la lista.

---

## 7. El selector de roles y el alta/edición (D10)

- `role-catalog-prisma.ts:41`: `where: { name: { notIn: [ROLE_ADMINISTRADOR, ROLE_MAESTRO] } }` (R23).
- `user-admin-prisma.ts`, alta (`:295-299`) y edición (`:680-689`): se resuelven **los dos** ids
  (Administrador y Maestro) con una sola lectura por nombre y se responde `'action_not_allowed'` si
  el `roleId` pedido es cualquiera de ellos, **antes** de escribir. En la edición, la lectura sigue
  dentro de la transacción y la variable del Administrador se conserva para la guarda del último
  administrador (`:690`). La decisión no mira quién pide: da igual el rol o los permisos del actor
  (R24, R25).
- El dominio (`create-user.ts:241-245`, `update-user.ts:89`) ya traduce `'action_not_allowed'` a
  `ActionNotAllowedError`: no cambia.

### 7.1 Nombre de usuario duplicado en el alta y la edición (R40, R41)

- **Ningún código de alta ni de edición cambia de lógica** (hallazgo 14): el choque con un usuario
  de otra empresa o con el Maestro llega por el mismo `P2002` del mismo índice, el adaptador lo
  traduce a `'username'` por la subcadena, el dominio lanza `DuplicateUsernameError` y la pantalla
  señala el campo. Lo único que se toca es el JSDoc de las marcas (el `target` medido) y el texto
  del catálogo de errores.
- `error-catalog.ts:103`: «Ya existe un usuario con ese nombre de usuario.» `:102` y `:104` siguen
  con «en la empresa» (R41).
- Ni el error ni la respuesta del adaptador llevan el id, la empresa ni ningún dato del otro
  usuario: hoy tampoco los llevan, y un test lo fija (R40).

---

## 8. Autorización por permiso (D6)

- `tests/guards/guard-autorizacion-por-permiso.test.ts`: `buildForbiddenPatterns()` suma el literal
  derivado de `ROLE_MAESTRO` y el identificador `ROLE_MAESTRO`; el ancla de patrones (`:438-448`) se
  tensa con los dos; casos sintéticos «dispara» y «no dispara» como los del Empacador (`:468-500`)
  (R16).
- Las dos exclusiones de §7 viven en `identity`, que la guardia exime por diseño (`:61-63`): no es
  autorizar al actor por su rol, es una propiedad del rol **objetivo**, y es el mismo patrón que ya
  tiene el Administrador.

---

## 9. Qué NO se construye

Ningún caso de uso, Server Action ni pantalla usa `empresas.*` (R17): los exige QC-162, y el área del
Maestro es QC-166. Nada de listar, crear, editar ni dar de baja empresas. No se renombra a nadie
para cumplir la unicidad global (R39), y el camino del seed del Administrador no gana la
comprobación de choques del Maestro (hallazgo 19).

---

## 10. Tests

### 10.1 Los que se ponen rojos y cómo se arreglan (sin relajar ninguno)

| Archivo:línea | Por qué | Arreglo |
|---|---|---|
| todos los de §2.4 | listas a mano y «Administrador = catálogo entero» | §2.4 (líneas medidas en `dev` del 2026-09-25) |
| `tests/integration/identity/identity-constraints.int.test.ts:1433-1481` | afirma que el mismo nombre de usuario se acepta en otra empresa (y usa `admin`, que puede ser el del Administrador de la instalación) | se reescribe como R36: mismo nombre en la misma empresa **y** en otra → `23505`; en otras mayúsculas también; con nombres que no sean `admin`. Los casos hermanos de correo (`:1380-1431`) y documento (`:1483-1534`) **no cambian**: son R37 |
| `tests/integration/identity/user-crud.int.test.ts:509-523` | los mismos correo, nombre de usuario y documento en otra empresa se crean | se parte en dos: mismos correo y documento con **otro** nombre de usuario → se crea (R37); mismo nombre de usuario → `'username'` y cero filas en la empresa B (R36, R40) |
| `tests/integration/identity/user-crud.int.test.ts:525-542` | ídem, cambiando mayúsculas | ídem: correo y documento en mayúsculas se aceptan; nombre de usuario en mayúsculas → `'username'` |
| `tests/unit/identity/schema/companies-migration.test.ts`, `identity-migration.test.ts` | leen el SQL de QC-4/QC-47, que no cambia | no deberían ponerse rojos; si alguno busca «el `users_username_unique` vigente» recorriendo todas las migraciones, se acota a la suya |
| `tests/unit/identity/schema/identity-schema.test.ts:552-555` | `companyId` deja de ser obligatorio | «opcional, y solo por el disparador»: `isOptional` verdadero, `@db.Uuid`, `@map`, sin `@default` |
| `tests/unit/identity/session-claims.test.ts:81-87` | `cid: null` pasa a ser válido | se separa: `null` explícito → claims con `companyId: null`; ausente, vacío, número y no-UUID → `null` |
| `tests/unit/identity/seed/seed-initial-access.test.ts` (roles creados sobre base vacía, `:463` `toHaveLength(3)`, el caso «falta un rol»…) | un rol más, un usuario más, deps nuevas | los dobles suman `maestroCredentials` y `createInitialMaestro`; las listas de roles se derivan de `SEED_ROLES` |
| `tests/integration/identity/identity-seed.int.test.ts` (reset `:250-268`, casos de `SEED_ADMIN_*` `:113-129, 623-674`) | el reset tiene que borrar también al Maestro; los casos sin variables tienen que decidir las del Maestro | el reset ya borra todos los usuarios; los casos de variables guardan y restauran también `SEED_MAESTRO_*` |
| `tests/unit/identity/seed/deploy-hook.test.ts:89-106` | no falla, pero no vigila las nuevas | suma las tres del Maestro |
| `tests/guards/guard-autorizacion-por-permiso.test.ts:438-448` | ancla de patrones | §8 |
| `tests/guards/guard-rol-administrador-unico.test.ts` | no debería ponerse rojo | los marcadores del Maestro no escriben `'Administrador'` |
| Tests de `resolve-session`, `session-token`, `verify-credentials`, `session-user-prisma`, `user-credentials-prisma` | los tipos pasan a anulables | los dobles existentes siguen con UUID; se suman los casos sin empresa (§10.2) |
| Tests de índices de `users`, si alguno enumera los índices únicos | dos índices nuevos y `users_username_unique` redefinido | se suman nombrándolos |

### 10.2 Tests nuevos o ampliados

| Archivo | Tipo | Cubre |
|---|---|---|
| `tests/unit/identity/roles/maestro-rol.test.ts` (nuevo) | unit | R2 (fila con descripción, los otros tres intactos; la del Administrador sigue «Acceso total al sistema.»), R3 (barrido del literal `Maestro` en `lib/`, `app/`, `components/`, `hooks/` y raíz, sin comentarios: solo `roles.ts`), R4 (el modelo `Role` sin campo de empresa), R17 (barrido de `empresas.consultar`/`empresas.modificar` fuera de `permissions.ts`) |
| `tests/unit/identity/permissions.test.ts` (ampliado) | unit | R5 (presencia de los dos, ningún otro `empresas.*`, los de antes siguen), R6, R7 (párrafo ≤5 líneas con «enmienda», `lib/modules/` y los dos códigos, sin citas; más el caso simétrico sintético), R8, R9 |
| `tests/unit/identity/schema/maestro-migration.test.ts` (nuevo) | unit estático | R20, R21, R22, R26–R28, R36–R39: guardia de duplicados **la primera** sentencia, con `GROUP BY lower("username")`, `HAVING count(*) > 1`, `deleted_at IS NULL` y un `RAISE`; ningún `UPDATE` ni `DELETE` de `users` en el UP; sentencias del UP en orden, literales contra constantes importadas, ninguna sentencia nombra a otro rol en `role_permissions`, códigos de error del disparador; `users_username_unique` del UP = texto leído de QC-4 y del DOWN = texto leído de QC-47; dos índices parciales sin empresa y **ninguno** de nombre de usuario sin empresa; DOWN inverso con `SET NOT NULL` antes de cualquier `DELETE`, sin `CASCADE`. Plantilla: `packer-role-migration.test.ts` y `companies-migration.test.ts` |
| `tests/integration/identity/maestro-migration.int.test.ts` (nuevo) | integración | R21 (UP leído del archivo sobre base sembrada, en transacción revertida: filas exactas, los demás roles intactos; dos veces: mismos conteos), R22 (DOWN sin Maestro: base como antes, con `users_username_unique` otra vez por empresa; con un Maestro: falla y no borra), R26 (usuario sin empresa con rol de empresa: `23502` al insertar y al pasar a `NULL`), R27 (Maestro con empresa: `23514` al insertar y al cambiar a rol Maestro un usuario con empresa), R28 (dos Maestros vivos con el mismo correo en otras mayúsculas o el mismo documento: rechazo; con uno dado de baja: se acepta), R36 (mismo nombre de usuario en dos empresas, en otras mayúsculas, y entre una empresa y un Maestro: `23505`; al renombrar uno existente al de otro: `23505`; dado de baja: se acepta), R37 (mismo correo o documento entre una empresa y un Maestro: se acepta), R38 (UP sobre base sin duplicados: ninguna fila de `users` cambia, comparando antes y después), R39 (en una transacción revertida: se deja `users_username_unique` como en QC-47 —el tramo del DOWN—, se insertan dos usuarios vivos de empresas distintas con el mismo nombre en otras mayúsculas y se ejecuta la guardia del UP leída del archivo: falla, el mensaje contiene el nombre en minúsculas y «2», y ninguna fila de `users` cambió) |
| `tests/unit/errores/…` (el test del catálogo de mensajes, p. ej. `tests/unit/errores/catalogo.test.ts`, ampliado) | unit | R41: `errors.duplicate_username` no contiene «empresa»; `errors.duplicate_email` y `errors.duplicate_document` sí |
| `tests/integration/identity/user-crud.int.test.ts` (ampliado, además de §10.1) | integración | R40: alta y edición en la empresa A con el nombre de usuario de un usuario vivo de la empresa B y con el del Maestro (sembrado en la transacción) → `'username'`, cero filas escritas, fila del objetivo intacta; la respuesta es solo la clave, sin id ni empresa |
| `tests/unit/identity/usuarios/user-service.test.ts` o `user-actions.test.ts` (ampliado) | unit | R40: `DuplicateUsernameError` llega a la acción con su código y ningún otro dato |
| `tests/integration/identity/identity-constraints.int.test.ts` (ampliado) | integración | R26: el caso existente `:1194-1211` sigue verde tal cual, con su `23502` |
| `tests/unit/identity/seed/seed-initial-access.test.ts` (ampliado) | unit | R10 (crea un Maestro sin empresa, `active`, con hash y marcadores; no llama a `createCompany` para él), R11 (Maestro existe: el proveedor no se invoca), R12 (falta variable: lanza nombrándola y **ningún** método de escritura se llamó, ni roles), R13 (política: lanza con reglas, sin la contraseña, nada escrito; `hash` recibe la contraseña y el puerto solo el hash), R15 (Administrador existe y Maestro no: crea solo el Maestro; y al revés), R42 (`countLiveUsersWithUsername` responde `1` → lanza «nombre de usuario… en uso», el mensaje no contiene el valor, ningún método de escritura se llamó; base vacía con `SEED_ADMIN_USERNAME` y `SEED_MAESTRO_USERNAME` iguales salvo mayúsculas → mismo error, nada escrito), R43 (`countLiveUsersWithoutCompanyWithEmail` responde `1` → lanza «correo… en uso», sin valor, nada escrito; correo del Maestro igual al del Administrador → se crean los dos) |
| `tests/unit/identity/seed/initial-access-credentials-env.test.ts` (ampliado) | unit | R12: las tres del Maestro, vacías = ausentes, error con todas y sin valores |
| `tests/unit/identity/seed/deploy-hook.test.ts` (ampliado) | unit | R14 |
| `tests/integration/identity/identity-seed.int.test.ts` (ampliado) | integración | R10 (nombres «Plataforma»/«Inicial» y marcadores), R18 (dos corridas; para **cada** rol de `SEED_ROLES`, `codigosEnBaseDe` = `codigosSembradosDe`; la segunda no crea nada), R4 (una sola fila `Maestro`), R15, R42 (un usuario vivo de otra empresa con el nombre de `SEED_MAESTRO_USERNAME` en otras mayúsculas: el seed lanza y la base queda igual; con ese usuario dado de baja: crea el Maestro), R43 (correo del Maestro igual al de un usuario de empresa: lo crea) |
| `tests/integration/identity/login.int.test.ts` (ampliado, además de R30) | integración | R44: un usuario de la empresa B y el Maestro; cada uno entra con su nombre en otras mayúsculas y la sesión es la suya |
| `tests/guards/guard-autorizacion-por-permiso.test.ts` (ampliado) | guardia | R16 |
| `tests/integration/identity/role-catalog.int.test.ts` (ampliado) | integración | R23: `listAllRoles()` no incluye `Maestro` ni `Administrador` |
| `tests/integration/identity/user-crud.int.test.ts` (ampliado) | integración | R24, R25: alta y edición con el `roleId` del Maestro, actor con `usuarios.modificar` → `ActionNotAllowedError`, cero filas escritas. R1: la lista de la empresa inicial no trae al Maestro; edición, baja y cambio de estado con su id → «no encontrado», sin escribir |
| `tests/unit/identity/session-claims.test.ts` (ampliado) | unit | R32 |
| `tests/unit/identity/resolve-session.test.ts` (ampliado) | unit | R31 (ficha sin empresa + firma `null` → `user` con permisos, `context` `null`), R32 (firma `null`/ficha con empresa y al revés → `null`) |
| `tests/unit/identity/verify-credentials.test.ts` (ampliado) | unit | R30: sin empresa emite ticket con `companyId: null`; contraseña mala, bloqueo y cuenta no activa siguen rechazando igual |
| `tests/integration/identity/login.int.test.ts` y `session-user.int.test.ts` (ampliados) | integración | R30, R31 contra Postgres: el `LEFT JOIN` encuentra al Maestro; la lectura de sesión lo resuelve sin empresa |
| `tests/unit/identity/route-guard-middleware.test.ts` (ampliado) | unit | R31: cookie firmada con `cid: null` → `allow` en ruta privada |
| `tests/unit/identity/maestro-sin-empresa-actions.test.ts` (nuevo) | unit | R29: con `getSessionUser` devolviendo un usuario con **todo** el catálogo y `getSessionContext` `null`, una acción representativa de `inventario`, `pedidos`, `unidades` e `identity` (usuarios) responde no autorizada y el repositorio no se llama. Todos los permisos a propósito: así lo único que falta es la empresa |
| `tests/unit/identity/login-action.test.ts` (ampliado) | unit | R33: permisos `['empresas.consultar','empresas.modificar']` → destino `DASHBOARD_ROUTE` hoy, calculado con las mismas funciones del menú |
| `tests/unit/identity/require-page-permission.test.ts` (ampliado) | unit | R34: usuario con solo `empresas.*` pidiendo una página de `inventario.consultar` → `notFound()` |
| `tests/unit/identity/end-session.test.ts` (ampliado) | unit | R35: claims con `companyId: null` → se registra el cierre y se borra la cookie |

R19 y R20 no llevan test propio: R19 se verifica en la revisión (el diff no toca `e2e/`), R20 lo
hacen cumplir `guard-dependencias-aprobadas` y el test estático de la migración (una sola carpeta
nueva en `db/migrations/`, ningún `CREATE TABLE`).

**Sin E2E (D8).** `CHECKPOINTS.md > Calidad de código` pide E2E para autenticación y permisos. D8 lo
difiere, con el precedente QC-94 → QC-67 y QC-144 → QC-145; el reviewer lo tiene que leer como
decisión humana, no como olvido. Lo pagan QC-162/QC-166 (nota de `requirements.md`, antes pregunta 7).

### 10.3 Trazabilidad `R<n>` → test

| R | Test |
|---|---|
| R1 | `user-crud.int.test.ts` |
| R2, R3, R4 | `maestro-rol.test.ts`; R4 también `identity-seed.int.test.ts` |
| R5, R6, R7, R8, R9 | `permissions.test.ts`; R9 también `seed-initial-access.test.ts` e `identity-seed.int.test.ts` (§2.4) |
| R10 | `seed-initial-access.test.ts`, `identity-seed.int.test.ts` |
| R11, R13, R15 | `seed-initial-access.test.ts`; R15 también `identity-seed.int.test.ts` |
| R12 | `seed-initial-access.test.ts`, `initial-access-credentials-env.test.ts` |
| R14 | `deploy-hook.test.ts` |
| R16 | `guard-autorizacion-por-permiso.test.ts` |
| R17 | `maestro-rol.test.ts` |
| R18 | `identity-seed.int.test.ts` |
| R19 | revisión: `git diff --stat -- e2e/` vacío |
| R20 | `guard-dependencias-aprobadas` + `maestro-migration.test.ts` |
| R21, R22 | `maestro-migration.test.ts`, `maestro-migration.int.test.ts` |
| R23 | `role-catalog.int.test.ts` |
| R24, R25 | `user-crud.int.test.ts` |
| R26 | `maestro-migration.int.test.ts`, `identity-constraints.int.test.ts:1194-1211` |
| R27, R28 | `maestro-migration.int.test.ts` (y el estático) |
| R29 | `maestro-sin-empresa-actions.test.ts` |
| R30 | `verify-credentials.test.ts`, `login.int.test.ts` |
| R31 | `resolve-session.test.ts`, `route-guard-middleware.test.ts`, `session-user.int.test.ts` |
| R32 | `session-claims.test.ts`, `resolve-session.test.ts` |
| R33 | `login-action.test.ts` |
| R34 | `require-page-permission.test.ts` |
| R35 | `end-session.test.ts` |
| R36 | `maestro-migration.int.test.ts`, `identity-constraints.int.test.ts:1433-…` (reescrito), `user-crud.int.test.ts:509-542` (reescritos) |
| R37 | `maestro-migration.int.test.ts`, `identity-constraints.int.test.ts:1380-1431, 1483-1534` (sin cambios), `user-crud.int.test.ts:509-542` (reescritos) |
| R38, R39 | `maestro-migration.test.ts`, `maestro-migration.int.test.ts` |
| R40 | `user-crud.int.test.ts`, `user-service.test.ts`/`user-actions.test.ts` |
| R41 | test del catálogo de errores (`tests/unit/errores/`) |
| R42, R43 | `seed-initial-access.test.ts`, `identity-seed.int.test.ts` |
| R44 | `login.int.test.ts` |

---

## 11. Alternativas descartadas

1. **El Maestro en una «empresa de plataforma» oculta.** Evitaría tocar `users.company_id`, la sesión
   y el login. Descartada: contradice D11 («a ninguna»), y una empresa fantasma aparecería en todo
   lo que liste empresas (QC-162) y en todo filtro por empresa: el Maestro sería, a efectos de datos,
   el Administrador de una empresa más.
2. **Garantía estructural en vez de disparador**: columna `roles.without_company`, copia en `users`,
   FK compuesta `(role_id, role_without_company)` y `CHECK ((company_id IS NULL) =
   role_without_company)`. Declarativa y sin el literal `'Maestro'` en SQL. Descartada: añade dos
   columnas y una FK compuesta que Prisma ve como drift, obliga al seed a mantener la bandera y
   generaliza a «roles sin empresa» algo que hoy es un solo rol; es la infraestructura «por si acaso»
   que `docs/architecture.md > Dominio` rechaza. El disparador tiene precedente en el repo
   (`inventory_movements_check_company`, `product_batches_check_company`).
3. **Contexto de sesión con `companyId: string | null`** en vez de `context: null`. Más explícito,
   pero obliga a tocar las nueve copias de `currentActor()` y cada módulo de negocio para decidir qué
   hacer con `null`; olvidarlo en una sola compila si alguien pone `?? ''`. `context: null` reutiliza
   el camino que ya falla cerrado y no toca ningún módulo de negocio.
4. **Subir la cookie a `v5`.** Descartada: las cookies `v4` vivas siguen siendo válidas bajo el
   esquema nuevo, así que subir la versión solo echaría a todo el mundo sin ganar nada.
5. **Comprobar en el dominio del login que «sin empresa» implica «Maestro»**, comparando el rol.
   Descartada: sería autorizar por nombre de rol (D6), y la base ya lo garantiza (R26, R27).
6. **Rechazar el rol Maestro en el caso de uso** (`create-user.ts`) en vez de en el adaptador. El
   dominio necesitaría el id del Maestro por un puerto nuevo. Se sigue el precedente del
   Administrador: la lectura por nombre vive en el adaptador, dentro de la misma transacción que
   escribe, y el dominio traduce `'action_not_allowed'`.
7. **Solo seed, sin migración de datos.** Descartada por la misma razón que QC-144: la migración
   corre antes del seed en el `build`, y el disparador y los índices tienen que existir aunque el
   seed no corra.
8. **Ampliar `createInitialAdmin` con `companyId: string | null`.** Descartada en §5.2: un solo
   método con empresa opcional deja crear un Administrador sin empresa por un descuido de tipo.
9. **Mantener el nombre de usuario por empresa y pedir la empresa en el login** (o un índice
   parcial solo para los usuarios sin empresa, lo que proponía el spec del 2026-09-24). Resolvería la
   ambigüedad del login sin tocar la unicidad de QC-47. Descartada por D13: el humano fijó que el
   nombre de usuario es único en todo el sistema, y pedir empresa al entrar cambiaría la pantalla de
   login, que esta ficha no toca.
10. **Renombrar automáticamente los nombres de usuario repetidos en la migración** (sufijo con la
    empresa, por ejemplo). Haría que el UP nunca fallara. Descartada (propuesta de R39): cambiaría en
    silencio la credencial con la que alguien entra, y esa persona no podría entrar sin que nadie se
    lo dijera. Fallar con la lista deja la decisión a un humano.
11. **Un índice nuevo con otro nombre** (`users_username_global_unique`) y borrar el de QC-47. Da igual
    para Postgres, pero rompe los comentarios y tests que nombran `users_username_unique` como «el
    índice del nombre de usuario» sin que nada cambie de fondo. Se conserva el nombre.

---

## 12. Dependencias de terceros

Ninguna (D9, R20). No hay librería que evaluar.
