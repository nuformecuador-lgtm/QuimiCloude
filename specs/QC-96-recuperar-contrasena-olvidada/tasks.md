# QC-96 — recuperar-contrasena-olvidada · tasks.md

> Zona: `fullstack` · Complejidad: `medium` · depends_on: `QC-79`, `QC-23` ·
> Rama: `feature/QC-96-recuperar-contrasena-olvidada`
>
> El **qué** está en `requirements.md` (R1–R37) y el **cómo** en `design.md`. Aquí va el orden.
>
> **Reglas de esta lista.** Cada task tiene un **criterio de hecho** verificable —no «está
> implementado», sino qué comando o qué aserción lo demuestra—. `[P]` marca lo que puede ir en
> paralelo con la task inmediatamente anterior sin tocar sus archivos. Cerrar una tanda es
> **`./init.sh --rapido`**; cerrar la feature y cualquier PR es **`./init.sh`** completo, sin
> excepción (regla 5 de `CLAUDE.md`).
>
> **YA NO HAY NINGUNA TASK BLOQUEADA POR QC-23** (enmienda del 2026-09-12). Antes lo estaban **T12**,
> **T13b**, **T18** y la aserción de sesiones de **T17**, porque el diseño asumía invocar un revocador
> con una firma que no existía. Leída QC-23 **en disco**, el corte de sesiones **no se invoca**: es una
> regla sobre la escritura —`users.sessions_valid_from` sube en la MISMA sentencia que
> `users.password_hash`— vigilada por `tests/guards/guard-sesiones-cortadas.test.ts`, que cubre por
> nombre el `UPDATE` de `credential-setup-link-prisma.ts` que esta ficha extiende. Ver
> `design.md > 7` y **P3** de `requirements.md`. Consecuencia en esta lista:
>
> | Task | Qué pasa |
> | --- | --- |
> | **T12** (cablear `SessionRevoker`) | **ELIMINADA.** No hay puerto que cablear |
> | **T13b** (colapsar los tres pasos en una transacción) | **ELIMINADA.** Ya nace en una sola transacción; nada que colapsar |
> | **T18** (la revocación de verdad) | **REDUCIDA y DESBLOQUEADA** → **T18'**, un test estático + una aserción de integración en T16 |
> | **T17** (E2E) | **DESBLOQUEADA.** La aserción de sesiones **sí entra** |
> | **T8** | Pierde el puerto `SessionRevoker`; conserva los tres métodos del repositorio |
>
> QC-96 **sigue con `QC-23` en su `depends_on`**: necesita la columna y `floorToSecond` en el árbol.
> Lo que ya no necesita es un contrato que nadie había escrito.
>
> **NINGUNA dependencia nueva** (R34): esta feature no toca `package.json`. No hay puerta humana de
> dependencia, a diferencia de QC-79 T2.
>
> **Archivos que esta feature toca**, para la validación de conflicto del leader: `db/schema.prisma`,
> `db/migrations/<nueva>/`, `lib/modules/identity/**`, `lib/composition/index.ts`,
> `lib/shared/routes.ts`, `app/(public)/recuperar-contrasena/**`, `e2e/`, `tests/**`. **No** toca
> `package.json`, `middleware.ts`, `app/(private)/**`, `components/**`, `app/(public)/login/**`,
> `app/(public)/establecer-contrasena/**`, `lib/modules/errores/**` ni ningún otro módulo.

---

## Fase 0 — Anclas

- [ ] **T1 — Verificar las anclas del diseño sobre el árbol de esta rama.**
      Leer y anotar en `progress/impl_QC-96-recuperar-contrasena-olvidada.md`: la firma exacta de
      `CredentialSetupLinkRepository` (los dos métodos de QC-79), la de
      `credentialSetupLinkExpiresAt`, la forma de `SetCredentialFormState`, el tamaño actual de
      `ERROR_CODES` (**41** al escribir esto; R32 exige que **no cambie**), el nombre del traductor
      único de QC-70, el nombre exacto de `effectiveAccountStatus` y su tipo de entrada, y el estado
      real de `specs/QC-23-registro-de-sesiones/` y de QC-23 en `feature_list.json`.
      **Hecho cuando:** la bitácora lista los siete con su ruta y su línea y dice si alguno **difiere**
      de lo que `design.md` supone. Si difiere, se para y decide el leader.
      *(Sin dependencias.)*

## Fase 1 — La base de datos

