# QC-251 — Catálogo de componentes compartidos — design

## Lo que ya existe

Buscado (2026-10-10) con los términos `catálogo de componentes`, `CATALOGO.md`, `índice de piezas`,
`regla de decisión`, `promover/subir a shared`:

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board (`feature_list.json`) | **QC-252** «Componentización de /asignacion» depende de esta y refactoriza los duplicados. **QC-231/QC-232** (piezas base) ya sacaron a `components/shared` y `lib/shared/ui` las piezas duplicadas de estados, talla táctil y marca vacía. Ninguna ficha crea un índice ni una guardia de catálogo. | QC-252 queda fuera de alcance (lo dice la ficha). Las piezas de QC-231 son filas del catálogo, no se re-crean. |
| `specs/` | Nadie define un índice de piezas. QC-21, QC-55, QC-64, QC-88, QC-107 y QC-140 citan `docs/architecture.md > Regla: sin sobre-ingenieria` («dos features con la misma API»); QC-55 la exceptuó declarándolo en su spec. | La regla de subida se alinea (D4) y conserva la vía de excepción declarada que usó QC-55. |
| Código | `tests/guards/guard-piezas-base.test.ts` vigila que **no vuelvan las copias** de QC-231 (talla, marca, estados); no relaciona piezas con un índice. `tests/guards/guard-catalogo-de-errores.test.ts` es el patrón de guardia «catálogo ↔ código» (funciones puras exportadas + muestras que violan). | No hay catálogo ni guardia equivalente: **no bloquea**. Se reutiliza el patrón de ambas guardias (TypeScript como analizador, funciones puras, muestras sintéticas). |

Grafo: el worktree de QC-251 **no está indexado** (`list_projects` no lo lista); se consultó el
proyecto de la raíz (`dev`), del que la rama acaba de salir, y Grep/Read sobre el worktree.

## 1. Resumen

Un archivo Markdown versionado, `components/shared/CATALOGO.md`, con tres tablas (Primitivos,
Compuestos, Apoyos) y una guardia, `tests/guards/guard-catalogo-de-componentes.test.ts`, que cruza
esas tablas con el código en las dos direcciones. Más cambios de texto en cuatro docs del perfil y
una línea en `arnes.config.json`. **No hay código de producción ejecutable nuevo.**

## 2. Modelo de datos, rutas e integraciones

- **Tablas, RLS, migraciones:** no aplica. La feature no toca `db/`.
- **Rutas Next / endpoints / Server Actions:** no aplica.
- **Integraciones externas:** ninguna.
- **El contrato** de esta feature es el **formato de `CATALOGO.md`** (§3): es lo que QC-252, QC-256 y
  QC-257 escriben y lo que la guardia lee.

## 3. Formato de `components/shared/CATALOGO.md` (R1–R4, R11, R13)

```markdown
# Catálogo de componentes

<párrafo corto: qué es, la regla de decisión en una línea y el enlace a
docs/perfil-agentes.md > Regla de decisión para componentes; cómo se añade una fila>

## Primitivos — components/ui

| Pieza | Archivo | Para qué | Alcance | Puntos de extensión | Base de |
|---|---|---|---|---|---|
| `Button` | `components/ui/button.tsx` | Botón de acción con las variantes del sistema. | Cubre: variantes y tallas, `asChild`. No cubre: estado pendiente de formulario (ver `SubmitButton`). | `variant`, `size`, `touch` (44 px); `buttonVariants` para dar forma de botón a un enlace. | — |

## Compuestos — components/shared

| Pieza | Archivo | Para qué | Alcance | Puntos de extensión | Base de |
|---|---|---|---|---|---|
| `DataTable` | `components/shared/data-table/index.ts` | … | Cubre: … No cubre: … | … | `Table`, `DropdownMenu`, … |
| `EmptyState` | `components/shared/empty-state.tsx` | Vacío de una lista con enlaces de salida. | Cubre: mensaje, «limpiar búsqueda», «primera página» y acciones hijas. No cubre: carga ni error (ver `TableSkeleton`, `ErrorState`). | `clearSearch`, `firstPage`, `children`, `className`. | `Button` |

## Apoyos — lib/shared/ui y hooks

| Pieza | Archivo | Para qué | Alcance | Puntos de extensión | Base de |
|---|---|---|---|---|---|
| `touchTarget` | `lib/shared/ui/touch-target.ts` | La talla táctil mínima (44×44 px) como clases. | Cubre: … No cubre: … | — | — |
```

