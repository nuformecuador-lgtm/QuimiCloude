# docs/verification.md — Cómo demostrar que funciona

"Compila" y "el agente dice que está listo" NO son verificación. Una feature está
verificada cuando hay evidencia ejecutable.

## El gate tiene DOS niveles — usa el que toca

```bash
./init.sh --rapido   # CERRAR UNA TANDA: typecheck + lint + tests relacionados + guardias (~1 min)
./init.sh            # CERRAR LA FEATURE y ANTES DE CADA PR: la suite entera
```

Comandos sueltos, por si necesitas uno concreto:

```bash
pnpm run typecheck        # TypeScript strict, cero errores
pnpm run lint             # ESLint, cero errores
pnpm test                 # la suite entera
pnpm run test:rapido      # lo que el grafo relaciona con tu diff vs origin/dev + las guardias
pnpm run test:guardias    # solo las guardias (van SIEMPRE, ver abajo)
pnpm exec vitest related --run <archivos>   # que tests cubren ESTOS archivos
```

### Por que dos niveles

Una suite madura son miles de tests y varios minutos. Correrla al cerrar **cada** tanda convierte
el arnes en una sala de espera: una feature de 9 tandas se lleva media hora de reloj **solo
esperando**, y el arnes existe para mejorar el trabajo, no para alargarlo. Cerrar la feature y
abrir el PR son otra cosa: ahi si se paga la suite entera.

Referencia medida el 2026-08-03 sobre un proyecto anterior que corria este mismo arnes
(QuimiCloude todavia no tiene suite propia; estas cifras son de donde salio la regla, no
una medicion de este repo):

| Que corres | Archivos | Tests | Tiempo |
| --- | --- | --- | --- |
| suite entera | 804 | 10.187 | ~235 s |
| relacionados con un servicio | 16 | 437 | 21 s |
| relacionados con un cambio en un util muy importado | 155 | 2.577 | 103 s |
| **`./init.sh --rapido` entero** (typecheck + lint + tests) | — | — | **~58 s** |

### Las guardias van SIEMPRE, y esta es la razon

`--rapido` selecciona por el **grafo de imports**. Las guardias **no importan lo que vigilan**:
recorren el arbol de archivos (censo de tablas, columnas sensibles, modulos puros, emisores de una
categoria). **Ningun grafo de imports las selecciona**, asi que serian justo lo que se pierde. Por
eso `test:rapido` las corre enteras siempre; cuestan ~8 s.

Se seleccionan por patron (`vitest run guard`), no por lista: una guardia nueva entra sola.

### Lo que `--rapido` NO cubre — no te engañes

- Acoplamientos que **no son imports**: SQL, nombres de archivo, lectura de `feature_list.json`.
- Un cambio en un archivo **sin tests que lo importen** selecciona cero tests y sale verde.
- Regresiones lejanas que solo aparecen con la suite entera.

Por eso **antes de abrir un PR se corre `./init.sh` completo, sin excepcion**. La leccion viene de
dos PRs de un proyecto anterior con este arnes y va justo en esa direccion: se mergeo mirando el
estado del PR —que es un build y **no corre tests**— y entro un guard rojo en `dev`.

**Detalle que importa al seleccionar en modo rapido:** el diff se calcula contra el **merge-base**
con `dev`, no contra el ultimo commit, o una tanda de tres commits solo mira el tercero:

```bash
pnpm exec vitest related --run $(git diff --name-only origin/dev...HEAD)   # tres puntos
```

> **Estado en QuimiCloude (2026-08-26):** ya hay suite y configuracion, asi que los dos modos
> **si** hacen cosas distintas. `vitest.config.mts` monta dos proyectos (`ui` en jsdom, `node`)
> repartidos por convencion de nombre, y `tests/` tiene 10 archivos, 3 de ellos guardias
> (`tests/guards/`). `--rapido` selecciona por grafo y corre las tres guardias; el completo corre
> los 10.
>
> Lo que **no** te cubre todavia: con una suite tan pequena, `--rapido` se queda en cero tests
> relacionados con mucha facilidad y sale verde con solo las guardias. Y la tabla de tiempos de
> arriba es de otro proyecto — aqui la diferencia de reloj entre los dos modos es hoy
> despreciable. El motivo para correr `./init.sh` completo antes del PR no es el tiempo, es la
> cobertura.

