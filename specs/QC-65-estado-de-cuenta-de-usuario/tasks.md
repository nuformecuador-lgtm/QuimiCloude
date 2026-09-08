# QC-65 — estado-de-cuenta-de-usuario · tasks.md

> **Leyenda.** `[P]` = paralelizable con las tasks marcadas igual dentro de la misma tanda.
> `[ID]` = toca `lib/modules/identity/**`. `[DB]` = toca `db/**`. Rutas relativas a la raíz del
> worktree `.worktrees/QC-65-estado-de-cuenta-de-usuario/`.
>
> **Regla de tanda** (`CLAUDE.md` n.º 5): al cerrar cada tanda se corre `./init.sh --rapido`. El
> `./init.sh` completo es del leader, antes del PR.
>
> **Frontera dura de la ficha, válida para TODAS las tasks:** no se toca `verify-credentials.ts`,
> `account-lock.ts`, `failed_login_attempts`, `lock_level`, `locked_until`, `deleted_at`, los
> tres índices únicos de `users`, el RLS, `middleware.ts`, la sesión ni la UI (R18, R19, R20).
> Si una task parece pedirlo, está mal leída: se para y se devuelve al leader.

---

## Tanda A — El conjunto de valores, primero en TypeScript

### T1. `[ID]` La única definición del conjunto y sus dos constantes
- **Archivos:** `lib/modules/identity/domain/account-status.ts` (nuevo),
  `lib/modules/identity/index.ts`.
- **Qué:** `design.md > 2`. `USER_ACCOUNT_STATUSES`, `UserAccountStatus`,
  `INITIAL_USER_ACCOUNT_STATUS` y `SEED_ADMIN_ACCOUNT_STATUS`, con el significado de los cuatro
  valores escrito junto a la declaración (R3, decisión cerrada 2). Reexportar desde el contrato.
  **Nada de funciones de transición ni de «puede entrar»** (R14, R19).
- **Hecho cuando:** `pnpm typecheck` pasa; el archivo no importa nada más que sus propios tipos;
  el contrato sigue sin arrastrar servidor.
- **Depende de:** nada.

---

## Tanda B — El esquema y la migración

### T2. `[DB]` El `enum` y las tres columnas en `db/schema.prisma`
- **Archivos:** `db/schema.prisma`.
- **Qué:** `design.md > 1.1` y `> 1.2`: `enum UserAccountStatus` con los cuatro valores en
  minúscula y su comentario; `accountStatus`, `accountStatusChangedAt` y `accountStatusChangedBy`
  en `model User` con sus `@map`, defaults y el `@@index([accountStatusChangedBy])`.
  `accountStatusChangedBy` va **escalar, sin `@relation`** (`design.md > 1.3`), con el comentario
  `OJO` que avisa del drift.
- **Hecho cuando:** `prisma validate` pasa, el cliente generado expone los tres campos, y
  `Prisma.dmmf` NO lista `User` como destino de relación de `User`.
- **Depende de:** T1.

### T3. `[DB]` Releer la respuesta de QC-47 sobre el backfill bajo `FORCE RLS`
- **Archivos:** ninguno de producción.
- **Qué:** `design.md > 3.1`, último párrafo. Buscar en
  `progress/impl_QC-47-modelo-empresa-y-membresias.md` el resultado de su T5 —si el rol de
  `DIRECT_URL` puede hacer `UPDATE` sobre `users` con `FORCE ROW LEVEL SECURITY` y sin policies—
  y **anotarlo** en la bitácora de esta ficha.
- **Hecho cuando:** la respuesta está citada por su archivo en
  `progress/impl_QC-65-estado-de-cuenta-de-usuario.md`. **Si allí dijera que el `UPDATE` no
  pasa**, se aplica la misma salida que aplicó QC-47 y se anota; no se inventa una nueva. Si no
  hubiera respuesta escrita, se comprueba de verdad contra la base del worktree antes de escribir
  el UP: no se elige a ciegas (regla 6 de `CLAUDE.md`).
- **Depende de:** nada. Paralelizable con T1 y T2.

### T4. `[DB]` `migration.sql` (UP)
- **Archivos:** `db/migrations/<ts>_user_account_status/migration.sql`.
- **Qué:** los seis pasos de `design.md > 3.1`, en ese orden: `CREATE TYPE`, `ADD COLUMN` x3,
  backfill `UPDATE ... SET account_status='active'` **sin `WHERE`** (R6), FK
  `users_account_status_changed_by_fkey` con `ON DELETE RESTRICT ON UPDATE CASCADE` (R11, R12),
  índice `users_account_status_changed_by_idx`, y **borrado a mano** de todo `DROP` que Prisma
  haya emitido por drift sobre otras tablas.
- **Hecho cuando:** `pnpm run db:migrate` la aplica limpia sobre la base del worktree; el archivo
  no menciona `deleted_at`, ni `lock_`, ni `ROW LEVEL SECURITY`, ni ninguna tabla que no sea
  `users`; y una fila preexistente queda en `active` con `account_status_changed_by` NULL.
- **Depende de:** T2, T3.

