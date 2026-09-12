# QC-23 — registro-de-sesiones · tasks.md

> `[P]` = paralelizable con las tareas que comparten sus dependencias. Cada task lleva su criterio
> de **hecho**. Nada se marca `[x]` sin que su criterio se cumpla de verdad;
> `./init.sh --rapido` cierra cada tanda y `./init.sh` completo cierra la feature y va **antes del
> PR** (regla 5 de `CLAUDE.md`).

## Fase 1 — Esquema y migración

- [ ] **T1. Esquema Prisma: el sello y la tabla del registro.**
  `users.sessionsValidFrom` (`@default(now())`, `@db.Timestamptz(6)`, sin índice) y el modelo
  `RevokedSession` con `/// @module identity`, su `@@unique([sessionId])`, su
  `@@index([userId, expiresAt])`, la FK `RESTRICT` y la relación inversa en `User`.
  **Hecho:** `pnpm prisma validate` pasa; los identificadores son inglés `snake_case` vía
  `@map`/`@@map`; el modelo no lleva columna de empresa, ni `updated_at`, ni `deleted_at`, y el
  comentario de cabecera dice por qué (design.md § 2.2).
  _Deps: —_

- [ ] **T2. Migración `session_revocation`, UP y DOWN.**
  `ADD COLUMN sessions_valid_from`, `CREATE TABLE revoked_sessions` + dos índices + FK, y los dos
  `ALTER … ENABLE/FORCE ROW LEVEL SECURITY` **sin policies**. `down.sql` inverso línea a línea, sin
  `CASCADE`. **Revisar a mano** el ruido de drift que emite Prisma: esta migración toca `users` y un
  `DROP INDEX` colado se llevaría `users_email_unique`.
  **Hecho:** `pnpm run db:migrate` aplica; `pnpm run db:rollback` revierte y deja
  `_prisma_migrations` coherente; un segundo `db:migrate` vuelve a aplicar sin error; el `down.sql`
  no contiene ningún objeto que el UP no cree.
  _Deps: T1_

- [ ] **T3. [P] Test del archivo de migración.**
  Lee `migration.sql` y `down.sql` y afirma: RLS `ENABLE` **y** `FORCE` sobre `revoked_sessions`;
  cero `CREATE POLICY`; los dos índices con su nombre exacto; **ningún** `DROP INDEX`/`DROP
  CONSTRAINT` sobre los índices únicos funcionales de `users`; y que el DOWN cubre todo lo que el UP
  crea. Mismo patrón que `tests/unit/identity/schema/credential-setup-migration.test.ts`.
  **Hecho:** el test existe, es rojo si se borra una línea del UP o del DOWN, y `guard-rls-force`
  sigue verde.
  _Deps: T2_

## Fase 2 — El token `v4`

- [ ] **T4. Códec: `sid` dentro del contenido firmado.**
  `SESSION_VALUE_VERSION → 'v4'`; `SessionPayload` gana `sid`; `SESSION_CLAIMS_SCHEMA` gana
  `sid: z.string().uuid()`; `SessionClaims` gana `sessionId` (traducción `sid → sessionId` donde ya
  se traducen `role` y `cid`); `SessionTicket` y `createSessionTicket` ganan `sessionId` posicional
  y obligatorio. **La firma no se toca.**
  **Hecho:** `typecheck` marca uno a uno los sitios de llamada; un valor `v3` con firma correcta
  devuelve `null` **sin** llegar a recomputar el HMAC; `guard-firma-sesion-unica` sigue verde y
  `session-token.test.ts` sigue comparando `toBe` contra `node:crypto`.
  _Deps: —_

- [ ] **T5. [P] Puerto `SessionIdFactory` y su adaptador.**
  `ports/session-id-factory.ts` (`newSessionId(): string`) y
  `adapters/driven/session/session-id-crypto.ts` con `crypto.randomUUID()`.
  **Hecho:** el dominio no invoca ninguna fuente de azar propia; un test afirma que dos invocaciones
  seguidas devuelven UUID distintos y con forma de UUID.
  _Deps: —_

