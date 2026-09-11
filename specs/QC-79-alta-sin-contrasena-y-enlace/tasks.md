# QC-79 — alta-sin-contrasena-y-enlace · tasks.md

> Zona: `fullstack` · Complejidad: `high` · depends_on: `QC-66` ·
> Rama: `feature/QC-79-alta-sin-contrasena-y-enlace`
>
> El **qué** está en `requirements.md` (R1–R41) y el **cómo** en `design.md`. Aquí va el orden.
>
> **Reglas de esta lista.** Cada task tiene un **criterio de hecho** verificable —no «está
> implementado», sino qué comando o qué aserción lo demuestra—. `[P]` marca lo que puede ir en
> paralelo con la task inmediatamente anterior sin tocar sus archivos. Cerrar una tanda es
> **`./init.sh --rapido`**; cerrar la feature y cualquier PR es **`./init.sh`** completo, sin
> excepción (regla 5 de `CLAUDE.md`).
>
> **T2 es una PUERTA HUMANA.** `resend` **no está instalada** y no se instala hasta que el humano
> apruebe el spec (F1.4) y la fila de `docs/dependencias.md` esté escrita (regla 7 de `CLAUDE.md`).
> Nada de T15 ni T16 se escribe antes.
>
> **Archivos que esta feature toca**, para la validación de conflicto del leader: `db/schema.prisma`,
> `db/migrations/<nueva>/`, `lib/modules/identity/**`, `lib/modules/errores/domain/**`,
> `lib/composition/index.ts`, `lib/shared/routes.ts`, `app/(public)/establecer-contrasena/**`,
> `e2e/`, `package.json`, `.env.example`, `docs/dependencias.md`, `tests/**`. **No** toca
> `middleware.ts`, `app/(private)/**`, `components/**` ni ningún otro módulo.

---

## Fase 0 — Anclas y la puerta de la dependencia

- [x] **T1 — Verificar las anclas del diseño sobre el árbol de esta rama.**
      Leer y anotar en `progress/impl_QC-79-alta-sin-contrasena-y-enlace.md`: la firma exacta de
      `UserAdminRepository.create`, el tamaño actual de `ERROR_CODES` (**32** al escribir esto), el
      nombre del traductor único de QC-70, la forma de `CreateUserFormState`, y los nombres exactos
      de `evaluateCredentialRules` / `createCredentialPolicy` y de `CREDENTIAL_RULES`.
      **Hecho cuando:** la bitácora lista los seis nombres con su ruta y su línea, y dice si alguno
      **difiere** de lo que `design.md` supone. Si difiere, se para y decide el leader.
      *(Sin dependencias.)*

- [x] **T2 — [PUERTA HUMANA] Registrar y solo entonces instalar `resend`.** — **R38**
      Añadir la fila a `docs/dependencias.md` con los cuatro checks de `design.md > 8`
      (`6.27.0` del 2026-09-09, 8.288.901 desc./sem., MIT, sin `deprecated`), estado `aprobada`, la
      fecha, quién aprobó, y **el archivo único donde queda aislada**. Después `pnpm add resend`.
      **Hecho cuando:** `pnpm exec vitest run tests/guards/guard-dependencias-aprobadas.test.ts`
      pasa y `package.json` no ganó ninguna otra entrada.
      *(Depende de la aprobación del spec en F1.4. **No se adelanta.**)*

## Fase 1 — La base de datos

- [x] **T3 — Modelo, migración y `down.sql`.** — **R11, R35, R36, R37**
      `CredentialSetupToken` en `db/schema.prisma` con su `/// @module identity`;
      `pnpm run db:migrate:create`; completar a mano el **índice único parcial**
      `credential_setup_tokens_one_live_per_user` y los dos `ALTER` de RLS (`ENABLE` + `FORCE`);
      escribir `down.sql` como inverso exacto.
      **Hecho cuando:** existen `migration.sql` y `down.sql`, el UP no contiene ningún `ALTER TABLE
      "users"`, y `pnpm run typecheck` pasa tras `prisma generate`.
      *(Depende de T1.)*

- [x] **T4 — [P] Test estático de la migración.** — **R35, R36, R37**
      `tests/unit/identity/schema/credential-setup-migration.test.ts`: el UP crea la tabla, la FK
      `RESTRICT`, los dos índices, el **parcial** con su `WHERE consumed_at IS NULL AND superseded_at
      IS NULL`, y RLS **forzado**; el UP **no** menciona `users` ni ninguno de los tres índices de
      QC-47; el `down.sql` borra índice y tabla y nada más. Con casos de sensibilidad: quitar el
      `FORCE` o el `WHERE` del parcial pone el test en rojo.
      **Hecho cuando:** el archivo pasa y sus dos casos de sensibilidad fallan al mutar el SQL.
      *(Depende de T3.)*

