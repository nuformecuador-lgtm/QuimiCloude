# QC-55 — tabla-de-datos-compartida · design.md

> Zona `frontend` · Complejidad `high` · `depends_on` null · Rama
> `feature/QC-55-tabla-de-datos-compartida`
>
> Este documento decide el **cómo** de los requisitos de `requirements.md`. No reabre ninguna fila
> de `## Decisiones cerradas (no reabrir)`: las traduce a estructura de archivos, contratos de
> entrada/salida y puntos de verificación.

## 0. Qué NO toca esta feature

**No hay modelo de datos, no hay tablas, no hay RLS y no hay migraciones.** Es una feature de capa
visual pura: no abre `db/`, no abre `lib/modules/`, no escribe ni consume Server Actions y no
declara ninguna ruta nueva de Next. Las secciones que `docs/specs.md` pide para datos y endpoints
quedan vacías **a propósito**, no por olvido (R2, R34).

Tampoco toca las pantallas existentes. `app/(private)/inventario/components/**` y
`app/(private)/produccion/formulas/components/**` se leen como **contrato a cubrir** y se dejan
intactos: migrarlos es QC-56 (R34).

## 1. Panorama

```
                       pantalla (Server Component async)  ← trae los datos, hoy y después
                                    │ filas ya obtenidas
                                    ▼
                  envoltorio de la pantalla ('use client')  ← declara columnas y traduce el cambio
                                    │ props: rows, columns, params, callbacks
                                    ▼
                      components/shared/data-table  ← ESTA FICHA
                       ├── barra de filtros + búsqueda
                       ├── tabla (cabecera ordenable + columnas fijables)
                       ├── barra de paginación
                       └── vacío | cargando | error
                                    │ onParamsChange(nuevos parámetros de lista)
                                    ▼
                       la pantalla decide qué hacer (hoy: reescribir la URL)
```

El componente **emite y no consulta** (decisión 3). Lo que hoy hace `ProductListToolbar` —traducir
un cambio a una navegación con `router.push`— se queda **fuera**: es política de la pantalla, y una
pantalla futura podría querer estado local en vez de URL.

### 1.1 La frontera servidor→cliente, que es el punto no obvio (R9)

La configuración de columnas del repo son **funciones** (`value: (row) => string`). Una función
**no es serializable** y no puede cruzar de un Server Component a un Client Component como prop:
React lanza en tiempo de render. Por eso el contrato no es «la página server pasa `columns`», sino:

- la **pantalla server** obtiene los datos y renderiza un envoltorio de cliente pasándole solo
  datos planos (filas, parámetros, total de páginas, mensajes);
- el **envoltorio de cliente** (`'use client'`, propio de cada pantalla, lo escribirá QC-56)
  importa su archivo de columnas y se lo pasa al componente compartido, junto con
  `onParamsChange`.

Esto se documenta aquí porque es el error que hace fracasar la migración de QC-56 si se descubre
tarde, y porque explica por qué el componente compartido lleva `'use client'` en su raíz.

## 2. Estructura de archivos

```
components/shared/data-table/
  index.ts                     # barrel: la ÚNICA superficie pública (R1)
  data-table.tsx               # 'use client' — compone todo y monta la instancia de tabla
  data-table-types.ts          # tipos del contrato: columnas, filtros, parámetros (sin React)
  data-table-params.ts         # forma canónica de los parámetros y sus transiciones (puro)
  data-table-header-menu.tsx   # menú por columna: ordenar / fijar / filtrar (R12, R23, R27)
  data-table-filters.tsx       # barra de filtros + búsqueda (R15, R16, R17)
  data-table-filter-date.tsx   # rango de fechas + atajos (R18)
  data-table-pagination.tsx    # barra de paginación + tamaño de página (R10, R11)
  data-table-states.tsx        # vacío | cargando | error (R19, R20, R21, R22)
  use-pinned-columns.ts        # persistencia del pineo en localStorage (R25, R26)
```

