# QC-251 — Catálogo de componentes compartidos — requirements

> Ficha del board: QC-251, zona `frontend`, complejidad `medium`, `sdd: true`.
> Abre el rediseño (`progress/rediseno.md > Orden de trabajo`, paso 1). QC-256 (piezas compartidas
> del rediseño) y QC-257 (shell) dependen de ella y registrarán sus piezas en este catálogo.
> El archivo NO viene sembrado por `/afinar-feature`: el alcance y las decisiones de abajo los
> propone este spec y se aprueban con él.

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

Fuera de alcance:

- Refactorizar los duplicados que existen hoy (`/asignacion` y demás): es **QC-252**.
- Crear piezas nuevas del rediseño (PriorityMark, StatusBadge, Notice, PageShell, UrlTabs,
  PasswordField…): son **QC-256** y **QC-257**. Este spec solo garantiza que el formato las admite.
- Arreglar los imports por ruta profunda que hoy existen hacia `components/shared/step-reader/`
  (ver `## Preguntas abiertas`, 2).
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

## Decisiones del spec (se aprueban con el spec)

| # | Decisión | Requisitos |
|---|---|---|
| D1 | El catálogo cubre tres secciones: Primitivos (`components/ui`), Compuestos (`components/shared`) y Apoyos (`lib/shared/ui`, `hooks`). `components/private` queda fuera. Justificación y alternativas en `design.md > 10`. | R1, R6, R7 |
| D2 | Compuestos se vigila **por símbolo** (cada componente público) y por archivo de entrada; Primitivos y Apoyos, **por archivo** (una fila por archivo). | R5, R6, R7 |
| D3 | Las filas van **ordenadas por `Archivo`** dentro de cada sección, y `components/shared/CATALOGO.md` se declara archivo de apéndice compartido: dos fichas que registran piezas a la vez reciben AVISO, no CHOCA. | R4, R22 |
| D4 | La subida a `components/shared` se dispara con la **segunda ruta**; `docs/architecture.md` (que hoy dice «dos features») se alinea a esa redacción. Se admite subir antes con excepción declarada en el `design.md` y consumidores identificados (como hizo QC-55). | R16, R20 |
| D5 | El catálogo no cita fichas ni requisitos: la historia vive en `specs/` y en git, igual que en los comentarios de producción. | R11 |
| D6 | La celda `Alcance` lleva siempre «Cubre:» y «No cubre:», para que la mitad «qué no cubre» no se pierda. | R3 |

## Requisitos (EARS)

### El catálogo

- **R1.** El sistema DEBE tener el archivo `components/shared/CATALOGO.md` con exactamente tres
  secciones de nivel `##`, en este orden: `## Primitivos — components/ui`,
  `## Compuestos — components/shared` y `## Apoyos — lib/shared/ui y hooks`, cada una con una
  única tabla.
- **R2.** La tabla de cada sección DEBE tener exactamente estas columnas, en este orden:
  `Pieza | Archivo | Para qué | Alcance | Puntos de extensión | Base de`.
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

## Preguntas abiertas

1. **D4: «segunda ruta» frente a «dos features».** La ficha pide «segunda ruta» y
   `docs/architecture.md` dice hoy «al menos DOS features con la misma API». Como el doc del perfil
   manda sobre `perfil-agentes.md`, el spec propone alinear `architecture.md` (R20). Confirmarlo al
   aprobar; si el humano prefiere «dos features», cambian R16 y R20 y nada más.
2. **Imports profundos hacia `components/shared/step-reader/`.** Hoy
   `app/(private)/produccion/formulas/components/recipe-version-form.tsx` importa `StepDocumentView`
   y `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` importa
   `clampStepPosition` saltándose el barrel. El catálogo los trata como públicos de hecho (caso (c)
   del glosario) y `StepDocumentView` lleva fila. ¿Se abre ficha para reexportarlos por el barrel o
   se deja como deuda en `progress/deudas.md`? No bloquea este spec.
3. **QC-256 y QC-257 no están en `feature_list.json`** (el último importado es QC-255). El formato
   se ha diseñado genérico (R13) sin poder leer su alcance; si alguna de las dos pone piezas fuera
   de `components/ui`, `components/shared`, `lib/shared/ui` o `hooks` (p. ej. el shell en
   `components/private/` o en `app/(private)/components/`), esas piezas no entrarían en el catálogo.
   ¿Debe el shell registrarse? Si sí, se añade una cuarta sección, y eso es un cambio a este spec.
