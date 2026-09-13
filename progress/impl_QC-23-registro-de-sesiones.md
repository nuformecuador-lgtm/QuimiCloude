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
| R7 | `schema/session-revocation-migration.test.ts > anade `users.sessions_valid_from` NOT NULL con DEFAULT, y eso ES el backfill (R7)` + `el sello vive en User, es obligatorio y no tiene indice (R7, design.md > 2.1)` |
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
| R26 | `end-all-sessions.test.ts > sube el sello de la persona objetivo, en la empresa del ACTOR y truncado al segundo` — el caso afirma `revokeSession` NO invocado: el cierre es siempre total y no hay ningun `sid` que elegir, ni aqui ni en la firma |
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
| R39 | `session-revocation.int.test.ts > `revokeSession` borra las caducadas de esa persona, y solo esas` + `stampAll purga igual, y el corte es el propio sello` + `schema/session-revocation-migration.test.ts > el compuesto (user_id, expires_at) ES R39` |
| R40 | `resolve-session.test.ts > mira el sello y el registro de cerradas, pero no escribe ni purga nada` + `sus dependencias son lectores y registro, y ningun puerto de escritura` |
| R41 | `schema/session-revocation-migration.test.ts > nombra en ingles y en snake_case todo lo que crea (R41)` |
| R42 | `schema/session-revocation-migration.test.ts > queda con ENABLE y con FORCE (R42)` y cero `CREATE POLICY` + guardia `guard-rls-force` |
| R43 | `schema/session-revocation-migration.test.ts > borra la tabla y la columna del sello, y nada mas: dos sentencias` |
| R44 | `schema/session-revocation-migration.test.ts > declara exactamente las seis columnas del diseno, sin empresa y sin updated_at (R44, R45)` |
| R45 | `schema/session-revocation-migration.test.ts > el modelo no declara empresa, ni updated_at, ni deleted_at (R44, R45)` |
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

## Segunda vuelta: lo que corrigio la revision (2026-09-12)

El reviewer **RECHAZO** la primera entrega con **un mayor y siete menores**
(`progress/review_QC-23-registro-de-sesiones.md`). Todo lo de abajo es la respuesta, y **no hay
ninguno sin atender**.

### El mayor — la guardia se esquivaba cambiando de carpeta

`guard-sesiones-cortadas` vigilaba **solo** `adapters/driven/persistence/`. El reviewer lo probo
creando `adapters/driven/credenciales/reset-prisma.ts` con un `prisma.user.update` que escribia el
hash sin sello: **las dos guardias pasaron en verde**.

Lo grave no era el `R<n>` —ninguno se rompia— sino **la promesa**: esta bitacora le decia a QC-89 y
QC-96 que quien olvide el sello se encuentra la guardia roja, y **sobre esa lectura ya se enmendo
el spec de QC-96**. La cabecera de la guardia, ademas, **afirmaba como hecho** que ese directorio
era el unico sitio del repositorio donde se escribe en `users`, **sin comprobarlo**: una afirmacion
no verificada dentro de la pieza cuyo trabajo es verificar.

El ambito se amplio y **se probo por mutacion en el ambito nuevo**, no solo se amplio. El detalle
—hasta donde y por que— esta unas lineas mas abajo, en la nota de la guardia.

### Los siete menores

| # | Que decia | Que se hizo |
| --- | --- | --- |
| 1 | `tasks.md` T24 sin marcar | Marcada, **con el resultado real del gate completo** pegado en la propia task |
| 2 | El mapa citaba R26 con un test de R51 | Corregido: R26 apunta al caso que afirma `revokeSession` NO invocado |
| 3 | Cuatro titulos del mapa parafraseados | Puestos **literales de disco** (R7, R39, R44, R45) |
| 4 | `design.md § 4` decia «hoy 1 sentencia SQL»; medido son **4**, y 5 con QC-23 | Corregido con el numero medido y una nota que explica por que importa: **es el numero que QC-28 leera** |
| 5 | `endOtherSessions` sellaba con `actor.companyId` y reemitia con `current.companyId` | Unificado en una sola fuente |
| 6 | Frase empalmada en `ports/session-check-log.ts` | Redaccion arreglada; el fondo no se toco |
| 7 | Consecuencia del `<=` no declarada | Escrita en `design.md § 12` como punto 4 |

