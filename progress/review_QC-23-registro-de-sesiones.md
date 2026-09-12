# QC-23 — registro-de-sesiones · review

> Revisado sobre el worktree `.worktrees/QC-23-registro-de-sesiones`, rama
> `feature/QC-23-registro-de-sesiones`, diff `origin/dev...HEAD` (`44c82ed`, `b450212`).
> Contra `specs/QC-23-registro-de-sesiones/`, `docs/architecture.md`, `docs/conventions.md`,
> `docs/verification.md`, `CHECKPOINTS.md` y `CLAUDE.md`. La bitacora del implementer se uso
> como MAPA, no como prueba.

## Veredicto

**RECHAZADO** — 1 hallazgo mayor, 7 menores.

El hallazgo mayor no rompe ningun `R<n>` de esta ficha: rompe la promesa que esta ficha le hace a
**QC-89 y QC-96**, y sobre la que ya se enmendo el spec de QC-96. El arreglo es una constante y un
caso de test; no hay que tocar produccion.

## Checklist

### Especificacion
- [x] `requirements.md` con 51 requisitos EARS numerados.
- [x] `design.md` con siete alternativas descartadas y su porque (seccion 9).
- [ ] `tasks.md` con **todas** las tasks `[x]` — **T24 sigue sin marcar** (menor 1).

### Trazabilidad
- [x] Los 51 `R<n>` mapean a un test que existe en disco y que muerde. Verificado uno a uno.
- [x] `progress/impl_QC-23-registro-de-sesiones.md` contiene el mapa `R<n> -> test`.
- Menores 2 y 3: cuatro entradas del mapa citan un titulo que no esta literal en disco, y una (R26)
  apunta a un test de R51. La cobertura real existe en los cuatro casos.

### Calidad de codigo
- [x] `./init.sh` **completo**, corrido por mi: `== init OK ==`, exit 0. 396 archivos, 5773 tests,
      **5729 verdes**, 42 skipped, **un solo archivo rojo y esta en el baseline**
      (`tests/unit/configuracion-ui/unidades-convenciones.test.ts`, 2 casos, por `resend` de QC-79;
      ajeno a QC-23, que no toca `package.json`).
- [x] `pnpm run typecheck` y `pnpm run lint` verdes dentro del gate.
- [x] Corri ademas por mi cuenta `tests/unit/identity` + `tests/guards` + `tests/unit/composition`
      + los dos contratos ajenos: 113 archivos, 1886 verdes, 0 rojos.
- [x] `tests/integration/identity` contra `QuimiCloude_QC23`: 14 archivos, **249 verdes**.
- [x] E2E: no aplica, y esta **declarada como requisito** (R50) con destinatario QC-53, motivo
      escrito, y anotada en `progress/current.md > Deudas y cosas abiertas`. Deuda, no exencion.
- [x] Multiplataforma: no aplica y `design.md` seccion 11 lo declara. El diff no toca `app/` ni
      `components/`, y `qc23-alcance.test.ts` lo prueba contra el diff real, no de palabra.
- [x] Dependencias: **cero anadidas**, verificado contra la base de fusion y no de palabra.

### Datos y seguridad
- [x] `revoked_sessions` sin columna de empresa: **correcto y no bloqueante**. R44 lo declara con su
      porque, el precedente aprobado es `credential_setup_tokens`, y el aislamiento existe:
      `stampAll` filtra `id + company_id + deleted_at IS NULL` y el rechazo cruzado tiene test
      unitario (un objetivo de otra empresa responde user_not_found, y NO unauthorized) **e**
      integracion (sobre una persona de OTRA empresa: not_found, y no escribe ni el sello ni la
      purga). `revokeSession` solo puede apuntar al sid y al sub de los claims en curso.
- [x] Permiso validado en el **service**, en la primera linea, con test: `usuarios.modificar`.
      **No nace ningun `sesiones.modificar`** — grep: cero apariciones fuera del comentario que
      explica por que no. Apuntarse a uno mismo **no** es `self_operation`, y tiene su test.
