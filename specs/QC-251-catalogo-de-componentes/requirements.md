# QC-251 — Catálogo de componentes compartidos — requirements

> Ficha del board: QC-251, zona `frontend`, complejidad `medium`, `sdd: true`.
> Abre el rediseño (`progress/rediseno.md > Orden de trabajo`, paso 1). QC-256 (piezas compartidas
> del rediseño) y QC-257 (shell) dependen de ella y registrarán sus piezas en este catálogo.
> El archivo NO viene sembrado por `/afinar-feature`: el alcance y las decisiones de abajo los
> propuso este spec. **El humano lo aprobó con cambios el 2026-10-10** (`## Decisiones cerradas`):
> se añaden la regla dura de reutilización, el pase de diseño obligatorio por componente nuevo, la
> columna `Diseño` y la fuente de diseño versionada en `docs/diseno/` (R23–R36).

## Alcance

Entra:

1. **Índice** `components/shared/CATALOGO.md`: una fila por pieza con `Para qué`, `Alcance` (qué
   cubre y qué no), `Puntos de extensión` y `Base de` (de qué piezas se compone).
2. **Regla de decisión** en `docs/perfil-agentes.md`, en este orden: reutilizar → extender con una
   prop opcional sin romper los usos actuales → componer una pieza nueva con las existentes → crear
   en la carpeta de la ruta. Una pieza sube a `components/shared` cuando la necesita una segunda ruta.
3. **Deberes de los agentes:** `spec_author` cita el catálogo en «Lo que ya existe»;
   `frontend_dev` lo lee antes de crear un componente y mantiene su fila; `reviewer` rechaza un
   duplicado sin justificar.
4. **Guardia:** todo componente exportado por `components/shared` tiene fila y toda fila apunta a
   algo que existe.
5. **Regla dura de reutilización y pase de diseño** (humano, 2026-10-10): antes de crear un
   componente SIEMPRE se reutiliza lo que existe; todo componente nuevo, y todo cambio visual de uno
   existente, pasa por la guía de marca y por su pase `/design` aprobado antes del spec que lo
   implementa. Deberes de agentes, columna `Diseño`, guardia y casilla que lo sostienen.
6. **Fuente de diseño versionada** en `docs/diseno/`: `README.md`, `guia-de-marca.html`,
   `sistema.css` y `canvas/` (copias de `_trabajo/`), y `progress/rediseno.md` apuntando ahí.

Fuera de alcance:

- Refactorizar los duplicados que existen hoy (`/asignacion` y demás): es **QC-252**.
- Crear piezas nuevas del rediseño (PriorityMark, StatusBadge, Notice, PageShell, UrlTabs,
  PasswordField…): son **QC-256** y **QC-257**. Este spec solo garantiza que el formato las admite.
- Arreglar los imports por ruta profunda que hoy existen hacia `components/shared/step-reader/`
  (`StepDocumentView` desde `formulas`, `clampStepPosition` desde `asignacion`): es **QC-268**.
  Mientras tanto el catálogo trata `StepDocumentView` como público de hecho (caso (c)).
- Hacer los pases `/design` de piezas futuras, o copiar a `docs/diseno/` el resto de `_trabajo/`
  (brief, capturas, SVG/PNG de marca).
- `components/private/` (ver `design.md > 10`, alternativa D).

## Glosario

- **Sección.** Cada una de las tres tablas del catálogo: *Primitivos* (`components/ui/`),
  *Compuestos* (`components/shared/`) y *Apoyos* (`lib/shared/ui/` y `hooks/`).
- **Fila.** Una fila de la tabla de una sección. Su celda `Pieza` lleva uno o más nombres entre
  backticks; su celda `Archivo`, exactamente una ruta entre backticks.
- **Componente.** Un export **de valor** (no de tipo) cuyo nombre empieza por mayúscula y contiene
  al menos una minúscula (`DataTable` sí; `PDF_CONTENT_TYPE`, `actionsColumn` y `useBatchStatus`
  no), declarado en un `.tsx` o reexportado por un `index.ts`.
- **Módulo con barrel.** Una subcarpeta de `components/shared/` que contiene `index.ts`.
- **Componente público de `components/shared`.** Un componente que cumple una de tres:
  (a) lo exporta un `.tsx` que cuelga directamente de `components/shared/`;
  (b) lo reexporta el `index.ts` de un módulo con barrel;
  (c) lo exporta un archivo de un módulo con barrel y algún archivo de `app/`, `components/` o
  `hooks/` **de fuera de ese módulo** lo importa por ruta profunda.
