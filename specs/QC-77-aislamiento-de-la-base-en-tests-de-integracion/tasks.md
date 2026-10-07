# QC-77 — aislamiento-de-la-base-en-tests-de-integracion · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` **del mismo bloque**. Cada task lista los
**archivos que toca** con su ruta exacta desde la raiz del worktree: el leader los usa para la
validacion de conflicto de `AGENTS.md > Paralelismo`, asi que si una task acaba tocando un archivo
que no esta listado, se anota antes de seguir.

Ninguna task de esta ficha toca `app/`, `lib/`, `components/`, `db/`, `e2e/` ni los 23 archivos de
`tests/integration/**` que la decision 3 declara intocables (R22, R24). Si alguna acaba
necesitandolo, es senal de que el alcance se rompio: se para y se pregunta.

**Lo que se esta tocando es el gate mismo.** Rige entero `docs/gate.md > Cuando lo que
verificas es el gate mismo`: para cada validacion nueva hay que probar que **muerde**, no solo que
pasa; no se pipea el gate a `head`/`tail` para leer su codigo de salida; y se restaura desde copia
(`cp`), nunca con `git checkout`.

---

## Archivos que NO estaban listados en ninguna task, y se anotan aqui (2026-09-12)

La cabecera de arriba lo exige: «si una task acaba tocando un archivo que no esta listado, **se
anota antes de seguir**». Estos seis nacieron despues del `tasks.md` aprobado y no pertenecen a
ninguna task original. **Ninguno toca `app/`, `lib/`, `components/`, `db/`, `e2e/` ni los 23
archivos intocables**, asi que el alcance de la ficha no cambia; lo que cambia es su verificacion.

| Archivo | Fase | Por que existe |
| --- | --- | --- |
| `tests/unit/test-database/nombres-y-huella.test.ts` | F2.1 (implementer) | R4/R5/R6/R28/R30/R31 iban a quedarse solo con medicion manual, que no vuelve a correr. 18 casos puros, sin base. **Aceptado por el reviewer** (menor 6 de `progress/review_QC-77-*.md`) |
| `tests/helpers/run-database-guard.ts` | F2.3 (M1) | El juicio de R12 vivia en el cuerpo de `_setup.ts`, asi que no se podia importar desde un test sin disparar el aborto. Modulo puro, sin dependencias |
| `tests/unit/test-database/guardian-r12.test.ts` | F2.3 (M1) | R12 — el guardian que sostiene la ficha, sin test |
| `tests/unit/test-database/barrido-veredictos.test.ts` | F2.3 (M2) | R26/R27/R29 y la **guarda 1** de R30 — el codigo que ejecuta `DROP DATABASE`, sin test |
| `tests/unit/test-database/aviso-base-atrasada.test.ts` | F2.3 (M4) | R14/R15/R16 — el aviso del gate, sin test |
| `tests/integration/infra/ciclo-de-vida-de-la-base.int.test.ts` | F2.3 (M3) | R7/R8/R9 — el ciclo de borrado, sin test. Declarado en el censo, y de paso ejercita la guardia con un archivo nuevo de verdad |

Ademas, en F2.3 se **exportaron** `verdictFor` / `VerdictContext` y se extrajo un formateador puro
de `pendingMigrations` en `tests/helpers/test-database.ts` (ya listado en T5/T6/T10): sin eso, las
cinco guardas del barrido y los tres desenlaces del aviso **no eran testeables sin servidor**.

---

## Bloque A — Medir antes de construir

### [x] T1. Reproducir el estado del que venimos y anotar la linea base
- Dep: ninguna.
- Archivos: ninguno (medicion).
- Correr **solos** `tests/integration/identity/identity-constraints.int.test.ts` y
  `tests/integration/identity/identity-seed.int.test.ts` contra la base de desarrollo actual y
  anotar el resultado exacto (archivos, casos, mensajes). Es la linea base contra la que se juzga
  T12.
- **Hecho cuando:** las dos salidas estan pegadas en `progress/impl_QC-77-*.md`, con la fecha y el
  nombre de la base contra la que corrieron.
- Cubre: — (medicion; sin ella T12 no significa nada).