- [x] RLS: `ENABLE` + `FORCE ROW LEVEL SECURITY` sobre la tabla nueva, **sin ninguna policy**.
- [x] Acceso solo por Prisma; ni una lectura con el cliente de Supabase.
- [x] Migracion `20260912103000_session_revocation` con `migration.sql` **y** `down.sql`. El down son
      dos sentencias y nada mas. El gate confirma que todas las migraciones tienen down.sql. Ningun
      `DROP INDEX` del drift se colo: `users_email_unique` y sus hermanos no se mencionan.
- [x] Identificadores en ingles y `snake_case`, con su test.
- [x] Sin secretos hardcodeados. Sin webhooks.

### Modulos hexagonales
- [x] `domain/` y `ports/` sin framework, sin Prisma, sin shared y sin adaptadores. Con test.
- [x] Puerto -> implementacion atado **solo** en `lib/composition/index.ts`.
- [x] `/// @module identity` en `RevokedSession`; `prisma.revokedSession` vive en un solo archivo.
- [x] La logica de negocio esta en `domain/`, no en el adaptador: la decision de que cambio corta
      (`changeRevokesSessions`) y la desigualdad del sello (`isStampedOut`) son funciones puras.
- [x] **`logoutAction()` congelada**: el archivo no aparece en el diff. Sigue sin parametros y sin
      valor de retorno; lo que cambia es que se cablea en la clave `endSession`, no la firma.

### Verificacion final
- [x] `./init.sh` verde.
- [x] Este archivo existe. Veredicto: RECHAZADO.
- [ ] Entrada en `progress/history.md` — la escribe el leader al cerrar.
- [ ] Desmontaje del worktree — lo hace el leader al cerrar.

## Lo que se verifico MUTANDO, no leyendo

| Que | Como | Resultado |
| --- | --- | --- |
| `iat <= sello` y no `<` | cambie `<=` por `<` en `session-revocation.ts:65` y corri `tests/unit/identity` | **5 tests rojos** en 3 archivos: `resolve-session.test.ts > con un iat igual al sello —el mismo segundo— resuelve null`; `end-other-sessions.test.ts > una sesion AJENA emitida en el MISMO SEGUNDO del sello queda invalida (R9)`; y tres de `session-revocation.test.ts`, incluido `firstIssuedAtAfterStamp > produce el primer instante emisible que el sello NO mata`. La decision esta **anclada**, no solo escrita |
| `guard-sesiones-cortadas`, forma SQL cruda | quite el `"sessions_valid_from" = ...` del UPDATE de QC-79 | **2 casos rojos**, con el hallazgo correcto y el mensaje de remedio nombrando QC-23 y la decision cerrada 2 |
| `guard-sesiones-cortadas`, forma `data` de Prisma, sobre codigo NUEVO | cree un archivo nuevo en el directorio vigilado con un `tx.user.update` que escribe `passwordHash` sin sello | **rojo**. Muerde por codigo que no existia, que es su razon de ser |
| `guard-sesiones-cortadas`, **evasion** | el mismo archivo, en `adapters/driven/credenciales/` en vez de `adapters/driven/persistence/` | **VERDE**. Ver hallazgo mayor 1 |
| Coste real por peticion | instrumente `PrismaClient` con el evento `query` sobre la base real y conte sentencias con y sin los dos campos nuevos | **5 sentencias con QC-23, 4 sin**. El **delta es exactamente +1**, el SELECT sobre `revoked_sessions`. Ver menor 4 |

## Hallazgos

### MAYOR 1 — `guard-sesiones-cortadas` se esquiva cambiando de carpeta, y QC-89/QC-96 cuentan con que no

`tests/guards/guard-sesiones-cortadas.test.ts:63-71` fija el ambito vigilado en
**`lib/modules/identity/adapters/driven/persistence/`** y en nada mas. Pero `guard-arquitectura-modulos`
(su R17) permite importar `@/lib/shared/db/prisma` desde **todo** `adapters/driven/**`, no solo desde
`persistence/`.

