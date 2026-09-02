# QC-9 — proteccion-de-rutas-privadas · tasks

Rama `feature/QC-9-proteccion-de-rutas-privadas`, en su worktree (`docs/worktrees.md`).
`[P]` = paralelizable con las demas `[P]` del mismo bloque.
Cada task se cierra con un commit propio (`docs/conventions.md > Commits`).

**Antes de empezar:** `pnpm run typecheck` y `pnpm test` en verde sobre la rama base. Si algo ya
esta rojo, se anota antes de tocar nada; si no, el primer rojo propio no se distingue del heredado.

**Cierre de cada tanda:** `./init.sh --rapido`. **Antes del PR:** `./init.sh` completo, sin
excepcion (`CLAUDE.md`, regla 5).

**Revision del 2026-09-02 (segunda tanda).** El rol pasa a viajar dentro de la cookie y el formato
del token sube a `v2` (D15/D16, R26–R30). Afecta a T4 (que ahora **no** cambia el formato), a T5, a
la nueva **T5-bis**, a T13, a la nueva **T13-bis**, a T18 y a la trazabilidad del final.

---

## Bloque 1 — Las guardias, ANTES del middleware *(bloqueante, D11/R19)*

> No es un detalle de higiene: hoy las dos guardias barren solo `lib`, `app`, `components` y
> `hooks`, asi que un `createHmac` en la raiz **pasa el gate en verde** (verificado por el reviewer
> de QC-8). Si se escribe `middleware.ts` primero, la guardia nace adaptada a lo que ya hay y nadie
> sabe si habria cazado el fallo.

### [x] T1 [P] — Ampliar `guard-firma-sesion-unica` a la raiz
`PRODUCTION_DIRS` pasa a incluir los archivos `.ts`/`.tsx` de **primer nivel** del repositorio
(`design.md > 3.5`, punto 1). Solo eso: la huella y el dueño se cambian en T5.
**Hecho:** creando a mano un `firma-pirata.ts` en la raiz con `createHmac('sha256', s)` la guardia
se pone **roja** nombrando el archivo; borrado, vuelve a verde. Los tres archivos de configuracion
de la raiz no generan hallazgos.

### [x] T2 [P] — Ampliar `guard-arquitectura-modulos` a la raiz
`SCAN_ROOTS` pasa a incluir los `.ts`/`.tsx` de primer nivel, y esos archivos se juzgan con las
mismas reglas que `app/**` (`design.md > 9`).
**Hecho:** un archivo sintetico en la raiz que importe
`@/lib/modules/identity/adapters/driven/session/session-cookie` produce el hallazgo de R11 (driven
fuera de composicion); borrado, verde. `next.config.ts`, `playwright.config.ts` y
`prisma.config.ts` no generan hallazgos.

### [x] T3 — Tanda verde *(depende de T1, T2)*
**Hecho:** `./init.sh --rapido` en verde con las dos guardias ampliadas y **sin una sola linea de
codigo de produccion nueva**. Este commit es la red; a partir de aqui se puede escribir.

---

## Bloque 2 — Migracion del HMAC a WebCrypto *(depende del bloque 1)*

### [x] T4 — Extraer `adapters/driven/session/session-token.ts`, **sin cambiar todavia el formato**
Mover el codec entero (`SESSION_COOKIE_NAME`, `SESSION_VALUE_VERSION`, `readSessionSecret`,
`signSessionValue`, `buildSessionValue`, `verifySessionValue`, `equalsInConstantTime`, helpers
base64url) e implementarlo con `crypto.subtle` segun `design.md > 3.1`–`3.4`. `session-cookie.ts`
se queda con `startSession`, `readSessionClaims` y `clearSession` delegando en el codec, **con sus
tres firmas publicas intactas**. El codec no importa `node:crypto` ni `next/*`.

> **Se hace en dos pasos a proposito** (D16 llego despues de D1): aqui **solo** cambia la
> criptografia, con el formato todavia en `v1`. Asi, si `session-cookie.test.ts` se pone rojo en T4,
> la causa es la migracion y nada mas. El formato se toca en T5-bis, ya con el gate verde.

**Hecho:** `tests/unit/identity/session-cookie.test.ts` pasa **sin haberse modificado ni una linea**
y `pnpm run typecheck` esta verde.

### [x] T5 — `tests/unit/identity/session-token.test.ts` *(depende de T4)*
Paridad con `node:crypto` (varios secretos y mensajes, uno con caracteres no ASCII) y
`equalsInConstantTime` (distinta longitud, diferencia en el primer byte, en el ultimo, e iguales).
**Hecho:** el archivo pasa y afirma explicitamente que la firma WebCrypto **es igual** a la de
`createHmac`, no solo que «valida».