(Las filas de arriba son de **ejemplo de formato**; el texto definitivo de cada una lo escribe el
implementer leyendo el código de la pieza: props opcionales reales, qué pinta y qué no. Nada se
rellena de memoria.)

Reglas del formato:

1. **Tres secciones fijas**, en ese orden y con esos títulos exactos (la guardia los busca).
   No se añaden secciones por feature: una pieza nueva es **una fila** (R13).
2. **`Pieza`**: uno o varios nombres entre backticks, separados por comas. Varios nombres en una fila
   = una pieza con partes (`ConfirmDialog`, `ConfirmDialogFrame`, `ConfirmDialogBody`). En Primitivos
   y Apoyos basta con nombrar las exportaciones principales del archivo (los `DialogHeader`,
   `SidebarMenuButton`… de una familia shadcn no hace falta listarlos uno a uno).
3. **`Archivo`**: la ruta desde la raíz. Para un módulo con barrel, su `index.ts`. Para un
   componente público por import profundo (caso (c)), el archivo que lo declara.
4. **`Alcance`**: siempre «Cubre: …» y «No cubre: …». La mitad negativa es la que evita que alguien
   estire una pieza hasta donde no debe, o que la re-cree creyendo que no llega.
5. **`Puntos de extensión`**: props opcionales, `children`/slots, variantes, helpers exportados que
   acompañan (`actionsColumn`, `buttonVariants`). `—` si no tiene.
6. **`Base de`**: las piezas del catálogo sobre las que se construye, entre backticks. `—` si
   ninguna. Lo que se cite debe ser `Pieza` de alguna fila (R9): así la columna no puede apuntar a
   algo que no existe. Las dependencias externas (Radix, Lucide) no van aquí.
7. **Orden**: por `Archivo`, ascendente, dentro de cada sección (R4). Una fila nueva se **inserta en
   su sitio**, no se añade al final: dos fichas que registran piezas distintas tocan líneas distintas
   y el merge no choca.
8. **Sin citas de fichas ni requisitos** (`QC-<n>`, `R<n>`): R11, mismo criterio que
   `docs/conventions.md > Comentarios`. `components/` es carpeta de producción.

### 3.1 Qué cubre cada sección (D1, D2)

| Sección | Qué archivos | Granularidad que vigila la guardia |
|---|---|---|
| Primitivos | cada `components/ui/*.tsx` (24 hoy) | **por archivo**: exactamente una fila por archivo |
| Compuestos | cada archivo de entrada de `components/shared` + cada componente público | **por archivo** (≥ 1 fila) **y por símbolo** (cada componente público en exactamente una fila) |
| Apoyos | cada `.ts`/`.tsx` de `lib/shared/ui/` (9 hoy) y de `hooks/` (3 hoy) | **por archivo**: exactamente una fila por archivo |

Por qué la diferencia: un archivo de shadcn es **una familia** (`dialog.tsx` exporta 12 partes de
un mismo Dialog; `sidebar.tsx`, más de 20) y listarlas una a una es ruido que nadie lee; las piezas
de `components/shared` son diseño nuestro, cada export es una decisión y es ahí donde aparecen los
duplicados que motivan la ficha.

Los `.ts` de `components/shared` que no son componentes (`compress-image.ts`, `file-types.ts`,
`credential-rule-labels.ts`) entran por la regla de archivo de entrada (R6): son pocos y también se
duplican (los constructores de `href` de QC-252 son ese tipo de cosa).

