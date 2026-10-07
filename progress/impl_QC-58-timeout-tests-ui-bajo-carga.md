# QC-58 — timeout-tests-ui-bajo-carga · bitácora de implementación

> Worktree `.worktrees/QC-58-timeout-tests-ui-bajo-carga`, rama
> `feature/QC-58-timeout-tests-ui-bajo-carga`, partiendo de `3db9b44`. Fecha: **2026-09-08**.
> Escrita por el `implementer`. **No se autoaprueba**: el veredicto lo pone el reviewer.

## Veredicto corto

**Ronda 2 (2026-09-08).** El `reviewer` **RECHAZÓ** sobre `d1e966d` con 1 mayor y 7 menores.
Atendidos: el mayor —R6 se cumplía sólo en la mitad que la guardia miraba— y los siete menores,
salvo el 6, que es de T11 y por tanto del leader. El detalle está al final, en
`## Ronda 2 — lo que pidió la review`. **No me autoapruebo:** vuelve a decidir el reviewer.

**Actualizado el 2026-09-08, segunda tanda.** El bloqueo está **resuelto** con la decisión humana de
ese día (salida 2 de las tres que se propusieron): T4c y T4e cerradas, y **T5 en verde**. Van
**15 de 17 tasks**. Quedan sólo **T11** (las cinco corridas de la batería completa) y **T12**
(cierre de bitácora), que **corre el leader, no el implementer**.

> *Lo que decía esta sección en la primera tanda:* «12 de 17 tasks cerradas. La ficha NO está lista
> para PR: hay un bloqueo que necesita decisión humana porque choca de frente con la decisión
> cerrada n.º 3 y con R9. Sin resolver el bloqueo no tiene sentido correr T11: se sabe de antemano
> que saldría roja por `unit-select.test.tsx`.» Se conserva porque el camino importa: el bloqueo
> existió y se paró en él en vez de improvisar.

Todo lo demás —el plazo, el helper, la guardia probada con cuatro mutaciones, la sonda de ejecución,
el baseline y el rastro escrito— seguía hecho y verificado desde la primera tanda.

**Tercera tanda (2026-09-08).** Las cinco corridas de T11 destaparon un **tercer** archivo con la
misma causa —`proveedores-ui/catalog-line-sheet.test.tsx`, que sólo falla con la máquina saturada—.
Se aplicó la misma decisión y, además, **se barrieron los 33 archivos migrados** en busca del mismo
patrón: **21 sitios en 13 archivos**. El detalle, y por qué un `--rapido` verde no bastaba para
verlo, está en `### El tercer archivo…` más abajo. Las tasks siguen siendo las mismas 15 de 17: T11
vuelve a empezar y la corre el leader.

---

## BLOQUEO — RESUELTO el 2026-09-08 (decisión humana)

### Cómo se resolvió, y quién lo decidió

**Lo decidió el humano el 2026-09-08**, eligiendo la **salida 2** de las tres que esta bitácora
había propuesto: **esperar explícitamente a que la opción sea interactiva antes de pincharla**, en
los dos archivos afectados. Queda escrito en `requirements.md > Decisiones cerradas` como la
**novena** fila. Lo que la decisión fija:

- Los dos archivos **siguen migrados** a `setupUser()`. No se saca ninguno de la migración.
- **No se añade ninguna excepción** a `EXCEPCIONES_DECLARADAS` de la guardia: siguen siendo tres
  (el helper, `async-autocomplete` y el propio archivo de la guardia). Pasar de 1 a 3 excepciones
  habría erosionado justo lo que la ficha compra.
- **No se reabre la decisión cerrada n.º 3**: `delay: null` y helper sin parámetros, intactos.
- **No se relaja ni se borra ninguna aserción.** Se *añade* una espera a la precondición.

Forma aplicada: `esperarInteractiva(elemento)`, que espera a que el elemento deje de tener
`pointer-events: none` y lo devuelve, de modo que se encaja dentro del `click` que ya había:

```ts
await user.click(disparador);
await user.click(await esperarInteractiva(await screen.findByTestId('unit-option-none')));
```

`toHaveStyle` es de `jest-dom`, que el proyecto `ui` ya carga en `tests/setup.ts`: **no entra
ninguna dependencia nueva**. En `unit-select.test.tsx` son **dos** los casos que pinchan una opción
(la primera unidad y «sin unidad»), no uno: los dos llevan la espera.

**Resultado medido de la primera pasada** (`pnpm exec vitest run` de los dos archivos, tres corridas
seguidas): `2 passed | 17 tests passed` en las tres. El intermitente de `data-table-pagination` no
reapareció.

### El tercer archivo, y por qué sólo se vio con la batería completa (2026-09-08, tercera tanda)

**Lección de método, y es la que esta ficha existe para dejar escrita:** un `--rapido` verde **no
descarta** este fallo. Las cinco corridas de T11 destaparon un tercero con la misma causa:

```
tests/unit/proveedores-ui/catalog-line-sheet.test.tsx
  «linea de catalogo — alta (R29, R37, R38, R41, R43)»
  > «captura los campos de negocio y los envia por la operacion de alta, con el proveedor oculto»
Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
DIV(testId=unit-option)
  ❯ assertPointerEvents .../utils/pointer/cssPointerEvents.js:45:15
```

Falló en las corridas **1 y 2** de `./init.sh` completo y pasó en la 3. Ese archivo **sí** estaba en
el grafo de mi `--rapido`, y el `--rapido` salió verde: con la máquina saturada por la batería
entera, el popup tarda más en soltar `pointer-events` y la ventana se abre. Es exactamente el
fenómeno de saturación que la ficha ataca, visto desde dentro de la propia ficha.

Consecuencia de método, para el siguiente: **la ausencia de este fallo no se puede medir con
`--rapido` ni con corridas en aislado.** O se corre la batería completa, o se elimina la ventana por
construcción. Se hizo lo segundo.

Y consecuencia práctica: ese archivo es **uno de los tres que T9 retiró del baseline** (R10)
atribuyendo su rojo a esta misma causa. Dejarlo así habría sido lo peor de las dos opciones —fuera
del baseline y rojo—, así que R10 depende de este arreglo.

#### El barrido: se arreglaron 13 archivos, no sólo el que falló

En vez de esperar a que cada bomba explote a razón de una corrida de T11 (~3 min) cada una, se
barrieron los 33 archivos migrados buscando el patrón entero —un `click` sobre el contenido de un
popup de Base UI (`Select`, `Menu`, `Popover`) recién abierto— y se les puso la espera **aunque hoy
estén verdes**:

| Archivo | Dónde | Estado antes |
| --- | --- | --- |
| `proveedores-ui/unit-select.test.tsx` | 2 sitios (`unit-option`, `unit-option-none`) | ❌ rojo determinista |
| `shared/data-table-pagination.test.tsx` | 1 sitio (`data-table-page-size-<n>`) | ❌ rojo ~1 de cada 3 |
| `proveedores-ui/catalog-line-sheet.test.tsx` | 2 sitios (`elegirPresentacion`, `elegirUnidad`) | ❌ **rojo sólo bajo carga** |
| `shared/data-table-header-menu.test.tsx` | 3 sitios (sort, pin, abrir filtro) | verde |
| `shared/data-table-filters.test.tsx` | 2 sitios (opción de select, atajo de fecha) | verde |
| `shared/data-table-filter-date.test.tsx` | 3 sitios (atajos y primer día del calendario) | verde |
| `pedidos-ui/order-form.test.tsx` | 1 sitio (opción del selector de receta) | verde |
| `pedidos-ui/order-sheet.test.tsx` | 1 sitio (ídem) | verde |
| `pedidos-ui/order-table.test.tsx` | 1 sitio (opción del filtro de estado) | verde |
| `pedidos-ui/recipe-picker.test.tsx` | 1 sitio (receta de la 2.ª página) | verde |
| `recetas-ui/recipe-form.test.tsx` | 2 sitios (producto y unidad de la línea) | verde |
| `proveedores-ui/supplier-detail-page.test.tsx` | 1 sitio (ordenar desde el menú de columna) | verde |
| `inventario/product-page.test.tsx` | 1 sitio (ídem) | verde |

**21 sitios en 13 archivos.** Los diez «verde» no son verdes por diseño: son verdes por la misma
razón por la que `catalog-line-sheet` lo era en `--rapido`.

> *Corregido el 2026-09-08 tras la review (menor 1): esta bitácora decía «20 sitios» en cinco
> sitios, y en `tasks.md > T4e`, cuando la tabla de aquí arriba suma **21** y el `grep` sobre el
> árbol da 21. Era un error de suma, no un sitio sin arreglar; los archivos sí eran 13.*

#### Una decisión mía: el helper deja de ser local

Con tres archivos, un helper local por archivo era razonable. Con **trece**, copiar trece veces el
mismo comentario de diez líneas es literalmente el antipatrón que esta ficha vino a matar —las 206
llamadas sueltas sin un sitio donde estuviera escrito el criterio—. Así que `esperarInteractiva`
vive **junto a `setupUser()`**, en `tests/helpers/user-event.ts`, que ya es el sitio donde este repo
explica `delay: null` y `pointer-events`. **No es un archivo nuevo ni una dependencia nueva**, y
revertirlo a locales es mecánico si el reviewer lo prefiere.