Un **directorio** con barrel, no un archivo suelto: son nueve piezas y `components/shared/` hoy
tiene archivos planos porque ninguno pasaba de uno. El barrel es lo que hace cumplir R1 y lo que
permite mover piezas internas sin tocar a los consumidores.

`data-table-params.ts` y `data-table-types.ts` **no importan React ni DOM** a propósito: es lo que
permite probar las transiciones de parámetros (R6, R7, R8, R16) sin montar nada, igual que hace hoy
`product-list-params.ts`.

## 3. Contrato de entrada/salida

Nombres orientativos; lo vinculante es la forma. Todo `readonly`, `strict: true`, sin `any`.

### 3.1 Parámetros de lista (lo que se emite, R7)

```ts
type SortDirection = 'asc' | 'desc';
type DataTableSort = { readonly columnId: string; readonly direction: SortDirection };

type DataTableFilterValue =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'numberRange'; readonly min: number | null; readonly max: number | null }
  | { readonly kind: 'select'; readonly values: readonly string[] }
  | { readonly kind: 'dateRange'; readonly from: string | null; readonly to: string | null };

type DataTableParams = {
  readonly page: number;
  readonly pageSize: number;
  readonly sort: DataTableSort | null;            // una sola columna (pregunta abierta 5)
  readonly filters: Readonly<Record<string, DataTableFilterValue>>;
  readonly search: string;                        // '' = sin búsqueda
};
```

**Una sola forma para todos los cambios** (R7): `onParamsChange(next: DataTableParams)` recibe
siempre el conjunto completo, nunca un delta. Un delta obligaría a cada consumidor a reconstruir el
estado y es donde nacen las desincronizaciones.

`sort` es **un objeto o `null`, no una lista**, por la pregunta abierta 5: hoy se ordena por una
columna. Si algún día son varias, el cambio es de `DataTableSort | null` a
`readonly DataTableSort[]` en un solo archivo, y QC-57 lo ve venir en el tipo.

Las fechas viajan como **cadena `YYYY-MM-DD`**, no como `Date`: es lo que puede ir a una query
string sin ambigüedad de huso, el mismo criterio determinista por el que `product-columns.ts`
formatea con `toISOString().slice(0, 10)` en vez de `toLocaleDateString`.

### 3.2 Configuración de columnas (R3, R4)

```ts
type DataTableColumn<TRow> = {
  readonly id: string;
  readonly label: string;
  readonly align: 'start' | 'end';
  readonly cell: (row: TRow) => ReactNode;        // ver pregunta abierta 4
  readonly sortable?: boolean;                    // ausente = no ordenable (R14)
  readonly filter?: DataTableFilterSpec;          // ausente = no aparece en la barra (R15)
  readonly pinnable?: boolean;                    // ausente = el usuario puede fijarla (R23)
};
```

Genérico en `TRow` (R4): el componente **no importa ningún tipo de dominio**. `cell` devuelve
`ReactNode` y no `string` — es la salida conservadora de la **pregunta abierta 4**, y lo único que
permite que QC-56 migre la columna de acciones de `product-table.tsx`, que hoy pinta dos botones.
Si el humano cierra la pregunta 4 de otra forma, cambia esta línea y su test.

### 3.3 Props del componente

```ts
type DataTableProps<TRow> = {
  readonly tableId: string;                       // clave de persistencia del pineo (R25, R26)
  readonly columns: readonly DataTableColumn<TRow>[];
  readonly rows: readonly TRow[];
  readonly getRowId: (row: TRow) => string;
  readonly params: DataTableParams;               // estado de lista, controlado desde fuera (R5)
  readonly totalPages: number;
  readonly onParamsChange: (next: DataTableParams) => void;
  readonly status: 'idle' | 'loading' | 'error';  // R19, R20, R21
  readonly errorMessage?: string;
  readonly texts: DataTableTexts;                 // R22
  readonly emptyAction?: ReactNode;               // R19 + pregunta abierta 4
  readonly toolbarActions?: ReactNode;            // p. ej. «Nuevo producto» (R30)
};
```

