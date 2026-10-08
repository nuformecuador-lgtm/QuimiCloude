# QC-231 — componentizacion-piezas-base · requirements

| key | zona | complexity | rama |
|---|---|---|---|
| QC-231 | frontend | medium | `feature/QC-231-componentizacion-piezas-base` |

## Alcance (issue QC-231, acotado por el humano el 2026-10-08)

Es una refactorización. Extrae a piezas compartidas lo que hoy está copiado en muchos sitios, y
**no cambia nada visual ni de comportamiento**: el rediseño es QC-227.

- **Talla táctil (44 px).**
  - `Button` y `buttonVariants` ganan la talla.
  - Para los controles que no son `Button` hay **una** constante compartida.
  - Se borran las ~101 constantes `TOUCH_TARGET` locales y los literales `min-h-11 min-w-11`.
- **`ErrorAlert`:** la alerta con la rama de error inesperado (59 usos en 57 archivos).
- **Estados de lista.**
  - Piezas compartidas `EmptyState`, `ErrorState` (con «Reintentar») y `TableSkeleton`.
  - La `DataTable` pinta ella misma cargando, error y vacío sin búsqueda, sustituyendo a toda la
    tabla.
  - Se borran los `*-list-empty`, `*-list-error` y `*-skeleton` locales de las listas que no son de
    asignación.
  - Se sustituyen `RecipeListError` y `AssignedOrdersError`.
- **`Spinner`:** los 9 cargadores.
- **Fechas y marca de ausente:** `formatCivilDate` / `DateCell` y una sola `EMPTY_MARK`.
- **`SubmitButton`:** uno público, compartido y con talla táctil, usado por el login.
- **Imagen del pedido:** `OrderRecipeImage` pasa a ser `EntityImage` con `size`.
- **Limpieza:** se borran `createUrlPageFetcher` y los exports muertos de `app/` que enumera R31.

### Lo que NO entra
- **La credencial.** No se tocan `app/(public)/establecer-contrasena/**`,
  `components/shared/credential-field.tsx` ni `components/shared/credential-requirements.tsx`.
  Va con QC-36 (D3).
- **Los vacíos y esqueletos de las 5 listas de asignación** (`assigned`, `company`, `finished`,
  `conditioning`, `packing`): van en QC-232 (D7).
- **Formularios en Sheet, borrados, campos y acciones por fila:** QC-232.
- **Buscadores:** QC-233.
- **Cualquier cambio visual,** incluida la unificación de las diferencias de marcado de las
  alertas: QC-227 (D6).
- **Las copias de `toISOString().slice(0, 10)` dentro de `lib/modules/**`:** `domain/` no puede
  importar `lib/shared/`.

## Decisiones cerradas (no reabrir)

| # | Fecha | Decisión | Requisitos |
|---|---|---|---|
| D1 | 2026-10-08 | La auditoría se reparte en QC-231 (piezas base), QC-232 (formularios, borrados, campos y acciones) y QC-233 (buscadores), todas antes de QC-227 | R30, R33 |
| D2 | 2026-10-08 | Sin cambios visuales ni de comportamiento: el rediseño es QC-227 | R1, R2, R3, R4 |
| D3 | 2026-10-08 (P1) | **La credencial sale de QC-231** y va con QC-36 (cambiar mi contraseña). QC-231 no toca `establecer-contrasena`, `credential-field` ni `credential-requirements` | R33 |
| D4 | 2026-10-08 (P2) | **Una sola `DataTable` para los estados.** Pinta ella misma cargando, error y vacío sin búsqueda, y el estado **sustituye a toda la tabla, barras incluidas**. Si una lista no puede pasar su estado por la tabla sin cambiar el DOM, la sección pinta la pieza compartida directamente y la excepción se apunta por lista. **Deja sin efecto QC-56 D12 y R30** (enmienda) | R15, R16, R17, R18, R19, R20, R21, R32 |
| D5 | 2026-10-08 (P2) | El «sin resultados» de QC-56 D15 no cambia: sigue dentro de la tabla, con sus barras | R18 |
| D6 | 2026-10-08 (P3) | Las diferencias de marcado de `ErrorAlert` se conservan como props. La unificación visual va en QC-227 | R9, R10, R11, R12 |
| D7 | 2026-10-08 (P5) | Los vacíos y esqueletos de las 5 listas de asignación van en QC-232. `AssignedOrdersError` sí se sustituye aquí (lo dice el issue) | R20, R21 |
| D8 | 2026-10-08 (P4) | **Talla táctil en `Button`** y, para lo que no es `Button`, **una** constante compartida en `lib/shared/ui`. Se borran las constantes locales. Los 3 tests de contrato táctil se **enmiendan, no se borran** | R5, R6, R7, R8 |
| D9 | 2026-10-08 (P6) | **Cómo se prueba el «cero cambio»:** comparación del árbol accesible en vitest, los E2E en CI y capturas antes/después de las mismas pantallas con el seed demo (QC-230), revisadas por el reviewer | R1, R3, R4 |
| D10 | 2026-10-08 (hallazgo) | El botón del login ya mide 44 px por el CSS de QC-30. El `SubmitButton` único entra igual, sin cambio visual | R27 |

