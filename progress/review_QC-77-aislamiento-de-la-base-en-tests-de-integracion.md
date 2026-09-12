# QC-77 — aislamiento-de-la-base-en-tests-de-integracion · review (F2.2)

> **Fecha** 2026-09-12 · **Rama** `feature/QC-77-aislamiento-de-la-base-en-tests-de-integracion`
> (HEAD `fedcbf6`, **sin sincronizar con `origin/dev`**, que va 15 commits por delante) ·
> **Worktree** `.worktrees/QC-77-aislamiento-de-la-base-en-tests-de-integracion`.
>
> **Veredicto: RECHAZADO.** 4 hallazgos mayores (todos de **trazabilidad**: requisitos sin
> ningun test que vuelva a correr) y 8 menores. Ningun defecto funcional: lo que la ficha
> construyo **funciona, y lo he vuelto a medir yo**. Lo que falta es que siga funcionando
> manana sin que nadie se acuerde de medirlo a mano.

## 0. Que corri yo (no me creo la bitacora)

| Comando | Resultado |
| --- | --- |
| `pnpm exec vitest run --project integration` | **41/41 archivos, 630/630 casos, VERDE** (269 s) sobre `qct_qc77_7a512e99_mtyoo5ht_c7s`, copia de `qct_tpl_1db8043a68e0`, **borrada al terminar** |
| `vitest run tests/guards/guard-aislamiento-integracion.test.ts tests/unit/test-database/nombres-y-huella.test.ts` | 2 archivos, **24 casos verdes** (6 de guardia + 18 unitarios) |
| Mutacion: archivo nuevo `identity/zzz-review-bite.int.test.ts` sin entrada en el censo | La guardia **muerde**: 1 caso rojo nombrando el archivo. Mutacion borrada; `git status` sin residuo |
| `tsx` importando `tests/integration/_setup.ts` con `DATABASE_URL` a `QuimiCloude` | **Aborta nombrando la base**: «apuntan a «QuimiCloude», y ese nombre no es el de una base efimera de test» (R12) |
| Script propio: `createRunDatabase` + rastro con pid muerto + `reclaimAbandonedDatabases` | **Borra y lo dice**: `borrada qct_qc77_7a512e99_mtyovcmv_sos: la dejo la corrida del pid 999999 ..., que ya no esta viva` (R9) |
| Conteo de las 20 tablas de `QuimiCloude` antes/despues de correr `identity-seed.int.test.ts` (el del `company.deleteMany({})`) | **`diff` sin diferencias** (R13). El archivo: 14/14 verde |
| Comparacion de esquema `QuimiCloude` vs `qct_tpl_1db8043a68e0` (columnas, indices, constraints, triggers, `relrowsecurity`/`relforcerowsecurity`, policies) | **175 / 107 / 76 / 3 / 20 / 0 — identicos los seis** (R25) |
| `pnpm run db:test status` en tres estados (al dia / base atrasada / host inexistente), leyendo `$?` **sin tuberia** | `al dia: 27 migracion(es)` · `va 8 migracion(es) atras; la mas antigua ... 20260908190002_user_account_status` · `no se pudo consultar ...: getaddrinfo ENOTFOUND`. **rc=0 en los tres** (R14, R15, R16) |
| `./init.sh --rapido` | **rc=0**, bloque `6.c` impreso (`base de desarrollo «QuimiCloude» al dia`), 32 archivos de guardia / 344 casos |
| `pnpm run db:test list` (antes y despues de todo lo anterior) | 39 bases: **las 21 heredadas en pie**, `QuimiCloude` HOLD, **ninguna base `qct_` de corrida viva**, solo la plantilla |
| `grep` en `node_modules/vitest/dist/chunks/cli-api.BK8pd4xc.js` | Confirmado: `addCleanupListeners` (:2048) engancha `SIGINT`/`SIGTERM` y termina en `setTimeout(() => process.exit(), 1)` (:2059) |
| `node` + `pg` contra la plantilla | `_prisma_migrations`: **28 filas totales, 27** con `rolled_back_at IS NULL AND finished_at IS NOT NULL` |

