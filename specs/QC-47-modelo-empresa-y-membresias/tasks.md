# QC-47 — modelo-empresa-y-membresias · tasks.md

> Orden de arriba abajo. `[P]` = paralelizable con la task marcada igual que tiene la misma
> dependencia. **`⚠ REGRESIÓN`** marca las tasks que tocan `lib/modules/identity/**` o
> `scripts/seed.ts`: es donde vive el riesgo de esta ficha, porque el seed y el login cambian de
> **fuente** para el rol sin poder cambiar de **resultado** (decisión cerrada 6, R16).
>
> Cierre de cada tanda con `./init.sh --rapido`; `./init.sh` completo para cerrar la feature y
> **antes del PR, sin excepción** (regla 5 de `CLAUDE.md`).

## Bloque A — dominio puro (sin base, sin migración)

- [x] **T1 · `normalizeCompanyName`.**
      Archivos: `lib/modules/identity/domain/company-name.ts` (nuevo).
      Función pura, misma forma y mismo comportamiento que `normalizeUnitName`
      (`lib/modules/unidades/domain/unit-name.ts`): sin acentos, sin caracteres especiales, sin
      distinguir mayúsculas. Sin imports de framework, Prisma ni `lib/shared`.
      *Hecho*: `tests/unit/identity/company-name.test.ts` en verde con los casos con acento, con
      mayúsculas y con signos (R3).

- [x] **T2 [P] · La constante del nombre de la empresa inicial.**
      Archivos: `lib/modules/identity/domain/companies.ts` (nuevo).
      `export const INITIAL_COMPANY_NAME` con el literal de `design.md > 6.1`. Único sitio del repo
      que lo escribe en TypeScript, mismo criterio que `roles.ts` con `'Administrador'`.
      *Hecho*: existe, tipa, y `rg` no encuentra ese literal en ningún otro `.ts` (R20).
      **Depende de**: la respuesta del humano a la pregunta abierta 4 al aprobar el spec. Si no dice
      nada, se implementa la posición por defecto escrita en el `design.md`.

- [x] **T3 · Contrato público.** ⚠ REGRESIÓN
      Archivos: `lib/modules/identity/index.ts`.
      Reexporta `normalizeCompanyName` e `INITIAL_COMPANY_NAME`. Solo desde `./domain`.
      *Hecho*: `pnpm run test:guardias` verde — el bloque 6 de `guard-arquitectura-modulos`
      comprueba que el contrato no arrastra servidor ni Prisma.
      **Depende de**: T1, T2.

## Bloque B — esquema

- [x] **T4 · Los dos modelos nuevos en el esquema.**
      Archivos: `db/schema.prisma`.
      `Company` y `Membership` según `design.md > 2.1` y `> 2.2`, cada uno con su `/// @module
      identity` (R22) y con el comentario `///` que explica **por qué** la unicidad del nombre de
      empresa NO está aquí como `@@unique` (es funcional y parcial, vive a mano en el SQL), con el
      mismo tono que los de `Recipe` y `Supplier`.
      *Hecho*: `pnpm prisma validate` pasa y `pnpm prisma generate` produce el cliente.

- [x] **T5 · `User` pierde el rol.**
      Archivos: `db/schema.prisma`.
      Fuera `roleId`, la relación `role` y `@@index([roleId])`; dentro `memberships Membership[]`.
      Fuera también `users User[]` de `Role`, sustituido por `memberships Membership[]`.
      *Hecho*: el esquema valida y el cliente generado ya no expone `user.roleId`. El typecheck
      **va a romper** en los tres consumidores del bloque D: es la señal de que no queda ninguna
      lectura oculta (R14).
      **Depende de**: T4.

