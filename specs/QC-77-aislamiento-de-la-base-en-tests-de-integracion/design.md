# QC-77 — aislamiento-de-la-base-en-tests-de-integracion · design.md

> Cubre `requirements.md` R1–R31. No reabre ninguna fila de `## Decisiones cerradas`; donde
> tengo una observacion sobre una de ellas, va marcada como **observacion** y sigue adelante con
> la decision tal cual esta.

---

## 0. Lo que ya esta medido, y verificado contra este arbol

El leader midio esto el 2026-09-12. Lo he vuelto a comprobar contra la rama
`feature/QC-77-aislamiento-de-la-base-en-tests-de-integracion` antes de apoyarme en ello:

| # | Ancla | Verificado aqui |
| --- | --- | --- |
| 1 | 41 archivos en `tests/integration/**` | **Si**: 41 archivos con `describe(` bajo `tests/integration/` |
| 2 | 18 de los 41 se aislan por transaccion; los otros 23 committean | **Si, con matiz** — ver observacion abajo |
| 3 | `fileParallelism: false` en el proyecto `integration`, a proposito y con el porque escrito | **Si**: `vitest.config.mts:85` y el comentario de las lineas 78–84 |
| 4 | `init.sh` carga el `.env` antes de los tests **salvo** que `DATABASE_URL` venga del entorno | **Si**: `init.sh:123-131`, bloque `6.b` |
| 5 | La migracion de QC-49 se detiene sobre una base vacia con `RAISE EXCEPTION` | **Si**: `db/migrations/20260911130000_inventory_company_scope/migration.sql:130` y `:136`, dentro del bloque de backfill |
| 6 | `pg`, `prisma`, `tsx` ya aprobadas | **Si**: `docs/dependencias.md`, filas `pg`, `prisma`, `tsx` (estado `heredada`) |
| 7 | El precedente de scripts es `scripts/wt.sh` (cuatro guardas + «ante la duda, NO borra») y `scripts/db-rollback.ts` (`pg` y no `psql`) | **Si**: `scripts/wt.sh:10-11`, `:112-150`; `scripts/db-rollback.ts:23-25` |
| 8 | 27 migraciones en `db/migrations/`, y la de QC-49 **no es la ultima**: detras van `20260911155021_credential_setup_tokens` | **Si** |
| 9 | El cliente Prisma es uno solo (`lib/shared/db/prisma.ts`) y resuelve la conexion al construirse, dentro del worker | **Si** |

**Observacion sobre el ancla 2 (importa para el diseno de la guardia).** Un `grep` de
`inRolledBackTransaction|RollbackSignal` sobre `tests/integration/**` devuelve **19** archivos, no
18. El diecinueveavo es `identity/work-group-crud.int.test.ts`, que **si esta** en la lista de los
23 que no se aislan: define su propio `RollbackSignal` (`:249`) para un **sondeo** puntual del
`23505` con una funcion `pg_temp` (`:269-292`) y el resto de sus casos committea. O sea: **el
codigo del test no es una fuente fiable para decidir como se aisla un archivo**. Esto descarta la
guardia por `grep` (ver `## 9, alternativa A7`) y es la razon de que el censo sea un archivo
aparte.

Segunda observacion, menor: el helper `inRolledBackTransaction` **no esta compartido**. Cada uno
de los 18 archivos lo define localmente. No es de esta ficha unificarlo (la decision 9 dice que el
mecanismo se hereda y no se toca), pero queda escrito porque es la deuda que hara que el proximo
crea que existe un helper y no lo encuentre.

---

## 1. Las piezas, y donde vive cada una

| Archivo | Que es | Nuevo / tocado |
| --- | --- | --- |
| `tests/helpers/test-database.ts` | **La libreria**: nombres, plantilla, crear, borrar, rastro en disco, inventario para el barrido. Sin efectos al importarse | nuevo |
| `tests/integration/_global-setup.ts` | `globalSetup` del proyecto `integration`: crea la base, publica la URL, devuelve el teardown, engancha las senales | nuevo |
| `tests/integration/_setup.ts` | `setupFiles` del proyecto `integration`: el **guardian** de R12. Aborta si la URL no es la efimera de la corrida | nuevo |
| `tests/integration/aislamiento.json` | **El censo** de R18: los 41 archivos con su modo de aislamiento | nuevo |
| `tests/guards/guard-aislamiento-integracion.test.ts` | La guardia de R19–R21 | nuevo |
| `scripts/test-db.ts` | La **CLI**: `status`, `template`, `list`, `clean [--force]` | nuevo |
| `vitest.config.mts` | `globalSetup` + `setupFiles` **solo** en el proyecto `integration` | tocado |
| `init.sh` | Bloque `6.c`: el aviso amarillo de R14–R16 | tocado |
| `package.json` | Script `db:test` → `tsx scripts/test-db.ts` | tocado |
| `.gitignore` | El directorio de rastros `.qc-test-db/` | tocado |
| `docs/verification.md` | Seccion nueva: como se aislan los tests de integracion y como se barre | tocado |

