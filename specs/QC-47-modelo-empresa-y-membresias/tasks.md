# QC-47 — modelo-empresa-y-membresias · tasks.md

> **Escrito de cero el 2026-09-04** tras el reacote del humano. El `tasks.md` anterior (21 tasks)
> desglosaba el modelo de muchos a muchos y **está descartado entero**.
>
> **Leyenda.** `[P]` = paralelizable con las tasks marcadas igual dentro de la misma tanda.
> `[ID]` = toca `lib/modules/identity/**`. `[SEED]` = toca `scripts/seed.ts`.
> Rutas relativas a la raíz del worktree.
>
> **Regla de tanda** (`CLAUDE.md` n.º 5): al cerrar cada tanda se corre `./init.sh --rapido`. El
> `./init.sh` completo es del leader, antes del PR.

---

## Tanda 0 — Condición previa (bloquea todo)

### T0. Verificar que la rama NO está mergeada
Todo el diseño de la migración (`design.md > 3`) se apoya en que
`20260904180600_companies_and_memberships` no se ha aplicado en ningún sitio fuera del worktree.

- **Hecho cuando:** se comprueba que `feature/QC-47-modelo-empresa-y-membresias` no está mergeada
  en `dev` ni en `main`, y que ninguna base distinta de `QuimiCloude_QC47` tiene la migración en
  `_prisma_migrations`.
- **Si la condición no se cumple: PARAR y devolver al leader.** La decisión de §3 se invierte y hay
  que hacer la migración aditiva. No se sigue por cuenta propia.
- **Depende de:** nada.

### T1. Revertir la migración vieja en la base del worktree
- **Archivos:** ninguno (operación sobre `QuimiCloude_QC47`).
- **Hecho cuando:** `pnpm run db:rollback` aplica el `down.sql` **viejo** y deja
  `_prisma_migrations` sin la fila de `20260904180600_companies_and_memberships`; `users.role_id`
  vuelve a existir en la base y no queda `companies` ni `memberships`.
- **Por qué antes de tocar el SQL:** después de reescribir los archivos, el `down.sql` viejo ya no
  existe y la base queda con una migración que el repo no puede deshacer.
- **Depende de:** T0.

---

## Tanda A — Deshacer el modelo viejo

> Esta tanda **no añade nada**. Su único producto es que el árbol vuelva al estado de `dev` en todo
> lo que la primera vuelta cambió por el modelo de muchos a muchos, conservando lo que sigue
> siendo válido (`design.md > 0`). Al final de la tanda el typecheck **estará roto a propósito**
> hasta T7: es esperable y no se parchea inventando columnas.

### T2. `[ID]` Quitar `Membership` del esquema y devolver `role_id` a `User`
- **Archivos:** `db/schema.prisma`.
- **Qué:** borrar `model Membership` entero; quitar `memberships Membership[]` de `User`, `Role` y
  `Company`; devolver a `Role` su `users User[]`; devolver a `User` el campo `roleId`, la relación
  `role` y el `@@index([roleId], map: "users_role_id_idx")` **con el texto exacto que tenían antes
  de esta feature**; reescribir el comentario `/// OJO 0` de `User`, que hoy afirma lo contrario de
  lo que la ficha decide.
- **Hecho cuando:** `rg 'Membership|memberships' db/schema.prisma` no devuelve nada, y el bloque
  `roleId` + `role` + `users_role_id_idx` de `User` es idéntico al de `dev`.
- **Depende de:** T1.

### T3. `[ID]` Devolver el rol a los tres consumidores de `identity`
- **Archivos:** `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`,
  `…/session-user-prisma.ts`, `…/initial-access-repository-prisma.ts`,
  `lib/modules/identity/ports/initial-access-repository.ts`,
  `lib/modules/identity/domain/seed-initial-access.ts`.
- **Qué:** `design.md > 5`. El `JOIN memberships` del login vuelve a `JOIN roles r ON r.id =
  u.role_id`; el `select { memberships: … }` de la sesión vuelve a `role: { select: { name: true }
  }` y desaparecen el `orderBy`, el `take: 1` y el `return null` por falta de pertenencia;
  `countLiveUsersWithRole` y el `catch (P2002)` de `createInitialAdmin` vuelven a
  `role: { name: roleName }` sobre `users`; `createInitialAdmin` deja de crear una pertenencia
  anidada. **`findCompanyIdByNormalizedName` y `createCompany` NO se tocan.**
