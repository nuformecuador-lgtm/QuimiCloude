# QC-232 — componentizacion-formularios-y-acciones · requirements

| key | zona | complexity | rama | depends_on |
|---|---|---|---|---|
| QC-232 | frontend | high | `feature/QC-232-componentizacion-formularios-y-acciones` | QC-231 (mergeada en `dev`) |

**Estado:** borrador del `spec_author` (2026-10-09), pendiente de aprobación humana. Sin
`/afinar-feature`: el alcance sale de la ficha del board, de
`_trabajo/marca/auditoria-componentes.md` (§2.d, 2.e, 2.f, 2.g, 2.m, 2.n, 2.p, §4 y §5, filas 4, 5,
7, 8, 14 y 19) y de lo que QC-231 y QC-233 traspasaron a esta ficha. Quedan abiertas P1–P6.

## Alcance

Es la segunda refactorización de **cero cambio**, como QC-231 y QC-233. Hay **un único** cambio
visible, decidido por el humano: las acciones por fila pasan a ser un menú de tres puntos en todas
las tablas que entran (D3).

Lo que entra:

- **`FormSheet` + `SaveButton` + `useEntitySheet`.**
  - **Qué sustituyen:** los 9 formularios en panel lateral y sus 9 pares `FormActions`/`SaveButton`:
    cliente, presentación, unidad, usuario, grupo de trabajo, producto, pedido, línea de catálogo y
    proveedor.
  - **Qué hace `useEntitySheet`:** abrir y cerrar (controlado o con disparador propio) y, al guardar,
    cerrar, avisar por toast y llamar a `router.refresh()`. Va en los 9 envoltorios `*-sheet`.
  - **Las diferencias reales pasan a ser props:** `canSave`/`busy` (pedido) y `disabled` (grupo de
    trabajo).
- **`ConfirmDialog` y `DeleteConfirmDialog`.**
  - **Qué es la base:** form, action, id oculto, error y pie con «Volver» y confirmar, con su texto
    de pendiente.
  - **Qué es `DeleteConfirmDialog`:** la variante destructiva («Eliminar» / «Eliminando…»).
    Sustituye la plantilla de los 10 `delete-*-dialog`, con el disparador propio (producto, receta,
    línea de catálogo y proveedor) y la variante con transición (receta).
  - **Qué más usa la base:** cancelar pedido (pedidos y asignación), estado de usuario y cerrar
    sesiones.
  - **`ConfirmActionDialog`** se absorbe: sus 3 consumidores de asignación pasan a la base y el
    archivo se borra.
- **Campos: `TextField`, `SelectField` (sobre `SharedSelect`) y `DatePicker`,** con un
  `FieldError` común.
  - **Cuántos son:** unas 9 implementaciones de etiqueta + input + error, los 5 selects de los
    formularios y los 2 selectores de fecha. La lista exacta se cierra en T0
    (`design.md > 2.3`).
- **Acciones por fila.**
  - **Qué cambia:** `RowActionsMenu` en todas las tablas que entran, con una `actionsColumn()` común
    para la columna.
  - **Hoy conviven 3 estilos:** botones de icono (clientes, presentaciones, unidades y grupos), menú
    (usuarios) y render prop (inventario, producto terminado, recetas y catálogo).
- **Listas de asignación, parametrizadas.**
  - **Qué entra:** los conjuntos table, columns, skeleton, empty y section de pedidos asignados, de
    la empresa, terminados y por empacar. Sus vacíos y esqueletos los traspasó QC-231 (D8).
  - **Qué no entra:** el quinto conjunto, acondicionamiento (D4).
- **Traspasos de QC-231** (D9):
  - el `TOUCH_TARGET` local de `step-document-view.tsx`;
  - los alias `EMPTY_CELL` de `product-columns.tsx` y `catalog-columns.tsx`;
  - el `TOUCH_TARGET` de `WorkGroupRowActions`, que se rehace con el menú.
- **Una guardia** que impide volver a copiar estas piezas, con excepciones con nombre.

### Lo que NO entra