Nada bajo `app/`, `lib/`, `components/`, `db/` ni `e2e/`. Los 23 archivos de la decision 3 **no se
tocan** (R22).

**Por que la libreria vive en `tests/helpers/` y no en `lib/`.** `CHECKPOINTS.md > Modulos
hexagonales` exige que en la raiz de `lib/` solo haya `modules/`, `shared/`, `composition/` y
`utils.ts`, y esto no es codigo de negocio. `tests/helpers/` ya existe con ese papel
(`tests/helpers/user-event.ts`, QC-58 T2). La CLI de `scripts/` la importa con ruta **relativa**
(`../tests/helpers/test-database`), igual que `scripts/seed.ts` importa `../lib/composition`: con
`tsx` los alias de `tsconfig` no estan verificados en este repo (`scripts/seed.ts:12-14`).

---

## 2. Como se llama cada base

Tres formas, un solo prefijo reservado `qct_`:

```
plantilla      qct_tpl_<migrations12>
base de corrida qct_<key>_<wt8>_<run>
heredada       QuimiCloude_QC<n>          (las 21 de la decision 10; solo se leen y se barren)
```

- **`<migrations12>`** — 12 hex del SHA-256 de la lista ordenada de `<nombre de carpeta>:<sha256
  del migration.sql>` de `db/migrations/**` **mas** el sha256 de `scripts/seed.ts` y de
  `lib/modules/identity/domain/seed-initial-access.ts`. Es lo que hace automatico el R5: cambia el
  conjunto de migraciones (o el sembrado) → cambia el nombre → no hay plantilla con ese nombre →
  se construye una nueva. Y es lo que hace posible el R6 sin preguntar nada: si el nombre existe,
  se reutiliza. **No hay bandera `--rebuild-si-cambio`**: una bandera es algo que alguien tiene
  que acordarse de poner.
- **`<key>`** — la clave de la ficha sacada del nombre del directorio del worktree
  (`QC-77-...` → `qc77`). Si el directorio no empieza por una clave de ficha se usa su nombre
  saneado y truncado a 12 (desde el worktree principal `labs/` sale `labs`), y `main` queda como
  **ultimo recurso**, solo cuando el saneado no deja ni una letra ni un digito. Es para que un
  humano mirando `\l` en psql sepa de quien es la base — **no es la identidad**, que es el `<wt8>`.
  *(Corregido el 2026-09-12 en F2.3: este parrafo decia «`main` si se corre desde el worktree
  principal», y el codigo nunca hizo eso. El comportamiento correcto es el de arriba, fijado por
  `tests/unit/test-database/nombres-y-huella.test.ts`.)*
- **`<wt8>`** — 8 hex del SHA-256 de la **ruta absoluta del worktree**, normalizada. Es la
  identidad real (el `<key>` puede repetirse o truncarse); es lo que el barrido cruza contra
  `git worktree list` para saber si el dueno sigue vivo (R29).
- **`<run>`** — `<base36 del epoch en ms>_<pid>`. Dos corridas simultaneas **del mismo** worktree
  tampoco colisionan (R10 solo pide worktrees distintos, pero sale gratis).

Cotas: `qct_` (4) + `<key>` ≤ 12 + `_` + 8 + `_` + ~9 + `_` + ~7 = **≤ 43 bytes**, holgado bajo el
limite de 63 de Postgres (R4). Todo en minusculas y `[a-z0-9_]`, asi que no hace falta
entrecomillar en ningun sitio; aun asi el codigo **siempre** entrecomilla al construir el DDL, y
antes valida el nombre contra `/^qct_[a-z0-9_]{1,58}$/`. Un nombre que no case es un error, no un
`CREATE DATABASE` con una cadena rara dentro.

**La URL.** Se parte de la de desarrollo (`DATABASE_URL`, ya cargada por `init.sh` 6.b) y se
sustituye **solo** el `pathname` con `new URL(...)`, conservando usuario, host, puerto y query
(`?schema=public`, `connection_limit`, etc.). Se escriben **las dos**, `DATABASE_URL` y
`DIRECT_URL`: en local apuntan al mismo sitio (`prisma.config.ts:25-27`) y dejar una apuntando a
la de desarrollo seria justo el agujero que esta ficha cierra.

---

## 3. Como se construye la plantilla (la receta de QC-49, que hoy no esta escrita en ningun sitio)

