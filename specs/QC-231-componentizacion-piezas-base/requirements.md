# QC-231 — componentizacion-piezas-base · requirements

| key | zona | complexity | rama | depends_on |
|---|---|---|---|---|
| QC-231 | frontend | medium | `feature/QC-231-componentizacion-piezas-base` | QC-230 (D14) |

**Estado:** spec aprobado por el humano el 2026-10-08, con D11–D14.

## Alcance (issue QC-231, acotado por el humano el 2026-10-08)

Es una refactorización. Extrae a piezas compartidas lo que hoy está copiado en muchos sitios, y
**no cambia nada visual ni de comportamiento**: el rediseño es QC-227.

- **Talla táctil (44 px).** `Button` y `buttonVariants` ganan la talla, y para los controles que no
  son `Button` hay **una** constante compartida. Se borran las constantes `TOUCH_TARGET` locales y
  los literales `min-h-11 min-w-11`.
- **`ErrorAlert`:** la alerta con la rama de error inesperado.
- **Estados de lista.**
  - Hay tres piezas compartidas: `EmptyState`, `ErrorState` (con «Reintentar») y `TableSkeleton`.
  - La `DataTable` pinta ella misma cargando, error y vacío sin búsqueda, sustituyendo a toda la
    tabla.
  - Se borran los `*-list-empty`, `*-list-error` y `*-skeleton` locales de las listas que adoptan
    la tabla, y se sustituye `RecipeListError`.
- **`Spinner`:** los 9 cargadores.
- **Fecha y marca de ausente:** `formatCivilDate` / `DateCell` y una sola `EMPTY_MARK`.
- **`SubmitButton`:** uno compartido, con talla táctil, para el login y para establecer contraseña
  (D12).
- **`EntityImage`:** gana `size`, y `OrderRecipeImage` pasa a delegar en él (D11).
- **Limpieza:** se borran `createUrlPageFetcher` y los exports muertos de `app/` que enumera R31.

### Archivos D11: fuera de QC-231, los adopta QC-232

Chocan con features en vuelo de otra persona (regla 1 de `CLAUDE.md`). Esta rama **no los toca**.
Toda adopción de piezas que los exija queda para QC-232.

- **QC-217:**
  - `app/(private)/asignacion/acondicionamiento/[id]/components/conditioning-order-screen.tsx`
  - `app/(private)/asignacion/components/assignment-view-tabs.tsx`
  - `app/(private)/asignacion/components/conditioned-orders-list-section.tsx`
  - `app/(private)/asignacion/components/conditioning-orders-columns.tsx`
  - `app/(private)/asignacion/components/conditioning-orders-list-section.tsx`
  - `app/(private)/asignacion/components/index.ts`
  - `app/(private)/asignacion/components/order-distribution-full.tsx`
  - `tests/unit/asignaciones-ui/conditioning-orders-list-section.test.tsx`
- **QC-223:**
  - `app/(private)/inventario/components/batch-history.tsx`
  - `app/(private)/pedidos/components/index.ts`
  - `app/(private)/pedidos/components/order-columns.tsx`
  - `app/(private)/pedidos/components/order-list-section.tsx`
  - `app/(private)/pedidos/components/order-sheet.tsx`
  - `app/(private)/pedidos/components/order-table.tsx`

**Lo que esto deja fuera, y pasa a QC-232:**
- **La lista de pedidos no adopta los estados de la `DataTable`.** Sus `order-list-empty`,
  `order-list-error` y `order-list-skeleton` siguen existiendo, porque el barrel los exporta. Pasan
  a delegar en `EmptyState`, `ErrorAlert`/`ErrorState` y `TableSkeleton` sin cambiar su firma. Se
  borran en QC-232.
- **`OrderRecipeImage` sigue existiendo**, porque lo exporta el barrel de pedidos, pero delega en
  `EntityImage size="fill"`. Se borra en QC-232.
- **`AssignedOrdersError` sigue existiendo**, porque lo exporta el barrel de asignación, pero delega
  en `ErrorState`. Se sustituye en las secciones y se borra en QC-232.
