# QC-77 — aislamiento-de-la-base-en-tests-de-integracion · bitacora de implementacion

> **Fase** F2.1 (implementer) · **Fecha** 2026-09-12 · **Rama**
> `feature/QC-77-aislamiento-de-la-base-en-tests-de-integracion` · worktree
> `.worktrees/QC-77-aislamiento-de-la-base-en-tests-de-integracion`, partiendo de `fedcbf6`.
>
> **Esta bitacora NO se autoaprueba.** El veredicto lo da el `reviewer`, y el gate completo
> (`./init.sh` sin banderas, **T18**) lo corre el **leader**: esta ficha toca `init.sh` y
> `scripts/`, que es justo lo que `docs/verification.md` dice que el modo rapido **se niega a
> cubrir**.

## En una linea

Cada corrida de `tests/integration/**` arranca sobre **su propia base desechable**, copia de una
plantilla ya migrada y sembrada, y **borrada al terminar pase lo que pase**.

## Las 18 tasks

**17 de 18 cerradas.** La que falta es **T18**, que por enunciado **la corre el leader**, no el
implementer.

| Bloque | Tasks | Estado |
| --- | --- | --- |
| A — medir antes de construir | T1, T2, T3, T4 | `[x]` |
| B — la libreria del ciclo de vida | T5, T6, T7, T8, T9 | `[x]` |
| C — la CLI, el aviso y la guardia | T10, T11, T12, T13, T14 | `[x]` |
| D — la prueba de que sirvio | T15, T16, T17 | `[x]` |
| E — el cierre | **T18** | **pendiente del leader** |

La evidencia cruda de cada task —salidas literales, listados de bases antes y despues, mensajes de
error— vive en `progress/qc77-mediciones/`, un archivo por task. Aqui va el resumen y el mapa.

---

## 1. La puerta de diseno (T4): lo que se midio antes de construir

`design.md > 4` declaraba **un unico desconocido tecnico** y prohibia expresamente suponerlo. Se
midio con sondas temporales, y las dos respuestas decidieron lo que se escribio:

| Pregunta | Respuesta medida | Consecuencia |
| --- | --- | --- |
| ¿El worker ve un `process.env.X` puesto en el `globalSetup`? | **SI** (pool `forks`: worker `pid=37592`, `ppid=27012` = el principal, `isMainThread=true`) | Se usa el mecanismo **primario**: mutar `DATABASE_URL`/`DIRECT_URL`. **No** se usa `provide()`/`inject()` (medido que tambien funciona; queda como plan B escrito) |
| ¿Corre ese `globalSetup` con **cero** archivos del proyecto seleccionados? | **NO** (`vitest run guard` y `related` sobre un archivo sin integracion no lo ejecutan; contraste positivo con `lib/shared/db/prisma.ts`, que si) | **No se escribe el corto-circuito** de `design.md > 4`, ni variable de escape, ni se toca `scripts/test-rapido.mjs`. `--rapido` no paga ninguna copia de base salvo cuando de verdad hace falta |

**Nada contradijo al `design.md`**: confirmo su sospecha y resolvio la duda de coste en el sentido
barato. Lo que queda **fragil y escrito**: las dos respuestas dependen de que el repo **no declare
`pool`** y de Vitest 4.1.10. Si alguien declara `pool`, esta medicion **caduca** y hay que
repetirla, no deducirla.

---

## 2. Archivos creados y modificados

### Nuevos (7)

| Archivo | Que es |
| --- | --- |
| `tests/helpers/test-database.ts` | **La libreria**: nombres, huella, plantilla, crear/borrar, rastro en disco, inventario del barrido. Sin efectos al importarse |
| `tests/integration/_global-setup.ts` | `globalSetup` del proyecto `integration`: barrido de huerfanos -> plantilla -> `CREATE DATABASE` -> publica la URL -> senales -> teardown |
| `tests/integration/_setup.ts` | `setupFiles`: **el guardian de R12**. Aborta antes del primer caso si la conexion no es la base efimera de **esta** corrida |
| `tests/integration/aislamiento.json` | **El censo** de R18: los 41 archivos con su modo de aislamiento |
| `tests/guards/guard-aislamiento-integracion.test.ts` | La guardia de R19–R21 (6 casos) |
| `tests/unit/test-database/nombres-y-huella.test.ts` | 18 casos sobre las funciones **puras**. Ver seccion 5: no estaba en `tasks.md`, y por que entro |
| `scripts/test-db.ts` | La **CLI**: `status`, `template`, `list`, `clean [--force] [--incluir-plantillas]` |

### Modificados (5)

| Archivo | Cambio |
| --- | --- |
| `vitest.config.mts` | **Dos lineas** en el proyecto `integration` (`globalSetup`, `setupFiles`) + comentario. **No** se toco `testTimeout`, `fileParallelism`, ni los proyectos `ui`/`node` — QC-58 los vigila con `guard-teclear-y-plazo` |
| `init.sh` | Bloque **`6.c`**: el aviso amarillo, despues del `6.b` y antes de los tests, en los dos modos |
| `package.json` | **Una sola linea**: `"db:test": "tsx scripts/test-db.ts"`. **Ninguna dependencia** |
| `.gitignore` | `/.qc-test-db/` (el directorio de rastros) |
| `docs/verification.md` | Seccion nueva (lineas 109–195), **sin borrar** la nota del `.env`, que sigue siendo cierta |

### Comprobacion de alcance (R22, R23, R24) — hecha, no prometida

`git diff --name-only` sobre el arbol de trabajo da exactamente: `.gitignore`,
`docs/verification.md`, `init.sh`, `package.json`, `vitest.config.mts`, `specs/.../tasks.md`.
Mas los 7 nuevos de arriba y `progress/`.

- **Ninguna ruta bajo `app/`, `lib/`, `components/`, `db/` ni `e2e/`.** (R24: los E2E de Playwright
  no se tocan.)
- **Ninguno de los 41 archivos de `tests/integration/`** aparece modificado (R22: los 23 de la
  decision 3 se quedan como estan; ni uno reescrito).
- **`package.json`: solo el script `db:test`.** `dependencies` y `devDependencies` **identicas**
  (R23). `pg`, `prisma` y `tsx` ya estaban aprobadas; no hizo falta ninguna mas y **ningun
  subagente pidio una**.