- [ ] **T2 — La columna de propósito: esquema, migración y `down.sql`.** — **R12, R33** (y habilita R11)
      `enum CredentialSetupPurpose { setup recovery }` y `purpose @default(setup)` en
      `CredentialSetupToken` (`design.md > 3.1`), más el índice
      `credential_setup_tokens_user_purpose_created_idx`; `pnpm run db:migrate:create`; escribir
      `down.sql` como inverso exacto (`DROP INDEX`, `ALTER TABLE … DROP COLUMN`, `DROP TYPE`).
      **Hecho cuando:** existen `migration.sql` y `down.sql`; el UP **no** contiene ningún
      `ALTER TABLE "users"`, ningún `DROP INDEX` de los tres de QC-47 ni del parcial
      `credential_setup_tokens_one_live_per_user`; y `pnpm run typecheck` pasa tras `prisma generate`.
      *(Depende de T1.)*

- [ ] **T3 — [P] Test estático de la migración.** — **R33**
      `tests/unit/identity/schema/credential-purpose-migration.test.ts`: el UP crea el tipo con sus
      **dos** valores y la columna con su `DEFAULT setup` (que **es** el backfill), crea el índice de
      conteo, y **no menciona** `users` ni ninguno de los cuatro índices que no debe tocar; el
      `down.sql` es su inverso línea a línea. Con casos de sensibilidad: quitar el `DEFAULT` o
      cambiarlo por `recovery` pone el test en rojo.
      **Hecho cuando:** el archivo pasa y sus dos casos de sensibilidad fallan al mutar el SQL.
      *(Depende de T2.)*

- [ ] **T4 — Ciclo real de migración.** — **R33**
      `pnpm run db:migrate` → `pnpm run db:rollback` → `pnpm run db:migrate` contra
      `QuimiCloude_QC96`.
      **Hecho cuando:** la salida de los tres comandos está pegada en la bitácora y
      `_prisma_migrations` queda coherente.
      *(Depende de T2.)*

## Fase 2 — Dominio puro

- [ ] **T5 — Los dos plazos, derivados del propósito.** — **R11**
      `domain/credential-setup-link.ts`: `CREDENTIAL_RECOVERY_LINK_TTL_MINUTES = 60`, el tipo del
      propósito, y `credentialSetupLinkExpiresAt(issuedAt, purpose)` con el parámetro
      **obligatorio** (`design.md > 3.3`). Ripple en la misma tanda: los llamantes de QC-79 pasan
      `setup` explícito.
      **Hecho cuando:** `link-lifetime.test.ts` cubre el borde exacto de **1 hora** y el de **7 días**
      sin que ninguno de los casos viejos se borre ni se debilite, y el typecheck obliga a pasar el
      propósito.
      *(Depende de T1.)*

- [ ] **T6 — [P] El presupuesto fijo de tiempo.** — **R6**
      `domain/constant-response-time.ts` (`design.md > 6.2`): la constante y `holdUntilBudget`, con
      reloj y `sleep` **inyectados**. Dominio puro: sin `next/*`, sin Prisma, sin `lib/shared`.
      **Hecho cuando:** `response-budget.test.ts` afirma que espera lo que falta y **nunca acorta**,
      con relojes dobles y **sin dormir de verdad**; y el caso de sensibilidad sin `hold` da rojo.
      *(Depende de T1.)*

- [ ] **T7 — [P] El esquema de entrada de la solicitud.** — **R3**
      `domain/credential-recovery-input.ts`: `z.strictObject({ email })` con `trim` y forma de correo
      (`design.md > 5.2`).
      **Hecho cuando:** el test afirma que rechaza una clave desconocida —con `companyId`, `userId`,
      `purpose` y `to` nombrados uno a uno— y que acepta el correo con espacios alrededor.
      *(Depende de T1.)*

## Fase 3 — Puertos y persistencia

- [ ] **T8 — Los puertos: los tres métodos nuevos.** — **R12, R14, R30**
      `ports/credential-setup-link-repository.ts` gana `issueRecoveryLinks`, `consumeLink` y
      `applyRecoveryCredential` (`design.md > 5.1`), **sin** añadir ningún lector de enlaces.
      **NO se crea `ports/session-revoker.ts`** y no se añade ningún puerto de sesiones: el corte lo
      hace el `UPDATE` de T10 (`design.md > 7`).
      **Hecho cuando:** `guard-arquitectura-modulos` pasa, el archivo no importa framework, Prisma ni
      `lib/shared/**`, y `ls lib/modules/identity/ports/` **no** muestra ningún revocador nuevo.
      *(Depende de T1.)*