- **Archivos en vuelo de Christian (D4).** QC-223, QC-217 y QC-234 declaran en su
  `tasks.md > Archivos esperados` estos archivos de UI, que esta rama **no toca**. Quedan como deuda
  y se migran cuando sus fichas cierren (`design.md > 7`):
  - **Pedidos (QC-223):**
    - `order-row-actions.tsx`, `order-columns.tsx` y `order-table.tsx`. La tabla de pedidos **ya
      usa** `RowActionsMenu`, así que no cambia nada visible. Solo queda pendiente que adopte
      `actionsColumn()`;
    - `order-list-section.tsx` y el barrel `pedidos/components/index.ts`. Por eso no se borran
      `order-list-empty`, `order-list-error`, `order-list-skeleton` ni `OrderRecipeImage`, ni se
      toca `ORDER_CUSTOMER_DIALOG_TOUCH_TARGET`. La enmienda de la guardia de anclas de QC-102
      tampoco entra;
    - `order-delivery-sheet.tsx`, el panel de entrega: es un décimo formulario y no adopta
      `FormSheet`.
  - **Inventario (QC-223):** `inventario/components/batch-history.tsx`.
  - **Asignación (QC-217):**
    - `order-distribution-full.tsx` y el barrel `asignacion/components/index.ts`. Por eso **no se
      mueve `OrderDistributionFull`** a `components/shared/`;
    - los conjuntos `conditioning-orders-*` y `conditioned-orders-*`;
    - `assignment-view-tabs.tsx` y `acondicionamiento/[id]/**`.
  - **Composición (QC-217, QC-223 y QC-234):** `lib/composition/index.ts`. Esta ficha no lo
    necesita.
  - **Tests de otras fichas:** los tests y E2E que declaran como suyos.
    - **De QC-223:** `tests/unit/pedidos-ui/order-row-actions.test.tsx`,
      `tests/guards/guard-identificador-de-request.test.ts` y
      `e2e/entregar-producto-terminado.spec.ts`.
    - **De QC-217:** `tests/unit/pedidos-ui/order-route-contract.test.ts` y
      `e2e/acondicionamiento.spec.ts`.
- **Los buscadores** (QC-233) y **los cambios de marca** (QC-227) (D11).
- **Otros cambios visuales o de comportamiento** (D2). Por ejemplo, unificar las clases de los pies
  de formulario, los textos de «Volver»/«Cancelar» o los anchos de los paneles. Las diferencias de
  hoy pasan a ser props y la unificación es QC-227.
- **Diálogos que no son borrado ni confirmación con form:** `blocked-order-dialog`,
  `propagate-versions-dialog`, `adjust-batch-dialog`, `import-create-unit-dialog`, el `logout` y
  `finish-conditioning-dialog`. Quedan como excepciones con nombre en la guardia.
- **Adoptar `FieldError` en los 57 `<p className="text-sm text-destructive">`** fuera de los campos
  que migran. Es trabajo de QC-227.
- **Los selects no asíncronos especializados:** `RecipeVersionSelect`, `PresentationUnitSelect` y
  `MeasurementUnitSelect`. Pendiente de P4.
- **Las barras de búsqueda de las listas** (QC-233 P5: van con QC-227).

## Decisiones cerradas (no reabrir)

| # | Fecha | Decisión | Requisitos |
|---|---|---|---|
| D1 | 2026-10-08 | La auditoría se reparte en QC-231 (piezas base), QC-232 (formularios, borrados, campos y acciones por fila) y QC-233 (buscadores), todas antes de QC-227 (QC-231 D1) | R6, R11, R16, R20, R27 |
| D2 | 2026-10-08 | **No cambia el comportamiento** ni lo visual, salvo las acciones por fila (ficha QC-232) | R1, R2, R3, R5 |
| D3 | 2026-10-08 | **Acciones por fila: menú de tres puntos (`RowActionsMenu`) en todas las tablas, con una `actionsColumn()` común** (decisión del humano, `progress/features/QC-231.md > Decisiones`; ficha QC-232) | R20, R21, R22, R23, R24, R25 |
| D4 | 2026-10-09 | No se tocan los archivos en vuelo de otra persona: QC-223, QC-217 y QC-234 (Christian). Lo que los exija queda en «Lo que NO entra» y como deuda (regla 1 de `CLAUDE.md`; encargo del leader) | R30, R32 |
| D5 | 2026-10-08 | Ninguna dependencia nueva (ficha QC-232) | R31 |
| D6 | 2026-10-08 | El mismo enfoque de «cero cambio» que QC-231 y QC-233: paridad del árbol accesible congelada antes de tocar producción, E2E en CI y capturas antes/después con el seed demo (QC-230) | R1, R3 |
| D7 | 2026-10-08 | Los tests existentes siguen en verde, con los testids como props donde haga falta (ficha QC-232) | R4, R10, R15, R19, R25 |
| D8 | 2026-10-08 | Los vacíos y esqueletos de las listas de asignación van en QC-232 (QC-231 D7) | R27 |
| D9 | 2026-10-08 | Pasan a QC-232 desde QC-231: el `TOUCH_TARGET` de `step-document-view.tsx` (sin enmendar la lista cerrada R18 de `order-execution-screen.test.tsx`), los alias `EMPTY_CELL` de `product-columns.tsx` y `catalog-columns.tsx`, y `WorkGroupRowActions` (QC-231 D13) | R26, R28 |
| D10 | 2026-10-08 | Los selects no asíncronos son de QC-232, no de QC-233 (QC-233 P5) | R16, R17 |
| D11 | 2026-10-08 | No entran los buscadores (QC-233) ni los cambios de marca (QC-227) (ficha QC-232) | R30 |

