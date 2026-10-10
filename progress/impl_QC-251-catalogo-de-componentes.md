# impl QC-251 — catálogo de componentes compartidos

## Tanda 0 (frontend_dev, 2026-10-10)

Archivos:
- creado `docs/diseno/guia-de-marca.html` (cp de `_trabajo/marca/guia-de-marca.html`)
- creado `docs/diseno/sistema.css` (cp de `_trabajo/rediseno/canvas/qc.css`)
- creado `docs/diseno/canvas/` (cp de todo `_trabajo/rediseno/canvas/`)
- creado `docs/diseno/README.md`
- modificado `progress/rediseno.md` (apunta a `docs/diseno/`; el brief sigue en `_trabajo/rediseno/brief/`)

Conteos (T0a):
- origen `_trabajo/rediseno/canvas/`: 89 archivos (87 `*.dc.html`, `canvas.json`, `qc.css`)
- destino `docs/diseno/canvas/`: 89 archivos; `diff -rq` sin diferencias; `cmp` de la guía sin diferencias
- sha256 `docs/diseno/sistema.css` = `docs/diseno/canvas/qc.css` =
  `b81c57161cf97a521218488ae8448d80ec21f1fb3bfc61a9cd32371b5742648f` (R34)

Fin de línea: `.gitattributes` tiene `* text=auto eol=lf`. `git hash-object` con y sin filtros
coincide en todos los archivos copiados salvo `docs/diseno/canvas/Tabla.dc.html`, que en origen
está en CRLF: git lo guardará en LF y el checkout ya no será byte a byte igual al origen. No afecta
a R34 (`qc.css` está en LF). No se ha tocado `.gitattributes`: decisión pendiente del leader/humano.

R → test: R33–R36 los cubre `tests/guards/guard-catalogo-de-componentes.test.ts` (Tanda 1, otro agente).

Verificación:
- `pnpm install --frozen-lockfile` (el worktree no tenía `node_modules`; lockfile sin cambios)
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`, ninguno en `docs/diseno/`
- `pnpm exec vitest run guard`: `Test Files 70 passed (70)`, `Tests 918 passed | 18 skipped (936)`
  (con `docs/diseno/` en el árbol; sin excepciones nuevas, R36)

Veredicto: Tanda 0 hecha; guardias en verde con `docs/diseno/` en el árbol.

## Tanda 1 (frontend_dev, 2026-10-10) — T1 y T2, la guardia primero en rojo

Archivos:
- creado `tests/guards/guard-catalogo-de-componentes.test.ts` (54 casos: 32 de muestras sintéticas,
  14 contra el repo real, 8 de docs)

Funciones exportadas (`design.md > 4.1`, `> 4.4`): `leerCatalogo`, `celdas`, `exportsDeValor`,
`esComponente`, `importsProfundos`, `archivosDeEntrada`, `componentesPublicos`, `cruzar`,
`cruzarDiseno` (R29–R31), `compararSistema` (R34), `informe`; constante
`PIEZAS_PREVIAS_AL_REDISENO` (vacía, con marcador: la rellena T6).

### Mapa R → test (Tanda 1)

| R | Caso |
|---|---|
| R1, R2 | muestras `R1 falta una sección…`, `R1 una sección extra o con dos tablas`, `R2 columnas…`; real `R1 R2 R3 R4 R11 R15 el catálogo existe…` |
| R3 | muestras `R3 Alcance sin «No cubre:»`, `R3 Pieza sin backticks…`, `R3 una fila completa con | dentro de backticks`; real ídem |
| R4 | muestra `R4 filas desordenadas…`; real ídem |
| R5 | muestras `R5 (a)…`, `R5 (b)…`, `R5 (c)…`, `R5 el mismo componente en dos filas`, `R5 R8 exportsDeValor…`, `R5 esComponente…`; real `R5 R15 cada componente público…` |
| R6, R7 | muestras `R6 un .ts de entrada sin fila`, `R7 un primitivo o un apoyo sin fila…`; real `R6 R7 R15…` |
| R8 | muestras `R8 una fila con un Archivo que no existe`, `R8 una fila que nombra lo que su archivo no exporta…`; real `R8 R15…` |
| R9 | muestra `R9 Base de cita algo…`; real `R9 R15…` |
| R10 | muestra `R10 un barrel con export *`; real `R10 R15…` |
| R11 | muestra `R11 una cita de ficha o de requisito…`; real (formato) |
| R12 | muestra `R12 el informe nombra regla, archivo, pieza y la acción` |
| R13 | muestras `R13 sin sus filas: rojo…`, `R13 añadiendo solo sus filas, en su sitio: verde` |
| R14 | muestra `R14 la muestra base cumple todas las reglas`; real `R14 el recorrido ve el repo…` |
| R15 | los casos reales R1–R10 (sin exclusiones) |
| R16–R21, R23–R27, R32 | describe `docs` (un caso por grupo, nombre con sus R) |
| R22 | real `R22 arnes.config.json…` |
| R28–R31 | muestras `R29 una fila nueva con «previo…»`, `R28 R29 la misma fila con su tablero`, `R30 una ruta de tablero que no existe`, `R28 R30 «sin UI» en un .tsx…`, `R28 «sin UI» en Apoyos…`, `R29 un primitivo nuevo…`, `R31 una pieza previa cuyo archivo ya no existe…`; reales `R28 R30…`, `R29…`, `R31…` |
| R33, R34 | muestra `R34 sistema.css distinto…`; reales `R33 R34 docs/diseno está completo…`, `R33 el README…` |
| R35 | real `R35 progress/rediseno.md apunta a docs/diseno/…` |

### Rojo esperado (salida real)

`pnpm exec vitest run guard-catalogo-de-componentes`:

```
 Test Files  1 failed (1)
      Tests  17 failed | 37 passed (54)