## Glosario
- **Pantalla tocada:** toda ruta de `app/` con algún archivo en `tasks.md > Archivos esperados`.
- **Estado de lista:** cada una de las cinco situaciones de una lista:
  - **filas:** hay datos;
  - **cargando:** el primer `fallback` mientras llegan los datos;
  - **vacío:** cero filas, sin búsqueda ni filtro;
  - **sin resultados:** cero filas, con búsqueda o filtro activos;
  - **error:** la consulta respondió con error.
- **Árbol accesible:** por cada elemento:
  - su rol y su nombre accesible;
  - sus estados ARIA (`aria-busy`, `aria-pressed`, `aria-expanded`…);
  - su `data-testid`;
  - el conjunto de clases de su `className`.

## Requisitos (EARS)

### Cero cambio

**R1.** El sistema DEBE presentar, en cada pantalla tocada y en cada uno de sus estados de lista, el
**mismo árbol accesible** antes y después de esta feature.

Hay una única excepción: el `SubmitButton` del login gana las clases de talla táctil (R26). Su altura
ya era de 44 px por el CSS de QC-30, así que no cambia nada visible (D10).

**R2.** El sistema DEBE conservar el comportamiento de cada pantalla tocada, sin cambiar ninguno de
estos puntos:
- las acciones que ofrece;
- los destinos de navegación;
- lo que hace «Reintentar»;
- lo que se anuncia a la tecnología de asistencia;
- el foco al escribir en la búsqueda o en los filtros.

**R3.** Por cada captura de `_trabajo/marca/capturas-antes/` DEBE existir una captura «después» de la
misma pantalla, en el mismo estado y con los mismos datos del seed demo (QC-230), y el reviewer DEBE
dejar constancia de que no difieren.

**R4.** Los tests que ya existen DEBEN seguir pasando **sin cambiar lo que afirman**. Hay dos tipos
de excepción permitidos:
- Los cambios de **dónde importan**: un test que importaba una pieza local borrada pasa a importar la
  compartida, o a renderizar a través de la sección o la tabla, con las mismas aserciones y los
  mismos `data-testid`.
- Las **enmiendas declaradas** en R8 y R32.

### Talla táctil

**R5.** `Button` y `buttonVariants` DEBEN ofrecer una talla táctil opcional que garantice un área
mínima de 44 × 44 px, y combinarla con cualquier `variant` y `size`. SI no se pide, ENTONCES el
botón NO DEBE cambiar ninguna de sus clases.

**R6.** El sistema DEBE definir la clase de talla táctil para los controles que no son `Button`
(disparadores de select, campos, enlaces sin `buttonVariants`, contenedores interactivos) en **una
única** constante exportada.

**R7.** Ningún archivo de producción en `app/`, `components/` o `hooks/` DEBE declarar una constante
local cuyo valor contenga el par `min-h-11 min-w-11`, ni escribir ese par como literal, salvo en
estos sitios:
- la definición de la talla de `buttonVariants` y la constante de R6;
- `app/(public)/establecer-contrasena/**`, que queda fuera por D3;
- los vacíos y esqueletos de las 5 listas de asignación, que quedan fuera por D7 (los migra QC-232).

**R8.** Los tests de contrato táctil `product-route-contract`, `recipe-route-contract` e
`importar-route-contract` DEBEN:
- aceptar como talla válida de un control la talla de `Button`/`buttonVariants` y la constante de R6;
- seguir fallando cuando un control que la llevaba la pierde.

### `ErrorAlert`

**R9.** El sistema DEBE pintar desde **un único** componente compartido, `ErrorAlert`, la alerta de
un `ErrorState` con sus dos ramas: la del error inesperado y la del error de catálogo.

**R10.** CUANDO el error es el inesperado, `ErrorAlert` DEBE pintar `UnexpectedErrorNotice`, con su
identificador. SI el error es de catálogo, ENTONCES DEBE pintar la rama de catálogo que pida el
consumidor (por defecto, el mensaje) y NO DEBE pintar ningún identificador.

**R11.** `ErrorAlert` DEBE aceptar por props estas piezas del marcado, de modo que cada sitio
conserve el suyo (D6):
- el `data-testid`, el `id`, las clases y el `role` del contenedor;
- `data-code`;
- los `data-testid` y la forma del mensaje y del código.