### El gate regenera los artefactos antes de mirar nada (2026-09-12)

`init.sh` corre **siempre** `prisma generate` y `next typegen`, y reinstala si `pnpm-lock.yaml`
es más nuevo que `node_modules`. No es comodidad: es que **estos errores mienten sobre su causa**,
y el 2026-09-11 costaron cuatro paradas y una suite E2E entera caída sin que nadie lo supiera.

| Lo que sale por pantalla | Lo que parece | Lo que era |
|---|---|---|
| `Module '@prisma/client' has no exported member 'Prisma'` | versiones de Prisma peleadas | un `generate` que faltaba tras montar el worktree |
| `Cannot find name 'LayoutProps'` | un problema de Next | los tipos de ruta sin generar |
| `Cannot find module 'resend'` | **una dependencia metida sin aprobar** (regla 7) | estaba aprobada, documentada y en `package.json`; el `node_modules` del árbol principal se quedó corto tras el merge |
| `TypeError: Cannot read properties of undefined (reading 'clear')` en `window.localStorage.clear()` (proyecto `ui`) | un mock de storage roto en ese test | Node 22+ expone su propio `localStorage`/`sessionStorage` global y pisa el de jsdom; en Node 26 viene activo por defecto. `vitest.config.mts` ya pasa `--no-experimental-webstorage` al worker del proyecto `ui`, así que nadie debería verlo — si vuelve, es que algo corre ese proyecto sin pasar por esta config |
| `expected '23001' to be '23503'` en tests de `tests/integration/**` que borran una fila referenciada por FK con `RESTRICT` | el código de error cambió, o el test está mal | la base local corre en Postgres 18, y sobre 18.6 se reproduce que el `RESTRICT`/`NO ACTION` de una FK reporta `23001` (`restrict_violation`) donde 9 tests de esta rama esperan `23503` (`foreign_key_violation`); no se verificó aquí el changelog exacto de Postgres 18 que lo motiva, solo que 18.6 lo hace y 17 es el objetivo del proyecto (decisión humana, 2026-09-18: Supabase aún no está conectado y su canal estable es 17) |
| Retrato de catálogo con una fila de más en `pg_constraint` tras correr `down.sql` (`company-scope.int.test.ts` de proveedores y de recetas, «9 vs 10») | el `down.sql` dejó una restricción sin borrar | en Postgres 18 las restricciones `NOT NULL` (p. ej. `suppliers_company_id_not_null`) pasan a tener su propia fila en `pg_constraint` (`contype = 'n'`), algo que no existe en 17; el retrato se escribió asumiendo 17 |

El tercero es el que justifica la regla por sí solo: un síntoma de entorno **acusando a otra
sesión de saltarse una regla del arnés**. De ahí a «arreglar» algo que no está roto hay un paso.

**Versión objetivo de Postgres: 17**, no la que trae la instalación local. Ambas filas de arriba se
reprodujeron el 2026-09-18 contra Postgres 18.6 (`SELECT version()`); ninguna toca código de
producción ni de test para adaptarse a 18 — el remedio es correr la base local en 17, no mover la
meta.

**Coste medido el 2026-09-12**, no estimado: 12 s de `prisma generate` más 5 s de `next typegen`
en régimen estable; **128 s la primera vez** tras cambiar el esquema. Sobre el gate completo
(160–480 s) es un 4–10 %; sobre el rápido (~60 s), un 28 %. Se paga igual: **una sola corrida
repetida por entorno desfasado cuesta más que tres con estos pasos dentro**.

Los dos pasos **avisan y siguen** si fallan, nunca abortan. El gate de verdad es el `typecheck`
que viene después; si el artefacto no se pudo generar, el aviso explica de antemano el error
fantasma que va a salir. Un `fail` aquí dejaría sin gate a quien tenga el entorno a medias.

**Lo que esto NO cubre, y sigue siendo manual:** aplicar a la base las **migraciones** que traiga
un merge con `dev`. El gate regenera el *cliente* de Prisma, no ejecuta `migrate deploy`. Si tu
rama sincroniza y `dev` traía una migración, los tests de integración darán rojos que no son
tuyos hasta que la apliques. Está escrito en `AGENTS.md > F2.3`.

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
- **Verifica la autorizacion en el service**: un test que llame al metodo con un usuario
  sin permiso y confirme que lanza, sin llegar al repositorio. Ese es el test que cierra
  el requisito.