- **Hecho cuando:** ningún archivo de `lib/` menciona `membership`, y las tres lecturas del rol
  salen de `users.role_id`.
- **Depende de:** T2.

### T4. `[P]` Borrar los tests del modelo muerto
- **Archivos:** `tests/unit/identity/schema/companies-migration.test.ts`,
  `tests/integration/identity/identity-constraints.int.test.ts`,
  `tests/unit/identity/seed/seed-initial-access.test.ts`,
  `tests/integration/identity/{identity-seed,login,session-user}.int.test.ts`,
  `tests/unit/identity/schema/identity-schema.test.ts`.
- **Qué:** borrar todo lo que afirma algo **sobre membresías** (`design.md > 6`, último párrafo):
  la pareja única `(user_id, company_id)`, las tres FK de `memberships`, «la misma persona en dos
  empresas con rol distinto», «un usuario vivo sin pertenencia no entra/no tiene sesión», el
  backfill del rol y la guardia de «exactamente una pertenencia» del DOWN. **Se borran, no se
  adaptan.**
- **NO se toca:** `tests/unit/identity/company-name.test.ts`, que sigue siendo válido entero.
- **Hecho cuando:** `rg -i 'membership|pertenencia' tests/` devuelve cero.
- **Depende de:** T2. Paralelizable con T5 y T6.

### T5. `[P]` Comprobar si el backfill puede escribir en `users` bajo `FORCE RLS`
Resuelve la pregunta abierta 3 de `requirements.md` y el riesgo 2 de `design.md > 8`.

- **Archivos:** ninguno de producción (comprobación ejecutable contra `QuimiCloude_QC47`).
- **Qué:** con el rol y la cadena que usa Prisma Migrate (`DIRECT_URL`), ejecutar un `UPDATE` sobre
  `users` y ver si Postgres lo deniega, estando `users` con `ENABLE` + `FORCE ROW LEVEL SECURITY`
  y sin policies.
- **Hecho cuando:** el resultado —pasa o no pasa— queda escrito en
  `progress/impl_QC-47-modelo-empresa-y-membresias.md` con la salida real, y la pregunta abierta 3
  queda cerrada en `requirements.md`. Si no pasa, se aplica la salida escrita en el riesgo 2 y se
  anota; **no se elige a ciegas.**
- **Depende de:** T1. Paralelizable con T4 y T6.

### T6. `[P]` Revertir los fixtures que no hacen falta (el rol vuelve)
- **Archivos:** los 19 de la tabla de `design.md > 6` (5 E2E + 14 de integración).
- **Qué:** deshacer el cambio de la primera vuelta: donde puso
  `memberships: { create: { companyId, roleId } }`, vuelve `roleId` como columna del `user.create`.
  Se quita la creación de la empresa efímera del `beforeAll` y el barrido de `memberships` del
  `afterAll`. **`companyId` todavía NO se añade: eso es T13**, cuando la columna exista.
- **Hecho cuando:** el diff de estos 19 archivos frente a `dev` es **vacío** salvo por lo que T13
  añadirá después. Cero coincidencias de `memberships`.
- **Depende de:** T2. Paralelizable con T4 y T5.

### T7. Cierre de tanda A
- **Hecho cuando:** `rg -i 'membership|memberships|pertenencia' lib/ app/ components/ scripts/ db/
  tests/ e2e/` devuelve **cero** (§0 de `design.md`), y el árbol coincide con `dev` en todo lo que
  no sea `companies`, `company-name.ts`, `companies.ts`, el export del contrato y la carpeta de
  migración (que se reescribe en la tanda B).
- **Depende de:** T3, T4, T6.

---

## Tanda B — El modelo nuevo en el esquema y en el SQL

### T8. `[ID]` `Company` sin membresías y `users.company_id` en el esquema
- **Archivos:** `db/schema.prisma`.
- **Qué:** `design.md > 1.1` y `> 1.2`. `Company` conserva todo menos `memberships`, gana
  `users User[]`, y su comentario se reescribe para que hable de la columna del usuario y no de una
  tabla intermedia; conserva el aviso de que `companies_name_unique` **no** está aquí y por qué.
  `User` gana `companyId` con `@relation` a `Company` (`Restrict`/`Cascade`) y
  `@@index([companyId], map: "users_company_id_idx")`.
