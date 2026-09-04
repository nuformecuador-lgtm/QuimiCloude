# QC-55 — tabla-de-datos-compartida · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. Cada task indica sus
dependencias y su **criterio de hecho** (verificable, no «parece bien»). Un commit por task,
formato `docs/conventions.md > Commits`.

**Recordatorio de gate** (`docs/verification.md` + `AGENTS.md > Regla del gate`): el `frontend_dev`
corre **solo** `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run <sus
archivos>`. **No corre la suite completa.** `./init.sh --rapido` lo corre el **leader** al cerrar
cada tanda; `./init.sh` **completo**, al cerrar la feature y **antes del PR, sin excepción**.

**Precondición de fase 2:** la implementación **no arranca** hasta que el humano apruebe el spec
(F1.4), porque esta feature **instala dos dependencias nuevas** y eso es exactamente lo que la
regla 7 de `CLAUDE.md` no deja hacer por cuenta propia.

**Esta feature NO contiene** tasks de `shadcn init`, de montar Vitest + Testing Library ni de crear
`components/ui/table.tsx`: los hereda (R35, decisión 21).

---

## Bloque 0 — Precondiciones (BLOQUEA TODO)

### [x] T0 — Verificar la base heredada
- **Depende de**: nada. Es lo primero.
- **Qué**: comprobar, uno por uno, que existen en el worktree tras `git merge origin/dev`:
  1. `components.json` (shadcn inicializado) y `lib/utils.ts` exportando `cn`.
  2. `components/ui/table.tsx`, con su `div[data-slot=table-container]` y `overflow-x-auto`.
  3. `components/ui/skeleton.tsx`, `components/ui/dropdown-menu.tsx`, `components/ui/select.tsx`,
     `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/popover.tsx` — y anotar
     cuáles **faltan**, para añadirlas por CLI en T2 (R33).
  4. `vitest.config.mts` con `include: ['tests/**/*.test.{ts,tsx}']` y `pnpm test` arrancando en
     verde.
  5. `tests/helpers/viewport.ts` exportando `setViewportWidth`, `resetViewport`,
     `NARROW_VIEWPORT` y `WIDE_VIEWPORT`.
  6. `lib/shared/pagination.ts` exportando `DEFAULT_PAGE_SIZE` y `MAX_PAGE_SIZE`.
- **Hecho cuando**: los seis puntos están confirmados por escrito en `progress/impl_QC-55-*.md`,
  con la lista de primitivas que faltan. **Nada de esto se re-crea.** Si algo falta, se PARA y se
  avisa al leader antes de escribir una línea.

### [x] T1 — Instalar las dos dependencias aprobadas y escribir sus filas
- **Depende de**: T0 **y** la aprobación humana del spec (F1.4).
- **Qué**: `pnpm add @tanstack/react-table` y añadir las **dos** filas a `docs/dependencias.md`
  (`@tanstack/react-table` y `react-day-picker`), estado `aprobada`, con los cuatro checks del
  `design.md > 9` y la fecha y la aprobación citadas. `react-day-picker` la instala el CLI en T2;
  su fila se escribe aquí igualmente.
- **Criterio**: R31.
- **Hecho cuando**: `pnpm exec vitest related --run tests/guards/guard-dependencias-aprobadas.test.ts`
  pasa en verde, y `@tanstack/react-store`, `date-fns` y `@date-fns/tz` **no** tienen fila (son
  transitivas y no están en `dependencies` directas).

### [x] T2 — Añadir las primitivas de shadcn que falten, por CLI
- **Depende de**: T0.
- **Qué**: `pnpm dlx shadcn@latest add calendar` (trae `react-day-picker`) y las que T0 haya
  marcado como ausentes. **Ningún archivo de `components/ui/` se escribe ni se edita a mano.**
- **Criterio**: R33.
- **Hecho cuando**: `components/ui/calendar.tsx` existe, `react-day-picker` aparece en
  `package.json` cubierta por su fila de T1, y `git diff` sobre `components/ui/` muestra **solo**
  archivos generados por el CLI.

---

## Bloque 1 — El núcleo puro (sin DOM)

### [x] T3 — Tipos del contrato
- **Depende de**: T1.
- **Qué**: `components/shared/data-table/data-table-types.ts` con `DataTableColumn<TRow>`,
  `DataTableFilterSpec`, `DataTableFilterValue`, `DataTableSort`, `DataTableParams`,
  `DataTableTexts` y `DataTableProps<TRow>`, tal como los fija `design.md > 3`. Sin React salvo el
  tipo `ReactNode`, sin importar `lib/modules/` ni ningún tipo de dominio.
