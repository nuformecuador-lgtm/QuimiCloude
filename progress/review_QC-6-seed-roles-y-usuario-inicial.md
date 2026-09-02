# review_QC-6-seed-roles-y-usuario-inicial.md

> Reviewer. Diff revisado: `b104328..HEAD` (6 commits: `db33bed`, `eaefa90`, `7f8eb39`,
> `abb64ae`, `3a6314e`, `4b7ca87`). Rama `feature/QC-6-seed-roles-y-usuario-inicial`.
> Leidos: `specs/QC-6-*/{requirements,design,tasks}.md`, `progress/impl_QC-6-*.md`,
> `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md`.

## Veredicto

**RECHAZADO.** Dos hallazgos BLOQUEANTES. El resto de la feature esta bien construida: el
diseno se respeta casi punto por punto, la idempotencia es real ("crear solo lo que falta",
sin `upsert`, sin reescritura), no hay ninguna credencial en claro en ningun sitio, y el
arreglo del test ajeno de QC-4 es correcto y no debilita nada.

## Checklist (CHECKPOINTS.md)

### Especificacion
- [x] `requirements.md` con R1-R21 en EARS, numerados y respaldados por decisiones cerradas.
- [x] `design.md` con alternativas descartadas (A-H) y su porque.
- [~] `tasks.md`: T0-T18 marcadas `[x]`; T19 y T20 siguen `[ ]`, pero ambas son
      explicitamente del leader tras el reviewer (`AGENTS.md > Regla del gate`). No bloquea.

### Trazabilidad
- [x] `progress/impl_QC-6-*.md` contiene el mapa `R<n> -> test` completo (R1-R21).
- [~] Cada `R<n>` mapea a un test que existe y afirma lo que dice el requisito, con tres
      matices menores (M-1, M-2, M-3 abajo). Ninguno deja un requisito sin cobertura real.

### Calidad de codigo
- [x] `pnpm run typecheck` -> exit 0, sin salida. Corrido por mi.
- [x] `pnpm run lint` -> exit 0, sin salida. Corrido por mi.
- [ ] `pnpm test` -> 1 fallo sobre 371 tests. Ver B-1. Corrido por mi.
- [x] E2E: no aplica, diferido con motivo por decision del 2026-09-01 (el seed no tiene
      interfaz) y recogido en `design.md > 11`. El E2E de autenticacion es de QC-7.
- [x] UI: la feature no toca UI. La regla multiplataforma no aplica.
- [x] Dependencias: `package.json` cambia solo `scripts` (`build`, `db:seed`).
      `dependencies` y `devDependencies` intactos. Nada que anadir a `docs/dependencias.md`.

### Datos y seguridad
- [x] No hay tabla nueva -> no hay RLS/`FORCE` que anadir. `users` ya los trae de QC-4 y
      `guard-rls-force` solo exige el par por `CREATE TABLE`.
- [x] Migracion versionada y reversible: `20260902132253_user_must_change_credential/`
      con `migration.sql` (un solo `ADD COLUMN`, ningun `DROP`) y `down.sql` escrito a mano
      (una sola sentencia). Ciclo apply -> rollback -> apply verificado a mano en T17, con
      los tres indices unicos de `users` intactos y `_prisma_migrations` coherente.
- [x] Acceso a datos solo por Prisma, dentro de un adaptador driven de `identity`.
      Nunca `prisma.documentType` (R17).
- [x] Ningun secreto hardcodeado: las tres `SEED_ADMIN_*` van a `.env.example` sin valor.
- [x] No hay webhooks.

### Modulos hexagonales
- [x] `domain/seed-initial-access.ts` y `ports/initial-access-*.ts` no importan Prisma,
      framework, `shared` ni adaptadores. Solo tipos de puertos y constantes de dominio.
- [x] `lib/composition/index.ts` no importa ningun adaptador driving.
- [x] La logica esta en `domain/`, no en el script: `scripts/seed.ts` es cascara real
      (carga `.env`, invoca, resume, traduce a codigo de salida).
