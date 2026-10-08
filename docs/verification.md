<!-- perfil: revisado=2026-10-06 por=arnes-v2 -->
# docs/verification.md — Cómo demostrar que funciona

"Compila" y "el agente dice que está listo" NO son verificación. Una feature está
verificada cuando hay evidencia ejecutable.

El **proceso** del gate (niveles, guardias, baseline de rojos, cómo verificar el gate mismo,
vuelta 2 del reviewer) es del arnés y vive en `docs/gate.md`. Aquí queda lo propio de
QuimiCloude: comandos, Supabase/Postgres, la base efímera de integración, los flakes concretos
y qué cuenta como evidencia.

## El gate tiene DOS niveles — usa el que toca

Proceso del gate: `docs/gate.md > El gate tiene DOS niveles — usa el que toca`.

Comandos sueltos, por si necesitas uno concreto:

```bash
pnpm run typecheck        # TypeScript strict, cero errores
pnpm run lint             # ESLint, cero errores
pnpm test                 # la suite entera
pnpm run test:rapido      # lo que `vitest related` relaciona con tu diff vs origin/dev + las guardias
pnpm run test:guardias    # solo las guardias (van SIEMPRE: docs/gate.md > Las guardias van SIEMPRE)
pnpm exec vitest related --run <archivos>   # que tests cubren ESTOS archivos
```

- `vitest.config.mts` monta tres proyectos —`ui` (jsdom), `node` e `integration`— repartidos por
  convención de nombre. Las guardias viven en `tests/guards/`.
- Un diff que no toca código importado por tests deja a `--rapido` en cero tests relacionados y
  sale verde con solo las guardias: el completo (CI) existe por la **cobertura**, no solo por el
  tiempo.

### El gate regenera los artefactos antes de mirar nada

- `init.sh` corre **siempre** `prisma generate` y `next typegen`, y reinstala si `pnpm-lock.yaml`
  es más nuevo que `node_modules`.
- Los dos pasos **avisan y siguen** si fallan, nunca abortan. El gate de verdad es el `typecheck`
  que viene después; el aviso explica de antemano el error fantasma que va a salir.
- **Versión objetivo de Postgres: 17**, no la que trae la instalación local. Ningún código de
  producción ni de test se adapta a 18: el remedio es correr la base local en 17.
- **Lo que NO cubre, y sigue siendo manual:** aplicar a la base las **migraciones** que traiga un
  merge con `dev`. El gate regenera el *cliente* de Prisma, no ejecuta `migrate deploy`; sin ese
  paso los tests de integración dan rojos que no son tuyos. Está en `AGENTS.md > F2.3`.

Síntomas que mienten sobre su causa:

| Lo que sale por pantalla | Lo que parece | Lo que era |
|---|---|---|
| `Module '@prisma/client' has no exported member 'Prisma'` | versiones de Prisma peleadas | un `generate` que faltaba tras montar el worktree |
| `Cannot find name 'LayoutProps'` | un problema de Next | los tipos de ruta sin generar |
| `Cannot find module 'resend'` | **una dependencia metida sin aprobar** (regla 7) | estaba aprobada, documentada y en `package.json`; el `node_modules` del árbol principal se quedó corto tras el merge |
| `TypeError: Cannot read properties of undefined (reading 'clear')` en `window.localStorage.clear()` (proyecto `ui`) | un mock de storage roto en ese test | Node 22+ expone su propio `localStorage`/`sessionStorage` global y pisa el de jsdom; en Node 26 viene activo por defecto. `vitest.config.mts` ya pasa `--no-experimental-webstorage` al worker del proyecto `ui`, así que nadie debería verlo — si vuelve, es que algo corre ese proyecto sin pasar por esta config |
| `expected '23001' to be '23503'` en tests de `tests/integration/**` que borran una fila referenciada por FK con `RESTRICT` | el código de error cambió, o el test está mal | la base local corre en Postgres 18, y sobre 18.6 se reproduce que el `RESTRICT`/`NO ACTION` de una FK reporta `23001` (`restrict_violation`) donde 9 tests de esta rama esperan `23503` (`foreign_key_violation`); no se verificó aquí el changelog exacto de Postgres 18 que lo motiva, solo que 18.6 lo hace y 17 es el objetivo del proyecto (decisión humana, 2026-09-18: Supabase aún no está conectado y su canal estable es 17) |
| Retrato de catálogo con una fila de más en `pg_constraint` tras correr `down.sql` (`company-scope.int.test.ts` de proveedores y de recetas, «9 vs 10») | el `down.sql` dejó una restricción sin borrar | en Postgres 18 las restricciones `NOT NULL` (p. ej. `suppliers_company_id_not_null`) pasan a tener su propia fila en `pg_constraint` (`contype = 'n'`), algo que no existe en 17; el retrato se escribió asumiendo 17 |