Verificado, no supuesto: cree `lib/modules/identity/adapters/driven/credenciales/reset-prisma.ts` con

```ts
await prisma.user.update({ where: { id }, data: { passwordHash: hash } });
```

y **las dos guardias pasaron en verde** (70 casos, 0 rojos). El mismo archivo, dentro de
`persistence/`, pone la guardia roja.

Por que es mayor y no menor:

- La cabecera de la guardia (linea 59) **afirma como hecho** que ese directorio es el unico sitio del
  repositorio donde se puede escribir en `users`, y **la guardia no comprueba esa afirmacion**.
  Ampliar el ambito queda encomendado a que un humano se acuerde, que es exactamente lo que la
  guardia existe para no tener que hacer.
- `progress/impl_QC-23-registro-de-sesiones.md` se lo promete a otras dos fichas con estas palabras:
  «Quien escriba `password_hash` en un UPDATE sin subir el sello se encuentra la guardia roja».
  **Eso hoy no es cierto**, y sobre esa lectura ya se enmendo el spec de QC-96.
- QC-89 (el administrador restablece la contrasena de otro) y QC-96 (la recuperacion) son justo las
  dos fichas que van a escribir un UPDATE del hash. Que caigan en `persistence/` es una convencion,
  no una regla ejecutable.

**Que falta para cumplirlo:** ampliar `PERSISTENCE_DIR` a `lib/modules/identity/adapters/driven/` —o
mejor, a `lib/`— y anadir un caso que pruebe que la guardia muerde en un subdirectorio hermano recien
nacido. Una constante y un caso de test. Produccion no se toca.

### menor 1 — `tasks.md` T24 sigue sin marcar

`specs/QC-23-registro-de-sesiones/tasks.md:203`. 23 de 24 estan marcadas. El **contenido** de T24 esta
cumplido —el gate completo esta verde y el mapa `R<n> -> test` esta entero— y la bitacora dice a
proposito que T24 lo corre el leader. Pero `CHECKPOINTS.md > Especificacion` exige que **todas** esten
marcadas para pasar a `done`: hay que marcarla antes del cierre.

### menor 2 — el mapa de trazabilidad cita R26 con el test de R51

La bitacora mapea R26 a `end-all-sessions.test.ts > el caso de uso no emite ninguna cookie ni crea
ninguna Server Action`, que vive bajo el describe de R51 y afirma R51, no R26. La cobertura de R26
**si existe**, en otro sitio: `end-all-sessions.test.ts:127-147`, bajo el describe de R25/R26/R28, con
`expect(repo.revokeSession).not.toHaveBeenCalled()` y el comentario «R26: el cierre es SIEMPRE total».
Es un error del mapa, no un requisito huerfano.

### menor 3 — cuatro titulos del mapa no estan literales en disco

R7, R39 y R45 citan titulos parafraseados; el de R7 en disco es `anade users.sessions_valid_from NOT
NULL con DEFAULT, y eso ES el backfill (R7)` y el de R45 es `declara exactamente las seis columnas del
diseno, sin empresa y sin updated_at (R44, R45)`. Los tests existen y muerden; el mapa obliga a
buscarlos a mano, que es justo lo que el mapa existe para evitar.

### menor 4 — la tabla de coste de `design.md` seccion 4 da mal la linea de base

Dice «Hoy: 1 sentencia SQL (users + roles + role_permissions + companies)». **Medido: son 4** —Prisma
resuelve cada relacion en su propia consulta y el esquema no activa `relationJoins`—. Con QC-23 son
**5**. O sea: el **delta que sostiene todo el argumento es exacto** (+1, el SELECT por
`revoked_sessions_session_id_key`), y el absoluto esta mal por un factor de cuatro. No cambia ninguna
decision, pero es el numero que QC-28 va a leer para dimensionar su cache.

### menor 5 — `endOtherSessions` sella con una empresa y reemite con otra

