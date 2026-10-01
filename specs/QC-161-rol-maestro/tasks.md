# QC-161 — rol-maestro · tasks.md

> Desglose de `design.md`. Cada task lista **los archivos que toca** (el leader los usa para validar
> conflictos con otras features en curso: `permissions.ts` y las listas a mano del catálogo chocan
> con **QC-168** y **QC-169** si enmiendan el catálogo; `db/migrations/` con cualquiera que traiga
> migración; `error-catalog.ts` con cualquiera que toque mensajes), su criterio de «hecho» y sus
> dependencias. `[P]` = puede ir en paralelo con las que se indican. Un commit por task
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
> **Variables del Maestro (D17).** Desde T7, el seed y la plantilla de integración exigen
> `SEED_MAESTRO_USERNAME`, `SEED_MAESTRO_PASSWORD` y `SEED_MAESTRO_EMAIL` en el `.env` del worktree
> (valores de prueba que cumplan la política de credenciales; nunca en un archivo versionado). Sin
> ellas falla toda la integración. `SEED_MAESTRO_USERNAME` **no** puede coincidir con
> `SEED_ADMIN_USERNAME` ni con ningún nombre fijo de los fixtures (`admin`, `anaperez`, `ana.a`,
> `ana.b`, `otra.a`, `sinempresa`…): la plantilla lleva al Maestro sembrado y el nombre de usuario
> pasa a ser único en todo el sistema (`design.md > 5.3`). Propuesta: `plataforma.inicial`.
>
> Cada tanda se cierra con `./init.sh --rapido`; la ficha y el PR, con `./init.sh` completo.
> No se añade ninguna dependencia (R20). La única pregunta abierta (duplicados ya existentes, R39)
> no bloquea ninguna task: solo decide el texto de la guardia de T5 y una precondición de T14.

---

## Bloque 0 — Preparación

- [x] **T0. Base propia, entorno del worktree y re-medición contra `origin/dev`.**
      - Archivos: `.env` del worktree (git-ignorado; no entra en el diff).
      - Proceso: traer `origin/dev` a la rama; crear `QuimiCloude_QC161`, apuntar `DATABASE_URL` y
        `DIRECT_URL` a ella, `db:migrate` y `db:seed` con el estado de `dev`; añadir las tres
        `SEED_MAESTRO_*` con valores de prueba (nombre distinto del Administrador y de los fixtures).
        Repetir las mediciones de `design.md > 0` (hallazgos 1, 2, 17, 20) contra `origin/dev` y
        anotar en `progress/impl_QC-161-rol-maestro.md` cualquier línea que se haya movido.
      - **Hecho**: `DATABASE_URL`/`DIRECT_URL` nombran `QuimiCloude_QC161`, `db:migrate` al día,
        `./init.sh --rapido` verde **antes** de tocar nada, las tres variables presentes, mediciones
        anotadas.
      - Depende de: nada.

## Bloque 1 — Rol y catálogo (dominio puro)

- [x] **T1. El rol Maestro.** (`design.md > 3`; R2, R3, R4, R17.)
      - Archivos: `lib/modules/identity/domain/roles.ts` (`ROLE_MAESTRO`, fila al final de
        `SEED_ROLES`, cabecera «cuatro literales»), `lib/modules/identity/index.ts` (reexporta).
      - Tests: `tests/unit/identity/roles/maestro-rol.test.ts` (nuevo: R2 —incluida la descripción
        del Administrador intacta—, R3 barrido del literal sin comentarios con caso anti-cegado, R4,
        R17 barrido de `empresas.consultar`/`modificar` fuera de `permissions.ts` —con el mensaje de
        fallo que avisa a QC-162 de que tendrá que relajarlo—).
      - **Hecho**: typecheck y el test nuevo en verde.
      - Depende de: T0.

- [x] **T2. Los dos permisos y quién los recibe.** (`design.md > 2.1–2.3`; R5–R9.)
      - Archivos: `lib/modules/identity/domain/permissions.ts` (dos entradas al final, párrafo de
        enmienda con su ordinal contra `dev` —hoy «Séptima»—, clave `[ROLE_MAESTRO]` y su frase en el
        JSDoc; la frase del recuento **no** se toca: ya no tiene número).
      - Tests: `tests/unit/identity/permissions.test.ts` (R5: presencia de los dos, ningún otro
        `empresas.*`, los de antes siguen; R6; R7 con su caso simétrico sintético; R8; R9: el
        Administrador pasa a compararse con el catálogo **sin** `empresas.*` en `:381-382, 459-461,
        464-467, 496-507`, y los tres roles de empresa sin ninguno de los dos; `CODIGOS_DEL_REQUISITO`
        suma los dos; `MODULOS`/`MODULOS_CON_ESCRITURA` suman `empresas`; `:296-312` filtra y añade
        `empresas.*`). **Ningún caso nuevo afirma el total.**
      - **Hecho**: `permissions.test.ts`, `guard-permisos-sembrados` y `catalogo-sin-total-fijo` en
        verde.
      - Depende de: T1.