```

Verdes: las 32 muestras sintéticas; reales R14 (el recorrido ve el repo: 44 componentes
públicos), R10 (ningún barrel con `export *`), R33/R34, R33 README y R35 (la Tanda 0 ya está).

Rojos, todos esperados:
- catálogo (falta `components/shared/CATALOGO.md`): `R1 R2 R3 R4 R11 R15`, `R5 R15`, `R6 R7 R15`,
  `R8 R15`, `R9 R15`, `R28 R30`, `R29` (R8, R9, R28–R30 exigen catálogo con filas para no pasar
  en vacío);
- `R31`: `PIEZAS_PREVIAS_AL_REDISENO` vacía (la rellena T6);
- `R22`: `arnes.config.json` sin `equipo.archivos_compartidos` (T10);
- docs (T7–T9): `R16`, `R23`, `R24`, `R17 R25`, `R18 R26`, `R19 R27`, `R20`, `R21 R32`.

### Checklist para la Tanda 2 — piezas sin fila que reporta la guardia

**Primitivos** (24, una fila por archivo): `components/ui/` alert-dialog, autocomplete, avatar,
badge, button, calendar, card, checkbox, collapsible, dialog, dropdown-menu, input, label, popover,
select, separator, sheet, sidebar, skeleton, sonner, table, tabs, textarea, tooltip (`.tsx`).

**Compuestos** (37 archivos de entrada + 44 componentes públicos):
- `.tsx` sueltos y sus componentes: async-autocomplete (`AsyncAutocomplete`), brand-logo
  (`BrandLogo`), confirm-dialog (`ConfirmDialog`, `ConfirmDialogBody`, `ConfirmDialogFrame`),
  countdown-timer (`CountdownTimer`), credential-field (`CredentialField`), credential-requirements
  (`CredentialRequirements`), date-cell (`DateCell`), date-picker (`DatePicker`),
  delete-confirm-dialog (`DeleteConfirmDialog`, `DeleteConfirmDialogBody`), empty-state
  (`EmptyState`), entity-image (`EntityImage`), error-alert (`ErrorAlert`), error-state
  (`ErrorState`), field-error (`FieldError`), file-field (`FileField`), form-sheet (`FormSheet`,
  `SaveButton`), order-distribution-label (`OrderDistributionLabel`), presentation-select
  (`PresentationSelect`), presentation-unit-select (`PresentationUnitSelect`), responsible-avatars
  (`ResponsibleAvatars`), row-actions-menu (`RowActionsMenu`), select-field (`SelectField`),
  shared-select (`SharedSelect`, `SharedSelectControl`), spinner (`Spinner`), submit-button
  (`SubmitButton`), table-skeleton (`TableSkeleton`), text-field (`TextField`), theme-provider
  (`ThemeProvider`), unexpected-error-notice (`UnexpectedErrorNotice`), unit-conversion-marks
  (`ApproximateMark`, `NotConvertibleNotice`).
- `.ts` sueltos (solo archivo; `Diseño` puede ser `sin UI`): compress-image, credential-rule-labels,
  file-types.
- barrels (`index.ts`): data-table (`DataTable`), document-upload (`DocumentUpload`,
  `DocumentUploadDialog`, `DocumentUploadRow`), step-reader (`StepReader`), supplier
  (`SupplierField`, `SupplierForm`, `SupplierSheet`).
- caso (c), import profundo: `step-reader/step-document-view.tsx` (`StepDocumentView`).

**Apoyos** (11, una fila por archivo): `hooks/` use-async-paginated-options, use-entity-sheet,
use-mobile; `lib/shared/ui/` date-civil, decimal-display, empty-mark, initials, sidebar-state,
theme-init-script, theme-state, touch-target (`.ts`). (El design estimaba 9 en `lib/shared/ui/`; hay 8.)

### Casos de docs en rojo (para T7–T10)

`R16` (falta `### Regla de decisión para componentes (obligatoria)`), `R23` (debe colgar de
`## Todos los agentes`), `R24` (falta `### Pase de diseño para componentes nuevos (obligatorio)` y
la remisión en `docs/architecture.md > ## Componentes`), `R17 R25` (`## spec_author`), `R18 R26`
(reglas 12 y 13 de `## frontend_dev`), `R19 R27` (puntos 10 y 11 de `## reviewer`), `R20`
(`### Regla: sin sobre-ingenieria`), `R21 R32` (casillas en `## Calidad de codigo`), `R22`
(`arnes.config.json`).

