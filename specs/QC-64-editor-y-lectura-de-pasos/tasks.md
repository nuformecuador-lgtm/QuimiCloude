# QC-64 — editor-y-lectura-de-pasos · tasks.md

> Checklist del `implementer`. Cada task dice **qué archivos toca**, de **qué depende**, y su
> **criterio de hecho**. `[P]` = paralelizable con las que llevan la misma marca en su bloque.
> Ninguna task se marca `[x]` sin que su criterio se cumpla de verdad; se cierra tanda con
> `./init.sh --rapido` y la feature con `./init.sh` completo (regla 5 de `CLAUDE.md`).

## Puerta 0 — la dependencia (BLOQUEA TODO LO DEMÁS)

- [x] **T1 — Correr los cuatro checks y cerrar la librería.** (`design.md > 2.3`, R25)
      **Los checks los corrió el leader el 2026-09-06 y los cuatro PASAN** en los nueve paquetes;
      la tabla de `design.md > 2.3` está rellena con salida real del registro. También quedó
      resuelto contra el paquete publicado que `TaskList`/`TaskItem` viven en
      `@tiptap/extension-list` (`./task-list`, `./task-item`), o sea **nueve** entradas directas y
      no once, y que `peerDependencies` admite `react@19.2.8` sin `--force`.
  - Archivos: **ninguno de código**. Se escribe el resultado en `progress/impl_QC-64-*.md`.
  - **Lo que queda de T1, y es lo único que bloquea T2:** la **aprobación humana** de la
    dependencia en F1.4 y, con ella, las **nueve filas** de `docs/dependencias.md` escritas
    **antes** de instalar.
  - **Si algún check falla:** se para y se sube la decisión (fila `excepcion` con el check fallado
    escrito, o cambio a la opción 9.2). **No se instala nada por cuenta propia.**

- [x] **T2 — Instalar** lo aprobado en T1 y `npx shadcn add dialog checkbox toggle-group`.
      Depende de **T1**.
  - Archivos: `package.json`, `pnpm-lock.yaml`, `components/ui/dialog.tsx`,
    `components/ui/checkbox.tsx`, `components/ui/toggle-group.tsx`.
  - **Hecho cuando:** `pnpm run test:guardias` pasa —incluida
    `tests/guards/guard-dependencias-aprobadas.test.ts`— y `git diff package.json` no muestra
    **ninguna** entrada sin fila en `docs/dependencias.md` (incluidas las que haya podido añadir el
    CLI de shadcn, `design.md > 2.5` punto 3).

## Bloque A — el contrato en la pantalla

- [x] **T3 [P] — Mapeo editor ↔ documento del contrato.** Depende de **T1** (necesita saber la forma
      del JSON del editor); no depende de T2 si se escribe contra la forma verificada.
  - Archivos: `app/(private)/produccion/formulas/components/recipe-step-document.ts` (nuevo).
  - Contiene `editorJsonToStepDocument` y `stepDocumentToEditorJson` (`design.md > 4`). **Sin React
    ni DOM.**
  - **Hecho cuando:** `tests/unit/recetas-ui/recipe-step-document.test.ts` pasa con casos de:
    párrafo vacío conservado, marcas combinadas sobre el mismo fragmento, texto con espacios **sin
    recortar**, `checked` descartado en ambos sentidos, y nodo desconocido que **no** produce salida.

- [x] **T4 [P] — Retirar el puente de QC-62 R19 y cambiar el estado del paso.** Depende de **T3**.
  - Archivos: `app/(private)/produccion/formulas/components/recipe-form-state.ts`.
  - `RecipeStepFormValue` pasa de `text: string` a `document: RecipeStepDocument`; se **borran**
    `textToStepDocument` y `stepDocumentToText`; `buildRecipePayload` pasa el documento tal cual.
  - **Hecho cuando:** `tests/unit/recetas-ui/recipe-form-payload.test.ts` (actualizado) pasa, un
    `grep` confirma que las dos funciones puente ya no existen en el repo, y `pnpm run typecheck`
    está limpio.

## Bloque B — el editor

- [x] **T5 — Esquema cerrado del editor.** Depende de **T2**.
  - Archivos: `app/(private)/produccion/formulas/components/recipe-step-schema.ts` (nuevo).
  - Sólo las extensiones de `design.md > 3` capa 1. **Sin `starter-kit`.** Atajos de teclado ajenos
    desactivados.
  - **Hecho cuando:** existe y `recipe-step-editor.tsx` es su único consumidor.