`prisma migrate deploy` **no termina sobre una base vacia**. Se detiene en
`20260911130000_inventory_company_scope`, que exige que exista la empresa inicial y falla cerrado
a proposito (QC-49 R3, `migration.sql:130` y `:136`). Y como Prisma ejecuta el archivo entero en
una transaccion, la migracion queda **registrada como fallida** y `migrate deploy` se niega a
seguir hasta que alguien la resuelva. La receta medida que si funciona, en cuatro pasos y con
`DATABASE_URL`/`DIRECT_URL` ya apuntando a la plantilla:

```
1. pnpm exec prisma migrate deploy      # aplica hasta 20260911120000_*; falla en la de QC-49
2. pnpm run db:seed                     # crea roles, permisos, empresa inicial y admin
3. pnpm exec prisma migrate resolve --rolled-back 20260911130000_inventory_company_scope
4. pnpm exec prisma migrate deploy      # aplica la de QC-49 y 20260911155021_credential_setup_tokens
```

Detalles que no son obvios y por eso van escritos:

- El paso 1 **falla y eso es lo esperado**: su codigo de salida no-cero no es un error del script.
  Lo que decide si la receta fue bien es el paso 4 seguido de `prisma migrate status`, que tiene
  que decir que el esquema esta al dia. Si el paso 1 falla por **otra** migracion, el script para
  y lo dice: tragarse cualquier fallo del paso 1 convertiria un error real en una plantilla a
  medias.
- El `resolve --rolled-back` es legitimo aqui y **no contradice** la cabecera de
  `scripts/db-rollback.ts` (que explica por que alli se usa un `DELETE`): ese comando solo admite
  migraciones en estado **fallido**, y este es exactamente ese caso. En `db:rollback` el caso es
  el contrario —una migracion aplicada con exito— y por eso alli responde `P3012`.
- El paso 2 funciona porque `companies` la crea `20260904180600_companies_and_user_company`, que
  va **antes** de la de QC-49. El orden no es casualidad, pero tampoco esta protegido por nada:
  si una migracion futura mueve `companies` detras, la receta deja de funcionar. Queda anotado.
- **Observacion sobre la pregunta abierta 1** (que sigue abierta, no la cierro): esto son ~2 s de
  script y se paga **una vez por conjunto de migraciones**, no por corrida. El coste de la
  decision por defecto es bajo; el de reabrir R3 de QC-49 no lo es.
- La plantilla se construye **con bloqueo**: `pg_advisory_lock` sobre un entero derivado del
  `<migrations12>`, tomado en la base `postgres`. Dos corridas simultaneas que descubren a la vez
  que falta la plantilla no deben construirla dos veces; la segunda espera y reutiliza.
- Al terminar, la plantilla se marca con `ALTER DATABASE ... IS_TEMPLATE true`? **No.** Se queda
  como base normal. `datistemplate` permitiria copiarla a cualquiera, pero tambien la protege del
  `DROP` y complica el barrido. Se copia con `CREATE DATABASE ... TEMPLATE ...`, que funciona con
  una base normal siempre que no tenga conexiones abiertas.

**La copia.** `CREATE DATABASE "<run>" TEMPLATE "<tpl>"` es una copia de ficheros: no vuelve a
correr 27 migraciones ni el seed. Postgres exige **cero conexiones** contra la plantilla mientras
copia; si hay, responde `55006`. Por eso: (a) el codigo nunca deja una conexion abierta contra la
plantilla —las cierra antes de volver—, y (b) el `CREATE DATABASE` **reintenta** ante `55006` con
espera creciente (5 intentos, hasta ~4 s) antes de rendirse, que es el caso de dos corridas
simultaneas copiando a la vez.

---

## 4. Donde se engancha el ciclo de vida en Vitest

En `vitest.config.mts`, **solo** en el proyecto `integration`:

```ts
globalSetup: ['./tests/integration/_global-setup.ts'],
setupFiles:  ['./tests/integration/_setup.ts'],
```

Ninguno de los dos lleva `.test.` en el nombre, asi que el `include` del proyecto
(`tests/integration/**/*.test.ts`) no los recoge como suite — mismo criterio que QC-58 T2.

**El reparto de responsabilidades:**

- `_global-setup.ts` corre **una vez por corrida**, en el proceso principal de Vitest, antes de
  cualquier worker. Hace: barrido de rastros huerfanos del propio worktree (R9) → asegura la
  plantilla (R2, R3, R5, R6) → `CREATE DATABASE` (R1) → escribe el rastro → publica la URL →
  devuelve la funcion de teardown (R7).
- `_setup.ts` corre **en cada worker, por archivo**. Es el guardian de R12: lee
  `process.env.DATABASE_URL`, y si el nombre de la base no casa con el patron `qct_` **y** no
  coincide con el que la corrida publico, lanza. Sin esto, un fallo de propagacion de entorno
  significaria «los 41 archivos corren contra la base de desarrollo» en silencio — exactamente el
  estado del que venimos.