## Glosario

- **Pantalla tocada:** toda ruta de `app/` con algún archivo en `tasks.md > Archivos esperados`.
- **Formulario en panel:** cada uno de los 9 de arriba, en sus modos de alta y de edición.
- **Estado de formulario:**
  - **recién abierto**, en alta y en edición;
  - **con error de campo**;
  - **con error general**: catalogado e inesperado;
  - **enviando**: `useFormStatus().pending`;
  - **bloqueado por el consumidor**: `canSave = false`, `busy` o `disabled`, donde aplique.
- **Diálogo de confirmación:**
  - los 10 `delete-*-dialog`: cliente, presentación, unidad, usuario, grupo, producto, pedido,
    receta, línea de catálogo y proveedor;
  - `cancel-order-dialog` (pedidos) y `order-cancel-dialog` (asignación);
  - `user-status-dialog` y `end-user-sessions-dialog`;
  - los 3 usos de `ConfirmActionDialog`: `assigned-order-start-trigger`, `order-execution-screen` y
    `packing-order-screen`.
- **Estado de diálogo:** cerrado (con su disparador, si lo tiene), abierto, enviando y con error
  (catalogado e inesperado).
- **Tabla con acciones:** clientes, presentaciones, unidades, grupos de trabajo, usuarios,
  productos (inventario), producto terminado (inventario), recetas y catálogo de proveedor. La de
  pedidos queda fuera (D4).
- **Acción de fila:** cada control de la celda de acciones que abre un panel, un diálogo o una
  ruta. Por ejemplo: editar, eliminar, lotes y estado de cuenta.
- **Árbol accesible:** el de QC-231, que reutilizan QC-233 y esta ficha. Para cada elemento: su rol
  y su nombre accesible, sus estados ARIA, su `data-testid` y el conjunto de clases de su
  `className`. Incluye los portales.

## Requisitos (EARS)

### Cero cambio

**R1.** El sistema DEBE presentar el **mismo árbol accesible** antes y después de esta feature:
- en cada formulario en panel y en cada estado de formulario;
- en cada diálogo de confirmación y en cada estado de diálogo;
- en cada campo migrado;
- en cada estado de lista de las listas de asignación que entran.

La **única** excepción es la celda de acciones de las tablas con acciones y lo que pinta el menú
(R20–R24).

**R2.** El sistema DEBE conservar el comportamiento de cada pantalla tocada:
- qué Server Action se llama y qué viaja en el `FormData`, incluidos los ids ocultos;
- cuándo se cierra un panel o un diálogo, y que con error sigue abierto;
- el texto del toast y la llamada a `router.refresh()` con la misma URL;
- qué se anuncia a la tecnología de asistencia y dónde queda el foco;
- que «Cancelar» y «Volver» nunca envían el formulario.

**R3.** Por cada pantalla tocada DEBE existir una captura «antes», hecha antes de tocar código de
producción, y una «después» de la misma pantalla, en el mismo estado y con los datos del seed demo
(QC-230).
- **Qué se fotografía:** el formulario abierto, el diálogo de borrado abierto y, en las tablas con
  acciones, la fila con su celda de acciones.
- **En la «después» de las tablas:** además, el menú abierto.
- **Qué deja el reviewer:** constancia de que las parejas no difieren salvo en la celda de acciones.

