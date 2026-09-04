# QC-55 — tabla-de-datos-compartida · bitacora de implementacion

Rama `feature/QC-55-tabla-de-datos-compartida`, worktree
`.worktrees/QC-55-tabla-de-datos-compartida/`. Spec aprobado por el humano el 2026-09-04 (F1.4).

## T0 — Base heredada verificada (2026-09-04)

Comprobado uno por uno sobre el worktree ya sincronizado con `origin/dev`:

1. **`components.json`** presente (`style: base-nova`, alias `utils: @/lib/utils`) y
   `lib/utils.ts:4` exporta `cn`. **OK**
2. **`components/ui/table.tsx`** presente, con `div[data-slot=table-container]` y
   `overflow-x-auto`. **No se re-crea.** **OK**
3. **Primitivas**: `skeleton.tsx`, `dropdown-menu.tsx`, `select.tsx`, `button.tsx`,
   `input.tsx` ya estaban. **Faltaba `popover.tsx`** — anadida por CLI en T2 junto con
   `calendar.tsx`.
4. **`vitest.config.mts`** presente. **Matiz respecto a `tasks.md`**: no es un `include`
   unico, son **tres `projects`** (`ui` jsdom para `tests/**/*.test.tsx` y `tests/ui/**`,
   `node` para el resto de `tests/**/*.test.ts`, `integration` en serie). Consecuencia para
   esta feature: los tests con DOM tienen que llamarse `.test.tsx`, y los puros `.test.ts`.
   `pnpm test` arranca. **OK**
5. **`tests/helpers/viewport.ts`** exporta `setViewportWidth`, `resetViewport`,
   `NARROW_VIEWPORT` (375) y `WIDE_VIEWPORT` (1280). **OK**
6. **`lib/shared/pagination.ts`** exporta `DEFAULT_PAGE_SIZE` (10) y `MAX_PAGE_SIZE` (25).
   **OK**

Ningun punto obligo a parar.

## T1 — Dependencias

`docs/dependencias.md` **ya traia las dos filas** (`@tanstack/react-table` y
`react-day-picker`), escritas por el leader al aprobar el spec (commit `2ba085f`), asi que
esta task se limito a instalar.

- `pnpm add @tanstack/react-table` -> **`^9.2.4`**. Verificado en el paquete instalado que
  `columnPinningFeature` y `rowSortingFeature` existen entre sus exports.
- `react-day-picker` **`^10.0.1`** la instalo el CLI de shadcn en T2, como manda la decision 6.
- `@tanstack/react-store`, `date-fns` y `@date-fns/tz` quedan como **transitivas sin fila**
  (decision 14): ninguna esta en `dependencies` directas.
- `pnpm exec vitest related --run tests/guards/guard-dependencias-aprobadas.test.ts` -> **2
  passed**.

## T2 — Primitivas por CLI

`pnpm exec shadcn add calendar popover` (CLI **4.16.2**, el que el repo ya fija en
`package.json`). Genera `components/ui/calendar.tsx` y `components/ui/popover.tsx`.
`button.tsx` NO se sobrescribio (se respondio `no` al prompt).

### Desvio que necesita ratificacion humana (ver «Bloqueos» al final)

El registro de shadcn **hoy** emite `import { cn } from "cn"` en vez de
`import { cn } from "@/lib/utils"`, y el CLI anade a `package.json` **dos entradas directas
nuevas mas**: `cn@^0.2.5` y `date-fns@^4.4.0`. Las dos chocan de frente con **R31** («las
UNICAS dependencias directas nuevas ... y NO DEBE incorporar ninguna otra entrada directa
nueva en el manifiesto»), y `cn` ademas **falla el check 3** de salud.

Resuelto asi, y anotado, no escondido:

- **`date-fns` desinstalada de `dependencies` directas.** Ningun archivo la importa
  (`grep date-fns components/ui/` -> ninguno); el CLI la declara solo porque la entrada de
  registro de `react-day-picker` la lista. Sigue disponible como transitiva. **Consecuencia
  para T9**: pnpm aisla por defecto, asi que `import ... from 'date-fns'` desde codigo del
  repo **no resolveria** sin ser directa. Los tres atajos se escriben con aritmetica nativa
  de `Date` en vez de `subWeeks`/`subMonths`/`subYears` — desvio consciente de
  `design.md > 6.1`, tomado porque **R31 es requisito y §6.1 es un «como»**.
- **`cn` desinstalada de `dependencies` directas**, y en los dos archivos generados se
  normalizo el especificador del import a `@/lib/utils` — que es literalmente el alias
  `utils` que declara `components.json` y lo que ya hacen los otros 16 archivos de
  `components/ui/`. Es la unica linea tocada de cada archivo generado; el resto es CLI puro.

---

## Archivos creados y modificados

### Produccion (10 archivos, todos nuevos, todos bajo `components/shared/data-table/`)

| Archivo | Task |
| --- | --- |
| `data-table-types.ts` | T3 |
| `data-table-params.ts` | T4 |
| `data-table-states.tsx` | T5 |
| `data-table-pagination.tsx` | T6 |
| `data-table-header-menu.tsx` | T7 |
| `data-table-filters.tsx` | T8 |
| `data-table-filter-date.tsx` | T9 |
| `use-pinned-columns.ts` | T10 |
| `data-table.tsx` | T11 |
| `index.ts` (barrel, unica superficie publica) | T11 |

### Primitivas anadidas por CLI (T2), no escritas a mano
`components/ui/calendar.tsx`, `components/ui/popover.tsx`.

### Tests (11 archivos, 121 tests propios)
En `tests/unit/shared/`: `data-table-params.test.ts`, `data-table-states.test.tsx`,
`data-table-pagination.test.tsx`, `data-table-header-menu.test.tsx`,
`data-table-filters.test.tsx`, `data-table-filter-date.test.tsx`,
`use-pinned-columns.test.tsx`, `data-table.test.tsx`, `data-table-viewport.test.tsx`,
`data-table-alcance.test.ts`, `data-table-contrato.test.tsx`.

### Manifiesto
`package.json` + `pnpm-lock.yaml`: **solo** `@tanstack/react-table@^9.2.4` y
`react-day-picker@^10.0.1` como entradas directas nuevas. `docs/dependencias.md` ya traia sus dos
filas (commit `2ba085f`); no se anadio ninguna otra.

### Lo que NO se toco (T14, verificado sobre el diff)
`app/**`, `lib/modules/**`, `db/**`, `e2e/**`, ninguna Server Action, ningun archivo de
`components/ui/` que no venga del CLI, y **ninguna pantalla consume el componente** (R34).

## Desvios del `design.md`, con su motivo

1. **`DATA_TABLE_FEATURES` registra TRES capacidades, no dos.** `design.md > 4` lista
   `columnPinningFeature` + `rowSortingFeature` dando por hecho que `getStart()` lo aporta el
   pineo. **Verificado en el paquete publicado** (`table-core@9.2.4`,
   `features/column-sizing/columnSizingFeature.utils.js`, `column_getStart` linea 116,
   `column_getAfter` linea 130) que en v9 esos metodos los aporta **`columnSizingFeature`**, que es
   el prerrequisito del pineo. Como es `design.md > 5` quien manda calcular el desplazamiento con
   `getStart()`, registrarlo es lo que **cumple** R24 por el mecanismo que el diseno pide. R32 se
   sigue cumpliendo: quedan fuera `columnResizingFeature` (la interactiva),
   `columnVisibilityFeature`, `columnOrderingFeature`, `columnGroupingFeature`,
   `columnFacetingFeature`, `columnFilteringFeature`, `globalFilteringFeature`,
   `rowPaginationFeature`, `rowSelectionFeature`, `rowExpandingFeature`, `rowPinningFeature`,
   `rowAggregationFeature`, `cellSelectionFeature` y `cellSpanningFeature`. El test de R32 lo
   afirma nombrando las **catorce** no optadas.