**Como llega la URL del proceso principal al worker: hay que MEDIRLO, no suponerlo (T4).** El
mecanismo primario es mutar `process.env.DATABASE_URL` / `process.env.DIRECT_URL` en el
`globalSetup`: con el pool por defecto de Vitest los workers son procesos hijo que **heredan** el
entorno del padre, y este repo no declara `pool`, asi que usa el que traiga Vitest 4. **No lo doy
por bueno**: la T4 lo mide con una sonda antes de construir nada encima. Si no se propaga, el
plan B es `provide()` en el `globalSetup` + `inject()` en `_setup.ts`, que es API declarada de
Vitest para exactamente esto, y `_setup.ts` escribe entonces el `process.env` del worker antes de
que nadie importe `lib/shared/db/prisma`. **Esto es un desconocido declarado** (regla 6 de
`CLAUDE.md`), no un supuesto.

**`--rapido`.** La decision 7 es «misma regla siempre», y R11 la recoge. Hay un detalle de coste
que hay que medir en la misma T4: si Vitest ejecuta el `globalSetup` de un proyecto **aunque el
filtro de `vitest related` no haya seleccionado ningun archivo suyo**, cada `--rapido` pagaria una
copia de base para nada. Si resulta que si lo ejecuta, la salida es un corto-circuito explicito en
`_global-setup.ts` gobernado por una variable de entorno que **solo** puede poner
`scripts/test-rapido.mjs`, y **solo** cuando ningun archivo de `tests/integration/` esta en la
seleccion. Eso no crea «dos verdades» —no hay ninguna base sucia usandose, no hay ningun test de
integracion corriendo—, y si el corto-circuito se equivocara, el guardian de R12 lo convierte en
un rojo ruidoso en vez de en un falso verde. Si la medicion dice que Vitest ya no lo ejecuta, no
se escribe nada de esto.

---

## 5. Que pasa si la corrida se interrumpe

Tres capas, de la mas barata a la mas segura. Ninguna sola basta:

1. **Teardown normal (R7).** La funcion que devuelve `globalSetup` hace
   `DROP DATABASE IF EXISTS "<run>" WITH (FORCE)` y borra el rastro. `WITH (FORCE)` existe desde
   Postgres 13 y aqui hay 16: expulsa conexiones que algun worker haya dejado colgando, que es el
   motivo clasico de que un `DROP DATABASE` de limpieza falle justo cuando mas falta hace.
2. **Senales (R8).** `process.once('SIGINT' | 'SIGTERM')` en el `globalSetup`: borra la base y
   **vuelve a lanzar la senal sobre si mismo** con el handler quitado, para no cambiar el codigo
   de salida que ve la consola. No se usa `process.on('exit')`: ahi ya no se puede hacer nada
   asincrono, y un `DROP DATABASE` lo es. **Un `SIGKILL`, un corte de luz o un cierre de la
   terminal no ejecutan nada**, y esa es la razon de que exista la capa 3.
3. **Rastro en disco y auto-curacion (R9).** Al crear la base se escribe
   `.qc-test-db/<nombre>.json` con `{ database, worktreePath, pid, createdAt }` (campos en ingles,
   R31), y se borra tras el `DROP`. Al arrancar, el `globalSetup` lee ese directorio y, para cada
   rastro **de este worktree** cuyo pid ya no vive (`process.kill(pid, 0)` lanza `ESRCH`), borra
   la base y el rastro, y lo dice por consola. Asi la corrida siguiente limpia lo que dejo la
   anterior sin que nadie tenga que acordarse. Solo mira rastros del **propio** worktree: un pid
   de otro worktree no se puede juzgar desde aqui, y ante la duda no se borra.

El directorio `.qc-test-db/` va al `.gitignore`. Lo que quede fuera de las tres capas —una maquina
que se apaga— lo recoge el barrido de `## 6`.

---

## 6. El barrido: `pnpm run db:test clean`

Copia deliberada de `scripts/wt.sh`: inventario con veredicto y razon por fila, **dry-run por
defecto**, `--force` para ejecutar, y la regla de oro **ante la duda, NO borra** (R29). El coste de
dejar una base de mas es disco; el de borrar la equivocada es trabajo perdido — y aqui una de las
candidatas posibles es la base con la que el humano trabaja a mano.

**Subcomandos** (`pnpm run db:test <sub>`):

| Subcomando | Que hace |
| --- | --- |
| `status` | Compara `db/migrations/` con `_prisma_migrations` de la base de **desarrollo**. Es lo que llama `init.sh` (R14–R16) |
| `template` | Construye (o reutiliza) la plantilla de esta rama y la nombra. Util para diagnosticar la receta de `## 3` sin correr tests |
| `list` | Inventario con veredicto `SAFE` / `HOLD` y razon (R26) |
| `clean [--force]` | `list` + borra los `SAFE` si va `--force` (R26, R27) |

