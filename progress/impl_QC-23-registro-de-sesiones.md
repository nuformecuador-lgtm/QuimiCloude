# QC-23 — registro-de-sesiones · bitacora de implementacion

> Worktree: `.worktrees/QC-23-registro-de-sesiones` · Rama
> `feature/QC-23-registro-de-sesiones` desde `origin/dev` (`3516be9`).
> El **que** en `requirements.md` (R1-R51), el **como** en `design.md`, el orden en `tasks.md`.
> Base propia de la feature: `QuimiCloude_QC23`.

## El mecanismo, en una linea

Sello por usuario (`users.sessions_valid_from`) + `sid` dentro del token, que sube a `v4`, mas la
tabla `revoked_sessions`. **Una sola busqueda por indice unico** anadida por peticion, y **cero
escrituras** en el camino de lectura.

## Las 24 tasks, todas cerradas

| Tanda | Tasks | Que dejo |
| --- | --- | --- |
| 1 | T1, T2, T3 | Esquema Prisma y migracion `20260912103000_session_revocation` (UP + `down.sql`), con su test de archivo |
| 2 | T4, T5, T6, T18 | Token `v4` con `sid`, puerto `SessionIdFactory` y el dominio puro de la revocacion |
| 3 | T7, T8, T9, T10, T19 | Los tres puertos, el adaptador del registro, el `sid` en el lector y los cortes 7 y 8 |
| 4 | T11, T12, T13, T20 | Los tres casos de uso y su autorizacion |
| 5 | T14, T15, T16 | El sello dentro de las transacciones que ya existian, y la guardia que lo hace cumplir |
| 6 | T17, T21, T22, T23 | Cableado, integracion contra la base, alcance de la ficha y la deuda de E2E |

T24 —el gate completo— lo corre el leader.

## Archivos

### Creados — produccion

- `db/migrations/20260912103000_session_revocation/migration.sql` y `down.sql`
- `lib/modules/identity/domain/session-revocation.ts` — `floorToSecond`, `isStampedOut`,
  `firstIssuedAtAfterStamp`, `changeRevokesSessions`
- `lib/modules/identity/domain/end-session.ts`, `end-all-sessions.ts`, `end-other-sessions.ts`
- `lib/modules/identity/ports/session-revocation-repository.ts`, `session-eraser.ts`,
  `session-check-log.ts`, `session-id-factory.ts`
- `lib/modules/identity/adapters/driven/persistence/session-revocation-prisma.ts`
- `lib/modules/identity/adapters/driven/session/session-id-crypto.ts`
- `lib/modules/identity/adapters/driven/observability/session-check-log-console.ts`

### Modificados — produccion

- `db/schema.prisma` — `users.sessionsValidFrom`, modelo `RevokedSession`, relacion inversa
- `lib/modules/identity/adapters/driven/session/session-token.ts` — `v4` y `sid`
- `lib/modules/identity/domain/session-claims.ts`, `session.ts` — `sessionId`
- `lib/modules/identity/domain/resolve-session.ts` — cortes 7 y 8, `try` acotado, fallo cerrado
- `lib/modules/identity/domain/verify-credentials.ts` — el login pide el `sid` al puerto
- `lib/modules/identity/domain/actor.ts` — `requireActor` (pieza que el design nombraba y faltaba)
- `lib/modules/identity/ports/session-user-reader.ts` — `findActiveById(id, sessionId)` y los dos campos crudos
- `lib/modules/identity/ports/session-reader.ts` — se anota que el comentario de QC-8 deja de ser cierto
- `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts` — el `sid` en el mismo `findFirst`
- `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` — el sello dentro de las dos transacciones
- `lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma.ts` — el sello en el mismo `SET`
- `lib/modules/identity/index.ts`, `lib/composition/index.ts` — contrato y cableado

### Tests creados