- **Hecho cuando:** `prisma validate` pasa y el cliente generado expone `user.companyId` y
  `user.roleId` a la vez.
- **Depende de:** T7.

### T9. Reescribir `migration.sql` en su sitio y renombrar la carpeta
- **Archivos:** `db/migrations/20260904180600_companies_and_memberships/migration.sql` →
  `db/migrations/20260904180600_companies_and_user_company/migration.sql`.
- **Qué:** los diez pasos de `design.md > 3.1`, en ese orden, incluidos los tres `DROP INDEX` + los
  tres `CREATE UNIQUE INDEX` de `> 2.2` y el backfill de `> 3.2`. Borrar a mano los
  `DROP CONSTRAINT` que Prisma emite por drift sobre `orders`, `products`, `recipe_lines`,
  `recipes`, `supplier_catalog_lines` y `suppliers`.
- **Hecho cuando:** el archivo **no menciona** `memberships` ni `role_id` (fuera de comentarios), y
  `pnpm run db:migrate` la aplica limpia sobre `QuimiCloude_QC47`.
- **Depende de:** T8, T5.

### T10. Reescribir `down.sql` en su sitio
- **Archivos:** `db/migrations/20260904180600_companies_and_user_company/down.sql`.
- **Qué:** los siete pasos de `design.md > 3.3`, con la guardia de R26 **la primera** y los tres
  índices de QC-4 con su texto literal (`> 2.3`). **No menciona `role_id`, ni
  `users_role_id_fkey`, ni `users_role_id_idx`**: el UP tampoco los tocó.
- **Hecho cuando:** `pnpm run db:rollback` devuelve la base a un estado en el que un snapshot de
  `users` —columnas, índices y restricciones— es **idéntico** al de antes de aplicar T9, y
  `_prisma_migrations` queda sin la fila. Verificado contra Postgres real, no leído.
- **Depende de:** T9.

### T11. Test de esquema y de migración
- **Archivos:** `tests/unit/identity/schema/companies-migration.test.ts` (reescrito),
  `tests/unit/identity/schema/identity-schema.test.ts`.
- **Qué, como mínimo:**
  - los seis `CREATE UNIQUE INDEX` de §2.2 y §2.3, comparados contra el texto **leído** de
    `db/migrations/20260806122638_users_and_roles/migration.sql`, nunca copiado (R25);
  - que el UP **no menciona** `role_id` fuera de comentarios (R23) y que `users_role_id_fkey` y
    `users_role_id_idx` no aparecen en ninguno de los dos SQL (R13);
  - que el literal `'QuimiCloud'` / `'quimicloud'` del backfill coincide con
    `INITIAL_COMPANY_NAME` y `normalizeCompanyName` **importados de verdad** (R21);
  - que el backfill va **antes** de los `ALTER … ROW LEVEL SECURITY` y **antes** del `SET NOT NULL`;
  - que `companies` queda con RLS `ENABLE` **y** `FORCE` (R24);
  - que el UP no ejecuta DDL sobre ninguna tabla de otro módulo;
  - que `Company` declara `/// @module identity` (R27).
- **Hecho cuando:** cada aserción cae al mutar lo que vigila (se demuestra mutando, no leyendo).
- **Depende de:** T10.

### T12. Cierre de tanda B
- **Hecho cuando:** `./init.sh --rapido` en verde.
- **Depende de:** T11.

---

## Tanda C — Los consumidores y el seed

### T13. `[ID]` `createInitialAdmin` escribe la empresa como columna
- **Archivos:** `lib/modules/identity/ports/initial-access-repository.ts`,
  `lib/modules/identity/domain/seed-initial-access.ts`,
  `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts`.
- **Qué:** `design.md > 5.3`. `createInitialAdmin` recibe `roleId` **y** `companyId` y escribe las
  dos como columnas del `user.create`, en una sola sentencia dentro del mismo `tx` (R20). Se
  actualizan los comentarios que todavía hablen de la mudanza del rol.