- [ ] **T9 — Emitir: resolución por correo, límite y transacción.** — **R8, R9, R10, R14, R17, R18, R19**
      En `credential-setup-link-prisma.ts`: la consulta de `design.md > 4.2` (con `lower(...)` y
      **sin** `LIMIT 1`), el `count` del límite y la transacción de `> 4.3`. `23505` → `'superseded'`,
      afirmado sobre el **código** del error y jamás sobre su texto.
      **Hecho cuando:** sus tests con doble de Prisma cubren: cero cuentas, una, dos en empresas
      distintas, tope alcanzado, choque `23505`; y ninguna rama devuelve nada que diga **por qué** no
      se emitió (`design.md > 4.4`).
      *(Depende de T2, T8.)*

- [ ] **T10 — [P] Consumir: el propósito decide el estado exigido, y el sello va en el mismo `SET`.**
      — **R22, R23, R25, R27, R28, R29**
      `consumeLink` (compare-and-set que devuelve `{ userId, purpose }`) y `applyRecoveryCredential`
      (`UPDATE users SET password_hash = …, sessions_valid_from = ${floorToSecond(now)}
      WHERE deleted_at IS NULL AND account_status = 'active'`, 0 filas → rollback → `'invalid'`), **los
      dos dentro de la misma transacción** (`design.md > 7.2`). `applyCredentialAndActivate` de QC-79
      **no se toca**, y `floorToSecond` se **importa** de `domain/session-revocation.ts` (QC-23), no se
      reescribe.
      **Hecho cuando:** los tests cubren los dos propósitos y el cruzado en las dos direcciones;
      afirman que el SQL de recuperación **no** contiene `account_status =` en su `SET` pero **sí**
      `"sessions_valid_from" =`; y `guard-sesiones-cortadas` (QC-23) sigue verde **sin haberla tocado**
      —y se comprueba a mano que se pone **roja** si se borra el sello, para saber que vigila de verdad
      este `UPDATE` nuevo—.
      *(Depende de T2, T8.)*

## Fase 4 — Casos de uso

- [ ] **T11 — El caso de uso público: pedir la recuperación.** — **R2, R4, R5, R6, R7, R15, R16, R19**
      `domain/request-credential-recovery.ts` con el orden de `design.md > 4.1`. **Sin `Actor`, sin
      `requirePermission`, sin ninguna lectura de sesión** — y con el comentario que dice que esa
      ausencia **es** R2, como el de `set-credential-with-link.ts`. Devuelve `void`.
      **Hecho cuando:** `request-recovery.test.ts` ejerce las **nueve** ramas de R5 y afirma que
      devuelven **lo mismo**; que sin cuenta activa **no suena** el puerto de correo (doble que falla
      si lo llaman); y que un envío que tarda más que el presupuesto **no** alarga la respuesta.
      *(Depende de T5, T6, T7, T9.)*

- [x] ~~**T12 — Cablear `SessionRevoker` en la composición.**~~ **ELIMINADA el 2026-09-12.** No existe
      ningún puerto de sesiones que cablear (`design.md > 7.3`). `lib/composition/index.ts` solo gana
      la clave del caso de uso público de T11, y eso ya lo cubre T11.

- [ ] **T13 — Establecer la contraseña: el propósito, en el dominio.** —
      **R21, R22, R23, R24, R25, R26**
      *(Era T13a. Se renombra porque T13b desapareció.)*
      `set-credential-with-link.ts` pasa a los pasos de `design.md > 7.2`: consumir, y según el
      propósito ir al camino `setup` de QC-79 —**idéntico**— o a `applyRecoveryCredential`. **Sin
      ningún paso de revocación intermedio**: el corte vive en el `UPDATE` de T10. No se añade ningún
      `findByDigest`.
      **Hecho cuando:** `set-credential-with-link.test.ts` conserva sus casos de QC-79 y gana los de
      recuperación y los de propósito cruzado con el **mismo** error; y afirma que el caso de uso **no
      recibe ningún puerto de sesiones entre sus `deps`** —el corte no es responsabilidad suya, y si un
      día alguien le añade uno el test lo dice—.
      *(Depende de T8, T10.)*