- [x] **T6 — El editor de un paso.** Depende de **T5**, **T3**.
  - Archivos: `app/(private)/produccion/formulas/components/recipe-step-editor.tsx` (nuevo).
  - Barra de formato siempre visible (negrilla, cursiva, lista de verificación), `aria-pressed`,
    ≥44×44 px, área editable `text-base`; checkbox de los ítems **no interactivo** (R6); aviso de
    tope leyendo `MAX_STEP_ELEMENTS` y `countRecipeStepElements` del contrato (R7).
  - **Hecho cuando:** `tests/unit/recetas-ui/recipe-step-editor.test.tsx` pasa y cubre R2 (no hay
    control de encabezado/enlace/imagen/tabla/lista numerada), R3 (pegar HTML ajeno deja sólo
    texto), R6, R7 y R8 (no hay `maxLength` en ninguna parte).

- [x] **T7 — Sustituir el `<Input>` por el editor en el campo de pasos.** Depende de **T6**, **T4**.
  - Archivos: `app/(private)/produccion/formulas/components/recipe-steps-field.tsx`.
  - **No se toca** el asa de arrastre, ni los sensores, ni `handleDragEnd` (R24).
  - **Hecho cuando:** el test heredado del arrastre de QC-26 sigue verde y un test nuevo afirma que
    el arrastre por teclado funciona con el editor montado dentro de la fila.

- [x] **T8 — Precarga de edición sin aplanar.** Depende de **T7**, **T3**.
  - Archivos: `app/(private)/produccion/formulas/components/recipe-form.tsx`
    (`buildInitialState`).
  - **Hecho cuando:** `tests/unit/recetas-ui/recipe-form.test.tsx` afirma que un `RecipeDetail` con
    marcas y lista de verificación llega al editor **completo** (R9) y que no existe ningún selector
    de tipo de paso en ninguno de los dos modos (R10).

## Bloque C — el asistente de lectura

- [x] **T9 [P] — El asistente.** Depende de **T2** (necesita `checkbox`); **no** depende de B.
  - Archivos: `components/shared/step-reader/step-reader.tsx`,
    `components/shared/step-reader/step-document-view.tsx`,
    `components/shared/step-reader/index.ts` (nuevos).
  - API exacta de `design.md > 5`. Estado en memoria. Sin `localStorage`/`sessionStorage`, sin
    `useRouter`, sin Server Actions, sin `lib/composition`.
  - **Hecho cuando:** `tests/unit/recetas-ui/step-reader.test.tsx` pasa cubriendo R14 (sólo un paso
    en el DOM + posición), R15 (Anterior/Siguiente/Finalizar), R16 (marcar, desmarcar y conservar al
    ir y volver), R17 (bloqueo **con motivo en texto visible**), R18, R19 (remontar deja todo sin
    marcar), R20 (test de imports: el archivo no importa nada prohibido), R21 y R27 (recorrido con
    teclado + región `aria-live`).

## Bloque D — la vista previa

- [x] **T10 — Modal de «Vista previa».** Depende de **T9**, **T8**.
  - Archivos: `app/(private)/produccion/formulas/components/recipe-form.tsx`,
    `app/(private)/produccion/formulas/components/index.ts`.
  - **Hecho cuando:** un test afirma que abrir la vista previa **no** invoca ninguna Server Action,
    que cerrarla devuelve el formulario intacto (R13) y que Finalizar cierra el modal sin guardar ni
    navegar (R22).

- [x] **T11 [P] — Contrato de ruta: el asistente no tiene URL.** Depende de **T10**.
  - Archivos: `tests/unit/recetas-ui/recipe-route-contract.test.ts` (se amplía).
  - **Hecho cuando:** el test falla si aparece una `page.tsx` que monte el asistente o una constante
    de ruta nueva para él (R12), y `lib/shared/routes.ts` no cambió.

## Bloque E — guardias, plataforma y E2E

- [x] **T12 [P] — Guardia de aislamiento de la librería.** Depende de **T6**.
  - Archivos: `tests/guards/guard-editor-aislado.test.ts` (nuevo), al estilo de la guardia de
    `@dnd-kit` de QC-26.
  - **Hecho cuando:** falla si algún archivo fuera de los dos enumerados en `design.md > 7` importa
    la librería del editor (R25).

- [x] **T13 [P] — Multiplataforma.** Depende de **T6**, **T9**.
  - Archivos: tests de T6 y T9 (se amplían), usando `tests/helpers/viewport.ts`.
  - **Hecho cuando:** se afirma ≥44×44 px en los controles táctiles, `text-base` en el área
    editable, ausencia de `100vh` y ausencia de cualquier acción que sólo exista tras `:hover`
    (R26).

