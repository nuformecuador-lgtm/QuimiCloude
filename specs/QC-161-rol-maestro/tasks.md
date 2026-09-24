# QC-161 — rol-maestro · tasks.md

> Desglose de `design.md`. Cada task lista **los archivos que toca** (el leader los usa para validar
> conflictos con otras features en curso: `permissions.ts` y los tests de recuento chocan con
> **QC-142** y **QC-168**; `db/migrations/` con cualquiera que traiga migración), su criterio de
> «hecho» y sus dependencias. `[P]` = puede ir en paralelo con las que se indican. Un commit por task
> (`docs/conventions.md > Commits`). En producción, ningún comentario cita fichas, requisitos,
> `design.md` ni «decisión cerrada»; al tocar un archivo se limpian los comentarios de **las líneas
> que toca la rama**, no el archivo entero. `R<n>` va en el **nombre** de los casos de test.
>
> **Base de datos propia, sin excepción: `QuimiCloude_QC161`.** La migración (T5), **todos** los
> tests de integración y cualquier E2E que corra el gate completo van contra esa base, con el `.env`
> git-ignorado del worktree apuntando a ella. **Nunca** contra la base del `.env` del árbol
> principal. Antes de cada `db:migrate`, `db:rollback`, `db:seed`, test de integración o E2E se
> comprueba que `DATABASE_URL` y `DIRECT_URL` nombran `QuimiCloude_QC161`.
>
> **Una sola E2E a la vez en la máquina.** Esta ficha no escribe E2E (R19), pero `./init.sh`
> completo puede correr la suite: antes de lanzarlo se comprueba que no hay otra corrida de
> Playwright viva en la máquina (de este u otro worktree), y si la hay, se espera.
>
> **Variables del Maestro.** Desde T7, el seed y la plantilla de integración exigen
> `SEED_MAESTRO_USERNAME`, `SEED_MAESTRO_PASSWORD` y `SEED_MAESTRO_EMAIL` en el `.env` del worktree
> (valores de prueba que cumplan la política de credenciales; nunca en un archivo versionado). Sin
> ellas falla toda la integración.
>
> Cada tanda se cierra con `./init.sh --rapido`; la ficha y el PR, con `./init.sh` completo.
> No se añade ninguna dependencia (R20). Las preguntas abiertas de `requirements.md` no bloquean
> ninguna task salvo donde se dice.

---

## Bloque 0 — Preparación

- [ ] **T0. Base propia y entorno del worktree.**
      - Archivos: `.env` del worktree (git-ignorado; no entra en el diff).
      - Proceso: crear `QuimiCloude_QC161`, apuntar `DATABASE_URL` y `DIRECT_URL` a ella, `db:migrate`
        y `db:seed` con el estado de `dev`; añadir las tres `SEED_MAESTRO_*` con valores de prueba.
      - **Hecho**: `DATABASE_URL`/`DIRECT_URL` nombran `QuimiCloude_QC161`, `db:migrate` al día,
        `./init.sh --rapido` verde **antes** de tocar nada, las tres variables presentes.
      - Depende de: nada.

## Bloque 1 — Rol y catálogo (dominio puro)

- [ ] **T1. El rol Maestro.** (`design.md > 3`; R2, R3, R4, R17.)
      - Archivos: `lib/modules/identity/domain/roles.ts` (`ROLE_MAESTRO`, fila al final de
        `SEED_ROLES`, cabecera «cuatro literales»), `lib/modules/identity/index.ts` (reexporta).
      - Tests: `tests/unit/identity/roles/maestro-rol.test.ts` (nuevo: R2, R3 barrido del literal
        sin comentarios con caso anti-cegado, R4, R17 barrido de `empresas.consultar`/`modificar`
        fuera de `permissions.ts` —con el mensaje de fallo que avisa a QC-162 de que tendrá que
        relajarlo—).
      - **Hecho**: typecheck y el test nuevo en verde.
      - Depende de: T0.

