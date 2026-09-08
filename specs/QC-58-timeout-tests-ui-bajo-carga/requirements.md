# QC-58 — timeout-tests-ui-bajo-carga · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** ninguna · **Rama**
> `feature/QC-58-timeout-tests-ui-bajo-carga`
>
> **Alcance.** Dejar la batería de tests estable bajo carga atacando las **dos** causas medidas:
> el **plazo**, que sube de 5000 a 15000 ms en los **tres** proyectos de Vitest (`ui`, `node`,
> `integration`), y la **forma de teclear**, que pasa a tener una sola definición compartida sin
> retardo entre teclas. Y **vaciar del baseline** las tres entradas que están ahí por esta causa,
> que es lo que hace que el arreglo cuente.
>
> **Lo que NO entra.** Rehacer ninguna pantalla ni sus reglas. Las dos entradas del baseline que
> están por el motivo estructural del rango de git (`recetas-ui/recipe-route-contract`,
> `recetas/module-contract`) **no se retiran** —son otro problema—, solo se corrige su motivo. La
> colisión de correlativo en la base de integración → **QC-77**. Bajar los workers de Vitest está
> **descartado y medido**: no lo cura (`docs/verification.md`).
>
> *Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí **no es la aplicación**: esta ficha no
cambia ninguna pantalla, ninguna regla de negocio ni ningún dato. El sistema es la **batería de
pruebas de QuimiCloude y su configuración** — `vitest.config.mts`, los archivos bajo `tests/`,
`tests/baseline-rojos.json` y la parte de `docs/verification.md` que describe este fallo—. Por eso
ningún requisito habla de usuarios, permisos ni de la base de datos.

Dos advertencias que valen para todo lo de abajo:

- Varios requisitos son **sobre el propio gate**. `docs/verification.md > Cuando lo que verificas
  es el gate mismo` avisa de que un check que no muerde es peor que uno que no existe, así que
  cada requisito de configuración lleva emparejado el requisito que exige demostrar que **falla**
  cuando debe fallar (R6, R11), no sólo que pasa.
- El fallo que se ataca es **intermitente**. Una corrida verde no prueba nada (R13).

### El plazo

**R1.** El sistema DEBE declarar un plazo de espera por test de **15000 ms** en **cada uno** de
los proyectos de Vitest (`ui`, `node`, `integration`), y NO DEBE dejar ninguno de ellos corriendo
con el plazo por defecto de 5000 ms.

**R2.** SI se añade en el futuro un proyecto de Vitest que no declare ese plazo, o SI alguno de
los tres actuales lo pierde o lo baja por debajo de 15000 ms, ENTONCES la batería DEBE fallar
nombrando el proyecto afectado, y DEBE hacerlo dentro de las guardias —o sea, ejecutándose
**siempre**, también en `./init.sh --rapido`, que selecciona por grafo de imports y nunca
seleccionaría la configuración—.

**R3.** El sistema DEBE demostrar que el plazo nuevo rige **en ejecución** y no sólo por escrito:
en cada uno de los tres proyectos, un test que tarde más de 5000 ms y menos de 15000 ms DEBE
terminar en verde. La evidencia de esa comprobación DEBE quedar en la bitácora de implementación,
y la sonda usada para obtenerla NO DEBE quedar en la batería permanente.

**R4.** El sistema NO DEBE limitar el número de procesos de trabajo de Vitest como parte de este
arreglo, ni alterar `fileParallelism` en ningún proyecto.

### La forma de teclear

**R5.** El sistema DEBE tener **una única definición compartida** de cómo se abre una sesión de
escritura con `userEvent` en este repo, sin retardo artificial entre teclas, acompañada del
comentario que explica por qué se quita ese retardo y qué NO se relaja al quitarlo.

**R6.** Todo archivo de test que teclee con `userEvent` DEBE obtener su sesión de esa definición
compartida, y NO DEBE llamar a `userEvent.setup()` por su cuenta salvo que figure en una lista de
**excepciones declaradas con motivo**.

