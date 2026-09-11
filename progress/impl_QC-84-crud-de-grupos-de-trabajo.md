# QC-84 — crud-de-grupos-de-trabajo · bitácora de implementación

> Zona `backend` · Rama `feature/QC-84-crud-de-grupos-de-trabajo` · worktree
> `.worktrees/QC-84-crud-de-grupos-de-trabajo/` · depends_on QC-83 (mergeada).
> Spec aprobado por el humano el 2026-09-11 (F1.4). Backend puro: no se toca `app/` ni `components/`.

## Entorno de la feature

- `.env` propio del worktree apuntando a la base **`QuimiCloude_QC84`** (misma credencial y host que
  el repo principal; solo cambia el nombre de la base). `DATABASE_URL` y `DIRECT_URL` iguales.
- Base creada y `pnpm exec prisma migrate deploy` aplicado: **todas** las migraciones del árbol,
  incluidas `20260908210000_work_groups_and_members` (QC-83) y `20260911120000_order_assignments`
  (QC-86). `pnpm exec prisma generate` después.
- **Regla aprendida en QC-86 y aplicada aquí**: tras **cada** `git merge origin/dev` se vuelven a
  correr `prisma migrate deploy` y `prisma generate` contra esta base. Sin eso, una migración ajena
  que llega por el merge deja la base de la feature atrás y la integración cae con
  `The column '…' does not exist`.

## T0 — Verificación de la base heredada (los ocho puntos)

| # | Qué | Evidencia |
| --- | --- | --- |
| 1 | `model WorkGroup` / `model WorkGroupMember` | `db/schema.prisma` L308 y L367, completos. Índice único **parcial, funcional y compuesto** en `db/migrations/20260908210000_work_groups_and_members/migration.sql` L118: `CREATE UNIQUE INDEX "work_groups_name_unique" ON "work_groups" ("company_id", lower("name_normalized")) WHERE "deleted_at" IS NULL`. **No se crea ni se modifica nada de esto** |
| 2 | `normalizeWorkGroupName` | `lib/modules/identity/domain/work-group-name.ts` L14, reexportado por el barril en `lib/modules/identity/index.ts` L32. Única definición (R13) |
| 3 | `Actor` y `requirePermission` | `lib/modules/identity/domain/actor.ts` L27 (`Actor`) y L45 (`requirePermission`). `requireAnyPermission` existe en L64 y **no se usa** en esta ficha |
| 4 | `PERMISSIONS` con **quince** entradas | `lib/modules/identity/domain/permissions.ts`: quince `code:`, de `dashboard.consultar` (L40) a `asignaciones.modificar` (L125); `usuarios.consultar` L106 y `usuarios.modificar` L112. **El archivo no se toca** (R47) |
| 5 | `effectiveAccountStatus` | `lib/modules/identity/domain/effective-account-status.ts` L66 |
| 6 | Contrato de listado de QC-57 ya en `identity` | `domain/list-query.ts`, `domain/page.ts`, `ports/list-query-log.ts` existen. **No se copia nada** y por eso `tests/guards/guard-contrato-listados.test.ts` no se toca |
| 7 | Catálogo de errores con **32** códigos | `tests/unit/errores/catalogo.test.ts` L45 `expect(ERROR_CODES).toHaveLength(32)` antes de esta ficha |
| 8 | `model OrderAssignment` con `work_group_id` y `work_group_name` | `db/schema.prisma` L1049, columnas L1053 y L1054. Es contra esas columnas que se escribe el test de R39 (T16) |

Los ocho verificados. **Nada de esto se re-crea.**

## Tests que consultan git — inventario previo, y su baseline

Antes de tocar nada se corrieron los **22** archivos de `tests/**` que consultan git (buscados por las
dos formas: `git merge-base origin/dev HEAD` y `git diff … origin/dev...HEAD`, además de `execSync`).

Resultado del baseline, con la rama **sin ningún commit propio** todavía:

- **67 archivos en verde, 2 en rojo** — y los dos rojos lo están **por rama vacía**, no por esta ficha:
  - `tests/unit/recetas-ui/recipe-route-contract.test.ts` L819 — «el rango git `origin/dev...HEAD` no
    estaba disponible: este caso no ha comprobado nada: expected 0 to be greater than 0».
  - `tests/unit/recetas/module-contract.test.ts` L325 — misma aserción de no-vacuidad.

  Los dos **anclan la no-vacuidad del diff** para no darse por verdes sin haber medido. Con la rama
  recién nacida de `origin/dev` el diff es vacío y la aserción muerde. Se vuelven a correr al cerrar
  la implementación, ya con commits propios: deben quedar en verde **sin tocar el archivo**.
- Los que vigilan `lib/modules/identity/**` con lista blanca —`account-status-scope.test.ts`,
  `qc78-alcance.test.ts`, `roles/scope.test.ts`, `usuarios/scope.test.ts`,
  `navegacion/qc75-convenciones.test.ts`— son los que esta ficha puede activar al añadir archivos
  nuevos bajo `lib/modules/identity/`. Se vuelven a correr al final. Si alguno se pone rojo se
  **retensa nombrando la excepción**, nunca relajando la aserción.

## Tanda A — T1, T2, T3, T4 (cerrada)

Cuatro commits, uno por task:

| Commit | Task | Qué |
| --- | --- | --- |
| `4e3a774` | **T1** | `feat(QC-84): el catalogo unico gana los siete codigos de los grupos de trabajo` |
| `f18a143` | **T2** | `feat(QC-84): las siete clases de error de grupos, al final de errors.ts` |
| `702c947` | **T4** | `feat(QC-84): las dos listas blancas de campos consultables de los grupos` |
| `941db4e` | **T3** | `feat(QC-84): esquemas del borde y tipos de salida de los grupos de trabajo` |

Archivos:

- `lib/modules/errores/domain/error-codes.ts` — **SE AMPLÍA**: los siete códigos de `design.md > 7.1`
  (`work_group_not_found`, `work_group_duplicate_name`, `work_group_member_exists`,
  `work_group_member_exists_pending`, `work_group_member_exists_inactive`,
  `work_group_member_exists_blocked`, `work_group_member_not_found`). **32 → 39.**
- `lib/modules/errores/domain/error-catalog.ts` — **SE AMPLÍA**: sus siete claves y sus siete textos,
  sin que dos códigos compartan texto (QC-70 R4).
- `tests/unit/errores/catalogo.test.ts` — **ajeno, actualizado en la MISMA tanda** (`design.md > 7.3`):
  `toHaveLength(32)` → `toHaveLength(39)`. **Ninguna expectativa eliminada ni debilitada.**
- `lib/modules/identity/domain/errors.ts` — **SE AMPLÍA**: las siete clases al final, las diez de
  QC-66 intactas.
- `lib/modules/identity/domain/work-group-input.ts`, `work-group-view.ts`,
  `work-group-queryable.ts` — **NUEVOS**.
- `tests/unit/identity/grupos/errors.test.ts`, `…/work-group-input.test.ts` — **NUEVOS**.

**El nombre del grupo no cabe en el mensaje** (`design.md > 7.2`, hallazgo 2 de `> 12`): el catálogo de
QC-70 no interpola y `diagnostic` va solo al log del servidor. Se entrega la sustancia —**tres códigos
distintos**, uno por motivo de ocultación— y el nombre lo pone la pantalla, que es QC-85.

### Tres cosas del entorno del worktree, encontradas en la tanda A y ya resueltas

Ninguna es un fallo del código de la feature; se anotan porque el próximo que entre al worktree se
las encuentra igual:

1. **`pnpm run typecheck` caía con `app/layout.tsx(43,56): error TS2304: Cannot find name
   'LayoutProps'`** porque el worktree recién montado no tenía `.next/types`. Se resuelve con
   `pnpm exec next typegen`. `.next/` está en `.gitignore`, así que no viaja en el diff.