- [x] **T3. Las demás listas a mano y «Administrador = catálogo entero».** (`design.md > 2.4`; R5, R9.)
      - Archivos (solo tests): `tests/unit/navegacion/qc75-convenciones.test.ts` (`CODIGOS_QC74` +
        módulos esperados con `empresas`), `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`
        (`CODIGOS_DE_FICHAS_POSTERIORES`), `tests/unit/identity/seed/seed-initial-access.test.ts`
        (solo `:752-756`), `tests/integration/identity/identity-seed.int.test.ts` (solo `:795-798,
        835, 872, 1038`).
      - Proceso: según la tabla de `design.md > 2.4`. Ningún test se relaja a `toBeGreaterThan` sin
        conservar la comparación contra una lista o contra el dato del dominio, y ninguno escribe un
        total literal (la guardia de QC-142 lo impide).
      - **Hecho**: esos archivos en verde; `catalogo-sin-total-fijo` en verde.
      - Depende de: T2.

- [x] **T4. [P con T3] La guardia de autorización por permiso.** (`design.md > 8`; R16.)
      - Archivos: `tests/guards/guard-autorizacion-por-permiso.test.ts` (literal e identificador de
        `ROLE_MAESTRO` en `buildForbiddenPatterns`, ancla tensada, casos «dispara»/«no dispara»).
      - **Hecho**: la guardia en verde y sus casos nuevos mordiendo.
      - Depende de: T1.

## Bloque 2 — Base de datos

- [x] **T5. Esquema y migración.** (`design.md > 4`; R20–R22, R26–R28, R36–R39.)
      - Archivos: `db/schema.prisma` (`User.companyId String?`, `company Company?`, comentario del
        porqué; comentario de `:86-89` reescrito: nombre de usuario global, correo y documento por
        empresa más sin empresa), `db/migrations/<ts>_platform_maestro_role/migration.sql` y
        `down.sql` (nuevos; `<ts>` mayor que la última migración de `dev` al crearla, hoy
        `20260924190100`).
      - Contenido del UP: **guardia de nombres de usuario repetidos la primera** (texto según la
        respuesta a la pregunta abierta 1: con nombres o solo con el número), `DROP NOT NULL`, rol,
        permisos, asignaciones, disparador, `users_username_unique` global con el texto de QC-4, y
        los dos índices sin empresa (correo, documento). DOWN: `users_username_unique` vuelve al
        texto de QC-47.
      - Tests: `tests/unit/identity/schema/maestro-migration.test.ts` (nuevo, estático: guardia
        primera y sin `UPDATE`/`DELETE` de `users`; orden del UP; literales comparados contra
        `ROLE_MAESTRO`/`SEED_ROLES`/`PERMISSIONS`/`SEED_ROLE_PERMISSIONS` importados; índice global
        = texto leído de QC-4, DOWN = texto leído de QC-47; dos índices parciales y ninguno de nombre
        de usuario sin empresa; códigos de error del disparador; `UPDATE OF "company_id", "role_id"`;
        ningún otro rol en `role_permissions`; DOWN con `SET NOT NULL` antes de cualquier `DELETE`,
        sin `CASCADE`, sin `CREATE TABLE`), `tests/unit/identity/schema/identity-schema.test.ts`
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

- [x] **T6. La base garantiza empresa según rol y la unicidad nueva.** (R21, R22, R26–R28, R36–R39.)
      - Archivos (solo tests): `tests/integration/identity/maestro-migration.int.test.ts` (nuevo: UP
        leído del archivo sobre base sembrada en transacción revertida, dos veces; DOWN sin Maestro y
        con Maestro; `23502` y `23514` al insertar y al actualizar; R28 correo y documento entre
        usuarios sin empresa, vivos y dados de baja; R36 nombre de usuario entre empresas, con el
        Maestro, al renombrar y dado de baja; R37 correo y documento entre empresa y Maestro
        aceptados; R38 sin cambios en filas; R39 guardia con dos repetidos y mensaje),
        `tests/integration/identity/identity-constraints.int.test.ts` (reescribir `:1433-1481` como
        R36, sin `admin`; `:1380-1431` y `:1483-1534` intactos como R37; el caso `:1194-1211` sigue
        con su `23502`).
      - **Hecho**: en verde contra `QuimiCloude_QC161`.
      - Depende de: T5.

