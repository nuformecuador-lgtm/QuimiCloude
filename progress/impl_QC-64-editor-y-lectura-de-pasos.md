# QC-64 — editor-y-lectura-de-pasos · bitacora de implementacion

> Escrita por el `implementer`. Se actualiza **por tanda**, no al final: si el stream se corta,
> esto es lo unico que sobrevive. El gate completo (`./init.sh`) y el PR los corre el leader.

## Estado

| Tanda | Tasks | Commit | Estado |
| --- | --- | --- | --- |
| Puerta 0 | T2 | `d5399ba` | cerrada |
| (base) | merge `origin/dev` | `24aa5ea` | cerrada |
| Ola 1 | T3, T9 | `df6a9fa` | cerrada |
| Ola 2 | T5, T6 | `77753e8` | cerrada |
| Ola 3 | T4, T7, T8, T12 | `ac16d58` | cerrada |
| Ola 4 | T10, T11, T13 | `f2c247a` | cerrada |
| Ola 5 | T14 (E2E) | — | en curso |

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


### T4 + T7 + T8 — el editor entra en el formulario
- `app/(private)/produccion/formulas/components/recipe-form-state.ts` — **modificado**:
  `RecipeStepFormValue.text: string` pasa a `document: RecipeStepDocument`; se **borran**
  `textToStepDocument` y `stepDocumentToText` (el puente de QC-62 R19) y sus reexports;
  `buildRecipePayload` pasa el documento tal cual. Un `grep` del repo confirma **cero**
  declaraciones, llamadas, exports e imports de las dos funciones en `app/`, `tests/`, `e2e/`,
  `lib/` y `components/`.
- `app/(private)/produccion/formulas/components/recipe-steps-field.tsx` — **modificado**: el
  `<Input>` da paso a `<RecipeStepEditor>`. El asa, `useSortable`, los sensores, `handleDragEnd`
  y los `announcements` **no se tocan** (R24), y sigue siendo el unico importador de `@dnd-kit`.
  El `data-testid="recipe-step-text-N"` se conserva sobre el area editable para que
  `e2e/recetas.spec.ts:339` (`fill()`) siga verde.
- `app/(private)/produccion/formulas/components/recipe-form.tsx` — **modificado**:
  `buildInitialState` deja de aplanar (R9).
- `tests/unit/recetas-ui/recipe-form-payload.test.ts`, `tests/unit/recetas-ui/recipe-form.test.tsx`
  — **modificados**.

### T12 — la guardia de aislamiento
- `tests/guards/guard-editor-aislado.test.ts` — **nuevo** (6 casos). Vive en `tests/guards/` para
  entrar en `pnpm run test:guardias` y en `./init.sh --rapido`.

### T10 + T11 — la vista previa y la ausencia de ruta
- `app/(private)/produccion/formulas/components/recipe-form.tsx` — **modificado**: `Dialog` de
  shadcn (API de `@base-ui/react`: `open`/`onOpenChange`, `finalFocus` al trigger), trigger
  `recipe-form-preview-open`, contenido `recipe-form-preview` con `max-h-[85dvh]` y scroll
  interno. El `<StepReader>` se monta **condicionalmente**, sobre
  `state.steps.map((step) => step.document)`.
- `tests/unit/recetas-ui/recipe-route-contract.test.ts` — **ampliado** con los cuatro casos de R12.
- `tests/unit/recetas-ui/recipe-step-editor.test.tsx` — **modificado**: estabilizado el caso de R27
  (ver nota abajo).

### T14 — el E2E
- `e2e/recetas-pasos.spec.ts` — **nuevo**. Ver el bloque de resultados al final.

## Decisiones tomadas durante la implementacion que el reviewer deberia validar

1. **El `<Label>` del campo de paso desaparecio como elemento.** El nombre accesible «Paso N» del
   area editable lo da ahora la prop `label` de `RecipeStepEditor`, que lo pone como `aria-label`
   sobre el `contenteditable`. Motivo: un `<label htmlFor>` **no puede asociarse a un
   `contenteditable`**, que no es un control de formulario, y renderizar ambos daria dos nombres
   accesibles para el mismo elemento. El nombre se conserva y esta afirmado en el test.
2. **Cuatro casos del puente se eliminaron** de `recipe-form-payload.test.ts` y uno de
   `recipe-form.test.tsx` («la precarga aplana el documento»). Probaban funciones que T4 manda
   retirar y comportamiento que ya no existe; su intencion —el ida y vuelta
   documento -> pantalla -> payload— la cubre ahora, y mejor, el caso de R9. **No se borro ningun
   caso para hacerlo pasar.**