---

## 3. El mapa `R<n> -> test` (los 31)

**Leelo con esta distincion, que importa:** OK = cubierto por un **test automatico** que vuelve a
correr en cada gate. MED = cubierto por **medicion ejecutada y pegada** en
`progress/qc77-mediciones/`, que **no vuelve a correr sola**. La segunda clase es legitima aqui
—crear y borrar bases, mandar un Ctrl-C real o tumbar el gate no se automatiza en un `it()`— pero
el reviewer debe saber cual es cual. La seccion 5 explica que se hizo para reducir la lista de MED.

| R | Que exige | Como queda cubierto |
| --- | --- | --- |
| **R1** | Base propia por corrida, y todas las conexiones dirigidas a ella | **OK** `nombres-y-huella` «sustituye solo el nombre de la base y conserva credenciales, host, puerto y query» · **OK** el guardian `_setup.ts` aborta si no · **MED** T15: tres corridas, tres bases distintas nombradas en la salida |
| **R2** | La base se crea como copia de una plantilla migrada y sembrada | **MED** T2 (receta a mano) · **MED** T5-T6 (`ensureTemplateDatabase` + `migrate status` al dia) · **MED** T15 seccion 3 (esquema identico al de desarrollo) |
| **R3** | Receta de dos pasos **sin modificar migraciones ni sembrado** | **MED** T2: los 4 pasos con sus salidas, paso 1 fallando en `20260911130000_inventory_company_scope` (`P3018`/`P0001`) · **OK** comprobacion de alcance: `db/` y `scripts/seed.ts` **sin cambios** |
| **R4** | Nombre = prefijo + worktree + corrida, identificador de Postgres valido | **OK** `nombres-y-huella`: «lleva el prefijo reservado...», «es un identificador de Postgres valido en todos los casos», «el nombre de la plantilla es el prefijo reservado mas la huella» |
| **R5** | Si cambian las migraciones, plantilla nueva | **OK** `nombres-y-huella`: «cambia cuando se anade una migracion», «...cuando se borra una», «...cuando cambia el contenido de una», «...cuando cambia el sembrado» (4 casos, sobre un arbol copiado a tmp) |
| **R6** | Si no cambian, se reutiliza sin migrar ni sembrar | **OK** `nombres-y-huella` «son 12 hex y no cambia si no cambia nada del arbol» · **MED** T5-T6: 1a llamada 39 954 ms, 2a **109 ms** · **MED** T15/T16: `plantilla reutilizada` en todas las corridas |
| **R7** | Borrar al terminar, sea verde, roja o abortada | **MED** T7 (verde, 47/47) · **MED** T8-1 (**roja**, rc=1, base borrada igual) · **MED** T15 (3 corridas) · **MED** T16 (incluida una corrida roja por flake ajeno: **borro su base igual**) |
| **R8** | Borrar ante SIGINT/SIGTERM | **MED** T8-2: **Ctrl-C real** (`CTRL_C_EVENT`) a los 25 s -> `recibido SIGINT: borrando...` · **MED** repetido tras la deduplicacion (`dedup-senal.md`) |
| **R9** | Si una corrida murio sin borrar, la siguiente la borra **y lo dice** | **MED** T8-3: `taskkill /F /T` deja la base; la corrida siguiente imprime `borrada ...n34: la dejo la corrida del pid 29920 ..., que ya no esta viva` |
| **R10** | Dos worktrees solapados no se pisan | **OK** `nombres-y-huella`: «da identidades distintas a worktrees distintos», «es estable», «no colisiona entre dos corridas del mismo worktree» · **MED** T9: dos corridas simultaneas, 117 casos, cada una borra la suya. **Limitacion honesta: no se corrio desde un segundo worktree** (ver 6.12) |
| **R11** | Misma regla en `./init.sh` y en `--rapido` | **MED** T15 (proyecto entero) · **MED** T16: caso 1 crea y borra base efimera nombrada; caso 2 **no crea ninguna** |
| **R12** | Abortar antes del primer caso, **nombrando la base encontrada** | **MED** T7: dos desenlaces probados — apuntando a `QuimiCloude` y apuntando a **otra** base `qct_`. Los dos mensajes nombran la base |
| **R13** | La base de desarrollo queda igual que antes | **MED** T15 seccion 2: conteo por tabla de las **20** tablas antes y despues, `diff` **sin diferencias**, repetido una tercera vez |
| **R14** | Aviso amarillo: cuantas faltan y la mas antigua | **MED** T12(a): `va 3 migracion(es) atras; la mas antigua que falta es 20260911120000_presentation_unit` |
| **R15** | El aviso **no** altera el codigo de salida | **MED** T12(a)(b)(c): **exit 0** en los tres. El `|| true` del bloque `6.c` esta puesto justo para esto |
| **R16** | Si no se puede consultar, avisa y el gate sigue | **MED** T12(c): host inexistente -> `! no se pudo consultar...: getaddrinfo ENOTFOUND` + `== init OK ==`, **exit 0** |
| **R17** | El aislamiento test a test de QC-4/QC-47 se conserva | **OK** los **18** archivos de `transaccion` siguen en verde en T15 (630/630) · **OK** censo y guardia · **OK** alcance: ninguno modificado |
| **R18** | Censo legible por una guardia, con el porque | **OK** guardia: «toda entrada de `commit` dice por que (`motivo`)», «...dice desde cuando (`desde`)» |
| **R19** | Archivo fuera del censo -> el gate falla nombrandolo | **OK** guardia: «ningun archivo del arbol se queda fuera del censo» · **MED** **T14(a)**: mutacion real, rojo, nombrando `identity/mutacion-t14.int.test.ts` |
| **R20** | Censo que nombra un archivo inexistente -> falla | **OK** guardia: «ninguna entrada del censo nombra un archivo que ya no existe» · **MED** **T14(b)**: rojo, nombrando `identity/role-catalog.int.test.ts` |
| **R21** | R19 y R20 corren tambien en `--rapido`, sin depender del grafo | **OK** la guardia vive en `tests/guards/`, seleccionada por patron `guard` · **MED** T16: **32/32 guardias** en el caso 2, donde el grafo no selecciono nada |
| **R22** | Los 23 archivos **no** se modifican | **OK** comprobacion de alcance: cero archivos de `tests/integration/` en el diff |
| **R23** | Ninguna dependencia nueva | **OK** `git diff package.json`: solo el script `db:test`; `dependencies`/`devDependencies` intactas |
| **R24** | No cambia la configuracion ni el ciclo de los E2E | **OK** comprobacion de alcance: `e2e/` y la config de Playwright sin tocar |
| **R25** | Mismo esquema que una base al dia, sin dobles | **MED** T15 seccion 3: 20 tablas, 175 columnas, 107 indices, **38 indices unicos parciales**, 38 FKs con `ON DELETE`, 3 disparadores, RLS `relrowsecurity`+`relforcerowsecurity`, 3 extensiones, 3 enums — **todos identicos**. Base **real**, ningun doble |
| **R26** | `clean` sin `--force` lista con veredicto y razon, y no borra | **MED** T10 (tabla completa de 39 bases) · **MED** T11: `dry-run: NO se borro ninguna base`, `list` posterior identico |
| **R27** | `clean --force` borra **exactamente** las juzgadas borrables | **MED** T11 caso positivo: un solo SAFE, `borrada qct_t11_c0ffee11_x1`, `list` baja de 45 a 44 |
| **R28** | Reconoce las **dos** formas de nombre | **OK** `nombres-y-huella`: «reconoce las bases de corrida y las plantillas», «reconoce la forma heredada `QuimiCloude_QC<n>`» |
| **R29** | Ante la duda, **retiene** y dice por que | **MED** T11: **las cinco guardas**, una por fixture, cada una HOLD con su razon. La guarda 5 (git inaccesible) devolvio `45 base(s): 0 borrable(s)` — **ningun falso SAFE** |
| **R30** | Nunca borra la base de desarrollo, aunque el nombre encaje | **OK** `nombres-y-huella` «deja como desconocido todo lo demas, incluida la base de desarrollo» · **MED** T11 guarda 1: un fixture con nombre `qct_` valido, apuntado como base de desarrollo -> **HOLD** |
| **R31** | Contrato del modulo con identificadores en ingles | **OK** `nombres-y-huella`: «exporta solo identificadores escritos en ingles» |