- [x] **T6 · Test de esquema.**
      Archivos: `tests/unit/identity/schema/identity-schema.test.ts` (existente).
      Amplía: `@module identity` en los dos modelos nuevos; `User` sin ninguna columna de rol;
      `Membership` con sus tres referencias obligatorias, su `@@unique(user_id, company_id)` y **sin**
      `deleted_at`; `Company` con `deleted_at` y sin `@@unique` sobre el nombre.
      *Hecho*: verde, y **falla** si se le devuelve `roleId` a `User` (R12, R14, R22).
      **Depende de**: T5.

## Bloque C — migración

- [x] **T7 · Generar y limpiar el `migration.sql`.**
      Archivos: `db/migrations/<ts>_companies_and_memberships/migration.sql` (nuevo).
      `pnpm run db:migrate:create`, y después **a mano**: borrar todos los `DROP` de drift que Prisma
      emite sobre lo que no conoce —los tres índices únicos funcionales de `users`, las FK
      manuales de `products`/`recipes`/`recipe_lines`/`suppliers`/`supplier_catalog_lines`/`orders`,
      sus `CHECK` y sus `ALTER ... ROW LEVEL SECURITY`— y reordenar según `design.md > 4.1`.
      *Hecho*: el archivo no contiene ningún `DROP` sobre `users_email_unique`,
      `users_username_unique`, `users_document_unique` ni sobre ninguna FK/CHECK/RLS ajena (R27).
      **Depende de**: T5.

- [x] **T8 · Completar el UP a mano.**
      Archivos: el mismo `migration.sql`.
      Añade, en el orden de `design.md > 4.1`: `CREATE EXTENSION IF NOT EXISTS pgcrypto`, el índice
      único **parcial y funcional** `companies_name_unique`, el bloque `DO $$` del backfill
      (sección 4.2) y los cuatro `ALTER ... ROW LEVEL SECURITY` **al final** (R23). El `DROP COLUMN
      "role_id"` va **después** del backfill.
      *Hecho*: `pnpm run db:migrate` aplica limpio sobre una base con usuarios y cada usuario queda
      con exactamente una pertenencia y su rol de antes (R24).
      **Depende de**: T2 (el literal del backfill), T7.

- [x] **T9 · Escribir el `down.sql`.**
      Archivos: `db/migrations/<ts>_companies_and_memberships/down.sql` (nuevo).
      Los seis pasos de `design.md > 4.3`: guardia de reversión, `ADD COLUMN` anulable, `UPDATE`
      desde la pertenencia, `SET NOT NULL`, recreación **a mano** de `users_role_id_fkey` y
      `users_role_id_idx`, y `DROP TABLE` de las dos tablas en orden inverso a la FK. Sin tocar
      pgcrypto ni los índices de QC-4.
      *Hecho*: `pnpm run db:rollback` deja el esquema **idéntico** al de antes de T8 —comparación de
      `\d users` antes y después, FK e índice incluidos— y `_prisma_migrations` queda marcada como
      revertida (R25). Con un usuario con dos pertenencias, aborta con el mensaje de R26 y no
      cambia nada.
      **Depende de**: T8.

- [x] **T10 · Test de migración.**
      Archivos: `tests/unit/identity/schema/companies-migration.test.ts` (nuevo).
      Sobre el texto de los dos SQL: el backfill va antes de los `FORCE ROW LEVEL SECURITY`; las dos
      tablas tienen `ENABLE` **y** `FORCE`; el `down.sql` recrea la FK y el índice de `role_id` con
      exactamente el mismo texto que la migración de QC-4; el literal de empresa del `INSERT`
      coincide con `INITIAL_COMPANY_NAME` y su `name_normalized` con lo que devuelve
      `normalizeCompanyName` **importada de verdad** (R20, el patrón de QC-32); y el `migration.sql`
      no contiene ningún `DROP` de los nombres de T7.
      *Hecho*: verde, y **falla** si se mueve el `INSERT` detrás del `FORCE` o si se cambia el
      literal sin cambiar la constante.
      **Depende de**: T9.

## Bloque D — los tres consumidores del rol ⚠ REGRESIÓN

> Aquí es donde esta ficha se rompe si se rompe. Los tres cambian de **fuente** y ninguno puede
> cambiar de **resultado** (R16, decisión cerrada 6).