2. **La base `QuimiCloude_QC84` estaba migrada pero SIN SEMBRAR**, y por eso
   `tests/integration/identity/user-crud.int.test.ts` y `last-administrator.int.test.ts` fallaban con
   «faltan los roles base … `pnpm run db:seed`». Se corrió `pnpm run db:seed` (2 roles, 11 permisos,
   empresa y usuario inicial) y quedaron verdes. **`migrate deploy` no basta: hace falta el seed.**
3. **Los dos rojos del baseline se explican solos**: `tests/unit/recetas/module-contract.test.ts` y
   `tests/unit/recetas-ui/recipe-route-contract.test.ts` se autodeclaran rojos mientras la rama no
   tenga **ningún** commit sobre `origin/dev`. Con el primer commit pasan. **No se tocan.**

Gate real de la tanda A, tal como salió:

```
$ pnpm run typecheck      -> sin salida (verde)
$ pnpm run lint           -> sin salida (verde)
$ pnpm exec vitest related --run lib/modules/errores/domain/error-codes.ts
 Test Files  206 passed (206)
      Tests  2967 passed | 5 skipped (2972)
$ pnpm exec vitest related --run <los 8 archivos tocados>
 Test Files  207 passed (207)
      Tests  3013 passed | 5 skipped (3018)
```

**Ningún segundo archivo rojo por el ripple del catálogo** (`design.md > 7.3` medía uno y era uno).

## Tanda B — T5, T6, T7 (cerrada)

| Commit | Task | Qué |
| --- | --- | --- |
| `2f85104` | **T5** | `feat(QC-84): el puerto de grupos de trabajo, con la empresa como primer parametro` |
| `4b21207` | **T6** | `feat(QC-84): los cinco casos de uso de escritura de grupos de trabajo` |
| `52a5961` | **T7** | `feat(QC-84): los dos casos de uso de lectura, con el filtro y el corte en el dominio` |

Archivos **nuevos**: `lib/modules/identity/ports/work-group-repository.ts`; y en
`lib/modules/identity/domain/`: `create-work-group.ts`, `rename-work-group.ts`,
`delete-work-group.ts`, `add-work-group-member.ts`, `remove-work-group-member.ts`,
`list-work-groups.ts`, `list-work-group-members.ts`.

### Dos desviaciones del literal de `design.md > 5`, deliberadas y comentadas en el código

Se anotan porque el reviewer las va a cruzar contra el diseño, y porque las dos **sirven** a un
requisito en vez de apartarse de él:

1. **`listAliveInCompany` recibe `ListQuery`, no `SanitizedListQuery`.** En
   `identity/domain/list-query.ts`, `SanitizedListQuery` es el par `{ query, ignored }` que
   *devuelve* `sanitizeListQuery`; lo saneado es su `.query`. El literal del diseño **no compilaba**.
   Mismo reparto que `UserAdminRepository.listAliveInCompany`. **No cambia quién sanea**: sigue
   saneando el caso de uso antes de llamar al puerto.
2. **`already_member` lleva `account: MemberCandidate` —estado crudo y `lockedUntil`— en vez de
   `hiddenBy: MemberBlockReason | null`.** Es lo que **exige** `design.md > 5.1`: «`hiddenBy` lo
   calcula el DOMINIO». Si el adaptador devolviera el motivo ya cocinado, la regla del estado
   efectivo tendría una **segunda copia** fuera de `effectiveAccountStatus`, que es justo lo que
   QC-78 R7 prohíbe. `MemberBlockReason` sigue exportado por el puerto y es lo que **produce** el
   dominio.

### Las siete factories, tal como quedaron

```
createCreateWorkGroup({ workGroups })        (actor, input) -> Promise<{ id }>
createRenameWorkGroup({ workGroups })        (actor, input) -> Promise<void>
createDeleteWorkGroup({ workGroups, now? })  (actor, input) -> Promise<void>
createAddWorkGroupMember({ workGroups, now? })    (actor, input) -> Promise<void>
createRemoveWorkGroupMember({ workGroups })       (actor, input) -> Promise<void>
createListWorkGroups({ workGroups, log })         (actor, input) -> Promise<Page<WorkGroupRow>>
createListWorkGroupMembers({ workGroups, pagination, log? })
                          (actor, workGroupId, input, now) -> Promise<Page<WorkGroupMemberRow>>
```

`requirePermission` es la **primera línea** de las siete, antes de zod y antes del puerto:
`usuarios.modificar` en las cinco escrituras, `usuarios.consultar` en las dos lecturas.
`PaginationPolicy` —`{ toOffsetLimit, buildPage }`— es estructural sobre `lib/shared/pagination.ts`
y lo ata `lib/composition`: **el dominio no importa `lib/shared`** (R44, `design.md > 5.3`).

Gate de la tanda B: `typecheck` y `lint` verdes; `vitest related` sin archivos (los tests de dominio
son T11–T13 y T19, de otra tanda); `vitest run guard` → **29 archivos, 313 tests en verde**.

### Observación abierta, NO decidida (no la cierra esta ficha)

`normalizeWorkGroupName` puede devolver **cadena vacía** para un nombre compuesto solo de signos
(p. ej. `"!!!"`), y `zod` lo acepta porque `name` no está vacío. **Ningún requisito de QC-84 ni de
QC-83 dice qué debe pasar en ese caso**, y esta ficha **no lo inventa**: se deja anotado como
desconocido, no se rellena con un supuesto (regla 6 de `CLAUDE.md`). No bloquea.

## Tanda C — T8, T9, T10 (cerrada)

| Commit | Task | Qué |
| --- | --- | --- |
| `19e59ab` | **T8** | `feat(QC-84): el adaptador Prisma de grupos de trabajo (T8)` |
| `ca9747b` | **T10** | `feat(QC-84): el contrato del modulo y el punto de composicion (T10)` |
| `0b51214` | **T9** | `feat(QC-84): las siete Server Actions de los grupos de trabajo (T9)` |

T10 se commiteó **antes** que T9 a propósito: las actions consumen la fachada, así cada commit
compila por sí solo.

Archivos: **nuevos**
`lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts` (el **único** archivo de la
feature con `@prisma/client`), `lib/modules/identity/adapters/driving/work-group-actions.ts`,
`tests/unit/identity/grupos/work-group-actions.test.ts`; **modificados**
`lib/modules/identity/index.ts` (bloque nuevo al final, **solo `./domain`**),
`lib/composition/index.ts` (bloque nuevo al final, sin reordenar nada) y
`tests/unit/composition/identity-facade.test.ts` (bloque aditivo).

**Las siete claves de la fachada `identity`**: `createWorkGroup`, `renameWorkGroup`,
`deleteWorkGroup`, `addWorkGroupMember`, `removeWorkGroupMember`, `listWorkGroups`,
`listWorkGroupMembers`.

**Las siete Server Actions** (`work-group-actions.ts`, **NO reexportadas por el barril**, R44):
`createWorkGroupAction`, `renameWorkGroupAction`, `deleteWorkGroupAction`,
`addWorkGroupMemberAction`, `removeWorkGroupMemberAction` —las cinco con **`FormData`**— y
`listWorkGroupsAction(query)`, `listWorkGroupMembersAction(workGroupId, query)` —las dos con
argumentos ya tipados— (R42).

### Cinco decisiones del adaptador que el reviewer va a querer ver justificadas

1. **`listMembersAliveInCompany` hace DOS consultas** (pertenencias y luego `users`), no un
   `include`: `WorkGroupMember` **no declara ninguna relación** en `db/schema.prisma` —sus dos FK
   son **compuestas** y están escritas a mano en la migración de QC-83—, así que Prisma no las
   conoce. El orden `last_names, first_names, id` (R22) lo pone la consulta de `users`.