**Lo que NO corri, a proposito:** `./init.sh` completo. Es T18, del leader.

## 1. Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con 31 requisitos EARS numerados.
- [x] `design.md` con diez alternativas descartadas y su porque (`> 9`).
- [ ] `tasks.md` con **todas** las tasks `[x]` — **17 de 18**. T18 es del leader por enunciado:
      esperado, no es hallazgo.

### Trazabilidad
- [x] `progress/impl_<feature>.md` contiene el mapa `R<n> -> test` de los 31.
- [ ] **Cada `R<n>` mapea a un test concreto — NO.** Diez requisitos (R7, R8, R9, R12, R14, R15,
      R16, R26, R27, R29) y la guarda 1 de R30 se apoyan **solo** en medicion manual. Ver M1-M4
      y el criterio de la seccion 2.

### Calidad de codigo
- [x] `pnpm run typecheck` pasa (dentro de `./init.sh --rapido`, rc=0).
- [x] `pnpm run lint` pasa (idem; `eslint` sin argumentos ve tambien los archivos nuevos).
- [x] Los tests que corri pasan. La suite entera es T18.
- [x] Flujo critico / E2E: **no aplica**. La ficha no cambia comportamiento de la app
      (`design.md > 12`); `e2e/` y `playwright.config.ts` **sin tocar** (R24, verificado con
      `git diff --name-only`).
- [x] UI: **no aplica**. Cero archivos bajo `app/` o `components/`: la regla multiplataforma
      (`docs/architecture.md > Componentes`) no entra en juego. No hay `100vh`, ni `:hover`
      unico, ni targets, ni `font-size`, ni libreria de UI que revisar.
- [x] Dependencias: **ninguna nueva**. `git diff package.json` = **una linea**, el script
      `"db:test": "tsx scripts/test-db.ts"`; `dependencies`/`devDependencies` identicas (R23).
      `docs/dependencias.md` sin tocar, y es lo correcto: no hay fila que anadir. Tampoco hay
      utilidad escrita a mano que ya resolviera una libreria del stack: `pg` y `prisma` (ya
      aprobadas) hacen el DDL y las migraciones, y `design.md > 9, A1/A5` explica por que no
      entran Testcontainers ni `pg_dump`.

### Datos y seguridad (Supabase)
- [x] Aislamiento por empresa, RLS, permisos en el service, columna de empresa: **no aplica**.
      `db/schema.prisma` y `db/migrations/` **sin un solo cambio** (cero rutas de `db/` en el
      diff): ningun modelo nuevo, ninguna consulta de operacion nueva.
- [x] Migraciones versionadas y con `down.sql`: no hay migracion nueva. La guardia de `down.sql`
      pasa en `--rapido`.
- [x] Ningun secreto hardcodeado: las credenciales salen siempre de `DATABASE_URL`/`DIRECT_URL`
      via `resolveDevelopmentUrl`; el `.env` del worktree no entra en el diff.
- [x] Webhooks: no aplica.

### Modulos hexagonales
- [x] Nada bajo `lib/`. La libreria vive en `tests/helpers/` con el porque escrito
      (`design.md > 1`): no es codigo de negocio y la raiz de `lib/` esta cerrada por checkpoint.
- [x] La CLI de `scripts/` importa la libreria por ruta relativa, igual que `scripts/seed.ts`.
- [x] Capas separadas: nombres y huella (puro) / DDL / orquestacion de Vitest / CLI de impresion.
      Las cinco guardas viven en la libreria y `scripts/test-db.ts` solo imprime y borra.

### Permisos / Configuracion
- [x] No aplica (sin paginas ni Server Actions).
- [x] Nada que cambie entre entornos quedo hardcodeado. El unico literal de infraestructura es
      `EXPECTED_FAILING_MIGRATION` (`test-database.ts:95`), y **debe** serlo: es la excepcion
      acotada de la receta de QC-49, y si falla otra migracion el script para.