**R4.** Los tests que ya existen DEBEN seguir pasando **sin cambiar lo que afirman**. Solo se admiten
estas tres ediciones, y cada una se anota en el impl:
- **(a) repuntar un import** a la pieza compartida, con las mismas aserciones y los mismos
  `data-testid`;
- **(b) abrir el menú de la fila** antes de pulsar una acción de fila (R25);
- **(c) regenerar los snapshots de paridad de QC-231** de las pantallas con tabla con acciones,
  solo por la celda de acciones (R24).

**R5.** Cada componente de ruta que migra DEBE conservar su nombre, sus props y sus exports
(componentes, tipos y constantes, incluidos los `*_TESTID`). Ningún barrel de ruta que esté en
«Lo que NO entra» DEBE necesitar cambiar para seguir compilando.

### Formularios en panel

**R6.** El sistema DEBE pintar los 9 formularios en panel con **un único** componente compartido,
`FormSheet`, que compone el `SheetContent` en modo formulario:
- cabecera con título y descripción;
- cuerpo con scroll;
- pie fijo con el margen de `safe-area` de hoy, con «Cancelar» y `SaveButton`.

**R7.** CUANDO se pulsa «Cancelar», `FormSheet` DEBE cerrar el panel sin enviar el formulario.

**R8.** MIENTRAS el formulario se está enviando, `SaveButton` DEBE estar deshabilitado, con
`aria-busy` y el texto de pendiente. Fuera de ese estado DEBE mostrar el texto de guardar. Los textos
de hoy son «Guardando…» y «Guardar».

**R9.** Estas diferencias de hoy DEBEN pasar a ser props de `FormSheet`, con el mismo resultado que
hoy:
- **en el pedido:** DONDE el consumidor pase `busy`, `SaveButton` DEBE tratarlo como envío en curso
  (deshabilitado, `aria-busy` y «Guardando…»). DONDE pase `canSave = false`, DEBE estar
  deshabilitado sin texto de pendiente;
- **en el grupo de trabajo:** DONDE el consumidor pase `disabled`, `SaveButton` DEBE estar
  deshabilitado;
- **marcado por sitio:** los `data-testid`, las clases y la envoltura del pie DEBEN poder pasarse
  por props.

**R10.** Cada formulario en panel DEBE conservar sus `data-testid` (panel, form, campos, errores,
cancelar y guardar), que se pasan a `FormSheet` por props.

**R11.** Los 9 envoltorios de panel DEBEN delegar en `useEntitySheet` la apertura y el guardado:
- **apertura:** controlada con `open`/`onOpenChange`, o con el disparador propio cuando no se pasa
  `open`;
- **CUANDO se guarda con éxito:** cerrar, mostrar el toast de éxito del modo (alta o edición) y
  llamar a `router.refresh()`, en ese orden.

### Diálogos de confirmación

**R12.** El sistema DEBE pintar los diálogos de confirmación con **una única** base compartida,
`ConfirmDialog`.
- **Con form:** form, Server Action, id oculto, región de error con `ErrorAlert`, y pie con el
  botón de salida y el de confirmar.
- **Sin form:** solo el `onConfirm`, que es la forma de hoy de `ConfirmActionDialog`.

`DeleteConfirmDialog` DEBE ser su variante destructiva.

**R13.** MIENTRAS la confirmación se está enviando, el botón de confirmar DEBE estar deshabilitado,
con `aria-busy` y su texto de pendiente. En los borrados es «Eliminando…».

**R14.** Estos tres casos DEBEN conservar lo que hacen hoy:
- **SI la Server Action responde con error,** el diálogo DEBE seguir abierto y pintar el error en su
  región, por su `code`;
- **CUANDO responde con éxito,** DEBE cerrar, mostrar el toast y llamar a `router.refresh()`, en el
  orden de hoy;
- **sin `form`,** al confirmar DEBE cerrarse antes de llamar a `onConfirm`.

**R15.** Cada diálogo DEBE conservar sus `data-testid`, sus textos (título, descripción, salida,
confirmar y pendiente) y sus dos formas de apertura:
- **controlada**, desde la fila o el padre;
- **con disparador propio:** producto, receta, línea de catálogo y proveedor.

La variante con transición de la receta DEBE conservar su forma de envío.

### Campos

**R16.** El sistema DEBE ofrecer `TextField`, `SelectField` y `DatePicker` compartidos.
- **Qué pinta cada uno:** la etiqueta, el control, la ayuda si la hay y el error del campo.
- **Cómo se enlazan:** con `htmlFor`/`id`, `aria-invalid` y `aria-describedby`, como hoy.
- **`SelectField`:** DEBE construirse sobre `SharedSelect`.