### 3.2 Inventario de partida (para dimensionar, no es el texto final)

Componentes públicos hoy (rama recién salida de `dev`), por caso del glosario:

- (a) `.tsx` sueltos: `AsyncAutocomplete`, `BrandLogo`, `ConfirmDialog`, `ConfirmDialogFrame`,
  `ConfirmDialogBody`, `CountdownTimer`, `CredentialField`, `CredentialRequirements`, `DateCell`,
  `DatePicker`, `DeleteConfirmDialog`, `DeleteConfirmDialogBody`, `EmptyState`, `EntityImage`,
  `ErrorAlert`, `ErrorState`, `FieldError`, `FileField`, `FormSheet`, `SaveButton`,
  `OrderDistributionLabel`, `PresentationSelect`, `PresentationUnitSelect`, `ResponsibleAvatars`,
  `RowActionsMenu`, `SelectField`, `SharedSelect`, `SharedSelectControl`, `Spinner`,
  `SubmitButton`, `TableSkeleton`, `TextField`, `ThemeProvider`, `UnexpectedErrorNotice`,
  `ApproximateMark`, `NotConvertibleNotice`.
- (b) barrels: `DataTable` (`data-table/`), `DocumentUpload`, `DocumentUploadDialog`,
  `DocumentUploadRow` (`document-upload/`), `StepReader` (`step-reader/`), `SupplierField`,
  `SupplierForm`, `SupplierSheet` (`supplier/`).
- (c) import profundo: `StepDocumentView` (`step-reader/step-document-view.tsx`, lo importa
  `produccion/formulas`). `clampStepPosition` también se importa en profundo pero no es componente.
- Internos que **no** necesitan fila: `DataTableHeaderMenu`, `DataTableFilters`,
  `DataTablePagination`, `DataTableError/Loading/Empty`, `DataTableColumnDivider`,
  `DataTableScrollNav`, `DataTableFilterDate`, `DataTableHeaderCell` (los excluye el barrel de
  `data-table` y nadie de fuera los importa). Se mencionan en el `Alcance` de `DataTable` si ayuda.

Unas 45 filas en total (≈ 24 + ≈ 28 + 12). Es trabajo de lectura, no de código.

## 4. La guardia: `tests/guards/guard-catalogo-de-componentes.test.ts` (R5–R15, R22)

Proyecto vitest `node` (es `.test.ts`). Entra sola en `pnpm exec vitest run guard` y en
`gate.siempre`. Misma forma que `guard-catalogo-de-errores.test.ts` y `guard-piezas-base.test.ts`:
**funciones puras exportadas** que reciben texto y devuelven hallazgos, y casos que las alimentan
con el repo real o con muestras.

### 4.1 Funciones

| Función | Entrada → salida |
|---|---|
| `leerCatalogo(md: string)` | → `{ secciones: Seccion[]; hallazgos: Hallazgo[] }`. Parsea las tres secciones, valida cabecera (R1, R2), celdas (R3), orden (R4) y citas (R11). |
| `exportsDeValor(archivo: string, fuente: string)` | → `{ nombre: string; desde?: string }[]`: exports de valor del archivo, con el compilador de TypeScript (`typescript`, ya en `devDependencies` y ya usado por `guard-piezas-base`). Excluye `export type`, `interface`, especificadores `type X`. Para `export { A } from './a'` devuelve `desde`. Marca `export *` (R10). |
| `esComponente(nombre: string)` | `/^[A-Z]/` y contiene `[a-z]`. |
| `importsProfundos(archivos: {ruta, fuente}[])` | → `Map<archivoDeShared, Set<nombre>>`: lo que `app/`, `components/` y `hooks/` importan por `@/components/shared/<modulo>/<archivo>` desde **fuera** de `<modulo>` (caso (c)). Con el compilador, no con regex. |
| `componentesPublicos(arbol)` | → `{ nombre, archivo }[]` según el glosario (a), (b), (c). |
| `cruzar(catalogo, arbol)` | → `Hallazgo[]` de las reglas R5–R9. |
| `informe(hallazgos)` | → texto: `regla · archivo · pieza/fila · acción` (R12). |

