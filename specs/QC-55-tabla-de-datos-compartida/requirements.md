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

> **Glosario mínimo.** **Componente de tabla**: el compuesto que esta ficha construye en
> `components/shared/`, con su cabecera ordenable, su barra de filtros, su barra de paginación y
> sus tres estados. **Pantalla consumidora**: cualquier pantalla que lo use; en esta ficha **no
> existe ninguna** (la primera la trae QC-56). **Fila**: un elemento de los datos que la pantalla
> entrega; el componente no conoce su tipo. **Configuración de columnas**: la declaración que la
> pantalla pasa por props diciendo qué columnas hay, cómo se lee cada celda y qué puede hacerse
> con cada una. **Parámetros de lista**: el conjunto formado por página, tamaño de página, orden,
> filtros activos y búsqueda por texto. **Devolución de llamada de cambio**: la función por la que
> el componente emite los parámetros de lista nuevos (decisión 3). **Constantes de paginación
> compartidas**: `DEFAULT_PAGE_SIZE` y `MAX_PAGE_SIZE` de `lib/shared/pagination`.
>
> Esta ficha **no declara ninguna regla de negocio** y **no re-especifica ningún backend**: el
> orden, los filtros y la búsqueda se emiten, y que alguien los honre es QC-57.

### Ubicación, contrato y frontera de datos

**R1** — El sistema DEBE publicar el componente de tabla bajo `components/shared/`, expuesto por un
barrel `index.ts`, y NO DEBE colocarlo dentro de la carpeta `components/` de ninguna ruta de
`app/`. Ningún consumidor DEBE poder importarlo por ruta profunda saltándose ese barrel.

**R2** — El componente NO DEBE obtener por sí mismo los datos que presenta: DEBE recibir las filas
y la configuración de columnas por props. NO DEBE invocar ninguna Server Action, NO DEBE hacer
`fetch`, NO DEBE importar `lib/composition` ni el cliente de base de datos, y NO DEBE importar
ningún módulo de `lib/modules/`.

**R3** — La configuración de columnas DEBE ser **datos declarativos**, no marcado incrustado en el
componente: cada columna DEBE declarar al menos su clave, su etiqueta, su alineación y cómo se
obtiene el contenido de su celda a partir de una fila. Añadir, quitar o reordenar una columna DEBE
consistir en cambiar esa declaración, y el componente NO DEBE conocer ninguna columna concreta.

**R4** — El componente DEBE poder presentar filas de **cualquier** tipo sin declarar ni importar
ningún tipo de dominio, de modo que dos pantallas con entidades distintas lo usen con la misma
API.

**R5** — El componente NO DEBE guardar el estado de lista —página, tamaño de página, orden,
filtros ni búsqueda—: DEBE recibirlo por props y presentar exactamente lo recibido. La **única**
preferencia que el componente persiste por su cuenta es qué columnas están fijadas (R24).

**R6** — CUANDO el usuario cambie de página, cambie el tamaño de página, ordene por una columna,
aplique o limpie un filtro, o modifique la búsqueda, el sistema DEBE invocar **una sola** vez la
devolución de llamada de cambio con el conjunto **completo** de parámetros de lista resultante, y
NO DEBE consultar ningún origen de datos ni navegar por su cuenta.

**R7** — El conjunto de parámetros de lista que se emite DEBE tener **una sola** forma declarada y
exportada, idéntica para todos los cambios de R6, de modo que un consumidor pueda tipar y traducir
esa forma en un único sitio.

**R8** — CUANDO el usuario cambie el tamaño de página, los parámetros emitidos DEBEN llevar la
página a la primera, de modo que no se emita una página que con el tamaño nuevo puede no existir.

**R9** — El contrato del componente NO DEBE exigir que la configuración de columnas ni las
devoluciones de llamada crucen la frontera servidor→cliente como props serializadas: DEBE poder
consumirse desde un componente de cliente que declare sus columnas y sus manejadores, mientras la
pantalla mantiene en el servidor la obtención de los datos.

### Paginación

**R10** — El componente DEBE presentar una barra de paginación que permita avanzar y retroceder de
página e indique la página actual y el total de páginas. MIENTRAS se esté en la primera página, la
acción de retroceder DEBE estar deshabilitada; MIENTRAS se esté en la última, la de avanzar DEBE
estar deshabilitada.

