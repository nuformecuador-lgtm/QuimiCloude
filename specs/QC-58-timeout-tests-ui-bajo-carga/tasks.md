# QC-58 — timeout-tests-ui-bajo-carga · tasks.md

Convenciones: `[P]` = paralelizable con las otras `[P]` **del mismo bloque**. Cada task lista los
**archivos que toca** con su ruta exacta desde la raíz del worktree: el leader los usa para la
validación de conflicto de `AGENTS.md > Paralelismo`, así que si una task acaba tocando un archivo
que no está listado, se anota antes de seguir.

Ninguna task de esta ficha toca `app/`, `lib/`, `components/`, `db/` ni el middleware (R17). Si
alguna acaba necesitándolo, es señal de que el alcance se rompió: se para y se pregunta.

---

## Bloque A — Configuración y helper

### [x] T1. `testTimeout: 15_000` en los tres proyectos de Vitest
- Dep: ninguna.
- Archivos: `vitest.config.mts`.
- Dentro del bloque `test` de **cada** proyecto (`ui`, `node`, `integration`), nunca en la raíz
  (`design.md > 1`). Comentario corto remitiendo a
  `docs/verification.md > Los flakes de saturación`.
- **No se toca** `maxWorkers` ni `fileParallelism` (R4).
- **Hecho cuando:** los tres proyectos declaran el valor, `pnpm run typecheck` pasa y
  `pnpm test tests/guards` sigue corriendo sin error de configuración.
- Cubre: R1, R4.

### [x] T2. [P] Crear el helper compartido de escritura
- Dep: ninguna.
- Archivos: `tests/helpers/user-event.ts` (nuevo).
- `setupUser(): UserEvent` sobre `userEvent.setup({ delay: null })`, **sin parámetros**
  (`design.md > 2`). El comentario que hoy vive en `tests/unit/recetas-ui/recipe-form.test.tsx:191-200`
  se **muda** aquí: qué quita `delay: null`, que la secuencia de eventos que recibe el DOM es
  idéntica y que no se relaja ninguna comprobación de `user-event` (incluida `pointer-events`).