`Hallazgo = { regla: Regla; archivo: string; pieza?: string; fila?: number; accion: string }` con
`Regla = 'cabecera' | 'celda' | 'orden' | 'cita' | 'sin-fila' | 'archivo-sin-fila' | 'fila-huerfana' | 'pieza-no-exportada' | 'base-desconocida' | 'export-estrella' | 'fila-duplicada'`.

### 4.2 Casos

Contra el repo real (R15):

1. el recorrido ve el repo: `components/shared/data-table/index.ts`, `components/ui/button.tsx`
   existen y hay más de 30 componentes públicos (R14; si no, todo pasaría en verde sin mirar);
2. el catálogo tiene formato válido (R1–R4, R11);
3. cada componente público tiene exactamente una fila (R5);
4. cada archivo de entrada de shared tiene fila (R6); cada archivo de Primitivos/Apoyos, exactamente
   una (R7);
5. ninguna fila es huérfana ni nombra lo que su archivo no exporta (R8);
6. `Base de` solo cita piezas del catálogo (R9);
7. ningún barrel de shared usa `export *` (R10);
8. `arnes.config.json > equipo.archivos_compartidos` contiene `components/shared/CATALOGO.md`,
   `tests/baseline-rojos.json` y `progress/deudas.md` (R22).

Muestras sintéticas (R14): por cada regla, una entrada que la viola y la simétrica que no.
Además, R13 con un árbol sintético: añadir `components/shared/nueva-pieza.tsx`, un módulo
`components/shared/nuevo/index.ts`, `components/ui/nuevo.tsx` y `hooks/use-nuevo.ts` pone la guardia
roja con `sin-fila`/`archivo-sin-fila`, y añadir **solo** sus filas (en su sitio por orden) la pone
verde. Y R12: el texto del informe de una muestra contiene regla, archivo, pieza y acción.

**Sin lista de exclusiones.** Lo que no cumpla se arregla con una fila; no hay `EXCLUSIONES` como
en `guard-piezas-base`. Si en la sincronización con `dev` aparece una pieza nueva de otra ficha, se
le añade la fila (§9).

### 4.3 Docs (R16–R21)

Casos en un segundo `describe` del mismo archivo, que leen los docs y comprueban **marcas
estables**, no prosa:

- R16: `docs/perfil-agentes.md` tiene el encabezado `### Regla de decisión para componentes` y, en
  ese bloque, una lista numerada cuyos ítems 1–4 empiezan por **Reutiliza**, **Extiende**,
  **Compón**, **Crea**; el bloque menciona «segunda ruta» y «excepción».
- R17/R18/R19: las secciones `## spec_author`, `## frontend_dev` y `## reviewer` citan
  `components/shared/CATALOGO.md`; la de `reviewer` contiene «duplicado» y «BLOQUEANTE».
- R20: `docs/architecture.md > Regla: sin sobre-ingenieria` contiene «segunda ruta» y
  `CATALOGO.md`, y ya no contiene «DOS features».
- R21: `docs/checkpoints-proyecto.md` contiene la casilla con `components/shared/CATALOGO.md`.

Son comprobaciones de texto: aseguran que la regla **está escrita** donde el agente la lee, no que
se cumpla. El cumplimiento de R17–R19 lo hace el reviewer en cada feature.

## 5. Texto de los docs (propuesta para el implementer)

### 5.1 `docs/perfil-agentes.md`

En `## Todos los agentes`, nada. Nueva subsección en `## frontend_dev`, después de
`### Estructura de componentes`:

