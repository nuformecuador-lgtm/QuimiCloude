# QC-48 — tenant-en-la-sesion · review

> Revisor: `reviewer`. Fecha 2026-09-07. Rama `feature/QC-48-tenant-en-la-sesion`, worktree
> `.worktrees/QC-48-tenant-en-la-sesion`. Diff medido siempre con **tres puntos**
> (`git diff dev...HEAD`), porque la rama lleva dentro el merge de `dev` de F2.3.
>
> Leido antes de revisar: `specs/QC-48-tenant-en-la-sesion/{requirements,design,tasks}.md`,
> `progress/impl_QC-48-tenant-en-la-sesion.md`, `CHECKPOINTS.md`, `docs/architecture.md`,
> `docs/conventions.md`, `docs/verification.md`.

## Que se verifico y como

Los tests se **abrieron uno a uno**, no se dio por bueno el mapa de la bitacora. Ejecucion propia,
acotada a lo que no toca base de datos (el leader esta corriendo la suite completa y la base es
compartida):

```
pnpm exec vitest run tests/unit/identity tests/unit/composition tests/guards
  Test Files  42 passed (42)
       Tests  546 passed (546)
```

Gate completo (`typecheck`, `lint`, suite entera 2441/2442 con el unico rojo diagnosticado como
basura en `document_types` de otra corrida, ajeno a QC-48) **medido por el leader**; no se repite
aqui a proposito. El rojo del validador de `feature_list.json` desde dentro de un worktree es deuda
conocida del arnes (`WT_DIR` contra el cwd) y **no** se cuenta como hallazgo de esta ficha.

## Checklist

### Especificacion
- [x] `requirements.md` con `R1`-`R28` en EARS, tabla de cobertura de las 9 decisiones cerradas
      (ninguna sin `R<n>`) y una unica pregunta abierta, heredada de QC-47 y aplazada por escrito.
- [x] `design.md` con 11 secciones y **cinco** alternativas descartadas con su porque (seccion 8).
- [~] `tasks.md`: 13 de 14 marcadas `[x]`. **T14 (gate completo) sigue `[ ]`** — hallazgo menor 1.

### Trazabilidad R1-R28 — abierta test por test
- [x] R1, R2, R5 · `verify-credentials.test.ts`: el ticket lleva la empresa de la ficha aunque el
      `FormData` cuele `cid`/`companyId`; si la base devuelve otra empresa, el ticket lleva esa
      otra. R2 ademas contra Postgres en `login.int.test.ts` (una lectura trae `companyId` y
      `companyDeletedAt`). R5 tambien en `session-ticket.test.ts`.
- [x] R3 · `verify-credentials.test.ts`: `toBe` (identidad, no equivalencia) contra el `REJECTED`
      de la contrasena incorrecta, `attempts.set` y `compareAndSet` no llamados, `startSession` no
      llamado. Y el contraste: contrasena mala sobre empresa muerta **si** registra el fallo.
- [x] R4 · `hasher.verify` llamado exactamente una vez en el camino de la empresa muerta.
- [x] R6 · `session-token.test.ts` afirma `Object.keys(payload)` = sub, iat, exp, role, cid y que
      de la empresa no viaja nada mas; `session-cookie.test.ts` lo repite sobre la cookie emitida.
- [x] R7 · `SESSION_VALUE_VERSION === 'v3'`, y `hasCurrentVersion` falso para v1, v2 y v0.
- [x] R8 · tres tests reales, no uno: un v2 **impecable** (firma verificada byte a byte contra
      `node:crypto` dentro del propio test y `exp` futuro comprobado) resuelve `null`;
      `crypto.subtle.sign` **no** se llama; y en `session-cookie.test.ts` se **borra**
      `SESSION_SECRET` del entorno y aun asi resuelve `null` — prueba de que el corte va antes de
      leer el secreto.
- [x] R9 · `session-claims.test.ts`: `cid` ausente, vacio, numerico, nulo, array y texto sin forma
      de UUID, los seis a `null`.
- [x] R10 · `route-guard-middleware.test.ts`: payload firmado y vigente **sin** `cid`, y con `cid`
      mal formado, da 307 al login con la ruta pedida y su cadena de consulta en `next=`.
- [x] R11 · `tests/guards/guard-middleware-edge.test.ts` (verde, sin tocar) mas el test del
      adaptador que afirma que el borde no importa composicion ni repositorios.
- [x] R12 · cuatro peticiones, dos empresas, mismo rol: `dejaPasar`, `status` y destino iguales.
- [x] R13 · `session-user.int.test.ts`: los dos campos salen, y el espia sobre
      `prisma.user.findFirst` afirma `toHaveBeenCalledTimes(1)`.