### Por qué

**De dónde salió la regla de los dos niveles.** La tabla de tiempos de `docs/gate.md` es de un
proyecto anterior que corría este mismo arnés: cuando se escribió, QuimiCloude todavía no tenía
suite propia. Hoy sí la tiene (tres proyectos de Vitest, cientos de archivos) y el completo tarda
lo que mide `init.sh` en su paso 2 (160–480 s), así que la regla aplica aquí tal cual.

> **Estado en QuimiCloude (2026-08-26), foto de esa fecha:** ya había suite y configuración, así
> que los dos modos **sí** hacían cosas distintas. `vitest.config.mts` montaba dos proyectos
> (`ui` en jsdom, `node`) repartidos por convención de nombre, y `tests/` tenía 10 archivos, 3 de
> ellos guardias (`tests/guards/`). `--rapido` seleccionaba por grafo y corría las tres guardias;
> el completo corría los 10.

**Regenerar artefactos (2026-09-12).** No es comodidad: **estos errores mienten sobre su causa**,
y el 2026-09-11 costaron cuatro paradas y una suite E2E entera caída sin que nadie lo supiera. El
tercer síntoma de la tabla es el que justifica la regla por sí solo: un síntoma de entorno
**acusando a otra sesión de saltarse una regla del arnés**. De ahí a «arreglar» algo que no está
roto hay un paso. Las dos filas de Postgres 18 se reprodujeron el 2026-09-18 contra Postgres 18.6
(`SELECT version()`); el remedio es correr la base en 17, no mover la meta.

**Coste medido el 2026-09-12**, no estimado: 12 s de `prisma generate` más 5 s de `next typegen`
en régimen estable; **128 s la primera vez** tras cambiar el esquema. Sobre el gate completo
(160–480 s) es un 4–10 %; sobre el rápido (~60 s), un 28 %. Se paga igual: **una sola corrida
repetida por entorno desfasado cuesta más que tres con estos pasos dentro**.

**Avisar y seguir.** Un `fail` en la regeneración dejaría sin gate a quien tenga el entorno a medias.

## Qué cuenta como evidencia
- Salida real de los tests pasando, pegada en `progress/impl_<feature>.md`.
- El mapa `R<n> → test`: para cada requisito, el test que lo cubre.
- Para features con UI o flujo crítico: un test E2E que ejercita el camino
  completo, no solo un unit test del helper.

## Qué NO cuenta
- "Debería funcionar."
- Un test que no asegura nada (sin asserts reales).
- Tests que el implementer escribió para pasar, sin cubrir el requisito.

## Datos (Supabase)
- **Verifica la autorizacion en el caso de uso**: un test que lo llame con un usuario
  sin permiso y confirme que lanza, sin llegar al puerto de datos. Ese es el test que cierra
  el requisito.
- Un test de RLS es **adicional**, y hay que saber leerlo: si lo escribes con Prisma
  saldra verde pase lo que pase, porque Prisma se conecta como dueño de la tabla y la
  policy no se le aplica (`docs/architecture.md > Acceso a datos y autorizacion`). Para
  que un test de RLS signifique algo tiene que ejercitar la via que RLS protege.
- Verifica migraciones aplicando y revirtiendo en un entorno de prueba: `down.sql` es
  convencion propia, nadie lo prueba por ti.
- **Los tests de integración necesitan `DATABASE_URL`, y el gate la carga él.** `init.sh` carga
  el `.env` antes de correr los tests, salvo que `DATABASE_URL` ya venga del entorno, en cuyo caso
  manda ésa. Nadie más lo hace: `prisma.config.ts` solo carga el `.env` para el CLI de Prisma, y
  Vitest no lo lee en este proyecto.

### Por qué

`init.sh` carga el `.env` desde el 2026-09-08. Antes el veredicto del gate dependía del shell: la
misma rama daba **23 archivos y 32 tests en rojo** desde un shell limpio y **1 archivo y 2 tests**
con el `.env` cargado, y el rojo no decía «falta una variable» sino «Validation Error» de Prisma,
que se lee como un fallo de código.