`lib/modules/identity/domain/end-other-sessions.ts:92-113`: `stampAll` usa `actor.companyId` y
`createSessionTicket` usa `current.companyId`. Hoy los dos vienen de la misma sesion resuelta y
coinciden por construccion. Si divergieran, la cookie reemitida moriria en el corte 4 de
`resolve-session.ts` —fallo cerrado, el lado correcto—, pero son dos fuentes para un dato que deberia
tener una. Mismo criterio que el propio corte 4 dejo escrito.

### menor 6 — una frase empalmada a media explicacion en `ports/session-check-log.ts`

Lineas 11-16. La aclaracion sobre que la guardia barre el texto del archivo esta insertada en mitad de
la frase que explica la desviacion del diseno y la parte en dos, con un «No se puede» que queda
colgando. El contenido es correcto y la desviacion **si** queda declarada; se lee como un resto de
edicion.

### menor 7 — consecuencia no declarada del `<=`: entrar en el mismo segundo del sello rebota

`isStampedOut` es `<=` e `iat` va truncado al segundo. Luego un login que ocurra **en el mismo segundo**
en que subio el sello de esa persona —cambio de rol, bloqueo, borrado, o el enlace de QC-79— emite una
cookie que su **primera** peticion ya rechaza, y la persona vuelve al login; el segundo intento entra.
Se cura solo y la ventana es de menos de un segundo, pero es consecuencia directa del `<=` que
`design.md` seccion 12 no enumera —la seccion 2.3 solo declara la otra, que la sesion reemitida dura un
segundo mas de ocho horas—. Hoy nadie lo pisa: verificado que no hay auto-login tras consumir el
enlace de QC-79, porque `applyCredentialAndActivate` no invoca `startSession`.

## Los siete archivos ajenos: uno por uno

Revisados de a uno contra `git diff origin/dev...HEAD`. **Ninguna expectativa ajena borrada ni
debilitada; todas siguen siendo igualdades exactas; dos ademas quedaron mas apretadas.**

| Archivo | Que le paso | Veredicto |
| --- | --- | --- |
| `tests/unit/identity/schema/identity-schema.test.ts` | bloque aditivo `SESSION_STAMP_FIELDS` al censo de escalares de `User`; el `toEqual` sigue siendo igualdad exacta | retensado |
| `tests/unit/identity/schema/account-status-schema.test.ts` | entra `RevokedSession` en `relationTargets(User)`; el `not.toContain(User)` sigue | retensado |
| `tests/unit/identity/credential-policy-contract.test.ts` | entran `sessionsValidFrom` y `revokedSessions` en el censo; sigue `toEqual`, no `toContain` | retensado |
| `tests/unit/identity/account-status-scope.test.ts` | entra `session-revocation.ts` en la lista de sitios permitidos, con su autorizacion escrita (R33/R36); la comparacion sigue siendo igualdad | retensado |
| `tests/unit/proveedores/module-contract.test.ts` | entra `RevokedSession` **y se paga**: nace `moduloDelModelo()`, que lee el `/// @module` del esquema, y dos aserciones nuevas afirman sobre el **censo entero** de modelos de proveedores en vez de dos nombres a mano | **mas apretado que antes** |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | entra `MIGRACION_QC23` en las rutas de `db/` permitidas **y se paga**: un bucle nuevo exige que **toda** ruta permitida siga existiendo en disco | **mas apretado que antes** |
| `tests/guards/guard-identificador-de-request.test.ts` | entra la migracion nueva en `MIGRACIONES_ESPERADAS`, que es literalmente lo que pide el mensaje de fallo de esa guardia | correcto |

`lib/modules/identity/ports/session-reader.ts`: el comentario de QC-8 **no se borro ni se reescribio**.
Queda intacto y debajo se anade una ANOTACION DE QC-23 que dice, con esas palabras, que el parrafo de
arriba ya no es cierto y que se deja escrito en vez de disimularlo. Es exactamente lo que se pedia.

