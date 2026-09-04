# QC-55 — tabla-de-datos-compartida · requirements.md

> Zona: `frontend` · Complejidad: `high` · `depends_on`: null · Rama: `feature/QC-55-tabla-de-datos-compartida`
>
> **Alcance.** Un componente de tabla en `components/shared/` que pinta filas a partir de la
> configuración de columnas que recibe por props, con barra de filtros, barra de paginación y los
> tres estados (vacío, cargando, error) con sus textos por props. Ordena pulsando la cabecera y
> deja que el usuario fije columnas para que no se desplacen al mover la tabla en horizontal. **No
> trae los datos y no consulta nada**: cuando el usuario pagina, ordena o filtra, devuelve los
> parámetros nuevos a quien lo use.
>
> **Lo que NO entra.** Migrar las pantallas de productos y recetas al componente: es **QC-56**.
> Hacer que el backend honre el orden, los filtros y la búsqueda por texto: es **QC-57**, creada
> al acotar esta ficha. Ninguna pantalla se estrena aquí, así que **no hay E2E** (fila 11).
>
> Sembrado por `/afinar-feature` el 2026-09-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea la feature.

1. **Si QC-57 acaba exponiendo una forma de parámetros distinta a la que este componente emite,
   habrá que ajustar uno de los dos.** QC-57 nace después y se acota por separado; su descripción
   ya deja escrito que la forma tiene que casar con la de aquí. **Riesgo aceptado explícitamente
   por el humano el 2026-09-04.**
2. **`localStorage` es por navegador, no por usuario.** Quien fije columnas en el escritorio no
   las verá fijadas al entrar desde el móvil, y dos personas que comparten un navegador comparten
   lo fijado. Se aceptó a conciencia (fila 8); no se evaluó si acabará molestando.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | ¿El componente trae los datos, o los recibe? | **Los recibe.** Filas y configuración de columnas por props; el fetch se queda en la pantalla. Decidido antes de crear la ficha, contra el patrón hoy vigente y verificado en el repo: Server Component `async` (`product-list-section.tsx`, `recipe-list-section.tsx`) con el estado de lista en la URL y el esqueleto por `<Suspense key>`. Un componente con fetch interno obliga a `'use client'` y tira ese patrón |