## Datos de demostración en la base local: `pnpm db:seed:demo` (QC-230, 2026-10-08)

- **Para qué:** ver pantallas con datos sin cargarlos a mano. Corre sobre la empresa del seed
  base, así que antes va `pnpm db:seed`.
- **Cómo:** las contraseñas de los usuarios de demo van en el entorno del comando, nunca en un
  archivo versionado (nombres en `.env.example`):
  `SEED_DEMO_OPERADOR_PASSWORD=... SEED_DEMO_EMPACADOR_PASSWORD=... SEED_DEMO_ACONDICIONAMIENTO_PASSWORD=... pnpm db:seed:demo`.
  Si falta alguna, falla nombrándola. Deben cumplir la política de credenciales.
- **Nunca en producción:** se niega con cualquier `VERCEL_ENV` no vacío distinto de `development`
  (`production` y también `preview`, que usa la base de producción), dentro de CI (variable `CI`) y si
  `DATABASE_URL` no apunta a `localhost`, `127.0.0.1` o un socket Unix (el parámetro `?host=`, si
  viene, manda; repetido o vacío, se niega). Solo la regla de base local la salta la bandera
  `--forzar` de la línea de comandos, y avisa; `VERCEL_ENV` y CI no las salta nada.
- **Idempotente:** cada cosa se busca por su nombre antes de crearla y un pedido a medias se
  retoma desde su estado. Una segunda corrida no crea nada.
- **Qué crea**, todo ficticio y con el prefijo `DEMO` (lotes `DEMO-`, usuarios `demo.`):
  - 2 unidades propias y 5 presentaciones;
  - 8 insumos, 3 envases y 2 instrumentos, con 15 lotes y ajustes de merma, rotura y conteo;
  - 2 proveedores con 5 líneas de catálogo y 4 clientes;
  - 4 recetas con líneas, pasos y pasos de envasado, una con 2 versiones;
  - 5 usuarios activos (2 Operadores, 2 Empacadores, 1 de acondicionamiento) y 2 grupos de
    trabajo;
  - 10 pedidos con responsables, uno por estado y con las cuatro prioridades. Los que avanzan
    lo hacen por los casos de uso reales, así que consumen material y dan de alta producto
    terminado.
- **Lo que no crea, y por qué:**
  - ningún pedido `ENTREGADO`: hoy ningún caso de uso lleva un pedido a ese estado;
  - ningún Administrador de demo: el alta de usuarios no concede ese rol, y actúa el del seed
    base.
- **Por dónde pasa:** toda escritura va por los casos de uso de `lib/composition`, con su
  permiso y sus invariantes. Prisma solo lee, para saber qué existe ya. El código está en
  `scripts/seed-demo/`.

## Los tests de integración corren sobre una base propia y efímera (QC-77, 2026-09-12)

- El gate carga `DATABASE_URL` para saber **dónde está el Postgres**, no para escribir en ella.
  Los tests de integración **no tocan la base de desarrollo**.
- **Cada corrida del proyecto `integration` crea su propia base**, copia de una plantilla ya
  migrada y sembrada, y **la borra al terminar pase lo que pase**.
- La regla es **la misma en el gate completo y en el rápido**: el enganche vive en el
  `globalSetup` del proyecto, no en el modo del gate.
- La corrida dice por consola contra qué base va. Una corrida de integración que no lo dice no es
  auditable.

### La plantilla, y por qué la receta tiene cuatro pasos

- `prisma migrate deploy` **no termina sobre una base vacía**, a propósito:
  `20260911130000_inventory_company_scope` exige que exista la empresa inicial y falla cerrado
  (QC-49 R3). La plantilla se construye **migrar → sembrar → `migrate resolve --rolled-back` →
  migrar**.
- La receta entera está en
  `specs/QC-77-aislamiento-de-la-base-en-tests-de-integracion/design.md > 3`; no se copia aquí
  para que no haya dos versiones que se desincronicen.
- El nombre de la plantilla lleva una huella de las migraciones **y** del sembrado: mientras
  ninguno cambie se reutiliza y la copia es un `CREATE DATABASE ... TEMPLATE`; si cambian, el
  nombre cambia y se construye sola. **El nombre es la invalidación de caché**: no hay que
  acordarse de borrar nada.

### La base de desarrollo atrasada: avisa en amarillo, no falla