**Las cinco guardas.** Cualquiera que salte deja la base en pie:

1. **Es la base de desarrollo.** Se resuelve el nombre desde `DATABASE_URL` y `DIRECT_URL` (del
   entorno o del `.env`) y se compara. HOLD siempre, aunque el nombre encaje con una forma
   conocida (R30). Va **la primera** a proposito.
2. **El nombre no encaja** en `qct_*` ni en `QuimiCloude_QC<n>` (R28). HOLD: una base que no
   sabemos leer no se toca. Esto deja fuera `postgres`, `template0`, `template1` y la propia
   `QuimiCloude` sin tener que enumerarlas.
3. **Tiene conexiones abiertas** (`pg_stat_activity` con `datname = <base>`). HOLD: alguien la
   esta usando ahora mismo. Es la guarda que protege una corrida en vuelo de otro worktree (R10).
4. **Su dueno sigue vivo.** Para `qct_<key>_<wt8>_*`: el `<wt8>` esta entre los hashes de las
   rutas que devuelve `git worktree list`. Para `QuimiCloude_QC<n>`: existe un worktree o una rama
   `feature/QC-<n>-*`. HOLD.
5. **No se pudo leer el estado** (git fallo, la consulta fallo, el nombre no se parsea). HOLD, con
   la razon escrita. Es la traduccion literal del `HOLD  no se pudo leer su estado` de
   `wt.sh:128-130`, que nacio de un falso `SAFE`.

**Las plantillas (`qct_tpl_*`) se listan aparte y son HOLD por defecto**, aunque no tengan dueno
vivo: son **cache**, no basura, y borrar la de la rama de al lado solo cuesta reconstruirla. Caen
con `--incluir-plantillas`, que se pide a mano.

Con esto, las **21 bases `QuimiCloude_QCxx` huerfanas** del punto 7 del contexto caen en el primer
`clean --force`, y la base de desarrollo `QuimiCloude` no cae nunca (guardas 1 y 2).

---

## 7. El aviso amarillo en `init.sh` (R14–R16)

Bloque nuevo **`6.c`**, justo **despues** del `6.b` (que carga el `.env`; sin el no hay
`DATABASE_URL` que consultar) y **antes** del bloque de tests. En los dos modos.

```
-> pnpm run db:test status
✓ base de desarrollo al dia (27 migraciones aplicadas)
```

o, cuando va atrasada:

```
! la base de desarrollo va 4 migracion(es) atras (la mas antigua: 20260909120000_product_batches).
! Los tests de integracion NO se ven afectados (corren sobre base propia), pero la app a mano si.
! Ponla al dia con: pnpm db:migrate
```

- **Avisa, no falla** (decision 6, R15): el `exit` del gate no cambia. Bloquear un PR por el
  estado de una base local seria un gate que se ignora.
- **Lo que si es `fail`: que falte el script.** `docs/verification.md > El anti-patron: la
  validacion opcional` es explicito — una validacion colgada de `[ -f <script> ]` con un `warn` en
  el `else` no es una validacion. Que `scripts/test-db.ts` no exista es una rotura del arnes, no
  una circunstancia; que la base este atrasada es la circunstancia que este bloque vino a contar.
- **No consulta la red ni levanta Prisma**: lee `_prisma_migrations` con `pg` (mismo criterio que
  `db-rollback.ts`, que eligio `pg` sobre `psql` para no exigir binarios cliente) y lo compara con
  los nombres de carpeta de `db/migrations/`. Si la conexion falla, avisa de que no pudo
  comprobarlo y sigue (R16).
- **El aviso explica el 2026-09-12 en una linea.** Ese dia cuatro migraciones de retraso pusieron
  22 archivos en rojo sin que nada dijera la causa. Este bloque es la mitad barata de esta ficha.

---

## 8. El censo y la guardia (R18–R22)

**El censo:** `tests/integration/aislamiento.json`, precedente directo de `tests/baseline-rojos.json`
(registro en JSON bajo `tests/`, con campos obligatorios que el comparador exige) y de
`docs/dependencias.md` (una guardia que compara el arbol contra un registro escrito).

```jsonc
{
  "transaccion": [ "identity/identity-constraints.int.test.ts", ... ],   // 18
  "commit": [
    { "archivo": "identity/work-group-crud.int.test.ts",
      "motivo": "Nacido antes de QC-77. Committea y se apoya en que la base de la corrida es suya.",
      "desde": "2026-09-12" }
    // ... 23
  ]
}
```