**Los 31 quedan mapeados.** 12 tienen test automatico, 19 tienen medicion pegada, y 7 tienen las
dos cosas.

> **AVISO: esta tabla es del estado de F2.1 y el reviewer la RECHAZO por ella.** Once de esas
> celdas eran **MED sola**, y romper el requisito dejaba el gate verde. **Se cerraron en F2.3 con
> tests automaticos: ver la seccion 9**, que es la que vale hoy. La tabla se deja tal cual —no se
> reescribe— porque el rechazo y su motivo son parte del registro.

---

## 4. Las corridas, y sus salidas

### T15 — los 41 archivos, tres veces (la prueba de que la ficha sirvio)

| # | Archivos | Casos | Veredicto | Duracion | Base efimera |
| --- | --- | --- | --- | --- | --- |
| 1 | **41/41** | **630/630** | VERDE (rc=0) | 155,58 s | `qct_qc77_7a512e99_mtymv80l_ijk` |
| 2 | **41/41** | **630/630** | VERDE (rc=0) | 167,00 s | `qct_qc77_7a512e99_mtymysuo_piw` |
| 3 | **41/41** | **630/630** | VERDE (rc=0) | 104,57 s | `qct_qc77_7a512e99_mtyn2m8v_eak` |

Tres nombres distintos, las tres reutilizando `qct_tpl_1db8043a68e0`, y al terminar cada una **su
base ya no existe**. `.qc-test-db/` sin rastros. **Las tres identicas en archivos, casos y
veredicto** — que era la condicion, porque *una* corrida verde no es prueba
(`docs/verification.md`, la leccion de `--maxWorkers=2`).

### La linea base (T1), y que paso con ella

Antes de la ficha, contra `QuimiCloude` compartida y sucia:

| Archivo | Antes (T1) | Despues (T15) |
| --- | --- | --- |
| `identity-constraints.int.test.ts` | 47 casos, **1 rojo** — esperaba `document_types = ['CC']` y encontraba **38 filas `DOC*`** residuales | **47/47 verde** |
| `identity-seed.int.test.ts` | 14 casos, **12 rojos** — los 12 con `Foreign key constraint violated` en `company.deleteMany({})` | **14/14 verde** |
| **total** | **61 casos, 13 rojos** | **61/61 verde** |

Y el `23505` de `(order_year, order_sequence)` que QC-58 T11 dejo atribuido a esta ficha: **no
aparecio**. Busqueda explicita de `23505`, `duplicate key`, `order_sequence`, `Unique constraint`,
`FAIL` y `AssertionError` en las tres salidas completas: **0 coincidencias**.

Importante, y a favor del diagnostico del spec: **T1 tambien midio que esos dos archivos no dejan
residuo** (conteo por tabla identico antes y despues). Lo que los rompia no era lo que ellos
ensucian, sino **el estado con el que la base ya llegaba** — 48 companies, 51 roles, 40 users, 39
document_types. Exactamente lo que decia el bloque de Alcance.

### T16 — `./init.sh --rapido`, los dos casos

| Caso | Diff | Exit | Base efimera | Guardias | Bases `qct_` sobrantes |
| --- | --- | --- | --- | --- | --- |
| 2 (natural: solo `.md`) | sin tests de integracion | **0** | **ninguna creada** | 32/32 | 0 |
| 1 (provocado: `lib/shared/db/prisma.ts`) | 146 archivos relacionados | **0** | `qct_qc77_7a512e99_mtyo7zun_kps` | si | 0 |

Bloque `6.c` en las dos: `base de desarrollo «QuimiCloude» al dia: 27 migracion(es) aplicada(s)`.

### Las pruebas de que el gate MUERDE

`docs/gate.md > Cuando lo que verificas es el gate mismo` rige entera esta ficha. **Todo
check nuevo se probo con su caso verde y con uno por motivo de fallo**, rompiendo el archivo real
y restaurando **desde copia (`cp`)**, nunca con `git checkout`:

| Que | Desenlaces probados |
| --- | --- |
| **La guardia del censo** (T14) | (a) archivo fuera del censo -> rojo · (b) entrada sin archivo -> rojo · (c) `commit` sin `motivo` -> rojo · (d) `commit` sin `desde` -> rojo · **control negativo**: arbol intacto -> verde |
| **El aviso de `init.sh`** (T12) | (a) base atrasada -> amarillo, **exit 0** · (b) al dia -> verde, **exit 0** · (c) host inexistente -> aviso, **exit 0** · (d) `scripts/test-db.ts` renombrado -> **exit 1** nombrandolo |
| **El barrido** (T11) | 5 fixtures, uno por guarda, **los cinco HOLD con su razon** + 1 huerfana que con `--force` **si** desaparece |
| **El guardian R12** (T7) | apuntando a `QuimiCloude` -> aborta · apuntando a otra `qct_` -> aborta. Los dos nombran la base |
| **Los tests unitarios** | 4 mutaciones de la libreria -> 4 rojos (md5 del helper identico al original tras restaurar) |

Los codigos de salida se leyeron **redirigiendo a fichero y mirando `$?`**, nunca por una tuberia.

---

## 5. Una decision que tome yo, y por que

**`tests/unit/test-database/nombres-y-huella.test.ts` (18 casos) no estaba en `tasks.md`.**

Al construir el mapa de la seccion 3 quedo a la vista que R4, R5, R6, R28, R30 y R31 iban a
apoyarse **solo** en mediciones manuales. Una medicion manual **no vuelve a correr nunca**: el dia
que alguien cambie la forma de un nombre o la huella, nada se entera, y `CHECKPOINTS.md >
Trazabilidad` pide un **test concreto** por requisito.

Las funciones afectadas son **puras** —`design.md > 10` las declara «puro, testeable sin base»—,
asi que el test no toca Postgres, cae en el proyecto `node`, no anade dependencias, no modifica la
libreria y no roza ninguno de los 23 archivos intocables. **Amplia la verificacion, no el
alcance.** Lo anoto explicitamente porque **no** viene del `tasks.md` aprobado y el reviewer debe
poder rechazarlo.

Tambien deduplique el `DROP DATABASE` sincrono del camino de senal (`dedup-senal.md`): quedo
repetido en dos sitios porque el agente que hizo T7 no tenia permiso para editar la libreria. Ahora
vive solo en `dropRunDatabaseSync`, con el comentario del porque al lado.

---

## 6. Hallazgos y divergencias

Ninguno tumba la feature. Van todos aqui, sin maquillar.

### Divergencias con el `design.md`

1. **La capa 2 de `design.md > 5` no funcionaba tal cual escrita, y se cambio.** Vitest registra su
   propio handler de senal con `setTimeout(() => process.exit(), 1)`
   (`node_modules/vitest/dist/chunks/cli-api.*.js`, `addCleanupListeners`). **Un milisegundo**: un
   `DROP DATABASE` con `await` no llega a resolverse y el proceso se va con la base viva — medido,
   el primer Ctrl-C dejo la base en pie. El borrado del camino de senal es ahora **sincrono**
   (`spawnSync` de un `node -e` con `pg`, sin dependencias nuevas). **Convertirlo en `async` reabre
   el agujero**, y eso queda escrito en el codigo y en `docs/verification.md`.
2. **Hizo falta un canal que el design no nombraba: `QC77_RUN_DATABASE`.** R12 no pide «apunta a
   una base `qct_`» sino «apunta a **la de esta corrida**». Sin publicar el nombre, el guardian
   solo podia comprobar el prefijo, y la base efimera de **otra** corrida habria pasado el filtro.
3. **`design.md > 2` dice «`main` si se corre desde el worktree principal», y el codigo no hace
   eso**: la clave sale del **nombre del directorio**, asi que desde el principal (`labs`) el
   nombre es `qct_labs_...`; `main` solo aparece si la sanitizacion deja la cadena vacia. No es
   fallo funcional —la identidad real es el `<wt8>`— pero **el texto del design no describe el
   codigo**. El test esta escrito contra el comportamiento real.
4. **La plantilla se construye con nombre provisional y se renombra al final**
   (`qct_tplbuild_<huella>_<pid>` -> `qct_tpl_<huella>`). No estaba en el design: sin ello, un kill
   a mitad de los ~40 s dejaria una plantilla **incompleta con el nombre bueno**, que R6
   reutilizaria para siempre.
5. **`_prisma_migrations` de la plantilla tiene 28 filas, no 27.** La de mas es el intento fallido
   de la migracion de QC-49, con `rolled_back_at` puesto, y **la plantilla la arrastra a todas sus
   copias**. Toda comparacion de migraciones filtra `rolled_back_at IS NULL`. Es tambien un **falso
   positivo conocido** al comparar esquemas (R25).

### Divergencias con datos del spec

6. **Las bases heredadas eran 20 al empezar, no 21** (`design.md > 6`). La 21a aparecio durante la
   sesion (`QuimiCloude_QC96`, de otro worktree vivo). Y **`QuimiCloude_FIXGATE`**, que se parece,
   **no encaja** en `QuimiCloude_QC<n>` y cae en la guarda 2 -> HOLD. Es el comportamiento
   correcto: el patron **no se ensancho** para cogerla.