- [ ] **T2. Los dos permisos y quién los recibe.** (`design.md > 2.1–2.3`; R5–R9.)
      - Archivos: `lib/modules/identity/domain/permissions.ts` (dos entradas al final, párrafo de
        enmienda con su ordinal contra `dev`, frase del recuento —con o sin número según lo que
        apruebe el humano, `design.md > 2.2`—, clave `[ROLE_MAESTRO]` y su frase en el JSDoc).
      - Tests: `tests/unit/identity/permissions.test.ts` (R5: presencia de los dos, ningún otro
        `empresas.*`, los de antes siguen; R6; R7 con su caso simétrico sintético; R8; R9: el
        Administrador pasa a compararse con su propia lista a mano **sin** `empresas.*`, y los tres
        roles de empresa sin ninguno de los dos; `MODULOS`/`MODULOS_CON_ESCRITURA` suman `empresas`).
        **Ningún caso nuevo afirma el total.**
      - **Hecho**: `permissions.test.ts` y `guard-permisos-sembrados` en verde (esta última puede
        quedar roja solo por su número hasta T3).
      - Depende de: T1.

- [ ] **T3. Los sitios que afirman el total.** (`design.md > 2.4`; R5.)
      - Archivos (solo tests): `tests/guards/guard-permisos-sembrados.test.ts`,
        `tests/guards/guard-nav-permisos-declarados.test.ts`,
        `tests/unit/navegacion/qc75-convenciones.test.ts`, `tests/unit/documentos/authorization.test.ts`,
        `tests/unit/pedidos/qc145-estado-solo-planta.test.ts`,
        `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`,
        `tests/unit/identity/grupos/scope.test.ts`, `tests/unit/identity/roles/scope.test.ts`,
        `tests/unit/identity/seed/seed-initial-access.test.ts` (solo los números del catálogo y de
        asignaciones), `tests/integration/identity/identity-seed.int.test.ts` (ídem).
      - Proceso: aplicar la propuesta de `design.md > 2.4` **si el humano la aprobó** (números sueltos
        → derivados del dato real + presencia de códigos; `CODIGOS_DE_FICHAS_POSTERIORES` suma los dos);
        si no, subir cada número al valor que dé `dev` y anotar la tabla en `progress/impl_…`.
        Ningún test se relaja a `toBeGreaterThan` sin conservar la comparación contra una lista o
        contra el dato real.
      - **Hecho**: todos esos archivos en verde; grep de `toBe(18)`, `toHaveLength(18)`,
        «dieciocho», `toBe(22)`, «veintidos» sin coincidencias del catálogo en `tests/`.
      - Depende de: T2.

- [ ] **T4. [P con T3] La guardia de autorización por permiso.** (`design.md > 8`; R16.)
      - Archivos: `tests/guards/guard-autorizacion-por-permiso.test.ts` (literal e identificador de
        `ROLE_MAESTRO` en `buildForbiddenPatterns`, ancla tensada, casos «dispara»/«no dispara»).
      - **Hecho**: la guardia en verde y sus casos nuevos mordiendo.
      - Depende de: T1.

## Bloque 2 — Base de datos

- [ ] **T5. Esquema y migración.** (`design.md > 4`; R20–R22, R26–R28.)
      - Archivos: `db/schema.prisma` (`User.companyId String?`, `company Company?`, comentario del
        porqué y de los índices sin empresa),
        `db/migrations/<ts>_platform_maestro_role/migration.sql` y `down.sql` (nuevos; `<ts>` mayor
        que la última migración de `dev` al crearla).
      - Tests: `tests/unit/identity/schema/maestro-migration.test.ts` (nuevo, estático: orden del UP,
        literales comparados contra `ROLE_MAESTRO`/`SEED_ROLES`/`PERMISSIONS`/`SEED_ROLE_PERMISSIONS`
        importados, códigos de error del disparador, `UPDATE OF "company_id", "role_id"`, tres índices
        parciales, ningún otro rol en `role_permissions`; DOWN con `SET NOT NULL` antes de cualquier
        `DELETE`, sin `CASCADE`, sin `CREATE TABLE`), `tests/unit/identity/schema/identity-schema.test.ts`
        (`companyId` opcional, `@db.Uuid`, `@map`, sin `@default`) y cualquier test que enumere los
        índices de `users`.
      - Proceso: `db:migrate:create` tras cambiar el esquema; borrar el drift de FK escritas a mano
        si aparece (y decirlo en la cabecera); contra **`QuimiCloude_QC161`**, `db:migrate` →
        `db:rollback` → `db:migrate`, salida pegada en `progress/impl_QC-161-rol-maestro.md`;
        `prisma generate`.
      - **Hecho**: ciclo real completo sobre `QuimiCloude_QC161`, test estático y de esquema en verde.
        El typecheck puede quedar rojo en el camino de sesión y del seed hasta T7/T9: se cierran en la
        misma tanda.
      - Depende de: T1, T2.