- **La talla táctil, `formatCivilDate` y `EMPTY_MARK` no se aplican en los archivos D11.** Eso
  incluye `MISSING_VALUE_MARK` de `order-columns.tsx`, su fecha, y la constante táctil de
  `order-sheet.tsx` y de `batch-history.tsx`.

### Lo que NO entra
- **La credencial (D3).** No se tocan `components/shared/credential-field.tsx`,
  `components/shared/credential-requirements.tsx` ni nada de `app/(public)/establecer-contrasena/**`,
  con **una sola** excepción: `components/submit-button.tsx` (D12).
- **Los vacíos y esqueletos de las 5 listas de asignación:** van en QC-232 (D7).
- **Los archivos D11:** van en QC-232 (D11).
- **`UserStatusBadge` y `WorkGroupRowActions`:** se rehacen en QC-227 y QC-232 (D13).
- **Formularios en Sheet, borrados, campos y acciones por fila:** QC-232.
- **Buscadores:** QC-233.
- **Cambios visuales:** QC-227 (D6).
- **Las copias de `toISOString().slice(0, 10)` en `lib/modules/**`:** `domain/` no importa
  `lib/shared/`.

## Decisiones cerradas (no reabrir)

| # | Fecha | Decisión | Requisitos |
|---|---|---|---|
| D1 | 2026-10-08 | La auditoría se reparte en QC-231 (piezas base), QC-232 (formularios, borrados, campos y acciones) y QC-233 (buscadores), todas antes de QC-227 | R30, R33 |
| D2 | 2026-10-08 | Sin cambios visuales ni de comportamiento: el rediseño es QC-227 | R1, R2, R3, R4 |
| D3 | 2026-10-08 | **La credencial sale de QC-231** y va con QC-36. No se tocan `establecer-contrasena`, `credential-field` ni `credential-requirements`, salvo lo de D12 | R33 |
| D4 | 2026-10-08 | **La `DataTable` pinta ella misma cargando, error y vacío sin búsqueda**, y el estado sustituye a toda la tabla, barras incluidas. Si una lista no puede pasar su estado por la tabla sin cambiar el DOM, la sección pinta la pieza compartida directamente y la excepción se apunta por lista. **Deja sin efecto QC-56 D12 y R30** (enmienda) | R15, R16, R17, R18, R19, R20, R21, R32 |
| D5 | 2026-10-08 | El «sin resultados» de QC-56 D15 no cambia: sigue dentro de la tabla, con sus barras | R18 |
| D6 | 2026-10-08 | Las diferencias de marcado de `ErrorAlert` se conservan como props. La unificación visual va en QC-227 | R9, R10, R11, R12 |
| D7 | 2026-10-08 | Los vacíos y esqueletos de las 5 listas de asignación van en QC-232 | R7, R21, R33 |
| D8 | 2026-10-08 | Talla táctil en `Button` y **una** constante compartida en `lib/shared/ui` para lo demás. Se borran las constantes locales. Los 3 tests de contrato táctil se **enmiendan, no se borran** | R5, R6, R7, R8 |
| D9 | 2026-10-08 | El «cero cambio» se prueba con la comparación del árbol accesible en vitest, los E2E en CI y capturas antes/después con el seed demo (QC-230), revisadas por el reviewer | R1, R3, R4 |
| D10 | 2026-10-08 | El botón del login ya mide 44 px por el CSS de QC-30. El `SubmitButton` único entra igual, sin cambio visual | R1, R27 |
| D11 | 2026-10-08 (aprobación) | **Choque de archivos** con QC-217 y QC-223, que son de otra persona y están en vuelo: los 14 archivos D11 salen de QC-231 y pasan a QC-232. Las piezas se crean igual, pero su adopción en esos archivos es de QC-232. Ni el «cero cambio» ni los tests de esas pantallas dependen de tocar esos archivos | R7, R12, R20, R21, R23, R25, R29, R31, R33 |
| D12 | 2026-10-08 (aprobación) | El `SubmitButton` único **sí** se aplica en `establecer-contrasena`, pero solo en `components/submit-button.tsx` y en su import. No hay cambio visual y la credencial sigue fuera (D3) | R1, R26, R27, R33 |
| D13 | 2026-10-08 (aprobación) | `UserStatusBadge` y `WorkGroupRowActions` quedan **fuera** de la limpieza. Se rehacen en QC-227 y QC-232 | R31 |
| D14 | 2026-10-08 (aprobación) | QC-230 (seed demo) pasa a ser `depends_on` de QC-231. Las capturas «después» se hacen con su seed, y QC-230 se mergea antes del cierre | R3 |