`tests/unit/identity/`: `session-revocation.test.ts`, `session-id-factory.test.ts`,
`session-check-log.test.ts`, `end-session.test.ts`, `end-all-sessions.test.ts`,
`end-other-sessions.test.ts`, `qc23-alcance.test.ts`, `schema/session-revocation-migration.test.ts`.
`tests/guards/guard-sesiones-cortadas.test.ts`.
`tests/integration/identity/`: `session-revocation.int.test.ts`, `session-stamp-writes.int.test.ts`.

### Archivos ajenos que hubo que retensar (ninguno aflojado)

Siete listas cerradas de otras fichas se ponian rojas con el esquema nuevo. **Todas siguen siendo
igualdades exactas** y todas se verificaron mutandolas en disco para comprobar que siguen cayendo:

- `tests/unit/identity/schema/identity-schema.test.ts` — el censo de columnas de `User`
- `tests/unit/identity/schema/account-status-schema.test.ts` — las relaciones de `User`
- `tests/unit/identity/credential-policy-contract.test.ts` — el censo de campos de `User`
- `tests/unit/identity/account-status-scope.test.ts` — la lista cerrada de estados de QC-65
- `tests/unit/proveedores/module-contract.test.ts` — las relaciones de `User`, retensado ademas
  con el censo de modelos del modulo `proveedores` leido del `/// @module`
- `tests/unit/recetas-ui/recipe-route-contract.test.ts` — las rutas de `db/` permitidas, retensado
  ademas exigiendo que toda ruta permitida siga existiendo en disco
- `tests/guards/guard-identificador-de-request.test.ts` — su lista de migraciones esperadas, que
  su propio mensaje de fallo pide actualizar a la ficha que anade una

## Mapa `R<n> -> test`

Los 51, cada uno con un test concreto que muerde.