`status` es un **estado único de tres valores** y no tres booleanos: tres booleanos admiten ocho
combinaciones, seis de ellas sin significado, y R21 exige que los estados sean **mutuamente
excluyentes**. La precedencia queda cerrada por el tipo, no por una cadena de `if`.

`toolbarActions` es donde entra lo que dependa de permisos: el componente **no lee la sesión** y no
sabe si el usuario puede crear (R30). Recibe un nodo ya decidido por la pantalla.

## 4. La librería de tabla: qué se activa y qué no (R32)

`@tanstack/react-table` **9.x es modular**: se opta explícitamente por cada capacidad. El
componente declara una constante exportada con la lista, que es lo que hace R32 verificable:

```ts
export const DATA_TABLE_OPTED_FEATURES = [
  'columnPinningFeature',  // R23, R24 — getIsPinned / getCanPin / ColumnPinningState
  'columnSizingFeature',   // R24 — getStart() / getAfter(): los offsets acumulados del pineo
  'rowSortingFeature',     // R12, R14 — onSortingChange, estado de orden en la cabecera
] as const;
```

> **CORRECCIÓN, escrita en la implementación (2026-09-04): son TRES capacidades, no dos.**
>
> Esta sección listaba solo `columnPinningFeature` y `rowSortingFeature`, dando por hecho que
> `getStart()` —el mecanismo que **§5 manda usar** para calcular el desplazamiento de una columna
> fijada— lo aportaba el pineo. **No es así en v9.** Verificado en el paquete instalado
> (`@tanstack/table-core@9.2.4`): `column_getStart` y `column_getAfter` se registran en
> `features/column-sizing/columnSizingFeature.js`, mientras que `columnPinningFeature.js` solo
> aporta `getIsPinned`, `getCanPin` y `getPinnedIndex`. `columnSizingFeature` es el
> **prerrequisito** del pineo para offsets, no una capacidad de más.
>
> Sin él solo quedan dos salidas, y las dos son peores: cablear a mano un ancho fijo por columna
> —que es justo el «reimplementar lo que la librería ya hace» que §10 B descarta, y que además
> miente en cuanto dos columnas midan distinto— o no cumplir R24. **Registrarlo es lo que cumple
> R24 por el mecanismo que este mismo diseño pide.**
>
> **R32 se sigue cumpliendo**: se optan solo las capacidades que la ficha usa, no el conjunto
> completo. El test de R32 nombra las **catorce** que quedan fuera.

Y los tres modos manuales, que son lo que hace que la librería **no toque los datos** (R13):

```ts
manualSorting: true, manualPagination: true, manualFiltering: true,
```

**No** se activan las capacidades de agrupación, expansión, selección de filas, visibilidad,
reordenación ni **redimensionado interactivo** de columnas (`columnResizingFeature`, que es otra
cosa que `columnSizingFeature`): ninguna la pide esta ficha, y activarlas es peso y superficie de
API que nadie usa. Cuando una feature futura las necesite, se añade a la lista.

`manualPagination` merece énfasis: el backend ya devuelve `totalPages` (`buildPage` de
`lib/shared/pagination.ts`) y la tabla **no** debe recalcularlo sobre las filas que tiene, que son
solo una página.

## 5. Fijar columnas (R23, R24, R25, R26)

- **Quién**: el usuario, desde el menú de la cabecera de cada columna (decisión 8). La prop
  `pinnable` solo permite **excluir** una columna, nunca fijarla desde la pantalla.
- **Cómo se ve**: `position: sticky` con `left`/`right` calculados por `getStart()` de la
  librería, dentro del contenedor con `overflow-x-auto` que ya monta `components/ui/table.tsx`
  (`div[data-slot=table-container]`). **El scroll es de la tabla, nunca del `body`** (R28).
- **Persistencia**: `localStorage`, clave `qc:data-table:<tableId>:pinning`. Se lee **una vez, en
  un efecto tras el montaje**, no durante el render: leer `localStorage` en el render de un
  componente que también se renderiza en servidor produce discrepancia de hidratación. Estado
  inicial: sin nada fijado; si hay valor guardado, se aplica después.