- [ ] **T6. Dominio de la revocación (funciones puras).**
  `domain/session-revocation.ts`: `floorToSecond(date)`, `isStampedOut(claims, sessionsValidFrom)`
  con la comparación **`<=`** (design.md § 2.3) y `changeRevokesSessions(change)` con las tres
  variantes (`account_status`, `role`, `delete`) y `pending`/`active` en `false`.
  **Hecho:** dominio puro —sin `next/*`, sin Prisma, sin `lib/shared/**`—; `now` nunca se lee
  dentro; tabla de casos probada con objetos planos, incluido el borde «emitida en el mismo segundo
  que el sello» → inválida.
  _Deps: —_

## Fase 3 — Almacén y comprobación por petición

- [ ] **T7. Los tres puertos nuevos.**
  `SessionRevocationRepository` (`revokeSession`, `stampAll`, **sin ningún método de listado**),
  `SessionEraser` (`clear`) y `SessionCheckLog` (`log(diagnostic, requestId)`).
  **Hecho:** puertos puros, sólo tipos de su propio `domain/` por ruta relativa; el comentario de
  cabecera dice por qué no hay listado (decisión 12); «enséñame mis dispositivos» **no compila**.
  _Deps: T6_

- [ ] **T8. Adaptador `session-revocation-prisma.ts`.**
  `revokeSession`: `INSERT` + purga (`DELETE … WHERE user_id = ? AND expires_at <= ?`) en **una**
  transacción, con el `23505` de `revoked_sessions_session_id_key` traducido a éxito.
  `stampAll`: `UPDATE users SET sessions_valid_from = ? WHERE id = ? AND company_id = ? AND
  deleted_at IS NULL` + la misma purga, devolviendo `'ok' | 'not_found'`.
  **Hecho:** único archivo del repo con `prisma.revokedSession`; sin ningún `SELECT` previo de
  existencia; la purga nunca recorre la tabla entera.
  _Deps: T2, T7_

- [ ] **T9. `SessionUserReader` con el `sid`.**
  Firma `findActiveById(id, sessionId)`; el record gana `sessionsValidFrom` y
  `sessionRevokedAt: Date | null`, los dos **crudos**; el adaptador Prisma los trae en el **mismo**
  `findFirst`, por la relación `revokedSessions: { where: { sessionId }, take: 1 }`.
  **Hecho:** un test con contador de invocaciones afirma **una sola** llamada al cliente Prisma por
  resolución, igual que el que ya vigila `role.permissions`; el `select` no gana ningún dato de PII.
  _Deps: T1_

- [ ] **T10. Los cortes 7 y 8 en `resolve-session.ts`, y el fallo cerrado.**
  Dos `if` nuevos detrás de los seis existentes, **sin tocar ni reordenar** ninguno de ellos; `try`
  acotado **exactamente** a la línea de `findActiveById`, con `log(causa, requestId)` y `return
  null` en el `catch`.
  **Hecho:** los seis cortes antiguos conservan su orden y sus tests; el `catch` no está vacío y
  registra con el identificador de petición de QC-71; el detalle no llega al navegador.
  _Deps: T6, T9_

## Fase 4 — Los casos de uso

- [ ] **T11. `end-session.ts` y el cierre de un dispositivo.**
  Caso de uso `createEndSession`: leer claims → registrar el cierre + purgar → borrar la cookie
  **siempre**, también si el registro falló, dejando la causa en el log con el identificador de
  petición. La clave de la fachada sigue llamándose `endSession`.
  **Hecho:** `logout-action.ts` **no cambia ni una línea** y
  `tests/unit/identity/logout-action.test.ts` sigue verde sin tocarlo; un test afirma que las demás
  sesiones de esa persona siguen resolviendo; otro, que el sello **no** sube.
  _Deps: T7_