2. **Los tres atajos de fecha se calculan con `Date` nativo, no con `date-fns`.**
   `design.md > 6.1` prefiere `date-fns` porque «ya viaja con `react-day-picker`». No es viable:
   pnpm aisla por defecto, asi que importar una transitiva desde codigo del repo **no resuelve**, y
   promoverla a directa violaria **R31** (NO DEBE incorporar ninguna otra entrada directa nueva).
   R31 es requisito; §6.1 es un «como». El calculo vive en una funcion pura exportada y probada
   (`computeDateShortcutRange`), y las fechas se formatean en **hora local** con
   `getFullYear`/`getMonth`/`getDate`, no con `toISOString()`, que desplaza por huso.
3. **El `cn` de los dos archivos generados apunta a `@/lib/utils`.** Detallado arriba, en T2.
4. **`DataTableTexts` gano una clave, `columnMenu`**, para el `aria-label` del disparador del menu
   de columna: sin ella el disparador tomaba prestada la etiqueta de la barra de filtros, que dice
   otra cosa. Es una adicion al contrato de `design.md > 3.3`, no una contradiccion.

## Mapa `R<n> -> test`

Todos los tests estan en `tests/unit/shared/` salvo donde se indique otra cosa. **Los 36
requisitos tienen al menos un test nombrado.**