**El menor 4 merece una linea aparte**, porque es el unico donde la primera entrega afirmo un
numero sin medirlo: el **delta** que sostiene todo el argumento de § 4 era exacto (+1), pero el
**absoluto estaba mal por un factor de cuatro**. Ninguna decision cambia; lo que cambia es que
QC-28 ya no partira de una linea de base cuatro veces menor que la real al dimensionar su cache.

### La guardia: a que ambito se amplio, y por que a ese

**De `adapters/driven/persistence/` a `lib/` y `scripts/` enteros**, filtrando por extension y
saltando `node_modules`, `.next`, `.git`, `dist`, `build` y `coverage`.

**No** a `adapters/driven/`, que era la opcion obvia y la mas barata. El motivo es el que convirtio
esto en un mayor: **una guardia no puede apoyarse en la convencion que vigila otra guardia.** Que
solo `adapters/driven/**` alcance el cliente de Prisma lo garantiza `guard-arquitectura-modulos`, y
atar la nuestra a esa frontera deja la promesa dependiendo de que alguien amplie una constante el
dia que la frontera se mueva — exactamente el trabajo manual que la guardia existe para quitar.
Barriendo `lib/` y `scripts/`, la afirmacion «toda escritura del hash sube el sello» **se comprueba
sola**. `scripts/` entra porque tiene su propio cliente de Prisma (`scripts/seed.ts`). `app/` y
`components/` quedan fuera **con el motivo escrito**: que ahi no se pueda tocar Prisma si es una
regla vigilada, no una suposicion sobre donde vive un archivo.

La cabecera vieja **afirmaba como hecho** que `persistence/` era el unico sitio del repositorio
donde se escribe en `users`, sin comprobarlo. Esa frase se fue: era la afirmacion no verificada
dentro de la pieza cuyo unico trabajo es verificar.

**Escrituras legitimas del hash fuera de `persistence/`: ninguna.** Cero hallazgos y cero falsos
positivos. Los `passwordHash` de `domain/` y `ports/` son tipos y mapeos de **lectura**, y
`lib/composition/index.ts` solo tiene `passwordHasher`, que es otro simbolo. **No se exceptuo nada
por nombre.**

**Probada por mutacion en el ambito nuevo**, y no solo ampliada — reproducido ademas por el
implementer, no solo por el subagente: con el archivo del reviewer
(`adapters/driven/credenciales/reset-prisma.ts`, `prisma.user.update` con `passwordHash` y sin
sello) la guardia da **rojo** con el hallazgo exacto —`form: 'data'`, `operation: 'update'`, la
ruta entera—; borrado el archivo, **32/32 guardias y 355 verdes en 5,2 s**. Antes de este arreglo
ese mismo archivo pasaba en verde.

**Coste:** **~+65 ms**, medido por el reviewer y **corregido en contra de la primera cifra de esta
bitacora**. El «402 ms -> 453 ms» que se escribio aqui era **ruido de arranque de vitest**: el
`Duration` total de las dos versiones se solapa (422-664 ms la nueva, 502-611 ms la vieja), asi que
no medía nada. El numero que si aisla la ejecucion es el componente `tests`: **16-17 ms antes,
73-92 ms ahora**, por leer ~280 archivos en vez de 8. La tanda entera de guardias: 4,1 s. Se deja
escrito el metodo y no solo el numero, porque el error no fue de calculo sino de **medir lo que no
era**.

**Lo que esto le devuelve a QC-89 y QC-96:** la frase de mas arriba —«quien escriba `password_hash`
en un UPDATE sin subir el sello se encuentra la guardia roja»— **vuelve a ser cierta**, y ahora en
todo `lib/` y `scripts/`, no en un directorio por convencion. **QC-96 puede seguir apoyandose en la
regla de escritura sin invocar ningun revocador**: su camino escribe el hash, y cualquier UPDATE
del hash que no suba el sello es rojo antes del merge.

### El menor 8: declarado y NO cerrado (decision del humano)

La segunda ronda **aprobo** la ficha y encontro un octavo menor: la guardia **tambien se esquiva por
DETECCION**, no solo por ambito. Si el objeto que lleva el hash cuelga de un `return` en vez de ir
en linea tras `data:`, no lo ve — verificado dentro del directorio mas vigilado del repo, 17/17
verdes:

```ts
function construir(hash: string) { return { passwordHash: hash, updatedAt: new Date() }; }
await tx.user.update({ where: { id }, data: construir(hash) });
```