**R11** — El selector de tamaño de página DEBE ofrecer exactamente **dos** opciones, derivadas de
las constantes de paginación compartidas, y DEBE usar el valor por defecto de esas constantes
cuando no se indique ninguno. Ningún archivo de esta feature DEBE incrustar `10` ni `25` como
literal de tamaño de página.

### Orden

**R12** — CUANDO el usuario active la cabecera de una columna declarada ordenable, el sistema DEBE
emitir (R6) el orden nuevo —columna y dirección—, y DEBE reflejar el orden vigente en esa cabecera
de forma perceptible y anunciada a la tecnología de asistencia, sin depender únicamente del color.

**R13** — El componente NO DEBE reordenar, filtrar, recortar ni paginar las filas recibidas:
DEBE presentar **exactamente** las filas que recibe y en el orden en que las recibe, aunque los
parámetros de orden, filtro o página digan otra cosa.

**R14** — MIENTRAS una columna no se declare ordenable, su cabecera NO DEBE ofrecer la acción de
ordenar ni emitir ningún cambio de orden.

### Filtros y búsqueda

**R15** — La barra de filtros DEBE soportar exactamente **cuatro** formas de filtro —texto, rango
numérico, selección de un conjunto de valores y rango de fechas— y la forma de cada columna DEBE
declararla la pantalla en la configuración de columnas. MIENTRAS una columna no declare filtro, NO
DEBE aparecer en la barra de filtros.

**R16** — CUANDO el usuario aplique o limpie un filtro, el sistema DEBE emitir (R6) el conjunto de
filtros activos con la forma declarada para cada columna, y limpiar un filtro DEBE dejarlo fuera
del conjunto emitido en lugar de emitirlo vacío.

**R17** — El componente DEBE ofrecer un control de **búsqueda por texto** sobre la lista y DEBE
emitirlo (R6) como parámetro, aunque hoy ningún origen de datos lo honre; NO DEBE filtrar en el
cliente las filas ya recibidas para simular el resultado (R13 sigue mandando).

**R18** — El filtro de rango de fechas DEBE permitir elegir inicio y fin en un calendario, y DEBE
ofrecer al menos **tres atajos** —última semana, último mes y último año—. CUANDO el usuario active
un atajo, el rango correspondiente DEBE quedar seleccionado y visible en el calendario y DEBE
emitirse como cualquier otro filtro (R16).

### Los tres estados

**R19** — MIENTRAS la pantalla no indique carga ni error y no haya ninguna fila, el sistema DEBE
presentar un **estado vacío** identificable en lugar de una tabla sin filas.

**R20** — MIENTRAS la pantalla indique que los datos se están obteniendo, el sistema DEBE presentar
un **indicador de carga** identificable en lugar de las filas.

**R21** — SI la pantalla indica un error, ENTONCES el sistema DEBE presentar un **estado de error**
identificable que diga que la operación falló, con el mensaje que la pantalla entregue, y NO DEBE
presentarlo como lista vacía. Los tres estados DEBEN ser mutuamente excluyentes y distinguibles
entre sí por rol ARIA o `data-testid`, sin depender de su texto.

**R22** — Los textos de los tres estados DEBEN recibirse por props; el componente NO DEBE incrustar
ningún texto propio de un dominio concreto (catálogo, receta, producto…).

### Columnas fijadas

**R23** — El **usuario** DEBE poder fijar y soltar cada columna desde la cabecera de esa misma
columna. La pantalla consumidora NO DEBE decidir qué columnas están fijadas.

**R24** — MIENTRAS una columna esté fijada y la tabla se desplace horizontalmente, esa columna DEBE
permanecer visible en el borde de la tabla, sin desplazarse con el resto.

**R25** — El componente DEBE recordar las columnas fijadas en `localStorage`, bajo una clave
derivada de un identificador de tabla que la pantalla entrega por props, y DEBE restaurarlas al
volver a montarse. SI no hay valor guardado, o el guardado no tiene la forma esperada, ENTONCES
DEBE presentar la tabla sin ninguna columna fijada y NO DEBE fallar. SI `localStorage` no está
disponible o lanza, ENTONCES fijar y soltar DEBE seguir funcionando durante la sesión actual sin
persistir y sin propagar el error.