**R7.** SI un archivo de test llama a `userEvent.setup()` fuera de la definición compartida y sin
estar en la lista de excepciones declaradas, ENTONCES la batería DEBE fallar nombrando ese
archivo, y DEBE hacerlo desde las guardias (mismo motivo que R2: ningún grafo de imports
seleccionaría esa comprobación).

**R8.** DONDE un test necesite retardo real entre teclas para probar lo que dice probar —hoy sólo
`tests/unit/async-autocomplete.test.tsx`, que ejercita el rebote del autocompletado—, el sistema
DEBE conservar ese retardo, DEBE dejar escrito en el propio archivo por qué es deliberado, y DEBE
listarlo como excepción nombrada de R7, de forma que quitarlo en el futuro sea una decisión y no
un descuido.

**R9.** *(Reformulado el 2026-09-08 durante la implementación. La redacción anterior se conserva
íntegra abajo, en «R9 — la versión anterior y por qué cambia».)* La migración a la definición
compartida NO DEBE cambiar **lo que los tests migrados prueban del componente**: el número de casos
ejecutados por archivo DEBE ser el mismo antes y después, ninguno DEBE quedar en `skip` ni en
`todo`, y ninguna aserción DEBE relajarse ni borrarse. DONDE un test dependiera sin decirlo del
`setTimeout(0)` que `user-event` intercalaba entre eventos —hoy exactamente
`tests/unit/proveedores-ui/unit-select.test.tsx` y `tests/unit/shared/data-table-pagination.test.tsx`,
que pinchan una opción de un popup de Base UI mientras aún lleva `pointer-events: none`—, el test
DEBE pasar a **esperar explícitamente esa precondición** antes de pinchar, y esa espera NO DEBE
sustituir a ninguna comprobación existente: se añade a las que ya había.

#### R9 — la versión anterior y por qué cambia

**Decía, hasta el 2026-09-08:**

> **R9.** La migración a la definición compartida NO DEBE cambiar el comportamiento observable de
> los tests migrados: el número de casos ejecutados por archivo DEBE ser el mismo antes y después,
> ninguno DEBE quedar en `skip` ni en `todo`, y ninguna aserción DEBE relajarse.

**Por qué cambia.** Con esa redacción, los dos archivos de arriba quedaban marcados como
**incumplimiento** —así lo dejó anotado la bitácora del implementer—, y no lo son. Al quitar el
retardo entre teclas esos dos casos empezaron a fallar con `Unable to perform pointer interaction as
the element has 'pointer-events: none'`. No es una regresión del producto ni una comprobación
relajada: es exactamente lo contrario. La comprobación de `pointer-events` de `user-event` **siempre
estuvo activa**, pero nunca llegaba a morder porque el `setTimeout(0)` que `user-event` intercalaba
—una espera que nadie había pedido y que la decisión cerrada n.º 3 quita a propósito— le daba al
popup el tick que necesitaba para volverse interactivo. Esos dos tests **pasaban por accidente**.

El humano decidió el 2026-09-08 (decisión cerrada n.º 9) esperar explícitamente a esa precondición
en vez de declarar los dos archivos como excepción. Con eso, lo que ocurre en los dos archivos deja
de ser un incumplimiento de R9 y pasa a ser un **cambio deliberado y aprobado**: el cuerpo del test
cambia, el comportamiento del componente que se prueba no. R9 se reescribe para decir eso —«no
cambia lo que se prueba del componente»— en vez de «no cambia el comportamiento observable del
test», que era una vara que confundía las dos cosas y que habría obligado a conservar una dependencia
oculta sólo porque estaba ahí. **No se borra la versión anterior**: se anota, porque la diferencia
entre las dos redacciones es justo la lección de esta ficha.

### El baseline de rojos

**R10.** CUANDO el arreglo del plazo y de la forma de teclear esté en la rama, el sistema NO DEBE
conservar en `tests/baseline-rojos.json` ninguna de las tres entradas que están ahí por esta
causa (`tests/unit/inventario/product-page.test.tsx`,
`tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`,
`tests/unit/proveedores-ui/supplier-page.test.tsx`).