- **Archivo de entrada de `components/shared`.** Cada archivo `.ts`/`.tsx` que cuelga directamente
  de `components/shared/` (sin contar `CATALOGO.md`) y cada `index.ts` de un módulo con barrel.
- **Archivo catalogable de Primitivos/Apoyos.** Cada `.tsx` de `components/ui/`; cada `.ts`/`.tsx`
  de `lib/shared/ui/` y de `hooks/`. Se excluyen tests (`*.test.*`, `*.spec.*`) y `*.d.ts`.
- **Tablero de diseño.** Una pantalla del canvas de Claude Design con la pieza o la pantalla, sus
  estados, sus animaciones y el componente o librería que usa, en escritorio, tablet y teléfono.
  Su copia versionada vive en `docs/diseno/canvas/<Nombre>.dc.html`.
- **Referencia de diseño.** La ruta entre backticks de un tablero versionado que existe
  (`docs/diseno/canvas/<Nombre>.dc.html`), opcionalmente con el nombre del tablero en el canvas.
- **Pieza previa al rediseño.** Un `Archivo` que ya estaba catalogado al cerrar QC-251. Su lista
  es cerrada y vive en la guardia.
- **Cambio visual.** Un cambio de un componente que altera lo que se ve o cómo se mueve (tallas,
  colores, tipografía, espaciado, estados, animaciones), a diferencia de un cambio solo de lógica
  o de props sin efecto visual.

## Decisiones cerradas (no reabrir)

Del humano, al aprobar el spec con cambios (2026-10-10):

| # | Decisión | Requisitos |
|---|---|---|
| H1 | La subida a `components/shared` es con la **segunda ruta**; `docs/architecture.md` se alinea (cierra la antigua pregunta 1 y confirma D4). | R16, R20 |
| H2 | Los imports profundos hacia `step-reader` van en ficha aparte, **QC-268** (cierra la antigua pregunta 2). | — (fuera de alcance) |
| H3 | **Regla dura:** antes de crear cualquier componente SIEMPRE se reutiliza lo que existe; solo se crea uno nuevo si no existe, en el orden reutilizar → extender → componer → crear. No es una recomendación. | R16, R23 |
| H4 | Todo componente **nuevo** y todo **cambio visual** de uno existente pasa por la guía de marca y lleva su pase `/design` (tablero en el canvas con animaciones, componente o librería y estados en escritorio, tablet y teléfono), aprobado por el humano **antes** del spec de implementación. El spec de esa ficha cita el tablero; sin esa referencia no se implementa. | R24, R25, R26, R27 |
| H5 | Mecanismos: deberes de `spec_author`, `frontend_dev` y `reviewer`; columna `Diseño` en el catálogo (tablero o «previo al rediseño»); guardia que exige `Diseño` en cada fila nueva de Compuestos; casilla en `docs/checkpoints-proyecto.md`. | R25–R32 |
| H6 | La fuente de diseño se **versiona** en `docs/diseno/` (README, guía de marca, sistema visual, canvas) para que la regla sea verificable por el equipo, y `progress/rediseno.md` apunta ahí. | R33, R34, R35, R36 |

Del leader, al cerrar las preguntas abiertas (2026-10-10):

| # | Decisión | Requisitos |
|---|---|---|
| H7 | QC-257 (shell) solo modifica piezas privadas existentes (`app-sidebar`, controles de la cabecera) y no crea piezas compartidas: **sin cuarta sección**; `components/private` sigue fuera del catálogo. | R1 |
| H8 | `support.js` **no se versiona**: la copia de `docs/diseno/canvas/` es fuente legible y la vista viva es el canvas. El `README.md` lo dice. | R33 |
| H9 | El pase `/design` lo hace **cualquier persona del equipo** desde Claude Code pidiendo a Claude un diseño (Claude Design: un tablero nuevo en el canvas del proyecto o en uno propio compartido con el humano). El humano lo aprueba y el tablero aprobado se copia a `docs/diseno/canvas/` en la rama de la ficha. El `README.md` lo escribe como flujo paso a paso. | R24, R33 |
| H10 | `Diseño` se exige **también a Primitivos** (confirma D7): R29 se mantiene. | R29 |

## Decisiones del spec (aprobadas con el spec)