- [x] ~~**T13b — Ajustar la firma real y colapsar los tres pasos en una transacción.**~~ **ELIMINADA
      el 2026-09-12.** Era el seguimiento de una atomicidad perdida que ya no se pierde: con el sello
      dentro del mismo `SET`, el camino de recuperación nace en **una sola transacción** (T10). Lo que
      T13b iba a arreglar no llega a romperse.

## Fase 5 — Superficie

- [ ] **T14 — La Server Action de la solicitud.** — **R4, R31, R32**
      `requestCredentialRecoveryAction` en `credential-setup-actions.ts`, con `FormData` y
      `RequestRecoveryFormState` (`design.md > 5.3`). **No resuelve actor** —`currentActor()` no se
      llama— y traduce con el **traductor único**. Sin `revalidatePath`.
      **Hecho cuando:** `credential-setup-actions.test.ts` afirma que el estado de éxito **no tiene
      ningún campo**, que no se lee ninguna cookie ni cabecera, y que `ERROR_CODES` **sigue teniendo
      el mismo tamaño que anotó T1**.
      *(Depende de T11.)*

- [ ] **T15 — La pantalla pública de la solicitud.** — **R1, R4, R35**
      `app/(public)/recuperar-contrasena/page.tsx` + `components/` con su barrel; en
      `lib/shared/routes.ts`, borrar el «ruta aún inexistente (S6)» de `FORGOT_PASSWORD_ROUTE`.
      **`login/page.tsx` no se toca.** Multiplataforma: `min-h-dvh`, 16 px, 44 px, sin `:hover`.
      **Hecho cuando:** `request-recovery-form.test.tsx` afirma que el DOM tras responder es **el
      mismo** con un correo que existe y con uno que no, y las cuatro aserciones multiplataforma
      pasan.
      *(Depende de T14.)*

## Fase 6 — Verificación

- [ ] **T16 — Integración contra Postgres real.** — **R9, R10, R13, R14, R17, R18, R23, R25, R27, R29**
      `tests/integration/identity/credential-recovery.int.test.ts` con los casos de
      `design.md > 9.1`: la huella y no el secreto en la columna; **dos** empresas con el mismo correo
      → **dos** enlaces; el tope corta; la recuperación **sustituye** un enlace de alta vivo; el
      consumo cruzado falla; RLS sigue forzado.
      **Y el caso de sesiones, que ya no está bloqueado** (R27, R29): tras recuperar,
      `users.sessions_valid_from` de esa persona vale el instante de la operación **truncado al
      segundo**, e `isStampedOut` de QC-23 declara inválida una sesión emitida antes. Y el caso
      negativo que lo hace valer: una transacción que **falla** (contraseña sobre una cuenta que dejó
      de estar `active`) no cambia **ninguna** de las dos columnas (R28).
      **Hecho cuando:** el archivo pasa contra la base de esta rama, con su limpieza en el orden que
      exige el `ON DELETE RESTRICT` (enlaces → usuarios → empresa).
      *(Depende de T9, T10.)*

- [ ] **T17 — El E2E del camino completo.** — **R37**
      `e2e/recuperar-contrasena.spec.ts` con el montaje de buzón de `e2e/establecer-contrasena.spec.ts`
      (variables en el proceso del spec, directorio temporal por worker, `playwright.config.ts` sin
      tocar): login → «¿Olvidaste tu contraseña?» → correo de una cuenta activa → buzón → establecer →
      **entrar** → el enlace ya no sirve → y un correo **inexistente** pinta lo mismo.
      **Y la aserción de sesiones, que ya NO está bloqueada** (R27, R29): un segundo contexto de
      navegador con la sesión de esa persona abierta **acaba en el login** tras la recuperación.
      **Hecho cuando:** pasa en chromium y webkit y no espera por tiempo en ningún punto.
      *(Depende de T15, T16.)*

- [ ] **T18' — [P] El sello, en la misma sentencia: test estático.** — **R27, R29**
      *(Sustituye a la antigua T18 «la revocación, de verdad», que estaba bloqueada y probaba una
      invocación que ya no existe.)*
      `tests/unit/identity/recuperacion/sello-en-la-misma-sentencia.test.ts`: el SQL de
      `applyRecoveryCredential` escribe `"sessions_valid_from"` **en el mismo `SET`** que
      `"password_hash"`, con `floorToSecond`, y **sin** filtro de empresa (R29: no se acota por
      `company_id`). Y que la feature **no crea ningún puerto de sesiones** ni importa
      `end-all-sessions`, `SessionRevocationRepository` o `revoked_sessions`.
      **Hecho cuando:** pasa; su caso de sensibilidad —borrar el sello del `SET`— lo pone rojo, y pone
      roja también `guard-sesiones-cortadas` de QC-23, que **no se toca**.
      *(Depende de T10.)*