### Decisiones de interpretación (menores)

- Marcas de docs comparadas sin `**`, sin tildes y con espacios colapsados: el §4.3 pide «Extiende»
  y «antes del spec», y el texto propuesto en §5.1 dice «**Extiéndela**» y «**antes** del spec».
  Así valen las dos redacciones.
- R26: §4.3 pide `CATALOGO.md` en la misma regla, pero la regla 13 propuesta dice «fila en el
  catálogo»; se acepta cualquiera de las dos (`/cat[aá]logo/i`).
- R17, R18, R23, R24 comprueban además una marca del texto propuesto que el §4.3 no lista («Lo que
  ya existe», «mismo commit», «humano», «estados»), porque el requisito la exige.
- R35 comprueba también que `progress/rediseno.md` ya no cita `_trabajo/rediseno/canvas` («en vez
  de», R35). Hoy pasa.
- R8: una fila cuyo `Archivo` existe pero no es de su sección (p. ej. un `components/shared/…` en
  Primitivos) cuenta como `fila-huerfana`.
- R5: un componente reexportado por un barrel y además importado en profundo pediría dos filas
  (una por archivo). Hoy no se da.
- R10: `export * as ns from` también cuenta como `export *` (tampoco se puede enumerar).
- Las subcarpetas de `components/shared/` sin `index.ts` no se vigilan (el glosario solo define
  módulos con barrel). Hoy no hay ninguna.

### Verificación (salida real)

- `pnpm exec prisma generate` y `pnpm exec next typegen` (como `scripts/gate-proyecto.sh`; sin ellos
  el typecheck daba ~1000 errores fantasma de `@prisma/client` y `LayoutProps` en el worktree)
- `pnpm run typecheck`: exit 0, sin errores
- `pnpm run lint`: exit 0, `✖ 7 problems (0 errors, 7 warnings)` (los 7 de antes, ninguno en el
  archivo nuevo; `eslint` del archivo solo: «No issues found»)
- `pnpm exec vitest run guard-catalogo-de-componentes`: `Tests 17 failed | 37 passed (54)` (rojo
  esperado, arriba)