| R | Test |
| --- | --- |
| R1 | `data-table.test.tsx`: exporta el componente y sus tipos, y nada interno mas. `data-table-alcance.test.ts`: ningun consumidor fuera de la feature importa una ruta profunda en vez del barrel |
| R2 | `data-table.test.tsx`: ningun archivo del directorio importa lib/modules, lib/composition, lib/shared/db ni next/navigation |
| R3 | `data-table-contrato.test.tsx`: la misma tabla pinta columnas distintas segun la configuracion recibida, sin conocer ninguna columna concreta; invertir el orden del array de columnas invierte el orden de las cabeceras pintadas |
| R4 | `data-table.test.tsx`: presenta filas de un segundo tipo de entidad sin cambiar la API del componente |
| R5 | `data-table-contrato.test.tsx`: el indicador de pagina sigue mostrando lo que dicen las props hasta que se re-renderiza con params nuevos; fijar una columna SI cambia lo pintado sin que cambien los params, y NO emite onParamsChange |
| R6 | `data-table.test.tsx`: activar una cabecera ordenable invoca onParamsChange una sola vez con el conjunto completo. `data-table-pagination.test.tsx`: avanzar emite page + 1 sin tocar el resto de parametros |
| R7 | `data-table-params.test.ts`: la forma por defecto arranca en la primera pagina, con el tamano por defecto y sin nada mas; cada transicion devuelve un objeto nuevo, nunca muta el que recibe |
| R8 | `data-table-params.test.ts`: cambiar el tamano de pagina lleva la pagina de vuelta a la primera. `data-table-pagination.test.tsx`: cambiar el tamano de pagina emite page 1 con el nuevo tamano |
| R9 | `data-table-contrato.test.tsx`: renderiza con columnas declaradas como funciones y un manejador de cliente; data-table.tsx declara use client en su primera linea con codigo |
| R10 | `data-table-pagination.test.tsx`: deshabilita retroceder en la primera pagina; deshabilita avanzar en la ultima pagina; el indicador de pagina usa role status |
| R11 | `data-table-pagination.test.tsx`: el selector de tamano ofrece exactamente las opciones de PAGE_SIZE_OPTIONS. `data-table-params.test.ts`: las dos unicas opciones de tamano de pagina son el defecto y el tope compartidos; ningun archivo fuente de components/shared/data-table contiene 10 o 25 como literal de tamano de pagina |
| R12 | `data-table-header-menu.test.tsx`: activar la cabecera con teclado emite el orden ascendente cuando no habia orden previo; refleja los tres valores de aria-sort segun el orden vigente; alterna descendente a ascendente al reactivar una cabecera ya en orden descendente |
| R13 | `data-table.test.tsx`: pinta las filas exactamente como llegan, en el mismo orden, aunque sort, filtros o pagina digan otra cosa |
| R14 | `data-table-header-menu.test.tsx`: una columna sin sortable no ofrece boton de orden y no emite nada al interactuar; una columna sin sortable no ofrece las acciones de orden en el menu |
| R15 | `data-table-filters.test.tsx`: la columna sin filter NO aparece en la barra, en negativo; las columnas con filter si aparecen, una por forma; los cuatro casos de forma -texto, rango numerico, seleccion y rango de fechas- |
| R16 | `data-table-filters.test.tsx`: el boton de limpiar de un filtro activo saca su clave del objeto; limpiar un filtro no toca los demas filtros activos. `data-table-params.test.ts`: limpiar un filtro con null lo SACA del objeto en vez de emitirlo vacio |
| R17 | `data-table-filters.test.tsx`: escribir en la busqueda emite el campo global con rebote. `data-table-params.test.ts`: cambiar la busqueda por texto emite el campo global sin tocar los filtros |
| R18 | `data-table-filter-date.test.tsx`: **once casos de calculo con valores esperados escritos a mano** -un 31 hacia febrero, un 31 hacia un mes de 30, un 31 hacia otro de 31, un 29-feb bisiesto por mes y por año, tres cruces de año hacia atras y los tres desde mitad de mes-; el fin del rango es hoy sin arrastrar hora; un barrido de los dias 28 a 31 de los 24 meses de 2027 y 2028 que exige que el intervalo sea valido y caiga en el periodo pedido; el rango del atajo activado queda seleccionado y visible en el calendario; elegir dos dias en el calendario controlado emite el rango completo. `data-table-viewport.test.tsx`: se abre y un atajo emite su rango, en 375 y en 1280 |
| R19 | `data-table-states.test.tsx`: el estado vacio se identifica por su data-testid propio; pinta el emptyAction opcional cuando la pantalla lo entrega. `data-table.test.tsx`: vacio, sin filas y sin carga ni error, estado vacio identificable |
| R20 | `data-table-states.test.tsx`: se identifica por su data-testid propio y pinta filas de esqueleto. `data-table.test.tsx`: loading, indicador de carga, con las barras visibles |
| R21 | `data-table-states.test.tsx`: se identifica por role alert; con status error NO se renderiza el estado vacio; los cuatro casos del helper de precedencia. `data-table.test.tsx`: error, role alert, sin filas, sin barras |
| R22 | `data-table-states.test.tsx`: cambia de contenido cuando cambian los textos recibidos por props, sin afirmar el literal -dos casos- |
| R23 | `data-table-header-menu.test.tsx`: fijar emite onTogglePin y una columna con pinnable en false no ofrece la accion de fijar; una columna fijada ofrece soltar |
| R24 | `data-table.test.tsx`: fijar una columna le aplica position sticky y un desplazamiento calculado por getStart/getAfter, no un numero magico propio. `data-table-viewport.test.tsx`: una columna fijada conserva su position sticky y su desplazamiento, en 375 y en 1280 |
| R25 | `use-pinned-columns.test.tsx`: fijar una columna la guarda en localStorage bajo la clave construida; restaura lo fijado guardado previamente al montarse; un valor con JSON invalido se degrada a sin nada fijado, sin lanzar; un JSON valido con forma equivocada tambien; descarta ids de columna que ya no existen; fijar y soltar siguen funcionando cuando setItem lanza; idem cuando getItem lanza |
| R26 | `use-pinned-columns.test.tsx`: aisla lo fijado entre dos tableId distintos |
| R27 | `data-table-header-menu.test.tsx`: el disparador cumple el objetivo tactil minimo y se abre por teclado. `data-table-pagination.test.tsx`: los disparadores de la barra cumplen el tamano tactil minimo. `data-table-filters.test.tsx`: el campo de busqueda cumple min-h-11 min-w-11 y text-base. `data-table-filter-date.test.tsx`: el disparador del popover lleva min-h-11 min-w-11. `data-table-viewport.test.tsx`: los cinco casos sensibles en 375 y en 1280 |
| R28 | `data-table.test.tsx`: el scroll horizontal vive en el div con data-slot table-container, no en un ancestro del documento; ningun archivo de la feature contiene 100vh. `data-table-viewport.test.tsx`: los dos equivalentes, en 375 y en 1280 |
| R29 | `data-table-viewport.test.tsx`: describe.each con NARROW_VIEWPORT y WIDE_VIEWPORT sobre los cinco casos sensibles; ningun archivo de la feature declara hidden md:block o md:hidden que oculte un control por completo; el calendario del filtro de fechas ADAPTA el numero de meses por ancho, no lo hace desaparecer |
| R30 | `data-table-contrato.test.tsx`: toolbarActions llega por props y se pinta tal cual; ningun archivo del directorio de la feature contiene getSession, auth, cookies ni headers. `data-table.test.tsx`: ningun archivo del directorio importa next/navigation |
| R31 | `data-table-alcance.test.ts`: las UNICAS entradas nuevas de esta feature son @tanstack/react-table y react-day-picker; las transitivas @tanstack/react-store, date-fns y @date-fns/tz NO llevan entrada directa; las dos tienen su fila en docs/dependencias.md. Mas `tests/guards/guard-dependencias-aprobadas.test.ts`, sus dos guardias |
| R32 | `data-table.test.tsx`: la lista de capacidades optadas es exactamente columnPinningFeature + columnSizingFeature + rowSortingFeature y no mas; el test nombra las catorce no optadas |
| R33 | `data-table-alcance.test.ts`: ningun archivo de components/ui/ importa components/shared/data-table; existe components/ui/calendar.tsx anadido por CLI; components/ui/table.tsx sigue conteniendo data-slot table-container y overflow-x-auto |
| R34 | `data-table-alcance.test.ts`: ningun archivo bajo app/, lib/modules/, db/ o e2e/ importa components/shared/data-table; ningun archivo de la feature importa las pantallas de inventario ni de produccion |
| R35 | `data-table-alcance.test.ts`: la base heredada existe en el repo; la feature no re-crea ningun archivo con el mismo nombre que la base heredada; data-table-params.ts importa DEFAULT_PAGE_SIZE y MAX_PAGE_SIZE de @/lib/shared/pagination, no los declara propios |
| R36 | `data-table-alcance.test.ts`: e2e/ no contiene ninguna referencia a data-table. Mas este mapa y el barrido de angosto y ancho de `data-table-viewport.test.tsx` |