2. **La traducción del `P2002` mira columna Y nombre de índice a la vez**:
   `['name_normalized','work_groups_name_unique']` para el nombre y
   `['work_group_members_pkey','work_group_id','user_id']` para la pertenencia. El motivo es
   **regla 6**: `meta.target` trae columnas (QC-25/QC-76), pero `work_groups_name_unique` es además
   **funcional** (`lower(name_normalized)`) y qué devuelve el conector en ese caso **no está escrito
   en ningún sitio**, así que no se supuso: se cubren las dos formas y **cualquier `P2002` que no
   case con ninguna marca se relanza** en vez de tragarse. T14 y T15 lo confirman contra Postgres
   real.
3. `addMemberAliveInCompany` y `removeMemberAliveInCompany` corren en `prisma.$transaction`; el
   `INSERT` fallido **aborta** la transacción, así que devolver `already_member` **no confirma
   ninguna escritura** (R30, R31).
4. El listado de grupos **busca por la columna `name`** (insensible a mayúsculas, vía
   `insensitiveContainsCondition` de `list-query-sql.ts`), no por `nameNormalized`.
5. La paginación de miembros se cableó como `PaginationPolicy = { toOffsetLimit, buildPage }`
   (`workGroupMemberPagination`), y el test de fachada demuestra el **10 por defecto y el 25 de
   tope** de punta a punta.

Gate de la tanda C: `typecheck` y `lint` verdes; `vitest related` sobre los cuatro archivos tocados
→ **189 archivos, 2754 tests en verde**; `vitest run guard` → **29 archivos, 313 en verde**; y
`git diff --stat HEAD~3 -- db/ app/ components/ middleware.ts e2e/` → **vacío** (R46, R48).

## Tanda E — T14, T15, T16 (integración contra Postgres real, cerrada)

| Commit | Task | Archivo | Casos |
| --- | --- | --- | --- |
| `ce98d8a` | **T14** | `tests/integration/identity/work-group-crud.int.test.ts` | 18 |
| `3661915` | **T15** | `tests/integration/identity/work-group-membership.int.test.ts` | 13 |
| `a62c369` | **T16** | `tests/integration/identity/work-group-assignments.int.test.ts` | 5 |

Cada commit toca **un solo archivo**. Ningún archivo de producción se tocó.

### La desviación del precedente, y por qué NO usarla habría dado un verde falso

`tasks.md` manda seguir `work-groups-constraints.int.test.ts`, que aísla con
`prisma.$transaction` + `RollbackSignal`. **Ese patrón no sirve aquí**, y el motivo es de fondo:
aquel archivo escribe con el `tx` que el propio test abre, mientras que `work-group-prisma.ts` habla
con el cliente Prisma **global**. Una llamada a `identity.deleteWorkGroup(...)` dentro del callback
de `prisma.$transaction` correría en **otra conexión del pool** —confirmaría de inmediato y el
rollback no la alcanzaría—, y los tres métodos que abren su **propia** transacción (`addMember`,
`removeMember`, `listMembers`) se quedarían esperando un bloqueo que tiene la transacción del test.
Se usó **construcción y limpieza propias** (empresa efímera con `randomUUID`, borrada en un
`finally`, con `afterAll` que afirma que no sobrevivió ninguna), que es el patrón de
`user-crud.int.test.ts` (QC-66 T16) y está razonado allí por exactamente este motivo.

**Lo que sí se conservó del precedente**: las dos empresas efímeras y el **SQLSTATE leído como
campo**. Para R12 no bastaba el `code` del caso de uso, así que se baja un escalón: un `INSERT`
crudo del nombre duplicado, dentro de una transacción que siempre se deshace, a través de una
función `pg_temp.qc84_try` de PL/pgSQL cuyo bloque `EXCEPTION` lee `GET STACKED DIAGNOSTICS`. Afirma
`sqlState === '23505'` **y** `constraint === 'work_groups_name_unique'` —el índice **parcial**—,
**nunca el texto** (en esta máquina Postgres responde en español).

### T15 corrido TRES VECES SEGUIDAS, como pide su criterio de hecho

```
=== corrida 1   Test Files 1 passed (1)   Tests 13 passed (13)   4.56s
=== corrida 2   Test Files 1 passed (1)   Tests 13 passed (13)   4.66s
=== corrida 3   Test Files 1 passed (1)   Tests 13 passed (13)   5.27s
```

La carrera de **R32** va con **dos conexiones de verdad**: dos `identity.addWorkGroupMember`
lanzados a la vez con `Promise.allSettled`, cada uno abriendo su propia `$transaction` sobre su
propia conexión del pool, compitiendo por la PK `(work_group_id, user_id)`. En las tres corridas:
exactamente **una** cumplida, **una** rechazada con `work_group_member_exists`, y la tabla con **una
sola fila**.

### El caso de sensibilidad de T16 (R39), ejecutado de verdad

Se mutó `softDeleteAliveInCompany` en el adaptador Prisma añadiendo, tras el `UPDATE` de
`deleted_at`:

```sql
UPDATE "order_assignments" SET "work_group_id" = NULL, "work_group_name" = NULL
WHERE "work_group_id" = ...
```

**Con la mutación: `Tests 2 failed | 3 passed (5)`** — caen los dos casos de R39, con el diff
mostrando `work_group_id` / `work_group_name` pasando del uuid y de `"Turno noche"` a `null`.
Revertido el archivo, vuelven los **5 verdes**. El test afirma sobre **todas** las columnas de
`order_assignments`, **`updated_at` incluida** —es por donde se colaría un toque que reescribiera el
mismo valor—, y cada caso comprueba además que la operación **sí ocurrió** sobre el grupo (el nombre
cambió, `deletedAt` no es nulo), para que el verde **no pueda venir de que no pasó nada**.

Gate de la tanda E: `typecheck` y `lint` verdes; los tres archivos → **3 archivos, 36 tests en
verde, 6.45s**. **Ningún defecto real**: ningún test tuvo que ajustarse para pasar.

**Nota sobre R11**: el caso apoya el «no hay forma de crear en otra empresa» en que
`createWorkGroupSchema` es **`strictObject`** —mandar `companyId` devuelve `invalid_input`, no se
ignora en silencio—. Se dejó explícito porque un `object` normal haría pasar ese test igual **sin
dar la garantía**.

## Los dos rojos del baseline, resueltos (y por qué no eran de esta ficha)

Con la rama ya con commits propios se volvieron a correr los dos que el baseline dejó en rojo:

```
$ pnpm exec vitest run tests/unit/recetas/module-contract.test.ts \
                       tests/unit/recetas-ui/recipe-route-contract.test.ts
 Test Files  2 passed (2)
      Tests  30 passed (30)
```

**Verdes, y sin haber tocado ni una línea de ninguno de los dos.** Eran exactamente lo que el
baseline diagnosticó: aserciones de **no-vacuidad del diff** que muerden cuando la rama todavía no
tiene ningún commit sobre `origin/dev`. Queda anotado para que el reviewer no lo lea como un rojo
heredado ni como deuda.

## Tanda D — T11, T12, T13, T19 (tests de dominio, cerrada)

| Commit | Task | Archivo | Casos |
| --- | --- | --- | --- |
| `c096398` | **T11** | `tests/unit/identity/grupos/authorization.test.ts` | 10 |
| `8627d05` | **T12** | `…/work-group-service.test.ts` + `…/add-member-errors.test.ts` | 21 + 6 |
| `1b61c4b` | **T13** | `…/members-filter.test.ts` | 8 |
| `8149cf1` | **T19** | `…/members-pagination.test.ts` | 6 |