- **Validación de lo leído**: el JSON se valida con **zod** (ya en el repo) contra la forma
  `{ left: string[], right: string[] }`, y se descartan ids de columna que ya no existen. Un valor
  corrupto, de otra versión o con una columna borrada **no puede romper la tabla** (R25).
- **Fallo de `localStorage`**: modo privado de Safari y cuotas llenas **lanzan** en `setItem`.
  Toda lectura y escritura va envuelta y el fallo degrada a «funciona sin recordar», nunca a
  excepción propagada (R25). Nada de `catch` vacío: se ignora con comentario que dice por qué
  (`docs/conventions.md > Manejo de errores`).

**El punto caliente de la ficha**, y lo dice la decisión 17: `sticky` horizontal dentro de un
scroll anidado se comporta distinto en WebKit. `product-table.tsx` dejó escrito que **no** añadía
columna pegajosa por eso mismo. Aquí se añade porque la ficha lo pide, así que la verificación de
R24/R28 no es opcional y la task correspondiente exige comprobación manual en iOS además del test.

## 6. Filtros (R15, R16, R17, R18)

- **Unión discriminada por `kind`** (§3.1), no un `Record<string, unknown>`: es lo que permite que
  el mismo control sepa qué pintar y que QC-57 valide con zod al otro lado sin adivinar.
- **Limpiar un filtro lo saca del objeto** en vez de emitirlo vacío (R16): así el consumidor no
  tiene que distinguir «sin filtro» de «filtro vacío», que es donde nacen las query strings con
  `?nombre=` colgando.
- **La búsqueda es un campo aparte** de `filters` (R17). Es global a la lista, no de una columna, y
  QC-57 la tratará distinto. Se emite aunque hoy no la honre nadie: cierra la deuda que QC-22 y
  QC-26 dejaron anotada sin ficha.
- **Nada se filtra en el cliente** (R13, R17). El componente pinta las filas que recibe.
- **Rebote (debounce) del campo de texto**: se emite con retardo corto para no disparar una
  navegación por pulsación. El retardo es una **constante exportada**, para que el test lo
  controle con temporizadores falsos en vez de esperar de verdad.

### 6.1 El rango de fechas y sus atajos

`react-day-picker` entra **por el CLI de shadcn** (`pnpm dlx shadcn@latest add calendar`), que
genera `components/ui/calendar.tsx` ya tematizado contra QC-29. En `mode="range"` con
`numberOfMonths` adaptado al ancho (uno en angosto, dos en ancho).

**Los atajos no existen en la librería** (verificado en la decisión 13: no hay ninguna prop de
atajos). Se escriben aquí: tres botones que calculan el rango y lo fijan en el calendario
controlado. El cálculo **iba a usar `date-fns`** (`subWeeks`, `subMonths`, `subYears`), que según
la decisión 6 **ya viaja con `react-day-picker`** y según la decisión 14 es **transitiva y no
lleva fila** en `docs/dependencias.md`, por `docs/architecture.md > Dependencias de terceros`
(«no reimplementes lo que ya resuelve una librería mantenida»).