## Glosario
- **Pantalla tocada:** toda ruta de `app/` con algún archivo en `tasks.md > Archivos esperados`.
- **Estado de lista:** cada una de estas cinco situaciones de una lista:
  - **filas:** hay datos;
  - **cargando:** el primer `fallback` mientras llegan los datos;
  - **vacío:** cero filas, sin búsqueda ni filtro;
  - **sin resultados:** cero filas, con búsqueda o filtro activos;
  - **error:** la consulta respondió con error.
- **Árbol accesible:** para cada elemento, su rol y su nombre accesible, sus estados ARIA, su
  `data-testid` y el conjunto de clases de su `className`.
- **Archivos D11:** los 14 archivos de la lista de arriba.

## Requisitos (EARS)

### Cero cambio

**R1.** El sistema DEBE presentar, en cada pantalla tocada y en cada uno de sus estados de lista, el
**mismo árbol accesible** antes y después de esta feature. Hay una **única** excepción: el
`SubmitButton` del login y el de establecer contraseña ganan las clases de la talla táctil. El
primero ya medía 44 px por el CSS de QC-30 y el segundo ya llevaba `min-h-11` y `w-full`, así que
ninguno de los dos cambia de forma visible (D10, D12).

**R2.** El sistema DEBE conservar el comportamiento de cada pantalla tocada:
- las acciones que ofrece;
- los destinos de navegación;
- lo que hace «Reintentar»;
- lo que se anuncia a la tecnología de asistencia;
- el foco al escribir en la búsqueda o en los filtros.

**R3.** Por cada captura de `_trabajo/marca/capturas-antes/` DEBE existir una captura «después» de la
misma pantalla, en el mismo estado y con los mismos datos del seed demo (QC-230, D14). El reviewer
DEBE dejar constancia de que no difieren.

**R4.** Los tests que ya existen DEBEN seguir pasando **sin cambiar lo que afirman**. Las únicas
excepciones son dos:
- **Los cambios de dónde importan:** un test pasa a importar la pieza compartida, o renderiza a
  través de la sección o la tabla, con las mismas aserciones y los mismos `data-testid`.
- **Las enmiendas declaradas** en R8 y R32.

Ningún test de una pantalla con archivos D11 DEBE necesitar que esos archivos cambien para seguir en
verde.

### Talla táctil

**R5.** `Button` y `buttonVariants` DEBEN ofrecer una talla táctil opcional, de al menos 44 × 44 px,
que se pueda combinar con cualquier `variant` y `size`. SI no se pide, ENTONCES el botón NO DEBE
cambiar ninguna de sus clases.

**R6.** El sistema DEBE definir en **una única** constante exportada la clase de talla táctil de los
controles que no son `Button`.

**R7.** Ningún archivo de producción de `app/`, `components/` o `hooks/` DEBE declarar una constante
local cuyo valor contenga el par `min-h-11 min-w-11`, ni escribir ese par como literal. Quedan fuera:
- la definición de la talla en `buttonVariants` y la constante de R6;
- `app/(public)/establecer-contrasena/**` (D3);
- los vacíos y esqueletos de las 5 listas de asignación (D7);
- los archivos D11.

**R8.** Los tests de contrato táctil `product-route-contract`, `recipe-route-contract` e
`importar-route-contract` DEBEN aceptar como talla válida de un control la talla de
`Button`/`buttonVariants` y la constante de R6. También DEBEN seguir fallando cuando un control que
la llevaba la pierde.

### `ErrorAlert`

**R9.** El sistema DEBE pintar desde **un único** componente compartido, `ErrorAlert`, la alerta de
un `ErrorState` con sus dos ramas: la del error inesperado y la del error de catálogo.

**R10.** CUANDO el error es el inesperado, `ErrorAlert` DEBE pintar `UnexpectedErrorNotice` con su
identificador. SI el error es de catálogo, ENTONCES DEBE pintar la rama que pida el consumidor (por
defecto, el mensaje) y NO DEBE pintar ningún identificador.

