# QC-64 — editor-y-lectura-de-pasos · review

> Escrito por el `reviewer` (F2.2) el 2026-09-07, sobre el worktree
> `.worktrees/QC-64-editor-y-lectura-de-pasos` y el diff de
> `feature/QC-64-editor-y-lectura-de-pasos` contra `origin/dev` (10 commits, 29 archivos).
> El reviewer verifica y no edita: todo lo de abajo se corrio de verdad, y ninguna correccion
> se aplico al codigo.

## Veredicto

**RECHAZADO** — 1 hallazgo BLOQUEANTE (el E2E de R28, rojo reproducible en Chromium en aislado),
4 menores. Todo lo demas —esquema cerrado, contrato de QC-62, aislamiento de TipTap,
`package.json`, no persistencia del marcado, ausencia de ruta, accesibilidad y tactil, y el
selector de tipo retirado— **pasa, y pasa con tests que prueban lo que dicen probar**.

## Que se corrio (salida real, no la bitacora del implementer)

```
$ pnpm exec prisma generate && pnpm exec next typegen      # preparacion del worktree
$ pnpm exec vitest run tests/unit/recetas-ui/
  Test Files  9 passed (9)   Tests  154 passed (154)
$ pnpm run test:guardias
  Test Files 16 passed (16)  Tests  159 passed | 4 skipped (163)
$ pnpm run lint      -> limpio
$ pnpm run typecheck -> 2 errores, LOS DOS HEREDADOS DE dev (ver «No es de QC-64»)
$ pnpm exec playwright test e2e/recetas-pasos.spec.ts --project=chromium   -> FALLA (5 de 5)
$ pnpm exec playwright test e2e/recetas-pasos.spec.ts --project=webkit     -> pasa
$ pnpm exec playwright test e2e/recetas-pasos.spec.ts   (los dos proyectos) -> 2 passed
```

## Checklist

### Especificacion
- [x] `requirements.md` con R1–R28 en EARS.
- [x] `design.md` con alternativas descartadas y su porque (9.1–9.5).
- [ ] `tasks.md` todo en `[x]` — **T15 sigue sin marcar** (menor 1; es del leader).

### Trazabilidad `R<n> -> test`
- [x] El mapa de `progress/impl_QC-64-*.md` cubre **R1–R28 sin huecos**, con el nombre exacto de
      cada caso.
- [x] Se comprobo **caso por caso que el test citado existe y afirma lo que dice**, no solo que
      el nombre suene. Muestreo detallado:
  - **R2** — `recipe-step-editor.test.tsx` compara los **paquetes importados** por
    `recipe-step-schema.ts` contra una lista blanca de 7 y cuenta las entradas de
    `RECIPE_STEP_EXTENSIONS`: una octava extension pone el caso rojo. No es un test de DOM.
  - **R3** — el caso de pegado **corre ProseMirror de verdad**: el stub de portapapeles solo
    entrega el HTML de entrada, quien coerciona es el esquema real. Pega un encabezado, un
    enlace y una imagen, y afirma texto conservado, cero `a|img|h1|ol` en el DOM, cero claves
    fuera de `text|bold|italic`, y que ni la URL ni el nombre de la imagen estan en el documento.
  - **R6** — no maquilla la divergencia de jsdom: afirma que `user-event` **se niega** por
    `pointer-events:none`, que `li[data-checked]` sigue en `false`, que `onChange` **nunca** se
    invoco y que no hay ningun `role="checkbox"` en el arbol accesible.
  - **R9** — precarga un documento con marcas, parrafo vacio y lista de dos items, afirma
    `strong`, `em` y dos `li[data-type="taskItem"]`, y cierra comparando el payload reenviado
    con el documento original: la ida y vuelta completa.
  - **R13** — compara el payload **con** y **sin** haber abierto la vista previa. Esa es la
    asercion, no un `toBeInTheDocument()`.
  - **R19** — remonta el asistente y afirma `aria-checked=false`, mas escaneo de fuente sin
    `localStorage` ni `sessionStorage`.