**R11.** El sistema DEBE conservar las dos entradas estructurales
(`tests/unit/recetas-ui/recipe-route-contract.test.ts`, `tests/unit/recetas/module-contract.test.ts`)
con su `motivo` y su `desde`, y el `motivo` de `recipe-route-contract` DEBE describir la causa por
la que hoy está roja **en vez de** la que dice ahora, que no es cierta.

**R12.** MIENTRAS queden entradas en `tests/baseline-rojos.json`, cada una DEBE seguir teniendo
`motivo` y `desde`, y la comparación del gate DEBE seguir siendo **por archivo** y no por conteo.

### La prueba

**R13.** *(Reformulado el 2026-09-08; la redacción anterior se conserva íntegra abajo, en «R13 — la
versión anterior y por qué cambia».)* El sistema NO DEBE darse por arreglado con una sola corrida
verde: DEBE probarse con **cinco corridas seguidas de la batería completa**, las cinco sin ningún
archivo de test en rojo que no esté en el baseline. El aviso de «por limpiar» sobre
`recipe-route-contract.test.ts` y `recetas/module-contract.test.ts` es **esperado en una rama de
feature** y NO DEBE tomarse como fallo de la corrida; la bitácora DEBE dejar dicho que apareció y
por qué es esperado.

#### R13 — la versión anterior y por qué cambia

**Decía, hasta el 2026-09-08:**

> **R13.** El sistema NO DEBE darse por arreglado con una sola corrida verde: DEBE probarse con
> **cinco corridas seguidas de la batería completa**, las cinco sin ningún archivo de test en rojo
> que no esté en el baseline y sin aviso de «por limpiar» sobre las dos entradas que quedan.

**Por qué cambia.** Esa última condición **no se puede cumplir desde un worktree**, y no por culpa
de nada que haga esta ficha. Las dos entradas que T9 conservó fallan **en `dev`** porque uno de sus
casos se apoya en `git diff --name-only origin/dev...HEAD`, que estando en `dev` viene vacío; en una
rama de feature ese rango sí trae archivos, así que los dos archivos **pasan** y el comparador avisa
«2 archivos del baseline ya pasan; toca limpiarlos». Las cinco corridas del 2026-09-08 lo trajeron
las cinco, con `== init OK ==` y exit 0 en todas.

Cumplir la condición literal exigiría borrar las dos entradas, y eso dejaría **`dev` en rojo**: es
justo donde sí fallan. La salida limpia —que el caso del diff distinga «no hay rango» de «el rango
trae cosas», saltándose lo primero de forma explícita y ruidosa, y entonces sí borrar las dos
entradas— ya está escrita como pendiente en el propio `motivo` de ambas desde el **2026-09-04**, y
**cae fuera del alcance de esta ficha**: toca `tests/unit/recetas*` y R17 acota esta ficha a la
configuración de Vitest, el helper de escritura y los tests migrados.

Lo que se corrige, entonces, es el criterio y no el árbol: la condición se escribió sin advertir que
mide algo distinto según la rama desde la que se corra. Queda anotado para el `reviewer` y como
candidato a `/afinar-regla`.

**R14.** El sistema DEBE dejar en la bitácora de implementación, para cada una de esas cinco
corridas, el comando exacto, la fecha y la salida del comparador de baseline.

**R15.** SI durante esas cinco corridas aparece la colisión de correlativo de
`tests/integration/pedidos/order-repository.int.test.ts` («Ya existe la llave
(order_year, order_sequence)»), ENTONCES esa corrida NO DEBE contarse como una de las cinco, el
hecho DEBE quedar anotado en la bitácora atribuido a **QC-77**, y el sistema NO DEBE intentar
arreglarlo aquí ni añadir ese archivo al baseline.

### El rastro escrito

**R16.** CUANDO el arreglo entre, `docs/verification.md > Los flakes de saturación` DEBE dejar de
decir que el arreglo «tiene ficha propia» pendiente y DEBE decir que está hecho, con la fecha y la
ficha (QC-58); DEBE conservar la tabla de `--maxWorkers` que descarta bajar los procesos de
trabajo, porque su valor es evitar que alguien recorra otra vez ese callejón; y el bloque «Estado
en QuimiCloude» del baseline DEBE reflejar las entradas que quedan en vez de las cinco de antes.