Rutas **relativas a `tests/integration/`** y con `/`, para que el archivo sea identico en Windows y
en Linux; la guardia normaliza los separadores al recorrer el arbol (mismo problema que ya resolvio
`guard-editor-aislado`).

**La guardia** `tests/guards/guard-aislamiento-integracion.test.ts`:

- recorre el arbol buscando `tests/integration/**/*.int.test.ts`;
- **archivo en el arbol que no esta en el censo** → rojo, nombrandolo, diciendo los dos modos
  admitidos y donde declararlo (R19). Es lo que muerde con un test nuevo;
- **entrada del censo cuyo archivo ya no existe** → rojo, nombrandola (R20). Aqui **si** se falla,
  a diferencia del aviso de `baseline-rojos`: alli la razon de avisar y no fallar era que un
  archivo que no se ejecuto no dice nada; aqui la verdad es el arbol de ficheros, se lee entera
  siempre y no depende de que nada corra;
- una entrada de `commit` **sin `motivo` o sin `desde`** → rojo. Sin eso el censo se vuelve el
  sitio donde se mete lo que estorba, que es la leccion escrita del baseline;
- vive en `tests/guards/`, asi que entra sola en `pnpm run test:guardias` y en `--rapido` (R21):
  ningun grafo de imports seleccionaria un censo que nadie importa.

**Lo que la guardia NO comprueba, y hay que decirlo:** que el modo declarado sea **cierto**. Un
archivo puede declararse `transaccion` y committear. Comprobarlo de verdad exigiria leer el codigo
—justo lo que el ancla 2 demuestra que no es fiable—. Lo que la guardia compra es que **nadie
anada un archivo de integracion sin haber pensado como se aisla**, que es lo que pide la decision 3.

---

## 9. Alternativas descartadas

**A1. Testcontainers (Docker) para levantar un Postgres por corrida.** Es la respuesta estandar del
ecosistema y da el aislamiento mas fuerte posible. **Descartada por la decision 4, ya cerrada**:
seria una dependencia nueva (parada + aprobacion humana) y el arranque de un contenedor en **cada**
corrida del gate, incluido `--rapido`, contra los ~200 ms de un `CREATE DATABASE ... TEMPLATE`.
Queda anotada como la salida si algun dia el gate corre en CI (pregunta abierta 2).

**A2. Una sola base compartida que se limpia (`TRUNCATE ... CASCADE`) al empezar la corrida.**
Mas barato y sin plantilla. Descartada por tres razones, y la tercera es medida: no aisla dos
corridas simultaneas (R10); no aisla de la app abierta a mano contra la misma base, que es el
origen de las 38 filas `DOCxxxxxxxx` del 2026-09-12; y el borrado en masa ya **choca** con QC-49 —
es exactamente lo que hace `identity-seed.int.test.ts` con su `company.deleteMany({})` y lo que
pone sus 12 casos en rojo por el `ON DELETE RESTRICT` de `products`/`presentations`/`product_batches`.

**A3. Un `schema` por corrida dentro de la misma base (`?schema=qct_<run>`).** Prisma lo soporta y
saldria mas barato aun. Descartada: las migraciones de este repo crean **funciones y disparadores**
(`presentations_check_unit_scope`, `product_batches_*`, los de QC-76) cuyos cuerpos referencian
tablas sin cualificar y por tanto dependen del `search_path` con el que se evaluen. Un esquema
alternativo introduce una diferencia sutil entre lo que prueba el test y lo que corre en
produccion, y estos tests existen **justo** para ejercitar esos disparadores y sus SQLSTATE
literales (decision 5). Ademas `CREATE DATABASE ... TEMPLATE` copia en bloque, mientras que un
esquema nuevo obliga a re-migrar.

**A4. Migrar y sembrar una base nueva en cada corrida, sin plantilla.** Menos piezas: no hay hash,
ni nombre de plantilla, ni bloqueo. Descartada por coste: son 27 migraciones mas el seed mas la
receta de dos pasos de `## 3`, en **cada** corrida, cuando el conjunto de migraciones cambia una
vez cada varios dias. La plantilla con hash en el nombre da lo mismo pagando solo cuando cambia.

**A5. `pg_dump` / `pg_restore` de una plantilla guardada en un fichero.** Seria mas portable a un
Postgres gestionado (el punto de extension de la pregunta abierta 2). Descartada: exige los
binarios cliente de Postgres instalados en cada maquina, que es **exactamente** lo que
`scripts/db-rollback.ts:23-25` ya rechazo al elegir `pg` sobre `psql`. Repetir una decision ya
tomada en el repo, al reves, sin motivo nuevo, es como se erosiona la coherencia.

**A6. Reescribir los 23 archivos para que usen `inRolledBackTransaction`.** Lo prohibe la decision
3, y ademas **no es mecanico**: `work-group-crud.int.test.ts` ya tiene un `RollbackSignal` para un
sondeo y aun asi committea, y siete modulos distintos tienen expectativas que hoy se apoyan en el
commit. Se queda como esta.

