# QC-23 — registro-de-sesiones · tasks.md

> Checklist del implementer. `[P]` = paralelizable con las tareas de su mismo bloque.
> Cada tarea dice **archivos esperados** y **criterio de hecho**. El mapa `R<n> -> test` final va
> en `progress/impl_QC-23-registro-de-sesiones.md` (`CHECKPOINTS.md > Trazabilidad`).
>
> **Gate:** `./init.sh --rapido` al cerrar cada bloque; `./init.sh` completo al cerrar la feature
> y **antes del PR, sin excepcion** (regla 5 de `CLAUDE.md`).
>
> **Entorno:** el worktree se acaba de crear. Antes de nada: `pnpm install` y
> `pnpm exec next typegen` (sin lo segundo `app/layout.tsx` no compila por `LayoutProps`, que
> esta git-ignorado). Es deuda del arnes, no de esta ficha.

---

## Bloque 1 — Esquema y migracion (sin dependencias)

- [ ] **T1. Modelo `RevokedSession` y columna `users.sessions_valid_from` en el esquema.**
  Archivos: `db/schema.prisma`.
  Segun `design.md > 2.1` y `> 2.2`: PK = el `sid`, `user_id` **escalar sin `@relation`**,
  `expires_at`, `revoked_at`, `created_at`, `updated_at`, indice por `user_id`, `/// @module
  identity` y el comentario que explica por que no lleva `deleted_at`.
  **Hecho cuando:** `pnpm exec prisma validate --schema=db/schema.prisma` pasa y
  `pnpm run typecheck` sigue verde con el cliente regenerado.

- [ ] **T2. Migracion UP + `down.sql`.** Depende de T1.
  Archivos: `db/migrations/<ts>_session_revocation/migration.sql`, `.../down.sql`.
  `pnpm run db:migrate:create`, despues **revisar a mano** el SQL generado (drift: que no borre
  FK/CHECK/RLS de migraciones anteriores), añadir a mano la FK
  `revoked_sessions_user_id_fkey` (`ON DELETE RESTRICT ON UPDATE CASCADE`) y los dos `ALTER
  TABLE ... ROW LEVEL SECURITY` (`ENABLE` + `FORCE`). Escribir el `down.sql` en orden inverso.
  **Hecho cuando:** `pnpm run db:migrate` aplica, `pnpm run db:rollback` revierte dejando
  `_prisma_migrations` coherente, y volver a aplicar funciona. (R21, R22, R23, R24)

- [ ] **T3. [P] Test de esquema/migracion.** Depende de T2.
  Archivos: `tests/unit/identity/schema/session-revocation-migration.test.ts`.
  Al estilo de `tests/unit/unidades/schema/unidades-migration.test.ts`: lee los `.sql` y afirma
  `ENABLE`+`FORCE ROW LEVEL SECURITY`, identificadores en ingles, las columnas de marcas de
  tiempo y `expires_at`, y que el `down.sql` revierte exactamente lo del UP.
  **Hecho cuando:** el test pasa y falla si se quita el `FORCE`. (R21, R22, R23, R24)

---

## Bloque 2 — Token `v3` (depende del bloque 1 solo para el gate, no para el codigo)

- [ ] **T4. `sid` en el contenido firmado.**
  Archivos: `lib/modules/identity/domain/session-claims.ts`,
  `lib/modules/identity/domain/session.ts`.
  `SESSION_CLAIMS_SCHEMA` gana `sid: z.string().uuid()`; `SessionClaims` gana `sessionId`;
  `SessionTicket` y `createSessionTicket` ganan `sessionId` **por parametro** (nada de generar
  aleatoriedad en el dominio).
  **Hecho cuando:** unitarios de `parseSessionClaims` cubren `sid` ausente / vacio / no-texto /
  sin forma de UUID -> `null`. (R3, R5)

- [ ] **T5. Version `v3` en el codec.** Depende de T4.
  Archivos: `lib/modules/identity/adapters/driven/session/session-token.ts`,
  `tests/unit/identity/session-token.test.ts`, `tests/unit/identity/session-cookie.test.ts`.
  `SESSION_VALUE_VERSION = 'v3'`, `SessionPayload` gana `sid`. **No se toca** el algoritmo, la
  clave ni la codificacion. En los tests existentes, los unicos cambios admisibles son el literal
  de version y la lista de claves del payload.
  **Hecho cuando:** un valor `v2` se rechaza **sin** llegar a recomputar la firma, y `guard-
  firma-sesion-unica` sigue verde. (R4, R19)