3. **`user.type` sobre el editor deja un parrafo vacio espurio en jsdom.** Los casos heredados que
   escribian en los pasos usan ahora un `paste` real sobre el `contenteditable` (mismo mecanismo
   que el test del editor) y afirman sobre el payload, que es lo que comprobaban de verdad.

## Un flake que se corrigio, y por que NO era el flake conocido de saturacion

El caso de R27 «los tres botones de la barra son alcanzables por tabulador...» fallaba **1 de cada
5 corridas del archivo EN AISLADO**, o sea que **no** era el flake de saturacion que describe
`docs/verification.md`. La causa es real y vale la pena anotarla: el comando `focus()` de TipTap
devuelve el foco al area editable **dentro de un `requestAnimationFrame`**; ese fotograma pendiente
se colaba entre el `focus()` del boton y la pulsacion, y el `Espacio` lo recibia el editable —
escribiendo un espacio— en vez del boton.

**Es comportamiento correcto del componente** (tras formatear, el foco vuelve al texto), asi que no
se toco `recipe-step-editor.tsx`. El test espera al foco diferido y **afirma `toHaveFocus()` sobre
el boton antes de teclear**: ninguna asercion se relajo, no se subio ningun timeout, no hay `skip`,
y ahora el caso afirma **mas** que antes. 15 corridas en aislado, todas verdes.

## Salida real de los tests

Cada tanda se verifico con `pnpm run typecheck`, `pnpm run lint` y los archivos relacionados.
**El gate completo (`./init.sh`) NO lo corre el `implementer`**: es del leader (regla 5 de
`CLAUDE.md` y el encargo de esta feature).

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

$ pnpm exec vitest run tests/unit/recetas-ui/recipe-form.test.tsx \
    tests/unit/recetas-ui/recipe-route-contract.test.ts \
    tests/unit/recetas-ui/recipe-step-editor.test.tsx \
    tests/unit/recetas-ui/step-reader.test.tsx \
    tests/unit/recetas-ui/recipe-form-payload.test.ts
 Test Files  5 passed (5)
      Tests  104 passed (104)

$ pnpm run test:guardias
 Test Files  16 passed (16)
      Tests  159 passed | 4 skipped (163)

$ pnpm run lint
(limpio, sin salida)