- [ ] **T6. La base garantiza la empresa según el rol.** (R21, R22, R26, R27, R28.)
      - Archivos (solo tests): `tests/integration/identity/maestro-migration.int.test.ts` (nuevo: UP
        leído del archivo sobre base sembrada en transacción revertida, dos veces; DOWN sin Maestro y
        con Maestro; `23502` y `23514` al insertar y al actualizar; unicidad entre usuarios sin
        empresa, vivos y dados de baja), `tests/integration/identity/identity-constraints.int.test.ts`
        (el caso `:1194-1211` sigue con su `23502`; se añade solo si hace falta nombrarlo con R26).
      - **Hecho**: en verde contra `QuimiCloude_QC161`.
      - Depende de: T5. Bloquea en parte: **R28 depende de la pregunta abierta 3**; si el humano la
        rechaza, T5 quita los tres índices y este test quita sus casos.

## Bloque 3 — El seed

- [ ] **T7. El primer Maestro.** (`design.md > 5`; R10–R15.)
      - Archivos: `lib/modules/identity/ports/initial-access-credentials.ts`,
        `lib/modules/identity/ports/initial-access-repository.ts` (`createInitialMaestro`),
        `lib/modules/identity/domain/seed-initial-access.ts`,
        `lib/modules/identity/domain/account-status.ts` (solo si hace falta la constante hermana),
        `lib/modules/identity/adapters/driven/config/initial-access-credentials-env.ts`,
        `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts`,
        `lib/composition/index.ts` (solo el cableado de `seedInitialAccess`),
        `scripts/seed.ts`, `.env.example`.
      - Tests: `tests/unit/identity/seed/seed-initial-access.test.ts` (R10, R11, R12 —ningún método de
        escritura llamado, ni roles—, R13, R15; dobles con `maestroCredentials` y
        `createInitialMaestro`; listas de roles derivadas de `SEED_ROLES`),
        `tests/unit/identity/seed/initial-access-credentials-env.test.ts` (R12),
        `tests/unit/identity/seed/deploy-hook.test.ts` (R14), `tests/guards/guard-password-never-plaintext.test.ts`
        y `tests/guards/guard-rol-administrador-unico.test.ts` sin tocar y en verde.
      - **Hecho**: typecheck del seed y estos tests en verde; `db:seed` contra `QuimiCloude_QC161`
        crea el Maestro la primera vez y dice «ya existia» la segunda (salida pegada en `progress/`).
      - Depende de: T1, T2, T5. Los marcadores de nombre siguen la **pregunta abierta 6**.

- [ ] **T8. El seed contra Postgres.** (R4, R10, R15, R18.)
      - Archivos (solo tests): `tests/integration/identity/identity-seed.int.test.ts` (dos corridas;
        para **cada** rol de `SEED_ROLES`, permisos en base = permisos del dominio; una sola fila
        `Maestro`; Maestro sin empresa y `active`; los casos de variables guardan y restauran también
        las `SEED_MAESTRO_*`).
      - **Hecho**: en verde contra `QuimiCloude_QC161`.
      - Depende de: T6, T7.

## Bloque 4 — La sesión sin empresa

