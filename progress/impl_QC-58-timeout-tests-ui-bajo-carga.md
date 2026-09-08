# QC-58 — timeout-tests-ui-bajo-carga · bitácora de implementación

> Worktree `.worktrees/QC-58-timeout-tests-ui-bajo-carga`, rama
> `feature/QC-58-timeout-tests-ui-bajo-carga`, partiendo de `3db9b44`. Fecha: **2026-09-08**.
> Escrita por el `implementer`. **No se autoaprueba**: el veredicto lo pone el reviewer.

## Veredicto corto

**12 de 17 tasks cerradas. La ficha NO está lista para PR: hay un bloqueo que necesita decisión
humana** porque choca de frente con la decisión cerrada n.º 3 y con R9. Está descrito entero en
`## BLOQUEO` más abajo. Todo lo demás —el plazo, el helper, la guardia probada con cuatro
mutaciones, la sonda de ejecución, el baseline y el rastro escrito— está hecho y verificado.

Sin resolver el bloqueo **no tiene sentido correr T11** (las cinco corridas de la batería
completa): se sabe de antemano que saldría roja por `unit-select.test.tsx`.

---

## BLOQUEO (para el leader / el humano)

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
| `tests/helpers/user-event.ts` | La definición compartida `setupUser()` (R5). Se le mudó el comentario largo que vivía en `recipe-form.test.tsx:191-200`. |
| `tests/guards/guard-teclear-y-plazo.test.ts` | La guardia de las dos mitades (R2, R7). 4 casos. |

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
| T4c | `tests/unit/shared/` (13 archivos) | **149** (149 ok) | **149** (148 ok, 1 rojo) | conteo sí, **color no** |
| T4d | `tests/unit/pedidos-ui/` (16 archivos) | **166** (163 ok, 3 skip) | **166** (163 ok, 3 skip) | sí |
| T4e | `tests/unit/proveedores-ui/` (12 archivos) | **147** (143 ok, 4 skip) | **147** (142 ok, 4 skip, 1 rojo) | conteo sí, **color no** |
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
| **R5** | Una única definición compartida, con su comentario | `tests/helpers/user-event.ts` | ✅ |
| **R6** | Todo test la usa; nadie llama a `setup()` por su cuenta | `guard-teclear-y-plazo.test.ts` > «ningun test abre su propia sesion…» | ⚠️ verde, pero ver BLOQUEO |
| **R7** | Falla nombrando el archivo, desde las guardias | mismo caso. **Mordida probada:** mutación 4 de T7 | ✅ verde y muerde |
| **R8** | `async-autocomplete` conserva su retardo, declarado y listado | comentario ampliado en el archivo + `EXCEPCIONES_DECLARADAS` de la guardia + caso «el recorrido de tests/ no se ha quedado vacio», que verifica que las 3 excepciones existen | ✅ verde |
| **R9** | La migración no cambia el comportamiento observable | tabla de conteos de arriba | ❌ **incumplido en 2 archivos** — es el BLOQUEO |
| **R10** | Fuera las 3 entradas de esta causa | `tests/baseline-rojos.json` | ✅ (retiradas) |
| **R11** | Las 2 estructurales se quedan, con el motivo de `recipe-route-contract` corregido | `tests/baseline-rojos.json` | ✅ |
| **R12** | Cada entrada con `motivo` y `desde`; comparación por archivo | `node scripts/comparar-baseline-rojos.mjs` (salida abajo) | ✅ verde |
| **R13** | Cinco corridas seguidas de la batería completa | T11 | ⏸ **pendiente** (bloqueada, y la corre el leader) |
| **R14** | Comando, fecha y salida del comparador de cada corrida | T11 | ⏸ **pendiente** |
| **R15** | La colisión de correlativo es de QC-77 y no cuenta | T11 | ⏸ **pendiente**; no ha aparecido en ninguna corrida mía |
| **R16** | `docs/verification.md` al día, con la tabla de `--maxWorkers` intacta | `docs/verification.md` | ✅ |
| **R17** | Cero archivos de producción | comprobación de alcance de arriba | ✅ |
| **R18** | Sin E2E, con motivo escrito | apartado «E2E» de arriba | ✅ |

**Resumen: 14 de 18 con evidencia verde, 1 incumplido (R9) y 3 pendientes de T11 (R13, R14, R15).**

---

## T7 — la guardia MUERDE: las cuatro mutaciones

Las cuatro se hicieron **sobre el archivo real**, una a una, y se restauraron **desde una copia
(`cp`), nunca con `git checkout`**. La salida se redirigió a archivo y el código de salida se leyó
de `$?`, sin pipe a `head`/`tail` (`docs/verification.md > Trampas conocidas`).

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
| `./init.sh --rapido` (T5) | ⏸ **no lo corrí**: con `unit-select` en rojo mide un árbol a medias, y T5 existe precisamente para no escribir la guardia sobre eso. La guardia igualmente se probó a mano con las 4 mutaciones. |

Salida real de las guardias, que es lo que valida la mitad nueva del gate:

```
$ pnpm run test:guardias
 Test Files  21 passed (21)
      Tests  204 passed | 4 skipped (208)
   Duration  2.05s
```

---

## Qué falta, y en qué orden

1. **Decidir el bloqueo** (arriba, tres opciones). Es humano, no mío.
2. **T4c y T4e** quedan abiertas hasta que esa decisión se aplique.
3. **T5**: `./init.sh --rapido` en verde.
4. **T11**: las cinco corridas de `./init.sh` completo, con el comando, la fecha y la salida del
   comparador de cada una (R14) — y sin contar las que traigan la colisión de correlativo de
   `order-repository.int.test.ts`, que es **QC-77** y no se arregla ni se añade al baseline aquí (R15).
5. **T12**: cerrar esta bitácora con lo de T11 y actualizar `progress/current.md`.