- **Criterio**: R3, R4, R7.
- **Hecho cuando**: `pnpm run typecheck` en verde y el archivo no contiene ningún import de
  `@/lib/modules`, `@/lib/composition` ni `next/*`.

### [x] T4 — Transiciones de parámetros (puro) + sus tests
- **Depende de**: T3.
- **Qué**: `data-table-params.ts` con la forma canónica y una función por transición (cambio de
  página, de tamaño, de orden, de un filtro, de la búsqueda), más `PAGE_SIZE_OPTIONS` derivado de
  `DEFAULT_PAGE_SIZE` y `MAX_PAGE_SIZE` y la constante del rebote del campo de texto. Cambiar el
  tamaño lleva a la primera página; limpiar un filtro lo **saca** del objeto.
- **Criterio**: R6, R7, R8, R11, R16.
- **Hecho cuando**: `tests/unit/**/data-table-params.test.ts` cubre las cinco transiciones, el
  regreso a la primera página y el filtro limpiado, **sin renderizar nada**, y falla si alguien
  escribe `10` o `25` como literal.

---

## Bloque 2 — Piezas de UI (paralelizables entre sí)

Todas dependen de T3 y T4.

### [x] T5 [P] — Los tres estados
- **Qué**: `data-table-states.tsx`: vacío, cargando (con `skeleton`) y error (`role="alert"`, con
  `errorMessage`), todos con textos por props y `data-testid` propio, mutuamente excluyentes según
  `design.md > 7`. Precedencia dictada por `status`, no por una cadena de booleanos.
- **Criterio**: R19, R20, R21, R22.
- **Hecho cuando**: hay un test por estado que afirma sobre `data-testid`/rol (**nunca sobre
  copy**) y **un test en negativo** que comprueba que `status: 'error'` NO renderiza el estado
  vacío.

### [x] T6 [P] — Barra de paginación y tamaño de página
- **Qué**: `data-table-pagination.tsx`: anterior/siguiente con `aria-label`, indicador de página
  con `role="status"`, selector de tamaño con las dos opciones de T4, todos con `min-h-11 min-w-11`.
  Emite por `onParamsChange`; **no navega**.
- **Criterio**: R6, R10, R11, R27.
- **Hecho cuando**: hay tests de los dos extremos (deshabilitado en la primera y en la última) y
  uno que comprueba que cambiar el tamaño emite `page: 1`. Ningún import de `next/navigation`.

### [x] T7 [P] — Menú de cabecera: ordenar y fijar
- **Qué**: `data-table-header-menu.tsx` sobre `dropdown-menu`: se abre con un botón **visible**
  (nada de `:hover`), operable con teclado, con las acciones ordenar asc/desc, fijar/soltar y abrir
  el filtro de esa columna. La cabecera refleja el orden vigente con `aria-sort` y un icono.
- **Criterio**: R12, R14, R23, R27.
- **Hecho cuando**: un test emite el orden al activar la cabecera con **teclado**; otro comprueba
  que una columna sin `sortable` no ofrece la acción ni emite nada; otro comprueba `aria-sort` y el
  tamaño mínimo del disparador.

### [x] T8 [P] — Barra de filtros: texto, rango numérico y selección
- **Qué**: `data-table-filters.tsx` con tres de las cuatro formas más el campo de búsqueda global
  (rebote de T4, `text-base` en los inputs). Solo aparecen las columnas que declaran `filter`.
- **Criterio**: R15, R16, R17, R27.
- **Hecho cuando**: hay un test por forma que afirma el `DataTableFilterValue` emitido, uno de
  «limpiar saca la clave del objeto», uno de que la búsqueda se emite en su propio campo y **uno en
  negativo**: una columna sin `filter` no aparece en la barra.

### [x] T9 [P] — Filtro de rango de fechas con atajos
- **Depende de**: T2 (necesita `components/ui/calendar.tsx`).
- **Qué**: `data-table-filter-date.tsx` con el calendario en `mode="range"`, controlado, y los tres
  atajos (última semana, último mes, último año) calculados con `date-fns`. Emite `from`/`to` como
  `YYYY-MM-DD`.
- **Criterio**: R18.
- **Hecho cuando**: hay un test por atajo que comprueba el rango emitido con una fecha del sistema
  fijada (temporizadores falsos), y uno de selección manual de rango. Ningún test depende del
  idioma del calendario.

---

## Bloque 3 — Composición