- [ ] **T9. Del login a la resolución de la sesión.** (`design.md > 6.1–6.4`; R30, R31, R32, R35.)
      - Archivos: `lib/modules/identity/domain/session.ts`, `domain/session-claims.ts`,
        `domain/resolve-session.ts`, `ports/user-credentials-reader.ts`, `ports/session-user-reader.ts`,
        `ports/session-provider.ts` (JSDoc del contrato enmendado),
        `adapters/driven/session/session-token.ts` (tipo del payload; **sin** subir la versión),
        `adapters/driven/persistence/user-credentials-prisma.ts` (`LEFT JOIN companies`),
        `adapters/driven/persistence/session-user-prisma.ts`.
      - Tests: `tests/unit/identity/session-claims.test.ts` (R32: `null` explícito válido; ausente,
        vacío, número y no-UUID inválidos), `resolve-session.test.ts` (R31, R32),
        `verify-credentials.test.ts` (R30), `route-guard-middleware.test.ts` (R31),
        `end-session.test.ts` (R35), y los tests de `session-token` / `session-user-prisma` /
        `user-credentials-prisma` que el cambio de tipos ponga rojos.
      - **Hecho**: `pnpm run typecheck` en verde en todo el repo y estos tests en verde.
      - Depende de: T5.

- [ ] **T10. [P con T11] El actor sin empresa, el aterrizaje y las pantallas.** (R29, R33, R34.)
      - Archivos (solo tests): `tests/unit/identity/maestro-sin-empresa-actions.test.ts` (nuevo: acción
        representativa de `inventario`, `pedidos`, `unidades` e `identity` con usuario de catálogo
        completo y contexto `null` → no autorizada, repositorio sin llamar),
        `tests/unit/identity/login-action.test.ts` (R33), `tests/unit/identity/require-page-permission.test.ts` (R34).
      - **Hecho**: en verde **sin tocar ningún archivo de producción** fuera de los de T9; si alguno
        hace falta, se para y se vuelve al design.
      - Depende de: T9.

- [ ] **T11. [P con T10] Login y sesión contra Postgres.** (R30, R31.)
      - Archivos (solo tests): `tests/integration/identity/login.int.test.ts`,
        `tests/integration/identity/session-user.int.test.ts` (fixture propio: un usuario Maestro sin
        empresa creado en la transacción del test, no el del seed).
      - **Hecho**: en verde contra `QuimiCloude_QC161`.
      - Depende de: T6, T9.

## Bloque 5 — El selector de roles

- [ ] **T12. [P con T9] El Maestro nunca se asigna.** (`design.md > 7`; R1, R23, R24, R25.)
      - Archivos: `lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts`,
        `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` (alta y edición; la
        guarda del último administrador intacta).
      - Tests: `tests/integration/identity/role-catalog.int.test.ts` (R23),
        `tests/integration/identity/user-crud.int.test.ts` (R24, R25 con actor con
        `usuarios.modificar`, cero filas escritas; R1: lista, edición, baja y estado con el id del
        Maestro → «no encontrado»), y los unitarios de esos dos adaptadores si existen y enumeran la
        exclusión.
      - **Hecho**: en verde contra `QuimiCloude_QC161`.
      - Depende de: T1, T5 (y T7 si el test usa el Maestro del seed; si crea el suyo, solo T5).

## Bloque 6 — Documentación y cierre

- [ ] **T13. [P con T10–T12] Documentación de arquitectura.** (R26, R27.)
      - Archivos: `docs/architecture.md` (`## Dominio` n.º 1: `users.company_id` obligatoria **salvo
        para el Maestro**, con el disparador como garantía), `tests/guards/guard-empresa-en-esquema.test.ts`
        (solo la redacción del motivo de `revoked_sessions`/`credential_setup_tokens`; la lista no
        cambia).
      - **Hecho**: guardia en verde, lista de exentas idéntica.
      - Depende de: T5.

- [ ] **T14. Gate completo y trazabilidad.**
      - Archivos: `progress/impl_QC-161-rol-maestro.md` (mapa `R1..R35 → test` completo; salida del
        ciclo de migración; salida de `db:seed`; la tabla de recuentos de `design.md > 2.4` tal como
        quedó; **precondición de despliegue**: las tres `SEED_MAESTRO_*` en Vercel producción y
        preview antes del merge —pregunta abierta 1—).
      - Proceso: `./init.sh` completo contra `QuimiCloude_QC161`, con **una sola** E2E viva en la
        máquina. R19: `git diff --stat -- e2e/` vacío. R20: `package.json` sin cambios.
      - **Hecho**: `./init.sh` verde, mapa sin ningún `R<n>` sin test, y el leader ha preguntado al
        humano por las variables de Vercel antes de abrir el PR.
      - Depende de: T1–T13.