| R | Test |
| --- | --- |
| R1 | `session-token.test.ts > el payload v4 lleva sub/iat/exp/role/cid/sid` |
| R2 | `session-id-factory.test.ts > dos invocaciones seguidas devuelven identificadores distintos` + `mil invocaciones seguidas no repiten ni una` |
| R3 | `session-token.test.ts > el v3 se rechaza igual con un secreto que no es el suyo` |
| R4 | `session-token.test.ts > y lo rechaza SIN verificar la firma: no se llama a crypto.subtle.sign` |
| R5 | `session-token.test.ts > es igual a createHmac para secreto y mensaje` + guardia `guard-firma-sesion-unica` |
| R6 | `session-claims.test.ts > sid ausente / vacio / no-texto / sin forma de UUID devuelven null` |
| R7 | `schema/session-revocation-migration.test.ts > el sello nace NOT NULL con su default y sin indice` |
| R8 | `resolve-session.test.ts > con un iat anterior al sello del usuario resuelve null` + `con un iat igual al sello —el mismo segundo— resuelve null` |
| R9 | `session-revocation.test.ts > una sesion emitida EN EL MISMO SEGUNDO que el sello es invalida` + `end-other-sessions.test.ts > una sesion AJENA emitida en el MISMO SEGUNDO del sello queda invalida (R9)` |
| R10 | `schema/session-revocation-migration.test.ts > las cinco columnas de negocio son obligatorias y los dos identificadores son UUID` |
| R11 | `resolve-session.test.ts > con sessionRevokedAt no nulo resuelve null` |
| R12 | `session-revocation.int.test.ts > el segundo cierre del MISMO sid no lanza y no duplica la fila` |
| R13 | `resolve-session.test.ts > consulta al lector con el sub y el sid de la sesion en curso` + guardia `guard-middleware-edge` |
| R14 | `resolve-session.test.ts > los dos cortes nuevos consultan al lector exactamente una vez` |
| R15 | `resolve-session.test.ts > con la empresa muerta el estado de cuenta ni se lee: el corte 6 va detras del 5` — los seis cortes previos conservan sus tests sin modificar y los dos nuevos van detras |
| R16 | `resolve-session.test.ts > si el puerto lanza resuelve null y no propaga la excepcion` |
| R17 | `session-check-log.test.ts > escribe la causa junto al identificador de peticion` + `resolve-session.test.ts > el diagnostico no lleva el sid ni el sub` |
| R18 | `resolve-session.test.ts > con el sello y el registro invalidando a la vez resuelve null` + `evaluar sello-antes-registro y registro-antes-sello da el mismo resultado` + `cada uno de los dos por separado tambien corta` |
| R19 | `qc23-alcance.test.ts > el puerto no expone ningun metodo de listado de sesiones` |
| R20 | `end-session.test.ts > las demas sesiones vivas de esa misma persona siguen resolviendo (R20)` + `session-revocation.int.test.ts > cerrar DOS sesiones distintas de la misma persona deja las dos filas (R20)` |
| R21 | `end-session.test.ts > no recibe ningun parametro` + `logout-action.test.ts` verde **sin tocarlo** |
| R22 | `end-session.test.ts > registra el cierre de ESE sid con la caducidad natural del token, y despues borra la cookie` |
| R23 | `end-session.test.ts > borra la cookie igual y deja la causa en el registro del servidor` + `borra la cookie igual si ni siquiera se pudieron leer los claims` |
| R24 | `end-session.test.ts > NO sube el sello de esa persona (R24)` |
| R25 | `end-all-sessions.test.ts > sube el sello de la persona objetivo, en la empresa del ACTOR y truncado al segundo` + `apuntarse a uno mismo con el conjunto VACIO si esta permitido: no es self_operation` |
| R26 | `end-all-sessions.test.ts > el caso de uso no emite ninguna cookie ni crea ninguna Server Action` — la operacion no admite `sid`, asi que elegir dispositivo no es expresable |
| R27 | `end-all-sessions.test.ts > rechaza <caso> sin tocar el puerto` — actor ausente, sin conjunto, conjunto vacio, conjunto que no es array y sin el codigo exacto |
| R28 | `end-all-sessions.test.ts > un objetivo de otra empresa responde user_not_found, y NO unauthorized (R28)` + `session-revocation.int.test.ts > los TRES casos son indistinguibles desde fuera del adaptador` |
| R29 | `end-all-sessions.test.ts > el caso de uso no lee cookies ni cabeceras: el actor entra por parametro` |
| R30 | `session-stamp-writes.int.test.ts > tras consumir el enlace, el sello quedo en el instante del consumo` + `guard-sesiones-cortadas.test.ts` |
| R31 | `end-other-sessions.test.ts > la cookie VIEJA del mismo dispositivo queda invalida y la NUEVA vale` |
| R32 | `guard-sesiones-cortadas.test.ts > un UPDATE del hash sin el sello es un hallazgo` — cubre las dos formas, `data` de Prisma y SQL crudo |
| R33 | `session-stamp-writes.int.test.ts > mover a blocked / a inactive SUBE el sello` + `session-revocation.test.ts > pasar a blocked o a inactive corta las sesiones (R33)` |
| R34 | `session-stamp-writes.int.test.ts > borrar a una persona sube el sello (R34), en el mismo UPDATE que deleted_at` |
| R35 | `session-stamp-writes.int.test.ts > R35: cambiar el rol DE VERDAD sube el sello` + `R35: reescribir el MISMO rol no corta nada` |
| R36 | `session-revocation.test.ts > pasar a pending o a active NO corta las sesiones (R36)` + `session-stamp-writes.int.test.ts > mover a pending NO toca el sello` |
| R37 | `session-stamp-writes.int.test.ts > R37: reactivar una cuenta bloqueada NO revive sus sesiones` |
| R38 | `session-stamp-writes.int.test.ts > R38: si la transaccion aborta por last_administrator, el sello NO cambio` + `R38: si el consumo REVIERTE, ni la contrasena ni el sello quedaron escritos` |
| R39 | `session-revocation.int.test.ts > revokeSession borra las caducadas de esa persona, y solo esas` + `stampAll purga igual, y el corte es el propio sello` |
| R40 | `resolve-session.test.ts > mira el sello y el registro de cerradas, pero no escribe ni purga nada` + `sus dependencias son lectores y registro, y ningun puerto de escritura` |
| R41 | `schema/session-revocation-migration.test.ts > nombra en ingles y en snake_case todo lo que crea (R41)` |
| R42 | `schema/session-revocation-migration.test.ts > queda con ENABLE y con FORCE (R42)` y cero `CREATE POLICY` + guardia `guard-rls-force` |
| R43 | `schema/session-revocation-migration.test.ts > borra la tabla y la columna del sello, y nada mas: dos sentencias` |
| R44 | `schema/session-revocation-migration.test.ts > la tabla no lleva ninguna columna de empresa` |
| R45 | `schema/session-revocation-migration.test.ts > lleva created_at y NO lleva updated_at ni deleted_at` |
| R46 | `session-revocation.test.ts > no lee el reloj ni importa framework, Prisma o lo compartido` + guardia `guard-arquitectura-modulos` |
| R47 | `qc23-alcance.test.ts > package.json no gano ninguna dependencia` + guardia `guard-dependencias-aprobadas` |
| R48 | `end-all-sessions.test.ts > el error de denegacion es del catalogo cerrado de QC-70 y no trae texto propio (R48)` + guardia `guard-catalogo-de-errores` |
| R49 | `end-other-sessions.test.ts > la sesion nueva nace en el PRIMER instante posterior al sello y dura 8 h absolutas (R49)` + `ninguna peticion ordinaria reemite ni prolonga nada (R49)` |
| R50 | Deuda anotada aqui y en `progress/current.md > Deudas y cosas abiertas`, con destinatario **QC-53** y su motivo |
| R51 | `qc23-alcance.test.ts > la feature no anadio ninguna pagina, ruta, componente ni Server Action` |