| # | Decisión | Requisitos |
|---|---|---|
| D1 | El catálogo cubre tres secciones: Primitivos (`components/ui`), Compuestos (`components/shared`) y Apoyos (`lib/shared/ui`, `hooks`). `components/private` queda fuera. Justificación y alternativas en `design.md > 10`. | R1, R6, R7 |
| D2 | Compuestos se vigila **por símbolo** (cada componente público) y por archivo de entrada; Primitivos y Apoyos, **por archivo** (una fila por archivo). | R5, R6, R7 |
| D3 | Las filas van **ordenadas por `Archivo`** dentro de cada sección, y `components/shared/CATALOGO.md` se declara archivo de apéndice compartido: dos fichas que registran piezas a la vez reciben AVISO, no CHOCA. | R4, R22 |
| D4 | La subida a `components/shared` se dispara con la **segunda ruta**; `docs/architecture.md` (que hoy dice «dos features») se alinea a esa redacción. Se admite subir antes con excepción declarada en el `design.md` y consumidores identificados (como hizo QC-55). | R16, R20 |
| D5 | El catálogo no cita fichas ni requisitos: la historia vive en `specs/` y en git, igual que en los comentarios de producción. | R11 |
| D6 | La celda `Alcance` lleva siempre «Cubre:» y «No cubre:», para que la mitad «qué no cubre» no se pierda. | R3 |
| D7 | La columna `Diseño` va en las **tres** secciones (formato único). La guardia exige referencia de diseño a toda fila nueva de **Compuestos y Primitivos** (un primitivo también es visual: el rediseño cambia `Button` y `Badge`); en Apoyos y en módulos `.ts` sin componentes vale «sin UI». | R28, R29 |
| D8 | «Fila nueva» se define mecánicamente: lo que no está en la lista cerrada de piezas previas al rediseño (instantánea al cerrar QC-251). Esa lista solo puede encoger. | R29, R31 |
| D9 | La referencia de diseño de una fila es una ruta versionada `docs/diseno/canvas/*.dc.html`, no solo el enlace al canvas privado: la guardia y cualquier persona del equipo pueden comprobarla. | R28, R30 |
| D10 | `docs/diseno/sistema.css` y `docs/diseno/canvas/qc.css` son el mismo archivo: los tableros cargan `./qc.css` y no se tocan; la guardia exige que sean idénticos. | R34 |

## Requisitos (EARS)

### El catálogo

- **R1.** El sistema DEBE tener el archivo `components/shared/CATALOGO.md` con exactamente tres
  secciones de nivel `##`, en este orden: `## Primitivos — components/ui`,
  `## Compuestos — components/shared` y `## Apoyos — lib/shared/ui y hooks`, cada una con una
  única tabla.
- **R2.** La tabla de cada sección DEBE tener exactamente estas columnas, en este orden:
  `Pieza | Archivo | Para qué | Alcance | Puntos de extensión | Base de | Diseño`
  (la columna `Diseño` se añadió al aprobar, H5; su contenido lo fija R28).
- **R3.** Cada fila DEBE cumplir: `Pieza` con al menos un nombre entre backticks; `Archivo` con
  exactamente una ruta entre backticks, relativa a la raíz del repo; `Para qué` no vacía;
  `Alcance` con el texto `Cubre:` y el texto `No cubre:`; `Puntos de extensión` y `Base de` no
  vacías (`—` cuando no hay ninguno).
- **R4.** Dentro de cada sección, las filas DEBEN ir ordenadas por `Archivo` en orden
  lexicográfico ascendente (filas del mismo `Archivo`, contiguas).

### La guardia: correspondencia catálogo ↔ código

- **R5.** SI un componente público de `components/shared` no aparece en la celda `Pieza` de
  exactamente una fila de Compuestos cuyo `Archivo` sea el archivo que lo exporta (o el `index.ts`
  que lo reexporta, en el caso (b)), ENTONCES la guardia DEBE fallar.
- **R6.** SI un archivo de entrada de `components/shared` no es el `Archivo` de al menos una fila
  de Compuestos, ENTONCES la guardia DEBE fallar.
- **R7.** SI un archivo catalogable de Primitivos o de Apoyos no es el `Archivo` de exactamente una
  fila de su sección, ENTONCES la guardia DEBE fallar.
- **R8.** SI una fila tiene un `Archivo` que no existe, o nombra en `Pieza` un nombre que ese
  archivo no exporta como valor, ENTONCES la guardia DEBE fallar.
- **R9.** SI la celda `Base de` de una fila nombra entre backticks algo que no aparece en la celda
  `Pieza` de ninguna fila del catálogo, ENTONCES la guardia DEBE fallar.