- [x] **T5 — [P] Las cuatro variables de entorno y su lector.** — **R28**
      `lib/modules/identity/adapters/driven/config/mail-config-env.ts` copiando el patrón de
      `storage-config-env.ts` (lectura **en la invocación**, error que nombra las que faltan sin
      filtrar ningún valor); `.env.example` con `RESEND_API_KEY`, `MAIL_FROM_ADDRESS` —vacía y con el
      comentario de que **su valor lo decide el humano**, pregunta abierta 1—, `APP_BASE_URL` y
      `MAIL_TRANSPORT`. Test `mail-config.test.ts`.
      **Hecho cuando:** la suite entera pasa **con las cuatro variables vacías**, y el test afirma
      que el mensaje de error nombra las que faltan y no contiene ningún valor.
      *(Depende de T1.)*

- [ ] **T6 — Ciclo real de migración.** — **R36**
      `pnpm run db:migrate` → `pnpm run db:rollback` → `pnpm run db:migrate`.
      **Hecho cuando:** la salida de los tres comandos está pegada en la bitácora y
      `_prisma_migrations` queda coherente.
      *(Depende de T3.)*

## Fase 2 — Errores y dominio puro

- [x] **T7 — Dos códigos nuevos en el catálogo de QC-70 y sus dos clases.** — **R34**
      `credential_link_invalid` y `user_not_pending` en `error-codes.ts` (bajo el encabezado de
      `identity` que ya existe, **sin redactar ninguna enmienda nueva**), su clave y su texto en
      `error-catalog.ts`; `CredentialLinkInvalidError` y `UserNotPendingError` en
      `identity/domain/errors.ts`. **Ripple en la misma tanda:**
      `tests/unit/errores/catalogo.test.ts` L45 de `32` a **`34`**, y dos casos nuevos en
      `tests/unit/identity/usuarios/errors.test.ts`.
      **Hecho cuando:** `pnpm exec vitest run tests/unit/errores tests/guards/guard-catalogo-de-errores.test.ts tests/unit/identity/usuarios/errors.test.ts`
      pasa, sin que ninguna expectativa se haya borrado ni debilitado.
      *(Depende de T1.)*

- [x] **T8 — [P] La vida del enlace, en dominio puro.** — **R8**
      `domain/credential-setup-link.ts`: `CREDENTIAL_SETUP_LINK_TTL_DAYS = 7`, el tipo del enlace y
      `evaluateLink(link, now)`. Sin `next/*`, sin Prisma, sin `lib/shared`.
      **Hecho cuando:** `link-lifetime.test.ts` cubre el instante exacto de caducidad y los dos
      bordes (un milisegundo antes vale, uno después no).
      *(Depende de T1.)*

- [x] **T9 — Los tres puertos y la fábrica del secreto.** — **R9, R10, R26**
      `ports/credential-setup-secret-factory.ts`, `ports/credential-setup-link-repository.ts`,
      `ports/credential-setup-mailer.ts` (que **devuelve un valor y no lanza**), y el adaptador
      `adapters/driven/security/credential-setup-secret-crypto.ts` con `randomBytes(32)` +
      base64url + SHA-256 hex. Nombres con `secret`/`digest`, **nunca** `password`.
      **Hecho cuando:** `secret-factory.test.ts` afirma 32 bytes de entropía, 43 caracteres
      base64url, dos llamadas distintas y la huella reproducible; y
      `guard-password-never-plaintext.test.ts` sigue verde **sin tocarla**.
      *(Depende de T1.)*

## Fase 3 — Persistencia y el alta

- [x] **T10 — El adaptador de persistencia del enlace: las dos transacciones.** — **R11, R12, R15, R16, R19, R20, R22**
      `credential-setup-link-prisma.ts` con `issueForPendingUser` (§ 4.5: `UPDATE` de sustitución +
      `INSERT`, `23505` → `'superseded'`, ámbito por `company_id` cuando llega) y
      `applyCredentialAndActivate` (§ 4.6: `UPDATE` condicional del enlace + `UPDATE` condicional de
      `users`, `ROLLBACK` si cualquiera de los dos da 0 filas). **Resultados discriminados, nunca
      excepciones de Prisma**; se afirma sobre el SQLSTATE (`23505`), nunca sobre el texto.
      **Hecho cuando:** sus tests unitarios con doble de Prisma cubren los cinco resultados, y T20
      los confirma contra Postgres real.
      *(Depende de T3, T9.)*