- Un test de RLS es **adicional**, y hay que saber leerlo: si lo escribes con Prisma
  saldra verde pase lo que pase, porque Prisma se conecta como dueño de la tabla y la
  policy no se le aplica (`docs/architecture.md > Acceso a datos y autorizacion`). Para
  que un test de RLS signifique algo tiene que ejercitar la via que RLS protege.
- Verifica migraciones aplicando y revirtiendo en un entorno de prueba: `down.sql` es
  convencion propia, nadie lo prueba por ti.
- **Los tests de integración necesitan `DATABASE_URL`, y el gate la carga él.** Nadie más lo
  hace: `prisma.config.ts` solo carga el `.env` para el CLI de Prisma, y Vitest no lo lee en
  este proyecto. Desde el 2026-09-08 `init.sh` lo carga antes de correr los tests, salvo que
  `DATABASE_URL` ya venga del entorno, en cuyo caso manda ésa. Antes de eso el veredicto del
  gate dependía del shell: la misma rama daba **23 archivos y 32 tests en rojo** desde un shell
  limpio y **1 archivo y 2 tests** con el `.env` cargado, y el rojo no decía «falta una
  variable» sino «Validation Error» de Prisma, que se lee como un fallo de código.

## Los tests de integración corren sobre una base propia y efímera (QC-77, 2026-09-12)

Complementa la nota del `.env` de arriba: el gate carga `DATABASE_URL` para saber **dónde está el
Postgres**, no para escribir en ella. Los tests de integración **no tocan la base de desarrollo**.

**Cada corrida del proyecto `integration` crea su propia base, copia de una plantilla ya migrada y
sembrada, y la borra al terminar pase lo que pase.** La regla es **la misma en `./init.sh` completo
y en `--rapido`**: no hay dos verdades, el enganche vive en el `globalSetup` del proyecto, no en el
modo del gate. La corrida dice por consola contra qué base va — una corrida de integración que no
lo dice no es auditable.

Lo que esto compró, medido en tres corridas seguidas de los 41 archivos / 630 casos: las tres en
verde, con base distinta cada una, y los **13 rojos** que la base compartida y sucia arrastraba
(`identity-constraints` e `identity-seed`) desaparecidos. La base de desarrollo quedó idéntica en
sus 20 tablas antes y después.

### La plantilla, y por qué la receta tiene cuatro pasos

`prisma migrate deploy` **no termina sobre una base vacía**, y eso es a propósito:
`20260911130000_inventory_company_scope` exige que exista la empresa inicial y falla cerrado
(QC-49 R3). Así que la plantilla se construye **migrar → sembrar → `migrate resolve
--rolled-back` → migrar**. La receta entera, con los detalles que no son obvios, está en
`specs/QC-77-aislamiento-de-la-base-en-tests-de-integracion/design.md > 3`; no se copia aquí para
que no haya dos versiones que se desincronicen.

Cuesta ~38 s, y **se pagan una vez por conjunto de migraciones, no por corrida**: el nombre de la
plantilla lleva una huella de las migraciones **y** del sembrado, así que mientras ninguno de los
dos cambie se reutiliza tal cual y la copia es un `CREATE DATABASE ... TEMPLATE`. Si cambian, el
nombre cambia, no existe esa plantilla y se construye sola. El nombre **es** la invalidación de
caché: no hay que acordarse de borrar nada.

### La base de desarrollo atrasada: avisa en amarillo, no falla

El bloque `6.c` de `init.sh` consulta el estado de la base de desarrollo antes de los tests y
**avisa; no cambia el código de salida del gate**. El porqué es una tarde perdida: el 2026-09-12 la
base iba cuatro migraciones atrás y eso dejó **22 archivos en rojo sin que nada dijera la causa**.
El aviso existe para explicar ese rojo **antes** de verlo. Bloquear un PR por el estado de una base
local sería un gate que se ignora, y el aviso distingue «va N atrás, la más antigua que falta es
X» de «no se pudo consultar: <razón>», que no son lo mismo.