- [x] R14 · `resolve-session.test.ts`: `companyId` firmado distinto al de la ficha da `null`.
- [x] R15 · dos tests, incluido el que casa la empresa firmada con la de la ficha y aun asi corta
      por `companyDeletedAt`: eso es lo que obliga a que sean **dos ifs** y no uno combinado.
- [x] R16 · el `null` de siempre; diff **vacio** en `app/` y `components/`: ni pantalla, ni ruta.
- [x] R17 · sin claims y con sesion caducada, `findActiveById` **no** llamado.
- [x] R18 · `identity-facade.test.ts` sobre el cableado REAL de `lib/composition`.
- [x] R19 · `null` sin sesion, y el test de la empresa muerta que deja sin sesion a las **dos**
      salidas: si alguien cableara dos instancias, se pone rojo.
- [x] R20 · el origen se demuestra por el campo hermano (el rol firmado es distinto al de la ficha
      y lo expuesto es el de la ficha), con el razonamiento escrito en el propio test. Es la unica
      forma honesta de demostrarlo: tras el corte 4 los dos `companyId` son iguales por
      construccion. Aceptado.
- [x] R21 · una sola cadena en `domain/resolve-session.ts`; `resolve-session-user.ts` reducido a
      proyeccion **conservando su firma publica**, y los tests de QC-8 siguen verdes sin tocar su
      guion (solo se les anadieron campos a los fixtures, ni una asercion movida).
- [x] R22 · las claves del contexto son companyId, roleName y userId, afirmado en el dominio **y**
      en la fachada.
- [x] R23 · el portero sigue decidiendo por `role`, con el rol ausente aun anonimo (no rol por
      defecto); `session-claims.test.ts` intacto en su parte de rol.
- [x] R24 · `git diff dev...HEAD -- db` **vacio**, medido; `tests/unit/identity/schema/*` verdes.
- [x] R25 · diff vacio en `app/`, `components/` y en los cinco modulos de negocio.
- [x] R26 · ninguna creacion de usuario nueva; el unico camino sigue siendo el seed.
- [x] R27 · `e2e/login.spec.ts` **extendido**, un test mas en el describe existente; los dos que ya
      habia intactos; el helper gana un parametro opcional en vez de duplicarse; el `afterAll`
      borra usuarios, luego rol, luego empresas, con `startsWith` para alcanzar las dos.
- [x] R28 · `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` con diff **vacio**, medido.
- [x] `progress/impl_...md` contiene el mapa R -> test completo, sin huecos.

### Las apuestas del diseno, medidas
- [x] **Cero lineas nuevas en el middleware.** El diff de `middleware.ts` y de
      `lib/modules/identity/adapters/driving/` es **vacio**. El corte del borde lo hace el esquema
      `zod` de `session-claims.ts`, y el borde solo gana tests.
- [x] **Cero consultas nuevas por peticion.** El `select` de `session-user-prisma.ts` se amplia
      (`companyId`, `company.deletedAt`) dentro del `findFirst` que ya existia; el login gana un
      `JOIN companies` dentro del `$queryRaw` que ya existia. Afirmado con espia en integracion.
- [x] **`SessionUser` no se descongela.** `domain/session-user.ts` con diff vacio; la empresa viaja
      en el tipo nuevo `SessionContext`.
- [x] **Sin migracion y sin dependencia nueva.** `db/**`, `package.json`, el lockfile y
      `docs/dependencias.md` sin una linea de diff.
- [x] **v3 sin compatibilidad**, igual que QC-9 hizo con v1; la consecuencia (caen las sesiones
      vivas al desplegar) esta escrita en `design.md > 11`, en `tasks.md` y en `session-token.ts`.
- [x] **El corte de empresa no viva va en el dominio**, no en el `WHERE`: el `$queryRaw` **no**
      lleva `AND c.deleted_at IS NULL`, y hay un test de integracion que se pondria rojo si alguien
      moviera la regla al SQL.
- [x] **Finales de linea.** Medido contra la **base**, no contra `HEAD`, y con `git cat-file blob`
      (no con `git show rev:path`, que aplica conversion de EOL al salir y habria dado un falso
      positivo). Los 22 archivos modificados y los 8 nuevos son 100 % CRLF tanto en `dev` como en
      `HEAD`: **ningun archivo cambio de regimen de final de linea**.

### Calidad, seguridad y arquitectura
- [x] La regla de acceso del login se valida en el caso de uso (`domain/verify-credentials.ts`) y
      tiene sus tests ahi, con objetos planos. No hay logica de negocio en Server Actions.
- [x] `domain/` y `ports/` sin framework, sin Prisma, sin `shared`; guardias de arquitectura,
      contrato publico y borde Edge verdes.