- **Hecho cuando:** el seed crea empresa + usuario en una sola sentencia y ningún comentario del
  módulo afirma que el rol vive fuera de `users`.
- **Depende de:** T12.

### T14. `[SEED]` `scripts/seed.ts`: verificar que NO cambia
- **Archivos:** `scripts/seed.ts`.
- **Qué:** el script solo lee `outcome.createdRoles`, `outcome.createdAdmin` y
  `outcome.createdCompany` para su línea de resumen, y `SeedOutcome` se conserva íntegro
  (`design.md > 5.3`). La task existe **para dejar por escrito que el archivo no se toca**, no para
  tocarlo.
- **Hecho cuando:** el diff de `scripts/seed.ts` frente a `dev` es **vacío**, y dos corridas
  seguidas de `pnpm run db:seed` sobre `QuimiCloude_QC47` dejan `companies=1`, `users=1`, `roles=2`
  y la segunda no crea nada (R22).
- **Depende de:** T13.

### T15. `[P]` Tests de unidad del seed y del dominio
- **Archivos:** `tests/unit/identity/seed/seed-initial-access.test.ts`.
- **Qué:** con dobles del puerto: sobre base vacía crea la empresa inicial y el administrador
  dentro (R20); si la empresa ya existe la reutiliza por nombre normalizado y no crea otra (R22);
  sobre base con acceso inicial no toca `companies` ni para leer (R22); `needsAdmin` sale de
  `countLiveUsersWithRole('Administrador')` leído de `users.role_id` (R14).
- **Hecho cuando:** los cuatro casos existen y caen al mutar la implementación.
- **Depende de:** T13. Paralelizable con T16.

### T16. `[P]` Tests de integración de constraints contra Postgres real
- **Archivos:** `tests/integration/identity/identity-constraints.int.test.ts`.
- **Qué, como mínimo, cada uno dentro de una transacción que acaba en `ROLLBACK`:**
  - R4: segunda empresa con el mismo nombre en otras mayúsculas y con acentos → `23505`;
  - R5: el nombre de una empresa dada de baja se puede reutilizar;
  - R7: `created_at`/`updated_at` se rellenan solos y el segundo cambia al modificar;
  - R9/R10: usuario sin empresa → falla; usuario con empresa inexistente → `23503`;
  - R11: borrar una empresa con un usuario vivo → `23503`; **y con un usuario dado de baja también**;
  - R13: el usuario se crea con `role_id`, y borrar un rol en uso → `23503`;
  - R15: dos usuarios de empresas distintas con el mismo rol conviven;
  - **R16, R17, R18: el corazón de la ficha.** Mismo correo / mismo `username` / mismo documento
    → `23505` **dentro de la misma empresa**, y **aceptado** en empresas distintas. Los tres, en los
    dos sentidos;
  - R19: dar de baja a un usuario libera su correo, su `username` y su documento **dentro de su
    empresa**.
- **Hecho cuando:** los casos de R16–R18 fallan si alguien devuelve los índices a su forma de QC-4.
- **Depende de:** T13. Paralelizable con T15.

### T17. `[P]` Tests de integración del login y de la sesión
- **Archivos:** `tests/integration/identity/{login,session-user}.int.test.ts`.
- **Qué:** el rol resuelto es el de `users.role_id` y cambia con él (R14); un usuario dado de baja
  no entra ni tiene sesión; ninguna consulta necesita una segunda lectura para el rol.
- **Hecho cuando:** verde y sin ninguna mención de pertenencia.
- **Depende de:** T13. Paralelizable con T15 y T16.

### T18. Cierre de tanda C
- **Hecho cuando:** `./init.sh --rapido` en verde.
- **Depende de:** T14, T15, T16, T17.

---

## Tanda D — Fixtures ajenos, guardias y E2E

### T19. Añadir `companyId` a los 19 fixtures
- **Archivos:** los de la tabla de `design.md > 6` (5 E2E + 14 de integración).
- **Qué:** cada `user.create` gana `companyId`; cada spec crea su **empresa efímera propia** en el
  `beforeAll` (nombre con prefijo + `RUN_ID`, `nameNormalized` vía `normalizeCompanyName`, **nunca**
  la de instalación: `companies_name_unique` es global y chocaría con la del seed); el `afterAll`
  barre en orden `users → companies`.