> **CORRECCIÓN, escrita en la implementación (2026-09-04). No se usa `date-fns`: los atajos
> llevan aritmética nativa de `Date`.**
>
> El plan de arriba **no es ejecutable en este repo**, y el motivo no se descubre hasta intentarlo:
> **pnpm aísla las dependencias por defecto**. Una transitiva vive bajo `node_modules/.pnpm/` y
> **no** se enlaza en `node_modules/` raíz, así que un `import … from 'date-fns'` escrito en
> código nuestro **no resuelve** — no es que sea frágil, es que no compila. La única forma de
> importarla sería declararla como dependencia **directa**, y eso choca de frente con **R31**, que
> prohíbe expresamente «incorporar ninguna otra entrada directa nueva en el manifiesto» y que la
> guardia `guard-dependencias-aprobadas.test.ts` hace cumplir.
>
> Entre las dos, **manda R31**: es un requisito aprobado, y esta sección §6.1 es un «cómo».
> El coste es acotado y está aislado: el cálculo vive en **una función pura y exportada**
> (`computeDateShortcutRange` en `data-table-filter-date.tsx`), no esparcido por el componente.
>
> **La aritmética de fechas a mano tiene una trampa concreta y ya mordió una vez:**
> `setMonth`/`setFullYear` **desbordan**. `new Date(2026, 2, 31).setMonth(1)` es «31 de febrero»,
> que JavaScript normaliza a **marzo**, así que el día 31 de cualquier mes el atajo devolvía un
> rango que ni siquiera cubría el mes anterior (el 2026-05-31 daba `from = 2026-05-01`, sin un
> solo día de abril), y el 29 de febrero de un bisiesto pasaba lo mismo al restar un año. La
> salida es **acotar el día al último del mes destino** antes de construir la fecha. Los valores
> esperados de su test se escriben **a mano, uno por uno** —nunca reimplementando la fórmula, que
> es como el bug sobrevivió a la primera ronda— y cubren un 31 en mes corto y en mes largo, un
> 29-feb bisiesto y los cruces de año.
>
> **La salida sigue identificada** si algún día se quiere la librería: promover `date-fns` a
> dependencia directa con su fila y sus cuatro checks, lo que exige aprobación humana (regla 7) y
> reabrir R31.

> **Riesgo anotado antes de implementar, y que resultó ser peor de lo previsto:** importar una
> transitiva se anotó aquí como *frágil* —si una versión de `react-day-picker` dejara de depender
> de `date-fns`, el import se rompe—. Al implementarlo se vio que con pnpm **ni siquiera resuelve
> hoy**, no en una versión futura. Queda como está escrito para dejar constancia de que el riesgo
> se había visto y se había subestimado; lo que se hizo es la corrección de arriba.

## 7. Los tres estados (R19, R20, R21, R22)

| `status` | filas | Qué se pinta | Identificación |
| --- | --- | --- | --- |
| `error` | — | Estado de error: dice que falló + `errorMessage` | `role="alert"` + `data-testid` |
| `loading` | — | Esqueleto de filas (primitiva `skeleton`, ya instalada) | `data-testid` |
| `idle` | 0 | Estado vacío + `emptyAction` opcional | `data-testid` |
| `idle` | >0 | La tabla | `data-testid` |

**El error nunca se pinta como vacío** (decisión 7): decirle a un Operador sin permiso que el
catálogo está vacío es una respuesta falsa. La barra de filtros y la de paginación **siguen
visibles en `loading`** —el usuario no pierde de vista lo que pidió— y **se ocultan en `error`**,
porque paginar sobre un fallo no lleva a ningún sitio.

Todos los textos llegan por `texts` (R22). El componente no incrusta la palabra «producto» ni
«receta» en ningún sitio: es lo que lo hace compartido de verdad.

## 8. Multiplataforma (R27, R28, R29)

- Objetivos táctiles `min-h-11 min-w-11` (44 px), la misma clase `TOUCH_TARGET` que ya usa
  `product-list-toolbar.tsx`.
- El menú por columna se abre con **clic/toque sobre un botón visible**, nunca con `:hover`, y es
  un `dropdown-menu` de shadcn (primitiva ya instalada, accesible por teclado con Radix/Base UI).
- Inputs de filtro con `text-base` (16 px) para que iOS no haga zoom al enfocar.
- Sin `100vh`; el alto lo pone el contenido.
- Verificación en **angosto (375) y ancho (1280)** con `tests/helpers/viewport.ts` de QC-11.
- **Ninguna excepción de escritorio se declara** (decisión 18).

## 9. Dependencias nuevas (regla 7 de `CLAUDE.md`, R31)

Ninguna se instala en F1.2. Se aprueban **con el spec** (F1.4) y se instalan en la fase 2, con su
fila en `docs/dependencias.md`. Los cuatro checks los corrió el humano el 2026-09-04 y están en la
tabla de decisiones cerradas; se reproducen aquí porque es lo que
`docs/architecture.md > Dependencias de terceros` exige del `design.md`.