**El humano decidio no cerrarlo, sino declararlo**, y la decision es la correcta: el salto es
deliberado. `user-credentials-prisma.ts:95` es literalmente `return { passwordHash:
fila.password_hash }`, un **mapeo de LECTURA** que no debe marcarse nunca; marcar todo `return {
passwordHash }` lo convertiria en un rojo permanente. Y el descuido **real** —`data: { passwordHash
}` a secas, o un `const data = {...}` extraido a variable, que cae por fallo cerrado— **si se
detecta**. Esquivarla exige una construccion de dos saltos que nadie escribe por descuido.

Lo que si cambia es que **esta escrito en la cabecera de la guardia**: que SI se detecta, que NO,
por que no se cerro y **la salida para quien quiera cerrarlo** —marcar `return { passwordHash ... }`
solo en archivos que ademas contengan un verbo de escritura de Prisma, con lo que el mapeo de
lectura queda fuera solo, sin excepciones por nombre—. Esa cabecera es **el documento donde QC-89 y
QC-96 leeran hasta donde estan cubiertas**, asi que no puede prometer mas de lo que cumple.

Queda ademas anotada la **tercera frontera** que el reviewer midio y no pidio: anadir `app/` y
`components/` a `WATCHED_ROOTS` son 206 archivos mas, **cero menciones** de `passwordHash` hoy —o
sea cero falsos positivos garantizados— y ~+45 ms, y con eso la guardia dejaria de depender de que
`guard-arquitectura-modulos` prohiba tocar Prisma desde ahi. **No se implemento**: es la mejora
obvia para quien la toque despues, por ejemplo QC-89.

## F2.3 — la sincronizacion con `dev`, y un ejemplar para QC-99

El merge con `origin/dev` (17 commits: QC-85, QC-49, QC-79, el bloque de Jira y tres commits de
specs) entro **limpio, sin un solo conflicto**. El unico archivo que se solapaba era
`tests/guards/guard-identificador-de-request.test.ts`: `dev` anadia a la lista de E2E y esta rama a
la de migraciones, **regiones distintas**, y se conservan los dos lados. No se dio por bueno de
palabra: `MIGRACIONES_ESPERADAS` tiene **28 entradas y en disco hay 28**, con diferencia vacia en
los dos sentidos — que es justo donde una union mal hecha deja un test verde con un numero falso.
`dev` no traia migraciones nuevas (`db:migrate`: *No pending migrations to apply*).

### El rojo que destapo el gate completo, y de quien es

`tests/unit/configuracion-ui/grupos/alcance.test.ts` —el **centinela de alcance de QC-85**, ficha
ajena ya mergeada— se puso **rojo en dos casos**, y **no por nada que haga QC-23**: los dos miden el
**diff de la rama** y **no llaman a `saltarSiNoEsLaRamaDeQC85`**, que existe en ese mismo archivo y
que sus hermanos si usan. Fuera de la rama de QC-85 el diff no trae su senal, y los dos caen.

**El dato exacto, comprobado sobre `dev` limpio: el archivo PASA en `dev`** —18 verdes, 15 saltados,
exit 0, porque ahi el diff es vacio y el ayudante ya salta por eso— **y se pone rojo en toda rama de
feature que no sea la de QC-85**. La diferencia no es cosmetica: significa que **el gate de `dev`
nunca lo va a delatar**, y por eso lleva ahi sin que nadie lo note; quien lo paga es la siguiente
ficha que sincronice.

El caso que cae lo confirma solo, por su propio nombre: «esta ejecucion SI es la rama de QC-85:
ningun caso de abajo se ha saltado en silencio». Es un meta-test que **afirma estar en la rama de
QC-85** y que fuera de ella falla por construccion.

**Arreglado desde aqui, y sin inventar ningun mecanismo**: se aplica el precedente de **`3e7fc6c`**,
un commit **de la propia rama de QC-85** que arreglo **este mismo defecto** en los centinelas de
QC-39 y QC-45. Los dos casos pasan por la precondicion de rama que ese archivo ya se dio a si mismo,
asi que fuera de la rama de QC-85 quedan **`skipped`, nunca verdes** — la leccion literal de aquel
commit: el agujero no era solo el rojo falso, era el **verde falso**. No se toco nada mas del
archivo.

**Por que NO se llevo al baseline**, que era la otra salida que ofrece el mensaje del gate: el
baseline es **por archivo**, asi que silenciaria los ~40 casos restantes de ese centinela **para
todo el mundo**; y QC-85 ya esta en `dev`, de modo que su rama no volvera a existir para
reactivarlo. Apagar proteccion ajena para que nuestro gate salga verde es el lado comodo, no el
correcto.