Y **R9 se reformuló** en `requirements.md` para que esto conste como cambio deliberado y aprobado en
vez de como incumplimiento, dejando por escrito la redacción anterior y por qué cambia
(`requirements.md > R9 — la versión anterior y por qué cambia`).

---

### El problema original, tal como se describió (se conserva)

### Qué pasa

La decisión cerrada n.º 3 manda migrar los 33 archivos a una sesión de `user-event` **sin retardo
entre teclas** (`delay: null`). Al hacerlo, **dos archivos empezaron a fallar por una causa nueva
que el spec no previó**, y que no es un timeout:

```
Error: Unable to perform pointer interaction as the element has `pointer-events: none`:
DIV(testId=unit-option-none)
```

| Archivo | Antes de migrar | Después de migrar | Carácter |
| --- | --- | --- | --- |
| `tests/unit/proveedores-ui/unit-select.test.tsx` | **3/3 verde** | **falla 6 de 6** | determinista |
| `tests/unit/shared/data-table-pagination.test.tsx` | **5/5 verde** | falla ~1 de cada 3 | intermitente |

Sobre los **33 archivos migrados corridos juntos: 450 casos, 449 en verde, 1 rojo** — o sea, el
radio de daño es pequeño y está acotado a estos dos.

### Por qué pasa

Los dos casos hacen lo mismo: abren un popup (un `Select` / menú de Base UI) y **pinchan una opción
inmediatamente después**. Esos popups llevan `pointer-events: none` mientras entran y lo quitan un
tick después. Por defecto `user-event` intercala un `setTimeout(0)` entre cada evento, y ese salto
al event loop era justo el respiro que dejaba al popup volverse interactivo. `delay: null` lo quita.

Conviene decirlo claro porque es contraintuitivo: **la comprobación de `pointer-events` no se está
relajando, se está cumpliendo**. El helper dice —correctamente— que `delay: null` no relaja nada,
incluida la de `pointer-events`. El problema es el contrario: ahora muerde donde antes no llegaba a
mirar. No es un fallo de producto; el componente funciona.

### Por qué NO lo he arreglado por mi cuenta

Porque la instrucción es explícita: las 8 decisiones cerradas no se reabren y, si algo del diseño
no encaja, se para y se pregunta. Y esto encaja mal de dos maneras a la vez:

- **Contra R9**, que exige que la migración *no cambie el comportamiento observable* de los tests
  migrados. Aquí lo cambia: un caso verde pasa a rojo determinista.
- **Contra la decisión n.º 3**, que quiere *una sola* forma de teclear. Cualquier salida razonable
  o bien añade una excepción (y son dos, no una), o bien toca los tests (que la task describe como
  cambio «mecánico de una línea»).

Subir el plazo a 15 s **no lo cura**: no es una espera que se agote, es una aserción que falla al
instante.

### Las tres salidas que veo, para que se elija una

1. **Meter los dos archivos en `EXCEPCIONES_DECLARADAS` de la guardia**, con su motivo escrito.
   Barato y honesto, pero deja dos excepciones más y erosiona justo lo que la ficha compra.
2. **Esperar a que la opción sea interactiva antes de pinchar** en esos dos casos (un `waitFor`
   sobre el `pointer-events` de la opción, o un `findBy*` previo). **No relaja ninguna aserción**:
   pide explícitamente el mismo respiro que antes se obtenía por accidente del `setTimeout(0)`. Es
   la que a mi juicio envejece mejor, pero **toca el cuerpo de dos tests**, y eso excede el
   «cambio mecánico de una línea» que describe el bloque B.
3. **Sacar los dos archivos de la migración** y dejarles su `userEvent.setup()` con el retardo por
   defecto, declarándolo como excepción de R8 igual que `async-autocomplete`.

**No he tocado ninguna de las tres.** Los dos archivos están migrados y `unit-select` está rojo,
que es el estado que refleja fielmente el problema.

*(Hasta aquí la descripción original. La elegida fue la 2; ver arriba.)*

---

## Alcance (R17) — comprobado

`git diff --name-only origin/dev...HEAD` más los cambios sin commitear **no contienen ninguna ruta
bajo `app/`, `lib/`, `components/`, `db/` ni el middleware**. Comprobado con:

```
{ git diff --name-only; git status --short | awk '{print $2}'; } | sort -u \
  | grep -E "^(app|lib|components|db)/|^middleware"   ->   sin resultados
```

## E2E (R18) — no hay, y es deliberado

Esta ficha **no cambia ningún comportamiento de la aplicación**: cambia cuánto espera la batería y
cómo teclea. Un E2E ejercita la aplicación en un navegador y aquí no habría nada nuevo que
ejercitar. La prueba que corresponde son las cinco corridas de la batería completa (R13, T11), que
están **pendientes por el bloqueo** y que además corre el leader, no yo.

---

## Archivos creados / modificados

**No hubo que delegar en `frontend_dev` ni en `backend_dev`**: la ficha no tiene ni un componente
ni un servicio: es configuración de pruebas, un helper, una guardia y dos archivos de rastro.

### Creados (2)

| Archivo | Qué es |
| --- | --- |
| `tests/helpers/user-event.ts` | La definición compartida `setupUser()` (R5). Se le mudó el comentario largo que vivía en `recipe-form.test.tsx:191-200`. **Desde la tercera tanda (2026-09-08) aloja también `esperarInteractiva()`**, la espera a que un popup de Base UI suelte `pointer-events: none`, usada en 21 sitios de 13 archivos. |
| `tests/guards/guard-teclear-y-plazo.test.ts` | La guardia de las dos mitades (R2, R7). 4 casos; **5 desde la ronda 2**, con el que persigue la API directa de `user-event`. |
| `tests/unit/esperar-interactiva.test.tsx` | **Ronda 2 (menor 5).** Prueba que la espera del helper espera de verdad y comprueba de verdad: sus dos casos se ponen rojos si alguien le quita el `waitFor`. |

### Modificados de configuración y rastro (4)

| Archivo | Qué cambió |
| --- | --- |
| `vitest.config.mts` | `testTimeout: 15_000` **dentro del bloque `test` de cada uno de los tres proyectos**. No se tocó `maxWorkers` ni `fileParallelism` (R4). |
| `tests/baseline-rojos.json` | De 5 entradas a 2 (R10, R11, R12). |
| `docs/verification.md` | Los dos sitios de `design.md > 6` (R16). La tabla de `--maxWorkers` **se conserva entera**. |
| `specs/QC-58-.../tasks.md` | Marcado de tasks + las dos notas de bloqueo. |

### Migrados a `setupUser()` (32 archivos)

`tests/ui/login-form-uncontrolled-warning` · `tests/unit/`: `app-sidebar`, `credential-field`,
`login-form`, `nav-user`, `sidebar-ajuste`, `sidebar-desktop`, `sidebar-mobile` ·
`tests/unit/shared/`: `data-table-filter-date`, `data-table-filters`, `data-table-header-menu`,
`data-table-pagination`, `data-table-viewport` · `tests/unit/pedidos-ui/`: `cancel-order-dialog`,
`delete-order-dialog`, `order-form`, `order-row-wiring`, `order-sheet`, `order-table`,
`pedidos-viewport`, `recipe-picker` · `tests/unit/proveedores-ui/`: `catalog-line-sheet`,
`delete-catalog-line-dialog`, `supplier-detail-page`, `supplier-page`, `unit-select` ·
`tests/unit/recetas-ui/`: `recipe-form`, `recipe-lines-unavailable`, `recipe-page`,
`recipe-step-editor`, `step-reader` · `tests/unit/inventario/product-page`.

Y `tests/unit/async-autocomplete.test.tsx`, que **no se migra**: sólo se le amplió el comentario
para dejar declarada la excepción (R8).

### Tres cosas que conviene que el reviewer sepa

1. **`ReturnType<typeof userEvent.setup>` pasó a `ReturnType<typeof setupUser>`** en 10 archivos que
   usaban `userEvent` sólo como tipo. Sin eso el import quedaba huérfano y lo cazaba el lint.
2. **`order-table.test.tsx` y `order-row-actions.test.tsx` conservan `userEvent.click(...)` directo**
   (la API sin `setup()`). No son llamadas a `userEvent.setup(`, así que ni R6/R7 ni la guardia las
   alcanzan, y migrarlas habría sido ampliar el alcance por mi cuenta. **Lo dejo señalado como
   deuda visible**, no como algo hecho.
3. **`recipe-form.test.tsx` mantiene su `vi.setConfig({ testTimeout: 30_000 })`** propio. Se
   corrigieron dos frases de sus comentarios que ya no eran ciertas (decían que el default era
   5000 ms y que `setupUser` se definía «más abajo»).

## Dos gaps de montaje del worktree (no son de esta ficha, pero me bloquearon)

El worktree venía sin dos cosas que `./init.sh` no genera, y **sin ellas no arranca ni la batería ni
el typecheck**. Ninguna toca archivos versionados:

| Síntoma | Comando que lo resuelve |
| --- | --- |
| `Cannot find module '.prisma/client/default'` — 7 suites de `pedidos-ui` caían con 0 tests | `pnpm exec prisma generate` |
| `app/layout.tsx(43,56): error TS2304: Cannot find name 'LayoutProps'` en `pnpm run typecheck` | `pnpm exec next typegen` |

Vale la pena que `docs/worktrees.md` o `init.sh` lo recojan: los dos fallos parecen rojos de código
y no lo son.

---

## R9 — conteo de casos por carpeta, ANTES y DESPUÉS