**R17.** Las implementaciones locales de la lista cerrada de T0 (`design.md > 2.3`) DEBEN delegar en
esas piezas. Cada sitio DEBE conservar por props lo que hoy lo distingue:
- el `name` y el `defaultValue`;
- `inputMode` y `required`;
- los `data-testid`;
- las clases;
- el `key` de remontaje.

**R18.** SI un campo tiene error, ENTONCES DEBE pintarlo con `role="alert"` y el id que referencia su
`aria-describedby`. SI no lo tiene, ENTONCES NO DEBE pintar nada en su lugar.

**R19.** Cada campo migrado DEBE conservar lo que viaja en el `FormData`, incluidos los inputs
ocultos de los selects y de las fechas.

### Acciones por fila (el único cambio visible, D3)

**R20.** En cada tabla con acciones, la celda de acciones DEBE ser **un único** disparador de
`RowActionsMenu`:
- con un nombre accesible que nombra la fila;
- con el objetivo táctil de 44×44 px;
- siempre en el DOM y sin depender de `:hover`.

Ese disparador abre un menú con **las mismas acciones de hoy y en el mismo orden**.

**R21.** CUANDO se elige una acción del menú, el sistema DEBE abrir el **mismo** panel o diálogo, o
navegar a la **misma** ruta, que abre hoy el control equivalente.
- **Los paneles y diálogos** siguen siendo los mismos y con los mismos `data-testid`.
- **Los enlaces** (la edición de receta) DEBEN seguir siendo enlaces, con su `href`.

**R22.** SI la sesión no tiene el permiso que hoy oculta las acciones, ENTONCES la celda NO DEBE
pintar nada: ni disparador ni menú vacío. SI una acción hoy está deshabilitada, ENTONCES su item
DEBE estar deshabilitado.

**R23.** Cada item del menú DEBE llevar el `data-testid` del control equivalente de hoy. Ejemplos:
`customer-action-edit`, `product-delete-open` y `recipe-edit-open`. El disparador DEBE llevar el
`data-testid` del contenedor de hoy donde lo hubiera, como `customer-row-actions`, y el atributo
`data-*` que identifica la fila.

**R24.** La columna de acciones de cada tabla con acciones DEBE declararse con `actionsColumn()`.
Cada tabla DEBE conservar el `id`, la etiqueta, la alineación y el anclado de su columna, porque los
lee la tabla compartida. Solo DEBE cambiar el contenido de la celda (R20).

**R25.** Los tests y E2E que pulsan una acción de fila DEBEN pasar a abrir antes el menú:
- en E2E, con `e2e/helpers/row-actions-menu.ts`;
- en unit, con un helper equivalente.

Sus aserciones sobre el panel o diálogo abierto NO DEBEN cambiar (R4 b).

### Listas de asignación y traspasos

**R26.** Ningún archivo de producción de la lista de `design.md > 6` DEBE conservar un `TOUCH_TARGET`
local ni un alias `EMPTY_CELL`. Usan `touchTarget` / la talla `touch` y `EMPTY_MARK` de QC-231. Los
consumidores del alias pasan a importar `EMPTY_MARK`.

**R27.** Los conjuntos de pedidos asignados, de la empresa, terminados y por empacar DEBEN pintar su
vacío, su esqueleto y su sección con piezas parametrizadas comunes.
- **Las piezas comunes:** `EmptyState` y `TableSkeleton` de QC-231, más las piezas de asignación de
  `design.md > 5`.
- **Qué conservan:** sus exports, sus `data-testid` y su árbol accesible en cada estado de lista
  (R1, R5).

### Guardia, alcance y cierre

**R28.** Una guardia DEBE fallar cuando un archivo de producción de `app/` o `components/`:
- declara un botón de envío con `useFormStatus` fuera de `FormSheet` y de los `SubmitButton`
  compartidos;
- compone un `AlertDialog` con `AlertDialogAction` fuera de `ConfirmDialog`;
- pinta acciones de fila fuera de `RowActionsMenu` en un archivo `*-columns`, `*-row-actions` o
  `*-table`;
- reintroduce `ConfirmActionDialog`.