- **Hecho cuando:** el diff de cada spec E2E **no contiene** coincidencias de `test(`, `expect(`,
  `getByRole`, `getByLabel`, `page.goto` ni `toHaveURL` (R28); todos los hunks caen en cabecera,
  imports, constantes de módulo, helpers de creación, `beforeAll` y `afterAll`.
- **Depende de:** T18.

### T20. Retensar las cuatro guardias de alcance ajenas
- **Archivos:** `tests/unit/identity/credential-policy-contract.test.ts`,
  `tests/unit/proveedores/module-contract.test.ts`, `tests/unit/proveedores/scope.test.ts`,
  `tests/unit/recetas-ui/recipe-route-contract.test.ts`.
- **Qué:** llevan congelada una foto del esquema. `User` recupera `roleId` y gana `companyId`;
  `relationTargets` pasa a `{ DocumentType, Company, Role }`; los censos de `db/migrations/` tienen
  que nombrar la carpeta **renombrada**. **Se retensan a la verdad nueva, no se relajan**: si una
  queda más floja que antes, está mal.
- **Hecho cuando:** las cuatro verdes, y cada cambio anotado en la bitácora para que el reviewer lo
  mire una a una (tocar la guardia de otra feature siempre merece un segundo par de ojos).
- **Depende de:** T19.

### T21. Barrido final de residuo del modelo viejo
- **Qué:** `rg -i 'membership|memberships|pertenencia' lib/ app/ components/ scripts/ db/ tests/
  e2e/` y `rg 'roleId|role_id' e2e/ tests/ lib/`.
- **Hecho cuando:** el primero devuelve cero; el segundo devuelve **solo** aciertos legítimos
  (`users.role_id` y sus lecturas, el SQL de QC-4, fixtures que lo escriben como columna).
- **Se repite después de cada merge de `dev`**, no una sola vez (`design.md > 8`, riesgo 5).
- **Depende de:** T20.

### T22. Comprobar que los E2E existentes siguen verdes
Es un requisito con nombre (R28, decisión cerrada 15), no una consecuencia.

- **Qué:** `pnpm exec playwright test e2e/login.spec.ts e2e/session.spec.ts e2e/inventario.spec.ts
  e2e/recetas.spec.ts e2e/proveedores.spec.ts`, chromium y webkit, sobre `QuimiCloude_QC47` ya
  sembrada.
- **Hecho cuando:** **los cinco specs pasan**, con el número de tests de cada uno anotado en la
  bitácora, y `git diff` confirma que ningún `test(...)` cambió de contenido. **No hay E2E nuevo**
  y no se añade ninguno.
- **Depende de:** T19, T21.

### T23. Bitácora y mapa de trazabilidad
- **Archivos:** `progress/impl_QC-47-modelo-empresa-y-membresias.md`.
- **Qué:** reescribirla entera para el modelo nuevo —la actual describe el viejo—, con el mapa
  `R1..R29 -> test concreto` **sin hueco** (`CHECKPOINTS.md > Trazabilidad`), la respuesta de T5 a
  la pregunta abierta 3, y la nota de T20 sobre las cuatro guardias ajenas.
- **Hecho cuando:** los 29 requisitos tienen su test nombrado por archivo y por título de test.
- **Depende de:** T22.

### T24. Cierre de feature
- **Hecho cuando:** `./init.sh` **completo** en verde (regla 5 de `CLAUDE.md`: obligatorio antes del
  PR, sin excepción), y `package.json` / `pnpm-lock.yaml` sin ningún cambio en el diff de la rama
  (R29).
- **Depende de:** T23.

---

## Grafo de dependencias

```
T0 → T1 → ┌ T2 → T3 ┐
          │    ↘ T4 │  (T4, T5, T6 en paralelo)
          │      T5 │
          └      T6 ┘ → T7 → T8 → T9 → T10 → T11 → T12
                                                     ↓
                                                    T13 → ┌ T14 ┐
                                                          │ T15 │ → T18
                                                          │ T16 │
                                                          └ T17 ┘
                                                                  ↓
                                        T19 → T20 → T21 → T22 → T23 → T24
```