### Verificacion final
- [ ] `./init.sh` en verde — **pendiente de T18 (leader)**, y **despues** del merge con `dev`.
- [x] Este archivo existe. Veredicto: **RECHAZADO**.
- [ ] `progress/history.md` y desmontaje del worktree: fases posteriores.

## 2. El punto gordo: que cuenta como cubierto

El implementer clasifico su propio mapa en **OK** (test automatico) y **MED** (medicion pegada en
`progress/qc77-mediciones/`, que no vuelve a correr). Lo audito con un criterio explicito:

> **Una medicion cuenta como cobertura solo si romper el requisito pone el gate en rojo por si
> solo.** Si romperlo deja el gate verde y el sintoma solo se ve mirando a mano, es un hueco.

**Cubiertos de verdad: 21 de 31** — R1, R2, R3, R4, R5, R6, R10, R11, R13, R17, R18, R19, R20,
R21, R22, R23, R24, R25, R28, R30 (parcial), R31. De los que solo tienen MED y aun asi cuentan:
si la plantilla no se construye o se copia mal (R2, R3, R25) **se caen los 630 casos**; si la URL
no llega al worker (R1, R11, R13) el guardian aborta en rojo antes del primer caso; si alguien
toca uno de los 23 intocables o mete una dependencia (R22, R23, R24) el diff lo enseña y la
guardia muerde. Todos esos son rojos ruidosos, no silencios.

**Huecos: 10 + 1 parcial** — R7, R8, R9, R12, R14, R15, R16, R26, R27, R29, y la guarda 1 de R30.
Lo que tienen en comun: **romperlos deja el gate verde**. Una base que deja de borrarse no pone
nada en rojo (se acumula en el servidor); un `_setup.ts` debilitado devuelve exactamente el bug
del que viene la ficha, en silencio; un `status` roto pierde el aviso sin que nadie se entere; y
el barrido —codigo que ejecuta `DROP DATABASE`— no tiene una sola linea de test automatico detras
de sus cinco guardas.

Es el mismo argumento que el implementer escribio en su seccion 5 para justificar
`nombres-y-huella.test.ts` («una medicion manual no vuelve a correr nunca»). Aqui lo aplico
entero: se aplico a R4/R5/R6/R28/R31 y se quedo a medias.

## 3. Hallazgos MAYORES (bloqueantes)

### M1. R12 — el guardian que sostiene toda la ficha no tiene test automatico
- **Donde:** `tests/integration/_setup.ts` (archivo entero, en especial `:58-87`); mapa de
  `progress/impl_QC-77-*.md:113`, que lo marca **MED** (T7).
- **Que pasa:** `_setup.ts` es la unica red que convierte «la URL no se propago» en un rojo, en
  vez de en «los 41 archivos contra la base de desarrollo, en verde». Si alguien lo borra, lo
  relaja o cambia el patron, **nada se pone rojo**: la ficha vuelve al estado del que salio y el
  gate no lo dice. El propio `design.md > 4` reconoce que la propagacion de entorno es «una
  propiedad del pool, no un contrato escrito».
- **Sostenido con:** el guardian **funciona** —lo ejercite importandolo con `DATABASE_URL`
  apuntando a `QuimiCloude`, y aborto nombrando la base—, y esa misma linea demuestra que **es
  trivial de automatizar**.
- **Que falta:** un test (proyecto `node`, sin base) con los cuatro desenlaces que el codigo ya
  distingue: base de desarrollo, base `qct_` de **otra** corrida, `QC77_RUN_DATABASE` ausente y
  `DIRECT_URL` descuadrada. Probablemente pida extraer la comprobacion a una funcion pura que
  `_setup.ts` invoque.

### M2. R26, R27, R29 y la guarda 1 de R30 — el barrido borra bases y no tiene test
- **Donde:** `tests/helpers/test-database.ts:854-905` (`verdictFor`, las cinco guardas) y
  `:960-970` (`dropSweptDatabase`); `scripts/test-db.ts:210-237` (`clean --force`).