- [x] Nada de `lib/services/`, `lib/repositories/`, `lib/interfaces/`.
- [x] Guardias de arquitectura, texto plano, RLS y dependencias: 65 en verde (dentro de mi
      corrida de `pnpm test`).

### Configuracion
- [x] Nada que cambie entre entornos quedo hardcodeado.

## Las cuatro cosas con nombre propio del encargo

### 1. Las dos desviaciones declaradas del `design.md`

**(a) `createInitialAdmin` amplia su input con los seis marcadores personales — JUSTIFICADA.**
Se sostiene, y ademas el diseno original estaba peor: `users` exige `first_names`,
`last_names`, `birth_date`, `phone`, `document_type_code` y `document_number` como NOT NULL
(QC-4), asi que con la firma corta de `design.md > 5.1` los marcadores solo podian vivir
dentro del adaptador Prisma. R7 dice literalmente "marcadores fijos y reconocibles definidos
en el propio seed", y el propio `design.md > 5.2` los coloca "fijos en `domain/`". La firma
ampliada es la unica que cumple las dos cosas a la vez. El resultado es visible: las seis
constantes estan en `domain/seed-initial-access.ts` y el adaptador no inventa ninguna. Lo
unico que el adaptador fija por su cuenta es `mustChangeCredential: true`, coherente con el
diseno (no aparece en el input del puerto en `design.md > 5.1`).

**(b) La composicion importa `initialAccessRepository` ya construido — JUSTIFICADA.**
Verificado contra la guardia, no contra la bitacora: `tests/guards/guard-arquitectura-modulos.test.ts`
bloque 11 (R17) permite importar `lib/shared/db/prisma` solo desde
`lib/modules/**/adapters/driven/**`, `scripts/**` y `tests/**`. Pasar `prisma` desde
`lib/composition` habria puesto la guardia en rojo. Ademas es el precedente ya establecido en
el mismo archivo: `findActiveByUsername`, `compareAndSetLoginAttempt`, etc. tambien se
importan ya cableados desde el adaptador driven. Y no cuesta el aislamiento del test: el
adaptador exporta las dos formas, y el test de integracion usa la fabrica sobre el `tx`, como
pedia `design.md > 5.3`.

**(c) Hay una TERCERA desviacion, y esa NO esta declarada.** Ver B-2.

### 2. El arreglo del test ajeno de QC-4 (`4b7ca87`) — CORRECTO

Leido linea a linea contra `git diff`, no contra la bitacora. Las 9 aserciones tocadas:

- Mismos SQLSTATE. `NOT_NULL_VIOLATION`, `UNIQUE_VIOLATION` y `FOREIGN_KEY_VIOLATION` se
  siguen afirmando exactamente igual; ninguna linea `expect(sqlState)` cambio.
- Mismos valores esperados. `survivors` sigue comparandose contra los mismos objetos
  literales (`{ id, email: 'ana.perez@example.com' }`, `{ id, username: 'AnaPerez' }`...).
  Lo unico que cambia es el `where` de la lectura previa.
- El acotamiento es real, no un relajamiento. `where: { roleId }` acota a las filas de ese
  `it`: `roleId` viene de `createRole(tx)`, que crea un rol nuevo de nombre irrepetible
  dentro de la misma transaccion, asi que ninguna fila ajena puede colarse en el conjunto y
  ninguna fila propia puede quedarse fuera. Es "el estado de este caso" en vez de "el estado
  global de la tabla".
- En el unico caso sin `roleId` util (el que inserta con `role_id` nulo y con un uuid
  inexistente) se acota por `documentNumber`, extraido a una constante local reusada en el
  fixture y en las dos comprobaciones: no hay dos literales que puedan divergir.
- Ningun `skip`, ningun `it.todo`, ninguna asercion eliminada (verificado por grep sobre el
  archivo entero).