| Paquete | Qué código nos ahorra | Check 1 `deprecated` | Check 2 release < 12 meses | Check 3 ≥ 10k desc./sem. | Check 4 licencia |
| --- | --- | --- | --- | --- | --- |
| `@tanstack/react-table` 9.x | El estado de pineo (`ColumnPinningState`, `getIsPinned`, `getStart` con el cálculo de offsets acumulados), el de orden y los modos manuales. Escrito a mano son varios cientos de líneas con los casos de borde del offset y del orden, más sus tests | **No** marcada | **Sí** — `9.2.4`, 2026-08-28 | **Sí** — 20.010.461 | **MIT** |
| `react-day-picker` 10.x | El calendario de rango completo: navegación de meses, teclado, ARIA, locale y `mode="range"` con `DateRange`. Entra **por el CLI de shadcn**, ya tematizado | **No** marcada | **Sí** — `10.0.1`, 2026-08-31 | **Sí** — 44.673.977 | **MIT** |

**Los cuatro checks PASAN en las dos.** Verificados **en el paquete publicado**, no de memoria.
`peerDependencies: react >=18` en la tabla, y el repo va en 19.2.8.

**Transitivas, sin fila** (decisión 14; la guardia compara solo entradas directas de
`package.json`): `@tanstack/react-store`, `date-fns` y `@date-fns/tz`.

**Soporte móvil verificado** (`docs/architecture.md > Regla: multiplataforma`): las dos son
librerías headless/DOM estándar, sin APIs exclusivas de escritorio y sin dependencia de `hover`.
Lo que sí exige comprobación real en WebKit es **nuestro** uso de `sticky` (§5), no la librería.

## 10. Alternativas descartadas

**A. Un componente «conectado» que reciba la Server Action y traiga los datos él mismo.**
Descartada por la decisión 1 y por lo que implica: obliga a `'use client'` en la sección de lista y
tira el patrón vigente y verificado en el repo —Server Component `async` con el estado en la URL y
el esqueleto por `<Suspense key>`— que hoy funciona en dos pantallas. Además haría al componente
compartido conocer la forma de las Server Actions, que es acoplamiento a `lib/modules/`.

**B. Escribir el pineo a mano con `sticky` y offsets propios, sin `@tanstack/react-table`.**
Tentador porque evita una dependencia. Descartada: el cálculo de `left` acumulado con columnas de
ancho variable, más el estado de orden, más mantener los tres modos manuales coherentes, es
exactamente el «reimplementar a mano lo que una librería mantenida ya hace» que
`docs/architecture.md > Dependencias de terceros` prohíbe. La librería pasa los cuatro checks y su
superficie usada es pequeña (dos features).

**C. `rsuite` para el rango de fechas.** Trae los atajos hechos en su prop `ranges` y **pasa los
cuatro checks**. Descartada en la decisión 6: arrastra **14 dependencias** —entre ellas `lodash`,
`react-window` y `rsuite-table`— y un sistema de diseño completo con su CSS y su tema, que habría
que cablear a mano contra QC-29. Escribir tres atajos son ~15 líneas; cablear un tema ajeno no.

**D. MUI Data Grid y AG Grid.** Descartadas en la decisión 12 por una razón dura, no de gusto: el
**pineo de columnas está tras licencia de pago** en las dos, y es justo la capacidad que esta ficha
necesita.

**E. Persistir el pineo en una cookie en vez de `localStorage`.** Tendría la ventaja de que el
servidor podría pintar la tabla ya fijada, sin parpadeo. Descartada: la cookie **viaja en cada
petición** —incluidas las de datos y las de recursos— para guardar una preferencia visual, y la
decisión 8 ya cerró `localStorage` con su límite escrito en la pregunta abierta 2.

**F. Guardar el pineo por usuario en base de datos.** Resolvería la pregunta abierta 2 (por
navegador, no por usuario). Descartada por alcance: esta ficha no toca base de datos ni
`lib/modules/` (R34), y sería una feature de backend propia. Si la limitación acaba molestando, esa
ficha se crea entonces.