- El bloque `6.c` de `init.sh` consulta el estado de la base de desarrollo antes de los tests y
  **avisa; no cambia el código de salida del gate**.
- El aviso distingue «va N atrás, la más antigua que falta es X» de «no se pudo consultar:
  <razón>».
- **Lo que sí es `fail` es que falte `scripts/test-db.ts`**: es una rotura del arnés
  (`docs/gate.md > El anti-patrón: la validación opcional`).

### `pnpm run db:test clean` — la regla de oro: ante la duda, NO borra

- Barre las bases huérfanas de corridas muertas y las heredadas por worktree. **Dry-run por
  defecto**: imprime la tabla con veredicto y razón por fila y dice que no borró nada; hace falta
  `--force` para que muerda.
- Cinco guardas retienen una base, y basta una: es la de desarrollo, el nombre no encaja en
  ninguna forma conocida, tiene conexiones abiertas, su worktree o su rama `feature/QC-<n>-*`
  siguen vivos, o **no se pudo leer su estado** (si git no responde, se retiene).
- Las **plantillas se listan aparte y no caen** en un barrido normal: son caché de esquema, no
  basura.
- Otros subcomandos: `status` (estado de la base de desarrollo, el que consume `init.sh`),
  `template` (construye o reutiliza la plantilla) y `list` (el inventario sin borrar nada).

### El censo de aislamiento, y lo que su guardia NO comprueba

- Todo archivo nuevo bajo `tests/integration/**` declara en `tests/integration/aislamiento.json`
  **cómo se aísla**: `transaccion` (transacción interactiva que termina en `ROLLBACK`) o `commit`
  (escribe de verdad, o no escribe nada) y, si es `commit`, con `motivo` y `desde` propios.
- Si falta, `tests/guards/guard-aislamiento-integracion.test.ts` pone el gate en rojo. Vive en las
  guardias porque el censo es un JSON que no importa nadie.
- **La guardia no comprueba que el modo declarado sea cierto**: un archivo puede declararse
  `transaccion` y committear, y saldría verde.

### Dos cosas medidas que conviene no volver a descubrir

- **El borrado del camino de señal (Ctrl-C) es síncrono a propósito.** No conviertas
  `dropRunDatabaseSync` en `async`: devuelve la base viva tras Ctrl-C.
- **Un `SIGKILL` o cerrar la terminal no ejecuta nada**, y no hay handler que lo arregle. Esa base
  la recoge **la corrida siguiente**, que antes de crear nada barre los rastros de `.qc-test-db/`
  de este worktree cuyo pid ya está muerto, y dice por consola cuál borró y por qué.

### Por qué

**Lo que compró la base efímera**, medido en tres corridas seguidas de los 41 archivos / 630
casos: las tres en verde, con base distinta cada una, y los **13 rojos** que la base compartida y
sucia arrastraba (`identity-constraints` e `identity-seed`) desaparecidos. La base de desarrollo
quedó idéntica en sus 20 tablas antes y después.

**La plantilla** cuesta ~38 s, y **se paga una vez por conjunto de migraciones, no por corrida**.

**Avisar y no fallar por la base atrasada.** Es una tarde perdida: el 2026-09-12 la base iba
cuatro migraciones atrás y eso dejó **22 archivos en rojo sin que nada dijera la causa**. El
aviso existe para explicar ese rojo **antes** de verlo. Bloquear un PR por el estado de una base
local sería un gate que se ignora. Colgar el bloque de un `[ -f ... ]` con un `warn` en el `else`
sería exactamente el anti-patrón de la validación opcional: en la máquina que no tenga el script,
el check se salta entero y el gate sigue verde. Que el script no exista es una rotura del arnés;
que la base esté atrasada es la circunstancia que el bloque vino a contar.

**`db:test clean`.** Cada guarda se probó con su fixture y mordió por su razón; con git
inaccesible salen **cero** borrables. Las plantillas se reconstruyen solas.

**Por qué el censo no verifica el modo.** Comprobarlo exigiría leer el código del test, y eso
está medido y no es fiable: un `grep` de `inRolledBackTransaction` devuelve **19** archivos cuando
la verdad son **18** — `identity/work-group-crud.int.test.ts` usa el patrón para un sondeo suelto y
el resto de sus casos committea. Una guardia que cuenta mal desde el primer día entrena a todos a
ignorarla. Lo que compra es más modesto y vale la pena: que nadie añada un archivo de integración
sin haber pensado cómo se aísla.