El conteo previo se tomó **antes** de tocar cada carpeta, con
`pnpm exec vitest run --reporter=json <rutas>`, que da casos por archivo. Es lo que hace
verificable que la migración no perdió ni cambió ningún caso.

| Bloque | Carpeta | Casos ANTES | Casos DESPUÉS | ¿Igual? |
| --- | --- | --- | --- | --- |
| T4a+T4b | 7 de `tests/unit/` + `tests/ui/` | **89** (89 ok) | **89** (89 ok) | sí |
| T4c | `tests/unit/shared/` (13 archivos) | **149** (149 ok) | **149** (149 ok tras el arreglo del 2026-09-08; antes 148 ok + 1 rojo intermitente) | sí |
| T4d | `tests/unit/pedidos-ui/` (16 archivos) | **166** (163 ok, 3 skip) | **166** (163 ok, 3 skip) | sí |
| T4e | `tests/unit/proveedores-ui/` (12 archivos) | **147** (143 ok, 4 skip) | **147** (143 ok, 4 skip, tras el arreglo del 2026-09-08; antes 142 ok + 1 rojo determinista) | sí |
| T4f | 5 de `recetas-ui/` + `inventario/product-page` | **122** (122 ok) | incluido en los 450 de abajo, sin rojos | sí |
| — | `async-autocomplete` (no migrado) | **10** (10 ok) | **10** (10 ok) | sí |

**Ningún caso quedó en `skip` ni en `todo` por esta migración**: los 3 `skip` de `pedidos-ui` y los
4 de `proveedores-ui` ya estaban antes, con el mismo número.

**Los 33 archivos migrados corridos juntos** (que es la comprobación que importa, porque es
exactamente «lo que mi cambio toca o puede romper»):

```
$ pnpm exec vitest run <los 33 archivos>
casos 450 | passed 449 | failed 1
--- proveedores-ui/unit-select.test.tsx
    selector de unidad de la linea (R40, R46) elegir «sin unidad» despues de haber elegido una
    Error: Unable to perform pointer interaction as the element has `pointer-events: none`
```

**T4e, línea base de T9** — los dos archivos que salían del baseline, corridos **solos**:

```
$ pnpm exec vitest run tests/unit/proveedores-ui/catalog-line-sheet.test.tsx \
                       tests/unit/proveedores-ui/supplier-page.test.tsx
 Test Files  2 passed (2)
      Tests  50 passed (50)          <- exactamente el «50/50 verde» que decía su motivo
```

### Un dato de terreno que vale la pena guardar

Durante la toma de conteos **previos** (o sea, con el código sin tocar y el plazo aún en 5000 ms),
`tests/unit/shared/` falló una vez en `data-table-alcance.test.ts` y pasó 13/13 al repetirla. Es el
flake de saturación que esta ficha ataca, cazado en vivo antes del arreglo.

---

## Trazabilidad R\<n\> → test / evidencia (los 18 requisitos)

Los requisitos de esta ficha son **sobre el propio gate**, así que varios se verifican con una
guardia y con la prueba de que esa guardia muerde, no con un test de producto.

| R | Qué exige | Dónde se verifica | Estado |
| --- | --- | --- | --- |
| **R1** | 15000 ms en los tres proyectos | `guard-teclear-y-plazo.test.ts` > «cada proyecto de vitest.config.mts declara testTimeout >= 15000» | ✅ verde |
| **R2** | Falla nombrando el proyecto, desde las guardias | mismo caso + «los tres proyectos conocidos siguen existiendo». **Mordida probada:** mutaciones 1, 2 y 3 de T7 | ✅ verde y muerde |
| **R3** | El plazo rige **en ejecución**, y la sonda no se queda | Sondas de T8 (salida abajo). Los 3 archivos **borrados**, `git status` limpio | ✅ con evidencia |
| **R4** | No tocar workers ni `fileParallelism` | `git diff vitest.config.mts`: sólo entran 3 `testTimeout` + comentarios | ✅ |
| **R5** | Una única definición compartida, con su comentario | `tests/helpers/user-event.ts` (+ `tests/unit/esperar-interactiva.test.tsx`, que prueba que la espera del helper espera y comprueba de verdad) | ✅ |
| **R6** | Todo test la usa; nadie teclea con `userEvent` por su cuenta | `guard-teclear-y-plazo.test.ts`, **dos casos**: «ningun test abre su propia sesion…» y, desde la review, «ningun test teclea con la API directa de user-event, ni importa el paquete como valor». Cero llamadas directas en el árbol (`grep`), y las 5 que quedaban migradas a `setupUser()` | ✅ verde — **el mayor 1 de la review está cerrado**: la mitad que la guardia no miraba ya la mira, sin excepciones nuevas (siguen siendo las 3) |
| **R7** | Falla nombrando el archivo, desde las guardias | los dos casos de arriba. **Mordida probada:** mutación 4 de T7 (sesión propia) y las **mutaciones A y B de la ronda 2** (llamada directa suelta e import renombrado), con su control negativo (`import type` no muerde) | ✅ verde y muerde por las dos vías |
| **R8** | `async-autocomplete` conserva su retardo, declarado y listado | comentario ampliado en el archivo + `EXCEPCIONES_DECLARADAS` de la guardia + caso «el recorrido de tests/ no se ha quedado vacio», que verifica que las 3 excepciones existen | ✅ verde |
| **R9** *(reformulado 2026-09-08)* | La migración no cambia **lo que se prueba del componente**; donde un test dependía sin decirlo del `setTimeout(0)`, espera explícitamente la precondición y **no sustituye ninguna aserción** | tabla de conteos de arriba (mismos casos por archivo, cero `skip`/`todo` nuevos) + `unit-select.test.tsx` y `data-table-pagination.test.tsx`, 17/17 en tres corridas seguidas + los 13 archivos del barrido, 199/199 en dos corridas + `./init.sh --rapido` 454/454, **el mismo conteo de casos antes y después del barrido** | ✅ verde |
| **R10** | Fuera las 3 entradas de esta causa | `tests/baseline-rojos.json` | ✅ (retiradas) |
| **R11** | Las 2 estructurales se quedan, con el motivo de `recipe-route-contract` corregido | `tests/baseline-rojos.json` | ✅ |
| **R12** | Cada entrada con `motivo` y `desde`; comparación por archivo | `node scripts/comparar-baseline-rojos.mjs` (salida abajo) | ✅ verde |
| **R13** *(reformulado 2026-09-08)* | Cinco corridas seguidas de la batería completa, sin rojos fuera del baseline | T11: cinco `./init.sh` el 2026-09-08 sobre `63bea8e`, **las cinco exit 0**, 234/234 archivos y 2839 casos | ✅ verde. El aviso de «2 por limpiar» es esperado en rama y ya no invalida la corrida: ver la reformulación en `requirements.md > R13 — la versión anterior y por qué cambia` |
| **R14** | Comando, fecha y salida del comparador de cada corrida | apartado «T11 — cinco corridas seguidas» de arriba: tabla con inicio, fin, exit, conteos y salida literal del comparador de las cinco | ✅ |
| **R15** | La colisión de correlativo es de QC-77 y no cuenta | T11: **no apareció en ninguna de las cinco**, ni en la tanda descartada. Nada que atribuir ni que añadir al baseline | ✅ (vacuo, y dicho) |
| **R16** | `docs/verification.md` al día, con la tabla de `--maxWorkers` intacta | `docs/verification.md` | ✅ |
| **R17** | Cero archivos de producción | comprobación de alcance de arriba | ✅ |
| **R18** | Sin E2E, con motivo escrito | apartado «E2E» de arriba | ✅ |

**Resumen (2026-09-08, segunda tanda): 15 de 18 con evidencia verde, 0 incumplidos y 3 pendientes de
T11 (R13, R14, R15), que corre el leader.** En la primera tanda eran 14 verdes y 1 incumplido (R9).

---

## T7 — la guardia MUERDE: las cuatro mutaciones

Las cuatro se hicieron **sobre el archivo real**, una a una, y se restauraron **desde una copia
(`cp`), nunca con `git checkout`**. La salida se redirigió a archivo y el código de salida se leyó
de `$?`, sin pipe a `head`/`tail` (`docs/gate.md > Trampas conocidas`).

Al terminar, `git status` es **byte a byte el mismo** que antes de empezar (comprobado con `diff`
entre las dos capturas): sin residuos.

### Mutación 1 — quitar `testTimeout` del proyecto `node`
```
CODIGO DE SALIDA = 1
AssertionError: Proyectos de Vitest sin el plazo de QC-58: node (declara nada).
Cada proyecto DEBE declarar testTimeout: 15000 DENTRO de su propio bloque test, no en la raiz de la config: testTimeout es opcion por proyecto y confiar en la herencia es una apuesta que sale VERDE si la pierdes (el gate no distingue «el plazo se aplico» de «se ignoro y hoy ningun test tardo tanto»).
El numero no es al azar: los 5000 ms por defecto son literalmente el numero del error de los flakes de saturacion, medidos en ui Y en node. Lee docs/verification.md > Los flakes de saturacion antes de bajarlo.: expected [ 'node (declara nada)' ] to deeply equal []

```

### Mutación 2 — bajar `testTimeout` de `ui` a 5000
```
CODIGO DE SALIDA = 1
AssertionError: Proyectos de Vitest sin el plazo de QC-58: ui (declara 5000).
```