## Bloque 3 — El seed

- [x] **T7. El primer Maestro.** (`design.md > 5`; R10–R15, R42, R43.)
      - Archivos: `lib/modules/identity/ports/initial-access-credentials.ts`,
        `lib/modules/identity/ports/initial-access-repository.ts` (`createInitialMaestro`,
        `countLiveUsersWithUsername`, `countLiveUsersWithoutCompanyWithEmail`),
        `lib/modules/identity/domain/seed-initial-access.ts` (paso 3b de `design.md > 5.2`),
        `lib/modules/identity/domain/account-status.ts` (solo si hace falta la constante hermana),
        `lib/modules/identity/adapters/driven/config/initial-access-credentials-env.ts`,
        `lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts`,
        `lib/composition/index.ts` (solo el cableado de `seedInitialAccess`),
        `scripts/seed.ts`, `.env.example`.
      - Tests: `tests/unit/identity/seed/seed-initial-access.test.ts` (R10 con «Plataforma»/«Inicial»
        y marcadores, R11, R12 —ningún método de escritura llamado, ni roles—, R13, R15, R42 —choque
        con un vivo y con el Administrador de la misma corrida, sin el valor en el mensaje—, R43
        —choque de correo sin empresa; mismo correo que el Administrador sí se crea—; dobles con
        `maestroCredentials`, `createInitialMaestro` y los dos contadores; listas de roles derivadas
        de `SEED_ROLES`), `tests/unit/identity/seed/initial-access-credentials-env.test.ts` (R12),
        `tests/unit/identity/seed/deploy-hook.test.ts` (R14), `tests/guards/guard-password-never-plaintext.test.ts`
        y `tests/guards/guard-rol-administrador-unico.test.ts` sin tocar y en verde.
      - **Hecho**: typecheck del seed y estos tests en verde; `db:seed` contra `QuimiCloude_QC161`
        crea el Maestro la primera vez y dice «ya existia» la segunda (salida pegada en `progress/`).
      - Depende de: T1, T2, T5.

- [x] **T8. El seed contra Postgres.** (R4, R10, R15, R18, R42, R43.)
      - Archivos (solo tests): `tests/integration/identity/identity-seed.int.test.ts` (dos corridas;
        para **cada** rol de `SEED_ROLES`, permisos en base = permisos del dominio; una sola fila
        `Maestro`; Maestro sin empresa, `active`, «Plataforma»/«Inicial»; R42 con un usuario vivo de
        otra empresa con su nombre en otras mayúsculas —falla, base intacta— y dado de baja —lo
        crea—; R43 con el correo de un usuario de empresa —lo crea—; los casos de variables guardan y
        restauran también las `SEED_MAESTRO_*`).
      - **Hecho**: en verde contra `QuimiCloude_QC161`.
      - Depende de: T6, T7.

## Bloque 4 — La sesión sin empresa

- [x] **T9. Del login a la resolución de la sesión.** (`design.md > 6.1–6.4`; R30, R31, R32, R35, R44.)
      - Archivos: `lib/modules/identity/domain/session.ts`, `domain/session-claims.ts`,
        `domain/resolve-session.ts`, `ports/user-credentials-reader.ts`, `ports/session-user-reader.ts`,
        `ports/session-provider.ts` (JSDoc del contrato enmendado),
        `adapters/driven/session/session-token.ts` (tipo del payload; **sin** subir la versión),
        `adapters/driven/persistence/user-credentials-prisma.ts` (`LEFT JOIN companies`; JSDoc del
        `INNER JOIN` y del índice corregido; la condición de búsqueda **no** cambia),
        `adapters/driven/persistence/session-user-prisma.ts`.
      - Tests: `tests/unit/identity/session-claims.test.ts` (R32: `null` explícito válido; ausente,
        vacío, número y no-UUID inválidos), `resolve-session.test.ts` (R31, R32),
        `verify-credentials.test.ts` (R30), `route-guard-middleware.test.ts` (R31),
        `end-session.test.ts` (R35), y los tests de `session-token` / `session-user-prisma` /
        `user-credentials-prisma` que el cambio de tipos ponga rojos.
      - **Hecho**: `pnpm run typecheck` en verde en todo el repo y estos tests en verde.
      - Depende de: T5.