- [ ] **T12. `end-all-sessions.ts` — el cierre total.**
  Autorización en la **primera línea**: sobre uno mismo no exige código; sobre otra persona exige
  `usuarios.modificar`. Ámbito por empresa y vivo en el puerto; `'not_found'` → `UserNotFoundError`.
  **Hecho:** tests de denegación con actor ausente, sin permisos, con el conjunto vacío, con un
  conjunto que no es array y sin el código exacto; test de que apuntarse a uno mismo **sí** está
  permitido (no es `self_operation`); test de que un objetivo de otra empresa responde
  `user_not_found` y **no** `unauthorized`; ningún código de error nuevo en el catálogo de QC-70.
  _Deps: T7_

- [ ] **T13. `end-other-sessions.ts` — todas menos la actual.**
  Sube el sello y reemite la sesión actual con `sid` nuevo e `issuedAt = sello + 1 s`.
  **Hecho:** un test afirma que la cookie vieja del **mismo** dispositivo queda inválida y la nueva
  vale; otro, que una sesión ajena emitida **en el mismo segundo** del sello queda inválida; otro,
  que la ventana de la sesión nueva sigue siendo de 8 h absolutas y que ninguna petición ordinaria
  reemite nada.
  _Deps: T4, T5, T6, T7_

## Fase 5 — Los cortes en las escrituras que ya existen

- [ ] **T14. El sello sube dentro de las transacciones de QC-66.**
  `applyGuardedChange` (`account_status`, `delete`) y `updateAliveInCompany` (cambio de rol)
  escriben `sessions_valid_from` en el **mismo** `UPDATE`, decidido por `changeRevokesSessions`.
  **Hecho:** integración que prueba las cuatro transiciones —`blocked`, `inactive`, borrado, cambio
  de rol— y las dos que **no** cortan (`pending`, rol reescrito igual); si la transacción aborta por
  `last_administrator`, el sello **no** cambió; reactivar una cuenta bloqueada **no** revive sus
  sesiones.
  _Deps: T6_

- [ ] **T15. El sello sube al establecer la contraseña con el enlace (QC-79).**
  `applyCredentialAndActivate` añade `sessionsValidFrom` a su `UPDATE`, dentro de la transacción
  atómica que ya tiene.
  **Hecho:** la suite de QC-79 sigue verde; un test de integración afirma que tras consumir el
  enlace el sello de esa persona quedó en el instante del consumo.
  _Deps: T6_

- [ ] **T16. Guardia `guard-sesiones-cortadas.test.ts`.**
  Recorre `lib/modules/identity/adapters/driven/persistence/**` y se pone roja si un `data` de
  escritura Prisma lleva `passwordHash:` sin `sessionsValidFrom:` en el mismo objeto.
  **Hecho:** verde con el código de T15; roja si se quita esa línea; el mensaje de fallo nombra
  QC-23 y la decisión 2, para que quien la encuentre en QC-89 sepa qué hacer.
  _Deps: T14, T15_

## Fase 6 — Cableado, pruebas y cierre

- [ ] **T17. Cableado en `lib/composition/index.ts`.**
  `sessionIds`, `sessionEraser`, `sessionRevocations`, `sessionCheckLog`, y las tres claves
  `endSession` / `endAllSessions` / `endOtherSessions`. Bloque **al final**, sin reordenar ni
  reformatear nada; `resolveSession` se sigue construyendo **una sola vez**.
  **Hecho:** `guard-arquitectura-modulos` verde; ningún adaptador driven cableado fuera de este
  archivo; `lib/composition` no importa ningún driving; el actor **no** se resuelve aquí.
  _Deps: T5, T7, T8, T11, T12, T13_

- [ ] **T18. [P] Tests unit del códec.**
  `sid` ausente / vacío / no-texto / sin forma de UUID → `null` **sin consultar la base**; `v3`
  rechazado sin verificar firma; dos emisiones → `sid` distintos; ida y vuelta `v4`.
  **Hecho:** los cuatro casos de entrada inválida pasan por `parseSessionClaims` y ninguno toca el
  puerto de usuarios.
  _Deps: T4_

- [ ] **T19. [P] Tests unit de la resolución.**
  Corte por sello; corte por registro; **convivencia** —caso en que los dos aplican, mismo resultado
  con los dos órdenes de evaluación, y cada uno por separado también corta—; una sola invocación del
  puerto; fallo del puerto → `null` + log con identificador de petición.
  **Hecho:** los seis cortes previos conservan sus tests sin modificar.
  _Deps: T10_