**A7. Que la guardia deduzca el aislamiento leyendo el codigo del test (`grep` de
`inRolledBackTransaction`).** La idea obvia, y esta **medida y es falsa**: ese `grep` devuelve 19
archivos y la verdad son 18, porque `work-group-crud.int.test.ts` usa el patron para un sondeo
suelto. Una guardia que cuenta mal desde el primer dia entrena a todos a ignorarla. El censo
explicito no deduce nada.

**A8. Anadir un encabezado `// @aislamiento: ...` a los 41 archivos, en vez de un censo aparte.**
Mas cerca del codigo y mas dificil de olvidar. Descartada: tocaria los 23 archivos que la decision
3 declara intocables (R22), y por una razon menos obvia — un comentario dentro del archivo lo
cambia quien cambia el archivo, sin que nadie mas lo vea; un registro aparte sale en el diff como
una decision. Mismo criterio que `docs/dependencias.md`.

**A9. Borrar la base en un `afterAll` de cada archivo, o entre archivos.** Descartada: el ciclo de
vida es de la **corrida**, no del archivo. Con `fileParallelism: false` los 41 archivos comparten
la base de su corrida a proposito, y varios se apoyan en el estado que dejo el sembrado.

**A10. Aprovechar y quitar `fileParallelism: false` ahora que cada corrida tiene base propia.**
Tentador y **falso**: el motivo escrito en `vitest.config.mts:78-84` no es que la base sea
compartida entre corridas, sino que hay archivos que afirman sobre el estado **global** de una
tabla; dentro de una misma base eso sigue igual de roto. Fuera de alcance.

---

## 10. Contrato del modulo (R31: identificadores en ingles)

`tests/helpers/test-database.ts` exporta:

| Nombre | Firma (resumen) | Para |
| --- | --- | --- |
| `runDatabaseName` | `(worktreePath: string, now: Date, pid: number) => string` | R4 — puro, testeable sin base |
| `templateDatabaseName` | `(migrationsFingerprint: string) => string` | R4, R5 |
| `migrationsFingerprint` | `(repoRoot: string) => string` | R5, R6 — puro sobre el arbol |
| `withDatabaseName` | `(url: string, database: string) => string` | R1 — sustituye el `pathname`, conserva query |
| `ensureTemplateDatabase` | `(ctx) => Promise<string>` | R2, R3, R6 |
| `createRunDatabase` | `(ctx) => Promise<RunDatabase>` | R1, R10 |
| `dropRunDatabase` | `(name: string) => Promise<void>` | R7, R8 |
| `reclaimAbandonedDatabases` | `(worktreePath: string) => Promise<string[]>` | R9 |
| `inventoryTestDatabases` | `(options) => Promise<DatabaseVerdict[]>` | R26–R30 |
| `pendingMigrations` | `(url: string) => Promise<PendingMigrations>` | R14–R16 |

`RunDatabase = { name, url, tracePath }`; `DatabaseVerdict = { database, verdict: 'SAFE' | 'HOLD',
reason, kind: 'run' | 'template' | 'legacy' | 'unknown' }`. Los mensajes por consola van en
**castellano**, como el resto del arnes; los identificadores, en ingles (decision 11).

---

## 11. Dependencias

**Ninguna nueva** (decision 4, R23). Todo se apoya en lo ya aprobado: `pg` (`docs/dependencias.md`,
heredada) para el DDL y las consultas a `pg_stat_activity`/`_prisma_migrations`, `prisma` para
`migrate deploy` y `migrate resolve`, `tsx` para la CLI de `scripts/`, y `node:crypto` /
`node:child_process` de la plataforma. Si al implementar apareciera la tentacion de una libreria
(un parser de URLs de Postgres, un cliente de plantillas), **se para y se pregunta**: regla 7 de
`CLAUDE.md` y decision 4 ya cerrada.

---

## 12. Modelo de datos, rutas y UI

- **Migraciones: ninguna.** Esta ficha no crea, altera ni borra ninguna tabla, columna, indice o
  policy. No hay `down.sql` que escribir.
- **Endpoints, Server Actions, RLS, permisos: nada.** No toca `app/`, `lib/` ni `components/`.
- **UI: ninguna**, asi que la regla multiplataforma de `docs/architecture.md > Componentes` no
  aplica (`CHECKPOINTS.md`).
- **E2E: ninguno, y es deliberado** (decision 8, R24). Esta ficha no cambia ningun comportamiento
  de la aplicacion, solo como se ejecutan sus pruebas. Mismo criterio con el que cerro QC-58.

---

## 13. Riesgos y puntos de extension