- **Que pasa:** es el unico codigo de la ficha que **destruye** datos y su cobertura es
  `progress/qc77-mediciones/T11.md`: cinco fixtures montados a mano, una vez. `verdictFor` **no
  esta exportado**, asi que hoy ni siquiera se puede probar sin servidor. Reordenar las guardas
  —o colocar un `safe(...)` antes de la guarda 1— borraria la base de desarrollo con el gate en
  verde. R30 solo esta automatizado de refilon (`classifyDatabaseName('QuimiCloude') ===
  'unknown'`), que es la guarda **2**, no la 1: si la base de desarrollo se llamara algun dia con
  forma `qct_`, lo unico que la salva es la guarda 1, sin test.
- **Sostenido con:** lectura del codigo + `pnpm run db:test list` (39 bases, 9 SAFE, las 21
  heredadas intactas) + el hallazgo 10 de la bitacora: `--force` no tiene filtro, es todo o nada.
- **Que falta:** exportar el juicio y probarlo con contexto inyectado (base de desarrollo con
  nombre `qct_`, nombre desconocido, conexiones abiertas, worktree vivo, git ilegible -> cinco
  HOLD con su razon; y un caso positivo -> SAFE). Es la tabla de T11, pero corriendo en cada gate
  y sin tocar Postgres.

### M3. R7, R8, R9 — el ciclo de vida de borrado no tiene test automatico
- **Donde:** `tests/helpers/test-database.ts:335` (`dropRunDatabase`), `:370`
  (`dropRunDatabaseSync`), `:631` (`destroyRunDatabase`), `:677`
  (`reclaimAbandonedDatabases`); `tests/integration/_global-setup.ts:99-163`.
- **Que pasa:** si el teardown deja de borrar, **el gate sigue verde** y el sintoma es un
  servidor que engorda. Es el fallo que esta ficha vino a arreglar, del reves.
- **Sostenido con:** **lo automatice yo en diez lineas mientras revisaba** (crear base, falsear el
  pid del rastro, `reclaimAbandonedDatabases` la borro y lo dijo), asi que «no se puede
  automatizar» no se sostiene para R9 ni para R7. Para R8 el Ctrl-C real no se automatiza, pero
  si se automatiza lo que importa: que `dropRunDatabaseSync` borre de verdad y que **siga siendo
  sincrona** (`spawnSync`), que es la propiedad que la bitacora dice que no se puede perder.
- **Que falta:** un test que cree una base desde la plantilla, la borre por los dos caminos y
  afirme contra `pg_database` que ya no existe; mas el del rastro huerfano.

### M4. R14, R15, R16 — el aviso del gate no tiene test automatico
- **Donde:** `scripts/test-db.ts:119-142` (`commandStatus`); `init.sh:133-174` (bloque `6.c`).
- **Que pasa:** los tres desenlaces («al dia», «va N atras», «no se pudo consultar») estan
  medidos una vez en `progress/qc77-mediciones/T12.md` y ya. `docs/verification.md > Cuando lo que
  verificas es el gate mismo` pide probar que cada validacion nueva **muerde**; probarlo una vez a
  mano no es dejarlo probado. R15 es el mas delicado: el dia que alguien quite el `|| true` o
  toque el `set -e`, el estado de una base local empezaria a tumbar el gate de todos.
- **Sostenido con:** reproduje los tres desenlaces y los tres dan **rc=0** (seccion 0): el
  comportamiento es correcto **hoy**. El hueco es que nada lo sostiene manana.
- **Que falta:** `pendingMigrations` ya devuelve una union discriminada, asi que el formateo de
  los tres mensajes es puro en cuanto se separe de la consulta: un test de los tres textos y del
  codigo de salida. Como minimo, el desenlace «no legible» (R16).

> **Los cuatro son la misma deuda** y se cierran con uno o dos archivos de tests (uno puro y otro
> con base real, este ultimo declarado en `tests/integration/aislamiento.json` — lo cual, de paso,
> ejercita la guardia). **No pido rehacer nada de lo que ya funciona.**

## 4. Hallazgos MENORES