**R26** — Lo fijado DEBE quedar aislado por identificador de tabla: dos tablas con identificadores
distintos NO DEBEN compartir ni sobrescribir la preferencia de la otra.

### Plataforma e interacción

**R27** — Los controles por columna —ordenar, fijar y filtrar— DEBEN ser alcanzables **por toque y
por teclado**: NO DEBEN depender de `:hover` como única vía para descubrirse ni para activarse,
DEBEN ser operables con el tabulador, sus objetivos táctiles DEBEN medir al menos 44×44 px y los
campos de texto o número de los filtros DEBEN tener un tamaño de fuente de al menos 16 px.

**R28** — MIENTRAS el ancho disponible no alcance para todas las columnas, el sistema DEBE resolver
el desbordamiento con **scroll horizontal contenido en la propia tabla**, sin provocar scroll
horizontal del documento; el fijado de R24 DEBE apoyarse en ese mismo contenedor. NO DEBE usarse
`100vh` como alto.

**R29** — El componente DEBE ser utilizable en viewport angosto y en viewport ancho, verificado en
ambos, y esta feature NO DEBE declarar ninguna excepción de escritorio.

### Permisos y neutralidad

**R30** — El componente NO DEBE leer la sesión ni tomar ninguna decisión de autorización: lo que
dependa de permisos DEBE entrar por props desde la pantalla, y la autorización sobre los datos la
sigue aportando el caso de uso.

### Dependencias y primitivas

**R31** — Las **únicas** dependencias directas nuevas que esta feature DEBE incorporar son la
librería de tabla (`@tanstack/react-table` 9.x) y la del calendario (`react-day-picker`), cada una
con **su fila** en `docs/dependencias.md` con los cuatro checks y la aprobación humana citada en el
`design.md`. Las dependencias **transitivas** que arrastren NO DEBEN llevar fila propia, y el
sistema NO DEBE incorporar ninguna otra entrada directa nueva en el manifiesto.

**R32** — El componente DEBE activar de la librería de tabla **solo** las capacidades que esta
ficha usa —fijado de columnas, ordenación y los modos en los que la librería no toca los datos
(R13)—, declaradas como constante exportada, y NO DEBE activar el conjunto completo de capacidades
de la librería.

**R33** — Las primitivas de interfaz DEBEN provenir de la librería de componentes por su CLI; el
sistema NO DEBE escribir a mano ni editar ningún archivo de `components/ui/`, NO DEBE re-crear la
primitiva de tabla ya instalada y DEBE añadir por CLI la primitiva de calendario.

### Alcance, base heredada y verificación

**R34** — Esta feature NO DEBE modificar las pantallas de productos ni de recetas, NO DEBE tocar
`lib/modules/`, `db/` ni ninguna Server Action, y NO DEBE dejar ninguna pantalla consumiendo el
componente: migrar es QC-56 y hacer real el orden y el filtro es QC-57.

**R35** — El sistema NO DEBE re-crear ni duplicar la base heredada —la inicialización de la
librería de componentes, el entorno de tests unitarios de componente, la primitiva
`components/ui/table.tsx` y el helper de viewport—: los hereda y los usa.