### Material para QC-99, sin ficha nueva

Esto es **otro ejemplar de la especie de QC-99** (`guardias-censo-rompen-features-posteriores`), y
de los mas dificiles de cazar: una guardia que **se mide contra el diff de la rama**, que **pasa en
`dev`** —con lo que el gate de `dev` nunca la delata— y que **rompe a toda feature posterior**. Con
el agravante de que **su propia ficha ya habia arreglado el mismo defecto en dos guardias ajenas y
se olvido de la suya**. Queda anotado aqui como material; **no se abre ficha porque QC-99 ya
existe**.

**Probado por mutacion, las dos mitades** —porque «el archivo pasa» no demuestra nada aqui—:
*fuera* de la rama de QC-85 los dos casos quedan **`skipped` con el motivo escrito, nunca verdes**
(17 pasan, 15 saltados); *dentro* de una rama de QC-85 simulada —anadiendo al diff su archivo
central y su carpeta de spec— los dos **se ejecutan de verdad** y el segundo incluso sale rojo,
que es justo la prueba de que sigue mordiendo. El arbol se restauro despues y se comprobo.

**Un matiz que se deja dicho en vez de callarlo**: con la precondicion delante, el `expect` del
caso ancla ya no puede fallar cuando corre —la precondicion acaba de comprobar lo mismo—, asi que
como detector de «ningun caso de abajo se salto en silencio» queda **tautologico**. Conserva valor
—salta ruidosamente sin base y con diff vacio, y documenta el ancla— y es exactamente lo que hacen
sus hermanos tras `3e7fc6c`, pero es el precio de la condicion «skipped, nunca verde». **Es de
QC-85 decidir si lo convierte en otra cosa**; desde aqui no se toca mas.

### El gate completo tras el merge, y un flake que NO se llevo al baseline

Tercera corrida: **`== init OK ==`, exit 0 — 413 archivos, 5965 verdes, 66 saltados y CERO rojos**,
ni siquiera los 8 del baseline, que hoy pasan («8 por limpiar», aviso ajeno a esta ficha).

La segunda corrida dio **un rojo distinto**, y se investigo en vez de baselinearlo:
`credential-setup.int.test.ts > R11 — dos emisiones CONCURRENTES ... dejan UN SOLO enlace vivo`, con
`P2028: Transaction already closed ... timeout 5000 ms, however 10015 ms passed`. Es la carrera de
concurrencia de **QC-79**, y el camino que falla es el de **emision**, que esta ficha **no toca**
—lo que T15 toco es el de consumo—. Aislado pasa **15/15**, la integracion entera pasa **249/249**
(la misma cifra que midio el reviewer) y la tercera corrida del gate completo **no lo reproduce**:
es un **flake dependiente de la carga**, con su timeout de transaccion a 5 s. **No se anadio al
baseline**: meter un flake ajeno al baseline desde esta ficha seria apagar una prueba de
concurrencia que hoy funciona, y el baseline es global.

## F2.3 otra vez: QC-77 entra en `dev`, y destapa dos cosas peores