- `inRolledBackTransaction` y los `SAVEPOINT` intactos: el helper de aislamiento no se toco.
- La excepcion se dejo bien: "el catalogo arranca solo con CC" sigue afirmando sobre el estado
  absoluto de `document_types`, correcto porque QC-6 no toca esa tabla (R17).
- Corrido por mi dentro de `pnpm test`: los 23 casos de ese archivo pasan.

### 3. Ninguna credencial en claro — CONFIRMADO

- `.env.example`: las tres claves nuevas van sin valor (`SEED_ADMIN_USERNAME=`, etc.).
- Codigo: los tres nombres de variable aparecen solo como cadenas literales en posicion de
  valor (el array `REQUIRED_ENV_VAR_NAMES`), nunca como identificador declarado.
- Tests: los valores son marcadores evidentemente ficticios
  (`credencial-de-prueba-no-real`, `qc6-credencial-de-instalacion-de-prueba-no-real`,
  dominios `example.test`).
- Bitacora: las salidas pegadas de T13/T14/T16/T17 estan limpias; el username real del admin
  local aparece redactado como marcador.
- Migracion, `schema.prisma` y spec: sin valores.
- Ningun identificador nuevo con `password`/`pass`/`contrasena` que no termine en `hash`: el
  dato en transito se llama `credential`, la columna `must_change_credential`,
  `guard-password-never-plaintext` en verde. Los unicos `passwordHash`/`passwordHasher` son
  sufijos permitidos.
- `scripts/seed.ts` solo imprime conteos y nombres de rol; el `catch` imprime `error.message`,
  y el unico error que el seed fabrica con datos del entorno es
  "faltan las variables de entorno: NOMBRES", que nombra variables, nunca valores (R18).

### 4. Idempotencia "crear solo lo que falta" y R12 — CONFIRMADO

- No hay ningun `upsert` ni ningun `update` en el camino del seed. El puerto
  `InitialAccessRepository` no expone ningun metodo de actualizacion: la propiedad se
  garantiza por la forma del contrato, no por disciplina. El adaptador solo llama a
  `findMany`, `count` y `create`.
- Lo cambiado a mano sobrevive (R15). El caso 4 de integracion no se limita a comparar
  conteos: edita `passwordHash` y `mustChangeCredential` del admin y la `description` del rol
  despues de la primera corrida, vuelve a correr el seed y compara la fila entera releida
  (`toEqual`) mas los tres campos uno a uno. Si el seed reescribiera, cae. El caso 1 hace lo
  mismo con `updated_at` incluido.
- R12: el proveedor no se invoca ni una vez. Doble cobertura, las dos honestas: en unitario
  `credentials` es un `vi.fn` y se afirma `toHaveBeenCalledTimes(0)` despues de afirmar que
  las lecturas si ocurrieron, mas `passwordHasher.hash` no llamado; en integracion, el caso 6
  usa el adaptador REAL de entorno con las tres `SEED_ADMIN_*` borradas del proceso y aun asi
  termina con exito. Ese ultimo es el que de verdad lo demuestra: si el dominio las leyera,
  lanzaria.
- Antes de afirmar que algo no ocurrio, se afirma que algo ocurrio. Revisado caso por caso:
  los 9 unitarios afirman llamadas/`outcome` no vacios primero; los 8 de integracion
  construyen su escenario con `resetIdentityToEmptyState` y afirman el estado de partida
  (`seedRoleNames(tx)` vacio, `findLiveAdmin` nulo) antes de sembrar. El caso 8 afirma
  `documentTypesBefore.length > 0` antes de comparar. `SeedOutcome` cumple el papel que
  `design.md > 5.1` le asignaba.

## Hallazgos

### BLOQUEANTE B-1 — `pnpm test` esta en ROJO: la feature rompe un test de esquema ajeno

`tests/unit/identity/schema/identity-schema.test.ts > el modelo User declara los nueve datos
del usuario` falla. Salida de mi corrida de `pnpm test` sobre el worktree:

```
 FAIL  tests/unit/identity/schema/identity-schema.test.ts
 AssertionError: expected [ 'birthDate', 'createdAt', ...(16) ] to deeply equal [ ...(15) ]
 +   "mustChangeCredential",
 Test Files  1 failed | 34 passed (35)
      Tests  1 failed | 370 passed (371)
```

Ese test es un centinela deliberado ("La lista completa de columnas: si alguien anade o quita
una, este test lo dice") y esta haciendo exactamente su trabajo: QC-6 anadio
`mustChangeCredential` a `model User` y no actualizo la lista esperada.

Por que se colo en verde: el gate rapido selecciona por grafo de imports, y ese test lee
`db/schema.prisma` como TEXTO, asi que ningun cambio del esquema lo relaciona. Es el agujero
exacto que `CLAUDE.md > regla 5` describe. La bitacora dice "los 21 requisitos verdes" y es
cierto para los tests de QC-6; lo que nadie corrio es la suite entera.

Que falta para cumplirlo: anadir `mustChangeCredential` (con su `@map("must_change_credential")`)
a la lista de escalares esperados de `identity-schema.test.ts`, en su propio bloque comentado
—como ya hizo QC-7 con `LOCKOUT_FIELDS`— sin tocar los nueve `BUSINESS_FIELDS`: la columna
nueva no es un dato de negocio del usuario, es una marca de estado. Y volver a correr
`pnpm test` completo, no `--rapido`. Incumple `CHECKPOINTS.md > Calidad de codigo`
("`pnpm test` pasa") y tumbaria `./init.sh`.

### BLOQUEANTE B-2 — desviacion NO declarada: los pasos 4 y 5 no corren en una transaccion

`design.md > 5.2`, bajo el epigrafe "Puntos que no son negociables y por que":

> Los pasos 4 y 5 corren dentro de una unica `prisma.$transaction`. Si el alta del usuario
> falla, tampoco quedan los roles a medias (R13).

En el codigo no hay ninguna transaccion: `seedInitialAccess` encadena `createRole` x N y
`createInitialAdmin` como llamadas independientes, y `lib/composition/index.ts` cablea
`initialAccessRepository` (construido sobre el `prisma` compartido) sin envolver la
invocacion en `prisma.$transaction`. Verificado por lectura del diff completo: `$transaction`
no aparece en `lib/**` ni en `scripts/seed.ts`.

Consecuencia real: si `createInitialAdmin` falla por algo que no sea `P2002` (una FK rota
sobre `document_types`, una caida de red a mitad del `build` de Vercel), los dos roles quedan
COMITEADOS y el usuario no. No es corrupcion —el seed es idempotente y la corrida siguiente
completa lo que falte— pero es justo la garantia que el diseno declaro innegociable, y no
esta dicha en voz alta en la bitacora, que si declara las otras dos desviaciones. La bitacora
afirma "sin dejar nada creado a medias (R13)" apoyandose en T16, pero T16 demuestra otra
cosa: alli el fallo ocurre ANTES de escribir (falta la variable), que es el unico camino que
el codigo si protege.

Tampoco hay ningun test que cubra la atomicidad: el caso 7 de integracion pasa por la misma
razon (falla al resolver credenciales, antes del paso 4), asi que la ausencia de transaccion
es invisible para toda la bateria.

Que falta para cumplirlo: o bien envolver la invocacion en `prisma.$transaction` desde la
composicion —el dominio no debe conocer la transaccion, y la fabrica
`createInitialAccessRepository(tx)` ya existe justo para esto, asi que son pocas lineas—
con un test que fuerce el fallo del alta y afirme que los roles no quedaron; o bien declarar
la desviacion en la bitacora y justificar por que se descarta una garantia que el diseno
llamo innegociable. Lo que no vale es que desaparezca en silencio.

### menor M-1 — el mapa dice "R9 | U caso 1", pero U caso 1 no afirma nada sobre R9
El caso 1 de `seed-initial-access.test.ts` se titula "...y obligado a cambiar credencial",
pero no contiene ninguna asercion sobre esa marca (no puede: el dominio no la pasa, la fija
el adaptador, que es lo que el diseno decidio). R9 SI esta cubierto de verdad por el caso 2
de integracion (`must_change_credential = true` releido de Postgres) y por el test estatico
del esquema. Es una imprecision del mapa y un titulo que promete mas de lo que comprueba:
quitar la promesa del titulo, o quitar `U caso 1` de la fila R9.

### menor M-2 — R6 se mapea a "T1", que es una task, no un test
Ningun test afirma que las tres claves de `.env.example` esten sin valor.
`guard-password-never-plaintext` cubre los identificadores, no los valores literales. Lo
verifique a mano y hoy esta bien, pero nada impide que manana alguien rellene
`SEED_ADMIN_PASSWORD=` en `.env.example` y el gate no diga nada. Dos lineas en
`deploy-hook.test.ts` (las tres claves existen y su valor es cadena vacia) lo cerrarian.

### menor M-3 — R3 se comprueba de forma indirecta
Las aserciones de integracion sobre `roles` estan acotadas por
`name IN (Administrador, Operador)`, asi que un tercer rol creado por el seed no las haria
caer; en unitario se afirma sobre `outcome.createdRoles`, que es un valor que devuelve el
propio codigo bajo prueba. Bastaria afirmar que `createRole` se llamo exactamente 2 veces
(el doble ya registra todas las llamadas) o un `tx.role.count()` total en el caso 1.

### menor M-4 — `resetIdentityToEmptyState` hace `tx.user.deleteMany({})` sobre la base compartida
Esta dentro del `tx` que hace `ROLLBACK`, esta documentado en la cabecera del archivo y
verifique que el aislamiento sostuvo. Aun asi es el borrado mas amplio de la suite y toma un
lock sobre `users` entero: si esa base la comparten otros tests en paralelo o CI, es
candidato a bloqueo. No bloquea; queda dicho.

### menor M-5 — `scripts/seed.ts` instancia `PrismaClient` antes de `loadDotEnv()`
El import estatico de `../lib/shared/db/prisma` se evalua antes de `main()`. Lo probe con
`DATABASE_URL` y `DIRECT_URL` borradas del entorno del proceso y funciona (Prisma resuelve la
url perezosamente y `.env` ya esta cargado cuando conecta), asi que NO es un fallo; pero el
orden es fragil y `scripts/db-rollback.ts` hace lo contrario a proposito. Un import dinamico
de `prisma`, como ya se hace con `../lib/composition`, lo dejaria sin depender de ese detalle.

### menor M-6 — T19 y T20 de `tasks.md` siguen `[ ]`
Correcto por proceso (las corre el leader tras el reviewer), pero `CHECKPOINTS.md` exige
todas las tasks `[x]` para pasar a `done`. Recordatorio de cierre, no hallazgo.

## Verificacion ejecutable (corrida por mi, no leida de la bitacora)

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | exit 0, sin salida |
| `pnpm run lint` | exit 0, sin salida |
| `pnpm test` | 1 failed / 370 passed (371) — ver B-1 |
| guardias (dentro de `pnpm test`) | 65 en verde |
| `pnpm run db:seed` sin `DATABASE_URL`/`DIRECT_URL` en el proceso | "db:seed: nada que crear", exit 0 |
| `./init.sh` completo | no corrido (lo corre el leader). Con B-1 abierto, caeria. |

## Resumen

Trabajo solido en lo que importa: la idempotencia esta garantizada por la forma del contrato
(un puerto sin metodos de escritura destructiva), no por buena voluntad; R12 esta probado con
el adaptador real de entorno; no hay una sola credencial en claro; el arreglo del test de
QC-4 acota sin debilitar. Se rechaza por dos cosas concretas: la suite completa esta en rojo
por un centinela de esquema que la feature invalido (B-1), y una tercera desviacion del
diseno —la transaccion de los pasos 4 y 5— desaparecio sin declararse (B-2). Ambas vuelven al
implementer.