- **R10.** SI un `index.ts` de un módulo con barrel de `components/shared` contiene un
  `export * from`, ENTONCES la guardia DEBE fallar (su superficie no se puede enumerar).
- **R11.** SI el catálogo contiene una cita de ficha (`QC-<n>`) o de requisito (`R<n>`), ENTONCES
  la guardia DEBE fallar.
- **R12.** CUANDO la guardia falla, su mensaje DEBE nombrar, por cada hallazgo, la regla, el
  archivo y la pieza (o la fila) afectados y la acción que lo corrige («añade su fila» / «quita o
  corrige la fila»).
- **R13.** CUANDO se añade una pieza nueva —un `.tsx` suelto en `components/shared/`, un módulo con
  barrel nuevo, un primitivo en `components/ui/` o un apoyo en `lib/shared/ui/` o `hooks/`—, el
  sistema DEBE quedar en verde añadiendo **solo** su fila en la sección que le toca, sin cambiar
  secciones, columnas ni la guardia.
- **R14.** La guardia DEBE demostrar cada regla de R3–R11 con una muestra sintética que la viola y
  otra que la cumple, y DEBE comprobar que su recorrido ve el repositorio real (encuentra
  `components/shared/data-table/index.ts`, `components/ui/button.tsx` y más de 30 componentes
  públicos).
- **R15.** El catálogo DEBE registrar todas las piezas que existen en la rama al cerrar la feature
  (sincronizada con `dev`), de modo que la guardia pase sobre el repositorio real sin exclusiones.

### Regla de decisión y deberes

- **R16.** `docs/perfil-agentes.md` DEBE contener la regla de decisión para componentes con los
  cuatro pasos en este orden —(1) reutilizar la pieza existente, (2) extenderla con una prop
  opcional sin romper los usos actuales, (3) componer una pieza nueva con las existentes,
  (4) crearla en la carpeta de la ruta— y la regla de subida: una pieza sube a
  `components/shared` cuando la necesita una segunda ruta, salvo excepción declarada en el
  `design.md` de la feature con sus consumidores identificados.
- **R17.** DONDE una feature toca UI, `docs/perfil-agentes.md > spec_author` DEBE exigir que
  `design.md > ## Lo que ya existe` cite las filas de `components/shared/CATALOGO.md` consultadas
  y, por cada componente nuevo, el paso de la regla de decisión que lo justifica.
- **R18.** `docs/perfil-agentes.md > frontend_dev` DEBE exigir leer `components/shared/CATALOGO.md`
  antes de crear un componente y, CUANDO crea, sube a `shared`, extiende (punto de extensión nuevo)
  o borra una pieza catalogada, actualizar su fila en el mismo commit.
- **R19.** `docs/perfil-agentes.md > reviewer` DEBE incluir como BLOQUEANTE un componente nuevo del
  diff que cubre lo mismo que una fila del catálogo sin que el `design.md` diga qué paso de la regla
  de decisión aplicó y por qué los anteriores no bastaban.
- **R20.** `docs/architecture.md > Componentes > Regla: sin sobre-ingenieria` DEBE decir que la
  subida a `shared/` ocurre cuando la necesita una segunda ruta y remitir a la regla de decisión
  de `docs/perfil-agentes.md` y a `components/shared/CATALOGO.md`, sin contradecirlas.
- **R21.** `docs/checkpoints-proyecto.md > Calidad de codigo` DEBE tener una casilla: «Toda pieza
  nueva, subida, extendida o borrada en `components/ui`, `components/shared`, `lib/shared/ui` o
  `hooks` tiene su fila al día en `components/shared/CATALOGO.md`».
- **R22.** `arnes.config.json > equipo.archivos_compartidos` DEBE contener
  `components/shared/CATALOGO.md` junto a `tests/baseline-rojos.json` y `progress/deudas.md`
  (la lista sustituye a la de por defecto: perder estas dos sería una regresión).

### Regla dura de reutilización y pase de diseño (H3, H4)

- **R23.** `docs/perfil-agentes.md > Regla de decisión para componentes` DEBE redactar la regla como
  **obligatoria** —«antes de crear cualquier componente SIEMPRE se reutiliza lo que existe; solo se
  crea uno nuevo si no existe»—, con su fecha (2026-10-10) y su origen (decisión del humano), y
  DEBE aplicar a todos los agentes que escriben specs o UI, no solo a `frontend_dev`.