1. **Referencias colgadas a archivos que no existen.** `tests/integration/_global-setup.ts:21`,
   `tests/integration/_setup.ts:11` y `:54`, y `tests/unit/test-database/nombres-y-huella.test.ts:62`
   y `:252` citan `progress/_qc77_T4.md`, `progress/_qc77_T3.md` y `progress/_qc77_unit-nombres.md`.
   Las mediciones acabaron en `progress/qc77-mediciones/{T4,T3,unit-nombres}.md`. Comprobado:
   `ls progress/_qc77_T4.md` -> no existe. Lo delicado es **`_setup.ts:54`**: esa ruta va dentro
   del **mensaje de error en tiempo de ejecucion** del aborto de R12, asi que la primera persona
   que lo lea, lo leera roto.
2. **Nada esta commiteado.** Los doce archivos viven en el arbol de trabajo; `git diff
   origin/dev...HEAD` solo trae los tres del spec. Consecuencias reales: (a) en mi corrida de
   `--rapido`, `test:rapido` selecciono **cero** tests relacionados («el diff vs origin/dev no
   toca codigo con tests»), o sea que el modo rapido no cubrio nada de esta ficha salvo las
   guardias; (b) la comprobacion de alcance de la bitacora se hizo sobre el arbol, no sobre el
   diff. No cambia el veredicto —lo verifique yo con `git status` y recorriendo el arbol— pero
   hay que commitear antes de F2.3.
3. **`design.md > 2` sigue diciendo «`main` si se corre desde el worktree principal»** y el codigo
   no hace eso (`test-database.ts:194-201`: la clave sale del **nombre del directorio**, asi que
   desde `labs` sale `qct_labs_...`; `main` es el ultimo recurso cuando la sanitizacion deja la
   cadena vacia). La divergencia esta declarada (bitacora 6.3) y el test fija el comportamiento
   real (`nombres-y-huella.test.ts:60-66`). **Texto viejo, comportamiento correcto**: corrijase el
   `design.md`.
4. **Las cinco divergencias con el `design.md` viven solo en la bitacora** (6.1-6.5: borrado
   sincrono, `QC77_RUN_DATABASE`, nombre provisional de la plantilla, `main`/`labs`, las 28 filas
   de `_prisma_migrations`). Estan escritas, que es lo que exige la regla, pero el `design.md` es
   el documento que sobrevive a la ficha: un addendum de cinco lineas evita que el siguiente lea
   un diseño que ya no describe el codigo.
5. **R10 sin prueba de punta a punta**, y me parece **bien resuelto**: hacerlo de verdad exigia
   correr integracion desde un worktree que no tiene la libreria, o sea **ensuciar la base de
   desarrollo a proposito para «probar» el arreglo**. Lo acepto. La cobertura por partes es real
   (identidad `<wt8>` distinta por worktree, con test automatico; dos corridas simultaneas del
   mismo worktree medidas; guarda 3 reteniendo bases con conexiones abiertas). Queda como deuda
   nombrada: se cierra sola cuando la ficha este en `dev` y dos worktrees la tengan.
6. **El archivo de test que no estaba en `tasks.md`** (`tests/unit/test-database/nombres-y-huella.test.ts`,
   18 casos): **lo acepto**. Amplia verificacion, no alcance — es puro, no toca la base, no anade
   dependencias, no roza ninguno de los 23 intocables, y convierte R4/R5/R6/R28/R31 en algo que
   vuelve a correr. Es menor solo por la forma: `tasks.md` lista «archivos que toca» como contrato
   de conflicto entre features y **no se actualizo**, cuando `tasks.md:3-6` dice «si una task acaba
   tocando un archivo que no esta listado, se anota antes de seguir».
7. **`QC77_RUN_DATABASE` esta justificado, no es un atajo.** R12 pide «la base de **esta**
   corrida», y con solo el prefijo `qct_` la base efimera de otra corrida pasaria el filtro: en
   `_setup.ts:68-76` las dos comprobaciones son distintas y la segunda solo es posible con el
   canal. Encaja con `design.md > 13` (toda la resolucion de nombres por un sitio). Lo unico que
   le falta es figurar en el `design.md` (menor 4).