**R12.** Ningún archivo de producción, salvo `ErrorAlert` y `UnexpectedErrorNotice`, DEBE contener
la comparación con `UNEXPECTED_ERROR_CODE` para decidir qué pintar. Quedan fuera
`app/(public)/establecer-contrasena/**` (D3) y la lógica que no pinta.

### Piezas de estado

**R13.** El sistema DEBE ofrecer en `components/shared/` tres piezas, todas con `data-testid` por
props:
- **`EmptyState`:** el mensaje, la vuelta opcional a la primera página y un hueco para acciones;
- **`ErrorState`:** el título, un `ErrorAlert` y «Reintentar»;
- **`TableSkeleton`:** columnas, filas, columna de imagen opcional y etiqueta accesible.

**R14.** CUANDO se pulsa el «Reintentar» de `ErrorState`, el sistema DEBE hacer lo mismo que hacía la
lista de la que viene: volver a pedir los datos de la página actual, o navegar al destino que se le
indique.

**R15.** `TableSkeleton` DEBE pintar tantas filas como se le pidan, tantas columnas como se le
indiquen y, DONDE se le pida, la celda de imagen. Además DEBE anunciarse como estado de carga
(`role="status"`, `aria-busy`) con su etiqueta accesible.

### La `DataTable` pinta sus estados

**R16.** MIENTRAS una lista con `DataTable` carga, la tabla DEBE pintar `TableSkeleton` **en lugar
de toda la tabla**: sin barra de búsqueda, sin filtros, sin paginación y sin ningún envoltorio que
antes no existiera. Las filas del esqueleto DEBEN coincidir con el tamaño de página pedido.

**R17.** SI la consulta de una lista con `DataTable` responde con error, ENTONCES la tabla DEBE pintar
`ErrorState` en lugar de toda la tabla, con «Reintentar» y con el identificador del error
inesperado, y NO DEBE mostrar ningún dato de la lista.

**R18.** El vacío y el «sin resultados» se pintan así:
- MIENTRAS una lista con `DataTable` no tenga filas y no haya búsqueda ni filtro activos, la tabla
  DEBE pintar `EmptyState` en lugar de toda la tabla.
- MIENTRAS no tenga filas y sí haya búsqueda o filtro activos, DEBE seguir pintando el «sin
  resultados» de QC-56 D15 dentro de la tabla y con sus barras.

**R19.** DONDE una pantalla no pase configuración de estado a la `DataTable`, la tabla DEBE
comportarse como hoy, y QC-55 R19-R22 siguen vigentes sin cambios.

**R20.** Estas superficies NO tienen `DataTable` y DEBEN usar `EmptyState` y `ErrorState`
directamente:
- la vitrina de proveedores;
- las páginas de formulario de recetas que hoy usan `RecipeListError`;
- los errores previos de página (los datos que la página necesita antes de pintar la lista);
- las secciones de asignación que hoy usan `AssignedOrdersError` (D7).

**R21.** Al terminar, en `app/` NO DEBE quedar ninguno de estos componentes:
- un vacío, error o esqueleto **local** de una lista con `DataTable`;
- `RecipeListError`;
- `AssignedOrdersError`.

Se conservan solo `SupplierShowcaseSkeleton` y los vacíos y esqueletos de las 5 listas de
asignación (D7). Toda pantalla que no consiga R16 a R18 sin cambiar el DOM DEBE figurar como
excepción en `progress/impl_QC-231-componentizacion-piezas-base.md` y pintar la pieza compartida
desde su sección (D4).

### `Spinner`

**R22.** El sistema DEBE pintar los 9 cargadores animados de `app/` y `components/shared/` con un
único `Spinner` compartido, que conserve el icono, el tamaño efectivo y el `aria-hidden` de cada
sitio. `components/ui/sonner.tsx` queda fuera, porque es la copia de shadcn.

### Fechas y marca de ausente

**R23.** El sistema DEBE formatear la fecha civil de las celdas con **una única** función,
`formatCivilDate`. Esa función DEBE devolver, para cualquier instante, el mismo `YYYY-MM-DD` que
devuelve hoy `toISOString().slice(0, 10)`, es decir la fecha **UTC** del instante.

**R24.** El sistema DEBE ofrecer `DateCell`, que pinta la fecha de R23 o, si no hay fecha, la marca
de R25, sin añadir ningún elemento al DOM.

**R25.** El sistema DEBE definir la marca de valor ausente (`—`) en **una única** constante,
`EMPTY_MARK`. Ningún archivo de producción en `app/` o `components/` DEBE declarar otra constante
con ese valor.