- **R24.** `docs/perfil-agentes.md` DEBE contener la regla del pase de diseño: todo componente
  nuevo y todo cambio visual de uno existente pasa por la guía de marca
  (`docs/diseno/guia-de-marca.html`) y lleva un pase `/design` con un tablero que muestra sus
  animaciones, el componente o librería que usa y sus estados en escritorio, tablet y teléfono,
  aprobado por el humano ANTES del spec que lo implementa; sin referencia de diseño en ese spec no
  se implementa. `docs/architecture.md > Componentes` DEBE remitir a esa regla.
- **R25.** `docs/perfil-agentes.md > spec_author` DEBE exigir que, CUANDO el spec propone un
  componente nuevo o un cambio visual, `design.md` cite su referencia de diseño aprobada; y SI no la
  hay, ENTONCES el `spec_author` DEBE parar y devolver `BLOQUEADO: falta el pase /design de <pieza>`
  en vez de escribir el spec.
- **R26.** `docs/perfil-agentes.md > frontend_dev` DEBE prohibir crear un componente que no tenga
  fila en el catálogo y referencia de diseño en el `design.md` de su feature.
- **R27.** `docs/perfil-agentes.md > reviewer` DEBE incluir como BLOQUEANTE un componente nuevo (o un
  cambio visual) del diff sin justificación de por qué no se reutilizó lo existente, o sin
  referencia de diseño en el `design.md` de la feature.

### La columna `Diseño` y su guardia (H5)

- **R28.** La celda `Diseño` de cada fila DEBE contener exactamente uno de: el texto
  `previo al rediseño`; una o más referencias de diseño (`docs/diseno/canvas/<Nombre>.dc.html` entre
  backticks); o, solo en Apoyos y en filas de Compuestos cuyo `Archivo` es un `.ts` que no es
  `index.ts`, el texto `sin UI`.
- **R29.** SI una fila de Compuestos o de Primitivos lleva `previo al rediseño` y su `Archivo` no
  está en la lista cerrada de piezas previas al rediseño, ENTONCES la guardia DEBE fallar pidiendo
  su referencia de diseño.
- **R30.** SI la celda `Diseño` cita una ruta `docs/diseno/canvas/...` que no existe, o lleva un
  valor fuera de R28, ENTONCES la guardia DEBE fallar.
- **R31.** La lista cerrada de piezas previas al rediseño DEBE vivir en la guardia con la fecha de su
  instantánea; SI una de sus entradas apunta a un archivo que ya no existe, ENTONCES la guardia DEBE
  fallar pidiendo quitarla (la lista solo encoge).
- **R32.** `docs/checkpoints-proyecto.md > Calidad de codigo` DEBE tener una casilla: «Todo componente
  nuevo o con cambio visual tiene su pase `/design` aprobado, citado en el `design.md` de la feature
  y en la celda `Diseño` de su fila del catálogo».

### Fuente de diseño versionada (H6)

- **R33.** El repo DEBE tener `docs/diseno/` con: `README.md`, `guia-de-marca.html` (copia de
  `_trabajo/marca/guia-de-marca.html`), `sistema.css` (copia de `_trabajo/rediseno/canvas/qc.css`) y
  `canvas/` (copia de todo `_trabajo/rediseno/canvas/`). El `README.md` DEBE explicar qué es la guía
  de marca y el sistema visual, enlazar el canvas `https://claude.ai/artifact/Voiri77bod5p5EuzCUkPaq`
  diciendo que es privado y que el acceso se pide al humano, decir que `support.js` no se versiona
  (la copia es fuente legible; la vista viva es el canvas) y describir paso a paso el flujo
  `/design` de H9 (cualquier persona pide el diseño a Claude desde Claude Code → tablero en el
  canvas del proyecto o en uno propio compartido con el humano → aprobación del humano → copia a
  `docs/diseno/canvas/` en la rama de la ficha → spec que lo cita → fila del catálogo).
- **R34.** `docs/diseno/sistema.css` DEBE ser idéntico, byte a byte, a `docs/diseno/canvas/qc.css`.
- **R35.** `progress/rediseno.md` DEBE apuntar a `docs/diseno/` (canvas, sistema y guía) como fuente
  del diseño, en vez de a `_trabajo/rediseno/canvas/`.
- **R36.** CUANDO `docs/diseno/` está en el árbol, todas las guardias del repo DEBEN seguir en verde
  sin excepciones nuevas (`design.md > 12` recoge cuáles lo leen).

## Preguntas abiertas

Ninguna. Las cuatro que quedaban las cerró el leader el 2026-10-10 (H7–H10).
