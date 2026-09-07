# QC-64 — editor-y-lectura-de-pasos · bitacora de implementacion

> Escrita por el `implementer`. Se actualiza **por tanda**, no al final: si el stream se corta,
> esto es lo unico que sobrevive. El gate completo (`./init.sh`) y el PR los corre el leader.

## Estado

| Tanda | Tasks | Commit | Estado |
| --- | --- | --- | --- |
| Puerta 0 | T2 | `d5399ba` | cerrada |
| (base) | merge `origin/dev` | `24aa5ea` | cerrada |
| Ola 1 | T3, T9 | `df6a9fa` | cerrada |
| Ola 2 | T5, T6, T13(editor) | ver `git log` | cerrada |
| Ola 3 | T4, T7, T8 | — | pendiente |
| Ola 4 | T10, T11, T12 | — | pendiente |
| Ola 5 | T14 | — | pendiente |

## Dos cosas que el leader tiene que decidir

### 1. `cn@^0.2.6` — entrada nueva que el CLI de shadcn quiso meter (T2)

`npx shadcn add dialog checkbox toggle-group` genero los tres componentes **mas**
`components/ui/toggle.tsx` (dependencia interna de `toggle-group`) y anadio a `package.json` la
entrada **`cn@^0.2.6`**, que **no tiene fila en `docs/dependencias.md`**. Es exactamente el caso
que `design.md > 2.5` punto 3 anticipaba.

**No se instalo** (regla 7 de `CLAUDE.md`). Se desinstalo, y los cuatro componentes generados
importan `cn` de `@/lib/utils`, que es de donde ya lo importa el resto de `components/ui/`.
`git diff package.json` frente a `dev` muestra **solo las nueve entradas de TipTap**, todas con su
fila (commit `3c26268`). **Queda subido al leader** por si prefiere aprobar la fila en vez de
declinar la entrada.

Efecto colateral corregido: el CLI reescribio `components/ui/button.tsx` (perdia la variante
`outline-dashed` y el `cursor-pointer`). Se revirtio con `git checkout` antes de commitear.

### 2. Dos errores de `typecheck` heredados de `origin/dev`

Tras `git merge origin/dev` (limpio, sin conflictos), `pnpm run typecheck` deja **exactamente 2**
errores, y **ninguno es de esta feature**:

```
tests/integration/inventario/list-query-indexes.int.test.ts(77,5): error TS2322:
  Property 'companyId' is missing in type ... but required in type 'UserUncheckedCreateInput'.
tests/integration/pedidos/list-query-orders.int.test.ts(131,7): error TS2322:  (idem)
```