### [x] T5-bis — El rol dentro del token y la version `v2` *(depende de T5)*
La cadena de emision completa de `design.md > 3.6`, en un solo commit porque por separado deja el
typecheck rojo: `AuthenticatableUser` y el `select` de Prisma ganan `roleName`; `SessionTicket` y
`createSessionTicket` ganan el rol; `verifyCredentials` se lo pasa; `SESSION_CLAIMS_SCHEMA` gana
`role: z.string().min(1)` y `SessionClaims` gana `roleName`; `SESSION_VALUE_VERSION` pasa a `'v2'`.

**Ojo con el sentido del test de version** (`design.md > 3.3`, ultimo parrafo): en
`session-token.test.ts` se añade que un `v1.<payload>.<firma correcta y exp futuro>` construido con
`node:crypto` **se rechaza** (`null`) y que se rechaza **sin verificar la firma** — no lo contrario,
que es lo que decia el plan antes de D16.

**Alcance exacto en tests ajenos:** en `session-cookie.test.ts`, solo el literal `'v1'` -> `'v2'`, la
lista de claves del payload y el argumento nuevo de `createSessionTicket`; **no se toca** la forma en
que recomputa la firma esperada. En `verify-credentials.test.ts`, `session-ticket.test.ts`,
`resolve-session-user.test.ts` y `login.int.test.ts`, solo lo que obligue el cambio de firma.
**Hecho:** los cinco archivos pasan; `login.int.test.ts` afirma contra Postgres que el rol firmado es
el que la base tiene en ese instante (R26); un token `v1` se rechaza (R27); un payload `v2` sin
`role`, con `role: ''` o con `role: 42` resuelve `null` (R28).

### [x] T6 — Cerrar la guardia sobre el dueño nuevo *(depende de T4)*
En `guard-firma-sesion-unica`: `UNICO_DUENO` -> `session-token.ts`; la huella pasa a `createHmac(`
**o** `crypto.subtle` / `subtle.importKey(` / `subtle.sign(`; la comprobacion de tiempo constante
busca `equalsInConstantTime` en vez de `timingSafeEqual`; assert nuevo de que el dueño **no importa
`node:crypto`** (`design.md > 3.5`).
**Hecho:** la guardia pasa; un `crypto.subtle.sign(...)` sintetico en otro archivo de produccion la
pone roja; `rg 'node:crypto' lib app components hooks *.ts` no devuelve nada.

---

## Bloque 3 — El dominio *(depende del bloque 1; independiente del 2)*

### [x] T7 [P] — `domain/return-path.ts`
`RETURN_PARAM`, `isInternalPath`, `resolveReturnPath`, `buildLoginRedirect` (`design.md > 4.2`).
**Hecho:** `tests/unit/identity/return-path.test.ts` rechaza `https://evil.example`,
`//evil.example`, `/\evil.example`, `javascript:alert(1)`, `%2F%2Fevil.example`, la cadena vacia y
`undefined`, y acepta `/dashboard` y `/dashboard/reportes?desde=ayer`.

### [x] T8 [P] — `domain/route-role-rules.ts`
Tipo `RouteRoleRule`, `ROUTE_ROLE_RULES = []` y `findRouteRule` (gana el prefijo mas largo).
**Hecho:** `tests/unit/identity/route-role-rules.test.ts` ejercita `findRouteRule` con reglas
**sinteticas** y afirma que `ROUTE_ROLE_RULES` esta vacio a proposito.

### [x] T9 — `domain/route-access.ts` *(depende de T7, T8)*
`decideRouteAccess` con el orden de `design.md > 4.1`. Puro: sin `next/*`, sin cookies, sin base.
**Hecho:** `tests/unit/identity/route-access.test.ts` cubre los cinco pasos, incluido el caso «no
autorizado en el propio dashboard -> allow» (sin bucle) y el de R29: la decision devuelve **solo**
`allow` o `redirect`, nunca capacidades ni permisos.

### [x] T10 — Puerto, contrato y rutas compartidas *(depende de T9)*
`ports/session-token-verifier.ts`; `lib/modules/identity/index.ts` reexporta `decideRouteAccess`,
`resolveReturnPath`, `RETURN_PARAM`, `ROUTE_ROLE_RULES` y sus tipos (**solo** de `./domain`);
`lib/shared/routes.ts` añade `PRIVATE_ROUTE_PREFIXES = ['/dashboard']`.
**Hecho:** `pnpm run typecheck` y `guard-arquitectura-modulos` verdes; el barrel no arrastra
`next/*` ni Prisma.