- **La propagacion del entorno al worker** es el unico desconocido tecnico real, y por eso T4 lo
  mide **antes** de construir nada encima. El guardian de R12 existe precisamente para que, si
  alguna vez se rompe, se rompa ruidosamente.
- **Windows.** Todo el codigo nuevo es Node, no bash (mismo criterio que `scripts/test-rapido.mjs`,
  que se escribio en Node «a proposito: este repo se trabaja tambien desde Windows»). Las rutas se
  normalizan antes de hashearlas.
- **CI (pregunta abierta 2, que sigue abierta).** Un Postgres gestionado puede no permitir
  `CREATE DATABASE`. El punto de extension queda **nombrado y no construido**: toda la resolucion
  de nombres y de URL pasa por `withDatabaseName` + `createRunDatabase`, asi que una variante
  basada en esquemas o en una base preexistente entraria ahi y en ningun otro sitio.
- **Bases acumuladas.** El barrido del `## 6` es manual a proposito. Si algun dia estorban,
  `init.sh` ya tiene el precedente exacto de como avisar sin bloquear: el bloque 5 de worktrees
  acumulados. **No entra hoy**: un aviso mas en el gate por algo que aun no ha dolido es ruido.

---

## 14. Addendum: lo que la implementacion cambio de este diseno (F2.1–F2.3, 2026-09-12)

Este documento es lo que sobrevive a la ficha, asi que las divergencias reales viven **aqui** y no
solo en la bitacora. Las cinco estan medidas; el detalle y las salidas, en
`progress/impl_QC-77-aislamiento-de-la-base-en-tests-de-integracion.md > 6` y en
`progress/qc77-mediciones/`.

1. **El borrado del camino de senal es SINCRONO, y no puede dejar de serlo** (afecta a `## 5`,
   capa 2). La capa 2 tal como estaba escrita —handler que hace `await` del `DROP`— **no
   funciona**: Vitest registra su propio handler de `SIGINT`/`SIGTERM` que termina en
   `setTimeout(() => process.exit(), 1)` (`node_modules/vitest/dist/chunks/cli-api.*.js`,
   `addCleanupListeners`). **Un milisegundo**: la promesa del `DROP` no se resuelve y el proceso se
   va con la base viva — medido, el primer Ctrl-C la dejo en pie. El camino de senal usa
   `dropRunDatabaseSync` (`spawnSync` de un `node -e` con `pg`, sin dependencias nuevas), que
   bloquea el hilo hasta que el `DROP` termina. **Convertirla en `async` reabre el agujero**, y por
   eso hay un test que afirma que no devuelve una promesa.
2. **Existe un canal mas que el `## 4` no nombraba: `QC77_RUN_DATABASE`.** R12 no pide «apunta a
   una base `qct_`» sino «apunta a **la de esta corrida**». `_global-setup.ts` publica el nombre y
   `_setup.ts` lo compara; sin el, la base efimera de **otra** corrida pasaria el filtro. No es una
   variable de escape y no cambia ningun comportamiento: es el dato que R12 manda comparar.
3. **La plantilla se construye con nombre provisional y se renombra al final**
   (`qct_tplbuild_<huella>_<pid>` -> `qct_tpl_<huella>`), lo que el `## 3` no decia. Sin eso, un
   kill a mitad de los ~40 s de la receta dejaria una plantilla **incompleta con el nombre bueno**,
   que R6 reutilizaria para siempre — el peor fallo posible de esta ficha, porque seria silencioso.
4. **`<key>` no es `main` desde el worktree principal.** Corregido en el `## 2`, donde estaba mal.
5. **`_prisma_migrations` de la plantilla tiene 28 filas, no 27** (afecta a `## 3` y a la
   comparacion de esquemas de R25). La de mas es el intento fallido de
   `20260911130000_inventory_company_scope`, con `rolled_back_at` puesto, y **la plantilla la
   arrastra a todas sus copias**. Toda comparacion de migraciones aplicadas **debe** filtrar
   `rolled_back_at IS NULL AND finished_at IS NOT NULL` — hoy eso solo lo sabe `pendingMigrations`.
   Verificado por el reviewer: 28 totales, **27** con el filtro, y el esquema **identico** al de la
   base de desarrollo. La fila de mas **no** esconde una plantilla a medias.

**Ademas, sobre el `## 6` (el barrido):** la guarda 4 dice «existe un worktree o una rama
`feature/QC-<n>-*`» sin precisar local o remota. Se implemento contando **ambas**, por la regla de
oro. Consecuencia: como las ramas remotas de feature no se borran tras el merge, retienen mucho, y
el reparto SAFE/HOLD **cambia solo** segun se desmontan worktrees y se borran ramas. Se barre
mirando la salida del momento, nunca una lista copiada.