### `SubmitButton`

**R26.** El sistema DEBE ofrecer **un único** `SubmitButton` compartido para las pantallas públicas.
Este botón:
- lee el estado de envío del `<form>` ancestro;
- se deshabilita y marca `aria-busy` mientras envía;
- muestra la etiqueta de pendiente que se le pase;
- lleva la talla táctil de R5;
- acepta el `data-testid` por props.

**R27.** El login DEBE usar el `SubmitButton` de R26, conservar `data-testid="login-submit"` y sus
textos, y seguir midiendo al menos 44 px. Su borrador local DEBE desaparecer.

### `EntityImage`

**R28.** `EntityImage` DEBE aceptar un tamaño:
- **la miniatura de hoy**, que es el defecto: 60 × 60 px, sin cambios;
- **el hueco del formulario de pedido**: cuadrado, ancho completo, imagen contenida y fondo neutro.

En el segundo caso DEBE pintar exactamente el marcado de `OrderRecipeImage`:
- el `alt` «Sin receta elegida» cuando no hay nombre;
- el marcador cuando no hay imagen o la imagen falla;
- `data-testid="order-recipe-image"`;
- el remontaje al cambiar de receta, para que una imagen rota no deje el marcador en la siguiente.

**R29.** `OrderRecipeImage` y su archivo NO DEBEN existir, y el formulario de pedido DEBE usar
`EntityImage` con ese tamaño.

### Limpieza y arquitectura

**R30.** Las piezas nuevas DEBEN vivir así:
- **componentes:** en `components/shared/`;
- **constantes y funciones puras:** en `lib/shared/ui/`;
- **la talla de `Button`:** en `components/ui/button.tsx`.

Además, ninguna pieza nueva DEBE añadir una dependencia a `package.json`.

**R31.** NO DEBEN existir:
- `createUrlPageFetcher`;
- las reexportaciones de `formatDateLocalISO` en `data-table-filter-date.tsx` y
  `product-batch-date-field.tsx`;
- las constantes `MISSING_VALUE_MARK` y `EMPTY_CELL`;
- las reexportaciones de `IMAGE_COLUMN_LABEL` y `ACTIONS_COLUMN_LABEL` en el barrel de `inventario`.

Los tests que las importaban DEBEN importar la fuente de verdad.

**R32.** Las enmiendas a specs cerrados DEBEN quedar escritas, con fecha, en el spec que enmiendan y
en el test que lo vigila:
- **QC-56 D12 y R30:** `tests/unit/shared/migracion-listas-alcance.test.ts:228`.
- **Las anclas del barrel de pedidos de QC-102 R41:** `tests/guards/guard-pantalla-pedidos-se-amplia.test.ts`.

  Las anclas borradas DEBEN ser exactamente estas:
  - `OrderListEmpty`, `OrderListError` y `OrderListSkeleton`;
  - `OrderRecipeImage`, `OrderRecipeImageProps` y `ORDER_RECIPE_IMAGE_TESTID`, salvo las que se
    conserven.

**R33.** El diff de la rama NO DEBE tocar ninguno de estos archivos:
- `app/(public)/establecer-contrasena/**`;
- `components/shared/credential-field.tsx`;
- `components/shared/credential-requirements.tsx`;
- los vacíos y esqueletos de las 5 listas de asignación.

## Preguntas abiertas

1. **`SubmitButton` «único» frente a D3.** El otro `SubmitButton` público vive en
   `app/(public)/establecer-contrasena/[token]/components/submit-button.tsx`, que D3 deja fuera. Con
   D3 al pie de la letra, el compartido nace con un solo consumidor, el login, y el de establecer
   queda para QC-36.
   - **Así está escrito el spec (R26, R27, R33).**
   - Si el humano prefiere que QC-231 cambie solo ese archivo y su import en `set-credential-form.tsx`,
     se quita esa ruta de R33 y se añade a R26.
2. **`UserStatusBadge` y `WorkGroupRowActions`.** La auditoría los da por muertos, pero los renderizan
   directamente cuatro tests:
   - `user-status-dialog.test.tsx:103`;
   - `end-user-sessions-dialog.test.tsx:134`;
   - `delete-user-dialog.test.tsx:109`;
   - `work-group-columns.test.tsx:259-285`.

   Además los rehacen QC-227 (badges de estado) y QC-232 (acciones por fila). **El spec los deja
   fuera de R31.** ¿Se confirma?
3. **QC-230 está `pending`.** R3 necesita su seed para las capturas. ¿Se anota QC-230 como
   `depends_on` de QC-231 en el board? Si no, la tanda de capturas (T13) bloquea el cierre hasta que
   QC-230 se mergee.