**Lo que sí es `fail` es que falte `scripts/test-db.ts`.** Colgar el bloque de un `[ -f ... ]` con
un `warn` en el `else` sería exactamente el anti-patrón que este mismo archivo documenta más abajo:
en la máquina que no tenga el script, el check se salta entero y el gate sigue verde. Que el script
no exista es una rotura del arnés; que la base esté atrasada es la circunstancia que el bloque vino
a contar.

### `pnpm run db:test clean` — la regla de oro: ante la duda, NO borra

Las bases huérfanas de corridas muertas y las heredadas por worktree se barren con
`pnpm run db:test clean`. **Dry-run por defecto**: imprime la tabla con veredicto y razón por fila
y termina diciendo que no borró nada; hace falta `--force` para que muerda. Cinco guardas retienen
una base, y basta una: es la de desarrollo, el nombre no encaja en ninguna forma conocida, tiene
conexiones abiertas, su worktree o su rama `feature/QC-<n>-*` siguen vivos, o **no se pudo leer su
estado** (si git no responde, no se juzga: se retiene). Cada una se probó con su fixture y mordió
por su razón; con git inaccesible salen **cero** borrables.

Las **plantillas se listan aparte y no caen** en un barrido normal: son caché de esquema, no
basura, y se reconstruyen solas. Los otros subcomandos: `status` (estado de la base de desarrollo,
el que consume `init.sh`), `template` (construye o reutiliza la plantilla) y `list` (el inventario
sin borrar nada).

### El censo de aislamiento, y lo que su guardia NO comprueba

Todo archivo nuevo bajo `tests/integration/**` tiene que declarar en
`tests/integration/aislamiento.json` **cómo se aísla**: `transaccion` (transacción interactiva que
termina en `ROLLBACK`) o `commit` (escribe de verdad, o no escribe nada) y, si es `commit`, con
`motivo` y `desde` propios. Si falta, `tests/guards/guard-aislamiento-integracion.test.ts` pone el
gate en rojo. Vive en las guardias porque el censo es un JSON que no importa nadie: ningún grafo de
imports lo relacionaría con un cambio.

**Lo que la guardia no comprueba es que el modo declarado sea cierto.** Un archivo puede declararse
`transaccion` y committear, y saldría verde. Comprobarlo exigiría leer el código del test, y eso
está medido y no es fiable: un `grep` de `inRolledBackTransaction` devuelve **19** archivos cuando
la verdad son **18** — `identity/work-group-crud.int.test.ts` usa el patrón para un sondeo suelto y
el resto de sus casos committea. Una guardia que cuenta mal desde el primer día entrena a todos a
ignorarla. Lo que compra es más modesto y vale la pena: que nadie añada un archivo de integración
sin haber pensado cómo se aísla.

### Dos cosas medidas que conviene no volver a descubrir

- **El borrado del camino de señal (Ctrl-C) es síncrono a propósito.** Vitest, en su propio
  handler, hace `setTimeout(() => process.exit(), 1)`: un `DROP DATABASE` con `await` no llega a
  terminar. **Convertir `dropRunDatabaseSync` en `async` devuelve la base viva tras Ctrl-C.** Está
  comprobado con un Ctrl-C real a mitad de corrida, no razonado.
- **Un `SIGKILL` o cerrar la terminal no ejecuta nada**, y no hay handler que lo arregle. Esa base
  la recoge **la corrida siguiente**, que antes de crear nada barre los rastros de `.qc-test-db/`
  de este worktree cuyo pid ya está muerto, y dice por consola cuál borró y por qué.

## Rojos heredados: la pregunta es «¿rompí algo YO?»

Cuando `dev` arrastra tests rojos que no son tuyos, la suite completa termina siempre en rojo y
el gate deja de responder lo único que importa al cerrar una feature. Comparar a mano contra un
número que viaja por el chat no escala: en una sola feature de un proyecto anterior hubo que
hacerlo **ocho veces** y una se concluyó mal.

Por eso el modo completo no exige que la suite esté verde, sino que **no aparezca ningún archivo
de test rojo que no estuviera ya en `tests/baseline-rojos.json`**.

- **La comparación es por archivo, no por conteo.** Una suite grande tira 2–5 flakes de
  saturación que cambian de sitio —se midieron 30, 31 y 32 rojos sobre el mismo código—, así
  que exigir conteos exactos daría falsas alarmas constantes, y un gate que grita en falso se
  ignora. **Qué son exactamente esos flakes y qué NO los cura: la subsección de abajo.**