- [x] **T11 — El alta con contraseña opcional: las dos ramas.** — **R1, R2, R3, R4, R6, R7, R30**
      `domain/user-input.ts` gana `credential` **opcional** (sin `trim`, sin `max`: QC-19 R10 y R11);
      `domain/create-user.ts` reparte: con credencial → política de QC-19 **antes** de escribir +
      hash; sin credencial → `kind: 'none'` + emisión del enlace + envío; `requirePermission` sigue
      siendo la **primera línea**. `ports/user-admin-repository.ts` cambia `create` a la unión
      discriminada de `design.md > 6.1`.
      **Hecho cuando:** `create-user-credential.test.ts` demuestra, con dobles que **fallan si los
      llaman**, que sin permiso no se toca ningún puerto; que con contraseña **no se emite enlace ni
      se manda correo**; que sin contraseña **no se genera ninguna al azar**; y que una contraseña
      débil no crea fila, no emite enlace y devuelve las reglas incumplidas.
      *(Depende de T7, T8, T9. **Toca los tests de QC-66** de § 2 fila 4: se reescriben aquí, en esta
      misma tanda.)*

- [x] **T12 — El alta sin credencial en Prisma: el centinela.** — **R4, R37**
      `user-admin-prisma.ts` escribe `NO_CREDENTIAL_SENTINEL` cuando `kind === 'none'`; la constante
      se declara **una vez** en el dominio. `users` **no cambia**: ni columna, ni índice, ni
      migración.
      **Hecho cuando:** T20 afirma contra Postgres que **ninguna** contraseña —incluida la cadena
      centinela— verifica contra ese valor con `verifyPasswordHash`.
      *(Depende de T11.)*

## Fase 4 — Los dos casos de uso nuevos

- [x] **T13 — Establecer la contraseña con el enlace.** — **R18, R19, R21, R22, R23**
      `domain/set-credential-with-link.ts`: **sin permiso y sin sesión**; política completa de QC-19
      antes de escribir; éxito → `applyCredentialAndActivate`; la **marca de cambio de credencial no
      se toca** (R21, ver P3); los seis casos de rechazo devuelven **el mismo**
      `CredentialLinkInvalidError`; una contraseña débil **no consume el enlace**.
      **Hecho cuando:** `set-credential-with-link.test.ts` cubre los seis rechazos y afirma que son
      **indistinguibles** (mismo `code` y mismo mensaje), y que tras un rechazo por política el
      enlace sigue vivo.
      *(Depende de T10.)*

- [x] **T14 — [P] Reenviar el enlace.** — **R14, R15, R16, R30**
      `domain/issue-credential-setup-link.ts`: `usuarios.modificar` como **primera línea**, actor por
      parámetro, falla cerrado; ámbito por empresa; `user_not_found` si no existe/borrado/otra
      empresa, `user_not_pending` si ya no está en `pending`; el anterior muere y el nuevo cuenta 7
      días desde el reenvío; la carrera `'superseded'` responde éxito **sin** mandar un segundo
      correo.
      **Hecho cuando:** `resend-link.test.ts` cubre los cuatro caminos y demuestra con dobles que sin
      permiso no se toca ningún puerto ni se envía nada.
      *(Depende de T10.)*

## Fase 5 — Correo

- [x] **T15 — El adaptador `resend` y su guardia.** — **R13, R27, R29, R38**
      `credential-setup-mailer-resend.ts`: **el único** archivo que importa `resend`; cliente
      construido **dentro** de la función con la clave de T5; URL armada con `APP_BASE_URL`; asunto y
      cuerpo en **dos constantes** al principio del archivo (pregunta abierta 2); un fallo devuelve
      `'failed'` y **no lanza**, y su línea de registro **no** lleva URL, ni secreto, ni el correo del
      destinatario. Más `tests/guards/guard-envio-de-correo.test.ts`: un solo import de `resend` en
      todo el repo, y `package.json` sin ninguna otra entrada nueva.
      **Hecho cuando:** `mailer-resend.test.ts` y la guardia pasan, y un segundo import de `resend`
      añadido a mano pone la guardia en rojo.
      *(Depende de **T2** y de T5, T9.)*