```markdown
### Regla de decisión para componentes

Antes de crear un componente, busca en `components/shared/CATALOGO.md` y aplica en este orden:

1. **Reutiliza** la pieza que ya existe.
2. **Extiéndela** con una prop opcional, sin romper los usos actuales (los consumidores no cambian
   y sus tests siguen verdes). Anota el punto de extensión en su fila.
3. **Compón** una pieza nueva con las existentes.
4. **Crea** la pieza en la carpeta `components/` de la ruta.

Una pieza **sube a `components/shared`** cuando la necesita una **segunda ruta**, y en ese commit
gana su fila. Subirla antes solo con excepción declarada en el `design.md`, con los consumidores
identificados.
```

En `## spec_author`, un punto: «Si la feature toca UI, `## Lo que ya existe` cita las filas de
`components/shared/CATALOGO.md` consultadas y, por cada componente nuevo, el paso de la regla de
decisión (`> frontend_dev > Regla de decisión para componentes`) que lo justifica.»

En `## frontend_dev > Reglas propias de este repo`, regla 12: «Lee `components/shared/CATALOGO.md`
antes de crear un componente. Si creas, subes, extiendes o borras una pieza de `components/ui`,
`components/shared`, `lib/shared/ui` o `hooks`, su fila se actualiza en el mismo commit; la guardia
`guard-catalogo-de-componentes` lo exige.»

En `## reviewer`, punto 10: «**Duplicados:** un componente nuevo del diff que cubre lo mismo que una
fila de `components/shared/CATALOGO.md`, sin que el `design.md` diga qué paso de la regla de
decisión aplicó y por qué los anteriores no bastaban, es BLOQUEANTE.»

### 5.2 `docs/architecture.md > Componentes > Regla: sin sobre-ingenieria`

Sustituir «Solo se promueve a `shared/` cuando al menos DOS features lo necesitan con la misma API»
por: «Sube a `shared/` cuando la necesita una **segunda ruta** con la misma API (orden completo:
`docs/perfil-agentes.md > frontend_dev > Regla de decisión para componentes`). Lo que hay en
`ui/`, `shared/`, `lib/shared/ui/` y `hooks/` está en `components/shared/CATALOGO.md`.»

### 5.3 `docs/checkpoints-proyecto.md > Calidad de codigo`

La casilla de R21.

### 5.4 `arnes.config.json`

```json
"equipo": {
  "archivos_compartidos": ["tests/baseline-rojos.json", "progress/deudas.md", "components/shared/CATALOGO.md"]
}
```

La lista **sustituye** a la de por defecto (`docs/equipo.md`), por eso lleva las dos de siempre.
Efecto: `scripts/archivos-en-vuelo.mjs` da AVISO, no CHOCA, cuando dos fichas listan el catálogo en
`## Archivos esperados` (QC-252, QC-256 y QC-257 lo harán). Lo que lo hace seguro es el orden de §3
regla 7 («añadiendo, sin reordenar», como pide `docs/equipo.md` para los archivos de apéndice).

## 6. Dependencias

Ninguna nueva. `typescript` ya está en `devDependencies` y la usa `guard-piezas-base`.

## 7. Multiplataforma

No toca UI ni estilos: no aplica `docs/architecture.md > Regla: multiplataforma`.

## 8. Comentarios

El archivo de la guardia sigue `docs/conventions.md > Comentarios`: `R<n>` solo en los nombres de
los casos; cabecera corta con el porqué (no la historia de la ficha).

## 9. Riesgos y features en vuelo

- **Fichas en vuelo que añadan piezas** (hoy `in_progress`/`spec_ready`: QC-96, QC-131, QC-224,
  QC-237). Si una mergea a `dev` **después** de QC-251 con un componente nuevo en
  `components/shared` o `components/ui`, su gate se pone rojo al sincronizar con `dev` hasta que
  añada la fila. Es el comportamiento buscado, pero el leader debe avisarlo al cerrar QC-251.
- **Al revés**: si una de ellas mergea **antes**, QC-251 añade su fila al sincronizar (F2.3) — por
  eso R15 habla de la rama sincronizada al cierre.