### Mutación 3 — renombrar el proyecto `integration` a `integracion`
```
CODIGO DE SALIDA = 1
AssertionError: Proyectos que QC-58 dejo cubiertos y ya no aparecen en vitest.config.mts: integration. Declarados ahora: ui, node, integracion.
```

### Mutación 4 — meter un `userEvent.setup()` en `nav-user.test.tsx`, ya migrado
```
CODIGO DE SALIDA = 1
AssertionError: Archivos de test que abren su propia sesion de user-event: tests/unit/nav-user.test.tsx.
QUE HACER: importa setupUser de tests/helpers/user-event y llama a setupUser() en vez de a userEvent.setup().
POR QUE: la sesion compartida teclea con delay: null, que quita la espera artificial entre eventos -no relaja NINGUNA comprobacion, ni siquiera la de pointer-events- y es la mitad de la cura de los flakes de saturacion. Antes de QC-58 habia 206 llamadas sueltas en 33 archivos y ningun sitio donde estuviera escrito como se teclea aqui: la numero 207 volvia a nacer mal sin que nadie lo decidiera.
```

---

## T8 — la sonda de ejecución (R3): el plazo RIGE, no sólo está escrito

La guardia de T6 demuestra que el número **está declarado**. Esto demuestra que **se aplica**. Tres
archivos temporales, uno por proyecto, cada uno con un único test que espera 7000 ms — por encima
del plazo viejo (5000) y por debajo del nuevo (15000).

**Para repetirlo** (los archivos ya no existen; se recrean así):

```
# un archivo por proyecto, con un `await new Promise((r) => setTimeout(r, 7000))` dentro de un it():
#   tests/unit/_sonda-plazo.test.tsx        -> proyecto ui
#   tests/_sonda-plazo.test.ts              -> proyecto node
#   tests/integration/_sonda-plazo.int.test.ts -> proyecto integration
pnpm exec vitest run _sonda-plazo --reporter=verbose
```

### Con el plazo nuevo (15000): los tres en VERDE
```
CODIGO DE SALIDA = 0
stdout | tests/_sonda-plazo.test.ts > un test de 7000 ms termina en verde en el proyecto node
[SONDA node] transcurrido = 7004 ms
 ✓ |node| tests/_sonda-plazo.test.ts > un test de 7000 ms termina en verde en el proyecto node 7009ms
stdout | tests/unit/_sonda-plazo.test.tsx > un test de 7000 ms termina en verde en el proyecto ui
[SONDA ui] transcurrido = 7015 ms
 ✓ |ui| tests/unit/_sonda-plazo.test.tsx > un test de 7000 ms termina en verde en el proyecto ui 7018ms
stdout | tests/integration/_sonda-plazo.int.test.ts > un test de 7000 ms termina en verde en el proyecto integration
[SONDA integration] transcurrido = 7006 ms
 ✓ |integration| tests/integration/_sonda-plazo.int.test.ts > un test de 7000 ms termina en verde en el proyecto integration 7010ms
 Test Files  3 passed (3)
      Tests  3 passed (3)
```

### El contrafáctico: los mismos tres con el plazo viejo (5000) — los tres MUEREN

Sin esto la sonda no probaría gran cosa: un test que pasa podría estar pasando por cualquier razón.
Se bajó `testTimeout` a `5_000` en los tres proyectos, se corrió, y se restauró desde la copia.
```
CODIGO DE SALIDA = 1
 × |node| tests/_sonda-plazo.test.ts > un test de 7000 ms termina en verde en el proyecto node 5011ms
   → Test timed out in 5000ms.
 × |ui| tests/unit/_sonda-plazo.test.tsx > un test de 7000 ms termina en verde en el proyecto ui 5012ms
   → Test timed out in 5000ms.
 × |integration| tests/integration/_sonda-plazo.int.test.ts > un test de 7000 ms termina en verde en el proyecto integration 5010ms
   → Test timed out in 5000ms.
Error: Test timed out in 5000ms.
Error: Test timed out in 5000ms.
Error: Test timed out in 5000ms.
 Test Files  3 failed (3)
```

Los tres archivos de sonda **fueron borrados** y `git status` volvió a ser idéntico al de antes
(comprobado con `diff` entre capturas). No pagan ~21 s de reloj en cada corrida del gate para
siempre a cambio de algo que ya vigila la guardia de T6.

---

## T9 — el baseline, y el comparador

De **cinco** entradas a **dos**. Retiradas las tres de esta causa (R10):
`tests/unit/inventario/product-page.test.tsx`,
`tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`,
`tests/unit/proveedores-ui/supplier-page.test.tsx`.

Conservadas las dos estructurales con su `motivo` y su `desde` (R11, R12). El `motivo` de
`recipe-route-contract` se reescribió: **decía algo que no era cierto** —que falla porque, estando
en `dev`, el rango `git diff origin/dev...HEAD` está vacío— cuando la causa real es la contraria:
el rango **sí** trae archivos, los de la migración de QC-35, y el caso falla sobre ellos. Se
conservan la nota de coste aceptado y la salida pendiente. **El `desde` no se tocó** (`2026-09-04`):
la deuda es la misma, lo que estaba mal era la explicación.

```
$ node scripts/comparar-baseline-rojos.mjs <reporte>
sin rojos nuevos (0 rojos, todos en el baseline de 2)
COMPARADOR SALIDA = 0
```

---

## Lo que corrí, y lo que NO corrí

**No corrí la batería completa.** Es la regla de reparto de `AGENTS.md` y me la dieron explícita: el
gate completo y las cinco corridas de R13 los corre el leader. Lo mío fue `typecheck`, `lint`, las
guardias, y **sólo** los archivos que el cambio toca o puede romper.

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | ✅ verde (tras `pnpm exec next typegen`) |
| `pnpm run lint` | ✅ verde, sin una sola advertencia |
| `pnpm run test:guardias` | ✅ **21 archivos, 204 casos verdes + 4 skip** (eran 20 archivos y 200 casos antes de la guardia nueva) |
| `pnpm exec vitest run tests/guards/guard-teclear-y-plazo.test.ts` | ✅ 4/4 |
| `pnpm exec vitest run <los 33 archivos migrados>` | ⚠️ **450 casos, 449 verdes, 1 rojo** (`unit-select`) |
| `pnpm exec vitest run _sonda-plazo` | ✅ 3/3 con 15000, ❌ 3/3 con 5000 (contrafáctico) |
| `./init.sh --rapido` (T5) — **primera tanda** | ⏸ **no lo corrí**: con `unit-select` en rojo mide un árbol a medias, y T5 existe precisamente para no escribir la guardia sobre eso. La guardia igualmente se probó a mano con las 4 mutaciones. |

### Segunda tanda (2026-09-08, tras la decisión humana)

| Comando | Resultado |
| --- | --- |
| `pnpm exec vitest run tests/unit/proveedores-ui/unit-select.test.tsx tests/unit/shared/data-table-pagination.test.tsx` ×3 | ✅ **2 archivos, 17 casos verdes** en las tres corridas seguidas (el intermitente no reapareció) |
| **`./init.sh --rapido` (T5)** | ✅ **verde, `SALIDA=0`** |

### Tercera tanda (2026-09-08, el tercer archivo que destapó T11)

| Comando | Resultado |
| --- | --- |
| `pnpm exec vitest run <los 13 archivos del barrido>` ×2 | ✅ **13 archivos, 199 casos verdes** en las dos corridas |
| `pnpm run typecheck` · `pnpm run lint` | ✅ verdes |
| **`./init.sh --rapido`** | ✅ **verde, `SALIDA=0`** — 34 archivos / **454 casos** (el mismo conteo que antes del barrido: no se añadió ni se quitó ningún caso, R9) + 21 guardias / 204 casos |

**Aviso que hay que leer junto a esto:** este `--rapido` verde **no prueba** que el fallo de
saturación no vuelva; ya salió verde una vez con `catalog-line-sheet` averiado. Lo que da confianza
aquí no es la corrida, es que la ventana se cerró por construcción en los 21 sitios. Quien lo
verifica de verdad es T11, y lo corre el leader.

Salida real de T5, recortada a lo que decide (`./init.sh --rapido`, 2026-09-08):

```
✓ typecheck paso
✓ lint paso
-> pnpm run test:rapido
[test:rapido] tests relacionados con 35 archivo(s) del diff vs origin/dev
 Test Files  34 passed (34)
      Tests  454 passed (454)
   Duration  115.87s
[test:rapido] todas las guardias
 Test Files  21 passed (21)
      Tests  204 passed | 4 skipped (208)
   Duration  4.09s
✓ test:rapido paso
! modo rapido: solo los tests relacionados con tus cambios + las guardias.
! Antes de abrir el PR corre './init.sh' sin flags.
✓ todas las migraciones tienen down.sql
== init OK ==
```

Los **34 archivos / 454 casos** son el grafo del cambio: los 33 migrados más el helper y la guardia.
En la primera tanda ese mismo conjunto daba **449 verdes y 1 rojo**.

Salida real de las guardias, que es lo que valida la mitad nueva del gate:

```
$ pnpm run test:guardias
 Test Files  21 passed (21)
      Tests  204 passed | 4 skipped (208)
   Duration  2.05s
```

---

## Qué falta, y en qué orden

*Actualizado el 2026-09-08: los tres primeros puntos ya están hechos y se tachan; queda lo del
leader.*