**R36** — Cada requisito DEBE quedar cubierto por **tests unitarios de componente**, ejecutados
contra viewport angosto y ancho con el helper heredado. Esta feature NO DEBE añadir ninguna
verificación de extremo a extremo —diferida a QC-56 con motivo—, y sus asserts DEBEN hacerse sobre
roles ARIA, `data-testid` y constantes exportadas, **nunca** sobre literales de copy.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | El componente **recibe** los datos; el fetch se queda en la pantalla | R2, R4, R5, R9 |
| 2 | Engloba barra de filtros **y** barra de paginación | R10, R11, R15 |
| 3 | Los cambios se comunican por `onChange` con los parámetros nuevos | R5, R6, R7 |
| 4 | Ordenar y filtrar se implementan de verdad y se emiten; ninguna pantalla los usa aquí | R12, R13, R16, R34 |
| 5 | Las cuatro formas de filtro, más la búsqueda por texto que se emite igual | R15, R17 |
| 6 | Rango de fechas con `react-day-picker` por el CLI, atajos escritos aquí; `rsuite` descartada | R18, R31, R33 |
| 7 | Vacío, cargando y error; el error es su propio estado y no se pinta como vacío | R19, R20, R21, R22 |
| 8 | Fija el **usuario** desde la cabecera; se recuerda en `localStorage` por pantalla | R23, R24, R25, R26 |
| 9 | El menú por columna, alcanzable por toque y por teclado, con 44×44 px | R27 |
| 10 | Promover a `shared/` sin consumidor: **excepción declarada** a sin sobre-ingeniería | R1, R34 |
| 11 | **No** hay E2E: se difiere con motivo y la verificación es unitaria de componente | R36 |
| 12 | `@tanstack/react-table` 9.x, con los cuatro checks pasados; **v9 es modular** | R13, R31, R32 |
| 13 | Los cuatro checks de `react-day-picker` | R31 |
| 14 | Las dos filas de `docs/dependencias.md`; las transitivas no llevan fila | R31 |
| 15 | Tamaño de página 10 y 25, desde `lib/shared/pagination` | R11 |
| 16 | Primitivas de UI por el CLI de shadcn; `table.tsx` ya está, `calendar` se añade | R33, R35 |
| 17 | Desbordamiento horizontal contenido en la tabla, nunca en el `body` | R28 |
| 18 | Multiplataforma sin excepción, angosto y ancho con el helper de viewport | R27, R29, R36 |
| 19 | El componente no decide permisos y no lee la sesión | R30 |
| 20 | Asserts sobre roles ARIA, `data-testid` y constantes; nunca sobre copy | R21, R36 |
| 21 | Base heredada: no se re-crea | R35 |

Requisitos que no salen de una fila de la tabla, y de dónde salen: **R3** del propio Alcance
(«pinta filas a partir de la configuración de columnas que recibe por props») y del patrón ya
implementado dos veces en el repo, donde las columnas son datos y no JSX; **R8** de la conducta
heredada de QC-22, escrita y razonada en `product-list-toolbar.tsx`; **R14** del Alcance («ordena
pulsando la cabecera», que presupone columnas que no lo son); **R35** también del encabezado de
`tasks.md`.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea la feature.

1. **Si QC-57 acaba exponiendo una forma de parámetros distinta a la que este componente emite,
   habrá que ajustar uno de los dos.** QC-57 nace después y se acota por separado; su descripción
   ya deja escrito que la forma tiene que casar con la de aquí. **Riesgo aceptado explícitamente
   por el humano el 2026-09-04.**
2. **`localStorage` es por navegador, no por usuario.** Quien fije columnas en el escritorio no
   las verá fijadas al entrar desde el móvil, y dos personas que comparten un navegador comparten
   lo fijado. Se aceptó a conciencia (fila 8); no se evaluó si acabará molestando.

### Añadidas por `spec_author` en F1.2

Cuatro huecos que las decisiones cerradas no cubren. **Ninguno reabre nada**: son casos que no se
preguntaron, y ninguno bloquea la feature. Se dejan escritos en vez de rellenarse con supuestos
(regla 6 de `CLAUDE.md`). Si el humano no los cierra en F1.4, el `design.md` toma la salida
conservadora que se indica en cada uno y lo deja anotado allí.

3. **¿La página vuelve a la primera al ordenar, filtrar o buscar?** **R8 solo lo fija para el
   cambio de tamaño de página**, que es la única conducta con precedente escrito y verificado en
   el repo (QC-22, `product-list-toolbar.tsx`). Ordenar o filtrar cambia el conjunto de resultados
   igual de radicalmente, así que seguir en la página 7 puede caer en vacío; pero el componente
   **no sabe cuántas páginas habrá** —no consulta nada (decisión 3)— y decidirlo por él es
   inventarse una regla que la pantalla podría no querer. Salida conservadora si nadie responde:
   emitirlo tal cual y que lo decida el consumidor.