## Verificacion ejecutable

`./init.sh --rapido`, 2026-09-12, **verde**:

```
✓ typecheck paso
✓ lint paso
[test:rapido] -> vitest related --run (37 archivos de origen relacionados)
 Test Files  230 passed (230)
      Tests  3526 passed | 8 skipped (3534)
[test:rapido] todas las guardias
 Test Files  32 passed (32)
      Tests  352 passed | 4 skipped (356)
✓ test:rapido paso
✓ todas las migraciones tienen down.sql
== init OK ==
```

Integracion contra `QuimiCloude_QC23`, corrida dos veces seguidas para probar la idempotencia:
`session-revocation.int.test.ts` 12/12 las dos veces, `session-stamp-writes.int.test.ts` 13/13, y
`tests/integration/identity` entero 237/237.

La migracion se verifico de verdad, no por lectura: `db:migrate` aplica, `db:rollback` revierte
dejando `_prisma_migrations` coherente y los 9 indices de `users` intactos —`users_email_unique`
incluido—, y un segundo `db:migrate` vuelve a aplicar sin error.

**Probadas por mutacion**, no solo «pasan»: el test de la migracion (6 mutaciones, todas rojas), la
guardia `guard-sesiones-cortadas` (quitando el sello del UPDATE de QC-79 se pone roja con el
hallazgo correcto), el test de alcance (anadiendo un `listSessions` al puerto y una `page.tsx` que
invoca la operacion: rojo las dos veces) y las siete listas cerradas retensadas.

## Donde el spec no se sostuvo

Cinco puntos. **Ninguno se cambio en silencio.**

1. **`SessionCheckLog.log(diagnostic, requestId)` choca con QC-71 R9**, que es decision cerrada con
   guardia propia: ningun `domain/` ni `ports/` de un modulo de negocio puede mencionar el
   identificador de peticion. La version literal del design puso esa guardia en rojo. Resolucion:
   el puerto es `log(diagnostic)` —el dominio aporta solo la causa— y el **adaptador** recibe la
   lectura de la cabecera desde `lib/composition`, que es el reparto exacto que QC-71 fijo para el
   traductor unico de errores. **R17 se cumple entero, del otro lado del puerto.**