1. ~~**Decidir el bloqueo** (arriba, tres opciones). Es humano, no mío.~~ **Hecho**: salida 2,
   decidida por el humano el 2026-09-08.
2. ~~**T4c y T4e** quedan abiertas hasta que esa decisión se aplique.~~ **Cerradas**, con R9
   reformulado en `requirements.md`.
3. ~~**T5**: `./init.sh --rapido` en verde.~~ **Verde** (salida arriba).
4. **T11**: las cinco corridas de `./init.sh` completo, con el comando, la fecha y la salida del
   comparador de cada una (R14) — y sin contar las que traigan la colisión de correlativo de
   `order-repository.int.test.ts`, que es **QC-77** y no se arregla ni se añade al baseline aquí (R15).
5. **T12**: cerrar esta bitácora con lo de T11 y actualizar `progress/current.md`.

---

## T11 — cinco corridas seguidas de la batería completa (R13, R14, R15)

Las corre el **leader**, no el implementer. Worktree
`.worktrees/QC-58-timeout-tests-ui-bajo-carga`, rama `feature/QC-58-timeout-tests-ui-bajo-carga`,
HEAD **`69452d7`** —merge con `origin/dev` (`cacdca4`) y las tres rondas dentro—, árbol limpio.
Comando de cada corrida, literal:

```
./init.sh
```

Las cinco seguidas, sin tocar el árbol entre una y otra, el **2026-09-08**. **Cada una arranca
después de que cierre la anterior**, y las marcas de tiempo lo demuestran:

| # | Inicio | Fin | Duración | Exit | Archivos | Casos |
|---|---|---|---|---|---|---|
| 1 | 15:54:05 | 15:59:09 | 5m 04s | **0** | 266 passed + 1 baselined (267) | 3346 passed \| 9 skipped (3357) |
| 2 | 15:59:18 | 16:01:47 | 2m 29s | **0** | ídem | ídem |
| 3 | 16:01:57 | 16:04:31 | 2m 34s | **0** | ídem | ídem |
| 4 | 16:04:36 | 16:07:18 | 2m 42s | **0** | ídem | ídem |
| 5 | 16:07:24 | 16:10:05 | 2m 41s | **0** | ídem | ídem |

Las cinco cerraron con `== init OK ==`. **Ningún archivo de test en rojo fuera del baseline en
ninguna de las cinco** —el único rojo es `navegacion/private-layout-menu`, ajeno y baselined por
`dev`—, y ninguna trajo la colisión de correlativo de `order-repository.int.test.ts` (R15), así que
las cinco cuentan.

### Salida literal del comparador de baseline, corrida por corrida (R14)