### El alcance

**R17.** El cambio NO DEBE modificar ningún archivo de producción —nada bajo `app/`, `lib/`,
`components/`, `db/`, ni el middleware—: se limita a configuración de pruebas, archivos bajo
`tests/` y documentación. Esta es la razón por la que la ficha sigue siendo de zona `frontend` y
no se parte en dos.

**R18.** El sistema NO DEBE incorporar ninguna prueba E2E para esta ficha. El motivo, escrito para
que no se lea como un olvido: un E2E ejercita el comportamiento de la aplicación en un navegador, y
esta ficha **no cambia ningún comportamiento de la aplicación** —cambia cuánto espera la batería y
cómo teclea—. La prueba que corresponde es la propia batería corriendo cinco veces (R13), no un
camino de usuario.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el
requisito que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | El plazo nuevo llega a los tres proyectos, no sólo a `ui` | R1, R2, R3 |
| 2 | El plazo sube de 5000 a 15000 ms | R1, R3 |
| 3 | Una sola definición compartida de cómo teclear, sin retardo, importada desde los 33 archivos | R5, R6, R7, R9 |
| 4 | `async-autocomplete.test.tsx` conserva su `delay: 20`, declarado | R8 |
| 5 | La prueba son cinco corridas seguidas de la batería completa, las cinco verdes | R13, R14 |
| 6 | Se retiran las tres entradas de esta causa; las dos estructurales se quedan con el motivo corregido | R10, R11, R12 |
| 7 | La `zone` sigue siendo `frontend` | R17 |
| 8 | La colisión de correlativo es QC-77 y no entra aquí | R15 |
| 9 | Los dos tests que dependían del retardo esperan explícitamente a que la opción sea interactiva | R9 (reformulado el 2026-09-08; ver «R9 — la versión anterior y por qué cambia») |

Y dos requisitos que no salen de la tabla sino del propio alcance: **R4** (bajar los procesos de
trabajo está descartado y medido, así que se prohíbe explícitamente para que no vuelva de tapadillo)
y **R16** (actualizar el rastro escrito, que es lo que impide que el siguiente repita el
diagnóstico fallido). **R18** deja el E2E diferido con su motivo.

## Preguntas abiertas