- [x] `progress/impl_<feature>.md` contiene el mapa.

### Calidad de codigo
- [x] `lint` limpio.
- [x] `typecheck`: **ningun error de QC-64** (los 2 que quedan son de `dev`).
- [x] Unitarios y guardias verdes, corridos por el reviewer.
- [ ] **E2E del flujo (R28): ROJO reproducible** — bloqueante 1.
- [x] Multiplataforma (ver abajo).
- [x] Dependencias con fila y aprobacion citada (ver abajo).

### Datos y seguridad
- [x] **No aplica, y se verifico que no aplica**: el diff **no toca** `db/schema.prisma`,
      `lib/**`, ni ninguna Server Action, service o adaptador. Ningun modelo nuevo, o sea nada
      que pedir sobre columna de empresa ni sobre rechazo de acceso cruzado. Ninguna consulta
      nueva. Ningun permiso nuevo: R23 se sostiene y los tests de rol heredados siguen verdes.
- [x] Sin secretos en el diff. Sin webhooks. Sin migraciones.

### Modulos hexagonales
- [x] El asistente y el editor solo importan **el contrato** (`@/lib/modules/recetas`), nunca
      ruta profunda. `components/shared/step-reader/` no importa `lib/composition`, ni Server
      Actions, ni la navegacion de Next — con test de fuente que lo afirma.

## Verificacion punto por punto de lo que el encargo exigia

**1. Esquema cerrado, de verdad cerrado.** Si. Tres capas y las tres estan: el esquema registra
`Document`, `Paragraph` (sin atajos), `Text`, `Bold`, `Italic`, `TaskList` y `TaskItem`
(`nested:false`) **y nada mas**; el mapeo es lista blanca por construccion (un nodo sin rama no
se escribe); y el borde valida con `recipeStepSchema` estricto. **Al pegar**, el caso de R3
demuestra sobre ProseMirror real que un encabezado se coerciona a parrafo, el enlace deja su
texto y la imagen desaparece. `@tiptap/starter-kit` no esta ni en `package.json` ni en el fuente,
y hay guardia que lo vigila.

**2. El documento producido es el contrato de QC-62, no uno paralelo.** Si.
`RecipeStepFormValue.document` es `RecipeStepDocument`, `buildRecipePayload` copia
`step.document` tal cual y descarta solo la `key` de presentacion. El puente de QC-62 R19
(`textToStepDocument` / `stepDocumentToText`) esta **borrado**, tambien del barrel, y un `grep`
del repo no devuelve ninguna aparicion. El estado de marcado no viaja en ninguno de los dos
sentidos.

**3. Aislamiento de TipTap.** Correcto, y **la guardia T12 muerde de verdad**: se probo creando un
`lib/__probe_guard__.ts` que importaba `Editor` de `@tiptap/core`, y la guardia se puso roja en el
caso «solo los dos archivos que enumera design.md > 7 mencionan @tiptap». El archivo de prueba se
borro y el arbol quedo limpio. `TaskList` y `TaskItem` se importan de
`@tiptap/extension-list/task-list` y `@tiptap/extension-list/task-item`, y hay caso explicito que
prohibe el `./kit` y la raiz del paquete. La guardia ademas se protege del verde por vacuidad
exigiendo mas de 100 archivos recorridos.

**4. `package.json`.** Gana **exactamente nueve** entradas, todas de TipTap fijadas a `3.31.3`,
todas con fila en `docs/dependencias.md` y ninguna como `excepcion`. **De `cn` no queda rastro**:
no esta en `package.json` ni en `pnpm-lock.yaml` (el unico `cn` del lockfile es `shadcn@4.16.2`,
que ya estaba), y los cuatro componentes generados por el CLI —`dialog`, `checkbox`, `toggle` y
`toggle-group`— importan `cn` de `@/lib/utils`. La decision queda subida al leader en la bitacora.