### [x] T11 — `guard-rutas-privadas-cubiertas.test.ts` *(depende de T10)*
Recorre `app/(private)/`, calcula la URL de cada carpeta con `page.tsx` (ignora `components/` y los
route groups) y la compara con `PRIVATE_ROUTE_PREFIXES` (`design.md > 7`).
**Hecho:** hoy verde con `/dashboard`; creando `app/(private)/productos/page.tsx` a mano se pone
roja nombrando `/productos`; borrado, verde.

---

## Bloque 4 — El portero *(depende de los bloques 2 y 3)*

### [x] T12 — `lib/composition/edge.ts`
Cableado edge-safe de `SessionTokenVerifier` (`design.md > 5`). `lib/composition/index.ts` no cambia
de comportamiento.
**Hecho:** `guard-arquitectura-modulos` verde (el import de driven desde `lib/composition/**` esta
autorizado por prefijo) y `edge.ts` no importa nada de `persistence/`.

### [x] T13 — `adapters/driving/route-guard-middleware.ts` *(depende de T12)*
Segun `design.md > 6`: lee la cookie de la `NextRequest`, verifica, aplica `isSessionExpired`,
llama a `decideRouteAccess` y traduce a `NextResponse`. Fallo cerrado con `catch` que registra sin
filtrar el secreto.
**Hecho:** `tests/unit/identity/route-guard-middleware.test.ts` cubre: sin cookie en ruta privada
-> redirect al login con `next`; cookie firmada valida -> `next()`; cookie caducada -> redirect;
firma manipulada -> redirect; **token `v1` con firma correcta -> redirect al login (R27)**; login con
sesion -> dashboard; login sin sesion -> `next()`; `SESSION_SECRET` ausente -> redirect al login y
**no** excepcion; y que **no** se llama a `cookies.set` ni `cookies.delete` en ningun caso. Ademas:
con una regla sintetica ruta→rol, el rol que decide es el **firmado en la cookie** y no se consulta
ningun puerto de base (R12, R26).

### [x] T13-bis — Caracterizar el rol rancio *(depende de T13)*
Test de caracterizacion de R30 en `tests/unit/identity/route-guard-middleware.test.ts`: con una
cookie firmada con rol `Operador` y una regla que exige `Administrador`, el middleware redirige al
dashboard **aunque la base diga que esa persona ya es Administrador** — el borde no la consulta.
Cabecera del test: es el limite conocido de D17, **QC-23 lo pondra rojo a proposito**, igual que
QC-8 hizo con su R21.
**Hecho:** el test pasa y su nombre dice que caracteriza un limite, no una virtud.

### [x] T14 — `middleware.ts` en la raiz *(depende de T13)*
Reexport del handler + `config.matcher` literal (`design.md > 2`). Sin logica.
**Hecho:** `tests/unit/middleware-root-contract.test.ts` afirma que el archivo no contiene ninguna
decision (ni `redirect(`, ni `/dashboard`, ni `/login`, ni `subtle`), que exporta `middleware` y
`config`, y que el `matcher` excluye `_next/static`, `_next/image`, `favicon.ico` y los assets.

### [x] T15 — `guard-middleware-edge.test.ts` *(depende de T14)*
Recorre el cierre de imports desde `middleware.ts` y prohibe `node:crypto`, `@prisma/client`,
`lib/shared/db/prisma` y `next/headers` (`design.md > 9`).
**Hecho:** verde sobre el cierre real; con un import sintetico de `next/headers` en la cadena, roja.

---

## Bloque 5 — Vuelta a la ruta pedida *(depende del bloque 4)*

### [x] T16 — `loginAction` honra el destino de vuelta
Lee el campo `next` del `FormData`, lo valida con `resolveReturnPath(next, DASHBOARD_ROUTE)` y
redirige ahi. **Sin tocar la firma congelada** ni `LoginFormState`; el `redirect` sigue fuera de
todo `try`.
**Hecho:** `tests/unit/identity/login-action.test.ts` ampliado: con `next=/dashboard/reportes`
redirige ahi; con `next=https://evil.example` redirige al **dashboard**; sin campo, al dashboard.
Los tests existentes de la firma congelada siguen verdes.

### [x] T17 — Transporte del `next` en la pantalla de login *(depende de T16)*
`app/(public)/login/page.tsx` lee `searchParams.next`, lo pasa por `resolveReturnPath` y se lo
entrega a `<LoginForm next={...} />`; `login-form.tsx` lo lleva en un `<input type="hidden">`.
**Alcance exacto:** nada mas del formulario cambia (campos no controlados, toasts, claves de
montaje y `SubmitButton` intactos).
**Hecho:** `tests/unit/login-form.test.tsx` ampliado afirma que el input oculto existe con el valor
recibido y que **no** hay cambio visual; los tests de QC-7/QC-10 siguen verdes.