- **Coste aceptado:** si un archivo ya listado gana un rojo nuevo de verdad, no lo ves. A cambio
  la pregunta que sí responde —«¿apareció un archivo que antes no fallaba?»— aguanta el ruido.
- **Cada entrada del baseline necesita `motivo` y `desde`**, y el comparador falla si faltan.
  Sin eso la lista se vuelve el sitio donde cualquiera mete lo que le estorba.
- **Un archivo del baseline que ya pasa** genera aviso, no rojo; toca borrarlo de la lista.
  Sólo se avisa si esa corrida lo ejecutó: calcular `baseline − rojos` parece natural y está
  **mal**, porque un archivo que no corrió no dice nada. Esa versión, con fixtures de dos
  archivos, pedía limpiar 6 de las 7 entradas —una falsa alarma en el primer uso—.

**Al sembrarlo:** mídelo en una rama que sea `dev` más archivos que no toquen producto, para
saber que la deuda es de `dev` y no tuya. Y síémbralo con pocas entradas: si nace con cincuenta,
nadie lo va a limpiar nunca.

> **Estado en QuimiCloude (2026-09-18):** el baseline tiene **ocho** entradas y **seis de ellas ya
> pasan**. Eso es una regresión del propio baseline, no del código: la lista creció feature a
> feature y nadie la podó. Hasta el 2026-09-08 tenía **dos** —eran cinco, y QC-58 retiró las tres
> de los flakes de saturación **en el mismo cambio que arregló la causa**, que es lo que hace que
> un arreglo cuente—. Las seis que sobran las señala el comparador en cada corrida completa
> («aviso: N archivo(s) del baseline ya pasan; toca limpiarlos»), y **desde el 2026-09-18 atender
> ese aviso es obligación del leader al cerrar cada feature** (`AGENTS.md`, paso F2.6): se borra lo
> que ya pasa, o se dice por escrito por qué se queda.
>
> Las dos que sí siguen rojas son de la misma especie y **ninguna es deuda de código**: son
> guardias que censan el diff de rama o el `package.json` contra `dev`, y por tanto las rompe
> cualquier feature posterior con una dependencia legítima y aprobada —`resend` en QC-79,
> `@google/genai` en QC-108—. El coste está anotado en cada `motivo` y no es menor: al ser la
> comparación **por archivo**, esos archivos quedan ignorados **también en las ramas de feature
> donde sus guardias sí morderían**. Arreglar la clase entera es **QC-99**.

### Los flakes de saturación: qué son, qué NO los cura, y cómo se curaron (2026-09-04, arreglado en QC-58 el 2026-09-08)

Los «2–5 flakes de saturación» de arriba tienen una firma concreta, y merece la pena reconocerla
antes de perder una tarde: **`Test timed out in <plazo>ms`, en un test de UI que escribe con
`userEvent`**. Hasta QC-58 ese plazo era `5000` —el default de Vitest— y ese número era
literalmente la firma; desde QC-58 son `15000`. Hasta el 2026-09-18 esta guía decía además que
verlo con el plazo nuevo era «una señal mucho más seria», porque 15 s no se agotan por contención
de CPU sin más. **Eso quedó desmentido ese día y se corrige aquí**: tres archivos distintos
—`inventario/product-page` (que se pone 20 s por su cuenta), `pedidos-ui/order-form` y
`integration/infra/ciclo-de-vida-de-la-base`— cayeron por plazo en corridas de **868 s, 489 s y
401 s** frente a los ~300 s de una corrida sana, y **los tres pasaron en aislamiento**. Ninguno
entró al baseline. La firma sigue siendo útil para reconocerlo; lo que ya no vale es tratarla como
prueba de gravedad. **Desde el 2026-09-18 el plazo es `20000` en los tres proyectos**, y la
comprobación barata de siempre —correr el archivo solo— sigue siendo la que decide. El campo
controlado no llega a repintarse entre tecla y tecla cuando la máquina va cargada, y la prueba
escribe más rápido de lo que el campo se actualiza. El síntoma clásico es que
las letras salgan intercaladas —`xxxxxAxcxixdxox` donde debía salir `Acido citrico`—.