7. **El `clean --force` deja SAFE 8 de las 21 heredadas, no las 21.** La guarda 4 del design dice
   «existe un worktree o una rama `feature/QC-<n>-*`» sin precisar local o remota; se implemento
   contando **ambas**, por la regla de oro. Las ramas remotas de feature no se borran nunca tras el
   merge, asi que retienen mucho. **SAFE: QC58, QC65, QC70, QC75, QC78, QC83, QC84, QC86.** Si se
   quiere barrer mas, **es decision del humano** y se toma mirando esa lista, no relajando la
   guarda. **No se barrio ninguna heredada en esta ficha**: T11 dice «si el humano autoriza», y el
   humano no ha autorizado.

   **Y esa lista es estado vivo, no un conjunto fijo — comprobado por accidente y vale la pena
   leerlo.** Al cerrar la bitacora, `QuimiCloude_QC85` habia pasado de HOLD a **SAFE**. Parecia el
   fallo mas grave posible —un falso SAFE sobre la base de una feature viva— y se investigo como
   tal. No lo era: **mientras corria esta ficha, otra sesion mergeo QC-85 (PR #64), desmonto su
   worktree y borro su rama**, asi que la guarda 4 dejo de encontrarle dueno y acerto. Lo mismo
   explica que ahora sean **9** SAFE y no 8. Dos cosas que esto deja probadas y que ninguna task
   planifico: la guarda 4 **reacciona al estado real** en vez de a una lista escrita, y el veredicto
   de `list` **caduca** — se barre mirando la salida del momento, no una lista copiada de esta
   bitacora.

### Hallazgos del arnes, **fuera del alcance de QC-77**

8. **`scripts/test-rapido.mjs` corre las guardias solo `if (status === 0)`.** Si la primera mitad
   sale roja, **las guardias no corren**. O sea que «el rapido corre siempre todas las guardias»
   —lo que prometen `docs/verification.md` y el comentario del propio script— es cierto **solo
   hasta el primer rojo**. Medido en T16. **No se toco**: el spec prohibe expresamente tocar ese
   archivo, y arreglarlo cambia el gate de todas las features en vuelo. **Candidato a ficha.**
9. **Un worktree recien montado no pasa `pnpm run typecheck`** hasta que se corre
   `pnpm exec next typegen` (o un build): `app/layout.tsx` usa `LayoutProps`, que Next genera en
   `.next/types`, y `.next` no viaja con el worktree. Tres subagentes tropezaron con el mismo
   `TS2304` y **no es un error de codigo**. Afecta a `./init.sh` en cualquier worktree nuevo.
   **Candidato a ficha** (o una linea en `docs/worktrees.md`).
10. **`clean --force` no tiene filtro**: es todo o nada sobre los SAFE. En T11 hubo que rodearlo
    manteniendo una conexion abierta contra las 8 heredadas para que la propia guarda 3 las
    retuviera. Candidato a `--solo <base>`.
11. **`inRolledBackTransaction` no esta compartido**: cada uno de los 18 archivos lo define
    localmente. Ya lo anotaba `design.md > 0`; se confirma. No es de esta ficha (la decision 9 dice
    que el mecanismo se hereda y no se toca), pero es la deuda que hara que el proximo crea que
    existe un helper y no lo encuentre.

### Lo que **no** se pudo probar, dicho sin adornos

12. **R10 no se ejercito desde dos worktrees distintos de verdad.** Los worktrees vivos (QC-23,
    QC-85, QC-96) **no tienen** la libreria de QC-77: su proyecto `integration` no tiene
    `globalSetup`, asi que habrian corrido **contra la base de desarrollo y la habrian ensuciado**
    — o sea, provocar el bug para «probar» el arreglo. **No se hizo.** En su lugar: dos corridas
    simultaneas desde este worktree (117 casos, una de ellas con `company.deleteMany({})`, cada una
    borrando la suya) y `runDatabaseName` con tres rutas de worktree dando tres `<wt8>` distintos.
    **R10 queda cubierto por partes, no de punta a punta.** Se cerrara solo cuando la ficha este en
    `dev` y dos worktrees la tengan.
13. **La construccion concurrente de la plantilla no se ejercito borrandola** (es cache y cuesta
    ~40 s). Se probo reteniendo el `pg_advisory_lock` desde fuera 20 s: la corrida **espera** y
    luego reutiliza (20,86 s una corrida que tarda 4).
14. **`shellcheck` no esta instalado** en esta maquina; `init.sh` se verifico con `bash -n`.

---

## 7. Estado del servidor y del arbol al cerrar

- **Bases `qct_` vivas: solo `qct_tpl_1db8043a68e0`**, la plantilla. Es **cache legitima**: borrarla
  solo cuesta ~40 s de reconstruccion en la corrida siguiente.
- **`QuimiCloude` intacta** — verificada por conteo de las 20 tablas antes y despues de T15, tres
  veces.
- **Las 21 heredadas y `QuimiCloude_FIXGATE`, en pie.** No se barrio ninguna. (`list` las marca hoy
  como 9 SAFE / el resto HOLD; ver 6.7 sobre por que ese reparto cambia solo.)
- **Ninguna base ajena al proyecto tocada** (`ordenex`, `investDB`, `new_horizon_*`, etc.: todas
  HOLD por la guarda 2).
- `git status`: solo los archivos de la seccion 2. **Ningun fichero temporal**, ningun `.bak`,
  ninguna sonda. `HEAD` en `fedcbf6`; el commit temporal de T16 se deshizo con `reset --mixed` y
  `lib/shared/db/prisma.ts` se recupero **desde copia**.

## 8. Lo que falta

**T18: `./init.sh` completo, sin banderas, desde un shell limpio — lo corre el LEADER.** Condicion:
ningun archivo de test rojo fuera de `tests/baseline-rojos.json`, y **ninguna base `qct_` viva** al
terminar (`pnpm run db:test list` inmediatamente despues).

Tres avisos para quien lo corra:

- **`dev` se ha movido por debajo mientras corria esta ficha.** Este worktree parte de `fedcbf6` y
  `origin/dev` esta hoy **15 commits por delante** (ultimo: el merge de QC-85, PR #64). Entre medias
  desaparecieron los worktrees de QC-85 y QC-96 y aparecio el de QC-87. **Hay que mergear `dev`
  antes del gate y del PR**, y el gate que vale es el de **despues** del merge: lo que esta medido
  aqui lo esta sobre `fedcbf6`. Ojo especialmente a si algo de esos 15 commits anadio archivos bajo
  `tests/integration/**` — si los hay, **la guardia del censo los va a poner en rojo** hasta que se
  declaren en `tests/integration/aislamiento.json`, que es exactamente lo que la guardia vino a
  hacer, pero conviene saberlo antes de leerlo como una regresion.

- **`--rapido` no cubre esta ficha.** Toca `init.sh` y `scripts/`, justo lo que
  `docs/verification.md` dice que el modo rapido se niega a cubrir.
- **Ojo al leer el rojo, si lo hay.** El baseline trae 8 entradas, y en T16 se vio de primera mano
  el flake de saturacion de QC-58 (`product-page.test.tsx` y `order-form.test.tsx` expirando bajo
  carga, verdes al repetir sin tocar nada). La pregunta del gate completo no es «¿esta todo verde?»
  sino «¿aparecio un archivo que antes no fallaba?».

---

## 9. F2.3 — cierre del rechazo del reviewer (2026-09-12)

El `reviewer` **RECHAZO** la ficha (`progress/review_QC-77-*.md`): 4 mayores, 8 menores, **ningun
defecto funcional** —volvio a correr los 41 archivos y dio 630/630 verde—. El motivo era
trazabilidad, con un criterio que acepto entero:

> **Una medicion cuenta como cobertura solo si romper el requisito pone el gate en rojo por si
> solo.**

Es el mismo argumento que yo escribi en la seccion 5 para justificar `nombres-y-huella.test.ts`.
Lo aplique a R4/R5/R6/R28/R31 y me quede a medias; el reviewer lo aplico entero. Tenia razon.

### Los 11 requisitos que pasaron de MED a test automatico

| R | Ahora lo cubre | Casos |
| --- | --- | --- |
| **R12** | `tests/unit/test-database/guardian-r12.test.ts` | **8** — los 5 desenlaces de aborto (nombre ilegible, sin prefijo `qct_`, `QC77_RUN_DATABASE` ausente, base de **otra** corrida, `DIRECT_URL` descuadrada) + 2 verdes. Los 6 rojos comprueban ademas que **el mensaje nombra la base encontrada**, que es lo que R12 exige literalmente |
| **R26, R27, R29, R30 (guarda 1)** | `tests/unit/test-database/barrido-veredictos.test.ts` | **16** — las cinco guardas con su razon, plantillas (HOLD por defecto / SAFE con `--incluir-plantillas`), dos SAFE positivos, `dropSweptDatabase` rechazando un nombre desconocido, y **el caso que fija el ORDEN de las guardas** |
| **R7, R8, R9** | `tests/integration/infra/ciclo-de-vida-de-la-base.int.test.ts` | **5** — `dropRunDatabase` y `destroyRunDatabase` afirmando **contra `pg_database`** y contra el rastro; `dropRunDatabaseSync` **no devuelve promesa** y la base ya no existe sin `await` intermedio; auto-curacion con pid muerto; y el **control negativo doble** (otro worktree, pid vivo) |
| **R14, R15, R16** | `tests/unit/test-database/aviso-base-atrasada.test.ts` | **9** — los tres desenlaces, la **mas antigua** elegida bien con la entrada desordenada, y tres que **leen `init.sh`** para fijar que el bloque `6.c` conserva su `|| true` y que su unico `fail` es el del script ausente |

### Los dos cambios de codigo que hicieron falta, y por que

Nada de esto se rehizo: se hizo **testeable** lo que ya funcionaba.

1. **El juicio de R12 salio de `_setup.ts` a `tests/helpers/run-database-guard.ts`** (modulo puro,
   sin dependencias). Antes vivia en el cuerpo del modulo, asi que importarlo desde un test
   disparaba el aborto: **no se podia probar**. Ahora `_setup.ts` solo llama y lanza.
2. **`verdictFor` / `VerdictContext` exportados**, y el formateo del aviso extraido a
   `describePendingMigrations`. El reviewer lo señalo: el codigo que ejecuta `DROP DATABASE` no era
   testeable sin servidor porque su juicio era privado. **La logica y el orden de las guardas no se
   tocaron** — solo la visibilidad.

### Que muerde de verdad: 10 mutaciones, 10 rojos

No basta con que los tests pasen. Se rompio a proposito lo que cada uno protege
(`progress/qc77-mediciones/M1-M2-M4.md` y `M3.md`, con las salidas):

| Mutacion | Resultado |
| --- | --- |
| Guarda 1 movida detras de la 2 (la base de desarrollo dejaria de estar protegida) | **ROJO** |
| Guarda 5 devolviendo SAFE en vez de HOLD (el falso SAFE que nacio en `wt.sh`) | **ROJO** |
| El guardian dejando de comparar contra **la** base de la corrida | **ROJO** |
| El mensaje del guardian sin nombrar la base | **ROJO** |
| `pending[0]` en vez de la mas antigua | **ROJO** |
| R16 devolviendo `ok` en vez de `warn` | **ROJO** |
| `|| true` quitado del bloque `6.c` de `init.sh` | **ROJO** |
| `dropRunDatabase` convertido en no-op | **ROJO** (3 casos) |
| `reclaimAbandonedDatabases` borrando tambien rastros de **otro** worktree | **ROJO**, y solo en el control negativo — que es exactamente su razon de ser |
| La entrada del censo del archivo nuevo, quitada | **GUARDIA ROJA**, nombrando el archivo |

La ultima vale doble: demuestra que la guardia del censo **muerde con un archivo de integracion
nuevo de verdad**, no solo con la mutacion sintetica de T14.

### Menores cerrados

- **1 — referencias colgadas.** Las mediciones se movieron a `progress/qc77-mediciones/` y cinco
  citas apuntaban a rutas muertas. Corregidas y **verificadas con `ls`** una por una. La delicada
  era la de `_setup.ts`, que viaja **dentro del mensaje de error de R12**: quien lo leyera iba a un
  archivo fantasma.
- **3 — `design.md > 2`** decia «`main` si se corre desde el worktree principal» y el codigo nunca
  hizo eso. Corregido el texto (el codigo era el correcto) y anotada la correccion.
- **4 — las cinco divergencias** viven ahora en `design.md > 14`, no solo aqui. El `design.md` es
  el documento que sobrevive a la ficha.
- **6 — `tasks.md`** lista «archivos que toca» como contrato de conflicto: se anotaron los **seis**
  archivos que nacieron fuera de las tasks originales, con su fase y su porque.
- **2 — sin commitear.** Cerrado: ver abajo. Era la causa de que `--rapido` seleccionara **cero**
  tests relacionados en la corrida del reviewer.

**5 y 7 y 8 no piden accion**: el reviewer acepto la cobertura parcial de R10, `QC77_RUN_DATABASE`
y las 28 filas de `_prisma_migrations`.

### Verificacion de esta vuelta

| Que | Resultado |
| --- | --- |
| `pnpm run typecheck` | **rc=0** |
| `pnpm run lint` | **rc=0** |
| `vitest run guard tests/unit/test-database` | **36 archivos, 395 casos verdes** (4 skipped) |
| `vitest run tests/integration/infra/ciclo-de-vida-de-la-base.int.test.ts` | **5/5 verde**, sobre su base efimera, borrada al terminar |
| `db:test list` + `.qc-test-db/` | Unica base `qct_` viva: **la plantilla**. Cero rastros. Las 21 heredadas y `QuimiCloude` intactas |

**Cobertura resultante: los 31 requisitos con test automatico salvo R2, R3, R11, R13, R25 y R10**,
que siguen apoyandose en medicion — y ahi el criterio del reviewer **si** se cumple solo: si la
plantilla no se construye o se copia mal, **se caen los 630 casos**; si la URL no llega al worker,
el guardian aborta en rojo antes del primer caso. Son rojos ruidosos, no silencios. R10 queda como
deuda nombrada, aceptada por el reviewer.

### Los commits, y por que importaban (menor 2)

Seis commits sobre `fedcbf6`:

| Hash | Que |
| --- | --- |
| `1d9c389` | `feat(QC-77): la libreria del ciclo de vida de la base efimera` |
| `559041e` | `feat(QC-77): engancha el ciclo de vida en Vitest y el guardian de R12` |
| `ae6e881` | `feat(QC-77): la CLI db:test y el aviso de base atrasada en el gate` |
| `ea47b9f` | `feat(QC-77): el censo de aislamiento y su guardia` |
| `a9ad3fb` | `test(QC-77): tests para los 11 requisitos que solo tenian medicion manual` |
| `e7b69b7` | `docs(QC-77): bitacora, mediciones, addendum del design y verificacion` |

No era burocracia. `scripts/test-rapido.mjs` selecciona por `git diff origin/dev...HEAD`, asi que
con todo en el arbol sin commitear **el diff de codigo estaba vacio** y el modo rapido seleccionaba
**cero** tests relacionados: por eso en la corrida del reviewer `--rapido` no cubrio ni una linea de
esta ficha, solo las guardias. Ahora el diff trae **12 archivos de codigo**.

### `./init.sh --rapido` despues de commitear — **EXIT 0**

```
✓ base de desarrollo «QuimiCloude» al dia: 27 migracion(es) aplicada(s)
✓ typecheck paso
✓ lint paso
[test:rapido] -> vitest related --run --passWithNoTests scripts/test-db.ts ... (11 archivos)
test-db: plantilla reutilizada: qct_tpl_1db8043a68e0 (las migraciones no han cambiado)
test-db: la corrida de integracion va contra qct_qc77_7a512e99_mtypjjnl_gf4 (copia de qct_tpl_...)
 Test Files  6 passed (6)          Tests  62 passed (62)
test-db: borrada la base de la corrida: qct_qc77_7a512e99_mtypjjnl_gf4.
 Test Files  33 passed (33)        Tests  352 passed | 4 skipped (356)
✓ test:rapido paso
== init OK ==
```

**6 archivos relacionados y 62 casos** donde antes eran cero, mas las **33 guardias**. El bloque
`6.c` sale, la corrida nombra su base efimera y **la borra**; al terminar la unica `qct_` viva es la
plantilla y `.qc-test-db/` esta vacio.

**Sigue sin ser el veredicto**: esta ficha toca `init.sh` y `scripts/`, justo lo que
`docs/verification.md` dice que el modo rapido se niega a cubrir. El que vale es **T18**, despues
del merge con `dev`.

---

## 10. F2.3 — sincronizacion con `dev` (2026-09-12)

Merge `57f8e2b`, **22 commits** de `origin/dev`. La rama queda **0 behind**.

### El unico conflicto textual

`progress/current.md` — resuelto **con la version de `dev`**, por indicacion del leader: ese
archivo lo mantiene el y hay otra sesion escribiendolo. No se metio nada de QC-77.

### Los dos que automergearon, que era donde estaba el riesgo

`init.sh` y `docs/verification.md` los toca `dev` y los toca esta ficha. Git no se quejo, asi que
se revisaron **a mano**, que es lo que el automerge no hace:

- **`init.sh`**: `dev` (`659b600`) mete un bloque 2 que corre `prisma generate` y `next typegen`
  **antes de mirar nada**; el `6.c` de esta ficha sigue entre el `6.b` y los tests. Conviven, y el
  orden es el correcto. **De regalo, ese bloque cierra el hallazgo 9 de la seccion 6**: un worktree
  recien montado ya no falla el typecheck por `LayoutProps`. La deuda que reporte ya no existe.
- **`docs/verification.md`**: la seccion de `dev` («El gate regenera los artefactos...») y la de
  QC-77 («Los tests de integracion corren sobre una base propia y efimera») son distintas y no se
  solapan. Ninguna seccion duplicada, ningun marcador suelto en todo el arbol.

### Ni un caso de test perdido

Los dos archivos que toca `d2fcb9d` suman **61 casos antes y 61 despues** (`identity-constraints`
47 + `identity-seed` 14). El commit **renombra** un `it()` y estrecha su afirmacion; no borra
ninguno.

### El censo no necesito altas

Los 22 commits **no traen ningun archivo nuevo** bajo `tests/integration/**`: 42 en el arbol, 42
declarados. Y los dos que cambian **siguen aislandose por transaccion**, que es como estaban
declarados — comprobado leyendo los archivos, no deduciendolo.

### Lo que el merge rompio SIN ser conflicto textual

El hook de R9 de `tests/integration/infra/ciclo-de-vida-de-la-base.int.test.ts` **expiraba a los
15 s** al correr acompanado: `Hook timed out in 15000ms`. Pasaba **corriendo solo** —asi lo
verifico M3 y asi lo aprobo el reviewer— y solo se cae en compania.

**No es un flake, es aritmetica**: ese hook hace **tres** `CREATE DATABASE ... TEMPLATE` en serie y
**cada uno reintenta ante `55006`** (plantilla ocupada) con espera creciente de hasta ~4 s. Tres
veces eso se come el plazo entero antes de llegar al barrido. **15 s no era un margen, era el borde
exacto.** Plazo local del archivo a **60 s**, con el porque escrito dentro; `vitest.config.mts`
**no se toca** (lo vigila `guard-teclear-y-plazo` desde QC-58).

Es un fallo **mio**, de F2.3 anterior, que el merge solo saco a la luz: habria reventado en T18, que
corre los 42 archivos juntos.

### La duplicidad semantica de `d2fcb9d`: mi lectura, y lo que NO pude sostener

`d2fcb9d fix(tests): el reset de identidad contempla el inventario de QC-49` ataca **los dos mismos
archivos y los dos mismos sintomas** que la linea base de T1 (`identity-seed`, 12 rojos por
`Foreign key constraint violated` en `company.deleteMany({})`; `identity-constraints`, 1 rojo por
las 38 filas `DOC*` residuales). Dos arreglos distintos para el mismo dolor.

**Mi primera hipotesis era que se complementaban** —QC-77 quita el residuo *entre* corridas,
`d2fcb9d` quitaria el acoplamiento *dentro* de una corrida— y **la medi antes de reportarla. Es
FALSA.** Revirtiendo los dos archivos a la version pre-`d2fcb9d` (desde copia, restaurados) y
corriendo `inventario/product-crud` + `presentation-uniqueness` **antes** de los dos de identidad en
la misma corrida: **70/70 verde**. O sea: **QC-77 sola ya aguanta ese orden adverso**, y no
consegui construir el caso en que `d2fcb9d` salve algo que QC-77 no salve.

Lo que si se sostiene, y es lo que se lleva el leader:

- **No se contradicen y no hay que borrar nada.** Los dos pasan juntos: 42/42 archivos, 635/635
  casos.
- **La mitad de `identity-seed` es una correccion real e independiente del aislamiento**: el cierre
  transitivo de FKs de `resetIdentityToEmptyState` partia solo de `users` y no visitaba la rama que
  QC-49 colgo de `companies`. Ese helper estaba **mal** con respecto al esquema, lo aisles como lo
  aisles. Se queda.
- **La mitad de `identity-constraints` si merece una mirada del humano.** Relajo «el catalogo
  arranca solo con CC» a «CC existe, se llama asi y esta activo», con el argumento —correcto
  entonces— de que el invariante global era imposible sobre una base compartida y sucia. **Con
  QC-77 ese invariante vuelve a ser cierto y comprobable**, asi que la relajacion ya no hace falta y
  cuesta un poco de cobertura. **No lo he tocado** (no es mio y no me lo han pedido): queda
  **propuesto** para que lo decida quien corresponda.

### Verificacion post-merge

| Que | Resultado |
| --- | --- |
| `pnpm run typecheck` | **rc=0** |
| `pnpm run lint` | **rc=0** |
| `vitest run guard tests/unit/test-database` | **37 archivos, 398 casos verdes** (4 skipped) |
| La combinacion que fallo, **dos veces** tras el arreglo del plazo | **3/3 archivos, 66/66 casos** |
| `vitest run --project integration` **entero** | **42/42 archivos, 635/635 casos**, 59,5 s, sobre `qct_qc77_7a512e99_mtyq324r_f24`, **borrada al terminar** |
| `db:test list` + `.qc-test-db/` | Unica `qct_` viva: la plantilla. Cero rastros. `QuimiCloude` y las heredadas intactas |

**Sigue faltando T18**, el gate completo, que lo corre el leader.

---

## 11. Dos deudas que el humano decidio dejar para despues (2026-09-12)

Ninguna de las dos es de QC-77 y **ninguna se ha tocado**. Van escritas aqui porque, si no, se
pierden.

### 1. El invariante fuerte de `identity-constraints`, que QC-77 vuelve a hacer cierto

`d2fcb9d` —de otra sesion, en paralelo— relajo el caso «el catalogo arranca solo con CC» a «CC
existe, se llama asi y esta activo». **El argumento era correcto entonces**: sobre una base
compartida y sucia ese invariante global es imposible, porque inventario, pedidos y proveedores
insertan tipos `DOC<marcador>` commiteados.

**Con la base efimera de QC-77 el invariante vuelve a ser cierto y comprobable**, asi que la
relajacion ya no hace falta y cuesta un poco de cobertura: hoy el caso no notaria que el catalogo
arranca con basura al lado de CC.

**Decision del humano (2026-09-12): para despues, no ahora.** Es codigo de otra sesion, recien
commiteado, y QC-77 ya esta verde; meterle mano en caliente es como se rompen dos cosas en vez de
arreglar una. Alguien la recoge en frio.

*(Y una precision honesta sobre el razonamiento con el que llegue a proponerlo: mi hipotesis era que
QC-77 y `d2fcb9d` se complementaban, la medi y era **falsa** — ver la seccion 10. Esta propuesta
sigue en pie igualmente, pero por lo que dice este parrafo, no por aquella.)*

### 2. `tests/unit/configuracion-ui/grupos/alcance.test.ts`, arreglado — y lo que deja abierto

Arreglado en `b4a3983`, en commit propio y separado, porque el gate completo (T18) lo encontro
rojo: **entro a `dev` ya roto en `97c96c2`** y falla igual en `dev` con el arbol limpio.

Lo que **queda abierto y no se toco**, porque el encargo era acotado a los dos casos que caian: ese
archivo tiene varios `toEqual([])` que, **fuera** de la rama de QC-85, pasan **en verde por
vacuidad** en vez de saltarse. No estan rotos y no ponen nada en rojo, asi que no urge; pero la
cabecera del propio archivo dice que «un `toEqual([])` sin mordiente es un falso verde», y hoy su
unica red contra eso son las dos anclas — que ahora, correctamente, quedan `skipped` fuera de la
rama. O sea: **fuera de la rama de QC-85 ese archivo no vigila nada, y lo dice por los skips.** Es
el diseno correcto; solo conviene que quien lo lea no confunda sus verdes con cobertura.

**Es la tercera aparicion de esta especie en el repo** (`data-table-intacta-usuarios`,
`data-table-intacta-unidades`, los dos de QC-84 en `c631118`, y ahora este). El patron ya tiene
nombre y forma canonica; lo que no tiene es un sitio donde este escrito **una sola vez** para que el
proximo centinela nazca bien en vez de nacer roto y arreglarse despues. Candidato a ficha del arnes.