| 2026-09-04 | ¿La barra de filtros entra? | **SÍ.** El componente engloba barra de filtros **y** barra de paginación. Revierte el «no generes la barra aún» del planteamiento inicial, dicho por el humano el mismo día |
| 2026-09-04 | ¿Cómo se comunican los cambios de página, orden y filtro? | **Por `onChange`, con los parámetros nuevos.** El componente no consulta nada y no guarda el estado de lista: emite, y quien lo usa decide |
| 2026-09-04 | Ordenar y filtrar, si ningún backend los soporta hoy | **Se implementan de verdad y se emiten.** Verificado: `pageQuerySchema` solo admite `page` y `pageSize`, y ningún caso de uso de ningún módulo acepta orden ni filtro. Como **ninguna pantalla usa el componente en esta ficha**, nadie ve una cabecera muerta. Hacerlos reales sale a **QC-57**, creada el 2026-09-04 con link *blocks* hacia QC-56. Es exactamente la «ficha de backend nueva» a la que QC-22 remitió el 2026-09-03 y que QC-26 repitió |
| 2026-09-04 | Las cuatro formas de filtro | **Texto, rango numérico, selección de un conjunto de valores, y rango de fechas.** La pantalla declara cuál usa cada columna. **La búsqueda por texto se emite igual**, aunque no la honre nadie hoy: cierra la deuda que QC-22 y QC-26 dejaron anotada sin ficha, y entra en el alcance de QC-57 |
| 2026-09-04 | El rango de fechas: ¿qué librería? | **`react-day-picker`, por el CLI de shadcn** (`pnpm dlx shadcn@latest add calendar`), en `mode="range"`. Hereda el tema claro/oscuro de QC-29 sin cablear nada y respeta la decisión de QC-11 y QC-22 de que las primitivas entran por el CLI. **Los atajos (última semana, último mes, último año) NO vienen en la librería y se escriben aquí**: el calendario es controlado, así que un atajo es un botón que fija el rango; `date-fns` ya viaja con `react-day-picker`. **Se descartó `rsuite`**, que sí trae los atajos hechos en su prop `ranges` y **pasa los cuatro checks**, porque arrastra **14 dependencias** —entre ellas `lodash`, `react-window` y `rsuite-table`— y un sistema de diseño completo con su propio CSS y su propio tema, que habría que cablear a mano contra QC-29 |
| 2026-09-04 | Vacío, cargando y error | **Los tres los pinta el componente**, con los textos por props. **El error es su propio estado y dice que falló: NO se pinta como lista vacía.** El humano propuso primero tratarlo como vacío y lo revirtió al ver que contradice R14/R16 de QC-22 —«son tres situaciones distintas y cada una dice lo suyo»—, hoy implementadas en `product-list-empty` / `product-list-error`. Decirle a un Operador sin permiso que el catálogo está vacío es una respuesta falsa |
| 2026-09-04 | Fijar columnas: ¿quién decide? | **El usuario**, desde la cabecera de cada columna, no la pantalla. **La elección se recuerda en `localStorage`, por pantalla.** Su límite está en la pregunta abierta 2 |
| 2026-09-04 | El menú por columna y el táctil | **Alcanzable por toque y por teclado.** `docs/architecture.md > Regla: multiplataforma` prohíbe que `:hover` sea la única vía de descubrir o activar algo, y exige targets de 44×44 px |
| 2026-09-04 | Promover a `shared/` sin ningún consumidor | **Excepción declarada a `docs/architecture.md > Regla: sin sobre-ingeniería`**, que pide dos features que lo necesiten con la misma API. Los dos consumidores **existen y están identificados** —QC-56 migra productos y recetas—, más cuatro pantallas pendientes (QC-44, QC-39, QC-45, QC-35). Lo que falta es que estén escritas. Queda aquí para que el reviewer no lo lea como desvío |
| 2026-09-04 | ¿E2E? | **NO, y se difiere con motivo, no al final.** Ninguna pantalla usa el componente en esta ficha, así que no hay camino de usuario que recorrer: un E2E tendría que montar una pantalla de prueba que nadie usa. **Lo trae QC-56** al migrar. La verificación de aquí es unitaria de componente |
| 2026-09-04 | Librería de la tabla | **`@tanstack/react-table` 9.x.** Los cuatro checks **PASAN**, verificados el 2026-09-04 contra el registro de npm: sin `deprecated`; última release `9.2.4` del 2026-08-28; **20.010.461** descargas semanales; licencia **MIT**. Verificado **en el paquete publicado**, no de memoria: `columnPinningFeature` / `ColumnPinningState` / `getIsPinned` / `getStart` para fijar; `rowSortingFeature` / `onSortingChange` para ordenar; `manualSorting` / `manualPagination` / `manualFiltering` para el modo en que la tabla no toca los datos. **v9 es modular**: se activan solo las features que esta ficha usa, no el conjunto entero. `peerDependencies: react >=18`, y el repo va en 19.2.8. Arrastra una transitiva, `@tanstack/react-store`. Se descartaron MUI Data Grid y AG Grid: el pineo de columnas está tras licencia de pago en las dos |
| 2026-09-04 | Los checks de `react-day-picker` | **PASAN los cuatro**, verificados el 2026-09-04: sin `deprecated`; última release `10.0.1` del 2026-08-31; **44.673.977** descargas semanales; licencia **MIT**. Verificado en el paquete publicado que expone `mode: "range"`, `DateRange`, `numberOfMonths`, `footer` y `onSelect`, y que **no** existe ninguna prop de atajos |
| 2026-09-04 | Las dos filas de `docs/dependencias.md` | **Las escribe la implementación, con los checks ya hechos arriba.** Ninguna dependencia se instala sin la fila y sin la aprobación humana (regla 7 de `CLAUDE.md`); la aprobación consta aquí y se reafirma en F1.4. `@tanstack/react-store`, `date-fns` y `@date-fns/tz` son transitivas y **no llevan fila**: la guardia compara solo las entradas directas de `package.json` |
| 2026-09-04 | Tamaño de página | **10 y 25**, de `DEFAULT_PAGE_SIZE` y `MAX_PAGE_SIZE` en `lib/shared/pagination`. **Heredado de QC-22**; no se escriben a mano |
| 2026-09-04 | Primitivas de UI | **shadcn/ui por CLI.** Ninguna se escribe ni se edita a mano en `components/ui/`. **Heredado de QC-11 y QC-22.** `table.tsx` ya está; `calendar` se añade |
| 2026-09-04 | Desbordamiento horizontal | **Scroll contenido en la propia tabla, nunca en el `body`, y comprobado en iOS.** **Heredado de QC-22.** Es el punto caliente de esta ficha: el pineo se apoya en `sticky` dentro de un scroll anidado, justo lo que la regla multiplataforma manda verificar antes de darlo por bueno |
| 2026-09-04 | Multiplataforma | **Sin excepción de escritorio.** Se valida contra angosto y ancho con `tests/helpers/viewport.ts` de QC-11. **Heredado de QC-22** |
| 2026-09-04 | Permisos | **El componente no decide ninguno y no lee la sesión.** Lo que necesite entra por props. **Heredado de QC-11 y QC-22**, y exigido por `CHECKPOINTS.md > Permisos`. La autorización sobre los datos la aporta el caso de uso, y esta ficha no la toca |
| 2026-09-04 | Asserts de los tests | Sobre roles ARIA, `data-testid` y constantes exportadas; **nunca** sobre literales de copy. **Heredado de QC-22** |
| 2026-09-04 | Base heredada | **shadcn/ui, Vitest + Testing Library y `components/ui/table.tsx` ya están montados y no se re-crean.** El choque entre las features 4 y 10 ya ocurrió una vez en este repo; la **T0** de `specs/11-*/tasks.md` existe para que no se repita |