**Cómo distinguirlo de un rojo de verdad**, y es barato: corre el archivo **solo**. Si pasa en
aislado y falla en la suite, es saturación. Si falla también solo, es tuyo. La otra comprobación,
cuando sospechas de una rama, es correrlo en `dev` sin tu rama encima.

**Lo que NO lo cura: bajar los workers de vitest.** Es la primera idea que se le ocurre a
cualquiera y está medida, en esta máquina (12 núcleos, 25,5 GB de RAM, 3,4 GB libres) y sobre la
misma rama:

| `--maxWorkers` | Resultado | Duración |
| --- | --- | --- |
| por defecto (12) | 2 archivos rojos | 114 s |
| 4 | 1 archivo rojo | 335 s |
| 2 | 1 archivo rojo | 541 s |

Una corrida anterior con `--maxWorkers=2` salió verde y **eso fue suerte, no prueba**: se tomó por
buena y llevó a proponer un límite de workers como arreglo del gate. Repetida, volvió a fallar.
Queda escrito para que el siguiente no recorra el mismo callejón: el límite multiplica por cinco
el tiempo del gate y no elimina el fallo, porque la causa no es cuántos procesos hay sino que el
plazo de 5 s es demasiado corto para `userEvent` en una máquina cargada.

**El arreglo entró en QC-58 (2026-09-08), y fueron las dos cosas a la vez**, porque eran dos
causas y no una:

- **El plazo.** `testTimeout: 15_000` declarado **dentro del bloque `test` de cada uno de los tres
  proyectos** (`ui`, `node`, `integration`), nunca en la raíz de `vitest.config.mts`: es opción por
  proyecto y confiar en la herencia es una apuesta que sale verde si la pierdes. Y a los tres, no
  sólo a `ui`: el mismo día falló `composition/identity-facade`, del proyecto `node`, que **no
  teclea nada** y murió cargando el barril de `@/lib/composition`. La causa es contención de CPU y
  no distingue de proyecto. Lo único que cuesta es que un test colgado de verdad tarda 15 s en
  reportarse en vez de 5.
- **La forma de teclear.** Una sola definición compartida, `setupUser()` en
  `tests/helpers/user-event.ts`, con `delay: null`. Antes había 206 llamadas sueltas a
  `userEvent.setup()` repartidas por 33 archivos; lo que se compró no fue quitar código duplicado
  —es una línea— sino que exista **un** sitio donde está escrito cómo se teclea en este repo, en
  vez de que la llamada 207 volviera a nacer mal sin que nadie lo decidiera. `delay: null` quita
  sólo la espera artificial entre eventos: la secuencia que recibe el DOM es idéntica y **no se
  relaja ninguna** comprobación de `user-event`, incluida la de `pointer-events`.

Las dos mitades las vigila `tests/guards/guard-teclear-y-plazo.test.ts`, que vive en las guardias
a propósito: ningún grafo de imports seleccionaría ni la configuración ni un test que nadie
importa. La guardia lee la **configuración resuelta**, no el texto del archivo —un `testTimeout`
escrito en un comentario o en la raíz satisface a un regex y no cambia nada—, y se probó con
cuatro mutaciones del archivo real, no sólo con su caso verde.

Que el número esté escrito no prueba que rija: se comprobó además **en ejecución**, con una sonda
temporal por proyecto (un test de 7000 ms, por encima del plazo viejo y por debajo del nuevo). Los
tres pasaron con 15000 y los tres murieron con `Test timed out in 5000ms` al volver a bajarlo. Las
sondas **no se quedaron** en la batería: pagar ~21 s de reloj en cada corrida para siempre, a
cambio de algo que sólo puede cambiar si alguien toca la config —y eso ya lo vigila la guardia—,
es mal negocio. Cómo repetirlas está en `progress/impl_QC-58-timeout-tests-ui-bajo-carga.md`.

**Sus tres entradas del baseline se retiraron en ese mismo cambio**, que es lo que hace que el
arreglo cuente: si la causa se arregla y las entradas se quedan, el gate sigue ciego sobre esos
archivos y nadie se entera. Ahí estaba el coste mientras duró: **el baseline se estaba usando para
tapar un problema que no era suyo y crecía con cada feature**, que es exactamente lo que su propia
nota advierte que no debe pasar.

## Cuando lo que verificas es el gate mismo