## T13 — Comprobacion manual en iOS: NO HECHA. BLOQUEADA.

`tasks.md > T13` exige abrir el componente en Safari de iOS -o WebKit real, no jsdom- con una
tabla mas ancha que la pantalla y una columna fijada, y verificar que la columna se queda quieta,
que el scroll es de la tabla y **no del `body`**, y que el menu de cabecera se abre por toque.

**No se puede ejecutar desde aqui**: no hay dispositivo iOS ni WebKit real en este entorno, y
`tasks.md` ya lo dice -jsdom no puede probarlo-. Ademas **ninguna pantalla monta el componente
todavia** (R34), asi que no hay ni siquiera una URL que abrir sin escribir una pantalla de prueba,
que es justo lo que la decision 11 rechazo para el E2E.

**Es el punto caliente declarado de la ficha** -decision 17- y `product-table.tsx` evito el
`sticky` horizontal por esta misma razon. Lo que si esta cubierto por test: el `overflow-x-auto`
lo lleva el contenedor de la tabla, ningun ancestro declara scroll propio, no hay `100vh`, y el
desplazamiento sale de `getStart`/`getAfter` de la libreria. **Eso demuestra la estructura, no el
comportamiento de WebKit.**

Queda **devuelto al leader** para que lo decida el humano: o se hace la comprobacion manual antes
de cerrar la ficha, o se traslada explicitamente a QC-56 -que es quien estrena la primera pantalla
y por tanto la primera oportunidad real de abrirlo en un iPhone-, dejandolo escrito.