**Cero cambios en producción**: `git diff HEAD -- lib db` vacío al cerrar.

### Las cuatro pruebas de mutación, ejecutadas de verdad

No basta con que el test pase: tiene que **caer al mutar** lo que vigila. Se mutó a mano, se vio el
rojo y se revirtió (con `git status` de `lib/` limpio después de cada una):

| Mutación | Dónde | Resultado |
| --- | --- | --- |
| Unificar dos de los cuatro códigos (`inactive` → `WorkGroupMemberExistsPendingError`) | `domain/add-work-group-member.ts` | **ROJO**, 2 de 6 en `add-member-errors.test.ts` |
| Filtro por comparación directa: `isVisible` → `candidate.accountStatus === 'active'` | `domain/list-work-group-members.ts` | **ROJO**, 5 de 8 en `members-filter.test.ts`, **incluidos el de `pending` y el de la bloqueada** |
| Contar **antes** de filtrar: `visible.length` → `candidates.length` | `domain/list-work-group-members.ts` | **ROJO**, el caso del **total** de T19 (`total: 12`, `totalPages: 2` donde hay 8 y 1) |
| Quitar el desempate por identificador del orden que entrega el puerto | doble del puerto, caso del recorrido de T19 | **ROJO**: «alguien salio en dos paginas: expected 22 to be 23» |

La segunda mutación es la que demuestra el **segundo precio** del humano de verdad: con el `WHERE
account_status = 'active'` ingenuo, **Bruno** (columna `blocked`, plazo **vencido**) desaparecía y
**Carla** (columna `active`, plazo **vigente**) aparecía. Es exactamente lo que `design.md > 9.1`
descartó, y ahora hay un test que lo impide.

La cuarta mutación vive en el `ORDER BY` del **adaptador**, no en el dominio, así que además quedó
escrita como **contraprueba ejecutable permanente** (`R53 — CONTRAPRUEBA…`): un doble que simula el
orden **sin** `id` y afirma que entonces una homónima sale **dos veces** y la otra **ninguna**.

### Los dos requisitos que son el corazón de la ficha, verificados

- **R19/R20/R21**: el desbloqueo se logra **SOLO moviendo `now`**. Los cinco métodos de escritura
  del puerto son dobles que **lanzan si los llaman** y **no sonó ninguno** (R23).
- **R30/R31**: el «por qué no se ve» sale de `effectiveAccountStatus` —**el mismo doble** pasa de
  `work_group_member_exists_blocked` a `work_group_member_exists` con solo **adelantar el reloj**—.
  Los cuatro `code` son cuatro valores distintos y ninguno de los tres ocultos es el del visible.

Gate de la tanda D: `typecheck` y `lint` verdes; `vitest related` sobre los 5 archivos → **51 en
verde**; `vitest run tests/unit/identity/grupos` → **8 archivos, 164 tests en verde**.

**Ningún defecto real en el dominio.** Se corrigieron **dos expectativas del test**, no el código:
`normalizeWorkGroupName` delega en `normalizeKey`, que además de bajar caja y quitar acentos
**elimina todo lo que no sea `[a-z0-9]`** —espacios incluidos—, así que `'Turno Nocturno Ñandú'`
normaliza a `turnonocturnonandu`; y un conteo de fixture en T19.

## T17 — El test de alcance (cerrada)

Commit `84c6a45` — `test(QC-84): el alcance de la ficha, medido contra la base de fusion (T17)`.
Archivo nuevo `tests/unit/identity/grupos/scope.test.ts` (**18 casos**).

**Rango**: base de fusión (`git merge-base origin/dev HEAD`) **más el árbol de trabajo**, igual que
`usuarios/scope.test.ts` y `roles/scope.test.ts`. **La no-vacuidad está anclada en las dos
direcciones**: si el rango no resuelve → **rojo ruidoso**; si el diff está vacío o la rama es ajena
→ **`ctx.skip` ruidoso**, **nunca verde**. La señal de rama es **conjuntiva**
(`create-work-group.ts` **y** `specs/QC-84-.../`) para no confundirse con QC-85 ni QC-86.

### Las 19 pruebas de mutación, una por aserción, todas ROJAS al violar y revertidas

| # | Mutación | Resultado |
| --- | --- | --- |
| M1 | `'order_assignments'` en `delete-work-group.ts` | ROJO (R50 **y** R45) |
| M2 | `prisma.orderAssignment` en el adaptador driven | ROJO (R50) |
| M3 | `'@/lib/modules/asignaciones'` en `rename-work-group.ts` | ROJO (R50) |
| M4 | identificador nuevo `'grupo_id'` en `work-group-view.ts` | ROJO (R45) |
| M5 | `s === 'active'` en `list-work-group-members.ts` | ROJO (R13/R19) |
| M6 | `.toLowerCase()` propio en `create-work-group.ts` | ROJO (R13) |
| M7 | literal `'Administrador'` en `work-group-actions.ts` | ROJO (R4) |
| M8 | migración nueva bajo `db/migrations/` | ROJO (R46) |
| M9 | `app/(private)/mutacion-qc84/page.tsx` | ROJO (R48) |
| M10 | `package.json` tocado | ROJO (R49) |
| M11 | `db/schema.prisma` tocado | ROJO (R46, los dos casos) |
| M12 | `lib/composition/index.ts` nombra `asignaciones` | ROJO (R50) |
| M13 | `PERMISOS_ESPERADOS` a 16 | ROJO (R47: cuenta el catálogo **real, importado**) |
| M14 | filtro de códigos nuevos apuntado a `'usuarios.'` | ROJO (R47) |
| M15 | `CANDIDATAS_DESCARTADAS` apuntada a `zod` | ROJO (R49, lee el manifiesto) |
| M16 | un archivo de la lista con el nombre mal escrito | ROJO en 5 casos |
| M17 | señal de rama con `\|\|` en vez de `&&` | ROJO (deja de discriminar QC-85/QC-86) |
| M18 | `RANGO` a una rama inexistente | ROJO en 6 casos: «no puedo mirar» **no** es verde ni skip |
| M19 | archivo nuevo con `account_status` (sobre el retensado) | ROJO: la lista cerrada sigue siendo **IGUALDAD** |

**Hallazgo durante las mutaciones**: el ancla positiva de la normalización **no podía ser**
`work-group-name.ts`, porque `normalizeWorkGroupName` **solo delega** (`return normalizeKey(name);`).
El ancla de patrones es `normalize-key.ts`, y se añadió una aserción extra de que la definición
pública **sigue delegando** en él en vez de tener la suya.

### El test ajeno que se puso rojo, y cómo se retensó

`tests/unit/identity/account-status-scope.test.ts` **ya estaba rojo en la rama antes de T17** —lo
provocaron T1–T16, no el test nuevo—: su `SITIOS_PERMITIDOS` se compara con **igualdad** y QC-84
añade **seis** archivos a `lib/modules/identity/**` que nombran el estado de cuenta.

Se **retensó NOMBRANDO LA EXCEPCIÓN** en un bloque rotulado —que es como las fichas se enmiendan
entre sí en ese archivo (bloques de QC-78 y QC-66)—, con el requisito que autoriza a cada uno:

- `list-work-group-members.ts` y `add-work-group-member.ts` **llaman** a `effectiveAccountStatus`
  (R19 y R31);
- `work-group-repository.ts` declara el estado **crudo** y el plazo en su tipo de salida;
- `work-group-prisma.ts` lo trae en su `select`;
- `work-group-queryable.ts` y `errors.ts` solo lo **nombran al explicar la frontera**.