### T5. `[DB]` `down.sql` (DOWN)
- **Archivos:** `db/migrations/<ts>_user_account_status/down.sql`.
- **Qué:** `design.md > 3.2`, en orden inverso, con el `DROP TYPE` **el último**.
- **Hecho cuando:** `pnpm run db:rollback` devuelve la base a un estado en el que un snapshot de
  `users` —columnas, índices y restricciones— y la lista de tipos de Postgres son **idénticos**
  a los de antes de T4, y `_prisma_migrations` queda sin la fila. Verificado contra Postgres
  real, no leído (R17).
- **Depende de:** T4.

### T6. `[P]` Tests estáticos de esquema y de migración
- **Archivos:** `tests/unit/identity/schema/account-status-schema.test.ts` (nuevo),
  `tests/unit/identity/schema/account-status-migration.test.ts` (nuevo).
- **Qué:** la tabla de `design.md > 5.2`, filas 1 y 2. Los cuatro valores se **importan** de
  `@/lib/modules/identity` y se comparan con los del esquema y con los del `CREATE TYPE`; nunca
  se copian a mano (patrón de `companies-migration.test.ts` con `INITIAL_COMPANY_NAME`). Incluye
  que `relationTargets('User')` sigue siendo `['Company','DocumentType','Role']` y que no
  aparece ninguna tabla ni columna de historial (R13).
- **Hecho cuando:** cada aserción **cae al mutar en memoria** lo que vigila (se demuestra
  mutando, no leyendo). El archivo en disco no se toca.
- **Depende de:** T5. Paralelizable con T7.

### T7. `[P]` Retensar las dos guardias ajenas
- **Archivos:** `tests/unit/identity/credential-policy-contract.test.ts`,
  `tests/unit/identity/schema/identity-schema.test.ts`.
- **Qué:** `design.md > 5.3`. Las dos llevan el censo **exacto** de los campos de `model User` y
  caerán con las tres columnas nuevas. Se añaden los tres campos (en `identity-schema.test.ts`,
  como un bloque `ACCOUNT_STATUS_FIELDS` al estilo de `LOCKOUT_FIELDS`) **conservando la igualdad
  exacta**. Cambiar un `toEqual` por un `toContain` es relajar la guardia: está prohibido.
- **Hecho cuando:** las dos verdes, siguen siendo igualdades exactas, y el cambio de cada una
  queda anotado en la bitácora para que el reviewer las mire una a una.
- **NO se toca:** `tests/unit/proveedores/module-contract.test.ts` (`design.md > 5.3`).
- **Depende de:** T2. Paralelizable con T6.

### T8. Cierre de tanda B
- **Hecho cuando:** `./init.sh --rapido` en verde.
- **Depende de:** T6, T7.

---

## Tanda C — El seed

### T9. `[ID]` El administrador inicial nace `active`, explícito
- **Archivos:** `lib/modules/identity/ports/initial-access-repository.ts`,
  `lib/modules/identity/domain/seed-initial-access.ts`,
  `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts`.
- **Qué:** `design.md > 4`. `createInitialAdmin` recibe `accountStatus` **obligatorio** y lo
  escribe como una columna más del mismo `user.create`, en la misma sentencia y transacción.
  `accountStatusChangedBy` se deja sin escribir (NULL = el sistema, R10).
- **Hecho cuando:** el estado del administrador **no** depende del default de la columna: si
  alguien quitara el `@default` del esquema, el seed seguiría creándolo `active`.
- **Depende de:** T8.

### T10. `[P]` Test unitario del seed
- **Archivos:** `tests/unit/identity/seed/seed-initial-access.test.ts` (existente).
- **Qué:** con dobles del puerto, `createInitialAdmin` recibe `accountStatus: 'active'`, y el
  valor sale de `SEED_ADMIN_ACCOUNT_STATUS`, no de un literal repetido en el test (R7).
- **Hecho cuando:** el caso cae si se cambia la constante del dominio.
- **Depende de:** T9. Paralelizable con T11.

### T11. `[P]` `scripts/seed.ts`: verificar que NO cambia
- **Archivos:** `scripts/seed.ts`.
- **Qué:** `SeedOutcome` queda íntegro y el script no aprende nada del estado. La task existe
  **para dejar por escrito que el archivo no se toca**, no para tocarlo.
- **Hecho cuando:** el diff de `scripts/seed.ts` frente a `dev` es **vacío**, y dos corridas
  seguidas de `pnpm run db:seed` dejan un solo administrador, en `active`, y la segunda no crea
  nada.
- **Depende de:** T9. Paralelizable con T10.

### T12. Cierre de tanda C
- **Hecho cuando:** `./init.sh --rapido` en verde.
- **Depende de:** T10, T11.

---

## Tanda D — Constraints reales, alcance y fixtures

### T13. Tests de integración contra Postgres real
- **Archivos:** `tests/integration/identity/identity-constraints.int.test.ts` (existente),
  `tests/integration/identity/identity-seed.int.test.ts` (existente).