### [x] T10 — Persistencia del pineo
- **Depende de**: T3.
- **Qué**: `use-pinned-columns.ts`: lectura **en efecto tras el montaje** (nunca en render),
  clave `qc:data-table:<tableId>:pinning`, validación con zod, descarte de ids de columna
  inexistentes, y escritura/lectura envueltas para que un `localStorage` que lanza degrade a «sin
  recordar».
- **Criterio**: R25, R26.
- **Hecho cuando**: hay tests de guardar, restaurar, valor corrupto, columna que ya no existe,
  aislamiento entre dos `tableId` y `localStorage` que lanza en `setItem` y en `getItem`. Ninguno
  deja estado colgando entre tests.

### [x] T11 — El componente compuesto
- **Depende de**: T5, T6, T7, T8, T9, T10.
- **Qué**: `data-table.tsx` (`'use client'`): monta la instancia de `@tanstack/react-table` con
  `DATA_TABLE_FEATURES` = `[columnPinningFeature, rowSortingFeature]` (constante **exportada**) y
  `manualSorting/manualPagination/manualFiltering` en `true`; pinta cabecera, filas y las tres
  barras; aplica `sticky` a las columnas fijadas con `getStart()` dentro del contenedor con scroll
  de `components/ui/table.tsx`. Más `index.ts`, el barrel.
- **Criterio**: R1, R2, R5, R9, R13, R24, R28, R30, R32.
- **Hecho cuando**:
  - un test comprueba que las filas se pintan **exactamente** como llegan aunque `params.sort` diga
    otra cosa (R13);
  - un test afirma sobre `DATA_TABLE_FEATURES` que la lista es esa y no más (R32);
  - un test comprueba que fijar una columna le aplica `sticky` y un desplazamiento calculado (R24);
  - un test en negativo verifica que ningún archivo del directorio importa `@/lib/modules`,
    `@/lib/composition`, `lib/shared/db` ni `next/navigation` (R2, R30);
  - el barrel exporta el componente y sus tipos, y nada interno más (R1).

---

## Bloque 4 — Verificación transversal

### [x] T12 — Angosto y ancho
- **Depende de**: T11.
- **Qué**: repetir los casos sensibles —menú de cabecera, barra de filtros, paginación, calendario
  y columna fijada— en `NARROW_VIEWPORT` y `WIDE_VIEWPORT` con `tests/helpers/viewport.ts`.
- **Criterio**: R27, R28, R29.
- **Hecho cuando**: los casos pasan en los dos anchos, un test comprueba que el desbordamiento vive
  en el contenedor de la tabla y **no** en un ancestro con scroll del documento, y **ningún archivo
  de la feature contiene `100vh`**.

### T13 — Comprobación manual en iOS del `sticky` anidado
- **Depende de**: T11.
- **Qué**: abrir el componente en Safari de iOS (o WebKit real, no jsdom) con una tabla más ancha
  que la pantalla y una columna fijada, y verificar que la columna se queda quieta, que el scroll
  es de la tabla y **no del `body`**, y que el menú de cabecera se abre por toque.
- **Por qué es una task y no una nota**: es **el punto caliente declarado** de la ficha (decisión
  17) y jsdom no puede probarlo. `product-table.tsx` evitó `sticky` horizontal justo por esto.
- **Hecho cuando**: el resultado —dispositivo/navegador, versión y qué se vio— queda escrito en
  `progress/impl_QC-55-*.md`. SI falla, se PARA y se devuelve al leader: es una decisión cerrada la
  que está en juego, no un detalle de estilo.

### [x] T14 — Alcance: nada fuera de sitio
- **Depende de**: T11.
- **Qué**: revisar el diff completo.
- **Criterio**: R34, R35.
- **Hecho cuando**: el diff **no** toca `app/(private)/inventario/**`,
  `app/(private)/produccion/formulas/**`, `lib/modules/**`, `db/**` ni `e2e/**`; no añade ningún
  archivo a `components/ui/` que no venga del CLI; y no hay ninguna pantalla consumiendo el
  componente.

### T15 — Cierre
- **Depende de**: T12, T13, T14.
- **Qué**: escribir el mapa `R1..R36 -> test` en `progress/impl_QC-55-tabla-de-datos-compartida.md`
  y correr `./init.sh` **completo**.
- **Criterio**: `CHECKPOINTS.md > Trazabilidad`, regla 5 de `CLAUDE.md`.
- **Hecho cuando**: los **36** requisitos tienen al menos un test nombrado, `./init.sh` termina en
  verde y las cuatro preguntas abiertas añadidas en F1.2 siguen escritas —cerradas por el humano o
  con la salida conservadora del `design.md > 13` anotada.