- [ ] **T19 — [P] Test de alcance y las guardias.** — **R7, R20, R29, R30, R34, R36**
      `scope.test.ts`: ningún `console.*` en los archivos de la feature; ninguna lectura de origen
      (`x-forwarded-for`, `request.ip`, `headers()` para la IP); ningún route handler ni cron nuevo;
      `package.json` sin ninguna entrada respecto de `origin/dev`; ningún archivo bajo
      `app/(private)/` ni `components/`. **Y el alcance sobre QC-23** (R29): el diff de la feature no
      crea ninguna columna ni tabla de sesiones, no toca `resolve-session.ts`, `revoked_sessions` ni
      el formato del token, y **no modifica `tests/guards/guard-sesiones-cortadas.test.ts`**.
      **Hecho cuando:** pasa, y las guardias que ya existen —las seis de QC-79 más
      `guard-sesiones-cortadas` de QC-23— siguen verdes **sin haberlas tocado**.
      *(Depende de T15.)*

- [ ] **T20 — Cierre.**
      `./init.sh` completo; el mapa `R<n> -> test` en
      `progress/impl_QC-96-recuperar-contrasena-olvidada.md`; **P1** anotada como lo único abierto en
      `progress/current.md > Deudas y cosas abiertas`.
      **Hecho cuando:** el gate completo termina en verde, el mapa cubre **R1–R37** sin huecos, **no
      queda ninguna marca `[BLOQUEADA: QC-23]`** en esta lista, y las seis guardias más
      `guard-sesiones-cortadas` están verdes sin haber sido tocadas.
      *(Depende de todas las anteriores.)*

---

## Trazabilidad `R<n> -> task`

**Las 37 aparecen. Ninguna sin task.**

| R | Task(s) | | R | Task(s) |
| --- | --- | --- | --- | --- |
| R1 | T15 | | R20 | T19 |
| R2 | T11, T14 | | R21 | T13 |
| R3 | T7, T11 | | R22 | T10, T13 |
| R4 | T11, T14, T15 | | R23 | T10, T13, T16 |
| R5 | T11, T16 | | R24 | T13 |
| R6 | T6, T11 | | R25 | T10, T13 |
| R7 | T11, T19 | | R26 | T13 |
| R8 | T9, T11 | | R27 | T10, T16, T17, **T18'** |
| R9 | T9, T11, T16 | | R28 | T10, T16 |
| R10 | T9, T16 | | R29 | T10, T16, T17, **T18'**, T19 |
| R11 | T2, T5 | | R30 | T8, T19 |
| R12 | T2, T8 | | R31 | T14 |
| R13 | T9, T16 | | R32 | T14 |
| R14 | T9, T16 | | R33 | T2, T3, T4 |
| R15 | T11 | | R34 | T19 |
| R16 | T11 | | R35 | T15 |
| R17 | T9, T11, T16 | | R36 | T19 |
| R18 | T9, T16 | | R37 | T17 |
| R19 | T9, T11, T16 | | | |

**Ningún requisito depende ya de una task bloqueada.** Tras la enmienda del 2026-09-12, **R27**,
**R28** y **R29** se prueban sin dobles y sin esperar a nadie: el sello va en el `UPDATE` (T10), un
test estático lo ancla (T18'), la integración lo mide contra Postgres real (T16), el E2E lo ve en un
navegador (T17), y `guard-sesiones-cortadas` de QC-23 lo vigila para siempre **sin que QC-96 la
toque**. **T12 y T13b ya no existen**, y **T13a pasa a llamarse T13**.

## Orden sugerido de tandas

1. **Tanda A** — T1, T2, T3, T4. *(La base y su reversibilidad.)*
2. **Tanda B** — T5, T6, T7, T8. *(Dominio puro y puertos; T6 y T7 en paralelo.)*
3. **Tanda C** — T9, T10, T18'. *(Persistencia y el test del sello; T10 en paralelo con T9.)*
4. **Tanda D** — T11, T13. *(Los dos casos de uso.)*
5. **Tanda E** — T14, T15, T19. *(La superficie y el alcance.)*
6. **Tanda F** — T16, T17. *(Integración y E2E, ya con las sesiones dentro.)*
7. **Tanda G** — T20. *(Cierre: `./init.sh` completo.)*