Es un **conflicto semantico entre QC-47 (PR #37) y QC-57 (PR #38)**, mergeados en paralelo:
QC-47 hizo `companyId` obligatorio en `users` y los fixtures de integracion de QC-57 crean usuarios
sin el. No se han tocado: no son de esta zona ni de esta feature. **El gate completo no puede salir
verde hasta que eso se arregle en `dev`.**

Aparte, y esto es de entorno, no de codigo: en un worktree recien montado `pnpm run typecheck`
anade un tercer error que **no es real** (`app/layout.tsx: Cannot find name 'LayoutProps'`). Son
los tipos de ruta que Next genera; se resuelve con `pnpm exec next typegen`. Y `pnpm install` no
corre `prisma generate` porque los build scripts estan ignorados: hace falta
`pnpm exec prisma generate` o salen decenas de errores falsos en `@prisma/client`.

## Archivos creados / modificados

### T2 — la dependencia
- `package.json`, `pnpm-lock.yaml` — nueve entradas de TipTap fijadas a **`3.31.3`**.
  **`@tiptap/starter-kit` NO entra.**
- `components/ui/dialog.tsx`, `checkbox.tsx`, `toggle-group.tsx`, `toggle.tsx` — **nuevos**, por CLI.

### T3 — el mapeo (puro, sin React ni DOM ni `@tiptap`)
- `app/(private)/produccion/formulas/components/recipe-step-document.ts` — **nuevo**
- `tests/unit/recetas-ui/recipe-step-document.test.ts` — **nuevo** (13 casos)

### T9 + T13(asistente) — el asistente de lectura
- `components/shared/step-reader/step-reader.tsx` — **nuevo**
- `components/shared/step-reader/step-document-view.tsx` — **nuevo**
- `components/shared/step-reader/index.ts` — **nuevo**
- `tests/unit/recetas-ui/step-reader.test.tsx` — **nuevo** (23 casos)

### T5 + T6 + T13(editor) — el esquema cerrado y el editor
- `app/(private)/produccion/formulas/components/recipe-step-schema.ts` — **nuevo**
- `app/(private)/produccion/formulas/components/recipe-step-editor.tsx` — **nuevo**
- `app/(private)/produccion/formulas/components/index.ts` — **modificado**: tres reexports
- `tests/unit/recetas-ui/recipe-step-editor.test.tsx` — **nuevo**

`TaskList`/`TaskItem` se importan de **`@tiptap/extension-list/task-list`** y
**`@tiptap/extension-list/task-item`**, verificado contra los `exports` del paquete instalado.
Nunca de `./kit` ni de la raiz: ese paquete tambien trae `BulletList` y `OrderedList`, y el `./kit`
los registraria (R2). El esquema registra siete entradas y ninguna mas: `Document`, `Paragraph`
(sin atajos), `Text`, `Bold`, `Italic`, `TaskList`, `TaskItem` (`nested: false`).

## Notas de implementacion que el reviewer deberia leer

- **jsdom y ProseMirror.** El test del editor necesita stubs de `Range.prototype.getClientRects`
  (jsdom no hace layout) y un `clipboardData` de mentira que **solo entrega** el HTML de entrada.
  Estan **dentro del propio archivo de test**, no en `tests/setup.ts` ni en `vitest.config.mts`,
  que son compartidos y tienen ramas en vuelo. Quien decide que sobrevive al pegado es el esquema
  real de ProseMirror, que corre de verdad: el stub no fabrica el verde.
- **R6 y una divergencia de jsdom que NO se maquillo.** jsdom ejecuta el activation behaviour de
  un checkbox aunque este `disabled`; ningun navegador lo hace. Por eso el caso de R6 no afirma
  sobre `control.checked` tras un `fireEvent.click` —seria afirmar sobre un fallo de jsdom—:
  afirma que `user-event` **se niega** a pulsarlo por `pointer-events: none`, que
  `li[data-checked]` sigue en `false`, que no hubo ninguna transaccion (`onChange` nunca se
  invoco) y que no hay ningun `role="checkbox"` en el arbol accesible.
- **El escaneo de fuente del asistente** (R19, R20) corre sobre el codigo **con los comentarios
  quitados**: los comentarios explican literalmente lo prohibido y un escaneo del texto crudo
  confundiria la prosa con un import real.

<!-- MAPA -->
## Salida real de los tests (por tanda)

```
$ pnpm exec vitest run tests/unit/recetas-ui/recipe-step-document.test.ts
 Test Files  1 passed (1)
      Tests  13 passed (13)

$ pnpm exec vitest run tests/unit/recetas-ui/step-reader.test.tsx
 Test Files  1 passed (1)
      Tests  23 passed (23)

$ pnpm exec vitest run tests/unit/recetas-ui/recipe-step-editor.test.tsx tests/unit/recetas-ui/recipe-route-contract.test.ts
 Test Files  2 passed (2)
      Tests  34 passed (34)

$ pnpm run lint
(limpio, sin salida)

$ pnpm run typecheck
(solo los 2 errores heredados de dev descritos arriba)
```

## Mapa `R<n> -> test`

Se rellena conforme cierran las tandas. Guion = pendiente.

| R | Test (nombre exacto del caso) | Estado |
| --- | --- | --- |
| R1 | — | pendiente (T7, T14) |
| R2 | `recipe-step-editor.test.tsx`: «R2: la interfaz del editor no ofrece ningun control de encabezado, enlace, imagen, tabla, cita, lista numerada ni bloque de codigo»; «R2: el esquema registra solo las seis construcciones y ninguna extension prohibida»; «R2: TaskList y TaskItem se importan de ./task-list y ./task-item, nunca de ./kit ni de la raiz del paquete» | verde |
| R3 | `recipe-step-editor.test.tsx`: «R3: pegar HTML con h1, enlace e imagen conserva el texto y no deja ningun nodo ni marca fuera de las cuatro» | verde |
| R4 | `recipe-step-document.test.ts`: «conserva el parrafo vacio como bloque con cero fragmentos, sin colapsarlo (R4)»; «combina negrilla y cursiva sobre el mismo fragmento y omite la clave de la marca ausente»; «no recorta ni normaliza el texto: los espacios de los extremos se conservan (QC-62 R5)»; «produce un documento que recipeStepSchema acepta sin ninguna limpieza posterior (R4)» | verde |
| R5 | `recipe-step-document.test.ts`: «descarta el estado de marcado del item y aplana el parrafo que lo envuelve (R5, R6)» | parcial: falta T4 |
| R6 | `recipe-step-editor.test.tsx`: «R6: el checkbox de un item de la lista de verificacion no cambia de estado al pulsarlo dentro del editor» | verde |
| R7 | `recipe-step-editor.test.tsx`: «R7: avisa junto al paso cuando el documento supera MAX_STEP_ELEMENTS»; «R7: no avisa cuando el documento no supera el tope»; «R7: el numero y el conteo se toman del contrato, no se reescriben en la pantalla» | verde |
| R8 | `recipe-step-editor.test.tsx`: «R8: no hay maxLength en el fuente del editor ni de su esquema, ni en el DOM renderizado»; «R8: un texto muy largo se acepta entero, sin recortarlo» | verde |
| R9 | — | pendiente (T8, T14) |
| R10 | — | pendiente (T8) |
| R11 | — | pendiente (T10) |
| R12 | — | pendiente (T11) |
| R13 | — | pendiente (T10) |
| R14 | `step-reader.test.tsx`: «renderiza solo el paso actual y el resto NO esta en el DOM»; «indica la posicion del paso actual dentro del total» | verde |
| R15 | `step-reader.test.tsx`: «avanza y retrocede entre pasos con Siguiente y Anterior»; «en el ultimo paso ofrece Finalizar y ya NO ofrece Siguiente»; «en el primer paso, Anterior no permite retroceder» | verde |
| R16 | `step-reader.test.tsx`: «marca y desmarca un item de la lista de verificacion»; «conserva lo marcado al ir al paso siguiente y volver» | verde |
| R17 | `step-reader.test.tsx`: «deshabilita Siguiente mientras queden items sin marcar y muestra el motivo como texto»; «NO esconde el motivo en un title del boton»; «actualiza el numero de pendientes y libera el boton al marcar el ultimo»; «tambien bloquea Finalizar en el ultimo paso» | verde; falta E2E |
| R18 | `step-reader.test.tsx`: «no bloquea el avance cuando el paso no tiene lista de verificacion» | verde |
| R19 | `step-reader.test.tsx`: «al remontar el asistente todos los items vuelven sin marcar»; «no usa localStorage ni sessionStorage en ninguno de sus archivos» | verde |
| R20 | `step-reader.test.tsx`: «no importa lib/composition, ni Server Actions, ni la navegacion de Next, ni app/»; «declara use client en cada componente y NUNCA en el barrel» | verde |
| R21 | `step-reader.test.tsx`: «presenta el estado vacio y no ofrece ningun control de navegacion» | verde |
| R22 | — | pendiente (T10, T14) |
| R23 | — | pendiente (T14; heredado sin cambios) |
| R24 | — | pendiente (T7) |
| R25 | `guard-dependencias-aprobadas.test.ts` (heredado, verde) | parcial: falta T12 |
| R26 | `step-reader.test.tsx`: «mantiene los objetivos tactiles de 44x44 px en viewport angosto»; «presenta el mismo paso y los mismos controles en viewport ancho»; «no usa 100vh en ninguna parte de su fuente»; «no esconde nada detras de :hover y usa text-base en el contenido». `recipe-step-editor.test.tsx`: «R26: en viewport angosto y ancho los botones de la barra miden al menos 44x44 px y el area editable usa text-base»; «R26: no se usa 100vh y ninguna accion vive detras de :hover» | verde |
| R27 | `step-reader.test.tsx`: «permite marcar un item y avanzar sin tocar el raton»; «anuncia el paso actual en una region aria-live=polite». `recipe-step-editor.test.tsx`: «R27: los tres botones de la barra son alcanzables por tabulador y se activan sin raton, y aria-pressed refleja el estado»; «R27: el area editable tiene nombre accesible y es la que recibe el contenteditable» | verde |
| R28 | — | pendiente (T14) |