---

## Bloque 6 — Documentacion y E2E

### [x] T18 [P] — Actualizar `docs/architecture.md > Permisos y autenticacion` *(depende de T14)*
La linea del middleware pasa de «verifica existencia de cookie de sesion» a que valida **firma,
caducidad y rol firmado** de la cookie y redirige en ambos sentidos, con dos notas: el layout privado
sigue siendo la ultima linea de defensa (D12), y **el middleware no es la frontera de autorizacion**
—`> Acceso a datos y autorizacion` sigue mandando y el rol firmado solo decide si se enseña una
pantalla (D18, R29)—.
**Hecho:** `tests/guards/guard-doc-permisos.test.ts` verde, incluida la comprobacion de que el
documento dice explicitamente que el rol de la cookie no autoriza; `guard-arquitectura-modulos`
bloque 12 (coherencia del documento) sigue verde.

### [x] T19 — `e2e/session.spec.ts` *(depende de T17)*
El recorrido heredado de QC-8 (R24), ampliado con la vuelta: pedir `/dashboard` sin sesion ->
aterrizar en el login -> entrar -> **acabar en `/dashboard`** -> ver el nombre real en la barra ->
cerrar sesion -> login -> atras no muestra la zona privada. Fixtures con prefijo `qc9_e2e_` y
`RUN_ID` por worker, limpieza defensiva de huerfanos y borrado en `afterAll` dentro de
`try`/`finally`, como `e2e/login.spec.ts`.
**Hecho:** verde en `chromium` y `webkit`, y despues `pnpm vitest run integration` sigue verde
entero, incluido `identity-constraints.int.test.ts` (`user.count() === 0`).

---

## Bloque 7 — Cierre

### [ ] T20 — Trazabilidad *(depende de T19)*
Escribir `progress/impl_QC-9-proteccion-de-rutas-privadas.md` con el mapa `R1`…`R30` -> test
concreto, sin huecos, partiendo de la tabla de abajo y corrigiendo lo que la implementacion haya
movido. R30 se marca como test de **caracterizacion** de un limite asumido, con la nota de que
**QC-23 lo pondra rojo a proposito**.
**Hecho:** los 30 requisitos tienen al menos un test nombrado (`CHECKPOINTS.md > Trazabilidad`).

### [ ] T21 — Gate completo y PR *(depende de T20)*
**Hecho:** `./init.sh` completo en verde, `progress/current.md` actualizado, y el PR abierto diciendo
tres cosas: que **todas las sesiones vivas se invalidan** al subir a `v2` (D16), que el rol firmado
envejece hasta la caducidad y lo arregla QC-23 (D17, R30), y que sigue **abierta** la pregunta 2 de
`requirements.md` (que hace `/`).

---

## Trazabilidad `R<n>` -> test

