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
> **CUATRO TASKS ESTÁN BLOQUEADAS POR QC-23** y se marcan `[BLOQUEADA: QC-23]`: **T12**, **T13b**,
> **T18** y la aserción de sesiones de **T17**. QC-23 **no está mergeada**, y además —verificado el
> 2026-09-12 en este worktree— **ni siquiera tiene spec escrito**: `specs/QC-23-registro-de-sesiones/`
> solo tiene `requirements.md` con su sección EARS en «_Pendiente_», y `feature_list.json` la da como
> `pending`. Ver `design.md > 7`. **No se desbloquean con un adaptador provisional** (`design.md >
> 12.8`): un doble que no revoque nada pondría los tests en verde y dejaría las sesiones abiertas.
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

- [ ] **T8 — Los puertos: los tres métodos nuevos y `SessionRevoker`.** — **R12, R14, R27, R30**
      `ports/credential-setup-link-repository.ts` gana `issueRecoveryLinks`, `consumeLink` y
      `applyRecoveryCredential` (`design.md > 5.1`), **sin** añadir ningún lector de enlaces;
      `ports/session-revoker.ts` **nuevo**, con la **firma asumida** y el comentario que cita las tres
      filas de la tabla de decisiones de QC-23 de las que sale (`design.md > 7.1`).
      **Hecho cuando:** `guard-arquitectura-modulos` pasa, los dos archivos no importan framework,
      Prisma ni `lib/shared/**`, y el puerto nuevo **no** tiene implementación en esta rama.
      *(Depende de T1.)*

- [ ] **T9 — Emitir: resolución por correo, límite y transacción.** — **R8, R9, R10, R14, R17, R18, R19**
      En `credential-setup-link-prisma.ts`: la consulta de `design.md > 4.2` (con `lower(...)` y
      **sin** `LIMIT 1`), el `count` del límite y la transacción de `> 4.3`. `23505` → `'superseded'`,
      afirmado sobre el **código** del error y jamás sobre su texto.
      **Hecho cuando:** sus tests con doble de Prisma cubren: cero cuentas, una, dos en empresas
      distintas, tope alcanzado, choque `23505`; y ninguna rama devuelve nada que diga **por qué** no
      se emitió (`design.md > 4.4`).
      *(Depende de T2, T8.)*

- [ ] **T10 — [P] Consumir: el propósito decide el estado exigido.** — **R22, R23, R25**
      `consumeLink` (compare-and-set que devuelve `{ userId, purpose }`) y `applyRecoveryCredential`
      (`UPDATE users … WHERE deleted_at IS NULL AND account_status = 'active'`, 0 filas → `'invalid'`).
      `applyCredentialAndActivate` de QC-79 **no se toca**.
      **Hecho cuando:** los tests cubren los dos propósitos, el cruzado en las dos direcciones, y
      afirman que el SQL de recuperación **no** contiene `account_status =` en su `SET`.
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

- [ ] **T12 — [BLOQUEADA: QC-23] Cablear `SessionRevoker` en la composición.** — **R27, R30**
      Una línea en `lib/composition/index.ts` atando el puerto al adaptador que trae QC-23.
      **Hecho cuando:** `identity-facade.test.ts` incluye la clave nueva y el typecheck pasa **con el
      adaptador real**, no con un doble.
      *(Depende de que **QC-23 esté mergeada**. `design.md > 7.3` dice qué cuesta si su firma cambia:
      esta línea y el archivo del puerto.)*

- [ ] **T13a — Establecer la contraseña: el propósito y la revocación, en el dominio.** —
      **R21, R22, R23, R24, R25, R26, R28, R29**
      `set-credential-with-link.ts` pasa a los tres pasos de `design.md > 7.2`, con la revocación
      **antes** de escribir la credencial. El camino `setup` queda **idéntico**. No se añade ningún
      `findByDigest`.
      **Hecho cuando:** `session-revocation.test.ts` afirma el **orden** (el doble del repositorio
      falla si se le llama antes que al revocador) y que, **si el revocador lanza, la credencial no se
      escribe**; y `set-credential-with-link.test.ts` conserva sus casos de QC-79 y gana los de
      recuperación y los de propósito cruzado con el **mismo** error.
      *(Depende de T8, T10.)*

- [ ] **T13b — [BLOQUEADA: QC-23] Ajustar la firma real y, si QC-23 lo permite, colapsar los tres
      pasos en una transacción.** — **R27, R28**
      Seguimiento escrito de `design.md > 7.2`: si QC-23 expone la revocación como escritura sobre
      `users`, mover 3a dentro de la transacción de 3b y recuperar la atomicidad que QC-79 tenía.
      **Hecho cuando:** o se hace y el test de orden se sustituye por uno de atomicidad, o queda
      anotado en la bitácora por qué no se puede con la forma que QC-23 trajo.
      *(Depende de T12.)*

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

- [ ] **T16 — Integración contra Postgres real.** — **R9, R10, R13, R14, R17, R18, R23, R25**
      `tests/integration/identity/credential-recovery.int.test.ts` con los casos de
      `design.md > 9.1`: la huella y no el secreto en la columna; **dos** empresas con el mismo correo
      → **dos** enlaces; el tope corta; la recuperación **sustituye** un enlace de alta vivo; el
      consumo cruzado falla; RLS sigue forzado.
      **Hecho cuando:** el archivo pasa contra la base de esta rama, con su limpieza en el orden que
      exige el `ON DELETE RESTRICT` (enlaces → usuarios → empresa).
      *(Depende de T9, T10.)*