- [ ] **T20. [P] Tests unit de los tres casos de uso.**
  Cierre individual, cierre total, cierre de todas menos la actual, autorización y ámbito.
  **Hecho:** cada caso de uso tiene su test de permiso denegado **antes** de tocar el puerto (el
  doble del repositorio afirma cero invocaciones).
  _Deps: T11, T12, T13_

- [ ] **T21. [P] Tests de integración contra la base.**
  Unicidad de `session_id`; el segundo cierre del mismo `sid` no falla ni duplica; la purga borra
  solo las caducadas **de esa persona**; el sello escrito queda truncado al segundo; `stampAll`
  sobre otra empresa o sobre una fila borrada devuelve `'not_found'`.
  **Hecho:** corren contra la base de la feature y son idempotentes entre corridas.
  _Deps: T8, T14, T15_

- [ ] **T22. [P] Test de alcance de la ficha.**
  Afirma que `package.json` no ganó dependencias; que el puerto no expone ningún listado de
  sesiones; y que la feature no añadió ninguna página, ruta ni Server Action.
  **Hecho:** `guard-dependencias-aprobadas` verde; el test es rojo si alguien añade un
  `listSessions` al puerto o un `page.tsx` a la feature.
  _Deps: T7, T17_

- [ ] **T23. Anotar la deuda de E2E.**
  El diferimiento a QC-53 queda escrito en `progress/impl_QC-23-registro-de-sesiones.md` y en
  `progress/current.md > Deudas y cosas abiertas`, con su motivo y su destinatario.
  **Hecho:** las dos anotaciones existen y nombran QC-53.
  _Deps: —_

- [ ] **T24. Cierre: gate completo y mapa de trazabilidad.**
  `./init.sh` en verde y `progress/impl_QC-23-registro-de-sesiones.md` con el mapa `R<n> → test`
  **completo**, sin ningún requisito huérfano.
  **Hecho:** los 51 requisitos aparecen en el mapa con un test concreto; el reviewer puede
  comprobarlo sin abrir el código.
  _Deps: todas_

## Mapa `R<n> → task`

| Requisito | Tasks |
| --- | --- |
| R1 | T4, T18 |
| R2 | T5, T18 |
| R3 | T4, T18 |
| R4 | T4, T18 |
| R5 | T4 |
| R6 | T4, T18 |
| R7 | T1, T2 |
| R8 | T6, T10, T19 |
| R9 | T6, T13, T21 |
| R10 | T1, T2, T8 |
| R11 | T10, T19 |
| R12 | T8, T21 |
| R13 | T10, T19 |
| R14 | T9, T19 |
| R15 | T10, T19 |
| R16 | T10, T19 |
| R17 | T10, T11, T19 |
| R18 | T10, T19 |
| R19 | T7, T22 |
| R20 | T11, T20 |
| R21 | T11 |
| R22 | T11, T20 |
| R23 | T11, T20 |
| R24 | T11, T20 |
| R25 | T12, T20 |
| R26 | T12, T20 |
| R27 | T12, T20 |
| R28 | T8, T12, T20, T21 |
| R29 | T12, T20 |
| R30 | T13, T15, T16 |
| R31 | T13, T20 |
| R32 | T13, T15, T16 |
| R33 | T6, T14, T21 |
| R34 | T6, T14, T21 |
| R35 | T6, T14, T21 |
| R36 | T6, T14, T21 |
| R37 | T14, T21 |
| R38 | T14, T15, T21 |
| R39 | T8, T21 |
| R40 | T8, T10, T21 |
| R41 | T1, T2, T3 |
| R42 | T2, T3 |
| R43 | T2, T3 |
| R44 | T1 |
| R45 | T1, T8 |
| R46 | T6, T7, T8, T17 |
| R47 | T22 |
| R48 | T11, T12 |
| R49 | T4, T13 |
| R50 | T23 |
| R51 | T12, T22 |