**R11.** `ErrorAlert` DEBE aceptar por props el `data-testid`, el `id`, las clases y el `role` del
contenedor, el `data-code`, y los `data-testid` y la forma del mensaje y del código. Así cada sitio
conserva su marcado (D6).

**R12.** Ningún archivo de producción DEBE contener la comparación con `UNEXPECTED_ERROR_CODE` para
decidir qué pintar, salvo `ErrorAlert` y `UnexpectedErrorNotice`. Quedan fuera
`app/(public)/establecer-contrasena/**` (D3), los archivos D11 y la lógica que no pinta.

### Piezas de estado

**R13.** El sistema DEBE ofrecer en `components/shared/` estas tres piezas, todas con sus
`data-testid` por props:
- **`EmptyState`:** el mensaje, la vuelta opcional a la primera página y un hueco para acciones;
- **`ErrorState`:** el título, un `ErrorAlert` y «Reintentar»;
- **`TableSkeleton`:** columnas, filas, columna de imagen opcional y etiqueta accesible.

**R14.** CUANDO se pulsa el «Reintentar» de `ErrorState`, el sistema DEBE hacer lo mismo que hacía la
lista de la que viene: volver a pedir los datos de la página actual, o navegar al destino que se le
indique.

**R15.** `TableSkeleton` DEBE pintar las filas y columnas que se le pidan y, DONDE se le pida, la
celda de imagen. También DEBE anunciarse como estado de carga (`role="status"`, `aria-busy`) con su
etiqueta accesible.

### La `DataTable` pinta sus estados

**R16.** MIENTRAS una lista que adopta los estados de la tabla está cargando, la `DataTable` DEBE
pintar `TableSkeleton` **en lugar de toda la tabla**: sin búsqueda, sin filtros, sin paginación y
sin ningún envoltorio que antes no existiera. Las filas DEBEN ser tantas como el tamaño de página
pedido.

**R17.** SI la consulta de una lista que adopta los estados de la tabla responde con error, ENTONCES
la `DataTable` DEBE pintar `ErrorState` en lugar de toda la tabla, con «Reintentar» y el
identificador del error inesperado. NO DEBE mostrar ningún dato de la lista.

**R18.** MIENTRAS una lista que adopta los estados de la tabla no tenga filas:
- si no hay búsqueda ni filtro activos, la `DataTable` DEBE pintar `EmptyState` en lugar de toda la
  tabla;
- si hay búsqueda o filtro activos, DEBE seguir pintando el «sin resultados» de QC-56 D15 dentro de
  la tabla y con sus barras.

**R19.** DONDE una pantalla no le pase configuración de estado, la `DataTable` DEBE comportarse
como hoy. QC-55 R19-R22 siguen vigentes sin cambios.

**R20.** Estas superficies NO tienen `DataTable` y DEBEN usar `EmptyState` o `ErrorState`
directamente:
- la vitrina de proveedores;
- las páginas de formulario de recetas que hoy usan `RecipeListError`;
- los errores previos de página.

Estos componentes locales se conservan por D11 y DEBEN delegar en las piezas compartidas sin cambiar
su firma:
- `order-list-empty`, `order-list-error` y `order-list-skeleton`;
- `AssignedOrdersError`.

**R21.** Al terminar, en `app/` NO DEBEN quedar estos componentes:
- ningún vacío, error ni esqueleto **local** de una lista que adopta los estados de la tabla;
- `RecipeListError`.

Se conservan, con su firma:
- `SupplierShowcaseSkeleton`;
- los vacíos y esqueletos de las 5 listas de asignación (D7);
- los tres de pedidos y `AssignedOrdersError` (D11).

Toda pantalla que no consiga R16-R18 sin cambiar el DOM DEBE figurar como excepción en
`progress/impl_QC-231-componentizacion-piezas-base.md` y pintar la pieza compartida desde su sección
(D4).

### `Spinner`

**R22.** El sistema DEBE pintar con un único `Spinner` compartido los 9 cargadores animados de
`app/` y `components/shared/`, y conservar en cada sitio el icono, el tamaño efectivo y
`aria-hidden`. `components/ui/sonner.tsx`, que es la copia de shadcn, queda fuera.