## 11. Excepción declarada a «sin sobre-ingeniería»

`docs/architecture.md > Componentes > Regla: sin sobre-ingeniería` pide **dos** features que
necesiten el componente con la misma API antes de promoverlo a `shared/`. Esta ficha lo promueve
**sin ningún consumidor**, y es una **excepción declarada, aprobada por el humano el 2026-09-04**
(decisión 10), no un desvío:

- los dos consumidores **existen y están implementados** —inventario y recetas—, y su migración es
  **QC-56**, ya en el board con `depends_on: [QC-55, QC-52, QC-57]`;
- hay cuatro pantallas más pendientes que lo volverían a copiar (QC-44, QC-39, QC-45, QC-35);
- lo único que falta es que estén escritas.

El riesgo real de promover sin consumidor es **acertar mal la API**. Se mitiga de una forma
concreta: el contrato de §3 se deriva de lo que las dos implementaciones existentes ya hacen
—columnas como datos, tres estados separados, dos tamaños de página, parámetros canónicos—, no de
lo que se imagina que hará falta. **El reviewer debe leer esta sección antes de marcarlo como
sobre-ingeniería.**

## 12. Verificación (R36)

Unitaria de componente con Vitest + Testing Library (heredados, R35). **Sin E2E**: ninguna pantalla
usa el componente, así que un E2E tendría que montar una pantalla de prueba que nadie usa; lo trae
QC-56 (decisión 11).

Ejes de prueba:

1. **Puro, sin DOM** — `data-table-params.ts`: forma canónica, transición al cambiar cada
   parámetro, vuelta a la primera página al cambiar tamaño (R6, R7, R8, R16).
2. **Render y estados** — los cuatro casos de la tabla de §7, mutuamente excluyentes (R19–R22).
3. **Interacción** — cabecera ordenable emite y la no ordenable no (R12, R14); paginación en los
   extremos (R10); las cuatro formas de filtro y los tres atajos de fecha (R15–R18); teclado y
   `min-h-11` en el menú de columna (R27).
4. **Neutralidad** — la tabla pinta **exactamente** las filas recibidas aunque los parámetros digan
   otra cosa (R13); no hay import de `lib/modules/`, `lib/composition` ni `next/navigation` en el
   cierre del componente (R2, R30).
5. **Persistencia** — guarda, restaura, ignora corrupto, aísla por `tableId`, sobrevive a un
   `localStorage` que lanza (R25, R26).
6. **Viewport** — los casos sensibles se ejecutan en 375 y en 1280 con `tests/helpers/viewport.ts`
   (R29), más el scroll contenido (R28).

Los asserts van sobre **roles ARIA, `data-testid` y constantes exportadas**, nunca sobre literales
de copy (decisión 20) — y en este componente el copy llega por props, así que afirmarlo sería
afirmar sobre el propio test.

El mapa `R<n> -> test` lo escribe el implementer en `progress/impl_QC-55-*.md`
(`CHECKPOINTS.md > Trazabilidad`).

## 13. Preguntas abiertas que afectan al diseño

Las cuatro que `requirements.md > Preguntas abiertas > Añadidas por spec_author en F1.2` deja sin
cerrar tienen aquí su salida conservadora, y **cada una está aislada en un punto**:

| Pregunta | Salida tomada en este diseño | Dónde cambiaría |
| --- | --- | --- |
| 3 · ¿vuelta a la primera página al ordenar/filtrar/buscar? | Solo al cambiar tamaño (R8); lo demás se emite tal cual | `data-table-params.ts` |
| 4 · columna de acciones y acción del vacío | `cell` devuelve `ReactNode`; `emptyAction` es una prop | §3.2, §3.3 |
| 5 · ¿multi-orden? | Una sola columna: `DataTableSort \| null` | §3.1 |
| 6 · borde y tope del pineo | Ambos bordes (`left`/`right`), sin tope declarado | §5 |