**No se relajó ningún `expect`**: la lista sigue **cerrada** y comparada con **igualdad**, y **M19
lo demuestra** (un archivo nuevo no listado la pone roja). Los otros cuatro del aviso
—`qc78-alcance`, `roles/scope`, `usuarios/scope`, `navegacion/qc75-convenciones`— quedaron
**verdes sin tocar nada**.

**Corrección de higiene del diff hecha por el implementer**: el retensado se escribió convirtiendo
el archivo entero de CRLF a LF, lo que producía un diff de **1114 líneas** para un cambio real de
**34**. Se restauraron los finales de línea originales y se enmendó el commit: ahora el diff dice
`account-status-scope.test.ts | 34 +`, que es la verdad. Verificado verde después
(`10 archivos, 191 tests`).

Gate de T17: `typecheck` y `lint` verdes; `tests/unit/identity/grupos` → **9 archivos, 182 tests**;
los cinco del aviso → **5 archivos, 64 pasados, 18 saltados** (los `skipped` son casos de rama de
QC-65/QC-78/QC-66/QC-94 que **saltan ruidosamente por no ser su rama**: preexistente y esperado).

---

# T18 — Trazabilidad y cierre

## Archivos creados y modificados (las cinco tandas)

### Produccion — NUEVOS (13)

| Archivo | Que |
| --- | --- |
| `lib/modules/identity/domain/work-group-input.ts` | Esquemas `zod` del borde (`strictObject`) |
| `lib/modules/identity/domain/work-group-view.ts` | `WorkGroupRow`, `WorkGroupMemberRow` |
| `lib/modules/identity/domain/work-group-queryable.ts` | Las dos listas blancas |
| `lib/modules/identity/domain/create-work-group.ts` | Caso de uso |
| `lib/modules/identity/domain/rename-work-group.ts` | Caso de uso |
| `lib/modules/identity/domain/delete-work-group.ts` | Caso de uso |
| `lib/modules/identity/domain/add-work-group-member.ts` | Caso de uso (R30/R31) |
| `lib/modules/identity/domain/remove-work-group-member.ts` | Caso de uso |
| `lib/modules/identity/domain/list-work-groups.ts` | Caso de uso |
| `lib/modules/identity/domain/list-work-group-members.ts` | Caso de uso (R19-R23, R51-R54) |
| `lib/modules/identity/ports/work-group-repository.ts` | El puerto unico |
| `lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts` | **Unico** archivo con `@prisma/client` |
| `lib/modules/identity/adapters/driving/work-group-actions.ts` | Las siete Server Actions |

### Produccion — AMPLIADOS (5, todos con bloque nuevo al final, sin reordenar nada)

`lib/modules/identity/domain/errors.ts` · `lib/modules/identity/index.ts` ·
`lib/composition/index.ts` · `lib/modules/errores/domain/error-codes.ts` ·
`lib/modules/errores/domain/error-catalog.ts`

### Tests — NUEVOS (12)

`tests/unit/identity/grupos/`: `errors.test.ts`, `work-group-input.test.ts`,
`work-group-actions.test.ts`, `authorization.test.ts`, `work-group-service.test.ts`,
`add-member-errors.test.ts`, `members-filter.test.ts`, `members-pagination.test.ts`, `scope.test.ts`
· `tests/integration/identity/`: `work-group-crud.int.test.ts`,
`work-group-membership.int.test.ts`, `work-group-assignments.int.test.ts`

### Tests AJENOS tocados (3, los tres ampliados, ninguna expectativa debilitada)

- `tests/unit/errores/catalogo.test.ts` — `toHaveLength(32)` a `(39)`, el ripple **medido** de
  `design.md > 7.3`, hecho **en la misma tanda** que el codigo.
- `tests/unit/identity/account-status-scope.test.ts` — **retensado nombrando la excepcion**; la
  lista sigue cerrada y comparada con igualdad (M19 lo demuestra).
- `tests/unit/composition/identity-facade.test.ts` — bloque aditivo al final.

### Lo que NO se toco, verificado con `git diff` contra la base de fusion

`db/schema.prisma`, `db/migrations/`, `app/`, `components/`, `e2e/`, `middleware.ts`,
`package.json` da **diff vacio**. `lib/modules/identity/domain/permissions.ts` intacto, el catalogo
sigue con **quince** entradas. `lib/modules/asignaciones/**` y `lib/modules/pedidos/**` intactos
(el test de R39 los **lee** desde `tests/`).

## Mapa `R<n> -> test` — los 54, ninguno sin test