- [x] **T16 — [P] El transporte de buzón, para que el E2E exista.** — **R41 (habilitante)**
      `credential-setup-mailer-outbox.ts`: escribe el mensaje como JSON en `MAIL_OUTBOX_DIR`; **se
      niega a arrancar si `NODE_ENV === 'production'`**, nombrando la variable.
      **Hecho cuando:** la guardia de T15 gana dos casos que afirman, leyendo el código, que el
      transporte por defecto es `resend` y que el buzón rechaza producción.
      *(Depende de T15.)*

## Fase 6 — Composición y frontera

- [x] **T17 — Cablear los tres puertos y elegir el transporte.** — **R26, R32**
      `lib/composition/index.ts`: repositorio del enlace, fábrica del secreto y **el mailer según
      `MAIL_TRANSPORT`** (`resend` por defecto); reutilizar `passwordHasher` y
      `checkCredentialPolicy` ya cableados, **sin crear segundos**; añadir las dos factories nuevas a
      la fachada `identity`. **Sin reordenar ni reformatear nada de lo que hay.**
      **Hecho cuando:** `tests/unit/composition/identity-facade.test.ts` pasa con las dos claves
      nuevas y `guard-arquitectura-modulos.test.ts` sigue verde.
      *(Depende de T13, T14, T16.)*

- [x] **T18 — Las dos Server Actions nuevas y el estado del alta.** — **R14, R18, R30, R33, R34**
      `adapters/driving/credential-setup-actions.ts` con `FormData` en las dos; la pública **no
      resuelve actor**; la de reenvío lo resuelve de las dos caras de la sesión. `user-actions.ts`:
      `CreateUserFormState` gana `mail` en `success` y la variante `invalid_credential`. Traducción
      con el **traductor único** de QC-70; el `unexpected` conserva su `reference` de QC-71.
      **Hecho cuando:** `credential-setup-actions.test.ts` afirma que el estado serializado **no
      contiene** el secreto que el doble emitió, y `user-actions.test.ts` cubre las cinco variantes.
      *(Depende de T17.)*

- [x] **T19 — La página pública.** — **R17, R24, R25**
      `CREDENTIAL_SETUP_ROUTE` y su helper en `lib/shared/routes.ts` (**no** entra en
      `PRIVATE_ROUTE_PREFIXES`); `app/(public)/establecer-contrasena/[token]/page.tsx` +
      `components/index.ts` con el formulario; `<meta name="referrer" content="no-referrer">`, ningún
      recurso de terceros, ningún dato del usuario en pantalla; `min-h-dvh`, 16 px en los campos,
      44 px en los botones, mostrar/ocultar como **botón**.
      **Hecho cuando:** `set-credential-form.test.tsx` pasa y
      `guard-rutas-privadas-cubiertas.test.ts` sigue verde (la ruta es pública y no debe aparecer en
      los prefijos).
      *(Depende de T18.)*

## Fase 7 — Verificación

- [x] **T20 — Integración contra Postgres real.** — **R9, R11, R12, R19, R20, R22, R37**
      `tests/integration/identity/credential-setup.int.test.ts`: la columna guarda la **huella** y no
      el secreto; **dos emisiones concurrentes → un solo enlace vivo** (el `23505` del índice
      parcial, con dos conexiones de verdad); **dos usos concurrentes → uno solo gana**; usuario
      borrado / ya activo → la transacción revierte entera; el centinela de T12 no verifica contra
      ninguna contraseña.
      **Hecho cuando:** el archivo pasa y su `beforeAll` falla con un mensaje claro («corre
      `pnpm run db:migrate`») si la tabla no existe.
      *(Depende de T6, T12, T13, T14.)*

- [ ] **T21 — El E2E del camino completo.** — **R12, R41**
      `e2e/establecer-contrasena.spec.ts` con `MAIL_TRANSPORT=outbox`: alta **sin** contraseña →
      leer el enlace del buzón → establecer la contraseña → **entrar** con ella al dashboard →
      reabrir el mismo enlace y comprobar que **ya no sirve**.
      **Hecho cuando:** `pnpm exec playwright test e2e/establecer-contrasena.spec.ts` pasa en verde
      dos corridas seguidas.
      *(Depende de T19, T20.)*