- [x] **T10. [P con T11] El actor sin empresa, el aterrizaje y las pantallas.** (R29, R33, R34.)
      - Archivos (solo tests): `tests/unit/identity/maestro-sin-empresa-actions.test.ts` (nuevo: acción
        representativa de `inventario`, `pedidos`, `unidades` e `identity` con usuario de catálogo
        completo y contexto `null` → no autorizada, repositorio sin llamar),
        `tests/unit/identity/login-action.test.ts` (R33: destino `DASHBOARD_ROUTE`),
        `tests/unit/identity/require-page-permission.test.ts` (R34).
      - **Hecho**: en verde **sin tocar ningún archivo de producción** fuera de los de T9; si alguno
        hace falta, se para y se vuelve al design.
      - Depende de: T9.

- [x] **T11. [P con T10] Login y sesión contra Postgres.** (R30, R31, R44.)
      - Archivos (solo tests): `tests/integration/identity/login.int.test.ts` (R30, R44: un usuario de
        la empresa B y un Maestro, cada uno entra con su nombre en otras mayúsculas y recibe su
        sesión), `tests/integration/identity/session-user.int.test.ts` (fixture propio: un usuario
        Maestro sin empresa creado en la transacción del test, no el del seed).
      - **Hecho**: en verde contra `QuimiCloude_QC161`.
      - Depende de: T6, T9.

## Bloque 5 — El selector de roles y el alta/edición

- [x] **T12. [P con T9] El Maestro nunca se asigna; el nombre de usuario choca en todo el sistema.**
      (`design.md > 7, 7.1`; R1, R23, R24, R25, R36, R37, R40, R41.)
      - Archivos: `lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts`,
        `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` (alta y edición
        rechazan el `roleId` del Maestro; la guarda del último administrador intacta; JSDoc de las
        marcas `:152-176` con el `target` **medido** del índice global y de los dos sin empresa),
        `lib/modules/errores/domain/error-catalog.ts` (`errors.duplicate_username` sin «en la
        empresa»; correo y documento sin cambios).
      - Tests: `tests/integration/identity/role-catalog.int.test.ts` (R23),
        `tests/integration/identity/user-crud.int.test.ts` (R24, R25 con actor con
        `usuarios.modificar`, cero filas escritas; R1: lista, edición, baja y estado con el id del
        Maestro → «no encontrado»; `:509-523` y `:525-542` reescritos en R36/R37; R40: alta y edición
        con el nombre de un usuario de otra empresa y del Maestro → `'username'`, nada escrito),
        el test del catálogo de errores en `tests/unit/errores/` (R41),
        `tests/unit/identity/usuarios/user-service.test.ts` o `user-actions.test.ts` (R40), y los
        unitarios de esos adaptadores si existen y enumeran la exclusión.
      - **Hecho**: en verde contra `QuimiCloude_QC161`; el `target` medido pegado en `progress/`.
      - Depende de: T1, T5 (y T7 si el test usa el Maestro del seed; si crea el suyo, solo T5).

## Bloque 6 — Documentación y cierre

- [x] **T13. [P con T10–T12] Documentación de arquitectura.** (R26, R27, R36.)
      - Archivos: `docs/architecture.md` (`## Dominio` n.º 1: `users.company_id` obligatoria **salvo
        para el Maestro**, con el disparador como garantía; una frase: el nombre de usuario es único
        en todo el sistema, correo y documento por empresa), `tests/guards/guard-empresa-en-esquema.test.ts`
        (solo la redacción del motivo de `revoked_sessions`/`credential_setup_tokens`; la lista no
        cambia).
      - **Hecho**: guardia en verde, lista de exentas idéntica.
      - Depende de: T5.

- [ ] **T14. Gate completo y trazabilidad.**
      - Archivos: `progress/impl_QC-161-rol-maestro.md` (mapa `R1..R44 → test` completo según
        `design.md > 10.3`; salida del ciclo de migración; salida de `db:seed`; `target` medido;
        **precondiciones de despliegue**: las tres `SEED_MAESTRO_*` en Vercel producción y preview y
        en el `.env` antes del merge —D17, condición del PR—, con un `SEED_MAESTRO_USERNAME` que no
        choque con ningún usuario vivo de esas bases; y, si la pregunta abierta 1 se confirma, la
        comprobación de nombres de usuario repetidos en preview y producción).
      - Proceso: `./init.sh` completo contra `QuimiCloude_QC161`, con **una sola** E2E viva en la
        máquina. R19: `git diff --stat -- e2e/` vacío. R20: `package.json` sin cambios.
      - **Hecho**: `./init.sh` verde, mapa sin ningún `R<n>` sin test, y el leader ha confirmado con
        el humano las variables de Vercel (y, si aplica, la ausencia de duplicados) antes de abrir el
        PR.
      - Depende de: T1–T13.