| R | Que exige | Test que lo cierra |
| --- | --- | --- |
| **R1** | Permiso como primera linea de las siete | `grupos/authorization.test.ts` |
| **R2** | Falla cerrado, sin leer ni escribir | `grupos/authorization.test.ts` |
| **R3** | Sin implicacion entre los dos permisos | `grupos/authorization.test.ts` (permiso cruzado) |
| **R4** | La decision no depende del nombre del rol | `grupos/authorization.test.ts` + `grupos/scope.test.ts` (M7) |
| **R5** | El actor entra por parametro | `grupos/authorization.test.ts` |
| **R6** | Actor de las dos caras de la sesion | `grupos/work-group-actions.test.ts` |
| **R7** | RLS habilitada y forzada, y no autoriza | `guard-rls-force.test.ts` (existente) + `grupos/scope.test.ts` |
| **R8** | Acotado a la empresa del actor | `grupos/work-group-service.test.ts` + `work-group-crud.int.test.ts` |
| **R9** | Grupo dado de baja igual a inexistente | `grupos/work-group-service.test.ts` + `work-group-crud.int.test.ts` |
| **R10** | Crear persiste nombre, normalizado, empresa y baja vacia | `work-group-crud.int.test.ts` + `work-group-service.test.ts` |
| **R11** | La empresa sale del actor; el esquema no la admite | `grupos/work-group-input.test.ts` (`strictObject`) + `work-group-crud.int.test.ts` |
| **R12** | Duplicado por el indice unico parcial, `code` estable | `work-group-crud.int.test.ts` (**SQLSTATE 23505** + `work_groups_name_unique`) |
| **R13** | Una sola definicion de «mismo nombre» | `grupos/work-group-service.test.ts` + `grupos/scope.test.ts` (M5, M6) |
| **R14** | `zod` en el borde; nombre vacio se rechaza | `grupos/work-group-input.test.ts` |
| **R15** | Dos empresas pueden tener el mismo nombre | `work-group-crud.int.test.ts` |
| **R16** | Renombrar reemplaza nombre y normalizado, nada mas | `grupos/work-group-service.test.ts` + `work-group-assignments.int.test.ts` |
| **R17** | Duplicado al renombrar, mismo error | `work-group-crud.int.test.ts` |
| **R18** | Renombrar no toca lo ya asignado | `work-group-assignments.int.test.ts` |
| **R19** | **Solo cuentas `active` efectivas** | `grupos/members-filter.test.ts` + `work-group-membership.int.test.ts` |
| **R20** | **La `pending` recien creada no aparece** | `grupos/members-filter.test.ts` + `work-group-membership.int.test.ts` |
| **R21** | **La bloqueada vuelve sola, sin escritura** | `grupos/members-filter.test.ts` (solo moviendo `now`) |
| **R22** | Orden determinista y estable | `grupos/members-filter.test.ts` (dos homonimas) |
| **R23** | La consulta no escribe nada | `grupos/members-filter.test.ts` (dobles que lanzan) |
| **R24** | Listado paginado, 10 por defecto, 25 de tope | `work-group-crud.int.test.ts` |
| **R25** | Orden por nombre con desempate estable | `work-group-crud.int.test.ts` |
| **R26** | Solo identificador y nombre | `work-group-crud.int.test.ts` + `grupos/work-group-input.test.ts` |
| **R27** | La firma es el contrato de listado de QC-57 | `grupos/work-group-input.test.ts` + `guard-contrato-listados.test.ts` (existente, **sin tocar**) |
| **R28** | Se mete a cualquier persona viva, sea cual sea su estado | `grupos/work-group-service.test.ts` + `work-group-membership.int.test.ts` (los cuatro estados) |
| **R29** | Persona inexistente, borrada o de otra empresa | `grupos/work-group-service.test.ts` + `work-group-membership.int.test.ts` |
| **R30** | Ya pertenece **y se ve** | `grupos/add-member-errors.test.ts` + `grupos/errors.test.ts` |
| **R31** | **Ya pertenece y el filtro la oculta: `code` propio por motivo** | `grupos/add-member-errors.test.ts` (los **cuatro** codigos) + `grupos/errors.test.ts` |
| **R32** | La garantia es la PK, no la lectura previa | `work-group-membership.int.test.ts` (**dos conexiones de verdad**) |
| **R33** | Operaciones de a una; ningun esquema acepta una lista | `grupos/work-group-input.test.ts` |
| **R34** | Sacar borra la fila **fisicamente** | `work-group-membership.int.test.ts` + `grupos/work-group-service.test.ts` |
| **R35** | Sacar no toca a la persona ni sus otros grupos | `work-group-membership.int.test.ts` |
| **R36** | Sacar a quien no pertenece, `code` estable | `work-group-membership.int.test.ts` + `grupos/work-group-service.test.ts` |
| **R37** | Baja logica, conserva la fila | `work-group-crud.int.test.ts` |
| **R38** | La baja conserva **todas** las pertenencias | `work-group-crud.int.test.ts` |
| **R39** | **La baja NO deja un pedido sin responsables** | `work-group-assignments.int.test.ts` (**+ caso de sensibilidad**) |
| **R40** | No hay restaurar ni listado de bajas | `grupos/work-group-service.test.ts` + `work-group-queryable.ts` (sin `deletedAt`) |
| **R41** | La baja **libera** el nombre | `work-group-crud.int.test.ts` |
| **R42** | Server Actions, `FormData` en las cinco mutaciones | `grupos/work-group-actions.test.ts` |
| **R43** | `code` estable del catalogo unico, traducido por `code` | `tests/unit/errores/catalogo.test.ts` (39) + `grupos/errors.test.ts` + `guard-catalogo-de-errores.test.ts` |
| **R44** | Dominio, puertos, composicion; el barril no exporta actions | `guard-arquitectura-modulos.test.ts` + `tests/unit/composition/identity-facade.test.ts` |
| **R45** | Identificadores en ingles `snake_case`, ninguno nuevo | `grupos/scope.test.ts` (M4) |
| **R46** | **Ni `db/schema.prisma` ni `db/migrations/`** | `grupos/scope.test.ts` (M8, M11) |
| **R47** | **El catalogo sigue en quince** | `grupos/scope.test.ts` (M13, M14) + los cuatro ajenos, **sin tocar** |
| **R48** | Sin pantalla; los E2E existentes sin cambios | `grupos/scope.test.ts` (M9) |
| **R49** | Ninguna dependencia nueva | `grupos/scope.test.ts` (M10, M15) + `guard-dependencias-aprobadas.test.ts` |
| **R50** | No administra asignaciones de pedidos | `grupos/scope.test.ts` (M1, M2, M3, M12) |
| **R51** | **Pagina: 10 por defecto, 25 de tope** | `grupos/members-pagination.test.ts` + `work-group-membership.int.test.ts` |
| **R52** | **El total cuenta solo a las filtradas** | `grupos/members-pagination.test.ts` (12 con 4 ocultos da `total: 8`) |
| **R53** | Desempate estable: nadie en dos paginas ni en ninguna | `grupos/members-pagination.test.ts` (+ contraprueba permanente) |
| **R54** | Misma forma de pagina que el listado de grupos | `grupos/members-pagination.test.ts` + `work-group-queryable.ts` |

**Ninguno de los 54 queda sin test nombrado.**

## Los dos requisitos que el humano senalo como el corazon de la ficha

1. **El filtro de lectura (R19 y sus dos precios, R20 y R21)** — cerrado por
   `grupos/members-filter.test.ts` y confirmado contra Postgres por
   `work-group-membership.int.test.ts`. **Cae al mutar**: sustituir el filtro por
   `candidate.accountStatus === 'active'` pone **5 de 8** en rojo, y los que caen son exactamente
   los dos precios: Bruno (`blocked` con plazo **vencido**) desaparecia, y Carla (`active` con plazo
   **vigente**) aparecia. Es la alternativa que `design.md > 9.1` descarto, ahora con un test que la
   impide.
2. **El duplicado oculto (R31), distinguido del duplicado normal (R30)** — cerrado por
   `grupos/add-member-errors.test.ts` con **cuatro `code` distintos**. **Cae al mutar**: unificar
   dos de los cuatro pone 2 de 6 en rojo. El «por que no se ve» sale de `effectiveAccountStatus`: el
   **mismo doble** pasa de `work_group_member_exists_blocked` a `work_group_member_exists` con solo
   **adelantar el reloj**, que es lo que hace imposible que el mensaje y la lista diverjan.

## El test que cruza con QC-86 (R39)

`work-group-assignments.int.test.ts`: se monta un pedido con un grupo aplicado, se **renombra** el
grupo y se **da de baja**, y las filas de `order_assignments` quedan **identicas** (mismas personas,
misma referencia, mismo **nombre congelado**, `updated_at` incluida). **Se pone rojo** si se muta la
baja para tocar `order_assignments`: `Tests 2 failed | 3 passed`. Es la prueba, **desde el otro
lado**, de que la decision de QC-86 de congelar a las **personas** aguanta.

## Salida real de los tests (la corrida de cierre)

```
$ pnpm run typecheck          -> tsc --noEmit, sin salida (verde)
$ pnpm run lint               -> eslint, sin salida (verde)

$ pnpm exec vitest run tests/unit/identity/grupos \
      tests/unit/errores/catalogo.test.ts tests/unit/composition/identity-facade.test.ts \
      tests/integration/identity/work-group-crud.int.test.ts \
      tests/integration/identity/work-group-membership.int.test.ts \
      tests/integration/identity/work-group-assignments.int.test.ts
 Test Files  14 passed (14)
      Tests  246 passed (246)
   Duration  11.39s

$ pnpm exec vitest run tests/unit/identity/account-status-scope.test.ts tests/unit/identity/grupos
 Test Files  10 passed (10)
      Tests  191 passed | 3 skipped (194)

$ pnpm exec vitest run tests/unit/recetas/module-contract.test.ts \
                       tests/unit/recetas-ui/recipe-route-contract.test.ts
 Test Files  2 passed (2)      <- los dos rojos del baseline, ya verdes y SIN tocarlos
      Tests  30 passed (30)
```

Invariantes de alcance, comprobadas contra la base de fusion:

```
$ git diff --stat <merge-base> -- db/ app/ components/ e2e/ middleware.ts package.json
(vacio)
$ grep -c "code:" lib/modules/identity/domain/permissions.ts
15
```

## El ripple de `design.md > 7.3` y los tres hallazgos de `design.md > 12`

**El ripple, medido y cumplido**: el catalogo paso de **32 a 39** codigos y el **unico** archivo
ajeno que eso ponia en rojo (`tests/unit/errores/catalogo.test.ts` L45) se actualizo **en la misma
tanda** que el codigo, sin eliminar ni debilitar ninguna expectativa.
`vitest related --run lib/modules/errores/domain/error-codes.ts` dio **206 archivos, 2967 tests en
verde**: **ningun segundo archivo** rojo, exactamente como el diseno habia previsto.