- **La guardia no juzga el texto.** Comprueba forma y correspondencia, no que `Para qué` sea cierto.
  Eso lo revisa el reviewer leyendo la fila contra la pieza.

## 10. Alternativas descartadas

**A. Catálogo solo de `components/shared` (sin `components/ui`).** Es lo que pide la ficha al pie de
la letra y es más corto. Descartada porque el paso 2 de la regla («extender con una prop opcional»)
se aplica sobre todo a los primitivos: el rediseño cambia las tallas de `Button` (D7, ya tiene
`touch`), los tonos de `Badge` (D3) y añade variantes; si `Button` no tiene fila, el agente no ve
`touch` ni `buttonVariants` y vuelve a escribir `min-h-11 min-w-11` (el literal que QC-231 tuvo que
perseguir por 10 archivos). Además la regla 1 de `frontend_dev` («nunca inventes si lo tiene
shadcn») necesita saber qué primitivos están **instalados**. El coste de incluirlos es ~24 filas por
archivo, no por símbolo (§3.1).

**B. Un archivo por pieza (`components/shared/catalogo/<pieza>.md`) e índice generado.** Eliminaría
el punto caliente de un único archivo que tocan varias fichas a la vez. Descartada: la ficha fija
`components/shared/CATALOGO.md` como **un** sitio que se lee de una vez; un índice generado es un
script más que mantener; y el choque se resuelve con el orden por `Archivo` y la marca de archivo
de apéndice (§5.4).

**C. Generar el catálogo desde el código (JSDoc de cada componente).** Se mantendría solo.
Descartada: `docs/conventions.md > Comentarios` pide comentarios cortos y solo de porqué, y
«Cubre / No cubre / Base de» son bloques largos de qué; además un generador no sabe escribir «No
cubre». La guardia bidireccional da la misma garantía (no hay pieza sin fila ni fila sin pieza) con
texto escrito a mano.

**D. Incluir `components/private/`.** Descartada: hoy son tres piezas del armazón privado
(`app-sidebar`, `nav-user`, `sidebar-active-indicator`) con un único consumidor, el layout privado;
la regla de subida no aplica. Si QC-257 (shell) necesita registrarlas, es una cuarta sección
(pregunta abierta 3).

**E. Analizar los exports con expresiones regulares.** Más simple. Descartada por lo mismo que en
`guard-piezas-base`: `export { A as B }`, `export type`, especificadores `type X` mezclados y
comentarios engañan a una regex; el compilador de TypeScript ya está y no cuesta dependencia.

**F. Storybook como catálogo vivo.** Descartada: dependencia nueva y pesada (regla 7), pide una
historia por pieza y no expresa «qué no cubre» ni «de qué se compone»; no es lo que pide la ficha.

## 11. Trazabilidad (prevista)

| R | Test |
|---|---|
| R1, R2, R3, R4, R11 | `guard-catalogo-de-componentes` › formato del catálogo real + muestras `cabecera`, `celda`, `orden`, `cita` |
| R5 | › componentes públicos con fila (real) + muestras (a), (b), (c) |
| R6, R7 | › archivos con fila (real) + muestras `archivo-sin-fila`, `fila-duplicada` |
| R8 | › filas huérfanas o con pieza no exportada (real) + muestras |
| R9 | › `Base de` (real) + muestra `base-desconocida` |
| R10 | › barrels sin `export *` (real) + muestra |
| R12 | › muestra: el informe nombra regla, archivo, pieza y acción |
| R13 | › muestra de árbol: pieza nueva roja sin fila, verde con solo su fila |
| R14 | › el recorrido ve el repo real |
| R15 | los casos «real» de R5–R10 en verde, sin exclusiones |
| R16–R21 | `guard-catalogo-de-componentes` › docs (§4.3) |
| R22 | › `arnes.config.json` lista el catálogo como archivo compartido |