- [x] **T11 · Login: la consulta de credenciales.** ⚠ REGRESIÓN
      Archivos: `lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`.
      El `$queryRaw` gana `JOIN memberships` y el `JOIN roles` pasa por `m.role_id`
      (`design.md > 5.1`). Sigue siendo **una** consulta, sigue siendo `$queryRaw` parametrizado —no
      se pasa a la API tipada, eso reintroduciría el seq scan— y sigue siendo `INNER JOIN`.
      **Actualizar el comentario del archivo**: la garantía de «todo usuario que entra tiene rol» ya
      no la da el `NOT NULL` de `role_id` sino la existencia de la pertenencia.
      *Hecho*: unitario del adaptador que devuelve `roleName` desde la pertenencia y `null` cuando
      no hay ninguna (R16, R17).
      **Depende de**: T8.

- [x] **T12 [P] · Sesión: la lectura del usuario.** ⚠ REGRESIÓN
      Archivos: `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts`.
      El `select` cambia `role` por `memberships` (`design.md > 5.2`). `select` explícito y mínimo:
      ni correo, ni teléfono, ni documento, ni `password_hash`. Sin pertenencia → `null`.
      *Hecho*: unitario en verde; sigue siendo una sola consulta por clave primaria (R15, R17).
      **Depende de**: T8.

- [x] **T13 · Seed: el puerto.** ⚠ REGRESIÓN
      Archivos: `lib/modules/identity/ports/initial-access-repository.ts`.
      Añade `findCompanyIdByNormalizedName` y `createCompany`; `createInitialAdmin` recibe ahora
      `companyId` además de `roleId` y **crea usuario y pertenencia en la misma llamada**
      (`design.md > 5.3`). Sigue sin exponer ningún `update` ni `upsert`.
      *Hecho*: tipa; el dominio compila contra el puerto nuevo.
      **Depende de**: T5.

- [x] **T14 · Seed: el caso de uso.** ⚠ REGRESIÓN
      Archivos: `lib/modules/identity/domain/seed-initial-access.ts`.
      Resuelve la empresa inicial por nombre normalizado (la reutiliza si existe, la crea si no) y
      crea la pertenencia junto con el usuario. `needsAdmin` sigue saliendo de
      `countLiveUsersWithRole`. El orden no cambia: política de credenciales → hash → escrituras.
      *Hecho*: `tests/unit/identity/seed-initial-access.test.ts` ampliado, con dobles del puerto,
      cubriendo base vacía (R18) y segunda corrida sin crear nada (R19).
      **Depende de**: T13.

- [x] **T15 · Seed: el adaptador Prisma.** ⚠ REGRESIÓN
      Archivos:
      `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts`.
      Implementa los métodos nuevos sobre el mismo `db` (`PrismaClient | Prisma.TransactionClient`),
      para que sigan cayendo dentro de `withInitialAccessTransaction` (R18, atomicidad).
      **`countLiveUsersWithRole` pasa de `role: { name }` a `memberships: { some: { role: { name } } }`
      con `deletedAt: null`** — es el punto exacto donde una traducción mal hecha rompe la
      idempotencia y crea un segundo administrador en cada despliegue (`design.md > 9`, riesgo 1).
      Conserva los dos `catch` de `P2002` y su relectura, sin sobrescribir nada.
      *Hecho*: `tests/integration/identity/identity-seed.int.test.ts` ampliado y verde: dos corridas
      seguidas dentro de una transacción con `ROLLBACK` dejan una sola empresa, un solo admin y una
      sola pertenencia (R19).
      **Depende de**: T13, T8.

- [x] **T16 · Cableado.** ⚠ REGRESIÓN
      Archivos: `lib/composition/index.ts`.
      `seedInitialAccess` sigue envuelto en `withInitialAccessTransaction`; solo se suman los
      métodos nuevos del repositorio. **No se reordena ni se reformatea nada más del archivo**:
      diff mínimo, es un archivo que tocan varias sesiones.
      *Hecho*: typecheck verde y `pnpm run test:guardias` verde (bloques 7, 12 y 13).
      **Depende de**: T14, T15.