- [ ] **T6. [P] Puerto y adaptador del generador de `sid`.** Depende de T4.
  Archivos: `lib/modules/identity/ports/session-id-generator.ts`,
  `lib/modules/identity/adapters/driven/session/session-id-crypto.ts`.
  `next(): string` sobre `crypto.randomUUID()`. Sin dependencias nuevas.
  **Hecho cuando:** dos llamadas devuelven identificadores distintos con forma de UUID. (R3, R26)

- [ ] **T7. `verifyCredentials` pide un `sid` al emitir.** Depende de T4, T6.
  Archivos: `lib/modules/identity/domain/verify-credentials.ts`,
  `tests/unit/identity/verify-credentials.test.ts`.
  `VerifyCredentialsDeps` gana `ids: SessionIdGenerator`; el ticket se construye con
  `ids.next()`. El rol sigue saliendo de la base.
  **Hecho cuando:** el test afirma que dos logins consecutivos del mismo usuario producen `sid`
  distintos. (R3)

---

## Bloque 3 — Dominio de la revocacion (depende del bloque 2)

- [ ] **T8. Reglas puras del sello.**
  Archivos: `lib/modules/identity/domain/session-revocation.ts`.
  `ceilToNextSecond(now)` y `isRevokedByStamp(issuedAt, sessionsValidFrom)` con la comparacion
  estricta de `design.md > 2.3`.
  **Hecho cuando:** hay test del caso frontera «token emitido en el mismo segundo que el sello
  queda revocado» y del caso `sessionsValidFrom === null` -> no revocada. (R1, R2)

- [ ] **T9. [P] Puertos del almacen de revocacion.**
  Archivos: `lib/modules/identity/ports/session-revocation-reader.ts`,
  `lib/modules/identity/ports/session-revocation-writer.ts`,
  `lib/modules/identity/ports/session-user-reader.ts` (M: `SessionUserRecord` gana
  `sessionsValidFrom: Date | null`).
  **Hecho cuando:** `pnpm run typecheck` pasa y `guard-arquitectura-modulos` sigue verde
  (`ports/` no importa nada de fuera). (R6, R20)

- [ ] **T10. [P] Error de autorizacion del modulo.**
  Archivos: `lib/modules/identity/domain/errors.ts`.
  `IdentityError` + `UnauthorizedError` (`code: 'unauthorized'`), misma forma que los de
  `inventario`, **sin** importar los de otro modulo.
  **Hecho cuando:** `instanceof UnauthorizedError` funciona tras `JSON`/`throw` (el
  `setPrototypeOf` esta puesto). (R10)

- [ ] **T11. Los cortes en `resolveSessionUser`.** Depende de T8, T9.
  Archivos: `lib/modules/identity/domain/resolve-session-user.ts`,
  `tests/unit/identity/resolve-session-user.test.ts`.
  Añade, en el orden de `design.md > 4.1`: rol firmado vs rol actual, sello, `isRevoked(sid)`, y
  el **fallo cerrado** (cualquier excepcion de los pasos 3–6 -> `null`).
  **Hecho cuando:** hay un test por corte, **incluido uno con un puerto que lanza** que afirma
  `null` y no propagacion, y otro que afirma que los cortes 1 y 2 **no** consultan la base.
  (R11, R12, R13, R14, R2)

- [ ] **T12. Casos de uso de cierre.** Depende de T9, T10.
  Archivos: `lib/modules/identity/domain/end-session.ts`,
  `lib/modules/identity/domain/revoke-sessions.ts`.
  Los tres de `design.md > 5`: `createEndSession` (cierra solo la actual; retira la cookie aunque
  el registro falle y propaga el fallo), `createRevokeAllOwnSessions` (sello propio + cookie
  retirada), `createRevokeAllSessionsOfUser` (los dos cortes de permiso **antes** de tocar
  ningun puerto).
  **Hecho cuando:** hay test de cada uno, incluidos los dos rechazos —actor no Administrador y
  objetivo == actor— y el de «el registro falla: la cookie se retira igual y el error sale».
  (R7, R8, R9, R10, R16, R22)

---

## Bloque 4 — Adaptadores y cableado (depende del bloque 3)

- [ ] **T13. Adaptador Prisma del almacen de revocacion.** Depende de T2, T9.
  Archivos: `lib/modules/identity/adapters/driven/persistence/session-revocation-prisma.ts`.
  `isRevoked` (lectura por PK), `revokeSession` (`ON CONFLICT DO NOTHING`), `stampUserSessions`
  (UPDATE de `sessions_valid_from`). Unico sitio del repo con `prisma.revokedSession`. Registra
  el fallo con contexto y **relanza** (`docs/conventions.md > Manejo de errores`).
  **Hecho cuando:** `guard-arquitectura-modulos` verde y el doble `revokeSession` del mismo `sid`
  no lanza. (R6, R7, R14, R20, R22)