**5. El marcado no se persiste y el asistente no tiene ruta.** Si. Estado en memoria con clave
`paso:bloque:item`, sin almacenamiento ni URL; el asistente se monta **condicionalmente** dentro
del contenido del modal, asi que cerrarlo lo desmonta. La guardia T11 comprueba cuatro cosas
distintas: ninguna `page.tsx` lo monta, `lib/shared/routes.ts` exporta **exactamente** las diez
constantes de hoy, el unico importador es `recipe-form.tsx`, y ni la tabla ni la seccion de
listado lo nombran.

**6. Accesibilidad y tactil.** `min-h-11 min-w-11` en los tres botones de la barra, en las
casillas del asistente y en su navegacion; `text-base` en el area editable; modal con
`max-h-[85dvh]` y scroll interno —ni un `100vh` ni un `h-screen` en todo el diff de codigo—;
motivo del bloqueo como **parrafo visible** asociado por `aria-describedby`, nunca en `title`;
region `aria-live=polite` para el cambio de paso; recorrido completo por tabulador afirmado en
los dos componentes. Nada detras de `:hover`.

**7. Selector de tipo de paso.** Retirado, y el test lo comprueba en **los dos modos** —alta y
edicion— y tambien tras anadir un paso: sin `select`, sin radios, sin `radiogroup` y sin combobox
de tipo; el unico texto «Lista de verificacion» que queda vive dentro del `role=toolbar` del
editor, que produce una construccion dentro del documento y no una clasificacion del paso.

## Hallazgos

### BLOQUEANTE 1 — el E2E de R28 es rojo reproducible en Chromium cuando se corre solo

`e2e/recetas-pasos.spec.ts` **falla 5 de 5 veces** con `--project=chromium` en aislado, y solo
pasa cuando los dos proyectos corren a la vez (2 workers). WebKit en aislado: pasa.

```
Error: expect(locator).toHaveText(expected) failed
Locator: getByTestId(recipe-step-text-0).locator(strong)
Expected: "Mezclar en frio e6edab0f"
strict mode violation: resolvio a 2 elementos:
  1) <strong>Mezclar en frio e6edab0fVerificar temperatura e6e...</strong>
  2) <strong>Verificar presion e6edab0f</strong>
                                        e2e/recetas-pasos.spec.ts:343
```

Lo que dice el DOM del fallo: el texto del **item 1 quedo dentro del mismo nodo de texto** que el
parrafo, y **todo** salio en negrilla. O sea que ni el `ArrowRight` ni el `Enter` de las lineas
322-333 llegaron al area editable, y la marca nunca se apago.

**Por que**, y es la misma causa que el propio implementer documento para el unitario de R27: el
comando `focus()` de TipTap devuelve el foco al area editable **dentro de un
`requestAnimationFrame`**. Tras pulsar el boton de negrilla el foco sigue en el boton durante ese
fotograma, y las teclas que se envian inmediatamente despues las recibe el boton — un `Enter`
sobre un boton enfocado lo **vuelve a activar**, no parte el parrafo. Ademas, la salvaguarda que
apaga la negrilla lee `aria-pressed`, que se actualiza por estado de React (`useEditorState`) y
puede ir un tick por detras de la marca almacenada del editor. Con la maquina cargada —los dos
navegadores a la vez— el fotograma se cuela a tiempo y el test pasa; en aislado, no.

**Es un rojo real, no el flake conocido.** `docs/verification.md > Los flakes de saturacion`
describe el flake como `Test timed out in 5000ms` en un test de UI que escribe con `userEvent`, y
da el criterio para distinguirlo: corre el archivo **solo**; si pasa en aislado y falla en la
suite, es saturacion; **si falla tambien solo, es tuyo**. Aqui es al reves de un flake de
saturacion: falla **precisamente en aislado**, con una asercion de contenido y de forma
determinista, cinco veces de cinco.