```
########## corrida 1 — exit=0 — inicio 2026-09-08T15:54:05-05:00 — fin 2026-09-08T15:59:09-05:00
 Test Files  1 failed | 266 passed (267)
      Tests  2 failed | 3346 passed | 9 skipped (3357)
--- salida literal del comparador de baseline ---
 ELIFECYCLE  Command failed with exit code 1.
aviso: 2 archivo(s) del baseline ya pasan; toca limpiarlos:
  tests/unit/recetas-ui/recipe-route-contract.test.ts
  tests/unit/recetas/module-contract.test.ts
✓ tests: sin rojos nuevos (1 rojos, todos en el baseline de 3); 2 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
########## corrida 2 — exit=0 — inicio 2026-09-08T15:59:18-05:00 — fin 2026-09-08T16:01:47-05:00
 Test Files  1 failed | 266 passed (267)
      Tests  2 failed | 3346 passed | 9 skipped (3357)
--- salida literal del comparador de baseline ---
 ELIFECYCLE  Command failed with exit code 1.
aviso: 2 archivo(s) del baseline ya pasan; toca limpiarlos:
  tests/unit/recetas-ui/recipe-route-contract.test.ts
  tests/unit/recetas/module-contract.test.ts
✓ tests: sin rojos nuevos (1 rojos, todos en el baseline de 3); 2 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
########## corrida 3 — exit=0 — inicio 2026-09-08T16:01:57-05:00 — fin 2026-09-08T16:04:31-05:00
 Test Files  1 failed | 266 passed (267)
      Tests  2 failed | 3346 passed | 9 skipped (3357)
--- salida literal del comparador de baseline ---
 ELIFECYCLE  Command failed with exit code 1.
aviso: 2 archivo(s) del baseline ya pasan; toca limpiarlos:
  tests/unit/recetas-ui/recipe-route-contract.test.ts
  tests/unit/recetas/module-contract.test.ts
✓ tests: sin rojos nuevos (1 rojos, todos en el baseline de 3); 2 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
########## corrida 4 — exit=0 — inicio 2026-09-08T16:04:36-05:00 — fin 2026-09-08T16:07:18-05:00
 Test Files  1 failed | 266 passed (267)
      Tests  2 failed | 3346 passed | 9 skipped (3357)
--- salida literal del comparador de baseline ---
 ELIFECYCLE  Command failed with exit code 1.
aviso: 2 archivo(s) del baseline ya pasan; toca limpiarlos:
  tests/unit/recetas-ui/recipe-route-contract.test.ts
  tests/unit/recetas/module-contract.test.ts
✓ tests: sin rojos nuevos (1 rojos, todos en el baseline de 3); 2 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
########## corrida 5 — exit=0 — inicio 2026-09-08T16:07:24-05:00 — fin 2026-09-08T16:10:05-05:00
 Test Files  1 failed | 266 passed (267)
      Tests  2 failed | 3346 passed | 9 skipped (3357)
--- salida literal del comparador de baseline ---
 ELIFECYCLE  Command failed with exit code 1.
aviso: 2 archivo(s) del baseline ya pasan; toca limpiarlos:
  tests/unit/recetas-ui/recipe-route-contract.test.ts
  tests/unit/recetas/module-contract.test.ts
✓ tests: sin rojos nuevos (1 rojos, todos en el baseline de 3); 2 por limpiar
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

### Tres tandas anteriores que NO cuentan, y por qué se anotan igual

R13 pide cinco corridas **seguidas** y sobre **un árbol que no se toca**. Tres tandas se
descartaron por incumplir una de las dos cosas. Se anotan porque cada una enseñó algo:

| Tanda | Por qué no cuenta | Qué dejó |
|---|---|---|
| sobre `6454043` | roja: `catalog-line-sheet` falló en la 1 y la 2 y **pasó en la 3** | el barrido de los 20 sitios de `pointer-events`. Es la prueba de que una sola corrida verde no prueba nada |
| sobre `63bea8e` | verde, pero la ronda 2 **cambió el árbol** después | una prueba de estabilidad sólo prueba el árbol sobre el que corrió |
| sobre `69452d7`, primer intento | **las corridas se solaparon** (1: 15:24:20–15:31:30, 2: 15:24:29–15:31:48) | no eran «seguidas», eran simultáneas: la medición no medía lo que decía |

**La causa del solape, que costó tres intentos entender:** cuando el sistema mató una tanda por
falta de memoria, mató el script pero **no a sus hijos**. Catorce procesos `node` y el bucle `bash`
que los lanzaba siguieron corriendo gates por su cuenta durante media hora, compitiendo por la RAM
con las tandas nuevas —y matándolas— y escribiendo sus resultados en el mismo archivo de evidencia.
Había 2,1 GB libres de 23,8; tras matarlos, 8,6 GB, y la corrida completa bajó de **7 minutos a
2m 30s**. El `una.sh` de la tanda buena lleva un cerrojo que aborta con `exit 2` si encuentra otro
gate en curso, pero **el cerrojo no habría bastado**: sólo protege de invocaciones propias, no de
procesos huérfanos sin dueño. Lo que hizo falta fue comprobar `Win32_Process` y matarlos.

Deuda de arnés que esto deja, y no es pequeña: **una tanda de gate matada por el sistema deja
procesos vivos que corrompen la siguiente medición sin avisar**. Candidata a `/afinar-regla`.

### La tanda de `63bea8e`, que estas cinco sustituyen

Hubo cinco corridas verdes sobre `63bea8e`, antes de la ronda 2. **No valen como prueba de R13**:
la ronda 2 cambió el árbol —cinco sitios más al helper, la guardia que ve la API directa, el test
nuevo del helper de espera—, y una prueba de estabilidad sólo prueba el árbol sobre el que corrió.
Se anota para que no parezca que se perdieron: los conteos de entonces eran 234 archivos / 2839
casos, y hoy son 235 / 2842 por los casos que la ronda 2 añade.

### La tanda de `6454043`, que NO cuenta, y por qué se anota igual

Antes de `63bea8e` se lanzó esta misma secuencia sobre `6454043`. **Se anota porque es la prueba de
que el criterio de las cinco corridas hace su trabajo**, que es justo lo que R13 defiende:

| # | Exit | Resultado |
|---|---|---|
| 1 | 1 | `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx` en rojo — 2838/2846 |
| 2 | 1 | el mismo — 2838/2846 |
| 3 | 0 | verde, 2839/2846 |
| 4 | — | matada por el sistema (memoria), no llegó a terminar |

`catalog-line-sheet` falló con el **mismo** `pointer-events: none` (sobre `unit-option`) que ya se
había arreglado en otros dos archivos, y **el `--rapido` no lo vio**: el archivo estaba en el grafo
del diff y salió verde. Solo aflora con la batería entera saturando la máquina, y aun así de forma
intermitente — 2 de 3. **Una corrida verde no habría probado nada; la tercera fue verde.** De ahí
salió el barrido que cerró los 21 sitios en 13 archivos (`63bea8e`).

### El aviso de «2 por limpiar» — decidido el 2026-09-08

Las cinco corridas traen `2 por limpiar` sobre las dos entradas que T9 conservó
(`recipe-route-contract.test.ts` y `recetas/module-contract.test.ts`). El criterio escrito de T11
pide las cinco **sin** ese aviso, y **ese criterio no se puede cumplir desde un worktree**: en esta
rama las dos entradas **pasan** (el reviewer las corrió: 2 archivos, 29 casos verdes), y borrarlas
dejaría `dev` en rojo, que es donde sí fallan.

> *Corregido el 2026-09-08 tras la review (menor 3). Este párrafo decía que «las dos entradas fallan
> en `dev` porque `git diff --name-only origin/dev...HEAD` está vacío», que es **la explicación que
> R11 declaró falsa** y que sólo vale para una de las dos. Según sus `motivo` corregidos:
> `recetas/module-contract` falla en `dev` porque el rango **viene vacío** y su caso falla a
> propósito; `recipe-route-contract` falla porque el rango **sí trae archivos** —los de QC-35— y el
> caso falla sobre ellos. Lo que las une es la dependencia de `git diff origin/dev...HEAD`, no la
> causa.*

No es un defecto de esta ficha: es la contradicción que el propio `motivo` de las dos entradas
documenta desde el 2026-09-04, y cuya salida limpia —que el caso del diff distinga «no hay rango» de
«el rango trae cosas»— sigue pendiente y **fuera del alcance declarado aquí** (R17 prohíbe tocar
`lib/`, y estos archivos son de `recetas`). **Decidido por el humano el 2026-09-08**: se reformula el criterio de R13 —el aviso sobre esas
dos entradas es esperado en rama y no invalida la corrida— en vez de meter en esta ficha un
arreglo de `recetas` que R17 le prohíbe tocar. La redacción anterior de R13 y el motivo quedan
escritos en `requirements.md > R13 — la versión anterior y por qué cambia`.


---

## T12 — cierre: alcance, E2E y estado final

### Comprobación de alcance (R17)

`git diff --name-only origin/dev...HEAD` sobre `63bea8e` — **42 archivos, ninguno de producción**:

```
docs/verification.md
progress/impl_QC-58-timeout-tests-ui-bajo-carga.md
specs/QC-58-timeout-tests-ui-bajo-carga/{requirements,design,tasks}.md
tests/baseline-rojos.json
tests/guards/guard-teclear-y-plazo.test.ts
tests/helpers/user-event.ts
tests/ui/login-form-uncontrolled-warning.test.tsx
tests/unit/{app-sidebar,async-autocomplete,credential-field,login-form,nav-user}.test.tsx
tests/unit/{sidebar-ajuste,sidebar-desktop,sidebar-mobile}.test.tsx
tests/unit/inventario/product-page.test.tsx
tests/unit/pedidos-ui/{cancel-order-dialog,delete-order-dialog,order-form,order-row-wiring}.test.tsx
tests/unit/pedidos-ui/{order-sheet,order-table,pedidos-viewport,recipe-picker}.test.tsx
tests/unit/proveedores-ui/{catalog-line-sheet,delete-catalog-line-dialog}.test.tsx
tests/unit/proveedores-ui/{supplier-detail-page,supplier-page,unit-select}.test.tsx
tests/unit/recetas-ui/{recipe-form,recipe-lines-unavailable,recipe-page}.test.tsx
tests/unit/recetas-ui/{recipe-step-editor,step-reader}.test.tsx
tests/unit/shared/{data-table-filter-date,data-table-filters,data-table-header-menu}.test.tsx
tests/unit/shared/{data-table-pagination,data-table-viewport}.test.tsx
vitest.config.mts
```

Filtrado explícito, sin resultados — o sea, cero rutas de producción:

```
$ git diff --name-only origin/dev...HEAD | grep -E '^(app|lib|components|db)/|^middleware'
(sin salida)
```

### E2E (R18) — no hay, y es deliberado

Esta ficha **no cambia ningún comportamiento de la aplicación**: cambia cuánto espera la batería y
cómo teclean sus pruebas. Un E2E ejercita la aplicación en un navegador y aquí no habría nada nuevo
que ejercitar. La prueba que corresponde son las cinco corridas de T11, hechas y con su evidencia.

### Estado final

**17 de 17 tasks.** Los 18 requisitos con test o evidencia nombrada, ninguno vacío. Dos requisitos
se reformularon durante la implementación, los dos conservando por escrito la redacción anterior y
el motivo: **R9** (decisión humana n.º 9, del 2026-09-08) y **R13** (el criterio del aviso de «por
limpiar», que sólo se podía cumplir desde `dev`).

### Lo que hereda quien siga

- **La lección de método, que es la más cara de esta ficha:** `catalog-line-sheet.test.tsx` estaba
  en el grafo del `--rapido` y salió **verde**; solo falló con la batería entera saturando la
  máquina, y aun así 2 de 3 veces. **Para un flake de saturación, `--rapido` no prueba nada.** De
  ahí salió el barrido que encontró **21 sitios en 13 archivos**, diez de ellos verdes por la misma
  casualidad que el que explotó.
- **Deuda de arnés que esta ficha destapó y no le tocaba** (candidatas a `/afinar-regla`): el
  worktree se monta **sin `.env` y sin base propia**, y `wt.sh new` no los crea, así que la
  integración no corre hasta que alguien lo nota; hacen falta además `pnpm exec prisma generate` y
  `pnpm exec next typegen`, cuyos fallos **tienen pinta de rojo de código sin serlo**. Y sigue sin
  `.gitattributes`: un subagente reescribió 15 archivos de LF a CRLF y el commit salió con 7.287
  inserciones donde el cambio real eran 160.
- **La salida limpia de las dos entradas del baseline** sigue pendiente desde el 2026-09-04, ahora
  con el criterio de R13 apuntando a ella.

---

## Ronda 2 — lo que pidió la review (2026-09-08)

`progress/review_QC-58-timeout-tests-ui-bajo-carga.md`: **RECHAZADO**, 1 mayor y 7 menores, sobre
`d1e966d`. Esto es lo que se hizo con cada cosa.

### MAYOR 1 — R6 se cumplía sólo en la mitad que la guardia miraba

**Tenía razón, y el agujero era exactamente el que R7 existe para tapar.** `userEvent.click(...)`
sin `setup()` es la **API directa**, y no hereda `delay: null`: `defaultOptionsDirect` de
`user-event` declara `delay: 0`, o sea que esas llamadas seguían intercalando el `setTimeout(0)`
entre eventos que esta ficha quita. La guardia buscaba el literal `userEvent` + `.setup(`, así que
no las veía, y mi bitácora las tenía anotadas como «deuda visible» — que no es una excepción
aprobada, como bien dice la review.

**1. Los cinco sitios migrados a `setupUser()`**, sin excepción nueva:

| Archivo | Sitios | Nota |
| --- | --- | --- |
| `tests/unit/pedidos-ui/order-row-actions.test.tsx` | 2 (l. 112 y 137) | **no estaba en ninguna task del bloque B**: se quedó fuera de la migración entera |
| `tests/unit/pedidos-ui/order-table.test.tsx` | 3 (l. 175, 239 y 247) | tecleaba de **las dos formas a la vez**: ya usaba `setupUser()` en la l. 218 |

**2. La guardia caza ahora las dos vías.** Caso nuevo en `guard-teclear-y-plazo.test.ts`:
«ningun test teclea con la API directa de user-event, ni importa el paquete como valor». Persigue
**dos** señales, porque cada una tapa el hueco de la otra:

- cualquier acceso `userEvent.<algo>(`, que es lo que se escribe al usar la API directa —y lo que
  aparece si alguien pega una llamada suelta sin importar nada—;
- cualquier **import de valor** del paquete, que caza el renombrado
  (`import ue from ...; await ue.click(...)`), donde el nombre `userEvent` ya no aparece.
  `import type` **sí** pasa: un tipo no teclea.

**3. Probado con mutaciones** (sobre el archivo real, restauradas con `cp`, salida a archivo y `$?`
leído sin pipe; `git status` idéntico al terminar):

```
=== MUTACION A: userEvent.click( suelto en tests/unit/sidebar-mobile.test.tsx ===
CODIGO DE SALIDA = 1
AssertionError: Archivos de test que usan user-event por fuera de la sesion compartida: tests/unit/sidebar-mobile.test.tsx.
      Tests  1 failed | 4 passed (5)

=== MUTACION B: import RENOMBRADO del paquete en tests/unit/login-form.test.tsx ===
CODIGO DE SALIDA = 1
AssertionError: Archivos de test que usan user-event por fuera de la sesion compartida: tests/unit/login-form.test.tsx.
      Tests  1 failed | 4 passed (5)

=== CONTROL: import TYPE del paquete en tests/unit/login-form.test.tsx (no debe morder) ===
CODIGO DE SALIDA = 0
      Tests  5 passed (5)
```

El control negativo importa tanto como las dos mutaciones: una guardia que muerde **también** a los
`import type` obligaría a tipar peor para dejarla contenta, y ese es el camino por el que las
guardias acaban desactivadas.

**4. El barrido con el criterio nuevo, sobre el merge-base (`d85b824`) y sobre el árbol:**

```
$ git grep -n "userEvent\.[a-zA-Z]*(" d85b824 -- 'tests/**' | grep -v "userEvent\.setup("
  -> exactamente los 5 sitios de arriba, en 2 archivos. Ninguno más.
$ grep -rn "userEvent\." tests/    (arbol de hoy, fuera del helper y de la excepcion)
  -> 0
```

Los **206** `userEvent.setup(` en 33 archivos, más estas **5** llamadas directas en 2 archivos
—uno de ellos fuera de la lista de 33—, dan **211 usos en 34 archivos**. Aparecieron además tres
archivos que importaban el paquete **sólo para tipar** (`ReturnType<typeof userEvent.setup>`), que
la guardia nueva habría cazado: son el menor 7 y se arreglaron a la vez.

### Los siete menores

| # | Qué pedía | Qué se hizo |
| --- | --- | --- |
| 1 | La cuenta de `esperarInteractiva` son 21, no 20 | Corregido en los 6 sitios (bitácora y `tasks.md`), con la corrección anotada. El `grep` da 21 en 13 archivos |
| 2 | El número de llamadas no cuadra: 224 vs 206 | Recontado sobre `af5d258` **y** sobre el merge-base: **206**, no 224, más las 5 directas del mayor. Anotado en `requirements.md > El terreno medido`, sin borrar el 224 del que vienen los de `design.md` |
| 3 | La justificación de R13 repite la causa que R11 declaró falsa | Corregido en `requirements.md` **y** en el apartado «El aviso de 2 por limpiar» de esta bitácora, separando las dos entradas: `module-contract` falla porque el rango viene **vacío**; `recipe-route-contract` porque el rango **sí trae** archivos. La conclusión de R13 no se cae: lo comprobado es que en rama **las dos pasan** |
| 4 | Veredicto del reviewer sobre las dos reformulaciones | No pedía acción: da las dos por bien hechas. Sin cambios |
| 5 | La aserción de `esperarInteractiva` no muerde | Ver abajo |
| 6 | R14 pide la salida del comparador de **cada** corrida y hay una literal y cuatro «ídem» | **No es mío**: las cinco corridas son T11 y las corrió el leader. Queda señalado para él; yo no puedo pegar una salida que no capturé, y **inventarla sería justo lo que R14 impide** |
| 7 | Restos de estilo: tres archivos tipan con `typeof userEvent.setup` y una línea larga en `docs/` | Los tres pasan a `ReturnType<typeof setupUser>` y pierden el import de valor; la línea de `docs/verification.md` partida. El límite del literal en las guardias lo deja el propio reviewer fuera de esta ficha |

### El menor 5, que era el de fondo: la aserción no muerde

**Tenía razón en el diagnóstico.** Con el cuerpo del helper reducido a `return elemento`, los
archivos llenos de popups siguen verdes: quien cierra la ventana, hoy, es el tick que regala el
`await`, y la comprobación de `pointer-events` se satisface en el primer intento. Una espera cuya
aserción nunca llega a mirar nada es una espera que alguien «optimizará» quitándole el `waitFor`,
en verde y sin enterarse.

**No cambié la forma de la espera —es la que aprobó el humano— sino que le puse una red.** Archivo
nuevo `tests/unit/esperar-interactiva.test.tsx`, con dos casos que son las dos mitades:

1. un elemento que suelta `pointer-events` **a los 50 ms**, muy por encima del tick del `await`:
   si alguien quita el `waitFor`, el helper devuelve el elemento todavía tapado y el caso se pone
   rojo;
2. un elemento que **no lo suelta nunca**: la espera tiene que **rechazar**. Sin esto, un helper
   que resolviera siempre pasaría el primer caso por casualidad del reloj.

Y la mutación que lo demuestra —borrar la línea del `waitFor` del helper y correr ese archivo—:

```
CODIGO DE SALIDA = 1
 × espera de verdad: resuelve solo DESPUES de que el elemento suelte pointer-events 104ms
 × comprueba de verdad: si el elemento NO se libera nunca, la espera falla 7ms
      Tests  2 failed (2)
```

El helper lleva además el aviso escrito, en el sitio donde alguien haría la «optimización».

### Lo que corrí en esta ronda

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` · `pnpm run lint` | ✅ verdes |
| `pnpm exec vitest run <los 5 archivos tocados + esperar-interactiva + la guardia>` | ✅ **7 archivos, 91 casos** |
| `pnpm exec vitest run tests/guards/guard-teclear-y-plazo.test.ts` | ✅ **5/5** (eran 4: el caso nuevo es el quinto) |
| Mutaciones A, B y el control | ✅ muerde, muerde, y no muerde de más |
| `./init.sh --rapido` | ver abajo |

Salida de `./init.sh --rapido` de la ronda 2 (`SALIDA=0`):

```
✓ typecheck paso
✓ lint paso
[test:rapido] tests relacionados con 35 archivo(s) del diff vs origin/dev
 Test Files  36 passed (36)
      Tests  465 passed (465)
[test:rapido] todas las guardias
 Test Files  21 passed (21)
      Tests  205 passed | 4 skipped (209)
✓ test:rapido paso
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

Los números crecen justo en lo que se añadió y en nada más: **36 archivos y 465 casos** donde antes
eran 34 y 454 (+`order-row-actions`, que entra por primera vez con sus 9 casos, y +`esperar-interactiva`
con 2), y **205 casos de guardias** donde eran 204 (+ el caso nuevo de la API directa).

**Y el aviso de siempre, que en esta ficha ya no es teórico:** este `--rapido` verde **no** prueba
que no quede un flake de saturación. Lo que corresponde son las cinco corridas de `./init.sh`
completo, y las corre el leader.

---

## F2.3 — el merge con `origin/dev` (2026-09-08)

`origin/dev` avanzó mucho mientras esta ficha estaba en vuelo: QC-45 (PR #46), QC-38 (PR #47), un
lote de ajustes de UI decididos a mano (`ab28f97`) y el `chore(arnes)` que hace que el gate cargue
el `.env`. **Cuatro conflictos**, todos del mismo tipo: mi lado cambió *cómo se teclea* y `dev`
cambió *qué prueba* el test.

| Archivo | Bloques | Qué elegí, y por qué |
| --- | --- | --- |
| `tests/baseline-rojos.json` | 1 | **Mis dos estructurales + la entrada nueva de `dev`, y una cuarta retirada.** Ver abajo |
| `tests/unit/nav-user.test.tsx` | 4 | **`dev` entero.** No es un choque de forma: `ab28f97` **sacó el menú de usuario y el cierre de sesión del pie** y los llevó al encabezado, así que los cuatro bloques míos probaban comportamiento que ya no existe. Reaplicar mi forma de teclear encima no tenía dónde: el archivo se queda sin `userEvent` |
| `tests/unit/pedidos-ui/order-form.test.tsx` | 1 | **Contenido de `dev` + mi forma.** Entra su helper `cantidad()`, y `rellenarAlta` se tipa con `ReturnType<typeof setupUser>` en vez del `typeof userEvent.setup` que traía |
| `tests/unit/sidebar-desktop.test.tsx` | 1 | **Contenido de `dev` + mi forma.** Su caso reescrito de R27 («el cierre de sesión sigue alcanzable, ahora desde el encabezado») con `setupUser()` en vez de `userEvent.setup()` |

### El baseline, que era el delicado

`dev` trae en `a6454b3` una entrada nueva, y en el bloque en conflicto había **cinco**. Resolución:

- **Se conserva `tests/unit/navegacion/private-layout-menu.test.tsx`** (la nueva). Es **legítima**:
  tiene `motivo` y `desde` (R12), y su causa **no es la de esta ficha** — es determinista, falla
  igual en aislado, y falla porque `ab28f97` movió el disparador del menú de usuario y el test lo
  sigue buscando donde estaba. Lo comprobé corriéndolo: 2 de 8, siempre los mismos dos, con
  `Unable to find an element by: [data-testid="private-user-trigger"]`. Nada que ver con el plazo ni
  con `pointer-events`.
- **Se retiran las tres de R10**, como manda la ficha.
- **Y se retira una cuarta: `tests/unit/pedidos-ui/order-sheet.test.tsx`**, que `dev` añadió el
  2026-09-08 desde el worktree de QC-45. **Decisión mía, y la señalo porque va más allá de la letra
  de R10**, que nombra tres archivos: su propio `motivo` dice literalmente «**RETIRAR esta entrada
  en el mismo cambio que arregle QC-58**», su causa es exactamente el flake de saturación que esta
  ficha cura, y el archivo lleva desde `63bea8e` con la espera de `esperarInteractiva` puesta y pasó
  las cinco corridas completas de T11 en verde. Dejarla habría sido tapar un rojo ya curado: el
  baseline diría que ese archivo puede fallar cuando ya no falla. **Si el leader prefiere lo
  contrario, es una línea.**

El archivo queda con **tres** entradas, las tres con `motivo` y `desde` (R12), y es JSON válido.

### La guardia mordió lo que llegó, que era lo esperable

`dev` trajo **7 archivos de test nuevos o retocados que tecleaban a la vieja usanza**, y la mitad
nueva de la guardia —la de la ronda 2— los cazó a todos:

| Archivo llegado de `dev` | Qué traía |
| --- | --- |
| `tests/unit/configuracion-ui/presentation-sheet.test.tsx` | 11 `userEvent.setup()` + 1 `ReturnType<typeof userEvent.setup>` |
| `tests/unit/configuracion-ui/delete-presentation-dialog.test.tsx` | 4 `userEvent.setup()` |
| `tests/unit/configuracion-ui/configuracion-viewport.test.tsx` | 2 `userEvent.setup()` |
| `tests/unit/configuracion-ui/presentation-table.test.tsx` | **6 llamadas a la API directa** (`userEvent.click(...)`) |
| `tests/unit/logout-button.test.tsx` | 4 `userEvent.setup()` |
| `tests/unit/navegacion/private-layout-menu.test.tsx` | 2 `userEvent.setup()` |
| `tests/unit/pedidos-ui/order-form.test.tsx` | 3 `userEvent.setup()` en casos nuevos que entraron **sin conflicto** |

Los 32 sitios migrados a `setupUser()`. Y uno de ellos era además del otro patrón: en
`presentation-table.test.tsx`, «elegir otro tamaño» pincha la opción del popup **inmediatamente
después de abrirlo**, así que lleva `esperarInteractiva` — es la bomba de relojería de la tercera
tanda, recién llegada de otra ficha.

**Esto es lo que la ficha compra, visto en vivo:** sin la mitad nueva de la guardia, las 6 llamadas
directas de `presentation-table` habrían entrado en silencio, porque la versión vieja sólo miraba
`userEvent` + `.setup(`.

### Dos rojos que aparecieron durante el merge y NO son míos

- `tests/unit/navegacion/private-layout-menu.test.tsx` (2 casos): es justo la entrada nueva del
  baseline. Ajeno y determinista.
- `configuracion-ui/data-table-intacta.test.ts` y `configuracion-ui/configuracion-convenciones.test.ts`
  (1 caso cada uno): las guardias de alcance de QC-45 comparan contra el rango `dev...HEAD` **y el
  árbol de trabajo**, así que **con el merge a medias** veían los archivos que entraban de `dev`
  (`components/ui/sheet.tsx`, `components/shared/data-table/data-table-pagination.tsx`) como si los
  hubiera tocado esta rama. Es el mismo defecto estructural que ya tienen las dos entradas del
  baseline de `recetas`. Al cerrar el merge desaparece —el `dev` local ya contiene `ab28f97`—; queda
  comprobado abajo con el `--rapido`. **No se toca nada de QC-45 ni se añade nada al baseline.**

### El `--rapido` de después del merge: 40 de 41, y el 41 no es mío

```
✓ .env cargado en el entorno del gate
✓ typecheck paso
✓ lint paso
 Test Files  1 failed | 40 passed (41)
      Tests  2 failed | 519 passed (521)
✗ 'pnpm run test:rapido' fallo
```

Las dos guardias de QC-45 que caían con el merge a medias **pasan** al cerrarlo, como estaba
previsto. El único rojo es `tests/unit/navegacion/private-layout-menu.test.tsx`, y hay que decir
tres cosas de él, porque es la única cosa que no puedo dejar verde:

1. **Está en el baseline** (entrada de `a6454b3`, la que este merge conserva). O sea: para el gate
   completo, que sí compara contra el baseline, no es un rojo nuevo.
2. **`--rapido` no consulta el baseline** —sólo lo hace `./init.sh` completo—, así que en cuanto un
   archivo baselined entra en el grafo, el rápido se pone rojo. Y entra en el grafo **porque lo
   toqué**: traía 2 `userEvent.setup()` y la guardia obliga a migrarlos.
3. **Mi cambio no tiene nada que ver con su fallo.** Comprobado poniendo la versión de `origin/dev`
   encima y corriéndola:

```
$ git show origin/dev:tests/unit/navegacion/private-layout-menu.test.tsx > <el archivo>
$ pnpm exec vitest run <el archivo>            # y restaurado desde copia despues
CODIGO DE SALIDA = 1
TestingLibraryElementError: Unable to find an element by: [data-testid="private-user-trigger"]
      Tests  2 failed | 6 passed (8)           <- exactamente lo mismo que con mi version
```

**No lo arreglo, y no es pereza:** su propia entrada del baseline dice que **no se arregla ahí
donde sale**, que lo decide quien movió el control (`ab28f97`), y tocar el componente lo prohíbe
R17. Las salidas que veo, para el leader: dejarlo así y confiar en el gate completo —que es quien
mira el baseline—, o abrir la ficha que esa entrada pide desde el 2026-09-08.

---

## La tercera familia de fallo: aserciones FUERA de la espera (2026-09-08, T11)

Las corridas completas de T11 tumbaron `tests/unit/login-form.test.tsx > deja el campo de
contrasena vacio tras un intento rechazado`, intermitente y sólo con la máquina cargada:

```
Error: expect(element).toHaveValue()
Expected the element to have value: ""
Received: "clave-secreta"
 ❯ tests/unit/login-form.test.tsx:266:49
```

### ¿Lo introdujo la migración? La evidencia dice que no, y no puedo cerrarlo del todo

Repetí la técnica de las otras dos veces: poner encima la versión de `origin/dev` —sin migrar— y
correr las dos bajo carga.

| Versión | Carga | Corridas | Fallos |
| --- | --- | --- | --- |
| `origin/dev` (sin migrar) | 4 procesos del archivo en paralelo | 12 | **0** |
| la mía (`setupUser()`) | ídem | 12 | **0** |
| `origin/dev` (sin migrar) | 6 del archivo + `proveedores-ui` + `pedidos-ui` de fondo | 18 | **0** |
| la mía (`setupUser()`) | ídem | 18 | **0** |

**36 corridas por versión y ni un fallo en ninguna de las dos: no reproduje el flake**, así que la
comparación **no es concluyente** y lo digo tal cual en vez de venderla como prueba. Mi carga no
llega a la del gate completo (el leader lo vio con 35 procesos node de otras sesiones).

Lo que sí se puede afirmar es el **mecanismo**, y ese no pasa por `delay: null`: el usuario se
restaura desde el estado de la action y la contraseña la limpia el **reset del formulario de React
19**; son dos efectos distintos que no tienen por qué caer en el mismo commit. La espera vigilaba
el primero y la aserción del segundo estaba **fuera**, así que el caso pasaba o fallaba según cuál
llegara antes. Todo eso ocurre **después** de teclear, que es lo único que `delay: null` cambia.

**Conclusión, con su límite escrito: no hay evidencia de que la migración lo introdujera, y el
mecanismo dice que no puede; pero no lo reproduje, así que no puedo cerrarlo con una medida.** No
lo cuento como incumplimiento de R9 —y si alguien lo reproduce con la versión de `dev` migrada
frente a la sin migrar, esta conclusión se cae y hay que decirlo—.

### El arreglo, y que sigue pudiendo fallar

Las dos condiciones pasan **dentro de la misma espera**, con lo que el caso deja de depender de en
qué orden lleguen. **No se relajó ni se borró ninguna aserción**: las dos siguen comprobándose y
ahora las dos tienen que cumplirse **a la vez**. Probado con una mutación —afirmar que la
contraseña conserva un valor que nunca tendrá—:

```
MUTACION (la contrasena NUNCA se limpia) -> CODIGO DE SALIDA = 1
 × deja el campo de contrasena vacio tras un intento rechazado 1189ms
Error: expect(element).toHaveValue(NO-SE-LIMPIA)
```

### El barrido de esta tercera forma

Buscada por script en los archivos que usan `setupUser()`: `await waitFor(...)` sobre el DOM
seguido, sin línea en blanco, de aserciones **fuera** de la espera sobre **otro** elemento.
**14 sitios en 7 archivos.** Arreglados los **6 de la misma forma exacta** que el que falló:

| Archivo | Sitios | Qué esperaba / qué afirmaba fuera |
| --- | --- | --- |
| `login-form.test.tsx` | 1 | espera el **usuario** restaurado, afirma la **contraseña** vacía |
| `pedidos-ui/order-form.test.tsx` | 2 | espera el **mensaje** del selector, afirma `aria-invalid` del selector y la **ausencia** del aviso de formulario |
| `sidebar-mobile.test.tsx` | 2 | espera que el **panel** cierre, afirma `aria-expanded` del **disparador** |
| `recetas-ui/recipe-form.test.tsx` | 1 | espera que la **vista previa** se vaya, afirma que el **lector de pasos** ya no está |

**Los otros 8 los dejo sin tocar, a propósito**, porque no son la misma forma: en
`async-autocomplete` (5), `recipe-picker` (2) y `product-page` (1) lo que se afirma fuera es el
**mismo conjunto** que la espera acaba de comprobar —las opciones de una lista que ya está pintada—,
no un segundo efecto que pueda llegar más tarde. Quedan listados aquí por si el leader quiere
ampliar el alcance; meterlos habría sido tocar ocho sitios más sin un mecanismo que lo justifique.

**Nota de método, la tercera de esta ficha:** las tres familias —`pointer-events`, la API directa y
esto— se anunciaron con **un solo caso rojo**, y las tres veces el barrido encontró más. Lo que
todavía no tiene guardia es esta tercera: un `waitFor` con aserciones sueltas detrás no es
distinguible por texto de uno legítimo, así que no la he intentado escribir.

`./init.sh --rapido` tras este arreglo: **40 de 41 archivos y 519 de 521 casos**, con typecheck y
lint verdes. El único rojo sigue siendo `navegacion/private-layout-menu` (ajeno, baselined, con su
explicación en el apartado del merge): mismo estado que antes de tocar nada.