$ pnpm run typecheck
(solo los 2 errores heredados de dev descritos arriba)
```

## Mapa `R<n> -> test`

| R | Test (nombre exacto del caso) |
| --- | --- |
| R1 | `recipe-form.test.tsx`: «R1: el campo de un paso es el área editable del editor, no un `<input type="text">`» + `e2e/recetas-pasos.spec.ts` |
| R2 | `recipe-step-editor.test.tsx`: «R2: la interfaz del editor no ofrece ningun control de encabezado, enlace, imagen, tabla, cita, lista numerada ni bloque de codigo»; «R2: el esquema registra solo las seis construcciones y ninguna extension prohibida»; «R2: TaskList y TaskItem se importan de ./task-list y ./task-item, nunca de ./kit ni de la raiz del paquete» |
| R3 | `recipe-step-editor.test.tsx`: «R3: pegar HTML con h1, enlace e imagen conserva el texto y no deja ningun nodo ni marca fuera de las cuatro» |
| R4 | `recipe-step-document.test.ts`: «conserva el parrafo vacio como bloque con cero fragmentos, sin colapsarlo (R4)»; «combina negrilla y cursiva sobre el mismo fragmento y omite la clave de la marca ausente»; «no recorta ni normaliza el texto: los espacios de los extremos se conservan (QC-62 R5)»; «produce un documento que recipeStepSchema acepta sin ninguna limpieza posterior (R4)» |
| R5 | `recipe-form-payload.test.ts`: «R5: el paso con marcas y lista de verificación pasa recipeStepSchema y NO lleva ninguna clave que el contrato no declare» + `recipe-step-document.test.ts`: «descarta el estado de marcado del item y aplana el parrafo que lo envuelve (R5, R6)» |
| R6 | `recipe-step-editor.test.tsx`: «R6: el checkbox de un item de la lista de verificacion no cambia de estado al pulsarlo dentro del editor» |
| R7 | `recipe-step-editor.test.tsx`: «R7: avisa junto al paso cuando el documento supera MAX_STEP_ELEMENTS»; «R7: no avisa cuando el documento no supera el tope»; «R7: el numero y el conteo se toman del contrato, no se reescriben en la pantalla» |
| R8 | `recipe-step-editor.test.tsx`: «R8: no hay maxLength en el fuente del editor ni de su esquema, ni en el DOM renderizado»; «R8: un texto muy largo se acepta entero, sin recortarlo» |
| R9 | `recipe-form.test.tsx`: «R9: un paso con marcas y lista de verificación se precarga completo y vuelve idéntico al guardar» + `e2e/recetas-pasos.spec.ts` |
| R10 | `recipe-form.test.tsx`: «R10: no hay selector de tipo de paso en el alta ni en la edición: ni select, ni radios, ni control equivalente» |
| R11 | `recipe-form.test.tsx`: «R11: abrir la vista previa no invoca ninguna operacion y monta el asistente sobre los pasos escritos EN ESE INSTANTE» |
| R12 | `recipe-route-contract.test.ts`: «ninguna page.tsx del repo monta el asistente»; «lib/shared/routes.ts no gana ninguna constante para el asistente y publica exactamente las de hoy»; «el asistente solo se importa desde recipe-form.tsx»; «el listado del catalogo no enlaza ni menciona el asistente» |
| R13 | `recipe-form.test.tsx`: «R13: cerrar la vista previa con Esc devuelve el formulario intacto y el foco al boton que la abrio, y el payload es el mismo que sin haberla abierto» |
| R14 | `step-reader.test.tsx`: «renderiza solo el paso actual y el resto NO esta en el DOM»; «indica la posicion del paso actual dentro del total» |
| R15 | `step-reader.test.tsx`: «avanza y retrocede entre pasos con Siguiente y Anterior»; «en el ultimo paso ofrece Finalizar y ya NO ofrece Siguiente»; «en el primer paso, Anterior no permite retroceder» |
| R16 | `step-reader.test.tsx`: «marca y desmarca un item de la lista de verificacion»; «conserva lo marcado al ir al paso siguiente y volver» |
| R17 | `step-reader.test.tsx`: «deshabilita Siguiente mientras queden items sin marcar y muestra el motivo como texto»; «NO esconde el motivo en un title del boton»; «actualiza el numero de pendientes y libera el boton al marcar el ultimo»; «tambien bloquea Finalizar en el ultimo paso» + `e2e/recetas-pasos.spec.ts` |
| R18 | `step-reader.test.tsx`: «no bloquea el avance cuando el paso no tiene lista de verificacion» |
| R19 | `step-reader.test.tsx`: «al remontar el asistente todos los items vuelven sin marcar»; «no usa localStorage ni sessionStorage en ninguno de sus archivos» |
| R20 | `step-reader.test.tsx`: «no importa lib/composition, ni Server Actions, ni la navegacion de Next, ni app/»; «declara use client en cada componente y NUNCA en el barrel» |
| R21 | `step-reader.test.tsx`: «presenta el estado vacio y no ofrece ningun control de navegacion» |
| R22 | `recipe-form.test.tsx`: «R22: Finalizar cierra el modal y no guarda ni navega» + `e2e/recetas-pasos.spec.ts` |
| R23 | `recipe-page.test.tsx` heredado y `e2e/recetas.spec.ts` (rechazo por rol), **sin cambios**: esta feature no toca ninguna autorizacion, ni el borde ni el service del modulo `recetas` |
| R24 | `recipe-form.test.tsx`: «R24: tomar el asa con Espacio, mover con las flechas y soltar cambia el orden del payload aunque cada paso monte un editor», mas los casos heredados de QC-26 R33 (raton) y R34 (teclado), verdes sin tocar sus aserciones |
| R25 | `guard-dependencias-aprobadas.test.ts` (heredado) + `guard-editor-aislado.test.ts`: «solo los dos archivos que enumera design.md > 7 mencionan @tiptap»; «@tiptap/starter-kit no aparece ni en package.json ni en el fuente»; «TaskList y TaskItem se importan de ./task-list y ./task-item, nunca del kit ni de la raiz»; «las nueve entradas de TipTap estan en package.json y ninguna fila del registro es excepcion»; «el asistente de lectura no conoce la libreria del editor» |
| R26 | `step-reader.test.tsx`: «mantiene los objetivos tactiles de 44x44 px en viewport angosto»; «presenta el mismo paso y los mismos controles en viewport ancho»; «no usa 100vh en ninguna parte de su fuente»; «no esconde nada detras de :hover y usa text-base en el contenido». `recipe-step-editor.test.tsx`: «R26: en viewport angosto y ancho los botones de la barra miden al menos 44x44 px y el area editable usa text-base»; «R26: no se usa 100vh y ninguna accion vive detras de :hover» |
| R27 | `step-reader.test.tsx`: «permite marcar un item y avanzar sin tocar el raton»; «anuncia el paso actual en una region aria-live=polite». `recipe-step-editor.test.tsx`: «R27: los tres botones de la barra son alcanzables por tabulador y se activan sin raton, y aria-pressed refleja el estado»; «R27: el area editable tiene nombre accesible y es la que recibe el contenteditable» |
| R28 | `e2e/recetas-pasos.spec.ts`, en Chromium y WebKit |