**El comportamiento del producto parece correcto** —devolver el foco al texto tras formatear es lo
que fija `design.md > 8`, y el unitario de R27 ya afirma sobre ello—. **Lo que falla es la
prueba**, y con ella la evidencia de R28: hoy R28 esta acreditado por una corrida que solo sale
verde bajo carga, que es exactamente la clase de verde que el arnes no acepta.

**Que falta para cumplirlo:** que el E2E espere **a la condicion** —el area editable con el foco—
despues de cada pulsacion de la barra y antes de mandar teclas, que es el equivalente en
Playwright del `esperarAlFocoDiferidoDelEditor()` que el implementer ya escribio para jsdom; que
apagar la negrilla no dependa de leer un atributo posiblemente rancio; y que se acredite con el
proyecto **corrido solo**, en Chromium y en WebKit, no solo con los dos a la vez.

### menor 1 — `tasks.md` no esta todo en `[x]`

`T15` sigue sin marcar. Es deliberado y esta explicado —exige `./init.sh` completo, que corre el
leader, y hoy no puede salir verde por los 2 errores heredados de `dev`—. Se anota porque
`CHECKPOINTS.md > Especificacion` lo exige antes de `done`.

### menor 2 — `docs/dependencias.md` se reescribio entero a CRLF

El diff del archivo son **79 insertions / 70 deletions** para anadir **nueve filas**: el archivo
paso de LF a CRLF y git lo ve entero cambiado. El contenido esta bien —las nueve filas estan, con
los cuatro checks y la aprobacion citada—, pero el diff deja de ser revisable linea a linea, que
es justo lo que hace util un registro de dependencias. Conviene devolverlo a LF.

### menor 3 — `components/ui/toggle.tsx` y `toggle-group.tsx` entran y no los usa nadie

`design.md > 2.5` los pidio por CLI pensando en la barra de formato, pero la barra final son
botones propios —decision correcta: `aria-pressed` y 44x44 px bajo control—. Un `grep` del repo no
devuelve **ningun** consumidor de esos dos archivos. Es codigo muerto que entra al arbol: o se
usa, o se quita.

### menor 4 — el barrel deja escapar un tipo de la libreria y es un segundo consumidor del esquema

`app/(private)/produccion/formulas/components/index.ts` reexporta `RECIPE_STEP_EXTENSIONS`, cuyo
tipo es `Extensions` de `@tiptap/core`. La guardia no lo ve porque compara el **literal**
`@tiptap` y el barrel no lo escribe. Efecto practico: cualquier archivo puede tocar un tipo de la
libreria a traves del barrel, que es lo que R25 quiere evitar; y `T5` pedia que
`recipe-step-editor.tsx` fuese el **unico consumidor** de `recipe-step-schema.ts`, cosa que el
reexport rompe. `RecipeStepEditor` si tiene sentido en el barrel; la lista de extensiones no.

## No es de QC-64 (anotado, no contado como hallazgo)

- **2 errores de `typecheck` heredados de `dev`**:
  `tests/integration/inventario/list-query-indexes.int.test.ts:77` y
  `tests/integration/pedidos/list-query-orders.int.test.ts:131` (`Property companyId is missing`),
  conflicto semantico entre QC-47 y QC-57 mergeados en paralelo. El reviewer confirma que son
  **exactamente esos dos** y que ninguno toca archivos de esta feature. **El gate completo no
  puede salir verde hasta que se arreglen en `dev`.**
- El patron de hidratacion de `recipe-field-name` en `e2e/recetas.spec.ts` bajo WebKit, que la
  bitacora levanta: es deuda del spec heredado y merece ficha propia.

## Que vuelve al implementer

Solo el **bloqueante 1**. Los menores 2, 3 y 4 son baratos y conviene cerrarlos en la misma
vuelta; el menor 1 lo cierra el leader con el gate.