## Preguntas abiertas: siguen escritas y sin rellenar con supuestos

Las **seis** de `requirements.md > Preguntas abiertas` siguen abiertas. Las cuatro que anadio
`spec_author` en F1.2 se implementaron con la **salida conservadora** que fija `design.md > 13`, y
cada una sigue aislada en un solo punto:

| Pregunta | Salida tomada | Donde vive |
| --- | --- | --- |
| 3, vuelta a la primera pagina al ordenar, filtrar o buscar | Solo al cambiar el tamano (R8); lo demas se emite tal cual | `data-table-params.ts`: `withSort`, `withFilter` y `withSearch` no tocan `page` |
| 4, columna de acciones y accion del vacio | `cell` devuelve `ReactNode`; `emptyAction` es una prop | `data-table-types.ts` |
| 5, multi-orden | Una sola columna: `DataTableSort` o `null` | `data-table-types.ts` |
| 6, borde y tope del pineo | Ambos bordes, sin tope declarado | `use-pinned-columns.ts` |

Ninguna se decidio por cuenta propia. Si el humano las cierra de otra forma, el cambio es local al
archivo indicado.

## Hallazgo para QC-56, no bloqueante y no arreglado aqui

`DataTableColumn` **no expone ancho de columna**, asi que todas las columnas caen en el tamano por
defecto de la libreria -150 px- y `getStart` devuelve multiplos de esa cifra. Funciona, pero el
desplazamiento del pineo solo sera fiel a la realidad cuando las columnas puedan declarar su
tamano. Anadir `size` opcional a `DataTableColumn` es una linea; **no se hizo** porque el contrato
de `design.md > 3.2` esta aprobado y no lo incluye -regla 6 de `CLAUDE.md`-.

## Verificacion: salida real

Antes de correr el gate hubo que **poner el worktree al dia**: `pnpm exec prisma generate`,
`pnpm exec next typegen`, copiar `.env` -esta en `.gitignore` y no viaja al worktree- y sobre todo
**`git merge dev`**: `dev` avanzo con QC-52 mientras corria la implementacion, y sin ese merge
fallaban 16 archivos de integracion y `tests/unit/inventario/product-page.test.tsx` por desfase de
esquema, no por esta feature. Comprobado que esos mismos archivos pasaban en `dev`.

### Solo los tests de la feature

```
$ pnpm exec vitest run tests/unit/shared
 Test Files  11 passed (11)
      Tests  121 passed (121)
```

### Gate COMPLETO

```
$ ./init.sh
 Test Files  152 passed (152)
      Tests  1694 passed (1694)
   Duration  82.70s

aviso: 2 archivo(s) del baseline ya pasan; toca limpiarlos:
  tests/unit/recetas-ui/recipe-route-contract.test.ts
  tests/unit/recetas/module-contract.test.ts
tests: sin rojos nuevos -0 rojos, todos en el baseline de 2-; 2 por limpiar
todas las migraciones tienen down.sql
.env presente
== init OK ==

EXIT=0
```

`pnpm run typecheck` limpio. `pnpm run lint`: **0 errores**.

**Sin E2E**, diferido con motivo a QC-56 -decision 11, R36-.

## Estado de las tasks

Hechas: T0, T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T14, T15.
Pendiente: **T13**, bloqueada por falta de dispositivo, ver arriba.

---

# Segunda vuelta: correcciones del rechazo del reviewer (2026-09-04)