### Fecha y marca de ausente

**R23.** El sistema DEBE formatear la fecha civil de las celdas con **una única** función,
`formatCivilDate`. Para cualquier instante, esa función DEBE devolver el mismo `YYYY-MM-DD` que hoy
devuelve `toISOString().slice(0, 10)`, es decir, la fecha **UTC** del instante. Los archivos D11
quedan fuera.

**R24.** El sistema DEBE ofrecer `DateCell`, que pinta la fecha de R23 o, si no hay fecha, la marca de
R25, sin añadir ningún elemento al DOM.

**R25.** El sistema DEBE definir la marca de valor ausente (`—`) en **una única** constante,
`EMPTY_MARK`. Ningún archivo de producción de `app/` o `components/` DEBE declarar otra constante con
ese valor, salvo los archivos D11.

### `SubmitButton`

**R26.** El sistema DEBE ofrecer **un único** `SubmitButton` compartido para las pantallas públicas.
Ese botón:
- lee el estado de envío del `<form>` ancestro;
- se deshabilita y marca `aria-busy` mientras envía;
- muestra la etiqueta de pendiente que se le pase;
- lleva la talla táctil de R5;
- acepta el `data-testid` por props.

**R27.** El login DEBE usar el `SubmitButton` de R26 y su botón local DEBE desaparecer.
`establecer-contrasena` DEBE usarlo a través de su `components/submit-button.tsx`, que delega en el
compartido sin cambiar su nombre ni sus props (D12). Las dos pantallas DEBEN conservar su
`data-testid`, sus textos y su altura mínima de 44 px.

### `EntityImage`

**R28.** `EntityImage` DEBE aceptar un tamaño:
- **la miniatura de hoy:** es el defecto y no cambia;
- **el hueco del formulario de pedido:** cuadrado, de ancho completo, con la imagen contenida y
  fondo neutro.

En el segundo caso DEBE pintar exactamente el marcado de `OrderRecipeImage`:
- el `alt` «Sin receta elegida» cuando no hay nombre;
- el marcador cuando no hay imagen o la imagen falla;
- `data-testid="order-recipe-image"`;
- el remontaje al cambiar de receta.

**R29.** `OrderRecipeImage` DEBE delegar en `EntityImage` con el tamaño del hueco y conservar sus
exportaciones. Su borrado y el uso directo de `EntityImage` en el formulario de pedido quedan para
QC-232 (D11).

### Limpieza y arquitectura

**R30.** Cada pieza nueva DEBE vivir en su sitio:
- los componentes, en `components/shared/`;
- las constantes y funciones puras, en `lib/shared/ui/`;
- la talla de `Button`, en `components/ui/button.tsx`.

Ninguna DEBE añadir una dependencia a `package.json`.

**R31.** Al terminar NO DEBEN existir:
- `createUrlPageFetcher`;
- las reexportaciones de `formatDateLocalISO` en `data-table-filter-date.tsx` y en
  `product-batch-date-field.tsx`;
- las constantes `MISSING_VALUE_MARK` y `EMPTY_CELL`, salvo en los archivos D11;
- las reexportaciones de `IMAGE_COLUMN_LABEL` y `ACTIONS_COLUMN_LABEL` en el barrel de `inventario`.

Los tests que las importaban DEBEN importar la fuente de verdad. `UserStatusBadge` y
`WorkGroupRowActions` NO se tocan (D13).

**R32.** La enmienda de QC-56 D12 y R30 DEBE quedar escrita, con fecha, en
`specs/QC-56-migrar-listas-a-tabla-compartida/requirements.md` y en el caso de
`tests/unit/shared/migracion-listas-alcance.test.ts:228`.

**R33.** El diff de la rama NO DEBE tocar:
- los archivos D11;
- `components/shared/credential-field.tsx` ni `components/shared/credential-requirements.tsx`;
- ningún archivo de `app/(public)/establecer-contrasena/**` salvo `components/submit-button.tsx`;
- los vacíos y esqueletos de las 5 listas de asignación.

## Preguntas abiertas

*(ninguna: P1–P6 y las tres posteriores al spec quedaron cerradas en D3–D14)*