| R | Test (archivo · nombre) |
| --- | --- |
| R1 | `tests/guards/guard-rutas-privadas-cubiertas.test.ts` · «toda pantalla bajo app/(private)/ esta cubierta por PRIVATE_ROUTE_PREFIXES» + «una pantalla nueva sin declarar pone la guardia en rojo» |
| R2 | `tests/unit/identity/route-guard-middleware.test.ts` · «ruta privada sin cookie devuelve redireccion al login y no deja pasar» |
| R3 | `tests/unit/identity/route-guard-middleware.test.ts` · «cookie con firma manipulada, con version desconocida o caducada se trata como sin sesion» |
| R4 | `tests/guards/guard-middleware-edge.test.ts` · «el cierre de imports de middleware.ts no alcanza @prisma/client ni el cliente Prisma compartido» + `tests/unit/identity/route-guard-middleware.test.ts` · «decide con el contenido firmado y no consulta ningun puerto de base» |
| R5 | `tests/unit/identity/route-guard-middleware.test.ts` · «el middleware nunca escribe ni borra la cookie de sesion» |
| R6 | `tests/unit/private-layout.test.tsx` (existente, sin cambios) · «sin SessionUser redirige a LOGIN_ROUTE y no pinta la barra lateral» |
| R7 | `tests/unit/identity/route-access.test.ts` · «ruta privada anonima redirige a /login con la ruta pedida y su query en next» |
| R8 | `tests/unit/identity/login-action.test.ts` · «con next valido redirige ahi, sin next redirige al dashboard» + `e2e/session.spec.ts` · «entra y aterriza en la pantalla que habia pedido» |
| R9 | `tests/unit/identity/return-path.test.ts` · «descarta destinos externos, //host, /\host, esquemas y codificados, y cae al dashboard» |
| R10 | `tests/unit/identity/route-access.test.ts` · «login con sesion valida redirige al dashboard, o al next valido si lo hay» |
| R11 | `tests/unit/identity/route-access.test.ts` · «sin sesion, las rutas publicas se sirven sin redireccion» |
| R12 | `tests/unit/identity/route-role-rules.test.ts` · «ROUTE_ROLE_RULES esta vacio y con el conjunto vacio toda sesion valida pasa» + `tests/unit/identity/route-guard-middleware.test.ts` · «una regla sintetica se evalua contra el rol firmado en la cookie, sin consultar la base» |
| R13 | `tests/unit/identity/route-access.test.ts` · «una regla que exige un rol ausente redirige al dashboard, no al login» + «no autorizado en el propio dashboard no redirige (sin bucle)» |
| R14 | `tests/guards/guard-firma-sesion-unica.test.ts` · «la firma de sesion tiene un solo dueño, incluida la raiz del repositorio» |
| R15 | `tests/guards/guard-middleware-edge.test.ts` · «el cierre de imports de middleware.ts no alcanza node:crypto ni next/headers» |
| R16 | `tests/unit/identity/session-cookie.test.ts` · «el valor escrito coincide con la firma recomputada con createHmac» (recomputo intacto; solo cambian version, claves del payload y el argumento del ticket) + `tests/unit/identity/session-token.test.ts` · «la firma WebCrypto es identica a la de node:crypto para la misma parte firmada» |
| R17 | `tests/unit/identity/session-token.test.ts` · «equalsInConstantTime no corta en la primera diferencia» + `tests/guards/guard-firma-sesion-unica.test.ts` · «el dueño compara en tiempo constante y no importa node:crypto» |
| R18 | `tests/unit/identity/route-guard-middleware.test.ts` · «sin SESSION_SECRET redirige al login en vez de lanzar, y no filtra el secreto» |
| R19 | `tests/guards/guard-firma-sesion-unica.test.ts` · «un createHmac en un archivo de primer nivel se detecta» + `tests/guards/guard-arquitectura-modulos.test.ts` · «un archivo de la raiz que importa un driven fuera de composicion genera hallazgo» |
| R20 | `tests/unit/middleware-root-contract.test.ts` · «middleware.ts solo delega: sin rutas, sin redirect y sin firma» + `tests/unit/identity/route-access.test.ts` · «la decision se ejercita sin Next, sin cookies y sin base» |
| R21 | `tests/guards/guard-arquitectura-modulos.test.ts` · «solo lib/composition importa adaptadores driven (R11)», ahora tambien sobre la raiz |
| R22 | `tests/unit/middleware-root-contract.test.ts` · «el matcher excluye _next/static, _next/image, favicon.ico y los assets» |
| R23 | `tests/guards/guard-doc-permisos.test.ts` · «docs/architecture.md describe el middleware como validador de firma y caducidad» |
| R24 | `e2e/session.spec.ts` · «pide una pantalla privada sin sesion, entra, aterriza en ella, ve su nombre, cierra sesion y atras no muestra la zona privada» |
| R25 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) · «package.json no tiene ninguna dependencia fuera del registro» |
| R26 | `tests/integration/identity/login.int.test.ts` · «el rol firmado en la cookie es el que la base tiene en ese instante» + `tests/unit/identity/verify-credentials.test.ts` · «el ticket emitido lleva el rol leido de la base, no ninguno recibido del cliente» |
| R27 | `tests/unit/identity/session-token.test.ts` · «un token v1 con firma correcta y exp futuro se rechaza, y se rechaza sin verificar la firma» + `tests/unit/identity/route-guard-middleware.test.ts` · «una cookie de la version anterior termina en el login» |
| R28 | `tests/unit/identity/session-claims.test.ts` · «un contenido firmado sin role, con role vacio o con role no textual resuelve null» |
| R29 | `tests/unit/identity/route-access.test.ts` · «la decision solo devuelve allow o redirect: no expone capacidades ni permisos» + `tests/guards/guard-doc-permisos.test.ts` · «docs/architecture.md dice que el rol de la cookie no autoriza y que la frontera es el service» |
| R30 | `tests/unit/identity/route-guard-middleware.test.ts` · «caracterizacion: el rol firmado envejece — con el rol ya cambiado en la base, el borde sigue viendo el anterior hasta que la sesion caduca (lo arregla QC-23)» |