Sus excepciones DEBEN ser una lista explícita de archivos, cada uno con su motivo. Cada regla DEBE
tener una muestra que muerde. Las excepciones de `guard-piezas-base` que citan QC-232 y esta rama
resuelve DEBEN retirarse.

**R29.** Cada excepción que siga citando QC-232 al cerrar, en esta guardia o en `guard-piezas-base`,
DEBE quedar anotada en `progress/deudas.md`, con su archivo, su motivo y la ficha que la resuelve.

**R30.** El diff de la rama NO DEBE tocar:
- los archivos de «Lo que NO entra» de QC-223, QC-217 y QC-234;
- los buscadores de QC-233 ni `components/shared/async-autocomplete.tsx`;
- `app/(public)/**`.

**R31.** El diff NO DEBE añadir ninguna dependencia a `package.json` (D5).

**R32.** `node scripts/archivos-en-vuelo.mjs --candidata QC-232` NO DEBE dar `CHOCA` con ninguna
feature en vuelo cuando el spec se aprueba, ni cuando se pide el merge.

## Preguntas abiertas

**P1. Choque real con QC-223 y QC-217: este agente no ha podido leer sus ramas.**
- **Qué pasa:** sin shell, no he podido correr `git diff origin/dev...origin/<rama>` de
  `feature/QC-223-*`, `feature/QC-217-*` ni `feature/QC-234-*`. He usado sus
  `tasks.md > Archivos esperados` (en `dev`) y la lista D11 de QC-231.
- **Lo que sí consta:**
  - QC-234 apunta a `aa0b7d45`, que ya está en `dev`;
  - QC-223 está mergeada en `dev` (#190);
  - su lista D11 del 2026-10-08 incluía `pedidos/components/order-sheet.tsx`.
- **Qué se pide:** el leader corre `node scripts/archivos-en-vuelo.mjs --candidata QC-232` y los tres
  `git diff --name-only` antes de aprobar.
- **Si `order-sheet.tsx`, `order-form.tsx`, `delete-order-dialog.tsx` o `cancel-order-dialog.tsx`
  aparecen en el diff de QC-223,** salen de esta ficha: el pedido no adopta `FormSheet` ni
  `ConfirmDialog`, y se anota como deuda. ¿De acuerdo?

**P2. Nombres accesibles de las acciones en el menú.** Hoy cada botón de icono se llama, por
ejemplo, «Editar el cliente Ana Torres». En usuarios, el humano decidió el 2026-10-04 que los items
digan solo el verbo («Editar») y que el disparador nombre la fila («Acciones de Ana Torres»).
- **Propuesta:** la misma regla en todas las tablas.
- **Qué cuesta:** los tests que buscan por el nombre largo cambian de consulta, además de abrir el
  menú. Eso amplía la excepción R4 (b).
- **La alternativa:** conservar el nombre largo como texto del item. No hace falta tocar
  `RowActionsMenu`, pero el menú se ve más largo.

¿Cuál?

**P3. Si no da el tiempo hoy, ¿qué sale primero?** El orden propuesto en `tasks.md` deja para el
final las listas de asignación (R27) y los traspasos de QC-231 (R26). Son los candidatos a pasar a
deuda sin perder el resto. ¿Se confirma ese orden de corte?

**P4. Los selects no asíncronos especializados** (`RecipeVersionSelect`, `PresentationUnitSelect` y
`MeasurementUnitSelect`). QC-233 P5 los manda a QC-232, pero la ficha solo cuenta «5 selects», que
son los de los formularios.
- **Propuesta:** quedan fuera hoy y se anotan como deuda.
- **¿Entran?** Si entran, delegan en `SelectField` con el mismo criterio de R17.

**P5. `step-document-view.tsx` y la lista cerrada R18 de `order-execution-screen.test.tsx`.** D9
dice que se migra «sin enmendar» esa lista. SI quitar su `TOUCH_TARGET` local obliga a tocar ese
test, ¿se enmienda la lista o el archivo pasa a deuda?
- **Propuesta:** pasa a deuda y no se toca el test.

**P6. El `DatePicker` del filtro de la tabla** (`components/shared/data-table/data-table-filter-date.tsx`).
- **Por qué se pregunta:** es una barra de filtro, no un campo de formulario, y las barras de las
  listas quedaron para QC-227 (QC-233 P5).
- **¿Entra en el `DatePicker` común o se queda?** La propuesta es que entre, porque la auditoría
  cuenta 2 selectores de fecha y este es uno de ellos.
