# QC-77 — aislamiento-de-la-base-en-tests-de-integracion · review (F2.2)

> **Fecha** 2026-09-12 · **Rama** `feature/QC-77-aislamiento-de-la-base-en-tests-de-integracion`
> (HEAD `fedcbf6`, **sin sincronizar con `origin/dev`**, que va 15 commits por delante) ·
> **Worktree** `.worktrees/QC-77-aislamiento-de-la-base-en-tests-de-integracion`.
>
> **VEREDICTO VIGENTE (segunda pasada, F2.3): OK.** Cero mayores vivos, 3 menores sin accion
> obligada, **31 de 31 requisitos cubiertos**. El detalle de esta segunda pasada esta en la
> **seccion 8**, al final; lo de abajo es la primera pasada, que se deja entera para que se vea
> que cambio.
>
> ---
>
> **Primera pasada (F2.2) — Veredicto: RECHAZADO.** 4 hallazgos mayores (todos de **trazabilidad**: requisitos sin
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

---

# 8. SEGUNDA PASADA (F2.3, 2026-09-12) — veredicto **OK**

La rama ya no esta sin commitear: **7 commits** sobre `fedcbf6` (`1d9c389`, `559041e`, `ae6e881`,
`ea47b9f`, `a9ad3fb`, `e7b69b7`, `ca3259f`), arbol limpio, **39 archivos** en el diff contra
`origin/dev`. Sigue sin haber una sola ruta bajo `app/`, `lib/`, `components/`, `db/` ni `e2e/`, y
`package.json` sigue ganando **solo** el script `db:test` (diff releido entero).

## 8.1 Que corri yo en esta segunda pasada

| Comando | Resultado |
| --- | --- |
| `vitest run tests/unit/test-database tests/guards/guard-aislamiento-integracion.test.ts` | **5 archivos, 57 casos verdes** (18 nombres + 8 guardian + 16 barrido + 9 aviso + 6 guardia del censo) |
| `vitest run tests/integration/infra/ciclo-de-vida-de-la-base.int.test.ts` | **5/5 verde** sobre su base efimera, borrada al terminar |
| `vitest run --project integration` | **42/42 archivos, 635/635 casos, VERDE** (65 s), base `qct_qc77_7a512e99_mtyppdxx_qtw`, borrada al terminar. El archivo nuevo **no rompio a ninguno de los 41** |
| `./init.sh --rapido` | **rc=0**; ahora el grafo **si** selecciona la ficha: **6 archivos / 62 casos** relacionados (antes cero) mas **33 guardias**; bloque `6.c` en verde; base efimera creada y borrada |
| `pnpm run db:test list` y conteo de las 20 tablas de `QuimiCloude` | 39 bases, **las 21 heredadas intactas**, unica `qct_` viva la plantilla; **la base de desarrollo identica** a la de la primera pasada despues de cuatro corridas de integracion |
| Censo contra arbol | `aislamiento.json` 18 mas 24 = **42**; el arbol tiene **42** archivos `.int.test.ts` |
| `git log fedcbf6..HEAD` sobre `requirements.md` | **vacio**: el bloque de Alcance, las dos preguntas abiertas y las 11 decisiones del humano **no se tocaron** |

## 8.2 Las mutaciones que repeti yo (no me creo las diez de la bitacora)

Todas con copia previa (`cp`), restauracion desde esa copia y **md5 comprobado** al volver
(`2b698ebb1b6ce9b78f77b1f6d7fb0ae7`), con `git status` limpio despues de cada una.

| # | Mutacion | Resultado |
| --- | --- | --- |
| 1 | **Guarda 1 borrada** de `verdictFor` — lo unico que protege `QuimiCloude` si algun dia se llamara con forma `qct_` | **ROJO, 3 casos**: «retiene la base de desarrollo aunque su nombre sea un qct_ valido», «retiene tambien la segunda URL», «gana sobre las demas» |
| 2 | **Guarda 1 reordenada** al final de la rama `run`, o sea dejando sin proteger la forma heredada | **ROJO, 1 caso**: «retiene tambien la segunda URL de desarrollo» |
| 3 | **Guarda 1 movida detras de las guardas 2 y 3**, sin dejar de proteger nada | **VERDE**, y es lo correcto: mutacion **equivalente**, la base de desarrollo sigue retenida. Ver la nota de 8.5 |
| 4 | `reclaimAbandonedDatabases` **sin el filtro de `worktreePath`**, o sea borrando rastros de OTRO worktree | **ROJO, 1 caso**: «control negativo: no toca la base de otro worktree ni la de un pid vivo (R9)» |
| 5 | Un export nuevo con nombre en castellano en `test-database.ts` | **ROJO**: «exporta solo identificadores escritos en ingles» — R31 sigue mordiendo con la superficie ampliada |

Las dos que el leader pidio expresamente —la guarda 1 y el filtro de worktree— **muerden las dos**.
Ninguna se quedo verde debiendo estar roja.

## 8.3 Los cuatro mayores, uno a uno

- **M1 (R12) — CERRADO.** El juicio salio a `tests/helpers/run-database-guard.ts`, funcion **pura**
  que recibe el entorno y devuelve el mensaje; en `_setup.ts` queda solo el `throw`. Lei los dos
  archivos: el comportamiento es **identico** al que ejercite en la primera pasada, orden de
  desenlaces incluido. `guardian-r12.test.ts` cubre los cinco abortos mas dos verdes, y los seis
  rojos afirman ademas que **el mensaje nombra la base encontrada**, que es lo que R12 exige
  literalmente. El caso verde impide el fallo clasico de un guardian que aborte siempre.
- **M2 (R26, R27, R29, guarda 1 de R30) — CERRADO.** `verdictFor` y `VerdictContext` exportados.
  **Verifique linea a linea que el orden de las guardas NO cambio** respecto de lo que lei en la
  primera pasada: 1 desarrollo, 2 desconocido, 3 conexiones, plantillas, 5 git ilegible, 4 dueno
  vivo, con los mismos textos de razon. Los 16 casos cubren las cinco guardas, las dos reglas de
  plantilla, dos SAFE positivos y `dropSweptDatabase` rechazando un nombre desconocido **antes de
  abrir conexion** (lo mide apuntando a un puerto muerto: si la validacion se moviera detras, el
  error seria de red y el caso se pondria rojo). Las mutaciones 1, 2 y 4 lo confirman.
- **M3 (R7, R8, R9) — CERRADO.** `ciclo-de-vida-de-la-base.int.test.ts` no se cree a la libreria:
  pregunta a **`pg_database`** despues de cada borrado, y afirma tambien que la base **existia
  antes**, sin lo cual un `createRunDatabase` que no creara nada dejaria el caso verde por
  vacuidad. El caso de R8 mide lo que importa —que `dropRunDatabaseSync` **no devuelve promesa** y
  que la base ya no esta **sin ningun `await` intermedio**—, que es la propiedad que el handler de
  Vitest vuelve critica. R9 trae **control negativo doble** (otro worktree, pid vivo) y usa
  directorios temporales para no poder tocar la base de la corrida viva; el `afterAll` comprueba
  contra el catalogo que no dejo nada. Corri el archivo y `db:test list` justo despues: cero bases
  sueltas.
- **M4 (R14, R15, R16) — CERRADO.** El formateo salio a `describePendingMigrations` (puro) y
  `commandStatus` solo imprime. Los nueve casos cubren los tres desenlaces, que la «mas antigua»
  se elige **ordenando** y no cogiendo `pending[0]`, y **tres que leen `init.sh` como texto**: que
  el bloque `6.c` conserva su `|| true`, que su **unico** `fail` es el del script ausente, y que el
  `else` imprime con `warn`. Es justo lo que faltaba: R15 deja de depender de que nadie toque siete
  caracteres sin que nada se entere.

## 8.4 Las dos cosas que el implementer declaro solo, juzgadas

1. **El subagente que edito `tests/helpers/test-database.ts` fuera de su carril**
   (`progress/qc77-mediciones/M3.md > 8`): declarado sin maquillar, incluido el riesgo que el
   propio agente no podia descartar. **Comprobado en disco por mi, y no se perdio nada.** Siguen en
   pie los tres cambios de F2.3 —`verdictFor` y `VerdictContext` exportados (`:896`, `:910`) y
   `describePendingMigrations` con su `sort()` (`:776-800`)— y **todos** los marcadores de F2.1:
   `dropRunDatabaseSync` con `spawnSync` (`:370-395`), el rename de la plantilla provisional
   (`:552`), el reintento ante `55006` (`:613`), `WITH (FORCE)`, `pg_advisory_lock` (`:534`), el
   filtro `rolled_back_at IS NULL AND finished_at IS NOT NULL` (`:737`) y el filtro de
   `worktreePath` (`:693`). El archivo paso de 971 a 1026 lineas: **solo crecio**. Y lo que hace
   que esto deje de ser un riesgo abierto es que ahora hay tests encima: si el `sort()` se hubiera
   perdido en una de esas ventanas, «elige la mas antigua de verdad» estaria rojo, y esta verde.
   **Proceso mejorable, resultado intacto: menor, sin accion.**
2. **Los seis requisitos que se cubren «por el criterio» (R2, R3, R11, R13, R25 y R10): los
   acepto**, y no es una concesion nueva — son los mismos que ya acepte en la primera pasada
   (seccion 2, «Cubiertos»). Si la plantilla no se construye o se copia mal, se caen los 635 casos;
   si la URL no llega al worker, el guardian aborta antes del primer caso, **y ahora ese guardian
   tiene sus propios tests**, que es lo que le faltaba al razonamiento para sostenerse. R10 sigue
   siendo cobertura por partes y deuda nombrada: se cierra sola cuando dos worktrees tengan la
   ficha.

## 8.5 Estado de los hallazgos de la primera pasada

| Hallazgo | Estado |
| --- | --- |
| **M1, M2, M3, M4** (mayores) | **CERRADOS**, verificados corriendo y mutando |
| menor 1 — referencias colgadas | **CERRADO**: un `grep` de `_qc77_` en `tests/` y `scripts/` no devuelve nada; la que viajaba dentro del mensaje de error de R12 apunta ahora a `progress/qc77-mediciones/T4.md` |
| menor 2 — sin commitear | **CERRADO**: 7 commits, arbol limpio, y `--rapido` pasa de 0 a 62 casos relacionados |
| menor 3 — `design.md > 2` | **CERRADO**: el parrafo describe el comportamiento real y anota la correccion |
| menor 4 — divergencias solo en la bitacora | **CERRADO**: `design.md > 14` con las cinco, mas la nota sobre la guarda 4 |
| menor 6 — `tasks.md` | **CERRADO**: los seis archivos anotados con su fase y su porque |
| menor 5 — R10 por partes | **Vivo, sin accion**: aceptado y nombrado como deuda |
| menor 7 — `QC77_RUN_DATABASE` | **Vivo, sin accion**: justificado, y ya figura en `design.md > 14` |
| menor 8 — 28 filas de `_prisma_migrations` | **Vivo, sin accion**: correcto, y ya figura en `design.md > 14` |

**Menores nuevos de esta pasada: ninguno.** Solo una nota, por precision: el caso «gana sobre las
demas» dice fijar el **orden** de las guardas, y mi mutacion 3 enseña que lo que fija de verdad es
algo distinto y mas util — que la guarda 1 **dispare antes de cualquier `safe(...)`**. Las
reordenaciones que si hacen daño (mutaciones 1 y 2) se ponen rojas. El comentario promete una cosa
y el test protege otra ligeramente distinta; no hay hueco.

## 8.6 Checklist de `CHECKPOINTS.md`, revisado

Todo lo de la seccion 1 sigue igual salvo lo que se movio:

- [x] **Trazabilidad — cada `R<n>` mapea a un test concreto. 31 de 31.** Los diez huecos (R7, R8,
      R9, R12, R14, R15, R16, R26, R27, R29) y la guarda 1 de R30 tienen ahora test que vuelve a
      correr en cada gate, y lo he mutado para comprobar que muerde.
- [x] `typecheck` y `lint` en verde (dentro de `./init.sh --rapido`, rc=0).
- [ ] `tasks.md` con todas `[x]` — **17 de 18**; T18 sigue siendo del leader.
- [ ] `./init.sh` completo en verde — **T18, y despues del merge con `dev`**.
- [x] `progress/review_<feature>.md` con veredicto **OK**.
- [ ] `progress/history.md` y desmontaje del worktree: fases posteriores.

## 8.7 Veredicto de la segunda pasada

**OK.** Cero mayores vivos; tres menores vivos que **no piden accion** (R10 por partes,
`QC77_RUN_DATABASE` y las 28 filas de `_prisma_migrations`, los tres aceptados y ya escritos en el
`design.md`). **31 de 31 requisitos cubiertos** por algo que vuelve a correr.

Lo que cambio entre las dos pasadas no fue la funcionalidad —esa ya estaba— sino que el arnes se
entere solo el dia que deje de funcionar. Cinco mutaciones mias lo confirman: se rompe lo que la
ficha protege y el gate se pone rojo nombrando que se rompio.

**Sigue faltando T18** (`./init.sh` completo, sin banderas, **despues** del merge con `dev`), que
no es mio: esta ficha toca `init.sh` y `scripts/`, justo lo que el modo rapido se niega a cubrir. Y
sigue en pie el aviso de la seccion 6: si los 15 commits de `dev` traen archivos nuevos bajo
`tests/integration/`, la guardia del censo los pondra en rojo hasta que se declaren — eso es la
guardia trabajando, no una regresion.