**Hallazgo 1 — «las seis operaciones» eran siete.** Corregido al aprobar el spec (F1.4). Las siete
estan implementadas, cableadas y testeadas; `grupos/authorization.test.ts` recorre **las siete**.

**Hallazgo 2 — el mensaje del duplicado oculto no puede nombrar el grupo** con QC-70 tal y como
esta. Se entrego **la sustancia**: tres `code` distintos, uno por motivo, con textos explicitos y
sin que dos codigos compartan texto. **El nombre del grupo lo pondra la pantalla, que es QC-85.**
Que la interpolacion en el catalogo seria **otra ficha** sigue escrito, y **no se abrio por la
puerta de atras**.

**Hallazgo 3 — P2 quedo CERRADA** el 2026-09-11 (decision 18): la consulta de miembros **si se
pagina**. La escriben R51-R54 y la cierran `grupos/members-pagination.test.ts` y la mitad de
paginacion de `work-group-membership.int.test.ts`. Se pagina **en el caso de uso, despues de
filtrar**, con el 10/25 **inyectado por `deps`**: el dominio no importa `lib/shared`.

## Preguntas abiertas al cerrar

- **P1 (del humano, no bloquea)**: si QC-87 descarta a los miembros cuya cuenta no esta activa **al
  asignar**. Esta ficha decide que se **muestra** (R19); a quien se puede **asignar** es de
  **QC-87** y **no se decidio aqui** (R50).
- **P2**: **CERRADA** el 2026-09-11 al aprobar el spec. Es la decision 18 y la escriben R51-R54.
- **Observacion abierta, NO decidida**: `normalizeWorkGroupName` puede devolver **cadena vacia**
  para un nombre de solo signos (por ejemplo `"!!!"`), y `zod` lo acepta porque `name` no esta
  vacio. **Ningun requisito de QC-84 ni de QC-83 dice que debe pasar**, asi que **no se invento**
  una regla (`CLAUDE.md` regla 6). No bloquea; queda para el humano si le importa.

## Estado

**Las 20 tasks (T0-T19) cerradas y marcadas `[x]` en `tasks.md`**, en 18 commits sobre
`origin/dev`, uno por task salvo T12 (sus dos archivos van en un commit) y el amend de higiene
de T17.

**El gate largo NO lo corrio el implementer** (`AGENTS.md > Regla del gate`): esta bitacora trae
`typecheck`, `lint` y **solo** los archivos de la feature con `vitest`. **`./init.sh --rapido` de
cada tanda y el `./init.sh` completo antes del PR los corre el leader.** **F2.3 no se ejecuto y el
PR no se abrio**, como se pidio.

---

# F2.3 — Sincronizacion con `dev` (2026-09-11)

## El menor del reviewer, arreglado antes de sincronizar

`domain/add-work-group-member.ts` prometia en su comentario que `blockReasonOf` «no compilaria» si
el catalogo de estados creciera, pero tenia `default: return null`: hacia **exactamente lo que el
comentario decia que era imposible**, clasificar en silencio un estado nuevo como «se ve». El
codigo era correcto hoy; **la promesa no**. Se arreglo **cumpliendola**, no rebajandola.

Quedo como **mapa total** en vez de `switch`:

```ts
const MOTIVO_POR_ESTADO = {
  active: null, pending: 'pending', inactive: 'inactive', blocked: 'blocked',
} satisfies Record<UserAccountStatus, MemberBlockReason | null>;
```

**Por que mapa y no `switch` con `case`**: el `case` obliga a escribir el literal del estado activo
**entre comillas**, y eso lo cazaba —con razon, porque el patron no puede distinguir un `case` de
un `===`— el guardia de R13 de `grupos/scope.test.ts`. La clave de un objeto **no va
entrecomillada**, asi que el guardia **se queda estricto, sin ninguna excepcion nombrada**, y la
exhaustividad se conserva entera. **Antes que pedirle permiso al guardia, se quito el motivo.**

Verificado **las dos veces** (con `switch` y con mapa) anadiendo un quinto estado al catalogo:

```
add-work-group-member.ts(66,3): error TS1360: Type '{ active: null; pending: ...; }'
  does not satisfy the expected type 'Record<"active" | ... | "suspended", ...>'.
```

El comportamiento de hoy **no cambia**: el estado activo sigue dando `null` (R19).

## Que trajo el merge

