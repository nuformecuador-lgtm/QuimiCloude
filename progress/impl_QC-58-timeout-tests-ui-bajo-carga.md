# QC-58 — timeout-tests-ui-bajo-carga · bitácora de implementación

> Worktree `.worktrees/QC-58-timeout-tests-ui-bajo-carga`, rama
> `feature/QC-58-timeout-tests-ui-bajo-carga`, partiendo de `3db9b44`. Fecha: **2026-09-08**.
> Escrita por el `implementer`. **No se autoaprueba**: el veredicto lo pone el reviewer.

## Veredicto corto

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
patrón: **20 sitios en 13 archivos**. El detalle, y por qué un `--rapido` verde no bastaba para
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

**20 sitios en 13 archivos.** Los diez «verde» no son verdes por diseño: son verdes por la misma
razón por la que `catalog-line-sheet` lo era en `--rapido`.

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
| `tests/helpers/user-event.ts` | La definición compartida `setupUser()` (R5). Se le mudó el comentario largo que vivía en `recipe-form.test.tsx:191-200`. **Desde la tercera tanda (2026-09-08) aloja también `esperarInteractiva()`**, la espera a que un popup de Base UI suelte `pointer-events: none`, usada en 20 sitios de 13 archivos. |
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
| **R5** | Una única definición compartida, con su comentario | `tests/helpers/user-event.ts` | ✅ |
| **R6** | Todo test la usa; nadie llama a `setup()` por su cuenta | `guard-teclear-y-plazo.test.ts` > «ningun test abre su propia sesion…» (21 archivos de guardias, 204 casos verdes en `./init.sh --rapido` del 2026-09-08) | ✅ verde — el bloqueo que arrastraba esta fila está resuelto y **sin excepciones nuevas**: siguen siendo las 3 de siempre |
| **R7** | Falla nombrando el archivo, desde las guardias | mismo caso. **Mordida probada:** mutación 4 de T7 | ✅ verde y muerde |
| **R8** | `async-autocomplete` conserva su retardo, declarado y listado | comentario ampliado en el archivo + `EXCEPCIONES_DECLARADAS` de la guardia + caso «el recorrido de tests/ no se ha quedado vacio», que verifica que las 3 excepciones existen | ✅ verde |
| **R9** *(reformulado 2026-09-08)* | La migración no cambia **lo que se prueba del componente**; donde un test dependía sin decirlo del `setTimeout(0)`, espera explícitamente la precondición y **no sustituye ninguna aserción** | tabla de conteos de arriba (mismos casos por archivo, cero `skip`/`todo` nuevos) + `unit-select.test.tsx` y `data-table-pagination.test.tsx`, 17/17 en tres corridas seguidas + los 13 archivos del barrido, 199/199 en dos corridas + `./init.sh --rapido` 454/454, **el mismo conteo de casos antes y después del barrido** | ✅ verde |
| **R10** | Fuera las 3 entradas de esta causa | `tests/baseline-rojos.json` | ✅ (retiradas) |
| **R11** | Las 2 estructurales se quedan, con el motivo de `recipe-route-contract` corregido | `tests/baseline-rojos.json` | ✅ |
| **R12** | Cada entrada con `motivo` y `desde`; comparación por archivo | `node scripts/comparar-baseline-rojos.mjs` (salida abajo) | ✅ verde |
| **R13** | Cinco corridas seguidas de la batería completa | T11 | ⏸ **pendiente** (bloqueada, y la corre el leader) |
| **R14** | Comando, fecha y salida del comparador de cada corrida | T11 | ⏸ **pendiente** |
| **R15** | La colisión de correlativo es de QC-77 y no cuenta | T11 | ⏸ **pendiente**; no ha aparecido en ninguna corrida mía |
| **R16** | `docs/verification.md` al día, con la tabla de `--maxWorkers` intacta | `docs/verification.md` | ✅ |
| **R17** | Cero archivos de producción | comprobación de alcance de arriba | ✅ |
| **R18** | Sin E2E, con motivo escrito | apartado «E2E» de arriba | ✅ |

**Resumen (2026-09-08, segunda tanda): 15 de 18 con evidencia verde, 0 incumplidos y 3 pendientes de
T11 (R13, R14, R15), que corre el leader.** En la primera tanda eran 14 verdes y 1 incumplido (R9).

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
aquí no es la corrida, es que la ventana se cerró por construcción en los 20 sitios. Quien lo
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