- [ ] **T17 — El E2E del camino completo.** — **R37**
      `e2e/recuperar-contrasena.spec.ts` con el montaje de buzón de `e2e/establecer-contrasena.spec.ts`
      (variables en el proceso del spec, directorio temporal por worker, `playwright.config.ts` sin
      tocar): login → «¿Olvidaste tu contraseña?» → correo de una cuenta activa → buzón → establecer →
      **entrar** → el enlace ya no sirve → y un correo **inexistente** pinta lo mismo.
      **Hecho cuando:** pasa en chromium y webkit y no espera por tiempo en ningún punto.
      **La aserción de que las sesiones se cerraron queda [BLOQUEADA: QC-23]** y anotada en el propio
      archivo.
      *(Depende de T15, T16.)*

- [ ] **T18 — [BLOQUEADA: QC-23] La revocación, de verdad.** — **R27, R29**
      Test de integración que abre dos sesiones, recupera la contraseña y afirma que **las dos** dejan
      de valer.
      **Hecho cuando:** pasa contra el mecanismo real de QC-23. Hasta entonces R27 y R29 están
      cubiertas **solo con dobles** (T13a), y eso queda escrito en la bitácora, no escondido
      (`design.md > 9.2`).
      *(Depende de T12.)*

- [ ] **T19 — [P] Test de alcance y las guardias.** — **R7, R20, R30, R34, R36**
      `scope.test.ts`: ningún `console.*` en los archivos de la feature; ninguna lectura de origen
      (`x-forwarded-for`, `request.ip`, `headers()` para la IP); ningún route handler ni cron nuevo;
      `package.json` sin ninguna entrada respecto de `origin/dev`; ningún archivo bajo
      `app/(private)/` ni `components/`.
      **Hecho cuando:** pasa, y las seis guardias que ya existen siguen verdes **sin haberlas tocado**.
      *(Depende de T15.)*

- [ ] **T20 — Cierre.**
      `./init.sh` completo; el mapa `R<n> -> test` en
      `progress/impl_QC-96-recuperar-contrasena-olvidada.md`; las tasks bloqueadas por QC-23 listadas
      con su motivo en `progress/current.md > Deudas y cosas abiertas`.
      **Hecho cuando:** el gate completo termina en verde, el mapa cubre **R1–R37** sin huecos, y las
      cuatro marcas `[BLOQUEADA: QC-23]` están explicadas por escrito.
      *(Depende de todas las anteriores no bloqueadas.)*

---

## Trazabilidad `R<n> -> task`

**Las 37 aparecen. Ninguna sin task.**

| R | Task(s) | | R | Task(s) |
| --- | --- | --- | --- | --- |
| R1 | T15 | | R20 | T19 |
| R2 | T11, T14 | | R21 | T13a |
| R3 | T7, T11 | | R22 | T10, T13a |
| R4 | T11, T14, T15 | | R23 | T10, T13a, T16 |
| R5 | T11, T16 | | R24 | T13a |
| R6 | T6, T11 | | R25 | T10, T13a |
| R7 | T11, T19 | | R26 | T13a |
| R8 | T9, T11 | | R27 | T8, **T12**, T13a, **T18** |
| R9 | T9, T11, T16 | | R28 | T13a, **T13b** |
| R10 | T9, T16 | | R29 | T13a, **T18** |
| R11 | T2, T5 | | R30 | T8, T12, T19 |
| R12 | T2, T8 | | R31 | T14 |
| R13 | T9, T16 | | R32 | T14 |
| R14 | T9, T16 | | R33 | T2, T3, T4 |
| R15 | T11 | | R34 | T19 |
| R16 | T11 | | R35 | T15 |
| R17 | T9, T11, T16 | | R36 | T19 |
| R18 | T9, T16 | | R37 | T17 |
| R19 | T9, T11, T16 | | | |

**Requisitos que dependen de una task bloqueada por QC-23**: **R27**, **R28** y **R29**. Los tres
tienen cobertura con dobles en **T13a** desde el primer día; lo que falta hasta que QC-23 entre es el
cableado real (T12), la prueba contra el mecanismo (T18) y el posible colapso en una sola transacción
(T13b). **Ningún otro requisito está bloqueado.**

## Orden sugerido de tandas

1. **Tanda A** — T1, T2, T3, T4. *(La base y su reversibilidad.)*
2. **Tanda B** — T5, T6, T7, T8. *(Dominio puro y puertos; T6 y T7 en paralelo.)*
3. **Tanda C** — T9, T10. *(Persistencia; T10 en paralelo con T9.)*
4. **Tanda D** — T11, T13a. *(Los dos casos de uso.)*
5. **Tanda E** — T14, T15, T19. *(La superficie y el alcance.)*
6. **Tanda F** — T16, T17. *(Integración y E2E.)*
7. **Tanda G** — T12, T13b, T18 **cuando QC-23 esté mergeada**, y T20.