`dev` volvio a moverse (15 commits, QC-77 por el PR #65). Unico conflicto: el centinela de alcance de
QC-85, que **QC-77 tambien arreglo por su cuenta** (`b4a3983`, `5f687c2`). **Se resolvio a favor de
`dev`, no de lo nuestro**, y no por cortesia: su version distingue «no hay nada que medir» —el estado
normal desde que QC-85 se mergeo— de «la senal no esta», asi que sigue afirmando algo cuando corre,
mientras que la nuestra, al meter la precondicion delante, quedaba **tautologica**. El archivo queda
byte a byte como en `dev`.

### El verde falso del gate, que es lo grave

Tras ese merge, `./init.sh` canto **`== init OK ==` con la integracion ABORTADA en el arranque y cero
tests corridos**. No es una exageracion: el `global setup` de la integracion murio construyendo su
base de plantilla, vitest salio con codigo 1, y el gate lo dio por bueno porque **el veredicto sale
solo del JSON de rojos** — y un proyecto que no arranca no escribe rojos, luego era **invisible**.

Se detecto mirando a mano por que no aparecian las cifras por proyecto, no porque nada fallara: el
gate decia que todo estaba bien. **Un gate que da verde con una suite caida es peor que uno rojo.**

### La causa del arranque caido: la receta de QC-77 sembraba con el esquema a medias

`buildTemplateSchema` hacia `migrate deploy` —que **se detiene a proposito** en la migracion de QC-49,
que exige la empresa inicial—, y **sembraba ahi**, con las migraciones posteriores **sin aplicar**.
QC-23 anade `users.sessions_valid_from` despues de ese corte, y `@default(now())` **lo rellena Prisma
del lado del cliente**: el `INSERT` del seed incluia una columna que en ese instante no existia.

**No era un problema de QC-23**: QC-79 no lo destapo porque solo anadio una **tabla** que el seed no
toca. **Somos los primeros en anadir una COLUMNA despues del corte**, y toda ficha futura que anada
una con default de cliente lo habria pisado igual.

**Arreglado desde aqui, por decision del humano**: la receta pasa a sembrar **solo la empresa
inicial** en el punto donde QC-49 lo exige —con SQL crudo, que es lo unico que no depende del cliente
desincronizado—, aplicar el resto de migraciones, y correr el **seed completo al final**, con el
esquema ya entero. Probado por **mutacion**: con el arreglo la plantilla se construye y la integracion
da **249/249**; devolviendo el seed al punto intermedio **vuelve a romperse con el mismo error**. La
idempotencia del seed se **verifico**, no se supuso.

### Y el gate ya no puede volver a mentir asi

`init.sh` gana dos garantias, con el incidente escrito en el propio script:

1. **Los tres proyectos** —`ui`, `node`, `integration`— tienen que aparecer en el informe; si falta
   uno entero, es rojo **y el mensaje dice cual**. Es la comprobacion que nos habria salvado.
2. **Contradiccion = rojo**: si el proceso de tests sale distinto de cero y el informe no trae ningun
   archivo rojo que lo explique, algo fallo **fuera** de los tests y el gate falla en vez de dar verde.

El `|| true` de la linea 227 **no se quito a ciegas** —sin el, `set -e` corta antes de comparar contra
el baseline—: se captura el codigo de salida y se usa.

### Tercer y cuarto ejemplar para QC-99

Van **cuatro** en esta ficha, y los dos nuevos son de la misma familia que los dos primeros: piezas
que **pasan en `dev`** —donde nada las activa— y **rompen a la siguiente feature**. El censo de
aislamiento de QC-77 pide ademas que **cada** archivo de integracion nuevo se declare, asi que los dos
de esta ficha entran en `tests/integration/aislamiento.json`. **No se abre ficha: QC-99 ya existe.**

## F2.4 — cierre: commit, gate completo y PR

La tanda pendiente (el arreglo del arranque caido de integracion, las dos garantias del gate y las
dos entradas del censo de aislamiento) se committeo en **`5c104c1`**, sin ampliar el cambio.

**`./init.sh` COMPLETO, sin flags, desde el worktree** (base propia `QuimiCloude_QC23`, 28
migraciones aplicadas). Salida real:

```
✓ typecheck paso
✓ lint paso
✓ los tres proyectos corrieron (ui, node, integration)
✓ tests: sin rojos nuevos (0 rojos, todos en el baseline de 8); 8 por limpiar
✓ todas las migraciones tienen down.sql
== init OK ==
```

```
 Test Files  419 passed (419)
      Tests  6028 passed | 66 skipped (6094)
   Duration  273.91s
```

**Exit 0.** **419 archivos, 6028 verdes, 66 saltados, CERO rojos** —ni siquiera los 8 heredados del
baseline, que hoy pasan y el gate reporta como «8 por limpiar», aviso ajeno a esta ficha—. Entre
ellos `tests/unit/configuracion-ui/unidades-convenciones.test.ts`, el de `resend` de QC-79.

Las cifras suben respecto de la corrida anterior de esta bitacora (413 archivos / 5965 verdes)
porque aquella corrio ANTES de que `dev` trajera QC-77 entero: son archivos de `dev`, no de aqui.

**Las dos garantias nuevas del gate se vieron funcionar en verde**: la linea «los tres proyectos
corrieron (ui, node, integration)» es nueva y es exactamente la que el 2026-09-13 no existia, cuando
el gate canto OK con la integracion abortada. Las dos suites nuevas de la ficha corrieron:
`session-revocation.int.test.ts` (12) y `session-stamp-writes.int.test.ts` (13).

No se toco `feature_list.json` ni Jira: eso es F2.5, y lo hace el leader cuando el humano mergee.