## Los cinco puntos donde el spec no se sostuvo: verificados uno a uno

1. **El identificador de peticion en el puerto de log.** Cierto y bien resuelto. El puerto es
   `log(diagnostic)`; el adaptador `session-check-log-console.ts` recibe el lector de la cabecera por
   parametro desde `lib/composition` y escribe causa e identificador en **una sola linea**. R17 se
   cumple entero, del otro lado del puerto. `guard-identificador-de-request` verde. Declarado en el
   propio puerto (menor 6 sobre la redaccion, no sobre el fondo).
2. **La guardia descrita para un `data` de Prisma cuando el UPDATE es SQL crudo.** Cierto, y el
   diagnostico es correcto: el unico UPDATE del hash que existe es `$executeRaw`. Implementada
   cubriendo **las dos formas**, con la creacion exenta y el motivo escrito en el codigo. Verificado
   por mutacion en las dos formas. La correccion es acertada; el ambito no (mayor 1).
3. **`requireActor` no existia.** Cierto. Creado en `domain/actor.ts` junto a sus hermanas, con firma
   de asercion, el `UnauthorizedError` del modulo y el porque de no mirar el conjunto de permisos.
4. **`updateAliveInCompany` necesitaba leer el rol previo.** Cierto. El `findFirst` va **dentro** de la
   transaccion, tras `lockActiveAdministratorIds`. El hueco —empresa sin ningun administrador activo,
   donde ese bloqueo no serializa— esta **declarado en el codigo** con su peor efecto: no subir el
   sello en una de dos ediciones simultaneas. Correcto y honesto, y no afecta a la ruta por peticion.
5. **El bloque de composicion no puede ir al final.** Cierto y comprobable: `sessionProvider` y el
   `export const identity` se evaluan en su propia linea. El bloque va insertado entre dos existentes,
   siguiendo el precedente de QC-66, sin reordenar ni reformatear nada. Desviacion de la letra de
   `design.md` seccion 8, no de su fondo, y declarada.

Las dos observaciones menores que la bitacora anade —`CurrentSession.sessionId` declarado y no leido, y
`stampAll` devolviendo not_found dentro de `endOtherSessions`— son ciertas y estan resueltas por el
lado cerrado: se lanza `UserNotFoundError` y **no se reemite** ninguna cookie.

## Lo que sale de esta ficha hacia fuera

- **`endAllSessions(actor, targetUserId)`** es la firma real, y la lectura del implementer es
  **correcta**: el camino publico sin sesion de QC-79 —el que reutilizara QC-96— **si corta las
  sesiones**, y no por invocar al revocador sino por la regla sobre la escritura.
  `credential-setup-link-prisma.ts` sube `"sessions_valid_from"` como una columna mas del **mismo SET**
  del UPDATE que escribe `password_hash`, dentro de la transaccion que ya existia. Toda sesion con
  `iat <= now` muere; sin sesion en curso que preservar, mueren todas, que es lo que QC-96 necesita.
  Verificado en el codigo y por mutacion. **Pero** esa regla solo esta vigilada dentro de
  `persistence/` (mayor 1).
- **La purga perezosa NO esta en la comprobacion por peticion.** Verificado en los dos lados:
  `resolve-session.ts` no tiene ningun puerto de escritura entre sus dependencias, y
  `session-user-prisma.ts` solo hace un `findFirst`. Las dos purgas viven dentro de `revokeSession` y
  de `stampAll`, en la misma transaccion y acotadas por `user_id`. `design.md` seccion 9 punto 6 la
  descarta por escrito y R40 la prohibe. Correcto.
- **El camino a QC-28 queda abierto:** lo cacheable es el par `(sessionsValidFrom, sessionRevokedAt)`
  con clave `userId` mas `sid`, el dominio lo consume por el puerto y el decorador no obliga a tocar
  `resolve-session.ts`. La condicion de R19 —poder fallar abierta **hacia la base**, nunca hacia
  valida— esta escrita y tiene test.