2. **`design.md § 5.4` describe la guardia como «un `data` de Prisma con `passwordHash:`», y eso es
   inexacto**: el unico UPDATE del hash que existe hoy —el de QC-79— es **SQL crudo**, y los otros
   dos sitios que escriben un hash son creaciones de usuario. Una guardia que solo mirara objetos
   `data` no habria visto justo el caso que vino a vigilar. Implementada cubriendo **las dos
   formas**, con la creacion exenta y el motivo escrito en el codigo.
3. **`requireActor` no existia.** `design.md § 5.2` lo invoca como si estuviera; se creo en
   `domain/actor.ts` junto a `requirePermission`, con firma de asercion y el `UnauthorizedError`
   del modulo.
4. **`updateAliveInCompany` necesita una lectura que el design no menciona**: para saber si el rol
   cambio *de verdad* (R35) hace falta el `role_id` actual, y el adaptador escribia a ciegas con
   `updateMany`. Se anadio un `findFirst` **dentro de la misma transaccion**, tras el bloqueo.
   Hueco declarado en el codigo: si la empresa no tiene ningun administrador `active`, ese bloqueo
   no serializa nada y dos ediciones simultaneas del mismo usuario podrian leer el mismo rol previo;
   el peor efecto es *no* subir el sello en una de las dos. **No afecta a la ruta por peticion.**
5. **El bloque de `lib/composition/index.ts` no puede ir «al final»** como pide `design.md § 8`:
   `sessionProvider` y `export const identity` se evaluan en su propia linea, asi que una constante
   declarada despues queda en zona muerta y el modulo revienta al cargarse. Va **insertado entre
   dos bloques existentes**, sin reordenar ni reformatear nada, siguiendo el precedente que QC-66
   dejo escrito unas lineas mas abajo en ese mismo archivo.

Dos observaciones menores, escritas en el codigo y no en silencio: `CurrentSession.sessionId` es un
campo que el design declara y que el cuerpo no lee —el `sid` nuevo lo produce el puerto y al viejo
lo mata el sello—, y `stampAll` devolviendo `'not_found'` dentro de `endOtherSessions` no lo cubre
el design: se resolvio fallando cerrado, con `UserNotFoundError` y **sin reemitir** ninguna cookie.

## Lo que esta ficha deja a las que vienen

- **QC-53** — la E2E, con motivo: aqui no hay pantalla, ruta ni boton que visitar. **Deuda con
  destinatario, no exencion** de `CHECKPOINTS.md > Calidad de codigo`. Tambien el boton del
  usuario, que invocara `endAllSessions(actor, actor.id)`.
- **QC-101** — el boton del administrador. La operacion queda implementada y probada, y **sin
  ninguna via de invocacion desde la interfaz**. Exigira `usuarios.modificar`, no un permiso nuevo.
- **QC-89 y QC-96** — el gancho del cambio de contrasena no es una funcion que haya que acordarse
  de llamar: **es una regla sobre la escritura**, y `guard-sesiones-cortadas` la hace cumplir. Quien
  escriba `password_hash` en un UPDATE sin subir el sello se encuentra la guardia roja, con el
  mensaje nombrando QC-23 y la decision cerrada 2.
  **Aviso de contrato**: QC-96 asumia una firma `revokeAllSessionsOf(userId, now)`. Lo que esta
  ficha entrega es **`endAllSessions(actor, targetUserId)`** —el actor entra por parametro (R29) y
  la autorizacion va en la primera linea (R27)—, mas la regla sobre la escritura. Hay que enmendar
  el spec de QC-96.
- **QC-28** — el camino queda abierto: lo cacheable es el par `(sessionsValidFrom, sessionRevokedAt)`,
  con clave `userId` mas `sid`, y el dominio lo consume por el puerto, asi que se implementa como un
  **decorador del puerto** sin tocar `resolve-session.ts`. La condicion la fija R19: puede fallar
  abierta **hacia la base**, nunca hacia «valida».