`dev` iba **15 commits por delante**: entro **QC-67** (pantalla de usuarios, PR #60), que ya llevaba
dentro **QC-86** y **QC-80**. Son ~50 archivos, casi todos de `app/(private)/configuracion/usuarios/`
y sus tests.

**Migraciones, hechas INMEDIATAMENTE despues del merge y no cuando algo fallara** (es el paso que en
QC-86 costo dos corridas de gate de seis minutos): `prisma migrate deploy` y `prisma generate`
contra `QuimiCloude_QC84`. **No habia ninguna pendiente** —QC-67 es UI pura y las de QC-80/QC-86 ya
estaban aplicadas— pero el cliente se regenero igual. La integracion quedo verde: **22 archivos,
418 tests**.

## El unico conflicto, y por que ninguno de los dos lados se descarto

`tests/unit/identity/account-status-scope.test.ts`. **QC-67 y QC-84 hicieron la MISMA maniobra sobre
la MISMA lista cerrada**: anadir un bloque **aditivo** a `SITIOS_PERMITIDOS` nombrando sus
excepciones, y los dos bloques caian al final del array.

Resuelto **conservando los dos intactos**, el de QC-67 primero por estar ya en el tronco. **No era
una eleccion entre ellos**: cada bloque da de alta archivos distintos por requisitos distintos, y
quitar cualquiera dejaria en rojo a su ficha. La lista sigue **cerrada** y comparada con
**igualdad**: lo que crece es la lista, nunca el criterio.

De paso se corrigio la cabecera del bloque de QC-84, que decia «cinco archivos» y enumera **seis**
(`work-group-prisma.ts` entro despues de escribirla).

**Los dos commits de QC-67 sobre el rango de los centinelas** (`1a9e2c4` merge-base en vez de SHA
congelado, `f578865` el aserto del orden) **no obligaron a tocar nada aqui**: `account-status-scope`
ya calculaba su rango con `git merge-base origin/dev HEAD`, y el `scope.test.ts` de QC-84 nacio con
esa forma precisamente por el aviso.

## Verificacion tras el merge

```
$ pnpm run typecheck                        -> sin salida (verde)
$ pnpm run lint                             -> sin salida (verde)

$ vitest run account-status-scope + grupos + qc78-alcance + roles/scope
                                 + usuarios/scope + navegacion
 Test Files  18 passed (18) | Tests 312 passed | 18 skipped (330)

$ vitest run grupos + catalogo + identity-facade + integration/identity
 Test Files  22 passed (22) | Tests 418 passed (418)
```

**Un aviso sobre medir en mitad de un merge**: antes de commitear la fusion, `scope.test.ts` (R48)
acusaba a esta rama de anadir 18 archivos bajo `app/` y `e2e/`. **No era un fallo**: sin la fusion
commiteada, `merge-base` seguia en el commit viejo mientras el arbol de trabajo ya tenia los
archivos de QC-67, asi que el centinela se los atribuia a QC-84. Al commitear el merge, la base pasa
a ser la punta de `dev` y el caso vuelve a verde **sin tocar el test**. Queda anotado porque es la
misma trampa que `1a9e2c4` documenta y cuesta una corrida entenderla.

## DOS ROJOS AJENOS QUE EL MERGE DESTAPA, y que NO toco por mi cuenta

Corriendo los archivos que el merge trajo aparecen **dos tests de QC-67 en rojo**. Los dejo **sin
tocar** y los reporto, porque arreglarlos es enmendar los guardias de una ficha **recien mergeada**
y eso no es una decision del implementer de QC-84. Diagnostico, con la evidencia:

### (a) `tests/unit/configuracion-ui/usuarios-convenciones.test.ts` — «la feature toca intocables»

Acusa a **QC-84** de abrir `lib/modules/identity`, y enumera mis **15** archivos:

```
la feature toca intocables: lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts,
  ... work-group-actions.ts, add-work-group-member.ts, create-work-group.ts, ... (15)
```

**Causa**: el centinela pregunta «que anade ESTA rama sobre `dev`» con `merge-base` —que es la forma
**correcta**, la que `1a9e2c4` acaba de instaurar— pero **no comprueba de QUIEN es la rama**. En la
rama de QC-67 medía a QC-67; ahora que QC-67 esta en `dev`, mide a **quien pase por ahi**, y lo que
esta rama anade sobre `dev` son, legitimamente, los archivos de QC-84.

**Lo que le falta es la SENAL DE RAMA** que tienen todos los demas centinelas del repo —el de QC-65,
el de QC-78, el de QC-66, el de QC-94, los de `unidades` y el propio `grupos/scope.test.ts` de esta
ficha—: cuando no es su rama, **saltan ruidosamente** con su motivo en vez de acusar al vecino. Son
exactamente los `18 skipped` que se ven en la corrida de arriba.

### (b) `data-table-intacta-usuarios.test.ts` y (a) otra vez — «el detector muerde: el diff NO sale vacio»

Las anclas de **no-vacuidad** fallan con `expected 0 to be greater than 0`. **Esto es anterior a mi
rama y no lo causa el merge**: comprobado calculando el mismo rango que ellas usan, con `HEAD` en la
punta de `dev`:

```
base = 46fc2932 = dev tip
archivos que «la rama anade» en ese caso: 0
```

O sea: **fallan tambien corriendo el gate en `dev`**, y en cualquier rama que no toque la carpeta de
la pantalla de usuarios. El ancla protege de que el centinela se de por verde sin haber medido —es
lo correcto— pero esta escrita como si su rama fuera la unica que va a existir.

### Lo que propongo, y que NO he hecho

Anadir a esos dos centinelas la **senal de rama** conjuntiva que ya usa el resto del repo (un
archivo central de QC-67 **y** su carpeta de spec), de modo que en una rama ajena **salten
ruidosamente** en vez de acusar. **No se relaja ninguna asercion**: en la rama de QC-67 seguirian
midiendo exactamente lo que miden hoy. Es el mismo retensado que QC-67 le hizo a
`usuarios-convenciones` en `1a9e2c4`, terminado en el eje que quedo pendiente: aquel arreglo el
RANGO, y falta el SUJETO.

**Queda a decision del leader**: es tocar guardias de una ficha ajena ya mergeada.

## Los dos rojos ajenos, ARREGLADOS por decision del humano (commit `c631118`, aparte)

El humano decidio arreglarlos desde esta rama, **en un commit propio y separado** del trabajo de la
feature. Queda anotado aqui entero porque es trabajo sobre guardias de una **ficha ajena ya
mergeada** y el PR tiene que poder explicarlo.

### Los archivos y los casos

| Archivo | Casos afectados | Requisitos que vigila |
| --- | --- | --- |
| `tests/unit/configuracion-ui/usuarios-convenciones.test.ts` | los **4** del bloque R37 | R37 de **QC-67** |
| `tests/unit/configuracion-ui/data-table-intacta-usuarios.test.ts` | los **2** del bloque R9/R37 | R9 y R37 de **QC-67** |

### Por que era de ellos y no mio

`1a9e2c4` (de QC-67) arreglo el **RANGO** de estos centinelas —merge-base en vez de un SHA
congelado— y dejo pendiente el **SUJETO**: seguian sin comprobar **que rama** estaban midiendo.
Mientras QC-67 vivia en su worktree no se notaba; **en cuanto se mergeo en `dev`, empezaron a medir
cualquier rama con las reglas de alcance de QC-67**.

Dos sintomas, y **solo uno lo provoca QC-84**:

1. **`usuarios-convenciones` R37 acusaba a QC-84 de abrir `identity`**, enumerando sus quince
   archivos. Pero el alcance **aprobado** de QC-84 es precisamente `lib/modules/identity/**`: el
   centinela no detectaba una infraccion, **media a quien no debia**. Este si lo destapa QC-84.
2. **Las anclas de no-vacuidad de los dos fallaban**, y **son anteriores a esta rama**: comprobado
   calculando su mismo rango con `HEAD` en la punta de `dev`, el diff sale de **0 archivos**, asi
   que **fallan igual corriendo el gate sobre `dev`** y en cualquier rama que no toque la carpeta de
   la pantalla de usuarios.

### Que se hizo, y que NO

Se les anadio la **precondicion de rama** con **la forma que ya usa su centinela hermano**
`tests/unit/identity/account-status-scope.test.ts`, que lleva la regla escrita en su cabecera:
*«aplicarlas a otra rama no mide nada, solo pone en rojo trabajo legitimo ajeno»*. **Se copio esa
forma en vez de inventar una segunda**: que el repo tenga dos maneras de decir lo mismo es la mitad
del problema que se estaba arreglando. La senal es **conjuntiva** —`page.tsx` de la pantalla **mas**
`specs/QC-67-pantalla-de-usuarios/`— y fuera de su rama los casos quedan **`skipped` con el motivo
escrito, nunca verdes**.

**No se relajo ni una asercion, y el diff lo respalda**: **141 inserciones y 2 supresiones**, y las
dos supresiones son la linea de `import` a la que se le anade `type TestContext`. Ninguna lista
cerrada, ninguna igualdad y ningun `expect` se tocaron. Tampoco cambiaron los finales de linea
(`git diff` y `git diff --ignore-cr-at-eol` dan el mismo recuento).

### La mutacion que lo prueba, en sus DOS mitades

Sin la segunda mitad, el «arreglo» podria ser un apagado con otro nombre:

| Mitad | Que se hizo | Resultado |
| --- | --- | --- |
| **1. Fuera de su rama** | correr los dos en la rama de QC-84 | los **6** casos `skipped` **citando su motivo**; los otros **22** del par siguen vigilando |
| **2. En su rama** | tocar `page.tsx` y `specs/QC-67-.../tasks.md` para satisfacer **las dos** senales | los casos **vuelven a correr**: R37 se pone **ROJA** al instante contra los quince archivos de `identity` |
| **2b. Con violacion real** | ademas, una linea en `components/ui/alert-dialog.tsx` | `data-table-intacta-usuarios` se pone **ROJA** nombrando el archivo: `QC-67 modifico archivos intocables: components/ui/alert-dialog.tsx` |
| **2c. Las anclas** | con la senal satisfecha | las de no-vacuidad pasan a **verde**, porque ya hay sujeto que medir (27 pasados frente a 22) |

Todo revertido despues; el arbol quedo limpio salvo los dos centinelas.

### Verificacion

```
$ pnpm run typecheck   -> sin salida (verde)
$ pnpm run lint        -> sin salida (verde)
$ vitest run tests/unit/configuracion-ui + grupos + account-status-scope
                       + catalogo + identity-facade
 Test Files  54 passed (54)
      Tests  860 passed | 9 skipped (869)
```

## Migraciones, confirmado con el numero y no de memoria

```
$ pnpm exec prisma migrate status
Datasource "db": PostgreSQL database "QuimiCloude_QC84", schema "public" at "localhost:5432"
25 migrations found in prisma/migrations
Database schema is up to date!
```

**25 migraciones, 0 pendientes** sobre `QuimiCloude_QC84`.