- [ ] **T22 — Test de alcance y frontera.** — **R5, R13, R31, R32, R39, R40**
      `scope.test.ts`: ningún `console.*` en los archivos que tocan el secreto; ningún archivo de la
      feature bajo `app/(private)/`; ningún route handler, cron ni cola; ninguna mención a
      `failed_login_attempts`/`lock_level`/`locked_until`; ninguna operación que emita enlace sin
      permiso salvo el alta y el reenvío; el barrel `identity/index.ts` sin ningún `'use server'`.
      **Hecho cuando:** el archivo pasa y `guard-arquitectura-modulos.test.ts` sigue verde.
      *(Depende de T19.)*

- [ ] **T23 — Cerrar el ripple ajeno de `design.md > 2`.**
      Correr `pnpm exec vitest related --run` sobre todos los archivos de producción tocados y
      atender lo que salga rojo **sin debilitar ninguna expectativa**. Si aparece un archivo que
      `design.md > 2` no lista, se anota en la bitácora como el «noveno archivo» (precedente QC-66).
      **Hecho cuando:** `pnpm test` completo está en verde y la bitácora dice cuántos archivos ajenos
      fueron **de verdad**.
      *(Depende de T22.)*

- [ ] **T24 — Gate completo y bitácora.**
      `./init.sh` entero. Escribir `progress/impl_QC-79-alta-sin-contrasena-y-enlace.md` con el mapa
      **`R<n> → test`** (`CHECKPOINTS.md > Trazabilidad`), la salida del ciclo de T6, el número real
      de archivos ajenos y cualquier punto donde el código se apartó del diseño.
      **Hecho cuando:** `./init.sh` termina en verde y el mapa cubre **los 41** requisitos.
      *(Depende de T23.)*

---

## Trazabilidad — cada `R<n>` a su task

Ningún requisito queda sin task. La columna de la derecha es la task que lo **cierra**; entre
paréntesis, las que contribuyen.

| R | Task |
| --- | --- |
| R1 | T11 |
| R2 | T11 |
| R3 | T11 |
| R4 | T12 (T11) |
| R5 | T22 (T11, T13) |
| R6 | T11 |
| R7 | T11 (T9, T10) |
| R8 | T8 |
| R9 | T20 (T9) |
| R10 | T9 |
| R11 | T20 (T3, T10) |
| R12 | T21 (T10, T20) |
| R13 | T15 (T22) |
| R14 | T14 (T18) |
| R15 | T14 (T10) |
| R16 | T14 (T10) |
| R17 | T19 |
| R18 | T13 (T18) |
| R19 | T13 (T10, T20) |
| R20 | T20 (T10) |
| R21 | T13 |
| R22 | T13 (T10, T20) |
| R23 | T13 |
| R24 | T19 |
| R25 | T19 |
| R26 | T17 (T9) |
| R27 | T15 |
| R28 | T5 |
| R29 | T15 |
| R30 | T18 (T11, T14) |
| R31 | T22 |
| R32 | T17 (T22) |
| R33 | T18 |
| R34 | T7 (T18) |
| R35 | T4 (T3) |
| R36 | T6 (T3, T4) |
| R37 | T4 (T3, T12) |
| R38 | T2 (T15) |
| R39 | T22 |
| R40 | T22 |
| R41 | T21 (T16) |

**Cobertura, comprobada al escribir esta lista:** R1–R41 sin huecos; **41 requisitos, 24 tasks**,
ninguna task sin criterio de hecho y ninguna sin su dependencia declarada.

## Orden y paralelismo, de un vistazo

```
T1
 ├─ T2  [PUERTA HUMANA — F1.4]
 ├─ T3 ─ T4 [P] ─ T6
 ├─ T5 [P]
 ├─ T7 [P]
 ├─ T8 [P]
 └─ T9
        T10 (T3,T9) ─ T11 (T7,T8,T9) ─ T12
        T13 (T10) ─┬─ T17 (T13,T14,T16) ─ T18 ─ T19 ─ T22
        T14 (T10) ─┘
        T15 (T2,T5,T9) ─ T16 [P]
        T20 (T6,T12,T13,T14) ─ T21 (T19,T20)
        T23 ─ T24
```

**Lo que NO puede solaparse, y por qué:** T15 y T16 no se empiezan antes de T2 —escribir el adaptador
de una librería no aprobada es instalarla de hecho—; T11 reescribe tests de QC-66 y tiene que cerrar
su tanda con `./init.sh --rapido` antes de que T12 los toque otra vez; y T21 necesita T20 porque sin
la migración aplicada de verdad el navegador no tiene nada que visitar.