**Ctrl-C síncrono.** Vitest, en su propio handler, hace `setTimeout(() => process.exit(), 1)`: un
`DROP DATABASE` con `await` no llega a terminar. Está comprobado con un Ctrl-C real a mitad de
corrida, no razonado.

## Rojos heredados: la pregunta es «¿rompí algo YO?»

Proceso del gate: `docs/gate.md > Rojos heredados`.

- El baseline de QuimiCloude es `tests/baseline-rojos.json`. **Su estado vigente es el del JSON**
  (cada entrada con su `motivo` y su `desde`); no se copia aquí porque envejece en días.
- Una especie conocida: guardias que censan el diff de rama o el `package.json` contra `dev` y
  rompen con cualquier feature posterior que añada una dependencia legítima y aprobada. Al ser la
  comparación **por archivo**, esos archivos quedan ignorados **también en las ramas donde sus
  guardias sí morderían**. Arreglar la clase entera es **QC-99**.

### Los flakes de saturación: qué son, qué NO los cura, y cómo se curaron

- **Firma:** `Test timed out in <plazo>ms`, en un test de UI que escribe con `userEvent`; a
  veces las letras salen intercaladas —`xxxxxAxcxixdxox` donde debía salir `Acido citrico`—.
  La firma sirve para reconocerlo, **no como prueba de gravedad**.
- **Cómo distinguirlo de un rojo de verdad:** corre el archivo **solo**. Si pasa en aislado y
  falla en la suite, es saturación. Si falla también solo, es tuyo. Si sospechas de una rama,
  córrelo en `dev` sin tu rama encima.
- **Lo que NO lo cura: bajar los workers de vitest** (`--maxWorkers`). No lo propongas.
- **El plazo es `20000` en los tres proyectos** (`ui`, `node`, `integration`), declarado **dentro
  del bloque `test` de cada proyecto**, nunca en la raíz de `vitest.config.mts`.
- **Se teclea con `setupUser()`** de `tests/helpers/user-event.ts` (`delay: null`), nunca con
  `userEvent.setup()` suelto.
- Las dos mitades las vigila `tests/guards/guard-teclear-y-plazo.test.ts`, que lee la
  **configuración resuelta**, no el texto del archivo.

### Por qué

**El estado del baseline (2026-09-18).** El baseline tenía **ocho** entradas y **seis de ellas ya
pasaban**. Eso es una regresión del propio baseline, no del código: la lista creció feature a
feature y nadie la podó. Hasta el 2026-09-08 tenía **dos** —eran cinco, y QC-58 retiró las tres de
los flakes de saturación **en el mismo cambio que arregló la causa**, que es lo que hace que un
arreglo cuente—. Las seis que sobraban las señalaba el comparador en cada corrida completa
(«aviso: N archivo(s) del baseline ya pasan; toca limpiarlos»), y **desde el 2026-09-18 atender ese
aviso es obligación del leader al cerrar cada feature** (`AGENTS.md`, paso F2.6): se borra lo que
ya pasa, o se dice por escrito por qué se queda. Las dos que seguían rojas son las guardias de
censo de diff descritas arriba.

**Los flakes de saturación (2026-09-04, arreglado en QC-58 el 2026-09-08).** Hasta QC-58 el plazo
era `5000` —el default de Vitest— y ese número era literalmente la firma; desde QC-58 fueron
`15000`. Hasta el 2026-09-18 esta guía decía además que verlo con el plazo nuevo era «una señal
mucho más seria», porque 15 s no se agotan por contención de CPU sin más. **Eso quedó desmentido
ese día**: tres archivos distintos —`inventario/product-page` (que se pone 20 s por su cuenta),
`pedidos-ui/order-form` y `integration/infra/ciclo-de-vida-de-la-base`— cayeron por plazo en
corridas de **868 s, 489 s y 401 s** frente a los ~300 s de una corrida sana, y **los tres pasaron
en aislamiento**. Ninguno entró al baseline. **Desde el 2026-09-18 el plazo es `20000` en los tres
proyectos.** La causa: el campo controlado no llega a repintarse entre tecla y tecla cuando la
máquina va cargada, y la prueba escribe más rápido de lo que el campo se actualiza.

**Por qué bajar los workers no lo cura**, medido en esta máquina (12 núcleos, 25,5 GB de RAM,
3,4 GB libres) y sobre la misma rama:

| `--maxWorkers` | Resultado | Duración |
| --- | --- | --- |
| por defecto (12) | 2 archivos rojos | 114 s |
| 4 | 1 archivo rojo | 335 s |
| 2 | 1 archivo rojo | 541 s |

Una corrida anterior con `--maxWorkers=2` salió verde y **eso fue suerte, no prueba**: se tomó por
buena y llevó a proponer un límite de workers como arreglo del gate. Repetida, volvió a fallar. El
límite multiplica por cinco el tiempo del gate y no elimina el fallo, porque la causa no es cuántos
procesos hay sino que el plazo de 5 s era demasiado corto para `userEvent` en una máquina cargada.

**El arreglo de QC-58 (2026-09-08) fueron dos cosas a la vez**, porque eran dos causas:

- **El plazo**, declarado por proyecto: es opción por proyecto y confiar en la herencia es una
  apuesta que sale verde si la pierdes. Y a los tres, no sólo a `ui`: el mismo día falló
  `composition/identity-facade`, del proyecto `node`, que **no teclea nada** y murió cargando el
  barril de `@/lib/composition`. La causa es contención de CPU y no distingue de proyecto. Lo único
  que cuesta es que un test colgado de verdad tarda más en reportarse.
- **La forma de teclear.** Antes había 206 llamadas sueltas a `userEvent.setup()` repartidas por
  33 archivos; lo que se compró no fue quitar código duplicado —es una línea— sino que exista
  **un** sitio donde está escrito cómo se teclea en este repo, en vez de que la llamada 207 volviera
  a nacer mal sin que nadie lo decidiera. `delay: null` quita sólo la espera artificial entre
  eventos: la secuencia que recibe el DOM es idéntica y **no se relaja ninguna** comprobación de
  `user-event`, incluida la de `pointer-events`.

**La guardia** vive en las guardias a propósito: ningún grafo de imports seleccionaría ni la
configuración ni un test que nadie importa. Lee la configuración resuelta porque un `testTimeout`
escrito en un comentario o en la raíz satisface a un regex y no cambia nada; se probó con cuatro
mutaciones del archivo real, no sólo con su caso verde. Que el número esté escrito no prueba que
rija: se comprobó además **en ejecución**, con una sonda temporal por proyecto (un test de 7000 ms,
por encima del plazo viejo y por debajo del nuevo). Los tres pasaron con 15000 y los tres murieron
con `Test timed out in 5000ms` al volver a bajarlo. Las sondas **no se quedaron** en la batería:
pagar ~21 s de reloj en cada corrida para siempre, a cambio de algo que sólo puede cambiar si
alguien toca la config —y eso ya lo vigila la guardia—, es mal negocio. Cómo repetirlas está en
`progress/impl_QC-58-timeout-tests-ui-bajo-carga.md`.

**Sus tres entradas del baseline se retiraron en ese mismo cambio.** Mientras duró, **el baseline
se estaba usando para tapar un problema que no era suyo y crecía con cada feature**, que es
exactamente lo que su propia nota advierte que no debe pasar.

## Cuando lo que verificas es el gate mismo

Proceso del gate: `docs/gate.md > Cuando lo que verificas es el gate mismo`.

### Por qué

Las tres trampas conocidas pasaron de verdad en QuimiCloude, en la sesión del 2026-08-28 que
sustituyó la validación de `feature_list.json` basada en `jq`. Y la validación opcional también:
pasó aquí con `jq` —dos bloques mudos el tiempo suficiente para que nadie notara que sus dos `ok`
no se imprimían nunca— y volvió a pasar con el propio script que vino a reemplazarlo, esta vez
colgado de su propia existencia.

## La vuelta 2 del reviewer se acota a los arreglos (QC-170, 2026-10-02)

Proceso del gate: `docs/gate.md > La vuelta 2 del reviewer se acota a los arreglos`.

### Por qué

**El incidente.** En QC-170 el leader lanzó la vuelta 2 pidiendo la trazabilidad R1-R49
completa para unos arreglos localizados (B1-B4, m1-m6). El humano la paró («¿por qué
tarda tanto un arreglo, no debería ser algo aislado?»). La relanzada, acotada a
`d3e6470d..f6f1b05e`, dio OK con un menor nuevo.

## Regla del reviewer
Si un requisito no tiene test, o un test no verifica el requisito que dice cubrir,
es hallazgo bloqueante. La feature no pasa a `done`.