El `reviewer` RECHAZO la feature. Su veredicto esta en
`progress/review_QC-55-tabla-de-datos-compartida.md`. Reprodujo el gate por su cuenta, confirmo que
el mapa `R<n> -> test` es fiel y que 35 de 36 requisitos tenian test que verifica de verdad. Lo
corregido, punto por punto:

## B2 (bloqueante) — `computeDateShortcutRange` calculaba mal, y su test no podia verlo

**El bug era real y estaba en produccion.** `data-table-filter-date.tsx` restaba meses y años con
`setMonth`/`setFullYear`, que **desbordan**: `new Date(2026, 2, 31).setMonth(1)` es «31 de
febrero», que JavaScript normaliza a marzo. **El dia 31 de cualquier mes el atajo estaba roto.**
Reproducido con el codigo tal como estaba, y son los tres numeros que dio el reviewer:

| Atajo | Hoy | Daba | Debia dar |
| --- | --- | --- | --- |
| Ultimo mes | 2026-03-31 | `2026-03-03` | `2026-02-28` |
| Ultimo mes | 2026-05-31 | `2026-05-01` -no cubria **ni un dia** de abril- | `2026-04-30` |
| Ultimo año | 2028-02-29 | `2027-03-01` | `2027-02-28` |

**Arreglo.** Restar dias con `setDate` sigue siendo seguro -desbordar al mes anterior es justo lo
que se quiere-, pero restar meses o años pasa ahora por `subtractMonthsClamped`, que **acota el
dia al ultimo del mes destino** antes de construir la fecha, y que lleva el indice de mes a una
cuenta absoluta -`año * 12 + mes`- para que el cruce de año hacia atras no dependa del signo del
resto. `lastYear` es el mismo camino con 12 meses, asi que el 29-feb queda cubierto por la misma
linea que el 31.

**Por que el test no lo veia, y como se arreglo.** Las dos razones que dio el reviewer eran
correctas y las dos estaban en el mismo bloque:

1. **Reimplementaba la formula bajo prueba** (`restar: (d) => d.setMonth(d.getMonth() - 1)`), asi
   que confirmaba el bug en vez de encontrarlo. Un test que repite la implementacion no verifica
   nada: solo pregunta si la funcion se parece a si misma. Sustituido por **valores esperados
   literales, escritos a mano uno por uno**.
2. **Probaba una sola fecha de sistema**, `2026-06-15` — mitad de mes y año no bisiesto, el unico
   caso que pasaba por casualidad. Ahora son **once casos** con las fechas que muerden: los tres
   31 (hacia febrero, hacia un mes de 30 y hacia otro de 31), el 29-feb de un bisiesto por mes y
   por año, y tres cruces de año hacia atras desde el 1 de enero.

Ademas se añadieron dos tests que el reviewer no pidio pero que cierran el hueco de raiz:
- el fin del rango es siempre hoy **sin arrastrar la hora** (se le pasa una fecha con 23:47:12);
- un **barrido** de los dias 28, 29, 30 y 31 de los 24 meses de 2027 y 2028 -uno bisiesto- que
  exige, para los tres atajos, que `from < to` y que el salto sea exactamente de un mes o de un
  año. Esa es la red que atrapa el desborde en cualquier combinacion, no solo en las escritas.

**Comprobado que el test MUERDE.** Se reintrodujo a proposito la aritmetica con
`setMonth`/`setFullYear` y se corrio el archivo: **4 tests en rojo**, con los tres numeros exactos
del reviewer y el barrido cayendo al mismo tiempo.

```
× el atajo de 'mes desde el 31 de marzo (febrero tie…' va de '2026-02-28' a '2026-03-31'
× el atajo de 'mes desde el 31 de mayo (abril tiene …' va de '2026-04-30' a '2026-05-31'
× el atajo de 'año desde el 29 de febrero de un bisi…' va de '2027-02-28' a '2028-02-29'
× el inicio del rango nunca cae DESPUES del fin, ni siquiera en los dias 29, 30 y 31

AssertionError: expected '2026-03-03' to be '2026-02-28'
AssertionError: expected '2026-05-01' to be '2026-04-30'
AssertionError: expected '2027-03-01' to be '2027-02-28'
AssertionError: expected +0 to be 1

Tests  4 failed | 15 passed (19)
```