### [x] T2. [P] Escribir la receta de la plantilla a mano, paso a paso
- Dep: ninguna.
- Archivos: ninguno (medicion).
- Sobre una base vacia creada a mano, ejecutar los cuatro pasos de `design.md > 3` y anotar la
  salida de cada uno, incluido **el fallo esperado del paso 1**. Terminar con
  `pnpm exec prisma migrate status` y confirmar que dice que el esquema esta al dia.
- Anotar tambien **cuanto tarda** el conjunto: es lo que justifica la plantilla frente a la
  alternativa A4.
- Borrar la base al terminar.
- **Hecho cuando:** la receta esta confirmada con salidas reales en la bitacora y la base de prueba
  ya no existe.
- Cubre: R3 (parcial; el test llega en T5).

### [x] T3. [P] Inventariar las bases y los rastros que ya existen
- Dep: ninguna.
- Archivos: ninguno (medicion).
- Listar las bases del Postgres local y anotar cuales encajan en `QuimiCloude_QC<n>` (se esperan
  **21**), cual es la de desarrollo y cuales no encajan en nada. Es la entrada de T10 y el fixture
  real con el que se probara que el barrido muerde.
- **Hecho cuando:** la lista esta en la bitacora, con la base de desarrollo marcada explicitamente.
- Cubre: R28, R30 (parcial).

### [x] T4. Medir como llega el entorno del `globalSetup` al worker, y si el `globalSetup` corre con cero archivos seleccionados
- Dep: ninguna. **Bloqueante de todo el bloque B**: `design.md > 4` declara esto como el unico
  desconocido tecnico y prohibe expresamente suponerlo.
- Archivos: dos archivos **temporales** que se borran al terminar
  (`tests/integration/_sonda-env.int.test.ts` y un `globalSetup` de sonda).
- Dos preguntas, dos respuestas escritas:
  1. ¿Un `process.env.X` puesto en el `globalSetup` del proyecto `integration` lo ve el worker?
  2. ¿Se ejecuta ese `globalSetup` cuando `vitest related` / `vitest run guard` no selecciona
     ningun archivo del proyecto?
- **Hecho cuando:** las dos respuestas estan en la bitacora con la salida que las prueba, y
  `git status` no deja ningun archivo de sonda. Si (1) es «no», se anota que se implementa con
  `provide()`/`inject()`; si (2) es «si», se anota que hace falta el corto-circuito de
  `design.md > 4`.
- Cubre: — (puerta de diseno).

---

## Bloque B — La libreria del ciclo de vida

Dep de todo el bloque: **T4**.

### [x] T5. La libreria: nombres, huella de migraciones y plantilla
- Dep: T2, T4.
- Archivos: `tests/helpers/test-database.ts` (nuevo).
- `runDatabaseName`, `templateDatabaseName`, `migrationsFingerprint`, `withDatabaseName`,
  `ensureTemplateDatabase`, con las firmas de `design.md > 10`. Identificadores en **ingles** (R31),
  mensajes de consola en castellano.
- `ensureTemplateDatabase` implementa la receta de los cuatro pasos, con el `pg_advisory_lock` y
  con el **fallo esperado del paso 1 acotado**: si el paso 1 falla en una migracion que no es
  `20260911130000_inventory_company_scope`, para y lo dice.