- **Qué, como mínimo, cada caso dentro de una transacción que acaba en `ROLLBACK`
  (`design.md > 5.2`, filas 4 y 5):**
  - R2: `account_status = 'suspendido'` → error de la base (`22P02`), la fila no queda;
  - R5: alta sin estado → `pending`;
  - R9: alta sin instante → se rellena solo, y coincide con el momento del alta;
  - R11: autor inexistente → `23503`;
  - R12: `DELETE` físico del usuario que figura como autor → `23503`;
  - R14: `blocked` → `active` es un `UPDATE` normal, sin ninguna restricción de transición;
  - R15: **el corazón de la decisión cerrada 9.** Dos usuarios de la misma empresa no pueden
    repetir correo / username / documento **aunque uno esté `inactive`** (→ `23505`), y sí
    pueden en empresas distintas;
  - R16: dar de baja lógicamente no cambia el estado, y cambiar el estado no toca `deleted_at`;
  - R7: tras sembrar, el administrador está en `active` con autor NULL.
- **Hecho cuando:** el caso de R15 cae si alguien mete `account_status` en cualquiera de los tres
  índices únicos, y el de R14 cae si alguien añade un CHECK o un disparador de transición.
- **Depende de:** T12.

### T14. `[P]` Guardia de alcance
- **Archivos:** `tests/unit/identity/account-status-scope.test.ts` (nuevo).
- **Qué:** `design.md > 5.2`, última fila. R18: `verify-credentials.ts` y `account-lock.ts` no
  mencionan el estado y su diff frente a `dev` es **vacío**. R19: ningún archivo de `lib/`,
  `app/`, `components/`, `hooks/` ni `middleware.ts` lee `accountStatus`/`account_status`, salvo
  los cuatro sitios permitidos (el esquema, la migración, `domain/account-status.ts` y el
  camino del seed). R20: no hay adaptador driving, ruta, Server Action ni componente nuevo.
  R21: `package.json` y `pnpm-lock.yaml` sin cambios en el diff de la rama.
- **Hecho cuando:** la lista de sitios permitidos es **cerrada** (igualdad, no `toContain`), y el
  test cae si se añade una lectura en cualquier otro archivo.
- **Depende de:** T12. Paralelizable con T13 y T15.

### T15. `[P]` Revisar los fixtures que crean y borran usuarios
- **Archivos:** los `beforeAll`/`afterAll` de `tests/integration/identity/**` y `e2e/**` que
  hacen `user.create` y `deleteMany`.
- **Qué:** `design.md > 8`, riesgo 5. Con la FK auto-referencial `RESTRICT`, un barrido que borre
  usuarios en el orden equivocado puede chocar. Se comprueba y, si hace falta, se ordena el
  barrido. **No se añade `accountStatus` a los fixtures**: nacen `pending` y eso es correcto
  (R5); tocarlos sería anticipar QC-78.
- **Hecho cuando:** los specs de integración y E2E de `identity` pasan sin cambiar ni un
  `test(...)`, y cualquier ajuste queda solo en `beforeAll`/`afterAll`.
- **Depende de:** T12. Paralelizable con T13 y T14.

### T16. E2E existentes: comprobar que siguen verdes
- **Qué:** `pnpm exec playwright test e2e/login.spec.ts e2e/session.spec.ts`, chromium y webkit.
  **No se añade ningún E2E** (`design.md > 5.2`, último párrafo): esta ficha no cambia el
  comportamiento del login.
- **Hecho cuando:** los dos specs pasan, con el número de tests anotado en la bitácora, y
  `git diff` confirma que ningún `test(...)` cambió de contenido.
- **Depende de:** T13, T15.

### T17. Bitácora y mapa de trazabilidad
- **Archivos:** `progress/impl_QC-65-estado-de-cuenta-de-usuario.md`.
- **Qué:** el mapa `R1..R21 -> test concreto` **sin hueco** (`CHECKPOINTS.md > Trazabilidad`),
  nombrando archivo y título de test; la respuesta de T3; y la nota de T7 sobre las dos guardias
  ajenas retensadas.
- **Hecho cuando:** los 21 requisitos tienen su test nombrado, y ninguna fila de la tabla de
  decisiones cerradas se ha quedado sin `R<n>`.
- **Depende de:** T14, T16.

### T18. Cierre de feature
- **Hecho cuando:** `./init.sh` **completo** en verde (regla 5 de `CLAUDE.md`: obligatorio antes
  del PR, sin excepción), y `package.json` / `pnpm-lock.yaml` sin ningún cambio en el diff de la
  rama (R21).
- **Depende de:** T17.

---

## Grafo de dependencias

```
T1 ┐
   ├→ T2 ┬→ T4 → T5 → T6 ┐
T3 ┘     └───────→ T7 ───┴→ T8 → T9 → ┌ T10 ┐→ T12 → ┌ T13 ┐
                                      └ T11 ┘        │ T14 ├→ T16 → T17 → T18
                                                     └ T15 ┘
```

(T3 es independiente de T1/T2 y puede ir desde el minuto cero; solo bloquea a T4.
T16 depende de T13 y T15; T17 depende además de T14.)