8. **Las 28 filas de `_prisma_migrations` de la plantilla son correctas.** Verificado por mi: 28
   totales y **27** con `rolled_back_at IS NULL AND finished_at IS NOT NULL`, y el esquema de la
   plantilla es **identico** al de la base de desarrollo en columnas, indices, constraints,
   triggers y flags de RLS. La fila de mas es el intento fallido de QC-49 que la receta de dos
   pasos marca como revertido: **no esconde una plantilla a medias**. Nota para el futuro: toda
   comparacion de migraciones tiene que filtrar igual, y hoy eso solo lo sabe `pendingMigrations`
   (`test-database.ts:714-738`).

## 5. Lo que he comprobado que NO paso (los riesgos caros de esta ficha)

- **Ninguna base viva borrada.** Las 21 heredadas `QuimiCloude_QC<n>` siguen en pie. Los worktrees
  vivos hoy son `labs`, QC-23, QC-77, QC-87 y QC-96 (`git worktree list`) y no falta ninguna de
  sus bases. `QuimiCloude_QC85` sale SAFE porque QC-85 se mergeo y su worktree y su rama
  desaparecieron durante la implementacion: **es la guarda 4 acertando, no un falso SAFE**. Y no
  se barrio nada: `clean --force` no lo ejecuto ni el implementer ni yo.
- **`QuimiCloude` intacta.** Conteo de sus 20 tablas antes y despues de correr el test que hace
  `company.deleteMany({})`: identico, sin una sola fila de diferencia.
- **Ningun archivo de `tests/integration/**` modificado.** `git diff --name-only` sobre `tests/`,
  `app/`, `lib/`, `components/`, `db/` y `e2e/` devuelve **vacio**: los 41 archivos —23 de ellos
  intocables por la decision 3— estan como estaban, y ningun test ajeno perdio expectativas
  porque **ningun test ajeno se toco**. El censo declara 18 + 23 = 41 y el arbol tiene 41.
- **Cero residuo mio**: la mutacion de la guardia, los scripts temporales y las bases que cree
  estan borrados; `git status` coincide exactamente con el de la bitacora, `.qc-test-db/` esta
  vacio y `pnpm run db:test list` no muestra ninguna base `qct_` de corrida.

## 6. Lo que choca con `dev`, y no es defecto de la rama

Separado a proposito: la rama parte de `fedcbf6` y `origin/dev` va 15 commits por delante (ultimo,
el merge de QC-85 / PR #64). La sincronizacion es F2.3 y va despues de esta revision.

- **Si alguno de esos 15 commits anadio archivos bajo `tests/integration/**`, la guardia del censo
  los pondra en rojo** hasta que se declaren en `tests/integration/aislamiento.json`. Eso es la
  guardia haciendo su trabajo, no una regresion — y la respuesta es declararlos, no aflojarla.
- **La huella de la plantilla cambiara** si el merge trae migraciones nuevas o toca
  `scripts/seed.ts`: la primera corrida de integracion post-merge pagara ~40 s construyendo una
  plantilla nueva. Es el diseño funcionando.
- Todo lo medido aqui —mio y del implementer— **vale sobre `fedcbf6`**. El gate que cuenta es el
  de despues del merge (T18).

## 7. Veredicto

**RECHAZADO.** Vuelve al implementer con un encargo acotado: **cerrar M1-M4**, es decir, dar test
automatico a los diez requisitos que hoy solo tienen medicion manual (R7, R8, R9, R12, R14, R15,
R16, R26, R27, R29 y la guarda 1 de R30), y de paso los menores 1, 3, 4 y 6 (referencias colgadas,
`design.md > 2`, addendum de divergencias, `tasks.md`).

No hay que rehacer nada: la ficha **funciona, y lo he medido yo** — 630/630 sobre base efimera,
los 13 rojos de la linea base desaparecidos, base de desarrollo intacta, esquema identico al de
una base al dia, borrado al terminar, guardian y guardia mordiendo. Lo que falta es que el arnes
se entere solo el dia que deje de funcionar, que es literalmente lo que esta ficha vino a
enseñarle al repo.