- Tests que censan `tests/` (que no se rompan por el archivo nuevo): `recipe-route-contract`,
  `guard-teclear-y-plazo`, `catalogo-sin-total-fijo`, `pedidos-convenciones`, `guard-dobles-e2e`,
  `guard-editor-aislado`: `Test Files 6 passed (6)`, `Tests 79 passed | 3 skipped (82)`. La guardia
  no escribe la ruta literal del asistente de lectura (la censa `recipe-route-contract`).

Veredicto: Tanda 1 hecha; muestras y R14 en verde, rojos esperados hasta las Tandas 2 y 3.

## Tanda 2 (frontend_dev, 2026-10-10) — T3, T4, T5, T6: el catálogo

Archivos:
- creado `components/shared/CATALOGO.md`
- modificado `tests/guards/guard-catalogo-de-componentes.test.ts`: solo `PIEZAS_PREVIAS_AL_REDISENO`
  (62 entradas, ordenadas; comentario «Instantánea del 2026-10-10.», sin el marcador de pendiente).
  La lógica de la guardia no se ha tocado.

Filas por sección (cada una escrita leyendo su archivo: exports, props opcionales, imports):
- Primitivos: 24 (una por `components/ui/*.tsx`), `Diseño` = `previo al rediseño`.
- Compuestos: 38 (35 `.tsx`/`.ts` sueltos + 4 barrels `index.ts` + `step-reader/step-document-view.tsx`
  por import profundo; los 44 componentes públicos en exactamente una fila). `Diseño` =
  `previo al rediseño`, salvo `compress-image.ts`, `credential-rule-labels.ts` y `file-types.ts`
  (`sin UI`).
- Apoyos: 11 (3 de `hooks/`, 8 de `lib/shared/ui/`), `Diseño` = `sin UI`.
- `PIEZAS_PREVIAS_AL_REDISENO`: los 62 `Archivo` de Compuestos y Primitivos (incluidos los tres
  `.ts` con `sin UI`, por literalidad de T6; sobran sin efecto si se prefiere quitarlos).

Decisiones y desviaciones del ejemplo de `design.md > 3`:
- `Base de` cita también Apoyos (`touchTarget`, `EMPTY_MARK`, `formatDateLocalISO`…) cuando el
  archivo los importa: son piezas del catálogo. Por eso la fila de `Button` lleva `touchTarget` y no
  `—` como el ejemplo, y la de `EmptyState` lleva `buttonVariants` (lo que importa de verdad).
- `Button`: el ejemplo hablaba de `asChild`; los primitivos son de Base UI y la prop es `render`.
- Varios nombres de una familia shadcn solo en las principales (regla 2 del formato).

No verificable / no verificado (escrito así en la fila o fuera de ella):
- `Tooltip`: que abra al tocar en iOS «no está comprobado en este repo» (lo dice ya
  `responsible-avatars.tsx`); la fila lo deja escrito así.
- De los archivos más largos (`async-autocomplete.tsx`, `presentation-select.tsx`, `file-field.tsx`,
  `step-reader/step-reader.tsx`, `supplier/supplier-form.tsx`, `document-upload/document-upload.tsx`
  e internos de `data-table/`) se leyeron props, docblocks, imports y los fragmentos de render
  necesarios, no el cuerpo entero. Lo que dicen sus filas sale de ahí; lo que «No cubre» se
  comprobó en código (p. ej. sin `onDrop` en `DocumentUpload`, sin `multiple` en `FileField`,
  capacidades de `@tanstack/react-table` fuera de `DATA_TABLE_OPTED_FEATURES`).
- `credential-rule-labels.ts`: la redacción figura como provisional en el propio archivo; no se
  sabe si sigue abierta.

Verificación (salida real):
- `pnpm run typecheck`: exit 0, sin errores.
- `pnpm run lint`: exit 0, `✖ 7 problems (0 errors, 7 warnings)` (los 7 de antes, ninguno nuevo).
- `pnpm exec vitest run guard-catalogo-de-componentes`: `Test Files 1 passed (1)`,
  `Tests 54 passed (54)`. Verdes los casos de catálogo (R1–R11, R15, R28–R31) y, en el momento de
  correrla, también los de docs y R22 (el otro agente ya había escrito su parte).

Veredicto: Tanda 2 hecha; catálogo con 73 filas y guardia entera en verde.