Un check que no corre es peor que uno que no existe: crees que te cubre. Al tocar `init.sh`,
`scripts/` o una guardia no basta con que el gate salga verde — hay que comprobar que
**muerde**. Se rompe al revés que el código normal, y estas son las formas conocidas de
equivocarse.

### Probar que muerde, no que pasa

Para cada validación nueva, un fixture por desenlace: el caso correcto (`exit 0`) y **uno por
cada motivo de fallo** (`exit 1`, con el mensaje nombrando qué falla). Y después la prueba que
de verdad convence: **rompe el archivo real** —inyecta el dato inválido en `feature_list.json`,
renombra el script—, corre el gate completo, confirma que sale con 1 y restaura. Un check
probado solo con su caso verde no está probado.

Restaura desde una copia (`cp`), no con `git checkout`: el archivo puede tener cambios sin
commitear que no son tuyos.

### Trampas conocidas

Las tres pasaron de verdad, en la sesión del 2026-08-28 que sustituyó la validación de
`feature_list.json` basada en `jq`:

- **No pipees el gate a `head` o `tail` para leer el código de salida.** El estado de una
  tubería es el del último comando, así que verás `0` aunque el gate haya fallado. Redirige a
  un archivo y lee `$?`.
- **Un mensaje de fallo no debe prometer un detalle que no entrega.** `$(...)` captura solo
  stdout; si los errores del script van a stderr, un `fail "invalido: $SALIDA"` imprime
  `invalido:` y nada más. O capturas `2>&1`, o dejas que stderr salga por su cuenta y el
  mensaje no promete nada.
- **Tocar `init.sh` o `scripts/` hace que el modo rápido se niegue a cubrirte.** Es correcto:
  son cimientos, ahí se corre el completo.

### El anti-patrón: la validación opcional

Una validación colgada de `if command -v <herramienta>` o `if [ -f <script> ]` con un `warn` en
el `else` **no es una validación**: en la máquina que no tenga eso, se salta entera y el gate
sigue en verde. Pasó aquí con `jq` —dos bloques mudos el tiempo suficiente para que nadie
notara que sus dos `ok` no se imprimían nunca— y volvió a pasar con el propio script que vino a
reemplazarlo, esta vez colgado de su propia existencia. Si el check importa, lo que va en el
`else` es `fail`; si no importa, bórralo. Instalar la herramienta que falta no arregla nada:
mueve el problema a la siguiente máquina.

Corolario: **antes de escribir un check, mira si ya existe.** Dos validadores con nombres
parecidos e `init.sh` llamando a uno solo es la misma enfermedad con mejor disfraz.

Los avisos propios de `scripts/validate-features.mjs` —no ampliar la comprobación de specs a
las fichas `done`, no cambiar el máximo por zona sin mirar `CLAUDE.md` / `AGENTS.md`— viven
como comentarios en el script, que es donde se leen en el momento de romperlos.

## La vuelta 2 del reviewer se acota a los arreglos (QC-170, 2026-10-02)

Tras un RECHAZADO, lo que cambió es el diff de los arreglos, no la feature. Revisar la
feature entera otra vez repite un trabajo ya hecho y no añade cobertura: la red contra
regresiones fuera del diff ya existe, y es el `./init.sh` completo y el E2E de F2.4.

**El incidente.** En QC-170 el leader lanzó la vuelta 2 pidiendo la trazabilidad R1-R49
completa para unos arreglos localizados (B1-B4, m1-m6). El humano la paró («¿por qué
tarda tanto un arreglo, no debería ser algo aislado?»). La relanzada, acotada a
`d3e6470d..f6f1b05e`, dio OK con un menor nuevo.

**Qué se acepta a cambio.** Una regresión fuera del diff de los arreglos no se ve hasta
el gate completo de F2.4. Por eso ese gate y el E2E siguen siendo obligatorios antes del
PR, sin excepción.

**Cómo queda escrito.** Cada vuelta va como sección añadida al final de
`progress/review_<feature>.md`: `## Vuelta N (acotada a <A>..<B>)`. Si el leader amplió,
el título dice cuál de las excepciones de `AGENTS.md > F2.2` aplicó.

## Regla del reviewer
Si un requisito no tiene test, o un test no verifica el requisito que dice cubrir,
es hallazgo bloqueante. La feature no pasa a `done`.