- **Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` pasan, y el archivo **no** es recogido
  como suite por ningún proyecto (no lleva `.test.`).
- Cubre: R5.

### [x] T3. [P] Declarar la excepción del rebote en `async-autocomplete`
- Dep: ninguna (independiente de T2; se puede hacer antes o después).
- Archivos: `tests/unit/async-autocomplete.test.tsx`.
- Conserva su `userEvent.setup({ delay: 20 })`. Sólo se amplía el comentario para dejar dicho que
  es una **excepción deliberada** a la forma compartida de teclear, que los 20 ms son el sujeto de
  la prueba (rebote de 250 ms) y que está listada por nombre en la guardia de T6.
- **No** se reescribe con relojes falsos.
- **Hecho cuando:** el archivo pasa entero en aislado y el comentario nombra la guardia.
- Cubre: R8.

---

## Bloque B — Migración mecánica de los 33 archivos

Dep de todo el bloque: **T2**. Las seis tasks son `[P]` entre sí: tocan carpetas disjuntas y
ninguna comparte archivo con otra. Criterio común de «hecho»: cero llamadas a `userEvent.setup(`
en la carpeta, el archivo importa `setupUser` de `tests/helpers/user-event`, `pnpm run lint` pasa
(caza los imports de `@testing-library/user-event` que queden huérfanos) y **los archivos de la
carpeta pasan en aislado con el mismo número de casos que antes** — el conteo previo se anota antes
de tocar nada, es lo que verifica R9.

> El conteo exacto de llamadas se reconfirma con un `grep` al empezar cada task; lo que fija el
> criterio no es el número sino que queden **cero** fuera del helper y de la excepción de T3.

### [x] T4a. [P] `tests/unit/` (raíz) — 7 archivos
- Archivos: `tests/unit/app-sidebar.test.tsx`, `tests/unit/credential-field.test.tsx`,
  `tests/unit/login-form.test.tsx`, `tests/unit/nav-user.test.tsx`,
  `tests/unit/sidebar-ajuste.test.tsx`, `tests/unit/sidebar-desktop.test.tsx`,
  `tests/unit/sidebar-mobile.test.tsx`.
- **`tests/unit/async-autocomplete.test.tsx` NO entra aquí**: es la excepción de T3.
- Cubre: R6, R9.

### [x] T4b. [P] `tests/ui/` — 1 archivo
- Archivos: `tests/ui/login-form-uncontrolled-warning.test.tsx`.
- Cubre: R6, R9.

### [x] T4c. [P] `tests/unit/shared/` — 5 archivos
- Archivos: `tests/unit/shared/data-table-filter-date.test.tsx`,
  `tests/unit/shared/data-table-filters.test.tsx`,
  `tests/unit/shared/data-table-header-menu.test.tsx`,
  `tests/unit/shared/data-table-pagination.test.tsx`,
  `tests/unit/shared/data-table-viewport.test.tsx`.
- **DESBLOQUEADA Y CERRADA (2026-09-08).** El fallo intermitente de `data-table-pagination.test.tsx`
  (~1 de cada 3, `pointer-events: none` sobre `data-table-page-size-<n>`) se resolvió con la
  **decisión cerrada n.º 9**: el test espera explícitamente a que la opción deje de tener
  `pointer-events: none` antes de pincharla (`findByTestId` + `waitFor`). **No se relajó ni se borró
  ninguna aserción** y el archivo no salió de la migración. R9 se reformuló en `requirements.md`
  para recoger que esto es un cambio deliberado, no un incumplimiento.
- Cubre: R6, R9.

### [x] T4d. [P] `tests/unit/pedidos-ui/` — 8 archivos
- Archivos: `cancel-order-dialog`, `delete-order-dialog`, `order-form`, `order-row-wiring`,
  `order-sheet`, `order-table`, `pedidos-viewport`, `recipe-picker` (todos `.test.tsx` bajo
  `tests/unit/pedidos-ui/`).
- **Ojo:** esa carpeta tiene cambios sin commitear de otra sesión en el árbol principal. Se trabaja
  sólo en este worktree y no se revierte nada con `git checkout`.
- **BLOQUEADA (2026-09-08).** La migración mecánica está hecha (cero `userEvent.setup(` y 149
  casos, los mismos que antes), pero `data-table-pagination.test.tsx` pasó a fallar de forma
  **intermitente** (~1 de cada 3 en aislado) con `Unable to perform pointer interaction as the
  element has 'pointer-events: none'` en `data-table-page-size-25`. El archivo original pasa 5/5.
  Es la misma causa que T4e: ver el bloqueo escrito en la bitácora. **Nota (2026-09-08):** ese
  archivo pertenece a **T4c**, no a esta task —la nota se escribió en la casilla equivocada—, y ahí
  queda anotado cómo se resolvió. Ningún archivo de `pedidos-ui/` estuvo afectado.
- Cubre: R6, R9.

### [x] T4e. [P] `tests/unit/proveedores-ui/` — 5 archivos
- Archivos: `catalog-line-sheet`, `delete-catalog-line-dialog`, `supplier-detail-page`,
  `supplier-page`, `unit-select` (todos `.test.tsx` bajo `tests/unit/proveedores-ui/`).
- Dos de estos tres archivos rojos del baseline salen de aquí: al terminar la task se corren
  `catalog-line-sheet` y `supplier-page` **solos** y se anota el resultado, que es la línea base
  para T9. **Hecho: 50/50 en verde**, que es exactamente lo que el baseline decía de esos dos.
- **DESBLOQUEADA Y CERRADA (2026-09-08).** El fallo determinista de `unit-select.test.tsx`
  (`pointer-events: none` sobre `unit-option-none` y sobre la primera `unit-option`) se resolvió con
  la **decisión cerrada n.º 9**, igual que T4c: los dos casos que pinchan una opción esperan
  explícitamente a que deje de tener `pointer-events: none`. **No se relajó ni se borró ninguna
  aserción**, no se añadió ninguna excepción a la guardia y el archivo sigue migrado a `setupUser()`.
  Conteo intacto: 9 casos antes y 9 después.
- Cubre: R6, R9.

### [x] T4f. [P] `tests/unit/recetas-ui/` + `tests/unit/inventario/` — 6 archivos
- Archivos: `tests/unit/recetas-ui/recipe-form.test.tsx`,
  `tests/unit/recetas-ui/recipe-lines-unavailable.test.tsx`,
  `tests/unit/recetas-ui/recipe-page.test.tsx`,
  `tests/unit/recetas-ui/recipe-step-editor.test.tsx`,
  `tests/unit/recetas-ui/step-reader.test.tsx`,
  `tests/unit/inventario/product-page.test.tsx`.
- **`recipe-form.test.tsx` es especial:** define hoy su propio `setupUser` local con el comentario
  largo. Se **borra la definición local** (el comentario ya vive en el helper por T2) y se deja el
  import. Es el precedente que la decisión n.º 3 manda promover, no un duplicado que convivir.
- Cubre: R6, R9.

---

## Bloque C — La guardia, y probar que muerde

### [x] T5. Cerrar la migración con un `--rapido`
- Dep: T1, T2, T3, T4a–T4f.
- Archivos: ninguno (verificación).
- **Hecho cuando:** `./init.sh --rapido` termina en verde. Si no, se arregla antes de escribir la
  guardia: una guardia escrita sobre un árbol a medias mide otra cosa.
- **Hecho el 2026-09-08**, después de aplicar la decisión n.º 9: `SALIDA=0`, 34 archivos y 454 casos
  del grafo del cambio en verde + las 21 guardias (204 casos). Salida pegada en la bitácora.

### [x] T6. Escribir la guardia `guard-teclear-y-plazo`
- Dep: T5.
- Archivos: `tests/guards/guard-teclear-y-plazo.test.ts` (nuevo).
- Dos mitades (`design.md > 3`):
  - **Plazo:** importa `vitest.config.mts` y **lee la config**, no el texto. Falla si algún
    proyecto declarado no llega a 15000 ms —nombrándolo— y falla si falta alguno de los tres
    nombres conocidos (`ui`, `node`, `integration`).
  - **Teclear:** recorre `tests/**` buscando `userEvent.setup(`; permitidos exactamente
    `tests/helpers/user-event.ts`, `tests/unit/async-autocomplete.test.tsx` y el propio archivo de
    la guardia. Cualquier otro falla nombrándolo y diciendo qué importar.
- Patrón, helpers de lectura y normalización de rutas Windows/Linux: copiar de
  `tests/guards/guard-editor-aislado.test.ts`.
- **Hecho cuando:** la guardia pasa en verde y `pnpm run test:guardias` la selecciona (o sea, entra
  sola en `./init.sh --rapido`).
- Cubre: R2, R7.

### [x] T7. Probar que la guardia MUERDE
- Dep: T6. **Bloqueante: sin esta task, T6 no cuenta como hecha.**
- Archivos: ninguno de forma permanente (se muta y se restaura).
- Las cuatro mutaciones de `design.md > 3.3`, una a una: quitar `testTimeout` de `node`; bajarlo a
  5000 en `ui`; renombrar el proyecto `integration`; meter un `userEvent.setup()` en un archivo ya
  migrado.
- **Restaurar desde una copia (`cp`), nunca con `git checkout`**: el worktree tiene cambios sin
  commitear que no son de esta ficha.
- **No pipear la corrida a `head`/`tail` para leer el código de salida**: redirigir a archivo y
  leer `$?` (`docs/verification.md > Trampas conocidas`).
- **Hecho cuando:** las cuatro salen en rojo con mensaje que nombra lo que falla, el árbol queda
  idéntico al de antes (`git status` sin residuos) y las cuatro salidas están pegadas en la
  bitácora.
- Cubre: R2, R7 (la mitad que importa de los dos).

### [x] T8. Sonda de ejecución del plazo en los tres proyectos
- Dep: T1. Puede ir en paralelo con T6/T7 si no se cruzan archivos.
- Archivos: tres archivos **temporales** (`tests/unit/_sonda-plazo.test.tsx`,
  `tests/_sonda-plazo.test.ts`, `tests/integration/_sonda-plazo.int.test.ts`), que se **borran** al
  terminar.
- Cada uno con un único test que espera ~7000 ms y pasa: por encima del plazo viejo y por debajo
  del nuevo. Es lo que distingue «el número está escrito» de «el número rige».
- **Hecho cuando:** los tres pasan, la salida está en la bitácora con el comando para repetirlas, y
  los tres archivos ya no existen (`git status` limpio).
- Cubre: R3.

---

## Bloque D — Baseline y rastro escrito

### [x] T9. Limpiar y corregir `tests/baseline-rojos.json`
- Dep: T5 (la migración tiene que estar dentro; si no, se retiran entradas de un rojo aún vivo).
- Archivos: `tests/baseline-rojos.json`.
- Retirar las **tres** de esta causa: `tests/unit/inventario/product-page.test.tsx`,
  `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`,
  `tests/unit/proveedores-ui/supplier-page.test.tsx`.
- Conservar las **dos** estructurales. Reescribir el `motivo` de
  `tests/unit/recetas-ui/recipe-route-contract.test.ts`: hoy dice que falla por el rango vacío de
  `git diff origin/dev...HEAD` y **eso no es cierto** — falla por la migración de QC-35 que sí
  aparece en el diff. Conservar la nota de coste aceptado y la salida pendiente. **No tocar el
  `desde`**: la deuda es la misma, lo que estaba mal era la explicación.
- **Hecho cuando:** el archivo tiene exactamente dos entradas, las dos con `motivo` y `desde`, y
  `node scripts/comparar-baseline-rojos.mjs` sobre un reporte de corrida no protesta por formato.
- Cubre: R10, R11, R12.

### [x] T10. [P] Actualizar `docs/verification.md`
- Dep: T9.
- Archivos: `docs/verification.md`.
- Dos sitios (`design.md > 6`): el cierre de `> Los flakes de saturación`, que pasa de «tiene ficha
  propia» a hecho en QC-58 con fecha y con qué consistió; y el `> Estado en QuimiCloude (2026-09-04)`
  de «Rojos heredados», que pasa de cinco entradas a dos.
- **La tabla de `--maxWorkers` se conserva entera.** Borrarla sería el error más caro de esta
  ficha: existe para que el siguiente no recorra ese callejón.
- **Hecho cuando:** ninguna frase de ese documento sigue prometiendo un arreglo pendiente que ya
  entró, y ningún número de entradas del baseline contradice a `tests/baseline-rojos.json`.
- Cubre: R16.

---

## Bloque E — La prueba y el cierre

### [ ] T11. Cinco corridas seguidas de la batería completa
- Dep: **todo lo anterior**. Es la última task de trabajo.
- Archivos: ninguno (verificación).
- Cinco `./init.sh` completos, seguidos. Las cinco sin ningún archivo de test en rojo fuera del
  baseline y sin aviso de «por limpiar» sobre las dos entradas que quedan.
- **Una corrida verde no cuenta como prueba.** Este criterio existe porque una corrida afortunada
  con `--maxWorkers=2` ya llevó una vez a dar por bueno un arreglo que no lo era.
- SI aparece la colisión de correlativo de `order-repository.int.test.ts` («Ya existe la llave
  (order_year, order_sequence)»): esa corrida **no cuenta**, se anota atribuida a **QC-77**, no se
  arregla aquí y **no** se añade al baseline. Se repite la corrida.
- **Hecho cuando:** hay cinco corridas limpias consecutivas con su salida en la bitácora.
- Cubre: R13, R15.

### [ ] T12. Bitácora, trazabilidad y comprobación de alcance
- Dep: T11.
- Archivos: `progress/impl_QC-58-timeout-tests-ui-bajo-carga.md`, `progress/current.md`.
- Contiene: el mapa **`R<n> → test`** de los 18 requisitos (`CHECKPOINTS.md > Trazabilidad`); las
  cuatro salidas rojas de T7; la salida de las tres sondas de T8; el comando, la fecha y la salida
  del comparador de baseline de **cada una** de las cinco corridas de T11 (R14).
- Comprobación de alcance (R17): `git diff --name-only origin/dev...HEAD` no contiene **ninguna**
  ruta bajo `app/`, `lib/`, `components/` ni `db/`. Se pega la lista completa de archivos tocados.
- Anotar explícitamente que **no hay E2E** en esta ficha y el motivo (R18): no cambia ningún
  comportamiento de la aplicación, sólo cómo se ejecutan sus pruebas.
- **Hecho cuando:** ningún `R<n>` queda sin test o sin evidencia nombrada, y el diff no tiene
  archivos de producción.
- Cubre: R14, R17, R18.

---

## Mapa rápido task → requisito

| Task | Requisitos |
| --- | --- |
| T1 | R1, R4 |
| T2 | R5 |
| T3 | R8 |
| T4a–T4f | R6, R9 |
| T5 | — (puerta) |
| T6, T7 | R2, R7 |
| T8 | R3 |
| T9 | R10, R11, R12 |
| T10 | R16 |
| T11 | R13, R15 |
| T12 | R14, R17, R18 |