- [x] Sin secretos en codigo (los de los tests son literales de prueba). Sin hardcode de contexto.
- [x] **Aislamiento por empresa**: no se anade ningun modelo a `db/schema.prisma` (diff vacio) y no
      se toca ninguna consulta de datos de operacion (R25, diff vacio en los cinco modulos). El
      checkpoint de columna de empresa y rechazo cruzado **no aplica** a esta ficha, y el
      `design.md > 1` lo dice explicitamente para que no se lea como olvido. El filtrado real es
      QC-49, QC-50, QC-51, QC-59 y QC-60.
- [x] **RLS y FORCE ROW LEVEL SECURITY**: no hay tabla nueva, no aplica. `guard-rls-force` verde.
- [x] **Multiplataforma**: no aplica, la feature no toca UI (diff vacio en `app/` y `components/`).
- [x] **Webhooks**: no aplica.
- [x] Nada de lo expuesto autoriza: `SessionContext` es userId, companyId y roleName, y el
      comentario de su archivo repite que la frontera sigue siendo el service.

## Hallazgos

**1. menor — `tasks.md` T14 sigue sin marcar.** `CHECKPOINTS.md > Especificacion` pide todas las
tasks `[x]`. T14 es el gate completo (`./init.sh`), que por `AGENTS.md > Regla del gate` corre el
leader y no el implementer; la bitacora lo deja sin marcar a proposito y lo explica. Se cierra
marcandola cuando el leader anote su `./init.sh` verde. No bloquea: el gate ya esta medido.

**2. menor — `design.md > 10` cita dos rutas de test que no existen.** Dice
`tests/unit/identity/session.test.ts` (el archivo real es `session-ticket.test.ts`) y
`tests/unit/schema/*` (el real es `tests/unit/identity/schema/*`). El implementer detecto y anoto
la primera (decision 6 de la bitacora) y uso los archivos que existen; la segunda no esta anotada.
Es un error de la tabla del diseno, no del codigo: la cobertura real de R5 y R24 existe y es verde.

**3. menor — la nota de finales de linea de la bitacora esta mal medida.** Su decision 7 dice que
el repo es LF salvo `session-cookie.test.ts`, y que `session-ticket.test.ts` quedo entero en LF.
Medido con `git cat-file blob`, **todos** los blobs implicados son 100 % CRLF, en `dev` y en `HEAD`.
La conclusion de la bitacora (no hubo conversion) es **correcta** y la verifique por mi cuenta; lo
que esta mal es la descripcion, probablemente por medir con `git show rev:path`, que convierte los
finales de linea al salir. Conviene corregir la frase para que la proxima ficha no herede un metodo
de medicion que enmascara justo lo que QC-57 vino a evitar.

**4. menor — dos consultas si alguien pide usuario y contexto en la misma peticion.** La fachada
cablea una sola instancia de `createResolveSession` (bien, R21), pero `getSessionUser()` y
`getSessionContext()` la invocan por separado, asi que llamar a las dos en una peticion cuesta dos
lecturas. Esta **aceptado por escrito** en `design.md > 5`, con la salida ya escrita (`getSession()`
devolviendo el `ResolvedSession` entero). Queda anotado para QC-49 a QC-60, que son quienes lo
consumiran.

**5. menor — el "sin una segunda consulta" de integracion mide llamadas al cliente, no sentencias
SQL.** El espia cuenta `prisma.user.findFirst`, asi que atrapa una segunda ida pedida por nuestro
codigo pero no atraparia que Prisma emitiera dos sentencias por su cuenta. El limite esta
reconocido en `design.md > 4.1` y es el mismo compromiso que QC-8 acepto para `role.name`; la
condicion que la ficha se puso —cero consultas pedidas por nuestro codigo— si queda afirmada.

**Bloqueantes: 0. Menores: 5.**

## Veredicto

**OK** — APROBADO.

Los 28 requisitos tienen test, existen, y prueban lo que dicen: ni un test vacio ni un requisito
colgando de una afirmacion generica. Las apuestas del diseno se sostienen medidas, no citadas:
middleware con diff literalmente vacio, ninguna consulta nueva por peticion, `SessionUser` intacto,
`db/**` y `package.json` intactos, y el corte de la empresa muerta en el dominio con el test de
integracion que impide que alguien lo mude al `WHERE`. Los cinco hallazgos son de bitacora, de
tabla de diseno y de deuda ya declarada; ninguno toca el comportamiento entregado.

Pendiente de proceso, del leader y no del implementer: marcar T14 tras anotar su `./init.sh`, la
entrada en `progress/history.md` y el desmontaje del worktree.