- [x] **T14 — E2E del camino completo.** Depende de **todo lo anterior**.
  - Archivos: `e2e/recetas-pasos.spec.ts` (nuevo).
  - Recorrido: login como Administrador → nueva receta → redactar un paso con **negrilla** y una
    **lista de verificación** → guardar → volver a abrir la receta → **el paso se ve igual que se
    guardó** → abrir «Vista previa» → marcar los ítems → **Finalizar**. Además: comprobar que con un
    ítem sin marcar **no se puede avanzar** y que el motivo está en pantalla.
  - Fixtures con prefijo `qc64_e2e_`, limpieza de huérfanos **por prefijo y edad**, `afterAll` por
    nombre exacto (patrón de `e2e/recetas.spec.ts`).
  - **Hecho cuando:** pasa en **Chromium y WebKit** (R28), y con ello queda acreditado el punto 2 de
    `design.md > 2.5`.

## Cierre

- [ ] **T15 — Gate completo y trazabilidad.** Depende de **T14**.
  - Archivos: `progress/impl_QC-64-editor-y-lectura-de-pasos.md`.
  - **Hecho cuando:** `./init.sh` termina en verde (sin archivos rojos nuevos frente a
    `tests/baseline-rojos.json`), el archivo de progreso contiene la salida real de los tests y el
    mapa `R<n> -> test` de abajo **relleno con los nombres reales de los casos**, y `tasks.md` está
    todo en `[x]`.

## Trazabilidad prevista `R<n> -> test`

El `implementer` la confirma en `progress/impl_QC-64-*.md` con el nombre exacto de cada caso; el
reviewer rechaza si falta alguno (`CHECKPOINTS.md > Trazabilidad`).

| R | Test | Task |
| --- | --- | --- |
| R1 | `recipe-form.test.tsx` (el campo de paso es el editor, no un `<input type=text>`) + E2E | T7, T14 |
| R2 | `recipe-step-editor.test.tsx` (no hay control ni atajo fuera de los cuatro) | T6 |
| R3 | `recipe-step-editor.test.tsx` (pegar HTML con `h1`/`a`/`img` deja sólo texto) | T6 |
| R4 | `recipe-step-document.test.ts` (párrafo vacío, marcas combinadas, orden) | T3 |
| R5 | `recipe-form-payload.test.ts` (el payload pasa `recipeStepSchema` y no lleva claves extra) | T4 |
| R6 | `recipe-step-editor.test.tsx` (el checkbox del editor no cambia de estado al pulsarlo) | T6 |
| R7 | `recipe-step-editor.test.tsx` (aviso al superar `MAX_STEP_ELEMENTS`, tomado del contrato) | T6 |
| R8 | `recipe-step-editor.test.tsx` (sin `maxLength`; texto largo se acepta) | T6 |
| R9 | `recipe-form.test.tsx` (precarga con marcas y lista, sin aplanar) + E2E | T8, T14 |
| R10 | `recipe-form.test.tsx` (no existe selector de tipo en alta ni en edición) | T8 |
| R11 | `recipe-form.test.tsx` (abrir la vista previa no invoca ninguna acción) | T10 |
| R12 | `recipe-route-contract.test.ts` (sin ruta ni constante para el asistente) | T11 |
| R13 | `recipe-form.test.tsx` (cerrar la vista previa deja el formulario intacto) | T10 |
| R14 | `step-reader.test.tsx` (un solo paso en el DOM, con su posición) | T9 |
| R15 | `step-reader.test.tsx` (Anterior/Siguiente/Finalizar en el último) | T9 |
| R16 | `step-reader.test.tsx` (marcar, desmarcar, y conservar al ir y volver) | T9 |
| R17 | `step-reader.test.tsx` (bloqueado + motivo en texto visible, no en `title`) + E2E | T9, T14 |
| R18 | `step-reader.test.tsx` (paso sin ítems avanza sin acción previa) | T9 |
| R19 | `step-reader.test.tsx` (remontar deja todo sin marcar; sin `localStorage`) | T9 |
| R20 | `step-reader.test.tsx` (test de imports del componente) | T9 |
| R21 | `step-reader.test.tsx` (sin pasos: estado vacío y sin navegación) | T9 |
| R22 | `recipe-form.test.tsx` (Finalizar cierra y no guarda ni navega) + E2E | T10, T14 |
| R23 | `recipe-page.test.tsx` heredado + `e2e/recetas.spec.ts` (rechazo por rol, sin cambios) | T14 |
| R24 | test de arrastre por teclado con el editor dentro + `recipe-steps-field` heredado | T7 |
| R25 | `guard-dependencias-aprobadas.test.ts` + `guard-editor-aislado.test.ts` | T2, T12 |
| R26 | tests de viewport y de objetivos táctiles en T13 | T13 |
| R27 | `step-reader.test.tsx` y `recipe-step-editor.test.tsx` (recorrido por teclado, `aria-live`) | T9, T13 |
| R28 | `e2e/recetas-pasos.spec.ts` | T14 |