Restaurada la version corregida: **19 passed (19)**. Con esto **R18 pasa a tener test que
verifica de verdad**, y los 36 requisitos quedan cubiertos.

Se mantiene la premisa de **no usar `date-fns`**, que el reviewer valido de forma independiente
(no existe `node_modules/date-fns`, solo bajo `.pnpm/`).

## M1 (mayor) — la desviacion de `design.md > 6.1` vivia solo aqui

`docs/architecture.md` exige que el porque de apartarse del diseño este **en el `design.md`**, no
en `progress/`. Añadido alli, en §6.1, un bloque de correccion fechado que explica que pnpm aisla
las transitivas —asi que el import ni siquiera resuelve, no es que sea «fragil»—, que hacerla
directa choca con R31, que entre las dos manda R31 por ser requisito frente a un «como», y que la
salida sigue identificada si algun dia se quiere la libreria. Se documenta ahi tambien la trampa
del desborde de `setMonth` y la regla de que los esperados del test se escriben a mano. El parrafo
de «Riesgo anotado, no oculto» que ya existia se deja, anotando que el riesgo se habia visto y se
habia **subestimado**.

## M2 (mayor) — dos documentos decian «dos capacidades» y el codigo registra tres

El reviewer **confirmo la afirmacion contra el paquete instalado**: en
`@tanstack/table-core@9.2.4`, `column_getStart` y `column_getAfter` se registran en
`columnSizingFeature.js`, y `columnPinningFeature.js` solo aporta `getIsPinned`, `getCanPin` y
`getPinnedIndex`. **El codigo estaba bien; el incompleto era el diseño.** Corregidos los dos
sitios que quedaban mintiendo:

- **`design.md > 4`**: la lista pasa a las tres capacidades, con un bloque de correccion fechado
  que explica que `columnSizingFeature` es el **prerrequisito** que aporta `getStart()` —el
  mecanismo que §5 manda usar— y no una capacidad de mas, que sin el solo quedan dos salidas
  peores (cablear un ancho fijo, que es lo que §10 B descarta, o incumplir R24), y que R32 se
  sigue cumpliendo. Aclarado ademas que lo que sigue fuera es `columnResizingFeature`, el
  redimensionado **interactivo**, que es otra cosa que `columnSizingFeature`.
- **la fila de `@tanstack/react-table` en `docs/dependencias.md`**: misma correccion, con la
  verificacion contra el paquete instalado citada.

## Lo que NO se toco, por instruccion del leader

- **T13** (comprobacion manual del `sticky` en iOS): el reviewer dictamino que no es exigible
  aqui, pero que solo el humano puede trasladarla por escrito. Sigue en su mesa y sigue `[ ]`.
- **La edicion del import de `cn` en `calendar.tsx` y `popover.tsx`**: dictaminada **aceptable**
  por el reviewer, que verifico que `components.json` declara `"utils": "@/lib/utils"` y que los
  otros 16 archivos de `components/ui/` importan igual. Entre la regla 7 y «ninguna primitiva se
  edita a mano», gana la regla 7. Pendiente solo de ratificacion humana escrita.

## Gate tras las correcciones

```
$ ./init.sh
 Test Files  152 passed (152)
      Tests  1704 passed (1704)

tests: sin rojos nuevos
== init OK ==

EXIT=0
```

`typecheck` limpio, `lint` **0 errores y 0 warnings** -de paso se limpio el unico warning propio
que quedaba, un parametro sin usar en `data-table-contrato.test.tsx`-. Diez tests mas que en la
primera vuelta: el bloque de atajos pasa de 3 casos generados por la propia formula a 11 escritos
a mano, mas los dos de red -hora y barrido de los dias 28 a 31-.