- [ ] **T14. [P] `sessions_valid_from` en la lectura de usuario.** Depende de T2, T9.
  Archivos: `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts`.
  El `select` gana la columna; sigue siendo igual de estrecho que el tipo del puerto.
  **Hecho cuando:** typecheck verde y el `select` no trae ningun campo de mas. (R2, R13)

- [ ] **T15. Cableado.** Depende de T6, T11, T12, T13, T14.
  Archivos: `lib/composition/index.ts`.
  Cablea `SessionIdGenerator`, `SessionRevocationReader/Writer`; pasa `ids` a
  `createVerifyCredentials` y las revocaciones a `createResolveSessionUser`; **reapunta
  `endSession`** al caso de uso nuevo; expone `revokeAllOwnSessions` y
  `revokeAllSessionsOfUser` en la fachada `identity`. **`lib/composition/edge.ts` NO se toca.**
  **Hecho cuando:** `guard-middleware-edge` sigue verde (el borde no arrastra Prisma) y
  `logout-action.ts` **no ha cambiado ni una linea**. (R15, R16, R20)

- [ ] **T16. Server Action «cerrar todas mis sesiones».** Depende de T15.
  Archivos: `lib/modules/identity/adapters/driving/logout-all-sessions-action.ts`.
  `'use server'`, sin parametros, sin valor de retorno, `redirect(LOGIN_ROUTE)` **fuera** de todo
  `try`. No se exporta desde el barrel del modulo.
  **Hecho cuando:** existe su test de adaptador y `guard-arquitectura-modulos` sigue verde.
  (R8, R17)

- [ ] **T17. [P] Comprobar que no se expone listado de sesiones abiertas.** Depende de T15.
  Archivos: `tests/unit/identity/identity-contract.test.ts` (o el que ya cubra el barrel).
  Afirma que el contrato publico expone las tres operaciones de revocacion y **ninguna** de
  listado, y que no existe tabla de sesiones **abiertas** en el esquema.
  **Hecho cuando:** el test pasa y falla si se añade una funcion de listado. (R17)

---

## Bloque 5 — Integracion, deuda heredada y cierre

- [ ] **T18. Tests de integracion.** Depende del bloque 4.
  Archivos: `tests/integration/identity/session-revocation.test.ts`.
  Cerrar una sesion no toca la otra; «cerrar todas» tumba las dos incluida la actual; cambio de
  rol y `deleted_at` cortan en la peticion siguiente; el cierre repetido es idempotente.
  **Hecho cuando:** los cuatro escenarios pasan y el test limpia las filas que crea.
  (R7, R8, R11, R12)

- [ ] **T19. Sustituir el test de caracterizacion de QC-9 R30.** Depende de T11.
  Archivos: el test que hoy afirma que el rol firmado envejece hasta la caducidad.
  **Se sustituye, no se borra**: el test nuevo afirma lo contrario (R11), cita R30 y explica en
  su cabecera que QC-23 cerro esa deuda. **La fila de la tabla de decisiones de QC-9 no se
  reescribe** — es de otra ficha.
  **Hecho cuando:** no queda ningun test verde afirmando el comportamiento antiguo. (R11)

- [ ] **T20. Caducidad y no-reemision.** Depende de T11.
  Archivos: `tests/unit/identity/resolve-session-user.test.ts`.
  Afirma que comprobar la revocacion **no** reemite, prolonga ni borra la cookie y que la
  duracion sigue siendo 8 h absolutas.
  **Hecho cuando:** el test pasa. (R18)

- [ ] **T21. Documentacion y estado.** Depende de todo lo anterior.
  Archivos: `docs/architecture.md > Permisos y autenticacion` (el parrafo que hoy dice «La
  invalidacion inmediata es QC-23» deja de ser futuro), `progress/impl_QC-23-registro-de-
  sesiones.md` con el mapa **`R1..R26 -> test`** (R25 documentado como **diferido a QC-53**, con
  su motivo).
  **Hecho cuando:** cada `R<n>` salvo R25 tiene al menos un test citado por ruta y nombre.

- [ ] **T22. Gate completo y PR.** Depende de T21.
  **Hecho cuando:** `./init.sh` termina en verde (no `--rapido`), `pnpm run db:rollback` +
  `db:migrate` se han ejercitado una vez mas tras el ultimo cambio de esquema, y el PR queda
  abierto. La deuda de E2E (R25 -> QC-53) queda anotada en `progress/current.md > Deudas y cosas
  abiertas`.