**Ninguna.** Las que había al acotar las cerró el humano el 2026-09-07 y están en la tabla de
abajo. La novena la cerró el 2026-09-08, ya durante la implementación: la migración destapó dos
tests que dependían sin saberlo del retardo entre teclas.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-07 | ¿Hasta dónde llega el plazo nuevo? | **Los tres proyectos**, no solo `ui`. El fallo se midió el mismo día en `ui` (`proveedores-ui/catalog-line-sheet`, tecleando) y en `node` (`composition/identity-facade`, que **no teclea nada** y murió en `await import('@/lib/composition')`, cargando el barril que arrastra los cinco módulos y el cliente de Prisma). La causa es contención de CPU y no distingue de proyecto |
| 2026-09-07 | ¿A cuánto sube el plazo? | **De 5000 a 15000 ms.** El coste aceptado, y es el único: un test colgado de verdad tarda 15 s en reportarse en vez de 5. No cambia si un test pasa o falla, solo cuánto se espera para saberlo |
| 2026-09-07 | ¿Cómo se arregla la forma de teclear? | **Una sola definición compartida**, sin retardo entre teclas, importada desde los 33 archivos que hoy llaman `userEvent.setup()` (224 llamadas, de las que solo 2 pasan opciones). Lo que se gana **no** es evitar tocar los 33 archivos —hay que tocarlos, con un cambio mecánico de una línea cada uno—: es que exista **un** sitio donde está escrito cómo se teclea en este repo, en vez de 224 llamadas sueltas donde la 225ª volverá a nacer mal. Promueve a compartido el precedente que ya existe a mano en `tests/unit/recetas-ui/recipe-form.test.tsx:201` |
| 2026-09-07 | ¿Y el test que necesita retardo de verdad? | **`tests/unit/async-autocomplete.test.tsx` conserva el suyo** (`delay: 20`), que está puesto **a propósito** para probar el debounce del autocomplete. Se pide explícitamente y queda declarado, en vez de romperse en silencio bajo un cambio global. **No** se reescribe con relojes falsos: eso es trabajo de diagnóstico que esta ficha no tiene |
| 2026-09-07 | ¿Qué cuenta como prueba? | **Cinco corridas seguidas de la batería completa, las cinco verdes.** La ficha decía «varias veces» y sin número el reviewer no puede verificar nada. Hereda el criterio de `docs/verification.md` (2026-09-04): **una corrida verde no es prueba** cuando el fallo es intermitente — es exactamente la lección que costó el diagnóstico fallido de los workers |
| 2026-09-07 | ¿Qué se lleva del baseline? | **Las tres de esta causa**: `unit/inventario/product-page`, `unit/proveedores-ui/catalog-line-sheet` y `unit/proveedores-ui/supplier-page`. Las dos estructurales se quedan, **con su motivo corregido**: el de `recipe-route-contract` hoy **miente**, porque falla por la migración de QC-35 que aparece en el diff, no por el rango de git vacío que dice su nota |
| 2026-09-07 | ¿Cambia la `zone`? | **No, sigue `frontend`**, aunque ahora toque la configuración de los tres proyectos. Cambiarla a `fullstack` dispararía la partición en dos fichas (`AGENTS.md > Particion de fullstack`), que no tiene sentido para un arreglo de configuración |
| 2026-09-07 | ¿La colisión de correlativo entra aquí? | **No: es QC-77.** `order-repository.int.test.ts` falla con «Ya existe la llave (order_year, order_sequence)», y eso es **estado residual** en la base compartida, no plazo. Son causas distintas y mezclarlas haría que ninguna de las dos se pueda dar por probada |
| 2026-09-08 | Quitar el retardo deja dos tests en rojo porque el popup aún no es interactivo. ¿Qué se hace? | **Se espera explícitamente a que la opción sea interactiva antes de pincharla**, en `proveedores-ui/unit-select.test.tsx` y `shared/data-table-pagination.test.tsx`. **No se relaja ninguna aserción**: se pide de forma explícita el mismo respiro que antes se obtenía por accidente del `setTimeout(0)` que `user-event` intercalaba. Se descartan las dos salidas por excepción —sacarlos de la migración, o listarlos en la guardia— porque pasarían de 1 a 3 excepciones y erosionarían justo lo que esta ficha compra: que exista **una** forma de teclear. **Se acepta a cambio que estos dos archivos excedan el «cambio mecánico de una línea» del bloque B**, y que R9 se lea sobre el comportamiento del componente, no sobre el cuerpo literal del test |

### El terreno medido antes de especificar (2026-09-07)

Datos tomados en el worktree, sobre `af5d258`. No son requisitos: son el suelo del que parte
`spec_author`, para que no los vuelva a medir.

- **224 llamadas a `userEvent.setup()` en 33 archivos.** Solo 2 pasan opciones: la excepción
  deliberada de `async-autocomplete.test.tsx:248` y el precedente de `recipe-form.test.tsx:201`.
- **`vitest.config.mts` no fija `testTimeout` en ningún proyecto**: los tres corren con el default
  de 5000 ms, que es literalmente el número del error.
- **Reparto de los tres proyectos**: `ui` 50 archivos (jsdom), `node` 156, `integration` 27 (en
  serie, con `fileParallelism: false`).
- El proyecto `ui` monta `setupFiles: ['./tests/setup.ts']`, que hoy solo importa
  `@testing-library/jest-dom/vitest`.
- **El gate del 2026-09-07 pasó las cinco entradas del baseline** y avisó «5 por limpiar». Que
  pasen una corrida **no** es prueba de que el flake esté muerto: es justo el error que la tabla
  de arriba convierte en criterio de cinco corridas.