- [x] **T17 · `scripts/seed.ts`.** ⚠ REGRESIÓN
      Archivos: `scripts/seed.ts`.
      Sigue siendo una cáscara fina: carga entorno, invoca la composición, resume por consola **sin
      secretos**, traduce a código de salida. Único cambio admisible: mencionar la empresa en la
      línea de resumen si `SeedOutcome` la reporta.
      *Hecho*: `pnpm run db:seed` sobre base limpia deja roles + empresa + admin + pertenencia, y
      una segunda corrida imprime que no hay nada que crear (R18, R19).
      **Depende de**: T16.

## Bloque E — constraints contra Postgres real

- [ ] **T18 · Test de integración de restricciones.**
      Archivos: `tests/integration/identity/identity-constraints.int.test.ts` (existente).
      Añade, dentro de transacción con `ROLLBACK`: dos empresas con el mismo nombre en distinta
      capitalización y con acentos chocan (R4); dos pertenencias con la misma pareja usuario+empresa
      chocan (R9); una pertenencia con usuario, empresa o rol inexistente es rechazada (R10);
      borrar una empresa o un rol con pertenencia es rechazado (R11). **Y quita** lo que ese archivo
      comprueba hoy sobre `users.role_id`, que ya no existe.
      *Hecho*: verde contra la base de test, cada aserción sobre el SQLSTATE esperado.
      **Depende de**: T8.

## Bloque F — cierre

- [ ] **T19 · Barrido de lectores huérfanos del rol.** ⚠ REGRESIÓN
      Archivos: todo el repo (búsqueda, no edición masiva).
      `rg 'role_id|roleId'` sobre `lib/`, `app/`, `components/`, `scripts/`, `tests/`, `db/`: lo
      único que puede quedar es dentro de `memberships`, del `down.sql` y de la migración de QC-4.
      Ojo a `tests/unit/identity/schema/identity-migration.test.ts` y a
      `tests/unit/inventario/schema/inventario-audit-migration.test.ts`, que hoy mencionan
      `role_id`.
      *Hecho*: la búsqueda no devuelve ninguna lectura del rol desde `users` (R14).
      **Depende de**: T11, T12, T15.

- [ ] **T20 · El E2E de login de QC-7 sigue verde, sin tocar su guion.**
      Archivos: `e2e/login.spec.ts` y `e2e/session.spec.ts` — **se ejecutan, no se editan**.
      Es la decisión cerrada 14: no hay E2E nuevo, y este es el que demuestra que nada se rompió
      hacia fuera. El rol firmado en la cookie tiene que seguir llevando a las mismas pantallas.
      *Hecho*: `pnpm run test:e2e` verde **con el archivo sin cambios en git**. Si hubo que tocarlo,
      algo cambió hacia fuera y eso contradice la decisión 6: parar y avisar al leader (R16, R28).
      **Depende de**: T17, T19.

- [ ] **T21 · Trazabilidad y gate completo.**
      Archivos: `progress/impl_QC-47-modelo-empresa-y-membresias.md`.
      Mapa `R1..R29 -> test concreto`, sin ningún hueco (regla 4 de `CLAUDE.md`,
      `CHECKPOINTS.md > Trazabilidad`). Repasar además la casilla nueva de
      `CHECKPOINTS.md > Datos y seguridad`: esta ficha **no** crea ninguna tabla de operación, así
      que la exención de `users`/`roles`/`document_types` sigue intacta y `companies`/`memberships`
      no llevan columna de empresa **por ser ellas mismas la frontera** — dejarlo escrito, porque es
      la excepción que un reviewer va a mirar.
      *Hecho*: `./init.sh` completo en verde y el mapa sin `R<n>` huérfano.
      **Depende de**: todas.