4. **¿Cómo se declara una columna de acciones de fila, y puede el estado vacío ofrecer una
   acción?** El patrón que esta ficha viene a cubrir tiene las dos cosas: `product-table.tsx`
   pinta editar y borrar en una última columna, y `product-list-empty` / `recipe-list-empty`
   ofrecen «crear el primero». La decisión 7 dice que los textos de los tres estados van por
   props, pero **un botón no es un texto**, y la configuración de columnas de hoy devuelve
   **cadena** (`value: (row) => string`), que no puede representar dos botones. Si el componente
   no admite contenido no textual, QC-56 no puede migrar ninguna de las dos pantallas.
5. **¿Se puede ordenar por más de una columna a la vez?** Las decisiones dicen «ordena pulsando la
   cabecera» y nada más. El multi-orden cambia la forma del parámetro emitido (un par vs. una
   lista) y por tanto el contrato que QC-57 tiene que casar (pregunta abierta 1). Salida
   conservadora: **una sola columna** a la vez, con la forma preparada para no romperse si algún
   día son varias.
6. **El fijado, ¿a qué borde, y con qué tope?** La decisión 8 dice quién fija y dónde se recuerda,
   pero no si una columna se fija a la izquierda, a la derecha o a cualquiera de los dos, ni si
   hay un máximo. Fijar seis de siete columnas en un móvil deja la tabla sin zona desplazable, que
   es justo el escenario que R28 y R29 vigilan.

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
| 2026-09-04 | Permisos | **El componente no decide ninguno y no lee la sesión.** Lo que necesite entra por props. **Heredado de QC-11 y QC-22**, y exigido por `docs/checkpoints-proyecto.md > Permisos`. La autorización sobre los datos la aporta el caso de uso, y esta ficha no la toca |
| 2026-09-04 | Asserts de los tests | Sobre roles ARIA, `data-testid` y constantes exportadas; **nunca** sobre literales de copy. **Heredado de QC-22** |
| 2026-09-04 | Base heredada | **shadcn/ui, Vitest + Testing Library y `components/ui/table.tsx` ya están montados y no se re-crean.** El choque entre las features 4 y 10 ya ocurrió una vez en este repo; la **T0** de `specs/11-*/tasks.md` existe para que no se repita |
| 2026-09-04 | T13: la comprobación del `sticky` anidado en Safari de iOS, ¿bloquea esta ficha? | **NO. Se TRASLADA a QC-56**, decisión del humano el 2026-09-04 tras el rechazo y la aprobación del `reviewer`. **No es un descuido ni una task olvidada**: aquí no hay nada que abrir. La decisión 11 dejó fuera montar cualquier pantalla, así que no existe URL con el componente, y fabricar una pantalla de prueba es exactamente lo que esa decisión rechazó. QC-56 monta el componente en productos y recetas: **ahí sí hay móvil real y URL real**, y allí la comprobación es exigible. Lo que NO cambia es la decisión 17: el `sticky` dentro de un scroll anidado sigue siendo el punto caliente de este código y `docs/architecture.md > Regla: multiplataforma` sigue exigiendo comprobarlo en iOS **antes de darlo por bueno en una pantalla**. Si al probarlo en QC-56 falla, lo que se revisa es este componente |
| 2026-09-04 | ¿Se ratifica haber editado a mano `calendar.tsx` y `popover.tsx`? | **SÍ, ratificado por el humano el 2026-09-04.** El CLI de shadcn emite hoy `import { cn } from "cn"` e instala `cn@0.2.5` y `date-fns@4.4.0` como entradas **directas**; `cn` **falla el check 3** (3.225 descargas semanales). El cambio es el especificador y nada más: pasa a `@/lib/utils`, que es el alias que declara `components.json` y **cómo importan los otros 16 archivos de `components/ui/`** —verificado por el `reviewer`—. Entre la decisión «ninguna primitiva se edita a mano» y la **regla 7 de `CLAUDE.md`**, gana la regla 7: es no negociable y tiene guardia ejecutable, y la otra es una convención de estilo. **La reserva del `reviewer` queda anotada y aceptada**: que el cambio sea «una sola línea por archivo» **no es verificable**, porque los dos archivos entraron ya normalizados y git no guarda la salida cruda del CLI. **NO se aprueba `cn`**, ni como excepción |