- Ninguna conexion queda abierta contra la plantilla al volver (`design.md > 3`).
- **Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` pasan, el archivo no es recogido como
  suite por ningun proyecto (no lleva `.test.`), y `ensureTemplateDatabase` construye la plantilla
  desde cero con `prisma migrate status` al dia.
- Cubre: R2, R3, R4, R5, R6, R31.

### [x] T6. La libreria: crear, borrar, rastro y auto-curacion
- Dep: T5.
- Archivos: `tests/helpers/test-database.ts`.
- `createRunDatabase` (`CREATE DATABASE ... TEMPLATE`, con reintento ante `55006`),
  `dropRunDatabase` (`DROP DATABASE IF EXISTS ... WITH (FORCE)`), el rastro
  `.qc-test-db/<nombre>.json` y `reclaimAbandonedDatabases` (`design.md > 5`, capa 3).
- Validacion del nombre contra `/^qct_[a-z0-9_]{1,58}$/` **antes** de construir cualquier DDL.
- **Hecho cuando:** crear y borrar 20 veces seguidas no deja ninguna base ni ningun rastro; crear
  una base, borrar el proceso a mano y volver a llamar a `reclaimAbandonedDatabases` la borra y lo
  dice. Salidas en la bitacora.
- Cubre: R1, R7, R9.

### [x] T7. Enganchar el ciclo de vida en Vitest y el guardian
- Dep: T6.
- Archivos: `tests/integration/_global-setup.ts` (nuevo), `tests/integration/_setup.ts` (nuevo),
  `vitest.config.mts`, `.gitignore`.
- `globalSetup` + `setupFiles` **solo** en el proyecto `integration`. No se toca `testTimeout`,
  ni `fileParallelism`, ni la configuracion de `ui` ni de `node` — QC-58 los vigila con
  `guard-teclear-y-plazo` y esta ficha no tiene nada que decir ahi.
- Las senales de `design.md > 5` capa 2, relanzando la senal para no cambiar el codigo de salida.
- `_setup.ts`: aborta si la base a la que apunta `DATABASE_URL` no es la efimera publicada por la
  corrida, **nombrando la base encontrada** (R12).
- `.gitignore`: `.qc-test-db/`.
- **Hecho cuando:** `pnpm exec vitest run tests/integration/identity/identity-constraints.int.test.ts`
  pasa, la salida dice contra que base corrio, y al terminar esa base ya no existe.
- Cubre: R1, R7, R8, R12.

### [x] T8. Probar que el ciclo de vida aguanta las interrupciones
- Dep: T7. **Bloqueante: sin esta task, T7 no cuenta como hecha.**
- Archivos: ninguno de forma permanente.
- Tres desenlaces, uno a uno, comprobando en cada caso que **no queda ninguna base `qct_`**:
  1. corrida que termina en **rojo** (se fuerza un test a fallar y se restaura desde copia);
  2. corrida interrumpida con **Ctrl-C** a mitad;
  3. corrida **matada** sin senal (`SIGKILL` / cierre de la terminal) → aqui **si** queda base, y
     lo que se prueba es que la corrida **siguiente** la borra y lo dice (R9).
- **Hecho cuando:** los tres desenlaces estan en la bitacora con la lista de bases antes y despues.
- Cubre: R7, R8, R9.

### [x] T9. Dos worktrees a la vez
- Dep: T7.
- Archivos: ninguno (verificacion).
- Lanzar la integracion desde **dos** worktrees simultaneamente y comprobar: dos nombres de base
  distintos, ninguna de las dos ve filas de la otra, las dos terminan y las dos borran la suya.
  Comprobar ademas que la segunda **espera** por la plantilla en vez de construirla dos veces si
  ambas comparten conjunto de migraciones.
- **Hecho cuando:** la salida de las dos corridas esta en la bitacora, con los dos nombres de base.
- Cubre: R10.

---

## Bloque C — La CLI, el aviso y la guardia

### [x] T10. La CLI `scripts/test-db.ts` con sus cuatro subcomandos
- Dep: T6, T3.
- Archivos: `scripts/test-db.ts` (nuevo), `tests/helpers/test-database.ts`, `package.json`.
- `status`, `template`, `list`, `clean [--force]` (`design.md > 6`), con las **cinco guardas** y la
  regla de oro «ante la duda, NO borra». Dry-run por defecto. Plantillas listadas aparte y HOLD
  salvo `--incluir-plantillas`.
- `package.json`: `"db:test": "tsx scripts/test-db.ts"`. **No se toca ningun otro script.**
- Formato de salida copiado de `scripts/wt.sh` (`SAFE`/`HOLD`, razon en tenue, resumen al final).
- **Hecho cuando:** `pnpm run db:test list` muestra las 21 heredadas de T3 como candidatas y la de
  desarrollo como HOLD con la razon; `pnpm run db:test clean` no borra nada y lo dice.
- Cubre: R26, R28, R29, R30.

### [x] T11. Probar que el barrido NO borra lo que no debe
- Dep: T10. **Bloqueante: sin esta task, T10 no cuenta como hecha.**
- Archivos: ninguno de forma permanente (bases de fixture que se crean y se borran).
- Un fixture por guarda, cada uno confirmando `HOLD` **con su razon**:
  1. la base de desarrollo, renombrada temporalmente para que su nombre **si** encaje con `qct_`;
  2. una base con nombre desconocido;
  3. una base `qct_` con una conexion abierta;
  4. una base `qct_` cuyo `<wt8>` corresponde a un worktree vivo;
  5. git inaccesible (se invoca con `-C` a una ruta que no es repo) → HOLD por estado ilegible.
- Y **un caso positivo**: una base `qct_` huerfana, sin conexiones y sin worktree, que con
  `--force` **si** desaparece (R27).
- **Hecho cuando:** los seis desenlaces estan en la bitacora y el servidor queda exactamente como
  estaba, salvo las 21 heredadas si el humano autoriza barrerlas en esta misma task.
- Cubre: R27, R29, R30.

### [x] T12. El aviso amarillo en `init.sh`
- Dep: T10.
- Archivos: `init.sh`.
- Bloque `6.c`, **despues** del `6.b` y **antes** de los tests, en los dos modos. `warn` si la base
  va atrasada o no se puede consultar; **`fail` si falta `scripts/test-db.ts`**
  (`docs/gate.md > El anti-patron: la validacion opcional`).
- **Probar que muerde, con el archivo real:** (a) base atrasada a proposito → aviso amarillo y
  `./init.sh --rapido` sigue saliendo **0**; (b) base al dia → linea verde; (c) `DATABASE_URL`
  apuntando a un host inexistente → aviso y `exit 0`; (d) `scripts/test-db.ts` renombrado →
  `exit 1` con mensaje que lo nombra. Los cuatro codigos de salida se leen redirigiendo a archivo y
  mirando `$?`, **nunca** por una tuberia.
- **Hecho cuando:** los cuatro desenlaces estan en la bitacora con su codigo de salida y el arbol
  queda restaurado desde copia.
- Cubre: R14, R15, R16.

### [x] T13. El censo y la guardia
- Dep: T7 (para poder correr los 41 y clasificarlos con certeza).
- Archivos: `tests/integration/aislamiento.json` (nuevo),
  `tests/guards/guard-aislamiento-integracion.test.ts` (nuevo).
- El censo nace con los **41** archivos: los **18** en `transaccion` y los **23** de la lista de la
  decision 3 en `commit`, cada uno con `motivo` y `desde`. **Ojo con
  `identity/work-group-crud.int.test.ts`**: contiene `RollbackSignal` y va en `commit`
  (`design.md > 0`, observacion del ancla 2). **No se edita ningun archivo de test** (R22).
- La guardia, con las cuatro comprobaciones de `design.md > 8` y la normalizacion de separadores de
  ruta; patron y helpers copiados de `tests/guards/guard-editor-aislado.test.ts`.
- **Hecho cuando:** la guardia pasa en verde y `pnpm run test:guardias` la selecciona sola.
- Cubre: R17, R18, R22.

### [x] T14. Probar que la guardia MUERDE
- Dep: T13. **Bloqueante: sin esta task, T13 no cuenta como hecha.**
- Archivos: ninguno de forma permanente (se muta y se restaura **desde copia**).
- Cuatro mutaciones: (a) archivo nuevo bajo `tests/integration/` sin entrada en el censo;
  (b) entrada del censo cuyo archivo se borra; (c) entrada de `commit` sin `motivo`; (d) entrada de
  `commit` sin `desde`. Las cuatro en rojo, **nombrando lo que falla**.
- Y un **control negativo**: el arbol intacto sale en verde.
- **Hecho cuando:** las cinco salidas estan en la bitacora y `git status` no deja residuos.
- Cubre: R19, R20, R21.

---

## Bloque D — La prueba de que la ficha sirvio para algo

### [x] T15. Los 41 archivos de integracion, sobre base efimera
- Dep: T7, T13.
- Archivos: ninguno (verificacion).
- `pnpm exec vitest run --project integration` **tres veces seguidas**, desde un shell limpio.
- Condicion: los **41** archivos en verde las tres veces, incluidos los dos que el gate daba en
  rojo el 2026-09-12 (`identity-constraints` y `identity-seed`, los 61 casos de la decision 1), y
  **sin** la colision de correlativo `(order_year, order_sequence)` que QC-58 T11 dejo atribuida a
  esta ficha.
- Comprobar ademas, antes y despues, que la base de **desarrollo** tiene el mismo contenido
  (conteo por tabla) (R13), y que su esquema coincide con el de la efimera (R25).
- **Una corrida verde no cuenta como prueba**: es la leccion escrita de `--maxWorkers=2` en
  `docs/verification.md`.
- **Hecho cuando:** las tres salidas estan en la bitacora, con el nombre de la base de cada corrida
  y los conteos de antes y despues.
- Cubre: R11 (parcial), R13, R17, R25.

### [x] T16. [P] `./init.sh --rapido` en verde, y sin base sucia
- Dep: T12, T14, T15.
- Archivos: ninguno (verificacion).
- Dos corridas: una con el diff tocando un archivo **con** tests de integracion relacionados y otra
  con el diff sin ninguno. En las dos: `exit 0`, las guardias corren enteras, y no queda ninguna
  base `qct_` al terminar. En la primera, la salida nombra la base efimera.
- **Recordatorio:** tocar `init.sh` o `scripts/` hace que el modo rapido **no** te cubra; el
  veredicto de verdad es T18.
- **Hecho cuando:** las dos salidas y los dos codigos de salida estan en la bitacora.
- Cubre: R11.

### [x] T17. [P] Documentacion y bitacora
- Dep: T15.
- Archivos: `docs/verification.md`, `progress/impl_QC-77-aislamiento-de-la-base-en-tests-de-integracion.md`,
  `progress/current.md`.
- En `docs/verification.md`, seccion nueva junto a la nota del `.env` (que **no se borra**: sigue
  siendo cierta y sigue explicando por que el gate carga el entorno): como se aisla hoy la
  integracion, que cada corrida tiene base propia, la receta de la plantilla remitiendo a
  `design.md > 3`, el aviso de base atrasada, y `pnpm run db:test clean` con su regla de oro.
- En la bitacora: el mapa **`R<n> → test`** de los 31 requisitos
  (`CHECKPOINTS.md > Trazabilidad`); las salidas rojas de T8, T11, T12 y T14; las tres corridas de
  T15. Comprobacion de alcance: `git diff --name-only origin/dev...HEAD` **no** contiene ninguna
  ruta bajo `app/`, `lib/`, `components/`, `db/` ni `e2e/`, ni ninguno de los 23 archivos
  intocables (R22, R24), ni ningun cambio en `package.json` mas alla del script `db:test` (R23).
- **Hecho cuando:** ningun `R<n>` queda sin test o sin evidencia nombrada, y la lista de archivos
  tocados esta pegada entera.
- Cubre: R22, R23, R24, R31.

---

## Bloque E — El cierre

### [ ] T18. El gate completo — **lo corre el LEADER, no el spec_author ni el implementer**
- Dep: **todo lo anterior**.
- Archivos: ninguno (verificacion).
- `./init.sh` sin banderas, desde un shell limpio. Es el unico veredicto que vale para abrir el PR
  (regla 5 de `CLAUDE.md`), y aqui con mas motivo que de costumbre: esta ficha toca `init.sh` y
  `scripts/`, o sea justo lo que `docs/verification.md` dice que el modo rapido **se niega a
  cubrir**.
- Condicion: ningun archivo de test rojo fuera de `tests/baseline-rojos.json`, y **ninguna base
  `qct_` viva** al terminar (se comprueba con `pnpm run db:test list` inmediatamente despues).
- **Hecho cuando:** la salida del comparador de baseline y el `list` posterior estan en la
  bitacora, con la fecha y quien lo corrio.
- Cubre: el cierre de `CHECKPOINTS.md > Verificacion final`.

---

## Mapa rapido task → requisito

| Task | Requisitos |
| --- | --- |
| T1, T2, T3, T4 | — (mediciones y puerta de diseno) |
| T5 | R2, R3, R4, R5, R6, R31 |
| T6 | R1, R7, R9 |
| T7 | R1, R7, R8, R12 |
| T8 | R7, R8, R9 |
| T9 | R10 |
| T10 | R26, R28, R29, R30 |
| T11 | R27, R29, R30 |
| T12 | R14, R15, R16 |
| T13 | R17, R18, R22 |
| T14 | R19, R20, R21 |
| T15 | R11, R13, R17, R25 |
| T16 | R11 |
| T17 | R22, R23, R24, R31 |
| T18 | — (puerta del leader) |
